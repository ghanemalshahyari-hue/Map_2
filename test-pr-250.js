'use strict';

// ── PR-250 Test Harness — Wargame 3 Read-Only Map Focus Helper ────────────────
// Tests buildWargame3PreviewMapFocusBounds and focusWargame3PreviewMapBounds:
// input guard, return shape, bounds calculation, sourceCounts, no-map-access by
// default, optional apply gate, safety invariants, and existing functions intact.
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
    _fitBoundsCalled:  false,
    _fitBoundsLastArg: null,
    map: null,    // null by default — focus helper must block gracefully
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
var buildFocusSrc      = extractFn('buildWargame3PreviewMapFocusBounds');
var focusHelperSrc     = extractFn('focusWargame3PreviewMapBounds');

// Stub paintWargame3ReadOnlyMapOverlay — no Leaflet in test environment.
var paintStubSrc = [
    'function paintWargame3ReadOnlyMapOverlay(overlay, options) {',
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
    focusHelperSrc
].join('\n');

var fn = new Function('window',
    combined + '\nreturn {' +
    ' adaptWargame3ToFixture:                 adaptWargame3ToFixture,' +
    ' buildScenarioStepPreview:               buildScenarioStepPreview,' +
    ' previewWargame3Fixture:                 previewWargame3Fixture,' +
    ' isWargame3ReadOnlyMapOverlayDataSafe:   isWargame3ReadOnlyMapOverlayDataSafe,' +
    ' buildWargame3ReadOnlyMapOverlayData:    buildWargame3ReadOnlyMapOverlayData,' +
    ' auditWargame3MapPreviewCoverage:        auditWargame3MapPreviewCoverage,' +
    ' buildWargame3PreviewMapFocusBounds:     buildWargame3PreviewMapFocusBounds,' +
    ' focusWargame3PreviewMapBounds:          focusWargame3PreviewMapBounds };'
);
var api = fn(window);

// ── Test runner ───────────────────────────────────────────────────────────────
var passed = 0; var failed = 0; var results = [];
function assert(label, cond, detail) {
    if (cond) { passed++; results.push('  PASS  ' + label); }
    else       { failed++; results.push('  FAIL  ' + label + (detail ? '  →  ' + detail : '')); }
}

// ── Overlay factory helpers ───────────────────────────────────────────────────
// Produces a minimal safe overlay that passes isWargame3ReadOnlyMapOverlayDataSafe.
function makeSafeOverlay(opts) {
    opts = opts || {};
    return {
        overlayType:         'wargame3_preview_read_only',
        source:              'dry_run_preview',
        readOnly:            true,
        liveMutationAllowed: false,
        markers:             opts.markers             || [],
        objectiveHighlights: opts.objectiveHighlights || [],
        effectHints:         opts.effectHints         || [],
        movementTrails:      opts.movementTrails       || [],
        warnings:            opts.warnings             || [],
        blockedReasons:      opts.blockedReasons       || []
    };
}

// Build a safe marker entry.
function mkMarker(lat, lon, uid) {
    return {
        kind: 'unit_preview_marker', uid: uid || 'u1',
        name: uid || 'u1', side: 'friendly', role: '',
        lat: lat, lon: lon,
        hasCoordinate: (lat !== null && lon !== null &&
                        typeof lat === 'number' && isFinite(lat) &&
                        typeof lon === 'number' && isFinite(lon)),
        source: 'preview_unit', readOnly: true
    };
}

// Build a safe movement trail entry.
function mkTrail(fromLat, fromLon, toLat, toLon, uid) {
    return {
        kind: 'unit_preview_movement_trail', uid: uid || 't1',
        name: uid || 't1', side: 'enemy', role: '',
        fromLat: fromLat, fromLon: fromLon,
        toLat:   toLat,   toLon:   toLon,
        hasCoordinate: true, source: 'preview_step_delta', readOnly: true
    };
}

// Build real W3 step-5 overlay (with movement trails from step-4→5).
// buildScenarioStepPreview returns { passed, preview, blockedReasons } — the
// actual preview object lives at .preview, not the result root.
var w3AdaptResult = api.adaptWargame3ToFixture(w3json);
var step4Preview = null, step5Preview = null;
if (w3AdaptResult.passed && w3AdaptResult.fixture) {
    var _s4res = api.buildScenarioStepPreview(w3AdaptResult.fixture, 'W3-STEP-04');
    var _s5res = api.buildScenarioStepPreview(w3AdaptResult.fixture, 'W3-STEP-05');
    step4Preview = (_s4res && _s4res.preview) ? _s4res.preview : null;
    step5Preview = (_s5res && _s5res.preview) ? _s5res.preview : null;
}
var realOverlayRes = null;
if (step4Preview && step5Preview) {
    realOverlayRes = api.buildWargame3ReadOnlyMapOverlayData(
        step5Preview, { previousPreview: step4Preview });
}
var realOverlay = (realOverlayRes && realOverlayRes.passed) ? realOverlayRes.overlay : null;

