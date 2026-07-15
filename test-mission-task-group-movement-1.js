#!/usr/bin/env node
/**
 * test-mission-task-group-movement-1.js — Batch C Slice C2
 *
 * Mission-task-driven GROUP movement (formations): extends Slice C1 so an
 * authored mission_tasks[] entry with an explicit `unit_ids[]` (>= 2 members)
 * drives the SAME group-movement/formation machinery the SCC's manual
 * "Movement tasking" form already uses (runtime-movement.js's existing
 * `isGroup` branch of createRuntimeMovementTaskPlan -> the existing
 * startGroupMovementExecutionPlan/formationOffsetMeters) — no new engine.
 *
 * `group_id` has no unit-membership registry anywhere in this codebase
 * (confirmed by the Batch C audit), so Slice C2 resolves group membership
 * the same way the SCC's manual form already does: an explicit unit_ids[]
 * authored alongside the task.
 *
 * Proves:
 *   - runtime-events.js's normalizeMissionTasks() now echoes authored
 *     unit_ids[]
 *   - a mission task authored with >= 2 unit_ids produces a REAL formation
 *     (one leader + N-1 formation-offset followers), via the actual
 *     runtime-movement.js group-movement path, not a mock
 *   - a group task where some members are taskability-blocked filters them
 *     and still moves the rest (matching the existing single-vs-group
 *     taskability behavior already covered by
 *     test-runtime-movement-taskability-gate-1.js)
 *   - a task with a single unit_id (no unit_ids, or unit_ids.length <= 1)
 *     still takes the Slice C1 single-unit path unchanged (no regression)
 *   - source-scan: the tick function resolves group vs. single from
 *     unit_ids.length, not from group_id (group_id has no resolver)
 *
 * Sibling to test-mission-task-movement-1.js / test-runtime-group-movement-1.js.
 * Run: node test-mission-task-group-movement-1.js
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
function block(src, from, to) {
    const a = src.indexOf(from);
    if (a < 0) return '';
    const b = to ? src.indexOf(to, a + from.length) : -1;
    return src.slice(a, b < 0 ? a + 4000 : b);
}

console.log('\n=== Batch C Slice C2: mission-task-driven group movement (formations) ===\n');

function scenarioWith(task) { return { name: 'mission-group-test', mission_tasks: [task] }; }

// Same translation _startAuthoredMissionMovement performs (Slice C1 + the
// Slice C2 group extension), replicated against the real modules.
function translateAndStart(task, elapsed, movementState, context) {
    const groupUnitIds = (task.unit_ids || []).filter(Boolean);
    const isGroup = groupUnitIds.length > 1;
    const input = {
        movement_id: 'mission-task-' + task.id,
        route: task.route,
        start_elapsed_hours: task.start_elapsed_hours != null ? task.start_elapsed_hours : elapsed
    };
    if (isGroup) { input.unit_ids = groupUnitIds; input.leader_unit_id = task.unit_id || groupUnitIds[0]; }
    else { input.unit_id = task.unit_id; }
    const built = Movement.createRuntimeMovementTaskPlan(input, context || {});
    if (!built || built.ok === false || !built.plan) return { built: built, result: null, isGroup: isGroup };
    const result = Movement.addRuntimeMovementPlan(movementState, built.plan, context || {});
    return { built: built, result: result, isGroup: isGroup };
}

// ── 1. normalizeMissionTasks echoes unit_ids ────────────────────────────────
console.log('\n[1] runtime-events.js echoes authored unit_ids[]');
{
    const task = { id: 'g1', unit_id: 'U1', start_elapsed_hours: 0, enabled: true, route: [[0, 0], [1, 0]], unit_ids: ['U1', 'U2', 'U3'] };
    const norm = RuntimeEvents.normalizeMissionTasks(scenarioWith(task))[0];
    ok(Array.isArray(norm.unit_ids) && norm.unit_ids.length === 3, 'normalizeMissionTasks echoes unit_ids');
    const active = RuntimeEvents.activeMissionTasks(scenarioWith(task), 0)[0];
    ok(Array.isArray(active.unit_ids) && active.unit_ids.join(',') === 'U1,U2,U3', 'activeMissionTasks carries unit_ids through');
}

// ── 2. A real group task produces a real formation ─────────────────────────
console.log('\n[2] Group mission task produces a real leader + formation-offset followers');
{
    const task = { id: 'g2', unit_id: 'U1', start_elapsed_hours: 0, enabled: true, route: [[0, 0], [1, 0]], unit_ids: ['U1', 'U2', 'U3'] };
    const context = {
        elapsed_hours: 0,
        runtime_positions: { U1: [0, 0], U2: [0, 0], U3: [0, 0] },
        units: [
            { unit_id: 'U1', position: [0, 0], domain: 'ground' },
            { unit_id: 'U2', position: [0, 0], domain: 'ground' },
            { unit_id: 'U3', position: [0, 0], domain: 'ground' }
        ]
    };
    const { built, result, isGroup } = translateAndStart(task, 0, null, context);
    ok(isGroup === true, 'task with 3 unit_ids is classified as a group task');
    ok(built && built.ok === true && built.plan.kind === 'runtime_group_movement', 'a real runtime_group_movement plan is built');
    eq(built.plan.leader_unit_id, 'U1', 'leader defaults to the task unit_id');

    const gm = result.state.group_movements['mission-task-g2'];
    ok(!!gm, 'a real group_movement record exists in the engine state');
    eq(gm.unit_ids.length, 3, 'group movement carries all 3 unit_ids');
    const memberMovementIds = Object.keys(result.state.movements);
    eq(memberMovementIds.length, 3, 'one per-unit movement record exists per group member');

    const tick = Movement.updateRuntimeMovementState(result.state, 5, {});
    const mv1 = tick.state.movements[gm.unit_movements['U1']];
    const mv2 = tick.state.movements[gm.unit_movements['U2']];
    ok(mv1 && mv1.progress > 0, 'leader genuinely advances along the route');
    ok(mv2 && mv2.progress > 0, 'follower genuinely advances too (real formation, not a stub)');
}

// ── 3. Partially-blocked group still moves the taskable remainder ──────────
console.log('\n[3] Group task with a blocked member still moves the rest (existing gate, reused unchanged)');
{
    const task = { id: 'g3', unit_id: 'U1', start_elapsed_hours: 0, enabled: true, route: [[0, 0], [1, 0]], unit_ids: ['U1', 'U2', 'U3'] };
    const context = {
        elapsed_hours: 0,
        runtime_positions: { U1: [0, 0], U2: [0, 0], U3: [0, 0] },
        units: [
            { unit_id: 'U1', position: [0, 0], domain: 'ground' },
            { unit_id: 'U2', position: [0, 0], domain: 'ground' },
            { unit_id: 'U3', position: [0, 0], domain: 'ground' }
        ],
        classifyUnit: function (uid) { return uid === 'U3' ? { taskable: false, reason: 'needs_review' } : { taskable: true }; }
    };
    const { built } = translateAndStart(task, 0, null, context);
    ok(built && built.ok === true, 'group with 2 taskable + 1 blocked still succeeds');
    eq(built.plan.unit_ids.length, 2, 'blocked unit U3 is dropped from the group plan');
    ok(built.plan.unit_ids.indexOf('U3') === -1, 'U3 specifically is excluded');
    ok(built.blocked_units && built.blocked_units.some(function (b) { return b.id === 'U3'; }), 'blocked_units reports U3 with a reason');
}

// ── 4. Single-unit tasks are unaffected (no regression) ─────────────────────
console.log('\n[4] Single-unit task (no unit_ids) still takes the Slice C1 single-unit path');
{
    const task = { id: 'g4', unit_id: 'U1', start_elapsed_hours: 0, enabled: true, route: [[0, 0], [1, 0]], unit_ids: [] };
    const context = { elapsed_hours: 0, runtime_positions: { U1: [0, 0] }, units: [{ unit_id: 'U1', position: [0, 0], domain: 'ground' }] };
    const { built, isGroup } = translateAndStart(task, 0, null, context);
    eq(isGroup, false, 'a task with unit_ids.length <= 1 is NOT classified as a group');
    ok(built && built.ok === true && built.plan.kind === 'runtime_movement', 'single-unit plan is built exactly as in Slice C1');
}

// ── 5. Source-scan: group resolution comes from unit_ids, not group_id ─────
console.log('\n[5] Source-scan — group/formation resolved from unit_ids, group_id has no resolver');
{
    const fn = block(ffSrc, 'function _startAuthoredMissionMovement', 'function _missionTaskMovementLookup');
    ok(/task\.unit_ids/.test(fn), 'tick function reads task.unit_ids');
    ok(/groupUnitIds\.length > 1/.test(fn), 'group classification is driven by unit_ids.length, not group_id');
    ok(!/task\.group_id/.test(fn), 'task.group_id is not read as a resolver (no membership registry exists for it)');
}

console.log('\n' + (fail === 0 ? 'OK' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
