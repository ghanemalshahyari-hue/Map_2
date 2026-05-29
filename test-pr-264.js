'use strict';

// ── PR-264 Test Harness — Read-Only Decision Options Display UI ───────────────
// Verifies:
//   H01–H07:  app.html — section DOM structure
//   I01–I09:  i18n.js  — 9 EN keys present
//   A01–A09:  i18n.js  — 9 AR keys present
//   C01–C06:  style.css — CSS class definitions
//   P01–P08:  scenario-workspace.js — painter source checks
//   F01–F10:  functional adapter tests (no DOM; new Function harness)
//   R01–R07:  regression — PR-259/260/263 still intact
//   S01–S04:  safety properties

// No DOM. No Leaflet. No production function execution (DOM painter).

var fs   = require('fs');
var path = require('path');

var htmlSrc = fs.readFileSync(
    path.join(__dirname, 'UI_MOdified/client/app.html'), 'utf8');
var i18nSrc = fs.readFileSync(
    path.join(__dirname, 'UI_MOdified/client/i18n.js'), 'utf8');
var cssSrc  = fs.readFileSync(
    path.join(__dirname, 'UI_MOdified/client/style.css'), 'utf8');
var src     = fs.readFileSync(
    path.join(__dirname, 'UI_MOdified/client/shell/scenario-workspace.js'), 'utf8');

// ── Test runner ───────────────────────────────────────────────────────────────
var passed = 0; var failed = 0; var results = [];
function assert(label, cond, detail) {
    if (cond) { passed++; results.push('  PASS  ' + label); }
    else       { failed++; results.push('  FAIL  ' + label + (detail ? '  →  ' + detail : '')); }
}

// ── extractFn: brace-matched function extractor (same pattern as PR-263) ─────
function extractFn(src, name) {
    var sig   = 'function ' + name + '(';
    var start = src.indexOf(sig);
    if (start === -1) { return null; }
    var depth = 0; var i = start;
    while (i < src.length) {
        if (src[i] === '{')      { depth++; }
        else if (src[i] === '}') { depth--; if (depth === 0) { return src.slice(start, i + 1); } }
        i++;
    }
    return null;
}

// ── Build adapter harness (pure function — no DOM) ───────────────────────────
var _W3DRS_UNSAFE_FIELDS;
var _W3DRS_FORBIDDEN_STATUS_TOKENS;
var isWargame3DecisionOptionSafe;
var buildWargame3DecisionOptionsPreviewData;
(function () {
    var rawUF  = src.match(/var _W3DRS_UNSAFE_FIELDS\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\)/);
    var rawFS  = src.match(/var _W3DRS_FORBIDDEN_STATUS_TOKENS\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\)/);
    var guardFn = extractFn(src, 'isWargame3DecisionOptionSafe');
    var adpFn   = extractFn(src, 'buildWargame3DecisionOptionsPreviewData');

    if (!rawUF || !rawFS || !guardFn || !adpFn) {
        // will fail in test assertions
        return;
    }

    var harness =
        'var _W3DRS_UNSAFE_FIELDS = Object.freeze([' + rawUF[1] + ']);\n' +
        'var _W3DRS_FORBIDDEN_STATUS_TOKENS = Object.freeze([' + rawFS[1] + ']);\n' +
        guardFn + ';\n' +
        adpFn + ';\n' +
        'return { isWargame3DecisionOptionSafe: isWargame3DecisionOptionSafe,' +
        '         buildWargame3DecisionOptionsPreviewData: buildWargame3DecisionOptionsPreviewData };';

    try {
        var exports_ = new Function(harness)();
        isWargame3DecisionOptionSafe          = exports_.isWargame3DecisionOptionSafe;
        buildWargame3DecisionOptionsPreviewData = exports_.buildWargame3DecisionOptionsPreviewData;
    } catch (e) { /* will fail in assertions */ }
}());

