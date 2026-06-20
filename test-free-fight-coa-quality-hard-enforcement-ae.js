/**
 * test-free-fight-coa-quality-hard-enforcement-ae.js — RMOOZ-COA-QUALITY-HARD-ENFORCEMENT-AE
 *
 * HARD enforcement on the ACTUAL committed/executed COA path (not just a display banner): a low-quality
 * COA must not be executable. Server deterministic builders + a server re-spread no longer emit
 * objective-center stacking; the client enforces quality at COMMIT (replaces with the Staff-Safe
 * commander template) and at RUN (blocks a stale center-stacking exec). selected == committed == executed
 * targets.
 *
 * Acceptance:
 *   SERVER 1  buildDeterministicCoas does NOT send all assault/recon moves to the exact objective center
 *   SERVER 2  the server re-spread converts a center-stacking COA into role-separated ring targets
 *   CLIENT 3  Commit cannot commit an all-to-center COA → committed COA becomes the Staff-Safe template
 *   CLIENT 4  Run Plan blocks a stale all-to-center committed exec (run-time gate)
 *   CLIENT 5  Run Scenario blocks a stale all-to-center committed exec
 *   CLIENT 6  selected target summary == committed target summary == executed (committed) target summary
 *   CLIENT 7  auto-director order commits role-separated targets (no exact-center)
 *   CLIENT 8  the convergence check rejects near-center clustering (not only exact center)
 */
'use strict';
var assert = require('assert');
var path = require('path');

// ── SERVER-SIDE checks (require the planner module directly) ──
var PLAN = require(path.join(__dirname, 'UI_MOdified/server/ai/free-fight-coa-planner.js'));
var sPass = 0, sFail = 0;
function sok(n) { sPass++; console.log('  ✓ ' + n); }
function sbad(n, e) { sFail++; console.log('  ✗ ' + n + (e ? (' — ' + (e && e.message || e)) : '')); }
function km(a, b) { var R = 6371, tr = Math.PI / 180; var dLat = (b.lat - a.lat) * tr, dLon = (b.lon - a.lon) * tr, la1 = a.lat * tr, la2 = b.lat * tr; var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) * Math.sin(dLon / 2); return 2 * R * Math.asin(Math.min(1, Math.sqrt(h))); }
function allMoves(coa) { var out = []; (coa.actions || (coa.phases || []).reduce(function (m, p) { return m.concat(p.actions || []); }, [])).forEach(function (a) { if (a && a.action_type !== 'HOLD_POSITION' && a.target && isFinite(+a.target.lat)) out.push(a); }); return out; }

var OBJ = { lat: 24.45, lon: 54.40, name: 'Objective X' };
var RED = [];
for (var n = 1; n <= 8; n++) RED.push({ id: 'R-' + n, side: 'RED', lat: 24.30 + n * 0.01, lon: 54.20 + n * 0.01 });

console.log('SERVER-SIDE COA quality:');
// SERVER 1
try {
    var coas = PLAN.buildDeterministicCoas(RED, OBJ);
    assert(coas.length >= 1, 'builder returns COAs');
    var offenders = coas.filter(function (coa) {
        var mv = allMoves(coa); if (mv.length < 2) return false;
        var center = mv.filter(function (m) { return km({ lat: +m.target.lat, lon: +m.target.lon }, OBJ) < 0.6; }).length;
        return center / mv.length > 0.5;   // >50% at exact center = offender
    });
    assert(offenders.length === 0, offenders.length + ' deterministic COA(s) still send >50% of moves to the exact center');
    sok('SERVER 1 deterministic builder produces NO objective-center-stacking COA');
} catch (e) { sbad('SERVER 1 deterministic builder', e); }

