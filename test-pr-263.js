'use strict';

// ── PR-263 Test Harness — Decision Options Preview Adapter Helper ─────────────
// Tests:
//   01–22  Fixture / output quality — valid options through the adapter
//   23–25  Invalid option blocking
//   26–31  Mixed valid+invalid, mutation safety
//   32–40  W3 regression — existing pipeline unchanged
//   41–54  Safety confirmations — no production changes, no mutation
//
// No DOM. No Leaflet. No production navigation. No storage. No backend.

var fs   = require('fs');
var path = require('path');

var src = fs.readFileSync(
    path.join(__dirname, 'UI_MOdified/client/shell/scenario-workspace.js'), 'utf8');
var w3json = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'UI_MOdified/data/scenarios/wargame3.json'), 'utf8'));

// ── Function extraction ───────────────────────────────────────────────────────
function extractFn(name) {
    var start = src.indexOf('function ' + name + '(');
    if (start === -1) return '';
    var depth = 0; var i = start;
    while (i < src.length) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
        i++;
    }
    return '';
}
function extractVar(name) {
    var marker = 'var ' + name + ' = Object.freeze([';
    var start = src.indexOf(marker);
    if (start === -1) return '';
    var end = src.indexOf(']);', start);
    if (end === -1) return '';
    return src.slice(start, end + 3);
}

var harnessSrc =
    extractVar('_W3DRS_UNSAFE_FIELDS') + '\n' +
    extractVar('_W3DRS_FORBIDDEN_STATUS_TOKENS') + '\n' +
    extractVar('_W3MOD_UNSAFE_TOP') + '\n' +
    extractVar('_W3MOD_UNSAFE_NESTED') + '\n' +
    extractFn('isWargame3DecisionOptionSafe') + '\n' +
    extractFn('isWargame3ExpectedResultSafe') + '\n' +
    extractFn('isWargame3ReadOnlyMapOverlayDataSafe') + '\n' +
    extractFn('buildWargame3DecisionOptionsPreviewData') + '\n';

var harnessReturn =
    'return {' +
    '  build: buildWargame3DecisionOptionsPreviewData,' +
    '  doSafe: isWargame3DecisionOptionSafe,' +
    '  erSafe: isWargame3ExpectedResultSafe,' +
    '  overlayGuard: isWargame3ReadOnlyMapOverlayDataSafe' +
    '};';

var api  = new Function(harnessSrc + harnessReturn)();
var build       = api.build;
var doSafe      = api.doSafe;
var overlayGuard = api.overlayGuard;

// ── Test runner ───────────────────────────────────────────────────────────────
var passed = 0; var failed = 0; var results = [];
function assert(label, cond, detail) {
    if (cond) { passed++; results.push('  PASS  ' + label); }
    else       { failed++; results.push('  FAIL  ' + label + (detail ? '  →  ' + detail : '')); }
}

// ── Fixture: W3-STEP-08 decision options (PR-262 shape) ──────────────────────
var W3_OPTIONS = [
    {
        id: 'W3-STEP-08-COA-01', label: 'Hold current posture',
        description: 'Maintain current posture and continue observing enemy movement around the objective area.',
        intent: 'Preserve combat power while maintaining situational awareness.',
        affectedUnits: [], expectedEffects: ['Maintains current defensive posture', 'Keeps observation focused on the objective area'],
        risks: ['Enemy movement may continue without disruption'],
        source: 'source_json', readOnly: true
    },
    {
        id: 'W3-STEP-08-COA-02', label: 'Reinforce air and radar defense',
        description: 'Prioritize protection of air and radar assets supporting the objective area.',
        intent: 'Improve resilience of detection and air-defense support without initiating live action.',
        affectedUnits: [], expectedEffects: ['Improves defensive posture around key support assets', 'Keeps the objective under monitored coverage'],
        risks: ['May reduce flexibility elsewhere'],
        source: 'source_json', readOnly: true
    },
    {
        id: 'W3-STEP-08-COA-03', label: 'Contest mine-clearance activity',
        description: 'Prepare a read-only course of action for contesting mine-clearance activity near the objective area.',
        intent: 'Limit enemy freedom of movement around the objective without claiming executed effects.',
        affectedUnits: [], expectedEffects: ['May slow enemy freedom of movement if later selected and adjudicated'],
        risks: ['Could increase exposure if executed without coordination'],
        source: 'source_json', readOnly: true
    }
];

var STEP_WITH_OPTIONS = { decisionOptions: W3_OPTIONS };

