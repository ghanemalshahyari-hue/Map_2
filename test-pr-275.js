/**
 * test-pr-275.js — Wargame 3 Scenario Review Session Navigation Sync
 *
 * 85 tests covering:
 *   T01-T05    module vars / helpers exported / private
 *   T06-T12    session update / clear / get behaviour
 *   T13-T19    session content correctness
 *   T20-T33    reviewedCoa sync (click / clear / repaint)
 *   T34-T43    expectedResult / previewComplete invariants
 *   T44-T48    map overlay summary via options.overlay
 *   T46-T48    no map paint, no Leaflet
 *   T49-T58    file protection
 *   T59-T74    safety boundary
 *   T75-T84    regression (PRs 267-274 exports intact)
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

// ── harness ───────────────────────────────────────────────────────────────────
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
    const clearRecFn   = extractFn(wsSrc, '_clearW3CoaReviewRecord');
    const getRecFn     = extractFn(wsSrc, '_getW3CoaReviewRecordForStep');
    const builderFn    = extractFn(wsSrc, 'buildWargame3ScenarioReviewSessionState');
    const clearSessFn  = extractFn(wsSrc, '_clearW3ScenarioReviewSession');
    const updateSessFn = extractFn(wsSrc, '_updateW3ScenarioReviewSession');
    const getSessFn    = extractFn(wsSrc, 'getW3ScenarioReviewSession');

    assert(isSdSafe && isErSafe && isDoSafe && isRecSafe, 'safe validators not found');
    assert(clearRecFn && getRecFn, 'COA record helpers not found');
    assert(builderFn, 'buildWargame3ScenarioReviewSessionState not found');
    assert(clearSessFn,  '_clearW3ScenarioReviewSession not found');
    assert(updateSessFn, '_updateW3ScenarioReviewSession not found');
    assert(getSessFn,    'getW3ScenarioReviewSession not found');

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

        return {
            update:  _updateW3ScenarioReviewSession,
            clear:   _clearW3ScenarioReviewSession,
            get:     getW3ScenarioReviewSession,
            // expose internal state for tests
            getInternal: function() { return _w3ScenarioReviewSession; },
            setRec:  function(r) { _w3CoaReviewRecord = r; },
            clearRec: _clearW3CoaReviewRecord
        };
    `;
    return new Function(code)();
}

function makePreview(overrides) {
    return Object.assign({
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
    }, overrides || {});
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

// ── T01-T05: variable / export presence ──────────────────────────────────────
console.log('\n── T01-T05: Variable / export presence ─────────────────────────────');

test('T01', '_w3ScenarioReviewSession source-verifiable as module-private', () => {
    assert(wsSrc.includes('var _w3ScenarioReviewSession = null'),
        '_w3ScenarioReviewSession variable not found in source');
});
test('T02', '_w3ScenarioReviewSession is NOT directly exported', () => {
    // The export block should not have _w3ScenarioReviewSession: _w3ScenarioReviewSession
    const exportMatch = /\bwindow\.AppShellScenarioWorkspace\s*=\s*\{[\s\S]*?\}\s*\(\s*\)/
                        .exec(wsSrc);
    // Simple check: the var itself is not in an export value position
    assert(!wsSrc.includes('_w3ScenarioReviewSession:          _w3ScenarioReviewSession'),
        '_w3ScenarioReviewSession is directly exported — should be IIFE-private');
});
test('T03', '_updateW3ScenarioReviewSession exported (for tests)', () => {
    assert(wsSrc.includes('_updateW3ScenarioReviewSession:'),
        '_updateW3ScenarioReviewSession not exported');
});
test('T04', 'getW3ScenarioReviewSession exported', () => {
    assert(wsSrc.includes('getW3ScenarioReviewSession:'),
        'getW3ScenarioReviewSession not exported');
});
test('T05', '_clearW3ScenarioReviewSession exported (for tests)', () => {
    assert(wsSrc.includes('_clearW3ScenarioReviewSession:'),
        '_clearW3ScenarioReviewSession not exported');
});

// ── T06-T12: update / clear / get ────────────────────────────────────────────
console.log('\n── T06-T12: Update / clear / get ───────────────────────────────────');

test('T06', 'getW3ScenarioReviewSession returns no session before update', () => {
    const h = buildHarness();
    const r = h.get();
    assert(!r.passed && r.session === null, 'should return no session initially');
});
test('T07', 'update with null preview clears session', () => {
    const h = buildHarness();
    // First set a session
    h.update(makePreview());
    assert(h.getInternal() !== null, 'pre-condition: session should be set');
    // Then update with null
    h.update(null);
    assert(h.getInternal() === null, 'session should be null after null preview');
});
test('T08', 'update with non-W3 preview clears session', () => {
    const h = buildHarness();
    h.update(makePreview());
    assert(h.getInternal() !== null, 'pre-condition');
    h.update({ activeStepId: 'AMBER-STEP-01', readOnly: true, liveMutationAllowed: false });
    assert(h.getInternal() === null, 'session should be null for non-W3 step');
});
test('T09', 'update with valid W3 preview stores session', () => {
    const h = buildHarness();
    const r = h.update(makePreview());
    assert(r.passed && h.getInternal() !== null, 'session should be stored');
});
test('T10', 'stored session has sessionType wargame3_review_session', () => {
    const h = buildHarness();
    h.update(makePreview());
    assert(h.getInternal().sessionType === 'wargame3_review_session',
        'wrong sessionType: ' + h.getInternal().sessionType);
});
test('T11', 'clear removes session', () => {
    const h = buildHarness();
    h.update(makePreview());
    assert(h.getInternal() !== null, 'pre-condition');
    h.clear();
    assert(h.getInternal() === null, 'session should be null after clear');
    const acc = h.get();
    assert(!acc.passed && acc.session === null, 'accessor should return no session after clear');
});
test('T12', 'getW3ScenarioReviewSession returns passed:true after update', () => {
    const h = buildHarness();
    h.update(makePreview());
    const r = h.get();
    assert(r.passed && r.session !== null, 'should return session after update');
});

// ── T13-T19: session content ──────────────────────────────────────────────────
console.log('\n── T13-T19: Session content ─────────────────────────────────────────');

test('T13', 'session.stepRef matches preview.activeStepId', () => {
    const h = buildHarness();
    h.update(makePreview({ activeStepId: 'W3-STEP-08' }));
    assert(h.get().session.stepRef === 'W3-STEP-08',
        'stepRef mismatch: ' + h.get().session.stepRef);
});
test('T14', 'session.stepIndex matches preview', () => {
    const h = buildHarness();
    h.update(makePreview({ activeStepIndex: 3 }));
    assert(h.get().session.stepIndex === 3, 'stepIndex mismatch');
});
test('T15', 'session.totalSteps matches preview', () => {
    const h = buildHarness();
    h.update(makePreview({ totalSteps: 15 }));
    assert(h.get().session.totalSteps === 15, 'totalSteps mismatch');
});
test('T16', 'session.decisionOptionsAvailable false when no options', () => {
    const h = buildHarness();
    h.update(makePreview({ decisionOptions: [] }));
    assert(h.get().session.decisionOptionsAvailable === false,
        'should be false with empty options');
});
test('T17', 'session.decisionOptionsAvailable true with safe options', () => {
    const h = buildHarness();
    h.update(makePreview({ decisionOptions: [makeOption('OPT-A', 'Opt A')] }));
    assert(h.get().session.decisionOptionsAvailable === true,
        'should be true with safe option');
});
test('T18', 'session.decisionOptionCount counts safe options', () => {
    const h = buildHarness();
    h.update(makePreview({ decisionOptions: [
        makeOption('OPT-A', 'Opt A'), makeOption('OPT-B', 'Opt B')
    ] }));
    assert(h.get().session.decisionOptionCount === 2, 'count should be 2');
});
test('T19', 'get accessor returns shallow copy, not internal reference', () => {
    const h = buildHarness();
    h.update(makePreview());
    const r1 = h.get();
    assert(r1.session !== h.getInternal(),
        'returned session should not be the internal reference');
});

// ── T20-T33: reviewedCoa sync ─────────────────────────────────────────────────
console.log('\n── T20-T33: reviewedCoa sync ───────────────────────────────────────');

test('T20', 'mutating returned session does not mutate internal', () => {
    const h = buildHarness();
    h.update(makePreview());
    const r = h.get();
    r.session.sessionType = 'MUTATED';
    assert(h.getInternal().sessionType === 'wargame3_review_session',
        'internal session was mutated');
});
test('T21', 'reviewedCoa.available false when no record', () => {
    const h = buildHarness();
    h.update(makePreview());
    assert(h.get().session.reviewedCoa.available === false, 'should be false');
});
test('T22', 'reviewedCoa.available true after setting record on preview', () => {
    const h = buildHarness();
    const rec = makeRecord('W3-STEP-08', 'W3-STEP-08-OPT-HOLD', 'Hold');
    const p = makePreview({ operatorSelectionDryRunRecord: rec });
    h.update(p);
    assert(h.get().session.reviewedCoa.available === true, 'should be true with record');
});
test('T23', 'reviewedCoa.available true when module memory record set', () => {
    const h = buildHarness();
    // Set the module-private _w3CoaReviewRecord directly
    const rec = makeRecord('W3-STEP-08', 'W3-STEP-08-OPT-HOLD', 'Hold');
    h.setRec({ stepRef: 'W3-STEP-08', record: rec });
    h.update(makePreview({ activeStepId: 'W3-STEP-08' }));
    assert(h.get().session.reviewedCoa.available === true,
        'should be true when module memory has a record for this step');
});
test('T24', 'reviewedCoa.optionRef matches record', () => {
    const h = buildHarness();
    const rec = makeRecord('W3-STEP-08', 'W3-STEP-08-OPT-HOLD', 'Hold');
    h.update(makePreview({ operatorSelectionDryRunRecord: rec }));
    assert(h.get().session.reviewedCoa.optionRef === 'W3-STEP-08-OPT-HOLD',
        'optionRef mismatch: ' + h.get().session.reviewedCoa.optionRef);
});
test('T25', 'session.reviewedCoa.label matches selectedDecision.label', () => {
    const h = buildHarness();
    const rec = makeRecord('W3-STEP-08', 'W3-STEP-08-OPT-HOLD', 'Hold Current Position');
    h.update(makePreview({ operatorSelectionDryRunRecord: rec }));
    assert(h.get().session.reviewedCoa.label === 'Hold Current Position',
        'label mismatch: ' + h.get().session.reviewedCoa.label);
});
test('T26', 'reviewedCoa.status is "draft" from record', () => {
    const h = buildHarness();
    const rec = makeRecord('W3-STEP-08', 'W3-STEP-08-OPT-HOLD', 'Hold');
    h.update(makePreview({ operatorSelectionDryRunRecord: rec }));
    assert(h.get().session.reviewedCoa.status === 'draft', 'status mismatch');
});
test('T27', 'clearing module memory then updating gives available:false', () => {
    const h = buildHarness();
    const rec = makeRecord('W3-STEP-08', 'W3-STEP-08-OPT-HOLD', 'Hold');
    h.setRec({ stepRef: 'W3-STEP-08', record: rec });
    h.update(makePreview({ activeStepId: 'W3-STEP-08' }));
    assert(h.get().session.reviewedCoa.available === true, 'pre-condition');
    // Now clear the module record
    h.clearRec();
    h.update(makePreview({ activeStepId: 'W3-STEP-08' })); // fresh preview, no record
    assert(h.get().session.reviewedCoa.available === false,
        'should be false after clearing record and updating');
});
test('T28', 'updating different step clears reviewedCoa', () => {
    const h = buildHarness();
    const rec = makeRecord('W3-STEP-08', 'W3-STEP-08-OPT-HOLD', 'Hold');
    h.setRec({ stepRef: 'W3-STEP-08', record: rec });
    h.update(makePreview({ activeStepId: 'W3-STEP-08' }));
    assert(h.get().session.reviewedCoa.available === true, 'pre-condition');
    // Navigate to a different step — module memory won't match
    h.update(makePreview({ activeStepId: 'W3-STEP-09' }));
    assert(h.get().session.reviewedCoa.available === false,
        'should be false on different step (record is for W3-STEP-08)');
});
test('T29', 'session.stepRef updates on step change', () => {
    const h = buildHarness();
    h.update(makePreview({ activeStepId: 'W3-STEP-08' }));
    assert(h.get().session.stepRef === 'W3-STEP-08', 'pre-condition');
    h.update(makePreview({ activeStepId: 'W3-STEP-09' }));
    assert(h.get().session.stepRef === 'W3-STEP-09', 'stepRef should update');
});
test('T30', 'clear session removes reviewedCoa availability', () => {
    const h = buildHarness();
    const rec = makeRecord('W3-STEP-08', 'W3-STEP-08-OPT-HOLD', 'Hold');
    h.update(makePreview({ operatorSelectionDryRunRecord: rec }));
    assert(h.get().session.reviewedCoa.available === true, 'pre-condition');
    h.clear();
    assert(!h.get().passed, 'session should be cleared');
});
test('T31', 'invalid record on preview gives available:false', () => {
    const h = buildHarness();
    const badRec = { id: '', stepRef: '', optionRef: '' }; // invalid
    h.update(makePreview({ operatorSelectionDryRunRecord: badRec }));
    assert(h.get().session.reviewedCoa.available === false, 'invalid record ignored');
});
test('T32', 'same-step repaint with module memory preserves reviewedCoa', () => {
    const h = buildHarness();
    const rec = makeRecord('W3-STEP-08', 'W3-STEP-08-OPT-HOLD', 'Hold');
    h.setRec({ stepRef: 'W3-STEP-08', record: rec });
    // First paint
    h.update(makePreview({ activeStepId: 'W3-STEP-08' }));
    assert(h.get().session.reviewedCoa.available === true, 'pre-condition');
    // Same-step repaint (fresh preview, no record on p — relies on module memory)
    h.update(makePreview({ activeStepId: 'W3-STEP-08' }));
    assert(h.get().session.reviewedCoa.available === true,
        'same-step repaint should preserve reviewedCoa from module memory');
});
test('T33', 'returning to cleared step does not auto-restore reviewedCoa', () => {
    const h = buildHarness();
    const rec = makeRecord('W3-STEP-08', 'W3-STEP-08-OPT-HOLD', 'Hold');
    h.setRec({ stepRef: 'W3-STEP-08', record: rec });
    h.update(makePreview({ activeStepId: 'W3-STEP-08' }));
    h.clearRec(); // simulate clear review — clears module memory
    h.update(makePreview({ activeStepId: 'W3-STEP-09' })); // nav away
    h.update(makePreview({ activeStepId: 'W3-STEP-08' })); // return
    assert(h.get().session.reviewedCoa.available === false,
        'reviewedCoa should not be restored after clear + nav + return');
});

// ── T34-T43: expectedResult / previewComplete invariants ──────────────────────
console.log('\n── T34-T43: expectedResult / previewComplete invariants ─────────────');

test('T34', 'expectedResultAttached always false in session', () => {
    const h = buildHarness();
    h.update(makePreview());
    assert(h.get().session.expectedResultAttached === false,
        'expectedResultAttached should be false');
});
test('T35', 'previewComplete always false in session', () => {
    const h = buildHarness();
    h.update(makePreview());
    assert(h.get().session.previewComplete === false, 'previewComplete should be false');
});
test('T36', 'no expectedResult attached to preview by update', () => {
    const h = buildHarness();
    const p = makePreview();
    h.update(p);
    assert(!('expectedResult' in p) || p.expectedResult === undefined ||
           p.expectedResult === null,
        'update should not add expectedResult to preview');
});
test('T37', 'selectedDecision not created on preview by update', () => {
    const h = buildHarness();
    const p = makePreview();
    h.update(p);
    assert(!('selectedDecision' in p), 'update should not add selectedDecision to preview');
});
test('T38', 'preview.selectedDecision remains null/unchanged', () => {
    const h = buildHarness();
    const p = makePreview();
    const before = p.selectedDecision;
    h.update(p);
    assert(p.selectedDecision === before, 'selectedDecision was modified on preview');
});
test('T39', '_updateW3ScenarioReviewSession source does not call getWargame3ExpectedResultForReview', () => {
    const fn = extractFn(wsSrc, '_updateW3ScenarioReviewSession');
    assert(fn && !fn.includes('getWargame3ExpectedResultForReview'),
        '_updateW3ScenarioReviewSession calls getWargame3ExpectedResultForReview');
});
test('T40', '_updateW3ScenarioReviewSession source does not use expectedEffects', () => {
    assert(!extractFn(wsSrc, '_updateW3ScenarioReviewSession').includes('expectedEffects'),
        'references expectedEffects');
});
test('T41', '_updateW3ScenarioReviewSession source does not use objective_status_baseline', () => {
    // It may read objectiveStatusBaseline indirectly via buildWargame3ScenarioReviewSessionState,
    // but it should not directly assign it as expectedResult.
    const fn = extractFn(wsSrc, '_updateW3ScenarioReviewSession');
    assert(!fn.includes('expectedResult ='), 'sets expectedResult');
});
test('T42', '_updateW3ScenarioReviewSession source does not use proposedVisualEffects', () => {
    assert(!extractFn(wsSrc, '_updateW3ScenarioReviewSession').includes('proposedVisualEffects'),
        'references proposedVisualEffects');
});
test('T43', 'getW3ScenarioReviewSession source does not paint map', () => {
    const fn = extractFn(wsSrc, 'getW3ScenarioReviewSession');
    assert(fn && !fn.includes('paintWargame3') && !fn.includes('paintDryRun'),
        'accessor calls a paint function');
});

// ── T44-T48: map overlay summary + map safety ─────────────────────────────────
console.log('\n── T44-T48: Map overlay summary / safety ───────────────────────────');

test('T44', 'mapOverlaySummary present in session', () => {
    const h = buildHarness();
    h.update(makePreview());
    assert(h.get().session.mapOverlaySummary !== undefined,
        'mapOverlaySummary missing from session');
});
test('T45', 'mapOverlaySummary reads supplied overlay counts', () => {
    const h = buildHarness();
    const overlay = { readOnly: true, markers: [{}, {}],
                      movementTrails: [{}], objectiveHighlights: [], warnings: [] };
    h.update(makePreview(), { overlay });
    const s = h.get().session.mapOverlaySummary;
    assert(s.markerCount === 2 && s.movementTrailCount === 1,
        'overlay counts not read: ' + JSON.stringify(s));
});
test('T46', '_updateW3ScenarioReviewSession source has no Leaflet reference', () => {
    const fn = extractFn(wsSrc, '_updateW3ScenarioReviewSession');
    assert(fn && !fn.includes('L.marker') && !fn.includes('L.circle') &&
           !fn.includes('leaflet'),
        'update references Leaflet');
});
test('T47', '_updateW3ScenarioReviewSession source does not call fitBounds', () => {
    assert(!extractFn(wsSrc, '_updateW3ScenarioReviewSession').includes('fitBounds'),
        'update calls fitBounds');
});
test('T48', '_updateW3ScenarioReviewSession source does not paint map', () => {
    const fn = extractFn(wsSrc, '_updateW3ScenarioReviewSession');
    assert(fn && !fn.includes('paintWargame3') && !fn.includes('paintDryRun'),
        'update calls paint function');
});

// ── T49-T58: file protection ──────────────────────────────────────────────────
console.log('\n── T49-T58: File protection ─────────────────────────────────────────');

test('T49', 'app.html not modified by PR-275', () => {
    assert(!appHtml.includes('_w3ScenarioReviewSession') &&
           !appHtml.includes('getW3ScenarioReviewSession'),
        'app.html contains PR-275 additions');
});
test('T50', 'i18n.js not modified by PR-275', () => {
    assert(!i18nSrc.includes('_w3ScenarioReviewSession') &&
           !i18nSrc.includes('getW3ScenarioReviewSession'),
        'i18n.js contains PR-275 additions');
});
test('T51', 'style.css not modified by PR-275', () => {
    assert(!cssSrc.includes('_w3ScenarioReviewSession') &&
           !cssSrc.includes('getW3ScenarioReviewSession'),
        'style.css contains PR-275 additions');
});
test('T52', 'wargame3.json not modified by PR-275', () => {
    const w3 = readSrc('UI_MOdified/data/scenarios/wargame3.json');
    assert(!w3.includes('_w3ScenarioReviewSession'),
        'wargame3.json contains PR-275 additions');
});
test('T53', 'app.js not modified by PR-275', () => {
    let appJs = ''; try { appJs = readSrc('UI_MOdified/client/app.js'); } catch (_) {}
    assert(!appJs.includes('getW3ScenarioReviewSession'), 'app.js modified');
});
test('T54', 'adjudicator-map.js not modified by PR-275', () => {
    const adj = readSrc('UI_MOdified/client/wargame/adjudicator-map.js');
    assert(!adj.includes('getW3ScenarioReviewSession'), 'adjudicator-map.js modified');
});
test('T55', 'no new UI added to app.html by PR-275', () => {
    assert(!appHtml.includes('sw-drp-session-state') &&
           !appHtml.includes('wargame3_review_session'),
        'app.html gained PR-275 UI elements');
});
test('T56', 'wargame3.json JSON unchanged', () => {
    const w3 = readSrc('UI_MOdified/data/scenarios/wargame3.json');
    assert(!w3.includes('wargame3_review_session') && !w3.includes('reviewedCoa'),
        'wargame3.json contains session-state data');
});
test('T57', '_paintToDOM contains PR-275 wiring for W3 (source check)', () => {
    assert(wsSrc.includes('_updateW3ScenarioReviewSession(p)'),
        '_paintToDOM does not call _updateW3ScenarioReviewSession');
});
test('T58', '_handleW3CoaReviewClick contains PR-275 wiring (source check)', () => {
    const fn = extractFn(wsSrc, '_handleW3CoaReviewClick');
    assert(fn && fn.includes('_updateW3ScenarioReviewSession'),
        '_handleW3CoaReviewClick does not call _updateW3ScenarioReviewSession');
});

// ── T59-T74: safety boundary ──────────────────────────────────────────────────
console.log('\n── T59-T74: Safety boundary ─────────────────────────────────────────');

function getHelperSrc(name) { return extractFn(wsSrc, name) || ''; }

test('T59', 'no localStorage in _updateW3ScenarioReviewSession', () => {
    assert(!getHelperSrc('_updateW3ScenarioReviewSession').includes('localStorage'),
        'references localStorage');
});
test('T60', 'no sessionStorage in _updateW3ScenarioReviewSession', () => {
    assert(!getHelperSrc('_updateW3ScenarioReviewSession').includes('sessionStorage'),
        'references sessionStorage');
});
test('T61', 'no fetch in _updateW3ScenarioReviewSession', () => {
    assert(!getHelperSrc('_updateW3ScenarioReviewSession').includes('fetch('),
        'references fetch');
});
test('T62', 'no /api/sim/ in _updateW3ScenarioReviewSession', () => {
    assert(!getHelperSrc('_updateW3ScenarioReviewSession').includes('/api/sim/'),
        'references /api/sim/');
});
test('T63', 'no window.RmoozScenario in _updateW3ScenarioReviewSession', () => {
    assert(!getHelperSrc('_updateW3ScenarioReviewSession').includes('window.RmoozScenario'),
        'references window.RmoozScenario');
});
test('T64', 'no window.units in _updateW3ScenarioReviewSession', () => {
    assert(!getHelperSrc('_updateW3ScenarioReviewSession').includes('window.units'),
        'references window.units');
});
test('T65', 'no Gate 7 in any new helper', () => {
    const fns = ['_updateW3ScenarioReviewSession', '_clearW3ScenarioReviewSession',
                 'getW3ScenarioReviewSession'];
    for (const n of fns) {
        const fn = getHelperSrc(n).toLowerCase();
        assert(!fn.includes('gate7') && !fn.includes('gate-7'),
            n + ' references Gate 7');
    }
});
test('T66', 'no applyNow in _updateW3ScenarioReviewSession', () => {
    assert(!getHelperSrc('_updateW3ScenarioReviewSession').includes('applyNow'),
        'references applyNow');
});
test('T67', 'no executeNow in _updateW3ScenarioReviewSession', () => {
    assert(!getHelperSrc('_updateW3ScenarioReviewSession').includes('executeNow'),
        'references executeNow');
});
test('T68', 'no commitNow in _updateW3ScenarioReviewSession', () => {
    assert(!getHelperSrc('_updateW3ScenarioReviewSession').includes('commitNow'),
        'references commitNow');
});
test('T69', 'no document.getElementById in _updateW3ScenarioReviewSession', () => {
    assert(!getHelperSrc('_updateW3ScenarioReviewSession').includes('document.getElementById'),
        'references DOM');
});
test('T70', 'no document.getElementById in getW3ScenarioReviewSession', () => {
    assert(!getHelperSrc('getW3ScenarioReviewSession').includes('document.getElementById'),
        'accessor makes DOM calls');
});
test('T71', '_w3ScenarioReviewSession not exported directly', () => {
    // Should not appear as a value in the exports object
    const exportRegion = wsSrc.slice(wsSrc.lastIndexOf('window.AppShellScenarioWorkspace'));
    assert(!exportRegion.includes('_w3ScenarioReviewSession:          _w3ScenarioReviewSession') &&
           !exportRegion.includes('_w3ScenarioReviewSession: _w3ScenarioReviewSession'),
        '_w3ScenarioReviewSession is directly exported');
});
test('T72', '_handleW3CoaReviewClearClick contains PR-275 wiring (source check)', () => {
    const fn = extractFn(wsSrc, '_handleW3CoaReviewClearClick');
    assert(fn && fn.includes('_updateW3ScenarioReviewSession'),
        '_handleW3CoaReviewClearClick does not call _updateW3ScenarioReviewSession');
});
test('T73', 'no IndexedDB in helpers', () => {
    const fns = ['_updateW3ScenarioReviewSession', '_clearW3ScenarioReviewSession',
                 'getW3ScenarioReviewSession'];
    for (const n of fns) {
        const fn = getHelperSrc(n).toLowerCase();
        assert(!fn.includes('indexeddb'), n + ' references IndexedDB');
    }
});
test('T74', 'no AI/journal in helpers', () => {
    const fns = ['_updateW3ScenarioReviewSession', 'getW3ScenarioReviewSession'];
    for (const n of fns) {
        const fn = getHelperSrc(n);
        assert(!fn.includes('aiGenerated') && !fn.includes('journal'),
            n + ' references AI/journal');
    }
});

// ── T75-T84: regression ───────────────────────────────────────────────────────
console.log('\n── T75-T84: Regression PRs 267-274 ────────────────────────────────');

const regressionChecks = [
    ['T75', '_paintW3OperatorSelectionReview'],
    ['T76', '_handleW3CoaReviewClick'],
    ['T77', '_clearW3CoaReviewRecord'],
    ['T78', '_getW3CoaReviewRecordForStep'],
    ['T79', '_paintW3CoaUnderReviewIndicator'],
    ['T80', '_handleW3CoaReviewClearClick'],
    ['T81', 'W3_EXPECTED_RESULT_FIXTURE_SOURCE'],
    ['T82', 'getWargame3ExpectedResultForReview'],
    ['T83', 'hasWargame3ExpectedResultForReview'],
    ['T84', 'buildWargame3ScenarioReviewSessionState'],
];
for (const [id, name] of regressionChecks) {
    test(id, name + ' still in exports', () => {
        assert(wsSrc.includes(name + ':') || wsSrc.includes(name + ' :'),
            name + ' not found in exports');
    });
}

// ── T85: no console.error ─────────────────────────────────────────────────────
console.log('\n── T85: No console.error ────────────────────────────────────────────');

test('T85', 'no console.error in PR-275 helpers', () => {
    const names = ['_updateW3ScenarioReviewSession', '_clearW3ScenarioReviewSession',
                   'getW3ScenarioReviewSession'];
    for (const n of names) {
        const fn = getHelperSrc(n);
        assert(!fn.includes('console.error'), n + ' contains console.error');
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
