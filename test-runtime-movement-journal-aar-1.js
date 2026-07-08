'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const Movement = require(path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'runtime-movement.js'));
const movementSrc = fs.readFileSync(path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'runtime-movement.js'), 'utf8');

let passed = 0;
let failed = 0;
function ok(label, cond, detail) {
    if (cond) { passed += 1; console.log('  PASS  ' + label); }
    else { failed += 1; console.error('  FAIL  ' + label + (detail ? ' -- ' + detail : '')); }
}
function clone(v) { return JSON.parse(JSON.stringify(v)); }
function arr(v) { return Array.isArray(v) ? v : []; }
function movementJournalRecords(st, kind) {
    return arr(st && st.movement_journal_events).filter(function (r) {
        return r && r.schema_version === 'runtime-movement-arrival-v1' && (!kind || r.kind === kind);
    });
}
function unitPlan(id, payload) {
    return {
        execution_id: id,
        movement_id: id,
        effect_kind: 'runtime_movement',
        classification: 'requires_world_state_executor',
        status: 'requires_executor',
        payload: Object.assign({
            unit_id: 'U1',
            from: [0, 0],
            to: [0.01, 0],
            route: [[0, 0], [0.01, 0]],
            speed_kph: 111.195
        }, payload || {})
    };
}
function groupPlan(id, overrides) {
    return Object.assign({
        kind: 'runtime_group_movement',
        movement_id: id,
        group_id: 'G1',
        unit_ids: ['U1', 'U2', 'U3'],
        leader_unit_id: 'U1',
        route: [[0, 0], [0.01, 0]],
        formation: 'column',
        spacing_meters: 250,
        speed_kph: 111.195,
        domain: 'ground'
    }, overrides || {});
}

console.log('\n=== MOV5 runtime movement journal and AAR ===\n');

(function () {
    const writes = [];
    const started = Movement.startMovementExecutionPlans(null, [unitPlan('journal-unit-arrival-1')], { elapsed_hours: 0 });
    const done = Movement.updateRuntimeMovementState(started.state, 1, {
        scenario_time_label: 'H+1',
        journalMovementRecord: function (record) { writes.push(record); }
    });
    ok('T-1 unit arrival creates one journal record',
        writes.filter(function (r) { return r.kind === 'movement_unit_arrived'; }).length === 1 &&
        movementJournalRecords(done.state, 'movement_unit_arrived').length === 1);
})();

(function () {
    const writes = [];
    const started = Movement.startMovementExecutionPlans(null, [groupPlan('journal-group-arrival-1')], { elapsed_hours: 0 });
    const done = Movement.updateRuntimeMovementState(started.state, 1, {
        scenario_time_label: 'H+1',
        journalMovementRecord: function (record) { writes.push(record); }
    });
    ok('T-2 group arrival creates one journal record',
        writes.filter(function (r) { return r.kind === 'movement_group_arrived'; }).length === 1 &&
        movementJournalRecords(done.state, 'movement_group_arrived').length === 1);
})();

(function () {
    const started = Movement.startMovementExecutionPlans(null, [unitPlan('journal-failure-runtime-1')], { elapsed_hours: 0 });
    const done = Movement.updateRuntimeMovementState(started.state, 1, {
        journalMovementRecord: function () { throw new Error('journal offline'); }
    });
    ok('T-3 journal failure does not stop runtime',
        done.state.movements['journal-failure-runtime-1'].status === 'arrived' &&
        done.arrivals.length === 1);
})();

(function () {
    const started = Movement.startMovementExecutionPlans(null, [unitPlan('journal-failure-queue-1')], { elapsed_hours: 0 });
    const done = Movement.updateRuntimeMovementState(started.state, 1, {
        journalMovementRecord: function () { throw new Error('journal queue test'); }
    });
    ok('T-4 failed records queued',
        arr(done.state.pending_journal_records).length === 1 &&
        /journal queue test/.test(String(done.state.last_journal_error || '')));
})();