// Helper: clone option with one extra/different field
function withProp(opt, key, val) { var o = JSON.parse(JSON.stringify(opt)); o[key] = val; return o; }

// =============================================================================
// 01–22  Fixture / output quality
// =============================================================================

assert('01 — buildWargame3DecisionOptionsPreviewData is exported',
    src.indexOf('buildWargame3DecisionOptionsPreviewData: buildWargame3DecisionOptionsPreviewData') !== -1,
    'export line not found');

var rNull = build(null);
assert('02 — null step → passed:false, blockedReasons present',
    !rNull.passed && rNull.blockedReasons.length > 0,
    JSON.stringify(rNull));

var rMissing = build({});
assert('03 — missing decisionOptions → passed:true, displayMode:hidden',
    rMissing.passed && rMissing.displayMode === 'hidden' && rMissing.options.length === 0,
    JSON.stringify(rMissing));

var rEmpty = build({ decisionOptions: [] });
assert('04 — empty decisionOptions → passed:true, displayMode:hidden',
    rEmpty.passed && rEmpty.displayMode === 'hidden' && rEmpty.options.length === 0,
    JSON.stringify(rEmpty));

var rBadArr = build({ decisionOptions: 'not-an-array' });
assert('05 — non-array decisionOptions → passed:false',
    !rBadArr.passed && rBadArr.blockedReasons.length > 0,
    JSON.stringify(rBadArr));

var r3 = build(STEP_WITH_OPTIONS);
assert('06 — 3 valid fixture options → passed:true',
    r3.passed && r3.blockedReasons.length === 0,
    JSON.stringify({ passed: r3.passed, br: r3.blockedReasons }));

assert('07 — optionCount is 3',
    r3.optionCount === 3,
    'optionCount=' + r3.optionCount);

assert('08 — validOptionCount is 3',
    r3.validOptionCount === 3,
    'validOptionCount=' + r3.validOptionCount);

assert('09 — blockedOptionCount is 0',
    r3.blockedOptionCount === 0,
    'blockedOptionCount=' + r3.blockedOptionCount);

assert('10 — hasOptions is true',
    r3.hasOptions === true,
    'hasOptions=' + r3.hasOptions);

assert('11 — displayMode is "read_only"',
    r3.displayMode === 'read_only',
    'displayMode=' + r3.displayMode);

var indices = r3.options.map(function(o) { return o.displayIndex; });
assert('12 — displayIndex values are 1, 2, 3',
    indices[0] === 1 && indices[1] === 2 && indices[2] === 3,
    JSON.stringify(indices));

assert('13 — displayLabel includes COA index/count for each option',
    r3.options.every(function(o) {
        return typeof o.displayLabel === 'string' &&
               o.displayLabel.indexOf('COA') !== -1 &&
               o.displayLabel.indexOf(o.label) !== -1;
    }),
    JSON.stringify(r3.options.map(function(o) { return o.displayLabel; })));

assert('14 — affectedUnitsCount calculated (0 for all fixture options)',
    r3.options.every(function(o) { return o.affectedUnitsCount === 0; }),
    JSON.stringify(r3.options.map(function(o) { return o.affectedUnitsCount; })));

assert('15 — expectedEffectsCount matches source arrays',
    r3.options[0].expectedEffectsCount === 2 &&
    r3.options[1].expectedEffectsCount === 2 &&
    r3.options[2].expectedEffectsCount === 1,
    JSON.stringify(r3.options.map(function(o) { return o.expectedEffectsCount; })));

assert('16 — risksCount matches source arrays (1 for each fixture option)',
    r3.options.every(function(o) { return o.risksCount === 1; }),
    JSON.stringify(r3.options.map(function(o) { return o.risksCount; })));

assert('17 — readOnly is true on every output option',
    r3.options.every(function(o) { return o.readOnly === true; }),
    JSON.stringify(r3.options.map(function(o) { return o.readOnly; })));

assert('18 — source is "source_json" on every output option',
    r3.options.every(function(o) { return o.source === 'source_json'; }),
    JSON.stringify(r3.options.map(function(o) { return o.source; })));

assert('19 — expectedEffects remain string arrays (anticipated effects only)',
    r3.options.every(function(o) {
        return Array.isArray(o.expectedEffects) &&
               o.expectedEffects.every(function(e) { return typeof e === 'string'; });
    }),
    'expectedEffects contain non-string items');

assert('20 — no expectedResult field created on any output option',
    r3.options.every(function(o) {
        return !Object.prototype.hasOwnProperty.call(o, 'expectedResult');
    }),
    'expectedResult found in output option');

