'use strict';

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
        doctrine_journaled_ids: {},
        pending_doctrine_journal_records: [],
        last_doctrine_journal_error: null
    };
}
function event(effects) {
    return { id: 'evt-doc3', at_elapsed_hours: 2, effects };
}
function apply(scenario, effects, state, writer) {
    const records = [];
    const options = {
        scenario,
        doctrine: Doctrine,
        scenarioName: 'DOC3 Test',
        scenarioId: 'doc3-scenario',
        runId: 'doc3-run',
        operatorId: 'tester',
        journalDoctrineDecision: writer || function (record) { records.push(clone(record)); return { ok: true }; }
    };
    const res = RuntimeEvents.applySafeRuntimeEventEffects(state || baseState(), event(effects), effects, options);
    res.records = records;
    return res;
}

console.log('\n=== DOC3 doctrine runtime journal ===\n');

(function () {
    const scenario = { doctrine_rules: [{ id: 'd-allow', action: 'notification', decision: 'allow', reason: 'notification ok' }] };
    const res = apply(scenario, [{ id: 'note-allow', kind: 'add_notification', message: 'hello' }]);
    ok('T-1 allowed doctrine decision creates one journal record',
        res.records.length === 1 &&
        res.records[0].kind === 'doctrine_effect_allowed' &&
        res.records[0].effect_status === 'applied_safe');
})();

(function () {
    const scenario = { doctrine_rules: [{ id: 'd-block', action: 'notification', decision: 'block', reason: 'blocked by doctrine' }] };
    const res = apply(scenario, [{ id: 'note-block', kind: 'add_notification', message: 'hello' }]);
    ok('T-2 blocked doctrine decision creates one journal record',
        res.records.length === 1 &&
        res.records[0].kind === 'doctrine_effect_blocked' &&
        res.records[0].doctrine_decision === 'block');
})();

(function () {
    const scenario = { doctrine_rules: [{ id: 'd-approval', action: 'runtime_flag', decision: 'require_approval', requires_authority: 'J3', reason: 'approval needed' }] };
    const res = apply(scenario, [{ id: 'flag-approval', kind: 'set_runtime_flag', key: 'x', value: true }]);
    ok('T-3 require_approval doctrine decision creates one journal record',
        res.records.length === 1 &&
        res.records[0].kind === 'doctrine_effect_requires_approval' &&
        res.records[0].required_authority === 'J3');
})();

(function () {
    const res = apply({}, [{ id: 'wra-approval', kind: 'weapon_release', weapon_class: 'SAM', confidence: 1 }]);
    ok('T-4 WRA approval-required creates journal record with source_layer wra',
        res.records.length === 1 &&
        res.records[0].kind === 'wra_requires_approval' &&
        res.records[0].source_layer === 'wra');
})();

(function () {
    const scenario = { roe_rules: [{ id: 'roe-block', restricted_area_ids: ['RA-1'], decision: 'block', reason: 'ROE restricted area' }] };
    const res = apply(scenario, [{ id: 'roe-shot', kind: 'weapon_release', weapon_class: 'SAM', confidence: 1, area_id: 'RA-1' }]);
    ok('T-5 ROE block creates journal record with source_layer roe',
        res.records.length === 1 &&
        res.records[0].kind === 'roe_blocked' &&
        res.records[0].source_layer === 'roe');
})();

(function () {
    const scenario = { doctrine_rules: [{ id: 'd-allow', action: 'notification', decision: 'allow', reason: 'ok once' }] };
    const st = baseState();
    const first = apply(scenario, [{ id: 'note-once', kind: 'add_notification', message: 'hello' }], st);
    const second = apply(scenario, [{ id: 'note-once', kind: 'add_notification', message: 'hello' }], first.state);
    ok('T-6 duplicate doctrine decision does not duplicate journal',
        first.records.length === 1 && second.records.length === 0 &&
        Object.keys(second.state.doctrine_journaled_ids).length === 1);
})();

(function () {
    const scenario = { doctrine_rules: [{ id: 'd-block', action: 'notification', decision: 'block', reason: 'blocked' }] };
    const res = apply(scenario, [{ id: 'note-fail', kind: 'add_notification', message: 'hello' }], null, function () {
        throw new Error('journal offline');
    });
    ok('T-7 journal failure does not stop runtime',
        res.effects[0].status === 'blocked' && res.state.last_effects.length === 1);
    ok('T-8 failed record is stored in pending_doctrine_journal_records',
        res.state.pending_doctrine_journal_records.length === 1 &&
        /journal offline/.test(res.state.last_doctrine_journal_error || ''));
})();

(function () {
    const scenario = { doctrine_rules: [{ id: 'd-auth', action: 'notification', decision: 'require_approval', requires_authority: 'CJTF', reason: 'authority required' }] };
    const res = apply(scenario, [{ id: 'note-auth', kind: 'add_notification', message: 'hello' }]);
    const rec = res.records[0];
    ok('T-9 journal payload includes matched_rules/reasons/required_authority',
        Array.isArray(rec.matched_rules) && rec.matched_rules[0] && rec.matched_rules[0].id === 'd-auth' &&
        Array.isArray(rec.reasons) && /authority required/.test(rec.reasons.join(' ')) &&
        rec.required_authority === 'CJTF');
})();

(function () {
    const scenario = { doctrine_rules: [{ id: 'd-block', action: 'runtime_flag', decision: 'block', reason: 'no flag' }] };
    const scenarioBefore = JSON.stringify(scenario);
    const unitsBefore = [{ uid: 'U1' }];
    global.window = global.window || {};
    global.window.units = clone(unitsBefore);
    const mapCalls = { applyState: 0 };
    global.window.AppAdjudicatorMap = { applyState() { mapCalls.applyState++; } };
    apply(scenario, [{ id: 'flag-block', kind: 'set_runtime_flag', key: 'x', value: true }]);
    ok('T-10 no scenario mutation', JSON.stringify(scenario) === scenarioBefore);
    ok('T-11 no window.units/map mutation',
        JSON.stringify(global.window.units) === JSON.stringify(unitsBefore) && mapCalls.applyState === 0);
})();

(function () {
    const scenario = { doctrine_rules: [{ id: 'd-allow', action: 'mission_task_update', decision: 'allow', reason: 'task update ok' }] };
    const res = apply(scenario, [{ id: 'task-ok', kind: 'update_mission_task_status', mission_task_id: 'task-1', status: 'complete' }]);
    const rec = res.records[0];
    ok('T-12 journal payload has doctrine-journal-v1 shape',
        rec.schema_version === 'doctrine-journal-v1' &&
        rec.source === 'doctrine' &&
        rec.scenario_id === 'doc3-scenario' &&
        rec.scenarioName === 'DOC3 Test' &&
        rec.run_id === 'doc3-run' &&
        rec.event_id === 'evt-doc3' &&
        rec.effect_id === 'task-ok' &&
        rec.operator_id === 'tester' &&
        rec.elapsed_hours === 2 &&
        rec.effect_kind === 'update_mission_task_status');
})();

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
process.exit(failed ? 1 : 0);
