'use strict';

// ── PR-248 Test Harness — Movement Trail Verification Pass ───────────────────
// Verifies that PR-247 fixed the W3 adapter so step-specific coordinates
// propagate through the full pipeline:
//   raw W3 source → _stepUnitLocations → buildScenarioStepPreview
//   → buildWargame3ReadOnlyMapOverlayData → movementTrails > 0
//
// PRE-FIX (PR-246 finding): adapter always used coordTable[uid][0].
//   adapterDeltaTotal was 0 for all 17 steps.
// POST-FIX (PR-247): adapter uses coordTable[uid][stepIndex].
//   adapterDeltaTotal should now be > 0.
//
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
var window = {};

// ── Extract code blocks ───────────────────────────────────────────────────────

// 1. BSSP safety constants (before buildScenarioStepPreview)
var bsspStart = src.indexOf('    var _BSSP_SAFETY_TRUE');
var bsspEnd   = src.indexOf('    function buildScenarioStepPreview', bsspStart);
var bsspSrc   = src.slice(bsspStart, bsspEnd);

// 2. Core builder
var builderSrc = extractFn('buildScenarioStepPreview');

// 3. PR-215 adapter block (includes _W3A_ECHELON_MAP, _w3aLonLatToStartLoc,
//    _w3aNormaliseEchelon, _w3aDeepFreeze, _buildUnit, adaptWargame3ToFixture)
var w3aStart = src.indexOf('// ── PR-215: Wargame 3 Fixture Adapter');
var w3aEnd   = src.indexOf('// ── PR-216: Wargame 3 Dry-Run Preview Harness');
if (w3aEnd === -1) { throw new Error('Cannot find PR-216 marker'); }
var w3aSrc   = src.slice(w3aStart, w3aEnd);

// 4. previewWargame3Fixture
var harnSrc = extractFn('previewWargame3Fixture');

// 5. PR-241 unsafe field constants
var w3modConstStart = src.indexOf('// ── PR-241: Read-Only Map Overlay Data Builder — unsafe');
var w3modConstEnd   = src.indexOf('// ── PR-241: Wargame 3 Read-Only Map Overlay type guard');
var w3modConstSrc   = src.slice(w3modConstStart, w3modConstEnd);

// 6. Overlay type guard and builder
var isGuardSrc      = extractFn('isWargame3ReadOnlyMapOverlayDataSafe');
var buildOverlaySrc = extractFn('buildWargame3ReadOnlyMapOverlayData');

// 7. PR-246 coordinate delta audit
var auditDeltaSrc = extractFn('auditWargame3StepCoordinateDeltas');

// ── Build execution environment ───────────────────────────────────────────────
var combined = [
    bsspSrc,
    builderSrc,
    w3aSrc,
    harnSrc,
    w3modConstSrc,
    isGuardSrc,
    buildOverlaySrc,
    auditDeltaSrc
].join('\n');

var fn = new Function('window',
    combined + '\nreturn {' +
    ' adaptWargame3ToFixture:            adaptWargame3ToFixture,' +
    ' buildScenarioStepPreview:          buildScenarioStepPreview,' +
    ' previewWargame3Fixture:            previewWargame3Fixture,' +
    ' isWargame3ReadOnlyMapOverlayDataSafe: isWargame3ReadOnlyMapOverlayDataSafe,' +
    ' buildWargame3ReadOnlyMapOverlayData: buildWargame3ReadOnlyMapOverlayData,' +
    ' auditWargame3StepCoordinateDeltas: auditWargame3StepCoordinateDeltas };'
);
var api = fn(window);

// ── Known unit coordinate constants (from W3 source JSON, GeoJSON [lon, lat]) ──
// R-d3-41-005: off-map at steps 0–4, deploys step-5 onward
var SRC_R_41_005_S0  = (w3json.red_unit_step_coords || {})['R-d3-41-005'];
var SRC_R_41_005_LAT0  = SRC_R_41_005_S0 ? SRC_R_41_005_S0[0][1]  : null;  // lat at step-0
var SRC_R_41_005_LNG0  = SRC_R_41_005_S0 ? SRC_R_41_005_S0[0][0]  : null;  // lng at step-0
var SRC_R_41_005_LAT5  = SRC_R_41_005_S0 ? SRC_R_41_005_S0[5][1]  : null;  // lat at step-5
var SRC_R_41_005_LNG5  = SRC_R_41_005_S0 ? SRC_R_41_005_S0[5][0]  : null;  // lng at step-5
var SRC_R_41_005_LAT16 = SRC_R_41_005_S0 ? SRC_R_41_005_S0[16][1] : null;  // lat at step-16
var SRC_R_41_005_LNG16 = SRC_R_41_005_S0 ? SRC_R_41_005_S0[16][0] : null;  // lng at step-16

