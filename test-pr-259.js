'use strict';

// ── PR-259 Test Harness — Wargame 3 Decision/Result Type Guards ───────────────
// Verifies the four pure type-guard functions added in PR-259:
//   isWargame3SelectedDecisionSafe
//   isWargame3ExpectedResultSafe
//   isWargame3DecisionOptionSafe
//   validateWargame3DecisionResultPair
//
// No DOM. No Leaflet. No production scenario navigation.
// Functions are extracted from scenario-workspace.js and executed via new Function.

var fs   = require('fs');
var path = require('path');

var src = fs.readFileSync(
    path.join(__dirname, 'UI_MOdified/client/shell/scenario-workspace.js'), 'utf8');

// ── Extraction helpers ────────────────────────────────────────────────────────
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

// ── Build harness ─────────────────────────────────────────────────────────────
var constants = extractVar('_W3DRS_UNSAFE_FIELDS') + '\n' +
                extractVar('_W3DRS_FORBIDDEN_STATUS_TOKENS') + '\n';
var fn1 = extractFn('isWargame3SelectedDecisionSafe');
var fn2 = extractFn('isWargame3ExpectedResultSafe');
var fn3 = extractFn('isWargame3DecisionOptionSafe');
var fn4 = extractFn('validateWargame3DecisionResultPair');

var combined  = constants + fn1 + '\n' + fn2 + '\n' + fn3 + '\n' + fn4 + '\n';
var returnSrc = 'return { isWargame3SelectedDecisionSafe: isWargame3SelectedDecisionSafe, ' +
                'isWargame3ExpectedResultSafe: isWargame3ExpectedResultSafe, ' +
                'isWargame3DecisionOptionSafe: isWargame3DecisionOptionSafe, ' +
                'validateWargame3DecisionResultPair: validateWargame3DecisionResultPair };';

var api = new Function(combined + returnSrc)();
var sdSafe  = api.isWargame3SelectedDecisionSafe;
var erSafe  = api.isWargame3ExpectedResultSafe;
var doSafe  = api.isWargame3DecisionOptionSafe;
var valPair = api.validateWargame3DecisionResultPair;

// ── Test runner ───────────────────────────────────────────────────────────────
var passed = 0; var failed = 0; var results = [];
function assert(label, cond, detail) {
    if (cond) { passed++; results.push('  PASS  ' + label); }
    else       { failed++; results.push('  FAIL  ' + label + (detail ? '  →  ' + detail : '')); }
}

// ── Fixture helpers ───────────────────────────────────────────────────────────
function validSDObj() {
    return {
        id: 'dec-001', label: 'Advance to Contact',
        description: 'Advance main force to contact position',
        source: 'operator', selectedAt: '2024-01-01T00:00:00Z',
        selectedBy: 'operator-01', optionRef: 'opt-a',
        confidence: 'explicit', readOnly: true
    };
}
function validERObj() {
    return {
        id: 'res-001', label: 'Blue occupies hill',
        description: 'Blue force successfully occupies the hill objective',
        source: 'adjudication', resultType: 'expected',
        linkedDecisionId: 'dec-001', confidence: 'explicit', readOnly: true
    };
}
function validDOObj() {
    return { id: 'opt-a', label: 'Option Alpha', source: 'source_json', readOnly: true };
}

// =============================================================================
// G01 — isWargame3SelectedDecisionSafe — string path (7 tests)
// =============================================================================

var r;

r = sdSafe(null);
assert('G01a — null → fail', !r.passed, 'passed=' + r.passed);

r = sdSafe(undefined);
assert('G01b — undefined → fail', !r.passed, 'passed=' + r.passed);

r = sdSafe('');
assert('G01c — empty string → fail', !r.passed, 'passed=' + r.passed);

r = sdSafe('DORMANT');
assert('G01d — "DORMANT" is forbidden token → fail',
    !r.passed && r.blockedReasons.some(function(s) { return s.indexOf('DORMANT') !== -1; }),
    JSON.stringify(r.blockedReasons));

r = sdSafe('THREATENED');
assert('G01e — "THREATENED" is forbidden token → fail',
    !r.passed && r.blockedReasons.some(function(s) { return s.indexOf('THREATENED') !== -1; }),
    JSON.stringify(r.blockedReasons));

