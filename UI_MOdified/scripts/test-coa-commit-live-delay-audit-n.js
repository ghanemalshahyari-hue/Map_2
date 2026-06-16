'use strict';
/* ============================================================================
 * test-coa-commit-live-delay-audit-n.js — RMOOZ-COA-COMMIT-LIVE-DELAY-AUDIT-N
 * ----------------------------------------------------------------------------
 * The "delay" felt during committed-COA execution was NOT compute and NOT an LLM
 * call — it was the tick CADENCE: committed ticks were scheduled at the cinematic
 * LLM-loop speed (x1 = one step every 6000ms). Deterministic execution must tick
 * briskly. This locks in the fix + the per-tick instrumentation.
 *
 *  1) committed cadence at default x1 is brisk (≈500ms, NOT the 6000ms cinematic)
 *  2) fire speeds still accelerate further (fire2 ≈ 120ms)
 *  3) per-tick timing exposes the audit spans (ui/map/log/persist/interval)
 *  4) the no-LLM guarantee is unchanged (0 plan-coas fetch, llm_called_this_tick=false)
 *  5) the UI breakdown shows the new spans
 *
 * Run: node scripts/test-coa-commit-live-delay-audit-n.js   (exit 0 = green)
 * ========================================================================== */
const assert = require('assert');
const path   = require('path');

let pass = 0, fail = 0;
function test(name, fn) { try { fn(); console.log('  ✓ ' + name); pass++; } catch (e) { console.log('  ✗ ' + name + ' — ' + (e && e.message)); fail++; } }

const fetchCalls = []; let intervalMs = null;
const elById = {};
function mk(t) { const e = { tagName: t, id: '', innerHTML: '', children: [], style: {}, appendChild(c) { this.children.push(c); if (c && c.id) elById[c.id] = c; return c; }, removeChild(c) { return c; }, setAttribute() {}, removeAttribute() {}, addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; }, getAttribute() { return null; } }; Object.defineProperty(e, 'parentNode', { value: null, writable: true }); return e; }
global.document = { body: mk('b'), head: mk('h'), createElement: mk, getElementById: id => elById[id] || null, querySelector: () => null, addEventListener() {}, dispatchEvent() { return true; } };
global.CustomEvent = function (n, d) { this.type = n; this.detail = d && d.detail; };
let store = {};
global.window = { document: global.document, AppShellEventLog: { append() {} },
    sessionStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    setTimeout: () => 0, clearTimeout() {}, setInterval: (fn, ms) => { intervalMs = ms; return 1; }, clearInterval() {},
    fetch: (u) => { fetchCalls.push(String(u)); return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('{}') }); } };
global.window.window = global.window;
global.window.RmoozScenario = { scenario: { id: 'scn', red_units: [
    { id: 'R-1', side: 'RED', lat: 25.0, lon: 51.0, coord: [51.0, 25.0] }, { id: 'R-2', side: 'RED', lat: 25.5, lon: 51.5, coord: [51.5, 25.5] } ], blue_units_initial: [] } };
const C = path.join(__dirname, '..', 'client', 'shell');
require(path.join(C, 'world-state-db.js')); require(path.join(C, 'symbol-db.js')); require(path.join(C, 'symbol-registry.js')); require(path.join(C, 'free-fight-demo.js'));
const D = global.window.RmoozFreeFightDemo;
function plan() { return { ok: true, active_side: 'RED', coas: [ { plan_id: 'COA-1', phases: [
    { phase_id: 'p1', actions: [ { unit_uid: 'R-1', side: 'RED', action_type: 'advance', target: { lat: 25.30, lon: 51.30 } } ] },
    { phase_id: 'p2', actions: [ { unit_uid: 'R-2', side: 'RED', action_type: 'HOLD_POSITION' } ] } ] } ] }; }
function cadenceAt(speed) { D._resetCoaExecForTest(); D._setCoaPlanForTest(plan()); D._setSpeedForTest(speed); D._commitCoaForTest(0); intervalMs = null; D._runCommittedCoaForTest(); return intervalMs; }

