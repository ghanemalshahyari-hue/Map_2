'use strict';

/*
 * C3a/C3b baseline gate: runtime metadata feeds one transient scenario clock.
 * Authored steps remain review snapshots indexed by current_hours.
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

require(path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'world-state-db.js'));
require(path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'detection.js'));
const WS = require(path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'world-state.js'));
const spec = require(path.join(ROOT, 'UI_MOdified', 'server', 'ai', 'scenario-schema-spec.js'));

let passed = 0;
let failed = 0;
function ok(label, cond) {
    if (cond) { passed++; console.log('  PASS  ' + label); }
    else { failed++; console.error('  FAIL  ' + label); }
}

function scenario(overrides) {
    return Object.assign({
        name: 'runtime-clock-3',
        scenario_label: 'Runtime Clock 3',
        map_bbox: [45, 23, 49, 27],
        obj: { name: 'Objective X', coord: [47, 25], target_depth_km: 50, carver: 20 },
        bls_template: [{ name: 'BLS-1', coord: [46, 24] }],
        red_units: [{ uid: 'R1', label: 'R1', bls: 'BLS-1', appear: 0, role: 'S-300 PKS', domain: 'ground', coord: [46, 24] }],
        blue_units_initial: [{ unit_uid: 'B1', base_id: 'B1', role: 'fighter', domain: 'air', coord: [47, 25] }],
        steps: [
            { index: 0, time_label: 'H', elapsed_hours: 0, phase: 'START' },
            { index: 1, time_label: 'H+24', elapsed_hours: 24, phase: 'MOVE' },
            { index: 2, time_label: 'H+48', elapsed_hours: 48, phase: 'CONTACT' },
            { index: 3, time_label: 'H+72', elapsed_hours: 72, phase: 'END' }
        ]
    }, overrides || {});
}

console.log('\n=== C3a/C3b: runtime scenario clock metadata ===\n');

console.log('--- 1. World State derives absolute time and duration-cap metadata ---');
(function () {
    const s = scenario({ start_time: '2026-07-06T00:00:00Z', duration_minutes: 1800 });
    const ws = WS.deriveWorldStateWithOwned(s, 0, null, {
        start_hours: 0,
        current_hours: 25.5,
        end_hours: 72,
        duration_hours: 72,
        playing: true,
        speed: 4
    });
    ok('ws.clock exists', !!(ws && ws.clock));
    ok('current_hours retained as continuous time', ws.clock.current_hours === 25.5);
    ok('duration_minutes caps end_hours to H+30', ws.clock.end_hours === 30 && ws.clock.duration_minutes === 1800);
    ok('duration_hours carried through runtime clock', ws.clock.duration_hours === 72);
    ok('step index floors from continuous time (25.5 -> H+24 step)', ws.clock.step_index === 1 && ws.clock.time_label === 'H+24');
    ok('start_time creates absolute current_ms', ws.clock.current_ms === Date.parse('2026-07-07T01:30:00Z'));
    ok('playing and speed are runtime state, not authored step state', ws.clock.playing === true && ws.clock.speed === 4);
})();

console.log('\n--- 2. nested runtime_scenario.start_time works without top-level start_time ---');
(function () {
    const s = scenario({ runtime_scenario: { start_time: '2026-07-06T00:00:00Z' } });
    const ws = WS.deriveWorldStateWithOwned(s, 0, null, {
        start_hours: 0,
        current_hours: 2,
        end_hours: 72
    });
    ok('nested runtime_scenario.start_time feeds current_ms', ws.clock.current_ms === Date.parse('2026-07-06T02:00:00Z'));
})();

console.log('\n--- 3. runtime classification and schema remain additive ---');
(function () {
    ok('legacy scenario classified stepped', WS.runtimeScenarioType(scenario()) === 'stepped');
    ok('start_time implies runtime_scenario', WS.runtimeScenarioType(scenario({ start_time: '2026-07-06T00:00:00Z' })) === 'runtime_scenario');
    ok('duration_minutes implies runtime_scenario', WS.runtimeScenarioType(scenario({ duration_minutes: 60 })) === 'runtime_scenario');
    ok('bad runtime duration is rejected on explicit runtime_scenario',
        WS.validateRuntimeScenario(scenario({ type: 'runtime_scenario', duration_minutes: -1 })).ok === false);
    ok('server schema keeps runtime fields optional',
        spec.TOP_LEVEL.start_time.required === false &&
        spec.TOP_LEVEL.duration_minutes.required === false &&
        spec.TOP_LEVEL.runtime_scenario.required === false);
})();

console.log('\n--- 4. Client runtime uses one clock path, not a duplicate timer model ---');
(function () {
    const ff = read('UI_MOdified/client/shell/free-fight-demo.js');
    const map = read('UI_MOdified/client/wargame/adjudicator-map.js');
    const scc = read('UI_MOdified/client/shell/scenario-control-center.js');
    ok('free-fight bounds delegate to AppWorldState.scenarioRuntimeBounds',
        /AppWorldState\.scenarioRuntimeBounds/.test(ff) && /duration_minutes/.test(ff));
    ok('runtime_scenario duration_hours fallback remains available',
        /function _runtimeDurationHours/.test(ff) && /duration_hours/.test(ff));
    ok('Run/Pause/Stop operate through the same published run clock',
        /function _setScenarioClockPlaying/.test(ff) &&
        /function _resetScenarioClockToStart/.test(ff) &&
        /_publishRunClock\(\)/.test(ff));
    ok('map runClockLabel reads nested runtime_scenario.start_time as fallback',
        /runtime_scenario/.test(map) && /start_time/.test(map));
    ok('SCC labels primary runtime as Scenario time',
        scc.includes("kv('Scenario time'") && scc.includes('scenarioClockLabel'));
})();

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
process.exit(failed ? 1 : 0);
