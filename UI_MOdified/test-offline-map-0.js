/**
 * OFFLINE-MAP-0 — Map source configuration isolation tests
 *
 * Verifies:
 *   1. .env.offline.example contains all required map config variables
 *   2. map_data/ directory exists with expected subdirectories
 *   3. docker-compose mounts map_data as a volume
 *   4. FALLBACK_TILE_URL is configurable (not hardcoded)
 *   5. No public OSM tile URL is hardcoded as a fallback
 *   6. No bulk tile download script exists
 *   7. Main app is untouched by map source changes
 *   8. offline_app contains map source resolver module
 *   9. Server module exists and handles /api/offline/map-config
 *  10. Existing isolation tests still pass
 *
 * Usage:
 *   node test-offline-map-0.js
 *
 * All tests are static — no server or Docker required.
 */
'use strict';

const assert   = require('assert');
const fs       = require('fs');
const path     = require('path');
const { spawnSync } = require('child_process');

const ROOT        = __dirname;
const OFFLINE_APP = path.join(ROOT, 'Offline_Deployment', 'offline_app');
const MAP_DATA    = path.join(ROOT, 'Offline_Deployment', 'map_data');

let passed = 0, failed = 0;

function test(name, fn) {
    try { fn(); console.log(`  [PASS] ${name}`); passed++; }
    catch (e) { console.log(`  [FAIL] ${name}: ${e.message}`); failed++; }
}

console.log('\n══════════════════════════════════════════════════════════════════');
console.log('  OFFLINE-MAP-0 — Map source configuration isolation tests');
console.log('══════════════════════════════════════════════════════════════════\n');

// ─── §1  .env.offline.example — map config variables ─────────────────────────

console.log('── §1  .env.offline.example — required map variables ────────────');

const envExample = fs.readFileSync(
    path.join(ROOT, 'Offline_Deployment', '.env.offline.example'), 'utf8'
);

const REQUIRED_ENV_VARS = [
    'MAP_SOURCE_MODE',
    'LOCAL_TILE_URL',
    'FALLBACK_TILE_URL',
    'MAP_FALLBACK_ENABLED',
    'OFFLINE_MAP_DATA_DIR'
];

for (const varName of REQUIRED_ENV_VARS) {
    test(`.env.offline.example contains ${varName}`, () => {
        assert.ok(envExample.includes(varName),
            `Missing ${varName} in .env.offline.example`);
    });
}

test('.env.offline.example documents MAP_SOURCE_MODE values (auto/local/fallback)', () => {
    assert.ok(envExample.includes('auto') && envExample.includes('local') && envExample.includes('fallback'),
        'MAP_SOURCE_MODE values must be documented');
});

test('.env.offline.example FALLBACK_TILE_URL is a placeholder, not hardcoded', () => {
    // Must not be a real public tile URL
    assert.ok(!envExample.match(/FALLBACK_TILE_URL\s*=\s*https?:\/\/(tile\.openstreetmap|maps\.googleapis|api\.mapbox)/),
        'FALLBACK_TILE_URL must not default to a public tile CDN');
});

test('.env.offline.example warns against using public internet tile URLs', () => {
    assert.ok(
        envExample.includes('internal') || envExample.includes('NOT') || envExample.includes('not'),
        '.env.offline.example must warn against public internet tile servers'
    );
});

// ─── §2  map_data/ directory structure ───────────────────────────────────────

console.log('\n── §2  map_data/ directory structure ───────────────────────────');

test('Offline_Deployment/map_data/ exists', () => {
    assert.ok(fs.existsSync(MAP_DATA), 'map_data/ directory must exist');
});

test('map_data/README.md exists and explains licensing', () => {
    const readmePath = path.join(MAP_DATA, 'README.md');
    assert.ok(fs.existsSync(readmePath), 'map_data/README.md must exist');
    const content = fs.readFileSync(readmePath, 'utf8');
    assert.ok(
        content.toLowerCase().includes('licens') || content.includes('NOT') || content.includes('bulk'),
        'map_data README must mention licensing/bulk-download policy'
    );
});

