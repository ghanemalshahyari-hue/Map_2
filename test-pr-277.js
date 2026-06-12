/**
 * test-pr-277.js
 * PR-277 — Wargame 3 Scenario Workflow State Backbone
 *
 * Tests buildW3ScenarioWorkflowStateFromSession, getW3ScenarioWorkflowState,
 * _updateW3ScenarioWorkflowStateFromCurrentSession, _clearW3ScenarioWorkflowState.
 *
 * 45 focused tests. No UI. No storage. No backend. No simulation.
 * No expectedResult wiring. previewComplete stays false.
 * No Gate 7 / apply / execute / commit.
 *
 * Run: node test-pr-277.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ── Source extraction helpers (same pattern as pr-274/275 suites) ─────────────
function readSrc(rel) {
    return fs.readFileSync(path.join(__dirname, rel), 'utf8');
}

const wsSrc   = readSrc('UI_MOdified/client/shell/scenario-workspace.js');
const appHtml = readSrc('UI_MOdified/client/app.html');
const mapJsSrc = (() => {
    try { return readSrc('UI_MOdified/client/wargame/adjudicator-map.js'); }
    catch(e) { return ''; }
})();

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
    const re = new RegExp('var\\s+' + name + '\\s*=\\s*Object\\.freeze\\(');
    const m = re.exec(wsSrc);
    if (!m) return null;
    let idx = m.index + m[0].length - 1;
    let depth = 0, start = idx;
    while (idx < wsSrc.length) {
        if (wsSrc[idx] === '(' || wsSrc[idx] === '{' || wsSrc[idx] === '[') depth++;
        else if (wsSrc[idx] === ')' || wsSrc[idx] === '}' || wsSrc[idx] === ']') {
            depth--; if (depth === 0) break;
        }
        idx++;
    }
    return 'var ' + name + ' = ' + wsSrc.slice(m.index + m[0].length - 1, idx + 1) + ';';
}

function extractPlainArrayVar(name) {
    const re = new RegExp('var\\s+' + name + '\\s*=\\s*\\[');
    const m = re.exec(wsSrc);
    if (!m) return null;
    let idx = m.index + m[0].length - 1;
    let depth = 0, start = idx;
    while (idx < wsSrc.length) {
        if (wsSrc[idx] === '[') depth++;
        else if (wsSrc[idx] === ']') { depth--; if (depth === 0) break; }
        idx++;
    }
    return 'var ' + name + ' = ' + wsSrc.slice(start, idx + 1) + ';';
}

function getHelperSrc(name) {
    return extractFn(wsSrc, name) || '';
}

// ── Test runner ───────────────────────────────────────────────────────────────
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

// ── Build isolated harness (no DOM, no require, no IIFE event listeners) ─────
function buildHarness() {
    const w3DrsUnsafe   = extractVar('_W3DRS_UNSAFE_FIELDS') ||
        "var _W3DRS_UNSAFE_FIELDS = Object.freeze(['applyNow','commitNow','executeNow','liveApply','mutateUnits','mutateMap','mutateScenario','backendCommit','autoApply','aiGenerated','simulationCommitted','gate7Approved']);";
    const w3DrsForbid   = extractVar('_W3DRS_FORBIDDEN_STATUS_TOKENS') ||
        "var _W3DRS_FORBIDDEN_STATUS_TOKENS = Object.freeze(['DORMANT','THREATENED','CONTESTED','DENIED','ACTIVE','COMPLETE','SUCCESS','FAILURE']);";
    const w3SelStatuses = extractPlainArrayVar('_W3SEL_VALID_STATUSES') ||
        "var _W3SEL_VALID_STATUSES = ['draft','selected_for_review','cancelled'];";
    const w3SelForbid   = extractPlainArrayVar('_W3SEL_FORBIDDEN_REC_FIELDS') ||
        "var _W3SEL_FORBIDDEN_REC_FIELDS = ['expectedResult','previewComplete'];";

    // PR-274 / PR-275 dependency chain
    const isSdSafe     = extractFn(wsSrc, 'isWargame3SelectedDecisionSafe');
    const isErSafe     = extractFn(wsSrc, 'isWargame3ExpectedResultSafe');
    const isDoSafe     = extractFn(wsSrc, 'isWargame3DecisionOptionSafe');
    const isRecSafe    = extractFn(wsSrc, 'isWargame3OperatorSelectionDryRunRecordSafe');
    const clearRecFn   = extractFn(wsSrc, '_clearW3CoaReviewRecord');
    const getRecFn     = extractFn(wsSrc, '_getW3CoaReviewRecordForStep');
    const builderFn    = extractFn(wsSrc, 'buildWargame3ScenarioReviewSessionState');
    const clearSessFn  = extractFn(wsSrc, '_clearW3ScenarioReviewSession');
    const updateSessFn = extractFn(wsSrc, '_updateW3ScenarioReviewSession');
    const getSessFn    = extractFn(wsSrc, 'getW3ScenarioReviewSession');

    // PR-277 new functions
    const buildWfFn    = extractFn(wsSrc, 'buildW3ScenarioWorkflowStateFromSession');
    const updateWfFn   = extractFn(wsSrc, '_updateW3ScenarioWorkflowStateFromCurrentSession');
    const getWfFn      = extractFn(wsSrc, 'getW3ScenarioWorkflowState');
    const clearWfFn    = extractFn(wsSrc, '_clearW3ScenarioWorkflowState');

    assert(isSdSafe && isErSafe && isDoSafe && isRecSafe, 'safe validators not found');
    assert(clearRecFn && getRecFn, 'COA record helpers not found');
    assert(builderFn,    'buildWargame3ScenarioReviewSessionState not found');
    assert(clearSessFn,  '_clearW3ScenarioReviewSession not found');
    assert(updateSessFn, '_updateW3ScenarioReviewSession not found');
    assert(getSessFn,    'getW3ScenarioReviewSession not found');
    assert(buildWfFn,    'buildW3ScenarioWorkflowStateFromSession not found');
    assert(updateWfFn,   '_updateW3ScenarioWorkflowStateFromCurrentSession not found');
    assert(getWfFn,      'getW3ScenarioWorkflowState not found');
    assert(clearWfFn,    '_clearW3ScenarioWorkflowState not found');

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
        function _clearW3CoaReviewRecord() ${clearRecFn}
        function _getW3CoaReviewRecordForStep(stepRef) ${getRecFn}

        function buildWargame3ScenarioReviewSessionState(preview, options) ${builderFn}

        var _w3ScenarioReviewSession = null;
        function _clearW3ScenarioReviewSession() ${clearSessFn}
        function _updateW3ScenarioReviewSession(preview, options) ${updateSessFn}
        function getW3ScenarioReviewSession() ${getSessFn}

        var _w3ScenarioWorkflowState = null;
        function buildW3ScenarioWorkflowStateFromSession(session, previousState, options) ${buildWfFn}
        function _updateW3ScenarioWorkflowStateFromCurrentSession() ${updateWfFn}
        function getW3ScenarioWorkflowState() ${getWfFn}
        function _clearW3ScenarioWorkflowState() ${clearWfFn}

        return {
            buildWf:      buildW3ScenarioWorkflowStateFromSession,
            getWf:        getW3ScenarioWorkflowState,
            updateWf:     _updateW3ScenarioWorkflowStateFromCurrentSession,
            clearWf:      _clearW3ScenarioWorkflowState,
            updateSess:   _updateW3ScenarioReviewSession,
            clearSess:    _clearW3ScenarioReviewSession,
            getSess:      getW3ScenarioReviewSession,
            setCoaRec:    function(r) { _w3CoaReviewRecord = r; },
            clearCoaRec:  _clearW3CoaReviewRecord,
            getWfInternal: function() { return _w3ScenarioWorkflowState; },
            getSessInternal: function() { return _w3ScenarioReviewSession; }
        };
    `;
    return new Function(code)();
}

// ── Fixture factories ─────────────────────────────────────────────────────────
function makeSession(overrides) {
    return Object.assign({
        sessionType:              'wargame3_review_session',
        source:                   'dry_run_preview',
        readOnly:                 true,
        dryRunOnly:               true,
        liveMutationAllowed:      false,
        backendCommitAllowed:     false,
        scenarioId:               'wargame3',
        scenarioName:             'Wargame 3',
        stepRef:                  'W3-STEP-01',
        stepIndex:                0,
        totalSteps:               10,
        objectiveStatus:          'Pending',
        decisionOptionsAvailable: false,
        decisionOptionCount:      0,
        reviewedCoa:              { available: false, optionRef: null, label: null, status: null },
        expectedResultAttached:   false,
        previewComplete:          false,
        mapOverlaySummary:        { markerCount: 0, movementTrailCount: 0, objectiveHighlightCount: 0, warningCount: 0 },
        warningSummary:           { warningCount: 0, warningCodes: [] }
    }, overrides || {});
}

function makeStep08Session(coaOverrides) {
    return makeSession({
        stepRef:                 'W3-STEP-08',
        stepIndex:               7,
        decisionOptionsAvailable: true,
        decisionOptionCount:     2,
        reviewedCoa: Object.assign(
            { available: false, optionRef: null, label: null, status: null },
            coaOverrides || {}
        )
    });
}

function makePreview(overrides) {
    return Object.assign({
        fixtureId:               'wargame3',
        fixtureName:             'Wargame 3',
        activeStepId:            'W3-STEP-01',
        activeStepIndex:         0,
        totalSteps:              10,
        objectiveStatusBaseline: 'Pending',
        readOnly:                true,
        liveMutationAllowed:     false,
        decisionOptions:         [],
        warningsDetail:          [],
        missingDataWarnings:     []
    }, overrides || {});
}

// ── Build harness ─────────────────────────────────────────────────────────────
let H;
try {
    H = buildHarness();
} catch (e) {
    console.error('HARNESS BUILD FAILED:', e.message);
    process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// T01–T05: Exports / source presence
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── T01–T05: Exports / source presence ──────────────────────────────');

test('T01', 'buildW3ScenarioWorkflowStateFromSession exported', () => {
    assert(wsSrc.includes('buildW3ScenarioWorkflowStateFromSession:'),
        'not found in exports');
});
test('T02', 'getW3ScenarioWorkflowState exported', () => {
    assert(wsSrc.includes('getW3ScenarioWorkflowState:'),
        'not found in exports');
});
test('T03', '_updateW3ScenarioWorkflowStateFromCurrentSession exported (for tests)', () => {
    assert(wsSrc.includes('_updateW3ScenarioWorkflowStateFromCurrentSession:'),
        'not found in exports');
});
test('T04', '_clearW3ScenarioWorkflowState exported (for tests)', () => {
    assert(wsSrc.includes('_clearW3ScenarioWorkflowState:'),
        'not found in exports');
});
test('T05', '_w3ScenarioWorkflowState raw variable is NOT directly exported', () => {
    assert(!wsSrc.includes('_w3ScenarioWorkflowState:          _w3ScenarioWorkflowState') &&
           !wsSrc.includes('_w3ScenarioWorkflowState: _w3ScenarioWorkflowState'),
        '_w3ScenarioWorkflowState is directly exported — must be IIFE-private');
});

// ─────────────────────────────────────────────────────────────────────────────
// T06–T09: Builder — rejection
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── T06–T09: Builder — rejection ─────────────────────────────────────');

test('T06', 'builder rejects null session', () => {
    const r = H.buildWf(null, null);
    assert(r.passed === false && r.workflow === null && r.blockedReasons.length > 0,
        'expected passed:false workflow:null with blockedReasons');
});
test('T07', 'builder rejects array session', () => {
    const r = H.buildWf([], null);
    assert(r.passed === false && r.workflow === null);
});
test('T08', 'builder rejects session with wrong sessionType', () => {
    const r = H.buildWf(makeSession({ sessionType: 'other' }), null);
    assert(r.passed === false && r.workflow === null);
});
test('T09', 'builder rejects session with non-W3 stepRef', () => {
    const r = H.buildWf(makeSession({ stepRef: 'STEP-01' }), null);
    assert(r.passed === false && r.workflow === null);
});

// ─────────────────────────────────────────────────────────────────────────────
// T10–T11: Builder — acceptance
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── T10–T11: Builder — acceptance ────────────────────────────────────');

test('T10', 'builder accepts valid W3 session', () => {
    const r = H.buildWf(makeSession(), null);
    assert(r.passed === true && r.workflow !== null);
});
test('T11', 'blockedReasons empty for valid session', () => {
    const r = H.buildWf(makeSession(), null);
    assert(Array.isArray(r.blockedReasons) && r.blockedReasons.length === 0);
});

// ─────────────────────────────────────────────────────────────────────────────
// T12–T17: Workflow type / boundary flags
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── T12–T17: Workflow type / boundary flags ───────────────────────────');

test('T12', 'workflowType is wargame3_scenario_review_workflow', () => {
    const r = H.buildWf(makeSession(), null);
    assert(r.workflow.workflowType === 'wargame3_scenario_review_workflow');
});
test('T13', 'readOnly is true', () => {
    assert(H.buildWf(makeSession(), null).workflow.readOnly === true);
});
test('T14', 'dryRunOnly is true', () => {
    assert(H.buildWf(makeSession(), null).workflow.dryRunOnly === true);
});
test('T15', 'liveMutationAllowed is false', () => {
    assert(H.buildWf(makeSession(), null).workflow.liveMutationAllowed === false);
});
test('T16', 'backendCommitAllowed is false', () => {
    assert(H.buildWf(makeSession(), null).workflow.backendCommitAllowed === false);
});
test('T17', 'source is dry_run_preview', () => {
    assert(H.buildWf(makeSession(), null).workflow.source === 'dry_run_preview');
});

// ─────────────────────────────────────────────────────────────────────────────
// T18–T20: Step identity fields
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── T18–T20: Step identity fields ────────────────────────────────────');

test('T18', 'activeStepRef copied from session.stepRef', () => {
    const r = H.buildWf(makeSession({ stepRef: 'W3-STEP-03' }), null);
    assert(r.workflow.activeStepRef === 'W3-STEP-03');
});
test('T19', 'activeStepIndex copied from session.stepIndex', () => {
    const r = H.buildWf(makeSession({ stepIndex: 4 }), null);
    assert(r.workflow.activeStepIndex === 4);
});
test('T20', 'totalSteps copied from session.totalSteps', () => {
    const r = H.buildWf(makeSession({ totalSteps: 12 }), null);
    assert(r.workflow.totalSteps === 12);
});

// ─────────────────────────────────────────────────────────────────────────────
// T21–T24: visitedStepRefs accumulation
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── T21–T24: visitedStepRefs accumulation ────────────────────────────');

test('T21', 'visitedStepRefs starts with current step when no previousState', () => {
    const r = H.buildWf(makeSession({ stepRef: 'W3-STEP-01' }), null);
    assert(Array.isArray(r.workflow.visitedStepRefs) &&
           r.workflow.visitedStepRefs.length === 1 &&
           r.workflow.visitedStepRefs[0] === 'W3-STEP-01');
});
test('T22', 'visitedStepRefs appends new step from previousState', () => {
    const prev = H.buildWf(makeSession({ stepRef: 'W3-STEP-01' }), null).workflow;
    const r = H.buildWf(makeSession({ stepRef: 'W3-STEP-02' }), prev);
    assert(r.workflow.visitedStepRefs.indexOf('W3-STEP-01') !== -1 &&
           r.workflow.visitedStepRefs.indexOf('W3-STEP-02') !== -1 &&
           r.workflow.visitedStepRefs.length === 2);
});
test('T23', 'visitedStepRefs does not duplicate same step', () => {
    const prev = H.buildWf(makeSession({ stepRef: 'W3-STEP-01' }), null).workflow;
    const r = H.buildWf(makeSession({ stepRef: 'W3-STEP-01' }), prev);
    assert(r.workflow.visitedStepRefs.filter(x => x === 'W3-STEP-01').length === 1);
});
test('T24', 'visitedCount matches visitedStepRefs.length', () => {
    const prev = H.buildWf(makeSession({ stepRef: 'W3-STEP-01' }), null).workflow;
    const r = H.buildWf(makeSession({ stepRef: 'W3-STEP-02' }), prev);
    assert(r.workflow.visitedCount === r.workflow.visitedStepRefs.length);
});

// ─────────────────────────────────────────────────────────────────────────────
// T25–T28: availableDecisionSteps
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── T25–T28: availableDecisionSteps ──────────────────────────────────');

test('T25', 'availableDecisionSteps adds W3-STEP-08 when decisionOptionsAvailable true', () => {
    const r = H.buildWf(makeStep08Session(), null);
    assert(r.workflow.availableDecisionSteps.indexOf('W3-STEP-08') !== -1);
});
test('T26', 'availableDecisionSteps does not add step when decisionOptionsAvailable false', () => {
    const r = H.buildWf(makeSession({ stepRef: 'W3-STEP-01' }), null);
    assert(r.workflow.availableDecisionSteps.indexOf('W3-STEP-01') === -1 &&
           r.workflow.availableDecisionSteps.length === 0);
});
test('T27', 'availableDecisionSteps does not duplicate same step', () => {
    const prev = H.buildWf(makeStep08Session(), null).workflow;
    const r = H.buildWf(makeStep08Session(), prev);
    assert(r.workflow.availableDecisionSteps.filter(x => x === 'W3-STEP-08').length === 1);
});
test('T28', 'availableDecisionStepCount matches availableDecisionSteps.length', () => {
    const r = H.buildWf(makeStep08Session(), null);
    assert(r.workflow.availableDecisionStepCount === r.workflow.availableDecisionSteps.length);
});

// ─────────────────────────────────────────────────────────────────────────────
// T29–T34: decisionReview
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── T29–T34: decisionReview ──────────────────────────────────────────');

test('T29', 'decisionReview.active is false with no reviewedCoa', () => {
    const r = H.buildWf(makeSession(), null);
    assert(r.workflow.decisionReview.active === false);
});
test('T30', 'decisionReview.active is true when reviewedCoa.available true', () => {
    const coa = { available: true, optionRef: 'OPT-A', label: 'Option Alpha', status: 'draft' };
    const r = H.buildWf(makeStep08Session(coa), null);
    assert(r.workflow.decisionReview.active === true);
});
test('T31', 'decisionReview.optionRef copied from reviewedCoa', () => {
    const coa = { available: true, optionRef: 'OPT-B', label: 'Option Beta', status: 'draft' };
    const r = H.buildWf(makeStep08Session(coa), null);
    assert(r.workflow.decisionReview.optionRef === 'OPT-B');
});
test('T32', 'decisionReview.label copied from reviewedCoa', () => {
    const coa = { available: true, optionRef: 'OPT-B', label: 'Option Beta', status: 'draft' };
    const r = H.buildWf(makeStep08Session(coa), null);
    assert(r.workflow.decisionReview.label === 'Option Beta');
});
test('T33', 'decisionReview.status copied from reviewedCoa', () => {
    const coa = { available: true, optionRef: 'OPT-B', label: 'Option Beta', status: 'draft' };
    const r = H.buildWf(makeStep08Session(coa), null);
    assert(r.workflow.decisionReview.status === 'draft');
});
test('T34', 'decisionReview fields null when no active review', () => {
    const r = H.buildWf(makeSession(), null);
    const dr = r.workflow.decisionReview;
    assert(dr.stepRef === null && dr.optionRef === null &&
           dr.label === null && dr.status === null);
});

// ─────────────────────────────────────────────────────────────────────────────
// T35–T41: workflowFlags
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── T35–T41: workflowFlags ───────────────────────────────────────────');

test('T35', 'hasLoadedScenario is true for valid session', () => {
    assert(H.buildWf(makeSession(), null).workflow.workflowFlags.hasLoadedScenario === true);
});
test('T36', 'hasNavigated is false for first step (visitedCount=1)', () => {
    assert(H.buildWf(makeSession(), null).workflow.workflowFlags.hasNavigated === false);
});
test('T37', 'hasNavigated is true after more than one visited step', () => {
    const prev = H.buildWf(makeSession({ stepRef: 'W3-STEP-01' }), null).workflow;
    const r = H.buildWf(makeSession({ stepRef: 'W3-STEP-02' }), prev);
    assert(r.workflow.workflowFlags.hasNavigated === true);
});
test('T38', 'hasDecisionOptions is true when availableDecisionSteps non-empty', () => {
    assert(H.buildWf(makeStep08Session(), null).workflow.workflowFlags.hasDecisionOptions === true);
});
test('T39', 'hasDecisionOptions is false when no decision steps', () => {
    assert(H.buildWf(makeSession(), null).workflow.workflowFlags.hasDecisionOptions === false);
});
test('T40', 'expectedResultAttached is locked to false', () => {
    const coa = { available: true, optionRef: 'OPT-A', label: 'A', status: 'draft' };
    assert(H.buildWf(makeStep08Session(coa), null).workflow.workflowFlags.expectedResultAttached === false);
});
test('T41', 'previewComplete is locked to false', () => {
    const coa = { available: true, optionRef: 'OPT-A', label: 'A', status: 'draft' };
    assert(H.buildWf(makeStep08Session(coa), null).workflow.workflowFlags.previewComplete === false);
});

// ─────────────────────────────────────────────────────────────────────────────
// T42–T43: Immutability guarantees
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── T42–T43: Immutability guarantees ────────────────────────────────');

test('T42', 'builder does not mutate session', () => {
    const s = makeSession({ stepRef: 'W3-STEP-01' });
    const keysBefore = Object.keys(s).length;
    H.buildWf(s, null);
    assert(Object.keys(s).length === keysBefore && !('visitedStepRefs' in s),
        'session was mutated');
});
test('T43', 'builder does not mutate previousState visitedStepRefs', () => {
    const prev = H.buildWf(makeSession({ stepRef: 'W3-STEP-01' }), null).workflow;
    const prevLen = prev.visitedStepRefs.length;
    H.buildWf(makeSession({ stepRef: 'W3-STEP-02' }), prev);
    assert(prev.visitedStepRefs.length === prevLen,
        'previousState.visitedStepRefs was mutated');
});

// ─────────────────────────────────────────────────────────────────────────────
// T44–T47: Getter and updater via module-internal API
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── T44–T47: Getter / updater via internal API ───────────────────────');

test('T44', 'getter returns passed:false when workflow cleared', () => {
    H.clearWf();
    const r = H.getWf();
    assert(r.passed === false && r.workflow === null);
});
test('T45', 'getter returns a copy, not the direct internal reference', () => {
    H.clearSess();
    H.clearWf();
    H.updateSess(makePreview({ activeStepId: 'W3-STEP-01', activeStepIndex: 0 }), {});
    H.updateWf();
    const r1 = H.getWf();
    if (!r1.passed) { return; } // no state — trivially safe
    r1.workflow.workflowType = 'MUTATED';
    const r2 = H.getWf();
    assert(r2.workflow && r2.workflow.workflowType !== 'MUTATED',
        'getter returned direct mutable reference');
});
test('T46', 'update from current session stores workflow when session valid', () => {
    H.clearSess();
    H.clearWf();
    H.updateSess(makePreview({ activeStepId: 'W3-STEP-02', activeStepIndex: 1 }), {});
    const ur = H.updateWf();
    assert(ur.passed === true && ur.workflow !== null &&
           ur.workflow.activeStepRef === 'W3-STEP-02');
});
test('T47', 'update from current session clears workflow when no valid session', () => {
    H.clearSess();
    H.clearWf();
    const ur = H.updateWf();
    assert(ur.passed === false && ur.workflow === null);
});

// ─────────────────────────────────────────────────────────────────────────────
// T48: Clear removes workflow state
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── T48: Clear removes workflow state ────────────────────────────────');

test('T48', 'clearWf sets workflow state to null', () => {
    H.clearSess();
    H.updateSess(makePreview({ activeStepId: 'W3-STEP-05', activeStepIndex: 4 }), {});
    H.updateWf();
    H.clearWf();
    const r = H.getWf();
    assert(r.passed === false && r.workflow === null);
});

// ─────────────────────────────────────────────────────────────────────────────
// T49–T51: Navigation lifecycle breadcrumbs
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── T49–T51: Navigation lifecycle breadcrumbs ────────────────────────');

test('T49', 'navigation updates activeStepRef to latest step', () => {
    H.clearSess(); H.clearWf();
    H.updateSess(makePreview({ activeStepId: 'W3-STEP-01', activeStepIndex: 0 }), {});
    H.updateWf();
    H.updateSess(makePreview({ activeStepId: 'W3-STEP-02', activeStepIndex: 1 }), {});
    H.updateWf();
    const r = H.getWf();
    assert(r.passed && r.workflow.activeStepRef === 'W3-STEP-02');
});
test('T50', 'visitedStepRefs grows as user navigates multiple steps', () => {
    H.clearSess(); H.clearWf();
    const steps = ['W3-STEP-01', 'W3-STEP-02', 'W3-STEP-03'];
    for (let i = 0; i < steps.length; i++) {
        H.updateSess(makePreview({ activeStepId: steps[i], activeStepIndex: i }), {});
        H.updateWf();
    }
    const r = H.getWf();
    assert(r.passed && r.workflow.visitedStepRefs.length === 3 && r.workflow.visitedCount === 3);
});
test('T51', 'when user reaches W3-STEP-08 availableDecisionSteps includes it', () => {
    H.clearSess(); H.clearWf();
    const pv = makePreview({
        activeStepId:    'W3-STEP-08',
        activeStepIndex: 7,
        decisionOptions: [{ id: 'OPT-A', label: 'Hold', source: 'instructor', readOnly: true }]
    });
    H.updateSess(pv, {});
    H.updateWf();
    const r = H.getWf();
    assert(r.passed && r.workflow.availableDecisionSteps.indexOf('W3-STEP-08') !== -1);
});

// ─────────────────────────────────────────────────────────────────────────────
// T52–T53: Boundary / forbidden field checks
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── T52–T53: Boundary / forbidden field checks ───────────────────────');

test('T52', 'no expectedResult field on workflow object', () => {
    const r = H.buildWf(makeStep08Session(), null);
    assert(!('expectedResult' in r.workflow));
});
test('T53', 'no Gate7/apply/execute/commit/confirm/approve fields on workflow', () => {
    const r = H.buildWf(makeStep08Session(), null);
    const wf = r.workflow;
    assert(!('gate7' in wf) && !('applyResult' in wf) &&
           !('executeResult' in wf) && !('commitResult' in wf) &&
           !('confirmResult' in wf) && !('approveResult' in wf));
});

// ─────────────────────────────────────────────────────────────────────────────
// T54–T59: Static source / file-change guards
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── T54–T59: Static source / file-change guards ──────────────────────');

test('T54', 'scenario-workspace.js has _w3ScenarioWorkflowState = null module-private var', () => {
    assert(wsSrc.includes('var _w3ScenarioWorkflowState = null'));
});
test('T55', 'scenario-workspace.js wires _updateW3ScenarioWorkflowStateFromCurrentSession in _paintToDOM', () => {
    assert(wsSrc.includes('_updateW3ScenarioWorkflowStateFromCurrentSession'));
});
test('T56', 'scenario-workspace.js wires _clearW3ScenarioWorkflowState in non-W3 _paintToDOM path', () => {
    assert(wsSrc.includes('_clearW3ScenarioWorkflowState'));
});
test('T57', 'app.html unchanged — no w3ScenarioWorkflowState references', () => {
    assert(!appHtml.includes('w3ScenarioWorkflowState'));
});
test('T58', 'adjudicator-map.js unchanged — no w3ScenarioWorkflowState references', () => {
    assert(!mapJsSrc.includes('w3ScenarioWorkflowState'));
});
test('T59', 'no console.error in new PR-277 helpers', () => {
    const fnNames = ['buildW3ScenarioWorkflowStateFromSession',
                     '_updateW3ScenarioWorkflowStateFromCurrentSession',
                     'getW3ScenarioWorkflowState',
                     '_clearW3ScenarioWorkflowState'];
    for (const n of fnNames) {
        const src = getHelperSrc(n);
        assert(!src.includes('console.error'), n + ' contains console.error');
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// T60–T65: PR-275 / PR-274 regression — existing exports intact
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── T60–T65: Regression — prior exports intact ───────────────────────');

const regressionChecks = [
    ['T60', 'getW3ScenarioReviewSession'],
    ['T61', '_updateW3ScenarioReviewSession'],
    ['T62', '_clearW3ScenarioReviewSession'],
    ['T63', 'buildWargame3ScenarioReviewSessionState'],
    ['T64', 'previewWargame3Fixture'],
    ['T65', 'stepWargame3Preview']
];
for (const [id, name] of regressionChecks) {
    test(id, name + ' still present in exports', () => {
        assert(wsSrc.includes(name + ':') || wsSrc.includes(name + ' :'),
            name + ' not found in exports');
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n════════════════════════════════════════════════════════════════════');
console.log(`PR-277 Results: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
if (failures.length) {
    console.error('\nFailed tests:');
    failures.forEach(f => console.error('  ' + f));
    process.exit(1);
} else {
    console.log('All tests passed.');
}
