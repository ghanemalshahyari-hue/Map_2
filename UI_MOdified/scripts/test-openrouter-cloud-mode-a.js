'use strict';
/* ============================================================================
 * test-openrouter-cloud-mode-a.js — RMOOZ-OPENROUTER-QWEN35-CLOUD-MODE-A
 * ----------------------------------------------------------------------------
 * OpenRouter is an EXPLICIT, GATED cloud mode. Default stays local-only/offline.
 * Stubbed — no network, no real key (a clearly-FAKE non-sk-or key string is used
 * only to satisfy the "key present" branch; it never leaves the process).
 *
 *   1) OpenRouter BLOCKED when RMOOZ_ALLOW_CLOUD_AI != 1 (remote_blocked, 0 calls)
 *   2) OpenRouter BLOCKED when the API key is missing (cloud on, no key)
 *   3) openrouter-client parses /api/v1/models ({data:[{id}]})
 *   4) model selector persists { provider:'openrouter', model }
 *   5) Free Fight uses the selected OpenRouter model ONLY when cloud-ready
 *      → provider=openrouter, model=<selected>, plan_source='llm'
 *   6) candidate pre-filter STILL limits to ≤25 before the OpenRouter call
 *   7) no real OpenRouter key literal in source; .env.example OPENROUTER_API_KEY blank
 *   8) local Ollama remains the DEFAULT + zen/claude stay blocked
 *
 * Run: node scripts/test-openrouter-cloud-mode-a.js   (exit 0 = green)
 * ========================================================================== */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SRV = path.join(__dirname, '..', 'server', 'ai');
const AI_CONFIG = require(path.join(SRV, 'ai-config.js'));
const LLM = require(path.join(SRV, 'llm-runtime-config.js'));
const COA = require(path.join(SRV, 'free-fight-coa-planner.js'));
const AIP = require(path.join(SRV, 'ai-provider.js'));
const MS  = require(path.join(SRV, 'model-selection.js'));
const OR  = require(path.join(SRV, 'openrouter-client.js'));

let pass = 0, fail = 0;
function test(name, fn) { try { fn(); console.log('  ✓ ' + name); pass++; } catch (e) { console.log('  ✗ ' + name + ' — ' + (e && e.message)); fail++; } }
async function atest(name, fn) { try { await fn(); console.log('  ✓ ' + name); pass++; } catch (e) { console.log('  ✗ ' + name + ' — ' + (e && e.message)); fail++; } }

// FAKE key — deliberately NOT sk-or-shaped so a repo-wide `sk-or-` scan stays clean.
const FAKE_KEY = 'FAKE-OPENROUTER-TEST-KEY-not-real';
const SAVED = {
    cloud: process.env.RMOOZ_ALLOW_CLOUD_AI, llmprov: process.env.RMOOZ_LLM_PROVIDER,
    ffprov: process.env.RMOOZ_FREE_FIGHT_PROVIDER, sim: process.env.RMOOZ_ALLOW_SIM_RUN,
    key: AI_CONFIG.openrouter.apiKey, gen: AIP.generate,
};
function cloudOn()  { process.env.RMOOZ_ALLOW_CLOUD_AI = '1'; AI_CONFIG.openrouter.apiKey = FAKE_KEY; }
function cloudKeyMissing() { process.env.RMOOZ_ALLOW_CLOUD_AI = '1'; AI_CONFIG.openrouter.apiKey = ''; }
function cloudOff() { delete process.env.RMOOZ_ALLOW_CLOUD_AI; }
function restoreAll() {
    if (SAVED.cloud === undefined) delete process.env.RMOOZ_ALLOW_CLOUD_AI; else process.env.RMOOZ_ALLOW_CLOUD_AI = SAVED.cloud;
    if (SAVED.llmprov === undefined) delete process.env.RMOOZ_LLM_PROVIDER; else process.env.RMOOZ_LLM_PROVIDER = SAVED.llmprov;
    if (SAVED.ffprov === undefined) delete process.env.RMOOZ_FREE_FIGHT_PROVIDER; else process.env.RMOOZ_FREE_FIGHT_PROVIDER = SAVED.ffprov;
    if (SAVED.sim === undefined) delete process.env.RMOOZ_ALLOW_SIM_RUN; else process.env.RMOOZ_ALLOW_SIM_RUN = SAVED.sim;
    AI_CONFIG.openrouter.apiKey = SAVED.key; AIP.generate = SAVED.gen; MS._setSelectionFileForTest(null);
}

