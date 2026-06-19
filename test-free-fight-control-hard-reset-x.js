/**
 * test-free-fight-control-hard-reset-x.js — RMOOZ-FREE-FIGHT-CONTROL-HARD-RESET-X
 *
 * The Free Fight control UI is rebuilt from scratch as a clean, single-flow "cockpit"
 * (renderFreeFightControlV2) that renders ONLY the active state's view with UNIQUE `v2-*` data-act ids.
 * The entire old crowded UI (objective placement + group-movement demo + the full diagnostics card) is
 * PRESERVED but rendered ONLY when the closed "Diagnostics / Legacy" drawer is opened. The engine
 * (planner, COA execution, deterministic ticks, validation, Green/White advisory, ranking, Staff-Safe)
 * is UNCHANGED — this is cockpit-only. "Keep the engine. Rebuild the cockpit."
 *
 * Acceptance (the 13 specified tests):
 *   1  default control window has no hidden duplicate action buttons
 *   2  empty state shows only Generate AI Plan + Staff-Safe secondary (≤2 primary actions)
 *   3  plan-ready state shows COA cards with a clear selected visual state
 *   4  clicking a COA card updates the selected COA immediately (highlight + summary + commit label)
 *   5  Commit commits the SELECTED COA (not the recommended one unless selected)
 *   6  selecting a non-recommended COA shows the operator-override note
 *   7  Run Plan does NOT call /plan-coas (deterministic execution)
 *   8  a normal committed tick has llm_called_this_tick=false
 *   9  the Green/White advisory summary appears in the committed state (advisory only)
 *  10  Diagnostics are hidden by default (no benchmark / decision log / raw JSON / MAIN AI TEST)
 *  11  warmup / benchmark / decision log only appear AFTER opening the Diagnostics drawer
 *  12  non-working group controls are removed from the operator-facing path
 *  13  the engine seams (commit / tick / ranking / Green / White advisory) still behave (full suite is the real proof)
 */
'use strict';
var assert = require('assert');
var path = require('path');

