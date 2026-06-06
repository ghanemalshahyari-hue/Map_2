/**
 * OFFLINE-FONTS-0 — Font CDN removal tests (offline_app version)
 *
 * Verifies that no external font CDN references remain in the offline_app
 * client files and that the local font CSS file is correctly referenced.
 *
 * Run from Offline_Deployment/offline_app/:
 *   node test-offline-fonts-0.js
 *
 * All tests are static (no server required).
 * Tests scan offline_app/client/ only — not the main app.
 */
'use strict';

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');
const { spawnSync } = require('child_process');

// Paths are relative to offline_app/ root (__dirname = Offline_Deployment/offline_app/)
const CLIENT   = path.join(__dirname, 'client');
const DOC_PATH = path.join(__dirname, '..', '..', 'docs', 'integration', 'offline-fonts-0-local-fonts.md');
const README_PATH = path.join(__dirname, '..', 'README.md');

let passed = 0, failed = 0;

function test(name, fn) {
    try { fn(); console.log(`  [PASS] ${name}`); passed++; }
    catch (e) { console.log(`  [FAIL] ${name}: ${e.message}`); failed++; }
}
function skip(name, reason) { console.log(`  [SKIP] ${name}: ${reason}`); }

console.log('\n══════════════════════════════════════════════════════════════');
console.log('  OFFLINE-FONTS-0 — offline_app Font CDN removal test suite');
console.log('══════════════════════════════════════════════════════════════\n');

// ─── §1  offline_app/client/app.html — CDN references removed ────────────────

console.log('── §1  offline_app/client/app.html — no external font CDN ─────');

const appHtml = fs.readFileSync(path.join(CLIENT, 'app.html'), 'utf8');

test('no fonts.googleapis.com in offline_app/client/app.html', () => {
    assert.ok(!appHtml.includes('fonts.googleapis.com'),
        'Found fonts.googleapis.com in offline_app app.html');
});

test('no fonts.gstatic.com in offline_app/client/app.html', () => {
    assert.ok(!appHtml.includes('fonts.gstatic.com'),
        'Found fonts.gstatic.com in offline_app app.html');
});

test('no googleapis.com preconnect in offline_app/client/app.html', () => {
    const hasPreconnect = appHtml.includes('preconnect') && appHtml.includes('googleapis');
    assert.ok(!hasPreconnect, 'Found googleapis preconnect in offline_app app.html');
});

test('offline_app/client/app.html references local rmooz-fonts.css', () => {
    assert.ok(
        appHtml.includes('assets/fonts/rmooz-fonts.css'),
        'offline_app app.html must reference assets/fonts/rmooz-fonts.css'
    );
});

test('rmooz-fonts.css link uses a relative path, not a URL', () => {
    const linkMatch = appHtml.match(/href="([^"]*rmooz-fonts[^"]*)"/);
    assert.ok(linkMatch, 'rmooz-fonts.css link not found in offline_app app.html');
    assert.ok(
        !linkMatch[1].startsWith('http'),
        `Font CSS href must be relative, not a URL: ${linkMatch[1]}`
    );
});

// ─── §2  offline_app/client/index.html ───────────────────────────────────────

console.log('\n── §2  offline_app/client/index.html — no external font CDN ───');

const indexHtml = fs.readFileSync(path.join(CLIENT, 'index.html'), 'utf8');

test('no fonts.googleapis.com in offline_app/client/index.html', () => {
    assert.ok(!indexHtml.includes('fonts.googleapis.com'));
});

test('no fonts.gstatic.com in offline_app/client/index.html', () => {
    assert.ok(!indexHtml.includes('fonts.gstatic.com'));
});

// ─── §3  home.html — only check if present in offline_app ────────────────────
// home.html is unchanged from main app (no CDN fonts) and is not in offline_app/client/.
// Skip if not present; it will be copied from the clean main app during Docker build.

console.log('\n── §3  home.html (optional in offline_app) ─────────────────────');

const homeHtmlPath = path.join(CLIENT, 'home.html');
if (fs.existsSync(homeHtmlPath)) {
    const homeHtml = fs.readFileSync(homeHtmlPath, 'utf8');
    test('no fonts.googleapis.com in home.html', () => {
        assert.ok(!homeHtml.includes('fonts.googleapis.com'));
    });
    test('no fonts.gstatic.com in home.html', () => {
        assert.ok(!homeHtml.includes('fonts.gstatic.com'));
    });
} else {
    skip('home.html CDN checks', 'home.html not in offline_app/client/ — it comes from clean main app');
}

