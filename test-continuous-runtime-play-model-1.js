'use strict';

/*
 * C3b baseline gate: primary Play owns continuous scenario time.
 *
 * This is intentionally static/no-server. It verifies the runtime contract
 * introduced after C1/C2: Scenario Control Center Play drives the continuous
 * scenario loop and the same published run clock; Pause freezes that clock;
 * Stop/reset returns it to the scenario start. Steps remain snapshots/review.
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let passed = 0;
let failed = 0;
function ok(label, cond) {
    if (cond) { passed++; console.log('  PASS  ' + label); }
    else { failed++; console.error('  FAIL  ' + label); }
}

function block(src, from, to) {
    const a = src.indexOf(from);
    if (a === -1) return '';
    const b = to ? src.indexOf(to, a + from.length) : -1;
    return src.slice(a, b === -1 ? a + 2000 : b);
}

const ff = read('UI_MOdified/client/shell/free-fight-demo.js');
const scc = read('UI_MOdified/client/shell/scenario-control-center.js');
const spec = read('UI_MOdified/server/ai/scenario-schema-spec.js');

console.log('\n=== C3b: continuous runtime Play/Pause/Stop model ===\n');

console.log('--- 1. Schema exposes runtime-time metadata ---');
ok('runtime_scenario optional top-level field exists', /runtime_scenario:\s*\{\s*required:\s*false,\s*type:\s*'object'/.test(spec));
ok('start_time optional top-level field exists', /start_time:\s*\{\s*required:\s*false,\s*type:\s*'string'/.test(spec));
ok('duration_hours optional top-level field exists', /duration_hours:\s*\{\s*required:\s*false,\s*type:\s*'number'/.test(spec));
ok('duration object optional top-level field exists', /duration:\s*\{\s*required:\s*false,\s*type:\s*'object'/.test(spec));

console.log('\n--- 2. Free Fight runtime clock has duration-aware bounds ---');
ok('runtime duration helper is present', ff.includes('function _runtimeDurationHours'));
ok('clock bounds read runtime_scenario start/end/duration', /rtStart/.test(ff) && /rtEnd/.test(ff) && /_runtimeDurationHours\(scn\)/.test(ff));
ok('committed clock seed carries duration_hours', /duration_hours:\s*_clkB\.duration_hours/.test(ff));
ok('clock advances with speed-scaled continuous time', /COA_CLOCK_HOURS_PER_TICK \* c\.speed/.test(ff) && /c\.speed = _clockSpeedMult\(\)/.test(ff));

console.log('\n--- 3. Scenario Play/Pause/Stop controls the same run clock ---');
const runScenario = block(ff, 'function _runScenario()', 'function _pauseScenario()');
const pauseScenario = block(ff, 'function _pauseScenario()', 'function _stopScenario()');
const stopScenario = block(ff, 'function _stopScenario()', 'function _resetScenario()');
const scenarioTick = block(ff, 'function _scenarioTick()', 'function _commitAutoBlueOrder');

ok('single helper publishes Play/Pause state to the existing run clock', ff.includes('function _setScenarioClockPlaying') && ff.includes('_publishRunClock()'));
ok('single helper resets existing run clock to start', ff.includes('function _resetScenarioClockToStart') && /current_hours = \+_coaExec\.clock\.start_hours/.test(ff));
ok('Run Scenario sets clock playing before ticking', /_setScenarioClockPlaying\(true\)/.test(runScenario) && /_scenarioTick\(\)/.test(runScenario));
ok('scenario tick keeps active runtime clock playing while unit-controller runs', /_setScenarioClockPlaying\(true\)/.test(scenarioTick) && /return _coaExecTick\(\)/.test(scenarioTick));
ok('Pause Scenario freezes the clock and marks committed exec paused', /_coaExec\.paused = true/.test(pauseScenario) && /_setScenarioClockPlaying\(false\)/.test(pauseScenario));
ok('Stop Scenario resets the clock to the scenario start', /_resetScenarioClockToStart\(\)/.test(stopScenario) && /operator_stopped/.test(stopScenario));
ok('Reset Scenario also resets the clock to start', /function _resetScenario\(\) \{ _stopScenarioTimer\(\); _resetScenarioClockToStart\(\);/.test(ff));

console.log('\n--- 4. SCC primary Run remains the continuous runtime entry point ---');
ok('SCC committed-state primary button is Run Scenario', /btnPri\('scc-run', '.*Run Scenario'/.test(scc));
ok('SCC binds committed Run to runScenarioContinuous', /state\(\) === 'committed' && typeof eng\.runScenarioContinuous === 'function'/.test(scc));
ok('engine runScenarioContinuous enables auto-continue then calls _runScenario', /runScenarioContinuous:\s*function \(\) \{[\s\S]*_scenarioAutoContinue = true;[\s\S]*return _runScenario\(\);/.test(ff));
ok('primary readout is Scenario time, not a leading Turn control', scc.includes("kv('Scenario time'") && !scc.includes("kv('Turn', String(scn.scenario_turn)"));

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
process.exit(failed ? 1 : 0);
