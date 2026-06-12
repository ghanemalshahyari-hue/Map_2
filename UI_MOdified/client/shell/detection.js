/* ============================================================================
 * detection.js — RMOOZ PR-DET1: detection rules (radar horizon + RCS + EMCON)
 * ----------------------------------------------------------------------------
 * Direction reset 2026-06-01 ([[project_rmooz_direction_reset]]): mimic CMO's
 * detection BEHAVIOUR with PUBLIC physics formulas keyed on OUR class values —
 * not CMO data. This is a "feel alive" engine: contacts appear/fade as units
 * move, change altitude, or set EMCON.
 *
 * Operates on a World State snapshot (see world-state.js). Units carry the
 * CMO-style component shape: sensors[] (each {type,subtype,class,emcon}) and an
 * rcs_class. computeContacts() returns the contacts[] each side would hold.
 *
 * FORMULAS (all public; values are ours / illustrative, in RMOOZ DB-Lite):
 *   - Radar horizon (geometric):  R_h(nm) = 1.23·(√h_sensor_ft + √h_target_ft)
 *   - RCS range scaling (radar eq, power ∝ σ/R⁴ → range ∝ σ^¼):
 *                                 R_det = R_ref · (σ / σ_ref)^¼
 *   - Effective range:            R_eff = min(R_det, R_h)
 *   - EMCON:                      a radar detects only while emitting (active);
 *                                 a passive ESM detects an EMITTING radar at
 *                                 ≈1.5× that radar's reference range.
 *   - LOS:                        terrain-mask hook (clear by default — DET2).
 *
 * SAFETY: pure data, no DOM/fetch/mutation; framework-free (browser + Node).
 * Future personnel/maintenance fields ([[project_personnel_maintenance_reliability_future]])
 * plug in here as reliability × detection multipliers — not implemented now.
 * ========================================================================== */
