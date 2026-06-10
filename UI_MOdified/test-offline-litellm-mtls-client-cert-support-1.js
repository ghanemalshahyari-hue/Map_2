#!/usr/bin/env node
/**
 * test-offline-litellm-mtls-client-cert-support-1.js
 *
 * OFFLINE-LITELLM-MTLS-CLIENT-CERT-SUPPORT-1 — static verification that optional
 * mutual-TLS (client certificate) support is wired end-to-end WITHOUT breaking the
 * existing CA-trust / timeout / stop behaviour.
 *
 * Sections:
 *   A — docker-compose passes the three mTLS env vars + keeps the dir mount
 *   B — .env.offline.example documents mTLS, commented/optional, CA block intact
 *   C — certs/README.md warns never to commit the private key
 *   D — bridge forwards mTLS env (RMOOZ_AI_* + LLM_* aliases), booleans only
 *   E — Python config reads cert/key/password and validates both-or-neither
 *   F — Python client wires the httpx cert tuple, preserves no-mTLS behaviour
 *   G — generation-health reports mTLS fields safely + incomplete/missing codes
 *   H — error classification: client-cert-required / ca-trust / handshake
 *   I — secret safety (no key contents / password / api key surfaced)
 *
 * Usage: node test-offline-litellm-mtls-client-cert-support-1.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT        = __dirname;
const OFF         = path.join(ROOT, 'Offline_Deployment');
const OFFLINE_APP = path.join(OFF, 'offline_app');
const OFF_SERVER  = path.join(OFFLINE_APP, 'server');
const WGEN        = path.join(ROOT, 'TestingAI', 'WarGamingGEN');

let passed = 0, failed = 0;
const failures = [];
function check(name, cond, note) {
    if (cond) { console.log('  PASS  ' + name); passed++; }
    else { console.error('  FAIL  ' + name + (note ? '  →  ' + note : '')); failed++; failures.push(name); }
}
function read(p) { try { return fs.readFileSync(p, 'utf8'); } catch (e) { return ''; } }
function stripComments(src) {
    // strip JS/Py block + line comments so contract prose isn't matched as code
    return String(src)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
        .replace(/#[^\n]*/g, '');
}

console.log('\n═══ OFFLINE-LITELLM-MTLS-CLIENT-CERT-SUPPORT-1 ═══\n');

// ──────────────────────────────────────────────────────────────────────────────
console.log('A) docker-compose.offline.yml — mTLS env + dir mount');
const dc = read(path.join(OFF, 'docker-compose.offline.yml'));
check('A1  passes RMOOZ_AI_CLIENT_CERT_PATH',      dc.includes('RMOOZ_AI_CLIENT_CERT_PATH:'));
check('A2  passes RMOOZ_AI_CLIENT_KEY_PATH',       dc.includes('RMOOZ_AI_CLIENT_KEY_PATH:'));
check('A3  passes RMOOZ_AI_CLIENT_CERT_PASSWORD',  dc.includes('RMOOZ_AI_CLIENT_CERT_PASSWORD:'));
check('A4  mTLS vars default to empty (optional)', dc.includes('${RMOOZ_AI_CLIENT_CERT_PATH:-}') && dc.includes('${RMOOZ_AI_CLIENT_KEY_PATH:-}'));
check('A5  KEEPS directory mount ./certs:/app/certs:ro', dc.includes('./certs:/app/certs:ro'));
check('A6  did NOT revert to single-file mount',   !dc.includes(':/usr/local/share/ca-certificates/._mil_dir.crt:ro'));
check('A7  CA env block still present',             dc.includes('RMOOZ_AI_CA_CERT_PATH:') && dc.includes('RMOOZ_AI_TIMEOUT_MS:'));

