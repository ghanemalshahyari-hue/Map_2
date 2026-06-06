/**
 * OFFLINE-IMAGE-1C — Runtime readiness tests
 *
 * Static tests verify that all offline overlay files are in place,
 * /api/offline/map-config is wired, scripts exist, and no secrets are stored.
 * Runtime tests (§9) verify the live container — skipped if not running.
 *
 * Usage:
 *   node test-offline-image-1c-runtime-readiness.js
 *
 * For runtime tests, start the container first:
 *   docker compose -f Offline_Deployment/docker-compose.offline.yml up -d
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
console.log('  OFFLINE-IMAGE-1C — Runtime readiness tests');
console.log('══════════════════════════════════════════════════════════════════\n');

// ─── §1  /api/offline/map-config wiring ──────────────────────────────────────
console.log('── §1  /api/offline/map-config wiring ──────────────────────────');

const wsOverlay = fs.readFileSync(
    path.join(OA, 'server', 'web-server.js'), 'utf8'
);

test('offline_app/server/web-server.js exists', () => {
    assert.ok(fs.existsSync(path.join(OA, 'server', 'web-server.js')));
});

test('offline web-server.js calls handleOfflineApi', () => {
    assert.ok(wsOverlay.includes('handleOfflineApi'),
        'web-server.js must call handleOfflineApi for /api/offline/* routes');
});

test('handleOfflineApi is called before handlePlansApi (correct order)', () => {
    const offIdx  = wsOverlay.indexOf('handleOfflineApi');
    const plansIdx = wsOverlay.indexOf('handlePlansApi');
    assert.ok(offIdx < plansIdx && offIdx > 0,
        'handleOfflineApi must be dispatched before handlePlansApi');
});

test('offline web-server.js has guard (appData.handleOfflineApi &&) — safe if not exported', () => {
    assert.ok(wsOverlay.includes('appData.handleOfflineApi &&'),
        'Must guard with && so it is safe even if handleOfflineApi is absent');
});

const offlineMapCfg = fs.readFileSync(
    path.join(OA, 'server', 'offline-map-config.js'), 'utf8'
);

test('offline-map-config.js handles GET /api/offline/map-config', () => {
    assert.ok(offlineMapCfg.includes('/api/offline/map-config'),
        'offline-map-config.js must handle /api/offline/map-config');
});

test('offline-map-config.js reads MAP_SOURCE_MODE from env (not hardcoded)', () => {
    assert.ok(offlineMapCfg.includes('MAP_SOURCE_MODE') && offlineMapCfg.includes('process.env'),
        'Must read MAP_SOURCE_MODE from process.env');
});

test('offline-map-config.js does not expose LDAP or secrets', () => {
    assert.ok(!offlineMapCfg.includes('LDAP_PASSWORD') && !offlineMapCfg.includes('SESSION_SECRET'),
        'map-config handler must not expose LDAP secrets');
});

test('offline app-data.js exports handleOfflineApi', () => {
    const src = fs.readFileSync(path.join(OA, 'server', 'app-data.js'), 'utf8');
    assert.ok(src.includes('handleOfflineApi'), 'app-data.js must export handleOfflineApi');
});

// ─── §2  Dockerfile copies all overlay files ──────────────────────────────────
console.log('\n── §2  Dockerfile.offline overlay completeness ─────────────────');

const dockerfile = fs.readFileSync(path.join(OD, 'Dockerfile.offline'), 'utf8');

const requiredCopies = [
    ['offline_app/server/auth/',       'LDAP auth module'],
    ['offline_app/server/app-data.js', 'LDAP-aware app-data'],
    ['offline_app/server/offline-map-config.js', 'map config handler'],
    ['offline_app/server/web-server.js', 'offline API wiring'],
    ['offline_app/client/app.html',    'CDN-free app.html'],
    ['offline_app/client/index.html',  'LDAP hint index.html'],
    ['offline_app/client/landing-auth.js', 'initAuthMode landing'],
    ['offline_app/client/assets/',     'local font CSS'],
    ['offline_app/client/wargame/offline-map-source.js', 'map resolver'],
    ['offline_app/client/offline-map-patch.js', 'map tile patcher']
];

for (const [file, desc] of requiredCopies) {
    test(`Dockerfile COPYs ${file} (${desc})`, () => {
        assert.ok(dockerfile.includes(file),
            `Dockerfile must COPY ${file}`);
    });
}

test('Dockerfile installs Python venv at /opt/rmooz-venv', () => {
    assert.ok(dockerfile.includes('/opt/rmooz-venv'));
});

test('Dockerfile copies TestingAI', () => {
    assert.ok(dockerfile.includes('COPY TestingAI/'));
});

test('Dockerfile creates /app/offline_map_data', () => {
    assert.ok(dockerfile.includes('offline_map_data'));
});

// ─── §3  docker-compose config ────────────────────────────────────────────────
console.log('\n── §3  docker-compose.offline.yml ──────────────────────────────');

const compose = fs.readFileSync(path.join(OD, 'docker-compose.offline.yml'), 'utf8');

test('compose service name is rmooz-offline', () => {
    assert.ok(compose.includes('rmooz-offline:'));
});

test('compose exposes port 5006', () => {
    assert.ok(compose.includes('5006'));
});

test('compose mounts map_data :ro', () => {
    assert.ok(compose.includes('map_data') && compose.includes(':ro'));
});

test('compose mounts TestingAI_Runtime/import_from_rmooz', () => {
    assert.ok(compose.includes('import_from_rmooz'));
});

test('compose mounts TestingAI_Runtime/export_to_rmooz', () => {
    assert.ok(compose.includes('export_to_rmooz'));
});

test('compose mounts TestingAI_Runtime/runs', () => {
    assert.ok(compose.includes('TestingAI_Runtime/runs'));
});

test('compose passes OLLAMA_HOST', () => {
    assert.ok(compose.includes('OLLAMA_HOST'));
});

test('compose passes RMOOZ_ALLOW_SIM_RUN from env (not hardcoded 0)', () => {
    assert.ok(!compose.match(/RMOOZ_ALLOW_SIM_RUN:\s*"0"/));
});

// ─── §4  .env.offline.example ────────────────────────────────────────────────
console.log('\n── §4  .env.offline.example ────────────────────────────────────');

const envEx = fs.readFileSync(path.join(OD, '.env.offline.example'), 'utf8');

for (const v of ['LDAP_SERVER', 'LDAP_DOMAIN', 'SESSION_SECRET',
                  'MAP_SOURCE_MODE', 'FALLBACK_TILE_URL',
                  'RMOOZ_ALLOW_SIM_RUN', 'RMOOZ_OLLAMA_MODEL', 'OLLAMA_HOST']) {
    test(`.env.offline.example contains ${v}`, () => {
        assert.ok(envEx.includes(v), `Missing: ${v}`);
    });
}

test('.env.offline.example has no hardcoded real password', () => {
    assert.ok(!envEx.match(/LDAP_PASSWORD\s*=\s*\w{4,}/), 'Must not contain LDAP password');
});

// ─── §5  Save/load scripts ────────────────────────────────────────────────────
console.log('\n── §5  Save/load transfer scripts ──────────────────────────────');

test('save-offline-image.ps1 exists', () => {
    assert.ok(fs.existsSync(path.join(OD, 'scripts', 'save-offline-image.ps1')));
});

test('load-offline-image.ps1 exists', () => {
    assert.ok(fs.existsSync(path.join(OD, 'scripts', 'load-offline-image.ps1')));
});

test('save script outputs to Offline_Deployment/dist/', () => {
    const saveScript = fs.readFileSync(path.join(OD, 'scripts', 'save-offline-image.ps1'), 'utf8');
    assert.ok(saveScript.includes('dist') || saveScript.includes('/dist/'),
        'save script must output to dist/ directory');
});

test('load script accepts Offline_Deployment/dist/ tar path', () => {
    const loadScript = fs.readFileSync(path.join(OD, 'scripts', 'load-offline-image.ps1'), 'utf8');
    assert.ok(loadScript.includes('dist') || loadScript.includes('rmooz-offline.tar'),
        'load script must reference dist/ or .tar file');
});

test('Offline_Deployment/dist/ directory exists', () => {
    assert.ok(fs.existsSync(path.join(OD, 'dist')));
});

// ─── §6  Transfer checklist doc ───────────────────────────────────────────────
console.log('\n── §6  Transfer checklist documentation ────────────────────────');

test('offline-transfer-checklist.md exists', () => {
    assert.ok(fs.existsSync(path.join(OD, 'docs', 'offline-transfer-checklist.md')));
});

const transferDoc = fs.readFileSync(
    path.join(OD, 'docs', 'offline-transfer-checklist.md'), 'utf8'
);

test('transfer checklist covers docker save', () => {
    assert.ok(transferDoc.includes('docker save') || transferDoc.includes('save-offline-image'),
        'Must document docker save step');
});

test('transfer checklist covers docker load', () => {
    assert.ok(transferDoc.includes('docker load') || transferDoc.includes('load-offline-image'),
        'Must document docker load step');
});

test('transfer checklist covers Ollama model', () => {
    assert.ok(transferDoc.includes('ollama') || transferDoc.includes('Ollama'),
        'Must cover Ollama model transfer');
});

test('transfer checklist verifies /api/offline/map-config endpoint', () => {
    assert.ok(transferDoc.includes('/api/offline/map-config'),
        'Must include /api/offline/map-config verification');
});

test('transfer checklist has no hardcoded password', () => {
    assert.ok(!transferDoc.match(/password\s*[:=]\s*['"]\w{6,}/i),
        'Transfer checklist must not contain a hardcoded password');
});

// ─── §7  Main app isolation ───────────────────────────────────────────────────
console.log('\n── §7  Main app untouched ──────────────────────────────────────');

test('main server/web-server.js does NOT have handleOfflineApi', () => {
    const mainWs = fs.readFileSync(path.join(ROOT, 'server', 'web-server.js'), 'utf8');
    assert.ok(!mainWs.includes('handleOfflineApi'),
        'Main web-server.js must not call handleOfflineApi (offline-only)');
});

test('main server/app-data.js does not have handleOfflineApi', () => {
    const mainAd = fs.readFileSync(path.join(ROOT, 'server', 'app-data.js'), 'utf8');
    assert.ok(!mainAd.includes('handleOfflineApi'),
        'Main app-data.js must not export handleOfflineApi');
});

test('main client/app.js does not have offline-map-patch reference', () => {
    // The main app.js does NOT load offline-map-patch — only offline_app's app.html does
    const mainHtml = fs.readFileSync(path.join(ROOT, 'client', 'app.html'), 'utf8');
    assert.ok(!mainHtml.includes('offline-map-patch'),
        'Main app.html must not reference offline-map-patch.js');
});

// ─── §8  Regression tests ─────────────────────────────────────────────────────
console.log('\n── §8  Regression (isolation + map + LLM pack) ─────────────────');

function runFile(file) {
    return spawnSync(process.execPath, [file], {
        cwd: ROOT, env: process.env, timeout: 90000, encoding: 'utf8'
    });
}

test('test-offline-isolation-0.js passes (47/47)', () => {
    const r = runFile(path.join(ROOT, 'test-offline-isolation-0.js'));
    if (/\[FAIL\]/.test(r.stdout)) throw new Error('Isolation failures:\n' + r.stdout.slice(-500));
    assert.ok(/\[PASS\]/.test(r.stdout) && (r.status ?? r.code) === 0, 'Isolation test failed');
});

test('test-offline-map-0.js passes (43/43)', () => {
    const r = runFile(path.join(ROOT, 'test-offline-map-0.js'));
    if (/\[FAIL\]/.test(r.stdout)) throw new Error('Map test failures:\n' + r.stdout.slice(-400));
    assert.ok(/\[PASS\]/.test(r.stdout) && (r.status ?? r.code) === 0, 'Map test failed');
});

test('test-offline-llm-pack-0.js passes (47/47)', () => {
    const r = runFile(path.join(ROOT, 'test-offline-llm-pack-0.js'));
    if (/\[FAIL\]/.test(r.stdout)) throw new Error('LLM pack failures:\n' + r.stdout.slice(-400));
    assert.ok(/\[PASS\]/.test(r.stdout) && (r.status ?? r.code) === 0, 'LLM pack test failed');
});

// ─── §9  Runtime tests (require live container on port 5006) ─────────────────
console.log('\n── §9  Runtime tests (require container on port 5006) ──────────');

function httpGet(urlPath, timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:5006${urlPath}`, res => {
            let body = '';
            res.on('data', c => body += c);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(body) }); }
                catch { resolve({ status: res.statusCode, body }); }
            });
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
        skip('All runtime tests', 'Container not running on port 5006. Start: docker compose up -d');
        return;
    }

    const testAsync = async (name, fn) => {
        try { await fn(); console.log(`  [PASS] ${name}`); passed++; }
        catch (e) { console.log(`  [FAIL] ${name}: ${e.message}`); failed++; }
    };

    await testAsync('GET / → 200 (login page)', async () => {
        const r = await httpGet('/');
        assert.strictEqual(r.status, 200);
    });

    await testAsync('GET /api/auth/me → 401 (unauthenticated)', async () => {
        const r = await httpGet('/api/auth/me');
        assert.strictEqual(r.status, 401);
    });

    await testAsync('GET /api/auth/ldap-health → 200', async () => {
        const r = await httpGet('/api/auth/ldap-health', 12000);
        assert.strictEqual(r.status, 200, `Expected 200, got ${r.status}`);
        assert.ok(typeof r.body.reachable === 'boolean', 'reachable must be boolean');
    });

    await testAsync('GET /api/offline/map-config → 200 with correct shape', async () => {
        const r = await httpGet('/api/offline/map-config');
        assert.strictEqual(r.status, 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
        assert.ok('mapSourceMode'  in r.body, 'Missing mapSourceMode');
        assert.ok('fallbackEnabled' in r.body, 'Missing fallbackEnabled');
        assert.ok('localTileUrl'   in r.body, 'Missing localTileUrl');
    });

    await testAsync('/api/offline/map-config exposes no LDAP secrets', async () => {
        const r = await httpGet('/api/offline/map-config');
        const raw = JSON.stringify(r.body || {}).toLowerCase();
        assert.ok(!raw.includes('ldap_server'),   'Must not expose LDAP_SERVER');
        assert.ok(!raw.includes('ldap_password'),  'Must not expose LDAP_PASSWORD');
        assert.ok(!raw.includes('session_secret'), 'Must not expose SESSION_SECRET');
    });
}

// ─── Run and print results ─────────────────────────────────────────────────────
runRuntimeTests().then(() => {
    console.log('\n' + '═'.repeat(66));
    console.log(`  Results: ${passed} passed, ${failed} failed`);
    console.log('═'.repeat(66) + '\n');
    process.exit(failed > 0 ? 1 : 0);
}).catch(err => {
    console.error('Test runner error:', err);
    process.exit(1);
});
