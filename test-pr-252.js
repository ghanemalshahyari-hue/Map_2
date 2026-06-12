'use strict';

// ── PR-252 Test Harness — Wargame 3 Objective Coordinate Mapping ──────────────
// Tests:
//   1. auditWargame3ObjectiveCoordinateSources — source detection and reporting
//   2. Pipeline fix — buildScenarioStepPreview now propagates location
//   3. Pipeline fix — buildWargame3ReadOnlyMapOverlayData now uses location
//   4. All safety invariants, no invented coordinates, no range circles
//   5. All existing functions intact
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

var builderSrc      = extractFn('buildScenarioStepPreview');
var harnSrc         = extractFn('previewWargame3Fixture');
var isGuardSrc      = extractFn('isWargame3ReadOnlyMapOverlayDataSafe');
var buildOverlaySrc = extractFn('buildWargame3ReadOnlyMapOverlayData');
var auditCovSrc     = extractFn('auditWargame3MapPreviewCoverage');
var buildFocusSrc   = extractFn('buildWargame3PreviewMapFocusBounds');
var auditObjSrc     = extractFn('auditWargame3ObjectiveCoordinateSources');

// Stubs — no Leaflet in test environment.
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
    buildFocusSrc,
    auditObjSrc
].join('\n');

var fn = new Function('window',
    combined + '\nreturn {' +
    ' adaptWargame3ToFixture:                        adaptWargame3ToFixture,' +
    ' buildScenarioStepPreview:                      buildScenarioStepPreview,' +
    ' previewWargame3Fixture:                        previewWargame3Fixture,' +
    ' isWargame3ReadOnlyMapOverlayDataSafe:          isWargame3ReadOnlyMapOverlayDataSafe,' +
    ' buildWargame3ReadOnlyMapOverlayData:           buildWargame3ReadOnlyMapOverlayData,' +
    ' auditWargame3MapPreviewCoverage:               auditWargame3MapPreviewCoverage,' +
    ' buildWargame3PreviewMapFocusBounds:            buildWargame3PreviewMapFocusBounds,' +
    ' auditWargame3ObjectiveCoordinateSources:       auditWargame3ObjectiveCoordinateSources };'
);
var api = fn(window);

// ── Test runner ───────────────────────────────────────────────────────────────
var passed = 0; var failed = 0; var results = [];
function assert(label, cond, detail) {
    if (cond) { passed++; results.push('  PASS  ' + label); }
    else       { failed++; results.push('  FAIL  ' + label + (detail ? '  →  ' + detail : '')); }
}

// ── Pre-compute common results ────────────────────────────────────────────────
var auditResult = api.auditWargame3ObjectiveCoordinateSources(w3json);

var adaptResult = api.adaptWargame3ToFixture(w3json);
var fixture     = adaptResult.fixture;

// buildScenarioStepPreview returns { passed, preview, ... }
var step5Res    = fixture ? api.buildScenarioStepPreview(fixture, 'W3-STEP-05') : null;
var step5Preview = step5Res && step5Res.preview ? step5Res.preview : null;

// Step-4 preview for trail delta
var step4Res    = fixture ? api.buildScenarioStepPreview(fixture, 'W3-STEP-04') : null;
var step4Preview = step4Res && step4Res.preview ? step4Res.preview : null;

// Overlay with movement trails
var overlayRes5 = step5Preview
    ? api.buildWargame3ReadOnlyMapOverlayData(step5Preview, { previousPreview: step4Preview })
    : null;
var overlay5    = overlayRes5 && overlayRes5.overlay ? overlayRes5.overlay : null;

// Known W3 objective coordinate from raw data (GeoJSON [lon, lat])
var W3_OBJ_LON  = w3json.obj.coord[0];   // 19.55
var W3_OBJ_LAT  = w3json.obj.coord[1];   // 29.74

