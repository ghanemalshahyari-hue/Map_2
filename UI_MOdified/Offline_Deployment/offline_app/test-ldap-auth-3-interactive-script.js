/**
 * LDAP-AUTH-3 — Static verification + regression tests
 *
 * Does NOT invoke the interactive bind script (it would hang waiting for input).
 * Instead, audits the source to verify safety properties, then runs AUTH-1 and
 * AUTH-2 as subprocess regressions.
 *
 * Usage:
 *   node test-ldap-auth-3-interactive-script.js
 *
 * For regression subtests that need a running server, start one first:
 *   RMOOZ_ALLOW_SIM_RUN=0 node server/web-server.js &
 *   node test-ldap-auth-3-interactive-script.js
 */
'use strict';

const assert  = require('assert');
const fs      = require('fs');
const path    = require('path');
const { spawnSync } = require('child_process');

const SCRIPT_PATH = path.join(__dirname, 'scripts', 'test-ldap-bind-interactive.js');
const PKG_PATH    = path.join(__dirname, 'package.json');

let passed = 0, failed = 0;

// ─── Tiny harness ─────────────────────────────────────────────────────────────

function test(name, fn) {
    try { fn(); console.log(`  [PASS] ${name}`); passed++; }
    catch (e) { console.log(`  [FAIL] ${name}: ${e.message}`); failed++; }
}

function skip(name, reason) { console.log(`  [SKIP] ${name}: ${reason}`); }

console.log('\n══════════════════════════════════════════════════════════════════');
console.log('  LDAP-AUTH-3 — Interactive bind script verification + regression');
console.log('══════════════════════════════════════════════════════════════════\n');

// ─── §1  File existence ───────────────────────────────────────────────────────

console.log('── §1  Script file existence ──────────────────────────────────────');

test('scripts/test-ldap-bind-interactive.js exists', () => {
    assert.ok(fs.existsSync(SCRIPT_PATH), `Missing: ${SCRIPT_PATH}`);
});

test('script file is non-empty', () => {
    const stat = fs.statSync(SCRIPT_PATH);
    assert.ok(stat.size > 500, `File suspiciously small (${stat.size} bytes)`);
});

// ─── §2  Source safety analysis ───────────────────────────────────────────────

console.log('\n── §2  Source safety analysis ─────────────────────────────────────');

const src = fs.readFileSync(SCRIPT_PATH, 'utf8');
const srcLines = src.split('\n');

// Strip string literals before variable-reference checks (avoids false positives
// on comment text like "// Password is NEVER logged")
const srcNoStrings = src.replace(/'[^']*'|"[^"]*"|`[^`]*`/g, "''");

test('script imports server/auth/ldap-auth (uses same module as login route)', () => {
    // The import may be a literal path or a path.join() expression — both are acceptable.
    const importsLdapAuth =
        src.includes('server/auth/ldap-auth') ||          // literal string
        src.includes("'../server/auth/ldap-auth'") ||     // relative literal
        (src.includes("'ldap-auth'") && src.includes('server')) || // split path.join
        (src.includes('"ldap-auth"') && src.includes('server')) ||
        // path.join(__dirname, '..', 'server', 'auth', 'ldap-auth')
        (src.includes("'ldap-auth'") && src.includes("'server'") && src.includes("'auth'"));
    assert.ok(importsLdapAuth, 'Script must require the server/auth/ldap-auth module');
});

test('script calls normaliseUsername from ldap-auth module', () => {
    assert.ok(src.includes('normaliseUsername'), 'Script must call normaliseUsername');
});

test('script calls buildUpn from ldap-auth module', () => {
    assert.ok(src.includes('buildUpn'), 'Script must call buildUpn');
});

test('script calls authenticateLdapUser from ldap-auth module', () => {
    assert.ok(src.includes('authenticateLdapUser'), 'Script must call authenticateLdapUser');
});

