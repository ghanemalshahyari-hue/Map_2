#!/usr/bin/env node
/**
 * test-scenario-revision-binding-slice2.js — Batch D Slice 2
 *
 * Binds scenario approval/activation to an EXACT revision number, and fixes
 * a real pre-existing gap the batch's audit found: no check ever prevented a
 * commander who also authored a scenario from approving their own
 * submission (isCommander only checked role/cell assignment, never compared
 * identity to scenario_lifecycle.author_id).
 *
 *   node test-scenario-revision-binding-slice2.js
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

// ── Part 1: pure logic (no HTTP) ─────────────────────────────────────────────
(function pureLogic() {
    const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rmooz-scen-rev-bind-slice2-'));
    process.env.RMOOZ_DATA_DIR = DATA_DIR;
    process.env.RMOOZ_APP_DB_FILE = path.join(DATA_DIR, 'app.db');
    process.env.RMOOZ_BOOTSTRAP_PASSWORD = 'test-bootstrap-pw';

    const Database = require(path.join(ROOT, 'UI_MOdified/node_modules/better-sqlite3'));
    const appData = require(path.join(ROOT, 'UI_MOdified/server/app-data.js'));
    const db = appData.initAppData({ Database, dataDir: DATA_DIR });
    const CA = require(path.join(ROOT, 'UI_MOdified/server/command-authority.js'));
    const APPROVAL = require(path.join(ROOT, 'UI_MOdified/server/scenario-approval-store.js'));
    const REV = require(path.join(ROOT, 'UI_MOdified/server/scenario-revisions-store.js'));

    console.log('\n=== Part 1: pure logic ===\n');

    console.log('[1] Schema — new columns exist');
    const cols = db.prepare("PRAGMA table_info(scenario_lifecycle)").all().map((c) => c.name);
    ok(cols.includes('approved_revision'), 'approved_revision column exists');
    ok(cols.includes('activated_revision'), 'activated_revision column exists');

    const t0 = new Date().toISOString();
    const insUser = db.prepare(
        'INSERT INTO users (id, username, password_hash, display_name, role, created_at, updated_at) VALUES (?,?,?,?,?,?,?)'
    );
    // authorCommander is BOTH the author of scn-x AND holds role=commander —
    // the exact scenario the self-approval-denial fix must block.
    const authorCommander = { id: 'u-ac', username: 'author-commander', role: 'commander', displayName: 'Author Commander' };
    const otherCommander  = { id: 'u-oc', username: 'other-commander',  role: 'commander', displayName: 'Other Commander' };
    const planner         = { id: 'u-pl', username: 'planner-x',        role: 'planner',   displayName: 'Planner X' };
    insUser.run('u-ac', 'author-commander', 'scrypt:t:t', 'Author Commander', 'commander', t0, t0);
    insUser.run('u-oc', 'other-commander',  'scrypt:t:t', 'Other Commander',  'commander', t0, t0);
    insUser.run('u-pl', 'planner-x',        'scrypt:t:t', 'Planner X',        'planner',   t0, t0);

    APPROVAL.ensureLifecycleRow('scn-x', authorCommander); // author_id = 'author-commander'
    REV.appendRevisionIfChanged('scn-x', { name: 'scn-x', v: 1 }, authorCommander, 'manual');

    console.log('\n[2] isSelfApproval — identifies the author-is-approver case correctly');
    ok(CA.isSelfApproval(authorCommander, 'scn-x'), 'author, applying as approver, IS a self-approval');
    ok(!CA.isSelfApproval(otherCommander, 'scn-x'), 'a different commander is NOT a self-approval');
    ok(!CA.isSelfApproval(null, 'scn-x'), 'no user -> false (not a crash)');
    ok(!CA.isSelfApproval(authorCommander, 'no-such-scenario'), 'unknown scenario -> false (nothing to compare)');

    console.log('\n[3] canApprove — denies the author-commander, allows a different commander, denies a non-commander');
    ok(!CA.canApprove(authorCommander, 'scn-x'), 'author who is ALSO commander CANNOT approve their own scenario');
    ok(CA.canApprove(otherCommander, 'scn-x'), 'a different commander CAN approve');
    ok(!CA.canApprove(planner, 'scn-x'), 'a non-commander still cannot approve (unaffected by this fix)');

    console.log('\n[4] applyTransition(approve) records approved_revision = the current latest revision');
    APPROVAL.applyTransition({ user: authorCommander, scenario_name: 'scn-x', action: 'submit' });
    APPROVAL.applyTransition({ user: otherCommander, scenario_name: 'scn-x', action: 'approve' });
    let row = APPROVAL.getLifecycle('scn-x');
    eq(row.status, 'approved', 'status is approved');
    eq(row.approved_revision, 1, 'approved_revision recorded as 1 (the only revision so far)');

    console.log('\n[5] A new revision, then reopen — approved_revision is cleared');
    REV.appendRevisionIfChanged('scn-x', { name: 'scn-x', v: 2 }, authorCommander, 'manual');
    APPROVAL.applyTransition({ user: authorCommander, scenario_name: 'scn-x', action: 'reopen' });
    row = APPROVAL.getLifecycle('scn-x');
    eq(row.status, 'draft', 'reopened to draft');
    eq(row.approved_revision, null, 'approved_revision cleared on reopen');

    console.log('\n[6] markActivated records activated_revision and returns it');
    APPROVAL.applyTransition({ user: authorCommander, scenario_name: 'scn-x', action: 'submit' });
    APPROVAL.applyTransition({ user: otherCommander, scenario_name: 'scn-x', action: 'approve' });
    row = APPROVAL.getLifecycle('scn-x');
    eq(row.approved_revision, 2, 'approved_revision now 2 (latest at re-approval time)');
    const activatedRev = APPROVAL.markActivated('scn-x', otherCommander);
    eq(activatedRev, 2, 'markActivated returns the activated revision number');
    row = APPROVAL.getLifecycle('scn-x');
    eq(row.activated_revision, 2, 'activated_revision persisted');

    console.log('\n[7] invalidateApprovalOnRevision clears BOTH approved_revision and activated_revision');
    APPROVAL.invalidateApprovalOnRevision('scn-x', authorCommander);
    row = APPROVAL.getLifecycle('scn-x');
    eq(row.status, 'draft', 'demoted to draft');
    eq(row.approved_revision, null, 'approved_revision cleared');
    eq(row.activated_revision, null, 'activated_revision cleared');

    console.log('\n[8] getApprovalPayload exposes approved_revision/activated_revision/latest_revision');
    REV.appendRevisionIfChanged('scn-x', { name: 'scn-x', v: 3 }, authorCommander, 'manual');
    APPROVAL.applyTransition({ user: authorCommander, scenario_name: 'scn-x', action: 'submit' });
    APPROVAL.applyTransition({ user: otherCommander, scenario_name: 'scn-x', action: 'approve' });
    const payload = APPROVAL.getApprovalPayload('scn-x', otherCommander);
    eq(payload.approved_revision, 3, 'payload.approved_revision = 3');
    eq(payload.latest_revision, 3, 'payload.latest_revision = 3 (matches, not stale)');
    eq(payload.can_approve, false, 'can_approve is false once already approved (status no longer in_review)');

    try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch (_) {}
    delete process.env.RMOOZ_DATA_DIR;
    delete process.env.RMOOZ_APP_DB_FILE;
    delete process.env.RMOOZ_BOOTSTRAP_PASSWORD;
})();

// ── Part 2: end-to-end via real HTTP, including the self-approval-denial
// role matrix and the activation-time stale-revision defense-in-depth ──────
(function e2e() {
    const SAMPLE_PATH   = path.join(ROOT, 'docs/cmo-functional-rules/sample-sahil-corridor.json');
    const SERVER_SCRIPT = path.join(ROOT, 'UI_MOdified/server/web-server.js');
    const PORT = 8560 + Math.floor(Math.random() * 300);
    const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rmooz-scen-rev-bind-e2e-'));

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

            const Database = require(path.join(ROOT, 'UI_MOdified/node_modules/better-sqlite3'));

            // "d2-authorcmd" will author the scenario AND be promoted to commander —
            // the exact identity self-approval-denial must block.
            await request('POST', '/api/auth/register', { username: 'd2-authorcmd', password: 'testpass1' });
            const authorCookie = (await request('POST', '/api/auth/login', { username: 'd2-authorcmd', password: 'testpass1' })).sessionCookie;
            await request('POST', '/api/auth/register', { username: 'd2-othercmd', password: 'testpass1' });
            const otherCookie = (await request('POST', '/api/auth/login', { username: 'd2-othercmd', password: 'testpass1' })).sessionCookie;
            const db = new Database(path.join(DATA_DIR, 'app.db'));
            db.prepare("UPDATE users SET role='commander' WHERE username IN ('d2-authorcmd','d2-othercmd')").run();
            db.close();

            const sample = JSON.parse(fs.readFileSync(SAMPLE_PATH, 'utf8'));
            const draft = JSON.parse(JSON.stringify(sample));
            draft.name = 'd2-self-approve-test';

            console.log('[1] Author (who is also a commander) authors + submits');
            const save1 = await request('POST', '/api/scenarios', { scenario: draft }, authorCookie);
            eq(save1.status, 200, 'author save -> 200');
            eq(save1.body && save1.body.revision, 1, 'revision 1 on first save');
            await request('POST', '/api/scenarios/d2-self-approve-test/submit-for-review', {}, authorCookie);

            console.log('\n[2] SELF-APPROVAL DENIED: the author, despite holding commander role, cannot approve their own scenario');
            const selfApprove = await request('POST', '/api/scenarios/d2-self-approve-test/approve', {}, authorCookie);
            eq(selfApprove.status, 403, 'author-as-commander self-approval -> 403 (the real fix)');

            console.log('\n[3] A DIFFERENT commander CAN approve the same scenario');
            const otherApprove = await request('POST', '/api/scenarios/d2-self-approve-test/approve', {}, otherCookie);
            eq(otherApprove.status, 200, 'different commander approves -> 200');

            console.log('\n[4] Unauthenticated approve attempt still 401 (unaffected by this fix)');
            const unauthApprove = await request('POST', '/api/scenarios/d2-self-approve-test/approve', {});
            eq(unauthApprove.status, 401, 'no session -> 401');

            console.log('\n[5] GET approval payload reports approved_revision/latest_revision');
            const approvalPayload = await request('GET', '/api/scenarios/d2-self-approve-test/approval', null, authorCookie);
            eq(approvalPayload.status, 200, 'approval GET 200');
            eq(approvalPayload.body.approved_revision, 1, 'approved_revision = 1');
            eq(approvalPayload.body.latest_revision, 1, 'latest_revision = 1 (not stale)');

            console.log('\n[6] Activation succeeds while approved_revision matches latest_revision');
            const activate1 = await request('POST', '/api/scenario/active', { name: 'd2-self-approve-test' }, authorCookie);
            eq(activate1.status, 200, 'activation succeeds -> 200');
            const approvalAfterActivate = await request('GET', '/api/scenarios/d2-self-approve-test/approval', null, authorCookie);
            eq(approvalAfterActivate.body.activated_revision, 1, 'activated_revision recorded as 1');

            console.log('\n[7] Defense-in-depth: activation refuses a stale revision even if invalidation somehow did not fire');
            // Simulate the edge case directly (bypassing invalidateApprovalOnRevision
            // entirely) by hand-restoring status=approved with a NEW revision present —
            // proving the activation route's own revision check, not just the demotion path.
            const db2 = new Database(path.join(DATA_DIR, 'app.db'));
            db2.prepare("INSERT INTO scenario_revisions (id, scenario_name, revision_number, content_hash, content_json, created_by, created_at, source) VALUES (?,?,?,?,?,?,?,?)")
                .run('rev-manual-2', 'd2-self-approve-test', 2, 'sha256:fake-for-test', '{}', 'd2-authorcmd', new Date().toISOString(), 'manual');
            db2.prepare("UPDATE scenario_lifecycle SET status='approved', activated_by=NULL, activated_at=NULL, activated_revision=NULL WHERE scenario_name=?")
                .run('d2-self-approve-test');
            db2.close();
            const staleActivate = await request('POST', '/api/scenario/active', { name: 'd2-self-approve-test' }, authorCookie);
            eq(staleActivate.status, 409, 'activation with a stale approved_revision -> 409');
            eq(staleActivate.body && staleActivate.body.code, 'NOT_APPROVED', 'error code NOT_APPROVED');
            eq(staleActivate.body && staleActivate.body.status, 'stale_revision', 'status detail stale_revision');

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
