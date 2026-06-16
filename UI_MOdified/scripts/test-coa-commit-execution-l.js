'use strict';
/* ============================================================================
 * test-coa-commit-execution-l.js — RMOOZ-COA-COMMIT-EXECUTION-L
 * ----------------------------------------------------------------------------
 * "COA Commitment Mode": AI plans once, operator commits ONE COA, RMOOZ executes
 * it phase-by-phase deterministically (NO LLM on normal ticks), AI returns only on
 * a replan trigger or operator Replan. No combat/movement/validator/Staff-Safe change.
 *
 *  1) Commit persists active_coa_execution_state
 *  2) Running the COA executes the current phase WITHOUT an LLM call
 *  3) Phase advances when its orders complete
 *  4) HOLD_POSITION never moves
 *  5) Replan trigger fires when an assigned unit is missing
 *  6) The replan trigger PAUSES execution (blocked + reason)
 *  7) Operator Replan calls the AI exactly once (the single LLM path)
 *  8) Staff-Safe stays available
 *  9) Deep Plan still produces 2–3 COAs (planner)
 * 10) No normal tick calls OpenRouter/LLM (llm_called_this_tick=false)
 *
 * Run: node scripts/test-coa-commit-execution-l.js   (exit 0 = green)
 * ========================================================================== */
const assert = require('assert');
const path   = require('path');

let pass = 0, fail = 0;
function test(name, fn) { try { fn(); console.log('  ✓ ' + name); pass++; } catch (e) { console.log('  ✗ ' + name + ' — ' + (e && e.message)); fail++; } }
async function atest(name, fn) { try { await fn(); console.log('  ✓ ' + name); pass++; } catch (e) { console.log('  ✗ ' + name + ' — ' + (e && e.message)); fail++; } }

// ── DOM/window + a recording fetch + a mutable scenario ──────────────────────
const fetchCalls = [];
function makeResp(obj) { return Promise.resolve({ ok: true, status: 200, statusText: 'OK', text: function () { return Promise.resolve(JSON.stringify(obj || {})); } }); }
const elById = {};
function mk(t) { const e = { tagName: t, id: '', innerHTML: '', children: [], style: {}, appendChild(c) { this.children.push(c); if (c && c.id) elById[c.id] = c; return c; }, removeChild(c) { return c; }, setAttribute() {}, removeAttribute() {}, addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; }, getAttribute() { return null; } }; Object.defineProperty(e, 'parentNode', { value: null, writable: true }); return e; }
global.document = { body: mk('b'), head: mk('h'), createElement: mk, getElementById: id => elById[id] || null, querySelector: () => null, addEventListener() {}, dispatchEvent() { return true; } };
global.CustomEvent = function (n, d) { this.type = n; this.detail = d && d.detail; };
global.window = { document: global.document, AppShellEventLog: { append() {} }, sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    fetch: function (url, opts) { fetchCalls.push({ url: url, opts: opts }); return makeResp({ ok: false }); } };
global.window.window = global.window;
function freshScenario() {
    global.window.RmoozScenario = { scenario: { red_units: [
        { id: 'R-1', side: 'RED', name: 'Assault', lat: 25.00, lon: 51.00, coord: [51.00, 25.00] },
        { id: 'R-2', side: 'RED', name: 'Reserve', lat: 25.50, lon: 51.50, coord: [51.50, 25.50] },
    ], blue_units_initial: [ { id: 'B-1', side: 'BLUE', name: 'Def', lat: 25.30, lon: 51.30, coord: [51.30, 25.30] } ] } };
}
freshScenario();
const C = path.join(__dirname, '..', 'client', 'shell');
require(path.join(C, 'world-state-db.js')); require(path.join(C, 'symbol-db.js')); require(path.join(C, 'symbol-registry.js')); require(path.join(C, 'free-fight-demo.js'));
const DEMO = global.window.RmoozFreeFightDemo;

