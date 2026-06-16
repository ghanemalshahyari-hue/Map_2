/**
 * test-ai-free-fight-ai-only-a.js — RMOOZ-AI-FREE-FIGHT-AI-ONLY-A
 *
 * The "AI Commander Free Fight" card is AI-ONLY: no LLM ⇒ no movement. No deterministic / fallback /
 * fast / hardcoded planner movement may be applied or animated inside this card. Only a REAL LLM plan
 * (llm_called + plan_source==='llm' + llm_status ok + no fallback + provider/model + not fast) moves units.
 *
 * Acceptance:
 *  1 LLM toggle off → Start does NOT run the loop and moves NO unit (+ "requires a local LLM" message)
 *  2 Fast mode → Start blocked (fast skips the LLM)
 *  3 Route health llm_enabled=false → Start blocked
 *  4 Per-turn gate: a deterministic_diverse_coa plan is NEVER applied — turn skipped, no movement,
 *    loop paused, log "AI turn skipped — LLM not used"
 *  5 A real LLM plan (plan_source=llm, llm_called, llm_status ok) DOES move units
 *  6 Step Once with LLM disabled moves no unit
 *  7 _freeFightAiReady predicate gates on toggle / depth / route-health
 *
 * Drives the LIVE loop (startLoop / stepOnce / runNextTurn) with the AI-only gate ON (default).
 */
'use strict';
var assert = require('assert');
var path = require('path');

// ── DOM / window / timers stub (loop driver harness) ──
var elById = {};
function makeEl(t) {
    var el = { tagName: t, id: '', className: '', innerHTML: '', textContent: '', children: [], attrs: {}, style: {},
        appendChild: function (e) { this.children.push(e); if (e && e.id) elById[e.id] = e; return e; },
        removeChild: function (e) { var i = this.children.indexOf(e); if (i >= 0) this.children.splice(i, 1); if (e && e.id) delete elById[e.id]; return e; },
        setAttribute: function (k, v) { this.attrs[k] = v; }, removeAttribute: function (k) { delete this.attrs[k]; },
        addEventListener: function () {}, removeEventListener: function () {},
        querySelector: function () { return null; }, querySelectorAll: function () { return []; },
        getAttribute: function (k) { return this.attrs[k]; } };
    Object.defineProperty(el, 'parentNode', { value: null, writable: true });
    return el;
}
var bodyEl = makeEl('body');
global.document = { body: bodyEl, head: makeEl('head'), createElement: makeEl,
    getElementById: function (id) { return elById[id] || null; }, querySelector: function () { return null; } };
var _eventLog = [];
global.window = {
    document: global.document,
    AppShellEventLog: { append: function (o) { _eventLog.push(o && o.message != null ? o.message : ''); } },
    sessionStorage: (function () { var d = {}; return { getItem: function (k) { return d[k] || null; }, setItem: function (k, v) { d[k] = String(v); }, removeItem: function (k) { delete d[k]; } }; })(),
    setTimeout: function () { return 0; }, clearTimeout: function () {}, // swallow scheduling → deterministic
    setInterval: function () { return 0; }, clearInterval: function () {},
    fetch: null,
};
global.window.window = global.window;

var UI = path.join(__dirname, 'UI_MOdified');
var CLIENT = path.join(UI, 'client', 'shell'), AI = path.join(UI, 'server', 'ai');
var PLANNER = require(path.join(AI, 'free-fight-coa-planner.js'));

// fetch stub → serve whatever plan _planFactory builds for the request.
var _planFactory = null;
global.window.fetch = function (url, opts) {
    var body = JSON.parse(opts.body);
    return Promise.resolve(_planFactory(body)).then(function (plan) {
        var s = JSON.stringify(plan);
        return { ok: true, status: 200, statusText: 'OK', text: function () { return Promise.resolve(s); }, json: function () { return Promise.resolve(plan); } };
    });
};

require(path.join(CLIENT, 'world-state-db.js'));
require(path.join(CLIENT, 'symbol-db.js'));
require(path.join(CLIENT, 'symbol-registry.js'));
require(path.join(CLIENT, 'free-fight-demo.js'));
var DEMO = global.window.RmoozFreeFightDemo;

var pass = 0, fail = 0;
function ok(n) { pass++; console.log('  ✓ ' + n); }
function bad(n, e) { fail++; console.log('  ✗ ' + n + (e ? (' — ' + (e && e.message || e)) : '')); }
function flush() { return new Promise(function (res) { setTimeout(res, 0); }); } // node setTimeout (real)

function mkUnits(n, side) {
    var u = [];
    for (var i = 0; i < n; i++) { var lat = 24.5 + i * 0.02, lon = 54.5 + i * 0.02; u.push({ id: side[0] + '-' + (i + 1), side: side, lat: lat, lon: lon, coord: [lon, lat] }); }
    return u;
}
function freshScenario() {
    global.window.RmoozScenario = { scenario: { red_units: mkUnits(6, 'RED'), blue_units_initial: mkUnits(4, 'BLUE'), obj: { name: 'Objective X', coord: [54.4, 24.45] } } };
}
function snapshotRed() { return global.window.RmoozScenario.scenario.red_units.map(function (u) { return u.lat + ',' + u.lon; }).join('|'); }
function anyMoved(before) { return snapshotRed() !== before; }

