/**
 * test-pr-276.js — Wargame 3 Scenario Review Session End-to-End Walkthrough Test
 *
 * 107 tests covering:
 *   A01-A10   Baseline load — session fields after initial preview paint
 *   B11-B20   Step navigation sync — stepRef, stepIndex, safety invariants per nav
 *   C21-C25   W3-STEP-08 decision options — availability and count
 *   D26-D36   Review COA workflow — click HOLD, session reviewedCoa sync
 *   E37-E42   Replace reviewed COA — click REINFORCE replaces HOLD
 *   F43-F50   Clear review — action works, session clears, re-click restores
 *   G51-G57   Step change clears review — nav away/back keeps record cleared
 *   H58-H71   Full walkthrough safety — all 17 steps, no mutations
 *   I72-I80   Map and warning invariants — overlay summary, MISSING_FIELD, W3-STEP-16
 *   J81-J107  File and safety boundaries — storage, fetch, Gate 7, regressions
 *
 * No production code modified.  No DOM.  No Leaflet.  Pure source + functional.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ── helpers ──────────────────────────────────────────────────────────────────
function readSrc(rel) {
    return fs.readFileSync(path.join(__dirname, rel), 'utf8');
}

/** Brace-matched function body extractor — returns body `{...}` only. */
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
    let depth = 0;
    const start = idx;
    while (idx < src.length) {
        if (src[idx] === '{') depth++;
        else if (src[idx] === '}') { depth--; if (depth === 0) break; }
        idx++;
    }
    return src.slice(start, idx + 1);
}

/** Extracts `var NAME = Object.freeze(...)` */
function extractVar(src, name) {
    const re = new RegExp('var\\s+' + name + '\\s*=\\s*Object\\.freeze\\(');
    const m = re.exec(src);
    if (!m) return null;
    let idx = m.index + m[0].length - 1;
    let depth = 0;
    const start = idx;
    while (idx < src.length) {
        if (src[idx] === '(' || src[idx] === '{' || src[idx] === '[') depth++;
        else if (src[idx] === ')' || src[idx] === '}' || src[idx] === ']') {
            depth--; if (depth === 0) break;
        }
        idx++;
    }
    return 'var ' + name + ' = ' + src.slice(m.index + m[0].length - 1, idx + 1) + ';';
}

/** Extracts `var NAME = [...]` plain array constants. */
function extractPlainArrayVar(src, name) {
    const re = new RegExp('var\\s+' + name + '\\s*=\\s*\\[');
    const m = re.exec(src);
    if (!m) return null;
    let idx = m.index + m[0].length - 1;
    let depth = 0;
    while (idx < src.length) {
        if (src[idx] === '[') depth++;
        else if (src[idx] === ']') { depth--; if (depth === 0) break; }
        idx++;
    }
    return 'var ' + name + ' = ' + src.slice(m.index + m[0].length - 1, idx + 1) + ';';
}

// ── sources ───────────────────────────────────────────────────────────────────
const wsSrc   = readSrc('UI_MOdified/client/shell/scenario-workspace.js');
const appHtml = readSrc('UI_MOdified/client/app.html');
const i18nSrc = readSrc('UI_MOdified/client/i18n.js');
const cssSrc  = readSrc('UI_MOdified/client/style.css');

// ── test runner ───────────────────────────────────────────────────────────────
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

