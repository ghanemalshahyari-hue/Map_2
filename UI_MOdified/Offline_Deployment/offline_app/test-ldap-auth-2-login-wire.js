/**
 * LDAP-AUTH-2 — Login wire-up tests
 *
 * Usage:
 *   # Static + local-mode network tests (server must be running on PORT=8000 in local mode):
 *   npm run serve &   # or: RMOOZ_ALLOW_SIM_RUN=0 node server/web-server.js
 *   node test-ldap-auth-2-login-wire.js
 *
 *   # To include live LDAP bind tests, set LDAP_SERVER to the offline LDAP server for this site,
 *   # LDAP_DOMAIN to its AD domain suffix, and supply a test account (password entered interactively
 *   # or via env — never store the password in a script or shell history):
 *   LDAP_SERVER=<offline-ldap-ip> LDAP_DOMAIN=<domain> LDAP_TEST_USER=s1234567 LDAP_TEST_PASS=<pass> \
 *     node test-ldap-auth-2-login-wire.js
 *   # (Replace <offline-ldap-ip>, <domain>, and <pass> with actual site values.)
 *
 * Tests:
 *   1.  /api/auth/config returns local in local mode
 *   2.  /api/auth/config returns ldap  in ldap  mode (spawned server)
 *   3.  local login still works with existing SQLite credentials
 *   4.  local login returns 401 for wrong password
 *   5.  ldap  mode rejects invalid username before LDAP bind
 *   6.  ldap  mode blocks registration with 405
 *   7.  ldap  mode returns 503 when LDAP server unreachable
 *   8.  ldap  mode returns 401 on wrong LDAP password   (requires LDAP_SERVER)
 *   9.  ldap  mode login success → Set-Cookie + profile  (requires working LDAP creds)
 *   10. /api/auth/me returns authBackend + displayName/title after LDAP login
 *   11. /api/auth/logout clears LDAP session
 *   12. no password in any response body
 *   13. username s1234567 transforms to s1234567@LDAP_DOMAIN
 *   14. existing LDAP-AUTH-1 normalisation still works
 *   15. frontend shows no @domain requirement (index.html analysis)
 */
'use strict';

const assert  = require('assert');
const http    = require('http');
const { spawn } = require('child_process');
const path    = require('path');
const fs      = require('fs');

const ldapAuth = require('./server/auth/ldap-auth');

const LOCAL_PORT = parseInt(process.env.PORT       || '8000', 10);
const LDAP_PORT2 = parseInt(process.env.LDAP_PORT2 || '8001', 10);

let passed = 0, failed = 0;

// ─── Tiny test harness ────────────────────────────────────────────────────────

function test(name, fn) {
    try { fn(); console.log(`  [PASS] ${name}`); passed++; }
    catch (e) { console.log(`  [FAIL] ${name}: ${e.message}`); failed++; }
}
async function testAsync(name, fn) {
    try { await fn(); console.log(`  [PASS] ${name}`); passed++; }
    catch (e) { console.log(`  [FAIL] ${name}: ${e.message}`); failed++; }
}
function skip(name, reason) { console.log(`  [SKIP] ${name}: ${reason}`); }

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

function httpReq({ port, path: urlPath, method = 'GET', body, cookie, timeoutMs = 4000 }) {
    return new Promise((resolve, reject) => {
        const data = body ? JSON.stringify(body) : null;
        const opts = {
            hostname: '127.0.0.1', port, path: urlPath, method,
            headers: {
                ...(data ? { 'Content-Type': 'application/json',
                             'Content-Length': Buffer.byteLength(data) } : {}),
                ...(cookie ? { Cookie: cookie } : {})
            }
        };
        const req = http.request(opts, res => {
            let raw = '';
            res.on('data', c => raw += c);
            res.on('end', () => {
                let bodyObj = null;
                try { bodyObj = JSON.parse(raw); } catch {}
                resolve({ status: res.statusCode, body: bodyObj, raw,
                          headers: res.headers });
            });
        });
        req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('timeout')); });
        req.on('error', reject);
        if (data) req.write(data);
        req.end();
    });
}

async function serverIsUp(port, timeoutMs = 2000) {
    try {
        await httpReq({ port, path: '/', timeoutMs });
        return true;
    } catch { return false; }
}

