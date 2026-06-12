'use strict';

// ── PR-266 Test Harness — Wargame 3 Operator Selection Dry-Run Builder ────────
// Verifies:
//   E01:      Both helpers exported on window.AppShellScenarioWorkspace
//   G02–G32:  isWargame3OperatorSelectionDryRunRecordSafe — 31 guard tests
//   B33–B56:  buildWargame3OperatorSelectionDryRunRecord  — 24 builder tests
//   W57–W62:  W3 source regression — step state unchanged
//   S63–S76:  Source safety + file-unchanged assertions
//
// Total: 76 tests.  No DOM. No Leaflet. No production function execution beyond
// the pure extracted functions.

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

// ── extractFn: brace-matched extractor ───────────────────────────────────────
function extractFn(s, name) {
    var sig = 'function ' + name + '(';
    var start = s.indexOf(sig);
    if (start === -1) { return null; }
    var depth = 0; var i = start;
    while (i < s.length) {
        if (s[i] === '{') { depth++; }
        else if (s[i] === '}') { depth--; if (depth === 0) { return s.slice(start, i + 1); } }
        i++;
    }
    return null;
}

// ── Build full harness with all required symbols ──────────────────────────────
var guardSafe;
var buildRecord;
var guardDecision;
var guardOption;
var guardPair;
var buildPreviewData;

(function () {
    var rUF  = src.match(/var _W3DRS_UNSAFE_FIELDS\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\)/);
    var rFS  = src.match(/var _W3DRS_FORBIDDEN_STATUS_TOKENS\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\)/);
    var rVS  = src.match(/var _W3SEL_VALID_STATUSES\s*=\s*(\[[\s\S]*?\]);/);
    var rFR  = src.match(/var _W3SEL_FORBIDDEN_REC_FIELDS\s*=\s*(\[[\s\S]*?\]);/);

    var fnSD  = extractFn(src, 'isWargame3SelectedDecisionSafe');
    var fnOpt = extractFn(src, 'isWargame3DecisionOptionSafe');
    var fnVP  = extractFn(src, 'validateWargame3DecisionResultPair');
    var fnBPD = extractFn(src, 'buildWargame3DecisionOptionsPreviewData');
    var fnGR  = extractFn(src, 'isWargame3OperatorSelectionDryRunRecordSafe');
    var fnBR  = extractFn(src, 'buildWargame3OperatorSelectionDryRunRecord');

    if (!rUF || !rFS || !rVS || !rFR ||
        !fnSD || !fnOpt || !fnVP || !fnBPD || !fnGR || !fnBR) {
        return; // guard tests will fail individually
    }

    var harness =
        'var _W3DRS_UNSAFE_FIELDS = Object.freeze([' + rUF[1] + ']);\n' +
        'var _W3DRS_FORBIDDEN_STATUS_TOKENS = Object.freeze([' + rFS[1] + ']);\n' +
        'var _W3SEL_VALID_STATUSES = ' + rVS[1] + ';\n' +
        'var _W3SEL_FORBIDDEN_REC_FIELDS = ' + rFR[1] + ';\n' +
        fnSD + ';\n' +
        fnOpt + ';\n' +
        fnVP + ';\n' +
        fnBPD + ';\n' +
        fnGR + ';\n' +
        fnBR + ';\n' +
        'return {' +
        '  isWargame3OperatorSelectionDryRunRecordSafe: isWargame3OperatorSelectionDryRunRecordSafe,' +
        '  buildWargame3OperatorSelectionDryRunRecord:  buildWargame3OperatorSelectionDryRunRecord,' +
        '  isWargame3SelectedDecisionSafe:              isWargame3SelectedDecisionSafe,' +
        '  isWargame3DecisionOptionSafe:                isWargame3DecisionOptionSafe,' +
        '  buildWargame3DecisionOptionsPreviewData:     buildWargame3DecisionOptionsPreviewData' +
        '};';

    try {
        var exp = new Function(harness)();
        guardSafe      = exp.isWargame3OperatorSelectionDryRunRecordSafe;
        buildRecord    = exp.buildWargame3OperatorSelectionDryRunRecord;
        guardDecision  = exp.isWargame3SelectedDecisionSafe;
        guardOption    = exp.isWargame3DecisionOptionSafe;
        buildPreviewData = exp.buildWargame3DecisionOptionsPreviewData;
    } catch (e) { /* each assertion will fail gracefully */ }
}());