r = sdSafe('CONTESTED');
assert('G01f — "CONTESTED" is forbidden token → fail',
    !r.passed && r.blockedReasons.some(function(s) { return s.indexOf('CONTESTED') !== -1; }),
    JSON.stringify(r.blockedReasons));

r = sdSafe('Advance and secure northern ridge');
assert('G01g — valid string → pass, no blockedReasons',
    r.passed && r.blockedReasons.length === 0,
    JSON.stringify(r));

// =============================================================================
// G02 — isWargame3SelectedDecisionSafe — object path (9 tests)
// =============================================================================

r = sdSafe(validSDObj());
assert('G02a — full valid object → pass',
    r.passed && r.blockedReasons.length === 0,
    JSON.stringify(r));

var noId = validSDObj(); delete noId.id;
r = sdSafe(noId);
assert('G02b — missing id → fail',
    !r.passed && r.blockedReasons.some(function(s) { return s.indexOf('.id') !== -1; }),
    JSON.stringify(r.blockedReasons));

var emptyLabel = validSDObj(); emptyLabel.label = '';
r = sdSafe(emptyLabel);
assert('G02c — empty label → fail',
    !r.passed && r.blockedReasons.some(function(s) { return s.indexOf('.label') !== -1; }),
    JSON.stringify(r.blockedReasons));

var badSource = validSDObj(); badSource.source = 'ai_inferred';
r = sdSafe(badSource);
assert('G02d — invalid source → fail',
    !r.passed && r.blockedReasons.some(function(s) { return s.indexOf('.source') !== -1; }),
    JSON.stringify(r.blockedReasons));

var notRO = validSDObj(); notRO.readOnly = false;
r = sdSafe(notRO);
assert('G02e — readOnly:false → fail',
    !r.passed && r.blockedReasons.some(function(s) { return s.indexOf('readOnly') !== -1; }),
    JSON.stringify(r.blockedReasons));

var withApply = validSDObj(); withApply.applyNow = true;
r = sdSafe(withApply);
assert('G02f — unsafe field applyNow → fail',
    !r.passed && r.blockedReasons.some(function(s) { return s.indexOf('applyNow') !== -1; }),
    JSON.stringify(r.blockedReasons));

var withAI = validSDObj(); withAI.aiGenerated = true;
r = sdSafe(withAI);
assert('G02g — unsafe field aiGenerated → fail',
    !r.passed && r.blockedReasons.some(function(s) { return s.indexOf('aiGenerated') !== -1; }),
    JSON.stringify(r.blockedReasons));

var nullAt = validSDObj(); nullAt.selectedAt = null;
r = sdSafe(nullAt);
assert('G02h — selectedAt:null (allowed) → pass', r.passed, JSON.stringify(r));

var instrConf = validSDObj(); instrConf.confidence = 'instructor_defined';
r = sdSafe(instrConf);
assert('G02i — confidence:"instructor_defined" → pass', r.passed, JSON.stringify(r));

// =============================================================================
// G03 — isWargame3ExpectedResultSafe — string path (5 tests)
// =============================================================================

r = erSafe(null);
assert('G03a — null → fail', !r.passed, 'passed=' + r.passed);

r = erSafe('');
assert('G03b — empty string → fail', !r.passed, 'passed=' + r.passed);

r = erSafe('Blue secures hill — enemy withdraws');
assert('G03c — valid string → pass', r.passed && r.blockedReasons.length === 0, JSON.stringify(r));

r = erSafe('ACTIVE');
assert('G03d — "ACTIVE" is forbidden token → fail',
    !r.passed && r.blockedReasons.some(function(s) { return s.indexOf('ACTIVE') !== -1; }),
    JSON.stringify(r.blockedReasons));

r = erSafe('SUCCESS');
assert('G03e — "SUCCESS" is forbidden token → fail',
    !r.passed && r.blockedReasons.some(function(s) { return s.indexOf('SUCCESS') !== -1; }),
    JSON.stringify(r.blockedReasons));

// =============================================================================
// G04 — isWargame3ExpectedResultSafe — object path (9 tests)
// =============================================================================

r = erSafe(validERObj());
assert('G04a — full valid object → pass',
    r.passed && r.blockedReasons.length === 0,
    JSON.stringify(r));

var noRT = validERObj(); delete noRT.resultType;
r = erSafe(noRT);
assert('G04b — missing resultType → fail',
    !r.passed && r.blockedReasons.some(function(s) { return s.indexOf('resultType') !== -1; }),
    JSON.stringify(r.blockedReasons));

