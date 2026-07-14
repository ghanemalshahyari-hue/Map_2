'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const Movement = require(path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'runtime-movement.js'));
const RuntimeEvents = require(path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'runtime-events.js'));

let passed = 0;
let failed = 0;
function ok(label, cond) {
    if (cond) { passed += 1; console.log('  PASS  ' + label); }
    else { failed += 1; console.error('  FAIL  ' + label); }
}
function clone(v) { return JSON.parse(JSON.stringify(v)); }
function close(a, b) { return Math.abs(+a - +b) < 1e-6; }
function basePlan(id, speed) {
    return {
        execution_id: id,
        effect_kind: 'runtime_movement',
        classification: 'requires_world_state_executor',
        status: 'requires_executor',
        payload: {
            unit_id: 'U1',
            from: [0, 0],
            to: [1, 0],
            route: [[0, 0], [1, 0]],
            speed: speed == null ? 0.25 : speed
        }
    };
}

console.log('\n=== MOV1 movement-only runtime executor ===\n');

(function () {
    const effect = {
        effect_id: 'approved-move-1',
        event_id: 'evt-move',
        kind: 'runtime_movement',
        status: 'approved_pending_execution',
        payload: { unit_id: 'U1', from: [0, 0], to: [1, 0], speed: 0.25 },
        approval_decision: { operator_id: 'operator' }
    };
    const planned = RuntimeEvents.buildRuntimeExecutionPlans({ approved_effects: [effect] }, { planned_at_elapsed_hours: 0 });
    const plan = planned.state.pending_execution_plans[0];
    const started = Movement.startMovementExecutionPlans(null, [plan], { elapsed_hours: 0 });
    ok('T-1 approved movement effect creates movement execution plan',
        plan && plan.effect_kind === 'runtime_movement' &&
        plan.status === 'requires_executor' &&
        started.created.length === 1 &&
        started.created[0].unit_id === 'U1');
})();

(function () {
    const started = Movement.startMovementExecutionPlans(null, [basePlan('move-1', 0.25)], { elapsed_hours: 0 });
    const res = Movement.updateRuntimeMovementState(started.state, 2, {});
    const mv = res.state.movements['move-1'];
    const pos = res.state.runtime_positions.U1;
    ok('T-2 unit moves from A to B over scenario time',
        mv && mv.status === 'moving' && close(mv.progress, 0.5) && close(pos[0], 0.5) && close(pos[1], 0));
})();

(function () {
    const started = Movement.startMovementExecutionPlans(null, [basePlan('pause-1', 0.25)], { elapsed_hours: 0 });
    const mid = Movement.updateRuntimeMovementState(started.state, 2, {});
    const paused = Movement.updateRuntimeMovementState(mid.state, 3, { paused: true });
    const pos = paused.state.runtime_positions.U1;
    const mv = paused.state.movements['pause-1'];
    ok('T-3 pause freezes movement',
        mv && mv.status === 'paused' && close(mv.progress, 0.5) && close(pos[0], 0.5));
})();

(function () {
    const started = Movement.startMovementExecutionPlans(null, [basePlan('resume-1', 0.25)], { elapsed_hours: 0 });
    const mid = Movement.updateRuntimeMovementState(started.state, 2, {});
    const paused = Movement.updateRuntimeMovementState(mid.state, 3, { paused: true });
    const resumed = Movement.updateRuntimeMovementState(paused.state, 3, {});
    const arrived = Movement.updateRuntimeMovementState(resumed.state, 5, {});
    const mv = arrived.state.movements['resume-1'];
    ok('T-4 resume continues after paused duration',
        mv && mv.status === 'arrived' && close(mv.progress, 1) && close(arrived.state.runtime_positions.U1[0], 1));
})();

(function () {
    const slow = Movement.startMovementExecutionPlans(null, [basePlan('slow-1', 0.25)], { elapsed_hours: 0 });
    const fast = Movement.startMovementExecutionPlans(null, [basePlan('fast-1', 0.5)], { elapsed_hours: 0 });
    const slowTick = Movement.updateRuntimeMovementState(slow.state, 1, {});
    const fastTick = Movement.updateRuntimeMovementState(fast.state, 1, {});
    ok('T-5 speed affects progress',
        fastTick.state.movements['fast-1'].progress > slowTick.state.movements['slow-1'].progress);
})();

(function () {
    const started = Movement.startMovementExecutionPlans(null, [basePlan('arrival-1', 0.5)], { elapsed_hours: 0 });
    const first = Movement.updateRuntimeMovementState(started.state, 5, {});
    const second = Movement.updateRuntimeMovementState(first.state, 6, {});
    ok('T-6 arrival fires once',
        first.arrivals.length === 1 && second.arrivals.length === 0 && second.state.arrival_events.length === 1);
})();

(function () {
    const scenario = { name: 'MOV1', units: [{ id: 'U1', position: [0, 0] }], runtime_scenario: { start_hours: 0 } };
    const before = clone(scenario);
    const started = Movement.startMovementExecutionPlans(null, [basePlan('immut-1', 0.25)], { elapsed_hours: 0, units: scenario.units });
    Movement.updateRuntimeMovementState(started.state, 2, {});
    ok('T-7 scenario JSON not mutated', JSON.stringify(scenario) === JSON.stringify(before));
})();

(function () {
    const src = fs.readFileSync(path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'runtime-movement.js'), 'utf8');
    ok('T-8 authored progress rows are not used', !/\bsteps\s*\[|\bsteps\b/.test(src));
})();

(function () {
    const started = Movement.startMovementExecutionPlans(null, [basePlan('world-1', 0.25)], { elapsed_hours: 0 });
    const res = Movement.updateRuntimeMovementState(started.state, 2, {});
    const entry = res.state.runtime_world_state.positions.U1;
    ok('T-9 runtime-owned world state receives position',
        entry && entry.source === 'runtime_movement' && close(entry.position[0], 0.5));
})();

(function () {
    const src = fs.readFileSync(path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'runtime-movement.js'), 'utf8');
    ok('T-10 executor does not touch map/applyState/window.units',
        !/AppAdjudicatorMap|applyState|window\.units/.test(src));
})();

(function () {
    const src = fs.readFileSync(path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'scenario-control-center.js'), 'utf8');
    ok('T-11 SCC shows moving/ETA runtime language',
        src.includes('Scenario movement runtime') && src.includes('Next ETA') && src.includes('runtimeMovementSummary'));
})();

if (failed) {
    console.error('\nMOV1 movement executor failed: ' + failed + ' failure(s).');
    process.exit(1);
}
console.log('\nMOV1 movement executor passed: ' + passed + ' assertions.');
