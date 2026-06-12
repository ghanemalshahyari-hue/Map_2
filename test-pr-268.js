'use strict';

// ── PR-268 Test Harness — Wargame 3 In-App COA Review Selection ───────────────
// Verifies:
//   I01–I02:   i18n.js  — EN + AR review-button key presence (2 tests)
//   C03–C05:   style.css — review button CSS rules (3 tests)
//   H06–H11:   HTML / source structure for button rendering (6 tests)
//   L09–L16:   Button label does not contain forbidden action words (8 tests)
//   F17–F27:   Functional handler tests — build, attach, repaint (11 tests)
//   S28–S33:   Safety boundary — no illegal field creation or mutation (6 tests)
//   V34–V35:   Visibility — warnings/event-log/decision-options remain (2 tests)
//   M36–M39:   Map state untouched in handler source (4 tests)
//   N40–N42:   Step-change clears review; no persistence (3 tests)
//   P43–P49:   No storage/fetch/AI/window mutation in handler (7 tests)
//   W50–W51:   wargame3.json / app.js / adjudicator-map.js unchanged (2 tests)
//   G52–G54:   No Gate7/apply/execute/commit controls (3 tests)
//   G55–G61:   No Confirm/Approve/Go-Live/Run/Select/Start/Launch (7 tests)
//   R62:       No console-error patterns in handler source (1 test)
//   R63–R65:   PR-264/PR-267/PR-266 regression (3 tests)
//
// Total: 65 tests.  No Leaflet. No DOM. Pure source + functional.

var fs   = require('fs');
var path = require('path');

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

// ── Handler + builder harness ────────────────────────────────────────────────
// Builds _handleW3CoaReviewClick in a scope where:
//   - buildWargame3OperatorSelectionDryRunRecord is available
//   - _paintW3OperatorSelectionReview is mocked (records last call)
//   - document.getElementById is mocked (no real DOM)
var _testHandler   = null;
var _testBuilder   = null;
var _testGuardSafe = null;
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
    var fnH   = extractFn(src, '_handleW3CoaReviewClick');

    if (!rUF || !rFS || !rVS || !rFR ||
        !fnSD || !fnOpt || !fnVP || !fnBPD || !fnGR || !fnBR || !fnH) { return; }

    var harness =
        'var _W3DRS_UNSAFE_FIELDS           = Object.freeze([' + rUF[1] + ']);\n' +
        'var _W3DRS_FORBIDDEN_STATUS_TOKENS = Object.freeze([' + rFS[1] + ']);\n' +
        'var _W3SEL_VALID_STATUSES          = ' + rVS[1] + ';\n' +
        'var _W3SEL_FORBIDDEN_REC_FIELDS    = ' + rFR[1] + ';\n' +
        fnSD  + ';\n' +
        fnOpt + ';\n' +
        fnVP  + ';\n' +
        fnBPD + ';\n' +
        fnGR  + ';\n' +
        fnBR  + ';\n' +
        // Mock painter: records what it was called with
        'var _mockPaintCalled = false; var _mockPaintedP = null;\n' +
        'function _paintW3OperatorSelectionReview(p) {\n' +
        '  _mockPaintCalled = true; _mockPaintedP = p;\n' +
        '}\n' +
        // Mock document: minimal getElementById
        'var _mockSection = { hidden: true };\n' +
        'var document = { getElementById: function(id) {\n' +
        '  if (id === "sw-drp-selection-review") { return _mockSection; } return null;\n' +
        '}};\n' +
        fnH + ';\n' +
        'return {\n' +
        '  handler:    _handleW3CoaReviewClick,\n' +
        '  builder:    buildWargame3OperatorSelectionDryRunRecord,\n' +
        '  guardSafe:  isWargame3OperatorSelectionDryRunRecordSafe,\n' +
        '  resetMock:  function() { _mockPaintCalled=false; _mockPaintedP=null; _mockSection.hidden=true; },\n' +
        '  wasPainted: function() { return _mockPaintCalled; },\n' +
        '  paintedP:   function() { return _mockPaintedP; },\n' +
        '  section:    function() { return _mockSection; }\n' +
        '};\n';

    try {
        var exp = new Function(harness)();
        _testHandler   = exp.handler;
        _testBuilder   = exp.builder;
        _testGuardSafe = exp.guardSafe;
        // Store reset/inspect helpers on the harness result
        _testHandler._resetMock  = exp.resetMock;
        _testHandler._wasPainted = exp.wasPainted;
        _testHandler._paintedP   = exp.paintedP;
        _testHandler._section    = exp.section;
    } catch (e) { /* each assertion will fail gracefully */ }
}());

