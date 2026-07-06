/* ============================================================================
 * test-runtime-replay-aar-1.js
 * C4g Runtime Replay / AAR Reconstruction Contract
 * ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const Replay = require(path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'runtime-replay.js'));

let passed = 0;
let failed = 0;
function ok(label, cond) {
    if (cond) { passed += 1; console.log('  PASS  ' + label); }
    else { failed += 1; console.error('  FAIL  ' + label); }
}

function clone(v) { return JSON.parse(JSON.stringify(v)); }
function row(seq, journal) {
    return {
        seq,
        run_id: journal.run_id || 'runtime-events-aar',
        source: 'runtime-events',
        mods: {
            kind: 'RUNTIME_EVENT_JOURNAL',
            source: 'runtime-events',
            runtime_journal: Object.assign({
                schema_version: 'runtime-events-journal-v1',
                source: 'runtime-events',
                scenario_id: 'SCN-AAR',
                scenarioName: 'runtime replay aar',
                run_id: 'runtime-events-aar',
                operator_id: 'operator-aar',
                scenario_time_label: 'Scenario time H+' + journal.elapsed_hours,
                recorded_at: '2026-07-06T00:00:0' + (seq % 10) + 'Z'
            }, journal)
        }
    };
}

console.log('\n=== C4g runtime replay/AAR reconstruction contract ===\n');

const rows = [
    { seq: 1, run_id: 'scc-commit-aar', source: 'deterministic-sim', mods: { kind: 'SCC_COMMIT' } },
    row(30, {
        kind: 'operator_decision_selected',
        decision_point_id: 'dp-reserve',
        elapsed_hours: 1.5,
        decision: { option_id: 'commit', option_label: 'Commit reserve' },
        safe_effects_applied: [{ kind: 'set_runtime_flag', status: 'applied_safe', payload: { key: 'reserve_committed', value: true } }]
    }),
    row(10, {
        kind: 'runtime_event_fired',
        event_id: 'evt-contact',
        elapsed_hours: 0.5,
        detail: { title: 'Radar contact appears' }
    }),
    row(20, {
        kind: 'runtime_decision_opened',
        decision_point_id: 'dp-reserve',
        elapsed_hours: 1.0,
        detail: { title: 'Commit reserve?' }
    }),
    row(40, {
        kind: 'runtime_effect_applied_safe',
        event_id: 'evt-contact',
        elapsed_hours: 1.25,
        safe_effects_applied: [{ kind: 'set_runtime_flag', status: 'applied_safe', payload: { key: 'contact_seen', value: true } }]
    }),
    row(50, {
        kind: 'runtime_effect_blocked',
        event_id: 'evt-danger',
        elapsed_hours: 1.75,
        blocked_effects: [{ kind: 'move_unit', status: 'blocked', reason: 'direct_unit_mutation_blocked', payload: { unit_id: 'BLUE-1' } }]
    }),
    row(60, {
        kind: 'runtime_decision_resolved',
        decision_point_id: 'dp-reserve',
        elapsed_hours: 2.0,
        decision: { option_id: 'commit', option_label: 'Commit reserve' }
    }),
    row(60, {
        kind: 'runtime_decision_resolved',
        decision_point_id: 'dp-reserve',
        elapsed_hours: 2.0,
        decision: { option_id: 'commit', option_label: 'Commit reserve' }
    }),
    {
        seq: 70,
        run_id: 'runtime-events-aar',
        mods: {
            kind: 'RUNTIME_EVENT_JOURNAL',
            source: 'runtime-events',
            runtime_journal: { schema_version: 'runtime-events-journal-v1', source: 'runtime-events', elapsed_hours: 2.5 }
        }
    }
];

const before = JSON.stringify(rows);
const extracted = Replay.extractRuntimeJournalRecords(rows);
const replay = Replay.buildRuntimeReplay(extracted.records);
const summary = Replay.buildRuntimeAarSummary(extracted.records);
const grouped = Replay.groupRuntimeReplayByTime(extracted.records);
const decisionHistory = Replay.filterRuntimeReplay(extracted.records, { categories: ['operator_decision'] });
const safeHistory = Replay.filterRuntimeReplay(extracted.records, { kinds: ['runtime_effect_applied_safe'] });
const blockedHistory = Replay.filterRuntimeReplay(extracted.records, { kinds: ['runtime_effect_blocked'] });
const moduleSource = read('UI_MOdified/client/shell/runtime-replay.js');

ok('T-1 extracts only rows with mods.runtime_journal',
    extracted.records.length === 6 && extracted.ignored_count === 1);
ok('T-2 ignores non-runtime journal rows',
    !extracted.records.some((r) => r.run_id === 'scc-commit-aar'));
ok('T-3 sorts by elapsed_hours',
    replay.timeline.map((item) => item.elapsed_hours).join(',') === '0.5,1,1.25,1.5,1.75,2');
ok('T-4 builds event-fired timeline',
    replay.timeline.some((item) => item.kind === 'runtime_event_fired' && item.label === 'Runtime event: Radar contact appears'));
ok('T-5 builds operator decision history',
    decisionHistory.some((r) => r.kind === 'operator_decision_selected' && r.decision.option_id === 'commit') &&
    decisionHistory.some((r) => r.kind === 'runtime_decision_opened') &&
    decisionHistory.some((r) => r.kind === 'runtime_decision_resolved'));
ok('T-6 builds safe effects history',
    safeHistory.length === 1 &&
    safeHistory[0].safe_effects_applied[0].payload.key === 'contact_seen');
ok('T-7 builds blocked effects history',
    blockedHistory.length === 1 &&
    blockedHistory[0].blocked_effects[0].reason === 'direct_unit_mutation_blocked');
ok('T-8 de-duplicates duplicated records',
    extracted.duplicate_count === 1 &&
    extracted.records.filter((r) => r.kind === 'runtime_decision_resolved').length === 1);
ok('T-9 malformed rows do not crash and are reported as warnings',
    extracted.warnings.some((w) => w.reason === 'malformed_runtime_journal_record'));
ok('T-10 summary counts are correct',
    summary.events_fired_count === 1 &&
    summary.decisions_opened_count === 1 &&
    summary.decisions_selected_count === 1 &&
    summary.safe_effects_applied_count === 1 &&
    summary.blocked_effects_count === 1 &&
    summary.first_event_time === 0.5 &&
    summary.last_event_time === 2);
ok('T-11 no authored frame arrays are required',
    !/\.steps\b|phase_table/.test(moduleSource) &&
    grouped.length === 6);
ok('T-12 output labels use runtime language only',
    replay.timeline_label === 'Runtime replay/AAR' &&
    replay.timeline.every((item) => !/\b(Step|Turn|Phase|P0|P1|P2|P3)\b/.test(item.label + ' ' + item.scenario_time_label)));
ok('T-13 pure module does not mutate input records',
    JSON.stringify(rows) === before);
ok('T-14 facade exposes the C4g pure API',
    typeof Replay.normalizeRuntimeJournalRecord === 'function' &&
    typeof Replay.extractRuntimeJournalRecords === 'function' &&
    typeof Replay.buildRuntimeReplay === 'function' &&
    typeof Replay.buildRuntimeAarSummary === 'function' &&
    typeof Replay.groupRuntimeReplayByTime === 'function' &&
    typeof Replay.filterRuntimeReplay === 'function');

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
process.exit(failed ? 1 : 0);
