#!/usr/bin/env node
/*
 * External app Staff_Brief_2 review-only adapter and renderer support.
 */
'use strict';

const path = require('path');
global.window = {};

const ADAPTER = require(path.join(__dirname, 'UI_MOdified/server/ai/mdmp-external-adapter'));
const B = require(path.join(__dirname, 'UI_MOdified/server/ai/operational-brief'));
require(path.join(__dirname, 'UI_MOdified/client/shell/doc-understanding-review.js'));

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); console.log('  [PASS] ' + name); passed++; }
    catch (e) { console.log('  [FAIL] ' + name + ': ' + e.message); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function render(out) {
    out.understanding = B.understandingFromBrief(B.normalizeBrief(out.brief));
    const container = { innerHTML: '', style: {}, querySelector: function () { return null; } };
    window.RmoozDocReview.render(container, out, {});
    return container.innerHTML;
}

const STEP2_FLAT = {
    First_light: '\u0627\u0644\u0636\u0648\u0621 \u0627\u0644\u0623\u0648\u0644 0510',
    Enemy_Capabilities: '\u0642\u062f\u0631\u0627\u062a \u062c\u0648\u064a\u0629 \u0648\u0628\u062d\u0631\u064a\u0629',
    join_op_mission: '\u0645\u0647\u0645\u0629 \u0627\u0644\u0639\u0645\u0644\u064a\u0627\u062a',
    Force_Cover: '\u062a\u063a\u0637\u064a\u0629 \u0627\u0644\u0642\u0648\u0629',
    Fuel: '\u0648\u0642\u0648\u062f \u064a\u0635\u062f\u0631 \u0644\u0627\u062d\u0642\u0627\u064b',
};

const STEP2_NESTED = {
    sections: {
        intel_summary: { Weather: '\u0637\u0642\u0633 \u0635\u0627\u0641' },
        enemy_capabilities: { Enemy_Capabilities: '\u0642\u062f\u0631\u0627\u062a \u0635\u0627\u0631\u0648\u062e\u064a\u0629' },
        operations: { Exc_command_mission: '\u062a\u0623\u0645\u064a\u0646 \u0627\u0644\u0645\u0646\u0637\u0642\u0629', Weather: '\u0637\u0642\u0633 \u0645\u0624\u062b\u0631' },
        hr: { Combat_Morale: '\u0645\u062a\u0648\u0633\u0637' },
        logistics: { ammunition: '\u0645\u062e\u0632\u0648\u0646 \u0645\u062d\u062f\u0648\u062f' },
    },
    Enemy_Capabilities: '\u0642\u062f\u0631\u0627\u062a \u0645\u063a\u0627\u064a\u0631\u0629',
};

const STEP1_MIN = {
    task_assembly: { summary: '\u062a\u062c\u0645\u064a\u0639 \u0645\u0631\u062a\u0628\u0637 \u0628\u0627\u0644\u062e\u0637\u0629', supporting_tasks: [] },
    Units_Duty: '\u0648\u0627\u062c\u0628 \u0639\u0627\u0645 25.29, 60.62',
    doctrine_upload_required: true,
    enemy_forces: {
        air_bases: [{
            base_name_ar: '\u0642\u0627\u0639\u062f\u0629 \u0628\u0646\u062f\u0631 \u0639\u0628\u0627\u0633',
            base_name_en: 'Bandar Abbas',
            lat: 27.2183,
            lon: 56.3778,
            units: [{ platform: 'F-4E Phantom II', estimated_count: 8, type_ar: 'fighter' }],
        }],
    },
    Assembly_Area: '40RCN596875',
};

console.log('\nExternal Staff Brief 2 support\n');

test('flat Staff_Brief_2 normalizes into all five sections', () => {
    const out = ADAPTER.adaptMdmpBundle([{ filename: 'Staff_Brief_2.json', data: STEP2_FLAT }]);
    const ob = out.brief.operational_brief;
    const sb = ob.staff_brief_2;
    assert(sb && sb.sections, 'staff_brief_2 exists');
    assert(sb.sections.intel_summary.First_light.value === STEP2_FLAT.First_light, 'intel_summary');
    assert(sb.sections.enemy_capabilities.Enemy_Capabilities.value === STEP2_FLAT.Enemy_Capabilities, 'enemy_capabilities');
    assert(sb.sections.operations.join_op_mission.value === STEP2_FLAT.join_op_mission, 'operations');
    assert(sb.sections.hr.Force_Cover.value === STEP2_FLAT.Force_Cover, 'hr');
    assert(sb.sections.logistics.Fuel.value === STEP2_FLAT.Fuel, 'logistics');
    assert(sb.external_step === 2 && sb.package_type === 'Staff_Brief_2', 'step/package metadata');
    assert(sb.raw_external_json && ob.external_raw.staff_brief_2, 'raw external JSON preserved separately');
    Object.keys(sb.sections).forEach(name => {
        Object.keys(sb.sections[name]).forEach(k => {
            assert(sb.sections[name][k].needs_review === true, 'needs_review on ' + name + '.' + k);
            assert(sb.sections[name][k].source_type === 'ai_candidate_from_external_llm', 'source_type on ' + name + '.' + k);
        });
    });
});

test('nested sections Staff_Brief_2 is preserved and renders all five staff brief sections', () => {
    const out = ADAPTER.adaptMdmpBundle([{ filename: 'Staff_Brief_2_nested.json', data: STEP2_NESTED }]);
    const sb = out.brief.operational_brief.staff_brief_2;
    assert(sb.sections.intel_summary.Weather.value === STEP2_NESTED.sections.intel_summary.Weather, 'nested value preserved');
    const html = render(out);
    assert(html.indexOf('Staff Brief 2') !== -1, 'Staff Brief 2 section');
    ['Intel Summary', 'Enemy Capabilities', 'Operations', 'HR', 'Logistics', 'Conclusions', 'Missing Information'].forEach(section => {
        assert(html.indexOf(section) !== -1, section + ' renders');
    });
    assert(html.indexOf('Weather') !== -1 && html.indexOf('Exc_command_mission') !== -1, 'nested fields render');
    assert(html.indexOf('needs_review') !== -1 && html.indexOf('ai_candidate_from_external_llm') !== -1, 'review metadata renders');
});

test('duplicate nested/flat Step 2 keys warn and cross-section conflicts are explicit', () => {
    const out = ADAPTER.adaptMdmpBundle([{ filename: 'Staff_Brief_2_nested.json', data: STEP2_NESTED }]);
    const sb = out.brief.operational_brief.staff_brief_2;
    assert(sb.sections.enemy_capabilities.Enemy_Capabilities.value === STEP2_NESTED.sections.enemy_capabilities.Enemy_Capabilities,
        'nested value kept');
    assert(sb.duplicate_key_warnings.length === 1, 'duplicate warning recorded');
    assert(sb.duplicate_key_warnings[0].key === 'Enemy_Capabilities', 'duplicate key named');
    assert(sb.conflicts.some(c => c.key === 'Weather'), 'cross-section conflict recorded');
});

test('missing Step 2 sections become missing_information, not crash', () => {
    const out = ADAPTER.adaptMdmpBundle([{ filename: 'Staff_Brief_2_partial.json', data: { Enemy_Capabilities: '\u0642\u062f\u0631\u0627\u062a' } }]);
    const ob = out.brief.operational_brief;
    assert(ob.staff_brief_2, 'staff_brief_2 exists for partial');
    assert(ob.missing_information.indexOf('Staff Brief 2 missing section: Intel Summary') !== -1, 'missing intel_summary');
    assert(ob.missing_information.indexOf('Staff Brief 2 missing section: Operations') !== -1, 'missing operations');
    assert(ob.missing_information.indexOf('Staff Brief 2 missing section: HR') !== -1, 'missing HR');
    assert(ob.missing_information.indexOf('Staff Brief 2 missing section: Logistics') !== -1, 'missing Logistics');
    const html = render(out);
    assert(html.indexOf('Missing Information') !== -1 && html.indexOf('Staff Brief 2 missing section: Operations') !== -1,
        'missing information renders');
});

test('individual AAAA-EEEE files bundle into the five Staff Brief 2 sections', () => {
    const out = ADAPTER.adaptMdmpBundle([
        { filename: 'AAAA.json', data: { First_light: '\u0641\u062c\u0631' } },
        { filename: 'BBBB.json', data: { Enemy_Capabilities: '\u0642\u062f\u0631\u0627\u062a' } },
        { filename: 'CCCC.json', data: { join_op_mission: '\u0645\u0647\u0645\u0629' } },
        { filename: 'DDDD.json', data: { Force_Cover: '\u062a\u063a\u0637\u064a\u0629' } },
        { filename: 'EEEE.json', data: { Fuel: '\u0648\u0642\u0648\u062f' } },
    ]);
    const sb = out.brief.operational_brief.staff_brief_2;
    assert(sb.sections.intel_summary.First_light.value === '\u0641\u062c\u0631', 'AAAA -> intel');
    assert(sb.sections.enemy_capabilities.Enemy_Capabilities.value === '\u0642\u062f\u0631\u0627\u062a', 'BBBB -> enemy capabilities');
    assert(sb.sections.operations.join_op_mission.value === '\u0645\u0647\u0645\u0629', 'CCCC -> operations');
    assert(sb.sections.hr.Force_Cover.value === '\u062a\u063a\u0637\u064a\u0629', 'DDDD -> HR');
    assert(sb.sections.logistics.Fuel.value === '\u0648\u0642\u0648\u062f', 'EEEE -> logistics');
    assert(sb.raw_external_json.files.length === 5, 'all raw files preserved');
    assert(!out.brief.operational_brief.missing_information.some(m => /^Staff Brief 2 missing section:/.test(m)), 'no stale missing section');
});

test('Step 1 + Step 2 bundle keeps proposed_units, task_assembly, doctrine, and placement linkage', () => {
    const out = ADAPTER.adaptMdmpBundle([
        { filename: 'step1.json', data: STEP1_MIN },
        { filename: 'Staff_Brief_2.json', data: STEP2_FLAT },
    ]);
    const ob = out.brief.operational_brief;
    assert(ob.task_assembly && ob.task_assembly.summary === STEP1_MIN.task_assembly.summary, 'task_assembly kept');
    assert(ob.proposed_units.length === 1, 'proposed_units kept');
    assert(ob.task_assembly.doctrine_upload_required === true, 'doctrine_upload_required kept');
    assert(ob.placement_candidates.length >= 2, 'placement candidates kept');
    assert(ob.staff_brief_2.step1_linkage.task_assembly === true, 'step1 linkage task_assembly');
    assert(ob.staff_brief_2.step1_linkage.proposed_units === 1, 'step1 linkage proposed_units');
    assert(ob.staff_brief_2.step1_linkage.doctrine_upload_required === true, 'step1 linkage doctrine');
    assert(ob.staff_brief_2.step1_linkage.placement_candidates >= 2, 'step1 linkage placement');
});

test('normalizeBrief preserves Staff Brief 2 review object', () => {
    const out = ADAPTER.adaptMdmpBundle([{ filename: 'Staff_Brief_2.json', data: STEP2_FLAT }]);
    const nb = B.normalizeBrief(out.brief);
    assert(nb.operational_brief.staff_brief_2.sections.logistics.Fuel.value === STEP2_FLAT.Fuel, 'staff_brief_2 survives normalization');
    assert(nb.operational_brief.external_raw.staff_brief_2.files[0].data.Fuel === STEP2_FLAT.Fuel, 'raw survives normalization');
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
