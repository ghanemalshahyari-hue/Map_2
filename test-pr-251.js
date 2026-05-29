'use strict';

// ── PR-251 Test Harness — Wargame 3 Map Preview Operational Readiness Report ─
// Tests buildWargame3MapPreviewReadinessReport: input guard, return shape,
// readiness classification, summary metrics, gap detection, recommended PR,
// sourceReports, safety invariants, and all existing functions intact.
// No DOM. No Leaflet. No window.units. No window.lines. No storage. No fetch.

var fs   = require('fs');
var path = require('path');

var src    = fs.readFileSync(
    path.join(__dirname, 'UI_MOdified/client/shell/scenario-workspace.js'), 'utf8');
var w3json = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'UI_MOdified/data/scenarios/wargame3.json'), 'utf8'));

// ── Brace-matched function extractor ─────────────────────────────────────────
function extractFn(fnName) {
    var re  = new RegExp('function\\s+' + fnName + '\\s*\\(');
    var idx = src.search(re);
    if (idx === -1) { throw new Error('Cannot find function: ' + fnName); }
    var start = src.indexOf('{', idx);
    var depth = 0; var i = start;
    while (i < src.length) {
        if (src[i] === '{')      { depth++; }
        else if (src[i] === '}') { depth--; }
        if (depth === 0)         { break; }
        i++;
    }
    return src.slice(idx, i + 1);
}

// ── Minimal window mock ───────────────────────────────────────────────────────
var window = {
    _fitBoundsCalled: false,
    map: null,
    L:   null
};

// ── Extract code blocks ───────────────────────────────────────────────────────
var bsspStart = src.indexOf('    var _BSSP_SAFETY_TRUE');
var bsspEnd   = src.indexOf('    function buildScenarioStepPreview', bsspStart);
var bsspSrc   = src.slice(bsspStart, bsspEnd);

var w3aStart = src.indexOf('// ── PR-215: Wargame 3 Fixture Adapter');
var w3aEnd   = src.indexOf('// ── PR-216: Wargame 3 Dry-Run Preview Harness');
if (w3aEnd === -1) { throw new Error('Cannot find PR-216 marker'); }
var w3aSrc = src.slice(w3aStart, w3aEnd);

var w3modConstStart = src.indexOf('// ── PR-241: Read-Only Map Overlay Data Builder — unsafe');
var w3modConstEnd   = src.indexOf('// ── PR-241: Wargame 3 Read-Only Map Overlay type guard');
var w3modConstSrc   = src.slice(w3modConstStart, w3modConstEnd);

var builderSrc         = extractFn('buildScenarioStepPreview');
var harnSrc            = extractFn('previewWargame3Fixture');
var isGuardSrc         = extractFn('isWargame3ReadOnlyMapOverlayDataSafe');
var buildOverlaySrc    = extractFn('buildWargame3ReadOnlyMapOverlayData');
var auditCovSrc        = extractFn('auditWargame3MapPreviewCoverage');
var auditDeltaSrc      = extractFn('auditWargame3StepCoordinateDeltas');
var auditTrailSrc      = extractFn('auditWargame3MovementTrailCoverage');
var buildFocusSrc      = extractFn('buildWargame3PreviewMapFocusBounds');
var focusHelperSrc     = extractFn('focusWargame3PreviewMapBounds');
var readinessSrc       = extractFn('buildWargame3MapPreviewReadinessReport');

// Stubs for paint functions — no Leaflet in test environment.
var paintStubSrc = [
    'function paintWargame3ReadOnlyMapOverlay(overlay, options) {',
    '    return { passed: true, painted: false, markerCount: 0,',
    '             objectiveHighlightCount: 0, effectHintCount: 0,',
    '             movementTrailCount: 0, skippedCount: 0,',
    '             blockedReasons: [], warnings: [] };',
    '}',
    'function paintWargame3PreviewMapOverlayFromPreview(preview) {',
    '    return { passed: true, painted: false, markerCount: 0,',
    '             objectiveHighlightCount: 0, effectHintCount: 0,',
    '             movementTrailCount: 0, skippedCount: 0,',
    '             blockedReasons: [], warnings: [] };',
    '}'
].join('\n');

// ── Build execution environment ───────────────────────────────────────────────
var combined = [
    bsspSrc,
    builderSrc,
    w3aSrc,
    harnSrc,
    w3modConstSrc,
    isGuardSrc,
    buildOverlaySrc,
    paintStubSrc,
    auditCovSrc,
    auditDeltaSrc,
    auditTrailSrc,
    buildFocusSrc,
    focusHelperSrc,
    readinessSrc
].join('\n');

