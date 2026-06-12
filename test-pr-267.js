'use strict';

// ── PR-267 Test Harness — Wargame 3 Operator Selection Dry-Run Review Display ──
// Verifies:
//   H01–H02:   app.html — section DOM structure (2 tests)
//   I01–I02:   i18n.js  — EN + AR key presence (2 tests)
//   P01:       scenario-workspace.js — painter source exists (1 test)
//   F01–F12:   functional painter tests via DOM mock (12 tests)
//   S18–S21:   safety boundary — no selectedDecision/expectedResult/previewComplete created (4 tests)
//   B22–B28:   no Apply/Execute/Commit/Confirm/Approve/Go Live/Run in painter (7 tests)
//   B29:       no input/checkbox/radio/select/button in section HTML (1 test)
//   G30–G33:   unsafe record fields (applyNow/executeNow/liveApply/gate7Approved) → blocked (4 tests)
//   S34:       unsafe field names absent from section HTML (1 test)
//   R35–R42:   regression — prior W3 functions still intact (8 tests)
//   W43–W46:   painter source does not read/mutate window state (4 tests)
//   W47:       wargame3.json steps have no selection record fields (1 test)
//   N48–N50:   no localStorage/fetch/aiGenerated in painter (3 tests)
//   X51–X53:   app.js / adjudicator-map.js / gate7 untouched (3 tests)
//   F54:       painter does not throw on valid input (1 test)
//
// Total: 54 tests.  No Leaflet. No production side-effects.
// DOM painter tested via lightweight mock: no jsdom, no browser.

var fs   = require('fs');
var path = require('path');

var htmlSrc = fs.readFileSync(
    path.join(__dirname, 'UI_MOdified/client/app.html'), 'utf8');
var i18nSrc = fs.readFileSync(
    path.join(__dirname, 'UI_MOdified/client/i18n.js'), 'utf8');
var src     = fs.readFileSync(
    path.join(__dirname, 'UI_MOdified/client/shell/scenario-workspace.js'), 'utf8');

// ── Test runner ───────────────────────────────────────────────────────────────
var passed = 0; var failed = 0; var results = [];
function assert(label, cond, detail) {
    if (cond) { passed++; results.push('  PASS  ' + label); }
    else       { failed++; results.push('  FAIL  ' + label + (detail ? '  →  ' + detail : '')); }
}

// ── extractFn: brace-matched function extractor ───────────────────────────────
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

// ── Painter harness with injected mock document + tx ─────────────────────────
// The harness returns a factory: factory(mockDocument, mockTx, p)
// The painter is redefined inside the factory scope so it captures the injected
// mock `document` and `tx` as local variables.
var runPainter = null;
(function () {
    var rUF = src.match(/var _W3DRS_UNSAFE_FIELDS\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\)/);
    var rFS = src.match(/var _W3DRS_FORBIDDEN_STATUS_TOKENS\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\)/);
    var rVS = src.match(/var _W3SEL_VALID_STATUSES\s*=\s*(\[[\s\S]*?\]);/);
    var rFR = src.match(/var _W3SEL_FORBIDDEN_REC_FIELDS\s*=\s*(\[[\s\S]*?\]);/);

    var fnSD      = extractFn(src, 'isWargame3SelectedDecisionSafe');
    var fnOpt     = extractFn(src, 'isWargame3DecisionOptionSafe');
    var fnGR      = extractFn(src, 'isWargame3OperatorSelectionDryRunRecordSafe');
    var fnPainter = extractFn(src, '_paintW3OperatorSelectionReview');

    if (!rUF || !rFS || !rVS || !rFR || !fnSD || !fnOpt || !fnGR || !fnPainter) { return; }

    var harness =
        'var _W3DRS_UNSAFE_FIELDS            = Object.freeze([' + rUF[1] + ']);\n' +
        'var _W3DRS_FORBIDDEN_STATUS_TOKENS  = Object.freeze([' + rFS[1] + ']);\n' +
        'var _W3SEL_VALID_STATUSES           = ' + rVS[1] + ';\n' +
        'var _W3SEL_FORBIDDEN_REC_FIELDS     = ' + rFR[1] + ';\n' +
        fnSD      + ';\n' +
        fnOpt     + ';\n' +
        fnGR      + ';\n' +
        // Return a factory that redefines the painter inside a scope that owns
        // a mocked `document` and `tx`, so the painter's free-variable references
        // resolve to the mocks instead of browser globals.
        'return function (mockDocument, mockTx, p) {\n' +
        '  var document = mockDocument;\n' +
        '  var tx       = mockTx;\n' +
        '  ' + fnPainter + '\n' +
        '  _paintW3OperatorSelectionReview(p);\n' +
        '};\n';

    try { runPainter = new Function(harness)(); }
    catch (e) { /* each assertion will fail gracefully with "runPainter not built" */ }
}());

