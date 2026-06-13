#!/usr/bin/env node
/*
 * MULTI-COUNTRY flexible Step 1 detection — the external shape
 * (participants / enemy_forces / friendly_forces.countries + pre-enriched
 * proposed_units / placement_candidates), distinct from the {countries[]} ORBAT
 * shape and from the single-side STEP1-C trial shape.
 *
 * Review-only: asserts detection + coalition counts + no double-count + no final
 * units. No network, no Downloads dependency (self-contained synthetic input).
 */
'use strict';

var path = require('path');
var AI = path.join(__dirname, '..', 'server', 'ai');
var BRIEF = require(path.join(AI, 'operational-brief.js'));
var MC = require(path.join(AI, 'multi-country-orbat.js'));

var passed = 0, failed = 0;
function test(n, fn) { try { fn(); console.log('  [PASS] ' + n); passed++; } catch (e) { console.log('  [FAIL] ' + n + ': ' + e.message); failed++; } }
function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }

// External Step 1 shape: participants + enemy_forces (RED) + friendly_forces.countries (BLUE) +
// pre-enriched top-level proposed_units / placement_candidates. country_key uses 'Iran'/'UAE'/'Qatar'
// while enemy_forces.country uses the Arabic name — must canonicalize to ONE key (no double-count).
function base(en, type, lat, lon, units, country, ckey) {
    var b = { base_name_en: en, base_name_ar: en, base_type: type, location: { lat: lat, lon: lon }, exact_unit_position: false, needs_review: true, units: units || [] };
    if (country) b.country = country;
    if (ckey) b.country_key = ckey;
    return b;
}
function unit(side, ckey, country, plat) {
    return { id: side + '-' + plat, side: side, country: country, country_key: ckey, platform_name_original: plat, symbol_category: 'air_fighter', catalog_match_status: 'generic_category_match', needs_review: true, source_type: 'external_excel_orbat_candidate' };
}
function cand(side, ckey, country, en, type, lat, lon) {
    return { id: side + '-' + en, side: side, country: country, country_key: ckey, base_name_en: en, anchor_type: type, lat: lat, lon: lon, placement_type: 'known_base', exact_unit_position: false, needs_review: true };
}

var EXTERNAL = {
    scenario_metadata: { scenario_type: 'step 1' },
    task_assembly: { summary: 'tajmi3', not_final_tasking: true },
    doctrine_upload_required: true,
    participants: {
        red: [{ country: 'إيران', country_key: 'Iran', role: 'الطرف الأحمر' }],
        blue: [{ country: 'الإمارات', country_key: 'UAE' }, { country: 'قطر', country_key: 'Qatar' }],
        neutral: [],
    },
    enemy_forces: {
        side: 'RED', country: 'إيران',
        air_bases: [base('Bandar Abbas', 'air_base', 27.2, 56.3, [{ platform: 'F-14A', estimated_count: 8 }], 'إيران', 'Iran')],
        naval_bases: [base('Bandar Naval', 'naval_base', 27.1, 56.2, [{ platform: 'Kilo', estimated_count: 2 }], 'إيران', 'Iran')],
        land_bases: [base('Shiraz', 'land_base', 29.6, 52.5, [{ platform: 'S-300', estimated_count: 4 }], 'إيران', 'Iran')],
    },
    friendly_forces: {
        side: 'BLUE',
        countries: [
            { country: 'الإمارات', country_key: 'UAE', side: 'BLUE', bases: [base('Al Dhafra', 'air_base', 24.2, 54.5)] },
            { country: 'قطر', country_key: 'Qatar', side: 'BLUE', bases: [base('Al Udeid', 'air_base', 25.1, 51.3)] },
        ],
    },
    proposed_units: [
        unit('RED', 'Iran', 'إيران', 'F-14A'), unit('RED', 'Iran', 'إيران', 'F-4'),
        unit('BLUE', 'UAE', 'الإمارات', 'F-16E'),
        unit('BLUE', 'Qatar', 'قطر', 'Rafale'),
    ],
    placement_candidates: [
        cand('RED', 'Iran', 'إيران', 'Bandar Abbas', 'air_base', 27.2, 56.3),
        cand('BLUE', 'UAE', 'الإمارات', 'Al Dhafra', 'air_base', 24.2, 54.5),
        cand('BLUE', 'Qatar', 'قطر', 'Al Udeid', 'air_base', 25.1, 51.3),
    ],
    missing_information: ['some upstream gap'],
};

