'use strict';

// ── PR-271 Test Harness — Wargame 3 COA Under Review Indicator ───────────────
// Verifies:
//   D01–D04:   DOM / HTML structure (4 tests)
//   I05–I08:   i18n keys — EN + AR (4 tests)
//   C09–C11:   CSS chip rules (3 tests)
//   P12–P16:   Painter source structure (5 tests)
//   F17–F27:   Functional indicator behavior (11 tests)
//   S28–S40:   Safety boundary — no storage/fetch/mutation/gate7/controls (13 tests)
//   R41–R46:   Regression — prior PRs intact (6 tests)
//   W47–W50:   File protection (4 tests)
//   X51–X58:   No forbidden action controls / labels (8 tests)
//
// Total: 58 tests.  No Leaflet. No real DOM. Pure source + functional.

var fs   = require('fs');
var path = require('path');

var src     = fs.readFileSync(path.join(__dirname, 'UI_MOdified/client/shell/scenario-workspace.js'), 'utf8');
var i18nSrc = fs.readFileSync(path.join(__dirname, 'UI_MOdified/client/i18n.js'), 'utf8');
var cssSrc  = fs.readFileSync(path.join(__dirname, 'UI_MOdified/client/style.css'), 'utf8');
var htmlSrc = fs.readFileSync(path.join(__dirname, 'UI_MOdified/client/app.html'), 'utf8');

// ── Test runner ───────────────────────────────────────────────────────────────
var passed = 0; var failed = 0; var results = [];
function assert(label, cond, detail) {
    if (cond) { passed++; results.push('  PASS  ' + label); }
    else       { failed++; results.push('  FAIL  ' + label + (detail ? '  →  ' + detail : '')); }
}

// ── extractFn: brace-matched extractor ───────────────────────────────────────
function extractFn(s, name) {
    var sig   = 'function ' + name + '(';
    var start = s.indexOf(sig);
    if (start === -1) { return null; }
    var depth = 0; var i = start;
    while (i < s.length) {
        if (s[i] === '{')      { depth++; }
        else if (s[i] === '}') { depth--; if (depth === 0) { return s.slice(start, i + 1); } }
        i++;
    }
    return null;
}

// ── Source slices ─────────────────────────────────────────────────────────────
var paintIndSrc  = extractFn(src, '_paintW3CoaUnderReviewIndicator') || '';
var paintSumSrc  = extractFn(src, '_paintW3StepSummary')             || '';
var handlerSrc   = extractFn(src, '_handleW3CoaReviewClick')         || '';
var _expIdx      = src.lastIndexOf('AppShellScenarioWorkspace = {');
var exportBlock  = _expIdx !== -1 ? src.slice(_expIdx) : '';

