'use strict';
/* ============================================================================
 * test-llm-runtime-config-a.js — RMOOZ-LLM-RUNTIME-CONFIG-A
 * ----------------------------------------------------------------------------
 * Proves the canonical LLM runtime-config resolver and that every AI/LLM feature
 * gets provider/model/timeout/repair FROM IT (no module reads those env directly).
 *
 *   A) default model resolves from RMOOZ_LLM_MODEL
 *   B) legacy RMOOZ_FREE_FIGHT_MODEL (and RMOOZ_AI_MODEL) still work
 *   C) task-specific model override wins (RMOOZ_LLM_MODEL_COA_PLANNER)
 *   D) provider: RMOOZ_LLM_PROVIDER (+ legacy RMOOZ_FREE_FIGHT_PROVIDER)
 *   E) timeout resolves consistently (canonical + legacy + task-specific)
 *   F) repair/draft attempts (canonical + legacy)
 *   G) Free Fight COA planner uses resolver output (model + provider + timeout)
 *   H) capability analyst uses resolver output (model + timeout via a real call)
 *   I) GREP PROOF: no direct process.env.RMOOZ_*MODEL/PROVIDER/TIMEOUT/REPAIR reads
 *      remain in the feature modules — only llm-runtime-config.js (and tests) read them.
 *
 * Run: node scripts/test-llm-runtime-config-a.js   (exit 0 = green)
 * ========================================================================== */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SRV       = path.join(__dirname, '..', 'server', 'ai');
const LLM_CFG   = require(path.join(SRV, 'llm-runtime-config.js'));
const AI_CONFIG = require(path.join(SRV, 'ai-config.js'));
const MS        = require(path.join(SRV, 'model-selection.js'));
const COA       = require(path.join(SRV, 'free-fight-coa-planner.js'));
const ANALYST   = require(path.join(SRV, 'free-fight-llm-capability-analyst.js'));

let pass = 0, fail = 0;
function test(name, fn) { try { fn(); console.log('  ✓ ' + name); pass++; } catch (e) { console.log('  ✗ ' + name + ' — ' + (e && e.message)); fail++; } }
async function atest(name, fn) { try { await fn(); console.log('  ✓ ' + name); pass++; } catch (e) { console.log('  ✗ ' + name + ' — ' + (e && e.message)); fail++; } }

// ── env hygiene: snapshot + clear every knob this resolver reads ──────────────
const KEYS = [
    'RMOOZ_LLM_PROVIDER', 'RMOOZ_FREE_FIGHT_PROVIDER',
    'RMOOZ_LLM_MODEL', 'RMOOZ_OLLAMA_MODEL', 'RMOOZ_FREE_FIGHT_MODEL', 'RMOOZ_LOCAL_LLM_MODEL', 'RMOOZ_AI_MODEL',
    'RMOOZ_LLM_MODEL_COA_PLANNER', 'RMOOZ_LLM_MODEL_CAPABILITY_ANALYST',
    'RMOOZ_LLM_TIMEOUT_MS', 'RMOOZ_FREE_FIGHT_TIMEOUT_MS', 'RMOOZ_AI_TIMEOUT_MS', 'RMOOZ_OLLAMA_TIMEOUT_MS',
    'RMOOZ_LLM_TIMEOUT_MS_COA_PLANNER', 'RMOOZ_LLM_TIMEOUT_MS_CAPABILITY_ANALYST',
    'RMOOZ_LLM_REPAIR_ATTEMPTS', 'RMOOZ_FREE_FIGHT_REPAIR_ATTEMPTS',
    'RMOOZ_LLM_ATTEMPTS', 'RMOOZ_FREE_FIGHT_ATTEMPTS', 'RMOOZ_LLM_KEEP_ALIVE', 'RMOOZ_ALLOW_SIM_RUN',
];
const SNAP = {};
KEYS.forEach(function (k) { SNAP[k] = process.env[k]; });
function clearAll() { KEYS.forEach(function (k) { delete process.env[k]; }); }
function restoreAll() { KEYS.forEach(function (k) { if (SNAP[k] === undefined) delete process.env[k]; else process.env[k] = SNAP[k]; }); }

