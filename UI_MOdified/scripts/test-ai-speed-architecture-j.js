'use strict';
/* ============================================================================
 * test-ai-speed-architecture-j.js — RMOOZ-AI-SPEED-ARCHITECTURE-J
 * ----------------------------------------------------------------------------
 * Performance architecture (no combat/movement/COA-validation/terrain/Staff-Safe
 * change). Proves:
 *   1) debug_timing exposes the perf spans (diagnosis)
 *   2) OpenRouter provider routing (provider.sort) honors RMOOZ_OPENROUTER_PROVIDER_SORT
 *   3) mode-based output token limits are passed (fast 800 / normal 1200 / deep 2500)
 *   4) capability analysis is REUSED across turns when OOB/equipment unchanged (cache)
 *   5) strict json_schema is requested when a schema is supplied; json_object fallback
 *   6) the "AI Performance Breakdown" UI renders the spans + cache hit/miss
 *
 * Run: node scripts/test-ai-speed-architecture-j.js   (exit 0 = green)
 * ========================================================================== */
const assert = require('assert');
const path   = require('path');

let pass = 0, fail = 0;
function test(name, fn) { try { fn(); console.log('  ✓ ' + name); pass++; } catch (e) { console.log('  ✗ ' + name + ' — ' + (e && e.message)); fail++; } }
async function atest(name, fn) { try { await fn(); console.log('  ✓ ' + name); pass++; } catch (e) { console.log('  ✗ ' + name + ' — ' + (e && e.message)); fail++; } }

const SRV  = path.join(__dirname, '..', 'server', 'ai');
const ORC  = require(path.join(SRV, 'openrouter-client.js'));
const P    = require(path.join(SRV, 'free-fight-coa-planner.js'));

function withEnv(kv, fn) {
    const saved = {}; Object.keys(kv).forEach(function (k) { saved[k] = process.env[k]; if (kv[k] == null) delete process.env[k]; else process.env[k] = kv[k]; });
    let done = false;
    function restore() { if (done) return; done = true; Object.keys(saved).forEach(function (k) { if (saved[k] == null) delete process.env[k]; else process.env[k] = saved[k]; }); }
    try {
        const r = fn();
        if (r && typeof r.then === 'function') return r.then(function (v) { restore(); return v; }, function (e) { restore(); throw e; });  // async-aware
        restore(); return r;
    } catch (e) { restore(); throw e; }
}