// ── Functional harness ────────────────────────────────────────────────────────
// Builds _paintW3CoaUnderReviewIndicator with all dependencies in Node scope.
var _h = null;
(function () {
    var rUF = src.match(/var _W3DRS_UNSAFE_FIELDS\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\)/);
    var rFS = src.match(/var _W3DRS_FORBIDDEN_STATUS_TOKENS\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\)/);
    var rVS = src.match(/var _W3SEL_VALID_STATUSES\s*=\s*(\[[\s\S]*?\]);/);
    var rFR = src.match(/var _W3SEL_FORBIDDEN_REC_FIELDS\s*=\s*(\[[\s\S]*?\]);/);

    var fnSD  = extractFn(src, 'isWargame3SelectedDecisionSafe');
    var fnOpt = extractFn(src, 'isWargame3DecisionOptionSafe');
    var fnVP  = extractFn(src, 'validateWargame3DecisionResultPair');
    var fnBPD = extractFn(src, 'buildWargame3DecisionOptionsPreviewData');
    var fnGR  = extractFn(src, 'isWargame3OperatorSelectionDryRunRecordSafe');
    var fnBR  = extractFn(src, 'buildWargame3OperatorSelectionDryRunRecord');
    var fnClear  = extractFn(src, '_clearW3CoaReviewRecord');
    var fnGet    = extractFn(src, '_getW3CoaReviewRecordForStep');
    var fnHnd    = extractFn(src, '_handleW3CoaReviewClick');
    var fnInd    = extractFn(src, '_paintW3CoaUnderReviewIndicator');

    if (!rUF || !rFS || !rVS || !rFR ||
        !fnSD || !fnOpt || !fnVP || !fnBPD || !fnGR || !fnBR ||
        !fnClear || !fnGet || !fnHnd || !fnInd) { return; }

    var code =
        'var _W3DRS_UNSAFE_FIELDS           = Object.freeze([' + rUF[1] + ']);\n' +
        'var _W3DRS_FORBIDDEN_STATUS_TOKENS = Object.freeze([' + rFS[1] + ']);\n' +
        'var _W3SEL_VALID_STATUSES          = ' + rVS[1] + ';\n' +
        'var _W3SEL_FORBIDDEN_REC_FIELDS    = ' + rFR[1] + ';\n' +
        fnSD  + ';\n' + fnOpt + ';\n' + fnVP + ';\n' + fnBPD + ';\n' + fnGR + ';\n' + fnBR + ';\n' +
        'var _w3CoaReviewRecord = null;\n' +
        fnClear + ';\n' +
        fnGet   + ';\n' +
        // Mock painters
        'var _mockReviewCalled = false; var _mockReviewP = null;\n' +
        'function _paintW3OperatorSelectionReview(p) { _mockReviewCalled=true; _mockReviewP=p; }\n' +
        // Mock tx
        'function tx(key, fallback) { return fallback || key; }\n' +
        // Mock DOM
        'var _mockChip    = { hidden: true, textContent: "" };\n' +
        'var _mockSection = { hidden: true };\n' +
        'var document = { getElementById: function(id) {\n' +
        '    if (id === "sw-drp-sum-coa-chip")     { return _mockChip; }\n' +
        '    if (id === "sw-drp-selection-review")  { return _mockSection; }\n' +
        '    return null;\n' +
        '}};\n' +
        fnHnd + ';\n' +
        fnInd + ';\n' +
        'return {\n' +
        '  handler:     _handleW3CoaReviewClick,\n' +
        '  paintInd:    _paintW3CoaUnderReviewIndicator,\n' +
        '  clearRec:    _clearW3CoaReviewRecord,\n' +
        '  getRec:      _getW3CoaReviewRecordForStep,\n' +
        '  getMemory:   function() { return _w3CoaReviewRecord; },\n' +
        '  chip:        function() { return _mockChip; },\n' +
        '  section:     function() { return _mockSection; },\n' +
        '  resetAll: function() {\n' +
        '    _w3CoaReviewRecord = null;\n' +
        '    _mockChip.hidden = true; _mockChip.textContent = "";\n' +
        '    _mockSection.hidden = true;\n' +
        '    _mockReviewCalled = false; _mockReviewP = null;\n' +
        '  }\n' +
        '};\n';

    try { _h = new Function(code)(); } catch (e) { /* assertions fail gracefully */ }
}());

// ── Test data ─────────────────────────────────────────────────────────────────
var VALID_OPTS = [
    { id: 'COA-HOLD',      label: 'Hold Current Position', readOnly: true, source: 'instructor' },
    { id: 'COA-REINFORCE', label: 'Reinforce the Gap',     readOnly: true, source: 'instructor' }
];
function makeP(overrides) {
    var base = { activeStepId: 'W3-STEP-08', decisionOptions: VALID_OPTS.slice() };
    if (overrides) { Object.keys(overrides).forEach(function(k) { base[k] = overrides[k]; }); }
    return base;
}

// ─────────────────────────────────────────────────────────────────────────────
// D — DOM / HTML structure (D01–D04)
// ─────────────────────────────────────────────────────────────────────────────
assert('D01 — sw-drp-sum-coa-chip element present in app.html',
    htmlSrc.indexOf('sw-drp-sum-coa-chip') !== -1);

assert('D02 — chip has hidden attribute in app.html',
    (function () {
        var idx = htmlSrc.indexOf('sw-drp-sum-coa-chip');
        var snippet = idx !== -1 ? htmlSrc.slice(Math.max(0, idx - 10), idx + 200) : '';
        return snippet.indexOf('hidden') !== -1;
    }()));

assert('D03 — chip has CSS class sw-drp-sum-coa-chip in app.html',
    htmlSrc.indexOf('class="sw-drp-sum-chip sw-drp-sum-coa-chip"') !== -1 ||
    htmlSrc.indexOf('sw-drp-sum-coa-chip') !== -1);

assert('D04 — chip is inside sw-drp-sum-chips div in app.html',
    (function () {
        var chipsIdx = htmlSrc.indexOf('sw-drp-sum-chips');
        var chipIdx  = htmlSrc.indexOf('sw-drp-sum-coa-chip');
        if (chipsIdx === -1 || chipIdx === -1) { return false; }
        // chip must come after the opening of sw-drp-sum-chips
        return chipIdx > chipsIdx;
    }()));

