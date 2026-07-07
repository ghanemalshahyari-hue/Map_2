'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const RuntimeEvents = require(path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'runtime-events.js'));

let passed = 0;
let failed = 0;
function ok(label, cond) {
    if (cond) { passed++; console.log('  PASS  ' + label); }
    else { failed++; console.error('  FAIL  ' + label); }
}
function clone(v) { return JSON.parse(JSON.stringify(v)); }
function baseState() {
    return {
        pending_approvals: {},
        approval_decisions: {},
        approved_effects: [],
        rejected_effects: [],
        applied_effects: [],
        pending_effects: [],
        blocked_effects: [],
        pending_execution_plans: [],
        blocked_execution_plans: [],
        execution_plan_history: []
    };
}
function effect(id, kind, status) {
    return {
        effect_id: id,
        event_id: 'evt-doc6',
        kind,
        status,
        payload: { key: id, value: true },
        approval_decision: {
            operator_id: 'tester',
            decided_at_elapsed_hours: 5,
            scenario_time_label: 'H+5'
        }
    };
}

console.log('\n=== DOC6 approved runtime effect execution planner ===\n');

(function () {
    const st = baseState();
    st.approved_effects.push(effect('safe-1', 'set_runtime_flag', 'approved_safe'));
    const res = RuntimeEvents.buildRuntimeExecutionPlans(st, { scenario_time_label: 'H+5' });
    const plan = res.plans[0];
    ok('T-1 approved safe effect creates planned execution record',
        plan && plan.source_effect_id === 'safe-1' &&
        plan.classification === 'safe_session_only' &&
        plan.status === 'planned');
})();

(function () {
    const st = baseState();
    st.approved_effects.push(effect('weapon-1', 'weapon_release', 'approved_pending_execution'));
    const res = RuntimeEvents.buildRuntimeExecutionPlans(st, {});
    const plan = res.plans[0];
    ok('T-2 approved weapon_release creates requires_executor, not executed',
        plan && plan.classification === 'requires_world_state_executor' &&
        plan.status === 'requires_executor' &&
        res.state.pending_execution_plans.length === 1);
})();

(function () {
    const st = baseState();
    st.approved_effects.push(effect('move-1', 'move_unit', 'approved_pending_execution'));
    const res = RuntimeEvents.buildRuntimeExecutionPlans(st, {});
    const plan = res.plans[0];
    ok('T-3 dangerous move_unit creates blocked plan',
        plan && plan.classification === 'dangerous_blocked' &&
        plan.status === 'blocked');
})();

(function () {
    const st = baseState();
    st.approved_effects.push(effect('weird-1', 'unsupported_kind', 'approved_safe'));
    const res = RuntimeEvents.buildRuntimeExecutionPlans(st, {});
    const plan = res.plans[0];
    ok('T-4 unsupported effect creates unsupported/blocked plan',
        plan && plan.classification === 'unsupported' &&
        plan.status === 'blocked');
})();

(function () {
    const st = baseState();
    st.approved_effects.push(effect('safe-2', 'add_notification', 'approved_safe'));
    const scenario = { id: 'S1', name: 'Scenario' };
    const before = JSON.stringify(scenario);
    RuntimeEvents.buildRuntimeExecutionPlans(st, { scenario });
    ok('T-5 execution planner does not mutate scenario', JSON.stringify(scenario) === before);
})();

(function () {
    const st = baseState();
    st.approved_effects.push(effect('safe-3', 'clear_runtime_flag', 'approved_safe'));
    global.window = global.window || {};
    global.window.units = [{ uid: 'U1', position: [1, 2] }];
    const beforeUnits = JSON.stringify(global.window.units);
    const mapCalls = { n: 0 };
    global.window.AppAdjudicatorMap = { applyState() { mapCalls.n++; } };
    RuntimeEvents.buildRuntimeExecutionPlans(st, {});
    ok('T-6 execution planner does not mutate window.units/map',
        JSON.stringify(global.window.units) === beforeUnits && mapCalls.n === 0);
})();

