'use strict';

// ── PR-254 Test Harness — Wargame 3 Manual Map Walkthrough ────────────────────
// Full read-only operator-style walkthrough: W3-STEP-00 through W3-STEP-16.
// Verifies:
//   - all 17 steps build, overlay, and paint correctly
//   - objective highlight present and at correct coordinate for every step
//   - movement trails per transition (step N-1 → N)
//   - old overlay clears before new overlay paints
//   - forward / backward / jump navigation patterns
//   - AMBER RIDGE preview does not paint W3 overlay
//   - all safety invariants (no mutation, no storage, no fetch, no live execution)
// No DOM. Uses minimal Leaflet mock. No real map. No window.units. No scenario mutation.

var fs   = require('fs');
var path = require('path');

var src    = fs.readFileSync(
    path.join(__dirname, 'UI_MOdified/client/shell/scenario-workspace.js'), 'utf8');
var w3json = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'UI_MOdified/data/scenarios/wargame3.json'), 'utf8'));

// ── Minimal Leaflet mock factory ──────────────────────────────────────────────
function makeMockL() {
    var L = {
        _circleMarkerCalls: [], _circleCalls: [], _polylineCalls: [], _layerGroups: [],
        circleMarker: function (ll, opts) {
            var layer = {
                _type: 'circleMarker', _latlng: ll, _opts: opts || {},
                options: {}, _tip: null,
                bindTooltip: function (c) { this._tip = c; return this; },
                addTo:       function (g) { g._layers.push(this); return this; }
            };
            L._circleMarkerCalls.push(layer);
            return layer;
        },
        circle: function (ll, opts) {
            var layer = {
                _type: 'circle', _latlng: ll, _opts: opts || {},
                options: {},
                bindTooltip: function () { return this; },
                addTo:       function (g) { g._layers.push(this); return this; }
            };
            L._circleCalls.push(layer);
            return layer;
        },
        polyline: function (lls, opts) {
            var layer = {
                _type: 'polyline', _latlngs: lls, _opts: opts || {},
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
        _layerGroups: [], _removedLayers: [],
        removeLayer: function (layer) {
            this._removedLayers.push(layer);
            var i = this._layerGroups.indexOf(layer);
            if (i >= 0) { this._layerGroups.splice(i, 1); }
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

// ── Shared window object (L / map injected per test section) ──────────────────
var window = {
    map: null, L: null,
    units: [], lines: [],
    RmoozScenario: { stepIndex: 5, scenario: {} }
};

// ── Extract code blocks ───────────────────────────────────────────────────────
var bsspStart = src.indexOf('    var _BSSP_SAFETY_TRUE');
var bsspEnd   = src.indexOf('    function buildScenarioStepPreview', bsspStart);
var bsspSrc   = src.slice(bsspStart, bsspEnd);

var w3aStart = src.indexOf('// ── PR-215: Wargame 3 Fixture Adapter');
var w3aEnd   = src.indexOf('// ── PR-216: Wargame 3 Dry-Run Preview Harness');
var w3aSrc   = src.slice(w3aStart, w3aEnd);

var w3modConstStart = src.indexOf('// ── PR-241: Read-Only Map Overlay Data Builder — unsafe');
var w3modConstEnd   = src.indexOf('// ── PR-241: Wargame 3 Read-Only Map Overlay type guard');
var w3modConstSrc   = src.slice(w3modConstStart, w3modConstEnd);

var builderSrc        = extractFn('buildScenarioStepPreview');
var harnSrc           = extractFn('previewWargame3Fixture');
var isGuardSrc        = extractFn('isWargame3ReadOnlyMapOverlayDataSafe');
var buildOvSrc        = extractFn('buildWargame3ReadOnlyMapOverlayData');
var clearSrc          = extractFn('clearWargame3ReadOnlyMapOverlay');
var paintSrc          = extractFn('paintWargame3ReadOnlyMapOverlay');
var paintFromPrevSrc  = extractFn('paintWargame3PreviewMapOverlayFromPreview');
var auditCovSrc       = extractFn('auditWargame3MapPreviewCoverage');
var deltaSrc          = extractFn('auditWargame3StepCoordinateDeltas');
var trailCovSrc       = extractFn('auditWargame3MovementTrailCoverage');
var buildFocusSrc     = extractFn('buildWargame3PreviewMapFocusBounds');
var auditObjSrc       = extractFn('auditWargame3ObjectiveCoordinateSources');
var readinessSrc      = extractFn('buildWargame3MapPreviewReadinessReport');

// Stub for paintWargame3PreviewMapOverlayFromPreview's optional audit paint path
var auditPaintStub = [
    'function paintWargame3PreviewMapOverlayFromPreview_auditStub() { return null; }'
].join('\n');

// ── Build combined execution environment ──────────────────────────────────────
// Module-level state variables needed by paintWargame3PreviewMapOverlayFromPreview
var stateSrc = [
    'var _w3PreviewLayer   = null;',
    'var _drpPreviewSource = null;',   // set via _testSetDrpPreviewSource()
    // Minimal stub for paintDryRunPreview (not under test; called only in DOM path)
    'function paintDryRunPreview() { return; }',
    // Minimal stub for _updateDrpNavButtons (DOM-only)
    'function _updateDrpNavButtons() { return; }',
    // Test-only setter for _drpPreviewSource
    'function _testSetDrpPreviewSource(src) { _drpPreviewSource = src; }'
].join('\n');

var combined = [
    stateSrc,
    bsspSrc,
    builderSrc,
    w3aSrc,
    harnSrc,
    w3modConstSrc,
    isGuardSrc,
    buildOvSrc,
    clearSrc,
    paintSrc,
    paintFromPrevSrc,
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
    ' paintWargame3PreviewMapOverlayFromPreview:   paintWargame3PreviewMapOverlayFromPreview,' +
    ' auditWargame3MapPreviewCoverage:             auditWargame3MapPreviewCoverage,' +
    ' auditWargame3StepCoordinateDeltas:           auditWargame3StepCoordinateDeltas,' +
    ' auditWargame3MovementTrailCoverage:          auditWargame3MovementTrailCoverage,' +
    ' buildWargame3PreviewMapFocusBounds:          buildWargame3PreviewMapFocusBounds,' +
    ' auditWargame3ObjectiveCoordinateSources:     auditWargame3ObjectiveCoordinateSources,' +
    ' buildWargame3MapPreviewReadinessReport:      buildWargame3MapPreviewReadinessReport,' +
    ' _testSetDrpPreviewSource:                    _testSetDrpPreviewSource };'
);
var api = fn(window);

// ── Test runner ───────────────────────────────────────────────────────────────
var passed = 0; var failed = 0; var results = [];
function assert(label, cond, detail) {
    if (cond) { passed++; results.push('  PASS  ' + label); }
    else       { failed++; results.push('  FAIL  ' + label + (detail ? '  →  ' + detail : '')); }
}

// ── Pre-compute fixture ───────────────────────────────────────────────────────
var W3_OBJ_LAT = w3json.obj.coord[1];   // 29.74
var W3_OBJ_LON = w3json.obj.coord[0];   // 19.55
var STEP_REFS  = (function () {
    var out = [];
    for (var i = 0; i < 17; i++) { out.push('W3-STEP-' + (i < 10 ? '0' + i : '' + i)); }
    return out;
}());

var adaptRes = api.adaptWargame3ToFixture(w3json);
var fixture  = adaptRes.fixture;

// ── SECTION A — Readiness ─────────────────────────────────────────────────────

// T01 — readiness_for_walkthrough
var readRes = api.buildWargame3MapPreviewReadinessReport(w3json);
assert('T01 — readiness report returns ready_for_walkthrough',
    readRes.passed === true && readRes.readiness === 'ready_for_walkthrough',
    'readiness=' + readRes.readiness + ' blockers=' + JSON.stringify(readRes.blockers));

// ── SECTION B — Full forward walkthrough (steps 0–16) ─────────────────────────
// Set up Leaflet mock for the entire walkthrough.  One pre-drain call ensures
// _w3PreviewLayer is null before step-0 (so step-0 produces no removal).
var mockLW = makeMockL(); var mockMapW = makeMockMap();
(function () {
    var preMap = makeMockMap(); window.map = preMap;
    api.clearWargame3ReadOnlyMapOverlay();
})();
window.L = mockLW; window.map = mockMapW;

var walkthroughData = [];   // per-step results
var walkPrevPrev    = null;

for (var wi = 0; wi < STEP_REFS.length; wi++) {
    var wRef    = STEP_REFS[wi];
    var wBuild  = fixture ? api.buildScenarioStepPreview(fixture, wRef) : null;
    var wPrev   = (wBuild && wBuild.passed && wBuild.preview) ? wBuild.preview : null;
    var wOvRes  = wPrev
        ? api.buildWargame3ReadOnlyMapOverlayData(wPrev, { previousPreview: walkPrevPrev })
        : null;
    var wOv     = (wOvRes && wOvRes.overlay) ? wOvRes.overlay : null;
    var wPaint  = wOv ? api.paintWargame3ReadOnlyMapOverlay(wOv) : null;

    // Capture the objective circleMarker painted for this step
    var objCMs  = mockLW._circleMarkerCalls.filter(function (c) {
        return c._opts.className === 'sw-w3-preview-obj';
    });

    walkthroughData.push({
        stepRef:                wRef,
        buildOK:                !!(wBuild && wBuild.passed),
        overlayOK:              !!wOv,
        paintPassed:            !!(wPaint && wPaint.passed),
        markerCount:            wPaint ? wPaint.markerCount : 0,
        movementTrailCount:     wPaint ? wPaint.movementTrailCount : 0,
        objectiveHighlightCount:wPaint ? wPaint.objectiveHighlightCount : 0,
        objCircleMarkerCount:   objCMs.length,
        lastObjCM:              objCMs.length > 0 ? objCMs[objCMs.length - 1] : null
    });

    walkPrevPrev = wPrev;
}

// T02 — all 17 steps build successfully
assert('T02 — all 17 steps build successfully (buildScenarioStepPreview)',
    walkthroughData.every(function (d) { return d.buildOK; }),
    walkthroughData.filter(function (d) { return !d.buildOK; }).map(function (d) { return d.stepRef; }).join(','));

// T03 — all 17 steps produce valid overlay data
assert('T03 — all 17 steps produce valid overlay data',
    walkthroughData.every(function (d) { return d.overlayOK; }),
    walkthroughData.filter(function (d) { return !d.overlayOK; }).map(function (d) { return d.stepRef; }).join(','));

// T04 — all 17 steps paint successfully with objectiveHighlightCount === 1
var allOhc1 = walkthroughData.every(function (d) { return d.paintPassed && d.objectiveHighlightCount === 1; });
assert('T04 — all 17 steps paint successfully with objectiveHighlightCount === 1',
    allOhc1,
    walkthroughData.filter(function (d) { return d.objectiveHighlightCount !== 1; })
                   .map(function (d) { return d.stepRef + '=' + d.objectiveHighlightCount; }).join(','));

// T05 — all 17 steps paint objective at lat=29.74 / lon=19.55
assert('T05 — all 17 steps paint objective at lat=29.74 / lon=19.55',
    walkthroughData.every(function (d) {
        return d.lastObjCM &&
               d.lastObjCM._latlng[0] === W3_OBJ_LAT &&
               d.lastObjCM._latlng[1] === W3_OBJ_LON;
    }),
    walkthroughData.filter(function (d) {
        return !d.lastObjCM ||
               d.lastObjCM._latlng[0] !== W3_OBJ_LAT ||
               d.lastObjCM._latlng[1] !== W3_OBJ_LON;
    }).map(function (d) { return d.stepRef; }).join(','));

// T06 — all 17 steps produce markerCount > 0
assert('T06 — all 17 steps produce markerCount > 0',
    walkthroughData.every(function (d) { return d.markerCount > 0; }),
    walkthroughData.filter(function (d) { return d.markerCount === 0; })
                   .map(function (d) { return d.stepRef + '=0'; }).join(','));

// T07 — step 0 has movementTrailCount === 0 (no previous step to delta against)
var step0Data = walkthroughData[0];
assert('T07 — W3-STEP-00 movementTrailCount === 0 (no previous step)',
    step0Data && step0Data.movementTrailCount === 0,
    'step0.movementTrailCount=' + (step0Data && step0Data.movementTrailCount));

// T08 — at least one later step has movementTrailCount > 0
var anyTrails = walkthroughData.slice(1).some(function (d) { return d.movementTrailCount > 0; });
assert('T08 — at least one step after step-0 has movementTrailCount > 0',
    anyTrails,
    'all later steps have 0 trails');

// T09 — total movement trails across walkthrough matches expected audit value (31)
var totalTrails = walkthroughData.reduce(function (acc, d) { return acc + d.movementTrailCount; }, 0);
var trailAudit  = api.auditWargame3MovementTrailCoverage(w3json);
var expectedTrailTotal = trailAudit.passed ? trailAudit.totalMovementTrails : 31;
assert('T09 — total movement trails across walkthrough matches audit value (' + expectedTrailTotal + ')',
    totalTrails === expectedTrailTotal,
    'walkthrough total=' + totalTrails + ' audit total=' + expectedTrailTotal);

// ── SECTION C — Old overlay clears before new paints ─────────────────────────

// T16 — in a 17-step walkthrough, 16 layer-group removals happen (first step clears nothing)
assert('T16 — old overlay clears before new overlay paints (16 removals in 17-step walk)',
    mockMapW._removedLayers.length === 16,
    'removals=' + mockMapW._removedLayers.length);

// ── SECTION D — Navigation patterns ──────────────────────────────────────────
// Simulate top/bottom next and previous by building overlays in sequence.
// Each navigation action: build step preview → build overlay → paint.
// "top next" and "bottom next" are identical pipelines — same underlying call.

// Pre-drain before nav tests
(function () {
    var preMap = makeMockMap(); window.map = preMap;
    api.clearWargame3ReadOnlyMapOverlay();
})();

function buildAndPaint(stepRef, prevPreview) {
    var mockLN = makeMockL(); var mockMapN = makeMockMap();
    window.L = mockLN; window.map = mockMapN;
    var br    = fixture ? api.buildScenarioStepPreview(fixture, stepRef) : null;
    var prev  = br && br.passed && br.preview ? br.preview : null;
    var ovRes = prev
        ? api.buildWargame3ReadOnlyMapOverlayData(prev, { previousPreview: prevPreview })
        : null;
    var ov    = ovRes && ovRes.overlay ? ovRes.overlay : null;
    var pr    = ov ? api.paintWargame3ReadOnlyMapOverlay(ov) : null;
    return { passed: !!(pr && pr.passed), preview: prev, ohc: pr ? pr.objectiveHighlightCount : 0,
             markerCount: pr ? pr.markerCount : 0, trailCount: pr ? pr.movementTrailCount : 0 };
}

// T10 — top next: step-0 → step-1 → step-2 (forward)
var nav0 = buildAndPaint('W3-STEP-00', null);
var nav1 = buildAndPaint('W3-STEP-01', nav0.preview);
var nav2 = buildAndPaint('W3-STEP-02', nav1.preview);
assert('T10 — top next forward: steps 0→1→2 all paint with objectiveHighlightCount===1',
    nav0.ohc === 1 && nav1.ohc === 1 && nav2.ohc === 1,
    'step0.ohc=' + nav0.ohc + ' step1.ohc=' + nav1.ohc + ' step2.ohc=' + nav2.ohc);

// T11 — top previous: step-2 → step-1 → step-0 (backward)
var navBack2 = buildAndPaint('W3-STEP-02', nav1.preview);
var navBack1 = buildAndPaint('W3-STEP-01', nav0.preview);
var navBack0 = buildAndPaint('W3-STEP-00', null);
assert('T11 — top previous backward: steps 2→1→0 all paint with objectiveHighlightCount===1',
    navBack2.ohc === 1 && navBack1.ohc === 1 && navBack0.ohc === 1,
    'step2.ohc=' + navBack2.ohc + ' step1.ohc=' + navBack1.ohc + ' step0.ohc=' + navBack0.ohc);

// T12 — bottom next: step-14 → step-15 → step-16 (forward, end of range)
var nav14 = buildAndPaint('W3-STEP-14', null);
var nav15 = buildAndPaint('W3-STEP-15', nav14.preview);
var nav16 = buildAndPaint('W3-STEP-16', nav15.preview);
assert('T12 — bottom next forward: steps 14→15→16 all paint with objectiveHighlightCount===1',
    nav14.ohc === 1 && nav15.ohc === 1 && nav16.ohc === 1,
    'step14.ohc=' + nav14.ohc + ' step15.ohc=' + nav15.ohc + ' step16.ohc=' + nav16.ohc);

// T13 — bottom previous: step-16 → step-15 → step-14 (backward, end of range)
var navEnd16 = buildAndPaint('W3-STEP-16', nav15.preview);
var navEnd15 = buildAndPaint('W3-STEP-15', nav14.preview);
var navEnd14 = buildAndPaint('W3-STEP-14', null);
assert('T13 — bottom previous backward: steps 16→15→14 all paint with objectiveHighlightCount===1',
    navEnd16.ohc === 1 && navEnd15.ohc === 1 && navEnd14.ohc === 1,
    'step16.ohc=' + navEnd16.ohc + ' step15.ohc=' + navEnd15.ohc + ' step14.ohc=' + navEnd14.ohc);

// T14 — jump selector: jump from step-0 to step-08
var navJump8 = buildAndPaint('W3-STEP-08', null);
assert('T14 — jump selector: direct jump to W3-STEP-08 paints correctly (objectiveHighlightCount===1)',
    navJump8.passed === true && navJump8.ohc === 1,
    'passed=' + navJump8.passed + ' ohc=' + navJump8.ohc);

// T15 — jump selector: jump to step-16
var navJump16 = buildAndPaint('W3-STEP-16', nav15.preview);
assert('T15 — jump selector: direct jump to W3-STEP-16 paints correctly (objectiveHighlightCount===1)',
    navJump16.passed === true && navJump16.ohc === 1,
    'passed=' + navJump16.passed + ' ohc=' + navJump16.ohc);

// ── SECTION E — AMBER RIDGE does not paint W3 overlay ────────────────────────

// T17 — AMBER RIDGE preview (non-W3 activeStepId) clears W3 layer and returns painted:false
// First paint a W3 overlay so there is something to clear.
var mockL17 = makeMockL(); var mockMap17 = makeMockMap();
window.L = mockL17; window.map = mockMap17;
var amber8Res = api.buildScenarioStepPreview(fixture, 'W3-STEP-08');
var amber8Prev = amber8Res && amber8Res.preview ? amber8Res.preview : null;
var amber8OvRes = amber8Prev ? api.buildWargame3ReadOnlyMapOverlayData(amber8Prev) : null;
var amber8Ov = amber8OvRes && amber8OvRes.overlay ? amber8OvRes.overlay : null;
if (amber8Ov) { api.paintWargame3ReadOnlyMapOverlay(amber8Ov); }  // paint W3 first

// Now simulate AMBER RIDGE preview coming through
// (non-W3 activeStepId, readOnly:true, liveMutationAllowed:false)
var amberRidgePrev = {
    readOnly: true,
    liveMutationAllowed: false,
    activeStepId: 'AMBER-STEP-01',
    fixtureName: 'Amber Ridge', packageName: 'Amber Ridge'
};
var amber17res = api.paintWargame3PreviewMapOverlayFromPreview(amberRidgePrev);
assert('T17 — AMBER RIDGE preview does not paint W3 overlay (painted===false)',
    amber17res.passed === true && amber17res.painted === false &&
    amber17res.objectiveHighlightCount === 0,
    'passed=' + amber17res.passed + ' painted=' + amber17res.painted + ' ohc=' + amber17res.objectiveHighlightCount);
// Also: after AMBER RIDGE preview, the W3 layer should have been cleared
assert('T17b — AMBER RIDGE preview clears any existing W3 layer',
    mockMap17._removedLayers.length >= 1,
    'removedLayers=' + mockMap17._removedLayers.length);

// ── SECTION F — Focus bounds ──────────────────────────────────────────────────

// T18 — focus bounds available for a strong step (step-7 has trails from pr-249 audit)
window.L = null; window.map = null;
var s7Res  = fixture ? api.buildScenarioStepPreview(fixture, 'W3-STEP-07') : null;
var s7Prev = s7Res && s7Res.preview ? s7Res.preview : null;
var s6Res  = fixture ? api.buildScenarioStepPreview(fixture, 'W3-STEP-06') : null;
var s6Prev = s6Res && s6Res.preview ? s6Res.preview : null;
var s7OvRes = s7Prev ? api.buildWargame3ReadOnlyMapOverlayData(s7Prev, { previousPreview: s6Prev }) : null;
var s7Ov    = s7OvRes && s7OvRes.overlay ? s7OvRes.overlay : null;
var focus18 = s7Ov ? api.buildWargame3PreviewMapFocusBounds(s7Ov) : null;
assert('T18 — map focus bounds are available for step-7 (hasBounds===true)',
    focus18 !== null && focus18.passed === true && focus18.hasBounds === true,
    'focus18.hasBounds=' + (focus18 && focus18.hasBounds));
assert('T18b — focus bounds sourceCounts.objectives === 1',
    focus18 !== null && focus18.sourceCounts && focus18.sourceCounts.objectives === 1,
    'sourceCounts=' + JSON.stringify(focus18 && focus18.sourceCounts));

// ── SECTION G — Safety guards ─────────────────────────────────────────────────

// T19 — objective is a circleMarker, not a geographic range circle
//       (checked on walkthrough data: zero L.circle calls for objective)
assert('T19 — objective highlight is not a range circle (L.circleMarker used, not L.circle)',
    mockLW._circleCalls.length === 0,
    'L.circle calls=' + mockLW._circleCalls.length);

// T20 — no weapon/detection/radius rings (checked in paintSrc body)
var objSection20 = (function () {
    var s = paintSrc.indexOf('// 6. Objective highlights');
    var e = paintSrc.indexOf('// 7. Effect hints', s);
    return s !== -1 && e !== -1 ? paintSrc.slice(s, e) : paintSrc;
}());
assert('T20 — no radius_km / weapon / detection / casualty rings in objective paint section',
    objSection20.indexOf('radius_km')    === -1 &&
    objSection20.indexOf('weaponRing')   === -1 &&
    objSection20.indexOf('sensorRing')   === -1 &&
    objSection20.indexOf('detectionRing') === -1,
    'found a ring keyword');

// T21 — window.RmoozScenario.stepIndex unchanged (remains 5)
assert('T21 — window.RmoozScenario.stepIndex remains 5 (unchanged through walkthrough)',
    window.RmoozScenario.stepIndex === 5,
    'stepIndex=' + window.RmoozScenario.stepIndex);

// T22 — window.units not mutated
assert('T22 — window.units not mutated',
    Array.isArray(window.units) && window.units.length === 0,
    'units.length=' + window.units.length);

// T23 — window.lines not mutated
assert('T23 — window.lines not mutated',
    Array.isArray(window.lines) && window.lines.length === 0,
    'lines.length=' + window.lines.length);

// T24 — window.RmoozScenario not replaced
assert('T24 — window.RmoozScenario.scenario not mutated',
    typeof window.RmoozScenario === 'object' &&
    typeof window.RmoozScenario.scenario === 'object',
    'RmoozScenario changed');

// T25 — raw W3 JSON not mutated
assert('T25 — w3json.obj.coord not mutated',
    Array.isArray(w3json.obj.coord) &&
    w3json.obj.coord[0] === 19.55 && w3json.obj.coord[1] === 29.74,
    'coord=' + JSON.stringify(w3json.obj.coord));
assert('T25b — w3json.steps.length not mutated',
    Array.isArray(w3json.steps) && w3json.steps.length === 17,
    'steps.length=' + (Array.isArray(w3json.steps) ? w3json.steps.length : '?'));

// T26 — no storage calls in paint source
assert('T26 — no localStorage / sessionStorage in paintWargame3ReadOnlyMapOverlay',
    paintSrc.indexOf('localStorage') === -1 && paintSrc.indexOf('sessionStorage') === -1,
    'storage keyword found');

// T27 — no fetch/backend calls
assert('T27 — no fetch() / XMLHttpRequest in paintWargame3ReadOnlyMapOverlay',
    paintSrc.indexOf('fetch(') === -1 && paintSrc.indexOf('XMLHttpRequest') === -1,
    'network keyword found');

// T28 — no AI/simulation/journal calls
assert('T28 — no /api/sim/ / journal / window.units assignment in paintWargame3ReadOnlyMapOverlay',
    paintSrc.indexOf('/api/sim/') === -1 &&
    paintSrc.indexOf('journal') === -1 &&
    paintSrc.indexOf('window.units') === -1,
    'sim/journal keyword found');

// T29 — app.js not modified
var appSrc = fs.readFileSync(path.join(__dirname, 'UI_MOdified/client/app.js'), 'utf8');
assert('T29 — app.js does not contain PR-254 marker',
    appSrc.indexOf('PR-254') === -1,
    'PR-254 found in app.js');

// T30 — adjudicator-map.js not modified
var adjSrc = fs.readFileSync(path.join(__dirname, 'UI_MOdified/client/wargame/adjudicator-map.js'), 'utf8');
assert('T30 — adjudicator-map.js does not contain PR-254 marker',
    adjSrc.indexOf('PR-254') === -1,
    'PR-254 found in adjudicator-map.js');

// T31 — no apply/commit/confirm/execute/Gate 7 in paint source
assert('T31 — no applyScenario / commitNow / fitBounds / Gate7 in paintWargame3ReadOnlyMapOverlay',
    paintSrc.indexOf('applyScenario') === -1 &&
    paintSrc.indexOf('commitNow')     === -1 &&
    paintSrc.indexOf('fitBounds')     === -1 &&
    paintSrc.indexOf('Gate7')         === -1,
    'forbidden keyword found');

// ── SECTION H — Pipeline integrity ───────────────────────────────────────────

// T32 — previewWargame3Fixture still works
window.L = null; window.map = null;
var pvRes32 = api.previewWargame3Fixture(w3json);
assert('T32 — previewWargame3Fixture still works after PR-254',
    pvRes32.passed === true && pvRes32.preview && typeof pvRes32.preview.activeStepId === 'string',
    'passed=' + pvRes32.passed);

// T33 — auditWargame3MapPreviewCoverage still works (17 steps, drawable objective at every step)
var cov33 = api.auditWargame3MapPreviewCoverage(w3json);
var allDrawObjSteps = Array.isArray(cov33.steps) &&
    cov33.steps.every(function (s) { return (s.drawableObjectiveCount || 0) === 1; });
assert('T33 — auditWargame3MapPreviewCoverage: all 17 steps have drawableObjectiveCount===1',
    cov33.passed === true && cov33.steps.length === 17 && allDrawObjSteps,
    'drawableObj steps: ' + (Array.isArray(cov33.steps) ? cov33.steps.length : '?') +
    ' allOK=' + allDrawObjSteps);

// T34 — existing marker overlay still works (verify overlay5 markers unchanged)
var s5Res34  = fixture ? api.buildScenarioStepPreview(fixture, 'W3-STEP-05') : null;
var s5Prev34 = s5Res34 && s5Res34.preview ? s5Res34.preview : null;
var ov534    = s5Prev34 ? api.buildWargame3ReadOnlyMapOverlayData(s5Prev34) : null;
assert('T34 — step-5 overlay.markers has 12 unit markers',
    ov534 && Array.isArray(ov534.overlay.markers) && ov534.overlay.markers.length === 12,
    'markers.length=' + (ov534 ? ov534.overlay.markers.length : '?'));

// T35 — existing movement trail overlay still works (step-4→5 has trails)
var s4Res35  = fixture ? api.buildScenarioStepPreview(fixture, 'W3-STEP-04') : null;
var s4Prev35 = s4Res35 && s4Res35.preview ? s4Res35.preview : null;
var ov535    = s5Prev34 ? api.buildWargame3ReadOnlyMapOverlayData(s5Prev34, { previousPreview: s4Prev35 }) : null;
assert('T35 — step-4→5 transition overlay has movement trails',
    ov535 && Array.isArray(ov535.overlay.movementTrails) && ov535.overlay.movementTrails.length > 0,
    'movementTrails.length=' + (ov535 ? ov535.overlay.movementTrails.length : '?'));

// T36 — existing objective highlight still works
var ov5Obj36 = ov535 && ov535.overlay.objectiveHighlights;
assert('T36 — step-5 objectiveHighlights[0].hasCoordinate===true and lat/lon correct',
    Array.isArray(ov5Obj36) && ov5Obj36.length > 0 &&
    ov5Obj36[0].hasCoordinate === true &&
    ov5Obj36[0].lat === W3_OBJ_LAT && ov5Obj36[0].lon === W3_OBJ_LON,
    'hasCoord=' + (ov5Obj36 && ov5Obj36[0] && ov5Obj36[0].hasCoordinate));

// T37 — existing focus bounds helper still works
var focus37 = ov535 ? api.buildWargame3PreviewMapFocusBounds(ov535.overlay) : null;
assert('T37 — buildWargame3PreviewMapFocusBounds still works (hasBounds===true)',
    focus37 && focus37.passed === true && focus37.hasBounds === true,
    'hasBounds=' + (focus37 && focus37.hasBounds));

// T38 — top/bottom navigation stable (repeated nav between step-0 and step-8 produces consistent results)
var s0Check = buildAndPaint('W3-STEP-00', null);
var s8Check = buildAndPaint('W3-STEP-08', null);
var s0Again = buildAndPaint('W3-STEP-00', null);
assert('T38 — repeated navigation between step-0 and step-8 produces consistent ohc===1',
    s0Check.ohc === 1 && s8Check.ohc === 1 && s0Again.ohc === 1,
    's0.ohc=' + s0Check.ohc + ' s8.ohc=' + s8Check.ohc + ' s0again.ohc=' + s0Again.ohc);

// T39 — jump selector stable (jump from step-3 to step-12 to step-0)
var j3  = buildAndPaint('W3-STEP-03', null);
var j12 = buildAndPaint('W3-STEP-12', null);
var j0  = buildAndPaint('W3-STEP-00', null);
assert('T39 — jump selector: step-3 → step-12 → step-0 all produce ohc===1',
    j3.ohc === 1 && j12.ohc === 1 && j0.ohc === 1,
    'j3.ohc=' + j3.ohc + ' j12.ohc=' + j12.ohc + ' j0.ohc=' + j0.ohc);

// T40 — no console errors: paint all 17 steps a second pass with a fresh mock
var mockL40 = makeMockL(); var mockMap40 = makeMockMap();
(function () {
    var preMap = makeMockMap(); window.map = preMap;
    api.clearWargame3ReadOnlyMapOverlay();
})();
window.L = mockL40; window.map = mockMap40;
var t40Errors = [];
var t40PrevPrev = null;
for (var t40i = 0; t40i < STEP_REFS.length; t40i++) {
    try {
        var t40br   = fixture ? api.buildScenarioStepPreview(fixture, STEP_REFS[t40i]) : null;
        var t40prev = t40br && t40br.passed && t40br.preview ? t40br.preview : null;
        var t40or   = t40prev
            ? api.buildWargame3ReadOnlyMapOverlayData(t40prev, { previousPreview: t40PrevPrev })
            : null;
        var t40ov   = t40or && t40or.overlay ? t40or.overlay : null;
        if (t40ov)  { api.paintWargame3ReadOnlyMapOverlay(t40ov); }
        t40PrevPrev = t40prev;
    } catch (e) {
        t40Errors.push(STEP_REFS[t40i] + ': ' + String(e));
    }
}
assert('T40 — all 17 steps paint without throwing on second pass (no console errors)',
    t40Errors.length === 0,
    t40Errors.join(' | '));

// ── Results ───────────────────────────────────────────────────────────────────
results.forEach(function (r) { console.log(r); });
console.log('');
if (failed === 0) {
    console.log('ALL PASS  (' + passed + '/' + (passed + failed) + ')');
} else {
    console.log('FAILURES: ' + failed + ' of ' + (passed + failed));
    process.exit(1);
}

// ── Walkthrough summary table ─────────────────────────────────────────────────
console.log('');
console.log('── PR-254 Walkthrough Summary (W3-STEP-00 … W3-STEP-16) ' + '─'.repeat(22));
console.log('  Step          Markers  Trails  ObjHighlight  ObjCoord');
walkthroughData.forEach(function (d) {
    var coord = d.lastObjCM
        ? (d.lastObjCM._latlng[0] + '/' + d.lastObjCM._latlng[1])
        : 'MISSING';
    var markers  = String(d.markerCount).padStart(4);
    var trails   = String(d.movementTrailCount).padStart(4);
    var ohc      = String(d.objectiveHighlightCount).padStart(4);
    var note     = d.movementTrailCount === 0 ? ' (no prior step)' : '';
    console.log('  ' + d.stepRef + '     ' + markers + '    ' + trails + '    ' +
                ohc + '         ' + coord + note);
});
console.log('');
console.log('  Total movement trails: ' + totalTrails + ' (matches audit: ' + expectedTrailTotal + ')');
console.log('  Readiness: ' + readRes.readiness);
var strongestStep = walkthroughData.reduce(function (best, d) {
    return d.movementTrailCount > best.movementTrailCount ? d : best;
}, walkthroughData[0]);
var quietSteps = walkthroughData.filter(function (d) { return d.movementTrailCount === 0; });
console.log('  Strongest visual step: ' + strongestStep.stepRef +
            ' (trails=' + strongestStep.movementTrailCount + ', markers=' + strongestStep.markerCount + ')');
console.log('  Quiet steps (no trails): ' +
    quietSteps.map(function (d) { return d.stepRef; }).join(', '));
console.log('─'.repeat(80));
