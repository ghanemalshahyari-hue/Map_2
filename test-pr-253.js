'use strict';

// ── PR-253 Test Harness — Wargame 3 Read-Only Objective Highlight Paint ────────
// Tests:
//   1. paintWargame3ReadOnlyMapOverlay paints objective circleMarker when hasCoordinate===true
//   2. objectiveHighlightCount increments correctly
//   3. Safety guards: no range circles, no invented coordinates, no mutation
//   4. clearWargame3ReadOnlyMapOverlay removes objective highlight layer
//   5. All existing marker/trail paint functions intact
//   6. No app.js / adjudicator-map.js changes
// No DOM. Uses minimal Leaflet mock. No real window.map. No storage. No fetch.

var fs   = require('fs');
var path = require('path');

var src    = fs.readFileSync(
    path.join(__dirname, 'UI_MOdified/client/shell/scenario-workspace.js'), 'utf8');
var w3json = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'UI_MOdified/data/scenarios/wargame3.json'), 'utf8'));

// ── Minimal Leaflet layer mock factory ────────────────────────────────────────
// Re-created for each paint test so call counts are isolated.
function makeMockL() {
    var L = {
        _circleMarkerCalls: [],
        _circleCalls:       [],
        _polylineCalls:     [],
        _layerGroups:       [],
        circleMarker: function (latlng, opts) {
            var layer = {
                _type: 'circleMarker', _latlng: latlng, _opts: opts || {},
                options: {}, _tip: null,
                bindTooltip: function (c) { this._tip = c; return this; },
                addTo:       function (g) { g._layers.push(this); return this; }
            };
            L._circleMarkerCalls.push(layer);
            return layer;
        },
        circle: function (latlng, opts) {
            var layer = {
                _type: 'circle', _latlng: latlng, _opts: opts || {},
                options: {},
                bindTooltip: function () { return this; },
                addTo:       function (g) { g._layers.push(this); return this; }
            };
            L._circleCalls.push(layer);
            return layer;
        },
        polyline: function (latlngs, opts) {
            var layer = {
                _type: 'polyline', _latlngs: latlngs, _opts: opts || {},
                options: {},
                bindTooltip: function () { return this; },
                addTo:       function (g) { g._layers.push(this); return this; }
            };
            L._polylineCalls.push(layer);
            return layer;
        },
        layerGroup: function () {
            var lg = {
                _layers: [],
                clearLayers: function () { this._layers = []; },
                addTo:       function (map) { map._layerGroups.push(this); return this; }
            };
            L._layerGroups.push(lg);
            return lg;
        }
    };
    return L;
}

function makeMockMap() {
    return {
        _layerGroups:   [],
        _removedLayers: [],
        removeLayer: function (layer) {
            this._removedLayers.push(layer);
            var idx = this._layerGroups.indexOf(layer);
            if (idx >= 0) { this._layerGroups.splice(idx, 1); }
            return this;
        }
    };
}

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

