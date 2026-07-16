#!/usr/bin/env node
/**
 * test-scenario-revisions-slice1.js — Batch D Slice 1
 *
 * Immutable scenario revisions: schema, content-hash helper, and
 * append-on-real-change / no-op-on-identical-resave behavior, both as a pure
 * logic gate (no HTTP) and end-to-end through POST /api/scenarios.
 *
 *   node test-scenario-revisions-slice1.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = __dirname;

let pass = 0, fail = 0;
function ok(cond, label, detail) {
    if (cond) { console.log('  PASS  ' + label); pass++; }
    else      { console.error('  FAIL  ' + label + (detail ? ' — ' + detail : '')); fail++; }
}
function eq(a, b, label) { ok(a === b, label, 'expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a)); }

// ── Part 1: pure logic (no HTTP) — mirrors test-command-authority-slice1.js's
// isolated-DB pattern exactly ────────────────────────────────────────────────
(function pureLogic() {
    const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rmooz-scen-rev-slice1-'));
    process.env.RMOOZ_DATA_DIR = DATA_DIR;
    process.env.RMOOZ_APP_DB_FILE = path.join(DATA_DIR, 'app.db');
    process.env.RMOOZ_BOOTSTRAP_PASSWORD = 'test-bootstrap-pw';

    const Database = require(path.join(ROOT, 'UI_MOdified/node_modules/better-sqlite3'));
    const appData = require(path.join(ROOT, 'UI_MOdified/server/app-data.js'));
    appData.initAppData({ Database, dataDir: DATA_DIR });
    const REV = require(path.join(ROOT, 'UI_MOdified/server/scenario-revisions-store.js'));

    console.log('\n=== Part 1: pure logic ===\n');

    console.log('[1] Schema');
    const db = appData.getDb();
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get('scenario_revisions');
    ok(!!row, 'scenario_revisions table exists');

    console.log('\n[2] Content hash is deterministic regardless of key order');
    const a = { name: 'x', red_units: [{ uid: 'R1' }], meta: { z: 1, a: 2 } };
    const b = { meta: { a: 2, z: 1 }, red_units: [{ uid: 'R1' }], name: 'x' };
    eq(REV.contentHash(a), REV.contentHash(b), 'same content, different key order -> same hash');
    const c = { name: 'x', red_units: [{ uid: 'R2' }], meta: { z: 1, a: 2 } };
    ok(REV.contentHash(a) !== REV.contentHash(c), 'different content -> different hash');

    console.log('\n[3] appendRevisionIfChanged — first save creates revision 1');
    const user = { id: 'u1', username: 'planner1' };
    const scen1 = { name: 'rev-test', steps: [], red_units: [] };
    const r1 = REV.appendRevisionIfChanged('rev-test', scen1, user, 'manual');
    eq(r1.created, true, 'revision created on first save');
    eq(r1.revision_number, 1, 'first revision is number 1');
    eq(r1.revision.source, 'manual', 'source recorded');
    eq(r1.revision.created_by, 'planner1', 'created_by recorded');

    console.log('\n[4] Identical resave is a no-op');
    const r2 = REV.appendRevisionIfChanged('rev-test', JSON.parse(JSON.stringify(scen1)), user, 'manual');
    eq(r2.created, false, 'identical content resave does not create a new revision');
    eq(r2.revision_number, 1, 'revision number stays 1');
    eq(REV.listRevisions('rev-test').length, 1, 'still exactly 1 stored revision row');

    console.log('\n[5] Real content change creates revision 2');
    const scen2 = { name: 'rev-test', steps: [], red_units: [{ uid: 'R1' }] };
    const r3 = REV.appendRevisionIfChanged('rev-test', scen2, user, 'manual');
    eq(r3.created, true, 'revision created on real change');
    eq(r3.revision_number, 2, 'monotonic — revision 2');

    console.log('\n[6] Revision numbers are per-scenario, not global');
    const r4 = REV.appendRevisionIfChanged('another-scenario', { name: 'another-scenario' }, user, 'manual');
    eq(r4.revision_number, 1, 'a different scenario starts its own count at 1');
    eq(REV.listRevisions('rev-test').length, 2, 'rev-test unaffected by the other scenario');

    console.log('\n[7] getRevision / getLatestRevision / listRevisions');
    const latest = REV.getLatestRevision('rev-test');
    eq(latest.revision_number, 2, 'getLatestRevision returns the newest');
    const first = REV.getRevision('rev-test', 1);
    ok(!!first && JSON.parse(first.content_json).red_units.length === 0, 'getRevision(1) returns the ORIGINAL content, unmutated by revision 2');
    const list = REV.listRevisions('rev-test');
    eq(list.map((r) => r.revision_number).join(','), '1,2', 'listRevisions returns ascending revision order');

    console.log('\n[8] Invalid/unknown source falls back to "manual"');
    const r5 = REV.appendRevisionIfChanged('src-test', { name: 'src-test' }, user, 'not-a-real-source');
    eq(r5.revision.source, 'manual', 'unrecognized source string defaults to manual, not rejected/thrown');

    try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch (_) {}
    // Part 2 spawns a fresh child process with its own RMOOZ_DATA_DIR — don't
    // let this process's env mutations leak into that child's inherited env.
    delete process.env.RMOOZ_DATA_DIR;
    delete process.env.RMOOZ_APP_DB_FILE;
    delete process.env.RMOOZ_BOOTSTRAP_PASSWORD;
})();

// ── Part 2: end-to-end through the real HTTP endpoint ───────────────────────
(function e2e() {
    const SAMPLE_PATH   = path.join(ROOT, 'docs/cmo-functional-rules/sample-sahil-corridor.json');
    const SERVER_SCRIPT = path.join(ROOT, 'UI_MOdified/server/web-server.js');
    const PORT = 8460 + Math.floor(Math.random() * 400);
    const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rmooz-scen-rev-e2e-'));

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

    console.log('\n=== Part 2: end-to-end via POST /api/scenarios ===\n');
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
            const login = await request('POST', '/api/auth/login', { username: 'admin', password: 'verify' });
            eq(login.status, 200, 'bootstrap admin login 200');
            const cookie = login.sessionCookie;

            const sample = JSON.parse(fs.readFileSync(SAMPLE_PATH, 'utf8'));
            const draft = JSON.parse(JSON.stringify(sample));
            draft.name = 'rev-e2e-test';

            console.log('[1] First save creates revision 1');
            const r1 = await request('POST', '/api/scenarios', { scenario: draft }, cookie);
            eq(r1.status, 200, 'first POST 200');
            eq(r1.body && r1.body.revision, 1, 'response reports revision 1');
            eq(r1.body && r1.body.revision_created, true, 'response reports revision_created=true');

            console.log('\n[2] Overwrite with IDENTICAL content is a no-op revision');
            const r2 = await request('POST', '/api/scenarios?overwrite=1', { scenario: draft }, cookie);
            eq(r2.status, 200, 'identical overwrite 200');
            eq(r2.body && r2.body.revision, 1, 'revision stays 1 on identical resave');
            eq(r2.body && r2.body.revision_created, false, 'revision_created=false on identical resave');

            console.log('\n[3] Overwrite with REAL content change creates revision 2');
            const draft2 = JSON.parse(JSON.stringify(draft));
            draft2.scenario_label = 'edited for revision test';
            const r3 = await request('POST', '/api/scenarios?overwrite=1', { scenario: draft2 }, cookie);
            eq(r3.status, 200, 'changed overwrite 200');
            eq(r3.body && r3.body.revision, 2, 'revision becomes 2 on real content change');
            eq(r3.body && r3.body.revision_created, true, 'revision_created=true on real content change');

            console.log('\n[4] A brand-new scenario starts its own revision count at 1');
            const other = JSON.parse(JSON.stringify(sample));
            other.name = 'rev-e2e-other';
            const r4 = await request('POST', '/api/scenarios', { scenario: other }, cookie);
            eq(r4.status, 200, 'second scenario POST 200');
            eq(r4.body && r4.body.revision, 1, 'independent revision numbering per scenario');

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
})();
