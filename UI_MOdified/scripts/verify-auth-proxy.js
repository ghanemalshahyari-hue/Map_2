/* verify-auth-proxy.js — browser-verification harness for the RMOOZ web app.
 * ----------------------------------------------------------------------------
 * The app gates pages + APIs behind a real session (requireAuthenticatedUser).
 * For local browser verification this wrapper:
 *   1. ensures the real web-server is up on UPSTREAM (spawns it if absent),
 *   2. registers + logs in a throwaway verify user to obtain a session cookie,
 *   3. serves a reverse proxy on PORT that injects that cookie into every
 *      request — so the preview browser is always authenticated.
 *
 * It is a DEV/VERIFY tool only (never shipped to operators). No external deps.
 *
 * Env: PORT (default 8011) · UPSTREAM_PORT (default 8000) · VERIFY_USER /
 *      VERIFY_PASS (default verify/verify1234) · RMOOZ_ALLOW_SIM_RUN passed to
 *      the spawned web-server so the AI path is exercisable.
 */
'use strict';
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const PORT = parseInt(process.env.PORT || '8011', 10);
const UP_PORT = parseInt(process.env.UPSTREAM_PORT || '8000', 10);
const UP_HOST = '127.0.0.1';
const USER = process.env.VERIFY_USER || 'verify';
const PASS = process.env.VERIFY_PASS || 'verify1234';

function req(opts, body) {
    return new Promise((resolve, reject) => {
        const r = http.request(opts, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
        });
        r.on('error', reject);
        if (body) r.write(body);
        r.end();
    });
}

function upReady() {
    return req({ host: UP_HOST, port: UP_PORT, path: '/api/wargame-sim/status', method: 'GET', timeout: 1500 })
        .then(() => true).catch(() => false);
}

function waitUp(tries) {
    return upReady().then((ok) => {
        if (ok) return true;
        if (tries <= 0) return false;
        return new Promise((r) => setTimeout(r, 600)).then(() => waitUp(tries - 1));
    });
}

async function ensureUpstream() {
    if (await upReady()) { console.log('[verify] upstream :' + UP_PORT + ' already running'); return; }
    console.log('[verify] starting web-server on :' + UP_PORT + ' …');
    const child = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'web-server.js')], {
        cwd: path.join(__dirname, '..'),
        env: Object.assign({}, process.env, { PORT: String(UP_PORT), RMOOZ_ALLOW_SIM_RUN: process.env.RMOOZ_ALLOW_SIM_RUN || '1' }),
        stdio: 'inherit',
    });
    child.on('exit', (code) => console.log('[verify] web-server exited ' + code));
    const ok = await waitUp(40);
    if (!ok) throw new Error('upstream web-server did not become ready on :' + UP_PORT);
    console.log('[verify] upstream ready');
}

async function login() {
    // register (ignore 409 already-exists) then login for the Set-Cookie.
    await req({ host: UP_HOST, port: UP_PORT, path: '/api/auth/register', method: 'POST', headers: { 'Content-Type': 'application/json' } },
        JSON.stringify({ username: USER, password: PASS, displayName: 'Verify Operator', role: 'planner' }));
    const r = await req({ host: UP_HOST, port: UP_PORT, path: '/api/auth/login', method: 'POST', headers: { 'Content-Type': 'application/json' } },
        JSON.stringify({ username: USER, password: PASS }));
    const setCookie = r.headers['set-cookie'];
    if (!setCookie || !setCookie.length) throw new Error('login returned no Set-Cookie (status ' + r.status + ')');
    const cookie = setCookie.map((c) => String(c).split(';')[0]).join('; ');
    console.log('[verify] authenticated as "' + USER + '" — cookie acquired');
    return cookie;
}

function startProxy(cookie) {
    const server = http.createServer((creq, cres) => {
        const chunks = [];
        creq.on('data', (c) => chunks.push(c));
        creq.on('end', () => {
            const body = Buffer.concat(chunks);
            const headers = Object.assign({}, creq.headers, { cookie: cookie, host: UP_HOST + ':' + UP_PORT });
            delete headers['accept-encoding']; // keep responses uncompressed for simple piping
            const preq = http.request({ host: UP_HOST, port: UP_PORT, path: creq.url, method: creq.method, headers }, (pres) => {
                cres.writeHead(pres.statusCode, pres.headers);
                pres.pipe(cres);
            });
            preq.on('error', (e) => { cres.writeHead(502); cres.end('proxy error: ' + e.message); });
            if (body.length) preq.write(body);
            preq.end();
        });
    });
    server.listen(PORT, () => console.log('[verify] auth proxy ready → http://127.0.0.1:' + PORT + '/home.html (and /app.html)'));
}

(async () => {
    try {
        await ensureUpstream();
        const cookie = await login();
        startProxy(cookie);
    } catch (e) {
        console.error('[verify] FATAL: ' + (e && e.message));
        process.exit(1);
    }
})();
