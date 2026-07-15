#!/usr/bin/env node
/**
 * test-mission-task-movement-1.js — Batch C Slice C1
 *
 * Mission-task-driven unit movement: authored mission_tasks[].route now
 * drives the SAME runtime-movement engine the SCC's manual "Movement
 * tasking" form already uses (runtime-movement.js's
 * createRuntimeMovementTaskPlan -> addRuntimeMovementPlan ->
 * updateRuntimeMovementState) — via a new tick function,
 * free-fight-demo.js::_startAuthoredMissionMovement, called every
 * _coaExecTick alongside the existing _tickRuntimeMovement.
 *
 * Proves:
 *   - runtime-events.js's normalizeMissionTasks()/activeMissionTasks() now
 *     echo the authored `route` (Slice C1 changed this from "authoring-only")
 *   - a task not yet in its elapsed-time window produces no movement
 *   - a task in-window, translated exactly the way the new tick function
 *     does, flows through the real runtime-movement engine and the unit's
 *     position genuinely advances along the authored route over time
 *   - a taskability-blocked unit's task is rejected with a real reason,
 *     mirroring the manual-tasking gate (Batch B Slice 3), not silently
 *     dropped
 *   - a route-less/unit_id-less task is a no-op, not an error
 *   - re-deriving the same task's movement plan twice (simulating two
 *     ticks) does not double-start it — the deterministic
 *     `mission-task-<id>` movement_id lets the engine's own dedup do this,
 *     no separate "started" bookkeeping needed
 *   - source-scan: the new tick function is wired into _coaExecTick, calls
 *     the real APIs, and never touches _writeMoveFrame/_resolveCoaMoves
 *     (the separate COA-direct-mutation path) — no third movement engine
 *
 * Sibling to test-runtime-movement-tasking-ui-1.js. Run:
 *   node test-mission-task-movement-1.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const RuntimeEvents = require(path.join(ROOT, 'UI_MOdified/client/shell/runtime-events.js'));
const Movement = require(path.join(ROOT, 'UI_MOdified/client/shell/runtime-movement.js'));
const ffSrc = fs.readFileSync(path.join(ROOT, 'UI_MOdified/client/shell/free-fight-demo.js'), 'utf8');

let pass = 0, fail = 0;
function ok(cond, label, detail) {
    if (cond) { console.log('  ok   ' + label); pass++; }
    else      { console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); fail++; }
}
function eq(a, b, label) { ok(a === b, label, 'expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a)); }
function close(a, b, eps) { return Math.abs(+a - +b) < (eps == null ? 1e-4 : eps); }
function block(src, from, to) {
    const a = src.indexOf(from);
    if (a < 0) return '';
    const b = to ? src.indexOf(to, a + from.length) : -1;
    return src.slice(a, b < 0 ? a + 4000 : b);
}

console.log('\n=== Batch C Slice C1: mission-task-driven unit movement ===\n');

function scenarioWith(task) {
    return { name: 'mission-movement-test', mission_tasks: [task] };
}

// The exact translation _startAuthoredMissionMovement performs, replicated
// here against the real modules (not a mock) so this test proves genuine
// data flow, not just that the source text looks right.
function translateAndStart(task, elapsed, movementState, context) {
    const built = Movement.createRuntimeMovementTaskPlan({
        movement_id: 'mission-task-' + task.id,
        unit_id: task.unit_id,
        route: task.route,
        start_elapsed_hours: task.start_elapsed_hours != null ? task.start_elapsed_hours : elapsed
    }, context || {});
    if (!built || built.ok === false || !built.plan) return { built: built, result: null };
    const result = Movement.addRuntimeMovementPlan(movementState, built.plan, context || {});
    return { built: built, result: result };
}

// ── 1. normalizeMissionTasks/activeMissionTasks echo the authored route ────
console.log('\n[1] runtime-events.js echoes route (Slice C1 changes this from authoring-only)');
{
    const task = {
        id: 'm1', unit_id: 'U1', kind: 'task', start_elapsed_hours: 2, enabled: true,
        route: [[0, 0], [1, 0]]
    };
    const norm = RuntimeEvents.normalizeMissionTasks(scenarioWith(task))[0];
    ok(Array.isArray(norm.route) && norm.route.length === 2, 'normalizeMissionTasks echoes route');

    const before = RuntimeEvents.activeMissionTasks(scenarioWith(task), 1.9);
    eq(before.length, 0, 'task before its start_elapsed_hours is not active');

    const active = RuntimeEvents.activeMissionTasks(scenarioWith(task), 2.0);
    eq(active.length, 1, 'task at/after its start_elapsed_hours is active');
    ok(Array.isArray(active[0].route) && active[0].route.length === 2, 'active task carries its route');
}

// ── 2. In-window task flows through the real movement engine ──────────────
console.log('\n[2] In-window mission task genuinely moves the unit');
{
    const task = { id: 'm2', unit_id: 'U1', kind: 'task', start_elapsed_hours: 0, enabled: true, route: [[0, 0], [1, 0]] };
    const active = RuntimeEvents.activeMissionTasks(scenarioWith(task), 0);
    const context = { elapsed_hours: 0, runtime_positions: { U1: [0, 0] }, units: [{ unit_id: 'U1', position: [0, 0], domain: 'ground' }] };
    const { built, result } = translateAndStart(active[0], 0, null, context);
    ok(built && built.ok === true, 'plan built successfully for an in-window task');
    ok(result && result.created.length === 1, 'movement started for the tasked unit');

    const tick = Movement.updateRuntimeMovementState(result.state, 5, {});
    const mv = tick.state.movements['mission-task-m2'];
    ok(mv && mv.progress > 0, 'unit position genuinely advances along the authored route', JSON.stringify(mv));
}

// ── 3. Taskability-blocked unit is rejected with a real reason ────────────
console.log('\n[3] Taskability-blocked unit is rejected, not silently dropped');
{
    const task = { id: 'm3', unit_id: 'U1', kind: 'task', start_elapsed_hours: 0, enabled: true, route: [[0, 0], [1, 0]] };
    const active = RuntimeEvents.activeMissionTasks(scenarioWith(task), 0);
    const context = {
        elapsed_hours: 0,
        runtime_positions: { U1: [0, 0] },
        units: [{ unit_id: 'U1', position: [0, 0], domain: 'ground' }],
        classifyUnit: function () { return { taskable: false, reason: 'needs_review' }; }
    };
    const { built } = translateAndStart(active[0], 0, null, context);
    ok(built && built.ok === false, 'plan is rejected for a non-taskable unit');
    ok(typeof built.message === 'string' && built.message.length > 0, 'rejection carries a real, user-facing reason', built && built.message);
}

// ── 4. Route-less / unit_id-less task guard exists in the tick function ───
// Batch C Slice C2 extended this guard to allow group tasks (unit_ids.length
// > 1) with no single unit_id — the assertion is updated to match, same as
// how Slice C1 updated test-edit-mode-missions-slice.js's route assertion.
console.log('\n[4] Route-less / (unit_id-less AND not-a-group) tasks are a no-op (source-scan)');
{
    const fn = block(ffSrc, 'function _startAuthoredMissionMovement', 'function _missionTaskMovementLookup');
    ok(/!task \|\| !Array\.isArray\(task\.route\) \|\| task\.route\.length < 2/.test(fn),
        'guard skips tasks with route.length < 2');
    ok(/!isGroup && !task\.unit_id/.test(fn),
        'guard skips non-group tasks with no unit_id');
}

// ── 5. Deterministic movement_id makes re-derivation idempotent ───────────
console.log('\n[5] Re-deriving the same task twice does not double-start it');
{
    const task = { id: 'm5', unit_id: 'U1', kind: 'task', start_elapsed_hours: 0, enabled: true, route: [[0, 0], [1, 0]] };
    const context = { elapsed_hours: 0, runtime_positions: { U1: [0, 0] }, units: [{ unit_id: 'U1', position: [0, 0], domain: 'ground' }] };
    const first = translateAndStart(task, 0, null, context);
    ok(first.result.created.length === 1, 'first tick starts the movement');
    const second = translateAndStart(task, 0, first.result.state, context);
    ok(second.result.created.length === 0, 'second tick (same task, same movement_id) creates nothing new — engine-level dedup');
    eq(Object.keys(second.result.state.movements).length, 1, 'exactly one movement record exists after two ticks');

    const fn = block(ffSrc, 'function _missionTaskMovementId', 'function _startAuthoredMissionMovement');
    ok(/'mission-task-' \+ String/.test(fn), 'movement_id is deterministic (task.id-derived), not destination/time-derived');
}

// ── 6. Source-scan: wiring + no third movement engine ─────────────────────
console.log('\n[6] Source-scan — wired into the tick loop, no _writeMoveFrame/_resolveCoaMoves');
{
    // Post-C10-correction: _startAuthoredMissionMovement() is called via the
    // shared _tickScenarioClockAndRuntimeEvents() helper (so it also runs
    // once COA phases exhaust — see test-runtime-post-phase-continuity-1.js),
    // not inlined directly in _coaExecTick() anymore. Verify the real call
    // chain: _coaExecTick -> the helper -> _startAuthoredMissionMovement.
    const tickFn = block(ffSrc, 'function _coaExecTick', 'function _coaExecTickMs');
    ok(/_tickScenarioClockAndRuntimeEvents\(\)/.test(tickFn), '_coaExecTick calls the shared _tickScenarioClockAndRuntimeEvents() helper every tick');
    const helperFn = block(ffSrc, 'function _tickScenarioClockAndRuntimeEvents', 'function _coaExecTick');
    ok(/_startAuthoredMissionMovement\(\)/.test(helperFn), 'the shared helper calls _startAuthoredMissionMovement');

    const fnBody = block(ffSrc, 'function _startAuthoredMissionMovement', 'function _missionTaskMovementLookup');
    ok(/API\.activeMissionTasks/.test(fnBody), 'reads AppRuntimeEvents.activeMissionTasks');
    ok(/MOV\.createRuntimeMovementTaskPlan/.test(fnBody), 'builds a plan via AppRuntimeMovement.createRuntimeMovementTaskPlan');
    ok(/MOV\.addRuntimeMovementPlan/.test(fnBody), 'starts the plan via AppRuntimeMovement.addRuntimeMovementPlan');
    ok(!/_writeMoveFrame|_resolveCoaMoves/.test(fnBody), 'never touches the separate COA-direct-mutation path (no third movement engine)');
}

console.log('\n' + (fail === 0 ? 'OK' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