// R-d3-405-014: in both step-4 and step-5, moves from off-map to deployed
var SRC_R_405_014 = (w3json.red_unit_step_coords || {})['R-d3-405-014'];
var SRC_R_405_014_LAT4 = SRC_R_405_014 ? SRC_R_405_014[4][1] : null;
var SRC_R_405_014_LAT5 = SRC_R_405_014 ? SRC_R_405_014[5][1] : null;
var SRC_R_405_014_LNG5 = SRC_R_405_014 ? SRC_R_405_014[5][0] : null;

// ── Test runner ───────────────────────────────────────────────────────────────
var passed = 0; var failed = 0; var results = [];
function assert(label, cond, detail) {
    if (cond) { passed++; results.push('  PASS  ' + label); }
    else       { failed++; results.push('  FAIL  ' + label + (detail ? '  →  ' + detail : '')); }
}

// ── Pre-flight: source data sanity ────────────────────────────────────────────
assert('PRE-1 — w3json has red_unit_step_coords',
    w3json.red_unit_step_coords && typeof w3json.red_unit_step_coords === 'object', '');
assert('PRE-2 — w3json has 17 steps',
    Array.isArray(w3json.steps) && w3json.steps.length === 17, 'got: ' + (w3json.steps || []).length);
assert('PRE-3 — R-d3-41-005 has 17 step coord entries',
    SRC_R_41_005_S0 && SRC_R_41_005_S0.length === 17, 'entries: ' + (SRC_R_41_005_S0 || []).length);
assert('PRE-4 — R-d3-41-005 step-0 is off-map sentinel [18, 32]',
    SRC_R_41_005_LNG0 === 18 && SRC_R_41_005_LAT0 === 32,
    '[' + SRC_R_41_005_LNG0 + ', ' + SRC_R_41_005_LAT0 + ']');
assert('PRE-5 — R-d3-41-005 step-0 and step-5 source coords differ',
    SRC_R_41_005_LAT0 !== SRC_R_41_005_LAT5 || SRC_R_41_005_LNG0 !== SRC_R_41_005_LNG5,
    's0=[' + SRC_R_41_005_LNG0 + ',' + SRC_R_41_005_LAT0 + '] s5=[' + SRC_R_41_005_LNG5 + ',' + SRC_R_41_005_LAT5 + ']');
assert('PRE-6 — R-d3-41-005 step-5 and step-16 source coords differ',
    SRC_R_41_005_LAT5 !== SRC_R_41_005_LAT16 || SRC_R_41_005_LNG5 !== SRC_R_41_005_LNG16,
    's5=[' + SRC_R_41_005_LNG5 + ',' + SRC_R_41_005_LAT5 + '] s16=[' + SRC_R_41_005_LNG16 + ',' + SRC_R_41_005_LAT16 + ']');

// ── A. Adapter — _stepUnitLocations per step (PR-247 core) ───────────────────
var adaptResult = api.adaptWargame3ToFixture(w3json);
var fixture     = adaptResult.fixture;
var fxSteps     = fixture ? fixture.steps : [];

assert('A01 — adaptWargame3ToFixture passes on real W3 data',
    adaptResult.passed === true, JSON.stringify(adaptResult.blockedReasons));

assert('A02 — fixture has 17 steps',
    fxSteps.length === 17, 'got: ' + fxSteps.length);

var allHaveStepLocs = fxSteps.length === 17 &&
    fxSteps.every(function (s) {
        return s && typeof s._stepUnitLocations === 'object' &&
               s._stepUnitLocations !== null &&
               !Array.isArray(s._stepUnitLocations);
    });
assert('A03 — all 17 steps have _stepUnitLocations (plain object)',
    allHaveStepLocs, 'first failing step: ' +
    fxSteps.findIndex(function (s) {
        return !s || typeof s._stepUnitLocations !== 'object' ||
               s._stepUnitLocations === null || Array.isArray(s._stepUnitLocations);
    }));

// B. Spec Check B — step coordinate samples for R-d3-41-005
var sLocs0  = fxSteps[0]  ? fxSteps[0]._stepUnitLocations  : {};
var sLocs5  = fxSteps[5]  ? fxSteps[5]._stepUnitLocations  : {};
var sLocs16 = fxSteps[16] ? fxSteps[16]._stepUnitLocations : {};

