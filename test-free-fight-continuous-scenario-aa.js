/**
 * test-free-fight-continuous-scenario-aa.js — RMOOZ-FREE-FIGHT-CONTINUOUS-SCENARIO-AA
 *
 * Continuous scenario mode on TOP of committed-COA execution. Run Plan = execute the committed COA once
 * (existing, can end "Plan complete"). Run Scenario = keep the fight alive — deterministic White
 * adjudication + simple deterministic Red reaction + Green updates + turn/end-condition bookkeeping —
 * reusing the EXISTING deterministic tick (no LLM, no /plan-coas). LLM only on explicit Replan. Engine frozen.
 *
 * Acceptance (the 13 specified tests):
 *   1  Run Plan still executes once and can show "Plan complete"
 *   2  Run Scenario does not stop at first COA completion when no end condition is met
 *   3  scenario turn increments after a phase cycle
 *   4  White outcome check runs after plan completion with called_llm=false
 *   5  Green refresh runs after the phase/turn transition without /plan-coas
 *   6  Red reaction decision is recorded with called_llm=false
 *   7  scenario pauses with "needs new orders" (not a misleading "Plan complete")
 *   8  Run Scenario does not call /plan-coas during normal ticks
 *   9  normal scenario ticks keep llm_called_this_tick=false
 *  10  V2 cockpit clearly separates Run Plan vs Run Scenario
 *  11  end conditions fire (objective secured / red unable / max turns)
 */
'use strict';
var assert = require('assert');
var path = require('path');