const TMP = path.join(os.tmpdir(), 'or-test-' + process.pid + '.json');
MS._setSelectionFileForTest(TMP);

const VALID_COAS = [
    { plan_id: 'COA-1', title: 'Recon', recommended: true, risk: 'low', confidence: 'low', phases: [{ name: 'Move', actions: [{ unit_uid: 'R-1', side: 'RED', role: 'recon', action_type: 'hold', target: { lat: 25.30, lon: 51.20, type: 'coord' }, reason: 'x', why_unit: 'y' }] }], non_selected_units: [], risks: ['r'], assumptions: ['a'] },
    { plan_id: 'COA-2', title: 'Screen', recommended: false, risk: 'medium', confidence: 'low', phases: [{ name: 'Move', actions: [{ unit_uid: 'R-2', side: 'RED', role: 'screen', action_type: 'hold', target: { lat: 25.33, lon: 51.23, type: 'coord' }, reason: 'x', why_unit: 'y' }] }], non_selected_units: [], risks: ['r'], assumptions: ['a'] },
];
const SMALL = [
    { id: 'R-1', side: 'RED', country: 'Qatar', lat: 25.30, lon: 51.20, platform: 'fighter jet' },
    { id: 'R-2', side: 'RED', country: 'Qatar', lat: 25.33, lon: 51.23, platform: 'armor' },
    { id: 'R-3', side: 'RED', country: 'Qatar', lat: 25.36, lon: 51.26, platform: 'frigate' },
    { id: 'B-1', side: 'BLUE', country: 'Bahrain', lat: 25.55, lon: 51.42, platform: 'SAM battery' },
];
const OBJ = [{ lat: 25.30, lon: 51.20, name: 'Objective X (Qatar)' }];

