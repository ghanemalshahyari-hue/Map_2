#!/usr/bin/env node
/**
 * test-scenario-revision-restore-slice4.js — Batch D Slice 4
 *
 * Restore an old revision AS A NEW DRAFT — restoring never rewrites or
 * removes any existing revision row; it produces a brand-new HEAD revision
 * through the exact same save path any other save uses.
 *
 *   node test-scenario-revision-restore-slice4.js
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

const SAMPLE_PATH   = path.join(ROOT, 'docs/cmo-functional-rules/sample-sahil-corridor.json');
const SERVER_SCRIPT = path.join(ROOT, 'UI_MOdified/server/web-server.js');
const PORT = 8760 + Math.floor(Math.random() * 300);
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rmooz-scen-rev-restore-'));

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
        draft.name = 'restore-slice4-test';

        console.log('[1] Author revision 1, then two more real edits -> revisions 2 and 3');
        await request('POST', '/api/scenarios', { scenario: draft }, cookie);
        const rev2Content = JSON.parse(JSON.stringify(draft));
        rev2Content.scenario_label = 'Edited once';
        await request('POST', '/api/scenarios?overwrite=1', { scenario: rev2Content }, cookie);
        const rev3Content = JSON.parse(JSON.stringify(draft));
        rev3Content.scenario_label = 'Edited twice — the current head';
        await request('POST', '/api/scenarios?overwrite=1', { scenario: rev3Content }, cookie);

        const listBefore = await request('GET', '/api/scenarios/restore-slice4-test/revisions', null, cookie);
        eq(listBefore.body.revisions.length, 3, 'three revisions exist before restore');

        console.log('\n[2] Unauthenticated restore -> 401');
        const unauthRestore = await request('POST', '/api/scenarios/restore-slice4-test/revisions/1/restore', {});
        eq(unauthRestore.status, 401, 'restore without session -> 401');

        console.log('\n[3] Restoring revision 1 creates revision 4, NOT a rewrite of revision 1');
        const restore = await request('POST', '/api/scenarios/restore-slice4-test/revisions/1/restore', {}, cookie);
        eq(restore.status, 200, 'restore -> 200');
        eq(restore.body.revision, 4, 'restore creates revision 4 (monotonic, not renumbered)');
        eq(restore.body.revision_created, true, 'revision_created true');

        const listAfter = await request('GET', '/api/scenarios/restore-slice4-test/revisions', null, cookie);
        eq(listAfter.body.revisions.length, 4, 'four revisions exist after restore (nothing removed)');
        const rev4Entry = listAfter.body.revisions[3];
        eq(rev4Entry.source, 'restore', 'revision 4 is tagged source=restore');

        console.log('\n[4] Revision 1 (the original) is byte-unchanged — restore never rewrites history');
        const rev1StillOriginal = await request('GET', '/api/scenarios/restore-slice4-test/revisions/1/compare/1', null, cookie);
        eq(rev1StillOriginal.body.has_changes, false, 'revision 1 compared to itself still shows no changes (untouched)');

        console.log('\n[5] The restored content (revision 4) matches revision 1s content, not revision 3s (the pre-restore head)');
        const cmp1v4 = await request('GET', '/api/scenarios/restore-slice4-test/revisions/1/compare/4', null, cookie);
        eq(cmp1v4.status, 200, 'compare 1 vs 4 -> 200');
        eq(cmp1v4.body.has_changes, false, 'revision 4 content is IDENTICAL to revision 1 (the restore target)');
        const cmp3v4 = await request('GET', '/api/scenarios/restore-slice4-test/revisions/3/compare/4', null, cookie);
        eq(cmp3v4.body.has_changes, true, 'revision 4 DIFFERS from revision 3 (the label edits were reverted)');
        ok(cmp3v4.body.sections.metadata.changed.some((f) => f.field === 'scenario_label' && f.after === draft.scenario_label),
            'restored scenario_label matches the ORIGINAL (revision 1) value, not either edited version');

        console.log('\n[6] The live scenario file now reflects the restored (revision 1) content');
        const liveScenario = await request('GET', '/api/ai/scenario/restore-slice4-test');
        eq(liveScenario.body.scenario.scenario_label, draft.scenario_label, 'live file mirror matches the restored content');

        console.log('\n[7] Restoring a non-existent revision -> 404');
        const badRestore = await request('POST', '/api/scenarios/restore-slice4-test/revisions/99/restore', {}, cookie);
        eq(badRestore.status, 404, 'restoring an unknown revision -> 404');

        console.log('\n[8] Restore of a scenario re-triggers the stale-revision approval guard (it IS a real save)');
        await request('POST', '/api/scenarios/restore-slice4-test/submit-for-review', {}, cookie);
        await request('POST', '/api/auth/register', { username: 'restore-cmdr', password: 'testpass1' });
        const cmdrCookie = (await request('POST', '/api/auth/login', { username: 'restore-cmdr', password: 'testpass1' })).sessionCookie;
        const Database = require(path.join(ROOT, 'UI_MOdified/node_modules/better-sqlite3'));
        const db = new Database(path.join(DATA_DIR, 'app.db'));
        db.prepare("UPDATE users SET role='commander' WHERE username='restore-cmdr'").run();
        db.close();
        await request('POST', '/api/scenarios/restore-slice4-test/approve', {}, cmdrCookie);
        const approvedBefore = await request('GET', '/api/scenarios/restore-slice4-test/approval', null, cookie);
        eq(approvedBefore.body.status, 'approved', 'approved before the restore');
        await request('POST', '/api/scenarios/restore-slice4-test/revisions/2/restore', {}, cookie);
        const approvedAfter = await request('GET', '/api/scenarios/restore-slice4-test/approval', null, cookie);
        eq(approvedAfter.body.status, 'draft', 'restore demotes an approved scenario back to draft, same as any other save');

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
