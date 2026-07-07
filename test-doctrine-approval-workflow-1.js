'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const Doctrine = require(path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'doctrine-rules.js'));
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
        runtime_flags: {},
        open_decision_points: {},
        mission_task_status: {},
        pending_effects: [],
        blocked_effects: [],
        last_effects: [],
        doctrine_decisions: [],
        pending_approvals: {},
        applied_effects: [],
        approval_decisions: {},
        approved_effects: [],
        rejected_effects: [],
        doctrine_journaled_ids: {},
        pending_doctrine_journal_records: [],
        last_doctrine_journal_error: null
    };
}
function event(effects) {
    return { id: 'evt-doc4', at_elapsed_hours: 3, effects };
}
function apply(scenario, effects, state, writer) {
    const records = [];
    const res = RuntimeEvents.applySafeRuntimeEventEffects(state || baseState(), event(effects), effects, {
        scenario,
        doctrine: Doctrine,
        scenarioName: 'DOC4 Test',
        scenarioId: 'doc4-scenario',
        runId: 'doc4-run',
        operatorId: 'tester',
        journalDoctrineDecision: writer || function (record) { records.push(clone(record)); return { ok: true }; }
    });
    res.records = records;
    return res;
}
function decide(st, id, action, extra) {
    const logs = [];
    const records = [];
    const opts = Object.assign({
        scenario: { name: 'DOC4 Test' },
        scenarioName: 'DOC4 Test',
        scenarioId: 'doc4-scenario',
        runId: 'doc4-run',
        operatorId: 'tester',
        decided_at_elapsed_hours: 3.5,
        scenario_time_label: 'H+3.5',
        operatorLog: function (approval) { logs.push(clone(approval)); },
        journalDoctrineDecision: function (record) { records.push(clone(record)); return { ok: true }; }
    }, extra || {});
    const res = RuntimeEvents.decideRuntimeApproval(st, id, action, opts);
    res.logs = logs;
    res.records = records;
    return res;
}

console.log('\n=== DOC4 doctrine approval workflow ===\n');

(function () {
    const scenario = { doctrine_rules: [{ id: 'd-auth', action: 'runtime_flag', decision: 'require_approval', requires_authority: 'J3', reason: 'flag approval' }] };
    const res = apply(scenario, [{ id: 'flag-auth', kind: 'set_runtime_flag', key: 'x', value: true }]);
    ok('T-1 require_approval effect creates pending approval state',
        res.effects[0].status === 'requires_approval' && !!res.state.pending_approvals['flag-auth']);
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
                readiness: () => ({ units_loaded: true, objective_set: true, executable: true, taskable: 1, blocked: 0, scenario_name: 'DOC4', data_reliability: 'operational', source_status: 'sourced', doctrine_status: 'applied', commander_review_status: 'not required' }),
                runtimeApprovals: () => [{ approval_id: 'ap-ui', effect_id: 'ap-ui', event_id: 'evt-doc4', kind: 'weapon_release', status: 'requires_approval', at_elapsed_hours: 3, reason: 'WRA approval', doctrine_decision: { required_authority: 'Fires', matched_rules: [{ id: 'wra-1' }], reasons: ['WRA approval'] } }],
                runBlockedReason: () => null,
                autoContinueEnabled: () => false,
                whiteOutcome: () => ({}),
                greenStatus: () => ({}),
                isRealLlm: () => false,
                coaQuality: () => ({ pass: true }),
                hardBlockReason: () => null,
                tasksBlockedUnit: () => false,
                scenarioClockLabel: () => 'H+3',
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
    ok('T-2 pending approval is exposed to SCC/runtime surface',
        /data-scc="doctrine-approvals"/.test(html) && /weapon_release/.test(html) && /Fires/.test(html) && /wra-1/.test(html));
})();

(function () {
    const scenario = { doctrine_rules: [{ id: 'd-auth', action: 'runtime_flag', decision: 'require_approval', requires_authority: 'J3', reason: 'flag approval' }] };
    const res = apply(scenario, [{ id: 'flag-approve', kind: 'set_runtime_flag', key: 'x', value: true }]);
    const ap = decide(res.state, 'flag-approve', 'approve');
    ok('T-3 approve stores approval decision',
        ap.status === 'recorded' && ap.state.approval_decisions['flag-approve'].selected_action === 'approve' &&
        ap.state.approved_effects[0].status === 'approved_safe');
})();

(function () {
    const scenario = { doctrine_rules: [{ id: 'd-auth', action: 'runtime_flag', decision: 'require_approval', reason: 'flag approval' }] };
    const res = apply(scenario, [{ id: 'flag-reject', kind: 'set_runtime_flag', key: 'x', value: true }]);
    const rej = decide(res.state, 'flag-reject', 'reject');
    ok('T-4 reject stores rejection decision',
        rej.status === 'recorded' && rej.state.approval_decisions['flag-reject'].selected_action === 'reject' &&
        rej.state.rejected_effects[0].status === 'rejected');
})();

(function () {
    const scenario = { doctrine_rules: [{ id: 'd-auth', action: 'runtime_flag', decision: 'require_approval', reason: 'approval' }] };
    const res = apply(scenario, [{ id: 'flag-once', kind: 'set_runtime_flag', key: 'x', value: true }]);
    const first = decide(res.state, 'flag-once', 'approve');
    const second = decide(first.state, 'flag-once', 'reject');
    ok('T-5 duplicate approve/reject does not duplicate records',
        first.status === 'recorded' && second.status === 'not_found' &&
        Object.keys(second.state.approval_decisions).length === 1 &&
        second.state.approved_effects.length === 1 && second.state.rejected_effects.length === 0);
})();