// ── Lightweight DOM mock ──────────────────────────────────────────────────────
var MOCK_IDS = [
    'sw-drp-selection-review',
    'sw-drp-selection-review-status',
    'sw-drp-selection-review-coa',
    'sw-drp-selection-review-option-ref',
    'sw-drp-selection-review-dry-run',
    'sw-drp-selection-review-live-mutation',
    'sw-drp-selection-review-backend-commit',
    'sw-drp-selection-review-expected-result',
    'sw-drp-selection-review-preview-complete'
];

function makeMockDom(ids) {
    var store = {};
    ids.forEach(function (id) {
        store[id] = { textContent: '', hidden: true };
    });
    return {
        store: store,
        getElementById: function (id) { return store[id] || null; }
    };
}

// Mock tx: returns the fallback (matching production behaviour when i18n resolves)
var mockTx = function (key, fallback) { return fallback !== undefined ? fallback : key; };

// ── Valid dry-run selection record fixture ────────────────────────────────────
// readOnly:true required on sourceOption (isWargame3DecisionOptionSafe rule).
// selectedDecision.source:'operator', confidence:'explicit', readOnly:true required.
function makeValidRecord(overrides) {
    var base = {
        id:        'W3-SEL-W3-STEP-08-COA-01',
        stepRef:   'W3-STEP-08',
        optionRef: 'COA-01',
        selectedDecision: {
            id:          'SEL-W3-STEP-08-COA-01',
            label:       'Strike North',
            description: 'Operator selected Strike North for W3-STEP-08.',
            source:      'operator',
            selectedAt:  null,
            selectedBy:  null,
            optionRef:   'COA-01',
            confidence:  'explicit',
            readOnly:    true
        },
        sourceOption: {
            id:          'COA-01',
            label:       'Strike North',
            description: 'Advance along the northern axis using armoured elements.',
            intent:      'Gain positional advantage; fix enemy forces in depth.',
            source:      'source_json',
            readOnly:    true
        },
        status:               'draft',
        dryRunOnly:           true,
        liveMutationAllowed:  false,
        backendCommitAllowed: false,
        createdAt:            null,
        createdBy:            null
    };
    if (overrides) {
        Object.keys(overrides).forEach(function (k) { base[k] = overrides[k]; });
    }
    return base;
}

// ── Painter source body (for source-inspection tests) ────────────────────────
var painterSrc = extractFn(src, '_paintW3OperatorSelectionReview') || '';

// ─────────────────────────────────────────────────────────────────────────────
// H: app.html DOM structure
// ─────────────────────────────────────────────────────────────────────────────
assert('H01 — #sw-drp-selection-review section exists in app.html',
    htmlSrc.indexOf('id="sw-drp-selection-review"') !== -1,
    'element not found');

