#!/usr/bin/env node
/**
 * test-session-security-hardening-1.js — RMOOZ-AUTH-BATCH-A-P1-1
 *
 * P1 session/CSRF hardening gate, per the owner's approved order:
 *   1. CSRF mitigation (strict-origin-if-present) on state-changing routes.
 *   2. Session rotation after login (old cookie stops working once a new
 *      login happens; a fresh session ID is always issued).
 *   3. Environment-aware Secure/HttpOnly/SameSite cookie policy.
 *   4. Expired-session cleanup (stale rows actually get deleted).
 *   5. Logout invalidation (old cookie is dead, not just cleared client-side).
 *   6. Rate limiting on login/register.
 *
 *   node test-session-security-hardening-1.js
 */
'use strict';

const fs    = require('fs');
const path  = require('path');
const os    = require('os');
const http  = require('http');
const { spawn } = require('child_process');

const ROOT          = __dirname;
const SERVER_SCRIPT  = path.join(ROOT, 'UI_MOdified/server/web-server.js');
const PORT           = 8350 + Math.floor(Math.random() * 900);
const DATA_DIR       = fs.mkdtempSync(path.join(os.tmpdir(), 'rmooz-session-hardening-'));
const BOOTSTRAP_PW   = 'bootstrap-verify-pw-3';

