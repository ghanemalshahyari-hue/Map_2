'use strict';
/* ============================================================================
 * rmooz-ai-tool-contract.js — RMOOZ-AI-TOOL-CONTRACT-A
 * ----------------------------------------------------------------------------
 * Internal, MCP-style AI tool-contract layer for the RMOOZ commander AI. It
 * exposes a stable set of DETERMINISTIC "tools" plus a prompt-pack builder and a
 * schema VALIDATOR that forces EVERY local LLM (Qwen / Llama / Mistral / ...)
 * through one fixed RMOOZ JSON contract. The LLM never gets to invent unit IDs,
 * assign impossible domain roles, emit kill/destroy actions, teleport a unit, or
 * repeat the same course of action — the validator rejects/repairs all of that
 * deterministically.
 *
 * PUBLIC / DEMO ABSTRACTION — REVIEW-ONLY. Every tool result carries
 * review_required:true. This layer composes the existing pure heuristic intel
 * engines; it adds NO new platform data, NO classified ranges, NO kill logic,
 * NO unit removal, and performs NO LLM state mutation. The deterministic
 * (heuristic) path is the default; the local LLM is consulted ONLY inside the
 * capability/prompt-pack helpers, and only when the caller opts in AND a local
 * provider is available — never inside the validator or the scorer.
 *
 * Scenario-generic: no hardcoded scenario/draft names, no hardcoded unit IDs,
 * no remote providers. Pure module — no DOM, no network of its own, requireable
 * in isolation (CommonJS).
 *
 * Exports (each takes ONE object arg { units, objectives, context, ... }):
 *   getScenarioOobTool(input)              → order-of-battle envelope
 *   getCapabilityIntelTool(input) async    → best/not-recommended assets envelope
 *   getTerrainIntelTool(input)             → terrain envelope (honest false)
 *   getSovereignZoneIntelTool(input)       → inferred-zone envelope
 *   getContactPictureTool(input)           → contact-picture envelope
 *   getRoeStateTool(input)                 → ROE/alert envelope (engage blocked)
 *   getPreviousTurnsTool(input)            → prior-turn history envelope
 *   getCoaFamilyOptionsTool(input)         → allowed/recommended COA families
 *   scoreCoaCandidatesTool(input)          → deterministic COA scoring
 *   validateCommanderCoaTool(input)        → schema/safety validator + repair
 *   buildCommanderPromptPack(input) async  → the full prompt pack for the LLM
 *   TOOL_CONTRACT_VERSION                  → contract version string
 *   COA_FAMILIES                           → the fixed family taxonomy
 *   LLM_COMMANDER_DECISION_SCHEMA          → the LLM output schema (documented)
 * ========================================================================== */

var scenarioIntel = require('./scenario-intel');
var catalog       = require('./platform-capability-catalog');
var analyst       = require('./free-fight-llm-capability-analyst');
var terrain       = require('./terrain-effects-engine');
var zones         = require('./sovereign-zone-engine');
var contacts      = require('./contact-detection-engine');
var roe           = require('./roe-escalation-engine');
var coaVariation  = require('./coa-variation-engine');
var situationTrig = require('./free-fight-situation-triggers');
// RMOOZ-UNIT-IDENTITY-CONTRACT-A: shared identity contract, so the LLM OOB carries a
// resolved display name + platform truth + synthetic warning (never role-as-platform).
var identityResolver = null;
try { identityResolver = require('../../client/shared/unit-identity-resolver.js'); } catch (_) { identityResolver = null; }
function unitIdentityFor(u) {
    if (u && u.unit_identity && u.unit_identity.uid) return u.unit_identity;
    if (identityResolver && identityResolver.unitIdentityForLlm) {
        try { return identityResolver.unitIdentityForLlm(u); } catch (_) {}
    }
    return null;
}

var TOOL_CONTRACT_VERSION = 'rmooz-ai-tool-contract/1.0';

// The fixed RMOOZ COA-family taxonomy this contract speaks. The LLM may ONLY
// select from this set; the underlying coa-variation-engine uses a slightly
// different vocabulary that we map into this one.
var COA_FAMILIES = [
    'air_intercept',
    'naval_screen',
    'ground_block',
    'recon_probe',
    'hold_and_warn',
    'reinforce_defense',
    'deception_feint',
    'shift_axis',
    'maintain_intercept',
    'sensor_tasking',
    'air_defense_posture',
];

// Actions that are blocked at every level of this review-only contract.
var BLOCKED_ACTIONS = ['engage', 'destroy', 'open_fire'];

// Allowed-role matrix per coarse domain (from classifyUnit). Any role outside a
// domain's set is an impossible domain role.
var ALLOWED_ROLE_MATRIX = {
    air:         ['air_superiority', 'intercept', 'air_defense', 'recon', 'screen', 'reserve', 'support'],
    naval:       ['naval_screen', 'naval_strike', 'screen', 'recon', 'reserve', 'support'],
    ground:      ['ground_hold', 'ground_block', 'ground_attack', 'defend', 'screen', 'reserve', 'support'],
    air_defense: ['air_defense', 'intercept', 'defend', 'reserve', 'support'],
    radar:       ['sensor', 'recon', 'reserve', 'support'],
    base:        ['support', 'reserve', 'defend'],
    unknown:     null, // null = any role allowed
};

// Roles/actions that mean "air intercept" (illegal for a ground unit).
var AIR_INTERCEPT_ROLES = ['air_superiority', 'intercept'];
// Roles that mean "hold/occupy ground" (illegal for an aircraft / naval unit).
var GROUND_ROLES = ['ground_hold', 'ground_block', 'infantry', 'ground_attack', 'defend'];

// Max safe straight-line step (coordinate degrees) for one turn.
var SAFE_STEP_DEG = 0.15;

// ── small helpers ────────────────────────────────────────────────────────────
function arr(v) { return Array.isArray(v) ? v : []; }
function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }
function lc(v) { return String(v == null ? '' : v).toLowerCase().trim(); }
function finiteN(v) { var n = Number(v); return Number.isFinite(n) ? n : null; }
function unitUid(u) { return (u && (u.uid || u.unit_uid || u.id)) || null; }
function unitSide(u) { return String((u && u.side) || 'RED').toUpperCase(); }

function unitLL(u) {
    if (!u) return null;
    var la = finiteN(u.lat), lo = finiteN(u.lon);
    if ((la == null || lo == null) && (u.lng != null)) { lo = finiteN(u.lng); }
    if ((la == null || lo == null) && Array.isArray(u.coord) && u.coord.length >= 2) {
        lo = finiteN(u.coord[0]); la = finiteN(u.coord[1]);
    }
    return (la != null && lo != null) ? { lat: la, lon: lo } : null;
}
// PHYSICS — a target must be a real coordinate inside the world (or a supplied AO box).
function targetInBounds(ll, mapBounds) {
    if (!ll) return false;
    if (ll.lat < -90 || ll.lat > 90 || ll.lon < -180 || ll.lon > 180) return false;
    if (isObj(mapBounds)) {
        var minLat = finiteN(mapBounds.minLat), maxLat = finiteN(mapBounds.maxLat);
        var minLon = finiteN(mapBounds.minLon), maxLon = finiteN(mapBounds.maxLon);
        if (minLat != null && ll.lat < minLat) return false;
        if (maxLat != null && ll.lat > maxLat) return false;
        if (minLon != null && ll.lon < minLon) return false;
        if (maxLon != null && ll.lon > maxLon) return false;
    }
    return true;
}
function objLL(objectives, context) {
    var list = arr(objectives);
    for (var i = 0; i < list.length; i++) {
        var ll = unitLL(list[i]);
        if (ll) return ll;
    }
    var ctx = context || {};
    if (ctx.objective) {
        var co = unitLL(ctx.objective);
        if (co) return co;
    }
    return null;
}
function degDist(a, b) {
    if (!a || !b) return null;
    var dx = a.lat - b.lat, dy = a.lon - b.lon;
    return Math.sqrt(dx * dx + dy * dy);
}
function round4(n) { return n == null ? null : Math.round(n * 1e4) / 1e4; }