// ──────────────────────────────────────────────────────────────────────────────
console.log('\nB) .env.offline.example — mTLS documented + optional');
const envEx = read(path.join(OFF, '.env.offline.example'));
check('B1  documents RMOOZ_AI_CLIENT_CERT_PATH',   envEx.includes('RMOOZ_AI_CLIENT_CERT_PATH=/app/certs/rmooz-client.crt'));
check('B2  documents RMOOZ_AI_CLIENT_KEY_PATH',    envEx.includes('RMOOZ_AI_CLIENT_KEY_PATH=/app/certs/rmooz-client.key'));
check('B3  documents RMOOZ_AI_CLIENT_CERT_PASSWORD', envEx.includes('RMOOZ_AI_CLIENT_CERT_PASSWORD'));
// All three mTLS lines must be COMMENTED OUT (optional — off by default).
check('B4  client cert path is commented out',     !/^RMOOZ_AI_CLIENT_CERT_PATH=/m.test(envEx) && /#\s*RMOOZ_AI_CLIENT_CERT_PATH=/.test(envEx));
check('B5  client key path is commented out',      !/^RMOOZ_AI_CLIENT_KEY_PATH=/m.test(envEx) && /#\s*RMOOZ_AI_CLIENT_KEY_PATH=/.test(envEx));
// CA path must be ACTIVE (uncommented) and under /app/certs — filename is
// deployment-specific (operator names the file), so don't hardcode it.
check('B6  CA trust lines still ACTIVE (uncommented)', /^RMOOZ_AI_CA_CERT_PATH=\/app\/certs\/\S+/m.test(envEx));
check('B7  CA timeout still documented',           envEx.includes('RMOOZ_AI_TIMEOUT_MS=300000'));

// ──────────────────────────────────────────────────────────────────────────────
console.log('\nC) certs/README.md — client cert/key documented, key must not be committed');
const readme = read(path.join(OFF, 'certs', 'README.md'));
check('C1  documents rmooz-client.crt',            readme.includes('rmooz-client.crt'));
check('C2  documents rmooz-client.key',            readme.includes('rmooz-client.key'));
check('C3  warns DO NOT COMMIT the key',           /DO NOT COMMIT|NEVER commit/i.test(readme));
check('C4  explains CA-only vs mTLS',              /Normal HTTPS|Bearer/i.test(readme) && /mTLS|mutual TLS/i.test(readme));
check('C5  README is the only committed cert file', /only this README is committed|README only|ONLY thing committed/i.test(readme));
// gitignore must ignore the key
const gi = read(path.join(ROOT, '..', '.gitignore'));
check('C6  .gitignore ignores certs/*.key',        gi.includes('certs/*.key'));

// ──────────────────────────────────────────────────────────────────────────────
console.log('\nD) bridge — forwards mTLS env to the Python child (paths/booleans only)');
const bridge = read(path.join(OFF_SERVER, 'wargame-sim-bridge.js'));
check('D1  forwards RMOOZ_AI_CLIENT_CERT_PATH',    bridge.includes('env.RMOOZ_AI_CLIENT_CERT_PATH'));
check('D2  forwards RMOOZ_AI_CLIENT_KEY_PATH',     bridge.includes('env.RMOOZ_AI_CLIENT_KEY_PATH'));
check('D3  forwards RMOOZ_AI_CLIENT_CERT_PASSWORD', bridge.includes('env.RMOOZ_AI_CLIENT_CERT_PASSWORD'));
check('D4  forwards LLM_CLIENT_CERT_PATH alias',   bridge.includes('env.LLM_CLIENT_CERT_PATH'));
check('D5  forwards LLM_CLIENT_KEY_PATH alias',    bridge.includes('env.LLM_CLIENT_KEY_PATH'));
check('D6  forwards LLM_CLIENT_CERT_PASSWORD alias', bridge.includes('env.LLM_CLIENT_CERT_PASSWORD'));
check('D7  summary has clientCertConfigured bool', bridge.includes('clientCertConfigured:'));
check('D8  summary has clientKeyConfigured bool',  bridge.includes('clientKeyConfigured:'));
check('D9  summary has mtlsConfigured bool',       bridge.includes('mtlsConfigured:'));
// The password must NOT be in the summary object (booleans/paths only).
// Strip comments first so the "...password NEVER included here" note doesn't match.
const summaryBlock = stripComments((bridge.match(/const summary = \{[\s\S]*?\};/) || [''])[0]);
check('D10 summary code does NOT include the password', !/PASSWORD|clientCertPassword|client_cert_password|clientCertPw/i.test(summaryBlock));
check('D11 password not trimmed/altered before forward', bridge.includes("process.env.RMOOZ_AI_CLIENT_CERT_PASSWORD || ''"));

// ──────────────────────────────────────────────────────────────────────────────
console.log('\nE) Python config.py — reads + validates cert/key/password');
const cfg = read(path.join(WGEN, 'src', 'config.py'));
check('E1  LLMConfig has client_cert_path field',  cfg.includes('client_cert_path: str | None'));
check('E2  LLMConfig has client_key_path field',   cfg.includes('client_key_path: str | None'));
check('E3  LLMConfig has client_cert_password field', cfg.includes('client_cert_password: str | None'));
check('E4  reads RMOOZ_AI_CLIENT_CERT_PATH',       cfg.includes('RMOOZ_AI_CLIENT_CERT_PATH'));
check('E5  reads LLM_CLIENT_CERT_PATH alias',      cfg.includes('LLM_CLIENT_CERT_PATH'));
check('E6  reads RMOOZ_AI_CLIENT_KEY_PATH',        cfg.includes('RMOOZ_AI_CLIENT_KEY_PATH'));
check('E7  reads password env',                    cfg.includes('RMOOZ_AI_CLIENT_CERT_PASSWORD'));
check('E8  both-or-neither validation',            cfg.includes('bool(_client_cert) != bool(_client_key)'));
check('E9  missing-file error message (cert)',     cfg.includes('client certificate is configured but file is missing'));
check('E10 missing-file error message (key)',      cfg.includes('client key is configured but file is missing'));
check('E11 password not printed in config',        !/print\([^)]*password/i.test(cfg) && !/print\([^)]*_client_pw/i.test(cfg));

// ──────────────────────────────────────────────────────────────────────────────
console.log('\nF) Python client.py — httpx cert tuple, no-mTLS behaviour preserved');
const cli = read(path.join(WGEN, 'src', 'llm', 'client.py'));
check('F1  builds cert tuple from cert+key',       cli.includes('(cfg.client_cert_path, cfg.client_key_path)'));
check('F2  supports 3-tuple with password',        cli.includes('(cfg.client_cert_path, cfg.client_key_path, cfg.client_cert_password)'));
check('F3  passes cert into httpx kwargs',         /kwargs\["cert"\]\s*=\s*cert/.test(cli) || cli.includes('cert=cert') || cli.includes('"cert": cert'));
check('F4  returns None when no CA + no cert (preserves default path)', cli.includes('if verify is True and cert is None') && /return None/.test(cli));
check('F5  still honours ca_cert_path verify',     cli.includes('verify = str(cfg.ca_cert_path)'));
check('F6  still honours tls_verify=False',        cli.includes('verify = False'));
check('F7  key/password contents not printed',     !/print\([^)]*client_cert_password/i.test(cli) && !/print\([^)]*\.key\b/i.test(cli));
check('F8  cert ENABLED log is a boolean-style note', cli.includes('mTLS client certificate ENABLED'));

// ──────────────────────────────────────────────────────────────────────────────
console.log('\nG) generation-health — mTLS diagnostics (safe) + incomplete/missing codes');
const ws = read(path.join(OFF_SERVER, 'web-server.js'));
check('G1  clientCertConfigured field',            ws.includes('clientCertConfigured:'));
check('G2  clientKeyConfigured field',             ws.includes('clientKeyConfigured:'));
check('G3  clientCertPathExists field',            ws.includes('clientCertPathExists:'));
check('G4  clientKeyPathExists field',             ws.includes('clientKeyPathExists:'));
check('G5  mtlsConfigured field',                  ws.includes('mtlsConfigured:'));
check('G6  mtlsConfigValid field',                 ws.includes('mtlsConfigValid:'));
check('G7  mtls_config_incomplete code',           ws.includes("errorCode: 'mtls_config_incomplete'"));
check('G8  mtls_file_missing code',                ws.includes("errorCode: 'mtls_file_missing'"));
check('G9  incomplete message matches spec',       ws.includes('Client certificate and client key must both be configured for mTLS.'));

// ──────────────────────────────────────────────────────────────────────────────
console.log('\nH) Error classification — client cert / CA trust / handshake');
check('H1  mtls_client_cert_required (health probe)', ws.includes("errorCode = 'mtls_client_cert_required'"));
check('H2  tls_ca_trust_failed (health probe)',    ws.includes("errorCode = 'tls_ca_trust_failed'"));
check('H3  tls_handshake_failed (health probe)',   ws.includes("errorCode = 'tls_handshake_failed'"));
check('H4  mtls_client_cert_required (bridge log)', bridge.includes("errorCode = 'mtls_client_cert_required'"));
check('H5  tls_ca_trust_failed (bridge log)',      bridge.includes("errorCode = 'tls_ca_trust_failed'"));
check('H6  tls_handshake_failed (bridge log)',     bridge.includes("errorCode = 'tls_handshake_failed'"));
check('H7  detects "certificate required" text',   /certificate required/i.test(ws) && /certificate required/i.test(bridge));
check('H8  guidance mentions client cert vars',    ws.includes('RMOOZ_AI_CLIENT_CERT_PATH') && bridge.includes('RMOOZ_AI_CLIENT_CERT_PATH'));

// ──────────────────────────────────────────────────────────────────────────────
console.log('\nI) Secret safety');
const wsCode = stripComments(ws);
const bridgeCode = stripComments(bridge);
// generation-health response must never put the password/key/api-key in JSON.
check('I1  health never returns the client password', !/CLIENT_CERT_PASSWORD["'\s:]*[},]/.test(wsCode) || !/sendJson[\s\S]*CLIENT_CERT_PASSWORD/.test(wsCode));
check('I2  health safe object has no password key',  !/password/i.test((ws.match(/const safe = \{[\s\S]*?\};/) || [''])[0]));
check('I3  no raw Bearer/API-key literal in sources', !/Bearer\s+[A-Za-z0-9._-]{16,}/.test(ws) && !/sk-[A-Za-z0-9]{16,}/.test(ws + bridge));
check('I4  bridge redactSecrets still present',     bridge.includes('redactSecrets'));
check('I5  password never logged in bridge',        !/console\.(log|warn|error)\([^)]*CLIENT_CERT_PASSWORD/i.test(bridgeCode));

// ──────────────────────────────────────────────────────────────────────────────
console.log('\n═══ RESULTS ═══');
console.log('  Passed: ' + passed);
console.log('  Failed: ' + failed);
if (failures.length) { console.log('\n  Failed:'); failures.forEach(function (f) { console.log('    - ' + f); }); }
console.log('');
process.exit(failed > 0 ? 1 : 0);
