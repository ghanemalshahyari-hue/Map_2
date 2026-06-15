#!/usr/bin/env node
/*
 * FREEFIGHT-ACTION-REACTION-MAP-OVERLAY-A
 * The map must TELL the action/reaction story, not only the card: zone rings,
 * RED threat axis, block point, BLUE intercept line, alert label, role badges.
 * Review-only, no camera movement, no kill markers.
 *
 *  §1  situation_state thresholds draw 3 rings (warning/defended/engagement), labelled
 *  §2  nearest_red + objective draw the RED threat axis (labelled)
 *  §3  selected COA intercept_point draws a BLOCK POINT marker
 *  §4  moved BLUE units + intercept_point draw the BLUE intercept line
 *  §5  alert_state ALERT draws a BLUE ALERT / ROE map label
 *  §6  overlay never calls panTo / flyTo / fitBounds / setView / setZoom
 *  §7  all overlay layers are stamped _rmoozDemoOnly + _rmoozReviewOnly
 *  §8  no kill / damage / destroyed markers created
 *  §9  role badges for moved BLUE units + grouped already-in-position label
 * §10  overlay clears on reset and works with arbitrary unit IDs / objective
 */
'use strict';

var path = require('path');
var fs   = require('fs');

var PASS = 0, FAIL = 0;
function ok(label, cond, detail) {
    if (cond) { PASS++; console.log('  PASS  ' + label); }
    else       { FAIL++; console.log('  FAIL  ' + label + (detail ? '  (' + detail + ')' : '')); }
}
function flush() { return new Promise(function (r) { setImmediate(r); }); }

var P = require(path.join(__dirname, 'UI_MOdified/server/ai/free-fight-coa-planner.js'));

// ── capture buffers ──────────────────────────────────────────────────────────
var LAYERS = [];   // every layer added to the FF layerGroup
var CAM = { panTo: 0, flyTo: 0, fitBounds: 0, setView: 0, setZoom: 0 };
function resetCaptures() { LAYERS = []; CAM = { panTo: 0, flyTo: 0, fitBounds: 0, setView: 0, setZoom: 0 }; }
function overlayLayers() { return LAYERS.filter(function (l) { return l && l._rmoozActionReaction; }); }
function labelHtmls() { return overlayLayers().filter(function (l) { return l._iconHtml != null; }).map(function (l) { return l._iconHtml; }); }
function anyLabel(re) { return labelHtmls().some(function (h) { return re.test(h); }); }