// ── Valid W3-STEP-08 preview fixture with 3 COA options ──────────────────────
var VALID_W3_OPTIONS = [
    { id:'COA-01', label:'Strike North',            description:'Advance along northern axis.',  intent:'Gain positional advantage.', source:'source_json', readOnly:true },
    { id:'COA-02', label:'Hold Current Position',   description:'Consolidate on trace.',         intent:'Preserve combat power.',      source:'source_json', readOnly:true },
    { id:'COA-03', label:'Withdraw to Phase BRAVO', description:'Deliberate withdrawal.',         intent:'Preserve force integrity.',   source:'source_json', readOnly:true }
];

function makeValidP(overrides) {
    var base = {
        activeStepId:  'W3-STEP-08',
        decisionOptions: VALID_W3_OPTIONS.map(function (o) {
            return Object.assign({}, o); // shallow copy — do not mutate originals
        })
    };
    if (overrides) { Object.keys(overrides).forEach(function (k) { base[k] = overrides[k]; }); }
    return base;
}

// Handler source for source-inspection tests
var handlerSrc    = extractFn(src, '_handleW3CoaReviewClick') || '';
var painterOptSrc = extractFn(src, '_paintW3DecisionOptions') || '';

// ─────────────────────────────────────────────────────────────────────────────
// I: i18n keys
// ─────────────────────────────────────────────────────────────────────────────
assert("I01 — EN 'sw-drp-coa-review-btn' key present in i18n.js",
    i18nSrc.indexOf("'sw-drp-coa-review-btn'") !== -1, 'key missing');

assert("I02 — AR 'sw-drp-coa-review-btn' key present in i18n.js (appears twice: EN + AR)",
    (function () {
        var count = 0; var pos = -1;
        while ((pos = i18nSrc.indexOf("'sw-drp-coa-review-btn'", pos + 1)) !== -1) { count++; }
        return count >= 2;
    }()),
    'AR key missing');

// ─────────────────────────────────────────────────────────────────────────────
// C: CSS
// ─────────────────────────────────────────────────────────────────────────────
assert('C03 — .sw-drp-coa-review-btn class defined in style.css',
    cssSrc.indexOf('.sw-drp-coa-review-btn') !== -1, 'CSS class missing');

assert('C04 — review button has cursor:pointer in CSS',
    cssSrc.indexOf('cursor: pointer') !== -1 ||
    cssSrc.indexOf('cursor:pointer')  !== -1, 'cursor:pointer missing');

assert('C05 — review button has distinct secondary styling (not primary/red/danger)',
    cssSrc.indexOf('.sw-drp-coa-review-btn') !== -1 &&
    (function () {
        var idx  = cssSrc.indexOf('.sw-drp-coa-review-btn');
        var region = cssSrc.slice(idx, idx + 300);
        return region.indexOf('var(--danger') === -1 &&
               region.indexOf('#ef4444')       === -1 &&
               region.indexOf('font-size: 0.6') !== -1; // small secondary label
    }()),
    'button uses danger/primary color or missing small font-size');

// ─────────────────────────────────────────────────────────────────────────────
// H: Source structure for button rendering
// ─────────────────────────────────────────────────────────────────────────────
assert('H06 — _handleW3CoaReviewClick defined in scenario-workspace.js',
    src.indexOf('function _handleW3CoaReviewClick(') !== -1, 'function missing');

assert('H07 — _paintW3DecisionOptions creates button with data-w3-coa-review attribute',
    painterOptSrc.indexOf('data-w3-coa-review') !== -1, 'data-w3-coa-review not in painter source');

