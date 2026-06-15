#!/usr/bin/env node
/*
 * FREEFIGHT-AI-CONTINUOUS-COMMANDER-LOOP-A — loop behavior tests
 *
 * Drives the real client module (free-fight-demo.js) + real planner
 * (free-fight-coa-planner.js) in a mock DOM/map environment.
 *
 *  §1  Start loop sets _loopRunning=true
 *  §2  Pause sets _loopPaused and clears the pending next-turn timer
 *  §3  Step Once runs exactly one turn (turn increments, no scheduled next)
 *  §4  Each turn builds a request with current scenario state (context + units)
 *  §5  Auto-picks the recommended COA
 *  §6  Applies multiple real unit movements
 *  §7  Turn number increments across turns
 *  §8  Active side alternates RED → BLUE → RED
 *  §9  Event log records each turn ("AI Commander Turn")
 * §10  LLM failure falls back to deterministic COA and the turn still applies
 * §11  Reset clears timers, restores moved units, resets turn/side
 * §12  Right-side "AI Commander Reasoning" panel renders after a turn
 * §13  Objective X is never moved by the loop
 * §14  Stop/clear tears down loop timers and state
 */
'use strict';

var path = require('path');

var PASS = 0, FAIL = 0;
function ok(label, cond, detail) {
    if (cond) { PASS++; console.log('  PASS  ' + label); }
    else       { FAIL++; console.log('  FAIL  ' + label + (detail ? '  (' + detail + ')' : '')); }
}
function flush() { return new Promise(function (r) { setImmediate(r); }); }

// ── DOM stub ─────────────────────────────────────────────────────────────────
var elById = {};
function deepQueryEl(el, sel) {
    if (!el) return null;
    var mff = sel.match(/^\[data-ff="([^"]+)"\]$/);
    if (mff) {
        if (el.attrs && el.attrs['data-ff'] === mff[1]) return el;
        for (var i = 0; i < (el.children || []).length; i++) { var r = deepQueryEl(el.children[i], sel); if (r) return r; }
        return null;
    }
    var m = sel.match(/^\[data-act="([^"]+)"\]$/);
    if (!m) return null;
    var act = m[1];
    if (el.attrs && el.attrs['data-act'] === act) return el;
    for (var j = 0; j < (el.children || []).length; j++) { var r2 = deepQueryEl(el.children[j], sel); if (r2) return r2; }
    if (el.innerHTML && el.innerHTML.indexOf('data-act="' + act + '"') !== -1) {
        return { addEventListener: function () {}, removeEventListener: function () {}, disabled: false, style: { cssText: '' }, textContent: '', checked: false, value: '' };
    }
    return null;
}
function makeEl(tag) {
    return {
        tagName: String(tag).toUpperCase(), id: '', innerHTML: '', textContent: '',
        children: [], attrs: {}, style: { cssText: '' }, parentNode: null, disabled: false, _listeners: {},
        appendChild: function (c) { c.parentNode = this; this.children.push(c); if (c.id) elById[c.id] = c; return c; },
        removeChild: function (c) { this.children = this.children.filter(function (x) { return x !== c; }); c.parentNode = null; },
        insertBefore: function (c) { this.children.push(c); c.parentNode = this; return c; },
        setAttribute: function (k, v) { this.attrs[k] = String(v == null ? '' : v); },
        getAttribute: function (k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; },
        removeAttribute: function (k) { delete this.attrs[k]; },
        hasAttribute: function (k) { return Object.prototype.hasOwnProperty.call(this.attrs, k); },
        addEventListener: function (ev, fn) { (this._listeners[ev] = this._listeners[ev] || []).push(fn); },
        removeEventListener: function () {}, setPointerCapture: function () {},
        querySelectorAll: function () { return []; },
        querySelector: function (sel) { return deepQueryEl(this, sel); },
    };
}
var bodyEl = makeEl('body');
global.sessionStorage = { _data: {}, getItem: function (k) { return this._data[k] != null ? this._data[k] : null; }, setItem: function (k, v) { this._data[k] = String(v); }, removeItem: function (k) { delete this._data[k]; } };

var _drawCalls = [], _panToCalls = [], _eventLog = [];
var _timeouts = [], _intervals = [];

