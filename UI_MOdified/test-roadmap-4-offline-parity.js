#!/usr/bin/env node
/**
 * test-roadmap-4-offline-parity.js
 *
 * ROADMAP-4-OFFLINE-PARITY-CHECK-AND-INTEGRATION-1.
 * Verifies the development-roadmap persistence feature is wired into the OFFLINE
 * build, with the same safety contract as main, AND exercises the store's real
 * GET/POST/validation logic against a temp data dir (no server, no Docker).
 *
 * Sections:
 *   A — Offline overlay wiring (web-server.js dispatch + require)
 *   B — Offline app.html (Roadmap button + overlay div + roadmap-page.js script)
 *   C — Dockerfile copies the files the image needs
 *   D — Persistence path resolves under the mounted /app/data root
 *   E — Live store behavior: GET any user, POST admin-only, 400s
 *   F — Isolation: no sim/ai/scenario/Event-Log/storage/secret coupling
 *   G — Admin config: RMOOZ_ROADMAP_ADMINS documented + compose passthrough
 *
 * Usage: node test-roadmap-4-offline-parity.js
 */
'use strict';

const assert = require('assert');
const fs     = require('fs');
const os     = require('os');
const path   = require('path');

const ROOT        = __dirname;
const OFF         = path.join(ROOT, 'Offline_Deployment');
const OFFLINE_APP = path.join(OFF, 'offline_app');
const OFF_SERVER  = path.join(OFFLINE_APP, 'server');
const OFF_CLIENT  = path.join(OFFLINE_APP, 'client');

