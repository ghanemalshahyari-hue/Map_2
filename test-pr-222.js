'use strict';

// ── PR-222 Test Harness ──────────────────────────────────────────────────────
// Tests readability improvements: objectiveStatusBaseline on preview,
// _drpEffectTypeLabel, _drpFormatWarnings, W3 context labels,
// grouped warnings, AMBER RIDGE path unchanged.
// No DOM side effects needed for these tests (DOM elements won't exist → skipped).
// No network. No storage. No map. No window.units.

var fs   = require('fs');
var path = require('path');
var src  = fs.readFileSync(
    path.join(__dirname, 'UI_MOdified/client/shell/scenario-workspace.js'),
    'utf8'
);

// ── Brace-matched function extractor ─────────────────────────────────────────
function extractFn(source, fnName) {
    var re  = new RegExp('function\\s+' + fnName + '\\s*\\(');
    var idx = source.search(re);
    if (idx === -1) { throw new Error('Cannot find function ' + fnName); }
    var start = source.indexOf('{', idx);
    var depth = 0; var i = start;
    while (i < source.length) {
        if (source[i] === '{')      { depth++; }
        else if (source[i] === '}') { depth--; }
        if (depth === 0)            { break; }
        i++;
    }
    return source.slice(idx, i + 1);
}

// ── Minimal window mock ───────────────────────────────────────────────────────
var window = {};

// ── Extract code blocks ───────────────────────────────────────────────────────
var txLine = src.indexOf('function tx(');
var txEnd  = src.indexOf('\n    }', txLine) + 6;
var txSrc  = src.slice(txLine, txEnd);

// PR-215 adapter block — must use exact marker text
var w3aStart = src.indexOf('// ── PR-215: Wargame 3 Fixture Adapter');
var w3aEnd   = src.indexOf('// ── PR-216: Wargame 3 Dry-Run Preview Harness');
if (w3aEnd === -1) { throw new Error('Cannot find PR-216 marker'); }
var w3aSrc   = src.slice(w3aStart, w3aEnd);

var bsspStart = src.indexOf('    var _BSSP_SAFETY_TRUE');
var bsspEnd   = src.indexOf('    function buildScenarioStepPreview', bsspStart);
var bsspSrc   = src.slice(bsspStart, bsspEnd);

var builderSrc = extractFn(src, 'buildScenarioStepPreview');
var harnSrc    = extractFn(src, 'previewWargame3Fixture');
var effLblSrc  = extractFn(src, '_drpEffectTypeLabel');
var fmtWarnSrc = extractFn(src, '_drpFormatWarnings');

// ── Build execution environment ───────────────────────────────────────────────
var combined = [
    'var _translations = {};',
    'function t(k){ return _translations[k] || k; }',
    'window.t = t;',
    txSrc,
    w3aSrc,
    bsspSrc,
    builderSrc,
    harnSrc,
    effLblSrc,
    fmtWarnSrc
].join('\n');

var fn = new Function('window',
    combined + '\nreturn {' +
    ' buildScenarioStepPreview: buildScenarioStepPreview,' +
    ' adaptWargame3ToFixture: adaptWargame3ToFixture,' +
    ' previewWargame3Fixture: previewWargame3Fixture,' +
    ' _drpEffectTypeLabel: _drpEffectTypeLabel,' +
    ' _drpFormatWarnings: _drpFormatWarnings };'
);
var api = fn(window);

// ── Minimal Wargame 3 fixture for testing ─────────────────────────────────────
var minW3 = {
    name: 'wargame3', scenario_label: 'Wargame 3 — Test', ported_from: 'wargame3',
    obj: { id: 'OBJ-1', description: 'Secure crossing', phase: 'PHASE-1' },
    red_units: [
        { uid: 'R-001', name: 'Red Alpha',  echelon: 'PLT', role: 'INF' },
        { uid: 'R-002', name: 'Red Bravo',  echelon: 'PLT', role: 'ARM' }
    ],
    blue_units_initial: [
        { unit_uid: 'B-001', name_en: 'Blue Alpha', echelon: 'PLT', role: 'INF' }
    ],
    steps: [
        {
            step_id: 'W3-STEP-00', phase: 'PHASE-1', time_label: 'H+00',
            objective_status_baseline: 'DORMANT',
            narrative_en: 'Initial positioning.',
            friendly_actions:   [{ uid: 'B-001', action: 'Move to LD' }],
            enemy_actions:      [{ uid: 'R-001', action: 'Hold position' }],
            engagement_arcs:    [{ actor_uid: 'R-001', target_uid: 'B-001', cause_what: 'direct fire', status_change: 'SUPPRESSED' }],
            units_referenced:   ['B-001', 'R-001']
        },
        {
            step_id: 'W3-STEP-01', phase: 'PHASE-2', time_label: 'H+30',
            objective_status_baseline: 'THREATENED',
            narrative_en: 'Advance to contact.',
            friendly_actions:   [{ uid: 'B-001', action: 'Assault' }],
            enemy_actions:      [{ uid: 'R-002', action: 'Counter-attack' }],
            engagement_arcs:    [],
            units_referenced:   ['B-001', 'R-002']
        }
    ]
};

