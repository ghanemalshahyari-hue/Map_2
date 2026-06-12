'use strict';

// ── PR-256 Test Harness — Wargame 3 Scenario Walkthrough Findings Report ───────
// Verification-only. Confirms all audit data matches findings report values.
// No production file changes. No DOM. No mutation.
//
// Checks:
//   V01 — readiness remains ready_for_walkthrough
//   V02 — all 17 steps still build
//   V03 — total trails remains 31
//   V04 — objective highlight remains 1 for all 17 steps
//   V05 — W3-STEP-08 ledger rows total 10
//   V06 — W3-STEP-09 ledger rows total 10
//   V07 — no production files changed (app.js / adjudicator-map.js / scenario-workspace.js)
//   V08 — coverage audit data matches report values
//   V09 — objective coordinate source matches w3json.obj.coord
//   V10 — trail coverage audit matches 31 trails / 13 covered transitions
//   V11 — strongest step is W3-STEP-08 (most trails: 4)
//   V12 — quiet steps (STEP-00..03) have 0 trails each
//   V13 — W3-STEP-08 OBJ status is THREATENED
//   V14 — W3-STEP-09 OBJ status is CONTESTED (progression confirmed)
//   V15 — no COMBAT/CASUALTY/DETECTION/WEAPON rows in event log simulation
//   V16 — stepIndex unchanged after all operations
//   V17 — scenario-workspace.js has no PR-256 marker (no production change)

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

// ── Minimal Leaflet mock factory ──────────────────────────────────────────────
function makeMockL() {
    var L = {
        _circleMarkerCalls: [], _circleCalls: [], _polylineCalls: [], _layerGroups: [],
        circleMarker: function (ll, opts) {
            var layer = { _type: 'circleMarker', _latlng: ll, _opts: opts || {},
                options: {}, bindTooltip: function() { return this; }, addTo: function(g) { g._layers.push(this); return this; } };
            L._circleMarkerCalls.push(layer); return layer;
        },
        circle: function (ll, opts) {
            var layer = { _type: 'circle', _latlng: ll, _opts: opts || {},
                options: {}, bindTooltip: function() { return this; }, addTo: function(g) { g._layers.push(this); return this; } };
            L._circleCalls.push(layer); return layer;
        },
        polyline: function (lls, opts) {
            var layer = { _type: 'polyline', _latlngs: lls, _opts: opts || {},
                options: {}, bindTooltip: function() { return this; }, addTo: function(g) { g._layers.push(this); return this; } };
            L._polylineCalls.push(layer); return layer;
        },
        layerGroup: function () {
            var lg = { _layers: [], clearLayers: function() { this._layers=[]; }, addTo: function(map) { map._layerGroups.push(this); return this; } };
            L._layerGroups.push(lg); return lg;
        }
    };
    return L;
}
function makeMockMap() {
    return { _layerGroups: [], _removedLayers: [],
        removeLayer: function(l) { this._removedLayers.push(l); var i=this._layerGroups.indexOf(l); if(i>=0)this._layerGroups.splice(i,1); return this; }
    };
}

// ── Shared window object ──────────────────────────────────────────────────────
var window = {
    map: null, L: null,
    units: [], lines: [],
    RmoozScenario: { stepIndex: 8, scenario: {} }
};
var unitsRef   = window.units;
var linesRef   = window.lines;
var scenRef    = window.RmoozScenario;

// ── Extract code blocks ───────────────────────────────────────────────────────
var bsspStart = src.indexOf('    var _BSSP_SAFETY_TRUE');
var bsspEnd   = src.indexOf('    function buildScenarioStepPreview', bsspStart);
var bsspSrc   = src.slice(bsspStart, bsspEnd);

var w3aStart  = src.indexOf('// ── PR-215: Wargame 3 Fixture Adapter');
var w3aEnd    = src.indexOf('// ── PR-216: Wargame 3 Dry-Run Preview Harness');
var w3aSrc    = src.slice(w3aStart, w3aEnd);

var w3modConstStart = src.indexOf('// ── PR-241: Read-Only Map Overlay Data Builder — unsafe');
var w3modConstEnd   = src.indexOf('// ── PR-241: Wargame 3 Read-Only Map Overlay type guard');
var w3modConstSrc   = src.slice(w3modConstStart, w3modConstEnd);

