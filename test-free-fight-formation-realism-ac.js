/**
 * test-free-fight-formation-realism-ac.js — RMOOZ-AUTO-SCENARIO-FORMATION-REALISM-AC
 *
 * Deterministic tactical spacing so Blue/Red no longer stack on the exact objective coordinate, plus
 * area-based objective control. NO LLM on normal turns; NO /plan-coas. Engine frozen.
 *
 * Acceptance (the 11 specified tests):
 *   1  Blue units do not all end at the identical objective coordinate
 *   2  Red counter units move to a screen/blocking ring, not the exact objective center
 *   3  multiple units receive deterministic separated offsets
 *   4  objective control = contested when both sides are inside the radii
 *   5  objective control = blue (secured) when Blue present and Red cannot contest
 *   6  Run Scenario Auto continues without /plan-coas
 *   7  normal scenario turns keep llm_called_this_tick=false
 *   8  decision log records formation_assignment + objective_control_check (called_llm=false)
 *   9  Blue auto order targets ring positions (not exact objective center)
 *  10  formation helpers expose the six rings deterministically
 *  11  objective control state surfaces on the scenario state
 */
'use strict';
var assert = require('assert');
var path = require('path');

var elById = {};
function makeEl(t) {
    var el = { tagName: t, innerHTML: '', textContent: '', children: [], attrs: {}, style: {},
        appendChild: function (e) { this.children.push(e); if (e && e.id) elById[e.id] = e; return e; },
        removeChild: function (e) { var i = this.children.indexOf(e); if (i >= 0) this.children.splice(i, 1); return e; },
        setAttribute: function (k, v) { this.attrs[k] = v; }, removeAttribute: function (k) { delete this.attrs[k]; },
        addEventListener: function () {}, removeEventListener: function () {},
        querySelector: function () { return null; }, querySelectorAll: function () { return []; }, getAttribute: function (k) { return this.attrs[k]; } };
    Object.defineProperty(el, 'parentNode', { value: null, writable: true });
    return el;
}
var bodyEl = makeEl('body');
var FETCHED = [];
global.document = { body: bodyEl, head: makeEl('head'), createElement: makeEl, getElementById: function (id) { return elById[id] || null; }, querySelector: function () { return null; } };
global.window = {
    document: global.document, AppShellEventLog: { append: function () {} },
    sessionStorage: (function () { var d = {}; return { getItem: function (k) { return d[k] || null; }, setItem: function (k, v) { d[k] = String(v); }, removeItem: function (k) { delete d[k]; } }; })(),
    setTimeout: function () { return 0; }, clearTimeout: function () {}, setInterval: function () { return 0; }, clearInterval: function () {},
    fetch: function (u) { FETCHED.push(String(u)); return Promise.resolve({ ok: true, status: 200, statusText: 'OK', text: function () { return Promise.resolve(JSON.stringify(GREEN)); }, json: function () { return Promise.resolve(GREEN); } }); },
};
global.window.window = global.window;
var GREEN = { ok: true, collateral_risk: { band: 'high', score: 80 }, road_status: { status: 'constrained' }, neutral_reaction_score: 80, provenance: { engine: 'deterministic' }, deterministic: true };

var OBJ = { lat: 24.45, lon: 54.40 };
function setUnits(red, blue) { global.window.RmoozScenario = { scenario: { id: 'ac', red_units: red, blue_units_initial: blue, obj: { name: 'Objective X', coord: [OBJ.lon, OBJ.lat] } } }; }
function contestedUnits() {
    // Blue inside the control radius (reached), Red just inside the contest radius (~6.6km) → contested
    setUnits(
        [{ id: 'R-1', side: 'RED', lat: 24.45, lon: 54.46, coord: [54.46, 24.45] }, { id: 'R-2', side: 'RED', lat: 24.46, lon: 54.46, coord: [54.46, 24.46] }],
        [{ id: 'B-1', side: 'BLUE', lat: 24.452, lon: 54.402, coord: [54.402, 24.452] }, { id: 'B-2', side: 'BLUE', lat: 24.448, lon: 54.398, coord: [54.398, 24.448] }]
    );
}
contestedUnits();