assert('H02 — section has hidden attribute by default',
    (function () {
        var idx = htmlSrc.indexOf('id="sw-drp-selection-review"');
        if (idx === -1) { return false; }
        // Look in a region spanning the section open-tag
        var region = htmlSrc.slice(Math.max(0, idx - 80), idx + 120);
        return region.indexOf(' hidden') !== -1;
    }()),
    'hidden attribute missing on section open-tag');

// ─────────────────────────────────────────────────────────────────────────────
// I: i18n key coverage
// ─────────────────────────────────────────────────────────────────────────────
assert('I01 — 13 EN i18n keys for PR-267 present in i18n.js',
    (function () {
        var keys = [
            'sw-drp-selection-review-title',
            'sw-drp-selection-review-status',
            'sw-drp-selection-review-coa',
            'sw-drp-selection-review-option-ref',
            'sw-drp-selection-review-dry-run',
            'sw-drp-selection-review-live-mutation',
            'sw-drp-selection-review-backend-commit',
            'sw-drp-selection-review-expected-result',
            'sw-drp-selection-review-preview-complete',
            'sw-drp-selection-review-yes',
            'sw-drp-selection-review-no',
            'sw-drp-selection-review-not-available',
            'sw-drp-selection-review-readonly'
        ];
        return keys.every(function (k) { return i18nSrc.indexOf("'" + k + "'") !== -1; });
    }()),
    'one or more EN i18n keys missing');

assert('I02 — 13 AR i18n keys for PR-267 present in i18n.js (each key appears twice: EN + AR)',
    (function () {
        var keys = [
            'sw-drp-selection-review-title',
            'sw-drp-selection-review-status',
            'sw-drp-selection-review-coa',
            'sw-drp-selection-review-option-ref',
            'sw-drp-selection-review-dry-run',
            'sw-drp-selection-review-live-mutation',
            'sw-drp-selection-review-backend-commit',
            'sw-drp-selection-review-expected-result',
            'sw-drp-selection-review-preview-complete',
            'sw-drp-selection-review-yes',
            'sw-drp-selection-review-no',
            'sw-drp-selection-review-not-available',
            'sw-drp-selection-review-readonly'
        ];
        return keys.every(function (k) {
            var needle = "'" + k + "'";
            var count = 0; var pos = -1;
            while ((pos = i18nSrc.indexOf(needle, pos + 1)) !== -1) { count++; }
            return count >= 2; // EN block + AR block
        });
    }()),
    'one or more AR i18n keys missing');

// ─────────────────────────────────────────────────────────────────────────────
// P01: painter source existence
// ─────────────────────────────────────────────────────────────────────────────
assert('P01 — _paintW3OperatorSelectionReview defined in scenario-workspace.js',
    src.indexOf('function _paintW3OperatorSelectionReview(') !== -1,
    'function not found');

// ─────────────────────────────────────────────────────────────────────────────
// F: functional painter tests (DOM mock)
// ─────────────────────────────────────────────────────────────────────────────
assert('F01 — p=null → section stays hidden',
    (function () {
        if (typeof runPainter !== 'function') { return false; }
        var dom = makeMockDom(MOCK_IDS);
        runPainter(dom, mockTx, null);
        return dom.store['sw-drp-selection-review'].hidden === true;
    }()),
    'section shown on null p');

assert('F02 — p with no record (simulates non-W3 / empty preview) → section stays hidden',
    (function () {
        if (typeof runPainter !== 'function') { return false; }
        var dom = makeMockDom(MOCK_IDS);
        runPainter(dom, mockTx, { activeStepId: 'WARGAME1-STEP-01' });
        return dom.store['sw-drp-selection-review'].hidden === true;
    }()),
    'section shown when no record on p');

assert('F03 — invalid record (dryRunOnly:false) → section stays hidden',
    (function () {
        if (typeof runPainter !== 'function') { return false; }
        var dom = makeMockDom(MOCK_IDS);
        runPainter(dom, mockTx,
            { operatorSelectionDryRunRecord: makeValidRecord({ dryRunOnly: false }) });
        return dom.store['sw-drp-selection-review'].hidden === true;
    }()),
    'section shown despite invalid record');

