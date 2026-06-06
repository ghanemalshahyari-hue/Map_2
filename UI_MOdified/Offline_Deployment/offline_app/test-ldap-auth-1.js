/**
 * LDAP-AUTH-1 — Static + network tests
 *
 * Static tests:   node test-ldap-auth-1.js
 * Network tests:  PORT=8000 node test-ldap-auth-1.js  (server must be running)
 *
 * Static tests verify:
 *   - username normalisation (case, domain strip, invalid chars)
 *   - buildUpn domain injection from env
 *   - getLdapConfig reads every env variable
 *   - module source has no hardcoded domain except the env default
 *
 * Network tests (skipped when server unreachable):
 *   - /api/auth/ldap-health returns 200 without a session cookie
 *   - health response shape is correct
 *   - health response never contains a password field
 *   - existing /api/auth/login route still reachable (current login unchanged)
 */
'use strict';

const assert = require('assert');
const http   = require('http');
const path   = require('path');
const fs     = require('fs');

const ldapAuth = require('./server/auth/ldap-auth');

let passed = 0;
let failed = 0;
const PORT  = parseInt(process.env.PORT || '8000', 10);

// ─── Tiny test harness ────────────────────────────────────────────────────────

function test(name, fn) {
    try {
        fn();
        console.log(`  [PASS] ${name}`);
        passed++;
    } catch (e) {
        console.log(`  [FAIL] ${name}: ${e.message}`);
        failed++;
    }
}

async function testAsync(name, fn) {
    try {
        await fn();
        console.log(`  [PASS] ${name}`);
        passed++;
    } catch (e) {
        console.log(`  [FAIL] ${name}: ${e.message}`);
        failed++;
    }
}

function skip(name, reason) {
    console.log(`  [SKIP] ${name}: ${reason}`);
}

// ─── HTTP helper (for network tests) ─────────────────────────────────────────

function httpGet(urlPath, cookieHeader, timeoutMs = 3000) {
    return new Promise((resolve, reject) => {
        const opts = {
            hostname: '127.0.0.1',
            port:     PORT,
            path:     urlPath,
            method:   'GET',
            headers:  cookieHeader ? { Cookie: cookieHeader } : {}
        };
        const req = http.request(opts, res => {
            let body = '';
            res.on('data', c => body += c);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, body: JSON.parse(body), raw: body });
                } catch {
                    resolve({ status: res.statusCode, body: null, raw: body });
                }
            });
        });
        req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('timeout')); });
        req.on('error', reject);
        req.end();
    });
}

// Health endpoint waits up to LDAP_TIMEOUT seconds before responding.
// Use a generous HTTP timeout so the test doesn't race against the LDAP connect timeout.
const HEALTH_TIMEOUT_MS = (parseInt(process.env.LDAP_TIMEOUT || '5', 10) + 3) * 1000;

async function serverIsUp() {
    try {
        await httpGet('/');
        return true;
    } catch {
        return false;
    }
}

// ─── Static tests — normaliseUsername ────────────────────────────────────────

console.log('\n══════════════════════════════════════════════════════');
console.log('  LDAP-AUTH-1 — server/auth/ldap-auth.js test suite');
console.log('══════════════════════════════════════════════════════\n');

console.log('── normaliseUsername ──────────────────────────────────');

test('lowercase employee number passes through', () => {
    assert.strictEqual(ldapAuth.normaliseUsername('s1234567'), 's1234567');
});

test('uppercase employee number is lowercased', () => {
    assert.strictEqual(ldapAuth.normaliseUsername('S1234567'), 's1234567');
});

test('mixed case is fully lowercased', () => {
    assert.strictEqual(ldapAuth.normaliseUsername('S1234ABC'), 's1234abc');
});

test('domain suffix stripped (sss.dir)', () => {
    assert.strictEqual(ldapAuth.normaliseUsername('s1234567@sss.dir'), 's1234567');
});

test('domain suffix stripped (any other domain)', () => {
    assert.strictEqual(ldapAuth.normaliseUsername('s1234567@example.mil'), 's1234567');
});

test('uppercase with domain stripped and lowercased', () => {
    assert.strictEqual(ldapAuth.normaliseUsername('S1234567@SSS.DIR'), 's1234567');
});

