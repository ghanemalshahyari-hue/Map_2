'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const Movement = require(path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'runtime-movement.js'));
const movementSrc = fs.readFileSync(path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'runtime-movement.js'), 'utf8');

let passed = 0;
let failed = 0;
function ok(label, cond, detail) {
    if (cond) { passed += 1; console.log('  PASS  ' + label); }
    else { failed += 1; console.error('  FAIL  ' + label + (detail ? ' -- ' + detail : '')); }
}
function clone(v) { return JSON.parse(JSON.stringify(v)); }
function arr(v) { return Array.isArray(v) ? v : []; }
function eventList(st, kind) {
    return arr(st && st.movement_runtime_events).filter(function (e) { return e && e.kind === kind; });
}
function unitPlan(id, overrides) {
    overrides = overrides || {};
    const top = overrides.top || {};
    const payload = Object.assign({
        unit_id: 'U1',
        from: [0, 0],
        to: [0.01, 0],
        route: [[0, 0], [0.01, 0]],
        speed_kph: 111.195
    }, overrides.payload || {});
    return Object.assign({
        execution_id: id,
        movement_id: id,
        effect_kind: 'runtime_movement',
        classification: 'requires_world_state_executor',
        status: 'requires_executor',
        payload: payload
    }, top);
}
function groupPlan(id, overrides) {
    return Object.assign({
        kind: 'runtime_group_movement',
        movement_id: id,
        group_id: 'G1',
        unit_ids: ['U1', 'U2', 'U3'],
        leader_unit_id: 'U1',
        route: [[0, 0], [0.01, 0]],
        formation: 'column',
        spacing_meters: 250,
        speed_kph: 111.195,
        domain: 'ground'
    }, overrides || {});
}

console.log('\n=== MOV5 runtime movement arrival triggers ===\n');

(function () {
    const started = Movement.startMovementExecutionPlans(null, [unitPlan('unit-arrival-trigger-1')], { elapsed_hours: 0 });
    const first = Movement.updateRuntimeMovementState(started.state, 1, { scenario_time_label: 'H+1' });
    const second = Movement.updateRuntimeMovementState(first.state, 2, { scenario_time_label: 'H+2' });
    ok('T-1 unit arrival fires movement_unit_arrived once',
        eventList(first.state, 'movement_unit_arrived').length === 1 &&
        eventList(second.state, 'movement_unit_arrived').length === 1);
})();

(function () {
    const started = Movement.startMovementExecutionPlans(null, [groupPlan('group-arrival-trigger-1')], { elapsed_hours: 0 });
    const done = Movement.updateRuntimeMovementState(started.state, 1, { scenario_time_label: 'H+1' });
    ok('T-2 group arrival fires movement_group_arrived once',
        eventList(done.state, 'movement_group_arrived').length === 1 &&
        done.group_arrivals.length === 1);
})();

(function () {
    const started = Movement.startMovementExecutionPlans(null, [unitPlan('dedupe-arrival-trigger-1')], { elapsed_hours: 0 });
    const first = Movement.updateRuntimeMovementState(started.state, 1, {});
    const second = Movement.updateRuntimeMovementState(first.state, 2, {});
    const third = Movement.updateRuntimeMovementState(second.state, 3, {});
    ok('T-3 repeated ticks after arrival no duplicate arrival trigger',
        eventList(first.state, 'movement_unit_arrived').length === 1 &&
        eventList(second.state, 'movement_unit_arrived').length === 1 &&
        eventList(third.state, 'movement_unit_arrived').length === 1);
})();

(function () {
    const plan = unitPlan('notify-arrival-trigger-1', {
        top: {
            on_arrival: [{
                id: 'arrival-notify-1',
                kind: 'add_notification',
                title: 'Movement complete',
                payload: { message: 'U1 arrived' }
            }]
        }
    });
    const started = Movement.startMovementExecutionPlans(null, [plan], { elapsed_hours: 0 });
    const done = Movement.updateRuntimeMovementState(started.state, 1, {});
    const note = eventList(done.state, 'add_notification').filter(function (e) { return e.trigger_id === 'arrival-notify-1'; })[0];
    ok('T-4 on_arrival add_notification produces safe runtime event/log entry',
        note && note.status === 'applied_safe' && note.title === 'Movement complete');
})();

