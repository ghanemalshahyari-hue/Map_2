'use strict';
/* ============================================================================
 * test-ai-user-friendly-model-flow-a.js — RMOOZ-AI-USER-FRIENDLY-MODEL-FLOW-A
 * ----------------------------------------------------------------------------
 * The AI Free Fight card must be operator-friendly: "Choose model → Ready →
 * Start AI Free Fight." The operator should never have to read env-variable
 * names to use the AI. This suite proves (static, no server):
 *
 *   1 the technical no-model text is replaced by "Choose an AI model to start."
 *   2 the main AI card (simple model flow) shows NO env-variable names
 *   3 an available model auto-selects (one installed model + saved missing)
 *   4 a missing saved model prompts the operator to choose another
 *   5 Advanced diagnostics are collapsed (<details>) + carry the env detail
 *   6 Start is disabled until a model is ready
 *   7 local mode is the default (no cloud unless cloud mode is enabled)
 *   8 cloud mode carries a clear "data leaves this machine" warning
 *   9 the Ready / no-model status words are honest + actionable
 *
 * Run: node scripts/test-ai-user-friendly-model-flow-a.js   (exit 0 = green)
 * ========================================================================== */
const assert = require('assert');
const fs     = require('fs');
const path   = require('path');

let pass = 0, fail = 0;
function test(name, fn) { try { fn(); console.log('  ✓ ' + name); pass++; } catch (e) { console.log('  ✗ ' + name + ' — ' + (e && e.message)); fail++; } }

// ── DOM / window stub + a recording fetch (model flow harness) ───────────────
const fetchCalls = [];
function makeFetchResponse(url, opts) {
    let model = '';
    try { model = opts && opts.body ? (JSON.parse(opts.body).model || '') : ''; } catch (_) {}
    const payload = { ok: true, selected_model: model || 'qwen2.5:7b', model_available: true,
                      provider: 'ollama', models: [{ name: model || 'qwen2.5:7b', available: true }],
                      allow_sim_run: true };
    return Promise.resolve({ ok: true, status: 200, statusText: 'OK',
        text: function () { return Promise.resolve(JSON.stringify(payload)); } });
}
function installGlobals() {
    const elById = {};
    function makeEl(t) {
        const el = { tagName: t, id: '', className: '', innerHTML: '', textContent: '', children: [], style: {},
            appendChild: function (e) { this.children.push(e); if (e && e.id) elById[e.id] = e; return e; },
            removeChild: function (e) { const i = this.children.indexOf(e); if (i >= 0) this.children.splice(i, 1); return e; },
            setAttribute: function () {}, removeAttribute: function () {}, addEventListener: function () {},
            querySelector: function () { return null; }, querySelectorAll: function () { return []; }, getAttribute: function () { return null; } };
        Object.defineProperty(el, 'parentNode', { value: null, writable: true });
        return el;
    }
    global.document = { body: makeEl('body'), head: makeEl('head'), createElement: makeEl,
        getElementById: function (id) { return elById[id] || null; }, querySelector: function () { return null; },
        addEventListener: function () {}, dispatchEvent: function () { return true; } };
    global.CustomEvent = function (n, d) { this.type = n; this.detail = d && d.detail; };
    global.window = { document: global.document, AppShellEventLog: { append: function () {} },
        sessionStorage: (function () { const d = {}; return { getItem: function (k) { return d[k] || null; }, setItem: function (k, v) { d[k] = String(v); }, removeItem: function (k) { delete d[k]; } }; })(),
        setTimeout: function () { return 0; }, clearTimeout: function () {}, setInterval: function () { return 0; }, clearInterval: function () {},
        fetch: function (url, opts) { fetchCalls.push({ url: url, opts: opts }); return makeFetchResponse(url, opts); } };
    global.window.window = global.window;
}
installGlobals();
const C = path.join(__dirname, '..', 'client', 'shell');
require(path.join(C, 'world-state-db.js'));
require(path.join(C, 'symbol-db.js'));
require(path.join(C, 'symbol-registry.js'));
require(path.join(C, 'free-fight-demo.js'));
const DEMO = global.window.RmoozFreeFightDemo;

