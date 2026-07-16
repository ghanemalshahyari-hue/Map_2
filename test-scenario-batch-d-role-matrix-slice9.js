#!/usr/bin/env node
/**
 * test-scenario-batch-d-role-matrix-slice9.js — Batch D Slice 9
 *
 * Full author/approver/unauthorized/self-approval-denial role matrix across
 * EVERY new Batch D endpoint: revisions list, compare, restore, clone,
 * save-as-template, archive, restore-from-archive — extending the
 * request()+cookie idiom test-command-authority-slice2.js already
 * established, rather than inventing a new testing pattern.
 *
 *   node test-scenario-batch-d-role-matrix-slice9.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = __dirname;
const SAMPLE_PATH   = path.join(ROOT, 'docs/cmo-functional-rules/sample-sahil-corridor.json');
const SERVER_SCRIPT = path.join(ROOT, 'UI_MOdified/server/web-server.js');
const PORT = 9160 + Math.floor(Math.random() * 300);
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rmooz-batch-d-role-matrix-'));

let pass = 0, fail = 0;
function ok(cond, label, detail) {
    if (cond) { console.log('  PASS  ' + label); pass++; }
    else      { console.error('  FAIL  ' + label + (detail ? ' — ' + detail : '')); fail++; }
}
function eq(a, b, label) { ok(a === b, label, 'expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a)); }

function request(method, urlPath, body, cookie) {
    return new Promise((resolve, reject) => {
        const data = body == null ? null : JSON.stringify(body);
        const headers = data == null ? {} : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) };
        if (cookie) headers['Cookie'] = cookie;
        const req = http.request({ method, host: '127.0.0.1', port: PORT, path: urlPath, headers }, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => {
                const raw = Buffer.concat(chunks).toString('utf8');
                let json = null; try { json = JSON.parse(raw); } catch (_) {}
                const setCookie = res.headers['set-cookie'];
                let sessionCookie = null;
                if (setCookie) for (const s of setCookie) { const m = /^(rmooz_session=[^;]+)/.exec(s); if (m) { sessionCookie = m[1]; break; } }
                resolve({ status: res.statusCode, body: json, sessionCookie });
            });
        });
        req.on('error', reject);
        if (data) req.write(data);
        req.end();
    });
}
function waitForServer(timeoutMs) {
    const deadline = Date.now() + (timeoutMs || 15000);
    return new Promise((resolve, reject) => {
        (function tick() {
            request('GET', '/api/ai/scenarios')
                .then((r) => { if (r.status === 200) resolve(); else throw new Error('bad status ' + r.status); })
                .catch(() => { if (Date.now() > deadline) reject(new Error('server did not come up')); else setTimeout(tick, 150); });
        })();
    });
}
async function registerAndLogin(username, password) {
    await request('POST', '/api/auth/register', { username, password });
    const login = await request('POST', '/api/auth/login', { username, password });
    return login.sessionCookie;
}

console.log('[setup] booting web-server.js on port ' + PORT + ' with DATA_DIR=' + DATA_DIR);
const server = spawn(process.execPath, [SERVER_SCRIPT], {
    env: Object.assign({}, process.env, { PORT: String(PORT), RMOOZ_DATA_DIR: DATA_DIR, RMOOZ_BOOTSTRAP_PASSWORD: 'verify' }),
    stdio: ['ignore', 'pipe', 'pipe']
});
let serverErr = '';
server.stderr.on('data', (b) => { serverErr += b.toString(); });
function teardown() { try { server.kill(); } catch (_) {} try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch (_) {} }
process.on('exit', teardown);

(async () => {
    try {
        await waitForServer(15000);

        // ── Actor setup — same isolated-test-DB pattern as every other
        // Batch A-D test in this repo (a disposable temp SQLite file, not
        // the live app database). ──────────────────────────────────────────
        const authorCookie    = await registerAndLogin('d9-author', 'testpass1');
        const commanderCookie = await registerAndLogin('d9-commander', 'testpass1');
        const commander2Cookie = await registerAndLogin('d9-commander2', 'testpass1');
        const observerCookie  = await registerAndLogin('d9-observer', 'testpass1');
        const Database = require(path.join(ROOT, 'UI_MOdified/node_modules/better-sqlite3'));
        const db = new Database(path.join(DATA_DIR, 'app.db'));
        db.prepare("UPDATE users SET role='commander' WHERE username='d9-commander'").run();
        db.prepare("UPDATE users SET role='commander' WHERE username='d9-commander2'").run();
        db.prepare("UPDATE users SET role='observer' WHERE username='d9-observer'").run();
        db.close();

        const sample = JSON.parse(fs.readFileSync(SAMPLE_PATH, 'utf8'));
        const draft = JSON.parse(JSON.stringify(sample));
        draft.name = 'rm-test';
        await request('POST', '/api/scenarios', { scenario: draft }, authorCookie);
        const draft2 = JSON.parse(JSON.stringify(draft));
        draft2.scenario_label = 'Revision 2 for role-matrix test';
        await request('POST', '/api/scenarios?overwrite=1', { scenario: draft2 }, authorCookie);
        await request('POST', '/api/scenarios/rm-test/submit-for-review', {}, authorCookie);
        await request('POST', '/api/scenarios/rm-test/approve', {}, commanderCookie);

        console.log('\n=== GET /api/scenarios/:name/revisions ===\n');
        eq((await request('GET', '/api/scenarios/rm-test/revisions')).status, 401, 'unauthenticated -> 401');
        eq((await request('GET', '/api/scenarios/rm-test/revisions', null, observerCookie)).status, 200, 'observer (read-only role) CAN list revisions -> 200');
        eq((await request('GET', '/api/scenarios/rm-test/revisions', null, authorCookie)).status, 200, 'author CAN list revisions -> 200');

        console.log('\n=== GET /api/scenarios/:name/revisions/:a/compare/:b ===\n');
        eq((await request('GET', '/api/scenarios/rm-test/revisions/1/compare/2')).status, 401, 'unauthenticated -> 401');
        eq((await request('GET', '/api/scenarios/rm-test/revisions/1/compare/2', null, observerCookie)).status, 200, 'observer CAN compare -> 200 (read-only)');
        eq((await request('GET', '/api/scenarios/rm-test/revisions/1/compare/2', null, authorCookie)).status, 200, 'author CAN compare -> 200');

        console.log('\n=== POST /api/scenarios/:name/revisions/:n/restore ===\n');
        eq((await request('POST', '/api/scenarios/rm-test/revisions/1/restore', {})).status, 401, 'unauthenticated -> 401');
        eq((await request('POST', '/api/scenarios/rm-test/revisions/1/restore', {}, observerCookie)).status, 403, 'observer (non-mutation role) CANNOT restore -> 403');
        const restoreOk = await request('POST', '/api/scenarios/rm-test/revisions/1/restore', {}, authorCookie);
        eq(restoreOk.status, 200, 'author CAN restore -> 200');
        eq(restoreOk.body.revision, 3, 'restore created revision 3');

        console.log('\n=== POST /api/scenarios/:name/clone ===\n');
        eq((await request('POST', '/api/scenarios/rm-test/clone', { new_name: 'rm-test-clone-a' })).status, 401, 'unauthenticated -> 401');
        eq((await request('POST', '/api/scenarios/rm-test/clone', { new_name: 'rm-test-clone-b' }, observerCookie)).status, 403, 'observer CANNOT clone -> 403');
        const cloneOk = await request('POST', '/api/scenarios/rm-test/clone', { new_name: 'rm-test-clone-c' }, authorCookie);
        eq(cloneOk.status, 200, 'author CAN clone -> 200');
        eq((await request('POST', '/api/scenarios/rm-test/clone', {}, authorCookie)).status, 400, 'missing new_name -> 400 (role check passes, input validation catches it)');

        console.log('\n=== POST /api/scenarios/:name/save-as-template ===\n');
        eq((await request('POST', '/api/scenarios/rm-test/save-as-template', { label: 'x' })).status, 401, 'unauthenticated -> 401');
        eq((await request('POST', '/api/scenarios/rm-test/save-as-template', { label: 'x' }, observerCookie)).status, 403, 'observer CANNOT save-as-template -> 403');
        eq((await request('POST', '/api/scenarios/rm-test/save-as-template', { label: 'Role-matrix template' }, authorCookie)).status, 200, 'author CAN save-as-template -> 200');

        console.log('\n=== POST /api/scenarios/:name/archive ===\n');
        eq((await request('POST', '/api/scenarios/rm-test/archive', {})).status, 401, 'unauthenticated -> 401');
        eq((await request('POST', '/api/scenarios/rm-test/archive', {}, observerCookie)).status, 403, 'observer CANNOT archive -> 403 (canAuthor gate)');
        eq((await request('POST', '/api/scenarios/rm-test/archive', {}, authorCookie)).status, 200, 'author CAN archive -> 200');

        console.log('\n=== POST /api/scenarios/:name/restore-from-archive ===\n');
        eq((await request('POST', '/api/scenarios/rm-test/restore-from-archive', {})).status, 401, 'unauthenticated -> 401');
        eq((await request('POST', '/api/scenarios/rm-test/restore-from-archive', {}, observerCookie)).status, 403, 'observer CANNOT restore-from-archive -> 403');
        eq((await request('POST', '/api/scenarios/rm-test/restore-from-archive', {}, authorCookie)).status, 200, 'author CAN restore-from-archive -> 200');

        console.log('\n=== Self-approval-denial re-confirmed across the full matrix (D2, exercised again here for completeness) ===\n');
        const draft3 = JSON.parse(JSON.stringify(sample));
        draft3.name = 'rm-test-self-approve';
        await request('POST', '/api/scenarios', { scenario: draft3 }, commanderCookie); // d9-commander authors AND holds commander role
        await request('POST', '/api/scenarios/rm-test-self-approve/submit-for-review', {}, commanderCookie);
        eq((await request('POST', '/api/scenarios/rm-test-self-approve/approve', {}, commanderCookie)).status, 403, 'author-who-is-also-commander cannot approve their OWN scenario -> 403');
        eq((await request('POST', '/api/scenarios/rm-test-self-approve/reject', {}, commanderCookie)).status, 403, 'same self-conflict blocks self-REJECT too (reject shares the commander capability gate)');
        eq((await request('POST', '/api/scenarios/rm-test-self-approve/approve', {}, commander2Cookie)).status, 200, 'a genuinely DIFFERENT commander (not the author) CAN approve the same scenario -> 200');

        console.log('\n=== No delete endpoint exists for any of these — re-confirmed at the HTTP level, not just static scan ===\n');
        for (const path_ of ['/api/scenarios/rm-test', '/api/scenarios/rm-test/revisions/1', '/api/scenarios/rm-test/archive']) {
            const del = await request('DELETE', path_, null, authorCookie);
            ok(del.status === 404 || del.status === 405, 'DELETE ' + path_ + ' -> ' + del.status + ' (no delete route registered, not silently accepted)');
        }

        console.log('\n' + (fail === 0 ? 'OK' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
        teardown();
        process.exit(fail === 0 ? 0 : 1);
    } catch (e) {
        console.error('[fatal]', e && e.stack || e);
        if (serverErr) console.error('server stderr:', serverErr.slice(0, 1000));
        teardown();
        process.exit(1);
    }
})();
