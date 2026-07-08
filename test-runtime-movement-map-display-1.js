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
function block(src, from, to) {
    const a = src.indexOf(from);
    if (a < 0) return '';
    const b = to ? src.indexOf(to, a + from.length) : -1;
    return src.slice(a, b < 0 ? a + 3500 : b);
}
function clean(src) {
    return String(src || '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}
function plan(id, speed) {
    return {
        execution_id: id,
        effect_kind: 'runtime_movement',
        classification: 'requires_world_state_executor',
        status: 'requires_executor',
        payload: { unit_id: 'U1', from: [0, 0], to: [1, 0], route: [[0, 0], [1, 0]], speed }
    };
}

console.log('\n=== MOV2 runtime movement map display ===\n');

(function () {
    const pub = block(ff, 'function _publishOwnedPositions()', 'function _runtimeMovementSummary()');
    const mapSet = block(map, 'function setOwnedRunPositions', 'function _ownedPosFor');
    ok('T-1 runtime movement position is published to map display layer',
        /_runtimeMovementOwnedPositions\(\)/.test(pub) &&
        /MAP\.setOwnedRunPositions\(merged\)/.test(pub) &&
        /_applyOwnedRunPositionsToMarkers\(\)/.test(mapSet));
})();

(function () {
    const owned = block(ff, 'function _runtimeMovementOwnedPositions()', 'function _applyRuntimeEventEffectsForEvent');
    const apply = block(map, 'function _applyOwnedRunPositionsToMarkers()', 'function setRunClock');
    ok('T-2 map display reads runtime-owned position, not scenario JSON',
        /st\.runtime_positions/.test(owned) &&
        /source:\s*'runtime_movement'/.test(owned) &&
        /ownedRunPositions/.test(apply) &&
        /marker\.setLatLng\(\[lat,\s*lon\]\)/.test(apply));
})();

(function () {
    const started = Movement.startMovementExecutionPlans(null, [plan('pause-map-1', 0.25)], { elapsed_hours: 0 });
    const mid = Movement.updateRuntimeMovementState(started.state, 2, {});
    const paused = Movement.updateRuntimeMovementState(mid.state, 3, { paused: true });
    ok('T-3 pause keeps displayed runtime position unchanged',
        close(mid.state.runtime_positions.U1[0], paused.state.runtime_positions.U1[0]) &&
        paused.state.movements['pause-map-1'].status === 'paused');
})();

(function () {
    const started = Movement.startMovementExecutionPlans(null, [plan('resume-map-1', 0.25)], { elapsed_hours: 0 });
    const mid = Movement.updateRuntimeMovementState(started.state, 2, {});
    const paused = Movement.updateRuntimeMovementState(mid.state, 3, { paused: true });
    const resumed = Movement.updateRuntimeMovementState(paused.state, 4, {});
    ok('T-4 resume advances displayed runtime position',
        resumed.state.runtime_positions.U1[0] > paused.state.runtime_positions.U1[0]);
})();

(function () {
    const started = Movement.startMovementExecutionPlans(null, [plan('arrive-map-1', 0.5)], { elapsed_hours: 0 });
    const first = Movement.updateRuntimeMovementState(started.state, 3, {});
    const second = Movement.updateRuntimeMovementState(first.state, 4, {});
    ok('T-5 arrival displays final runtime position once',
        first.arrivals.length === 1 &&
        second.arrivals.length === 0 &&
        close(second.state.runtime_positions.U1[0], 1));
})();

(function () {
    const stopBlock = block(ff, 'function _stopScenario()', 'function _resetScenario()');
    const mapSet = block(map, 'function setOwnedRunPositions', 'function setRunClock');
    ok('T-6 reset clears or returns runtime movement display to start',
        /_resetRuntimeMovementState\(\)/.test(stopBlock) &&
        /_publishOwnedPositions\(\)/.test(stopBlock) &&
        /_clearOwnedRunPositionMarkerDisplay/.test(mapSet) &&
        /_rmoozRuntimeOwnedBaseLatLng/.test(mapSet));
})();

(function () {
    const relevant = clean(block(ff, 'function _runtimeMovementOwnedPositions()', 'function _applyRuntimeEventEffectsForEvent') +
        block(map, 'function setOwnedRunPositions', 'function setRunClock'));
    ok('T-7 no window.units mutation', !/window\.units|global\.units/.test(relevant));
})();

(function () {
    const relevant = clean(block(ff, 'function _runtimeMovementOwnedPositions()', 'function _applyRuntimeEventEffectsForEvent') +
        block(map, 'function setOwnedRunPositions', 'function setRunClock'));
    ok('T-8 no scenario mutation', !/scenario\s*=|scenarioRef\s*=|RmoozScenario\.scenario\s*=/.test(relevant));
})();

(function () {
    const tick = clean(block(ff, 'function _tickRuntimeMovement', 'function _runtimeMovementSummary'));
    const mapSet = clean(block(map, 'function setOwnedRunPositions', 'function setRunClock'));
    ok('T-9 no applyState snapshot regression', !/applyState\s*\(/.test(tick + mapSet));
})();

(function () {
    const bridge = block(map, 'function setOwnedRunPositions', 'function setRunClock');
    ok('T-10 route/trail display is display-only when present',
        /window\.L\.polyline\(route,[\s\S]*interactive:\s*false[\s\S]*className:\s*'wg-runtime-route'/.test(bridge) &&
        /window\.L\.polyline\(trail,[\s\S]*interactive:\s*false[\s\S]*className:\s*'wg-runtime-trail'/.test(bridge));
})();

(function () {
    const relevant = clean(block(ff, 'function _runtimeMovementOwnedPositions()', 'function _applyRuntimeEventEffectsForEvent') +
        block(map, 'function setOwnedRunPositions', 'function setRunClock') +
        movementSrc);
    ok('T-11 no steps[] dependency', !/\bsteps\s*\[|\bsteps\b/.test(relevant));
})();

if (failed) {
    console.error('\nMOV2 movement map display failed: ' + failed + ' failure(s).');
    process.exit(1);
}
console.log('\nMOV2 movement map display passed: ' + passed + ' assertions.');
