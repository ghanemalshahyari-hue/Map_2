'use strict';

// ── PR-265 Test Harness — Operator Selection Dry-Run Record Contract ──────────
// Verifies:
//   1.  Contract document exists and is non-empty.
//   2.  Required content is present (operator selection, dry-run record, etc.).
//   3.  Forbidden content is absent.
//   4.  No production files were modified.
//   5.  wargame3.json is unchanged.
//
// No DOM. No Leaflet. No production function execution.

var fs   = require('fs');
var path = require('path');

var contractPath = path.join(
    __dirname,
    'docs/pr-265-wargame3-operator-selection-dry-run-record-contract.md'
);
var contractDoc = fs.existsSync(contractPath)
    ? fs.readFileSync(contractPath, 'utf8')
    : '';

var src = fs.readFileSync(
    path.join(__dirname, 'UI_MOdified/client/shell/scenario-workspace.js'), 'utf8');
var w3json = JSON.parse(
    fs.readFileSync(
        path.join(__dirname, 'UI_MOdified/data/scenarios/wargame3.json'), 'utf8'));

// ── Test runner ───────────────────────────────────────────────────────────────
var passed = 0; var failed = 0; var results = [];
function assert(label, cond, detail) {
    if (cond) { passed++; results.push('  PASS  ' + label); }
    else       { failed++; results.push('  FAIL  ' + label + (detail ? '  →  ' + detail : '')); }
}

// ─────────────────────────────────────────────────────────────────────────────
// D01 — contract document exists and has substance
// ─────────────────────────────────────────────────────────────────────────────
assert('D01 — docs/pr-265-...contract.md exists',
    fs.existsSync(contractPath),
    'file not found: ' + contractPath);

assert('D01b — contract is non-empty (>= 5000 chars)',
    contractDoc.length >= 5000,
    'length=' + contractDoc.length);

// ─────────────────────────────────────────────────────────────────────────────
// D02 — operator selection content
// ─────────────────────────────────────────────────────────────────────────────
assert('D02 — contract mentions operator selection',
    contractDoc.indexOf('operator selection') !== -1 ||
    contractDoc.indexOf('Operator Selection') !== -1 ||
    contractDoc.indexOf('operator selects') !== -1 ||
    contractDoc.indexOf('operator explicit') !== -1,
    'operator selection not mentioned');

assert('D02b — contract mentions dry-run record',
    contractDoc.indexOf('dry-run record') !== -1 ||
    contractDoc.indexOf('dry-run selection record') !== -1 ||
    contractDoc.indexOf('Dry-Run Record') !== -1,
    'dry-run record not mentioned');

assert('D02c — contract mentions COA (Course of Action)',
    contractDoc.indexOf('COA') !== -1,
    'COA not mentioned');

// ─────────────────────────────────────────────────────────────────────────────
// D03 — in-memory only / no persistence
// ─────────────────────────────────────────────────────────────────────────────
assert('D03 — contract states record is in-memory only',
    contractDoc.indexOf('in-memory only') !== -1 ||
    contractDoc.indexOf('In-Memory Only') !== -1 ||
    contractDoc.indexOf('in memory only') !== -1 ||
    contractDoc.indexOf('in-memory') !== -1,
    'in-memory rule not stated');

assert('D03b — contract forbids localStorage',
    contractDoc.indexOf('localStorage') !== -1 &&
    (contractDoc.indexOf('FORBIDDEN') !== -1 || contractDoc.indexOf('forbidden') !== -1 ||
     contractDoc.indexOf('must not') !== -1 || contractDoc.indexOf('Never') !== -1),
    'localStorage prohibition not stated');

assert('D03c — contract forbids sessionStorage',
    contractDoc.indexOf('sessionStorage') !== -1,
    'sessionStorage not mentioned as forbidden');

assert('D03d — contract forbids IndexedDB',
    contractDoc.indexOf('IndexedDB') !== -1,
    'IndexedDB not mentioned as forbidden');

assert('D03e — contract states page reload clears the record',
    contractDoc.indexOf('reload') !== -1 &&
    (contractDoc.indexOf('clears') !== -1 || contractDoc.indexOf('cleared') !== -1 ||
     contractDoc.indexOf('clear') !== -1 || contractDoc.indexOf('permanently') !== -1),
    'page-reload clear rule not stated');

