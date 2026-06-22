'use strict';
/**
 * test-prepare-coa-ux-unblock-a.js — RMOOZ-PREPARE-COA-UX-UNBLOCK-A
 *
 * Verifies: disabled button when AI blocked, enabled when ready, cloud/local mismatch
 * actions, provider card, Auto Continue binding, fast depth no longer blocks readiness.
 */
var path = require('path');
var assert = require('assert');

// ── minimal DOM stubs (matching test-free-fight-auto-scenario-director-ab.js) ─
var elById = {};
function makeEl(t) {
    var el = { tagName: t, innerHTML: '', textContent: '', children: [], attrs: {}, style: {},
        appendChild: function (e) { this.children.push(e); if (e && e.id) elById[e.id] = e; return e; },
        removeChild: function (e) { var i = this.children.indexOf(e); if (i >= 0) this.children.splice(i, 1); return e; },
        setAttribute: function (k, v) { this.attrs[k] = v; }, removeAttribute: function (k) { delete this.attrs[k]; },
        addEventListener: function () {}, removeEventListener: function () {},
        querySelector: function () { return null; }, querySelectorAll: function () { return []; }, getAttribute: function (k) { return this.attrs[k]; } };
    Object.defineProperty(el, 'parentNode', { value: null, writable: true });
    return el;
}
var bodyEl = makeEl('body');
global.document = { body: bodyEl, head: makeEl('head'), createElement: makeEl,
    getElementById: function (id) { return elById[id] || null; }, querySelector: function () { return null; } };
var GREEN = { ok: true, collateral_risk: { band: 'low', score: 10 }, deterministic: true };
global.window = {
    document: global.document, AppShellEventLog: { append: function () {} },
    sessionStorage: (function () { var d = {}; return { getItem:function(k){return d[k]||null;}, setItem:function(k,v){d[k]=String(v);}, removeItem:function(k){delete d[k];} }; })(),
    setTimeout: function () { return 0; }, clearTimeout: function () {}, setInterval: function () { return 0; }, clearInterval: function () {},
    fetch: function () { return Promise.resolve({ ok:true, status:200, statusText:'OK', text:function(){return Promise.resolve(JSON.stringify(GREEN));}, json:function(){return Promise.resolve(GREEN);} }); },
};
global.window.window = global.window;
global.CustomEvent = function (t, o) { this.type = t; this.detail = (o && o.detail) || {}; };
global.navigator = { userAgent: '' };

function setUnits(red, blue) { global.window.RmoozScenario = { scenario: { red_units: red, blue_units_initial: blue, obj: { name: 'Objective X', coord: [54.40, 24.45] } } }; }
setUnits([{ id: 'R-1', side: 'RED', lat: 24.45, lon: 54.46, coord: [54.46, 24.45] }],
         [{ id: 'B-1', side: 'BLUE', lat: 24.452, lon: 54.402, coord: [54.402, 24.452] }]);

var C = path.join(__dirname, 'UI_MOdified', 'client', 'shell');
require(path.join(C, 'world-state-db.js'));
require(path.join(C, 'symbol-db.js'));
require(path.join(C, 'symbol-registry.js'));
require(path.join(C, 'free-fight-demo.js'));
require(path.join(C, 'scenario-control-center.js'));

var DEMO = global.window.RmoozFreeFightDemo;
var SCC  = global.window.RmoozScenarioControlCenter;
var eng  = DEMO.engine;

// Mount a minimal scenario so SCC state ≠ no_scenario
DEMO.mount({ brief: { operational_brief: { proposed_units: [{ id: 'B-1', side: 'BLUE', lat: 24.452, lon: 54.402 }], objectives: [{ label: 'Objective X', lat: 24.45, lon: 54.40 }] } } });
if (DEMO.setObjective) DEMO.setObjective({ lat: 24.45, lon: 54.40 });

var pass = 0, fail = 0;
function test(name, fn) {
    try {
        var ok = fn();
        if (ok) { pass++; console.log('  ✓ ' + name); }
        else { fail++; console.log('  ✗ FAIL: ' + name); }
    } catch (e) { fail++; console.log('  ✗ ERROR: ' + name + ' — ' + e.message); }
}

