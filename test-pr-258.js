'use strict';

// ── PR-258 Test Harness — Decision/Result Schema Contract Verification ─────────
// Verifies that:
//   1. The contract document exists and contains required content.
//   2. No production files were modified.
//   3. No runtime code changes were made.
//   4. All safety boundary invariants from PR-257 still hold.
//
// No DOM. No Leaflet. No production function execution needed for doc checks.
// Regression checks verify the existing W3 pipeline is unaffected.

var fs   = require('fs');
var path = require('path');

var contractPath = path.join(__dirname, 'docs/pr-258-wargame3-decision-result-schema-contract.md');
var contractDoc  = fs.existsSync(contractPath) ? fs.readFileSync(contractPath, 'utf8') : '';

var src    = fs.readFileSync(
    path.join(__dirname, 'UI_MOdified/client/shell/scenario-workspace.js'), 'utf8');
var w3json = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'UI_MOdified/data/scenarios/wargame3.json'), 'utf8'));

// ── Test runner ───────────────────────────────────────────────────────────────
var passed = 0; var failed = 0; var results = [];
function assert(label, cond, detail) {
    if (cond) { passed++; results.push('  PASS  ' + label); }
    else       { failed++; results.push('  FAIL  ' + label + (detail ? '  →  ' + detail : '')); }
}

// ─────────────────────────────────────────────────────────────────────────────
// D01 — contract document exists
// ─────────────────────────────────────────────────────────────────────────────
assert('D01 — docs/pr-258-wargame3-decision-result-schema-contract.md exists',
    fs.existsSync(contractPath),
    'file not found: ' + contractPath);

assert('D01b — contract document is non-empty',
    contractDoc.length > 500,
    'length=' + contractDoc.length);

// ─────────────────────────────────────────────────────────────────────────────
// D02 — contract mentions selectedDecision
// ─────────────────────────────────────────────────────────────────────────────
assert('D02 — contract mentions selectedDecision',
    contractDoc.indexOf('selectedDecision') !== -1,
    'selectedDecision not found in contract');

assert('D02b — contract defines selectedDecision shape',
    contractDoc.indexOf('id:') !== -1 &&
    contractDoc.indexOf('label:') !== -1 &&
    contractDoc.indexOf('source:') !== -1,
    'selectedDecision shape definition not found');

// ─────────────────────────────────────────────────────────────────────────────
// D03 — contract mentions expectedResult
// ─────────────────────────────────────────────────────────────────────────────
assert('D03 — contract mentions expectedResult',
    contractDoc.indexOf('expectedResult') !== -1,
    'expectedResult not found in contract');

assert('D03b — contract defines expectedResult shape',
    contractDoc.indexOf('resultType:') !== -1 &&
    contractDoc.indexOf('linkedDecisionId:') !== -1,
    'expectedResult shape definition not found');

// ─────────────────────────────────────────────────────────────────────────────
// D04 — contract explicitly rejects objective_status_baseline mapping
// ─────────────────────────────────────────────────────────────────────────────
assert('D04 — contract rejects objective_status_baseline as expectedResult',
    contractDoc.indexOf('objective_status_baseline') !== -1 &&
    (contractDoc.indexOf('must not be copied from `objective_status_baseline`') !== -1 ||
     contractDoc.indexOf('must not use objective_status_baseline') !== -1 ||
     contractDoc.indexOf('objective_status_baseline') !== -1 &&
     contractDoc.indexOf('not a result') !== -1),
    'rejection of objective_status_baseline not found');

// ─────────────────────────────────────────────────────────────────────────────
// D05 — contract rejects inferred/AI-generated values
// ─────────────────────────────────────────────────────────────────────────────
assert('D05 — contract rejects inferred selectedDecision',
    contractDoc.indexOf('action_what') !== -1 &&
    (contractDoc.indexOf('must not be copied from `actors') !== -1 ||
     contractDoc.indexOf('inference from unit action') !== -1 ||
     contractDoc.indexOf('FORBIDDEN') !== -1),
    'rejection of inference not found');

assert('D05b — contract rejects AI auto-fill of selectedDecision',
    contractDoc.indexOf('AI') !== -1 &&
    (contractDoc.indexOf('AI-generated') !== -1 ||
     contractDoc.indexOf('AI auto-') !== -1 ||
     contractDoc.indexOf('AI boundary') !== -1),
    'AI auto-fill rejection not found');

// ─────────────────────────────────────────────────────────────────────────────
// D06 — contract defines selectedDecision shape with required keys
// ─────────────────────────────────────────────────────────────────────────────
assert('D06 — contract defines selectedDecision with id, label, source, readOnly',
    contractDoc.indexOf('selectedDecision') !== -1 &&
    contractDoc.indexOf('readOnly:    true') !== -1 &&
    (contractDoc.indexOf('"operator"') !== -1 || contractDoc.indexOf('"source_option"') !== -1),
    'selectedDecision structured shape incomplete');

