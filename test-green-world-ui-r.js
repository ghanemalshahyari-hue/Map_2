/**
 * test-green-world-ui-r.js — RMOOZ-GREEN-WORLD-UI-R
 *
 * Surfaces the deterministic Green World layer in the Free Fight UI + a toggleable map ring, with
 * refresh hooks after deep plan / commit / phase advance / replan — WITHOUT changing combat,
 * adjudication, the no-LLM normal-tick guarantee, or calling /plan-coas.
 *
 * Acceptance:
 *  1 Green panel renders the deterministic output (all fields + provenance + "summarizer off" note)
 *  2 manual Green refresh hits /neutral-world and NOT /plan-coas / chat-completions / generate
 *  3 the map ring overlay toggles on/off (layer added then removed)
 *  4 COA commit refreshes Green (a /neutral-world fetch)
 *  5 phase advance refreshes Green; that tick is still llm_called_this_tick=false
 *  6 a normal (non-advancing) tick does NOT refresh Green and is llm_called_this_tick=false
 *  7 the event log receives Green entries (assessed + collateral-risk-changed)
 *  8 Staff-Safe planning mode is unaffected; Green stays deterministic (no /plan-coas)
 */
'use strict';
var assert = require('assert');
var path = require('path');

var elById = {};
function makeEl(t) {
    var el = { tagName: t, id: '', className: '', innerHTML: '', textContent: '', children: [], attrs: {}, style: {},
        appendChild: function (e) { this.children.push(e); if (e && e.id) elById[e.id] = e; return e; },
        removeChild: function () {}, setAttribute: function (k, v) { this.attrs[k] = v; }, removeAttribute: function () {},
        addEventListener: function () {}, removeEventListener: function () {},
        querySelector: function () { return null; }, querySelectorAll: function () { return []; }, getAttribute: function (k) { return this.attrs[k]; } };
    Object.defineProperty(el, 'parentNode', { value: null, writable: true });
    return el;
}
global.document = { body: makeEl('body'), head: makeEl('head'), createElement: makeEl, getElementById: function (id) { return elById[id] || null; }, querySelector: function () { return null; }, dispatchEvent: function () {} };
global.CustomEvent = function (n, o) { this.type = n; this.detail = o && o.detail; };

// recording fetch — routes by URL; /neutral-world returns _nextGreen.
var fetchCalls = [];
var _nextGreen = null;
function resp(o) { var s = JSON.stringify(o); return Promise.resolve({ ok: true, status: 200, text: function () { return Promise.resolve(s); }, json: function () { return Promise.resolve(o); } }); }
function greenAssessment(over) {
    return Object.assign({ ok: true, population_band: 'high',
        collateral_risk: { band: 'high', score: 83, drivers: ['high population density (terrain: urban)', '2 unit(s) within 8km of the objective'] },
        road_status: { status: 'constrained', basis: 'choke point on the approach axis' },
        infra_status: { note: 'urban infrastructure likely in the engagement area', provenance: 'inferred_terrain_class' },
        host_nation: 'Atropia', neutral_reaction_score: 85, units_near_objective: 2, force_concentration_pct: 100,
        notes: ['Collateral risk high (83/100).', 'Movement: roads constrained.'], provenance: { engine: 'deterministic' },
        review_only: true, deterministic: true, llm_used: false }, over || {});
}
global.window = {
    document: global.document, AppShellEventLog: { append: function (o) { _eventLog.push(o && o.message != null ? o.message : ''); } },
    sessionStorage: (function () { var d = {}; return { getItem: function (k) { return d[k] || null; }, setItem: function (k, v) { d[k] = String(v); }, removeItem: function (k) { delete d[k]; } }; })(),
    setTimeout: function (fn) { return setTimeout(fn, 0); }, clearTimeout: function (id) { clearTimeout(id); }, setInterval: function () { return 0; }, clearInterval: function () {},
    fetch: function (url, opts) { fetchCalls.push({ url: String(url), opts: opts }); var u = String(url);
        if (/neutral-world/.test(u)) return resp(_nextGreen || greenAssessment());
        return resp({ ok: false }); },
};
global.window.window = global.window;
var _eventLog = [];

var CL = path.join(__dirname, 'UI_MOdified', 'client', 'shell');
require(path.join(CL, 'world-state-db.js'));
require(path.join(CL, 'symbol-db.js'));
require(path.join(CL, 'symbol-registry.js'));
require(path.join(CL, 'free-fight-demo.js'));
var DEMO = global.window.RmoozFreeFightDemo;

