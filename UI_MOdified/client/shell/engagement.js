/* ============================================================================
 * engagement.js — RMOOZ PR-ENG1: engagement rules (FC channels → WRA → salvo)
 * ----------------------------------------------------------------------------
 * Direction reset 2026-06-01 ([[project_rmooz_direction_reset]]): mimic CMO's
 * engagement BEHAVIOUR with public rules + OUR class values. Consumes the
 * contacts from detection.js (DET1) and the CMO-style component shape on units
 * (weapons[] / magazines[]). "Feel alive": shots fire, magazines deplete, and
 * every NON-shot has an explainable reason (auditable — feeds DOC1 / AI COA).
 *
 * RULES (the "whether a weapon fires" chain, public; values are ours):
 *   1. DETECTION   — target must be a known contact for the shooter's side.
 *   2. WRA / ROE   — weapon not on HOLD; engagement permitted for target class.
 *   3. RANGE       — within the WRA range mode (max / 75% / NEZ≈50%).
 *   4. AMMO        — magazine for the mount has stock (else "winchester").
 *   5. FIRE CONTROL— a fire-control channel is free (point-defense is autonomous,
 *                    no channel needed). Channels = Σ fire_control sensor.channels.
 *   6. SALVO/Pk    — fire `salvo` rounds; P(kill) = 1−(1−Pk)^salvo (CMO salvo math).
 *
 * Every candidate yields a record { status:'engaged'|'blocked', reason, … } so
 * the UI / AI can explain exactly why each engagement did or didn't happen.
 *
 * SAFETY: pure — clones magazine state, never mutates the input world state.
 * Framework-free (browser + Node). Future personnel/maintenance reliability
 * ([[project_personnel_maintenance_reliability_future]]) plugs in as a Pk
 * multiplier + a crew/availability gate — not implemented now.
 * ========================================================================== */
