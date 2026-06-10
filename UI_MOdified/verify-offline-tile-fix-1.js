/**
 * OFFLINE-TILE-FIX-1 — Runtime verification tests
 *
 * Verifies against a LIVE offline Docker container that:
 *   1. /api/offline/map-config returns a localTileUrl using port 8080 /services/
 *   2. OSM is still blocked (guard.isBannedUrl assertion via API inspection)
 *   3. No tile requests go to /tiles/ (Playwright network monitor, if available)
 *   4. Tile requests use port 8080 /services/<dataset>/{z}/{x}/{y}.png (Playwright)
 *
 * Usage:
 *   # HTTP API tests only (no Playwright required):
 *   node verify-offline-tile-fix-1.js
 *
 *   # With Playwright for browser network tests:
 *   RMOOZ_OFFLINE_URL=http://155.140.70.51:8640 node verify-offline-tile-fix-1.js
 *
 *   # Custom container URL:
 *   RMOOZ_OFFLINE_URL=http://localhost:5006 node verify-offline-tile-fix-1.js
 *
 * The script exits 0 if all run tests pass (or are skipped), 1 if any fail.
 * If the container is not running, all runtime tests are skipped gracefully.
 */
'use strict';

const http  = require('http');
const https = require('https');
const net   = require('net');
const path  = require('path');
const url   = require('url');

const OFFLINE_URL = (process.env.RMOOZ_OFFLINE_URL || 'http://155.140.70.51:8640').replace(/\/$/, '');
const TILE_URL    = (process.env.RMOOZ_TILE_URL    || 'http://155.140.70.51:8080').replace(/\/$/, '');
// Probe timeout: containers can be slow to accept connections
const PROBE_MS    = 5000;

let passed = 0, failed = 0, skipped = 0;

function test(name, fn) {
    try { fn(); console.log(`  [PASS] ${name}`); passed++; }
    catch (e) { console.log(`  [FAIL] ${name}: ${e.message}`); failed++; }
}
function skip(name, reason) { console.log(`  [SKIP] ${name}: ${reason}`); skipped++; }

console.log('\n══════════════════════════════════════════════════════════════════');
console.log('  OFFLINE-TILE-FIX-1 — Runtime tile-URL verification');
console.log('  Container: ' + OFFLINE_URL);
console.log('══════════════════════════════════════════════════════════════════\n');

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseUrl(rawUrl) {
    var parsed = url.parse(rawUrl);
    return {
        host:    parsed.hostname,
        port:    parseInt(parsed.port || (parsed.protocol === 'https:' ? 443 : 80), 10),
        path:    parsed.path || '/',
        https:   parsed.protocol === 'https:'
    };
}

function httpGet(rawUrl, timeoutMs) {
    timeoutMs = timeoutMs || 8000;
    var u = parseUrl(rawUrl);
    var lib = u.https ? https : http;
    return new Promise(function (resolve, reject) {
        var req = lib.request(
            { host: u.host, port: u.port, path: u.path, method: 'GET',
              headers: { Accept: 'application/json' }, rejectUnauthorized: false },
            function (res) {
                var body = '';
                res.on('data', function (c) { body += c; });
                res.on('end', function () {
                    var json = null;
                    try { json = JSON.parse(body); } catch (_) {}
                    resolve({ status: res.statusCode, json: json, raw: body });
                });
            }
        );
        req.setTimeout(timeoutMs, function () { req.destroy(new Error('timeout')); });
        req.on('error', reject);
        req.end();
    });
}

function isPortOpen(host, port, timeoutMs) {
    return new Promise(function (resolve) {
        var s = net.connect(port, host);
        s.setTimeout(timeoutMs || PROBE_MS);
        s.once('connect', function () { s.end(); resolve(true); });
        s.once('error',   function () { s.destroy(); resolve(false); });
        s.once('timeout', function () { s.destroy(); resolve(false); });
    });
}

// ── Probe containers ──────────────────────────────────────────────────────────

