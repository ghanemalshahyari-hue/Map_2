/**
 * test-free-fight-step1-coa-preparation-gate-ae.js — RMOOZ-STEP1-COA-PREPARATION-GATE-AE
 *
 * A Step-1 ORBAT (source_required / needs_review / exact_unit_position:false / null coords / doctrine /
 * commander-review pending) is REVIEW-ONLY. Such units MUST NOT receive a movement/combat task — they can
 * only HOLD / be flagged REVIEW_REQUIRED / SOURCE_REQUIRED / DOCTRINE_REQUIRED until source, coordinates,
 * doctrine and commander approval exist. The gate runs before Generate, Commit, and Run.
 *
 * Acceptance (maps 1:1 to the AE task spec):
 *   MODULE A  pure RmoozTaskability.classifyUnit / prepareReport produce the right verdicts + counts
 *   AE 1  source_required → not taskable (blocked_by_missing_source)
 *   AE 2  lat/lon null    → not taskable (blocked_by_missing_coordinates)
 *   AE 3  exact_unit_position:false → not taskable for movement
 *   AE 4  doctrine_upload_required → not taskable (combat tasking blocked)
 *   AE 5  Generate produces NO movement COA when no units are taskable (no /plan-coas, honest block)
 *   AE 6  Readiness banner shows taskable/blocked counts + "No executable COA until review complete"
 *   AE 7  Commit refuses a COA that tasks a non-taskable unit with movement
 *   AE 8  the movement chokepoint + Run gate refuse to move Step-1 placeholder units
 *   AE 9  one taskable + others blocked → only the taskable unit moves
 *   AE 10 the AD quality gate is still active after the Step-1 gate (center COA still replaced)
 *   AE 11 decision log + event log record the Step-1 gate (role=white, called_llm=false)
 */
'use strict';
var assert = require('assert');
var path = require('path');
var pass = 0, fail = 0;
function ok(n) { pass++; console.log('  ✓ ' + n); }
function bad(n, e) { fail++; console.log('  ✗ ' + n + (e ? (' — ' + (e && e.message || e)) : '')); }
function km(a, b) { var R = 6371, tr = Math.PI / 180; var dLat = (b.lat - a.lat) * tr, dLon = (b.lon - a.lon) * tr, la1 = a.lat * tr, la2 = b.lat * tr; var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) * Math.sin(dLon / 2); return 2 * R * Math.asin(Math.min(1, Math.sqrt(h))); }

var OBJ = { lat: 24.45, lon: 54.40, name: 'Objective X' };