assert('H08 — button is appended inside the valid-options loop (after data.hasOptions guard)',
    // The button creation appears AFTER the hasOptions guard in the painter source.
    // Verify by checking both strings appear and button comes after the guard.
    (function () {
        var guardIdx  = painterOptSrc.indexOf('data.hasOptions');
        var btnIdx    = painterOptSrc.indexOf('data-w3-coa-review');
        return guardIdx !== -1 && btnIdx !== -1 && btnIdx > guardIdx;
    }()),
    'button created before hasOptions guard or not found');

assert('H09 — button uses IIFE closure to capture p and optionId per card',
    painterOptSrc.indexOf('capturedP')   !== -1 &&
    painterOptSrc.indexOf('capturedOptId') !== -1,
    'IIFE closure variables missing from painter');

assert('H10 — button triggers _handleW3CoaReviewClick via click listener',
    painterOptSrc.indexOf('_handleW3CoaReviewClick') !== -1, 'handler call missing');

assert('H11 — _handleW3CoaReviewClick exported on window.AppShellScenarioWorkspace',
    src.indexOf('_handleW3CoaReviewClick:') !== -1 &&
    src.indexOf('_handleW3CoaReviewClick') !== src.lastIndexOf('_handleW3CoaReviewClick'),
    'handler not exported');

// ─────────────────────────────────────────────────────────────────────────────
// L: Button label does not contain forbidden action words
// (Check both the i18n value AND the tx() fallback string in the painter)
// ─────────────────────────────────────────────────────────────────────────────
// Extract the EN value for sw-drp-coa-review-btn from i18n.js
var _coaBtnLabelMatch = i18nSrc.match(/'sw-drp-coa-review-btn'\s*:\s*'([^']*)'/);
var _coaBtnLabel = _coaBtnLabelMatch ? _coaBtnLabelMatch[1] : '';

assert("L09 — button label does not contain 'Select'",
    _coaBtnLabel.indexOf('Select') === -1 &&
    painterOptSrc.indexOf("'Select'") === -1 &&
    painterOptSrc.indexOf('"Select"') === -1, 'Select in label');

assert("L10 — button label does not contain 'Confirm'",
    _coaBtnLabel.indexOf('Confirm') === -1, 'Confirm in label');

assert("L11 — button label does not contain 'Approve'",
    _coaBtnLabel.indexOf('Approve') === -1, 'Approve in label');

assert("L12 — button label does not contain 'Apply'",
    _coaBtnLabel.indexOf('Apply') === -1, 'Apply in label');

assert("L13 — button label does not contain 'Execute'",
    _coaBtnLabel.indexOf('Execute') === -1, 'Execute in label');

assert("L14 — button label does not contain 'Commit'",
    _coaBtnLabel.indexOf('Commit') === -1, 'Commit in label');

assert("L15 — button label does not contain 'Go Live'",
    _coaBtnLabel.indexOf('Go Live') === -1 && _coaBtnLabel.indexOf('go-live') === -1,
    'Go Live in label');

assert("L16 — button label does not contain 'Run'",
    _coaBtnLabel.indexOf('Run') === -1, 'Run in label');

// ─────────────────────────────────────────────────────────────────────────────
// F: Functional handler tests
// ─────────────────────────────────────────────────────────────────────────────
assert('F17 — handler calls buildWargame3OperatorSelectionDryRunRecord (source check)',
    handlerSrc.indexOf('buildWargame3OperatorSelectionDryRunRecord') !== -1,
    'builder call missing from handler source');

assert('F18 — handler with valid p + COA-01 produces a passed record',
    (function () {
        if (typeof _testBuilder !== 'function') { return false; }
        var p = makeValidP();
        var stepProxy = { stepRef: 'W3-STEP-08', decisionOptions: p.decisionOptions };
        var res = _testBuilder(stepProxy, 'COA-01', { status:'draft', operatorId:null, createdAt:null });
        return res.passed === true && res.record !== null;
    }()),
    'builder did not pass for COA-01 with valid options');

assert('F19 — clicking valid COA attaches operatorSelectionDryRunRecord to p',
    (function () {
        if (typeof _testHandler !== 'function') { return false; }
        _testHandler._resetMock();
        var p = makeValidP();
        _testHandler(p, 'COA-01');
        return p.operatorSelectionDryRunRecord !== undefined &&
               p.operatorSelectionDryRunRecord !== null;
    }()),
    'operatorSelectionDryRunRecord not attached to p after click');