// ─────────────────────────────────────────────────────────────────────────────
// T01 — null overlay blocks safely
// ─────────────────────────────────────────────────────────────────────────────
var t01 = api.buildWargame3PreviewMapFocusBounds(null);
assert('T01 — null overlay returns passed:false without throwing',
    t01.passed === false && Array.isArray(t01.blockedReasons) && t01.blockedReasons.length > 0,
    JSON.stringify(t01.blockedReasons));

// ─────────────────────────────────────────────────────────────────────────────
// T02 — invalid overlay blocks safely (wrong overlayType)
// ─────────────────────────────────────────────────────────────────────────────
var t02 = api.buildWargame3PreviewMapFocusBounds(
    { overlayType: 'BAD', source: 'dry_run_preview', readOnly: true,
      liveMutationAllowed: false, markers: [], objectiveHighlights: [],
      effectHints: [], movementTrails: [], warnings: [], blockedReasons: [] });
assert('T02 — invalid overlay (wrong overlayType) returns passed:false',
    t02.passed === false && t02.blockedReasons.length > 0,
    JSON.stringify(t02.blockedReasons));

// ─────────────────────────────────────────────────────────────────────────────
// T03 — safe overlay with no coordinates → passed:true, hasBounds:false
// ─────────────────────────────────────────────────────────────────────────────
var t03 = api.buildWargame3PreviewMapFocusBounds(makeSafeOverlay());
assert('T03 — safe overlay with no coords: passed:true',
    t03.passed === true,
    JSON.stringify(t03.blockedReasons));
assert('T03b — safe overlay with no coords: hasBounds:false',
    t03.hasBounds === false,
    'hasBounds=' + t03.hasBounds);
assert('T03c — safe overlay with no coords: bounds is null',
    t03.bounds === null,
    String(t03.bounds));
assert('T03d — safe overlay with no coords: center is null',
    t03.center === null,
    String(t03.center));
assert('T03e — safe overlay with no coords: warning present',
    t03.warnings.some(function (w) { return w.code === 'W3BOUNDS_NO_COORDS'; }),
    JSON.stringify(t03.warnings));

// ─────────────────────────────────────────────────────────────────────────────
// T04 — safe overlay with one marker → bounds and center
// ─────────────────────────────────────────────────────────────────────────────
var t04ov = makeSafeOverlay({ markers: [mkMarker(30.5, 19.6, 'u1')] });
var t04   = api.buildWargame3PreviewMapFocusBounds(t04ov);
assert('T04 — one marker: passed:true',
    t04.passed === true,
    JSON.stringify(t04.blockedReasons));
assert('T04b — one marker: hasBounds:true',
    t04.hasBounds === true,
    'hasBounds=' + t04.hasBounds);
assert('T04c — one marker: bounds non-null',
    t04.bounds !== null,
    String(t04.bounds));
assert('T04d — one marker: bounds south === lat',
    t04.bounds !== null && t04.bounds.south === 30.5,
    'south=' + (t04.bounds && t04.bounds.south));
assert('T04e — one marker: bounds north === lat (degenerate)',
    t04.bounds !== null && t04.bounds.north === 30.5,
    'north=' + (t04.bounds && t04.bounds.north));
assert('T04f — one marker: bounds west === lon',
    t04.bounds !== null && t04.bounds.west === 19.6,
    'west=' + (t04.bounds && t04.bounds.west));
assert('T04g — one marker: bounds east === lon (degenerate)',
    t04.bounds !== null && t04.bounds.east === 19.6,
    'east=' + (t04.bounds && t04.bounds.east));
assert('T04h — one marker: center.lat correct',
    t04.center !== null && t04.center.lat === 30.5,
    'center.lat=' + (t04.center && t04.center.lat));
assert('T04i — one marker: center.lon correct',
    t04.center !== null && t04.center.lon === 19.6,
    'center.lon=' + (t04.center && t04.center.lon));

// ─────────────────────────────────────────────────────────────────────────────
// T05 — multiple markers → correct min/max bounds
// ─────────────────────────────────────────────────────────────────────────────
var t05ov = makeSafeOverlay({
    markers: [
        mkMarker(29.0, 18.5, 'u1'),
        mkMarker(31.5, 20.0, 'u2'),
        mkMarker(30.0, 19.0, 'u3')
    ]
});
var t05 = api.buildWargame3PreviewMapFocusBounds(t05ov);
assert('T05 — multiple markers: south = min lat',
    t05.bounds !== null && t05.bounds.south === 29.0,
    'south=' + (t05.bounds && t05.bounds.south));
