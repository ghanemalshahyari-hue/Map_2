/**
 * test-free-fight-v2-real-operator-acceptance-z.js — RMOOZ-FREE-FIGHT-V2-REAL-OPERATOR-ACCEPTANCE-Z
 *
 * Operator acceptance for the V2 cockpit + the fix for the reported "when I reach Run, it doesn't work"
 * bug. ROOT CAUSE: a committed COA that holds position (or whose units are already at their objective)
 * runs to phase_status='complete' with ZERO map movement, and the V2 cockpit said NOTHING about it — so
 * the operator read "Run does nothing" as broken. FIX (UI guidance only, engine FROZEN): a movement
 * summary line + an honest "no movement expected / executed" note in the committed/running/complete views.
 *
 * Acceptance:
 *   A  full flow: empty -> ready -> select non-recommended -> committed -> Run -> running, no /plan-coas, tick no-LLM
 *   B  a MANEUVER COA (resolvable unit, far target) runs and actually moves the unit (engine sound)
 *   C  a HOLD-only COA runs to complete with 0 moves AND the cockpit explains it ("holds position …")
 *   D  movement summary reports the planned move/hold order counts
 *   E  the committed view carries the movement summary (no silent "complete, nothing moved")
 *   F  no new data-act ids / no duplicates introduced by the fix
 */
'use strict';
var assert = require('assert');
var path = require('path');

var elById = {};
function makeEl(t) {
    var el = { tagName: t, id: '', className: '', innerHTML: '', textContent: '', children: [], attrs: {}, style: {},
        appendChild: function (e) { this.children.push(e); if (e && e.id) elById[e.id] = e; return e; },
        removeChild: function (e) { var i = this.children.indexOf(e); if (i >= 0) this.children.splice(i, 1); return e; },
        setAttribute: function (k, v) { this.attrs[k] = v; }, removeAttribute: function (k) { delete this.attrs[k]; },
        addEventListener: function () {}, removeEventListener: function () {},
        querySelector: function () { return null; }, querySelectorAll: function () { return []; },
        getAttribute: function (k) { return this.attrs[k]; } };
    Object.defineProperty(el, 'parentNode', { value: null, writable: true });
    return el;
}
var bodyEl = makeEl('body');
var FETCHED = [];
global.document = { body: bodyEl, head: makeEl('head'), createElement: makeEl,
    getElementById: function (id) { return elById[id] || null; }, querySelector: function () { return null; } };
global.window = {
    document: global.document, AppShellEventLog: { append: function () {} },
    sessionStorage: (function () { var d = {}; return { getItem: function (k) { return d[k] || null; }, setItem: function (k, v) { d[k] = String(v); }, removeItem: function (k) { delete d[k]; } }; })(),
    setTimeout: function () { return 0; }, clearTimeout: function () {}, setInterval: function () { return 0; }, clearInterval: function () {},
    fetch: function (u) { FETCHED.push(String(u)); return Promise.resolve({ ok: true, json: function () { return Promise.resolve({ ok: true }); } }); },
};
global.window.window = global.window;
// scenario WITH a resolvable RED unit so Run does NOT block on unit-missing
global.window.RmoozScenario = { scenario: {
    red_units: [{ id: 'R-1', side: 'RED', lat: 24.5, lon: 54.5, coord: [54.5, 24.5] }],
    blue_units_initial: [], obj: { name: 'Objective X', coord: [54.4, 24.45] },
} };

var C = path.join(__dirname, 'UI_MOdified', 'client', 'shell');
require(path.join(C, 'world-state-db.js'));
require(path.join(C, 'symbol-db.js'));
require(path.join(C, 'symbol-registry.js'));
require(path.join(C, 'free-fight-demo.js'));
var DEMO = global.window.RmoozFreeFightDemo;

var pass = 0, fail = 0;
function ok(n) { pass++; console.log('  ✓ ' + n); }
function bad(n, e) { fail++; console.log('  ✗ ' + n + (e ? (' — ' + (e && e.message || e)) : '')); }

