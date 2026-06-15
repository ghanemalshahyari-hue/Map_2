/**
 * unit-identity-resolver.js — RMOOZ-UNIT-IDENTITY-CONTRACT-A
 *
 * ONE shared unit-identity contract for the whole app. The map marker, Unit Status
 * panel, DB-Lite enrichment, LLM capability analyst, COA planner, commander brief, and
 * event log must all derive a unit's identity the SAME way — otherwise the operator
 * sees `fires-47` here, `R-047` there, `UNIT`/`F` somewhere else, and the LLM mistakes a
 * synthetic key for a real platform.
 *
 * IDENTITY MODEL (owner ruling 2026-06-15) — these are SEPARATE fields, not a swap:
 *   internalKey / uid : system-linking key, KEPT AS-IS (e.g. "R-047"). Markers, AI/COA,
 *                       journal, and the simulator keep keying on it → no sim change.
 *   canonicalId       : stable normalized authored identity (e.g. "fires-47").
 *   tacticalCode      : optional secondary/debug code (e.g. "R-047").
 *   displayName       : operator-facing platform/unit name (e.g. "Rocket Artillery
 *                       Battery", or "F-16C Fighting Falcon" from DB-Lite). NEVER the
 *                       raw R-code or the synthetic role-index unless nothing else exists.
 *   platformLabel / typeLabel / capabilityLabel : so type never degrades to UNIT/generic.
 *
 * Pure + dual-mode: `require()`-able server-side (CommonJS) AND attaches
 * `window.RmoozUnitIdentity` client-side. NO DOM, NO network, NO build step. Never
 * mutates the raw unit.
 *
 * Exports: resolveUnitIdentity, normalizeSelectedUnit, displayUnitName, unitIdentityForLlm.
 */
