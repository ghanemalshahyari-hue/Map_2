/**
 * test-ai-model-ready-live-a.js — RMOOZ-AI-MODEL-READY-LIVE-A
 *
 * The AI Free Fight card must become Ready the moment an AVAILABLE model is selected — no page
 * reload. After POST /api/ai/model/select the card force-refreshes BOTH /api/ai/models and the
 * route-health probe, then re-renders. If the SAVED runtime selection points to a missing model,
 * the status is the simple "Your saved model is not available. Choose another model." If Ollama is
 * off or the model is missing, a clear Needs-model message remains and Start stays disabled.
 *
 * Acceptance:
 *  1 select an installed model → state=ready, canStart=true, Start enabled, no reload
 *  2 route-health after select carries allow_sim_run=true, ai_execution_enabled=true, provider=ollama,
 *    selected_model=<model>, model_available=true
 *  3 force-refresh: after select, BOTH /api/ai/models AND the route-health probe are re-fetched
 *  4 saved runtime selection missing → "Your saved model is not available. Choose another model."
 *  5 Ollama down (no models) → "No AI model found…", canStart=false (Needs-model remains)
 *  6 env/default model missing (NOT a saved pick) → keeps the detailed #6 message, not the saved one
 *
 * Drives the REAL client flow (_selectModel → reconcile → _fetchModels + _probeRouteHealth) with a
 * stateful fetch stub mirroring the real server's buildModelsPayload + routeHealth.
 */
'use strict';
var assert = require('assert');
var path = require('path');

var elById = {};
function makeEl(t) {
    var el = { tagName: t, id: '', className: '', innerHTML: '', textContent: '', children: [], attrs: {}, style: {},
        appendChild: function (e) { this.children.push(e); if (e && e.id) elById[e.id] = e; return e; },
        removeChild: function (e) { var i = this.children.indexOf(e); if (i >= 0) this.children.splice(i, 1); return e; },
        setAttribute: function (k, v) { this.attrs[k] = v; }, removeAttribute: function (k) { delete this.attrs[k]; },
        addEventListener: function () {}, removeEventListener: function () {},
        querySelector: function () { return null; }, querySelectorAll: function () { return []; },
        getAttribute: function (k) { return this.attrs[k]; } };
    Object.defineProperty(el, 'parentNode', { value: null, writable: true });
    return el;
}
var bodyEl = makeEl('body');
global.document = { body: bodyEl, head: makeEl('head'), createElement: makeEl,
    getElementById: function (id) { return elById[id] || null; }, querySelector: function () { return null; },
    dispatchEvent: function () {} };
global.CustomEvent = function (n, o) { this.type = n; this.detail = o && o.detail; };