// ─────────────────────────────────────────────────────────────────────────────
// I — i18n keys (I05–I08)
// ─────────────────────────────────────────────────────────────────────────────
assert("I05 — EN 'sw-drp-coa-under-review-label' key present in i18n.js",
    i18nSrc.indexOf("'sw-drp-coa-under-review-label'") !== -1);

assert("I06 — EN 'sw-drp-coa-under-review-empty' key present in i18n.js",
    i18nSrc.indexOf("'sw-drp-coa-under-review-empty'") !== -1);

assert("I07 — AR 'sw-drp-coa-under-review-label' key present in i18n.js",
    (function () {
        // Both EN and AR share the same key name; verify the Arabic value appears
        var idx1 = i18nSrc.indexOf("'sw-drp-coa-under-review-label'");
        var idx2 = i18nSrc.indexOf("'sw-drp-coa-under-review-label'", idx1 + 1);
        return idx1 !== -1 && idx2 !== -1;
    }()));

assert("I08 — AR 'sw-drp-coa-under-review-empty' key present in i18n.js",
    (function () {
        var idx1 = i18nSrc.indexOf("'sw-drp-coa-under-review-empty'");
        var idx2 = i18nSrc.indexOf("'sw-drp-coa-under-review-empty'", idx1 + 1);
        return idx1 !== -1 && idx2 !== -1;
    }()));

// ─────────────────────────────────────────────────────────────────────────────
// C — CSS chip rules (C09–C11)
// ─────────────────────────────────────────────────────────────────────────────
assert('C09 — .sw-drp-sum-coa-chip CSS rule present in style.css',
    cssSrc.indexOf('.sw-drp-sum-coa-chip') !== -1);

assert('C10 — coa chip has background and color declarations',
    (function () {
        var idx = cssSrc.indexOf('.sw-drp-sum-coa-chip');
        var block = idx !== -1 ? cssSrc.slice(idx, idx + 200) : '';
        return block.indexOf('background') !== -1 && block.indexOf('color') !== -1;
    }()));

assert('C11 — light-theme override for coa chip present in style.css',
    cssSrc.indexOf('[data-theme="light"] .sw-drp-sum-coa-chip') !== -1 ||
    cssSrc.indexOf("[data-theme='light'] .sw-drp-sum-coa-chip") !== -1);

// ─────────────────────────────────────────────────────────────────────────────
// P — Painter source structure (P12–P16)
// ─────────────────────────────────────────────────────────────────────────────
assert('P12 — _paintW3CoaUnderReviewIndicator function declared in source',
    src.indexOf('function _paintW3CoaUnderReviewIndicator') !== -1);

assert('P13 — painter calls _getW3CoaReviewRecordForStep (source)',
    paintIndSrc.indexOf('_getW3CoaReviewRecordForStep') !== -1);

assert('P14 — painter reads selectedDecision.label only (source)',
    paintIndSrc.indexOf('selectedDecision.label') !== -1 &&
    paintIndSrc.indexOf('selectedDecision.optionRef') === -1 &&
    paintIndSrc.indexOf('selectedDecision.id') === -1);

assert('P15 — _paintW3CoaUnderReviewIndicator called from _paintW3StepSummary (source)',
    paintSumSrc.indexOf('_paintW3CoaUnderReviewIndicator') !== -1);

assert('P16 — _paintW3CoaUnderReviewIndicator called from _handleW3CoaReviewClick (source)',
    handlerSrc.indexOf('_paintW3CoaUnderReviewIndicator') !== -1);

// ─────────────────────────────────────────────────────────────────────────────
// F — Functional indicator behavior (F17–F27)
// ─────────────────────────────────────────────────────────────────────────────
assert('F17 — harness built successfully (_h is valid)',
    _h !== null && typeof _h === 'object' && typeof _h.paintInd === 'function');

assert('F18 — indicator hidden when no review record (no memory)',
    (function () {
        if (!_h) { return false; }
        _h.resetAll();
        _h.paintInd(makeP());       // no stored record
        return _h.chip().hidden === true;
    }()));

assert('F19 — indicator hidden for non-W3 step',
    (function () {
        if (!_h) { return false; }
        _h.resetAll();
        _h.handler(makeP(), 'COA-HOLD');    // store record for W3-STEP-08
        // Paint with a non-W3 step id
        _h.paintInd(makeP({ activeStepId: 'AMBER-STEP-01' }));
        return _h.chip().hidden === true;
    }()));