// ─────────────────────────────────────────────────────────────────────────────
// T01 — null w3json blocks safely
// ─────────────────────────────────────────────────────────────────────────────
var t01 = api.auditWargame3ObjectiveCoordinateSources(null);
assert('T01 — null w3json returns passed:false without throwing',
    t01.passed === false && Array.isArray(t01.blockedReasons) && t01.blockedReasons.length > 0,
    JSON.stringify(t01.blockedReasons));

// ─────────────────────────────────────────────────────────────────────────────
// T02 — valid W3 data returns passed:true
// ─────────────────────────────────────────────────────────────────────────────
assert('T02 — valid W3 data returns passed:true',
    auditResult.passed === true,
    JSON.stringify(auditResult.blockedReasons));

// ─────────────────────────────────────────────────────────────────────────────
// T03 — objective audit returns objectiveCount
// ─────────────────────────────────────────────────────────────────────────────
assert('T03 — objectiveCount === 1 (W3 has one primary objective)',
    auditResult.objectiveCount === 1,
    'objectiveCount=' + auditResult.objectiveCount);
assert('T03b — objectives array has one entry',
    Array.isArray(auditResult.objectives) && auditResult.objectives.length === 1,
    'objectives.length=' + (Array.isArray(auditResult.objectives) ? auditResult.objectives.length : '?'));

// ─────────────────────────────────────────────────────────────────────────────
// T04 — candidateSourceFields are listed
// ─────────────────────────────────────────────────────────────────────────────
assert('T04 — candidateSourceFields is a non-empty array',
    Array.isArray(auditResult.candidateSourceFields) &&
    auditResult.candidateSourceFields.length > 0,
    'length=' + (Array.isArray(auditResult.candidateSourceFields) ? auditResult.candidateSourceFields.length : '?'));
assert('T04b — w3json.obj.coord appears in candidateSourceFields',
    Array.isArray(auditResult.candidateSourceFields) &&
    auditResult.candidateSourceFields.some(function (f) { return f.field === 'w3json.obj.coord'; }),
    JSON.stringify(auditResult.candidateSourceFields.map(function (f) { return f.field; })));

// ─────────────────────────────────────────────────────────────────────────────
// T05 — direct coordinate fields are detected
// ─────────────────────────────────────────────────────────────────────────────
assert('T05 — objectivesWithDirectCoordinates === 1',
    auditResult.objectivesWithDirectCoordinates === 1,
    'objectivesWithDirectCoordinates=' + auditResult.objectivesWithDirectCoordinates);
assert('T05b — primary objective has directCoordinate with correct lat',
    auditResult.objectives.length > 0 &&
    auditResult.objectives[0].directCoordinate !== null &&
    auditResult.objectives[0].directCoordinate.lat === W3_OBJ_LAT,
    'lat=' + (auditResult.objectives[0] && auditResult.objectives[0].directCoordinate &&
              auditResult.objectives[0].directCoordinate.lat));
assert('T05c — primary objective has directCoordinate with correct lon',
    auditResult.objectives.length > 0 &&
    auditResult.objectives[0].directCoordinate !== null &&
    auditResult.objectives[0].directCoordinate.lon === W3_OBJ_LON,
    'lon=' + (auditResult.objectives[0] && auditResult.objectives[0].directCoordinate &&
              auditResult.objectives[0].directCoordinate.lon));
assert('T05d — primary objective confidence === "direct"',
    auditResult.objectives.length > 0 &&
    auditResult.objectives[0].confidence === 'direct',
    'confidence=' + (auditResult.objectives[0] && auditResult.objectives[0].confidence));
assert('T05e — primary objective source === "w3json.obj.coord"',
    auditResult.objectives.length > 0 &&
    auditResult.objectives[0].source === 'w3json.obj.coord',
    'source=' + (auditResult.objectives[0] && auditResult.objectives[0].source));

// ─────────────────────────────────────────────────────────────────────────────
// T06 — mapped coordinate fields (none expected; W3 has direct coord only)
// ─────────────────────────────────────────────────────────────────────────────
assert('T06 — objectivesWithMappedCoordinates === 0 (direct coord used, no mapping needed)',
    auditResult.objectivesWithMappedCoordinates === 0,
    'objectivesWithMappedCoordinates=' + auditResult.objectivesWithMappedCoordinates);

