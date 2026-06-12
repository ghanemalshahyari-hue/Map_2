#!/usr/bin/env node
/**
 * test-offline-litellm-oss120b-model-routing-1.js
 *
 * Verifies that RMOOZ_AI_MODEL (e.g. oss-120b-fast) routes through the offline
 * LiteLLM path end-to-end, that generation-health proves the active model + a
 * redacted base-URL host WITHOUT leaking secrets, and that CA / mTLS / timeout
 * support is unchanged.
 *
 * Static (no server, no Docker). The LIVE model-echo check is done separately
 * against a throwaway container (see the task report).
 *
 * Sections:
 *   A — model routing chain: bridge → LLM_MODEL → config → client
 *   B — generation-health exposes model + redacted baseUrlHost + timeoutMs
 *   C — secret safety (no api key / password / key content in the response)
 *   D — CA + mTLS diagnostics still present (regression)
 *   E — timeout default stays 300000
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT       = __dirname;
const OFF        = path.join(ROOT, 'Offline_Deployment');
const OFF_SERVER = path.join(OFF, 'offline_app', 'server');
const WGEN       = path.join(ROOT, 'TestingAI', 'WarGamingGEN');

let passed = 0, failed = 0;
const failures = [];
function check(name, cond, note) {
    if (cond) { console.log('  PASS  ' + name); passed++; }
    else { console.error('  FAIL  ' + name + (note ? '  →  ' + note : '')); failed++; failures.push(name); }
}
function read(p) { try { return fs.readFileSync(p, 'utf8'); } catch (e) { return ''; } }

const bridge = read(path.join(OFF_SERVER, 'wargame-sim-bridge.js'));
const ws     = read(path.join(OFF_SERVER, 'web-server.js'));
const cfg    = read(path.join(WGEN, 'src', 'config.py'));
const cli    = read(path.join(WGEN, 'src', 'llm', 'client.py'));

console.log('\n═══ OFFLINE-LITELLM oss-120b-fast MODEL ROUTING ═══\n');

// ──────────────────────────────────────────────────────────────────────────────
console.log('A) Model routing chain (RMOOZ_AI_MODEL → LiteLLM)');
check('A1  bridge reads RMOOZ_AI_MODEL',          bridge.includes("process.env.RMOOZ_AI_MODEL"));
check('A2  bridge: litellm/openai branch uses aiModel', /model\s*=\s*aiModel\s*\|\|\s*c\.simModel/.test(bridge));
check('A3  bridge sets LLM_MODEL from model',      /env\.LLM_MODEL\s*=\s*model/.test(bridge));
check('A4  bridge sends LLM_BASE_URL for litellm', /env\.LLM_BASE_URL\s*=\s*baseUrl/.test(bridge));
check('A5  config reads LLM_MODEL',                cfg.includes('_get("LLM_MODEL"'));
check('A6  client uses cfg.model',                 cli.includes('model = model or self.cfg.model'));
check('A7  client sends "model" to completions',   /"model":\s*model/.test(cli));
check('A8  chat-completions path (not responses) for litellm', bridge.includes("LLM_USE_RESPONSES_API = '0'"));

// ──────────────────────────────────────────────────────────────────────────────
console.log('\nB) generation-health proves the active model + endpoint');
check('B1  health resolves model from RMOOZ_AI_MODEL', ws.includes('process.env.RMOOZ_AI_MODEL'));
check('B2  health returns model field',            /model:\s*aiModel\s*\|\|\s*null/.test(ws));
check('B3  health returns baseUrlHost field',      ws.includes('baseUrlHost:'));
check('B4  baseUrlHost is scheme+host only (redacted)', ws.includes("u.protocol + '//' + u.host"));
check('B5  baseUrlHost built via URL() (no path/query)', /new URL\(aiBase\)/.test(ws));
check('B6  health returns timeoutMs',              ws.includes('timeoutMs:'));
check('B7  health returns baseUrlConfigured bool', ws.includes('baseUrlConfigured:'));

// ──────────────────────────────────────────────────────────────────────────────
console.log('\nC) Secret safety in generation-health');
const safeBlock = (ws.match(/const safe = \{[\s\S]*?\};/) || [''])[0];
check('C1  safe object has NO api key value',      !/RMOOZ_AI_API_KEY/.test(safeBlock));
check('C2  safe object has NO password',           !/password/i.test(safeBlock));
check('C3  safe object has NO client key contents', !/readFileSync/.test(safeBlock));
check('C4  apiKeyConfigured is a boolean (!! coerced)', ws.includes('!!(process.env.RMOOZ_AI_API_KEY'));
check('C5  baseUrlHost excludes credentials/path (host only)', safeBlock.includes('baseUrlHost:') && !/baseUrl:\s*aiBase/.test(safeBlock));
check('C6  no raw Bearer/sk- literal in web-server', !/Bearer\s+[A-Za-z0-9._-]{16,}/.test(ws) && !/sk-[A-Za-z0-9]{16,}/.test(ws));

// ──────────────────────────────────────────────────────────────────────────────
console.log('\nD) CA + mTLS diagnostics still present (regression)');
check('D1  caCertConfigured field',                ws.includes('caCertConfigured:'));
check('D2  caCertPathExists field',                ws.includes('caCertPathExists:'));
check('D3  mtlsConfigured field',                  ws.includes('mtlsConfigured:'));
check('D4  mtlsConfigValid field',                 ws.includes('mtlsConfigValid:'));
check('D5  clientCertPathExists field',            ws.includes('clientCertPathExists:'));
check('D6  clientKeyPathExists field',             ws.includes('clientKeyPathExists:'));
check('D7  mtls_config_incomplete code present',   ws.includes("errorCode: 'mtls_config_incomplete'"));
check('D8  mtls_file_missing code present',        ws.includes("errorCode: 'mtls_file_missing'"));
check('D9  config.py mTLS fields intact',          cfg.includes('client_cert_path') && cfg.includes('client_key_path'));
check('D10 client.py cert tuple intact',           cli.includes('(cfg.client_cert_path, cfg.client_key_path)'));

// ──────────────────────────────────────────────────────────────────────────────
console.log('\nE) Timeout support intact (300000 default)');
check('E1  health default timeout 300000',         ws.includes("process.env.RMOOZ_AI_TIMEOUT_MS || '300000'"));
check('E2  bridge default timeout 300000',         bridge.includes("RMOOZ_AI_TIMEOUT_MS || '300000'"));
check('E3  config default 300s',                   cfg.includes('300.0'));
check('E4  bridge forwards LLM_TIMEOUT_MS',         bridge.includes('env.LLM_TIMEOUT_MS'));

// ──────────────────────────────────────────────────────────────────────────────
console.log('\n═══ RESULTS ═══');
console.log('  Passed: ' + passed);
console.log('  Failed: ' + failed);
if (failures.length) { console.log('\n  Failed:'); failures.forEach(function (f) { console.log('    - ' + f); }); }
console.log('');
process.exit(failed > 0 ? 1 : 0);
