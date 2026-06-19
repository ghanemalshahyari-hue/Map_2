/**
 * test-free-fight-v2-operator-walkthrough-y.js — RMOOZ-FREE-FIGHT-V2-OPERATOR-WALKTHROUGH-Y
 *
 * Usability follow-up to the V2 cockpit (RMOOZ-FREE-FIGHT-CONTROL-HARD-RESET-X). Adds an operator
 * "What to do now" stepper, per-button microcopy, and a richer selected-COA summary — UI guidance ONLY,
 * no new AI features, no backend engine change. This is the user-flow SMOKE TEST that proves the guidance
 * tracks the real state machine and that the no-AI guarantees still hold.
 *
 * Acceptance:
 *   1  stepper renders 5 steps (Generate → Select COA → Commit → Run → Pause/Resume)
 *   2  stepper current step tracks each state (empty/planning/ready/committed/running/paused/blocked/complete)
 *   3  microcopy carries the exact owner phrases (slow—calls AI / locks the selected COA / fast—no AI / advanced)
 *   4  selected-COA summary shows Selected · Recommended · Operator override · Final score (when ranked)
 *   5  "Select a COA card first." appears when nothing is selected
 *   6  non-recommended selection → "Operator override: you selected COA-X instead of recommended COA-Y."
 *   7  no raw JSON / benchmark / decision log in the operator path (drawer closed)
 *   8  FULL FLOW: empty → ready → select COA → committed → running/blocked
 *   9  COA-card click changes the selected COA; Commit uses the selected COA
 *  10  Run does NOT call /plan-coas; a normal committed tick stays llm_called_this_tick=false
 */
'use strict';
var assert = require('assert');
var path = require('path');

var elById = {};
function makeEl(t) {
    var el = { tagName: t, id: '', className: '', innerHTML: '', textContent: '', children: [], attrs: {}, style: {},
        appendChild: function (e) { this.children.push(e); if (e && e.id) elById[e.id] = e; return e; },
        removeChild: function (e) { var i = this.children.indexOf(e); if (i >= 0) this.children.splice(i, 1); if (e && e.id) delete elById[e.id]; return e; },
        setAttribute: function (k, v) { this.attrs[k] = v; }, removeAttribute: function (k) { delete this.attrs[k]; },
        addEventListener: function () {}, removeEventListener: function () {},
        querySelector: function () { return null; }, querySelectorAll: function () { return []; },
        getAttribute: function (k) { return this.attrs[k]; } };
    Object.defineProperty(el, 'parentNode', { value: null, writable: true });
    return el;
}
var bodyEl = makeEl('body');
var FETCHED = [];
function recordingFetch(url) {
    FETCHED.push(String(url));
    if (/neutral-world/.test(String(url))) return Promise.resolve({ ok: true, json: function () { return Promise.resolve(GREEN); } });
    return Promise.resolve({ ok: true, json: function () { return Promise.resolve({ ok: true }); } });
}
global.document = { body: bodyEl, head: makeEl('head'), createElement: makeEl,
    getElementById: function (id) { return elById[id] || null; }, querySelector: function () { return null; } };
global.window = {
    document: global.document,
    AppShellEventLog: { append: function () {} },
    sessionStorage: (function () { var d = {}; return { getItem: function (k) { return d[k] || null; }, setItem: function (k, v) { d[k] = String(v); }, removeItem: function (k) { delete d[k]; } }; })(),
    setTimeout: function () { return 0; }, clearTimeout: function () {},
    setInterval: function () { return 0; }, clearInterval: function () {},
    fetch: recordingFetch,
};
global.window.window = global.window;

var UI = path.join(__dirname, 'UI_MOdified');
var CLIENT = path.join(UI, 'client', 'shell');
require(path.join(CLIENT, 'world-state-db.js'));
require(path.join(CLIENT, 'symbol-db.js'));
require(path.join(CLIENT, 'symbol-registry.js'));
require(path.join(CLIENT, 'free-fight-demo.js'));
var DEMO = global.window.RmoozFreeFightDemo;

var pass = 0, fail = 0;
function ok(n) { pass++; console.log('  ✓ ' + n); }
function bad(n, e) { fail++; console.log('  ✗ ' + n + (e ? (' — ' + (e && e.message || e)) : '')); }

var GREEN = { ok: true, population_band: 'high', collateral_risk: { band: 'high', score: 83, drivers: ['urban'] },
    road_status: { status: 'constrained', basis: 'choke' }, infra_status: { note: 'urban' }, host_nation: 'Atropia',
    neutral_reaction_score: 85, notes: ['Collateral risk high.'],
    provenance: { engine: 'deterministic', population: 'inferred', collateral: 'inferred', roads: 'inferred' }, deterministic: true, llm_used: false };

global.window.RmoozScenario = { scenario: {
    red_units: [{ id: 'R-1', side: 'RED', lat: 24.5, lon: 54.5, coord: [54.5, 24.5] }],
    blue_units_initial: [{ id: 'B-1', side: 'BLUE', lat: 24.6, lon: 54.6, coord: [54.6, 24.6] }],
    obj: { name: 'Objective X', coord: [54.4, 24.45] },
} };
DEMO.mount({ brief: { operational_brief: { proposed_units: [], objectives: [{ label: 'Objective X', lat: 24.45, lon: 54.4 }] } } });
DEMO._setRouteHealthForTest({ ok: true, allow_sim_run: true, ai_execution_enabled: true, model_available: true, provider: 'ollama', model: 'qwen3-coder:latest' });

