#!/usr/bin/env node
/*
 * FREEFIGHT-AI-SPEED-CONTROL-A — speed + cinematic-movement tests
 *
 *  §1  All 5 speed presets (x1/x5/x15/fire/fire2) expose timing config
 *  §2  x1 uses the longest timing (decisionDelayMs 8000, moveAnimMs 6000)
 *  §3  fire2 uses the shortest timing (decisionDelayMs 120, moveAnimMs 120)
 *  §4  decisionDelayMs strictly decreases x1 > x5 > x15 > fire > fire2
 *  §5  moveAnimMs strictly decreases x1 > x5 > x15 > fire ≥ fire2
 *  §6  setFreeFightSpeed changes the active speed; default is x1
 *  §7  x1 does NOT instantly jump units (cinematic — units stay at start until frames advance)
 *  §8  x1 animation completes to the stepped target after frames run
 *  §9  fire2 applies instantly (units at target immediately)
 * §10  Source has speed buttons loop-speed-x1 … loop-speed-fire2
 * §11  Source has Start/Pause/Step/Reset loop buttons
 * §12  Source renders speed labels (x1 and 🔥🔥) + "Speed:" control
 * §13  "AI Commander Free Fight" heading present in source
 * §14  Cinematic note present ("x1 = cinematic")
 */
'use strict';

var path = require('path');
var fs   = require('fs');

var PASS = 0, FAIL = 0;
function ok(label, cond, detail) {
    if (cond) { PASS++; console.log('  PASS  ' + label); }
    else       { FAIL++; console.log('  FAIL  ' + label + (detail ? '  (' + detail + ')' : '')); }
}

// ── minimal DOM/map harness ──────────────────────────────────────────────────
var elById = {};
function makeEl(tag) {
    return {
        tagName: String(tag).toUpperCase(), id: '', innerHTML: '', textContent: '',
        children: [], attrs: {}, style: { cssText: '' }, parentNode: null, disabled: false, _listeners: {},
        appendChild: function (c) { c.parentNode = this; this.children.push(c); if (c.id) elById[c.id] = c; return c; },
        removeChild: function (c) { this.children = this.children.filter(function (x) { return x !== c; }); c.parentNode = null; },
        insertBefore: function (c) { this.children.push(c); c.parentNode = this; return c; },
        setAttribute: function (k, v) { this.attrs[k] = String(v == null ? '' : v); },
        getAttribute: function (k) { return this.attrs[k] != null ? this.attrs[k] : null; },
        removeAttribute: function (k) { delete this.attrs[k]; }, hasAttribute: function (k) { return this.attrs[k] != null; },
        addEventListener: function () {}, removeEventListener: function () {}, setPointerCapture: function () {},
        querySelectorAll: function () { return []; },
        querySelector: function (sel) {
            var mff = sel.match(/^\[data-ff="([^"]+)"\]$/);
            if (mff) { if (this.attrs['data-ff'] === mff[1]) return this; for (var i = 0; i < this.children.length; i++) { var r = this.children[i].querySelector(sel); if (r) return r; } }
            return { addEventListener: function () {}, style: { cssText: '' }, textContent: '', value: '', checked: false };
        },
    };
}
var bodyEl = makeEl('body');
global.sessionStorage = { _data: {}, getItem: function (k) { return this._data[k] != null ? this._data[k] : null; }, setItem: function (k, v) { this._data[k] = String(v); }, removeItem: function (k) { delete this._data[k]; } };
var _drawCalls = [], _intervals = [], _timeouts = [];
global.window = {
    innerWidth: 1280, innerHeight: 800,
    document: { body: bodyEl, head: makeEl('head'), createElement: function (t) { return makeEl(t); }, getElementById: function (id) { return elById[id] || null; }, dispatchEvent: function () {}, addEventListener: function () {} },
    addEventListener: function () {}, removeEventListener: function () {}, dispatchEvent: function () {},
    RmoozScenario: null,
    AppAdjudicatorMap: { drawScenario: function (sc) { _drawCalls.push(sc); } },
    AppShellEventLog: { append: function () {} },
    setTimeout: function (fn, ms) { var id = { fn: fn, ms: ms }; _timeouts.push(id); return id; },
    clearTimeout: function (id) { _timeouts = _timeouts.filter(function (x) { return x !== id; }); },
    setInterval: function (fn, ms) { var id = { fn: fn, ms: ms }; _intervals.push(id); return id; },
    clearInterval: function (id) { _intervals = _intervals.filter(function (x) { return x !== id; }); },
};
var _markerStub = { addTo: function () { return this; }, on: function () { return this; }, bindPopup: function () { return this; }, openPopup: function () { return this; } };
var _lg = { addTo: function () { return this; }, clearLayers: function () {}, addLayer: function () { return this; } };
global.window.L = {
    layerGroup: function () { return Object.assign({}, _lg); },
    marker: function (ll, o) { return Object.assign({}, _markerStub, { _ll: ll, _opts: o || {} }); },
    divIcon: function (o) { return { _opts: o }; },
    circleMarker: function (ll, o) { return Object.assign({}, _markerStub, { _ll: ll, _opts: o || {} }); },
    polyline: function (lls, o) { return Object.assign({}, _markerStub, { _lls: lls, _opts: o || {}, _isPolyline: true }); },
};
global.window.map = { hasLayer: function () { return false; }, removeLayer: function () {}, addLayer: function () {}, on: function () {}, off: function () {}, panTo: function () {} };
global.window.RmoozDemoUnits = { buildGroupsFromAnchors: function () { return []; } };
global.window.RmoozFreeFightAI = null;
global.window.fetch = function () { return Promise.resolve({ json: function () { return Promise.resolve({ ok: false }); } }); };