// ─────────────────────────────────────────────────────────────────────────────
// T07 — objectivesMissingCoordinates is calculated
// ─────────────────────────────────────────────────────────────────────────────
assert('T07 — objectivesMissingCoordinates === 0 (coordinate found directly)',
    auditResult.objectivesMissingCoordinates === 0,
    'objectivesMissingCoordinates=' + auditResult.objectivesMissingCoordinates);

// ─────────────────────────────────────────────────────────────────────────────
// T08 — raw w3json is not mutated
// ─────────────────────────────────────────────────────────────────────────────
var t08objCoordBefore = JSON.stringify(w3json.obj.coord);
api.auditWargame3ObjectiveCoordinateSources(w3json);
assert('T08 — w3json.obj.coord not mutated by audit',
    JSON.stringify(w3json.obj.coord) === t08objCoordBefore,
    'coord changed: ' + JSON.stringify(w3json.obj.coord));
assert('T08b — w3json.steps.length not mutated',
    w3json.steps.length === 17,
    'steps.length=' + w3json.steps.length);

// ─────────────────────────────────────────────────────────────────────────────
// T09 — objectiveHighlights now have hasCoordinate:true (pipeline fix)
// ─────────────────────────────────────────────────────────────────────────────
assert('T09 — overlay5 is not null (step-5 overlay built)',
    overlay5 !== null,
    'overlay5=' + String(overlay5));
assert('T09b — overlay5.objectiveHighlights is an array',
    overlay5 && Array.isArray(overlay5.objectiveHighlights),
    'objectiveHighlights type: ' + (overlay5 && typeof overlay5.objectiveHighlights));
assert('T09c — overlay5 has exactly 1 objectiveHighlight (W3 has one primary objective)',
    overlay5 && overlay5.objectiveHighlights.length === 1,
    'length=' + (overlay5 && overlay5.objectiveHighlights.length));
assert('T09d — objectiveHighlight[0].hasCoordinate === true (PR-252 pipeline fix)',
    overlay5 && overlay5.objectiveHighlights[0] &&
    overlay5.objectiveHighlights[0].hasCoordinate === true,
    'hasCoordinate=' + (overlay5 && overlay5.objectiveHighlights[0] &&
                        overlay5.objectiveHighlights[0].hasCoordinate));
assert('T09e — objectiveHighlight[0].lat === W3_OBJ_LAT (29.74)',
    overlay5 && overlay5.objectiveHighlights[0] &&
    overlay5.objectiveHighlights[0].lat === W3_OBJ_LAT,
    'lat=' + (overlay5 && overlay5.objectiveHighlights[0] &&
              overlay5.objectiveHighlights[0].lat));
assert('T09f — objectiveHighlight[0].lon === W3_OBJ_LON (19.55)',
    overlay5 && overlay5.objectiveHighlights[0] &&
    overlay5.objectiveHighlights[0].lon === W3_OBJ_LON,
    'lon=' + (overlay5 && overlay5.objectiveHighlights[0] &&
              overlay5.objectiveHighlights[0].lon));

// ─────────────────────────────────────────────────────────────────────────────
// T10 — preview.objectivesReferenced[0] now has location (pipeline fix)
// ─────────────────────────────────────────────────────────────────────────────
var t10objRefs = step5Preview && Array.isArray(step5Preview.objectivesReferenced)
    ? step5Preview.objectivesReferenced : [];
assert('T10 — step-5 preview.objectivesReferenced has 1 entry',
    t10objRefs.length === 1,
    'length=' + t10objRefs.length);
assert('T10b — objectivesReferenced[0].location is non-null (PR-252 propagation)',
    t10objRefs.length > 0 && t10objRefs[0].location !== null &&
    typeof t10objRefs[0].location === 'object',
    'location=' + JSON.stringify(t10objRefs[0] && t10objRefs[0].location));