let passed = 0, failed = 0;
const failures = [];
function check(name, cond, note) {
    if (cond) { console.log('  PASS  ' + name); passed++; }
    else { console.error('  FAIL  ' + name + (note ? '  →  ' + note : '')); failed++; failures.push(name); }
}
function read(p) { try { return fs.readFileSync(p, 'utf8'); } catch (e) { return ''; } }
function exists(p) { try { return fs.existsSync(p); } catch (_) { return false; } }
// Strip block + line comments so safety-contract prose ("No localStorage…") is
// not mistaken for actual usage. Good enough for these comment-only files.
function stripComments(src) {
    return String(src)
        .replace(/\/\*[\s\S]*?\*\//g, '')   // block comments
        .replace(/(^|[^:])\/\/[^\n]*/g, '$1'); // line comments (keep http:// etc.)
}

console.log('\n═══ ROADMAP-4 OFFLINE PARITY ═══\n');

// ──────────────────────────────────────────────────────────────────────────────
console.log('A) Offline web-server.js wiring');
const offWs = read(path.join(OFF_SERVER, 'web-server.js'));
check('A1  requires ./roadmap-store',            offWs.includes("require('./roadmap-store')"));
check('A2  dispatches handleRoadmapApi',         offWs.includes('roadmapStore.handleRoadmapApi('));
check('A3  dispatch placed after prefs handler', offWs.indexOf('handlePrefsApi') < offWs.indexOf('handleRoadmapApi'));
check('A4  dispatch before wargame bridge',      offWs.indexOf('handleRoadmapApi') < offWs.indexOf('wargameSimBridge.handle'));

// ──────────────────────────────────────────────────────────────────────────────
console.log('\nB) Offline app.html surface');
const offHtml = read(path.join(OFF_CLIENT, 'app.html'));
check('B1  Roadmap toggle button present',       offHtml.includes('id="roadmap-toggle-btn"'));
check('B2  roadmap-overlay dialog div present',  offHtml.includes('id="roadmap-overlay"'));
check('B3  loads roadmap-page.js',               offHtml.includes('roadmap-page.js'));
check('B4  button uses i18n keys',               offHtml.includes('data-i18n="roadmap-btn"') && offHtml.includes('roadmap-toggle-title'));
check('B5  links style.css (roadmap styles)',    offHtml.includes('style.css'));
// roadmap-page.js <script> must come AFTER the overlay div so init() finds it.
// (Match the script src attribute, not the comment that also names the file.)
check('B6  overlay div before roadmap-page.js script', offHtml.indexOf('id="roadmap-overlay"') < offHtml.indexOf('src="roadmap-page.js'));

// ──────────────────────────────────────────────────────────────────────────────
console.log('\nC) Dockerfile copies the needed files');
const dockerfile = read(path.join(OFF, 'Dockerfile.offline'));
// roadmap-store.js + roadmap-page.js + style.css come from main via these bulk copies:
check('C1  COPY server/ (brings roadmap-store.js)', /COPY\s+server\/\s+\.\/server\//.test(dockerfile));
check('C2  COPY client/ (brings roadmap-page.js/style.css)', /COPY\s+client\/\s+\.\/client\//.test(dockerfile));
check('C3  app.html overlay copied AFTER client/', dockerfile.indexOf('COPY client/') < dockerfile.indexOf('offline_app/client/app.html'));
check('C4  web-server.js overlay copied AFTER server/', dockerfile.indexOf('COPY server/') < dockerfile.indexOf('offline_app/server/web-server.js'));
// roadmap-store.js exists in the main tree the image copies from:
check('C5  main server/roadmap-store.js exists', exists(path.join(ROOT, 'server', 'roadmap-store.js')));
check('C6  main client/roadmap-page.js exists',  exists(path.join(ROOT, 'client', 'roadmap-page.js')));
// There is intentionally NO offline overlay copy of these (avoids drift):
check('C7  no divergent offline roadmap-store overlay', !exists(path.join(OFF_SERVER, 'roadmap-store.js')));
check('C8  no divergent offline roadmap-page overlay',  !exists(path.join(OFF_CLIENT, 'roadmap-page.js')));

// ──────────────────────────────────────────────────────────────────────────────
console.log('\nD) Persistence path is the mounted data root');
const store = require('./server/roadmap-store');
// In the container RMOOZ_DATA_DIR is unset → dataDir() = <server>/../data = /app/data,
// which docker-compose mounts from ./data_runtime. Verify the resolver shape.
const compose = read(path.join(OFF, 'docker-compose.offline.yml'));
check('D1  compose mounts data_runtime → /app/data', compose.includes('./data_runtime:/app/data'));
check('D2  compose does NOT pin RMOOZ_DATA_DIR elsewhere', !/RMOOZ_DATA_DIR:\s*"?[^\s"]/.test(compose));
// store resolves statusFile under dataDir(); with RMOOZ_DATA_DIR set it honours it.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rm4-'));
const prevDataDir = process.env.RMOOZ_DATA_DIR;
process.env.RMOOZ_DATA_DIR = tmp;
check('D3  statusFile resolves under data dir',  store._paths.statusFile().startsWith(tmp));
check('D4  auditFile resolves under data dir',   store._paths.auditFile().startsWith(tmp));
check('D5  status filename is roadmap-status.json', path.basename(store._paths.statusFile()) === 'roadmap-status.json');
check('D6  audit filename is roadmap-status-audit.jsonl', path.basename(store._paths.auditFile()) === 'roadmap-status-audit.jsonl');

// ──────────────────────────────────────────────────────────────────────────────
console.log('\nE) Live store behavior (real handler, stubbed transport)');
// Build a tiny fake HTTP layer.
function makeRes() {
    return { _code: null, _body: null };
}
function sendJson(res, code, body) { res._code = code; res._body = body; }
function readJsonBody(req) { return Promise.resolve(req._body || {}); }

const adminUser   = { id: 1, username: 'admin', role: 'admin' };
const plannerUser = { id: 2, username: 's1234567', role: 'planner' };

// E1 — GET allowed for a normal authenticated (non-admin) user, can_edit=false.
(function () {
    const res = makeRes();
    const handled = store.handleRoadmapApi({ method: 'GET' }, res, '/api/roadmap/status', 'GET', sendJson, readJsonBody, function () { return plannerUser; });
    check('E1  GET handled + 200 for planner', handled && res._code === 200);
    check('E2  planner can_edit=false (read-only)', res._body && res._body.can_edit === false);
})();

// E3 — GET for admin → can_edit=true.
(function () {
    const res = makeRes();
    store.handleRoadmapApi({ method: 'GET' }, res, '/api/roadmap/status', 'GET', sendJson, readJsonBody, function () { return adminUser; });
    check('E3  admin can_edit=true', res._body && res._body.can_edit === true);
})();

// E4 — GET unauthenticated → 401.
(function () {
    const res = makeRes();
    store.handleRoadmapApi({ method: 'GET' }, res, '/api/roadmap/status', 'GET', sendJson, readJsonBody, function () { return null; });
    check('E4  GET unauthenticated → 401', res._code === 401);
})();

// E5 — POST by planner (non-admin) → 403, no write.
(function () {
    const res = makeRes();
    store.handleRoadmapApi({ method: 'POST', _body: { item_id: 'map-2d', status: 'pending' } }, res, '/api/roadmap/status', 'POST', sendJson, readJsonBody, function () { return plannerUser; });
    check('E5  POST by planner → 403', res._code === 403);
})();

// E6 — POST by admin with valid payload → 200 + persisted file.
let postDone = false;
(function () {
    const res = makeRes();
    const handled = store.handleRoadmapApi({ method: 'POST', _body: { item_id: 'map-2d', status: 'pending' } }, res, '/api/roadmap/status', 'POST', sendJson, readJsonBody, function () { return adminUser; });
    // POST is async (readJsonBody promise). Defer the assertions.
    setTimeout(function () {
        check('E6  POST by admin → 200', res._code === 200, 'got ' + res._code);
        check('E7  status file written under temp data dir', exists(store._paths.statusFile()));
        check('E8  audit line appended', exists(store._paths.auditFile()) && read(store._paths.auditFile()).trim().split('\n').length >= 1);
        postDone = true;
        finishAsyncChecks();
    }, 60);
})();

// E9/E10 — invalid status / invalid item id → 400 (admin, so it reaches validation).
function invalidChecks() {
    (function () {
        const res = makeRes();
        store.handleRoadmapApi({ method: 'POST', _body: { item_id: 'map-2d', status: 'BOGUS' } }, res, '/api/roadmap/status', 'POST', sendJson, readJsonBody, function () { return adminUser; });
        setTimeout(function () { check('E9  invalid status → 400', res._code === 400, 'got ' + res._code); maybeFinish(); }, 40);
    })();
    (function () {
        const res = makeRes();
        store.handleRoadmapApi({ method: 'POST', _body: { item_id: 'BAD ID!!', status: 'completed' } }, res, '/api/roadmap/status', 'POST', sendJson, readJsonBody, function () { return adminUser; });
        setTimeout(function () { check('E10 invalid item_id → 400', res._code === 400, 'got ' + res._code); maybeFinish(); }, 40);
    })();
}

// ──────────────────────────────────────────────────────────────────────────────
function staticIsolationChecks() {
    console.log('\nF) Isolation + safety (executable code, comments stripped)');
    const storeSrc = stripComments(read(path.join(ROOT, 'server', 'roadmap-store.js')));
    const pageSrc  = stripComments(read(path.join(ROOT, 'client', 'roadmap-page.js')));
    check('F1  store requires ONLY fs/path (no ai/sim)', !/require\(['"]\.\/(ai|sim)\//.test(storeSrc) && !/require\(['"][^'"]*(monte-carlo|adjudicator|red-team)/.test(storeSrc));
    check('F2  store code has no /api/sim reference', !storeSrc.includes('/api/sim'));
    check('F3  page code makes no /api/sim calls',    !pageSrc.includes('/api/sim'));
    check('F4  page code does not use localStorage',  !/localStorage\s*[.\[]/.test(pageSrc));
    check('F5  page code does not use sessionStorage', !/sessionStorage\s*[.\[]/.test(pageSrc));
    check('F6  page only calls /api/roadmap/status',  (pageSrc.match(/fetch\(/g) || []).length >= 1 && !/fetch\(\s*['"](?!\/api\/roadmap\/status)/.test(pageSrc));
    check('F7  page code never instantiates WebSocket', !/new\s+WebSocket\s*\(/.test(pageSrc));
    check('F8  store never writes the Event Log',     !/event-log|eventLog|journal/i.test(storeSrc));
    check('F9  no API key / secret literal in store', !/sk-[A-Za-z0-9]{12,}|Bearer\s+[A-Za-z0-9._-]{16,}/.test(storeSrc));
    check('F10 admin gate present (role or list)',    storeSrc.includes("role === 'admin'") && storeSrc.includes('RMOOZ_ROADMAP_ADMINS'));

    console.log('\nG) Admin configuration');
    check('G1  compose passes RMOOZ_ROADMAP_ADMINS',  compose.includes('RMOOZ_ROADMAP_ADMINS'));
    const envEx = read(path.join(OFF, '.env.offline.example'));
    check('G2  .env.offline.example documents it',    envEx.includes('RMOOZ_ROADMAP_ADMINS'));
    check('G3  default admin documented as username (not secret)', envEx.includes('usernames, NOT passwords') || envEx.includes('usernames, not secrets') || envEx.includes('NOT passwords'));
}

// Async orchestration (POST handlers resolve on next tick).
let invalidStarted = false, invalidRemaining = 2;
function finishAsyncChecks() { if (postDone && !invalidStarted) { invalidStarted = true; invalidChecks(); } }
function maybeFinish() { invalidRemaining--; if (invalidRemaining === 0) { staticIsolationChecks(); report(); } }

function report() {
    // cleanup
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
    if (prevDataDir === undefined) delete process.env.RMOOZ_DATA_DIR; else process.env.RMOOZ_DATA_DIR = prevDataDir;
    console.log('\n═══ RESULTS ═══');
    console.log('  Passed: ' + passed);
    console.log('  Failed: ' + failed);
    if (failures.length) { console.log('\n  Failed:'); failures.forEach(function (f) { console.log('    - ' + f); }); }
    console.log('');
    process.exit(failed > 0 ? 1 : 0);
}

// Kick the async tail; if POST didn't fire for some reason, fail safe after 2s.
setTimeout(function () { if (!postDone) { check('E6  POST async completed', false, 'timed out'); staticIsolationChecks(); report(); } }, 2000);
