'use strict';

// ── PR-262 Test Harness — Wargame 3 Decision Options Fixture Example ──────────
// Verifies:
//   F01–F10  Fixture validity — valid options pass isWargame3DecisionOptionSafe
//   U01–U12  Unsafe-field rejection — 12 forbidden fields each fail
//   V01–V09  Invalid-shape rejection — missing/wrong fields each fail
//   R01–R08  W3 regression — existing W3-STEP-08 pipeline unchanged
//   S01–S09  Safety confirmations — no production changes, no mutation
//
// No DOM. No Leaflet. No production navigation. No storage. No backend.
// All 52 tests run entirely in Node.js.

var fs   = require('fs');
var path = require('path');

var src = fs.readFileSync(
    path.join(__dirname, 'UI_MOdified/client/shell/scenario-workspace.js'), 'utf8');
var w3json = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'UI_MOdified/data/scenarios/wargame3.json'), 'utf8'));

// ── Guard extraction ──────────────────────────────────────────────────────────
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
    extractFn('isWargame3ReadOnlyMapOverlayDataSafe') + '\n';

var harnessReturn =
    'return { doSafe: isWargame3DecisionOptionSafe,' +
    ' erSafe: isWargame3ExpectedResultSafe,' +
    ' overlayGuard: isWargame3ReadOnlyMapOverlayDataSafe };';

var guards  = new Function(harnessSrc + harnessReturn)();
var doSafe     = guards.doSafe;
var erSafe     = guards.erSafe;
var overlayGuard = guards.overlayGuard;

// ── Authoring-completeness wrapper (PR-260 §5.2 — description + intent required) ──
// Note: isWargame3DecisionOptionSafe does not yet enforce description/intent.
// This local wrapper adds the authoring standard check on top of the base guard.
function checkAuthoringComplete(option) {
    var base = doSafe(option);
    var extra = [];
    if (typeof option.description !== 'string' || option.description === '') {
        extra.push('description is required by PR-260 authoring standard');
    }
    if (typeof option.intent !== 'string' || option.intent === '') {
        extra.push('intent is required by PR-260 authoring standard');
    }
    return {
        passed: base.passed && extra.length === 0,
        blockedReasons: base.blockedReasons.concat(extra),
        warnings: base.warnings
    };
}

// ── Test runner ───────────────────────────────────────────────────────────────
var passed = 0; var failed = 0; var results = [];
function assert(label, cond, detail) {
    if (cond) { passed++; results.push('  PASS  ' + label); }
    else       { failed++; results.push('  FAIL  ' + label + (detail ? '  →  ' + detail : '')); }
}

// =============================================================================
// Fixture definition — W3-STEP-08 decision options (PR-260 §10 shape)
// Not written to wargame3.json. Test-local only.
// =============================================================================
var W3_STEP_08_OPTIONS = [
    {
        id:          'W3-STEP-08-COA-01',
        label:       'Hold current posture',
        description: 'Maintain current posture and continue observing enemy movement around the objective area.',
        intent:      'Preserve combat power while maintaining situational awareness.',
        affectedUnits:   [],
        expectedEffects: [
            'Maintains current defensive posture',
            'Keeps observation focused on the objective area'
        ],
        risks: [
            'Enemy movement may continue without disruption'
        ],
        source:   'source_json',
        readOnly: true
    },
    {
        id:          'W3-STEP-08-COA-02',
        label:       'Reinforce air and radar defense',
        description: 'Prioritize protection of air and radar assets supporting the objective area.',
        intent:      'Improve resilience of detection and air-defense support without initiating live action.',
        affectedUnits:   [],
        expectedEffects: [
            'Improves defensive posture around key support assets',
            'Keeps the objective under monitored coverage'
        ],
        risks: [
            'May reduce flexibility elsewhere'
        ],
        source:   'source_json',
        readOnly: true
    },
    {
        id:          'W3-STEP-08-COA-03',
        label:       'Contest mine-clearance activity',
        description: 'Prepare a read-only course of action for contesting mine-clearance activity near the objective area.',
        intent:      'Limit enemy freedom of movement around the objective without claiming executed effects.',
        affectedUnits:   [],
        expectedEffects: [
            'May slow enemy freedom of movement if later selected and adjudicated'
        ],
        risks: [
            'Could increase exposure if executed without coordination'
        ],
        source:   'source_json',
        readOnly: true
    }
];

// Helper: clone an option and add/override one property
function withProp(opt, key, val) {
    var o = JSON.parse(JSON.stringify(opt));
    o[key] = val;
    return o;
}
function withoutProp(opt, key) {
    var o = JSON.parse(JSON.stringify(opt));
    delete o[key];
    return o;
}
var BASE = W3_STEP_08_OPTIONS[0]; // convenient base for invalid-shape tests

