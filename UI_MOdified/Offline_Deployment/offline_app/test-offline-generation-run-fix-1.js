/**
 * test-offline-generation-run-fix-1.js — OFFLINE-GEN-RUN-FIX-1
 *
 * Verifies the generation run fix in wargame-sim-bridge.js:
 *  - RMOOZ_AI_* env vars are mapped to LLM_* before spawning WarGamingGEN
 *  - LLM_LOCAL_FORCE_FALLBACK is set to '0' when a real endpoint is configured
 *  - buildLlmChildEnv returns a safe summary (no key values)
 *  - run-meta / wizard fingerprint is persisted for resume matching
 *  - error log written on failure (OFFLINE-GEN-RUN-FIX-1 secondary feature)
 *
 * Static — no server, no keys, no certs required.
 * Run from Offline_Deployment/offline_app/:
 *   node test-offline-generation-run-fix-1.js
 */
'use strict';

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');

const BRIDGE = path.join(__dirname, 'server', 'wargame-sim-bridge.js');

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); console.log('  [PASS] ' + name); passed++; }
    catch (e) { console.log('  [FAIL] ' + name + ': ' + e.message); failed++; }
}

console.log('\n══════════════════════════════════════════════════════════════════');
console.log('  OFFLINE-GEN-RUN-FIX-1 — LLM env wiring + error log');
console.log('══════════════════════════════════════════════════════════════════\n');

test('wargame-sim-bridge.js exists', () => {
    assert.ok(fs.existsSync(BRIDGE), 'Missing: ' + BRIDGE);
});

const src = fs.existsSync(BRIDGE) ? fs.readFileSync(BRIDGE, 'utf8') : '';

// ── §1  OFFLINE-GEN-RUN-FIX-1 feature marker ─────────────────────────────────

console.log('── §1  Feature marker ────────────────────────────────────────────');

test('T1: OFFLINE-GEN-RUN-FIX-1 comment present in bridge', () => {
    assert.ok(src.includes('OFFLINE-GEN-RUN-FIX-1'),
        'OFFLINE-GEN-RUN-FIX-1 feature marker missing from bridge');
});

// ── §2  RMOOZ_AI_* → LLM_* mapping ───────────────────────────────────────────

console.log('\n── §2  LLM env mapping ───────────────────────────────────────────');

test('T2: RMOOZ_AI_PROVIDER read', () => {
    assert.ok(src.includes('RMOOZ_AI_PROVIDER'),
        'RMOOZ_AI_PROVIDER not read — provider detection missing');
});

test('T3: RMOOZ_AI_BASE_URL → LLM_BASE_URL forwarded', () => {
    assert.ok(src.includes('RMOOZ_AI_BASE_URL') && src.includes('env.LLM_BASE_URL'),
        'RMOOZ_AI_BASE_URL not mapped to LLM_BASE_URL');
});

test('T4: RMOOZ_AI_MODEL → LLM_MODEL forwarded', () => {
    assert.ok(src.includes('RMOOZ_AI_MODEL') && src.includes('env.LLM_MODEL'),
        'RMOOZ_AI_MODEL not mapped to LLM_MODEL');
});

test('T5: RMOOZ_AI_API_KEY → LLM_API_KEY + OPENAI_API_KEY forwarded', () => {
    assert.ok(src.includes('RMOOZ_AI_API_KEY'),
        'RMOOZ_AI_API_KEY not read');
    assert.ok(src.includes('env.LLM_API_KEY') && src.includes('env.OPENAI_API_KEY'),
        'API key not forwarded to both LLM_API_KEY and OPENAI_API_KEY');
});

