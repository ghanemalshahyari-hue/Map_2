/**
 * OFFLINE-TILE-FIX-1 — Static tests
 *
 * Verifies that the offline frontend has no active /tiles/{z}/{x}/{y}.png
 * fallback URL, that the Leaflet tile guard and patch scripts block the
 * relative/absolute /tiles/ pattern, and that the guard correctly handles
 * placeholder data: URIs left by synchronous interception.
 *
 * No Docker or running server required.
 * Usage: node test-offline-tile-fix-1.js
 */
'use strict';

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');

const ROOT = __dirname;
const OD   = path.join(ROOT, 'Offline_Deployment');
const OA   = path.join(OD, 'offline_app');

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); console.log(`  [PASS] ${name}`); passed++; }
    catch (e) { console.log(`  [FAIL] ${name}: ${e.message}`); failed++; }
}

console.log('\n══════════════════════════════════════════════════════════════════');
console.log('  OFFLINE-TILE-FIX-1 — Static tile-URL guard tests');
console.log('══════════════════════════════════════════════════════════════════\n');

// ─── §1  offline-leaflet-tile-guard.js ────────────────────────────────────────
console.log('── §1  offline-leaflet-tile-guard.js ──────────────────────────');

const guardPath = path.join(OA, 'client', 'offline-leaflet-tile-guard.js');
const guardSrc  = fs.readFileSync(guardPath, 'utf8');

test('guard file exists', () => {
    assert.ok(fs.existsSync(guardPath));
});

test('isBannedUrl blocks openstreetmap.org', () => {
    assert.ok(guardSrc.includes('openstreetmap.org'),
        'isBannedUrl must include openstreetmap.org check');
});

test('isBannedUrl blocks localhost:8080/services/', () => {
    assert.ok(guardSrc.includes('localhost:8080') && guardSrc.includes('/services/'),
        'isBannedUrl must include localhost:8080 + /services/ check');
});

test('isBannedUrl blocks /tiles/ template URLs (absolute path)', () => {
    assert.ok(guardSrc.includes('/tiles/'),
        'isBannedUrl must include /tiles/ pattern to catch absolute tile paths');
});

test('isBannedUrl blocks relative tiles/ template URLs (startsWith check)', () => {
    assert.ok(guardSrc.includes("startsWith('tiles/')") || guardSrc.includes('startsWith("tiles/")'),
        'isBannedUrl must check startsWith("tiles/") for relative URLs like tiles/{z}/{x}/{y}.png');
});

test('isBannedUrl checks {z} to avoid false positives on non-template /tiles/ paths', () => {
    assert.ok(guardSrc.includes('{z}') || guardSrc.includes("'{z}'"),
        'isBannedUrl must include {z} check to limit matching to tile URL templates');
});

test('patchExistingLayers catches PLACEHOLDER_TILE (data: URI)', () => {
    // Guard uses the negation form: "if (!isBannedUrl(u) && u !== PLACEHOLDER_TILE) return"
    // which is logically equivalent to matching when url is banned OR equals PLACEHOLDER_TILE.
    assert.ok(guardSrc.includes('PLACEHOLDER_TILE') && guardSrc.includes('!== PLACEHOLDER_TILE'),
        'patchExistingLayers must compare layer._url against PLACEHOLDER_TILE (uses !== form in guard)');
});

test('patchExistingLayers uses setUrl() in preference to remove+add', () => {
    assert.ok(guardSrc.includes('setUrl'),
        'patchExistingLayers must call layer.setUrl() to preserve layer references');
});

test('guard does not hardcode port 8640', () => {
    assert.ok(!guardSrc.includes('8640'),
        'Guard must not hardcode the web-server port 8640 — tile URL comes from /api/offline/map-config');
});

test('guard does not hardcode a real deployment IP', () => {
    // The guard must resolve the tile URL dynamically (from /api/offline/map-config
    // via __RMOOZ_OFFLINE_MAP__), never bake in a site IP. Scan for any IPv4
    // literal that is not loopback / RFC-5737 documentation.
    const ips = (guardSrc.match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g) || [])
        .filter(ip => ip !== '127.0.0.1' &&
            !/^(?:192\.0\.2\.|198\.51\.100\.|203\.0\.113\.)\d{1,3}$/.test(ip));
    assert.strictEqual(ips.length, 0,
        'Guard must not hardcode a deployment IP (tile URL comes from /api/offline/map-config); found: ' + ips.join(', '));
});

test('guard resolves real URL from __RMOOZ_OFFLINE_MAP__.activeTileUrl', () => {
    assert.ok(guardSrc.includes('__RMOOZ_OFFLINE_MAP__') && guardSrc.includes('activeTileUrl'),
        'Guard must read activeTileUrl from window.__RMOOZ_OFFLINE_MAP__');
});