var pass = 0, fail = 0;
function ok(n) { pass++; console.log('  ✓ ' + n); }
function bad(n, e) { fail++; console.log('  ✗ ' + n + (e ? (' — ' + (e && e.message || e)) : '')); }
function flush() { return new Promise(function (r) { setTimeout(r, 5); }); }
function hasNeutral() { return fetchCalls.some(function (c) { return /neutral-world/.test(c.url); }); }
function hasPlanOrLlm() { return fetchCalls.some(function (c) { return /plan-coas|chat\/completions|api\/ai\/(generate|model)/.test(c.url); }); }
function scenario() { global.window.RmoozScenario = { scenario: {
    red_units: [{ id: 'R-1', side: 'RED', lat: 24.451, lon: 54.401 }, { id: 'R-2', side: 'RED', lat: 24.452, lon: 54.402 }],
    blue_units_initial: [{ id: 'B-1', side: 'BLUE', lat: 24.6, lon: 54.6 }], obj: { name: 'Objective X', coord: [54.40, 24.45] } } }; }
function holdPlan() { return { ok: true, plan_source: 'llm', recommended_plan_id: 'COA-1',
    coas: [{ plan_id: 'COA-1', recommended: true, side: 'RED', phases: [
        { actions: [{ unit_uid: 'R-1', action_type: 'HOLD_POSITION' }] },
        { actions: [{ unit_uid: 'R-1', action_type: 'HOLD_POSITION' }] }] }] }; }
function moveFarPlan() { return { ok: true, plan_source: 'llm', recommended_plan_id: 'COA-1',
    coas: [{ plan_id: 'COA-1', recommended: true, side: 'RED', phases: [
        { actions: [{ unit_uid: 'R-1', action_type: 'MOVE', target: { lat: 30.0, lon: 60.0 } }] }] }] }; }