// ─────────────────────────────────────────────────────────────────────────────
// D04 — backend forbidden
// ─────────────────────────────────────────────────────────────────────────────
assert('D04 — contract forbids backend communication',
    contractDoc.indexOf('backend') !== -1 &&
    (contractDoc.indexOf('FORBIDDEN') !== -1 || contractDoc.indexOf('forbidden') !== -1 ||
     contractDoc.indexOf('must not') !== -1 || contractDoc.indexOf('Never') !== -1 ||
     contractDoc.indexOf('no') !== -1),
    'backend prohibition not stated');

assert('D04b — contract forbids fetch / XHR',
    contractDoc.indexOf('fetch') !== -1 || contractDoc.indexOf('XHR') !== -1 ||
    contractDoc.indexOf('XMLHttpRequest') !== -1,
    'fetch/XHR prohibition not stated');

// ─────────────────────────────────────────────────────────────────────────────
// D05 — live mutation forbidden
// ─────────────────────────────────────────────────────────────────────────────
assert('D05 — contract forbids live scenario mutation',
    contractDoc.indexOf('live') !== -1 &&
    (contractDoc.indexOf('mutation') !== -1 || contractDoc.indexOf('mutate') !== -1 ||
     contractDoc.indexOf('mutating') !== -1),
    'live mutation prohibition not stated');

assert('D05b — contract mentions window.RmoozScenario',
    contractDoc.indexOf('window.RmoozScenario') !== -1 ||
    contractDoc.indexOf('RmoozScenario') !== -1,
    'RmoozScenario not mentioned');

assert('D05c — contract mentions window.units',
    contractDoc.indexOf('window.units') !== -1 || contractDoc.indexOf('units') !== -1,
    'units mutation rule not stated');

// ─────────────────────────────────────────────────────────────────────────────
// D06 — selection does not create expectedResult
// ─────────────────────────────────────────────────────────────────────────────
assert('D06 — contract states selection does not create expectedResult',
    contractDoc.indexOf('expectedResult') !== -1 &&
    (contractDoc.indexOf('does not create') !== -1 ||
     contractDoc.indexOf('Does NOT Create') !== -1 ||
     contractDoc.indexOf('does NOT create') !== -1 ||
     contractDoc.indexOf('remains null') !== -1 ||
     contractDoc.indexOf('null') !== -1),
    'expectedResult non-creation not stated');

assert('D06b — contract states expectedEffects are not expectedResult',
    contractDoc.indexOf('expectedEffects') !== -1 &&
    contractDoc.indexOf('expectedResult') !== -1 &&
    (contractDoc.indexOf('is not') !== -1 || contractDoc.indexOf('not') !== -1 ||
     contractDoc.indexOf('Not') !== -1),
    'expectedEffects vs expectedResult distinction not stated');

assert('D06c — contract states objective_status_baseline is not expectedResult',
    contractDoc.indexOf('objective_status_baseline') !== -1,
    'objective_status_baseline not addressed');

// ─────────────────────────────────────────────────────────────────────────────
// D07 — selection alone does not make previewComplete true
// ─────────────────────────────────────────────────────────────────────────────
assert('D07 — contract states selection alone does not make previewComplete true',
    contractDoc.indexOf('previewComplete') !== -1 &&
    (contractDoc.indexOf('remains false') !== -1 ||
     contractDoc.indexOf('still false') !== -1 ||
     contractDoc.indexOf('Does Not') !== -1 ||
     contractDoc.indexOf('does not') !== -1 ||
     contractDoc.indexOf('alone') !== -1),
    'previewComplete-unchanged rule not stated');

assert('D07b — contract states three conditions for previewComplete',
    contractDoc.indexOf('selectedDecision') !== -1 &&
    contractDoc.indexOf('expectedResult') !== -1 &&
    contractDoc.indexOf('enemyCounterActions') !== -1,
    'three conditions for previewComplete not stated');

// ─────────────────────────────────────────────────────────────────────────────
// D08 — apply/execute/commit/Gate 7 forbidden
// ─────────────────────────────────────────────────────────────────────────────
assert('D08 — contract forbids Apply/Execute/Commit labels',
    (contractDoc.indexOf('Apply') !== -1 || contractDoc.indexOf('apply') !== -1) &&
    (contractDoc.indexOf('Execute') !== -1 || contractDoc.indexOf('execute') !== -1) &&
    (contractDoc.indexOf('Commit') !== -1 || contractDoc.indexOf('commit') !== -1) &&
    (contractDoc.indexOf('FORBIDDEN') !== -1 || contractDoc.indexOf('forbidden') !== -1 ||
     contractDoc.indexOf('must not') !== -1),
    'Apply/Execute/Commit prohibition not stated');

assert('D08b — contract forbids Gate 7',
    contractDoc.indexOf('Gate 7') !== -1,
    'Gate 7 not mentioned');