function mkPlan() {
    return { ok: true, plan_source: 'llm', recommended_plan_id: 'COA-1', _requestedVia: 'manual_generate',
        llm_called: true, llm_status: 'ok', provider_used: 'ollama', model_used: 'qwen3-coder:latest', ai_depth: 'normal', validation: { ok: true },
        coas: [
            { plan_id: 'COA-1', recommended: true, title: 'Flank', side: 'RED', risk: 'medium', confidence: 'high', _ranking: { final_score: 70 }, phases: [{ name: 'P1', actions: [{ unit_uid: 'R-1', action_type: 'MOVE', target: { lat: 24.45, lon: 54.42 } }] }] },
            { plan_id: 'COA-2', title: 'Feint', side: 'RED', risk: 'low', confidence: 'medium', _ranking: { final_score: 62 }, phases: [{ name: 'P1', actions: [{ unit_uid: 'R-1', action_type: 'HOLD_POSITION' }] }] },
        ] };
}
function freshNoExec(plan) { DEMO._forgetCoaExecInMemoryForTest(); DEMO._setCoaPlanForTest(plan || null); DEMO._setCoaSelectedIdxForTest(0); DEMO._setFfLegacyOpenForTest(false); }
function v2() { return DEMO._renderFreeFightControlV2HtmlForTest(); }

// 1 — stepper renders the 5 named steps.
try {
    freshNoExec(null);
    var st = DEMO._v2StepperHtmlForTest('empty');
    ['Generate', 'Select COA', 'Commit', 'Run', 'Pause/Resume'].forEach(function (lbl) { assert(st.indexOf(lbl) !== -1, 'step "' + lbl + '" present'); });
    assert(/data-ff-v2="stepper"/.test(st) && /WHAT TO DO NOW/.test(st), 'stepper container + heading');
    for (var n = 1; n <= 5; n++) assert(new RegExp('data-ff-v2-step="' + n + '"').test(st), 'step ' + n + ' rendered');
    ok('1 stepper renders 5 steps (Generate → Select COA → Commit → Run → Pause/Resume)');
} catch (e) { bad('1 stepper steps', e); }

// 2 — stepper current step tracks each state.
try {
    var expect = { empty: [1], planning: [1], ready: [2, 3], committed: [4], running: [4], paused: [5], blocked: [4], complete: [5] };
    Object.keys(expect).forEach(function (state) {
        expect[state].forEach(function (n) {
            var s = DEMO._v2StepStatusForTest(state, n);
            assert(s === 'current' || s === 'blocked', state + ' step ' + n + ' should be current/blocked (got ' + s + ')');
        });
    });
    // blocked highlights step 4 specifically as 'blocked'
    assert(DEMO._v2StepStatusForTest('blocked', 4) === 'blocked', 'blocked → step 4 status=blocked');
    // done/todo ordering sanity: committed → step 1 done, step 5 todo
    assert(DEMO._v2StepStatusForTest('committed', 1) === 'done' && DEMO._v2StepStatusForTest('committed', 5) === 'todo', 'committed → 1 done, 5 todo');
    ok('2 stepper current step tracks all 8 states (empty…complete)');
} catch (e) { bad('2 stepper state tracking', e); }

// 3 — microcopy carries the exact owner phrases.
try {
    assert(/⚡ Generate AI Plan<\/b> — slow — calls AI/.test(DEMO._v2MicrocopyHtmlForTest('empty')), 'Generate microcopy');
    assert(/✅ Commit Selected Plan<\/b> — locks the selected COA/.test(DEMO._v2MicrocopyHtmlForTest('ready')), 'Commit microcopy');
    assert(/▶ Run Plan<\/b> — fast — no AI on normal ticks/.test(DEMO._v2MicrocopyHtmlForTest('committed')), 'Run microcopy');
    assert(/↻ Replan with AI<\/b> — advanced — calls AI again/.test(DEMO._v2MicrocopyHtmlForTest('blocked')), 'Replan microcopy (blocked)');
    ok('3 microcopy has the exact owner phrases (Generate/Commit/Run/Replan)');
} catch (e) { bad('3 microcopy', e); }

// 4 — selected-COA summary shows Selected · Recommended · Override · Final score.
try {
    freshNoExec(mkPlan());           // recommended = COA-1 (idx 0), selected = idx 0
    var sum = DEMO._v2SelectedSummaryHtmlForTest();
    assert(/data-ff-v2="selected-summary"/.test(sum), 'summary container present');
    assert(/Selected COA:<\/span> <b[^>]*>COA-1/.test(sum), 'shows Selected COA-1');
    assert(/Recommended:<\/span> <b[^>]*>COA-1/.test(sum), 'shows Recommended COA-1');
    assert(/Operator override:<\/span> <b[^>]*>no</.test(sum), 'override no when recommended selected');
    assert(/Final score:<\/span> <b[^>]*>70/.test(sum), 'shows final score 70 (ranked)');
    ok('4 selected-COA summary → Selected · Recommended · Operator override · Final score');
} catch (e) { bad('4 selected summary', e); }