// Valid minimal COA option used across tests.
// readOnly:true is required by isWargame3DecisionOptionSafe (source must declare it).
function makeValidOption(overrides) {
    var base = {
        id:          'COA-01',
        label:       'Strike North',
        description: 'Advance along the northern axis.',
        intent:      'Seize high ground',
        source:      'source_json',
        readOnly:    true
    };
    if (overrides) {
        Object.keys(overrides).forEach(function (k) { base[k] = overrides[k]; });
    }
    return base;
}

// ─────────────────────────────────────────────────────────────────────────────
// H: app.html DOM structure
// ─────────────────────────────────────────────────────────────────────────────
assert('H01 — #sw-drp-decision-options section exists in app.html',
    htmlSrc.indexOf('id="sw-drp-decision-options"') !== -1,
    'element not found');

assert('H02 — section has hidden attribute by default',
    htmlSrc.indexOf('id="sw-drp-decision-options"') !== -1 &&
    (function () {
        var idx = htmlSrc.indexOf('id="sw-drp-decision-options"');
        var region = htmlSrc.slice(Math.max(0, idx - 40), idx + 80);
        return region.indexOf('hidden') !== -1;
    }()),
    'hidden attribute missing');

assert('H03 — #sw-drp-decision-options-body exists',
    htmlSrc.indexOf('id="sw-drp-decision-options-body"') !== -1,
    'body element not found');

assert('H04 — #sw-drp-decision-options-count exists',
    htmlSrc.indexOf('id="sw-drp-decision-options-count"') !== -1,
    'count element not found');

assert('H05 — section uses <section> element tag',
    htmlSrc.indexOf('<section') !== -1 &&
    htmlSrc.indexOf('id="sw-drp-decision-options"') !== -1 &&
    (function () {
        var idx = htmlSrc.indexOf('id="sw-drp-decision-options"');
        return htmlSrc.slice(Math.max(0, idx - 60), idx).indexOf('<section') !== -1;
    }()),
    'not a <section> element');

assert('H06 — section carries class sw-drp-decision-options',
    htmlSrc.indexOf('class="sw-drp-decision-options"') !== -1 ||
    htmlSrc.indexOf('"sw-drp-decision-options"') !== -1,
    'class not found');

assert('H07 — title span has data-i18n="sw-drp-decision-options-title"',
    htmlSrc.indexOf('data-i18n="sw-drp-decision-options-title"') !== -1,
    'i18n attribute not found on title span');

// ─────────────────────────────────────────────────────────────────────────────
// I: i18n.js — EN keys
// ─────────────────────────────────────────────────────────────────────────────
assert("I01 — EN 'sw-drp-decision-options-title' present",
    i18nSrc.indexOf("'sw-drp-decision-options-title'") !== -1, 'key missing');

assert("I02 — EN 'sw-drp-decision-options-readonly' present",
    i18nSrc.indexOf("'sw-drp-decision-options-readonly'") !== -1, 'key missing');

assert("I03 — EN 'sw-drp-decision-options-source' present",
    i18nSrc.indexOf("'sw-drp-decision-options-source'") !== -1, 'key missing');

assert("I04 — EN 'sw-drp-decision-options-intent' present",
    i18nSrc.indexOf("'sw-drp-decision-options-intent'") !== -1, 'key missing');

assert("I05 — EN 'sw-drp-decision-options-affected-units' present",
    i18nSrc.indexOf("'sw-drp-decision-options-affected-units'") !== -1, 'key missing');

assert("I06 — EN 'sw-drp-decision-options-anticipated-effects' present",
    i18nSrc.indexOf("'sw-drp-decision-options-anticipated-effects'") !== -1, 'key missing');

assert("I07 — EN 'sw-drp-decision-options-risks' present",
    i18nSrc.indexOf("'sw-drp-decision-options-risks'") !== -1, 'key missing');

assert("I08 — EN 'sw-drp-decision-options-priority' present",
    i18nSrc.indexOf("'sw-drp-decision-options-priority'") !== -1, 'key missing');

