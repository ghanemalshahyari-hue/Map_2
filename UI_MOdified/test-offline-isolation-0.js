/**
 * OFFLINE-ISOLATION-0 — Isolation verification tests
 *
 * Verifies that:
 *   1. The main RMOOZ app has NO LDAP code (is fully restored to pre-LDAP state).
 *   2. All LDAP code lives only under Offline_Deployment/offline_app/.
 *   3. The Dockerfile references offline_app (overlay strategy).
 *   4. No credential is stored anywhere.
 *
 * All tests are static — no server required.
 *
 * Usage:
 *   node test-offline-isolation-0.js
 */
'use strict';

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');

const ROOT        = __dirname;
const OFFLINE_APP = path.join(ROOT, 'Offline_Deployment', 'offline_app');

let passed = 0, failed = 0;

function test(name, fn) {
    try { fn(); console.log(`  [PASS] ${name}`); passed++; }
    catch (e) { console.log(`  [FAIL] ${name}: ${e.message}`); failed++; }
}

console.log('\n══════════════════════════════════════════════════════════════════');
console.log('  OFFLINE-ISOLATION-0 — LDAP isolation verification');
console.log('══════════════════════════════════════════════════════════════════\n');

// ─── §1  Main app — NO LDAP ───────────────────────────────────────────────────

console.log('── §1  Main app — LDAP code must be absent ─────────────────────');

const mainAppData    = fs.readFileSync(path.join(ROOT, 'server', 'app-data.js'), 'utf8');
const mainIndexHtml  = fs.readFileSync(path.join(ROOT, 'client', 'index.html'), 'utf8');
const mainLandingJs  = fs.readFileSync(path.join(ROOT, 'client', 'landing-auth.js'), 'utf8');
const mainPkg        = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

test('main server/app-data.js does not require ldap-auth', () => {
    assert.ok(!mainAppData.includes('ldap-auth'), 'main app-data.js must not require ldap-auth');
});

test('main server/app-data.js does not have LDAP login branch', () => {
    assert.ok(!mainAppData.includes('RMOOZ_AUTH_BACKEND'), 'main app-data.js must not check RMOOZ_AUTH_BACKEND');
});

test('main server/app-data.js does not have /api/auth/ldap-health handler', () => {
    assert.ok(!mainAppData.includes('ldap-health'), 'main app-data.js must not have ldap-health route');
});

test('main server/app-data.js does not have /api/auth/config handler', () => {
    assert.ok(!mainAppData.includes("'/api/auth/config'"), 'main app-data.js must not have /api/auth/config route');
});

test('main server/app-data.js does not have migrateUsersTableV2', () => {
    assert.ok(!mainAppData.includes('migrateUsersTableV2'), 'main app-data.js must not have LDAP migration');
});

test('main client/index.html has no LDAP hint element', () => {
    assert.ok(!mainIndexHtml.includes('rmooz-ldap-mode-hint'),
        'main index.html must not have rmooz-ldap-mode-hint element');
});

test('main client/landing-auth.js has no initAuthMode function', () => {
    assert.ok(!mainLandingJs.includes('initAuthMode'),
        'main landing-auth.js must not have initAuthMode');
});

test('main client/landing-auth.js has no ldap_mode_hint string', () => {
    assert.ok(!mainLandingJs.includes('ldap_mode_hint'),
        'main landing-auth.js must not have ldap_mode_hint');
});

test('main client/landing-auth.js does not fetch /api/auth/config', () => {
    assert.ok(!mainLandingJs.includes('/api/auth/config'),
        'main landing-auth.js must not fetch /api/auth/config');
});

test('main package.json does not depend on ldapjs', () => {
    const deps = { ...(mainPkg.dependencies || {}), ...(mainPkg.devDependencies || {}) };
    assert.ok(!deps.ldapjs, 'main package.json must not list ldapjs');
});

test('main package.json has no test:ldap-bind script', () => {
    const scripts = mainPkg.scripts || {};
    assert.ok(!scripts['test:ldap-bind'], 'main package.json must not have test:ldap-bind script');
});

test('main server/auth/ directory does not exist', () => {
    const authDir = path.join(ROOT, 'server', 'auth');
    assert.ok(!fs.existsSync(authDir), 'server/auth/ must not exist in main app');
});