(async function () {
    scenario();
    DEMO.mount({ brief: { operational_brief: { proposed_units: [], objectives: [{ label: 'Objective X', lat: 24.45, lon: 54.40 }] } } });
    DEMO.setObjective({ lat: 24.45, lon: 54.40 });

    // 1 — panel renders deterministic output.
    try {
        var html = DEMO._greenWorldHtmlForTest(greenAssessment());
        ['Civilian / collateral risk', 'Road status', 'Infrastructure', 'Host-nation pressure', 'Neutral reaction score', 'provenance', '83/100', 'Atropia'].forEach(function (s) { assert.ok(html.indexOf(s) !== -1, 'panel shows "' + s + '"'); });
        assert.ok(/deterministic note · summarizer off/.test(html), 'shows deterministic-note / summarizer-off label (req #9)');
        assert.ok(/data-act="green-refresh"/.test(html) && /data-act="green-overlay-toggle"/.test(html), 'has Refresh + overlay toggle controls');
        ok('Green panel renders deterministic output + provenance + summarizer-off note');
    } catch (e) { bad('panel render', e); }

    // 2 — manual refresh → /neutral-world, never /plan-coas.
    try {
        fetchCalls.length = 0; _nextGreen = greenAssessment();
        await DEMO._refreshGreenWorldForTest('manual'); await flush();
        assert.ok(hasNeutral(), 'manual refresh hit /neutral-world');
        assert.ok(!hasPlanOrLlm(), 'manual refresh did NOT call /plan-coas or any LLM route');
        assert.ok(DEMO._getGreenWorldForTest() && DEMO._getGreenWorldForTest().collateral_risk, 'assessment stored');
        ok('manual Green refresh calls /neutral-world, not /plan-coas / LLM');
    } catch (e) { bad('manual refresh', e); }

    // 3 — overlay toggles on/off (needs a Leaflet stub → mapReady true).
    try {
        global.window.L = { layerGroup: function () { return { _l: [], addLayer: function (x) { this._l.push(x); }, addTo: function (m) { m._has = this; return this; } }; },
            circle: function (ll, o) { return { ll: ll, o: o }; } };
        global.window.map = { _has: null, hasLayer: function (l) { return this._has === l; }, removeLayer: function (l) { if (this._has === l) this._has = null; }, addLayer: function () {} };
        DEMO._setGreenWorldForTest(greenAssessment());
        var on = DEMO._toggleGreenOverlayForTest();
        assert.ok(on === true && DEMO._getGreenLayerForTest() && global.window.map._has, 'overlay ON → ring layer added to map');
        var off = DEMO._toggleGreenOverlayForTest();
        assert.ok(off === false && DEMO._getGreenLayerForTest() == null && global.window.map._has == null, 'overlay OFF → ring layer removed');
        delete global.window.L; delete global.window.map;
        ok('Green map ring overlay toggles on/off');
    } catch (e) { bad('overlay toggle', e); }

    // 4 — COA commit refreshes Green.
    try {
        DEMO._setCoaPlanForTest(holdPlan());
        fetchCalls.length = 0; _nextGreen = greenAssessment();
        DEMO._commitCoaForTest(0); await flush(); await flush();
        assert.ok(hasNeutral(), 'commit triggered a /neutral-world refresh');
        assert.ok(!hasPlanOrLlm(), 'commit refresh did NOT call /plan-coas / LLM');
        ok('COA commit refreshes Green (deterministic)');
    } catch (e) { bad('commit refresh', e); }

    // 5 — phase advance refreshes Green; tick still no-LLM.
    try {
        fetchCalls.length = 0; _nextGreen = greenAssessment();
        var t = DEMO._coaExecTickForTest();   // phase-0 HOLD completes → advance → green('phase_advance')
        await flush(); await flush();
        assert.ok(hasNeutral(), 'phase advance triggered a /neutral-world refresh');
        assert.strictEqual(t.llm_called_this_tick, false, 'phase-advance tick is llm_called_this_tick=false');
        assert.ok(!hasPlanOrLlm(), 'phase-advance tick did NOT call /plan-coas / LLM');
        ok('phase advance refreshes Green; tick stays no-LLM');
    } catch (e) { bad('phase advance refresh', e); }

    // 6 — a normal (non-advancing) tick does NOT refresh Green + no-LLM.
    try {
        DEMO._resetCoaExecForTest(); scenario(); DEMO._setCoaPlanForTest(moveFarPlan()); DEMO._commitCoaForTest(0); await flush();
        fetchCalls.length = 0;
        var t2 = DEMO._coaExecTickForTest();   // MOVE toward a far target → not reached → no advance
        await flush();
        assert.strictEqual(t2.llm_called_this_tick, false, 'normal tick llm_called_this_tick=false');
        assert.ok(!hasNeutral(), 'non-advancing tick did NOT refresh Green');
        assert.ok(!hasPlanOrLlm(), 'non-advancing tick made no /plan-coas / LLM call');
        ok('normal (non-advancing) committed tick: no Green refresh, no LLM');
    } catch (e) { bad('normal tick', e); }

    // 7 — event log receives Green entries (assessed + collateral changed).
    try {
        _eventLog.length = 0;
        DEMO._setGreenWorldForTest(null);
        _nextGreen = greenAssessment({ collateral_risk: { band: 'low', score: 20, drivers: ['low'] } });
        await DEMO._refreshGreenWorldForTest('manual'); await flush();
        _nextGreen = greenAssessment({ collateral_risk: { band: 'high', score: 83, drivers: ['high'] } });
        await DEMO._refreshGreenWorldForTest('manual'); await flush();
        assert.ok(_eventLog.some(function (m) { return /^Green World assessed/.test(m); }), 'logged "Green World assessed"');
        assert.ok(_eventLog.some(function (m) { return /collateral risk changed: low → high/.test(m); }), 'logged collateral-risk change');
        ok('event log receives Green entries (assessed + risk changed)');
    } catch (e) { bad('event log', e); }

    // 8 — Staff-Safe unaffected; Green still deterministic.
    try {
        DEMO._setPlanningModeForTest('staff_safe');
        assert.strictEqual(DEMO._getPlanningModeForTest(), 'staff_safe', 'Staff-Safe mode set + unchanged');
        fetchCalls.length = 0; _nextGreen = greenAssessment();
        await DEMO._refreshGreenWorldForTest('manual'); await flush();
        assert.ok(hasNeutral() && !hasPlanOrLlm(), 'Green refresh stays deterministic under Staff-Safe');
        ok('Staff-Safe unchanged; Green stays deterministic');
    } catch (e) { bad('staff-safe', e); }

    console.log('\n' + (fail === 0 ? '✅ ' : '❌ ') + pass + ' passed, ' + fail + ' failed (test-green-world-ui-r.js)');
    process.exit(fail === 0 ? 0 : 1);
})().catch(function (e) { console.error('FATAL', e); process.exit(1); });
