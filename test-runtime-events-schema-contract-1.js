/* ============================================================================
 * test-runtime-events-schema-contract-1.js
 * C4a Runtime Events Schema Contract Gate
 * ----------------------------------------------------------------------------
 * Additive schema support for runtime_events, mission_tasks, decision_points,
 * and victory_conditions. Legacy steps[] stay valid as snapshots/review.
 * ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const spec = require(path.join(ROOT, 'UI_MOdified', 'server', 'ai', 'scenario-schema-spec.js'));
const validator = require(path.join(ROOT, 'UI_MOdified', 'server', 'ai', 'scenario-validator.js'));
const specSource = fs.readFileSync(path.join(ROOT, 'UI_MOdified', 'server', 'ai', 'scenario-schema-spec.js'), 'utf8');
const appHtml = fs.readFileSync(path.join(ROOT, 'UI_MOdified', 'client', 'app.html'), 'utf8');

let passed = 0;
let failed = 0;
function ok(label, cond) {
    if (cond) { passed += 1; console.log('  PASS  ' + label); }
    else { failed += 1; console.error('  FAIL  ' + label); }
}

function baseScenario() {
    return {
        name: 'runtime-events-schema-contract',
        scenario_label: 'Runtime Events Schema Contract',
        model_version: 'test',
        map_bbox: [45, 23, 49, 27],
        obj: { name: 'OBJ-A', coord: [47, 25], target_depth_km: 40, carver: 20 },
        pipeline: [[46, 24], [47, 25]],
        red_units: [{ uid: 'R1', label: 'Red 1', bls: 'BLS-1', appear: 0, role: 'armor', coord: [46, 24] }],
        blue_units_base_ids: ['B1'],
        blue_units_initial: [{ unit_uid: 'B1', base_id: 'B1', coord: [47, 25] }],
        bls_template: [{ name: 'BLS-1', coord: [46, 24] }],
        phase_table: [
            { index: 0, time_label: 'H', elapsed_hours: 0, phase: 'START' },
            { index: 1, time_label: 'H+1', elapsed_hours: 1, phase: 'PHASE 1' },
            { index: 2, time_label: 'H+2', elapsed_hours: 2, phase: 'PHASE 2' },
            { index: 3, time_label: 'H+3', elapsed_hours: 3, phase: 'END' }
        ],
        steps: [
            { index: 0, time_label: 'H', elapsed_hours: 0, phase: 'START' },
            { index: 1, time_label: 'H+1', elapsed_hours: 1, phase: 'PHASE 1' },
            { index: 2, time_label: 'H+2', elapsed_hours: 2, phase: 'PHASE 2' },
            { index: 3, time_label: 'H+3', elapsed_hours: 3, phase: 'END' }
        ]
    };
}

console.log('\n=== C4a runtime events schema contract gate ===\n');

console.log('--- C4A-SCHEMA-1: additive schema descriptors ---');
['runtime_events', 'mission_tasks', 'decision_points', 'victory_conditions'].forEach((key) => {
    ok('T-top-level  ' + key + ' is optional array',
        spec.TOP_LEVEL[key] && spec.TOP_LEVEL[key].required === false && spec.TOP_LEVEL[key].type === 'array');
});
ok('T-1 runtime_scenario description includes C4 arrays',
    /runtime_scenario[\s\S]*runtime_events\?[\s\S]*mission_tasks\?[\s\S]*decision_points\?[\s\S]*victory_conditions\?/.test(specSource));
ok('T-2 item sub-shapes document the C4a contract',
    spec.SHAPES.runtime_events_item &&
    spec.SHAPES.mission_tasks_item &&
    spec.SHAPES.decision_points_item &&
    spec.SHAPES.victory_conditions_item);
ok('T-3 runtime event shape documents time fields and effects without executing them',
    spec.SHAPES.runtime_events_item.optional.includes('at_elapsed_hours') &&
    spec.SHAPES.runtime_events_item.optional.includes('at_time') &&
    spec.SHAPES.runtime_events_item.optional.includes('effects'));

console.log('\n--- C4A-SCHEMA-2: backward-compatible validation ---');
(function () {
    const legacy = baseScenario();
    const result = validator.validateScenario(legacy);
    ok('T-1 existing scenarios without C4 arrays remain valid', result.ok === true && result.errors.length === 0);

    const additive = baseScenario();
    additive.start_time = '2026-07-06T00:00:00Z';
    additive.runtime_events = [{ id: 'ev-1', at_elapsed_hours: 0.5, kind: 'intel', effects: [{ type: 'note' }] }];
    additive.mission_tasks = [{ id: 'task-1', unit_id: 'B1', kind: 'patrol', start_elapsed_hours: 0, end_elapsed_hours: 2 }];
    additive.decision_points = [{ id: 'dp-1', trigger_elapsed_hours: 1, title: 'Choose route', options: [{ id: 'a' }] }];
    additive.victory_conditions = [{ id: 'vc-1', kind: 'hold', threshold: 1, evaluate_at_elapsed_hours: 3, side: 'BLUE' }];
    const additiveResult = validator.validateScenario(additive);
    ok('T-2 top-level C4 arrays are accepted additively', additiveResult.ok === true && additiveResult.errors.length === 0);

    const nested = baseScenario();
    nested.runtime_scenario = {
        start_time: '2026-07-06T00:00:00Z',
        duration_hours: 3,
        runtime_events: [{ id: 'nested-ev', at_elapsed_hours: 1 }],
        mission_tasks: [{ id: 'nested-task', start_elapsed_hours: 0 }],
        decision_points: [{ id: 'nested-dp', trigger_elapsed_hours: 1 }],
        victory_conditions: [{ id: 'nested-vc', continuous: true }]
    };
    const nestedResult = validator.validateScenario(nested);
    ok('T-3 runtime_scenario with C4 arrays is accepted additively', nestedResult.ok === true && nestedResult.errors.length === 0);
})();

console.log('\n--- C4A-SCHEMA-3: steps stay snapshots/review, runtime-events facade is loaded ---');
ok('T-1 steps[] remains required and is not removed',
    spec.TOP_LEVEL.steps && spec.TOP_LEVEL.steps.required === true && spec.TOP_LEVEL.steps.type === 'array');
ok('T-2 no schema text requires deleting steps[]',
    !/remove steps|delete steps|steps\[\] removed/i.test(specSource));
ok('T-3 runtime-events browser facade is loaded in the main app',
    appHtml.includes('shell/runtime-events.js?v=c4a') && appHtml.includes('pure runtime event evaluator'));

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
process.exit(failed ? 1 : 0);
