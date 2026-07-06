/* ============================================================================
 * test-runtime-safe-decision-effects-1.js
 * C4e Runtime Decision Safe Effects Contract
 * ----------------------------------------------------------------------------
 * Operator-selected decision effects may apply only safe runtime-session effects.
 * Dangerous unit/map/contact/combat effects remain blocked.
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
function cleanSource(text) {
    return String(text || '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
}
function block(text, start, end) {
    const i = text.indexOf(start);
    const j = text.indexOf(end, i + start.length);
    return i >= 0 ? text.slice(i, j >= 0 ? j : undefined) : '';
}

function scenario() {
    return {
        name: 'runtime-safe-decision-effects-c4e',
        start_time: '2026-07-06T00:00:00Z',
        runtime_scenario: {
            start_time: '2026-07-06T00:00:00Z',
            start_hours: 0,
            end_hours: 2,
            duration_hours: 2,
            clock_model: 'continuous'
        },
        mission_tasks: [
            { id: 'task-observe', status: 'planned', start_elapsed_hours: 0 }
        ],
        decision_points: [{
            id: 'dp-safe',
            trigger_elapsed_hours: 0.5,
            title: 'Authorize safe runtime posture?',
            prompt: 'Choose runtime posture.',
            options: [{
                id: 'safe-chain',
                label: 'Apply safe runtime effects',
                effects: [
                    { id: 'fx-note', kind: 'add_notification', message: 'Safe runtime option applied.' },
                    { id: 'fx-set', kind: 'set_runtime_flag', key: 'safe_authorized', value: true },
                    { id: 'fx-clear', kind: 'clear_runtime_flag', key: 'obsolete_flag' },
                    { id: 'fx-task', kind: 'update_mission_task_status', task_id: 'task-observe', status: 'active' },
                    { id: 'fx-close', kind: 'close_decision_point', decision_point_id: 'dp-safe' },
                    {
                        id: 'fx-open',
                        kind: 'open_decision_point',
                        decision_point_id: 'dp-follow',
                        title: 'Follow-on runtime choice',
                        prompt: 'Choose the next safe action.',
                        options: [{ id: 'follow-ok', label: 'Acknowledge' }]
                    },
                    {
                        id: 'fx-request',
                        kind: 'request_operator_decision',
                        decision_point_id: 'dp-chain',
                        prompt: 'Approve chained runtime review?',
                        options: [{ id: 'chain-ok', label: 'Approve chain' }]
                    },
                    { id: 'fx-move', kind: 'move_unit', unit_id: 'BLUE-1', lat: 1, lon: 2 },
                    { id: 'fx-destroy', kind: 'destroy_unit', unit_id: 'RED-1' },
                    { id: 'fx-contact', kind: 'set_contact', contact_id: 'C-1', status: 'detected' }
                ]
            }, {
                id: 'hold',
                label: 'Hold runtime posture',
                effects: [{ kind: 'add_notification', message: 'Runtime posture held.' }]
            }]
        }],
        steps: [
            { index: 0, elapsed_hours: 0, time_label: 'H' },
            { index: 1, elapsed_hours: 1, time_label: 'H+1' }
        ]
    };
}

function execState(hours) {
    return {
        active: true,
        selected_coa_id: 'C4E-TEST',
        selected_coa: { plan_id: 'C4E-TEST', phases: [{ name: 'observe', actions: [] }] },
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
            operator_decisions: {},
            mission_task_status: {},
            pending_effects: [],
            applied_effects: [],
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

const unitsBefore = [{ uid: 'BLUE-1', lat: 24, lon: 46 }, { uid: 'RED-1', lat: 25, lon: 47 }];
global.units = clone(unitsBefore);
global.RmoozScenario = { scenario: scenario() };

const FF = require(path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'free-fight-demo.js'));
const ffSource = read('UI_MOdified/client/shell/free-fight-demo.js');
const sccSource = read('UI_MOdified/client/shell/scenario-control-center.js');

console.log('\n=== C4e runtime safe decision effects contract ===\n');

const sc = global.RmoozScenario.scenario;
const scenarioBefore = JSON.stringify(sc);

FF._setCoaExecForTest(execState(0.5));
const fire = FF._fireRuntimeEventsFromClockForTest();
ok('T-0 runtime decision point opens before selection',
    fire.due_decision_point_count === 1 &&
    FF._runtimeDecisionPointsForTest().some((p) => p.id === 'dp-safe'));

const choice = FF._resolveRuntimeDecisionPointForTest('dp-safe', 'safe-chain');
const exec = FF._getCoaExecForTest();
const rt = exec.runtime_events;

ok('T-1 selecting set_runtime_flag applies flag in runtime session state',
    choice.ok === true && rt.runtime_flags.safe_authorized === true);
ok('T-2 clear_runtime_flag clears only runtime session flag',
    rt.runtime_flags.obsolete_flag === undefined);
ok('T-3 update_mission_task_status updates runtime session override only',
    rt.mission_task_status['task-observe'] &&
    rt.mission_task_status['task-observe'].status === 'active' &&
    sc.mission_tasks[0].status === 'planned');
ok('T-4 add_notification appends an operator-visible notification',
    logs.some((entry) => /Runtime notification: Safe runtime option applied/.test(entry.message || '')));
ok('T-5 close_decision_point closes the selected point after selection',
    rt.open_decision_points['dp-safe'] &&
    rt.open_decision_points['dp-safe'].status === 'closed' &&
    rt.operator_decisions['dp-safe'] &&
    rt.operator_decisions['dp-safe'].option_id === 'safe-chain');
ok('T-6 chained safe decision effects can open/request another runtime decision',
    rt.open_decision_points['dp-follow'] &&
    rt.open_decision_points['dp-follow'].status === 'open' &&
    rt.open_decision_points['dp-chain'] &&
    rt.open_decision_points['dp-chain'].status === 'open' &&
    rt.pending_effects.some((fx) => fx.kind === 'request_operator_decision' && fx.status === 'proposed'));
ok('T-7 dangerous move_unit remains blocked',
    rt.blocked_effects.some((fx) => fx.kind === 'move_unit' && fx.status === 'blocked'));
ok('T-8 dangerous destroy_unit remains blocked',
    rt.blocked_effects.some((fx) => fx.kind === 'destroy_unit' && fx.status === 'blocked'));
ok('T-9 scenario object is not mutated',
    JSON.stringify(sc) === scenarioBefore);
ok('T-10 window.units and map are not touched',
    JSON.stringify(global.units) === JSON.stringify(unitsBefore) &&
    mapCalls.applyState === 0 &&
    mapCalls.applyWorldStateUnitDeltas === 0);
ok('T-11 applied effects are recorded under runtime session state',
    rt.applied_effects.some((fx) => fx.kind === 'set_runtime_flag' && fx.status === 'applied_safe') &&
    rt.applied_effects.some((fx) => fx.kind === 'update_mission_task_status' && fx.status === 'applied_safe') &&
    rt.applied_effects.some((fx) => fx.kind === 'close_decision_point' && fx.status === 'applied_safe') &&
    rt.applied_effects.some((fx) => fx.kind === 'open_decision_point' && fx.status === 'applied_safe'));
ok('T-12 blocked effects are recorded with reasons',
    rt.blocked_effects.some((fx) => fx.kind === 'move_unit' && fx.reason === 'direct_unit_mutation_blocked') &&
    rt.blocked_effects.some((fx) => fx.kind === 'destroy_unit' && fx.reason === 'direct_unit_mutation_blocked') &&
    rt.blocked_effects.some((fx) => fx.kind === 'set_contact' && fx.reason === 'direct_detection_or_contact_mutation_blocked'));
ok('T-13 operator decision proposal remains pending for review/audit',
    rt.pending_effects.some((fx) =>
        fx.kind === 'operator_decision' &&
        fx.status === 'proposed' &&
        fx.decision_point_id === 'dp-safe' &&
        fx.payload &&
        Array.isArray(fx.payload.proposed_effects)));

const cleanFF = cleanSource(ffSource);
const cleanSCC = cleanSource(sccSource);
const decisionEffectBlock = cleanFF.slice(cleanFF.indexOf('function _applySafeRuntimeDecisionEffects'), cleanFF.indexOf('function _resolveRuntimeDecisionPoint'));
const decisionUiBlock = block(cleanSCC, 'function runtimeDecisionPointsHtml', 'function runSnapshot');
ok('T-14 no legacy UI or direct production mutation path is introduced by C4e',
    !/window\.units|global\.units|applyState|applyWorldStateUnitDeltas|fetch\s*\(|XMLHttpRequest/.test(decisionEffectBlock) &&
    !/Step|Snapshot|Turn|Phase chips|Next snapshot/.test(decisionUiBlock));
ok('T-15 applied safe effects append operator log entries',
    FF._getDecisionLogForTest().some((entry) => entry.action === 'runtime_effect_applied_safe') &&
    FF._getDecisionLogForTest().some((entry) => entry.action === 'runtime_effect_blocked'));

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
process.exit(failed ? 1 : 0);