// ── DOM/map harness ──────────────────────────────────────────────────────────
var elById = {};
function makeEl(tag) {
    return { tagName: String(tag).toUpperCase(), id: '', innerHTML: '', textContent: '', children: [], attrs: {}, style: { cssText: '' }, parentNode: null, disabled: false, _listeners: {},
        appendChild: function (c) { c.parentNode = this; this.children.push(c); if (c.id) elById[c.id] = c; return c; },
        removeChild: function (c) { this.children = this.children.filter(function (x) { return x !== c; }); },
        insertBefore: function (c) { this.children.push(c); return c; },
        setAttribute: function (k, v) { this.attrs[k] = String(v == null ? '' : v); },
        getAttribute: function (k) { return this.attrs[k] != null ? this.attrs[k] : null; },
        removeAttribute: function () {}, hasAttribute: function (k) { return this.attrs[k] != null; },
        addEventListener: function () {}, removeEventListener: function () {}, setPointerCapture: function () {},
        querySelectorAll: function () { return []; },
        querySelector: function (sel) { var m = sel.match(/^\[data-ff="([^"]+)"\]$/); if (m) { if (this.attrs['data-ff'] === m[1]) return this; for (var i=0;i<this.children.length;i++){var r=this.children[i].querySelector(sel);if(r)return r;} return null; } return { addEventListener: function () {}, style: { cssText: '' }, textContent: '', value: '', checked: false, select: function () {} }; } };
}
var bodyEl = makeEl('body');
global.sessionStorage = { _data: {}, getItem: function (k) { return this._data[k] != null ? this._data[k] : null; }, setItem: function (k, v) { this._data[k] = String(v); }, removeItem: function (k) { delete this._data[k]; } };
var eventLog = [];
global.window = {
    innerWidth: 1280, innerHeight: 800,
    document: { body: bodyEl, head: makeEl('head'), createElement: function (t) { return makeEl(t); }, getElementById: function (id) { return elById[id] || null; }, dispatchEvent: function () {}, addEventListener: function () {} },
    addEventListener: function () {}, removeEventListener: function () {}, dispatchEvent: function () {},
    RmoozScenario: null, AppAdjudicatorMap: { drawScenario: function () {} }, AppShellEventLog: { append: function (e) { eventLog.push(e); } },
    setTimeout: function () {}, clearTimeout: function () {}, setInterval: function () {}, clearInterval: function () {},
    fetch: function () { return Promise.resolve({ ok: true, text: function () { return Promise.resolve('{}'); }, json: function () { return Promise.resolve({}); } }); },
};
var _lg = { addTo: function () { return this; }, clearLayers: function () { LAYERS = LAYERS.filter(function (l) { return !l._inFfLayer; }); }, addLayer: function (m) { if (m) { m._inFfLayer = true; LAYERS.push(m); } return this; } };
function stubLayer(extra) { return Object.assign({ addTo: function () { return this; }, on: function () { return this; }, bindPopup: function () { return this; } }, extra || {}); }
global.window.L = {
    layerGroup: function () { return Object.assign({}, _lg); },
    marker: function (ll, o) { var html = o && o.icon && o.icon._html; return stubLayer({ _ll: ll, _opts: o || {}, _isMarker: true, _iconHtml: html }); },
    divIcon: function (o) { return { _html: (o && o.html) || '', _opts: o }; },
    circleMarker: function (ll, o) { return stubLayer({ _ll: ll, _opts: o || {}, _isCircleMarker: true }); },
    circle: function (ll, o) { return stubLayer({ _ll: ll, _opts: o || {}, _isCircle: true }); },
    polyline: function (lls, o) { return stubLayer({ _lls: lls, _opts: o || {}, _isPolyline: true }); },
};
global.window.map = {
    hasLayer: function () { return false; }, removeLayer: function () {}, addLayer: function () {}, on: function () {}, off: function () {},
    panTo: function () { CAM.panTo++; }, flyTo: function () { CAM.flyTo++; }, fitBounds: function () { CAM.fitBounds++; }, setView: function () { CAM.setView++; }, setZoom: function () { CAM.setZoom++; },
};
global.window.RmoozDemoUnits = { buildGroupsFromAnchors: function () { return []; } };
global.window.RmoozFreeFightAI = null;
require(path.join(__dirname, 'UI_MOdified/client/shell/free-fight-demo-ai-panel.js'));
require(path.join(__dirname, 'UI_MOdified/client/shell/free-fight-demo.js'));
var DEMO = global.window.RmoozFreeFightDemo;
// RMOOZ-AI-COMMANDER-FREEDOM-B: this suite asserts the CONTROLLED-mode intercept/overlay
// behavior (block point, intercept line). Pin the mode explicitly — the app default is now
// High Variation, which deliberately produces recon/flank instead of intercept geometry.
DEMO._setCommanderModeForTest('controlled');

function u(id, side, role, lat, lon) { return { uid: id, unit_uid: id, side: side, role: role, label: role, coord: [lon, lat] }; }
function mountScenario(scen, objLL) {
    elById = {}; bodyEl.children = []; sessionStorage._data = {}; eventLog.length = 0;
    global.window.RmoozScenario = { scenario: scen };
    var payload = { brief: { operational_brief: { proposed_units: [], objectives: [{ label: scen.obj.name, lat: objLL.lat, lon: objLL.lon }], placement_candidates: [{ type: 'base', lat: objLL.lat, lon: objLL.lon, name: 'AB' }] } } };
    DEMO._resetWinStateForTest(); DEMO.clear(); DEMO.mount(payload);
}

(async function main() {
    // Abu-Dhabi-style: RED su-30 inside the defended zone; BLUE air/AD/naval/ground.
    var objLL = { lat: 24.45, lon: 54.37 };
    var scen = { name: 'UAE Abu Dhabi defense', obj: { name: 'Abu Dhabi', coord: [54.37, 24.45] },
        red_units: [u('R-AIR-1', 'RED', 'su-30 fighter', 24.58, 54.37)],
        blue_units_initial: [u('B-1', 'BLUE', 'f-16 fighter', 24.50, 54.30), u('B-2', 'BLUE', 'patriot sam', 24.46, 54.37), u('B-3', 'BLUE', 'radar', 24.45, 54.40), u('B-4', 'BLUE', 'frigate', 24.55, 54.15), u('B-5', 'BLUE', 'mechanized infantry', 24.40, 54.45)] };
    mountScenario(scen, objLL);
    DEMO._setActiveSideForTest('BLUE'); DEMO._setUseLlmForTest(false);
    var body = DEMO._buildLoopRequestBodyForTest();
    var plan = await P.planCoas(body.units, body.objectives, body.context, body.opts);
    resetCaptures();
    DEMO._runTurnCoreForTest(plan, 0);  // applies + triggers syncMarkers (overlay drawn)
    await flush();

    // ── §1 rings ─────────────────────────────────────────────────────────────
    console.log('\n§1  Three labelled zone rings around the objective');
    var rings = overlayLayers().filter(function (l) { return l._isCircle; });
    ok('§1 three rings drawn', rings.length === 3, 'rings=' + rings.length);
    ok('§1 ring radii descend (warning>defended>engagement)', rings.length === 3 && rings[0]._opts.radius > rings[1]._opts.radius && rings[1]._opts.radius > rings[2]._opts.radius);
    ok('§1 warning ring labelled review-only', anyLabel(/Warning zone — review only/));
    ok('§1 defended ring labelled review-only', anyLabel(/Defended zone — review only/));
    ok('§1 engagement ring labelled review-only', anyLabel(/Engagement-ready zone — review only/));

    // ── §2 RED threat axis ───────────────────────────────────────────────────
    console.log('\n§2  RED threat axis (nearest RED → objective)');
    var redAxis = overlayLayers().filter(function (l) { return l._isPolyline && l._opts.color === '#f0606a'; });
    ok('§2 red threat axis polyline drawn', redAxis.length >= 1);
    ok('§2 axis runs nearest_red → objective', redAxis.length >= 1 && Math.abs(redAxis[0]._lls[1][0] - 24.45) < 1e-6 && Math.abs(redAxis[0]._lls[1][1] - 54.37) < 1e-6);
    ok('§2 RED threat axis labelled', anyLabel(/RED threat axis/));

    // ── §3 block point ───────────────────────────────────────────────────────
    console.log('\n§3  BLOCK POINT marker at the COA intercept_point');
    ok('§3 BLOCK POINT label present', anyLabel(/BLOCK POINT/));
    ok('§3 BLOCK POINT bilingual (Arabic)', anyLabel(/نقطة الاعتراض/));
    var coa = plan.coas[DEMO._getCoaSelectedIdxForTest()];
    ok('§3 selected COA has intercept_point', !!(coa && coa.intercept_point), JSON.stringify(coa && coa.intercept_point));

    // ── §4 BLUE intercept line ───────────────────────────────────────────────
    console.log('\n§4  BLUE intercept line to the block point');
    var blueLine = overlayLayers().filter(function (l) { return l._isPolyline && l._opts.color === '#5ad0d0'; });
    ok('§4 cyan BLUE intercept line drawn', blueLine.length >= 1);
    ok('§4 intercept line ends at the block point', blueLine.length >= 1 && coa.intercept_point && Math.abs(blueLine[0]._lls[1][0] - coa.intercept_point.lat) < 1e-6);

    // ── §5 alert label ───────────────────────────────────────────────────────
    console.log('\n§5  BLUE ALERT / ROE map label');
    ok('§5 situation alert is ALERT', plan.situation_state.alert_state === 'ALERT', plan.situation_state.alert_state);
    ok('§5 BLUE ALERT label on map', anyLabel(/BLUE ALERT/));
    ok('§5 ROE shown in label', anyLabel(/ROE: INTERCEPT/));
    ok('§5 label names the zone', anyLabel(/inside (defended|engagement|warning) zone/));

    // ── §6 no camera movement ────────────────────────────────────────────────
    console.log('\n§6  Overlay never moves the camera');
    ok('§6 no panTo', CAM.panTo === 0);
    ok('§6 no flyTo / fitBounds / setView / setZoom', CAM.flyTo === 0 && CAM.fitBounds === 0 && CAM.setView === 0 && CAM.setZoom === 0);

    // ── §7 review-only stamps ────────────────────────────────────────────────
    console.log('\n§7  All overlay layers stamped demo/review-only');
    var ov = overlayLayers();
    ok('§7 overlay produced layers', ov.length > 0, 'count=' + ov.length);
    ok('§7 every overlay layer _rmoozDemoOnly', ov.every(function (l) { return l._rmoozDemoOnly === true; }));
    ok('§7 every overlay layer _rmoozReviewOnly', ov.every(function (l) { return l._rmoozReviewOnly === true; }));

    // ── §8 no kill markers ───────────────────────────────────────────────────
    console.log('\n§8  No kill / damage / destroyed markers');
    ok('§8 no kill/destroyed/damage label', !anyLabel(/\bkill|destroyed|\bdamage|casualt/i));
    var src = fs.readFileSync(path.join(__dirname, 'UI_MOdified/client/shell/free-fight-demo.js'), 'utf8');
    var ovFn = (src.match(/function renderActionReactionOverlay[\s\S]*?\n    \}/) || [''])[0];
    ok('§8 overlay code has no kill/destroy verbs', !/\bkill\b|\bdestroy\b|destroyed|open fire/i.test(ovFn));

    // ── §9 role badges + held label ──────────────────────────────────────────
    console.log('\n§9  Role badges for moved BLUE units + grouped already-in-position');
    var moved = DEMO._getCoaMovedUnitsForTest();
    var held = DEMO._getCoaHeldCountForTest();
    ok('§9 at least one role badge (intercept/screen/...)', anyLabel(/>(intercept|screen|reinforce|reserve|defend|recon)</), 'moved=' + moved.length);
    if (held > 0) ok('§9 grouped already-in-position label', anyLabel(/already in position/));
    else ok('§9 (no held units this run — grouped label not required)', true);

    // ── §10 reset clears overlay + scenario-generic ──────────────────────────
    console.log('\n§10  Overlay clears on reset + works with arbitrary scenario');
    DEMO._resetLoopForTest();
    resetCaptures();
    DEMO._syncMarkersForTest();
    ok('§10 no overlay layers after reset', overlayLayers().length === 0, 'count=' + overlayLayers().length);
    // arbitrary IDs + objective
    var scen2 = { name: 'NATO eastern flank', obj: { name: 'Vienna Sector', coord: [16.37, 48.21] },
        red_units: [u('ENEMY-ALPHA', 'RED', 'su-30 fighter', 48.34, 16.37)],
        blue_units_initial: [u('DEF-1', 'BLUE', 'f-16 fighter', 48.20, 16.30), u('DEF-2', 'BLUE', 'patriot sam', 48.21, 16.37), u('DEF-3', 'BLUE', 'radar', 48.22, 16.40)] };
    mountScenario(scen2, { lat: 48.21, lon: 16.37 });
    DEMO._setActiveSideForTest('BLUE'); DEMO._setUseLlmForTest(false);
    var b2 = DEMO._buildLoopRequestBodyForTest();
    var plan2 = await P.planCoas(b2.units, b2.objectives, b2.context, b2.opts);
    resetCaptures();
    DEMO._runTurnCoreForTest(plan2, 0);
    await flush();
    ok('§10 overlay drawn for arbitrary scenario', overlayLayers().length > 0);
    ok('§10 rings + axis present for arbitrary scenario', overlayLayers().some(function (l) { return l._isCircle; }) && anyLabel(/RED threat axis/));
    ok('§10 no camera movement on arbitrary scenario', CAM.panTo === 0 && CAM.fitBounds === 0 && CAM.setView === 0);

    console.log('\n' + '─'.repeat(52));
    console.log('PASS: ' + PASS + '  FAIL: ' + FAIL + '  TOTAL: ' + (PASS + FAIL));
    if (FAIL > 0) process.exit(1);
})();