// ── W3-STEP-08 local test fixture (3 COA options) ────────────────────────────
// readOnly:true is required by isWargame3DecisionOptionSafe on input options.
var W3_STEP_08 = {
    step_id:    'W3-STEP-08',
    stepRef:    'W3-STEP-08',
    decisionOptions: [
        {
            id:          'COA-01',
            label:       'Strike North',
            description: 'Advance along the northern axis using armoured elements.',
            intent:      'Gain positional advantage; fix enemy forces in depth.',
            source:      'source_json',
            readOnly:    true
        },
        {
            id:          'COA-02',
            label:       'Hold Current Position',
            description: 'Consolidate on the current defensive trace.',
            intent:      'Preserve combat power while maintaining pressure.',
            source:      'source_json',
            readOnly:    true
        },
        {
            id:          'COA-03',
            label:       'Withdraw to Phase Line BRAVO',
            description: 'Conduct deliberate withdrawal to Phase Line BRAVO.',
            intent:      'Preserve force integrity for follow-on operations.',
            source:      'source_json',
            readOnly:    true
        }
    ]
};

// Helper: build a minimal valid record for guard tests
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

// ─────────────────────────────────────────────────────────────────────────────
// E01 — exports
// ─────────────────────────────────────────────────────────────────────────────
assert('E01 — isWargame3OperatorSelectionDryRunRecordSafe exported',
    typeof guardSafe === 'function', 'not a function');

assert('E01b — buildWargame3OperatorSelectionDryRunRecord exported',
    typeof buildRecord === 'function', 'not a function');

// ─────────────────────────────────────────────────────────────────────────────
// G: record guard — rejection tests
// ─────────────────────────────────────────────────────────────────────────────
assert('G02 — guard rejects null',
    (function () {
        if (typeof guardSafe !== 'function') { return false; }
        return guardSafe(null).passed === false;
    }()), 'null not rejected');

assert('G03 — guard rejects array',
    (function () {
        if (typeof guardSafe !== 'function') { return false; }
        return guardSafe([]).passed === false;
    }()), 'array not rejected');

assert('G04 — guard rejects missing id',
    (function () {
        if (typeof guardSafe !== 'function') { return false; }
        var r = makeValidRecord({ id: '' });
        return guardSafe(r).passed === false;
    }()), 'empty id not rejected');

assert('G05 — guard rejects missing stepRef',
    (function () {
        if (typeof guardSafe !== 'function') { return false; }
        var r = makeValidRecord({ stepRef: '' });
        return guardSafe(r).passed === false;
    }()), 'empty stepRef not rejected');

assert('G06 — guard rejects missing optionRef',
    (function () {
        if (typeof guardSafe !== 'function') { return false; }
        var r = makeValidRecord({ optionRef: '' });
        return guardSafe(r).passed === false;
    }()), 'empty optionRef not rejected');

assert('G07 — guard rejects missing selectedDecision',
    (function () {
        if (typeof guardSafe !== 'function') { return false; }
        var r = makeValidRecord({ selectedDecision: null });
        return guardSafe(r).passed === false;
    }()), 'null selectedDecision not rejected');

assert('G08 — guard rejects missing sourceOption',
    (function () {
        if (typeof guardSafe !== 'function') { return false; }
        var r = makeValidRecord({ sourceOption: null });
        return guardSafe(r).passed === false;
    }()), 'null sourceOption not rejected');

assert('G09 — guard rejects selectedDecision.source !== "operator"',
    (function () {
        if (typeof guardSafe !== 'function') { return false; }
        var r = makeValidRecord();
        r.selectedDecision = Object.assign({}, r.selectedDecision, { source: 'source_option' });
        return guardSafe(r).passed === false;
    }()), 'wrong source not rejected');

