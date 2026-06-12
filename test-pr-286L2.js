/**
 * test-pr-286L2.js — PR-286L2: Scenario Folder Catalog and Conversion Plan.
 *
 * This is an audit/documentation PR — no runtime changes.
 * The test verifies:
 *   1. The catalog document exists and contains the required sections.
 *   2. No runtime files were modified.
 *   3. wargame3.json + other protected files unchanged.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const DOC_PATH  = path.join(__dirname,
    'docs/pr-286L2-scenario-folder-catalog-and-conversion-plan.md');
const HTML_PATH = path.join(__dirname, 'UI_MOdified/client/app.html');
const SW_PATH   = path.join(__dirname, 'UI_MOdified/client/shell/scenario-workspace.js');
const I18N_PATH = path.join(__dirname, 'UI_MOdified/client/i18n.js');
const CSS_PATH  = path.join(__dirname, 'UI_MOdified/client/style.css');
const W3_PATH   = path.join(__dirname, 'UI_MOdified/data/scenarios/wargame3.json');
const APP_JS    = path.join(__dirname, 'UI_MOdified/client/app.js');
const ADJ_MAP   = path.join(__dirname, 'UI_MOdified/client/adjudicator-map.js');

let passed = 0, failed = 0;
const results = [];

function check(ok, label, detail) {
    results.push({ ok, label, detail });
    if (ok) passed++; else failed++;
    console.log('  ' + (ok ? '✅' : '❌') + '  ' + label +
                (detail !== undefined ? ' — ' + detail : ''));
}

// ── Section 1: Document exists + key sections present (T1) ────────────────
console.log('\n─── Section 1: Document exists ───');

check(fs.existsSync(DOC_PATH),
      'T01: catalog document exists at expected path');

if (!fs.existsSync(DOC_PATH)) {
    console.log('  Document missing — aborting further tests.');
    process.exit(1);
}

var doc = fs.readFileSync(DOC_PATH, 'utf8');

// ── Section 2: Required content (T2-T16) ──────────────────────────────────
console.log('\n─── Section 2: Required document content ───');

check(/RMOOZ Live Scenario JSON/.test(doc),
      'T02: doc mentions RMOOZ Live Scenario JSON');
check(/Decision Package/.test(doc),
      'T03: doc mentions Decision Package folders');
check(/DP_01_Fictional_Coastal_Corridor/.test(doc),
      'T04: doc mentions DP_01_Fictional_Coastal_Corridor');
check(/DP_02_Desert_Logistics_Route/.test(doc),
      'T05: doc mentions DP_02_Desert_Logistics_Route');
check(/DP_03_Urban_Evacuation_Decision/.test(doc),
      'T06: doc mentions DP_03_Urban_Evacuation_Decision');
check(/Wargame\s*3/i.test(doc),
      'T07: doc mentions Wargame 3');
check(/GeoJSON/i.test(doc),
      'T08: doc mentions GeoJSON');
check(/Command[^\n]*\.scen/i.test(doc) || /\.scen[^\n]*binary/i.test(doc),
      'T09: doc mentions Command .scen');
check(/\.ini[^\n]*weapon[\s_-]?patch/i.test(doc),
      'T10: doc mentions .ini weapon patch');
check(/Lua[^\n]*block/i.test(doc),
      'T11: doc mentions Lua blocked');

// Conversion matrix — look for the table header
check(/##\s+\d+\.\s+Conversion Matrix/i.test(doc) ||
      /Conversion Matrix/i.test(doc),
      'T12: doc has Conversion Matrix section');
// Check that the matrix table has the required column headers
check(/Folder.{0,30}data type/i.test(doc) &&
      /Current RMOOZ handling/i.test(doc) &&
      /Direct live import now/i.test(doc) &&
      /Needs adapter/i.test(doc),
      'T12b: conversion matrix table has required columns');

// Lifecycle routes
check(/Lifecycle/i.test(doc) &&
      /Route\s*1/i.test(doc) &&
      /Route\s*2/i.test(doc) &&
      /Route\s*3/i.test(doc) &&
      /Route\s*4/i.test(doc) &&
      /Route\s*5/i.test(doc),
      'T13: doc has all 5 lifecycle routes');

// Canonical target format
check(/Canonical Target Format/i.test(doc) ||
      /RMOOZ Live Scenario JSON v1/.test(doc),
      'T14: doc has canonical target format section');

// Forbidden fields
check(/Forbidden/i.test(doc) &&
      /scenario_compressed/.test(doc) &&
      /applyNow/.test(doc) &&
      /commitNow/.test(doc) &&
      /executeNow/.test(doc) &&
      /gate7Approved/i.test(doc) &&
      /backendUrl/.test(doc),
      'T15: doc lists forbidden fields (scenario_compressed, applyNow, commitNow, executeNow, gate7Approved, backendUrl)');

// Next PR options
check(/Option A/i.test(doc) && /Option B/i.test(doc) && /Option C/i.test(doc),
      'T16: doc recommends 3 next-PR options (A / B / C)');
check(/PR-286L3/i.test(doc) || /PR-286L3W/i.test(doc),
      'T16b: doc references PR-286L3 and/or PR-286L3W adapter PRs');
check(/PR-287L/i.test(doc),
      'T16c: doc references PR-287L as Option C');

// Adapter priorities
check(/Priority\s*1/i.test(doc) && /Priority\s*2/i.test(doc) &&
      /Priority\s*3/i.test(doc) && /Priority\s*4/i.test(doc) &&
      /Priority\s*5/i.test(doc),
      'T16d: doc lists 5 future adapter priorities');

// ── Section 3: No runtime files changed by this PR (T17-T20) ──────────────
console.log('\n─── Section 3: No runtime files changed ───');

// "Unchanged" = the file does not mention this PR id (we never added PR-286L2 markers).
function fileMentionsPR(p, prId) {
    if (!fs.existsSync(p)) return false;
    return fs.readFileSync(p, 'utf8').indexOf(prId) >= 0;
}

check(!fileMentionsPR(HTML_PATH, 'PR-286L2'),
      'T17a: app.html not modified by PR-286L2 (no PR-286L2 marker)');
check(!fileMentionsPR(SW_PATH, 'PR-286L2'),
      'T17b: scenario-workspace.js not modified by PR-286L2');
check(!fileMentionsPR(I18N_PATH, 'PR-286L2'),
      'T18: i18n.js not modified by PR-286L2');
check(!fileMentionsPR(CSS_PATH, 'PR-286L2'),
      'T19: style.css not modified by PR-286L2');

// Backend / scenario data files
check(!fileMentionsPR(APP_JS, 'PR-286L2'),
      'T19b: app.js not modified by PR-286L2');
check(!fileMentionsPR(ADJ_MAP, 'PR-286L2'),
      'T19c: adjudicator-map.js not modified by PR-286L2');

// T20: wargame3.json unchanged (verified by counting expected unit rosters)
if (fs.existsSync(W3_PATH)) {
    var w3 = JSON.parse(fs.readFileSync(W3_PATH, 'utf8'));
    check(Array.isArray(w3.red_units) && w3.red_units.length === 70 &&
          Array.isArray(w3.blue_units_initial) && w3.blue_units_initial.length === 83,
          'T20: wargame3.json unchanged (70 red + 83 blue)');
}

// ── Extras ────────────────────────────────────────────────────────────────
console.log('\n─── Extras ───');

// Doc must mention External Scenario Catalog
check(/External Scenario Catalog/.test(doc),
      'Extra-01: doc mentions External Scenario Catalog');

// Doc must mention CommunityScenarioPack51
check(/CommunityScenarioPack51/.test(doc),
      'Extra-02: doc references CommunityScenarioPack51 corpus');

// Doc must mention all 5 decision-options aliases
[
    'decision_options', 'decisionOptions', 'options', 'coa_options', 'coaOptions'
].forEach(function(alias, i) {
    check(doc.indexOf(alias) >= 0,
          'Extra-03.' + (i + 1) + ': doc mentions step decision-options alias "' + alias + '"');
});

// Doc must declare 0 of 17 W3 steps have decision options
check(/0\s+of\s+17/i.test(doc) ||
      /no.{0,10}decision[\s_-]?option/i.test(doc),
      'Extra-04: doc documents that wargame3 has no decision_options on any step');

// Doc must mention validateLiveScenarioJson + loadLiveScenarioFromJson
check(/validateLiveScenarioJson/.test(doc) && /loadLiveScenarioFromJson/.test(doc),
      'Extra-05: doc references the canonical entry points');

// Doc must declare the live import card is primary (per PR-286L1A consolidation)
check(/Advanced[\s\/]+Developer Imports/i.test(doc) ||
      /Advanced \/ Developer Imports/.test(doc),
      'Extra-06: doc reflects PR-286L1A primary/advanced split');

// Doc must NOT promote a new button or UI element
var FORBIDDEN_NEW_UI = [
    'Add a button', 'Add a card', 'new UI', 'new button'
];
var foundNewUiPromise = FORBIDDEN_NEW_UI.some(function(p) {
    var idx = doc.indexOf(p);
    if (idx < 0) return false;
    // Allow within a "do NOT add" disclaimer.
    var contextStart = Math.max(0, idx - 100);
    var ctx = doc.slice(contextStart, idx + p.length);
    return !/(don't|do not|never|no |does not|❌)/i.test(ctx);
});
check(!foundNewUiPromise,
      'Extra-07: doc does NOT promise new UI surface (audit only)');

// Doc must reference _LIVE_IMPORT_UNSAFE_KEYS
check(/_LIVE_IMPORT_UNSAFE_KEYS/.test(doc),
      'Extra-08: doc references _LIVE_IMPORT_UNSAFE_KEYS blacklist');

// ── Final ─────────────────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(65));
console.log('  PR-286L2 Test Results');
console.log('═'.repeat(65));
console.log('  Passed: ' + passed + '  |  Failed: ' + failed);
console.log('═'.repeat(65));
console.log('\n  Verdict: ' + (failed === 0 ? 'PASS' : 'FAIL'));
console.log('  Document: ' + DOC_PATH);

process.exit(failed === 0 ? 0 : 1);
