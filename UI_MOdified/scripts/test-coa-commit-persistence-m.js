'use strict';
/* ============================================================================
 * test-coa-commit-persistence-m.js — RMOOZ-COA-COMMIT-PERSISTENCE-M
 * ----------------------------------------------------------------------------
 * Persist COA Commitment Mode state so a committed COA survives a browser refresh
 * and resumes from the same point — WITHOUT changing the deterministic, no-LLM
 * tick guarantee from RMOOZ-COA-COMMIT-EXECUTION-L.
 *
 *  1) Commit persists active_coa_execution_state (sessionStorage, scenario-keyed)
 *  2) Refresh/mount restores it (memory gone, sessionStorage kept) — same fields
 *  3) Restored state ticks WITHOUT an LLM call (no /plan-coas fetch)
 *  4) Clear removes the persisted state (safe reset)
 *  5) Phase advance updates the persisted state
 *  6) Replan trigger persists the blocked/replan state
 *  7) Event-log entries: committed / restored / phase advanced / completed / replan
 *  8) A persisted COA from a DIFFERENT scenario is NOT restored (no stale carry-over)
 *
 * Run: node scripts/test-coa-commit-persistence-m.js   (exit 0 = green)
 * ========================================================================== */
const assert = require('assert');
const path   = require('path');

let pass = 0, fail = 0;
function test(name, fn) { try { fn(); console.log('  ✓ ' + name); pass++; } catch (e) { console.log('  ✗ ' + name + ' — ' + (e && e.message)); fail++; } }

// ── DOM/window with a REAL backing sessionStorage + recording fetch + event log ──
const fetchCalls = [];
const eventLog = [];
function makeResp(o) { return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(o || {})) }); }
const elById = {};
function mk(t) { const e = { tagName: t, id: '', innerHTML: '', children: [], style: {}, appendChild(c) { this.children.push(c); if (c && c.id) elById[c.id] = c; return c; }, removeChild(c) { return c; }, setAttribute() {}, removeAttribute() {}, addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; }, getAttribute() { return null; } }; Object.defineProperty(e, 'parentNode', { value: null, writable: true }); return e; }
function realSessionStorage() { const d = {}; return { getItem: k => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = String(v); }, removeItem: k => { delete d[k]; }, _dump: () => d }; }
global.document = { body: mk('b'), head: mk('h'), createElement: mk, getElementById: id => elById[id] || null, querySelector: () => null, addEventListener() {}, dispatchEvent() { return true; } };
global.CustomEvent = function (n, d) { this.type = n; this.detail = d && d.detail; };
global.window = { document: global.document,
    AppShellEventLog: { append: function (e) { eventLog.push((e && e.message != null) ? String(e.message) : String(e)); } },
    sessionStorage: realSessionStorage(),
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    fetch: function (url, opts) { fetchCalls.push(String(url)); return makeResp({ ok: false }); } };
global.window.window = global.window;
function setScenario(id, withR1) {
    const red = [{ id: 'R-1', side: 'RED', lat: 25.00, lon: 51.00, coord: [51.00, 25.00] }, { id: 'R-2', side: 'RED', lat: 25.50, lon: 51.50, coord: [51.50, 25.50] }];
    global.window.RmoozScenario = { scenario: { id: id || 'scn-A', red_units: (withR1 === false ? red.filter(u => u.id !== 'R-1') : red), blue_units_initial: [] } };
}
setScenario('scn-A', true);
const C = path.join(__dirname, '..', 'client', 'shell');
require(path.join(C, 'world-state-db.js')); require(path.join(C, 'symbol-db.js')); require(path.join(C, 'symbol-registry.js')); require(path.join(C, 'free-fight-demo.js'));
const DEMO = global.window.RmoozFreeFightDemo;

