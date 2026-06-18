/**
 * test-advisory-commit-journal-v.js — RMOOZ-ADVISORY-COMMIT-JOURNAL-V
 *
 * On COA commit, persist the advisory/ranking decision context into
 * active_coa_execution_state.commit_advisory_context, so the brief/journal can explain why a plan was
 * recommended and whether the operator overrode it. Persistence/annotation ONLY — no LLM, no /plan-coas,
 * no behaviour change.
 *
 * Acceptance:
 *  1 committing the recommended COA records context with operator_override=false
 *  2 committing a non-recommended COA records operator_override=true
 *  3 commit_advisory_context persists + restores through sessionStorage
 *  4 the UI shows the committed advisory context
 *  5 event log records the selected/recommended/override line
 *  6 decision log records commit_advisory_context_recorded with called_llm=false
 *  7 no /plan-coas call is introduced by the commit annotation
 *  10 if advisory is missing, context degrades honestly (considered=false) and commit still works
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
function mkGreen() { return { ok: true, collateral_risk: { band: 'high', score: 83, drivers: ['x'] }, road_status: { status: 'constrained' }, infra_status: { note: 'urban' }, host_nation: 'Atropia', neutral_reaction_score: 85, notes: ['n'], provenance: { engine: 'deterministic', population: 'inferred_terrain_class', collateral: 'inferred', roads: 'inferred_terrain_class', reaction: 'inferred' }, deterministic: true, llm_used: false }; }
global.window = { document: global.document, AppShellEventLog: { append: function (o) { _eventLog.push(o && o.message != null ? o.message : ''); } },
    sessionStorage: (function () { var d = {}; return { getItem: function (k) { return d[k] || null; }, setItem: function (k, v) { d[k] = String(v); }, removeItem: function (k) { delete d[k]; } }; })(),
    setTimeout: function (fn) { return setTimeout(fn, 0); }, clearTimeout: function (id) { clearTimeout(id); }, setInterval: function () { return 0; }, clearInterval: function () {},
    fetch: function (url, opts) { fetchCalls.push({ url: String(url), opts: opts }); var s = JSON.stringify(/neutral-world/.test(String(url)) ? mkGreen() : { ok: false }); return Promise.resolve({ ok: true, status: 200, text: function () { return Promise.resolve(s); }, json: function () { return Promise.resolve(JSON.parse(s)); } }); } };
global.window.window = global.window;

var CL = path.join(__dirname, 'UI_MOdified', 'client', 'shell');
require(path.join(CL, 'world-state-db.js')); require(path.join(CL, 'symbol-db.js')); require(path.join(CL, 'symbol-registry.js')); require(path.join(CL, 'free-fight-demo.js'));
var DEMO = global.window.RmoozFreeFightDemo;

var pass = 0, fail = 0;
function ok(n) { pass++; console.log('  ✓ ' + n); }
function bad(n, e) { fail++; console.log('  ✗ ' + n + (e ? (' — ' + (e && e.message || e)) : '')); }
function flush() { return new Promise(function (r) { setTimeout(r, 5); }); }
function scenario() { global.window.RmoozScenario = { scenario: { id: 'scen-v', red_units: [{ id: 'R-1', side: 'RED', lat: 24.451, lon: 54.401 }], blue_units_initial: [{ id: 'B-1', side: 'BLUE', lat: 24.6, lon: 54.6 }], obj: { name: 'Objective X', coord: [54.40, 24.45] } } }; }
function flipPlan() { return { ok: true, plan_source: 'llm', llm_called: true, llm_status: 'ok', provider_used: 'ollama', model_used: 'm', ai_depth: 'normal', validation: { ok: true, errors: [] }, recommended_plan_id: 'COA-A',
    coas: [ { plan_id: 'COA-A', recommended: true, risk: 'high', confidence: 'high', base_score: 50, tactical_score: 20, title: 'Assault', phases: [{ actions: [{ unit_uid: 'R-1', action_type: 'MOVE', target: { lat: 24.451, lon: 54.401 } }] }] },
            { plan_id: 'COA-B', risk: 'low', confidence: 'medium', base_score: 50, tactical_score: 16, title: 'Standoff', phases: [{ actions: [{ unit_uid: 'R-1', action_type: 'MOVE', target: { lat: 30.0, lon: 60.0 } }] }] } ] }; }
function setupRanked() {
    DEMO._resetCoaExecForTest(); scenario();
    DEMO._setCoaPlanForTest(flipPlan()); DEMO._setGreenWorldForTest(mkGreen());
    DEMO._applyGreenAdvisoryScoringForTest('plan_review'); DEMO._applyCoaRankingForTest();   // high green → recommends COA-B (idx 1)
    return DEMO._getCoaPlanForTest()._ranking_recommended_idx;
}
function noPlanCoas() { return !fetchCalls.some(function (c) { return /plan-coas|chat\/completions|api\/ai\/(generate|model)/.test(c.url); }); }
function commitRecs() { return DEMO._getDecisionLogForTest().filter(function (d) { return d.action === 'commit_advisory_context_recorded'; }); }

DEMO.mount({ brief: { operational_brief: { proposed_units: [], objectives: [{ label: 'Objective X', lat: 24.45, lon: 54.40 }] } } });
DEMO.setObjective({ lat: 24.45, lon: 54.40 });

(async function () {
    // 1 — commit the recommended COA → operator_override=false.
    try {
        var recIdx = setupRanked();
        assert(recIdx === 1, 'high green recommends COA-B (idx 1)');
        DEMO._commitCoaForTest(recIdx); await flush();
        var ctx = DEMO._getCoaExecForTest().commit_advisory_context;
        assert(ctx && ctx.considered === true, 'context considered');
        assert(ctx.was_recommended_selected === true && ctx.operator_override === false, 'override=false when recommended committed');
        assert(ctx.selected_coa_id === 'COA-B' && ctx.recommended_coa_id === 'COA-B', 'selected/recommended = COA-B');
        assert(ctx.selected_coa_ranking && ctx.green_advisory && Array.isArray(ctx.decision_log_snapshot), 'rankings + green_advisory + decision snapshot captured');
        ok('committing recommended COA → operator_override=false, context captured');
    } catch (e) { bad('commit recommended', e); }

    // 2 — commit a non-recommended COA → operator_override=true.
    try {
        var recIdx = setupRanked();
        var other = recIdx === 0 ? 1 : 0;
        DEMO._commitCoaForTest(other); await flush();
        var ctx = DEMO._getCoaExecForTest().commit_advisory_context;
        assert(ctx.operator_override === true && ctx.was_recommended_selected === false, 'override=true');
        assert(ctx.selected_coa_id === 'COA-A' && ctx.recommended_coa_id === 'COA-B', 'selected COA-A, recommended COA-B');
        ok('committing non-recommended COA → operator_override=true');
    } catch (e) { bad('commit override', e); }

    // 3 — persists + restores through sessionStorage.
    try {
        var recIdx = setupRanked(); DEMO._commitCoaForTest(recIdx); await flush();
        var peek = DEMO._peekPersistedCoaExecForTest();
        assert(peek && peek.state && peek.state.commit_advisory_context && peek.state.commit_advisory_context.considered === true, 'commit_advisory_context persisted to sessionStorage');
        DEMO._forgetCoaExecInMemoryForTest();
        assert(DEMO._restoreCoaExecForTest() === true, 'restored from session');
        var rctx = DEMO._getCoaExecForTest().commit_advisory_context;
        assert(rctx && rctx.selected_coa_id === 'COA-B' && rctx.recommended_coa_id === 'COA-B', 'restored context intact');
        ok('commit_advisory_context persists + restores through sessionStorage');
    } catch (e) { bad('persist/restore', e); }

    // 4 — UI shows the committed advisory context.
    try {
        var recIdx = setupRanked(); DEMO._commitCoaForTest(recIdx); await flush();
        var html = DEMO._coaExecHtmlForTest();
        assert(/data-ff-coa="commit-advisory"/.test(html) && /Committed COA advisory context/.test(html), 'advisory-context block renders');
        assert(/Recommended: /.test(html) && /Selected: /.test(html) && /Operator override:/.test(html), 'shows recommended/selected/override');
        ok('UI shows the committed advisory context');
    } catch (e) { bad('UI', e); }

    // 5 + 6 + 7 — event log, decision log, no /plan-coas (override path).
    try {
        var recIdx = setupRanked(); var other = recIdx === 0 ? 1 : 0;
        DEMO._clearDecisionLogForTest(); _eventLog.length = 0; fetchCalls.length = 0;
        DEMO._commitCoaForTest(other); await flush();
        assert(_eventLog.some(function (m) { return /Operator override: committed COA-A instead of recommended COA-B; advisory context recorded\./.test(m); }), 'event log override line');
        var rec = commitRecs()[0];
        assert(rec && rec.called_llm === false && /override true/.test(rec.result_summary), 'decision log commit_advisory_context_recorded, no-LLM, override in summary');
        assert(noPlanCoas(), 'no /plan-coas introduced by the commit annotation');
        ok('event log + decision log recorded; no /plan-coas (override commit)');
    } catch (e) { bad('logs + no-fetch', e); }

    // 5b — recommended-commit event line.
    try {
        var recIdx = setupRanked(); _eventLog.length = 0;
        DEMO._commitCoaForTest(recIdx); await flush();
        assert(_eventLog.some(function (m) { return /Committed recommended COA-B; advisory context recorded\./.test(m); }), 'event log recommended line');
        ok('event log records the recommended-commit line');
    } catch (e) { bad('recommended event line', e); }

    // 10 — advisory missing → considered=false, commit still works.
    try {
        DEMO._resetCoaExecForTest(); scenario(); DEMO._setGreenWorldForTest(null);
        DEMO._setCoaPlanForTest({ ok: true, coas: [{ plan_id: 'COA-1', side: 'RED', phases: [{ actions: [{ unit_uid: 'R-1', action_type: 'HOLD_POSITION' }] }] }] });
        var ex = DEMO._commitCoaForTest(0); await flush();
        var ctx = DEMO._getCoaExecForTest().commit_advisory_context;
        assert(ctx && ctx.considered === false && /no advisory context available/.test(ctx.reason), 'degrades honestly to considered=false');
        assert(ex && ex.active === true, 'commit still works (exec active)');
        ok('advisory missing → considered=false, commit still works');
    } catch (e) { bad('degrade honestly', e); }

    console.log('\n' + (fail === 0 ? '✅ ' : '❌ ') + pass + ' passed, ' + fail + ' failed (test-advisory-commit-journal-v.js)');
    process.exit(fail === 0 ? 0 : 1);
})().catch(function (e) { console.error('FATAL', e); process.exit(1); });
