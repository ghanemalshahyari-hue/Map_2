/* ============================================================================
 * test-runtime-events-integration-1.js
 * C4b Runtime Event Firing Integration Gate
 * ----------------------------------------------------------------------------
 * Runtime clock tick -> C4a evaluator -> transient fired IDs -> operator log.
 * C4f allows fire-and-forget audit journaling, but no unsafe effect execution,
 * unit/map mutation, or scenario JSON mutation.
 * ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const RuntimeEvents = require(path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'runtime-events.js'));

let passed = 0;
let failed = 0;
function ok(label, cond) {
    if (cond) { passed += 1; console.log('  PASS  ' + label); }
    else { failed += 1; console.error('  FAIL  ' + label); }
}

function clone(v) { return JSON.parse(JSON.stringify(v)); }
function block(src, from, to) {
    const a = src.indexOf(from);
    if (a === -1) return '';
    const b = to ? src.indexOf(to, a + from.length) : -1;
    return src.slice(a, b === -1 ? a + 2500 : b);
}
function cleanSource(text) {
    return String(text || '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
}

function scenario() {
    return {
        name: 'runtime-events-c4b',
        scenario_label: 'Runtime Events C4b',
        start_time: '2026-07-06T00:00:00Z',
        runtime_scenario: {
            start_time: '2026-07-06T00:00:00Z',
            start_hours: 0,
            end_hours: 2,
            duration_hours: 2,
            clock_model: 'continuous'
        },
        runtime_events: [
            { id: 'h0030', at_elapsed_hours: 0.5, kind: 'intel', title: 'First contact', once: true, effects: [{ type: 'mutate_unit', unit_id: 'U1' }] },
            { id: 'h0100', at_elapsed_hours: 1.0, kind: 'mission', title: 'Phase line reached', once: true }
        ],
        decision_points: [
            { id: 'dp-1', trigger_elapsed_hours: 1.5, title: 'Commit reserve', options: [{ id: 'hold', label: 'Hold' }] }
        ],
        steps: [
            { index: 0, elapsed_hours: 0, time_label: 'H', phase: 'START' },
            { index: 1, elapsed_hours: 1, time_label: 'H+1', phase: 'MID' },
            { index: 2, elapsed_hours: 2, time_label: 'H+2', phase: 'END' }
        ]
    };
}

function execState(hours) {
    return {
        active: true,
        side: 'BLUE',
        selected_coa_id: 'C4B-TEST',
        selected_coa: { plan_id: 'C4B-TEST', phases: [{ name: 'observe', actions: [] }] },
        current_phase_index: 0,
        phase_status: 'running',
        unit_order_status: {},
        completed_orders: [],
        branch_triggers: [],
        replan_required: false,
        paused: false,
        ticks: 0,
        stuck_ticks: 0,
        commit_unit_count: 0,
        clock: {
            start_hours: 0,
            current_hours: hours,
            end_hours: 2,
            duration_hours: 2,
            playing: true,
            speed: 1,
            display_step: -1
        },
        last_tick_timing: {}
    };
}

const logs = [];
const mapCalls = { setRunClock: 0, applyState: 0, applyWorldStateUnitDeltas: 0 };
global.AppRuntimeEvents = RuntimeEvents;
global.AppShellEventLog = {
    append(entry) {
        logs.push(entry);
        return entry;
    }
};
global.AppAdjudicatorMap = {
    setRunClock() { mapCalls.setRunClock += 1; },
    applyState() { mapCalls.applyState += 1; },
    getWorldState() { return { units: [] }; },
    applyWorldStateUnitDeltas() { mapCalls.applyWorldStateUnitDeltas += 1; }
};
global.AppWorldState = {
    findStepForElapsedHours(s, hours) {
        const steps = Array.isArray(s && s.steps) ? s.steps : [];
        return steps.reduce((best, step) => {
            if (!step || typeof step.elapsed_hours !== 'number' || step.elapsed_hours > hours) return best;
            return !best || step.elapsed_hours >= best.elapsed_hours ? step : best;
        }, null);
    }
};

const unitsBefore = [{ uid: 'U1', lat: 24, lon: 46 }];
global.units = clone(unitsBefore);
global.RmoozScenario = { scenario: scenario() };

const FF = require(path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'free-fight-demo.js'));
const ffSource = read('UI_MOdified/client/shell/free-fight-demo.js');
const tickBlock = block(ffSource, 'function _coaExecTick()', 'var COA_EXEC_TICK_MS');
const fireBlock = cleanSource(block(ffSource, 'function _fireRuntimeEventsFromClock()', '// Human-readable scenario time'));

console.log('\n=== C4b runtime event firing integration gate ===\n');

const sc = global.RmoozScenario.scenario;
const scenarioBefore = JSON.stringify(sc);
FF._setCoaExecForTest(execState(0.25));
FF._advanceScenarioClockForTest();
let result = FF._fireRuntimeEventsFromClockForTest();
let exec = FF._getCoaExecForTest();
ok('T-1 H+00:30 event fires after the runtime clock advances to current_hours 0.5',
    exec.clock.current_hours === 0.5 && result.due_count === 1 && exec.runtime_events.fired_ids.h0030 === true);

const firstLogCount = logs.length;
result = FF._fireRuntimeEventsFromClockForTest();
ok('T-2 once event fires only once in the same runtime session',
    result.due_count === 0 && logs.length === firstLogCount && exec.runtime_events.fired_ids.h0030 === true);

exec.clock.current_hours = 0.75;
exec.paused = true;
const pausedLogCount = logs.length;
const pausedTick = FF._coaExecTickForTest();
ok('T-3 pause creates no new fires because the tick path returns before time advances',
    pausedTick === null && exec.clock.current_hours === 0.75 && logs.length === pausedLogCount && !exec.runtime_events.fired_ids.h0100);

exec.paused = false;
FF._advanceScenarioClockForTest();
result = FF._fireRuntimeEventsFromClockForTest();
ok('T-4 resume advances runtime time and fires the later event',
    exec.clock.current_hours === 1.0 && result.due_count === 1 && exec.runtime_events.fired_ids.h0100 === true);

FF._resetRuntimeEventSessionStateForTest();
exec = FF._getCoaExecForTest();
ok('T-5 stop/reset clears transient fired runtime-event IDs',
    exec.runtime_events && Object.keys(exec.runtime_events.fired_ids).length === 0 && Object.keys(exec.runtime_events.fired_decision_point_ids).length === 0);

ok('T-6 fired IDs live on _coaExec.runtime_events, not on authored scenario data',
    Object.prototype.hasOwnProperty.call(exec, 'runtime_events') &&
    !JSON.stringify(sc.runtime_events).includes('fired_ids') &&
    !JSON.stringify(sc.runtime_events).includes('fired":true'));

ok('T-7 scenario object is not mutated by C4b firing integration',
    JSON.stringify(sc) === scenarioBefore);

ok('T-8 operator-visible event log notification is appended for due events',
    logs.some((entry) => entry && entry.category === 'OPERATOR' && entry.severity === 'notice' &&
        entry.source === 'runtime-events' && /Runtime event: First contact at H\+0\.5/.test(entry.message || '')));

ok('T-9 no event effects execute on units/map/combat; only audit journal hook is allowed',
    JSON.stringify(global.units) === JSON.stringify(unitsBefore) &&
    mapCalls.applyState === 0 &&
    mapCalls.applyWorldStateUnitDeltas === 0 &&
    /_journalRuntimeRecord\('runtime_event_fired'/.test(fireBlock) &&
    !/(XMLHttpRequest|applyState|applyWorldStateUnitDeltas|window\.units|global\.units|executeEffect|moveUnit|destroyUnit|mutateUnit|\/api\/sim\/decide|\/api\/ai\/adjudicate)/.test(fireBlock));

global.RmoozScenario.scenario = scenario();
FF._setCoaExecForTest(execState(0.49));
exec = FF._getCoaExecForTest();
exec.clock.step_index = 99;
result = FF._fireRuntimeEventsFromClockForTest();
ok('T-10 event due checks use current_hours, not step_index',
    result.due_count === 0 && !exec.runtime_events.fired_ids.h0030);

ok('T-11 C4a evaluator contract remains available to C4b',
    typeof RuntimeEvents.evaluateRuntimeEvents === 'function' &&
    typeof RuntimeEvents.markRuntimeEventsFired === 'function' &&
    RuntimeEvents.evaluateRuntimeEvents(scenario(), { clock: { current_hours: 0.5 }, fired_state: {} }).due_events[0].id === 'h0030');

// Post-C10-correction: _advanceScenarioClock()/_fireRuntimeEventsFromClock()
// are no longer called inline in _coaExecTick() — they were extracted into a
// shared _tickScenarioClockAndRuntimeEvents() helper so the SAME tick logic
// also runs once COA phases exhaust (from _scenarioTransition(), see
// test-runtime-post-phase-continuity-1.js). Verify the real chain instead:
// _coaExecTick calls the helper, and the helper itself still advances the
// clock BEFORE firing runtime events (order preserved).
const sharedTickHelperBlock = block(ffSource, 'function _tickScenarioClockAndRuntimeEvents()', 'function _coaExecTick()');
ok('T-12 _coaExecTick integrates clock advance before runtime event firing and records timing counts',
    tickBlock.indexOf('_tickScenarioClockAndRuntimeEvents()') !== -1 &&
    sharedTickHelperBlock.indexOf('_advanceScenarioClock()') !== -1 &&
    sharedTickHelperBlock.indexOf('_fireRuntimeEventsFromClock()') !== -1 &&
    sharedTickHelperBlock.indexOf('_advanceScenarioClock()') < sharedTickHelperBlock.indexOf('_fireRuntimeEventsFromClock()') &&
    /runtime_event_count/.test(tickBlock) &&
    /runtime_decision_point_count/.test(tickBlock));

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
process.exit(failed ? 1 : 0);