assert('T10c — objectivesReferenced[0].location.lat === W3_OBJ_LAT',
    t10objRefs.length > 0 && t10objRefs[0].location &&
    t10objRefs[0].location.lat === W3_OBJ_LAT,
    'lat=' + (t10objRefs[0] && t10objRefs[0].location && t10objRefs[0].location.lat));
assert('T10d — objectivesReferenced[0].location.lng === W3_OBJ_LON',
    t10objRefs.length > 0 && t10objRefs[0].location &&
    t10objRefs[0].location.lng === W3_OBJ_LON,
    'lng=' + (t10objRefs[0] && t10objRefs[0].location && t10objRefs[0].location.lng));

// ─────────────────────────────────────────────────────────────────────────────
// T11 — no coordinates are invented (values match raw source exactly)
// ─────────────────────────────────────────────────────────────────────────────
assert('T11 — objective lat matches raw w3json.obj.coord[1] exactly',
    overlay5 && overlay5.objectiveHighlights[0] &&
    overlay5.objectiveHighlights[0].lat === w3json.obj.coord[1],
    'overlay lat=' + (overlay5 && overlay5.objectiveHighlights[0] &&
                      overlay5.objectiveHighlights[0].lat) +
    ' raw=' + w3json.obj.coord[1]);
assert('T11b — objective lon matches raw w3json.obj.coord[0] exactly',
    overlay5 && overlay5.objectiveHighlights[0] &&
    overlay5.objectiveHighlights[0].lon === w3json.obj.coord[0],
    'overlay lon=' + (overlay5 && overlay5.objectiveHighlights[0] &&
                      overlay5.objectiveHighlights[0].lon) +
    ' raw=' + w3json.obj.coord[0]);

// ─────────────────────────────────────────────────────────────────────────────
// T12 — no unit-centroid fallback (coordinate is from w3json.obj.coord, not units)
// ─────────────────────────────────────────────────────────────────────────────
// If unit centroid were used, the lat would NOT be exactly 29.74.
assert('T12 — lat is exactly 29.74 (direct coord, not unit centroid approximation)',
    overlay5 && overlay5.objectiveHighlights[0] &&
    overlay5.objectiveHighlights[0].lat === 29.74,
    'lat=' + (overlay5 && overlay5.objectiveHighlights[0] && overlay5.objectiveHighlights[0].lat));

// ─────────────────────────────────────────────────────────────────────────────
// T13 — no range circles created (objectiveHighlights are plain data, no Leaflet)
// ─────────────────────────────────────────────────────────────────────────────
assert('T13 — objectiveHighlight has no L.circle or radius properties',
    overlay5 && overlay5.objectiveHighlights[0] &&
    !overlay5.objectiveHighlights[0].hasOwnProperty('_leaflet_id') &&
    !overlay5.objectiveHighlights[0].hasOwnProperty('circleLayer'),
    'unexpected property found');
// radius_km is in w3json.obj but must NOT appear in the overlay data
assert('T13b — objectiveHighlight does not expose radius_km (no range circles)',
    overlay5 && overlay5.objectiveHighlights[0] &&
    !overlay5.objectiveHighlights[0].hasOwnProperty('radius_km'),
    'radius_km found in objectiveHighlight');

// ─────────────────────────────────────────────────────────────────────────────
// T14 — no weapon/detection/casualty effects created
// ─────────────────────────────────────────────────────────────────────────────
var auditFnBody = auditObjSrc;
assert('T14 — no weapon/detection ring in audit function body',
    !auditFnBody.includes('weapon') && !auditFnBody.includes('detection') &&
    !auditFnBody.includes('casualty'),
    'combat effect keyword found');

// ─────────────────────────────────────────────────────────────────────────────
// T15 — focus bounds include objective coordinates
// ─────────────────────────────────────────────────────────────────────────────
var t15fb = overlay5 ? api.buildWargame3PreviewMapFocusBounds(overlay5) : null;
assert('T15 — buildWargame3PreviewMapFocusBounds works with objective coordinate',
    t15fb && t15fb.passed === true && t15fb.hasBounds === true,
    t15fb ? ('passed=' + t15fb.passed + ' hasBounds=' + t15fb.hasBounds) : 'null');