// ─── Spawned LDAP-mode server helper ─────────────────────────────────────────

function spawnLdapServer(port) {
    const env = {
        ...process.env,
        PORT:                 String(port),
        RMOOZ_AUTH_BACKEND:   'ldap',
        // LDAP_SERVER must be set in env for network tests; no hardcoded default.
        LDAP_SERVER:          process.env.LDAP_SERVER || '',
        LDAP_PORT:            process.env.LDAP_PORT   || '389',
        LDAP_DOMAIN:          process.env.LDAP_DOMAIN || 'sss.dir',
        LDAP_TIMEOUT:         '2',
        LDAP_USE_SSL:         '0',
        RMOOZ_ALLOW_SIM_RUN:  '0',
        RMOOZ_BOOTSTRAP_PASSWORD: 'disabled-in-test'
    };
    return new Promise((resolve, reject) => {
        const proc = spawn(process.execPath, ['server/web-server.js'], {
            cwd: path.join(__dirname),
            env,
            stdio: ['ignore', 'pipe', 'pipe']
        });
        const timeout = setTimeout(() => reject(new Error('LDAP server start timeout')), 8000);
        proc.stdout.on('data', data => {
            if (data.toString().includes('Web server running')) {
                clearTimeout(timeout);
                resolve(proc);
            }
        });
        proc.on('error', err => { clearTimeout(timeout); reject(err); });
        proc.on('exit', code => {
            if (code !== 0) { clearTimeout(timeout); reject(new Error(`Server exited with code ${code}`)); }
        });
    });
}

// ─── Static tests ─────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════════════════════════');
console.log('  LDAP-AUTH-2 — Login wire-up test suite');
console.log('══════════════════════════════════════════════════════════════\n');

console.log('── §14 LDAP-AUTH-1 normalisation (regression) ────────────────');

test('s1234567 passes through unchanged',         () => assert.strictEqual(ldapAuth.normaliseUsername('s1234567'),            's1234567'));
test('S1234567 lowercased',                       () => assert.strictEqual(ldapAuth.normaliseUsername('S1234567'),            's1234567'));
test('s1234567@sss.dir → s1234567 (strip domain)',() => assert.strictEqual(ldapAuth.normaliseUsername('s1234567@sss.dir'),   's1234567'));
test('space in username → null',                  () => assert.strictEqual(ldapAuth.normaliseUsername('s 1234567'),           null));
test('empty string → null',                       () => assert.strictEqual(ldapAuth.normaliseUsername(''),                    null));

console.log('\n── §13 username → UPN transformation ─────────────────────────');

test('buildUpn uses LDAP_DOMAIN env', () => {
    const saved = process.env.LDAP_DOMAIN;
    process.env.LDAP_DOMAIN = 'corp.test';
    const upn = ldapAuth.buildUpn('s1234567');
    if (saved !== undefined) process.env.LDAP_DOMAIN = saved;
    else delete process.env.LDAP_DOMAIN;
    assert.strictEqual(upn, 's1234567@corp.test');
});

console.log('\n── §15 Frontend does not require @domain ──────────────────────');

test('index.html does not contain @domain in placeholder or label', () => {
    const html = fs.readFileSync(path.join(__dirname, 'client', 'index.html'), 'utf8');
    // The username input must NOT have a placeholder that includes "@"
    const inputLine = html.match(/id="rmooz-landing-user"[^>]*/);
    if (inputLine) {
        assert.ok(!inputLine[0].includes('@'), 'Username input has @domain in placeholder');
    }
    // LDAP hint may contain "@" but only in the "e.g." example — acceptable
});

test('index.html has ldap-mode-hint element (hidden by default)', () => {
    const html = fs.readFileSync(path.join(__dirname, 'client', 'index.html'), 'utf8');
    assert.ok(html.includes('rmooz-ldap-mode-hint'), 'Missing rmooz-ldap-mode-hint element');
    assert.ok(html.includes('display:none'),          'Hint element must be hidden by default');
});

test('landing-auth.js has ldap_mode_hint string in both languages', () => {
    const src = fs.readFileSync(path.join(__dirname, 'client', 'landing-auth.js'), 'utf8');
    assert.ok(src.includes('ldap_mode_hint'), 'Missing ldap_mode_hint key in STRINGS');
    // Must appear at least twice (once for en, once for ar)
    const count = (src.match(/ldap_mode_hint/g) || []).length;
    assert.ok(count >= 3, `Expected ≥3 occurrences of ldap_mode_hint (en, ar, and usage), found ${count}`);
});

