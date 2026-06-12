/**
 * verify-roadmap-4.js — LIVE end-to-end check of roadmap persistence against the
 * REAL web-server (exercises the actual session-cookie auth path that the static
 * suite stubs). Self-contained + NON-DESTRUCTIVE: it snapshots data/roadmap-*.{json,jsonl}
 * before the run and restores them afterward, so the real roadmap is left untouched.
 *
 * Spawns `node server/web-server.js` on a spare port, runs the checks, kills it.
 *
 * Usage: node verify-roadmap-4.js            (admin creds default to admin/123456)
 *        RMOOZ_TEST_ADMIN_PW=... node verify-roadmap-4.js
 */
'use strict';

const http = require('http');
const net  = require('net');
const path = require('path');
const fs   = require('fs');
const { spawn } = require('child_process');

const ROOT  = __dirname;
const PORT  = Number(process.env.PORT) || 8123;
const HOST  = '127.0.0.1';
const ADMIN_USER = 'admin';
const ADMIN_PW   = process.env.RMOOZ_TEST_ADMIN_PW || '123456';
const DATA_DIR   = path.join(ROOT, 'data');
const STATUS_FILE = path.join(DATA_DIR, 'roadmap-status.json');
const AUDIT_FILE  = path.join(DATA_DIR, 'roadmap-status-audit.jsonl');

let passed = 0, failed = 0;
function check(name, cond, extra) {
    if (cond) { console.log('  [PASS] ' + name); passed++; }
    else      { console.log('  [FAIL] ' + name + (extra ? ' :: ' + extra : '')); failed++; }
}

function snapshot(file) { return fs.existsSync(file) ? fs.readFileSync(file) : null; }
function restore(file, buf) {
    try {
        if (buf === null) { if (fs.existsSync(file)) fs.unlinkSync(file); }
        else fs.writeFileSync(file, buf);
    } catch (e) { /* best effort */ }
}

function waitForPort(port, host, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    return new Promise((resolve, reject) => {
        (function attempt() {
            const s = net.connect(port, host);
            s.once('connect', () => { s.end(); resolve(); });
            s.once('error', () => {
                s.destroy();
                if (Date.now() > deadline) reject(new Error('server did not start on :' + port));
                else setTimeout(attempt, 200);
            });
        })();
    });
}

function req(method, p, opts) {
    opts = opts || {};
    const data = opts.body != null ? JSON.stringify(opts.body) : null;
    const headers = { 'Accept': 'application/json' };
    if (data != null) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = Buffer.byteLength(data); }
    if (opts.cookie) headers['Cookie'] = opts.cookie;
    return new Promise((resolve, reject) => {
        const r = http.request({ host: HOST, port: PORT, path: p, method, headers }, (res) => {
            let b = '';
            res.on('data', c => b += c);
            res.on('end', () => {
                let json = null; try { json = JSON.parse(b); } catch {}
                resolve({ status: res.statusCode, headers: res.headers, json, raw: b });
            });
        });
        r.on('error', reject);
        if (data != null) r.write(data);
        r.end();
    });
}

