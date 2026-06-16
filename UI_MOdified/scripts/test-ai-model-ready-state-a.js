'use strict';
/* ============================================================================
 * test-ai-model-ready-state-a.js — RMOOZ-AI-MODEL-READY-STATE-A (bugfix)
 * ----------------------------------------------------------------------------
 * After the operator selects an AVAILABLE model, the AI Free Fight card must
 * become "Ready" immediately (no page reload, not dependent on the async
 * route-health probe round-trip) and "Start AI Free Fight" must enable.
 *
 * Root cause fixed: _selectModel() used to leave readiness keyed only on the
 * stale _routeHealth until the async probe returned. Now it folds the fresh
 * model state from the /api/ai/model/select response into _routeHealth on the
 * spot (the probe then re-confirms).
 *
 *   1) select an available local model → Status: Ready + Start enabled
 *   2) Ready is IMMEDIATE — it does not wait on the route-health probe
 *   3) saved model missing (others installed) → stays Needs model + Start disabled
 *   4) Ollama not running (no models) → Needs model, simple message, Start disabled
 *   5) cloud model selected while cloud enabled → Ready, labelled "Cloud model"
 *   6) cloud blocked → "Cloud disabled" + Start disabled
 *   7) no env-variable names in the main-card simple block
 *
 * Run: node scripts/test-ai-model-ready-state-a.js   (exit 0 = green)
 * ========================================================================== */
const assert = require('assert');
const path   = require('path');

let pass = 0, fail = 0;
function test(name, fn) { try { fn(); console.log('  ✓ ' + name); pass++; } catch (e) { console.log('  ✗ ' + name + ' — ' + (e && e.message)); fail++; } }
async function atest(name, fn) { try { await fn(); console.log('  ✓ ' + name); pass++; } catch (e) { console.log('  ✗ ' + name + ' — ' + (e && e.message)); fail++; } }

// ── DOM / window stub with a configurable fetch ─────────────────────────────
let SELECT_PAYLOAD = {};      // body returned by POST /api/ai/model/select
let HEALTH_MODE = 'true';     // 'true' | 'false' | 'defer' — GET /plan-coas/health behaviour
let SELECTED_MODEL = '';      // model echoed back in the health response
let HEALTH_PROVIDER = 'ollama'; // configured_provider the health endpoint reports (realistic: cloud → null model_available)
let MODELS_PAYLOAD = null;    // GET /api/ai/models response (for the HUD-event consumer path)
const fetchCalls = [];        // records {url, opts} for assertions
function makeResp(obj) { return Promise.resolve({ ok: true, status: 200, statusText: 'OK', text: function () { return Promise.resolve(JSON.stringify(obj)); } }); }
function installGlobals() {
    const elById = {};
    function mk(t) { const e = { tagName: t, id: '', innerHTML: '', children: [], style: {}, appendChild(c) { this.children.push(c); if (c && c.id) elById[c.id] = c; return c; }, removeChild(c) { return c; }, setAttribute() {}, removeAttribute() {}, addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; }, getAttribute() { return null; } }; Object.defineProperty(e, 'parentNode', { value: null, writable: true }); return e; }
    global.document = { body: mk('body'), head: mk('head'), createElement: mk, getElementById: id => elById[id] || null, querySelector: () => null, addEventListener() {}, dispatchEvent() { return true; } };
    global.CustomEvent = function (n, d) { this.type = n; this.detail = d && d.detail; };
    global.window = { document: global.document, AppShellEventLog: { append() {} },
        sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
        setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
        fetch: function (url, opts) {
            fetchCalls.push({ url: url, opts: opts });
            if (/model\/(select|reset)/.test(url)) return makeResp(SELECT_PAYLOAD);
            if (/\/api\/ai\/models(\?|$)/.test(url) && MODELS_PAYLOAD) return makeResp(MODELS_PAYLOAD);
            if (/plan-coas\/health/.test(url)) {
                if (HEALTH_MODE === 'defer') return new Promise(() => {}); // never resolves
                // Realistic: for the cloud provider the route-health probe can't check the catalog → model_available null.
                var cloud = HEALTH_PROVIDER === 'openrouter';
                return makeResp({ ok: true, allow_sim_run: true, ai_execution_enabled: HEALTH_MODE === 'true',
                    model_available: cloud ? null : (HEALTH_MODE === 'true'), provider: HEALTH_PROVIDER, configured_provider: HEALTH_PROVIDER,
                    provider_blocked: false, model: SELECTED_MODEL, selected_model: SELECTED_MODEL });
            }
            return makeResp({});
        } };
    global.window.window = global.window;
}
installGlobals();
const C = path.join(__dirname, '..', 'client', 'shell');
require(path.join(C, 'world-state-db.js')); require(path.join(C, 'symbol-db.js')); require(path.join(C, 'symbol-registry.js')); require(path.join(C, 'free-fight-demo.js'));
const DEMO = global.window.RmoozFreeFightDemo;
const flush = () => new Promise(r => setTimeout(r, 20));   // real timer → drains the promise chain