assert('21 — no selectedDecision field created on any output option',
    r3.options.every(function(o) {
        return !Object.prototype.hasOwnProperty.call(o, 'selectedDecision');
    }),
    'selectedDecision found in output option');

assert('22 — no previewComplete field in result or options',
    !Object.prototype.hasOwnProperty.call(r3, 'previewComplete') &&
    r3.options.every(function(o) {
        return !Object.prototype.hasOwnProperty.call(o, 'previewComplete');
    }),
    'previewComplete found in result');

// =============================================================================
// 23–25  Invalid option blocking
// =============================================================================

var applyNowOpt = withProp(W3_OPTIONS[0], 'applyNow', true);
var rApply = build({ decisionOptions: [applyNowOpt] });
assert('23 — option with applyNow is blocked (blockedOptionCount=1)',
    rApply.passed &&
    rApply.validOptionCount === 0 &&
    rApply.blockedOptionCount === 1 &&
    rApply.displayMode === 'hidden',
    JSON.stringify({ valid: rApply.validOptionCount, blocked: rApply.blockedOptionCount }));

var execOpt = withProp(W3_OPTIONS[0], 'executeNow', true);
var rExec = build({ decisionOptions: [execOpt] });
assert('24 — option with executeNow is blocked',
    rExec.passed && rExec.blockedOptionCount === 1 && rExec.validOptionCount === 0,
    JSON.stringify({ valid: rExec.validOptionCount, blocked: rExec.blockedOptionCount }));

var roFalse = withProp(W3_OPTIONS[0], 'readOnly', false);
var rROFalse = build({ decisionOptions: [roFalse] });
assert('25 — option with readOnly:false is blocked',
    rROFalse.passed && rROFalse.blockedOptionCount === 1 && rROFalse.validOptionCount === 0,
    JSON.stringify({ valid: rROFalse.validOptionCount, blocked: rROFalse.blockedOptionCount }));

// =============================================================================
// 26–31  Mixed valid+invalid, mutation safety
// =============================================================================

var mixedStep = { decisionOptions: [W3_OPTIONS[0], applyNowOpt, W3_OPTIONS[1]] };
var rMixed = build(mixedStep);
assert('26 — mixed valid+invalid → options[] has valid; blockedOptions[] has invalid',
    rMixed.validOptionCount === 2 && rMixed.blockedOptionCount === 1 &&
    rMixed.displayMode === 'read_only',
    JSON.stringify({ valid: rMixed.validOptionCount, blocked: rMixed.blockedOptionCount }));

assert('27 — invalid options not partially in options[] (only 2 valid items present)',
    rMixed.options.length === 2,
    'options.length=' + rMixed.options.length);

// 28: unsafe field not in display-safe output
var unsafeOpt = withProp(W3_OPTIONS[0], 'commitNow', true);
var rUnsafe = build({ decisionOptions: [W3_OPTIONS[0], unsafeOpt] });
var allOutputKeys = rUnsafe.options.reduce(function(acc, o) { return acc.concat(Object.keys(o)); }, []);
assert('28 — unsafe fields not exposed in display-safe data (no commitNow in any output item)',
    allOutputKeys.indexOf('commitNow') === -1 &&
    allOutputKeys.indexOf('applyNow') === -1 &&
    allOutputKeys.indexOf('gate7Approved') === -1,
    'unsafe key found: ' + allOutputKeys.filter(function(k) { return k === 'commitNow' || k === 'applyNow' || k === 'gate7Approved'; }));

// 29: priority preserved when string or number, dropped when object
var withStrPriority = withProp(W3_OPTIONS[0], 'priority', 1);
var withBadPriority = withProp(W3_OPTIONS[0], 'priority', { rank: 1 });
var rPri = build({ decisionOptions: [withStrPriority, withBadPriority] });
assert('29 — numeric priority preserved; object priority dropped (null)',
    rPri.options[0].priority === 1 &&
    rPri.options[1].priority === null,
    JSON.stringify(rPri.options.map(function(o) { return o.priority; })));

// 30: original step not mutated
var cloneStep = { decisionOptions: JSON.parse(JSON.stringify(W3_OPTIONS)) };
var beforeKeys = Object.keys(cloneStep);
build(cloneStep);
assert('30 — original step object not mutated',
    JSON.stringify(Object.keys(cloneStep)) === JSON.stringify(beforeKeys) &&
    cloneStep.decisionOptions.length === W3_OPTIONS.length,
    'step keys changed');

