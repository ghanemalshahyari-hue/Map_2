#!/usr/bin/env node
/**
 * test-offline-litellm-cert-timeout-stop-final-1.js
 *
 * OFFLINE-LITELLM-CERT-TIMEOUT-STOP-FINAL-1 static tests (no server, no Docker).
 * Verifies code-level markers for:
 *   - CA cert env vars in .env.offline.example
 *   - docker-compose cert volume and env vars
 *   - bridge passes CA cert + timeout vars to Python child
 *   - Python config.py has timeout + cert fields
 *   - Python client.py uses configurable timeout (not hardcoded 90)
 *   - generation-health uses GET /models and returns rich diagnostics
 *   - generation-health never exposes API key
 *   - timeout + TLS error classification in error.log
 *   - cancel route exists and returns safe no-op when no run active
 *   - maps.json does not use localhost:8080
 *   - guard installs synchronously (no initial async wait before patching)
 *   - app.html loads guard with updated version string
 *   - existing OFFLINE-RUNTIME-FIX-4 markers still pass
 *   - existing OFFLINE-GEN-RUN-FIX-1 markers still pass
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname);
const OFF  = path.join(ROOT, 'Offline_Deployment');
const OFFLINE_APP = path.join(OFF, 'offline_app');
const CLIENT  = path.join(OFFLINE_APP, 'client');
const SERVER  = path.join(OFFLINE_APP, 'server');
const WGEN    = path.join(ROOT, 'TestingAI', 'WarGamingGEN');

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, note) {
    if (condition) {
        console.log('  PASS  ' + name);
        passed++;
    } else {
        console.error('  FAIL  ' + name + (note ? '  →  ' + note : ''));
        failed++;
        failures.push(name);
    }
}

function read(filePath) {
    try { return fs.readFileSync(filePath, 'utf8'); } catch (e) { return ''; }
}
function exists(filePath) {
    try { return fs.existsSync(filePath); } catch (_) { return false; }
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n═══ OFFLINE-LITELLM-CERT-TIMEOUT-STOP-FINAL-1 ═══\n');

// ──────────────────────────────────────────────────────────────────────────────
console.log('A) .env.offline.example — CA cert + timeout vars');
const envEx = read(path.join(OFF, '.env.offline.example'));
// Each CA var must be documented pointing at a /app/certs/ path (directory mount —
// robust vs the old single-file mount). The cert FILENAME is site-specific
// (e.g. ._mil_dir.crt), so assert the var + mount prefix, not a hardcoded name.
check('A1  RMOOZ_AI_CA_CERT_PATH documented',   /RMOOZ_AI_CA_CERT_PATH=\/app\/certs\/\S+/.test(envEx));
check('A2  SSL_CERT_FILE documented',            /SSL_CERT_FILE=\/app\/certs\/\S+/.test(envEx));
check('A3  REQUESTS_CA_BUNDLE documented',       /REQUESTS_CA_BUNDLE=\/app\/certs\/\S+/.test(envEx));
check('A4  NODE_EXTRA_CA_CERTS documented',      /NODE_EXTRA_CA_CERTS=\/app\/certs\/\S+/.test(envEx));
check('A5  RMOOZ_AI_TIMEOUT_MS documented',      envEx.includes('RMOOZ_AI_TIMEOUT_MS=300000'));
check('A6  RMOOZ_AI_TLS_VERIFY=0 is commented',  envEx.includes('RMOOZ_AI_TLS_VERIFY=0') && !envEx.match(/^RMOOZ_AI_TLS_VERIFY=0/m), 'insecure var must be commented out in example');
check('A7  RMOOZ_AI_BASE_URL is a blank placeholder (no hardcoded endpoint)', /^RMOOZ_AI_BASE_URL=\s*$/m.test(envEx) && !/^RMOOZ_AI_BASE_URL=\s*https?:/m.test(envEx));
check('A8  RMOOZ_AI_MODEL is a blank placeholder', /^RMOOZ_AI_MODEL=\s*$/m.test(envEx));

// ──────────────────────────────────────────────────────────────────────────────
console.log('\nB) docker-compose.offline.yml — cert volume + env vars');
const dc = read(path.join(OFF, 'docker-compose.offline.yml'));
check('B1  cert dir volume mount present',       dc.includes('./certs:/app/certs:ro'));
check('B2  RMOOZ_AI_CA_CERT_PATH env var',       dc.includes('RMOOZ_AI_CA_CERT_PATH:'));
check('B3  SSL_CERT_FILE env var',               dc.includes('SSL_CERT_FILE:'));
check('B4  REQUESTS_CA_BUNDLE env var',          dc.includes('REQUESTS_CA_BUNDLE:'));
check('B5  NODE_EXTRA_CA_CERTS env var',         dc.includes('NODE_EXTRA_CA_CERTS:'));
check('B6  RMOOZ_AI_TIMEOUT_MS env var',         dc.includes('RMOOZ_AI_TIMEOUT_MS:'));
check('B7  RMOOZ_AI_TLS_VERIFY env var',         dc.includes('RMOOZ_AI_TLS_VERIFY:'));
check('B8  ports 8640:5006 and 8080:8080',       dc.includes('5006}:5006') && dc.includes('8080}:8080'));
check('B9  existing volumes unchanged',          dc.includes('./data_runtime:/app/data') && dc.includes('./map_data/base:/app/maps:ro'));

// ──────────────────────────────────────────────────────────────────────────────
console.log('\nC) certs/ placeholder');
check('C1  certs/README.md exists',              exists(path.join(OFF, 'certs', 'README.md')));
check('C2  README documents the CA cert path',   read(path.join(OFF, 'certs', 'README.md')).includes('RMOOZ_AI_CA_CERT_PATH'));
check('C3  README says no private keys',         read(path.join(OFF, 'certs', 'README.md')).includes('Private keys'));

// ──────────────────────────────────────────────────────────────────────────────
console.log('\nD) wargame-sim-bridge.js — CA cert + timeout env injection');
const bridge = read(path.join(SERVER, 'wargame-sim-bridge.js'));
check('D1  buildLlmChildEnv exists',             bridge.includes('function buildLlmChildEnv'));
check('D2  RMOOZ_AI_CA_CERT_PATH passed',        bridge.includes('RMOOZ_AI_CA_CERT_PATH'));
check('D3  SSL_CERT_FILE passed',                bridge.includes('SSL_CERT_FILE'));
check('D4  REQUESTS_CA_BUNDLE passed',           bridge.includes('REQUESTS_CA_BUNDLE'));
check('D5  NODE_EXTRA_CA_CERTS passed',          bridge.includes('NODE_EXTRA_CA_CERTS'));
check('D6  RMOOZ_AI_TIMEOUT_MS passed',          bridge.includes('RMOOZ_AI_TIMEOUT_MS'));
check('D7  LLM_TIMEOUT_MS passed',               bridge.includes('LLM_TIMEOUT_MS'));
check('D8  OPENAI_TIMEOUT_MS passed',            bridge.includes('OPENAI_TIMEOUT_MS'));
check('D9  TLS_VERIFY=0 logs warning',           bridge.includes('RMOOZ_AI_TLS_VERIFY') && bridge.includes("'0'") && bridge.includes('WARNING'));
check('D10 error.log redacts API_KEY',           bridge.includes('API_KEY') && bridge.includes('redacted'));
check('D11 timeout error classification',        bridge.includes('APITimeoutError') && bridge.includes('timed out after'));
check('D12 TLS error classification',            bridge.includes('tls_cert') && bridge.includes('SSL|certificate'));
check('D13 auth 401 classification',             bridge.includes('auth_401'));
check('D14 auth 403 classification',             bridge.includes('auth_403'));
check('D15 not found 404 classification',        bridge.includes('not_found_404'));
check('D16 connection refused classification',   bridge.includes('connection_refused'));
check('D17 DNS failure classification',          bridge.includes('dns_failure'));
check('D18 cancel no-op returns 200 + message',  bridge.includes('No active generation') && bridge.includes('no_active_run'));
check('D19 cancel preserves run folder',         bridge.includes('preserve checkpoints') || bridge.includes('stopped_partial'));
check('D20 errorCode in error.log',              bridge.includes('error_code:'));

// ──────────────────────────────────────────────────────────────────────────────
console.log('\nE) Python config.py — timeout + cert fields');
const pyConfig = read(path.join(WGEN, 'src', 'config.py'));
check('E1  timeout_seconds field in LLMConfig',  pyConfig.includes('timeout_seconds'));
check('E2  ca_cert_path field in LLMConfig',     pyConfig.includes('ca_cert_path'));
check('E3  tls_verify field in LLMConfig',       pyConfig.includes('tls_verify'));
check('E4  RMOOZ_AI_TIMEOUT_MS read',            pyConfig.includes('RMOOZ_AI_TIMEOUT_MS'));
check('E5  LLM_TIMEOUT_MS read',                 pyConfig.includes('LLM_TIMEOUT_MS'));
check('E6  OPENAI_TIMEOUT_MS read',              pyConfig.includes('OPENAI_TIMEOUT_MS'));
check('E7  default timeout 300 seconds',         pyConfig.includes('300.0') || pyConfig.includes('300_000') || pyConfig.includes('300000'));
check('E8  RMOOZ_AI_CA_CERT_PATH read',          pyConfig.includes('RMOOZ_AI_CA_CERT_PATH'));
check('E9  SSL_CERT_FILE fallback',              pyConfig.includes('SSL_CERT_FILE'));
check('E10 TLS_VERIFY=0 logs warning',           pyConfig.includes('RMOOZ_AI_TLS_VERIFY') && pyConfig.includes('WARNING'));
// E11: summary() must NOT return the raw key value directly (e.g. llm.api_key unquoted).
// "set" if llm.api_key else "MISSING" is safe — only a boolean/string label is returned.
check('E11 api_key not exposed raw in summary()', !pyConfig.match(/"api_key"\s*:\s*llm\.api_key[^,\s]/) );

// ──────────────────────────────────────────────────────────────────────────────
console.log('\nF) Python client.py — configurable timeout + CA cert');
const pyClient = read(path.join(WGEN, 'src', 'llm', 'client.py'));
check('F1  timeout NOT hardcoded to 90',         !pyClient.includes('"timeout": 90') && !pyClient.includes("'timeout': 90") && !pyClient.includes('timeout=90'));
check('F2  timeout uses cfg.timeout_seconds',    pyClient.includes('cfg.timeout_seconds'));
check('F3  _build_http_client method exists',    pyClient.includes('_build_http_client'));
check('F4  httpx used for CA cert',              pyClient.includes('httpx.Client'));
// (mTLS refactor: _build_http_client now uses _Path(cfg.ca_cert_path).exists()
//  and verify=False instead of the old ca_file variable — behaviour unchanged.)
check('F5  CA cert path existence checked',      pyClient.includes('.exists()') && pyClient.includes('cfg.ca_cert_path'));
check('F6  verify=False logs warning',           pyClient.includes('verify = False') && pyClient.includes('WARNING'));
check('F7  TLS verify disabled logs to stderr',  pyClient.includes('sys.stderr'));

// ──────────────────────────────────────────────────────────────────────────────
console.log('\nG) web-server.js — generation-health diagnostics');
const ws = read(path.join(SERVER, 'web-server.js'));
check('G1  generation-health endpoint exists',   ws.includes('/api/ai/generation-health'));
check('G2  uses GET not HEAD for probe',         ws.includes("method:   'GET'") || ws.includes('method: \'GET\''));
check('G3  includes Authorization header',       ws.includes('Authorization'));
check('G4  API key never returned',              !ws.match(/apiKey.*=.*process\.env\.RMOOZ_AI_API_KEY\s*[,}]/));
check('G5  tlsVerify in response',               ws.includes('tlsVerify'));
check('G6  caCertConfigured in response',        ws.includes('caCertConfigured'));
check('G7  caCertPathExists in response',        ws.includes('caCertPathExists'));
check('G8  timeoutMs in response',               ws.includes('timeoutMs'));
check('G9  tls_cert error code',                 ws.includes("errorCode = 'tls_cert'"));
check('G10 auth_401 error code',                 ws.includes("errorCode = 'auth_401'"));
check('G11 auth_403 error code',                 ws.includes("errorCode = 'auth_403'"));
check('G12 not_found_404 error code',            ws.includes("errorCode = 'not_found_404'"));
check('G13 connection_refused error code',       ws.includes("errorCode = 'connection_refused'"));
check('G14 dns_failure error code',              ws.includes("errorCode = 'dns_failure'"));
check('G15 probe_timeout error code',            ws.includes("errorCode: 'probe_timeout'"));
check('G16 statusCode in response',              ws.includes('statusCode'));
check('G17 errorMessage in response',            ws.includes('errorMessage'));

// ──────────────────────────────────────────────────────────────────────────────
console.log('\nH) maps.json — no hardcoded host (security scrub; tiles via TILE_PUBLIC_BASE_URL)');
const mapsJson = read(path.join(OFF, 'map_data', 'base', 'maps.json'));
check('H1  maps.json does not use localhost',    !mapsJson.includes('localhost'));
// Security scrub: maps.json must NOT hardcode a real IP. The browser tile URL is
// derived at runtime from TILE_PUBLIC_BASE_URL via /api/offline/map-config; app.js
// skips its maps.json probe when tileServer is empty. So: no IP, no localhost.
check('H2  maps.json has no hardcoded IP',       !/\d{1,3}(?:\.\d{1,3}){3}/.test(mapsJson), mapsJson.trim());
check('H3  maps.json has mbtiles array',         mapsJson.includes('"mbtiles"'));

// ──────────────────────────────────────────────────────────────────────────────
console.log('\nI) offline-leaflet-tile-guard.js — sync install');
const guard = read(path.join(CLIENT, 'offline-leaflet-tile-guard.js'));
check('I1  guard file exists',                   guard.length > 0);
check('I2  installGuardSync function exists',    guard.includes('installGuardSync'));
check('I3  calls installGuardSync with window.L', guard.includes('installGuardSync(L)'));
check('I4  does NOT wait for async before patching', !guard.match(/waitFor.*installGuard/s) || guard.includes('installGuardSync') && guard.indexOf('installGuardSync') < guard.indexOf('resolveRealUrl'));
check('I5  placeholder tile used initially',     guard.includes('PLACEHOLDER_TILE') || guard.includes('data:image'));
check('I6  repointToRealUrl function exists',    guard.includes('repointToRealUrl'));
check('I7  isBannedUrl blocks OSM',              guard.includes('openstreetmap.org'));
check('I8  isBannedUrl blocks localhost:8080',   guard.includes('localhost:8080'));
check('I9  isBannedUrl blocks mapbox.com',       guard.includes('mapbox.com'));
check('I10 guard exports OfflineLeafletGuard',   guard.includes('window.OfflineLeafletGuard'));
check('I11 sync comment in file',                guard.includes('OFFLINE-MAP-GUARD-SYNC-1'));

// ──────────────────────────────────────────────────────────────────────────────
console.log('\nJ) app.html — guard loaded before app.js with new version');
const appHtml = read(path.join(CLIENT, 'app.html'));
check('J1  guard script tag present',            appHtml.includes('offline-leaflet-tile-guard.js'));
check('J2  guard version bumped to sync1',       appHtml.includes('offline-guard-sync1'));
// J3: map-patch script tag present (version kept at offline-fix4 — only guard was refactored)
check('J3  map-patch script tag present',        appHtml.includes('offline-map-patch.js?v=offline-fix4'));
// Guard position < app.js position
const guardPos = appHtml.indexOf('offline-leaflet-tile-guard.js');
const appJsPos = appHtml.indexOf('"app.js');
check('J4  guard loaded BEFORE app.js',          guardPos > 0 && guardPos < appJsPos, 'guard at ' + guardPos + ', app.js at ' + appJsPos);

// ──────────────────────────────────────────────────────────────────────────────
console.log('\nK) OFFLINE-RUNTIME-FIX-4 markers still pass (regression)');
check('K1  offline-map-config.js exists',        exists(path.join(SERVER, 'offline-map-config.js')));
const mapCfg = read(path.join(SERVER, 'offline-map-config.js'));
check('K2  TILE_PUBLIC_BASE_URL handled',        mapCfg.includes('TILE_PUBLIC_BASE_URL'));
check('K3  LOCAL_TILE_URL fallback',             mapCfg.includes('LOCAL_TILE_URL'));
check('K4  offline-map-patch.js exists',         exists(path.join(CLIENT, 'offline-map-patch.js')));
check('K5  offline-leaflet-tile-guard.js exists', exists(path.join(CLIENT, 'offline-leaflet-tile-guard.js')));
// K6: brand-logo is copied via COPY offline_app/client/assets/ ./client/assets/
// (the Dockerfile copies the whole assets dir, not the individual file by name)
check('K6  brand-logo assets dir in Dockerfile',  read(path.join(OFF, 'Dockerfile.offline')).includes('client/assets/'));
check('K7  obstacle.geojson exists in map_data', exists(path.join(OFF, 'map_data', 'base', 'obstacle.geojson')));
check('K8  wargame3.json exists in data_runtime', exists(path.join(OFF, 'data_runtime', 'scenarios', 'wargame3.json')));

// ──────────────────────────────────────────────────────────────────────────────
console.log('\nL) OFFLINE-GEN-RUN-FIX-1 markers still pass (regression)');
check('L1  buildLlmChildEnv in bridge',          bridge.includes('buildLlmChildEnv'));
check('L2  RMOOZ_AI_BASE_URL → LLM_BASE_URL',   bridge.includes('LLM_BASE_URL = baseUrl'));
check('L3  RMOOZ_AI_API_KEY → LLM_API_KEY',     bridge.includes('LLM_API_KEY'));
check('L4  RMOOZ_AI_API_KEY → OPENAI_API_KEY',  bridge.includes('OPENAI_API_KEY'));
check('L5  LLM_LOCAL_FORCE_FALLBACK set',        bridge.includes('LLM_LOCAL_FORCE_FALLBACK'));
check('L6  error.log written on failure',        bridge.includes('error.log'));
check('L7  genFailed in import wizard',          read(path.join(CLIENT, 'shell', 'scenario-import-wizard.js')).includes('genFailed'));
check('L8  generation-health endpoint present',  ws.includes('/api/ai/generation-health'));
// L9: apiKeyConfigured must be a boolean (!! coercion) — the raw key must never appear
// in a response field assignment. The !! guard is what makes it safe.
check('L9  apiKeyConfigured is boolean coerced',  ws.includes('apiKeyConfigured') && ws.includes('!!(process.env.RMOOZ_AI_API_KEY'));

// ──────────────────────────────────────────────────────────────────────────────
console.log('\nM) Secret safety');
// Key should never appear literally in test output; we check the source files only.
const allSources = [bridge, ws, mapCfg, guard, appHtml, envEx, dc];
const hasBearerValue = allSources.some(function (s) { return /Bearer\s+[A-Za-z0-9\-_.]{20,}/.test(s); });
const hasApiKeyValue = allSources.some(function (s) { return /RMOOZ_AI_API_KEY\s*=\s*[A-Za-z0-9\-_.]{16,}/.test(s); });
check('M1  no raw Bearer token in source files',  !hasBearerValue);
check('M2  no raw API key value in source files', !hasApiKeyValue);
check('M3  redactSecrets function in bridge',     bridge.includes('redactSecrets'));
check('M4  API_KEY pattern redacted in bridge',   bridge.includes('API_KEY') && bridge.includes('redacted'));

// ──────────────────────────────────────────────────────────────────────────────
console.log('\n═══ RESULTS ═══');
console.log('  Passed: ' + passed);
console.log('  Failed: ' + failed);
if (failures.length) {
    console.log('\n  Failed checks:');
    failures.forEach(function (f) { console.log('    - ' + f); });
}
console.log('');
process.exit(failed > 0 ? 1 : 0);