// ── envelope builders ─────────────────────────────────────────────────────────
function ok(toolName, source, confidence, data) {
    return {
        ok: true,
        tool_name: toolName,
        version: TOOL_CONTRACT_VERSION,
        source: source,
        confidence: confidence,
        review_required: true,
        data: data || {},
    };
}
function fail(toolName, error) {
    return {
        ok: false,
        tool_name: toolName,
        version: TOOL_CONTRACT_VERSION,
        error: String(error == null ? 'invalid_input' : error),
        review_required: true,
        data: {},
    };
}

function readInput(input) {
    var inp = isObj(input) ? input : {};
    return {
        units: arr(inp.units),
        objectives: arr(inp.objectives),
        context: isObj(inp.context) ? inp.context : {},
        opts: isObj(inp.opts) ? inp.opts : {},
        raw: inp,
    };
}

// Build a set of allowed unit ids from explicit allowed_unit_ids or the units.
function allowedIdSet(units, allowedList) {
    var set = {};
    var explicit = arr(allowedList).filter(function (x) { return x != null; });
    if (explicit.length) {
        explicit.forEach(function (id) { set[String(id)] = true; });
    } else {
        arr(units).forEach(function (u) { var id = unitUid(u); if (id != null) set[String(id)] = true; });
    }
    return set;
}

// ============================================================================
// 1. getScenarioOobTool — order of battle by side, deterministic.
// ============================================================================
function getScenarioOobTool(input) {
    try {
        var ctx = readInput(input);
        var sides = {
            RED:  { count: 0, countries: [], domains: [] },
            BLUE: { count: 0, countries: [], domains: [] },
        };
        var seenCountry = { RED: {}, BLUE: {} };
        var seenDomain = { RED: {}, BLUE: {} };
        var unitsOut = [];

        ctx.units.forEach(function (u) {
            var side = unitSide(u) === 'BLUE' ? 'BLUE' : 'RED';
            var prof = catalog.classifyUnit(u);
            var ll = unitLL(u);
            var country = (u && u.country != null) ? String(u.country) : null;

            sides[side].count++;
            if (country && !seenCountry[side][country]) { seenCountry[side][country] = true; sides[side].countries.push(country); }
            if (prof.domain && !seenDomain[side][prof.domain]) { seenDomain[side][prof.domain] = true; sides[side].domains.push(prof.domain); }

            var ident = unitIdentityFor(u);
            unitsOut.push({
                unit_uid: unitUid(u),
                side: side,
                domain: prof.domain,
                class: prof.class,
                country: country,
                lat: ll ? ll.lat : null,
                lon: ll ? ll.lon : null,
                // RMOOZ-UNIT-IDENTITY-CONTRACT-A: identity the LLM can trust — a
                // synthetic role-index label is flagged so the model never reads it as
                // a real platform. platform_name is "unknown" when not authored.
                display_name: ident ? ident.display_name : null,
                platform_name: ident ? ident.platform_name : null,
                identity_confidence: ident ? ident.identity_confidence : null,
                identity_warning: ident ? ident.warning : null,
            });
        });

        return ok('getScenarioOobTool', 'rmooz_deterministic', 'high', {
            sides: sides,
            units: unitsOut,
            total: unitsOut.length,
        });
    } catch (e) {
        return fail('getScenarioOobTool', e && e.message);
    }
}

// ============================================================================
// 2. getCapabilityIntelTool — best assets + not-recommended per mission. async.
//    Uses the LLM analyst only when opts.useLlm; otherwise the heuristic.
// ============================================================================
// Map our contract missions → (analyst mission key, coarse domains that fit).
var MISSION_FIT_DOMAINS = {
    air_intercept: ['air', 'air_defense'],
    naval_screen:  ['naval'],
    air_defense:   ['air_defense', 'air'],
    sensor:        ['radar'],
    ground_block:  ['ground'],
};
var MISSION_ANALYST_KEY = {
    air_intercept: 'air_intercept',
    naval_screen:  'naval_screen',
    air_defense:   'air_defense',
    sensor:        'sensor',
    ground_block:  'ground_hold',
};

function getCapabilityIntelTool(input) {
    var ctx = readInput(input);
    var defending = String(ctx.context.defending_side || 'BLUE').toUpperCase();
    var useLlm = ctx.opts.useLlm === true;
    var providerOverride = ctx.opts._providerOverride || null;
    // RMOOZ-AI-COA-PERFORMANCE-A: reuse capability profiles already built by the caller
    // (planCoas hands us _precomputed_profiles) so the LLM/heuristic analyst is NOT run a
    // second time for the same units/context. Optional _timing hook records the span.
    var precomputed = Array.isArray(ctx.opts._precomputed_profiles) ? ctx.opts._precomputed_profiles : null;
    var timing = (typeof ctx.opts._timing === 'function') ? ctx.opts._timing : null;
    var _capStart = Date.now();

    // analyzeUnitCapabilities is async (Promise) — wrap the whole tool in a Promise.
    return Promise.resolve()
        .then(function () {
            if (precomputed && precomputed.length) return precomputed; // reuse — no 2nd analyst call
            return analyst.analyzeUnitCapabilities(ctx.units, ctx.context, { useLlm: useLlm }, providerOverride);
        })
        .then(function (profiles) {
            profiles = arr(profiles);

            // Did any profile actually come from the LLM?
            var llmUsed = profiles.some(function (p) { return p && p.source === 'llm_inferred'; });

            // Index profiles by uid for fast lookup + domain checks.
            var profByUid = {};
            profiles.forEach(function (p) { if (p && p.unit_uid != null) profByUid[String(p.unit_uid)] = p; });

            var best = {};
            var notRec = {};
            var missions = ['air_intercept', 'naval_screen', 'air_defense', 'sensor', 'ground_block'];

            missions.forEach(function (m) {
                var analystKey = MISSION_ANALYST_KEY[m];
                var rows = analyst.selectBestUnitsForMission(profiles, analystKey, defending, undefined);
                // Keep only positive-scoring rows; drop zero-capability noise.
                best[m] = rows.filter(function (r) { return Number(r.score) > 0; })
                    .map(function (r) { return { unit_uid: r.unit_uid, class: r.class, score: r.score }; });

                // not_recommended = units whose coarse domain is wrong for this mission.
                var fitDomains = MISSION_FIT_DOMAINS[m] || [];
                notRec[m] = profiles
                    .filter(function (p) {
                        var d = p && p.domain;
                        return fitDomains.indexOf(d) === -1;
                    })
                    .map(function (p) { return p.unit_uid; })
                    .filter(function (id) { return id != null; });
            });

            if (timing) timing('get_capability_intel_tool_ms', Date.now() - _capStart);
            return ok(
                'getCapabilityIntelTool',
                llmUsed ? 'llm_inferred' : 'catalog',
                llmUsed ? 'medium' : 'medium',
                {
                    best: {
                        air_intercept: best.air_intercept || [],
                        naval_screen: best.naval_screen || [],
                        air_defense: best.air_defense || [],
                        sensor: best.sensor || [],
                        ground_block: best.ground_block || [],
                    },
                    not_recommended_for: {
                        air_intercept: notRec.air_intercept || [],
                        naval_screen: notRec.naval_screen || [],
                        ground_block: notRec.ground_block || [],
                    },
                    profiles_count: profiles.length,
                    profile_source: llmUsed ? 'llm_inferred' : 'heuristic',
                    profile_reused: !!(precomputed && precomputed.length),  // RMOOZ-AI-COA-PERFORMANCE-A
                }
            );
        })
        .catch(function (e) {
            if (timing) timing('get_capability_intel_tool_ms', Date.now() - _capStart);
            return fail('getCapabilityIntelTool', e && e.message);
        });
}

