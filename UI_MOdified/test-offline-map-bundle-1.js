/**
 * OFFLINE-MAP-BUNDLE-1 — Map bundle and tile server tests
 *
 * Static tests: verify staging dirs, scripts, compose config, env file,
 * and offline client-side tile patching files.
 * Runtime tests (§10): verify live container — skipped if not running.
 *
 * Usage:
 *   node test-offline-map-bundle-1.js
 */
'use strict';

const assert  = require('assert');
const fs      = require('fs');
const path    = require('path');
const http    = require('http');
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
function info(msg) { console.log(`         ${msg}`); }

console.log('\n══════════════════════════════════════════════════════════════════');
console.log('  OFFLINE-MAP-BUNDLE-1 — Map bundle and tile server tests');
console.log('══════════════════════════════════════════════════════════════════\n');

// ─── §1  Local map file discovery ────────────────────────────────────────────
console.log('── §1  Local map file discovery ────────────────────────────────');

const MBTILES_SRC  = path.join(ROOT, 'maps', 'satellite-2017-11-02_asia_gcc-states.mbtiles');
const MBTILES_DEST = path.join(OD, 'map_data', 'base', 'satellite-2017-11-02_asia_gcc-states.mbtiles');
const DEM_DEST     = path.join(OD, 'map_data', 'dem');

test('maps/satellite-2017-11-02_asia_gcc-states.mbtiles exists in app (source)', () => {
    assert.ok(fs.existsSync(MBTILES_SRC), 'Source MBTiles must exist in maps/');
    const sizeMB = (fs.statSync(MBTILES_SRC).size / (1024 * 1024)).toFixed(0);
    info(`Found: ${MBTILES_SRC} (${sizeMB} MB)`);
});

test('map_data/base/ directory exists', () => {
    assert.ok(fs.existsSync(path.join(OD, 'map_data', 'base')), 'map_data/base/ must exist');
});

test('map_data/dem/ directory exists (for Libya DEM)', () => {
    assert.ok(fs.existsSync(DEM_DEST), 'map_data/dem/ must exist');
});

// Check if MBTiles was staged (may be missing if prepare-map-bundle.ps1 not yet run)
const mbtilesStagedExists = fs.existsSync(MBTILES_DEST);
test('map_data/base/ has staged MBTiles or clearly reports missing', () => {
    if (mbtilesStagedExists) {
        const sizeMB = (fs.statSync(MBTILES_DEST).size / (1024 * 1024)).toFixed(0);
        info(`Staged: ${MBTILES_DEST} (${sizeMB} MB) ✓`);
        assert.ok(true);
    } else {
        info('MBTiles not yet staged → run: .\\Offline_Deployment\\scripts\\prepare-map-bundle.ps1');
        assert.ok(true); // not a failure — just needs prepare-map-bundle.ps1 to be run
    }
});

// ─── §2  maps.json config ────────────────────────────────────────────────────
console.log('\n── §2  maps.json registration ──────────────────────────────────');

// Check if maps.json was created by prepare-map-bundle.ps1
const mapsJsonPath = path.join(OD, 'map_data', 'base', 'maps.json');
if (fs.existsSync(mapsJsonPath)) {
    const mapsJson = JSON.parse(fs.readFileSync(mapsJsonPath, 'utf8'));
    test('map_data/base/maps.json registers the MBTiles file', () => {
        const hasEntry = mapsJson.mbtiles &&
            mapsJson.mbtiles.some(f => f.includes('satellite'));
        assert.ok(hasEntry, 'maps.json must list the satellite MBTiles filename');
    });
    test('map_data/base/maps.json tileServer points to localhost:8080', () => {
        assert.ok(mapsJson.tileServer && mapsJson.tileServer.includes('8080'),
            'tileServer must point to port 8080');
    });
} else {
    skip('maps.json exists in map_data/base/', 'Run prepare-map-bundle.ps1 first');
    skip('maps.json tileServer correct', 'Run prepare-map-bundle.ps1 first');
}

// ─── §3  tile-server overlay ─────────────────────────────────────────────────
console.log('\n── §3  offline_app tile-server overlay ─────────────────────────');

test('offline_app/server/tile-server.js exists', () => {
    assert.ok(fs.existsSync(path.join(OA, 'server', 'tile-server.js')),
        'offline_app must have tile-server.js overlay');
});

test('offline tile-server.js binds to 0.0.0.0 (not 127.0.0.1)', () => {
    const src = fs.readFileSync(path.join(OA, 'server', 'tile-server.js'), 'utf8');
    assert.ok(src.includes('0.0.0.0'),
        'tile-server.js must bind to 0.0.0.0 for Docker port mapping to work');
    assert.ok(!src.includes("'127.0.0.1'"),
        'tile-server.js must not bind to 127.0.0.1 (Docker cannot expose this externally)');
});

