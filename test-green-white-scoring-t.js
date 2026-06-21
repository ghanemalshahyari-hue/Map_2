/**
 * test-green-white-scoring-t.js — RMOOZ-GREEN-WHITE-SCORING-T
 *
 * White reads Green during plan validation/COA review and produces a structured ADVISORY scoring
 * object { considered, collateral_risk_band, neutral_reaction_score, advisory_score_delta, warnings,
 * recommendations, provenance }. Deterministic, NO LLM, NO /plan-coas. The score delta is advisory:
 * it NEVER invalidates a COA and never gates execution; the structure/physics validator is untouched.
 *
 * Acceptance:
 *  1 low risk → 0 (near-zero) penalty
 *  2 medium risk → small caution penalty (-5)
 *  3 high risk → stronger penalty (-15) + warning
 *  4 unknown/inferred provenance → labelled low confidence / inferred
 *  5 no COA becomes invalid solely from Green risk (validation.ok unchanged; advisory has no gate)
 *  6 no LLM call introduced by scoring
 *  7 no /plan-coas call during scoring
 *  8 White advisory appears in the UI ("White considered Green risk" + band + score delta)
 *  9 decision log records role=white / action=green_advisory_scoring / called_llm=false
 *  + event log: "White advisory: Green collateral risk <band>; score adjusted -X"
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
var FULL_PROV = { engine: 'deterministic', population: 'inferred_terrain_class', collateral: 'inferred', roads: 'inferred_terrain_class', reaction: 'inferred' };
function mkGreen(band, score, reaction, prov) { return { ok: true, collateral_risk: { band: band, score: score, drivers: ['x'] }, road_status: { status: 'open' }, infra_status: { note: 'x' }, host_nation: 'Atropia', neutral_reaction_score: reaction, notes: ['n'], provenance: prov || FULL_PROV, deterministic: true, llm_used: false }; }
function whiteScoreRecords() { return DEMO._getDecisionLogForTest().filter(function (d) { return d.role === 'white' && d.action === 'green_advisory_scoring'; }); }
function noLlmNoPlanCoas() { return !fetchCalls.some(function (c) { return /plan-coas|chat\/completions|api\/ai\/(generate|model)/.test(c.url); }); }

// 1/2/3 — score deltas by band.
try {
    assert(DEMO._greenAdvisoryScoringForTest(mkGreen('low', 15, 10)).advisory_score_delta === 0, 'low → 0');
    var med = DEMO._greenAdvisoryScoringForTest(mkGreen('medium', 45, 20));
    assert(med.advisory_score_delta === -5 && med.warnings.length >= 1 && med.recommendations.length >= 1, 'medium → -5 + caution');
    var hi = DEMO._greenAdvisoryScoringForTest(mkGreen('high', 83, 85));
    assert(hi.advisory_score_delta === -15 && /high collateral/i.test(hi.warnings.join(' ')), 'high → -15 + warning');
    assert(DEMO._greenAdvisoryScoringForTest(mkGreen('low', 15, 10)).considered === true, 'considered:true');
    ok('score deltas: low=0, medium=-5 (caution), high=-15 (warning)');
} catch (e) { bad('score deltas', e); }

// (worst-of) low collateral + high reaction → high penalty.
try {
    assert(DEMO._greenAdvisoryScoringForTest(mkGreen('low', 15, 85)).advisory_score_delta === -15, 'low collateral + high reaction → -15 (worst-of)');
    ok('advisory uses worst-of collateral + neutral-reaction');
} catch (e) { bad('worst-of', e); }

// 4 — unknown / inferred provenance → low confidence.
try {
    var nullScore = DEMO._greenAdvisoryScoringForTest(null);
    assert(nullScore.considered === true && nullScore.collateral_risk_band === 'unknown' && nullScore.advisory_score_delta === 0, 'no green → considered, unknown, 0');
    assert(/low confidence|inferred/i.test(nullScore.warnings.join(' ')), 'no green → low-confidence/inferred warning');
    var absent = DEMO._greenAdvisoryScoringForTest(mkGreen('high', 83, 85, { engine: 'deterministic', roads: 'absent', population: 'absent', collateral: 'absent' }));
    assert(/low confidence/i.test(absent.warnings.join(' ')), 'absent provenance → low-confidence warning');
    ok('unknown / inferred provenance labelled low confidence');
} catch (e) { bad('low-confidence', e); }

// 5/6/7/9 + event log — apply onto the White review (no invalidation, no LLM, no /plan-coas, records).
try {
    DEMO._clearDecisionLogForTest(); _eventLog.length = 0; fetchCalls.length = 0;
    DEMO._setCoaPlanForTest({ ok: true, validation: { ok: true, errors: [] }, coas: [{ plan_id: 'COA-1', side: 'RED' }] });
    DEMO._setGreenWorldForTest(mkGreen('high', 83, 85));
    var ga = DEMO._applyGreenAdvisoryScoringForTest('plan_review');
    var plan = DEMO._getCoaPlanForTest();
    assert(plan.validation.ok === true, 'COA NOT invalidated by Green (validation.ok still true)');         // req #5
    assert(plan._green_advisory && plan._green_advisory.considered === true && plan._green_advisory.advisory_score_delta === -15, 'green_advisory attached to White review');  // req #2
    assert(ga.gate === undefined || ga.gate === false, 'advisory has no gate');
    assert(noLlmNoPlanCoas() && fetchCalls.length === 0, 'scoring made NO fetch (no LLM, no /plan-coas)');    // req #6/#7
    var rec = whiteScoreRecords()[0];
    assert(rec && rec.called_llm === false && rec.reason === 'green risk considered', 'decision log: white/green_advisory_scoring/no-LLM/reason'); // req #9
    assert(_eventLog.some(function (m) { return /White advisory: Green collateral risk high; score adjusted -15/.test(m); }), 'event log line present'); // req #8
    ok('apply: no invalidation, no LLM, no /plan-coas, decision + event log recorded');
} catch (e) { bad('apply scoring', e); }

// 8 — White advisory scoring is computed by the ENGINE (RMOOZ-...-AG: the old Green-panel HTML render was
// physically deleted; the advisory now surfaces in the Scenario Control Center. Assert the engine result).
try {
    DEMO._setCoaPlanForTest({ ok: true, validation: { ok: true }, coas: [{ plan_id: 'COA-1' }] });
    DEMO._setGreenWorldForTest(mkGreen('high', 83, 85));
    var scoring = DEMO._applyGreenAdvisoryScoringForTest('plan_review');
    var s = JSON.stringify(scoring || {});
    assert(scoring && /high/.test(s), 'White considered Green risk: high (engine band)');
    assert(/-15/.test(s) || (scoring && (scoring.score_delta === -15 || scoring.delta === -15)), 'score delta -15 computed (engine, advisory only — never a block)');
    ok('White advisory scoring computed by the engine (old Green-panel UI retired by AG)');
} catch (e) { bad('advisory scoring engine', e); }

console.log('\n' + (fail === 0 ? '✅ ' : '❌ ') + pass + ' passed, ' + fail + ' failed (test-green-white-scoring-t.js)');
process.exit(fail === 0 ? 0 : 1);
