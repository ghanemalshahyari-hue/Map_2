/**
 * test-coa-ranking-with-advisory-u.js — RMOOZ-COA-RANKING-WITH-ADVISORY-U
 *
 * The Green/White advisory score is an INPUT to COA ranking + recommendation. It must never invalidate
 * a COA or block Run Plan, never call the LLM, and never trigger /plan-coas. Per-COA green penalty
 * scales by approach intensity, so a lower-tactical, lower-exposure COA can become recommended.
 *
 * Acceptance:
 *  1 high Green risk reduces final_score but does NOT invalidate the COA (validation.ok unchanged)
 *  2 low Green risk → final_score unchanged (green_advisory_delta 0)
 *  3 a lower-tactical COA becomes recommended when the other COA's Green penalty is high (flip)
 *  4 operator can still choose a non-recommended COA
 *  5 score breakdown + advisory note + "Recommended because" render in the COA cards
 *  6 decision log records role=performance / action=coa_ranking_with_green_advisory / called_llm=false
 *  7 event log records the ranking adjustment
 *  8 ranking introduces no fetch (no /plan-coas, no LLM)
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

var fetchCalls = [], _eventLog = [];
global.window = { document: global.document, AppShellEventLog: { append: function (o) { _eventLog.push(o && o.message != null ? o.message : ''); } },
    sessionStorage: (function () { var d = {}; return { getItem: function (k) { return d[k] || null; }, setItem: function (k, v) { d[k] = String(v); }, removeItem: function (k) { delete d[k]; } }; })(),
    setTimeout: function (fn) { return setTimeout(fn, 0); }, clearTimeout: function (id) { clearTimeout(id); }, setInterval: function () { return 0; }, clearInterval: function () {},
    fetch: function (url, opts) { fetchCalls.push({ url: String(url), opts: opts }); return Promise.resolve({ ok: true, status: 200, text: function () { return Promise.resolve('{}'); }, json: function () { return Promise.resolve({ ok: false }); } }); } };
global.window.window = global.window;

var CL = path.join(__dirname, 'UI_MOdified', 'client', 'shell');
require(path.join(CL, 'world-state-db.js')); require(path.join(CL, 'symbol-db.js')); require(path.join(CL, 'symbol-registry.js')); require(path.join(CL, 'free-fight-demo.js'));
var DEMO = global.window.RmoozFreeFightDemo;

var pass = 0, fail = 0;
function ok(n) { pass++; console.log('  ✓ ' + n); }
function bad(n, e) { fail++; console.log('  ✗ ' + n + (e ? (' — ' + (e && e.message || e)) : '')); }
function mkGreen(band, score, reaction) { return { ok: true, collateral_risk: { band: band, score: score, drivers: ['x'] }, road_status: { status: 'open' }, infra_status: { note: 'x' }, host_nation: 'Atropia', neutral_reaction_score: reaction, notes: ['n'], provenance: { engine: 'deterministic', population: 'inferred_terrain_class', collateral: 'inferred', roads: 'inferred_terrain_class', reaction: 'inferred' }, deterministic: true, llm_used: false }; }
// COA-A: planner-recommended, high tactical, target NEAR the objective (high exposure).
// COA-B: lower tactical, target FAR from the objective (low exposure).
function flipPlan() { return { ok: true, plan_source: 'llm', llm_called: true, llm_status: 'ok', provider_used: 'ollama', model_used: 'm', ai_depth: 'normal',
    validation: { ok: true, errors: [] }, recommended_plan_id: 'COA-A',
    coas: [
        { plan_id: 'COA-A', recommended: true, risk: 'high', confidence: 'high', base_score: 50, tactical_score: 20, title: 'Assault', phases: [{ actions: [{ unit_uid: 'R-1', action_type: 'MOVE', target: { lat: 24.451, lon: 54.401 } }] }] },
        { plan_id: 'COA-B', risk: 'low', confidence: 'medium', base_score: 50, tactical_score: 16, title: 'Standoff', phases: [{ actions: [{ unit_uid: 'R-1', action_type: 'MOVE', target: { lat: 30.0, lon: 60.0 } }] }] },
    ] }; }
function whiteRankRecords() { return DEMO._getDecisionLogForTest().filter(function (d) { return d.action === 'coa_ranking_with_green_advisory'; }); }

DEMO.mount({ brief: { operational_brief: { proposed_units: [], objectives: [{ label: 'Objective X', lat: 24.45, lon: 54.40 }] } } });
DEMO.setObjective({ lat: 24.45, lon: 54.40 });

// 1 — high Green risk reduces final_score, no invalidation.
try {
    DEMO._setCoaPlanForTest(flipPlan());
    DEMO._setGreenWorldForTest(mkGreen('high', 83, 85));
    DEMO._applyCoaRankingForTest();
    var plan = DEMO._getCoaPlanForTest();
    var a = plan.coas[0]._ranking;
    assert(a.green_advisory_delta < 0 && a.final_score < (a.base_score + a.tactical_score), 'high green → negative delta, final reduced');
    assert(plan.validation.ok === true, 'COA NOT invalidated (validation.ok still true)');
    ok('high Green risk reduces final_score, does not invalidate the COA');
} catch (e) { bad('high reduces final', e); }

// 2 — low Green risk → no change.
try {
    DEMO._setGreenWorldForTest(mkGreen('low', 12, 8));
    DEMO._applyCoaRankingForTest();
    var a2 = DEMO._getCoaPlanForTest().coas[0]._ranking;
    assert(a2.green_advisory_delta === 0 && a2.final_score === (a2.base_score + a2.tactical_score), 'low green → 0 delta, final unchanged');
    ok('low Green risk keeps final_score unchanged');
} catch (e) { bad('low unchanged', e); }

// 3 — the flip: high green makes the lower-tactical, lower-exposure COA recommended.
try {
    var noGreen = DEMO._rankCoasForTest(flipPlan(), null);
    assert(noGreen.recommended_idx === 0, 'without green: planner-recommended COA-A is recommended');
    var hi = DEMO._rankCoasForTest(flipPlan(), mkGreen('high', 83, 85));
    assert(hi.recommended_idx === 1, 'with high green: COA-B (lower tactical, lower exposure) becomes recommended');
    assert(hi.ranked[0].green_advisory_delta < hi.ranked[1].green_advisory_delta, 'COA-A penalised more than COA-B (higher exposure)');
    ok('high Green penalty flips recommendation to the lower-risk COA');
} catch (e) { bad('flip', e); }

// 4 — operator can still choose a non-recommended COA.
try {
    DEMO._setCoaPlanForTest(flipPlan()); DEMO._setGreenWorldForTest(mkGreen('high', 83, 85));
    DEMO._applyCoaRankingForTest();
    var rec = DEMO._getCoaPlanForTest()._ranking_recommended_idx;
    var other = rec === 0 ? 1 : 0;
    DEMO._setCoaSelectedIdxForTest(other);
    assert(DEMO._getCoaSelectedIdxForTest() === other, 'operator selection overrides the recommendation and sticks');
    ok('operator can still choose a non-recommended COA');
} catch (e) { bad('operator choice', e); }

// 5 — score breakdown renders in COA cards.
try {
    DEMO._setCoaPlanForTest(flipPlan()); DEMO._setGreenWorldForTest(mkGreen('high', 83, 85));
    DEMO._applyCoaRankingForTest();
    var html = DEMO._renderCoaPlanHtmlForTest(DEMO._getCoaPlanForTest());
    assert(/data-ff-coa="ranking"/.test(html) && /Score: /.test(html) && /base /.test(html), 'score breakdown line renders');
    assert(/Green\/White advisory affected ranking/.test(html), 'advisory-affected-ranking note renders');
    assert(/Recommended because:/.test(html), '"Recommended because" renders');
    ok('score breakdown + advisory note + recommendation reason render in COA cards');
} catch (e) { bad('UI breakdown', e); }

// 6 + 7 + 8 — decision log, event log, no fetch.
try {
    DEMO._clearDecisionLogForTest(); _eventLog.length = 0; fetchCalls.length = 0;
    DEMO._setCoaPlanForTest(flipPlan()); DEMO._setGreenWorldForTest(mkGreen('high', 83, 85));
    DEMO._applyCoaRankingForTest();
    var rec = whiteRankRecords()[0];
    assert(rec && rec.role === 'performance' && rec.called_llm === false, 'decision log: performance / coa_ranking_with_green_advisory / no-LLM');
    assert(/recommended /.test(rec.result_summary) && /green/.test(rec.result_summary), 'record includes recommended COA + green delta');
    assert(_eventLog.some(function (m) { return /COA ranking updated: Green\/White advisory adjusted .* by -\d+/.test(m); }), 'event log records ranking adjustment');
    assert(!fetchCalls.some(function (c) { return /plan-coas|chat\/completions|api\/ai\/(generate|model)/.test(c.url); }) && fetchCalls.length === 0, 'ranking made NO fetch (no /plan-coas, no LLM)');
    ok('decision log + event log recorded; ranking introduced no fetch');
} catch (e) { bad('logs + no-fetch', e); }

console.log('\n' + (fail === 0 ? '✅ ' : '❌ ') + pass + ' passed, ' + fail + ' failed (test-coa-ranking-with-advisory-u.js)');
process.exit(fail === 0 ? 0 : 1);