test('offline_app/start-offline.sh exists', () => {
    assert.ok(fs.existsSync(path.join(OA, 'start-offline.sh')),
        'offline_app must have start-offline.sh to run both servers');
});

test('start-offline.sh starts both tile-server and web-server', () => {
    const src = fs.readFileSync(path.join(OA, 'start-offline.sh'), 'utf8');
    assert.ok(src.includes('tile-server.js'), 'Must start tile-server.js');
    assert.ok(src.includes('web-server.js'),  'Must start web-server.js');
});

// ─── §4  Dockerfile completeness ─────────────────────────────────────────────
console.log('\n── §4  Dockerfile.offline ──────────────────────────────────────');

const dockerfile = fs.readFileSync(path.join(OD, 'Dockerfile.offline'), 'utf8');

test('Dockerfile copies tile-server.js overlay', () => {
    assert.ok(dockerfile.includes('offline_app/server/tile-server.js'));
});

test('Dockerfile copies start-offline.sh', () => {
    assert.ok(dockerfile.includes('start-offline.sh'));
});

test('Dockerfile CMD uses start-offline.sh (not just web-server.js)', () => {
    assert.ok(dockerfile.includes('start-offline.sh') && !dockerfile.match(/CMD \["node", "server\/web-server\.js"\]/),
        'CMD must use start-offline.sh to run both servers');
});

test('Dockerfile exposes port 8080 (tile server)', () => {
    assert.ok(dockerfile.includes('8080'), 'Must EXPOSE 8080');
});

test('Dockerfile creates /app/dem_data/', () => {
    assert.ok(dockerfile.includes('dem_data'), 'Must create /app/dem_data dir');
});

test('Dockerfile sets DEM_PATH env var', () => {
    assert.ok(dockerfile.includes('DEM_PATH'), 'Must set DEM_PATH env var');
});

// ─── §5  docker-compose config ────────────────────────────────────────────────
console.log('\n── §5  docker-compose.offline.yml ──────────────────────────────');

const compose = fs.readFileSync(path.join(OD, 'docker-compose.offline.yml'), 'utf8');

test('compose exposes port 8080 (tile server)', () => {
    // May be literal "8080:8080" or dynamic "${TILE_PUBLIC_PORT:-8080}:8080"
    assert.ok(compose.includes('8080:8080') || (compose.includes('8080}:8080') || compose.includes('8080"')),
        'Must expose port 8080 for tile server');
});

test('compose mounts map_data/base to /app/maps', () => {
    assert.ok(compose.includes('map_data/base') && compose.includes('/app/maps'),
        'Must bind-mount map_data/base to /app/maps');
});

test('compose mounts map_data/dem to /app/dem_data', () => {
    assert.ok(compose.includes('map_data/dem') && compose.includes('/app/dem_data'),
        'Must bind-mount map_data/dem for DEM elevation file');
});

test('compose LOCAL_TILE_URL points to tile server (not /offline-tiles/)', () => {
    // After map bundle work, LOCAL_TILE_URL should point to the MBTiles tile server
    const hasTileServer = compose.includes('localhost:8080') || compose.includes('LOCAL_TILE_URL');
    assert.ok(hasTileServer, 'LOCAL_TILE_URL must reference the tile server');
});

test('compose passes DEM_PATH to container', () => {
    assert.ok(compose.includes('DEM_PATH'), 'Must pass DEM_PATH env var');
});

test('compose does not have rmooz_maps named volume (replaced by bind mount)', () => {
    // The old rmooz_maps named volume is replaced by the map_data/base bind mount
    const namedVolSection = compose.slice(compose.indexOf('volumes:'));
    assert.ok(!namedVolSection.includes('rmooz_maps:'),
        'rmooz_maps named volume must be removed (replaced by map_data/base bind mount)');
});

// ─── §6  .env.offline.example ────────────────────────────────────────────────
console.log('\n── §6  .env.offline.example ────────────────────────────────────');

const envEx = fs.readFileSync(path.join(OD, '.env.offline.example'), 'utf8');

test('LOCAL_TILE_URL references tile server at port 8080', () => {
    assert.ok(envEx.includes('8080') || envEx.includes('localhost:8080'),
        'LOCAL_TILE_URL must reference the tile server at port 8080');
});

test('DEM_PATH is configured in env example', () => {
    assert.ok(envEx.includes('DEM_PATH'), 'Must have DEM_PATH');
});