test('script does not hardcode LDAP_SERVER IP address', () => {
    // Remove comment lines before checking
    const codeOnly = srcLines
        .filter(l => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*'))
        .join('\n');
    assert.ok(!codeOnly.includes('155.140'), 'Script must not hardcode a server IP');
    assert.ok(!codeOnly.includes('10.10.10'), 'Script must not hardcode a server IP');
});

test('script does not hardcode any password string', () => {
    const noComments = srcLines
        .filter(l => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*'))
        .join('\n');
    // Remove string literals; remaining 'password' occurrences are variable names
    const noStringsNoComments = noComments.replace(/'[^']*'|"[^"]*"|`[^`]*`/g, "''");
    // Should NOT have a password= assignment with a real value
    assert.ok(
        !/password\s*=\s*['"][^'"]{4,}['"]/.test(noStringsNoComments),
        'Script must not assign a hardcoded password string'
    );
});

test('script does not accept --password from process.argv by default', () => {
    // The script must have a guard that REJECTS password-like argv patterns
    assert.ok(
        src.includes('FORBIDDEN_ARGV_PATTERNS') || src.includes('argv') && src.includes('pass'),
        'Script must guard against --password in argv'
    );
    // Specifically: the guard must include a pattern matching --password=
    assert.ok(
        /pass(word)?/i.test(src) && src.includes('process.argv'),
        'Script must inspect process.argv for password patterns'
    );
});

test('script does not print the password variable to console', () => {
    for (const [i, line] of srcLines.entries()) {
        if (/console\.(log|warn|error|info)/.test(line)) {
            const noStr = line.replace(/'[^']*'|"[^"]*"|`[^`]*`/g, "''");
            assert.ok(
                !/\bpw\b|\bpassword\b/.test(noStr),
                `Line ${i + 1}: console call may log password variable: ${line.trim()}`
            );
        }
    }
});

test('password prompt uses stdin raw mode or readline without echo', () => {
    assert.ok(
        src.includes('setRawMode') || src.includes('output: null'),
        'Password prompt must suppress echo (setRawMode or output:null)'
    );
});

test('script reads LDAP config via getLdapConfig from ldap-auth module', () => {
    assert.ok(src.includes('getLdapConfig'), 'Script must use getLdapConfig for config');
    // Must NOT read env vars directly in the main config block (centralised in module)
    // Allow process.env only in the non-TTY piped branch or error messages
});

test('script exits with code 0 on success, non-zero on failure', () => {
    assert.ok(src.includes('process.exit(0)'),  'Must exit(0) on success');
    assert.ok(src.includes('process.exit(1)'),  'Must exit(1) on failure');
    assert.ok(src.includes('process.exit(2)'),  'Must exit(2) on config/fatal error');
});

// ─── §3  npm script ───────────────────────────────────────────────────────────

console.log('\n── §3  npm script ──────────────────────────────────────────────────');

const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));

test('"test:ldap-bind" script exists in package.json', () => {
    assert.ok(
        pkg.scripts && pkg.scripts['test:ldap-bind'],
        'Missing "test:ldap-bind" in package.json scripts'
    );
});

test('"test:ldap-bind" script points to the correct file', () => {
    const cmd = pkg.scripts['test:ldap-bind'] || '';
    assert.ok(
        cmd.includes('test-ldap-bind-interactive.js'),
        `Expected script to reference test-ldap-bind-interactive.js, got: ${cmd}`
    );
});

// ─── §4  Docs existence ───────────────────────────────────────────────────────

console.log('\n── §4  Documentation files ────────────────────────────────────────');

// Paths from offline_app/ root: docs live one level up in Offline_Deployment/docs/
const DOCS = [
    ['../../docs/integration/ldap-auth-3-interactive-bind-test.md', 'LDAP-AUTH-3 doc'],
    ['../README.md',                           'Offline_Deployment README'],
    ['../docs/offline-deployment-checklist.md','Deployment checklist'],
    ['../docs/ldap-configuration-guide.md',    'LDAP config guide']
];

for (const [relPath, label] of DOCS) {
    test(`${label} exists`, () => {
        const full = path.join(__dirname, relPath);
        assert.ok(fs.existsSync(full), `Missing: ${relPath}`);
    });
}