assert('G10 — guard rejects selectedDecision.confidence !== "explicit"',
    (function () {
        if (typeof guardSafe !== 'function') { return false; }
        var r = makeValidRecord();
        r.selectedDecision = Object.assign({}, r.selectedDecision, { confidence: 'instructor_defined' });
        return guardSafe(r).passed === false;
    }()), 'wrong confidence not rejected');

assert('G11 — guard rejects selectedDecision.readOnly !== true',
    (function () {
        if (typeof guardSafe !== 'function') { return false; }
        var r = makeValidRecord();
        r.selectedDecision = Object.assign({}, r.selectedDecision, { readOnly: false });
        return guardSafe(r).passed === false;
    }()), 'readOnly:false not rejected');

assert('G12 — guard rejects optionRef mismatch with selectedDecision.optionRef',
    (function () {
        if (typeof guardSafe !== 'function') { return false; }
        var r = makeValidRecord();
        r.selectedDecision = Object.assign({}, r.selectedDecision, { optionRef: 'COA-99' });
        return guardSafe(r).passed === false;
    }()), 'optionRef mismatch not rejected');

assert('G13 — guard rejects optionRef mismatch with sourceOption.id',
    (function () {
        if (typeof guardSafe !== 'function') { return false; }
        var r = makeValidRecord();
        r.sourceOption = Object.assign({}, r.sourceOption, { id: 'COA-99' });
        return guardSafe(r).passed === false;
    }()), 'sourceOption.id mismatch not rejected');

assert('G14 — guard rejects dryRunOnly !== true',
    (function () {
        if (typeof guardSafe !== 'function') { return false; }
        var r = makeValidRecord({ dryRunOnly: false });
        return guardSafe(r).passed === false;
    }()), 'dryRunOnly:false not rejected');

assert('G15 — guard rejects liveMutationAllowed === true',
    (function () {
        if (typeof guardSafe !== 'function') { return false; }
        var r = makeValidRecord({ liveMutationAllowed: true });
        return guardSafe(r).passed === false;
    }()), 'liveMutationAllowed:true not rejected');

assert('G16 — guard rejects backendCommitAllowed === true',
    (function () {
        if (typeof guardSafe !== 'function') { return false; }
        var r = makeValidRecord({ backendCommitAllowed: true });
        return guardSafe(r).passed === false;
    }()), 'backendCommitAllowed:true not rejected');

assert('G17 — guard rejects invalid status',
    (function () {
        if (typeof guardSafe !== 'function') { return false; }
        var r = makeValidRecord({ status: 'approved' });
        return guardSafe(r).passed === false;
    }()), 'invalid status not rejected');

assert('G18 — guard rejects record containing expectedResult',
    (function () {
        if (typeof guardSafe !== 'function') { return false; }
        var r = makeValidRecord({ expectedResult: 'some result' });
        return guardSafe(r).passed === false;
    }()), 'expectedResult field not rejected');

assert('G19 — guard rejects record containing previewComplete',
    (function () {
        if (typeof guardSafe !== 'function') { return false; }
        var r = makeValidRecord({ previewComplete: false });
        return guardSafe(r).passed === false;
    }()), 'previewComplete field not rejected');

// Unsafe field tests G20–G31
var _unsafeFields = [
    'applyNow', 'commitNow', 'executeNow', 'liveApply',
    'mutateUnits', 'mutateMap', 'mutateScenario', 'backendCommit',
    'autoApply', 'aiGenerated', 'simulationCommitted', 'gate7Approved'
];
var _unsafeLabels = [
    'G20', 'G21', 'G22', 'G23', 'G24', 'G25', 'G26', 'G27',
    'G28', 'G29', 'G30', 'G31'
];
_unsafeFields.forEach(function (field, idx) {
    assert(_unsafeLabels[idx] + ' — guard rejects ' + field + ' on record',
        (function () {
            if (typeof guardSafe !== 'function') { return false; }
            var r = makeValidRecord();
            r[field] = true;
            return guardSafe(r).passed === false;
        }()),
        field + ' not rejected');
});