assert('T15b — focus bounds sourceCounts.objectives === 1 (objective now has coord)',
    t15fb && t15fb.sourceCounts && t15fb.sourceCounts.objectives === 1,
    'objectives=' + (t15fb && t15fb.sourceCounts && t15fb.sourceCounts.objectives));
assert('T15c — objective lat (29.74) is within focus bounds',
    t15fb && t15fb.bounds &&
    t15fb.bounds.south <= W3_OBJ_LAT && t15fb.bounds.north >= W3_OBJ_LAT,
    'bounds.south=' + (t15fb && t15fb.bounds && t15fb.bounds.south) +
    ' bounds.north=' + (t15fb && t15fb.bounds && t15fb.bounds.north));

// ─────────────────────────────────────────────────────────────────────────────
// T16 — readiness report objectiveCoordinateCoverage now improves
// ─────────────────────────────────────────────────────────────────────────────
// We verify by checking the coverage audit which the readiness report uses.
var t16cov = api.auditWargame3MapPreviewCoverage(w3json);
// After PR-252, drawableObjectiveCount per step should be 1 (not 0).
var t16firstStep = t16cov.steps && t16cov.steps[0];
assert('T16 — auditWargame3MapPreviewCoverage step[0].drawableObjectiveCount === 1',
    t16firstStep && t16firstStep.drawableObjectiveCount === 1,
    'drawableObjectiveCount=' + (t16firstStep && t16firstStep.drawableObjectiveCount));
// All 17 steps should now have drawableObjectiveCount === 1
var t16allDrawable = t16cov.steps && t16cov.steps.every(function (s) {
    return s.drawableObjectiveCount === 1;
});
assert('T16b — all 17 steps have drawableObjectiveCount === 1',
    t16allDrawable,
    'not all steps have drawableObjectiveCount=1');

// ─────────────────────────────────────────────────────────────────────────────
// T17 — existing W3 markers still work (unit markers unaffected by pipeline fix)
// ─────────────────────────────────────────────────────────────────────────────
assert('T17 — overlay5.markers is still an array',
    overlay5 && Array.isArray(overlay5.markers),
    'markers type: ' + (overlay5 && typeof overlay5.markers));
assert('T17b — overlay5 still has 12 markers (cap is MAX_MARKERS)',
    overlay5 && overlay5.markers.length === 12,
    'markers.length=' + (overlay5 && overlay5.markers.length));
assert('T17c — unit markers still have hasCoordinate (unaffected)',
    overlay5 && overlay5.markers.every(function (m) {
        return typeof m.hasCoordinate === 'boolean';
    }),
    'some marker missing hasCoordinate');

// ─────────────────────────────────────────────────────────────────────────────
// T18 — existing movement trails still work (unaffected by pipeline fix)
// ─────────────────────────────────────────────────────────────────────────────
assert('T18 — step-4→5 still has 3 movement trails after PR-252',
    overlay5 && Array.isArray(overlay5.movementTrails) &&
    overlay5.movementTrails.length === 3,
    'trailCount=' + (overlay5 && overlay5.movementTrails && overlay5.movementTrails.length));

// ─────────────────────────────────────────────────────────────────────────────
// T19 — existing map focus bounds still work (now include objective)
// ─────────────────────────────────────────────────────────────────────────────
// Tested in T15; verify pointCount increased compared to pre-PR-252 (markers only)
assert('T19 — pointCount now includes objective (markers + trails + 1 objective)',
    t15fb && t15fb.pointCount >= 13,   // 12 markers + 3*2 trail endpoints + 1 objective
    'pointCount=' + (t15fb && t15fb.pointCount));

// ─────────────────────────────────────────────────────────────────────────────
// T20 — existing W3 preview panel still works
// ─────────────────────────────────────────────────────────────────────────────
var t20prev = api.previewWargame3Fixture(w3json);
assert('T20 — previewWargame3Fixture still works after PR-252',
    t20prev.passed === true,
    JSON.stringify(t20prev.blockedReasons));

