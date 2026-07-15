#!/usr/bin/env node
/**
 * test-scenario-stale-revision-guard-1.js — Batch B Slice 12
 *
 * Pure-logic + spawned-server verifier for a real defect caught while
 * designing Slice 12's E2E acceptance criteria: re-saving an
 * already-approved/activated scenario (POST /api/scenarios, overwrite)
 * used to silently KEEP its approval status — so an operator could edit
 * content after commander approval and still launch it under the old
 * approval, with no reviewer ever having seen the new content ("stale
 * revision"). scenario-approval-store.js::invalidateApprovalOnRevision()
 * closes this: a re-save now demotes approved/activated back to draft,
 * requiring a fresh submit+approve cycle.
 *
 *   node test-scenario-stale-revision-guard-1.js
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

console.log('\n=== Batch B Slice 12: stale-revision approval-invalidation guard ===\n');

// ── Part A: pure logic against a real (temp) DB ────────────────────────────
console.log('\n[A] invalidateApprovalOnRevision() — pure logic');
(function () {
    const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rmooz-stale-rev-'));
    process.env.RMOOZ_DATA_DIR = DATA_DIR;
    process.env.RMOOZ_APP_DB_FILE = path.join(DATA_DIR, 'app.db');
    process.env.RMOOZ_BOOTSTRAP_PASSWORD = 'test-bootstrap-pw';

    const Database = require(path.join(ROOT, 'UI_MOdified/node_modules/better-sqlite3'));
    const appData = require(path.join(ROOT, 'UI_MOdified/server/app-data.js'));
    const db = appData.initAppData({ Database, dataDir: DATA_DIR });
    const store = require(path.join(ROOT, 'UI_MOdified/server/scenario-approval-store.js'));
    const getDb = () => db;
    const user = { id: 'u1', username: 'planner1', role: 'planner', displayName: 'Planner One' };
    const commander = { id: 'u2', username: 'cmdr1', role: 'commander', displayName: 'Commander One' };

    const insUser = db.prepare(
        'INSERT INTO users (id, username, password_hash, display_name, role, created_at, updated_at) VALUES (?,?,?,?,?,?,?)'
    );
    const t0 = new Date().toISOString();
    insUser.run('u1', 'planner1', 'scrypt:test:test', 'Planner One', 'planner', t0, t0);
    insUser.run('u2', 'cmdr1', 'scrypt:test:test', 'Commander One', 'commander', t0, t0);

    // draft/in_review/rejected -> no-op
    store.ensureLifecycleRow('scn-a', user, getDb);
    eq(store.invalidateApprovalOnRevision('scn-a', user, getDb), null, 'no-op on a draft-status scenario');
    eq(store.getLifecycle('scn-a', getDb).status, 'draft', 'status remains draft');

    store.applyTransition({ user, scenario_name: 'scn-a', action: 'submit' }, getDb);
    eq(store.invalidateApprovalOnRevision('scn-a', user, getDb), null, 'no-op on an in_review-status scenario');
    eq(store.getLifecycle('scn-a', getDb).status, 'in_review', 'status remains in_review');

    store.applyTransition({ user: commander, scenario_name: 'scn-a', action: 'reject', reason: 'not ready' }, getDb);
    eq(store.invalidateApprovalOnRevision('scn-a', user, getDb), null, 'no-op on a rejected-status scenario');
    eq(store.getLifecycle('scn-a', getDb).status, 'rejected', 'status remains rejected');

    // approved -> demoted to draft, approval fields cleared, journaled
    store.ensureLifecycleRow('scn-b', user, getDb);
    store.applyTransition({ user, scenario_name: 'scn-b', action: 'submit' }, getDb);
    store.applyTransition({ user: commander, scenario_name: 'scn-b', action: 'approve' }, getDb);
    const beforeRow = store.getLifecycle('scn-b', getDb);
    eq(beforeRow.status, 'approved', 'scn-b really is approved before the revision');
    ok(!!beforeRow.approved_by, 'approved_by set before the revision');

    const result = store.invalidateApprovalOnRevision('scn-b', user, getDb);
    ok(!!result && result.status === 'draft', 'invalidateApprovalOnRevision returns the demotion result');
    const afterRow = store.getLifecycle('scn-b', getDb);
    eq(afterRow.status, 'draft', 'approved scenario demoted to draft after a revision');
    eq(afterRow.approved_by, null, 'approved_by cleared');
    eq(afterRow.approved_at, null, 'approved_at cleared');

    const history = store.readLifecycleEvents('scn-b');
    const lastEvent = history[history.length - 1];
    eq(lastEvent.event, 'revision_invalidated_approval', 'journal records the revision_invalidated_approval event');
    eq(lastEvent.from_status, 'approved', 'journal records from_status=approved');
    eq(lastEvent.to_status, 'draft', 'journal records to_status=draft');
    ok(!!lastEvent.event_hash && !!lastEvent.prev_event_hash, 'event is hash-chained like every other lifecycle event');

    // activated -> also demoted to draft, activation fields cleared
    store.ensureLifecycleRow('scn-c', user, getDb);
    store.applyTransition({ user, scenario_name: 'scn-c', action: 'submit' }, getDb);
    store.applyTransition({ user: commander, scenario_name: 'scn-c', action: 'approve' }, getDb);
    store.markActivated('scn-c', user, getDb);
    eq(store.getLifecycle('scn-c', getDb).status, 'activated', 'scn-c really is activated before the revision');
    store.invalidateApprovalOnRevision('scn-c', user, getDb);
    const afterActivated = store.getLifecycle('scn-c', getDb);
    eq(afterActivated.status, 'draft', 'activated scenario also demoted to draft after a revision');
    eq(afterActivated.activated_by, null, 'activated_by cleared');

    try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch (_) {}
    // Part A set these on process.env for its in-process initAppData() call;
    // they MUST be cleared before Part B spawns a server, or the child
    // process inherits them and opens Part A's (now-deleted) DB file
    // instead of its own DATA_DIR/app.db.
    delete process.env.RMOOZ_APP_DB_FILE;
    delete process.env.RMOOZ_DATA_DIR;
    delete process.env.RMOOZ_BOOTSTRAP_PASSWORD;
})();

// ── Part B: spawned server — the real re-save-after-approval HTTP flow ────
console.log('\n[B] Spawned server — POST /api/scenarios re-save invalidates a prior approval');
(function () {
    const SERVER_SCRIPT = path.join(ROOT, 'UI_MOdified/server/web-server.js');
    const PORT = 8620 + Math.floor(Math.random() * 300);
    const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rmooz-stale-rev-http-'));
    const BOOTSTRAP_PW = 'bootstrap-verify-pw-stalerev';
    fs.mkdirSync(path.join(DATA_DIR, 'scenarios'), { recursive: true });

    function request(method, urlPath, body, cookie) {
        return new Promise((resolve, reject) => {
            const data = body == null ? null : JSON.stringify(body);
            const headers = data == null ? {} : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) };
            if (cookie) headers['Cookie'] = cookie;
            const req = http.request({ method, host: '127.0.0.1', port: PORT, path: urlPath, headers }, (res) => {
                const chunks = [];
                res.on('data', c => chunks.push(c));
                res.on('end', () => {
                    const raw = Buffer.concat(chunks).toString('utf8');
                    let json = null; try { json = JSON.parse(raw); } catch (_) {}
                    const setCookieRaw = res.headers['set-cookie'] || [];
                    let sessionCookie = null;
                    for (const sc of setCookieRaw) { const m = /^(rmooz_session=[^;]+)/.exec(sc); if (m) { sessionCookie = m[1]; break; } }
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
                    .then(r => { if (r.status === 200) resolve(); else throw new Error('bad status ' + r.status); })
                    .catch(() => { if (Date.now() > deadline) reject(new Error('server did not come up')); else setTimeout(tick, 150); });
            })();
        });
    }

    const server = spawn(process.execPath, [SERVER_SCRIPT], {
        env: Object.assign({}, process.env, { PORT: String(PORT), RMOOZ_DATA_DIR: DATA_DIR, RMOOZ_BOOTSTRAP_PASSWORD: BOOTSTRAP_PW }),
        stdio: ['ignore', 'pipe', 'pipe']
    });
    let serverErr = '';
    server.stderr.on('data', b => { serverErr += b.toString(); });
    server.stdout.on('data', () => {});
    function teardown() {
        try { server.kill(); } catch (_) {}
        try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch (_) {}
    }

    const MINIMAL_SCENARIO = () => ({
        name: 'stale-rev-scn', scenario_label: 'Stale Revision Guard Test',
        sides: [{ id: 'BLUE', name_en: 'Blue' }, { id: 'RED', name_en: 'Red' }],
        map_bbox: [-1, -1, 1, 1],
        obj: { name: 'Objective', coord: [0, 0], target_depth_km: 0, carver: 0 },
        pipeline: [[-0.5, 0], [0.5, 0]],
        bls_template: [{ name: 'AO-CENTER', coord: [0, 0] }],
        red_units: [{ uid: 'RED-1', label: 'Red 1', bls: 'AO-CENTER', appear: 0, role: 'unknown', coord: [0, 0] }],
        blue_units_initial: [{ unit_uid: 'BLUE-1', base_id: 'AO-CENTER', coord: [0, 0] }],
        blue_units_base_ids: ['AO-CENTER'],
        phase_table: [
            { index: 0, time_label: 'H-3', elapsed_hours: -3, phase: 'PRE-H' },
            { index: 1, time_label: 'H+0', elapsed_hours: 0, phase: 'PHASE 1' },
            { index: 2, time_label: 'H+12', elapsed_hours: 12, phase: 'PHASE 2A' },
            { index: 3, time_label: 'H+36', elapsed_hours: 36, phase: 'PHASE 2B' }
        ],
        steps: [
            { index: 0, time_label: 'H-3', elapsed_hours: -3, phase: 'PRE-H' },
            { index: 1, time_label: 'H+0', elapsed_hours: 0, phase: 'PHASE 1' },
            { index: 2, time_label: 'H+12', elapsed_hours: 12, phase: 'PHASE 2A' },
            { index: 3, time_label: 'H+36', elapsed_hours: 36, phase: 'PHASE 2B' }
        ]
    });

    (async function runHttp() {
        try {
            await waitForServer(15000);
            console.log('  [setup] server up');

            const Database = require(path.join(ROOT, 'UI_MOdified/node_modules/better-sqlite3'));
            await request('POST', '/api/auth/register', { username: 'sr-planner', password: 'testpass1' });
            const plannerCookie = (await request('POST', '/api/auth/login', { username: 'sr-planner', password: 'testpass1' })).sessionCookie;
            await request('POST', '/api/auth/register', { username: 'sr-commander', password: 'testpass1' });
            const commanderCookie = (await request('POST', '/api/auth/login', { username: 'sr-commander', password: 'testpass1' })).sessionCookie;
            const db = new Database(path.join(DATA_DIR, 'app.db'));
            db.prepare("UPDATE users SET role='commander' WHERE username='sr-commander'").run();
            db.close();

            // First save (nothing to invalidate) -> submit -> approve.
            const save1 = await request('POST', '/api/scenarios', { scenario: MINIMAL_SCENARIO() }, plannerCookie);
            eq(save1.status, 200, 'first save -> 200');
            await request('POST', '/api/scenarios/stale-rev-scn/submit-for-review', {}, plannerCookie);
            const approve = await request('POST', '/api/scenarios/stale-rev-scn/approve', {}, commanderCookie);
            eq(approve.status, 200, 'commander approves -> 200');

            const approvalAfterApprove = await request('GET', '/api/scenarios/stale-rev-scn/approval', null, plannerCookie);
            eq(approvalAfterApprove.body.status, 'approved', 'lifecycle status is approved before the re-save');

            // The planner now edits the (already-approved) scenario further and
            // re-saves it — this is the exact stale-revision scenario.
            const editedScenario = MINIMAL_SCENARIO();
            editedScenario.red_units.push({ uid: 'RED-2', label: 'Red 2 (added after approval)', bls: 'AO-CENTER', appear: 0, role: 'unknown', coord: [0, 0] });
            const save2 = await request('POST', '/api/scenarios?overwrite=1', { scenario: editedScenario }, plannerCookie);
            eq(save2.status, 200, 're-save of an approved scenario -> 200 (the save itself is not blocked)');

            const approvalAfterResave = await request('GET', '/api/scenarios/stale-rev-scn/approval', null, plannerCookie);
            eq(approvalAfterResave.body.status, 'draft', 're-save after approval demotes the lifecycle status back to draft');

            // Activation must now be blocked again (the exact "cannot launch" proof).
            const activateAttempt = await request('POST', '/api/scenario/active', { name: 'stale-rev-scn' }, plannerCookie);
            eq(activateAttempt.status, 409, 'activation is blocked again after the stale revision (NOT_APPROVED)');
            eq(activateAttempt.body.code, 'NOT_APPROVED', 'activation error code confirms the re-invalidation');

            console.log('\n' + (fail === 0 ? 'OK' : 'FAIL') + ' — ' + pass + ' pass, ' + fail + ' fail');
            teardown();
            process.exit(fail === 0 ? 0 : 1);
        } catch (e) {
            console.log('FAIL — harness error: ' + (e && e.message));
            if (serverErr) console.log('  server stderr:', serverErr.slice(0, 1000));
            teardown();
            process.exit(1);
        }
    })();
})();