// ── MODULE A: the pure resolver, tested directly (the canonical layer the AF rebuild reuses) ──
console.log('MODULE — pure RmoozTaskability resolver:');
var T = require(path.join(__dirname, 'UI_MOdified/client/shell/unit-taskability.js'));
try {
    assert.strictEqual(T.classifyUnit({ id: 'U1', source_required: true, lat: 24.3, lon: 54.2 }).taskable, false, 'source_required not taskable');
    assert.strictEqual(T.classifyUnit({ id: 'U2', lat: null, lon: null }).taskable, false, 'null coords not taskable');
    assert.strictEqual(T.classifyUnit({ id: 'U3', exact_unit_position: false, lat: 24.3, lon: 54.2 }).taskable, false, 'exact_unit_position:false not taskable');
    assert.strictEqual(T.classifyUnit({ id: 'U4', needs_review: true, lat: 24.3, lon: 54.2 }).taskable, false, 'needs_review not taskable');
    var good = T.classifyUnit({ id: 'U5', lat: 24.3, lon: 54.2 });
    assert.strictEqual(good.taskable, true, 'sourced unit with coords is taskable');
    assert(good.allowed_actions.indexOf('ATTACK') !== -1, 'taskable unit allows combat actions');
    var blk = T.classifyUnit({ id: 'U1', source_required: true, lat: 24.3, lon: 54.2 });
    assert(blk.blocked_actions.indexOf('MOVE') !== -1 || blk.blocked_actions.indexOf('ATTACK') !== -1, 'blocked unit blocks movement/combat');
    assert.strictEqual(blk.review_status, 'SOURCE_REQUIRED', 'blocked-by-source review_status');
    var rep = T.prepareReport([
        { id: 'B-1', side: 'BLUE', source_required: true, lat: 24.30, lon: 54.20 },
        { id: 'B-2', side: 'BLUE', lat: null, lon: null },
        { id: 'B-3', side: 'BLUE', exact_unit_position: false, lat: 24.31, lon: 54.21 },
        { id: 'B-4', side: 'BLUE', lat: 24.32, lon: 54.22 } ]);
    assert.strictEqual(rep.units_loaded, 4, 'units_loaded');
    assert.strictEqual(rep.taskable, 1, '1 taskable (B-4)');
    assert.strictEqual(rep.blocked, 3, '3 blocked');
    assert.strictEqual(rep.blocked_by_missing_source, 2, 'B-1 source + B-3 exact_unit_position counted as source');
    assert.strictEqual(rep.blocked_by_missing_coordinates, 1, 'B-2 missing coords');
    assert.strictEqual(rep.executable, true, 'executable (1 taskable exists)');
    var none = T.prepareReport([{ id: 'X', source_required: true, lat: 24.3, lon: 54.2 }]);
    assert.strictEqual(none.executable, false, 'no taskable → not executable');
    // AK: a review-only unit WITH coords is training-eligible, so the honest block now offers training simulation.
    assert(/Step 1 data (requires source\/doctrine\/commander review|is review-only)/.test(none.message), 'no-taskable honest block message');
    var noneNoCoord = T.prepareReport([{ id: 'Y', source_required: true, lat: null, lon: null }]);
    assert(/requires source\/doctrine\/commander review/.test(noneNoCoord.message), 'coords-less set is NOT training-eligible → plain review message');
    ok('MODULE A pure classifyUnit/prepareReport verdicts + non-exclusive counts + executable + message');
} catch (e) { bad('MODULE A pure resolver', e); }

// ── CLIENT: DOM/window stub + the client module (Step-1 gate wired into the cockpit) ──
var elById = {};
function makeEl(t) { var el = { tagName: t, innerHTML: '', textContent: '', children: [], attrs: {}, style: {}, appendChild: function (e) { this.children.push(e); if (e && e.id) elById[e.id] = e; return e; }, removeChild: function (e) { var i = this.children.indexOf(e); if (i >= 0) this.children.splice(i, 1); return e; }, setAttribute: function (k, v) { this.attrs[k] = v; }, removeAttribute: function (k) { delete this.attrs[k]; }, addEventListener: function () {}, removeEventListener: function () {}, querySelector: function () { return null; }, querySelectorAll: function () { return []; }, getAttribute: function (k) { return this.attrs[k]; } }; Object.defineProperty(el, 'parentNode', { value: null, writable: true }); return el; }
var bodyEl = makeEl('body');
global.document = { body: bodyEl, head: makeEl('head'), createElement: makeEl, getElementById: function (id) { return elById[id] || null; }, querySelector: function () { return null; } };
var GREEN = { ok: true, collateral_risk: { band: 'low', score: 10 }, provenance: { engine: 'deterministic' }, deterministic: true };
var FETCHES = [];
global.window = { document: global.document, AppShellEventLog: { append: function () {} },
    sessionStorage: (function () { var d = {}; return { getItem: function (k) { return d[k] || null; }, setItem: function (k, v) { d[k] = String(v); }, removeItem: function (k) { delete d[k]; } }; })(),
    setTimeout: function () { return 0; }, clearTimeout: function () {}, setInterval: function () { return 0; }, clearInterval: function () {},
    fetch: function (u) { FETCHES.push(String(u)); return Promise.resolve({ ok: true, status: 200, text: function () { return Promise.resolve(JSON.stringify(GREEN)); }, json: function () { return Promise.resolve(GREEN); } }); } };