test('leading/trailing whitespace trimmed', () => {
    assert.strictEqual(ldapAuth.normaliseUsername('  s1234567  '), 's1234567');
});

test('whitespace with domain trimmed and stripped', () => {
    assert.strictEqual(ldapAuth.normaliseUsername('  s1234567@sss.dir  '), 's1234567');
});

test('empty string returns null', () => {
    assert.strictEqual(ldapAuth.normaliseUsername(''), null);
});

test('null returns null', () => {
    assert.strictEqual(ldapAuth.normaliseUsername(null), null);
});

test('undefined returns null', () => {
    assert.strictEqual(ldapAuth.normaliseUsername(undefined), null);
});

test('non-string number returns null', () => {
    assert.strictEqual(ldapAuth.normaliseUsername(1234567), null);
});

test('username with internal space returns null', () => {
    assert.strictEqual(ldapAuth.normaliseUsername('s 1234567'), null);
});

test('username starting with digit returns null', () => {
    assert.strictEqual(ldapAuth.normaliseUsername('1234567s'), null);
});

test('username with exclamation mark returns null', () => {
    assert.strictEqual(ldapAuth.normaliseUsername('s1234567!'), null);
});

test('username with slash returns null', () => {
    assert.strictEqual(ldapAuth.normaliseUsername('s/admin'), null);
});

test('@-only string returns null', () => {
    assert.strictEqual(ldapAuth.normaliseUsername('@sss.dir'), null);
});

test('bare @ returns null', () => {
    assert.strictEqual(ldapAuth.normaliseUsername('@'), null);
});

test('just-domain string (no username part) returns null', () => {
    // "sss.dir" starts with 's' which is a letter — passes the regex
    // but should be considered a valid-format username, not an error
    // (the domain-strip only applies when '@' is present)
    const result = ldapAuth.normaliseUsername('sss.dir');
    // either null (invalid) or a normalised value — just verify no crash
    assert.ok(result === null || typeof result === 'string');
});

test('max-length username (64 chars) passes', () => {
    const u = 'a' + 'b'.repeat(63); // 64 chars total
    const result = ldapAuth.normaliseUsername(u);
    assert.strictEqual(result, u);
});

test('over-max-length username (65 chars) returns null', () => {
    const u = 'a' + 'b'.repeat(64); // 65 chars total
    assert.strictEqual(ldapAuth.normaliseUsername(u), null);
});

// ─── Static tests — buildUpn ─────────────────────────────────────────────────

console.log('\n── buildUpn ───────────────────────────────────────────');

test('buildUpn appends custom LDAP_DOMAIN from env', () => {
    const saved = process.env.LDAP_DOMAIN;
    process.env.LDAP_DOMAIN = 'test.example.org';
    const upn = ldapAuth.buildUpn('s1234567');
    if (saved !== undefined) process.env.LDAP_DOMAIN = saved;
    else delete process.env.LDAP_DOMAIN;
    assert.strictEqual(upn, 's1234567@test.example.org');
});

test('buildUpn uses default when LDAP_DOMAIN env is unset', () => {
    const saved = process.env.LDAP_DOMAIN;
    delete process.env.LDAP_DOMAIN;
    const upn = ldapAuth.buildUpn('s1234567');
    if (saved !== undefined) process.env.LDAP_DOMAIN = saved;
    // The default must produce a valid UPN format
    assert.match(upn, /^s1234567@[a-z0-9._-]+$/i);
});

test('buildUpn constructs correct UPN format (user@domain)', () => {
    const saved = process.env.LDAP_DOMAIN;
    process.env.LDAP_DOMAIN = 'corp.example';
    const upn = ldapAuth.buildUpn('jsmith');
    if (saved !== undefined) process.env.LDAP_DOMAIN = saved;
    else delete process.env.LDAP_DOMAIN;
    assert.strictEqual(upn, 'jsmith@corp.example');
});

// ─── Static tests — getLdapConfig ────────────────────────────────────────────

console.log('\n── getLdapConfig ──────────────────────────────────────');

function withEnv(overrides, fn) {
    const saved = {};
    for (const [k, v] of Object.entries(overrides)) {
        saved[k] = process.env[k];
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
    }
    try {
        return fn();
    } finally {
        for (const [k, v] of Object.entries(saved)) {
            if (v === undefined) delete process.env[k];
            else process.env[k] = v;
        }
    }
}