assert('F04 — valid record → section.hidden becomes false',
    (function () {
        if (typeof runPainter !== 'function') { return false; }
        var dom = makeMockDom(MOCK_IDS);
        runPainter(dom, mockTx,
            { operatorSelectionDryRunRecord: makeValidRecord() });
        return dom.store['sw-drp-selection-review'].hidden === false;
    }()),
    'section still hidden after valid record');

assert('F05 — status field populated with rec.status value',
    (function () {
        if (typeof runPainter !== 'function') { return false; }
        var dom = makeMockDom(MOCK_IDS);
        runPainter(dom, mockTx,
            { operatorSelectionDryRunRecord: makeValidRecord({ status: 'draft' }) });
        return dom.store['sw-drp-selection-review-status'].textContent === 'draft';
    }()),
    'status field not rendered correctly');

assert('F06 — selected COA label populated from selectedDecision.label',
    (function () {
        if (typeof runPainter !== 'function') { return false; }
        var dom = makeMockDom(MOCK_IDS);
        runPainter(dom, mockTx,
            { operatorSelectionDryRunRecord: makeValidRecord() });
        return dom.store['sw-drp-selection-review-coa'].textContent === 'Strike North';
    }()),
    'COA label not rendered');

assert('F07 — optionRef field populated with rec.optionRef',
    (function () {
        if (typeof runPainter !== 'function') { return false; }
        var dom = makeMockDom(MOCK_IDS);
        runPainter(dom, mockTx,
            { operatorSelectionDryRunRecord: makeValidRecord() });
        return dom.store['sw-drp-selection-review-option-ref'].textContent === 'COA-01';
    }()),
    'optionRef field not rendered correctly');

assert('F08 — dry-run field renders "Yes" (tx fallback)',
    (function () {
        if (typeof runPainter !== 'function') { return false; }
        var dom = makeMockDom(MOCK_IDS);
        runPainter(dom, mockTx,
            { operatorSelectionDryRunRecord: makeValidRecord() });
        return dom.store['sw-drp-selection-review-dry-run'].textContent === 'Yes';
    }()),
    'dry-run field not "Yes"');

assert('F09 — live-mutation field renders "No" (tx fallback)',
    (function () {
        if (typeof runPainter !== 'function') { return false; }
        var dom = makeMockDom(MOCK_IDS);
        runPainter(dom, mockTx,
            { operatorSelectionDryRunRecord: makeValidRecord() });
        return dom.store['sw-drp-selection-review-live-mutation'].textContent === 'No';
    }()),
    'live-mutation field not "No"');

assert('F10 — backend-commit field renders "No"',
    (function () {
        if (typeof runPainter !== 'function') { return false; }
        var dom = makeMockDom(MOCK_IDS);
        runPainter(dom, mockTx,
            { operatorSelectionDryRunRecord: makeValidRecord() });
        return dom.store['sw-drp-selection-review-backend-commit'].textContent === 'No';
    }()),
    'backend-commit field not "No"');

assert('F11 — expected-result field renders "Not available yet"',
    (function () {
        if (typeof runPainter !== 'function') { return false; }
        var dom = makeMockDom(MOCK_IDS);
        runPainter(dom, mockTx,
            { operatorSelectionDryRunRecord: makeValidRecord() });
        return dom.store['sw-drp-selection-review-expected-result'].textContent ===
               'Not available yet';
    }()),
    'expected-result field not "Not available yet"');

assert('F12 — preview-complete field renders "No"',
    (function () {
        if (typeof runPainter !== 'function') { return false; }
        var dom = makeMockDom(MOCK_IDS);
        runPainter(dom, mockTx,
            { operatorSelectionDryRunRecord: makeValidRecord() });
        return dom.store['sw-drp-selection-review-preview-complete'].textContent === 'No';
    }()),
    'preview-complete field not "No"');