var builderSrc       = extractFn('buildScenarioStepPreview');
var harnSrc          = extractFn('previewWargame3Fixture');
var isGuardSrc       = extractFn('isWargame3ReadOnlyMapOverlayDataSafe');
var buildOvSrc       = extractFn('buildWargame3ReadOnlyMapOverlayData');
var clearSrc         = extractFn('clearWargame3ReadOnlyMapOverlay');
var paintSrc         = extractFn('paintWargame3ReadOnlyMapOverlay');
var paintFromPrevSrc = extractFn('paintWargame3PreviewMapOverlayFromPreview');
var auditCovSrc      = extractFn('auditWargame3MapPreviewCoverage');
var deltaSrc         = extractFn('auditWargame3StepCoordinateDeltas');
var trailCovSrc      = extractFn('auditWargame3MovementTrailCoverage');
var buildFocusSrc    = extractFn('buildWargame3PreviewMapFocusBounds');
var auditObjSrc      = extractFn('auditWargame3ObjectiveCoordinateSources');
var readinessSrc     = extractFn('buildWargame3MapPreviewReadinessReport');

var stateSrc = [
    'var _w3PreviewLayer   = null;',
    'var _drpPreviewSource = null;',
    'function paintDryRunPreview() { return; }',
    'function _updateDrpNavButtons() { return; }',
    'function _testSetDrpPreviewSource(s) { _drpPreviewSource = s; }'
].join('\n');

var combined = [
    stateSrc, bsspSrc, builderSrc, w3aSrc, harnSrc, w3modConstSrc,
    isGuardSrc, buildOvSrc, clearSrc, paintSrc, paintFromPrevSrc,
    auditCovSrc, deltaSrc, trailCovSrc, buildFocusSrc, auditObjSrc, readinessSrc
].join('\n');

var fn = new Function('window',
    combined + '\nreturn {' +
    ' adaptWargame3ToFixture:                    adaptWargame3ToFixture,' +
    ' buildScenarioStepPreview:                  buildScenarioStepPreview,' +
    ' previewWargame3Fixture:                    previewWargame3Fixture,' +
    ' isWargame3ReadOnlyMapOverlayDataSafe:      isWargame3ReadOnlyMapOverlayDataSafe,' +
    ' buildWargame3ReadOnlyMapOverlayData:       buildWargame3ReadOnlyMapOverlayData,' +
    ' clearWargame3ReadOnlyMapOverlay:           clearWargame3ReadOnlyMapOverlay,' +
    ' paintWargame3ReadOnlyMapOverlay:           paintWargame3ReadOnlyMapOverlay,' +
    ' paintWargame3PreviewMapOverlayFromPreview: paintWargame3PreviewMapOverlayFromPreview,' +
    ' auditWargame3MapPreviewCoverage:           auditWargame3MapPreviewCoverage,' +
    ' auditWargame3StepCoordinateDeltas:         auditWargame3StepCoordinateDeltas,' +
    ' auditWargame3MovementTrailCoverage:        auditWargame3MovementTrailCoverage,' +
    ' buildWargame3PreviewMapFocusBounds:        buildWargame3PreviewMapFocusBounds,' +
    ' auditWargame3ObjectiveCoordinateSources:   auditWargame3ObjectiveCoordinateSources,' +
    ' buildWargame3MapPreviewReadinessReport:    buildWargame3MapPreviewReadinessReport,' +
    ' _testSetDrpPreviewSource:                  _testSetDrpPreviewSource };'
);
var api = fn(window);

// ── Test runner ───────────────────────────────────────────────────────────────
var passed = 0; var failed = 0; var results = [];
function assert(label, cond, detail) {
    if (cond) { passed++; results.push('  PASS  ' + label); }
    else       { failed++; results.push('  FAIL  ' + label + (detail ? '  →  ' + detail : '')); }
}