global.window.window = global.window;
global.window.RmoozScenario = { scenario: { id: 'step1-ae', obj: { name: 'Objective X', coord: [54.40, 24.45] }, red_units: [], blue_units_initial: [] } };
var Cl = path.join(__dirname, 'UI_MOdified', 'client', 'shell');
// In the browser, unit-taskability.js loads via its own <script> tag (window defined) and sets
// window.RmoozTaskability. Under Node the module was already require()d for MODULE A (cached, IIFE won't
// re-run against this window stub) — so assign it explicitly from the same export the browser would expose.
global.window.RmoozTaskability = T;
require(path.join(Cl, 'world-state-db.js')); require(path.join(Cl, 'symbol-db.js')); require(path.join(Cl, 'symbol-registry.js')); require(path.join(Cl, 'free-fight-demo.js'));
require(path.join(Cl, 'scenario-control-center.js'));   // RMOOZ-...-AF: Step-1 readiness migrated to SCC Panel 1
var DEMO = global.window.RmoozFreeFightDemo;
assert(global.window.RmoozTaskability, 'window.RmoozTaskability present for the client to use');

function setBlue(units) { global.window.RmoozScenario.scenario.blue_units_initial = units; }
function mountFresh() {
    DEMO.mount({ brief: { operational_brief: { proposed_units: global.window.RmoozScenario.scenario.blue_units_initial, objectives: [{ label: 'Objective X', lat: 24.45, lon: 54.40 }] } } });
    DEMO._setRouteHealthForTest({ ok: true, allow_sim_run: true, model_available: true, provider: 'ollama', model: 'qwen3-coder:latest' });
    if (DEMO.setObjective) DEMO.setObjective(OBJ);
    DEMO._resetScenarioForTest(); DEMO._forgetCoaExecInMemoryForTest(); DEMO._resetCoaExecForTest();
}
function moveCoa(uids) { return { plan_id: 'COA-MV', title: 'Move', side: 'BLUE', recommended: true,
    commander_intent: 'x', main_effort: 'x', supporting_effort: 'x', red_assumption: 'x', risk_mitigation: 'x',
    phases: [{ name: 'Move', actions: uids.map(function (id) { return { unit_uid: id, action_type: 'MOVE', role: 'assault', target: { lat: OBJ.lat, lon: OBJ.lon } }; }) }] }; }

console.log('\nCLIENT — Step-1 gate wired into the cockpit:');

// AE 1–4 — per-unit taskability through the client classifier (uses window.RmoozTaskability)
try {
    setBlue([
        { id: 'B-1', side: 'BLUE', source_required: true, lat: 24.30, lon: 54.20, coord: [54.20, 24.30] },
        { id: 'B-2', side: 'BLUE', lat: null, lon: null },
        { id: 'B-3', side: 'BLUE', exact_unit_position: false, lat: 24.31, lon: 54.21, coord: [54.21, 24.31] },
        { id: 'B-4', side: 'BLUE', doctrine_upload_required: true, lat: 24.32, lon: 54.22, coord: [54.22, 24.32] },
        { id: 'B-5', side: 'BLUE', lat: 24.33, lon: 54.23, coord: [54.23, 24.33] } ]);
    mountFresh();
    assert.strictEqual(DEMO._isUnitTaskableForTest('B-1'), false, 'AE1 source_required not taskable');
    assert.strictEqual(DEMO._isUnitTaskableForTest('B-2'), false, 'AE2 null coords not taskable');
    assert.strictEqual(DEMO._isUnitTaskableForTest('B-3'), false, 'AE3 exact_unit_position:false not taskable');
    assert.strictEqual(DEMO._isUnitTaskableForTest('B-4'), false, 'AE4 doctrine_upload_required not taskable');
    assert.strictEqual(DEMO._isUnitTaskableForTest('B-5'), true, 'B-5 (sourced, coords) is taskable');
    ok('AE 1-4 per-unit taskability (source / null-coords / exact_unit_position / doctrine) blocks tasking');
} catch (e) { bad('AE 1-4 per-unit taskability', e); }