// ── stateful fetch stub mirroring the REAL server (buildModelsPayload + routeHealth) ──
var INSTALLED = ['gpt-oss:latest', 'qwen3-coder:latest'];
var SEL = 'qwen2.5:7b', SRC = 'default';
var CALLS = [];
function modelsPayload() {
    var avail = INSTALLED.indexOf(SEL) !== -1;
    var models = INSTALLED.map(function (n) { return { name: n, available: true }; });
    if (SEL && !avail) models.push({ name: SEL, available: false });
    return { ok: true, provider: 'ollama', configured_provider: 'ollama', is_cloud: false,
        cloud_allowed: false, cloud_enabled: false, selected_model: SEL, selection_source: SRC,
        allow_sim_run: true, provider_blocked: false, models: models,
        available_models_count: INSTALLED.length, model_available: avail, provider_reachable: INSTALLED.length > 0, error: null };
}
function healthPayload() {
    var avail = INSTALLED.indexOf(SEL) !== -1;
    return { ok: true, route: '/api/wargame-sim/free-fight/plan-coas', method: 'POST',
        planner: 'free-fight-coa-planner', local_only: true, allow_sim_run: true, ai_execution_enabled: true,
        reason_if_blocked: avail ? null : ('model "' + SEL + '" is not loaded in the local provider'),
        model_available: avail, available_models_count: INSTALLED.length, provider: 'ollama',
        provider_blocked: false, configured_provider: 'ollama', model: SEL, selected_model: SEL,
        selection_source: SRC, llm_enabled: true };
}
global.window = {
    document: global.document,
    AppShellEventLog: { append: function () {} },
    sessionStorage: (function () { var d = {}; return { getItem: function (k) { return d[k] || null; }, setItem: function (k, v) { d[k] = String(v); }, removeItem: function (k) { delete d[k]; } }; })(),
    setTimeout: function (fn) { return setTimeout(fn, 0); }, clearTimeout: function (id) { clearTimeout(id); },
    setInterval: function () { return 0; }, clearInterval: function () {},
    fetch: function (url, opts) {
        var u = String(url).split('?')[0];
        CALLS.push(u);
        var body; if (opts && opts.body) { try { body = JSON.parse(opts.body); } catch (_) {} }
        var payload;
        if (u === '/api/ai/model/select') { if (body && body.model) { SEL = String(body.model); SRC = 'runtime_selection'; } payload = modelsPayload(); }
        else if (u === '/api/ai/models') payload = modelsPayload();
        else if (u === '/api/wargame-sim/free-fight/plan-coas/health' || u === '/api/wargame-sim/free-fight/route-health') payload = healthPayload();
        else payload = { ok: true };
        var s = JSON.stringify(payload);
        return Promise.resolve({ ok: true, status: 200, statusText: 'OK', text: function () { return Promise.resolve(s); }, json: function () { return Promise.resolve(payload); } });
    },
};
global.window.window = global.window;

var CLIENT = path.join(__dirname, 'UI_MOdified', 'client', 'shell');
require(path.join(CLIENT, 'world-state-db.js'));
require(path.join(CLIENT, 'symbol-db.js'));
require(path.join(CLIENT, 'symbol-registry.js'));
require(path.join(CLIENT, 'free-fight-demo.js'));
var DEMO = global.window.RmoozFreeFightDemo;

var pass = 0, fail = 0;
function ok(n) { pass++; console.log('  ✓ ' + n); }
function bad(n, e) { fail++; console.log('  ✗ ' + n + (e ? (' — ' + (e && e.message || e)) : '')); }
function flush() { return new Promise(function (r) { setTimeout(r, 5); }); }

function resetStub(installed, sel, src) { INSTALLED = installed.slice(); SEL = sel; SRC = src; CALLS = []; }
async function mountFresh() {
    elById = {}; bodyEl.children = [];
    DEMO._resetWinStateForTest(); DEMO.clear();
    DEMO._setRouteHealthForTest(null); DEMO._setModelInfoForTest(null); DEMO._resetAutoSelectForTest();
    DEMO._setAiDepthForTest('normal');
    DEMO.mount({ brief: { operational_brief: { proposed_units: [], objectives: [{ label: 'Objective X', lat: 24.45, lon: 54.4 }] } } });
    await flush(); await flush();
}