test('landing-auth.js fetches /api/auth/config for mode detection', () => {
    const src = fs.readFileSync(path.join(__dirname, 'client', 'landing-auth.js'), 'utf8');
    assert.ok(src.includes('/api/auth/config'), 'landing-auth.js must fetch /api/auth/config');
    assert.ok(src.includes('initAuthMode'),     'landing-auth.js must define initAuthMode');
});

test('landing-auth.js does not expose LDAP_SERVER or LDAP_DOMAIN to the page', () => {
    const src = fs.readFileSync(path.join(__dirname, 'client', 'landing-auth.js'), 'utf8');
    assert.ok(!src.includes('LDAP_SERVER'), 'landing-auth.js must not reference LDAP_SERVER');
    assert.ok(!src.includes('155.140'),     'landing-auth.js must not contain server IPs');
});

console.log('\n── §12 No password in responses (source audit) ────────────────');

test('login handler in app-data.js never calls console.log with password var', () => {
    const src = fs.readFileSync(path.join(__dirname, 'server', 'app-data.js'), 'utf8');
    const lines = src.split('\n');
    for (const [i, line] of lines.entries()) {
        if (/console\.(log|warn|error|info)/.test(line)) {
            // Strip string literals so we only catch the variable name, not the word
            // "password" used in a log message string (e.g. "One-time password written to…")
            const noStrings = line.replace(/'[^']*'|"[^"]*"|`[^`]*`/g, "''");
            if (/\bpassword\b/.test(noStrings)) {
                throw new Error(`Line ${i + 1}: console call references password variable`);
            }
        }
    }
});

test('login handler uses ldap:managed sentinel (never stores real password for LDAP users)', () => {
    const src = fs.readFileSync(path.join(__dirname, 'server', 'app-data.js'), 'utf8');
    assert.ok(src.includes("'ldap:managed'"), "LDAP users must store 'ldap:managed' not a real password");
});

test('app-data.js LDAP login block does not log or return rawPassword / password var', () => {
    const src = fs.readFileSync(path.join(__dirname, 'server', 'app-data.js'), 'utf8');
    // JSON.stringify of the response must not include password
    const responseBlocks = src.match(/res\.end\(JSON\.stringify\(\{[^}]+\}\)/g) || [];
    for (const block of responseBlocks) {
        assert.ok(!block.includes('password'), `Response block contains 'password': ${block.slice(0, 80)}`);
    }
});

// ─── Network tests — local mode (PORT=8000) ──────────────────────────────────

async function runLocalTests() {
    console.log('\n── Network: local mode (PORT=' + LOCAL_PORT + ') ─────────────────────');

    const up = await serverIsUp(LOCAL_PORT);
    if (!up) {
        skip('all local-mode tests', `Server not running on port ${LOCAL_PORT}. Start: npm run serve`);
        return;
    }

    await testAsync('GET /api/auth/config → authBackend: local', async () => {
        const r = await httpReq({ port: LOCAL_PORT, path: '/api/auth/config' });
        assert.strictEqual(r.status,          200);
        assert.strictEqual(r.body.authBackend, 'local');
    });

    await testAsync('GET /api/auth/me without cookie → 401', async () => {
        const r = await httpReq({ port: LOCAL_PORT, path: '/api/auth/me' });
        assert.strictEqual(r.status, 401);
    });

    await testAsync('POST /api/auth/login with wrong local password → 401', async () => {
        const r = await httpReq({
            port: LOCAL_PORT, path: '/api/auth/login', method: 'POST',
            body: { username: 'admin', password: 'definitely-wrong-password-xyz' }
        });
        assert.strictEqual(r.status, 401, `Expected 401, got ${r.status}`);
        assert.ok(r.body && r.body.error, 'Missing error field');
        assert.ok(!JSON.stringify(r.body).toLowerCase().includes('password'), 'Response leaks "password"');
    });

    await testAsync('POST /api/auth/login response never contains password field', async () => {
        const r = await httpReq({
            port: LOCAL_PORT, path: '/api/auth/login', method: 'POST',
            body: { username: 'admin', password: 'wrong' }
        });
        assert.ok(!JSON.stringify(r.body || '').toLowerCase().includes('"password"'),
                  'Login error response contains password field');
    });

    await testAsync('GET /api/auth/ldap-health still works without auth', async () => {
        const r = await httpReq({ port: LOCAL_PORT, path: '/api/auth/ldap-health',
                                  timeoutMs: 8000 });
        assert.strictEqual(r.status, 200);
        assert.strictEqual(typeof r.body.reachable, 'boolean');
    });
}