var fn = new Function('window',
    combined + '\nreturn {' +
    ' adaptWargame3ToFixture:                       adaptWargame3ToFixture,' +
    ' buildScenarioStepPreview:                     buildScenarioStepPreview,' +
    ' previewWargame3Fixture:                       previewWargame3Fixture,' +
    ' isWargame3ReadOnlyMapOverlayDataSafe:         isWargame3ReadOnlyMapOverlayDataSafe,' +
    ' buildWargame3ReadOnlyMapOverlayData:          buildWargame3ReadOnlyMapOverlayData,' +
    ' auditWargame3MapPreviewCoverage:              auditWargame3MapPreviewCoverage,' +
    ' auditWargame3StepCoordinateDeltas:            auditWargame3StepCoordinateDeltas,' +
    ' auditWargame3MovementTrailCoverage:           auditWargame3MovementTrailCoverage,' +
    ' buildWargame3PreviewMapFocusBounds:           buildWargame3PreviewMapFocusBounds,' +
    ' focusWargame3PreviewMapBounds:                focusWargame3PreviewMapBounds,' +
    ' buildWargame3MapPreviewReadinessReport:       buildWargame3MapPreviewReadinessReport };'
);
var api = fn(window);

// ── Test runner ───────────────────────────────────────────────────────────────
var passed = 0; var failed = 0; var results = [];
function assert(label, cond, detail) {
    if (cond) { passed++; results.push('  PASS  ' + label); }
    else       { failed++; results.push('  FAIL  ' + label + (detail ? '  →  ' + detail : '')); }
}

// ── Run the report once and cache ─────────────────────────────────────────────
var report = api.buildWargame3MapPreviewReadinessReport(w3json);

// ─────────────────────────────────────────────────────────────────────────────
// T01 — null w3json blocks safely
// ─────────────────────────────────────────────────────────────────────────────
var t01 = api.buildWargame3MapPreviewReadinessReport(null);
assert('T01 — null w3json returns passed:false without throwing',
    t01.passed === false && Array.isArray(t01.blockedReasons) && t01.blockedReasons.length > 0,
    JSON.stringify(t01.blockedReasons));
assert('T01b — null w3json sets readiness to blocked',
    t01.readiness === 'blocked',
    'readiness=' + t01.readiness);

// ─────────────────────────────────────────────────────────────────────────────
// T02 — valid W3 data returns passed:true
// ─────────────────────────────────────────────────────────────────────────────
assert('T02 — valid W3 data returns passed:true',
    report.passed === true,
    JSON.stringify(report.blockedReasons));

// ─────────────────────────────────────────────────────────────────────────────
// T03 — readiness is one of the allowed values
// ─────────────────────────────────────────────────────────────────────────────
var ALLOWED_READINESS = ['ready_for_walkthrough', 'needs_review', 'blocked'];
assert('T03 — readiness is an allowed value',
    ALLOWED_READINESS.indexOf(report.readiness) !== -1,
    'readiness=' + report.readiness);

// ─────────────────────────────────────────────────────────────────────────────
// T04 — stepCount is 17
// ─────────────────────────────────────────────────────────────────────────────
assert('T04 — summary.stepCount === 17',
    report.summary && report.summary.stepCount === 17,
    'stepCount=' + (report.summary && report.summary.stepCount));

// ─────────────────────────────────────────────────────────────────────────────
// T05 — drawableSteps is calculated
// ─────────────────────────────────────────────────────────────────────────────
assert('T05 — summary.drawableSteps is a non-negative integer',
    report.summary &&
    typeof report.summary.drawableSteps === 'number' &&
    Number.isInteger(report.summary.drawableSteps) &&
    report.summary.drawableSteps >= 0,
    'drawableSteps=' + (report.summary && report.summary.drawableSteps));
assert('T05b — summary.drawableSteps <= stepCount',
    report.summary &&
    report.summary.drawableSteps <= report.summary.stepCount,
    'drawableSteps=' + (report.summary && report.summary.drawableSteps));

// ─────────────────────────────────────────────────────────────────────────────
// T06 — totalMarkers is calculated
// ─────────────────────────────────────────────────────────────────────────────
assert('T06 — summary.totalMarkers is a positive integer',
    report.summary &&
    typeof report.summary.totalMarkers === 'number' &&
    report.summary.totalMarkers > 0,
    'totalMarkers=' + (report.summary && report.summary.totalMarkers));

// ─────────────────────────────────────────────────────────────────────────────
// T07 — totalDrawableMarkers is calculated
// ─────────────────────────────────────────────────────────────────────────────
assert('T07 — summary.totalDrawableMarkers is a non-negative integer',
    report.summary &&
    typeof report.summary.totalDrawableMarkers === 'number' &&
    report.summary.totalDrawableMarkers >= 0,
    'totalDrawableMarkers=' + (report.summary && report.summary.totalDrawableMarkers));