// ============================================================================
// 3. getTerrainIntelTool — honest terrain summary (false when unavailable).
// ============================================================================
function getTerrainIntelTool(input) {
    try {
        var ctx = readInput(input);
        var summary = terrain.terrainSummary(ctx.units, ctx.objectives, ctx.context);
        // terrainEffect on a representative unit to surface route notes (if any).
        var repUnit = ctx.units[0] || {};
        var eff = terrain.terrainEffect(repUnit, null, null, ctx.context);
        var available = !!eff.terrain_available;
        var notes = eff.terrain_notes || '';

        return ok('getTerrainIntelTool', 'rmooz_deterministic', available ? 'medium' : 'low', {
            terrain_available: available,
            summary: summary,
            notes: notes,
        });
    } catch (e) {
        return fail('getTerrainIntelTool', e && e.message);
    }
}

// ============================================================================
// 4. getSovereignZoneIntelTool — inferred zones + nearest RED unit's zone state.
// ============================================================================
function getSovereignZoneIntelTool(input) {
    try {
        var ctx = readInput(input);
        var scenario = {
            units: ctx.units,
            objectives: ctx.objectives,
            name: ctx.context.scenario_name || ctx.context.name || null,
        };
        var inferred = zones.inferZones(scenario, ctx.objectives);
        var obj = objLL(ctx.objectives, ctx.context);

        // Nearest RED unit to the objective (the worst potential violator).
        var nearestRed = null, bestD = Infinity;
        ctx.units.forEach(function (u) {
            if (unitSide(u) !== 'RED') return;
            var ll = unitLL(u);
            if (!ll) return;
            var d = obj ? (degDist(ll, obj) || Infinity) : 0;
            if (d < bestD) { bestD = d; nearestRed = u; }
        });

        var zoneState = zones.evaluateZone(
            nearestRed || {},
            nearestRed ? unitLL(nearestRed) : null,
            inferred
        );

        return ok('getSovereignZoneIntelTool', 'rmooz_deterministic', 'medium', {
            zones: inferred,
            nearest_red_zone: {
                zone_type: zoneState.zone_type,
                owner_country: zoneState.owner_country,
                violation: !!zoneState.violation,
                severity: zoneState.severity,
            },
        });
    } catch (e) {
        return fail('getSovereignZoneIntelTool', e && e.message);
    }
}

// ============================================================================
// 5. getContactPictureTool — defender's sensor picture.
// ============================================================================
function getContactPictureTool(input) {
    try {
        var ctx = readInput(input);
        var defending = String(ctx.context.defending_side || 'BLUE').toUpperCase();
        var obj = objLL(ctx.objectives, ctx.context);
        var contactCtx = Object.assign({}, ctx.context, { defending_side: defending, objective: obj });
        var picture = contacts.buildContactPicture(ctx.units, contactCtx);
        return ok('getContactPictureTool', 'rmooz_deterministic', 'medium', picture);
    } catch (e) {
        return fail('getContactPictureTool', e && e.message);
    }
}

// ============================================================================
// 6. getRoeStateTool — ROE/alert state. engage/destroy/open_fire always blocked.
// ============================================================================
function getRoeStateTool(input) {
    try {
        var ctx = readInput(input);
        var defending = String(ctx.context.defending_side || 'BLUE').toUpperCase();

        // Derive the zone state + contact picture from the same deterministic tools.
        var zoneEnvelope = getSovereignZoneIntelTool(input);
        var contactEnvelope = getContactPictureTool(input);

        // Reconstruct a zone-state object for escalate() from the inferred zones +
        // the nearest RED unit (escalate keys off severity).
        var scenario = { units: ctx.units, objectives: ctx.objectives };
        var inferred = zones.inferZones(scenario, ctx.objectives);
        var obj = objLL(ctx.objectives, ctx.context);
        var nearestRed = null, bestD = Infinity;
        ctx.units.forEach(function (u) {
            if (unitSide(u) !== 'RED') return;
            var ll = unitLL(u); if (!ll) return;
            var d = obj ? (degDist(ll, obj) || Infinity) : 0;
            if (d < bestD) { bestD = d; nearestRed = u; }
        });
        var zoneState = zones.evaluateZone(nearestRed || {}, nearestRed ? unitLL(nearestRed) : null, inferred);
        var picture = (contactEnvelope.ok && contactEnvelope.data) || {};

        var escalation = roe.escalate(zoneState, picture, { defending_side: defending });

        return ok('getRoeStateTool', 'rmooz_deterministic', 'medium', {
            alert_state: escalation.alert_state,
            roe_state: escalation.roe_state,
            allowed_actions: escalation.allowed_actions,
            blocked_actions: escalation.blocked_actions,
            nearest_red_zone: zoneEnvelope.ok ? zoneEnvelope.data.nearest_red_zone : null,
        });
    } catch (e) {
        return fail('getRoeStateTool', e && e.message);
    }
}

// ============================================================================
// 7. getPreviousTurnsTool — prior-turn / prior-family history.
// ============================================================================
function getPreviousTurnsTool(input) {
    try {
        var ctx = readInput(input);
        var prevTurns = arr(ctx.context.previous_turns);
        var prevFamilies = arr(ctx.context.previous_coa_families).map(function (f) { return String(f); });

        var lastN = prevTurns.map(function (t) {
            t = isObj(t) ? t : {};
            return {
                turn: t.turn != null ? t.turn : null,
                side: t.side != null ? String(t.side).toUpperCase() : null,
                coa_family: t.coa_family != null ? String(t.coa_family) : (t.selected_coa_family != null ? String(t.selected_coa_family) : null),
            };
        });

        // last_families: prefer explicit previous_coa_families, else derive from turns.
        var lastFamilies = prevFamilies.length
            ? prevFamilies.slice()
            : lastN.map(function (t) { return t.coa_family; }).filter(function (f) { return f != null; });

        return ok('getPreviousTurnsTool', 'rmooz_deterministic', 'high', {
            last_n: lastN,
            last_families: lastFamilies,
            n: lastN.length,
        });
    } catch (e) {
        return fail('getPreviousTurnsTool', e && e.message);
    }
}

// ============================================================================
// COA-family mapping: coa-variation-engine vocabulary → this contract taxonomy.
// ============================================================================
var COA_ENGINE_TO_CONTRACT = {
    air_intercept: 'air_intercept',
    naval_screen: 'naval_screen',
    ground_blocking: 'ground_block',
    recon_probe: 'recon_probe',
    hold_and_defend: 'hold_and_warn',
    flank: 'shift_axis',
    feint: 'deception_feint',
    disperse: 'shift_axis',
    reinforce: 'reinforce_defense',
    strike_package: 'maintain_intercept',
};
function mapEngineFamily(f) {
    return COA_ENGINE_TO_CONTRACT[lc(f)] || null;
}