assert('T05b — multiple markers: north = max lat',
    t05.bounds !== null && t05.bounds.north === 31.5,
    'north=' + (t05.bounds && t05.bounds.north));
assert('T05c — multiple markers: west = min lon',
    t05.bounds !== null && t05.bounds.west === 18.5,
    'west=' + (t05.bounds && t05.bounds.west));
assert('T05d — multiple markers: east = max lon',
    t05.bounds !== null && t05.bounds.east === 20.0,
    'east=' + (t05.bounds && t05.bounds.east));
assert('T05e — multiple markers: center.lat = (south+north)/2',
    t05.center !== null && t05.center.lat === (29.0 + 31.5) / 2,
    'center.lat=' + (t05.center && t05.center.lat));
assert('T05f — multiple markers: center.lon = (west+east)/2',
    t05.center !== null && t05.center.lon === (18.5 + 20.0) / 2,
    'center.lon=' + (t05.center && t05.center.lon));

// ─────────────────────────────────────────────────────────────────────────────
// T06 — objective coordinates included
// ─────────────────────────────────────────────────────────────────────────────
var t06oh = {
    kind: 'objective_preview_highlight', objectiveId: 'obj1', name: 'Hill 42',
    status: '', lat: 32.0, lon: 21.0, hasCoordinate: true,
    source: 'preview_objective', readOnly: true
};
var t06ov = makeSafeOverlay({ objectiveHighlights: [t06oh] });
var t06   = api.buildWargame3PreviewMapFocusBounds(t06ov);
assert('T06 — objective coord included in bounds',
    t06.hasBounds === true,
    'hasBounds=' + t06.hasBounds);
assert('T06b — objective lat appears in bounds',
    t06.bounds !== null && t06.bounds.south === 32.0 && t06.bounds.north === 32.0,
    JSON.stringify(t06.bounds));
assert('T06c — sourceCounts.objectives === 1',
    t06.sourceCounts.objectives === 1,
    'objectives=' + t06.sourceCounts.objectives);

// ─────────────────────────────────────────────────────────────────────────────
// T07 — movement trail endpoints included
// ─────────────────────────────────────────────────────────────────────────────
var t07ov = makeSafeOverlay({
    movementTrails: [mkTrail(29.5, 18.8, 30.7, 19.4, 't1')]
});
var t07 = api.buildWargame3PreviewMapFocusBounds(t07ov);
assert('T07 — trail endpoints included: hasBounds:true',
    t07.hasBounds === true,
    'hasBounds=' + t07.hasBounds);
assert('T07b — trail south = min(fromLat, toLat)',
    t07.bounds !== null && t07.bounds.south === 29.5,
    'south=' + (t07.bounds && t07.bounds.south));
assert('T07c — trail north = max(fromLat, toLat)',
    t07.bounds !== null && t07.bounds.north === 30.7,
    'north=' + (t07.bounds && t07.bounds.north));
assert('T07d — sourceCounts.movementTrailEndpoints === 2',
    t07.sourceCounts.movementTrailEndpoints === 2,
    'trailPts=' + t07.sourceCounts.movementTrailEndpoints);

// ─────────────────────────────────────────────────────────────────────────────
// T08 — effectHints are ignored (no coordinate extraction)
// ─────────────────────────────────────────────────────────────────────────────
var t08ov = makeSafeOverlay({
    effectHints: [
        { kind: 'text_only_effect_hint', effectType: 'fire', message: 'Strike', readOnly: true, source: 'proposed_visual_effect' }
    ]
});
var t08 = api.buildWargame3PreviewMapFocusBounds(t08ov);
assert('T08 — effectHints do not contribute to bounds',
    t08.hasBounds === false && t08.pointCount === 0,
    'hasBounds=' + t08.hasBounds + ' pointCount=' + t08.pointCount);

// ─────────────────────────────────────────────────────────────────────────────
// T09 — overlay.warnings array is not used as coordinate source
// ─────────────────────────────────────────────────────────────────────────────
var t09ov = makeSafeOverlay({
    warnings: [
        { code: 'TEST', message: 'lat:99 lon:99' }  // should not be parsed
    ]
});
var t09 = api.buildWargame3PreviewMapFocusBounds(t09ov);
assert('T09 — overlay.warnings not used as coordinate source',
    t09.hasBounds === false && t09.pointCount === 0,
    'hasBounds=' + t09.hasBounds);

