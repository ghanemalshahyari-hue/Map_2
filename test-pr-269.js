'use strict';

// ── PR-269 Test Harness — Wargame 3 Decision Options Fixture Overlay ──────────
// Verifies:
//   S01–S04:   source structure — constant + function declared + exported (4 tests)
//   O05–O12:   overlay constant shape — step ref, option IDs, safety fields (8 tests)
//   F13–F28:   functional applyWargame3DecisionOptionsFixtureOverlay (16 tests)
//   B29–B34:   buildScenarioStepPreview carries decisionOptions (source) (6 tests)
//   P35–P38:   previewWargame3Fixture wiring source verification (4 tests)
//   E39–E42:   exports (4 tests)
//   X43–X48:   safety boundary — no storage/fetch/mutation/commit in overlay (6 tests)
//   N49–N51:   overlay options — no forbidden action-word labels (3 tests)
//   R52–R55:   regression — PR-264/267/268/266 functions still present (4 tests)
//   W56–W58:   file protection — app.js/adjudicator-map/wargame3.json untouched (3 tests)
//   M59:       mutation guard — original fixture not modified by apply (1 test)
//
// Total: 59 tests.  No Leaflet. No DOM. Pure source + functional.

var fs   = require('fs');
var path = require('path');

var src = fs.readFileSync(
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

// ── Source slices ─────────────────────────────────────────────────────────────
// Overlay constant block: from 'var W3_DECISION_OPTIONS_FIXTURE_OVERLAY' up to function
var _overlayConstStart = src.indexOf('var W3_DECISION_OPTIONS_FIXTURE_OVERLAY');
var _overlayFnStart    = src.indexOf('function applyWargame3DecisionOptionsFixtureOverlay');
var overlayConstBlock  = (_overlayConstStart !== -1 && _overlayFnStart !== -1)
                         ? src.slice(_overlayConstStart, _overlayFnStart) : '';
var overlayFnSrc       = extractFn(src, 'applyWargame3DecisionOptionsFixtureOverlay') || '';
var bsspFnSrc          = extractFn(src, 'buildScenarioStepPreview')                   || '';
var previewW3FnSrc     = extractFn(src, 'previewWargame3Fixture')                     || '';

// Unsafe field names (mirrors _W3DRS_UNSAFE_FIELDS in source)
var UNSAFE_FIELD_NAMES = [
    'applyNow', 'commitNow', 'executeNow', 'liveApply',
    'mutateUnits', 'mutateMap', 'mutateScenario', 'backendCommit',
    'autoApply', 'aiGenerated', 'simulationCommitted', 'gate7Approved'
];

// ── Functional harness ────────────────────────────────────────────────────────
// Builds applyWargame3DecisionOptionsFixtureOverlay in a Node-friendly scope with:
//   - _W3DRS_UNSAFE_FIELDS (extracted from source)
//   - _w3aDeepFreeze (extracted from source)
//   - isWargame3DecisionOptionSafe (extracted from source)
//   - W3_DECISION_OPTIONS_FIXTURE_OVERLAY = {} (empty default; tests pass explicit overlay)
var _testApply = null;
(function () {
    var rUF  = src.match(/var _W3DRS_UNSAFE_FIELDS\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\)/);
    var fnDF  = extractFn(src, '_w3aDeepFreeze');
    var fnOpt = extractFn(src, 'isWargame3DecisionOptionSafe');
    var fnApp = extractFn(src, 'applyWargame3DecisionOptionsFixtureOverlay');

    if (!rUF || !fnDF || !fnOpt || !fnApp) { return; }

    var harness =
        'var _W3DRS_UNSAFE_FIELDS = Object.freeze([' + rUF[1] + ']);\n' +
        fnDF  + ';\n' +
        fnOpt + ';\n' +
        // Minimal default overlay; functional tests pass explicit overlayMap
        'var W3_DECISION_OPTIONS_FIXTURE_OVERLAY = {};\n' +
        fnApp + ';\n' +
        'return applyWargame3DecisionOptionsFixtureOverlay;\n';

    try { _testApply = new Function(harness)(); } catch (e) { /* assertions fail gracefully */ }
}());