// SERVER 2 — re-spread turns a center-stacking COA into role-separated rings.
try {
    var bad = { plan_id: 'X', phases: [{ actions: [
        { unit_uid: 'A', role: 'assault', action_type: 'MOVE_TOWARD_OBJECTIVE', target: { lat: OBJ.lat, lon: OBJ.lon } },
        { unit_uid: 'B', role: 'assault', action_type: 'MOVE_TOWARD_OBJECTIVE', target: { lat: OBJ.lat, lon: OBJ.lon } },
        { unit_uid: 'C', role: 'support', action_type: 'MOVE_TOWARD_OBJECTIVE', target: { lat: OBJ.lat, lon: OBJ.lon } },
        { unit_uid: 'D', role: 'recon', action_type: 'MOVE_TOWARD_OBJECTIVE', target: { lat: OBJ.lat, lon: OBJ.lon } } ] }] };
    PLAN._spreadCenterClusteredCoasForTest([bad], OBJ);
    var mv2 = allMoves(bad);
    var centerNow = mv2.filter(function (m) { return km({ lat: +m.target.lat, lon: +m.target.lon }, OBJ) < 0.6; }).length;
    assert(centerNow === 0, 're-spread leaves NO move at the exact center');
    var sup = mv2.find(function (m) { return m.role === 'support'; }), rec = mv2.find(function (m) { return m.role === 'recon'; }), asl = mv2.find(function (m) { return m.role === 'assault'; });
    assert(km({ lat: +asl.target.lat, lon: +asl.target.lon }, OBJ) < km({ lat: +sup.target.lat, lon: +sup.target.lon }, OBJ), 'support stands off further than assault');
    assert(km({ lat: +rec.target.lat, lon: +rec.target.lon }, OBJ) > 4, 'recon to an observation point (>4km)');
    sok('SERVER 2 re-spread converts center-stacking → role-separated rings (assault<support, recon far)');
} catch (e) { sbad('SERVER 2 re-spread', e); }

// ── CLIENT-SIDE checks (DOM/window stub + the client module) ──
var elById = {};
function makeEl(t) { var el = { tagName: t, innerHTML: '', textContent: '', children: [], attrs: {}, style: {}, appendChild: function (e) { this.children.push(e); if (e && e.id) elById[e.id] = e; return e; }, removeChild: function (e) { var i = this.children.indexOf(e); if (i >= 0) this.children.splice(i, 1); return e; }, setAttribute: function (k, v) { this.attrs[k] = v; }, removeAttribute: function (k) { delete this.attrs[k]; }, addEventListener: function () {}, removeEventListener: function () {}, querySelector: function () { return null; }, querySelectorAll: function () { return []; }, getAttribute: function (k) { return this.attrs[k]; } }; Object.defineProperty(el, 'parentNode', { value: null, writable: true }); return el; }
var bodyEl = makeEl('body');
global.document = { body: bodyEl, head: makeEl('head'), createElement: makeEl, getElementById: function (id) { return elById[id] || null; }, querySelector: function () { return null; } };
var GREEN = { ok: true, collateral_risk: { band: 'low', score: 10 }, provenance: { engine: 'deterministic' }, deterministic: true };
global.window = { document: global.document, AppShellEventLog: { append: function () {} }, sessionStorage: (function () { var d = {}; return { getItem: function (k) { return d[k] || null; }, setItem: function (k, v) { d[k] = String(v); }, removeItem: function (k) { delete d[k]; } }; })(), setTimeout: function () { return 0; }, clearTimeout: function () {}, setInterval: function () { return 0; }, clearInterval: function () {}, fetch: function (u) { return Promise.resolve({ ok: true, status: 200, text: function () { return Promise.resolve(JSON.stringify(GREEN)); }, json: function () { return Promise.resolve(GREEN); } }); } };
global.window.window = global.window;
global.window.RmoozScenario = { scenario: { id: 'ae', obj: { name: 'Objective X', coord: [54.40, 24.45] },
    red_units: [{ id: 'R-1', side: 'RED', lat: 24.50, lon: 54.50, coord: [54.50, 24.50] }],
    blue_units_initial: [{ id: 'B-1', side: 'BLUE', lat: 24.30, lon: 54.20, coord: [54.20, 24.30] }, { id: 'B-2', side: 'BLUE', lat: 24.31, lon: 54.22, coord: [54.22, 24.31] }, { id: 'B-3', side: 'BLUE', lat: 24.29, lon: 54.21, coord: [54.21, 24.29] }] } };
