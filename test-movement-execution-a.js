/**
 * test-movement-execution-a.js — RMOOZ-AI-MOVEMENT-EXECUTION-AUDIT-A
 *
 * Proves the movement/animation layer consumes the COA's ACTION-SPECIFIC target — recon
 * stands off, flank goes off-axis, withdraw opens distance, delay targets the choke, deceive
 * leaves the objective axis — and that this is NOT a generic move-toward-objective. Covers the
 * RED-attacker case that previously collapsed (recon ≈ attack) because the terrain axis was
 * degenerate (enemy == objective).
 *
 * Acceptance:
 *  1 recon executes recon movement, NOT attack movement (different bearing/target)
 *  2 flank moves on an off-axis path (large axis offset)
 *  3 withdraw increases distance from the threat
 *  4 delay targets the corridor choke point (a distinct point, not the objective)
 *  5 deceive/feint leave the real objective axis
 *  6 every action carries an execution_mode matching its action_type
 *  7 applyCoaPlan steps toward act.target per action (recon final ≠ attack final; withdraw opens
 *    distance; hold/HOLD_POSITION skipped) and records execution_mode
 *  8 client _resolveCoaMoves carries action_type + execution_mode; recon move ≠ attack move
 *  9 the event log emits one "EXECUTED: <unit> <action> from a,b to c,d via <mode>" per moved unit
 * 10 UI states plainly: deterministic → "LLM not used"; fast → "Fast tactical planner, no LLM"
 * 11 debug overlay shows source/llm_called/depth/seed/lead action/target/final fields
 */
'use strict';
var assert = require('assert');
var path = require('path');

// ── window/DOM stub so the client module loads (mirrors scripts/test-free-fight-demo-a.js) ──
var elements = {};
function makeEl(t) {
    return { tagName: t, id: '', className: '', innerHTML: '', textContent: '', children: [], attrs: {}, style: {},
        appendChild: function (e) { this.children.push(e); if (e.id) elements[e.id] = e; return e; },
        setAttribute: function (k, v) { this.attrs[k] = v; }, removeAttribute: function (k) { delete this.attrs[k]; },
        addEventListener: function () {}, querySelector: function () { return null; } };
}
global.document = { body: makeEl('body'), head: makeEl('head'), createElement: makeEl, getElementById: function (id) { return elements[id] || null; } };
global.window = {}; global.window.document = global.document;
var _eventLog = [];
global.window.AppShellEventLog = { append: function (o) { _eventLog.push(o && o.message != null ? o.message : ''); } };

var UI = path.join(__dirname, 'UI_MOdified');
var CLIENT = path.join(UI, 'client', 'shell'), AI = path.join(UI, 'server', 'ai');
require(path.join(CLIENT, 'world-state-db.js'));
require(path.join(CLIENT, 'symbol-db.js'));
require(path.join(CLIENT, 'symbol-registry.js'));
require(path.join(CLIENT, 'free-fight-demo.js'));
var FF = global.window.RmoozFreeFightDemo;

var P = require(path.join(AI, 'free-fight-coa-planner.js'));
var T = require(path.join(AI, 'tactical-action-library.js'));
var TERRAIN = require(path.join(AI, 'tactical-terrain-context.js'));

var pass = 0, fail = 0;
function ok(n) { pass++; console.log('  ✓ ' + n); }
function bad(n, e) { fail++; console.log('  ✗ ' + n + (e ? (' — ' + (e && e.message || e)) : '')); }
function dist(a, b) { return Math.hypot(a.lon - b.lon, a.lat - b.lat); }
function bearing(a, b) { return Math.atan2(b.lon - a.lon, b.lat - a.lat) * 180 / Math.PI; }
function angDiff(x, y) { var d = Math.abs(x - y) % 360; return d > 180 ? 360 - d : d; }

// RED attacker far from the objective — the case that used to collapse (enemy === objective).
var RED = [{ id: 'R-1', side: 'RED', lat: 24.80, lon: 54.90 }, { id: 'R-2', side: 'RED', lat: 24.78, lon: 54.86 }, { id: 'R-3', side: 'RED', lat: 24.83, lon: 54.94 }];
var BLUE = [{ id: 'B-1', side: 'BLUE', lat: 24.50, lon: 54.40 }];
var OBJ = { lat: 24.45, lon: 54.35 };
var UNIT = { lat: 24.80, lon: 54.90 };
// Terrain ctx exactly as the planner builds it for the RED attacker (nearestEnemy = objective).
var ctx = TERRAIN.buildTacticalTerrainContext({ objective: OBJ, nearestEnemy: OBJ, situation: {}, intel: {},
    ownUnits: RED.map(function (u) { return { lat: u.lat, lon: u.lon }; }), side: 'RED', elevationAt: null });