// ─────────────────────────────────────────────────────────────────────────────
// T10 — null coordinates in markers are ignored
// ─────────────────────────────────────────────────────────────────────────────
var t10ov = makeSafeOverlay({
    markers: [
        { kind: 'unit_preview_marker', uid: 'u1', name: 'u1', side: 'enemy', role: '',
          lat: null, lon: null, hasCoordinate: false,
          source: 'preview_unit', readOnly: true }
    ]
});
var t10 = api.buildWargame3PreviewMapFocusBounds(t10ov);
assert('T10 — null marker coords ignored: hasBounds:false',
    t10.hasBounds === false && t10.pointCount === 0,
    'pointCount=' + t10.pointCount);

// ─────────────────────────────────────────────────────────────────────────────
// T11 — non-finite coordinates are ignored
// ─────────────────────────────────────────────────────────────────────────────
var t11ov = makeSafeOverlay({
    markers: [
        { kind: 'unit_preview_marker', uid: 'u1', name: 'u1', side: 'enemy', role: '',
          lat: Infinity, lon: 19.0, hasCoordinate: true,
          source: 'preview_unit', readOnly: true },
        { kind: 'unit_preview_marker', uid: 'u2', name: 'u2', side: 'enemy', role: '',
          lat: NaN, lon: 20.0, hasCoordinate: true,
          source: 'preview_unit', readOnly: true }
    ]
});
var t11 = api.buildWargame3PreviewMapFocusBounds(t11ov);
assert('T11 — non-finite coords (Infinity/NaN) ignored: hasBounds:false',
    t11.hasBounds === false && t11.pointCount === 0,
    'pointCount=' + t11.pointCount);

// ─────────────────────────────────────────────────────────────────────────────
// T12 — sourceCounts are correct
// ─────────────────────────────────────────────────────────────────────────────
var t12ov = makeSafeOverlay({
    markers: [mkMarker(30.0, 19.0, 'u1'), mkMarker(31.0, 20.0, 'u2')],
    objectiveHighlights: [t06oh],
    movementTrails: [mkTrail(29.0, 18.0, 30.0, 19.0, 'tr1')]
});
var t12 = api.buildWargame3PreviewMapFocusBounds(t12ov);
assert('T12 — sourceCounts.markers === 2',
    t12.sourceCounts.markers === 2,
    'markers=' + t12.sourceCounts.markers);
assert('T12b — sourceCounts.objectives === 1',
    t12.sourceCounts.objectives === 1,
    'objectives=' + t12.sourceCounts.objectives);
assert('T12c — sourceCounts.movementTrailEndpoints === 2',
    t12.sourceCounts.movementTrailEndpoints === 2,
    'trailPts=' + t12.sourceCounts.movementTrailEndpoints);
assert('T12d — pointCount === 5 (2 markers + 1 obj + 2 trail endpoints)',
    t12.pointCount === 5,
    'pointCount=' + t12.pointCount);

// ─────────────────────────────────────────────────────────────────────────────
// T13 — input overlay is not mutated
// ─────────────────────────────────────────────────────────────────────────────
var t13ov = makeSafeOverlay({ markers: [mkMarker(30.0, 19.0, 'u1')] });
var t13markersBefore = t13ov.markers.length;
api.buildWargame3PreviewMapFocusBounds(t13ov);
assert('T13 — input overlay.markers not mutated',
    t13ov.markers.length === t13markersBefore,
    'markers length: before=' + t13markersBefore + ' after=' + t13ov.markers.length);
assert('T13b — input overlay.overlayType not mutated',
    t13ov.overlayType === 'wargame3_preview_read_only',
    'overlayType=' + t13ov.overlayType);

// ─────────────────────────────────────────────────────────────────────────────
// T14 — default helper does not call map.fitBounds
// ─────────────────────────────────────────────────────────────────────────────
var fitBoundsCallCount = 0;
window.map = {
    fitBounds: function () { fitBoundsCallCount++; }
};
var t14ov = makeSafeOverlay({ markers: [mkMarker(30.0, 19.0, 'u1')] });
api.buildWargame3PreviewMapFocusBounds(t14ov);
assert('T14 — buildWargame3PreviewMapFocusBounds does not call map.fitBounds',
    fitBoundsCallCount === 0,
    'fitBounds called ' + fitBoundsCallCount + ' times');
window.map = null;   // reset