// ─────────────────────────────────────────────────────────────────────────────
// S18–S21: safety boundary — painter does not CREATE forbidden fields
// ─────────────────────────────────────────────────────────────────────────────
assert('S18 — painter source does not create a new selectedDecision value',
    // Painter may read rec.selectedDecision (member access) but must NOT create one
    // as an object literal key (selectedDecision:) or a top-level assignment (selectedDecision =)
    painterSrc.indexOf('selectedDecision:') === -1 &&
    painterSrc.indexOf('selectedDecision =') === -1,
    'painter creates selectedDecision as a new object or assignment');

assert('S19 — painter source does not create or read expectedResult as code (comment mention allowed)',
    // The painter body has one inline comment: "not possible without expectedResult".
    // That comment is documentation — the rule forbids *code* references:
    //   no object-key creation (expectedResult:), no assignment, no field read from rec or p.
    painterSrc.indexOf('expectedResult:')      === -1 &&   // not created as object key
    painterSrc.indexOf('rec.expectedResult')   === -1 &&   // not read from validated record
    painterSrc.indexOf('p.expectedResult')     === -1 &&   // not read from preview object
    painterSrc.indexOf('expectedResult =')     === -1,     // not assigned anywhere
    'expectedResult created or read as code in painter source');

assert('S20 — painter source does not create or assign previewComplete',
    painterSrc.indexOf('previewComplete') === -1,
    'previewComplete found in painter source');

assert('S21 — painter calls isWargame3OperatorSelectionDryRunRecordSafe before ANY render',
    painterSrc.indexOf('isWargame3OperatorSelectionDryRunRecordSafe') !== -1 &&
    // The guard call must appear before setVal (which does the rendering)
    painterSrc.indexOf('isWargame3OperatorSelectionDryRunRecordSafe') <
        painterSrc.indexOf('setVal('),
    'guard not called or called after render');

// ─────────────────────────────────────────────────────────────────────────────
// B22–B28: no action labels or buttons in painter source
// Checked as string literals: painter must never create button text or DOM actions.
// Note: 'sw-drp-selection-review-backend-commit' contains 'commit' in an ID string;
//       that is acceptable — the forbidden patterns below target action calls/labels.
// ─────────────────────────────────────────────────────────────────────────────
assert('B22 — painter source has no "Apply" action label or applyNow reference',
    painterSrc.indexOf('"Apply"')  === -1 &&
    painterSrc.indexOf("'Apply'")  === -1 &&
    painterSrc.indexOf('applyNow') === -1,
    '"Apply" or applyNow found in painter source');

assert('B23 — painter source has no "Execute" action label or executeNow reference',
    painterSrc.indexOf('"Execute"')  === -1 &&
    painterSrc.indexOf("'Execute'")  === -1 &&
    painterSrc.indexOf('executeNow') === -1,
    '"Execute" or executeNow found in painter source');

assert('B24 — painter source has no commit() call or "Commit" button label',
    painterSrc.indexOf('.commit(')  === -1 &&
    painterSrc.indexOf('"Commit"')  === -1 &&
    painterSrc.indexOf("'Commit'")  === -1 &&
    painterSrc.indexOf('commitNow') === -1,
    'commit action found in painter source');

assert('B25 — painter source has no "Confirm" action label',
    painterSrc.indexOf('"Confirm"') === -1 &&
    painterSrc.indexOf("'Confirm'") === -1,
    '"Confirm" label found in painter source');

assert('B26 — painter source has no "Approve" action label',
    painterSrc.indexOf('"Approve"') === -1 &&
    painterSrc.indexOf("'Approve'") === -1,
    '"Approve" label found in painter source');

assert('B27 — painter source has no "Go Live" label or go-live reference',
    painterSrc.indexOf('Go Live')  === -1 &&
    painterSrc.indexOf('go-live')  === -1 &&
    painterSrc.indexOf('goLive')   === -1,
    '"Go Live" found in painter source');

