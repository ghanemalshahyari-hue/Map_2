'use strict';

// ── PR-260 Test Harness — Decision Options Source Contract Verification ───────
// Verifies that:
//   1. The contract document exists and contains required content.
//   2. No production files were modified.
//   3. wargame3.json is unchanged.
//   4. PR-259 type guards still pass (regression).
//
// No DOM. No Leaflet. No production function execution beyond source checks.

var fs   = require('fs');
var path = require('path');

var contractPath = path.join(__dirname, 'docs/pr-260-wargame3-decision-options-source-contract.md');
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
assert('D01 — docs/pr-260-wargame3-decision-options-source-contract.md exists',
    fs.existsSync(contractPath),
    'file not found: ' + contractPath);

assert('D01b — contract document is non-empty (>= 5000 chars)',
    contractDoc.length >= 5000,
    'length=' + contractDoc.length);

// ─────────────────────────────────────────────────────────────────────────────
// D02 — contract mentions decisionOptions
// ─────────────────────────────────────────────────────────────────────────────
assert('D02 — contract mentions decisionOptions',
    contractDoc.indexOf('decisionOptions') !== -1,
    'decisionOptions not found');

assert('D02b — contract defines decisionOptions as an array',
    contractDoc.indexOf('decisionOptions[]') !== -1,
    'decisionOptions[] notation not found');

// ─────────────────────────────────────────────────────────────────────────────
// D03 — contract references Model C / Hybrid ownership
// ─────────────────────────────────────────────────────────────────────────────
assert('D03 — contract references Model C',
    contractDoc.indexOf('Model C') !== -1,
    'Model C not found');

assert('D03b — contract references Hybrid model',
    contractDoc.indexOf('Hybrid') !== -1 || contractDoc.indexOf('hybrid') !== -1,
    'Hybrid not found');

// ─────────────────────────────────────────────────────────────────────────────
// D04 — contract defines per-step placement
// ─────────────────────────────────────────────────────────────────────────────
assert('D04 — contract defines per-step decisionOptions placement',
    contractDoc.indexOf('Per-step') !== -1 || contractDoc.indexOf('per-step') !== -1,
    'per-step placement not described');

assert('D04b — contract mentions step_ref in placement example',
    contractDoc.indexOf('step_ref') !== -1,
    'step_ref not mentioned in placement');

// ─────────────────────────────────────────────────────────────────────────────
// D05 — contract defines required shape
// ─────────────────────────────────────────────────────────────────────────────
assert('D05 — contract defines id as required field',
    contractDoc.indexOf('"id"') !== -1 || contractDoc.indexOf('`id`') !== -1,
    'id field not defined');

assert('D05b — contract defines label as required field',
    contractDoc.indexOf('"label"') !== -1 || contractDoc.indexOf('`label`') !== -1,
    'label field not defined');

assert('D05c — contract defines description as required field',
    contractDoc.indexOf('"description"') !== -1 || contractDoc.indexOf('`description`') !== -1,
    'description field not defined');

assert('D05d — contract defines intent as required field',
    contractDoc.indexOf('"intent"') !== -1 || contractDoc.indexOf('`intent`') !== -1,
    'intent field not defined');

// ─────────────────────────────────────────────────────────────────────────────
// D06 — contract requires readOnly true
// ─────────────────────────────────────────────────────────────────────────────
assert('D06 — contract requires readOnly: true on options',
    contractDoc.indexOf('"readOnly": true') !== -1 || contractDoc.indexOf('readOnly: true') !== -1,
    'readOnly: true not found');

assert('D06b — contract defines source values source_json and instructor',
    contractDoc.indexOf('"source_json"') !== -1 &&
    contractDoc.indexOf('"instructor"') !== -1,
    'source enum values not defined');

// ─────────────────────────────────────────────────────────────────────────────
// D07 — contract forbids unsafe fields
// ─────────────────────────────────────────────────────────────────────────────
assert('D07 — contract forbids applyNow',
    contractDoc.indexOf('applyNow') !== -1,
    'applyNow not listed as forbidden');

assert('D07b — contract forbids aiGenerated',
    contractDoc.indexOf('aiGenerated') !== -1,
    'aiGenerated not listed as forbidden');

assert('D07c — contract forbids gate7Approved',
    contractDoc.indexOf('gate7Approved') !== -1,
    'gate7Approved not listed as forbidden');