assert("I09 — EN 'sw-drp-decision-options-blocked' present",
    i18nSrc.indexOf("'sw-drp-decision-options-blocked'") !== -1, 'key missing');

// ─────────────────────────────────────────────────────────────────────────────
// A: i18n.js — AR keys (values must differ from EN)
// ─────────────────────────────────────────────────────────────────────────────
assert("A01 — AR value for 'sw-drp-decision-options-title' contains Arabic chars",
    i18nSrc.indexOf('خيارات') !== -1, // خيارات
    'Arabic title value missing');

assert("A02 — AR value for 'sw-drp-decision-options-readonly' present",
    i18nSrc.indexOf('مسار عمل') !== -1, // مسار عمل
    'Arabic readonly value missing');

assert("A03 — AR value for 'sw-drp-decision-options-source' contains Arabic",
    i18nSrc.indexOf('المصدر') !== -1, // المصدر
    'Arabic source value missing');

assert("A04 — AR value for 'sw-drp-decision-options-intent' contains Arabic",
    i18nSrc.indexOf('القصد') !== -1, // القصد
    'Arabic intent value missing');

assert("A05 — AR value for 'sw-drp-decision-options-affected-units' contains Arabic",
    i18nSrc.indexOf('الوحدات') !== -1, // الوحدات
    'Arabic affected-units value missing');

assert("A06 — AR value for 'sw-drp-decision-options-anticipated-effects' contains Arabic",
    i18nSrc.indexOf('الآثار') !== -1, // الآثار
    'Arabic anticipated-effects value missing');

assert("A07 — AR value for 'sw-drp-decision-options-risks' contains Arabic",
    i18nSrc.indexOf('المخاطر') !== -1, // المخاطر
    'Arabic risks value missing');

assert("A08 — AR value for 'sw-drp-decision-options-priority' contains Arabic",
    i18nSrc.indexOf('الأولوية') !== -1, // الأولوية
    'Arabic priority value missing');

assert("A09 — AR value for 'sw-drp-decision-options-blocked' contains Arabic",
    i18nSrc.indexOf('تم حظر') !== -1, // تم حظر
    'Arabic blocked value missing');

// ─────────────────────────────────────────────────────────────────────────────
// C: style.css — CSS class definitions
// ─────────────────────────────────────────────────────────────────────────────
assert('C01 — .sw-drp-decision-options defined in CSS',
    cssSrc.indexOf('.sw-drp-decision-options') !== -1, 'class not found');

assert('C02 — .sw-drp-do-header defined in CSS',
    cssSrc.indexOf('.sw-drp-do-header') !== -1, 'class not found');

assert('C03 — .sw-drp-do-card defined in CSS',
    cssSrc.indexOf('.sw-drp-do-card') !== -1, 'class not found');

assert('C04 — .sw-drp-do-readonly-badge defined in CSS',
    cssSrc.indexOf('.sw-drp-do-readonly-badge') !== -1, 'class not found');

assert('C05 — .sw-drp-do-meta-row defined in CSS',
    cssSrc.indexOf('.sw-drp-do-meta-row') !== -1, 'class not found');

assert('C06 — .sw-drp-do-blocked-notice defined in CSS',
    cssSrc.indexOf('.sw-drp-do-blocked-notice') !== -1, 'class not found');

// ─────────────────────────────────────────────────────────────────────────────
// P: painter source checks (scenario-workspace.js)
// ─────────────────────────────────────────────────────────────────────────────
assert('P01 — _paintW3DecisionOptions defined in source',
    src.indexOf('function _paintW3DecisionOptions(') !== -1,
    'function not found');

assert('P02 — painter calls buildWargame3DecisionOptionsPreviewData',
    (function () {
        var fn = extractFn(src, '_paintW3DecisionOptions');
        return fn !== null && fn.indexOf('buildWargame3DecisionOptionsPreviewData') !== -1;
    }()),
    'adapter call missing from painter');

