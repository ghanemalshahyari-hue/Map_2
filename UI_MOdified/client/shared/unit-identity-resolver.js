/**
 * unit-identity-resolver.js — RMOOZ-UNIT-IDENTITY-CONTRACT-A
 *
 * ONE shared unit-identity contract for the whole app. A selected map marker, the
 * Unit Status panel, the LLM capability analyst, the COA planner, the commander
 * brief, and the event log must all derive a unit's name/identity the SAME way —
 * otherwise the UI shows `fires-47` here, `F` there, `R-047` somewhere else, and the
 * LLM mistakes a synthetic role-index label for a real platform (e.g. an "F-14").
 *
 * Pure + dual-mode: this file is `require()`-able server-side (CommonJS) AND attaches
 * `window.RmoozUnitIdentity` client-side. NO DOM, NO network, NO build step.
 *
 * Hard rules (from the feature spec):
 *   1. Never mutate the raw unit. resolve/normalize return NEW objects.
 *   2. Preserve all original scenario fields (normalizeSelectedUnit copies the raw).
 *   3. uid/unit_uid/id are normalized to ONE stable canonical id.
 *   4. Prefer a real authored name/platform over a synthetic ID when available.
 *   5. Role-only strings ("fires", "armor") are NOT a platform name.
 *   6. If only a synthetic name exists ("fires-47"), display it but mark
 *      warnings:["synthetic_display_name"] + confidence:"low".
 *   7. DB-Lite "generic default" is a CAPABILITY fallback, not identity truth — this
 *      module is pure on the unit and never pulls a name from DB-Lite.
 *
 * Exports: resolveUnitIdentity, normalizeSelectedUnit, displayUnitName, unitIdentityForLlm.
 */