// STEP1-C single-side trial shape (no participants, friendly_forces has trial_bases not countries).
var STEP1C_LIKE = {
    task_assembly: { summary: 'x' }, doctrine_upload_required: true,
    enemy_forces: { bases: [base('Trial 1', 'air_base', 26, 51)] },
    friendly_forces: { trial_bases: [base('Blue Trial', 'air_base', 24.8, 51.2)] },
    proposed_units: [{ side: 'RED', platform: 'RED Plat 1' }],
    placement_candidates: [{ mention: 'anchor', lat: 25.5, lon: 51.5, side: 'RED' }],
};

console.log('\nMULTI-COUNTRY flexible Step 1 detection\n');

test('external coalition shape classifies as multi_country_step1', function () {
    assert(MC.isExternalStep1Shape(EXTERNAL) === true, 'isExternalStep1Shape true');
    assert(BRIEF.classifyJsonInput(EXTERNAL) === 'multi_country_step1', 'classify multi_country_step1, got ' + BRIEF.classifyJsonInput(EXTERNAL));
});
test('STEP1-C single-trial shape stays mdmp_external (reorder did not capture it)', function () {
    assert(MC.isExternalStep1Shape(STEP1C_LIKE) === false || !STEP1C_LIKE.participants, 'no participants/countries');
    assert(BRIEF.classifyJsonInput(STEP1C_LIKE) === 'mdmp_external', 'STEP1-C stays mdmp_external, got ' + BRIEF.classifyJsonInput(STEP1C_LIKE));
});

var built = MC.buildBriefFromMultiCountry(EXTERNAL, { file: 'external.json' });
var ob = built.brief.operational_brief;
function country(k) { return (ob.countries || []).find(function (c) { return c.country_key === k; }); }

test('RED 1 / BLUE 2 — country_key canonicalized (Iran vs إيران not double-counted)', function () {
    assert(ob.coalition_totals.RED.countries === 1, 'RED 1, got ' + ob.coalition_totals.RED.countries);
    assert(ob.coalition_totals.BLUE.countries === 2, 'BLUE 2, got ' + ob.coalition_totals.BLUE.countries);
    assert(country('iran') && country('iran').side === 'RED', 'iran RED');
    assert(country('uae') && country('qatar'), 'uae + qatar present (lowercased canonical keys)');
    assert(!country('Iran'), 'no duplicate PascalCase Iran key');
});
test('participants drive sides; enemy_forces=RED / friendly_forces.countries=BLUE', function () {
    assert(country('iran').side === 'RED' && country('uae').side === 'BLUE' && country('qatar').side === 'BLUE', 'sides correct');
});
test('bases collected from enemy_forces.* + friendly_forces.countries[].bases', function () {
    assert(ob.country_bases.length >= 5, 'all bases collected, got ' + ob.country_bases.length);
    assert(country('iran').base_counts.air >= 1 && country('iran').base_counts.naval >= 1 && country('iran').base_counts.land >= 1, 'Iran air/naval/land');
});
test('proposed_units + placement_candidates preserved, review-only, exact_unit_position:false', function () {
    assert(ob.proposed_units.length === 4, '4 proposed units, got ' + ob.proposed_units.length);
    assert(ob.placement_candidates.length >= 3, 'placement candidates preserved');
    assert(ob.proposed_units.every(function (u) { return u.exact_unit_position === false && u.needs_review === true; }), 'units review-only');
    assert(ob.placement_candidates.every(function (c) { return c.exact_unit_position === false; }), 'candidates exact_unit_position:false');
});
test('understanding label + rollup; missing_information preserved; no final units/COA', function () {
    var u = BRIEF.understandingFromBrief(BRIEF.normalizeBrief(built.brief));
    assert(u.set_label_en === 'Coalition Step 1 ORBAT', 'label');
    assert(u.coalition.red_country_count === 1 && u.coalition.blue_country_count === 2, 'rollup 1/2');
    assert(ob.ambiguities.indexOf('some upstream gap') !== -1, 'input missing_information preserved (in ambiguities funnel)');
    assert(ob.enemy.units.length === 0 && ob.friendly.units.length === 0, 'no final units');
    assert(built.brief.red_units === undefined && ob.courses_of_action.length === 0, 'no scenario units / no COA');
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