// Neutralize the operator runtime selection file so model tests see env/default,
// not a stale runtime/ai-model-selection.json on this machine.
const NO_FILE = path.join(os.tmpdir(), 'rmooz-llm-cfg-no-selection-' + process.pid + '.json');
try { fs.unlinkSync(NO_FILE); } catch (_) {}
MS._setSelectionFileForTest(NO_FILE);

(async function () {
console.log('\n═══ RMOOZ-LLM-RUNTIME-CONFIG-A ═══\n');

console.log('A) default model resolves from RMOOZ_LLM_MODEL');
test('no env → ai-config committed default', function () {
    clearAll();
    assert.strictEqual(LLM_CFG.envDefaultModel(), AI_CONFIG.defaultModel);
});
test('RMOOZ_LLM_MODEL is the canonical default', function () {
    clearAll(); process.env.RMOOZ_LLM_MODEL = 'canon:1';
    assert.strictEqual(LLM_CFG.envDefaultModel(), 'canon:1');
    assert.strictEqual(LLM_CFG.envDefaultSource(), 'env:RMOOZ_LLM_MODEL');
});

console.log('\nB) legacy aliases still work (req #5)');
test('legacy RMOOZ_FREE_FIGHT_MODEL still resolves', function () {
    clearAll(); process.env.RMOOZ_FREE_FIGHT_MODEL = 'legacy-ff:2';
    assert.strictEqual(LLM_CFG.envDefaultModel(), 'legacy-ff:2');
    assert.strictEqual(LLM_CFG.envDefaultSource(), 'env:RMOOZ_FREE_FIGHT_MODEL');
});
test('legacy RMOOZ_AI_MODEL still resolves', function () {
    clearAll(); process.env.RMOOZ_AI_MODEL = 'legacy-ai:3';
    assert.strictEqual(LLM_CFG.envDefaultModel(), 'legacy-ai:3');
});
test('canonical RMOOZ_LLM_MODEL wins over legacy RMOOZ_FREE_FIGHT_MODEL', function () {
    clearAll(); process.env.RMOOZ_LLM_MODEL = 'canon:1'; process.env.RMOOZ_FREE_FIGHT_MODEL = 'legacy-ff:2';
    assert.strictEqual(LLM_CFG.envDefaultModel(), 'canon:1');
});

console.log('\nC) task-specific model override wins (req #3)');
test('RMOOZ_LLM_MODEL_COA_PLANNER wins over RMOOZ_LLM_MODEL for the coa_planner task', function () {
    clearAll(); process.env.RMOOZ_LLM_MODEL = 'canon:1'; process.env.RMOOZ_LLM_MODEL_COA_PLANNER = 'coa-task:9';
    assert.strictEqual(LLM_CFG.getModel('coa_planner'), 'coa-task:9');
    assert.strictEqual(LLM_CFG.getModel('decision'), 'canon:1', 'a different task is unaffected');
    assert.strictEqual(LLM_CFG.modelSource('coa_planner'), 'env:RMOOZ_LLM_MODEL_COA_PLANNER');
});

console.log('\nD) provider (canonical + legacy)');
test('default provider is ollama; RMOOZ_LLM_PROVIDER wins; legacy RMOOZ_FREE_FIGHT_PROVIDER works', function () {
    clearAll();
    assert.strictEqual(LLM_CFG.getProvider(), 'ollama');
    process.env.RMOOZ_FREE_FIGHT_PROVIDER = 'OLLAMA';
    assert.strictEqual(LLM_CFG.getProvider(), 'ollama', 'lower-cased legacy provider');
    process.env.RMOOZ_LLM_PROVIDER = 'zen';
    assert.strictEqual(LLM_CFG.getProvider(), 'zen', 'canonical wins (raw, so the feature modules can block it)');
});

console.log('\nE) timeout resolves consistently');
test('default 120000; canonical, legacy, and task-specific all resolve', function () {
    clearAll();
    assert.strictEqual(LLM_CFG.getTimeoutMs('coa_planner'), 120000);
    process.env.RMOOZ_AI_TIMEOUT_MS = '90000';
    assert.strictEqual(LLM_CFG.getTimeoutMs('coa_planner'), 90000, 'legacy RMOOZ_AI_TIMEOUT_MS');
    process.env.RMOOZ_FREE_FIGHT_TIMEOUT_MS = '150000';
    assert.strictEqual(LLM_CFG.getTimeoutMs('coa_planner'), 150000, 'legacy RMOOZ_FREE_FIGHT_TIMEOUT_MS wins over RMOOZ_AI_TIMEOUT_MS');
    process.env.RMOOZ_LLM_TIMEOUT_MS = '200000';
    assert.strictEqual(LLM_CFG.getTimeoutMs('coa_planner'), 200000, 'canonical RMOOZ_LLM_TIMEOUT_MS wins over legacy');
    process.env.RMOOZ_LLM_TIMEOUT_MS_COA_PLANNER = '250000';
    assert.strictEqual(LLM_CFG.getTimeoutMs('coa_planner'), 250000, 'task-specific wins');
    assert.strictEqual(LLM_CFG.getTimeoutMs('decision'), 200000, 'a different task uses the canonical, not the coa_planner override');
});

console.log('\nF) repair + draft attempts (canonical + legacy)');
test('repair attempts: default 1, RMOOZ_LLM_REPAIR_ATTEMPTS, legacy RMOOZ_FREE_FIGHT_REPAIR_ATTEMPTS', function () {
    clearAll();
    assert.strictEqual(LLM_CFG.getRepairAttempts(), 1);
    process.env.RMOOZ_FREE_FIGHT_REPAIR_ATTEMPTS = '3';
    assert.strictEqual(LLM_CFG.getRepairAttempts(), 3, 'legacy');
    process.env.RMOOZ_LLM_REPAIR_ATTEMPTS = '2';
    assert.strictEqual(LLM_CFG.getRepairAttempts(), 2, 'canonical wins');
});
test('draft attempts: default 2, RMOOZ_LLM_ATTEMPTS, legacy RMOOZ_FREE_FIGHT_ATTEMPTS', function () {
    clearAll();
    assert.strictEqual(LLM_CFG.getDraftAttempts(), 2);
    process.env.RMOOZ_FREE_FIGHT_ATTEMPTS = '5';
    assert.strictEqual(LLM_CFG.getDraftAttempts(), 5, 'legacy');
    process.env.RMOOZ_LLM_ATTEMPTS = '4';
    assert.strictEqual(LLM_CFG.getDraftAttempts(), 4, 'canonical wins');
});

console.log('\nG) Free Fight COA planner uses resolver output');
test('coa-planner resolveLocalModel / resolveLocalProvider / routeHealth reflect the resolver', function () {
    clearAll();
    process.env.RMOOZ_LLM_MODEL_COA_PLANNER = 'coa-task:9';
    process.env.RMOOZ_LLM_PROVIDER = 'ollama';
    assert.strictEqual(COA.resolveLocalModel(), 'coa-task:9', 'planner model = resolver task override');
    assert.strictEqual(COA.resolveLocalProvider(), 'ollama', 'planner provider = resolver');
    const hh = COA.routeHealth();
    assert.strictEqual(hh.model, 'coa-task:9', 'routeHealth model = resolver');
    assert.strictEqual(hh.selected_model, 'coa-task:9');
});

console.log('\nH) capability analyst uses resolver output (real call, stubbed provider)');
await atest('analyzeUnitCapabilities calls the provider with the resolver model + timeout', async function () {
    clearAll();
    process.env.RMOOZ_ALLOW_SIM_RUN = '1';
    process.env.RMOOZ_LLM_MODEL_CAPABILITY_ANALYST = 'cap-task:7';
    process.env.RMOOZ_LLM_TIMEOUT_MS_CAPABILITY_ANALYST = '77000';
    let usedModel = null, usedTimeout = null;
    const stub = { generate: function (args) { usedModel = args.model; usedTimeout = args.timeoutMs; return Promise.resolve({ ok: true, response: '{"profiles":[]}' }); } };
    const units = [{ id: 'R-1', side: 'RED', lat: 25.3, lon: 51.2, platform: 'fighter jet' }];
    await ANALYST.analyzeUnitCapabilities(units, { active_side: 'RED' }, { useLlm: true, allowed_unit_ids: ['R-1'] }, stub);
    assert.strictEqual(usedModel, 'cap-task:7', 'analyst sent the resolver task-override model');
    assert.strictEqual(usedTimeout, 77000, 'analyst sent the resolver task-override timeout');
});

console.log('\nI) GREP PROOF — feature modules read NO model/provider/timeout/repair env directly');
test('only llm-runtime-config.js reads the LLM config env names (req #6)', function () {
    // model/provider/timeout/repair/draft env names; the trailing (?![A-Z_]) lets
    // RMOOZ_AI_MODEL_SELECTION_FILE (a file PATH, not a model) through.
    const RX = /process\.env\.RMOOZ_[A-Z_]*(MODEL|PROVIDER|TIMEOUT_MS|REPAIR_ATTEMPTS|ATTEMPTS)(?![A-Z_])/g;
    const FEATURE = [
        'free-fight-coa-planner.js',
        'free-fight-llm-capability-analyst.js',
        'free-fight-llm-decision.js',
        'free-fight-llm-plan.js',
        'model-selection.js',
    ];
    FEATURE.forEach(function (f) {
        const src = fs.readFileSync(path.join(SRV, f), 'utf8');
        const hits = src.match(RX) || [];
        assert.deepStrictEqual(hits, [], f + ' must not read LLM config env directly — found: ' + hits.join(', '));
    });
    // sanity: the resolver IS the reader (all five suffix kinds present)
    const cfg = fs.readFileSync(path.join(SRV, 'llm-runtime-config.js'), 'utf8');
    ['RMOOZ_LLM_MODEL', 'RMOOZ_LLM_PROVIDER', 'RMOOZ_LLM_TIMEOUT_MS', 'RMOOZ_LLM_REPAIR_ATTEMPTS', 'RMOOZ_LLM_ATTEMPTS'].forEach(function (n) {
        assert.ok(cfg.indexOf('process.env.' + n) !== -1, 'resolver reads ' + n);
    });
    // sanity: the legacy aliases live in the resolver (backward compat, req #5)
    ['RMOOZ_FREE_FIGHT_MODEL', 'RMOOZ_AI_MODEL', 'RMOOZ_FREE_FIGHT_PROVIDER', 'RMOOZ_FREE_FIGHT_TIMEOUT_MS', 'RMOOZ_AI_TIMEOUT_MS', 'RMOOZ_FREE_FIGHT_REPAIR_ATTEMPTS', 'RMOOZ_FREE_FIGHT_ATTEMPTS'].forEach(function (n) {
        assert.ok(cfg.indexOf('process.env.' + n) !== -1, 'resolver carries legacy alias ' + n);
    });
});

// ── cleanup ──────────────────────────────────────────────────────────────────
MS._setSelectionFileForTest(null);
try { fs.unlinkSync(NO_FILE); } catch (_) {}
restoreAll();

console.log('\n' + (fail === 0 ? '✅ PASS' : '❌ FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail === 0 ? 0 : 1);
})().catch(function (e) { console.error('FATAL', e && e.stack || e); MS._setSelectionFileForTest(null); restoreAll(); process.exit(1); });
