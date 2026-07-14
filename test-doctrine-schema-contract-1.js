'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const spec = require(path.join(ROOT, 'UI_MOdified', 'server', 'ai', 'scenario-schema-spec.js'));
const validator = require(path.join(ROOT, 'UI_MOdified', 'server', 'ai', 'scenario-validator.js'));

let passed = 0;
let failed = 0;
function ok(label, cond) {
    if (cond) { passed++; console.log('  PASS  ' + label); }
    else { failed++; console.error('  FAIL  ' + label); }
}
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

function minimalScenario() {
    return {
        name: 'doc1-schema',
        scenario_label: 'DOC1 Schema',
        map_bbox: [45, 23, 49, 27],
        obj: { name: 'Objective X', coord: [47, 25], target_depth_km: 50, carver: 20 },
        pipeline: [[46, 24], [47, 25]],
        red_units: [{ uid: 'R1', label: 'R1', bls: 'BLS-1', appear: 0, role: 'armor', coord: [46, 24] }],
        blue_units_base_ids: ['B1'],
        blue_units_initial: [{ unit_uid: 'B1', base_id: 'B1', role: 'fighter', coord: [47, 25] }],
        bls_template: [{ name: 'BLS-1', coord: [46, 24] }],
        phase_table: [
            { index: 0, time_label: 'H', elapsed_hours: 0, phase: 'SHAPING' },
            { index: 1, time_label: 'H+1', elapsed_hours: 1, phase: 'ASSAULT' },
            { index: 2, time_label: 'H+2', elapsed_hours: 2, phase: 'CONSOLIDATION' },
            { index: 3, time_label: 'H+3', elapsed_hours: 3, phase: 'CONSOLIDATION' }
        ],
        steps: [
            { index: 0, time_label: 'H', elapsed_hours: 0, phase: 'SHAPING' },
            { index: 1, time_label: 'H+1', elapsed_hours: 1, phase: 'ASSAULT' },
            { index: 2, time_label: 'H+2', elapsed_hours: 2, phase: 'CONSOLIDATION' },
            { index: 3, time_label: 'H+3', elapsed_hours: 3, phase: 'CONSOLIDATION' }
        ]
    };
}

console.log('\n=== DOC1 doctrine schema contract ===\n');

(function () {
    ['doctrine_rules', 'roe_rules', 'wra_rules', 'authority_rules', 'escalation_rules'].forEach((key) => {
        ok('schema documents ' + key, spec.TOP_LEVEL[key] && spec.TOP_LEVEL[key].required === false && spec.TOP_LEVEL[key].type === 'array');
    });
})();

(function () {
    const legacy = minimalScenario();
    const legacyResult = validator.validateScenario(legacy);
    ok('existing scenario without doctrine fields remains valid', legacyResult.ok === true);

    const runtime = Object.assign({}, minimalScenario(), {
        type: 'runtime_scenario',
        start_time: '2026-07-06T00:00:00Z',
        duration_minutes: 180,
        doctrine_rules: [{ id: 'd1', enabled: true, action: 'fire', decision: 'require_approval', reason: 'approval required' }],
        roe_rules: [{ id: 'r1', target_domain: 'air', hostile_confirmed_required: true, decision: 'block', reason: 'confirm hostile' }],
        wra_rules: [{ id: 'w1', weapon_class: 'SAM', min_confidence: 0.8, decision: 'block', reason: 'confidence' }],
        authority_rules: [{ id: 'a1', authority: 'JFC' }],
        escalation_rules: [{ id: 'e1', trigger: 'civilian_risk' }]
    });
    const runtimeResult = validator.validateScenario(runtime);
    ok('runtime_scenario with doctrine fields is additive', runtimeResult.ok === true);
    ok('no requirement to remove steps[] yet', Array.isArray(runtime.steps) && runtime.steps.length === runtime.phase_table.length);
})();

(function () {
    const schemaText = read('UI_MOdified/server/ai/scenario-schema-spec.js');
    ok('schema docs mention ROE and WRA', /Rules of Engagement/.test(schemaText) && /Weapon Release/.test(schemaText));
})();

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
process.exit(failed ? 1 : 0);