// ── DOM / window stub (mirrors test-free-fight-simple-operator-ux-o.js) ──
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
// recording fetch — resolves the deterministic Green endpoint; records every URL hit.
var FETCHED = [];
function recordingFetch(url, opts) {
    FETCHED.push(String(url));
    if (/neutral-world/.test(String(url))) {
        return Promise.resolve({ ok: true, json: function () { return Promise.resolve(GREEN); } });
    }
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

// A deterministic high-collateral Green assessment so the committed advisory is meaningful.
var GREEN = { ok: true, population_band: 'high',
    collateral_risk: { band: 'high', score: 83, drivers: ['urban'] },
    road_status: { status: 'constrained', basis: 'choke' }, infra_status: { note: 'urban' },
    host_nation: 'Atropia', neutral_reaction_score: 85, notes: ['Collateral risk high.'],
    provenance: { engine: 'deterministic', population: 'inferred', collateral: 'inferred', roads: 'inferred' },
    deterministic: true, llm_used: false };

// minimal scenario + mount.
global.window.RmoozScenario = { scenario: {
    red_units: [{ id: 'R-1', side: 'RED', lat: 24.5, lon: 54.5, coord: [54.5, 24.5] }],
    blue_units_initial: [{ id: 'B-1', side: 'BLUE', lat: 24.6, lon: 54.6, coord: [54.6, 24.6] }],
    obj: { name: 'Objective X', coord: [54.4, 24.45] },
} };
DEMO.mount({ brief: { operational_brief: { proposed_units: [], objectives: [{ label: 'Objective X', lat: 24.45, lon: 54.4 }] } } });
DEMO._setRouteHealthForTest({ ok: true, allow_sim_run: true, ai_execution_enabled: true, model_available: true, reason_if_blocked: null, provider: 'ollama', model: 'qwen3-coder:latest' });

function mkPlan() {
    return {
        ok: true, plan_source: 'llm', recommended_plan_id: 'COA-1', _requestedVia: 'manual_generate',
        llm_called: true, llm_status: 'ok', fallback_reason: null, provider_used: 'ollama', model_used: 'qwen3-coder:latest', ai_depth: 'normal',
        validation: { ok: true },
        coas: [
            { plan_id: 'COA-1', recommended: true, title: 'Flank', side: 'RED', risk: 'medium', confidence: 'high', phases: [{ name: 'P1', actions: [{ unit_uid: 'R-1', action_type: 'MOVE', target: { lat: 24.45, lon: 54.42 } }] }] },
            { plan_id: 'COA-2', title: 'Feint', side: 'RED', risk: 'low', confidence: 'medium', phases: [{ name: 'P1', actions: [{ unit_uid: 'R-1', action_type: 'HOLD_POSITION' }] }] },
        ],
    };
}
function freshNoExec(plan) { DEMO._forgetCoaExecInMemoryForTest(); DEMO._setCoaPlanForTest(plan || null); DEMO._setCoaSelectedIdxForTest(0); }
function dataActs(html) { var m = html.match(/data-act="([^"]+)"/g) || []; return m.map(function (s) { return s.replace(/data-act="|"/g, ''); }); }
function v2() { return DEMO._renderFreeFightControlV2HtmlForTest(); }
// the full operator-facing body the user actually sees (V2 + the legacy drawer in its current open/closed state).
function operatorBody() { return v2() + DEMO._freeFightLegacyDrawerHtmlForTest(); }

// 1 — no hidden duplicate action buttons in the default (drawer-closed) control window.
try {
    DEMO._setFfLegacyOpenForTest(false);
    freshNoExec(mkPlan());
    var acts = dataActs(operatorBody());
    var seen = {}, dups = [];
    acts.forEach(function (a) { if (seen[a]) dups.push(a); seen[a] = true; });
    assert(acts.length > 0, 'control window has action buttons');
    assert(dups.length === 0, 'duplicate data-act ids: ' + dups.join(','));
    assert(acts.every(function (a) { return /^v2-/.test(a); }), 'every visible action is a unique v2-* id (no legacy ids leak): ' + acts.join(','));
    ok('1 default control window has NO hidden/duplicate action buttons (all unique v2-*)');
} catch (e) { bad('1 no duplicate data-act', e); }

// 2 — empty state shows ONLY Generate AI Plan + Staff-Safe secondary; ≤2 primary actions.
try {
    freshNoExec(null);
    var sEmpty = v2();
    assert(DEMO._freeFightControlStateV2ForTest() === 'empty', 'state=empty');
    var ea = dataActs(sEmpty);
    assert(ea.indexOf('v2-generate') !== -1 && ea.indexOf('v2-staff-safe') !== -1, 'Generate + Staff-Safe present');
    assert(ea.indexOf('v2-commit') === -1 && ea.indexOf('v2-run') === -1 && ea.indexOf('v2-pause') === -1, 'no commit/run/pause in empty state');
    assert(/data-ff-v2-primary="1" data-act="v2-generate"/.test(sEmpty), 'Generate is the primary');
    var nPrimary = (sEmpty.match(/data-ff-v2-primary="1"/g) || []).length;
    assert(nPrimary <= 2, '≤2 primary actions (got ' + nPrimary + ')');
    assert(/slow because it calls the AI/.test(sEmpty), 'explains Generate is slow');
    ok('2 empty state → only Generate (primary) + Staff-Safe (secondary); ≤2 primary actions');
} catch (e) { bad('2 empty state', e); }

// 3 — plan-ready state shows COA cards with a clear selected visual state.
try {
    freshNoExec(mkPlan());
    assert(DEMO._freeFightControlStateV2ForTest() === 'ready', 'state=ready');
    var sReady = v2();
    assert(/data-ff-v2="coa-cards"/.test(sReady), 'COA cards container present');
    assert(/data-act="v2-coa-0"/.test(sReady) && /data-act="v2-coa-1"/.test(sReady), 'both COA cards are clickable');
    assert(/data-ff-v2-coa="0"[^>]*data-ff-v2-selected="1"/.test(sReady), 'selected card (idx 0) carries the selected attribute');
    assert(/data-ff-v2="selected-badge"/.test(sReady) && /★ Recommended/.test(sReady), 'Selected + Recommended badges shown');
    assert(/data-act="v2-commit"/.test(sReady), 'Commit Selected Plan present');
    ok('3 plan-ready → clickable COA cards with a clear selected visual state');
} catch (e) { bad('3 plan-ready cards', e); }

// 4 — clicking a COA card updates the selected COA immediately (selection + summary + commit label).
try {
    freshNoExec(mkPlan());
    assert(DEMO._getCoaSelectedIdxForTest() === 0, 'starts on recommended idx 0');
    var ret = DEMO._v2SelectCoaForTest(1);   // simulates a v2-coa-1 card click (set idx + repaint)
    assert(ret === 1 && DEMO._getCoaSelectedIdxForTest() === 1, 'selection moved to idx 1 immediately');
    var sSel = v2();
    assert(/data-ff-v2-coa="1"[^>]*data-ff-v2-selected="1"/.test(sSel), 'idx 1 card now visibly selected');
    assert(/data-ff-v2-coa="0"(?![^>]*data-ff-v2-selected)/.test(sSel), 'idx 0 no longer selected');
    assert(/Commit Selected Plan \(COA-2\)/.test(sSel), 'commit label updated to the selected COA-2');
    ok('4 clicking a COA card updates selection + highlight + commit label immediately');
} catch (e) { bad('4 COA card click', e); }

// 5 — Commit commits the SELECTED COA (the v2-commit handler runs _commitCoa(_coaSelectedIdx)).
try {
    freshNoExec(mkPlan());
    DEMO._v2SelectCoaForTest(1);            // select the non-recommended COA-2
    var exC = DEMO._commitCoaForTest();      // no arg → commits _coaSelectedIdx (same as the v2-commit handler)
    assert(exC && exC.active, 'committed + active');
    assert(exC.selected_coa_id === 'COA-2', 'committed the SELECTED COA-2, not recommended COA-1 (got ' + exC.selected_coa_id + ')');
    ok('5 Commit commits the SELECTED COA (COA-2), not the recommended one');
} catch (e) { bad('5 commit selected', e); }

// 6 — selecting a non-recommended COA shows the operator-override note.
try {
    freshNoExec(mkPlan());
    DEMO._v2SelectCoaForTest(1);            // COA-2 (recommended is COA-1)
    var sOv = v2();
    assert(/data-ff-v2="override"/.test(sOv), 'override note element present');
    // RMOOZ-FREE-FIGHT-V2-OPERATOR-WALKTHROUGH-Y refined the copy to "you selected …".
    assert(/Operator override: you selected COA-2 instead of recommended COA-1/.test(sOv), 'override text names selected + recommended');
    // and NOT shown when the recommended one is selected
    DEMO._v2SelectCoaForTest(0);
    assert(!/data-ff-v2="override"/.test(v2()), 'no override note when the recommended COA is selected');
    ok('6 non-recommended selection → operator-override note (named); none when recommended');
} catch (e) { bad('6 operator override', e); }

// 7 — Run Plan does NOT call /plan-coas (deterministic execution; Green refresh hits only /neutral-world).
try {
    freshNoExec(mkPlan());
    DEMO._commitCoaForTest(0);
    FETCHED.length = 0;
    DEMO._runCommittedCoaForTest();          // the v2-run handler
    var calledPlanCoas = FETCHED.some(function (u) { return /\/plan-coas/.test(u); });
    assert(!calledPlanCoas, 'Run made NO /plan-coas call. URLs: ' + JSON.stringify(FETCHED));
    ok('7 Run Plan does NOT call /plan-coas (no AI planning on Run)');
} catch (e) { bad('7 run no /plan-coas', e); }

// 8 — a normal committed tick has llm_called_this_tick=false.
try {
    freshNoExec(mkPlan());
    DEMO._commitCoaForTest(0);
    var timing = DEMO._coaExecTickForTest();
    assert(timing && timing.llm_called_this_tick === false, 'tick timing reports llm_called_this_tick=false');
    ok('8 normal committed tick → llm_called_this_tick=false');
} catch (e) { bad('8 tick no-LLM', e); }

// 9 — the Green/White advisory summary appears in the committed state (advisory only).
try {
    freshNoExec(mkPlan());
    DEMO._setGreenWorldForTest(GREEN);       // high-collateral assessment
    DEMO._commitCoaForTest(0);
    var sCommitted = v2();
    assert(DEMO._freeFightControlStateV2ForTest() === 'committed', 'state=committed');
    assert(/data-ff-v2="advisory"/.test(sCommitted), 'advisory summary block present');
    assert(/Green\/White advisory/.test(sCommitted), 'labels the Green/White advisory');
    assert(/restricted|caution|clear/.test(sCommitted), 'shows a White advisory level');
    assert(/Advisory only — not a block/.test(sCommitted), 'states advisory-only (never a gate)');
    ok('9 committed state → Green/White advisory summary (advisory only — not a block)');
} catch (e) { bad('9 advisory in committed', e); }

// 10 — Diagnostics are hidden by default (drawer closed → no benchmark / decision log / raw JSON / MAIN AI TEST).
try {
    DEMO._setFfLegacyOpenForTest(false);
    freshNoExec(mkPlan());
    var bodyClosed = operatorBody();
    assert(/data-act="v2-legacy-toggle"/.test(bodyClosed), 'a "Diagnostics / Legacy" toggle is present');
    assert(/data-ff-v2-legacy-open="0"/.test(bodyClosed), 'drawer marked closed');
    assert(!/MAIN AI TEST/.test(bodyClosed), 'no MAIN AI TEST card by default');
    assert(!/data-act="decision-log-clear"/.test(bodyClosed), 'no scheduler decision log by default');
    assert(!/data-act="bench-warmup"/.test(bodyClosed) && !/data-act="bench-run"/.test(bodyClosed), 'no warmup/benchmark by default');
    assert(!/Green JSON/.test(bodyClosed), 'no raw JSON by default');
    ok('10 Diagnostics hidden by default (no benchmark / decision log / raw JSON / MAIN AI TEST)');
} catch (e) { bad('10 diagnostics hidden', e); }

// 11 — warmup / benchmark / decision log only appear AFTER opening the Diagnostics drawer.
try {
    DEMO._setFfLegacyOpenForTest(true);
    freshNoExec(mkPlan());
    var bodyOpen = operatorBody();
    assert(/data-ff-v2-legacy-open="1"/.test(bodyOpen), 'drawer marked open');
    assert(/data-act="bench-warmup"/.test(bodyOpen) && /data-act="bench-run"/.test(bodyOpen), 'warmup + benchmark appear once opened');
    assert(/data-act="decision-log-clear"/.test(bodyOpen), 'scheduler decision log appears once opened');
    assert(/MAIN AI TEST/.test(bodyOpen), 'the full diagnostics card appears once opened');
    DEMO._setFfLegacyOpenForTest(false);     // restore default for any later run
    ok('11 warmup / benchmark / decision log appear ONLY after opening Diagnostics');
} catch (e) { bad('11 diagnostics on open', e); }

// 12 — non-working group controls are removed from the operator-facing path (drawer closed).
try {
    DEMO._setFfLegacyOpenForTest(false);
    freshNoExec(mkPlan());
    var bodyOp = operatorBody();
    assert(!/GROUP MOVEMENT DEMO/.test(bodyOp), 'no "GROUP MOVEMENT DEMO" header in the operator path');
    assert(!/Group demo mode/.test(bodyOp), 'no group-demo mode selector in the operator path');
    assert(!/data-act="start"/.test(bodyOp) && !/data-act="planner-mode"/.test(bodyOp), 'no group start / planner-mode controls in the operator path');
    ok('12 non-working group controls removed from the operator-facing path');
} catch (e) { bad('12 group controls removed', e); }

// 13 — the engine seams still behave (commit → tick → complete; ranking + Green/White advisory intact).
try {
    freshNoExec(mkPlan());
    DEMO._setGreenWorldForTest(GREEN);
    // ranking present + advisory scoring deterministic
    var rank = DEMO._rankCoasForTest(DEMO._getCoaPlanForTest(), GREEN);
    assert(rank && typeof rank.recommended_idx === 'number', 'ranking still computes a recommendation');
    var ga = DEMO._greenAdvisoryScoringForTest(GREEN);
    assert(ga && ga.considered && ga.advisory_score_delta <= 0, 'green advisory scoring intact (delta ≤ 0, advisory)');
    var wa = DEMO._whiteAdvisoryForTest(GREEN);
    assert(wa && wa.gate === false, 'white advisory is never a gate');
    // commit → run a couple ticks → no LLM on any tick
    var ex13 = DEMO._commitCoaForTest(0);
    assert(ex13 && ex13.active, 'commit still produces an active exec');
    var t1 = DEMO._coaExecTickForTest();
    assert(t1 && t1.llm_called_this_tick === false, 'tick still no-LLM');
    var cac = DEMO._buildCommitAdvisoryContextForTest(0);
    assert(cac && (cac.considered === true || cac.considered === false), 'commit advisory context still builds');
    ok('13 engine seams intact (commit/tick/ranking/Green/White) — full suite is the real proof');
} catch (e) { bad('13 engine intact', e); }

console.log('\n' + (fail === 0 ? '✅ ' : '❌ ') + pass + ' passed, ' + fail + ' failed (test-free-fight-control-hard-reset-x.js)');
process.exit(fail === 0 ? 0 : 1);