// ── Shared window object (L/map injected per test) ────────────────────────────
var window = {
    map:             null,
    L:               null,
    units:           [],
    lines:           [],
    RmoozScenario:   { stepIndex: 3, scenario: {} }
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

var builderSrc     = extractFn('buildScenarioStepPreview');
var harnSrc        = extractFn('previewWargame3Fixture');
var isGuardSrc     = extractFn('isWargame3ReadOnlyMapOverlayDataSafe');
var buildOvSrc     = extractFn('buildWargame3ReadOnlyMapOverlayData');
var clearSrc       = extractFn('clearWargame3ReadOnlyMapOverlay');
var paintSrc       = extractFn('paintWargame3ReadOnlyMapOverlay');
var auditCovSrc    = extractFn('auditWargame3MapPreviewCoverage');
var deltaSrc       = extractFn('auditWargame3StepCoordinateDeltas');
var trailCovSrc    = extractFn('auditWargame3MovementTrailCoverage');
var buildFocusSrc  = extractFn('buildWargame3PreviewMapFocusBounds');
var auditObjSrc    = extractFn('auditWargame3ObjectiveCoordinateSources');
var readinessSrc   = extractFn('buildWargame3MapPreviewReadinessReport');

// Stub for paintWargame3PreviewMapOverlayFromPreview (called conditionally by
// auditWargame3MapPreviewCoverage when paintEnabled:true, which we never use).
var paintFromPreviewStub = [
    'function paintWargame3PreviewMapOverlayFromPreview(preview) {',
    '    return { passed: true, painted: false, markerCount: 0,',
    '             objectiveHighlightCount: 0, effectHintCount: 0,',
    '             movementTrailCount: 0, skippedCount: 0,',
    '             blockedReasons: [], warnings: [] };',
    '}'
].join('\n');

// ── Build combined execution environment ──────────────────────────────────────
var combined = [
    'var _w3PreviewLayer = null;',     // private layer handle shared by paint/clear
    bsspSrc,
    builderSrc,
    w3aSrc,
    harnSrc,
    w3modConstSrc,
    isGuardSrc,
    buildOvSrc,
    clearSrc,
    paintSrc,
    paintFromPreviewStub,
    auditCovSrc,
    deltaSrc,
    trailCovSrc,
    buildFocusSrc,
    auditObjSrc,
    readinessSrc
].join('\n');

var fn = new Function('window',
    combined + '\nreturn {' +
    ' adaptWargame3ToFixture:                      adaptWargame3ToFixture,' +
    ' buildScenarioStepPreview:                    buildScenarioStepPreview,' +
    ' previewWargame3Fixture:                      previewWargame3Fixture,' +
    ' isWargame3ReadOnlyMapOverlayDataSafe:        isWargame3ReadOnlyMapOverlayDataSafe,' +
    ' buildWargame3ReadOnlyMapOverlayData:         buildWargame3ReadOnlyMapOverlayData,' +
    ' clearWargame3ReadOnlyMapOverlay:             clearWargame3ReadOnlyMapOverlay,' +
    ' paintWargame3ReadOnlyMapOverlay:             paintWargame3ReadOnlyMapOverlay,' +
    ' auditWargame3MapPreviewCoverage:             auditWargame3MapPreviewCoverage,' +
    ' auditWargame3StepCoordinateDeltas:           auditWargame3StepCoordinateDeltas,' +
    ' auditWargame3MovementTrailCoverage:          auditWargame3MovementTrailCoverage,' +
    ' buildWargame3PreviewMapFocusBounds:          buildWargame3PreviewMapFocusBounds,' +
    ' auditWargame3ObjectiveCoordinateSources:     auditWargame3ObjectiveCoordinateSources,' +
    ' buildWargame3MapPreviewReadinessReport:      buildWargame3MapPreviewReadinessReport };'
);
var api = fn(window);

// ── Test runner ───────────────────────────────────────────────────────────────
var passed = 0; var failed = 0; var results = [];
function assert(label, cond, detail) {
    if (cond) { passed++; results.push('  PASS  ' + label); }
    else       { failed++; results.push('  FAIL  ' + label + (detail ? '  →  ' + detail : '')); }
}

// ── Pre-compute common data ───────────────────────────────────────────────────
var W3_OBJ_LAT = w3json.obj.coord[1];   // 29.74
var W3_OBJ_LON = w3json.obj.coord[0];   // 19.55

var adaptRes    = api.adaptWargame3ToFixture(w3json);
var fixture     = adaptRes.fixture;

// step-5 preview (has movement trails for transition coverage)
var step5Res    = fixture ? api.buildScenarioStepPreview(fixture, 'W3-STEP-05') : null;
var step5Prev   = step5Res && step5Res.preview ? step5Res.preview : null;
var step4Res    = fixture ? api.buildScenarioStepPreview(fixture, 'W3-STEP-04') : null;
var step4Prev   = step4Res && step4Res.preview ? step4Res.preview : null;
var ov5Res      = step5Prev
    ? api.buildWargame3ReadOnlyMapOverlayData(step5Prev, { previousPreview: step4Prev })
    : null;
var overlay5    = ov5Res && ov5Res.overlay ? ov5Res.overlay : null;

// Helper: build a minimal safe overlay with custom objectiveHighlights.
// Sentinels must match isWargame3ReadOnlyMapOverlayDataSafe exactly:
//   overlayType === 'wargame3_preview_read_only'
//   source      === 'dry_run_preview'
//   warnings and blockedReasons must be arrays
function makeSafeOverlay(objectiveHighlights, markers, movementTrails) {
    return {
        overlayType:          'wargame3_preview_read_only',
        source:               'dry_run_preview',
        readOnly:             true,
        liveMutationAllowed:  false,
        markers:              markers              || [],
        objectiveHighlights:  objectiveHighlights  || [],
        effectHints:          [],
        movementTrails:       movementTrails        || [],
        warnings:             [],
        blockedReasons:       []
    };
}

// Objective with valid coordinates (used in T01/T02)
var ohWithCoord = {
    kind: 'objective_preview_highlight',
    objectiveId: 'W3-OBJ-PRIMARY',
    name: 'Objective X (Nasser-Brega pipeline midpoint)',
    status: 'pending',
    lat: W3_OBJ_LAT, lon: W3_OBJ_LON,
    hasCoordinate: true,
    source: 'preview_objective', readOnly: true
};

// Objective with hasCoordinate:false (used in T03)
var ohNoCoord = {
    kind: 'objective_preview_highlight',
    objectiveId: 'W3-OBJ-NOCOORD',
    name: 'No Coord Objective',
    status: '', lat: null, lon: null,
    hasCoordinate: false,
    source: 'preview_objective', readOnly: true
};

// Objective with null lat/lon and hasCoordinate:false (T04)
var ohNullCoord = {
    kind: 'objective_preview_highlight', objectiveId: 'T04-OBJ',
    name: 'Null Coord Obj', status: '',
    lat: null, lon: null, hasCoordinate: false,
    source: 'preview_objective', readOnly: true
};

// Objective with non-finite lat (T05)
var ohInvalidCoord = {
    kind: 'objective_preview_highlight', objectiveId: 'T05-OBJ',
    name: 'Invalid Coord Obj', status: '',
    lat: Infinity, lon: NaN, hasCoordinate: true,
    source: 'preview_objective', readOnly: true
};

// ─────────────────────────────────────────────────────────────────────────────
// T01 — safe overlay with valid objective coordinate paints objective highlight
// ─────────────────────────────────────────────────────────────────────────────
var mockL1 = makeMockL(); var mockMap1 = makeMockMap();
window.L = mockL1; window.map = mockMap1;
var paintRes1 = api.paintWargame3ReadOnlyMapOverlay(makeSafeOverlay([ohWithCoord]));
assert('T01 — safe overlay with objective coordinate paints objective highlight',
    paintRes1.passed === true && paintRes1.objectiveHighlightCount >= 1,
    JSON.stringify({ passed: paintRes1.passed, ohc: paintRes1.objectiveHighlightCount }));

// ─────────────────────────────────────────────────────────────────────────────
// T02 — objectiveHighlightCount becomes 1 for W3 overlay
// ─────────────────────────────────────────────────────────────────────────────
assert('T02 — objectiveHighlightCount === 1 for single-objective W3 overlay',
    paintRes1.objectiveHighlightCount === 1,
    'objectiveHighlightCount=' + paintRes1.objectiveHighlightCount);

// ─────────────────────────────────────────────────────────────────────────────
// T03 — hasCoordinate:false does not paint objective
// ─────────────────────────────────────────────────────────────────────────────
var mockL3 = makeMockL(); var mockMap3 = makeMockMap();
window.L = mockL3; window.map = mockMap3;
var paintRes3 = api.paintWargame3ReadOnlyMapOverlay(makeSafeOverlay([ohNoCoord]));
assert('T03 — safe overlay with objective hasCoordinate:false does not paint objective',
    paintRes3.passed === true && paintRes3.objectiveHighlightCount === 0,
    'objectiveHighlightCount=' + paintRes3.objectiveHighlightCount);

// ─────────────────────────────────────────────────────────────────────────────
// T04 — null objective coordinates do not paint
// ─────────────────────────────────────────────────────────────────────────────
var mockL4 = makeMockL(); var mockMap4 = makeMockMap();
window.L = mockL4; window.map = mockMap4;
var paintRes4 = api.paintWargame3ReadOnlyMapOverlay(makeSafeOverlay([ohNullCoord]));
assert('T04 — safe overlay with null objective coordinates does not paint objective',
    paintRes4.passed === true && paintRes4.objectiveHighlightCount === 0,
    'objectiveHighlightCount=' + paintRes4.objectiveHighlightCount);

// ─────────────────────────────────────────────────────────────────────────────
// T05 — non-finite objective coordinates do not paint
// ─────────────────────────────────────────────────────────────────────────────
var mockL5 = makeMockL(); var mockMap5 = makeMockMap();
window.L = mockL5; window.map = mockMap5;
var paintRes5 = api.paintWargame3ReadOnlyMapOverlay(makeSafeOverlay([ohInvalidCoord]));
assert('T05 — safe overlay with invalid (non-finite) objective coordinates does not paint',
    paintRes5.passed === true && paintRes5.objectiveHighlightCount === 0,
    'objectiveHighlightCount=' + paintRes5.objectiveHighlightCount);

// ─────────────────────────────────────────────────────────────────────────────
// T06 — unit markers still paint with real W3 overlay
// ─────────────────────────────────────────────────────────────────────────────
var mockL6 = makeMockL(); var mockMap6 = makeMockMap();
window.L = mockL6; window.map = mockMap6;
var paintRes6 = overlay5 ? api.paintWargame3ReadOnlyMapOverlay(overlay5) : null;
assert('T06 — unit markers still paint (markerCount > 0)',
    paintRes6 !== null && paintRes6.passed === true && paintRes6.markerCount > 0,
    'markerCount=' + (paintRes6 ? paintRes6.markerCount : '?'));

// ─────────────────────────────────────────────────────────────────────────────
// T07 — movement trails still paint with real W3 overlay
// ─────────────────────────────────────────────────────────────────────────────
assert('T07 — movement trails still paint (movementTrailCount > 0)',
    paintRes6 !== null && paintRes6.passed === true && paintRes6.movementTrailCount > 0,
    'movementTrailCount=' + (paintRes6 ? paintRes6.movementTrailCount : '?'));

// ─────────────────────────────────────────────────────────────────────────────
// T08 — clearWargame3ReadOnlyMapOverlay removes objective highlight layer
// Pre-clear any stale _w3PreviewLayer left by prior tests so we get exactly
// one removal event on mockMap8 (the one we created ourselves).
// ─────────────────────────────────────────────────────────────────────────────
(function () {
    var preMap = makeMockMap(); window.map = preMap;
    api.clearWargame3ReadOnlyMapOverlay();          // drain stale layer
})();
var mockL8 = makeMockL(); var mockMap8 = makeMockMap();
window.L = mockL8; window.map = mockMap8;
api.paintWargame3ReadOnlyMapOverlay(makeSafeOverlay([ohWithCoord]));
var lg8 = mockL8._layerGroups[0];   // layer group created during the paint above
var clearRes8 = api.clearWargame3ReadOnlyMapOverlay();
assert('T08 — clearWargame3ReadOnlyMapOverlay removes objective highlight',
    clearRes8.passed === true &&
    mockMap8._removedLayers.length === 1 &&
    mockMap8._removedLayers[0] === lg8,
    'passed=' + clearRes8.passed + ' removedLayers=' + mockMap8._removedLayers.length);

// ─────────────────────────────────────────────────────────────────────────────
// T09 — painting a new overlay clears the old one first
// ─────────────────────────────────────────────────────────────────────────────
var mockL9 = makeMockL(); var mockMap9 = makeMockMap();
window.L = mockL9; window.map = mockMap9;
api.paintWargame3ReadOnlyMapOverlay(makeSafeOverlay([ohWithCoord]));
var firstLG9 = mockL9._layerGroups[0];
// second paint — new L so we can detect new vs old layer group
var mockL9b = makeMockL();
window.L = mockL9b; window.map = mockMap9;
api.paintWargame3ReadOnlyMapOverlay(makeSafeOverlay([ohWithCoord]));
assert('T09 — painting a new overlay clears the old layer group first',
    mockMap9._removedLayers.length >= 1 &&
    mockMap9._removedLayers[0] === firstLG9,
    'removedLayers=' + mockMap9._removedLayers.length);

// ─────────────────────────────────────────────────────────────────────────────
// T10 — no live unit markers removed
// ─────────────────────────────────────────────────────────────────────────────
var unitsSnap = window.units;
assert('T10 — window.units not removed or replaced after paint+clear',
    window.units === unitsSnap && Array.isArray(window.units),
    'units changed');

// ─────────────────────────────────────────────────────────────────────────────
// T11 — no live lines removed
// ─────────────────────────────────────────────────────────────────────────────
var linesSnap = window.lines;
assert('T11 — window.lines not removed or replaced after paint+clear',
    window.lines === linesSnap && Array.isArray(window.lines),
    'lines changed');

// ─────────────────────────────────────────────────────────────────────────────
// T12 — no scenario layers removed
// ─────────────────────────────────────────────────────────────────────────────
assert('T12 — window.RmoozScenario not mutated by paint/clear',
    window.RmoozScenario.stepIndex === 3 &&
    typeof window.RmoozScenario.scenario === 'object',
    'RmoozScenario changed');

// ─────────────────────────────────────────────────────────────────────────────
// T13 — no L.circle (range/geographic circle) used for objective
// ─────────────────────────────────────────────────────────────────────────────
var mockL13 = makeMockL(); var mockMap13 = makeMockMap();
window.L = mockL13; window.map = mockMap13;
api.paintWargame3ReadOnlyMapOverlay(makeSafeOverlay([ohWithCoord]));
assert('T13 — no L.circle (geographic range circle) created for objective',
    mockL13._circleCalls.length === 0,
    'L.circle calls=' + mockL13._circleCalls.length);

// ─────────────────────────────────────────────────────────────────────────────
// T13b — objective uses L.circleMarker (pixel-radius point marker)
// ─────────────────────────────────────────────────────────────────────────────
assert('T13b — objective uses L.circleMarker (pixel-radius point marker)',
    mockL13._circleMarkerCalls.length >= 1,
    'circleMarker calls=' + mockL13._circleMarkerCalls.length);

// ─────────────────────────────────────────────────────────────────────────────
// T14 — no radius_km / range / detection / weapon in paint source body
// ─────────────────────────────────────────────────────────────────────────────
var objSectionStart = paintSrc.indexOf('// 6. Objective highlights');
var objSectionEnd   = paintSrc.indexOf('// 7. Effect hints', objSectionStart);
var objSection      = objSectionStart !== -1 && objSectionEnd !== -1
    ? paintSrc.slice(objSectionStart, objSectionEnd) : paintSrc;
assert('T14 — no radius_km in objective paint section',
    objSection.indexOf('radius_km') === -1,
    'radius_km found in objective section');
assert('T14b — no detection/weapon ring keywords in objective paint section',
    objSection.indexOf('detectionRing') === -1 &&
    objSection.indexOf('weaponRing')    === -1 &&
    objSection.indexOf('sensorRing')    === -1,
    'ring keyword found');

// ─────────────────────────────────────────────────────────────────────────────
// T15 — objective coordinate is not invented; comes from overlay.objectiveHighlights
// ─────────────────────────────────────────────────────────────────────────────
var mockL15 = makeMockL(); var mockMap15 = makeMockMap();
window.L = mockL15; window.map = mockMap15;
api.paintWargame3ReadOnlyMapOverlay(makeSafeOverlay([ohWithCoord]));
var painted15 = mockL15._circleMarkerCalls.find(function (l) { return l._opts.className === 'sw-w3-preview-obj'; });
assert('T15 — objective circleMarker latlng comes directly from overlay, not invented',
    painted15 !== undefined &&
    painted15._latlng[0] === W3_OBJ_LAT &&
    painted15._latlng[1] === W3_OBJ_LON,
    'latlng=' + (painted15 ? JSON.stringify(painted15._latlng) : '?'));

// ─────────────────────────────────────────────────────────────────────────────
// T16 — objective coordinate remains exactly 29.74 / 19.55
// ─────────────────────────────────────────────────────────────────────────────
assert('T16 — objective coordinate is exactly lat=29.74 lon=19.55 (from w3json.obj.coord)',
    painted15 !== undefined &&
    painted15._latlng[0] === 29.74 &&
    painted15._latlng[1] === 19.55,
    JSON.stringify(painted15 ? painted15._latlng : null));

// ─────────────────────────────────────────────────────────────────────────────
// T17 — buildWargame3PreviewMapFocusBounds still includes objective
// ─────────────────────────────────────────────────────────────────────────────
window.L = null; window.map = null;
var focusRes17 = overlay5 ? api.buildWargame3PreviewMapFocusBounds(overlay5) : null;
assert('T17 — buildWargame3PreviewMapFocusBounds sourceCounts.objectives === 1',
    focusRes17 !== null && focusRes17.passed === true &&
    focusRes17.sourceCounts && focusRes17.sourceCounts.objectives === 1,
    'sourceCounts=' + JSON.stringify(focusRes17 ? focusRes17.sourceCounts : null));

// ─────────────────────────────────────────────────────────────────────────────
// T18 — readiness report no longer shows OBJECTIVE_COORDS_MISSING gap
// ─────────────────────────────────────────────────────────────────────────────
var readRes18 = api.buildWargame3MapPreviewReadinessReport(w3json);
var gaps18 = Array.isArray(readRes18.remainingGaps) ? readRes18.remainingGaps : [];
var hasObjGap = gaps18.some(function (g) {
    return (g && g.code === 'OBJECTIVE_COORDS_MISSING') ||
           (typeof g === 'string' && g.indexOf('OBJECTIVE_COORDS_MISSING') !== -1);
});
assert('T18 — readiness report no longer shows OBJECTIVE_COORDS_MISSING gap',
    readRes18.passed === true && !hasObjGap,
    'gaps=' + JSON.stringify(gaps18.map(function (g) { return g && g.code; })));

// ─────────────────────────────────────────────────────────────────────────────
// T19 — W3 preview navigation still refreshes overlay (step N → N+1 rebuilds)
// ─────────────────────────────────────────────────────────────────────────────
var stepRefs = ['W3-STEP-00','W3-STEP-01','W3-STEP-02','W3-STEP-03','W3-STEP-04',
                'W3-STEP-05','W3-STEP-06','W3-STEP-07','W3-STEP-08','W3-STEP-09',
                'W3-STEP-10','W3-STEP-11','W3-STEP-12','W3-STEP-13','W3-STEP-14',
                'W3-STEP-15','W3-STEP-16'];
var allStepsOK = true;
var allObjCoord = true;
var prevPrev = null;
for (var si = 0; si < stepRefs.length; si++) {
    var sRes = fixture ? api.buildScenarioStepPreview(fixture, stepRefs[si]) : null;
    var sPrev = sRes && sRes.preview ? sRes.preview : null;
    var oRes  = sPrev
        ? api.buildWargame3ReadOnlyMapOverlayData(sPrev, { previousPreview: prevPrev })
        : null;
    var ov = oRes && oRes.overlay ? oRes.overlay : null;
    if (!ov) { allStepsOK = false; }
    // Check objective has coordinate for all steps
    if (ov && ov.objectiveHighlights && ov.objectiveHighlights.length > 0) {
        if (!ov.objectiveHighlights[0].hasCoordinate) { allObjCoord = false; }
    }
    prevPrev = sPrev;
}
assert('T19 — W3 preview navigation refreshes overlay (all 17 steps rebuild)',
    allStepsOK,
    'some steps failed to build overlay');

// ─────────────────────────────────────────────────────────────────────────────
// T20 — Top next works (step 0 → step 1)
// ─────────────────────────────────────────────────────────────────────────────
var mockL20 = makeMockL(); var mockMap20 = makeMockMap();
window.L = mockL20; window.map = mockMap20;
var s0Res = fixture ? api.buildScenarioStepPreview(fixture, 'W3-STEP-00') : null;
var s0Prev = s0Res && s0Res.preview ? s0Res.preview : null;
var s1Res = fixture ? api.buildScenarioStepPreview(fixture, 'W3-STEP-01') : null;
var s1Prev = s1Res && s1Res.preview ? s1Res.preview : null;
var ov0 = s0Prev ? api.buildWargame3ReadOnlyMapOverlayData(s0Prev) : null;
var ov1 = s1Prev ? api.buildWargame3ReadOnlyMapOverlayData(s1Prev, { previousPreview: s0Prev }) : null;
var pR0 = ov0 && ov0.overlay ? api.paintWargame3ReadOnlyMapOverlay(ov0.overlay) : null;
var pR1 = ov1 && ov1.overlay ? api.paintWargame3ReadOnlyMapOverlay(ov1.overlay) : null;
assert('T20 — Top next works: step-0 → step-1 paints with objectiveHighlightCount===1',
    pR0 && pR1 &&
    pR0.objectiveHighlightCount === 1 && pR1.objectiveHighlightCount === 1,
    'pR0.ohc=' + (pR0 && pR0.objectiveHighlightCount) + ' pR1.ohc=' + (pR1 && pR1.objectiveHighlightCount));

// ─────────────────────────────────────────────────────────────────────────────
// T21 — Top previous works (step 1 → step 0)
// ─────────────────────────────────────────────────────────────────────────────
var mockL21 = makeMockL(); var mockMap21 = makeMockMap();
window.L = mockL21; window.map = mockMap21;
var pR1b = ov1 && ov1.overlay ? api.paintWargame3ReadOnlyMapOverlay(ov1.overlay) : null;
var pR0b = ov0 && ov0.overlay ? api.paintWargame3ReadOnlyMapOverlay(ov0.overlay) : null;
assert('T21 — Top previous works: step-1 → step-0 paints with objectiveHighlightCount===1',
    pR1b && pR0b &&
    pR1b.objectiveHighlightCount === 1 && pR0b.objectiveHighlightCount === 1,
    'pR1b.ohc=' + (pR1b && pR1b.objectiveHighlightCount) + ' pR0b.ohc=' + (pR0b && pR0b.objectiveHighlightCount));

// ─────────────────────────────────────────────────────────────────────────────
// T22 — Bottom next works (step 15 → step 16)
// ─────────────────────────────────────────────────────────────────────────────
var mockL22 = makeMockL(); var mockMap22 = makeMockMap();
window.L = mockL22; window.map = mockMap22;
var s15Res  = fixture ? api.buildScenarioStepPreview(fixture, 'W3-STEP-15') : null;
var s15Prev = s15Res && s15Res.preview ? s15Res.preview : null;
var s16Res  = fixture ? api.buildScenarioStepPreview(fixture, 'W3-STEP-16') : null;
var s16Prev = s16Res && s16Res.preview ? s16Res.preview : null;
var ov15 = s15Prev ? api.buildWargame3ReadOnlyMapOverlayData(s15Prev) : null;
var ov16 = s16Prev ? api.buildWargame3ReadOnlyMapOverlayData(s16Prev, { previousPreview: s15Prev }) : null;
var pR15 = ov15 && ov15.overlay ? api.paintWargame3ReadOnlyMapOverlay(ov15.overlay) : null;
var pR16 = ov16 && ov16.overlay ? api.paintWargame3ReadOnlyMapOverlay(ov16.overlay) : null;
assert('T22 — Bottom next works: step-15 → step-16 paints with objectiveHighlightCount===1',
    pR15 && pR16 &&
    pR15.objectiveHighlightCount === 1 && pR16.objectiveHighlightCount === 1,
    'pR15.ohc=' + (pR15 && pR15.objectiveHighlightCount) + ' pR16.ohc=' + (pR16 && pR16.objectiveHighlightCount));

// ─────────────────────────────────────────────────────────────────────────────
// T23 — Bottom previous works (step 16 → step 15)
// ─────────────────────────────────────────────────────────────────────────────
var mockL23 = makeMockL(); var mockMap23 = makeMockMap();
window.L = mockL23; window.map = mockMap23;
var pR16b = ov16 && ov16.overlay ? api.paintWargame3ReadOnlyMapOverlay(ov16.overlay) : null;
var pR15b = ov15 && ov15.overlay ? api.paintWargame3ReadOnlyMapOverlay(ov15.overlay) : null;
assert('T23 — Bottom previous works: step-16 → step-15 paints with objectiveHighlightCount===1',
    pR16b && pR15b &&
    pR16b.objectiveHighlightCount === 1 && pR15b.objectiveHighlightCount === 1,
    'pR16b.ohc=' + (pR16b && pR16b.objectiveHighlightCount) + ' pR15b.ohc=' + (pR15b && pR15b.objectiveHighlightCount));

// ─────────────────────────────────────────────────────────────────────────────
// T24 — Jump selector works (arbitrary step)
// ─────────────────────────────────────────────────────────────────────────────
var mockL24 = makeMockL(); var mockMap24 = makeMockMap();
window.L = mockL24; window.map = mockMap24;
var s8Res  = fixture ? api.buildScenarioStepPreview(fixture, 'W3-STEP-08') : null;
var s8Prev = s8Res && s8Res.preview ? s8Res.preview : null;
var ov8    = s8Prev ? api.buildWargame3ReadOnlyMapOverlayData(s8Prev) : null;
var pR8    = ov8 && ov8.overlay ? api.paintWargame3ReadOnlyMapOverlay(ov8.overlay) : null;
assert('T24 — Jump selector works: step-08 direct jump paints with objectiveHighlightCount===1',
    pR8 !== null && pR8.passed === true && pR8.objectiveHighlightCount === 1,
    'objectiveHighlightCount=' + (pR8 && pR8.objectiveHighlightCount));

// ─────────────────────────────────────────────────────────────────────────────
// T25 — AMBER RIDGE (non-W3) overlay does not paint W3 objective highlight
// Build a safe overlay that mimics a non-W3 scenario (no objective coordinates).
// ─────────────────────────────────────────────────────────────────────────────
var amberRidgeLikeOverlay = makeSafeOverlay([{
    kind: 'objective_preview_highlight',
    objectiveId: 'AR-BRIDGE-ALPHA',
    name: 'Bridge Alpha',
    status: '', lat: null, lon: null,
    hasCoordinate: false,
    source: 'preview_objective', readOnly: true
}]);
var mockL25 = makeMockL(); var mockMap25 = makeMockMap();
window.L = mockL25; window.map = mockMap25;
var paintRes25 = api.paintWargame3ReadOnlyMapOverlay(amberRidgeLikeOverlay);
assert('T25 — AMBER RIDGE-like overlay does not paint W3 objective highlight',
    paintRes25.passed === true && paintRes25.objectiveHighlightCount === 0,
    'objectiveHighlightCount=' + paintRes25.objectiveHighlightCount);

// ─────────────────────────────────────────────────────────────────────────────
// T26 — window.RmoozScenario.stepIndex unchanged after all paints
// ─────────────────────────────────────────────────────────────────────────────
assert('T26 — window.RmoozScenario.stepIndex remains 3 (unchanged)',
    window.RmoozScenario.stepIndex === 3,
    'stepIndex=' + window.RmoozScenario.stepIndex);

// ─────────────────────────────────────────────────────────────────────────────
// T27 — window.units not mutated
// ─────────────────────────────────────────────────────────────────────────────
assert('T27 — window.units not mutated (still empty array reference)',
    Array.isArray(window.units) && window.units.length === 0,
    'units.length=' + window.units.length);

// ─────────────────────────────────────────────────────────────────────────────
// T28 — window.lines not mutated
// ─────────────────────────────────────────────────────────────────────────────
assert('T28 — window.lines not mutated (still empty array reference)',
    Array.isArray(window.lines) && window.lines.length === 0,
    'lines.length=' + window.lines.length);

// ─────────────────────────────────────────────────────────────────────────────
// T29 — raw W3 JSON not mutated
// ─────────────────────────────────────────────────────────────────────────────
assert('T29 — w3json.obj.coord not mutated',
    Array.isArray(w3json.obj.coord) &&
    w3json.obj.coord[0] === 19.55 &&
    w3json.obj.coord[1] === 29.74,
    'coord=' + JSON.stringify(w3json.obj.coord));
assert('T29b — w3json.steps.length not mutated',
    Array.isArray(w3json.steps) && w3json.steps.length === 17,
    'steps.length=' + (Array.isArray(w3json.steps) ? w3json.steps.length : '?'));

// ─────────────────────────────────────────────────────────────────────────────
// T30 — window.RmoozScenario not replaced
// ─────────────────────────────────────────────────────────────────────────────
assert('T30 — window.RmoozScenario not replaced (scenario field preserved)',
    typeof window.RmoozScenario === 'object' &&
    typeof window.RmoozScenario.scenario === 'object',
    'RmoozScenario.scenario changed');

// ─────────────────────────────────────────────────────────────────────────────
// T31 — no storage calls in paint source
// ─────────────────────────────────────────────────────────────────────────────
assert('T31 — no localStorage in paintWargame3ReadOnlyMapOverlay body',
    paintSrc.indexOf('localStorage') === -1,
    'localStorage found');
assert('T31b — no sessionStorage in paintWargame3ReadOnlyMapOverlay body',
    paintSrc.indexOf('sessionStorage') === -1,
    'sessionStorage found');

// ─────────────────────────────────────────────────────────────────────────────
// T32 — no fetch/backend calls in paint source
// ─────────────────────────────────────────────────────────────────────────────
assert('T32 — no fetch() in paintWargame3ReadOnlyMapOverlay body',
    paintSrc.indexOf('fetch(') === -1,
    'fetch() found');
assert('T32b — no XMLHttpRequest in paintWargame3ReadOnlyMapOverlay body',
    paintSrc.indexOf('XMLHttpRequest') === -1,
    'XMLHttpRequest found');

// ─────────────────────────────────────────────────────────────────────────────
// T33 — no AI/sim/journal calls in paint source
// ─────────────────────────────────────────────────────────────────────────────
assert('T33 — no /api/sim/ in paintWargame3ReadOnlyMapOverlay body',
    paintSrc.indexOf('/api/sim/') === -1,
    '/api/sim/ found');
assert('T33b — no journal in paintWargame3ReadOnlyMapOverlay body',
    paintSrc.indexOf('journal') === -1,
    'journal found');
assert('T33c — no window.units assignment in paintWargame3ReadOnlyMapOverlay body',
    paintSrc.indexOf('window.units') === -1,
    'window.units found');

// ─────────────────────────────────────────────────────────────────────────────
// T34 — app.js not changed
// ─────────────────────────────────────────────────────────────────────────────
var appSrc = fs.readFileSync(
    path.join(__dirname, 'UI_MOdified/client/app.js'), 'utf8');
assert('T34 — app.js does not contain PR-253 marker',
    appSrc.indexOf('PR-253') === -1,
    'PR-253 found in app.js');

// ─────────────────────────────────────────────────────────────────────────────
// T35 — adjudicator-map.js not changed
// ─────────────────────────────────────────────────────────────────────────────
var adjSrc = fs.readFileSync(
    path.join(__dirname, 'UI_MOdified/client/wargame/adjudicator-map.js'), 'utf8');
assert('T35 — adjudicator-map.js does not contain PR-253 marker',
    adjSrc.indexOf('PR-253') === -1,
    'PR-253 found in adjudicator-map.js');

// ─────────────────────────────────────────────────────────────────────────────
// T36 — no apply/commit/confirm/execute/Gate 7 in paint source
// ─────────────────────────────────────────────────────────────────────────────
assert('T36 — no applyScenario in paintWargame3ReadOnlyMapOverlay body',
    paintSrc.indexOf('applyScenario') === -1,
    'applyScenario found');
assert('T36b — no commitNow in paintWargame3ReadOnlyMapOverlay body',
    paintSrc.indexOf('commitNow') === -1,
    'commitNow found');
assert('T36c — no fitBounds in paintWargame3ReadOnlyMapOverlay body',
    paintSrc.indexOf('fitBounds') === -1,
    'fitBounds found');

// ─────────────────────────────────────────────────────────────────────────────
// T37 — existing W3 preview pipeline (previewWargame3Fixture) still works
// ─────────────────────────────────────────────────────────────────────────────
window.L = null; window.map = null;
var pvRes37 = api.previewWargame3Fixture(w3json);
assert('T37 — previewWargame3Fixture still works after PR-253',
    pvRes37.passed === true && pvRes37.preview && typeof pvRes37.preview.activeStepId === 'string',
    'passed=' + pvRes37.passed);

// ─────────────────────────────────────────────────────────────────────────────
// T38 — auditWargame3MapPreviewCoverage still works
// ─────────────────────────────────────────────────────────────────────────────
var covRes38 = api.auditWargame3MapPreviewCoverage(w3json);
assert('T38 — auditWargame3MapPreviewCoverage still works after PR-253',
    covRes38.passed === true && Array.isArray(covRes38.steps) && covRes38.steps.length === 17,
    'steps=' + (Array.isArray(covRes38.steps) ? covRes38.steps.length : '?'));

// ─────────────────────────────────────────────────────────────────────────────
// T39 — unit marker overlay still has 12 markers for step-5
// ─────────────────────────────────────────────────────────────────────────────
assert('T39 — overlay5.markers still has 12 unit markers (unaffected by PR-253)',
    overlay5 !== null && Array.isArray(overlay5.markers) && overlay5.markers.length === 12,
    'markers.length=' + (overlay5 ? overlay5.markers.length : '?'));

// ─────────────────────────────────────────────────────────────────────────────
// T40 — movement trail overlay still has trails for step-4→5 transition
// ─────────────────────────────────────────────────────────────────────────────
assert('T40 — overlay5.movementTrails still has trails for step-4→5 transition',
    overlay5 !== null &&
    Array.isArray(overlay5.movementTrails) &&
    overlay5.movementTrails.length > 0,
    'movementTrails.length=' + (overlay5 ? overlay5.movementTrails.length : '?'));

// ─────────────────────────────────────────────────────────────────────────────
// T41 — no console errors: all 17 steps paint without throwing
// ─────────────────────────────────────────────────────────────────────────────
var mockL41 = makeMockL(); var mockMap41 = makeMockMap();
window.L = mockL41; window.map = mockMap41;
var t41errors = [];
var t41prevPrev = null;
for (var t41i = 0; t41i < stepRefs.length; t41i++) {
    try {
        var t41sRes  = fixture ? api.buildScenarioStepPreview(fixture, stepRefs[t41i]) : null;
        var t41sPrev = t41sRes && t41sRes.preview ? t41sRes.preview : null;
        var t41oRes  = t41sPrev
            ? api.buildWargame3ReadOnlyMapOverlayData(t41sPrev, { previousPreview: t41prevPrev })
            : null;
        var t41ov    = t41oRes && t41oRes.overlay ? t41oRes.overlay : null;
        if (t41ov) { api.paintWargame3ReadOnlyMapOverlay(t41ov); }
        t41prevPrev = t41sPrev;
    } catch (e) {
        t41errors.push(stepRefs[t41i] + ': ' + String(e));
    }
}
assert('T41 — all 17 steps paint without throwing (no console errors)',
    t41errors.length === 0,
    t41errors.join(' | '));

// ─────────────────────────────────────────────────────────────────────────────
// Results
// ─────────────────────────────────────────────────────────────────────────────
results.forEach(function (r) { console.log(r); });
console.log('');
if (failed === 0) {
    console.log('ALL PASS  (' + passed + '/' + (passed + failed) + ')');
} else {
    console.log('FAILURES: ' + failed + ' of ' + (passed + failed));
    process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary output
// ─────────────────────────────────────────────────────────────────────────────
console.log('');
console.log('── PR-253 Objective Highlight Paint Summary ' +
            '─'.repeat(35));

// Build a fresh overlay and paint with mock to show final paint state
var sumL = makeMockL(); var sumMap = makeMockMap();
window.L = sumL; window.map = sumMap;
var sumOvRes = step5Prev
    ? api.buildWargame3ReadOnlyMapOverlayData(step5Prev, { previousPreview: step4Prev })
    : null;
var sumOv = sumOvRes && sumOvRes.overlay ? sumOvRes.overlay : null;
var sumPaint = sumOv ? api.paintWargame3ReadOnlyMapOverlay(sumOv) : null;

var sumObjCM = sumPaint ? sumL._circleMarkerCalls.find(function (l) {
    return l._opts.className === 'sw-w3-preview-obj';
}) : null;

console.log('  Paint method:          L.circleMarker (pixel-radius, not geographic range circle)');
console.log('  radius (pixels):       ' +
    (sumObjCM ? sumObjCM._opts.radius : '?') + '  (unit dots use 6px; objective uses 10px)');
console.log('  color/fill:            ' +
    (sumObjCM ? sumObjCM._opts.color + ' / ' + sumObjCM._opts.fillColor : '?'));
console.log('  objectiveHighlightCount: ' + (sumPaint ? sumPaint.objectiveHighlightCount : '?'));
console.log('  markerCount:           ' + (sumPaint ? sumPaint.markerCount : '?'));
console.log('  movementTrailCount:    ' + (sumPaint ? sumPaint.movementTrailCount : '?'));
console.log('');
console.log('  Painted circleMarker latlng:');
console.log('    lat = ' + (sumObjCM ? sumObjCM._latlng[0] : '?') +
            '  (from w3json.obj.coord[1])');
console.log('    lon = ' + (sumObjCM ? sumObjCM._latlng[1] : '?') +
            '  (from w3json.obj.coord[0])');
console.log('');
console.log('  Tooltip:               ' + (sumObjCM && sumObjCM._tip ? sumObjCM._tip : '?'));
console.log('');
var focusSumRes = sumOv ? api.buildWargame3PreviewMapFocusBounds(sumOv) : null;
console.log('  Focus bounds sourceCounts: ' +
    JSON.stringify(focusSumRes ? focusSumRes.sourceCounts : null));
console.log('');
var readSum = api.buildWargame3MapPreviewReadinessReport(w3json);
console.log('  Readiness: ' + readSum.readiness);
var hasObjGapSum = (readSum.remainingGaps || []).some(function (g) {
    return g && g.code === 'OBJECTIVE_COORDS_MISSING';
});
console.log('  OBJECTIVE_COORDS_MISSING gap present: ' + hasObjGapSum);
console.log('─'.repeat(80));
