/**
 * test-free-fight-coa-to-scenario-bugfix-ab1.js — RMOOZ-FREE-FIGHT-V2-COA-TO-SCENARIO-BUGFIX-AB1
 *
 * Flow/state bugfix: a stale committed _coaExec (restored from sessionStorage, or left over from a
 * prior commit) must NOT shadow a freshly-generated plan. A new plan object — or a selection moved off
 * the committed COA — supersedes the stale commit: the cockpit returns to 'ready' so the operator
 * (re)commits the CURRENT plan, and Run / Run Scenario never fire on an out-of-date committed COA.
 *
 * Acceptance (the spec's 11 tests):
 *   1  ready state does NOT show Run Scenario until commit
 *   2  clicking COA-2 updates selected index + selected summary
 *   3  Commit commits COA-2 when COA-2 is selected
 *   4  after commit, Run Scenario is visible and runs the committed COA
 *   5  a STALE restored commit + a fresh plan → 'ready' (recommit required), NOT the old committed view
 *   6  selection moved off the committed COA → 'ready' + "commit before running" banner
 *   7  Clear removes committed COA + scenario runtime + committed-plan identity
 *   8  Run Scenario does not call /plan-coas
 *   9  normal scenario tick keeps llm_called_this_tick=false
 *  10  flow-status line reflects selected-not-committed / committed-ready
 *  11  clean flow unaffected: select → commit → Run Scenario runs the right COA
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
var SS = {};
global.document = { body: bodyEl, head: makeEl('head'), createElement: makeEl, getElementById: function (id) { return elById[id] || null; }, querySelector: function () { return null; } };
var GREEN = { ok: true, collateral_risk: { band: 'low', score: 10 }, provenance: { engine: 'deterministic' }, deterministic: true };
global.window = {
    document: global.document, AppShellEventLog: { append: function () {} },
    sessionStorage: { getItem: function (k) { return SS[k] || null; }, setItem: function (k, v) { SS[k] = String(v); }, removeItem: function (k) { delete SS[k]; } },
    setTimeout: function () { return 0; }, clearTimeout: function () {}, setInterval: function () { return 0; }, clearInterval: function () {},
    fetch: function (u) { FETCHED.push(String(u)); return Promise.resolve({ ok: true, status: 200, text: function () { return Promise.resolve(JSON.stringify(GREEN)); }, json: function () { return Promise.resolve(GREEN); } }); },
};
global.window.window = global.window;
global.window.RmoozScenario = { scenario: { id: 'ab1', red_units: [{ id: 'R-1', side: 'RED', lat: 24.45, lon: 54.40, coord: [54.40, 24.45] }], blue_units_initial: [{ id: 'B-1', side: 'BLUE', lat: 24.45, lon: 54.40, coord: [54.40, 24.45] }], obj: { name: 'Objective X', coord: [54.40, 24.45] } } };

var C = path.join(__dirname, 'UI_MOdified', 'client', 'shell');
require(path.join(C, 'world-state-db.js'));
require(path.join(C, 'symbol-db.js'));
require(path.join(C, 'symbol-registry.js'));
require(path.join(C, 'free-fight-demo.js'));
var DEMO = global.window.RmoozFreeFightDemo;

var pass = 0, fail = 0;
function ok(n) { pass++; console.log('  ✓ ' + n); }
function bad(n, e) { fail++; console.log('  ✗ ' + n + (e ? (' — ' + (e && e.message || e)) : '')); }

DEMO.mount({ brief: { operational_brief: { proposed_units: [{ id: 'R-1', side: 'RED', lat: 24.45, lon: 54.40 }], objectives: [{ label: 'Objective X', lat: 24.45, lon: 54.40 }] } } });
DEMO._setRouteHealthForTest({ ok: true, allow_sim_run: true, ai_execution_enabled: true, model_available: true, provider: 'ollama', model: 'qwen3-coder:latest' });

function mkPlan(tag) {
    return { ok: true, plan_source: 'llm', recommended_plan_id: 'COA-1', validation: { ok: true },
        coas: [{ plan_id: 'COA-1', recommended: true, title: tag + ' Flank', side: 'RED', phases: [{ name: 'P', actions: [{ unit_uid: 'R-1', action_type: 'MOVE', target: { lat: 24.45, lon: 54.42 } }] }] },
                { plan_id: 'COA-2', title: tag + ' Feint', side: 'RED', phases: [{ name: 'P', actions: [{ unit_uid: 'R-1', action_type: 'HOLD_POSITION' }] }] }] };
}
function freshClean(plan) { DEMO._resetScenarioForTest(); DEMO._forgetCoaExecInMemoryForTest(); DEMO._resetCoaExecForTest(); DEMO._setCoaPlanForTest(plan || mkPlan('A')); DEMO._setCoaSelectedIdxForTest(0); DEMO._setFfLegacyOpenForTest(false); }

// 1 — ready does NOT show Run Scenario until commit.
try {
    freshClean(mkPlan('A'));
    assert(DEMO._freeFightControlStateV2ForTest() === 'ready', 'state ready');
    var html = DEMO._renderFreeFightControlV2HtmlForTest();
    assert(/data-act="v2-commit"/.test(html), 'Commit Selected Plan present in ready');
    assert(!/data-act="v2-run-scenario"/.test(html) && !/data-act="v2-run"/.test(html), 'Run / Run Scenario NOT present until commit');
    ok('1 ready shows Commit, not Run / Run Scenario');
} catch (e) { bad('1 ready no run-scenario', e); }

// 2 — clicking COA-2 updates selected index + summary.
try {
    freshClean(mkPlan('A'));
    assert(DEMO._getCoaSelectedIdxForTest() === 0, 'starts on idx 0');
    DEMO._v2SelectCoaForTest(1);
    assert(DEMO._getCoaSelectedIdxForTest() === 1, 'selected idx → 1');
    var h = DEMO._renderFreeFightControlV2HtmlForTest();
    assert(/Commit Selected Plan \(COA-2\)/.test(h), 'commit label shows COA-2');
    assert(/Selected COA:<\/span> <b[^>]*>COA-2/.test(h), 'selected summary shows COA-2');
    ok('2 clicking COA-2 updates selected index + summary');
} catch (e) { bad('2 select coa-2', e); }

// 3 — Commit commits COA-2 when COA-2 is selected.
try {
    freshClean(mkPlan('A'));
    DEMO._v2SelectCoaForTest(1);
    var ex = DEMO._commitCoaForTest();   // no arg → commits _coaSelectedIdx
    assert(ex && ex.selected_coa_id === 'COA-2', 'committed COA-2 (got ' + (ex && ex.selected_coa_id) + ')');
    ok('3 Commit commits the SELECTED COA-2');
} catch (e) { bad('3 commit coa-2', e); }

// 4 — after commit, Run Scenario is visible and runs the committed COA.
try {
    freshClean(mkPlan('A'));
    DEMO._v2SelectCoaForTest(1); DEMO._commitCoaForTest();
    assert(DEMO._freeFightControlStateV2ForTest() === 'committed', 'state committed');
    var ch = DEMO._renderFreeFightControlV2HtmlForTest();
    assert(/data-act="v2-run-scenario"/.test(ch) && /data-act="v2-run"/.test(ch), 'Run + Run Scenario visible after commit');
    DEMO._runScenarioForTest();
    assert(DEMO._getScenarioForTest().scenario_active, 'scenario started');
    assert(DEMO._getCoaExecForTest().selected_coa_id === 'COA-2', 'scenario runs the committed COA-2');
    ok('4 after commit, Run Scenario visible and runs committed COA-2');
} catch (e) { bad('4 run scenario after commit', e); }

// 5 — STALE restored commit + a fresh plan → ready (recommit), not the old committed view (THE BUG).
try {
    // commit an OLD plan, persist, simulate refresh, restore (paused), THEN generate a NEW plan.
    DEMO._resetScenarioForTest(); DEMO._resetCoaExecForTest();
    DEMO._setCoaPlanForTest(mkPlan('OLD')); DEMO._setCoaSelectedIdxForTest(0); DEMO._commitCoaForTest(0);
    DEMO._forgetCoaExecInMemoryForTest();      // refresh: in-memory gone
    DEMO._restoreCoaExecForTest();              // mount restores the committed COA (paused)
    assert(DEMO._getCoaExecForTest() && DEMO._getCoaExecForTest().active, 'stale exec restored');
    // operator generates a NEW plan + picks a NEW COA
    DEMO._setCoaPlanForTest(mkPlan('NEW')); DEMO._setCoaSelectedIdxForTest(1);
    assert(DEMO._coaCommitIsStaleForTest() === true, 'commit detected as stale vs the new plan');
    assert(DEMO._freeFightControlStateV2ForTest() === 'ready', 'state ready (NOT paused/committed) — BUG FIXED');
    var sh = DEMO._renderFreeFightControlV2HtmlForTest();
    assert(/data-act="v2-coa-1"/.test(sh) && /data-act="v2-commit"/.test(sh), 'new plan COA cards + Commit shown');
    assert(/data-ff-v2="recommit-needed"/.test(sh), 'shows the commit-before-running banner');
    assert(!/data-act="v2-run-scenario"/.test(sh), 'Run Scenario NOT shown while stale (must recommit)');
    ok('5 stale restored commit + fresh plan → ready + recommit banner (bug fixed)');
} catch (e) { bad('5 stale restored', e); }

// 6 — selection moved off the committed COA → ready + banner.
try {
    freshClean(mkPlan('A'));
    DEMO._setCoaSelectedIdxForTest(0); DEMO._commitCoaForTest(0);   // commit COA-1
    assert(DEMO._freeFightControlStateV2ForTest() === 'committed', 'committed COA-1');
    DEMO._setCoaSelectedIdxForTest(1);   // operator selects COA-2 (off the committed COA-1)
    assert(DEMO._coaCommitIsStaleForTest() === true, 'selection-off-committed detected as stale');
    assert(DEMO._freeFightControlStateV2ForTest() === 'ready', 'state ready until recommit');
    assert(/data-ff-v2="recommit-needed"/.test(DEMO._renderFreeFightControlV2HtmlForTest()), 'recommit banner shown');
    ok('6 selection moved off committed COA → ready + recommit banner');
} catch (e) { bad('6 selection changed', e); }

// 7 — Clear removes committed COA + scenario runtime + committed-plan identity.
try {
    freshClean(mkPlan('A'));
    DEMO._commitCoaForTest(0); DEMO._runScenarioForTest();
    assert(DEMO._getCoaExecForTest() && DEMO._getScenarioForTest(), 'have exec + scenario');
    DEMO._resetScenarioForTest(); DEMO._resetCoaExecForTest();   // = the v2-clear handler
    assert(DEMO._getCoaExecForTest() === null, 'committed exec cleared');
    assert(DEMO._getScenarioForTest() === null, 'scenario runtime cleared');
    assert(DEMO._getCommittedPlanObjMatchesForTest() === false, 'committed-plan identity cleared');
    ok('7 Clear removes committed COA + scenario + committed-plan identity');
} catch (e) { bad('7 clear', e); }

// 8 + 9 — Run Scenario makes no /plan-coas; ticks keep llm_called_this_tick=false.
try {
    freshClean(mkPlan('A'));
    DEMO._commitCoaForTest(0);
    FETCHED.length = 0;
    DEMO._runScenarioForTest();
    var timings = [];
    var e0 = DEMO._getCoaExecForTest(); if (e0 && e0.last_tick_timing) timings.push(e0.last_tick_timing.llm_called_this_tick);
    for (var i = 0; i < 6; i++) { DEMO._scenarioTickForTest(); var e2 = DEMO._getCoaExecForTest(); if (e2 && e2.last_tick_timing) timings.push(e2.last_tick_timing.llm_called_this_tick); }
    assert(!FETCHED.some(function (u) { return /\/plan-coas/.test(u); }), 'no /plan-coas during Run Scenario');
    assert(timings.length && timings.every(function (v) { return v === false; }), 'every tick llm_called_this_tick=false');
    ok('8+9 Run Scenario no /plan-coas; ticks keep llm_called_this_tick=false');
} catch (e) { bad('8+9 no-LLM', e); }

// 10 — flow-status line reflects selected-not-committed / committed-ready.
try {
    freshClean(mkPlan('A'));
    DEMO._setCoaSelectedIdxForTest(1);
    var readyHtml = DEMO._renderFreeFightControlV2HtmlForTest();
    assert(/data-ff-v2-flow="ready"/.test(readyHtml) && /not committed yet/.test(readyHtml), 'ready flow status: not committed yet');
    DEMO._commitCoaForTest();
    var commHtml = DEMO._renderFreeFightControlV2HtmlForTest();
    assert(/data-ff-v2-flow="committed"/.test(commHtml) && /ready to Run Plan or Run Scenario/.test(commHtml), 'committed flow status: ready to run');
    ok('10 flow-status line reflects selected-not-committed → committed-ready');
} catch (e) { bad('10 flow status', e); }

// 11 — clean flow unaffected (regression guard).
try {
    freshClean(mkPlan('A'));
    DEMO._v2SelectCoaForTest(0);
    assert(DEMO._coaCommitIsStaleForTest() === false, 'no stale before commit');
    var ex11 = DEMO._commitCoaForTest();
    assert(DEMO._coaCommitIsStaleForTest() === false, 'not stale right after committing the selected COA');
    assert(DEMO._freeFightControlStateV2ForTest() === 'committed', 'committed');
    DEMO._runScenarioForTest();
    assert(DEMO._getCoaExecForTest().selected_coa_id === ex11.selected_coa_id, 'scenario runs exactly the committed COA');
    ok('11 clean flow unaffected: select → commit → Run Scenario runs the right COA');
} catch (e) { bad('11 clean flow', e); }

console.log('\n' + (fail === 0 ? '✅ ' : '❌ ') + pass + ' passed, ' + fail + ' failed (test-free-fight-coa-to-scenario-bugfix-ab1.js)');
process.exit(fail === 0 ? 0 : 1);