(async function () {
console.log('\n═══ RMOOZ-OPENROUTER-QWEN35-CLOUD-MODE-A ═══\n');

console.log('1) OpenRouter blocked when RMOOZ_ALLOW_CLOUD_AI != 1');
test('cloud off → openrouterReady false, isRemoteProvider(openrouter) true', function () {
    cloudOff(); AI_CONFIG.openrouter.apiKey = FAKE_KEY; // key present, but gate OFF
    assert.strictEqual(LLM.cloudAllowed(), false);
    assert.strictEqual(LLM.openrouterReady(), false);
    assert.strictEqual(COA.isRemoteProvider('openrouter'), true);
});
await atest('_callLlm(openrouter) + cloud off → remote_blocked, ZERO provider calls', async function () {
    cloudOff(); AI_CONFIG.openrouter.apiKey = FAKE_KEY; process.env.RMOOZ_LLM_PROVIDER = 'openrouter';
    let calls = 0; const spy = { generate: function () { calls++; return Promise.resolve({ ok: true, response: '{}' }); } };
    const r = await COA._callLlmForTest([{ id: 'R-1', side: 'RED', lat: 25.3, lon: 51.2 }], OBJ, {}, {}, spy);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.llm_status, 'remote_blocked');
    assert.strictEqual(r.fallback_reason, 'remote_provider_not_allowed_for_free_fight');
    assert.strictEqual(calls, 0, 'NO cloud call when cloud disabled');
    delete process.env.RMOOZ_LLM_PROVIDER;
});

console.log('\n2) OpenRouter blocked when the API key is missing');
test('cloud on but no key → openrouterReady false → openrouter blocked', function () {
    cloudKeyMissing(); process.env.RMOOZ_LLM_PROVIDER = 'openrouter';
    assert.strictEqual(LLM.cloudAllowed(), true);
    assert.strictEqual(LLM.openrouterReady(), false, 'no key → not ready');
    assert.strictEqual(COA.isRemoteProvider('openrouter'), true, 'still blocked without a key');
    delete process.env.RMOOZ_LLM_PROVIDER;
});

console.log('\n3) openrouter-client parses /api/v1/models');
test('parseModelList maps {data:[{id|name}]} → ids', function () {
    const ids = OR.parseModelList({ data: [{ id: 'qwen/qwen3.5-397b-a17b' }, { id: 'anthropic/claude-3' }, { name: 'x/y' }, { foo: 1 }] });
    assert.deepStrictEqual(ids, ['qwen/qwen3.5-397b-a17b', 'anthropic/claude-3', 'x/y']);
    assert.deepStrictEqual(OR.parseModelList({}), []);
});

console.log('\n4) model selector persists { provider:openrouter, model }');
test('setSelectedModel(model, "openrouter") round-trips', function () {
    MS._setSelectionFileForTest(TMP);
    const r = MS.setSelectedModel('qwen/qwen3.5-397b-a17b', 'openrouter');
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.selected_provider, 'openrouter');
    assert.strictEqual(MS.selectedProviderRaw(), 'openrouter');
    assert.strictEqual(MS.getSelectedModel(), 'qwen/qwen3.5-397b-a17b');
    // an unapproved provider is rejected
    assert.strictEqual(MS.setSelectedModel('x', 'zen').ok, false, 'zen is never selectable here');
});

console.log('\n5) Free Fight uses the selected OpenRouter model ONLY when cloud-ready');
await atest('planCoas(openrouter, cloud-ready) → provider=openrouter, model=selected, plan_source=llm', async function () {
    cloudOn(); process.env.RMOOZ_ALLOW_SIM_RUN = '1'; process.env.RMOOZ_LLM_PROVIDER = 'openrouter';
    MS._setSelectionFileForTest(TMP); MS.setSelectedModel('qwen/qwen3.5-397b-a17b', 'openrouter');
    let usedModel = null, usedProvider = null;
    AIP.generate = function (args) { usedModel = args.model; usedProvider = args.provider; return Promise.resolve({ ok: true, providerUsed: 'openrouter', response: JSON.stringify({ coas: VALID_COAS }) }); };
    const r = await COA.planCoas(SMALL, OBJ, {}, { planning_mode: 'commander', ai_depth: 'normal', useLlm: true, preferSide: 'RED', commander_mode: 'free' });
    assert.strictEqual(usedProvider, 'openrouter', 'aiProvider.generate called with provider=openrouter');
    assert.strictEqual(usedModel, 'qwen/qwen3.5-397b-a17b', '...with the selected OpenRouter model');
    assert.strictEqual(r.plan_source, 'llm', 'plan_source=llm');
    if (r.provider_used != null) assert.strictEqual(r.provider_used, 'openrouter');
    if (r.model_used != null) assert.strictEqual(r.model_used, 'qwen/qwen3.5-397b-a17b');
    delete process.env.RMOOZ_LLM_PROVIDER; delete process.env.RMOOZ_ALLOW_SIM_RUN; AIP.generate = SAVED.gen;
});