test('guard falls back to fetching /api/offline/map-config directly', () => {
    assert.ok(guardSrc.includes('/api/offline/map-config'),
        'Guard must have a direct fetch fallback to /api/offline/map-config');
});

// ─── §2  offline-map-patch.js ─────────────────────────────────────────────────
console.log('\n── §2  offline-map-patch.js ────────────────────────────────────');

const patchPath = path.join(OA, 'client', 'offline-map-patch.js');
const patchSrc  = fs.readFileSync(patchPath, 'utf8');

test('offline-map-patch.js exists', () => {
    assert.ok(fs.existsSync(patchPath));
});

test('patch isBannedUrl blocks /tiles/ template URLs', () => {
    assert.ok(patchSrc.includes('/tiles/'),
        'offline-map-patch.js isBannedUrl must include /tiles/ pattern');
});

test('patch isBannedUrl blocks relative tiles/ URLs', () => {
    assert.ok(patchSrc.includes("startsWith('tiles/')") || patchSrc.includes('startsWith("tiles/")'),
        'offline-map-patch.js isBannedUrl must check startsWith("tiles/")');
});

test('patchMap catches data: placeholder URLs', () => {
    assert.ok(patchSrc.includes("startsWith('data:')") || patchSrc.includes('startsWith("data:")'),
        'patchMap must catch layers whose _url starts with "data:" (guard placeholder)');
});

test('patchMap uses setUrl() in preference to remove+add', () => {
    assert.ok(patchSrc.includes('setUrl'),
        'patchMap must call layer.setUrl() to preserve layer references');
});

test('patch does not hardcode port 8640', () => {
    assert.ok(!patchSrc.includes('8640'),
        'offline-map-patch.js must not hardcode port 8640');
});

// ─── §3  offline app.html load order ─────────────────────────────────────────
console.log('\n── §3  offline_app/client/app.html load order ──────────────────');

const appHtmlPath = path.join(OA, 'client', 'app.html');
const appHtml     = fs.readFileSync(appHtmlPath, 'utf8');

test('app.html includes offline-leaflet-tile-guard.js', () => {
    assert.ok(appHtml.includes('offline-leaflet-tile-guard.js'),
        'app.html must load offline-leaflet-tile-guard.js');
});

test('guard is loaded before app.js in app.html', () => {
    const guardIdx = appHtml.indexOf('offline-leaflet-tile-guard.js');
    const appJsIdx = appHtml.indexOf('"app.js');
    assert.ok(guardIdx > 0 && appJsIdx > 0 && guardIdx < appJsIdx,
        'offline-leaflet-tile-guard.js must appear before app.js in app.html');
});

test('guard is loaded after leaflet.js in app.html', () => {
    const leafletIdx = appHtml.indexOf('leaflet.js');
    const guardIdx   = appHtml.indexOf('offline-leaflet-tile-guard.js');
    assert.ok(leafletIdx > 0 && guardIdx > 0 && leafletIdx < guardIdx,
        'offline-leaflet-tile-guard.js must appear after leaflet.js');
});

test('offline-map-source.js is loaded in <head> before any tile layer creation', () => {
    const headEnd   = appHtml.indexOf('</head>');
    const srcIdx    = appHtml.indexOf('offline-map-source.js');
    assert.ok(srcIdx > 0 && srcIdx < headEnd,
        'offline-map-source.js must be in <head> so it resolves the tile URL before app.js fires');
});

test('app.html includes offline-map-patch.js', () => {
    assert.ok(appHtml.includes('offline-map-patch.js'),
        'app.html must load offline-map-patch.js');
});

test('offline-map-patch.js is loaded after app.js in app.html', () => {
    const appJsIdx  = appHtml.indexOf('"app.js');
    const patchIdx  = appHtml.indexOf('offline-map-patch.js');
    assert.ok(appJsIdx > 0 && patchIdx > 0 && patchIdx > appJsIdx,
        'offline-map-patch.js must appear after app.js in app.html');
});

// ─── §4  No active /tiles/ fallback in offline frontend sources ───────────────
console.log('\n── §4  No active /tiles/ fallback in offline client sources ────');

