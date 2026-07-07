'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const Movement = require(path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'runtime-movement.js'));
const movementSrc = fs.readFileSync(path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'runtime-movement.js'), 'utf8');

let passed = 0;
let failed = 0;
function ok(label, cond) {
    if (cond) { passed += 1; console.log('  PASS  ' + label); }
    else { failed += 1; console.error('  FAIL  ' + label); }
}
function close(a, b, eps) { return Math.abs(+a - +b) < (eps == null ? 1e-4 : eps); }
function clone(v) { return JSON.parse(JSON.stringify(v)); }

function plan(id, payload) {
    return {
        execution_id: id,
        effect_kind: 'runtime_movement',
        classification: 'requires_world_state_executor',
        status: 'requires_executor',
        payload: Object.assign({
            unit_id: 'U1',
            from: [0, 0],
            to: [0, 2],
            route: [[0, 0], [0, 1], [0, 2]]
        }, payload || {})
    };
}

console.log('\n=== MOV3 runtime movement routes and speed model ===\n');

(function () {
    const started = Movement.startMovementExecutionPlans(null, [plan('route-segments-1', { speed_kph: 111.195 })], { elapsed_hours: 0 });
    const seg1 = Movement.updateRuntimeMovementState(started.state, 0.5, {});
    const seg2 = Movement.updateRuntimeMovementState(seg1.state, 1.5, {});
    const a = seg1.state.movements['route-segments-1'];
    const b = seg2.state.movements['route-segments-1'];
    ok('T-1 route with three points moves along segment 1 then segment 2',
        a.current_segment_index === 0 && b.current_segment_index === 1 &&
        seg1.state.runtime_positions.U1[1] > 0 && seg1.state.runtime_positions.U1[1] < 1 &&
        seg2.state.runtime_positions.U1[1] > 1 && seg2.state.runtime_positions.U1[1] < 2);
})();

(function () {
    const started = Movement.startMovementExecutionPlans(null, [plan('distance-1', { speed_kph: 100 })], { elapsed_hours: 0 });
    const mv = started.state.movements['distance-1'];
    ok('T-2 distance_km is computed', mv.distance_km > 220 && mv.distance_km < 223);
})();

(function () {
    const started = Movement.startMovementExecutionPlans(null, [plan('eta-1', { speed_kph: 111.195 })], { elapsed_hours: 3 });
    const mv = started.state.movements['eta-1'];
    ok('T-3 ETA is computed from speed_kph', close(mv.eta_elapsed_hours, 5, 0.02));
})();

(function () {
    const slow = Movement.startMovementExecutionPlans(null, [plan('slow-kph-1', { speed_kph: 50 })], { elapsed_hours: 0 });
    const fast = Movement.startMovementExecutionPlans(null, [plan('fast-kph-1', { speed_kph: 100 })], { elapsed_hours: 0 });
    const slowTick = Movement.updateRuntimeMovementState(slow.state, 1, {});
    const fastTick = Movement.updateRuntimeMovementState(fast.state, 1, {});
    ok('T-4 speed_kph affects progress',
        fastTick.state.movements['fast-kph-1'].progress > slowTick.state.movements['slow-kph-1'].progress);
})();

(function () {
    const started = Movement.startMovementExecutionPlans(null, [plan('knots-1', { speed_knots: 10 })], { elapsed_hours: 0 });
    const mv = started.state.movements['knots-1'];
    ok('T-5 speed_knots is converted correctly',
        close(mv.speed_kph, 18.52, 0.001) && mv.speed_source === 'speed_knots');
})();

(function () {
    const started = Movement.startMovementExecutionPlans(null, [plan('domain-default-1', { domain: 'air' })], { elapsed_hours: 0 });
    const mv = started.state.movements['domain-default-1'];
    ok('T-6 domain default speed is used when no speed is provided',
        close(mv.speed_kph, 800, 0.001) && mv.speed_source === 'domain_default');
})();

(function () {
    const started = Movement.startMovementExecutionPlans(null, [plan('pause-route-1', { speed_kph: 111.195 })], { elapsed_hours: 0 });
    const mid = Movement.updateRuntimeMovementState(started.state, 0.75, {});
    const paused = Movement.updateRuntimeMovementState(mid.state, 2, { paused: true });
    ok('T-7 pause freezes route progress',
        close(paused.state.movements['pause-route-1'].progress, mid.state.movements['pause-route-1'].progress) &&
        close(paused.state.runtime_positions.U1[1], mid.state.runtime_positions.U1[1]));
})();

(function () {
    const started = Movement.startMovementExecutionPlans(null, [plan('resume-route-1', { speed_kph: 111.195 })], { elapsed_hours: 0 });
    const mid = Movement.updateRuntimeMovementState(started.state, 0.75, {});
    const paused = Movement.updateRuntimeMovementState(mid.state, 2, { paused: true });
    const resumed = Movement.updateRuntimeMovementState(paused.state, 2.5, {});
    ok('T-8 resume continues route progress',
        resumed.state.movements['resume-route-1'].progress > paused.state.movements['resume-route-1'].progress);
})();

(function () {
    const started = Movement.startMovementExecutionPlans(null, [plan('arrival-route-1', { speed_kph: 222.39 })], { elapsed_hours: 0 });
    const first = Movement.updateRuntimeMovementState(started.state, 2, {});
    const second = Movement.updateRuntimeMovementState(first.state, 3, {});
    ok('T-9 arrival fires once at final route coordinate',
        first.arrivals.length === 1 && second.arrivals.length === 0 &&
        close(second.state.runtime_positions.U1[0], 0) && close(second.state.runtime_positions.U1[1], 2));
})();

(function () {
    const started = Movement.startMovementExecutionPlans(null, [plan('fallback-1', { route: null, from: [1, 1], to: [1, 2], speed_kph: 111.195 })], { elapsed_hours: 0 });
    const mv = started.state.movements['fallback-1'];
    ok('T-10 from/to fallback works when route is missing',
        Array.isArray(mv.route) && mv.route.length === 2 && close(mv.route[0][0], 1) && close(mv.route[1][1], 2));
})();

(function () {
    const scenario = { units: [{ id: 'U1', position: [0, 0], domain: 'ground', speed_kph: 55 }] };
    const before = clone(scenario);
    const started = Movement.startMovementExecutionPlans(null, [plan('immut-scenario-1', { speed_kph: 111.195 })], { elapsed_hours: 0, units: scenario.units });
    Movement.updateRuntimeMovementState(started.state, 1, {});
    ok('T-11 scenario JSON is not mutated', JSON.stringify(scenario) === JSON.stringify(before));
})();

(function () {
    global.window = { units: [{ uid: 'U1', coord: [99, 99] }] };
    const before = clone(global.window.units);
    const started = Movement.startMovementExecutionPlans(null, [plan('immut-window-1', { speed_kph: 111.195 })], { elapsed_hours: 0 });
    Movement.updateRuntimeMovementState(started.state, 1, {});
    ok('T-12 window.units is not mutated', JSON.stringify(global.window.units) === JSON.stringify(before));
    delete global.window;
})();

(function () {
    ok('T-13 no steps[] dependency', !/\bsteps\s*\[/.test(movementSrc));
})();

if (failed) {
    console.error('\nMOV3 routes/speed failed: ' + failed + ' failure(s).');
    process.exit(1);
}
console.log('\nMOV3 routes/speed passed: ' + passed + ' assertions.');
