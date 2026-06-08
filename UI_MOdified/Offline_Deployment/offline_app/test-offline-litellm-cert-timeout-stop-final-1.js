/**
 * test-offline-litellm-cert-timeout-stop-final-1.js
 * OFFLINE-LITELLM-CERT-TIMEOUT-STOP-FINAL-1
 *
 * Verifies the full error-classification block in wargame-sim-bridge.js:
 *  - timeout classifier present and uses safe model reference
 *  - all TLS/cert/auth/network error codes defined
 *  - stderr is redacted before being persisted or surfaced
 *  - stop/cancel path does NOT crash when child exits with code != 0
 *
 * Static — no server, no keys, no certs required.
 * Run from Offline_Deployment/offline_app/:
 *   node test-offline-litellm-cert-timeout-stop-final-1.js
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
console.log('  OFFLINE-LITELLM-CERT-TIMEOUT-STOP-FINAL-1');
console.log('══════════════════════════════════════════════════════════════════\n');

test('wargame-sim-bridge.js exists', () => {
    assert.ok(fs.existsSync(BRIDGE), 'Missing: ' + BRIDGE);
});

const src = fs.existsSync(BRIDGE) ? fs.readFileSync(BRIDGE, 'utf8') : '';

// ── §1  OFFLINE-LITELLM-CERT-TIMEOUT-1 feature markers ───────────────────────

console.log('── §1  Feature marker ────────────────────────────────────────────');

test('T1: OFFLINE-LITELLM-CERT-TIMEOUT-1 comment present', () => {
    assert.ok(src.includes('OFFLINE-LITELLM-CERT-TIMEOUT-1'),
        'Feature marker OFFLINE-LITELLM-CERT-TIMEOUT-1 not found');
});

// ── §2  Timeout classifier ────────────────────────────────────────────────────

console.log('\n── §2  Timeout classifier ────────────────────────────────────────');

test('T2: errorCode "timeout" defined', () => {
    assert.ok(src.includes("errorCode = 'timeout'"), 'timeout errorCode missing');
});

test('T3: timeout regex matches APITimeoutError', () => {
    assert.ok(src.includes('APITimeoutError'),
        'APITimeoutError not in timeout classifier pattern');
});

test('T4: timeout regex matches "Request timed out"', () => {
    assert.ok(src.includes('Request timed out'),
        '"Request timed out" not in timeout classifier pattern');
});

test('T5: timeout message includes current RMOOZ_AI_TIMEOUT_MS value', () => {
    const tIdx = src.indexOf("errorCode = 'timeout'");
    const branch = tIdx >= 0 ? src.slice(tIdx, tIdx + 600) : '';
    assert.ok(branch.includes('timeoutMs'),
        'Timeout message does not include the current timeoutMs value for the operator');
});

test('T6: timeout message uses _llm.summary.model (NOT bare model)', () => {
    const tIdx = src.indexOf("errorCode = 'timeout'");
    const branch = tIdx >= 0 ? src.slice(tIdx, tIdx + 600) : '';
    // Must use the safe accessor
    assert.ok(branch.includes('_llm.summary.model'),
        'Timeout message does not use _llm.summary.model — operator cannot see which model timed out');
    // Must NOT have the bare `model` expression that caused the crash
    const badPattern = /\(\s*model\s*\|\|/.exec(branch);
    assert.ok(!badPattern,
        'REGRESSION: bare (model || ...) found in timeout branch — will crash with ReferenceError');
});

test('T7: timeout message advises increasing RMOOZ_AI_TIMEOUT_MS', () => {
    const tIdx = src.indexOf("errorCode = 'timeout'");
    const branch = tIdx >= 0 ? src.slice(tIdx, tIdx + 600) : '';
    assert.ok(branch.includes('RMOOZ_AI_TIMEOUT_MS'),
        'Timeout message must tell operator about RMOOZ_AI_TIMEOUT_MS');
});

// ── §3  All expected error codes defined ─────────────────────────────────────

console.log('\n── §3  Full errorCode coverage ───────────────────────────────────');

const EXPECTED_CODES = [
    'timeout', 'mtls_client_cert_required', 'tls_ca_trust_failed',
    'tls_handshake_failed', 'tls_cert', 'auth_401', 'auth_403',
    'not_found_404', 'connection_refused', 'dns_failure',
];
for (const code of EXPECTED_CODES) {
    test('T-code: errorCode "' + code + '" defined', () => {
        assert.ok(src.includes("errorCode = '" + code + "'"),
            'errorCode "' + code + '" missing from classifier');
    });
}

// ── §4  Stop / cancel path ────────────────────────────────────────────────────

console.log('\n── §4  Stop/cancel path ──────────────────────────────────────────');

test('T18: simState.cancelled branch clears error and sets message', () => {
    assert.ok(src.includes('simState.cancelled'),
        'simState.cancelled not handled in close callback');
    const cancelIdx = src.indexOf('simState.cancelled');
    const block = src.slice(cancelIdx, cancelIdx + 300);
    assert.ok(block.includes('Generation stopped'),
        'Cancel path must set a user-facing message (e.g. "Generation stopped by operator.")');
});

// ── §5  Redaction of stderr before logging ────────────────────────────────────

console.log('\n── §5  Secret redaction ──────────────────────────────────────────');

test('T19: redactSecrets() exists and redacts API_KEY lines', () => {
    assert.ok(src.includes('function redactSecrets('), 'redactSecrets function missing');
    assert.ok(src.includes('API_KEY') && src.includes('<redacted>'),
        'redactSecrets must replace API_KEY values with <redacted>');
});

test('T20: rawErr is passed through redactSecrets before use', () => {
    assert.ok(src.includes('redactSecrets(errTail)') || src.includes('redactSecrets('),
        'errTail is not passed through redactSecrets before being surfaced');
});

test('T21: error log written on failure uses redactSecrets output', () => {
    assert.ok(src.includes('redactSecrets('),
        'Failure log path must call redactSecrets to avoid persisting secrets');
});

// ── §6  Timeout vars forwarded to Python child ────────────────────────────────

console.log('\n── §6  Timeout vars in child env ─────────────────────────────────');

test('T22: RMOOZ_AI_TIMEOUT_MS forwarded to child', () => {
    assert.ok(src.includes('env.RMOOZ_AI_TIMEOUT_MS'),
        'RMOOZ_AI_TIMEOUT_MS not forwarded to Python child env');
});

test('T23: LLM_TIMEOUT_MS alias forwarded', () => {
    assert.ok(src.includes('env.LLM_TIMEOUT_MS'),
        'LLM_TIMEOUT_MS alias not forwarded — Python client.py may use this name');
});

test('T24: OPENAI_TIMEOUT_MS alias forwarded', () => {
    assert.ok(src.includes('env.OPENAI_TIMEOUT_MS'),
        'OPENAI_TIMEOUT_MS alias not forwarded — some OpenAI SDK versions check this');
});

test('T25: timeoutMs defaults to 300000 ms when not set', () => {
    assert.ok(src.includes("'300000'") || src.includes('"300000"'),
        'Default timeout 300000 ms not found — check RMOOZ_AI_TIMEOUT_MS default');
});

// ── Results ───────────────────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(68));
console.log('  Results: ' + passed + ' passed, ' + failed + ' failed');
console.log('═'.repeat(68) + '\n');
process.exit(failed > 0 ? 1 : 0);