// plan builders
function detPlanFor(body) { // gate allowed but the LLM produced nothing usable → deterministic
    return PLANNER.planCoas(body.units, body.objectives, body.context, body.opts).then(function (p) {
        p.plan_source = 'deterministic_diverse_coa'; p.llm_called = true; p.llm_status = 'unavailable';
        p.fallback_reason = 'local_llm_unavailable'; p.provider_used = null; p.model_used = null;
        p.allow_sim_run = true; p.llm_enabled = true; // gate ON, but no usable LLM result
        return p;
    });
}
function llmPlanFor(body) { // a REAL LLM plan (real coas, LLM markers)
    return PLANNER.planCoas(body.units, body.objectives, body.context, body.opts).then(function (p) {
        p.plan_source = 'llm'; p.llm_called = true; p.llm_status = 'ok'; p.fallback_reason = null;
        p.provider_used = 'ollama'; p.model_used = 'qwen3-coder:latest'; p.allow_sim_run = true; p.llm_enabled = true; p.ai_depth = 'normal';
        return p;
    });
}

// RMOOZ-AI-EXECUTION-SINGLE-GATE-A: the single gate is RMOOZ_ALLOW_SIM_RUN (surfaced on route health
// as allow_sim_run + model_available). The LLM toggle is NOT a gate anymore — the loop always requests
// the LLM. These route-health fixtures drive the three states.
var RH_DISABLED = { ok: true, allow_sim_run: false, ai_execution_enabled: false, model_available: false, reason_if_blocked: 'RMOOZ_ALLOW_SIM_RUN is not enabled', provider: 'ollama', model: 'qwen3-coder:latest' };
var RH_NO_MODEL = { ok: true, allow_sim_run: true, ai_execution_enabled: true, model_available: false, reason_if_blocked: 'model "qwen3-coder:latest" is not loaded in the local provider', provider: 'ollama', model: 'qwen3-coder:latest' };
var RH_READY = { ok: true, allow_sim_run: true, ai_execution_enabled: true, model_available: true, reason_if_blocked: null, provider: 'ollama', model: 'qwen3-coder:latest' };
// RMOOZ-FREE-FIGHT-AI-GATE-CARD-D: the exec-gate fix message now reads "Set RMOOZ_ALLOW_SIM_RUN=1
// and restart the server." (the spec-exact wording; _freeFightAiReady composes it from _aiBlockReasons).
var DISABLED_MSG = /AI execution is disabled\. Set RMOOZ_ALLOW_SIM_RUN=1 and restart the server\./;
// RMOOZ-AI-USER-FRIENDLY-MODEL-FLOW-A: the no-model operator text is now the simple, action-oriented
// "Choose an AI model to start." (the old provider/env jargon moved under Advanced diagnostics).
var NO_MODEL_MSG = /Choose an AI model to start\./;

function reset(routeHealth, depth) {
    elById = {}; bodyEl.children = []; _eventLog.length = 0;
    freshScenario();
    DEMO._resetWinStateForTest();
    DEMO.clear();
    DEMO.mount({ brief: { operational_brief: { proposed_units: [], objectives: [{ label: 'Objective X', lat: 24.45, lon: 54.4 }] } } });
    DEMO._setAiOnlyGateForTest(true);           // enforce (the live behavior)
    DEMO._setCommanderModeForTest('high_variation');
    DEMO._setAiDepthForTest(depth || 'normal');
    DEMO._setRouteHealthForTest(routeHealth || null);
}

