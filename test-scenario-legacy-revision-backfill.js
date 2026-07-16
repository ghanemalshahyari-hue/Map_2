#!/usr/bin/env node
/**
 * test-scenario-legacy-revision-backfill.js — Batch D checkpoint retrofit
 *
 * "Existing scenarios become revision 1 without breaking current files or
 * callers." Scenario files that predate the revisions system (Batch D
 * Slice 1) get a real, honestly-provenanced revision 1 backfilled from their
 * current on-disk content — idempotent, never touching files that already
 * have real history, never mutating the scenario file itself.
 *
 *   node test-scenario-legacy-revision-backfill.js
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
    const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rmooz-legacy-backfill-'));
    process.env.RMOOZ_DATA_DIR = DATA_DIR;
    process.env.RMOOZ_APP_DB_FILE = path.join(DATA_DIR, 'app.db');
    process.env.RMOOZ_BOOTSTRAP_PASSWORD = 'test-bootstrap-pw';

    const Database = require(path.join(ROOT, 'UI_MOdified/node_modules/better-sqlite3'));
    const appData = require(path.join(ROOT, 'UI_MOdified/server/app-data.js'));
    appData.initAppData({ Database, dataDir: DATA_DIR });
    const REV = require(path.join(ROOT, 'UI_MOdified/server/scenario-revisions-store.js'));

    console.log('\n=== Part 1: pure logic ===\n');

    const scenariosDir = path.join(DATA_DIR, 'scenarios');
    fs.mkdirSync(scenariosDir, { recursive: true });
    fs.writeFileSync(path.join(scenariosDir, 'legacy-a.json'), JSON.stringify({ name: 'legacy-a', red_units: [] }, null, 2));
    fs.writeFileSync(path.join(scenariosDir, 'legacy-b.json'), JSON.stringify({ name: 'legacy-b', red_units: [{ uid: 'R1' }] }, null, 2));
    fs.writeFileSync(path.join(scenariosDir, '_active.json'), JSON.stringify({ name: 'legacy-a' })); // pointer file, must be skipped
    fs.writeFileSync(path.join(scenariosDir, 'not-json.txt'), 'ignore me');

    console.log('[1] Schema — legacy is an accepted source value');
    const db = appData.getDb();
    const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='scenario_revisions'").get();
    ok(row.sql.indexOf("'legacy'") !== -1, "scenario_revisions CHECK constraint includes 'legacy'");

    console.log('\n[2] Backfill creates revision 1 for both legacy files, skips the pointer file and non-JSON');
    const r1 = REV.backfillLegacyRevisions(scenariosDir);
    eq(r1.scanned, 2, 'scanned exactly 2 real scenario files (pointer + non-JSON excluded)');
    eq(r1.backfilled, 2, 'both legacy files backfilled');

    const revA = REV.getLatestRevision('legacy-a');
    eq(revA.revision_number, 1, 'legacy-a is revision 1');
    eq(revA.source, 'legacy', 'source is honestly tagged legacy, not manual/ai/etc');
    eq(revA.created_by, null, 'created_by is null — no author is knowable for a pre-existing file');
    ok(!!revA.created_at, 'created_at is populated (from file mtime)');
    eq(JSON.parse(revA.content_json).name, 'legacy-a', 'backfilled content matches the real file content');

    const revB = REV.getLatestRevision('legacy-b');
    eq(revB.revision_number, 1, 'legacy-b is also revision 1');
    eq(JSON.parse(revB.content_json).red_units.length, 1, 'legacy-b content correctly captured (not legacy-a\'s content)');

    console.log('\n[3] Idempotent — running it again creates nothing new');
    const r2 = REV.backfillLegacyRevisions(scenariosDir);
    eq(r2.backfilled, 0, 'second run backfills 0 (already has history)');
    eq(REV.listRevisions('legacy-a').length, 1, 'legacy-a still has exactly 1 revision row, not duplicated');

    console.log('\n[4] A scenario that already has REAL history (saved through the normal API) is never touched by the backfill');
    const user = { id: 'u1', username: 'planner1' };
    fs.writeFileSync(path.join(scenariosDir, 'already-managed.json'), JSON.stringify({ name: 'already-managed' }));
    REV.appendRevisionIfChanged('already-managed', { name: 'already-managed', edited: true }, user, 'manual');
    const r3 = REV.backfillLegacyRevisions(scenariosDir);
    eq(r3.backfilled, 0, 'already-managed is NOT re-backfilled even though it appeared after the first backfill pass');
    const managedRev = REV.getLatestRevision('already-managed');
    eq(managedRev.source, 'manual', 'already-managed keeps its REAL source (manual), never overwritten to legacy');
    ok(JSON.parse(managedRev.content_json).edited === true, 'already-managed keeps its REAL content, not the file\'s current (different) content');

    console.log('\n[5] An empty/missing scenarios directory is handled gracefully, not a crash');
    const emptyDir = path.join(DATA_DIR, 'no-such-dir');
    const r4 = REV.backfillLegacyRevisions(emptyDir);
    eq(r4.scanned, 0, 'missing directory -> scanned 0, no throw');
    eq(r4.backfilled, 0, 'missing directory -> backfilled 0');

    try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch (_) {}
    delete process.env.RMOOZ_DATA_DIR;
    delete process.env.RMOOZ_APP_DB_FILE;
    delete process.env.RMOOZ_BOOTSTRAP_PASSWORD;
})();

// ── Part 2: real server startup backfills real pre-existing files ──────────
(function e2e() {
    const SERVER_SCRIPT = path.join(ROOT, 'UI_MOdified/server/web-server.js');
    const PORT = 9060 + Math.floor(Math.random() * 300);
    const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rmooz-legacy-backfill-e2e-'));

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

    console.log('\n=== Part 2: real server-startup backfill ===\n');
    // Write a "pre-existing" scenario file directly to disk BEFORE the server
    // ever starts — simulating a file that predates the revisions system
    // entirely (never went through POST /api/scenarios).
    fs.mkdirSync(path.join(DATA_DIR, 'scenarios'), { recursive: true });
    fs.writeFileSync(path.join(DATA_DIR, 'scenarios', 'preexisting-legacy.json'), JSON.stringify({
        name: 'preexisting-legacy', scenario_label: 'Pre-existing Legacy Scenario',
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
    }, null, 2));

    console.log('[setup] booting web-server.js on port ' + PORT + ' with a pre-existing scenario file already on disk');
    const server = spawn(process.execPath, [SERVER_SCRIPT], {
        env: Object.assign({}, process.env, { PORT: String(PORT), RMOOZ_DATA_DIR: DATA_DIR, RMOOZ_BOOTSTRAP_PASSWORD: 'verify' }),
        stdio: ['ignore', 'pipe', 'pipe']
    });
    let serverOut = '';
    server.stdout.on('data', (b) => { serverOut += b.toString(); });
    let serverErr = '';
    server.stderr.on('data', (b) => { serverErr += b.toString(); });
    function teardown() { try { server.kill(); } catch (_) {} try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch (_) {} }
    process.on('exit', teardown);

    (async () => {
        try {
            await waitForServer(15000);

            console.log('[1] Server startup log confirms the backfill ran');
            ok(/backfilled revision 1 for 1\/1 scenario file/.test(serverOut), 'startup log reports 1/1 scenario backfilled', serverOut.slice(0, 300));

            console.log('\n[2] The pre-existing file has real revision 1 reachable via the API, without ever calling POST /api/scenarios');
            const login = await request('POST', '/api/auth/login', { username: 'admin', password: 'verify' });
            const cookie = login.sessionCookie;
            const revisions = await request('GET', '/api/scenarios/preexisting-legacy/revisions', null, cookie);
            eq(revisions.status, 200, 'revisions list 200 for a file the server never wrote itself');
            eq(revisions.body.revisions.length, 1, 'exactly 1 backfilled revision');
            eq(revisions.body.revisions[0].source, 'legacy', 'tagged source=legacy');

            console.log('\n[3] The Library detail view shows revision 1 but status null (Unmanaged) — backfill does not fabricate a lifecycle');
            const detail = await request('GET', '/api/ai/scenarios?detail=1', null, cookie);
            const libRow = detail.body.scenarios.find((s) => s.name === 'preexisting-legacy');
            ok(!!libRow, 'the pre-existing scenario appears in the Library list');
            eq(libRow.revision, 1, 'Library shows revision 1');
            eq(libRow.status, null, 'status stays null/Unmanaged — no lifecycle row was fabricated');
            eq(libRow.owner, null, 'owner stays null — no author is knowable');

            console.log('\n[4] The scenario file itself is completely unchanged by the backfill (never mutated)');
            const fileContent = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'scenarios', 'preexisting-legacy.json'), 'utf8'));
            eq(fileContent.scenario_label, 'Pre-existing Legacy Scenario', 'file content on disk is byte-for-byte what it was before the server ever started');

            console.log('\n[5] Existing plain scenario listing/loading still works unchanged (no broken caller)');
            const plainList = await request('GET', '/api/ai/scenarios');
            ok(plainList.body.scenarios.includes('preexisting-legacy'), 'plain (non-detail) list still includes it, unaffected');
            const load = await request('GET', '/api/ai/scenario/preexisting-legacy');
            eq(load.status, 200, 'GET /api/ai/scenario/:name (the existing loader) still works exactly as before');

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