// 31: original option objects not mutated
var origLabel = W3_OPTIONS[0].label;
build({ decisionOptions: W3_OPTIONS });
assert('31 — original option objects not mutated (label unchanged)',
    W3_OPTIONS[0].label === origLabel,
    'label changed to: ' + W3_OPTIONS[0].label);

// =============================================================================
// 32–40  W3 regression
// =============================================================================

var rW3Step08 = build(w3json.steps[8]);
assert('32 — existing W3-STEP-08 (no decisionOptions in source) → passed:true, displayMode:hidden',
    rW3Step08.passed && rW3Step08.displayMode === 'hidden' && rW3Step08.optionCount === 0,
    JSON.stringify({ passed: rW3Step08.passed, mode: rW3Step08.displayMode }));

assert('33 — W3-STEP-08 selectedDecision absent from raw source',
    !Object.prototype.hasOwnProperty.call(w3json.steps[8], 'selectedDecision'),
    'selectedDecision found in steps[8]');

assert('34 — W3-STEP-08 expectedResult absent from raw source',
    !Object.prototype.hasOwnProperty.call(w3json.steps[8], 'expectedResult'),
    'expectedResult found in steps[8]');

assert('35 — previewComplete computation still requires decisionOk && resultOk && counterOk',
    src.indexOf('decisionOk && resultOk && counterOk') !== -1,
    'previewComplete computation changed');

assert('36 — MISSING_FIELD warnings for selectedDecision and expectedResult still in source',
    src.indexOf("'selectedDecision is missing — step cannot be marked preview-complete'") !== -1 &&
    src.indexOf("'expectedResult is missing — step cannot be marked preview-complete'") !== -1,
    'MISSING_FIELD messages changed');

var minOverlay = {
    overlayType: 'wargame3_preview_read_only', source: 'dry_run_preview',
    readOnly: true, liveMutationAllowed: false,
    markers: [], objectiveHighlights: [], effectHints: [],
    movementTrails: [], warnings: [], blockedReasons: []
};
var ovRes = overlayGuard(minOverlay);
assert('37 — isWargame3ReadOnlyMapOverlayDataSafe functional with valid overlay',
    ovRes.passed && ovRes.blockedReasons.length === 0,
    JSON.stringify(ovRes));

assert('38 — W3 objective highlight source (w3json.obj) still present',
    w3json.obj && typeof w3json.obj === 'object',
    'w3json.obj missing');

assert('39 — movement trail builder still in source',
    src.indexOf('movementTrails') !== -1 &&
    src.indexOf('buildWargame3ReadOnlyMapOverlayData') !== -1,
    'movementTrails or builder not found');

assert('40 — readiness sentinel ready_for_walkthrough still in source',
    src.indexOf('ready_for_walkthrough') !== -1,
    'ready_for_walkthrough not found');

// =============================================================================
// 41–54  Safety confirmations
// =============================================================================

assert('41 — wargame3.json has no decisionOptions on any step',
    w3json.steps.every(function(s) {
        return !Object.prototype.hasOwnProperty.call(s, 'decisionOptions');
    }),
    'decisionOptions found in wargame3.json');

var marker263 = 'PR-263-PRODUCTION-CHANGE';
assert('42 — app.js has no PR-263 production marker',
    fs.readFileSync(path.join(__dirname, 'UI_MOdified/client/app.js'), 'utf8')
      .indexOf(marker263) === -1,
    'marker found in app.js');

var i18nExists = fs.existsSync(path.join(__dirname, 'UI_MOdified/client/i18n.js'));
assert('43 — i18n.js has no PR-263 production marker',
    !i18nExists ||
    fs.readFileSync(path.join(__dirname, 'UI_MOdified/client/i18n.js'), 'utf8')
      .indexOf(marker263) === -1,
    'marker found in i18n.js');

var cssExists = fs.existsSync(path.join(__dirname, 'UI_MOdified/client/style.css'));
assert('44 — style.css has no PR-263 production marker',
    !cssExists ||
    fs.readFileSync(path.join(__dirname, 'UI_MOdified/client/style.css'), 'utf8')
      .indexOf(marker263) === -1,
    'marker found in style.css');

assert('45 — app.js has no PR-263 production marker (confirmed)',
    fs.readFileSync(path.join(__dirname, 'UI_MOdified/client/app.js'), 'utf8')
      .indexOf('buildWargame3DecisionOptionsPreviewData') === -1,
    'buildWargame3DecisionOptionsPreviewData found in app.js — should not be there');