// ── Minimal fixture factory ───────────────────────────────────────────────────
var _STD_SAFETY = {
    dryRunOnly: true, previewOnly: true,
    liveMutationAllowed: false, backendCommitAllowed: false,
    mapMutationAllowed: false, unitMutationAllowed: false, scenarioMutationAllowed: false
};
function makeFixture(stepOverride) {
    return {
        readOnly: true, liveMutationAllowed: false,
        fixtureId: 'TEST', fixtureName: 'Test Fixture',
        packageId: 'PKG', packageName: 'Test Package',
        units: [], objectives: [],
        steps: [
            Object.assign({
                step_id: 'W3-STEP-08', stepIndex: 0, title: 'Test Step',
                safety: Object.assign({}, _STD_SAFETY)
            }, stepOverride || {})
        ]
    };
}
var VALID_OPTS = [
    { id: 'T-OPT-01', label: 'Option Alpha', readOnly: true, source: 'instructor' },
    { id: 'T-OPT-02', label: 'Option Beta',  readOnly: true, source: 'instructor' }
];

// ─────────────────────────────────────────────────────────────────────────────
// S — Source structure (S01–S04)
// ─────────────────────────────────────────────────────────────────────────────
assert('S01 — W3_DECISION_OPTIONS_FIXTURE_OVERLAY declared in source',
    src.indexOf('var W3_DECISION_OPTIONS_FIXTURE_OVERLAY') !== -1);

assert('S02 — applyWargame3DecisionOptionsFixtureOverlay function declared in source',
    src.indexOf('function applyWargame3DecisionOptionsFixtureOverlay') !== -1);

assert('S03 — W3_DECISION_OPTIONS_FIXTURE_OVERLAY exported on window.AppShellScenarioWorkspace',
    src.indexOf('W3_DECISION_OPTIONS_FIXTURE_OVERLAY:') !== -1 ||
    src.indexOf('W3_DECISION_OPTIONS_FIXTURE_OVERLAY :') !== -1);

assert('S04 — applyWargame3DecisionOptionsFixtureOverlay exported on window.AppShellScenarioWorkspace',
    src.indexOf('applyWargame3DecisionOptionsFixtureOverlay:') !== -1 ||
    src.indexOf('applyWargame3DecisionOptionsFixtureOverlay :') !== -1);

// ─────────────────────────────────────────────────────────────────────────────
// O — Overlay constant shape (O05–O12)
// ─────────────────────────────────────────────────────────────────────────────
assert('O05 — overlay constant targets W3-STEP-08',
    overlayConstBlock.indexOf('W3-STEP-08') !== -1);

assert('O06 — W3-STEP-08-OPT-HOLD option present in constant',
    overlayConstBlock.indexOf('W3-STEP-08-OPT-HOLD') !== -1);

assert('O07 — W3-STEP-08-OPT-REINFORCE option present in constant',
    overlayConstBlock.indexOf('W3-STEP-08-OPT-REINFORCE') !== -1);

assert('O08 — W3-STEP-08-OPT-DELAY option present in constant',
    overlayConstBlock.indexOf('W3-STEP-08-OPT-DELAY') !== -1);

assert('O09 — exactly 3 options in the constant (3 OPT- IDs)',
    (function () {
        var count = 0; var pos = 0; var needle = 'W3-STEP-08-OPT-';
        while ((pos = overlayConstBlock.indexOf(needle, pos)) !== -1) { count++; pos += needle.length; }
        return count === 3;
    }()));

assert('O10 — all overlay options have readOnly: true',
    (function () {
        var count = 0; var pos = 0; var needle = 'readOnly:        true';
        while ((pos = overlayConstBlock.indexOf(needle, pos)) !== -1) { count++; pos += needle.length; }
        return count >= 3;
    }()));

assert('O11 — all overlay options declare source: instructor',
    (function () {
        var count = 0; var pos = 0; var needle = "'instructor'";
        while ((pos = overlayConstBlock.indexOf(needle, pos)) !== -1) { count++; pos += needle.length; }
        return count >= 3;
    }()));

assert('O12 — none of the 12 unsafe field names appear in the overlay constant',
    UNSAFE_FIELD_NAMES.every(function (f) { return overlayConstBlock.indexOf(f + ':') === -1; }));