// AE 11 — Step-1 gate report + decision log (role=white, called_llm=false)
try {
    var r = DEMO._step1GateForTest('generate');
    assert.strictEqual(r.units_loaded, 5, 'gate sees 5 loaded');
    assert.strictEqual(r.taskable, 1, 'gate: 1 taskable (B-5)');
    assert.strictEqual(r.blocked, 4, 'gate: 4 blocked');
    assert(r.executable === true, 'executable (B-5 taskable)');
    var rep = DEMO._step1PreparationReportForTest();
    assert.strictEqual(rep.blocked_by_missing_coordinates, 1, 'report counts missing coords (B-2)');
    assert.strictEqual(rep.blocked_by_missing_doctrine, 1, 'report counts missing doctrine (B-4)');
    assert(rep.blocked_by_missing_source >= 2, 'report counts missing source (B-1, B-3)');
    var dec = DEMO._getDecisionLogForTest().filter(function (d) { return d && d.action === 'step1_coa_preparation_gate'; });
    assert(dec.length >= 1, 'a step1_coa_preparation_gate decision was recorded');
    assert.strictEqual(dec[dec.length - 1].called_llm, false, 'Step-1 gate decision is called_llm:false');
    assert.strictEqual(dec[dec.length - 1].role, 'white', 'Step-1 gate decision role=white');
    ok('AE 11 Step-1 gate report + counts + decision log (role=white, called_llm=false)');
} catch (e) { bad('AE 11 Step-1 gate report', e); }

// AE 6 — Scenario Control Center Panel 1 (Readiness) shows counts + reasons (the banner migrated to SCC).
try {
    var html = DEMO._sccRenderForTest();
    assert(/Scenario Readiness/.test(html), 'SCC Panel 1 readiness renders');
    assert(/data-scc-panel="1"/.test(html), 'Panel 1 marker present');
    assert(/1 taskable/.test(html) && /4 blocked/.test(html), 'Panel 1 shows taskable/blocked counts');
    // all-blocked → "No executable COA. Step 1 review required."
    setBlue([{ id: 'Z-1', side: 'BLUE', source_required: true, lat: 24.3, lon: 54.2, coord: [54.2, 24.3] }]);
    mountFresh();
    var html2 = DEMO._sccRenderForTest();
    assert(/No executable COA\. Step 1 review required\./.test(html2), 'Panel 1 shows "No executable COA. Step 1 review required."');
    assert(/data-scc="no-exec"/.test(html2), 'Panel 1 marks not-executable');
    assert(DEMO._sccStateForTest() === 'step1_review_required', 'SCC state step1_review_required when nothing taskable');
    ok('AE 6 SCC Panel 1 readiness: counts, reasons, and "No executable COA. Step 1 review required."');
} catch (e) { bad('AE 6 readiness banner', e); }

// AE 5 — Generate produces NO movement COA when no units are taskable (no /plan-coas)
try {
    setBlue([{ id: 'Z-1', side: 'BLUE', source_required: true, lat: 24.3, lon: 54.2, coord: [54.2, 24.3] },
             { id: 'Z-2', side: 'BLUE', needs_review: true, lat: 24.31, lon: 54.21, coord: [54.21, 24.31] }]);
    mountFresh();
    FETCHES.length = 0;
    DEMO._generateCoaPlanForTest();
    var plan = DEMO._getCoaPlanForTest();
    assert(plan && plan.ok === false && plan._step1_blocked === true, 'plan is Step-1-blocked, ok:false');
    // AK: Z-1/Z-2 are review-only WITH coords → training-eligible, so the honest block now offers training simulation.
    assert(/Step 1 data (requires source\/doctrine\/commander review|is review-only)/.test(plan._error || ''), 'honest block message (training-eligible variant ok)');
    var planFetches = FETCHES.filter(function (u) { return /plan-coas/.test(u); });
    assert.strictEqual(planFetches.length, 0, 'NO /plan-coas call when nothing is taskable');
    ok('AE 5 Generate produces NO movement COA + NO /plan-coas call when no units are taskable');
} catch (e) { bad('AE 5 Generate blocked when no taskable units', e); }