var PLANNER = require(path.join(__dirname, 'UI_MOdified/server/ai/free-fight-coa-planner.js'));
require(path.join(__dirname, 'UI_MOdified/client/shell/free-fight-demo-ai-panel.js'));
require(path.join(__dirname, 'UI_MOdified/client/shell/free-fight-demo.js'));
var DEMO = global.window.RmoozFreeFightDemo;

var PAYLOAD = { brief: { operational_brief: { proposed_units: [], objectives: [{ label: 'Objective X', lat: 34.95, lon: 48.95 }], placement_candidates: [{ type: 'base', lat: 34.5, lon: 48.5, name: 'AB' }] } } };
function mkUnits(n, side) { var u = []; for (var i = 0; i < n; i++) { var lat = 34.5 + i * 0.012, lon = 48.5 + i * 0.012; u.push({ uid: side[0] + '-' + String(i + 1).padStart(3, '0'), side: side, lat: lat, lon: lon, coord: [lon, lat] }); } return u; }
function freshMount() {
    elById = {}; bodyEl.children = []; sessionStorage._data = {}; _drawCalls = []; _intervals = []; _timeouts = [];
    global.window.RmoozScenario = { scenario: { red_units: mkUnits(12, 'RED'), blue_units_initial: mkUnits(8, 'BLUE'), obj: { name: 'Objective X', coord: [48.95, 34.95] } } };
    DEMO._resetWinStateForTest(); DEMO.clear(); DEMO.mount(PAYLOAD);
}
function planForCurrentSide() { var b = DEMO._buildLoopRequestBodyForTest(); return PLANNER.planCoas(b.units, b.objectives, b.context, b.opts); }