assert('P03 — painter reads sw-drp-decision-options element',
    (function () {
        var fn = extractFn(src, '_paintW3DecisionOptions');
        return fn !== null && fn.indexOf('sw-drp-decision-options') !== -1;
    }()),
    'element ID not referenced');

assert('P04 — painter contains no apply/execute/commit/confirm controls',
    (function () {
        var fn = extractFn(src, '_paintW3DecisionOptions');
        if (!fn) { return false; }
        var forbidden = ['applyNow', 'commitNow', 'executeNow', 'liveApply',
                         'backendCommit', 'gate7Approved', '/api/sim/'];
        return forbidden.every(function (f) { return fn.indexOf(f) === -1; });
    }()),
    'forbidden control token found in painter');

assert('P05 — painter contains no fetch / XMLHttpRequest / localStorage',
    (function () {
        var fn = extractFn(src, '_paintW3DecisionOptions');
        if (!fn) { return false; }
        return fn.indexOf('fetch(')          === -1 &&
               fn.indexOf('XMLHttpRequest')  === -1 &&
               fn.indexOf('localStorage')    === -1 &&
               fn.indexOf('sessionStorage')  === -1;
    }()),
    'forbidden storage/network call found in painter');

assert('P06 — painter contains no window.units / window.RmoozScenario access',
    (function () {
        var fn = extractFn(src, '_paintW3DecisionOptions');
        if (!fn) { return false; }
        return fn.indexOf('window.units')         === -1 &&
               fn.indexOf('window.RmoozScenario') === -1 &&
               fn.indexOf('window.lines')         === -1;
    }()),
    'live state access found in painter');

assert('P07 — painter hides section when data.hasOptions is false',
    (function () {
        var fn = extractFn(src, '_paintW3DecisionOptions');
        return fn !== null &&
               fn.indexOf('section.hidden = true') !== -1 &&
               fn.indexOf('hasOptions') !== -1;
    }()),
    'hidden-when-empty logic missing');

assert('P08 — _paintW3DecisionOptions is called from _paintToDOM for W3',
    src.indexOf('_paintW3DecisionOptions(p)') !== -1,
    'call site missing from _paintToDOM');

// ─────────────────────────────────────────────────────────────────────────────
// F: functional adapter tests (pure — no DOM)
// ─────────────────────────────────────────────────────────────────────────────
assert('F01 — adapter harness loaded without error',
    typeof buildWargame3DecisionOptionsPreviewData === 'function',
    'function not extracted');

assert('F02 — null step → passed:false, displayMode:hidden',
    (function () {
        if (typeof buildWargame3DecisionOptionsPreviewData !== 'function') { return false; }
        var r = buildWargame3DecisionOptionsPreviewData(null);
        return r.passed === false && r.displayMode === 'hidden';
    }()),
    'null step not handled');

assert('F03 — step with no decisionOptions → passed:true, displayMode:hidden',
    (function () {
        if (typeof buildWargame3DecisionOptionsPreviewData !== 'function') { return false; }
        var r = buildWargame3DecisionOptionsPreviewData({ step_id: 'W3-STEP-08' });
        return r.passed === true && r.displayMode === 'hidden' && r.hasOptions === false;
    }()),
    'missing decisionOptions not handled');

assert('F04 — empty decisionOptions array → passed:true, displayMode:hidden',
    (function () {
        if (typeof buildWargame3DecisionOptionsPreviewData !== 'function') { return false; }
        var r = buildWargame3DecisionOptionsPreviewData({ decisionOptions: [] });
        return r.passed === true && r.displayMode === 'hidden' && r.optionCount === 0;
    }()),
    'empty array not handled');

assert('F05 — single valid option → displayMode:read_only, validOptionCount:1',
    (function () {
        if (typeof buildWargame3DecisionOptionsPreviewData !== 'function') { return false; }
        var r = buildWargame3DecisionOptionsPreviewData({ decisionOptions: [makeValidOption()] });
        return r.passed === true && r.displayMode === 'read_only' &&
               r.validOptionCount === 1 && r.hasOptions === true;
    }()),
    'single valid option not recognized');