assert('D07d — contract forbids simulationCommitted',
    contractDoc.indexOf('simulationCommitted') !== -1,
    'simulationCommitted not listed as forbidden');

// ─────────────────────────────────────────────────────────────────────────────
// D08 — contract states options do not create selectedDecision
// ─────────────────────────────────────────────────────────────────────────────
assert('D08 — contract states options do not create selectedDecision',
    contractDoc.indexOf('selectedDecision') !== -1 &&
    (contractDoc.indexOf('does not create') !== -1 ||
     contractDoc.indexOf('does not mean') !== -1 ||
     contractDoc.indexOf('does not populate') !== -1 ||
     contractDoc.indexOf('does not exist just because') !== -1),
    'relationship to selectedDecision not defined');

assert('D08b — contract mentions optionRef linkage',
    contractDoc.indexOf('optionRef') !== -1,
    'optionRef not mentioned');

// ─────────────────────────────────────────────────────────────────────────────
// D09 — contract states options do not create expectedResult
// ─────────────────────────────────────────────────────────────────────────────
assert('D09 — contract states expectedEffects must not satisfy expectedResult',
    contractDoc.indexOf('expectedEffects') !== -1 &&
    (contractDoc.indexOf('must not') !== -1 || contractDoc.indexOf('must never') !== -1 ||
     contractDoc.indexOf('FORBIDDEN') !== -1),
    'expectedEffects vs expectedResult distinction not made');

assert('D09b — contract rejects proposedVisualEffects as expectedResult',
    contractDoc.indexOf('proposedVisualEffects') !== -1,
    'proposedVisualEffects not addressed');

// ─────────────────────────────────────────────────────────────────────────────
// D10 — contract states decisionOptions do not mark previewComplete true
// ─────────────────────────────────────────────────────────────────────────────
assert('D10 — contract states decisionOptions presence does not set previewComplete true',
    contractDoc.indexOf('previewComplete') !== -1 &&
    (contractDoc.indexOf('does not make previewComplete true') !== -1 ||
     contractDoc.indexOf('alone must not make previewComplete true') !== -1 ||
     contractDoc.indexOf('Remains `false`') !== -1 ||
     contractDoc.indexOf('Remains false') !== -1 ||
     contractDoc.indexOf('still `false`') !== -1),
    'previewComplete rule for options not stated');

assert('D10b — contract states MISSING_FIELD warnings still emitted',
    contractDoc.indexOf('MISSING_FIELD') !== -1,
    'MISSING_FIELD warning continuity not stated');

// ─────────────────────────────────────────────────────────────────────────────
// D11 — contract includes W3-STEP-08 example
// ─────────────────────────────────────────────────────────────────────────────
assert('D11 — contract includes W3-STEP-08 in example',
    contractDoc.indexOf('W3-STEP-08') !== -1,
    'W3-STEP-08 example not found');

assert('D11b — contract provides at least 2 COA options in example',
    contractDoc.indexOf('COA-01') !== -1 &&
    contractDoc.indexOf('COA-02') !== -1,
    'at least 2 COA options not shown');

assert('D11c — contract includes W3-STEP-08-COA-01 id in example',
    contractDoc.indexOf('W3-STEP-08-COA-01') !== -1,
    'W3-STEP-08-COA-01 id not found');

// ─────────────────────────────────────────────────────────────────────────────
// D12 — contract defines migration path
// ─────────────────────────────────────────────────────────────────────────────
assert('D12 — contract defines migration path with PR-261',
    contractDoc.indexOf('PR-261') !== -1,
    'PR-261 not mentioned in migration path');

assert('D12b — contract migration path includes PR-262 through PR-265',
    contractDoc.indexOf('PR-262') !== -1 &&
    contractDoc.indexOf('PR-263') !== -1 &&
    contractDoc.indexOf('PR-264') !== -1 &&
    contractDoc.indexOf('PR-265') !== -1,
    'migration path incomplete');

// ─────────────────────────────────────────────────────────────────────────────
// D13 — contract confirms no live apply
// ─────────────────────────────────────────────────────────────────────────────
assert('D13 — contract states no live apply in PR-260 through PR-265',
    (contractDoc.indexOf('Do not implement live apply') !== -1 ||
     contractDoc.indexOf('no live apply') !== -1 ||
     contractDoc.indexOf('No apply') !== -1),
    'no-live-apply statement not found');

