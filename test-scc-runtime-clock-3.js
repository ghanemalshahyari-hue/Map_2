'use strict';

/*
 * C3a/C3b baseline gate: runtime_scenario metadata feeds the single
 * scenario clock. The clock remains transient runtime state; authored
 * steps are snapshots indexed by current_hours.
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

function scenario() {
    return {
        name: 'runtime-clock-3',
        scenario_label: 'Runtime Clock 3',
        map_bbox: [45, 23, 49, 27],
        start_time: '2026-07-06T00:00:00Z',
        runtime_scenario: {
            start_time: '2026-07-06T00:00:00Z',
            start_hours: 0,
            duration_hours: 72,
            clock_model: 'continuous'
        },
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
    };
}

console.log('\n=== C3a/C3b: runtime_scenario clock metadata ===\n');

console.log('--- 1. World State clock derives absolute time and duration ---');
(function () {
    const s = scenario();
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
    ok('duration_hours carried through runtime clock', ws.clock.duration_hours === 72);
    ok('step index floors from continuous time (25.5 -> H+24 step)', ws.clock.step_index === 1 && ws.clock.time_label === 'H+24');
    ok('start_time creates absolute current_ms', ws.clock.current_ms === Date.parse('2026-07-07T01:30:00Z'));
    ok('playing and speed are runtime state, not authored step state', ws.clock.playing === true && ws.clock.speed === 4);
})();

console.log('\n--- 2. runtime_scenario.start_time works without top-level start_time ---');
(function () {
    const s = scenario();
    delete s.start_time;
    const ws = WS.deriveWorldStateWithOwned(s, 0, null, {
        start_hours: 0,
        current_hours: 2,
        end_hours: 72,
        duration_hours: 72
    });
    ok('nested runtime_scenario.start_time feeds current_ms', ws.clock.current_ms === Date.parse('2026-07-06T02:00:00Z'));
})();

console.log('\n--- 3. Client runtime uses one clock path, not a duplicate timer model ---');
(function () {
    const ff = read('UI_MOdified/client/shell/free-fight-demo.js');
    const map = read('UI_MOdified/client/wargame/adjudicator-map.js');
    const scc = read('UI_MOdified/client/shell/scenario-control-center.js');

    ok('runtime bounds support runtime_scenario.start_hours/end_hours/duration_hours',
        /runtime_scenario/.test(ff) && /rtStart/.test(ff) && /rtEnd/.test(ff) && /duration_hours/.test(ff));
    ok('Run/Pause/Stop all operate through the same published run clock',
        /function _setScenarioClockPlaying/.test(ff) && /function _resetScenarioClockToStart/.test(ff) && /_publishRunClock\(\)/.test(ff));
    ok('map runClockLabel reads nested runtime_scenario.start_time as a fallback',
        /const rt = sc\.runtime_scenario \|\| \{\}/.test(map) && /rt\.start_time/.test(map));
    ok('SCC still labels primary runtime as Scenario time',
        scc.includes("kv('Scenario time'") && scc.includes('scenarioClockLabel'));
    ok('no second scenario clock variable introduced in timeline/workspace code',
        !/var\s+_scenarioClock\s*=|let\s+_scenarioClock\s*=|const\s+_scenarioClock\s*=/.test(ff + read('UI_MOdified/client/shell/timeline.js') + read('UI_MOdified/client/shell/scenario-workspace.js')));
})();

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
process.exit(failed ? 1 : 0);