(function () {
    const plan = unitPlan('decision-arrival-trigger-1', {
        top: {
            on_arrival: [{
                id: 'arrival-decision-1',
                kind: 'open_decision_point',
                title: 'Choose next movement',
                decision_point_id: 'dp-move-next',
                payload: { prompt: 'Hold or continue?' }
            }]
        }
    });
    const started = Movement.startMovementExecutionPlans(null, [plan], { elapsed_hours: 0 });
    const done = Movement.updateRuntimeMovementState(started.state, 1, {});
    const dp = done.state.pending_decision_points && done.state.pending_decision_points['dp-move-next'];
    ok('T-5 on_arrival open_decision_point creates pending decision state, no effects executed',
        dp && dp.status === 'pending' &&
        !Array.isArray(done.state.executed_effects) &&
        !Array.isArray(done.state.pending_execution_plans));
})();

(function () {
    const scenario = { units: [{ id: 'U1', position: [0, 0], domain: 'ground' }] };
    const before = clone(scenario);
    const started = Movement.startMovementExecutionPlans(null, [unitPlan('immut-scenario-arrival-1')], { elapsed_hours: 0, units: scenario.units });
    Movement.updateRuntimeMovementState(started.state, 1, {});
    ok('T-6 no scenario mutation', JSON.stringify(scenario) === JSON.stringify(before));
})();

(function () {
    global.window = { units: [{ uid: 'U1', coord: [99, 99] }], map: { stable: true } };
    const beforeUnits = clone(global.window.units);
    const beforeMap = clone(global.window.map);
    const started = Movement.startMovementExecutionPlans(null, [unitPlan('immut-window-arrival-1')], { elapsed_hours: 0 });
    Movement.updateRuntimeMovementState(started.state, 1, {});
    ok('T-7 no window.units/map mutation',
        JSON.stringify(global.window.units) === JSON.stringify(beforeUnits) &&
        JSON.stringify(global.window.map) === JSON.stringify(beforeMap));
    delete global.window;
})();

(function () {
    const started = Movement.startMovementExecutionPlans(null, [unitPlan('pause-delay-arrival-1')], { elapsed_hours: 0 });
    const mid = Movement.updateRuntimeMovementState(started.state, 0.005, {});
    const paused = Movement.updateRuntimeMovementState(mid.state, 0.02, { paused: true });
    ok('T-8 pause before arrival delays trigger',
        eventList(paused.state, 'movement_unit_arrived').length === 0 &&
        paused.state.movements['pause-delay-arrival-1'].status === 'paused');
})();

(function () {
    const started = Movement.startMovementExecutionPlans(null, [unitPlan('resume-arrival-trigger-1')], { elapsed_hours: 0 });
    const mid = Movement.updateRuntimeMovementState(started.state, 0.005, {});
    const paused = Movement.updateRuntimeMovementState(mid.state, 0.02, { paused: true });
    const resumed = Movement.updateRuntimeMovementState(paused.state, 0.03, {});
    const again = Movement.updateRuntimeMovementState(resumed.state, 0.04, {});
    ok('T-9 resume then arrival fires once',
        eventList(resumed.state, 'movement_unit_arrived').length === 1 &&
        eventList(again.state, 'movement_unit_arrived').length === 1);
})();

(function () {
    const started = Movement.startMovementExecutionPlans(null, [groupPlan('group-waits-arrival-1')], { elapsed_hours: 0 });
    started.state.movements['group-waits-arrival-1:U3'].eta_elapsed_hours = 0.2;
    const partial = Movement.updateRuntimeMovementState(started.state, 0.05, {});
    const done = Movement.updateRuntimeMovementState(partial.state, 0.3, {});
    ok('T-10 group arrival waits until group completion',
        eventList(partial.state, 'movement_group_arrived').length === 0 &&
        eventList(done.state, 'movement_group_arrived').length === 1);
})();

(function () {
    ok('T-11 no steps[] dependency', !/\bsteps\s*\[/.test(movementSrc));
})();

if (failed) {
    console.error('\nMOV5 arrival triggers failed: ' + failed + ' failure(s).');
    process.exit(1);
}
console.log('\nMOV5 arrival triggers passed: ' + passed + ' assertions.');