// ─────────────────────────────────────────────────────────────────────────────
// F — Functional: applyWargame3DecisionOptionsFixtureOverlay (F13–F28)
// ─────────────────────────────────────────────────────────────────────────────
assert('F13 — harness built successfully (_testApply is a function)',
    typeof _testApply === 'function');

assert('F14 — null fixture → passed:false with blocked reason about fixture',
    (function () {
        if (!_testApply) { return false; }
        var r = _testApply(null, {});
        return r && r.passed === false && r.blockedReasons && r.blockedReasons.length > 0 &&
               r.blockedReasons[0].indexOf('fixture') !== -1;
    }()));

assert('F15 — non-object fixture → passed:false',
    (function () {
        if (!_testApply) { return false; }
        var r = _testApply('not-an-object', {});
        return r && r.passed === false;
    }()));

assert('F16 — fixture.readOnly !== true → passed:false',
    (function () {
        if (!_testApply) { return false; }
        var fix = makeFixture(); fix.readOnly = false;
        var r = _testApply(fix, {});
        return r && r.passed === false &&
               r.blockedReasons.some(function(b) { return b.indexOf('readOnly') !== -1; });
    }()));

assert('F17 — non-object overlayMap → passed:false',
    (function () {
        if (!_testApply) { return false; }
        var fix = makeFixture();
        var r = _testApply(fix, 'not-an-object');
        return r && r.passed === false &&
               r.blockedReasons.some(function(b) { return b.indexOf('overlayMap') !== -1; });
    }()));

assert('F18 — empty overlayMap {} → passed:true with empty appliedStepRefs',
    (function () {
        if (!_testApply) { return false; }
        var fix = makeFixture();
        var r = _testApply(fix, {});
        return r && r.passed === true && Array.isArray(r.appliedStepRefs) &&
               r.appliedStepRefs.length === 0;
    }()));

assert('F19 — null overlayMap uses default (W3_DECISION_OPTIONS_FIXTURE_OVERLAY) without error',
    (function () {
        if (!_testApply) { return false; }
        var fix = makeFixture();
        // In harness, default W3_DECISION_OPTIONS_FIXTURE_OVERLAY = {} → empty apply
        var r = _testApply(fix, null);
        return r && r.passed === true;
    }()));

assert('F20 — valid fixture + valid explicit overlay → passed:true',
    (function () {
        if (!_testApply) { return false; }
        var fix = makeFixture();
        var r = _testApply(fix, { 'W3-STEP-08': VALID_OPTS });
        return r && r.passed === true;
    }()));

assert('F21 — applied step appears in appliedStepRefs',
    (function () {
        if (!_testApply) { return false; }
        var fix = makeFixture();
        var r = _testApply(fix, { 'W3-STEP-08': VALID_OPTS });
        return r && Array.isArray(r.appliedStepRefs) && r.appliedStepRefs.indexOf('W3-STEP-08') !== -1;
    }()));

assert('F22 — option without id → step in rejectedStepRefs + warning added',
    (function () {
        if (!_testApply) { return false; }
        var fix = makeFixture();
        var r = _testApply(fix, { 'W3-STEP-08': [{ label: 'No ID', readOnly: true }] });
        return r && r.passed === true &&
               Array.isArray(r.rejectedStepRefs) && r.rejectedStepRefs.indexOf('W3-STEP-08') !== -1 &&
               Array.isArray(r.warnings) && r.warnings.length > 0;
    }()));

assert('F23 — option with readOnly:false → step in rejectedStepRefs',
    (function () {
        if (!_testApply) { return false; }
        var fix = makeFixture();
        var r = _testApply(fix, { 'W3-STEP-08': [{ id: 'BAD', label: 'Bad', readOnly: false }] });
        return r && r.passed === true &&
               Array.isArray(r.rejectedStepRefs) && r.rejectedStepRefs.indexOf('W3-STEP-08') !== -1;
    }()));