(async function main() {
    // ── §1 all presets expose config ─────────────────────────────────────────
    console.log('\n§1  All 5 speed presets expose timing config');
    freshMount();
    ['x1', 'x5', 'x15', 'fire', 'fire2'].forEach(function (sp) {
        var c = DEMO._getSpeedConfigForTest(sp);
        ok('§1 ' + sp + ' has decisionDelayMs + moveAnimMs', c && Number.isFinite(c.decisionDelayMs) && Number.isFinite(c.moveAnimMs));
    });

    // ── §2 x1 longest ────────────────────────────────────────────────────────
    console.log('\n§2  x1 uses the longest timing');
    var x1 = DEMO._getSpeedConfigForTest('x1');
    ok('§2 x1 decisionDelayMs === 8000', x1.decisionDelayMs === 8000);
    ok('§2 x1 moveAnimMs === 6000', x1.moveAnimMs === 6000);

    // ── §3 fire2 shortest ─────────────────────────────────────────────────────
    console.log('\n§3  fire2 uses the shortest timing');
    var f2 = DEMO._getSpeedConfigForTest('fire2');
    ok('§3 fire2 decisionDelayMs === 120', f2.decisionDelayMs === 120);
    ok('§3 fire2 moveAnimMs === 120', f2.moveAnimMs === 120);

    // ── §4 decisionDelay strictly decreasing ─────────────────────────────────
    console.log('\n§4  decisionDelayMs strictly decreases across presets');
    var order = ['x1', 'x5', 'x15', 'fire', 'fire2'].map(function (s) { return DEMO._getSpeedConfigForTest(s).decisionDelayMs; });
    var decDec = true; for (var i = 1; i < order.length; i++) { if (!(order[i] < order[i - 1])) decDec = false; }
    ok('§4 decisionDelayMs strictly decreasing', decDec, order.join(' > '));

    // ── §5 moveAnimMs decreasing (non-increasing, strictly until fire) ───────
    console.log('\n§5  moveAnimMs decreases across presets');
    var anim = ['x1', 'x5', 'x15', 'fire', 'fire2'].map(function (s) { return DEMO._getSpeedConfigForTest(s).moveAnimMs; });
    var animDec = true; for (var j = 1; j < anim.length; j++) { if (anim[j] > anim[j - 1]) animDec = false; }
    ok('§5 moveAnimMs non-increasing', animDec, anim.join(' >= '));
    ok('§5 x1 anim >> fire2 anim', anim[0] > anim[4] * 10);

    // ── §6 setFreeFightSpeed + default ───────────────────────────────────────
    console.log('\n§6  setFreeFightSpeed changes speed; default is x1');
    freshMount();
    ok('§6 default speed is x1', DEMO._getSpeedForTest() === 'x1');
    DEMO._setSpeedForTest('x15');
    ok('§6 speed changed to x15', DEMO._getSpeedForTest() === 'x15');
    DEMO._setSpeedForTest('fire2');
    ok('§6 speed changed to fire2', DEMO._getSpeedForTest() === 'fire2');
    DEMO._setSpeedForTest('bogus');
    ok('§6 invalid speed ignored (stays fire2)', DEMO._getSpeedForTest() === 'fire2');

    // ── §7 x1 cinematic: no instant jump ─────────────────────────────────────
    console.log('\n§7  x1 does NOT instantly jump units (cinematic)');
    freshMount();
    var plan7 = await planForCurrentSide();
    // capture a unit that the recommended COA will move
    var recIdx = DEMO._pickRecommendedIdxForTest(plan7);
    var firstMove = null;
    (plan7.coas[recIdx].phases || []).forEach(function (ph) { (ph.actions || []).forEach(function (a) { if (!firstMove && a.action_type !== 'HOLD_POSITION') firstMove = a; }); });
    var movingUid = firstMove.unit_uid;
    var before = DEMO._findRealUnitForTest(movingUid).unit;
    var startLat = before.lat, startLon = before.lon;
    _intervals = [];
    DEMO._runTurnCoreForTest(plan7, 6000); // x1 anim window
    var u7 = DEMO._findRealUnitForTest(movingUid).unit;
    ok('§7 an animation interval was scheduled', _intervals.length === 1);
    ok('§7 unit has NOT jumped to target yet (still at start)', Math.abs(u7.lat - startLat) < 1e-9 && Math.abs(u7.lon - startLon) < 1e-9, 'lat moved ' + (u7.lat - startLat));
    ok('§7 moved-units not yet recorded mid-animation', DEMO._getCoaMovedUnitsForTest().length === 0);

    // ── §8 x1 animation completes after frames advance ───────────────────────
    console.log('\n§8  x1 animation completes to target after frames run');
    var guard = 0;
    while (_intervals.length && guard < 40) { _intervals[0].fn(); guard++; }
    var u8 = DEMO._findRealUnitForTest(movingUid).unit;
    ok('§8 unit moved from its start after animation', Math.abs(u8.lat - startLat) > 1e-6 || Math.abs(u8.lon - startLon) > 1e-6);
    ok('§8 moved-units recorded after animation completes', DEMO._getCoaMovedUnitsForTest().length > 0);
    ok('§8 interval cleared itself when done', _intervals.length === 0);

    // ── §9 fire2 instant apply ───────────────────────────────────────────────
    console.log('\n§9  fire2 applies instantly (no animation interval)');
    freshMount();
    var plan9 = await planForCurrentSide();
    var rec9 = DEMO._pickRecommendedIdxForTest(plan9);
    var fm9 = null;
    (plan9.coas[rec9].phases || []).forEach(function (ph) { (ph.actions || []).forEach(function (a) { if (!fm9 && a.action_type !== 'HOLD_POSITION') fm9 = a; }); });
    var uid9 = fm9.unit_uid;
    var b9 = DEMO._findRealUnitForTest(uid9).unit;
    var s9lat = b9.lat, s9lon = b9.lon;
    _intervals = [];
    DEMO._runTurnCoreForTest(plan9, 120); // fire2 anim window → instant path
    var u9 = DEMO._findRealUnitForTest(uid9).unit;
    ok('§9 no animation interval scheduled for fire2', _intervals.length === 0);
    ok('§9 unit moved immediately', Math.abs(u9.lat - s9lat) > 1e-6 || Math.abs(u9.lon - s9lon) > 1e-6);
    ok('§9 moved-units recorded immediately', DEMO._getCoaMovedUnitsForTest().length > 0);

    // ── §10–§14 source checks ────────────────────────────────────────────────
    var src = fs.readFileSync(path.join(__dirname, 'UI_MOdified/client/shell/free-fight-demo.js'), 'utf8');
    console.log('\n§10  Source generates all speed buttons (dynamic)');
    ok('§10 dynamic loop-speed button generated', /data-act="loop-speed-' \+ sp/.test(src));
    // RMOOZ-SCENARIO-CONTROL-CENTER-REBUILD-AF: the loop-speed buttons were BOUND in the old Free Fight
    // control window's updatePanel binds, which were removed. The speed ENGINE (FF_SPEED_ORDER + every
    // preset's timing config) is intact and asserted here; the old UI-binding assertion is retired.
    // [[retired-by-AF]]
    ok('§10 FF_SPEED_ORDER lists all 5 presets',
        /FF_SPEED_ORDER\s*=\s*\['x1',\s*'x5',\s*'x15',\s*'fire',\s*'fire2'\]/.test(src));
    // Runtime proof: every preset resolves to a real config object
    ['x1', 'x5', 'x15', 'fire', 'fire2'].forEach(function (sp) {
        ok('§10 ' + sp + ' resolves to a config', !!DEMO._getSpeedConfigForTest(sp));
    });

    console.log('\n§11  Source has Start/Pause/Step/Reset loop buttons');
    ok('§11 loop-start present', /data-act="loop-start"/.test(src));
    ok('§11 loop-pause present', /data-act="loop-pause"/.test(src));
    ok('§11 loop-step present',  /data-act="loop-step"/.test(src));
    ok('§11 loop-reset present', /data-act="loop-reset"/.test(src));

    console.log('\n§12  Source renders speed control + labels');
    ok('§12 "Speed:" control label present', /Speed:/.test(src));
    ok('§12 x1 label present', /label: 'x1'/.test(src));
    ok('§12 fire2 label 🔥🔥 present', /🔥🔥/.test(src));

    console.log('\n§13  "AI Commander Free Fight" heading present');
    ok('§13 heading present', /AI Commander Free Fight/.test(src));
    ok('§13 Start AI Free Fight button label present', /Start AI Free Fight/.test(src));

    console.log('\n§14  Cinematic note present');
    ok('§14 "x1 = cinematic" note present', /x1 = cinematic/.test(src));

    console.log('\n' + '─'.repeat(52));
    console.log('PASS: ' + PASS + '  FAIL: ' + FAIL + '  TOTAL: ' + (PASS + FAIL));
    if (FAIL > 0) process.exit(1);
})();