async function main() {
    // 1+2+3 — select an installed model → Ready, route-health correct, force-refresh both endpoints.
    try {
        resetStub(['gpt-oss:latest', 'qwen3-coder:latest'], 'qwen2.5:7b', 'default');
        await mountFresh();
        var s0 = DEMO._modelFlowStatusForTest();
        assert(s0.state === 'needs_model' && s0.canStart === false, 'initial (default model not installed) is Needs-model');

        CALLS = [];
        await DEMO._selectModelForTest('gpt-oss:latest', 'ollama'); await flush(); await flush();

        var s1 = DEMO._modelFlowStatusForTest();
        assert(s1.state === 'ready' && s1.canStart === true, 'state=ready + canStart after selecting an installed model');
        assert(DEMO._freeFightAiReadyForTest().ok === true, '_freeFightAiReady → ok (Start enabled)');
        var rh = DEMO._getRouteHealthForTest() || {};
        assert(rh.allow_sim_run === true && rh.model_available === true, 'route-health allow_sim_run + model_available true');
        assert(rh.selected_model === 'gpt-oss:latest' && rh.provider === 'ollama', 'route-health selected_model + provider');
        ok('select installed model → Ready immediately, Start enabled, route-health correct (no reload)');

        // req #3: after select, BOTH /api/ai/models AND the route-health probe were re-fetched.
        assert(CALLS.indexOf('/api/ai/model/select') !== -1, 'POST /api/ai/model/select issued');
        assert(CALLS.indexOf('/api/ai/models') !== -1, 'force-refreshed /api/ai/models after select');
        assert(CALLS.indexOf('/api/wargame-sim/free-fight/plan-coas/health') !== -1, 'force-refreshed route-health after select');
        ok('force-refresh: select re-fetches /api/ai/models AND route-health, then re-renders');
    } catch (e) { bad('select → Ready + force-refresh', e); }

    // 4 — saved runtime selection missing → simple "choose another model" message.
    try {
        resetStub(['gpt-oss:latest', 'qwen3-coder:latest'], 'qwen3.6-plus:latest', 'runtime_selection');
        await mountFresh();
        var s = DEMO._modelFlowStatusForTest();
        assert(s.state === 'needs_model' && s.canStart === false, 'saved-missing → Needs-model, Start disabled');
        assert(s.message === 'Your saved model is not available. Choose another model.', 'exact req #4 message: ' + s.message);
        ok('saved runtime model missing → "Your saved model is not available. Choose another model."');
    } catch (e) { bad('saved-missing message', e); }

    // 5 — Ollama down (no installed models) → Needs-model remains.
    try {
        resetStub([], 'qwen2.5:7b', 'default');
        await mountFresh();
        var s = DEMO._modelFlowStatusForTest();
        assert(s.state === 'needs_model' && s.canStart === false, 'Ollama down → Needs-model, Start disabled');
        assert(/No AI model found/.test(s.message), 'Ollama-down message: ' + s.message);
        ok('Ollama off / no models → Needs-model message remains, Start disabled');
    } catch (e) { bad('Ollama down', e); }

    // 6 — env/default model missing (NOT a saved pick), 2+ installed so auto-select does NOT fire →
    // keeps the detailed #6 message (not the saved-model wording).
    try {
        resetStub(['gpt-oss:latest', 'qwen3-coder:latest'], 'qwen2.5:7b', 'default');
        await mountFresh();
        var s = DEMO._modelFlowStatusForTest();
        assert(s.state === 'needs_model', 'env-default missing (2+ installed) → Needs-model');
        assert(/is not installed/.test(s.message) && /installed local/.test(s.message), 'keeps the detailed installed-count message: ' + s.message);
        assert(s.message.indexOf('Your saved model') === -1, 'does NOT use the saved-model wording for an env/default model');
        ok('env/default model missing → keeps detailed message (not the saved-model one)');
    } catch (e) { bad('env-default missing keeps detail', e); }

    // 6b — exactly ONE installed local model → auto-selected → Ready (no operator action needed).
    try {
        resetStub(['qwen3-coder:latest'], 'qwen2.5:7b', 'default');
        await mountFresh();
        var s = DEMO._modelFlowStatusForTest();
        assert(s.state === 'ready' && s.canStart === true, 'single installed model auto-selected → Ready');
        ok('exactly one installed model → auto-selected → Ready');
    } catch (e) { bad('single-model auto-select → Ready', e); }

    console.log('\n' + (fail === 0 ? '✅ ' : '❌ ') + pass + ' passed, ' + fail + ' failed (test-ai-model-ready-live-a.js)');
    process.exit(fail === 0 ? 0 : 1);
}
main().catch(function (e) { console.error('FATAL', e); process.exit(1); });
