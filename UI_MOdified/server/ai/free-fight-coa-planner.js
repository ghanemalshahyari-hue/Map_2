'use strict';
/* ============================================================================
 * free-fight-coa-planner.js — FREEFIGHT-AI-COA-PLANNER-A
 * ----------------------------------------------------------------------------
 * Multi-unit COA (Course of Action) planner for the Free Fight AI demo.
 * Works with all RED units in a scenario to produce 3 candidate COAs.
 *
 * Exports:
 *   planCoas(units, objectives, context, opts)   → async, main entry
 *   validateCoaPlan(plan, units, objectives)      → sync
 *   applyCoaPlan(plan, units)                     → sync, mutates units in-place
 *   makeCoaEventLogEntries(plan, applyResult)     → sync, returns string[]
 *   buildDeterministicCoas(redUnits, obj)         → sync
 *   normalizeCoa(raw, allowedUnitIds)             → sync
 *   normalizeCoaAction(raw, allowedUnitIds)       → sync
 *   ALLOWED_COA_ACTION_TYPES, ALLOWED_ROLES, STEP_DEG, RECON_STEP_DEG
 *
 * LOCAL-ONLY POLICY: LLM is only called for local providers (ollama / local).
 * Remote providers (claude, zen, openai, auto) are BLOCKED.
 *
 * Safety contract:
 *   • No new units created.
 *   • HOLD_POSITION actions never move a unit.
 *   • Step size capped at MAX_STEP_DEG (teleport guard).
 *   • All COA actions carry review_only / demo_only stamps.
 * ========================================================================== */

const aiProvider = require('./ai-provider');
const TRIGGERS   = require('./free-fight-situation-triggers'); // FREEFIGHT-BLUE-WARNING-ROE-A
const INTEL      = require('./scenario-intel');                // RMOZ-INTEL-CAPABILITY-TERRAIN-ZONE-A
const BRIEF      = require('./commander-brief');                // RMOZ-COMMANDER-BRIEF-COALITION-A
const ANALYST    = require('./free-fight-llm-capability-analyst'); // FREEFIGHT-LLM-CAPABILITY-ANALYST-A
const CONTRACT   = require('./rmooz-ai-tool-contract');            // RMOZ-AI-TOOL-CONTRACT-A
const TACTICS    = require('./tactical-action-library');           // RMOOZ-AI-COMMANDER-FREEDOM-A
const TERRAIN_CTX = require('./tactical-terrain-context');         // GIS terrain-aware tactics
// Optional REAL elevation (DEM). Lazy + guarded: returns null off-coverage (e.g. Libya-only
// dataset) so high-ground / route-cost gracefully fall back to inferred geometry.
var _demFn = null;
function demElevationAt(lat, lon) {
    if (_demFn === false) return null;
    if (!_demFn) { try { var dem = require('../dem-service'); _demFn = (dem && typeof dem.getElevation === 'function') ? dem.getElevation : false; } catch (_) { _demFn = false; } }
    if (!_demFn) return null;
    try { var e = _demFn(lon, lat); return (e == null ? null : e); } catch (_) { return null; }
}

// ── Constants ─────────────────────────────────────────────────────────────────
var STEP_DEG       = 0.05;   // ≈ 5-6 km per tick
var RECON_STEP_DEG = 0.03;   // recon moves shorter
var MAX_STEP_DEG   = 0.15;   // teleport guard

// RMOOZ-AI-COMMANDER-FREEDOM-A: the action vocabulary now includes the 16 free
// tactical actions (lower-case) PLUS the legacy uppercase actions (back-compat). The
// validator checks structure/physics only — it does not judge which action was chosen.
var LEGACY_COA_ACTION_TYPES = [
    'MOVE_TOWARD_OBJECTIVE', 'SUPPORT_BY_FIRE', 'HOLD_POSITION',
    'SCREEN_FLANK', 'RECON_OBJECTIVE'
];
var ALLOWED_COA_ACTION_TYPES = LEGACY_COA_ACTION_TYPES.concat(
    TACTICS.TACTICAL_ACTIONS.map(function (a) { return a.toUpperCase(); })
);
// action_type → planner role (for ALLOWED_ROLES); keeps roles within the existing set.
var ACTION_ROLE = {
    recon: 'recon', observe: 'recon', probe: 'recon', screen: 'screen', delay: 'screen',
    defend: 'defend', withdraw: 'reserve', avoid_contact: 'screen', flank: 'assault',
    deceive: 'support', feint: 'support', attack: 'assault', hold: 'hold',
    reposition: 'support', support: 'support', reserve: 'reserve',
};
// RED (attacker) roles + BLUE (defender) roles. FREEFIGHT-AI-CONTINUOUS-COMMANDER-LOOP-A
// adds the defensive roles so the planner can plan for the active side either way.
var ALLOWED_ROLES = ['assault', 'support', 'screen', 'reserve', 'recon', 'hold',
                     'defend', 'intercept', 'reinforce'];
var ALLOWED_RISK        = ['low', 'medium', 'high'];
var ALLOWED_CONFIDENCE  = ['low', 'medium', 'high'];
var REMOTE_PROVIDERS_BLOCKED = ['claude', 'zen', 'openai', 'auto'];

// ── Helpers ───────────────────────────────────────────────────────────────────
function arr(v) { return Array.isArray(v) ? v : []; }
function str(v, max) { var s = String(v == null ? '' : v); return max ? s.slice(0, max) : s; }
function finiteN(v) { var n = Number(v); return Number.isFinite(n) ? n : null; }
function finiteLL(o) { return !!(o && Number.isFinite(finiteN(o.lat)) && Number.isFinite(finiteN(o.lon))); }
function dist(a, b) { var dx = a.lat - b.lat, dy = a.lon - b.lon; return Math.sqrt(dx * dx + dy * dy); }
function stepToward(from, to, step) {
    var d = dist(from, to);
    if (d <= step) return { lat: +to.lat, lon: +to.lon };
    var t = step / d;
    return { lat: from.lat + (to.lat - from.lat) * t, lon: from.lon + (to.lon - from.lon) * t };
}
function unitHasCoord(u) {
    return !!(u && u.lat != null && u.lon != null &&
              Number.isFinite(Number(u.lat)) && Number.isFinite(Number(u.lon)));
}
function getUnitById(units, uid) {
    return arr(units).find(function (u) { return u && (u.id === uid || u.uid === uid || u.unit_uid === uid); }) || null;
}
function resolveLocalProvider() {
    return (process.env.RMOOZ_FREE_FIGHT_LLM_PROVIDER || 'ollama').toLowerCase().trim();
}
function isRemoteProvider(name) {
    return REMOTE_PROVIDERS_BLOCKED.indexOf(String(name || '').toLowerCase().trim()) !== -1;
}
function resolveLocalModel() {
    return process.env.RMOOZ_FREE_FIGHT_LLM_MODEL ||
           process.env.RMOOZ_LOCAL_LLM_MODEL       ||
           process.env.RMOOZ_AI_MODEL              ||
           'qwen3-coder:latest';
}
// FREEFIGHT-COA-ROUTE-JSON-GUARD-A: single source of truth for the route's
// local-only policy + resolved provider/model. The health endpoint surfaces this.
function routeHealth() {
    var provider = resolveLocalProvider();
    var remoteBlocked = isRemoteProvider(provider);
    return {
        planner: 'free-fight-coa-planner',
        local_only: true,
        provider_policy: 'local_only',
        // Never report a remote provider — if one is misconfigured it is blocked.
        provider: remoteBlocked ? 'ollama' : provider,
        provider_blocked: remoteBlocked,
        model: resolveLocalModel(),
        llm_enabled: process.env.RMOOZ_FREE_FIGHT_LLM === '1',
        remote_providers_blocked: REMOTE_PROVIDERS_BLOCKED.slice(),
    };
}
function parseJsonSafe(text) {
    var s = str(text).trim();
    var m = s.match(/\{[\s\S]*\}/);
    try { return JSON.parse(m ? m[0] : s); } catch (e) { return null; }
}
function bestObjective(objectives) {
    var list = arr(objectives);
    for (var i = 0; i < list.length; i++) {
        var o = list[i];
        if (!o) continue;
        if (finiteLL(o)) return { lat: Number(o.lat), lon: Number(o.lon), name: o.name || o.label || 'Objective X' };
        if (Array.isArray(o.coord) && o.coord.length >= 2 && Number.isFinite(+o.coord[0]) && Number.isFinite(+o.coord[1])) {
            return { lat: +o.coord[1], lon: +o.coord[0], name: o.name || o.label || 'Objective X' };
        }
    }
    return null;
}

// ── Deterministic COA builder ─────────────────────────────────────────────────
/**
 * buildDeterministicCoas(redUnits, obj)
 * Returns exactly 3 COA objects.
 *   COA-1 "Direct Assault"  — recommended:false, risk:high
 *   COA-2 "Flank / Fix"     — recommended:true,  risk:medium
 *   COA-3 "Probe / Recon"   — recommended:false, risk:low
 */