(function (root) {
    'use strict';

    var ENG_VERSION = '1.0.0-eng1';

    /* ---- RMOOZ DB-Lite weapon seed (OUR values, illustrative) ------------- */
    var DEFAULT_WPN_DB = {
        weapon_class: {
            long_range_sam:  { max_range_nm: 80, pk: 0.70, salvo: 2, autonomous: false, vs: ['air'] },
            medium_sam:      { max_range_nm: 30, pk: 0.65, salvo: 2, autonomous: false, vs: ['air'] },
            point_defense:   { max_range_nm: 5,  pk: 0.45, salvo: 1, autonomous: true,  vs: ['air','missile'] },
            anti_ship:       { max_range_nm: 75, pk: 0.55, salvo: 2, autonomous: false, vs: ['sea'] },
            gun:             { max_range_nm: 12, pk: 0.30, salvo: 3, autonomous: true,  vs: ['ground','sea'] }
        }
    };
    var RANGE_MODE_FACTOR = { max: 1.0, '75pct': 0.75, nez: 0.5 };

    /* ---- helpers ---------------------------------------------------------- */
    function nmBetween(a, b) {
        if (root.AppWorldState && typeof root.AppWorldState._nmBetween === 'function') return root.AppWorldState._nmBetween(a, b);
        if (!a || !b) return null;
        var toR = Math.PI / 180, R = 3440.065;
        var dLat = (b[1] - a[1]) * toR, dLon = (b[0] - a[0]) * toR, lat1 = a[1] * toR, lat2 = b[1] * toR;
        var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
    }
    function wpnDef(weapon, db) {
        var d = (weapon && db.weapon_class[weapon.class]) || null;
        return d || { max_range_nm: 0, pk: 0, salvo: 1, autonomous: false, vs: [] };
    }
    function fcChannels(unit) {
        return (unit.sensors || []).reduce(function (n, s) {
            var isFc = s && (s.class === 'fire_control' || s.subtype === 'fire_control');
            return n + (isFc ? (Number.isFinite(s.channels) ? s.channels : 1) : 0);
        }, 0);
    }
    function magFor(magClone, mountId) {
        for (var i = 0; i < magClone.length; i++) if (magClone[i].mount === mountId) return magClone[i];
        return null;
    }
    function stockKey(weapon) { return weapon.type || weapon.class || 'rounds'; }
    function pkSalvo(pk, salvo) { return 1 - Math.pow(1 - pk, Math.max(1, salvo)); }

    /* ---- main: compute the engagements this tick -------------------------- */
    function computeEngagements(worldState, contacts, opts) {
        opts = opts || {};
        var db = opts.db || DEFAULT_WPN_DB;
        var ws = worldState || {};
        var units = Array.isArray(ws.units) ? ws.units : [];
        contacts = Array.isArray(contacts) ? contacts : [];

        // detection lookup: detecting side → { target_uid: true }
        var seen = {};
        contacts.forEach(function (c) {
            if (!c.detected_by_side) return;
            (seen[c.detected_by_side] = seen[c.detected_by_side] || {})[c.target_uid] = c;
        });
        var byUid = {}; units.forEach(function (u) { if (u && u.uid) byUid[u.uid] = u; });

        var out = [];
        units.forEach(function (shooter) {
            if (!shooter || !shooter.position || !Array.isArray(shooter.weapons) || !shooter.weapons.length) return;
            var mags = JSON.parse(JSON.stringify(shooter.magazines || []));   // clone — never mutate input
            var channels = fcChannels(shooter);
            var knownToSide = seen[shooter.side] || {};

            shooter.weapons.forEach(function (w) {
                var def = wpnDef(w, db);
                var wra = w.wra || {};
                var mode = wra.mode || 'max';
                var salvo = Number.isFinite(wra.salvo) ? wra.salvo : def.salvo;
                var effRange = def.max_range_nm * (RANGE_MODE_FACTOR[mode] != null ? RANGE_MODE_FACTOR[mode] : 1);

                // candidate targets = enemy units this side has DETECTED, in weapon's domain set, nearest first
                var cands = units.filter(function (t) {
                    return t && t !== shooter && t.position && t.side !== shooter.side &&
                           knownToSide[t.uid] &&
                           (!def.vs.length || def.vs.indexOf(t.domain) >= 0);
                }).map(function (t) { return { t: t, range: nmBetween(shooter.position, t.position) }; })
                  .sort(function (a, b) { return a.range - b.range; });

                cands.forEach(function (c) {
                    var rec = { shooter: shooter.uid, side: shooter.side, weapon: w.id || w.class,
                                target: c.t.uid, range_nm: +(c.range || 0).toFixed(1),
                                max_range_nm: +effRange.toFixed(1), status: 'blocked', reason: null };

                    if (wra.hold) { rec.reason = 'weapons_hold'; out.push(rec); return; }
                    if (c.range > effRange) { rec.reason = 'out_of_range'; out.push(rec); return; }

                    var mag = magFor(mags, w.mount);
                    var key = stockKey(w);
                    var have = mag && mag.stock && Number(mag.stock[key]) || 0;
                    if (have <= 0) { rec.reason = 'winchester'; out.push(rec); return; }

                    if (!def.autonomous) {
                        if (channels <= 0) { rec.reason = 'no_fire_control_channel'; out.push(rec); return; }
                        channels -= 1;
                    }
                    // FIRE
                    var fired = Math.min(salvo, have);
                    mag.stock[key] = have - fired;
                    rec.status = 'engaged'; rec.reason = null;
                    rec.salvo = fired; rec.pk_single = def.pk;
                    rec.pk_kill = +pkSalvo(def.pk, fired).toFixed(3);
                    rec.rounds_remaining = mag.stock[key];
                    out.push(rec);
                });
            });
        });
        return out;
    }

    var api = {
        ENG_VERSION: ENG_VERSION,
        DEFAULT_WPN_DB: DEFAULT_WPN_DB,
        RANGE_MODE_FACTOR: RANGE_MODE_FACTOR,
        computeEngagements: computeEngagements,
        pkSalvo: pkSalvo
    };
    root.AppEngagement = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