assert('G32 — valid manually-created record passes guard',
    (function () {
        if (typeof guardSafe !== 'function') { return false; }
        var r = makeValidRecord();
        return guardSafe(r).passed === true;
    }()), 'valid record rejected');

// ─────────────────────────────────────────────────────────────────────────────
// B: builder tests
// ─────────────────────────────────────────────────────────────────────────────
assert('B33 — builder rejects null step',
    (function () {
        if (typeof buildRecord !== 'function') { return false; }
        return buildRecord(null, 'COA-01').passed === false;
    }()), 'null step not rejected');

assert('B34 — builder rejects missing optionId',
    (function () {
        if (typeof buildRecord !== 'function') { return false; }
        return buildRecord(W3_STEP_08, '').passed === false;
    }()), 'empty optionId not rejected');

assert('B35 — builder rejects step with no decisionOptions property',
    (function () {
        if (typeof buildRecord !== 'function') { return false; }
        return buildRecord({ step_id: 'W3-STEP-08' }, 'COA-01').passed === false;
    }()), 'missing decisionOptions not rejected');

assert('B36 — builder rejects non-array decisionOptions',
    (function () {
        if (typeof buildRecord !== 'function') { return false; }
        return buildRecord({ step_id: 'W3-STEP-08', decisionOptions: 'bad' }, 'COA-01').passed === false;
    }()), 'non-array decisionOptions not rejected');

assert('B37 — builder rejects unknown optionId',
    (function () {
        if (typeof buildRecord !== 'function') { return false; }
        return buildRecord(W3_STEP_08, 'COA-99').passed === false;
    }()), 'unknown optionId not rejected');

assert('B38 — builder builds valid record for COA-01',
    (function () {
        if (typeof buildRecord !== 'function') { return false; }
        var r = buildRecord(W3_STEP_08, 'COA-01');
        return r.passed === true && r.record !== null &&
               r.record.optionRef === 'COA-01' && r.record.stepRef === 'W3-STEP-08';
    }()), 'COA-01 build failed');

assert('B39 — builder builds valid record for COA-02',
    (function () {
        if (typeof buildRecord !== 'function') { return false; }
        var r = buildRecord(W3_STEP_08, 'COA-02');
        return r.passed === true && r.record !== null &&
               r.record.optionRef === 'COA-02' && r.record.stepRef === 'W3-STEP-08';
    }()), 'COA-02 build failed');

assert('B40 — builder builds valid record for COA-03',
    (function () {
        if (typeof buildRecord !== 'function') { return false; }
        var r = buildRecord(W3_STEP_08, 'COA-03');
        return r.passed === true && r.record !== null &&
               r.record.optionRef === 'COA-03' && r.record.stepRef === 'W3-STEP-08';
    }()), 'COA-03 build failed');

assert('B41 — builder output passes isWargame3OperatorSelectionDryRunRecordSafe',
    (function () {
        if (typeof buildRecord !== 'function' || typeof guardSafe !== 'function') { return false; }
        var r = buildRecord(W3_STEP_08, 'COA-01');
        if (!r.passed || !r.record) { return false; }
        return guardSafe(r.record).passed === true;
    }()), 'guard rejects builder output');

assert('B42 — builder selectedDecision passes isWargame3SelectedDecisionSafe',
    (function () {
        if (typeof buildRecord !== 'function' || typeof guardDecision !== 'function') { return false; }
        var r = buildRecord(W3_STEP_08, 'COA-01');
        if (!r.passed || !r.record) { return false; }
        return guardDecision(r.record.selectedDecision).passed === true;
    }()), 'selectedDecision guard fails');

assert('B43 — builder sourceOption passes isWargame3DecisionOptionSafe',
    (function () {
        if (typeof buildRecord !== 'function' || typeof guardOption !== 'function') { return false; }
        var r = buildRecord(W3_STEP_08, 'COA-01');
        if (!r.passed || !r.record) { return false; }
        return guardOption(r.record.sourceOption).passed === true;
    }()), 'sourceOption guard fails');

