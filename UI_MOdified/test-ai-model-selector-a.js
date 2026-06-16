'use strict';
/* ============================================================================
 * test-ai-model-selector-a.js — RMOOZ-LOCAL-MODEL-SELECTOR-A
 * ----------------------------------------------------------------------------
 * Static + unit coverage (no server) for the in-app local-model selector:
 *   - Ollama /api/tags parsing → model availability
 *   - selection persists to runtime/ai-model-selection.json
 *   - runtime selection overrides the env default
 *   - missing/corrupt selection falls back safely + env precedence
 *     (RMOOZ_OLLAMA_MODEL wins among env vars)
 *   - AI Free Fight (decision) + Generate AI Attack Plan (coa _callLlm) call
 *     the LLM with the selected model
 *   - route health reports selected_model + model_available
 *   - the global HUD module + the Free Fight card render the dropdown + status
 *   - regression: no AI surface hardcodes qwen3-coder / 'auto' anymore
 *
 * Run: node test-ai-model-selector-a.js   (exit 0 = green)
 * ========================================================================== */
const assert = require('assert');
const fs     = require('fs');
const os     = require('os');
const path   = require('path');

const SRV = path.join(__dirname, 'server', 'ai');
const MS        = require(path.join(SRV, 'model-selection.js'));
const COA       = require(path.join(SRV, 'free-fight-coa-planner.js'));
const DECISION  = require(path.join(SRV, 'free-fight-llm-decision.js'));
const AI_CONFIG = require(path.join(SRV, 'ai-config.js'));

let pass = 0, fail = 0;
function test(name, fn) { try { fn(); console.log('  ✓ ' + name); pass++; } catch (e) { console.log('  ✗ ' + name + ' — ' + (e && e.message)); fail++; } }
async function atest(name, fn) { try { await fn(); console.log('  ✓ ' + name); pass++; } catch (e) { console.log('  ✗ ' + name + ' — ' + (e && e.message)); fail++; } }

// ── isolate persistence + env so tests are deterministic ─────────────────────
const TMP = path.join(os.tmpdir(), 'rmooz-model-sel-test-' + process.pid + '.json');
MS._setSelectionFileForTest(TMP);

const ENV_KEYS = ['RMOOZ_OLLAMA_MODEL', 'RMOOZ_FREE_FIGHT_MODEL', 'RMOOZ_LOCAL_LLM_MODEL', 'RMOOZ_AI_MODEL', 'RMOOZ_ALLOW_SIM_RUN', 'RMOOZ_FREE_FIGHT_PROVIDER'];
const envSnap = {}; ENV_KEYS.forEach(function (k) { envSnap[k] = process.env[k]; });
function clearModelEnv() { ['RMOOZ_OLLAMA_MODEL', 'RMOOZ_FREE_FIGHT_MODEL', 'RMOOZ_LOCAL_LLM_MODEL', 'RMOOZ_AI_MODEL'].forEach(function (k) { delete process.env[k]; }); }
function resetSel() { try { fs.unlinkSync(TMP); } catch (_) {} MS._reloadForTest(); }