var loc0  = sLocs0['R-d3-41-005']  || null;
var loc5  = sLocs5['R-d3-41-005']  || null;
var loc16 = sLocs16['R-d3-41-005'] || null;

assert('B01 — step-0 _stepUnitLocations[R-d3-41-005] is present',
    loc0 !== null, 'null');
assert('B02 — step-0 R-d3-41-005 lat equals source step-0 lat (32)',
    loc0 !== null && loc0.lat === SRC_R_41_005_LAT0,
    'got lat=' + (loc0 ? loc0.lat : null) + ' expected=' + SRC_R_41_005_LAT0);
assert('B03 — step-0 R-d3-41-005 lng equals source step-0 lng (18)',
    loc0 !== null && loc0.lng === SRC_R_41_005_LNG0,
    'got lng=' + (loc0 ? loc0.lng : null) + ' expected=' + SRC_R_41_005_LNG0);

assert('B04 — step-5 _stepUnitLocations[R-d3-41-005] is present',
    loc5 !== null, 'null');
assert('B05 — step-5 R-d3-41-005 lat equals source step-5 lat',
    loc5 !== null && loc5.lat === SRC_R_41_005_LAT5,
    'got lat=' + (loc5 ? loc5.lat : null) + ' expected=' + SRC_R_41_005_LAT5);
assert('B06 — step-5 R-d3-41-005 lng equals source step-5 lng',
    loc5 !== null && loc5.lng === SRC_R_41_005_LNG5,
    'got lng=' + (loc5 ? loc5.lng : null) + ' expected=' + SRC_R_41_005_LNG5);

assert('B07 — step-16 _stepUnitLocations[R-d3-41-005] is present',
    loc16 !== null, 'null');
assert('B08 — step-16 R-d3-41-005 lat equals source step-16 lat',
    loc16 !== null && loc16.lat === SRC_R_41_005_LAT16,
    'got lat=' + (loc16 ? loc16.lat : null) + ' expected=' + SRC_R_41_005_LAT16);

assert('B09 — step-0 and step-5 R-d3-41-005 _stepUnitLocations differ',
    loc0 && loc5 && (loc0.lat !== loc5.lat || loc0.lng !== loc5.lng),
    's0=[' + (loc0 ? loc0.lng + ',' + loc0.lat : 'null') + ']' +
    ' s5=[' + (loc5 ? loc5.lng + ',' + loc5.lat : 'null') + ']');

assert('B10 — step-5 and step-16 R-d3-41-005 _stepUnitLocations differ',
    loc5 && loc16 && (loc5.lat !== loc16.lat || loc5.lng !== loc16.lng),
    's5=[' + (loc5 ? loc5.lng + ',' + loc5.lat : 'null') + ']' +
    ' s16=[' + (loc16 ? loc16.lng + ',' + loc16.lat : 'null') + ']');

// B continued — verify via buildScenarioStepPreview output (step-5 references R-d3-41-005)
var p5result = api.buildScenarioStepPreview(fixture, 'W3-STEP-05');
assert('B11 — buildScenarioStepPreview(W3-STEP-05) passes',
    p5result.passed === true, JSON.stringify(p5result.blockedReasons));

var p5units = p5result.preview ? p5result.preview.unitsReferenced : [];
var p5_R_41_005 = p5units.filter(function (u) { return u.uid === 'R-d3-41-005'; })[0] || null;
assert('B12 — step-5 preview unitsReferenced contains R-d3-41-005',
    p5_R_41_005 !== null,
    'uids in preview: ' + p5units.map(function (u) { return u.uid; }).join(', '));
assert('B13 — step-5 preview R-d3-41-005 startLocation.lat equals source step-5 lat',
    p5_R_41_005 !== null &&
    p5_R_41_005.startLocation !== null &&
    p5_R_41_005.startLocation.lat === SRC_R_41_005_LAT5,
    'got lat=' + (p5_R_41_005 && p5_R_41_005.startLocation ? p5_R_41_005.startLocation.lat : null) +
    ' expected=' + SRC_R_41_005_LAT5);
assert('B14 — step-5 preview R-d3-41-005 startLocation.lng equals source step-5 lng',
    p5_R_41_005 !== null &&
    p5_R_41_005.startLocation !== null &&
    p5_R_41_005.startLocation.lng === SRC_R_41_005_LNG5,
    'got lng=' + (p5_R_41_005 && p5_R_41_005.startLocation ? p5_R_41_005.startLocation.lng : null) +
    ' expected=' + SRC_R_41_005_LNG5);

