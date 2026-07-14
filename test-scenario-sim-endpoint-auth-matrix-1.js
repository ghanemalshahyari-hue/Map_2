#!/usr/bin/env node
/**
 * test-scenario-sim-endpoint-auth-matrix-1.js — RMOOZ-AUTH-BATCH-A-P0-2
 *
 * Authorization matrix for the second P0 slice of Batch A hardening: the
 * scenario/sim state-write chain plus the lesson-author identity fix.
 *
 *   POST /api/wargame-sim/run, /publish, /import
 *   POST /api/scenario/import
 *   POST /api/scenarios
 *   POST /api/scenario/active
 *   POST /api/ai/lessons
 *
 * Confirms, against a real spawned server:
 *   1. Unauthenticated requests are rejected 401 on every route.
 *   2. A role outside SIM_MUTATION_ROLES is rejected 403 on the mutating
 *      scenario/sim routes (not tested for /api/ai/lessons — that route is
 *      authentication-gated only, not capability-gated; see APP_INVENTORY.md).
 *   3. An authenticated, in-allow-list session passes the gate (reaches
 *      business logic — not necessarily HTTP 200, since most of these need
 *      real run/export data this test doesn't create; "not 401/403" is the
 *      actual contract being proven here).
 *   4. /api/ai/lessons ignores a client-forged `author` and stores the real
 *      session identity instead (the identity-spoofing fix), while the
 *      client-supplied label survives only as a non-authoritative
 *      `author_display_name`.
 *
 * None of the scenario/wargame-sim-bridge routes here accept a client
 * identity field (no operator_id/author-like input) — verified by reading
 * the handlers, not assumed — so there is no forged-identity leg for them.
 *
 *   node test-scenario-sim-endpoint-auth-matrix-1.js
 */
'use strict';

const fs    = require('fs');
const path  = require('path');
const os    = require('os');
const http  = require('http');
const { spawn } = require('child_process');

const ROOT         = __dirname;
const SERVER_SCRIPT = path.join(ROOT, 'UI_MOdified/server/web-server.js');
const PORT          = 8250 + Math.floor(Math.random() * 900);
const DATA_DIR      = fs.mkdtempSync(path.join(os.tmpdir(), 'rmooz-p0-2-authmatrix-'));
const BOOTSTRAP_PW  = 'bootstrap-verify-pw-2';

fs.mkdirSync(path.join(DATA_DIR, 'scenarios'), { recursive: true });

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

async function registerAndLogin(username, password) {
    await request('POST', '/api/auth/register', { username: username, password: password });
    var login = await request('POST', '/api/auth/login', { username: username, password: password });
    return login.sessionCookie;
}

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
server.stdout.on('data', function (_b) {});
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

const ROUTES = [
    { path: '/api/wargame-sim/run',     body: {} },
    { path: '/api/wargame-sim/publish', body: {} },
    { path: '/api/wargame-sim/import',  body: {} },
    { path: '/api/scenario/import',     body: { type: 'FeatureCollection', features: [] } },
    { path: '/api/scenarios',           body: { scenario: { not: 'a real scenario' } } },
    { path: '/api/scenario/active',     body: { name: 'wargame3' } },
];

(async function run() {
    try {
        await waitForServer(15000);
        console.log('[setup] server up');

        // ── 1. Unauthenticated — 401 on every scenario/sim route ─────────
        console.log('\n[1] Unauthenticated requests are rejected 401');
        for (const r of ROUTES) {
            const res = await request('POST', r.path, r.body);
            eq(res.status, 401, 'unauth POST ' + r.path + ' -> 401');
        }

        // ── 2. Set up an in-allow-list operator + an out-of-list observer ─
        const operatorCookie = await registerAndLogin('p0-2-operator', 'testpass3');
        ok(!!operatorCookie, 'operator session cookie obtained');

        const Database = require(path.join(ROOT, 'UI_MOdified/node_modules/better-sqlite3'));
        const db = new Database(path.join(DATA_DIR, 'app.db'));
        db.prepare("UPDATE users SET role='observer' WHERE username='p0-2-operator'").run();
        db.close();

        // ── 3. Observer role — 403 on every capability-gated route ────────
        console.log('\n[3] A role outside SIM_MUTATION_ROLES is denied 403');
        for (const r of ROUTES) {
            const res = await request('POST', r.path, r.body, operatorCookie);
            eq(res.status, 403, 'observer POST ' + r.path + ' -> 403');
        }

        // Restore the role to the baseline so the passthrough checks below
        // exercise a normal, in-allow-list operator.
        const db2 = new Database(path.join(DATA_DIR, 'app.db'));
        db2.prepare("UPDATE users SET role='planner' WHERE username='p0-2-operator'").run();
        db2.close();

        // ── 4. In-allow-list session passes the gate on every route ──────
        console.log('\n[4] An authenticated, in-allow-list session passes the gate (not 401/403)');
        for (const r of ROUTES) {
            const res = await request('POST', r.path, r.body, operatorCookie);
            ok(res.status !== 401 && res.status !== 403,
                'planner POST ' + r.path + ' reaches business logic (status ' + res.status + ')');
        }

        // ── 5. Lessons: forged author is discarded, session identity wins ─
        console.log('\n[5] /api/ai/lessons ignores a forged author, binds to the session user');
        const lessonRes = await request('POST', '/api/ai/lessons', {
            scenarioName: 'wargame3',
            title: 'Test lesson',
            author: 'FORGED-COMMANDER-NAME'
        }, operatorCookie);
        eq(lessonRes.status, 200, 'authenticated lesson POST -> 200');
        ok(lessonRes.body && lessonRes.body.ok === true, 'lesson response ok=true');

        const listRes = await request('GET', '/api/ai/lessons?scenario=wargame3', null, operatorCookie);
        eq(listRes.status, 200, 'lesson list -> 200');
        const stored = listRes.body && Array.isArray(listRes.body.lessons)
            ? listRes.body.lessons.find(l => l.title === 'Test lesson') : null;
        ok(!!stored, 'stored lesson found in the list');
        eq(stored && stored.author, 'p0-2-operator', 'stored author is the real session user');
        ok(stored && stored.author !== 'FORGED-COMMANDER-NAME', 'stored author is NOT the forged value');
        eq(stored && stored.author_display_name, 'FORGED-COMMANDER-NAME',
            'the forged label survives only as a non-authoritative display snapshot');

        const unauthLesson = await request('POST', '/api/ai/lessons', { scenarioName: 'wargame3', title: 'x' });
        eq(unauthLesson.status, 401, 'unauth /api/ai/lessons -> 401');

        // ── Result ────────────────────────────────────────────────────────
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