function buildDeterministicCoas(redUnits, obj) {
    var units = arr(redUnits).filter(unitHasCoord);
    var total = units.length;

    // Sort by distance to objective
    if (obj && finiteLL(obj)) {
        units = units.slice().sort(function (a, b) {
            return dist({ lat: a.lat, lon: a.lon }, obj) - dist({ lat: b.lat, lon: b.lon }, obj);
        });
    }

    var objName = (obj && (obj.name || obj.label)) || 'Objective X';
    var objLat = obj ? obj.lat : 0;
    var objLon = obj ? obj.lon : 0;

    // Unit counts per COA
    var directCount  = Math.min(Math.max(3, Math.round(total * 0.25)), 12);
    var flankAssault = Math.min(Math.max(2, Math.round(total * 0.18)), 8);
    var flankSupport = Math.min(Math.max(2, Math.round(total * 0.12)), 6);
    var probeCount   = Math.min(Math.max(1, Math.round(total * 0.08)), 4);

    // COA-1: Direct Assault
    var coa1Actions = [];
    for (var i = 0; i < total; i++) {
        var u = units[i];
        if (i < directCount) {
            coa1Actions.push({
                unit_uid: u.id || u.uid || u.unit_uid,
                side: String(u.side || 'RED').toUpperCase(),
                role: 'assault',
                action_type: 'MOVE_TOWARD_OBJECTIVE',
                target: { lat: objLat, lon: objLon, type: 'objective' },
                reason: 'Direct assault on ' + objName + ' — nearest unit assigned assault.',
            });
        } else {
            coa1Actions.push({
                unit_uid: u.id || u.uid || u.unit_uid,
                side: String(u.side || 'RED').toUpperCase(),
                role: 'reserve',
                action_type: 'HOLD_POSITION',
                target: { lat: u.lat, lon: u.lon, type: 'coord' },
                reason: 'Reserve — hold position until assault succeeds.',
            });
        }
    }

    // COA-2: Flank / Fix — perpendicular offset ~0.04deg from objective
    var coa2Actions = [];
    var supportLat = objLat + 0.04;
    var supportLon = objLon + 0.04;
    for (var j = 0; j < total; j++) {
        var u2 = units[j];
        if (j < flankAssault) {
            coa2Actions.push({
                unit_uid: u2.id || u2.uid || u2.unit_uid,
                side: String(u2.side || 'RED').toUpperCase(),
                role: 'assault',
                action_type: 'MOVE_TOWARD_OBJECTIVE',
                target: { lat: objLat, lon: objLon, type: 'objective' },
                reason: 'Flank assault — lead element closes with ' + objName + '.',
            });
        } else if (j < flankAssault + flankSupport) {
            coa2Actions.push({
                unit_uid: u2.id || u2.uid || u2.unit_uid,
                side: String(u2.side || 'RED').toUpperCase(),
                role: 'support',
                action_type: 'SUPPORT_BY_FIRE',
                target: { lat: supportLat, lon: supportLon, type: 'coord' },
                reason: 'Support by fire from perpendicular position — fix enemy at ' + objName + '.',
            });
        } else {
            coa2Actions.push({
                unit_uid: u2.id || u2.uid || u2.unit_uid,
                side: String(u2.side || 'RED').toUpperCase(),
                role: 'reserve',
                action_type: 'HOLD_POSITION',
                target: { lat: u2.lat, lon: u2.lon, type: 'coord' },
                reason: 'Reserve — hold pending flank result.',
            });
        }
    }

    // COA-3: Probe / Recon
    var coa3Actions = [];
    for (var k = 0; k < total; k++) {
        var u3 = units[k];
        if (k < probeCount) {
            coa3Actions.push({
                unit_uid: u3.id || u3.uid || u3.unit_uid,
                side: String(u3.side || 'RED').toUpperCase(),
                role: 'recon',
                action_type: 'RECON_OBJECTIVE',
                target: { lat: objLat, lon: objLon, type: 'objective' },
                reason: 'Probe / recon — gather intelligence on ' + objName + ' before committing force.',
            });
        } else {
            coa3Actions.push({
                unit_uid: u3.id || u3.uid || u3.unit_uid,
                side: String(u3.side || 'RED').toUpperCase(),
                role: 'hold',
                action_type: 'HOLD_POSITION',
                target: { lat: u3.lat, lon: u3.lon, type: 'coord' },
                reason: 'Hold position — await recon results before committing.',
            });
        }
    }

    return [
        {
            plan_id: 'COA-1',
            title: 'Direct Assault',
            objective_id: objName,
            summary: 'All nearest ' + directCount + ' units assault ' + objName + ' directly. Remaining ' + (total - directCount) + ' hold in reserve.',
            recommended: false,
            risk: 'high',
            confidence: 'medium',
            units_total_considered: total,
            units_selected_count: directCount,
            phases: [{ phase_id: 'phase-1', name: 'Move', actions: coa1Actions }],
            risks: ['High exposure during direct assault', 'No suppression or support by fire'],
            assumptions: ['Enemy has not established strong defensive positions'],
            validation: {},
        },
        {
            plan_id: 'COA-2',
            title: 'Flank / Fix',
            objective_id: objName,
            summary: flankAssault + ' units assault flanking ' + objName + '; ' + flankSupport + ' units provide support by fire from offset position.',
            recommended: true,
            risk: 'medium',
            confidence: 'medium',
            units_total_considered: total,
            units_selected_count: flankAssault + flankSupport,
            phases: [{ phase_id: 'phase-1', name: 'Move', actions: coa2Actions }],
            risks: ['Coordination required between assault and support elements', 'Support position may be exposed'],
            assumptions: ['Perpendicular approach is accessible', 'Support element has line-of-sight to objective'],
            validation: {},
        },
        {
            plan_id: 'COA-3',
            title: 'Probe / Recon',
            objective_id: objName,
            summary: probeCount + ' recon units probe ' + objName + '; all other units hold in place.',
            recommended: false,
            risk: 'low',
            confidence: 'high',
            units_total_considered: total,
            units_selected_count: probeCount,
            phases: [{ phase_id: 'phase-1', name: 'Move', actions: coa3Actions }],
            risks: ['Slow tempo — enemy may reinforce', 'Recon elements may be detected'],
            assumptions: ['Intelligence gap requires probe before committing main body'],
            validation: {},
        },
    ];
}

// ── BLUE defensive COA builder ────────────────────────────────────────────────
/**
 * buildBlueCoas(blueUnits, obj, situation) → 3 defensive COA objects.
 *   COA-1 "Intercept / Block RED Axis" — THREAT-AWARE: interceptors move to a
 *         blocking point ON the RED→objective axis (not to the objective), so BLUE
 *         visibly reacts to RED instead of crowding its own objective.
 *   COA-2 "Forward Defense"            — reinforce the objective (depth defense).
 *   COA-3 "Hold & Screen"              — screen flanks, main body holds.
 * Uses only existing safe action types (MOVE_TOWARD_OBJECTIVE / SCREEN_FLANK /
 * HOLD_POSITION); teleport guard / validator / apply math stay unchanged.
 * FREEFIGHT-BLUE-THREAT-AWARE-MOVEMENT-A.
 */
function buildBlueCoas(blueUnits, obj, situation, capContext) {
    var units = arr(blueUnits).filter(unitHasCoord);
    var total = units.length;
    // FREEFIGHT-LLM-CAPABILITY-ANALYST-A: order BLUE units by capability-fit for the
    // threat domain FIRST (so a fighter/interceptor leads an air-threat intercept, a
    // frigate leads a naval-threat screen, etc.), then by proximity. With uniform-
    // capability forces the fit term is flat and this reduces to a pure distance sort.
    var byUid = (capContext && capContext.profiles_by_uid) || {};
    var fitKey = (capContext && capContext.mission_score_key) || null;
    function uidOf(u) { return u.id || u.uid || u.unit_uid; }
    function fitScore(u) {
        if (!fitKey) return 0;
        var p = byUid[uidOf(u)];
        var sc = p && p.capability_scores && Number(p.capability_scores[fitKey]);
        return Number.isFinite(sc) ? sc : 0;
    }
    if (obj && finiteLL(obj)) {
        units = units.slice().sort(function (a, b) {
            var fa = fitScore(a), fb = fitScore(b);
            if (fb !== fa) return fb - fa; // higher capability-fit leads
            return dist({ lat: a.lat, lon: a.lon }, obj) - dist({ lat: b.lat, lon: b.lon }, obj);
        });
    }
    var objName = (obj && (obj.name || obj.label)) || 'Objective X';
    var objLat = obj ? obj.lat : 0;
    var objLon = obj ? obj.lon : 0;

    var interceptCount = Math.min(Math.max(3, Math.round(total * 0.25)), 12);
    var reinforceCount = Math.min(Math.max(3, Math.round(total * 0.25)), 12);
    var screenCount    = Math.min(Math.max(2, Math.round(total * 0.12)), 6);

    function uid(u) { return u.id || u.uid || u.unit_uid; }
    function side(u) { return String(u.side || 'BLUE').toUpperCase(); }

    // RED threat axis → BLUE intercept/block point between RED and the objective.
    var threat = situation && situation.nearest_red;
    var hasThreat = !!(threat && Number.isFinite(+threat.lat) && Number.isFinite(+threat.lon));
    var blockLat, blockLon;
    if (hasThreat) {
        // 0.55 of the way from the nearest RED unit toward the objective — forward
        // of the objective, squarely on the RED approach axis.
        blockLat = threat.lat + (objLat - threat.lat) * 0.55;
        blockLon = threat.lon + (objLon - threat.lon) * 0.55;
    } else {
        blockLat = objLat; blockLon = objLon; // no detected threat → fall back to the objective
    }
    // Perpendicular flank-screen point offset from the block point along the axis normal.
    var axLat = (hasThreat ? (objLat - threat.lat) : 0), axLon = (hasThreat ? (objLon - threat.lon) : 0.04);
    var axLen = Math.sqrt(axLat * axLat + axLon * axLon) || 1;
    var screenLat = blockLat + (-axLon / axLen) * 0.06;
    var screenLon = blockLon + ( axLat / axLen) * 0.06;
    var threatNote = hasThreat ? (' (RED ' + (situation.nearest_red_uid || '?') + ' axis)') : '';

    // COA-1: Intercept / Block RED Axis
    var a1 = [];
    for (var i = 0; i < total; i++) {
        var u = units[i];
        if (i < interceptCount) {
            a1.push({ unit_uid: uid(u), side: side(u), role: 'intercept', action_type: 'MOVE_TOWARD_OBJECTIVE',
                      target: { lat: blockLat, lon: blockLon, type: 'coord' },
                      reason: 'Move to block point on the RED approach axis to ' + objName + threatNote + '.' });
        } else if (i < interceptCount + screenCount) {
            a1.push({ unit_uid: uid(u), side: side(u), role: 'screen', action_type: 'SCREEN_FLANK',
                      target: { lat: screenLat, lon: screenLon, type: 'coord' },
                      reason: 'Screen the flank of the intercept line.' });
        } else {
            a1.push({ unit_uid: uid(u), side: side(u), role: 'reserve', action_type: 'HOLD_POSITION',
                      target: { lat: u.lat, lon: u.lon, type: 'coord' },
                      reason: 'Reserve — hold depth pending the intercept.' });
        }
    }

    // COA-2: Forward Defense / Reinforce the objective
    var a2 = [];
    for (var j = 0; j < total; j++) {
        var u2 = units[j];
        if (j < reinforceCount) {
            a2.push({ unit_uid: uid(u2), side: side(u2), role: 'reinforce', action_type: 'MOVE_TOWARD_OBJECTIVE',
                      target: { lat: objLat, lon: objLon, type: 'objective' },
                      reason: 'Forward defense — reinforce ' + objName + ' to blunt the attack.' });
        } else {
            a2.push({ unit_uid: uid(u2), side: side(u2), role: 'reserve', action_type: 'HOLD_POSITION',
                      target: { lat: u2.lat, lon: u2.lon, type: 'coord' },
                      reason: 'Reserve — hold depth position behind the defense.' });
        }
    }

    // COA-3: Hold & Screen
    var a3 = [];
    var sLat = objLat + 0.04, sLon = objLon - 0.04;
    for (var k = 0; k < total; k++) {
        var u3 = units[k];
        if (k < screenCount) {
            a3.push({ unit_uid: uid(u3), side: side(u3), role: 'screen', action_type: 'SCREEN_FLANK',
                      target: { lat: sLat, lon: sLon, type: 'coord' },
                      reason: 'Screen the flank to give early warning while the main body holds.' });
        } else {
            a3.push({ unit_uid: uid(u3), side: side(u3), role: 'defend', action_type: 'HOLD_POSITION',
                      target: { lat: u3.lat, lon: u3.lon, type: 'coord' },
                      reason: 'Hold prepared defensive position.' });
        }
    }

    return [
        { plan_id: 'COA-1', title: 'Intercept / Block RED Axis', objective_id: objName,
          summary: interceptCount + ' units move to block the RED approach axis to ' + objName + '; ' + screenCount + ' screen the flank.',
          recommended: true, risk: 'medium', confidence: 'medium',
          units_total_considered: total, units_selected_count: interceptCount + screenCount,
          intercept_point: { lat: Math.round(blockLat * 1e5) / 1e5, lon: Math.round(blockLon * 1e5) / 1e5, on_red_axis: hasThreat },
          phases: [{ phase_id: 'phase-1', name: 'Intercept', actions: a1 }],
          risks: ['Interceptors move forward of prepared positions', 'RED may shift axis'],
          assumptions: ['RED main effort is the nearest threat axis'], validation: {} },
        { plan_id: 'COA-2', title: 'Forward Defense', objective_id: objName,
          summary: reinforceCount + ' units reinforce ' + objName + '; remaining hold in depth.',
          recommended: false, risk: 'medium', confidence: 'medium',
          units_total_considered: total, units_selected_count: reinforceCount,
          phases: [{ phase_id: 'phase-1', name: 'Reinforce', actions: a2 }],
          risks: ['Cedes forward ground', 'Depth may be thinned'],
          assumptions: ['Objective is the enemy main effort'], validation: {} },
        { plan_id: 'COA-3', title: 'Hold & Screen', objective_id: objName,
          summary: screenCount + ' units screen the flank; the main body holds prepared positions.',
          recommended: false, risk: 'low', confidence: 'high',
          units_total_considered: total, units_selected_count: screenCount,
          phases: [{ phase_id: 'phase-1', name: 'Screen', actions: a3 }],
          risks: ['Cedes initiative to the attacker'],
          assumptions: ['Prepared positions are strong enough to hold'], validation: {} },
    ];
}