var Cl = path.join(__dirname, 'UI_MOdified', 'client', 'shell');
require(path.join(Cl, 'world-state-db.js')); require(path.join(Cl, 'symbol-db.js')); require(path.join(Cl, 'symbol-registry.js')); require(path.join(Cl, 'free-fight-demo.js'));
var DEMO = global.window.RmoozFreeFightDemo;
DEMO.mount({ brief: { operational_brief: { proposed_units: global.window.RmoozScenario.scenario.blue_units_initial, objectives: [{ label: 'Objective X', lat: 24.45, lon: 54.40 }] } } });
DEMO._setRouteHealthForTest({ ok: true, allow_sim_run: true, model_available: true, provider: 'ollama', model: 'qwen3-coder:latest' });
if (DEMO.setObjective) DEMO.setObjective(OBJ);

function centerCoa() { return { plan_id: 'COA-CENTER', title: 'All to objective', side: 'BLUE', recommended: true,
    phases: [{ name: 'Move to objective', actions: [
        { unit_uid: 'B-1', action_type: 'MOVE', role: 'assault', target: { lat: OBJ.lat, lon: OBJ.lon } },
        { unit_uid: 'B-2', action_type: 'MOVE', role: 'assault', target: { lat: OBJ.lat, lon: OBJ.lon } },
        { unit_uid: 'B-3', action_type: 'MOVE', role: 'assault', target: { lat: OBJ.lat, lon: OBJ.lon } } ] }] }; }
function centerPlan() { return { ok: true, plan_source: 'llm', llm_called: true, llm_status: 'ok', _requestedVia: 'manual_generate', recommended_plan_id: 'COA-CENTER', validation: { ok: true }, coas: [centerCoa()] }; }

console.log('\nCLIENT-SIDE hard enforcement:');
// CLIENT 3 — Commit cannot commit an all-to-center COA.
try {
    DEMO._resetScenarioForTest(); DEMO._forgetCoaExecInMemoryForTest(); DEMO._resetCoaExecForTest();
    DEMO._setCoaPlanForTest(centerPlan()); DEMO._setCoaSelectedIdxForTest(0);
    var ex = DEMO._commitCoaForTest(0);
    var committed = ex.selected_coa;
    var mv = committed.phases.reduce(function (m, p) { return m.concat((p.actions || []).filter(function (a) { return a.action_type !== 'HOLD_POSITION' && a.target; })); }, []);
    var centerCnt = mv.filter(function (a) { return km({ lat: +a.target.lat, lon: +a.target.lon }, OBJ) < 0.6; }).length;
    assert(centerCnt === 0, 'committed COA has NO move at the exact center (was replaced)');
    assert(committed.source_type === 'staff_safe_commander_template', 'committed COA is the Staff-Safe template');
    assert(DEMO._getCoaPlanForTest().llm_status === 'blocked_low_quality_selected_coa', 'plan labelled blocked_low_quality_selected_coa');
    sok('CLIENT 3 Commit replaces an all-to-center COA with the Staff-Safe template (committed ≠ center)');
} catch (e) { sbad('CLIENT 3 commit enforcement', e); }

// CLIENT 4 — Run Plan blocks a STALE all-to-center committed exec (bypassing commit enforcement).
try {
    DEMO._resetScenarioForTest(); DEMO._forgetCoaExecInMemoryForTest(); DEMO._resetCoaExecForTest();
    // simulate a stale committed exec (e.g. restored from old sessionStorage) by committing a center COA
    // via the LEGACY path: build the exec object directly through commit, then forcibly set a center COA.
    DEMO._setCoaPlanForTest(centerPlan()); DEMO._setCoaSelectedIdxForTest(0); DEMO._commitCoaForTest(0);
    // now overwrite the committed exec's COA with a raw center COA to mimic a stale/pre-gate exec
    var exObj = DEMO._getCoaExecForTest(); exObj.selected_coa = centerCoa(); exObj.phase_status = 'pending';
    DEMO._runCommittedCoaForTest();
    assert(/not commander-quality/.test(DEMO._getRunBlockedReasonForTest() || ''), 'Run Plan blocked the stale center exec');
    assert(DEMO._getCoaExecForTest().ticks === 0, 'no tick executed on the blocked run');
    sok('CLIENT 4 Run Plan blocks a stale all-to-center committed exec');
} catch (e) { sbad('CLIENT 4 run plan block', e); }

