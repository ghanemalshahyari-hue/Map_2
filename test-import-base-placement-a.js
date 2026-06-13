#!/usr/bin/env node
/*
 * IMPORT-UNITS-BASE-PLACEMENT-FIX-A + RMOOZ-DOC-REVIEW-PERSISTENCE-AND-DEMO-CLEANUP-A
 *
 * Focused, self-contained checks (no server, no scenario execution):
 *   Part B  — Base Status Panel groups a proposed row under the correct anchor
 *             by assigned_base_id EVEN WHEN the base names differ. ID match wins
 *             over name/coord heuristics, and a different base_id is excluded.
 *   Part C/D — brief-to-scenario.js persists review-only anchors + proposed rows
 *             into the generated DRAFT scenario (top-level + generation mirror),
 *             tags draft unit provenance (exact_unit_position:false, placement_source,
 *             draft_template_position), and places reviewed-side units at the
 *             reviewed base anchors (not a ring around the objective).
 *
 * Lives on its own (not folded into test-base-status-panel-a.js) so the matching
 * assertions run against a clean panel — deterministic regardless of suite order.
 */
'use strict';

var path = require('path');

// ───────────────────────── DOM stub (panel render target) ─────────────────────────
var elements = {};
function makeEl(tag) {
    return {
        tagName: tag, id: '', className: '', innerHTML: '', textContent: '',
        children: [], attrs: {}, style: {},
        appendChild: function (el) { this.children.push(el); if (el.id) elements[el.id] = el; return el; },
        setAttribute: function (k, v) { this.attrs[k] = v == null ? '' : String(v); },
        removeAttribute: function (k) { delete this.attrs[k]; },
        hasAttribute: function (k) { return Object.prototype.hasOwnProperty.call(this.attrs, k); },
        addEventListener: function (name, fn) { this['on' + name] = fn; },
        querySelector: function (sel) {
            if (sel === '.bsp-close') return { addEventListener: function () {} };
            return null;
        },
    };
}
global.document = {
    body: makeEl('body'), head: makeEl('head'),
    createElement: makeEl,
    getElementById: function (id) { return elements[id] || null; },
};
global.window = {};
global.window.document = global.document;

require(path.join(__dirname, 'UI_MOdified/client/shell/world-state-db.js'));
require(path.join(__dirname, 'UI_MOdified/client/shell/symbol-db.js'));
require(path.join(__dirname, 'UI_MOdified/client/shell/base-status-panel.js'));

var BasePanel = global.window.RmoozBaseStatusPanel;

var passed = 0, failed = 0;
function ok(label, cond) {
    if (cond) { passed++; console.log('  [PASS] ' + label); }
    else { failed++; console.log('  [FAIL] ' + label); }
}
function near(a, b, eps) { return Math.abs(Number(a) - Number(b)) <= (eps == null ? 0.05 : eps); }

console.log('IMPORT-BASE-PLACEMENT-A — base-id matching + review-anchor persistence');

