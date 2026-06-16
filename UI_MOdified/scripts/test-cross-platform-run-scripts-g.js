'use strict';
/* ============================================================================
 * test-cross-platform-run-scripts-g.js — RMOOZ-CROSS-PLATFORM-RUN-SCRIPTS-G
 * ----------------------------------------------------------------------------
 * Proves the local run scripts are cross-platform and free of foreign paths:
 *
 *   1) the launcher sets RMOOZ_ALLOW_SIM_RUN=1 by default
 *   2) an explicit RMOOZ_ALLOW_SIM_RUN value is preserved (not clobbered)
 *   3) RMOOZ_TESTINGAI_DIR is repo-relative (no C:\Users\ADMIN); python is per-OS
 *   4) the launcher sets NO provider → local-only Ollama default is preserved
 *   5) no package.json script uses Windows-cmd `set RMOOZ_ALLOW_SIM_RUN=1&&`
 *   6) no package.json script contains the foreign C:\Users\ADMIN path
 *   7) serve/web/app route through the launcher (node scripts/run-rmooz-app.js)
 *   8) LIVE (best-effort): launched through the new script, the server health
 *      reports allow_sim_run=true + configured_provider=ollama
 *
 * Run: node scripts/test-cross-platform-run-scripts-g.js   (exit 0 = green)
 * ========================================================================== */
const assert = require('assert');
const fs     = require('fs');
const path   = require('path');
const http   = require('http');
const { spawn } = require('child_process');

const APP_DIR = path.join(__dirname, '..');
const LAUNCHER = require(path.join(APP_DIR, 'scripts', 'run-rmooz-app.js'));
const PKG = JSON.parse(fs.readFileSync(path.join(APP_DIR, 'package.json'), 'utf8'));
const SCRIPTS = PKG.scripts || {};

let pass = 0, fail = 0, skipped = 0;
function test(name, fn) { try { fn(); console.log('  ✓ ' + name); pass++; } catch (e) { console.log('  ✗ ' + name + ' — ' + (e && e.message)); fail++; } }

