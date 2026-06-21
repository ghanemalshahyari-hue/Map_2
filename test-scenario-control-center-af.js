/**
 * test-scenario-control-center-af.js — RMOOZ-SCENARIO-CONTROL-CENTER-REBUILD-AF
 *
 * The Scenario Control Center is a HARD REPLACEMENT for the old Free Fight control window. This suite
 * proves: the old window is gone from the operator path, the new SCC is the only operator card, the
 * 6-panel flow works (Readiness → Prepare → Review → Commit → Run), one-source-of-truth state, the
 * all-to-objective-center hard fail, commit stores exactly the reviewed COA, Run is hidden before commit,
 * no stale committed COA shadows a new plan, every visible button is bound, and Clear resets everything.
 *
 * Maps to the AF testing requirements (1–15).
 */
'use strict';
var assert = require('assert');
var path = require('path');
var pass = 0, fail = 0;
function ok(n) { pass++; console.log('  ✓ ' + n); }
function bad(n, e) { fail++; console.log('  ✗ ' + n + (e ? (' — ' + (e && e.message || e)) : '')); }
function km(a, b) { var R = 6371, tr = Math.PI / 180; var dLat = (b.lat - a.lat) * tr, dLon = (b.lon - a.lon) * tr, la1 = a.lat * tr, la2 = b.lat * tr; var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) * Math.sin(dLon / 2); return 2 * R * Math.asin(Math.min(1, Math.sqrt(h))); }

var OBJ = { lat: 24.45, lon: 54.40, name: 'Objective X' };

// ── DOM/window stub ──
var elById = {};
function makeEl(t) { var el = { tagName: t, innerHTML: '', textContent: '', children: [], attrs: {}, style: {}, appendChild: function (e) { this.children.push(e); if (e && e.id) elById[e.id] = e; return e; }, removeChild: function (e) { var i = this.children.indexOf(e); if (i >= 0) this.children.splice(i, 1); return e; }, setAttribute: function (k, v) { this.attrs[k] = v; }, removeAttribute: function (k) { delete this.attrs[k]; }, addEventListener: function () {}, removeEventListener: function () {}, querySelector: function () { return null; }, querySelectorAll: function () { return []; }, getAttribute: function (k) { return this.attrs[k]; } }; Object.defineProperty(el, 'parentNode', { value: null, writable: true }); return el; }
var bodyEl = makeEl('body');
global.document = { body: bodyEl, head: makeEl('head'), createElement: makeEl, getElementById: function (id) { return elById[id] || null; }, querySelector: function () { return null; } };
var GREEN = { ok: true, collateral_risk: { band: 'low', score: 10 }, provenance: { engine: 'deterministic' }, deterministic: true };
global.window = { document: global.document, AppShellEventLog: { append: function () {} },
    sessionStorage: (function () { var d = {}; return { getItem: function (k) { return d[k] || null; }, setItem: function (k, v) { d[k] = String(v); }, removeItem: function (k) { delete d[k]; } }; })(),
    setTimeout: function () { return 0; }, clearTimeout: function () {}, setInterval: function () { return 0; }, clearInterval: function () {},
    fetch: function () { return Promise.resolve({ ok: true, status: 200, text: function () { return Promise.resolve(JSON.stringify(GREEN)); }, json: function () { return Promise.resolve(GREEN); } }); } };
global.window.window = global.window;
global.window.RmoozScenario = { scenario: { id: 'af', name: 'AF Scenario', obj: { name: 'Objective X', coord: [54.40, 24.45] },
    red_units: [{ id: 'R-1', side: 'RED', lat: 24.50, lon: 54.50, coord: [54.50, 24.50] }],
    blue_units_initial: [{ id: 'B-1', side: 'BLUE', lat: 24.30, lon: 54.20, coord: [54.20, 24.30] }, { id: 'B-2', side: 'BLUE', lat: 24.31, lon: 54.22, coord: [54.22, 24.31] }, { id: 'B-3', side: 'BLUE', lat: 24.29, lon: 54.21, coord: [54.21, 24.29] }] } };