(async function () {
console.log('\n═══ RMOOZ-LOCAL-MODEL-SELECTOR-A ═══\n');

console.log('A) model-selection — persistence + precedence');
test('selection persists to disk + survives reload', function () {
    clearModelEnv(); resetSel();
    const r = MS.setSelectedModel('persist-me:1');
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.persisted, true);
    const onDisk = JSON.parse(fs.readFileSync(TMP, 'utf8'));
    assert.strictEqual(onDisk.model, 'persist-me:1');
    assert.strictEqual(onDisk.source, 'ui_selection');
    MS._reloadForTest();
    assert.strictEqual(MS.getSelectedModel(), 'persist-me:1');
});
test('runtime selection overrides the env default', function () {
    clearModelEnv(); resetSel();
    process.env.RMOOZ_OLLAMA_MODEL = 'env-ollama:2';
    MS.setSelectedModel('picked:3');
    assert.strictEqual(MS.getSelectedModel(), 'picked:3');
});
test('no selection → RMOOZ_OLLAMA_MODEL wins among env vars', function () {
    clearModelEnv(); resetSel();
    process.env.RMOOZ_OLLAMA_MODEL    = 'ollama:A';
    process.env.RMOOZ_FREE_FIGHT_MODEL = 'ff:B';
    process.env.RMOOZ_AI_MODEL         = 'ai:C';
    assert.strictEqual(MS.getSelectedModel(), 'ollama:A');
    assert.strictEqual(MS.selectionSource(), 'env:RMOOZ_OLLAMA_MODEL');
});
test('env precedence falls through OLLAMA → FREE_FIGHT → LOCAL → AI', function () {
    clearModelEnv(); resetSel();
    process.env.RMOOZ_FREE_FIGHT_MODEL = 'ff:B';
    process.env.RMOOZ_AI_MODEL         = 'ai:C';
    assert.strictEqual(MS.getSelectedModel(), 'ff:B');
    delete process.env.RMOOZ_FREE_FIGHT_MODEL;
    assert.strictEqual(MS.getSelectedModel(), 'ai:C');
});
test('corrupt selection file falls back safely (no throw)', function () {
    clearModelEnv();
    fs.writeFileSync(TMP, '{ this is not valid json', 'utf8');
    MS._reloadForTest();
    assert.strictEqual(MS.getSelectedModel(), AI_CONFIG.defaultModel);
});
test('no selection + no env → ai-config committed default', function () {
    clearModelEnv(); resetSel();
    assert.strictEqual(MS.getSelectedModel(), AI_CONFIG.defaultModel);
    assert.strictEqual(MS.selectionSource(), 'default');
});

console.log('\nB) Ollama /api/tags parsing + availability');
await atest('probeModelAvailable parses /api/tags + reports availability', async function () {
    const realFetch = global.fetch;
    global.fetch = async function () { return { ok: true, json: async function () { return { models: [{ name: 'qwen2.5:7b' }, { name: 'llama3.2:1b' }] }; } }; };
    try {
        const a = await COA.probeModelAvailable('ollama', 'qwen2.5:7b');
        assert.strictEqual(a.available, true);
        assert.deepStrictEqual(a.models, ['qwen2.5:7b', 'llama3.2:1b']);
        const b = await COA.probeModelAvailable('ollama', 'not-installed:1');
        assert.strictEqual(b.available, false);
        assert.ok(/not-installed:1/.test(b.reason));
    } finally { global.fetch = realFetch; }
});

console.log('\nC) shared resolver + route health');
test('coa-planner resolveLocalModel returns the selection', function () {
    clearModelEnv(); resetSel();
    MS.setSelectedModel('coa-sel:5');
    assert.strictEqual(COA.resolveLocalModel(), 'coa-sel:5');
});
test('routeHealth reports selected_model + model_available + available_models_count', function () {
    clearModelEnv(); resetSel();
    MS.setSelectedModel('rh:7');
    const hh = COA.routeHealth();
    assert.strictEqual(hh.selected_model, 'rh:7');
    assert.strictEqual(hh.model, 'rh:7');
    assert.ok('model_available' in hh, 'has model_available field');
    assert.ok('available_models_count' in hh, 'has available_models_count field');
    assert.strictEqual(typeof hh.selection_source, 'string');
});

console.log('\nD) AI surfaces call the LLM with the selected model');
await atest('AI Free Fight (decision) uses the selected model', async function () {
    clearModelEnv(); resetSel();
    MS.setSelectedModel('ff-decide:8');
    process.env.RMOOZ_ALLOW_SIM_RUN = '1';
    let usedModel = null;
    const fakeProvider = { generate: async function (args) { usedModel = args.model; return { ok: true, providerUsed: 'ollama', response: JSON.stringify({ action_type: 'HOLD_POSITION', side: 'RED', unit_uid: 'R-1', reason: 'hold', risk: 'low', confidence: 'low' }) }; } };
    const units = [{ id: 'R-1', side: 'RED', lat: 24.7, lon: 54.8 }];
    const objectives = [{ lat: 24.4, lon: 54.3, name: 'Objective X' }];
    const r = await DECISION.askLlmForAction(units, objectives, { preferSide: 'RED', allowed_unit_ids: ['R-1'] }, fakeProvider);
    assert.strictEqual(usedModel, 'ff-decide:8');
    if (r && r.model_used) assert.strictEqual(r.model_used, 'ff-decide:8');
});
await atest('Generate AI Attack Plan (coa _callLlm) uses the selected model', async function () {
    clearModelEnv(); resetSel();
    MS.setSelectedModel('attack:9');
    process.env.RMOOZ_ALLOW_SIM_RUN = '1';
    process.env.RMOOZ_FREE_FIGHT_ATTEMPTS = '1';
    let usedModel = null;
    const fakeProvider = { generate: async function (args) { usedModel = args.model; return { ok: true, providerUsed: 'ollama', response: JSON.stringify({ coas: [] }) }; } };
    const units = [{ id: 'R-1', side: 'RED', lat: 24.7, lon: 54.8 }];
    const objectives = [{ lat: 24.4, lon: 54.3, name: 'Objective X' }];
    await COA._callLlmForTest(units, objectives, {}, { preferSide: 'RED' }, fakeProvider);
    delete process.env.RMOOZ_FREE_FIGHT_ATTEMPTS;
    assert.strictEqual(usedModel, 'attack:9');
});

console.log('\nE) UI — Free Fight card renders the picker (DOM harness)');
test('Free Fight card renders dropdown + Use + Refresh + status', function () {
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
    global.document = { body: makeEl('body'), head: makeEl('head'), createElement: makeEl, getElementById: function (id) { return elById[id] || null; }, querySelector: function () { return null; }, addEventListener: function () {} };
    global.window = { document: global.document, AppShellEventLog: { append: function () {} },
        sessionStorage: (function () { const d = {}; return { getItem: function (k) { return d[k] || null; }, setItem: function (k, v) { d[k] = String(v); }, removeItem: function (k) { delete d[k]; } }; })(),
        setTimeout: function () { return 0; }, clearTimeout: function () {}, setInterval: function () { return 0; }, clearInterval: function () {},
        fetch: function () { return Promise.reject(new Error('no fetch in render test')); } };
    global.window.window = global.window;
    const C = path.join(__dirname, 'client', 'shell');
    require(path.join(C, 'world-state-db.js'));
    require(path.join(C, 'symbol-db.js'));
    require(path.join(C, 'symbol-registry.js'));
    require(path.join(C, 'free-fight-demo.js'));
    const DEMO = global.window.RmoozFreeFightDemo;
    assert.ok(DEMO && typeof DEMO._renderModelSelectorHtmlForTest === 'function', 'render test hook present');
    DEMO._setModelInfoForTest({ ok: true, provider: 'ollama', selected_model: 'qwen2.5:7b',
        models: [{ name: 'qwen2.5:7b', available: true }, { name: 'llama3.2:1b', available: true }],
        available_models_count: 2, model_available: true, allow_sim_run: true });
    const html = DEMO._renderModelSelectorHtmlForTest();
    assert.ok(/data-act="model-select"/.test(html), 'has model dropdown');
    assert.ok(/data-act="model-use"/.test(html), 'has Use button');
    assert.ok(/data-act="model-refresh"/.test(html), 'has Refresh button');
    assert.ok(/qwen2\.5:7b/.test(html), 'shows the selected model');
    assert.ok(/Provider: Ollama/.test(html), 'shows the provider');
    assert.ok(/RMOOZ_ALLOW_SIM_RUN/.test(html), 'shows the AI execution gate');
});

console.log('\nF) UI — global HUD module + app.html wiring (static)');
test('global HUD renders dropdown/use/refresh/status + uses endpoints + fires sync event', function () {
    const src = fs.readFileSync(path.join(__dirname, 'client', 'shell', 'ai-model-hud.js'), 'utf8');
    assert.ok(/ai-model-hud-select/.test(src), 'has model dropdown');
    assert.ok(/data-act="use"/.test(src), 'has Use button');
    assert.ok(/data-act="refresh"/.test(src), 'has Refresh button');
    assert.ok(/\/api\/ai\/models/.test(src), 'calls GET /api/ai/models');
    assert.ok(/\/api\/ai\/model\/select/.test(src), 'calls POST /api/ai/model/select');
    assert.ok(/rmooz:ai-model-changed/.test(src), 'fires the cross-sync event');
    assert.ok(/Ollama/.test(src), 'labels the provider');
    assert.ok(/RMOOZ_ALLOW_SIM_RUN/.test(src), 'surfaces the AI gate');
});
test('app.html mounts the global HUD + includes the script (cache-busted)', function () {
    const html = fs.readFileSync(path.join(__dirname, 'client', 'app.html'), 'utf8');
    assert.ok(/id="ai-model-hud-mount"/.test(html), 'has the HUD mount point');
    assert.ok(/shell\/ai-model-hud\.js\?v=/.test(html), 'includes the HUD script with ?v=');
});

console.log('\nG) regression — no divergent model default / cloud leak');
test('the four free-fight modules resolve the model via the canonical resolver (no qwen3-coder)', function () {
    // RMOOZ-LLM-RUNTIME-CONFIG-A: the modules now resolve the model through
    // llm-runtime-config.js (LLM_CFG.getModel), which delegates to model-selection
    // (operator UI pick) → env default. Same shared single source, one layer up.
    ['free-fight-llm-decision.js', 'free-fight-coa-planner.js', 'free-fight-llm-capability-analyst.js', 'free-fight-llm-plan.js'].forEach(function (f) {
        const src = fs.readFileSync(path.join(SRV, f), 'utf8');
        assert.ok(/LLM_CFG\.getModel\(/.test(src), f + ' resolves the model via llm-runtime-config (LLM_CFG.getModel)');
        // Strip comments so a historical note ("the old qwen3-coder default…") is allowed,
        // but an ACTIVE qwen3-coder fallback in code is not.
        const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
        assert.ok(!/qwen3-coder/.test(code), f + ' has no active qwen3-coder default');
    });
});
test('free-fight-llm-plan no longer defaults the provider to "auto" (cloud leak closed)', function () {
    const src = fs.readFileSync(path.join(SRV, 'free-fight-llm-plan.js'), 'utf8');
    assert.ok(!/\|\|\s*'auto'/.test(src), "no || 'auto' provider fallback remains");
});

// ── cleanup ──────────────────────────────────────────────────────────────────
try { fs.unlinkSync(TMP); } catch (_) {}
MS._setSelectionFileForTest(null);
ENV_KEYS.forEach(function (k) { if (envSnap[k] == null) delete process.env[k]; else process.env[k] = envSnap[k]; });

console.log('\n' + (fail === 0 ? '✅ PASS' : '❌ FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail === 0 ? 0 : 1);
})();
