/**
 * test-pr-278.js
 * PR-278 — Wargame 3 Full Scenario Workflow Walkthrough Runner
 *
 * Tests runWargame3ScenarioWorkflowWalkthrough:
 *   T01–T05   Export / source presence
 *   T06–T09   Builder — rejection cases
 *   T10–T17   Walkthrough type / boundary flags
 *   T18–T24   Step coverage (totalSteps, visitedStepRefs, completedWalkthrough)
 *   T25–T28   availableDecisionSteps (W3-STEP-08 detected)
 *   T29–T35   Review / clear cycle (reviewedCoaTest)
 *   T36–T40   Safety invariants (no expectedResult, previewComplete, selectedDecision)
 *   T41–T47   Options — maxSteps / startStepRef / stopStepRef / updateLiveState
 *   T48–T53   Immutability (no mutation of fixture / decisionOptions)
 *   T54–T60   Boundary / forbidden wiring checks
 *   T61–T65   Static source / file-change guards
 *   T66–T68   Regression — prior exports intact
 *
 * ~68 focused tests.  No DOM.  No Leaflet.  No storage.  No backend.
 *
 * Run: node test-pr-278.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ── Source extraction helpers ─────────────────────────────────────────────────
function readSrc(rel) {
    return fs.readFileSync(path.join(__dirname, rel), 'utf8');
}

const wsSrc   = readSrc('UI_MOdified/client/shell/scenario-workspace.js');
const appHtml = readSrc('UI_MOdified/client/app.html');
const mapJsSrc = (() => {
    try { return readSrc('UI_MOdified/client/wargame/adjudicator-map.js'); } catch(e) { return ''; }
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
    let idx = m.index + m[0].length - 1, depth = 0;
    while (idx < wsSrc.length) {
        if ('([{'.includes(wsSrc[idx])) depth++;
        else if (')]}'.includes(wsSrc[idx])) { depth--; if (depth === 0) break; }
        idx++;
    }
    return 'var ' + name + ' = ' + wsSrc.slice(m.index + m[0].length - 1, idx + 1) + ';';
}

function extractPlainArrayVar(name) {
    const re = new RegExp('var\\s+' + name + '\\s*=\\s*\\[');
    const m = re.exec(wsSrc);
    if (!m) return null;
    let idx = m.index + m[0].length - 1, depth = 0;
    while (idx < wsSrc.length) {
        if (wsSrc[idx] === '[') depth++;
        else if (wsSrc[idx] === ']') { depth--; if (depth === 0) break; }
        idx++;
    }
    return 'var ' + name + ' = ' + wsSrc.slice(m.index + m[0].length - 1, idx + 1) + ';';
}

function getHelperSrc(name) { return extractFn(wsSrc, name) || ''; }

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

// ── Harness ───────────────────────────────────────────────────────────────────
function buildHarness() {
    // ── constants ─────────────────────────────────────────────────────────────
    const w3DrsUnsafe   = extractVar('_W3DRS_UNSAFE_FIELDS') ||
        "var _W3DRS_UNSAFE_FIELDS = Object.freeze(['applyNow','commitNow','executeNow','liveApply','mutateUnits','mutateMap','mutateScenario','backendCommit','autoApply','aiGenerated','simulationCommitted','gate7Approved']);";
    const w3DrsForbid   = extractVar('_W3DRS_FORBIDDEN_STATUS_TOKENS') ||
        "var _W3DRS_FORBIDDEN_STATUS_TOKENS = Object.freeze(['DORMANT','THREATENED','CONTESTED','DENIED','ACTIVE','COMPLETE','SUCCESS','FAILURE']);";
    const w3SelStatuses = extractPlainArrayVar('_W3SEL_VALID_STATUSES') ||
        "var _W3SEL_VALID_STATUSES = ['draft','selected_for_review','cancelled'];";
    const w3SelForbid   = extractPlainArrayVar('_W3SEL_FORBIDDEN_REC_FIELDS') ||
        "var _W3SEL_FORBIDDEN_REC_FIELDS = ['expectedResult','previewComplete'];";
    const bsspTrue      = extractVar('_BSSP_SAFETY_TRUE') ||
        "var _BSSP_SAFETY_TRUE = Object.freeze(['dryRunOnly','previewOnly']);";
    const bsspFalse     = extractVar('_BSSP_SAFETY_FALSE') ||
        "var _BSSP_SAFETY_FALSE = Object.freeze(['liveMutationAllowed','backendCommitAllowed','mapMutationAllowed','unitMutationAllowed','scenarioMutationAllowed']);";

    // ── validators ────────────────────────────────────────────────────────────
    const isSdSafe   = extractFn(wsSrc, 'isWargame3SelectedDecisionSafe');
    const isErSafe   = extractFn(wsSrc, 'isWargame3ExpectedResultSafe');
    const isDoSafe   = extractFn(wsSrc, 'isWargame3DecisionOptionSafe');
    const isRecSafe  = extractFn(wsSrc, 'isWargame3OperatorSelectionDryRunRecordSafe');

    // ── COA record helpers ────────────────────────────────────────────────────
    const clearRecFn = extractFn(wsSrc, '_clearW3CoaReviewRecord');
    const getRecFn   = extractFn(wsSrc, '_getW3CoaReviewRecordForStep');

    // ── session builder ───────────────────────────────────────────────────────
    const builderFn    = extractFn(wsSrc, 'buildWargame3ScenarioReviewSessionState');
    const clearSessFn  = extractFn(wsSrc, '_clearW3ScenarioReviewSession');
    const updateSessFn = extractFn(wsSrc, '_updateW3ScenarioReviewSession');
    const getSessFn    = extractFn(wsSrc, 'getW3ScenarioReviewSession');

    // ── PR-277 workflow builder ───────────────────────────────────────────────
    const buildWfFn   = extractFn(wsSrc, 'buildW3ScenarioWorkflowStateFromSession');
    const clearWfFn   = extractFn(wsSrc, '_clearW3ScenarioWorkflowState');
    const updateWfFn  = extractFn(wsSrc, '_updateW3ScenarioWorkflowStateFromCurrentSession');
    const getWfFn     = extractFn(wsSrc, 'getW3ScenarioWorkflowState');

    // ── decision options + dry-run record builders ────────────────────────────
    const doPreviewFn = extractFn(wsSrc, 'buildWargame3DecisionOptionsPreviewData');
    const recBuilderFn = extractFn(wsSrc, 'buildWargame3OperatorSelectionDryRunRecord');

    // ── step preview builder ──────────────────────────────────────────────────
    const bsspFn = extractFn(wsSrc, 'buildScenarioStepPreview');

    // ── overlay ────────────────────────────────────────────────────────────────
    const overlayVar = extractVar('W3_DECISION_OPTIONS_FIXTURE_OVERLAY');
    const overlayFn  = extractFn(wsSrc, 'applyWargame3DecisionOptionsFixtureOverlay');

    // ── PR-278 runner ─────────────────────────────────────────────────────────
    const runnerFn = extractFn(wsSrc, 'runWargame3ScenarioWorkflowWalkthrough');

    // ── assertions ────────────────────────────────────────────────────────────
    assert(isSdSafe && isErSafe && isDoSafe && isRecSafe, 'validators not found');
    assert(clearRecFn && getRecFn,    'COA record helpers not found');
    assert(builderFn,                 'buildWargame3ScenarioReviewSessionState not found');
    assert(clearSessFn && updateSessFn && getSessFn, 'session sync helpers not found');
    assert(buildWfFn && clearWfFn && updateWfFn && getWfFn, 'PR-277 workflow helpers not found');
    assert(doPreviewFn,               'buildWargame3DecisionOptionsPreviewData not found');
    assert(recBuilderFn,              'buildWargame3OperatorSelectionDryRunRecord not found');
    assert(bsspFn,                    'buildScenarioStepPreview not found');
    assert(overlayVar && overlayFn,   'overlay constant/function not found');
    assert(runnerFn,                  'runWargame3ScenarioWorkflowWalkthrough not found');

    const code = `
        ${w3DrsUnsafe}
        ${w3DrsForbid}
        ${w3SelStatuses}
        ${w3SelForbid}
        ${bsspTrue}
        ${bsspFalse}
        ${overlayVar}

        function isWargame3SelectedDecisionSafe(value, options)          ${isSdSafe}
        function isWargame3ExpectedResultSafe(value, options)            ${isErSafe}
        function isWargame3DecisionOptionSafe(value, options)            ${isDoSafe}
        function isWargame3OperatorSelectionDryRunRecordSafe(record, options) ${isRecSafe}

        var _w3CoaReviewRecord = null;
        function _clearW3CoaReviewRecord()                               ${clearRecFn}
        function _getW3CoaReviewRecordForStep(stepRef)                   ${getRecFn}

        function buildWargame3ScenarioReviewSessionState(preview, options) ${builderFn}

        var _w3ScenarioReviewSession = null;
        function _clearW3ScenarioReviewSession()                         ${clearSessFn}
        function _updateW3ScenarioReviewSession(preview, options)        ${updateSessFn}
        function getW3ScenarioReviewSession()                            ${getSessFn}

        var _w3ScenarioWorkflowState = null;
        function buildW3ScenarioWorkflowStateFromSession(session, previousState, options) ${buildWfFn}
        function _clearW3ScenarioWorkflowState()                         ${clearWfFn}
        function _updateW3ScenarioWorkflowStateFromCurrentSession()      ${updateWfFn}
        function getW3ScenarioWorkflowState()                            ${getWfFn}

        function buildWargame3DecisionOptionsPreviewData(step, options)  ${doPreviewFn}
        function buildWargame3OperatorSelectionDryRunRecord(step, optionId, options) ${recBuilderFn}

        function buildScenarioStepPreview(fixture, stepRef, options)     ${bsspFn}

        function applyWargame3DecisionOptionsFixtureOverlay(fixture, overlayMap) ${overlayFn}

        // Stub for adaptWargame3ToFixture — not exercised in unit tests
        // (tests always pass pre-adapted fixtures with readOnly:true)
        function adaptWargame3ToFixture(w3json, options) {
            return { passed: false, fixture: null,
                     blockedReasons: ['adaptWargame3ToFixture stub — not available in test harness'],
                     warnings: [] };
        }

        function runWargame3ScenarioWorkflowWalkthrough(previewSource, options) ${runnerFn}

        return {
            run:        runWargame3ScenarioWorkflowWalkthrough,
            buildSess:  buildWargame3ScenarioReviewSessionState,
            buildWf:    buildW3ScenarioWorkflowStateFromSession,
            buildBssp:  buildScenarioStepPreview,
            isDoSafe:   isWargame3DecisionOptionSafe,
            isRecSafe:  isWargame3OperatorSelectionDryRunRecordSafe,
            overlay:    W3_DECISION_OPTIONS_FIXTURE_OVERLAY
        };
    `;
    return new Function(code)();
}

// ── Fixture factories ─────────────────────────────────────────────────────────

/** Build the safety block required by buildScenarioStepPreview */
function makeSafety() {
    return {
        dryRunOnly:              true,
        previewOnly:             true,
        liveMutationAllowed:     false,
        backendCommitAllowed:    false,
        mapMutationAllowed:      false,
        unitMutationAllowed:     false,
        scenarioMutationAllowed: false
    };
}