console.log('\n6) candidate pre-filter still limits the prompt before the OpenRouter call');
await atest('300-unit force → candidates sent ≤ 25 and < total (filtered before cloud)', async function () {
    cloudOn(); process.env.RMOOZ_ALLOW_SIM_RUN = '1'; process.env.RMOOZ_LLM_PROVIDER = 'openrouter';
    MS._setSelectionFileForTest(TMP); MS.setSelectedModel('qwen/qwen3.5-397b-a17b', 'openrouter');
    AIP.generate = function () { return Promise.resolve({ ok: true, providerUsed: 'openrouter', response: JSON.stringify({ coas: VALID_COAS }) }); };
    const big = [];
    for (var i = 0; i < 300; i++) big.push({ id: 'R-' + i, side: 'RED', country: 'Qatar', lat: 25.30 + (i % 20) * 0.05, lon: 51.20 + Math.floor(i / 20) * 0.05, platform: 'armor' });
    big.push({ id: 'B-1', side: 'BLUE', country: 'Bahrain', lat: 25.55, lon: 51.42, platform: 'SAM battery' });
    const r = await COA.planCoas(big, OBJ, {}, { planning_mode: 'commander', ai_depth: 'normal', useLlm: true, preferSide: 'RED', commander_mode: 'free' });
    const cand = r && r.planning_trace && r.planning_trace.input_understood && r.planning_trace.input_understood.candidates;
    assert.ok(cand && cand.applied, 'candidate pre-filter applied');
    assert.ok(cand.sent >= 1 && cand.sent <= 25, 'sent in 1..25 (got ' + cand.sent + ')');
    assert.ok(cand.sent < cand.total, 'sent < total — force was filtered (' + cand.sent + '/' + cand.total + ') BEFORE the cloud call');
    delete process.env.RMOOZ_LLM_PROVIDER; delete process.env.RMOOZ_ALLOW_SIM_RUN; AIP.generate = SAVED.gen;
});

console.log('\n7) no real OpenRouter key literal in source; .env.example blank');
test('source files carry no sk-or- key; .env.example OPENROUTER_API_KEY is blank', function () {
    const files = ['ai-config.js', 'openrouter-client.js', 'ai-provider.js', 'llm-runtime-config.js', 'model-selection.js'].map(function (f) { return path.join(SRV, f); });
    files.forEach(function (p) {
        const s = fs.readFileSync(p, 'utf8');
        assert.ok(!/sk-or-[A-Za-z0-9_-]{8,}/.test(s), 'no sk-or- key literal in ' + path.basename(p));
        assert.ok(!/apiKey: *'sk-/.test(s), 'no hardcoded apiKey in ' + path.basename(p));
    });
    const env = fs.readFileSync(path.join(__dirname, '..', '.env.example'), 'utf8');
    const line = env.split(/\r?\n/).find(function (l) { return /^\s*OPENROUTER_API_KEY\s*=/.test(l); });
    assert.ok(line !== undefined, 'OPENROUTER_API_KEY present in .env.example');
    assert.strictEqual(line.split('=').slice(1).join('=').trim(), '', 'OPENROUTER_API_KEY blank placeholder');
});

console.log('\n8) local Ollama remains the default + zen/claude stay blocked');
test('no cloud env → provider ollama, ollama allowed, zen/claude blocked', function () {
    cloudOff(); delete process.env.RMOOZ_LLM_PROVIDER; delete process.env.RMOOZ_FREE_FIGHT_PROVIDER;
    MS._setSelectionFileForTest(TMP); MS.clearSelection();
    assert.strictEqual(LLM.getProvider(), 'ollama', 'default provider is local ollama');
    assert.strictEqual(COA.isRemoteProvider('ollama'), false);
    assert.strictEqual(COA.isRemoteProvider('zen'), true, 'zen still blocked');
    assert.strictEqual(COA.isRemoteProvider('claude'), true, 'claude still blocked');
    assert.strictEqual(COA.isRemoteProvider('openrouter'), true, 'openrouter blocked when cloud off');
});

restoreAll();
try { fs.unlinkSync(TMP); } catch (_) {}
console.log('\n' + (fail === 0 ? '✅ PASS' : '❌ FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail === 0 ? 0 : 1);
})().catch(function (e) { console.error('FATAL', e && e.stack || e); restoreAll(); process.exit(1); });
