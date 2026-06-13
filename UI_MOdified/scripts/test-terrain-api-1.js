#!/usr/bin/env node
/**
 * GIS-TERRAIN-1 / T-1 + T-2 — terrain endpoints + Planning-Model terrain sources.
 *
 *   T-1: /api/terrain/health · /elevation · /profile (read-only, graceful
 *        degradation when no DEM is configured — never a crash).
 *   T-2: planning-model gains source types terrain_layer(3) / gis_analysis(2),
 *        terrain_layers[] / terrain_analysis[] collections + attach helpers;
 *        missing terrain must not break existing flows.
 *
 * Pure static test — no HTTP server (handlers driven with mock req/res; the
 * degraded-DEM case runs in a child process because dem-service binds
 * DEM_PATH at require time). Run:
 *   node UI_MOdified/scripts/test-terrain-api-1.js
 */
'use strict';

const path = require('path');
const { EventEmitter } = require('events');
const { spawnSync } = require('child_process');

const API = require(path.join('..', 'server', 'terrain-api'));
const dem = require(path.join('..', 'server', 'dem-service'));
const PM  = require(path.join('..', 'server', 'ai', 'planning-model'));

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); console.log(`  [PASS] ${name}`); passed++; }
    catch (e) { console.log(`  [FAIL] ${name}: ${e.message}`); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

// ── mock HTTP plumbing for handle(req,res,ctx) ──────────────────────
function call(method, urlStr, body) {
    let captured = null;
    const ctx = {
        url: new URL(urlStr, 'http://localhost'),
        pathname: new URL(urlStr, 'http://localhost').pathname,
        method: method,
        sendJson: (res, status, payload) => { captured = { status, payload }; },
    };
    const req = new EventEmitter();
    const handled = API.handle(req, {}, ctx);
    if (body !== undefined) {
        req.emit('data', Buffer.from(JSON.stringify(body)));
        req.emit('end');
    } else if (method === 'POST') {
        req.emit('end');
    }
    return { handled, get: () => captured };
}

const DEM_PRESENT = dem.isAvailable();
console.log('\n══════════════════════════════════════════════════════════════════');
console.log('  GIS-TERRAIN-1 — terrain API (T-1) + planning-model sources (T-2)');
console.log('  DEM on this machine: ' + (DEM_PRESENT ? 'PRESENT (' + dem.DEM_PATH + ')' : 'ABSENT — live-value checks skipped'));
console.log('══════════════════════════════════════════════════════════════════\n');

/* ── T-1: health ────────────────────────────────────────────────────── */
test('health: structured response (path, cache, operations, source types)', () => {
    const r = call('GET', '/api/terrain/health');
    assert(r.handled === true, 'must handle');
    const p = r.get().payload;
    assert(r.get().status === 200 && p.ok === true, '200 ok');
    assert(typeof p.available === 'boolean', 'available flag');
    assert(typeof p.dem_path === 'string' && p.dem_path.length > 0, 'configured DEM path reported');
    assert(p.cache && typeof p.cache.dir === 'string', 'cache status');
    assert(Array.isArray(p.operations) && p.operations.indexOf('elevation') !== -1
           && p.operations.indexOf('profile') !== -1, 'supported operations');
    assert(p.source_types.point === 'terrain_layer' && p.source_types.analysis === 'gis_analysis', 'source types');
    if (p.available) assert(p.coverage && p.coverage.west < p.coverage.east, 'coverage bbox when available');
    else assert(p.warnings.length > 0, 'warning when unavailable');
});

test('health: degrades gracefully when DEM missing (child proc, bad DEM_PATH)', () => {
    const script =
        "const API=require('" + path.join(__dirname, '..', 'server', 'terrain-api').replace(/\\/g, '/') + "');" +
        "const h=API.health();" +
        "const e=API.elevationAt(32.0, 15.0);" +
        "console.log(JSON.stringify({h:h, e:e}));";
    const r = spawnSync(process.execPath, ['-e', script], {
        env: Object.assign({}, process.env, { DEM_PATH: path.join(__dirname, '__no_such_dem__.tif') }),
        encoding: 'utf8', timeout: 30000,
    });
    assert(r.status === 0, 'child must exit 0 (no crash); stderr: ' + (r.stderr || '').slice(0, 300));
    const out = JSON.parse(r.stdout.trim().split('\n').pop());
    assert(out.h.ok === true && out.h.available === false, 'health ok:true + available:false');
    assert(out.h.warnings.some(w => /dem_not_configured/.test(w)), 'dem_not_configured warning');
    assert(out.e.ok === true && out.e.elevation_m === null, 'elevation degraded: null, not error');
    assert(out.e.warnings.indexOf('dem_not_configured') !== -1 && out.e.confidence === 'low', 'elevation warning + low confidence');
});

/* ── T-1: elevation ─────────────────────────────────────────────────── */
test('elevation: structured response with terrain_layer source', () => {
    const r = call('GET', '/api/terrain/elevation?lat=31.2&lon=16.6');
    const p = r.get().payload;
    assert(r.get().status === 200 && p.ok === true, '200 ok');
    assert(p.lat === 31.2 && p.lon === 16.6, 'echoes coords');
    assert('elevation_m' in p, 'elevation field present');
    assert(p.source && p.source.type === 'terrain_layer', 'source.type terrain_layer');
    assert(typeof p.source.confidence === 'string' && typeof p.confidence === 'string', 'confidence present');
    assert(Array.isArray(p.warnings), 'warnings array');
    if (DEM_PRESENT) {
        assert(Number.isFinite(p.elevation_m), 'inside-coverage elevation should be numeric when DEM present');
        assert(p.confidence === 'high', 'high confidence on a clean read');
    }
});

test('elevation: outside-coverage point warns (lat=0, lon=0)', () => {
    const p = call('GET', '/api/terrain/elevation?lat=0&lon=0').get().payload;
    assert(p.ok === true && p.elevation_m === null, 'null elevation, ok:true');
    assert(p.warnings.length > 0, 'warning present (outside coverage or no DEM)');
    if (DEM_PRESENT) assert(p.warnings.indexOf('outside_dem_coverage') !== -1, 'outside_dem_coverage named');
});

test('elevation: invalid params → 400', () => {
    assert(call('GET', '/api/terrain/elevation?lat=abc&lon=1').get().status === 400, 'non-numeric');
    assert(call('GET', '/api/terrain/elevation?lat=99&lon=1').get().status === 400, 'lat out of range');
    assert(call('GET', '/api/terrain/elevation').get().status === 400, 'missing params');
});

/* ── T-1: profile ───────────────────────────────────────────────────── */
const ROUTE = [{ lat: 31.0, lon: 16.0 }, { lat: 31.2, lon: 16.4 }];   // ~44 km, inside Libya bbox
test('profile: structured analysis (distance, min/max, slope, gis_analysis source)', () => {
    const r = call('POST', '/api/terrain/profile', { points: ROUTE });
    const p = r.get().payload;
    assert(r.get().status === 200 && p.ok === true, '200 ok; got ' + JSON.stringify(r.get()).slice(0, 200));
    assert(p.point_count === 2 && p.sample_count >= 2, 'points + samples');
    assert(p.distance_km > 40 && p.distance_km < 50, 'haversine distance ~44km, got ' + p.distance_km);
    assert(p.elevation && 'min_m' in p.elevation && 'max_m' in p.elevation, 'min/max elevation');
    assert(p.slope && p.slope.thresholds.interim === true, 'slope thresholds flagged INTERIM');
    assert(p.slope.thresholds.slow_go_deg === API.SLOPE_SLOW_GO_DEG, 'threshold value surfaced');
    assert(p.source && p.source.type === 'gis_analysis', 'source.type gis_analysis');
    assert(p.needs_review === true, 'needs_review:true');
    assert(Array.isArray(p.samples) && p.samples[0].d_km === 0, 'samples start at d=0');
    if (DEM_PRESENT) {
        assert(p.coverage.with_elevation > 0, 'elevations sampled when DEM present');
        assert(Number.isFinite(p.elevation.min_m), 'numeric min when DEM present');
    } else {
        assert(p.warnings.indexOf('dem_not_configured') !== -1, 'degraded warning');
    }
});

test('profile: accepts [lon,lat] array points too', () => {
    const p = call('POST', '/api/terrain/profile', { points: [[16.0, 31.0], [16.4, 31.2]] }).get().payload;
    assert(p.ok === true && p.point_count === 2, 'GeoJSON-order points accepted');
    assert(Math.abs(p.distance_km - call('POST', '/api/terrain/profile', { points: ROUTE }).get().payload.distance_km) < 0.001,
        'same route either shape ⇒ same distance');
});

test('profile: bad inputs → 400 (one point, bad coord, bad JSON, no points)', () => {
    assert(call('POST', '/api/terrain/profile', { points: [ROUTE[0]] }).get().status === 400, 'one point');
    assert(call('POST', '/api/terrain/profile', { points: [{ lat: 999, lon: 0 }, ROUTE[0]] }).get().status === 400, 'bad coord');
    assert(call('POST', '/api/terrain/profile', { nope: true }).get().status === 400, 'no points key');
    // malformed JSON body
    let captured = null;
    const ctx = { url: new URL('http://localhost/api/terrain/profile'), pathname: '/api/terrain/profile',
                  method: 'POST', sendJson: (res, s, b) => { captured = { s, b }; } };
    const req = new EventEmitter();
    API.handle(req, {}, ctx);
    req.emit('data', Buffer.from('{not json'));
    req.emit('end');
    assert(captured.s === 400, 'malformed JSON → 400');
});

test('unknown terrain endpoint → 404 (still handled)', () => {
    const r = call('GET', '/api/terrain/nope');
    assert(r.handled === true && r.get().status === 404, '404 with handled=true');
});

/* ── T-2: planning-model terrain sources ────────────────────────────── */
test('T-2: SOURCE_TYPES include terrain_layer + gis_analysis; makeSource accepts them', () => {
    assert(PM.SOURCE_TYPES.indexOf('terrain_layer') !== -1, 'terrain_layer registered');
    assert(PM.SOURCE_TYPES.indexOf('gis_analysis') !== -1, 'gis_analysis registered');
    const s1 = PM.makeSource({ type: 'terrain_layer', file: 'dem.tif', key: 'elevation' });
    const s2 = PM.makeSource({ type: 'gis_analysis', key: 'profile' });
    assert(s1.type === 'terrain_layer' && s1.confidence === 'medium', 'trust 3 ⇒ default medium confidence');
    assert(s2.type === 'gis_analysis' && s2.confidence === 'medium', 'trust 2 ⇒ default medium confidence');
});

test('T-2: emptyPlanningModel carries terrain_layers[]/terrain_analysis[]', () => {
    const m = PM.emptyPlanningModel();
    assert(Array.isArray(m.terrain_layers) && m.terrain_layers.length === 0, 'terrain_layers []');
    assert(Array.isArray(m.terrain_analysis) && m.terrain_analysis.length === 0, 'terrain_analysis []');
});

test('T-2: attach helpers stamp sources, preserve existing provenance, never mutate input', () => {
    const m = PM.emptyPlanningModel();
    const layerIn = { id: 'dem-libya', kind: 'dem', format: 'geotiff' };
    const e1 = PM.attachTerrainLayer(m, layerIn, { file: 'libya_demx5.tif' });
    assert(m.terrain_layers.length === 1 && e1.source.type === 'terrain_layer', 'layer stamped terrain_layer');
    assert(!('source' in layerIn), 'input object not mutated');

    // existing provenance preserved (withSource semantics)
    const pre = { id: 'x', source: PM.makeSource({ type: 'manual_app_entry' }) };
    const e2 = PM.attachTerrainLayer(m, pre);
    assert(e2.source.type === 'manual_app_entry', 'existing source NOT overwritten');

    const a1 = PM.attachTerrainAnalysis(m, { kind: 'elevation_profile', result: { distance_km: 44 } }, { key: 'profile' });
    assert(a1.source.type === 'gis_analysis' && a1.needs_review === true, 'analysis stamped + needs_review forced');

    // pre-T-2 model (arrays absent) — helpers self-heal instead of crashing
    const legacy = { units: [] };
    PM.attachTerrainAnalysis(legacy, { kind: 'los' });
    assert(legacy.terrain_analysis.length === 1, 'legacy model self-heals');
});

test('T-2: source tally counts terrain entries; brief without terrain unaffected', () => {
    const m = PM.emptyPlanningModel();
    PM.attachTerrainLayer(m, { id: 'dem' });
    PM.attachTerrainAnalysis(m, { kind: 'profile' });
    const tally = PM.computeSourceSummary(m);
    const types = tally.map(t => t.type);
    assert(types.indexOf('terrain_layer') !== -1 && types.indexOf('gis_analysis') !== -1, 'tally counts terrain');

    // existing flow regression: a terrain-free brief still converts + finalizes
    const model = PM.fromOperationalBrief({ operational_brief: { mission: 'م', friendly: { units: [] }, enemy: { units: [] } } },
                                          { source_type: 'uploaded_doc' });
    assert(Array.isArray(model.terrain_layers) && model.terrain_layers.length === 0, 'no terrain ⇒ empty arrays');
    assert(Array.isArray(model.requirements_checklist), 'finalize still works');
});

console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