/** Zero-padded W3 step ref: w3Ref(8) → 'W3-STEP-08' */
function w3Ref(n) { return 'W3-STEP-' + (n < 10 ? '0' + n : String(n)); }

/** Build a minimal adapted step */
function makeStep(index, extraFields) {
    return Object.assign({
        step_id:                 w3Ref(index),
        stepIndex:               index,
        title:                   'Step ' + index,
        situation:               'Situation for step ' + index,
        selectedDecision:        null,
        expectedResult:          null,
        friendlyActions:         [],
        enemyCounterActions:     [{ uid: 'U1', counterAction: 'hold' }],
        unitsReferenced:         [],
        objectivesReferenced:    [],
        objectiveStatusBaseline: 'Pending',
        visualEffects:           [],
        missingDataExpected:     ['selectedDecision', 'expectedResult'],
        _stepUnitLocations:      {},
        safety:                  makeSafety(),
        readOnly:                true
    }, extraFields || {});
}

/** Build step 08 with decisionOptions from the overlay */
function makeStep08WithOptions(overlayOptions) {
    return makeStep(8, { decisionOptions: overlayOptions });
}

/** Build a minimal adapted fixture with N steps (00..N-1) */
function makeFixture(stepCount, step08Options) {
    const steps = [];
    for (let i = 0; i < stepCount; i++) {
        if (i === 8 && step08Options) {
            steps.push(makeStep08WithOptions(step08Options));
        } else {
            steps.push(makeStep(i));
        }
    }
    return {
        fixtureId:           'wargame3-fixture-v1',
        fixtureName:         'Wargame 3',
        readOnly:            true,
        liveMutationAllowed: false,
        units:               [],
        objectives:          [],
        steps:               steps
    };
}

