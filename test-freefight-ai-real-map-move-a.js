#!/usr/bin/env node
/*
 * FREEFIGHT-AI-REAL-MAP-MOVE-A
 *
 * Verifies that Apply Unit AI Action finds the real scenario unit,
 * mutates its coordinates, draws a trail, and that Reset restores them.
 * No server required.
 *
 * Tests:
 *   §1   _findRealUnit locates unit by uid in scenario.red_units
 *   §2   _findRealUnit locates unit by unit_uid in blue_units_initial
 *   §3   _applyMoveToScenario updates coord:[lon,lat]
 *   §4   _applyMoveToScenario updates lat/lon
 *   §5   _applyMoveToScenario preserves old coordinate
 *   §6   _applyMoveToScenario marks _ff_ai_moved_by_ai
 *   §7   Redraw bridge is called on apply (AppAdjudicatorMap.drawScenario)
 *   §8   Trail/line + pulse markers are added to layer
 *   §9   Objective X is unchanged after Apply
 *  §10   If unit not found, UI shows warning text
 *  §11   Reset restores old coordinate and clears AI trail state
 *  §12   Existing temp circle replaced by proper trail+pulse (no single bare circleMarker)
 */
'use strict';

var path = require('path');
var fs   = require('fs');

var PASS = 0, FAIL = 0;
function ok(label, cond, detail) {
    if (cond) { PASS++; console.log('  PASS  ' + label); }
    else       { FAIL++; console.log('  FAIL  ' + label + (detail ? '  (' + detail + ')' : '')); }
}

// ── DOM + map stub ─────────────────────────────────────────────────────────
var elById = {};
var _layerMarkers = [];
var _polylines    = [];

function deepQueryEl(el, sel) {
    if (!el) return null;
    var mff = sel.match(/^\[data-ff="([^"]+)"\]$/);
    if (mff) {
        if (el.attrs && el.attrs['data-ff'] === mff[1]) return el;
        for (var _i = 0; _i < (el.children || []).length; _i++) {
            var _r = deepQueryEl(el.children[_i], sel); if (_r) return _r;
        }
        return null;
    }
    var m = sel.match(/^\[data-act="([^"]+)"\]$/);
    if (!m) return null;
    var act = m[1];
    if (el.attrs && el.attrs['data-act'] === act) return el;
    for (var _j = 0; _j < (el.children || []).length; _j++) {
        var _r2 = deepQueryEl(el.children[_j], sel); if (_r2) return _r2;
    }
    if (el.innerHTML && el.innerHTML.indexOf('data-act="' + act + '"') !== -1) {
        return { addEventListener: function () {}, removeEventListener: function () {},
                 disabled: false, style: {cssText: ''}, textContent: '', checked: false, value: '' };
    }
    return null;
}
function getAllHtml(el) {
    if (!el) return '';
    var s = el.innerHTML || '';
    (el.children || []).forEach(function (c) { s += getAllHtml(c); });
    return s;
}
function makeEl(tag) {
    var el = {
        tagName: String(tag).toUpperCase(), id: '', innerHTML: '', textContent: '',
        children: [], attrs: {}, style: {cssText: ''}, parentNode: null, disabled: false,
        _listeners: {},
        appendChild: function (c) {
            c.parentNode = this; this.children.push(c);
            if (c.id) elById[c.id] = c; return c;
        },
        removeChild: function (c) { this.children = this.children.filter(function (x) { return x !== c; }); c.parentNode = null; },
        insertBefore: function (c) { this.children.push(c); c.parentNode = this; return c; },
        setAttribute: function (k, v) { this.attrs[k] = String(v == null ? '' : v); },
        getAttribute: function (k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; },
        removeAttribute: function (k) { delete this.attrs[k]; },
        hasAttribute: function (k) { return Object.prototype.hasOwnProperty.call(this.attrs, k); },
        addEventListener: function (ev, fn) {
            if (!this._listeners[ev]) this._listeners[ev] = [];
            this._listeners[ev].push(fn);
        },
        removeEventListener: function (ev, fn) {
            if (this._listeners[ev]) this._listeners[ev] = this._listeners[ev].filter(function (f) { return f !== fn; });
        },
        setPointerCapture: function () {},
        querySelectorAll: function () { return []; },
        querySelector: function (sel) { return deepQueryEl(this, sel); },
    };
    return el;
}
var bodyEl = makeEl('body');
global.sessionStorage = {
    _data: {},
    getItem:    function (k)    { return Object.prototype.hasOwnProperty.call(this._data, k) ? this._data[k] : null; },
    setItem:    function (k, v) { this._data[k] = String(v); },
    removeItem: function (k)    { delete this._data[k]; },
};
var _drawScenariaCalls = [];
var _mapPanToCalls     = [];