// ── C. Overlay — movement trails from step-4 to step-5 ───────────────────────
var p4result = api.buildScenarioStepPreview(fixture, 'W3-STEP-04');
assert('C01 — buildScenarioStepPreview(W3-STEP-04) passes',
    p4result.passed === true, JSON.stringify(p4result.blockedReasons));

var p4preview = p4result.preview;
var p5preview = p5result.preview;

var overlay5result = api.buildWargame3ReadOnlyMapOverlayData(
    p5preview, { previousPreview: p4preview });

assert('C02 — buildWargame3ReadOnlyMapOverlayData(p5, {previousPreview: p4}) passes',
    overlay5result.passed === true,
    JSON.stringify(overlay5result.blockedReasons));

var overlay5 = overlay5result.overlay || {};

assert('C03 — overlay5.movementTrails is an array',
    Array.isArray(overlay5.movementTrails),
    typeof overlay5.movementTrails);

assert('C04 — overlay5.movementTrails.length > 0 (at least one trail for step-4→5)',
    Array.isArray(overlay5.movementTrails) && overlay5.movementTrails.length > 0,
    'length: ' + (overlay5.movementTrails ? overlay5.movementTrails.length : 'N/A'));

var trails5 = overlay5.movementTrails || [];

assert('C05 — all trails have hasCoordinate: true',
    trails5.length > 0 && trails5.every(function (t) { return t.hasCoordinate === true; }),
    'first bad: ' + JSON.stringify(trails5.find(function (t) { return t.hasCoordinate !== true; })));

assert('C06 — all trails have finite fromLat, fromLon, toLat, toLon',
    trails5.length > 0 && trails5.every(function (t) {
        return typeof t.fromLat === 'number' && isFinite(t.fromLat) &&
               typeof t.fromLon === 'number' && isFinite(t.fromLon) &&
               typeof t.toLat   === 'number' && isFinite(t.toLat)   &&
               typeof t.toLon   === 'number' && isFinite(t.toLon);
    }),
    'first bad: ' + JSON.stringify(trails5.find(function (t) {
        return !isFinite(t.fromLat) || !isFinite(t.fromLon) ||
               !isFinite(t.toLat)   || !isFinite(t.toLon);
    })));

assert('C07 — all trails have fromLat !== toLat or fromLon !== toLon (no zero-length trail)',
    trails5.length > 0 && trails5.every(function (t) {
        return t.fromLat !== t.toLat || t.fromLon !== t.toLon;
    }),
    'zero-length trail found');

assert('C08 — all trails have source: "preview_step_delta"',
    trails5.length > 0 && trails5.every(function (t) { return t.source === 'preview_step_delta'; }),
    'first bad: ' + JSON.stringify(trails5.find(function (t) { return t.source !== 'preview_step_delta'; })));

assert('C09 — all trails have readOnly: true',
    trails5.length > 0 && trails5.every(function (t) { return t.readOnly === true; }),
    'first bad: ' + JSON.stringify(trails5.find(function (t) { return t.readOnly !== true; })));

assert('C10 — all trails have kind: "unit_preview_movement_trail"',
    trails5.length > 0 && trails5.every(function (t) { return t.kind === 'unit_preview_movement_trail'; }),
    'first bad: ' + JSON.stringify(trails5.find(function (t) { return t.kind !== 'unit_preview_movement_trail'; })));

// Verify specific trail for R-d3-405-014 (off-map→deployed in step-5)
var trail_405_014 = trails5.filter(function (t) { return t.uid === 'R-d3-405-014'; })[0] || null;
assert('C11 — trail for R-d3-405-014 is present in overlay5.movementTrails',
    trail_405_014 !== null,
    'trail UIDs: ' + trails5.map(function (t) { return t.uid; }).join(', '));
assert('C12 — R-d3-405-014 trail fromLat=32 (off-map step-4 coord lat)',
    trail_405_014 !== null && trail_405_014.fromLat === SRC_R_405_014_LAT4,
    'fromLat=' + (trail_405_014 ? trail_405_014.fromLat : null) + ' expected=' + SRC_R_405_014_LAT4);
assert('C13 — R-d3-405-014 trail toLat≈30.536 (deployed step-5 coord lat)',
    trail_405_014 !== null && trail_405_014.toLat === SRC_R_405_014_LAT5,
    'toLat=' + (trail_405_014 ? trail_405_014.toLat : null) + ' expected=' + SRC_R_405_014_LAT5);