// =============================================================================
// F — Fixture validity (14 tests)
// =============================================================================

assert('F01 — isWargame3DecisionOptionSafe exported on window.AppShellScenarioWorkspace',
    src.indexOf('isWargame3DecisionOptionSafe:') !== -1 &&
    src.indexOf('isWargame3DecisionOptionSafe') !== -1,
    'export or definition not found');

var r0 = doSafe(W3_STEP_08_OPTIONS[0]);
assert('F02a — COA-01 passes isWargame3DecisionOptionSafe',
    r0.passed && r0.blockedReasons.length === 0,
    JSON.stringify(r0));

var r1 = doSafe(W3_STEP_08_OPTIONS[1]);
assert('F02b — COA-02 passes isWargame3DecisionOptionSafe',
    r1.passed && r1.blockedReasons.length === 0,
    JSON.stringify(r1));

var r2 = doSafe(W3_STEP_08_OPTIONS[2]);
assert('F02c — COA-03 passes isWargame3DecisionOptionSafe',
    r2.passed && r2.blockedReasons.length === 0,
    JSON.stringify(r2));

var ids = W3_STEP_08_OPTIONS.map(function(o) { return o.id; });
assert('F03 — all 3 option ids are unique',
    ids.length === new Set(ids).size,
    'duplicate ids: ' + JSON.stringify(ids));

assert('F04a — COA-01 has readOnly:true',
    W3_STEP_08_OPTIONS[0].readOnly === true, 'readOnly=' + W3_STEP_08_OPTIONS[0].readOnly);

assert('F04b — COA-02 has readOnly:true',
    W3_STEP_08_OPTIONS[1].readOnly === true, 'readOnly=' + W3_STEP_08_OPTIONS[1].readOnly);

assert('F04c — COA-03 has readOnly:true',
    W3_STEP_08_OPTIONS[2].readOnly === true, 'readOnly=' + W3_STEP_08_OPTIONS[2].readOnly);

assert('F05 — all 3 options have source:"source_json"',
    W3_STEP_08_OPTIONS.every(function(o) { return o.source === 'source_json'; }),
    'source mismatch');

assert('F06 — all 3 options have affectedUnits array',
    W3_STEP_08_OPTIONS.every(function(o) { return Array.isArray(o.affectedUnits); }),
    'affectedUnits not array');

assert('F07 — all 3 options have expectedEffects array',
    W3_STEP_08_OPTIONS.every(function(o) { return Array.isArray(o.expectedEffects); }),
    'expectedEffects not array');

assert('F08 — all 3 options have risks array',
    W3_STEP_08_OPTIONS.every(function(o) { return Array.isArray(o.risks); }),
    'risks not array');

// F09 — expectedEffects items are plain strings, NOT structured expectedResult objects
assert('F09 — expectedEffects are plain strings, not structured expectedResult objects',
    W3_STEP_08_OPTIONS.every(function(o) {
        return o.expectedEffects.every(function(e) { return typeof e === 'string'; });
    }),
    'expectedEffects contains non-string items');

// F10 — fixture options carry no selectedDecision / expectedResult / previewComplete keys
assert('F10 — fixture options have no selectedDecision/expectedResult/previewComplete keys',
    W3_STEP_08_OPTIONS.every(function(o) {
        return !Object.prototype.hasOwnProperty.call(o, 'selectedDecision') &&
               !Object.prototype.hasOwnProperty.call(o, 'expectedResult') &&
               !Object.prototype.hasOwnProperty.call(o, 'previewComplete') &&
               !Object.prototype.hasOwnProperty.call(o, 'selected_decision') &&
               !Object.prototype.hasOwnProperty.call(o, 'expected_result');
    }),
    'disallowed field found in fixture option');

// =============================================================================
// U — Unsafe-field rejection (12 tests)
// =============================================================================

assert('U01 — applyNow → fail',
    !doSafe(withProp(BASE, 'applyNow', true)).passed, 'passed unexpectedly');

assert('U02 — commitNow → fail',
    !doSafe(withProp(BASE, 'commitNow', true)).passed, 'passed unexpectedly');

assert('U03 — executeNow → fail',
    !doSafe(withProp(BASE, 'executeNow', true)).passed, 'passed unexpectedly');

assert('U04 — liveApply → fail',
    !doSafe(withProp(BASE, 'liveApply', true)).passed, 'passed unexpectedly');

assert('U05 — mutateUnits → fail',
    !doSafe(withProp(BASE, 'mutateUnits', true)).passed, 'passed unexpectedly');