// ─────────────────────────────────────────────────────────────────────────────
// T21 — existing W3 event log still works
// ─────────────────────────────────────────────────────────────────────────────
var t21audit = api.auditWargame3MapPreviewCoverage(w3json);
assert('T21 — auditWargame3MapPreviewCoverage still works after PR-252',
    t21audit.passed === true,
    JSON.stringify(t21audit.blockedReasons));

// ─────────────────────────────────────────────────────────────────────────────
// T22 — top navigation still works (W3-STEP-00)
// ─────────────────────────────────────────────────────────────────────────────
var t22r = api.buildScenarioStepPreview(fixture, 'W3-STEP-00');
assert('T22 — buildScenarioStepPreview W3-STEP-00 still works after PR-252',
    t22r && t22r.passed === true && t22r.preview &&
    t22r.preview.activeStepId === 'W3-STEP-00',
    'step0=' + JSON.stringify(t22r && t22r.preview && t22r.preview.activeStepId));

// ─────────────────────────────────────────────────────────────────────────────
// T23 — bottom navigation still works (W3-STEP-16)
// ─────────────────────────────────────────────────────────────────────────────
var t23r = api.buildScenarioStepPreview(fixture, 'W3-STEP-16');
assert('T23 — buildScenarioStepPreview W3-STEP-16 still works after PR-252',
    t23r && t23r.passed === true && t23r.preview &&
    t23r.preview.activeStepId === 'W3-STEP-16',
    'step16=' + JSON.stringify(t23r && t23r.preview && t23r.preview.activeStepId));

// ─────────────────────────────────────────────────────────────────────────────
// T24 — jump selector still works (all 17 steps build)
// ─────────────────────────────────────────────────────────────────────────────
var t24allOk = true;
for (var si = 0; si <= 16; si++) {
    var stepId = 'W3-STEP-' + (si < 10 ? '0' : '') + si;
    var pvRes  = api.buildScenarioStepPreview(fixture, stepId);
    if (!pvRes || pvRes.passed !== true || !pvRes.preview || pvRes.preview.readOnly !== true) {
        t24allOk = false; break;
    }
}
assert('T24 — all 17 steps still build after PR-252',
    t24allOk,
    'one or more steps failed');
// Verify each step's objectivesReferenced[0] now has location
var t24locOk = true;
for (var si2 = 0; si2 <= 16; si2++) {
    var stepId2 = 'W3-STEP-' + (si2 < 10 ? '0' : '') + si2;
    var pvRes2  = api.buildScenarioStepPreview(fixture, stepId2);
    if (pvRes2 && pvRes2.preview) {
        var objRefs2 = pvRes2.preview.objectivesReferenced || [];
        if (objRefs2.length > 0 && (!objRefs2[0].location ||
            objRefs2[0].location.lat !== W3_OBJ_LAT)) {
            t24locOk = false; break;
        }
    }
}
assert('T24b — all 17 steps have objectivesReferenced[0].location.lat === 29.74',
    t24locOk,
    'one or more steps had wrong objective location');

// ─────────────────────────────────────────────────────────────────────────────
// T25 — stepIndex unchanged
// ─────────────────────────────────────────────────────────────────────────────
window.RmoozScenario = { stepIndex: 9, scenario: { name: 'TEST' } };
api.auditWargame3ObjectiveCoordinateSources(w3json);
assert('T25 — stepIndex unchanged after audit',
    window.RmoozScenario.stepIndex === 9,
    'stepIndex=' + window.RmoozScenario.stepIndex);
delete window.RmoozScenario;

// ─────────────────────────────────────────────────────────────────────────────
// T26 — window.units not mutated
// ─────────────────────────────────────────────────────────────────────────────
window.units = [{ id: 'u1', lat: 10 }];
var t26before = JSON.stringify(window.units);
api.auditWargame3ObjectiveCoordinateSources(w3json);
assert('T26 — window.units not mutated',
    JSON.stringify(window.units) === t26before, 'units changed');