(async function main() {
    console.log('\n══════════════════════════════════════════════════════════════════');
    console.log('  verify-roadmap-4 — LIVE persistence check (real server, real auth)');
    console.log('══════════════════════════════════════════════════════════════════\n');

    const snapStatus = snapshot(STATUS_FILE);
    const snapAudit  = snapshot(AUDIT_FILE);

    const child = spawn(process.execPath, [path.join('server', 'web-server.js')], {
        cwd: ROOT,
        env: Object.assign({}, process.env, { PORT: String(PORT) }),
        stdio: ['ignore', 'pipe', 'pipe']
    });
    let serverErr = '';
    child.stderr.on('data', d => { serverErr += d; });

    let ok = true;
    try {
        await waitForPort(PORT, HOST, 15000);

        // A — unauthenticated requests are rejected (route wired + gate fires; not 404, not 200)
        const a1 = await req('GET',  '/api/roadmap/status');
        check('unauthenticated GET → 401', a1.status === 401, 'got ' + a1.status);
        const a2 = await req('POST', '/api/roadmap/status', { body: { item_id: 'world-state', status: 'next' } });
        check('unauthenticated POST → 401', a2.status === 401, 'got ' + a2.status);

        // B — log in as admin (real cookie session)
        const login = await req('POST', '/api/auth/login', { body: { username: ADMIN_USER, password: ADMIN_PW } });
        const setCookie = (login.headers['set-cookie'] || [])[0] || '';
        const cookie = setCookie.split(';')[0];
        check('admin login → 200 + session cookie', login.status === 200 && /rmooz_session=/.test(cookie),
            'status ' + login.status + ' cookie "' + cookie + '"');
        if (login.status !== 200) throw new Error('cannot authenticate as admin/' + '***' + ' — check creds');

        // C — admin GET → can_edit true
        const c1 = await req('GET', '/api/roadmap/status', { cookie });
        check('admin GET → 200 with can_edit:true', c1.status === 200 && c1.json && c1.json.can_edit === true,
            'status ' + c1.status + ' can_edit ' + (c1.json && c1.json.can_edit));

        // D — admin POST a real change → 200
        const d1 = await req('POST', '/api/roadmap/status', { cookie, body: { item_id: 'world-state', status: 'in_progress' } });
        check('admin POST valid change → 200 ok', d1.status === 200 && d1.json && d1.json.ok === true,
            'status ' + d1.status + ' body ' + d1.raw);

        // D2 — invalid status / unsafe id rejected over the wire
        const d2 = await req('POST', '/api/roadmap/status', { cookie, body: { item_id: 'world-state', status: 'bogus' } });
        check('admin POST invalid status → 400', d2.status === 400, 'got ' + d2.status);
        const d3 = await req('POST', '/api/roadmap/status', { cookie, body: { item_id: '../escape', status: 'completed' } });
        check('admin POST unsafe item_id → 400', d3.status === 400, 'got ' + d3.status);

        // E — the change is now visible on read (shared) ...
        const e1 = await req('GET', '/api/roadmap/status', { cookie });
        check('GET reflects the persisted change', e1.json && e1.json.statuses && e1.json.statuses['world-state'] === 'in_progress',
            JSON.stringify(e1.json && e1.json.statuses));

        // F — ... and it is on disk in the two roadmap files (nothing else touched)
        let disk = null; try { disk = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8')); } catch {}
        check('data/roadmap-status.json written with the change',
            !!disk && disk.statuses && disk.statuses['world-state'] === 'in_progress' && disk.updated_by === 'admin',
            JSON.stringify(disk));
        const auditOk = fs.existsSync(AUDIT_FILE) &&
            fs.readFileSync(AUDIT_FILE, 'utf8').split('\n').filter(Boolean)
              .some(l => { try { const r = JSON.parse(l); return r.item_id === 'world-state' && r.to === 'in_progress' && r.actor === 'admin'; } catch { return false; } });
        check('data/roadmap-status-audit.jsonl has the change line', auditOk);
    } catch (e) {
        console.log('  [ERROR] ' + e.message);
        if (serverErr.trim()) console.log('  --- server stderr ---\n' + serverErr.trim().split('\n').slice(0, 8).join('\n'));
        ok = false; failed++;
    } finally {
        try { child.kill(); } catch {}
        // NON-DESTRUCTIVE: restore the data dir to its pre-test state.
        restore(STATUS_FILE, snapStatus);
        restore(AUDIT_FILE, snapAudit);
    }

    console.log('\n' + '═'.repeat(66));
    console.log('  Results: ' + passed + ' passed, ' + failed + ' failed   (data dir restored)');
    console.log('═'.repeat(66) + '\n');
    process.exit(failed > 0 || !ok ? 1 : 0);
})();