test('T6: LLM_LOCAL_FORCE_FALLBACK set to "0" when baseUrl is set', () => {
    assert.ok(src.includes("LLM_LOCAL_FORCE_FALLBACK") && src.includes("'0'"),
        "LLM_LOCAL_FORCE_FALLBACK '0' not found — real endpoint would use deterministic fallback");
    assert.ok(/LLM_LOCAL_FORCE_FALLBACK.*baseUrl.*[?:]\s*['"]0['"]|baseUrl.*LLM_LOCAL_FORCE_FALLBACK.*['"]0['"]/.test(src.replace(/\s+/g, ' ')),
        "LLM_LOCAL_FORCE_FALLBACK should be '0' when baseUrl is present");
});

test('T7: LLM_USE_RESPONSES_API forced to "0" (use chat-completions not responses)', () => {
    assert.ok(src.includes("LLM_USE_RESPONSES_API = '0'"),
        "LLM_USE_RESPONSES_API not set to '0' — LiteLLM/Ollama need chat-completions");
});

// ── §3  buildLlmChildEnv used when spawning child ────────────────────────────

console.log('\n── §3  Child spawn wiring ────────────────────────────────────────');

test('T8: buildLlmChildEnv called before spawn', () => {
    assert.ok(src.includes('const _llm = buildLlmChildEnv('),
        'buildLlmChildEnv not called before child spawn');
});

test('T9: spawn uses _llm.env not raw process.env', () => {
    const spawnIdx = src.indexOf('spawn(c.python');
    assert.ok(spawnIdx >= 0, 'spawn(c.python...) not found');
    const spawnLine = src.slice(spawnIdx, spawnIdx + 120);
    assert.ok(spawnLine.includes('env: env') || spawnLine.includes('env:env'),
        'spawn must use the built env object, not raw process.env');
});

// ── §4  Summary shape ─────────────────────────────────────────────────────────

console.log('\n── §4  Summary shape ─────────────────────────────────────────────');

const SUMMARY_FIELDS = ['provider', 'baseUrl', 'model', 'apiKeyConfigured',
    'timeoutMs', 'caCertConfigured', 'mtlsConfigured'];

for (const field of SUMMARY_FIELDS) {
    test('T-sum: summary.' + field + ' present', () => {
        assert.ok(src.includes(field + ':') || src.includes(field + ' :'),
            'summary.' + field + ' missing from buildLlmChildEnv return');
    });
}

test('T10: summary never includes raw key value — only boolean apiKeyConfigured', () => {
    const summaryStart = src.indexOf('const summary = {');
    const summaryEnd   = src.indexOf('};', summaryStart) + 2;
    const block = summaryStart >= 0 ? src.slice(summaryStart, summaryEnd) : '';
    // Raw aiKey must not be a direct value in the summary object
    assert.ok(!block.includes('aiKey,') && !/apiKeyConfigured\s*:\s*aiKey/.test(block),
        'Raw aiKey value included in summary — it would be logged');
});

// ── §5  Error log persisted on failure ───────────────────────────────────────

console.log('\n── §5  Error log on failure ──────────────────────────────────────');

test('T11: error.log written to run dir on non-zero exit', () => {
    assert.ok(src.includes('error.log'),
        'error.log not written on generation failure — operator cannot diagnose why');
});

test('T12: error log includes exit_code, error_code, and stderr', () => {
    const logIdx = src.indexOf("fs.writeFileSync(path.join(failDir, 'error.log')");
    assert.ok(logIdx >= 0, "error.log writeFileSync not found");
    // The logBody is assembled before the writeFileSync — look back 1500 chars
    const block = src.slice(Math.max(0, logIdx - 1500), logIdx + 200);
    assert.ok(block.includes('exit_code'),
        'error.log must include exit_code field');
    assert.ok(block.includes('error_code'),
        'error.log must include error_code field');
});

test('T13: rawErr used in error log is the redacted version (redactSecrets called earlier)', () => {
    // rawErr = redactSecrets(errTail) — check that rawErr is assigned from redactSecrets
    assert.ok(/const rawErr\s*=\s*redactSecrets\(/.test(src),
        'rawErr must be assigned from redactSecrets(errTail) — unredacted stderr would be written to disk');
    // And rawErr (not errTail) is what goes into the log body
    const logIdx = src.indexOf("fs.writeFileSync(path.join(failDir, 'error.log')");
    const block = src.slice(Math.max(0, logIdx - 1500), logIdx + 50);
    assert.ok(block.includes('rawErr') && !block.includes("errTail + '"),
        'error.log body must use rawErr (redacted), not raw errTail');
});

// ── §6  Run-id gating (GENFLOW-2 fix) ─────────────────────────────────────────

console.log('\n── §6  Run-id gating ────────────────────────────────────────────');

test('T14: baselineRun tracked to prevent "17→0 progress flash"', () => {
    assert.ok(src.includes('baselineRun'),
        'baselineRun gating missing — progress counter may flash 17→0 when new run starts');
});

test('T15: wizardFingerprint / run-meta persisted for resume matching', () => {
    assert.ok(src.includes('run-meta.json') || src.includes('persistRunMetaWhenReady'),
        'run-meta.json not persisted — wizard cannot match a stopped run to its setup');
});

// ── Results ───────────────────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(68));
console.log('  Results: ' + passed + ' passed, ' + failed + ' failed');
console.log('═'.repeat(68) + '\n');
process.exit(failed > 0 ? 1 : 0);
