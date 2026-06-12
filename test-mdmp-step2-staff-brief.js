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
    Staff_Brief_2: {
        intel_summary: { Weather: '\u0637\u0642\u0633 \u0635\u0627\u0641' },
        enemy_capabilities: { Enemy_Capabilities: '\u0642\u062f\u0631\u0627\u062a \u0635\u0627\u0631\u0648\u062e\u064a\u0629' },
        operations: { Exc_command_mission: '\u062a\u0623\u0645\u064a\u0646 \u0627\u0644\u0645\u0646\u0637\u0642\u0629' },
        hr: { Combat_Morale: '\u0645\u062a\u0648\u0633\u0637' },
        logistics: { ammunition: '\u0645\u062e\u0632\u0648\u0646 \u0645\u062d\u062f\u0648\u062f' },
    },
    Enemy_Capabilities: '\u0642\u062f\u0631\u0627\u062a \u0645\u063a\u0627\u064a\u0631\u0629',
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
    assert(sb.raw_external_json && ob.external_raw.staff_brief_2, 'raw external JSON preserved separately');
    Object.keys(sb.sections).forEach(name => {
        Object.keys(sb.sections[name]).forEach(k => {
            assert(sb.sections[name][k].needs_review === true, 'needs_review on ' + name + '.' + k);
            assert(sb.sections[name][k].source_type === 'ai_candidate_from_external_llm', 'source_type on ' + name + '.' + k);
        });
    });
});

test('nested Staff_Brief_2 renders all five staff brief sections', () => {
    const out = ADAPTER.adaptMdmpBundle([{ filename: 'Staff_Brief_2_nested.json', data: STEP2_NESTED }]);
    const html = render(out);
    assert(html.indexOf('Staff Brief 2') !== -1, 'Staff Brief 2 section');
    ['intel_summary', 'enemy_capabilities', 'operations', 'hr', 'logistics'].forEach(section => {
        assert(html.indexOf(section) !== -1, section + ' renders');
    });
    assert(html.indexOf('Weather') !== -1 && html.indexOf('Exc_command_mission') !== -1, 'nested fields render');
    assert(html.indexOf('needs_review') !== -1 && html.indexOf('ai_candidate_from_external_llm') !== -1, 'review metadata renders');
});

test('duplicate nested/flat Step 2 keys warn instead of silently overwriting', () => {
    const out = ADAPTER.adaptMdmpBundle([{ filename: 'Staff_Brief_2_nested.json', data: STEP2_NESTED }]);
    const sb = out.brief.operational_brief.staff_brief_2;
    assert(sb.sections.enemy_capabilities.Enemy_Capabilities.value === STEP2_NESTED.Staff_Brief_2.enemy_capabilities.Enemy_Capabilities,
        'nested value kept');
    assert(sb.duplicate_key_warnings.length === 1, 'duplicate warning recorded');
    assert(sb.duplicate_key_warnings[0].key === 'Enemy_Capabilities', 'duplicate key named');
});

test('missing Step 2 sections become missing_information, not crash', () => {
    const out = ADAPTER.adaptMdmpBundle([{ filename: 'Staff_Brief_2_partial.json', data: { Enemy_Capabilities: '\u0642\u062f\u0631\u0627\u062a' } }]);
    const ob = out.brief.operational_brief;
    assert(ob.staff_brief_2, 'staff_brief_2 exists for partial');
    assert(ob.missing_information.indexOf('staff_brief_2.sections.intel_summary') !== -1, 'missing intel_summary');
    assert(ob.missing_information.indexOf('staff_brief_2.sections.operations') !== -1, 'missing operations');
    const html = render(out);
    assert(html.indexOf('Missing Information') !== -1 && html.indexOf('staff_brief_2.sections.operations') !== -1,
        'missing information renders');
});

test('normalizeBrief preserves Staff Brief 2 review object', () => {
    const out = ADAPTER.adaptMdmpBundle([{ filename: 'Staff_Brief_2.json', data: STEP2_FLAT }]);
    const nb = B.normalizeBrief(out.brief);
    assert(nb.operational_brief.staff_brief_2.sections.logistics.Fuel.value === STEP2_FLAT.Fuel, 'staff_brief_2 survives normalization');
    assert(nb.operational_brief.external_raw.staff_brief_2.Fuel === STEP2_FLAT.Fuel, 'raw survives normalization');
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