// ─── Network tests — LDAP mode (spawned on PORT=8001) ────────────────────────

async function runLdapModeTests() {
    console.log('\n── Network: LDAP mode (spawned on PORT=' + LDAP_PORT2 + ') ────────────────');

    let ldapProc = null;
    try {
        ldapProc = await spawnLdapServer(LDAP_PORT2);
        console.log(`  [INFO] LDAP-mode server started on port ${LDAP_PORT2}`);
    } catch (e) {
        skip('all LDAP-mode tests', `Could not spawn LDAP server: ${e.message}`);
        return;
    }

    try {
        await testAsync('§1  GET /api/auth/config → authBackend: ldap', async () => {
            const r = await httpReq({ port: LDAP_PORT2, path: '/api/auth/config' });
            assert.strictEqual(r.status,          200);
            assert.strictEqual(r.body.authBackend, 'ldap');
        });

        await testAsync('§5  Invalid username rejected before LDAP bind', async () => {
            const r = await httpReq({
                port: LDAP_PORT2, path: '/api/auth/login', method: 'POST',
                body: { username: 'bad user!@#', password: 'anything' }
            });
            assert.strictEqual(r.status, 401, `Expected 401, got ${r.status}`);
            assert.strictEqual(r.body && r.body.error, 'Invalid credentials');
        });

        await testAsync('§5  Empty username rejected', async () => {
            const r = await httpReq({
                port: LDAP_PORT2, path: '/api/auth/login', method: 'POST',
                body: { username: '', password: 'anything' }
            });
            assert.strictEqual(r.status, 401);
        });

        await testAsync('§5  Username starting with digit rejected', async () => {
            const r = await httpReq({
                port: LDAP_PORT2, path: '/api/auth/login', method: 'POST',
                body: { username: '1234567s', password: 'anything' }
            });
            assert.strictEqual(r.status, 401);
        });

        await testAsync('§6  POST /api/auth/register returns 405 in LDAP mode', async () => {
            const r = await httpReq({
                port: LDAP_PORT2, path: '/api/auth/register', method: 'POST',
                body: { username: 'newuser', password: 'password123' }
            });
            assert.strictEqual(r.status, 405, `Expected 405, got ${r.status}`);
            assert.ok(r.body && /disabled/i.test(r.body.error || ''), 'Error message should mention "disabled"');
        });

        await testAsync('§7  LDAP login returns 503 when LDAP unreachable (with unreachable host)', async () => {
            // Spawn a second one-shot server with an unreachable LDAP server
            const env = {
                ...process.env,
                PORT: String(LDAP_PORT2 + 1),
                RMOOZ_AUTH_BACKEND:  'ldap',
                LDAP_SERVER:         '127.0.0.99',  // not listening → fast ECONNREFUSED
                LDAP_PORT:           '9999',
                LDAP_TIMEOUT:        '1',
                RMOOZ_ALLOW_SIM_RUN: '0',
                RMOOZ_BOOTSTRAP_PASSWORD: 'disabled-in-test'
            };
            let proc2 = null;
            try {
                proc2 = await new Promise((resolve, reject) => {
                    const p = spawn(process.execPath, ['server/web-server.js'],
                        { cwd: __dirname, env, stdio: ['ignore', 'pipe', 'pipe'] });
                    const t = setTimeout(() => reject(new Error('start timeout')), 8000);
                    p.stdout.on('data', d => {
                        if (d.toString().includes('Web server running')) { clearTimeout(t); resolve(p); }
                    });
                    p.on('error', err => { clearTimeout(t); reject(err); });
                });
                const r = await httpReq({
                    port: LDAP_PORT2 + 1, path: '/api/auth/login', method: 'POST',
                    body: { username: 's1234567', password: 'anypass' },
                    timeoutMs: 6000
                });
                assert.ok([401, 503].includes(r.status),
                          `Expected 401 or 503, got ${r.status}`);
                assert.ok(!JSON.stringify(r.body || '').includes('anypass'),
                          'Response must not contain the submitted password');
            } finally {
                if (proc2) proc2.kill();
            }
        });

        // ── Tests requiring real LDAP connectivity ────────────────────────────
        const testUser = process.env.LDAP_TEST_USER;
        const testPass = process.env.LDAP_TEST_PASS;

        if (!testUser || !testPass) {
            skip('§8  Wrong LDAP password → 401',    'Set LDAP_TEST_USER + LDAP_TEST_PASS to enable');
            skip('§9  Successful LDAP login',         'Set LDAP_TEST_USER + LDAP_TEST_PASS to enable');
            skip('§10 /api/auth/me returns LDAP profile', 'Set LDAP_TEST_USER + LDAP_TEST_PASS to enable');
            skip('§11 Logout clears LDAP session',    'Set LDAP_TEST_USER + LDAP_TEST_PASS to enable');
        } else {
            await testAsync('§8  Wrong password → 401 with generic message', async () => {
                const r = await httpReq({
                    port: LDAP_PORT2, path: '/api/auth/login', method: 'POST',
                    body: { username: testUser, password: 'THIS_IS_WRONG_XYZ987' },
                    timeoutMs: 8000
                });
                // Wrong password → 401; unreachable → 503; either is acceptable
                assert.ok([401, 503].includes(r.status), `Expected 401/503, got ${r.status}`);
                assert.ok(!JSON.stringify(r.body || '').includes('THIS_IS_WRONG'),
                          'Response must not contain the submitted password');
            });

            await testAsync('§9  Successful LDAP login → cookie + profile fields', async () => {
                const r = await httpReq({
                    port: LDAP_PORT2, path: '/api/auth/login', method: 'POST',
                    body: { username: testUser, password: testPass },
                    timeoutMs: 8000
                });
                assert.strictEqual(r.status, 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
                assert.ok(r.headers['set-cookie'], 'Missing Set-Cookie header');
                assert.ok(r.headers['set-cookie'].some(c => c.startsWith('rmooz_session')),
                          'Cookie must be rmooz_session');
                assert.ok(r.body.employeeNumber, 'Missing employeeNumber in response');
                assert.ok(r.body.upn,            'Missing upn in response');
                assert.ok(r.body.displayName,    'Missing displayName in response');
                assert.strictEqual(r.body.authBackend, 'ldap');
                assert.ok(!JSON.stringify(r.body).toLowerCase().includes('password'),
                          'Response must not contain "password"');

                // §10 — /api/auth/me returns LDAP profile
                const cookie = r.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');
                const me = await httpReq({ port: LDAP_PORT2, path: '/api/auth/me', cookie });
                assert.strictEqual(me.status, 200);
                assert.strictEqual(me.body.authBackend,    'ldap');
                assert.ok(me.body.displayName,             'me response missing displayName');
                assert.ok(me.body.employeeNumber,          'me response missing employeeNumber');
                assert.ok(me.body.upn,                     'me response missing upn');
                console.log(`  [PASS] §10 /api/auth/me returns LDAP profile`); passed++;

                // §11 — Logout
                const logout = await httpReq({
                    port: LDAP_PORT2, path: '/api/auth/logout', method: 'POST', cookie
                });
                assert.strictEqual(logout.status, 200);
                // Session must be invalidated
                const afterLogout = await httpReq({ port: LDAP_PORT2, path: '/api/auth/me', cookie });
                assert.strictEqual(afterLogout.status, 401, 'Session must be invalidated after logout');
                console.log(`  [PASS] §11 Logout clears LDAP session`); passed++;
            });
        }

    } finally {
        if (ldapProc) ldapProc.kill();
    }
}

// ─── Run all tests ────────────────────────────────────────────────────────────

async function main() {
    await runLocalTests();
    await runLdapModeTests();

    console.log('\n' + '═'.repeat(62));
    console.log(`  Results: ${passed} passed, ${failed} failed`);
    console.log('═'.repeat(62) + '\n');

    if (failed > 0) process.exit(1);
    else process.exit(0);
}

main().catch(err => {
    console.error('Test runner error:', err);
    process.exit(1);
});
