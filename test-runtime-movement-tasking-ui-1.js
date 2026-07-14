'use strict';

const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');

const ROOT = __dirname;
const Movement = require(path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'runtime-movement.js'));
const movementSrc = fs.readFileSync(path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'runtime-movement.js'), 'utf8');
const ff = fs.readFileSync(path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'free-fight-demo.js'), 'utf8');
const scc = fs.readFileSync(path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'scenario-control-center.js'), 'utf8');

let passed = 0;
let failed = 0;
function ok(label, cond, detail) {
    if (cond) { passed += 1; console.log('  PASS  ' + label); }
    else { failed += 1; console.error('  FAIL  ' + label + (detail ? ' -- ' + detail : '')); }
}
function close(a, b, eps) { return Math.abs(+a - +b) < (eps == null ? 1e-4 : eps); }
function clone(v) { return JSON.parse(JSON.stringify(v)); }
function block(src, from, to) {
    const a = src.indexOf(from);
    if (a < 0) return '';
    const b = to ? src.indexOf(to, a + from.length) : -1;
    return src.slice(a, b < 0 ? a + 4200 : b);
}
function clean(src) {
    return String(src || '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}
function taskInput(overrides) {
    return Object.assign({
        movement_id: 'task-single-1',
        unit_id: 'U1',
        destination_lon: 1,
        destination_lat: 0,
        speed_kph: 100,
        domain: 'ground'
    }, overrides || {});
}
function taskContext() {
    return {
        elapsed_hours: 3.25,
        runtime_positions: { U1: [0, 0], U2: [-0.01, 0], U3: [-0.02, 0] },
        units: [
            { unit_id: 'U1', position: [0, 0], domain: 'ground' },
            { unit_id: 'U2', position: [-0.01, 0], domain: 'ground' },
            { unit_id: 'U3', position: [-0.02, 0], domain: 'ground' }
        ]
    };
}

console.log('\n=== MOV6 runtime movement tasking UI ===\n');

(function () {
    const ui = block(scc, 'function movementTaskingHtml', 'function openCmoTestGuide');
    ok('T-1 movement tasking UI exists in SCC/runtime surface',
        /data-scc="movement-tasking"/.test(ui) &&
        /field\('unit-id'/.test(ui) &&
        /btnPri\('scc-movement-start'/.test(ui) &&
        /panel5Run[\s\S]*movementTaskingHtml\(eng\)/.test(scc));
})();

(function () {
    const ui = clean(block(scc, 'function movementTaskingHtml', 'function openCmoTestGuide'));
    ok('T-2 UI does not use step/snapshot/turn wording',
        !!ui && !/\b(step|snapshot|turn)\b/i.test(ui));
})();

(function () {
    const built = Movement.createRuntimeMovementTaskPlan(taskInput(), taskContext());
    ok('T-3 single-unit task creates runtime_movement plan',
        built && built.ok === true &&
        built.plan.kind === 'runtime_movement' &&
        built.plan.effect_kind === 'runtime_movement' &&
        built.plan.payload.unit_id === 'U1');
})();

(function () {
    const built = Movement.createRuntimeMovementTaskPlan(taskInput({
        movement_id: 'task-group-1',
        unit_id: '',
        unit_ids: 'U1, U2, U3',
        leader_unit_id: 'U1',
        formation: 'line',
        spacing_meters: 500
    }), taskContext());
    ok('T-4 group task creates runtime_group_movement plan',
        built && built.ok === true &&
        built.plan.kind === 'runtime_group_movement' &&
        built.plan.unit_ids.length === 3 &&
        built.plan.leader_unit_id === 'U1' &&
        built.plan.formation === 'line');
})();

(function () {
    const built = Movement.createRuntimeMovementTaskPlan(taskInput({ movement_id: 'task-dest-1' }), taskContext());
    ok('T-5 destination lon/lat becomes from/to or route',
        built.ok === true &&
        Array.isArray(built.plan.payload.to) &&
        close(built.plan.payload.to[0], 1) &&
        Array.isArray(built.plan.payload.from) &&
        close(built.plan.payload.from[0], 0));
})();

(function () {
    const built = Movement.createRuntimeMovementTaskPlan(taskInput({
        movement_id: 'task-route-1',
        destination_lon: '',
        destination_lat: '',
        route_points: '[[0,0],[0.25,0],[1,0]]'
    }), taskContext());
    ok('T-6 route points are accepted if provided',
        built.ok === true &&
        Array.isArray(built.plan.payload.route) &&
        built.plan.payload.route.length === 3 &&
        close(built.plan.payload.route[1][0], 0.25));
})();

(function () {
    const built = Movement.createRuntimeMovementTaskPlan(taskInput({ movement_id: 'task-kph-1', speed_kph: 55 }), taskContext());
    ok('T-7 speed_kph is preserved',
        built.ok === true && +built.plan.payload.speed_kph === 55);
})();

(function () {
    const built = Movement.createRuntimeMovementTaskPlan(taskInput({
        movement_id: 'task-knots-1',
        speed_kph: '',
        speed_knots: 12
    }), taskContext());
    const started = Movement.addRuntimeMovementPlan(null, built.plan, taskContext());
    const mv = started.state.movements['task-knots-1'];
    ok('T-8 speed_knots is preserved/converted by runtime engine',
        built.ok === true &&
        +built.plan.payload.speed_knots === 12 &&
        mv && close(mv.speed_kph, 22.224, 0.001) &&
        mv.speed_source === 'speed_knots');
})();

(function () {
    const built = Movement.createRuntimeMovementTaskPlan(taskInput({ movement_id: 'task-start-1' }), taskContext());
    ok('T-9 plan start time uses current scenario elapsed hours',
        built.ok === true &&
        close(built.plan.start_elapsed_hours, 3.25) &&
        close(built.plan.payload.start_elapsed_hours, 3.25));
})();

(function () {
    const scenario = { units: [{ unit_id: 'U1', position: [0, 0], domain: 'ground' }] };
    const before = clone(scenario);
    const built = Movement.createRuntimeMovementTaskPlan(taskInput({ movement_id: 'task-immut-scenario-1' }), {
        elapsed_hours: 0,
        runtime_positions: { U1: [0, 0] },
        units: scenario.units
    });
    Movement.addRuntimeMovementPlan(null, built.plan, { elapsed_hours: 0, units: scenario.units });
    ok('T-10 scenario JSON is not mutated', JSON.stringify(scenario) === JSON.stringify(before));
})();

(function () {
    global.window = { units: [{ uid: 'U1', coord: [99, 99] }] };
    const before = clone(global.window.units);
    const built = Movement.createRuntimeMovementTaskPlan(taskInput({ movement_id: 'task-immut-window-1' }), taskContext());
    Movement.addRuntimeMovementPlan(null, built.plan, taskContext());
    ok('T-11 window.units is not mutated', JSON.stringify(global.window.units) === JSON.stringify(before));
    delete global.window;
})();

(function () {
    const built = Movement.createRuntimeMovementTaskPlan(taskInput({ movement_id: 'task-flow-1', speed_kph: 111.195 }), taskContext());
    const started = Movement.addRuntimeMovementPlan(null, built.plan, taskContext());
    const tick = Movement.updateRuntimeMovementState(started.state, 3.75, {});
    ok('T-12 created plan flows into MOV1/MOV3 executor',
        started.created.length === 1 &&
        tick.state.movements['task-flow-1'].progress > 0 &&
        Array.isArray(tick.state.runtime_positions.U1));
})();

(function () {
    const tasker = block(ff, 'function _createRuntimeMovementTask', 'function _applyRuntimeEventEffectsForEvent');
    ok('T-13 map owned-position publish path is triggered or available after task',
        /MOV\.addRuntimeMovementPlan/.test(tasker) &&
        /_publishOwnedPositions\(\)/.test(tasker));
})();

(function () {
    const invalid = Movement.createRuntimeMovementTaskPlan({ unit_id: 'U1' }, taskContext());
    ok('T-14 invalid input is rejected safely with user-facing message/state',
        invalid && invalid.ok === false &&
        typeof invalid.message === 'string' &&
        invalid.message.length > 0 &&
        invalid.status === 'invalid');
})();

(function () {
    const res = childProcess.spawnSync(process.execPath, ['test-runtime-movement-arrival-triggers-1.js'], {
        cwd: ROOT,
        encoding: 'utf8'
    });
    ok('T-15 existing MOV5 arrival tests still pass', res.status === 0, (res.stdout || '') + (res.stderr || ''));
})();

(function () {
    const bindBlock = block(scc, "bindFn('scc-movement-start'", "bindFn('scc-clear'");
    ok('T-16 SCC start action calls engine movement tasking facade',
        /eng\.createRuntimeMovementTask/.test(bindBlock) &&
        /eng\.repaint/.test(bindBlock));
})();

(function () {
    const relevant = clean(block(scc, 'function movementTaskingHtml', 'function openCmoTestGuide') +
        block(scc, "bindFn('scc-movement-start'", "bindFn('scc-clear'") +
        block(ff, 'function _createRuntimeMovementTask', 'function _applyRuntimeEventEffectsForEvent') +
        movementSrc);
    ok('T-17 no steps[] dependency', !/\bsteps\s*\[/.test(relevant));
})();

if (failed) {
    console.error('\nMOV6 movement tasking UI failed: ' + failed + ' failure(s).');
    process.exit(1);
}
console.log('\nMOV6 movement tasking UI passed: ' + passed + ' assertions.');