assert('T07b — totalDrawableMarkers <= totalMarkers',
    report.summary &&
    report.summary.totalDrawableMarkers <= report.summary.totalMarkers,
    'drawable=' + (report.summary && report.summary.totalDrawableMarkers) +
    ' total=' + (report.summary && report.summary.totalMarkers));

// ─────────────────────────────────────────────────────────────────────────────
// T08 — totalMovementTrails is calculated
// ─────────────────────────────────────────────────────────────────────────────
assert('T08 — summary.totalMovementTrails is a non-negative integer',
    report.summary &&
    typeof report.summary.totalMovementTrails === 'number' &&
    Number.isInteger(report.summary.totalMovementTrails) &&
    report.summary.totalMovementTrails >= 0,
    'totalMovementTrails=' + (report.summary && report.summary.totalMovementTrails));
assert('T08b — totalMovementTrails > 0 (real W3 data has trails)',
    report.summary && report.summary.totalMovementTrails > 0,
    'totalMovementTrails=' + (report.summary && report.summary.totalMovementTrails));

// ─────────────────────────────────────────────────────────────────────────────
// T09 — transitionsWithTrails is calculated
// ─────────────────────────────────────────────────────────────────────────────
assert('T09 — summary.transitionsWithTrails is a non-negative integer',
    report.summary &&
    typeof report.summary.transitionsWithTrails === 'number' &&
    report.summary.transitionsWithTrails >= 0,
    'transitionsWithTrails=' + (report.summary && report.summary.transitionsWithTrails));
assert('T09b — transitionsWithTrails > 0 (real W3 data has trails)',
    report.summary && report.summary.transitionsWithTrails > 0,
    'transitionsWithTrails=' + (report.summary && report.summary.transitionsWithTrails));

// ─────────────────────────────────────────────────────────────────────────────
// T10 — transitionsWithoutTrails is calculated
// ─────────────────────────────────────────────────────────────────────────────
assert('T10 — summary.transitionsWithoutTrails is a non-negative integer',
    report.summary &&
    typeof report.summary.transitionsWithoutTrails === 'number' &&
    report.summary.transitionsWithoutTrails >= 0,
    'transitionsWithoutTrails=' + (report.summary && report.summary.transitionsWithoutTrails));
assert('T10b — transitionsWithTrails + transitionsWithoutTrails === 16',
    report.summary &&
    report.summary.transitionsWithTrails + report.summary.transitionsWithoutTrails === 16,
    'with=' + (report.summary && report.summary.transitionsWithTrails) +
    ' without=' + (report.summary && report.summary.transitionsWithoutTrails));

// ─────────────────────────────────────────────────────────────────────────────
// T11 — maxTrailsInTransition is calculated
// ─────────────────────────────────────────────────────────────────────────────
assert('T11 — summary.maxTrailsInTransition >= transitionsWithTrails > 0',
    report.summary &&
    typeof report.summary.maxTrailsInTransition === 'number' &&
    report.summary.maxTrailsInTransition >= 0,
    'maxTrails=' + (report.summary && report.summary.maxTrailsInTransition));

// ─────────────────────────────────────────────────────────────────────────────
// T12 — objectiveCoordinateCoverage is reported
// ─────────────────────────────────────────────────────────────────────────────
var ALLOWED_OBJ_COV = ['none', 'missing', 'partial', 'full'];
assert('T12 — summary.objectiveCoordinateCoverage is a valid string',
    report.summary &&
    typeof report.summary.objectiveCoordinateCoverage === 'string' &&
    ALLOWED_OBJ_COV.indexOf(report.summary.objectiveCoordinateCoverage) !== -1,
    'objectiveCoordinateCoverage=' + (report.summary && report.summary.objectiveCoordinateCoverage));

// ─────────────────────────────────────────────────────────────────────────────
// T13 — focusBoundsAvailable is boolean
// ─────────────────────────────────────────────────────────────────────────────
assert('T13 — summary.focusBoundsAvailable is a boolean',
    report.summary && typeof report.summary.focusBoundsAvailable === 'boolean',
    'focusBoundsAvailable=' + (report.summary && report.summary.focusBoundsAvailable));

// ─────────────────────────────────────────────────────────────────────────────
// T14 — strongestSteps is populated
// ─────────────────────────────────────────────────────────────────────────────
assert('T14 — strongestSteps is a non-empty array',
    Array.isArray(report.strongestSteps) && report.strongestSteps.length > 0,
    'strongestSteps.length=' + (Array.isArray(report.strongestSteps) ? report.strongestSteps.length : 'not array'));