// Derive the allowed families from the situation/threat domain.
function deriveAllowedFamilies(input) {
    var ctx = readInput(input);
    var sit = situationTrig.evaluateFreeFightSituation(ctx.units, ctx.objectives, ctx.context);

    // Zone state on the nearest RED gives us the threat domain.
    var scenario = { units: ctx.units, objectives: ctx.objectives };
    var inferred = zones.inferZones(scenario, ctx.objectives);
    var obj = objLL(ctx.objectives, ctx.context);
    var nearestRed = null, bestD = Infinity;
    ctx.units.forEach(function (u) {
        if (unitSide(u) !== 'RED') return;
        var ll = unitLL(u); if (!ll) return;
        var d = obj ? (degDist(ll, obj) || Infinity) : 0;
        if (d < bestD) { bestD = d; nearestRed = u; }
    });
    var zoneState = zones.evaluateZone(nearestRed || {}, nearestRed ? unitLL(nearestRed) : null, inferred);
    var threatDomain = lc(zoneState.zone_type);
    var violation = !!zoneState.violation && (sit.ok !== false);

    var allowed = [];
    function add(f) { if (COA_FAMILIES.indexOf(f) !== -1 && allowed.indexOf(f) === -1) allowed.push(f); }

    var airThreat = /air|airspace|intercept/.test(threatDomain);
    var navalThreat = /naval|water|sea|maritime|territorial/.test(threatDomain);
    var groundThreat = /ground|land|buffer/.test(threatDomain);

    if (violation && airThreat) {
        add('air_intercept'); add('maintain_intercept'); add('air_defense_posture'); add('sensor_tasking');
    } else if (violation && navalThreat) {
        add('naval_screen'); add('sensor_tasking');
    } else if (violation && groundThreat) {
        add('ground_block'); add('reinforce_defense'); add('sensor_tasking');
    } else {
        // No active threat → posture toward recon/hold.
        add('recon_probe'); add('hold_and_warn'); add('sensor_tasking');
    }

    // Always offer variation options at the tail (so alternatives exist).
    add('deception_feint'); add('shift_axis'); add('reinforce_defense'); add('hold_and_warn'); add('recon_probe');

    return { allowed: allowed, threatDomain: threatDomain, violation: violation, situation: sit };
}

// ============================================================================
// 8. getCoaFamilyOptionsTool — allowed/recommended families, avoid repeats.
// ============================================================================
function getCoaFamilyOptionsTool(input) {
    try {
        var ctx = readInput(input);
        var derived = deriveAllowedFamilies(input);
        var allowed = derived.allowed;

        // avoid_repeating = last 1-2 families from previous turns.
        var prevTool = getPreviousTurnsTool(input);
        var lastFamilies = (prevTool.ok && arr(prevTool.data.last_families)) || [];
        var avoidRepeating = lastFamilies.slice(Math.max(0, lastFamilies.length - 2)).map(function (f) { return String(f); });

        // Drive the natural choice via the coa-variation-engine, mapped into our taxonomy.
        var coaSituation = {
            threat_domain: derived.threatDomain,
            violation: derived.violation,
        };
        var pick = coaVariation.selectCoaFamily(coaSituation, avoidRepeating, null, null, null);
        var mappedRecommend = mapEngineFamily(pick.recommended_family);

        // recommended_family = first allowed family not in avoid_repeating; prefer
        // the variation-engine's pick when it maps into an allowed, non-repeating slot.
        var recommended = null;
        if (mappedRecommend && allowed.indexOf(mappedRecommend) !== -1 && avoidRepeating.indexOf(mappedRecommend) === -1) {
            recommended = mappedRecommend;
        }
        if (!recommended) {
            for (var i = 0; i < allowed.length; i++) {
                if (avoidRepeating.indexOf(allowed[i]) === -1) { recommended = allowed[i]; break; }
            }
        }
        if (!recommended) recommended = allowed[0] || COA_FAMILIES[0];

        var reason = 'Allowed families derived from threat domain "' + (derived.threatDomain || 'none') +
            '" (violation=' + derived.violation + '); recommended "' + recommended +
            '" (variation-engine natural pick "' + (mappedRecommend || pick.recommended_family) +
            '"); avoiding recently used: [' + avoidRepeating.join(', ') + '].';

        return ok('getCoaFamilyOptionsTool', 'rmooz_deterministic', 'medium', {
            allowed_families: allowed,
            recommended_family: recommended,
            avoid_repeating: avoidRepeating,
            reason: reason,
        });
    } catch (e) {
        return fail('getCoaFamilyOptionsTool', e && e.message);
    }
}

// ============================================================================
// 9. scoreCoaCandidatesTool — deterministic scoring of COA candidates.
// ============================================================================
// Which capability dimension a family's mission keys off (rich analyst scores).
var FAMILY_SCORE_KEY = {
    air_intercept: 'intercept',
    maintain_intercept: 'intercept',
    air_defense_posture: 'air_defense',
    naval_screen: 'naval_screen',
    ground_block: 'ground_hold',
    reinforce_defense: 'ground_hold',
    recon_probe: 'sensor',
    sensor_tasking: 'sensor',
    hold_and_warn: 'survivability',
    deception_feint: 'mobility',
    shift_axis: 'mobility',
};
// Coarse domains that fit a family (for capability_fit fallback / penalties).
var FAMILY_FIT_DOMAINS = {
    air_intercept: ['air', 'air_defense'],
    maintain_intercept: ['air', 'air_defense'],
    air_defense_posture: ['air_defense', 'air'],
    naval_screen: ['naval'],
    ground_block: ['ground'],
    reinforce_defense: ['ground', 'base'],
    recon_probe: ['radar', 'air', 'naval'],
    sensor_tasking: ['radar'],
    hold_and_warn: ['air', 'naval', 'ground', 'air_defense', 'base', 'radar'],
    deception_feint: ['air', 'naval', 'ground'],
    shift_axis: ['air', 'naval', 'ground'],
};