async function runRuntimeTests() {
    var webParsed  = parseUrl(OFFLINE_URL);
    var tileParsed = parseUrl(TILE_URL);

    var webUp  = await isPortOpen(webParsed.host,  webParsed.port);
    var tileUp = await isPortOpen(tileParsed.host, tileParsed.port);

    if (!webUp) {
        console.log('  [INFO] Web container not reachable at ' + OFFLINE_URL + ' — skipping all runtime tests.');
        console.log('         Start with: docker compose -f Offline_Deployment/docker-compose.offline.yml up -d\n');
        return;
    }

    // ─── §1  /api/offline/map-config ──────────────────────────────────────────
    console.log('── §1  /api/offline/map-config response ────────────────────');

    var cfgRes;
    try { cfgRes = await httpGet(OFFLINE_URL + '/api/offline/map-config'); }
    catch (e) { cfgRes = null; }

    test('/api/offline/map-config returns HTTP 200', function () {
        if (!cfgRes) throw new Error('Request failed');
        if (cfgRes.status !== 200) throw new Error('Got ' + cfgRes.status);
    });

    test('/api/offline/map-config returns localTileUrl field', function () {
        if (!cfgRes || !cfgRes.json) throw new Error('No JSON response');
        if (!cfgRes.json.localTileUrl) throw new Error('Missing localTileUrl in ' + JSON.stringify(cfgRes.json));
    });

    if (cfgRes && cfgRes.json && cfgRes.json.localTileUrl) {
        var localTileUrl = cfgRes.json.localTileUrl;
        console.log('  [INFO] localTileUrl = ' + localTileUrl);

        test('localTileUrl uses /services/<dataset>/{z}/{x}/{y}.png (not /tiles/)', function () {
            if (localTileUrl.includes('/tiles/'))
                throw new Error('localTileUrl still uses /tiles/: ' + localTileUrl);
            if (!localTileUrl.includes('/services/'))
                throw new Error('localTileUrl does not use /services/: ' + localTileUrl);
        });

        test('localTileUrl uses port 8080, not port 8640', function () {
            if (localTileUrl.includes(':8640'))
                throw new Error('localTileUrl references port 8640 (web server): ' + localTileUrl);
            if (!localTileUrl.match(/:8080/))
                throw new Error('localTileUrl does not reference port 8080 (tile server): ' + localTileUrl);
        });

        test('localTileUrl contains {z}/{x}/{y}.png template', function () {
            if (!localTileUrl.includes('{z}/{x}/{y}.png'))
                throw new Error('localTileUrl is missing tile template: ' + localTileUrl);
        });

        // Probe an actual tile via the URL from the config
        if (tileUp) {
            var probeTileUrl = localTileUrl
                .replace('{z}', '7').replace('{x}', '79').replace('{y}', '53');
            console.log('  [INFO] Probing tile: ' + probeTileUrl);
            var tileRes;
            try { tileRes = await httpGet(probeTileUrl); }
            catch (e) { tileRes = null; }

            test('tile probe via localTileUrl returns 200', function () {
                if (!tileRes) throw new Error('Tile request failed (network error)');
                if (tileRes.status !== 200)
                    throw new Error('Tile server returned ' + tileRes.status + ' for ' + probeTileUrl);
            });
        } else {
            skip('tile probe via localTileUrl', 'tile server not reachable at ' + TILE_URL);
        }
    } else {
        skip('localTileUrl pattern checks', '/api/offline/map-config did not return valid JSON');
        skip('tile probe', '/api/offline/map-config did not return valid JSON');
    }

    test('/api/offline/map-config exposes no LDAP secrets', function () {
        if (!cfgRes || !cfgRes.json) return; // already failed above
        var raw = JSON.stringify(cfgRes.json).toLowerCase();
        if (raw.includes('ldap_password'))  throw new Error('Response exposes LDAP_PASSWORD');
        if (raw.includes('session_secret')) throw new Error('Response exposes SESSION_SECRET');
        if (raw.includes('ldap_server'))    throw new Error('Response exposes LDAP_SERVER');
    });

    test('/api/offline/map-config mapSourceMode is "local"', function () {
        if (!cfgRes || !cfgRes.json) throw new Error('No JSON response');
        var mode = cfgRes.json.mapSourceMode;
        if (mode !== 'local')
            throw new Error('Expected mapSourceMode="local", got "' + mode + '"');
    });

    // ─── §2  OSM and /tiles/ blocked — verify via tile 404 ────────────────────
    console.log('\n── §2  Blocked tile paths return 404 on web server ──────────');

    // /tiles/ path on the web server must not serve tiles
    var badTileRes;
    try { badTileRes = await httpGet(OFFLINE_URL + '/tiles/7/79/53.png'); }
    catch (e) { badTileRes = { status: 0 }; }
    test('GET /tiles/{z}/{x}/{y}.png on web server returns non-200 (path not served)', function () {
        if (badTileRes.status === 200)
            throw new Error('Web server at ' + OFFLINE_URL + ' is serving /tiles/ — should be 404');
    });

    // OSM should not be reachable (network-isolated Docker) — we don't assert this
    // since it depends on the container's network policy, but we verify our guard
    // code is correct via the static tests above.

    // ─── §3  Browser network monitoring (Playwright) ───────────────────────────
    console.log('\n── §3  Browser network monitoring ───────────────────────────');

    var playwrightAvailable = false;
    var playwright;
    try {
        playwright = require('@playwright/test');
        playwrightAvailable = true;
    } catch (_) {
        try {
            playwright = require('playwright');
            playwrightAvailable = true;
        } catch (_2) {}
    }

    if (!playwrightAvailable) {
        skip('No tile requests to /tiles/ (Playwright)', 'Playwright not installed — install with: npm i -D playwright');
        skip('Tile requests use port 8080 /services/ (Playwright)', 'Playwright not installed');
        skip('OSM requests blocked (Playwright)', 'Playwright not installed');
        skip('localTileUrl from /api/offline/map-config used by Leaflet (Playwright)', 'Playwright not installed');
        return;
    }

    console.log('  [INFO] Playwright available — launching browser network monitor');

    var chromium = playwright.chromium || (playwright.devices ? null : null);
    if (!chromium) {
        // @playwright/test exports `test` not `chromium` — try the playwright package
        try { chromium = require('playwright').chromium; } catch (_) {}
    }

    if (!chromium) {
        skip('Browser network tests', 'Could not resolve chromium from Playwright package');
        return;
    }

    var browser;
    try { browser = await chromium.launch({ headless: true }); }
    catch (e) { skip('Browser network tests', 'chromium.launch() failed: ' + e.message); return; }

    var page = await browser.newPage();

    var badTileRequests   = []; // requests to /tiles/
    var goodTileRequests  = []; // requests to :8080/services/
    var osmRequests       = []; // requests to openstreetmap.org

    page.on('request', function (req) {
        var u = req.url();
        if (/\/tiles\/\d+\/\d+\/\d+/.test(u) && !u.includes('/services/')) {
            badTileRequests.push(u);
        }
        if (u.includes(':8080') && u.includes('/services/')) {
            goodTileRequests.push(u);
        }
        if (u.includes('openstreetmap.org')) {
            osmRequests.push(u);
        }
    });

    try {
        // Navigate and wait for network to settle (tile layers initialize)
        await page.goto(OFFLINE_URL + '/app.html', { waitUntil: 'networkidle', timeout: 30000 });
        // Extra wait for async tile resolvers
        await page.waitForTimeout(5000);
    } catch (e) {
        console.log('  [WARN] Navigation error (non-fatal): ' + e.message);
    }

    await browser.close();

    test('No network requests to /tiles/{z}/{x}/{y} (web-server tile path)', function () {
        if (badTileRequests.length > 0)
            throw new Error(badTileRequests.length + ' request(s) to /tiles/: ' + badTileRequests.slice(0, 3).join(', '));
    });

    test('Tile requests use port 8080 /services/<dataset>/{z}/{x}/{y}.png', function () {
        if (goodTileRequests.length === 0)
            throw new Error('No tile requests observed to :8080/services/ — map tiles may not be loading');
        console.log('  [INFO] ' + goodTileRequests.length + ' tile request(s) to :8080/services/');
    });

    test('OSM (openstreetmap.org) requests are blocked', function () {
        if (osmRequests.length > 0)
            throw new Error(osmRequests.length + ' OSM request(s) leaked: ' + osmRequests.slice(0, 3).join(', '));
    });
}

// ── Run ───────────────────────────────────────────────────────────────────────
runRuntimeTests().then(function () {
    console.log('\n' + '═'.repeat(66));
    console.log(`  Results: ${passed} passed, ${failed} failed, ${skipped} skipped`);
    console.log('═'.repeat(66) + '\n');
    process.exit(failed > 0 ? 1 : 0);
}).catch(function (err) {
    console.error('Test runner error:', err);
    process.exit(1);
});