// The only legitimate occurrence of tiles/{z} in offline client code should
// be inside isBannedUrl() as the *pattern to block*, not as an active URL.
function countActiveTileTemplates(src, filename) {
    // Remove single-line comments
    var noComments = src.replace(/\/\/.*/g, '');
    // Remove string occurrences that are inside isBannedUrl or test assertions
    // Look for tileLayer('tiles/ or tileLayer("/tiles/ outside of the banned-url checks
    var matches = [];
    var re = /L\.tileLayer\s*\(\s*['"`]([^'"`]*\/tiles\/[^'"`]*\{z\}[^'"`]*)['"`]/g;
    var m;
    while ((m = re.exec(noComments)) !== null) {
        matches.push(m[1]);
    }
    return matches;
}

const offlineClientDir = path.join(OA, 'client');
function walkJs(dir) {
    var files = [];
    fs.readdirSync(dir).forEach(function (name) {
        var full = path.join(dir, name);
        if (fs.statSync(full).isDirectory()) {
            files = files.concat(walkJs(full));
        } else if (name.endsWith('.js')) {
            files.push(full);
        }
    });
    return files;
}

test('no offline client JS file calls L.tileLayer with a /tiles/{z} URL', () => {
    var violations = [];
    walkJs(offlineClientDir).forEach(function (file) {
        var src = fs.readFileSync(file, 'utf8');
        var hits = countActiveTileTemplates(src, file);
        if (hits.length > 0) {
            violations.push(path.relative(offlineClientDir, file) + ': ' + hits.join(', '));
        }
    });
    assert.strictEqual(violations.length, 0,
        'Active /tiles/{z} tileLayer calls found:\n  ' + violations.join('\n  '));
});

test('offline-map-source.js DEFAULTS.localTileUrl is not a /tiles/ path', () => {
    const srcPath = path.join(OA, 'client', 'wargame', 'offline-map-source.js');
    const src = fs.readFileSync(srcPath, 'utf8');
    // The default was /offline-tiles/{z}/{x}/{y}.png which is served from the
    // container; it must NOT be the web-server /tiles/ path
    assert.ok(!src.match(/localTileUrl\s*:\s*['"]\/tiles\//),
        'offline-map-source.js DEFAULTS.localTileUrl must not be /tiles/');
});

// ─── §5  Dockerfile copies both guard files ────────────────────────────────────
console.log('\n── §5  Dockerfile.offline copies guard files ───────────────────');

const dockerfilePath = path.join(OD, 'Dockerfile.offline');
const dockerSrc      = fs.readFileSync(dockerfilePath, 'utf8');

test('Dockerfile COPYs offline-leaflet-tile-guard.js', () => {
    assert.ok(dockerSrc.includes('offline-leaflet-tile-guard.js'),
        'Dockerfile must COPY offline-leaflet-tile-guard.js into the image');
});

test('Dockerfile COPYs offline-map-patch.js', () => {
    assert.ok(dockerSrc.includes('offline-map-patch.js'),
        'Dockerfile must COPY offline-map-patch.js into the image');
});

test('Dockerfile COPYs offline-map-source.js', () => {
    assert.ok(dockerSrc.includes('offline-map-source.js'),
        'Dockerfile must COPY offline-map-source.js into the image');
});

// ─── §6  offline-map-config.js builds localTileUrl from env vars ──────────────
console.log('\n── §6  offline-map-config.js tile URL construction ─────────────');

const cfgPath = path.join(OA, 'server', 'offline-map-config.js');
const cfgSrc  = fs.readFileSync(cfgPath, 'utf8');

test('offline-map-config.js uses TILE_PUBLIC_BASE_URL to build localTileUrl', () => {
    assert.ok(cfgSrc.includes('TILE_PUBLIC_BASE_URL') && cfgSrc.includes('localTileUrl'),
        'Must derive localTileUrl from TILE_PUBLIC_BASE_URL env var');
});

test('offline-map-config.js builds /services/<dataset>/{z}/{x}/{y}.png pattern', () => {
    assert.ok(cfgSrc.includes('/services/') && cfgSrc.includes('{z}/{x}/{y}.png'),
        'localTileUrl must be built with /services/<dataset>/{z}/{x}/{y}.png pattern');
});

test('offline-map-config.js does not hardcode /tiles/ as localTileUrl', () => {
    // The /tiles/ path must not appear as the primary localTileUrl value
    var noComments = cfgSrc.replace(/\/\/.*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(!noComments.match(/localTileUrl\s*=\s*['"][^'"]*\/tiles\//),
        'localTileUrl must not be hardcoded to a /tiles/ path');
});

test('offline-map-config.js does not hardcode port 8640 in a URL (comments are OK)', () => {
    // Strip single-line comments before checking so doc-comments mentioning
    // the deployment port for context do not trigger the assertion.
    var noComments = cfgSrc.replace(/\/\/.*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(!noComments.match(/:8640\b/),
        'offline-map-config.js must not hardcode port 8640 in executable code');
});

// ─── Results ──────────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(66));
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log('═'.repeat(66) + '\n');
process.exit(failed > 0 ? 1 : 0);