/**
 * buildDiverseCoas — RMOOZ-AI-COMMANDER-FREEDOM-A. Produce the THREE required COA
 * archetypes (cautious/recon/security, maneuver/deception/flank, direct/attack/defense),
 * each assigning a GENUINELY different tactical action per unit via the tactical action
 * library (recon stands off, flank uses a different axis, withdraw breaks contact, …).
 * Unit selection is capability-fit ordered then rotated by `seed`, so the lead unit and
 * assignments vary across planning cycles (not always the same unit). The recommended
 * archetype depends on the commander mode + situation (free) or rotates (high_variation).
 */
function buildDiverseCoas(units, obj, side, situation, capContext, mode, seed, intel, elevationFn) {
    function r5(x) { return Math.round(x * 1e5) / 1e5; }
    var list = arr(units).filter(unitHasCoord);
    var total = list.length;
    var sideU = String(side || 'RED').toUpperCase();
    var objName = (obj && (obj.name || obj.label)) || 'Objective X';
    var objPt = (obj && finiteLL(obj)) ? { lat: obj.lat, lon: obj.lon } : null;

    // Enemy reference for the active side: BLUE faces the nearest RED; the attacker faces
    // the defended objective (its defenders).
    var enemy = null;
    if (sideU === 'BLUE' && situation && situation.nearest_red &&
        Number.isFinite(+situation.nearest_red.lat) && Number.isFinite(+situation.nearest_red.lon)) {
        enemy = { lat: +situation.nearest_red.lat, lon: +situation.nearest_red.lon };
    } else if (objPt) { enemy = objPt; }
    var threatR = (situation && situation.thresholds_deg &&
        (situation.thresholds_deg.defended || situation.thresholds_deg.warning)) || 0.10;
    // GIS terrain-aware tactics: assemble borders/zones, corridor, choke, high ground,
    // terrain class, threat rings, and route cost (real DEM where covered, else inferred —
    // with provenance). recon/flank/delay/defend/withdraw reason from this ctx.
    // RMOOZ-AI-COA-PERFORMANCE-A: DEM elevation sampling is the costly part of the terrain
    // context. fast mode passes elevationFn=null (inferred terrain only); normal/deep keep the
    // real DEM — unchanged geometry. Undefined (legacy callers/tests) → demElevationAt.
    var elevAt = (elevationFn === null) ? null : (typeof elevationFn === 'function' ? elevationFn : demElevationAt);
    var ctxBase = TERRAIN_CTX.buildTacticalTerrainContext({
        objective: objPt, nearestEnemy: enemy, situation: situation, intel: intel,
        ownUnits: list, side: sideU, elevationAt: elevAt,
    });
    ctxBase.side = sideU;
    if (!Number.isFinite(ctxBase.threatZoneRadiusDeg)) ctxBase.threatZoneRadiusDeg = threatR;

    function uid(u) { return u.id || u.uid || u.unit_uid; }
    function usideStr(u) { return String(u.side || sideU).toUpperCase(); }

    // capability-fit ordering, then rotate by seed so assignments vary across cycles.
    var byUid = (capContext && capContext.profiles_by_uid) || {};
    var fitKey = (capContext && capContext.mission_score_key) || null;
    function fit(u) { var p = byUid[uid(u)]; var s = p && p.capability_scores && Number(p.capability_scores[fitKey]); return Number.isFinite(s) ? s : 0; }
    var ordered = list.slice();
    if (objPt) ordered.sort(function (a, b) { var fa = fit(a), fb = fit(b); if (fb !== fa) return fb - fa; return dist({ lat: a.lat, lon: a.lon }, objPt) - dist({ lat: b.lat, lon: b.lon }, objPt); });
    var rot = total > 1 ? ((Number(seed) || 0) % total) : 0;
    if (rot > 0) ordered = ordered.slice(rot).concat(ordered.slice(0, rot));

    var riskByArch = { cautious_recon: 'low', maneuver_deception: 'medium', direct_action: 'high' };
    var leadCount = Math.max(1, Math.ceil(total * 0.4));
    var coas = TACTICS.COA_ARCHETYPES.map(function (A, idx) {
        var actions = ordered.map(function (u, i) {
            var act = (i < leadCount) ? A.actions[0] : (A.actions[(i % (A.actions.length - 1)) + 1] || A.actions[0]);
            var g = TACTICS.computeActionGeometry(act, u, ctxBase);
            var tb = (g.terrain_basis && g.terrain_basis.length) ? g.terrain_basis.join(', ') : null;
            return {
                unit_uid: uid(u), side: usideStr(u), role: (ACTION_ROLE[act] || 'support'),
                action_type: act,
                target: { lat: r5(g.target.lat), lon: r5(g.target.lon), type: 'coord' },
                reason: g.reason, behavior: g.behavior,
                terrain_basis: g.terrain_basis,    // GIS factors that drove this action (+ provenance)
                why_unit: 'Chosen by capability-fit and position for the ' + A.label.toLowerCase() + ' option.',
                deciding_factor: tb ? ('terrain/zone: ' + tb) :
                    (g.flags.different_axis ? 'alternate axis / terrain' :
                    (g.flags.stays_outside_threat ? 'standoff from the threat zone' :
                    (g.flags.increases_distance_from_threat ? 'preserve the force' : 'mission suitability / proximity'))),
            };
        });
        return {
            plan_id: 'COA-' + (idx + 1), title: A.label, objective_id: objName, coa_family: A.key,
            summary: A.label + ' — ' + actions.length + ' units; lead action: ' + A.actions[0] + ' toward ' + objName + '.',
            recommended: false, risk: riskByArch[A.key] || 'medium',
            confidence: (A.key === 'cautious_recon') ? 'high' : 'medium',
            units_total_considered: total, units_selected_count: actions.length,
            phases: [{ phase_id: 'phase-1', name: A.label, actions: actions }],
            risks: [], assumptions: [], validation: {},
        };
    });

    // Recommended archetype: high_variation rotates by seed; free is situation-driven.
    var recIdx;
    if (mode === 'high_variation') recIdx = ((Number(seed) || 0) % coas.length);
    else {
        var hot = situation && (situation.alert_state === 'ALERT' || situation.alert_state === 'ENGAGEMENT_READY' || situation.red_inside_defended_zone);
        recIdx = hot ? 2 : 0; // direct under pressure, cautious/recon otherwise
    }
    (coas[recIdx] || coas[0]).recommended = true;
    return coas;
}

/**
 * buildCoasForSide(units, obj, side, situation) — dispatch to the deterministic builder.
 * In 'free'/'high_variation' commander modes the diverse archetype builder runs (genuine
 * tactical variety); 'controlled' (doctrine-guided, default) keeps the side-aware
 * intercept/defense builders. FREEFIGHT-BLUE-THREAT-AWARE-MOVEMENT-A + COMMANDER-FREEDOM-A.
 */
function buildCoasForSide(units, obj, side, situation, capContext, mode, seed, intel, elevationFn) {
    if (mode === 'free' || mode === 'high_variation') {
        return buildDiverseCoas(units, obj, side, situation, capContext, mode, seed, intel, elevationFn);
    }
    return String(side || 'RED').toUpperCase() === 'BLUE'
        ? buildBlueCoas(units, obj, situation, capContext)
        : buildDeterministicCoas(units, obj);
}

// ── LLM normalizers ───────────────────────────────────────────────────────────
/**
 * normalizeCoaAction(raw, allowedUnitIds) → action | null
 * Rejects if unit_uid not in allowedUnitIds.
 */
function normalizeCoaAction(raw, allowedUnitIds) {
    if (!raw || typeof raw !== 'object') return null;
    // RMOOZ-AI-COMMANDER-FREEDOM-A: accept the 16 free tactical actions (kept lower-case)
    // as well as the legacy uppercase actions. Do NOT reject a creative-but-valid action.
    var rawAt = str(raw.action_type);
    var lowAt = rawAt.toLowerCase().trim();
    var at;
    if (TACTICS.isTacticalAction(lowAt)) at = lowAt;
    else if (LEGACY_COA_ACTION_TYPES.indexOf(rawAt.toUpperCase()) !== -1) at = rawAt.toUpperCase();
    else return null;
    var uid = str(raw.unit_uid);
    if (!uid) return null;
    var allowed = arr(allowedUnitIds).map(String);
    if (allowed.length && allowed.indexOf(uid) === -1) return null;
    var side = str(raw.side || 'RED').toUpperCase();
    var role = str(raw.role || ACTION_ROLE[at] || 'assault').toLowerCase();
    if (ALLOWED_ROLES.indexOf(role) === -1) role = ACTION_ROLE[at] || 'assault';
    var tgt = (raw.target && typeof raw.target === 'object') ? {
        type: str(raw.target.type || 'coord', 20),
        lat:  Number.isFinite(Number(raw.target.lat)) ? Number(raw.target.lat) : 0,
        lon:  Number.isFinite(Number(raw.target.lon)) ? Number(raw.target.lon) : 0,
    } : { type: 'coord', lat: 0, lon: 0 };
    var out = {
        unit_uid:    uid,
        side:        side,
        role:        role,
        action_type: at,
        target:      tgt,
        reason:      str(raw.reason, 400),
    };
    // RMOOZ-AI-COMMANDER-FREEDOM-A: preserve the commander's reasoning when present.
    if (raw.why_action != null) out.why_action = str(raw.why_action, 300);
    if (raw.why_unit != null) out.why_unit = str(raw.why_unit, 300);
    if (raw.deciding_factor != null) out.deciding_factor = str(raw.deciding_factor, 200);
    if (raw.risk != null) out.risk = str(raw.risk, 200);
    if (raw.expected_result != null) out.expected_result = str(raw.expected_result, 300);
    return out;
}