/** 17-step fixture with decision options on step 08 */
function make17StepFixture(overlayOptions) {
    return makeFixture(17, overlayOptions || [
        { id: 'W3-STEP-08-OPT-HOLD',      label: 'Hold Current Position',
          description: 'Hold.', intent: 'Preserve.', source: 'instructor', readOnly: true },
        { id: 'W3-STEP-08-OPT-REINFORCE', label: 'Reinforce the gap',
          description: 'Reinforce.', intent: 'Exploit.', source: 'instructor', readOnly: true }
    ]);
}

// ── Build harness ─────────────────────────────────────────────────────────────
let H;
try {
    H = buildHarness();
} catch(e) {
    console.error('HARNESS BUILD FAILED:', e.message);
    process.exit(1);
}

// ═════════════════════════════════════════════════════════════════════════════
// T01–T05: Export / source presence
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── T01–T05: Export / source presence ───────────────────────────────');

test('T01', 'runWargame3ScenarioWorkflowWalkthrough exported', () => {
    assert(wsSrc.includes('runWargame3ScenarioWorkflowWalkthrough:'),
        'not found in exports block');
});
test('T02', 'runner function declared in source', () => {
    assert(wsSrc.includes('function runWargame3ScenarioWorkflowWalkthrough('),
        'function declaration not found');
});
test('T03', 'runner is a function in harness', () => {
    assert(typeof H.run === 'function');
});
test('T04', 'runner does not expose raw internal state variable', () => {
    assert(!wsSrc.includes('walkthroughState: _w3ScenarioWalkthroughState'),
        'internal variable leaked into exports');
});
test('T05', 'runner source contains walkthroughType string', () => {
    assert(wsSrc.includes("'wargame3_scenario_workflow_walkthrough'"));
});

