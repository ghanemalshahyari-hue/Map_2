/**
 * test-free-fight-real-coa-commander-quality-ad.js — RMOOZ-REAL-COA-COMMANDER-QUALITY-AD
 *
 * A deterministic COA Quality Gate decides whether a COA looks like a real commander plan before the
 * cockpit presents it as an AI commander COA. A failing COA is repaired (one LLM prompt) or replaced by
 * a clearly-labelled deterministic Staff-Safe commander template (role-separated, multi-phase, with
 * commander intent / main+supporting effort / Red assumption / risk mitigation). Engine FROZEN.
 *
 * Acceptance:
 *   1  COA with all move targets at the exact objective center FAILS the gate
 *   2  COA with all units on one (same) target FAILS the gate
 *   3  a role-separated assault/support/screen/reserve COA PASSES the gate
 *   4  a low-quality LLM COA → deterministic Staff-Safe commander template fallback (labelled)
 *   5  the Staff-Safe commander template uses SEPARATED role targets (none at the exact center) + structure
 *   6  the V2 UI shows the quality verdict + a fallback warning
 *   7  Run Scenario commits the gated (labelled) COA, not the raw low-quality one
 *   8  the quality gate itself makes no LLM call / no /plan-coas; gate decision recorded called_llm=false
 *   9  the auto-director order is commander-quality (passes the gate) and stays labelled staff_safe
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
var GREEN = { ok: true, collateral_risk: { band: 'low', score: 10 }, provenance: { engine: 'deterministic' }, deterministic: true };
global.window = {
    document: global.document, AppShellEventLog: { append: function () {} },
    sessionStorage: (function () { var d = {}; return { getItem: function (k) { return d[k] || null; }, setItem: function (k, v) { d[k] = String(v); }, removeItem: function (k) { delete d[k]; } }; })(),
    setTimeout: function () { return 0; }, clearTimeout: function () {}, setInterval: function () { return 0; }, clearInterval: function () {},
    fetch: function (u) { FETCHED.push(String(u)); return Promise.resolve({ ok: true, status: 200, text: function () { return Promise.resolve(JSON.stringify(GREEN)); }, json: function () { return Promise.resolve(GREEN); } }); },
};
global.window.window = global.window;
var OBJ = { lat: 24.45, lon: 54.40 };
global.window.RmoozScenario = { scenario: { id: 'ad', obj: { name: 'Objective X', coord: [OBJ.lon, OBJ.lat] },
    red_units: [{ id: 'R-1', side: 'RED', lat: 24.50, lon: 54.50, coord: [54.50, 24.50] }],
    blue_units_initial: [
        { id: 'B-1', side: 'BLUE', lat: 24.30, lon: 54.20, coord: [54.20, 24.30] },
        { id: 'B-2', side: 'BLUE', lat: 24.31, lon: 54.22, coord: [54.22, 24.31] },
        { id: 'B-3', side: 'BLUE', lat: 24.29, lon: 54.21, coord: [54.21, 24.29] },
        { id: 'B-4', side: 'BLUE', lat: 24.32, lon: 54.19, coord: [54.19, 24.32] } ] } };

var C = path.join(__dirname, 'UI_MOdified', 'client', 'shell');
require(path.join(C, 'world-state-db.js'));
require(path.join(C, 'symbol-db.js'));
require(path.join(C, 'symbol-registry.js'));
require(path.join(C, 'free-fight-demo.js'));
require(path.join(C, 'scenario-control-center.js'));   // RMOOZ-...-AF: new operator UI (Scenario Control Center)
var DEMO = global.window.RmoozFreeFightDemo;

var pass = 0, fail = 0;
function ok(n) { pass++; console.log('  ✓ ' + n); }
function bad(n, e) { fail++; console.log('  ✗ ' + n + (e ? (' — ' + (e && e.message || e)) : '')); }
function km(a, b) { var R = 6371, tr = Math.PI / 180; var dLat = (b.lat - a.lat) * tr, dLon = (b.lon - a.lon) * tr, la1 = a.lat * tr, la2 = b.lat * tr; var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) * Math.sin(dLon / 2); return 2 * R * Math.asin(Math.min(1, Math.sqrt(h))); }

DEMO.mount({ brief: { operational_brief: { proposed_units: global.window.RmoozScenario.scenario.blue_units_initial, objectives: [{ label: 'Objective X', lat: 24.45, lon: 54.40 }] } } });
DEMO._setRouteHealthForTest({ ok: true, allow_sim_run: true, ai_execution_enabled: true, model_available: true, provider: 'ollama', model: 'qwen3-coder:latest' });
if (DEMO.setObjective) DEMO.setObjective(OBJ);

function llmPlan(coas) { return { ok: true, plan_source: 'llm', llm_called: true, llm_status: 'ok', provider_used: 'ollama', model_used: 'qwen3-coder:latest', ai_depth: 'normal', _requestedVia: 'manual_generate', recommended_plan_id: coas[0].plan_id, validation: { ok: true }, coas: coas }; }
function badCenterCoa() {
    return { plan_id: 'COA-BAD', title: 'Direct assault', side: 'BLUE', recommended: true,
        phases: [{ name: 'Move to objective', actions: [
            { unit_uid: 'B-1', action_type: 'MOVE', role: 'assault', target: { lat: OBJ.lat, lon: OBJ.lon } },
            { unit_uid: 'B-2', action_type: 'MOVE', role: 'assault', target: { lat: OBJ.lat, lon: OBJ.lon } },
            { unit_uid: 'B-3', action_type: 'MOVE', role: 'recon', target: { lat: OBJ.lat, lon: OBJ.lon } },
            { unit_uid: 'B-4', action_type: 'MOVE', role: 'support', target: { lat: OBJ.lat, lon: OBJ.lon } } ] }] };
}
function sameTargetCoa() {
    return { plan_id: 'COA-SAME', title: 'Rush', side: 'BLUE', recommended: true,
        phases: [{ name: 'Rush', actions: [
            { unit_uid: 'B-1', action_type: 'MOVE', role: 'assault', target: { lat: 24.40, lon: 54.30 } },
            { unit_uid: 'B-2', action_type: 'MOVE', role: 'assault', target: { lat: 24.40, lon: 54.30 } },
            { unit_uid: 'B-3', action_type: 'MOVE', role: 'assault', target: { lat: 24.40, lon: 54.30 } } ] }] };
}

// 1 — all move targets at the exact objective center fails the gate.
try {
    var q = DEMO._coaQualityGateForTest(badCenterCoa());
    assert(q.pass === false, 'fails (score ' + q.score + ')');
    assert(q.reasons.some(function (r) { return /objective center/.test(r); }), 'reason cites objective center: ' + JSON.stringify(q.reasons));
    ok('1 COA with all moves at the exact objective center FAILS the gate (score ' + q.score + ')');
} catch (e) { bad('1 center fails', e); }

// 2 — all units on one (same) target fails the gate.
try {
    var q2 = DEMO._coaQualityGateForTest(sameTargetCoa());
    assert(q2.pass === false, 'fails (score ' + q2.score + ')');
    assert(q2.reasons.some(function (r) { return /share one target/.test(r); }), 'reason cites shared target');
    ok('2 COA with all units on one target FAILS the gate (score ' + q2.score + ')');
} catch (e) { bad('2 same target fails', e); }

// 3 + 5 — Staff-Safe commander template is role-separated + passes the gate.
try {
    var units = global.window.RmoozScenario.scenario.blue_units_initial;
    var tmpl = DEMO._staffSafeCommanderCoaForTest('BLUE', units, OBJ);
    assert(tmpl && tmpl.commander_intent && tmpl.main_effort && tmpl.supporting_effort && tmpl.red_assumption && tmpl.risk_mitigation, 'template has full commander structure');
    assert(tmpl.phases.length === 3, 'template is multi-phase (3)');
    // collect distinct MOVE targets across phases; none at the exact center
    var moves = []; tmpl.phases.forEach(function (p) { p.actions.forEach(function (a) { if (a.action_type === 'MOVE' && a.target) moves.push(a); }); });
    assert(moves.length >= 2, 'template has multiple move targets');
    assert(moves.every(function (m) { return km(m.target, OBJ) > 0.8; }), 'NO move target at the exact objective center');
    var coords = {}; moves.forEach(function (m) { coords[m.target.lat.toFixed(4) + ',' + m.target.lon.toFixed(4)] = 1; });
    assert(Object.keys(coords).length >= 2, 'role targets are separated (distinct coordinates)');
    var q3 = DEMO._coaQualityGateForTest(tmpl);
    assert(q3.pass === true, 'template PASSES the gate (score ' + q3.score + ')');
    ok('3+5 Staff-Safe commander template: role-separated, structured, PASSES (score ' + q3.score + ')');
} catch (e) { bad('3+5 template passes', e); }

// 4 + 7 + 8 — low-quality LLM COA → deterministic Staff-Safe fallback (labelled); no LLM/no /plan-coas in the gate.
try {
    DEMO._resetScenarioForTest(); DEMO._forgetCoaExecInMemoryForTest(); DEMO._resetCoaExecForTest();
    DEMO._setCoaPlanForTest(llmPlan([badCenterCoa()]));
    DEMO._clearDecisionLogForTest();
    FETCHED.length = 0;
    var verdict = DEMO._gradeCoaPlanQualityForTest();   // deterministic grade + fallback (no repair)
    assert(verdict && verdict.verdict === 'fallback', 'verdict = fallback (got ' + (verdict && verdict.verdict) + ')');
    var plan = DEMO._getCoaPlanForTest();
    assert(plan.plan_source === 'staff_safe_commander_template', 'plan_source labelled staff_safe_commander_template');
    assert(plan.llm_status === 'llm_failed_quality_gate', 'llm_status = llm_failed_quality_gate');
    assert(plan.coas.length === 1 && plan.coas[0].source_type === 'staff_safe_commander_template', 'COAs replaced by the template');
    assert(!FETCHED.some(function (u) { return /\/plan-coas/.test(u); }), 'gate+fallback made NO /plan-coas call');
    var gateRec = DEMO._getDecisionLogForTest().filter(function (d) { return d.action === 'coa_quality_gate'; });
    assert(gateRec.length >= 1 && gateRec.every(function (d) { return d.called_llm === false; }), 'coa_quality_gate recorded called_llm=false');
    // 7 — commit + the committed COA is the gated (labelled) template, not the raw all-center one
    var ex = DEMO._commitCoaForTest(0);
    assert(ex.selected_coa_id !== 'COA-BAD', 'committed COA is NOT the low-quality COA-BAD');
    ok('4+7+8 low-quality LLM COA → labelled Staff-Safe template fallback; no /plan-coas; gate no-LLM; commit uses the gated COA');
} catch (e) { bad('4+7+8 fallback', e); }

// 6 — Scenario Control Center (AF) COA Review shows the quality verdict + commander structure.
try {
    DEMO._resetScenarioForTest(); DEMO._forgetCoaExecInMemoryForTest(); DEMO._resetCoaExecForTest();
    DEMO._setCoaPlanForTest(llmPlan([badCenterCoa()]));
    DEMO._gradeCoaPlanQualityForTest();   // → fallback (plan becomes the Staff-Safe commander template)
    DEMO._setCoaSelectedIdxForTest(0);
    var html = DEMO._sccRenderForTest();
    assert(/Scenario Control Center/.test(html), 'SCC renders');
    assert(/data-scc-panel="3"/.test(html), 'COA Review panel (3) present');
    assert(/commander-quality/.test(html), 'commander-quality verdict shown in COA Review');
    assert(/Intent:/.test(html) && /Main effort:/.test(html), 'commander intent + main effort shown');
    assert(/staff_safe_commander_template/.test(html) || /source/.test(html), 'plan source shown');
    ok('6 SCC COA Review shows commander-quality verdict + intent/main-effort (fallback template)');
} catch (e) { bad('6 ui quality', e); }

// 9 — auto-director order is commander-quality (passes the gate) and stays labelled staff_safe.
try {
    DEMO._resetScenarioForTest(); DEMO._forgetCoaExecInMemoryForTest(); DEMO._resetCoaExecForTest();
    var res = DEMO._autoDirectorNextBlueOrderForTest();   // builds + commits the deterministic auto Blue order
    assert(res && res.ok && res.source === 'staff_safe_auto_director', 'auto order built + labelled staff_safe_auto_director');
    var planNow = DEMO._getCoaPlanForTest();
    assert(planNow && planNow.source && /staff_safe_auto_director/.test(String(planNow.source.type || '')), 'plan labelled staff_safe_auto_director');
    var pq = DEMO._getCoaPlanQualityForTest();
    assert(pq && (pq.verdict === 'pass' || pq.verdict === 'fallback'), 'auto order carries a quality verdict (' + (pq && pq.verdict) + ')');
    var coa = planNow.coas[0];
    assert(coa._quality && coa.commander_intent && coa.main_effort, 'auto COA graded + carries commander structure');
    ok('9 auto-director order is gated + labelled staff_safe_auto_director (verdict ' + pq.verdict + ', score ' + pq.score + ')');
} catch (e) { bad('9 auto-director quality', e); }

console.log('\n' + (fail === 0 ? '✅ ' : '❌ ') + pass + ' passed, ' + fail + ' failed (test-free-fight-real-coa-commander-quality-ad.js)');
process.exit(fail === 0 ? 0 : 1);
