/* ============================================================================
 * test-scenario-time-contract-1.js
 * Runtime Scenario Time Contract
 * ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let passed = 0;
let failed = 0;
function ok(label, cond) {
    if (cond) { passed += 1; console.log('  PASS  ' + label); }
    else { failed += 1; console.error('  FAIL  ' + label); }
}

function clone(v) { return JSON.parse(JSON.stringify(v)); }

const spec = read('UI_MOdified/server/ai/scenario-schema-spec.js');
const ffSource = read('UI_MOdified/client/shell/free-fight-demo.js');
const mapSource = read('UI_MOdified/client/wargame/adjudicator-map.js');
const SPEC = require(path.join(ROOT, 'UI_MOdified', 'server', 'ai', 'scenario-schema-spec.js'));
const clockBoundsBlock = ffSource.slice(
    ffSource.indexOf('function _runtimeDurationHours'),
    ffSource.indexOf('// Advance the committed Run')
);

function baseScenario(extra) {
    const sc = Object.assign({
        name: 'scenario-time-contract',
        scenario_label: 'Scenario Time Contract',
        obj: { name: 'Objective', coord: [46, 24] },
        bls_template: [{ name: 'BLS-1', coord: [46, 24] }],
        red_units: [],
        blue_units_base_ids: [],
        blue_units_initial: [],
        phase_table: [
            { index: 0, time_label: 'H', elapsed_hours: 0, phase: 'START' },
            { index: 1, time_label: 'H+24', elapsed_hours: 24, phase: 'END' }
        ],
        steps: [
            { index: 0, time_label: 'H', elapsed_hours: 0, phase: 'START' },
            { index: 1, time_label: 'H+24', elapsed_hours: 24, phase: 'END' }
        ]
    }, extra || {});
    return sc;
}

function installGlobals(scenario) {
    global.AppRuntimeEvents = global.AppRuntimeEvents || require(path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'runtime-events.js'));
    global.AppShellEventLog = { append() {} };
    global.AppWorldState = { findStepForElapsedHours() { return { index: 0, elapsed_hours: 0, time_label: 'H' }; } };
    global.AppAdjudicatorMap = {
        setRunClock(clock) { this.clock = clock; },
        runClockLabel() { return null; },
        getWorldState() { return { units: [] }; }
    };
    global.RmoozScenario = { scenario };
    global.units = [];
    delete global.fetch;
}

function commitClock(scenario) {
    installGlobals(scenario);
    const FF = require(path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'free-fight-demo.js'));
    FF._resetCoaExecForTest();
    FF._setCoaPlanForTest({
        ok: true,
        plan_source: 'scenario-time-contract',
        coas: [{
            plan_id: 'TIME-CONTRACT',
            side: 'BLUE',
            title: 'Runtime clock contract',
            phases: [{ name: 'runtime', actions: [] }]
        }]
    });
    const ex = FF._commitCoaForTest(0);
    return ex && ex.clock;
}

console.log('\n=== Runtime scenario time contract ===\n');

ok('T-1 duration_minutes is accepted in schema',
    SPEC.TOP_LEVEL.duration_minutes &&
    SPEC.TOP_LEVEL.duration_minutes.required === false &&
    SPEC.TOP_LEVEL.duration_minutes.type === 'number');
ok('T-2 runtime_scenario.duration_minutes is accepted',
    /runtime_scenario:[\s\S]*duration_minutes/.test(spec));
ok('T-3 duration: { minutes } is accepted',
    /duration object[\s\S]*\{ minutes \}/.test(spec) &&
    /duration\.minutes/.test(ffSource));

let clock = commitClock(baseScenario({ duration_minutes: 90 }));
ok('T-4 duration_minutes = 90 produces end_hours = start + 1.5',
    clock && clock.start_hours === 0 && clock.end_hours === 1.5 && clock.duration_hours === 1.5);

clock = commitClock(baseScenario({ duration_hours: 4 }));
ok('T-5 duration_hours = 4 produces end_hours = start + 4',
    clock && clock.start_hours === 0 && clock.end_hours === 4 && clock.duration_hours === 4);

clock = commitClock(baseScenario({
    duration_minutes: 90,
    runtime_scenario: { start_hours: 2, end_hours: 10, duration_minutes: 30 }
}));
ok('T-6 explicit runtime_scenario.end_hours wins when provided',
    clock && clock.start_hours === 2 && clock.end_hours === 10 && clock.duration_hours === 8);

clock = commitClock(baseScenario());
ok('T-7 steps[].elapsed_hours is fallback only when no duration is provided',
    clock && clock.start_hours === 0 && clock.end_hours === 24 && clock.duration_hours === 24 &&
    /dur != null/.test(ffSource) &&
    /hrs\.length \? Math\.max\.apply/.test(ffSource));

clock = commitClock(baseScenario({ runtime_scenario: { start_hours: 1, duration_minutes: 90 } }));
ok('T-8 runtime_scenario.duration_minutes = 90 produces end_hours = start + 1.5',
    clock && clock.start_hours === 1 && clock.end_hours === 2.5 && clock.duration_hours === 1.5);

clock = commitClock(baseScenario({ duration: { minutes: 45 } }));
ok('T-9 duration: { minutes } produces minute-based duration',
    clock && clock.start_hours === 0 && clock.end_hours === 0.75 && clock.duration_hours === 0.75);

ok('T-10 Scenario time label still shows H-relative if no start_time',
    /return _formatHrel\(\+c\.current_hours\)/.test(mapSource));
ok('T-11 Scenario time label shows Zulu DTG if start_time exists',
    /rt\.start_time/.test(mapSource) &&
    /formatZuluDtg/.test(mapSource) &&
    /Date\.parse\(st\)/.test(mapSource));
ok('T-12 no step-count runtime length is introduced when duration exists',
    !/steps\.length\s*[-+*/]/.test(clockBoundsBlock) &&
    /duration_minutes/.test(clockBoundsBlock));

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
process.exit(failed ? 1 : 0);