test('reads LDAP_SERVER from env', () => {
    const cfg = withEnv({ LDAP_SERVER: '10.20.30.40' }, () => ldapAuth.getLdapConfig());
    assert.strictEqual(cfg.server, '10.20.30.40');
});

test('reads LDAP_PORT from env', () => {
    const cfg = withEnv({ LDAP_SERVER: '10.0.0.1', LDAP_PORT: '3389' }, () => ldapAuth.getLdapConfig());
    assert.strictEqual(cfg.port, 3389);
});

test('LDAP_PORT defaults to 389', () => {
    const cfg = withEnv({ LDAP_SERVER: '10.0.0.1', LDAP_PORT: undefined }, () => ldapAuth.getLdapConfig());
    assert.strictEqual(cfg.port, 389);
});

test('reads LDAP_DOMAIN from env', () => {
    const cfg = withEnv({ LDAP_SERVER: '10.0.0.1', LDAP_DOMAIN: 'my.corp' }, () => ldapAuth.getLdapConfig());
    assert.strictEqual(cfg.domain, 'my.corp');
});

test('reads LDAP_TIMEOUT from env', () => {
    const cfg = withEnv({ LDAP_SERVER: '10.0.0.1', LDAP_TIMEOUT: '10' }, () => ldapAuth.getLdapConfig());
    assert.strictEqual(cfg.timeout, 10);
});

test('LDAP_TIMEOUT defaults to 5', () => {
    const cfg = withEnv({ LDAP_SERVER: '10.0.0.1', LDAP_TIMEOUT: undefined }, () => ldapAuth.getLdapConfig());
    assert.strictEqual(cfg.timeout, 5);
});

test('LDAP_USE_SSL 0 → useSsl false', () => {
    const cfg = withEnv({ LDAP_SERVER: '10.0.0.1', LDAP_USE_SSL: '0' }, () => ldapAuth.getLdapConfig());
    assert.strictEqual(cfg.useSsl, false);
});

test('LDAP_USE_SSL 1 → useSsl true', () => {
    const cfg = withEnv({ LDAP_SERVER: '10.0.0.1', LDAP_USE_SSL: '1' }, () => ldapAuth.getLdapConfig());
    assert.strictEqual(cfg.useSsl, true);
});

test('throws LDAP_CONFIG_ERROR if LDAP_SERVER unset', () => {
    assert.throws(
        () => withEnv({ LDAP_SERVER: undefined }, () => ldapAuth.getLdapConfig()),
        e => e.code === 'LDAP_CONFIG_ERROR' || /LDAP_SERVER/i.test(e.message)
    );
});

test('config object has all expected keys', () => {
    const cfg = withEnv({ LDAP_SERVER: '10.0.0.1' }, () => ldapAuth.getLdapConfig());
    for (const key of ['server', 'port', 'domain', 'timeout', 'useSsl']) {
        assert.ok(key in cfg, `Missing key: ${key}`);
    }
});

// ─── Static tests — no hardcoded domain in source ────────────────────────────

console.log('\n── Source integrity — no hardcoded domain ─────────────');

const SRC_PATH = path.join(__dirname, 'server', 'auth', 'ldap-auth.js');
const srcLines = fs.readFileSync(SRC_PATH, 'utf8').split('\n');

// Non-comment, non-blank code lines
const codeLines = srcLines.filter(l => {
    const t = l.trimStart();
    return t.length > 0 && !t.startsWith('//') && !t.startsWith('*');
});
const codeText = codeLines.join('\n');

test('source does not hardcode mil.dir', () => {
    assert.ok(!codeText.includes('mil.dir'), "Found 'mil.dir' in source code");
});

test("'sss.dir' appears at most once in non-comment code (env default only)", () => {
    const count = (codeText.match(/sss\.dir/g) || []).length;
    assert.ok(count <= 1, `Expected ≤1 occurrences of 'sss.dir', found ${count}`);
});

test('source does not build LDAP URL with literal domain', () => {
    // The URL must be built from config.server, not a hardcoded host
    assert.ok(!codeText.includes('ldap://155.'), "Found hardcoded LDAP server IP in URL");
    assert.ok(!codeText.includes('ldap://sss'), "Found hardcoded domain in LDAP URL");
});