global.window = {
    innerWidth: 1280, innerHeight: 800,
    document: {
        body: bodyEl, head: makeEl('head'),
        createElement: function (t) { return makeEl(t); },
        getElementById: function (id) { return elById[id] || null; },
        dispatchEvent: function () {}, addEventListener: function () {},
    },
    addEventListener: function () {}, removeEventListener: function () {}, dispatchEvent: function () {},
    RmoozScenario: null,
    AppAdjudicatorMap: { drawScenario: function (sc) { _drawCalls.push(sc); } },
    AppShellEventLog: { append: function (e) { _eventLog.push(e); } },
    // Controllable timers (captured, not auto-run)
    setTimeout: function (fn, ms) { var id = { fn: fn, ms: ms }; _timeouts.push(id); return id; },
    clearTimeout: function (id) { _timeouts = _timeouts.filter(function (x) { return x !== id; }); },
    setInterval: function (fn, ms) { var id = { fn: fn, ms: ms }; _intervals.push(id); return id; },
    clearInterval: function (id) { _intervals = _intervals.filter(function (x) { return x !== id; }); },
};
var _markerStub = { addTo: function () { return this; }, on: function () { return this; }, bindPopup: function () { return this; }, openPopup: function () { return this; } };
var _layerGroup = { addTo: function () { return this; }, clearLayers: function () {}, addLayer: function () { return this; } };
global.window.L = {
    layerGroup: function () { return Object.assign({}, _layerGroup); },
    marker: function (ll, o) { return Object.assign({}, _markerStub, { _ll: ll, _opts: o || {} }); },
    divIcon: function (o) { return { _opts: o }; },
    circleMarker: function (ll, o) { return Object.assign({}, _markerStub, { _ll: ll, _opts: o || {} }); },
    polyline: function (lls, o) { return Object.assign({}, _markerStub, { _lls: lls, _opts: o || {}, _isPolyline: true }); },
};
global.window.map = { hasLayer: function () { return false; }, removeLayer: function () {}, addLayer: function () {}, on: function () {}, off: function () {}, panTo: function (ll) { _panToCalls.push(ll); } };
global.window.RmoozDemoUnits = { buildGroupsFromAnchors: function () { return []; } };
global.window.RmoozFreeFightAI = null;

var PLANNER = require(path.join(__dirname, 'UI_MOdified/server/ai/free-fight-coa-planner.js'));

// fetch mock → serve a REAL planner plan for the requested side/state.
var _fetchBodies = [];
global.window.fetch = function (url, opts) {
    var body = JSON.parse(opts.body);
    _fetchBodies.push(body);
    return PLANNER.planCoas(body.units, body.objectives, body.context, body.opts).then(function (plan) {
        // Client uses _fetchJsonSafe (reads .text() first), so expose both.
        var s = JSON.stringify(plan);
        return { ok: true, status: 200, statusText: 'OK',
                 text: function () { return Promise.resolve(s); },
                 json: function () { return Promise.resolve(plan); } };
    });
};

require(path.join(__dirname, 'UI_MOdified/client/shell/free-fight-demo-ai-panel.js'));
require(path.join(__dirname, 'UI_MOdified/client/shell/free-fight-demo.js'));
var DEMO = global.window.RmoozFreeFightDemo;

var PAYLOAD = { brief: { operational_brief: { proposed_units: [], objectives: [{ label: 'Objective X', lat: 34.95, lon: 48.95 }], placement_candidates: [{ type: 'base', lat: 34.5, lon: 48.5, name: 'AB' }] } } };

function mkUnits(n, side) {
    var u = [];
    for (var i = 0; i < n; i++) {
        var lat = 34.5 + i * 0.012, lon = 48.5 + i * 0.012;
        u.push({ uid: side[0] + '-' + String(i + 1).padStart(3, '0'), side: side, lat: lat, lon: lon, coord: [lon, lat] });
    }
    return u;
}
function makeScenario() {
    return {
        red_units: mkUnits(12, 'RED'),
        blue_units_initial: mkUnits(8, 'BLUE'),
        obj: { name: 'Objective X', coord: [48.95, 34.95] },
    };
}
function freshMount() {
    elById = {}; bodyEl.children = []; sessionStorage._data = {};
    _drawCalls = []; _panToCalls = []; _eventLog = []; _timeouts = []; _intervals = []; _fetchBodies = [];
    global.window.RmoozScenario = { scenario: makeScenario() };
    DEMO._resetWinStateForTest();
    DEMO.clear();
    DEMO.mount(PAYLOAD);
}
// Build a real plan for the current active side, as the loop would.
function planForCurrentSide() {
    var body = DEMO._buildLoopRequestBodyForTest();
    return PLANNER.planCoas(body.units, body.objectives, body.context, body.opts);
}