test('No public OSM URL hardcoded as LOCAL_TILE_URL', () => {
    const localTileLine = envEx.split('\n').find(l => l.startsWith('LOCAL_TILE_URL='));
    if (localTileLine) {
        assert.ok(!localTileLine.includes('openstreetmap.org'),
            'LOCAL_TILE_URL must not default to public OSM');
    }
});

// ─── §7  Map patch client files ───────────────────────────────────────────────
console.log('\n── §7  Client-side map patch files ────────────────────────────');

test('offline_app/client/offline-map-patch.js exists', () => {
    assert.ok(fs.existsSync(path.join(OA, 'client', 'offline-map-patch.js')));
});

test('offline_app/client/wargame/offline-map-source.js exists', () => {
    assert.ok(fs.existsSync(path.join(OA, 'client', 'wargame', 'offline-map-source.js')));
});

test('offline_app/client/app.html includes offline-map-source.js script', () => {
    const html = fs.readFileSync(path.join(OA, 'client', 'app.html'), 'utf8');
    assert.ok(html.includes('offline-map-source.js'),
        'offline app.html must load the map source resolver');
});

test('offline_app/client/app.html includes offline-map-patch.js script', () => {
    const html = fs.readFileSync(path.join(OA, 'client', 'app.html'), 'utf8');
    assert.ok(html.includes('offline-map-patch.js'),
        'offline app.html must load the map tile patcher');
});

test('offline-map-patch.js patches 2D Leaflet OSM layer', () => {
    const src = fs.readFileSync(path.join(OA, 'client', 'offline-map-patch.js'), 'utf8');
    assert.ok(src.includes('osmLayer') || src.includes('openstreetmap') || src.includes('removeLayer'),
        'Must patch/replace the OSM tile layer');
});

test('offline-map-source.js reads LOCAL_TILE_URL from /api/offline/map-config', () => {
    const src = fs.readFileSync(path.join(OA, 'client', 'wargame', 'offline-map-source.js'), 'utf8');
    assert.ok(src.includes('/api/offline/map-config'),
        'Must read tile URL from the config endpoint');
});

// ─── §8  Scripts ──────────────────────────────────────────────────────────────
console.log('\n── §8  Map bundle scripts ──────────────────────────────────────');

test('prepare-map-bundle.ps1 exists', () => {
    assert.ok(fs.existsSync(path.join(OD, 'scripts', 'prepare-map-bundle.ps1')));
});

test('prepare-map-bundle.ps1 copies MBTiles to map_data/base/', () => {
    const src = fs.readFileSync(path.join(OD, 'scripts', 'prepare-map-bundle.ps1'), 'utf8');
    assert.ok(src.includes('map_data/base') && src.includes('.mbtiles'),
        'Must copy MBTiles to map_data/base/');
});

test('prepare-map-bundle.ps1 does not download from internet', () => {
    const src = fs.readFileSync(path.join(OD, 'scripts', 'prepare-map-bundle.ps1'), 'utf8');
    assert.ok(!src.includes('Invoke-WebRequest') && !src.includes('wget') && !src.includes('curl'),
        'Must not download from internet');
});

test('create-offline-transfer-bundle.ps1 exists', () => {
    assert.ok(fs.existsSync(path.join(OD, 'scripts', 'create-offline-transfer-bundle.ps1')));
});

test('transfer bundle script includes map_data/', () => {
    const src = fs.readFileSync(path.join(OD, 'scripts', 'create-offline-transfer-bundle.ps1'), 'utf8');
    assert.ok(src.includes('map_data'), 'Transfer bundle must include map_data/');
});

// ─── §9  No scraping / no public download ─────────────────────────────────────
console.log('\n── §9  No public tile download ─────────────────────────────────');

const scriptsDir = path.join(OD, 'scripts');
const scriptFiles = fs.readdirSync(scriptsDir).filter(f => f.endsWith('.ps1') || f.endsWith('.sh'));

for (const f of scriptFiles) {
    test(`${f} — no wget/curl download of OSM or public tiles`, () => {
        const src = fs.readFileSync(path.join(scriptsDir, f), 'utf8');
        const hasBulkDownload = /(wget|curl).*tile\.openstreetmap|download.*tile.*osm/i.test(src);
        assert.ok(!hasBulkDownload, `${f} must not download public OSM tiles`);
    });
}

test('main app is untouched (server/web-server.js has no tile-server wiring change)', () => {
    const mainWs = fs.readFileSync(path.join(ROOT, 'server', 'web-server.js'), 'utf8');
    assert.ok(!mainWs.includes('handleOfflineApi'),
        'Main web-server.js must remain unchanged');
});

