'use strict';

/*
 * C3b baseline gate: primary Play owns continuous scenario time.
 * Play advances current_hours. Step/snapshot controls remain review-only.
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

require(path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'world-state-db.js'));
require(path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'detection.js'));
const WS = require(path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'world-state.js'));

let passed = 0;
let failed = 0;
function ok(label, cond) {
    if (cond) { passed++; console.log('  PASS  ' + label); }
    else { failed++; console.error('  FAIL  ' + label); }
}

function playingClock(overrides) {
    return Object.assign({
        start_hours: 0,
        current_hours: 0,
        end_hours: 100,
        speed: 1,
        playing: true,
        paused: false,
        completed: false
    }, overrides || {});
}

function block(src, from, to) {
    const a = src.indexOf(from);
    if (a === -1) return '';
    const b = to ? src.indexOf(to, a + from.length) : -1;
    return src.slice(a, b === -1 ? a + 2500 : b);
}

console.log('\n=== C3b: continuous runtime Play/Pause/Stop model ===\n');

console.log('--- 1. pure runtime reducers exist and scale time ---');
(function () {
    ok('advanceRuntimeClock exported', typeof WS.advanceRuntimeClock === 'function');
    ok('runtimeClockState exported', typeof WS.runtimeClockState === 'function');
    ok('resetRuntimeClock exported', typeof WS.resetRuntimeClock === 'function');
    const x1 = WS.advanceRuntimeClock(playingClock({ speed: 1 }), 0.25);
    const x5 = WS.advanceRuntimeClock(playingClock({ speed: 5 }), 0.25);
    const x15 = WS.advanceRuntimeClock(playingClock({ speed: 15 }), 0.25);
    ok('x1 advances +0.25h', Math.abs(x1.current_hours - 0.25) < 1e-9);
    ok('x5 advances more than x1', x5.current_hours > x1.current_hours);
    ok('x15 advances more than x5', x15.current_hours > x5.current_hours);
})();

console.log('\n--- 2. pause, resume, stop, and complete states are truthful ---');
(function () {
    ok('paused clock does not advance', WS.advanceRuntimeClock(playingClock({ current_hours: 10, paused: true }), 0.25).current_hours === 10);
    ok('non-playing clock does not advance', WS.advanceRuntimeClock(playingClock({ current_hours: 10, playing: false }), 0.25).current_hours === 10);
    ok('resumed clock continues', Math.abs(WS.advanceRuntimeClock(playingClock({ current_hours: 10 }), 0.25).current_hours - 10.25) < 1e-9);
    const reset = WS.resetRuntimeClock(playingClock({ start_hours: -30, current_hours: 12, completed: true }));
    ok('reset returns to start_hours', reset.current_hours === -30 && reset.start_hours === -30);
    ok('reset state is stopped', WS.runtimeClockState(reset) === 'stopped');
    const atEnd = WS.advanceRuntimeClock(playingClock({ current_hours: 99.9, end_hours: 100 }), 0.25);
    ok('end bound clamps and completes', atEnd.current_hours === 100 && atEnd.completed === true && atEnd.playing === false);
})();

console.log('\n--- 3. free-fight runtime uses the World State clock reducers ---');
(function () {
    const ff = read('UI_MOdified/client/shell/free-fight-demo.js');
    const runScenario = block(ff, 'function _runScenario()', 'function _pauseScenario()');
    const pauseScenario = block(ff, 'function _pauseScenario()', 'function _stopScenario()');
    const stopScenario = block(ff, 'function _stopScenario()', 'function _resetScenario()');
    const scenarioTick = block(ff, 'function _scenarioTick()', 'function _commitAutoBlueOrder');
    ok('clock seed carries paused/completed runtime-state fields',
        /_coaExec\.clock = \{[^}]*paused: false, completed: false/.test(ff));
    ok('advance delegates to AppWorldState.advanceRuntimeClock',
        /advanceRuntimeClock\(c, COA_CLOCK_HOURS_PER_TICK\)/.test(ff));
    ok('single helper publishes Play/Pause state to the run clock',
        /function _setScenarioClockPlaying/.test(ff) && /_publishRunClock\(\)/.test(block(ff, 'function _setScenarioClockPlaying', 'function _resetScenarioClockToStart')));
    ok('Run Scenario sets clock playing before ticking',
        /_setScenarioClockPlaying\(true\)/.test(runScenario) && /_scenarioTick\(\)/.test(runScenario));
    ok('scenario tick keeps active runtime clock playing while unit-controller runs',
        /_setScenarioClockPlaying\(true\)/.test(scenarioTick) && /return _coaExecTick\(\)/.test(scenarioTick));
    ok('Pause Scenario freezes the clock and marks exec paused',
        /_coaExec\.paused = true/.test(pauseScenario) && /_setScenarioClockPlaying\(false\)/.test(pauseScenario));
    ok('Stop Scenario resets clock to start',
        /_resetScenarioClockToStart\(\)/.test(stopScenario) && /operator_stopped/.test(stopScenario));
    ok('public runtime API exposes state, snapshot, and speed',
        /runtimeState:/.test(ff) && /runtimeSnapshot:/.test(ff) && /setRuntimeSpeed:/.test(ff));
})();

console.log('\n--- 4. UI contract: Play means time, Step means review ---');
(function () {
    const scc = read('UI_MOdified/client/shell/scenario-control-center.js');
    const i18n = read('UI_MOdified/client/i18n.js');
    const html = read('UI_MOdified/client/app.html');
    const map = read('UI_MOdified/client/wargame/adjudicator-map.js');
    ok('SCC primary readout shows Scenario time', scc.includes("kv('Scenario time'"));
    ok('SCC primary readout does not expose Turn/Phase rows', !scc.includes("kv('Turn") && !scc.includes("kv('Phase'"));
    ok('snapshot is secondary review language', scc.includes('Snapshot in effect'));
    ok('legacy step control is Next snapshot', i18n.includes("'wg-btn-next': 'Next snapshot'"));
    ok('legacy HUD is marked diagnostic', html.includes('wargame-mode-chip">Legacy') && html.includes('wg-legacy-banner'));
    ok('manual snapshot scrub pauses a playing run', map.includes('pauseCommittedRun') && map.includes('opts.snapshot'));
})();

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
process.exit(failed ? 1 : 0);