// ═════════════════════════════════════════════════════════════════════════════
// T06–T09: Rejection cases
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── T06–T09: Rejection cases ─────────────────────────────────────────');

test('T06', 'runner rejects null previewSource', () => {
    const r = H.run(null);
    assert(r.passed === false && r.walkthrough === null && r.blockedReasons.length > 0);
});
test('T07', 'runner rejects array previewSource', () => {
    const r = H.run([]);
    assert(r.passed === false && r.walkthrough === null);
});
test('T08', 'runner rejects object with no steps array', () => {
    const r = H.run({ readOnly: true });
    assert(r.passed === false && r.walkthrough === null);
});
test('T09', 'runner rejects fixture with no W3-STEP-* steps', () => {
    const badFixture = {
        readOnly: true, liveMutationAllowed: false,
        units: [], objectives: [],
        steps: [{ step_id: 'AMBER-01', stepIndex: 0, safety: makeSafety(), readOnly: true }]
    };
    const r = H.run(badFixture);
    assert(r.passed === false && r.walkthrough === null,
        'expected rejection for non-W3 steps');
});

// ═════════════════════════════════════════════════════════════════════════════
// T10–T17: Walkthrough type / boundary flags
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── T10–T17: Walkthrough type / boundary flags ───────────────────────');

test('T10', 'walkthroughType is wargame3_scenario_workflow_walkthrough', () => {
    const r = H.run(make17StepFixture());
    assert(r.passed && r.walkthrough.walkthroughType === 'wargame3_scenario_workflow_walkthrough');
});
test('T11', 'source is dry_run_preview', () => {
    const r = H.run(make17StepFixture());
    assert(r.passed && r.walkthrough.source === 'dry_run_preview');
});
test('T12', 'readOnly is true', () => {
    assert(H.run(make17StepFixture()).walkthrough.readOnly === true);
});
test('T13', 'dryRunOnly is true', () => {
    assert(H.run(make17StepFixture()).walkthrough.dryRunOnly === true);
});
test('T14', 'liveMutationAllowed is false', () => {
    assert(H.run(make17StepFixture()).walkthrough.liveMutationAllowed === false);
});
test('T15', 'backendCommitAllowed is false', () => {
    assert(H.run(make17StepFixture()).walkthrough.backendCommitAllowed === false);
});
test('T16', 'safetyFlags.expectedResultAttached is false', () => {
    assert(H.run(make17StepFixture()).walkthrough.safetyFlags.expectedResultAttached === false);
});
test('T17', 'safetyFlags.previewComplete is false', () => {
    assert(H.run(make17StepFixture()).walkthrough.safetyFlags.previewComplete === false);
});