// AE 7 — Commit refuses a COA that tasks a non-taskable unit with movement
try {
    setBlue([{ id: 'B-1', side: 'BLUE', source_required: true, lat: 24.30, lon: 54.20, coord: [54.20, 24.30] },
             { id: 'B-2', side: 'BLUE', lat: 24.32, lon: 54.22, coord: [54.22, 24.32] }]);
    mountFresh();
    DEMO._setCoaPlanForTest({ ok: true, plan_source: 'llm', llm_called: true, llm_status: 'ok', _requestedVia: 'manual_generate', coas: [moveCoa(['B-1', 'B-2'])] });
    DEMO._setCoaSelectedIdxForTest(0);
    var ex = DEMO._commitCoaForTest(0);
    assert(ex === null, 'commit refused (returns null)');
    assert(DEMO._getCoaExecForTest() == null, 'no committed exec built');
    var reason = DEMO._getCommitBlockedReasonForTest();
    assert(reason && /B-1/.test(reason), 'commit-block reason names the non-taskable unit B-1');
    ok('AE 7 Commit refuses a COA that tasks a non-taskable Step-1 unit (B-1) with movement');
} catch (e) { bad('AE 7 commit refusal', e); }

// AE 8 — chokepoint suppresses placeholder movement + Run gate refuses (live re-check after data change)
try {
    setBlue([{ id: 'B-1', side: 'BLUE', source_required: true, lat: 24.30, lon: 54.20, coord: [54.20, 24.30] },
             { id: 'B-2', side: 'BLUE', lat: 24.32, lon: 54.22, coord: [54.22, 24.32] }]);
    mountFresh();
    // chokepoint: a COA tasking both — only B-2 (taskable) yields a move
    var moves = DEMO._resolveCoaMovesForTest(moveCoa(['B-1', 'B-2']));
    var movedIds = moves.map(function (m) { return String(m.uid); });
    assert(movedIds.indexOf('B-1') === -1, 'chokepoint: B-1 (Step-1) produces NO move');
    assert(movedIds.indexOf('B-2') !== -1, 'chokepoint: B-2 (taskable) produces a move');
    // Run gate: commit a valid COA on B-2, then make B-2 review-only → Run must refuse to execute it
    DEMO._setCoaPlanForTest({ ok: true, plan_source: 'llm', llm_called: true, llm_status: 'ok', _requestedVia: 'manual_generate',
        coas: [{ plan_id: 'COA-B2', side: 'BLUE', recommended: true, commander_intent: 'x', main_effort: 'x', supporting_effort: 'x', red_assumption: 'x', risk_mitigation: 'x',
            phases: [{ name: 'Move', actions: [{ unit_uid: 'B-2', action_type: 'MOVE', role: 'assault', target: { lat: 24.40, lon: 54.35 } }, { unit_uid: 'B-1', action_type: 'HOLD_POSITION', role: 'reserve' }] }] }] });
    DEMO._setCoaSelectedIdxForTest(0);
    var ex2 = DEMO._commitCoaForTest(0);
    assert(ex2 && ex2.active, 'commit succeeds for a B-2 movement / B-1 hold COA');
    // data changes: B-2 becomes review-only after commit
    global.window.RmoozScenario.scenario.blue_units_initial[1].source_required = true;
    DEMO._runCommittedCoaForTest();
    var rb = DEMO._getRunBlockedReasonForTest();
    assert(rb && /B-2/.test(rb), 'Run gate refuses: committed COA now tasks non-taskable B-2');
    ok('AE 8 chokepoint suppresses Step-1 movement + Run gate refuses a non-taskable committed COA');
} catch (e) { bad('AE 8 chokepoint + run gate', e); }

