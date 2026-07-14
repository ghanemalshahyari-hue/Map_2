#!/usr/bin/env node
/**
 * test-batch-a-final-policy-matrix-1.js — RMOOZ-AUTH-BATCH-A-FINAL-1
 *
 * The final Batch A reconfirmation gate, per the owner's approved order
 * (items 3 and 5 of the "before Batch A closes" checklist):
 *
 *   3. Reconfirm all 12 audited mutation endpoints (+ legacy /api/ai/adjudicate)
 *      have the INTENDED 401/403 policy — fixed ones are actually guarded;
 *      deliberately-deferred ones are actually still open (so the inventory's
 *      "deferred" claim is machine-verified, not stale/self-reported).
 *   5. Confirm, in one pass:
 *        - no client identity can become authoritative
 *        - unauthenticated requests return 401
 *        - disallowed roles return 403
 *        - authenticated allowed requests preserve existing behavior
 *        - journal/lesson authors always come from the session
 *        - no new regressions
 *
 * This does NOT re-derive coverage already proven elsewhere — it composes
 * a single end-to-end pass across every endpoint named in APP_INVENTORY.md's
 * audit table, against ONE spawned server, so the whole policy surface is
 * checked together rather than trusted piecemeal across separate files.
 *
 *   node test-batch-a-final-policy-matrix-1.js
 */
'use strict';

const fs    = require('fs');
const path  = require('path');
const os    = require('os');
const http  = require('http');
const { spawn } = require('child_process');

const ROOT          = __dirname;
const SERVER_SCRIPT  = path.join(ROOT, 'UI_MOdified/server/web-server.js');
const PORT           = 8600 + Math.floor(Math.random() * 300);
const DATA_DIR       = fs.mkdtempSync(path.join(os.tmpdir(), 'rmooz-final-policy-'));
const BOOTSTRAP_PW   = 'bootstrap-verify-pw-final';

fs.mkdirSync(path.join(DATA_DIR, 'scenarios'), { recursive: true });
fs.copyFileSync(
    path.join(ROOT, 'UI_MOdified/data/scenarios/wargame3.json'),
    path.join(DATA_DIR, 'scenarios/wargame3.json')
);