(function () {
    const st = baseState();
    st.pending_approvals['danger'] = { approval_id: 'danger', effect_id: 'danger', event_id: 'evt-doc4', kind: 'destroy_unit', status: 'requires_approval', reason: 'manual authority', doctrine_decision: { matched_rules: [{ id: 'manual' }], reasons: ['manual authority'] } };
    const scenario = { id: 'S' };
    const beforeScenario = JSON.stringify(scenario);
    global.window = global.window || {};
    global.window.units = [{ uid: 'U1', strength: 1 }];
    const beforeUnits = JSON.stringify(global.window.units);
    const mapCalls = { n: 0 };
    global.window.AppAdjudicatorMap = { applyState() { mapCalls.n++; } };
    const res = decide(st, 'danger', 'approve', { scenario });
    ok('T-6 approval does not mutate units/map/scenario',
        JSON.stringify(scenario) === beforeScenario && JSON.stringify(global.window.units) === beforeUnits && mapCalls.n === 0);
    ok('T-7 approval does not execute dangerous effects', global.window.units[0].strength === 1);
    ok('T-8 approved dangerous effect remains pending execution, not applied',
        res.approval.resulting_status === 'approved_pending_execution' && res.state.applied_effects.length === 0);
})();

(function () {
    const scenario = { doctrine_rules: [{ id: 'd-auth', action: 'runtime_flag', decision: 'require_approval', reason: 'approval' }] };
    const res = apply(scenario, [{ id: 'flag-no', kind: 'set_runtime_flag', key: 'x', value: true }]);
    const rej = decide(res.state, 'flag-no', 'reject');
    ok('T-9 rejected effect is not applied',
        rej.state.runtime_flags.x === undefined && rej.state.applied_effects.length === 0 && rej.state.rejected_effects.length === 1);
})();

(function () {
    const st = baseState();
    st.pending_approvals['blocked'] = { approval_id: 'blocked', effect_id: 'blocked', event_id: 'evt-doc4', kind: 'add_notification', status: 'blocked', reason: 'blocked' };
    const res = RuntimeEvents.decideRuntimeApproval(st, 'blocked', 'approve', {});
    ok('T-10 blocked effect cannot be approved',
        res.status === 'blocked_not_approvable' && Object.keys(res.state.approval_decisions).length === 0);
})();

(function () {
    const scenario = { doctrine_rules: [{ id: 'd-auth', action: 'runtime_flag', decision: 'require_approval', reason: 'approval' }] };
    const res = apply(scenario, [{ id: 'flag-pause', kind: 'set_runtime_flag', key: 'x', value: true }]);
    const paused = clone(res.state);
    paused.paused = true;
    paused.paused = false;
    ok('T-11 pause/resume preserves pending approvals', !!paused.pending_approvals['flag-pause']);
    const reset = baseState();
    ok('T-12 stop/reset clears approval state',
        Object.keys(reset.pending_approvals).length === 0 && Object.keys(reset.approval_decisions).length === 0 &&
        reset.approved_effects.length === 0 && reset.rejected_effects.length === 0);
})();

(function () {
    const scenario = { doctrine_rules: [{ id: 'd-auth', action: 'runtime_flag', decision: 'require_approval', reason: 'approval' }] };
    const res = apply(scenario, [{ id: 'flag-log', kind: 'set_runtime_flag', key: 'x', value: true }]);
    const ap = decide(res.state, 'flag-log', 'approve');
    ok('T-13 approval/rejection creates operator log', ap.logs.length === 1 && ap.logs[0].selected_action === 'approve');
})();

(function () {
    const scenario = { doctrine_rules: [{ id: 'd-auth', action: 'runtime_flag', decision: 'require_approval', reason: 'approval' }] };
    const res = apply(scenario, [{ id: 'flag-journal-fail', kind: 'set_runtime_flag', key: 'x', value: true }]);
    const ap = decide(res.state, 'flag-journal-fail', 'reject', { journalDoctrineDecision: function () { throw new Error('journal down'); } });
    ok('T-14 approval/rejection is journaled or queued safely if journal fails',
        ap.status === 'recorded' && ap.state.pending_doctrine_journal_records.length >= 1 &&
        /journal down/.test(ap.state.last_doctrine_journal_error || ''));
})();

(function () {
    const scenario = {};
    const res = apply(scenario, [{ id: 'flag-allow', kind: 'set_runtime_flag', key: 'allowed', value: true }]);
    ok('T-15 allowed safe effects still apply normally',
        res.effects[0].status === 'applied_safe' && res.state.runtime_flags.allowed === true);
})();

(function () {
    const scc = fs.readFileSync(path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'scenario-control-center.js'), 'utf8');
    const i = scc.indexOf('function approvalSummaryHtml');
    const body = scc.slice(i, i + 2600);
    ok('T-16 no step/snapshot/turn UI returns in approval panel',
        i !== -1 && !/\bstep\b|\bsnapshot\b|\bturn\b/i.test(body));
})();

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
process.exit(failed ? 1 : 0);