// ───────────────────────── Part B: base-id matching ─────────────────────────
// Anchor and unit have DIFFERENT base names; only the shared base_id ties them.
// The unit carries assigned_base_id (NOT base_id) and NO coords, so neither the
// name heuristic nor the coord heuristic can connect it — only baseIdMatches can.
var anchor = {
    base_id: 'RX-7', id: 'RX-7', side: 'RED',
    base_name_en: 'Forward Operating Base Alpha', base_name_ar: 'قاعدة ألفا',
    site_type: 'air_base', lat: 33.51, lon: 44.22,
    placement_type: 'base_location_anchor', exact_unit_position: false, needs_review: true,
    source_type: 'ai_candidate_from_external_llm',
    source: { type: 'external_json', file: 'iran_step1.json', confidence: 'low' },
    warnings: ['base_known_exact_unit_position_unknown'],
};
var payload = {
    documents: [{ filename: 'iran_step1.json' }],
    brief: { operational_brief: {
        task_assembly: {}, enemy: { units: [] }, friendly: { units: [] }, courses_of_action: [],
        enemy_bases: [], friendly_trial_bases: [],
        proposed_units: [
            // name mismatch ('Delta Garrison' ≠ anchor name) — must still group by id RX-7
            { side: 'RED', assigned_base_id: 'RX-7', base_name_en: 'Delta Garrison',
              platform: 'T-72 IDMatch', estimated_count: 10, type_ar: 'دبابة',
              needs_review: true, exact_unit_position: false, warnings: ['ai_information_requires_review'] },
            // different base id — must be EXCLUDED from this anchor
            { side: 'RED', assigned_base_id: 'RX-9', base_name_en: 'Echo Lines',
              platform: 'BMP OtherBase', estimated_count: 5, type_ar: 'مركبة',
              needs_review: true, exact_unit_position: false, warnings: ['ai_information_requires_review'] },
        ],
        missing_information: [],
    } },
};

// Scope assertions to the anchor's "Proposed Units" section only — the merged
// base-status panel adds a separate "Unassigned / needs base review" section
// (json-loss-fix), so unmatched units now appear there, not nowhere.
function proposedSection(html) {
    var s = html.indexOf('Proposed Units');
    if (s < 0) return '';
    var rest = html.slice(s);
    var end = rest.indexOf('Unassigned / needs base review');
    if (end < 0) end = rest.indexOf('Capability Summary');
    return end >= 0 ? rest.slice(0, end) : rest;
}
BasePanel.open(anchor, payload);
var panel = elements['step1-base-status-panel'];
ok('opens the anchor panel', !!panel && /Forward Operating Base Alpha/.test(panel.innerHTML));
ok('proposed row groups under anchor by assigned_base_id despite NAME mismatch',
    !!panel && /T-72 IDMatch/.test(proposedSection(panel.innerHTML)));
ok('a row with a DIFFERENT base_id is excluded from the anchor (Proposed Units section)',
    !!panel && !/BMP OtherBase/.test(proposedSection(panel.innerHTML)));
ok('exactly one proposed row under this anchor',
    !!panel && (proposedSection(panel.innerHTML).match(/bsp-u-row/g) || []).length === 1);
ok('grouped row stays review-only / exact_unit_position:false',
    !!panel && /Review only/.test(panel.innerHTML) && /exact_unit_position:false/.test(panel.innerHTML));

// Negative control: SAME unit, no assigned_base_id + non-matching name → must NOT group.
// Proves the id (not some incidental name token) is what bound the row above.
var noIdPayload = {
    documents: [{ filename: 'iran_step1.json' }],
    brief: { operational_brief: {
        task_assembly: {}, enemy: { units: [] }, friendly: { units: [] }, courses_of_action: [],
        enemy_bases: [], friendly_trial_bases: [],
        proposed_units: [
            { side: 'RED', base_name_en: 'Delta Garrison', platform: 'T-72 IDMatch',
              estimated_count: 10, type_ar: 'دبابة', needs_review: true, exact_unit_position: false },
        ],
        missing_information: [],
    } },
};
BasePanel.open(anchor, noIdPayload);
ok('without a matching base id (and mismatched name) the row does NOT group under the anchor',
    !!panel && !/T-72 IDMatch/.test(proposedSection(panel.innerHTML)) &&
    (proposedSection(panel.innerHTML).match(/bsp-u-row/g) || []).length === 0);

// ───────────────────── Part C/D: review-anchor persistence + draft provenance ─────────────────────
var gen = require(path.join(__dirname, 'UI_MOdified/server/ai/brief-to-scenario.js'));

