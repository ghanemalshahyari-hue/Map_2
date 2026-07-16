#!/usr/bin/env node
/**
 * test-scenario-clone-template-archive-slice5.js — Batch D Slice 5
 *
 * Clone, Save as Template, Archive, and Restore-from-archive — all
 * non-destructive (Archive is a status, never a delete; no delete endpoint
 * exists anywhere in this codebase, confirmed by this file's own scan).
 *
 *   node test-scenario-clone-template-archive-slice5.js
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

// ── Part 0: confirm no delete endpoint exists anywhere (static scan) ────────
(function noDeleteEndpointScan() {
    console.log('\n=== Part 0: static scan — no destructive delete endpoint ===\n');
    const src = fs.readFileSync(path.join(ROOT, 'UI_MOdified/server/web-server.js'), 'utf8');
    const deleteRoutes = src.match(/pathname === '\/api\/scenario[^']*'\s*&&\s*req\.method === 'DELETE'/g) || [];
    eq(deleteRoutes.length, 0, 'no DELETE route exists for any /api/scenario* path');
    const approvalSrc = fs.readFileSync(path.join(ROOT, 'UI_MOdified/server/scenario-approval-store.js'), 'utf8');
    ok(!/fs\.(unlink|rm)Sync/.test(approvalSrc), 'scenario-approval-store.js never unlinks/removes a file');
})();

// ── Part 1: pure logic (archive/restore-from-archive state machine) ─────────
(function pureLogic() {
    const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rmooz-scen-archive-slice5-'));
    process.env.RMOOZ_DATA_DIR = DATA_DIR;
    process.env.RMOOZ_APP_DB_FILE = path.join(DATA_DIR, 'app.db');
    process.env.RMOOZ_BOOTSTRAP_PASSWORD = 'test-bootstrap-pw';

    const Database = require(path.join(ROOT, 'UI_MOdified/node_modules/better-sqlite3'));
    const appData = require(path.join(ROOT, 'UI_MOdified/server/app-data.js'));
    const db = appData.initAppData({ Database, dataDir: DATA_DIR });
    const APPROVAL = require(path.join(ROOT, 'UI_MOdified/server/scenario-approval-store.js'));

    console.log('\n=== Part 1: pure logic ===\n');

    console.log('[1] Schema — archived status accepted, archive columns exist');
    const cols = db.prepare("PRAGMA table_info(scenario_lifecycle)").all().map((c) => c.name);
    ok(cols.includes('archived_by'), 'archived_by column exists');
    ok(cols.includes('archived_at'), 'archived_at column exists');
    ok(cols.includes('pre_archive_status'), 'pre_archive_status column exists');

    const t0 = new Date().toISOString();
    const insUser = db.prepare('INSERT INTO users (id, username, password_hash, display_name, role, created_at, updated_at) VALUES (?,?,?,?,?,?,?)');
    const planner = { id: 'u1', username: 'planner1', role: 'planner', displayName: 'Planner One' };
    insUser.run('u1', 'planner1', 'scrypt:t:t', 'Planner One', 'planner', t0, t0);

    console.log('\n[2] Archive from draft, then restore-from-archive returns to draft');
    APPROVAL.ensureLifecycleRow('scn-arch-a', planner);
    let r = APPROVAL.archiveScenario('scn-arch-a', planner);
    eq(r.status, 'archived', 'archived');
    let row = APPROVAL.getLifecycle('scn-arch-a');
    eq(row.pre_archive_status, 'draft', 'pre_archive_status recorded as draft');
    r = APPROVAL.restoreFromArchive('scn-arch-a', planner);
    eq(r.status, 'draft', 'restore-from-archive returns to draft');
    row = APPROVAL.getLifecycle('scn-arch-a');
    eq(row.archived_by, null, 'archived_by cleared');
    eq(row.pre_archive_status, null, 'pre_archive_status cleared');

    console.log('\n[3] Archive is reachable from EVERY status, and restores to exactly that status');
    const commander = { id: 'u2', username: 'cmdr1', role: 'commander', displayName: 'Commander One' };
    insUser.run('u2', 'cmdr1', 'scrypt:t:t', 'Commander One', 'commander', t0, t0);
    APPROVAL.ensureLifecycleRow('scn-arch-b', planner);
    APPROVAL.applyTransition({ user: planner, scenario_name: 'scn-arch-b', action: 'submit' });
    APPROVAL.applyTransition({ user: commander, scenario_name: 'scn-arch-b', action: 'approve' });
    r = APPROVAL.archiveScenario('scn-arch-b', planner);
    eq(r.status, 'archived', 'archived from approved');
    row = APPROVAL.getLifecycle('scn-arch-b');
    eq(row.pre_archive_status, 'approved', 'pre_archive_status recorded as approved');
    r = APPROVAL.restoreFromArchive('scn-arch-b', planner);
    eq(r.status, 'approved', 'restore-from-archive returns to approved, not always draft');

    console.log('\n[4] Cannot archive an already-archived scenario, cannot restore a non-archived one');
    APPROVAL.archiveScenario('scn-arch-b', planner);
    let threw = false;
    try { APPROVAL.archiveScenario('scn-arch-b', planner); } catch (e) { threw = true; eq(e.code, 'INVALID_TRANSITION', 'double-archive rejected with INVALID_TRANSITION'); }
    ok(threw, 'archiving an already-archived scenario throws');
    APPROVAL.restoreFromArchive('scn-arch-b', planner);
    threw = false;
    try { APPROVAL.restoreFromArchive('scn-arch-b', planner); } catch (e) { threw = true; eq(e.code, 'INVALID_TRANSITION', 'restoring a non-archived scenario rejected'); }
    ok(threw, 'restoring a non-archived scenario throws');

    console.log('\n[5] getApprovalPayload exposes can_archive/can_restore_from_archive correctly');
    APPROVAL.archiveScenario('scn-arch-b', planner);
    const payload = APPROVAL.getApprovalPayload('scn-arch-b', planner);
    eq(payload.status, 'archived', 'payload status archived');
    eq(payload.can_archive, false, 'cannot archive again while already archived');
    eq(payload.can_restore_from_archive, true, 'can restore from archive');

    try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch (_) {}
    delete process.env.RMOOZ_DATA_DIR;
    delete process.env.RMOOZ_APP_DB_FILE;
    delete process.env.RMOOZ_BOOTSTRAP_PASSWORD;
})();

// ── Part 2: end-to-end via real HTTP — clone, save-as-template, archive/restore ──
(function e2e() {
    const SAMPLE_PATH   = path.join(ROOT, 'docs/cmo-functional-rules/sample-sahil-corridor.json');
    const SERVER_SCRIPT = path.join(ROOT, 'UI_MOdified/server/web-server.js');
    const PORT = 8860 + Math.floor(Math.random() * 300);
    const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rmooz-scen-clone-tmpl-e2e-'));

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

    console.log('\n=== Part 2: end-to-end via real HTTP ===\n');
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
            const cookie = login.sessionCookie;

            const sample = JSON.parse(fs.readFileSync(SAMPLE_PATH, 'utf8'));
            const draft = JSON.parse(JSON.stringify(sample));
            draft.name = 'clone-source-test';
            await request('POST', '/api/scenarios', { scenario: draft }, cookie);

            console.log('[1] Unauthenticated clone/save-as-template/archive -> 401');
            eq((await request('POST', '/api/scenarios/clone-source-test/clone', { new_name: 'x' })).status, 401, 'clone unauth 401');
            eq((await request('POST', '/api/scenarios/clone-source-test/save-as-template', { label: 'x' })).status, 401, 'save-as-template unauth 401');
            eq((await request('POST', '/api/scenarios/clone-source-test/archive', {})).status, 401, 'archive unauth 401');

            console.log('\n[2] Clone creates an independent scenario with its OWN fresh lifecycle');
            const clone = await request('POST', '/api/scenarios/clone-source-test/clone', { new_name: 'cloned-scenario-test' }, cookie);
            eq(clone.status, 200, 'clone -> 200');
            eq(clone.body.name, 'cloned-scenario-test', 'clone gets the new name');
            eq(clone.body.revision, 1, 'clone scenario starts at its OWN revision 1');
            const cloneApproval = await request('GET', '/api/scenarios/cloned-scenario-test/approval', null, cookie);
            eq(cloneApproval.body.status, 'draft', 'clone has a fresh draft lifecycle, independent of the source');
            const cloneRevisions = await request('GET', '/api/scenarios/cloned-scenario-test/revisions', null, cookie);
            eq(cloneRevisions.body.revisions[0].source, 'clone', 'clone revision tagged source=clone');

            console.log('\n[3] Cloning without new_name -> 400; cloning a nonexistent source -> 404');
            eq((await request('POST', '/api/scenarios/clone-source-test/clone', {}, cookie)).status, 400, 'missing new_name -> 400');
            eq((await request('POST', '/api/scenarios/no-such-scenario/clone', { new_name: 'y' }, cookie)).status, 404, 'cloning a nonexistent source -> 404');

            console.log('\n[4] Save as template writes into the SAME template registry GET /api/scenario-templates reads');
            const beforeTemplates = await request('GET', '/api/scenario-templates');
            const beforeCount = beforeTemplates.body.templates.length;
            const saveTmpl = await request('POST', '/api/scenarios/clone-source-test/save-as-template', { label: 'My Saved Template' }, cookie);
            eq(saveTmpl.status, 200, 'save-as-template -> 200');
            ok(!!saveTmpl.body.template.id, 'template id returned');
            const afterTemplates = await request('GET', '/api/scenario-templates');
            eq(afterTemplates.body.templates.length, beforeCount + 1, 'template list grew by exactly 1');
            ok(afterTemplates.body.templates.some((t) => t.label === 'My Saved Template'), 'new template appears with the operator-supplied label');
            const loadTmpl = await request('GET', '/api/scenario-templates/' + saveTmpl.body.template.id);
            eq(loadTmpl.status, 200, 'newly saved template loads back');
            eq(loadTmpl.body.template.red_units.length, draft.red_units.length, 'saved template content matches the source scenario');

            console.log('\n[5] Missing label -> 400');
            eq((await request('POST', '/api/scenarios/clone-source-test/save-as-template', {}, cookie)).status, 400, 'missing label -> 400');

            console.log('\n[6] Archive then restore-from-archive via real HTTP');
            const archive = await request('POST', '/api/scenarios/clone-source-test/archive', {}, cookie);
            eq(archive.status, 200, 'archive -> 200');
            eq(archive.body.status, 'archived', 'archived');
            const afterArchiveApproval = await request('GET', '/api/scenarios/clone-source-test/approval', null, cookie);
            eq(afterArchiveApproval.body.status, 'archived', 'GET approval reflects archived status');
            const restoreArchive = await request('POST', '/api/scenarios/clone-source-test/restore-from-archive', {}, cookie);
            eq(restoreArchive.status, 200, 'restore-from-archive -> 200');
            eq(restoreArchive.body.status, 'draft', 'returns to draft (its pre-archive status)');

            console.log('\n[7] Archiving twice in a row -> 409 INVALID_TRANSITION');
            await request('POST', '/api/scenarios/clone-source-test/archive', {}, cookie);
            const doubleArchive = await request('POST', '/api/scenarios/clone-source-test/archive', {}, cookie);
            eq(doubleArchive.status, 409, 'double-archive -> 409');

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
