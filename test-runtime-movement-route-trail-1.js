'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const Movement = require(path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'runtime-movement.js'));

const ff = fs.readFileSync(path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'free-fight-demo.js'), 'utf8');
const map = fs.readFileSync(path.join(ROOT, 'UI_MOdified', 'client', 'wargame', 'adjudicator-map.js'), 'utf8');
const movementSrc = fs.readFileSync(path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'runtime-movement.js'), 'utf8');

let passed = 0;
let failed = 0;
function ok(label, cond) {
    if (cond) { passed += 1; console.log('  PASS  ' + label); }
    else { failed += 1; console.error('  FAIL  ' + label); }
}
function close(a, b) { return Math.abs(+a - +b) < 1e-6; }
function clone(v) { return JSON.parse(JSON.stringify(v)); }
function clean(src) {
    return String(src || '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}
function block(src, from, to) {
    const a = src.indexOf(from);
    if (a < 0) return '';
    const b = to ? src.indexOf(to, a + from.length) : -1;
    return src.slice(a, b < 0 ? a + 4200 : b);
}
function plan(id, payload) {
    return {
        execution_id: id,
        effect_kind: 'runtime_movement',
        classification: 'requires_world_state_executor',
        status: 'requires_executor',
        payload: Object.assign({
            unit_id: 'U1',
            from: [0, 0],
            to: [1, 1],
            route: [[0, 0], [1, 0], [1, 1]]
        }, payload || {})
    };
}

console.log('\n=== MOV3 runtime movement route, trail, speed, ETA ===\n');

(function () {
    const started = Movement.startMovementExecutionPlans(null, [plan('domain-speed-1', { domain: 'ground' })], {
        elapsed_hours: 0,
        domain_speeds: { ground: 0.5 }
    });
    const mv = started.state.movements['domain-speed-1'];
    ok('T-1 domain speed resolves ETA when explicit speed is absent',
        mv && close(mv.speed, 0.5) && close(mv.eta_elapsed_hours, 4));
})();

(function () {
    const started = Movement.startMovementExecutionPlans(null, [plan('unit-speed-1', { domain: 'ground' })], {
        elapsed_hours: 0,
        domain_speeds: { ground: 0.25 },
        unit_speeds: { U1: 0.8 }
    });
    const mv = started.state.movements['unit-speed-1'];
    ok('T-2 unit speed overrides domain speed',
        mv && close(mv.speed, 0.8) && close(mv.eta_elapsed_hours, 2.5));
})();

(function () {
    const started = Movement.startMovementExecutionPlans(null, [plan('route-progress-1', { speed: 1 })], { elapsed_hours: 0 });
    const tick = Movement.updateRuntimeMovementState(started.state, 1, {});
    const pos = tick.state.runtime_positions.U1;
    ok('T-3 route progress follows multi-leg route',
        close(pos[0], 1) && close(pos[1], 0) && close(tick.state.movements['route-progress-1'].progress, 0.5));
})();

(function () {
    const started = Movement.startMovementExecutionPlans(null, [plan('trail-1', { speed: 1 })], { elapsed_hours: 0 });
    const tick = Movement.updateRuntimeMovementState(started.state, 1, {});
    const entry = tick.state.runtime_world_state.positions.U1;
    ok('T-4 runtime-owned world state includes route and traveled trail',
        entry && Array.isArray(entry.route) && entry.route.length === 3 &&
        Array.isArray(entry.trail) && entry.trail.length >= 2 &&
        close(entry.trail[0][0], 0) && close(entry.trail[entry.trail.length - 1][0], 1));
})();

(function () {
    const started = Movement.startMovementExecutionPlans(null, [plan('pause-route-1', { speed: 1 })], { elapsed_hours: 0 });
    const mid = Movement.updateRuntimeMovementState(started.state, 1, {});
    const paused = Movement.updateRuntimeMovementState(mid.state, 2, { paused: true });
    const resumed = Movement.updateRuntimeMovementState(paused.state, 3, {});
    const arrived = Movement.updateRuntimeMovementState(resumed.state, 4, {});
    ok('T-5 pause/resume preserves route progress and shifts ETA',
        close(paused.state.movements['pause-route-1'].progress, 0.5) &&
        close(paused.state.runtime_positions.U1[0], 1) &&
        resumed.state.movements['pause-route-1'].eta_elapsed_hours > mid.state.movements['pause-route-1'].eta_elapsed_hours &&
        arrived.state.movements['pause-route-1'].status === 'arrived');
})();

(function () {
    const started = Movement.startMovementExecutionPlans(null, [plan('arrival-route-1', { speed: 1 })], { elapsed_hours: 0 });
    const first = Movement.updateRuntimeMovementState(started.state, 2, {});
    const second = Movement.updateRuntimeMovementState(first.state, 3, {});
    ok('T-6 arrival fires once at final route coordinate',
        first.arrivals.length === 1 && second.arrivals.length === 0 &&
        close(second.state.runtime_positions.U1[0], 1) && close(second.state.runtime_positions.U1[1], 1));
})();

(function () {
    const owned = block(ff, 'function _runtimeMovementOwnedPositions()', 'function _applyRuntimeEventEffectsForEvent');
    ok('T-7 free-fight publishes route/trail in owned-position payload',
        /route:\s*\(mv/.test(owned) && /trail:\s*\(mv/.test(owned) && /speed:\s*\(mv/.test(owned));
})();

(function () {
    const bridge = block(map, 'function setOwnedRunPositions', 'function setRunClock');
    ok('T-8 map bridge renders runtime route and trail polylines',
        /_renderOwnedRunMovementDisplay/.test(bridge) &&
        /window\.L\.polyline/.test(bridge) &&
        /runtime_route/.test(bridge) &&
        /runtime_trail/.test(bridge));
})();

(function () {
    const bridge = block(map, 'function setOwnedRunPositions', 'function setRunClock');
    ok('T-9 reset clears runtime route/trail display',
        /_clearOwnedRunMovementDisplay/.test(bridge) &&
        /_clearOwnedRunPositionMarkerDisplay/.test(bridge));
})();

(function () {
    const scenario = { name: 'route-safe', units: [{ id: 'U1', position: [0, 0], domain: 'ground' }] };
    const before = clone(scenario);
    const started = Movement.startMovementExecutionPlans(null, [plan('immut-route-1', { domain: 'ground' })], {
        elapsed_hours: 0,
        units: scenario.units,
        domain_speeds: { ground: 0.5 }
    });
    Movement.updateRuntimeMovementState(started.state, 1, {});
    ok('T-10 no scenario mutation', JSON.stringify(scenario) === JSON.stringify(before));
})();

(function () {
    const relevant = clean(movementSrc +
        block(ff, 'function _runtimeMovementOwnedPositions()', 'function _applyRuntimeEventEffectsForEvent') +
        block(map, 'function setOwnedRunPositions', 'function setRunClock'));
    ok('T-11 no window.units or steps[] movement dependency',
        !/window\.units|global\.units|\bsteps\s*\[/.test(relevant));
})();

if (failed) {
    console.error('\nMOV3 route/trail movement gate failed: ' + failed + ' failure(s).');
    process.exit(1);
}
console.log('\nMOV3 route/trail movement gate passed: ' + passed + ' assertions.');
