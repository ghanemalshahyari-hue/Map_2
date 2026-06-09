/**
 * test-offline-health-probe-double-send-1.js — OFFLINE-HEALTH-PROBE-DOUBLE-SEND-1
 *
 * Regression test for the /api/ai/health (alias /api/ai/generation-health) probe
 * in server/web-server.js.
 *
 * The bug: when the upstream probe both TIMES OUT and then emits an 'error'
 * (probe.destroy() inside the timeout handler triggers a follow-up ECONNRESET /
 * "socket hang up"), sendJson() ran twice on the same response — the second call
 * threw ERR_HTTP_HEADERS_SENT ("Cannot set headers after they are sent"). The fix
 * latches the response through respondOnce() so exactly one reply is sent.
 *
 * Two layers:
 *   §1  Static structural guards — assert the respondOnce() latch is wired into
 *       every probe path and no bare sendJson(res survives in the probe block.
 *       These run everywhere and lock the regression at the source level.
 *   §2  Runtime repro — boots the REAL web-server.js and points
 *       RMOOZ_AI_BASE_URL at a local "black-hole" TCP server that accepts the
 *       connection but never responds, deterministically driving the
 *       socket-timeout → destroy → error sequence from the bug report (no
 *       external/unroutable host needed). Asserts exactly one response, NO
 *       headers-already-sent error in the logs, and that the server survives.
 *       (Pre-fix, the unguarded second sendJson throws an UNCAUGHT
 *       ERR_HTTP_HEADERS_SENT that both prints a stack trace AND crashes the
 *       process — web-server.js installs no uncaughtException handler. Validated:
 *       against an assembled bundle the broken code trips both detectors and the
 *       respondOnce() latch clears them.)
 *
 *       The checked-in offline_app is a PARTIAL bundle — the full client/ is
 *       copied in by the offline build/transfer step — so the server cannot
 *       boot from a bare dev checkout. When boot is not possible the runtime
 *       section SKIPS (not fails); it runs for real against an assembled bundle.
 *
 * No keys, no certs, no network egress. Run from Offline_Deployment/offline_app/:
 *   node test-offline-health-probe-double-send-1.js
 *
 * Note: the probe timeout is hard-coded at 8s in web-server.js, so a successful
 * runtime section takes ~9-11s by design.
 */
'use strict';

const assert = require('assert');
const fs     = require('fs');
const os     = require('os');
const net    = require('net');
const path   = require('path');
const http   = require('http');
const { spawn } = require('child_process');

const SERVER = path.join(__dirname, 'server', 'web-server.js');

let passed = 0, failed = 0, skipped = 0;
function test(name, fn) {
    try { fn(); console.log('  [PASS] ' + name); passed++; }
    catch (e) { console.log('  [FAIL] ' + name + ': ' + e.message); failed++; }
}
function skip(name, why) { console.log('  [SKIP] ' + name + ' — ' + why); skipped++; }

console.log('\n══════════════════════════════════════════════════════════════════');
console.log('  OFFLINE-HEALTH-PROBE-DOUBLE-SEND-1 — probe responds exactly once');
console.log('══════════════════════════════════════════════════════════════════\n');

// ── §1  Static structural guards (instant, always run) ──────────────────────
console.log('── §1  Source-level latch guards ─────────────────────────────────');

const src = fs.existsSync(SERVER) ? fs.readFileSync(SERVER, 'utf8') : '';

test('web-server.js exists', () => {
    assert.ok(fs.existsSync(SERVER), 'Missing: ' + SERVER);
});

test('T1: OFFLINE-HEALTH-PROBE-DOUBLE-SEND-1 marker present', () => {
    assert.ok(src.includes('OFFLINE-HEALTH-PROBE-DOUBLE-SEND-1'),
        'Fix marker OFFLINE-HEALTH-PROBE-DOUBLE-SEND-1 not found in web-server.js');
});

test('T2: respondOnce() latch helper defined with a settled flag', () => {
    assert.ok(/let\s+settled\s*=\s*false/.test(src), 'settled latch flag missing');
    assert.ok(/const\s+respondOnce\s*=/.test(src), 'respondOnce helper missing');
    const idx = src.indexOf('const respondOnce');
    const body = idx >= 0 ? src.slice(idx, idx + 200) : '';
    assert.ok(body.includes('if (settled) return'), 'respondOnce does not early-return when settled');
    assert.ok(body.includes('settled = true'), 'respondOnce does not set settled = true before responding');
});

