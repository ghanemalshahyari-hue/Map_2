/**
 * test-ai-scheduler-decision-log-s.js — RMOOZ-AI-SCHEDULER-DECISION-LOG-S
 *
 * Audit/transparency only: an in-memory Blue/Red/Green/White/performance/unit-controller decision log.
 * It records what the scheduler did — it must NEVER call the LLM, add model calls, change behaviour,
 * or introduce /plan-coas calls.
 *
 * Acceptance:
 *  1 Blue Deep Plan records role=blue, called_llm=true when AI was used (+ performance + white-validate)
 *  2 a deterministic/RED plan records role=red, called_llm=false
 *  3 Green refresh records role=green, called_llm=false (real /neutral-world path, no /plan-coas)
 *  4 White replan trigger records role=white, called_llm=false
 *  5 a normal committed COA tick records role=unit-controller, called_llm=false
 *  6 the decision log renders in Advanced diagnostics (badges + LLM flag + Clear button)
 *  7 Clear decision log empties it
 *  8 no /plan-coas call is introduced by recording / green refresh / a normal tick
 */
'use strict';
var assert = require('assert');
var path = require('path');

var elById = {};
function makeEl(t) { return { tagName: t, id: '', innerHTML: '', textContent: '', children: [], attrs: {}, style: {},
    appendChild: function (e) { this.children.push(e); if (e && e.id) elById[e.id] = e; return e; }, removeChild: function () {},
    setAttribute: function (k, v) { this.attrs[k] = v; }, removeAttribute: function () {}, addEventListener: function () {},
    querySelector: function () { return null; }, querySelectorAll: function () { return []; }, getAttribute: function (k) { return this.attrs[k]; } }; }
global.document = { body: makeEl('body'), head: makeEl('head'), createElement: makeEl, getElementById: function (id) { return elById[id] || null; }, querySelector: function () { return null; }, dispatchEvent: function () {} };
global.CustomEvent = function (n, o) { this.type = n; this.detail = o && o.detail; };

var fetchCalls = [];
function resp(o) { var s = JSON.stringify(o); return Promise.resolve({ ok: true, status: 200, text: function () { return Promise.resolve(s); }, json: function () { return Promise.resolve(o); } }); }
var GREEN = { ok: true, population_band: 'high', collateral_risk: { band: 'high', score: 83, drivers: ['x'] }, road_status: { status: 'constrained', basis: 'choke' }, infra_status: { note: 'urban', provenance: 'inferred_terrain_class' }, host_nation: 'Atropia', neutral_reaction_score: 85, notes: ['n'], provenance: { engine: 'deterministic' }, deterministic: true, llm_used: false };
global.window = { document: global.document, AppShellEventLog: { append: function () {} },
    sessionStorage: (function () { var d = {}; return { getItem: function (k) { return d[k] || null; }, setItem: function (k, v) { d[k] = String(v); }, removeItem: function (k) { delete d[k]; } }; })(),
    setTimeout: function (fn) { return setTimeout(fn, 0); }, clearTimeout: function (id) { clearTimeout(id); }, setInterval: function () { return 0; }, clearInterval: function () {},
    fetch: function (url, opts) { fetchCalls.push({ url: String(url), opts: opts }); return /neutral-world/.test(String(url)) ? resp(GREEN) : resp({ ok: false }); } };
global.window.window = global.window;

var CL = path.join(__dirname, 'UI_MOdified', 'client', 'shell');
require(path.join(CL, 'world-state-db.js')); require(path.join(CL, 'symbol-db.js')); require(path.join(CL, 'symbol-registry.js')); require(path.join(CL, 'free-fight-demo.js'));
var DEMO = global.window.RmoozFreeFightDemo;

var pass = 0, fail = 0;
function ok(n) { pass++; console.log('  ✓ ' + n); }
function bad(n, e) { fail++; console.log('  ✗ ' + n + (e ? (' — ' + (e && e.message || e)) : '')); }
function flush() { return new Promise(function (r) { setTimeout(r, 5); }); }
function log() { return DEMO._getDecisionLogForTest(); }
function byRole(role) { return log().filter(function (d) { return d.role === role; }); }
function noPlanCoas() { return !fetchCalls.some(function (c) { return /plan-coas/.test(c.url); }); }
function scenario() { global.window.RmoozScenario = { scenario: { red_units: [{ id: 'R-1', side: 'RED', lat: 24.451, lon: 54.401 }, { id: 'R-2', side: 'RED', lat: 24.452, lon: 54.402 }], blue_units_initial: [{ id: 'B-1', side: 'BLUE', lat: 24.6, lon: 54.6 }], obj: { name: 'Objective X', coord: [54.40, 24.45] } } }; }
function movePlan(far) { return { ok: true, plan_source: 'llm', recommended_plan_id: 'COA-1', coas: [{ plan_id: 'COA-1', recommended: true, side: 'RED', phases: [{ actions: [{ unit_uid: 'R-1', action_type: 'MOVE', target: far ? { lat: 30, lon: 60 } : { lat: 24.4505, lon: 54.4005 } }] }] }] }; }