for (const subdir of ['base', 'terrain', 'styles', 'attribution']) {
    test(`map_data/${subdir}/ exists`, () => {
        assert.ok(
            fs.existsSync(path.join(MAP_DATA, subdir)),
            `map_data/${subdir}/ must exist (even if empty)`
        );
    });
}

// ─── §3  docker-compose mounts map_data ──────────────────────────────────────

console.log('\n── §3  docker-compose.offline.yml — map_data mount ─────────────');

const compose = fs.readFileSync(
    path.join(ROOT, 'Offline_Deployment', 'docker-compose.offline.yml'), 'utf8'
);

test('docker-compose mounts map_data volume', () => {
    assert.ok(
        compose.includes('map_data'),
        'docker-compose.offline.yml must mount the map_data directory'
    );
});

test('docker-compose mount uses :ro (read-only)', () => {
    assert.ok(
        compose.includes(':ro'),
        'map_data must be mounted read-only (:ro) in docker-compose'
    );
});

test('docker-compose has MAP_SOURCE_MODE environment variable', () => {
    assert.ok(compose.includes('MAP_SOURCE_MODE'),
        'docker-compose must pass MAP_SOURCE_MODE to container');
});

test('docker-compose has FALLBACK_TILE_URL environment variable', () => {
    assert.ok(compose.includes('FALLBACK_TILE_URL'),
        'docker-compose must pass FALLBACK_TILE_URL to container');
});

test('docker-compose has OFFLINE_MAP_DATA_DIR environment variable', () => {
    assert.ok(compose.includes('OFFLINE_MAP_DATA_DIR'),
        'docker-compose must pass OFFLINE_MAP_DATA_DIR to container');
});

// ─── §4  No hardcoded public tile URLs ───────────────────────────────────────

console.log('\n── §4  No public tile URLs hardcoded in offline_app ────────────');

const PUBLIC_TILE_PATTERNS = [
    /https?:\/\/\{s\}\.tile\.openstreetmap\.org/,
    /https?:\/\/[a-z]\.tile\.openstreetmap\.org/,
    /maps\.googleapis\.com\/maps\/api\/tile/,
    /api\.mapbox\.com.*tiles/,
    /tile\.opentopomap\.org/
];