DEMO.mount({ brief: { operational_brief: { proposed_units: [{ id: 'R-1', side: 'RED', lat: 24.5, lon: 54.5 }], objectives: [{ label: 'Objective X', lat: 24.45, lon: 54.4 }] } } });
DEMO._setRouteHealthForTest({ ok: true, allow_sim_run: true, ai_execution_enabled: true, model_available: true, provider: 'ollama', model: 'qwen3-coder:latest' });

function maneuverPlan() {
    return { ok: true, plan_source: 'llm', recommended_plan_id: 'COA-1', validation: { ok: true },
        coas: [
            { plan_id: 'COA-1', recommended: true, title: 'Assault', side: 'RED', risk: 'medium', confidence: 'high',
              phases: [{ name: 'Advance', actions: [{ unit_uid: 'R-1', action_type: 'MOVE', role: 'assault', target: { lat: 24.46, lon: 54.46 } }] }] },
            { plan_id: 'COA-2', title: 'Probe', side: 'RED', risk: 'low', confidence: 'medium',
              phases: [{ name: 'Probe', actions: [{ unit_uid: 'R-1', action_type: 'MOVE', role: 'recon', target: { lat: 24.48, lon: 54.49 } }] }] },
        ] };
}
function holdPlan() {
    return { ok: true, plan_source: 'llm', recommended_plan_id: 'COA-1', validation: { ok: true },
        coas: [{ plan_id: 'COA-1', recommended: true, title: 'Hold the line', side: 'RED', risk: 'low', confidence: 'high',
            phases: [{ name: 'Hold', actions: [{ unit_uid: 'R-1', action_type: 'HOLD_POSITION', role: 'defend' }] }] }] };
}
function fresh(plan) { DEMO._forgetCoaExecInMemoryForTest(); DEMO._setCoaPlanForTest(plan || null); DEMO._setCoaSelectedIdxForTest(0); DEMO._setFfLegacyOpenForTest(false); }

// A — full flow empty -> ready -> override select -> committed -> Run running, no /plan-coas, tick no-LLM.
try {
    fresh(null);
    assert(DEMO._freeFightControlStateV2ForTest() === 'empty', 'empty');
    DEMO._setCoaPlanForTest(maneuverPlan()); DEMO._setCoaSelectedIdxForTest(0);
    assert(DEMO._freeFightControlStateV2ForTest() === 'ready', 'ready');
    DEMO._v2SelectCoaForTest(1);   // non-recommended
    assert(/Operator override: you selected COA-2 instead of recommended COA-1/.test(DEMO._renderFreeFightControlV2HtmlForTest()), 'override note');
    var ex = DEMO._commitCoaForTest();   // commits selected (COA-2)
    assert(ex.selected_coa_id === 'COA-2' && DEMO._freeFightControlStateV2ForTest() === 'committed', 'committed selected COA-2');
    FETCHED.length = 0;
    DEMO._runCommittedCoaForTest();
    assert(!FETCHED.some(function (u) { return /\/plan-coas/.test(u); }), 'Run made no /plan-coas');
    var ex2 = DEMO._getCoaExecForTest();
    assert(ex2.last_tick_timing && ex2.last_tick_timing.llm_called_this_tick === false, 'tick no-LLM');
    ok('A full flow → committed(selected) → Run running, no /plan-coas, tick llm_called=false');
} catch (e) { bad('A full flow', e); }

// B — a MANEUVER COA actually moves the resolvable unit (engine sound; not blocked).
try {
    fresh(maneuverPlan());
    DEMO._commitCoaForTest(0);
    DEMO._runCommittedCoaForTest();         // immediate tick
    var ex = DEMO._getCoaExecForTest();
    assert(ex.phase_status !== 'blocked', 'not blocked (unit resolves)');
    assert(DEMO._getCoaMovedUnitsForTest().length >= 1, 'at least one unit moved on the maneuver tick');
    ok('B maneuver COA runs and actually moves the resolvable unit (no block)');
} catch (e) { bad('B maneuver moves', e); }