function scoreCoaCandidatesTool(input) {
    try {
        var ctx = readInput(input);
        var candidates = arr(ctx.raw.candidates);
        var obj = objLL(ctx.objectives, ctx.context);
        var prevFamilies = arr(ctx.context.previous_coa_families).map(lc);

        // Index units by uid + classify once.
        var unitByUid = {};
        ctx.units.forEach(function (u) { var id = unitUid(u); if (id != null) unitByUid[String(id)] = u; });

        // Terrain modifier (shared across candidates, deterministic).
        var terrainSummary = lc(terrain.terrainSummary(ctx.units, ctx.objectives, ctx.context));
        var terrainAvailable = terrainSummary.indexOf('unavailable') === -1 && terrainSummary.indexOf('unclassified') === -1;

        var scored = candidates.map(function (cand) {
            cand = isObj(cand) ? cand : {};
            var family = lc(cand.family);
            var scoreKey = FAMILY_SCORE_KEY[family] || 'survivability';
            var fitDomains = FAMILY_FIT_DOMAINS[family] || null;
            var assignedIds = arr(cand.units).map(function (x) { return String(x); });

            var capSum = 0, fitCount = 0, readinessSum = 0, supplySum = 0, n = 0;
            var distSum = 0, distN = 0;

            assignedIds.forEach(function (id) {
                var u = unitByUid[id];
                if (!u) return;
                n++;
                var prof = catalog.classifyUnit(u);
                // capability_fit: domain match for the family.
                if (!fitDomains || fitDomains.indexOf(prof.domain) !== -1) fitCount++;
                // capability score for the family's key (use catalog coarse score where mapped).
                var cs = prof.capability_scores || {};
                var keyVal = cs[scoreKey];
                if (keyVal == null) {
                    // map rich-only keys back to coarse equivalents
                    if (scoreKey === 'intercept') keyVal = cs.air_superiority;
                    else if (scoreKey === 'naval_screen') keyVal = cs.naval_strike;
                    else if (scoreKey === 'ground_hold') keyVal = cs.ground_attack;
                }
                capSum += Number(keyVal) || 0;

                var readiness = finiteN(u.readiness);
                readinessSum += readiness == null ? 0.7 : Math.max(0, Math.min(1, readiness));
                var supply = finiteN(u.supply);
                supplySum += supply == null ? 0.7 : Math.max(0, Math.min(1, supply));

                // distance unit → target (or objective).
                var tgt = (cand.target && unitLL(cand.target)) || obj;
                var ull = unitLL(u);
                if (tgt && ull) { var d = degDist(ull, tgt); if (d != null) { distSum += d; distN++; } }
            });

            var capabilityFit = n ? Math.round((capSum / n) * (fitCount / n) * 10) / 10 : 0;
            var readiness = n ? Math.round((readinessSum / n) * 100) / 100 : 0.7;
            var supply = n ? Math.round((supplySum / n) * 100) / 100 : 0.7;
            var avgDist = distN ? distSum / distN : null;
            // distance score: closer is better, normalized into roughly 0-100.
            var distanceScore = avgDist == null ? 50 : Math.max(0, Math.round((1 - Math.min(avgDist / 1.0, 1)) * 100));
            var terrainMod = terrainAvailable ? 5 : 0;
            // ROE alignment: families that are posture/intercept-aligned score better.
            var roeAlign = (family === 'air_intercept' || family === 'maintain_intercept' ||
                            family === 'air_defense_posture' || family === 'naval_screen' ||
                            family === 'ground_block' || family === 'reinforce_defense') ? 8 : 4;
            var previousUsePenalty = prevFamilies.indexOf(family) !== -1 ? -25 : 0;
            // risk: more distance + low readiness = more risk (negative component).
            var risk = -Math.round(((avgDist == null ? 0 : Math.min(avgDist, 1)) * 20) + ((1 - readiness) * 15));

            var components = {
                capability_fit: capabilityFit,
                distance: distanceScore,
                readiness: Math.round(readiness * 100),
                supply: Math.round(supply * 100),
                terrain: terrainMod,
                roe: roeAlign,
                previous_use_penalty: previousUsePenalty,
                risk: risk,
            };

            var score = Math.round(
                capabilityFit * 1.0 +
                distanceScore * 0.4 +
                components.readiness * 0.2 +
                components.supply * 0.1 +
                terrainMod +
                roeAlign +
                previousUsePenalty +
                risk
            );

            return { family: cand.family != null ? String(cand.family) : null, score: score, components: components };
        });

        var best = null;
        scored.forEach(function (s) { if (!best || s.score > best.score) best = s; });

        return ok('scoreCoaCandidatesTool', 'rmooz_deterministic', 'medium', {
            scored: scored,
            best: best,
        });
    } catch (e) {
        return fail('scoreCoaCandidatesTool', e && e.message);
    }
}

// ============================================================================
// LLM commander_decision output schema (documented for the prompt pack).
// ============================================================================
var LLM_COMMANDER_DECISION_SCHEMA = {
    commander_decision_id: '<string>',
    active_side: 'RED|BLUE',
    selected_coa_family: '<one of allowed_coa_families>',
    recommended_coa: '<short phrase>',
    alternatives: [],
    unit_assignments: [{
        unit_uid: '<MUST be one of allowed_unit_ids>',
        role: '<the tactical role you choose>',
        action_type: '<recon|delay|deceive|flank|defend|withdraw|probe|attack|hold|avoid_contact|support|reserve|reposition|screen|observe|feint — movement/positioning only, NEVER engage/destroy/kill>',
        target: '<{lat,lon} or objective ref>',
        reason: '<short phrase>',
        capability_reason: '<why this unit fits the action>',
        source_tool_refs: [],
    }],
    warning_actions: [],
    expected_reaction: '<short phrase>',
    risk: '<low|medium|high>',
    confidence: '<low|medium|high>',
    review_required: true,
};

// ============================================================================
// 10. validateCommanderCoaTool — schema/safety validator + deterministic repair.
// ============================================================================
function roleIsAirIntercept(role, action) {
    return AIR_INTERCEPT_ROLES.indexOf(lc(role)) !== -1 || lc(action) === 'intercept';
}
function roleIsGround(role) {
    return GROUND_ROLES.indexOf(lc(role)) !== -1;
}
function actionIsKill(role, action) {
    var s = lc(role) + ' ' + lc(action);
    return /engage|destroy|kill|open[_ ]?fire|strike_to_kill/.test(s);
}