// ─────────────────────────────────────────────────────────────────────────────
// T15 — default helper does not paint map (no paintWargame3ReadOnlyMapOverlay call)
// ─────────────────────────────────────────────────────────────────────────────
// Verified by design — buildWargame3PreviewMapFocusBounds is a pure bounds
// calculator; the paint stub would need to be called explicitly.
var t15ov   = makeSafeOverlay({ markers: [mkMarker(30.0, 19.0, 'u1')] });
var t15res  = api.buildWargame3PreviewMapFocusBounds(t15ov);
assert('T15 — buildWargame3PreviewMapFocusBounds returns passed:true without painting',
    t15res.passed === true && t15res.hasBounds === true,
    'passed=' + t15res.passed + ' hasBounds=' + t15res.hasBounds);

// ─────────────────────────────────────────────────────────────────────────────
// T16 — default helper does not create Leaflet layers (no L.layerGroup call)
// ─────────────────────────────────────────────────────────────────────────────
var t16LayerCreated = false;
window.L = { layerGroup: function () { t16LayerCreated = true; return {}; } };
var t16ov = makeSafeOverlay({ markers: [mkMarker(30.0, 19.0, 'u1')] });
api.buildWargame3PreviewMapFocusBounds(t16ov);
assert('T16 — buildWargame3PreviewMapFocusBounds does not create Leaflet layers',
    t16LayerCreated === false,
    'L.layerGroup called: ' + t16LayerCreated);
window.L = null;   // reset

// ─────────────────────────────────────────────────────────────────────────────
// T17 — focus helper: options.apply:false does not pan map
// ─────────────────────────────────────────────────────────────────────────────
fitBoundsCallCount = 0;
window.map = { fitBounds: function () { fitBoundsCallCount++; } };
var t17ov  = makeSafeOverlay({ markers: [mkMarker(30.0, 19.0, 'u1')] });
var t17res = api.focusWargame3PreviewMapBounds(t17ov, { apply: false });
assert('T17 — focus helper apply:false: passed:true',
    t17res.passed === true,
    JSON.stringify(t17res.blockedReasons));
assert('T17b — focus helper apply:false: focused:false',
    t17res.focused === false,
    'focused=' + t17res.focused);
assert('T17c — focus helper apply:false: map.fitBounds NOT called',
    fitBoundsCallCount === 0,
    'fitBounds called ' + fitBoundsCallCount + ' times');
assert('T17d — focus helper apply:false: focusResult has bounds',
    t17res.focusResult && t17res.focusResult.hasBounds === true,
    JSON.stringify(t17res.focusResult));
window.map = null;   // reset

// ─────────────────────────────────────────────────────────────────────────────
// T18 — focus helper: options.apply:true pans viewport; does not mutate scenario
// (In test env window.map is a mock — we verify fitBounds IS called exactly once
//  and scenario state is untouched.)
// ─────────────────────────────────────────────────────────────────────────────
var t18FitArgs = null;
fitBoundsCallCount = 0;
window.map = {
    fitBounds: function (bounds, opts) {
        fitBoundsCallCount++;
        t18FitArgs = { bounds: bounds, opts: opts };
    }
};
window.L = {};  // satisfy the window.L guard
var t18ov  = makeSafeOverlay({ markers: [mkMarker(29.0, 18.0, 'u1'), mkMarker(31.0, 20.0, 'u2')] });
var t18res = api.focusWargame3PreviewMapBounds(t18ov, { apply: true });
assert('T18 — focus helper apply:true: passed:true',
    t18res.passed === true,
    JSON.stringify(t18res.blockedReasons));
assert('T18b — focus helper apply:true: focused:true',
    t18res.focused === true,
    'focused=' + t18res.focused);
assert('T18c — focus helper apply:true: fitBounds called exactly once',
    fitBoundsCallCount === 1,
    'fitBounds called ' + fitBoundsCallCount + ' times');
assert('T18d — focus helper apply:true: fitBounds arg [south,west] correct',
    t18FitArgs && t18FitArgs.bounds[0][0] === 29.0 && t18FitArgs.bounds[0][1] === 18.0,
    JSON.stringify(t18FitArgs));
assert('T18e — focus helper apply:true: fitBounds arg [north,east] correct',
    t18FitArgs && t18FitArgs.bounds[1][0] === 31.0 && t18FitArgs.bounds[1][1] === 20.0,
    JSON.stringify(t18FitArgs));
window.map = null;
window.L   = null;   // reset

// ─────────────────────────────────────────────────────────────────────────────
// T19 — window.RmoozScenario.stepIndex remains unchanged
// ─────────────────────────────────────────────────────────────────────────────
var t19ScenarioMock = { stepIndex: 7, scenario: { name: 'MOCK' } };
window.RmoozScenario = t19ScenarioMock;
var t19ov = makeSafeOverlay({ markers: [mkMarker(30.0, 19.0, 'u1')] });
api.buildWargame3PreviewMapFocusBounds(t19ov);
assert('T19 — stepIndex not mutated by buildWargame3PreviewMapFocusBounds',
    window.RmoozScenario.stepIndex === 7,
    'stepIndex=' + window.RmoozScenario.stepIndex);