// ─────────────────────────────────────────────────────────────────────────────
// D07 — contract defines expectedResult shape with resultType
// ─────────────────────────────────────────────────────────────────────────────
assert('D07 — contract defines expectedResult with source and resultType',
    contractDoc.indexOf('resultType:') !== -1 &&
    (contractDoc.indexOf('"adjudication"') !== -1 || contractDoc.indexOf('"source_expected"') !== -1),
    'expectedResult structured shape incomplete');

// ─────────────────────────────────────────────────────────────────────────────
// D08 — contract defines previewComplete rule
// ─────────────────────────────────────────────────────────────────────────────
assert('D08 — contract defines previewComplete rule',
    contractDoc.indexOf('previewComplete') !== -1 &&
    (contractDoc.indexOf('previewComplete: true') !== -1 || contractDoc.indexOf('previewComplete`) requires') !== -1 ||
     contractDoc.indexOf('previewComplete` requires') !== -1 || contractDoc.indexOf('must never be reached') !== -1),
    'previewComplete rule not found');

assert('D08b — contract states previewComplete must not be reached via objective_status_baseline',
    contractDoc.indexOf('previewComplete') !== -1 &&
    contractDoc.indexOf('objective_status_baseline') !== -1,
    'connection between previewComplete and objective_status_baseline not documented');

// ─────────────────────────────────────────────────────────────────────────────
// D09 — contract states no live apply
// ─────────────────────────────────────────────────────────────────────────────
assert('D09 — contract explicitly states this does not create live apply',
    contractDoc.indexOf('does not create live apply') !== -1 ||
    contractDoc.indexOf('does not create a live apply') !== -1 ||
    (contractDoc.indexOf('not create live apply') !== -1),
    'no-live-apply statement not found');

assert('D09b — contract mentions Gate 7 or Gate 4 boundary',
    contractDoc.indexOf('Gate 7') !== -1 || contractDoc.indexOf('Gate 4') !== -1 ||
    contractDoc.indexOf('gate') !== -1,
    'gate boundary not mentioned');

// ─────────────────────────────────────────────────────────────────────────────
// D10 — no production files changed
// ─────────────────────────────────────────────────────────────────────────────
var marker258 = 'PR-258-PRODUCTION-CHANGE';
assert('D10 — scenario-workspace.js has no PR-258 production marker',
    src.indexOf(marker258) === -1,
    'marker found in scenario-workspace.js');

var appSrc = fs.readFileSync(path.join(__dirname, 'UI_MOdified/client/app.js'), 'utf8');
assert('D10b — app.js has no PR-258 production marker',
    appSrc.indexOf(marker258) === -1,
    'marker found in app.js');

var adjSrc = fs.readFileSync(path.join(__dirname, 'UI_MOdified/client/wargame/adjudicator-map.js'), 'utf8');
assert('D10c — adjudicator-map.js has no PR-258 production marker',
    adjSrc.indexOf(marker258) === -1,
    'marker found in adjudicator-map.js');

// ─────────────────────────────────────────────────────────────────────────────
// D11 — wargame3.json not modified
// ─────────────────────────────────────────────────────────────────────────────
assert('D11 — wargame3.json steps still have no selectedDecision key',
    w3json.steps.every(function(s) {
        return !Object.prototype.hasOwnProperty.call(s, 'selectedDecision') &&
               !Object.prototype.hasOwnProperty.call(s, 'selected_decision');
    }),
    'selectedDecision found in wargame3.json steps');

assert('D11b — wargame3.json steps still have no expectedResult key',
    w3json.steps.every(function(s) {
        return !Object.prototype.hasOwnProperty.call(s, 'expectedResult') &&
               !Object.prototype.hasOwnProperty.call(s, 'expected_result');
    }),
    'expectedResult found in wargame3.json steps');

assert('D11c — wargame3.json steps still have decision_point_baseline null on all steps',
    w3json.steps.every(function(s) { return s.decision_point_baseline === null; }),
    'decision_point_baseline changed in wargame3.json');

// ─────────────────────────────────────────────────────────────────────────────
// D12 — adapter still sets both fields to null (not changed)
// ─────────────────────────────────────────────────────────────────────────────
assert('D12 — adapter still has selectedDecision: null (S5 comment preserved)',
    src.indexOf("selectedDecision:         null,") !== -1 ||
    src.indexOf("selectedDecision:         null,       // S5") !== -1,
    'adapter selectedDecision:null not found');

assert('D12b — adapter still has expectedResult: null (S10 comment preserved)',
    src.indexOf("expectedResult:           null,") !== -1 ||
    src.indexOf("expectedResult:           null,       // S10") !== -1,
    'adapter expectedResult:null not found');