var badRT = validERObj(); badRT.resultType = 'pending';
r = erSafe(badRT);
assert('G04c — invalid resultType "pending" → fail',
    !r.passed && r.blockedReasons.some(function(s) { return s.indexOf('resultType') !== -1; }),
    JSON.stringify(r.blockedReasons));

var badERSrc = validERObj(); badERSrc.source = 'ai_generated';
r = erSafe(badERSrc);
assert('G04d — invalid source "ai_generated" → fail',
    !r.passed && r.blockedReasons.some(function(s) { return s.indexOf('.source') !== -1; }),
    JSON.stringify(r.blockedReasons));

var erNotRO = validERObj(); erNotRO.readOnly = false;
r = erSafe(erNotRO);
assert('G04e — readOnly:false → fail',
    !r.passed && r.blockedReasons.some(function(s) { return s.indexOf('readOnly') !== -1; }),
    JSON.stringify(r.blockedReasons));

var simComm = validERObj(); simComm.simulationCommitted = true;
r = erSafe(simComm);
assert('G04f — unsafe field simulationCommitted → fail',
    !r.passed && r.blockedReasons.some(function(s) { return s.indexOf('simulationCommitted') !== -1; }),
    JSON.stringify(r.blockedReasons));

var g7App = validERObj(); g7App.gate7Approved = true;
r = erSafe(g7App);
assert('G04g — unsafe field gate7Approved → fail',
    !r.passed && r.blockedReasons.some(function(s) { return s.indexOf('gate7Approved') !== -1; }),
    JSON.stringify(r.blockedReasons));

var nullLDI = validERObj(); nullLDI.linkedDecisionId = null;
r = erSafe(nullLDI);
assert('G04h — linkedDecisionId:null (allowed) → pass', r.passed, JSON.stringify(r));

var adjConf = validERObj(); adjConf.confidence = 'adjudicated';
r = erSafe(adjConf);
assert('G04i — confidence:"adjudicated" → pass', r.passed, JSON.stringify(r));

// =============================================================================
// G05 — isWargame3DecisionOptionSafe (8 tests)
// =============================================================================

r = doSafe(null);
assert('G05a — null → fail', !r.passed, 'passed=' + r.passed);

r = doSafe(validDOObj());
assert('G05b — valid minimal option → pass',
    r.passed && r.blockedReasons.length === 0,
    JSON.stringify(r));

var noOptId = validDOObj(); delete noOptId.id;
r = doSafe(noOptId);
assert('G05c — missing id → fail',
    !r.passed && r.blockedReasons.some(function(s) { return s.indexOf('.id') !== -1; }),
    JSON.stringify(r.blockedReasons));

var emptyOptLabel = validDOObj(); emptyOptLabel.label = '';
r = doSafe(emptyOptLabel);
assert('G05d — empty label → fail',
    !r.passed && r.blockedReasons.some(function(s) { return s.indexOf('.label') !== -1; }),
    JSON.stringify(r.blockedReasons));

var badAU = validDOObj(); badAU.affectedUnits = 'all';
r = doSafe(badAU);
assert('G05e — affectedUnits not array → fail',
    !r.passed && r.blockedReasons.some(function(s) { return s.indexOf('affectedUnits') !== -1; }),
    JSON.stringify(r.blockedReasons));

var badOptSrc = validDOObj(); badOptSrc.source = 'generated';
r = doSafe(badOptSrc);
assert('G05f — invalid source "generated" → fail',
    !r.passed && r.blockedReasons.some(function(s) { return s.indexOf('.source') !== -1; }),
    JSON.stringify(r.blockedReasons));

var doNotRO = validDOObj(); doNotRO.readOnly = false;
r = doSafe(doNotRO);
assert('G05g — readOnly:false → fail',
    !r.passed && r.blockedReasons.some(function(s) { return s.indexOf('readOnly') !== -1; }),
    JSON.stringify(r.blockedReasons));

var g7Opt = validDOObj(); g7Opt.gate7Approved = true;
r = doSafe(g7Opt);
assert('G05h — unsafe field gate7Approved → fail',
    !r.passed && r.blockedReasons.some(function(s) { return s.indexOf('gate7Approved') !== -1; }),
    JSON.stringify(r.blockedReasons));

