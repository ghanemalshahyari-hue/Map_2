/**
 * OFFLINE-RUNTIME-FIX-4 — Remote-browser runtime fix tests
 *
 * Static tests. No Docker required.
 * Usage: node test-offline-runtime-fix-4.js
 */
'use strict';

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');
const http   = require('http');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const OD   = path.join(ROOT, 'Offline_Deployment');
const OA   = path.join(OD, 'offline_app');

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); console.log(`  [PASS] ${name}`); passed++; }
    catch (e) { console.log(`  [FAIL] ${name}: ${e.message}`); failed++; }
}
function skip(name, reason) { console.log(`  [SKIP] ${name}: ${reason}`); }

console.log('\n══════════════════════════════════════════════════════════════════');
console.log('  OFFLINE-RUNTIME-FIX-4 — Remote-browser runtime tests');
console.log('══════════════════════════════════════════════════════════════════\n');

// ─── §1  Leaflet tile guard ───────────────────────────────────────────────────
console.log('── §1  offline-leaflet-tile-guard.js ───────────────────────────');

const guardPath = path.join(OA, 'client', 'offline-leaflet-tile-guard.js');
const guardSrc  = fs.readFileSync(guardPath, 'utf8');

test('offline-leaflet-tile-guard.js exists', () => {
    assert.ok(fs.existsSync(guardPath));
});
test('guard blocks openstreetmap.org URLs', () => {
    assert.ok(guardSrc.includes('openstreetmap.org'));
});
test('guard blocks localhost:8080/services/', () => {
    assert.ok(guardSrc.includes('localhost:8080') && guardSrc.includes('/services/'));
});
test('guard patches L.tileLayer globally', () => {
    assert.ok(guardSrc.includes('L.tileLayer') && guardSrc.includes('installGuard'));
});
test('guard waits for __RMOOZ_OFFLINE_MAP__.activeTileUrl', () => {
    assert.ok(guardSrc.includes('__RMOOZ_OFFLINE_MAP__') && guardSrc.includes('activeTileUrl'));
});

// ─── §2  offline-map-source.js ────────────────────────────────────────────────
console.log('\n── §2  offline-map-source.js ───────────────────────────────────');

const mapSrc = fs.readFileSync(
    path.join(OA, 'client', 'wargame', 'offline-map-source.js'), 'utf8'
);
test('offline-map-source.js fetches /api/offline/map-config', () => {
    assert.ok(mapSrc.includes('/api/offline/map-config'));
});
test('offline-map-source.js exposes window.OfflineMapSource', () => {
    assert.ok(mapSrc.includes('OfflineMapSource'));
});

// ─── §3  offline-map-config.js ────────────────────────────────────────────────
console.log('\n── §3  offline-map-config.js — TILE_PUBLIC_BASE_URL ────────────');

const cfgSrc = fs.readFileSync(
    path.join(OA, 'server', 'offline-map-config.js'), 'utf8'
);
test('offline-map-config.js reads TILE_PUBLIC_BASE_URL', () => {
    assert.ok(cfgSrc.includes('TILE_PUBLIC_BASE_URL'));
});
test('offline-map-config.js builds localTileUrl from TILE_PUBLIC_BASE_URL', () => {
    assert.ok(cfgSrc.includes('tilePublicBase') && cfgSrc.includes('localTileUrl'));
});
test('offline-map-config.js does not expose LDAP or session secrets', () => {
    assert.ok(!cfgSrc.includes('SESSION_SECRET') && !cfgSrc.includes('LDAP_PASSWORD'));
});
test('offline-map-config.js returns healthcheckUrl field', () => {
    assert.ok(cfgSrc.includes('healthcheckUrl'));
});

// ─── §4  scenario-import-wizard.js overlay ────────────────────────────────────
console.log('\n── §4  scenario-import-wizard.js overlay ───────────────────────');

const wizardPath = path.join(OA, 'client', 'shell', 'scenario-import-wizard.js');
const wizardSrc  = fs.readFileSync(wizardPath, 'utf8');

test('offline_app/client/shell/scenario-import-wizard.js exists', () => {
    assert.ok(fs.existsSync(wizardPath));
});
test('scenario-import-wizard overlay has no openstreetmap.org tile URL', () => {
    assert.ok(!wizardSrc.includes('tile.openstreetmap.org'),
        'Wizard must not reference OSM tile server');
});
test('scenario-import-wizard uses __RMOOZ_OFFLINE_MAP__.activeTileUrl', () => {
    assert.ok(wizardSrc.includes('__RMOOZ_OFFLINE_MAP__') || wizardSrc.includes('about:blank'),
        'Wizard must use offline tile URL or blank placeholder');
});