// ── route-health + /api/ai/models fixtures ───────────────────────────────────
const RH_READY    = { ok: true, allow_sim_run: true,  model_available: true,  provider: 'ollama', configured_provider: 'ollama', model: 'qwen2.5:7b' };
const RH_NO_MODEL = { ok: true, allow_sim_run: true,  model_available: false, provider: 'ollama', configured_provider: 'ollama', model: 'qwen3.6-plus-free' };
const RH_GATE_OFF = { ok: true, allow_sim_run: false, model_available: false, provider: 'ollama', configured_provider: 'ollama' };
const RH_CLOUD_OFF= { ok: true, allow_sim_run: true,  model_available: false, provider: 'ollama', configured_provider: 'openrouter', provider_blocked: true };
const RH_CLOUD_ON = { ok: true, allow_sim_run: true,  model_available: true,  provider: 'ollama', configured_provider: 'openrouter', model: 'qwen/qwen3.5-397b-a17b' };

const INFO_READY = { ok: true, provider: 'ollama', is_cloud: false, cloud_allowed: false, cloud_enabled: false,
    selected_model: 'qwen2.5:7b', model_available: true, allow_sim_run: true,
    models: [{ name: 'qwen2.5:7b', available: true }, { name: 'gpt-oss:latest', available: true }] };
const INFO_ONE = { ok: true, provider: 'ollama', is_cloud: false, cloud_allowed: false, cloud_enabled: false,
    selected_model: 'qwen3.6-plus-free', model_available: false,
    models: [{ name: 'qwen2.5:7b', available: true }, { name: 'qwen3.6-plus-free', available: false }] };
const INFO_MULTI_MISSING = { ok: true, provider: 'ollama', is_cloud: false, cloud_allowed: false, cloud_enabled: false,
    selected_model: 'qwen3.6-plus-free', model_available: false,
    models: [{ name: 'qwen2.5:7b', available: true }, { name: 'gpt-oss:latest', available: true }, { name: 'qwen3.6-plus-free', available: false }] };
const INFO_EMPTY = { ok: true, provider: 'ollama', is_cloud: false, cloud_allowed: false, cloud_enabled: false,
    selected_model: '', model_available: false, models: [] };
const INFO_CLOUD = { ok: true, provider: 'openrouter', is_cloud: true, cloud_allowed: true, cloud_enabled: true,
    selected_model: 'qwen/qwen3.5-397b-a17b', model_available: true, allow_sim_run: true,
    models: [{ name: 'qwen/qwen3.5-397b-a17b', available: true }] };

// env-variable tokens that must NEVER appear in the main (non-advanced) AI card surface
const ENV_TOKENS = ['RMOOZ_ALLOW_SIM_RUN', 'RMOOZ_ALLOW_CLOUD_AI', 'RMOOZ_FREE_FIGHT', 'RMOOZ_LLM',
    'model_available', 'plan_source', 'provider_used', 'ollama pull', 'llm_status', 'configured_provider'];
function assertNoEnv(html, where) {
    ENV_TOKENS.forEach(function (t) {
        assert.ok(html.indexOf(t) === -1, where + ' must not show env token "' + t + '"');
    });
}