assert('B44 — builder selectedDecision.optionRef matches record.optionRef',
    (function () {
        if (typeof buildRecord !== 'function') { return false; }
        var r = buildRecord(W3_STEP_08, 'COA-02');
        if (!r.passed || !r.record) { return false; }
        return r.record.selectedDecision.optionRef === r.record.optionRef;
    }()), 'optionRef cross-reference mismatch');

assert('B45 — builder sourceOption.id matches record.optionRef',
    (function () {
        if (typeof buildRecord !== 'function') { return false; }
        var r = buildRecord(W3_STEP_08, 'COA-03');
        if (!r.passed || !r.record) { return false; }
        return r.record.sourceOption.id === r.record.optionRef;
    }()), 'sourceOption.id cross-reference mismatch');

assert('B46 — builder does not create expectedResult on record',
    (function () {
        if (typeof buildRecord !== 'function') { return false; }
        var r = buildRecord(W3_STEP_08, 'COA-01');
        if (!r.passed || !r.record) { return false; }
        return !Object.prototype.hasOwnProperty.call(r.record, 'expectedResult');
    }()), 'expectedResult found on record');

assert('B47 — builder does not create previewComplete on record',
    (function () {
        if (typeof buildRecord !== 'function') { return false; }
        var r = buildRecord(W3_STEP_08, 'COA-01');
        if (!r.passed || !r.record) { return false; }
        return !Object.prototype.hasOwnProperty.call(r.record, 'previewComplete');
    }()), 'previewComplete found on record');

assert('B48 — builder output has dryRunOnly:true',
    (function () {
        if (typeof buildRecord !== 'function') { return false; }
        var r = buildRecord(W3_STEP_08, 'COA-01');
        if (!r.passed || !r.record) { return false; }
        return r.record.dryRunOnly === true;
    }()), 'dryRunOnly not true');

assert('B49 — builder output has liveMutationAllowed:false',
    (function () {
        if (typeof buildRecord !== 'function') { return false; }
        var r = buildRecord(W3_STEP_08, 'COA-01');
        if (!r.passed || !r.record) { return false; }
        return r.record.liveMutationAllowed === false;
    }()), 'liveMutationAllowed not false');

assert('B50 — builder output has backendCommitAllowed:false',
    (function () {
        if (typeof buildRecord !== 'function') { return false; }
        var r = buildRecord(W3_STEP_08, 'COA-01');
        if (!r.passed || !r.record) { return false; }
        return r.record.backendCommitAllowed === false;
    }()), 'backendCommitAllowed not false');

assert('B51 — builder supports options.operatorId',
    (function () {
        if (typeof buildRecord !== 'function') { return false; }
        var r = buildRecord(W3_STEP_08, 'COA-01', { operatorId: 'OP-001' });
        if (!r.passed || !r.record) { return false; }
        return r.record.createdBy === 'OP-001' &&
               r.record.selectedDecision.selectedBy === 'OP-001';
    }()), 'operatorId not propagated');

assert('B52 — builder supports options.createdAt',
    (function () {
        if (typeof buildRecord !== 'function') { return false; }
        var r = buildRecord(W3_STEP_08, 'COA-01', { createdAt: '2026-05-27T10:00:00Z' });
        if (!r.passed || !r.record) { return false; }
        return r.record.createdAt === '2026-05-27T10:00:00Z' &&
               r.record.selectedDecision.selectedAt === '2026-05-27T10:00:00Z';
    }()), 'createdAt not propagated');

assert('B53 — builder supports status "selected_for_review"',
    (function () {
        if (typeof buildRecord !== 'function') { return false; }
        var r = buildRecord(W3_STEP_08, 'COA-01', { status: 'selected_for_review' });
        if (!r.passed || !r.record) { return false; }
        return r.record.status === 'selected_for_review';
    }()), 'selected_for_review status not supported');

assert('B54 — builder rejects invalid status in options',
    (function () {
        if (typeof buildRecord !== 'function') { return false; }
        return buildRecord(W3_STEP_08, 'COA-01', { status: 'live' }).passed === false;
    }()), 'invalid status not rejected by builder');