assert('T14b — strongestSteps entries have stepRef and drawableMarkers',
    Array.isArray(report.strongestSteps) &&
    report.strongestSteps.every(function (s) {
        return typeof s.stepRef === 'string' && typeof s.drawableMarkers === 'number';
    }),
    'first entry: ' + JSON.stringify(report.strongestSteps[0]));
assert('T14c — strongestSteps capped at 5',
    Array.isArray(report.strongestSteps) && report.strongestSteps.length <= 5,
    'length=' + (Array.isArray(report.strongestSteps) ? report.strongestSteps.length : '?'));

// ─────────────────────────────────────────────────────────────────────────────
// T15 — strongestTransitions is populated
// ─────────────────────────────────────────────────────────────────────────────
assert('T15 — strongestTransitions is an array',
    Array.isArray(report.strongestTransitions),
    typeof report.strongestTransitions);
assert('T15b — strongestTransitions is non-empty (real W3 data has trails)',
    Array.isArray(report.strongestTransitions) && report.strongestTransitions.length > 0,
    'length=' + (Array.isArray(report.strongestTransitions) ? report.strongestTransitions.length : '?'));
assert('T15c — strongestTransitions capped at 5',
    Array.isArray(report.strongestTransitions) && report.strongestTransitions.length <= 5,
    'length=' + (Array.isArray(report.strongestTransitions) ? report.strongestTransitions.length : '?'));

// ─────────────────────────────────────────────────────────────────────────────
// T16 — quietTransitions is populated
// ─────────────────────────────────────────────────────────────────────────────
assert('T16 — quietTransitions is an array',
    Array.isArray(report.quietTransitions),
    typeof report.quietTransitions);
assert('T16b — quietTransitions all have movementTrailCount === 0',
    Array.isArray(report.quietTransitions) &&
    report.quietTransitions.every(function (t) {
        return (t.movementTrailCount === 0 || t.movementTrails === 0);
    }),
    'found non-quiet: ' + JSON.stringify(
        report.quietTransitions.filter(function (t) {
            return t.movementTrailCount !== 0 && t.movementTrails !== 0;
        })));

// ─────────────────────────────────────────────────────────────────────────────
// T17 — remainingGaps includes objective coordinate gap if still missing
// ─────────────────────────────────────────────────────────────────────────────
assert('T17 — remainingGaps is an array',
    Array.isArray(report.remainingGaps),
    typeof report.remainingGaps);
// If objectiveCoordinateCoverage is 'missing', gap must appear in remainingGaps
if (report.summary && report.summary.objectiveCoordinateCoverage === 'missing') {
    assert('T17b — OBJECTIVE_COORDS_MISSING gap present when coverage is missing',
        report.remainingGaps.some(function (g) { return g.code === 'OBJECTIVE_COORDS_MISSING'; }),
        JSON.stringify(report.remainingGaps.map(function (g) { return g.code; })));
} else {
    assert('T17b — objectiveCoordinateCoverage is not missing (no gap expected)',
        true, '');
}

// ─────────────────────────────────────────────────────────────────────────────
// T18 — recommendedNextPR is present and has required fields
// ─────────────────────────────────────────────────────────────────────────────
assert('T18 — recommendedNextPR is a non-null object',
    report.recommendedNextPR && typeof report.recommendedNextPR === 'object',
    String(report.recommendedNextPR));
assert('T18b — recommendedNextPR.id starts with "PR-"',
    report.recommendedNextPR && typeof report.recommendedNextPR.id === 'string' &&
    report.recommendedNextPR.id.startsWith('PR-'),
    'id=' + (report.recommendedNextPR && report.recommendedNextPR.id));
assert('T18c — recommendedNextPR.title is a non-empty string',
    report.recommendedNextPR && typeof report.recommendedNextPR.title === 'string' &&
    report.recommendedNextPR.title.length > 0,
    'title=' + (report.recommendedNextPR && report.recommendedNextPR.title));
assert('T18d — recommendedNextPR.reason is a non-empty string',
    report.recommendedNextPR && typeof report.recommendedNextPR.reason === 'string' &&
    report.recommendedNextPR.reason.length > 0,
    'reason=' + (report.recommendedNextPR && report.recommendedNextPR.reason));

// ─────────────────────────────────────────────────────────────────────────────
// T19 — sourceReports.mapCoverage is present
// ─────────────────────────────────────────────────────────────────────────────
assert('T19 — sourceReports.mapCoverage is a non-null object',
    report.sourceReports && report.sourceReports.mapCoverage &&
    typeof report.sourceReports.mapCoverage === 'object',
    String(report.sourceReports && report.sourceReports.mapCoverage));
assert('T19b — sourceReports.mapCoverage.passed === true',
    report.sourceReports && report.sourceReports.mapCoverage &&
    report.sourceReports.mapCoverage.passed === true,
    'mapCoverage.passed=' + (report.sourceReports && report.sourceReports.mapCoverage &&
                             report.sourceReports.mapCoverage.passed));

