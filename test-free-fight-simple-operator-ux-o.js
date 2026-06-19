/**
 * test-free-fight-simple-operator-ux-o.js — RMOOZ-FREE-FIGHT-SIMPLE-OPERATOR-UX-O
 *
 * The AI Free Fight card leads with a SIMPLE operator strip: ONE primary action per state —
 * Generate AI Plan (slow) → Use Recommended Plan → Run Plan (fast) → Pause. Everything else
 * (Commit / Replan / Clear / Reset AI Selection / Staff-Safe / Diagnostics) lives under a collapsed
 * "Advanced controls" block. Replan stays STRICTLY under Advanced — the blocked state only points
 * the operator there. Wiring is to EXISTING functions only (no logic change); the committed-COA Run
 * path keeps the no-LLM-on-normal-ticks guarantee from -L.
 *
 * Acceptance:
 *  A no plan        → primary = Generate AI Plan only; no commit/run/pause/replan/staff-safe in the strip
 *  B plan ready     → primary = Use Recommended Plan (recommended pre-selected); no run/pause/replan/generate
 *  C committed      → primary = Run Plan; "fast / no AI call on normal ticks"; status line shows AI-calls OFF
 *  D running        → primary = Pause; no Run button
 *  E blocked        → NO primary button at all; pointer to Advanced controls (Replan lives there)
 *  F complete       → primary = Generate AI Plan; no inline Clear
 *  G card ordering  → operator strip renders BEFORE Advanced controls; Commit/Replan/Clear/Reset AI all
 *                     live inside the Advanced block
 *
 * Static + render test: loads the module under a DOM/window stub and exercises _operatorStripHtmlForTest
 * across states via the commit/exec seams.
 */
'use strict';
var assert = require('assert');
var path = require('path');

// ── DOM / window stub (mirrors test-ai-free-fight-ai-only-a.js) ──
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
global.document = { body: bodyEl, head: makeEl('head'), createElement: makeEl,
    getElementById: function (id) { return elById[id] || null; }, querySelector: function () { return null; } };
global.window = {
    document: global.document,
    AppShellEventLog: { append: function () {} },
    sessionStorage: (function () { var d = {}; return { getItem: function (k) { return d[k] || null; }, setItem: function (k, v) { d[k] = String(v); }, removeItem: function (k) { delete d[k]; } }; })(),
    setTimeout: function () { return 0; }, clearTimeout: function () {},
    setInterval: function () { return 0; }, clearInterval: function () {},
    fetch: null,
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

// minimal scenario + mount so the render paths have a panel and objective.
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
        coas: [
            { plan_id: 'COA-1', recommended: true, title: 'Flank', side: 'RED', phases: [{ actions: [{ unit_uid: 'R-1', action_type: 'MOVE', target: { lat: 24.45, lon: 54.42 } }] }] },
            { plan_id: 'COA-2', title: 'Feint', side: 'RED', phases: [{ actions: [{ unit_uid: 'R-1', action_type: 'HOLD_POSITION' }] }] },
        ],
    };
}
function strip() { return DEMO._operatorStripHtmlForTest(); }
function freshNoExec(plan) { DEMO._forgetCoaExecInMemoryForTest(); DEMO._setCoaPlanForTest(plan || null); }
var PRIMARY = function (act) { return new RegExp('data-ff-primary="1" data-act="' + act + '"'); };

// A — no plan → Generate AI Plan only.
try {
    freshNoExec(null);
    var sA = strip();
    assert(PRIMARY('generate-ai-plan').test(sA), 'primary = Generate AI Plan');
    assert(!/data-act="(coa-use-recommended|coa-run|coa-pause|coa-replan|coa-exec-reset|use-staff-safe|coa-choose-another)"/.test(sA), 'no commit/run/pause/replan/clear/staff-safe in the strip');
    assert(/slow/.test(sA) && /Advanced controls/.test(sA), 'wording: slow + Staff-Safe under Advanced controls');
    ok('A no plan → primary Generate AI Plan only, slow wording, Staff-Safe pointed to Advanced');
} catch (e) { bad('A no plan', e); }

// B — plan ready → Use Recommended Plan (recommended pre-selected).
try {
    freshNoExec(mkPlan());
    var sB = strip();
    assert(PRIMARY('coa-use-recommended').test(sB), 'primary = Use Recommended Plan');
    assert(/Use Recommended Plan \(COA-1\)/.test(sB), 'labels the recommended plan id');
    assert(!/data-act="(coa-run|coa-pause|coa-replan|generate-ai-plan|use-staff-safe)"/.test(sB), 'no run/pause/replan/generate/staff-safe in the strip');
    ok('B plan ready → primary Use Recommended Plan, recommended pre-selected');
} catch (e) { bad('B plan ready', e); }

