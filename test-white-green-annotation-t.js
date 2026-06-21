/**
 * test-white-green-annotation-t.js — RMOOZ-WHITE-GREEN-ANNOTATION-T
 *
 * White (referee) reads Green and produces a DETERMINISTIC, ADVISORY adjudication annotation — never a
 * gate. The validator stays structure/physics-only; the advisory never blocks/pauses execution and
 * never calls the LLM. It is surfaced in the Green panel + recorded as a White decision (on level change).
 *
 * Acceptance:
 *  1 deterministic mapping: high→restricted, medium→caution, low→clear; gate ALWAYS false; null→null
 *  2 worst-of-collateral-and-neutral-reaction (low collateral + high reaction → restricted)
 *  3 Green panel shows the White advisory line + "advisory only / not a block / validator unchanged"
 *  4 on Green refresh with a committed COA → a White adjudication_advisory decision (role=white, no LLM)
 *  5 dedup: no second record when the level is unchanged; records again when the level changes
 *  6 the advisory NEVER gates — committed COA is not paused/blocked, tick still llm_called_this_tick=false
 *  7 no /plan-coas and no LLM are introduced
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
var _green = null;   // mutable stub Green payload
function resp(o) { var s = JSON.stringify(o); return Promise.resolve({ ok: true, status: 200, text: function () { return Promise.resolve(s); }, json: function () { return Promise.resolve(o); } }); }
function mkGreen(band, score, reaction) { return { ok: true, collateral_risk: { band: band, score: score, drivers: ['x'] }, road_status: { status: 'constrained', basis: 'choke' }, infra_status: { note: 'urban' }, host_nation: 'Atropia', neutral_reaction_score: reaction, notes: ['n'], provenance: { engine: 'deterministic' }, deterministic: true, llm_used: false }; }
global.window = { document: global.document, AppShellEventLog: { append: function (o) { _eventLog.push(o && o.message != null ? o.message : ''); } },
    sessionStorage: (function () { var d = {}; return { getItem: function (k) { return d[k] || null; }, setItem: function (k, v) { d[k] = String(v); }, removeItem: function (k) { delete d[k]; } }; })(),
    setTimeout: function (fn) { return setTimeout(fn, 0); }, clearTimeout: function (id) { clearTimeout(id); }, setInterval: function () { return 0; }, clearInterval: function () {},
    fetch: function (url, opts) { fetchCalls.push({ url: String(url), opts: opts }); return /neutral-world/.test(String(url)) ? resp(_green || mkGreen('high', 83, 85)) : resp({ ok: false }); } };
global.window.window = global.window;
var _eventLog = [];

var CL = path.join(__dirname, 'UI_MOdified', 'client', 'shell');
require(path.join(CL, 'world-state-db.js')); require(path.join(CL, 'symbol-db.js')); require(path.join(CL, 'symbol-registry.js')); require(path.join(CL, 'free-fight-demo.js'));
var DEMO = global.window.RmoozFreeFightDemo;

var pass = 0, fail = 0;
function ok(n) { pass++; console.log('  ✓ ' + n); }
function bad(n, e) { fail++; console.log('  ✗ ' + n + (e ? (' — ' + (e && e.message || e)) : '')); }
function flush() { return new Promise(function (r) { setTimeout(r, 5); }); }
function whiteAdvRecords() { return DEMO._getDecisionLogForTest().filter(function (d) { return d.role === 'white' && d.action === 'adjudication_advisory'; }); }
function noPlanCoas() { return !fetchCalls.some(function (c) { return /plan-coas|chat\/completions|api\/ai\/(generate|model)/.test(c.url); }); }
function scenario() { global.window.RmoozScenario = { scenario: { red_units: [{ id: 'R-1', side: 'RED', lat: 24.451, lon: 54.401 }, { id: 'R-2', side: 'RED', lat: 24.452, lon: 54.402 }], blue_units_initial: [{ id: 'B-1', side: 'BLUE', lat: 24.6, lon: 54.6 }], obj: { name: 'Objective X', coord: [54.40, 24.45] } } }; }
function moveFarPlan() { return { ok: true, plan_source: 'llm', recommended_plan_id: 'COA-1', coas: [{ plan_id: 'COA-1', recommended: true, side: 'RED', phases: [{ actions: [{ unit_uid: 'R-1', action_type: 'MOVE', target: { lat: 30, lon: 60 } }] }] }] }; }

(async function () {
    scenario();
    DEMO.mount({ brief: { operational_brief: { proposed_units: [], objectives: [{ label: 'Objective X', lat: 24.45, lon: 54.40 }] } } });
    DEMO.setObjective({ lat: 24.45, lon: 54.40 });

    // 1 — deterministic mapping + gate always false + null-safe.
    try {
        assert(DEMO._whiteAdvisoryForTest(mkGreen('high', 83, 85)).advisory_level === 'restricted', 'high → restricted');
        assert(DEMO._whiteAdvisoryForTest(mkGreen('medium', 45, 20)).advisory_level === 'caution', 'medium → caution');
        assert(DEMO._whiteAdvisoryForTest(mkGreen('low', 15, 10)).advisory_level === 'clear', 'low → clear');
        ['high', 'medium', 'low'].forEach(function (b) { assert(DEMO._whiteAdvisoryForTest(mkGreen(b, 50, 50)).gate === false, 'gate always false (' + b + ')'); });
        assert(DEMO._whiteAdvisoryForTest(null) === null, 'null green → null advisory');
        ok('deterministic mapping (high/med/low) + gate always false + null-safe');
    } catch (e) { bad('mapping', e); }

    // 2 — worst-of collateral + neutral reaction.
    try {
        assert(DEMO._whiteAdvisoryForTest(mkGreen('low', 15, 85)).advisory_level === 'restricted', 'low collateral + high reaction → restricted');
        assert(DEMO._whiteAdvisoryForTest(mkGreen('high', 83, 5)).advisory_level === 'restricted', 'high collateral + low reaction → restricted');
        ok('advisory = worst of collateral band and neutral-reaction band');
    } catch (e) { bad('worst-of', e); }

    // 3 — White advisory computed by the ENGINE (RMOOZ-...-AG: the old Green-panel HTML render was physically
    // deleted; the advisory now surfaces in the Scenario Control Center. Assert the engine advisory + gate).
    try {
        var adv = DEMO._whiteAdvisoryForTest(mkGreen('high', 83, 85));
        assert(adv && adv.advisory_level === 'restricted', 'engine advisory_level = restricted for high risk');
        assert(adv.gate === false, 'advisory only — never a block (gate=false, validator unchanged)');
        ok('White advisory computed by the engine, advisory-only (old Green panel UI retired by AG)');
    } catch (e) { bad('white advisory engine', e); }

    // 4 + 6 — committed COA refresh records a White advisory (no LLM) and never gates.
    try {
        _green = mkGreen('high', 83, 85);
        DEMO._resetCoaExecForTest(); scenario(); DEMO._setCoaPlanForTest(moveFarPlan());
        DEMO._clearDecisionLogForTest(); fetchCalls.length = 0;
        DEMO._commitCoaForTest(0); await flush(); await flush();   // commit → after_commit Green refresh → advisory
        var recs = whiteAdvRecords();
        assert(recs.length === 1 && recs[0].called_llm === false, 'one White adjudication_advisory recorded, no LLM');
        var ex = DEMO._getCoaExecForTest();
        assert(ex && ex.active && ex.replan_required !== true && ex.paused !== true && ex.phase_status !== 'blocked', 'advisory did NOT gate/pause/block the committed COA');
        assert(noPlanCoas(), 'no /plan-coas or LLM introduced by the advisory');
        ok('committed COA refresh records a White advisory (no LLM) and never gates execution');
    } catch (e) { bad('committed advisory + no-gate', e); }

    // 5 — dedup on unchanged level; new record on level change. Also a normal tick stays no-LLM.
    try {
        var t = DEMO._coaExecTickForTest(); await flush();   // MOVE far → executes, no advance; same Green level
        assert(t.llm_called_this_tick === false, 'normal tick still llm_called_this_tick=false');
        assert(whiteAdvRecords().length === 1, 'no duplicate advisory when level unchanged');
        _green = mkGreen('low', 12, 8);   // level drops restricted → clear
        await DEMO._refreshGreenWorldForTest('manual'); await flush();
        var recs2 = whiteAdvRecords();
        assert(recs2.length === 2 && recs2[1].result_summary.indexOf('clear') === 0, 'new advisory recorded on level change (→ clear)');
        ok('dedup on unchanged level; re-records on change; tick stays no-LLM');
    } catch (e) { bad('dedup / change', e); }

    console.log('\n' + (fail === 0 ? '✅ ' : '❌ ') + pass + ' passed, ' + fail + ' failed (test-white-green-annotation-t.js)');
    process.exit(fail === 0 ? 0 : 1);
})().catch(function (e) { console.error('FATAL', e); process.exit(1); });