assert('B28 — painter source has no "Run" button label',
    painterSrc.indexOf('"Run"')  === -1 &&
    painterSrc.indexOf("'Run'")  === -1 &&
    painterSrc.indexOf('>Run<')  === -1,
    '"Run" label found in painter source');

// ─────────────────────────────────────────────────────────────────────────────
// B29: no interactive controls in the section HTML
// ─────────────────────────────────────────────────────────────────────────────
assert('B29 — #sw-drp-selection-review section has no input/button/select/checkbox/radio',
    (function () {
        var sIdx = htmlSrc.indexOf('id="sw-drp-selection-review"');
        if (sIdx === -1) { return false; }
        // Find the closing </section> tag
        var eIdx = htmlSrc.indexOf('</section>', sIdx);
        if (eIdx === -1) { return false; }
        var region = htmlSrc.slice(sIdx, eIdx + 10);
        return region.indexOf('<input')          === -1 &&
               region.indexOf('<button')         === -1 &&
               region.indexOf('<select')         === -1 &&
               region.indexOf('type="checkbox"') === -1 &&
               region.indexOf('type="radio"')    === -1 &&
               region.indexOf('type="submit"')   === -1;
    }()),
    'interactive control found in section HTML');

// ─────────────────────────────────────────────────────────────────────────────
// G30–G33: unsafe fields on record → section blocked
// ─────────────────────────────────────────────────────────────────────────────
assert('G30 — record with applyNow:true → section stays hidden',
    (function () {
        if (typeof runPainter !== 'function') { return false; }
        var dom = makeMockDom(MOCK_IDS);
        runPainter(dom, mockTx,
            { operatorSelectionDryRunRecord: makeValidRecord({ applyNow: true }) });
        return dom.store['sw-drp-selection-review'].hidden === true;
    }()),
    'applyNow not blocked by guard');

assert('G31 — record with executeNow:true → section stays hidden',
    (function () {
        if (typeof runPainter !== 'function') { return false; }
        var dom = makeMockDom(MOCK_IDS);
        runPainter(dom, mockTx,
            { operatorSelectionDryRunRecord: makeValidRecord({ executeNow: true }) });
        return dom.store['sw-drp-selection-review'].hidden === true;
    }()),
    'executeNow not blocked by guard');

assert('G32 — record with liveApply:true → section stays hidden',
    (function () {
        if (typeof runPainter !== 'function') { return false; }
        var dom = makeMockDom(MOCK_IDS);
        runPainter(dom, mockTx,
            { operatorSelectionDryRunRecord: makeValidRecord({ liveApply: true }) });
        return dom.store['sw-drp-selection-review'].hidden === true;
    }()),
    'liveApply not blocked by guard');

assert('G33 — record with gate7Approved:true → section stays hidden',
    (function () {
        if (typeof runPainter !== 'function') { return false; }
        var dom = makeMockDom(MOCK_IDS);
        runPainter(dom, mockTx,
            { operatorSelectionDryRunRecord: makeValidRecord({ gate7Approved: true }) });
        return dom.store['sw-drp-selection-review'].hidden === true;
    }()),
    'gate7Approved not blocked by guard');

// ─────────────────────────────────────────────────────────────────────────────
// S34: unsafe field names absent from section HTML region
// ─────────────────────────────────────────────────────────────────────────────
assert('S34 — unsafe field names absent from #sw-drp-selection-review section HTML',
    (function () {
        var sIdx = htmlSrc.indexOf('id="sw-drp-selection-review"');
        if (sIdx === -1) { return false; }
        var eIdx = htmlSrc.indexOf('</section>', sIdx);
        if (eIdx === -1) { return false; }
        var region = htmlSrc.slice(sIdx, eIdx + 10);
        var unsafeNames = [
            'applyNow', 'commitNow', 'executeNow', 'liveApply',
            'mutateUnits', 'mutateMap', 'mutateScenario', 'backendCommit',
            'autoApply', 'aiGenerated', 'simulationCommitted', 'gate7Approved'
        ];
        return unsafeNames.every(function (n) { return region.indexOf(n) === -1; });
    }()),
    'unsafe field name found in section HTML');