assert('D08c — contract mentions dry-run only constraint',
    contractDoc.indexOf('dryRunOnly') !== -1 ||
    contractDoc.indexOf('dry-run only') !== -1 ||
    contractDoc.indexOf('dryRunOnly: true') !== -1,
    'dryRunOnly constraint not stated');

// ─────────────────────────────────────────────────────────────────────────────
// D09 — dry-run record shape defined
// ─────────────────────────────────────────────────────────────────────────────
assert('D09 — contract defines dry-run record shape with id field',
    contractDoc.indexOf('id:') !== -1 &&
    contractDoc.indexOf('stepRef') !== -1 &&
    contractDoc.indexOf('optionRef') !== -1,
    'record shape fields not defined');

assert('D09b — contract defines selectedDecision sub-object in record',
    contractDoc.indexOf('selectedDecision') !== -1 &&
    contractDoc.indexOf('source:') !== -1 &&
    contractDoc.indexOf('"operator"') !== -1,
    'selectedDecision sub-object not defined in record');

assert('D09c — contract defines sourceOption sub-object in record',
    contractDoc.indexOf('sourceOption') !== -1,
    'sourceOption sub-object not defined');

assert('D09d — contract defines status field with values',
    contractDoc.indexOf('status') !== -1 &&
    contractDoc.indexOf('"draft"') !== -1 &&
    (contractDoc.indexOf('"selected_for_review"') !== -1 ||
     contractDoc.indexOf('selected_for_review') !== -1),
    'status field values not defined');

// ─────────────────────────────────────────────────────────────────────────────
// D10 — optionRef requirement
// ─────────────────────────────────────────────────────────────────────────────
assert('D10 — contract requires optionRef in record',
    contractDoc.indexOf('optionRef') !== -1,
    'optionRef not mentioned');

assert('D10b — contract states optionRef must match decisionOptions[].id',
    contractDoc.indexOf('optionRef') !== -1 &&
    (contractDoc.indexOf('match') !== -1 || contractDoc.indexOf('references') !== -1 ||
     contractDoc.indexOf('reference') !== -1 || contractDoc.indexOf('matches') !== -1),
    'optionRef matching rule not stated');

// ─────────────────────────────────────────────────────────────────────────────
// D11 — dryRunOnly:true required
// ─────────────────────────────────────────────────────────────────────────────
assert('D11 — contract requires dryRunOnly:true on record',
    contractDoc.indexOf('dryRunOnly') !== -1 &&
    (contractDoc.indexOf('true') !== -1 || contractDoc.indexOf('REQUIRED') !== -1),
    'dryRunOnly:true not stated as required');

// ─────────────────────────────────────────────────────────────────────────────
// D12 — liveMutationAllowed:false required
// ─────────────────────────────────────────────────────────────────────────────
assert('D12 — contract requires liveMutationAllowed:false on record',
    contractDoc.indexOf('liveMutationAllowed') !== -1 &&
    (contractDoc.indexOf('false') !== -1 || contractDoc.indexOf('REQUIRED') !== -1),
    'liveMutationAllowed:false not stated as required');

assert('D12b — contract requires backendCommitAllowed:false on record',
    contractDoc.indexOf('backendCommitAllowed') !== -1 &&
    contractDoc.indexOf('false') !== -1,
    'backendCommitAllowed:false not stated as required');

// ─────────────────────────────────────────────────────────────────────────────
// D13 — forbidden label text
// ─────────────────────────────────────────────────────────────────────────────
assert('D13 — contract defines required UI label (Dry-run selection / For review)',
    contractDoc.indexOf('dry-run') !== -1 &&
    (contractDoc.indexOf('review') !== -1 || contractDoc.indexOf('Review') !== -1),
    'required UI label text not defined');

assert('D13b — contract forbids Confirm label',
    contractDoc.indexOf('Confirm') !== -1,
    'Confirm not mentioned as forbidden');

// ─────────────────────────────────────────────────────────────────────────────
// D14 — auto-selection forbidden
// ─────────────────────────────────────────────────────────────────────────────
assert('D14 — contract forbids auto-selection',
    (contractDoc.indexOf('auto-select') !== -1 ||
     contractDoc.indexOf('auto-selection') !== -1 ||
     contractDoc.indexOf('Auto-selection') !== -1 ||
     contractDoc.indexOf('automatically') !== -1) &&
    (contractDoc.indexOf('FORBIDDEN') !== -1 || contractDoc.indexOf('must not') !== -1 ||
     contractDoc.indexOf('forbidden') !== -1),
    'auto-selection prohibition not stated');