function validateCommanderCoaTool(input) {
    try {
        var inp = isObj(input) ? input : {};
        var decision = isObj(inp.decision) ? inp.decision : null;
        var units = arr(inp.units);
        var objectives = arr(inp.objectives);
        var prevFamilies = arr(inp.previous_coa_families).map(function (f) { return String(f); });
        var allowedFamilies = arr(inp.allowed_families).map(function (f) { return String(f); });

        var violations = [];

        // Structural check: a decision must exist and carry the core fields.
        if (!decision) {
            return ok('validateCommanderCoaTool', 'rmooz_deterministic', 'high', {
                accepted: false,
                rejected_reason: 'missing_decision',
                violations: [{ code: 'missing_decision', text: 'No decision object provided.' }],
                repaired_decision: null,
            });
        }
        if (decision.selected_coa_family == null || !Array.isArray(decision.unit_assignments)) {
            violations.push({ code: 'missing_required_structure', text: 'decision missing selected_coa_family or unit_assignments[].' });
        }

        // Allowed-id set (explicit allowed_unit_ids, else the provided units).
        var idSet = allowedIdSet(units, inp.allowed_unit_ids);
        // Classify units by uid for domain checks.
        var unitByUid = {};
        units.forEach(function (u) { var id = unitUid(u); if (id != null) unitByUid[String(id)] = u; });
        // Objective id/name set for objective-movement guard.
        var objRefs = {};
        objectives.forEach(function (o) {
            if (!o) return;
            if (o.id != null) objRefs[String(o.id)] = true;
            if (o.uid != null) objRefs[String(o.uid)] = true;
            if (o.name != null) objRefs[String(o.name)] = true;
            if (o.label != null) objRefs[String(o.label)] = true;
        });

        var assignments = arr(decision.unit_assignments);
        var keptAssignments = [];

        assignments.forEach(function (a) {
            a = isObj(a) ? a : {};
            var uid = a.unit_uid != null ? String(a.unit_uid) : null;
            var role = a.role;
            var action = a.action_type;
            var dropped = false;

            // kill/destroy action — always blocked.
            if (actionIsKill(role, action)) {
                violations.push({ code: 'kill_action_blocked', unit_uid: uid, text: 'Kill/destroy/open-fire actions are blocked in this review-only contract.' });
                dropped = true;
            }

            // objective movement — a unit_uid that is actually an objective.
            if (uid != null && objRefs[uid]) {
                violations.push({ code: 'objective_movement', unit_uid: uid, text: 'Assignment targets an objective id/name as a unit — objectives do not move.' });
                dropped = true;
            }

            // invented unit id.
            if (uid == null || (!idSet[uid] && !unitByUid[uid])) {
                violations.push({ code: 'invented_unit_id', unit_uid: uid, text: 'unit_uid "' + uid + '" is not in allowed_unit_ids.' });
                dropped = true;
            }

            // RMOOZ-AI-COMMANDER-FREEDOM-A: the validator checks STRUCTURE and PHYSICS only.
            // It does NOT enforce doctrine — it must not reject recon/delay/screen/flank/
            // deceive/withdraw just because they are not attack/intercept/defend. The old
            // domain-role matrix (ground_unit_air_intercept / aircraft_as_infantry /
            // impossible_domain_role) and the repeated-family rule were doctrine and are
            // removed. The AI is free to choose a realistic action; the operator reviews it.
            var u = uid != null ? unitByUid[uid] : null;

            // PHYSICS — naval unit cannot perform an explicit land move (kept; data-based,
            // not a label). Only triggers on an explicit land_move action_type.
            if (u && catalog.classifyUnit(u).domain === 'naval' && lc(action) === 'land_move') {
                violations.push({ code: 'naval_land_move', unit_uid: uid, text: 'Naval unit assigned an explicit land move.' });
                dropped = true;
            }

            // PHYSICS — a target, if present, must be well-formed and inside the world.
            var tgt = a.target ? unitLL(a.target) : null;
            if (a.target && !tgt) {
                violations.push({ code: 'malformed_target', unit_uid: uid, text: 'Assignment target has no valid lat/lon.' });
                dropped = true;
            }
            if (tgt && !targetInBounds(tgt, inp.map_bounds)) {
                violations.push({ code: 'out_of_bounds', unit_uid: uid, text: 'Target coordinate is outside the map bounds.' });
                dropped = true;
            }

            // PHYSICS — teleport guard: target too far from the unit's current position.
            if (u && tgt) {
                var ull = unitLL(u);
                if (ull) {
                    var d = degDist(ull, tgt);
                    if (d != null && d > SAFE_STEP_DEG) {
                        violations.push({ code: 'teleport_guard', unit_uid: uid, text: 'Target is ' + round4(d) + '° away (> ' + SAFE_STEP_DEG + '° safe step).' });
                        dropped = true;
                    }
                }
            }

            if (!dropped) keptAssignments.push(a);
        });

        // NOTE: repeated_coa_family was removed — forcing family variation is doctrine, not
        // physics. Diversity is encouraged by generation/prompting, never by rejection.
        // prevFamilies/allowedFamilies are accepted for signature compatibility but do not
        // cause rejection here.
        void prevFamilies; void allowedFamilies;

        var accepted = violations.length === 0;

        // Build a repaired_decision: drop only the physically/structurally invalid
        // assignments. Tactical choice is preserved verbatim.
        var repaired = null;
        if (!accepted) {
            repaired = Object.assign({}, decision);
            repaired.unit_assignments = keptAssignments;
            repaired.review_required = true;
        }

        return ok('validateCommanderCoaTool', 'rmooz_deterministic', 'high', {
            accepted: accepted,
            rejected_reason: accepted ? null : (violations[0] && violations[0].code) || 'rejected',
            violations: violations,
            repaired_decision: repaired,
            checks: 'structure_physics_only',  // doctrine is NOT validated
        });
    } catch (e) {
        return fail('validateCommanderCoaTool', e && e.message);
    }
}

// ============================================================================
// 11. buildCommanderPromptPack — the full deterministic prompt pack. async.
// ============================================================================
// RMOOZ-AI-ATTACK-PLAN-MCP-PROMPT-A: the MCP/tool-contract layer is the SINGLE SOURCE OF TRUTH
// for the commander instruction. The planner/UI must not invent a separate prompt — they call
// composeCommanderPrompt() below. These realism/selection rules are NOT doctrine bias (they do
// not force intercept/defend/attack — they forbid forcing a full attack and demand the commander
// SELECT a relevant force package and explain it), so they stay compatible with FREEDOM-B.
var MCP_COMMANDER_INSTRUCTIONS = [
    'Think like a commander, not a script.',
    'Do NOT move all units — select ONLY the units relevant to the objective.',
    'Prefer nearby, suitable, ready, and supplied units; hold/recon/screen/support with the rest.',
    'Reason from the objective country / sovereign zone, terrain, threat rings, the movement corridor, the choke point, and the objective location.',
    'Decide per unit whether to recon, hold, delay, flank, defend, withdraw, deceive, probe, support, reserve, or attack — do NOT force a full attack.',
    'Do NOT move units from all countries unless there is a clear military reason.',
    'For every SELECTED unit, explain why_unit it was chosen.',
    'For units you do NOT move, explain why in non_selected_units.',
    'Return ONLY valid JSON.',
    // RMOOZ-SCC-COA-COMMANDER-QUALITY-AI: strict JSON-only output + commander structure (the model must
    // produce a real commander COA, not a loose recon sketch). These make the LLM path reliable + rich.
    'Output EXACTLY ONE JSON object: no markdown, no ``` code fences, no prose before or after the JSON, no trailing commentary.',
    'Each COA MUST include these fields: commander_intent, main_effort, supporting_effort, reserve_or_follow_on, security_or_screen, red_assumption, risk_mitigation, success_criteria, risk (low|medium|high), confidence (low|medium|high), and a non-empty "phases" array.',
    'Each phase MUST include: phase_id, title (or name), purpose, and a non-empty "actions" array.',
    'Each action MUST include: unit_uid (ONLY from allowed_unit_ids — never invent a unit), role, action_type, a "reason", roe_status (allowed|restricted|blocked), taskable (true|false); for any movement action the target MUST have numeric lat AND lon (NEVER null).',
    'Give role-separated targets: do NOT send all units to the objective center, and do NOT give all units the same target.',
    'For units restricted by ROE or not taskable, use action_type HOLD with no movement target.',
];
// RMOOZ-AI-COMMANDER-FREEDOM-B kept the structure/physics rules + freedom (no doctrine bias);
// RMOOZ-AI-ATTACK-PLAN-MCP-PROMPT-A folds in the commander-realism / unit-selection rules.
var SYSTEM_CONTRACT = [
    'You are an RMOOZ commander AI for an advisory-only wargame.',
    'Use ONLY the provided tools_context.',
    'Think like a commander, not a script: select ONLY the units relevant to the objective and do NOT move all units.',
    'Prefer nearby, suitable, ready, supplied units; hold/recon/screen/support with the rest.',
    'Reason from the objective country / sovereign zone, terrain, threat rings, corridor, choke point, and objective location.',
    'You may freely choose any tactical action (recon/hold/delay/flank/defend/withdraw/deceive/probe/support/reserve/attack); do not force intercept/defend/attack and do NOT force a full attack.',
    'Do NOT move units from all countries unless there is a clear military reason.',
    'Explain why each selected unit is used and why the others are not moved.',
    'Return ONLY JSON matching allowed_output_schema — output EXACTLY ONE JSON object, with no markdown, no code fences, and no text before or after the JSON.',
    'Each COA must carry commander structure: commander_intent, main_effort, supporting_effort, reserve_or_follow_on, security_or_screen, red_assumption, risk_mitigation, success_criteria, risk, confidence, and non-empty phases; each action must carry a reason, roe_status, taskable, and (for movement) a numeric lat+lon target — never null and never all on the objective center.',
    'Every unit_uid MUST be in allowed_unit_ids; use only coordinates inside the map; do not invent units; do not teleport (no impossible movement).',
    'NEVER output engage/destroy/kill — movement/positioning only. review_required:true.',
].join(' ');