var elById = {};
function makeEl(t) {
    var el = { tagName: t, id: '', innerHTML: '', textContent: '', children: [], attrs: {}, style: {},
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
    fetch: function (u) { FETCHED.push(String(u)); return Promise.resolve({ ok: true, json: function () { return Promise.resolve(GREEN); } }); },
};
global.window.window = global.window;
var GREEN = { ok: true, collateral_risk: { band: 'high', score: 80 }, road_status: { status: 'constrained' }, neutral_reaction_score: 80, provenance: { engine: 'deterministic' }, deterministic: true };

function setUnits(red, blue) { global.window.RmoozScenario = { scenario: { red_units: red, blue_units_initial: blue, obj: { name: 'Objective X', coord: [54.40, 24.45] } } }; }
// Blue + Red BOTH near the objective → contested → scenario continues (no end on turn 1)
setUnits(
    [{ id: 'R-1', side: 'RED', lat: 24.451, lon: 54.401, coord: [54.401, 24.451] }],
    [{ id: 'B-1', side: 'BLUE', lat: 24.452, lon: 54.402, coord: [54.402, 24.452] }]
);

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

DEMO.mount({ brief: { operational_brief: { proposed_units: [{ id: 'B-1', side: 'BLUE', lat: 24.452, lon: 54.402 }], objectives: [{ label: 'Objective X', lat: 24.45, lon: 54.40 }] } } });
DEMO._setRouteHealthForTest({ ok: true, allow_sim_run: true, ai_execution_enabled: true, model_available: true, provider: 'ollama', model: 'qwen3-coder:latest' });
try { if (DEMO.setObjective) DEMO.setObjective({ lat: 24.45, lon: 54.40 }); } catch (_) {}

function bluePlan() {
    return { ok: true, plan_source: 'llm', recommended_plan_id: 'COA-1', validation: { ok: true },
        coas: [{ plan_id: 'COA-1', recommended: true, title: 'Seize', side: 'BLUE', risk: 'medium', confidence: 'high',
            phases: [{ name: 'Hold objective', actions: [{ unit_uid: 'B-1', action_type: 'HOLD_POSITION', role: 'assault' }] }] }] };
}
function fresh(plan) { DEMO._resetScenarioForTest(); DEMO._forgetCoaExecInMemoryForTest(); DEMO._setCoaPlanForTest(plan || null); DEMO._setCoaSelectedIdxForTest(0); DEMO._setFfLegacyOpenForTest(false); }
function driveToTransition() { for (var i = 0; i < 6; i++) { DEMO._scenarioTickForTest(); } }

(async function main() {

    // 1 — Run Plan executes once and can show "Plan complete" (no scenario).
    try {
        fresh(bluePlan());
        DEMO._commitCoaForTest(0);
        DEMO._runCommittedCoaForTest();
        assert(DEMO._getCoaExecForTest().phase_status === 'complete', 'COA completes on Run Plan');
        assert(DEMO._getScenarioForTest() === null, 'no scenario started by Run Plan');
        assert(/Plan complete/.test(DEMO._renderFreeFightControlV2HtmlForTest()), 'shows "Plan complete"');
        ok('1 Run Plan executes once and shows "Plan complete"');
    } catch (e) { bad('1 run plan once', e); }

    // 2 — Run Scenario does not stop at first COA completion when no end condition met (contested).
    try {
        fresh(bluePlan());
        DEMO._commitCoaForTest(0);
        DEMO._runScenarioForTest();
        driveToTransition();
        var sc = DEMO._getScenarioForTest();
        assert(sc && sc.scenario_active, 'scenario active');
        assert(sc.scenario_status !== 'complete', 'scenario did NOT complete at first COA completion (status=' + sc.scenario_status + ')');
        assert(sc.scenario_status === 'paused', 'scenario paused for next orders (contested)');
        ok('2 Run Scenario continues past first COA completion (paused for orders, not complete)');
    } catch (e) { bad('2 continue past completion', e); }

    // 3 — scenario turn increments after a phase cycle.
    try {
        fresh(bluePlan());
        DEMO._commitCoaForTest(0);
        DEMO._runScenarioForTest();
        var before = DEMO._getScenarioForTest().scenario_turn;
        driveToTransition();
        var after = DEMO._getScenarioForTest().scenario_turn;
        assert(after === before + 1, 'turn incremented ' + before + ' -> ' + after);
        ok('3 scenario turn increments after a phase cycle (' + before + ' -> ' + after + ')');
    } catch (e) { bad('3 turn increment', e); }

    // 4 — White outcome check runs after plan completion with called_llm=false.
    try {
        fresh(bluePlan());
        DEMO._clearDecisionLogForTest();
        DEMO._commitCoaForTest(0);
        DEMO._runScenarioForTest();
        driveToTransition();
        var white = DEMO._getDecisionLogForTest().filter(function (d) { return d.role === 'white' && d.action === 'scenario_outcome_check'; });
        assert(white.length >= 1, 'White scenario_outcome_check recorded');
        assert(white.every(function (d) { return d.called_llm === false; }), 'White outcome check called_llm=false');
        ok('4 White scenario_outcome_check runs with called_llm=false');
    } catch (e) { bad('4 white outcome', e); }

    // 5 — Green refresh runs after the transition without /plan-coas (flush so _greenBusy clears first).
    try {
        fresh(bluePlan());
        DEMO._commitCoaForTest(0);
        await flush();   // let the after_commit Green refresh settle (_greenBusy=false)
        DEMO._runScenarioForTest();   // tick 1 completes the COA → fires a phase_advance Green refresh
        await flush();   // let the phase_advance Green refresh settle too, so the transition's refresh is not coalesced
        FETCHED.length = 0;
        DEMO._scenarioTickForTest();   // this tick runs the White→Green→Red transition
        assert(FETCHED.some(function (u) { return /neutral-world/.test(u); }), 'Green /neutral-world refreshed on transition');
        assert(!FETCHED.some(function (u) { return /\/plan-coas/.test(u); }), 'no /plan-coas during transition: ' + JSON.stringify(FETCHED));
        ok('5 Green refresh on transition, no /plan-coas');
    } catch (e) { bad('5 green refresh', e); }

    // 6 — Red reaction recorded with called_llm=false.
    try {
        fresh(bluePlan());
        DEMO._clearDecisionLogForTest();
        DEMO._commitCoaForTest(0);
        DEMO._runScenarioForTest();
        driveToTransition();
        var red = DEMO._getDecisionLogForTest().filter(function (d) { return d.role === 'red' && d.action === 'red_reaction'; });
        assert(red.length >= 1, 'Red reaction recorded');
        assert(red.every(function (d) { return d.called_llm === false; }), 'Red reaction called_llm=false');
        ok('6 Red reaction recorded with called_llm=false');
    } catch (e) { bad('6 red reaction', e); }

    // 7 — scenario pauses with "needs new orders" (not a misleading "Plan complete").
    try {
        fresh(bluePlan());
        DEMO._commitCoaForTest(0);
        DEMO._runScenarioForTest();
        driveToTransition();
        var sc7 = DEMO._getScenarioForTest();
        assert(sc7.scenario_status === 'paused' && sc7.pending_replan_reason, 'paused with a pending replan reason');
        var html = DEMO._renderScenarioCockpitV2ForTest();
        assert(/needs new Blue orders/i.test(html), 'cockpit shows "needs new Blue orders"');
        assert(!/Plan complete — all phases executed/.test(html), 'does NOT show the misleading "Plan complete" line');
        ok('7 scenario pauses with "needs new orders", not a misleading Plan complete');
    } catch (e) { bad('7 needs new orders', e); }

    // 8 + 9 — no /plan-coas during normal ticks; normal ticks keep llm_called_this_tick=false.
    try {
        fresh(bluePlan());
        DEMO._commitCoaForTest(0);
        FETCHED.length = 0;
        DEMO._runScenarioForTest();
        var timings = [];
        var ex = DEMO._getCoaExecForTest(); if (ex && ex.last_tick_timing) timings.push(ex.last_tick_timing.llm_called_this_tick);
        for (var q = 0; q < 4; q++) { DEMO._scenarioTickForTest(); var e2 = DEMO._getCoaExecForTest(); if (e2 && e2.last_tick_timing) timings.push(e2.last_tick_timing.llm_called_this_tick); }
        assert(!FETCHED.some(function (u) { return /\/plan-coas/.test(u); }), 'no /plan-coas on any normal scenario tick');
        assert(timings.length >= 1 && timings.every(function (v) { return v === false; }), 'every tick llm_called_this_tick=false: ' + JSON.stringify(timings));
        ok('8+9 no /plan-coas on normal ticks; every tick llm_called_this_tick=false');
    } catch (e) { bad('8+9 no-LLM ticks', e); }

    // 10 — V2 cockpit clearly separates Run Plan vs Run Scenario.
    try {
        fresh(bluePlan());
        DEMO._commitCoaForTest(0);
        var committedHtml = DEMO._renderFreeFightControlV2HtmlForTest();
        assert(/data-act="v2-run"/.test(committedHtml), 'Run Plan button present');
        assert(/data-act="v2-run-scenario"/.test(committedHtml), 'Run Scenario button present');
        assert(/Run Plan/.test(committedHtml) && /Run Scenario/.test(committedHtml), 'both labels present');
        ok('10 cockpit separates Run Plan vs Run Scenario (two distinct buttons)');
    } catch (e) { bad('10 two buttons', e); }

    // 11 — end condition fires: remove Red → red_unable_to_contest (or objective_secured) → complete.
    try {
        fresh(bluePlan());
        DEMO._commitCoaForTest(0);
        DEMO._runScenarioForTest();
        setUnits([], [{ id: 'B-1', side: 'BLUE', lat: 24.452, lon: 54.402, coord: [54.402, 24.452] }]);
        driveToTransition();
        var sc11 = DEMO._getScenarioForTest();
        assert(sc11.scenario_status === 'complete', 'scenario completed at an end condition (status=' + sc11.scenario_status + ')');
        assert(/red_unable_to_contest|objective_secured/.test(sc11.end_condition), 'end_condition set: ' + sc11.end_condition);
        setUnits([{ id: 'R-1', side: 'RED', lat: 24.451, lon: 54.401, coord: [54.401, 24.451] }], [{ id: 'B-1', side: 'BLUE', lat: 24.452, lon: 54.402, coord: [54.402, 24.452] }]);
        ok('11 end condition fires (' + sc11.end_condition + ') → scenario complete');
    } catch (e) { bad('11 end condition', e); }

    console.log('\n' + (fail === 0 ? '✅ ' : '❌ ') + pass + ' passed, ' + fail + ' failed (test-free-fight-continuous-scenario-aa.js)');
    process.exit(fail === 0 ? 0 : 1);
})();