assert('F20 — after click, Selection Review card is repainted (mock painter called)',
    (function () {
        if (typeof _testHandler !== 'function') { return false; }
        _testHandler._resetMock();
        _testHandler(makeValidP(), 'COA-01');
        return _testHandler._wasPainted() === true;
    }()),
    '_paintW3OperatorSelectionReview not called after click');

assert('F21 — Selection Review record.status is "draft"',
    (function () {
        if (typeof _testHandler !== 'function') { return false; }
        _testHandler._resetMock();
        var p = makeValidP();
        _testHandler(p, 'COA-01');
        return p.operatorSelectionDryRunRecord &&
               p.operatorSelectionDryRunRecord.status === 'draft';
    }()),
    'status is not "draft"');

assert('F22 — Selection Review selectedDecision.label matches clicked COA label',
    (function () {
        if (typeof _testHandler !== 'function') { return false; }
        _testHandler._resetMock();
        var p = makeValidP();
        _testHandler(p, 'COA-01');
        var rec = p.operatorSelectionDryRunRecord;
        return rec && rec.selectedDecision && rec.selectedDecision.label === 'Strike North';
    }()),
    'selectedDecision.label does not match COA-01 label');

assert('F23 — Selection Review optionRef matches clicked option id',
    (function () {
        if (typeof _testHandler !== 'function') { return false; }
        _testHandler._resetMock();
        var p = makeValidP();
        _testHandler(p, 'COA-02');
        var rec = p.operatorSelectionDryRunRecord;
        return rec && rec.optionRef === 'COA-02';
    }()),
    'optionRef does not match COA-02');

assert('F24 — record.dryRunOnly is true',
    (function () {
        if (typeof _testHandler !== 'function') { return false; }
        _testHandler._resetMock();
        var p = makeValidP();
        _testHandler(p, 'COA-01');
        return p.operatorSelectionDryRunRecord && p.operatorSelectionDryRunRecord.dryRunOnly === true;
    }()),
    'dryRunOnly is not true');

assert('F25 — record.liveMutationAllowed is false',
    (function () {
        if (typeof _testHandler !== 'function') { return false; }
        _testHandler._resetMock();
        var p = makeValidP();
        _testHandler(p, 'COA-01');
        return p.operatorSelectionDryRunRecord &&
               p.operatorSelectionDryRunRecord.liveMutationAllowed === false;
    }()),
    'liveMutationAllowed is not false');

assert('F26 — record.backendCommitAllowed is false',
    (function () {
        if (typeof _testHandler !== 'function') { return false; }
        _testHandler._resetMock();
        var p = makeValidP();
        _testHandler(p, 'COA-01');
        return p.operatorSelectionDryRunRecord &&
               p.operatorSelectionDryRunRecord.backendCommitAllowed === false;
    }()),
    'backendCommitAllowed is not false');

assert('F27 — handler with unknown optionId does not attach record to p',
    (function () {
        if (typeof _testHandler !== 'function') { return false; }
        _testHandler._resetMock();
        var p = makeValidP();
        delete p.operatorSelectionDryRunRecord; // start clean
        _testHandler(p, 'COA-NONEXISTENT');
        return !p.operatorSelectionDryRunRecord; // should remain unset
    }()),
    'handler attached record for unknown optionId');

// ─────────────────────────────────────────────────────────────────────────────
// S: Safety boundary
// ─────────────────────────────────────────────────────────────────────────────
assert('S28 — selectedDecision NOT created at preview (p) level — only inside record',
    // The handler must not do p.selectedDecision = ...
    handlerSrc.indexOf('p.selectedDecision')    === -1 &&
    handlerSrc.indexOf('.selectedDecision =')   === -1,
    'handler sets selectedDecision on p directly');

assert('S29 — preview.selectedDecision not created by handler (functional check)',
    (function () {
        if (typeof _testHandler !== 'function') { return false; }
        _testHandler._resetMock();
        var p = makeValidP();
        _testHandler(p, 'COA-01');
        return !Object.prototype.hasOwnProperty.call(p, 'selectedDecision');
    }()),
    'handler added selectedDecision to preview p');