(async function () {
console.log('\n═══ RMOOZ-AI-SPEED-ARCHITECTURE-J ═══\n');

console.log('Phase 1.1) OpenRouter provider routing (provider.sort)');
test('default provider sort = latency (speed by default)', function () {
    withEnv({ RMOOZ_OPENROUTER_PROVIDER_SORT: null }, function () {
        assert.deepStrictEqual(ORC.providerPrefs(), { sort: 'latency' });
    });
});
test('RMOOZ_OPENROUTER_PROVIDER_SORT=throughput|price honored; none disables', function () {
    withEnv({ RMOOZ_OPENROUTER_PROVIDER_SORT: 'throughput' }, function () { assert.deepStrictEqual(ORC.providerPrefs(), { sort: 'throughput' }); });
    withEnv({ RMOOZ_OPENROUTER_PROVIDER_SORT: 'price' }, function () { assert.deepStrictEqual(ORC.providerPrefs(), { sort: 'price' }); });
    withEnv({ RMOOZ_OPENROUTER_PROVIDER_SORT: 'none' }, function () { assert.strictEqual(ORC.providerPrefs(), null); });
    withEnv({ RMOOZ_OPENROUTER_PROVIDER_SORT: 'garbage' }, function () { assert.deepStrictEqual(ORC.providerPrefs(), { sort: 'latency' }); });
});
test('structured output default on; RMOOZ_OPENROUTER_STRUCTURED_OUTPUT=0 disables', function () {
    withEnv({ RMOOZ_OPENROUTER_STRUCTURED_OUTPUT: null }, function () { assert.strictEqual(ORC.useStructuredOutput(), true); });
    withEnv({ RMOOZ_OPENROUTER_STRUCTURED_OUTPUT: '0' }, function () { assert.strictEqual(ORC.useStructuredOutput(), false); });
});

console.log('\nPhase 1.3 + 4) mode-based token limits + schema passed (captured at the provider boundary)');
// A fake provider captures the args _callLlm sends to .generate (no network). Force local provider.
function captureGenerateArgs(opts) {
    let captured = null;
    const fakeProvider = { generate: function (args) { captured = args; return Promise.resolve({ ok: false, error: 'capture-only' }); } };
    const units = [{ id: 'R-1', side: 'RED', lat: 25, lon: 51, platform: 'BMP-3' }, { id: 'R-2', side: 'RED', lat: 25.1, lon: 51.1, platform: 'T-72' }];
    const ctx = { active_side: 'RED' };
    return withEnv({ RMOOZ_LLM_PROVIDER: 'ollama' }, function () {        // force local so _callLlm calls generate
        return P._callLlmForTest(units, [{ name: 'X', lat: 25.3, lon: 51.3 }], ctx, Object.assign({ allowed_unit_ids: ['R-1', 'R-2'] }, opts), fakeProvider).then(function () { return captured; });
    });
}
await atest('fast → numPredict 800, normal → 1200, deep → 2500', async function () {
    const f = await captureGenerateArgs({ ai_depth: 'fast' });
    const n = await captureGenerateArgs({ ai_depth: 'normal' });
    const d = await captureGenerateArgs({ ai_depth: 'deep' });
    assert.ok(f && f.options && f.options.numPredict === 800, 'fast=800 (got ' + (f && f.options && f.options.numPredict) + ')');
    assert.strictEqual(n.options.numPredict, 1200, 'normal=1200');
    assert.strictEqual(d.options.numPredict, 2500, 'deep=2500');
});
await atest('per-tier env override (RMOOZ_AI_MAX_OUTPUT_NORMAL)', async function () {
    const n = await withEnv({ RMOOZ_AI_MAX_OUTPUT_NORMAL: '1000' }, function () { return captureGenerateArgs({ ai_depth: 'normal' }); });
    assert.strictEqual(n.options.numPredict, 1000);
});
await atest('COA schema passed only when RMOOZ_OPENROUTER_COA_SCHEMA=1', async function () {
    const off = await captureGenerateArgs({ ai_depth: 'normal' });
    assert.ok(!off.schema, 'no schema by default');
    const on = await withEnv({ RMOOZ_OPENROUTER_COA_SCHEMA: '1' }, function () { return captureGenerateArgs({ ai_depth: 'normal' }); });
    assert.ok(on.schema && on.schema.type === 'object' && on.schema.properties && on.schema.properties.coas, 'schema present when gated on');
    assert.strictEqual(on.schemaName, 'rmooz_coa_set');
});

console.log('\nPhase 3) capability analysis REUSED across turns when OOB/equipment unchanged');
await atest('cap_cache miss on turn 1, HIT on turn 2 after units move (same OOB)', async function () {
    P._clearPerfCacheForTest();
    const red = [{ id: 'R-1', side: 'RED', platform: 'BMP-3', lat: 25.0, lon: 51.0 }, { id: 'B-1', side: 'BLUE', platform: 'M1A2', lat: 25.3, lon: 51.3 }];
    const obj = [{ name: 'Objective X', lat: 25.3, lon: 51.3 }];
    const p1 = await withEnv({ RMOOZ_ALLOW_SIM_RUN: '1' }, function () { return P.planCoas(red, obj, { active_side: 'RED' }, { preferSide: 'RED', planning_mode: 'staff_safe', useLlm: true, ai_depth: 'normal' }); });
    assert.strictEqual(p1.debug_timing.cap_cache, 'miss', 'turn 1 = miss');
    red[0].lat = 25.15; red[0].lon = 51.15;   // MOVE the unit (position changes; OOB/equipment same)
    const p2 = await withEnv({ RMOOZ_ALLOW_SIM_RUN: '1' }, function () { return P.planCoas(red, obj, { active_side: 'RED' }, { preferSide: 'RED', planning_mode: 'staff_safe', useLlm: true, ai_depth: 'normal' }); });
    assert.strictEqual(p2.debug_timing.cap_cache, 'hit', 'turn 2 = hit (survives movement)');
    assert.ok(p2.debug_timing.analyze_unit_capabilities_ms <= p1.debug_timing.analyze_unit_capabilities_ms, 'cap time not higher on a hit');
    assert.ok(p2.debug_timing.cap_cache_hits >= 1, 'hit counter incremented');
});
await atest('changing equipment INVALIDATES the cache (miss again)', async function () {
    P._clearPerfCacheForTest();
    const red = [{ id: 'R-1', side: 'RED', platform: 'BMP-3', lat: 25.0, lon: 51.0 }, { id: 'B-1', side: 'BLUE', platform: 'M1A2', lat: 25.3, lon: 51.3 }];
    const obj = [{ name: 'X', lat: 25.3, lon: 51.3 }];
    const o = { preferSide: 'RED', planning_mode: 'staff_safe', useLlm: true, ai_depth: 'normal' };
    const p1 = await withEnv({ RMOOZ_ALLOW_SIM_RUN: '1' }, function () { return P.planCoas(red, obj, { active_side: 'RED' }, o); });
    assert.strictEqual(p1.debug_timing.cap_cache, 'miss');
    red[0].platform = 'T-90';   // equipment change → different OOB → miss
    const p2 = await withEnv({ RMOOZ_ALLOW_SIM_RUN: '1' }, function () { return P.planCoas(red, obj, { active_side: 'RED' }, o); });
    assert.strictEqual(p2.debug_timing.cap_cache, 'miss', 'equipment change invalidates');
});
await atest('RMOOZ_AI_PERF_CACHE=0 disables the cache (always miss)', async function () {
    const red = [{ id: 'R-1', side: 'RED', platform: 'BMP-3', lat: 25, lon: 51 }, { id: 'B-1', side: 'BLUE', platform: 'M1', lat: 25.3, lon: 51.3 }];
    const obj = [{ name: 'X', lat: 25.3, lon: 51.3 }];
    const o = { preferSide: 'RED', planning_mode: 'staff_safe', useLlm: true, ai_depth: 'normal' };
    await withEnv({ RMOOZ_ALLOW_SIM_RUN: '1', RMOOZ_AI_PERF_CACHE: '0' }, async function () {
        P._clearPerfCacheForTest();
        const p1 = await P.planCoas(red, obj, { active_side: 'RED' }, o);
        const p2 = await P.planCoas(red, obj, { active_side: 'RED' }, o);
        assert.strictEqual(p1.debug_timing.cap_cache, 'miss');
        assert.strictEqual(p2.debug_timing.cap_cache, 'miss', 'cache disabled → still miss');
    });
});

console.log('\nDiagnosis #1/#3) debug_timing spans + "AI Performance Breakdown" UI');
await atest('planCoas debug_timing exposes the required spans', async function () {
    P._clearPerfCacheForTest();
    const red = [{ id: 'R-1', side: 'RED', platform: 'BMP-3', lat: 25, lon: 51 }, { id: 'B-1', side: 'BLUE', platform: 'M1', lat: 25.3, lon: 51.3 }];
    const p = await withEnv({ RMOOZ_ALLOW_SIM_RUN: '1' }, function () { return P.planCoas(red, [{ name: 'X', lat: 25.3, lon: 51.3 }], { active_side: 'RED' }, { preferSide: 'RED', planning_mode: 'staff_safe', ai_depth: 'normal' }); });
    const t = p.debug_timing;
    // Deterministic (Staff-Safe) path spans — always present. validation_ms / llm_ms / llm_repair_ms
    // appear additionally on the LLM path (not exercised here without a live model).
    ['total_ms', 'analyze_unit_capabilities_ms', 'build_scenario_intel_ms', 'tactical_terrain_context_ms', 'build_commander_prompt_pack_ms', 'cap_cache'].forEach(function (k) {
        assert.ok(k in t, 'debug_timing exposes ' + k);
    });
});

console.log('\nDiagnosis UI) AI Performance Breakdown renders spans + cache + provider/model');
test('_coaTimingHtml renders the breakdown with spans + cache hit/miss', function () {
    // minimal DOM/window so the client module loads
    const elById = {}; function mk(t) { const e = { tagName: t, id: '', innerHTML: '', children: [], style: {}, appendChild(c) { this.children.push(c); if (c && c.id) elById[c.id] = c; return c; }, removeChild(c) { return c; }, setAttribute() {}, removeAttribute() {}, addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; }, getAttribute() { return null; } }; Object.defineProperty(e, 'parentNode', { value: null, writable: true }); return e; }
    global.document = { body: mk('b'), head: mk('h'), createElement: mk, getElementById: id => elById[id] || null, querySelector: () => null, addEventListener() {}, dispatchEvent() { return true; } };
    global.CustomEvent = function (n, d) { this.type = n; this.detail = d && d.detail; };
    global.window = { document: global.document, AppShellEventLog: { append() {} }, sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} }, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, fetch: () => Promise.reject(new Error('no')) };
    global.window.window = global.window;
    const C = path.join(__dirname, '..', 'client', 'shell');
    require(path.join(C, 'world-state-db.js')); require(path.join(C, 'symbol-db.js')); require(path.join(C, 'symbol-registry.js')); require(path.join(C, 'free-fight-demo.js'));
    const DEMO = global.window.RmoozFreeFightDemo;
    const timing = { total_ms: 4200, llm_ms: 3800, analyze_unit_capabilities_ms: 0, tactical_terrain_context_ms: 2, validation_ms: 1, commander_brief_ms: 1, cap_cache: 'hit', cap_cache_hits: 3, cap_cache_misses: 1 };
    const plan = { provider_used: 'openrouter', model_used: 'qwen/qwen3.5-397b-a17b', usage: { output_tokens: 742 } };
    const html = String(DEMO._coaTimingHtmlForTest(timing, plan));
    assert.ok(/AI Performance Breakdown/.test(html), 'titled "AI Performance Breakdown"');
    assert.ok(/AI total/.test(html) && /LLM/.test(html) && /capability/.test(html), 'shows the spans');
    assert.ok(/capability cache:/.test(html) && /hit/.test(html), 'shows cache hit/miss');
    assert.ok(/qwen\/qwen3\.5-397b-a17b/.test(html), 'shows provider/model');
    assert.ok(/742/.test(html), 'shows output tokens');
});

console.log('\n' + (fail === 0 ? '✅ PASS' : '❌ FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail === 0 ? 0 : 1);
})();