let pass = 0, fail = 0;
function ok(cond, label, detail) {
    if (cond) { console.log('  PASS  ' + label); pass++; }
    else      { console.error('  FAIL  ' + label + (detail ? ' — ' + detail : '')); fail++; }
}
function eq(a, b, label) { ok(a === b, label, 'expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a)); }

function request(method, urlPath, body, opts) {
    opts = opts || {};
    return new Promise(function (resolve, reject) {
        var data = body == null ? null : JSON.stringify(body);
        var headers = data == null ? {} : {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data)
        };
        if (opts.cookie) headers['Cookie'] = opts.cookie;
        if (opts.origin) headers['Origin'] = opts.origin;
        if (opts.referer) headers['Referer'] = opts.referer;
        if (opts.xForwardedProto) headers['X-Forwarded-Proto'] = opts.xForwardedProto;
        var req = http.request({
            method: method, host: '127.0.0.1', port: PORT, path: urlPath, headers: headers
        }, function (res) {
            var chunks = [];
            res.on('data', function (c) { chunks.push(c); });
            res.on('end', function () {
                var raw = Buffer.concat(chunks).toString('utf8');
                var json = null; try { json = JSON.parse(raw); } catch (_) {}
                var setCookieRaw = res.headers['set-cookie'] || [];
                var sessionCookie = null;
                var setCookieFull = null;
                for (var i = 0; i < setCookieRaw.length; i++) {
                    var m = /^(rmooz_session=[^;]+)/.exec(setCookieRaw[i]);
                    if (m) { sessionCookie = m[1]; setCookieFull = setCookieRaw[i]; break; }
                }
                resolve({ status: res.statusCode, body: json, raw: raw, sessionCookie: sessionCookie, setCookieFull: setCookieFull });
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

(async function run() {
    try {
        await waitForServer(15000);
        console.log('[setup] server up');

        const host = '127.0.0.1:' + PORT;

        // ── 1. CSRF: strict-origin-if-present ─────────────────────────────
        console.log('\n[1] CSRF mitigation — strict origin check on state-changing routes');
        const sameOrigin = await request('POST', '/api/auth/register',
            { username: 'csrf-same-origin', password: 'testpass1' },
            { origin: 'http://' + host });
        eq(sameOrigin.status, 201, 'matching Origin header -> allowed (201)');

        const crossOrigin = await request('POST', '/api/auth/register',
            { username: 'csrf-cross-origin', password: 'testpass1' },
            { origin: 'http://evil.example.com' });
        eq(crossOrigin.status, 403, 'mismatched Origin header -> 403');

        const crossReferer = await request('POST', '/api/auth/register',
            { username: 'csrf-cross-referer', password: 'testpass1' },
            { referer: 'http://evil.example.com/attack.html' });
        eq(crossReferer.status, 403, 'mismatched Referer (no Origin) -> 403');

        const sameReferer = await request('POST', '/api/auth/register',
            { username: 'csrf-same-referer', password: 'testpass1' },
            { referer: 'http://' + host + '/app.html' });
        eq(sameReferer.status, 201, 'matching Referer (no Origin) -> allowed (201)');

        const noHeaders = await request('POST', '/api/auth/register',
            { username: 'csrf-no-headers', password: 'testpass1' });
        eq(noHeaders.status, 201,
            'no Origin/Referer at all -> allowed (201) — the documented policy for CLI/Electron/offline ' +
            'API clients, which don\'t carry a victim\'s browser session the way the CSRF threat requires');

        // "Origin: null" — browsers send this literal string in a handful of
        // cross-origin-adjacent contexts (sandboxed iframes, some redirects,
        // file:// pages). A well-known bypass in naive implementations is to
        // treat an unparseable/null origin as "no origin provided" and let it
        // through — must be explicitly rejected instead.
        const nullOrigin = await request('POST', '/api/auth/register',
            { username: 'csrf-null-origin', password: 'testpass1' },
            { origin: 'null' });
        eq(nullOrigin.status, 403, 'Origin: null is explicitly rejected, not treated as "no origin"');

        const getUnaffected = await request('GET', '/api/ai/scenarios', null, { origin: 'http://evil.example.com' });
        eq(getUnaffected.status, 200, 'GET requests are never CSRF-checked, even cross-origin');

        // ── 2. Session rotation + cookie policy ────────────────────────────
        console.log('\n[2] Session rotation, cookie flags, env-aware Secure');
        await request('POST', '/api/auth/register', { username: 'rotation-tester', password: 'testpass2' });
        const login1 = await request('POST', '/api/auth/login', { username: 'rotation-tester', password: 'testpass2' });
        eq(login1.status, 200, 'first login 200');
        ok(login1.setCookieFull && login1.setCookieFull.includes('HttpOnly'), 'cookie has HttpOnly');
        ok(login1.setCookieFull && login1.setCookieFull.includes('SameSite=Lax'), 'cookie has SameSite=Lax');
        ok(login1.setCookieFull && !login1.setCookieFull.includes('Secure'), 'cookie has NO Secure flag by default (plain HTTP, offline-compatible)');
        const cookie1 = login1.sessionCookie;

        // Second login, presenting the first cookie — rotation should mint a
        // brand-new session ID AND invalidate the presented one.
        const login2 = await request('POST', '/api/auth/login',
            { username: 'rotation-tester', password: 'testpass2' }, { cookie: cookie1 });
        eq(login2.status, 200, 'second login 200');
        const cookie2 = login2.sessionCookie;
        ok(cookie1 !== cookie2, 'second login issues a DIFFERENT session id (rotation)');

        const meWithOldCookie = await request('POST', '/api/sim/decide',
            { scenarioName: 'wargame3', decisions: [{ type: 'MOVE', actor: 'x', to: [1, 1] }] },
            { cookie: cookie1 });
        eq(meWithOldCookie.status, 401, 'the OLD cookie from before rotation is now dead (401)');

        const meWithNewCookie = await request('POST', '/api/sim/decide',
            { scenarioName: 'wargame3', decisions: [{ type: 'MOVE', actor: 'x', to: [1, 1] }] },
            { cookie: cookie2 });
        ok(meWithNewCookie.status !== 401, 'the NEW cookie still authenticates (status ' + meWithNewCookie.status + ')');

        // Proxy trust: by default (no RMOOZ_TRUST_PROXY) a direct client's
        // own X-Forwarded-Proto header must be IGNORED — otherwise any
        // caller could flip its own cookie mode by just sending the header.
        // The trusted-proxy case (RMOOZ_TRUST_PROXY=1 honoring this same
        // header) is covered separately in test-proxy-trust-1.js, which
        // spawns a second server instance with that env var set.
        const httpsLoginUntrusted = await request('POST', '/api/auth/login',
            { username: 'rotation-tester', password: 'testpass2' }, { xForwardedProto: 'https' });
        ok(httpsLoginUntrusted.setCookieFull && !httpsLoginUntrusted.setCookieFull.includes('Secure'),
            'X-Forwarded-Proto: https from an UNTRUSTED client is ignored (no Secure flag) — RMOOZ_TRUST_PROXY not set');

        // ── 3. Logout invalidation ──────────────────────────────────────────
        console.log('\n[3] Logout invalidates the session server-side');
        const logout = await request('POST', '/api/auth/logout', {}, { cookie: cookie2 });
        eq(logout.status, 200, 'logout 200');
        const afterLogout = await request('POST', '/api/sim/decide',
            { scenarioName: 'wargame3', decisions: [{ type: 'MOVE', actor: 'x', to: [1, 1] }] },
            { cookie: cookie2 });
        eq(afterLogout.status, 401, 'the logged-out cookie no longer authenticates (401)');

        // ── 4. Expired-session cleanup ───────────────────────────────────────
        console.log('\n[4] Expired sessions are actually deleted, not just ignored');
        const Database = require(path.join(ROOT, 'UI_MOdified/node_modules/better-sqlite3'));
        const db = new Database(path.join(DATA_DIR, 'app.db'));
        const uid = db.prepare("SELECT id FROM users WHERE username='rotation-tester'").get().id;
        db.prepare("INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?,?,?,?)")
            .run('expired-test-session-id', uid, Date.now() - 1000, new Date().toISOString());
        const beforeCleanup = db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE id='expired-test-session-id'").get();
        eq(beforeCleanup.n, 1, 'expired session row exists before any login/logout');
        db.close();

        // Any login/logout call triggers cleanupExpiredSessions().
        await request('POST', '/api/auth/login', { username: 'rotation-tester', password: 'testpass2' });

        const db2 = new Database(path.join(DATA_DIR, 'app.db'));
        const afterCleanup = db2.prepare("SELECT COUNT(*) AS n FROM sessions WHERE id='expired-test-session-id'").get();
        eq(afterCleanup.n, 0, 'expired session row is gone after the next login sweep');
        db2.close();

        // ── 5. Rate limiting ─────────────────────────────────────────────────
        console.log('\n[5] Rate limiting on login (fires within a burst, regardless of prior calls this run)');
        let got429 = false;
        for (let i = 0; i < 25; i++) {
            const r = await request('POST', '/api/auth/login', { username: 'rotation-tester', password: 'wrong-password' });
            if (r.status === 429) { got429 = true; break; }
        }
        ok(got429, 'a burst of login attempts eventually gets 429 Too Many Attempts');

        // ── Result ───────────────────────────────────────────────────────────
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