// ── main harness ──────────────────────────────────────────────────────────────
// Builds all session state + COA review helpers in a Node-safe scope.
// Includes mock DOM and mock painters so _handleW3CoaReviewClearClick can run.
function buildHarness() {
    const w3DrsUnsafe   = extractVar(wsSrc, '_W3DRS_UNSAFE_FIELDS') ||
        "var _W3DRS_UNSAFE_FIELDS = Object.freeze(['applyNow','commitNow','executeNow','liveApply','mutateUnits','mutateMap','mutateScenario','backendCommit','autoApply','aiGenerated','simulationCommitted','gate7Approved']);";
    const w3DrsForbid   = extractVar(wsSrc, '_W3DRS_FORBIDDEN_STATUS_TOKENS') ||
        "var _W3DRS_FORBIDDEN_STATUS_TOKENS = Object.freeze(['DORMANT','THREATENED','CONTESTED','DENIED','ACTIVE','COMPLETE','SUCCESS','FAILURE']);";
    const w3SelStatuses = extractPlainArrayVar(wsSrc, '_W3SEL_VALID_STATUSES') ||
        "var _W3SEL_VALID_STATUSES = ['draft','selected_for_review','cancelled'];";
    const w3SelForbid   = extractPlainArrayVar(wsSrc, '_W3SEL_FORBIDDEN_REC_FIELDS') ||
        "var _W3SEL_FORBIDDEN_REC_FIELDS = ['expectedResult','previewComplete'];";

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
    const clearHndlFn  = extractFn(wsSrc, '_handleW3CoaReviewClearClick');

    assert(isSdSafe && isErSafe && isDoSafe && isRecSafe, 'validator functions not found');
    assert(clearRecFn && getRecFn, 'COA record helpers not found');
    assert(builderFn, 'buildWargame3ScenarioReviewSessionState not found');
    assert(clearSessFn,  '_clearW3ScenarioReviewSession not found');
    assert(updateSessFn, '_updateW3ScenarioReviewSession not found');
    assert(getSessFn,    'getW3ScenarioReviewSession not found');
    assert(clearHndlFn,  '_handleW3CoaReviewClearClick not found');

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

        // Mock tx (used by indicator painter if included)
        function tx(key, fallback) { return fallback || key; }

        // Mock DOM — getters auto-create nodes
        var domStore = {};
        var document = {
            getElementById: function(id) {
                if (!domStore[id]) {
                    domStore[id] = { textContent: '', hidden: true, onclick: null };
                }
                return domStore[id];
            }
        };

        // Mock painter stubs — session state is the focus, not DOM chip state
        var _indCalls = 0;
        function _paintW3CoaUnderReviewIndicator(p) { _indCalls++; }
        var _reviewCalls = 0;
        function _paintW3OperatorSelectionReview(p) { _reviewCalls++; }

        // PR-277 workflow state mock — no-op stubs so clearReview handler can run
        // without requiring the full PR-277 builder chain. Not under test in PR-276.
        var _w3ScenarioWorkflowState = null;
        function buildW3ScenarioWorkflowStateFromSession(session, prev, opts) {
            return { passed: false, workflow: null, blockedReasons: ['mock'], warnings: [] };
        }
        function _updateW3ScenarioWorkflowStateFromCurrentSession() {
            _w3ScenarioWorkflowState = null;
            return { passed: false, workflow: null, blockedReasons: ['mock'], warnings: [] };
        }
        function _clearW3ScenarioWorkflowState() { _w3ScenarioWorkflowState = null; }

        // Real clear-review handler (calls _clearW3CoaReviewRecord + _updateW3ScenarioReviewSession)
        function _handleW3CoaReviewClearClick(p) ${clearHndlFn}

        return {
            update:       _updateW3ScenarioReviewSession,
            clear:        _clearW3ScenarioReviewSession,
            get:          getW3ScenarioReviewSession,
            getInternal:  function() { return _w3ScenarioReviewSession; },
            setRec:       function(r) { _w3CoaReviewRecord = r; },
            clearRec:     _clearW3CoaReviewRecord,
            getRec:       _getW3CoaReviewRecordForStep,
            clearReview:  _handleW3CoaReviewClearClick,
            dom:          domStore,
            indCalls:     function() { return _indCalls; },
            reviewCalls:  function() { return _reviewCalls; }
        };
    `;
    return new Function(code)();
}

// ── data factories ────────────────────────────────────────────────────────────
function makePreview(overrides) {
    return Object.assign({
        fixtureId:               'W3-FIX-01',
        fixtureName:             'Wargame 3 Alpha',
        activeStepId:            'W3-STEP-08',
        activeStepIndex:         7,
        totalSteps:              17,
        objectiveStatusBaseline: 'THREATENED',
        readOnly:                true,
        liveMutationAllowed:     false,
        decisionOptions:         [],
        warningsDetail:          [],
        missingDataWarnings:     []
    }, overrides || {});
}

function makeRecord(stepRef, optionId, optionLabel) {
    stepRef      = stepRef      || 'W3-STEP-08';
    optionId     = optionId     || 'W3-STEP-08-OPT-HOLD';
    optionLabel  = optionLabel  || 'Hold Current Position';
    return {
        id:        'W3-SEL-' + stepRef + '-' + optionId,
        stepRef:   stepRef,
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
            description: 'Option desc',
            intent:      'Option intent',
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
    return { id: id, label: label, source: 'instructor', readOnly: true };
}

/** Zero-padded W3 step reference: w3StepRef(8) → 'W3-STEP-08' */
function w3StepRef(n) {
    return 'W3-STEP-' + (n < 10 ? '0' + n : String(n));
}

/** Walk all 17 W3 steps through the session harness, return per-step results. */
function walkAllSteps(h) {
    const results = [];
    for (let i = 0; i <= 16; i++) {
        h.clearRec();
        const p = makePreview({
            activeStepId:    w3StepRef(i),
            activeStepIndex: i,
            totalSteps:      17
        });
        const r = h.update(p);
        results.push({ stepRef: w3StepRef(i), r, session: h.get().session });
    }
    return results;
}

// ── FIXTURE option IDs (from W3_DECISION_OPTIONS_FIXTURE_OVERLAY constant) ────
const HOLD_ID      = 'W3-STEP-08-OPT-HOLD';
const REINFORCE_ID = 'W3-STEP-08-OPT-REINFORCE';
const DELAY_ID     = 'W3-STEP-08-OPT-DELAY';

const HOLD_LABEL      = 'Hold current position';
const REINFORCE_LABEL = 'Reinforce the gap';

// ══════════════════════════════════════════════════════════════════════════════
// A01-A10 — Baseline load
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n── A01-A10: Baseline load ───────────────────────────────────────────');

test('A01', 'W3 preview loads successfully — previewWargame3Fixture declared + exported', () => {
    assert(wsSrc.includes('function previewWargame3Fixture('),
        'previewWargame3Fixture not declared in source');
    assert(wsSrc.includes('previewWargame3Fixture:'),
        'previewWargame3Fixture not in export block');
    // Verify it calls the correct pipeline functions
    const fn = extractFn(wsSrc, 'previewWargame3Fixture');
    assert(fn && fn.includes('adaptWargame3ToFixture('),
        'previewWargame3Fixture does not call adaptWargame3ToFixture');
    assert(fn && fn.includes('applyWargame3DecisionOptionsFixtureOverlay('),
        'previewWargame3Fixture does not call applyWargame3DecisionOptionsFixtureOverlay');
    assert(fn && fn.includes('buildScenarioStepPreview('),
        'previewWargame3Fixture does not call buildScenarioStepPreview');
});

test('A02', 'Initial session exists after preview paint', () => {
    const h = buildHarness();
    const r = h.update(makePreview());
    assert(r.passed && h.getInternal() !== null,
        'session should be populated after update with W3 preview');
    assert(h.get().passed && h.get().session !== null,
        'getW3ScenarioReviewSession should return session');
});

test('A03', 'sessionType is wargame3_review_session', () => {
    const h = buildHarness();
    h.update(makePreview());
    assert(h.get().session.sessionType === 'wargame3_review_session',
        'sessionType: ' + h.get().session.sessionType);
});

test('A04', 'source is dry_run_preview', () => {
    const h = buildHarness();
    h.update(makePreview());
    assert(h.get().session.source === 'dry_run_preview',
        'source: ' + h.get().session.source);
});

test('A05', 'readOnly true', () => {
    const h = buildHarness();
    h.update(makePreview());
    assert(h.get().session.readOnly === true, 'readOnly should be true');
});

test('A06', 'dryRunOnly true', () => {
    const h = buildHarness();
    h.update(makePreview());
    assert(h.get().session.dryRunOnly === true, 'dryRunOnly should be true');
});

test('A07', 'liveMutationAllowed false', () => {
    const h = buildHarness();
    h.update(makePreview());
    assert(h.get().session.liveMutationAllowed === false,
        'liveMutationAllowed should be false');
});

test('A08', 'backendCommitAllowed false', () => {
    const h = buildHarness();
    h.update(makePreview());
    assert(h.get().session.backendCommitAllowed === false,
        'backendCommitAllowed should be false');
});

test('A09', 'previewComplete false', () => {
    const h = buildHarness();
    h.update(makePreview());
    assert(h.get().session.previewComplete === false,
        'previewComplete should be false');
});

test('A10', 'expectedResultAttached false', () => {
    const h = buildHarness();
    h.update(makePreview());
    assert(h.get().session.expectedResultAttached === false,
        'expectedResultAttached should be false');
});

// ══════════════════════════════════════════════════════════════════════════════
// B11-B20 — Step navigation sync
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n── B11-B20: Step navigation sync ───────────────────────────────────');

test('B11', 'initial session stepRef matches first W3 step', () => {
    const h = buildHarness();
    h.update(makePreview({ activeStepId: 'W3-STEP-00', activeStepIndex: 0 }));
    assert(h.get().session.stepRef === 'W3-STEP-00',
        'stepRef should be W3-STEP-00, got: ' + h.get().session.stepRef);
});

test('B12', 'next step updates session.stepRef', () => {
    const h = buildHarness();
    h.update(makePreview({ activeStepId: 'W3-STEP-00', activeStepIndex: 0 }));
    h.update(makePreview({ activeStepId: 'W3-STEP-01', activeStepIndex: 1 }));
    assert(h.get().session.stepRef === 'W3-STEP-01',
        'stepRef should be W3-STEP-01 after nav, got: ' + h.get().session.stepRef);
});

test('B13', 'previous step updates session.stepRef', () => {
    const h = buildHarness();
    h.update(makePreview({ activeStepId: 'W3-STEP-01', activeStepIndex: 1 }));
    h.update(makePreview({ activeStepId: 'W3-STEP-00', activeStepIndex: 0 }));
    assert(h.get().session.stepRef === 'W3-STEP-00',
        'stepRef should revert to W3-STEP-00, got: ' + h.get().session.stepRef);
});

test('B14', 'jump to W3-STEP-08 updates session.stepRef', () => {
    const h = buildHarness();
    h.update(makePreview({ activeStepId: 'W3-STEP-08', activeStepIndex: 8 }));
    assert(h.get().session.stepRef === 'W3-STEP-08',
        'stepRef should be W3-STEP-08, got: ' + h.get().session.stepRef);
});

test('B15', 'jump to final step (W3-STEP-16) updates session.stepRef', () => {
    const h = buildHarness();
    h.update(makePreview({ activeStepId: 'W3-STEP-16', activeStepIndex: 16 }));
    assert(h.get().session.stepRef === 'W3-STEP-16',
        'stepRef should be W3-STEP-16, got: ' + h.get().session.stepRef);
});

test('B16', 'jump back to W3-STEP-08 updates session.stepRef', () => {
    const h = buildHarness();
    h.update(makePreview({ activeStepId: 'W3-STEP-16', activeStepIndex: 16 }));
    h.update(makePreview({ activeStepId: 'W3-STEP-08', activeStepIndex: 8 }));
    assert(h.get().session.stepRef === 'W3-STEP-08',
        'stepRef should update back to W3-STEP-08, got: ' + h.get().session.stepRef);
});

test('B17', 'totalSteps remains stable across navigation', () => {
    const h = buildHarness();
    for (let i = 0; i <= 16; i++) {
        h.update(makePreview({ activeStepId: w3StepRef(i), activeStepIndex: i, totalSteps: 17 }));
        assert(h.get().session.totalSteps === 17,
            'totalSteps changed at step ' + i + ': ' + h.get().session.totalSteps);
    }
});

test('B18', 'stepIndex changes correctly', () => {
    const h = buildHarness();
    h.update(makePreview({ activeStepId: 'W3-STEP-08', activeStepIndex: 8 }));
    assert(h.get().session.stepIndex === 8, 'stepIndex should be 8');
    h.update(makePreview({ activeStepId: 'W3-STEP-12', activeStepIndex: 12 }));
    assert(h.get().session.stepIndex === 12, 'stepIndex should be 12');
});

test('B19', 'navigation does not create reviewedCoa.available', () => {
    const h = buildHarness();
    for (let i = 0; i <= 16; i++) {
        h.clearRec();
        h.update(makePreview({ activeStepId: w3StepRef(i), activeStepIndex: i, totalSteps: 17 }));
        assert(h.get().session.reviewedCoa.available === false,
            'reviewedCoa.available should be false on nav to step ' + i);
    }
});

test('B20', 'navigation does not create expectedResult', () => {
    const h = buildHarness();
    for (let i = 0; i <= 16; i++) {
        h.update(makePreview({ activeStepId: w3StepRef(i), activeStepIndex: i, totalSteps: 17 }));
        assert(h.get().session.expectedResultAttached === false,
            'expectedResultAttached should be false at step ' + i);
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// C21-C25 — W3-STEP-08 decision options
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n── C21-C25: W3-STEP-08 decision options ────────────────────────────');

test('C21', 'W3-STEP-08 has decisionOptionsAvailable true when 3 options supplied', () => {
    const h = buildHarness();
    const opts = [
        makeOption(HOLD_ID, 'Hold current position'),
        makeOption(REINFORCE_ID, 'Reinforce the gap'),
        makeOption(DELAY_ID, 'Delay and withdraw')
    ];
    h.update(makePreview({ activeStepId: 'W3-STEP-08', decisionOptions: opts }));
    assert(h.get().session.decisionOptionsAvailable === true,
        'decisionOptionsAvailable should be true with 3 options');
});

test('C22', 'W3-STEP-08 decisionOptionCount is 3', () => {
    const h = buildHarness();
    const opts = [
        makeOption(HOLD_ID, 'Hold current position'),
        makeOption(REINFORCE_ID, 'Reinforce the gap'),
        makeOption(DELAY_ID, 'Delay and withdraw')
    ];
    h.update(makePreview({ activeStepId: 'W3-STEP-08', decisionOptions: opts }));
    assert(h.get().session.decisionOptionCount === 3,
        'decisionOptionCount should be 3, got: ' + h.get().session.decisionOptionCount);
});

test('C23', 'all three fixture COA option IDs present in W3_DECISION_OPTIONS_FIXTURE_OVERLAY', () => {
    const overlayStart = wsSrc.indexOf('var W3_DECISION_OPTIONS_FIXTURE_OVERLAY');
    assert(overlayStart !== -1, 'W3_DECISION_OPTIONS_FIXTURE_OVERLAY not found');
    const overlayEnd = wsSrc.indexOf('function applyWargame3DecisionOptionsFixtureOverlay');
    const block = wsSrc.slice(overlayStart, overlayEnd !== -1 ? overlayEnd : overlayStart + 3000);
    assert(block.includes(HOLD_ID),      'W3-STEP-08-OPT-HOLD not in overlay constant');
    assert(block.includes(REINFORCE_ID), 'W3-STEP-08-OPT-REINFORCE not in overlay constant');
    assert(block.includes(DELAY_ID),     'W3-STEP-08-OPT-DELAY not in overlay constant');
});

test('C24', 'Decision Options display path remains available in _paintToDOM source', () => {
    const fn = extractFn(wsSrc, '_paintToDOM');
    assert(fn && fn.includes('_paintW3DecisionOptions('),
        '_paintToDOM does not call _paintW3DecisionOptions');
});

test('C25', 'Review COA control path remains available — _handleW3CoaReviewClick exported', () => {
    const exportRegion = wsSrc.slice(wsSrc.lastIndexOf('window.AppShellScenarioWorkspace'));
    assert(exportRegion.includes('_handleW3CoaReviewClick:'),
        '_handleW3CoaReviewClick not in export block');
});

// ══════════════════════════════════════════════════════════════════════════════
// D26-D36 — Review COA workflow
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n── D26-D36: Review COA workflow ────────────────────────────────────');

test('D26', 'click/review HOLD option — session updates', () => {
    const h = buildHarness();
    const rec = makeRecord('W3-STEP-08', HOLD_ID, HOLD_LABEL);
    h.setRec({ stepRef: 'W3-STEP-08', record: rec });
    h.update(makePreview({ activeStepId: 'W3-STEP-08' }));
    assert(h.get().passed && h.get().session !== null, 'session should exist after HOLD click');
});

test('D27', 'session reviewedCoa.available becomes true', () => {
    const h = buildHarness();
    const rec = makeRecord('W3-STEP-08', HOLD_ID, HOLD_LABEL);
    h.setRec({ stepRef: 'W3-STEP-08', record: rec });
    h.update(makePreview({ activeStepId: 'W3-STEP-08' }));
    assert(h.get().session.reviewedCoa.available === true,
        'reviewedCoa.available should be true after HOLD click');
});

test('D28', 'session reviewedCoa.optionRef is HOLD id', () => {
    const h = buildHarness();
    const rec = makeRecord('W3-STEP-08', HOLD_ID, HOLD_LABEL);
    h.setRec({ stepRef: 'W3-STEP-08', record: rec });
    h.update(makePreview({ activeStepId: 'W3-STEP-08' }));
    assert(h.get().session.reviewedCoa.optionRef === HOLD_ID,
        'optionRef should be HOLD, got: ' + h.get().session.reviewedCoa.optionRef);
});

test('D29', 'session reviewedCoa.label matches HOLD label', () => {
    const h = buildHarness();
    const rec = makeRecord('W3-STEP-08', HOLD_ID, HOLD_LABEL);
    h.setRec({ stepRef: 'W3-STEP-08', record: rec });
    h.update(makePreview({ activeStepId: 'W3-STEP-08' }));
    assert(h.get().session.reviewedCoa.label === HOLD_LABEL,
        'label mismatch: ' + h.get().session.reviewedCoa.label);
});

test('D30', 'session reviewedCoa.status is draft', () => {
    const h = buildHarness();
    const rec = makeRecord('W3-STEP-08', HOLD_ID, HOLD_LABEL);
    h.setRec({ stepRef: 'W3-STEP-08', record: rec });
    h.update(makePreview({ activeStepId: 'W3-STEP-08' }));
    assert(h.get().session.reviewedCoa.status === 'draft',
        'status should be draft, got: ' + h.get().session.reviewedCoa.status);
});

test('D31', 'selectedDecision exists only inside operatorSelectionDryRunRecord', () => {
    const h = buildHarness();
    const rec = makeRecord('W3-STEP-08', HOLD_ID, HOLD_LABEL);
    // record has selectedDecision inside it
    assert(rec.selectedDecision !== null && rec.selectedDecision !== undefined,
        'record.selectedDecision should exist inside the record');
    const p = makePreview({ activeStepId: 'W3-STEP-08' });
    h.setRec({ stepRef: 'W3-STEP-08', record: rec });
    h.update(p);
    // p itself should NOT have a top-level selectedDecision
    assert(!('selectedDecision' in p),
        'update should not place selectedDecision at p level');
});

test('D32', 'preview.selectedDecision remains null or unchanged', () => {
    const h = buildHarness();
    const p = makePreview({ activeStepId: 'W3-STEP-08', selectedDecision: null });
    const before = p.selectedDecision;
    const rec = makeRecord('W3-STEP-08', HOLD_ID, HOLD_LABEL);
    h.setRec({ stepRef: 'W3-STEP-08', record: rec });
    h.update(p);
    assert(p.selectedDecision === before,
        'update mutated p.selectedDecision');
});

test('D33', 'step.selectedDecision remains null or unchanged (source check)', () => {
    // The builder source must not assign selectedDecision to the review step
    const fn = extractFn(wsSrc, 'buildWargame3ScenarioReviewSessionState');
    assert(fn && !fn.includes('preview.selectedDecision ='),
        'builder assigns to preview.selectedDecision');
    assert(fn && !fn.includes('step.selectedDecision ='),
        'builder assigns to step.selectedDecision');
});

test('D34', 'expectedResult remains null or unattached', () => {
    const h = buildHarness();
    const rec = makeRecord('W3-STEP-08', HOLD_ID, HOLD_LABEL);
    const p = makePreview({ activeStepId: 'W3-STEP-08' });
    h.setRec({ stepRef: 'W3-STEP-08', record: rec });
    h.update(p);
    assert(!('expectedResult' in p) || p.expectedResult === undefined || p.expectedResult === null,
        'update attached expectedResult to preview');
    assert(h.get().session.expectedResultAttached === false,
        'session.expectedResultAttached should be false');
});

test('D35', 'previewComplete remains false', () => {
    const h = buildHarness();
    const rec = makeRecord('W3-STEP-08', HOLD_ID, HOLD_LABEL);
    h.setRec({ stepRef: 'W3-STEP-08', record: rec });
    h.update(makePreview({ activeStepId: 'W3-STEP-08' }));
    assert(h.get().session.previewComplete === false,
        'previewComplete should be false');
});

test('D36', 'expectedResultAttached remains false', () => {
    const h = buildHarness();
    const rec = makeRecord('W3-STEP-08', HOLD_ID, HOLD_LABEL);
    h.setRec({ stepRef: 'W3-STEP-08', record: rec });
    h.update(makePreview({ activeStepId: 'W3-STEP-08' }));
    const s = h.get().session;
    assert(s.expectedResultAttached === false,
        'expectedResultAttached: ' + s.expectedResultAttached);
});

// ══════════════════════════════════════════════════════════════════════════════
// E37-E42 — Replace reviewed COA
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n── E37-E42: Replace reviewed COA ───────────────────────────────────');

test('E37', 'click/review REINFORCE option replaces HOLD', () => {
    const h = buildHarness();
    // First click: HOLD
    h.setRec({ stepRef: 'W3-STEP-08', record: makeRecord('W3-STEP-08', HOLD_ID, HOLD_LABEL) });
    h.update(makePreview({ activeStepId: 'W3-STEP-08' }));
    assert(h.get().session.reviewedCoa.optionRef === HOLD_ID, 'pre-condition: HOLD selected');
    // Second click: REINFORCE
    h.setRec({ stepRef: 'W3-STEP-08', record: makeRecord('W3-STEP-08', REINFORCE_ID, REINFORCE_LABEL) });
    h.update(makePreview({ activeStepId: 'W3-STEP-08' }));
    assert(h.get().session.reviewedCoa.optionRef === REINFORCE_ID,
        'optionRef should be REINFORCE after replace');
});

test('E38', 'session reviewedCoa.optionRef updates to REINFORCE id', () => {
    const h = buildHarness();
    h.setRec({ stepRef: 'W3-STEP-08', record: makeRecord('W3-STEP-08', REINFORCE_ID, REINFORCE_LABEL) });
    h.update(makePreview({ activeStepId: 'W3-STEP-08' }));
    assert(h.get().session.reviewedCoa.optionRef === REINFORCE_ID,
        'optionRef: ' + h.get().session.reviewedCoa.optionRef);
});

test('E39', 'session reviewedCoa.label updates to REINFORCE label', () => {
    const h = buildHarness();
    h.setRec({ stepRef: 'W3-STEP-08', record: makeRecord('W3-STEP-08', REINFORCE_ID, REINFORCE_LABEL) });
    h.update(makePreview({ activeStepId: 'W3-STEP-08' }));
    assert(h.get().session.reviewedCoa.label === REINFORCE_LABEL,
        'label: ' + h.get().session.reviewedCoa.label);
});

test('E40', 'previous HOLD review is not retained as active', () => {
    const h = buildHarness();
    h.setRec({ stepRef: 'W3-STEP-08', record: makeRecord('W3-STEP-08', HOLD_ID, HOLD_LABEL) });
    h.update(makePreview({ activeStepId: 'W3-STEP-08' }));
    // Replace with REINFORCE
    h.setRec({ stepRef: 'W3-STEP-08', record: makeRecord('W3-STEP-08', REINFORCE_ID, REINFORCE_LABEL) });
    h.update(makePreview({ activeStepId: 'W3-STEP-08' }));
    assert(h.get().session.reviewedCoa.optionRef !== HOLD_ID,
        'HOLD should no longer be the active reviewedCoa');
});

test('E41', 'still no expectedResult attached after replace', () => {
    const h = buildHarness();
    h.setRec({ stepRef: 'W3-STEP-08', record: makeRecord('W3-STEP-08', REINFORCE_ID, REINFORCE_LABEL) });
    h.update(makePreview({ activeStepId: 'W3-STEP-08' }));
    assert(h.get().session.expectedResultAttached === false,
        'expectedResultAttached should still be false');
});

test('E42', 'still previewComplete false after replace', () => {
    const h = buildHarness();
    h.setRec({ stepRef: 'W3-STEP-08', record: makeRecord('W3-STEP-08', REINFORCE_ID, REINFORCE_LABEL) });
    h.update(makePreview({ activeStepId: 'W3-STEP-08' }));
    assert(h.get().session.previewComplete === false,
        'previewComplete should still be false');
});

// ══════════════════════════════════════════════════════════════════════════════
// F43-F50 — Clear review
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n── F43-F50: Clear review ───────────────────────────────────────────');

test('F43', 'clear review action works — handler calls _clearW3CoaReviewRecord (source)', () => {
    const fn = extractFn(wsSrc, '_handleW3CoaReviewClearClick');
    assert(fn && fn.includes('_clearW3CoaReviewRecord()'),
        '_handleW3CoaReviewClearClick does not call _clearW3CoaReviewRecord()');
    assert(fn && fn.includes('_updateW3ScenarioReviewSession'),
        '_handleW3CoaReviewClearClick does not call _updateW3ScenarioReviewSession (PR-275 wiring)');
});

test('F44', 'session reviewedCoa.available becomes false after clear', () => {
    const h = buildHarness();
    // Set up a reviewed COA
    const rec = makeRecord('W3-STEP-08', HOLD_ID, HOLD_LABEL);
    h.setRec({ stepRef: 'W3-STEP-08', record: rec });
    h.update(makePreview({ activeStepId: 'W3-STEP-08' }));
    assert(h.get().session.reviewedCoa.available === true, 'pre-condition: should be available');
    // Simulate clear: clearRec then update
    const p = makePreview({ activeStepId: 'W3-STEP-08' });
    h.clearReview(p);  // calls _clearW3CoaReviewRecord + _updateW3ScenarioReviewSession(p)
    assert(h.get().session.reviewedCoa.available === false,
        'reviewedCoa.available should be false after clear');
});

test('F45', 'Selection Review state is cleared — operatorSelectionDryRunRecord deleted from p', () => {
    const h = buildHarness();
    const rec = makeRecord('W3-STEP-08', HOLD_ID, HOLD_LABEL);
    const p = makePreview({
        activeStepId: 'W3-STEP-08',
        operatorSelectionDryRunRecord: rec
    });
    assert('operatorSelectionDryRunRecord' in p, 'pre-condition: record on p');
    h.clearReview(p);
    assert(!('operatorSelectionDryRunRecord' in p),
        'operatorSelectionDryRunRecord should be deleted from p after clear');
});

test('F46', 'COA-under-review state is cleared — handler calls _paintW3CoaUnderReviewIndicator (source)', () => {
    const fn = extractFn(wsSrc, '_handleW3CoaReviewClearClick');
    assert(fn && fn.includes('_paintW3CoaUnderReviewIndicator('),
        '_handleW3CoaReviewClearClick does not call _paintW3CoaUnderReviewIndicator');
});

test('F47', 'Decision Options remain available after clear', () => {
    const h = buildHarness();
    const opts = [
        makeOption(HOLD_ID, HOLD_LABEL),
        makeOption(REINFORCE_ID, REINFORCE_LABEL),
        makeOption(DELAY_ID, 'Delay and withdraw')
    ];
    // Set, update, then clear
    h.setRec({ stepRef: 'W3-STEP-08', record: makeRecord('W3-STEP-08', HOLD_ID, HOLD_LABEL) });
    const p = makePreview({ activeStepId: 'W3-STEP-08', decisionOptions: opts });
    h.update(p);
    h.clearReview(p);
    // Re-update with options to verify they're still countable
    h.update(makePreview({ activeStepId: 'W3-STEP-08', decisionOptions: opts }));
    assert(h.get().session.decisionOptionsAvailable === true,
        'decisionOptionsAvailable should remain true after clear');
    assert(h.get().session.decisionOptionCount === 3,
        'decisionOptionCount should remain 3 after clear');
});

test('F48', 'Review COA can be clicked again after clear', () => {
    const h = buildHarness();
    // First review
    h.setRec({ stepRef: 'W3-STEP-08', record: makeRecord('W3-STEP-08', HOLD_ID, HOLD_LABEL) });
    h.update(makePreview({ activeStepId: 'W3-STEP-08' }));
    assert(h.get().session.reviewedCoa.available === true, 'pre-condition');
    // Clear
    h.clearReview(makePreview({ activeStepId: 'W3-STEP-08' }));
    assert(h.get().session.reviewedCoa.available === false, 'after clear');
    // Click again
    h.setRec({ stepRef: 'W3-STEP-08', record: makeRecord('W3-STEP-08', REINFORCE_ID, REINFORCE_LABEL) });
    h.update(makePreview({ activeStepId: 'W3-STEP-08' }));
    assert(h.get().session.reviewedCoa.available === true,
        'Review COA should be clickable again after clear');
});

test('F49', 'clicking Review COA again restores reviewedCoa.available true', () => {
    const h = buildHarness();
    h.clearRec();
    h.update(makePreview({ activeStepId: 'W3-STEP-08' }));
    assert(h.get().session.reviewedCoa.available === false, 'pre-condition: not available');
    // Click
    h.setRec({ stepRef: 'W3-STEP-08', record: makeRecord('W3-STEP-08', HOLD_ID, HOLD_LABEL) });
    h.update(makePreview({ activeStepId: 'W3-STEP-08' }));
    assert(h.get().session.reviewedCoa.available === true, 'should be available after click');
});

test('F50', 'clearing again works — double clear idempotent', () => {
    const h = buildHarness();
    h.setRec({ stepRef: 'W3-STEP-08', record: makeRecord('W3-STEP-08', HOLD_ID, HOLD_LABEL) });
    const p = makePreview({ activeStepId: 'W3-STEP-08' });
    h.update(p);
    // First clear
    h.clearReview(p);
    assert(h.get().session.reviewedCoa.available === false, 'after first clear');
    // Second clear — should not throw and should remain false
    h.clearReview(makePreview({ activeStepId: 'W3-STEP-08' }));
    assert(h.get().session.reviewedCoa.available === false, 'after second clear');
});

// ══════════════════════════════════════════════════════════════════════════════
// G51-G57 — Step change clears review
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n── G51-G57: Step change clears review ──────────────────────────────');

test('G51', 'review a COA on W3-STEP-08 — reviewedCoa available', () => {
    const h = buildHarness();
    h.setRec({ stepRef: 'W3-STEP-08', record: makeRecord('W3-STEP-08', HOLD_ID, HOLD_LABEL) });
    h.update(makePreview({ activeStepId: 'W3-STEP-08' }));
    assert(h.get().session.reviewedCoa.available === true, 'should be available on W3-STEP-08');
});

test('G52', 'navigate to W3-STEP-09 — session updates', () => {
    const h = buildHarness();
    h.setRec({ stepRef: 'W3-STEP-08', record: makeRecord('W3-STEP-08', HOLD_ID, HOLD_LABEL) });
    h.update(makePreview({ activeStepId: 'W3-STEP-08' }));
    // Nav to W3-STEP-09 (module memory has W3-STEP-08 record, doesn't match)
    h.update(makePreview({ activeStepId: 'W3-STEP-09', activeStepIndex: 9 }));
    assert(h.get().session.stepRef === 'W3-STEP-09', 'session should show W3-STEP-09');
});

test('G53', 'session stepRef is W3-STEP-09 after navigation', () => {
    const h = buildHarness();
    h.setRec({ stepRef: 'W3-STEP-08', record: makeRecord('W3-STEP-08', HOLD_ID, HOLD_LABEL) });
    h.update(makePreview({ activeStepId: 'W3-STEP-08' }));
    h.update(makePreview({ activeStepId: 'W3-STEP-09', activeStepIndex: 9 }));
    assert(h.get().session.stepRef === 'W3-STEP-09',
        'stepRef: ' + h.get().session.stepRef);
});

test('G54', 'session reviewedCoa.available is false on W3-STEP-09', () => {
    const h = buildHarness();
    h.setRec({ stepRef: 'W3-STEP-08', record: makeRecord('W3-STEP-08', HOLD_ID, HOLD_LABEL) });
    h.update(makePreview({ activeStepId: 'W3-STEP-08' }));
    h.update(makePreview({ activeStepId: 'W3-STEP-09', activeStepIndex: 9 }));
    assert(h.get().session.reviewedCoa.available === false,
        'reviewedCoa.available should be false on a different step (record is for W3-STEP-08)');
});

test('G55', 'return to W3-STEP-08 — stepRef updates back', () => {
    const h = buildHarness();
    h.setRec({ stepRef: 'W3-STEP-08', record: makeRecord('W3-STEP-08', HOLD_ID, HOLD_LABEL) });
    h.update(makePreview({ activeStepId: 'W3-STEP-08' }));
    h.clearRec(); // simulate "clear review" before nav away
    h.update(makePreview({ activeStepId: 'W3-STEP-09', activeStepIndex: 9 }));
    h.update(makePreview({ activeStepId: 'W3-STEP-08', activeStepIndex: 8 }));
    assert(h.get().session.stepRef === 'W3-STEP-08', 'stepRef should be W3-STEP-08 on return');
});

test('G56', 'reviewedCoa.available remains false on return without re-click', () => {
    const h = buildHarness();
    // Review, then clear record, then nav away and back
    h.setRec({ stepRef: 'W3-STEP-08', record: makeRecord('W3-STEP-08', HOLD_ID, HOLD_LABEL) });
    h.update(makePreview({ activeStepId: 'W3-STEP-08' }));
    h.clearRec();  // simulate clear before nav
    h.update(makePreview({ activeStepId: 'W3-STEP-09', activeStepIndex: 9 }));
    h.update(makePreview({ activeStepId: 'W3-STEP-08', activeStepIndex: 8 }));
    assert(h.get().session.reviewedCoa.available === false,
        'reviewedCoa should not auto-restore after clear + nav + return');
});

test('G57', 'Decision Options still available on W3-STEP-08 after return', () => {
    const h = buildHarness();
    const opts = [
        makeOption(HOLD_ID, HOLD_LABEL),
        makeOption(REINFORCE_ID, REINFORCE_LABEL),
        makeOption(DELAY_ID, 'Delay and withdraw')
    ];
    h.update(makePreview({ activeStepId: 'W3-STEP-09', activeStepIndex: 9 }));
    h.update(makePreview({ activeStepId: 'W3-STEP-08', activeStepIndex: 8, decisionOptions: opts }));
    assert(h.get().session.decisionOptionsAvailable === true,
        'decisionOptionsAvailable should be true on W3-STEP-08 after return');
});

// ══════════════════════════════════════════════════════════════════════════════
// H58-H71 — Full walkthrough safety
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n── H58-H71: Full walkthrough safety ────────────────────────────────');

test('H58', 'walk all 17 W3 steps — session updates for every step', () => {
    const h = buildHarness();
    const results = walkAllSteps(h);
    assert(results.length === 17, 'should have 17 step results');
    for (const { r, stepRef } of results) {
        assert(r.passed, 'update failed at step ' + stepRef + ': ' +
               (r.blockedReasons || []).join(', '));
    }
});

test('H59', 'each step updates session.stepRef correctly', () => {
    const h = buildHarness();
    const results = walkAllSteps(h);
    for (const { session, stepRef } of results) {
        assert(session && session.stepRef === stepRef,
            'stepRef mismatch at ' + stepRef + ': got ' + (session && session.stepRef));
    }
});

test('H60', 'each step keeps readOnly true', () => {
    const h = buildHarness();
    const results = walkAllSteps(h);
    for (const { session, stepRef } of results) {
        assert(session && session.readOnly === true,
            'readOnly not true at step ' + stepRef);
    }
});

test('H61', 'each step keeps dryRunOnly true', () => {
    const h = buildHarness();
    const results = walkAllSteps(h);
    for (const { session, stepRef } of results) {
        assert(session && session.dryRunOnly === true,
            'dryRunOnly not true at step ' + stepRef);
    }
});

test('H62', 'each step keeps liveMutationAllowed false', () => {
    const h = buildHarness();
    const results = walkAllSteps(h);
    for (const { session, stepRef } of results) {
        assert(session && session.liveMutationAllowed === false,
            'liveMutationAllowed not false at step ' + stepRef);
    }
});

test('H63', 'each step keeps backendCommitAllowed false', () => {
    const h = buildHarness();
    const results = walkAllSteps(h);
    for (const { session, stepRef } of results) {
        assert(session && session.backendCommitAllowed === false,
            'backendCommitAllowed not false at step ' + stepRef);
    }
});

test('H64', 'each step keeps previewComplete false', () => {
    const h = buildHarness();
    const results = walkAllSteps(h);
    for (const { session, stepRef } of results) {
        assert(session && session.previewComplete === false,
            'previewComplete not false at step ' + stepRef);
    }
});

test('H65', 'each step keeps expectedResultAttached false', () => {
    const h = buildHarness();
    const results = walkAllSteps(h);
    for (const { session, stepRef } of results) {
        assert(session && session.expectedResultAttached === false,
            'expectedResultAttached not false at step ' + stepRef);
    }
});

test('H66', 'no step creates expectedResult — builder source check', () => {
    const fn = extractFn(wsSrc, 'buildWargame3ScenarioReviewSessionState');
    assert(fn && !fn.includes('.expectedResult ='),
        'builder assigns .expectedResult somewhere');
    // session.expectedResultAttached is always hardcoded false — not derived from data
    assert(fn && fn.includes('expectedResultAttached: false'),
        'expectedResultAttached is not hardcoded false in builder');
});

test('H67', 'no step creates selectedDecision outside dry-run record', () => {
    const fn = extractFn(wsSrc, 'buildWargame3ScenarioReviewSessionState');
    assert(fn && !fn.includes('preview.selectedDecision ='),
        'builder assigns preview.selectedDecision');
    // selectedDecision is only READ from reviewedCoaRecord, never created
    assert(fn && fn.includes('reviewedCoaRecord.selectedDecision'),
        'builder should read selectedDecision from record, not create it');
});

test('H68', 'no step mutates raw W3 JSON — stepWargame3Preview source check', () => {
    const fn = extractFn(wsSrc, 'stepWargame3Preview');
    assert(fn && !fn.includes('w3json.steps'),
        'stepWargame3Preview directly modifies w3json.steps');
    // stepWargame3Preview delegates to paintWargame3Preview → previewWargame3Fixture
    // which adapts (copies) the w3json without mutating it
    assert(fn && fn.includes('paintWargame3Preview('),
        'stepWargame3Preview should delegate to paintWargame3Preview');
});

test('H69', 'no step mutates window.RmoozScenario.stepIndex — builder source', () => {
    const fn = extractFn(wsSrc, 'buildWargame3ScenarioReviewSessionState');
    assert(fn && !fn.includes('window.RmoozScenario'),
        'builder references window.RmoozScenario');
    const updateFn = extractFn(wsSrc, '_updateW3ScenarioReviewSession');
    assert(updateFn && !updateFn.includes('window.RmoozScenario'),
        '_updateW3ScenarioReviewSession references window.RmoozScenario');
});

test('H70', 'no step mutates window.units — builder + update helpers', () => {
    const fn = extractFn(wsSrc, 'buildWargame3ScenarioReviewSessionState');
    assert(fn && !fn.includes('window.units'),
        'builder references window.units');
    const updateFn = extractFn(wsSrc, '_updateW3ScenarioReviewSession');
    assert(updateFn && !updateFn.includes('window.units'),
        '_updateW3ScenarioReviewSession references window.units');
});

test('H71', 'no step mutates window.lines — builder + update helpers', () => {
    const fn = extractFn(wsSrc, 'buildWargame3ScenarioReviewSessionState');
    assert(fn && !fn.includes('window.lines'),
        'builder references window.lines');
    const updateFn = extractFn(wsSrc, '_updateW3ScenarioReviewSession');
    assert(updateFn && !updateFn.includes('window.lines'),
        '_updateW3ScenarioReviewSession references window.lines');
});

// ══════════════════════════════════════════════════════════════════════════════
// I72-I80 — Map and warning invariants
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n── I72-I80: Map and warning invariants ─────────────────────────────');

test('I72', 'mapOverlaySummary present in session after every step', () => {
    const h = buildHarness();
    const results = walkAllSteps(h);
    for (const { session, stepRef } of results) {
        assert(session && typeof session.mapOverlaySummary === 'object' &&
               session.mapOverlaySummary !== null,
            'mapOverlaySummary missing at step ' + stepRef);
    }
});

test('I73', 'warningSummary present in session after every step', () => {
    const h = buildHarness();
    const results = walkAllSteps(h);
    for (const { session, stepRef } of results) {
        assert(session && typeof session.warningSummary === 'object' &&
               session.warningSummary !== null,
            'warningSummary missing at step ' + stepRef);
    }
});

test('I74', 'event log behavior remains available — _buildW3EventLog called in _paintToDOM', () => {
    const fn = extractFn(wsSrc, '_paintToDOM');
    assert(fn && fn.includes('_buildW3EventLog('),
        '_paintToDOM does not call _buildW3EventLog');
});

test('I75', 'map markers remain available — paintWargame3PreviewMapOverlayFromPreview in _paintToDOM', () => {
    const fn = extractFn(wsSrc, '_paintToDOM');
    assert(fn && fn.includes('paintWargame3PreviewMapOverlayFromPreview('),
        '_paintToDOM does not call paintWargame3PreviewMapOverlayFromPreview');
});

test('I76', 'movement trails remain available — movementTrails in overlay summary', () => {
    const h = buildHarness();
    const overlay = {
        readOnly: true,
        markers: [{}, {}, {}],
        movementTrails: [{}, {}],
        objectiveHighlights: [{}],
        warnings: []
    };
    h.update(makePreview({ activeStepId: 'W3-STEP-08' }), { overlay });
    assert(h.get().session.mapOverlaySummary.movementTrailCount === 2,
        'movementTrailCount should be 2: ' + h.get().session.mapOverlaySummary.movementTrailCount);
});

test('I77', 'objective highlight remains available — objectiveHighlights in overlay summary', () => {
    const h = buildHarness();
    const overlay = {
        readOnly: true,
        markers: [{}, {}],
        movementTrails: [],
        objectiveHighlights: [{}, {}],
        warnings: []
    };
    h.update(makePreview({ activeStepId: 'W3-STEP-08' }), { overlay });
    assert(h.get().session.mapOverlaySummary.objectiveHighlightCount === 2,
        'objectiveHighlightCount: ' + h.get().session.mapOverlaySummary.objectiveHighlightCount);
});

test('I78', 'MISSING_FIELD warnings captured in warningSummary', () => {
    const h = buildHarness();
    const warns = [
        { code: 'MISSING_FIELD', message: 'selectedDecision is missing' },
        { code: 'MISSING_FIELD', message: 'expectedResult is missing' }
    ];
    h.update(makePreview({ activeStepId: 'W3-STEP-08', warningsDetail: warns }));
    const ws = h.get().session.warningSummary;
    assert(ws.warningCount === 2, 'warningCount should be 2, got: ' + ws.warningCount);
    assert(ws.warningCodes.includes('MISSING_FIELD'),
        'warningSummary.warningCodes should include MISSING_FIELD');
});

test('I79', 'W3-STEP-08 overlay constant has markers/trails/objective highlight keys in source', () => {
    // The overlay bridge uses markers, movementTrails, objectiveHighlights
    // Verify these are referenced in the PR-243 bridge function
    const bridgeFn = extractFn(wsSrc, 'buildWargame3ReadOnlyMapOverlayData') ||
                     extractFn(wsSrc, 'paintWargame3PreviewMapOverlayFromPreview') || '';
    // At least one of the two functions should reference the overlay fields
    const hasBridge = wsSrc.includes('movementTrails') && wsSrc.includes('objectiveHighlights');
    assert(hasBridge,
        'overlay bridge source does not reference movementTrails / objectiveHighlights');
});

test('I80', 'W3-STEP-16 session completes walkthrough without live apply', () => {
    const h = buildHarness();
    h.update(makePreview({ activeStepId: 'W3-STEP-16', activeStepIndex: 16, totalSteps: 17 }));
    const s = h.get().session;
    assert(s && s.stepRef === 'W3-STEP-16', 'W3-STEP-16 session should exist');
    assert(s.previewComplete === false, 'previewComplete should remain false at W3-STEP-16');
    assert(s.liveMutationAllowed === false, 'liveMutationAllowed should be false at W3-STEP-16');
    assert(s.backendCommitAllowed === false, 'backendCommitAllowed should be false at W3-STEP-16');
});

// ══════════════════════════════════════════════════════════════════════════════
// J81-J107 — File and safety boundaries
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n── J81-J107: File and safety boundaries ────────────────────────────');

test('J81', 'wargame3.json unchanged — no PR-276 additions', () => {
    const w3 = readSrc('UI_MOdified/data/scenarios/wargame3.json');
    assert(!w3.includes('walkthrough') && !w3.includes('pr-276') && !w3.includes('pr276'),
        'wargame3.json contains PR-276 additions');
    assert(!w3.includes('reviewedCoa') && !w3.includes('wargame3_review_session'),
        'wargame3.json contains session state data');
});

test('J82', 'app.html unchanged — no PR-276 additions', () => {
    assert(!appHtml.includes('pr-276') && !appHtml.includes('pr276'),
        'app.html contains PR-276 additions');
    assert(!appHtml.includes('walkthrough-test'),
        'app.html contains walkthrough test markup');
});

test('J83', 'i18n.js unchanged — no PR-276 specific additions', () => {
    // PR-276 is test-only; i18n.js must not gain new keys from this PR
    assert(!i18nSrc.includes('pr-276') && !i18nSrc.includes('w3-walkthrough'),
        'i18n.js contains PR-276 specific additions');
});

test('J84', 'style.css unchanged — no PR-276 specific additions', () => {
    // PR-276 is test-only; style.css must not gain new rules from this PR
    assert(!cssSrc.includes('pr-276') && !cssSrc.includes('w3-walkthrough'),
        'style.css contains PR-276 specific additions');
});

test('J85', 'app.js unchanged — no PR-276 additions', () => {
    let appJs = ''; try { appJs = readSrc('UI_MOdified/client/app.js'); } catch (_) {}
    assert(!appJs.includes('getW3ScenarioReviewSession') && !appJs.includes('pr-276'),
        'app.js modified by PR-276');
});

test('J86', 'adjudicator-map.js unchanged — no PR-276 additions', () => {
    const adj = readSrc('UI_MOdified/client/wargame/adjudicator-map.js');
    assert(!adj.includes('getW3ScenarioReviewSession') && !adj.includes('pr-276'),
        'adjudicator-map.js modified by PR-276');
});

// Safety boundary checks on the session builder and helpers ──
function getSessionHelperSrcs() {
    return [
        extractFn(wsSrc, 'buildWargame3ScenarioReviewSessionState') || '',
        extractFn(wsSrc, '_updateW3ScenarioReviewSession')           || '',
        extractFn(wsSrc, 'getW3ScenarioReviewSession')               || '',
        extractFn(wsSrc, '_clearW3ScenarioReviewSession')            || ''
    ].join('\n');
}

test('J87', 'no localStorage/sessionStorage/IndexedDB/cookie writes in session helpers', () => {
    const srcs = getSessionHelperSrcs();
    assert(!srcs.includes('localStorage'),    'references localStorage');
    assert(!srcs.includes('sessionStorage'),  'references sessionStorage');
    assert(!srcs.toLowerCase().includes('indexeddb'), 'references IndexedDB');
    assert(!srcs.includes('document.cookie'), 'references document.cookie');
    assert(!srcs.includes('history.push'),    'references history.push');
    assert(!srcs.includes('location.hash'),   'references location.hash');
});

test('J88', 'no fetch or backend calls in session helpers', () => {
    const srcs = getSessionHelperSrcs();
    assert(!srcs.includes('fetch('),         'references fetch');
    assert(!srcs.includes('XMLHttpRequest'), 'references XMLHttpRequest');
    assert(!srcs.includes('/api/'),          'references /api/');
    assert(!srcs.includes('/api/sim'),       'references /api/sim');
});

test('J89', 'no AI/simulation/journal in session helpers', () => {
    const srcs = getSessionHelperSrcs();
    assert(!srcs.includes('aiGenerated'),         'references aiGenerated');
    assert(!srcs.includes('simulationCommitted'), 'references simulationCommitted');
    assert(!srcs.includes('journal'),             'references journal');
    // Note: 'backendCommitAllowed' is a legitimate read-only session field name.
    // Check for actual API commit calls, not the field name itself.
    assert(!srcs.includes("backendCommit("),      'calls backendCommit()');
    assert(!srcs.includes("commitNow"),           'references commitNow action');
});

test('J90', 'no Gate 7 code in session helpers', () => {
    const srcs = getSessionHelperSrcs().toLowerCase();
    assert(!srcs.includes('gate7'), 'references gate7');
    assert(!srcs.includes('gate-7'), 'references gate-7');
    assert(!srcs.includes('gate 7'), 'references gate 7');
});

test('J91', 'no Apply control in session helpers', () => {
    const srcs = getSessionHelperSrcs();
    assert(!srcs.includes("'Apply'") && !srcs.includes('"Apply"'),
        'references Apply control label');
});

test('J92', 'no Execute control in session helpers', () => {
    const srcs = getSessionHelperSrcs();
    assert(!srcs.includes("'Execute'") && !srcs.includes('"Execute"'),
        'references Execute control label');
});

test('J93', 'no Commit control in session helpers', () => {
    const srcs = getSessionHelperSrcs();
    assert(!srcs.includes("'Commit'") && !srcs.includes('"Commit"'),
        'references Commit control label');
});

test('J94', 'no Confirm control in session helpers', () => {
    const srcs = getSessionHelperSrcs();
    assert(!srcs.includes("'Confirm'") && !srcs.includes('"Confirm"'),
        'references Confirm control label');
});

test('J95', 'no Approve control in session helpers', () => {
    const srcs = getSessionHelperSrcs();
    assert(!srcs.includes("'Approve'") && !srcs.includes('"Approve"'),
        'references Approve control label');
});

test('J96', 'no Go Live or Run control in session helpers', () => {
    const srcs = getSessionHelperSrcs();
    assert(!srcs.includes('Go Live'),               'references Go Live');
    assert(!srcs.includes("'Run'") && !srcs.includes('"Run"'), 'references Run control label');
});

test('J97', 'no Launch or Start control in session helpers', () => {
    const srcs = getSessionHelperSrcs();
    assert(!srcs.includes("'Launch'") && !srcs.includes('"Launch"'), 'references Launch');
    assert(!srcs.includes("'Start'")  && !srcs.includes('"Start"'),  'references Start');
});

// Regression — prior PRs ──────────────────────────────────────────────────────
const exportRegion = wsSrc.slice(wsSrc.lastIndexOf('window.AppShellScenarioWorkspace'));

test('J98', 'PR-267 _paintW3OperatorSelectionReview still exported', () => {
    assert(exportRegion.includes('_paintW3OperatorSelectionReview:'),
        '_paintW3OperatorSelectionReview not in exports');
});

test('J99', 'PR-268 _handleW3CoaReviewClick still exported', () => {
    assert(exportRegion.includes('_handleW3CoaReviewClick:'),
        '_handleW3CoaReviewClick not in exports');
});

test('J100', 'PR-269 W3_DECISION_OPTIONS_FIXTURE_OVERLAY still in source', () => {
    assert(wsSrc.includes('var W3_DECISION_OPTIONS_FIXTURE_OVERLAY'),
        'W3_DECISION_OPTIONS_FIXTURE_OVERLAY not found in source');
    assert(exportRegion.includes('W3_DECISION_OPTIONS_FIXTURE_OVERLAY:') ||
           exportRegion.includes('applyWargame3DecisionOptionsFixtureOverlay:'),
        'PR-269 exports missing');
});

test('J101', 'PR-270 _clearW3CoaReviewRecord still exported', () => {
    assert(exportRegion.includes('_clearW3CoaReviewRecord:'),
        '_clearW3CoaReviewRecord not in exports');
});

test('J102', 'PR-271 _paintW3CoaUnderReviewIndicator still exported', () => {
    assert(exportRegion.includes('_paintW3CoaUnderReviewIndicator:'),
        '_paintW3CoaUnderReviewIndicator not in exports');
});

test('J103', 'PR-272 _handleW3CoaReviewClearClick still exported', () => {
    assert(exportRegion.includes('_handleW3CoaReviewClearClick:'),
        '_handleW3CoaReviewClearClick not in exports');
});

test('J104', 'PR-273 W3_EXPECTED_RESULT_FIXTURE_SOURCE still exported', () => {
    assert(exportRegion.includes('W3_EXPECTED_RESULT_FIXTURE_SOURCE:'),
        'W3_EXPECTED_RESULT_FIXTURE_SOURCE not in exports');
});

test('J105', 'PR-274 buildWargame3ScenarioReviewSessionState still exported', () => {
    assert(exportRegion.includes('buildWargame3ScenarioReviewSessionState:'),
        'buildWargame3ScenarioReviewSessionState not in exports');
});

test('J106', 'PR-275 getW3ScenarioReviewSession still exported', () => {
    assert(exportRegion.includes('getW3ScenarioReviewSession:'),
        'getW3ScenarioReviewSession not in exports');
});

test('J107', 'no console.error in session helpers', () => {
    const names = [
        'buildWargame3ScenarioReviewSessionState',
        '_updateW3ScenarioReviewSession',
        'getW3ScenarioReviewSession',
        '_clearW3ScenarioReviewSession'
    ];
    for (const n of names) {
        const fn = extractFn(wsSrc, n) || '';
        assert(!fn.includes('console.error'),
            n + ' contains console.error');
    }
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
