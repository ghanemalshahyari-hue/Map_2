#!/usr/bin/env node
/**
 * test-sim-route-auth-matrix-1.js — RMOOZ-AUTH-BATCH-A-1
 *
 * Authorization matrix + journal-attribution gate for the Batch-A auth
 * hardening of the sim mutation boundary:
 *
 *   POST /api/sim/propose, /api/sim/commit, /api/sim/decide
 *
 * Confirms (against a real spawned server, not a source-text grep):
 *   1. Unauthenticated requests are rejected 401 on all three routes.
 *   2. An authenticated session is let through (not 401).
 *   3. operator_id/actor attribution in the durable journal reflects the
 *      real session user, even when the client sends a forged operator_id
 *      in the request body.
 *   4. Registration ignores a client-supplied `role` (no self-escalation).
 *   5. The bootstrap "admin" account is actually seeded with role 'admin'.
 *
 * NOT covered here (intentionally): a 403 (authenticated-but-forbidden)
 * leg for these three routes. Today any authenticated session may call
 * them — there is no capability/unit-function scope model yet. Building
 * that is a separate, not-yet-scoped decision (see APP_INVENTORY.md /
 * memory project_multirole_audit_governance_2026-07-14) — faking a 403
 * case here would just be dishonest coverage.
 *
 *   node test-sim-route-auth-matrix-1.js
 */
'use strict';

const fs    = require('fs');
const path  = require('path');
const os    = require('os');
const http  = require('http');
const { spawn } = require('child_process');

const ROOT           = __dirname;
const SERVER_SCRIPT   = path.join(ROOT, 'UI_MOdified/server/web-server.js');
const PORT            = 8150 + Math.floor(Math.random() * 900);
const DATA_DIR        = fs.mkdtempSync(path.join(os.tmpdir(), 'rmooz-authmatrix-test-'));
const BOOTSTRAP_PW    = 'bootstrap-verify-pw-1';

// Seed the temp data dir with the real wargame3 scenario — a fresh
// RMOOZ_DATA_DIR has no scenarios/ folder at all (no auto-seed in the app).
fs.mkdirSync(path.join(DATA_DIR, 'scenarios'), { recursive: true });
fs.copyFileSync(
    path.join(ROOT, 'UI_MOdified/data/scenarios/wargame3.json'),
    path.join(DATA_DIR, 'scenarios/wargame3.json')
);