// CLIENT 5 — Run Scenario blocks the same stale exec.
try {
    var exObj2 = DEMO._getCoaExecForTest(); exObj2.selected_coa = centerCoa(); exObj2.phase_status = 'pending'; exObj2.run_blocked_reason = null;
    DEMO._runScenarioForTest();
    assert(/not commander-quality/.test(DEMO._getRunBlockedReasonForTest() || ''), 'Run Scenario blocked the stale center exec');
    sok('CLIENT 5 Run Scenario blocks a stale all-to-center committed exec');
} catch (e) { sbad('CLIENT 5 run scenario block', e); }

// CLIENT 6 — selected == committed == executed target summary.
try {
    DEMO._resetScenarioForTest(); DEMO._forgetCoaExecInMemoryForTest(); DEMO._resetCoaExecForTest();
    DEMO._setCoaPlanForTest(centerPlan()); DEMO._setCoaSelectedIdxForTest(0);
    DEMO._commitCoaForTest(0);   // replaces with template in the plan
    var plan = DEMO._getCoaPlanForTest();
    var selSum = DEMO._coaTargetSummaryForTest(plan.coas[DEMO._getCoaSelectedIdxForTest()]);
    var comSum = DEMO._coaTargetSummaryForTest(DEMO._getCoaExecForTest().selected_coa);
    assert(selSum === comSum, 'selected target summary == committed/executed target summary');
    assert(!/:0km/.test(comSum) && !/assault:0/.test(comSum), 'no executed target at 0km (exact center)');
    sok('CLIENT 6 selected == committed == executed targets (' + comSum.slice(0, 50) + '…)');
} catch (e) { sbad('CLIENT 6 target summary match', e); }

// CLIENT 7 — auto-director commits role-separated targets.
try {
    DEMO._resetScenarioForTest(); DEMO._forgetCoaExecInMemoryForTest(); DEMO._resetCoaExecForTest();
    DEMO._autoDirectorNextBlueOrderForTest();
    var exA = DEMO._getCoaExecForTest();
    assert(!_coaHasCenterMajority(exA.selected_coa), 'auto-director committed COA has no center-majority');
    sok('CLIENT 7 auto-director order commits role-separated targets (no exact-center majority)');
} catch (e) { sbad('CLIENT 7 auto-director', e); }
function _coaHasCenterMajority(coa) { var mv = (coa.phases || []).reduce(function (m, p) { return m.concat((p.actions || []).filter(function (a) { return a.action_type !== 'HOLD_POSITION' && a.target; })); }, []); if (mv.length < 2) return false; var c = mv.filter(function (a) { return km({ lat: +a.target.lat, lon: +a.target.lon }, OBJ) < 0.6; }).length; return c / mv.length > 0.5; }

// CLIENT 8 — convergence check rejects near-center clustering (not only exact center).
try {
    var clustered = { plan_id: 'C', phases: [{ actions: [
        { unit_uid: 'B-1', action_type: 'MOVE', role: 'assault', target: { lat: OBJ.lat + 0.002, lon: OBJ.lon } },
        { unit_uid: 'B-2', action_type: 'MOVE', role: 'assault', target: { lat: OBJ.lat - 0.002, lon: OBJ.lon } },
        { unit_uid: 'B-3', action_type: 'MOVE', role: 'assault', target: { lat: OBJ.lat, lon: OBJ.lon + 0.002 } } ] }] };
    var reason = DEMO._coaHardBlockReasonForTest(clustered);
    assert(reason && /converge|center/.test(reason), 'near-center cluster blocked: ' + reason);
    sok('CLIENT 8 convergence check rejects near-center clustering (' + reason + ')');
} catch (e) { sbad('CLIENT 8 convergence', e); }