test('main scripts/test-ldap-bind-interactive.js does not exist', () => {
    const f = path.join(ROOT, 'scripts', 'test-ldap-bind-interactive.js');
    assert.ok(!fs.existsSync(f), 'scripts/test-ldap-bind-interactive.js must not be in main app');
});

test('main test-ldap-auth-1.js does not exist at root', () => {
    assert.ok(!fs.existsSync(path.join(ROOT, 'test-ldap-auth-1.js')),
        'test-ldap-auth-1.js must not be at main app root');
});

test('main test-ldap-auth-2-login-wire.js does not exist at root', () => {
    assert.ok(!fs.existsSync(path.join(ROOT, 'test-ldap-auth-2-login-wire.js')),
        'test-ldap-auth-2-login-wire.js must not be at main app root');
});

test('main test-ldap-auth-3-interactive-script.js does not exist at root', () => {
    assert.ok(!fs.existsSync(path.join(ROOT, 'test-ldap-auth-3-interactive-script.js')),
        'test-ldap-auth-3-interactive-script.js must not be at main app root');
});

// ─── §2  offline_app — LDAP code must be present ─────────────────────────────

console.log('\n── §2  offline_app — LDAP code must be present ────────────────');

test('Offline_Deployment/offline_app/ directory exists', () => {
    assert.ok(fs.existsSync(OFFLINE_APP), 'offline_app directory must exist');
});

test('offline_app/server/auth/ldap-auth.js exists', () => {
    assert.ok(fs.existsSync(path.join(OFFLINE_APP, 'server', 'auth', 'ldap-auth.js')),
        'offline_app must contain ldap-auth.js');
});

test('offline_app/server/app-data.js exists and has LDAP login branch', () => {
    const src = fs.readFileSync(path.join(OFFLINE_APP, 'server', 'app-data.js'), 'utf8');
    assert.ok(src.includes('RMOOZ_AUTH_BACKEND') || src.includes('ldap-auth'),
        'offline_app/server/app-data.js must have LDAP login branch');
});

test('offline_app/server/app-data.js has /api/auth/ldap-health handler', () => {
    const src = fs.readFileSync(path.join(OFFLINE_APP, 'server', 'app-data.js'), 'utf8');
    assert.ok(src.includes('ldap-health'), 'offline_app app-data.js must have ldap-health handler');
});

test('offline_app/client/index.html has LDAP hint element', () => {
    const src = fs.readFileSync(path.join(OFFLINE_APP, 'client', 'index.html'), 'utf8');
    assert.ok(src.includes('rmooz-ldap-mode-hint'),
        'offline_app client/index.html must have LDAP hint element');
});

test('offline_app/client/landing-auth.js has initAuthMode', () => {
    const src = fs.readFileSync(path.join(OFFLINE_APP, 'client', 'landing-auth.js'), 'utf8');
    assert.ok(src.includes('initAuthMode'),
        'offline_app client/landing-auth.js must have initAuthMode');
});

test('offline_app/package.json has ldapjs dependency', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(OFFLINE_APP, 'package.json'), 'utf8'));
    assert.ok(pkg.dependencies && pkg.dependencies.ldapjs,
        'offline_app package.json must list ldapjs');
});

test('offline_app/scripts/test-ldap-bind-interactive.js exists', () => {
    assert.ok(
        fs.existsSync(path.join(OFFLINE_APP, 'scripts', 'test-ldap-bind-interactive.js')),
        'offline_app/scripts must have test-ldap-bind-interactive.js'
    );
});

test('offline_app/test-ldap-auth-1.js exists', () => {
    assert.ok(fs.existsSync(path.join(OFFLINE_APP, 'test-ldap-auth-1.js')),
        'offline_app must contain test-ldap-auth-1.js');
});

test('offline_app/test-ldap-auth-2-login-wire.js exists', () => {
    assert.ok(fs.existsSync(path.join(OFFLINE_APP, 'test-ldap-auth-2-login-wire.js')),
        'offline_app must contain test-ldap-auth-2-login-wire.js');
});

test('offline_app/test-ldap-auth-3-interactive-script.js exists', () => {
    assert.ok(fs.existsSync(path.join(OFFLINE_APP, 'test-ldap-auth-3-interactive-script.js')),
        'offline_app must contain test-ldap-auth-3-interactive-script.js');
});