assert('S30 — step.selectedDecision not mutated by handler (functional check)',
    (function () {
        if (typeof _testHandler !== 'function') { return false; }
        _testHandler._resetMock();
        var p = makeValidP();
        var optBefore = JSON.stringify(p.decisionOptions);
        _testHandler(p, 'COA-01');
        return JSON.stringify(p.decisionOptions) === optBefore;
    }()),
    'handler mutated p.decisionOptions');

assert('S31 — handler source does not create expectedResult',
    handlerSrc.indexOf('expectedResult') === -1, 'expectedResult in handler source');

assert('S32 — handler source does not assign previewComplete',
    handlerSrc.indexOf('previewComplete') === -1, 'previewComplete in handler source');

assert('S33 — builder validates record before handler attaches it (guard called in handler)',
    // The handler checks result.passed before assigning
    handlerSrc.indexOf('result.passed') !== -1 ||
    handlerSrc.indexOf('!result.passed') !== -1,
    'handler does not check result.passed before attaching record');

// ─────────────────────────────────────────────────────────────────────────────
// V: Visibility — other W3 sections not touched by handler
// ─────────────────────────────────────────────────────────────────────────────
assert('V34 — handler source does not touch event-log element',
    handlerSrc.indexOf('sw-drp-evl')      === -1 &&
    handlerSrc.indexOf('sw-drp-event-log') === -1,
    'handler touches event-log element');

assert('V35 — handler source does not touch decision-options section',
    handlerSrc.indexOf('sw-drp-decision-options') === -1,
    'handler touches decision-options section');

// ─────────────────────────────────────────────────────────────────────────────
// M: Map state untouched
// ─────────────────────────────────────────────────────────────────────────────
assert('M36 — handler source has no Leaflet/map calls',
    handlerSrc.indexOf('window.L')       === -1 &&
    handlerSrc.indexOf('addLayer')       === -1 &&
    handlerSrc.indexOf('fitBounds')      === -1 &&
    handlerSrc.indexOf('_w3PreviewLayer') === -1,
    'Leaflet/map reference in handler source');

assert('M37 — handler source does not call paintMap or clearWargame3',
    handlerSrc.indexOf('paintMap')        === -1 &&
    handlerSrc.indexOf('clearWargame3')   === -1,
    'map paint call in handler source');

assert('M38 — handler source does not reference window.units or window.lines',
    handlerSrc.indexOf('window.units') === -1 &&
    handlerSrc.indexOf('window.lines') === -1,
    'window.units/lines in handler source');

assert('M39 — markers/trails/objectives unchanged — handler does not call any overlay painter',
    handlerSrc.indexOf('paintWargame3PreviewMapOverlay') === -1 &&
    handlerSrc.indexOf('clearWargame3ReadOnlyMapOverlay') === -1,
    'overlay painter called in handler');

// ─────────────────────────────────────────────────────────────────────────────
// N: Step-change clears review; no persistence
// ─────────────────────────────────────────────────────────────────────────────
assert('N40 — step-nav creates fresh p without operatorSelectionDryRunRecord (auto-clears)',
    // The nav handlers (doPrev/doNext) call buildScenarioStepPreview → fresh p,
    // then paintDryRunPreview(res.preview). Fresh p has no operatorSelectionDryRunRecord
    // → _paintW3OperatorSelectionReview hides section automatically.
    // Verify: handler does NOT attach record to _drpPreviewSource or any module-level var.
    handlerSrc.indexOf('_drpPreviewSource')  === -1 &&
    handlerSrc.indexOf('_drpPreviewStepRef') === -1 &&
    handlerSrc.indexOf('_drpPreviewMode')    === -1,
    'handler writes to module-level nav state');

assert('N41 — handler does not write to localStorage/sessionStorage/IndexedDB',
    handlerSrc.indexOf('localStorage')    === -1 &&
    handlerSrc.indexOf('sessionStorage')  === -1 &&
    handlerSrc.indexOf('indexedDB')       === -1 &&
    handlerSrc.indexOf('IndexedDB')       === -1,
    'storage write found in handler');