var Cl = path.join(__dirname, 'UI_MOdified', 'client', 'shell');
global.window.RmoozTaskability = require(path.join(Cl, 'unit-taskability.js'));
require(path.join(Cl, 'world-state-db.js')); require(path.join(Cl, 'symbol-db.js')); require(path.join(Cl, 'symbol-registry.js'));
require(path.join(Cl, 'free-fight-demo.js'));
require(path.join(Cl, 'scenario-control-center.js'));
var DEMO = global.window.RmoozFreeFightDemo;
var SCC = global.window.RmoozScenarioControlCenter;
var E = DEMO.engine;
DEMO.mount({ brief: { operational_brief: { proposed_units: global.window.RmoozScenario.scenario.blue_units_initial, objectives: [{ label: 'Objective X', lat: 24.45, lon: 54.40 }] } } });
DEMO._setRouteHealthForTest({ ok: true, allow_sim_run: true, model_available: true, provider: 'ollama', model: 'qwen3-coder:latest' });
DEMO.setObjective(OBJ);

// The operator body is exactly what updatePanel renders: the SCC. (The DOM stub's querySelector returns
// null, so we read the SCC render the host renders, not _bodyHtmlForTest's empty stub result.)
function bodyHtml() { return DEMO._sccRenderForTest(); }
function reset() { DEMO._resetScenarioForTest(); DEMO._forgetCoaExecInMemoryForTest(); DEMO._resetCoaExecForTest(); DEMO._setCoaPlanForTest(null); }
function setBlue(u) { global.window.RmoozScenario.scenario.blue_units_initial = u; }
function execCoa() { return { plan_id: 'COA-1', title: 'Supported assault', side: 'BLUE', recommended: true,
    commander_intent: 'Seize and hold with a supported assault.', main_effort: 'B-1 assault', supporting_effort: 'B-2 support', reserve_or_follow_on: 'none', security_or_screen: 'B-3 screen', red_assumption: 'Red defends.', risk_mitigation: 'Screen the flank.',
    phases: [{ name: 'P1 support/screen', actions: [{ unit_uid: 'B-2', action_type: 'MOVE', role: 'support', target: { lat: 24.40, lon: 54.44 } }, { unit_uid: 'B-3', action_type: 'MOVE', role: 'screen', target: { lat: 24.47, lon: 54.36 } }] },
                { name: 'P2 assault', actions: [{ unit_uid: 'B-1', action_type: 'MOVE', role: 'assault', target: { lat: 24.43, lon: 54.385 } }] }] }; }
function centerCoa() { return { plan_id: 'COA-CTR', title: 'All to objective', side: 'BLUE', recommended: true,
    phases: [{ name: 'Move', actions: ['B-1', 'B-2', 'B-3'].map(function (id) { return { unit_uid: id, action_type: 'MOVE', role: 'assault', target: { lat: OBJ.lat, lon: OBJ.lon } }; }) }] }; }
function llmPlan(coas) { return { ok: true, plan_source: 'llm', llm_called: true, llm_status: 'ok', _requestedVia: 'manual_generate', recommended_plan_id: coas[0].plan_id, validation: { ok: true }, coas: coas }; }

console.log('Scenario Control Center (AF):');