var C = path.join(__dirname, 'UI_MOdified', 'client', 'shell');
require(path.join(C, 'world-state-db.js'));
require(path.join(C, 'symbol-db.js'));
require(path.join(C, 'symbol-registry.js'));
require(path.join(C, 'free-fight-demo.js'));
var DEMO = global.window.RmoozFreeFightDemo;

var pass = 0, fail = 0;
function ok(n) { pass++; console.log('  ✓ ' + n); }
function bad(n, e) { fail++; console.log('  ✗ ' + n + (e ? (' — ' + (e && e.message || e)) : '')); }
function flush() { return Promise.resolve().then(function () {}).then(function () {}).then(function () {}); }
function km(a, b) { var R = 6371, tr = Math.PI / 180; var dLat = (b.lat - a.lat) * tr, dLon = (b.lon - a.lon) * tr, la1 = a.lat * tr, la2 = b.lat * tr; var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) * Math.sin(dLon / 2); return 2 * R * Math.asin(Math.min(1, Math.sqrt(h))); }

DEMO.mount({ brief: { operational_brief: { proposed_units: [{ id: 'B-1', side: 'BLUE', lat: 24.452, lon: 54.402 }, { id: 'B-2', side: 'BLUE', lat: 24.448, lon: 54.398 }], objectives: [{ label: 'Objective X', lat: 24.45, lon: 54.40 }] } } });
DEMO._setRouteHealthForTest({ ok: true, allow_sim_run: true, ai_execution_enabled: true, model_available: true, provider: 'ollama', model: 'qwen3-coder:latest' });
if (DEMO.setObjective) DEMO.setObjective({ lat: 24.45, lon: 54.40 });

function bluePlan() {
    return { ok: true, plan_source: 'llm', recommended_plan_id: 'COA-1', validation: { ok: true },
        coas: [{ plan_id: 'COA-1', recommended: true, title: 'Advance', side: 'BLUE',
            phases: [{ name: 'Advance', actions: [{ unit_uid: 'B-1', action_type: 'MOVE', role: 'assault', target: { lat: 24.45, lon: 54.40 } }, { unit_uid: 'B-2', action_type: 'MOVE', role: 'support', target: { lat: 24.45, lon: 54.40 } }] }] }] };
}
function fresh(auto) {
    DEMO._resetScenarioForTest(); DEMO._forgetCoaExecInMemoryForTest();
    DEMO._setScenarioAutoContinueForTest(!!auto);
    DEMO._setCoaPlanForTest(bluePlan()); DEMO._setCoaSelectedIdxForTest(0); DEMO._setFfLegacyOpenForTest(false);
    contestedUnits();
}