// ── Test runner ───────────────────────────────────────────────────────────────
var passed = 0; var failed = 0; var results = [];
function assert(label, cond, detail) {
    if (cond) { passed++; results.push('  PASS  ' + label); }
    else       { failed++; results.push('  FAIL  ' + label + (detail ? '  →  ' + detail : '')); }
}

// ── Build W3 preview ──────────────────────────────────────────────────────────
var w3fixture  = api.adaptWargame3ToFixture(minW3);
var harnResult = api.previewWargame3Fixture(minW3, 'W3-STEP-00');
var preview    = harnResult.preview;

// T01 — preview has objectiveStatusBaseline field
assert('T01 — preview has objectiveStatusBaseline field',
    'objectiveStatusBaseline' in preview,
    'keys: ' + Object.keys(preview).filter(function(k){return k.indexOf('obj') !== -1;}).join(', ')
);

// T02 — correct value for step 0 (DORMANT)
assert('T02 — objectiveStatusBaseline = "DORMANT" for W3-STEP-00',
    preview.objectiveStatusBaseline === 'DORMANT',
    'got: ' + preview.objectiveStatusBaseline
);

// T03 — correct value for step 1 (THREATENED)
var h1 = api.previewWargame3Fixture(minW3, 'W3-STEP-01');
assert('T03 — objectiveStatusBaseline = "THREATENED" for W3-STEP-01',
    h1.preview && h1.preview.objectiveStatusBaseline === 'THREATENED',
    'got: ' + (h1.preview && h1.preview.objectiveStatusBaseline)
);

// T04 — warningsDetail is array
assert('T04 — preview.warningsDetail is an array',
    Array.isArray(preview.warningsDetail),
    typeof preview.warningsDetail
);

// T05 — warningsDetail entries have {code, message}
var wdOk = preview.warningsDetail.length > 0 &&
    preview.warningsDetail.every(function(w) {
        return w && typeof w.code === 'string' && typeof w.message === 'string';
    });
assert('T05 — warningsDetail entries have { code, message }',
    wdOk,
    JSON.stringify(preview.warningsDetail.slice(0,2))
);

// T06 — MISSING_FIELD for selectedDecision
assert('T06 — warningsDetail has MISSING_FIELD for selectedDecision',
    preview.warningsDetail.some(function(w) {
        return w.code === 'MISSING_FIELD' && w.message.indexOf('selectedDecision') !== -1;
    })
);

// T07 — MISSING_FIELD for expectedResult
assert('T07 — warningsDetail has MISSING_FIELD for expectedResult',
    preview.warningsDetail.some(function(w) {
        return w.code === 'MISSING_FIELD' && w.message.indexOf('expectedResult') !== -1;
    })
);

// T08 — selectedDecision null
assert('T08 — preview.decision is null (W3 never synthesises decision)',
    preview.decision === null, 'got: ' + preview.decision
);

// T09 — expectedResult null
assert('T09 — preview.expectedResult is null',
    preview.expectedResult === null, 'got: ' + preview.expectedResult
);

// T10 — previewComplete false
assert('T10 — preview.previewComplete is false',
    preview.previewComplete === false, 'got: ' + preview.previewComplete
);

// T11 — friendly_action label
var lbl1 = api._drpEffectTypeLabel('friendly_action');
assert('T11 — _drpEffectTypeLabel("friendly_action") is readable (not raw type string)',
    typeof lbl1 === 'string' && lbl1.length > 0 && lbl1 !== 'friendly_action',
    'got: "' + lbl1 + '"'
);

// T12 — enemy_counter_action label
var lbl2 = api._drpEffectTypeLabel('enemy_counter_action');
assert('T12 — _drpEffectTypeLabel("enemy_counter_action") is readable',
    typeof lbl2 === 'string' && lbl2.length > 0 && lbl2 !== 'enemy_counter_action',
    'got: "' + lbl2 + '"'
);