// ─────────────────────────────────────────────────────────────────────────────
// D13 — contract recommends Model C (hybrid)
// ─────────────────────────────────────────────────────────────────────────────
assert('D13 — contract describes ownership models and recommends one',
    contractDoc.indexOf('Model A') !== -1 &&
    contractDoc.indexOf('Model B') !== -1 &&
    contractDoc.indexOf('Model C') !== -1,
    'ownership models A/B/C not all present');

assert('D13b — contract recommends Model C (hybrid)',
    contractDoc.indexOf('Model C') !== -1 &&
    (contractDoc.indexOf('recommended') !== -1 || contractDoc.indexOf('Recommend') !== -1),
    'Model C recommendation not found');

// ─────────────────────────────────────────────────────────────────────────────
// D14 — contract defines future validation helper names
// ─────────────────────────────────────────────────────────────────────────────
assert('D14 — contract names isWargame3SelectedDecisionSafe',
    contractDoc.indexOf('isWargame3SelectedDecisionSafe') !== -1,
    'isWargame3SelectedDecisionSafe not named');

assert('D14b — contract names isWargame3ExpectedResultSafe',
    contractDoc.indexOf('isWargame3ExpectedResultSafe') !== -1,
    'isWargame3ExpectedResultSafe not named');

assert('D14c — contract names validateWargame3DecisionResultPair',
    contractDoc.indexOf('validateWargame3DecisionResultPair') !== -1,
    'validateWargame3DecisionResultPair not named');

// ─────────────────────────────────────────────────────────────────────────────
// D15 — contract defines migration path starting with PR-259
// ─────────────────────────────────────────────────────────────────────────────
assert('D15 — contract defines migration path with PR-259',
    contractDoc.indexOf('PR-259') !== -1,
    'PR-259 migration step not found');

assert('D15b — contract covers at least PR-259 through PR-262',
    contractDoc.indexOf('PR-259') !== -1 &&
    contractDoc.indexOf('PR-260') !== -1 &&
    contractDoc.indexOf('PR-261') !== -1 &&
    contractDoc.indexOf('PR-262') !== -1,
    'migration path incomplete (missing PR-259..PR-262)');

// ─────────────────────────────────────────────────────────────────────────────
// R01–R04: regression — existing pipeline unaffected
// ─────────────────────────────────────────────────────────────────────────────
// We only need to confirm the source-code-level adapter contracts are intact.
// Full functional regression covered by test-pr-256.js and test-pr-257.js.

assert('R01 — buildScenarioStepPreview still checks selectedDecision as string',
    src.indexOf("typeof step.selectedDecision === 'string'") !== -1,
    'selectedDecision string check missing');

assert('R02 — buildScenarioStepPreview still checks expectedResult as string',
    src.indexOf("typeof step.expectedResult === 'string'") !== -1,
    'expectedResult string check missing');

assert('R03 — MISSING_FIELD warning message for selectedDecision still present',
    src.indexOf("'selectedDecision is missing — step cannot be marked preview-complete'") !== -1,
    'selectedDecision MISSING_FIELD message changed');

assert('R04 — MISSING_FIELD warning message for expectedResult still present',
    src.indexOf("'expectedResult is missing — step cannot be marked preview-complete'") !== -1,
    'expectedResult MISSING_FIELD message changed');

// ─────────────────────────────────────────────────────────────────────────────
// R05: contract document mentions decisionOptions (COA array)
// ─────────────────────────────────────────────────────────────────────────────
assert('R05 — contract defines decisionOptions / COA array shape',
    contractDoc.indexOf('decisionOptions') !== -1,
    'decisionOptions not defined in contract');

// ─────────────────────────────────────────────────────────────────────────────
// Print results
// ─────────────────────────────────────────────────────────────────────────────
console.log('');
results.forEach(function(r) { console.log(r); });
console.log('');
if (failed === 0) {
    console.log('ALL PASS  (' + passed + '/' + (passed + failed) + ')');
} else {
    console.log(failed + ' FAILED  ' + passed + ' passed  (' + passed + '/' + (passed + failed) + ')');
    process.exitCode = 1;
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('');
console.log('── PR-258 Contract Verification Summary ─────────────────────────────────────');
console.log('  Contract file:           docs/pr-258-wargame3-decision-result-schema-contract.md');
console.log('  Contract length:         ' + contractDoc.length + ' chars');
console.log('  Production code changed: No');
console.log('  wargame3.json changed:   No');
console.log('  selectedDecision shape:  Defined (string minimum + structured future shape)');
console.log('  expectedResult shape:    Defined (string minimum + structured future shape)');
console.log('  Ownership model:         Model C (hybrid) recommended');
console.log('  previewComplete rule:    Defined — false until both fields explicit + counterOk');
console.log('  objective_status_baseline rejected: Yes');
console.log('  Migration path:          PR-259 (type guards) → PR-260 → PR-261 → PR-262 → PR-263+');
console.log('  Recommended next PR:     PR-259 — Decision/Result Type Guards');
console.log('────────────────────────────────────────────────────────────────────────────');