// A committed-ready COA: phase-1 advances R-1 to a near target (≤ one 0.05° step → completes in 1 tick),
// phase-2 holds R-2 (HOLD_POSITION → never moves).
function freshPlan() {
    return { ok: true, plan_source: 'deterministic_coa_fallback', active_side: 'RED', coas: [
        { plan_id: 'COA-1', title: 'Flank / Fix', recommended: true, phases: [
            { phase_id: 'phase-1', name: 'Move assault', actions: [ { unit_uid: 'R-1', side: 'RED', role: 'assault', action_type: 'advance', execution_mode: 'flank_offaxis_target', target: { lat: 25.03, lon: 51.03, type: 'coord' } } ] },
            { phase_id: 'phase-2', name: 'Hold reserve', actions: [ { unit_uid: 'R-2', side: 'RED', role: 'reserve', action_type: 'HOLD_POSITION' } ] },
        ], branches: [ { trigger: 'assault_group_losses_above_30_percent', action: 'pause_and_request_replan' } ] },
        { plan_id: 'COA-2', title: 'Direct', phases: [ { phase_id: 'p1', name: 'Direct', actions: [ { unit_uid: 'R-1', side: 'RED', action_type: 'attack', target: { lat: 25.30, lon: 51.30 } } ] } ] },
    ] };
}
function setPlanCommitRun(idx) { DEMO._resetCoaExecForTest(); DEMO._setCoaPlanForTest(freshPlan()); return DEMO._commitCoaForTest(idx == null ? 0 : idx); }