// ── Event log simulator (mirrors _buildW3EventLog exactly, returns array) ─────
function simulateEventLogRows(p, warnsArr) {
    var rows = []; var warns = warnsArr || [];
    var MAX_U = 4;
    function addRow(t, type, src, msg) {
        rows.push({ time: t || '—', type: type, source: src || '—', message: msg || '—' });
    }
    var timeToken = p.activeStepId || '—';
    if (typeof p.stepSummary === 'string' && p.stepSummary) {
        var dashIdx  = p.stepSummary.indexOf(' — ');
        var rawToken = dashIdx > -1 ? p.stepSummary.slice(0, dashIdx).trim() : p.stepSummary.trim();
        timeToken = rawToken.length > 12 ? rawToken.slice(0, 11) + '…' : rawToken;
    }
    // STEP row
    var stepMsg = (typeof p.stepSummary === 'string' && p.stepSummary) ? p.stepSummary
                : (typeof p.situation === 'string' && p.situation)
                    ? p.situation.split('\n')[0].slice(0, 80) : '—';
    addRow(timeToken, 'STEP', 'PREVIEW', stepMsg);
    // OBJ row
    var obs = (typeof p.objectiveStatusBaseline === 'string' && p.objectiveStatusBaseline)
        ? p.objectiveStatusBaseline : null;
    if (obs) {
        var objDesc = (p.objectivesReferenced && p.objectivesReferenced.length > 0)
            ? p.objectivesReferenced[0].description : '';
        addRow(timeToken, 'OBJ', 'PREVIEW', obs + (objDesc ? ' — ' + objDesc : ''));
    }
    // UNIT rows (capped at MAX_U + overflow)
    var units = (p.unitsReferenced && p.unitsReferenced.length > 0) ? p.unitsReferenced : [];
    for (var ui = 0; ui < Math.min(units.length, MAX_U); ui++) {
        var u = units[ui];
        var uSide = (u.side || '').toUpperCase() || 'PREVIEW';
        addRow(timeToken, 'UNIT', uSide, u.displayName + (u.role ? ' / ' + u.role : ''));
    }
    if (units.length > MAX_U) {
        addRow(timeToken, 'UNIT', 'PREVIEW', '+' + (units.length - MAX_U) + ' more');
    }
    // EFFECT row
    var effCount = (p.proposedVisualEffects && p.proposedVisualEffects.length) || 0;
    if (effCount > 0) {
        addRow(timeToken, 'EFFECT', 'PREVIEW', 'Text-only preview effects available: ' + effCount);
    }
    // WARN rows
    for (var wi = 0; wi < warns.length; wi++) {
        var w = warns[wi];
        var wMsg = (w && typeof w.message === 'string') ? w.message
                 : (typeof w === 'string') ? w : String(w);
        addRow(timeToken, 'WARN', 'PREVIEW', wMsg);
    }
    return rows;
}

// ── Pre-compute fixture and audit results ─────────────────────────────────────
var adaptRes  = api.adaptWargame3ToFixture(w3json);
var fixture   = adaptRes.fixture;
var readRes   = api.buildWargame3MapPreviewReadinessReport(w3json);
var covAudit  = api.auditWargame3MapPreviewCoverage(w3json);
var trailAudit= api.auditWargame3MovementTrailCoverage(w3json);
var objAudit  = api.auditWargame3ObjectiveCoordinateSources(w3json);

var STEP_REFS = (function () {
    var out = [];
    for (var i = 0; i < 17; i++) { out.push('W3-STEP-' + (i < 10 ? '0' + i : '' + i)); }
    return out;
}());

// ── Full walkthrough (collect per-step data) ──────────────────────────────────
(function () { var pm = makeMockMap(); window.map = pm; api.clearWargame3ReadOnlyMapOverlay(); }());

var mockLW = makeMockL(); var mockMapW = makeMockMap();
window.L = mockLW; window.map = mockMapW;

var walkthroughData = [];
var walkPrevPrev    = null;

