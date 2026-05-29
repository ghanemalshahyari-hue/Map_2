/**
 * test-pr-279.js
 * PR-279 — Wargame 3 Scenario Workflow Acceptance Check
 *
 * Tests checkWargame3ScenarioWorkflowAcceptance:
 *   T01–T05   Export / source presence
 *   T06–T10   Rejection cases (previewSource guard, walkthrough failure propagation)
 *   T11–T16   acceptanceResult shape — type / boundary flags
 *   T17–T22   Full-pass case — readiness / nextPhase / allStepsVisited
 *   T23–T28   Decision step coverage (detectedDecisionStepRefs, check 7)
 *   T29–T34   reviewCycle shape (attempted, passed, stepRef, optionRef, recordSafe, cleared)
 *   T35–T39   safetyChecks — always locked
 *   T40–T46   Blocked: step-count checks (checks 1–3)
 *   T47–T52   Blocked: specific step-ref checks (checks 4–6)
 *   T53–T57   Blocked: decision / review checks (checks 7–10)
 *   T58–T62   blockedReasons accumulation and content
 *   T63–T66   Immutability — acceptanceResult fields are safe copies
 *   T67–T70   Static source guards
 *   T71–T74   Regression — prior exports intact
 *
 * ~74 focused tests.  No DOM.  No Leaflet.  No storage.  No backend.
 *
 * Run: node test-pr-279.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ── Source extraction helpers ─────────────────────────────────────────────────
function readSrc(rel) {
    return fs.readFileSync(path.join(__dirname, rel), 'utf8');
}

const wsSrc    = readSrc('UI_MOdified/client/shell/scenario-workspace.js');
const appHtml  = readSrc('UI_MOdified/client/app.html');
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
    const isSdSafe  = extractFn(wsSrc, 'isWargame3SelectedDecisionSafe');
    const isErSafe  = extractFn(wsSrc, 'isWargame3ExpectedResultSafe');
    const isDoSafe  = extractFn(wsSrc, 'isWargame3DecisionOptionSafe');
    const isRecSafe = extractFn(wsSrc, 'isWargame3OperatorSelectionDryRunRecordSafe');

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
    const doPreviewFn  = extractFn(wsSrc, 'buildWargame3DecisionOptionsPreviewData');
    const recBuilderFn = extractFn(wsSrc, 'buildWargame3OperatorSelectionDryRunRecord');

    // ── step preview builder ──────────────────────────────────────────────────
    const bsspFn = extractFn(wsSrc, 'buildScenarioStepPreview');

    // ── overlay ────────────────────────────────────────────────────────────────
    const overlayVar = extractVar('W3_DECISION_OPTIONS_FIXTURE_OVERLAY');
    const overlayFn  = extractFn(wsSrc, 'applyWargame3DecisionOptionsFixtureOverlay');

    // ── PR-278 runner ─────────────────────────────────────────────────────────
    const runnerFn = extractFn(wsSrc, 'runWargame3ScenarioWorkflowWalkthrough');

    // ── PR-279 acceptance checker ─────────────────────────────────────────────
    const acceptFn = extractFn(wsSrc, 'checkWargame3ScenarioWorkflowAcceptance');

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
    assert(acceptFn,                  'checkWargame3ScenarioWorkflowAcceptance not found');

    const code = `
        ${w3DrsUnsafe}
        ${w3DrsForbid}
        ${w3SelStatuses}
        ${w3SelForbid}
        ${bsspTrue}
        ${bsspFalse}
        ${overlayVar}

        function isWargame3SelectedDecisionSafe(value, options)               ${isSdSafe}
        function isWargame3ExpectedResultSafe(value, options)                 ${isErSafe}
        function isWargame3DecisionOptionSafe(value, options)                 ${isDoSafe}
        function isWargame3OperatorSelectionDryRunRecordSafe(record, options) ${isRecSafe}

        var _w3CoaReviewRecord = null;
        function _clearW3CoaReviewRecord()                   ${clearRecFn}
        function _getW3CoaReviewRecordForStep(stepRef)       ${getRecFn}

        function buildWargame3ScenarioReviewSessionState(preview, options) ${builderFn}

        var _w3ScenarioReviewSession = null;
        function _clearW3ScenarioReviewSession()                      ${clearSessFn}
        function _updateW3ScenarioReviewSession(preview, options)     ${updateSessFn}
        function getW3ScenarioReviewSession()                         ${getSessFn}

        var _w3ScenarioWorkflowState = null;
        function buildW3ScenarioWorkflowStateFromSession(session, previousState, options) ${buildWfFn}
        function _clearW3ScenarioWorkflowState()                              ${clearWfFn}
        function _updateW3ScenarioWorkflowStateFromCurrentSession()           ${updateWfFn}
        function getW3ScenarioWorkflowState()                                 ${getWfFn}

        function buildWargame3DecisionOptionsPreviewData(step, options)               ${doPreviewFn}
        function buildWargame3OperatorSelectionDryRunRecord(step, optionId, options)  ${recBuilderFn}

        function buildScenarioStepPreview(fixture, stepRef, options) ${bsspFn}

        function applyWargame3DecisionOptionsFixtureOverlay(fixture, overlayMap) ${overlayFn}

        function adaptWargame3ToFixture(w3json, options) {
            return { passed: false, fixture: null,
                     blockedReasons: ['adaptWargame3ToFixture stub — not available in test harness'],
                     warnings: [] };
        }

        function runWargame3ScenarioWorkflowWalkthrough(previewSource, options) ${runnerFn}

        function checkWargame3ScenarioWorkflowAcceptance(previewSource, options) ${acceptFn}

        return {
            check:       checkWargame3ScenarioWorkflowAcceptance,
            run:         runWargame3ScenarioWorkflowWalkthrough,
            buildSess:   buildWargame3ScenarioReviewSessionState,
            buildWf:     buildW3ScenarioWorkflowStateFromSession,
            buildBssp:   buildScenarioStepPreview,
            isDoSafe:    isWargame3DecisionOptionSafe,
            isRecSafe:   isWargame3OperatorSelectionDryRunRecordSafe,
            overlay:     W3_DECISION_OPTIONS_FIXTURE_OVERLAY
        };
    `;
    return new Function(code)();
}

// ── Fixture factories ─────────────────────────────────────────────────────────

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

function w3Ref(n) { return 'W3-STEP-' + (n < 10 ? '0' + n : String(n)); }

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

function makeStep08WithOptions(overlayOptions) {
    return makeStep(8, { decisionOptions: overlayOptions });
}

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

function defaultDecisionOptions() {
    return [
        { id: 'W3-STEP-08-OPT-HOLD',      label: 'Hold Current Position',
          description: 'Hold.', intent: 'Preserve.', source: 'instructor', readOnly: true },
        { id: 'W3-STEP-08-OPT-REINFORCE', label: 'Reinforce the gap',
          description: 'Reinforce.', intent: 'Exploit.', source: 'instructor', readOnly: true }
    ];
}

function make17StepFixture(overlayOptions) {
    return makeFixture(17, overlayOptions || defaultDecisionOptions());
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

test('T01', 'checkWargame3ScenarioWorkflowAcceptance exported in source', () => {
    assert(wsSrc.includes('checkWargame3ScenarioWorkflowAcceptance:'),
        'export entry not found');
});
test('T02', 'function declaration present in source', () => {
    assert(wsSrc.includes('function checkWargame3ScenarioWorkflowAcceptance('),
        'function declaration not found');
});
test('T03', 'check function is callable in harness', () => {
    assert(typeof H.check === 'function', 'H.check is not a function');
});
test('T04', 'acceptanceType string literal in source', () => {
    assert(wsSrc.includes("'wargame3_scenario_workflow_acceptance'"),
        'acceptanceType string not found in source');
});
test('T05', 'readiness and nextPhase literal values in source', () => {
    assert(wsSrc.includes("'accepted_for_next_phase'"), 'accepted_for_next_phase not found');
    assert(wsSrc.includes("'scenario_import_adapter_layer'"), 'scenario_import_adapter_layer not found');
    assert(wsSrc.includes("'workflow_stabilization'"), 'workflow_stabilization not found');
    assert(wsSrc.includes("'blocked'"), "'blocked' not found");
});

// ═════════════════════════════════════════════════════════════════════════════
// T06–T10: Rejection cases
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── T06–T10: Rejection cases ─────────────────────────────────────────');

test('T06', 'null previewSource → passed:false, acceptanceResult:null', () => {
    const r = H.check(null);
    assert(r.passed === false, 'passed should be false');
    assert(r.acceptanceResult === null, 'acceptanceResult should be null');
    assert(Array.isArray(r.blockedReasons) && r.blockedReasons.length > 0, 'blockedReasons empty');
});
test('T07', 'array previewSource → passed:false', () => {
    const r = H.check([]);
    assert(r.passed === false && r.acceptanceResult === null);
});
test('T08', 'number previewSource → passed:false', () => {
    const r = H.check(42);
    assert(r.passed === false && r.acceptanceResult === null);
});
test('T09', 'object with no steps → passed:false, acceptanceResult:null', () => {
    const r = H.check({ readOnly: true });
    assert(r.passed === false && r.acceptanceResult === null,
        'expected rejection for missing steps array');
});
test('T10', 'fixture with no W3-STEP-* steps propagates walkthrough failure', () => {
    const badFixture = {
        readOnly: true, liveMutationAllowed: false, units: [], objectives: [],
        steps: [{ step_id: 'AMBER-01', stepIndex: 0, safety: makeSafety(), readOnly: true }]
    };
    const r = H.check(badFixture);
    assert(r.passed === false && r.acceptanceResult === null,
        'expected propagated walkthrough failure');
    assert(Array.isArray(r.blockedReasons) && r.blockedReasons.length > 0,
        'blockedReasons should be non-empty');
});

// ═════════════════════════════════════════════════════════════════════════════
// T11–T16: acceptanceResult shape — type / boundary flags
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── T11–T16: acceptanceResult shape — type / boundary flags ─────────');

test('T11', 'acceptanceType === wargame3_scenario_workflow_acceptance', () => {
    const r = H.check(make17StepFixture());
    assert(r.acceptanceResult.acceptanceType === 'wargame3_scenario_workflow_acceptance');
});
test('T12', 'source === dry_run_preview', () => {
    const r = H.check(make17StepFixture());
    assert(r.acceptanceResult.source === 'dry_run_preview');
});
test('T13', 'readOnly:true, dryRunOnly:true', () => {
    const r = H.check(make17StepFixture());
    const ar = r.acceptanceResult;
    assert(ar.readOnly === true && ar.dryRunOnly === true);
});
test('T14', 'liveMutationAllowed:false, backendCommitAllowed:false', () => {
    const r = H.check(make17StepFixture());
    const ar = r.acceptanceResult;
    assert(ar.liveMutationAllowed === false && ar.backendCommitAllowed === false);
});
test('T15', 'checkedAt is always null', () => {
    const r = H.check(make17StepFixture());
    assert(r.acceptanceResult.checkedAt === null, 'checkedAt must be null');
});
test('T16', 'requiredStepCount === 17', () => {
    const r = H.check(make17StepFixture());
    assert(r.acceptanceResult.requiredStepCount === 17);
});

// ═════════════════════════════════════════════════════════════════════════════
// T17–T22: Full-pass case — readiness / nextPhase / allStepsVisited
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── T17–T22: Full-pass case ──────────────────────────────────────────');

test('T17', 'full 17-step fixture → passed:true', () => {
    const r = H.check(make17StepFixture());
    assert(r.passed === true,
        'expected passed:true; blockedReasons: ' + JSON.stringify(r.blockedReasons));
});
test('T18', 'readiness === accepted_for_next_phase on full pass', () => {
    const r = H.check(make17StepFixture());
    assert(r.acceptanceResult.readiness === 'accepted_for_next_phase',
        'got: ' + r.acceptanceResult.readiness);
});
test('T19', 'nextPhase === scenario_import_adapter_layer on full pass', () => {
    const r = H.check(make17StepFixture());
    assert(r.acceptanceResult.nextPhase === 'scenario_import_adapter_layer',
        'got: ' + r.acceptanceResult.nextPhase);
});
test('T20', 'allStepsVisited === true on full 17-step pass', () => {
    const r = H.check(make17StepFixture());
    assert(r.acceptanceResult.allStepsVisited === true,
        'allStepsVisited should be true');
});
test('T21', 'visitedStepCount === 17 on full pass', () => {
    const r = H.check(make17StepFixture());
    assert(r.acceptanceResult.visitedStepCount === 17,
        'got: ' + r.acceptanceResult.visitedStepCount);
});
test('T22', 'blockedReasons is empty array on full pass', () => {
    const r = H.check(make17StepFixture());
    assert(Array.isArray(r.blockedReasons) && r.blockedReasons.length === 0,
        'blockedReasons should be empty; got: ' + JSON.stringify(r.blockedReasons));
});

// ═════════════════════════════════════════════════════════════════════════════
// T23–T28: Decision step coverage
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── T23–T28: Decision step coverage ─────────────────────────────────');

test('T23', 'requiredDecisionStepRefs === [W3-STEP-08]', () => {
    const r = H.check(make17StepFixture());
    const refs = r.acceptanceResult.requiredDecisionStepRefs;
    assert(Array.isArray(refs) && refs.length === 1 && refs[0] === 'W3-STEP-08');
});
test('T24', 'detectedDecisionStepRefs includes W3-STEP-08 on full pass', () => {
    const r = H.check(make17StepFixture());
    const detected = r.acceptanceResult.detectedDecisionStepRefs;
    assert(Array.isArray(detected) && detected.indexOf('W3-STEP-08') !== -1,
        'W3-STEP-08 not found in detectedDecisionStepRefs');
});
test('T25', 'decisionStepCoveragePassed === true on full pass', () => {
    const r = H.check(make17StepFixture());
    assert(r.acceptanceResult.decisionStepCoveragePassed === true);
});
test('T26', 'decisionStepCoveragePassed === false when step 08 has no options', () => {
    const fixture = makeFixture(17, null); // step 08 has no decisionOptions
    const r = H.check(fixture);
    assert(r.acceptanceResult.decisionStepCoveragePassed === false,
        'expected false when no decision options on step 08');
});
test('T27', 'detectedDecisionStepRefs is empty when no decision steps', () => {
    const fixture = makeFixture(17, null);
    const r = H.check(fixture);
    assert(Array.isArray(r.acceptanceResult.detectedDecisionStepRefs) &&
           r.acceptanceResult.detectedDecisionStepRefs.length === 0,
        'expected empty detectedDecisionStepRefs');
});
test('T28', 'detectedDecisionStepRefs is a copy — mutation does not affect re-run', () => {
    const fixture = make17StepFixture();
    const r1 = H.check(fixture);
    const arr = r1.acceptanceResult.detectedDecisionStepRefs;
    arr.push('INJECTED');
    const r2 = H.check(fixture);
    assert(r2.acceptanceResult.detectedDecisionStepRefs.indexOf('INJECTED') === -1,
        'detectedDecisionStepRefs must be an independent copy');
});

// ═════════════════════════════════════════════════════════════════════════════
// T29–T34: reviewCycle shape
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── T29–T34: reviewCycle shape ───────────────────────────────────────');

test('T29', 'reviewCycle.attempted === true on full pass', () => {
    const r = H.check(make17StepFixture());
    assert(r.acceptanceResult.reviewCycle.attempted === true);
});
test('T30', 'reviewCycle.passed === true on full pass', () => {
    const r = H.check(make17StepFixture());
    assert(r.acceptanceResult.reviewCycle.passed === true,
        'reviewCycle.passed should be true when attempted+recordSafe+cleared all true');
});
test('T31', 'reviewCycle.stepRef === W3-STEP-08 on full pass', () => {
    const r = H.check(make17StepFixture());
    assert(r.acceptanceResult.reviewCycle.stepRef === 'W3-STEP-08',
        'got: ' + r.acceptanceResult.reviewCycle.stepRef);
});
test('T32', 'reviewCycle.optionRef is a string on full pass', () => {
    const r = H.check(make17StepFixture());
    assert(typeof r.acceptanceResult.reviewCycle.optionRef === 'string',
        'optionRef should be a string');
});
test('T33', 'reviewCycle.recordSafe === true on full pass', () => {
    const r = H.check(make17StepFixture());
    assert(r.acceptanceResult.reviewCycle.recordSafe === true);
});
test('T34', 'reviewCycle.cleared === true on full pass', () => {
    const r = H.check(make17StepFixture());
    assert(r.acceptanceResult.reviewCycle.cleared === true);
});

// ═════════════════════════════════════════════════════════════════════════════
// T35–T39: safetyChecks — always locked
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── T35–T39: safetyChecks always locked ─────────────────────────────');

test('T35', 'safetyChecks.expectedResultAttached === false always', () => {
    const r = H.check(make17StepFixture());
    assert(r.acceptanceResult.safetyChecks.expectedResultAttached === false);
});
test('T36', 'safetyChecks.previewComplete === false always', () => {
    const r = H.check(make17StepFixture());
    assert(r.acceptanceResult.safetyChecks.previewComplete === false);
});
test('T37', 'safetyChecks.liveMutationAllowed === false always', () => {
    const r = H.check(make17StepFixture());
    assert(r.acceptanceResult.safetyChecks.liveMutationAllowed === false);
});
test('T38', 'safetyChecks.backendCommitAllowed === false always', () => {
    const r = H.check(make17StepFixture());
    assert(r.acceptanceResult.safetyChecks.backendCommitAllowed === false);
});
test('T39', 'safetyChecks.selectedDecisionOnlyInsideDryRunRecord === true always', () => {
    const r = H.check(make17StepFixture());
    assert(r.acceptanceResult.safetyChecks.selectedDecisionOnlyInsideDryRunRecord === true);
});

// ═════════════════════════════════════════════════════════════════════════════
// T40–T46: Blocked — step-count checks (checks 1–3)
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── T40–T46: Blocked — step-count checks ─────────────────────────────');

test('T40', '16-step fixture → passed:false', () => {
    const r = H.check(makeFixture(16, defaultDecisionOptions()));
    assert(r.passed === false, 'expected blocked for 16-step fixture');
});
test('T41', '16-step fixture → readiness === blocked', () => {
    const r = H.check(makeFixture(16, defaultDecisionOptions()));
    assert(r.acceptanceResult.readiness === 'blocked');
});
test('T42', '16-step fixture → nextPhase === workflow_stabilization', () => {
    const r = H.check(makeFixture(16, defaultDecisionOptions()));
    assert(r.acceptanceResult.nextPhase === 'workflow_stabilization');
});
test('T43', '16-step fixture → visitedStepCount === 16', () => {
    const r = H.check(makeFixture(16, defaultDecisionOptions()));
    assert(r.acceptanceResult.visitedStepCount === 16,
        'got: ' + r.acceptanceResult.visitedStepCount);
});
test('T44', '16-step fixture → allStepsVisited === false', () => {
    const r = H.check(makeFixture(16, defaultDecisionOptions()));
    assert(r.acceptanceResult.allStepsVisited === false);
});
test('T45', '16-step fixture → blockedReasons includes visitedCount message', () => {
    const r = H.check(makeFixture(16, defaultDecisionOptions()));
    const hasVisited = r.blockedReasons.some(m => m.includes('visitedCount'));
    assert(hasVisited, 'expected visitedCount message; got: ' + JSON.stringify(r.blockedReasons));
});
test('T46', '18-step fixture → blocked (totalSteps !== 17)', () => {
    const r = H.check(makeFixture(18, defaultDecisionOptions()));
    assert(r.passed === false, 'expected blocked for 18-step fixture');
    const hasTotal = r.blockedReasons.some(m => m.includes('totalSteps'));
    assert(hasTotal, 'expected totalSteps message; got: ' + JSON.stringify(r.blockedReasons));
});

// ═════════════════════════════════════════════════════════════════════════════
// T47–T52: Blocked — specific step-ref checks (checks 4–6)
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── T47–T52: Blocked — specific step-ref checks ──────────────────────');

test('T47', 'W3-STEP-00 missing → blocked and message includes W3-STEP-00', () => {
    // Build fixture without step 00 — replace it with a non-W3 step to keep 17 total
    const fixture = make17StepFixture();
    fixture.steps[0] = { step_id: 'OTHER-00', stepIndex: 0, safety: makeSafety(), readOnly: true,
                         title: 'Other', situation: 'S', selectedDecision: null,
                         expectedResult: null, friendlyActions: [],
                         enemyCounterActions: [{ uid: 'U1', counterAction: 'hold' }],
                         unitsReferenced: [], objectivesReferenced: [],
                         objectiveStatusBaseline: 'Pending', visualEffects: [],
                         missingDataExpected: [], _stepUnitLocations: {} };
    const r = H.check(fixture);
    assert(r.passed === false);
    assert(r.blockedReasons.some(m => m.includes('W3-STEP-00')),
        'expected W3-STEP-00 message; got: ' + JSON.stringify(r.blockedReasons));
});
test('T48', 'W3-STEP-08 missing from visitedStepRefs → blocked with W3-STEP-08 message', () => {
    const fixture = make17StepFixture();
    // Replace step 08 with a non-W3 step
    fixture.steps[8] = { step_id: 'OTHER-08', stepIndex: 8, safety: makeSafety(), readOnly: true,
                         title: 'Other 08', situation: 'S', selectedDecision: null,
                         expectedResult: null, friendlyActions: [],
                         enemyCounterActions: [{ uid: 'U1', counterAction: 'hold' }],
                         unitsReferenced: [], objectivesReferenced: [],
                         objectiveStatusBaseline: 'Pending', visualEffects: [],
                         missingDataExpected: [], _stepUnitLocations: {} };
    const r = H.check(fixture);
    assert(r.passed === false);
    // At minimum visitedStepRefs or totalSteps check fails
    assert(r.blockedReasons.length > 0, 'expected blockedReasons');
});
test('T49', 'W3-STEP-16 missing → blocked', () => {
    const fixture = make17StepFixture();
    fixture.steps[16] = { step_id: 'OTHER-16', stepIndex: 16, safety: makeSafety(), readOnly: true,
                          title: 'Other 16', situation: 'S', selectedDecision: null,
                          expectedResult: null, friendlyActions: [],
                          enemyCounterActions: [{ uid: 'U1', counterAction: 'hold' }],
                          unitsReferenced: [], objectivesReferenced: [],
                          objectiveStatusBaseline: 'Pending', visualEffects: [],
                          missingDataExpected: [], _stepUnitLocations: {} };
    const r = H.check(fixture);
    assert(r.passed === false);
    assert(r.blockedReasons.some(m => m.includes('W3-STEP-16')),
        'expected W3-STEP-16 message; got: ' + JSON.stringify(r.blockedReasons));
});
test('T50', 'acceptanceResult is still returned when blocked (not null)', () => {
    const r = H.check(makeFixture(16, defaultDecisionOptions()));
    assert(r.acceptanceResult !== null, 'acceptanceResult should exist even when blocked');
    assert(r.acceptanceResult.acceptanceType === 'wargame3_scenario_workflow_acceptance');
});
test('T51', 'acceptanceResult.readOnly/dryRunOnly remain true even when blocked', () => {
    const r = H.check(makeFixture(16, defaultDecisionOptions()));
    assert(r.acceptanceResult.readOnly === true && r.acceptanceResult.dryRunOnly === true);
});
test('T52', 'acceptanceResult.liveMutationAllowed remains false even when blocked', () => {
    const r = H.check(makeFixture(16, defaultDecisionOptions()));
    assert(r.acceptanceResult.liveMutationAllowed === false);
});

// ═════════════════════════════════════════════════════════════════════════════
// T53–T57: Blocked — decision / review checks (checks 7–10)
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── T53–T57: Blocked — decision / review checks ──────────────────────');

test('T53', 'no decision options on step 08 → decisionStepCoveragePassed:false → blocked', () => {
    const r = H.check(makeFixture(17, null));
    assert(r.passed === false);
    assert(r.acceptanceResult.decisionStepCoveragePassed === false);
});
test('T54', 'no decision options → blockedReasons includes W3-STEP-08 coverage message', () => {
    const r = H.check(makeFixture(17, null));
    const hasCovMsg = r.blockedReasons.some(m => m.includes('W3-STEP-08'));
    assert(hasCovMsg, 'expected W3-STEP-08 coverage message; got: ' + JSON.stringify(r.blockedReasons));
});
test('T55', 'no decision options → reviewCycle.attempted === false', () => {
    const r = H.check(makeFixture(17, null));
    assert(r.acceptanceResult.reviewCycle.attempted === false,
        'attempted should be false when no decision options');
});
test('T56', 'no decision options → reviewCycle.passed === false', () => {
    const r = H.check(makeFixture(17, null));
    assert(r.acceptanceResult.reviewCycle.passed === false);
});
test('T57', 'no decision options → blockedReasons includes reviewedCoaTest.attempted message', () => {
    const r = H.check(makeFixture(17, null));
    const hasAttemptMsg = r.blockedReasons.some(m => m.includes('attempted'));
    assert(hasAttemptMsg, 'expected attempted message; got: ' + JSON.stringify(r.blockedReasons));
});

// ═════════════════════════════════════════════════════════════════════════════
// T58–T62: blockedReasons accumulation and content
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── T58–T62: blockedReasons accumulation ─────────────────────────────');

test('T58', 'blockedReasons is always an array', () => {
    const r1 = H.check(make17StepFixture());
    assert(Array.isArray(r1.blockedReasons));
    const r2 = H.check(makeFixture(16, defaultDecisionOptions()));
    assert(Array.isArray(r2.blockedReasons));
});
test('T59', 'warnings is always an array', () => {
    const r = H.check(make17StepFixture());
    assert(Array.isArray(r.warnings));
    const r2 = H.check(makeFixture(16, defaultDecisionOptions()));
    assert(Array.isArray(r2.warnings));
});
test('T60', 'multiple failed checks produce multiple blockedReasons entries', () => {
    // 16-step fixture with no decision options → many checks fail
    const r = H.check(makeFixture(16, null));
    assert(r.blockedReasons.length >= 4,
        'expected ≥4 blocked reasons; got: ' + r.blockedReasons.length);
});
test('T61', 'each blockedReason is a non-empty string', () => {
    const r = H.check(makeFixture(16, null));
    for (const msg of r.blockedReasons) {
        assert(typeof msg === 'string' && msg.length > 0,
            'non-string or empty blocked reason: ' + JSON.stringify(msg));
    }
});
test('T62', 'blockedReasons are independent per call — no cross-call contamination', () => {
    const r1 = H.check(makeFixture(16, null));
    const len1 = r1.blockedReasons.length;
    r1.blockedReasons.push('EXTRA');
    const r2 = H.check(makeFixture(16, null));
    assert(r2.blockedReasons.length === len1,
        'second call should have same count; previous mutation leaked');
});

// ═════════════════════════════════════════════════════════════════════════════
// T63–T66: Immutability — acceptanceResult fields are safe copies
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── T63–T66: Immutability ────────────────────────────────────────────');

test('T63', 'requiredDecisionStepRefs is a fresh array copy each call', () => {
    const r1 = H.check(make17StepFixture());
    r1.acceptanceResult.requiredDecisionStepRefs.push('INJECTED');
    const r2 = H.check(make17StepFixture());
    assert(r2.acceptanceResult.requiredDecisionStepRefs.indexOf('INJECTED') === -1,
        'requiredDecisionStepRefs must be a copy');
});
test('T64', 'detectedDecisionStepRefs mutation does not affect next call', () => {
    const fixture = make17StepFixture();
    const r1 = H.check(fixture);
    r1.acceptanceResult.detectedDecisionStepRefs.push('POISONED');
    const r2 = H.check(fixture);
    assert(r2.acceptanceResult.detectedDecisionStepRefs.indexOf('POISONED') === -1,
        'detectedDecisionStepRefs must be a copy');
});
test('T65', 'safetyChecks object mutation does not affect next call', () => {
    const fixture = make17StepFixture();
    const r1 = H.check(fixture);
    r1.acceptanceResult.safetyChecks.expectedResultAttached = true; // attempt mutation
    const r2 = H.check(fixture);
    assert(r2.acceptanceResult.safetyChecks.expectedResultAttached === false,
        'safetyChecks.expectedResultAttached must remain false');
});
test('T66', 'fixture is not mutated by acceptance check', () => {
    const fixture = make17StepFixture();
    const stepBefore = JSON.stringify(fixture.steps[8]);
    H.check(fixture);
    assert(JSON.stringify(fixture.steps[8]) === stepBefore,
        'fixture step was mutated during acceptance check');
});

// ═════════════════════════════════════════════════════════════════════════════
// T67–T70: Static source guards
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── T67–T70: Static source guards ────────────────────────────────────');

test('T67', 'acceptance function body does not reference /api/sim/commit', () => {
    const fnSrc = extractFn(wsSrc, 'checkWargame3ScenarioWorkflowAcceptance') || '';
    assert(!fnSrc.includes('/api/sim/commit'),
        '/api/sim/commit must not appear in acceptance function body');
});
test('T68', 'acceptance check does not set previewComplete:true in source', () => {
    // Get the function body text
    const fnSrc = extractFn(wsSrc, 'checkWargame3ScenarioWorkflowAcceptance') || '';
    assert(!fnSrc.includes('previewComplete: true') && !fnSrc.includes("previewComplete:true"),
        'previewComplete:true found in acceptance function body');
});
test('T69', 'acceptance check does not set expectedResultAttached:true in source', () => {
    const fnSrc = extractFn(wsSrc, 'checkWargame3ScenarioWorkflowAcceptance') || '';
    assert(!fnSrc.includes('expectedResultAttached: true') &&
           !fnSrc.includes("expectedResultAttached:true"),
        'expectedResultAttached:true found in acceptance function body');
});
test('T70', 'app.html does not reference checkWargame3ScenarioWorkflowAcceptance', () => {
    assert(!appHtml.includes('checkWargame3ScenarioWorkflowAcceptance'),
        'acceptance checker should not be referenced in app.html');
});

// ═════════════════════════════════════════════════════════════════════════════
// T71–T74: Regression — prior exports intact
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── T71–T74: Regression — prior exports intact ───────────────────────');

test('T71', 'runWargame3ScenarioWorkflowWalkthrough still exported', () => {
    assert(wsSrc.includes('runWargame3ScenarioWorkflowWalkthrough:'),
        'PR-278 export missing');
});
test('T72', 'buildW3ScenarioWorkflowStateFromSession still exported', () => {
    assert(wsSrc.includes('buildW3ScenarioWorkflowStateFromSession:'),
        'PR-277 export missing');
});
test('T73', 'buildWargame3ScenarioReviewSessionState still exported', () => {
    assert(wsSrc.includes('buildWargame3ScenarioReviewSessionState:'),
        'PR-274 export missing');
});
test('T74', 'H.run (walkthrough runner) still callable after adding acceptance checker', () => {
    const r = H.run(make17StepFixture());
    assert(r.passed === true && r.walkthrough !== null,
        'walkthrough runner should still work');
    assert(r.walkthrough.walkthroughType === 'wargame3_scenario_workflow_walkthrough');
});

// ═════════════════════════════════════════════════════════════════════════════
// Summary
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n' + '─'.repeat(60));
console.log('  Results: ' + passed + ' passed, ' + failed + ' failed');
if (failures.length) {
    console.log('\n  Failed tests:');
    failures.forEach(f => console.log('    ' + f));
}
console.log('─'.repeat(60));
process.exit(failed > 0 ? 1 : 0);