test('offline_app/README.md exists and explains overlay approach', () => {
    const readmePath = path.join(OFFLINE_APP, 'README.md');
    assert.ok(fs.existsSync(readmePath), 'offline_app README.md must exist');
    const content = fs.readFileSync(readmePath, 'utf8');
    assert.ok(
        content.includes('overlay') || content.includes('main app'),
        'offline_app README must explain the overlay approach'
    );
});

// ─── §3  Dockerfile.offline — references offline_app ─────────────────────────

console.log('\n── §3  Dockerfile.offline — overlay strategy ───────────────────');

const dockerfile = fs.readFileSync(
    path.join(ROOT, 'Offline_Deployment', 'Dockerfile.offline'), 'utf8'
);

test('Dockerfile.offline references offline_app/', () => {
    assert.ok(dockerfile.includes('offline_app'),
        'Dockerfile.offline must reference Offline_Deployment/offline_app/');
});

test('Dockerfile.offline copies server/auth/ from offline_app', () => {
    assert.ok(
        dockerfile.includes('offline_app/server/auth') ||
        dockerfile.includes('offline_app/server'),
        'Dockerfile.offline must copy server/auth/ from offline_app'
    );
});

test('Dockerfile.offline copies LDAP-modified app-data.js from offline_app', () => {
    assert.ok(dockerfile.includes('offline_app/server/app-data.js'),
        'Dockerfile.offline must overlay offline_app/server/app-data.js');
});

test('Dockerfile.offline copies LDAP package.json from offline_app', () => {
    assert.ok(dockerfile.includes('offline_app/package.json'),
        'Dockerfile.offline must use offline_app/package.json (includes ldapjs)');
});

// ─── §4  No credentials stored anywhere ──────────────────────────────────────

console.log('\n── §4  No credentials stored anywhere ──────────────────────────');