// 5 — "Select a COA card first." when nothing is selected.
try {
    freshNoExec(mkPlan());
    DEMO._setCoaSelectedIdxForTest(-1);   // simulate no valid selection
    var sumN = DEMO._v2SelectedSummaryHtmlForTest();
    assert(/data-ff-v2="no-selection"/.test(sumN) && /Select a COA card first\./.test(sumN), 'guidance shown when nothing selected');
    DEMO._setCoaSelectedIdxForTest(0);
    ok('5 "Select a COA card first." appears when no COA is selected');
} catch (e) { bad('5 no-selection guidance', e); }

// 6 — non-recommended selection → operator-override sentence (new copy).
try {
    freshNoExec(mkPlan());
    DEMO._setCoaSelectedIdxForTest(1);   // COA-2, recommended is COA-1
    var sumO = DEMO._v2SelectedSummaryHtmlForTest();
    assert(/Operator override:<\/span> <b[^>]*>yes</.test(sumO), 'override yes');
    assert(/Operator override: you selected COA-2 instead of recommended COA-1\./.test(sumO), 'override sentence (you selected)');
    ok('6 non-recommended → "Operator override: you selected COA-2 instead of recommended COA-1."');
} catch (e) { bad('6 override sentence', e); }

// 7 — no raw JSON / benchmark / decision log in the operator path (drawer closed).
try {
    freshNoExec(mkPlan());
    var bodyClosed = v2() + DEMO._freeFightLegacyDrawerHtmlForTest();
    assert(!/Green JSON/.test(bodyClosed), 'no raw JSON');
    assert(!/data-act="bench-run"/.test(bodyClosed) && !/data-act="bench-warmup"/.test(bodyClosed), 'no benchmark');
    assert(!/data-act="decision-log-clear"/.test(bodyClosed), 'no decision log');
    ok('7 operator path has no raw JSON / benchmark / decision log');
} catch (e) { bad('7 no diagnostics in operator path', e); }

// 8 — FULL FLOW: empty → ready → committed → running/blocked.
try {
    freshNoExec(null);
    assert(DEMO._freeFightControlStateV2ForTest() === 'empty', 'starts empty');
    DEMO._setCoaPlanForTest(mkPlan()); DEMO._setCoaSelectedIdxForTest(0);
    assert(DEMO._freeFightControlStateV2ForTest() === 'ready', 'plan → ready');
    DEMO._setGreenWorldForTest(GREEN);
    DEMO._commitCoaForTest(0);
    assert(DEMO._freeFightControlStateV2ForTest() === 'committed', 'commit → committed');
    FETCHED.length = 0;
    DEMO._runCommittedCoaForTest();
    var stRun = DEMO._freeFightControlStateV2ForTest();
    assert(stRun === 'running' || stRun === 'blocked' || stRun === 'complete', 'run → running/blocked/complete (got ' + stRun + ')');
    ok('8 full flow empty → ready → committed → running/blocked');
} catch (e) { bad('8 full flow', e); }

// 9 — COA-card click changes selected; Commit uses the selected COA.
try {
    freshNoExec(mkPlan());
    var b4 = DEMO._getCoaSelectedIdxForTest();
    var after = DEMO._v2SelectCoaForTest(1);   // simulate the v2-coa-1 card click
    assert(b4 === 0 && after === 1, 'click moved selection 0 → 1');
    var ex = DEMO._commitCoaForTest();          // no-arg → commits _coaSelectedIdx (the v2-commit handler path)
    assert(ex && ex.selected_coa_id === 'COA-2', 'commit used the SELECTED COA-2 (got ' + (ex && ex.selected_coa_id) + ')');
    ok('9 COA-card click changes selection; Commit uses the selected COA');
} catch (e) { bad('9 click + commit selected', e); }

// 10 — Run does NOT call /plan-coas; normal committed tick stays no-LLM.
try {
    freshNoExec(mkPlan());
    DEMO._commitCoaForTest(0);
    FETCHED.length = 0;
    DEMO._runCommittedCoaForTest();
    assert(!FETCHED.some(function (u) { return /\/plan-coas/.test(u); }), 'Run made no /plan-coas call: ' + JSON.stringify(FETCHED));
    var timing = DEMO._coaExecTickForTest() || (DEMO._getCoaExecForTest() && DEMO._getCoaExecForTest().last_tick_timing);
    assert(timing && timing.llm_called_this_tick === false, 'tick llm_called_this_tick=false');
    ok('10 Run no /plan-coas; normal committed tick stays llm_called_this_tick=false');
} catch (e) { bad('10 run/tick no-LLM', e); }

console.log('\n' + (fail === 0 ? '✅ ' : '❌ ') + pass + ' passed, ' + fail + ' failed (test-free-fight-v2-operator-walkthrough-y.js)');
process.exit(fail === 0 ? 0 : 1);