// AE 9 — one taskable + others blocked → only the taskable unit moves
try {
    setBlue([{ id: 'B-1', side: 'BLUE', source_required: true, lat: 24.30, lon: 54.20, coord: [54.20, 24.30] },
             { id: 'B-2', side: 'BLUE', exact_unit_position: false, lat: 24.31, lon: 54.21, coord: [54.21, 24.31] },
             { id: 'B-3', side: 'BLUE', lat: 24.32, lon: 54.22, coord: [54.22, 24.32] }]);
    mountFresh();
    var taskables = DEMO._taskableSideUnitsForTest('BLUE').map(function (u) { return String(u.id); });
    assert.deepStrictEqual(taskables, ['B-3'], 'only B-3 is taskable for Blue');
    var mv = DEMO._resolveCoaMovesForTest(moveCoa(['B-1', 'B-2', 'B-3'])).map(function (m) { return String(m.uid); });
    assert.deepStrictEqual(mv, ['B-3'], 'only B-3 moves; B-1 & B-2 held for review');
    ok('AE 9 mixed force: only the taskable unit moves, blocked units are held');
} catch (e) { bad('AE 9 mixed force', e); }

// AE 10 — the AD quality gate is still active after the Step-1 gate (all-to-center COA still replaced)
try {
    setBlue([{ id: 'B-1', side: 'BLUE', lat: 24.30, lon: 54.20, coord: [54.20, 24.30] },
             { id: 'B-2', side: 'BLUE', lat: 24.31, lon: 54.22, coord: [54.22, 24.31] },
             { id: 'B-3', side: 'BLUE', lat: 24.29, lon: 54.21, coord: [54.21, 24.29] }]);
    mountFresh();
    var center = { plan_id: 'COA-CENTER', title: 'All to objective', side: 'BLUE', recommended: true,
        phases: [{ name: 'Move', actions: [
            { unit_uid: 'B-1', action_type: 'MOVE', role: 'assault', target: { lat: OBJ.lat, lon: OBJ.lon } },
            { unit_uid: 'B-2', action_type: 'MOVE', role: 'assault', target: { lat: OBJ.lat, lon: OBJ.lon } },
            { unit_uid: 'B-3', action_type: 'MOVE', role: 'assault', target: { lat: OBJ.lat, lon: OBJ.lon } } ] }] };
    DEMO._setCoaPlanForTest({ ok: true, plan_source: 'llm', llm_called: true, llm_status: 'ok', _requestedVia: 'manual_generate', recommended_plan_id: 'COA-CENTER', validation: { ok: true }, coas: [center] });
    DEMO._setCoaSelectedIdxForTest(0);
    var exC = DEMO._commitCoaForTest(0);
    assert(exC && exC.selected_coa, 'commit produced an exec (all units taskable)');
    var committed = exC.selected_coa;
    var movesC = committed.phases.reduce(function (m, p) { return m.concat((p.actions || []).filter(function (a) { return a.action_type !== 'HOLD_POSITION' && a.target; })); }, []);
    var atCenter = movesC.filter(function (a) { return km({ lat: +a.target.lat, lon: +a.target.lon }, OBJ) < 0.6; }).length;
    assert.strictEqual(atCenter, 0, 'AD gate still replaced the all-to-center COA (0 at center after commit)');
    assert.strictEqual(committed.source_type, 'staff_safe_commander_template', 'committed COA is the Staff-Safe template');
    ok('AE 10 AD quality gate still active: all-to-center COA replaced by the Staff-Safe template after commit');
} catch (e) { bad('AE 10 AD gate still active', e); }

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