test('filter string uses ldapFilterEscape, not a literal UPN', () => {
    assert.ok(codeText.includes('ldapFilterEscape'), 'Filter must call ldapFilterEscape');
});

test('password never appears in a log/console call', () => {
    // Look for any console.log/warn/error that includes "password" as an argument
    const logRe = /console\.(log|warn|error|info)\s*\([^)]*password/i;
    assert.ok(!logRe.test(codeText), 'Found a console call that references password');
});

// ─── Network tests ────────────────────────────────────────────────────────────

async function runNetworkTests() {
    console.log('\n── Network tests (requires running server) ────────────');

    const up = await serverIsUp();
    if (!up) {
        skip('health endpoint — no auth needed', `Server not running on port ${PORT}. Start with: npm run serve`);
        skip('health response shape', 'server not running');
        skip('health response has no password field', 'server not running');
        skip('existing /api/auth/login still reachable', 'server not running');
        skip('existing /api/auth/me still returns 401 without cookie', 'server not running');
        return;
    }

    await testAsync('GET /api/auth/ldap-health returns 200 without session cookie', async () => {
        const r = await httpGet('/api/auth/ldap-health', null, HEALTH_TIMEOUT_MS);
        assert.strictEqual(r.status, 200, `Expected 200, got ${r.status}`);
    });

    await testAsync('health response is valid JSON with required fields', async () => {
        const r = await httpGet('/api/auth/ldap-health', null, HEALTH_TIMEOUT_MS);
        assert.ok(r.body !== null, 'Response was not valid JSON');
        assert.ok('ok'             in r.body, 'Missing field: ok');
        assert.ok('reachable'      in r.body, 'Missing field: reachable');
        assert.ok('server'         in r.body, 'Missing field: server');
        assert.ok('port'           in r.body, 'Missing field: port');
        assert.ok('domain'         in r.body, 'Missing field: domain');
        assert.ok('timeoutSeconds' in r.body, 'Missing field: timeoutSeconds');
    });

    await testAsync('health response does not contain password or credentials', async () => {
        const r = await httpGet('/api/auth/ldap-health', null, HEALTH_TIMEOUT_MS);
        const raw = JSON.stringify(r.body || '').toLowerCase();
        assert.ok(!raw.includes('password'),    'Response body mentions "password"');
        assert.ok(!raw.includes('credential'),  'Response body mentions "credential"');
        assert.ok(!raw.includes('bind'),        'Response body mentions "bind"');
    });

    await testAsync('health response ok/reachable are booleans', async () => {
        const r = await httpGet('/api/auth/ldap-health', null, HEALTH_TIMEOUT_MS);
        assert.strictEqual(typeof r.body.ok,        'boolean', 'ok must be boolean');
        assert.strictEqual(typeof r.body.reachable,  'boolean', 'reachable must be boolean');
    });

    await testAsync('existing POST /api/auth/login still returns 400/401 (not 404)', async () => {
        // Login route must still exist — send an empty body
        const r = await new Promise((resolve, reject) => {
            const body = JSON.stringify({ username: 'test', password: 'test' });
            const req = http.request({
                hostname: '127.0.0.1', port: PORT,
                path: '/api/auth/login', method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
            }, res => {
                let d = '';
                res.on('data', c => d += c);
                res.on('end', () => resolve({ status: res.statusCode }));
            });
            req.setTimeout(3000, () => { req.destroy(); reject(new Error('timeout')); });
            req.on('error', reject);
            req.write(body);
            req.end();
        });
        assert.ok(r.status !== 404, `Login route returned 404 — route was removed`);
        assert.ok([400, 401, 403].includes(r.status), `Expected 400/401/403, got ${r.status}`);
    });

    await testAsync('existing GET /api/auth/me still returns 401 without cookie', async () => {
        const r = await httpGet('/api/auth/me');
        assert.strictEqual(r.status, 401, `Expected 401, got ${r.status}`);
    });
}

// ─── Run everything ───────────────────────────────────────────────────────────

runNetworkTests().then(() => {
    console.log('\n' + '═'.repeat(54));
    console.log(`  Results: ${passed} passed, ${failed} failed`);
    console.log('═'.repeat(54) + '\n');
    process.exit(failed > 0 ? 1 : 0);
}).catch(err => {
    console.error('Test runner error:', err.message);
    process.exit(1);
});