let pass = 0, fail = 0;
function ok(cond, label, detail) {
    if (cond) { console.log('  PASS  ' + label); pass++; }
    else      { console.error('  FAIL  ' + label + (detail ? ' — ' + detail : '')); fail++; }
}
function eq(a, b, label) { ok(a === b, label, 'expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a)); }

function request(method, urlPath, body, cookie) {
    return new Promise(function (resolve, reject) {
        var data = body == null ? null : JSON.stringify(body);
        var headers = data == null ? {} : {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data)
        };
        if (cookie) headers['Cookie'] = cookie;
        var req = http.request({
            method: method, host: '127.0.0.1', port: PORT, path: urlPath, headers: headers
        }, function (res) {
            var chunks = [];
            res.on('data', function (c) { chunks.push(c); });
            res.on('end', function () {
                var raw = Buffer.concat(chunks).toString('utf8');
                var json = null; try { json = JSON.parse(raw); } catch (_) {}
                var setCookie = res.headers['set-cookie'];
                var sessionCookie = null;
                if (setCookie) {
                    for (var i = 0; i < setCookie.length; i++) {
                        var m = /^(rmooz_session=[^;]+)/.exec(setCookie[i]);
                        if (m) { sessionCookie = m[1]; break; }
                    }
                }
                resolve({ status: res.statusCode, body: json, raw: raw, sessionCookie: sessionCookie });
            });
        });
        req.on('error', reject);
        if (data) req.write(data);
        req.end();
    });
}

function waitForServer(timeoutMs) {
    var deadline = Date.now() + (timeoutMs || 10000);
    return new Promise(function (resolve, reject) {
        (function tick() {
            request('GET', '/api/ai/scenarios')
                .then(function (r) { if (r.status === 200) resolve(); else throw new Error('bad status ' + r.status); })
                .catch(function () {
                    if (Date.now() > deadline) reject(new Error('server did not come up'));
                    else setTimeout(tick, 150);
                });
        })();
    });
}

async function registerAndLogin(username, password, roleAttempt) {
    var regBody = { username: username, password: password };
    if (roleAttempt) regBody.role = roleAttempt;
    var r1 = await request('POST', '/api/auth/register', regBody);
    var r2 = await request('POST', '/api/auth/login', { username: username, password: password });
    return { register: r1, login: r2, cookie: r2.sessionCookie };
}

function readJournalLastRow(runId) {
    var p = path.join(DATA_DIR, 'journal', runId + '.jsonl');
    var lines = fs.readFileSync(p, 'utf8').trim().split('\n');
    return JSON.parse(lines[lines.length - 1]);
}

// ── Spawn the server ────────────────────────────────────────────────────
console.log('[setup] booting web-server.js on port ' + PORT + ' with DATA_DIR=' + DATA_DIR);
var server = spawn(process.execPath, [SERVER_SCRIPT], {
    env: Object.assign({}, process.env, {
        PORT: String(PORT),
        RMOOZ_DATA_DIR: DATA_DIR,
        RMOOZ_BOOTSTRAP_PASSWORD: BOOTSTRAP_PW
    }),
    stdio: ['ignore', 'pipe', 'pipe']
});
var serverErr = '';
server.stderr.on('data', function (b) { serverErr += b.toString(); });
server.stdout.on('data', function (_b) { /* swallow stdout */ });
server.on('exit', function (code) {
    if (code !== 0 && code !== null) {
        console.log('[setup] server exited code=' + code);
        if (serverErr) console.log('  stderr:', serverErr.slice(0, 800));
    }
});

function teardown() {
    try { server.kill(); } catch (_) {}
    try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch (_) {}
}
process.on('exit', teardown);

(async function run() {
    try {
        await waitForServer(15000);
        console.log('[setup] server up');

        // ── 1. Unauthenticated — 401 on all three sim routes ────────────
        console.log('\n[1] Unauthenticated requests are rejected 401');
        var u1 = await request('POST', '/api/sim/propose', { scenarioName: 'wargame3', stepIndex: 0, mockMode: true });
        eq(u1.status, 401, 'unauth /api/sim/propose -> 401');
        var u2 = await request('POST', '/api/sim/commit', { proposal_id: 'does-not-matter', accepted_action_ids: 'ALL' });
        eq(u2.status, 401, 'unauth /api/sim/commit -> 401');
        var u3 = await request('POST', '/api/sim/decide', { scenarioName: 'wargame3', stepIndex: 0, decisions: [{ type: 'MOVE', actor: 'B-d1-51-001', to: [19.6, 30.11] }] });
        eq(u3.status, 401, 'unauth /api/sim/decide -> 401');

        // ── 2. Registration ignores a client-supplied role ──────────────
        console.log('\n[2] Registration cannot self-escalate role');
        var escalate = await registerAndLogin('escalate-tester', 'testpass1', 'admin');
        eq(escalate.register.status, 201, 'register 201');
        ok(escalate.login.body && escalate.login.body.role === 'planner',
            'registered user role is the baseline "planner", not the requested "admin"',
            'got role=' + (escalate.login.body && escalate.login.body.role));

        // ── 3. Bootstrap admin account actually has role admin ──────────
        console.log('\n[3] Bootstrap admin account has role=admin');
        var adminLogin = await request('POST', '/api/auth/login', { username: 'admin', password: BOOTSTRAP_PW });
        eq(adminLogin.status, 200, 'bootstrap admin login 200');
        eq(adminLogin.body && adminLogin.body.role, 'admin', 'bootstrap admin role is "admin"');

        // ── 4. Authenticated session passes the auth gate (not 401) ─────
        console.log('\n[4] Authenticated requests pass the auth gate');
        var operator = await registerAndLogin('battle-operator', 'testpass2', null);
        ok(!!operator.cookie, 'operator session cookie obtained');
        var a1 = await request('POST', '/api/sim/propose', { scenarioName: 'wargame3', stepIndex: 0, mockMode: true }, operator.cookie);
        ok(a1.status !== 401, 'authenticated /api/sim/propose is not blocked (status ' + a1.status + ')');

        // ── 5. Journal attribution: forged operator_id is discarded ─────
        console.log('\n[5] /api/sim/decide journals the true session user, ignoring a forged operator_id');
        var runId = 'authmatrix-decide-run-1';
        var d1 = await request('POST', '/api/sim/decide', {
            scenarioName: 'wargame3',
            stepIndex: 0,
            runId: runId,
            operator_id: 'FORGED-ADMIN-IDENTITY',
            decisions: [{ type: 'MOVE', actor: 'B-d1-51-001', to: [19.6, 30.11] }]
        }, operator.cookie);
        eq(d1.status, 200, '/api/sim/decide with a valid session -> 200');
        ok(d1.body && d1.body.ok === true, 'decide response ok=true');
        var journalRow = readJournalLastRow(runId);
        eq(journalRow.operator_id, 'op:battle-operator', 'journal operator_id is the real session user');
        ok(journalRow.operator_id !== 'op:FORGED-ADMIN-IDENTITY' && journalRow.operator_id !== 'FORGED-ADMIN-IDENTITY',
            'journal operator_id is NOT the client-forged value');

        // ── 6. Commit route also passes the auth gate ───────────────────
        console.log('\n[6] Authenticated /api/sim/commit is not blocked by auth');
        var c1 = await request('POST', '/api/sim/commit', { proposal_id: 'nonexistent-proposal', accepted_action_ids: 'ALL' }, operator.cookie);
        ok(c1.status !== 401, 'authenticated /api/sim/commit reaches business logic, not auth-blocked (status ' + c1.status + ')');
        eq(c1.status, 400, 'unknown proposal_id -> 400 business-logic error (proves it got past auth into commitStep)');

        // ── Result ───────────────────────────────────────────────────────
        console.log('\n' + (fail === 0 ? 'OK' : 'FAIL') + ' — ' + pass + ' pass, ' + fail + ' fail');
        teardown();
        process.exit(fail === 0 ? 0 : 1);
    } catch (e) {
        console.log('FAIL — test harness error: ' + (e && e.message));
        if (serverErr) console.log('  server stderr:', serverErr.slice(0, 1000));
        teardown();
        process.exit(1);
    }
})();