function scanForCredentials(filePath) {
    if (!fs.existsSync(filePath)) return;
    const content = fs.readFileSync(filePath, 'utf8');
    // Check for what looks like a real password assignment (not a variable name or placeholder)
    const credPatterns = [
        /LDAP_PASSWORD\s*=\s*['"]\w{4,}/,
        /LDAP_BIND_PASS\s*=\s*['"]\w{4,}/,
        /password\s*[:=]\s*['"]\w{8,}/i
    ];
    for (const pat of credPatterns) {
        assert.ok(!pat.test(content),
            `Found credential pattern in ${path.relative(ROOT, filePath)}: ${pat}`);
    }
}

test('offline_app/package.json has no stored credential', () => {
    scanForCredentials(path.join(OFFLINE_APP, 'package.json'));
});

test('Dockerfile.offline has no stored credential', () => {
    scanForCredentials(path.join(ROOT, 'Offline_Deployment', 'Dockerfile.offline'));
});

test('Offline_Deployment/.env.offline.example has no stored credential', () => {
    const envPath = path.join(ROOT, 'Offline_Deployment', '.env.offline.example');
    if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        // Placeholder values like '<offline-ldap-ip-or-hostname>' are fine
        // Reject anything that looks like a real password value
        assert.ok(!content.match(/LDAP_PASSWORD\s*=\s*\S{4,}/),
            '.env.offline.example must not contain a real LDAP password');
        assert.ok(content.includes('change-me-before-deployment') || !content.match(/SESSION_SECRET\s*=\s*[a-f0-9]{32,}/),
            '.env.offline.example SESSION_SECRET must be a placeholder, not a real secret');
    }
});

// ─── §5  offline_app ldap-auth.js has no hardcoded credentials ───────────────

console.log('\n── §5  ldap-auth.js safety checks ─────────────────────────────');

const ldapAuthSrc = fs.readFileSync(
    path.join(OFFLINE_APP, 'server', 'auth', 'ldap-auth.js'), 'utf8'
);

test('offline_app ldap-auth.js does not log passwords', () => {
    const lines = ldapAuthSrc.split('\n');
    for (const [i, line] of lines.entries()) {
        if (/console\.(log|warn|error|info)/.test(line)) {
            const noStr = line.replace(/'[^']*'|"[^"]*"|`[^`]*`/g, "''");
            assert.ok(!/\bpw\b|\bpassword\b|\brawPassword\b/.test(noStr),
                `Line ${i + 1}: console call may log password variable`);
        }
    }
});

test('offline_app ldap-auth.js does not hardcode LDAP_DOMAIN (except env default constant)', () => {
    // Count only in non-comment code lines — comments may legitimately say "e.g. sss.dir"
    const codeLines = ldapAuthSrc.split('\n')
        .filter(l => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*'));
    const count = (codeLines.join('\n').match(/sss\.dir/g) || []).length;
    // Exactly 1 is expected: the LDAP_DOMAIN_DEFAULT constant assignment
    assert.ok(count <= 1, `Expected ≤1 occurrences of 'sss.dir' in code (non-comment) lines, found ${count}`);
});

// ─── §6  Font isolation (OFFLINE-ISOLATION-1) ────────────────────────────────
// The Google Fonts CDN removal (OFFLINE-FONTS-0) must live only in offline_app.
// The main app must have the original Google Fonts CDN references (online mode).

console.log('\n── §6  Font isolation — main app vs offline_app ────────────────');

const mainAppHtml = fs.readFileSync(path.join(ROOT, 'client', 'app.html'), 'utf8');

test('main app client/app.html has Google Fonts CDN (original state)', () => {
    assert.ok(
        mainAppHtml.includes('fonts.googleapis.com'),
        'main app/client/app.html must have the original Google Fonts CDN reference'
    );
});

test('main app client/assets/ directory does not exist', () => {
    assert.ok(
        !fs.existsSync(path.join(ROOT, 'client', 'assets')),
        'client/assets/ must not exist in main app — it was added only for offline use'
    );
});

test('main app client/assets/fonts/rmooz-fonts.css does not exist', () => {
    assert.ok(
        !fs.existsSync(path.join(ROOT, 'client', 'assets', 'fonts', 'rmooz-fonts.css')),
        'rmooz-fonts.css must not be in main app — it lives only in offline_app'
    );
});

test('main root has no test-offline-fonts-0.js', () => {
    assert.ok(
        !fs.existsSync(path.join(ROOT, 'test-offline-fonts-0.js')),
        'test-offline-fonts-0.js must not be at main app root (moved to offline_app)'
    );
});

test('offline_app/client/app.html exists and has NO Google Fonts CDN', () => {
    const offlineAppHtml = path.join(OFFLINE_APP, 'client', 'app.html');
    assert.ok(fs.existsSync(offlineAppHtml), 'offline_app/client/app.html must exist');
    const src = fs.readFileSync(offlineAppHtml, 'utf8');
    assert.ok(!src.includes('fonts.googleapis.com'),
        'offline_app/client/app.html must have Google Fonts CDN removed');
});

test('offline_app/client/app.html references local rmooz-fonts.css', () => {
    const src = fs.readFileSync(path.join(OFFLINE_APP, 'client', 'app.html'), 'utf8');
    assert.ok(src.includes('assets/fonts/rmooz-fonts.css'),
        'offline_app/client/app.html must reference local rmooz-fonts.css');
});

test('offline_app/client/assets/fonts/rmooz-fonts.css exists', () => {
    assert.ok(
        fs.existsSync(path.join(OFFLINE_APP, 'client', 'assets', 'fonts', 'rmooz-fonts.css')),
        'offline_app must contain client/assets/fonts/rmooz-fonts.css'
    );
});

test('offline_app/test-offline-fonts-0.js exists (moved from main root)', () => {
    assert.ok(
        fs.existsSync(path.join(OFFLINE_APP, 'test-offline-fonts-0.js')),
        'test-offline-fonts-0.js must exist in offline_app'
    );
});

test('Dockerfile.offline copies offline_app/client/app.html', () => {
    const dockerfile = fs.readFileSync(
        path.join(ROOT, 'Offline_Deployment', 'Dockerfile.offline'), 'utf8'
    );
    assert.ok(
        dockerfile.includes('offline_app/client/app.html'),
        'Dockerfile.offline must copy offline_app/client/app.html over main app version'
    );
});

test('Dockerfile.offline copies offline_app/client/assets/', () => {
    const dockerfile = fs.readFileSync(
        path.join(ROOT, 'Offline_Deployment', 'Dockerfile.offline'), 'utf8'
    );
    assert.ok(
        dockerfile.includes('offline_app/client/assets'),
        'Dockerfile.offline must copy offline_app/client/assets/ (local font files)'
    );
});

// ─── Results ──────────────────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(66));
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log('═'.repeat(66) + '\n');
process.exit(failed > 0 ? 1 : 0);