// ═════════════════════════════════════════════════════════════════════════════
// T18–T24: Step coverage
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── T18–T24: Step coverage ───────────────────────────────────────────');

test('T18', 'totalSteps is 17 for 17-step W3 fixture', () => {
    const r = H.run(make17StepFixture());
    assert(r.passed && r.walkthrough.totalSteps === 17,
        'totalSteps=' + (r.walkthrough && r.walkthrough.totalSteps));
});
test('T19', 'visitedStepRefs includes W3-STEP-00', () => {
    const r = H.run(make17StepFixture());
    assert(r.passed && r.walkthrough.visitedStepRefs.indexOf('W3-STEP-00') !== -1);
});
test('T20', 'visitedStepRefs includes W3-STEP-08', () => {
    const r = H.run(make17StepFixture());
    assert(r.passed && r.walkthrough.visitedStepRefs.indexOf('W3-STEP-08') !== -1);
});
test('T21', 'visitedStepRefs includes W3-STEP-16', () => {
    const r = H.run(make17StepFixture());
    assert(r.passed && r.walkthrough.visitedStepRefs.indexOf('W3-STEP-16') !== -1);
});
test('T22', 'visitedCount equals visitedStepRefs.length', () => {
    const r = H.run(make17StepFixture());
    assert(r.passed && r.walkthrough.visitedCount === r.walkthrough.visitedStepRefs.length);
});
test('T23', 'completedWalkthrough is true when all 17 steps visited', () => {
    const r = H.run(make17StepFixture());
    assert(r.passed && r.walkthrough.completedWalkthrough === true,
        'completedWalkthrough=' + (r.walkthrough && r.walkthrough.completedWalkthrough));
});
test('T24', 'finalStepRef is W3-STEP-16 after full walkthrough', () => {
    const r = H.run(make17StepFixture());
    assert(r.passed && r.walkthrough.finalStepRef === 'W3-STEP-16',
        'finalStepRef=' + (r.walkthrough && r.walkthrough.finalStepRef));
});

// ═════════════════════════════════════════════════════════════════════════════
// T25–T28: availableDecisionSteps
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── T25–T28: availableDecisionSteps ──────────────────────────────────');

test('T25', 'availableDecisionSteps includes W3-STEP-08 (has valid decisionOptions)', () => {
    const r = H.run(make17StepFixture());
    assert(r.passed && r.walkthrough.availableDecisionSteps.indexOf('W3-STEP-08') !== -1,
        'W3-STEP-08 not found in availableDecisionSteps');
});
test('T26', 'availableDecisionStepCount is 1 for standard 17-step fixture', () => {
    const r = H.run(make17StepFixture());
    assert(r.passed && r.walkthrough.availableDecisionStepCount === 1,
        'count=' + (r.walkthrough && r.walkthrough.availableDecisionStepCount));
});
test('T27', 'availableDecisionSteps is empty when no step has decisionOptions', () => {
    const r = H.run(makeFixture(5)); // no step08Options
    assert(r.passed && r.walkthrough.availableDecisionSteps.length === 0);
});
test('T28', 'availableDecisionStepCount matches availableDecisionSteps.length', () => {
    const r = H.run(make17StepFixture());
    assert(r.passed &&
           r.walkthrough.availableDecisionStepCount === r.walkthrough.availableDecisionSteps.length);
});

// ═════════════════════════════════════════════════════════════════════════════
// T29–T35: Review / clear cycle
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── T29–T35: Review / clear cycle ────────────────────────────────────');