// ─── §5  app.html script loading order ───────────────────────────────────────
console.log('\n── §5  app.html script order ───────────────────────────────────');

const appHtml = fs.readFileSync(path.join(OA, 'client', 'app.html'), 'utf8');

test('app.html loads offline-leaflet-tile-guard.js after leaflet.js', () => {
    const leafletIdx = appHtml.indexOf('leaflet.js');
    const guardIdx   = appHtml.indexOf('offline-leaflet-tile-guard.js');
    assert.ok(guardIdx > leafletIdx && leafletIdx > -1, 'Guard must come after Leaflet');
});
test('app.html loads offline-map-patch.js at end of body', () => {
    const patchIdx = appHtml.indexOf('offline-map-patch.js');
    const bodyEnd  = appHtml.lastIndexOf('</body>');
    assert.ok(patchIdx > -1 && patchIdx < bodyEnd, 'Patch must be before </body>');
});
test('app.html scenario-import-wizard.js has ?v=offline-fix4 cache-bust', () => {
    assert.ok(appHtml.includes('scenario-import-wizard.js?v=offline-fix4'));
});
test('app.html offline-map-patch.js has cache-bust', () => {
    assert.ok(appHtml.includes('offline-map-patch.js?v=offline-fix4'));
});

// ─── §6  Brand logo ───────────────────────────────────────────────────────────
console.log('\n── §6  Brand logo ──────────────────────────────────────────────');

test('offline_app/client/assets/brand-logo.jpeg exists', () => {
    const p = path.join(OA, 'client', 'assets', 'brand-logo.jpeg');
    assert.ok(fs.existsSync(p), 'brand-logo.jpeg must be in offline_app/client/assets/');
    const sz = fs.statSync(p).size;
    assert.ok(sz > 100000, `brand-logo.jpeg too small (${sz} bytes) — may be empty`);
});
test('Dockerfile copies offline_app/client/assets/ (covers brand logo)', () => {
    const df = fs.readFileSync(path.join(OD, 'Dockerfile.offline'), 'utf8');
    assert.ok(df.includes('offline_app/client/assets/'), 'Dockerfile must COPY client/assets/');
});

// ─── §7  obstacle.geojson ────────────────────────────────────────────────────
console.log('\n── §7  obstacle.geojson ────────────────────────────────────────');

const obstacleStaged = path.join(OD, 'map_data', 'base', 'obstacle.geojson');
test('obstacle.geojson staged in map_data/base/', () => {
    assert.ok(fs.existsSync(obstacleStaged), 'obstacle.geojson must be in map_data/base/');
    const j = JSON.parse(fs.readFileSync(obstacleStaged, 'utf8'));
    assert.ok(j.type === 'FeatureCollection', 'Must be a valid GeoJSON FeatureCollection');
});

// ─── §8  Port / public URL config ────────────────────────────────────────────
console.log('\n── §8  Port and public URL config ──────────────────────────────');

const compose  = fs.readFileSync(path.join(OD, 'docker-compose.offline.yml'), 'utf8');
const envEx    = fs.readFileSync(path.join(OD, '.env.offline.example'), 'utf8');

test('compose uses WEB_PUBLIC_PORT for host port (not hardcoded 5006)', () => {
    assert.ok(compose.includes('WEB_PUBLIC_PORT'), 'compose must use WEB_PUBLIC_PORT');
});
test('compose maps host WEB_PUBLIC_PORT to container port 5006', () => {
    assert.ok(compose.includes('WEB_PUBLIC_PORT:-5006}:5006'), 'Must map to container 5006');
});
test('.env.offline.example has WEB_PUBLIC_PORT', () => {
    assert.ok(envEx.includes('WEB_PUBLIC_PORT'));
});
test('.env.offline.example has TILE_PUBLIC_BASE_URL', () => {
    assert.ok(envEx.includes('TILE_PUBLIC_BASE_URL'));
});
test('.env.offline.example has WEB_PUBLIC_BASE_URL', () => {
    assert.ok(envEx.includes('WEB_PUBLIC_BASE_URL'));
});
test('.env.offline.example does not hardcode a real API key', () => {
    const apiKeyLine = envEx.split('\n').find(l => l.startsWith('RMOOZ_AI_API_KEY='));
    if (apiKeyLine) {
        const val = apiKeyLine.split('=').slice(1).join('=');
        assert.ok(val.includes('<') || val.trim() === '' || val.includes('env-offline-only'),
            'RMOOZ_AI_API_KEY must be a placeholder in .env.offline.example, not a real key');
    }
});

