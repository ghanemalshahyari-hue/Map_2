/* ============================================================================
 * test-runtime-event-effects-contract-1.js
 * C4c Runtime Event Effects Proposal Contract
 * ----------------------------------------------------------------------------
 * Safe runtime event effects become explicit session proposals/overrides.
 * Dangerous effects are blocked. No scenario, unit, map, detection, engagement,
 * DB, offline, or durable journal mutation.
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
    return src.slice(a, b === -1 ? a + 3500 : b);
}
function cleanSource(text) {
    return String(text || '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
}

function scenario() {
    return {
        name: 'runtime-event-effects-c4c',
        start_time: '2026-07-06T00:00:00Z',
        runtime_scenario: {
            start_time: '2026-07-06T00:00:00Z',
            start_hours: 0,
            end_hours: 2,
            duration_hours: 2,
            clock_model: 'continuous'
        },
        runtime_events: [{
            id: 'evt-effects',
            at_elapsed_hours: 0.5,
            title: 'Effects package',
            once: true,
            effects: [
                { id: 'fx-note', kind: 'add_notification', message: 'Radar contact reported' },
                { id: 'fx-flag-on', kind: 'set_runtime_flag', key: 'radar_contact_seen', value: true },
                { id: 'fx-flag-off', kind: 'clear_runtime_flag', key: 'obsolete_flag' },
                { id: 'fx-open-dp', kind: 'open_decision_point', decision_point_id: 'dp-1', title: 'Commit reserve?' },
                { id: 'fx-task', kind: 'update_mission_task_status', task_id: 'task-1', status: 'active' },
                { id: 'fx-request', kind: 'request_operator_decision', decision_point_id: 'dp-2', prompt: 'Authorize search?' },
                { id: 'fx-move', kind: 'move_unit', unit_id: 'U1', to: [47, 25] },
                { id: 'fx-kill', kind: 'destroy_unit', unit_id: 'U2' },
                { id: 'fx-contact', kind: 'set_contact', contact_id: 'C1' }
            ]
        }],
        mission_tasks: [{ id: 'task-1', status: 'planned' }],
        decision_points: [
            { id: 'dp-1', status: 'pending', title: 'Commit reserve?' },
            { id: 'dp-2', status: 'pending', title: 'Authorize search?' }
        ],
        steps: [
            { index: 0, elapsed_hours: 0, time_label: 'H' },
            { index: 1, elapsed_hours: 1, time_label: 'H+1' }
        ]
    };
}

function execState(hours) {
    return {
        active: true,
        selected_coa_id: 'C4C-TEST',
        selected_coa: { plan_id: 'C4C-TEST', phases: [{ name: 'observe', actions: [] }] },
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
        clock: { start_hours: 0, current_hours: hours, end_hours: 2, duration_hours: 2, playing: true, speed: 1, display_step: -1 },
        runtime_events: {
            fired_ids: {},
            fired_decision_point_ids: {},
            last_due: [],
            last_due_decision_points: [],
            last_event_hours: null,
            next_event_hours: null,
            fired_count: 0,
            runtime_flags: { obsolete_flag: true },
            open_decision_points: {},
            mission_task_status: {},
            pending_effects: [],
            blocked_effects: [],
            last_effects: []
        },
        last_tick_timing: {}
    };
}

const logs = [];
const mapCalls = { setRunClock: 0, applyState: 0, applyWorldStateUnitDeltas: 0 };
global.AppRuntimeEvents = RuntimeEvents;
global.AppShellEventLog = { append(entry) { logs.push(entry); return entry; } };
global.AppAdjudicatorMap = {
    setRunClock() { mapCalls.setRunClock += 1; },
    applyState() { mapCalls.applyState += 1; },
    applyWorldStateUnitDeltas() { mapCalls.applyWorldStateUnitDeltas += 1; },
    getWorldState() { return { units: [] }; }
};
global.AppWorldState = { findStepForElapsedHours() { return { index: 0, elapsed_hours: 0, time_label: 'H' }; } };

const unitsBefore = [{ uid: 'U1', lat: 24, lon: 46 }, { uid: 'U2', lat: 25, lon: 47 }];
global.units = clone(unitsBefore);
global.RmoozScenario = { scenario: scenario() };

const FF = require(path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'free-fight-demo.js'));
const ffSource = read('UI_MOdified/client/shell/free-fight-demo.js');
const fireBlock = cleanSource(block(ffSource, 'function _fireRuntimeEventsFromClock()', '// Human-readable scenario time'));

console.log('\n=== C4c runtime event effects proposal contract ===\n');

const sc = global.RmoozScenario.scenario;
const event = sc.runtime_events[0];
const scenarioBefore = JSON.stringify(sc);
const pureBefore = { runtime_flags: { obsolete_flag: true }, open_decision_points: {}, mission_task_status: {}, pending_effects: [], blocked_effects: [], last_effects: [] };
const pureResult = RuntimeEvents.applySafeRuntimeEventEffects(pureBefore, event, event.effects);

ok('T-1 add_notification creates a safe notification proposal',
    pureResult.effects.some((fx) => fx.kind === 'add_notification' && fx.status === 'applied_safe' && /Radar contact/.test(fx.payload.message || '')));
ok('T-2 set_runtime_flag updates runtime session state only',
    pureResult.state.runtime_flags.radar_contact_seen === true && pureBefore.runtime_flags.radar_contact_seen !== true);
ok('T-3 clear_runtime_flag removes a runtime flag from the returned session state',
    pureResult.state.runtime_flags.obsolete_flag === undefined && pureBefore.runtime_flags.obsolete_flag === true);
ok('T-4 open_decision_point marks a session decision point open only',
    pureResult.state.open_decision_points['dp-1'] && pureResult.state.open_decision_points['dp-1'].status === 'open');
ok('T-5 update_mission_task_status creates a session override, not scenario mutation',
    pureResult.state.mission_task_status['task-1'] && pureResult.state.mission_task_status['task-1'].status === 'active' && sc.mission_tasks[0].status === 'planned');
ok('T-6 request_operator_decision creates a pending decision/effect proposal',
    pureResult.state.pending_effects.some((fx) => fx.kind === 'request_operator_decision' && fx.status === 'proposed'));
ok('T-7 dangerous move_unit effect is blocked',
    pureResult.state.blocked_effects.some((fx) => fx.kind === 'move_unit' && fx.status === 'blocked'));
ok('T-8 dangerous destroy_unit effect is blocked',
    pureResult.state.blocked_effects.some((fx) => fx.kind === 'destroy_unit' && fx.status === 'blocked'));
ok('T-9 dangerous contact/detection mutation is blocked',
    pureResult.state.blocked_effects.some((fx) => fx.kind === 'set_contact' && fx.status === 'blocked'));

FF._setCoaExecForTest(execState(0.5));
let fireResult = FF._fireRuntimeEventsFromClockForTest();
let exec = FF._getCoaExecForTest();
const firstLastEffects = exec.runtime_events.last_effects.length;
const firstBlocked = exec.runtime_events.blocked_effects.length;
const c4bFiringOk = fireResult.due_count === 1 &&
    exec.runtime_events.fired_ids['evt-effects'] === true &&
    logs.some((entry) => /Runtime event: Effects package/.test(entry.message || ''));

ok('T-10 scenario object is not mutated by effect proposal handling',
    JSON.stringify(sc) === scenarioBefore);
ok('T-11 window.units and map state are not touched by effect proposal handling',
    JSON.stringify(global.units) === JSON.stringify(unitsBefore) &&
    mapCalls.applyState === 0 &&
    mapCalls.applyWorldStateUnitDeltas === 0 &&
    !/(fetch\s*\(|XMLHttpRequest|applyState|applyWorldStateUnitDeltas|window\.units|global\.units|set_contact|change_weapon_state|destroyUnit|moveUnit)/.test(fireBlock));
ok('T-12 once event effects do not apply twice',
    fireResult.due_count === 1 &&
    FF._fireRuntimeEventsFromClockForTest().due_count === 0 &&
    exec.runtime_events.last_effects.length === firstLastEffects &&
    exec.runtime_events.blocked_effects.length === firstBlocked);
ok('T-13 stop/reset clears runtime effect session state',
    !!FF._resetRuntimeEventSessionStateForTest() &&
    Object.keys(exec.runtime_events.runtime_flags).length === 0 &&
    Object.keys(exec.runtime_events.open_decision_points).length === 0 &&
    Object.keys(exec.runtime_events.mission_task_status).length === 0 &&
    exec.runtime_events.pending_effects.length === 0 &&
    exec.runtime_events.blocked_effects.length === 0 &&
    exec.runtime_events.last_effects.length === 0);
ok('T-14 C4b firing still marks fired IDs and logs due events',
    c4bFiringOk);
ok('T-15 blocked dangerous effects are visible to the operator log',
    logs.some((entry) => /Runtime effect blocked: move_unit/.test(entry.message || '')) &&
    logs.some((entry) => /Runtime effect blocked: destroy_unit/.test(entry.message || '')));

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
process.exit(failed ? 1 : 0);
