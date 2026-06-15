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

// ── Constants ─────────────────────────────────────────────────────────────────
var STEP_DEG       = 0.05;   // ≈ 5-6 km per tick
var RECON_STEP_DEG = 0.03;   // recon moves shorter
var MAX_STEP_DEG   = 0.15;   // teleport guard

var ALLOWED_COA_ACTION_TYPES = [
    'MOVE_TOWARD_OBJECTIVE', 'SUPPORT_BY_FIRE', 'HOLD_POSITION',
    'SCREEN_FLANK', 'RECON_OBJECTIVE'
];
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
function buildBlueCoas(blueUnits, obj, situation) {
    var units = arr(blueUnits).filter(unitHasCoord);
    var total = units.length;
    if (obj && finiteLL(obj)) {
        units = units.slice().sort(function (a, b) {
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
 * buildCoasForSide(units, obj, side, situation) — dispatch to the RED (attack) or
 * BLUE (defense) deterministic builder based on the active side. The situation
 * (FREEFIGHT-BLUE-THREAT-AWARE-MOVEMENT-A) lets BLUE intercept the RED threat axis.
 */
function buildCoasForSide(units, obj, side, situation) {
    return String(side || 'RED').toUpperCase() === 'BLUE'
        ? buildBlueCoas(units, obj, situation)
        : buildDeterministicCoas(units, obj);
}

// ── LLM normalizers ───────────────────────────────────────────────────────────
/**
 * normalizeCoaAction(raw, allowedUnitIds) → action | null
 * Rejects if unit_uid not in allowedUnitIds.
 */
function normalizeCoaAction(raw, allowedUnitIds) {
    if (!raw || typeof raw !== 'object') return null;
    var at = str(raw.action_type).toUpperCase();
    if (ALLOWED_COA_ACTION_TYPES.indexOf(at) === -1) return null;
    var uid = str(raw.unit_uid);
    if (!uid) return null;
    var allowed = arr(allowedUnitIds).map(String);
    if (allowed.length && allowed.indexOf(uid) === -1) return null;
    var side = str(raw.side || 'RED').toUpperCase();
    var role = str(raw.role || 'assault').toLowerCase();
    if (ALLOWED_ROLES.indexOf(role) === -1) role = 'assault';
    var tgt = (raw.target && typeof raw.target === 'object') ? {
        type: str(raw.target.type || 'coord', 20),
        lat:  Number.isFinite(Number(raw.target.lat)) ? Number(raw.target.lat) : 0,
        lon:  Number.isFinite(Number(raw.target.lon)) ? Number(raw.target.lon) : 0,
    } : { type: 'coord', lat: 0, lon: 0 };
    return {
        unit_uid:    uid,
        side:        side,
        role:        role,
        action_type: at,
        target:      tgt,
        reason:      str(raw.reason, 400),
    };
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

/**
 * enrichCoasWithNarrative(coas, obj, context, planSource) → coas (mutated in place)
 * Adds role_breakdown / rationale / expected_enemy_reaction to each COA.
 */
function enrichCoasWithNarrative(coas, obj, context, planSource) {
    var objName = (obj && (obj.name || obj.label)) || 'Objective X';
    arr(coas).forEach(function (coa) {
        if (!coa || typeof coa !== 'object') return;
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
    var sideDoctrine = activeSide === 'BLUE'
        ? 'You command the BLUE (defending) side: defend, intercept, screen, reinforce, or hold.'
        : 'You command the RED (attacking) side: attack, probe, flank, support, or hold.';
    var system = [
        'You are a military wargame AI for an advisory-only demo exercise.',
        sideDoctrine,
        'Return ONLY a JSON object with a "coas" array containing 2-3 COA objects.',
        'No other text, explanation, or preamble.',
        'Every unit_uid MUST be from the allowed_unit_ids list — never invent IDs.',
        'Every COA must have at least one action with a valid unit_uid.',
    ].join(' ');

    var prompt = JSON.stringify({
        units: unitList,
        objectives: arr(objectives).map(function (o) { return { lat: o.lat, lon: o.lon, name: o.name || o.label || 'Objective X' }; }),
        context: context || {},
        allowed_unit_ids: effectiveAllowed,
        required_output_schema: {
            coas: [{
                plan_id: 'COA-1',
                title: 'string',
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
                    role: 'assault|support|screen|reserve|recon|hold',
                    action_type: 'MOVE_TOWARD_OBJECTIVE|SUPPORT_BY_FIRE|HOLD_POSITION|SCREEN_FLANK|RECON_OBJECTIVE',
                    target: { lat: 0, lon: 0, type: 'objective|coord' },
                    reason: '<one sentence>',
                }]}],
                risks: ['string'],
                assumptions: ['string'],
            }],
        },
        constraint: 'unit_uid MUST be exactly one of allowed_unit_ids — do not invent IDs',
    });

    var result;
    try {
        result = await provider.generate({
            provider:  providerName,
            model:     model,
            system:    system,
            prompt:    prompt,
            format:    'json',
            options:   { temperature: 0.2, numPredict: 2500 },
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

    return { ok: true, coas: normalized, provider_used: result.providerUsed || providerName, model_used: model };
}

// ── Main entry ────────────────────────────────────────────────────────────────
/**
 * planCoas(units, objectives, context, opts)
 * opts: { useLlm, preferSide, allowed_unit_ids }
 * Returns { ok, plan_source, coas[], llm_called, llm_status, fallback_reason?,
 *           provider_used?, model_used? }
 */
async function planCoas(units, objectives, context, opts) {
    opts = opts || {};
    context = context || {};
    var obj = bestObjective(arr(objectives));
    // Active side: loop context wins, then opts.preferSide, then RED.
    var activeSide = String(context.active_side || opts.preferSide || 'RED').toUpperCase();
    if (activeSide !== 'RED' && activeSide !== 'BLUE') activeSide = 'RED';
    var allUnits = arr(units).filter(function (u) { return unitHasCoord(u) && String(u.side || 'RED').toUpperCase() === activeSide; });
    if (!allUnits.length) {
        // Fall back to any side if the active side has no movable units
        allUnits = arr(units).filter(unitHasCoord);
    }

    // FREEFIGHT-BLUE-WARNING-ROE-A: evaluate the RED-vs-BLUE situation on the FULL
    // unit set (both sides) BEFORE COA selection, so BLUE reacts to intrusion.
    var situation = TRIGGERS.evaluateFreeFightSituation(units, objectives, context);
    var blueIntent = (activeSide === 'BLUE') ? TRIGGERS.buildBlueReactionIntent(situation) : null;
    // RMOZ-INTEL-CAPABILITY-TERRAIN-ZONE-A: shared intelligence snapshot (capability,
    // superiority, terrain, sovereign zone, contacts, ROE, COA family variety, best assets).
    var intel = null;
    try {
        intel = INTEL.buildScenarioIntel(units, objectives,
            Object.assign({}, context, { defending_side: 'BLUE', active_side: activeSide }));
    } catch (_) { intel = null; }

    var llmCalled = false, llmStatus = null, fallbackReason = null, providerUsed = null, modelUsed = null;

    if (opts.useLlm && process.env.RMOOZ_FREE_FIGHT_LLM === '1') {
        llmCalled = true;
        var llmResult = await _callLlm(allUnits, objectives, context, opts);
        llmStatus = llmResult.llm_status || null;
        if (llmResult.ok) {
            var llmCoas = enrichCoasWithNarrative(llmResult.coas, obj, context, 'llm');
            var llmAssess = buildCommanderAssessment(llmCoas, obj, context, 'llm');
            if (activeSide === 'BLUE' && blueIntent) { applyBlueReaction(llmCoas, situation, blueIntent); llmAssess = appendSituationToAssessment(llmAssess, situation); }
            return _attachCommanderBrief({
                ok: true,
                plan_source: 'llm',
                active_side: activeSide,
                coas: llmCoas,
                situation_state: situation,
                blue_reaction_intent: blueIntent,
                intel: intel,
                commander_assessment: llmAssess,
                recommended_plan_id: _recommendedPlanId(llmCoas),
                llm_called: true,
                llm_status: llmStatus,
                fallback_reason: null,
                provider_used: llmResult.provider_used || null,
                model_used: llmResult.model_used || null,
            }, intel, units, context);
        }
        fallbackReason = llmResult.fallback_reason || 'llm_failed';
    }

    // Deterministic fallback — side-aware (RED attack vs BLUE defense), threat-aware for BLUE
    var coas = enrichCoasWithNarrative(buildCoasForSide(allUnits, obj, activeSide, situation), obj, context, 'deterministic_coa_fallback');
    var assess = buildCommanderAssessment(coas, obj, context, 'deterministic_coa_fallback');
    if (activeSide === 'BLUE' && blueIntent) { applyBlueReaction(coas, situation, blueIntent); assess = appendSituationToAssessment(assess, situation); }
    return _attachCommanderBrief({
        ok: true,
        plan_source: 'deterministic_coa_fallback',
        active_side: activeSide,
        coas: coas,
        situation_state: situation,
        blue_reaction_intent: blueIntent,
        intel: intel,
        commander_assessment: assess,
        recommended_plan_id: _recommendedPlanId(coas),
        llm_called: llmCalled,
        llm_status: llmStatus,
        fallback_reason: fallbackReason,
        provider_used: providerUsed,
        model_used: modelUsed,
    }, intel, units, context);
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
            if (act.action_type === 'HOLD_POSITION') {
                skipped.push({ unit_uid: act.unit_uid, reason: 'HOLD_POSITION' });
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
            var stepSize = act.action_type === 'RECON_OBJECTIVE' ? RECON_STEP_DEG : STEP_DEG;
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
            moved.push({ unit_uid: act.unit_uid, old_pos: old_pos, new_pos: new_pos, action_type: act.action_type, role: act.role });
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
    validateCoaPlan:        validateCoaPlan,
    applyCoaPlan:           applyCoaPlan,
    makeCoaEventLogEntries: makeCoaEventLogEntries,
    buildDeterministicCoas: buildDeterministicCoas,
    buildBlueCoas:          buildBlueCoas,
    buildCoasForSide:       buildCoasForSide,
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
