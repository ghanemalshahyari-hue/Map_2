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
        blocked_effects: [],
        doctrine_decisions: [],
        pending_doctrine_journal_records: [],
        doctrine_journaled_ids: {},
        pending_effects: [],
        last_effects: []
    };
}
function journalRecord(id, status) {
    return {
        schema_version: 'doctrine-journal-v1',
        source: 'doctrine',
        kind: 'approval_approved',
        scenario_id: 'doc5',
        scenarioName: 'DOC5 Test',
        run_id: 'doc5-run',
        event_id: 'evt-doc5',
        effect_id: id,
        decision_point_id: 'dp-doc5',
        operator_id: 'tester',
        elapsed_hours: 4,
        scenario_time_label: 'H+4',
        doctrine_decision: 'approval_approve',
        source_layer: 'wra',
        matched_rules: [{ id: 'wra-1' }],
        reasons: ['queued approval'],
        required_authority: 'Fires',
        effect_kind: 'weapon_release',
        effect_status: status || 'approved_pending_execution'
    };
}

console.log('\n=== DOC5 doctrine approval history + journal retry ===\n');

(function () {
    const st = baseState();
    st.approval_decisions.ap1 = { approval_id: 'ap1', effect_id: 'e1', event_id: 'evt', selected_action: 'approve', effect_kind: 'weapon_release', resulting_status: 'approved_pending_execution', required_authority: 'Fires', reason: 'ok', scenario_time_label: 'H+1' };
    st.approved_effects.push({ effect_id: 'e1', kind: 'weapon_release', status: 'approved_pending_execution' });
    const history = RuntimeEvents.buildDoctrineApprovalHistory(st);
    ok('T-1 approval history includes approved decisions',
        history.some((h) => h.kind === 'approved' && h.effect_id === 'e1' && h.decision === 'approve'));
})();

(function () {
    const st = baseState();
    st.approval_decisions.ap2 = { approval_id: 'ap2', effect_id: 'e2', event_id: 'evt', selected_action: 'reject', effect_kind: 'runtime_flag', resulting_status: 'rejected', reason: 'no' };
    st.rejected_effects.push({ effect_id: 'e2', kind: 'runtime_flag', status: 'rejected' });
    const history = RuntimeEvents.buildDoctrineApprovalHistory(st);
    ok('T-2 approval history includes rejected decisions',
        history.some((h) => h.kind === 'rejected' && h.effect_id === 'e2' && h.decision === 'reject'));
})();

(function () {
    const st = baseState();
    st.blocked_effects.push({ effect_id: 'e3', event_id: 'evt', kind: 'weapon_release', status: 'blocked', reason: 'ROE block', doctrine_decision: { doctrine_decision: 'block', source: 'roe', matched_rules: [{ id: 'roe-1' }], reasons: ['ROE block'] } });
    const history = RuntimeEvents.buildDoctrineApprovalHistory(st);
    ok('T-3 approval history includes blocked doctrine effects',
        history.some((h) => h.kind === 'blocked' && h.effect_id === 'e3' && /ROE block/.test(h.reason || '')));
})();

(function () {
    const st = baseState();
    st.pending_approvals.p1 = { effect_id: 'p1', status: 'requires_approval' };
    st.approved_effects.push({ effect_id: 'a1' });
    st.rejected_effects.push({ effect_id: 'r1' });
    st.blocked_effects.push({ effect_id: 'b1' });
    const summary = RuntimeEvents.summarizeDoctrineApprovals(st);
    ok('T-4 summary counts pending/approved/rejected/blocked',
        summary.pending === 1 && summary.approved === 1 && summary.rejected === 1 && summary.blocked === 1);
})();

(function () {
    const st = baseState();
    st.pending_doctrine_journal_records.push(journalRecord('q1'));
    const summary = RuntimeEvents.summarizeDoctrineApprovals(st);
    ok('T-5 pending doctrine journal records are counted', summary.journal_retry_queue === 1);
})();

(function () {
    const st = baseState();
    st.pending_doctrine_journal_records.push(journalRecord('q2'));
    const sent = [];
    const res = RuntimeEvents.retryPendingDoctrineJournalRecords(st, { journalDoctrineDecision: (record) => { sent.push(clone(record)); return { ok: true }; } });
    ok('T-6 retry sends queued records through existing doctrine journal path',
        sent.length === 1 && sent[0].effect_id === 'q2' && res.attempted === 1);
    ok('T-7 successful retry removes/suppresses queued record',
        res.state.pending_doctrine_journal_records.length === 0 && Object.keys(res.state.doctrine_journaled_ids).length === 1);
})();

