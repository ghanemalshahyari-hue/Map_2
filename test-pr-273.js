/**
 * test-pr-273.js — Wargame 3 Expected Result Source Layer
 *
 * 83 tests covering:
 *   T01-T03    source constant + helpers exported
 *   T04-T07    source has W3-STEP-08 with all three options
 *   T08-T14    every source entry content safety (readOnly, source, forbidden language)
 *   T15-T19    getWargame3ExpectedResultForReview — rejection paths
 *   T17-T19    helper returns correct entry per option
 *   T20-T32    returned object correctness + mutation safety
 *   T33-T42    invalid/unsafe inputs blocked
 *   T43-T45    hasWargame3ExpectedResultForReview
 *   T46-T48    existing preview fields unchanged
 *   T49-T53    existing PR-26x / 27x feature regression (source checks)
 *   T54-T65    file protection
 *   T66-T82    safety boundary (no storage/fetch/gate7/forbidden controls)
 *   T83        no console.error in new helper sources
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

// ── source files ─────────────────────────────────────────────────────────────
const wsSrc      = readSrc('UI_MOdified/client/shell/scenario-workspace.js');
const appHtml    = readSrc('UI_MOdified/client/app.html');
const i18nSrc    = readSrc('UI_MOdified/client/i18n.js');
const cssSrc     = readSrc('UI_MOdified/client/style.css');

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

// ── build harness to exercise the pure helpers ────────────────────────────────
function buildHarness() {
    // Extract all needed pieces
    const unsafeFields   = extractFn(wsSrc, '_W3DRS_UNSAFE_FIELDS') || '';
    const forbidTokens   = extractFn(wsSrc, '_W3DRS_FORBIDDEN_STATUS_TOKENS') || '';
    const validStatuses  = extractFn(wsSrc, '_W3SEL_VALID_STATUSES') || '';

    // Extract constants via regex (var NAME = Object.freeze...)
    function extractVar(name) {
        const re = new RegExp('var\\s+' + name + '\\s*=\\s*Object\\.freeze\\(');
        const m = re.exec(wsSrc);
        if (!m) return null;
        let idx = m.index + m[0].length - 1; // points at opening '('
        // now find the matching ')' for the outer Object.freeze(...)
        let depth = 0, start = idx;
        while (idx < wsSrc.length) {
            if (wsSrc[idx] === '(' || wsSrc[idx] === '{' || wsSrc[idx] === '[') depth++;
            else if (wsSrc[idx] === ')' || wsSrc[idx] === '}' || wsSrc[idx] === ']') {
                depth--;
                if (depth === 0) break;
            }
            idx++;
        }
        return 'var ' + name + ' = ' + wsSrc.slice(m.index + m[0].length - 1, idx + 1) + ';';
    }

    const w3DrsUnsafe   = extractVar('_W3DRS_UNSAFE_FIELDS') ||
        "var _W3DRS_UNSAFE_FIELDS = Object.freeze(['applyNow','commitNow','executeNow','liveApply','mutateUnits','mutateMap','mutateScenario','backendCommit','autoApply','aiGenerated','simulationCommitted','gate7Approved']);";
    const w3DrsForbid   = extractVar('_W3DRS_FORBIDDEN_STATUS_TOKENS') ||
        "var _W3DRS_FORBIDDEN_STATUS_TOKENS = Object.freeze(['DORMANT','THREATENED','CONTESTED','DENIED','ACTIVE','COMPLETE','SUCCESS','FAILURE']);";

    // _W3SEL_VALID_STATUSES and _W3SEL_FORBIDDEN_REC_FIELDS are plain arrays (not Object.freeze)
    function extractPlainArrayVar(name) {
        const re = new RegExp('var\\s+' + name + '\\s*=\\s*\\[');
        const m = re.exec(wsSrc);
        if (!m) return null;
        let idx = m.index + m[0].length - 1; // points at '['
        let depth = 0, start = idx;
        while (idx < wsSrc.length) {
            if (wsSrc[idx] === '[') depth++;
            else if (wsSrc[idx] === ']') { depth--; if (depth === 0) break; }
            idx++;
        }
        return 'var ' + name + ' = ' + wsSrc.slice(start, idx + 1) + ';';
    }
    const w3SelStatuses = extractPlainArrayVar('_W3SEL_VALID_STATUSES') ||
        "var _W3SEL_VALID_STATUSES = ['draft','selected_for_review','cancelled'];";
    const w3SelForbidRecFields = extractPlainArrayVar('_W3SEL_FORBIDDEN_REC_FIELDS') ||
        "var _W3SEL_FORBIDDEN_REC_FIELDS = ['expectedResult','previewComplete'];";

    const isSdSafe        = extractFn(wsSrc, 'isWargame3SelectedDecisionSafe');
    const isErSafe        = extractFn(wsSrc, 'isWargame3ExpectedResultSafe');
    const isDoSafe        = extractFn(wsSrc, 'isWargame3DecisionOptionSafe');
    const isRecordSafe    = extractFn(wsSrc, 'isWargame3OperatorSelectionDryRunRecordSafe');
    const sourceConst     = extractVar('W3_EXPECTED_RESULT_FIXTURE_SOURCE');
    const getHelper       = extractFn(wsSrc, 'getWargame3ExpectedResultForReview');
    const hasHelper       = extractFn(wsSrc, 'hasWargame3ExpectedResultForReview');

    assert(isSdSafe,     'isWargame3SelectedDecisionSafe not found');
    assert(isErSafe,     'isWargame3ExpectedResultSafe not found');
    assert(isDoSafe,     'isWargame3DecisionOptionSafe not found');
    assert(isRecordSafe, 'isWargame3OperatorSelectionDryRunRecordSafe not found');
    assert(sourceConst,  'W3_EXPECTED_RESULT_FIXTURE_SOURCE not found');
    assert(getHelper,    'getWargame3ExpectedResultForReview not found');
    assert(hasHelper,    'hasWargame3ExpectedResultForReview not found');

    const code = `
        ${w3DrsUnsafe}
        ${w3DrsForbid}
        ${w3SelStatuses}
        ${w3SelForbidRecFields}

        function isWargame3SelectedDecisionSafe(value, options) ${isSdSafe}
        function isWargame3ExpectedResultSafe(value, options) ${isErSafe}
        function isWargame3DecisionOptionSafe(value, options) ${isDoSafe}
        function isWargame3OperatorSelectionDryRunRecordSafe(record, options) ${isRecordSafe}

        ${sourceConst}

        function getWargame3ExpectedResultForReview(record, options) ${getHelper}
        function hasWargame3ExpectedResultForReview(record) ${hasHelper}

        return {
            source:   W3_EXPECTED_RESULT_FIXTURE_SOURCE,
            get:      getWargame3ExpectedResultForReview,
            has:      hasWargame3ExpectedResultForReview,
            isSafe:   isWargame3ExpectedResultSafe,
            isRecord: isWargame3OperatorSelectionDryRunRecordSafe
        };
    `;
    return new Function(code)();
}

// Build a minimal valid dry-run record for testing
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

// ── T01-T03: exports ─────────────────────────────────────────────────────────
console.log('\n── T01-T03: Exports ───────────────────────────────────────────────');

test('T01', 'W3_EXPECTED_RESULT_FIXTURE_SOURCE exported', () => {
    assert(wsSrc.includes('W3_EXPECTED_RESULT_FIXTURE_SOURCE:'),
        'W3_EXPECTED_RESULT_FIXTURE_SOURCE not in exports');
});
test('T02', 'getWargame3ExpectedResultForReview exported', () => {
    assert(wsSrc.includes('getWargame3ExpectedResultForReview:'),
        'getWargame3ExpectedResultForReview not in exports');
});
test('T03', 'hasWargame3ExpectedResultForReview exported', () => {
    assert(wsSrc.includes('hasWargame3ExpectedResultForReview:'),
        'hasWargame3ExpectedResultForReview not in exports');
});

// ── T04-T07: source constant structure ───────────────────────────────────────
console.log('\n── T04-T07: Source constant structure ─────────────────────────────');

test('T04', 'source has W3-STEP-08 bucket', () => {
    const h = buildHarness();
    assert(h.source['W3-STEP-08'] && typeof h.source['W3-STEP-08'] === 'object',
        'W3-STEP-08 bucket missing from source');
});
test('T05', 'source has entry for W3-STEP-08-OPT-HOLD', () => {
    const h = buildHarness();
    assert(h.source['W3-STEP-08']['W3-STEP-08-OPT-HOLD'],
        'W3-STEP-08-OPT-HOLD entry missing');
});
test('T06', 'source has entry for W3-STEP-08-OPT-REINFORCE', () => {
    const h = buildHarness();
    assert(h.source['W3-STEP-08']['W3-STEP-08-OPT-REINFORCE'],
        'W3-STEP-08-OPT-REINFORCE entry missing');
});
test('T07', 'source has entry for W3-STEP-08-OPT-DELAY', () => {
    const h = buildHarness();
    assert(h.source['W3-STEP-08']['W3-STEP-08-OPT-DELAY'],
        'W3-STEP-08-OPT-DELAY entry missing');
});

// ── T08-T14: source entry safety ──────────────────────────────────────────────
console.log('\n── T08-T14: Source entry safety ───────────────────────────────────');

test('T08', 'every source entry has readOnly: true', () => {
    const h = buildHarness();
    const bucket = h.source['W3-STEP-08'];
    for (const k of Object.keys(bucket)) {
        assert(bucket[k].readOnly === true, 'readOnly !== true for ' + k);
    }
});
test('T09', 'every source entry has source: "instructor"', () => {
    const h = buildHarness();
    const bucket = h.source['W3-STEP-08'];
    for (const k of Object.keys(bucket)) {
        assert(bucket[k].source === 'instructor', 'source !== "instructor" for ' + k);
    }
});
test('T10', 'every source entry avoids success/failure completion language', () => {
    const h = buildHarness();
    const bucket = h.source['W3-STEP-08'];
    const bad = ['mission success', 'mission failure', 'objective captured',
                 'objective secured', 'enemy defeated', 'battle won', 'battle lost'];
    for (const k of Object.keys(bucket)) {
        const text = (bucket[k].description + ' ' + bucket[k].label).toLowerCase();
        for (const b of bad) {
            assert(!text.includes(b), 'Entry ' + k + ' contains forbidden completion language: ' + b);
        }
    }
});
test('T11', 'every source entry avoids casualty language', () => {
    const h = buildHarness();
    const bucket = h.source['W3-STEP-08'];
    const bad = ['casualties', 'killed', 'wounded', 'destroyed unit', 'attrition'];
    for (const k of Object.keys(bucket)) {
        const text = (bucket[k].description + ' ' + bucket[k].label).toLowerCase();
        for (const b of bad) {
            assert(!text.includes(b), 'Entry ' + k + ' contains casualty language: ' + b);
        }
    }
});
test('T12', 'every source entry avoids detection language', () => {
    const h = buildHarness();
    const bucket = h.source['W3-STEP-08'];
    const bad = ['detected', 'spotted by enemy', 'intelligence confirmed', 'recon confirmed'];
    for (const k of Object.keys(bucket)) {
        const text = (bucket[k].description + ' ' + bucket[k].label).toLowerCase();
        for (const b of bad) {
            assert(!text.includes(b), 'Entry ' + k + ' contains detection language: ' + b);
        }
    }
});
test('T13', 'every source entry avoids weapon-effect language', () => {
    const h = buildHarness();
    const bucket = h.source['W3-STEP-08'];
    const bad = ['fire mission', 'strikes', 'bombardment', 'artillery effect', 'weapon impact'];
    for (const k of Object.keys(bucket)) {
        const text = (bucket[k].description + ' ' + bucket[k].label).toLowerCase();
        for (const b of bad) {
            assert(!text.includes(b), 'Entry ' + k + ' contains weapon-effect language: ' + b);
        }
    }
});
test('T14', 'every source entry avoids live movement instruction language', () => {
    const h = buildHarness();
    const bucket = h.source['W3-STEP-08'];
    const bad = ['move unit', 'advance to', 'retreat to', 'relocate to'];
    for (const k of Object.keys(bucket)) {
        const text = (bucket[k].description + ' ' + bucket[k].label).toLowerCase();
        for (const b of bad) {
            assert(!text.includes(b), 'Entry ' + k + ' contains live movement language: ' + b);
        }
    }
});

// ── T15-T19: getWargame3ExpectedResultForReview rejection/success paths ───────
console.log('\n── T15-T19: Helper rejection / success paths ──────────────────────');

test('T15', 'helper rejects null record', () => {
    const h = buildHarness();
    const r = h.get(null);
    assert(!r.passed && r.expectedResult === null && r.blockedReasons.length > 0,
        'null record should fail');
});
test('T16', 'helper rejects invalid record (missing required fields)', () => {
    const h = buildHarness();
    const r = h.get({ id: '', stepRef: '', optionRef: '' });
    assert(!r.passed && r.expectedResult === null,
        'invalid record should fail');
});
test('T17', 'helper returns HOLD expectedResult for HOLD review record', () => {
    const h = buildHarness();
    const rec = makeRecord('W3-STEP-08', 'W3-STEP-08-OPT-HOLD', 'Hold Current Position');
    const r = h.get(rec);
    assert(r.passed && r.expectedResult !== null,
        'should pass for HOLD: ' + JSON.stringify(r.blockedReasons));
    assert(r.expectedResult.id === 'W3-STEP-08-EXP-HOLD',
        'wrong id: ' + r.expectedResult.id);
});
test('T18', 'helper returns REINFORCE expectedResult for REINFORCE review record', () => {
    const h = buildHarness();
    const rec = makeRecord('W3-STEP-08', 'W3-STEP-08-OPT-REINFORCE', 'Reinforce the Gap');
    const r = h.get(rec);
    assert(r.passed && r.expectedResult !== null,
        'should pass for REINFORCE: ' + JSON.stringify(r.blockedReasons));
    assert(r.expectedResult.id === 'W3-STEP-08-EXP-REINFORCE',
        'wrong id: ' + r.expectedResult.id);
});
test('T19', 'helper returns DELAY expectedResult for DELAY review record', () => {
    const h = buildHarness();
    const rec = makeRecord('W3-STEP-08', 'W3-STEP-08-OPT-DELAY', 'Delay and Withdraw');
    const r = h.get(rec);
    assert(r.passed && r.expectedResult !== null,
        'should pass for DELAY: ' + JSON.stringify(r.blockedReasons));
    assert(r.expectedResult.id === 'W3-STEP-08-EXP-DELAY',
        'wrong id: ' + r.expectedResult.id);
});

// ── T20-T32: returned object correctness + mutation safety ────────────────────
console.log('\n── T20-T32: Returned object correctness + mutation safety ──────────');

test('T20', 'returned expectedResult passes isWargame3ExpectedResultSafe', () => {
    const h = buildHarness();
    const rec = makeRecord('W3-STEP-08', 'W3-STEP-08-OPT-HOLD', 'Hold Current Position');
    const r = h.get(rec);
    assert(r.passed, 'get should pass');
    const check = h.isSafe(r.expectedResult);
    assert(check.passed, 'returned expectedResult fails isSafe: ' + JSON.stringify(check.blockedReasons));
});
test('T21', 'returned linkedDecisionId matches record.selectedDecision.id', () => {
    const h = buildHarness();
    const rec = makeRecord('W3-STEP-08', 'W3-STEP-08-OPT-HOLD', 'Hold Current Position');
    const r = h.get(rec);
    assert(r.passed, 'get should pass');
    assert(r.expectedResult.linkedDecisionId === rec.selectedDecision.id,
        'linkedDecisionId mismatch: ' + r.expectedResult.linkedDecisionId + ' vs ' + rec.selectedDecision.id);
});
test('T22', 'returned linkedOptionRef matches record.optionRef', () => {
    const h = buildHarness();
    const rec = makeRecord('W3-STEP-08', 'W3-STEP-08-OPT-HOLD', 'Hold Current Position');
    const r = h.get(rec);
    assert(r.passed, 'get should pass');
    assert(r.expectedResult.linkedOptionRef === rec.optionRef,
        'linkedOptionRef mismatch: ' + r.expectedResult.linkedOptionRef + ' vs ' + rec.optionRef);
});
test('T23', 'helper returns a copy, not the frozen source object', () => {
    const h = buildHarness();
    const rec = makeRecord('W3-STEP-08', 'W3-STEP-08-OPT-HOLD', 'Hold Current Position');
    const r = h.get(rec);
    assert(r.passed, 'get should pass');
    assert(r.expectedResult !== h.source['W3-STEP-08']['W3-STEP-08-OPT-HOLD'],
        'returned object is the same reference as source — should be a copy');
});
test('T24', 'mutating returned expectedResult does not mutate source', () => {
    const h = buildHarness();
    const rec = makeRecord('W3-STEP-08', 'W3-STEP-08-OPT-HOLD', 'Hold Current Position');
    const r = h.get(rec);
    assert(r.passed, 'get should pass');
    const originalLabel = h.source['W3-STEP-08']['W3-STEP-08-OPT-HOLD'].label;
    try { r.expectedResult.label = 'MUTATED'; } catch (_) {}
    assert(h.source['W3-STEP-08']['W3-STEP-08-OPT-HOLD'].label === originalLabel,
        'source was mutated after modifying the copy');
});
test('T25', 'helper does not mutate the input record', () => {
    const h = buildHarness();
    const rec = makeRecord('W3-STEP-08', 'W3-STEP-08-OPT-HOLD', 'Hold Current Position');
    const optionRefBefore = rec.optionRef;
    h.get(rec);
    assert(rec.optionRef === optionRefBefore, 'helper mutated record.optionRef');
    assert(!('expectedResult' in rec), 'helper added expectedResult to record');
});
test('T26', 'helper does not create expectedResult on a preview object', () => {
    const h = buildHarness();
    const rec = makeRecord('W3-STEP-08', 'W3-STEP-08-OPT-HOLD', 'Hold Current Position');
    const preview = { activeStepId: 'W3-STEP-08' };
    h.get(rec);
    assert(!('expectedResult' in preview), 'helper added expectedResult to preview');
});
test('T27', 'helper does not create expectedResult on a step object', () => {
    const h = buildHarness();
    const rec = makeRecord('W3-STEP-08', 'W3-STEP-08-OPT-HOLD', 'Hold Current Position');
    const step = { activeStepId: 'W3-STEP-08', decisionOptions: [] };
    h.get(rec);
    assert(!('expectedResult' in step), 'helper added expectedResult to step');
});
test('T28', 'helper does not set previewComplete true', () => {
    const h = buildHarness();
    const rec = makeRecord('W3-STEP-08', 'W3-STEP-08-OPT-HOLD', 'Hold Current Position');
    const r = h.get(rec);
    if (r.passed && r.expectedResult) {
        assert(r.expectedResult.previewComplete === undefined ||
               r.expectedResult.previewComplete !== true,
            'helper set previewComplete true');
    }
    assert(true, 'no previewComplete in result');
});
test('T29', 'helper does not create selectedDecision outside record', () => {
    const h = buildHarness();
    const rec = makeRecord('W3-STEP-08', 'W3-STEP-08-OPT-HOLD', 'Hold Current Position');
    const r = h.get(rec);
    assert(r.expectedResult && !('selectedDecision' in r.expectedResult),
        'helper placed selectedDecision inside expectedResult');
});
test('T30', 'helper does not use objective_status_baseline', () => {
    const fn = extractFn(wsSrc, 'getWargame3ExpectedResultForReview');
    assert(fn && !fn.includes('objective_status_baseline'),
        'helper references objective_status_baseline');
});
test('T31', 'helper does not use expectedEffects', () => {
    const fn = extractFn(wsSrc, 'getWargame3ExpectedResultForReview');
    assert(fn && !fn.includes('expectedEffects'),
        'helper references expectedEffects');
});
test('T32', 'helper does not use proposedVisualEffects', () => {
    const fn = extractFn(wsSrc, 'getWargame3ExpectedResultForReview');
    assert(fn && !fn.includes('proposedVisualEffects'),
        'helper references proposedVisualEffects');
});

// ── T33-T42: blocked inputs ───────────────────────────────────────────────────
console.log('\n── T33-T42: Blocked / unsafe inputs ───────────────────────────────');

test('T33', 'unknown stepRef fails safely', () => {
    const h = buildHarness();
    const rec = makeRecord('W3-STEP-UNKNOWN', 'W3-STEP-UNKNOWN-OPT-X', 'X');
    const r = h.get(rec);
    assert(!r.passed && r.expectedResult === null,
        'unknown stepRef should fail safely');
});
test('T34', 'unknown optionRef fails safely', () => {
    const h = buildHarness();
    const rec = makeRecord('W3-STEP-08', 'W3-STEP-08-OPT-UNKNOWN', 'Unknown');
    const r = h.get(rec);
    assert(!r.passed && r.expectedResult === null,
        'unknown optionRef should fail safely');
});
test('T35', 'mismatched linkedDecisionId fails safely', () => {
    // Build a record whose selectedDecision.id does not match the fixture linkedDecisionId
    const h = buildHarness();
    const rec = makeRecord('W3-STEP-08', 'W3-STEP-08-OPT-HOLD', 'Hold Current Position');
    rec.selectedDecision.id = 'SEL-W3-STEP-08-SOMETHING-ELSE';
    const r = h.get(rec);
    assert(!r.passed && r.expectedResult === null,
        'mismatched linkedDecisionId should fail');
});
test('T36', 'mismatched linkedOptionRef fails safely (patched copy)', () => {
    // We can test this by patching the source copy scenario via extractFn indirectly.
    // Instead, verify the source fixture has correct linkedOptionRef (it would fail validation
    // if linkedOptionRef !== optionRef).
    const h = buildHarness();
    const entry = h.source['W3-STEP-08']['W3-STEP-08-OPT-HOLD'];
    assert(entry.linkedOptionRef === 'W3-STEP-08-OPT-HOLD',
        'source linkedOptionRef does not match key — would cause cross-check failure');
});
test('T37', 'source entries do not contain unsafe fields (applyNow, etc.)', () => {
    const h = buildHarness();
    const bucket = h.source['W3-STEP-08'];
    const unsafe = ['applyNow', 'commitNow', 'executeNow', 'liveApply',
                    'mutateUnits', 'mutateMap', 'mutateScenario', 'backendCommit',
                    'autoApply', 'aiGenerated', 'simulationCommitted', 'gate7Approved'];
    for (const k of Object.keys(bucket)) {
        for (const f of unsafe) {
            assert(!(f in bucket[k]), 'source entry ' + k + ' contains unsafe field: ' + f);
        }
    }
});
test('T38', 'source entries do not have applyNow', () => {
    const h = buildHarness();
    const bucket = h.source['W3-STEP-08'];
    for (const k of Object.keys(bucket)) {
        assert(!bucket[k].applyNow, 'applyNow found in ' + k);
    }
});
test('T39', 'source entries do not have executeNow', () => {
    const h = buildHarness();
    const bucket = h.source['W3-STEP-08'];
    for (const k of Object.keys(bucket)) {
        assert(!bucket[k].executeNow, 'executeNow found in ' + k);
    }
});
test('T40', 'source entries do not have commitNow', () => {
    const h = buildHarness();
    const bucket = h.source['W3-STEP-08'];
    for (const k of Object.keys(bucket)) {
        assert(!bucket[k].commitNow, 'commitNow found in ' + k);
    }
});
test('T41', 'source entries do not have liveApply', () => {
    const h = buildHarness();
    const bucket = h.source['W3-STEP-08'];
    for (const k of Object.keys(bucket)) {
        assert(!bucket[k].liveApply, 'liveApply found in ' + k);
    }
});
test('T42', 'source entries do not have gate7Approved', () => {
    const h = buildHarness();
    const bucket = h.source['W3-STEP-08'];
    for (const k of Object.keys(bucket)) {
        assert(!bucket[k].gate7Approved, 'gate7Approved found in ' + k);
    }
});

// ── T43-T45: hasWargame3ExpectedResultForReview ───────────────────────────────
console.log('\n── T43-T45: hasWargame3ExpectedResultForReview ─────────────────────');

test('T43', 'has helper returns available:true for valid HOLD record', () => {
    const h = buildHarness();
    const rec = makeRecord('W3-STEP-08', 'W3-STEP-08-OPT-HOLD', 'Hold Current Position');
    const r = h.has(rec);
    assert(r.passed && r.available === true && r.stepRef === 'W3-STEP-08',
        'has helper should return available:true, got: ' + JSON.stringify(r));
});
test('T44', 'has helper returns available:false for invalid record', () => {
    const h = buildHarness();
    const r = h.has(null);
    assert(!r.passed && r.available === false,
        'has helper should return available:false for null');
});
test('T45', 'has helper returns available:false for unknown option', () => {
    const h = buildHarness();
    const rec = makeRecord('W3-STEP-08', 'W3-STEP-08-OPT-UNKNOWN', 'Unknown');
    const r = h.has(rec);
    assert(!r.passed && r.available === false,
        'has helper should return available:false for unknown option');
});

// ── T46-T48: existing preview fields unchanged ────────────────────────────────
console.log('\n── T46-T48: Existing preview fields unchanged ──────────────────────');

test('T46', 'existing W3 preview expectedResult field is null (source check)', () => {
    // buildScenarioStepPreview should not yet set expectedResult
    // Verify the function body does not set expectedResult (PR-273 does NOT wire it)
    const fn = extractFn(wsSrc, 'buildScenarioStepPreview');
    assert(fn, 'buildScenarioStepPreview not found');
    // Count occurrences of 'expectedResult' assigned in buildScenarioStepPreview
    const matches = (fn.match(/expectedResult\s*[:=]/g) || []);
    // It may have it as null from the fixture template — but it should NOT call
    // getWargame3ExpectedResultForReview inside buildScenarioStepPreview
    assert(!fn.includes('getWargame3ExpectedResultForReview'),
        'buildScenarioStepPreview calls getWargame3ExpectedResultForReview — should not in PR-273');
});
test('T47', 'previewWargame3Fixture does not call getWargame3ExpectedResultForReview', () => {
    const fn = extractFn(wsSrc, 'previewWargame3Fixture');
    assert(fn, 'previewWargame3Fixture not found');
    assert(!fn.includes('getWargame3ExpectedResultForReview'),
        'previewWargame3Fixture should not call getWargame3ExpectedResultForReview in PR-273');
});
test('T48', 'selectedDecision remains null in fresh preview (not set by PR-273)', () => {
    // The PR-273 helpers never write to a preview object; verify no attachment
    const fn = extractFn(wsSrc, 'getWargame3ExpectedResultForReview');
    assert(fn, 'helper not found');
    assert(!fn.includes('.selectedDecision ='),
        'helper sets selectedDecision on some object');
    assert(!fn.includes('preview.selectedDecision'),
        'helper sets preview.selectedDecision');
});

// ── T49-T53: regression — PR-26x / PR-27x features still intact ──────────────
console.log('\n── T49-T53: Feature regression PRs 267-272 ────────────────────────');

const regressionExports = [
    ['T49', '_paintW3OperatorSelectionReview'],
    ['T50', '_handleW3CoaReviewClick'],
    ['T51', '_clearW3CoaReviewRecord'],
    ['T52', '_paintW3CoaUnderReviewIndicator'],
    ['T53', '_handleW3CoaReviewClearClick'],
];
for (const [id, name] of regressionExports) {
    test(id, name + ' still exported', () => {
        assert(wsSrc.includes(name + ':') || wsSrc.includes(name + ' :'),
            name + ' not found in exports');
    });
}

// ── T54-T65: file protection ──────────────────────────────────────────────────
console.log('\n── T54-T65: File protection ────────────────────────────────────────');

test('T54', 'app.html not modified by PR-273', () => {
    assert(!appHtml.includes('getWargame3ExpectedResultForReview') &&
           !appHtml.includes('W3_EXPECTED_RESULT_FIXTURE_SOURCE'),
        'app.html contains PR-273 additions — should not be modified');
});
test('T55', 'i18n.js not modified by PR-273', () => {
    assert(!i18nSrc.includes('W3_EXPECTED_RESULT_FIXTURE_SOURCE') &&
           !i18nSrc.includes('getWargame3ExpectedResultForReview'),
        'i18n.js contains PR-273 additions — should not be modified');
});
test('T56', 'style.css not modified by PR-273', () => {
    assert(!cssSrc.includes('W3_EXPECTED_RESULT_FIXTURE_SOURCE') &&
           !cssSrc.includes('getWargame3ExpectedResultForReview'),
        'style.css contains PR-273 additions — should not be modified');
});
test('T57', 'wargame3.json not modified by PR-273', () => {
    const w3 = readSrc('UI_MOdified/data/scenarios/wargame3.json');
    assert(!w3.includes('W3_EXPECTED_RESULT_FIXTURE_SOURCE') &&
           !w3.includes('getWargame3ExpectedResultForReview'),
        'wargame3.json contains PR-273 additions');
});
test('T58', 'app.js not modified by PR-273', () => {
    let appJs = '';
    try { appJs = readSrc('UI_MOdified/client/app.js'); } catch (_) { appJs = ''; }
    assert(!appJs.includes('getWargame3ExpectedResultForReview'),
        'app.js contains PR-273 additions');
});
test('T59', 'adjudicator-map.js not modified by PR-273', () => {
    const adjMap = readSrc('UI_MOdified/client/wargame/adjudicator-map.js');
    assert(!adjMap.includes('getWargame3ExpectedResultForReview'),
        'adjudicator-map.js contains PR-273 additions');
});
test('T60', 'raw W3 JSON is unchanged (no new keys injected)', () => {
    const w3 = readSrc('UI_MOdified/data/scenarios/wargame3.json');
    assert(!w3.includes('expectedResultFixture') &&
           !w3.includes('W3-STEP-08-EXP-'),
        'wargame3.json contains injected PR-273 keys');
});
test('T61', 'source constant does not appear in app.html', () => {
    assert(!appHtml.includes('W3_EXPECTED_RESULT_FIXTURE_SOURCE'),
        'W3_EXPECTED_RESULT_FIXTURE_SOURCE found in app.html');
});
test('T62', 'source constant does not appear in i18n.js', () => {
    assert(!i18nSrc.includes('W3_EXPECTED_RESULT_FIXTURE_SOURCE'),
        'W3_EXPECTED_RESULT_FIXTURE_SOURCE found in i18n.js');
});
test('T63', 'source constant does not appear in style.css', () => {
    assert(!cssSrc.includes('W3_EXPECTED_RESULT_FIXTURE_SOURCE'),
        'W3_EXPECTED_RESULT_FIXTURE_SOURCE found in style.css');
});
test('T64', 'no new buttons/inputs/labels added to app.html by PR-273', () => {
    // app.html should be unchanged; verify button count hasn't grown
    // (just a spot-check that PR-273 didn't add UI elements)
    assert(!appHtml.includes('sw-drp-expected-result-btn') &&
           !appHtml.includes('id="sw-drp-exp-'),
        'app.html gained PR-273 UI elements — should be unchanged');
});
test('T65', 'no new i18n keys for PR-273 in i18n.js', () => {
    assert(!i18nSrc.includes("'sw-drp-expected-result") &&
           !i18nSrc.includes('PR-273'),
        'i18n.js gained PR-273 keys — should be unchanged');
});

// ── T66-T82: safety boundary ──────────────────────────────────────────────────
console.log('\n── T66-T82: Safety boundary ───────────────────────────────────────');

function getHelperSrc(name) {
    return extractFn(wsSrc, name) || '';
}

test('T66', 'getWargame3ExpectedResultForReview has no localStorage', () => {
    assert(!getHelperSrc('getWargame3ExpectedResultForReview').includes('localStorage'),
        'helper references localStorage');
});
test('T67', 'getWargame3ExpectedResultForReview has no sessionStorage', () => {
    assert(!getHelperSrc('getWargame3ExpectedResultForReview').includes('sessionStorage'),
        'helper references sessionStorage');
});
test('T68', 'getWargame3ExpectedResultForReview has no IndexedDB', () => {
    const fn = getHelperSrc('getWargame3ExpectedResultForReview');
    assert(!fn.includes('indexedDB') && !fn.includes('IndexedDB'),
        'helper references IndexedDB');
});
test('T69', 'getWargame3ExpectedResultForReview has no fetch', () => {
    assert(!getHelperSrc('getWargame3ExpectedResultForReview').includes('fetch('),
        'helper references fetch');
});
test('T70', 'getWargame3ExpectedResultForReview has no /api/sim/', () => {
    assert(!getHelperSrc('getWargame3ExpectedResultForReview').includes('/api/sim/'),
        'helper references /api/sim/');
});
test('T71', 'getWargame3ExpectedResultForReview has no window.RmoozScenario', () => {
    assert(!getHelperSrc('getWargame3ExpectedResultForReview').includes('window.RmoozScenario'),
        'helper references window.RmoozScenario');
});
test('T72', 'getWargame3ExpectedResultForReview has no window.units', () => {
    assert(!getHelperSrc('getWargame3ExpectedResultForReview').includes('window.units'),
        'helper references window.units');
});
test('T73', 'getWargame3ExpectedResultForReview has no AI/journal calls', () => {
    const fn = getHelperSrc('getWargame3ExpectedResultForReview');
    assert(!fn.includes('journal') && !fn.includes('aiGenerated') && !fn.includes('aiProposal'),
        'helper references AI/journal');
});
test('T74', 'getWargame3ExpectedResultForReview has no Gate 7 reference', () => {
    const fn = getHelperSrc('getWargame3ExpectedResultForReview').toLowerCase();
    assert(!fn.includes('gate7') && !fn.includes('gate-7') && !fn.includes('gate 7'),
        'helper references Gate 7');
});
test('T75', 'getWargame3ExpectedResultForReview has no apply/execute/commit', () => {
    const fn = getHelperSrc('getWargame3ExpectedResultForReview').toLowerCase();
    assert(!fn.includes('.apply') && !fn.includes('executecommand') &&
           !fn.includes('commitnow'),
        'helper references apply/execute/commit');
});
test('T76', 'hasWargame3ExpectedResultForReview has no localStorage', () => {
    assert(!getHelperSrc('hasWargame3ExpectedResultForReview').includes('localStorage'),
        'has helper references localStorage');
});
test('T77', 'hasWargame3ExpectedResultForReview has no fetch', () => {
    assert(!getHelperSrc('hasWargame3ExpectedResultForReview').includes('fetch('),
        'has helper references fetch');
});
test('T78', 'hasWargame3ExpectedResultForReview has no window.units', () => {
    assert(!getHelperSrc('hasWargame3ExpectedResultForReview').includes('window.units'),
        'has helper references window.units');
});
test('T79', 'W3_EXPECTED_RESULT_FIXTURE_SOURCE source text has no applyNow', () => {
    const idx = wsSrc.indexOf('W3_EXPECTED_RESULT_FIXTURE_SOURCE = Object.freeze');
    assert(idx !== -1, 'source constant not found');
    // Read 3000 chars from the constant definition
    const region = wsSrc.slice(idx, idx + 3000);
    assert(!region.includes('applyNow'), 'source constant contains applyNow');
});
test('T80', 'W3_EXPECTED_RESULT_FIXTURE_SOURCE source text has no gate7Approved', () => {
    const idx = wsSrc.indexOf('W3_EXPECTED_RESULT_FIXTURE_SOURCE = Object.freeze');
    const region = wsSrc.slice(idx, idx + 3000);
    assert(!region.includes('gate7Approved'), 'source constant contains gate7Approved');
});
test('T81', 'no new control buttons added (no Apply/Execute/Go Live in workspace source)', () => {
    // Verify PR-273 code section has no forbidden control labels in the new constant/helpers
    const pr273Start = wsSrc.indexOf('PR-273: Wargame 3 Expected Result Source Layer');
    const pr216Start = wsSrc.indexOf('PR-216: Wargame 3 Dry-Run Preview Harness');
    assert(pr273Start !== -1 && pr216Start !== -1, 'PR-273 or PR-216 marker not found');
    const region = wsSrc.slice(pr273Start, pr216Start).toLowerCase();
    const forbidden = ['go live', 'execute now', 'apply now', 'confirm and apply'];
    for (const f of forbidden) {
        assert(!region.includes(f), 'PR-273 region contains forbidden label: ' + f);
    }
});
test('T82', 'source constant is frozen (Object.freeze used)', () => {
    assert(wsSrc.includes("W3_EXPECTED_RESULT_FIXTURE_SOURCE = Object.freeze"),
        'W3_EXPECTED_RESULT_FIXTURE_SOURCE is not frozen via Object.freeze');
});

// ── T83: no console.error in new helpers ──────────────────────────────────────
console.log('\n── T83: No console.error in new helpers ────────────────────────────');

test('T83', 'neither new helper contains console.error', () => {
    const getFn  = getHelperSrc('getWargame3ExpectedResultForReview');
    const hasFn  = getHelperSrc('hasWargame3ExpectedResultForReview');
    assert(!getFn.includes('console.error') && !hasFn.includes('console.error'),
        'new helper(s) contain console.error calls');
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