/**
 * normalizeCoa(raw, allowedUnitIds) → coa | null
 * Returns null if COA has zero valid actions across all phases.
 */
function normalizeCoa(raw, allowedUnitIds) {
    if (!raw || typeof raw !== 'object') return null;
    var phases = arr(raw.phases).map(function (ph) {
        return {
            phase_id: str(ph.phase_id || 'phase-1', 40),
            name: str(ph.name || 'Move', 80),
            actions: arr(ph.actions).map(function (a) { return normalizeCoaAction(a, allowedUnitIds); }).filter(Boolean),
        };
    });
    var totalActions = phases.reduce(function (s, ph) { return s + ph.actions.length; }, 0);
    if (totalActions === 0) return null;
    return {
        plan_id:               str(raw.plan_id || 'COA-?', 20),
        title:                 str(raw.title   || 'Unknown COA', 120),
        objective_id:          str(raw.objective_id || 'Objective X', 80),
        summary:               str(raw.summary || '', 500),
        recommended:           !!raw.recommended,
        risk:                  ALLOWED_RISK.indexOf(str(raw.risk).toLowerCase())        !== -1 ? str(raw.risk).toLowerCase()       : 'medium',
        confidence:            ALLOWED_CONFIDENCE.indexOf(str(raw.confidence).toLowerCase()) !== -1 ? str(raw.confidence).toLowerCase() : 'medium',
        units_total_considered: Number.isFinite(Number(raw.units_total_considered)) ? Number(raw.units_total_considered) : 0,
        units_selected_count:   Number.isFinite(Number(raw.units_selected_count))   ? Number(raw.units_selected_count)   : 0,
        phases:                phases,
        risks:                 arr(raw.risks).map(function (r) { return str(r, 200); }),
        assumptions:           arr(raw.assumptions).map(function (a) { return str(a, 200); }),
        // RMOOZ-AI-ATTACK-PLAN-MCP-PROMPT-A: preserve the commander's "why these units were NOT
        // moved" — proof the AI selected a force package rather than moving everything.
        non_selected_units:    arr(raw.non_selected_units).map(function (n) {
            n = (n && typeof n === 'object') ? n : {};
            return { unit_uid: str(n.unit_uid, 60), reason: str(n.reason, 200) };
        }).filter(function (n) { return n.unit_uid; }).slice(0, 60),
        validation:            {},
    };
}

// ── Commander narrative (FREEFIGHT-COA-COMMANDER-NARRATIVE-A) ───────────────────
// Pure, deterministic enrichment that turns a raw COA into a commander-readable
// decision: role breakdown, "why" rationale, and a PREVIEW (not simulated) hint
// of likely enemy reaction. Works for both deterministic and LLM COAs. It never
// creates or moves units — it only describes what the COA already says.

/**
 * computeRoleBreakdown(coa) → { assault, support, screen, reserve, recon, hold }
 * Counts actions by role across all phases.
 */
function computeRoleBreakdown(coa) {
    var counts = {};
    ALLOWED_ROLES.forEach(function (r) { counts[r] = 0; });
    arr(coa && coa.phases).forEach(function (ph) {
        arr(ph.actions).forEach(function (act) {
            var r = (act && act.role) ? String(act.role).toLowerCase() : 'hold';
            if (counts[r] == null) counts[r] = 0;
            counts[r]++;
        });
    });
    return counts;
}

function _movingCount(rb) { return (rb.assault || 0) + (rb.support || 0) + (rb.screen || 0) + (rb.recon || 0); }
function _holdingCount(rb) { return (rb.reserve || 0) + (rb.hold || 0); }

/**
 * buildCoaRationale(coa, rb, objName) → string[]
 * "Why this approach" bullets, derived from the role mix + risk profile.
 */
function buildCoaRationale(coa, rb, objName) {
    var bullets = [];
    if (rb.assault) bullets.push('Commits ' + rb.assault + ' assault unit' + (rb.assault === 1 ? '' : 's') + ' against ' + objName + '.');
    if (rb.support) bullets.push('Uses ' + rb.support + ' support unit' + (rb.support === 1 ? '' : 's') + ' to fix the enemy by fire instead of direct exposure.');
    if (rb.screen)  bullets.push('Screens the flank with ' + rb.screen + ' unit' + (rb.screen === 1 ? '' : 's') + ' to protect the main effort.');
    if (rb.recon)   bullets.push('Leads with ' + rb.recon + ' recon unit' + (rb.recon === 1 ? '' : 's') + ' to reveal the enemy picture before committing the main body.');
    var holding = _holdingCount(rb);
    if (holding)    bullets.push('Keeps ' + holding + ' unit' + (holding === 1 ? '' : 's') + ' in reserve / holding for flexibility.');
    // Risk-keyed closing judgement
    if (coa.risk === 'high')        bullets.push('Highest exposure — best only if the commander accepts risk for tempo.');
    else if (coa.risk === 'medium') bullets.push('Balanced — pressures ' + objName + ' while preserving force and a reserve.');
    else                            bullets.push('Lowest risk — preserves the force and the information advantage.');
    return bullets;
}

/**
 * buildExpectedEnemyReaction(coa, rb) → string[]
 * PREVIEW ONLY — a heuristic hint of what the enemy might do. This is NOT a
 * simulated counteraction; the action/counteraction loop is a separate feature.
 */
function buildExpectedEnemyReaction(coa, rb) {
    var hints = [];
    if ((rb.assault || 0) >= 3 || coa.risk === 'high') {
        hints.push('Enemy likely concentrates defensive fires on the assault axis and may counterattack the exposed force.');
    }
    if ((rb.support || 0) || (rb.screen || 0)) {
        hints.push('Support / screen elements complicate enemy repositioning; enemy may reinforce ' + (coa.objective_id || 'the objective') + '.');
    }
    if ((rb.recon || 0) && (rb.assault || 0) === 0) {
        hints.push('Enemy may stay concealed to avoid revealing positions, or displace before the main body commits.');
    }
    if (!hints.length) hints.push('Enemy reaction uncertain — run counteraction to evaluate (next-turn feature).');
    return hints;
}

/**
 * buildCommanderAssessment(coas, obj, context, planSource) → string
 * One plan-level paragraph. Stays truthful about source and approval posture.
 */
function buildCommanderAssessment(coas, obj, context, planSource) {
    var list = arr(coas);
    var rec = list.filter(function (c) { return c && c.recommended; })[0] || list[0] || null;
    var total = (list[0] && list[0].units_total_considered) || 0;
    var parts = [];
    // Loop context: turn + active side, when present.
    var ctx = context || {};
    if (ctx.turn_number != null || ctx.active_side) {
        var head = 'Turn ' + (ctx.turn_number != null ? ctx.turn_number : '?');
        if (ctx.active_side) head += ' · ' + String(ctx.active_side).toUpperCase() + ' acting';
        parts.push(head + '.');
    }
    parts.push('Force pool: ' + total + ' movable unit' + (total === 1 ? '' : 's') + ' considered.');
    if (!obj) parts.push('No objective is set — define Objective X before issuing tasking.');
    else parts.push('Objective: ' + ((obj.name || obj.label) || 'Objective X') + '.');
    parts.push('Generated ' + list.length + ' course' + (list.length === 1 ? '' : 's') + ' of action.');
    if (rec) parts.push('Recommended: ' + (rec.plan_id || 'COA-?') + ' ' + (rec.title || '') + '.');
    parts.push(planSource === 'llm'
        ? 'Source: local LLM (advisory) — RMOOZ validated, commander approval required.'
        : 'Source: deterministic planner — review-only, commander approval required.');
    return parts.join(' ');
}

// RMOOZ-AI-MOVEMENT-EXECUTION-AUDIT-A: the execution_mode names HOW a unit moves for a given
// action — the proof that the marker followed the action-specific target (recon standoff, flank
// off-axis, delay choke, withdraw fallback, …) rather than a generic objective move. Stamped on
// every action of every COA (LLM, diverse, and controlled/legacy) and surfaced in the event log.
var EXECUTION_MODE = {
    // 16 free tactical actions (lower-case)
    recon: 'recon_standoff_target', observe: 'observe_standoff_target', probe: 'probe_limited_target',
    screen: 'screen_axis_target', delay: 'delay_choke_target', defend: 'defend_highground_target',
    withdraw: 'withdraw_fallback_target', flank: 'flank_offaxis_target', deceive: 'deceive_offaxis_target',
    feint: 'feint_offaxis_target', attack: 'attack_direct_target', hold: 'hold_no_move',
    reposition: 'reposition_lateral_target', avoid_contact: 'avoid_lateral_target',
    support: 'support_main_effort_target', reserve: 'reserve_rear_target',
    // legacy uppercase actions (controlled / doctrine builders)
    MOVE_TOWARD_OBJECTIVE: 'move_toward_objective', SUPPORT_BY_FIRE: 'support_by_fire',
    HOLD_POSITION: 'hold_no_move', SCREEN_FLANK: 'screen_flank', RECON_OBJECTIVE: 'recon_objective',
};
function executionModeFor(act) {
    if (!act || act.action_type == null) return 'unknown';
    var at = String(act.action_type);
    return EXECUTION_MODE[at] || EXECUTION_MODE[at.toLowerCase()] || (at.toLowerCase() + '_target');
}

/**
 * enrichCoasWithNarrative(coas, obj, context, planSource) → coas (mutated in place)
 * Adds role_breakdown / rationale / expected_enemy_reaction to each COA, and stamps an
 * execution_mode on every action (movement-execution proof).
 */
function enrichCoasWithNarrative(coas, obj, context, planSource) {
    var objName = (obj && (obj.name || obj.label)) || 'Objective X';
    arr(coas).forEach(function (coa) {
        if (!coa || typeof coa !== 'object') return;
        // RMOOZ-AI-MOVEMENT-EXECUTION-AUDIT-A: stamp execution_mode on each action.
        arr(coa.phases).forEach(function (ph) {
            arr(ph && ph.actions).forEach(function (a) { if (a && !a.execution_mode) a.execution_mode = executionModeFor(a); });
        });
        var rb = computeRoleBreakdown(coa);
        coa.role_breakdown = rb;
        coa.units_moving_count = _movingCount(rb);
        coa.units_holding_count = _holdingCount(rb);
        // Keep any rationale the LLM supplied; otherwise derive it.
        if (!Array.isArray(coa.rationale) || !coa.rationale.length) {
            coa.rationale = buildCoaRationale(coa, rb, coa.objective_id || objName);
        }
        if (!Array.isArray(coa.expected_enemy_reaction) || !coa.expected_enemy_reaction.length) {
            coa.expected_enemy_reaction = buildExpectedEnemyReaction(coa, rb);
        }
        coa.enemy_reaction_preview_only = true; // honest: not a simulated counteraction
    });
    return coas;
}