(function () {
    const st = baseState();
    st.approved_effects.push(effect('dup-1', 'set_runtime_flag', 'approved_safe'));
    const first = RuntimeEvents.buildRuntimeExecutionPlans(st, {});
    const second = RuntimeEvents.buildRuntimeExecutionPlans(first.state, {});
    ok('T-7 duplicate approved effect does not duplicate execution plan',
        first.plans.length === 1 && second.plans.length === 0 &&
        second.state.execution_plan_history.length === 1);
})();

(function () {
    const st = baseState();
    st.approved_effects.push(effect('safe-4', 'update_mission_task_status', 'approved_safe'));
    const res = RuntimeEvents.buildRuntimeExecutionPlans(st, {});
    ok('T-8 pending_execution_plans are tracked in runtime state',
        res.state.pending_execution_plans.length === 1 &&
        res.state.pending_execution_plans[0].status === 'planned');
})();

(function () {
    const st = baseState();
    st.approved_effects.push(effect('move-2', 'destroy_unit', 'approved_pending_execution'));
    const res = RuntimeEvents.buildRuntimeExecutionPlans(st, {});
    ok('T-9 blocked_execution_plans are tracked with reason',
        res.state.blocked_execution_plans.length === 1 &&
        /dangerous/.test(res.state.blocked_execution_plans[0].reason || ''));
})();

(function () {
    global.window = {
        RmoozFreeFightDemo: {
            engine: {
                isLoading: () => false,
                scenarioRuntime: () => ({}),
                committedExec: () => ({ active: true, selected_coa_id: 'COA-1', clock: { speed: 1 } }),
                committedIsStale: () => false,
                coaPlan: () => ({ ok: true, coas: [{ plan_id: 'COA-1', title: 'Stub COA', phases: [] }] }),
                selectedIdx: () => 0,
                readiness: () => ({ units_loaded: true, objective_set: true, executable: true, taskable: 1, blocked: 0, scenario_name: 'DOC6', data_reliability: 'operational', source_status: 'sourced', doctrine_status: 'applied', commander_review_status: 'not required' }),
                runtimeApprovals: () => [],
                runtimeApprovalSummary: () => ({ pending: 0, approved: 1, rejected: 0, blocked: 0, journal_retry_queue: 0 }),
                runtimeApprovalHistory: () => [],
                runtimeExecutionSummary: () => ({ pending: 1, blocked: 1, history: 2, last_execution_plan: { effect_kind: 'weapon_release', classification: 'requires_world_state_executor', status: 'requires_executor', reason: 'future executor' } }),
                runBlockedReason: () => null,
                autoContinueEnabled: () => false,
                whiteOutcome: () => ({}),
                greenStatus: () => ({}),
                isRealLlm: () => false,
                coaQuality: () => ({ pass: true }),
                hardBlockReason: () => null,
                tasksBlockedUnit: () => false,
                scenarioClockLabel: () => 'H+5',
                snapshotInEffectLabel: () => 'review only',
                targetSummary: () => '',
                movementDebug: () => [],
                executedTrace: () => [],
                decisionLog: () => [],
                networkCalls: () => [],
                rawJson: () => null
            }
        }
    };
    delete require.cache[require.resolve(path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'scenario-control-center.js'))];
    const SCC = require(path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'scenario-control-center.js'));
    const html = SCC.render();
    const src = fs.readFileSync(path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'scenario-control-center.js'), 'utf8');
    const i = src.indexOf('function executionPlanSummaryHtml');
    const body = src.slice(i, i + 2200);
    ok('T-10 SCC summary/readout uses execution plan language, not step/snapshot/turn',
        /Runtime execution plans/.test(html) &&
        /pending executions/.test(html) &&
        /blocked executions/.test(html) &&
        !/\bstep\b|\bsnapshot\b|\bturn\b/i.test(body));
})();

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
process.exit(failed ? 1 : 0);