// RMOOZ-AI-ATTACK-PLAN-MCP-PROMPT-A: compose the EXACT commander messages to send to the local
// LLM, from the deterministic tool pack. This is the one place the commander prompt is built —
// the planner sends this verbatim and also attaches it to the plan (so the UI's "View MCP Prompt"
// shows precisely what the AI was instructed with). Requests the COA-array output the planner
// consumes. extras: { objective, terrain_zone_context, commander_mode, active_side,
// allowed_tactical_actions, coa_archetypes, previous_coa_families }.
function composeCommanderPrompt(packEnvelope, extras) {
    extras = extras || {};
    var data = (packEnvelope && packEnvelope.data) || (packEnvelope && packEnvelope.tools_context ? packEnvelope : {});
    var version = (packEnvelope && packEnvelope.version) || TOOL_CONTRACT_VERSION;
    var tc = data.tools_context || {};
    var oob = (tc.oob && tc.oob.data) || {};
    var capability = (tc.capability && tc.capability.data) || null;
    var zone = (tc.zone && tc.zone.data) || null;
    var contacts = (tc.contacts && tc.contacts.data) || null;
    var roe = (tc.roe && tc.roe.data) || null;
    var allowedUnitIds = arr(data.allowed_unit_ids);
    var allowedFamilies = arr(data.allowed_coa_families);
    // OOB units (identity + country + domain + position) — the force pool the commander selects from.
    var units = arr(oob.units).map(function (u) {
        return { unit_uid: u.unit_uid, side: u.side, country: u.country, domain: u.domain, class: u.class,
            lat: u.lat, lon: u.lon, platform_name: u.platform_name, display_name: u.display_name };
    });
    // RMOOZ-AI-FREE-FIGHT-CANDIDATE-PREFILTER-A: when the planner supplies a pre-filtered candidate set,
    // restrict the force pool + allowed_unit_ids to it — the model only ever sees the relevant 10–25
    // units (a small problem for a small model) and must choose ONLY from selected_candidates.
    var candidateIds = arr(extras.candidate_unit_ids).map(String);
    var prefiltered = candidateIds.length > 0;
    var nonCandidateSummary = arr(extras.non_candidate_summary);
    var candSet = {};
    candidateIds.forEach(function (id) { candSet[id] = true; });
    if (prefiltered) {
        units = units.filter(function (u) { return candSet[String(u.unit_uid)]; });
        allowedUnitIds = candidateIds.slice();
    }
    // Keep the WHOLE prompt within the candidate set — otherwise capability_intel's per-mission
    // best/not-recommended lists re-introduce the full (300+) force into the prompt and defeat the
    // problem-size reduction. Filters each mission's unit list to the candidates when pre-filtered.
    function _candCap(byMission) {
        if (!prefiltered || !byMission || typeof byMission !== 'object') return byMission;
        var out = {};
        Object.keys(byMission).forEach(function (m) {
            out[m] = arr(byMission[m]).filter(function (e) { return e && candSet[String(e.unit_uid)]; });
        });
        return out;
    }
    var promptObject = {
        mission: 'Produce a commander course-of-action decision. Think like a commander, not a script.',
        coa_requirement: 'Return 2-3 genuinely different courses of action in "coas" (e.g. a cautious/recon option, a maneuver/flank/deception option, and a direct option). Within EACH COA select ONLY the relevant units — do not move all units.',
        active_side: extras.active_side || null,
        commander_mode: extras.commander_mode || 'free',
        objective: extras.objective || null,
        objective_country_zone: zone ? { nearest_red_zone: zone.nearest_red_zone, zones_count: arr(zone.zones).length } : null,
        force_pool: units,
        allowed_unit_ids: allowedUnitIds,
        // RMOOZ-AI-FREE-FIGHT-CANDIDATE-PREFILTER-A: the pre-screened relevant units (detailed) + a
        // grouped summary of why the rest of the force was excluded. Present only when pre-filtered.
        selected_candidates: prefiltered ? units : undefined,
        non_candidate_summary: prefiltered ? nonCandidateSummary : undefined,
        capability_intel: capability ? { best: _candCap(capability.best), not_recommended_for: _candCap(capability.not_recommended_for) } : null,
        terrain_zone_context: extras.terrain_zone_context || null,
        contact_picture: contacts ? { detected_contacts: arr(contacts.detected_contacts).length } : null,
        roe_state: roe ? { alert_state: roe.alert_state, roe_state: roe.roe_state } : null,
        allowed_coa_families: allowedFamilies,
        allowed_tactical_actions: extras.allowed_tactical_actions || null,
        coa_archetypes: extras.coa_archetypes || null,
        previous_coa_families: arr(extras.previous_coa_families),
        commander_selection_rules: prefiltered
            ? ['Choose ONLY from selected_candidates / allowed_unit_ids — these are the pre-screened relevant units for this objective; the rest of the force was excluded (see non_candidate_summary) and must NOT be moved.'].concat(MCP_COMMANDER_INSTRUCTIONS)
            : MCP_COMMANDER_INSTRUCTIONS,
        required_output_schema: {
            coas: [{
                plan_id: 'COA-1', title: 'string',
                coa_family: 'cautious_recon|maneuver_deception|direct_action',
                objective_id: 'string', summary: 'string', recommended: false,
                risk: 'low|medium|high', confidence: 'low|medium|high',
                units_total_considered: 0, units_selected_count: 0,
                phases: [{ phase_id: 'phase-1', name: 'Move', actions: [{
                    unit_uid: '<one of allowed_unit_ids>', side: 'RED|BLUE',
                    role: 'assault|support|screen|reserve|recon|hold|defend',
                    action_type: (extras.allowed_tactical_actions ? extras.allowed_tactical_actions.join('|') : 'recon|delay|deceive|flank|defend|withdraw|probe|attack|hold|avoid_contact|support|reserve|reposition|screen|observe|feint'),
                    target: { lat: 0, lon: 0, type: 'objective|coord' },
                    reason: '<one sentence>', why_unit: '<why THIS unit is in the force package>',
                    deciding_factor: '<terrain/zone/objective/country factor>',
                }] }],
                non_selected_units: [{ unit_uid: '<a unit you did NOT move>', reason: '<why it is held back>' }],
                risks: ['string'], assumptions: ['string'],
            }],
        },
        constraints: 'Return 2-3 COAs (not just one). unit_uid MUST be exactly one of allowed_unit_ids'
            + (prefiltered ? ' (the pre-screened selected_candidates — do NOT use or move any other unit)' : '')
            + '; coordinates inside the map; no teleport; no invented units; NEVER engage/destroy/open-fire; return ONLY JSON.',
    };
    return {
        version: version,
        system: SYSTEM_CONTRACT,
        prompt: JSON.stringify(promptObject),
        prompt_object: promptObject,
        commander_instructions: MCP_COMMANDER_INSTRUCTIONS.slice(),
        tools_context_summary: Object.keys(tc),
        allowed_unit_ids: allowedUnitIds,
        allowed_coa_families: allowedFamilies,
        objective: extras.objective || null,
        terrain_zone_context: extras.terrain_zone_context || null,
        force_pool_count: units.length,
    };
}