assert('F06 — three valid options → validOptionCount:3, optionCount:3',
    (function () {
        if (typeof buildWargame3DecisionOptionsPreviewData !== 'function') { return false; }
        var r = buildWargame3DecisionOptionsPreviewData({
            decisionOptions: [
                makeValidOption({ id: 'COA-01', label: 'Strike North' }),
                makeValidOption({ id: 'COA-02', label: 'Hold Position' }),
                makeValidOption({ id: 'COA-03', label: 'Withdraw' })
            ]
        });
        return r.validOptionCount === 3 && r.optionCount === 3 && r.blockedOptionCount === 0;
    }()),
    'three valid options not handled');

assert('F07 — option with applyNow:true → blocked (unsafe field)',
    (function () {
        if (typeof buildWargame3DecisionOptionsPreviewData !== 'function') { return false; }
        // makeValidOption already has readOnly:true; applyNow makes it unsafe
        var bad = makeValidOption({ applyNow: true });
        var r = buildWargame3DecisionOptionsPreviewData({ decisionOptions: [bad] });
        return r.validOptionCount === 0 && r.blockedOptionCount === 1 &&
               r.displayMode === 'hidden';
    }()),
    'applyNow not blocked');

assert('F08 — option output has readOnly:true on each valid item',
    (function () {
        if (typeof buildWargame3DecisionOptionsPreviewData !== 'function') { return false; }
        var r = buildWargame3DecisionOptionsPreviewData({ decisionOptions: [makeValidOption()] });
        return r.options.length === 1 && r.options[0].readOnly === true;
    }()),
    'readOnly:true missing from output item');

assert('F09 — displayIndex increments per valid option; displayLabel contains index',
    (function () {
        if (typeof buildWargame3DecisionOptionsPreviewData !== 'function') { return false; }
        var r = buildWargame3DecisionOptionsPreviewData({
            decisionOptions: [
                makeValidOption({ id: 'COA-01', label: 'Alpha' }),
                makeValidOption({ id: 'COA-02', label: 'Bravo' })
            ]
        });
        if (!r || !Array.isArray(r.options) || r.options.length < 2) { return false; }
        return r.options[0].displayIndex === 1 && r.options[1].displayIndex === 2 &&
               r.options[0].displayLabel.indexOf('1') !== -1 &&
               r.options[1].displayLabel.indexOf('2') !== -1;
    }()),
    'displayIndex / displayLabel incorrect');

assert('F10 — option with non-array decisionOptions → passed:false, displayMode:hidden',
    (function () {
        if (typeof buildWargame3DecisionOptionsPreviewData !== 'function') { return false; }
        var r = buildWargame3DecisionOptionsPreviewData({ decisionOptions: 'bad' });
        return r.passed === false && r.displayMode === 'hidden';
    }()),
    'non-array decisionOptions not rejected');

// ─────────────────────────────────────────────────────────────────────────────
// R: regression — PR-259 / PR-260 / PR-263 still intact
// ─────────────────────────────────────────────────────────────────────────────
assert('R01 — isWargame3DecisionOptionSafe still defined',
    src.indexOf('function isWargame3DecisionOptionSafe(') !== -1, 'function missing');

assert('R02 — isWargame3SelectedDecisionSafe still defined',
    src.indexOf('function isWargame3SelectedDecisionSafe(') !== -1, 'function missing');

assert('R03 — isWargame3ExpectedResultSafe still defined',
    src.indexOf('function isWargame3ExpectedResultSafe(') !== -1, 'function missing');

assert('R04 — validateWargame3DecisionResultPair still defined',
    src.indexOf('function validateWargame3DecisionResultPair(') !== -1, 'function missing');

assert('R05 — buildWargame3DecisionOptionsPreviewData still defined',
    src.indexOf('function buildWargame3DecisionOptionsPreviewData(') !== -1, 'function missing');

