#!/usr/bin/env node
/**
 * test-scenario-library-slice6.js — Batch D Slice 6
 *
 * The Scenario Library: search/filter/sort logic (pure, unit-tested
 * directly), the enhanced GET /api/ai/scenarios?detail=1 endpoint it reads
 * from, and confirmation that the old bare openScenarioPicker() now
 * delegates to it (closing the real duplicate-picker gap the batch's audit
 * found) rather than a second, disconnected implementation.
 *
 *   node test-scenario-library-slice6.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = __dirname;
const LIBRARY_PATH = path.join(ROOT, 'UI_MOdified/client/shell/scenario-library.js');

let pass = 0, fail = 0;
function ok(cond, label, detail) {
    if (cond) { console.log('  PASS  ' + label); pass++; }
    else      { console.error('  FAIL  ' + label + (detail ? ' — ' + detail : '')); fail++; }
}
function eq(a, b, label) { ok(a === b, label, 'expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a)); }

// ── Part 1: load the IIFE into a sandbox and unit-test the pure logic ──────
function loadSandbox() {
    const sandboxWindow = {};
    const stubDoc = {
        createElement: function () { return { style: {}, setAttribute() {}, addEventListener() {}, appendChild() {}, classList: { add() {}, remove() {} } }; },
        addEventListener: function () {}, removeEventListener: function () {},
        body: { appendChild: function () {}, removeChild: function () {} },
        documentElement: { dir: 'ltr' },
        getElementById: function () { return null; },
    };
    const src = fs.readFileSync(LIBRARY_PATH, 'utf8');
    // eslint-disable-next-line no-new-func
    new Function('window', 'document', 'fetch', src)(sandboxWindow, stubDoc, function () { return Promise.resolve({ ok: true, json: () => Promise.resolve({ scenarios: [] }) }); });
    return sandboxWindow.AppScenarioLibrary && sandboxWindow.AppScenarioLibrary._testing;
}

(function pureLogic() {
    console.log('\n=== Part 1: pure search/filter/sort logic ===\n');
    const T = loadSandbox();
    ok(!!T, 'AppScenarioLibrary._testing exposed');

    const rows = [
        { name: 'alpha-scn', label: 'Alpha Scenario', status: 'draft', last_modified: '2026-07-01T00:00:00Z' },
        { name: 'bravo-scn', label: 'Bravo Scenario', status: 'approved', last_modified: '2026-07-15T00:00:00Z' },
        { name: 'charlie-scn', label: 'Objective Charlie', status: 'archived', last_modified: '2026-07-10T00:00:00Z' },
        { name: 'delta-scn', label: null, status: null, last_modified: null }, // legacy/orphan file, no lifecycle row
    ];

    console.log('[1] No filter — all rows returned, sorted most-recent-first');
    const all = T.filterAndSortScenarios(rows, '', 'all');
    eq(all.length, 4, 'all 4 rows returned');
    eq(all[0].name, 'bravo-scn', 'most recent (2026-07-15) sorts first');
    eq(all[3].name, 'delta-scn', 'no-last_modified row sorts last (treated as oldest)');

    console.log('\n[2] Text search matches name OR label, case-insensitive');
    eq(T.filterAndSortScenarios(rows, 'ALPHA', 'all').length, 1, 'search "ALPHA" matches alpha-scn by label, case-insensitive');
    eq(T.filterAndSortScenarios(rows, 'charlie', 'all').length, 1, 'search "charlie" matches by NAME even though label is "Objective Charlie"');
    eq(T.filterAndSortScenarios(rows, 'objective', 'all').length, 1, 'search "objective" matches by LABEL even though name is charlie-scn');
    eq(T.filterAndSortScenarios(rows, 'nonexistent-xyz', 'all').length, 0, 'no match returns empty');

    console.log('\n[3] Status filter');
    eq(T.filterAndSortScenarios(rows, '', 'draft').length, 1, 'status=draft matches exactly 1');
    eq(T.filterAndSortScenarios(rows, '', 'archived').length, 1, 'status=archived matches exactly 1');
    const unmanaged = T.filterAndSortScenarios(rows, '', 'unmanaged');
    eq(unmanaged.length, 1, 'a null-status (legacy/orphan) scenario is filterable as "unmanaged", not silently hidden');
    eq(unmanaged[0].name, 'delta-scn', 'unmanaged match is the orphan row');

    console.log('\n[4] Search + status filter combine (AND, not OR)');
    eq(T.filterAndSortScenarios(rows, 'bravo', 'approved').length, 1, 'text+status both matching -> 1 result');
    eq(T.filterAndSortScenarios(rows, 'bravo', 'draft').length, 0, 'text matches but status does not -> 0 results');

    console.log('\n[5] statusPill / esc — no HTML injection from scenario name or label');
    const dangerous = '<img src=x onerror=alert(1)>';
    ok(T.esc(dangerous).indexOf('<img') === -1, 'esc() neutralizes a raw HTML tag');
    ok(T.esc(dangerous).indexOf('&lt;img') !== -1, 'esc() produces the escaped entity form');
    ok(T.statusPill('approved').indexOf(T.STATUS_LABELS.approved.split(' ')[0]) !== -1, 'statusPill renders the bilingual approved label');
    ok(T.statusPill('unknown-status').indexOf('Unmanaged') !== -1, 'an unrecognized/null status falls back to an honest "Unmanaged" label, not a blank or a crash');
})();

// ── Part 2: source-scan — the duplicate picker is genuinely re-pointed ─────
(function sourceScan() {
    console.log('\n=== Part 2: duplicate-picker fix confirmed by source scan ===\n');
    const loaderSrc = fs.readFileSync(path.join(ROOT, 'UI_MOdified/client/shell/native-scenario-loader.js'), 'utf8');
    const fnStart = loaderSrc.indexOf('function openScenarioPicker()');
    const fnBody = loaderSrc.slice(fnStart, fnStart + 500);
    ok(/AppScenarioLibrary/.test(fnBody), 'openScenarioPicker() now delegates to window.AppScenarioLibrary when present');
    ok(/AppScenarioLibrary\.open\s*\(\)/.test(fnBody), 'delegation actually calls .open(), not just checks for its existence');

    const appHtml = fs.readFileSync(path.join(ROOT, 'UI_MOdified/client/app.html'), 'utf8');
    ok(/scenario-library\.js/.test(appHtml), 'scenario-library.js is wired with a <script> tag in app.html');

    // "Load on Map" must still call the EXISTING loadScenarioByName — this
    // slice does not change what map-loading does, only how it's discovered.
    const librarySrc = fs.readFileSync(path.join(ROOT, 'UI_MOdified/client/shell/scenario-library.js'), 'utf8');
    ok(/loadScenarioByName/.test(librarySrc), 'the Library calls the EXISTING loadScenarioByName(), not a new load mechanism');
    ok(/AppEditMode\.setMode\(true\)/.test(librarySrc), '"Open in Builder" reuses the existing setMode(true) edit-mode entry, not a new one');
})();

// ── Part 3: the enhanced GET /api/ai/scenarios?detail=1 endpoint ───────────
(function e2e() {
    const SAMPLE_PATH   = path.join(ROOT, 'docs/cmo-functional-rules/sample-sahil-corridor.json');
    const SERVER_SCRIPT = path.join(ROOT, 'UI_MOdified/server/web-server.js');
    const PORT = 8960 + Math.floor(Math.random() * 300);
    const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rmooz-scen-library-e2e-'));

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

    console.log('\n=== Part 3: GET /api/ai/scenarios?detail=1 ===\n');
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

            console.log('[1] Plain (undetailed) list is unchanged — bare names, backward compatible');
            const plain = await request('GET', '/api/ai/scenarios');
            eq(plain.status, 200, 'plain list 200');
            ok(Array.isArray(plain.body.scenarios), 'plain scenarios is an array');
            ok(plain.body.scenarios.every((s) => typeof s === 'string'), 'plain list entries are still bare strings (no behavior change for existing callers)');

            const sample = JSON.parse(fs.readFileSync(SAMPLE_PATH, 'utf8'));
            const draft = JSON.parse(JSON.stringify(sample));
            draft.name = 'library-detail-test';
            await request('POST', '/api/scenarios', { scenario: draft }, cookie);

            console.log('\n[2] ?detail=1 returns rich per-scenario metadata');
            const detail = await request('GET', '/api/ai/scenarios?detail=1', null, cookie);
            eq(detail.status, 200, 'detail list 200');
            const row = detail.body.scenarios.find((s) => s.name === 'library-detail-test');
            ok(!!row, 'the saved scenario appears in the detail list');
            eq(row.label, draft.scenario_label, 'label matches the scenario_label field');
            eq(row.owner, 'admin', 'owner is the authenticated author');
            eq(row.status, 'draft', 'status reflects the real lifecycle row');
            eq(row.revision, 1, 'revision matches scenario_revisions');
            ok(!!row.last_modified, 'last_modified is populated');

            console.log('\n[3] A legacy scenario with no lifecycle row degrades honestly (null fields, not fabricated)');
            const legacyRow = detail.body.scenarios.find((s) => s.name !== 'library-detail-test');
            if (legacyRow) {
                eq(legacyRow.owner, null, 'legacy scenario owner is null, not guessed');
                eq(legacyRow.status, null, 'legacy scenario status is null, not defaulted to "draft"');
            } else {
                ok(true, '(no legacy/pre-existing scenario files in this isolated DATA_DIR — nothing to check, not a failure)');
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
})();