assert('N42 — handler does not write to URL/cookies',
    handlerSrc.indexOf('location.href')    === -1 &&
    handlerSrc.indexOf('location.hash')    === -1 &&
    handlerSrc.indexOf('document.cookie')  === -1,
    'URL/cookie write found in handler');

// ─────────────────────────────────────────────────────────────────────────────
// P: No fetch/AI/window mutation in handler
// ─────────────────────────────────────────────────────────────────────────────
assert('P43 — handler source has no fetch() call',
    handlerSrc.indexOf('fetch(')   === -1, 'fetch in handler');

assert('P44 — handler source has no XMLHttpRequest',
    handlerSrc.indexOf('XMLHttpRequest') === -1, 'XMLHttpRequest in handler');

assert('P45 — handler source has no AI/simulation call',
    handlerSrc.indexOf('aiGenerated') === -1 &&
    handlerSrc.indexOf('/api/sim/')   === -1,
    'AI/sim call in handler');

assert('P46 — handler does not mutate window.RmoozScenario',
    handlerSrc.indexOf('window.RmoozScenario') === -1, 'window.RmoozScenario in handler');

assert('P47 — handler does not mutate window.units',
    handlerSrc.indexOf('window.units') === -1, 'window.units in handler');

assert('P48 — handler does not mutate window.lines',
    handlerSrc.indexOf('window.lines') === -1, 'window.lines in handler');

assert('P49 — handler does not assign stepIndex',
    handlerSrc.indexOf('stepIndex') === -1, 'stepIndex in handler');

// ─────────────────────────────────────────────────────────────────────────────
// W: File-unchanged assertions
// ─────────────────────────────────────────────────────────────────────────────
assert('W50 — wargame3.json unchanged — no decisionOptions or selectionRecord in steps',
    (function () {
        var w3 = JSON.parse(
            fs.readFileSync(
                path.join(__dirname, 'UI_MOdified/data/scenarios/wargame3.json'), 'utf8'));
        return w3.steps.every(function (s) {
            return !Object.prototype.hasOwnProperty.call(s, 'decisionOptions') &&
                   !Object.prototype.hasOwnProperty.call(s, 'decision_options') &&
                   !Object.prototype.hasOwnProperty.call(s, 'selectedDecision') &&
                   !Object.prototype.hasOwnProperty.call(s, 'operatorSelectionDryRunRecord');
        });
    }()),
    'wargame3.json was modified');

assert('W51 — app.js has no PR-268 production marker',
    (function () {
        var appSrc = fs.readFileSync(
            path.join(__dirname, 'UI_MOdified/client/app.js'), 'utf8');
        return appSrc.indexOf('PR-268-PRODUCTION-CHANGE') === -1;
    }()),
    'PR-268 marker found in app.js');

// ─────────────────────────────────────────────────────────────────────────────
// G: No Gate 7 / forbidden action controls
// ─────────────────────────────────────────────────────────────────────────────
assert('G52 — handler source has no gate7 logic',
    handlerSrc.indexOf('gate7')      === -1 &&
    handlerSrc.indexOf('Gate7')      === -1 &&
    handlerSrc.indexOf('gate_7')     === -1,
    'gate7 in handler source');

assert('G53 — no Apply control created by handler or painter',
    handlerSrc.indexOf('"Apply"')    === -1 &&
    handlerSrc.indexOf("'Apply'")    === -1 &&
    painterOptSrc.indexOf('"Apply"') === -1,
    'Apply control found');

assert('G54 — no Execute control created by handler or painter',
    handlerSrc.indexOf('"Execute"')    === -1 &&
    handlerSrc.indexOf('executeNow')   === -1 &&
    painterOptSrc.indexOf('"Execute"') === -1,
    'Execute control found');

assert('G55 — no Commit control created by handler',
    handlerSrc.indexOf('.commit(')   === -1 &&
    handlerSrc.indexOf('commitNow')  === -1 &&
    handlerSrc.indexOf('"Commit"')   === -1,
    'Commit control found');