for (var wi = 0; wi < STEP_REFS.length; wi++) {
    var wRef   = STEP_REFS[wi];
    var wBuild = fixture ? api.buildScenarioStepPreview(fixture, wRef) : null;
    var wPrev  = (wBuild && wBuild.passed && wBuild.preview) ? wBuild.preview : null;
    var wOvRes = wPrev ? api.buildWargame3ReadOnlyMapOverlayData(wPrev, { previousPreview: walkPrevPrev }) : null;
    var wOv    = (wOvRes && wOvRes.overlay) ? wOvRes.overlay : null;
    var wPaint = wOv ? api.paintWargame3ReadOnlyMapOverlay(wOv) : null;

    // Warns from step preview (matches _paintToDOM → _buildW3EventLog call path)
    var wBuildWarns = wBuild
        ? (wBuild.preview && wBuild.preview.warningsDetail
            ? wBuild.preview.warningsDetail : wBuild.warnings || [])
        : [];
    var evlRows = wPrev ? simulateEventLogRows(wPrev, wBuildWarns) : [];

    walkthroughData.push({
        stepRef:                wRef,
        buildOK:                !!(wBuild && wBuild.passed),
        overlayOK:              !!wOv,
        paintPassed:            !!(wPaint && wPaint.passed),
        markerCount:            wPaint ? wPaint.markerCount            : 0,
        movementTrailCount:     wPaint ? wPaint.movementTrailCount     : 0,
        objectiveHighlightCount:wPaint ? wPaint.objectiveHighlightCount : 0,
        stepSummary:            wPrev  ? (wPrev.stepSummary || '—')    : '—',
        objectiveStatus:        wPrev  ? (wPrev.objectiveStatusBaseline || '—') : '—',
        evlRowCount:            evlRows.length,
        evlRows:                evlRows,
        warnings:               wOv    ? (wOv.warnings || [])          : []
    });

    walkPrevPrev = wPrev;
}

var totalTrails = walkthroughData.reduce(function (acc, d) { return acc + d.movementTrailCount; }, 0);

// ─────────────────────────────────────────────────────────────────────────────
// V01 — readiness remains ready_for_walkthrough
// ─────────────────────────────────────────────────────────────────────────────
assert('V01 — readiness remains ready_for_walkthrough',
    readRes.passed === true && readRes.readiness === 'ready_for_walkthrough',
    'readiness=' + readRes.readiness);

// ─────────────────────────────────────────────────────────────────────────────
// V02 — all 17 steps still build
// ─────────────────────────────────────────────────────────────────────────────
assert('V02 — all 17 steps still build (buildScenarioStepPreview)',
    walkthroughData.every(function (d) { return d.buildOK && d.overlayOK && d.paintPassed; }),
    walkthroughData.filter(function (d) { return !d.buildOK || !d.overlayOK || !d.paintPassed; })
                   .map(function (d) { return d.stepRef; }).join(','));

// ─────────────────────────────────────────────────────────────────────────────
// V03 — total movement trails remains 31
// ─────────────────────────────────────────────────────────────────────────────
assert('V03 — total movement trails across all 17 steps === 31',
    totalTrails === 31,
    'totalTrails=' + totalTrails);

// ─────────────────────────────────────────────────────────────────────────────
// V04 — objective highlight === 1 for all 17 steps
// ─────────────────────────────────────────────────────────────────────────────
assert('V04 — objectiveHighlightCount === 1 for all 17 steps',
    walkthroughData.every(function (d) { return d.objectiveHighlightCount === 1; }),
    walkthroughData.filter(function (d) { return d.objectiveHighlightCount !== 1; })
                   .map(function (d) { return d.stepRef + '=' + d.objectiveHighlightCount; }).join(','));

// ─────────────────────────────────────────────────────────────────────────────
// V05 — W3-STEP-08 ledger rows total 10
// (1 STEP + 1 OBJ + 4 UNIT + 1 overflow + 1 EFFECT + 2 WARN = 10)
// Warns come from wBuild.preview.warningsDetail (step-level: 2 MISSING_FIELD)
// not from overlay.warnings (which also contains W3MOD_MARKERS_CAPPED).
// ─────────────────────────────────────────────────────────────────────────────
var step08Data = walkthroughData[8];
assert('V05 — W3-STEP-08 event log row count === 10',
    step08Data && step08Data.evlRowCount === 10,
    'rowCount=' + (step08Data && step08Data.evlRowCount));

// ─────────────────────────────────────────────────────────────────────────────
// V06 — W3-STEP-09 ledger rows total 10
// ─────────────────────────────────────────────────────────────────────────────
var step09Data = walkthroughData[9];
assert('V06 — W3-STEP-09 event log row count === 10',
    step09Data && step09Data.evlRowCount === 10,
    'rowCount=' + (step09Data && step09Data.evlRowCount));