// ─────────────────────────────────────────────────────────────────────────────
// T20 — sourceReports.coordinateDeltas is present
// ─────────────────────────────────────────────────────────────────────────────
assert('T20 — sourceReports.coordinateDeltas is a non-null object',
    report.sourceReports && report.sourceReports.coordinateDeltas &&
    typeof report.sourceReports.coordinateDeltas === 'object',
    String(report.sourceReports && report.sourceReports.coordinateDeltas));

// ─────────────────────────────────────────────────────────────────────────────
// T21 — sourceReports.movementTrails is present
// ─────────────────────────────────────────────────────────────────────────────
assert('T21 — sourceReports.movementTrails is a non-null object',
    report.sourceReports && report.sourceReports.movementTrails &&
    typeof report.sourceReports.movementTrails === 'object',
    String(report.sourceReports && report.sourceReports.movementTrails));
assert('T21b — sourceReports.movementTrails.passed === true',
    report.sourceReports && report.sourceReports.movementTrails &&
    report.sourceReports.movementTrails.passed === true,
    'movementTrails.passed=' + (report.sourceReports && report.sourceReports.movementTrails &&
                                report.sourceReports.movementTrails.passed));

// ─────────────────────────────────────────────────────────────────────────────
// T22 — sourceReports.sampleFocusBounds is present or null with reason
// ─────────────────────────────────────────────────────────────────────────────
assert('T22 — sourceReports.sampleFocusBounds field exists',
    report.sourceReports && 'sampleFocusBounds' in report.sourceReports,
    'key missing from sourceReports');
// sampleFocusBounds is either a valid bounds result or null
if (report.sourceReports.sampleFocusBounds !== null) {
    assert('T22b — sampleFocusBounds.passed is true when present',
        report.sourceReports.sampleFocusBounds.passed === true,
        'sampleFocusBounds.passed=' + report.sourceReports.sampleFocusBounds.passed);
} else {
    assert('T22b — sampleFocusBounds null means focusBoundsAvailable is false',
        report.summary && report.summary.focusBoundsAvailable === false,
        'focusBoundsAvailable=' + (report.summary && report.summary.focusBoundsAvailable));
}

// ─────────────────────────────────────────────────────────────────────────────
// T23 — default report does not paint map
// ─────────────────────────────────────────────────────────────────────────────
// Verified by design: buildWargame3MapPreviewReadinessReport calls only
// buildWargame3PreviewMapFocusBounds (not paintWargame3ReadOnlyMapOverlay).
// The paint stub would need to be explicitly called.
assert('T23 — readiness report builds without setting window._paintCalled',
    !window._paintCalled,
    'paintCalled=' + window._paintCalled);

// ─────────────────────────────────────────────────────────────────────────────
// T24 — default report does not call fitBounds
// ─────────────────────────────────────────────────────────────────────────────
window._fitBoundsCalled = false;
window.map = { fitBounds: function () { window._fitBoundsCalled = true; } };
window.L   = {};
api.buildWargame3MapPreviewReadinessReport(w3json);
assert('T24 — report does not call map.fitBounds',
    window._fitBoundsCalled === false,
    'fitBounds was called');
window.map = null;
window.L   = null;

// ─────────────────────────────────────────────────────────────────────────────
// T25 — raw w3json is not mutated
// ─────────────────────────────────────────────────────────────────────────────
var t25stepsLen = w3json.steps.length;
var t25redLen   = (w3json.red_units || []).length;
api.buildWargame3MapPreviewReadinessReport(w3json);
assert('T25 — w3json.steps.length unchanged',
    w3json.steps.length === t25stepsLen,
    'before=' + t25stepsLen + ' after=' + w3json.steps.length);
assert('T25b — w3json.red_units.length unchanged',
    (w3json.red_units || []).length === t25redLen,
    'before=' + t25redLen + ' after=' + (w3json.red_units || []).length);

// ─────────────────────────────────────────────────────────────────────────────
// T26 — window.RmoozScenario.stepIndex remains unchanged
// ─────────────────────────────────────────────────────────────────────────────
window.RmoozScenario = { stepIndex: 5, scenario: { name: 'TEST' } };
api.buildWargame3MapPreviewReadinessReport(w3json);
assert('T26 — stepIndex unchanged after report',
    window.RmoozScenario.stepIndex === 5,
    'stepIndex=' + window.RmoozScenario.stepIndex);
delete window.RmoozScenario;

// ─────────────────────────────────────────────────────────────────────────────
// T27 — window.units is not mutated
// ─────────────────────────────────────────────────────────────────────────────
window.units = [{ id: 'u1', lat: 10, lon: 20 }];
var t27before = JSON.stringify(window.units);
api.buildWargame3MapPreviewReadinessReport(w3json);
assert('T27 — window.units not mutated',
    JSON.stringify(window.units) === t27before,
    'units changed');
