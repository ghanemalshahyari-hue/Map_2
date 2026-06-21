/**
 * test-scc-prepare-coa-live-ah.js — RMOOZ-SCC-PREPARE-COA-LIVE-AH
 *
 * The Scenario Control Center "Prepare COA" drives the REAL COA pipeline end-to-end — readiness/Step-1 gate
 * → /api/wargame-sim/free-fight/plan-coas → COA Review (full target table) → Commit (quality enforcement)
 * → Run → Evidence (selected == committed == executed) — with NO old Free Fight UI.
 *
 * Acceptance (1–14 here; 15–18 = the AE/AF/AG + full FF suite, run separately):
 *   1  SCC renders with no old Free Fight UI tokens
 *   2  Prepare COA blocked for all-Step-1 placeholders → NO /plan-coas call
 *   3  Prepare COA calls /plan-coas when taskable units exist
 *   4  the planner response appears in SCC COA Review
 *   5  COA Review shows the exact target table (incl. reason + km→obj columns)
 *   6  selecting a COA changes the selected state visibly
 *   7  an all-center COA is rejected and cannot be committed
 *   8  an executable COA can be committed
 *   9  commit stores exactly the selected COA (or a clearly-labelled enforced replacement)
 *  10  Run hidden before commit, visible after commit
 *  11  Run executes the committed COA only
 *  12  Evidence shows selected/committed/executed target summaries
 *  13  Clear resets readiness/plan/selected/committed/runtime/evidence
 *  14  banned old-UI tokens remain zero in the SCC render
 */
'use strict';
var assert = require('assert');
var path = require('path');
var pass = 0, fail = 0;
function ok(n) { pass++; console.log('  ✓ ' + n); }
function bad(n, e) { fail++; console.log('  ✗ ' + n + (e ? (' — ' + (e && e.message || e)) : '')); }
function flush() { return Promise.resolve().then(function () {}).then(function () {}).then(function () {}).then(function () {}).then(function () {}).then(function () {}); }

var OBJ = { lat: 24.45, lon: 54.40, name: 'Objective X' };
// a realistic role-separated deterministic plan the stubbed planner returns (executable, passes quality).
function plannerPlan() {
    return { ok: true, plan_source: 'deterministic_diverse_coa', llm_called: false, llm_status: null, fallback_reason: null,
        recommended_plan_id: 'COA-1', validation: { ok: true }, mcp_prompt_version: 'rmooz-ai-tool-contract/1.0',
        coas: [{
            plan_id: 'COA-1', title: 'Supported assault', side: 'BLUE', recommended: true, risk: 'low', confidence: 'medium',
            commander_intent: 'Seize and hold the objective with a supported, phased assault.',
            main_effort: 'Assault element (B-1).', supporting_effort: 'Support-by-fire (B-2).',
            security_or_screen: 'Screen (B-3).', reserve_or_follow_on: 'none',
            red_assumption: 'Red defends the objective.', risk_mitigation: 'Screen the flank; support-by-fire overwatch.',
            phases: [
                { name: 'Phase 1 — support & screen', actions: [
                    { unit_uid: 'B-2', action_type: 'MOVE', role: 'support', target: { lat: 24.40, lon: 54.44, type: 'support_by_fire' }, reason: 'overwatch the assault' },
                    { unit_uid: 'B-3', action_type: 'MOVE', role: 'screen', target: { lat: 24.47, lon: 54.36, type: 'screen_line' }, reason: 'screen the flank' } ] },
                { name: 'Phase 2 — assault', actions: [
                    { unit_uid: 'B-1', action_type: 'MOVE', role: 'assault', target: { lat: 24.43, lon: 54.385, type: 'assault_position' }, reason: 'seize the objective' } ] } ],
        }] };
}
function centerPlan() {
    return { ok: true, plan_source: 'llm', llm_called: true, llm_status: 'ok', _requestedVia: 'manual_generate', recommended_plan_id: 'COA-CTR',
        coas: [{ plan_id: 'COA-CTR', title: 'All to objective', side: 'BLUE', recommended: true,
            phases: [{ name: 'Move', actions: ['B-1', 'B-2', 'B-3'].map(function (id) { return { unit_uid: id, action_type: 'MOVE', role: 'assault', target: { lat: OBJ.lat, lon: OBJ.lon } }; }) }] }] };
}

