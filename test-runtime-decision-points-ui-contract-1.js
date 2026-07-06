/* ============================================================================
 * test-runtime-decision-points-ui-contract-1.js
 * C4d Runtime Decision Point UI Contract
 * ----------------------------------------------------------------------------
 * Runtime decision points are displayed only in SCC/runtime UI. Operator choice
 * is stored in _coaExec.runtime_events.operator_decisions, resolves the session
 * point, and creates a pending proposal only. No scenario/unit/map mutation.
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

function scenario() {
    return {
        name: 'runtime-decision-ui-c4d',
        start_time: '2026-07-06T00:00:00Z',
        runtime_scenario: {
            start_time: '2026-07-06T00:00:00Z',
            start_hours: 0,
            end_hours: 2,
            duration_hours: 2,
            clock_model: 'continuous'
        },
        runtime_events: [{
            id: 'evt-request',
            at_elapsed_hours: 0.5,
            title: 'Reserve request',
            once: true,
            effects: [{
                id: 'fx-request',
                kind: 'request_operator_decision',
                decision_point_id: 'dp-request',
                prompt: 'Authorize reserve search?',
                options: [
                    { id: 'approve-search', label: 'Approve search', effects: [{ kind: 'set_runtime_flag', key: 'search_authorized', value: true }] },
                    { id: 'hold-search', label: 'Hold search' }
                ]
            }]
        }],
        decision_points: [{
            id: 'dp-reserve',
            trigger_elapsed_hours: 1.0,
            title: 'Commit reserve?',
            prompt: 'Choose reserve posture.',
            options: [
                { id: 'commit', label: 'Commit reserve', effects: [{ kind: 'set_runtime_flag', key: 'reserve_committed', value: true }] },
                { id: 'hold', label: 'Hold reserve' }
            ]
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
        selected_coa_id: 'C4D-TEST',
        selected_coa: { plan_id: 'C4D-TEST', phases: [{ name: 'observe', actions: [] }] },
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
            runtime_flags: {},
            open_decision_points: {},
            operator_decisions: {},
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

const unitsBefore = [{ uid: 'BLUE-1', lat: 24, lon: 46 }];
global.units = clone(unitsBefore);
global.RmoozScenario = { scenario: scenario() };

const FF = require(path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'free-fight-demo.js'));
const SCC = require(path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'scenario-control-center.js'));
const ffSource = read('UI_MOdified/client/shell/free-fight-demo.js');
const sccSource = read('UI_MOdified/client/shell/scenario-control-center.js');

console.log('\n=== C4d runtime decision point UI contract ===\n');

const sc = global.RmoozScenario.scenario;
const scenarioBefore = JSON.stringify(sc);

FF._setCoaExecForTest(execState(0.5));
let fire = FF._fireRuntimeEventsFromClockForTest();
let points = FF._runtimeDecisionPointsForTest();
ok('T-1 runtime event request opens a pending operator decision',
    fire.due_count === 1 &&
    points.some((p) => p.id === 'dp-request' && p.options.some((o) => o.id === 'approve-search')));

let requestChoice = FF._resolveRuntimeDecisionPointForTest('dp-request', 'approve-search');
let exec = FF._getCoaExecForTest();
ok('T-2 operator choice is stored under _coaExec.runtime_events.operator_decisions',
    requestChoice.ok === true &&
    exec.runtime_events.operator_decisions['dp-request'] &&
    exec.runtime_events.operator_decisions['dp-request'].option_id === 'approve-search');
ok('T-3 resolved request is closed in runtime session state',
    exec.runtime_events.open_decision_points['dp-request'].status === 'resolved' &&
    exec.runtime_events.open_decision_points['dp-request'].selected_option_id === 'approve-search');
ok('T-4 operator choice creates a pending proposal only',
    exec.runtime_events.pending_effects.some((fx) =>
        fx.kind === 'operator_decision' &&
        fx.status === 'proposed' &&
        fx.decision_point_id === 'dp-request' &&
        fx.payload &&
        Array.isArray(fx.payload.proposed_effects) &&
        fx.payload.proposed_effects[0].key === 'search_authorized') &&
    exec.runtime_events.runtime_flags.search_authorized !== true);

FF._setCoaExecForTest(execState(1.0));
fire = FF._fireRuntimeEventsFromClockForTest();
points = FF._runtimeDecisionPointsForTest();
ok('T-5 time-based scenario decision point opens in the same SCC decision surface',
    fire.due_decision_point_count === 1 &&
    points.some((p) => p.id === 'dp-reserve' && p.title === 'Commit reserve?' && p.options.some((o) => o.id === 'commit')));

const facade = {
    isLoading: () => false,
    scenarioRuntime: () => ({ scenario_active: true, scenario_status: 'running', current_actor: 'Blue', objective_control: 'contested' }),
    committedExec: () => FF._getCoaExecForTest(),
    committedIsStale: () => false,
    coaPlan: () => ({ ok: true, coas: [{ plan_id: 'C4D-TEST', title: 'Runtime test COA', phases: [] }] }),
    selectedIdx: () => 0,
    isExecutable: () => true,
    actionTargets: () => [],
    commitBlockedReason: () => null,
    readiness: () => ({ units_loaded: true, objective_set: true, executable: true }),
    greenStatus: () => ({ collateral_risk: { band: 'low' } }),
    whiteOutcome: () => null,
    scenarioClockLabel: () => 'H+1',
    runtimeDecisionPoints: () => FF._runtimeDecisionPointsForTest(),
    resolveRuntimeDecisionPoint: (id, optionId) => FF._resolveRuntimeDecisionPointForTest(id, optionId),
    decisionLog: () => [],
    networkCalls: () => [],
    movementDebug: () => [],
    executedTrace: () => [],
    rawJson: () => null,
    targetSummary: () => '',
    executedTargetSummary: () => '',
    runBlockedReason: () => null,
    autoContinueEnabled: () => false
};
global.RmoozFreeFightDemo = { engine: facade };
const html = SCC.render();
ok('T-6 SCC renders runtime decision UI in Panel 5',
    html.includes('data-scc="runtime-decision-points"') &&
    html.includes('Pending decision') &&
    html.includes('Commit reserve?') &&
    html.includes('Commit reserve') &&
    html.includes('data-act="scc-runtime-decision-0-0"'));

FF._resolveRuntimeDecisionPointForTest('dp-reserve', 'commit');
exec = FF._getCoaExecForTest();
ok('T-7 scenario JSON, units, and map state are not mutated by operator decision',
    JSON.stringify(sc) === scenarioBefore &&
    JSON.stringify(global.units) === JSON.stringify(unitsBefore) &&
    mapCalls.applyState === 0 &&
    mapCalls.applyWorldStateUnitDeltas === 0);
ok('T-8 operator/event log receives a decision record',
    logs.some((entry) => /Operator decision recorded: Commit reserve\? -> Commit reserve/.test(entry.message || '')) &&
    FF._getDecisionLogForTest().some((entry) => entry.action === 'runtime_operator_decision'));

const cleanFF = cleanSource(ffSource);
const cleanSCC = cleanSource(sccSource);
ok('T-9 C4d code stays away from legacy UI and unit/map/combat execution',
    !/wg-next|wg-init|wg-reset|Legacy Snapshot|Next snapshot|Run trial/.test(cleanSCC) &&
    !/window\.units|global\.units|applyState|applyWorldStateUnitDeltas|move_unit|destroy_unit|set_contact|engagement|detection|fetch\s*\(/.test(cleanFF.slice(cleanFF.indexOf('function _resolveRuntimeDecisionPoint'), cleanFF.indexOf('function _appendRuntimeEventLog'))));
ok('T-10 no step/snapshot/turn UI language is introduced in SCC decision UI',
    !/Step|Snapshot|Turn|Phase chips|Next snapshot/.test(cleanSCC.slice(cleanSCC.indexOf('function runtimeDecisionPointsHtml'), cleanSCC.indexOf('function runSnapshot'))));

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
process.exit(failed ? 1 : 0);