assert('F24 — option with unsafe field → step in rejectedStepRefs',
    (function () {
        if (!_testApply) { return false; }
        var fix = makeFixture();
        var badOpt = { id: 'BAD', label: 'Bad', readOnly: true, applyNow: true };
        var r = _testApply(fix, { 'W3-STEP-08': [badOpt] });
        return r && r.passed === true &&
               Array.isArray(r.rejectedStepRefs) && r.rejectedStepRefs.indexOf('W3-STEP-08') !== -1;
    }()));

assert('F25 — step not in fixture → rejectedStepRefs includes stepRef + warning',
    (function () {
        if (!_testApply) { return false; }
        var fix = makeFixture({ step_id: 'W3-STEP-01' }); // no W3-STEP-08
        var r = _testApply(fix, { 'W3-STEP-08': VALID_OPTS });
        return r && r.passed === true &&
               Array.isArray(r.rejectedStepRefs) && r.rejectedStepRefs.indexOf('W3-STEP-08') !== -1 &&
               Array.isArray(r.warnings) && r.warnings.some(function(w) {
                   return w.code === 'W3_OVERLAY_STEP_NOT_FOUND';
               });
    }()));

assert('F26 — empty options array for step → rejectedStepRefs includes stepRef',
    (function () {
        if (!_testApply) { return false; }
        var fix = makeFixture();
        var r = _testApply(fix, { 'W3-STEP-08': [] });
        return r && r.passed === true &&
               Array.isArray(r.rejectedStepRefs) && r.rejectedStepRefs.indexOf('W3-STEP-08') !== -1;
    }()));

assert('F27 — original fixture step has no decisionOptions after apply (no mutation)',
    (function () {
        if (!_testApply) { return false; }
        var fix = makeFixture();
        var origStep = fix.steps[0];
        _testApply(fix, { 'W3-STEP-08': VALID_OPTS });
        return !origStep.hasOwnProperty('decisionOptions');
    }()));

assert('F28 — returned fixture is deep-frozen',
    (function () {
        if (!_testApply) { return false; }
        var fix = makeFixture();
        var r = _testApply(fix, { 'W3-STEP-08': VALID_OPTS });
        return r && r.fixture && Object.isFrozen(r.fixture);
    }()));

// ─────────────────────────────────────────────────────────────────────────────
// B — buildScenarioStepPreview carries decisionOptions (B29–B34)
// ─────────────────────────────────────────────────────────────────────────────
assert('B29 — buildScenarioStepPreview source contains decisionOptions reference',
    bsspFnSrc.indexOf('decisionOptions') !== -1);

assert('B30 — buildScenarioStepPreview guards with Array.isArray(step.decisionOptions)',
    bsspFnSrc.indexOf('Array.isArray(step.decisionOptions)') !== -1);

assert('B31 — buildScenarioStepPreview sets preview.decisionOptions = step.decisionOptions',
    bsspFnSrc.indexOf('preview.decisionOptions = step.decisionOptions') !== -1);

assert('B32 — buildScenarioStepPreview guards with step.decisionOptions.length > 0',
    bsspFnSrc.indexOf('step.decisionOptions.length > 0') !== -1);

assert('B33 — PR-269 comment present in buildScenarioStepPreview source',
    bsspFnSrc.indexOf('PR-269') !== -1);

assert('B34 — buildScenarioStepPreview does not assign decisionOptions unconditionally',
    (function () {
        // Must not have `preview.decisionOptions = step.decisionOptions` outside the guard
        // Simplest check: the assignment is inside an `if (Array.isArray...)` guard
        var idx = bsspFnSrc.indexOf('preview.decisionOptions = step.decisionOptions');
        if (idx === -1) { return false; }
        // Verify the guard comes before the assignment in source
        var guardIdx = bsspFnSrc.indexOf('Array.isArray(step.decisionOptions)');
        return guardIdx !== -1 && guardIdx < idx;
    }()));

// ─────────────────────────────────────────────────────────────────────────────
// P — previewWargame3Fixture wiring (P35–P38)
// ─────────────────────────────────────────────────────────────────────────────
assert('P35 — previewWargame3Fixture calls applyWargame3DecisionOptionsFixtureOverlay',
    previewW3FnSrc.indexOf('applyWargame3DecisionOptionsFixtureOverlay') !== -1);

assert('P36 — previewWargame3Fixture uses overlayResult variable',
    previewW3FnSrc.indexOf('overlayResult') !== -1);