// C — committed (not yet running) → Run Plan, fast/no-AI wording + status line.
var exC;
try {
    freshNoExec(mkPlan());
    exC = DEMO._commitCoaForTest(0);
    assert(exC && exC.active && exC.phase_status === 'pending', 'committed: active + pending');
    var sC = strip();
    assert(PRIMARY('coa-run').test(sC), 'primary = Run Plan');
    assert(/▶ Run Plan</.test(sC), 'label is "Run Plan"');
    assert(/fast/.test(sC) && /no AI call on normal ticks/.test(sC), 'wording: fast / no AI call on normal ticks');
    assert(/AI calls on normal ticks:/.test(sC), 'status line shows the AI-calls indicator (OFF)');
    assert(!/data-act="(coa-replan|coa-pause|coa-exec-reset|use-staff-safe)"/.test(sC), 'no replan/pause/clear/staff-safe inline');
    ok('C committed → primary Run Plan, fast/no-AI wording, status line present');
} catch (e) { bad('C committed', e); }

// D — running → Pause only.
try {
    exC.phase_status = 'running'; exC.paused = false; exC.replan_required = false;
    var sD = strip();
    assert(PRIMARY('coa-pause').test(sD), 'primary = Pause');
    assert(!/data-act="coa-run"/.test(sD), 'no Run button while running');
    assert(/not called on normal ticks|NOT called on normal ticks/.test(sD), 'reaffirms no AI on normal ticks');
    ok('D running → primary Pause, no Run button');
} catch (e) { bad('D running', e); }

// E — blocked → no primary button; pointer into Advanced (Replan lives there).
try {
    exC.replan_required = true; exC.replan_reason = 'Objective changed — the committed COA no longer matches.';
    var sE = strip();
    assert(!/data-ff-primary/.test(sE), 'NO primary button in the blocked state');
    assert(!/data-act="(coa-replan|coa-run|use-staff-safe)"/.test(sE), 'Replan/Continue/Staff-Safe are NOT surfaced in the strip');
    assert(/Advanced controls/.test(sE) && /Replan with AI/.test(sE), 'points the operator to Advanced controls for Replan');
    assert(/Objective changed/.test(sE), 'shows the replan reason');
    ok('E blocked → no primary button, points to Advanced controls (Replan strictly there)');
} catch (e) { bad('E blocked', e); }

// F — complete → Generate AI Plan; no inline Clear.
try {
    exC.replan_required = false; exC.replan_reason = null; exC.phase_status = 'complete';
    var sF = strip();
    assert(PRIMARY('generate-ai-plan').test(sF), 'primary = Generate AI Plan');
    assert(/Plan complete/.test(sF), 'shows plan-complete note');
    assert(!/data-act="coa-exec-reset"/.test(sF), 'Clear is NOT inline (moved to Advanced)');
    ok('F complete → primary Generate AI Plan, no inline Clear');
} catch (e) { bad('F complete', e); }

// G — tabbed control window (RMOOZ-FREE-FIGHT-CONTROL-WINDOW-REBUILD-W): the default Operator tab shows
// the simple flow only; the moved controls live under the Diagnostics tab.
try {
    freshNoExec(mkPlan());
    DEMO._commitCoaForTest(0);
    DEMO._setFfTabForTest('operator');
    var card = DEMO._renderAiDecisionHtmlForTest();
    // All panels live in the DOM; the Operator PANEL must stay simple. Slice it out.
    var opPanel = card.slice(card.indexOf('data-ff-tabpanel="operator"'), card.indexOf('data-ff-tabpanel="coa_plans"'));
    assert(/data-ff-op="strip"/.test(opPanel), 'operator strip in the Operator panel');
    assert(/data-act="ff-tab-diagnostics"/.test(card), 'tab bar present (Diagnostics tab button)');
    assert(!/data-act="coa-commit"/.test(opPanel) && !/Reset AI Selection/.test(opPanel), 'Operator panel does NOT contain advanced/diagnostics controls');
    assert(/data-act="coa-commit"/.test(card) && /data-act="coa-replan"/.test(card) && /data-act="coa-exec-reset"/.test(card) && /Reset AI Selection/.test(card), 'Commit/Replan/Clear/Reset AI live under Diagnostics');
    ok('G tabbed window — Operator panel simple-only; Commit/Replan/Clear/Reset AI under Diagnostics');
} catch (e) { bad('G tabbed control window', e); }

console.log('\n' + (fail === 0 ? '✅ ' : '❌ ') + pass + ' passed, ' + fail + ' failed (test-free-fight-simple-operator-ux-o.js)');
process.exit(fail === 0 ? 0 : 1);