(function () {
console.log('\n═══ RMOOZ-COA-COMMIT-LIVE-DELAY-AUDIT-N ═══\n');

console.log('1) default x1 cadence is brisk (NOT the 6000ms cinematic that caused the felt delay)');
test('x1 committed tick interval ≈ 500ms (≤ 600), not 6000ms', function () {
    const ms = cadenceAt('x1');
    assert.ok(ms <= 600, 'x1 cadence ' + ms + 'ms should be brisk (≤600), was 6000ms before the fix');
    assert.ok(ms !== 6000, 'no longer the cinematic 6s');
});
test('x5 and x15 are also brisk (≤500ms)', function () {
    assert.ok(cadenceAt('x5') <= 500, 'x5 brisk');
    assert.ok(cadenceAt('x15') <= 500, 'x15 brisk');
});

console.log('\n2) fire speeds still accelerate further');
test('fire2 ticks faster than the default (≈120ms)', function () {
    const f2 = cadenceAt('fire2');
    assert.ok(f2 < 500 && f2 >= 100, 'fire2 ' + f2 + 'ms accelerates below the 500ms default');
    assert.ok(cadenceAt('fire') < 500, 'fire also accelerates');
});

console.log('\n3) per-tick timing exposes the audit spans');
test('last_tick_timing has ui/map/log/persist/interval + work + llm flag', function () {
    D._resetCoaExecForTest(); D._setCoaPlanForTest(plan()); D._setSpeedForTest('fire2'); D._commitCoaForTest(0);
    D._coaExecTickForTest();
    const t = D._getCoaExecForTest().last_tick_timing;
    ['coa_tick_execute_ms', 'replan_trigger_check_ms', 'event_log_ms', 'storage_persist_ms', 'map_paint_ms', 'ui_update_ms', 'tick_interval_delay_ms', 'llm_called_this_tick'].forEach(function (k) {
        assert.ok(k in t, 'timing exposes ' + k);
    });
});

console.log('\n4) the no-LLM guarantee is unchanged');
test('20 ticks → 0 plan-coas fetch, llm_called_this_tick=false, work ≈ 0ms', function () {
    D._resetCoaExecForTest(); store = {}; fetchCalls.length = 0; D._setCoaPlanForTest(plan()); D._setSpeedForTest('fire2'); D._commitCoaForTest(0);
    let anyLlm = false, maxWork = 0;
    for (let i = 0; i < 20; i++) { const ex = D._getCoaExecForTest(); if (ex.phase_status === 'complete') break; const t = D._coaExecTickForTest(); if (t) { if (t.llm_called_this_tick) anyLlm = true; maxWork = Math.max(maxWork, t.coa_tick_execute_ms || 0); } }
    assert.strictEqual(anyLlm, false, 'no LLM on any tick');
    assert.strictEqual(fetchCalls.filter(u => /plan-coas|chat\/completions|generate/.test(u)).length, 0, 'no plan/LLM fetch');
    assert.ok(maxWork <= 50, 'per-tick work stays trivial (' + maxWork + 'ms)');
});

console.log('\n5) the UI breakdown shows the new spans');
test('_coaExecHtml renders ui/map/log/persist/interval', function () {
    D._resetCoaExecForTest(); D._setCoaPlanForTest(plan()); D._setSpeedForTest('fire2'); D._commitCoaForTest(0); D._coaExecTickForTest();
    const html = String(D._coaExecHtmlForTest());
    ['ui ', 'map ', 'log ', 'persist ', 'interval '].forEach(function (label) { assert.ok(html.indexOf(label) !== -1, 'breakdown shows "' + label.trim() + '"'); });
    assert.ok(/llm_called_this_tick:/.test(html) && /false/.test(html), 'still shows no-LLM proof');
});

console.log('\n' + (fail === 0 ? '✅ PASS' : '❌ FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail === 0 ? 0 : 1);
})();