let pass = 0, fail = 0;
function ok(cond, label, detail) {
    if (cond) { console.log('  PASS  ' + label); pass++; }
    else      { console.error('  FAIL  ' + label + (detail ? ' — ' + detail : '')); fail++; }
}
function eq(a, b, label) { ok(a === b, label, 'expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a)); }

function request(method, urlPath, body, cookie) {
    return new Promise((resolve, reject) => {
        const data = body == null ? null : JSON.stringify(body);
        const headers = data == null ? {} : {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data)
        };
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

console.log('[setup] booting web-server.js on port ' + PORT + ' with DATA_DIR=' + DATA_DIR);
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

// ── Group 1: FIXED — must be 401 unauthenticated, 403 for an out-of-list
//    role, and pass through (not 401/403) for an in-allow-list session.
const FIXED_CAPABILITY_GATED = [
    { path: '/api/sim/commit',            body: { proposal_id: 'x', accepted_action_ids: 'ALL' } },
    { path: '/api/sim/decide',            body: { scenarioName: 'wargame3', stepIndex: 0, decisions: [{ type: 'MOVE', actor: 'x', to: [1, 1] }] } },
    { path: '/api/ai/adjudicate',         body: { scenarioName: 'wargame3', stepIndex: 0, mockMode: true } },
    { path: '/api/wargame-sim/run',       body: {} },
    { path: '/api/wargame-sim/publish',   body: {} },
    { path: '/api/wargame-sim/import',    body: {} },
    { path: '/api/scenario/import',       body: { type: 'FeatureCollection', features: [] } },
    { path: '/api/scenarios',             body: { scenario: { not: 'real' } } },
    { path: '/api/scenario/active',       body: { name: 'wargame3' } },
];
// propose is auth-only (401), deliberately NOT capability-gated — it never mutates.
const FIXED_AUTH_ONLY = [
    { path: '/api/sim/propose', body: { scenarioName: 'wargame3', stepIndex: 0, mockMode: true } },
    { path: '/api/ai/lessons',  body: { scenarioName: 'wargame3', title: 'x' } },
];

// ── Group 2: DELIBERATELY DEFERRED — the inventory documents these as
//    still open. We assert they are CURRENTLY reachable without auth, i.e.
//    the "deferred" claim is still true and hasn't silently drifted (in
//    either direction — newly exposed further, or quietly already fixed
//    without updating the inventory).
const DEFERRED_STILL_OPEN = [
    { path: '/api/wargame-sim/regenerate',        body: {} },
    { path: '/api/wargame-sim/cancel',            body: {} },
    { path: '/api/wargame-sim/objective-override', body: {} },
    { path: '/api/wargame-sim/placement',         body: {} },
    { path: '/api/wargame-sim/generate',          body: {} },
    { path: '/api/wargame-sim/generate-preview',  body: {} },
    { path: '/api/wargame-local/import',          body: {} },
    { path: '/api/ai/model/select',               body: {} },
    { path: '/api/ai/model/reset',                body: {} },
    { path: '/api/ai/mc/start',                   body: {} },
    { path: '/api/ai/feedback',                   body: {} },
];

(async function run() {
    try {
        await waitForServer(15000);
        console.log('[setup] server up');

        // ── FIXED group: unauthenticated -> 401 ─────────────────────────
        console.log('\n[1] FIXED endpoints: unauthenticated -> 401');
        for (const r of [...FIXED_CAPABILITY_GATED, ...FIXED_AUTH_ONLY]) {
            const res = await request('POST', r.path, r.body);
            eq(res.status, 401, 'unauth POST ' + r.path + ' -> 401');
        }

        // ── set up planner (allowed) + observer (disallowed) sessions ────
        await request('POST', '/api/auth/register', { username: 'final-planner', password: 'testpass9' });
        const plannerLogin = await request('POST', '/api/auth/login', { username: 'final-planner', password: 'testpass9' });
        const plannerCookie = plannerLogin.sessionCookie;

        await request('POST', '/api/auth/register', { username: 'final-observer', password: 'testpass9' });
        const observerLogin = await request('POST', '/api/auth/login', { username: 'final-observer', password: 'testpass9' });
        const observerCookie = observerLogin.sessionCookie;
        const Database = require(path.join(ROOT, 'UI_MOdified/node_modules/better-sqlite3'));
        const db = new Database(path.join(DATA_DIR, 'app.db'));
        db.prepare("UPDATE users SET role='observer' WHERE username='final-observer'").run();
        db.close();

        // ── FIXED capability-gated group: observer -> 403 ───────────────
        console.log('\n[2] FIXED capability-gated endpoints: disallowed role -> 403');
        for (const r of FIXED_CAPABILITY_GATED) {
            const res = await request('POST', r.path, r.body, observerCookie);
            eq(res.status, 403, 'observer POST ' + r.path + ' -> 403');
        }

        // ── FIXED group: planner passes through (not 401/403) ───────────
        console.log('\n[3] FIXED endpoints: allowed authenticated role preserves existing behavior (not 401/403)');
        for (const r of [...FIXED_CAPABILITY_GATED, ...FIXED_AUTH_ONLY]) {
            const res = await request('POST', r.path, r.body, plannerCookie);
            ok(res.status !== 401 && res.status !== 403, 'planner POST ' + r.path + ' reaches business logic (status ' + res.status + ')');
        }

        // ── No client identity can become authoritative ─────────────────
        console.log('\n[4] No client identity can become authoritative');
        const runId = 'final-policy-decide-run';
        const decideRes = await request('POST', '/api/sim/decide', {
            scenarioName: 'wargame3', stepIndex: 0, runId,
            operator_id: 'FORGED-IDENTITY',
            decisions: [{ type: 'MOVE', actor: 'x', to: [1, 1] }]
        }, plannerCookie);
        eq(decideRes.status, 200, 'decide with forged operator_id still succeeds (200)');
        const journalRow = JSON.parse(
            fs.readFileSync(path.join(DATA_DIR, 'journal', runId + '.jsonl'), 'utf8').trim().split('\n').pop()
        );
        eq(journalRow.operator_id, 'op:final-planner', 'journal operator_id is the real session user, not the forgery');

        const lessonRes = await request('POST', '/api/ai/lessons',
            { scenarioName: 'wargame3', title: 'final-policy-lesson', author: 'FORGED-AUTHOR' }, plannerCookie);
        eq(lessonRes.status, 200, 'lesson POST with forged author still succeeds (200)');
        const lessonList = await request('GET', '/api/ai/lessons?scenario=wargame3', null, plannerCookie);
        const storedLesson = lessonList.body.lessons.find(l => l.title === 'final-policy-lesson');
        eq(storedLesson.author, 'final-planner', 'lesson author is the real session user, not the forgery');

        // ── DEFERRED group: still consciously open (inventory claim holds) ──
        console.log('\n[5] DEFERRED endpoints: still open (unauthenticated reachable) — inventory claim verified, not stale');
        for (const r of DEFERRED_STILL_OPEN) {
            const res = await request('POST', r.path, r.body);
            ok(res.status !== 401, 'unauth POST ' + r.path + ' is still reachable (status ' + res.status + ', not 401) — matches documented deferred status');
        }

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