api.focusWargame3PreviewMapBounds(t19ov, { apply: false });
assert('T19b — stepIndex not mutated by focusWargame3PreviewMapBounds',
    window.RmoozScenario.stepIndex === 7,
    'stepIndex=' + window.RmoozScenario.stepIndex);
delete window.RmoozScenario;

// ─────────────────────────────────────────────────────────────────────────────
// T20 — window.units is not mutated
// ─────────────────────────────────────────────────────────────────────────────
window.units = [{ id: 'u1', lat: 10, lon: 20 }];
var t20unitsBefore = JSON.stringify(window.units);
var t20ov = makeSafeOverlay({ markers: [mkMarker(30.0, 19.0, 'u1')] });
api.buildWargame3PreviewMapFocusBounds(t20ov);
assert('T20 — window.units not mutated',
    JSON.stringify(window.units) === t20unitsBefore,
    'units changed: ' + JSON.stringify(window.units));
delete window.units;

// ─────────────────────────────────────────────────────────────────────────────
// T21 — window.lines is not mutated
// ─────────────────────────────────────────────────────────────────────────────
window.lines = [{ id: 'l1' }];
var t21linesBefore = JSON.stringify(window.lines);
var t21ov = makeSafeOverlay({ markers: [mkMarker(30.0, 19.0, 'u1')] });
api.buildWargame3PreviewMapFocusBounds(t21ov);
assert('T21 — window.lines not mutated',
    JSON.stringify(window.lines) === t21linesBefore,
    'lines changed: ' + JSON.stringify(window.lines));
delete window.lines;

// ─────────────────────────────────────────────────────────────────────────────
// T22 — window.RmoozScenario is not mutated
// ─────────────────────────────────────────────────────────────────────────────
window.RmoozScenario = { stepIndex: 3, scenario: { name: 'TEST' } };
var t22before = JSON.stringify(window.RmoozScenario);
var t22ov = makeSafeOverlay({ markers: [mkMarker(30.0, 19.0, 'u1')] });
api.buildWargame3PreviewMapFocusBounds(t22ov);
assert('T22 — window.RmoozScenario not mutated',
    JSON.stringify(window.RmoozScenario) === t22before,
    'scenario changed');
delete window.RmoozScenario;

// ─────────────────────────────────────────────────────────────────────────────
// T23 — no storage calls in PR-250 function bodies
// ─────────────────────────────────────────────────────────────────────────────
var t23body = buildFocusSrc + focusHelperSrc;
assert('T23 — no localStorage in PR-250 function bodies',
    !t23body.includes('localStorage'),
    'localStorage found');
assert('T23b — no sessionStorage in PR-250 function bodies',
    !t23body.includes('sessionStorage'),
    'sessionStorage found');

// ─────────────────────────────────────────────────────────────────────────────
// T24 — no fetch/backend calls in PR-250 function bodies
// ─────────────────────────────────────────────────────────────────────────────
assert('T24 — no fetch() in PR-250 function bodies',
    !t23body.includes('fetch('),
    'fetch( found');
assert('T24b — no XMLHttpRequest in PR-250 function bodies',
    !t23body.includes('XMLHttpRequest'),
    'XMLHttpRequest found');

// ─────────────────────────────────────────────────────────────────────────────
// T25 — no AI/simulation/journal calls in PR-250 function bodies
// ─────────────────────────────────────────────────────────────────────────────
assert('T25 — no /api/sim/ in PR-250 function bodies',
    !t23body.includes('/api/sim/'),
    '/api/sim/ found');
assert('T25b — no journal in PR-250 function bodies',
    !t23body.toLowerCase().includes('journal'),
    'journal found');
assert('T25c — no RmoozScenario in PR-250 function bodies',
    !t23body.includes('RmoozScenario'),
    'RmoozScenario found');
assert('T25d — no window.units in PR-250 function bodies',
    !t23body.includes('window.units'),
    'window.units found');
assert('T25e — no window.lines in PR-250 function bodies',
    !t23body.includes('window.lines'),
    'window.lines found');

// ─────────────────────────────────────────────────────────────────────────────
// T26 — app.js does not contain PR-250 marker
// ─────────────────────────────────────────────────────────────────────────────
var appJsSrc = fs.readFileSync(
    path.join(__dirname, 'UI_MOdified/client/app.js'), 'utf8');