async function main() {
    // 1 — RMOOZ_ALLOW_SIM_RUN off → no run, no movement, "AI execution is disabled" + no old flag.
    try {
        reset(RH_DISABLED, 'normal');
        var before = snapshotRed();
        DEMO._startLoopForTest(); await flush(); await flush();
        assert(DEMO._getLoopStateForTest().running === false, 'loop did NOT start');
        assert(!anyMoved(before), 'no unit moved');
        var msg1 = DEMO._getAiUnavailableMsgForTest() || '';
        assert(DISABLED_MSG.test(msg1), 'shows "AI execution is disabled. Enable RMOOZ_ALLOW_SIM_RUN=1."');
        assert(msg1.indexOf('RMOOZ_FREE_FIGHT' + '_LLM') === -1, 'message does NOT mention the old (deprecated) free-fight flag');
        assert(_eventLog.some(function (m) { return /not started/.test(m); }), 'event log explains it');
        ok('RMOOZ_ALLOW_SIM_RUN off → Start does not run, moves no unit (+ "AI execution is disabled")');
    } catch (e) { bad('gate off → no run / no movement / message', e); }

    // 2 — Fast mode → blocked.
    try {
        reset(RH_READY, 'fast');
        var before2 = snapshotRed();
        DEMO._startLoopForTest(); await flush();
        assert(DEMO._getLoopStateForTest().running === false, 'loop blocked in fast mode');
        assert(!anyMoved(before2), 'no unit moved (fast)');
        var rdy = DEMO._freeFightAiReadyForTest();
        assert(rdy.ok === false && /fast/i.test(rdy.reason), 'reason mentions fast');
        ok('Fast mode → Start blocked (fast skips the LLM)');
    } catch (e) { bad('Fast mode → Start blocked', e); }

    // 3 — Gate ON but no local model → blocked + "no local LLM/model" message.
    try {
        reset(RH_NO_MODEL, 'normal');
        var before3 = snapshotRed();
        DEMO._startLoopForTest(); await flush();
        assert(DEMO._getLoopStateForTest().running === false, 'loop blocked (model_available=false)');
        assert(!anyMoved(before3), 'no unit moved (no model)');
        assert(NO_MODEL_MSG.test(DEMO._getAiUnavailableMsgForTest() || ''), 'shows the "no local LLM/model" message');
        ok('RMOOZ_ALLOW_SIM_RUN on but no local model → Start blocked + no-model message');
    } catch (e) { bad('gate on but no model → Start blocked', e); }

    // 4 — Per-turn gate: a deterministic plan is NEVER applied (turn skipped, no movement, paused).
    try {
        reset(RH_READY, 'normal');     // pre-gate passes; per-turn gate must catch the non-LLM plan
        _planFactory = detPlanFor;
        var before4 = snapshotRed();
        DEMO._startLoopForTest(); await flush(); await flush();
        assert(!anyMoved(before4), 'deterministic plan moved NO unit');
        assert(_eventLog.some(function (m) { return /^AI turn skipped — LLM not used/.test(m); }), 'logged "AI turn skipped — LLM not used"');
        assert(DEMO._getLoopStateForTest().paused === true, 'loop paused after the skipped (non-LLM) turn');
        assert(NO_MODEL_MSG.test(DEMO._getAiUnavailableMsgForTest() || ''), 'no-model message set (gate on, no usable LLM)');
        ok('deterministic_diverse_coa turn is skipped — no movement, loop paused, "LLM not used" logged');
    } catch (e) { bad('deterministic turn skipped — no movement', e); }

    // 5 — A real LLM plan DOES move units.
    try {
        reset(RH_READY, 'normal');
        _planFactory = llmPlanFor;
        var before5 = snapshotRed();
        DEMO._startLoopForTest(); await flush(); await flush();
        assert(anyMoved(before5), 'real LLM plan moved units');
        assert(_eventLog.some(function (m) { return /^AI Commander Turn/.test(m); }), 'logged an AI Commander Turn');
        assert(!_eventLog.some(function (m) { return /AI turn skipped/.test(m); }), 'no skip logged for the real LLM turn');
        ok('a real LLM plan (plan_source=llm, llm_called, llm_status ok) DOES move units');
    } catch (e) { bad('real LLM plan moves units', e); }

    // 6 — Step Once with the gate off moves no unit.
    try {
        reset(RH_DISABLED, 'normal');
        var before6 = snapshotRed();
        DEMO._stepOnceForTest(); await flush();
        assert(!anyMoved(before6), 'Step Once moved no unit with the gate off');
        assert(DISABLED_MSG.test(DEMO._getAiUnavailableMsgForTest() || ''), '"AI execution is disabled" message set on step');
        ok('Step Once with RMOOZ_ALLOW_SIM_RUN off moves no unit');
    } catch (e) { bad('Step Once with the gate off moves no unit', e); }

    // 7 — _freeFightAiReady predicate (gates on RMOOZ_ALLOW_SIM_RUN + model + depth, NOT the toggle).
    try {
        reset(RH_DISABLED, 'normal'); assert(DEMO._freeFightAiReadyForTest().ok === false, 'gate off → not ready');
        reset(RH_READY, 'fast'); assert(DEMO._freeFightAiReadyForTest().ok === false, 'fast → not ready');
        reset(RH_NO_MODEL, 'normal'); assert(DEMO._freeFightAiReadyForTest().ok === false, 'gate on + no model → not ready');
        reset(RH_READY, 'normal'); assert(DEMO._freeFightAiReadyForTest().ok === true, 'gate on + model + normal → ready');
        reset(null, 'deep'); assert(DEMO._freeFightAiReadyForTest().ok === true, 'route-unknown + deep → ready (per-turn gate still guards)');
        ok('_freeFightAiReady gates on RMOOZ_ALLOW_SIM_RUN / model_available / depth (not the LLM toggle)');
    } catch (e) { bad('_freeFightAiReady predicate', e); }

    console.log('\n' + (fail === 0 ? '✅ ' : '❌ ') + pass + ' passed, ' + fail + ' failed (test-ai-free-fight-ai-only-a.js)');
    process.exit(fail === 0 ? 0 : 1);
}
main().catch(function (e) { console.error('FATAL', e); process.exit(1); });