(async function main() {
    // ── §1 Start loop sets _loopRunning=true ─────────────────────────────────
    console.log('\n§1  Start loop sets _loopRunning=true');
    freshMount();
    DEMO._startLoopForTest();
    var st1 = DEMO._getLoopStateForTest();
    ok('§1 _loopRunning=true after start', st1.running === true);
    ok('§1 not paused after start', st1.paused === false);
    await flush();

    // ── §2 Pause sets _loopPaused + clears pending timer ─────────────────────
    console.log('\n§2  Pause stops scheduling next turn');
    freshMount();
    DEMO._startLoopForTest();
    await flush(); // first turn fetch resolves, schedules a next-turn timeout
    var hadPending = _timeouts.length > 0;
    DEMO._pauseLoopForTest();
    var st2 = DEMO._getLoopStateForTest();
    ok('§2 a next-turn timer was scheduled while running', hadPending);
    ok('§2 _loopPaused=true after pause', st2.paused === true);
    ok('§2 pending timer cleared on pause', _timeouts.length === 0);

    // ── §3 Step Once runs exactly one turn ───────────────────────────────────
    console.log('\n§3  Step Once runs exactly one turn');
    freshMount();
    DEMO._stepOnceForTest();
    await flush();
    var st3 = DEMO._getLoopStateForTest();
    ok('§3 turn incremented to 1', st3.turn === 1, 'turn=' + st3.turn);
    ok('§3 loop not left running after a single step', st3.running === false);
    ok('§3 no next-turn timer scheduled by step', _timeouts.length === 0);

    // ── §4 Each turn builds request with current scenario state ──────────────
    console.log('\n§4  Each turn builds request with current scenario state');
    freshMount();
    var body4 = DEMO._buildLoopRequestBodyForTest();
    ok('§4 request has context.turn_number', body4.context && typeof body4.context.turn_number === 'number');
    ok('§4 request has context.active_side', body4.context && body4.context.active_side === 'RED');
    ok('§4 request has current_objective_pressure', body4.context && typeof body4.context.current_objective_pressure === 'number');
    ok('§4 request carries units', Array.isArray(body4.units) && body4.units.length > 0);
    ok('§4 opts.preferSide follows active side', body4.opts && body4.opts.preferSide === 'RED');

    // ── §5 Auto-picks the recommended COA ────────────────────────────────────
    console.log('\n§5  Auto-picks the recommended COA');
    freshMount();
    var plan5 = await planForCurrentSide();
    var recIdx = DEMO._pickRecommendedIdxForTest(plan5);
    ok('§5 recommended index resolves', recIdx >= 0 && recIdx < plan5.coas.length);
    ok('§5 picked COA is the recommended one', plan5.coas[recIdx].plan_id === plan5.recommended_plan_id);

    // ── §6 Applies multiple real unit movements ──────────────────────────────
    console.log('\n§6  Applies multiple real unit movements');
    freshMount();
    var plan6 = await planForCurrentSide();
    DEMO._runTurnCoreForTest(plan6, 0); // instant apply
    var moved6 = DEMO._getCoaMovedUnitsForTest();
    ok('§6 more than one unit moved', moved6.length > 1, 'moved=' + moved6.length);
    ok('§6 moved units have a recorded oldPos', moved6.every(function (m) { return m.oldPos && Number.isFinite(m.oldPos.lat); }));
    ok('§6 drawScenario redraw bridge fired', _drawCalls.length > 0);

    // ── §7 Turn number increments across turns ───────────────────────────────
    console.log('\n§7  Turn number increments across turns');
    freshMount();
    var pA = await planForCurrentSide(); DEMO._runTurnCoreForTest(pA, 0);
    var pB = await planForCurrentSide(); DEMO._runTurnCoreForTest(pB, 0);
    var st7 = DEMO._getLoopStateForTest();
    ok('§7 turn === 2 after two turns', st7.turn === 2, 'turn=' + st7.turn);
    ok('§7 turn log has 2 records', DEMO._getTurnLogForTest().length === 2);

    // ── §8 Active side alternates RED → BLUE → RED ───────────────────────────
    console.log('\n§8  Active side alternates RED/BLUE');
    freshMount();
    var sideStart = DEMO._getLoopStateForTest().side;
    var p8a = await planForCurrentSide(); DEMO._runTurnCoreForTest(p8a, 0);
    var sideAfter1 = DEMO._getLoopStateForTest().side;
    var p8b = await planForCurrentSide(); DEMO._runTurnCoreForTest(p8b, 0);
    var sideAfter2 = DEMO._getLoopStateForTest().side;
    ok('§8 starts RED', sideStart === 'RED');
    ok('§8 switches to BLUE after turn 1', sideAfter1 === 'BLUE');
    ok('§8 switches back to RED after turn 2', sideAfter2 === 'RED');
    var log8 = DEMO._getTurnLogForTest();
    ok('§8 turn 1 was RED, turn 2 was BLUE', log8[0].side === 'RED' && log8[1].side === 'BLUE');

    // ── §9 Event log records each turn ───────────────────────────────────────
    console.log('\n§9  Event log records each turn');
    freshMount();
    var p9 = await planForCurrentSide(); DEMO._runTurnCoreForTest(p9, 0);
    var cmdrEntries = _eventLog.filter(function (e) { return /AI Commander Turn/.test(e.message || ''); });
    ok('§9 an AI Commander Turn entry was logged', cmdrEntries.length >= 1);
    ok('§9 entry names the side + COA', cmdrEntries.length >= 1 && /RED|BLUE/.test(cmdrEntries[0].message) && /COA-/.test(cmdrEntries[0].message));

    // ── §10 LLM failure → deterministic fallback, turn still applies ─────────
    console.log('\n§10  LLM failure falls back to deterministic and continues');
    freshMount();
    var body10 = DEMO._buildLoopRequestBodyForTest();
    // useLlm on, but RMOOZ_FREE_FIGHT_LLM not set → planner returns deterministic fallback
    var plan10 = await PLANNER.planCoas(body10.units, body10.objectives, body10.context, { preferSide: 'RED', useLlm: true, allowed_unit_ids: body10.opts.allowed_unit_ids });
    ok('§10 plan_source is deterministic_coa_fallback', plan10.plan_source === 'deterministic_coa_fallback');
    DEMO._runTurnCoreForTest(plan10, 0);
    ok('§10 turn still applied on fallback', DEMO._getLoopStateForTest().turn === 1);
    ok('§10 units still moved on fallback', DEMO._getCoaMovedUnitsForTest().length > 0);

    // ── §11 Reset restores moved units + resets turn/side ────────────────────
    console.log('\n§11  Reset clears timers, restores units, resets turn/side');
    freshMount();
    var redBefore = global.window.RmoozScenario.scenario.red_units.map(function (u) { return u.coord.slice(); });
    DEMO._stepOnceForTest();
    await flush();
    var movedDuring = DEMO._getCoaMovedUnitsForTest().length;
    DEMO._resetLoopForTest();
    var st11 = DEMO._getLoopStateForTest();
    var redAfter = global.window.RmoozScenario.scenario.red_units.map(function (u) { return u.coord.slice(); });
    var restored = redBefore.every(function (c, i) { return Math.abs(c[0] - redAfter[i][0]) < 1e-9 && Math.abs(c[1] - redAfter[i][1]) < 1e-9; });
    ok('§11 a step moved at least one unit', movedDuring > 0);
    ok('§11 turn reset to 0', st11.turn === 0);
    ok('§11 active side reset to RED', st11.side === 'RED');
    ok('§11 loop not running after reset', st11.running === false);
    ok('§11 all RED unit coords restored', restored);
    ok('§11 turn log cleared', DEMO._getTurnLogForTest().length === 0);

    // ── §12 Commander Reasoning panel renders after a turn ───────────────────
    console.log('\n§12  Right-side AI Commander Reasoning panel renders');
    freshMount();
    var p12 = await planForCurrentSide(); DEMO._runTurnCoreForTest(p12, 0);
    var cmdrPanel = elById['rmooz-free-fight-commander-panel'];
    ok('§12 commander panel element created', !!cmdrPanel);
    ok('§12 panel titled "AI Commander Reasoning"', cmdrPanel && /AI Commander Reasoning/.test(cmdrPanel.innerHTML));
    ok('§12 panel shows the turn + selected COA', cmdrPanel && /Turn:/.test(cmdrPanel.innerHTML) && /Selected COA:/.test(cmdrPanel.innerHTML));

    // ── §13 Objective X is never moved by the loop ───────────────────────────
    console.log('\n§13  Objective X unchanged by the loop');
    freshMount();
    var objBefore = global.window.RmoozScenario.scenario.obj.coord.slice();
    var p13a = await planForCurrentSide(); DEMO._runTurnCoreForTest(p13a, 0);
    var p13b = await planForCurrentSide(); DEMO._runTurnCoreForTest(p13b, 0);
    var objAfter = global.window.RmoozScenario.scenario.obj.coord.slice();
    ok('§13 objective coord unchanged', objBefore[0] === objAfter[0] && objBefore[1] === objAfter[1]);

    // ── §14 clear() tears down loop timers and state ─────────────────────────
    console.log('\n§14  clear() tears down loop timers and state');
    freshMount();
    DEMO._startLoopForTest();
    await flush();
    DEMO.clear();
    var st14 = DEMO._getLoopStateForTest();
    ok('§14 loop not running after clear', st14.running === false);
    ok('§14 turn reset after clear', st14.turn === 0);
    ok('§14 no pending timers after clear', _timeouts.length === 0 && _intervals.length === 0);

    console.log('\n' + '─'.repeat(52));
    console.log('PASS: ' + PASS + '  FAIL: ' + FAIL + '  TOTAL: ' + (PASS + FAIL));
    if (FAIL > 0) process.exit(1);
})();