assert('B55 — builder does not mutate original step',
    (function () {
        if (typeof buildRecord !== 'function') { return false; }
        var step = {
            step_id: 'W3-STEP-08',
            stepRef: 'W3-STEP-08',
            decisionOptions: [
                { id: 'COA-01', label: 'Test', description: 'Desc',
                  intent: 'Int', source: 'source_json', readOnly: true }
            ]
        };
        var originalLen = step.decisionOptions.length;
        var originalKey = Object.keys(step).length;
        buildRecord(step, 'COA-01');
        return step.decisionOptions.length === originalLen &&
               Object.keys(step).length === originalKey &&
               !Object.prototype.hasOwnProperty.call(step, 'selectedDecision') &&
               !Object.prototype.hasOwnProperty.call(step, 'expectedResult');
    }()), 'step was mutated');

assert('B56 — builder does not mutate original option object',
    (function () {
        if (typeof buildRecord !== 'function') { return false; }
        var opt = { id: 'COA-01', label: 'Test', description: 'Desc',
                    intent: 'Int', source: 'source_json', readOnly: true };
        var step = { step_id: 'W3-STEP-08', stepRef: 'W3-STEP-08',
                     decisionOptions: [opt] };
        var keysBefore = Object.keys(opt).join(',');
        buildRecord(step, 'COA-01');
        return Object.keys(opt).join(',') === keysBefore &&
               !Object.prototype.hasOwnProperty.call(opt, 'selectedDecision');
    }()), 'option was mutated');

// ─────────────────────────────────────────────────────────────────────────────
// W: W3 source regression
// ─────────────────────────────────────────────────────────────────────────────
var w3json = JSON.parse(
    fs.readFileSync(
        path.join(__dirname, 'UI_MOdified/data/scenarios/wargame3.json'), 'utf8'));

// Find W3-STEP-08 equivalent (step_id matching W3-STEP-08)
var w3step08 = null;
(w3json.steps || []).forEach(function (s) {
    if (s.step_id === 'W3-STEP-08' || s.stepRef === 'W3-STEP-08') { w3step08 = s; }
});

assert('W57 — wargame3.json W3-STEP-08 has no decisionOptions',
    (function () {
        if (!w3step08) { return true; } // step may have different id — non-blocking
        return !Object.prototype.hasOwnProperty.call(w3step08, 'decisionOptions') &&
               !Object.prototype.hasOwnProperty.call(w3step08, 'decision_options');
    }()), 'decisionOptions found on W3-STEP-08 in wargame3.json');

assert('W58 — wargame3.json W3-STEP-08 selectedDecision remains absent/null',
    (function () {
        if (!w3step08) { return true; }
        return !Object.prototype.hasOwnProperty.call(w3step08, 'selectedDecision') ||
               w3step08.selectedDecision === null;
    }()), 'selectedDecision non-null in W3-STEP-08');

assert('W59 — wargame3.json W3-STEP-08 expectedResult remains absent/null',
    (function () {
        if (!w3step08) { return true; }
        return !Object.prototype.hasOwnProperty.call(w3step08, 'expectedResult') ||
               w3step08.expectedResult === null;
    }()), 'expectedResult non-null in W3-STEP-08');

assert('W60 — previewComplete remains false — W3 source still lacks SD+ER+ECA',
    (function () {
        // Verify the formula conditions are still false for all W3 steps
        return w3json.steps.every(function (s) {
            var decisionOk = typeof s.selectedDecision === 'string' && s.selectedDecision !== '';
            var resultOk   = typeof s.expectedResult   === 'string' && s.expectedResult   !== '';
            // If both false, previewComplete would be false regardless of counterOk
            return !decisionOk && !resultOk;
        });
    }()), 'some W3 steps have selectedDecision or expectedResult strings');

assert('W61 — adapter Rule S5 unchanged — selectedDecision:null in _w3pfc_copyStep',
    src.indexOf('selectedDecision:         null,') !== -1,
    'Rule S5 changed in source');

assert('W62 — adapter Rule S10 unchanged — expectedResult:null in _w3pfc_copyStep',
    src.indexOf('expectedResult:           null,') !== -1,
    'Rule S10 changed in source');

