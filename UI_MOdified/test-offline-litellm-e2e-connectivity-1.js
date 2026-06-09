#!/usr/bin/env node
/**
 * test-offline-litellm-e2e-connectivity-1.js
 *
 * End-to-end guard for the RMOOZ Offline LiteLLM connectivity diagnosis & fix:
 *   A — error classifier surfaces the TRUE cause (DNS/refused/no-route/timeout
 *       before the generic connection_error) and no longer mislabels every
 *       APIConnectionError as "connection_refused".
 *   B — diag-litellm.py exists, ships in the image (Dockerfile COPY), reads the
 *       RMOOZ_AI_* / CA env, walks DNS→TCP→TLS→OpenAI→LLMClient, never prints secrets.
 *   C — host-networking fallback compose is valid (network_mode host, PORT 8640,
 *       healthcheck on 8640, no port-mapping, cert dir mount).
 *   D — SCENARIO-AUTOGEN-1 is wired (scenario.json auto-create + objective merge).
 *   E — respondOnce() double-send guard in generation-health.
 *   F — no stale model alias (oss-20b-fast) anywhere in the offline runtime path.
 *   G — no bare `model` ReferenceError in the bridge close handler (uses summary).
 *   H — secret safety (no key/password printed by diag or bridge).
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
const diag   = read(path.join(OFF_SERVER, 'diag-litellm.py'));
const dockf  = read(path.join(OFF, 'Dockerfile.offline'));
const hostnet = read(path.join(OFF, 'docker-compose.hostnet.offline.yml'));
const compose = read(path.join(OFF, 'docker-compose.offline.yml'));
const parser = read(path.join(WGEN, 'src', 'parsers', 'scenario_parser.py'));

console.log('\n═══ OFFLINE-LITELLM E2E CONNECTIVITY ═══\n');

// ──────────────────────────────────────────────────────────────────────────────
console.log('A) Error classifier surfaces the true cause');
// DNS branch must appear BEFORE the generic connection_error branch.
const idxDns   = bridge.indexOf("errorCode = 'dns_failure'");
const idxConn  = bridge.indexOf("errorCode = 'connection_error'");
const idxRefus = bridge.indexOf("errorCode = 'connection_refused'");
check('A1  dns_failure code present',            idxDns !== -1);
check('A2  connection_error (generic) present',  idxConn !== -1);
check('A3  connection_refused (specific) present', idxRefus !== -1);
check('A4  network_unreachable present',         bridge.includes("errorCode = 'network_unreachable'"));
check('A5  connect_timeout present',             bridge.includes("errorCode = 'connect_timeout'"));
check('A6  DNS classified BEFORE generic connection_error', idxDns !== -1 && idxConn !== -1 && idxDns < idxConn, 'dns@' + idxDns + ' generic@' + idxConn);
// The bug: APIConnectionError used to map to connection_refused. It must now map
// to the generic connection_error, and the refused branch must NOT match APIConnectionError.
const refusedBranch = (bridge.match(/errorCode = 'connection_refused';[\s\S]{0,200}/) || [''])[0];
check('A7  refused branch no longer matches APIConnectionError', !/APIConnectionError/.test(
        (bridge.match(/\}\s*else if \(\/[^/]*\/i\.test\(rawErr\)\) \{\s*\n\s*errorCode = 'connection_refused'/) || [''])[0] + refusedBranch)
        && bridge.includes("/Connection refused|ECONNREFUSED|\\[Errno 111\\]/i"));
check('A8  generic branch matches APIConnectionError', /APIConnectionError\|Connection error\|httpx\\?\.ConnectError\|ConnectError/.test(bridge));
check('A9  classifier points to diag-litellm.py', bridge.includes('diag-litellm.py'));

// ──────────────────────────────────────────────────────────────────────────────
console.log('\nB) diag-litellm.py');
check('B1  diag script exists',                  diag.length > 0);
check('B2  reads RMOOZ_AI_BASE_URL',             diag.includes('RMOOZ_AI_BASE_URL'));
check('B3  reads RMOOZ_AI_MODEL',                diag.includes('RMOOZ_AI_MODEL'));
check('B4  reads CA path',                       diag.includes('RMOOZ_AI_CA_CERT_PATH'));
check('B5  walks DNS (getaddrinfo)',             diag.includes('getaddrinfo'));
check('B6  walks TCP (create_connection)',       diag.includes('create_connection'));
check('B7  walks TLS (wrap_socket + cafile)',    diag.includes('wrap_socket') && diag.includes('cafile'));
check('B8  raw OpenAI test (Test A)',            diag.includes('chat.completions.create'));
check('B9  WarGamingGEN LLMClient test (Test B)', diag.includes('from src.llm.client import LLMClient'));
check('B10 never prints the api key',            !/print\([^)]*\bkey\b/i.test(diag) && diag.includes('api key set'));
check('B11 redacts bearer/sk tokens',            diag.includes('redact') && /Bearer|sk-/.test(diag));
check('B12 Dockerfile COPYs the diag script',    /COPY .*diag-litellm\.py .*\/server\/diag-litellm\.py/.test(dockf));

// ──────────────────────────────────────────────────────────────────────────────
console.log('\nC) host-networking fallback compose');
check('C1  hostnet compose exists',              hostnet.length > 0);
check('C2  uses network_mode host',              /network_mode:\s*"?host"?/.test(hostnet));
check('C3  PORT set to 8640',                    /PORT:\s*"8640"/.test(hostnet));
check('C4  healthcheck targets 8640',            hostnet.includes('127.0.0.1:8640/api/auth/me'));
check('C5  no docker port mapping (ignored under host net)', !/^\s*ports:/m.test(hostnet));
check('C6  cert dir mount present',              hostnet.includes('./certs:/app/certs:ro'));
check('C7  carries LiteLLM + CA env',            hostnet.includes('RMOOZ_AI_BASE_URL:') && hostnet.includes('RMOOZ_AI_CA_CERT_PATH:'));
check('C8  reuses image (no rebuild)',           hostnet.includes('image: rmooz-offline:latest'));
// Bridge compose must remain bridge (unchanged default).
check('C9  default compose still uses port mapping', /ports:/.test(compose) && !/network_mode/.test(compose));

// ──────────────────────────────────────────────────────────────────────────────
console.log('\nD) SCENARIO-AUTOGEN-1 wiring');
check('D1  ensureScenarioJson defined',          bridge.includes('function ensureScenarioJson'));
check('D2  called in /run path',                 (bridge.match(/ensureScenarioJson\(c\)/g) || []).length >= 1);
check('D3  called in objective-override (lon/lat)', bridge.includes('ensureScenarioJson(c, { lon: lon, lat: lat })'));
check('D4  normalizeOverrideFile wired',         bridge.includes('normalizeOverrideFile(c)'));
check('D5  prefers canonical python sample',     bridge.includes('write_libya_sample') || bridge.includes('writeCanonicalScenarioViaPython'));
check('D6  write_libya_sample exists in parser',  parser.includes('def write_libya_sample'));
check('D7  objective-override has OBJ-X last resort', bridge.includes("defObj = { id: 'OBJ-X' }"));
check('D8  scenario objective validity check',   bridge.includes('isValidScenarioObjective'));

// ──────────────────────────────────────────────────────────────────────────────
console.log('\nE) generation-health double-send guard');
check('E1  respondOnce latch present',           ws.includes('respondOnce'));
check('E2  no bare sendJson in probe block',     !/probe\.on\('error'[\s\S]{0,400}sendJson\(res,/.test(ws));
check('E3  timeout + error both use respondOnce', (ws.match(/respondOnce\(/g) || []).length >= 3);

// ──────────────────────────────────────────────────────────────────────────────
console.log('\nF) No stale model alias in offline runtime path');
for (const [label, src] of [['bridge', bridge], ['web-server', ws], ['compose', compose], ['hostnet', hostnet], ['diag', diag]]) {
    check('F  no oss-20b-fast in ' + label,       !/oss-20b-fast/.test(src));
}

// ──────────────────────────────────────────────────────────────────────────────
console.log('\nG) No bare-model ReferenceError in bridge close handler');
// The 870081f fix: the timeout branch must reference _llm.summary.model (in scope),
// never a bare `model` variable that does not exist in the close handler.
check('G1  timeout branch uses _llm.summary.model', bridge.includes('_llm.summary.model'));
check('G2  no bare "model ||" in close handler classifier', !/'\s*\+\s*\(model\s*\|\|/.test(bridge));

// ──────────────────────────────────────────────────────────────────────────────
console.log('\nH) Secret safety');
check('H1  bridge redactSecrets present',        bridge.includes('redactSecrets'));
check('H2  bridge never console-logs the api key', !/console\.\w+\([^)]*RMOOZ_AI_API_KEY/.test(bridge));
check('H3  diag never logs CLIENT_CERT_PASSWORD', !/print\([^)]*CLIENT_CERT_PASSWORD/.test(diag));
check('H4  no raw sk-/Bearer literal in sources', !/sk-[A-Za-z0-9]{16,}/.test(bridge + ws + diag) && !/Bearer\s+[A-Za-z0-9._-]{20,}/.test(bridge + ws));

console.log('\n═══ RESULTS ═══');
console.log('  Passed: ' + passed);
console.log('  Failed: ' + failed);
if (failures.length) { console.log('\n  Failed:'); failures.forEach(function (f) { console.log('    - ' + f); }); }
console.log('');
process.exit(failed > 0 ? 1 : 0);