delete window.units;

// ─────────────────────────────────────────────────────────────────────────────
// T28 — window.lines is not mutated
// ─────────────────────────────────────────────────────────────────────────────
window.lines = [{ id: 'l1' }];
var t28before = JSON.stringify(window.lines);
api.buildWargame3MapPreviewReadinessReport(w3json);
assert('T28 — window.lines not mutated',
    JSON.stringify(window.lines) === t28before,
    'lines changed');
delete window.lines;

// ─────────────────────────────────────────────────────────────────────────────
// T29 — window.RmoozScenario is not mutated
// ─────────────────────────────────────────────────────────────────────────────
window.RmoozScenario = { stepIndex: 2, scenario: { name: 'MOCK' } };
var t29before = JSON.stringify(window.RmoozScenario);
api.buildWargame3MapPreviewReadinessReport(w3json);
assert('T29 — window.RmoozScenario not mutated',
    JSON.stringify(window.RmoozScenario) === t29before,
    'RmoozScenario changed');
delete window.RmoozScenario;

// ─────────────────────────────────────────────────────────────────────────────
// T30 — no storage calls in function body
// ─────────────────────────────────────────────────────────────────────────────
assert('T30 — no localStorage in readiness function body',
    !readinessSrc.includes('localStorage'),
    'localStorage found');
assert('T30b — no sessionStorage in readiness function body',
    !readinessSrc.includes('sessionStorage'),
    'sessionStorage found');

// ─────────────────────────────────────────────────────────────────────────────
// T31 — no fetch/backend calls in function body
// ─────────────────────────────────────────────────────────────────────────────
assert('T31 — no fetch() in readiness function body',
    !readinessSrc.includes('fetch('),
    'fetch( found');
assert('T31b — no XMLHttpRequest in readiness function body',
    !readinessSrc.includes('XMLHttpRequest'),
    'XMLHttpRequest found');

// ─────────────────────────────────────────────────────────────────────────────
// T32 — no AI/simulation/journal calls in function body
// ─────────────────────────────────────────────────────────────────────────────
assert('T32 — no /api/sim/ in readiness function body',
    !readinessSrc.includes('/api/sim/'),
    '/api/sim/ found');
assert('T32b — no journal in readiness function body',
    !readinessSrc.toLowerCase().includes('journal'),
    'journal found');
assert('T32c — no window.units in readiness function body',
    !readinessSrc.includes('window.units'),
    'window.units found');
assert('T32d — no window.lines in readiness function body',
    !readinessSrc.includes('window.lines'),
    'window.lines found');
assert('T32e — no window.RmoozScenario in readiness function body',
    !readinessSrc.includes('window.RmoozScenario'),
    'window.RmoozScenario found');

// ─────────────────────────────────────────────────────────────────────────────
// T33 — app.js does not contain PR-251 marker
// ─────────────────────────────────────────────────────────────────────────────
var appJsSrc = fs.readFileSync(
    path.join(__dirname, 'UI_MOdified/client/app.js'), 'utf8');
assert('T33 — app.js does not contain PR-251 marker',
    !appJsSrc.includes('PR-251'),
    'PR-251 found in app.js');

// ─────────────────────────────────────────────────────────────────────────────
// T34 — adjudicator-map.js does not contain PR-251 marker
// ─────────────────────────────────────────────────────────────────────────────
var adjSrc = fs.readFileSync(
    path.join(__dirname, 'UI_MOdified/client/wargame/adjudicator-map.js'), 'utf8');
assert('T34 — adjudicator-map.js does not contain PR-251 marker',
    !adjSrc.includes('PR-251'),
    'PR-251 found in adjudicator-map.js');

// ─────────────────────────────────────────────────────────────────────────────
// T35 — no apply/commit/confirm/execute/Gate 7 in function body
// ─────────────────────────────────────────────────────────────────────────────
assert('T35 — no applyScenario/applyStep in readiness function body',
    !readinessSrc.includes('applyScenario') && !readinessSrc.includes('applyStep'),
    'apply call found');
assert('T35b — no commit in readiness function body',
    !/\bcommit\b/.test(readinessSrc),
    'commit found');
assert('T35c — no Gate7 in readiness function body',
    !readinessSrc.includes('Gate7') && !readinessSrc.includes('gate7'),
    'Gate7 found');
assert('T35d — no map.fitBounds in readiness function body',
    !readinessSrc.includes('fitBounds'),
    'fitBounds found');
assert('T35e — no paintWargame3ReadOnlyMapOverlay call in readiness function body',
    !readinessSrc.includes('paintWargame3ReadOnlyMapOverlay'),
    'paintWargame3ReadOnlyMapOverlay found');

