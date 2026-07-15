#!/usr/bin/env node
/**
 * test-command-authority-slice2.js — Batch B Slice 2
 *
 * Approval HTTP endpoints + activation gate, against a real spawned server:
 * full transition matrix (403 wrong role, 409 wrong state, 401 unauth),
 * proves POST /api/scenario/active now 409s pre-approval, proves
 * POST /api/scenarios no longer auto-activates, proves a client-sent actor
 * field is ignored end-to-end.
 *
 *   node test-command-authority-slice2.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const http = require('http');
const { spawn } = require('child_process');

const ROOT          = __dirname;
const SERVER_SCRIPT  = path.join(ROOT, 'UI_MOdified/server/web-server.js');
const PORT           = 8460 + Math.floor(Math.random() * 300);
const DATA_DIR       = fs.mkdtempSync(path.join(os.tmpdir(), 'rmooz-cmdauth-slice2-'));
const BOOTSTRAP_PW   = 'bootstrap-verify-pw-cmdauth2';

fs.mkdirSync(path.join(DATA_DIR, 'scenarios'), { recursive: true });

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
            res.on('data', c => chunks.push(c));
            res.on('end', () => {
                const raw = Buffer.concat(chunks).toString('utf8');
                let json = null; try { json = JSON.parse(raw); } catch (_) {}
                const setCookieRaw = res.headers['set-cookie'] || [];
                let sessionCookie = null;
                for (const sc of setCookieRaw) { const m = /^(rmooz_session=[^;]+)/.exec(sc); if (m) { sessionCookie = m[1]; break; } }
                resolve({ status: res.statusCode, body: json, raw, sessionCookie });
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
process.on('exit', teardown);

const SAMPLE_SCENARIO = () => JSON.parse(fs.readFileSync(
    path.join(ROOT, 'docs/cmo-functional-rules/sample-sahil-corridor.json'), 'utf8'));

async function registerAndLogin(username, password) {
    await request('POST', '/api/auth/register', { username, password });
    const login = await request('POST', '/api/auth/login', { username, password });
    return login.sessionCookie;
}

(async function run() {
    try {
        await waitForServer(15000);
        console.log('[setup] server up');

        const Database = require(path.join(ROOT, 'UI_MOdified/node_modules/better-sqlite3'));
        const plannerCookie = await registerAndLogin('slice2-planner', 'testpass1');
        const commanderCookie = await registerAndLogin('slice2-commander', 'testpass1');
        const db = new Database(path.join(DATA_DIR, 'app.db'));
        db.prepare("UPDATE users SET role='commander' WHERE username='slice2-commander'").run();
        db.close();

        // ── 1. Save creates a draft lifecycle row, does NOT auto-activate ──
        console.log('\n[1] Save creates a draft row; no auto-activation');
        const draft = SAMPLE_SCENARIO();
        draft.name = 'slice2-scenario';
        const saveRes = await request('POST', '/api/scenarios', { scenario: draft }, plannerCookie);
        eq(saveRes.status, 200, 'save 200');

        const approvalAfterSave = await request('GET', '/api/scenarios/slice2-scenario/approval', null, plannerCookie);
        eq(approvalAfterSave.status, 200, 'approval GET 200');
        eq(approvalAfterSave.body.status, 'draft', 'lifecycle status is draft after save');
        ok(approvalAfterSave.body.can_submit, 'planner (author) can_submit');
        ok(!approvalAfterSave.body.can_approve, 'planner cannot approve (not commander)');

        // ── 2. Activation is blocked pre-approval ──────────────────────────
        console.log('\n[2] POST /api/scenario/active is 409 before approval');
        const activateEarly = await request('POST', '/api/scenario/active', { name: 'slice2-scenario' }, plannerCookie);
        eq(activateEarly.status, 409, 'activate pre-approval -> 409');
        eq(activateEarly.body.code, 'NOT_APPROVED', 'error code is NOT_APPROVED');

        // ── 3. Full transition matrix over HTTP ─────────────────────────────
        console.log('\n[3] Transition matrix: submit -> approve, wrong-role/wrong-state rejected');
        const approveEarly = await request('POST', '/api/scenarios/slice2-scenario/approve', {}, commanderCookie);
        eq(approveEarly.status, 409, 'approve before submit -> 409 (still draft)');

        const submitByObserverAttempt = await request('POST', '/api/scenarios/slice2-scenario/submit-for-review', {}, null);
        eq(submitByObserverAttempt.status, 401, 'submit unauthenticated -> 401');

        const submit = await request('POST', '/api/scenarios/slice2-scenario/submit-for-review', {}, plannerCookie);
        eq(submit.status, 200, 'planner submits for review -> 200');
        eq(submit.body.status, 'in_review', 'status is now in_review');

        const approveByPlanner = await request('POST', '/api/scenarios/slice2-scenario/approve', {}, plannerCookie);
        eq(approveByPlanner.status, 403, 'planner cannot approve -> 403');

        const rejectNoReason = await request('POST', '/api/scenarios/slice2-scenario/reject', {}, commanderCookie);
        eq(rejectNoReason.status, 400, 'reject with no reason -> 400');

        const approve = await request('POST', '/api/scenarios/slice2-scenario/approve', {}, commanderCookie);
        eq(approve.status, 200, 'commander approves -> 200');
        eq(approve.body.status, 'approved', 'status is now approved');

        // ── 4. Activation succeeds once approved, and is journaled ─────────
        console.log('\n[4] Activation succeeds once approved');
        const activateNow = await request('POST', '/api/scenario/active', { name: 'slice2-scenario' }, plannerCookie);
        eq(activateNow.status, 200, 'activate post-approval -> 200');

        const approvalAfterActivate = await request('GET', '/api/scenarios/slice2-scenario/approval', null, plannerCookie);
        eq(approvalAfterActivate.body.status, 'activated', 'lifecycle status is now activated');
        const lastEvent = approvalAfterActivate.body.history.slice(-1)[0];
        eq(lastEvent.event, 'activated', 'last journal event is activated');
        eq(lastEvent.actor_id, 'slice2-planner', 'activation journal actor is the real session user');

        // ── 5. Client-sent actor field is ignored end-to-end ────────────────
        console.log('\n[5] A forged actor field in the request body has no effect');
        const draft2 = SAMPLE_SCENARIO();
        draft2.name = 'slice2-scenario-b';
        await request('POST', '/api/scenarios', { scenario: draft2 }, plannerCookie);
        const forgedSubmit = await request('POST', '/api/scenarios/slice2-scenario-b/submit-for-review',
            { actor_id: 'FORGED-COMMANDER', user: { role: 'commander' } }, plannerCookie);
        eq(forgedSubmit.status, 200, 'submit succeeds despite forged body fields');
        const historyB = await request('GET', '/api/scenarios/slice2-scenario-b/approval', null, plannerCookie);
        const submitEvent = historyB.body.history.find(e => e.event === 'submitted_for_review');
        eq(submitEvent.actor_id, 'slice2-planner', 'journal actor_id is the real session user, not the forged one');
        eq(historyB.body.submitted_by, 'slice2-planner', 'submitted_by is the real session user');

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
