#!/usr/bin/env node
/**
 * test-offline-tile-proxy-1.js — OFFLINE-TILE-PROXY-1
 *
 * In-app tile proxy: the browser fetches tiles from the RMOOZ web port and the
 * web-server proxies to the internal tile-server, so users need only the web
 * app port (no public 8080).
 *
 * Sections:
 *   A — map-config returns the web-port localTileUrl when RMOOZ_TILE_PROXY_MODE=web
 *   B — proxy OFF preserves the old :8080 behaviour (no regression)
 *   C — web-server.js has the public proxy route + maps.json rewrite
 *   D — guard still blocks OSM/Mapbox/localhost:8080//tiles/ but NOT the proxied URL
 *   E — health checks use GET, not HEAD
 *   F — Dockerfile/overlay copies the changed files
 */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = __dirname, OFF = path.join(ROOT, 'Offline_Deployment');
let passed = 0, failed = 0; const fails = [];
function check(name, cond, note) {
    if (cond) { console.log('  PASS  ' + name); passed++; }
    else { console.error('  FAIL  ' + name + (note ? '  → ' + note : '')); failed++; fails.push(name); }
}
function read(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } }

const DATASET = 'satellite-2017-11-02_asia_gcc-states';
const cfgPath = path.join(OFF, 'offline_app', 'server', 'offline-map-config.js');

function freshConfig(env) {
    const saved = {};
    const keys = ['RMOOZ_TILE_PROXY_MODE','WEB_PUBLIC_BASE_URL','TILE_PUBLIC_BASE_URL',
                  'LOCAL_TILE_URL','RMOOZ_TILE_DATASET_NAME','MAP_SOURCE_MODE','MAP_HEALTHCHECK_URL'];
    keys.forEach(k => { saved[k] = process.env[k]; delete process.env[k]; });
    Object.entries(env).forEach(([k, v]) => { process.env[k] = v; });
    delete require.cache[require.resolve(cfgPath)];
    const mod = require(cfgPath);
    const out = mod.getMapConfig();
    keys.forEach(k => { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; });
    return out;
}

console.log('\n═══ OFFLINE-TILE-PROXY-1 ═══\n');

// ── A ──────────────────────────────────────────────────────────────────────
console.log('A) RMOOZ_TILE_PROXY_MODE=web → web-port localTileUrl');
const a1 = freshConfig({ RMOOZ_TILE_PROXY_MODE: 'web', WEB_PUBLIC_BASE_URL: 'http://155.140.70.51:8640', RMOOZ_TILE_DATASET_NAME: DATASET });
check('A1  localTileUrl uses WEB_PUBLIC_BASE_URL + :8640',
    a1.localTileUrl === `http://155.140.70.51:8640/services/${DATASET}/{z}/{x}/{y}.png`, a1.localTileUrl);
check('A2  localTileUrl does NOT contain :8080', !a1.localTileUrl.includes(':8080'));
check('A3  tileProxyMode reported as "web"', a1.tileProxyMode === 'web');
check('A4  healthcheck also via web port (no :8080)', a1.healthcheckUrl.startsWith('http://155.140.70.51:8640/') && !a1.healthcheckUrl.includes(':8080'));
const a5 = freshConfig({ RMOOZ_TILE_PROXY_MODE: 'web', WEB_PUBLIC_BASE_URL: '', RMOOZ_TILE_DATASET_NAME: DATASET });
check('A5  blank WEB_PUBLIC_BASE_URL → same-origin relative /services/ URL',
    a5.localTileUrl === `/services/${DATASET}/{z}/{x}/{y}.png`, a5.localTileUrl);

// ── B ──────────────────────────────────────────────────────────────────────
console.log('\nB) proxy OFF preserves :8080 behaviour');
const b1 = freshConfig({ RMOOZ_TILE_PROXY_MODE: '', TILE_PUBLIC_BASE_URL: 'http://155.140.70.51:8080', RMOOZ_TILE_DATASET_NAME: DATASET });
check('B1  off + TILE_PUBLIC_BASE_URL → :8080 URL (unchanged)',
    b1.localTileUrl === `http://155.140.70.51:8080/services/${DATASET}/{z}/{x}/{y}.png`, b1.localTileUrl);