// ── LLM planner ───────────────────────────────────────────────────────────────
// RMOOZ-AI-ATTACK-PLAN-MCP-PROMPT-A: the terrain/zone/contact context block the commander reasons
// from. Shared by the legacy _callLlm prompt AND the MCP composer so both carry the same GIS data.
function _buildTerrainZoneContext(intel, tctx) {
    if (!intel && !tctx) return null;
    return {
        terrain: (intel && intel.terrain) || null,
        sovereign_zone: (tctx && tctx.sovereign_zone) || (intel && intel.zone_state) || null,
        contact_picture: (intel && intel.contact_picture) || null,
        roe_state: (intel && intel.roe_state) || null,
        alert_state: (intel && intel.alert_state) || null,
        coalition: (intel && intel.coalition_posture) || null,
        gis: tctx ? {
            terrain_class: tctx.terrain_class, owner_country: tctx.owner_country,
            threat_rings: tctx.threat_rings, movement_corridor: tctx.corridor,
            choke_point: tctx.choke, high_ground: tctx.high_ground,
            route_cost: tctx.route_cost, provenance: tctx.provenance,
        } : null,
        note: 'Reason from country/sovereign borders, terrain class, the movement corridor, choke points, high ground, threat rings, route cost, and distance from border/objective — not only enemy proximity to the objective. Provenance marks real GIS vs inferred.',
    };
}

async function _callLlm(units, objectives, context, opts, _providerOverride) {
    var provider = _providerOverride || aiProvider;
    var providerName = resolveLocalProvider();
    if (isRemoteProvider(providerName)) {
        return { ok: false, llm_status: 'remote_blocked', fallback_reason: 'remote_provider_not_allowed_for_free_fight' };
    }
    var model = resolveLocalModel();
    var timeoutMs = parseInt(process.env.RMOOZ_FREE_FIGHT_LLM_TIMEOUT_MS || process.env.RMOOZ_AI_TIMEOUT_MS || '45000', 10);
    if (!Number.isFinite(timeoutMs)) timeoutMs = 45000;

    var allowedIds = arr(opts && opts.allowed_unit_ids).filter(Boolean).map(String);
    var unitList = arr(units).map(function (u) {
        return { id: u.id || u.uid || u.unit_uid, side: u.side, lat: u.lat, lon: u.lon, platform: u.platform || u.role || null };
    }).filter(function (u) { return u.id; });
    var effectiveAllowed = allowedIds.length ? allowedIds : unitList.map(function (u) { return u.id; });

    var activeSide = String((context && context.active_side) || (opts && opts.preferSide) || 'RED').toUpperCase();
    // RMOOZ-AI-COMMANDER-FREEDOM-A: commander mode drives doctrine-freedom + temperature.
    var mode = String((context && context.commander_mode) || 'controlled').toLowerCase();
    var freedom = (mode === 'free' || mode === 'high_variation');
    var temperature = mode === 'high_variation' ? 0.85 : (mode === 'free' ? 0.5 : 0.2);

    var system = freedom
        ? [
            'You are a free-thinking military wargame commander AI for an advisory-only demo exercise.',
            'You command the ' + activeSide + ' side.',
            'The commander may choose recon, delay, deception, flank, defend, withdraw, probe, attack, hold, avoid_contact, support, reserve, or reposition.',
            'Do not force intercept/defend/attack.',
            'Choose based on terrain, border/zone, enemy movement, objective, readiness, supply, and previous actions.',
            'Produce at least 3 GENUINELY DIFFERENT courses of action: (1) a cautious/recon/security option, (2) a maneuver/deception/flank option, (3) a direct attack/defense option — not the same movement relabeled.',
            'Recon must observe from standoff and avoid contact; delay must shape the enemy; flank must use a different axis; withdraw must increase distance; deceive must mislead.',
            'For every action explain why_action, why_unit, deciding_factor (terrain/zone/objective/enemy), risk, and expected_result.',
            'Return ONLY a JSON object with a "coas" array. Rules: valid JSON; every unit_uid MUST be from allowed_unit_ids; coordinates inside the map; no teleport (no impossible movement); no invented units; NEVER engage/destroy/open-fire.',
        ].join(' ')
        : [
            'You are a military wargame AI for an advisory-only demo exercise.',
            (activeSide === 'BLUE'
                ? 'You command the BLUE (defending) side: defend, intercept, screen, reinforce, or hold.'
                : 'You command the RED (attacking) side: attack, probe, flank, support, or hold.'),
            'Return ONLY a JSON object with a "coas" array containing 2-3 COA objects.',
            'No other text, explanation, or preamble.',
            'Every unit_uid MUST be from the allowed_unit_ids list — never invent IDs.',
            'Every COA must have at least one action with a valid unit_uid.',
        ].join(' ');

    // GIS / terrain / sovereign-zone / contact context the commander must reason from.
    var intel = context && context._intel;
    var tctx = context && context._terrain_ctx;
    var terrainZoneContext = _buildTerrainZoneContext(intel, tctx);

    var actionEnum = freedom
        ? TACTICS.TACTICAL_ACTIONS.join('|')
        : 'MOVE_TOWARD_OBJECTIVE|SUPPORT_BY_FIRE|HOLD_POSITION|SCREEN_FLANK|RECON_OBJECTIVE';

    var prompt = JSON.stringify({
        units: unitList,
        objectives: arr(objectives).map(function (o) { return { lat: o.lat, lon: o.lon, name: o.name || o.label || 'Objective X' }; }),
        context: { active_side: activeSide, commander_mode: mode },
        allowed_unit_ids: effectiveAllowed,
        allowed_tactical_actions: freedom ? TACTICS.TACTICAL_ACTIONS.slice() : undefined,
        coa_archetypes: freedom ? TACTICS.COA_ARCHETYPES.map(function (a) { return { key: a.key, label: a.label }; }) : undefined,
        terrain_zone_context: terrainZoneContext,
        previous_coa_families: arr(context && context.previous_coa_families),
        instruction: freedom ? 'Produce a DIFFERENT tactical approach than the previous COA family when appropriate; pick the realistic action, the operator will review.' : undefined,
        required_output_schema: {
            coas: [{
                plan_id: 'COA-1',
                title: 'string',
                coa_family: freedom ? 'cautious_recon|maneuver_deception|direct_action' : undefined,
                objective_id: 'string',
                summary: 'string',
                recommended: false,
                risk: 'low|medium|high',
                confidence: 'low|medium|high',
                units_total_considered: 0,
                units_selected_count: 0,
                phases: [{ phase_id: 'phase-1', name: 'Move', actions: [{
                    unit_uid: '<MUST be one of allowed_unit_ids>',
                    side: 'RED|BLUE',
                    role: 'assault|support|screen|reserve|recon|hold|defend',
                    action_type: actionEnum,
                    target: { lat: 0, lon: 0, type: 'objective|coord' },
                    reason: '<one sentence>',
                    why_action: freedom ? '<why this action>' : undefined,
                    why_unit: freedom ? '<why this unit>' : undefined,
                    deciding_factor: freedom ? '<terrain/zone/objective/enemy factor>' : undefined,
                    risk: freedom ? '<the risk>' : undefined,
                    expected_result: freedom ? '<expected result>' : undefined,
                }]}],
                risks: ['string'],
                assumptions: ['string'],
            }],
        },
        constraint: 'unit_uid MUST be exactly one of allowed_unit_ids — do not invent IDs',
    });

    // RMOOZ-AI-ATTACK-PLAN-MCP-PROMPT-A: when the planner supplies the MCP/tool-contract prompt
    // (the single source of truth), send it VERBATIM. The locally-built system/prompt above stay
    // only as the fallback when no MCP prompt is threaded (legacy callers / tests).
    var mcp = context && context._mcp_prompt;
    if (mcp && mcp.system && mcp.prompt) {
        system = mcp.system;
        prompt = mcp.prompt;
        if (arr(mcp.allowed_unit_ids).length) effectiveAllowed = arr(mcp.allowed_unit_ids).map(String);
    }

    var result;
    try {
        result = await provider.generate({
            provider:  providerName,
            model:     model,
            system:    system,
            prompt:    prompt,
            format:    'json',
            options:   { temperature: temperature, numPredict: 2500 },
            timeoutMs: timeoutMs,
        });
    } catch (e) {
        return { ok: false, llm_status: 'error', fallback_reason: 'local_llm_error: ' + str(e && e.message || e, 120) };
    }

    if (!result || !result.ok) {
        var errStr = str(result && result.error, 120);
        var isTimeout = /timeout|timed.out/i.test(errStr);
        return { ok: false, llm_status: isTimeout ? 'timeout' : 'unavailable', fallback_reason: 'local_llm_unavailable: ' + errStr };
    }

    var parsed = parseJsonSafe(result.response || '');
    if (!parsed || !Array.isArray(parsed.coas)) {
        return { ok: false, llm_status: 'invalid_json', fallback_reason: 'llm_invalid_json_or_no_coas_array' };
    }

    var normalized = parsed.coas.map(function (c) { return normalizeCoa(c, effectiveAllowed); }).filter(Boolean);
    if (normalized.length < 2) {
        return { ok: false, llm_status: 'invalid_schema', fallback_reason: 'llm_returned_fewer_than_2_valid_coas (' + normalized.length + ')', partial: normalized };
    }

    // RMOOZ-AI-FREE-FIGHT-REAL-AI-TEST-A: carry the RAW model output so the real-LLM E2E can prove
    // the plan actually came from the local model (the planner otherwise discards it after parsing).
    return { ok: true, coas: normalized, provider_used: result.providerUsed || providerName, model_used: model,
             raw_response: str(result.response || '', 20000) };
}

// ── Timing (RMOOZ-AI-COA-PERFORMANCE-A) ─────────────────────────────────────────
// Lightweight per-request span timer. Records named spans (ms) so the planner can
// return plan.debug_timing and log a one-line breakdown. Request-scoped — a fresh
// timer per planCoas / planCoaVariations call (no global state, no stale carry-over).
function _now() { return Date.now(); }
function makeTimer() {
    var spans = {};
    return {
        sync: function (name, fn) { var s = _now(); try { return fn(); } finally { spans[name] = (spans[name] || 0) + (_now() - s); } },
        async: function (name, thunk) {
            var s = _now();
            return Promise.resolve().then(thunk).then(
                function (v) { spans[name] = (spans[name] || 0) + (_now() - s); return v; },
                function (e) { spans[name] = (spans[name] || 0) + (_now() - s); throw e; }
            );
        },
        mark: function (name, ms) { if (Number.isFinite(ms)) spans[name] = (spans[name] || 0) + ms; },
        spans: function () { return spans; },
    };
}
function _finalizeTimings(timer, tStart) {
    var out = Object.assign({}, timer.spans());
    out.total_ms = _now() - tStart;
    return out;
}
function _logTimings(tag, result) {
    var d = result && result.debug_timing; if (!d) return;
    try {
        console.log('[free-fight/' + tag + '] total=' + d.total_ms + 'ms' +
            ' llm=' + (d.llm_ms || 0) + ' cap=' + (d.analyze_unit_capabilities_ms || 0) +
            ' intel=' + (d.build_scenario_intel_ms || 0) + ' terrain=' + (d.tactical_terrain_context_ms || 0) +
            ' pack=' + (d.build_commander_prompt_pack_ms || 0) + '(capTool=' + (d.get_capability_intel_tool_ms || 0) + ')' +
            ' coa=' + (d.build_diverse_coas_ms || 0) + ' valid=' + (d.validation_ms || 0) +
            ' brief=' + (d.commander_brief_ms || 0) +
            ' [source=' + (result.plan_source || '?') + ' depth=' + (result.ai_depth || '?') + ']');
    } catch (_) {}
}
// ai_depth tier: fast (heuristic caps, no LLM, terrain summary only — no DEM sampling),
// normal (current behavior), deep (full LLM + full terrain/provenance). Default normal.
function _resolveAiDepth(opts, context) {
    var d = String((opts && opts.ai_depth) || (context && context.ai_depth) || 'normal').toLowerCase().trim();
    return (d === 'fast' || d === 'deep') ? d : 'normal';
}