assert('C14 — R-d3-405-014 trail toLon equals source step-5 lng',
    trail_405_014 !== null && trail_405_014.toLon === SRC_R_405_014_LNG5,
    'toLon=' + (trail_405_014 ? trail_405_014.toLon : null) + ' expected=' + SRC_R_405_014_LNG5);

// Overlay type-guard passes
var guardResult = api.isWargame3ReadOnlyMapOverlayDataSafe(overlay5);
assert('C15 — isWargame3ReadOnlyMapOverlayDataSafe(overlay5) passes',
    guardResult.passed === true, JSON.stringify(guardResult.blockedReasons));

// ── D. PR-246 audit reflects PR-247 fix ───────────────────────────────────────
var auditResult = api.auditWargame3StepCoordinateDeltas(w3json);

assert('D01 — auditWargame3StepCoordinateDeltas passes on real W3 data',
    auditResult.passed === true, JSON.stringify(auditResult.blockedReasons));

assert('D02 — totalDeltaPairs > 0 (source still has per-step movement data)',
    auditResult.totalDeltaPairs > 0, 'got: ' + auditResult.totalDeltaPairs);

assert('D03 — adapterFindings[0] indicates adapter is now step-aware',
    Array.isArray(auditResult.adapterFindings) &&
    auditResult.adapterFindings.length > 0 &&
    auditResult.adapterFindings[0].indexOf('step-aware') !== -1,
    'first finding: "' + (auditResult.adapterFindings[0] || '') + '"');

// adapterDeltaTotal is the total moved-unit count across all 16 step pairs
var adapterDeltaTotal = Array.isArray(auditResult.stepPairs)
    ? auditResult.stepPairs.reduce(function (s, p) { return s + (p.movedUnitCount || 0); }, 0)
    : 0;
assert('D04 — stepPairs total movedUnitCount > 0 (PR-247 fix activated)',
    adapterDeltaTotal > 0,
    'total movedUnitCount across all step pairs: ' + adapterDeltaTotal);

assert('D05 — at least one stepPair has movedUnitCount > 0',
    Array.isArray(auditResult.stepPairs) &&
    auditResult.stepPairs.some(function (p) { return p.movedUnitCount > 0; }),
    'all pairs: ' + JSON.stringify((auditResult.stepPairs || []).map(function (p) { return p.movedUnitCount; })));

// The step pair W3-STEP-04 → W3-STEP-05 should have moved units
var pair45 = (auditResult.stepPairs || []).filter(function (p) {
    return p.fromStepRef === 'W3-STEP-04' && p.toStepRef === 'W3-STEP-05';
})[0] || null;
assert('D06 — stepPair W3-STEP-04 → W3-STEP-05 movedUnitCount > 0',
    pair45 !== null && pair45.movedUnitCount > 0,
    pair45 ? 'movedUnitCount=' + pair45.movedUnitCount : 'pair not found');

// ── E. Safety / no-mutation ───────────────────────────────────────────────────
assert('E01 — overlay5.readOnly === true',
    overlay5.readOnly === true, 'got: ' + overlay5.readOnly);

assert('E02 — overlay5.liveMutationAllowed === false',
    overlay5.liveMutationAllowed === false, 'got: ' + overlay5.liveMutationAllowed);

assert('E03 — no trail has liveMutationAllowed property',
    trails5.every(function (t) { return !t.hasOwnProperty('liveMutationAllowed'); }),
    'trail with liveMutationAllowed found');

assert('E04 — step-5 preview readOnly === true',
    p5preview && p5preview.readOnly === true, 'got: ' + (p5preview && p5preview.readOnly));

assert('E05 — step-5 preview liveMutationAllowed === false',
    p5preview && p5preview.liveMutationAllowed === false,
    'got: ' + (p5preview && p5preview.liveMutationAllowed));

// ── Results ───────────────────────────────────────────────────────────────────
results.forEach(function (r) { console.log(r); });
console.log(
    '\n' + (failed === 0 ? 'ALL PASS' : failed + ' FAILED') +
    '  (' + passed + '/' + (passed + failed) + ')'
);

// Report trail count for reference
if (overlay5.movementTrails) {
    console.log('\nMovement trails emitted for step-4→5: ' + overlay5.movementTrails.length);
    var trailSample = overlay5.movementTrails.slice(0, 3);
    trailSample.forEach(function (t) {
        console.log('  ' + t.uid + ' [' + t.side + ']: (' + t.fromLat.toFixed(3) + ',' + t.fromLon.toFixed(3) + ') → (' + t.toLat.toFixed(3) + ',' + t.toLon.toFixed(3) + ')');
    });
}

process.exit(failed > 0 ? 1 : 0);