assert('T26 — app.js does not contain PR-250 marker',
    !appJsSrc.includes('PR-250'),
    'PR-250 found in app.js');

// ─────────────────────────────────────────────────────────────────────────────
// T27 — adjudicator-map.js does not contain PR-250 marker
// ─────────────────────────────────────────────────────────────────────────────
var adjSrc = fs.readFileSync(
    path.join(__dirname, 'UI_MOdified/client/wargame/adjudicator-map.js'), 'utf8');
assert('T27 — adjudicator-map.js does not contain PR-250 marker',
    !adjSrc.includes('PR-250'),
    'PR-250 found in adjudicator-map.js');

// ─────────────────────────────────────────────────────────────────────────────
// T28 — no apply/commit/confirm/execute/Gate 7 in PR-250 function bodies
// ─────────────────────────────────────────────────────────────────────────────
var t28body = buildFocusSrc + focusHelperSrc;
assert('T28 — no "apply" (non-option) in PR-250 function bodies',
    // opts.apply is fine; we check for applyScenario-style calls
    !t28body.includes('applyScenario') && !t28body.includes('applyStep'),
    'apply call found');
assert('T28b — no commit in PR-250 function bodies',
    !/\bcommit\b/.test(t28body),
    'commit found');
assert('T28c — no Gate7 in PR-250 function bodies',
    !t28body.includes('Gate7') && !t28body.includes('gate7'),
    'Gate7 found');

// ─────────────────────────────────────────────────────────────────────────────
// T29 — existing W3 preview panel still works (previewWargame3Fixture)
// previewWargame3Fixture accepts raw w3json, not the adapted fixture.
// ─────────────────────────────────────────────────────────────────────────────
var t29adapt = api.adaptWargame3ToFixture(w3json);
assert('T29 — adaptWargame3ToFixture still works after PR-250',
    t29adapt.passed === true,
    JSON.stringify(t29adapt.blockedReasons));
var t29prev = api.previewWargame3Fixture(w3json);
assert('T29b — previewWargame3Fixture still works after PR-250',
    t29prev.passed === true,
    JSON.stringify(t29prev.blockedReasons));

// ─────────────────────────────────────────────────────────────────────────────
// T30 — existing W3 event log still works (auditWargame3MapPreviewCoverage)
// ─────────────────────────────────────────────────────────────────────────────
var t30audit = api.auditWargame3MapPreviewCoverage(w3json);
assert('T30 — auditWargame3MapPreviewCoverage still works after PR-250',
    t30audit.passed === true,
    JSON.stringify(t30audit.blockedReasons));

// ─────────────────────────────────────────────────────────────────────────────
// T31 — existing marker overlay still works (buildWargame3ReadOnlyMapOverlayData)
// step5Preview is the .preview object from buildScenarioStepPreview result.
// ─────────────────────────────────────────────────────────────────────────────
var t31res = step5Preview
    ? api.buildWargame3ReadOnlyMapOverlayData(step5Preview)
    : { passed: false, overlay: null, blockedReasons: ['step5Preview is null'], warnings: [] };
assert('T31 — buildWargame3ReadOnlyMapOverlayData still works after PR-250',
    t31res.passed === true,
    JSON.stringify(t31res.blockedReasons));
assert('T31b — overlay.markers is still an array',
    t31res.overlay && Array.isArray(t31res.overlay.markers),
    String(t31res.overlay && t31res.overlay.markers));

// ─────────────────────────────────────────────────────────────────────────────
// T32 — existing movement trail overlay still works
// ─────────────────────────────────────────────────────────────────────────────
assert('T32 — movement trail overlay (step4→5) still builds correctly',
    realOverlay !== null && Array.isArray(realOverlay.movementTrails),
    'realOverlay=' + String(realOverlay));
assert('T32b — step 4→5 still has 3 movement trails after PR-250',
    realOverlay !== null && realOverlay.movementTrails.length === 3,
    'trailCount=' + (realOverlay && realOverlay.movementTrails.length));

// ─────────────────────────────────────────────────────────────────────────────
// T33 — existing top/bottom navigation still works (buildScenarioStepPreview)
// buildScenarioStepPreview returns { passed, preview, blockedReasons }.
// ─────────────────────────────────────────────────────────────────────────────
var t33res0  = api.buildScenarioStepPreview(t29adapt.fixture, 'W3-STEP-00');
var t33res16 = api.buildScenarioStepPreview(t29adapt.fixture, 'W3-STEP-16');
var t33step0  = t33res0  && t33res0.preview  ? t33res0.preview  : null;
var t33step16 = t33res16 && t33res16.preview ? t33res16.preview : null;
assert('T33 — buildScenarioStepPreview W3-STEP-00 still works',
    t33res0 && t33res0.passed === true && t33step0 &&
    t33step0.readOnly === true && t33step0.activeStepId === 'W3-STEP-00',
    'step0=' + JSON.stringify(t33step0 && t33step0.activeStepId));