// ── Planning context (RMOOZ-AI-COA-PERFORMANCE-A) ───────────────────────────────
// Build the heavy, REUSABLE part of a planning request exactly once: situation,
// scenario intel, terrain context, capability profiles, and the commander tool pack.
// Generate-5 builds this ONCE and assembles many COA variants from it (only seed /
// buildDiverseCoas varies) — so the costly capability analyst + tool pack run a single
// time. The capability profiles are computed here and HANDED to the tool pack
// (_precomputed_profiles) so the analyst is never run twice for the same units/context.
async function _buildPlanningContext(units, objectives, context, opts, depth, timer) {
    var obj = bestObjective(arr(objectives));
    // Active side: loop context wins, then opts.preferSide, then RED.
    var activeSide = String(context.active_side || opts.preferSide || 'RED').toUpperCase();
    if (activeSide !== 'RED' && activeSide !== 'BLUE') activeSide = 'RED';
    // RMOOZ-AI-COMMANDER-FREEDOM-A: AI Commander Mode — controlled (doctrine-guided),
    // free (free tactical reasoning), high_variation (creative / rotates).
    var commanderMode = String(opts.commander_mode || context.commander_mode || 'controlled').toLowerCase().trim();
    if (['controlled', 'free', 'high_variation'].indexOf(commanderMode) === -1) commanderMode = 'controlled';
    var diverseMode = (commanderMode === 'free' || commanderMode === 'high_variation');
    var allUnits = arr(units).filter(function (u) { return unitHasCoord(u) && String(u.side || 'RED').toUpperCase() === activeSide; });
    if (!allUnits.length) {
        // Fall back to any side if the active side has no movable units
        allUnits = arr(units).filter(unitHasCoord);
    }

    // FREEFIGHT-BLUE-WARNING-ROE-A: evaluate the RED-vs-BLUE situation on the FULL
    // unit set (both sides) BEFORE COA selection, so BLUE reacts to intrusion.
    var situation = timer.sync('situation_ms', function () { return TRIGGERS.evaluateFreeFightSituation(units, objectives, context); });
    var blueIntent = (activeSide === 'BLUE') ? TRIGGERS.buildBlueReactionIntent(situation) : null;
    // RMOZ-INTEL-CAPABILITY-TERRAIN-ZONE-A: shared intelligence snapshot.
    var intel = null;
    try {
        intel = timer.sync('build_scenario_intel_ms', function () {
            return INTEL.buildScenarioIntel(units, objectives,
                Object.assign({}, context, { defending_side: 'BLUE', active_side: activeSide }));
        });
    } catch (_) { intel = null; }

    // GIS terrain-aware tactics. fast depth → no DEM elevation sampling (inferred terrain
    // only); normal/deep keep the real DEM where covered — unchanged geometry.
    var elevFn = (depth === 'fast') ? null : demElevationAt;
    var terrainCtx = null;
    try {
        terrainCtx = timer.sync('tactical_terrain_context_ms', function () {
            // Enemy/threat reference for the terrain axis: BLUE faces the nearest RED; the RED
            // attacker has only the objective (→ the terrain context derives the approach axis
            // from own forces, see buildTacticalTerrainContext degeneracy guard). Using a SAME-
            // side unit here would be wrong, so only BLUE consumes situation.nearest_red.
            var _enemyRef = (activeSide === 'BLUE' && situation && situation.nearest_red &&
                Number.isFinite(+situation.nearest_red.lat)) ? situation.nearest_red : obj;
            return TERRAIN_CTX.buildTacticalTerrainContext({
                objective: obj, nearestEnemy: _enemyRef, situation: situation, intel: intel,
                ownUnits: allUnits, side: activeSide, elevationAt: elevFn,
            });
        });
    } catch (_) { terrainCtx = null; }

    // FREEFIGHT-LLM-CAPABILITY-ANALYST-A: capability profiles. fast depth forces the
    // heuristic (no LLM analyst); normal/deep keep the caller's useLlm. Computed ONCE here
    // and reused by the tool pack below (no duplicate analyst call) + capability-fit ordering.
    var capOpts = Object.assign({}, opts, { useLlm: (depth === 'fast') ? false : opts.useLlm });
    var capProfiles = [], capSummary = null, capByUid = {};
    try {
        capProfiles = await timer.async('analyze_unit_capabilities_ms', function () {
            return ANALYST.analyzeUnitCapabilities(units, Object.assign({}, context, { defending_side: 'BLUE', active_side: activeSide }), capOpts);
        });
        capSummary = ANALYST.buildCapabilitySummary(capProfiles);
        capProfiles.forEach(function (p) { if (p && p.unit_uid) capByUid[p.unit_uid] = p; });
    } catch (_) { capProfiles = []; capSummary = null; capByUid = {}; }
    // Mission key for the active threat's domain (drives capability-fit unit ordering).
    var threatProfile = situation && situation.nearest_red_uid ? capByUid[situation.nearest_red_uid] : null;
    var threatDomain = (threatProfile && threatProfile.domain) || 'ground';
    var capContext = { profiles_by_uid: capByUid, threat_domain: threatDomain,
        mission_score_key: threatDomain === 'air' || threatDomain === 'air_defense' ? 'intercept'
            : (threatDomain === 'naval' ? 'naval_screen' : 'ground_hold') };

    // RMOZ-AI-TOOL-CONTRACT-A: build the versioned tool pack. Reuse the capability profiles
    // we just built (_precomputed_profiles → getCapabilityIntelTool does NOT re-run the
    // analyst), and thread a timing hook so the capability-tool span is captured.
    var toolPack = null, coaFamilyOpts = null, allowedFamilies = [], allowedUnitIds = [];
    try {
        toolPack = await timer.async('build_commander_prompt_pack_ms', function () {
            return CONTRACT.buildCommanderPromptPack({
                units: units, objectives: objectives,
                context: Object.assign({}, context, { defending_side: 'BLUE', active_side: activeSide }),
                opts: Object.assign({}, opts, {
                    _precomputed_profiles: capProfiles,
                    _timing: function (n, ms) { timer.mark(n, ms); },
                }),
            });
        });
        var tc = (toolPack && toolPack.data) || {};
        allowedFamilies = arr(tc.allowed_coa_families);
        allowedUnitIds = arr(tc.allowed_unit_ids);
        var cfoTool = tc.tools_context && tc.tools_context.coa_family_options;
        coaFamilyOpts = (cfoTool && cfoTool.data) || null;
    } catch (_) { toolPack = null; }

    return {
        obj: obj, activeSide: activeSide, commanderMode: commanderMode, diverseMode: diverseMode,
        allUnits: allUnits, units: units, objectives: objectives, context: context, opts: opts,
        depth: depth, elevFn: elevFn,
        situation: situation, blueIntent: blueIntent, intel: intel, terrainCtx: terrainCtx,
        capProfiles: capProfiles, capSummary: capSummary, capByUid: capByUid, capContext: capContext,
        toolPack: toolPack, coaFamilyOpts: coaFamilyOpts, allowedFamilies: allowedFamilies, allowedUnitIds: allowedUnitIds,
    };
}