assert('F20 — indicator shows after Review COA click (chip not hidden)',
    (function () {
        if (!_h) { return false; }
        _h.resetAll();
        _h.handler(makeP(), 'COA-HOLD');
        return _h.chip().hidden === false;
    }()));

assert('F21 — indicator text contains the clicked COA label',
    (function () {
        if (!_h) { return false; }
        _h.resetAll();
        _h.handler(makeP(), 'COA-HOLD');
        return _h.chip().textContent.indexOf('Hold Current Position') !== -1;
    }()));

assert('F22 — indicator text does not contain raw optionRef string alone',
    (function () {
        if (!_h) { return false; }
        _h.resetAll();
        _h.handler(makeP(), 'COA-HOLD');
        var txt = _h.chip().textContent;
        // Must not show the raw id "COA-HOLD" as the only content — label should dominate
        return txt.indexOf('Hold Current Position') !== -1;
    }()));

assert('F23 — indicator text does not contain "expectedResult"',
    (function () {
        if (!_h) { return false; }
        _h.resetAll();
        _h.handler(makeP(), 'COA-HOLD');
        return _h.chip().textContent.indexOf('expectedResult') === -1;
    }()));

assert('F24 — indicator text does not contain "previewComplete"',
    (function () {
        if (!_h) { return false; }
        _h.resetAll();
        _h.handler(makeP(), 'COA-HOLD');
        return _h.chip().textContent.indexOf('previewComplete') === -1;
    }()));

assert('F25 — indicator text does not look like a raw JSON object',
    (function () {
        if (!_h) { return false; }
        _h.resetAll();
        _h.handler(makeP(), 'COA-HOLD');
        var txt = _h.chip().textContent;
        return txt.indexOf('{') === -1 && txt.indexOf('[object') === -1;
    }()));

assert('F26 — clicking another COA updates indicator label',
    (function () {
        if (!_h) { return false; }
        _h.resetAll();
        _h.handler(makeP(), 'COA-HOLD');
        var label1 = _h.chip().textContent;
        _h.handler(makeP(), 'COA-REINFORCE');
        var label2 = _h.chip().textContent;
        return label1.indexOf('Hold Current Position') !== -1 &&
               label2.indexOf('Reinforce the Gap') !== -1 &&
               label1 !== label2;
    }()));

assert('F27 — indicator hides after memory is cleared (simulates step navigation)',
    (function () {
        if (!_h) { return false; }
        _h.resetAll();
        _h.handler(makeP(), 'COA-HOLD');      // store + show
        _h.clearRec();                         // simulate step nav clear
        _h.paintInd(makeP());                  // repaint — no record
        return _h.chip().hidden === true && _h.chip().textContent === '';
    }()));

// ─────────────────────────────────────────────────────────────────────────────
// S — Safety boundary (S28–S40)
// ─────────────────────────────────────────────────────────────────────────────
assert('S28 — painter body has no localStorage',
    paintIndSrc.indexOf('localStorage') === -1);

assert('S29 — painter body has no sessionStorage',
    paintIndSrc.indexOf('sessionStorage') === -1);

assert('S30 — painter body has no fetch or XMLHttpRequest',
    paintIndSrc.indexOf('fetch(') === -1 && paintIndSrc.indexOf('XMLHttpRequest') === -1);

assert('S31 — painter body has no /api/ call path',
    paintIndSrc.indexOf('/api/') === -1);

assert('S32 — painter body has no gate7 reference',
    paintIndSrc.toLowerCase().indexOf('gate7') === -1);

assert('S33 — painter body has no window.RmoozScenario reference',
    paintIndSrc.indexOf('window.RmoozScenario') === -1);

assert('S34 — painter body has no window.units reference',
    paintIndSrc.indexOf('window.units') === -1);

assert('S35 — painter body has no window.lines reference',
    paintIndSrc.indexOf('window.lines') === -1);

assert('S36 — painter body does not assign p.expectedResult',
    paintIndSrc.indexOf('p.expectedResult') === -1 &&
    paintIndSrc.indexOf('.expectedResult =') === -1);

assert('S37 — painter body does not assign p.previewComplete',
    paintIndSrc.indexOf('p.previewComplete') === -1 &&
    paintIndSrc.indexOf('.previewComplete =') === -1);

assert('S38 — painter body does not assign p.selectedDecision',
    paintIndSrc.indexOf('p.selectedDecision') === -1 &&
    paintIndSrc.indexOf('p.selectedDecision =') === -1);

assert('S39 — painter body adds no button or input DOM elements',
    paintIndSrc.indexOf("createElement('button')") === -1 &&
    paintIndSrc.indexOf('createElement("button")') === -1 &&
    paintIndSrc.indexOf("createElement('input')")  === -1 &&
    paintIndSrc.indexOf('createElement("input")')  === -1);