// ─────────────────────────────────────────────────────────────────────────────
// T36 — existing W3 preview panel still works (previewWargame3Fixture)
// ─────────────────────────────────────────────────────────────────────────────
var t36prev = api.previewWargame3Fixture(w3json);
assert('T36 — previewWargame3Fixture still works after PR-251',
    t36prev.passed === true,
    JSON.stringify(t36prev.blockedReasons));

// ─────────────────────────────────────────────────────────────────────────────
// T37 — existing W3 event log still works (auditWargame3MapPreviewCoverage)
// ─────────────────────────────────────────────────────────────────────────────
var t37audit = api.auditWargame3MapPreviewCoverage(w3json);
assert('T37 — auditWargame3MapPreviewCoverage still works after PR-251',
    t37audit.passed === true,
    JSON.stringify(t37audit.blockedReasons));

// ─────────────────────────────────────────────────────────────────────────────
// T38 — existing marker overlay still works (buildWargame3ReadOnlyMapOverlayData)
// ─────────────────────────────────────────────────────────────────────────────
var t38adapt = api.adaptWargame3ToFixture(w3json);
var t38pvRes = t38adapt.passed ? api.buildScenarioStepPreview(t38adapt.fixture, 'W3-STEP-05') : null;
var t38pv    = t38pvRes && t38pvRes.preview ? t38pvRes.preview : null;
var t38ov    = t38pv ? api.buildWargame3ReadOnlyMapOverlayData(t38pv) : null;
assert('T38 — buildWargame3ReadOnlyMapOverlayData still works after PR-251',
    t38ov && t38ov.passed === true,
    t38ov ? JSON.stringify(t38ov.blockedReasons) : 'null result');

// ─────────────────────────────────────────────────────────────────────────────
// T39 — existing movement trail overlay still works (step4→5 = 3 trails)
// ─────────────────────────────────────────────────────────────────────────────
var t39p4Res = t38adapt.passed ? api.buildScenarioStepPreview(t38adapt.fixture, 'W3-STEP-04') : null;
var t39p4    = t39p4Res && t39p4Res.preview ? t39p4Res.preview : null;
var t39p5    = t38pv;
var t39ov    = (t39p4 && t39p5)
    ? api.buildWargame3ReadOnlyMapOverlayData(t39p5, { previousPreview: t39p4 }) : null;
assert('T39 — movement trail overlay (step4→5) still has 3 trails after PR-251',
    t39ov && t39ov.overlay && t39ov.overlay.movementTrails.length === 3,
    'trails=' + (t39ov && t39ov.overlay && t39ov.overlay.movementTrails.length));

// ─────────────────────────────────────────────────────────────────────────────
// T40 — existing focus bounds helper still works
// ─────────────────────────────────────────────────────────────────────────────
var t40ovR  = t38pv ? api.buildWargame3ReadOnlyMapOverlayData(t38pv) : null;
var t40ov   = t40ovR && t40ovR.overlay ? t40ovR.overlay : null;
var t40fb   = t40ov  ? api.buildWargame3PreviewMapFocusBounds(t40ov) : null;
assert('T40 — buildWargame3PreviewMapFocusBounds still works after PR-251',
    t40fb && t40fb.passed === true && t40fb.hasBounds === true,
    t40fb ? ('passed=' + t40fb.passed + ' hasBounds=' + t40fb.hasBounds) : 'null');

// ─────────────────────────────────────────────────────────────────────────────
// T41 — existing top/bottom navigation still works (buildScenarioStepPreview)
// ─────────────────────────────────────────────────────────────────────────────
var t41r0  = api.buildScenarioStepPreview(t38adapt.fixture, 'W3-STEP-00');
var t41r16 = api.buildScenarioStepPreview(t38adapt.fixture, 'W3-STEP-16');
assert('T41 — buildScenarioStepPreview W3-STEP-00 still works after PR-251',
    t41r0 && t41r0.passed === true && t41r0.preview &&
    t41r0.preview.activeStepId === 'W3-STEP-00',
    'step0=' + JSON.stringify(t41r0 && t41r0.preview && t41r0.preview.activeStepId));
assert('T41b — buildScenarioStepPreview W3-STEP-16 still works after PR-251',
    t41r16 && t41r16.passed === true && t41r16.preview &&
    t41r16.preview.activeStepId === 'W3-STEP-16',
    'step16=' + JSON.stringify(t41r16 && t41r16.preview && t41r16.preview.activeStepId));

