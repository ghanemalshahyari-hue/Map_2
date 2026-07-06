/* ============================================================================
 * test-runtime-events-journal-1.js
 * C4f Runtime Events Durable Journal Contract
 * ----------------------------------------------------------------------------
 * Runtime events and operator decisions write audit/replay records through the
 * existing /api/sim/propose -> /api/sim/commit journal path. Journal failure
 * must never stop runtime execution.
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
function bodyOf(call) {
    try { return JSON.parse(call.opts && call.opts.body || '{}'); } catch (_) { return {}; }
}
function journalRecords(calls) {
    return calls
        .filter((c) => c.url === '/api/sim/commit')
        .map(bodyOf)
        .map((b) => b.mods && b.mods.runtime_journal)
        .filter(Boolean);
}
function drain() {
    return new Promise((resolve) => setTimeout(resolve, 20));
}
function block(text, start, end) {
    const i = text.indexOf(start);
    const j = text.indexOf(end, i + start.length);
    return i >= 0 ? text.slice(i, j >= 0 ? j : undefined) : '';
}

function scenario() {
    return {
        id: 'SCN-C4F',
        name: 'runtime-events-journal-c4f',
        start_time: '2026-07-06T00:00:00Z',
        runtime_scenario: {
            start_time: '2026-07-06T00:00:00Z',
            start_hours: 0,
            end_hours: 2,
            duration_hours: 2,
            clock_model: 'continuous'
        },
        runtime_events: [{
            id: 'evt-journal',
            at_elapsed_hours: 0.5,
            title: 'Journaled runtime event',
            once: true,
            effects: [
                { id: 'fx-note', kind: 'add_notification', message: 'Journal this notification.' },
                { id: 'fx-flag', kind: 'set_runtime_flag', key: 'journal_flag', value: true },
                { id: 'fx-move', kind: 'move_unit', unit_id: 'BLUE-1', lat: 1, lon: 2 }
            ]
        }],
        decision_points: [{
            id: 'dp-journal',
            trigger_elapsed_hours: 0.5,
            title: 'Journal operator choice?',
            prompt: 'Record the runtime choice.',
            options: [{
                id: 'approve',
                label: 'Approve audit path',
                effects: [
                    { id: 'fx-decision-flag', kind: 'set_runtime_flag', key: 'decision_journaled', value: true },
                    { id: 'fx-close', kind: 'close_decision_point', decision_point_id: 'dp-journal' },
                    { id: 'fx-destroy', kind: 'destroy_unit', unit_id: 'RED-1' }
                ]
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
        selected_coa_id: 'C4F-TEST',
        selected_coa: { plan_id: 'C4F-TEST', phases: [{ name: 'observe', actions: [] }] },
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
            applied_effects: [],
            blocked_effects: [],
            last_effects: [],
            journaled_ids: {},
            pending_journal_records: [],
            last_journal_error: null
        },
        last_tick_timing: {}
    };
}

(async function main() {
    const logs = [];
    const mapCalls = { setRunClock: 0, applyState: 0, applyWorldStateUnitDeltas: 0 };
    let fetchCalls = [];
    let failFetch = false;
    let proposalSeq = 0;
    let journalSeq = 0;

    global.AppRuntimeEvents = RuntimeEvents;
    global.AppShellEventLog = { append(entry) { logs.push(entry); return entry; } };
    global.AppConfig = { CHAT_CONFIG: { currentUser: { id: 'operator-c4f' } } };
    global.AppAdjudicatorMap = {
        setRunClock() { mapCalls.setRunClock += 1; },
        runClockLabel() { return 'H+0.5'; },
        applyState() { mapCalls.applyState += 1; },
        applyWorldStateUnitDeltas() { mapCalls.applyWorldStateUnitDeltas += 1; },
        getWorldState() { return { units: [] }; }
    };
    global.AppWorldState = { findStepForElapsedHours() { return { index: 0, elapsed_hours: 0, time_label: 'H' }; } };
    global.fetch = function fetchStub(url, opts) {
        fetchCalls.push({ url, opts: opts || {} });
        if (failFetch) return Promise.reject(new Error('journal backend unavailable'));
        if (url === '/api/sim/propose') {
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ proposal_id: 'runtime-prop-' + (++proposalSeq) }) });
        }
        if (url === '/api/sim/commit') {
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, journal_seq: ++journalSeq }) });
        }
        return Promise.resolve({ ok: false, json: () => Promise.resolve({ ok: false, error: 'unexpected url' }) });
    };

    const unitsBefore = [{ uid: 'BLUE-1', lat: 24, lon: 46 }, { uid: 'RED-1', lat: 25, lon: 47 }];
    global.units = clone(unitsBefore);
    global.RmoozScenario = { scenario: scenario() };

    const FF = require(path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'free-fight-demo.js'));
    const ffSource = read('UI_MOdified/client/shell/free-fight-demo.js');
    const sc = global.RmoozScenario.scenario;
    const scenarioBefore = JSON.stringify(sc);

    console.log('\n=== C4f runtime events durable journal contract ===\n');

    FF._setCoaExecForTest(execState(0.5));
    const fire = FF._fireRuntimeEventsFromClockForTest();
    await drain();

    let records = journalRecords(fetchCalls);
    ok('T-1 runtime event fired creates one journal record',
        fire.due_count === 1 &&
        records.filter((r) => r.kind === 'runtime_event_fired' && r.event_id === 'evt-journal').length === 1);

    FF._fireRuntimeEventsFromClockForTest();
    await drain();
    records = journalRecords(fetchCalls);
    ok('T-2 once event does not create duplicate journal records',
        records.filter((r) => r.kind === 'runtime_event_fired' && r.event_id === 'evt-journal').length === 1);

    ok('T-3 safe applied effect creates journal record',
        records.some((r) =>
            r.kind === 'runtime_effect_applied_safe' &&
            r.event_id === 'evt-journal' &&
            r.safe_effects_applied.some((fx) => fx.kind === 'set_runtime_flag' && fx.payload.key === 'journal_flag')));
    ok('T-4 blocked dangerous effect creates journal record with reason',
        records.some((r) =>
            r.kind === 'runtime_effect_blocked' &&
            r.event_id === 'evt-journal' &&
            r.blocked_effects.some((fx) => fx.kind === 'move_unit' && fx.reason === 'direct_unit_mutation_blocked')));
    ok('T-5 opened decision point creates journal record',
        records.some((r) => r.kind === 'runtime_decision_opened' && r.decision_point_id === 'dp-journal'));

    FF._resolveRuntimeDecisionPointForTest('dp-journal', 'approve');
    await drain();
    records = journalRecords(fetchCalls);
    ok('T-6 operator selected decision creates journal record',
        records.some((r) =>
            r.kind === 'operator_decision_selected' &&
            r.decision_point_id === 'dp-journal' &&
            r.decision &&
            r.decision.option_id === 'approve'));
    ok('T-7 resolved decision point creates journal record',
        records.some((r) => r.kind === 'runtime_decision_resolved' && r.decision_point_id === 'dp-journal'));

    const commitBodies = fetchCalls.filter((c) => c.url === '/api/sim/commit').map(bodyOf);
    const proposeBodies = fetchCalls.filter((c) => c.url === '/api/sim/propose').map(bodyOf);
    ok('T-8 /api/sim/commit payload marks runtime-events clearly',
        commitBodies.some((b) =>
            b.accepted_action_ids === 'ALL' &&
            b.operator_id === 'operator-c4f' &&
            b.source === 'runtime-events' &&
            b.mods &&
            b.mods.kind === 'RUNTIME_EVENT_JOURNAL' &&
            b.mods.source === 'runtime-events' &&
            b.mods.runtime_journal &&
            b.mods.runtime_journal.schema_version === 'runtime-events-journal-v1'));
    ok('T-9 /api/sim/propose payload uses mock proposal journal pattern',
        proposeBodies.some((b) =>
            b.scenarioName === 'runtime-events-journal-c4f' &&
            b.mockMode === true &&
            /^runtime-events-runtime-events-journal-c4f-C4F-TEST$/.test(b.runId || '')));

    fetchCalls = [];
    failFetch = true;
    FF._setCoaExecForTest(execState(0.5));
    const failedFire = FF._fireRuntimeEventsFromClockForTest();
    await drain();
    const failedExec = FF._getCoaExecForTest();
    ok('T-10 journal failure does not stop runtime',
        failedFire.due_count === 1 &&
        failedExec.runtime_events.fired_ids['evt-journal'] === true);
    ok('T-11 pending journal state is recorded on failure',
        failedExec.runtime_events.pending_journal_records.length > 0 &&
        /journal backend unavailable|runtime journal/.test(failedExec.runtime_events.last_journal_error || ''));

    ok('T-12 scenario object is not mutated',
        JSON.stringify(sc) === scenarioBefore);
    ok('T-13 window.units/map are not touched',
        JSON.stringify(global.units) === JSON.stringify(unitsBefore) &&
        mapCalls.applyState === 0 &&
        mapCalls.applyWorldStateUnitDeltas === 0);

    const helperBlock = block(ffSource, 'function _journalRuntimeRecord', 'function _copyRuntimeEventSummary');
    ok('T-14 runtime journal uses existing commit path and stays fire-and-forget',
        helperBlock.includes('/api/sim/propose') &&
        helperBlock.includes('/api/sim/commit') &&
        !helperBlock.includes('/api/sim/decide') &&
        helperBlock.includes('.catch('));

    console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
    process.exit(failed ? 1 : 0);
})().catch((err) => {
    console.error(err && err.stack || err);
    process.exit(1);
});