(function () {
    const st = baseState();
    st.pending_doctrine_journal_records.push(journalRecord('q3'));
    const res = RuntimeEvents.retryPendingDoctrineJournalRecords(st, { journalDoctrineDecision: () => { throw new Error('still down'); } });
    ok('T-8 failed retry keeps record queued',
        res.failed === 1 && res.state.pending_doctrine_journal_records.length === 1 && /still down/.test(res.state.last_doctrine_journal_error || ''));
})();

(function () {
    const st = baseState();
    const rec = journalRecord('q4');
    const id = [
        rec.schema_version, rec.run_id, rec.event_id, rec.effect_id,
        rec.doctrine_decision, rec.source_layer, rec.effect_status
    ].join('|');
    st.pending_doctrine_journal_records.push(rec);
    st.doctrine_journaled_ids[id] = true;
    let sent = 0;
    const res = RuntimeEvents.retryPendingDoctrineJournalRecords(st, { journalDoctrineDecision: () => { sent++; return { ok: true }; } });
    ok('T-9 retry does not duplicate already journaled IDs',
        sent === 0 && res.attempted === 0 && res.state.pending_doctrine_journal_records.length === 0);
})();

(function () {
    const st = baseState();
    st.pending_doctrine_journal_records.push(journalRecord('q5'));
    const res = RuntimeEvents.retryPendingDoctrineJournalRecords(st, { journalDoctrineDecision: () => { throw new Error('fast fail'); } });
    ok('T-10 retry does not block runtime',
        res.read_only === true && res.state && res.state.pending_effects.length === 0);
})();

(function () {
    const st = baseState();
    st.approval_decisions.ap = { approval_id: 'ap', effect_id: 'e', selected_action: 'approve' };
    const before = JSON.stringify(st);
    RuntimeEvents.buildDoctrineApprovalHistory(st);
    RuntimeEvents.summarizeDoctrineApprovals(st);
    ok('T-11 approval history is read-only and does not mutate state', JSON.stringify(st) === before);
})();

(function () {
    const st = baseState();
    st.pending_doctrine_journal_records.push(journalRecord('q6'));
    const scenario = { id: 'S' };
    const beforeScenario = JSON.stringify(scenario);
    global.window = global.window || {};
    global.window.units = [{ uid: 'U1', strength: 1 }];
    const beforeUnits = JSON.stringify(global.window.units);
    const mapCalls = { n: 0 };
    global.window.AppAdjudicatorMap = { applyState() { mapCalls.n++; } };
    RuntimeEvents.retryPendingDoctrineJournalRecords(st, { scenario, journalDoctrineDecision: () => ({ ok: true }) });
    ok('T-12 no unit/map/scenario mutation',
        JSON.stringify(scenario) === beforeScenario && JSON.stringify(global.window.units) === beforeUnits && mapCalls.n === 0);
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
                readiness: () => ({ units_loaded: true, objective_set: true, executable: true, taskable: 1, blocked: 0, scenario_name: 'DOC5', data_reliability: 'operational', source_status: 'sourced', doctrine_status: 'applied', commander_review_status: 'not required' }),
                runtimeApprovals: () => [],
                runtimeApprovalSummary: () => ({ pending: 0, approved: 1, rejected: 1, blocked: 1, journal_retry_queue: 1 }),
                runtimeApprovalHistory: () => [{ kind: 'approved', effect_kind: 'weapon_release', decision: 'approve', required_authority: 'Fires', reason: 'approved', scenario_time_label: 'H+4' }],
                runBlockedReason: () => null,
                autoContinueEnabled: () => false,
                whiteOutcome: () => ({}),
                greenStatus: () => ({}),
                isRealLlm: () => false,
                coaQuality: () => ({ pass: true }),
                hardBlockReason: () => null,
                tasksBlockedUnit: () => false,
                scenarioClockLabel: () => 'H+4',
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
    const i = src.indexOf('function approvalSummaryHtml');
    const body = src.slice(i, i + 4200);
    ok('T-13 SCC shows approval history/summary using Doctrine/ROE/WRA language',
        /Doctrine \/ ROE \/ WRA approval audit/.test(html) && /journal retry/.test(html) && /weapon_release/.test(html));
    ok('T-14 no step/snapshot/turn language returns in approval audit panel',
        i !== -1 && !/\bstep\b|\bsnapshot\b|\bturn\b/i.test(body));
})();

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
process.exit(failed ? 1 : 0);
