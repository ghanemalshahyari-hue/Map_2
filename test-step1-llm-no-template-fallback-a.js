#!/usr/bin/env node
/*
 * STEP1-LLM-NO-TEMPLATE-FALLBACK-A — regression tests
 *
 * Ensures brief-to-scenario.js never places LLM-extracted units around the
 * objective ring when the import/LLM-fill path supplies only null-coord bases.
 *
 * T1: reviewed_anchors_only + all bases null → 0 placed RED, 0 placed BLUE
 * T2: no placed unit coord exists → no OBJ-ring scatter
 * T3: generation.requiresPlacementReview = true
 * T4: generation.missing_fields carries llm_units_require_geocoded_base_anchor_before_placement
 * T5: generation.placement_sources shows 'blocked_no_reviewed_anchor'
 * T6: review_unresolved_candidates preserves the null-coord LLM bases
 * T7: numeric reviewed anchors still work (existing path unbroken)
 * T8: default policy (allow_template_fallback) still produces template-geometry units
 */
'use strict';

var path   = require('path');
var passed = 0, failed = 0;
function ok(label, cond) {
    if (cond) { passed++; console.log('  [PASS] ' + label); }
    else       { failed++; console.log('  [FAIL] ' + label); }
}

console.log('STEP1-LLM-NO-TEMPLATE-FALLBACK-A');

var GEN = require(path.join(__dirname, 'UI_MOdified/server/ai/brief-to-scenario.js'));

var OBJ = { lon: 35.52, lat: 33.89 };  // Beirut area

// ── LLM brief: all bases have null coords ────────────────────────────
var LLM_BRIEF = {
    document_set_id: 'ds_llm_test',
    operational_brief: {
        mission: 'Strike retaliatory targets in Bekaa Valley',
        commander_intent: '',
        proposed_units: [
            { side: 'RED',  platform: 'SAM Battery',    estimated_count: 1, lat: null, lon: null, source_type: 'llm_fill', needs_review: true },
            { side: 'RED',  platform: 'Militia Group',  estimated_count: 2, lat: null, lon: null, source_type: 'llm_fill', needs_review: true },
            { side: 'BLUE', platform: 'USS Eisenhower', estimated_count: 1, lat: null, lon: null, source_type: 'llm_fill', needs_review: true },
            { side: 'BLUE', platform: '24th MAU',       estimated_count: 1, lat: null, lon: null, source_type: 'llm_fill', needs_review: true },
        ],
        placement_candidates: [
            { side: 'RED',  base_name_en: 'Tehran ATC',  site_type: 'air', lat: null, lon: null, source_type: 'llm_fill', needs_review: true },
            { side: 'BLUE', base_name_en: 'Beirut HQ',   site_type: 'land', lat: null, lon: null, source_type: 'llm_fill', needs_review: true },
            { side: 'BLUE', base_name_en: 'USS Eisenhower CV-69', site_type: 'naval', lat: null, lon: null, source_type: 'llm_fill', needs_review: true },
        ],
        friendly: { summary: '' }, enemy: { summary: '' }, neutral: {},
    },
    understanding: {
        proposed_unit_counts: { red: 2, blue: 2, neutral: 0 },
        ambiguities: [],
    },
};

// ── T1–T6: reviewed_anchors_only + null-coord bases ──────────────────
(function () {
    console.log('\n§1 reviewed_anchors_only policy — null-coord LLM bases');

    var gen = GEN.generateScenarioFromBrief(LLM_BRIEF, {
        objective: OBJ,
        template: null,
        name: 'beirut_llm_blocked',
        placementPolicy: 'reviewed_anchors_only',
    });

    ok('T1: no requiresObjective (obj supplied)', !gen.requiresObjective);

    var s = gen.scenario;

    // T1: zero placed units for both sides
    ok('T1: red_units is empty array', Array.isArray(s.red_units) && s.red_units.length === 0);
    ok('T1: blue_units_initial is empty array', Array.isArray(s.blue_units_initial) && s.blue_units_initial.length === 0);

    // T2: no unit coord exists (nothing can be near OBJ ring)
    var allUnitCoords = (s.red_units || []).concat(s.blue_units_initial || []).map(function (u) { return u.coord; });
    ok('T2: no placed unit coords at all', allUnitCoords.length === 0);

    // T3: requiresPlacementReview flag
    ok('T3: generation.requiresPlacementReview true', s.generation && s.generation.requiresPlacementReview === true);
    ok('T3: top-level requiresObjective not set', !gen.requiresObjective);

    // T4: missing_fields warnings
    var mf = s.generation && s.generation.missing_fields;
    ok('T4: missing_fields is array', Array.isArray(mf));
    ok('T4: RED placement warning present', mf && mf.some(function (f) {
        return f.indexOf('llm_units_require_geocoded_base_anchor_before_placement (RED)') !== -1;
    }));
    ok('T4: BLUE placement warning present', mf && mf.some(function (f) {
        return f.indexOf('llm_units_require_geocoded_base_anchor_before_placement (BLUE)') !== -1;
    }));

    // T5: placement_sources
    var ps = s.generation && s.generation.placement_sources;
    ok('T5: red placement_source = blocked_no_reviewed_anchor', ps && ps.red === 'blocked_no_reviewed_anchor');
    ok('T5: blue placement_source = blocked_no_reviewed_anchor', ps && ps.blue === 'blocked_no_reviewed_anchor');

    // T6: review_unresolved_candidates has all 3 null-coord bases
    var ruc = s.generation && s.generation.review_unresolved_candidates;
    ok('T6: review_unresolved_candidates is array', Array.isArray(ruc));
    ok('T6: review_unresolved_candidates has 3 items', ruc && ruc.length === 3);
    ok('T6: top-level review_unresolved_candidates mirrors generation', Array.isArray(s.review_unresolved_candidates) && s.review_unresolved_candidates.length === 3);

    // review_proposed_units preserves all 4 LLM units
    var rpu = s.generation && s.generation.review_proposed_units;
    ok('T6: review_proposed_units has 4 items', Array.isArray(rpu) && rpu.length === 4);

    // placed_unit_counts reflect actual placement
    var pc = s.generation && s.generation.placed_unit_counts;
    ok('T6: placed_unit_counts.red = 0', pc && pc.red === 0);
    ok('T6: placed_unit_counts.blue = 0', pc && pc.blue === 0);

    // report.placed also reflects actual placement
    ok('T6: report.placed.red = 0', gen.report && gen.report.placed && gen.report.placed.red === 0);
    ok('T6: report.placed.blue = 0', gen.report && gen.report.placed && gen.report.placed.blue === 0);
    ok('T6: report.requested_unit_counts.red = 2', gen.report && gen.report.requested_unit_counts && gen.report.requested_unit_counts.red === 2);
})();