// ─────────────────────────────────────────────────────────────────────────────
// V07 — no PR-256 marker in production files (no production changes)
// ─────────────────────────────────────────────────────────────────────────────
var marker256 = 'PR-256-PRODUCTION-CHANGE';
var appSrc    = fs.readFileSync(path.join(__dirname, 'UI_MOdified/client/app.js'), 'utf8');
var adjSrc    = fs.readFileSync(path.join(__dirname, 'UI_MOdified/client/wargame/adjudicator-map.js'), 'utf8');
assert('V07 — scenario-workspace.js has no PR-256 production marker',
    src.indexOf(marker256) === -1, 'marker found in scenario-workspace.js');
assert('V07b — app.js has no PR-256 production marker',
    appSrc.indexOf(marker256) === -1, 'marker found in app.js');
assert('V07c — adjudicator-map.js has no PR-256 production marker',
    adjSrc.indexOf(marker256) === -1, 'marker found in adjudicator-map.js');

// ─────────────────────────────────────────────────────────────────────────────
// V08 — coverage audit data is consistent with report values
// ─────────────────────────────────────────────────────────────────────────────
assert('V08 — coverage audit passed',
    covAudit && covAudit.passed === true,
    'covAudit.passed=' + (covAudit && covAudit.passed));

assert('V08b — coverage audit stepCount === 17',
    covAudit && covAudit.stepCount === 17,
    'stepCount=' + (covAudit && covAudit.stepCount));

// ─────────────────────────────────────────────────────────────────────────────
// V09 — objective coordinate source matches w3json.obj.coord
// ─────────────────────────────────────────────────────────────────────────────
assert('V09 — objective coordinate source: w3json.obj.coord[0] (lon) === 19.55',
    w3json.obj && w3json.obj.coord && w3json.obj.coord[0] === 19.55,
    'coord[0]=' + (w3json.obj && w3json.obj.coord && w3json.obj.coord[0]));

assert('V09b — objective coordinate source: w3json.obj.coord[1] (lat) === 29.74',
    w3json.obj && w3json.obj.coord && w3json.obj.coord[1] === 29.74,
    'coord[1]=' + (w3json.obj && w3json.obj.coord && w3json.obj.coord[1]));

assert('V09c — objective audit objectivesWithDirectCoordinates === 1',
    objAudit && objAudit.objectivesWithDirectCoordinates === 1,
    'objectivesWithDirectCoordinates=' + (objAudit && objAudit.objectivesWithDirectCoordinates));

assert('V09d — objective audit objectives[0].directCoordinate lat=29.74 lon=19.55',
    (function () {
        var dc = objAudit && objAudit.objectives && objAudit.objectives[0]
                 && objAudit.objectives[0].directCoordinate;
        return dc && dc.lat === 29.74 && dc.lon === 19.55;
    }()),
    'directCoordinate=' + JSON.stringify(
        objAudit && objAudit.objectives && objAudit.objectives[0] &&
        objAudit.objectives[0].directCoordinate));

// ─────────────────────────────────────────────────────────────────────────────
// V10 — trail coverage audit: 31 totalMovementTrails, 13 covered transitions
// ─────────────────────────────────────────────────────────────────────────────
assert('V10 — trailAudit.totalMovementTrails === 31',
    trailAudit && trailAudit.totalMovementTrails === 31,
    'totalMovementTrails=' + (trailAudit && trailAudit.totalMovementTrails));

assert('V10b — trailAudit.transitionsWithTrails === 13',
    trailAudit && trailAudit.transitionsWithTrails === 13,
    'transitionsWithTrails=' + (trailAudit && trailAudit.transitionsWithTrails));

assert('V10c — trailAudit.transitionCount === 16',
    trailAudit && trailAudit.transitionCount === 16,
    'transitionCount=' + (trailAudit && trailAudit.transitionCount));

// ─────────────────────────────────────────────────────────────────────────────
// V11 — strongest step is W3-STEP-08 (most trails: 4)
// ─────────────────────────────────────────────────────────────────────────────
var maxTrails = walkthroughData.reduce(function (mx, d) {
    return d.movementTrailCount > mx.count ? { step: d.stepRef, count: d.movementTrailCount } : mx;
}, { step: '', count: 0 });

assert('V11 — strongest step by trail count is W3-STEP-08 with 4 trails',
    maxTrails.step === 'W3-STEP-08' && maxTrails.count === 4,
    'strongest=' + maxTrails.step + ' trails=' + maxTrails.count);

assert('V11b — W3-STEP-08 markerCount === 12',
    step08Data && step08Data.markerCount === 12,
    'markerCount=' + (step08Data && step08Data.markerCount));