// T13 — engagement_arc label
var lbl3 = api._drpEffectTypeLabel('engagement_arc');
assert('T13 — _drpEffectTypeLabel("engagement_arc") is readable',
    typeof lbl3 === 'string' && lbl3.length > 0 && lbl3 !== 'engagement_arc',
    'got: "' + lbl3 + '"'
);

// T14 — unknown type: underscores replaced with spaces
var lbl4 = api._drpEffectTypeLabel('some_unknown_type');
assert('T14 — unknown type replaces underscores with spaces',
    lbl4 === 'some unknown type', 'got: "' + lbl4 + '"'
);

// T15 — single warning renders inline
var fmt1 = api._drpFormatWarnings([{ code: 'MISSING_FIELD', message: 'selectedDecision is missing' }]);
assert('T15 — single warning renders as "[CODE] message" inline',
    fmt1 === '[MISSING_FIELD] selectedDecision is missing',
    'got: "' + fmt1 + '"'
);

// T16 — two same-code warnings grouped with ×2
var fmt2 = api._drpFormatWarnings([
    { code: 'MISSING_FIELD', message: 'selectedDecision is missing' },
    { code: 'MISSING_FIELD', message: 'expectedResult is missing' }
]);
assert('T16 — two MISSING_FIELD warnings grouped as ×2',
    fmt2.indexOf('[MISSING_FIELD] ×2:') !== -1,
    'got: "' + fmt2 + '"'
);

// T17 — grouped items indented with ·
assert('T17 — grouped items indented with "  · " prefix',
    fmt2.indexOf('  · ') !== -1, 'got: "' + fmt2 + '"'
);

// T18 — mixed codes render separately
var fmt3 = api._drpFormatWarnings([
    { code: 'MISSING_FIELD', message: 'missing x' },
    { code: 'UNKNOWN_UNIT',  message: 'unit not found' }
]);
assert('T18 — mixed codes render as separate groups',
    fmt3.indexOf('[MISSING_FIELD]') !== -1 && fmt3.indexOf('[UNKNOWN_UNIT]') !== -1,
    'got: "' + fmt3 + '"'
);

// T19 — empty array returns a none-string
var fmt4 = api._drpFormatWarnings([]);
assert('T19 — _drpFormatWarnings([]) returns non-empty string',
    typeof fmt4 === 'string' && fmt4.length > 0,
    'got: "' + fmt4 + '"'
);

// T20 — proposedVisualEffects non-empty for W3 step with arc
assert('T20 — proposedVisualEffects is non-empty for W3 step with engagement arc',
    Array.isArray(preview.proposedVisualEffects) && preview.proposedVisualEffects.length > 0,
    'length: ' + (preview.proposedVisualEffects||[]).length
);

// T21 — proposedVisualEffects has engagement_arc entry
assert('T21 — proposedVisualEffects includes engagement_arc type',
    (preview.proposedVisualEffects||[]).some(function(e) { return e.type === 'engagement_arc'; }),
    JSON.stringify((preview.proposedVisualEffects||[]).map(function(e){return e.type;}))
);

// T22 — AMBER RIDGE fixture passes
var amberFix = {
    fixtureId: 'ar', fixtureName: 'AMBER RIDGE', packageId: 'ar', packageName: 'AR',
    readOnly: true, liveMutationAllowed: false,
    units: [{
        uid: 'U1', name: 'Alpha', side: 'blue', role: 'INF', echelon: 'PLT', aliases: [],
        startLocation: { description: 'LD', lat: 34.0, lng: 36.0 }
    }],
    objectives: [{ objectiveId: 'OBJ1', name: 'Obj Alpha', phase: 'P1', desiredEffect: 'Secure' }],
    steps: [{
        step_id: 'AMBER-STEP-01', stepIndex: 0, title: 'Step 1',
        situation: 'Blue forces advance.',
        selectedDecision: 'Maneuver along axis RED',
        expectedResult:   'Secure the ridge by H+2',
        enemyCounterActions: [{ uid: 'U1', counterAction: 'Withdraw' }],
        friendlyActions:     [{ uid: 'U1', action: 'Move forward' }],
        objectivesReferenced: ['OBJ1'],
        unitsReferenced: ['U1'],
        readOnly: true,
        safety: {
            dryRunOnly: true, previewOnly: true,
            liveMutationAllowed: false, backendCommitAllowed: false,
            mapMutationAllowed: false, unitMutationAllowed: false,
            scenarioMutationAllowed: false
        }
    }]
};
var amberRes = api.buildScenarioStepPreview(amberFix, 'AMBER-STEP-01');
assert('T22 — AMBER RIDGE preview still passes',
    amberRes.passed === true,
    JSON.stringify(amberRes.blockedReasons)
);

