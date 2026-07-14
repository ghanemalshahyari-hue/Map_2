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
function samePositions(a, b) {
    return ['U1', 'U2', 'U3'].every(function (uid) {
        return a && b && a[uid] && b[uid] && close(a[uid][0], b[uid][0]) && close(a[uid][1], b[uid][1]);
    });
}
function groupPlan(id, overrides) {
    return Object.assign({
        kind: 'runtime_group_movement',
        movement_id: id,
        group_id: 'G1',
        unit_ids: ['U1', 'U2', 'U3'],
        leader_unit_id: 'U1',
        route: [[0, 0], [0.2, 0]],
        formation: 'column',
        spacing_meters: 1000,
        speed_kph: 111.195,
        domain: 'ground'
    }, overrides || {});
}

console.log('\n=== MOV4 runtime group formation movement ===\n');

(function () {
    const started = Movement.startMovementExecutionPlans(null, [groupPlan('group-expand-1')], { elapsed_hours: 0 });
    const gm = started.state.group_movements && started.state.group_movements['group-expand-1'];
    ok('T-1 group movement expands into per-unit runtime movements',
        started.created.length === 3 && gm && Object.keys(gm.unit_movements || {}).length === 3 &&
        ['U1', 'U2', 'U3'].every(function (uid) { return !!started.state.movements['group-expand-1:' + uid]; }));
})();

(function () {
    const started = Movement.startMovementExecutionPlans(null, [groupPlan('leader-route-1')], { elapsed_hours: 0 });
    const tick = Movement.updateRuntimeMovementState(started.state, 0.05, {});
    const leader = tick.state.runtime_positions.U1;
    ok('T-2 leader follows route',
        leader && leader[0] > 0.04 && leader[0] < 0.06 && close(leader[1], 0, 0.001));
})();

(function () {
    const started = Movement.startMovementExecutionPlans(null, [groupPlan('column-1', { formation: 'column' })], { elapsed_hours: 0 });
    const tick = Movement.updateRuntimeMovementState(started.state, 0.05, {});
    const p = tick.state.runtime_positions;
    ok('T-3 column formation preserves ordered spacing',
        p.U1 && p.U2 && p.U3 &&
        p.U1[0] > p.U2[0] && p.U2[0] > p.U3[0] &&
        (p.U1[0] - p.U2[0]) > 0.006 && (p.U2[0] - p.U3[0]) > 0.006);
})();

(function () {
    const started = Movement.startMovementExecutionPlans(null, [groupPlan('line-1', { formation: 'line' })], { elapsed_hours: 0 });
    const tick = Movement.updateRuntimeMovementState(started.state, 0.05, {});
    const p = tick.state.runtime_positions;
    ok('T-4 line formation preserves lateral spacing',
        p.U1 && p.U2 && p.U3 &&
        close(p.U1[1], 0, 0.001) &&
        Math.abs(p.U2[1]) > 0.006 && Math.abs(p.U3[1]) > 0.006 &&
        p.U2[1] * p.U3[1] < 0 &&
        close(p.U2[0], p.U1[0], 0.002) && close(p.U3[0], p.U1[0], 0.002));
})();

(function () {
    const started = Movement.startMovementExecutionPlans(null, [groupPlan('follow-1', { formation: 'follow_leader' })], { elapsed_hours: 0 });
    const tick = Movement.updateRuntimeMovementState(started.state, 0.05, {});
    const p = tick.state.runtime_positions;
    ok('T-5 follow_leader mode keeps followers behind leader',
        p.U1 && p.U2 && p.U3 && p.U2[0] < p.U1[0] && p.U3[0] < p.U1[0]);
})();

(function () {
    const started = Movement.startMovementExecutionPlans(null, [groupPlan('pause-group-1')], { elapsed_hours: 0 });
    const mid = Movement.updateRuntimeMovementState(started.state, 0.05, {});
    const beforePause = clone(mid.state.runtime_positions);
    const paused = Movement.updateRuntimeMovementState(mid.state, 0.1, { paused: true });
    ok('T-6 pause freezes all group unit positions', samePositions(beforePause, paused.state.runtime_positions));
})();