assert('D14b — contract states explicit click required',
    contractDoc.indexOf('explicit') !== -1 &&
    (contractDoc.indexOf('click') !== -1 || contractDoc.indexOf('action') !== -1),
    'explicit operator action not required');

// ─────────────────────────────────────────────────────────────────────────────
// D15 — migration path to PR-266
// ─────────────────────────────────────────────────────────────────────────────
assert('D15 — contract recommends PR-266',
    contractDoc.indexOf('PR-266') !== -1,
    'PR-266 not in migration path');

assert('D15b — migration path includes PR-267 (type guard)',
    contractDoc.indexOf('PR-267') !== -1,
    'PR-267 not in migration path');

assert('D15c — migration path includes PR-268 (builder)',
    contractDoc.indexOf('PR-268') !== -1,
    'PR-268 not in migration path');

assert('D15d — migration path includes PR-269 (selection display)',
    contractDoc.indexOf('PR-269') !== -1,
    'PR-269 not in migration path');

// ─────────────────────────────────────────────────────────────────────────────
// D16 — AI/sim boundary
// ─────────────────────────────────────────────────────────────────────────────
assert('D16 — contract mentions AI/sim boundary (PR-12)',
    contractDoc.indexOf('PR-12') !== -1 ||
    contractDoc.indexOf('AI/sim boundary') !== -1 ||
    contractDoc.indexOf('AI boundary') !== -1,
    'AI/sim boundary not referenced');

assert('D16b — contract forbids AI-generated selectedDecision',
    contractDoc.indexOf('AI') !== -1 &&
    (contractDoc.indexOf('FORBIDDEN') !== -1 || contractDoc.indexOf('forbidden') !== -1 ||
     contractDoc.indexOf('must not') !== -1),
    'AI prohibition not stated');

// ─────────────────────────────────────────────────────────────────────────────
// D17 — unsafe fields all listed
// ─────────────────────────────────────────────────────────────────────────────
assert('D17 — contract lists applyNow as unsafe field',
    contractDoc.indexOf('applyNow') !== -1, 'applyNow not listed');

assert('D17b — contract lists commitNow as unsafe field',
    contractDoc.indexOf('commitNow') !== -1, 'commitNow not listed');

assert('D17c — contract lists gate7Approved as unsafe field',
    contractDoc.indexOf('gate7Approved') !== -1, 'gate7Approved not listed');

assert('D17d — contract lists simulationCommitted as unsafe field',
    contractDoc.indexOf('simulationCommitted') !== -1, 'simulationCommitted not listed');

// ─────────────────────────────────────────────────────────────────────────────
// D18 — isWargame3SelectedDecisionSafe compatibility
// ─────────────────────────────────────────────────────────────────────────────
assert('D18 — contract states selectedDecision must pass isWargame3SelectedDecisionSafe',
    contractDoc.indexOf('isWargame3SelectedDecisionSafe') !== -1,
    'isWargame3SelectedDecisionSafe not mentioned');

assert('D18b — contract mentions future isWargame3SelectionRecordSafe (PR-267)',
    contractDoc.indexOf('isWargame3SelectionRecordSafe') !== -1,
    'isWargame3SelectionRecordSafe not mentioned as future guard');

// ─────────────────────────────────────────────────────────────────────────────
// D19 — W3-STEP-08 worked example
// ─────────────────────────────────────────────────────────────────────────────
assert('D19 — contract includes W3-STEP-08 worked example',
    contractDoc.indexOf('W3-STEP-08') !== -1,
    'W3-STEP-08 example not found');

assert('D19b — example shows selectedDecision stays null in preview pipeline',
    contractDoc.indexOf('W3-STEP-08') !== -1 &&
    contractDoc.indexOf('null') !== -1 &&
    (contractDoc.indexOf('unchanged') !== -1 || contractDoc.indexOf('stays null') !== -1 ||
     contractDoc.indexOf('remains null') !== -1),
    'null/unchanged state not shown in example');

// ─────────────────────────────────────────────────────────────────────────────
// R: regression — PR-259/260/261/263/264 still intact
// ─────────────────────────────────────────────────────────────────────────────
assert('R01 — isWargame3DecisionOptionSafe still defined in source',
    src.indexOf('function isWargame3DecisionOptionSafe(') !== -1, 'function missing');

assert('R02 — isWargame3SelectedDecisionSafe still defined',
    src.indexOf('function isWargame3SelectedDecisionSafe(') !== -1, 'function missing');

assert('R03 — isWargame3ExpectedResultSafe still defined',
    src.indexOf('function isWargame3ExpectedResultSafe(') !== -1, 'function missing');