(async function main() {

    // 10 — formation helpers expose six rings deterministically (run first; pure).
    try {
        var f = DEMO._objFormationForTest(OBJ);
        ['objective_center', 'assault_ring', 'support_ring', 'screen_ring', 'blocking_ring', 'reserve_ring'].forEach(function (k) { assert(k in f, 'helper "' + k + '" present'); });
        var a0 = f.assault_ring(0);
        assert(km(a0, OBJ) > 1 && km(a0, OBJ) < 4, 'assault ring ~2km from objective (got ' + km(a0, OBJ).toFixed(1) + 'km)');
        assert(km(f.blocking_ring(0), OBJ) > 2.5 && km(f.blocking_ring(0), OBJ) < 6, 'blocking ring ~4km from objective');
        ok('10 formation helpers expose the six rings at deterministic radii');
    } catch (e) { bad('10 formation helpers', e); }

    // 3 — multiple units receive deterministic separated offsets.
    try {
        var p0 = DEMO._ringPosForTest(OBJ, 'assault', 0), p1 = DEMO._ringPosForTest(OBJ, 'assault', 1);
        assert(p0.lat !== p1.lat || p0.lon !== p1.lon, 'idx 0 and idx 1 differ on the assault ring');
        assert(km(p0, p1) > 0.3, 'the two positions are separated (' + km(p0, p1).toFixed(2) + 'km)');
        // deterministic: same call twice → identical
        var p0b = DEMO._ringPosForTest(OBJ, 'assault', 0);
        assert(p0b.lat === p0.lat && p0b.lon === p0.lon, 'ring position is deterministic');
        ok('3 multiple units get deterministic, separated offsets');
    } catch (e) { bad('3 separated offsets', e); }

    // 9 — Blue auto order targets ring positions, not the exact objective center.
    try {
        fresh(true);
        DEMO._commitCoaForTest(0);
        var coa = DEMO._autoDirectorBuildCoaForTest();   // contested+reached → hold_screen (support ring)
        var acts = coa.phases[0].actions.filter(function (a) { return a.action_type === 'MOVE'; });
        assert(acts.length >= 1, 'auto order has MOVE actions');
        assert(acts.every(function (a) { return a.target && (Math.abs(a.target.lat - OBJ.lat) > 1e-4 || Math.abs(a.target.lon - OBJ.lon) > 1e-4); }), 'no MOVE targets the EXACT objective center');
        ok('9 Blue auto order targets ring positions, not the exact objective center');
    } catch (e) { bad('9 blue ring targets', e); }

    // 1 — Blue units do not all end at the identical objective coordinate (drive auto a few turns).
    try {
        fresh(true);
        DEMO._commitCoaForTest(0);
        DEMO._runScenarioForTest();
        for (var i = 0; i < 25; i++) DEMO._scenarioTickForTest();
        var B = global.window.RmoozScenario.scenario.blue_units_initial;
        assert(!(B[0].lat === B[1].lat && B[0].lon === B[1].lon), 'B-1 and B-2 are NOT at the identical coordinate (' + B[0].lat + ',' + B[0].lon + ' vs ' + B[1].lat + ',' + B[1].lon + ')');
        var b1AtCenter = (Math.abs(B[0].lat - OBJ.lat) < 1e-4 && Math.abs(B[0].lon - OBJ.lon) < 1e-4);
        var b2AtCenter = (Math.abs(B[1].lat - OBJ.lat) < 1e-4 && Math.abs(B[1].lon - OBJ.lon) < 1e-4);
        assert(!(b1AtCenter && b2AtCenter), 'Blue units did not both stack on the exact objective center');
        ok('1 Blue units do NOT all end at the identical objective coordinate');
    } catch (e) { bad('1 no blue stacking', e); }

    // 2 — Red counter units move to a blocking ring, not the exact objective center.
    try {
        fresh(true);
        DEMO._commitCoaForTest(0);
        var man = DEMO._redManeuverOrderForTest();   // contested+reached → counter
        assert(man.posture === 'counter', 'Red posture = counter (got ' + man.posture + ')');
        assert(man.ring === 'blocking', 'Red counter targets the blocking ring (got ' + man.ring + ')');
        assert(man.target && km(man.target, OBJ) > 2, 'blocking target is OFF the exact center (~' + (man.target ? km(man.target, OBJ).toFixed(1) : '?') + 'km)');
        var R = global.window.RmoozScenario.scenario.red_units;
        assert(!(Math.abs(R[0].lat - OBJ.lat) < 1e-4 && Math.abs(R[0].lon - OBJ.lon) < 1e-4), 'R-1 did not move onto the exact objective center');
        ok('2 Red counter moves to the blocking ring, not the exact objective center');
    } catch (e) { bad('2 red blocking ring', e); }

    // 4 — objective control = contested when both sides are inside the radii.
    try {
        fresh(true);
        DEMO._commitCoaForTest(0);
        var o = DEMO._whiteScenarioOutcomeForTest();
        assert(o.objective_control === 'contested', 'control = contested (got ' + o.objective_control + ')');
        assert(o.blue_presence >= 1 && o.red_contest >= 1, 'both sides counted inside (blue ' + o.blue_presence + ', red ' + o.red_contest + ')');
        ok('4 objective control = contested when both sides are inside the radii');
    } catch (e) { bad('4 contested', e); }

    // 5 — objective control = blue (secured) when Blue present and Red cannot contest.
    try {
        DEMO._resetScenarioForTest(); DEMO._forgetCoaExecInMemoryForTest();
        setUnits([], [{ id: 'B-1', side: 'BLUE', lat: 24.451, lon: 54.401, coord: [54.401, 24.451] }]);   // Blue inside, no Red
        var o5 = DEMO._whiteScenarioOutcomeForTest();
        assert(o5.objective_control === 'blue', 'control = blue (got ' + o5.objective_control + ')');
        assert(o5.blue_success === true, 'blue_success true when Blue controls uncontested');
        contestedUnits();
        ok('5 objective control = blue (secured) when Blue present and Red cannot contest');
    } catch (e) { bad('5 blue control', e); }

    // 6 + 7 — Auto continues with no /plan-coas; every tick llm_called_this_tick=false.
    try {
        fresh(true);
        DEMO._commitCoaForTest(0);
        FETCHED.length = 0;
        DEMO._runScenarioForTest();
        var timings = [];
        for (var n = 0; n < 14; n++) { DEMO._scenarioTickForTest(); var e2 = DEMO._getCoaExecForTest(); if (e2 && e2.last_tick_timing) timings.push(e2.last_tick_timing.llm_called_this_tick); }
        assert(!FETCHED.some(function (u) { return /\/plan-coas/.test(u); }), 'no /plan-coas during auto turns');
        assert(timings.length && timings.every(function (v) { return v === false; }), 'every tick llm_called_this_tick=false');
        assert(DEMO._getScenarioForTest().scenario_turn > 2, 'auto advanced past turn 2');
        ok('6+7 Auto continues with no /plan-coas; ticks keep llm_called_this_tick=false');
    } catch (e) { bad('6+7 auto no-LLM', e); }

    // 8 — decision log records formation_assignment + objective_control_check (called_llm=false).
    try {
        fresh(true);
        DEMO._clearDecisionLogForTest();
        DEMO._commitCoaForTest(0);
        DEMO._runScenarioForTest();
        for (var k = 0; k < 8; k++) { DEMO._scenarioTickForTest(); await flush(); }
        var log = DEMO._getDecisionLogForTest();
        function has(role, action) { return log.some(function (d) { return d.role === role && d.action === action && d.called_llm === false; }); }
        assert(has('performance', 'formation_assignment'), 'formation_assignment recorded (no-LLM)');
        assert(has('white', 'objective_control_check'), 'objective_control_check recorded (no-LLM)');
        assert(has('red', 'red_maneuver_order'), 'red_maneuver_order recorded (no-LLM)');
        ok('8 decision log records formation_assignment + objective_control_check (called_llm=false)');
    } catch (e) { bad('8 decision log', e); }

    // 11 — objective control state surfaces on the scenario state.
    try {
        fresh(true);
        DEMO._commitCoaForTest(0);
        DEMO._runScenarioForTest();
        // NOTE (RMOOZ-COA-QUALITY-HARD-ENFORCEMENT-AE): bluePlan() is an all-to-objective-center COA, so
        // commit now replaces it with the role-separated commander template (which takes a few ticks to run
        // before the first auto-director turn). Drive until the auto-director has issued an order.
        for (var z = 0; z < 20 && !DEMO._getScenarioForTest().last_formation_order; z++) DEMO._scenarioTickForTest();
        var sc = DEMO._getScenarioForTest();
        assert(['blue', 'red', 'contested', 'uncontrolled'].indexOf(sc.objective_control) !== -1, 'scenario.objective_control set (' + sc.objective_control + ')');
        assert(typeof sc.blue_presence === 'number' && typeof sc.red_contest === 'number', 'presence/contest counts on state');
        assert(sc.last_formation_order && /Blue/.test(sc.last_formation_order), 'last_formation_order set (' + sc.last_formation_order + ')');
        ok('11 objective control + formation state surfaces on the scenario state');
    } catch (e) { bad('11 state surface', e); }

    console.log('\n' + (fail === 0 ? '✅ ' : '❌ ') + pass + ' passed, ' + fail + ' failed (test-free-fight-formation-realism-ac.js)');
    process.exit(fail === 0 ? 0 : 1);
})();