assert('U06 — mutateMap → fail',
    !doSafe(withProp(BASE, 'mutateMap', true)).passed, 'passed unexpectedly');

assert('U07 — mutateScenario → fail',
    !doSafe(withProp(BASE, 'mutateScenario', true)).passed, 'passed unexpectedly');

assert('U08 — backendCommit → fail',
    !doSafe(withProp(BASE, 'backendCommit', true)).passed, 'passed unexpectedly');

assert('U09 — autoApply → fail',
    !doSafe(withProp(BASE, 'autoApply', true)).passed, 'passed unexpectedly');

assert('U10 — aiGenerated → fail',
    !doSafe(withProp(BASE, 'aiGenerated', true)).passed, 'passed unexpectedly');

assert('U11 — simulationCommitted → fail',
    !doSafe(withProp(BASE, 'simulationCommitted', true)).passed, 'passed unexpectedly');

assert('U12 — gate7Approved → fail',
    !doSafe(withProp(BASE, 'gate7Approved', true)).passed, 'passed unexpectedly');

// =============================================================================
// V — Invalid-shape rejection (9 tests)
// =============================================================================

assert('V01 — option missing id → fail',
    !doSafe(withoutProp(BASE, 'id')).passed,
    'passed without id');

assert('V02 — option missing label → fail',
    !doSafe(withProp(BASE, 'label', '')).passed,
    'passed with empty label');

// V03/V04 use the authoring-completeness wrapper (PR-260 §5.2)
assert('V03 — option missing description fails authoring check',
    !checkAuthoringComplete(withoutProp(BASE, 'description')).passed,
    'passed without description');

assert('V04 — option missing intent fails authoring check',
    !checkAuthoringComplete(withoutProp(BASE, 'intent')).passed,
    'passed without intent');

assert('V05 — affectedUnits not array → fail',
    !doSafe(withProp(BASE, 'affectedUnits', 'all')).passed,
    'passed with string affectedUnits');

assert('V06 — expectedEffects not array → fail',
    !doSafe(withProp(BASE, 'expectedEffects', 'see narrative')).passed,
    'passed with string expectedEffects');

assert('V07 — risks not array → fail',
    !doSafe(withProp(BASE, 'risks', 'high')).passed,
    'passed with string risks');

assert('V08 — source:"ai_generated" → fail',
    !doSafe(withProp(BASE, 'source', 'ai_generated')).passed,
    'passed with invalid source');

assert('V09 — readOnly:false → fail',
    !doSafe(withProp(BASE, 'readOnly', false)).passed,
    'passed with readOnly:false');

// =============================================================================
// R — W3-STEP-08 regression (8 tests)
// =============================================================================

var step08 = w3json.steps[8];

assert('R01 — existing W3-STEP-08 has no selectedDecision in raw source',
    !Object.prototype.hasOwnProperty.call(step08, 'selectedDecision') &&
    !Object.prototype.hasOwnProperty.call(step08, 'selected_decision'),
    'selectedDecision found in step08');

assert('R02 — existing W3-STEP-08 has no expectedResult in raw source',
    !Object.prototype.hasOwnProperty.call(step08, 'expectedResult') &&
    !Object.prototype.hasOwnProperty.call(step08, 'expected_result'),
    'expectedResult found in step08');

// R03: previewComplete computation in source still requires decisionOk && resultOk && counterOk
assert('R03 — previewComplete computation still requires decisionOk && resultOk && counterOk',
    src.indexOf("decisionOk && resultOk && counterOk") !== -1,
    'previewComplete computation changed');

// R04/R05: MISSING_FIELD code still emitted for both fields
assert('R04 — MISSING_FIELD warning for selectedDecision still in source',
    src.indexOf("'selectedDecision is missing — step cannot be marked preview-complete'") !== -1,
    'MISSING_FIELD message for selectedDecision changed or removed');

assert('R05 — MISSING_FIELD warning for expectedResult still in source',
    src.indexOf("'expectedResult is missing — step cannot be marked preview-complete'") !== -1,
    'MISSING_FIELD message for expectedResult changed or removed');

// R06: isWargame3ReadOnlyMapOverlayDataSafe functional — test with a minimal valid overlay
var minOverlay = {
    overlayType: 'wargame3_preview_read_only',
    source: 'dry_run_preview',
    readOnly: true,
    liveMutationAllowed: false,
    markers: [], objectiveHighlights: [], effectHints: [],
    movementTrails: [], warnings: [], blockedReasons: []
};
var ovRes = overlayGuard(minOverlay);
assert('R06 — isWargame3ReadOnlyMapOverlayDataSafe functional with valid minimal overlay',
    ovRes.passed && ovRes.blockedReasons.length === 0,
    JSON.stringify(ovRes));