// Assemble ONE COA plan from an already-built planning context P, for a given variation
// seed. LLM is consulted only in normal/deep depth when enabled; fast depth and the
// Generate-5 non-deep path go straight to the deterministic (diverse/doctrine) builder.
// light=true trims the heavy echo fields (intel / profiles / brief) for multi-variant payloads.
async function _assemblePlan(P, variationSeed, timer, light) {
    var obj = P.obj, activeSide = P.activeSide, commanderMode = P.commanderMode, diverseMode = P.diverseMode;
    var allUnits = P.allUnits, units = P.units, objectives = P.objectives, context = P.context, opts = P.opts, depth = P.depth;
    var situation = P.situation, blueIntent = P.blueIntent, intel = P.intel, terrainCtx = P.terrainCtx;
    var capProfiles = P.capProfiles, capSummary = P.capSummary, capContext = P.capContext;
    var allowedFamilies = P.allowedFamilies, allowedUnitIds = P.allowedUnitIds, coaFamilyOpts = P.coaFamilyOpts, toolPack = P.toolPack;

    function _terrainSummary() {
        if (!terrainCtx) return null;
        return {
            terrain_class: terrainCtx.terrain_class,
            owner_country: terrainCtx.owner_country,
            threat_rings: terrainCtx.threat_rings,
            corridor: terrainCtx.corridor,
            choke: terrainCtx.choke,
            high_ground: terrainCtx.high_ground,
            route_cost: terrainCtx.route_cost,
            provenance: terrainCtx.provenance,
        };
    }
    function _toolContract(planSource, validation, fallbackUsed, repaired) {
        var tcd = (toolPack && toolPack.data) || {};
        return {
            version: CONTRACT.TOOL_CONTRACT_VERSION,
            tools_used: (tcd.tools_context ? Object.keys(tcd.tools_context) : []),
            allowed_coa_families: allowedFamilies,
            recommended_family: (coaFamilyOpts && coaFamilyOpts.recommended_family) || null,
            avoid_repeating: (coaFamilyOpts && coaFamilyOpts.avoid_repeating) || [],
            plan_source: planSource,
            validated: validation ? !!validation.accepted : true,
            rejected_reason: validation ? (validation.rejected_reason || null) : null,
            repaired: !!repaired,
            fallback_used: !!fallbackUsed,
        };
    }
    // Convert a COA into the contract's decision shape for validation.
    function _coaToDecision(coa) {
        var assigns = [];
        arr(coa && coa.phases).forEach(function (ph) {
            arr(ph.actions).forEach(function (a) {
                assigns.push({ unit_uid: a.unit_uid, role: a.role, action_type: a.action_type, target: a.target });
            });
        });
        return { selected_coa_family: (intel && intel.recommended_coa_family) || 'air_intercept', unit_assignments: assigns };
    }

    var llmCalled = false, llmStatus = null, fallbackReason = null, fallbackMessage = null, providerUsed = null, modelUsed = null;
    var _llmContractRejection = null; // set when the LLM COA is rejected by the tool contract

    // RMOOZ-AI-ATTACK-PLAN-MCP-PROMPT-A: the MCP/tool-contract commander prompt is the SINGLE
    // source of truth. Compose it ONCE from the tool pack (the planner sends it verbatim + the UI
    // surfaces it via "View MCP Prompt"). Attached even on the deterministic/disabled path so the
    // operator can see exactly what the AI would be / was instructed with.
    var llmEnabled = process.env.RMOOZ_FREE_FIGHT_LLM === '1';
    var mcpPrompt = null;
    if (!light && toolPack && toolPack.data) {
        try {
            mcpPrompt = CONTRACT.composeCommanderPrompt(toolPack, {
                objective: obj,
                terrain_zone_context: _buildTerrainZoneContext(intel, terrainCtx),
                commander_mode: commanderMode,
                active_side: activeSide,
                allowed_tactical_actions: diverseMode ? TACTICS.TACTICAL_ACTIONS.slice() : undefined,
                coa_archetypes: diverseMode ? TACTICS.COA_ARCHETYPES.map(function (a) { return { key: a.key, label: a.label }; }) : undefined,
                previous_coa_families: arr(context.previous_coa_families),
            });
        } catch (_) { mcpPrompt = null; }
    }

    function _finalize(planSource, coas, validation, fallbackUsed, llmInfo, assess) {
        var result = {
            ok: true,
            plan_source: planSource,
            active_side: activeSide,
            commander_mode: commanderMode,
            variation_seed: variationSeed,
            ai_depth: depth,
            llm_enabled: llmEnabled,
            mcp_prompt: light ? null : mcpPrompt,
            mcp_prompt_version: mcpPrompt ? mcpPrompt.version : ((toolPack && toolPack.version) || null),
            terrain_context: _terrainSummary(),
            coas: coas,
            situation_state: situation,
            blue_reaction_intent: blueIntent,
            intel: light ? null : intel,
            capability_summary: light ? null : capSummary,
            unit_capability_profiles: light ? [] : capProfiles.slice(0, 80),
            tool_contract: _toolContract(planSource, validation, fallbackUsed, false),
            commander_assessment: assess,
            recommended_plan_id: _recommendedPlanId(coas),
            llm_called: llmCalled,
            llm_status: llmStatus,
            fallback_reason: fallbackReason,
            fallback_message: fallbackMessage,
            provider_used: (llmInfo && llmInfo.provider_used) || providerUsed,
            model_used: (llmInfo && llmInfo.model_used) || modelUsed,
        };
        if (light) { result.commander_brief = null; return result; }
        return timer.sync('commander_brief_ms', function () { return _attachCommanderBrief(result, intel, units, context); });
    }

    // LLM path — only in normal/deep depth, when opted in AND the local LLM is enabled.
    var llmAllowed = (depth !== 'fast') && opts.useLlm && process.env.RMOOZ_FREE_FIGHT_LLM === '1';
    if (llmAllowed) {
        llmCalled = true;
        // Give the LLM the freedom context: commander mode, intel (terrain/zone/border),
        // situation, and the variation seed — so it can reason and choose a tactical action.
        var llmCtx = Object.assign({}, context, {
            commander_mode: commanderMode, variation_seed: variationSeed,
            _intel: intel, _situation: situation, _terrain_ctx: terrainCtx,
            // RMOOZ-AI-ATTACK-PLAN-MCP-PROMPT-A: send the MCP/tool-contract prompt verbatim.
            _mcp_prompt: mcpPrompt,
        });
        var llmResult = await timer.async('llm_ms', function () { return _callLlm(allUnits, objectives, llmCtx, opts); });
        llmStatus = llmResult.llm_status || null;
        if (llmResult.ok) {
            var llmCoas = enrichCoasWithNarrative(llmResult.coas, obj, context, 'llm');
            if (activeSide === 'BLUE' && blueIntent) { applyBlueReaction(llmCoas, situation, blueIntent); }
            // RMOZ-AI-TOOL-CONTRACT-A: gate the LLM answer through the validator (structure/
            // physics only). If it assigns invented IDs / kill actions / teleports, reject and
            // fall through to the deterministic floor.
            var llmRecIdx = 0; for (var li = 0; li < llmCoas.length; li++) { if (llmCoas[li].recommended) { llmRecIdx = li; break; } }
            var llmValidation = timer.sync('validation_ms', function () {
                try {
                    return CONTRACT.validateCommanderCoaTool({
                        decision: _coaToDecision(llmCoas[llmRecIdx]), units: allUnits, objectives: objectives,
                        allowed_unit_ids: allowedUnitIds, previous_coa_families: arr(context.previous_coa_families),
                        allowed_families: allowedFamilies,
                    }).data || { accepted: true };
                } catch (_) { return { accepted: true }; }
            });
            if (llmValidation.accepted) {
                // RMOOZ-AI-ATTACK-PLAN-AI-ONLY-A: a validated LLM plan reports llm_status 'ok'
                // (the success path leaves it null otherwise) so the AI-only display gate can
                // distinguish a real LLM result from a fallback cleanly.
                llmStatus = llmStatus || 'ok';
                var llmAssess = buildCommanderAssessment(llmCoas, obj, context, 'llm');
                if (activeSide === 'BLUE' && blueIntent) llmAssess = appendSituationToAssessment(llmAssess, situation);
                return _finalize('llm', llmCoas, llmValidation, false,
                    { provider_used: llmResult.provider_used || null, model_used: llmResult.model_used || null }, llmAssess);
            }
            // LLM COA rejected by the contract → record + drop to deterministic floor.
            fallbackReason = 'coa_contract_rejected: ' + (llmValidation.rejected_reason || 'invalid');
            _llmContractRejection = llmValidation;
        } else {
            fallbackReason = llmResult.fallback_reason || 'llm_failed';
            // RMOOZ-AI-COA-PERFORMANCE-A: honest operator message on a slow/unavailable LLM.
            if (/timeout|unavailable|error|remote_blocked/i.test(String(llmStatus || ''))) {
                fallbackMessage = 'LLM slow/unavailable — used fast tactical planner.';
            }
        }
    }

    // Deterministic plan. In 'free'/'high_variation' this is the diverse archetype builder
    // (genuine tactical variety); in 'controlled' it is the side-aware doctrine-guided
    // builder. The intercept-override (applyBlueReaction) is skipped in diverse mode so the
    // chosen tactical actions (recon/flank/delay/…) are preserved. P.elevFn gates DEM by depth.
    var detSource = diverseMode ? 'deterministic_diverse_coa' : 'deterministic_coa_fallback';
    var coas = timer.sync('build_diverse_coas_ms', function () {
        return enrichCoasWithNarrative(
            buildCoasForSide(allUnits, obj, activeSide, situation, capContext, commanderMode, variationSeed, intel, P.elevFn),
            obj, context, detSource);
    });
    var assess = buildCommanderAssessment(coas, obj, context, detSource);
    if (activeSide === 'BLUE' && blueIntent) {
        if (!diverseMode) applyBlueReaction(coas, situation, blueIntent);
        assess = appendSituationToAssessment(assess, situation);
    }
    return _finalize(detSource, coas, _llmContractRejection, llmCalled, null, assess);
}

// ── Main entry ────────────────────────────────────────────────────────────────
/**
 * planCoas(units, objectives, context, opts)
 * opts: { useLlm, preferSide, allowed_unit_ids, ai_depth, commander_mode }
 * Returns { ok, plan_source, coas[], llm_called, llm_status, fallback_reason?,
 *           fallback_message?, ai_depth, debug_timing, provider_used?, model_used? }
 */
async function planCoas(units, objectives, context, opts) {
    opts = opts || {};
    context = context || {};
    var depth = _resolveAiDepth(opts, context);
    var timer = makeTimer();
    var tStart = _now();
    var P = await _buildPlanningContext(arr(units), objectives, context, opts, depth, timer);
    // Variation seed: explicit, else turn index, else number of prior families (unchanged).
    var seed = Number.isFinite(+context.variation_seed) ? +context.variation_seed
        : (Number.isFinite(+context.turn_index) ? +context.turn_index : arr(context.previous_coa_families).length);
    var result = await _assemblePlan(P, seed, timer, false);
    result.debug_timing = _finalizeTimings(timer, tStart);
    _logTimings('plan-coas', result);
    return result;
}

// RMOOZ-AI-COA-PERFORMANCE-A: Generate-N. Build the heavy planning context ONCE, then
// assemble one COA variant per seed (only the seed / buildDiverseCoas varies). Non-deep
// reuses the cached context with NO further LLM calls (so it is NOT N× slower); deep
// re-runs the LLM per seed. Returns { ok, variations[], shared_debug_timing, debug_timing }.
async function planCoaVariations(units, objectives, context, opts) {
    opts = opts || {};
    context = context || {};
    var depth = _resolveAiDepth(opts, context);
    var seeds = arr(opts.variation_seeds).map(Number).filter(function (n) { return Number.isFinite(n); });
    if (!seeds.length) seeds = [0, 1, 2, 3, 4];
    var timer = makeTimer();
    var tStart = _now();
    var P = await _buildPlanningContext(arr(units), objectives, context, opts, depth, timer);
    var sharedTimings = Object.assign({}, timer.spans()); // the once-built context spans
    var variations = [];
    for (var i = 0; i < seeds.length; i++) {
        var vTimer = makeTimer();
        var vStart = _now();
        // Non-deep: reuse the cached context, no LLM. Deep: full per-seed assembly (LLM each).
        var seedOpts = (depth === 'deep') ? P.opts : Object.assign({}, P.opts, { useLlm: false });
        var Pv = Object.assign({}, P, { opts: seedOpts });
        var plan = await _assemblePlan(Pv, seeds[i], vTimer, true);
        plan.debug_timing = _finalizeTimings(vTimer, vStart);
        variations.push(plan);
    }
    var totalMs = _now() - tStart;
    var out = {
        ok: true,
        ai_depth: depth,
        active_side: P.activeSide,
        commander_mode: P.commanderMode,
        shared_context: true,
        seeds: seeds,
        variations: variations,
        shared_debug_timing: sharedTimings,
        debug_timing: Object.assign({}, sharedTimings, { total_ms: totalMs, variations_count: variations.length }),
    };
    try {
        console.log('[free-fight/plan-coa-variations] seeds=' + seeds.length + ' total=' + totalMs + 'ms' +
            ' shared(cap=' + (sharedTimings.analyze_unit_capabilities_ms || 0) + ' pack=' + (sharedTimings.build_commander_prompt_pack_ms || 0) +
            ' terrain=' + (sharedTimings.tactical_terrain_context_ms || 0) + ') depth=' + depth +
            ' (one shared context, not ' + seeds.length + '×)');
    } catch (_) {}
    return out;
}

function _recommendedPlanId(coas) {
    var rec = arr(coas).filter(function (c) { return c && c.recommended; })[0];
    if (rec) return rec.plan_id || null;
    return (arr(coas)[0] && arr(coas)[0].plan_id) || null;
}