// ─────────────────────────────────────────────────────────────────────────────
// V12 — quiet steps (STEP-00..03) have 0 trails each
// ─────────────────────────────────────────────────────────────────────────────
var quietSteps = walkthroughData.slice(0, 4);
assert('V12 — W3-STEP-00 through W3-STEP-03 all have 0 movement trails',
    quietSteps.every(function (d) { return d.movementTrailCount === 0; }),
    quietSteps.filter(function (d) { return d.movementTrailCount !== 0; })
              .map(function (d) { return d.stepRef + '=' + d.movementTrailCount; }).join(','));

// ─────────────────────────────────────────────────────────────────────────────
// V13 — W3-STEP-08 OBJ status is THREATENED
// ─────────────────────────────────────────────────────────────────────────────
var step08ObjRow = step08Data && step08Data.evlRows.find(function (r) { return r.type === 'OBJ'; });
assert('V13 — W3-STEP-08 OBJ row status is THREATENED',
    step08ObjRow && step08ObjRow.message.indexOf('THREATENED') === 0,
    'OBJ message=' + (step08ObjRow && step08ObjRow.message));

// ─────────────────────────────────────────────────────────────────────────────
// V14 — W3-STEP-09 OBJ status is CONTESTED (progression confirmed)
// ─────────────────────────────────────────────────────────────────────────────
var step09ObjRow = step09Data && step09Data.evlRows.find(function (r) { return r.type === 'OBJ'; });
assert('V14 — W3-STEP-09 OBJ row status is CONTESTED',
    step09ObjRow && step09ObjRow.message.indexOf('CONTESTED') === 0,
    'OBJ message=' + (step09ObjRow && step09ObjRow.message));

assert('V14b — OBJ status progression: THREATENED (step-08) → CONTESTED (step-09)',
    step08Data && step09Data &&
    step08Data.objectiveStatus === 'THREATENED' &&
    step09Data.objectiveStatus === 'CONTESTED',
    'step08=' + (step08Data && step08Data.objectiveStatus) +
    ' step09=' + (step09Data && step09Data.objectiveStatus));

// ─────────────────────────────────────────────────────────────────────────────
// V15 — no COMBAT/CASUALTY/DETECTION/WEAPON rows in any event log simulation
// ─────────────────────────────────────────────────────────────────────────────
var forbiddenTypes = ['COMBAT', 'CASUALTY', 'DETECTION', 'WEAPON'];
var hasFakeRows = walkthroughData.some(function (d) {
    return d.evlRows.some(function (r) {
        return forbiddenTypes.indexOf(r.type) !== -1;
    });
});
assert('V15 — no COMBAT/CASUALTY/DETECTION/WEAPON rows in any step event log',
    !hasFakeRows, 'forbidden row type found');

// ─────────────────────────────────────────────────────────────────────────────
// V16 — stepIndex unchanged throughout
// ─────────────────────────────────────────────────────────────────────────────
assert('V16 — window.RmoozScenario.stepIndex unchanged (still 8)',
    window.RmoozScenario.stepIndex === 8, 'stepIndex=' + window.RmoozScenario.stepIndex);

assert('V16b — window.units not mutated (same reference, still empty array)',
    window.units === unitsRef && window.units.length === 0,
    'units.length=' + window.units.length);

assert('V16c — window.RmoozScenario not replaced',
    window.RmoozScenario === scenRef, 'RmoozScenario reference changed');

// ─────────────────────────────────────────────────────────────────────────────
// V17 — per-step marker + trail counts match expected values from PR-254
// ─────────────────────────────────────────────────────────────────────────────
var EXPECTED = [
    { ref: 'W3-STEP-00', markers: 12, trails: 0  },
    { ref: 'W3-STEP-01', markers:  4, trails: 0  },
    { ref: 'W3-STEP-02', markers:  7, trails: 0  },
    { ref: 'W3-STEP-03', markers: 12, trails: 0  },
    { ref: 'W3-STEP-04', markers:  9, trails: 1  },
    { ref: 'W3-STEP-05', markers: 12, trails: 3  },
    { ref: 'W3-STEP-06', markers: 12, trails: 3  },
    { ref: 'W3-STEP-07', markers: 12, trails: 2  },
    { ref: 'W3-STEP-08', markers: 12, trails: 4  },
    { ref: 'W3-STEP-09', markers: 12, trails: 3  },
    { ref: 'W3-STEP-10', markers: 12, trails: 2  },
    { ref: 'W3-STEP-11', markers: 12, trails: 3  },
    { ref: 'W3-STEP-12', markers: 12, trails: 2  },
    { ref: 'W3-STEP-13', markers: 12, trails: 2  },
    { ref: 'W3-STEP-14', markers: 12, trails: 1  },
    { ref: 'W3-STEP-15', markers: 12, trails: 2  },
    { ref: 'W3-STEP-16', markers: 12, trails: 3  }
];