function scanFileForPublicTiles(filePath) {
    if (!fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const violations = [];
    for (const [i, line] of lines.entries()) {
        for (const pat of PUBLIC_TILE_PATTERNS) {
            if (pat.test(line)) {
                // Allow in comments that explicitly warn against use
                const isWarningComment = /\/\/.*warning|\/\/.*do not|\/\/.*never|#.*warning|#.*do not/i.test(line);
                if (!isWarningComment) {
                    violations.push(`Line ${i + 1}: ${line.trim().slice(0, 80)}`);
                }
            }
        }
    }
    return violations;
}

test('offline_app/client/wargame/offline-map-source.js has no hardcoded public tile URL', () => {
    const violations = scanFileForPublicTiles(
        path.join(OFFLINE_APP, 'client', 'wargame', 'offline-map-source.js')
    );
    assert.ok(violations.length === 0,
        'Found hardcoded public tile URLs:\n  ' + violations.join('\n  '));
});

test('Offline_Deployment/.env.offline.example has no hardcoded public tile URL as default', () => {
    const violations = scanFileForPublicTiles(
        path.join(ROOT, 'Offline_Deployment', '.env.offline.example')
    );
    assert.ok(violations.length === 0,
        'Found hardcoded public tile URLs in .env.offline.example:\n  ' + violations.join('\n  '));
});

test('Dockerfile.offline has no hardcoded public tile URL', () => {
    const violations = scanFileForPublicTiles(
        path.join(ROOT, 'Offline_Deployment', 'Dockerfile.offline')
    );
    assert.ok(violations.length === 0,
        'Found hardcoded public tile URLs in Dockerfile:\n  ' + violations.join('\n  '));
});

// ─── §5  No bulk tile download script ────────────────────────────────────────

console.log('\n── §5  No bulk tile download script ────────────────────────────');

test('no bulk tile download script exists in Offline_Deployment/scripts/', () => {
    const scriptsDir = path.join(ROOT, 'Offline_Deployment', 'scripts');
    const files = fs.readdirSync(scriptsDir);
    const bulkScripts = files.filter(f =>
        /download.*tile|tile.*download|bulk.*tile|scrape.*tile|harvest.*tile/i.test(f)
    );
    assert.ok(bulkScripts.length === 0,
        `Bulk tile download scripts found: ${bulkScripts.join(', ')}`);
});

// ─── §6  Main app untouched by map source changes ────────────────────────────

console.log('\n── §6  Main app untouched by map source changes ────────────────');

test('main app client/app.js still references OpenStreetMap (not replaced by offline logic)', () => {
    const appJs = fs.readFileSync(path.join(ROOT, 'client', 'app.js'), 'utf8');
    // The main app still has the original OSM tile layer (expected — we only patch in offline_app)
    assert.ok(appJs.includes('openstreetmap') || appJs.includes('tileLayer'),
        'main app/client/app.js must still have the original tile layer logic (offline patching is only in offline_app)');
});

test('main app does not have offline-map-source.js', () => {
    const f = path.join(ROOT, 'client', 'wargame', 'offline-map-source.js');
    assert.ok(!fs.existsSync(f),
        'offline-map-source.js must not be in main app client/wargame/');
});

test('main app server does not have offline-map-config.js', () => {
    const f = path.join(ROOT, 'server', 'offline-map-config.js');
    assert.ok(!fs.existsSync(f),
        'offline-map-config.js must not be in main app server/');
});

test('main app app.html does not reference offline-map-source.js', () => {
    const html = fs.readFileSync(path.join(ROOT, 'client', 'app.html'), 'utf8');
    assert.ok(!html.includes('offline-map-source'),
        'main app/client/app.html must not reference the offline map source module');
});

// ─── §7  offline_app has map source resolver ─────────────────────────────────

console.log('\n── §7  offline_app — map source resolver present ───────────────');

test('offline_app/client/wargame/offline-map-source.js exists', () => {
    assert.ok(
        fs.existsSync(path.join(OFFLINE_APP, 'client', 'wargame', 'offline-map-source.js')),
        'offline_app must contain client/wargame/offline-map-source.js'
    );
});

test('offline_app/server/offline-map-config.js exists', () => {
    assert.ok(
        fs.existsSync(path.join(OFFLINE_APP, 'server', 'offline-map-config.js')),
        'offline_app must contain server/offline-map-config.js'
    );
});

test('offline_app/client/app.html references offline-map-source.js', () => {
    const html = fs.readFileSync(path.join(OFFLINE_APP, 'client', 'app.html'), 'utf8');
    assert.ok(html.includes('offline-map-source.js'),
        'offline_app/client/app.html must include the offline map source script');
});

test('offline-map-source.js exposes window.OfflineMapSource', () => {
    const src = fs.readFileSync(
        path.join(OFFLINE_APP, 'client', 'wargame', 'offline-map-source.js'), 'utf8'
    );
    assert.ok(src.includes('OfflineMapSource'),
        'offline-map-source.js must expose window.OfflineMapSource');
});

test('offline-map-source.js has resolveOfflineTileSource function', () => {
    const src = fs.readFileSync(
        path.join(OFFLINE_APP, 'client', 'wargame', 'offline-map-source.js'), 'utf8'
    );
    assert.ok(src.includes('resolveOfflineTileSource'),
        'offline-map-source.js must have resolveOfflineTileSource');
});

test('offline-map-config.js reads MAP_SOURCE_MODE from env (not hardcoded)', () => {
    const src = fs.readFileSync(
        path.join(OFFLINE_APP, 'server', 'offline-map-config.js'), 'utf8'
    );
    assert.ok(src.includes('MAP_SOURCE_MODE') && src.includes('process.env'),
        'offline-map-config.js must read MAP_SOURCE_MODE from process.env');
});

test('offline-map-config.js does not return secrets (no LDAP vars in response)', () => {
    const src = fs.readFileSync(
        path.join(OFFLINE_APP, 'server', 'offline-map-config.js'), 'utf8'
    );
    // The returned config object must not contain LDAP or session secrets
    assert.ok(!src.includes('LDAP_PASSWORD') && !src.includes('SESSION_SECRET'),
        'offline-map-config.js must not expose LDAP or session secrets');
});

test('offline_app/server/app-data.js exports handleOfflineApi', () => {
    const src = fs.readFileSync(
        path.join(OFFLINE_APP, 'server', 'app-data.js'), 'utf8'
    );
    assert.ok(src.includes('handleOfflineApi'),
        'offline_app/server/app-data.js must export handleOfflineApi');
});

// ─── §8  Dockerfile copies offline map files ──────────────────────────────────

console.log('\n── §8  Dockerfile.offline — map files in overlay ────────────────');

const dockerfile = fs.readFileSync(
    path.join(ROOT, 'Offline_Deployment', 'Dockerfile.offline'), 'utf8'
);

test('Dockerfile.offline copies offline-map-source.js', () => {
    assert.ok(dockerfile.includes('offline-map-source.js'),
        'Dockerfile.offline must copy offline-map-source.js');
});

test('Dockerfile.offline copies offline-map-config.js', () => {
    assert.ok(dockerfile.includes('offline-map-config.js'),
        'Dockerfile.offline must copy offline-map-config.js');
});

test('Dockerfile.offline creates /app/offline_map_data directory', () => {
    assert.ok(dockerfile.includes('offline_map_data'),
        'Dockerfile.offline must create /app/offline_map_data');
});

// ─── §9  Documentation ───────────────────────────────────────────────────────

console.log('\n── §9  Documentation ───────────────────────────────────────────');

test('Offline_Deployment/docs/offline-map-data-guide.md exists', () => {
    assert.ok(
        fs.existsSync(path.join(ROOT, 'Offline_Deployment', 'docs', 'offline-map-data-guide.md')),
        'offline-map-data-guide.md must exist'
    );
});

test('docs/integration/offline-image-1-docker-compose-build.md exists', () => {
    assert.ok(
        fs.existsSync(path.join(ROOT, 'docs', 'integration', 'offline-image-1-docker-compose-build.md')),
        'offline-image-1-docker-compose-build.md must exist'
    );
});

test('offline-map-data-guide.md explains fallback URL configuration', () => {
    const content = fs.readFileSync(
        path.join(ROOT, 'Offline_Deployment', 'docs', 'offline-map-data-guide.md'), 'utf8'
    );
    assert.ok(content.includes('FALLBACK_TILE_URL'),
        'guide must document FALLBACK_TILE_URL configuration'
    );
});

test('offline-map-data-guide.md warns against bulk-download/public CDN', () => {
    const content = fs.readFileSync(
        path.join(ROOT, 'Offline_Deployment', 'docs', 'offline-map-data-guide.md'), 'utf8'
    );
    assert.ok(
        content.toLowerCase().includes('bulk') ||
        content.toLowerCase().includes('do not') ||
        content.toLowerCase().includes('violat'),
        'guide must warn against bulk tile downloading or public CDN use'
    );
});

// ─── §10 Full isolation regression ───────────────────────────────────────────

console.log('\n── §10 Full isolation regression ───────────────────────────────');

function runFile(file) {
    return spawnSync(process.execPath, [file], {
        cwd: ROOT,
        env: process.env,
        timeout: 30000,
        encoding: 'utf8'
    });
}

test('OFFLINE-ISOLATION-0+1 tests still pass (47/47)', () => {
    const r = spawnSync(process.execPath,
        [path.join(ROOT, 'test-offline-isolation-0.js')],
        { cwd: ROOT, env: process.env, timeout: 60000, encoding: 'utf8' });
    if (/\[FAIL\]/.test(r.stdout)) throw new Error('Isolation failures:\n' + r.stdout.slice(-500));
    assert.ok(/\[PASS\]/.test(r.stdout), 'Isolation test produced no PASS output');
    // code === null means SIGKILL/timeout; 0 means clean exit
    const code = r.status ?? r.code;
    assert.ok(code === 0, `Isolation test exited ${code} (signal: ${r.signal})`);
});

// ─── Results ──────────────────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(66));
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log('═'.repeat(66) + '\n');
process.exit(failed > 0 ? 1 : 0);