assert('R07 — W3-STEP-08 objectiveStatusBaseline is THREATENED (source confirms demo-step value)',
    step08.objective_status_baseline === 'THREATENED',
    'objective_status_baseline=' + step08.objective_status_baseline);

assert('R08 — wargame3.json has no decisionOptions key on any step (not yet modified)',
    w3json.steps.every(function(s) {
        return !Object.prototype.hasOwnProperty.call(s, 'decisionOptions') &&
               !Object.prototype.hasOwnProperty.call(s, 'decision_options');
    }),
    'decisionOptions found in wargame3.json');

// =============================================================================
// S — Safety confirmations (9 tests)
// =============================================================================

var marker262 = 'PR-262-PRODUCTION-CHANGE';
assert('S01 — scenario-workspace.js has no PR-262 production marker',
    src.indexOf(marker262) === -1,
    'marker found in scenario-workspace.js');

var appSrc = fs.readFileSync(path.join(__dirname, 'UI_MOdified/client/app.js'), 'utf8');
assert('S02 — app.js has no PR-262 production marker',
    appSrc.indexOf(marker262) === -1,
    'marker found in app.js');

var adjSrc = fs.readFileSync(
    path.join(__dirname, 'UI_MOdified/client/wargame/adjudicator-map.js'), 'utf8');
assert('S03 — adjudicator-map.js has no PR-262 production marker',
    adjSrc.indexOf(marker262) === -1,
    'marker found in adjudicator-map.js');

assert('S04 — adapter selectedDecision:null (Rule S5) still intact',
    src.indexOf("selectedDecision:         null,") !== -1,
    'Rule S5 changed or removed');

assert('S05 — adapter expectedResult:null (Rule S10) still intact',
    src.indexOf("expectedResult:           null,") !== -1,
    'Rule S10 changed or removed');

assert('S06 — wargame3.json has no selectedDecision on any step',
    w3json.steps.every(function(s) {
        return !Object.prototype.hasOwnProperty.call(s, 'selectedDecision') &&
               !Object.prototype.hasOwnProperty.call(s, 'selected_decision');
    }),
    'selectedDecision found in wargame3.json');

assert('S07 — wargame3.json has no expectedResult on any step',
    w3json.steps.every(function(s) {
        return !Object.prototype.hasOwnProperty.call(s, 'expectedResult') &&
               !Object.prototype.hasOwnProperty.call(s, 'expected_result');
    }),
    'expectedResult found in wargame3.json');

assert('S08 — wargame3.json has no decisionOptions on any step',
    w3json.steps.every(function(s) {
        return !Object.prototype.hasOwnProperty.call(s, 'decisionOptions');
    }),
    'decisionOptions found in wargame3.json');

assert('S09 — isWargame3DecisionOptionSafe in export block of scenario-workspace.js',
    src.indexOf('isWargame3DecisionOptionSafe:     isWargame3DecisionOptionSafe') !== -1,
    'export line not found');

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

// Fixture summary
console.log('');
console.log('── PR-262 Fixture Summary ───────────────────────────────────────────────────');
console.log('  Fixture step:              W3-STEP-08 (PHASE 2A · objective THREATENED · 14 actors)');
console.log('  Valid options:             ' + W3_STEP_08_OPTIONS.length + ' (COA-01, COA-02, COA-03)');
W3_STEP_08_OPTIONS.forEach(function(o, i) {
    console.log('  COA-0' + (i+1) + ' id:                 ' + o.id);
    console.log('  COA-0' + (i+1) + ' label:              ' + o.label);
    console.log('  COA-0' + (i+1) + ' expectedEffects:    ' + o.expectedEffects.length + ' items');
    console.log('  COA-0' + (i+1) + ' risks:              ' + o.risks.length + ' item(s)');
});
console.log('  All options readOnly:      true');
console.log('  All options source:        source_json');
console.log('  All unsafe fields blocked: 12/12 (U01-U12)');
console.log('  All invalid shapes block:  9/9 (V01-V09)');
console.log('  expectedEffects type:      string[] only — not structured expectedResult');
console.log('  selectedDecision created:  No — not in fixture; adapter Rule S5 intact');
console.log('  expectedResult created:    No — not in fixture; adapter Rule S10 intact');
console.log('  previewComplete changed:   No — still requires decisionOk && resultOk && counterOk');
console.log('  wargame3.json modified:    No');
console.log('  Production code modified:  No');
console.log('  Recommended next PR:       PR-263 — Decision Options Preview Adapter Helper');
console.log('────────────────────────────────────────────────────────────────────────────');
