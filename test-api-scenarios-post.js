#!/usr/bin/env node
/**
 * test-api-scenarios-post.js
 *
 * End-to-end verifier for the new Slice 2C server endpoint:
 *
 *   POST /api/scenarios            { scenario: {...} }
 *   POST /api/scenarios?overwrite=1
 *
 * Boots UI_MOdified/server/web-server.js as a child process on a unique
 * port + temp data dir, exercises the endpoint, asserts the file was
 * written, then tears down. Self-contained — no external dependencies
 * beyond Node + the project's own scenario sample.
 *
 *   node test-api-scenarios-post.js
 */
'use strict';

const fs    = require('fs');
const path  = require('path');
const os    = require('os');
const http  = require('http');
const { spawn } = require('child_process');

const ROOT          = __dirname;
const SAMPLE_PATH   = path.join(ROOT, 'docs/cmo-functional-rules/sample-sahil-corridor.json');
const SERVER_SCRIPT = path.join(ROOT, 'UI_MOdified/server/web-server.js');

// Random port to avoid colliding with a dev server.
const PORT = 8050 + Math.floor(Math.random() * 900);
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rmooz-2c-test-'));

let pass = 0, fail = 0;
function ok(cond, label, detail) {
    if (cond) { console.log('  ok   ' + label); pass++; }
    else      { console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); fail++; }
}
function eq(a, b, label) { ok(a === b, label, 'expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a)); }

function request(method, urlPath, body) {
    return new Promise(function (resolve, reject) {
        var data = body == null ? null : (typeof body === 'string' ? body : JSON.stringify(body));
        var req = http.request({
            method: method, host: '127.0.0.1', port: PORT, path: urlPath,
            headers: data == null ? {} : {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
            }
        }, function (res) {
            var chunks = [];
            res.on('data', function (c) { chunks.push(c); });
            res.on('end', function () {
                var raw = Buffer.concat(chunks).toString('utf8');
                var json = null; try { json = JSON.parse(raw); } catch (_) {}
                resolve({ status: res.statusCode, body: json, raw: raw });
            });
        });
        req.on('error', reject);
        if (data) req.write(data);
        req.end();
    });
}

function waitForServer(timeoutMs) {
    var deadline = Date.now() + (timeoutMs || 10000);
    return new Promise(function (resolve, reject) {
        (function tick() {
            request('GET', '/api/ai/scenarios')
                .then(function (r) { if (r.status === 200) resolve(); else throw new Error('bad status ' + r.status); })
                .catch(function () {
                    if (Date.now() > deadline) reject(new Error('server did not come up'));
                    else setTimeout(tick, 150);
                });
        })();
    });
}

// ── Spawn the server ────────────────────────────────────────────────────
console.log('[setup] booting web-server.js on port ' + PORT + ' with DATA_DIR=' + DATA_DIR);
var server = spawn(process.execPath, [SERVER_SCRIPT], {
    env: Object.assign({}, process.env, {
        PORT: String(PORT),
        RMOOZ_DATA_DIR: DATA_DIR,
        // Skip the bootstrap admin write — we don't need users for this test.
        RMOOZ_BOOTSTRAP_PASSWORD: 'verify'
    }),
    stdio: ['ignore', 'pipe', 'pipe']
});
var serverErr = '';
server.stderr.on('data', function (b) { serverErr += b.toString(); });
server.stdout.on('data', function (_b) { /* swallow stdout */ });
server.on('exit', function (code) {
    if (code !== 0 && code !== null) {
        console.log('[setup] server exited code=' + code);
        if (serverErr) console.log('  stderr:', serverErr.slice(0, 800));
    }
});

function teardown() {
    try { server.kill(); } catch (_) {}
    try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch (_) {}
}
process.on('exit', teardown);

(async function run() {
    try {
        await waitForServer(15000);
        console.log('[setup] server up');

        var sample = JSON.parse(fs.readFileSync(SAMPLE_PATH, 'utf8'));

        // ── 1. POST a new scenario ─────────────────────────────────────
        console.log('\n[1] POST /api/scenarios — create');
        var draft = JSON.parse(JSON.stringify(sample));
        draft.name = 'slice-2c-test';
        var r1 = await request('POST', '/api/scenarios', { scenario: draft });
        eq(r1.status, 200, 'first POST returns 200');
        eq(r1.body && r1.body.ok, true, 'body.ok = true');
        eq(r1.body && r1.body.name, 'slice-2c-test', 'name echoed');
        var expectedPath = path.join(DATA_DIR, 'scenarios', 'slice-2c-test.json');
        ok(fs.existsSync(expectedPath), 'file written at ' + expectedPath);

        // ── 2. GET via the existing scenario listing ───────────────────
        console.log('\n[2] GET /api/ai/scenarios — list includes new');
        var r2 = await request('GET', '/api/ai/scenarios');
        eq(r2.status, 200, 'list endpoint 200');
        var names = r2.body && r2.body.scenarios ? r2.body.scenarios.map(function (s) { return s.name || s; }) : [];
        ok(names.indexOf('slice-2c-test') !== -1, 'new scenario appears in list');
        eq(r2.body && r2.body.active, 'slice-2c-test', 'POST set it as active');

        // ── 3. Second POST without ?overwrite → 409 ────────────────────
        console.log('\n[3] POST again without overwrite — 409');
        var r3 = await request('POST', '/api/scenarios', { scenario: draft });
        eq(r3.status, 409, '409 when file exists');
        eq(r3.body && r3.body.ok, false, 'body.ok = false');

        // ── 4. POST with ?overwrite=1 → 200 ────────────────────────────
        console.log('\n[4] POST again with ?overwrite=1 — 200');
        var draft2 = JSON.parse(JSON.stringify(draft));
        draft2.scenario_label = 'edited via overwrite';
        var r4 = await request('POST', '/api/scenarios?overwrite=1', { scenario: draft2 });
        eq(r4.status, 200, '200 on overwrite');
        eq(r4.body && r4.body.overwritten, true, 'body.overwritten = true');
        var rewritten = JSON.parse(fs.readFileSync(expectedPath, 'utf8'));
        eq(rewritten.scenario_label, 'edited via overwrite', 'file content updated');

        // ── 5. Malformed body — 400 ────────────────────────────────────
        console.log('\n[5] POST malformed body — 400');
        var r5 = await request('POST', '/api/scenarios', { not_scenario: 1 });
        eq(r5.status, 400, '400 when body.scenario missing');

        // ── 6. Invalid scenario fails validator → 400 ──────────────────
        console.log('\n[6] POST scenario that fails validator — 400');
        var bad = JSON.parse(JSON.stringify(sample));
        delete bad.steps;             // required field
        bad.name = 'slice-2c-bad';
        var r6 = await request('POST', '/api/scenarios', { scenario: bad });
        eq(r6.status, 400, '400 on validator failure');
        ok(r6.body && Array.isArray(r6.body.errors) && r6.body.errors.length > 0,
            'errors array returned');

        // ── 7. Name sanitisation ───────────────────────────────────────
        console.log('\n[7] POST with messy name — gets sanitised');
        var messy = JSON.parse(JSON.stringify(sample));
        messy.name = '  Bad Name!! 2026/06/02  ';
        var r7 = await request('POST', '/api/scenarios', { scenario: messy });
        eq(r7.status, 200, 'sanitised + saved');
        // Expect lowercase + special chars to '_'
        ok(/^[a-z0-9._-]+$/.test(r7.body.name), 'name is safe: ' + r7.body.name);

        // ── Result ─────────────────────────────────────────────────────
        console.log('\n' + (fail === 0 ? 'OK' : 'FAIL') + ' — ' + pass + ' pass, ' + fail + ' fail');
        teardown();
        process.exit(fail === 0 ? 0 : 1);
    } catch (e) {
        console.log('FAIL — test harness error: ' + (e && e.message));
        if (serverErr) console.log('  server stderr:', serverErr.slice(0, 1000));
        teardown();
        process.exit(1);
    }
})();