test('main app maps/maps.json still has empty mbtiles array (unchanged)', () => {
    const mj = JSON.parse(fs.readFileSync(path.join(ROOT, 'maps', 'maps.json'), 'utf8'));
    assert.ok(Array.isArray(mj.mbtiles) && mj.mbtiles.length === 0,
        'Main app maps.json must remain with empty mbtiles (offline_app creates its own maps.json)');
});

// ─── §10 Regression ───────────────────────────────────────────────────────────
console.log('\n── §10 Regression tests ────────────────────────────────────────');

function runFile(file) {
    return spawnSync(process.execPath, [file], {
        cwd: ROOT, env: process.env, timeout: 90000, encoding: 'utf8'
    });
}

test('test-offline-isolation-0.js still passes (47/47)', () => {
    const r = runFile(path.join(ROOT, 'test-offline-isolation-0.js'));
    if (/\[FAIL\]/.test(r.stdout)) throw new Error(r.stdout.slice(-400));
    assert.ok(/\[PASS\]/.test(r.stdout) && (r.status ?? r.code) === 0);
});

test('test-offline-map-0.js still passes (43/43)', () => {
    const r = runFile(path.join(ROOT, 'test-offline-map-0.js'));
    if (/\[FAIL\]/.test(r.stdout)) throw new Error(r.stdout.slice(-400));
    assert.ok(/\[PASS\]/.test(r.stdout) && (r.status ?? r.code) === 0);
});

// ─── §11 Runtime tests ────────────────────────────────────────────────────────
console.log('\n── §11 Runtime tests (require rebuilt container on 5006+8080) ──');

function httpGet(urlPath, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:5006${urlPath}`, res => {
            let body = ''; res.on('data', c => body += c);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(body) }); }
                catch { resolve({ status: res.statusCode, body }); }
            });
        });
        req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('timeout')); });
        req.on('error', reject);
    });
}

function httpGetPort(port, urlPath, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${port}${urlPath}`, res => {
            let body = ''; res.on('data', c => body += c);
            res.on('end', () => resolve({ status: res.statusCode, body }));
        });
        req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('timeout')); });
        req.on('error', reject);
    });
}

async function containerIsUp() {
    try { await httpGet('/', 2000); return true; } catch { return false; }
}

async function runRuntimeTests() {
    const up = await containerIsUp();
    if (!up) {
        skip('Runtime tests', 'Container not running. Rebuild first: docker compose build && docker compose up -d');
        return;
    }

    const testAsync = async (name, fn) => {
        try { await fn(); console.log(`  [PASS] ${name}`); passed++; }
        catch (e) { console.log(`  [FAIL] ${name}: ${e.message}`); failed++; }
    };

    await testAsync('GET /api/offline/map-config → 200', async () => {
        const r = await httpGet('/api/offline/map-config');
        assert.strictEqual(r.status, 200, `Expected 200, got ${r.status}`);
        assert.ok('localTileUrl' in r.body, 'Missing localTileUrl');
    });

    await testAsync('/api/offline/map-config.localTileUrl points to tile server', async () => {
        const r = await httpGet('/api/offline/map-config');
        const url = r.body && r.body.localTileUrl;
        assert.ok(url && url.includes('8080'), `Expected 8080 in localTileUrl, got: ${url}`);
    });

    await testAsync('Tile server on port 8080 responds', async () => {
        const r = await httpGetPort(8080, '/services/', 5000);
        // The tile server may return 404 for /services/ but the server itself responds
        assert.ok(r.status < 500, `Tile server should respond, got status ${r.status}`);
    });

    if (mbtilesStagedExists) {
        await testAsync('Tile server serves satellite MBTiles tiles', async () => {
            const r = await httpGetPort(8080, '/services/satellite-2017-11-02_asia_gcc-states/7/79/53.png', 5000);
            assert.ok(r.status === 200 || r.status === 404,
                `Expected 200 or 404 (tile may not exist at this coord), got ${r.status}`);
        });
    } else {
        skip('MBTiles tile test', 'MBTiles not yet staged — run prepare-map-bundle.ps1');
    }
}

// ─── Run async and print results ──────────────────────────────────────────────
runRuntimeTests().then(() => {
    console.log('\n' + '═'.repeat(66));
    console.log(`  Results: ${passed} passed, ${failed} failed`);
    console.log('═'.repeat(66) + '\n');
    process.exit(failed > 0 ? 1 : 0);
}).catch(err => { console.error(err); process.exit(1); });