// C — a HOLD-only COA completes with 0 moves AND the cockpit explains it (the reported bug fix).
try {
    fresh(holdPlan());
    DEMO._commitCoaForTest(0);
    DEMO._runCommittedCoaForTest();
    var ex = DEMO._getCoaExecForTest();
    assert(ex.phase_status === 'complete', 'hold plan completes');
    assert(DEMO._getCoaMovedUnitsForTest().length === 0, '0 units moved (hold)');
    var html = DEMO._renderFreeFightControlV2HtmlForTest();
    assert(/data-ff-v2="no-movement"/.test(html), 'cockpit shows a no-movement explanation');
    assert(/holds position/.test(html), 'explains the COA holds position');
    ok('C HOLD COA completes with 0 moves AND cockpit explains "holds position" (was silent → bug fixed)');
} catch (e) { bad('C hold explained', e); }

// D — movement summary reports planned move/hold counts.
try {
    fresh(maneuverPlan());
    DEMO._commitCoaForTest(0);
    var m = DEMO._v2MovementSummaryHtmlForTest();
    assert(/data-ff-v2="movement"/.test(m), 'movement summary present');
    assert(/orders <b[^>]*>1<\/b> move/.test(m), 'reports 1 move order');
    assert(/<b[^>]*>0<\/b> hold/.test(m), 'reports 0 hold orders');
    // hold plan → 0 move / 1 hold + no-movement note
    fresh(holdPlan());
    DEMO._commitCoaForTest(0);
    var mh = DEMO._v2MovementSummaryHtmlForTest();
    assert(/orders <b[^>]*>0<\/b> move/.test(mh) && /<b[^>]*>1<\/b> hold/.test(mh), 'hold plan → 0 move / 1 hold');
    assert(/data-ff-v2="no-movement"/.test(mh), 'hold plan → no-movement note');
    ok('D movement summary reports planned move/hold order counts');
} catch (e) { bad('D movement counts', e); }

// E — the committed view carries the movement summary (no silent complete).
try {
    fresh(holdPlan());
    DEMO._commitCoaForTest(0);   // committed (not yet run)
    var html = DEMO._renderFreeFightControlV2HtmlForTest();
    assert(DEMO._freeFightControlStateV2ForTest() === 'committed', 'committed state');
    assert(/data-ff-v2="movement"/.test(html), 'committed view shows movement summary (sets expectation before Run)');
    assert(/data-ff-v2="no-movement"/.test(html), 'committed view warns a hold plan will not move units');
    ok('E committed view carries movement summary up-front (no silent "complete, nothing moved")');
} catch (e) { bad('E committed movement summary', e); }

// F — the fix introduces no new data-act ids and no duplicates in the default control window.
try {
    fresh(maneuverPlan());
    DEMO._commitCoaForTest(0); DEMO._runCommittedCoaForTest();
    DEMO._setFfLegacyOpenForTest(false);
    var body = DEMO._renderFreeFightControlV2HtmlForTest() + DEMO._freeFightLegacyDrawerHtmlForTest();
    var acts = (body.match(/data-act="([^"]+)"/g) || []).map(function (s) { return s.replace(/data-act="|"/g, ''); });
    var dups = acts.filter(function (a, i) { return acts.indexOf(a) !== i; });
    assert(dups.length === 0, 'no duplicate data-act: ' + dups.join(','));
    assert(acts.every(function (a) { return /^v2-/.test(a); }), 'all actions remain unique v2-*: ' + acts.join(','));
    ok('F movement fix adds no new data-act / no duplicates (all unique v2-*)');
} catch (e) { bad('F no new actions', e); }

console.log('\n' + (fail === 0 ? '✅ ' : '❌ ') + pass + ' passed, ' + fail + ' failed (test-free-fight-v2-real-operator-acceptance-z.js)');
process.exit(fail === 0 ? 0 : 1);