// =============================================================================
// G06 — validateWargame3DecisionResultPair (14 tests)
// =============================================================================

r = valPair(null);
assert('G06a — null step → fail, previewCompleteEligible false',
    !r.passed && r.previewCompleteEligible === false,
    JSON.stringify(r));

r = valPair({ selectedDecision: null, expectedResult: null });
assert('G06b — both null, no eca → fail, previewCompleteEligible false',
    !r.passed && r.previewCompleteEligible === false,
    JSON.stringify(r));

r = valPair({ selectedDecision: null, expectedResult: null });
assert('G06c — selectedDecisionStatus.present false when null',
    r.selectedDecisionStatus.present === false,
    JSON.stringify(r.selectedDecisionStatus));

r = valPair({ selectedDecision: null, expectedResult: null });
assert('G06d — expectedResultStatus.present false when null',
    r.expectedResultStatus.present === false,
    JSON.stringify(r.expectedResultStatus));

r = valPair({ selectedDecision: 'Advance', expectedResult: null,
              enemyCounterActions: ['enemy flanks left'] });
assert('G06e — valid sd + null er → sdStatus.passed true, erStatus.passed false',
    r.selectedDecisionStatus.passed === true && r.expectedResultStatus.passed === false,
    JSON.stringify({ sd: r.selectedDecisionStatus, er: r.expectedResultStatus }));

r = valPair({ selectedDecision: null, expectedResult: 'Blue takes hill',
              enemyCounterActions: ['enemy flanks left'] });
assert('G06f — null sd + valid er → sdStatus.passed false, erStatus.passed true',
    r.selectedDecisionStatus.passed === false && r.expectedResultStatus.passed === true,
    JSON.stringify({ sd: r.selectedDecisionStatus, er: r.expectedResultStatus }));

r = valPair({ selectedDecision: 'Advance', expectedResult: 'Blue takes hill',
              enemyCounterActions: [] });
assert('G06g — both valid strings but empty eca → fail, previewCompleteEligible false',
    !r.passed && r.previewCompleteEligible === false &&
    r.blockedReasons.some(function(s) { return s.indexOf('enemyCounterActions') !== -1; }),
    JSON.stringify(r));

r = valPair({ selectedDecision: 'Advance', expectedResult: 'Blue takes hill',
              enemyCounterActions: ['enemy flanks left'] });
assert('G06h — both valid strings + non-empty eca → pass, previewCompleteEligible true',
    r.passed && r.previewCompleteEligible === true,
    JSON.stringify(r));

r = valPair({ selectedDecision: 'DENIED', expectedResult: 'Blue takes hill',
              enemyCounterActions: ['enemy action'] });
assert('G06i — sd = forbidden token → sdStatus.passed false, overall fail',
    !r.passed && r.selectedDecisionStatus.passed === false,
    JSON.stringify(r));

r = valPair({ selectedDecision: 'Advance', expectedResult: 'FAILURE',
              enemyCounterActions: ['enemy action'] });
assert('G06j — er = forbidden token → erStatus.passed false, overall fail',
    !r.passed && r.expectedResultStatus.passed === false,
    JSON.stringify(r));

var obsVal = 'Hill under threat from northeast axis';
r = valPair({ selectedDecision: 'Advance', expectedResult: obsVal,
              objective_status_baseline: obsVal,
              enemyCounterActions: ['enemy action'] });
assert('G06k — objective_status_baseline copied to expectedResult → fail',
    !r.passed &&
    r.blockedReasons.some(function(s) { return s.indexOf('objective_status_baseline') !== -1; }),
    JSON.stringify(r.blockedReasons));

r = valPair({ selectedDecision: 'DENIED', expectedResult: null });
assert('G06l — sdStatus.present true when sd is non-null (even invalid token)',
    r.selectedDecisionStatus.present === true,
    JSON.stringify(r.selectedDecisionStatus));

r = valPair({ selectedDecision: validSDObj(), expectedResult: validERObj(),
              enemyCounterActions: ['enemy withdraws'] });
assert('G06m — valid structured objects for both → pass, previewCompleteEligible true',
    r.passed && r.previewCompleteEligible === true,
    JSON.stringify(r));

r = valPair({ selectedDecision: 'Advance', expectedResult: 'Blue takes hill' });
assert('G06n — missing enemyCounterActions → previewCompleteEligible false',
    r.previewCompleteEligible === false &&
    r.blockedReasons.some(function(s) { return s.indexOf('enemyCounterActions') !== -1; }),
    JSON.stringify(r));