(function () {
    const started = Movement.startMovementExecutionPlans(null, [groupPlan('resume-group-1')], { elapsed_hours: 0 });
    const mid = Movement.updateRuntimeMovementState(started.state, 0.05, {});
    const paused = Movement.updateRuntimeMovementState(mid.state, 0.1, { paused: true });
    const resumed = Movement.updateRuntimeMovementState(paused.state, 0.15, {});
    ok('T-7 resume advances all units',
        ['U1', 'U2', 'U3'].every(function (uid) {
            return resumed.state.runtime_positions[uid] && paused.state.runtime_positions[uid] &&
                resumed.state.runtime_positions[uid][0] > paused.state.runtime_positions[uid][0];
        }));
})();

(function () {
    const started = Movement.startMovementExecutionPlans(null, [groupPlan('arrival-group-1')], { elapsed_hours: 0 });
    const first = Movement.updateRuntimeMovementState(started.state, 1, {});
    const second = Movement.updateRuntimeMovementState(first.state, 2, {});
    ok('T-8 group arrival fires once',
        Array.isArray(first.group_arrivals) && Array.isArray(second.group_arrivals) &&
        first.group_arrivals.length === 1 && second.group_arrivals.length === 0 &&
        Array.isArray(first.state.group_arrival_events) && first.state.group_arrival_events.length === 1);
})();

(function () {
    const started = Movement.startMovementExecutionPlans(null, [groupPlan('unit-arrivals-1')], { elapsed_hours: 0 });
    const done = Movement.updateRuntimeMovementState(started.state, 1, {});
    const gm = done.state.group_movements && done.state.group_movements['unit-arrivals-1'];
    ok('T-9 per-unit arrivals are tracked',
        gm && done.arrivals.length === 3 &&
        gm.arrived_unit_ids.length === 3 &&
        ['U1', 'U2', 'U3'].every(function (uid) { return gm.arrived_unit_ids.indexOf(uid) !== -1; }));
})();

(function () {
    const started = Movement.startMovementExecutionPlans(null, [groupPlan('positions-1')], { elapsed_hours: 0 });
    const tick = Movement.updateRuntimeMovementState(started.state, 0.05, {});
    ok('T-10 runtime_positions contains all group units',
        ['U1', 'U2', 'U3'].every(function (uid) { return Array.isArray(tick.state.runtime_positions[uid]); }));
})();

(function () {
    const owned = block(ff, 'function _runtimeMovementOwnedPositions()', 'function _applyRuntimeEventEffectsForEvent');
    ok('T-11 map owned-position payload includes all group units',
        /Object\.keys\(positions\)\.forEach/.test(owned) &&
        /out\[uid\]/.test(owned) &&
        /group_movement_id/.test(owned));
})();

(function () {
    const scenario = { units: [{ id: 'U1', position: [0, 0] }, { id: 'U2', position: [-0.01, 0] }, { id: 'U3', position: [-0.02, 0] }] };
    const before = clone(scenario);
    const started = Movement.startMovementExecutionPlans(null, [groupPlan('immut-scenario-group-1')], { elapsed_hours: 0, units: scenario.units });
    Movement.updateRuntimeMovementState(started.state, 0.05, {});
    ok('T-12 scenario JSON is not mutated', JSON.stringify(scenario) === JSON.stringify(before));
})();

(function () {
    global.window = { units: [{ uid: 'U1', coord: [99, 99] }, { uid: 'U2', coord: [98, 98] }] };
    const before = clone(global.window.units);
    const started = Movement.startMovementExecutionPlans(null, [groupPlan('immut-window-group-1')], { elapsed_hours: 0 });
    Movement.updateRuntimeMovementState(started.state, 0.05, {});
    ok('T-13 window.units is not mutated', JSON.stringify(global.window.units) === JSON.stringify(before));
    delete global.window;
})();

(function () {
    ok('T-14 no steps[] dependency', !/\bsteps\s*\[/.test(movementSrc));
})();

(function () {
    const res = childProcess.spawnSync(process.execPath, ['test-runtime-movement-routes-speed-1.js'], {
        cwd: ROOT,
        encoding: 'utf8'
    });
    ok('T-15 MOV3 route/speed tests still pass', res.status === 0, (res.stdout || '') + (res.stderr || ''));
})();

(function () {
    ok('T-16 SCC movement summary shows group movement count/status',
        scc.indexOf('group movement') !== -1 && scc.indexOf('group_movement_count') !== -1 &&
        scc.indexOf('group_status_summary') !== -1);
})();

if (failed) {
    console.error('\nMOV4 group movement failed: ' + failed + ' failure(s).');
    process.exit(1);
}
console.log('\nMOV4 group movement passed: ' + passed + ' assertions.');