check('B2  tileProxyMode reported as "off"', b1.tileProxyMode === 'off');

// ── C ──────────────────────────────────────────────────────────────────────
console.log('\nC) web-server proxy route + maps.json rewrite');
const ws = read(path.join(OFF, 'offline_app', 'server', 'web-server.js'));
check('C1  proxy route regex for /services/:d/:z/:x/:y.(png|jpg|jpeg)',
    /\\\/services\\\/\(\[\^\/\]\+\)\\\/\(\\d\+\)\\\/\(\\d\+\)\\\/\(\\d\+\)\\\.\(png\|jpg\|jpeg\)/.test(ws));
check('C2  proxies to internal 127.0.0.1:TILE_SERVER_PORT', ws.includes("'http://127.0.0.1:' + tilePort") && ws.includes('TILE_SERVER_PORT'));
check('C3  handles GET and HEAD', ws.includes("req.method === 'GET' || req.method === 'HEAD'"));
check('C4  proxy route declared before the auth gate', ws.indexOf('OFFLINE-TILE-PROXY') < ws.indexOf('handleAuthApi(req, res, pathname'));
check('C5  maps.json tileServer rewritten in proxy mode', /maps\\\.json/.test(ws) && ws.includes('cfg.tileServer =') && ws.includes("RMOOZ_TILE_PROXY_MODE"));
check('C6  does NOT modify map_data on disk (rewrites response only)', !/writeFileSync\([^)]*maps\.json/.test(ws));

// ── D ──────────────────────────────────────────────────────────────────────
console.log('\nD) guard still blocks the right things, allows the proxied URL');
const guard = read(path.join(OFF, 'offline_app', 'client', 'offline-leaflet-tile-guard.js'));
check('D1  blocks openstreetmap', guard.includes('openstreetmap.org'));
check('D2  blocks mapbox', guard.includes('mapbox.com'));
check('D3  blocks localhost:8080 + /services/', guard.includes("localhost:8080") && guard.includes("/services/"));
check('D4  blocks /tiles/ templates', guard.includes('/tiles/') && guard.includes('{z}'));
// The localhost:8080 ban is gated on the literal 'localhost:8080', so a web-port
// (:8640) /services/ URL is NOT caught; and the /tiles/ ban needs '/tiles/' which
// /services/ does not contain. Assert the guard does not blanket-ban /services/.
check('D5  /services/ ban is gated on localhost:8080 (web-port URL passes)',
    /localhost:8080.*\/services\/|\/services\/.*localhost:8080/.test(guard.replace(/\n/g, ' ')));

// ── E ──────────────────────────────────────────────────────────────────────
console.log('\nE) GET health checks, not HEAD');
const src = read(path.join(OFF, 'offline_app', 'client', 'wargame', 'offline-map-source.js'));
check('E1  offline-map-source uses GET probe', src.includes("method: 'GET'") && !src.includes("method: 'HEAD'"));
const appjs = read(path.join(ROOT, 'client', 'app.js'));
check('E2  app.js probeTileServer uses GET', /probeTileServer[\s\S]{0,200}method: 'GET'/.test(appjs) && !/probeTileServer[\s\S]{0,200}method: 'HEAD'/.test(appjs));

// ── F ──────────────────────────────────────────────────────────────────────
console.log('\nF) Dockerfile copies the changed offline files');
const dockerfile = read(path.join(OFF, 'Dockerfile.offline'));
check('F1  copies offline web-server.js', dockerfile.includes('offline_app/server/web-server.js'));
check('F2  copies offline-map-config.js', dockerfile.includes('offline_app/server/offline-map-config.js'));
check('F3  copies offline-map-source.js', dockerfile.includes('offline_app/client/wargame/offline-map-source.js'));
check('F4  copies offline-leaflet-tile-guard.js', dockerfile.includes('offline-leaflet-tile-guard.js'));

console.log('\n═══ RESULTS ═══');
console.log('  Passed: ' + passed + '   Failed: ' + failed);
if (fails.length) { console.log('  Failed:'); fails.forEach(f => console.log('   - ' + f)); }
process.exit(failed ? 1 : 0);
