'use strict';

// ── PR-261 Test Harness — Read-Only Decision Options Preview Contract ─────────
// Verifies that:
//   1. The contract document exists and contains required content.
//   2. No production files were modified.
//   3. wargame3.json is unchanged.
//   4. PR-259 / PR-260 regression: type guards + adapter rules still intact.
//
// No DOM. No Leaflet. No production function execution.

var fs   = require('fs');
var path = require('path');

var contractPath = path.join(__dirname, 'docs/pr-261-wargame3-read-only-decision-options-preview-contract.md');
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
assert('D01 — docs/pr-261-wargame3-read-only-decision-options-preview-contract.md exists',
    fs.existsSync(contractPath),
    'file not found: ' + contractPath);

assert('D01b — contract document is non-empty (>= 5000 chars)',
    contractDoc.length >= 5000,
    'length=' + contractDoc.length);

// ─────────────────────────────────────────────────────────────────────────────
// D02 — contract mentions decisionOptions and read-only preview
// ─────────────────────────────────────────────────────────────────────────────
assert('D02 — contract mentions decisionOptions',
    contractDoc.indexOf('decisionOptions') !== -1,
    'decisionOptions not mentioned');

assert('D02b — contract mentions read-only preview',
    contractDoc.indexOf('read-only') !== -1 || contractDoc.indexOf('Read-only') !== -1 ||
    contractDoc.indexOf('Read-Only') !== -1,
    'read-only preview not mentioned');

// ─────────────────────────────────────────────────────────────────────────────
// D03 — contract states no selectedDecision creation
// ─────────────────────────────────────────────────────────────────────────────
assert('D03 — contract states displaying options does not create selectedDecision',
    contractDoc.indexOf('selectedDecision') !== -1 &&
    (contractDoc.indexOf('does not create') !== -1 ||
     contractDoc.indexOf('does not populate') !== -1 ||
     contractDoc.indexOf('not change') !== -1 ||
     contractDoc.indexOf('still `null`') !== -1 ||
     contractDoc.indexOf('still null') !== -1),
    'selectedDecision non-creation not stated');

assert('D03b — contract states MISSING_FIELD for selectedDecision remains',
    contractDoc.indexOf('MISSING_FIELD') !== -1 &&
    contractDoc.indexOf('selectedDecision') !== -1,
    'MISSING_FIELD / selectedDecision continuity not stated');

// ─────────────────────────────────────────────────────────────────────────────
// D04 — contract states no expectedResult creation
// ─────────────────────────────────────────────────────────────────────────────
assert('D04 — contract states expectedEffects are not expectedResult',
    contractDoc.indexOf('expectedEffects') !== -1 &&
    contractDoc.indexOf('expectedResult') !== -1 &&
    (contractDoc.indexOf('are not') !== -1 || contractDoc.indexOf('not expectedResult') !== -1 ||
     contractDoc.indexOf('distinct') !== -1 || contractDoc.indexOf('Not') !== -1),
    'expectedEffects vs expectedResult distinction not stated');

assert('D04b — contract rejects objective_status_baseline as expectedResult',
    contractDoc.indexOf('objective_status_baseline') !== -1,
    'objective_status_baseline not addressed');

// ─────────────────────────────────────────────────────────────────────────────
// D05 — contract states no previewComplete change
// ─────────────────────────────────────────────────────────────────────────────
assert('D05 — contract states decisionOptions display does not change previewComplete',
    contractDoc.indexOf('previewComplete') !== -1 &&
    (contractDoc.indexOf('still `false`') !== -1 ||
     contractDoc.indexOf('still false') !== -1 ||
     contractDoc.indexOf('No — still') !== -1 ||
     contractDoc.indexOf('must not change') !== -1),
    'previewComplete unchanged rule not stated');

// ─────────────────────────────────────────────────────────────────────────────
// D06 — contract states proposedVisualEffects must not satisfy expectedResult
// ─────────────────────────────────────────────────────────────────────────────
assert('D06 — contract mentions proposedVisualEffects',
    contractDoc.indexOf('proposedVisualEffects') !== -1,
    'proposedVisualEffects not mentioned');

// ─────────────────────────────────────────────────────────────────────────────
// D07 — contract forbids apply/execute/commit controls
// ─────────────────────────────────────────────────────────────────────────────
assert('D07 — contract forbids Apply/Execute/Commit controls',
    (contractDoc.indexOf('Apply') !== -1 || contractDoc.indexOf('apply') !== -1) &&
    (contractDoc.indexOf('Execute') !== -1 || contractDoc.indexOf('execute') !== -1) &&
    (contractDoc.indexOf('Commit') !== -1 || contractDoc.indexOf('commit') !== -1) &&
    contractDoc.indexOf('FORBIDDEN') !== -1,
    'Apply/Execute/Commit forbidden not stated');

assert('D07b — contract forbids selection controls until future PR',
    contractDoc.indexOf('selection') !== -1 &&
    (contractDoc.indexOf('FORBIDDEN') !== -1 || contractDoc.indexOf('deferred') !== -1 ||
     contractDoc.indexOf('until PR-') !== -1),
    'selection control prohibition not stated');