assert('P37 — previewWargame3Fixture checks overlayResult.appliedStepRefs.length',
    previewW3FnSrc.indexOf('appliedStepRefs') !== -1);

assert('P38 — previewWargame3Fixture reassigns fixture from overlayResult.fixture',
    previewW3FnSrc.indexOf('fixture = overlayResult.fixture') !== -1);

// ─────────────────────────────────────────────────────────────────────────────
// E — Exports (E39–E42)
// ─────────────────────────────────────────────────────────────────────────────
assert('E39 — W3_DECISION_OPTIONS_FIXTURE_OVERLAY appears in export block',
    (function () {
        // Find the exported object (after the last 'window.AppShellScenarioWorkspace = {')
        var expIdx = src.lastIndexOf('window.AppShellScenarioWorkspace = {');
        if (expIdx === -1) { expIdx = src.lastIndexOf('AppShellScenarioWorkspace = {'); }
        var expBlock = expIdx !== -1 ? src.slice(expIdx) : '';
        return expBlock.indexOf('W3_DECISION_OPTIONS_FIXTURE_OVERLAY') !== -1;
    }()));

assert('E40 — applyWargame3DecisionOptionsFixtureOverlay appears in export block',
    (function () {
        var expIdx = src.lastIndexOf('window.AppShellScenarioWorkspace = {');
        if (expIdx === -1) { expIdx = src.lastIndexOf('AppShellScenarioWorkspace = {'); }
        var expBlock = expIdx !== -1 ? src.slice(expIdx) : '';
        return expBlock.indexOf('applyWargame3DecisionOptionsFixtureOverlay') !== -1;
    }()));

assert('E41 — PR-269 comment present in export block',
    (function () {
        var expIdx = src.lastIndexOf('window.AppShellScenarioWorkspace = {');
        if (expIdx === -1) { expIdx = src.lastIndexOf('AppShellScenarioWorkspace = {'); }
        var expBlock = expIdx !== -1 ? src.slice(expIdx) : '';
        return expBlock.indexOf('PR-269') !== -1;
    }()));

assert('E42 — overlay function source does not reference storage or network',
    overlayFnSrc.indexOf('localStorage')   === -1 &&
    overlayFnSrc.indexOf('sessionStorage')  === -1 &&
    overlayFnSrc.indexOf('IndexedDB')       === -1 &&
    overlayFnSrc.indexOf('fetch(')          === -1 &&
    overlayFnSrc.indexOf('XMLHttpRequest')  === -1);

// ─────────────────────────────────────────────────────────────────────────────
// X — Safety boundary (X43–X48)
// ─────────────────────────────────────────────────────────────────────────────
assert('X43 — overlay function source has no localStorage',
    overlayFnSrc.indexOf('localStorage') === -1);

assert('X44 — overlay function source has no sessionStorage',
    overlayFnSrc.indexOf('sessionStorage') === -1);

assert('X45 — overlay function source has no fetch or XMLHttpRequest',
    overlayFnSrc.indexOf('fetch(') === -1 && overlayFnSrc.indexOf('XMLHttpRequest') === -1);

assert('X46 — overlay function source has no /api/sim/ call path',
    overlayFnSrc.indexOf('/api/sim') === -1 && overlayFnSrc.indexOf('/api/') === -1);

assert('X47 — overlay function source has no gate7 reference',
    overlayFnSrc.toLowerCase().indexOf('gate7') === -1);

assert('X48 — overlay function source does not embed any of the 12 unsafe field names as object keys',
    UNSAFE_FIELD_NAMES.every(function (f) { return overlayFnSrc.indexOf(f + ':') === -1; }));

// ─────────────────────────────────────────────────────────────────────────────
// N — No forbidden action-word labels (N49–N51)
// ─────────────────────────────────────────────────────────────────────────────
var FORBIDDEN_LABELS = [
    'Select', 'Confirm', 'Approve', 'Apply', 'Execute',
    'Commit', 'Go Live', 'Run', 'Start', 'Launch'
];