test('T3: probe handlers route through respondOnce, never bare sendJson(res', () => {
    // The probe block runs from `const probe = httpMod.request(` up to the next
    // route handler. Inside it (success / error / timeout / catch) every reply
    // must go through respondOnce — a bare sendJson(res here is the regression.
    const start = src.indexOf('const probe = httpMod.request(');
    assert.ok(start >= 0, 'could not locate the probe request in web-server.js');
    const after = src.indexOf('appData.handlePlansApi', start);
    const region = src.slice(start, after > start ? after : start + 4000);
    assert.ok(!region.includes('sendJson(res'),
        'REGRESSION: a bare sendJson(res ...) survives inside the probe block — must use respondOnce()');
    assert.ok((region.match(/respondOnce\(/g) || []).length >= 4,
        'expected the success/error/timeout/catch paths to all call respondOnce()');
});

test('T4: timeout handler still destroys the probe (and then respondOnce)', () => {
    const tIdx = src.indexOf("probe.on('timeout'");
    assert.ok(tIdx >= 0, "probe 'timeout' handler missing");
    const block = src.slice(tIdx, tIdx + 400);
    assert.ok(block.includes('probe.destroy()'), 'timeout handler must still destroy the probe');
    assert.ok(block.includes('respondOnce('), 'timeout handler must respond via respondOnce');
});

// ── §2  Runtime: boot server, hit endpoint against a black-hole upstream ─────

function getFreePort() {
    return new Promise((resolve, reject) => {
        const srv = net.createServer();
        srv.once('error', reject);
        srv.listen(0, '127.0.0.1', () => {
            const p = srv.address().port;
            srv.close(() => resolve(p));
        });
    });
}

function mkBlackHole() {
    return new Promise((resolve, reject) => {
        // Accept the TCP connection but never write a response. The probe's
        // socket connects, sends GET /models, then sits idle → 8s socket
        // timeout fires → web-server destroys the probe → ECONNRESET 'error'.
        const srv = net.createServer((sock) => { sock.on('error', () => {}); });
        srv.on('error', reject);
        srv.listen(0, '127.0.0.1', () => resolve(srv));
    });
}

function getJson(port, urlPath, timeoutMs) {
    return new Promise((resolve, reject) => {
        const req = http.get({ host: '127.0.0.1', port, path: urlPath, timeout: timeoutMs }, (res) => {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', (c) => { body += c; });
            res.on('end', () => resolve({ status: res.statusCode, body }));
        });
        req.on('timeout', () => { req.destroy(new Error('client request timed out')); });
        req.on('error', reject);
    });
}

function waitForReady(child, stdoutRef, stderrRef, timeoutMs) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('server did not become ready in ' + timeoutMs + 'ms')), timeoutMs);
        const check = () => {
            if (stdoutRef.text.includes('Web server running')) { clearTimeout(timer); resolve(); return true; }
            return false;
        };
        child.stdout.on('data', check);
        child.once('exit', (code) => {
            clearTimeout(timer);
            const firstErr = (stderrRef.text.split('\n').find((l) => /Error|Cannot find module/.test(l)) || '').trim();
            reject(Object.assign(new Error('server exited early (code ' + code + '): ' + firstErr), { earlyExit: true, code }));
        });
        check();
    });
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function runtime() {
    console.log('\n── §2  Runtime double-send repro (boots the real server) ─────────');

    const RUNTIME_TESTS = ['T5: endpoint returns HTTP 200',
                           'T6: response is valid JSON (probe unreachable)',
                           'T7: timeout path wins the latch (errorCode=probe_timeout)',
                           'T8: NO ERR_HTTP_HEADERS_SENT in server stderr (the bug)',
                           'T9: server process survived the probe (no uncaught crash)'];

    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rmooz-probe-'));
    const dataDir = path.join(tmpRoot, 'data');
    fs.mkdirSync(path.join(dataDir, 'scenarios'), { recursive: true });
    fs.mkdirSync(path.join(tmpRoot, 'uploads'), { recursive: true });

    let child = null, blackHole = null;
    const stdoutRef = { text: '' };
    const stderrRef = { text: '' };

    const cleanup = () => {
        try { if (child && !child.killed) child.kill(); } catch (_) {}
        try { if (blackHole) blackHole.close(); } catch (_) {}
        try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (_) {}
    };

    try {
        blackHole = await mkBlackHole();
        const bhPort  = blackHole.address().port;
        const webPort = await getFreePort();

        child = spawn(process.execPath, ['server/web-server.js'], {
            cwd: __dirname,
            windowsHide: true,
            env: Object.assign({}, process.env, {
                PORT:               String(webPort),
                RMOOZ_AI_PROVIDER:  'litellm',
                RMOOZ_AI_BASE_URL:  'http://127.0.0.1:' + bhPort + '/v1',
                RMOOZ_AI_MODEL:     'test-model',
                RMOOZ_AI_API_KEY:   'test-key-not-real',
                RMOOZ_AI_TLS_VERIFY: '1',
                RMOOZ_ROOT_DIR:     tmpRoot,
                RMOOZ_DATA_DIR:     dataDir,
                RMOOZ_UPLOADS_DIR:  path.join(tmpRoot, 'uploads'),
                NODE_ENV:           'test',
            }),
        });
        child.stdout.setEncoding('utf8');
        child.stderr.setEncoding('utf8');
        child.stdout.on('data', (c) => { stdoutRef.text += c; });
        child.stderr.on('data', (c) => { stderrRef.text += c; });

        try {
            await waitForReady(child, stdoutRef, stderrRef, 20000);
        } catch (bootErr) {
            // A bare dev checkout of offline_app is a partial bundle (the full
            // client/ is added at build time), so the server cannot boot here.
            // That is an environment limitation, not the bug under test — SKIP.
            const why = bootErr.earlyExit
                ? 'offline bundle not bootable in this checkout (' + bootErr.message + ') — runs against an assembled bundle'
                : bootErr.message;
            for (const n of RUNTIME_TESTS) skip(n, why);
            return;
        }

        // Probe timeout is 8s; allow generous client headroom. The black-hole
        // never replies, so this resolves only when the server itself responds.
        const res = await getJson(webPort, '/api/ai/generation-health', 25000);

        // Give any late, post-response 'error' event a moment to fire and (in the
        // broken version) throw ERR_HTTP_HEADERS_SENT — which becomes an uncaught
        // exception that both prints to stderr AND exits the process (no global
        // handler in web-server.js). Both are reliable symptoms of the bug.
        await delay(1200);
        const exitedDuringProbe = (child.exitCode !== null || child.signalCode !== null);

        let json = null;
        try { json = JSON.parse(res.body); } catch (_) {}

        test(RUNTIME_TESTS[0], () => {
            assert.strictEqual(res.status, 200, 'expected 200, got ' + res.status + ' body=' + res.body.slice(0, 300));
        });

        test(RUNTIME_TESTS[1], () => {
            assert.ok(json, 'response body was not JSON: ' + res.body.slice(0, 300));
            assert.strictEqual(json.reachable, false, 'expected reachable=false');
        });

        test(RUNTIME_TESTS[2], () => {
            assert.ok(json, 'no JSON to inspect');
            assert.strictEqual(json.errorCode, 'probe_timeout',
                'expected errorCode=probe_timeout (the timeout fired first); got ' + (json && json.errorCode));
        });

        test(RUNTIME_TESTS[3], () => {
            const bad = /ERR_HTTP_HEADERS_SENT|Cannot set headers after they are sent/i;
            assert.ok(!bad.test(stderrRef.text),
                'double-send detected — server logged a headers-already-sent error:\n' +
                stderrRef.text.split('\n').filter((l) => /HEADERS|headers|sendJson|web-server/.test(l)).slice(0, 12).join('\n'));
        });

        test(RUNTIME_TESTS[4], () => {
            assert.ok(!exitedDuringProbe,
                'server process exited during the probe (code=' + child.exitCode + ', signal=' + child.signalCode +
                ') — the unguarded second sendJson threw an uncaught ERR_HTTP_HEADERS_SENT');
        });

    } finally {
        cleanup();
    }
}

(async () => {
    try {
        await runtime();
    } catch (e) {
        console.log('  [FAIL] runtime harness error: ' + (e && e.stack ? e.stack : e));
        failed++;
    }
    console.log('\n' + '═'.repeat(68));
    console.log('  Results: ' + passed + ' passed, ' + failed + ' failed, ' + skipped + ' skipped');
    console.log('═'.repeat(68) + '\n');
    process.exit(failed > 0 ? 1 : 0);
})();