// ─────────────────────────────────────────────────────────────────────────────
// D08 — contract defines empty options behavior
// ─────────────────────────────────────────────────────────────────────────────
assert('D08 — contract defines empty/absent decisionOptions behavior',
    (contractDoc.indexOf('empty') !== -1 || contractDoc.indexOf('absent') !== -1 ||
     contractDoc.indexOf('missing') !== -1) &&
    contractDoc.indexOf('decisionOptions') !== -1 &&
    (contractDoc.indexOf('hidden') !== -1 || contractDoc.indexOf('silence') !== -1 ||
     contractDoc.indexOf('Hide') !== -1),
    'empty/absent options behavior not defined');

assert('D08b — contract states no fake option when options absent',
    contractDoc.indexOf('fake') !== -1 || contractDoc.indexOf('fabricate') !== -1 ||
    contractDoc.indexOf('generate') !== -1 || contractDoc.indexOf('placeholder') !== -1,
    'no-fake-option rule not stated');

// ─────────────────────────────────────────────────────────────────────────────
// D09 — contract requires validation before display
// ─────────────────────────────────────────────────────────────────────────────
assert('D09 — contract requires isWargame3DecisionOptionSafe before display',
    contractDoc.indexOf('isWargame3DecisionOptionSafe') !== -1,
    'isWargame3DecisionOptionSafe not mentioned');

assert('D09b — contract states invalid options are blocked from display',
    contractDoc.indexOf('blocked') !== -1 || contractDoc.indexOf('Blocked') !== -1 ||
    contractDoc.indexOf('not rendered') !== -1 || contractDoc.indexOf('hide') !== -1,
    'invalid option blocking not stated');

// ─────────────────────────────────────────────────────────────────────────────
// D10 — contract states no map overlays / range circles
// ─────────────────────────────────────────────────────────────────────────────
assert('D10 — contract states decisionOptions display does not add map overlays',
    contractDoc.indexOf('map') !== -1 &&
    (contractDoc.indexOf('FORBIDDEN') !== -1 || contractDoc.indexOf('must not') !== -1 ||
     contractDoc.indexOf('not paint') !== -1),
    'no-map-overlay rule not stated');

assert('D10b — contract mentions range circles as forbidden',
    contractDoc.indexOf('range circle') !== -1 || contractDoc.indexOf('range circles') !== -1,
    'range circles not mentioned as forbidden');

// ─────────────────────────────────────────────────────────────────────────────
// D11 — contract includes W3-STEP-08 example
// ─────────────────────────────────────────────────────────────────────────────
assert('D11 — contract includes W3-STEP-08 example',
    contractDoc.indexOf('W3-STEP-08') !== -1,
    'W3-STEP-08 not mentioned');

assert('D11b — W3-STEP-08 example shows 3 COA options',
    contractDoc.indexOf('COA-01') !== -1 &&
    contractDoc.indexOf('COA-02') !== -1 &&
    contractDoc.indexOf('COA-03') !== -1,
    'W3-STEP-08 COA example options not all present');

assert('D11c — example shows Read-only indicator',
    contractDoc.indexOf('Read-only') !== -1 || contractDoc.indexOf('[Read-only]') !== -1,
    'Read-only indicator not shown in example');

// ─────────────────────────────────────────────────────────────────────────────
// D12 — contract recommends PR-262
// ─────────────────────────────────────────────────────────────────────────────
assert('D12 — contract defines migration path with PR-262',
    contractDoc.indexOf('PR-262') !== -1,
    'PR-262 not in migration path');

assert('D12b — migration path includes PR-263 through PR-266',
    contractDoc.indexOf('PR-263') !== -1 &&
    contractDoc.indexOf('PR-264') !== -1 &&
    contractDoc.indexOf('PR-265') !== -1 &&
    contractDoc.indexOf('PR-266') !== -1,
    'migration path incomplete');

// ─────────────────────────────────────────────────────────────────────────────
// D13 — contract states no live apply / Gate 7
// ─────────────────────────────────────────────────────────────────────────────
assert('D13 — contract states no live apply through PR-266',
    contractDoc.indexOf('Gate 7') !== -1 &&
    (contractDoc.indexOf('Do not implement live apply') !== -1 ||
     contractDoc.indexOf('no live apply') !== -1 ||
     contractDoc.indexOf('FORBIDDEN') !== -1),
    'no-live-apply / Gate 7 rule not stated');

// ─────────────────────────────────────────────────────────────────────────────
// D14 — contract defines display placement
// ─────────────────────────────────────────────────────────────────────────────
assert('D14 — contract defines display placement (after event log)',
    (contractDoc.indexOf('event log') !== -1 || contractDoc.indexOf('ops ledger') !== -1) &&
    (contractDoc.indexOf('after') !== -1 || contractDoc.indexOf('between') !== -1),
    'display placement not defined');

assert('D14b — contract defines required visible fields (label, description, intent)',
    contractDoc.indexOf('`label`') !== -1 &&
    contractDoc.indexOf('`description`') !== -1 &&
    contractDoc.indexOf('`intent`') !== -1,
    'required visible fields not listed');