// CLIENT 9 — EXECUTED MOVEMENT: an all-to-center COA, after commit-enforcement + run, relocates the
// COA's OWN units to role-separated rings — none ends at the exact objective center.
try {
    global.window.RmoozScenario = { scenario: { id: 'ae', obj: { name: 'Objective X', coord: [54.40, 24.45] }, red_units: [{ id: 'R-1', side: 'RED', lat: 24.50, lon: 54.50, coord: [54.50, 24.50] }], blue_units_initial: [{ id: 'B-1', side: 'BLUE', lat: 24.47, lon: 54.42, coord: [54.42, 24.47] }, { id: 'B-2', side: 'BLUE', lat: 24.43, lon: 54.38, coord: [54.38, 24.43] }, { id: 'B-3', side: 'BLUE', lat: 24.46, lon: 54.39, coord: [54.39, 24.46] }] } };
    DEMO._resetScenarioForTest(); DEMO._forgetCoaExecInMemoryForTest(); DEMO._resetCoaExecForTest();
    DEMO._setCoaPlanForTest({ ok: true, plan_source: 'llm', _requestedVia: 'manual_generate', recommended_plan_id: 'COA-CENTER', validation: { ok: true },
        coas: [{ plan_id: 'COA-CENTER', side: 'BLUE', recommended: true, phases: [{ name: 'P', actions: [
            { unit_uid: 'B-1', action_type: 'MOVE', role: 'assault', target: OBJ }, { unit_uid: 'B-2', action_type: 'MOVE', role: 'assault', target: OBJ }, { unit_uid: 'B-3', action_type: 'MOVE', role: 'assault', target: OBJ }] }] }] });
    DEMO._setCoaSelectedIdxForTest(0);
    var ex9 = DEMO._commitCoaForTest(0);
    assert(ex9.selected_coa.source_type === 'staff_safe_commander_template', 'committed = template');
    var uids = {}; ex9.selected_coa.phases.forEach(function (p) { (p.actions || []).forEach(function (a) { uids[a.unit_uid] = 1; }); });
    assert(uids['B-1'] && uids['B-2'] && uids['B-3'], 'template commands the COA’s OWN blue units (B-1/B-2/B-3), not a wrong-side unit');
    DEMO._runCommittedCoaForTest();
    for (var t9 = 0; t9 < 25 && DEMO._getCoaExecForTest().phase_status !== 'complete'; t9++) DEMO._coaExecTickForTest();
    var blue = global.window.RmoozScenario.scenario.blue_units_initial;
    var atCenter = blue.filter(function (u) { return km({ lat: u.lat, lon: u.lon }, OBJ) < 0.6; }).length;
    var distinct = new Set(blue.map(function (u) { return u.lat.toFixed(4) + ',' + u.lon.toFixed(4); })).size;
    var moved = blue.filter(function (u) { return km({ lat: u.lat, lon: u.lon }, { lat: u.coord[1], lon: u.coord[0] }) >= 0; }).length;
    assert(atCenter === 0, 'NO unit ended at the exact objective center (got ' + atCenter + ')');
    assert(distinct === blue.length, 'units ended at DISTINCT positions (' + distinct + '/' + blue.length + ')');
    var dists = blue.map(function (u) { return Math.round(km({ lat: u.lat, lon: u.lon }, OBJ) * 10) / 10; });
    assert(new Set(dists).size >= 2, 'role-separated ring distances (' + dists.join('/') + 'km)');
    sok('CLIENT 9 EXECUTED movement → role rings ' + dists.join('/') + 'km, 0 at center (not all-to-center)');
} catch (e) { sbad('CLIENT 9 executed movement', e); }

console.log('\n' + ((sFail === 0) ? '✅ ' : '❌ ') + sPass + ' passed, ' + sFail + ' failed (test-free-fight-coa-quality-hard-enforcement-ae.js)');
process.exit(sFail === 0 ? 0 : 1);