(async function () {
    scenario();
    DEMO.mount({ brief: { operational_brief: { proposed_units: [], objectives: [{ label: 'Objective X', lat: 24.45, lon: 54.40 }] } } });
    DEMO.setObjective({ lat: 24.45, lon: 54.40 });

    // 1 — Blue Deep Plan with AI → role=blue called_llm=true (+ performance + white-validate).
    try {
        DEMO._clearDecisionLogForTest();
        DEMO._recordPlanDecisionForTest({ ok: true, _requestedVia: 'manual_generate', active_side: 'BLUE', plan_source: 'llm', llm_called: true, llm_status: 'ok', provider_used: 'ollama', model_used: 'qwen3-coder:latest', coas: [{ plan_id: 'COA-1', side: 'BLUE' }], validation: { ok: true } }, 1234);
        var blue = byRole('blue')[0];
        assert(blue && blue.called_llm === true, 'blue plan called_llm=true');
        assert(blue.provider === 'ollama' && blue.model === 'qwen3-coder:latest' && blue.duration_ms === 1234, 'provider/model/duration captured');
        assert(byRole('performance').length === 1, 'performance-governor decision recorded');
        assert(byRole('white').length === 1 && byRole('white')[0].called_llm === false, 'white validate recorded, no LLM');
        ok('Blue Deep Plan records role=blue called_llm=true (+ performance + white-validate)');
    } catch (e) { bad('blue deep plan', e); }

    // 2 — deterministic RED plan → role=red called_llm=false.
    try {
        DEMO._clearDecisionLogForTest();
        DEMO._recordPlanDecisionForTest({ ok: true, _requestedVia: 'manual_generate', active_side: 'RED', plan_source: 'deterministic_diverse_coa', llm_called: false, coas: [{ plan_id: 'COA-1', side: 'RED' }] }, 12);
        var red = byRole('red')[0];
        assert(red && red.called_llm === false, 'red deterministic plan called_llm=false');
        ok('deterministic RED plan records role=red called_llm=false');
    } catch (e) { bad('red plan', e); }

    // 3 — Green refresh → role=green called_llm=false (real path, no /plan-coas).
    try {
        DEMO._clearDecisionLogForTest(); fetchCalls.length = 0;
        await DEMO._refreshGreenWorldForTest('manual'); await flush();
        var green = byRole('green')[0];
        assert(green && green.called_llm === false && green.action === 'neutral_world_refresh', 'green refresh recorded, no LLM');
        assert(typeof green.duration_ms === 'number', 'green duration captured');
        assert(noPlanCoas(), 'green refresh introduced no /plan-coas');
        ok('Green refresh records role=green called_llm=false (no /plan-coas)');
    } catch (e) { bad('green record', e); }

    // 4 — White replan trigger → role=white called_llm=false (real trigger path).
    try {
        DEMO._resetCoaExecForTest(); scenario(); DEMO._setCoaPlanForTest(movePlan(true)); DEMO._commitCoaForTest(0); await flush();
        DEMO._clearDecisionLogForTest(); fetchCalls.length = 0;
        global.window.RmoozScenario.scenario.red_units = global.window.RmoozScenario.scenario.red_units.filter(function (u) { return u.id !== 'R-1'; }); // assigned unit vanishes → trigger
        DEMO._coaExecTickForTest(); await flush();
        var white = byRole('white').filter(function (d) { return d.action === 'replan_trigger'; })[0];
        assert(white && white.called_llm === false, 'white replan_trigger recorded, no LLM');
        assert(noPlanCoas(), 'replan-trigger tick introduced no /plan-coas');
        ok('White replan trigger records role=white called_llm=false');
    } catch (e) { bad('white trigger', e); }

    // 5 — normal committed tick → role=unit-controller called_llm=false.
    try {
        DEMO._resetCoaExecForTest(); scenario(); DEMO._setCoaPlanForTest(movePlan(true)); DEMO._commitCoaForTest(0); await flush();
        DEMO._clearDecisionLogForTest(); fetchCalls.length = 0;
        var t = DEMO._coaExecTickForTest(); await flush();   // MOVE far → executes, does not advance
        var uc = byRole('unit-controller')[0];
        assert(uc && uc.called_llm === false && uc.action === 'execute_phase_tick', 'unit-controller tick recorded, no LLM');
        assert(t.llm_called_this_tick === false, 'tick still llm_called_this_tick=false');
        assert(noPlanCoas(), 'normal tick introduced no /plan-coas');
        ok('normal committed tick records role=unit-controller called_llm=false');
    } catch (e) { bad('unit-controller tick', e); }

    // 6 — renders in Advanced diagnostics (badges + LLM flag + Clear).
    try {
        DEMO._clearDecisionLogForTest();
        DEMO._recordDecisionForTest({ role: 'green', action: 'neutral_world_refresh', called_llm: false, duration_ms: 5, reason: 'manual' });
        var html = DEMO._decisionLogHtmlForTest();
        assert(/data-ff-sched="panel"/.test(html) && /Scheduler decision log/.test(html), 'decision-log panel renders');
        assert(/data-act="decision-log-clear"/.test(html) && /Clear decision log/.test(html), 'Clear button present');
        assert(/no-LLM/.test(html) && /neutral_world_refresh/.test(html) && />green</.test(html), 'row shows role badge + no-LLM + action');
        var adv = DEMO._advancedDiagnosticsHtmlForTest();
        assert(/data-ff-sched="panel"/.test(adv), 'decision log is inside Advanced diagnostics');
        ok('decision log renders in Advanced diagnostics (badges + LLM flag + Clear)');
    } catch (e) { bad('render', e); }

    // 7 — Clear empties it.
    try {
        DEMO._recordDecisionForTest({ role: 'white', action: 'validate_coa', called_llm: false });
        assert(log().length > 0, 'log has entries');
        DEMO._clearDecisionLogForTest();
        assert(log().length === 0, 'Clear emptied the log');
        ok('Clear decision log empties it');
    } catch (e) { bad('clear', e); }

    console.log('\n' + (fail === 0 ? '✅ ' : '❌ ') + pass + ' passed, ' + fail + ' failed (test-ai-scheduler-decision-log-s.js)');
    process.exit(fail === 0 ? 0 : 1);
})().catch(function (e) { console.error('FATAL', e); process.exit(1); });