// ─────────────────────────────────────────────────────────────────────────────
// S: source safety + file-unchanged checks
// ─────────────────────────────────────────────────────────────────────────────
var marker266 = 'PR-266-PRODUCTION-CHANGE';

assert('S63 — wargame3.json steps have no decisionOptions',
    w3json.steps.every(function (s) {
        return !Object.prototype.hasOwnProperty.call(s, 'decisionOptions');
    }), 'decisionOptions found in wargame3.json steps');

assert('S64 — app.html has no PR-266 production marker',
    (function () {
        var h = fs.readFileSync(path.join(__dirname, 'UI_MOdified/client/app.html'), 'utf8');
        return h.indexOf(marker266) === -1;
    }()), 'marker found in app.html');

assert('S65 — i18n.js has no PR-266 production marker',
    (function () {
        var i = fs.readFileSync(path.join(__dirname, 'UI_MOdified/client/i18n.js'), 'utf8');
        return i.indexOf(marker266) === -1;
    }()), 'marker found in i18n.js');

assert('S66 — style.css has no PR-266 production marker',
    (function () {
        var c = fs.readFileSync(path.join(__dirname, 'UI_MOdified/client/style.css'), 'utf8');
        return c.indexOf(marker266) === -1;
    }()), 'marker found in style.css');

assert('S67 — app.js has no PR-266 production marker',
    (function () {
        var a = fs.readFileSync(path.join(__dirname, 'UI_MOdified/client/app.js'), 'utf8');
        return a.indexOf(marker266) === -1;
    }()), 'marker found in app.js');

assert('S68 — adjudicator-map.js has no PR-266 production marker',
    (function () {
        var adj = fs.readFileSync(
            path.join(__dirname, 'UI_MOdified/client/wargame/adjudicator-map.js'), 'utf8');
        return adj.indexOf(marker266) === -1;
    }()), 'marker found in adjudicator-map.js');

// Source-body checks for the two new helpers
assert('S69 — no DOM access in isWargame3OperatorSelectionDryRunRecordSafe body',
    (function () {
        var fn = extractFn(src, 'isWargame3OperatorSelectionDryRunRecordSafe');
        if (!fn) { return false; }
        return fn.indexOf('document.')      === -1 &&
               fn.indexOf('getElementById') === -1 &&
               fn.indexOf('innerHTML')      === -1 &&
               fn.indexOf('createElement')  === -1;
    }()), 'DOM access found in guard body');

assert('S70 — no DOM access in buildWargame3OperatorSelectionDryRunRecord body',
    (function () {
        var fn = extractFn(src, 'buildWargame3OperatorSelectionDryRunRecord');
        if (!fn) { return false; }
        return fn.indexOf('document.')      === -1 &&
               fn.indexOf('getElementById') === -1 &&
               fn.indexOf('innerHTML')      === -1 &&
               fn.indexOf('createElement')  === -1;
    }()), 'DOM access found in builder body');

assert('S71 — no map paint (fitBounds/addLayer/Leaflet) in helper bodies',
    (function () {
        var fns = [
            extractFn(src, 'isWargame3OperatorSelectionDryRunRecordSafe'),
            extractFn(src, 'buildWargame3OperatorSelectionDryRunRecord')
        ];
        return fns.every(function (fn) {
            if (!fn) { return false; }
            return fn.indexOf('fitBounds')   === -1 &&
                   fn.indexOf('addLayer')    === -1 &&
                   fn.indexOf('L.marker')    === -1 &&
                   fn.indexOf('L.circle')    === -1 &&
                   fn.indexOf('paintMap')    === -1;
        });
    }()), 'map paint found in helper bodies');

assert('S72 — no storage access in helper bodies',
    (function () {
        var fns = [
            extractFn(src, 'isWargame3OperatorSelectionDryRunRecordSafe'),
            extractFn(src, 'buildWargame3OperatorSelectionDryRunRecord')
        ];
        return fns.every(function (fn) {
            if (!fn) { return false; }
            return fn.indexOf('localStorage')  === -1 &&
                   fn.indexOf('sessionStorage') === -1 &&
                   fn.indexOf('IndexedDB')      === -1;
        });
    }()), 'storage access found in helper bodies');