test('T29', 'reviewFirstAvailable true: reviewedCoaTest.attempted is true', () => {
    const r = H.run(make17StepFixture(), { reviewFirstAvailable: true });
    assert(r.passed && r.walkthrough.reviewedCoaTest.attempted === true,
        'attempted=' + (r.walkthrough && r.walkthrough.reviewedCoaTest.attempted));
});
test('T30', 'reviewedCoaTest.stepRef is W3-STEP-08', () => {
    const r = H.run(make17StepFixture(), { reviewFirstAvailable: true });
    assert(r.passed && r.walkthrough.reviewedCoaTest.stepRef === 'W3-STEP-08');
});
test('T31', 'reviewedCoaTest.optionRef is first safe option id', () => {
    const r = H.run(make17StepFixture(), { reviewFirstAvailable: true });
    assert(r.passed && typeof r.walkthrough.reviewedCoaTest.optionRef === 'string' &&
           r.walkthrough.reviewedCoaTest.optionRef.length > 0);
});
test('T32', 'reviewedCoaTest.recordSafe is true', () => {
    const r = H.run(make17StepFixture(), { reviewFirstAvailable: true });
    assert(r.passed && r.walkthrough.reviewedCoaTest.recordSafe === true,
        'recordSafe=' + (r.walkthrough && r.walkthrough.reviewedCoaTest.recordSafe));
});
test('T33', 'reviewedCoaTest.cleared is true after clear cycle', () => {
    const r = H.run(make17StepFixture(), { reviewFirstAvailable: true });
    assert(r.passed && r.walkthrough.reviewedCoaTest.cleared === true,
        'cleared=' + (r.walkthrough && r.walkthrough.reviewedCoaTest.cleared));
});
test('T34', 'reviewFirstAvailable false: reviewedCoaTest.attempted is false', () => {
    const r = H.run(make17StepFixture(), { reviewFirstAvailable: false });
    assert(r.passed && r.walkthrough.reviewedCoaTest.attempted === false);
});
test('T35', 'reviewedCoaTest.attempted is false when no decision steps exist', () => {
    const r = H.run(makeFixture(5)); // no decisionOptions on any step
    assert(r.passed && r.walkthrough.reviewedCoaTest.attempted === false);
});

// ═════════════════════════════════════════════════════════════════════════════
// T36–T40: Safety invariants
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── T36–T40: Safety invariants ───────────────────────────────────────');

test('T36', 'no expectedResult field on walkthrough object', () => {
    const r = H.run(make17StepFixture());
    assert(r.passed && !('expectedResult' in r.walkthrough));
});
test('T37', 'safetyFlags.expectedResultAttached locked to false (even after review)', () => {
    const r = H.run(make17StepFixture(), { reviewFirstAvailable: true });
    assert(r.passed && r.walkthrough.safetyFlags.expectedResultAttached === false);
});
test('T38', 'safetyFlags.previewComplete locked to false', () => {
    const r = H.run(make17StepFixture(), { reviewFirstAvailable: true });
    assert(r.passed && r.walkthrough.safetyFlags.previewComplete === false);
});
test('T39', 'reviewPreview does not get a selectedDecision field at preview level', () => {
    // Verify the runner source: the review preview object is built WITHOUT selectedDecision
    const runnerSrc = getHelperSrc('runWargame3ScenarioWorkflowWalkthrough');
    // selectedDecision must not appear as a direct key in reviewPreview assignment
    assert(!runnerSrc.includes('reviewPreview.selectedDecision =') &&
           !runnerSrc.includes("'selectedDecision':"),
        'runner assigns selectedDecision to reviewPreview directly');
});
test('T40', 'runner does not call getWargame3ExpectedResultForReview', () => {
    const runnerSrc = getHelperSrc('runWargame3ScenarioWorkflowWalkthrough');
    assert(!runnerSrc.includes('getWargame3ExpectedResultForReview'),
        'runner calls getWargame3ExpectedResultForReview — forbidden');
});

// ═════════════════════════════════════════════════════════════════════════════
// T41–T47: Options — maxSteps / startStepRef / stopStepRef / updateLiveState
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── T41–T47: Options ─────────────────────────────────────────────────');