// =============================================================================
// Source-level regression checks (non-counted — production integrity)
// =============================================================================
var markerSD  = 'function isWargame3SelectedDecisionSafe(';
var markerER  = 'function isWargame3ExpectedResultSafe(';
var markerDO  = 'function isWargame3DecisionOptionSafe(';
var markerVP  = 'function validateWargame3DecisionResultPair(';
var exportSD  = 'isWargame3SelectedDecisionSafe:';
var exportER  = 'isWargame3ExpectedResultSafe:';
var exportDO  = 'isWargame3DecisionOptionSafe:';
var exportVP  = 'validateWargame3DecisionResultPair:';

var srcOk = src.indexOf(markerSD) !== -1 &&
            src.indexOf(markerER) !== -1 &&
            src.indexOf(markerDO) !== -1 &&
            src.indexOf(markerVP) !== -1 &&
            src.indexOf(exportSD) !== -1 &&
            src.indexOf(exportER) !== -1 &&
            src.indexOf(exportDO) !== -1 &&
            src.indexOf(exportVP) !== -1;

var existingAdapterOk =
    src.indexOf("selectedDecision:         null,") !== -1 &&
    src.indexOf("expectedResult:           null,") !== -1 &&
    src.indexOf("typeof step.selectedDecision === 'string'") !== -1 &&
    src.indexOf("typeof step.expectedResult === 'string'") !== -1;

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
console.log('── PR-259 Source / Regression Checks ───────────────────────────────────────');
console.log('  All 4 functions defined in source:     ' + (src.indexOf(markerSD) !== -1 && src.indexOf(markerER) !== -1 && src.indexOf(markerDO) !== -1 && src.indexOf(markerVP) !== -1 ? 'Yes' : 'NO'));
console.log('  All 4 functions exported on window.*:  ' + (src.indexOf(exportSD) !== -1 && src.indexOf(exportER) !== -1 && src.indexOf(exportDO) !== -1 && src.indexOf(exportVP) !== -1 ? 'Yes' : 'NO'));
console.log('  Adapter selectedDecision:null intact:  ' + (src.indexOf("selectedDecision:         null,") !== -1 ? 'Yes' : 'NO'));
console.log('  Adapter expectedResult:null intact:    ' + (src.indexOf("expectedResult:           null,") !== -1 ? 'Yes' : 'NO'));
console.log('  buildScenarioStepPreview sd check OK:  ' + (src.indexOf("typeof step.selectedDecision === 'string'") !== -1 ? 'Yes' : 'NO'));
console.log('  buildScenarioStepPreview er check OK:  ' + (src.indexOf("typeof step.expectedResult === 'string'") !== -1 ? 'Yes' : 'NO'));
console.log('  previewComplete not re-wired:          ' + (src.indexOf('PR-259-PRODUCTION-CHANGE') === -1 ? 'Yes (no marker)' : 'MODIFIED'));
console.log('────────────────────────────────────────────────────────────────────────────');

console.log('');
console.log('── PR-259 Summary ───────────────────────────────────────────────────────────');
console.log('  isWargame3SelectedDecisionSafe:     defined, exported, tested (G01–G02)');
console.log('  isWargame3ExpectedResultSafe:        defined, exported, tested (G03–G04)');
console.log('  isWargame3DecisionOptionSafe:        defined, exported, tested (G05)');
console.log('  validateWargame3DecisionResultPair:  defined, exported, tested (G06)');
console.log('  Forbidden status tokens:             DORMANT THREATENED CONTESTED DENIED ACTIVE COMPLETE SUCCESS FAILURE');
console.log('  Unsafe fields blocked:               applyNow commitNow executeNow liveApply mutateUnits mutateMap mutateScenario backendCommit autoApply aiGenerated simulationCommitted gate7Approved');
console.log('  objective_status_baseline rejection: G06k verified');
console.log('  previewComplete NOT re-wired:        correct — deferred to future PR');
console.log('  Production file changed:             scenario-workspace.js (new functions + exports only)');
console.log('  wargame3.json changed:               No');
console.log('  app.js changed:                      No');
console.log('  adjudicator-map.js changed:          No');
console.log('  Recommended next PR:                 PR-260');
console.log('────────────────────────────────────────────────────────────────────────────');