// RMOZ-COMMANDER-BRIEF-COALITION-A: compose the prose commander brief (BLUE+RED,
// coalition posture, copyable text) from the assembled plan + intel. Best-effort.
function _attachCommanderBrief(result, intel, units, context) {
    try {
        result.commander_brief = BRIEF.buildCommanderBrief(result, intel, {
            includeRed: true,
            side: result.active_side,
            units: units,
            scenario_name: (context && (context.scenario_name || context.name)) || null,
        });
    } catch (_) { result.commander_brief = null; }
    return result;
}

// FREEFIGHT-BLUE-WARNING-ROE-A: pick the BLUE COA the situation calls for and
// stamp every BLUE COA with the alert/ROE + warning actions so whichever the
// operator/loop selects carries the reaction intent.
function _coaHintToTitleMatch(hint) {
    if (hint === 'intercept') return /intercept|block/i;
    if (hint === 'hold_screen') return /screen|hold/i;
    return /forward defense|reinforce/i;
}
function applyBlueReaction(coas, situation, intent) {
    var list = arr(coas);
    if (!list.length) return list;
    var match = _coaHintToTitleMatch(intent.recommended_coa_hint);
    var chosen = list.filter(function (c) { return match.test(String(c.title || '')); })[0] || list[0];
    list.forEach(function (c) {
        c.recommended = (c === chosen);
        c.alert_state = situation.alert_state;
        c.roe_state = situation.roe_state;
        c.warning_actions = intent.warning_actions.slice();
    });
    return list;
}
// Fold the situation's triggers + alert/ROE into the commander assessment text.
function appendSituationToAssessment(assessment, situation) {
    if (!situation || !situation.ok) return assessment;
    var parts = [assessment];
    parts.push('BLUE Warning / ROE — Alert: ' + situation.alert_state + ' · ROE: ' + situation.roe_state + '.');
    var top = arr(situation.triggers)[situation.triggers.length - 1];
    if (top && top.code !== 'no_red_threat_near_objective') parts.push('Trigger: ' + top.text);
    return parts.join(' ');
}

// ── Validator ─────────────────────────────────────────────────────────────────
/**
 * validateCoaPlan(plan, units, objectives)
 * Returns { ok, errors[], warnings[] }
 */
function validateCoaPlan(plan, units, objectives) {
    var errors = [], warnings = [];
    if (!plan || !Array.isArray(plan.coas) || plan.coas.length === 0) {
        return { ok: false, errors: ['plan has no coas array'], warnings: warnings };
    }
    plan.coas.forEach(function (coa, ci) {
        arr(coa.phases).forEach(function (ph, pi) {
            arr(ph.actions).forEach(function (act, ai) {
                var label = 'COA[' + ci + '].phase[' + pi + '].action[' + ai + '] uid=' + act.unit_uid;
                // Unit must exist
                var found = getUnitById(units, act.unit_uid);
                if (!found) {
                    errors.push(label + ': unit not found');
                    return;
                }
                // Unit must have coords
                if (!unitHasCoord(found)) {
                    errors.push(label + ': unit has no valid coordinates');
                    return;
                }
                // Side must match
                var unitSide = String(found.side || '').toUpperCase();
                var actSide  = String(act.side  || '').toUpperCase();
                if (unitSide && actSide && unitSide !== actSide) {
                    errors.push(label + ': side mismatch unit=' + unitSide + ' action=' + actSide);
                }
                // Action type valid
                if (ALLOWED_COA_ACTION_TYPES.indexOf(act.action_type) === -1) {
                    errors.push(label + ': invalid action_type=' + act.action_type);
                }
                // Target coords valid (except HOLD_POSITION)
                if (act.action_type !== 'HOLD_POSITION') {
                    if (!act.target || !Number.isFinite(Number(act.target.lat)) || !Number.isFinite(Number(act.target.lon))) {
                        errors.push(label + ': target missing valid lat/lon');
                    }
                }
            });
        });
    });
    return { ok: errors.length === 0, errors: errors, warnings: warnings };
}

// ── Apply ─────────────────────────────────────────────────────────────────────
/**
 * applyCoaPlan(plan, units)
 * Uses plan.selected_coa_index (default 0) to pick which COA to apply.
 * Mutates units in-place. Returns { ok, coa_applied, moved[], errors[], skipped[] }
 */
function applyCoaPlan(plan, units) {
    if (!plan || !Array.isArray(plan.coas) || plan.coas.length === 0) {
        return { ok: false, coa_applied: null, moved: [], errors: ['no coas in plan'], skipped: [] };
    }
    var idx = Number.isFinite(Number(plan.selected_coa_index)) ? Number(plan.selected_coa_index) : 0;
    if (idx < 0 || idx >= plan.coas.length) idx = 0;
    var coa = plan.coas[idx];
    var moved = [], errors = [], skipped = [];

    arr(coa.phases).forEach(function (ph) {
        arr(ph.actions).forEach(function (act) {
            var _at = String(act.action_type || ''), _atl = _at.toLowerCase();
            // HOLD_POSITION (legacy) and the free 'hold' action are no-move by design.
            if (_at === 'HOLD_POSITION' || _atl === 'hold') {
                skipped.push({ unit_uid: act.unit_uid, reason: _at, execution_mode: executionModeFor(act) });
                return;
            }
            var unit = getUnitById(units, act.unit_uid);
            if (!unit) {
                errors.push({ unit_uid: act.unit_uid, reason: 'unit not found' });
                return;
            }
            if (!unitHasCoord(unit)) {
                errors.push({ unit_uid: act.unit_uid, reason: 'unit has no coordinates' });
                return;
            }
            if (!act.target || !Number.isFinite(Number(act.target.lat)) || !Number.isFinite(Number(act.target.lon))) {
                errors.push({ unit_uid: act.unit_uid, reason: 'invalid target coordinates' });
                return;
            }
            var old_pos = { lat: unit.lat, lon: unit.lon };
            var tgt = { lat: Number(act.target.lat), lon: Number(act.target.lon) };
            // recon/observe move a shorter tactical bound (standoff), like legacy RECON_OBJECTIVE.
            var stepSize = (_at === 'RECON_OBJECTIVE' || _atl === 'recon' || _atl === 'observe') ? RECON_STEP_DEG : STEP_DEG;
            var d = dist(old_pos, tgt);
            // Teleport guard
            if (d > MAX_STEP_DEG && stepSize > MAX_STEP_DEG) {
                errors.push({ unit_uid: act.unit_uid, reason: 'step exceeds teleport guard (' + MAX_STEP_DEG + 'deg)' });
                return;
            }
            var new_pos = stepToward(old_pos, tgt, stepSize);
            // Round to 5 decimal places
            new_pos.lat = Math.round(new_pos.lat * 1e5) / 1e5;
            new_pos.lon = Math.round(new_pos.lon * 1e5) / 1e5;
            unit.lat = new_pos.lat;
            unit.lon = new_pos.lon;
            if (Array.isArray(unit.coord) && unit.coord.length >= 2) {
                unit.coord[0] = new_pos.lon; unit.coord[1] = new_pos.lat;
            }
            unit._ff_coa_moved_by_ai = true;
            moved.push({ unit_uid: act.unit_uid, old_pos: old_pos, new_pos: new_pos, action_type: act.action_type, execution_mode: executionModeFor(act), target: { lat: tgt.lat, lon: tgt.lon }, role: act.role });
        });
    });

    return { ok: true, coa_applied: coa.plan_id, moved: moved, errors: errors, skipped: skipped };
}

// ── Event log ─────────────────────────────────────────────────────────────────
/**
 * makeCoaEventLogEntries(plan, applyResult)
 * Returns string[] — one-line entries for the #event-log ledger.
 */
function makeCoaEventLogEntries(plan, applyResult) {
    if (!plan || !applyResult) return [];
    var coas = arr(plan.coas);
    var idx = Number.isFinite(Number(plan.selected_coa_index)) ? Number(plan.selected_coa_index) : 0;
    if (idx < 0 || idx >= coas.length) idx = 0;
    var coa = coas[idx] || {};
    var moved = arr(applyResult.moved);
    var source = plan.plan_source || 'deterministic_coa_fallback';
    var srcTag = source === 'llm' ? 'llm' : 'deterministic';

    var roleCounts = {};
    moved.forEach(function (m) {
        var r = m.role || 'unknown';
        roleCounts[r] = (roleCounts[r] || 0) + 1;
    });
    var roleStr = Object.keys(roleCounts).map(function (r) { return roleCounts[r] + ' ' + r; }).join(', ');

    return [
        'AI COA Applied: ' + str(coa.plan_id || 'COA-?') + ' ' + str(coa.title || '') +
        ' — ' + moved.length + ' units moved' + (roleStr ? ', ' + roleStr : '') +
        ' [' + srcTag + ']',
    ];
}

// ── Module exports ────────────────────────────────────────────────────────────
module.exports = {
    planCoas:               planCoas,
    planCoaVariations:      planCoaVariations,        // RMOOZ-AI-COA-PERFORMANCE-A (Generate-N, shared context)
    validateCoaPlan:        validateCoaPlan,
    applyCoaPlan:           applyCoaPlan,
    makeCoaEventLogEntries: makeCoaEventLogEntries,
    buildDeterministicCoas: buildDeterministicCoas,
    buildBlueCoas:          buildBlueCoas,
    buildCoasForSide:       buildCoasForSide,
    buildDiverseCoas:       buildDiverseCoas,         // RMOOZ-AI-COMMANDER-FREEDOM-A
    executionModeFor:       executionModeFor,         // RMOOZ-AI-MOVEMENT-EXECUTION-AUDIT-A
    EXECUTION_MODE:         EXECUTION_MODE,           // RMOOZ-AI-MOVEMENT-EXECUTION-AUDIT-A
    _callLlmForTest:        _callLlm,                 // RMOOZ-AI-COMMANDER-FREEDOM-A (prompt inspection)
    routeHealth:            routeHealth,
    resolveLocalProvider:   resolveLocalProvider,
    resolveLocalModel:      resolveLocalModel,
    isRemoteProvider:       isRemoteProvider,
    normalizeCoa:           normalizeCoa,
    normalizeCoaAction:     normalizeCoaAction,
    // FREEFIGHT-COA-COMMANDER-NARRATIVE-A
    computeRoleBreakdown:       computeRoleBreakdown,
    buildCoaRationale:          buildCoaRationale,
    buildExpectedEnemyReaction: buildExpectedEnemyReaction,
    buildCommanderAssessment:   buildCommanderAssessment,
    enrichCoasWithNarrative:    enrichCoasWithNarrative,
    ALLOWED_COA_ACTION_TYPES: ALLOWED_COA_ACTION_TYPES,
    ALLOWED_ROLES:            ALLOWED_ROLES,
    STEP_DEG:                 STEP_DEG,
    RECON_STEP_DEG:           RECON_STEP_DEG,
    MAX_STEP_DEG:             MAX_STEP_DEG,
};