// ─── §9  LiteLLM support ─────────────────────────────────────────────────────
console.log('\n── §9  LiteLLM / AI endpoint config ────────────────────────────');

test('.env.offline.example has RMOOZ_AI_PROVIDER placeholder', () => {
    assert.ok(envEx.includes('RMOOZ_AI_PROVIDER'));
});
test('.env.offline.example has RMOOZ_AI_BASE_URL', () => {
    assert.ok(envEx.includes('RMOOZ_AI_BASE_URL'));
});
test('.env.offline.example has RMOOZ_AI_MODEL', () => {
    assert.ok(envEx.includes('RMOOZ_AI_MODEL'));
});
test('compose passes RMOOZ_AI_PROVIDER env var', () => {
    assert.ok(compose.includes('RMOOZ_AI_PROVIDER'));
});
test('compose passes RMOOZ_AI_BASE_URL', () => {
    assert.ok(compose.includes('RMOOZ_AI_BASE_URL'));
});
test('compose does NOT hardcode a real RMOOZ_AI_API_KEY value', () => {
    const line = compose.split('\n').find(l => l.includes('RMOOZ_AI_API_KEY'));
    if (line) {
        assert.ok(!line.match(/RMOOZ_AI_API_KEY.*=.*\w{20,}/), 'Must not contain a real key');
    }
});
test('offline web-server.js has /api/ai/config endpoint', () => {
    const ws = fs.readFileSync(path.join(OA, 'server', 'web-server.js'), 'utf8');
    assert.ok(ws.includes('/api/ai/config'), 'Must handle /api/ai/config');
});
test('offline web-server.js has /api/ai/health endpoint', () => {
    const ws = fs.readFileSync(path.join(OA, 'server', 'web-server.js'), 'utf8');
    assert.ok(ws.includes('/api/ai/health'), 'Must handle /api/ai/health');
});
test('/api/ai/config does not return RMOOZ_AI_API_KEY to browser', () => {
    const ws = fs.readFileSync(path.join(OA, 'server', 'web-server.js'), 'utf8');
    const cfgBlock = ws.slice(ws.indexOf('/api/ai/config'), ws.indexOf('/api/ai/health'));
    assert.ok(!cfgBlock.includes('RMOOZ_AI_API_KEY'),
        '/api/ai/config response must not include the API key');
});

// ─── §10 Dockerfile completeness ─────────────────────────────────────────────
console.log('\n── §10 Dockerfile completeness ─────────────────────────────────');

const df = fs.readFileSync(path.join(OD, 'Dockerfile.offline'), 'utf8');

test('Dockerfile copies offline-leaflet-tile-guard.js', () => {
    assert.ok(df.includes('offline-leaflet-tile-guard.js'));
});
test('Dockerfile copies scenario-import-wizard.js overlay', () => {
    assert.ok(df.includes('scenario-import-wizard.js') || df.includes('client/shell/'));
});
test('Dockerfile copies offline_app/client/assets/ (logo)', () => {
    assert.ok(df.includes('offline_app/client/assets/'));
});

// ─── §11 Main app untouched ───────────────────────────────────────────────────
console.log('\n── §11 Main app untouched ──────────────────────────────────────');

test('main client/shell/scenario-import-wizard.js still uses OSM (unchanged)', () => {
    const src = fs.readFileSync(
        path.join(ROOT, 'client', 'shell', 'scenario-import-wizard.js'), 'utf8'
    );
    assert.ok(src.includes('openstreetmap.org'),
        'Main app wizard must be unchanged — OSM is expected there');
});
test('main server/web-server.js has no handleOfflineApi call', () => {
    const src = fs.readFileSync(path.join(ROOT, 'server', 'web-server.js'), 'utf8');
    assert.ok(!src.includes('handleOfflineApi'));
});
test('main client/app.html has no offline-leaflet-tile-guard reference', () => {
    const src = fs.readFileSync(path.join(ROOT, 'client', 'app.html'), 'utf8');
    assert.ok(!src.includes('offline-leaflet-tile-guard'));
});

// ─── §12 Regression tests ────────────────────────────────────────────────────
console.log('\n── §12 Regression ──────────────────────────────────────────────');