(function (root) {
    'use strict';

    var DET_VERSION = '1.0.0-det1';

    /* ---- RMOOZ DB-Lite seed (OUR class values, public/illustrative) ------- */
    var DEFAULT_DB = {
        sigma_ref_m2: 5,                       // reference RCS for range scaling
        sensor_class: {                        // ref_range_nm = clean-air detect range vs σ_ref target
            long_range_3d:  { type: 'radar', ref_range_nm: 200 },
            multifunction:  { type: 'radar', ref_range_nm: 150 },
            air_search:     { type: 'radar', ref_range_nm: 160 },
            surface_search: { type: 'radar', ref_range_nm: 60  },
            fire_control:   { type: 'radar', ref_range_nm: 90  },
            esm_intercept:  { type: 'esm',   ref_range_nm: 0   },   // passive: see rule below
            // Phase 5D-1: Soviet air-defense variant sensor classes
            S300_SEARCH_RADAR: { type: 'radar', ref_range_nm: 108 },  // ~200 km strategic SAM search
            S75_RADAR:         { type: 'radar', ref_range_nm: 40  },  // ~75 km tactical SAM search
            ZSU_RADAR:         { type: 'radar', ref_range_nm: 21  },  // ~40 km AAA gun radar
            P37_RADAR:         { type: 'radar', ref_range_nm: 135 },  // ~250 km strategic early-warning
            AAA_RADAR:         { type: 'radar', ref_range_nm: 8   }   // ~15 km generic AAA search
        },
        rcs_class: {                           // σ in m² (our values)
            very_large: { sigma_m2: 1000 },    // ship / large structure
            large:      { sigma_m2: 100 },
            medium:     { sigma_m2: 10 },       // typical 4th-gen aircraft
            small:      { sigma_m2: 1 },        // small craft / cruise missile
            stealth:    { sigma_m2: 0.05 }
        },
        // default sensor altitude (ft) by domain, used in the horizon formula
        alt_ft_by_domain: { air: 30000, sea: 60, ground: 30, strategic: 60 },
        // default RCS class by domain when a unit doesn't declare one
        rcs_by_domain: { air: 'medium', sea: 'very_large', ground: 'small', strategic: 'large' }
    };

    /* ---- helpers ---------------------------------------------------------- */
    function nmBetween(a, b) {
        if (root.AppWorldState && typeof root.AppWorldState._nmBetween === 'function') {
            return root.AppWorldState._nmBetween(a, b);
        }
        if (!a || !b) return null;
        var toR = Math.PI / 180, R = 3440.065;
        var dLat = (b[1] - a[1]) * toR, dLon = (b[0] - a[0]) * toR;
        var lat1 = a[1] * toR, lat2 = b[1] * toR;
        var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
    }
    function radarHorizonNm(hSensorFt, hTargetFt) {
        var a = Math.sqrt(Math.max(0, hSensorFt || 0));
        var b = Math.sqrt(Math.max(0, hTargetFt || 0));
        return 1.23 * (a + b);
    }
    function rcsDetectRangeNm(refRangeNm, sigmaM2, sigmaRefM2) {
        if (!refRangeNm || !sigmaM2 || !sigmaRefM2) return 0;
        return refRangeNm * Math.pow(sigmaM2 / sigmaRefM2, 0.25);
    }
    function altFt(unit, db) {
        if (unit && typeof unit.altitude_ft === 'number') return unit.altitude_ft;
        var dom = (unit && unit.domain) || 'ground';
        return (db.alt_ft_by_domain[dom] != null) ? db.alt_ft_by_domain[dom] : 30;
    }
    function sigmaOf(unit, db) {
        var cls = (unit && unit.rcs_class) ||
                  (db.rcs_by_domain[(unit && unit.domain) || 'ground']) || 'medium';
        var entry = db.rcs_class[cls];
        return entry ? entry.sigma_m2 : db.rcs_class.medium.sigma_m2;
    }
    function sensorRef(sensor, db) {
        if (sensor && typeof sensor.ref_range_nm === 'number' && sensor.ref_range_nm > 0) return sensor.ref_range_nm;
        var c = sensor && db.sensor_class[sensor.class];
        return c ? c.ref_range_nm : 0;
    }
    function sensorType(sensor, db) {
        if (sensor && sensor.type) return sensor.type;
        var c = sensor && db.sensor_class[sensor.class];
        return c ? c.type : 'radar';
    }
    function emitting(sensor) { return !sensor || sensor.emcon == null || sensor.emcon === 'active'; }
    function confidenceFor(range, reff) {
        if (range > reff) return null;
        return (range <= 0.6 * reff) ? 'firm' : 'tentative';
    }

    /* ---- main: compute the contacts each side holds ----------------------- */
    function computeContacts(worldState, opts) {
        opts = opts || {};
        var db = opts.db || DEFAULT_DB;
        var ws = worldState || {};
        var units = Array.isArray(ws.units) ? ws.units : [];
        var losBlocked = (typeof opts.losBlocked === 'function') ? opts.losBlocked : null; // DET2 hook
        var best = {};   // key: detSide|targetUid → contact (keep the firmest/closest)

        function consider(c) {
            var k = c.detected_by_side + '|' + c.target_uid;
            var cur = best[k];
            if (!cur || c.range_nm < cur.range_nm) best[k] = c;
        }

        for (var i = 0; i < units.length; i++) {
            var obs = units[i];
            if (!obs || !obs.position || !Array.isArray(obs.sensors) || !obs.sensors.length) continue;

            for (var j = 0; j < units.length; j++) {
                var tgt = units[j];
                if (!tgt || tgt === obs || !tgt.position) continue;
                if (tgt.side && obs.side && tgt.side === obs.side) continue;   // own side
                if (losBlocked && losBlocked(obs, tgt)) continue;

                var range = nmBetween(obs.position, tgt.position);
                if (range == null) continue;
                var hObs = altFt(obs, db), hTgt = altFt(tgt, db);
                var horizon = radarHorizonNm(hObs, hTgt);

                for (var s = 0; s < obs.sensors.length; s++) {
                    var sen = obs.sensors[s];
                    var stype = sensorType(sen, db);

                    if (stype === 'radar') {
                        if (!emitting(sen)) continue;                  // EMCON: silent radar can't detect
                        var sigma = sigmaOf(tgt, db);
                        var rdet = rcsDetectRangeNm(sensorRef(sen, db), sigma, db.sigma_ref_m2);
                        var reff = Math.min(rdet, horizon);
                        var conf = confidenceFor(range, reff);
                        if (!conf) continue;
                        consider({
                            target_uid: tgt.uid, detected_by_side: obs.side || null,
                            by_unit: obs.uid, by_sensor: sen.id || sen.class || 'radar',
                            method: 'radar', range_nm: +range.toFixed(1), max_range_nm: +reff.toFixed(1),
                            confidence: conf,
                            classification: conf === 'firm' ? (tgt.role || tgt.domain || 'unknown') : 'unknown'
                        });
                    } else if (stype === 'esm') {
                        // passive: detect a target that has an EMITTING radar, at ~1.5× its ref range
                        var emitter = (tgt.sensors || []).filter(function (x) {
                            return sensorType(x, db) === 'radar' && emitting(x);
                        }).map(function (x) { return sensorRef(x, db); }).sort(function (a, b) { return b - a; })[0];
                        if (!emitter) continue;
                        var resm = Math.min(1.5 * emitter, horizon);
                        if (range > resm) continue;
                        consider({
                            target_uid: tgt.uid, detected_by_side: obs.side || null,
                            by_unit: obs.uid, by_sensor: sen.id || 'esm',
                            method: 'esm', range_nm: +range.toFixed(1), max_range_nm: +resm.toFixed(1),
                            confidence: 'tentative', classification: 'emitter bearing'
                        });
                    }
                }
            }
        }

        return Object.keys(best).map(function (k) { return best[k]; });
    }

    var api = {
        DET_VERSION: DET_VERSION,
        DEFAULT_DB: DEFAULT_DB,
        computeContacts: computeContacts,
        // formulas exposed for tests / reuse
        radarHorizonNm: radarHorizonNm,
        rcsDetectRangeNm: rcsDetectRangeNm
    };
    root.AppDetection = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