test('T41', 'maxSteps limits visited steps', () => {
    const r = H.run(make17StepFixture(), { maxSteps: 3 });
    assert(r.passed && r.walkthrough.visitedCount === 3,
        'visitedCount=' + (r.walkthrough && r.walkthrough.visitedCount));
});
test('T42', 'maxSteps: completedWalkthrough false when not all steps visited', () => {
    const r = H.run(make17StepFixture(), { maxSteps: 3 });
    assert(r.passed && r.walkthrough.completedWalkthrough === false);
});
test('T43', 'startStepRef skips earlier steps', () => {
    const r = H.run(make17StepFixture(), { startStepRef: 'W3-STEP-05' });
    assert(r.passed && r.walkthrough.visitedStepRefs.indexOf('W3-STEP-00') === -1 &&
           r.walkthrough.visitedStepRefs.indexOf('W3-STEP-05') !== -1,
        'startStepRef not respected');
});
test('T44', 'stopStepRef stops walkthrough at given step (inclusive)', () => {
    const r = H.run(make17StepFixture(), { stopStepRef: 'W3-STEP-03' });
    assert(r.passed && r.walkthrough.visitedStepRefs.indexOf('W3-STEP-03') !== -1 &&
           r.walkthrough.visitedStepRefs.indexOf('W3-STEP-04') === -1,
        'stopStepRef not respected');
});
test('T45', 'updateLiveState defaults to false (runner is pure by default)', () => {
    const runnerSrc = getHelperSrc('runWargame3ScenarioWorkflowWalkthrough');
    assert(runnerSrc.includes('updateLiveState === true'),
        'updateLiveState guard not found');
    assert(runnerSrc.includes('opts.updateLiveState === true'),
        'updateLiveState default false not found');
});
test('T46', 'runner passes with updateLiveState explicitly false', () => {
    const r = H.run(make17StepFixture(), { updateLiveState: false });
    assert(r.passed);
});
test('T47', 'startStepRef + stopStepRef together: visits only that range', () => {
    const r = H.run(make17StepFixture(),
                    { startStepRef: 'W3-STEP-04', stopStepRef: 'W3-STEP-06' });
    assert(r.passed &&
           r.walkthrough.visitedCount === 3 &&
           r.walkthrough.visitedStepRefs.indexOf('W3-STEP-04') !== -1 &&
           r.walkthrough.visitedStepRefs.indexOf('W3-STEP-06') !== -1 &&
           r.walkthrough.visitedStepRefs.indexOf('W3-STEP-03') === -1 &&
           r.walkthrough.visitedStepRefs.indexOf('W3-STEP-07') === -1,
        'range not correct: ' + JSON.stringify(r.walkthrough && r.walkthrough.visitedStepRefs));
});

// ═════════════════════════════════════════════════════════════════════════════
// T48–T53: Immutability
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── T48–T53: Immutability ────────────────────────────────────────────');

test('T48', 'runner does not mutate the previewSource fixture', () => {
    const fixture = make17StepFixture();
    const stepsBefore = fixture.steps.length;
    const step0IdBefore = fixture.steps[0].step_id;
    H.run(fixture);
    assert(fixture.steps.length === stepsBefore &&
           fixture.steps[0].step_id === step0IdBefore,
        'fixture was mutated');
});
test('T49', 'runner does not add visitedStepRefs to fixture steps', () => {
    const fixture = make17StepFixture();
    H.run(fixture);
    assert(!('visitedStepRefs' in fixture) && !('visitedStepRefs' in fixture.steps[0]),
        'visitedStepRefs leaked into fixture');
});
test('T50', 'runner does not mutate decisionOptions array on step 08', () => {
    const opts = [
        { id: 'W3-STEP-08-OPT-HOLD', label: 'Hold', description: 'H', intent: 'I',
          source: 'instructor', readOnly: true }
    ];
    const fixture = make17StepFixture(opts);
    const step08 = fixture.steps[8];
    const lenBefore = step08.decisionOptions.length;
    H.run(fixture, { reviewFirstAvailable: true });
    assert(step08.decisionOptions.length === lenBefore,
        'decisionOptions array was mutated');
});
test('T51', 'no selectedDecision at top-level preview during review test', () => {
    // The review preview built inside the runner must not have selectedDecision as
    // a direct top-level field (it belongs only inside operatorSelectionDryRunRecord)
    const runnerSrc = getHelperSrc('runWargame3ScenarioWorkflowWalkthrough');
    assert(!runnerSrc.match(/reviewPreview\s*=\s*\{[^}]*selectedDecision\s*:/s),
        'reviewPreview contains selectedDecision key directly');
});
test('T52', 'runner does not add operatorSelectionDryRunRecord to the step', () => {
    const fixture = make17StepFixture();
    H.run(fixture, { reviewFirstAvailable: true });
    assert(!('operatorSelectionDryRunRecord' in fixture.steps[8]),
        'operatorSelectionDryRunRecord leaked into fixture step');
});
test('T53', 'walkthrough result is a new object (not fixture reference)', () => {
    const fixture = make17StepFixture();
    const r = H.run(fixture);
    assert(r.walkthrough !== fixture &&
           r.walkthrough !== fixture.steps,
        'walkthrough is a reference to fixture or its steps');
});