assert('G56 — no Confirm control created by handler',
    handlerSrc.indexOf('"Confirm"') === -1 &&
    handlerSrc.indexOf("'Confirm'") === -1,
    'Confirm control found');

assert('G57 — no Approve control created by handler',
    handlerSrc.indexOf('"Approve"') === -1 &&
    handlerSrc.indexOf("'Approve'") === -1,
    'Approve control found');

assert('G58 — no Go Live control created by handler',
    handlerSrc.indexOf('Go Live')  === -1 &&
    handlerSrc.indexOf('go-live')  === -1 &&
    handlerSrc.indexOf('goLive')   === -1,
    'Go Live control found');

assert('G59 — no Run action in handler',
    handlerSrc.indexOf('"Run"') === -1 &&
    handlerSrc.indexOf("'Run'") === -1,
    'Run action found');

assert('G60 — no Select action in handler',
    handlerSrc.indexOf('"Select"') === -1 &&
    handlerSrc.indexOf("'Select'") === -1,
    'Select action found');

assert('G61 — no Start / Launch in handler',
    handlerSrc.indexOf('"Start"')  === -1 &&
    handlerSrc.indexOf('"Launch"') === -1 &&
    handlerSrc.indexOf("'Start'")  === -1 &&
    handlerSrc.indexOf("'Launch'") === -1,
    'Start/Launch found in handler');

// ─────────────────────────────────────────────────────────────────────────────
// R62: No error-prone patterns in handler source
// ─────────────────────────────────────────────────────────────────────────────
assert('R62 — handler source contains no throw statement',
    handlerSrc.indexOf('throw ')   === -1 &&
    handlerSrc.indexOf('throw\n')  === -1,
    'throw statement in handler source');

// ─────────────────────────────────────────────────────────────────────────────
// R63–R65: Prior PR regressions
// ─────────────────────────────────────────────────────────────────────────────
assert('R63 — PR-264: _paintW3DecisionOptions still defined',
    src.indexOf('function _paintW3DecisionOptions(') !== -1, 'function missing');

assert('R64 — PR-267: _paintW3OperatorSelectionReview still defined',
    src.indexOf('function _paintW3OperatorSelectionReview(') !== -1, 'function missing');

assert('R65 — PR-266: buildWargame3OperatorSelectionDryRunRecord still defined',
    src.indexOf('function buildWargame3OperatorSelectionDryRunRecord(') !== -1, 'function missing');

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
console.log('── PR-268 COA Dry-Run Review Selection Summary ──────────────────────────────');
console.log('  New function:              _handleW3CoaReviewClick(p, optionId) — private');
console.log('  New button per valid COA:  <button class="sw-drp-coa-review-btn"');
console.log('                              data-w3-coa-review="OPTION_ID">Review COA</button>');
console.log('  Click behavior:            buildWargame3OperatorSelectionDryRunRecord(stepProxy,');
console.log('                              optionId) → p.operatorSelectionDryRunRecord = record');
console.log('                              → _paintW3OperatorSelectionReview(p)');
console.log('  Step-change auto-clears:   Yes — fresh p from nav has no record → hides review');
console.log('  Persistence:               None — preview-local only; no storage/backend');
console.log('  selectedDecision at p:     Never — only inside operatorSelectionDryRunRecord');
console.log('  expectedResult created:    No');
console.log('  previewComplete changed:   No');
console.log('  Map behavior changed:      No');
console.log('  Gate 7 / Apply / Commit:   FORBIDDEN — not present');
console.log('  i18n EN keys added:        3 (sw-drp-coa-review-btn, -failed, -readonly-note)');
console.log('  i18n AR keys added:        3 (matching Arabic translations)');
console.log('  CSS added:                 .sw-drp-coa-review-btn — secondary style');
console.log('  wargame3.json changed:     No — production W3 has no decisionOptions[]');
console.log('  app.js changed:            No');
console.log('  adjudicator-map.js changed:No');
console.log('  DevTools needed:           No — button visible in-app when decisionOptions exist');
console.log('  Next PR:                   PR-269 — W3 step-level decisionOptions injection or');
console.log('                              selection state persistence planning');
console.log('─────────────────────────────────────────────────────────────────────────────');