// ── helpers ───────────────────────────────────────────────────────────────────
function setReady() {
    DEMO._setRouteHealthForTest({ ok: true, allow_sim_run: true, model_available: true, pair_coherent: true,
        provider: 'ollama', configured_provider: 'ollama', provider_blocked: false });
    DEMO._setModelInfoForTest({ ok: true, selected_model: 'qwen2.5:3b', model_available: true,
        provider: 'ollama', configured_provider: 'ollama', is_cloud: false, selected_is_cloud_slug: false });
}
function setCloudMismatch() {
    // Cloud slug selected but provider is ollama — mark model_available:true so the avail check passes
    // and the cloud_model_local_provider check fires (the real scenario when OR was previously active)
    DEMO._setRouteHealthForTest({ ok: true, allow_sim_run: true, model_available: true, pair_coherent: true,
        provider: 'ollama', configured_provider: 'ollama', provider_blocked: false });
    DEMO._setModelInfoForTest({ ok: true, selected_model: 'qwen/qwen3.5-397b-a17b', model_available: true,
        provider: 'ollama', configured_provider: 'ollama', is_cloud: false, selected_is_cloud_slug: true });
}
function setModelUnavailable() {
    DEMO._setRouteHealthForTest({ ok: true, allow_sim_run: true, model_available: false, pair_coherent: true,
        provider: 'ollama', configured_provider: 'ollama', provider_blocked: false });
    DEMO._setModelInfoForTest({ ok: true, selected_model: 'qwen2.5:3b', model_available: false,
        provider: 'ollama', configured_provider: 'ollama', is_cloud: false, selected_is_cloud_slug: false });
}

// ── tests ─────────────────────────────────────────────────────────────────────
console.log('\nRMOOZ-PREPARE-COA-UX-UNBLOCK-A');

test('1 fast depth + null routeHealth → health_pending (not fast-depth error)', function () {
    DEMO._setRouteHealthForTest(null);
    var r = DEMO._freeFightAiReadyForTest();
    return r.ok === false && r.code === 'health_pending';
});

test('2 fast depth + valid routeHealth + available model → ok:true', function () {
    setReady();
    var r = DEMO._freeFightAiReadyForTest();
    return r.ok === true;
});

test('3 cloud slug + local provider (model_available:true) → cloud_model_local_provider', function () {
    setCloudMismatch();
    var r = DEMO._freeFightAiReadyForTest();
    return r.ok === false && r.code === 'cloud_model_local_provider';
});

test('4 eng.aiModelInfo() returns _modelInfo', function () {
    setCloudMismatch();
    var mi = eng.aiModelInfo();
    return mi && mi.selected_model === 'qwen/qwen3.5-397b-a17b';
});

test('5 facade: switchToLocalModel, switchToOpenRouter, toggleAutoScenario exist', function () {
    return typeof eng.switchToLocalModel === 'function' &&
           typeof eng.switchToOpenRouter === 'function' &&
           typeof eng.toggleAutoScenario === 'function';
});

test('6 Panel 2: ⊘ AI COA unavailable + disabled when model missing', function () {
    setModelUnavailable();
    var html = SCC.render();
    return html.includes('⊘ AI COA unavailable') && html.includes('cursor:not-allowed');
});

test('7 Panel 2: ✓ Prepare AI COA enabled when AI ready', function () {
    setReady();
    var html = SCC.render();
    return html.includes('✓ Prepare AI COA') && !html.includes('⊘ AI COA unavailable');
});

test('8 Panel 2: cloud mismatch shows two action buttons + message', function () {
    setCloudMismatch();
    var html = SCC.render();
    return html.includes('Cloud model selected, but Free Fight is using local Ollama') &&
           html.includes('scc-use-local-model') &&
           html.includes('scc-use-openrouter');
});

test('9 Panel 2: provider/model detail card always present', function () {
    setReady();
    var html = SCC.render();
    return html.includes('ai-provider-detail') && html.includes('qwen2.5:3b');
});

test('10 Panel 2: Staff-Safe always present (both AI ok and blocked)', function () {
    setCloudMismatch();
    var h1 = SCC.render();
    setReady();
    var h2 = SCC.render();
    return h1.includes('scc-prepare-staffsafe') && h2.includes('scc-prepare-staffsafe');
});

test('11 Panel 2: Staff-Safe promotion note when AI blocked', function () {
    setCloudMismatch();
    var html = SCC.render();
    return html.includes('Staff-Safe') && html.includes('fix the AI model');
});

test('12 bind() registers scc-use-local-model, scc-use-openrouter, scc-auto-continue', function () {
    var registered = [];
    SCC.bind(function (act) { registered.push(act); });
    return registered.indexOf('scc-use-local-model') >= 0 &&
           registered.indexOf('scc-use-openrouter') >= 0 &&
           registered.indexOf('scc-auto-continue') >= 0;
});

// ── summary ──────────────────────────────────────────────────────────────────
console.log('');
var status = fail === 0 ? '✅' : '❌';
console.log(status + ' ' + pass + ' passed, ' + fail + ' failed (test-prepare-coa-ux-unblock-a.js)');
process.exit(fail > 0 ? 1 : 0);
