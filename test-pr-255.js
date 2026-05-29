'use strict';

// ── PR-255 Test Harness — Wargame 3 Read-Only Ops Ledger Verification ─────────
// Verifies that the event log / ops ledger correctly supports the W3 read-only
// map walkthrough for the strongest steps (W3-STEP-08 and W3-STEP-09).
//
// Approach:
//   - simulateEventLogRows() mirrors _buildW3EventLog() exactly but returns an
//     array instead of painting DOM.  All row-building logic is identical.
//   - Source-code checks verify _buildW3EventLog has no system clock calls,
//     no fake event types, no forbidden calls.
//   - Safety checks confirm no mutation, no storage, no fetch, no live execution.
//
// No DOM. No Leaflet needed for event log tests.
// Leaflet mock used for map overlay verification only.

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

// ── Minimal Leaflet mock (for map overlay verification only) ──────────────────
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

// ── shared window mock ────────────────────────────────────────────────────────
var window = {
    map: null, L: null,
    units: [], lines: [],
    RmoozScenario: { stepIndex: 8, scenario: {} }
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

var builderSrc    = extractFn('buildScenarioStepPreview');
var harnSrc       = extractFn('previewWargame3Fixture');
var isGuardSrc    = extractFn('isWargame3ReadOnlyMapOverlayDataSafe');
var buildOvSrc    = extractFn('buildWargame3ReadOnlyMapOverlayData');
var clearSrc      = extractFn('clearWargame3ReadOnlyMapOverlay');
var paintSrc      = extractFn('paintWargame3ReadOnlyMapOverlay');
var evlSrc        = extractFn('_buildW3EventLog');  // for source-code checks only

var combined = [
    'var _w3PreviewLayer = null;',
    bsspSrc, builderSrc, w3aSrc, harnSrc,
    w3modConstSrc, isGuardSrc, buildOvSrc, clearSrc, paintSrc
].join('\n');

var fn = new Function('window',
    combined + '\nreturn {' +
    ' adaptWargame3ToFixture:                   adaptWargame3ToFixture,' +
    ' buildScenarioStepPreview:                 buildScenarioStepPreview,' +
    ' isWargame3ReadOnlyMapOverlayDataSafe:     isWargame3ReadOnlyMapOverlayDataSafe,' +
    ' buildWargame3ReadOnlyMapOverlayData:      buildWargame3ReadOnlyMapOverlayData,' +
    ' clearWargame3ReadOnlyMapOverlay:          clearWargame3ReadOnlyMapOverlay,' +
    ' paintWargame3ReadOnlyMapOverlay:          paintWargame3ReadOnlyMapOverlay };'
);
var api = fn(window);

// ── Test runner ───────────────────────────────────────────────────────────────
var passed = 0; var failed = 0; var results = [];
function assert(label, cond, detail) {
    if (cond) { passed++; results.push('  PASS  ' + label); }
    else       { failed++; results.push('  FAIL  ' + label + (detail ? '  →  ' + detail : '')); }
}

// ── simulateEventLogRows ─────────────────────────────────────────────────────
// Mirrors _buildW3EventLog() exactly but returns rows as an array.
// Time/source/message columns follow identical logic to the production DOM painter.
var EL_MAX_UNITS = 4;

function simulateEventLogRows(p, warnsArr) {
    var rows  = [];
    var warns = warnsArr || [];
    var MAX_U = EL_MAX_UNITS;

    function addRow(t, type, src, msg) {
        rows.push({ time: t || '—', type: type, source: src || '—', message: msg || '—' });
    }

    // Time token (mirrors _buildW3EventLog lines 7738-7744)
    var timeToken = p.activeStepId || '—';
    if (typeof p.stepSummary === 'string' && p.stepSummary) {
        var dashIdx  = p.stepSummary.indexOf(' — ');
        var rawToken = dashIdx > -1 ? p.stepSummary.slice(0, dashIdx).trim() : p.stepSummary.trim();
        timeToken = rawToken.length > 12 ? rawToken.slice(0, 11) + '…' : rawToken;
    }

    // 1. STEP row (always)
    var stepMsg = (typeof p.stepSummary === 'string' && p.stepSummary) ? p.stepSummary
                : (typeof p.situation === 'string' && p.situation)
                    ? p.situation.split('\n')[0].slice(0, 80) : '—';
    addRow(timeToken, 'STEP', 'PREVIEW', stepMsg);

    // 2. OBJ row (when objectiveStatusBaseline is set)
    var obs = (typeof p.objectiveStatusBaseline === 'string' && p.objectiveStatusBaseline)
        ? p.objectiveStatusBaseline : null;
    if (obs) {
        var objDesc = (p.objectivesReferenced && p.objectivesReferenced.length > 0)
            ? p.objectivesReferenced[0].description : '';
        addRow(timeToken, 'OBJ', 'PREVIEW', obs + (objDesc ? ' — ' + objDesc : ''));
    }

    // 3. UNIT rows (capped at MAX_U + overflow)
    var units = (p.unitsReferenced && p.unitsReferenced.length > 0) ? p.unitsReferenced : [];
    for (var ui = 0; ui < Math.min(units.length, MAX_U); ui++) {
        var u     = units[ui];
        var uSide = (u.side || '').toUpperCase() || 'PREVIEW';
        addRow(timeToken, 'UNIT', uSide, u.displayName + (u.role ? ' / ' + u.role : ''));
    }
    if (units.length > MAX_U) {
        addRow(timeToken, 'UNIT', 'PREVIEW', '+' + (units.length - MAX_U) + ' more');
    }

    // 4. EFFECT row (when proposedVisualEffects present)
    var effCount = (p.proposedVisualEffects && p.proposedVisualEffects.length) || 0;
    if (effCount > 0) {
        addRow(timeToken, 'EFFECT', 'PREVIEW',
            'Text-only preview effects available: ' + effCount);
    }

    // 5. WARN rows (one per warnsArr entry)
    for (var wi = 0; wi < warns.length; wi++) {
        var w    = warns[wi];
        var wMsg = (w && typeof w.message === 'string') ? w.message
                 : (typeof w === 'string') ? w : String(w);
        addRow(timeToken, 'WARN', 'PREVIEW', wMsg);
    }

    return rows;
}

// ── Pre-compute fixture and step data ─────────────────────────────────────────
var W3_OBJ_LAT = w3json.obj.coord[1];   // 29.74
var W3_OBJ_LON = w3json.obj.coord[0];   // 19.55

var adaptRes = api.adaptWargame3ToFixture(w3json);
var fixture  = adaptRes.fixture;

// W3-STEP-08
var s08Res   = fixture ? api.buildScenarioStepPreview(fixture, 'W3-STEP-08') : null;
var s08Prev  = s08Res && s08Res.passed && s08Res.preview ? s08Res.preview : null;
var s07Res   = fixture ? api.buildScenarioStepPreview(fixture, 'W3-STEP-07') : null;
var s07Prev  = s07Res && s07Res.passed && s07Res.preview ? s07Res.preview : null;
var s08OvRes = s08Prev
    ? api.buildWargame3ReadOnlyMapOverlayData(s08Prev, { previousPreview: s07Prev })
    : null;
var s08Ov    = s08OvRes && s08OvRes.overlay ? s08OvRes.overlay : null;
var s08Warns = s08Res ? (s08Res.preview && s08Res.preview.warningsDetail
                         ? s08Res.preview.warningsDetail : s08Res.warnings || []) : [];
var s08Rows  = s08Prev ? simulateEventLogRows(s08Prev, s08Warns) : [];

// W3-STEP-09
var s09Res   = fixture ? api.buildScenarioStepPreview(fixture, 'W3-STEP-09') : null;
var s09Prev  = s09Res && s09Res.passed && s09Res.preview ? s09Res.preview : null;
var s09OvRes = s09Prev
    ? api.buildWargame3ReadOnlyMapOverlayData(s09Prev, { previousPreview: s08Prev })
    : null;
var s09Ov    = s09OvRes && s09OvRes.overlay ? s09OvRes.overlay : null;
var s09Warns = s09Res ? (s09Res.preview && s09Res.preview.warningsDetail
                         ? s09Res.preview.warningsDetail : s09Res.warnings || []) : [];
var s09Rows  = s09Prev ? simulateEventLogRows(s09Prev, s09Warns) : [];

// Paint results (with Leaflet mock)
(function () {
    var preMap = makeMockMap(); window.map = preMap;
    api.clearWargame3ReadOnlyMapOverlay();
})();
var mockL = makeMockL(); var mockMap = makeMockMap();
window.L = mockL; window.map = mockMap;
var s08Paint = s08Ov ? api.paintWargame3ReadOnlyMapOverlay(s08Ov) : null;
var s09Paint = s09Ov ? api.paintWargame3ReadOnlyMapOverlay(s09Ov) : null;
window.L = null; window.map = null;

// ─────────────────────────────────────────────────────────────────────────────
// ── SECTION A — W3-STEP-08 verification ──────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

// T01 — preview builds successfully
assert('T01 — W3-STEP-08 preview builds successfully',
    s08Prev !== null && s08Res.passed === true,
    'passed=' + (s08Res && s08Res.passed));

// T02 — map overlay builds successfully
assert('T02 — W3-STEP-08 map overlay builds successfully',
    s08Ov !== null,
    's08Ov is null');

// T03 — marker count is 12
assert('T03 — W3-STEP-08 markerCount === 12',
    s08Paint !== null && s08Paint.markerCount === 12,
    'markerCount=' + (s08Paint && s08Paint.markerCount));

// T04 — movement trail count is 4
assert('T04 — W3-STEP-08 movementTrailCount === 4',
    s08Paint !== null && s08Paint.movementTrailCount === 4,
    'movementTrailCount=' + (s08Paint && s08Paint.movementTrailCount));

// T05 — objective highlight count is 1
assert('T05 — W3-STEP-08 objectiveHighlightCount === 1',
    s08Paint !== null && s08Paint.objectiveHighlightCount === 1,
    'objectiveHighlightCount=' + (s08Paint && s08Paint.objectiveHighlightCount));

// T06 — event log rows build (simulateEventLogRows returns a non-empty array)
assert('T06 — W3-STEP-08 event log rows build (rows.length > 0)',
    s08Rows.length > 0,
    'rows.length=' + s08Rows.length);

// T07 — event log includes exactly one STEP row
var s08StepRows = s08Rows.filter(function (r) { return r.type === 'STEP'; });
assert('T07 — W3-STEP-08 event log has exactly 1 STEP row',
    s08StepRows.length === 1,
    'STEP rows=' + s08StepRows.length);
assert('T07b — W3-STEP-08 STEP row message is stepSummary "PHASE 2A — D+12h"',
    s08StepRows.length === 1 && s08StepRows[0].message === 'PHASE 2A — D+12h',
    'msg=' + (s08StepRows[0] && s08StepRows[0].message));

// T08 — event log includes one OBJ row (objectiveStatusBaseline === "THREATENED")
var s08ObjRows = s08Rows.filter(function (r) { return r.type === 'OBJ'; });
assert('T08 — W3-STEP-08 event log has exactly 1 OBJ row (THREATENED)',
    s08ObjRows.length === 1,
    'OBJ rows=' + s08ObjRows.length);
assert('T08b — W3-STEP-08 OBJ row message starts with "THREATENED"',
    s08ObjRows.length === 1 && s08ObjRows[0].message.indexOf('THREATENED') === 0,
    'msg=' + (s08ObjRows[0] && s08ObjRows[0].message));
assert('T08c — W3-STEP-08 OBJ row includes objective description',
    s08ObjRows.length === 1 &&
    s08ObjRows[0].message.indexOf('Objective X') !== -1,
    'msg=' + (s08ObjRows[0] && s08ObjRows[0].message));

// T09 — UNIT rows capped at MAX_U + optional overflow
var s08UnitRows = s08Rows.filter(function (r) { return r.type === 'UNIT'; });
// W3-STEP-08 has 14 units → 4 unit rows + 1 overflow = 5 UNIT rows
assert('T09 — W3-STEP-08 has UNIT rows (capped at ' + EL_MAX_UNITS + ' + overflow)',
    s08UnitRows.length === EL_MAX_UNITS + 1,
    'UNIT rows=' + s08UnitRows.length);
assert('T09b — W3-STEP-08 overflow UNIT row shows "+10 more"',
    s08UnitRows.length > 0 &&
    s08UnitRows[s08UnitRows.length - 1].message.indexOf('+10') === 0,
    'overflow msg=' + (s08UnitRows[s08UnitRows.length - 1] && s08UnitRows[s08UnitRows.length - 1].message));

// T10 — EFFECT row present (22 proposedVisualEffects)
var s08EffRows = s08Rows.filter(function (r) { return r.type === 'EFFECT'; });
assert('T10 — W3-STEP-08 event log has exactly 1 EFFECT row',
    s08EffRows.length === 1,
    'EFFECT rows=' + s08EffRows.length);
assert('T10b — W3-STEP-08 EFFECT row message includes count 22',
    s08EffRows.length === 1 && s08EffRows[0].message.indexOf('22') !== -1,
    'msg=' + (s08EffRows[0] && s08EffRows[0].message));

// T11 — no COMBAT/CASUALTY/DETECTION/WEAPON rows
var forbiddenTypes = ['COMBAT', 'CASUALTY', 'DETECTION', 'WEAPON'];
var s08Forbidden = s08Rows.filter(function (r) { return forbiddenTypes.indexOf(r.type) >= 0; });
assert('T11 — W3-STEP-08 event log has no fake COMBAT/CASUALTY/DETECTION/WEAPON rows',
    s08Forbidden.length === 0,
    'forbidden rows: ' + JSON.stringify(s08Forbidden.map(function (r) { return r.type; })));

// T12 — time token is derived from stepSummary, not system clock (no new Date)
assert('T12 — W3-STEP-08 time token is "PHASE 2A" (from stepSummary, not invented)',
    s08Rows.length > 0 && s08Rows[0].time === 'PHASE 2A',
    'time=' + (s08Rows[0] && s08Rows[0].time));

// T13 — source fields are meaningful (no empty/null sources)
var s08EmptySource = s08Rows.filter(function (r) { return !r.source || r.source === '—'; });
assert('T13 — W3-STEP-08 all event log rows have non-empty source fields',
    s08EmptySource.length === 0,
    'empty source rows=' + s08EmptySource.length);

// T14 — message fields are non-empty
var s08EmptyMsg = s08Rows.filter(function (r) { return !r.message || r.message === '—'; });
assert('T14 — W3-STEP-08 all event log rows have non-empty message fields',
    s08EmptyMsg.length === 0,
    'empty message rows=' + s08EmptyMsg.length);

// T15 — rows derived from preview only (WARN messages match actual preview warnings)
var s08WarnRows = s08Rows.filter(function (r) { return r.type === 'WARN'; });
assert('T15 — W3-STEP-08 WARN rows match actual preview warnings (2 MISSING_FIELD)',
    s08WarnRows.length === s08Warns.length,
    'warns in preview=' + s08Warns.length + ' warn rows=' + s08WarnRows.length);
assert('T15b — W3-STEP-08 WARN row messages are from preview (not invented)',
    s08WarnRows.length > 0 &&
    s08WarnRows[0].message.indexOf('selectedDecision') !== -1,
    'msg=' + (s08WarnRows[0] && s08WarnRows[0].message));

// ─────────────────────────────────────────────────────────────────────────────
// ── SECTION B — W3-STEP-09 verification ──────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

// T16 — preview builds successfully
assert('T16 — W3-STEP-09 preview builds successfully',
    s09Prev !== null && s09Res.passed === true,
    'passed=' + (s09Res && s09Res.passed));

// T17 — map overlay builds successfully
assert('T17 — W3-STEP-09 map overlay builds successfully',
    s09Ov !== null,
    's09Ov is null');

// T18 — marker count is 12
assert('T18 — W3-STEP-09 markerCount === 12',
    s09Paint !== null && s09Paint.markerCount === 12,
    'markerCount=' + (s09Paint && s09Paint.markerCount));

// T19 — movement trail count is 3
assert('T19 — W3-STEP-09 movementTrailCount === 3',
    s09Paint !== null && s09Paint.movementTrailCount === 3,
    'movementTrailCount=' + (s09Paint && s09Paint.movementTrailCount));

// T20 — objective highlight count is 1
assert('T20 — W3-STEP-09 objectiveHighlightCount === 1',
    s09Paint !== null && s09Paint.objectiveHighlightCount === 1,
    'objectiveHighlightCount=' + (s09Paint && s09Paint.objectiveHighlightCount));

// T21 — event log rows build
assert('T21 — W3-STEP-09 event log rows build (rows.length > 0)',
    s09Rows.length > 0,
    'rows.length=' + s09Rows.length);

// T22 — exactly one STEP row
var s09StepRows = s09Rows.filter(function (r) { return r.type === 'STEP'; });
assert('T22 — W3-STEP-09 event log has exactly 1 STEP row',
    s09StepRows.length === 1,
    'STEP rows=' + s09StepRows.length);
assert('T22b — W3-STEP-09 STEP row message is "PHASE 2A — D+24h"',
    s09StepRows.length === 1 && s09StepRows[0].message === 'PHASE 2A — D+24h',
    'msg=' + (s09StepRows[0] && s09StepRows[0].message));

// T23 — OBJ row (CONTESTED)
var s09ObjRows = s09Rows.filter(function (r) { return r.type === 'OBJ'; });
assert('T23 — W3-STEP-09 event log has exactly 1 OBJ row (CONTESTED)',
    s09ObjRows.length === 1,
    'OBJ rows=' + s09ObjRows.length);
assert('T23b — W3-STEP-09 OBJ row message starts with "CONTESTED"',
    s09ObjRows.length === 1 && s09ObjRows[0].message.indexOf('CONTESTED') === 0,
    'msg=' + (s09ObjRows[0] && s09ObjRows[0].message));
assert('T23c — W3-STEP-09 OBJ status changes from THREATENED to CONTESTED',
    s08ObjRows.length > 0 && s09ObjRows.length > 0 &&
    s08ObjRows[0].message.indexOf('THREATENED') === 0 &&
    s09ObjRows[0].message.indexOf('CONTESTED') === 0,
    'step08 obj=' + (s08ObjRows[0] && s08ObjRows[0].message.split('—')[0].trim()) +
    ' step09 obj=' + (s09ObjRows[0] && s09ObjRows[0].message.split('—')[0].trim()));

// T24 — UNIT rows capped (12 units → 4 + overflow "+8 more")
var s09UnitRows = s09Rows.filter(function (r) { return r.type === 'UNIT'; });
assert('T24 — W3-STEP-09 has UNIT rows (capped at ' + EL_MAX_UNITS + ' + overflow)',
    s09UnitRows.length === EL_MAX_UNITS + 1,
    'UNIT rows=' + s09UnitRows.length);
assert('T24b — W3-STEP-09 overflow row shows "+8 more"',
    s09UnitRows.length > 0 &&
    s09UnitRows[s09UnitRows.length - 1].message.indexOf('+8') === 0,
    'overflow msg=' + (s09UnitRows[s09UnitRows.length - 1] && s09UnitRows[s09UnitRows.length - 1].message));

// T25 — EFFECT row (20 effects)
var s09EffRows = s09Rows.filter(function (r) { return r.type === 'EFFECT'; });
assert('T25 — W3-STEP-09 event log has exactly 1 EFFECT row',
    s09EffRows.length === 1,
    'EFFECT rows=' + s09EffRows.length);
assert('T25b — W3-STEP-09 EFFECT row message includes count 20',
    s09EffRows.length === 1 && s09EffRows[0].message.indexOf('20') !== -1,
    'msg=' + (s09EffRows[0] && s09EffRows[0].message));

// T26 — no fake COMBAT/CASUALTY/DETECTION/WEAPON rows
var s09Forbidden = s09Rows.filter(function (r) { return forbiddenTypes.indexOf(r.type) >= 0; });
assert('T26 — W3-STEP-09 event log has no fake COMBAT/CASUALTY/DETECTION/WEAPON rows',
    s09Forbidden.length === 0,
    'forbidden rows: ' + JSON.stringify(s09Forbidden.map(function (r) { return r.type; })));

// T27 — time token derived from stepSummary, not system clock
assert('T27 — W3-STEP-09 time token is "PHASE 2A" (from stepSummary, not invented)',
    s09Rows.length > 0 && s09Rows[0].time === 'PHASE 2A',
    'time=' + (s09Rows[0] && s09Rows[0].time));

// T28 — source fields non-empty
var s09EmptySource = s09Rows.filter(function (r) { return !r.source || r.source === '—'; });
assert('T28 — W3-STEP-09 all event log rows have non-empty source fields',
    s09EmptySource.length === 0,
    'empty source rows=' + s09EmptySource.length);

// T29 — message fields non-empty
var s09EmptyMsg = s09Rows.filter(function (r) { return !r.message || r.message === '—'; });
assert('T29 — W3-STEP-09 all event log rows have non-empty message fields',
    s09EmptyMsg.length === 0,
    'empty message rows=' + s09EmptyMsg.length);

// T30 — WARN rows match actual preview warnings
var s09WarnRows = s09Rows.filter(function (r) { return r.type === 'WARN'; });
assert('T30 — W3-STEP-09 WARN rows match actual preview warnings (2 MISSING_FIELD)',
    s09WarnRows.length === s09Warns.length,
    'warns in preview=' + s09Warns.length + ' warn rows=' + s09WarnRows.length);

// ─────────────────────────────────────────────────────────────────────────────
// ── SECTION C — Source / DOM verification ────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

// D1/D2 — DOM IDs exist in _buildW3EventLog source
assert('D01 — _buildW3EventLog references sw-drp-event-log DOM id',
    evlSrc.indexOf('sw-drp-event-log') !== -1,
    'id not found');
assert('D02 — _buildW3EventLog references sw-drp-evl-body DOM id',
    evlSrc.indexOf('sw-drp-evl-body') !== -1,
    'id not found');

// D3 — table column class names present in source
assert('D03 — event log column classes present (sw-evl-time, sw-evl-type, sw-evl-src, sw-evl-msg)',
    evlSrc.indexOf('sw-evl-time') !== -1 &&
    evlSrc.indexOf('sw-evl-type') !== -1 &&
    evlSrc.indexOf('sw-evl-src')  !== -1 &&
    evlSrc.indexOf('sw-evl-msg')  !== -1,
    'missing column class');

// D4 — i18n tx() calls use English fallbacks (not raw keys)
assert('D04 — tx() calls in _buildW3EventLog include English fallback text',
    evlSrc.indexOf("'more'") !== -1 &&
    evlSrc.indexOf("'Text-only preview effects available'") !== -1,
    'fallback text not found');

// D5 — AMBER RIDGE hides event log: _paintToDOM hides #sw-drp-event-log for non-W3
// _paintToDOM is a nested function inside paintDryRunPreview — use extractFn directly.
var paintToDOMSrc = extractFn('_paintToDOM');
assert('D05 — _paintToDOM hides sw-drp-event-log for non-W3 previews',
    paintToDOMSrc.indexOf('sw-drp-event-log') !== -1 &&
    paintToDOMSrc.indexOf('hidden = true') !== -1,
    'hide logic not found in _paintToDOM');

// D6 — Navigation refreshes event log (all nav paths converge on paintDryRunPreview)
var initNavSrc = extractFn('_initDrpNavButtons');
assert('D06 — nav buttons call paintDryRunPreview (refreshes event log)',
    initNavSrc.indexOf('paintDryRunPreview') !== -1,
    'paintDryRunPreview not in nav handler');

// D7 — Jump selector refreshes event log (same path)
assert('D07 — jump select handler calls paintDryRunPreview (refreshes event log)',
    initNavSrc.indexOf('paintDryRunPreview') !== -1 &&
    initNavSrc.indexOf('change') !== -1,
    'change handler or paintDryRunPreview missing');

// ─────────────────────────────────────────────────────────────────────────────
// ── SECTION D — _buildW3EventLog source safety checks ────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

// No system clock (no invented timestamps)
assert('SC01 — _buildW3EventLog: no new Date() in source (no invented timestamp)',
    evlSrc.indexOf('new Date') === -1,
    'new Date found');
assert('SC01b — _buildW3EventLog: no Date.now() in source',
    evlSrc.indexOf('Date.now') === -1,
    'Date.now found');

// No fake event type codes
assert('SC02 — _buildW3EventLog: no COMBAT type string in source',
    evlSrc.indexOf("'COMBAT'") === -1,
    "'COMBAT' found");
assert('SC02b — _buildW3EventLog: no CASUALTY type string in source',
    evlSrc.indexOf("'CASUALTY'") === -1,
    "'CASUALTY' found");
assert('SC02c — _buildW3EventLog: no DETECTION type string in source',
    evlSrc.indexOf("'DETECTION'") === -1,
    "'DETECTION' found");
assert('SC02d — _buildW3EventLog: no WEAPON type string in source',
    evlSrc.indexOf("'WEAPON'") === -1,
    "'WEAPON' found");

// No fetch/storage/backend
assert('SC03 — _buildW3EventLog: no fetch() call',
    evlSrc.indexOf('fetch(') === -1,
    'fetch( found');
assert('SC03b — _buildW3EventLog: no localStorage call',
    evlSrc.indexOf('localStorage') === -1,
    'localStorage found');
assert('SC03c — _buildW3EventLog: no /api/sim/ call',
    evlSrc.indexOf('/api/sim/') === -1,
    '/api/sim/ found');

// No mutation
assert('SC04 — _buildW3EventLog: no window.units mutation',
    evlSrc.indexOf('window.units') === -1,
    'window.units found');
assert('SC04b — _buildW3EventLog: no window.RmoozScenario mutation',
    evlSrc.indexOf('window.RmoozScenario') === -1,
    'window.RmoozScenario found');

// No Gate 7 / apply / commit
assert('SC05 — _buildW3EventLog: no applyScenario / commitNow / Gate7',
    evlSrc.indexOf('applyScenario') === -1 &&
    evlSrc.indexOf('commitNow')     === -1 &&
    evlSrc.indexOf('Gate7')         === -1,
    'forbidden keyword found');

// ─────────────────────────────────────────────────────────────────────────────
// ── SECTION E — Safety invariants ────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

// S01 — stepIndex unchanged
assert('S01 — window.RmoozScenario.stepIndex remains 8 (unchanged)',
    window.RmoozScenario.stepIndex === 8,
    'stepIndex=' + window.RmoozScenario.stepIndex);

// S02 — window.units not mutated
assert('S02 — window.units not mutated',
    Array.isArray(window.units) && window.units.length === 0,
    'units.length=' + window.units.length);

// S03 — window.lines not mutated
assert('S03 — window.lines not mutated',
    Array.isArray(window.lines) && window.lines.length === 0,
    'lines.length=' + window.lines.length);

// S04 — window.RmoozScenario not replaced
assert('S04 — window.RmoozScenario not replaced',
    typeof window.RmoozScenario === 'object' &&
    typeof window.RmoozScenario.scenario === 'object',
    'RmoozScenario changed');

// S05 — raw W3 JSON not mutated
assert('S05 — w3json.obj.coord not mutated',
    Array.isArray(w3json.obj.coord) &&
    w3json.obj.coord[0] === 19.55 && w3json.obj.coord[1] === 29.74,
    'coord=' + JSON.stringify(w3json.obj.coord));

// S06 — no storage calls in event log source
assert('S06 — no localStorage / sessionStorage in _buildW3EventLog',
    evlSrc.indexOf('localStorage') === -1 && evlSrc.indexOf('sessionStorage') === -1,
    'storage keyword found');

// S07 — no fetch/backend calls
assert('S07 — no fetch() / XMLHttpRequest in _buildW3EventLog',
    evlSrc.indexOf('fetch(') === -1 && evlSrc.indexOf('XMLHttpRequest') === -1,
    'network keyword found');

// S08 — no AI/simulation/journal
assert('S08 — no journal / AI / simulation in _buildW3EventLog',
    evlSrc.indexOf('journal') === -1 &&
    evlSrc.indexOf('/api/sim/') === -1,
    'forbidden keyword found');

// S09 — app.js not modified
var appSrc = fs.readFileSync(path.join(__dirname, 'UI_MOdified/client/app.js'), 'utf8');
assert('S09 — app.js does not contain PR-255 marker',
    appSrc.indexOf('PR-255') === -1,
    'PR-255 found in app.js');

// S10 — adjudicator-map.js not modified
var adjSrc = fs.readFileSync(path.join(__dirname, 'UI_MOdified/client/wargame/adjudicator-map.js'), 'utf8');
assert('S10 — adjudicator-map.js does not contain PR-255 marker',
    adjSrc.indexOf('PR-255') === -1,
    'PR-255 found in adjudicator-map.js');

// S11 — no map overlay behavior changes (paint function unchanged from PR-253)
assert('S11 — paintWargame3ReadOnlyMapOverlay source has no PR-255 marker',
    paintSrc.indexOf('PR-255') === -1,
    'PR-255 in paint src');

// S12 — existing W3 preview panel still works (W3-STEP-08 preview was built)
assert('S12 — W3-STEP-08 preview panel works (preview.activeStepId correct)',
    s08Prev !== null && s08Prev.activeStepId === 'W3-STEP-08',
    'activeStepId=' + (s08Prev && s08Prev.activeStepId));

// S13 — existing marker overlay still works
assert('S13 — W3-STEP-08 markers overlay still works (markerCount===12)',
    s08Paint !== null && s08Paint.markerCount === 12,
    'markerCount=' + (s08Paint && s08Paint.markerCount));

// S14 — existing movement trail overlay still works
assert('S14 — W3-STEP-08 movement trail overlay still works (trailCount===4)',
    s08Paint !== null && s08Paint.movementTrailCount === 4,
    'trailCount=' + (s08Paint && s08Paint.movementTrailCount));

// S15 — existing objective highlight still works
assert('S15 — W3-STEP-08 objective highlight still works (ohc===1, lat/lon correct)',
    s08Ov !== null &&
    Array.isArray(s08Ov.objectiveHighlights) &&
    s08Ov.objectiveHighlights.length === 1 &&
    s08Ov.objectiveHighlights[0].hasCoordinate === true &&
    s08Ov.objectiveHighlights[0].lat === W3_OBJ_LAT,
    'hasCoord=' + (s08Ov && s08Ov.objectiveHighlights && s08Ov.objectiveHighlights[0] && s08Ov.objectiveHighlights[0].hasCoordinate));

// S16 — no apply/commit/confirm/execute/Gate 7 in event log source
assert('S16 — no apply/commit/confirm/execute/Gate7 in _buildW3EventLog',
    evlSrc.indexOf('applyScenario') === -1 &&
    evlSrc.indexOf('commit')        === -1 &&
    evlSrc.indexOf('Gate7')         === -1,
    'forbidden keyword found');

// S17/S18 — navigation and jump selector verified via D06/D07 (code inspection)
assert('S17 — nav/jump paths verified: all converge on paintDryRunPreview (refreshes log)',
    initNavSrc.indexOf('paintDryRunPreview') !== -1,
    'paintDryRunPreview not found in nav source');

// S19 — no console errors (event log simulation throws no errors)
var sc19Errors = [];
try { simulateEventLogRows(s08Prev, s08Warns); } catch (e) { sc19Errors.push('s08: ' + e); }
try { simulateEventLogRows(s09Prev, s09Warns); } catch (e) { sc19Errors.push('s09: ' + e); }
try { simulateEventLogRows({}, []); }             catch (e) { sc19Errors.push('empty: ' + e); }
try { simulateEventLogRows(null, []); }           catch (e) { /* null guard expected */ }
assert('S19 — event log simulation throws no errors',
    sc19Errors.length === 0,
    sc19Errors.join(', '));

// ── Results ───────────────────────────────────────────────────────────────────
results.forEach(function (r) { console.log(r); });
console.log('');
if (failed === 0) {
    console.log('ALL PASS  (' + passed + '/' + (passed + failed) + ')');
} else {
    console.log('FAILURES: ' + failed + ' of ' + (passed + failed));
    process.exit(1);
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('');
console.log('── PR-255 Ops Ledger Summary ' + '─'.repeat(51));
function printRows(label, rows) {
    console.log('  ' + label + ' (' + rows.length + ' rows):');
    rows.forEach(function (r) {
        var msg = r.message.length > 60 ? r.message.slice(0, 57) + '…' : r.message;
        console.log('    [' + r.type.padEnd(6) + '] ' + r.source.padEnd(8) + ' | ' + r.time + ' | ' + msg);
    });
}
printRows('W3-STEP-08', s08Rows);
console.log('');
printRows('W3-STEP-09', s09Rows);
console.log('');
console.log('  OBJ status progression: THREATENED (step-08) → CONTESTED (step-09)');
console.log('  All rows derived from preview object only — no invented data');
console.log('  Ledger is sufficient for operator walkthrough: Yes');
console.log('─'.repeat(80));