// ── DOM/window stub ──
var elById = {};
function makeEl(t) { var el = { tagName: t, innerHTML: '', textContent: '', children: [], attrs: {}, style: {}, appendChild: function (e) { this.children.push(e); if (e && e.id) elById[e.id] = e; return e; }, removeChild: function (e) { var i = this.children.indexOf(e); if (i >= 0) this.children.splice(i, 1); return e; }, setAttribute: function (k, v) { this.attrs[k] = v; }, removeAttribute: function (k) { delete this.attrs[k]; }, addEventListener: function () {}, removeEventListener: function () {}, querySelector: function () { return null; }, querySelectorAll: function () { return []; }, getAttribute: function (k) { return this.attrs[k]; } }; Object.defineProperty(el, 'parentNode', { value: null, writable: true }); return el; }
var bodyEl = makeEl('body');
global.document = { body: bodyEl, head: makeEl('head'), createElement: makeEl, getElementById: function (id) { return elById[id] || null; }, querySelector: function () { return null; } };
var GREEN = { ok: true, collateral_risk: { band: 'low', score: 10 }, provenance: { engine: 'deterministic' }, deterministic: true };
var FETCHES = [];
var PLAN_RESPONSE = plannerPlan();
global.window = { document: global.document, AppShellEventLog: { append: function () {} },
    sessionStorage: (function () { var d = {}; return { getItem: function (k) { return d[k] || null; }, setItem: function (k, v) { d[k] = String(v); }, removeItem: function (k) { delete d[k]; } }; })(),
    setTimeout: function (f) { return 0; }, clearTimeout: function () {}, setInterval: function () { return 0; }, clearInterval: function () {},
    fetch: function (u, opts) {
        FETCHES.push({ url: String(u), method: (opts && opts.method) || 'GET' });
        var body = /plan-coas/.test(String(u)) ? PLAN_RESPONSE : (/neutral-world/.test(String(u)) ? GREEN : { ok: true });
        return Promise.resolve({ ok: true, status: 200, text: function () { return Promise.resolve(JSON.stringify(body)); }, json: function () { return Promise.resolve(body); } });
    } };
global.window.window = global.window;
global.window.RmoozScenario = { scenario: { id: 'ah', name: 'AH Scenario', obj: { name: 'Objective X', coord: [54.40, 24.45] },
    red_units: [{ id: 'R-1', side: 'RED', lat: 24.50, lon: 54.50, coord: [54.50, 24.50] }],
    blue_units_initial: [{ id: 'B-1', side: 'BLUE', lat: 24.30, lon: 54.20, coord: [54.20, 24.30] }, { id: 'B-2', side: 'BLUE', lat: 24.31, lon: 54.22, coord: [54.22, 24.31] }, { id: 'B-3', side: 'BLUE', lat: 24.29, lon: 54.21, coord: [54.21, 24.29] }] } };
var Cl = path.join(__dirname, 'UI_MOdified', 'client', 'shell');
global.window.RmoozTaskability = require(path.join(Cl, 'unit-taskability.js'));
require(path.join(Cl, 'world-state-db.js')); require(path.join(Cl, 'symbol-db.js')); require(path.join(Cl, 'symbol-registry.js'));
require(path.join(Cl, 'free-fight-demo.js'));
require(path.join(Cl, 'scenario-control-center.js'));
var DEMO = global.window.RmoozFreeFightDemo, E = DEMO.engine, SCC = global.window.RmoozScenarioControlCenter;
DEMO.mount({ brief: { operational_brief: { proposed_units: global.window.RmoozScenario.scenario.blue_units_initial, objectives: [{ label: 'Objective X', lat: 24.45, lon: 54.40 }] } } });
DEMO._setRouteHealthForTest({ ok: true, allow_sim_run: true, model_available: true, provider: 'ollama', model: 'qwen3-coder:latest' });
DEMO.setObjective(OBJ);

function setBlue(u) { global.window.RmoozScenario.scenario.blue_units_initial = u; }
function reset() { DEMO._resetScenarioForTest(); DEMO._forgetCoaExecInMemoryForTest(); DEMO._resetCoaExecForTest(); DEMO._setCoaPlanForTest(null); }