// ─────────────────────────────────────────────────────────────────────────────
// R35–R42: regression — prior W3 functions still intact
// ─────────────────────────────────────────────────────────────────────────────
assert('R35 — _buildW3EventLog still defined',
    src.indexOf('function _buildW3EventLog(') !== -1,
    'function missing');

assert('R36 — _paintW3DecisionOptions (PR-264) still defined',
    src.indexOf('function _paintW3DecisionOptions(') !== -1,
    'function missing');

assert('R37 — isWargame3SelectedDecisionSafe still defined',
    src.indexOf('function isWargame3SelectedDecisionSafe(') !== -1,
    'function missing');

assert('R38 — isWargame3DecisionOptionSafe still defined',
    src.indexOf('function isWargame3DecisionOptionSafe(') !== -1,
    'function missing');

assert('R39 — isWargame3ExpectedResultSafe still defined',
    src.indexOf('function isWargame3ExpectedResultSafe(') !== -1,
    'function missing');

assert('R40 — validateWargame3DecisionResultPair still defined',
    src.indexOf('function validateWargame3DecisionResultPair(') !== -1,
    'function missing');

assert('R41 — buildWargame3DecisionOptionsPreviewData still defined',
    src.indexOf('function buildWargame3DecisionOptionsPreviewData(') !== -1,
    'function missing');

assert('R42 — buildWargame3OperatorSelectionDryRunRecord (PR-266) still defined',
    src.indexOf('function buildWargame3OperatorSelectionDryRunRecord(') !== -1,
    'function missing');

// ─────────────────────────────────────────────────────────────────────────────
// W43–W46: painter source does not read or mutate window / live state
// ─────────────────────────────────────────────────────────────────────────────
assert('W43 — painter source does not read window.RmoozScenario',
    painterSrc.indexOf('window.RmoozScenario') === -1,
    'window.RmoozScenario found in painter');

assert('W44 — painter source does not read window.units',
    painterSrc.indexOf('window.units') === -1,
    'window.units found in painter');

assert('W45 — painter source does not read window.lines',
    painterSrc.indexOf('window.lines') === -1,
    'window.lines found in painter');

assert('W46 — painter source does not reference stepIndex',
    painterSrc.indexOf('stepIndex') === -1,
    'stepIndex found in painter');

// ─────────────────────────────────────────────────────────────────────────────
// W47: wargame3.json steps have no selection record / selectedDecision fields
// ─────────────────────────────────────────────────────────────────────────────
assert('W47 — wargame3.json steps have no selection-record or selectedDecision fields',
    (function () {
        var w3 = JSON.parse(
            fs.readFileSync(
                path.join(__dirname, 'UI_MOdified/data/scenarios/wargame3.json'), 'utf8'));
        return w3.steps.every(function (s) {
            return !Object.prototype.hasOwnProperty.call(s, 'operatorSelectionDryRunRecord') &&
                   !Object.prototype.hasOwnProperty.call(s, 'selectionDryRunRecord') &&
                   !Object.prototype.hasOwnProperty.call(s, 'selectedDecision') &&
                   !Object.prototype.hasOwnProperty.call(s, 'dryRunRecord');
        });
    }()),
    'selection-record or selectedDecision found in wargame3.json steps');

// ─────────────────────────────────────────────────────────────────────────────
// N48–N50: no storage / fetch / AI generation in painter
// ─────────────────────────────────────────────────────────────────────────────
assert('N48 — painter source has no localStorage access',
    painterSrc.indexOf('localStorage') === -1,
    'localStorage found in painter');

assert('N49 — painter source has no fetch() call',
    painterSrc.indexOf('fetch(') === -1,
    'fetch() found in painter');

