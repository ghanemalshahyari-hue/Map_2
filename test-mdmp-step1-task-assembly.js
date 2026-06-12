#!/usr/bin/env node
/*
 * Step-1 task assembly and proposed enemy-unit extraction support.
 */
'use strict';

const path = require('path');
const fs = require('fs');
const ADAPTER = require(path.join(__dirname, 'UI_MOdified/server/ai/mdmp-external-adapter'));
const B = require(path.join(__dirname, 'UI_MOdified/server/ai/operational-brief'));
const { parseJsonc } = require(path.join(__dirname, 'UI_MOdified/server/ai/jsonc'));

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); console.log('  [PASS] ' + name); passed++; }
    catch (e) { console.log('  [FAIL] ' + name + ': ' + e.message); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

const AR = {
    iran: '\u0625\u064a\u0631\u0627\u0646',
    fighter: '\u0645\u0642\u0627\u062a\u0644\u0629 / \u0637\u0627\u0626\u0631\u0629',
    base: '\u0642\u0627\u0639\u062f\u0629 \u0627\u0644\u0634\u0647\u064a\u062f \u0646\u0648\u062c\u0647 / \u0647\u0645\u062f\u0627\u0646',
    later: '\u064a\u0635\u062f\u0631 \u0644\u0627\u062d\u0642\u0627\u064b',
};

const STEP1_FILLED = {
    task_assembly: {
        summary: '\u062a\u062c\u0645\u064a\u0639 \u0648\u0627\u062c\u0628\u0627\u062a \u0623\u0648\u0644\u064a \u0644\u0644\u0642\u0648\u0627\u062a \u0627\u0644\u0628\u0631\u064a\u0629.',
        main_task: '\u062d\u0645\u0627\u064a\u0629 \u0642\u0637\u0631',
        supporting_tasks: [
            { unit: '\u0643\u062a\u064a\u0628\u0629 \u0627\u0644\u0645\u0634\u0627\u0629', duty: '\u062a\u0623\u0645\u064a\u0646 \u0645\u0646\u0637\u0642\u0629 \u0627\u0644\u062a\u062c\u0645\u0639 40RCN596875' },
            { unit: '\u0633\u0631\u0628 figter', duty: '\u062a\u0648\u0641\u064a\u0631 \u0627\u0633\u062a\u0637\u0644\u0627\u0639 \u062c\u0648\u064a \u0641\u0648\u0642 25.29, 60.62' },
        ],
    },
    Units_Duty: '\u0648\u0627\u062c\u0628 fighter: \u0645\u0631\u0627\u0642\u0628\u0629 \u0627\u0644\u0633\u0627\u062d\u0644. \u0648\u0627\u062c\u0628 \u0643\u062a\u064a\u0628\u0629 \u0627\u0644\u0645\u0634\u0627\u0629: \u062d\u0645\u0627\u064a\u0629 \u0646\u0642\u0637\u0629 27.15, 56.2167.',
    doctrine_upload_required: true,
    doctrine_sources: ['pending_upload'],
    doctrine_application_policy: 'operator_uploaded_doctrine_required_before_final_tasking',
    enemy_forces: {
        air_bases: [{
            base_name_ar: AR.base,
            base_name_en: 'Shahid Nojeh / Hamedan',
            lat: 35.2116,
            lon: 48.6534,
            units: [
                { platform: 'F-14A Tomcat', estimated_count: 24, type_ar: 'figter' },
                { platform: 'F-4D/E Phantom II', estimated_count: 12, type_ar: 'fighter' },
            ],
        }, {
            base_name_ar: '\u0645\u0637\u0627\u0631 \u0645\u0647\u0631\u0622\u0628\u0627\u062f',
            base_name_en: 'Mehrabad',
            lat: 35.6892,
            lon: 51.3134,
            units: [{ platform: 'F-5E Tiger II', estimated_count: 18, type_ar: 'fighter' }],
        }, {
            base_name_ar: '\u0642\u0627\u0639\u062f\u0629 \u0628\u0648\u0634\u0647\u0631',
            base_name_en: 'Bushehr',
            lat: 28.9448,
            lon: 50.8346,
            units: [{ platform: 'F-4E Phantom II', estimated_count: 10, type_ar: 'fighter' }],
        }, {
            base_name_ar: '\u0642\u0627\u0639\u062f\u0629 \u0628\u0646\u062f\u0631 \u0639\u0628\u0627\u0633',
            base_name_en: 'Bandar Abbas',
            lat: 27.2183,
            lon: 56.3778,
            units: [{ platform: 'Su-22', estimated_count: 8, type_ar: '\u0645\u0642\u0627\u062a\u0644\u0629 / \u0637\u0627\u0626\u0631\u0629' }],
        }, {
            base_name_ar: '\u0643\u0646\u0627\u0631\u0643 / \u062a\u0634\u0627\u0628\u0647\u0627\u0631',
            base_name_en: 'Konarak / Chabahar',
            lat: 25.4433,
            lon: 60.3821,
            units: [{ platform: 'P-3F Orion', estimated_count: 4, type_ar: '\u0637\u0627\u0626\u0631\u0629' }],
        }],
    },
    Assembly_Area: '\u0645\u0646\u0637\u0642\u0629 \u0627\u0644\u062a\u062c\u0645\u0639 40RCN596875',
    join_op_mission: '\u062d\u0645\u0627\u064a\u0629 \u0642\u0637\u0631 \u0648\u0631\u062f\u0639 \u062a\u0647\u062f\u064a\u062f\u0627\u062a \u0625\u064a\u0631\u0627\u0646.',
    Join_op_purp: '\u062d\u0645\u0627\u064a\u0629 \u0627\u0644\u0645\u062c\u0627\u0644 \u0627\u0644\u062d\u064a\u0648\u064a',
    joint_ops_how: '\u062a\u0646\u0633\u064a\u0642 \u062f\u0641\u0627\u0639 \u0628\u0631\u064a \u0648\u062c\u0648\u064a',
    joint_ops_desired_end: '\u0645\u0646\u0639 \u0627\u0644\u062a\u0635\u0639\u064a\u062f',
};

function adapt(data) {
    return ADAPTER.adaptMdmpBundle([{ filename: 'qatar-iran-step1.jsonc', data }]).brief.operational_brief;
}

console.log('\nStep-1 task assembly and proposed units\n');

test('filled Step 1 preserves structured task_assembly and separate Units_Duty', () => {
    const ob = adapt(STEP1_FILLED);
    assert(ob.task_assembly && typeof ob.task_assembly === 'object', 'task_assembly object');
    assert(ob.task_assembly.summary === STEP1_FILLED.task_assembly.summary, 'summary preserved');
    assert(Array.isArray(ob.task_assembly.supporting_tasks) && ob.task_assembly.supporting_tasks.length === 2, 'supporting_tasks preserved');
    assert(ob.units_duty && ob.units_duty.summary, 'Units_Duty preserved separately');
});

test('Step 1 task objects carry doctrine fields and AI review metadata', () => {
    const ob = adapt(STEP1_FILLED);
    assert(ob.task_assembly.source_type === 'ai_candidate_from_external_llm', 'task_assembly source_type');
    assert(ob.task_assembly.needs_review === true && ob.task_assembly.commander_review_required === true, 'task assembly review flags');
    assert(ob.task_assembly.tasking_status === 'needs_review', 'tasking_status');
    assert(ob.task_assembly.doctrine_upload_required === true, 'doctrine_upload_required');
    assert(ob.task_assembly.doctrine_sources[0] === 'pending_upload', 'doctrine_sources preserved');
    assert(ob.task_assembly.doctrine_application_policy === STEP1_FILLED.doctrine_application_policy, 'doctrine policy preserved');
    assert(ob.units_duty.source_type === 'ai_candidate_from_external_llm' && ob.units_duty.needs_review === true, 'Units_Duty review metadata');
});

test('enemy_forces.air_bases creates proposed RED units with counts and review flags', () => {
    const ob = adapt(STEP1_FILLED);
    assert(ob.enemy_forces && Array.isArray(ob.enemy_forces.air_bases), 'enemy_forces.air_bases preserved');
    assert(Array.isArray(ob.enemy_bases) && ob.enemy_bases.length === 5, 'base/location objects created');
    assert(Array.isArray(ob.proposed_units) && ob.proposed_units.length === 6, 'six proposed units');
    const f14 = ob.proposed_units.find(u => u.id === 'RED-F14A-HAMEDAN');
    const f4 = ob.proposed_units.find(u => u.id === 'RED-F4-HAMEDAN');
    assert(f14 && f4, 'expected RED ids');
    assert(f14.side === 'RED' && f14.country === AR.iran, 'side/country');
    assert(f14.estimated_count === 24 && f4.estimated_count === 12, 'estimated_count extracted');
    assert(f14.base_name_ar === AR.base && f14.base_name_en === 'Shahid Nojeh / Hamedan', 'base names');
    assert(f14.lat === 35.2116 && f14.lon === 48.6534, 'coordinates copied as anchor');
    assert(f14.type_ar === AR.fighter && f4.type_ar === AR.fighter, 'figter/fighter normalized');
    assert(f14.exact_unit_position === false && f4.exact_unit_position === false, 'not exact unit position');
    assert(f14.needs_review === true && f4.needs_review === true, 'needs review');
    assert(f14.source_type === 'ai_candidate_from_external_llm', 'source_type');
    assert(f14.warning === 'base_known_exact_unit_position_unknown', 'warning');
    assert(ob.enemy.units.length === 0, 'no final RED unit placement');
});

test('coordinates become placement candidates, never final unit placement', () => {
    const ob = adapt(STEP1_FILLED);
    assert(Array.isArray(ob.placement_candidates) && ob.placement_candidates.length >= 4, 'placement candidates created');
    assert(ob.placement_candidates.some(c => c.placement_type === 'base_location_anchor' && c.lat === 35.2116 &&
        c.lon === 48.6534 && c.exact_unit_position === false), 'base anchor candidate');
    ob.placement_candidates.forEach(c => {
        assert(c.exact_unit_position === false, 'candidate is not exact unit position');
        assert(c.needs_review === true, 'candidate needs review');
        assert(c.source_type === 'ai_candidate_from_external_llm', 'candidate source_type');
    });
    assert(ob.friendly.units.length === 0 && ob.enemy.units.length === 0, 'no final unit placement');
});

test('missing task_assembly gets required default and missing_information[] entry', () => {
    const ob = adapt({ Units_Duty: '\u0648\u0627\u062c\u0628 \u0639\u0627\u0645', Assembly_Area: '40RCN596875' });
    assert(ob.task_assembly.summary === AR.later, 'default summary');
    assert(Array.isArray(ob.task_assembly.supporting_tasks) && ob.task_assembly.supporting_tasks.length === 0, 'default supporting_tasks');
    assert(ob.task_assembly.commander_review_required === true, 'default commander review');
    assert(ob.task_assembly.tasking_status === 'needs_review', 'default tasking status');
    assert(ob.missing_information.indexOf('task_assembly') !== -1, 'missing_information includes task_assembly');
});

test('Qatar/Iran Step 1 trial JSONC parses and keeps Step 1 review-only', () => {
    const f = path.join(__dirname, 'UI_MOdified', 'TestingAI', 'Other_App_Ai_Generated output', 'initial_planning_guide', 'step1.json');
    const parsed = parseJsonc(fs.readFileSync(f, 'utf8'));
    assert(parsed.ok, 'trial JSONC parses');
    const out = ADAPTER.adaptMdmpBundle([{ filename: 'qatar-iran-trial-step1.jsonc', data: parsed.value }]);
    const ob = out.brief.operational_brief;
    assert(ob.task_assembly && ob.task_assembly.summary === AR.later, 'default task_assembly for placeholder trial');
    assert(ob.missing_information.indexOf('task_assembly') !== -1, 'task_assembly missing recorded');
    assert(ob.missing_information.indexOf('Units_Duty') !== -1, 'Units_Duty missing recorded');
    assert(Array.isArray(ob.placement_candidates) && ob.placement_candidates.length >= 1, 'assembly coordinate candidate present');
    assert(ob.placement_candidates.every(c => c.exact_unit_position === false), 'no final placement');
    assert(ob.courses_of_action.every(c => c.status !== 'approved' && c.unit_tasking.length === 0 && c.wargame_turns.length === 0), 'no final COA/tasking/execution');
});

test('normalizeBrief and understanding preserve Step 1 proposed-unit fields', () => {
    const out = ADAPTER.adaptMdmpBundle([{ filename: 'qatar-iran-step1.jsonc', data: STEP1_FILLED }]);
    const nb = B.normalizeBrief(out.brief);
    const ob = nb.operational_brief;
    const u = B.understandingFromBrief(nb);
    assert(ob.task_assembly && ob.task_assembly.summary === STEP1_FILLED.task_assembly.summary, 'task_assembly survives');
    assert(ob.units_duty && ob.units_duty.summary.indexOf('\u0645\u0631\u0627\u0642\u0628\u0629 \u0627\u0644\u0633\u0627\u062d\u0644') !== -1, 'units_duty survives');
    assert(ob.placement_candidates.length >= 4, 'placement candidates survive');
    assert(ob.proposed_units.length === 6 && ob.enemy_bases.length === 5 && ob.enemy_forces.air_bases.length === 5, 'proposed units and air bases survive');
    assert(u.proposed_unit_counts.red === 6 && u.proposed_unit_counts.blue === 0 && u.proposed_unit_counts.neutral === 0, 'RED proposed count');
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