// T23 — AMBER RIDGE objectiveStatusBaseline null (no baseline on AMBER step)
assert('T23 — AMBER RIDGE objectiveStatusBaseline = null (step has no baseline field)',
    amberRes.preview.objectiveStatusBaseline === null,
    'got: ' + amberRes.preview.objectiveStatusBaseline
);

// T24 — AMBER RIDGE previewComplete true (has decision + result)
assert('T24 — AMBER RIDGE previewComplete = true',
    amberRes.preview.previewComplete === true,
    'got: ' + amberRes.preview.previewComplete
);

// T25 — Safety: no apply/commit/confirm in new PR-222 helper code
var pr222start = src.indexOf('// ── PR-222: Dry-run preview display helpers');
var pr222end   = src.indexOf('// ── PR-212 / PR-217: Scenario Dry-Run Preview Paint', pr222start + 10);
var pr222code  = (pr222start !== -1 && pr222end !== -1) ? src.slice(pr222start, pr222end) : '';
var noComm222  = pr222code.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
assert('T25 — no apply/commit/confirm in PR-222 helper block',
    !/\bapply\b/i.test(noComm222) && !/\bcommit\b/i.test(noComm222) && !/\bconfirm\b/i.test(noComm222),
    'detected in helpers'
);

// T26 — Safety: no Leaflet/window.units/window.lines in PR-222 helpers
assert('T26 — no L. / window.units / window.lines in PR-222 helpers',
    noComm222.indexOf('L.') === -1 &&
    noComm222.indexOf('window.units') === -1 &&
    noComm222.indexOf('window.lines') === -1,
    'violation detected'
);

// T27 — Safety: no storage/fetch in new _paintToDOM section
var ptStart = src.indexOf('// PR-222: detect W3 mode from step ID prefix');
var ptEnd   = src.indexOf('// ── PR-217: override path', ptStart);
var ptCode  = (ptStart !== -1 && ptEnd !== -1) ? src.slice(ptStart, ptEnd) : '';
var ptClean = ptCode.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
assert('T27 — no localStorage/fetch/sessionStorage in updated _paintToDOM',
    ptClean.indexOf('localStorage') === -1 &&
    ptClean.indexOf('fetch(') === -1 &&
    ptClean.indexOf('sessionStorage') === -1,
    'storage/fetch found'
);

// T28 — Safety: RmoozScenario.stepIndex not mutated in PR-222 code
var allNewCode = pr222code + ptCode;
var allClean   = allNewCode.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
assert('T28 — RmoozScenario.stepIndex not mutated in PR-222 code',
    !/window\.RmoozScenario\.stepIndex\s*=/.test(allClean),
    'mutation found'
);

// T29 — isW3 regex: correct detection
assert('T29 — isW3 regex correctly identifies W3-STEP-* and excludes AMBER',
    /^W3-STEP-/i.test('W3-STEP-00') === true &&
    /^W3-STEP-/i.test('W3-STEP-16') === true &&
    /^W3-STEP-/i.test('AMBER-STEP-01') === false,
    'regex mismatch'
);

// T30 — W3 fixture.sourceType (adaptWargame3ToFixture returns { passed, fixture, ... })
assert('T30 — W3 fixture.sourceType = "wargame3_adapted"',
    w3fixture.fixture && w3fixture.fixture.sourceType === 'wargame3_adapted',
    'got: ' + (w3fixture.fixture && w3fixture.fixture.sourceType)
);

// T31 — AMBER RIDGE warningsDetail is empty (no missing fields)
assert('T31 — AMBER RIDGE warningsDetail.length = 0 (complete preview)',
    Array.isArray(amberRes.preview.warningsDetail) && amberRes.preview.warningsDetail.length === 0,
    'length: ' + (amberRes.preview.warningsDetail && amberRes.preview.warningsDetail.length)
);

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n── PR-222 results: ' + passed + ' passed, ' + failed + ' failed (of ' + (passed+failed) + ') ──');
results.forEach(function(r){ console.log(r); });
if (failed > 0) { process.exit(1); }