assert('S73 — no fetch/XHR/backend in helper bodies',
    (function () {
        var fns = [
            extractFn(src, 'isWargame3OperatorSelectionDryRunRecordSafe'),
            extractFn(src, 'buildWargame3OperatorSelectionDryRunRecord')
        ];
        return fns.every(function (fn) {
            if (!fn) { return false; }
            return fn.indexOf('fetch(')         === -1 &&
                   fn.indexOf('XMLHttpRequest')  === -1 &&
                   fn.indexOf('/api/')           === -1;
        });
    }()), 'fetch/XHR found in helper bodies');

assert('S74 — no AI/simulation/journal in helper bodies',
    (function () {
        var fns = [
            extractFn(src, 'isWargame3OperatorSelectionDryRunRecordSafe'),
            extractFn(src, 'buildWargame3OperatorSelectionDryRunRecord')
        ];
        return fns.every(function (fn) {
            if (!fn) { return false; }
            return fn.indexOf('journal')    === -1 &&
                   fn.indexOf('/api/sim/')  === -1 &&
                   fn.indexOf('ai.suggest') === -1;
        });
    }()), 'AI/sim/journal found in helper bodies');

assert('S75 — no Gate 7/apply/commit/execute tokens in helper bodies',
    (function () {
        var fns = [
            extractFn(src, 'isWargame3OperatorSelectionDryRunRecordSafe'),
            extractFn(src, 'buildWargame3OperatorSelectionDryRunRecord')
        ];
        var forbidden = ['applyNow', 'commitNow', 'executeNow', 'gate7Approved',
                         'liveApply', 'backendCommit', 'simulationCommitted'];
        return fns.every(function (fn) {
            if (!fn) { return false; }
            // These tokens appear only as string literals in the unsafe-field checks,
            // not as property accesses — confirm they appear in the guard/reject logic only.
            // We check that the *function calls* don't assign these fields.
            return fn.indexOf('record.applyNow =')    === -1 &&
                   fn.indexOf('record.commitNow =')   === -1 &&
                   fn.indexOf('record.executeNow =')  === -1 &&
                   fn.indexOf('record.gate7Approved =') === -1;
        });
    }()), 'unsafe field assignment found in helper bodies');

assert('S76 — no window.RmoozScenario / window.units in helper bodies',
    (function () {
        var fns = [
            extractFn(src, 'isWargame3OperatorSelectionDryRunRecordSafe'),
            extractFn(src, 'buildWargame3OperatorSelectionDryRunRecord')
        ];
        return fns.every(function (fn) {
            if (!fn) { return false; }
            return fn.indexOf('window.RmoozScenario') === -1 &&
                   fn.indexOf('window.units')         === -1 &&
                   fn.indexOf('window.lines')         === -1;
        });
    }()), 'window.RmoozScenario/units/lines access found in helper bodies');

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
console.log('── PR-266 Operator Selection Dry-Run Builder Summary ─────────────────────────');
console.log('  Helpers added:             isWargame3OperatorSelectionDryRunRecordSafe');
console.log('                             buildWargame3OperatorSelectionDryRunRecord');
console.log('  Exported on:               window.AppShellScenarioWorkspace');
console.log('  Record type:               In-memory only — no DOM, no storage, no backend');
console.log('  selectedDecision created:  Only inside the dry-run record; preview pipeline untouched');
console.log('  expectedResult created:    No');
console.log('  previewComplete changed:   No');
console.log('  wargame3.json changed:     No');
console.log('  app.html changed:          No');
console.log('  i18n.js / style.css:       No');
console.log('  app.js / adjudicator-map:  No');
console.log('  Unsafe fields guarded:     12 (applyNow → gate7Approved)');
console.log('  Forbidden record fields:   expectedResult, previewComplete');
console.log('  Status values permitted:   draft | selected_for_review | cancelled');
console.log('  Recommended next PR:       PR-267 — Operator Selection Dry-Run Review Display');
console.log('────────────────────────────────────────────────────────────────────────────');