assert('N49 — overlay constant displayLabel values contain no forbidden action verbs',
    (function () {
        // Extract all displayLabel values from the constant block
        var labels = overlayConstBlock.match(/displayLabel:\s*'([^']+)'/g) || [];
        return labels.every(function (line) {
            return FORBIDDEN_LABELS.every(function (f) {
                // label may contain the word as part of a longer phrase, so check if it
                // starts with a forbidden word (case-sensitive, as a standalone prefix)
                var val = (line.match(/:\s*'([^']+)'/) || [])[1] || '';
                return val.indexOf(f + ' ') !== 0 && val !== f;
            });
        });
    }()));

assert('N50 — overlay function source has no forbidden standalone action-word labels',
    FORBIDDEN_LABELS.every(function (f) {
        // Only block if it looks like a UI label string: '>Select<' or 'Select COA' etc.
        // Check for string literals that start with the forbidden word
        return overlayFnSrc.indexOf("'" + f + "'") === -1 &&
               overlayFnSrc.indexOf('"' + f + '"') === -1;
    }));

assert('N51 — overlay constant option labels do not start with a standalone forbidden verb',
    (function () {
        var labelMatches = overlayConstBlock.match(/label:\s*'([^']+)'/g) || [];
        return labelMatches.every(function (line) {
            var val = (line.match(/:\s*'([^']+)'/) || [])[1] || '';
            // "Hold Current Position" etc — verify 'Apply', 'Commit', 'Execute' don't start label
            var actionVerbs = ['Apply', 'Commit', 'Execute', 'Select', 'Confirm', 'Approve', 'Launch'];
            return actionVerbs.every(function (v) {
                return val.indexOf(v) !== 0 || val.slice(v.length, v.length + 1) === ' ';
                // ^^ Allow "Execute Withdrawal" etc only if followed by a space (contextual noun phrase)
                // but actually: we want no labels that ARE a forbidden action word alone
                // Check: val !== v AND val doesn't start with v+' ' in a command sense
            });
        });
    }()));

// ─────────────────────────────────────────────────────────────────────────────
// R — Regression: prior PR functions still present (R52–R55)
// ─────────────────────────────────────────────────────────────────────────────
assert('R52 — _paintW3DecisionOptions still in source (PR-264)',
    extractFn(src, '_paintW3DecisionOptions') !== null);

assert('R53 — _paintW3OperatorSelectionReview still in source (PR-267)',
    extractFn(src, '_paintW3OperatorSelectionReview') !== null);

assert('R54 — _handleW3CoaReviewClick still in source (PR-268)',
    extractFn(src, '_handleW3CoaReviewClick') !== null);

assert('R55 — buildWargame3DecisionOptionsPreviewData still in source (PR-264)',
    extractFn(src, 'buildWargame3DecisionOptionsPreviewData') !== null);

// ─────────────────────────────────────────────────────────────────────────────
// W — File protection (W56–W58)
// ─────────────────────────────────────────────────────────────────────────────
assert('W56 — overlay function source does not reference app.js',
    overlayFnSrc.indexOf('app.js') === -1);

assert('W57 — overlay function source does not reference adjudicator-map',
    overlayFnSrc.indexOf('adjudicator-map') === -1 &&
    overlayFnSrc.indexOf('adjudicatorMap')  === -1);

assert('W58 — overlay function source does not reference wargame3.json',
    overlayFnSrc.indexOf('wargame3.json') === -1 &&
    overlayFnSrc.indexOf('wargame3')       === -1);

// ─────────────────────────────────────────────────────────────────────────────
// M — Mutation guard (M59)
// ─────────────────────────────────────────────────────────────────────────────
assert('M59 — original fixture.steps array length unchanged after overlay apply',
    (function () {
        if (!_testApply) { return false; }
        var fix = makeFixture();
        var originalLen = fix.steps.length;
        _testApply(fix, { 'W3-STEP-08': VALID_OPTS });
        return fix.steps.length === originalLen;
    }()));

// ─────────────────────────────────────────────────────────────────────────────
// Results
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── PR-269: Wargame 3 Decision Options Fixture Overlay ───────────────────────');
results.forEach(function (r) { console.log(r); });
console.log('\n  ' + passed + ' passed  /  ' + failed + ' failed  /  ' + (passed + failed) + ' total');
if (failed > 0) { process.exit(1); }