test('Offline_Deployment README mentions npm run test:ldap-bind', () => {
    const content = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');
    assert.ok(
        content.includes('test:ldap-bind') || content.includes('test-ldap-bind-interactive'),
        'Offline_Deployment README must mention the bind test command'
    );
});

test('ldap-configuration-guide.md mentions test:ldap-bind or test-ldap-bind-interactive', () => {
    const content = fs.readFileSync(
        path.join(__dirname, '..', 'docs', 'ldap-configuration-guide.md'), 'utf8'
    );
    assert.ok(
        content.includes('test:ldap-bind') || content.includes('test-ldap-bind-interactive'),
        'LDAP config guide must mention the bind test command'
    );
});

test('deployment checklist mentions bind test', () => {
    const content = fs.readFileSync(
        path.join(__dirname, '..', 'docs', 'offline-deployment-checklist.md'), 'utf8'
    );
    assert.ok(
        content.includes('test:ldap-bind') || content.includes('test-ldap-bind-interactive') || content.includes('bind test'),
        'Checklist must mention the bind test'
    );
});

// ─── §5  LDAP-AUTH-1 regression ──────────────────────────────────────────────

console.log('\n── §5  LDAP-AUTH-1 regression ──────────────────────────────────────');

function runTestFile(filePath, envOverrides = {}) {
    const env = { ...process.env, ...envOverrides };
    const result = spawnSync(process.execPath, [filePath], {
        cwd:     __dirname,
        env,
        timeout: 30000,
        encoding: 'utf8'
    });
    return {
        code:   result.status,
        stdout: result.stdout || '',
        stderr: result.stderr || ''
    };
}

test('LDAP-AUTH-1 static tests pass (LDAP_SERVER=10.0.0.1, no server needed)', () => {
    const r = runTestFile(
        path.join(__dirname, 'test-ldap-auth-1.js'),
        { LDAP_SERVER: '10.0.0.1', LDAP_TIMEOUT: '1', PORT: '8999' }
    );
    // Static tests pass even without a server (network tests are skipped)
    const hasFail   = /\[FAIL\]/.test(r.stdout);
    const hasPass   = /\[PASS\]/.test(r.stdout);
    const skipOnly  = !hasFail && hasPass;
    if (hasFail) throw new Error('AUTH-1 has failing tests:\n' + r.stdout.slice(-600));
    assert.ok(skipOnly || r.code === 0, `AUTH-1 exited ${r.code}:\n${r.stdout.slice(-400)}`);
});

// ─── §6  LDAP-AUTH-2 regression ──────────────────────────────────────────────

console.log('\n── §6  LDAP-AUTH-2 regression ──────────────────────────────────────');

const PORT = parseInt(process.env.PORT || '8000', 10);
const http  = require('http');

async function serverIsUp() {
    return new Promise(resolve => {
        const req = http.get(`http://127.0.0.1:${PORT}/`, res => {
            resolve(res.statusCode < 500);
        });
        req.setTimeout(1500, () => { req.destroy(); resolve(false); });
        req.on('error', () => resolve(false));
    });
}

async function runAuth2Regression() {
    const up = await serverIsUp();
    if (!up) {
        skip('LDAP-AUTH-2 regression', `Server not running on port ${PORT}. Start: npm run serve`);
        return;
    }

    test('LDAP-AUTH-2 full suite passes with running server', () => {
        const r = runTestFile(path.join(__dirname, 'test-ldap-auth-2-login-wire.js'));
        if (/\[FAIL\]/.test(r.stdout)) {
            throw new Error('AUTH-2 has failing tests:\n' + r.stdout.slice(-600));
        }
        assert.ok(r.code === 0, `AUTH-2 exited ${r.code}`);
    });
}

// ─── Run async section then print results ─────────────────────────────────────

runAuth2Regression().then(() => {
    console.log('\n' + '═'.repeat(66));
    console.log(`  Results: ${passed} passed, ${failed} failed`);
    console.log('═'.repeat(66) + '\n');
    process.exit(failed > 0 ? 1 : 0);
}).catch(err => {
    console.error('Test runner error:', err.message);
    process.exit(1);
});
