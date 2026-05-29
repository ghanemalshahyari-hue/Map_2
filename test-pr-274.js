/**
 * test-pr-274.js — Wargame 3 Scenario Review Session State Builder
 *
 * 85 tests covering:
 *   T01        export present
 *   T02-T05    input rejection
 *   T06-T11    session safety flags
 *   T12-T15    step identity fields
 *   T16-T20    decision options counting
 *   T21-T26    reviewed COA
 *   T27-T34    expectedResult / previewComplete invariants
 *   T35-T39    map overlay summary
 *   T40-T42    map safety (no paint, no Leaflet)
 *   T43-T45    warning summary
 *   T46-T48    mutation guards
 *   T49        session frozen/copied
 *   T50-T59    feature regression (existing W3 functions exported)
 *   T60-T66    file protection
 *   T67-T84    safety boundary
 *   T85        no console.error
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ── helpers ──────────────────────────────────────────────────────────────────
function readSrc(rel) {
    return fs.readFileSync(path.join(__dirname, rel), 'utf8');
}

function extractFn(src, name) {
    const re = new RegExp(
        '(?:function\\s+' + name + '\\s*\\(|' +
        name + '\\s*:\\s*function\\s*\\(|' +
        name + '\\s*=\\s*function\\s*\\()'
    );
    const m = re.exec(src);
    if (!m) return null;
    let idx = m.index;
    while (idx < src.length && src[idx] !== '{') idx++;
    if (idx >= src.length) return null;
    let depth = 0, start = idx;
    while (idx < src.length) {
        if (src[idx] === '{') depth++;
        else if (src[idx] === '}') { depth--; if (depth === 0) break; }
        idx++;
    }
    return src.slice(start, idx + 1);
}

function extractVar(name) {
    const src = wsSrc;
    const re = new RegExp('var\\s+' + name + '\\s*=\\s*Object\\.freeze\\(');
    const m = re.exec(src);
    if (!m) return null;
    let idx = m.index + m[0].length - 1;
    let depth = 0, start = idx;
    while (idx < src.length) {
        if (src[idx] === '(' || src[idx] === '{' || src[idx] === '[') depth++;
        else if (src[idx] === ')' || src[idx] === '}' || src[idx] === ']') {
            depth--; if (depth === 0) break;
        }
        idx++;
    }
    return 'var ' + name + ' = ' + src.slice(m.index + m[0].length - 1, idx + 1) + ';';
}

function extractPlainArrayVar(name) {
    const src = wsSrc;
    const re = new RegExp('var\\s+' + name + '\\s*=\\s*\\[');
    const m = re.exec(src);
    if (!m) return null;
    let idx = m.index + m[0].length - 1;
    let depth = 0, start = idx;
    while (idx < src.length) {
        if (src[idx] === '[') depth++;
        else if (src[idx] === ']') { depth--; if (depth === 0) break; }
        idx++;
    }
    return 'var ' + name + ' = ' + src.slice(start, idx + 1) + ';';
}

// ── source files ─────────────────────────────────────────────────────────────
const wsSrc   = readSrc('UI_MOdified/client/shell/scenario-workspace.js');
const appHtml = readSrc('UI_MOdified/client/app.html');
const i18nSrc = readSrc('UI_MOdified/client/i18n.js');
const cssSrc  = readSrc('UI_MOdified/client/style.css');

// ── test runner ──────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
const failures = [];

function test(id, label, fn) {
    try {
        fn();
        console.log('  PASS  ' + id + ' ' + label);
        passed++;
    } catch (e) {
        console.error('  FAIL  ' + id + ' ' + label + '\n         ' + e.message);
        failed++;
        failures.push(id + ': ' + label);
    }
}

function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

// ── build harness ─────────────────────────────────────────────────────────────
function buildHarness() {
    const w3DrsUnsafe   = extractVar('_W3DRS_UNSAFE_FIELDS') ||
        "var _W3DRS_UNSAFE_FIELDS = Object.freeze(['applyNow','commitNow','executeNow','liveApply','mutateUnits','mutateMap','mutateScenario','backendCommit','autoApply','aiGenerated','simulationCommitted','gate7Approved']);";
    const w3DrsForbid   = extractVar('_W3DRS_FORBIDDEN_STATUS_TOKENS') ||
        "var _W3DRS_FORBIDDEN_STATUS_TOKENS = Object.freeze(['DORMANT','THREATENED','CONTESTED','DENIED','ACTIVE','COMPLETE','SUCCESS','FAILURE']);";
    const w3SelStatuses = extractPlainArrayVar('_W3SEL_VALID_STATUSES') ||
        "var _W3SEL_VALID_STATUSES = ['draft','selected_for_review','cancelled'];";
    const w3SelForbid   = extractPlainArrayVar('_W3SEL_FORBIDDEN_REC_FIELDS') ||
        "var _W3SEL_FORBIDDEN_REC_FIELDS = ['expectedResult','previewComplete'];";

    const isSdSafe     = extractFn(wsSrc, 'isWargame3SelectedDecisionSafe');
    const isErSafe     = extractFn(wsSrc, 'isWargame3ExpectedResultSafe');
    const isDoSafe     = extractFn(wsSrc, 'isWargame3DecisionOptionSafe');
    const isRecSafe    = extractFn(wsSrc, 'isWargame3OperatorSelectionDryRunRecordSafe');
    const clearFn      = extractFn(wsSrc, '_clearW3CoaReviewRecord');
    const getFn        = extractFn(wsSrc, '_getW3CoaReviewRecordForStep');
    const builderFn    = extractFn(wsSrc, 'buildWargame3ScenarioReviewSessionState');

    assert(isSdSafe,  'isWargame3SelectedDecisionSafe not found');
    assert(isErSafe,  'isWargame3ExpectedResultSafe not found');
    assert(isDoSafe,  'isWargame3DecisionOptionSafe not found');
    assert(isRecSafe, 'isWargame3OperatorSelectionDryRunRecordSafe not found');
    assert(clearFn,   '_clearW3CoaReviewRecord not found');
    assert(getFn,     '_getW3CoaReviewRecordForStep not found');
    assert(builderFn, 'buildWargame3ScenarioReviewSessionState not found');

    const code = `
        ${w3DrsUnsafe}
        ${w3DrsForbid}
        ${w3SelStatuses}
        ${w3SelForbid}

        function isWargame3SelectedDecisionSafe(value, options) ${isSdSafe}
        function isWargame3ExpectedResultSafe(value, options) ${isErSafe}
        function isWargame3DecisionOptionSafe(value, options) ${isDoSafe}
        function isWargame3OperatorSelectionDryRunRecordSafe(record, options) ${isRecSafe}

        var _w3CoaReviewRecord = null;
        function _clearW3CoaReviewRecord() ${clearFn}
        function _getW3CoaReviewRecordForStep(stepRef) ${getFn}

        function buildWargame3ScenarioReviewSessionState(preview, options) ${builderFn}

        return {
            build:    buildWargame3ScenarioReviewSessionState,
            setRec:   function(r) { _w3CoaReviewRecord = r; },
            clearRec: _clearW3CoaReviewRecord
        };
    `;
    return new Function(code)();
}

// ── minimal valid W3 preview ──────────────────────────────────────────────────
function makePreview(overrides) {
    const base = {
        fixtureId:            'W3-FIX-01',
        fixtureName:          'Wargame 3 Alpha',
        activeStepId:         'W3-STEP-08',
        activeStepIndex:      7,
        totalSteps:           12,
        objectiveStatusBaseline: 'THREATENED',
        readOnly:             true,
        liveMutationAllowed:  false,
        decisionOptions:      [],
        warningsDetail:       [],
        missingDataWarnings:  []
    };
    return Object.assign({}, base, overrides || {});
}

function makeRecord(stepRef, optionId, optionLabel) {
    stepRef     = stepRef     || 'W3-STEP-08';
    optionId    = optionId    || 'W3-STEP-08-OPT-HOLD';
    optionLabel = optionLabel || 'Hold Current Position';
    return {
        id:       'W3-SEL-' + stepRef + '-' + optionId,
        stepRef:  stepRef,
        optionRef: optionId,
        selectedDecision: {
            id:          'SEL-' + stepRef + '-' + optionId,
            label:       optionLabel,
            description: 'Operator selected ' + optionLabel,
            source:      'operator',
            selectedAt:  null,
            selectedBy:  null,
            optionRef:   optionId,
            confidence:  'explicit',
            readOnly:    true
        },
        sourceOption: {
            id:          optionId,
            label:       optionLabel,
            description: 'Test option',
            intent:      'Test intent',
            source:      'instructor',
            readOnly:    true
        },
        status:               'draft',
        dryRunOnly:           true,
        liveMutationAllowed:  false,
        backendCommitAllowed: false,
        createdAt:            null,
        createdBy:            null
    };
}

function makeOption(id, label) {
    return { id: id || 'W3-OPT-A', label: label || 'Option A',
             source: 'instructor', readOnly: true };
}

// ── T01: export present ───────────────────────────────────────────────────────
console.log('\n── T01: Export ─────────────────────────────────────────────────────');

test('T01', 'buildWargame3ScenarioReviewSessionState exported', () => {
    assert(wsSrc.includes('buildWargame3ScenarioReviewSessionState:'),
        'not found in exports block');
});

// ── T02-T05: input rejection ──────────────────────────────────────────────────
console.log('\n── T02-T05: Input rejection ────────────────────────────────────────');

test('T02', 'helper rejects null preview', () => {
    const h = buildHarness();
    const r = h.build(null);
    assert(!r.passed && r.session === null && r.blockedReasons.length > 0,
        'null should fail');
});
test('T03', 'helper rejects array preview', () => {
    const h = buildHarness();
    const r = h.build([]);
    assert(!r.passed && r.session === null, 'array should fail');
});
test('T04', 'helper rejects non-W3 preview (no activeStepId)', () => {
    const h = buildHarness();
    const r = h.build({ readOnly: true, liveMutationAllowed: false });
    assert(!r.passed && r.session === null, 'missing activeStepId should fail');
});
test('T05', 'helper rejects non-W3 preview (wrong activeStepId prefix)', () => {
    const h = buildHarness();
    const r = h.build({ activeStepId: 'AMBER-STEP-01', readOnly: true, liveMutationAllowed: false });
    assert(!r.passed && r.session === null, 'non-W3 step should fail');
});

// ── T05b: accepts valid W3 ────────────────────────────────────────────────────
test('T05b', 'helper accepts valid W3 preview', () => {
    const h = buildHarness();
    const r = h.build(makePreview());
    assert(r.passed && r.session !== null,
        'valid W3 preview should pass: ' + JSON.stringify(r.blockedReasons));
});

// ── T06-T11: safety flags ─────────────────────────────────────────────────────
console.log('\n── T06-T11: Session safety flags ───────────────────────────────────');

test('T06', 'sessionType is "wargame3_review_session"', () => {
    const h = buildHarness();
    const { session } = h.build(makePreview());
    assert(session.sessionType === 'wargame3_review_session',
        'wrong sessionType: ' + session.sessionType);
});
test('T07', 'source is "dry_run_preview"', () => {
    const h = buildHarness();
    const { session } = h.build(makePreview());
    assert(session.source === 'dry_run_preview', 'wrong source: ' + session.source);
});
test('T08', 'readOnly: true', () => {
    const h = buildHarness();
    const { session } = h.build(makePreview());
    assert(session.readOnly === true, 'readOnly should be true');
});
test('T09', 'dryRunOnly: true', () => {
    const h = buildHarness();
    const { session } = h.build(makePreview());
    assert(session.dryRunOnly === true, 'dryRunOnly should be true');
});
test('T10', 'liveMutationAllowed: false', () => {
    const h = buildHarness();
    const { session } = h.build(makePreview());
    assert(session.liveMutationAllowed === false, 'liveMutationAllowed should be false');
});
test('T11', 'backendCommitAllowed: false', () => {
    const h = buildHarness();
    const { session } = h.build(makePreview());
    assert(session.backendCommitAllowed === false, 'backendCommitAllowed should be false');
});

// ── T12-T15: step identity ────────────────────────────────────────────────────
console.log('\n── T12-T15: Step identity fields ───────────────────────────────────');

test('T12', 'stepRef copied from activeStepId', () => {
    const h = buildHarness();
    const { session } = h.build(makePreview({ activeStepId: 'W3-STEP-08' }));
    assert(session.stepRef === 'W3-STEP-08', 'stepRef mismatch: ' + session.stepRef);
});
test('T13', 'stepIndex copied when supplied', () => {
    const h = buildHarness();
    const { session } = h.build(makePreview({ activeStepIndex: 5 }));
    assert(session.stepIndex === 5, 'stepIndex mismatch: ' + session.stepIndex);
});
test('T14', 'totalSteps copied when supplied', () => {
    const h = buildHarness();
    const { session } = h.build(makePreview({ totalSteps: 10 }));
    assert(session.totalSteps === 10, 'totalSteps mismatch: ' + session.totalSteps);
});
test('T15', 'objectiveStatus copied from objectiveStatusBaseline', () => {
    const h = buildHarness();
    const { session } = h.build(makePreview({ objectiveStatusBaseline: 'THREATENED' }));
    assert(session.objectiveStatus === 'THREATENED',
        'objectiveStatus mismatch: ' + session.objectiveStatus);
});

// ── T16-T20: decision options ─────────────────────────────────────────────────
console.log('\n── T16-T20: Decision options ────────────────────────────────────────');

test('T16', 'decisionOptionsAvailable false when no options', () => {
    const h = buildHarness();
    const { session } = h.build(makePreview({ decisionOptions: [] }));
    assert(session.decisionOptionsAvailable === false,
        'should be false with empty array');
});
test('T17', 'decisionOptionCount 0 when no options', () => {
    const h = buildHarness();
    const { session } = h.build(makePreview({ decisionOptions: [] }));
    assert(session.decisionOptionCount === 0, 'count should be 0');
});
test('T18', 'decisionOptionsAvailable true when safe options present', () => {
    const h = buildHarness();
    const p = makePreview({ decisionOptions: [makeOption('OPT-A', 'Option A'),
                                              makeOption('OPT-B', 'Option B')] });
    const { session } = h.build(p);
    assert(session.decisionOptionsAvailable === true, 'should be true with safe options');
});
test('T19', 'decisionOptionCount counts only safe options', () => {
    const h = buildHarness();
    const p = makePreview({ decisionOptions: [makeOption('OPT-A', 'Option A'),
                                              makeOption('OPT-B', 'Option B')] });
    const { session } = h.build(p);
    assert(session.decisionOptionCount === 2, 'count should be 2, got ' + session.decisionOptionCount);
});
test('T20', 'unsafe decision option is not counted', () => {
    const h = buildHarness();
    // Option without readOnly:true will fail isWargame3DecisionOptionSafe
    const unsafeOpt = { id: 'OPT-BAD', label: 'Bad', source: 'instructor', readOnly: false };
    const safeOpt   = makeOption('OPT-SAFE', 'Safe');
    const p = makePreview({ decisionOptions: [unsafeOpt, safeOpt] });
    const { session } = h.build(p);
    assert(session.decisionOptionCount === 1,
        'only 1 safe option should be counted, got ' + session.decisionOptionCount);
});

// ── T21-T26: reviewed COA ─────────────────────────────────────────────────────
console.log('\n── T21-T26: Reviewed COA ────────────────────────────────────────────');

test('T21', 'reviewedCoa.available false when no record', () => {
    const h = buildHarness();
    const { session } = h.build(makePreview());
    assert(session.reviewedCoa.available === false, 'should be false with no record');
});
test('T22', 'reviewedCoa.available true when valid record on preview', () => {
    const h = buildHarness();
    const rec = makeRecord('W3-STEP-08', 'W3-STEP-08-OPT-HOLD', 'Hold Current Position');
    const p = makePreview({ operatorSelectionDryRunRecord: rec });
    const { session } = h.build(p);
    assert(session.reviewedCoa.available === true,
        'should be true with valid record on preview');
});
test('T23', 'reviewedCoa.optionRef matches record.optionRef', () => {
    const h = buildHarness();
    const rec = makeRecord('W3-STEP-08', 'W3-STEP-08-OPT-HOLD', 'Hold Current Position');
    const p = makePreview({ operatorSelectionDryRunRecord: rec });
    const { session } = h.build(p);
    assert(session.reviewedCoa.optionRef === 'W3-STEP-08-OPT-HOLD',
        'optionRef mismatch: ' + session.reviewedCoa.optionRef);
});
test('T24', 'reviewedCoa.label matches record.selectedDecision.label', () => {
    const h = buildHarness();
    const rec = makeRecord('W3-STEP-08', 'W3-STEP-08-OPT-HOLD', 'Hold Current Position');
    const p = makePreview({ operatorSelectionDryRunRecord: rec });
    const { session } = h.build(p);
    assert(session.reviewedCoa.label === 'Hold Current Position',
        'label mismatch: ' + session.reviewedCoa.label);
});
test('T25', 'reviewedCoa.status matches record.status', () => {
    const h = buildHarness();
    const rec = makeRecord('W3-STEP-08', 'W3-STEP-08-OPT-HOLD', 'Hold Current Position');
    rec.status = 'selected_for_review';
    const p = makePreview({ operatorSelectionDryRunRecord: rec });
    const { session } = h.build(p);
    assert(session.reviewedCoa.status === 'selected_for_review',
        'status mismatch: ' + session.reviewedCoa.status);
});
test('T26', 'invalid reviewed record is ignored (available false)', () => {
    const h = buildHarness();
    // Record missing required fields
    const badRec = { id: '', stepRef: '', optionRef: '',
                     dryRunOnly: true, liveMutationAllowed: false,
                     backendCommitAllowed: false, status: 'draft' };
    const p = makePreview({ operatorSelectionDryRunRecord: badRec });
    const { session } = h.build(p);
    assert(session.reviewedCoa.available === false,
        'invalid record should produce available:false');
});

// ── T27-T34: expectedResult / previewComplete invariants ─────────────────────
console.log('\n── T27-T34: expectedResult / previewComplete invariants ─────────────');

test('T27', 'selectedDecision is not created on preview by builder', () => {
    const h = buildHarness();
    const p = makePreview();
    h.build(p);
    assert(!('selectedDecision' in p),
        'builder should not add selectedDecision to preview');
});
test('T28', 'expectedResultAttached always false', () => {
    const h = buildHarness();
    const { session } = h.build(makePreview());
    assert(session.expectedResultAttached === false,
        'expectedResultAttached should be false');
});
test('T29', 'expectedResult not on session object', () => {
    const h = buildHarness();
    const { session } = h.build(makePreview());
    assert(!('expectedResult' in session),
        'session should not have expectedResult field');
});
test('T30', 'previewComplete always false', () => {
    const h = buildHarness();
    const { session } = h.build(makePreview());
    assert(session.previewComplete === false, 'previewComplete should be false');
});
test('T31', 'helper does not call getWargame3ExpectedResultForReview (source check)', () => {
    const fn = extractFn(wsSrc, 'buildWargame3ScenarioReviewSessionState');
    assert(fn && !fn.includes('getWargame3ExpectedResultForReview'),
        'builder calls getWargame3ExpectedResultForReview — should not in PR-274');
});
test('T32', 'helper does not use expectedEffects as expectedResult', () => {
    const fn = extractFn(wsSrc, 'buildWargame3ScenarioReviewSessionState');
    assert(fn && !fn.includes('expectedEffects'),
        'builder references expectedEffects');
});
test('T33', 'helper does not use objective_status_baseline as expectedResult', () => {
    const fn = extractFn(wsSrc, 'buildWargame3ScenarioReviewSessionState');
    // It may read objectiveStatusBaseline for the objectiveStatus field, but
    // must NOT assign it to expectedResult
    assert(fn && !fn.includes('expectedResult') ||
           (fn.includes('expectedResultAttached') && !fn.includes('= preview.objectiveStatusBaseline')),
        'builder may be misusing objective_status_baseline');
});
test('T34', 'helper does not use proposedVisualEffects as expectedResult', () => {
    const fn = extractFn(wsSrc, 'buildWargame3ScenarioReviewSessionState');
    assert(fn && !fn.includes('proposedVisualEffects'),
        'builder references proposedVisualEffects');
});

// ── T35-T39: map overlay summary ─────────────────────────────────────────────
console.log('\n── T35-T39: Map overlay summary ────────────────────────────────────');

test('T35', 'mapOverlaySummary defaults to zero counts when no overlay', () => {
    const h = buildHarness();
    const { session } = h.build(makePreview());
    const s = session.mapOverlaySummary;
    assert(s.markerCount === 0 && s.movementTrailCount === 0 &&
           s.objectiveHighlightCount === 0 && s.warningCount === 0,
        'all counts should be 0: ' + JSON.stringify(s));
});
test('T36', 'mapOverlaySummary reads overlay.markers.length', () => {
    const h = buildHarness();
    const overlay = { readOnly: true, markers: [{}, {}, {}],
                      movementTrails: [], objectiveHighlights: [], warnings: [] };
    const { session } = h.build(makePreview(), { overlay });
    assert(session.mapOverlaySummary.markerCount === 3,
        'markerCount should be 3, got ' + session.mapOverlaySummary.markerCount);
});
test('T37', 'mapOverlaySummary reads overlay.movementTrails.length', () => {
    const h = buildHarness();
    const overlay = { readOnly: true, markers: [],
                      movementTrails: [{}, {}], objectiveHighlights: [], warnings: [] };
    const { session } = h.build(makePreview(), { overlay });
    assert(session.mapOverlaySummary.movementTrailCount === 2,
        'movementTrailCount should be 2, got ' + session.mapOverlaySummary.movementTrailCount);
});
test('T38', 'mapOverlaySummary reads overlay.objectiveHighlights.length', () => {
    const h = buildHarness();
    const overlay = { readOnly: true, markers: [],
                      movementTrails: [], objectiveHighlights: [{}], warnings: [] };
    const { session } = h.build(makePreview(), { overlay });
    assert(session.mapOverlaySummary.objectiveHighlightCount === 1,
        'objectiveHighlightCount should be 1');
});
test('T39', 'mapOverlaySummary reads overlay.warnings.length', () => {
    const h = buildHarness();
    const overlay = { readOnly: true, markers: [],
                      movementTrails: [], objectiveHighlights: [],
                      warnings: [{code: 'W1'}, {code: 'W2'}] };
    const { session } = h.build(makePreview(), { overlay });
    assert(session.mapOverlaySummary.warningCount === 2,
        'warningCount should be 2, got ' + session.mapOverlaySummary.warningCount);
});

// ── T40-T42: map safety ───────────────────────────────────────────────────────
console.log('\n── T40-T42: Map safety ─────────────────────────────────────────────');

test('T40', 'helper does not paint map (source check)', () => {
    const fn = extractFn(wsSrc, 'buildWargame3ScenarioReviewSessionState');
    assert(fn && !fn.includes('paintWargame3') && !fn.includes('paintDryRun'),
        'builder calls a map paint function');
});
test('T41', 'helper does not call Leaflet (source check)', () => {
    const fn = extractFn(wsSrc, 'buildWargame3ScenarioReviewSessionState');
    assert(fn && !fn.includes('L.marker') && !fn.includes('L.circle') &&
           !fn.includes('leaflet'),
        'builder references Leaflet');
});
test('T42', 'helper does not call fitBounds (source check)', () => {
    const fn = extractFn(wsSrc, 'buildWargame3ScenarioReviewSessionState');
    assert(fn && !fn.includes('fitBounds'), 'builder calls fitBounds');
});

// ── T43-T45: warning summary ──────────────────────────────────────────────────
console.log('\n── T43-T45: Warning summary ─────────────────────────────────────────');

test('T43', 'warningSummary.warningCount equals warningsDetail.length', () => {
    const h = buildHarness();
    const warns = [{ code: 'W1', message: 'msg1' }, { code: 'W2', message: 'msg2' }];
    const { session } = h.build(makePreview({ warningsDetail: warns }));
    assert(session.warningSummary.warningCount === 2,
        'warningCount should be 2, got ' + session.warningSummary.warningCount);
});
test('T44', 'warningSummary.warningCodes collects warning codes', () => {
    const h = buildHarness();
    const warns = [{ code: 'MISSING_FIELD', message: 'm1' },
                   { code: 'UNKNOWN_OBJECTIVE', message: 'm2' }];
    const { session } = h.build(makePreview({ warningsDetail: warns }));
    assert(session.warningSummary.warningCodes.includes('MISSING_FIELD') &&
           session.warningSummary.warningCodes.includes('UNKNOWN_OBJECTIVE'),
        'warningCodes should include codes: ' + JSON.stringify(session.warningSummary.warningCodes));
});
test('T45', 'warningSummary.warningCodes capped at 20', () => {
    const h = buildHarness();
    const warns = Array.from({ length: 30 }, (_, i) => ({ code: 'W' + i, message: 'm' }));
    const { session } = h.build(makePreview({ warningsDetail: warns }));
    assert(session.warningSummary.warningCodes.length <= 20,
        'warningCodes should be capped at 20, got ' + session.warningSummary.warningCodes.length);
    assert(session.warningSummary.warningCount === 30,
        'warningCount should still reflect total: ' + session.warningSummary.warningCount);
});

// ── T46-T48: mutation guards ──────────────────────────────────────────────────
console.log('\n── T46-T48: Mutation guards ─────────────────────────────────────────');

test('T46', 'helper does not mutate preview', () => {
    const h = buildHarness();
    const p = makePreview({ activeStepId: 'W3-STEP-08', fixtureName: 'TestScenario' });
    const nameBefore = p.fixtureName;
    h.build(p);
    assert(p.fixtureName === nameBefore, 'preview.fixtureName was mutated');
    assert(!('sessionType' in p), 'builder added sessionType to preview');
});
test('T47', 'helper does not mutate decisionOptions array', () => {
    const h = buildHarness();
    const opts = [makeOption('OPT-A', 'Opt A'), makeOption('OPT-B', 'Opt B')];
    const lenBefore = opts.length;
    const p = makePreview({ decisionOptions: opts });
    h.build(p);
    assert(opts.length === lenBefore, 'decisionOptions length changed');
    assert(opts[0].id === 'OPT-A', 'decisionOptions[0] was mutated');
});
test('T48', 'helper does not mutate reviewed record', () => {
    const h = buildHarness();
    const rec = makeRecord('W3-STEP-08', 'W3-STEP-08-OPT-HOLD', 'Hold Current Position');
    const optRefBefore = rec.optionRef;
    const p = makePreview({ operatorSelectionDryRunRecord: rec });
    h.build(p);
    assert(rec.optionRef === optRefBefore, 'record.optionRef was mutated');
    assert(!('sessionType' in rec), 'builder added sessionType to record');
});

// ── T49: session is a new object ──────────────────────────────────────────────
console.log('\n── T49: Session isolation ───────────────────────────────────────────');

test('T49', 'returned session is a new object (not preview)', () => {
    const h = buildHarness();
    const p = makePreview();
    const { session } = h.build(p);
    assert(session !== p, 'session should not be the same reference as preview');
    assert(session.sessionType === 'wargame3_review_session',
        'session should have sessionType');
});

// ── T50-T59: regression — previous PR exports intact ─────────────────────────
console.log('\n── T50-T59: Regression PRs 267-273 ────────────────────────────────');

const regressionChecks = [
    ['T50', '_paintW3OperatorSelectionReview'],
    ['T51', '_handleW3CoaReviewClick'],
    ['T52', '_clearW3CoaReviewRecord'],
    ['T53', '_getW3CoaReviewRecordForStep'],
    ['T54', '_paintW3CoaUnderReviewIndicator'],
    ['T55', '_handleW3CoaReviewClearClick'],
    ['T56', 'W3_EXPECTED_RESULT_FIXTURE_SOURCE'],
    ['T57', 'getWargame3ExpectedResultForReview'],
    ['T58', 'hasWargame3ExpectedResultForReview'],
    ['T59', 'buildWargame3ScenarioReviewSessionState'],
];
for (const [id, name] of regressionChecks) {
    test(id, name + ' in exports', () => {
        assert(wsSrc.includes(name + ':') || wsSrc.includes(name + ' :'),
            name + ' not found in exports');
    });
}

// ── T60-T66: file protection ──────────────────────────────────────────────────
console.log('\n── T60-T66: File protection ─────────────────────────────────────────');

test('T60', 'app.html not modified by PR-274', () => {
    assert(!appHtml.includes('buildWargame3ScenarioReviewSessionState'),
        'app.html contains PR-274 additions');
});
test('T61', 'i18n.js not modified by PR-274', () => {
    assert(!i18nSrc.includes('buildWargame3ScenarioReviewSessionState'),
        'i18n.js contains PR-274 additions');
});
test('T62', 'style.css not modified by PR-274', () => {
    assert(!cssSrc.includes('buildWargame3ScenarioReviewSessionState'),
        'style.css contains PR-274 additions');
});
test('T63', 'wargame3.json not modified by PR-274', () => {
    const w3 = readSrc('UI_MOdified/data/scenarios/wargame3.json');
    assert(!w3.includes('wargame3_review_session') &&
           !w3.includes('buildWargame3ScenarioReviewSessionState'),
        'wargame3.json contains PR-274 additions');
});
test('T64', 'app.js not modified by PR-274', () => {
    let appJs = ''; try { appJs = readSrc('UI_MOdified/client/app.js'); } catch (_) {}
    assert(!appJs.includes('buildWargame3ScenarioReviewSessionState'),
        'app.js contains PR-274 additions');
});
test('T65', 'adjudicator-map.js not modified by PR-274', () => {
    const adj = readSrc('UI_MOdified/client/wargame/adjudicator-map.js');
    assert(!adj.includes('buildWargame3ScenarioReviewSessionState'),
        'adjudicator-map.js contains PR-274 additions');
});
test('T66', 'no new UI added to app.html', () => {
    assert(!appHtml.includes('sw-drp-session') && !appHtml.includes('sessionType'),
        'app.html gained PR-274 UI elements');
});

// ── T67-T84: safety boundary ──────────────────────────────────────────────────
console.log('\n── T67-T84: Safety boundary ─────────────────────────────────────────');

function helperSrc() {
    return extractFn(wsSrc, 'buildWargame3ScenarioReviewSessionState') || '';
}

test('T67', 'no localStorage in builder', () => {
    assert(!helperSrc().includes('localStorage'), 'references localStorage');
});
test('T68', 'no sessionStorage in builder', () => {
    assert(!helperSrc().includes('sessionStorage'), 'references sessionStorage');
});
test('T69', 'no IndexedDB in builder', () => {
    const fn = helperSrc().toLowerCase();
    assert(!fn.includes('indexeddb'), 'references IndexedDB');
});
test('T70', 'no fetch in builder', () => {
    assert(!helperSrc().includes('fetch('), 'references fetch');
});
test('T71', 'no /api/sim/ in builder', () => {
    assert(!helperSrc().includes('/api/sim/'), 'references /api/sim/');
});
test('T72', 'no window.RmoozScenario in builder', () => {
    assert(!helperSrc().includes('window.RmoozScenario'), 'references window.RmoozScenario');
});
test('T73', 'no window.units in builder', () => {
    assert(!helperSrc().includes('window.units'), 'references window.units');
});
test('T74', 'no AI/journal in builder', () => {
    const fn = helperSrc();
    assert(!fn.includes('aiGenerated') && !fn.includes('aiProposal') &&
           !fn.includes('journal'), 'references AI/journal');
});
test('T75', 'no Gate 7 in builder', () => {
    const fn = helperSrc().toLowerCase();
    assert(!fn.includes('gate7') && !fn.includes('gate-7') && !fn.includes('gate 7'),
        'references Gate 7');
});
test('T76', 'no apply control in builder', () => {
    const fn = helperSrc();
    assert(!fn.includes('applyNow') && !fn.includes('.apply('),
        'references apply control');
});
test('T77', 'no execute control in builder', () => {
    assert(!helperSrc().includes('executeNow'), 'references executeNow');
});
test('T78', 'no commit control in builder', () => {
    assert(!helperSrc().includes('commitNow'), 'references commitNow');
});
test('T79', 'no confirm control in builder', () => {
    // "confirm" as a forbidden action — not window.confirm
    const fn = helperSrc();
    assert(!fn.includes('confirmAction') && !fn.includes('confirmApply'),
        'references a confirm action');
});
test('T80', 'no approve control in builder', () => {
    assert(!helperSrc().includes('approveAction') &&
           !helperSrc().includes('gate7Approved'),
        'references approve action');
});
test('T81', 'no Go Live in builder', () => {
    assert(!helperSrc().toLowerCase().includes('go live'), 'references Go Live');
});
test('T82', 'no Run control in builder', () => {
    const fn = helperSrc();
    assert(!fn.includes('runAction') && !fn.includes('runSimulation'),
        'references Run action');
});
test('T83', 'no stepIndex mutation in builder', () => {
    assert(!helperSrc().includes('stepIndex ='), 'mutates stepIndex');
});
test('T84', 'no document.getElementById in builder', () => {
    assert(!helperSrc().includes('document.getElementById'),
        'builder makes DOM calls');
});

// ── T85: no console.error ─────────────────────────────────────────────────────
console.log('\n── T85: No console.error ────────────────────────────────────────────');

test('T85', 'no console.error in builder source', () => {
    assert(!helperSrc().includes('console.error'), 'contains console.error');
});

// ── summary ───────────────────────────────────────────────────────────────────
console.log('\n────────────────────────────────────────────────────────────────────');
console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
if (failures.length) {
    console.error('\nFailed tests:');
    failures.forEach(f => console.error('  ' + f));
    process.exit(1);
} else {
    console.log('All tests passed.');
}