global.window = {
    innerWidth: 1280, innerHeight: 800,
    document: {
        body: bodyEl,
        head: makeEl('head'),
        createElement: function (t) { return makeEl(t); },
        getElementById: function (id) { return elById[id] || null; },
        dispatchEvent: function () {},
        addEventListener: function () {},
    },
    addEventListener:    function () {},
    removeEventListener: function () {},
    dispatchEvent:       function () {},
    // Scenario data store — populated per test
    RmoozScenario: null,
    // Redraw bridge spy
    AppAdjudicatorMap: {
        drawScenario: function (sc) { _drawScenariaCalls.push(sc); },
    },
};
var _markerStub = { addTo: function () { return this; }, on: function () { return this; },
    bindPopup: function () { return this; }, openPopup: function () { return this; } };
var _layerGroupInstance = {
    addTo: function () { return this; },
    clearLayers: function () { _layerMarkers = []; _polylines = []; },
    addLayer: function (m) {
        if (m && m._isPolyline) _polylines.push(m);
        else _layerMarkers.push(m);
        return this;
    },
};
global.window.L = {
    layerGroup: function () { return Object.assign({}, _layerGroupInstance); },
    marker: function (ll, opts) {
        var m = Object.assign({}, _markerStub, { _ll: ll, _opts: opts || {} });
        return m;
    },
    divIcon: function (o) { return Object.assign({ _opts: o }); },
    circleMarker: function (ll, opts) {
        var m = Object.assign({}, _markerStub, { _ll: ll, _opts: opts || {}, _isCircleMarker: true });
        return m;
    },
    polyline: function (lls, opts) {
        var m = Object.assign({}, _markerStub, { _lls: lls, _opts: opts || {}, _isPolyline: true });
        return m;
    },
};
global.window.map = {
    hasLayer: function () { return false; }, removeLayer: function () {},
    addLayer: function () {}, on: function () {}, off: function () {},
    panTo: function (ll) { _mapPanToCalls.push(ll); },
};
global.window.RmoozDemoUnits = { buildGroupsFromAnchors: function () { return []; } };
global.window.RmoozFreeFightAI = null;
global.window.fetch = null;

// ── Load modules ────────────────────────────────────────────────────────────
require(path.join(__dirname, 'UI_MOdified/client/shell/free-fight-demo-ai-panel.js'));
require(path.join(__dirname, 'UI_MOdified/client/shell/free-fight-demo.js'));
var DEMO = global.window.RmoozFreeFightDemo;
// RMOOZ-FREE-FIGHT-CONTROL-HARD-RESET-X: the unit-decision panel this suite reads (preview-marker /
// real-unit-moved text) now renders under the closed "Diagnostics / Legacy" drawer of the new V2
// control window. The legacy render fns are UNCHANGED — open the drawer so these checks still hit them.
DEMO._setFfLegacyOpenForTest(true);

var PAYLOAD = {
    brief: {
        operational_brief: {
            proposed_units: [
                { id: 'R-PROP-001', side: 'RED', lat: 27.50, lon: 56.50, platform: 'F-14A' },
            ],
            objectives: [{ label: 'Objective X', lat: 26.0, lon: 53.0 }],
            placement_candidates: [{ type: 'base', lat: 27.21, lon: 56.38, name: 'TestAB' }],
        },
    },
};

function makeScenario(redUnits, blueUnits) {
    return {
        red_units: redUnits || [],
        blue_units_initial: blueUnits || [],
        bls_template: [],
        obj: { name: 'Obj-Alpha', coord: [53.0, 26.0] },
    };
}

function freshMount(scenario) {
    elById = {};
    bodyEl.children = [];
    sessionStorage._data = {};
    _layerMarkers = [];
    _polylines    = [];
    _drawScenariaCalls = [];
    _mapPanToCalls     = [];
    global.window.RmoozScenario = scenario ? { scenario: scenario } : null;
    DEMO._resetWinStateForTest();
    DEMO.clear();
    DEMO.mount(PAYLOAD);
}