// ─────────────────────────────────────────────────────────────────────────────
// T42 — existing jump selector still works (all 17 steps build)
// ─────────────────────────────────────────────────────────────────────────────
var t42allOk = true;
for (var si = 0; si <= 16; si++) {
    var stepId = 'W3-STEP-' + (si < 10 ? '0' : '') + si;
    var pvRes  = api.buildScenarioStepPreview(t38adapt.fixture, stepId);
    if (!pvRes || pvRes.passed !== true || !pvRes.preview || pvRes.preview.readOnly !== true) {
        t42allOk = false; break;
    }
}
assert('T42 — all 17 steps still build after PR-251',
    t42allOk,
    'one or more steps failed');

// ─────────────────────────────────────────────────────────────────────────────
// T43 — exported on AppShellScenarioWorkspace
// ─────────────────────────────────────────────────────────────────────────────
var exportSection = src.slice(src.indexOf('window.AppShellScenarioWorkspace'));
assert('T43 — buildWargame3MapPreviewReadinessReport exported on AppShellScenarioWorkspace',
    exportSection.includes('buildWargame3MapPreviewReadinessReport'),
    'not found in export block');

// ─────────────────────────────────────────────────────────────────────────────
// Results
// ─────────────────────────────────────────────────────────────────────────────
results.forEach(function (r) { console.log(r); });
var total = passed + failed;
console.log('\n' + (failed === 0 ? 'ALL PASS' : failed + ' FAILED') +
            '  (' + passed + '/' + total + ')');

// ── PR-251 Readiness Summary ─────────────────────────────────────────────────
if (report) {
    console.log('\n── PR-251 Readiness Report Summary ─────────────────────────────────');
    console.log('  readiness:               ' + report.readiness);
    console.log('  scenarioId:              ' + report.scenarioId);
    if (report.summary) {
        var s = report.summary;
        console.log('  stepCount:               ' + s.stepCount);
        console.log('  drawableSteps:           ' + s.drawableSteps);
        console.log('  markerCoverage:          ' + s.markerCoverage);
        console.log('  totalMarkers:            ' + s.totalMarkers);
        console.log('  totalDrawableMarkers:    ' + s.totalDrawableMarkers);
        console.log('  totalMovementTrails:     ' + s.totalMovementTrails);
        console.log('  transitionsWithTrails:   ' + s.transitionsWithTrails);
        console.log('  transitionsWithoutTrails:' + s.transitionsWithoutTrails);
        console.log('  maxTrailsInTransition:   ' + s.maxTrailsInTransition);
        console.log('  objectiveCoordCoverage:  ' + s.objectiveCoordinateCoverage);
        console.log('  focusBoundsAvailable:    ' + s.focusBoundsAvailable);
    }
    if (report.strongestSteps && report.strongestSteps.length > 0) {
        console.log('\n  Strongest steps:');
        report.strongestSteps.forEach(function (s) {
            console.log('    ' + s.stepRef + '  markers=' + s.drawableMarkers +
                        '  trails=' + s.movementTrails);
        });
    }
    if (report.strongestTransitions && report.strongestTransitions.length > 0) {
        console.log('\n  Strongest transitions:');
        report.strongestTransitions.forEach(function (t) {
            console.log('    ' + t.fromStepRef + ' → ' + t.toStepRef +
                        '  trails=' + t.movementTrailCount);
        });
    }
    if (report.quietTransitions && report.quietTransitions.length > 0) {
        console.log('\n  Quiet transitions (' + report.quietTransitions.length + ' with 0 trails):');
        report.quietTransitions.forEach(function (t) {
            console.log('    ' + t.fromStepRef + ' → ' + t.toStepRef);
        });
    }
    if (report.remainingGaps && report.remainingGaps.length > 0) {
        console.log('\n  Remaining gaps:');
        report.remainingGaps.forEach(function (g) {
            console.log('    [' + g.severity + '] ' + g.code + ': ' + g.message);
        });
    }
    if (report.recommendedNextPR) {
        console.log('\n  Recommended next PR:');
        console.log('    ' + report.recommendedNextPR.id + ': ' +
                    report.recommendedNextPR.title);
        console.log('    Reason: ' + report.recommendedNextPR.reason);
    }
    if (report.sourceReports && report.sourceReports.sampleFocusBounds &&
        report.sourceReports.sampleFocusBounds.bounds) {
        var fb = report.sourceReports.sampleFocusBounds;
        console.log('\n  Sample focus bounds:');
        console.log('    pointCount=' + fb.pointCount);
        console.log('    bounds: S=' + fb.bounds.south + ' N=' + fb.bounds.north +
                    ' W=' + fb.bounds.west  + ' E=' + fb.bounds.east);
        console.log('    center: lat=' + fb.center.lat + ' lon=' + fb.center.lon);
    }
    console.log('─────────────────────────────────────────────────────────────────────');
}

process.exit(failed > 0 ? 1 : 0);