(async function () {
console.log('\n═══ RMOOZ-COA-COMMIT-EXECUTION-L ═══\n');

console.log('1) Commit persists active_coa_execution_state');
test('commit → active state with selected COA, phase 0, pending, commit timing', function () {
    freshScenario();
    const ex = setPlanCommitRun(0);
    assert.ok(ex && ex.active === true, 'active');
    assert.strictEqual(ex.selected_coa_id, 'COA-1');
    assert.strictEqual(ex.side, 'RED');
    assert.strictEqual(ex.current_phase_index, 0);
    assert.strictEqual(ex.phase_status, 'pending');
    assert.ok(ex.selected_coa && Array.isArray(ex.selected_coa.phases) && ex.selected_coa.phases.length === 2, 'carries the COA phases');
    assert.ok(typeof ex.last_tick_timing.coa_commit_ms === 'number', 'coa_commit_ms recorded');
    assert.ok(ex.created_at && ex.updated_at, 'timestamps');
});

console.log('\n2) + 10) Running the COA executes the current phase WITHOUT an LLM call');
test('tick moves the phase-1 unit + makes NO /plan-coas (LLM) fetch + llm_called_this_tick=false', function () {
    freshScenario(); fetchCalls.length = 0;
    setPlanCommitRun(0);
    const before = global.window.RmoozScenario.scenario.red_units[0].lat;
    const timing = DEMO._coaExecTickForTest();
    const after = global.window.RmoozScenario.scenario.red_units[0].lat;
    assert.notStrictEqual(after, before, 'R-1 moved during the deterministic tick');
    assert.ok(!fetchCalls.some(c => /plan-coas|chat\/completions|api\/ai\/generate/.test(c.url)), 'NO LLM/plan fetch on a normal tick');
    assert.strictEqual(timing.llm_called_this_tick, false, 'llm_called_this_tick=false');
    assert.ok(typeof timing.coa_tick_execute_ms === 'number' && typeof timing.replan_trigger_check_ms === 'number', 'tick timing recorded');
});

console.log('\n3) Phase advances when its orders complete');
test('after the phase-1 order completes, current_phase_index advances to 1', function () {
    freshScenario();
    setPlanCommitRun(0);
    DEMO._coaExecTickForTest();   // R-1 reaches the near target → phase-1 complete → advance
    const ex = DEMO._getCoaExecForTest();
    assert.strictEqual(ex.current_phase_index, 1, 'advanced to phase 2');
    assert.ok(ex.completed_orders.some(o => o.uid === 'R-1' && o.phase === 0), 'R-1 order recorded complete in phase 0');
});

console.log('\n4) HOLD_POSITION never moves');
test('phase-2 HOLD_POSITION leaves R-2 in place but completes the phase', function () {
    freshScenario();
    setPlanCommitRun(0);
    const r2 = global.window.RmoozScenario.scenario.red_units[1];
    const lat0 = r2.lat, lon0 = r2.lon;
    DEMO._coaExecTickForTest();   // phase-1 (moves R-1) → advance to phase-2
    DEMO._coaExecTickForTest();   // phase-2 (HOLD R-2)
    assert.strictEqual(r2.lat, lat0, 'R-2 latitude unchanged (HOLD)');
    assert.strictEqual(r2.lon, lon0, 'R-2 longitude unchanged (HOLD)');
    const ex = DEMO._getCoaExecForTest();
    assert.strictEqual(ex.phase_status, 'complete', 'COA complete after the HOLD phase');
});

console.log('\n5) + 6) Replan trigger fires + PAUSES when an assigned unit is missing');
test('missing assigned unit → trigger fired (unit_missing) and tick pauses execution', function () {
    freshScenario();
    setPlanCommitRun(0);
    // remove R-1 (the phase-1 assigned unit) from the scenario → "missing/destroyed"
    global.window.RmoozScenario.scenario.red_units = global.window.RmoozScenario.scenario.red_units.filter(u => u.id !== 'R-1');
    const trig = DEMO._checkReplanTriggersForTest();
    assert.strictEqual(trig.fired, true, 'trigger fired');
    assert.strictEqual(trig.code, 'unit_missing', 'code=unit_missing');
    const t = DEMO._coaExecTickForTest();   // tick must detect + pause, NOT move
    const ex = DEMO._getCoaExecForTest();
    assert.strictEqual(ex.replan_required, true, 'replan_required set');
    assert.strictEqual(ex.phase_status, 'blocked', 'phase_status=blocked');
    assert.ok(/missing|destroyed/i.test(ex.replan_reason), 'reason explains the missing unit');
    assert.strictEqual(t.llm_called_this_tick, false, 'still no LLM on the trigger tick');
});

console.log('\n7) Operator Replan calls the AI exactly once');
test('_replanCoa → exactly one /plan-coas (LLM) fetch + clears the committed state', function () {
    freshScenario(); fetchCalls.length = 0;
    setPlanCommitRun(0);
    DEMO._replanCoaForTest();
    const planFetches = fetchCalls.filter(c => /plan-coas/.test(c.url));
    assert.strictEqual(planFetches.length, 1, 'exactly one AI/plan call on Replan (got ' + planFetches.length + ')');
    assert.strictEqual(DEMO._getCoaExecForTest(), null, 'committed COA cleared for the fresh plan');
});

console.log('\n8) Staff-Safe stays available');
await atest('Staff-Safe Generate button present (deterministic, no LLM)', async function () {
    await new Promise(r => setTimeout(r, 15));   // let any prior in-flight generate settle (_coaLoading=false)
    DEMO._resetCoaExecForTest();
    DEMO._setCoaPlanForTest(null);
    DEMO._setRouteHealthForTest({ ok: true, allow_sim_run: true, model_available: false, provider: 'ollama', configured_provider: 'ollama', model: 'x' });
    DEMO._setPlanningModeForTest('staff_safe');
    const html = String(DEMO._renderAiDecisionHtmlForTest());
    assert.ok(/Generate Staff-Safe Plan \(fast\)/.test(html), 'Staff-Safe generate available');
    DEMO._setPlanningModeForTest('commander');
});

console.log('\n9) Deep Plan still produces 2–3 COAs (planner)');
await atest('planCoas (deterministic) returns ≥2 COAs with phases', async function () {
    const P = require(path.join(__dirname, '..', 'server', 'ai', 'free-fight-coa-planner.js'));
    const red = [{ id: 'R-1', side: 'RED', lat: 25, lon: 51 }, { id: 'R-2', side: 'RED', lat: 25.1, lon: 51.1 }, { id: 'B-1', side: 'BLUE', lat: 25.3, lon: 51.3 }];
    const p = await P.planCoas(red, [{ name: 'X', lat: 25.3, lon: 51.3 }], { active_side: 'RED' }, { preferSide: 'RED', planning_mode: 'staff_safe', ai_depth: 'normal' });
    assert.ok(Array.isArray(p.coas) && p.coas.length >= 2, 'Deep Plan yields ≥2 COAs (got ' + (p.coas || []).length + ')');
    assert.ok(p.coas.every(c => Array.isArray(c.phases)), 'each COA has phases');
});

console.log('\nUI) COA Commitment Mode controls + "AI not called on normal ticks" label');
test('control block renders Commit + status + the no-LLM note while running', function () {
    freshScenario();
    setPlanCommitRun(0);
    DEMO._coaExecTickForTest();   // running
    const html = String(DEMO._coaExecHtmlForTest());
    assert.ok(/Commit this COA/.test(html), 'Commit button');
    assert.ok(/Active COA:/.test(html) && /Current phase:/.test(html) && /Orders complete:/.test(html), 'status lines');
    assert.ok(/AI is NOT being called on normal ticks/.test(html), 'honest no-LLM label');
    assert.ok(/llm_called_this_tick:/.test(html) && /false/.test(html), 'per-tick llm flag shown');
});

console.log('\n' + (fail === 0 ? '✅ PASS' : '❌ FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail === 0 ? 0 : 1);
})();