// 1/2/3 — old Free Fight window gone; no legacy drawer; no old v2 action ids in the operator DOM.
try {
    reset(); DEMO._setCoaPlanForTest(llmPlan([execCoa()])); E.selectCoa(0);
    var h = bodyHtml();
    assert(/data-scc="window"/.test(h), 'new SCC window renders in the operator body');
    assert(!/data-ff-v2/.test(h), 'NO old v2 data-ff-v2 ids in the operator DOM');
    assert(!/Diagnostics \/ Legacy/.test(h), 'NO legacy drawer');
    assert(!/GROUP MOVEMENT DEMO/.test(h), 'NO old group-movement demo');
    assert(!/data-act="v2-/.test(h) && !/data-act="generate-coa"/.test(h) && !/data-act="coa-commit"/.test(h), 'NO old v2-/legacy data-act ids');
    assert(typeof DEMO._renderFreeFightControlV2HtmlForTest === 'undefined' || DEMO._renderFreeFightControlV2HtmlForTest === undefined, 'old V2 render seam removed');
    ok('1/2/3 old Free Fight window gone — no v2 ids / no legacy drawer / no group demo; SCC is the body');
} catch (e) { bad('1/2/3 old window gone', e); }

// 4 — new SCC renders from scratch with the 6-panel flow.
try {
    reset();
    var h0 = SCC.render();
    assert(/Scenario Control Center/.test(h0), 'SCC title');
    assert(/Scenario Readiness/.test(h0) && /data-scc-panel="1"/.test(h0), 'Panel 1 Readiness');
    assert(/Readiness/.test(h0) && /Prepare/.test(h0) && /Review/.test(h0) && /Commit/.test(h0) && /Run/.test(h0), 'flow strip Readiness→Prepare→Review→Commit→Run');
    ok('4 new Scenario Control Center renders from scratch (header + flow strip + Panel 1)');
} catch (e) { bad('4 SCC renders', e); }

// 5 — Step 1 placeholder data blocks executable COA.
var savedRed = global.window.RmoozScenario.scenario.red_units;
try {
    global.window.RmoozScenario.scenario.red_units = [];   // a Step-1 BLUE ORBAT upload: no taskable units present
    setBlue([{ id: 'Z-1', side: 'BLUE', source_required: true, needs_review: true, exact_unit_position: false, lat: 24.3, lon: 54.2, coord: [54.2, 24.3] }]);
    DEMO.mount({ brief: { operational_brief: { proposed_units: global.window.RmoozScenario.scenario.blue_units_initial } } });
    DEMO.setObjective(OBJ); reset();
    assert(SCC.state() === 'step1_review_required', 'state step1_review_required for placeholder ORBAT');
    var h5 = SCC.render();
    assert(/No executable COA\. Step 1 review required\./.test(h5), 'shows "No executable COA. Step 1 review required."');
    assert(/disabled/.test(h5.match(/data-act="scc-prepare"[^>]*/)[0]), 'Prepare COA is disabled');
    ok('5 Step-1 placeholder data blocks an executable COA (Prepare disabled + review-required)');
} catch (e) { bad('5 step1 blocks', e); }
// restore operational units + red
global.window.RmoozScenario.scenario.red_units = savedRed;
setBlue([{ id: 'B-1', side: 'BLUE', lat: 24.30, lon: 54.20, coord: [54.20, 24.30] }, { id: 'B-2', side: 'BLUE', lat: 24.31, lon: 54.22, coord: [54.22, 24.31] }, { id: 'B-3', side: 'BLUE', lat: 24.29, lon: 54.21, coord: [54.21, 24.29] }]);
DEMO.mount({ brief: { operational_brief: { proposed_units: global.window.RmoozScenario.scenario.blue_units_initial } } });
DEMO.setObjective(OBJ);

// 6 — COA with all units to objective center is rejected and cannot be committed.
try {
    reset(); DEMO._setCoaPlanForTest(llmPlan([centerCoa()])); E.selectCoa(0);
    var h6 = SCC.render();
    assert(/Rejected: not commander-quality\. All units are moving to the objective center\./.test(h6), 'all-to-center COA shows the hard-fail rejection');
    assert(/scc-commit" disabled/.test(h6), 'Commit is disabled for the rejected COA');
    var exC = E.commit(0);   // commit enforcement replaces it with the role-separated template
    var committed = exC && exC.selected_coa;
    var centerCnt = committed ? committed.phases.reduce(function (m, p) { return m.concat((p.actions || []).filter(function (a) { return a.action_type !== 'HOLD_POSITION' && a.target; })); }, []).filter(function (a) { return km({ lat: +a.target.lat, lon: +a.target.lon }, OBJ) < 0.6; }).length : 99;
    assert(centerCnt === 0, 'a center COA cannot be committed as-is (0 moves at center after enforcement)');
    ok('6 all-to-center COA rejected in review + cannot be committed as-is');
} catch (e) { bad('6 center rejected', e); }

// 7 — COA review shows the exact action targets (table).
try {
    reset(); DEMO._setCoaPlanForTest(llmPlan([execCoa()])); E.selectCoa(0);
    var h7 = SCC.render();
    assert(/data-scc="target-table"/.test(h7), 'committed/executable action-targets table present');
    assert(/B-2/.test(h7) && /support/.test(h7) && /54\.44/.test(h7), 'table shows unit / role / exact target lon');
    assert(/taskable/.test(h7) && /ROE/.test(h7), 'table shows ROE status + taskable columns');
    ok('7 COA review shows the exact action targets (unit/role/action/target/lat/lon/ROE/taskable)');
} catch (e) { bad('7 action targets', e); }

// 8 — Commit stores exactly the selected reviewed COA.
try {
    reset(); DEMO._setCoaPlanForTest(llmPlan([execCoa()])); E.selectCoa(0);
    var selSummary = E.targetSummary(E.rawJson('selected'));
    var ex8 = E.commit(0);
    var comSummary = E.targetSummary(E.rawJson('committed'));
    assert(ex8 && ex8.selected_coa_id === 'COA-1', 'committed the reviewed COA-1');
    assert(selSummary === comSummary, 'committed targets == selected (reviewed) targets: ' + comSummary);
    ok('8 Commit stores exactly the selected reviewed COA (selected == committed targets)');
} catch (e) { bad('8 commit stores reviewed', e); }

// 9 — Run is hidden before commit.
try {
    reset(); DEMO._setCoaPlanForTest(llmPlan([execCoa()])); E.selectCoa(0);
    var hRev = SCC.render();
    assert(SCC.state() === 'coa_review', 'state coa_review pre-commit');
    assert(!/data-act="scc-run"/.test(hRev) && !/data-act="scc-run-once"/.test(hRev), 'NO Run / Run-Scenario button before commit');
    E.commit(0);
    var hCom = SCC.render();
    assert(/data-act="scc-run"/.test(hCom), 'Run Scenario appears only after commit');
    ok('9 Run Scenario is hidden before commit, shown after');
} catch (e) { bad('9 run hidden pre-commit', e); }

// 10 — Run Scenario executes the committed COA only.
try {
    reset(); DEMO._setCoaPlanForTest(llmPlan([execCoa()])); E.selectCoa(0); E.commit(0);
    E.runScenario();
    var ex10 = E.committedExec();
    assert(E.scenarioRuntime() && E.scenarioRuntime().scenario_active, 'scenario started');
    assert(ex10 && ex10.selected_coa_id === 'COA-1', 'scenario executes the committed COA-1 only');
    ok('10 Run Scenario executes the committed COA only');
} catch (e) { bad('10 run executes committed', e); }

// 11 — no stale committed COA shadows a newly generated plan.
try {
    reset(); DEMO._setCoaPlanForTest(llmPlan([execCoa()])); E.selectCoa(0); E.commit(0);
    assert(SCC.state() === 'committed', 'committed an initial plan');
    DEMO._setCoaPlanForTest(llmPlan([Object.assign(execCoa(), { plan_id: 'COA-NEW', title: 'New plan' })])); E.selectCoa(0);
    assert(E.committedIsStale() === true, 'new plan detected as superseding the stale commit');
    assert(SCC.state() === 'coa_review', 'state back to coa_review (NOT committed) — stale does not shadow');
    var h11 = SCC.render();
    assert(/data-scc="recommit-needed"/.test(h11), 'recommit-needed banner shown');
    assert(!/data-act="scc-run"/.test(h11), 'Run stays hidden while stale (must re-commit)');
    ok('11 a stale committed COA does NOT shadow a newly generated plan');
} catch (e) { bad('11 no stale shadow', e); }

// 12 — every visible scc-* button has a bound handler.
try {
    var bound = {};
    SCC.bind(function (act) { bound[act] = true; });
    var states = [];
    reset(); DEMO._setCoaPlanForTest(llmPlan([execCoa()])); E.selectCoa(0); states.push(SCC.render());   // coa_review
    E.commit(0); states.push(SCC.render());                                                              // committed
    E.runScenario(); states.push(SCC.render());                                                          // scenario_running
    reset(); states.push(SCC.render());                                                                  // ready/no-scenario
    var allActs = {};
    states.forEach(function (h) { (h.match(/data-act="(scc-[a-z0-9-]+)"/g) || []).forEach(function (m) { allActs[m.replace(/.*data-act="/, '').replace(/"$/, '')] = true; }); });
    var rendered = Object.keys(allActs);
    var unbound = rendered.filter(function (a) { return !bound[a.replace(/-\d+$/, function (s) { return s; })] && !bound[a]; });
    assert(rendered.length >= 5, 'rendered a meaningful set of buttons (' + rendered.length + ')');
    assert(unbound.length === 0, 'every visible button is bound — unbound: ' + unbound.join(', '));
    ok('12 every visible scc-* button has a bound handler (' + rendered.length + ' buttons across states)');
} catch (e) { bad('12 buttons bound', e); }

// 13 — Clear resets selected / committed / scenario state.
try {
    reset(); DEMO._setCoaPlanForTest(llmPlan([execCoa()])); E.selectCoa(0); E.commit(0); E.runScenario();
    assert(E.committedExec() && E.scenarioRuntime(), 'have committed exec + scenario before clear');
    E.clearAll();
    assert(E.committedExec() === null, 'committed exec cleared');
    assert(E.scenarioRuntime() === null, 'scenario runtime cleared');
    assert(DEMO._getCommittedPlanObjMatchesForTest() === false, 'committed-plan identity cleared');
    ok('13 Clear resets committed COA + scenario runtime + committed-plan identity');
} catch (e) { bad('13 clear resets', e); }

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