// Inject a decision with scenario_patch pointing to unitUid's new position
function injectDecision(unitUid, newLat, newLon) {
    DEMO._setAiDecisionForTest({
        ok: true,
        scenario_patch: { unit_uid: unitUid, lat: newLat, lon: newLon },
        action: { action_type: 'MOVE_TOWARD_OBJECTIVE', unit_uid: unitUid,
                  side: 'RED', reason: 'test-move', confidence: 'high', risk: 'low' },
        event_log_entry: 'FF-AI: ' + unitUid + ' moved',
        final_decision_source: 'deterministic_demo_ai',
        llm_called: false, llm_status: 'disabled',
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// §1  _findRealUnit locates unit by uid in scenario.red_units
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n§1  _findRealUnit locates unit by uid in scenario.red_units');
var scen1 = makeScenario([{ uid: 'R-015', lat: 27.10, lon: 56.20, side: 'RED' }], []);
freshMount(scen1);
var found1 = DEMO._findRealUnitForTest('R-015');
ok('§1 unit found', !!found1);
ok('§1 found.unit.uid = R-015', found1 && found1.unit && found1.unit.uid === 'R-015');
ok('§1 source = scenario_red_units', found1 && found1.source === 'scenario_red_units');

var notFound = DEMO._findRealUnitForTest('NONEXISTENT');
ok('§1 nonexistent returns null', notFound === null);

// ═══════════════════════════════════════════════════════════════════════════════
// §2  _findRealUnit locates unit by unit_uid in blue_units_initial
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n§2  _findRealUnit locates unit by unit_uid in blue_units_initial');
var scen2 = makeScenario([], [{ unit_uid: 'B-042', lat: 25.50, lon: 52.80, side: 'BLUE' }]);
freshMount(scen2);
var found2 = DEMO._findRealUnitForTest('B-042');
ok('§2 unit found in blue_units_initial', !!found2);
ok('§2 found.unit.unit_uid = B-042', found2 && found2.unit && found2.unit.unit_uid === 'B-042');
ok('§2 source = scenario_blue_units_initial', found2 && found2.source === 'scenario_blue_units_initial');

// Also test by id field
var scen2b = makeScenario([{ id: 'R-ID-001', lat: 27.0, lon: 56.0, side: 'RED' }], []);
freshMount(scen2b);
var found2b = DEMO._findRealUnitForTest('R-ID-001');
ok('§2 unit found by id field', found2b && found2b.unit && found2b.unit.id === 'R-ID-001');

// ═══════════════════════════════════════════════════════════════════════════════
// §3  _applyMoveToScenario updates coord:[lon,lat]
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n§3  _applyMoveToScenario updates coord:[lon,lat]');
var u3 = { id: 'R-COORD-001', coord: [56.20, 27.10], side: 'RED' };
var scen3 = makeScenario([u3], []);
freshMount(scen3);
injectDecision('R-COORD-001', 27.20, 56.30);
var mv3 = DEMO._applyMoveToScenarioForTest('R-COORD-001', 27.20, 56.30);
ok('§3 move found=true', mv3.found);
ok('§3 coord[0] updated to newLon', Math.abs(u3.coord[0] - 56.30) < 0.001);
ok('§3 coord[1] updated to newLat', Math.abs(u3.coord[1] - 27.20) < 0.001);
ok('§3 unit.lat updated', Math.abs(u3.lat - 27.20) < 0.001);
ok('§3 unit.lon updated', Math.abs(u3.lon - 56.30) < 0.001);

// ═══════════════════════════════════════════════════════════════════════════════
// §4  _applyMoveToScenario updates lat/lon (no coord array)
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n§4  _applyMoveToScenario updates lat/lon');
var u4 = { id: 'R-LATLON-001', lat: 27.00, lon: 56.00, side: 'RED' };
var scen4 = makeScenario([u4], []);
freshMount(scen4);
injectDecision('R-LATLON-001', 27.10, 56.10);
var mv4 = DEMO._applyMoveToScenarioForTest('R-LATLON-001', 27.10, 56.10);
ok('§4 move found=true', mv4.found);
ok('§4 unit.lat updated', Math.abs(u4.lat - 27.10) < 0.001);
ok('§4 unit.lon updated', Math.abs(u4.lon - 56.10) < 0.001);

// ═══════════════════════════════════════════════════════════════════════════════
// §5  _applyMoveToScenario preserves old coordinate
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n§5  _applyMoveToScenario preserves old coordinate');
var u5 = { id: 'R-OLD-001', lat: 27.00, lon: 56.00, side: 'RED' };
var scen5 = makeScenario([u5], []);
freshMount(scen5);
injectDecision('R-OLD-001', 27.15, 56.15);
var mv5 = DEMO._applyMoveToScenarioForTest('R-OLD-001', 27.15, 56.15);
ok('§5 mv5.oldPos is set', !!(mv5.oldPos));
ok('§5 old lat = 27.00', mv5.oldPos && Math.abs(mv5.oldPos.lat - 27.00) < 0.001);
ok('§5 old lon = 56.00', mv5.oldPos && Math.abs(mv5.oldPos.lon - 56.00) < 0.001);
ok('§5 unit._ff_ai_old_coord = [oldLon, oldLat]', u5._ff_ai_old_coord &&
    Math.abs(u5._ff_ai_old_coord[0] - 56.00) < 0.001 &&
    Math.abs(u5._ff_ai_old_coord[1] - 27.00) < 0.001);

// ═══════════════════════════════════════════════════════════════════════════════
// §6  _applyMoveToScenario marks _ff_ai_moved_by_ai
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n§6  _applyMoveToScenario marks _ff_ai_moved_by_ai');
var u6 = { id: 'R-FLAG-001', lat: 27.00, lon: 56.00, side: 'RED' };
var scen6 = makeScenario([u6], []);
freshMount(scen6);
injectDecision('R-FLAG-001', 27.10, 56.10);
DEMO._applyMoveToScenarioForTest('R-FLAG-001', 27.10, 56.10);
ok('§6 _ff_ai_moved_by_ai = true', u6._ff_ai_moved_by_ai === true);

// ═══════════════════════════════════════════════════════════════════════════════
// §7  Redraw bridge is called on apply (AppAdjudicatorMap.drawScenario)
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n§7  Redraw bridge called on apply');
var u7 = { id: 'R-DRAW-001', lat: 27.00, lon: 56.00, side: 'RED' };
var scen7 = makeScenario([u7], []);
freshMount(scen7);
_drawScenariaCalls = [];
injectDecision('R-DRAW-001', 27.10, 56.10);
DEMO._applyAiDecisionForTest();
ok('§7 drawScenario was called', _drawScenariaCalls.length > 0);
ok('§7 drawScenario received the scenario object', _drawScenariaCalls[0] === scen7);

// ═══════════════════════════════════════════════════════════════════════════════
// §8  Trail/line + pulse markers are added to layer
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n§8  Trail/line + pulse markers added to layer');
var u8 = { id: 'R-TRAIL-001', lat: 27.00, lon: 56.00, side: 'RED' };
var scen8 = makeScenario([u8], []);
freshMount(scen8);
_layerMarkers = []; _polylines = [];
injectDecision('R-TRAIL-001', 27.10, 56.10);
DEMO._applyAiDecisionForTest();
ok('§8 polyline trail added', _polylines.length > 0);
ok('§8 trail connects old and new positions', _polylines.length > 0 &&
    _polylines[0]._lls && _polylines[0]._lls.length === 2);
ok('§8 pulse marker added', _layerMarkers.some(function (m) { return m._isCircleMarker; }));
// FREEFIGHT-MANUAL-MAP-CAMERA-A: camera is manual by default — apply must NOT pan.
ok('§8 map.panTo NOT called by default (manual camera)', _mapPanToCalls.length === 0);

// ═══════════════════════════════════════════════════════════════════════════════
// §9  Objective X unchanged after Apply
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n§9  Objective X unchanged after Apply');
var u9 = { id: 'R-OBJ-001', lat: 27.00, lon: 56.00, side: 'RED' };
var scen9 = makeScenario([u9], []);
freshMount(scen9);
injectDecision('R-OBJ-001', 27.10, 56.10);
DEMO._applyAiDecisionForTest();
// Objective X is stored on _payload (in PAYLOAD.brief.operational_brief.objectives)
// and separately as _objective in the module. Check that the scenario obj is intact.
ok('§9 scenario obj coord unchanged', scen9.obj && scen9.obj.coord &&
    scen9.obj.coord[0] === 53.0 && scen9.obj.coord[1] === 26.0);
// And unit that was NOT the target should be unchanged
var u9alt = scen9.red_units.filter(function(u) { return u.id !== 'R-OBJ-001'; });
ok('§9 no extra units created', scen9.red_units.length === 1);

// ═══════════════════════════════════════════════════════════════════════════════
// §10  If unit not found, UI shows warning text
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n§10  If unit not found, UI shows warning');
freshMount(null); // no scenario
injectDecision('NO-SUCH-UNIT', 27.10, 56.10);
DEMO._applyAiDecisionForTest();
var pEl = elById['rmooz-free-fight-panel'];
var bodyDiv = pEl && deepQueryEl(pEl, '[data-ff="body"]');
var bHtml = bodyDiv ? bodyDiv.innerHTML : '';
ok('§10 warning text shown when unit not found',
    /preview marker only|real scenario unit not found/i.test(bHtml));
ok('§10 warning NOT showing "real unit marker moved on map"',
    !/real unit marker moved on map/.test(bHtml));

// ═══════════════════════════════════════════════════════════════════════════════
// §11  Reset restores old coordinate and clears AI trail state
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n§11  Reset restores old coordinate');
var u11 = { id: 'R-RESET-001', lat: 27.00, lon: 56.00, side: 'RED' };
var scen11 = makeScenario([u11], []);
freshMount(scen11);
injectDecision('R-RESET-001', 27.10, 56.10);
DEMO._applyAiDecisionForTest();
ok('§11 lat changed after apply', Math.abs(u11.lat - 27.10) < 0.001);
ok('§11 lon changed after apply', Math.abs(u11.lon - 56.10) < 0.001);
DEMO._resetAiDecisionForTest();
ok('§11 lat restored after reset', Math.abs(u11.lat - 27.00) < 0.001);
ok('§11 lon restored after reset', Math.abs(u11.lon - 56.00) < 0.001);
ok('§11 _ff_ai_moved_by_ai cleared', u11._ff_ai_moved_by_ai === false);
ok('§11 _getMovedUnitForTest returns null after reset', DEMO._getMovedUnitForTest() === null);
ok('§11 _getMovedUnitOldPosForTest returns null after reset', DEMO._getMovedUnitOldPosForTest() === null);

// coord array restored too
var u11b = { id: 'R-RESET-002', coord: [56.00, 27.00], lat: 27.00, lon: 56.00, side: 'RED' };
var scen11b = makeScenario([u11b], []);
freshMount(scen11b);
injectDecision('R-RESET-002', 27.10, 56.10);
DEMO._applyAiDecisionForTest();
DEMO._resetAiDecisionForTest();
ok('§11 coord[0] restored to oldLon', Math.abs(u11b.coord[0] - 56.00) < 0.001);
ok('§11 coord[1] restored to oldLat', Math.abs(u11b.coord[1] - 27.00) < 0.001);
// Redraw called on reset too
ok('§11 drawScenario called on reset', _drawScenariaCalls.length >= 1);

// ═══════════════════════════════════════════════════════════════════════════════
// §12  Trail + pulse replaces bare single circleMarker; apply text is correct
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n§12  Trail+pulse replaces bare circleMarker; apply text correct');
var u12 = { id: 'R-TXT-001', lat: 27.00, lon: 56.00, side: 'RED' };
var scen12 = makeScenario([u12], []);
freshMount(scen12);
_layerMarkers = []; _polylines = [];
injectDecision('R-TXT-001', 27.10, 56.10);
DEMO._applyAiDecisionForTest();
// Should have polyline + multiple circle markers (not just one bare circle)
ok('§12 has trail polyline', _polylines.length >= 1);
ok('§12 has pulse circle(s)', _layerMarkers.filter(function(m) { return m._isCircleMarker; }).length >= 1);
// Applied status text in panel
pEl = elById['rmooz-free-fight-panel'];
bodyDiv = pEl && deepQueryEl(pEl, '[data-ff="body"]');
bHtml = bodyDiv ? bodyDiv.innerHTML : '';
ok('§12 success text says "real unit marker moved on map"',
    /real unit marker moved on map/.test(bHtml));
ok('§12 success text does NOT say old bare "unit moved on map"',
    !/✔ Applied — unit moved on map/.test(bHtml));

// ═══════════════════════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n' + '─'.repeat(52));
console.log('PASS: ' + PASS + '  FAIL: ' + FAIL + '  TOTAL: ' + (PASS + FAIL));
if (FAIL > 0) process.exit(1);