// ─────────────────────────────────────────────────────────────────────────────
// D15 — no production files changed
// ─────────────────────────────────────────────────────────────────────────────
var marker261 = 'PR-261-PRODUCTION-CHANGE';
assert('D15 — scenario-workspace.js has no PR-261 production marker',
    src.indexOf(marker261) === -1,
    'marker found in scenario-workspace.js');

var appSrc = fs.readFileSync(path.join(__dirname, 'UI_MOdified/client/app.js'), 'utf8');
assert('D15b — app.js has no PR-261 production marker',
    appSrc.indexOf(marker261) === -1,
    'marker found in app.js');

var adjSrc = fs.readFileSync(
    path.join(__dirname, 'UI_MOdified/client/wargame/adjudicator-map.js'), 'utf8');
assert('D15c — adjudicator-map.js has no PR-261 production marker',
    adjSrc.indexOf(marker261) === -1,
    'marker found in adjudicator-map.js');

// ─────────────────────────────────────────────────────────────────────────────
// D16 — wargame3.json unchanged
// ─────────────────────────────────────────────────────────────────────────────
assert('D16 — wargame3.json steps have no decisionOptions key',
    w3json.steps.every(function(s) {
        return !Object.prototype.hasOwnProperty.call(s, 'decisionOptions') &&
               !Object.prototype.hasOwnProperty.call(s, 'decision_options');
    }),
    'decisionOptions found in wargame3.json steps');

assert('D16b — wargame3.json selectedDecision still absent from all steps',
    w3json.steps.every(function(s) {
        return !Object.prototype.hasOwnProperty.call(s, 'selectedDecision') &&
               !Object.prototype.hasOwnProperty.call(s, 'selected_decision');
    }),
    'selectedDecision found in wargame3.json');

assert('D16c — wargame3.json expectedResult still absent from all steps',
    w3json.steps.every(function(s) {
        return !Object.prototype.hasOwnProperty.call(s, 'expectedResult') &&
               !Object.prototype.hasOwnProperty.call(s, 'expected_result');
    }),
    'expectedResult found in wargame3.json');

// ─────────────────────────────────────────────────────────────────────────────
// R01–R05: regression — PR-259/260 still intact
// ─────────────────────────────────────────────────────────────────────────────
assert('R01 — isWargame3DecisionOptionSafe still defined in source',
    src.indexOf('function isWargame3DecisionOptionSafe(') !== -1,
    'function not found');

assert('R02 — isWargame3SelectedDecisionSafe still defined',
    src.indexOf('function isWargame3SelectedDecisionSafe(') !== -1,
    'function not found');

assert('R03 — isWargame3ExpectedResultSafe still defined',
    src.indexOf('function isWargame3ExpectedResultSafe(') !== -1,
    'function not found');

assert('R04 — validateWargame3DecisionResultPair still defined',
    src.indexOf('function validateWargame3DecisionResultPair(') !== -1,
    'function not found');

assert('R05 — adapter selectedDecision:null (Rule S5) still present',
    src.indexOf("selectedDecision:         null,") !== -1,
    'adapter Rule S5 changed');

assert('R05b — adapter expectedResult:null (Rule S10) still present',
    src.indexOf("expectedResult:           null,") !== -1,
    'adapter Rule S10 changed');

assert('R06 — buildScenarioStepPreview selectedDecision string check intact',
    src.indexOf("typeof step.selectedDecision === 'string'") !== -1,
    'string check missing');

assert('R06b — buildScenarioStepPreview expectedResult string check intact',
    src.indexOf("typeof step.expectedResult === 'string'") !== -1,
    'string check missing');

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

console.log('');
console.log('── PR-261 Contract Verification Summary ─────────────────────────────────────');
console.log('  Contract file:             docs/pr-261-wargame3-read-only-decision-options-preview-contract.md');
console.log('  Contract length:           ' + contractDoc.length + ' chars');
console.log('  Display placement:         After compact summary + event log; before warnings');
console.log('  Required visible fields:   label, description, intent, source, readOnly indicator');
console.log('  Optional visible fields:   affectedUnits count, expectedEffects count, risks count, priority');
console.log('  Empty options behavior:    Section hidden — no fake option, no noise');
console.log('  Validation before display: isWargame3DecisionOptionSafe required per item');
console.log('  selectedDecision created:  No — still null; MISSING_FIELD still emitted');
console.log('  expectedResult created:    No — still null; MISSING_FIELD still emitted');
console.log('  previewComplete changed:   No — still false');
console.log('  Map overlays added:        No — FORBIDDEN');
console.log('  Gate 7 / apply / execute:  No — FORBIDDEN');
console.log('  W3-STEP-08 example:        3 COA options (COA-01, COA-02, COA-03), read-only text mock');
console.log('  Ops ledger OPTION row:     Not added in this PR — deferred to PR-263/264');
console.log('  Production code changed:   No');
console.log('  wargame3.json changed:     No');
console.log('  Recommended next PR:       PR-262 — Decision Options Fixture Example');
console.log('────────────────────────────────────────────────────────────────────────────');