// ═════════════════════════════════════════════════════════════════════════════
// T54–T60: Boundary / forbidden wiring
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── T54–T60: Boundary / forbidden wiring ─────────────────────────────');

test('T54', 'no Gate7/apply/execute/commit/confirm/approve fields in walkthrough', () => {
    const r = H.run(make17StepFixture());
    const wt = r.walkthrough;
    assert(!('gate7' in wt) && !('applyResult' in wt) &&
           !('executeResult' in wt) && !('commitResult' in wt) &&
           !('confirmResult' in wt) && !('approveResult' in wt));
});
test('T55', 'runner source contains no localStorage/sessionStorage/fetch references', () => {
    const src = getHelperSrc('runWargame3ScenarioWorkflowWalkthrough');
    assert(!src.includes('localStorage') && !src.includes('sessionStorage') &&
           !src.includes('fetch(') && !src.includes('XMLHttpRequest'),
        'runner contains storage/network calls');
});
test('T56', 'runner source contains no document.getElementById calls', () => {
    const src = getHelperSrc('runWargame3ScenarioWorkflowWalkthrough');
    assert(!src.includes('document.getElementById'),
        'runner calls document.getElementById — DOM forbidden');
});
test('T57', 'runner source contains no Leaflet/fitBounds/addLayer calls', () => {
    const src = getHelperSrc('runWargame3ScenarioWorkflowWalkthrough');
    assert(!src.includes('fitBounds') && !src.includes('addLayer') &&
           !src.includes('L.layerGroup'),
        'runner contains Leaflet calls');
});
test('T58', 'runner source does not call paintDryRunPreview', () => {
    const src = getHelperSrc('runWargame3ScenarioWorkflowWalkthrough');
    assert(!src.includes('paintDryRunPreview('),
        'runner calls paintDryRunPreview — DOM forbidden');
});
test('T59', 'runner source does not call paintWargame3Preview', () => {
    const src = getHelperSrc('runWargame3ScenarioWorkflowWalkthrough');
    assert(!src.includes('paintWargame3Preview('),
        'runner calls paintWargame3Preview — DOM/state mutation forbidden');
});
test('T60', 'no console.error in runner source', () => {
    assert(!getHelperSrc('runWargame3ScenarioWorkflowWalkthrough').includes('console.error'),
        'runner contains console.error');
});

// ═════════════════════════════════════════════════════════════════════════════
// T61–T65: Static source / file-change guards
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── T61–T65: Static source / file-change guards ──────────────────────');

test('T61', 'app.html unchanged — no walkthrough references', () => {
    assert(!appHtml.includes('walkthroughWalkthrough') &&
           !appHtml.includes('runWargame3ScenarioWorkflowWalkthrough'));
});
test('T62', 'adjudicator-map.js unchanged — no walkthrough references', () => {
    assert(!mapJsSrc.includes('runWargame3ScenarioWorkflowWalkthrough'));
});
test('T63', 'runner source contains no window.units reference', () => {
    assert(!getHelperSrc('runWargame3ScenarioWorkflowWalkthrough').includes('window.units'));
});
test('T64', 'runner source contains no window.RmoozScenario reference', () => {
    assert(!getHelperSrc('runWargame3ScenarioWorkflowWalkthrough').includes('window.RmoozScenario'));
});
test('T65', 'runner source: expectedResultAttached locked to false', () => {
    const src = getHelperSrc('runWargame3ScenarioWorkflowWalkthrough');
    assert(src.includes('expectedResultAttached: false'),
        'expectedResultAttached: false not found in runner');
});

// ═════════════════════════════════════════════════════════════════════════════
// T66–T68: Regression — prior exports intact
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── T66–T68: Regression — prior exports intact ───────────────────────');

[
    ['T66', 'buildW3ScenarioWorkflowStateFromSession'],
    ['T67', 'getW3ScenarioWorkflowState'],
    ['T68', 'buildWargame3ScenarioReviewSessionState']
].forEach(([id, name]) => {
    test(id, name + ' still in exports', () => {
        assert(wsSrc.includes(name + ':') || wsSrc.includes(name + ' :'),
            name + ' missing from exports');
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// Summary
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n════════════════════════════════════════════════════════════════════');
console.log(`PR-278 Results: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
if (failures.length) {
    console.error('\nFailed tests:');
    failures.forEach(f => console.error('  ' + f));
    process.exit(1);
} else {
    console.log('All tests passed.');
}