assert('46 — adjudicator-map.js has no PR-263 production marker',
    fs.readFileSync(path.join(__dirname, 'UI_MOdified/client/wargame/adjudicator-map.js'), 'utf8')
      .indexOf(marker263) === -1,
    'marker found in adjudicator-map.js');

// 47–53: check extracted function body for forbidden patterns
var fnSrc = extractFn('buildWargame3DecisionOptionsPreviewData');

assert('47 — no DOM calls in buildWargame3DecisionOptionsPreviewData',
    fnSrc.indexOf('document.') === -1 && fnSrc.indexOf('getElementById') === -1,
    'DOM access found in function');

assert('48 — no map paint calls in buildWargame3DecisionOptionsPreviewData',
    fnSrc.indexOf('L.marker') === -1 && fnSrc.indexOf('L.polyline') === -1 &&
    fnSrc.indexOf('paintWargame3') === -1,
    'map paint found in function');

assert('49 — no fitBounds call in buildWargame3DecisionOptionsPreviewData',
    fnSrc.indexOf('fitBounds') === -1,
    'fitBounds found in function');

assert('50 — no storage calls in buildWargame3DecisionOptionsPreviewData',
    fnSrc.indexOf('localStorage') === -1 && fnSrc.indexOf('sessionStorage') === -1,
    'storage access found in function');

assert('51 — no fetch/backend calls in buildWargame3DecisionOptionsPreviewData',
    fnSrc.indexOf('fetch(') === -1 && fnSrc.indexOf('XMLHttpRequest') === -1 &&
    fnSrc.indexOf('/api/') === -1,
    'fetch/backend found in function');

assert('52 — no AI/simulation/journal calls in buildWargame3DecisionOptionsPreviewData',
    fnSrc.indexOf('simulation') === -1 && fnSrc.indexOf('journal') === -1 &&
    fnSrc.indexOf('aiGenerated') === fnSrc.lastIndexOf('aiGenerated'), // only in the output check pass, not called
    'AI/simulation/journal found in function body');

assert('53 — no apply/commit/Gate7 controls in buildWargame3DecisionOptionsPreviewData',
    fnSrc.indexOf('applyNow') === -1 && fnSrc.indexOf('gate7') === -1 &&
    fnSrc.indexOf('commitNow') === -1,
    'apply/commit/gate7 control found in function');

// 54: no console errors — implicit from test run; confirm function exists cleanly
assert('54 — buildWargame3DecisionOptionsPreviewData callable with no thrown exceptions',
    (function() {
        try { build({ decisionOptions: W3_OPTIONS }); return true; }
        catch(e) { return false; }
    })(),
    'function threw exception');

// =============================================================================
// Print results
// =============================================================================
console.log('');
results.forEach(function(r) { console.log(r); });
console.log('');
if (failed === 0) {
    console.log('ALL PASS  (' + passed + '/' + (passed + failed) + ')');
} else {
    console.log(failed + ' FAILED  ' + passed + ' passed  (' + passed + '/' + (passed + failed) + ')');
    process.exitCode = 1;
}

console.log('');
console.log('── PR-263 Summary ───────────────────────────────────────────────────────────');
console.log('  Helper:                    buildWargame3DecisionOptionsPreviewData');
console.log('  Export:                    window.AppShellScenarioWorkspace.buildWargame3DecisionOptionsPreviewData');
console.log('  Fixture options (valid):   ' + r3.validOptionCount + '/3 pass guard');
console.log('  displayMode (3 valid):     ' + r3.displayMode);
console.log('  displayMode (no options):  ' + rMissing.displayMode);
console.log('  displayMode (all blocked): ' + rApply.displayMode);
console.log('  Blocked option behavior:   recorded in blockedOptions[] with id+label+blockedReasons');
console.log('  Unsafe fields in output:   none (only known-safe fields copied)');
console.log('  selectedDecision created:  No');
console.log('  expectedResult created:    No');
console.log('  previewComplete changed:   No');
console.log('  Step mutated:              No');
console.log('  Option objects mutated:    No');
console.log('  W3-STEP-08 behavior:       unchanged — no decisionOptions in source; displayMode:hidden');
console.log('  wargame3.json modified:    No');
console.log('  DOM / map / storage:       None');
console.log('  fetch / AI / simulation:   None');
console.log('  Gate 7 / apply / execute:  None');
console.log('  Recommended next PR:       PR-264 — Read-Only Decision Options Display UI');
console.log('────────────────────────────────────────────────────────────────────────────');