(function (root) {
    'use strict';

    // ── Vocabulary ───────────────────────────────────────────────────────
    // Role keywords — a value equal to one of these (or to the unit's role) is NOT a
    // display/platform name, and (with a trailing index) marks a synthetic role-index key.
    var ROLE_TOKENS = {
        fires: 1, fire: 1, artillery: 1, mortar: 1, rocket: 1, mlrs: 1,
        armor: 1, armour: 1, tank: 1, mechanized: 1, mechanised: 1, mech_infantry: 1, infantry: 1,
        marine: 1, recon: 1, reconnaissance: 1, scout: 1, screen: 1, block: 1, hold: 1,
        intercept: 1, escort: 1, support: 1, logistics: 1, sustainment: 1,
        engineer: 1, command: 1, c2: 1, hq: 1,
        air_defense: 1, air_defence: 1, sam: 1, ad: 1, radar: 1, sensor: 1,
        ew: 1, sigint: 1, aviation: 1, helo: 1, helicopter: 1, uav: 1, drone: 1,
        naval: 1, patrol: 1, transport: 1, tanker: 1, fighter: 1, bomber: 1, aircraft: 1,
        cruise_missile: 1, missile: 1, attack: 1, defense: 1, defence: 1, reserve: 1,
        unit: 1, generic: 1,
    };

    // Human capability labels by role — public/general descriptions only (no exact or
    // classified platform claims). DB-Lite / authored names override these.
    var CAPABILITY_LABELS = {
        fires: 'Rocket Artillery Battery', artillery: 'Artillery Battery', mortar: 'Mortar Unit',
        rocket: 'Rocket Artillery', mlrs: 'Multiple Rocket Launcher',
        armor: 'Armored / Tank Unit', armour: 'Armored / Tank Unit', tank: 'Tank Unit',
        mechanized: 'Mechanized Infantry', mechanised: 'Mechanized Infantry', mech_infantry: 'Mechanized Infantry',
        infantry: 'Infantry Unit', marine: 'Marine Infantry',
        recon: 'Reconnaissance Element', reconnaissance: 'Reconnaissance Element', scout: 'Reconnaissance Element',
        aircraft: 'Combat Aircraft', fighter: 'Fighter Aircraft', bomber: 'Bomber Aircraft',
        uav: 'Unmanned Aerial Vehicle', drone: 'Unmanned Aerial Vehicle',
        cruise_missile: 'Cruise Missile', missile: 'Missile Unit',
        sam: 'Surface-to-Air Missile Battery', air_defense: 'Air-Defense Battery', air_defence: 'Air-Defense Battery',
        radar: 'Radar Site', sensor: 'Sensor Element', ew: 'Electronic-Warfare Unit',
        naval: 'Naval Combatant', patrol: 'Patrol Craft', transport: 'Transport Unit',
        tanker: 'Tanker', helicopter: 'Helicopter', helo: 'Helicopter', aviation: 'Aviation Unit',
        logistics: 'Logistics Unit', engineer: 'Engineer Unit', command: 'Command Element',
        c2: 'Command & Control', hq: 'Headquarters Element',
    };

    function norm(s) {
        return String(s == null ? '' : s).trim().toLowerCase().replace(/[\s\-]+/g, '_');
    }
    function isBlank(s) { return s == null || String(s).trim() === ''; }
    function titleCase(s) {
        if (isBlank(s)) return null;
        return String(s).trim().replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ')
            .replace(/\b\w/g, function (c) { return c.toUpperCase(); });
    }
    function firstNonBlank() {
        for (var i = 0; i < arguments.length; i++) if (!isBlank(arguments[i])) return arguments[i];
        return null;
    }

    // A role-only token ("fires", "UNIT") — never a display/platform name.
    function isRoleOnly(s, role) {
        if (isBlank(s)) return true;
        var n = norm(s);
        if (n === norm(role) && !isBlank(role)) return true;
        return !!ROLE_TOKENS[n];
    }

    // A tactical/registration code: short alpha prefix that is NOT a role keyword,
    // followed by digits — e.g. "R-047", "B-012", "R_001". This is the human/debug code,
    // not the operator-facing name. (A role-index like "fires-47" is NOT a code.)
    function looksLikeTacticalCode(s) {
        if (isBlank(s)) return false;
        var m = String(s).trim().match(/^([A-Za-z]{1,4})[\s\-_]?(\d{1,6})$/);
        if (!m) return false;
        return !ROLE_TOKENS[norm(m[1])];
    }

    // A synthetic role-index key: alpha prefix is a role keyword (or the unit's role),
    // followed by digits — e.g. "fires-47", "armor_3". This is the stable authored KEY,
    // not a display name.
    function isRoleIndexKey(s, role) {
        if (isBlank(s)) return false;
        var m = String(s).trim().match(/^(.+?)[\s\-_]*(\d+)$/);
        if (!m) return false;
        var prefix = norm(m[1]);
        if (isBlank(prefix)) return false;
        if (prefix === norm(role) && !isBlank(role)) return true;
        return !!ROLE_TOKENS[prefix];
    }

    // A value that can serve as an operator-facing NAME: present, not a bare role token,
    // not a tactical code, not a synthetic role-index key.
    function isRealName(s, role) {
        return !isBlank(s) && !isRoleOnly(s, role) && !looksLikeTacticalCode(s) && !isRoleIndexKey(s, role);
    }

    // ── Side / affiliation ───────────────────────────────────────────────
    function normalizeSide(side) {
        var n = norm(side);
        if (n === 'hostile' || n === 'red' || n === 'enemy' || n === 'opfor' || n === 'opposing') return 'RED';
        if (n === 'friendly' || n === 'blue' || n === 'bluefor' || n === 'own' || n === 'friend') return 'BLUE';
        if (n === 'neutral' || n === 'green' || n === 'civilian') return 'NEUTRAL';
        return 'UNKNOWN';
    }
    function affiliationFor(s) {
        return s === 'RED' ? 'hostile' : s === 'BLUE' ? 'friendly' : s === 'NEUTRAL' ? 'neutral' : 'unknown';
    }

    // ── System-linking key (KEPT AS-IS — markers/AI/sim use this) ─────────
    function resolveInternalKey(unit) {
        var id = firstNonBlank(unit.uid, unit.unit_uid, unit.id, unit.canonical_id);
        return id == null ? null : String(id);
    }

    // ── Canonical (stable normalized authored) id ─────────────────────────
    function resolveCanonicalId(unit, role) {
        var c;
        if (!isBlank(unit.canonical_id)) return { id: String(unit.canonical_id), source: 'canonical_id' };
        // A non-code uid/unit_uid/id is itself the canonical key (clean-data shape).
        c = [['uid', unit.uid], ['unit_uid', unit.unit_uid], ['id', unit.id]];
        for (var i = 0; i < c.length; i++) {
            if (!isBlank(c[i][1]) && !looksLikeTacticalCode(c[i][1])) return { id: String(c[i][1]), source: c[i][0] };
        }
        // Else the authored role-index key (label, e.g. "fires-47") is the canonical id.
        if (!isBlank(unit.label)) return { id: String(unit.label), source: 'label' };
        // Last resort: fall back to whatever id exists, even a code.
        var fb = firstNonBlank(unit.uid, unit.unit_uid, unit.id);
        if (!isBlank(fb)) return { id: String(fb), source: 'fallback_code' };
        // Generated stable-ish fallback from role (no random — deterministic).
        if (!isBlank(role)) return { id: norm(role) + '-x', source: 'generated' };
        return { id: null, source: 'none' };
    }

    // ── Tactical / debug code ─────────────────────────────────────────────
    function resolveTacticalCode(unit) {
        if (!isBlank(unit.code)) return { code: String(unit.code), source: 'code' };
        if (!isBlank(unit.callsign)) return { code: String(unit.callsign), source: 'callsign' };
        if (!isBlank(unit.tactical_code)) return { code: String(unit.tactical_code), source: 'tactical_code' };
        var probes = [['uid', unit.uid], ['unit_uid', unit.unit_uid], ['base_id', unit.base_id], ['name', unit.name]];
        for (var i = 0; i < probes.length; i++) {
            if (looksLikeTacticalCode(probes[i][1])) return { code: String(probes[i][1]), source: probes[i][0] };
        }
        return { code: null, source: 'none' };
    }

    // ── Platform label (authored or DB-Lite-injected; never a role) ───────
    function resolvePlatformLabel(unit, role, opts) {
        var c = [['platform_name', unit.platform_name], ['platform', unit.platform], ['platform_type', unit.platform_type]];
        for (var i = 0; i < c.length; i++) {
            if (!isBlank(c[i][1]) && !isRoleOnly(c[i][1], role) && !isRoleIndexKey(c[i][1], role)) {
                return { label: String(c[i][1]), source: c[i][0] };
            }
        }
        // DB-Lite SPECIFIC platform label, injected by the caller (panel/server catalog).
        if (!isBlank(opts.platformLabel)) return { label: String(opts.platformLabel), source: 'db_lite_platform' };
        return { label: null, source: 'none' };
    }

    // ── Operator-facing display name (rule: never the raw code/synthetic key) ──
    function resolveDisplayName(unit, role, platform, capability, tacticalCode, canonicalId, opts) {
        // 1. Authored real names.
        var authored = [
            ['display_name', unit.display_name], ['name_en', unit.name_en],
            ['name', unit.name], ['name_ar', unit.name_ar],
        ];
        for (var i = 0; i < authored.length; i++) {
            if (isRealName(authored[i][1], role)) {
                return { name: String(authored[i][1]), source: authored[i][0], confidence: 'high', generic: false };
            }
        }
        // 2. Authored / DB-Lite specific platform.
        if (platform.label) {
            return { name: platform.label, source: platform.source, confidence: platform.source === 'db_lite_platform' ? 'medium' : 'high', generic: false };
        }
        // 3. DB-Lite class label, injected by caller.
        if (!isBlank(opts.classLabel)) {
            return { name: String(opts.classLabel), source: 'db_lite_class', confidence: 'medium', generic: true };
        }
        // 4. Capability label (caller-injected, else role-derived) — "Rocket Artillery Battery".
        if (!isBlank(opts.capabilityLabel)) {
            return { name: String(opts.capabilityLabel), source: 'capability_label', confidence: 'medium', generic: true };
        }
        if (capability) {
            return { name: capability, source: 'role_capability', confidence: 'low', generic: true };
        }
        // 5. Normalized type label — "Fires".
        var type = titleCase(role);
        if (type) return { name: type, source: 'type_label', confidence: 'low', generic: true };
        // 6. Last resort: a code (never preferred).
        if (tacticalCode) return { name: tacticalCode, source: 'tactical_code', confidence: 'low', generic: true };
        if (canonicalId) return { name: canonicalId, source: 'canonical_id', confidence: 'low', generic: true };
        return { name: '—', source: 'none', confidence: 'low', generic: true };
    }

    // ── Canonical scenario lookup (stale-copy reconciliation) ─────────────
    function gatherCanonicalUnits(opts) {
        if (Array.isArray(opts.canonicalUnits)) return opts.canonicalUnits;
        var sc = opts.scenario;
        if (sc && typeof sc === 'object') {
            if (Array.isArray(sc)) return sc;
            return [].concat(sc.red_units || [], sc.blue_units_initial || [], sc.blue_units || []);
        }
        return null;
    }
    function findCanonicalUnit(unit, opts) {
        var list = gatherCanonicalUnits(opts);
        if (!list || !list.length) return null;
        var key = resolveInternalKey(unit);
        if (isBlank(key)) return null;
        for (var i = 0; i < list.length; i++) {
            var u = list[i];
            if (!u) continue;
            if (String(firstNonBlank(u.uid, u.unit_uid, u.id, u.canonical_id)) === String(key)) return u;
        }
        return null;
    }

    /**
     * resolveUnitIdentity(unit, opts) → the full identity contract object. Pure; never
     * mutates `unit`. A stale/degraded copy is reconciled against the canonical scenario
     * unit when opts.scenario/opts.canonicalUnits is supplied.
     * opts: { side, scenario, canonicalUnits, platformLabel, classLabel, capabilityLabel }.
     */
    function resolveUnitIdentity(rawUnit, opts) {
        opts = opts || {};
        if (!rawUnit || typeof rawUnit !== 'object') {
            return EMPTY_IDENTITY();
        }

        // Stale-copy reconciliation: authored identity fields come from the canonical
        // scenario unit; live/positional fields stay from the (possibly stale) copy.
        var canon = findCanonicalUnit(rawUnit, opts);
        var unit = canon
            ? Object.assign({}, canon, {
                lat: rawUnit.lat, lng: rawUnit.lng, lon: rawUnit.lon, coord: rawUnit.coord,
                side: firstNonBlank(rawUnit.side, canon.side),
            })
            : rawUnit;
        var reconciled = !!canon;

        // `role` is the unit's tactical role; some scenarios carry it as `type`.
        var role = firstNonBlank(unit.role, unit.type);
        role = isBlank(role) ? null : String(role);
        var internalKey = resolveInternalKey(unit);
        var canonical = resolveCanonicalId(unit, role);
        var tactical = resolveTacticalCode(unit);
        var platform = resolvePlatformLabel(unit, role, opts);
        var capability = firstNonBlank(opts.capabilityLabel, CAPABILITY_LABELS[norm(role)]);
        var display = resolveDisplayName(unit, role, platform, CAPABILITY_LABELS[norm(role)], tactical.code, canonical.id, opts);

        var sideRaw = firstNonBlank(opts.side, unit.side, unit.affiliation);
        var sideNorm = normalizeSide(sideRaw);

        var scenarioSource = 'unknown';
        if (reconciled) scenarioSource = 'canonical_scenario';
        else if (opts.scenario || unit._scenario) scenarioSource = 'scenario';
        else if (unit.source && typeof unit.source === 'object' && unit.source.type) scenarioSource = String(unit.source.type);
        else if (!isBlank(unit.source)) scenarioSource = String(unit.source);

        var warnings = [];
        if (display.generic) warnings.push('display_name_from_type');     // operator may want to review
        if (!platform.label) warnings.push('platform_unknown');
        if (isBlank(internalKey)) warnings.push('no_internal_key');
        if (reconciled) warnings.push('resolved_from_canonical');

        var typeLabel = titleCase(role);

        return {
            // system-linking key (KEPT AS-IS for markers/AI/sim)
            internalKey: internalKey,
            uid: internalKey,
            // stable normalized authored identity
            canonicalId: canonical.id,
            // optional debug/secondary code
            tacticalCode: tactical.code,
            // operator-facing labels
            displayName: display.name,
            platformLabel: platform.label,
            typeLabel: typeLabel,
            capabilityLabel: capability || null,
            // classification + provenance
            side: isBlank(sideRaw) ? null : String(sideRaw),
            side_normalized: sideNorm,
            affiliation: affiliationFor(sideNorm),
            domain: isBlank(unit.domain) ? null : String(unit.domain),
            role: role,
            country: firstNonBlank(unit.country, unit.nation),
            sidc: isBlank(unit.sidc) ? null : String(unit.sidc),
            base_id: isBlank(unit.base_id) ? null : String(unit.base_id),
            echelon: firstNonBlank(unit.echelon, unit.level),
            readiness: unit.readiness != null ? unit.readiness : null,
            supply: unit.supply != null ? unit.supply : null,
            fuel: unit.fuel != null ? unit.fuel : null,
            source: {
                identity_source: canonical.source,
                display_name_source: display.source,
                platform_source: platform.source,
                tactical_code_source: tactical.source,
                scenario_source: scenarioSource,
            },
            confidence: display.confidence,
            warnings: warnings,

            // ── legacy aliases (keep older consumers working) ──
            id: internalKey,
            unit_uid: internalKey,
            display_name: display.name,
            platform_name: platform.label || 'unknown',
            unit_type: typeLabel,
            code: tactical.code,
            label: isBlank(unit.label) ? null : String(unit.label),
            name_en: isBlank(unit.name_en) ? null : String(unit.name_en),
            name_ar: isBlank(unit.name_ar) ? null : String(unit.name_ar),
        };
    }

    function EMPTY_IDENTITY() {
        return {
            internalKey: null, uid: null, canonicalId: null, tacticalCode: null,
            displayName: '—', platformLabel: null, typeLabel: null, capabilityLabel: null,
            side: null, side_normalized: 'UNKNOWN', affiliation: 'unknown',
            domain: null, role: null, country: null, sidc: null, base_id: null, echelon: null,
            readiness: null, supply: null, fuel: null,
            source: { identity_source: 'none', display_name_source: 'none', platform_source: 'none', tactical_code_source: 'none', scenario_source: 'unknown' },
            confidence: 'low', warnings: ['no_unit'],
            id: null, unit_uid: null, display_name: '—', platform_name: 'unknown', unit_type: null,
            code: null, label: null, name_en: null, name_ar: null,
        };
    }

    /**
     * normalizeSelectedUnit(unit, opts) → a NEW object preserving ALL original fields and
     * overlaying the identity contract. This is what the map marker stashes as `_unitData`
     * and dispatches on `rmooz:unit-selected`. The system key (`uid`/`id`/`unit_uid`) is
     * KEPT AS-IS so markers/AI/sim linking does not change.
     * opts: { side, live_lat, live_lng, scenario, platformLabel, classLabel, capabilityLabel }.
     */
    function normalizeSelectedUnit(unit, opts) {
        opts = opts || {};
        var raw = (unit && typeof unit === 'object') ? unit : {};
        var identity = resolveUnitIdentity(raw, opts);
        var out = Object.assign({}, raw); // never mutate raw; preserve every field

        // System-linking key kept exactly as the markers/AI already use it.
        var key = identity.internalKey != null ? identity.internalKey : firstNonBlank(raw.uid, raw.unit_uid, raw.id);
        if (key != null) { out.id = key; out.uid = key; out.unit_uid = key; }
        // Operator-facing name for any consumer reading `.name` / `.display_name`.
        out.name = identity.displayName;
        out.display_name = identity.displayName;
        out.tactical_code = identity.tacticalCode;
        out.canonical_id = identity.canonicalId;
        if (!isBlank(opts.side)) out.side = opts.side;
        if (opts.live_lat != null && opts.live_lng != null) { out.lat = opts.live_lat; out.lng = opts.live_lng; }
        if (opts.scenario) out._scenario = true;

        out.identity = identity;
        out.unit_identity = unitIdentityForLlm(raw, opts);
        return out;
    }

    /** displayUnitName(unit) → the single operator-facing string. Idempotent. */
    function displayUnitName(unit) {
        if (!unit) return '—';
        if (unit.identity && !isBlank(unit.identity.displayName)) return unit.identity.displayName;
        return resolveUnitIdentity(unit).displayName;
    }

    /**
     * unitIdentityForLlm(unit, opts) → compact block for the LLM/COA path. Keeps the
     * system-linking uid (R-047) so the model can reference units the engine knows, while
     * giving the real displayName/platform so it never reads a code/synthetic key as a
     * real platform.
     */
    function unitIdentityForLlm(unit, opts) {
        var id = (unit && unit.identity) ? unit.identity : resolveUnitIdentity(unit, opts);
        return {
            uid: id.uid,
            internal_key: id.internalKey,
            canonical_id: id.canonicalId,
            tactical_code: id.tacticalCode,
            display_name: id.displayName,
            platform_name: id.platformLabel || 'unknown',
            type_label: id.typeLabel,
            capability_label: id.capabilityLabel,
            role: id.role,
            domain: id.domain,
            identity_confidence: id.confidence,
            warning: id.warnings.length ? id.warnings[0] : null,
            warnings: id.warnings.slice(),
        };
    }

    var API = {
        resolveUnitIdentity: resolveUnitIdentity,
        normalizeSelectedUnit: normalizeSelectedUnit,
        displayUnitName: displayUnitName,
        unitIdentityForLlm: unitIdentityForLlm,
        // exposed for tests / reuse
        _looksLikeTacticalCode: looksLikeTacticalCode,
        _isRoleIndexKey: isRoleIndexKey,
        _isRealName: isRealName,
        _normalizeSide: normalizeSide,
        CAPABILITY_LABELS: CAPABILITY_LABELS,
        VERSION: 'rmooz-unit-identity/2.0',
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = API;
    if (typeof root !== 'undefined' && root) root.RmoozUnitIdentity = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