// stale mount state: the saved model was not installed → not ready before selecting.
const RH_STALE   = { ok: true, allow_sim_run: true, model_available: false, provider: 'ollama', configured_provider: 'ollama', model: 'qwen3.6-plus-free' };
const INFO_STALE = { ok: true, provider: 'ollama', is_cloud: false, cloud_enabled: false, selected_model: 'qwen3.6-plus-free', model_available: false, allow_sim_run: true,
    models: [{ name: 'qwen2.5:7b', available: true }, { name: 'gpt-oss:latest', available: true }, { name: 'qwen3.6-plus-free', available: false }] };

(async function () {
console.log('\n═══ RMOOZ-AI-MODEL-READY-STATE-A ═══\n');

console.log('1) selecting an available local model → Ready + Start enabled');
await atest('select → Status: Ready, _freeFightAiReady ok, Start enabled', async function () {
    DEMO._setModelPickerOpenForTest(false);
    DEMO._setRouteHealthForTest(RH_STALE);
    DEMO._setModelInfoForTest(INFO_STALE);
    assert.strictEqual(DEMO._modelFlowStatusForTest().state, 'needs_model', 'precondition: not ready');
    SELECTED_MODEL = 'gpt-oss:latest'; HEALTH_MODE = 'true';
    SELECT_PAYLOAD = { ok: true, provider: 'ollama', is_cloud: false, cloud_enabled: false, selected_model: 'gpt-oss:latest',
        model_available: true, allow_sim_run: true, provider_blocked: false, configured_provider: 'ollama',
        models: [{ name: 'gpt-oss:latest', available: true }, { name: 'qwen2.5:7b', available: true }] };
    await DEMO._selectModelForTest('gpt-oss:latest', 'ollama');
    await flush();
    const s = DEMO._modelFlowStatusForTest();
    assert.strictEqual(s.state, 'ready', 'status flips to ready');
    assert.strictEqual(s.label, 'Ready');
    assert.strictEqual(s.selected, 'gpt-oss:latest', 'shows the selected model');
    assert.strictEqual(DEMO._freeFightAiReadyForTest().ok, true, '_freeFightAiReady ok');
    const card = String(DEMO._renderCommanderLoopHtmlForTest());
    assert.ok(/Status:[\s\S]{0,80}Ready/.test(card), 'card shows Status: Ready');
    assert.ok(/data-act="loop-start" style=/.test(card) && !/data-act="loop-start" disabled/.test(card), 'Start AI Free Fight enabled');
});

console.log('\n2) Ready is IMMEDIATE — does not wait on the route-health probe');
await atest('with the health probe deferred, the card is Ready right after select', async function () {
    DEMO._setRouteHealthForTest(RH_STALE);
    DEMO._setModelInfoForTest(INFO_STALE);
    SELECTED_MODEL = 'gpt-oss:latest'; HEALTH_MODE = 'defer';   // probe never resolves
    SELECT_PAYLOAD = { ok: true, provider: 'ollama', is_cloud: false, cloud_enabled: false, selected_model: 'gpt-oss:latest',
        model_available: true, allow_sim_run: true, provider_blocked: false, configured_provider: 'ollama',
        models: [{ name: 'gpt-oss:latest', available: true }] };
    DEMO._selectModelForTest('gpt-oss:latest', 'ollama');   // NOT awaited (probe would hang the chain)
    await flush();
    assert.strictEqual(DEMO._modelFlowStatusForTest().state, 'ready', 'ready without the probe resolving');
    assert.strictEqual(DEMO._freeFightAiReadyForTest().ok, true, 'Start gate ok without the probe');
    HEALTH_MODE = 'true';
});

console.log('\n3) saved LOCAL model missing (others installed) → Needs model + exact model + count (#6)');
test('Needs model + Start disabled + "local Ollama model not installed" message with model + count', function () {
    DEMO._setRouteHealthForTest(RH_STALE);
    DEMO._setModelInfoForTest(INFO_STALE);
    const s = DEMO._modelFlowStatusForTest();
    assert.strictEqual(s.state, 'needs_model');
    assert.strictEqual(s.label, 'Needs model');
    assert.strictEqual(s.message, 'Local Ollama model "qwen3.6-plus-free" is not installed. Pull this model or choose an installed local model (2 installed locally).');
    assert.strictEqual(DEMO._freeFightAiReadyForTest().ok, false, 'not ready');
    const card = String(DEMO._renderCommanderLoopHtmlForTest());
    assert.ok(/data-act="loop-start" disabled/.test(card), 'Start disabled');
});

console.log('\n4) Ollama not running (no models) → Needs model + simple message + Start disabled');
test('no models → "No AI model found. Start Ollama or choose a cloud model."', function () {
    DEMO._setRouteHealthForTest({ ok: true, allow_sim_run: true, model_available: false, provider: 'ollama', configured_provider: 'ollama', model: 'qwen2.5:7b' });
    DEMO._setModelInfoForTest({ ok: true, provider: 'ollama', is_cloud: false, selected_model: '', model_available: false, allow_sim_run: true, models: [] });
    const s = DEMO._modelFlowStatusForTest();
    assert.strictEqual(s.state, 'needs_model');
    assert.strictEqual(s.message, 'No AI model found. Start Ollama or choose a cloud model.');
    assert.ok(/data-act="loop-start" disabled/.test(String(DEMO._renderCommanderLoopHtmlForTest())), 'Start disabled');
});

console.log('\n5) cloud model selected while cloud enabled → Ready, labelled "Cloud model"');
await atest('cloud select → Ready + Cloud label', async function () {
    DEMO._setRouteHealthForTest({ ok: true, allow_sim_run: true, model_available: false, provider: 'ollama', configured_provider: 'ollama', model: 'x' });
    DEMO._setModelInfoForTest({ ok: true, provider: 'ollama', is_cloud: false, selected_model: 'x', model_available: false, allow_sim_run: true, models: [] });
    SELECTED_MODEL = 'qwen/qwen3.5-397b-a17b'; HEALTH_MODE = 'true'; HEALTH_PROVIDER = 'openrouter';
    SELECT_PAYLOAD = { ok: true, provider: 'openrouter', is_cloud: true, cloud_allowed: true, cloud_enabled: true,
        selected_model: 'qwen/qwen3.5-397b-a17b', model_available: true, allow_sim_run: true, provider_blocked: false,
        configured_provider: 'openrouter', models: [{ name: 'qwen/qwen3.5-397b-a17b', available: true }] };
    await DEMO._selectModelForTest('qwen/qwen3.5-397b-a17b', 'openrouter');
    await flush();
    const s = DEMO._modelFlowStatusForTest();
    assert.strictEqual(s.state, 'ready', 'cloud-ready selection → ready');
    assert.strictEqual(s.isCloud, true);
    assert.strictEqual(s.providerLabel, 'Cloud model');
    assert.strictEqual(DEMO._freeFightAiReadyForTest().ok, true, 'Start gate ok for cloud-ready');
    HEALTH_PROVIDER = 'ollama';   // reset so later probes default to local
});

console.log('\n6) cloud blocked → "Cloud disabled" + Start disabled');
test('provider_blocked openrouter → cloud_disabled, not ready', function () {
    DEMO._setRouteHealthForTest({ ok: true, allow_sim_run: true, model_available: false, provider: 'ollama', configured_provider: 'openrouter', provider_blocked: true });
    DEMO._setModelInfoForTest({ ok: true, provider: 'openrouter', is_cloud: true, cloud_enabled: false, selected_model: 'qwen/x', model_available: false, allow_sim_run: true, models: [] });
    const s = DEMO._modelFlowStatusForTest();
    assert.strictEqual(s.state, 'cloud_disabled');
    assert.strictEqual(s.label, 'Cloud disabled');
    assert.strictEqual(DEMO._freeFightAiReadyForTest().ok, false, 'not ready when cloud blocked');
    assert.ok(/data-act="loop-start" disabled/.test(String(DEMO._renderCommanderLoopHtmlForTest())), 'Start disabled');
});

console.log('\n7) the main-card simple block carries no env-variable names');
test('reconciled Ready card simple block is env-free', function () {
    DEMO._setRouteHealthForTest({ ok: true, allow_sim_run: true, model_available: true, provider: 'ollama', configured_provider: 'ollama', model: 'gpt-oss:latest' });
    DEMO._setModelInfoForTest({ ok: true, provider: 'ollama', is_cloud: false, selected_model: 'gpt-oss:latest', model_available: true, allow_sim_run: true, models: [{ name: 'gpt-oss:latest', available: true }] });
    const flowOnly = String(DEMO._modelFlowHtmlForTest(undefined, undefined, false));
    ['RMOOZ_ALLOW_SIM_RUN', 'RMOOZ_ALLOW_CLOUD_AI', 'model_available', 'plan_source', 'provider_used', 'ollama pull'].forEach(function (t) {
        assert.ok(flowOnly.indexOf(t) === -1, 'no env token "' + t + '" in the simple block');
    });
});

console.log('\n8) model selected via ANOTHER surface (header HUD) → card flips to Ready');
await atest('rmooz:ai-model-changed (source!=card) refreshes readiness, not just the list', async function () {
    // Card is stale/not-ready (e.g. mounted while the saved model was uninstalled).
    DEMO._setRouteHealthForTest({ ok: true, allow_sim_run: true, model_available: false, provider: 'ollama', configured_provider: 'ollama', model: 'not-installed' });
    DEMO._setModelInfoForTest({ ok: true, provider: 'ollama', is_cloud: false, selected_model: 'not-installed', model_available: false, allow_sim_run: true, models: [{ name: 'gpt-oss:latest', available: true }, { name: 'not-installed', available: false }] });
    assert.strictEqual(DEMO._freeFightAiReadyForTest().ok, false, 'precondition: not ready');
    // The header HUD persisted gpt-oss:latest server-side; now GET /api/ai/models + health report it available.
    MODELS_PAYLOAD = { ok: true, provider: 'ollama', is_cloud: false, cloud_enabled: false, selected_model: 'gpt-oss:latest',
        model_available: true, allow_sim_run: true, provider_blocked: false, configured_provider: 'ollama',
        models: [{ name: 'gpt-oss:latest', available: true }] };
    SELECTED_MODEL = 'gpt-oss:latest'; HEALTH_MODE = 'true';
    // Only the event fires (no in-card _selectModel).
    DEMO._onExternalModelChangedForTest({ detail: { model: 'gpt-oss:latest', source: 'global_hud', model_available: true } });
    await flush();
    assert.strictEqual(DEMO._freeFightAiReadyForTest().ok, true, 'readiness refreshed from the HUD-driven change');
    assert.strictEqual(DEMO._modelFlowStatusForTest().state, 'ready', 'status flips to ready');
    assert.ok(/data-act="loop-start" style=/.test(String(DEMO._renderCommanderLoopHtmlForTest())), 'Start enabled');
    MODELS_PAYLOAD = null;
});
test('our own echo (source=free_fight_card) is ignored by the consumer', function () {
    DEMO._setRouteHealthForTest({ ok: true, allow_sim_run: true, model_available: false, provider: 'ollama', configured_provider: 'ollama', model: 'x' });
    DEMO._setModelInfoForTest({ ok: true, provider: 'ollama', is_cloud: false, selected_model: 'x', model_available: false, allow_sim_run: true, models: [] });
    DEMO._onExternalModelChangedForTest({ detail: { source: 'free_fight_card' } });   // no-op
    assert.strictEqual(DEMO._freeFightAiReadyForTest().ok, false, 'own echo does not change state');
});

console.log('\n9) OpenRouter mode + a local-style model → precise mismatch diagnostic (RMOOZ-…-DEMO-H)');
test('provider=openrouter + local Ollama slug selected → "this is a local Ollama model" message', function () {
    const rh = { ok: true, allow_sim_run: true, model_available: false, configured_provider: 'openrouter', provider_blocked: false, model: 'gpt-oss:latest' };
    const info = { ok: true, provider: 'openrouter', is_cloud: true, cloud_enabled: true, selected_model: 'gpt-oss:latest', model_available: false, allow_sim_run: true, models: [{ name: 'qwen/qwen3.5-397b-a17b', available: true }] };
    const s = DEMO._modelFlowStatusForTest(rh, info);
    assert.strictEqual(s.state, 'needs_model');
    assert.strictEqual(s.message, 'This is a local Ollama model. Choose an OpenRouter model from the OpenRouter list.');
});
test('provider=openrouter + a real (missing) cloud slug → generic "choose another", NOT the local hint', function () {
    const rh = { ok: true, allow_sim_run: true, model_available: false, configured_provider: 'openrouter', provider_blocked: false, model: 'qwen/nope' };
    const info = { ok: true, provider: 'openrouter', is_cloud: true, cloud_enabled: true, selected_model: 'qwen/nope', model_available: false, allow_sim_run: true, models: [{ name: 'qwen/qwen3.5-397b-a17b', available: true }] };
    const s = DEMO._modelFlowStatusForTest(rh, info);
    assert.strictEqual(s.message, 'Your saved model is not available. Choose another model.');
});

console.log('\n10) RUNNING server is OpenRouter + slug in catalog → Ready (route-health model_available NULL bug)');
test('cloud configured + route-health model_available NULL + /api/ai/models true → Ready (not "Choose a model")', function () {
    // The exact production state: openrouter active, route-health probe returns null for cloud,
    // but /api/ai/models computed model_available:true (slug in the catalog).
    const rh = { ok: true, allow_sim_run: true, model_available: null, configured_provider: 'openrouter', provider: 'openrouter', provider_blocked: false, model: 'qwen/qwen3.5-397b-a17b' };
    const info = { ok: true, provider: 'openrouter', is_cloud: true, cloud_allowed: true, cloud_enabled: true, selected_model: 'qwen/qwen3.5-397b-a17b', model_available: true, allow_sim_run: true, models: [{ name: 'qwen/qwen3.5-397b-a17b', available: true }] };
    assert.strictEqual(DEMO._modelAvailableEffectiveForTest(rh, info), true, 'effective availability folds in /api/ai/models for cloud');
    const s = DEMO._modelFlowStatusForTest(rh, info);
    assert.strictEqual(s.state, 'ready', 'card is Ready (was wrongly "needs_model")');
    assert.strictEqual(s.providerLabel, 'Cloud model');
    assert.strictEqual(DEMO._freeFightAiReadyForTest().ok, true, 'Start enabled for cloud-ready');
});

console.log('\n11) operator intends OpenRouter but the RUNNING server is still ollama (#7)');
test('cloud listing but configured_provider=ollama → "OpenRouter is not active … restart" message', function () {
    const rh = { ok: true, allow_sim_run: true, model_available: true, configured_provider: 'ollama', provider: 'ollama', provider_blocked: false, model: 'qwen2.5:7b' };
    const info = { ok: true, provider: 'openrouter', is_cloud: true, cloud_allowed: true, cloud_enabled: true, selected_model: 'qwen/qwen3.5-397b-a17b', model_available: true, allow_sim_run: true, models: [{ name: 'qwen/qwen3.5-397b-a17b', available: true }] };
    const s = DEMO._modelFlowStatusForTest(rh, info);
    assert.strictEqual(s.state, 'cloud_disabled');
    assert.ok(/OpenRouter is not active in the running server\. Restart with RMOOZ_LLM_PROVIDER=openrouter and RMOOZ_ALLOW_CLOUD_AI=1\./.test(s.message), 'exact #7 restart message');
    // (The Start button reflects the SERVER's actual readiness — here the server is ollama-ready, so
    // it can still run locally; the message tells the operator OpenRouter isn't active until restart.)
});

console.log('\n12) provider=openrouter but key missing in the running server (#8)');
test('openrouter provider_blocked + cloud_allowed true + cloud_enabled false → "key is not loaded" message', function () {
    const rh = { ok: true, allow_sim_run: true, model_available: null, configured_provider: 'openrouter', provider: 'ollama', provider_blocked: true, model: 'qwen/qwen3.5-397b-a17b' };
    const info = { ok: true, provider: 'openrouter', is_cloud: true, cloud_allowed: true, cloud_enabled: false, provider_blocked: true, selected_model: 'qwen/qwen3.5-397b-a17b', model_available: false, allow_sim_run: true, models: [] };
    const s = DEMO._modelFlowStatusForTest(rh, info);
    assert.strictEqual(s.state, 'cloud_disabled');
    assert.ok(/OpenRouter key is not loaded in the running server\. Add OPENROUTER_API_KEY or gitignored ai-secrets\.local\.js and restart\./.test(s.message), 'exact #8 key message');
    assert.strictEqual(DEMO._freeFightAiReadyForTest().ok, false, 'Start disabled when key missing');
});

console.log('\n13) Reset AI Selection clears the runtime selection + refreshes (POST /api/ai/model/reset)');
await atest('Reset posts /api/ai/model/reset and re-renders to the default state', async function () {
    DEMO._setRouteHealthForTest({ ok: true, allow_sim_run: true, model_available: false, provider: 'ollama', configured_provider: 'ollama', model: 'stale-pick' });
    DEMO._setModelInfoForTest({ ok: true, provider: 'ollama', is_cloud: false, selected_model: 'stale-pick', model_available: false, allow_sim_run: true, models: [{ name: 'qwen2.5:7b', available: true }] });
    HEALTH_PROVIDER = 'ollama'; SELECTED_MODEL = 'qwen2.5:7b'; HEALTH_MODE = 'true';
    // /api/ai/model/reset returns the refreshed default payload (model now available).
    SELECT_PAYLOAD = { ok: true, reset: true, provider: 'ollama', is_cloud: false, selected_model: 'qwen2.5:7b', model_available: true, allow_sim_run: true, provider_blocked: false, configured_provider: 'ollama', models: [{ name: 'qwen2.5:7b', available: true }] };
    const beforeFetches = fetchCalls.length;
    await DEMO._resetModelSelectionForTest();
    await flush();
    assert.ok(fetchCalls.some(function (c) { return /\/api\/ai\/model\/reset/.test(c.url) && c.opts && c.opts.method === 'POST'; }), 'POSTed /api/ai/model/reset');
    assert.ok(fetchCalls.length > beforeFetches, 'made network calls');
    const s = DEMO._modelFlowStatusForTest();
    assert.strictEqual(s.state, 'ready', 'card reflects the refreshed default selection');
});

console.log('\n14) Staff-Safe stays available while AI Commander is blocked (#12)');
test('AI Commander blocked (no model) but the Staff-Safe Generate button is present + unwarned', function () {
    DEMO._setRouteHealthForTest({ ok: true, allow_sim_run: true, model_available: false, provider: 'ollama', configured_provider: 'ollama', model: 'qwen3.6-plus-free' });
    DEMO._setModelInfoForTest({ ok: true, provider: 'ollama', is_cloud: false, selected_model: 'qwen3.6-plus-free', model_available: false, allow_sim_run: true, models: [{ name: 'qwen2.5:7b', available: true }, { name: 'qwen3.6-plus-free', available: false }] });
    DEMO._setPlanningModeForTest('staff_safe');
    const html = String(DEMO._renderAiDecisionHtmlForTest());
    assert.ok(/Generate Staff-Safe Plan \(fast\)/.test(html), 'Staff-Safe Generate available while AI is blocked');
    assert.ok(!/data-ff-coa="generate-warning"/.test(html), 'Staff-Safe shows no blocked warning');
    DEMO._setPlanningModeForTest('commander');
});

console.log('\n' + (fail === 0 ? '✅ PASS' : '❌ FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail === 0 ? 0 : 1);
})();