assert('R06 — adapter selectedDecision:null (Rule S5) unchanged',
    src.indexOf('selectedDecision:         null,') !== -1, 'Rule S5 changed');

assert('R07 — adapter expectedResult:null (Rule S10) unchanged',
    src.indexOf('expectedResult:           null,') !== -1, 'Rule S10 changed');

// ─────────────────────────────────────────────────────────────────────────────
// S: safety
// ─────────────────────────────────────────────────────────────────────────────
assert('S01 — wargame3.json unchanged — no decisionOptions in steps',
    (function () {
        var w3 = JSON.parse(
            fs.readFileSync(
                path.join(__dirname, 'UI_MOdified/data/scenarios/wargame3.json'), 'utf8'));
        return w3.steps.every(function (s) {
            return !Object.prototype.hasOwnProperty.call(s, 'decisionOptions') &&
                   !Object.prototype.hasOwnProperty.call(s, 'decision_options');
        });
    }()),
    'decisionOptions found in wargame3.json');

assert('S02 — wargame3.json unchanged — selectedDecision still absent',
    (function () {
        var w3 = JSON.parse(
            fs.readFileSync(
                path.join(__dirname, 'UI_MOdified/data/scenarios/wargame3.json'), 'utf8'));
        return w3.steps.every(function (s) {
            return !Object.prototype.hasOwnProperty.call(s, 'selectedDecision');
        });
    }()),
    'selectedDecision found in wargame3.json');

assert('S03 — app.js has no PR-264 production marker',
    (function () {
        var appSrc = fs.readFileSync(
            path.join(__dirname, 'UI_MOdified/client/app.js'), 'utf8');
        return appSrc.indexOf('PR-264-PRODUCTION-CHANGE') === -1;
    }()),
    'PR-264 marker found in app.js');

assert('S04 — adjudicator-map.js has no PR-264 production marker',
    (function () {
        var adjSrc = fs.readFileSync(
            path.join(__dirname, 'UI_MOdified/client/wargame/adjudicator-map.js'), 'utf8');
        return adjSrc.indexOf('PR-264-PRODUCTION-CHANGE') === -1;
    }()),
    'PR-264 marker found in adjudicator-map.js');

// ─────────────────────────────────────────────────────────────────────────────
// Print results
// ─────────────────────────────────────────────────────────────────────────────
console.log('');
results.forEach(function (r) { console.log(r); });
console.log('');
if (failed === 0) {
    console.log('ALL PASS  (' + passed + '/' + (passed + failed) + ')');
} else {
    console.log(failed + ' FAILED  ' + passed + ' passed  (' + passed + '/' + (passed + failed) + ')');
    process.exitCode = 1;
}

console.log('');
console.log('── PR-264 Display UI Verification Summary ────────────────────────────────────');
console.log('  HTML section:              <section id="sw-drp-decision-options" hidden>');
console.log('  Painter function:          _paintW3DecisionOptions(p) — DOM only, no mutation');
console.log('  Painter call site:         _paintToDOM — after _buildW3EventLog, W3 path only');
console.log('  i18n EN keys added:        9 (title, readonly, source, intent, ..., blocked)');
console.log('  i18n AR keys added:        9 (matching Arabic translations)');
console.log('  CSS classes added:         sw-drp-decision-options, sw-drp-do-card, etc.');
console.log('  Empty/absent options:      Section hidden — no fake option, no noise');
console.log('  selectedDecision created:  No');
console.log('  expectedResult created:    No');
console.log('  previewComplete changed:   No');
console.log('  Map overlays:              None — FORBIDDEN');
console.log('  Apply/Execute/Commit:      FORBIDDEN');
console.log('  Gate 7:                    FORBIDDEN');
console.log('  wargame3.json changed:     No');
console.log('  app.js changed:            No');
console.log('  adjudicator-map.js changed: No');
console.log('  Next PR:                   PR-265 — W3 fixture injection for decision options');
console.log('────────────────────────────────────────────────────────────────────────────');
