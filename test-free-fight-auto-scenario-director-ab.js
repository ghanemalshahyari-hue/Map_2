/**
 * test-free-fight-auto-scenario-director-ab.js — RMOOZ-FREE-FIGHT-AUTO-SCENARIO-DIRECTOR-AB
 *
 * Auto Scenario Director on top of AA. Manual Scenario keeps AA behavior (pauses for new Blue orders).
 * Auto Scenario: when Blue needs new orders, a deterministic Staff-Safe next order is generated
 * (source "staff_safe_auto_director") and Red performs a real deterministic maneuver (moves units via
 * the SAME teleport-guarded movement path), so the fight keeps going until an end condition / serious
 * blocked state / operator stop. NO LLM on normal ticks; NO /plan-coas during auto turns.
 *
 * Acceptance (the 11 specified tests):
 *   1  Manual Scenario keeps AA behavior and pauses for new orders
 *   2  Auto Scenario generates a deterministic Blue next order (source staff_safe_auto_director)
 *   3  Auto Scenario continues beyond Turn 2 without AI
 *   4  Red maneuver moves a Red unit (real position change), not just a log line
 *   5  No /plan-coas during auto scenario turns
 *   6  No LLM during auto scenario turns (tick llm_called=false; no scenario decision called_llm=true)
 *   7  Decision log records Auto Director, Red maneuver, White outcome, Green refresh
 *   8  Green refresh uses /neutral-world only
 *   9  White remains deterministic (pure outcome object, no fetch)
 *  10  Run Plan behavior unchanged
 *  11  end condition still fires (max auto turns / red unable)
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
    // _fetchJsonSafe reads r.text() then JSON.parse — the stub must provide text().
    fetch: function (u) { FETCHED.push(String(u)); return Promise.resolve({ ok: true, status: 200, statusText: 'OK', text: function () { return Promise.resolve(JSON.stringify(GREEN)); }, json: function () { return Promise.resolve(GREEN); } }); },
};
global.window.window = global.window;
var GREEN = { ok: true, collateral_risk: { band: 'high', score: 80 }, road_status: { status: 'constrained' }, neutral_reaction_score: 80, provenance: { engine: 'deterministic' }, deterministic: true };

// contested + reached: B-1 AT the objective (reached); R-1 ~0.06° away (contested, > 0.05 step cap → a
// counter produces a VISIBLE move). Objective at (24.45, 54.40).
function setUnits(red, blue) { global.window.RmoozScenario = { scenario: { red_units: red, blue_units_initial: blue, obj: { name: 'Objective X', coord: [54.40, 24.45] } } }; }
function freshUnits() {
    setUnits(
        [{ id: 'R-1', side: 'RED', lat: 24.45, lon: 54.46, coord: [54.46, 24.45] }],
        [{ id: 'B-1', side: 'BLUE', lat: 24.452, lon: 54.402, coord: [54.402, 24.452] }]
    );
}
freshUnits();

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
if (DEMO.setObjective) DEMO.setObjective({ lat: 24.45, lon: 54.40 });

function bluePlan() {
    return { ok: true, plan_source: 'llm', recommended_plan_id: 'COA-1', validation: { ok: true },
        coas: [{ plan_id: 'COA-1', recommended: true, title: 'Seize', side: 'BLUE', risk: 'medium', confidence: 'high',
            phases: [{ name: 'Hold objective', actions: [{ unit_uid: 'B-1', action_type: 'HOLD_POSITION', role: 'assault' }] }] }] };
}
function fresh(auto) {
    DEMO._resetScenarioForTest(); DEMO._forgetCoaExecInMemoryForTest();
    DEMO._setScenarioAutoContinueForTest(!!auto);
    DEMO._setCoaPlanForTest(bluePlan()); DEMO._setCoaSelectedIdxForTest(0); DEMO._setFfLegacyOpenForTest(false);
    freshUnits();
}

(async function main() {

    // 1 — Manual Scenario keeps AA behavior (pauses for new orders).
    try {
        fresh(false);
        DEMO._commitCoaForTest(0);
        DEMO._runScenarioForTest();
        for (var i = 0; i < 5; i++) DEMO._scenarioTickForTest();
        var sc = DEMO._getScenarioForTest();
        assert(sc.auto_continue === false, 'manual mode');
        assert(sc.scenario_status === 'paused', 'manual pauses (status=' + sc.scenario_status + ')');
        assert(sc.pending_replan_reason, 'manual shows a pending reason (needs new orders)');
        ok('1 Manual Scenario pauses for new orders (AA behavior preserved)');
    } catch (e) { bad('1 manual pauses', e); }

    // 2 — Auto Scenario generates a deterministic Blue next order.
    try {
        fresh(true);
        DEMO._commitCoaForTest(0);
        DEMO._runScenarioForTest();
        for (var j = 0; j < 4; j++) DEMO._scenarioTickForTest();
        var sc2 = DEMO._getScenarioForTest();
        assert(sc2.last_auto_order_source === 'staff_safe_auto_director', 'auto order source labelled (' + sc2.last_auto_order_source + ')');
        var ex = DEMO._getCoaExecForTest();
        assert(ex && /^AUTO-/.test(ex.selected_coa_id), 'committed exec is an AUTO-* order (' + (ex && ex.selected_coa_id) + ')');
        assert(sc2.scenario_status !== 'paused', 'auto did NOT pause for orders (status=' + sc2.scenario_status + ')');
        ok('2 Auto Scenario generates a deterministic staff_safe_auto_director Blue order');
    } catch (e) { bad('2 auto blue order', e); }

    // 3 — Auto Scenario continues beyond Turn 2 without AI.
    try {
        fresh(true);
        DEMO._commitCoaForTest(0);
        DEMO._runScenarioForTest();
        FETCHED.length = 0;
        for (var k = 0; k < 20; k++) DEMO._scenarioTickForTest();
        var sc3 = DEMO._getScenarioForTest();
        assert(sc3.scenario_turn > 2, 'turn advanced beyond 2 (turn=' + sc3.scenario_turn + ')');
        assert(!FETCHED.some(function (u) { return /\/plan-coas/.test(u); }), 'no /plan-coas while auto-continuing');
        ok('3 Auto Scenario continues beyond Turn 2 (turn=' + sc3.scenario_turn + ') with no AI');
    } catch (e) { bad('3 auto continues', e); }

    // 4 — Red maneuver moves a Red unit (real position change).
    try {
        fresh(true);
        DEMO._commitCoaForTest(0);
        var before = global.window.RmoozScenario.scenario.red_units[0];
        var beforeLon = before.lon;
        var man = DEMO._redManeuverOrderForTest();   // contested+reached → counter → moves R-1 toward obj
        var afterLon = global.window.RmoozScenario.scenario.red_units[0].lon;
        assert(man.posture === 'counter', 'Red posture = counter (got ' + man.posture + ')');
        assert(man.moved >= 1, 'Red maneuver moved >=1 unit (moved=' + man.moved + ')');
        assert(Math.abs(afterLon - beforeLon) > 0.003, 'R-1 lon actually changed ' + beforeLon + ' -> ' + afterLon);
        ok('4 Red maneuver MOVES a Red unit (counter): lon ' + beforeLon + ' -> ' + afterLon);
    } catch (e) { bad('4 red maneuver moves', e); }

    // 5 — No /plan-coas during auto scenario turns.
    try {
        fresh(true);
        DEMO._commitCoaForTest(0);
        FETCHED.length = 0;
        DEMO._runScenarioForTest();
        for (var m = 0; m < 12; m++) DEMO._scenarioTickForTest();
        assert(!FETCHED.some(function (u) { return /\/plan-coas/.test(u); }), 'no /plan-coas across auto turns: ' + JSON.stringify(FETCHED.slice(0, 5)));
        ok('5 No /plan-coas during auto scenario turns');
    } catch (e) { bad('5 no plan-coas', e); }

    // 6 — No LLM during auto scenario turns.
    try {
        fresh(true);
        DEMO._clearDecisionLogForTest();
        DEMO._commitCoaForTest(0);
        DEMO._runScenarioForTest();
        var timings = [];
        for (var n = 0; n < 12; n++) { DEMO._scenarioTickForTest(); var e2 = DEMO._getCoaExecForTest(); if (e2 && e2.last_tick_timing) timings.push(e2.last_tick_timing.llm_called_this_tick); }
        assert(timings.length && timings.every(function (v) { return v === false; }), 'every tick llm_called_this_tick=false');
        var scenDecisions = DEMO._getDecisionLogForTest().filter(function (d) { return d.source === 'scenario' || d.source === 'staff_safe_auto_director'; });
        assert(scenDecisions.length && scenDecisions.every(function (d) { return d.called_llm === false; }), 'no scenario/auto decision called the LLM');
        ok('6 No LLM during auto turns (ticks + decisions all called_llm=false)');
    } catch (e) { bad('6 no LLM', e); }

    // 7 — Decision log records Auto Director, Red maneuver, White outcome, Green refresh.
    try {
        fresh(true);
        DEMO._clearDecisionLogForTest();
        DEMO._commitCoaForTest(0);
        await flush();
        DEMO._runScenarioForTest();
        for (var p = 0; p < 8; p++) { DEMO._scenarioTickForTest(); await flush(); }   // flush so async Green decisions record
        var log = DEMO._getDecisionLogForTest();
        function has(role, action) { return log.some(function (d) { return d.role === role && d.action === action && d.called_llm === false; }); }
        assert(has('performance', 'auto_director_next_blue_order'), 'Auto Director recorded');
        assert(has('red', 'red_maneuver_order'), 'Red maneuver recorded');
        assert(has('white', 'scenario_outcome_check'), 'White outcome recorded');
        assert(has('green', 'neutral_world_refresh'), 'Green refresh recorded');
        ok('7 Decision log records Auto Director + Red maneuver + White outcome + Green refresh (all no-LLM)');
    } catch (e) { bad('7 decision log', e); }

    // 8 — Green refresh uses /neutral-world only.
    try {
        fresh(true);
        DEMO._commitCoaForTest(0);
        await flush();
        DEMO._runScenarioForTest();
        FETCHED.length = 0;
        for (var q = 0; q < 6; q++) { DEMO._scenarioTickForTest(); await flush(); }
        assert(FETCHED.some(function (u) { return /neutral-world/.test(u); }), 'Green hit /neutral-world');
        assert(FETCHED.every(function (u) { return /neutral-world/.test(u); }), 'ONLY /neutral-world was fetched: ' + JSON.stringify(FETCHED.slice(0, 5)));
        ok('8 Green refresh uses /neutral-world only');
    } catch (e) { bad('8 green neutral-world', e); }

    // 9 — White remains deterministic (pure outcome, no fetch).
    try {
        fresh(true);
        DEMO._commitCoaForTest(0);
        FETCHED.length = 0;
        var outcome = DEMO._whiteScenarioOutcomeForTest();
        assert(typeof outcome.objective_reached === 'boolean' && typeof outcome.objective_contested === 'boolean', 'outcome has deterministic boolean fields');
        assert(typeof outcome.should_continue === 'boolean', 'should_continue computed');
        assert(FETCHED.length === 0, 'White made no network call');
        ok('9 White outcome is deterministic (booleans, no fetch)');
    } catch (e) { bad('9 white deterministic', e); }

    // 10 — Run Plan behavior unchanged.
    try {
        fresh(false);
        DEMO._commitCoaForTest(0);
        DEMO._runCommittedCoaForTest();
        assert(DEMO._getCoaExecForTest().phase_status === 'complete', 'Run Plan completes the COA once');
        assert(DEMO._getScenarioForTest() === null, 'Run Plan starts no scenario');
        assert(/Plan complete/.test(DEMO._renderFreeFightControlV2HtmlForTest()), 'shows "Plan complete"');
        ok('10 Run Plan behavior unchanged');
    } catch (e) { bad('10 run plan unchanged', e); }

    // 11 — end condition fires (auto turn cap or red unable).
    try {
        fresh(true);
        DEMO._commitCoaForTest(0);
        DEMO._runScenarioForTest();
        for (var z = 0; z < 60; z++) { DEMO._scenarioTickForTest(); if (DEMO._getScenarioForTest().scenario_status === 'complete') break; }
        var sc11 = DEMO._getScenarioForTest();
        assert(sc11.scenario_status === 'complete', 'auto scenario reached an end condition (status=' + sc11.scenario_status + ')');
        assert(/max_auto_turns_reached|objective_secured|red_unable_to_contest|max_turns_reached/.test(sc11.end_condition), 'end_condition set: ' + sc11.end_condition);
        ok('11 Auto Scenario stops at an end condition (' + sc11.end_condition + ')');
    } catch (e) { bad('11 end condition', e); }

    console.log('\n' + (fail === 0 ? '✅ ' : '❌ ') + pass + ' passed, ' + fail + ' failed (test-free-fight-auto-scenario-director-ab.js)');
    process.exit(fail === 0 ? 0 : 1);
})();