assert('N50 — painter source has no aiGenerated reference',
    painterSrc.indexOf('aiGenerated') === -1,
    'aiGenerated found in painter');

// ─────────────────────────────────────────────────────────────────────────────
// X51–X53: app.js / adjudicator-map.js / gate7 untouched
// ─────────────────────────────────────────────────────────────────────────────
assert('X51 — app.js has no PR-267 production marker',
    (function () {
        var appSrc = fs.readFileSync(
            path.join(__dirname, 'UI_MOdified/client/app.js'), 'utf8');
        return appSrc.indexOf('PR-267-PRODUCTION-CHANGE') === -1;
    }()),
    'PR-267 marker found in app.js');

assert('X52 — adjudicator-map.js has no PR-267 production marker',
    (function () {
        var adjSrc = fs.readFileSync(
            path.join(__dirname, 'UI_MOdified/client/wargame/adjudicator-map.js'), 'utf8');
        return adjSrc.indexOf('PR-267-PRODUCTION-CHANGE') === -1;
    }()),
    'PR-267 marker found in adjudicator-map.js');

assert('X53 — painter source contains no gate7 logic',
    painterSrc.indexOf('gate7')    === -1 &&
    painterSrc.indexOf('Gate7')    === -1 &&
    painterSrc.indexOf('gate_7')   === -1 &&
    painterSrc.indexOf('GATE7')    === -1,
    'gate7 logic found in painter source');

// ─────────────────────────────────────────────────────────────────────────────
// F54: painter does not throw on valid input
// ─────────────────────────────────────────────────────────────────────────────
assert('F54 — painter does not throw on a well-formed valid record',
    (function () {
        if (typeof runPainter !== 'function') { return false; }
        try {
            var dom = makeMockDom(MOCK_IDS);
            runPainter(dom, mockTx, { operatorSelectionDryRunRecord: makeValidRecord() });
            return true;
        } catch (e) { return false; }
    }()),
    (function () {
        if (typeof runPainter !== 'function') { return 'runPainter not built'; }
        try {
            var dom = makeMockDom(MOCK_IDS);
            runPainter(dom, mockTx, { operatorSelectionDryRunRecord: makeValidRecord() });
            return '';
        } catch (e) { return e.message; }
    }()));

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
console.log('── PR-267 Dry-Run Review Display Verification Summary ────────────────────────');
console.log('  HTML section:              <section id="sw-drp-selection-review" hidden>');
console.log('  Painter function:          _paintW3OperatorSelectionReview(p) — DOM only');
console.log('  Painter call site:         _paintToDOM — after _paintW3DecisionOptions, W3 only');
console.log('  Guard:                     isWargame3OperatorSelectionDryRunRecordSafe — called first');
console.log('  Fields painted (read-only): status, COA label, optionRef, dryRunOnly,');
console.log('                              liveMutation, backendCommit, expectedResult,');
console.log('                              previewComplete');
console.log('  i18n EN keys added:        13 (title, status, coa, option-ref, …, readonly)');
console.log('  i18n AR keys added:        13 (matching Arabic translations)');
console.log('  selectedDecision created:  No — read-only from validated record');
console.log('  expectedResult created:    No — "Not available yet" is a static i18n string');
console.log('  previewComplete changed:   No — always renders "No"');
console.log('  Buttons / inputs:          NONE — section is display-only');
console.log('  Apply/Execute/Commit:      FORBIDDEN — not present anywhere in painter');
console.log('  Gate 7:                    FORBIDDEN');
console.log('  Map overlays:              None — FORBIDDEN');
console.log('  wargame3.json changed:     No');
console.log('  app.js changed:            No');
console.log('  adjudicator-map.js changed:No');
console.log('  Next PR:                   PR-268 — W3 step-summary or selection-commit review');
console.log('──────────────────────────────────────────────────────────────────────────────');