(function (root) {
    'use strict';

    // ── Vocabulary ───────────────────────────────────────────────────────
    // Tokens that are ROLES, not platform/identity names. A candidate equal to one
    // of these (or to the unit's own role) is rejected as a display/platform name.
    var ROLE_TOKENS = {
        fires: 1, fire: 1, artillery: 1, mortar: 1, rocket: 1, mlrs: 1,
        armor: 1, armour: 1, tank: 1, mechanized: 1, mechanised: 1, infantry: 1,
        recon: 1, reconnaissance: 1, scout: 1, screen: 1, block: 1, hold: 1,
        intercept: 1, escort: 1, support: 1, logistics: 1, sustainment: 1,
        engineer: 1, command: 1, c2: 1, hq: 1,
        air_defense: 1, air_defence: 1, sam: 1, ad: 1, radar: 1, sensor: 1,
        ew: 1, sigint: 1, aviation: 1, helo: 1, helicopter: 1, uav: 1, drone: 1,
        naval: 1, patrol: 1, transport: 1, tanker: 1, fighter: 1, bomber: 1,
        attack: 1, defense: 1, defence: 1, reserve: 1, unit: 1, generic: 1,
    };

    function norm(s) {
        return String(s == null ? '' : s).trim().toLowerCase().replace(/[\s\-]+/g, '_');
    }

    function isBlank(s) { return s == null || String(s).trim() === ''; }

    // A "role-only" string is one that is just a role keyword (or equals the unit's
    // declared role). Rule 5 — never let these become a platform/display name.
    function isRoleOnly(s, role) {
        if (isBlank(s)) return true;
        var n = norm(s);
        if (n === norm(role) && !isBlank(role)) return true;
        return !!ROLE_TOKENS[n];
    }

    // A "synthetic" name is an auto-generated `<role>-<index>` style label, e.g.
    // "fires-47", "armor_3", "infantry 12". We detect it when the alpha prefix is a
    // role keyword (or matches the unit's role) AND the string ends in a number.
    // Codes/UIDs like "R-047" or "BLUE_lc" are NOT synthetic by this test (prefix is
    // not role-related / does not end in digits respectively).
    function isSyntheticName(s, role) {
        if (isBlank(s)) return false;
        // Capture the alpha token lazily, then any separator(s), then trailing digits.
        // Lazy `(.+?)` + greedy `[\s\-_]*` keeps the separator OUT of the token, so
        // "armor_3"/"fires-47"/"air_defense-2" all yield a clean role token.
        var m = String(s).trim().match(/^(.+?)[\s\-_]*(\d+)$/);
        if (!m) return false;
        var prefix = norm(m[1]);
        if (isBlank(prefix)) return false;
        if (prefix === norm(role) && !isBlank(role)) return true;
        return !!ROLE_TOKENS[prefix];
    }

    function firstNonBlank() {
        for (var i = 0; i < arguments.length; i++) {
            if (!isBlank(arguments[i])) return arguments[i];
        }
        return null;
    }

    // ── Side / affiliation normalization ─────────────────────────────────
    function normalizeSide(side) {
        var n = norm(side);
        if (n === 'hostile' || n === 'red' || n === 'enemy' || n === 'opfor' || n === 'opposing') return 'RED';
        if (n === 'friendly' || n === 'blue' || n === 'bluefor' || n === 'own' || n === 'friend') return 'BLUE';
        if (n === 'neutral' || n === 'green' || n === 'civilian') return 'NEUTRAL';
        return 'UNKNOWN';
    }
    function affiliationFor(sideNormalized) {
        if (sideNormalized === 'RED') return 'hostile';
        if (sideNormalized === 'BLUE') return 'friendly';
        if (sideNormalized === 'NEUTRAL') return 'neutral';
        return 'unknown';
    }

    // ── Canonical id ─────────────────────────────────────────────────────
    function resolveCanonicalId(unit) {
        var src = 'none';
        var id = null;
        if (!isBlank(unit.uid))           { id = unit.uid; src = 'uid'; }
        else if (!isBlank(unit.unit_uid)) { id = unit.unit_uid; src = 'unit_uid'; }
        else if (!isBlank(unit.id))       { id = unit.id; src = 'id'; }
        else if (!isBlank(unit.code))     { id = unit.code; src = 'code'; }
        else if (!isBlank(unit.base_id))  { id = unit.base_id; src = 'base_id'; }
        return { id: id == null ? null : String(id), source: src };
    }

    // ── Platform name (rule 5: never a role-only string, never "UNIT") ────
    function resolvePlatformName(unit, role) {
        var candidates = [
            ['platform_name', unit.platform_name],
            ['platform', unit.platform],
            ['platform_type', unit.platform_type],
            ['unit_type', unit.unit_type],
            ['type', unit.type],
        ];
        for (var i = 0; i < candidates.length; i++) {
            var key = candidates[i][0], val = candidates[i][1];
            if (isBlank(val)) continue;
            if (isRoleOnly(val, role)) continue;       // "fires" / "UNIT" → reject
            if (isSyntheticName(val, role)) continue;  // "fires-47" → reject
            return { name: String(val), source: key };
        }
        return { name: 'unknown', source: 'none' };
    }

    // ── Display name (rule 4/6) ──────────────────────────────────────────
    // Priority: real authored name > real platform > authored Arabic name >
    // callsign > synthetic label (low conf) > canonical id (low conf).
    function resolveDisplayName(unit, role, platform, canonicalId) {
        // 1. Authored English/primary name.
        if (!isBlank(unit.name_en) && !isRoleOnly(unit.name_en, role) && !isSyntheticName(unit.name_en, role)) {
            return { name: String(unit.name_en), source: 'name_en', confidence: 'high', synthetic: false };
        }
        if (!isBlank(unit.name) && !isRoleOnly(unit.name, role) && !isSyntheticName(unit.name, role)) {
            return { name: String(unit.name), source: 'name', confidence: 'high', synthetic: false };
        }
        // 2. Real platform name (an authored platform IS a meaningful display name).
        if (platform && platform.name && platform.name !== 'unknown') {
            return { name: platform.name, source: 'platform', confidence: 'high', synthetic: false };
        }
        // 3. Authored Arabic name.
        if (!isBlank(unit.name_ar) && !isRoleOnly(unit.name_ar, role) && !isSyntheticName(unit.name_ar, role)) {
            return { name: String(unit.name_ar), source: 'name_ar', confidence: 'high', synthetic: false };
        }
        // 4. Callsign (a real tactical identifier).
        if (!isBlank(unit.callsign)) {
            return { name: String(unit.callsign), source: 'callsign', confidence: 'medium', synthetic: false };
        }
        // 5. Label — could be authored OR synthetic.
        if (!isBlank(unit.label)) {
            if (isSyntheticName(unit.label, role)) {
                return { name: String(unit.label), source: 'label_synthetic', confidence: 'low', synthetic: true };
            }
            if (!isRoleOnly(unit.label, role)) {
                return { name: String(unit.label), source: 'label', confidence: 'medium', synthetic: false };
            }
        }
        // 6. Fall back to the canonical id — a synthetic display of last resort.
        if (!isBlank(canonicalId)) {
            return { name: String(canonicalId), source: 'uid', confidence: 'low', synthetic: true };
        }
        return { name: '—', source: 'none', confidence: 'low', synthetic: true };
    }

    /**
     * resolveUnitIdentity(unit, opts) → the full identity contract object.
     * Pure; never mutates `unit`. opts: { side, scenario }.
     */
    function resolveUnitIdentity(unit, opts) {
        opts = opts || {};
        if (!unit || typeof unit !== 'object') {
            return {
                uid: null, unit_uid: null, id: null,
                display_name: '—', tactical_name: null, platform_name: 'unknown',
                original_name: null, label: null, name: null, name_en: null, name_ar: null,
                code: null, side: null, side_normalized: 'UNKNOWN', affiliation: 'unknown',
                domain: null, role: null, unit_type: null, platform_type: null, echelon: null,
                sidc: null, country: null, base_id: null, assigned_base: null,
                readiness: null, supply: null, fuel: null,
                source: { identity_source: 'none', display_name_source: 'none', platform_source: 'none', scenario_source: 'unknown' },
                confidence: 'low',
                warnings: ['no_unit'],
            };
        }

        var role = isBlank(unit.role) ? null : String(unit.role);
        var canon = resolveCanonicalId(unit);
        var platform = resolvePlatformName(unit, role);
        var display = resolveDisplayName(unit, role, platform, canon.id);

        var sideRaw = firstNonBlank(opts.side, unit.side, unit.affiliation);
        var sideNorm = normalizeSide(sideRaw);

        var scenarioSource = 'unknown';
        if (opts.scenario || unit._scenario) scenarioSource = 'scenario';
        else if (unit.source && typeof unit.source === 'object' && unit.source.type) scenarioSource = String(unit.source.type);
        else if (!isBlank(unit.source)) scenarioSource = String(unit.source);

        var warnings = [];
        if (display.synthetic) warnings.push('synthetic_display_name');
        if (canon.source === 'none') warnings.push('no_stable_id');

        return {
            // canonical id (rule 3 — all three are the same stable value)
            uid: canon.id,
            unit_uid: canon.id,
            id: canon.id,
            // names
            display_name: display.name,
            tactical_name: firstNonBlank(unit.callsign, unit.tactical_name, unit.code, canon.id),
            platform_name: platform.name,
            original_name: firstNonBlank(unit.name_en, unit.name, unit.name_ar, unit.label),
            label: isBlank(unit.label) ? null : String(unit.label),
            name: isBlank(unit.name) ? null : String(unit.name),
            name_en: isBlank(unit.name_en) ? null : String(unit.name_en),
            name_ar: isBlank(unit.name_ar) ? null : String(unit.name_ar),
            code: firstNonBlank(unit.code, unit.base_id, canon.id),
            // side
            side: isBlank(sideRaw) ? null : String(sideRaw),
            side_normalized: sideNorm,
            affiliation: affiliationFor(sideNorm),
            // classification
            domain: isBlank(unit.domain) ? null : String(unit.domain),
            role: role,
            unit_type: firstNonBlank(unit.unit_type, unit.type),
            platform_type: firstNonBlank(unit.platform_type, unit.platform),
            echelon: firstNonBlank(unit.echelon, unit.level),
            sidc: isBlank(unit.sidc) ? null : String(unit.sidc),
            country: firstNonBlank(unit.country, unit.nation),
            base_id: isBlank(unit.base_id) ? null : String(unit.base_id),
            assigned_base: firstNonBlank(unit.assigned_base, unit.base, unit.base_id),
            // logistics (raw scenario values only — DB-Lite fallback handled elsewhere)
            readiness: unit.readiness != null ? unit.readiness : null,
            supply: unit.supply != null ? unit.supply : null,
            fuel: unit.fuel != null ? unit.fuel : null,
            // provenance
            source: {
                identity_source: canon.source,
                display_name_source: display.source,
                platform_source: platform.source,
                scenario_source: scenarioSource,
            },
            confidence: display.confidence,
            warnings: warnings,
        };
    }

    /**
     * normalizeSelectedUnit(unit, opts) → a NEW object that preserves ALL original
     * fields (rule 2) and overlays the resolved identity, normalized id, display name,
     * live coordinates, and a compact `unit_identity` block for the AI path. This is
     * what the map marker stashes as `_unitData` and dispatches on `rmooz:unit-selected`.
     * opts: { side, live_lat, live_lng, scenario }.
     */
    function normalizeSelectedUnit(unit, opts) {
        opts = opts || {};
        var raw = (unit && typeof unit === 'object') ? unit : {};
        var identity = resolveUnitIdentity(raw, opts);

        var out = Object.assign({}, raw); // rule 1 + 2: copy, never mutate the raw

        // Normalized, stable id everywhere consumers look.
        out.id = identity.uid;
        out.uid = identity.uid;
        out.unit_uid = identity.uid;
        out.code = identity.code;
        // A trustworthy human name for any consumer reading `.name`.
        out.name = identity.display_name;
        out.display_name = identity.display_name;
        // Side as the marker classifies it (hostile/friendly), keeping raw if not given.
        if (!isBlank(opts.side)) out.side = opts.side;
        // Live displayed position (Red's raw coord is a stacked staging point).
        if (opts.live_lat != null && opts.live_lng != null) {
            out.lat = opts.live_lat;
            out.lng = opts.live_lng;
        }
        if (opts.scenario) out._scenario = true;

        // The full identity contract + the compact LLM-facing block.
        out.identity = identity;
        out.unit_identity = unitIdentityForLlm(raw, opts);
        return out;
    }

    /**
     * displayUnitName(unit) → the single human display string. Idempotent: if the unit
     * already carries a resolved `identity`, reuse it; otherwise resolve fresh.
     */
    function displayUnitName(unit) {
        if (!unit) return '—';
        if (unit.identity && !isBlank(unit.identity.display_name)) return unit.identity.display_name;
        return resolveUnitIdentity(unit).display_name;
    }

    /**
     * unitIdentityForLlm(unit, opts) → compact identity block for the LLM/COA path, so
     * the model never mistakes a synthetic label ("fires-47") for a real platform.
     */
    function unitIdentityForLlm(unit, opts) {
        var id = (unit && unit.identity) ? unit.identity : resolveUnitIdentity(unit, opts);
        return {
            uid: id.uid,
            display_name: id.display_name,
            role: id.role,
            domain: id.domain,
            platform_name: id.platform_name,           // "unknown" when not authored
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
        _isSyntheticName: isSyntheticName,
        _isRoleOnly: isRoleOnly,
        _normalizeSide: normalizeSide,
        VERSION: 'rmooz-unit-identity/1.0',
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = API;
    if (typeof root !== 'undefined' && root) root.RmoozUnitIdentity = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