(async function () {
console.log('\n═══ RMOOZ-CROSS-PLATFORM-RUN-SCRIPTS-G ═══\n');

console.log('1-4) launcher defaults');
test('launcher sets RMOOZ_ALLOW_SIM_RUN=1 by default', function () {
    const e = LAUNCHER.applyRunDefaults({});
    assert.strictEqual(e.RMOOZ_ALLOW_SIM_RUN, '1');
});
test('explicit RMOOZ_ALLOW_SIM_RUN is preserved (locked-down deploy can pin 0)', function () {
    assert.strictEqual(LAUNCHER.applyRunDefaults({ RMOOZ_ALLOW_SIM_RUN: '0' }).RMOOZ_ALLOW_SIM_RUN, '0');
});
test('RMOOZ_TESTINGAI_DIR is repo-relative (no foreign C:\\Users\\ADMIN); python is per-OS', function () {
    const e = LAUNCHER.applyRunDefaults({});
    assert.ok(e.RMOOZ_TESTINGAI_DIR.indexOf('C:\\Users\\ADMIN') === -1, 'no foreign Windows path');
    assert.strictEqual(e.RMOOZ_TESTINGAI_DIR, path.join(APP_DIR, 'TestingAI'), 'resolved under the repo');
    assert.ok(e.RMOOZ_PYTHON === 'python3' || e.RMOOZ_PYTHON === 'python', 'python interpreter is a plain command');
    assert.ok(e.RMOOZ_PYTHON.indexOf('C:\\Users\\ADMIN') === -1, 'no foreign python path');
});
test('launcher sets NO provider → local-only Ollama default preserved', function () {
    const e = LAUNCHER.applyRunDefaults({});
    assert.ok(!e.RMOOZ_LLM_PROVIDER && !e.RMOOZ_AI_PROVIDER && !e.RMOOZ_FREE_FIGHT_PROVIDER, 'no provider forced by the launcher');
});

console.log('\n5-7) package.json scripts are cross-platform + foreign-path-free');
test('no script uses Windows-cmd `set RMOOZ_ALLOW_SIM_RUN=1&&`', function () {
    Object.keys(SCRIPTS).forEach(function (k) {
        assert.ok(!/set\s+RMOOZ_ALLOW_SIM_RUN\s*=\s*1\s*&&/.test(SCRIPTS[k]), 'script "' + k + '" still uses cmd `set ...&&`');
    });
});
test('no script contains the foreign C:\\Users\\ADMIN path', function () {
    Object.keys(SCRIPTS).forEach(function (k) {
        assert.ok(SCRIPTS[k].indexOf('C:\\Users\\ADMIN') === -1, 'script "' + k + '" still references C:\\Users\\ADMIN');
    });
});
test('serve + web route through the cross-platform launcher', function () {
    assert.strictEqual(SCRIPTS.serve, 'node scripts/run-rmooz-app.js');
    assert.strictEqual(SCRIPTS.web, 'node scripts/run-rmooz-app.js');
    assert.ok(/run scripts\/run-rmooz-app\.js|npm run serve/.test(SCRIPTS.app), 'app composes the launcher via serve');
});
test('the launcher script exists on disk', function () {
    assert.ok(fs.existsSync(path.join(APP_DIR, 'scripts', 'run-rmooz-app.js')), 'scripts/run-rmooz-app.js present');
});

console.log('\n8) LIVE — health reports allow_sim_run=true when launched via the new script (best-effort)');
await (async function liveHealth() {
    const PORT = 8137;
    // Launch with the gate UNSET in the parent env, so a true result proves the
    // LAUNCHER injected RMOOZ_ALLOW_SIM_RUN (not an inherited value).
    const childEnv = Object.assign({}, process.env, { PORT: String(PORT), RMOOZ_ALLOW_SIM_RUN: '' });
    let child;
    try {
        child = spawn(process.execPath, [path.join('scripts', 'run-rmooz-app.js')],
            { cwd: APP_DIR, env: childEnv, stdio: 'ignore' });
    } catch (e) {
        console.log('  ⚠ SKIP live health — could not spawn launcher: ' + (e && e.message)); skipped++; return;
    }
    function getHealth() {
        return new Promise(function (resolve) {
            const req = http.get({ host: '127.0.0.1', port: PORT, path: '/api/wargame-sim/free-fight/plan-coas/health', timeout: 2000 },
                function (res) { var b = ''; res.on('data', function (d) { b += d; }); res.on('end', function () { try { resolve(JSON.parse(b)); } catch (_) { resolve(null); } }); });
            req.on('error', function () { resolve(null); });
            req.on('timeout', function () { try { req.destroy(); } catch (_) {} resolve(null); });
        });
    }
    const sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    let health = null;
    for (let i = 0; i < 24 && !health; i++) { await sleep(500); health = await getHealth(); }
    try { child.kill('SIGTERM'); } catch (_) {}
    await sleep(300);
    try { child.kill('SIGKILL'); } catch (_) {}
    if (!health) {
        console.log('  ⚠ SKIP live health — server did not respond on :' + PORT + ' within timeout (env-dependent; static tests above are authoritative)');
        skipped++;
        return;
    }
    test('live health: allow_sim_run=true (gate injected by the launcher)', function () {
        assert.strictEqual(health.allow_sim_run, true, 'gate is ON via the launcher');
    });
    test('live health: configured_provider=ollama + provider_blocked=false (local-only)', function () {
        assert.strictEqual(health.configured_provider, 'ollama');
        assert.strictEqual(health.provider_blocked, false);
    });
    console.log('  ↳ live health: ' + JSON.stringify({ allow_sim_run: health.allow_sim_run, ai_execution_enabled: health.ai_execution_enabled,
        configured_provider: health.configured_provider, provider_blocked: health.provider_blocked, reason_if_blocked: health.reason_if_blocked }));
})();

console.log('\n' + (fail === 0 ? '✅ PASS' : '❌ FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed' + (skipped ? ', ' + skipped + ' skipped' : '') + '\n');
process.exit(fail === 0 ? 0 : 1);
})();