function geom(a) { return T.computeActionGeometry(a, UNIT, ctx); }

async function main() {
    var gRecon = geom('recon'), gAttack = geom('attack'), gFlank = geom('flank'), gWithdraw = geom('withdraw'),
        gDelay = geom('delay'), gDeceive = geom('deceive');

    // 1 — recon ≠ attack movement.
    try {
        assert(dist(gRecon.target, gAttack.target) > 0.01, 'recon and attack targets differ');
        var bR = bearing(UNIT, gRecon.target), bA = bearing(UNIT, gAttack.target);
        assert(angDiff(bR, bA) > 5, 'recon bearing differs from attack by >5° (got ' + angDiff(bR, bA).toFixed(1) + '°)');
        ok('recon executes recon movement, NOT attack movement (target + bearing differ)');
    } catch (e) { bad('recon executes recon movement, NOT attack movement', e); }

    // 2 — flank off-axis.
    try {
        assert(gFlank.axis_offset_deg > 30, 'flank axis offset large (got ' + gFlank.axis_offset_deg + '°)');
        assert(gFlank.flags.different_axis === true, 'flank flagged different_axis');
        ok('flank moves on an off-axis path (axis_offset ' + gFlank.axis_offset_deg + '°)');
    } catch (e) { bad('flank moves on an off-axis path', e); }

    // 3 — withdraw opens distance from the threat (objective is the threat ref for RED).
    try {
        var dBefore = dist(UNIT, OBJ), dAfter = dist(gWithdraw.target, OBJ);
        assert(dAfter > dBefore, 'withdraw increases distance from threat (' + dBefore.toFixed(3) + ' → ' + dAfter.toFixed(3) + ')');
        assert(gWithdraw.flags.increases_distance_from_threat === true, 'withdraw flagged increases_distance');
        ok('withdraw increases distance from the threat');
    } catch (e) { bad('withdraw increases distance from the threat', e); }

    // 4 — delay targets the corridor choke (a distinct point, NOT the objective).
    try {
        assert(ctx.choke, 'choke present');
        assert(dist(ctx.choke, OBJ) > 0.05, 'choke is a distinct corridor point, not the objective (' + dist(ctx.choke, OBJ).toFixed(3) + '°)');
        assert(/inferred_(approach_)?corridor|gis_dem_relief/.test(ctx.provenance.choke), 'choke provenance honest: ' + ctx.provenance.choke);
        assert(dist(gDelay.target, OBJ) > 0.02, 'delay does not target the objective');
        ok('delay targets the corridor choke point (not the objective)');
    } catch (e) { bad('delay targets the corridor choke point (not the objective)', e); }

    // 5 — deceive/feint leave the real objective axis.
    try {
        assert(gDeceive.flags.different_axis === true && gDeceive.flags.misleading === true, 'deceive flagged off-axis + misleading');
        var bD = bearing(UNIT, gDeceive.target), bO = bearing(UNIT, OBJ);
        assert(angDiff(bD, bO) > 30, 'deceive leaves the objective axis (>30°, got ' + angDiff(bD, bO).toFixed(1) + '°)');
        ok('deceive/feint leave the real objective axis');
    } catch (e) { bad('deceive/feint leave the real objective axis', e); }

    // 6 — execution_mode stamped + correct.
    try {
        var plan = await P.planCoas(RED.concat(BLUE), [OBJ], { active_side: 'RED', commander_mode: 'high_variation', variation_seed: 0 },
            { commander_mode: 'high_variation', useLlm: false });
        var allActions = [];
        plan.coas.forEach(function (c) { (c.phases[0].actions || []).forEach(function (a) { allActions.push(a); }); });
        assert(allActions.length && allActions.every(function (a) { return typeof a.execution_mode === 'string' && a.execution_mode; }), 'every action has execution_mode');
        assert(P.executionModeFor({ action_type: 'recon' }) === 'recon_standoff_target', 'recon → recon_standoff_target');
        assert(P.executionModeFor({ action_type: 'flank' }) === 'flank_offaxis_target', 'flank → flank_offaxis_target');
        assert(P.executionModeFor({ action_type: 'attack' }) === 'attack_direct_target', 'attack → attack_direct_target');
        assert(P.executionModeFor({ action_type: 'MOVE_TOWARD_OBJECTIVE' }) === 'move_toward_objective', 'legacy mapped');
        ok('every action carries an execution_mode matching its action_type');
    } catch (e) { bad('every action carries an execution_mode matching its action_type', e); }

    // 7 — applyCoaPlan steps toward act.target per action.
    try {
        function coaWith(actionType, g) {
            return { coas: [{ plan_id: 'COA-T', phases: [{ phase_id: 'p1', name: 'x', actions: [
                { unit_uid: 'R-1', side: 'RED', role: 'assault', action_type: actionType, target: { lat: g.target.lat, lon: g.target.lon, type: 'coord' } },
            ] }] }], selected_coa_index: 0 };
        }
        function freshUnit() { return [{ id: 'R-1', side: 'RED', lat: UNIT.lat, lon: UNIT.lon, coord: [UNIT.lon, UNIT.lat] }]; }
        var reconPlan = P.enrichCoasWithNarrative(coaWith('recon', gRecon).coas, OBJ, {}, 'test') && coaWith('recon', gRecon);
        P.enrichCoasWithNarrative(reconPlan.coas, OBJ, {}, 'test');
        var attackPlan = coaWith('attack', gAttack); P.enrichCoasWithNarrative(attackPlan.coas, OBJ, {}, 'test');
        var withdrawPlan = coaWith('withdraw', gWithdraw); P.enrichCoasWithNarrative(withdrawPlan.coas, OBJ, {}, 'test');

        var ru = freshUnit(), au = freshUnit(), wu = freshUnit();
        var rRes = P.applyCoaPlan(reconPlan, ru);
        var aRes = P.applyCoaPlan(attackPlan, au);
        var wRes = P.applyCoaPlan(withdrawPlan, wu);
        assert(rRes.moved[0] && rRes.moved[0].execution_mode === 'recon_standoff_target', 'applyCoaPlan moved record carries execution_mode');
        assert(dist({ lat: ru[0].lat, lon: ru[0].lon }, { lat: au[0].lat, lon: au[0].lon }) > 0.005, 'recon final ≠ attack final after apply');
        assert(dist({ lat: wu[0].lat, lon: wu[0].lon }, OBJ) > dist(UNIT, OBJ), 'withdraw final opens distance from threat');
        // hold / HOLD_POSITION skipped
        var holdPlan = { coas: [{ plan_id: 'H', phases: [{ phase_id: 'p', name: 'x', actions: [
            { unit_uid: 'R-1', side: 'RED', role: 'hold', action_type: 'hold', target: { lat: OBJ.lat, lon: OBJ.lon } },
            { unit_uid: 'R-1', side: 'RED', role: 'reserve', action_type: 'HOLD_POSITION', target: { lat: UNIT.lat, lon: UNIT.lon } },
        ] }] }], selected_coa_index: 0 };
        var hu = freshUnit(); var hRes = P.applyCoaPlan(holdPlan, hu);
        assert(hRes.moved.length === 0 && hRes.skipped.length === 2, 'hold + HOLD_POSITION both skipped (no move)');
        ok('applyCoaPlan steps toward act.target per action (recon≠attack, withdraw opens distance, hold skipped)');
    } catch (e) { bad('applyCoaPlan steps toward act.target per action', e); }

    // 8 — client _resolveCoaMoves carries action_type + execution_mode; recon move ≠ attack move.
    try {
        global.window.RmoozScenario = { scenario: { red_units: RED.map(function (u) { return { id: u.id, side: u.side, lat: u.lat, lon: u.lon, coord: [u.lon, u.lat] }; }),
            blue_units_initial: BLUE.map(function (u) { return { id: u.id, side: u.side, lat: u.lat, lon: u.lon, coord: [u.lon, u.lat] }; }) } };
        var plan8 = await P.planCoas(RED.concat(BLUE), [OBJ], { active_side: 'RED', commander_mode: 'high_variation', variation_seed: 0 }, { commander_mode: 'high_variation', useLlm: false });
        var reconCoa = plan8.coas.filter(function (c) { return c.coa_family === 'cautious_recon'; })[0];
        var directCoa = plan8.coas.filter(function (c) { return c.coa_family === 'direct_action'; })[0];
        var rMoves = FF._resolveCoaMovesForTest(reconCoa);
        var aMoves = FF._resolveCoaMovesForTest(directCoa);
        assert(rMoves.length && rMoves.every(function (m) { return m.action_type && m.execution_mode; }), 'moves carry action_type + execution_mode');
        // a lead unit that recons in the cautious COA and attacks in the direct COA
        var reconM = rMoves.filter(function (m) { return m.action_type === 'recon'; })[0];
        assert(reconM, 'a recon move exists');
        var sameUnitAttack = aMoves.filter(function (m) { return String(m.uid) === String(reconM.uid); })[0];
        assert(sameUnitAttack, 'same unit has a move in the direct COA');
        assert(dist(reconM.final, sameUnitAttack.final) > 0.003, 'same unit: recon final ≠ attack final (' + dist(reconM.final, sameUnitAttack.final).toFixed(4) + '°)');
        ok('client _resolveCoaMoves carries action_type + execution_mode; recon move ≠ attack move');
    } catch (e) { bad('client _resolveCoaMoves carries action_type + execution_mode; recon move ≠ attack move', e); }

    // 9 — EXECUTED event-log line per moved unit.
    try {
        _eventLog.length = 0;
        var moves = [
            { uid: 'B-3', unit: { id: 'B-3' }, action_type: 'recon', execution_mode: 'recon_standoff_target', held: false, start: { lat: 24.10, lon: 54.20 }, final: { lat: 24.14, lon: 54.24 } },
            { uid: 'R-9', unit: { id: 'R-9' }, action_type: 'attack', execution_mode: 'attack_direct_target', held: false, start: { lat: 24.50, lon: 54.50 }, final: { lat: 24.46, lon: 54.46 } },
            { uid: 'R-5', unit: { id: 'R-5' }, action_type: 'hold', execution_mode: 'hold_no_move', held: true, start: { lat: 24.0, lon: 54.0 }, final: { lat: 24.0, lon: 54.0 } },
        ];
        FF._logExecutedMovesForTest(moves);
        var line = _eventLog.filter(function (m) { return /^EXECUTED: B-3 recon from/.test(m); })[0];
        assert(line === 'EXECUTED: B-3 recon from 24.10,54.20 to 24.14,54.24 via recon_standoff_target', 'exact EXECUTED format: ' + line);
        assert(_eventLog.some(function (m) { return /^EXECUTED: R-5 hold HELD at/.test(m); }), 'held unit logged as HELD');
        assert(_eventLog.filter(function (m) { return /^EXECUTED:/.test(m); }).length === 3, 'one EXECUTED line per unit');
        ok('event log emits one EXECUTED line per moved unit proving action → movement → final position');
    } catch (e) { bad('event log emits one EXECUTED line per moved unit', e); }

    // 10 — UI source notes.
    try {
        var fastNote = FF._planSourceNoteHtmlForTest({ ok: true, ai_depth: 'fast', plan_source: 'deterministic_diverse_coa', llm_called: false });
        assert(/Fast tactical planner, no LLM\./.test(fastNote), 'fast → "Fast tactical planner, no LLM."');
        var detNote = FF._planSourceNoteHtmlForTest({ ok: true, ai_depth: 'normal', plan_source: 'deterministic_diverse_coa', llm_called: false });
        assert(/LLM not used/.test(detNote), 'deterministic → "LLM not used"');
        var llmNote = FF._planSourceNoteHtmlForTest({ ok: true, ai_depth: 'deep', plan_source: 'llm', llm_called: true });
        assert(/LLM-planned/.test(llmNote), 'llm → "LLM-planned"');
        ok('UI states plainly: deterministic → "LLM not used"; fast → "Fast tactical planner, no LLM"');
    } catch (e) { bad('UI states plainly LLM usage', e); }

    // 11 — debug overlay fields.
    try {
        var plan11 = await P.planCoas(RED.concat(BLUE), [OBJ], { active_side: 'RED', commander_mode: 'high_variation', variation_seed: 0 }, { commander_mode: 'high_variation', useLlm: false });
        var html = FF._coaDebugHtmlForTest(plan11, false, []);
        ['plan_source', 'llm_called', 'ai_depth', 'variation_seed', 'lead action', 'target coord', 'final coord'].forEach(function (k) {
            assert(html.indexOf(k) !== -1, 'debug overlay shows ' + k);
        });
        ok('debug overlay shows source / llm_called / depth / seed / lead action / target / final fields');
    } catch (e) { bad('debug overlay shows the required fields', e); }

    console.log('\n' + (fail === 0 ? '✅ ' : '❌ ') + pass + ' passed, ' + fail + ' failed (test-movement-execution-a.js)');
    process.exit(fail === 0 ? 0 : 1);
}
main().catch(function (e) { console.error('FATAL', e); process.exit(1); });