(function () {
console.log('\n═══ RMOOZ-AI-USER-FRIENDLY-MODEL-FLOW-A ═══\n');

console.log('1) the technical no-model text is replaced by a simple operator message');
test('source no longer carries the old "no local LLM/model is available" text', function () {
    const src = fs.readFileSync(path.join(C, 'free-fight-demo.js'), 'utf8');
    assert.ok(!/AI execution is allowed, but no local LLM\/model is available/.test(src), 'old technical text removed');
    assert.ok(/Choose an AI model to start\./.test(src), 'new operator text present');
});
test('needs-model status message is "Choose an AI model to start." (generic) ', function () {
    // model info not loaded yet → generic message
    const s = DEMO._modelFlowStatusForTest(RH_NO_MODEL, null);
    assert.strictEqual(s.state, 'needs_model');
    assert.strictEqual(s.message, 'Choose an AI model to start.');
    assert.strictEqual(s.label, 'Needs model');
});

console.log('\n2) the main AI card (simple model flow) shows NO env-variable names');
test('_modelFlowHtml has no env tokens (ready)', function () {
    assertNoEnv(String(DEMO._modelFlowHtmlForTest(RH_READY, INFO_READY, false)), 'model-flow (ready)');
});
test('_modelFlowHtml has no env tokens (needs model + picker open)', function () {
    assertNoEnv(String(DEMO._modelFlowHtmlForTest(RH_NO_MODEL, INFO_MULTI_MISSING, true)), 'model-flow (needs model)');
});
test('the full AI card section BEFORE Advanced diagnostics is env-free', function () {
    const html = String(DEMO._renderCommanderLoopHtmlForTest(RH_NO_MODEL, INFO_MULTI_MISSING));
    const idx = html.indexOf('data-ff-loop="advanced-diagnostics"');
    assert.ok(idx > -1, 'advanced diagnostics block present');
    assertNoEnv(html.slice(0, idx), 'AI card (pre-advanced)');
});
test('the main card shows the four required pieces: AI Model, Status, Select AI Model, Start', function () {
    DEMO._setModelPickerOpenForTest(false);
    const html = String(DEMO._renderCommanderLoopHtmlForTest(RH_READY, INFO_READY));
    assert.ok(/AI Model:/.test(html), 'AI Model label');
    assert.ok(/Status:/.test(html), 'Status label');
    assert.ok(/data-act="ff-open-model-picker"/.test(html) && /Select AI Model/.test(html), 'Select AI Model button');
    assert.ok(/data-act="loop-start"[^>]*>▶ Start AI Free Fight/.test(html), 'Start AI Free Fight button');
});

console.log('\n3) an available model auto-selects');
test('one installed model + saved missing → auto-selects the installed one', function () {
    fetchCalls.length = 0;
    DEMO._resetAutoSelectForTest();
    const did = DEMO._maybeAutoSelectModelForTest(INFO_ONE);
    assert.strictEqual(did, true, 'auto-select fired');
    const sel = fetchCalls.find(function (c) { return /\/api\/ai\/model\/select/.test(c.url); });
    assert.ok(sel, 'posted a model selection');
    assert.strictEqual(JSON.parse(sel.opts.body).model, 'qwen2.5:7b', 'selected the only installed model');
});
test('saved model already available → does NOT auto-select', function () {
    fetchCalls.length = 0; DEMO._resetAutoSelectForTest();
    assert.strictEqual(DEMO._maybeAutoSelectModelForTest(INFO_READY), false, 'no auto-select when saved is available');
    assert.ok(!fetchCalls.some(function (c) { return /model\/select/.test(c.url); }), 'no selection POST');
});
test('multiple installed + saved missing → does NOT silently pick one', function () {
    fetchCalls.length = 0; DEMO._resetAutoSelectForTest();
    assert.strictEqual(DEMO._maybeAutoSelectModelForTest(INFO_MULTI_MISSING), false, 'no silent pick among many');
});
test('cloud listing is never auto-selected (data-leaves consent must be explicit)', function () {
    fetchCalls.length = 0; DEMO._resetAutoSelectForTest();
    const cloudMissing = Object.assign({}, INFO_CLOUD, { model_available: false, models: [{ name: 'qwen/x', available: true }] });
    assert.strictEqual(DEMO._maybeAutoSelectModelForTest(cloudMissing), false, 'cloud never auto-picked');
});

console.log('\n4) a missing saved LOCAL model prompts the operator with the exact model + count');
test('missing saved local model (others installed) → "local Ollama model not installed" (#6)', function () {
    const s = DEMO._modelFlowStatusForTest(RH_NO_MODEL, INFO_MULTI_MISSING);
    assert.strictEqual(s.state, 'needs_model');
    assert.strictEqual(s.message, 'Local Ollama model "qwen3.6-plus-free" is not installed. Pull this model or choose an installed local model (2 installed locally).');
});

console.log('\n5) Advanced diagnostics are collapsed + carry the env detail');
test('advanced block is a collapsed <details> (not open) with the env detail', function () {
    const adv = String(DEMO._advancedDiagnosticsHtmlForTest(RH_NO_MODEL, INFO_MULTI_MISSING));
    assert.ok(/^\s*<details/.test(adv), 'is a <details> block');
    assert.ok(!/<details[^>]*\sopen/.test(adv), 'is collapsed (no open attribute)');
    assert.ok(/RMOOZ_ALLOW_SIM_RUN/.test(adv), 'shows the execution gate env');
    assert.ok(/RMOOZ_ALLOW_CLOUD_AI/.test(adv), 'shows the cloud gate env');
    assert.ok(/provider:/.test(adv) && /model_available:/.test(adv), 'shows provider + model_available');
    assert.ok(/data-act="model-select"/.test(adv), 'raw model dropdown lives under Advanced');
});

console.log('\n6) Start is disabled until a model is ready');
test('no-model route health → Start AI Free Fight is disabled', function () {
    const html = String(DEMO._renderCommanderLoopHtmlForTest(RH_NO_MODEL, INFO_MULTI_MISSING));
    assert.ok(/data-act="loop-start" disabled/.test(html), 'Start disabled when no model');
});
test('gate off → Start AI Free Fight is disabled', function () {
    const html = String(DEMO._renderCommanderLoopHtmlForTest(RH_GATE_OFF, INFO_EMPTY));
    assert.ok(/data-act="loop-start" disabled/.test(html), 'Start disabled when gate off');
});
test('ready route health → Start AI Free Fight is enabled', function () {
    const html = String(DEMO._renderCommanderLoopHtmlForTest(RH_READY, INFO_READY));
    assert.ok(/data-act="loop-start" style=/.test(html) && !/data-act="loop-start" disabled/.test(html), 'Start enabled when ready');
});

console.log('\n7) local mode is the default (no cloud unless cloud mode is enabled)');
test('local picker: Local section, no Cloud source button, local-only note', function () {
    const html = String(DEMO._modelFlowHtmlForTest(RH_READY, INFO_READY, true));
    assert.ok(/Local models/.test(html), 'shows Local models section');
    assert.ok(!/data-act="ff-load-cloud"/.test(html), 'no Cloud source button when cloud disabled');
    assert.ok(/Local-only is the default\./.test(html), 'states local-only default');
    assert.ok(!/data leaves this machine/.test(html), 'no cloud warning in local mode');
});
test('default status when cloud blocked is "Cloud disabled" (honest, simple)', function () {
    const s = DEMO._modelFlowStatusForTest(RH_CLOUD_OFF, null);
    assert.strictEqual(s.state, 'cloud_disabled');
    assert.strictEqual(s.label, 'Cloud disabled');
});

console.log('\n8) cloud mode carries a clear "data leaves this machine" warning');
test('cloud picker labels models "Cloud model" + warns data leaves the machine', function () {
    const html = String(DEMO._modelFlowHtmlForTest(RH_CLOUD_ON, INFO_CLOUD, true));
    assert.ok(/Cloud models/.test(html), 'shows Cloud models section');
    assert.ok(/data leaves this machine/.test(html), 'data-leaves warning present');
    assert.ok(/data-ff-model="cloud-warn"/.test(html), 'cloud warning element present');
    assert.ok(/Cloud model/.test(html), 'rows labelled Cloud model');
});
test('cloud selection is labelled "Cloud model" in the AI Model line', function () {
    const s = DEMO._modelFlowStatusForTest(RH_CLOUD_ON, INFO_CLOUD);
    assert.strictEqual(s.isCloud, true);
    assert.strictEqual(s.providerLabel, 'Cloud model');
});

console.log('\n9) the Ready / no-model status words are honest + actionable');
test('ready → label "Ready", canStart true, message points to Start', function () {
    const s = DEMO._modelFlowStatusForTest(RH_READY, INFO_READY);
    assert.strictEqual(s.state, 'ready');
    assert.strictEqual(s.label, 'Ready');
    assert.strictEqual(s.canStart, true);
    assert.ok(/Start AI Free Fight/.test(s.message), 'message points the operator to Start');
});
test('no models installed → "No AI model found. Start Ollama or choose a cloud model."', function () {
    const s = DEMO._modelFlowStatusForTest(RH_NO_MODEL, INFO_EMPTY);
    assert.strictEqual(s.message, 'No AI model found. Start Ollama or choose a cloud model.');
});
test('gate off → simple "Needs setup", no env name in the message', function () {
    const s = DEMO._modelFlowStatusForTest(RH_GATE_OFF, INFO_EMPTY);
    assert.strictEqual(s.label, 'Needs setup');
    assert.ok(s.message.indexOf('RMOOZ_') === -1, 'gate-off message is env-free in the main card');
});

console.log('\n' + (fail === 0 ? '✅ PASS' : '❌ FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail === 0 ? 0 : 1);
})();