// ── T7: numeric reviewed anchors still work ──────────────────────────
(function () {
    console.log('\n§2 T7 — numeric anchors still place at base coords');

    var NUMERIC_BRIEF = {
        operational_brief: {
            mission: 'Hold the Strait',
            proposed_units: [
                { side: 'RED',  platform: 'F-14', estimated_count: 2, lat: null, lon: null },
                { side: 'BLUE', platform: 'F/A-18', estimated_count: 2, lat: null, lon: null },
            ],
            placement_candidates: [
                { side: 'RED',  base_name_en: 'Bandar Abbas', lat: 27.22, lon: 56.37, site_type: 'naval' },
                { side: 'BLUE', base_name_en: 'Konarak',      lat: 25.48, lon: 60.38, site_type: 'naval' },
            ],
            friendly: { summary: '' }, enemy: { summary: '' }, neutral: {},
        },
        understanding: { proposed_unit_counts: { red: 2, blue: 2 } },
    };

    var gen = GEN.generateScenarioFromBrief(NUMERIC_BRIEF, {
        objective: { lon: 56.27, lat: 27.10 },
        placementPolicy: 'reviewed_anchors_only',
    });

    ok('T7: no requiresObjective', !gen.requiresObjective);
    var s = gen.scenario;

    ok('T7: red_units placed (2)', s.red_units && s.red_units.length === 2);
    ok('T7: blue_units_initial placed (2)', s.blue_units_initial && s.blue_units_initial.length === 2);

    var ps = s.generation && s.generation.placement_sources;
    ok('T7: red placement_source = reviewed_base_anchor', ps && ps.red === 'reviewed_base_anchor');
    ok('T7: blue placement_source = reviewed_base_anchor', ps && ps.blue === 'reviewed_base_anchor');

    // Coords must be near Bandar Abbas, not near the objective
    var redUnit = s.red_units[0];
    var distFromBandarAbbasLat = Math.abs((redUnit.coord[1] || 0) - 27.22);
    ok('T7: red unit placed near Bandar Abbas (lat within 0.1)', distFromBandarAbbasLat < 0.1);

    // requiresPlacementReview must be false
    ok('T7: requiresPlacementReview false (anchors exist)', s.generation.requiresPlacementReview === false);

    // review_unresolved_candidates is empty (all anchors had coords)
    ok('T7: review_unresolved_candidates empty', Array.isArray(s.generation.review_unresolved_candidates) && s.generation.review_unresolved_candidates.length === 0);
})();

// ── T8: default policy still uses template geometry ──────────────────
(function () {
    console.log('\n§3 T8 — allow_template_fallback (default) still places units via template ring');

    var EMPTY_BRIEF = {
        operational_brief: {
            mission: 'Capture the objective',
            proposed_units: [],
            placement_candidates: [],
            friendly: { summary: '' }, enemy: { summary: '' }, neutral: {},
        },
        understanding: { proposed_unit_counts: { red: 3, blue: 3 } },
    };

    // Default policy (no placementPolicy specified)
    var gen = GEN.generateScenarioFromBrief(EMPTY_BRIEF, {
        objective: OBJ,
    });

    ok('T8: no requiresObjective', !gen.requiresObjective);
    var s = gen.scenario;

    ok('T8: red_units placed (3)', s.red_units && s.red_units.length === 3);
    ok('T8: blue_units_initial placed (3)', s.blue_units_initial && s.blue_units_initial.length === 3);

    var ps = s.generation && s.generation.placement_sources;
    ok('T8: red placement_source = template_geometry_relative_to_objective', ps && ps.red === 'template_geometry_relative_to_objective');
    ok('T8: blue placement_source = template_geometry_relative_to_objective', ps && ps.blue === 'template_geometry_relative_to_objective');

    ok('T8: requiresPlacementReview false (template path)', s.generation.requiresPlacementReview === false);

    // Explicit allow_template_fallback behaves same as default
    var gen2 = GEN.generateScenarioFromBrief(EMPTY_BRIEF, {
        objective: OBJ,
        placementPolicy: 'allow_template_fallback',
    });
    ok('T8: explicit allow_template_fallback also places (3)', gen2.scenario && gen2.scenario.red_units.length === 3);
})();

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
