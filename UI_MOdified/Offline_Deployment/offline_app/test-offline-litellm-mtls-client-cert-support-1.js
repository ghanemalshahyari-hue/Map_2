/**
 * test-offline-litellm-mtls-client-cert-support-1.js
 * OFFLINE-LITELLM-MTLS-CLIENT-CERT-SUPPORT-1
 *
 * Verifies that wargame-sim-bridge.js correctly forwards mTLS client cert
 * and key paths to the Python child process, and that the error classifier
 * recognises "certificate required" style errors from the server.
 *
 * Static — no server, no keys, no certs required.
 * Run from Offline_Deployment/offline_app/:
 *   node test-offline-litellm-mtls-client-cert-support-1.js
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
console.log('  OFFLINE-LITELLM-MTLS-CLIENT-CERT-SUPPORT-1');
console.log('══════════════════════════════════════════════════════════════════\n');

test('wargame-sim-bridge.js exists', () => {
    assert.ok(fs.existsSync(BRIDGE), 'Missing: ' + BRIDGE);
});

const src = fs.existsSync(BRIDGE) ? fs.readFileSync(BRIDGE, 'utf8') : '';

// ── §1  Client cert / key path forwarding ─────────────────────────────────────

console.log('── §1  Client cert forwarding ────────────────────────────────────');

test('T1: RMOOZ_AI_CLIENT_CERT_PATH read and forwarded', () => {
    assert.ok(src.includes('RMOOZ_AI_CLIENT_CERT_PATH'),
        'RMOOZ_AI_CLIENT_CERT_PATH not referenced in bridge');
    assert.ok(src.includes('env.RMOOZ_AI_CLIENT_CERT_PATH') || src.includes('env.LLM_CLIENT_CERT_PATH'),
        'Client cert path not forwarded to child env');
});

test('T2: RMOOZ_AI_CLIENT_KEY_PATH read and forwarded', () => {
    assert.ok(src.includes('RMOOZ_AI_CLIENT_KEY_PATH'),
        'RMOOZ_AI_CLIENT_KEY_PATH not referenced in bridge');
    assert.ok(src.includes('env.RMOOZ_AI_CLIENT_KEY_PATH') || src.includes('env.LLM_CLIENT_KEY_PATH'),
        'Client key path not forwarded to child env');
});

test('T3: LLM_CLIENT_CERT_PATH alias forwarded', () => {
    assert.ok(src.includes('env.LLM_CLIENT_CERT_PATH'),
        'LLM_CLIENT_CERT_PATH alias not set — Python config.py may not pick it up');
});

test('T4: LLM_CLIENT_KEY_PATH alias forwarded', () => {
    assert.ok(src.includes('env.LLM_CLIENT_KEY_PATH'),
        'LLM_CLIENT_KEY_PATH alias not set');
});

test('T5: mtlsConfigured computed from cert+key both present', () => {
    assert.ok(src.includes('mtlsConfigured') && /clientCertPath\s*&&\s*clientKeyPath|clientCert.*&&.*clientKey/.test(src),
        'mtlsConfigured not derived from both cert and key paths');
});

test('T6: client cert password forwarded (but never logged)', () => {
    assert.ok(src.includes('RMOOZ_AI_CLIENT_CERT_PASSWORD'),
        'RMOOZ_AI_CLIENT_CERT_PASSWORD not handled');
    // The password must NOT appear in summary (it would be logged)
    const summaryBlock = src.slice(src.indexOf('const summary ='), src.indexOf('return { env: env, summary: summary }') + 40);
    assert.ok(!summaryBlock.includes('clientCertPw') && !summaryBlock.includes('CLIENT_CERT_PASSWORD'),
        'Client cert password appears in the summary object — it would be logged');
});

// ── §2  Error classifier: mTLS server demands client cert ─────────────────────

console.log('\n── §2  mTLS error classifier ─────────────────────────────────────');

test('T7: errorCode "mtls_client_cert_required" defined', () => {
    assert.ok(src.includes("errorCode = 'mtls_client_cert_required'"),
        'mtls_client_cert_required errorCode missing from classifier');
});

test('T8: classifier matches "certificate required" pattern', () => {
    assert.ok(src.includes('certificate required') || /certificate.*required/i.test(src),
        '"certificate required" pattern missing from error classifier');
});

test('T9: classifier matches TLSv1.3 "alert certificate required" variant', () => {
    assert.ok(/tlsv13 alert certificate required/i.test(src),
        'TLSv1.3 "alert certificate required" variant not matched — mTLS errors from TLS 1.3 handshakes will be misclassified');
});

test('T10: mtls classifier message tells operator to set CERT+KEY paths', () => {
    const mtlsIdx = src.indexOf("errorCode = 'mtls_client_cert_required'");
    assert.ok(mtlsIdx >= 0, 'mtls_client_cert_required block not found');
    const block = src.slice(mtlsIdx, mtlsIdx + 600);
    assert.ok(
        block.includes('RMOOZ_AI_CLIENT_CERT_PATH') && block.includes('RMOOZ_AI_CLIENT_KEY_PATH'),
        'mTLS error message must tell operator to set RMOOZ_AI_CLIENT_CERT_PATH and RMOOZ_AI_CLIENT_KEY_PATH'
    );
});

// ── §3  Error classifier: TLS handshake failure ───────────────────────────────

console.log('\n── §3  TLS handshake classifier ──────────────────────────────────');

test('T11: errorCode "tls_handshake_failed" defined', () => {
    assert.ok(src.includes("errorCode = 'tls_handshake_failed'"),
        'tls_handshake_failed errorCode missing');
});

test('T12: handshake classifier covers "bad certificate"', () => {
    assert.ok(src.includes('bad certificate'),
        '"bad certificate" not in TLS handshake pattern');
});

// ── §4  CA trust classifier ───────────────────────────────────────────────────

console.log('\n── §4  CA trust classifier ───────────────────────────────────────');

test('T13: errorCode "tls_ca_trust_failed" defined', () => {
    assert.ok(src.includes("errorCode = 'tls_ca_trust_failed'"),
        'tls_ca_trust_failed errorCode missing');
});

test('T14: CA trust message mentions RMOOZ_AI_CA_CERT_PATH', () => {
    const caIdx = src.indexOf("errorCode = 'tls_ca_trust_failed'");
    assert.ok(caIdx >= 0, 'tls_ca_trust_failed block not found');
    const block = src.slice(caIdx, caIdx + 400);
    assert.ok(block.includes('RMOOZ_AI_CA_CERT_PATH'),
        'CA trust error must reference RMOOZ_AI_CA_CERT_PATH so the operator knows what to set');
});

// ── §5  Summary shape includes mTLS booleans (safe to log) ────────────────────

console.log('\n── §5  Summary shape ─────────────────────────────────────────────');

test('T15: summary.clientCertConfigured in return value', () => {
    assert.ok(src.includes('clientCertConfigured'), 'clientCertConfigured missing from summary');
});

test('T16: summary.clientKeyConfigured in return value', () => {
    assert.ok(src.includes('clientKeyConfigured'), 'clientKeyConfigured missing from summary');
});

test('T17: summary.mtlsConfigured in return value', () => {
    assert.ok(src.includes('mtlsConfigured'), 'mtlsConfigured missing from summary');
});

test('T18: summary does NOT include raw key/password value — only booleans', () => {
    const summaryStart = src.indexOf('const summary = {');
    const summaryEnd   = src.indexOf('};', summaryStart) + 2;
    const block = summaryStart >= 0 ? src.slice(summaryStart, summaryEnd) : '';
    // Password must never appear in summary
    assert.ok(!block.includes('clientCertPw') && !block.includes('CLIENT_CERT_PASSWORD'),
        'Client certificate password included in summary — never log secrets');
    // The API key NAME may appear (e.g. to derive a boolean like apiKeyConfigured: !!(env.LLM_API_KEY...))
    // but the aiKey variable (which holds the raw value) must not be a direct value
    assert.ok(!block.includes('aiKey,') && !/apiKeyConfigured\s*:\s*aiKey/.test(block),
        'Raw aiKey value included in summary (not as a boolean) — it would be logged');
});

// ── Results ───────────────────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(68));
console.log('  Results: ' + passed + ' passed, ' + failed + ' failed');
console.log('═'.repeat(68) + '\n');
process.exit(failed > 0 ? 1 : 0);
