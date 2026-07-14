#!/usr/bin/env node
/**
 * test-proxy-trust-1.js — RMOOZ-AUTH-BATCH-A-P1-PROXY-TRUST
 *
 * Proves the RMOOZ_TRUST_PROXY gate actually changes behavior in both
 * directions — spawns TWO server instances:
 *   A) default (no RMOOZ_TRUST_PROXY) — a direct client's own
 *      X-Forwarded-Proto/Host/For headers must all be ignored.
 *   B) RMOOZ_TRUST_PROXY=1 — the same headers are honored, as they would be
 *      from a real, trusted, TLS-terminating reverse proxy.
 *
 *   node test-proxy-trust-1.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const http = require('http');
const { spawn } = require('child_process');

const ROOT          = __dirname;
const SERVER_SCRIPT  = path.join(ROOT, 'UI_MOdified/server/web-server.js');

let pass = 0, fail = 0;
function ok(cond, label, detail) {
    if (cond) { console.log('  PASS  ' + label); pass++; }
    else      { console.error('  FAIL  ' + label + (detail ? ' — ' + detail : '')); fail++; }
}
function eq(a, b, label) { ok(a === b, label, 'expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a)); }

function request(port, method, urlPath, body, opts) {
    opts = opts || {};
    return new Promise((resolve, reject) => {
        const data = body == null ? null : JSON.stringify(body);
        const headers = data == null ? {} : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) };
        if (opts.cookie) headers['Cookie'] = opts.cookie;
        if (opts.origin) headers['Origin'] = opts.origin;
        if (opts.xForwardedProto) headers['X-Forwarded-Proto'] = opts.xForwardedProto;
        if (opts.xForwardedHost) headers['X-Forwarded-Host'] = opts.xForwardedHost;
        if (opts.xForwardedFor) headers['X-Forwarded-For'] = opts.xForwardedFor;
        const req = http.request({ method, host: '127.0.0.1', port, path: urlPath, headers }, (res) => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => {
                const raw = Buffer.concat(chunks).toString('utf8');
                let json = null; try { json = JSON.parse(raw); } catch (_) {}
                const setCookieRaw = res.headers['set-cookie'] || [];
                let setCookieFull = null;
                for (const sc of setCookieRaw) { if (/^rmooz_session=/.test(sc)) { setCookieFull = sc; break; } }
                resolve({ status: res.statusCode, body: json, raw, setCookieFull, retryAfter: res.headers['retry-after'] });
            });
        });
        req.on('error', reject);
        if (data) req.write(data);
        req.end();
    });
}

function waitForServer(port, timeoutMs) {
    const deadline = Date.now() + (timeoutMs || 15000);
    return new Promise((resolve, reject) => {
        (function tick() {
            request(port, 'GET', '/api/ai/scenarios')
                .then(r => { if (r.status === 200) resolve(); else throw new Error('bad status ' + r.status); })
                .catch(() => { if (Date.now() > deadline) reject(new Error('server did not come up')); else setTimeout(tick, 150); });
        })();
    });
}

function bootServer(port, dataDir, extraEnv) {
    return spawn(process.execPath, [SERVER_SCRIPT], {
        env: Object.assign({}, process.env, {
            PORT: String(port), RMOOZ_DATA_DIR: dataDir, RMOOZ_BOOTSTRAP_PASSWORD: 'x'
        }, extraEnv || {}),
        stdio: ['ignore', 'pipe', 'pipe']
    });
}

const PORT_UNTRUSTED = 8700 + Math.floor(Math.random() * 100);
const PORT_TRUSTED   = 8800 + Math.floor(Math.random() * 100);
const DATA_UNTRUSTED = fs.mkdtempSync(path.join(os.tmpdir(), 'rmooz-proxy-untrusted-'));
const DATA_TRUSTED   = fs.mkdtempSync(path.join(os.tmpdir(), 'rmooz-proxy-trusted-'));

const serverUntrusted = bootServer(PORT_UNTRUSTED, DATA_UNTRUSTED, {});
const serverTrusted   = bootServer(PORT_TRUSTED, DATA_TRUSTED, { RMOOZ_TRUST_PROXY: '1' });
let untrustedErr = '', trustedErr = '';
serverUntrusted.stderr.on('data', d => { untrustedErr += d.toString(); });
serverTrusted.stderr.on('data', d => { trustedErr += d.toString(); });
serverUntrusted.stdout.on('data', () => {});
serverTrusted.stdout.on('data', () => {});

function teardown() {
    try { serverUntrusted.kill(); } catch (_) {}
    try { serverTrusted.kill(); } catch (_) {}
    try { fs.rmSync(DATA_UNTRUSTED, { recursive: true, force: true }); } catch (_) {}
    try { fs.rmSync(DATA_TRUSTED, { recursive: true, force: true }); } catch (_) {}
}
process.on('exit', teardown);

(async function run() {
    try {
        await Promise.all([waitForServer(PORT_UNTRUSTED, 15000), waitForServer(PORT_TRUSTED, 15000)]);
        console.log('[setup] both servers up (untrusted=' + PORT_UNTRUSTED + ', trusted=' + PORT_TRUSTED + ')');

        // ── A. Untrusted (default) server: forwarded headers are ignored ──
        console.log('\n[A] Default server (no RMOOZ_TRUST_PROXY) ignores forwarded headers');

        const untrustedHost = '127.0.0.1:' + PORT_UNTRUSTED;
        const secureLogin = await request(PORT_UNTRUSTED, 'POST', '/api/auth/login',
            { username: 'admin', password: 'x' }, { xForwardedProto: 'https' });
        ok(secureLogin.setCookieFull && !secureLogin.setCookieFull.includes('Secure'),
            'X-Forwarded-Proto:https from a direct client does NOT set Secure cookie');

        // Attacker tries to fake a matching host via X-Forwarded-Host so a
        // real cross-origin Origin "looks like" it matches — must still fail.
        const spoofedHostAttempt = await request(PORT_UNTRUSTED, 'POST', '/api/auth/register',
            { username: 'proxy-spoof-1', password: 'testpass1' },
            { origin: 'http://evil.example.com', xForwardedHost: 'evil.example.com' });
        eq(spoofedHostAttempt.status, 403, 'X-Forwarded-Host cannot be used to fake a matching Origin on an untrusted server');

        // A real same-origin request (matching the ACTUAL host) still works,
        // proving the CSRF check itself isn't broken by the proxy-trust gate.
        const realSameOrigin = await request(PORT_UNTRUSTED, 'POST', '/api/auth/register',
            { username: 'proxy-real-same-origin', password: 'testpass1' }, { origin: 'http://' + untrustedHost });
        eq(realSameOrigin.status, 201, 'a genuinely matching Origin still works on the untrusted server');

        // X-Forwarded-For cannot be used to escape the rate limiter: spam
        // login with a DIFFERENT fake forwarded IP on every request — if the
        // header were honored, each would look like a fresh, unlimited IP;
        // since it's ignored, they all share this process's real 127.0.0.1
        // bucket and the limiter still fires.
        let untrustedGot429 = false;
        for (let i = 0; i < 25; i++) {
            const r = await request(PORT_UNTRUSTED, 'POST', '/api/auth/login',
                { username: 'admin', password: 'wrong' }, { xForwardedFor: '10.0.0.' + i });
            if (r.status === 429) { untrustedGot429 = true; break; }
        }
        ok(untrustedGot429, 'spoofing a fresh X-Forwarded-For on every request does NOT evade the rate limiter (untrusted)');

        // ── B. Trusted server: forwarded headers ARE honored ────────────
        console.log('\n[B] RMOOZ_TRUST_PROXY=1 server honors forwarded headers');

        const trustedSecureLogin = await request(PORT_TRUSTED, 'POST', '/api/auth/login',
            { username: 'admin', password: 'x' }, { xForwardedProto: 'https' });
        ok(trustedSecureLogin.setCookieFull && trustedSecureLogin.setCookieFull.includes('Secure'),
            'X-Forwarded-Proto:https from a trusted reverse proxy DOES set Secure cookie');

        // Simulate the real reverse-proxy topology: the backend's own Host
        // header is the internal target, but the public-facing name (what
        // the browser's Origin reflects) is carried in X-Forwarded-Host.
        const trustedMatchingForwardedHost = await request(PORT_TRUSTED, 'POST', '/api/auth/register',
            { username: 'proxy-trusted-match', password: 'testpass1' },
            { origin: 'http://app.example.com', xForwardedHost: 'app.example.com' });
        eq(trustedMatchingForwardedHost.status, 201,
            'Origin matching X-Forwarded-Host is accepted when the proxy is trusted (real reverse-proxy shape)');

        const trustedMismatchedOrigin = await request(PORT_TRUSTED, 'POST', '/api/auth/register',
            { username: 'proxy-trusted-mismatch', password: 'testpass1' },
            { origin: 'http://evil.example.com', xForwardedHost: 'app.example.com' });
        eq(trustedMismatchedOrigin.status, 403,
            'a genuinely mismatched Origin is still rejected even in trusted-proxy mode');

        // ── C. Rate limiter mechanics: Retry-After + 429 body ────────────
        console.log('\n[C] Rate limiter returns 429 with Retry-After');
        let retryAfterSeen = null;
        for (let i = 0; i < 25; i++) {
            const r = await request(PORT_UNTRUSTED, 'POST', '/api/auth/login', { username: 'admin', password: 'wrong-again' });
            if (r.status === 429) { retryAfterSeen = r; break; }
        }
        ok(!!retryAfterSeen, 'rate limiter fires again on a fresh burst');
        ok(retryAfterSeen && !!retryAfterSeen.retryAfter, 'Retry-After header is present on a 429');
        ok(retryAfterSeen && retryAfterSeen.body && typeof retryAfterSeen.body.retryAfterSec === 'number',
            'Retry-After is also echoed in the JSON body');

        // ── D. Bucket isolation: login limiting doesn't touch register ──
        console.log('\n[D] Rate-limit buckets are isolated per endpoint');
        const stillCanRegister = await request(PORT_UNTRUSTED, 'POST', '/api/auth/register',
            { username: 'proxy-bucket-isolation-check', password: 'testpass1' });
        eq(stillCanRegister.status, 201,
            'registration still works after the LOGIN bucket was exhausted — buckets are independent');

        console.log('\n' + (fail === 0 ? 'OK' : 'FAIL') + ' — ' + pass + ' pass, ' + fail + ' fail');
        teardown();
        process.exit(fail === 0 ? 0 : 1);
    } catch (e) {
        console.log('FAIL — harness error: ' + (e && e.message));
        if (untrustedErr) console.log('  untrusted server stderr:', untrustedErr.slice(0, 800));
        if (trustedErr) console.log('  trusted server stderr:', trustedErr.slice(0, 800));
        teardown();
        process.exit(1);
    }
})();