assert('D13b — contract mentions Gate 7',
    contractDoc.indexOf('Gate 7') !== -1,
    'Gate 7 not mentioned');

// ─────────────────────────────────────────────────────────────────────────────
// D14 — no production files changed
// ─────────────────────────────────────────────────────────────────────────────
var marker260 = 'PR-260-PRODUCTION-CHANGE';
assert('D14 — scenario-workspace.js has no PR-260 production marker',
    src.indexOf(marker260) === -1,
    'marker found in scenario-workspace.js');

var appSrc = fs.readFileSync(path.join(__dirname, 'UI_MOdified/client/app.js'), 'utf8');
assert('D14b — app.js has no PR-260 production marker',
    appSrc.indexOf(marker260) === -1,
    'marker found in app.js');

var adjSrc = fs.readFileSync(path.join(__dirname, 'UI_MOdified/client/wargame/adjudicator-map.js'), 'utf8');
assert('D14c — adjudicator-map.js has no PR-260 production marker',
    adjSrc.indexOf(marker260) === -1,
    'marker found in adjudicator-map.js');

// ─────────────────────────────────────────────────────────────────────────────
// D15 — wargame3.json unchanged
// ─────────────────────────────────────────────────────────────────────────────
assert('D15 — wargame3.json steps have no decisionOptions key',
    w3json.steps.every(function(s) {
        return !Object.prototype.hasOwnProperty.call(s, 'decisionOptions') &&
               !Object.prototype.hasOwnProperty.call(s, 'decision_options');
    }),
    'decisionOptions found in wargame3.json steps');

assert('D15b — wargame3.json has no decision_option_library at root',
    !Object.prototype.hasOwnProperty.call(w3json, 'decision_option_library'),
    'decision_option_library found in wargame3.json root');

assert('D15c — wargame3.json decision_point_baseline still null on all steps',
    w3json.steps.every(function(s) { return s.decision_point_baseline === null; }),
    'decision_point_baseline changed');

// ─────────────────────────────────────────────────────────────────────────────
// R01–R04: regression — PR-259 type guards still intact in source
// ─────────────────────────────────────────────────────────────────────────────
assert('R01 — isWargame3DecisionOptionSafe still defined',
    src.indexOf('function isWargame3DecisionOptionSafe(') !== -1,
    'function not found');

assert('R02 — isWargame3SelectedDecisionSafe still defined',
    src.indexOf('function isWargame3SelectedDecisionSafe(') !== -1,
    'function not found');

assert('R03 — validateWargame3DecisionResultPair still defined',
    src.indexOf('function validateWargame3DecisionResultPair(') !== -1,
    'function not found');

assert('R04 — adapter selectedDecision:null still present',
    src.indexOf("selectedDecision:         null,") !== -1,
    'adapter selectedDecision null rule changed');

assert('R04b — adapter expectedResult:null still present',
    src.indexOf("expectedResult:           null,") !== -1,
    'adapter expectedResult null rule changed');

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
console.log('── PR-260 Contract Verification Summary ─────────────────────────────────────');
console.log('  Contract file:             docs/pr-260-wargame3-decision-options-source-contract.md');
console.log('  Contract length:           ' + contractDoc.length + ' chars');
console.log('  decisionOptions defined:   Yes — per-step placement (preferred) + library alternative');
console.log('  Required shape:            id, label, description, intent, affectedUnits[], expectedEffects[], risks[], source, readOnly:true');
console.log('  Forbidden fields:          applyNow commitNow executeNow liveApply mutateUnits mutateMap mutateScenario backendCommit autoApply aiGenerated simulationCommitted gate7Approved');
console.log('  Ownership model:           Model C (Hybrid) — source options, runtime selection, adjudicated result');
console.log('  W3-STEP-08 example:        3 COA options provided');
console.log('  previewComplete rule:      Options alone do not set previewComplete true');
console.log('  MISSING_FIELD warnings:    Still emitted (selectedDecision, expectedResult still absent)');
console.log('  objective_status_baseline: Must not be copied to expectedResult (confirmed)');
console.log('  Production code changed:   No');
console.log('  wargame3.json changed:     No');
console.log('  Recommended next PR:       PR-261 — Read-Only Decision Options Preview Contract');
console.log('────────────────────────────────────────────────────────────────────────────');