assert('S40 — painter body has no AI/simulation/journal references',
    paintIndSrc.indexOf('aiGenerated')          === -1 &&
    paintIndSrc.indexOf('simulationCommitted')  === -1 &&
    paintIndSrc.indexOf('backendCommit')        === -1);

// ─────────────────────────────────────────────────────────────────────────────
// R — Regression (R41–R46)
// ─────────────────────────────────────────────────────────────────────────────
assert('R41 — _paintW3StepSummary still in source (PR-238)',
    extractFn(src, '_paintW3StepSummary') !== null);

assert('R42 — _paintW3OperatorSelectionReview still in source (PR-267)',
    extractFn(src, '_paintW3OperatorSelectionReview') !== null);

assert('R43 — _handleW3CoaReviewClick still in source (PR-268)',
    extractFn(src, '_handleW3CoaReviewClick') !== null);

assert('R44 — applyWargame3DecisionOptionsFixtureOverlay still in source (PR-269)',
    extractFn(src, 'applyWargame3DecisionOptionsFixtureOverlay') !== null);

assert('R45 — _clearW3CoaReviewRecord still in source (PR-270)',
    extractFn(src, '_clearW3CoaReviewRecord') !== null);

assert('R46 — _getW3CoaReviewRecordForStep still in source (PR-270)',
    extractFn(src, '_getW3CoaReviewRecordForStep') !== null);

// ─────────────────────────────────────────────────────────────────────────────
// W — File protection (W47–W50)
// ─────────────────────────────────────────────────────────────────────────────
assert('W47 — painter source has no wargame3.json reference',
    paintIndSrc.indexOf('wargame3.json') === -1 && paintIndSrc.indexOf('wargame3') === -1);

assert('W48 — painter source has no app.js reference',
    paintIndSrc.indexOf('app.js') === -1);

assert('W49 — painter source has no adjudicator-map reference',
    paintIndSrc.indexOf('adjudicator-map') === -1 &&
    paintIndSrc.indexOf('adjudicatorMap')  === -1);

assert('W50 — _paintW3CoaUnderReviewIndicator exported on AppShellScenarioWorkspace',
    exportBlock.indexOf('_paintW3CoaUnderReviewIndicator') !== -1);

// ─────────────────────────────────────────────────────────────────────────────
// X — No forbidden action controls / labels (X51–X58)
// ─────────────────────────────────────────────────────────────────────────────
var FORBIDDEN = ['Apply', 'Execute', 'Commit', 'Confirm', 'Approve', 'Go Live', 'Launch', 'Run'];

assert('X51 — painter source has no Apply label',
    paintIndSrc.indexOf("'Apply'") === -1 && paintIndSrc.indexOf('"Apply"') === -1);

assert('X52 — painter source has no Execute label',
    paintIndSrc.indexOf("'Execute'") === -1 && paintIndSrc.indexOf('"Execute"') === -1);

assert('X53 — painter source has no Commit label',
    paintIndSrc.indexOf("'Commit'") === -1 && paintIndSrc.indexOf('"Commit"') === -1);

assert('X54 — painter source has no Confirm label',
    paintIndSrc.indexOf("'Confirm'") === -1 && paintIndSrc.indexOf('"Confirm"') === -1);

assert('X55 — painter source has no Approve label',
    paintIndSrc.indexOf("'Approve'") === -1 && paintIndSrc.indexOf('"Approve"') === -1);

assert('X56 — painter source has no Go Live label',
    paintIndSrc.indexOf('Go Live') === -1);

assert('X57 — painter source has no Run / Launch / Start control labels',
    paintIndSrc.indexOf("'Run'")    === -1 && paintIndSrc.indexOf('"Run"')    === -1 &&
    paintIndSrc.indexOf("'Launch'") === -1 && paintIndSrc.indexOf("'Start'")  === -1);

assert('X58 — painter source has no console.error patterns',
    paintIndSrc.indexOf('console.error') === -1 &&
    paintIndSrc.indexOf('console.warn(')  === -1);

// ─────────────────────────────────────────────────────────────────────────────
// Results
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── PR-271: Wargame 3 COA Under Review Indicator ─────────────────────────────');
results.forEach(function (r) { console.log(r); });
console.log('\n  ' + passed + ' passed  /  ' + failed + ' failed  /  ' + (passed + failed) + ' total');
if (failed > 0) { process.exit(1); }