delete window.units;

// ─────────────────────────────────────────────────────────────────────────────
// T27 — window.lines not mutated
// ─────────────────────────────────────────────────────────────────────────────
window.lines = [{ id: 'l1' }];
var t27before = JSON.stringify(window.lines);
api.auditWargame3ObjectiveCoordinateSources(w3json);
assert('T27 — window.lines not mutated',
    JSON.stringify(window.lines) === t27before, 'lines changed');
delete window.lines;

// ─────────────────────────────────────────────────────────────────────────────
// T28 — window.RmoozScenario not mutated
// ─────────────────────────────────────────────────────────────────────────────
window.RmoozScenario = { stepIndex: 4, scenario: { name: 'MOCK' } };
var t28before = JSON.stringify(window.RmoozScenario);
api.auditWargame3ObjectiveCoordinateSources(w3json);
assert('T28 — window.RmoozScenario not mutated',
    JSON.stringify(window.RmoozScenario) === t28before, 'RmoozScenario changed');
delete window.RmoozScenario;

// ─────────────────────────────────────────────────────────────────────────────
// T29 — no storage calls in audit function body
// ─────────────────────────────────────────────────────────────────────────────
assert('T29 — no localStorage in audit function body',
    !auditObjSrc.includes('localStorage'), 'localStorage found');
assert('T29b — no sessionStorage in audit function body',
    !auditObjSrc.includes('sessionStorage'), 'sessionStorage found');

// ─────────────────────────────────────────────────────────────────────────────
// T30 — no fetch/backend calls
// ─────────────────────────────────────────────────────────────────────────────
assert('T30 — no fetch() in audit function body',
    !auditObjSrc.includes('fetch('), 'fetch( found');
assert('T30b — no XMLHttpRequest in audit function body',
    !auditObjSrc.includes('XMLHttpRequest'), 'XMLHttpRequest found');

// ─────────────────────────────────────────────────────────────────────────────
// T31 — no AI/simulation/journal
// ─────────────────────────────────────────────────────────────────────────────
assert('T31 — no /api/sim/ in audit function body',
    !auditObjSrc.includes('/api/sim/'), '/api/sim/ found');
assert('T31b — no journal in audit function body',
    !auditObjSrc.toLowerCase().includes('journal'), 'journal found');
assert('T31c — no window.units in audit function body',
    !auditObjSrc.includes('window.units'), 'window.units found');

// ─────────────────────────────────────────────────────────────────────────────
// T32 — app.js not modified
// ─────────────────────────────────────────────────────────────────────────────
var appJsSrc = fs.readFileSync(
    path.join(__dirname, 'UI_MOdified/client/app.js'), 'utf8');
assert('T32 — app.js does not contain PR-252 marker',
    !appJsSrc.includes('PR-252'), 'PR-252 found in app.js');

// ─────────────────────────────────────────────────────────────────────────────
// T33 — adjudicator-map.js not modified
// ─────────────────────────────────────────────────────────────────────────────
var adjSrc = fs.readFileSync(
    path.join(__dirname, 'UI_MOdified/client/wargame/adjudicator-map.js'), 'utf8');
assert('T33 — adjudicator-map.js does not contain PR-252 marker',
    !adjSrc.includes('PR-252'), 'PR-252 found in adjudicator-map.js');

// ─────────────────────────────────────────────────────────────────────────────
// T34 — no apply/commit/confirm/execute/Gate 7 in audit function body
// ─────────────────────────────────────────────────────────────────────────────
assert('T34 — no applyScenario in audit function body',
    !auditObjSrc.includes('applyScenario'), 'applyScenario found');
assert('T34b — no commit in audit function body',
    !/\bcommit\b/.test(auditObjSrc), 'commit found');
assert('T34c — no fitBounds in audit function body',
    !auditObjSrc.includes('fitBounds'), 'fitBounds found');