function runFile(file) {
    return spawnSync(process.execPath, [file], {
        cwd: ROOT, env: process.env, timeout: 90000, encoding: 'utf8'
    });
}

test('test-offline-isolation-0.js still passes', () => {
    const r = runFile(path.join(ROOT, 'test-offline-isolation-0.js'));
    if (/\[FAIL\]/.test(r.stdout)) throw new Error(r.stdout.slice(-400));
    assert.ok(/\[PASS\]/.test(r.stdout) && (r.status ?? r.code) === 0);
});
test('test-offline-map-0.js still passes', () => {
    const r = runFile(path.join(ROOT, 'test-offline-map-0.js'));
    if (/\[FAIL\]/.test(r.stdout)) throw new Error(r.stdout.slice(-400));
    assert.ok(/\[PASS\]/.test(r.stdout) && (r.status ?? r.code) === 0);
});
test('test-offline-map-bundle-1.js still passes', () => {
    const r = runFile(path.join(ROOT, 'test-offline-map-bundle-1.js'));
    if (/\[FAIL\]/.test(r.stdout)) throw new Error(r.stdout.slice(-400));
    assert.ok(/\[PASS\]/.test(r.stdout) && (r.status ?? r.code) === 0);
});

// ─── §13 Runtime tests ────────────────────────────────────────────────────────
console.log('\n── §13 Runtime tests (require container) ───────────────────────');

async function runRuntimeTests() {
    const port = parseInt(process.env.TEST_WEB_PORT || '5006', 10);
    const host = process.env.TEST_HOST || '127.0.0.1';

    function get(urlPath, to = 5000) {
        return new Promise((resolve, reject) => {
            const req = http.get(`http://${host}:${port}${urlPath}`, res => {
                let b = ''; res.on('data', c => b += c);
                res.on('end', () => {
                    try { resolve({ status: res.statusCode, body: JSON.parse(b) }); }
                    catch { resolve({ status: res.statusCode, body: b }); }
                });
            });
            req.setTimeout(to, () => { req.destroy(); reject(new Error('timeout')); });
            req.on('error', reject);
        });
    }

    let up = false;
    try { await get('/'); up = true; } catch {}

    if (!up) {
        skip('Runtime tests', `Container not running on ${host}:${port}. Start and re-run.`);
        return;
    }

    const ta = async (name, fn) => {
        try { await fn(); console.log(`  [PASS] ${name}`); passed++; }
        catch (e) { console.log(`  [FAIL] ${name}: ${e.message}`); failed++; }
    };

    await ta('GET /api/offline/map-config → 200', async () => {
        const r = await get('/api/offline/map-config');
        assert.strictEqual(r.status, 200);
        assert.ok('localTileUrl' in r.body);
    });

    await ta('map-config.localTileUrl does not contain localhost when TILE_PUBLIC_BASE_URL set', async () => {
        const r = await get('/api/offline/map-config');
        if (process.env.TILE_PUBLIC_BASE_URL) {
            assert.ok(!r.body.localTileUrl.includes('localhost'),
                'With TILE_PUBLIC_BASE_URL set, localTileUrl must not use localhost');
        }
    });

    await ta('GET /api/ai/config → 200, no API key', async () => {
        const r = await get('/api/ai/config');
        assert.strictEqual(r.status, 200);
        assert.ok('provider' in r.body);
        assert.ok(!JSON.stringify(r.body).toLowerCase().includes('api_key'),
            'Response must not contain API key');
    });

    await ta('GET /api/ai/health → 200', async () => {
        const r = await get('/api/ai/health', 8000);
        assert.strictEqual(r.status, 200);
        assert.ok('ok' in r.body);
    });

    await ta('GET /assets/brand-logo.jpeg → 200', async () => {
        const r = await get('/assets/brand-logo.jpeg');
        assert.strictEqual(r.status, 200, `Expected 200, got ${r.status}`);
    });

    await ta('GET /maps/obstacle.geojson → 200', async () => {
        const r = await get('/maps/obstacle.geojson');
        assert.strictEqual(r.status, 200, `Expected 200, got ${r.status}`);
    });
}

runRuntimeTests().then(() => {
    console.log('\n' + '═'.repeat(66));
    console.log(`  Results: ${passed} passed, ${failed} failed`);
    console.log('═'.repeat(66) + '\n');
    process.exit(failed > 0 ? 1 : 0);
}).catch(e => { console.error(e); process.exit(1); });