// ─── §4  CSS files — no @import CDN ──────────────────────────────────────────

console.log('\n── §4  CSS files in offline_app — no @import to external host ──');

function findCssFiles(dir, results = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
            findCssFiles(full, results);
        } else if (entry.isFile() && entry.name.endsWith('.css')) {
            results.push(full);
        }
    }
    return results;
}

const cssFiles = findCssFiles(CLIENT);

test(`found CSS files under offline_app/client/ (${cssFiles.length})`, () => {
    assert.ok(cssFiles.length > 0, 'No CSS files found under offline_app/client/');
});

for (const cssPath of cssFiles) {
    const rel = path.relative(__dirname, cssPath);
    const content = fs.readFileSync(cssPath, 'utf8');
    test(`${rel} — no @import from fonts.googleapis.com`, () => {
        assert.ok(!content.includes('fonts.googleapis.com'));
    });
    test(`${rel} — no @import from fonts.gstatic.com`, () => {
        assert.ok(!content.includes('fonts.gstatic.com'));
    });
    test(`${rel} — no url("https://fonts...") references`, () => {
        assert.ok(!content.match(/url\s*\(\s*["']?https:\/\/fonts\./));
    });
}

// ─── §5  Local font CSS exists and is valid ───────────────────────────────────

console.log('\n── §5  Local font CSS file ─────────────────────────────────────');

const FONTS_CSS = path.join(CLIENT, 'assets', 'fonts', 'rmooz-fonts.css');

test('offline_app/client/assets/fonts/rmooz-fonts.css exists', () => {
    assert.ok(fs.existsSync(FONTS_CSS), `Missing: ${FONTS_CSS}`);
});

test('rmooz-fonts.css has no external url() reference', () => {
    const content = fs.readFileSync(FONTS_CSS, 'utf8');
    assert.ok(!content.match(/url\s*\(\s*["']?https?:\/\//),
        'rmooz-fonts.css must not contain url(https://...) references');
});

// ─── §6  Broad HTML scan — no CDN font link in offline_app/client ────────────

console.log('\n── §6  Broad HTML scan — no CDN font in offline_app/client/ ───');

function findHtmlFiles(dir, results = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
            findHtmlFiles(full, results);
        } else if (entry.isFile() && entry.name.endsWith('.html')) {
            results.push(full);
        }
    }
    return results;
}

const htmlFiles = findHtmlFiles(CLIENT);

test(`found HTML files under offline_app/client/ (${htmlFiles.length})`, () => {
    assert.ok(htmlFiles.length > 0, 'No HTML files found under offline_app/client/');
});

for (const htmlPath of htmlFiles) {
    const rel = path.relative(__dirname, htmlPath);
    const content = fs.readFileSync(htmlPath, 'utf8');
    test(`${rel} — no fonts.googleapis.com`, () => {
        assert.ok(!content.includes('fonts.googleapis.com'),
            `Found fonts.googleapis.com in ${rel}`);
    });
}

// ─── §7  Documentation files ─────────────────────────────────────────────────

console.log('\n── §7  Documentation files ─────────────────────────────────────');

test('docs/integration/offline-fonts-0-local-fonts.md exists', () => {
    assert.ok(fs.existsSync(DOC_PATH), `Missing at ${DOC_PATH}`);
});

test('Offline_Deployment/README.md mentions local/system fonts', () => {
    const content = fs.readFileSync(README_PATH, 'utf8');
    assert.ok(
        content.includes('local') || content.includes('system font') || content.includes('CDN') ||
        content.includes('offline font') || content.includes('fonts'),
        'Offline README must mention font status'
    );
});

// ─── §8  Isolation regression ────────────────────────────────────────────────

console.log('\n── §8  Isolation regression ─────────────────────────────────────');

function runFile(file, envOverrides = {}) {
    return spawnSync(process.execPath, [file], {
        cwd: __dirname,
        env: { ...process.env, ...envOverrides },
        timeout: 30000,
        encoding: 'utf8'
    });
}

test('OFFLINE-ISOLATION-0+1 tests pass (full isolation verified)', () => {
    const isolationTest = path.join(__dirname, '..', '..', 'test-offline-isolation-0.js');
    const r = runFile(isolationTest);
    if (/\[FAIL\]/.test(r.stdout)) throw new Error('Isolation test has failures:\n' + r.stdout.slice(-400));
    assert.ok(/\[PASS\]/.test(r.stdout), 'Isolation test produced no PASS output');
});

// ─── Results ──────────────────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(62));
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log('═'.repeat(62) + '\n');
process.exit(failed > 0 ? 1 : 0);