function plan() {
    return { ok: true, plan_source: 'deterministic_coa_fallback', active_side: 'RED', coas: [
        { plan_id: 'COA-1', title: 'Flank', phases: [
            { phase_id: 'p1', name: 'Move assault', actions: [ { unit_uid: 'R-1', side: 'RED', action_type: 'advance', target: { lat: 25.03, lon: 51.03 } } ] },
            { phase_id: 'p2', name: 'Hold reserve', actions: [ { unit_uid: 'R-2', side: 'RED', action_type: 'HOLD_POSITION' } ] },
        ] } ] };
}
function freshCommit() { DEMO._resetCoaExecForTest(); fetchCalls.length = 0; eventLog.length = 0; setScenario('scn-A', true); DEMO._setCoaPlanForTest(plan()); return DEMO._commitCoaForTest(0); }

(function () {
console.log('\n═══ RMOOZ-COA-COMMIT-PERSISTENCE-M ═══\n');

console.log('1) Commit persists active_coa_execution_state (scenario-keyed)');
test('after commit, sessionStorage holds the state with scenario_key', function () {
    freshCommit();
    const blob = DEMO._peekPersistedCoaExecForTest();
    assert.ok(blob && blob.state, 'persisted blob present');
    assert.strictEqual(blob.scenario_key, 'scn-A', 'scenario-keyed');
    assert.strictEqual(blob.state.selected_coa_id, 'COA-1');
    assert.strictEqual(blob.state.active, true);
    assert.ok(blob.state.selected_coa && Array.isArray(blob.state.selected_coa.phases), 'COA carried');
});

console.log('\n2) Refresh/mount restores the SAME state');
test('forget memory (keep sessionStorage) → restore brings back the same fields', function () {
    freshCommit();
    // advance one tick so there is non-trivial progress to restore
    DEMO._coaExecTickForTest();
    const beforeIdx = DEMO._getCoaExecForTest().current_phase_index;
    const beforeDone = DEMO._getCoaExecForTest().completed_orders.length;
    DEMO._forgetCoaExecInMemoryForTest();                 // simulate browser refresh (memory cleared)
    assert.strictEqual(DEMO._getCoaExecForTest(), null, 'memory cleared');
    const restored = DEMO._restoreCoaExecForTest();
    assert.strictEqual(restored, true, 'restore reported success');
    const ex = DEMO._getCoaExecForTest();
    assert.strictEqual(ex.selected_coa_id, 'COA-1');
    assert.strictEqual(ex.current_phase_index, beforeIdx, 'same phase index');
    assert.strictEqual(ex.completed_orders.length, beforeDone, 'same completed orders');
    assert.strictEqual(ex._restored, true, 'flagged restored');
    assert.strictEqual(ex.paused, true, 'restored PAUSED (operator presses Run to resume)');
});

console.log('\n3) Restored state ticks WITHOUT an LLM call');
test('after restore → Run → tick moves units, makes NO /plan-coas fetch, llm_called_this_tick=false', function () {
    freshCommit();
    DEMO._forgetCoaExecInMemoryForTest();
    DEMO._restoreCoaExecForTest();
    fetchCalls.length = 0;
    DEMO._runCommittedCoaForTest();   // resume (clears paused, runs one tick immediately)
    const t = DEMO._getCoaExecForTest().last_tick_timing;
    assert.strictEqual(t.llm_called_this_tick, false, 'no LLM on the restored tick');
    assert.ok(!fetchCalls.some(u => /plan-coas|chat\/completions|api\/ai\/generate/.test(u)), 'no LLM/plan fetch on resume');
});

console.log('\n4) Clear removes the persisted state (safe reset, req #8)');
test('reset → sessionStorage no longer holds the state', function () {
    freshCommit();
    assert.ok(DEMO._peekPersistedCoaExecForTest(), 'persisted before reset');
    DEMO._resetCoaExecForTest();
    assert.strictEqual(DEMO._peekPersistedCoaExecForTest(), null, 'persisted state removed');
});

console.log('\n5) Phase advance updates the persisted state');
test('a tick that completes phase-1 persists current_phase_index=1', function () {
    freshCommit();
    DEMO._coaExecTickForTest();   // R-1 reaches near target → phase-1 complete → advance
    const blob = DEMO._peekPersistedCoaExecForTest();
    assert.strictEqual(blob.state.current_phase_index, 1, 'persisted advanced phase');
    assert.ok(blob.state.completed_orders.some(o => o.uid === 'R-1'), 'persisted completed order');
});

console.log('\n6) Replan trigger persists the blocked/replan state');
test('missing assigned unit → tick → persisted phase_status=blocked + replan_required', function () {
    freshCommit();
    global.window.RmoozScenario.scenario.red_units = global.window.RmoozScenario.scenario.red_units.filter(u => u.id !== 'R-1');
    DEMO._coaExecTickForTest();   // trigger fires → pause-for-replan → persist
    const blob = DEMO._peekPersistedCoaExecForTest();
    assert.strictEqual(blob.state.phase_status, 'blocked');
    assert.strictEqual(blob.state.replan_required, true);
    assert.ok(/missing|destroyed/i.test(blob.state.replan_reason || ''), 'reason persisted');
});

console.log('\n7) Event-log entries: committed / restored / phase advanced / completed / replan');
test('the lifecycle writes the required event-log lines', function () {
    // committed + phase advanced + completed
    DEMO._resetCoaExecForTest(); eventLog.length = 0; setScenario('scn-A', true); DEMO._setCoaPlanForTest(plan());
    DEMO._commitCoaForTest(0);
    DEMO._coaExecTickForTest();   // phase-1 complete → advancing
    DEMO._coaExecTickForTest();   // phase-2 (HOLD) → COA complete
    assert.ok(eventLog.some(e => /COA committed/i.test(e)), 'committed logged');
    assert.ok(eventLog.some(e => /phase complete|advancing to phase/i.test(e)), 'phase advance logged');
    assert.ok(eventLog.some(e => /COA execution COMPLETE/i.test(e)), 'completed logged');
    // restored
    DEMO._resetCoaExecForTest(); eventLog.length = 0; DEMO._setCoaPlanForTest(plan()); DEMO._commitCoaForTest(0);
    DEMO._forgetCoaExecInMemoryForTest(); DEMO._restoreCoaExecForTest();
    assert.ok(eventLog.some(e => /COA restored from session/i.test(e)), 'restored logged');
    // replan
    DEMO._resetCoaExecForTest(); eventLog.length = 0; setScenario('scn-A', true); DEMO._setCoaPlanForTest(plan()); DEMO._commitCoaForTest(0);
    global.window.RmoozScenario.scenario.red_units = global.window.RmoozScenario.scenario.red_units.filter(u => u.id !== 'R-1');
    DEMO._coaExecTickForTest();
    assert.ok(eventLog.some(e => /PAUSED — replan trigger/i.test(e)), 'replan logged');
});

console.log('\n8) A persisted COA from a DIFFERENT scenario is NOT restored');
test('scenario mismatch → restore is skipped (no stale carry-over)', function () {
    DEMO._resetCoaExecForTest(); setScenario('scn-A', true); DEMO._setCoaPlanForTest(plan());
    DEMO._commitCoaForTest(0);                 // persisted under scenario_key scn-A
    DEMO._forgetCoaExecInMemoryForTest();
    setScenario('scn-DIFFERENT', true);        // now a different scenario is loaded
    const restored = DEMO._restoreCoaExecForTest();
    assert.strictEqual(restored, false, 'stale (other-scenario) COA NOT restored');
    assert.strictEqual(DEMO._getCoaExecForTest(), null, 'no committed COA after a mismatched restore');
});

console.log('\n' + (fail === 0 ? '✅ PASS' : '❌ FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail === 0 ? 0 : 1);
})();