(async function main() {
    console.log('SCC Prepare COA — live pipeline (AH):');

    // 1 — SCC renders with no old Free Fight UI tokens.
    try {
        reset(); var h = SCC.render();
        assert(/data-scc="window"/.test(h) && /Scenario Control Center/.test(h), 'SCC renders');
        ['renderCoaPlanHtml', 'Generate AI Attack Plan', 'Typical plans', 'data-act="select-coa-', 'data-ff-v2', 'data-ff-tabpanel'].forEach(function (t) {
            assert(h.indexOf(t) === -1, 'no old-UI token: ' + t);
        });
        ok('1 SCC renders with zero old Free Fight UI tokens');
    } catch (e) { bad('1 SCC renders clean', e); }

    // 2 — all-Step-1 placeholders → Prepare blocked, NO /plan-coas call.
    try {
        global.window.RmoozScenario.scenario.red_units = [];
        setBlue([{ id: 'Z-1', side: 'BLUE', source_required: true, needs_review: true, exact_unit_position: false, lat: 24.3, lon: 54.2, coord: [54.2, 24.3] }]);
        DEMO.mount({ brief: { operational_brief: { proposed_units: global.window.RmoozScenario.scenario.blue_units_initial } } }); DEMO.setObjective(OBJ); reset();
        FETCHES.length = 0;
        E.prepareCoa(); await flush();
        assert(SCC.state() === 'step1_review_required', 'state step1_review_required');
        assert(/No executable COA\. Step 1 review required\./.test(SCC.render()), 'shows "No executable COA. Step 1 review required."');
        assert(FETCHES.filter(function (f) { return /plan-coas/.test(f.url); }).length === 0, 'NO /plan-coas call for all-Step-1 placeholders');
        ok('2 Prepare COA blocked for all-Step-1 placeholders → no /plan-coas call');
    } catch (e) { bad('2 prepare blocked', e); }
    // restore operational scenario
    global.window.RmoozScenario.scenario.red_units = [{ id: 'R-1', side: 'RED', lat: 24.50, lon: 54.50, coord: [54.50, 24.50] }];
    setBlue([{ id: 'B-1', side: 'BLUE', lat: 24.30, lon: 54.20, coord: [54.20, 24.30] }, { id: 'B-2', side: 'BLUE', lat: 24.31, lon: 54.22, coord: [54.22, 24.31] }, { id: 'B-3', side: 'BLUE', lat: 24.29, lon: 54.21, coord: [54.21, 24.29] }]);
    DEMO.mount({ brief: { operational_brief: { proposed_units: global.window.RmoozScenario.scenario.blue_units_initial } } }); DEMO.setObjective(OBJ);

    // 3 + 4 + 5 — Prepare calls /plan-coas; response in Review; exact target table.
    try {
        reset(); PLAN_RESPONSE = plannerPlan(); FETCHES.length = 0;
        E.prepareCoa(); await flush(); await flush();
        var planCalls = FETCHES.filter(function (f) { return /plan-coas/.test(f.url); });
        assert(planCalls.length >= 1 && planCalls[0].method === 'POST', '3 /plan-coas POST called when taskable units exist');
        assert(SCC.state() === 'coa_review', '4 SCC in COA review after planner response');
        var h = SCC.render();
        assert(/COA-1/.test(h) && /Supported assault/.test(h), '4 planner COA appears in Review');
        assert(/data-scc="target-table"/.test(h), '5 target table present');
        ['unit', 'role', 'action', 'target', 'lat', 'lon', 'km→obj', 'taskable', 'ROE', 'reason'].forEach(function (col) { assert(h.indexOf('>' + col + '<') !== -1, '5 table has column ' + col); });
        assert(/overwatch the assault/.test(h), '5 table shows the per-action reason');
        ok('3+4+5 Prepare calls /plan-coas, response in Review, exact target table (unit/role/action/target/lat/lon/km/taskable/ROE/reason)');
    } catch (e) { bad('3+4+5 prepare→review', e); }

    // 6 — selecting a COA changes selected state visibly.
    try {
        reset(); PLAN_RESPONSE = { ok: true, plan_source: 'deterministic_diverse_coa', llm_called: false, recommended_plan_id: 'COA-1',
            coas: [plannerPlan().coas[0], Object.assign(plannerPlan().coas[0], { plan_id: 'COA-2', title: 'Flank', recommended: false })] };
        // rebuild distinct coas
        var p = plannerPlan(); var c2 = JSON.parse(JSON.stringify(p.coas[0])); c2.plan_id = 'COA-2'; c2.title = 'Flank'; c2.recommended = false;
        PLAN_RESPONSE = { ok: true, plan_source: 'deterministic_diverse_coa', llm_called: false, recommended_plan_id: 'COA-1', coas: [p.coas[0], c2] };
        E.prepareCoa(); await flush(); await flush();
        E.selectCoa(1);
        var h6 = SCC.render();
        assert(/data-scc-coa="1"[^>]*data-scc-selected="1"/.test(h6), 'COA-2 card marked selected');
        assert(/Commit Selected COA \(COA-2\)/.test(h6) || E.selectedIdx() === 1, 'selection moved to COA-2');
        ok('6 selecting a COA changes the selected state visibly');
    } catch (e) { bad('6 select changes state', e); }

    // 7 — an all-center COA reaching Review is rejected + cannot be committed. (Note: the live Prepare flow
    // ALSO auto-replaces a center planner response with the Staff-Safe template at generate time — the AD/AE
    // quality fallback — so the operator never even sees a committable center COA; here we drive the Review
    // guard directly to prove the rejection + commit-block surface.)
    try {
        reset(); DEMO._setCoaPlanForTest(centerPlan()); E.selectCoa(0);
        var h7 = SCC.render();
        assert(/Rejected: not commander-quality\. All units are moving to the objective center\./.test(h7), 'all-center COA rejected in Review');
        assert(/scc-commit" disabled/.test(h7), 'Commit disabled for the rejected COA');
        var exC = E.commit(0);   // commit enforcement replaces it → 0 moves at center
        var committed = exC && exC.selected_coa;
        var atCtr = committed ? committed.phases.reduce(function (m, p) { return m.concat((p.actions || []).filter(function (a) { return a.action_type !== 'HOLD_POSITION' && a.target; })); }, []).filter(function (a) { var R = 6371, tr = Math.PI / 180, dLat = (OBJ.lat - +a.target.lat) * tr, dLon = (OBJ.lon - +a.target.lon) * tr, hh = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(+a.target.lat * tr) * Math.cos(OBJ.lat * tr) * Math.sin(dLon / 2) * Math.sin(dLon / 2); return 2 * R * Math.asin(Math.min(1, Math.sqrt(hh))) < 0.6; }).length : 99;
        assert(atCtr === 0, 'a center COA cannot be committed as-is (enforcement replaced it → 0 at center)');
        ok('7 all-center COA is rejected in Review and cannot be committed as-is');
    } catch (e) { bad('7 center rejected', e); }

    // 8 + 9 + 10 — executable COA commits exactly the selected COA; Run hidden→shown.
    var selSummary, comSummary;
    try {
        reset(); PLAN_RESPONSE = plannerPlan(); FETCHES.length = 0;
        E.prepareCoa(); await flush(); await flush();
        assert(SCC.state() === 'coa_review', 'in review');
        assert(!/data-act="scc-run"/.test(SCC.render()), '10 Run hidden before commit');
        selSummary = E.targetSummary(E.rawJson('selected'));
        var ex = E.commit(0);
        comSummary = E.targetSummary(E.rawJson('committed'));
        assert(ex && ex.active, '8 executable COA committed');
        assert(ex.selected_coa_id === 'COA-1', '9 committed exactly the selected COA-1');
        assert(selSummary === comSummary, '9 committed targets == selected targets (no enforcement replacement): ' + comSummary);
        assert(SCC.state() === 'committed', 'state committed');
        assert(/data-act="scc-run"/.test(SCC.render()), '10 Run visible after commit');
        ok('8+9+10 executable COA commits exactly the selected COA; Run hidden→visible (sel==committed: ' + comSummary + ')');
    } catch (e) { bad('8+9+10 commit + run visibility', e); }

    // 11 + 12 — Run executes the committed COA only; Evidence shows the 3 summaries.
    try {
        E.runScenario(); await flush();
        var ex = E.committedExec();
        assert(ex && ex.selected_coa_id === 'COA-1', '11 scenario executes the committed COA-1 only');
        assert(E.scenarioRuntime() && E.scenarioRuntime().scenario_active, 'scenario active');
        var exeSummary = E.executedTargetSummary();
        assert(typeof exeSummary === 'string' && exeSummary.length > 0, '12 executed target summary present: ' + exeSummary);
        // Evidence panel surfaces all three summaries — open it and assert the rendered proof block.
        SCC._setEvidenceOpenForTest(true);
        var ev = SCC.render();
        assert(/data-scc="target-equality"/.test(ev), '12 Evidence has the target-equality proof block');
        assert(/data-scc="sel-summary"/.test(ev) && /data-scc="com-summary"/.test(ev) && /data-scc="exe-summary"/.test(ev), '12 Evidence shows selected + committed + executed summaries');
        assert(/Readiness report/.test(ev) && /raw planner response/.test(ev), '12 Evidence shows readiness report + raw planner response JSON');
        SCC._setEvidenceOpenForTest(false);
        ok('11+12 Run executes the committed COA only; Evidence shows sel/committed/executed summaries (executed=' + exeSummary + ')');
    } catch (e) { bad('11+12 run + evidence summaries', e); }

    // 13 — Clear resets everything.
    try {
        E.clearAll();
        assert(E.committedExec() === null && E.scenarioRuntime() === null, 'committed exec + scenario cleared');
        assert(DEMO._getCommittedPlanObjMatchesForTest() === false, 'committed-plan identity cleared');
        ok('13 Clear resets committed COA + scenario runtime + committed-plan identity');
    } catch (e) { bad('13 clear resets', e); }

    // 14 — banned tokens zero across the full render path.
    try {
        reset(); PLAN_RESPONSE = plannerPlan(); E.prepareCoa(); await flush(); await flush(); E.commit(0); E.runScenario(); await flush();
        var full = SCC.render();
        ['renderCoaPlanHtml', 'Generate AI Attack Plan', 'Typical plans', 'select-coa-', 'data-ff-v2'].forEach(function (t) {
            assert(full.indexOf(t) === -1, 'banned token absent: ' + t);
        });
        ok('14 banned old-UI tokens remain zero in the SCC render (all states)');
    } catch (e) { bad('14 banned tokens zero', e); }

    console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail === 0 ? 0 : 1);
})();