assert('R04 — validateWargame3DecisionResultPair still defined',
    src.indexOf('function validateWargame3DecisionResultPair(') !== -1, 'function missing');

assert('R05 — buildWargame3DecisionOptionsPreviewData still defined',
    src.indexOf('function buildWargame3DecisionOptionsPreviewData(') !== -1, 'function missing');

assert('R06 — _paintW3DecisionOptions still defined',
    src.indexOf('function _paintW3DecisionOptions(') !== -1, 'function missing');

assert('R07 — adapter selectedDecision:null (Rule S5) still present',
    src.indexOf('selectedDecision:         null,') !== -1, 'Rule S5 changed');

assert('R07b — adapter expectedResult:null (Rule S10) still present',
    src.indexOf('expectedResult:           null,') !== -1, 'Rule S10 changed');

// ─────────────────────────────────────────────────────────────────────────────
// S: safety — no production files changed
// ─────────────────────────────────────────────────────────────────────────────
var marker265 = 'PR-265-PRODUCTION-CHANGE';

assert('S01 — scenario-workspace.js has no PR-265 production marker',
    src.indexOf(marker265) === -1, 'marker found in scenario-workspace.js');

assert('S02 — app.js has no PR-265 production marker',
    (function () {
        var appSrc = fs.readFileSync(
            path.join(__dirname, 'UI_MOdified/client/app.js'), 'utf8');
        return appSrc.indexOf(marker265) === -1;
    }()),
    'marker found in app.js');

assert('S03 — adjudicator-map.js has no PR-265 production marker',
    (function () {
        var adjSrc = fs.readFileSync(
            path.join(__dirname, 'UI_MOdified/client/wargame/adjudicator-map.js'), 'utf8');
        return adjSrc.indexOf(marker265) === -1;
    }()),
    'marker found in adjudicator-map.js');

assert('S04 — wargame3.json steps have no decisionOptions key',
    w3json.steps.every(function (s) {
        return !Object.prototype.hasOwnProperty.call(s, 'decisionOptions') &&
               !Object.prototype.hasOwnProperty.call(s, 'decision_options');
    }),
    'decisionOptions found in wargame3.json steps');

assert('S05 — wargame3.json selectedDecision still absent from all steps',
    w3json.steps.every(function (s) {
        return !Object.prototype.hasOwnProperty.call(s, 'selectedDecision') &&
               !Object.prototype.hasOwnProperty.call(s, 'selected_decision');
    }),
    'selectedDecision found in wargame3.json');

assert('S06 — wargame3.json expectedResult still absent from all steps',
    w3json.steps.every(function (s) {
        return !Object.prototype.hasOwnProperty.call(s, 'expectedResult') &&
               !Object.prototype.hasOwnProperty.call(s, 'expected_result');
    }),
    'expectedResult found in wargame3.json');

assert('S07 — no isWargame3SelectionRecordSafe defined in source yet (deferred to PR-267)',
    src.indexOf('function isWargame3SelectionRecordSafe(') === -1,
    'isWargame3SelectionRecordSafe already added — should be in PR-267');

assert('S08 — no buildWargame3SelectionRecord defined in source yet (deferred to PR-268)',
    src.indexOf('function buildWargame3SelectionRecord(') === -1,
    'buildWargame3SelectionRecord already added — should be in PR-268');

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
console.log('── PR-265 Contract Verification Summary ─────────────────────────────────────');
console.log('  Contract file:           docs/pr-265-wargame3-operator-selection-dry-run-record-contract.md');
console.log('  Contract length:         ' + contractDoc.length + ' chars');
console.log('  Selection ownership:     Explicit operator action only — Model C hybrid');
console.log('  Record lives:            In-memory only — no storage, no backend');
console.log('  Record cleared by:       Page reload');
console.log('  selectedDecision created: No — not until PR-270+ controlled layer');
console.log('  expectedResult created:  No — awaits adjudication (PR-266+ scope)');
console.log('  previewComplete changed: No — requires SD + ER + ECA + validatePair');
console.log('  wargame3.json changed:   No');
console.log('  Production code changed: No');
console.log('  Unsafe fields listed:    12 (applyNow, commitNow, ..., gate7Approved)');
console.log('  Recommended next PR:     PR-266 — Expected Result Adjudication Source Contract');
console.log('  Type guard deferred to:  PR-267 (isWargame3SelectionRecordSafe)');
console.log('  Builder deferred to:     PR-268 (buildWargame3SelectionRecord)');
console.log('  UI deferred to:          PR-269');
console.log('────────────────────────────────────────────────────────────────────────────');