// RED has reviewed base anchors (→ reviewed_base_anchor placement); BLUE has none
// (→ template_geometry_relative_to_objective). One call exercises both branches.
var brief = {
    template: 'attack_objective',
    understanding: { proposed_unit_counts: { red: 3, blue: 2 } },
    operational_brief: {
        mission: 'Seize OBJ X and hold.',
        placement_candidates: [
            { base_id: 'RX-7', id: 'RX-7', side: 'RED', base_name_en: 'FOB Alpha', base_name_ar: 'ألفا',
              country: 'Iran', country_key: 'iran', site_type: 'air_base', base_type: 'air',
              lat: 33.40, lon: 44.10, source_type: 'ai_candidate_from_external_llm' },
            { base_id: 'RX-8', id: 'RX-8', side: 'RED', base_name_en: 'FOB Bravo', base_name_ar: 'برافو',
              country: 'Iran', country_key: 'iran', site_type: 'naval_base', base_type: 'naval',
              lat: 33.30, lon: 44.30, source_type: 'ai_candidate_from_external_llm' },
        ],
        proposed_units: [
            { side: 'RED', assigned_base_id: 'RX-7', base_name_en: 'FOB Alpha', platform: 'T-72', estimated_count: 10, symbol_category: 'ground_armor' },
            { side: 'RED', assigned_base_id: 'RX-8', base_name_en: 'FOB Bravo', platform: 'P-3', estimated_count: 2, symbol_category: 'naval' },
        ],
    },
};
var out = gen.generateScenarioFromBrief(brief, { objective: { lon: 44.20, lat: 33.50, name: 'OBJ X' }, name: 'persist_test' });
var s = out && out.scenario;

ok('generation returns a scenario (objective supplied)', !!s && !out.requiresObjective);

var top = (s && s.review_placement_candidates) || [];
ok('top-level scenario.review_placement_candidates persisted (2 finite anchors)',
    Array.isArray(top) && top.length === 2);
ok('persisted anchors carry base_id + finite lat/lon + review flags',
    top.length === 2 && top.every(function (a) {
        return a.base_id && Number.isFinite(a.lat) && Number.isFinite(a.lon) &&
            a.needs_review === true && a.exact_unit_position === false;
    }));

var genBlk = (s && s.generation) || {};
ok('generation.review_placement_candidates mirrors the top-level layer',
    Array.isArray(genBlk.review_placement_candidates) && genBlk.review_placement_candidates.length === top.length);
ok('generation.review_proposed_units persisted as review-only rows',
    Array.isArray(genBlk.review_proposed_units) && genBlk.review_proposed_units.length === 2 &&
    genBlk.review_proposed_units.every(function (u) { return u.review_only === true && u.exact_unit_position === false; }));
ok('generation.placement_sources reflects reviewed RED anchors + template BLUE',
    genBlk.placement_sources && genBlk.placement_sources.red === 'reviewed_base_anchor' &&
    genBlk.placement_sources.blue === 'template_geometry_relative_to_objective');
ok('generation.exact_unit_position flag is false (draft, never exact)', genBlk.exact_unit_position === false);

var redU = (s && s.red_units) || [];
ok('RED draft units tagged reviewed_base_anchor / exact:false / not template-draft',
    redU.length === 3 && redU.every(function (u) {
        return u.exact_unit_position === false && u.placement_source === 'reviewed_base_anchor' &&
            u.draft_template_position === false && u.needs_review === true;
    }));
ok('RED units are placed AT the reviewed base anchors (not a ring around OBJ X)',
    redU.length && redU.some(function (u) {
        return Array.isArray(u.coord) &&
            ((near(u.coord[0], 44.10) && near(u.coord[1], 33.40)) ||
             (near(u.coord[0], 44.30) && near(u.coord[1], 33.30)));
    }));

var blueU = (s && s.blue_units_initial) || [];
ok('BLUE draft units (no reviewed anchors) tagged template_geometry / draft_template_position:true',
    blueU.length === 2 && blueU.every(function (u) {
        return u.exact_unit_position === false &&
            u.placement_source === 'template_geometry_relative_to_objective' &&
            u.draft_template_position === true;
    }));

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