(function () {
    const writes = [];
    const started = Movement.startMovementExecutionPlans(null, [unitPlan('journal-dedupe-1')], { elapsed_hours: 0 });
    const first = Movement.updateRuntimeMovementState(started.state, 1, {
        journalMovementRecord: function (record) { writes.push(record); }
    });
    const second = Movement.updateRuntimeMovementState(first.state, 2, {
        journalMovementRecord: function (record) { writes.push(record); }
    });
    ok('T-5 duplicate arrival no duplicate journal',
        writes.filter(function (r) { return r.kind === 'movement_unit_arrived'; }).length === 1 &&
        movementJournalRecords(second.state, 'movement_unit_arrived').length === 1);
})();

(function () {
    const rows = [
        { schema_version: 'runtime-movement-arrival-v1', source: 'runtime_movement', kind: 'movement_unit_arrived', movement_id: 'm1', unit_id: 'U1', arrived_at_elapsed_hours: 2, final_position: [1, 1], status: 'arrived' },
        { schema_version: 'doctrine-journal-v1', kind: 'doctrine_effect_allowed' },
        { source: 'runtime_movement', kind: 'movement_group_arrived', group_movement_id: 'g1', group_id: 'G1', arrived_at_elapsed_hours: 1, final_position: [0, 0], status: 'arrived' },
        null
    ];
    const records = typeof Movement.extractMovementJournalRecords === 'function' ? Movement.extractMovementJournalRecords(rows) : [];
    const replay = typeof Movement.buildMovementReplay === 'function' ? Movement.buildMovementReplay(records) : { arrivals: [] };
    ok('T-6 replay extracts only movement records',
        records.length === 2 &&
        replay.arrivals.length === 2 &&
        replay.arrivals[0].kind === 'movement_group_arrived');
})();

(function () {
    const records = [
        { source: 'runtime_movement', kind: 'movement_unit_arrived', movement_id: 'm1', unit_id: 'U1', arrived_at_elapsed_hours: 2, final_position: [1, 1], status: 'arrived' },
        { source: 'runtime_movement', kind: 'movement_group_arrived', group_movement_id: 'g1', group_id: 'G1', arrived_at_elapsed_hours: 1, final_position: [0, 0], status: 'arrived' }
    ];
    const summary = typeof Movement.buildMovementAarSummary === 'function' ? Movement.buildMovementAarSummary(records) : {};
    ok('T-7 AAR counts units/groups/arrivals',
        summary.total_arrivals === 2 &&
        summary.unit_arrivals === 1 &&
        summary.group_arrivals === 1 &&
        summary.unit_count === 1 &&
        summary.group_count === 1);
})();

(function () {
    let replay = null, summary = null, threw = false;
    try {
        replay = Movement.buildMovementReplay ? Movement.buildMovementReplay([null, {}, { kind: 'movement_unit_arrived' }]) : null;
        summary = Movement.buildMovementAarSummary ? Movement.buildMovementAarSummary([null, {}, { kind: 'movement_unit_arrived' }]) : null;
    } catch (err) {
        threw = true;
    }
    ok('T-8 malformed rows do not crash',
        !threw &&
        replay && Array.isArray(replay.warnings) &&
        summary && Array.isArray(summary.warnings));
})();

(function () {
    ok('T-9 replay/AAR no steps[]', !/\bsteps\s*\[/.test(movementSrc));
})();

(function () {
    const scenario = { units: [{ id: 'U1', position: [0, 0] }] };
    global.window = { units: [{ uid: 'U1', coord: [99, 99] }], map: { stable: true } };
    const beforeScenario = clone(scenario);
    const beforeUnits = clone(global.window.units);
    const beforeMap = clone(global.window.map);
    const started = Movement.startMovementExecutionPlans(null, [unitPlan('journal-immut-1')], { elapsed_hours: 0, units: scenario.units });
    Movement.updateRuntimeMovementState(started.state, 1, {});
    ok('T-10 no scenario/window/map mutation',
        JSON.stringify(scenario) === JSON.stringify(beforeScenario) &&
        JSON.stringify(global.window.units) === JSON.stringify(beforeUnits) &&
        JSON.stringify(global.window.map) === JSON.stringify(beforeMap));
    delete global.window;
})();

if (failed) {
    console.error('\nMOV5 movement journal/AAR failed: ' + failed + ' failure(s).');
    process.exit(1);
}
console.log('\nMOV5 movement journal/AAR passed: ' + passed + ' assertions.');