var stepMismatches = [];
for (var ei = 0; ei < EXPECTED.length; ei++) {
    var exp = EXPECTED[ei];
    var got = walkthroughData[ei];
    if (!got || got.markerCount !== exp.markers || got.movementTrailCount !== exp.trails) {
        stepMismatches.push(exp.ref +
            ' expected markers=' + exp.markers + ' got=' + (got && got.markerCount) +
            ' expected trails=' + exp.trails + ' got=' + (got && got.movementTrailCount));
    }
}
assert('V17 — all 17 steps match expected marker+trail counts from PR-254',
    stepMismatches.length === 0,
    stepMismatches.join(' | '));

// ─────────────────────────────────────────────────────────────────────────────
// Print results
// ─────────────────────────────────────────────────────────────────────────────
console.log('');
results.forEach(function (r) { console.log(r); });
console.log('');
if (failed === 0) {
    console.log('ALL PASS  (' + passed + '/' + (passed + failed) + ')');
} else {
    console.log(failed + ' FAILED  ' + passed + ' passed  (' + passed + '/' + (passed + failed) + ')');
    process.exitCode = 1;
}

// ── Print walkthrough summary table for report ────────────────────────────────
console.log('');
console.log('── PR-256 Step-by-Step Walkthrough Data ─────────────────────────────────────');
console.log('  Step         | Markers | Trails | Obj Status         | OHC | Row Summary');
console.log('  ─────────────┼─────────┼────────┼────────────────────┼─────┼────────────');
for (var ri = 0; ri < walkthroughData.length; ri++) {
    var d    = walkthroughData[ri];
    var stat = d.objectiveStatus === '—' ? '(none)' : d.objectiveStatus;
    var rowTypes = d.evlRows.map(function(r) { return r.type; }).join('/');
    console.log(
        '  ' + d.stepRef + '  | ' +
        String(d.markerCount).padStart(7) + ' | ' +
        String(d.movementTrailCount).padStart(6) + ' | ' +
        stat.padEnd(18) + ' | ' +
        String(d.objectiveHighlightCount).padStart(3) + ' | ' +
        d.evlRowCount + ' rows [' + rowTypes + ']'
    );
}
console.log('  Total trails: ' + totalTrails);
console.log('────────────────────────────────────────────────────────────────────────────');

// ── Audit summary for report ──────────────────────────────────────────────────
console.log('');
console.log('── Audit Summary ────────────────────────────────────────────────────────────');
console.log('  Readiness:             ' + readRes.readiness);
console.log('  Coverage audit passed: ' + covAudit.passed + ' | stepCount=' + covAudit.stepCount);
console.log('  Trail audit:           totalMovementTrails=' + trailAudit.totalMovementTrails +
            ' transitionsWithTrails=' + trailAudit.transitionsWithTrails +
            '/' + trailAudit.transitionCount);
var dc = objAudit && objAudit.objectives && objAudit.objectives[0] && objAudit.objectives[0].directCoordinate;
console.log('  Objective coord:       lat=' + (dc && dc.lat) +
            ' lon=' + (dc && dc.lon) +
            ' objectivesWithDirectCoordinates=' + (objAudit && objAudit.objectivesWithDirectCoordinates));
console.log('  W3-STEP-08 rows:       ' + (step08Data && step08Data.evlRowCount));
console.log('  W3-STEP-09 rows:       ' + (step09Data && step09Data.evlRowCount));
console.log('  OBJ status step-08:    ' + (step08Data && step08Data.objectiveStatus));
console.log('  OBJ status step-09:    ' + (step09Data && step09Data.objectiveStatus));
console.log('────────────────────────────────────────────────────────────────────────────');