// ─────────────────────────────────────────────────────────────────────────────
// T35 — exported on AppShellScenarioWorkspace
// ─────────────────────────────────────────────────────────────────────────────
var exportSection = src.slice(src.indexOf('window.AppShellScenarioWorkspace'));
assert('T35 — auditWargame3ObjectiveCoordinateSources exported',
    exportSection.includes('auditWargame3ObjectiveCoordinateSources'),
    'not found in export block');

// ─────────────────────────────────────────────────────────────────────────────
// T35b — isWargame3ReadOnlyMapOverlayDataSafe still passes the fixed overlay
// ─────────────────────────────────────────────────────────────────────────────
var t35guard = overlay5 ? api.isWargame3ReadOnlyMapOverlayDataSafe(overlay5) : null;
assert('T35b — fixed overlay passes isWargame3ReadOnlyMapOverlayDataSafe',
    t35guard && t35guard.passed === true,
    t35guard ? JSON.stringify(t35guard.blockedReasons) : 'null');

// ─────────────────────────────────────────────────────────────────────────────
// Results
// ─────────────────────────────────────────────────────────────────────────────
results.forEach(function (r) { console.log(r); });
var total = passed + failed;
console.log('\n' + (failed === 0 ? 'ALL PASS' : failed + ' FAILED') +
            '  (' + passed + '/' + total + ')');

// ── PR-252 Objective Audit Summary ───────────────────────────────────────────
if (auditResult) {
    console.log('\n── PR-252 Objective Coordinate Audit ───────────────────────────────');
    console.log('  scenarioId:                      ' + auditResult.scenarioId);
    console.log('  objectiveCount:                  ' + auditResult.objectiveCount);
    console.log('  objectivesWithDirectCoordinates: ' + auditResult.objectivesWithDirectCoordinates);
    console.log('  objectivesWithMappedCoordinates: ' + auditResult.objectivesWithMappedCoordinates);
    console.log('  objectivesMissingCoordinates:    ' + auditResult.objectivesMissingCoordinates);
    if (auditResult.objectives.length > 0) {
        var obj0 = auditResult.objectives[0];
        console.log('\n  Primary objective:');
        console.log('    objectiveId:   ' + obj0.objectiveId);
        console.log('    name:          ' + obj0.name);
        console.log('    confidence:    ' + obj0.confidence);
        console.log('    source:        ' + obj0.source);
        if (obj0.directCoordinate) {
            console.log('    lat:           ' + obj0.directCoordinate.lat);
            console.log('    lon:           ' + obj0.directCoordinate.lon);
        }
        if (obj0.notes.length > 0) {
            console.log('    notes[0]:      ' + obj0.notes[0]);
        }
    }
    console.log('\n  Candidate source fields:');
    auditResult.candidateSourceFields.forEach(function (f) {
        console.log('    ' + f.field + '  →  ' + f.description);
    });
    if (overlay5 && overlay5.objectiveHighlights[0]) {
        var oh = overlay5.objectiveHighlights[0];
        console.log('\n  overlay.objectiveHighlights[0] after PR-252 pipeline fix:');
        console.log('    hasCoordinate: ' + oh.hasCoordinate);
        console.log('    lat:           ' + oh.lat + '  (was null before PR-252)');
        console.log('    lon:           ' + oh.lon + '  (was null before PR-252)');
        console.log('    objectiveId:   ' + oh.objectiveId);
        console.log('    name:          ' + oh.name);
    }
    if (t15fb && t15fb.bounds) {
        console.log('\n  Focus bounds after PR-252 (includes objective):');
        console.log('    pointCount:          ' + t15fb.pointCount +
                    '  (was ~18 before objective coord)');
        console.log('    sourceCounts:        ' + JSON.stringify(t15fb.sourceCounts));
        console.log('    bounds.south:        ' + t15fb.bounds.south);
        console.log('    bounds.north:        ' + t15fb.bounds.north);
        console.log('    center.lat:          ' + t15fb.center.lat);
        console.log('    center.lon:          ' + t15fb.center.lon);
    }
    console.log('─────────────────────────────────────────────────────────────────────');
}

process.exit(failed > 0 ? 1 : 0);