// RMOOZ-AI-COMMANDER-REPAIR-LOOP-A: compose a REPAIR instruction after validateCommanderCoaTool
// rejects an LLM COA. Sends the validator's violations back to the model so it fixes ONLY the broken
// assignments, reusing the same allowed lists + output schema. Returns the same
// { version, system, prompt, allowed_unit_ids } shape composeCommanderPrompt does, so the planner's
// _callLlm can send it verbatim (via context._mcp_prompt). Deterministic; no LLM call of its own.
// extras: { previous_coas, violations, allowed_unit_ids, allowed_actions, objective, active_side }.
function composeRepairPrompt(extras) {
    extras = extras || {};
    var allowedUnitIds = arr(extras.allowed_unit_ids);
    var violations = arr(extras.violations).map(function (v) {
        return { code: v && v.code, unit_uid: (v && v.unit_uid) || null, problem: String((v && v.text) || '').slice(0, 200) };
    });
    // Trim the rejected COAs to the essentials the model needs to repair.
    var prevCoas = arr(extras.previous_coas).map(function (c) {
        return {
            plan_id: c && c.plan_id, title: c && c.title, recommended: !!(c && c.recommended),
            phases: arr(c && c.phases).map(function (ph) {
                return { name: ph && ph.name, actions: arr(ph && ph.actions).map(function (a) {
                    return { unit_uid: a && a.unit_uid, action_type: a && a.action_type, target: a && a.target };
                }) };
            }),
        };
    });
    var allowedActions = arr(extras.allowed_actions);
    var actionEnum = allowedActions.length
        ? allowedActions.join('|')
        : 'recon|delay|deceive|flank|defend|withdraw|probe|attack|hold|avoid_contact|support|reserve|reposition|screen|observe|feint';
    var system = [
        'You are an RMOOZ commander AI. Your previous course-of-action JSON was REJECTED by the staff validator.',
        'Repair it so EVERY action is executable by a real unit. Fix ONLY the listed problems; keep the rest of your plan.',
        'Use ONLY unit IDs from allowed_unit_ids and ONLY the allowed actions.',
        'Targets must be inside the map and a small step from the unit (no teleport).',
        'NEVER output engage/destroy/kill — movement/positioning only.',
        // RMOOZ-SCC-COA-COMMANDER-QUALITY-AI: strict JSON-only on repair.
        'Output EXACTLY ONE JSON object — no markdown, no ``` code fences, no prose before or after the JSON.',
        'Each action needs a reason, roe_status, taskable, and (for movement) a numeric lat+lon target (never null, never all on the objective center).',
        'Return ONLY valid JSON with a "coas" array (2-3 COAs), same shape as before.',
    ].join(' ');
    var promptObject = {
        instruction: 'Repair the rejected courses of action. Resolve every validator rejection below.',
        validator_rejections: violations,
        fix_rules: [
            'Replace any invalid/invented unit_uid with one from allowed_unit_ids.',
            'Use ONLY the allowed actions.',
            'Keep targets inside the map; move at most a small step (no teleport).',
            'Never engage/destroy/open_fire.',
            'Return 2-3 COAs in the same JSON shape.',
        ],
        allowed_unit_ids: allowedUnitIds,
        allowed_actions: allowedActions.length ? allowedActions : undefined,
        objective: extras.objective || null,
        active_side: extras.active_side || null,
        previous_coas: prevCoas,
        required_output_schema: {
            coas: [{
                plan_id: 'COA-1', title: 'string', objective_id: 'string', summary: 'string',
                recommended: false, risk: 'low|medium|high', confidence: 'low|medium|high',
                phases: [{ phase_id: 'phase-1', name: 'Move', actions: [{
                    unit_uid: '<one of allowed_unit_ids>', side: 'RED|BLUE',
                    role: 'assault|support|screen|reserve|recon|hold|defend',
                    action_type: actionEnum,
                    target: { lat: 0, lon: 0, type: 'objective|coord' },
                    reason: '<one sentence>', why_unit: '<why this unit>',
                }] }],
                non_selected_units: [{ unit_uid: '<a unit you did NOT move>', reason: '<why held back>' }],
                risks: ['string'], assumptions: ['string'],
            }],
        },
        constraints: 'unit_uid MUST be one of allowed_unit_ids; no teleport; no invented units; NEVER engage/destroy/open-fire; return ONLY JSON.',
    };
    return {
        version: TOOL_CONTRACT_VERSION + '/repair',
        system: system,
        prompt: JSON.stringify(promptObject),
        prompt_object: promptObject,
        allowed_unit_ids: allowedUnitIds,
        is_repair: true,
    };
}

function buildCommanderPromptPack(input) {
    var ctx = readInput(input);

    // tools_context is built by CALLING the deterministic tools (so it is
    // versioned + reproducible). getCapabilityIntelTool is async.
    return Promise.resolve()
        .then(function () { return getCapabilityIntelTool(input); })
        .then(function (capabilityEnvelope) {
            var oob = getScenarioOobTool(input);
            var terrainEnv = getTerrainIntelTool(input);
            var zoneEnv = getSovereignZoneIntelTool(input);
            var contactEnv = getContactPictureTool(input);
            var roeEnv = getRoeStateTool(input);
            var prevEnv = getPreviousTurnsTool(input);
            var coaEnv = getCoaFamilyOptionsTool(input);

            var allowedUnitIds = oob.ok
                ? oob.data.units.map(function (u) { return u.unit_uid; }).filter(function (id) { return id != null; })
                : ctx.units.map(unitUid).filter(function (id) { return id != null; });

            var allowedCoaFamilies = (coaEnv.ok && arr(coaEnv.data.allowed_families)) || [];

            return ok('buildCommanderPromptPack', 'rmooz_deterministic', 'medium', {
                system_contract: SYSTEM_CONTRACT,
                allowed_output_schema: LLM_COMMANDER_DECISION_SCHEMA,
                tools_context: {
                    oob: oob,
                    capability: capabilityEnvelope,
                    terrain: terrainEnv,
                    zone: zoneEnv,
                    contacts: contactEnv,
                    roe: roeEnv,
                    previous_turns: prevEnv,
                    coa_family_options: coaEnv,
                },
                allowed_unit_ids: allowedUnitIds,
                allowed_coa_families: allowedCoaFamilies,
                blocked_actions: BLOCKED_ACTIONS.slice(),
                required_fields: [
                    'commander_decision_id',
                    'active_side',
                    'selected_coa_family',
                    'recommended_coa',
                    'unit_assignments',
                    'review_required',
                ],
            });
        })
        .catch(function (e) {
            return fail('buildCommanderPromptPack', e && e.message);
        });
}

module.exports = {
    TOOL_CONTRACT_VERSION: TOOL_CONTRACT_VERSION,
    COA_FAMILIES: COA_FAMILIES,
    BLOCKED_ACTIONS: BLOCKED_ACTIONS,
    LLM_COMMANDER_DECISION_SCHEMA: LLM_COMMANDER_DECISION_SCHEMA,
    SYSTEM_CONTRACT: SYSTEM_CONTRACT,                       // RMOOZ-AI-ATTACK-PLAN-MCP-PROMPT-A
    MCP_COMMANDER_INSTRUCTIONS: MCP_COMMANDER_INSTRUCTIONS, // RMOOZ-AI-ATTACK-PLAN-MCP-PROMPT-A
    composeCommanderPrompt: composeCommanderPrompt,         // RMOOZ-AI-ATTACK-PLAN-MCP-PROMPT-A
    composeRepairPrompt: composeRepairPrompt,               // RMOOZ-AI-COMMANDER-REPAIR-LOOP-A
    getScenarioOobTool: getScenarioOobTool,
    getCapabilityIntelTool: getCapabilityIntelTool,
    getTerrainIntelTool: getTerrainIntelTool,
    getSovereignZoneIntelTool: getSovereignZoneIntelTool,
    getContactPictureTool: getContactPictureTool,
    getRoeStateTool: getRoeStateTool,
    getPreviousTurnsTool: getPreviousTurnsTool,
    getCoaFamilyOptionsTool: getCoaFamilyOptionsTool,
    scoreCoaCandidatesTool: scoreCoaCandidatesTool,
    validateCommanderCoaTool: validateCommanderCoaTool,
    buildCommanderPromptPack: buildCommanderPromptPack,
};
