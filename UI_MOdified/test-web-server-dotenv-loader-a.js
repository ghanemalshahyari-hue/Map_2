'use strict';
/* ============================================================================
 * test-web-server-dotenv-loader-a.js — RMOOZ-WEB-SERVER-DOTENV-LOADER-A
 * ----------------------------------------------------------------------------
 * Proves the web-server .env loader (server/load-dotenv.js, called by
 * web-server.js) behaves correctly. Uses TEMP .env files + a FAKE env object —
 * it never reads or prints the real UI_MOdified/.env and never touches
 * process.env.
 *
 *   - .env fills a missing variable
 *   - an explicit (already-set) env value WINS over .env
 *   - a missing .env file does not crash (silent no-op)
 *   - comments (#) and blank lines are ignored
 *   - surrounding single/double quotes are stripped from the value
 *
 * Run: node test-web-server-dotenv-loader-a.js   (exit 0 = green)
 * ========================================================================== */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadDotEnv } = require('./server/load-dotenv.js');

let pass = 0, fail = 0, seq = 0;
function test(name, fn) { try { fn(); console.log('  ✓ ' + name); pass++; } catch (e) { console.log('  ✗ ' + name + ' — ' + (e && e.message)); fail++; } }
const tmpFiles = [];
function writeTmpEnv(content) { const p = path.join(os.tmpdir(), 'rmooz-dotenv-' + process.pid + '-' + (++seq) + '.env'); fs.writeFileSync(p, content, 'utf8'); tmpFiles.push(p); return p; }

console.log('\n═══ RMOOZ-WEB-SERVER-DOTENV-LOADER-A ═══\n');

test('.env fills a MISSING variable (gap-fill)', function () {
    const env = {};
    const p = writeTmpEnv('RMOOZ_FOO=from_dotenv\n');
    loadDotEnv(p, env);
    assert.strictEqual(env.RMOOZ_FOO, 'from_dotenv');
});

test('explicit (already-set) env WINS over .env — never overridden', function () {
    const env = { RMOOZ_BAR: 'explicit_wins' };
    const p = writeTmpEnv('RMOOZ_BAR=from_dotenv\nRMOOZ_NEW=filled\n');
    loadDotEnv(p, env);
    assert.strictEqual(env.RMOOZ_BAR, 'explicit_wins', 'existing value must not be overridden');
    assert.strictEqual(env.RMOOZ_NEW, 'filled', 'a genuinely-missing var is still filled');
});

test("empty-string is 'set' and is NOT overridden (== null guard only catches undefined/null)", function () {
    const env = { RMOOZ_EMPTY: '' };
    const p = writeTmpEnv('RMOOZ_EMPTY=should_not_apply\n');
    loadDotEnv(p, env);
    assert.strictEqual(env.RMOOZ_EMPTY, '', 'an explicit empty string still wins');
});

test('a MISSING .env file does not crash (silent no-op)', function () {
    const env = { KEEP: 'me' };
    const missing = path.join(os.tmpdir(), 'rmooz-dotenv-does-not-exist-' + process.pid + '.env');
    let threw = false;
    try { loadDotEnv(missing, env); } catch (_) { threw = true; }
    assert.strictEqual(threw, false, 'must not throw on a missing file');
    assert.deepStrictEqual(env, { KEEP: 'me' }, 'env is unchanged');
});

test('comments (#) and blank lines are ignored', function () {
    const env = {};
    const p = writeTmpEnv('# a comment\n\n   \n#RMOOZ_SKIP=nope\nRMOOZ_OK=yes\n  # indented comment\n');
    loadDotEnv(p, env);
    assert.strictEqual(env.RMOOZ_OK, 'yes');
    assert.ok(!('RMOOZ_SKIP' in env), 'commented-out key must not be set');
});

test('surrounding single/double quotes are stripped; bare values kept', function () {
    const env = {};
    const p = writeTmpEnv('RMOOZ_DQ="double"\nRMOOZ_SQ=\'single\'\nRMOOZ_NQ=bare\n');
    loadDotEnv(p, env);
    assert.strictEqual(env.RMOOZ_DQ, 'double');
    assert.strictEqual(env.RMOOZ_SQ, 'single');
    assert.strictEqual(env.RMOOZ_NQ, 'bare');
});

test('does not mutate process.env when given an explicit env object', function () {
    const before = process.env.RMOOZ_LOADER_PROBE;
    const env = {};
    const p = writeTmpEnv('RMOOZ_LOADER_PROBE=in_fake_env_only\n');
    loadDotEnv(p, env);
    assert.strictEqual(env.RMOOZ_LOADER_PROBE, 'in_fake_env_only');
    assert.strictEqual(process.env.RMOOZ_LOADER_PROBE, before, 'process.env must be untouched');
});

test('web-server.js calls the extracted loader (no inline duplicate)', function () {
    const src = fs.readFileSync(path.join(__dirname, 'server', 'web-server.js'), 'utf8');
    assert.ok(/require\('\.\/load-dotenv'\)\.loadDotEnv\(/.test(src), 'web-server.js requires + calls loadDotEnv');
});

// cleanup
tmpFiles.forEach(function (p) { try { fs.unlinkSync(p); } catch (_) {} });

console.log('\n' + (fail === 0 ? '✅ PASS' : '❌ FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail === 0 ? 0 : 1);