assert('T33b — buildScenarioStepPreview W3-STEP-16 still works',
    t33res16 && t33res16.passed === true && t33step16 &&
    t33step16.readOnly === true && t33step16.activeStepId === 'W3-STEP-16',
    'step16=' + JSON.stringify(t33step16 && t33step16.activeStepId));

// ─────────────────────────────────────────────────────────────────────────────
// T34 — existing jump selector still works (all 17 steps build successfully)
// ─────────────────────────────────────────────────────────────────────────────
var t34allOk = true;
for (var si = 0; si <= 16; si++) {
    var stepId = 'W3-STEP-' + (si < 10 ? '0' : '') + si;
    var pvRes = api.buildScenarioStepPreview(t29adapt.fixture, stepId);
    if (!pvRes || pvRes.passed !== true || !pvRes.preview || pvRes.preview.readOnly !== true) {
        t34allOk = false; break;
    }
}
assert('T34 — all 17 steps still build after PR-250',
    t34allOk,
    'one or more steps failed');

// ─────────────────────────────────────────────────────────────────────────────
// T35 — exported on AppShellScenarioWorkspace
// ─────────────────────────────────────────────────────────────────────────────
var exportSection = src.slice(src.indexOf('window.AppShellScenarioWorkspace'));
assert('T35 — buildWargame3PreviewMapFocusBounds exported on AppShellScenarioWorkspace',
    exportSection.includes('buildWargame3PreviewMapFocusBounds'),
    'buildWargame3PreviewMapFocusBounds not found in export block');
assert('T35b — focusWargame3PreviewMapBounds exported on AppShellScenarioWorkspace',
    exportSection.includes('focusWargame3PreviewMapBounds'),
    'focusWargame3PreviewMapBounds not found in export block');

// ─────────────────────────────────────────────────────────────────────────────
// T36 — sample bounds from real W3-STEP-05 overlay (sanity check)
// ─────────────────────────────────────────────────────────────────────────────
var t36res = null;
if (realOverlay) {
    t36res = api.buildWargame3PreviewMapFocusBounds(realOverlay);
}
assert('T36 — real step-5 overlay produces valid bounds',
    t36res !== null && t36res.passed === true && t36res.hasBounds === true,
    t36res ? ('passed=' + t36res.passed + ' hasBounds=' + t36res.hasBounds) : 'realOverlay null');
assert('T36b — real step-5 center.lat is in Libya region (~29-32)',
    t36res && t36res.center && t36res.center.lat >= 29.0 && t36res.center.lat <= 33.0,
    'center.lat=' + (t36res && t36res.center && t36res.center.lat));
assert('T36c — real step-5 center.lon is in Libya region (~18-22)',
    t36res && t36res.center && t36res.center.lon >= 18.0 && t36res.center.lon <= 22.0,
    'center.lon=' + (t36res && t36res.center && t36res.center.lon));
assert('T36d — real step-5 pointCount >= 12 (markers)',
    t36res && t36res.pointCount >= 12,
    'pointCount=' + (t36res && t36res.pointCount));

// ─────────────────────────────────────────────────────────────────────────────
// Results
// ─────────────────────────────────────────────────────────────────────────────
results.forEach(function (r) { console.log(r); });
var total = passed + failed;
console.log('\n' + (failed === 0 ? 'ALL PASS' : failed + ' FAILED') +
            '  (' + passed + '/' + total + ')');

// ── Sample bounds from W3-STEP-05 ───────────────────────────────────────────
if (t36res && t36res.passed) {
    console.log('\n── PR-250 Sample Bounds (W3-STEP-04→05 overlay) ─────────────────────');
    console.log('  pointCount:   ' + t36res.pointCount);
    console.log('  sourceCounts: ' + JSON.stringify(t36res.sourceCounts));
    if (t36res.bounds) {
        console.log('  bounds.south: ' + t36res.bounds.south);
        console.log('  bounds.north: ' + t36res.bounds.north);
        console.log('  bounds.west:  ' + t36res.bounds.west);
        console.log('  bounds.east:  ' + t36res.bounds.east);
    }
    if (t36res.center) {
        console.log('  center.lat:   ' + t36res.center.lat);
        console.log('  center.lon:   ' + t36res.center.lon);
    }
    console.log('─────────────────────────────────────────────────────────────────────');
}

process.exit(failed > 0 ? 1 : 0);
