#!/usr/bin/env node
/**
 * GIS-TERRAIN-1 / T-3 — terrain analysis products.
 *
 * Proves the four deterministic products (point / route / area / landing-zone)
 * return STRUCTURED results in every DEM condition — including a forced
 * missing-DEM child process — with interim thresholds clearly marked and
 * needs_review preserved; and that the planning-model attach helpers store
 * route/location/LZ analyses without mutating inputs or models' provenance.
 *
 * Pure static test — no server, no network. Run:
 *   node UI_MOdified/scripts/test-terrain-analysis-1.js
 */
'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const TA  = require(path.join('..', 'server', 'terrain-analysis'));
const dem = require(path.join('..', 'server', 'dem-service'));
const PM  = require(path.join('..', 'server', 'ai', 'planning-model'));

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); console.log(`  [PASS] ${name}`); passed++; }
    catch (e) { console.log(`  [FAIL] ${name}: ${e.message}`); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function snap(o) { return JSON.stringify(o); }

const DEM_PRESENT = dem.isAvailable();
const ROUTE = [{ lat: 31.0, lon: 16.0 }, { lat: 31.2, lon: 16.4 }];      // ~44 km
const BBOX  = [16.0, 31.0, 16.2, 31.15];                                  // inside Libya coverage
const RING  = [[16.0, 31.0], [16.2, 31.0], [16.2, 31.15], [16.0, 31.15], [16.0, 31.0]];

console.log('\n══════════════════════════════════════════════════════════════════');
console.log('  GIS-TERRAIN-1 / T-3 — terrain analysis products');
console.log('  DEM on this machine: ' + (DEM_PRESENT ? 'PRESENT' : 'ABSENT — degradation paths run live'));
console.log('══════════════════════════════════════════════════════════════════\n');

/* ── A. point ───────────────────────────────────────────────────────── */
test('point: structured result; graceful degradation; bad input → ok:false', () => {
    const p = TA.analyzePointTerrain(31.2, 16.6);
    assert(p.ok === true && p.kind === 'point_terrain', 'shape');
    assert('elevation_m' in p && typeof p.confidence === 'string', 'fields');
    assert(p.source && p.source.type === 'terrain_layer', 'point reads stay terrain_layer');
    if (!DEM_PRESENT) {
        assert(p.elevation_m === null, 'null elevation without DEM');
        assert(p.warnings.indexOf('dem_not_configured') !== -1 && p.warnings.indexOf('no_terrain_data') !== -1,
            'dem_not_configured + no_terrain_data preserved');
    }
    assert(TA.analyzePointTerrain(999, 0).ok === false, 'bad lat rejected');
    assert(TA.analyzePointTerrain(null, null).ok === false, 'null rejected');
});

/* ── B. route ───────────────────────────────────────────────────────── */
test('route: structured result even when DEM missing (distance is geometry)', () => {
    const r = TA.analyzeRouteTerrain(ROUTE);
    assert(r.ok === true && r.kind === 'route_terrain', 'shape');
    assert(r.distance_km > 40 && r.distance_km < 50, 'distance ~44km, got ' + r.distance_km);
    assert(Array.isArray(r.elevation_profile) && r.elevation_profile.length >= 2, 'profile samples');
    assert('min_m' in r.elevation && 'max_m' in r.elevation, 'min/max elevation fields');
    assert('max_deg' in r.slope && 'avg_deg' in r.slope, 'slope fields');
    assert(['none', 'slow_go', 'no_go', 'unknown'].indexOf(r.mobility_warning) !== -1, 'mobility enum');
    if (!DEM_PRESENT) {
        assert(r.mobility_warning === 'unknown', 'unknown mobility without DEM');
        assert(r.warnings.indexOf('dem_not_configured') !== -1 && r.warnings.indexOf('no_terrain_data') !== -1, 'degraded warnings');
        assert(r.confidence === 'low', 'low confidence when unknown');
    }
    assert(r.source.type === 'gis_analysis', 'route product is gis_analysis');
    assert(TA.analyzeRouteTerrain([ROUTE[0]]).ok === false, 'one point rejected');
    assert(TA.analyzeRouteTerrain('x').ok === false, 'garbage rejected');
});

test('route: interim thresholds clearly marked + needs_review', () => {
    const r = TA.analyzeRouteTerrain(ROUTE);
    assert(r.thresholds.interim === true, 'interim flag');
    assert(/doctrine rule cards/.test(r.thresholds.basis), 'basis names doctrine cards (G-6)');
    assert(r.thresholds.slow_go_deg === TA.INTERIM.slow_go_deg && r.thresholds.no_go_deg === TA.INTERIM.no_go_deg,
        'threshold values surfaced');
    assert(r.needs_review === true, 'needs_review');
});

test('route: mobility classifier unit checks', () => {
    const f = TA._internal.mobilityFromSlope;
    assert(f({ max_deg: null }, false, false) === 'unknown', 'no DEM → unknown');
    assert(f({ max_deg: 5, slow_go_segments: 0, no_go_segments: 0 }, true, true) === 'none', 'flat → none');
    assert(f({ max_deg: 20, slow_go_segments: 2, no_go_segments: 0 }, true, true) === 'slow_go', 'steep → slow_go');
    assert(f({ max_deg: 40, slow_go_segments: 1, no_go_segments: 1 }, true, true) === 'no_go', 'no-go wins');
});

/* ── C. area ────────────────────────────────────────────────────────── */
test('area: bbox → structured grid summary; graceful degradation', () => {
    const a = TA.analyzeAreaTerrain(BBOX);
    assert(a.ok === true && a.kind === 'area_terrain', 'shape');
    assert(a.grid.sampled === 64 && a.grid.cols === 8, 'full 8×8 grid for bbox');
    assert('min_m' in a.elevation && 'avg_m' in a.elevation, 'elevation summary fields');
    assert('max_deg' in a.slope && a.slope.basis === 'grid_neighbor_pairs', 'slope summary');
    assert(['high', 'medium', 'low', 'unknown'].indexOf(a.terrain_confidence) !== -1, 'confidence enum');
    if (!DEM_PRESENT) {
        assert(a.terrain_confidence === 'unknown', 'unknown confidence without DEM');
        assert(a.elevation.min_m === null && a.slope.max_deg === null, 'null stats without DEM');
        assert(a.warnings.indexOf('dem_not_configured') !== -1 && a.warnings.indexOf('no_terrain_data') !== -1, 'degraded warnings');
    }
    assert(a.source.type === 'gis_analysis' && a.needs_review === true, 'gis_analysis + needs_review');
});

test('area: polygon ring filters the grid; bad areas → ok:false', () => {
    const tri = [[16.0, 31.0], [16.2, 31.0], [16.0, 31.15], [16.0, 31.0]];   // triangle ≈ half the bbox
    const a = TA.analyzeAreaTerrain({ type: 'Polygon', coordinates: [tri] });
    assert(a.ok === true && a.polygon_filtered === true, 'polygon accepted');
    assert(a.grid.sampled > 0 && a.grid.sampled < 64, 'ring filtered some cells, kept ' + a.grid.sampled);
    const ring = TA.analyzeAreaTerrain(RING);
    assert(ring.ok === true && ring.polygon_filtered === true, 'bare ring accepted');
    assert(TA.analyzeAreaTerrain([1, 2, 3]).ok === false, 'bad bbox rejected');
    assert(TA.analyzeAreaTerrain([20, 35, 10, 30]).ok === false, 'inverted bbox rejected');
    assert(TA.analyzeAreaTerrain({}).ok === false, 'empty object rejected');
    // point-in-ring sanity
    assert(TA._internal.pointInRing(16.05, 31.02, tri) === true, 'inside triangle');
    assert(TA._internal.pointInRing(16.19, 31.14, tri) === false, 'outside triangle');
});

/* ── D. landing zone ────────────────────────────────────────────────── */
test('LZ: degrades to suitability=unknown without DEM; thresholds interim; needs_review', () => {
    const lz = TA.analyzeLandingZoneSuitability(BBOX);
    assert(lz.ok === true && lz.kind === 'landing_zone_suitability', 'shape');
    assert(['suitable', 'marginal', 'unsuitable', 'unknown'].indexOf(lz.suitability) !== -1, 'verdict enum');
    assert(lz.factors.area_km2 > 1, 'size computed from geometry (no DEM needed)');
    assert(lz.factors.size_ok === true, 'size ok for ~19×17km bbox');
    if (!DEM_PRESENT) {
        assert(lz.suitability === 'unknown', 'unknown without DEM (no invention)');
        assert(lz.factors.flatness === 'unknown', 'flatness unknown');
    }
    assert(lz.thresholds.interim === true && /doctrine rule cards/.test(lz.thresholds.basis), 'interim marked');
    assert(lz.needs_review === true && lz.source.type === 'gis_analysis', 'review + source');
    assert(lz.warnings.indexOf('no_coastline_layer') !== -1, 'missing coastline named');
});

test('LZ: geometry-only facts still work — too-small zone unsuitable; coastline opt computes distance', () => {
    const tiny = [16.0, 31.0, 16.002, 31.002];                       // ~0.04 km²
    const lz1 = TA.analyzeLandingZoneSuitability(tiny);
    assert(lz1.factors.size_ok === false && lz1.suitability === 'unsuitable',
        'too small ⇒ unsuitable even without DEM (geometry fact)');
    const coast = { type: 'LineString', coordinates: [[16.1, 31.08], [16.15, 31.1]] };  // crosses the bbox
    const lz2 = TA.analyzeLandingZoneSuitability(BBOX, { coastline: coast });
    assert(Number.isFinite(lz2.factors.coast_distance_km), 'coast distance computed (geometry only)');
    assert(lz2.factors.near_coast === (lz2.factors.coast_distance_km <= TA.INTERIM.lz_near_coast_km), 'near_coast consistent');
    assert(lz2.warnings.indexOf('no_coastline_layer') === -1, 'no missing-layer warning when supplied');
    const far = TA.analyzeLandingZoneSuitability(BBOX, { coastline: { type: 'LineString', coordinates: [[20, 35], [20.1, 35]] } });
    assert(far.factors.near_coast === false, 'distant coastline ⇒ near_coast false');
});

/* ── forced missing-DEM child (proves degradation on ANY machine) ───── */
test('all four products degrade structurally under a forced-missing DEM (child proc)', () => {
    const mod = path.join(__dirname, '..', 'server', 'terrain-analysis').replace(/\\/g, '/');
    const script =
        "const TA=require('" + mod + "');" +
        "console.log(JSON.stringify({" +
        " p:TA.analyzePointTerrain(31.2,16.6)," +
        " r:TA.analyzeRouteTerrain([{lat:31,lon:16},{lat:31.2,lon:16.4}])," +
        " a:TA.analyzeAreaTerrain([16.0,31.0,16.2,31.15])," +
        " z:TA.analyzeLandingZoneSuitability([16.0,31.0,16.2,31.15])" +
        "}));";
    const r = spawnSync(process.execPath, ['-e', script], {
        env: Object.assign({}, process.env, { DEM_PATH: path.join(__dirname, '__no_dem_t3__.tif') }),
        encoding: 'utf8', timeout: 30000,
    });
    assert(r.status === 0, 'child exit 0 (no crash); stderr: ' + (r.stderr || '').slice(0, 300));
    const o = JSON.parse(r.stdout.trim().split('\n').pop());
    assert(o.p.ok && o.p.elevation_m === null && o.p.warnings.indexOf('dem_not_configured') !== -1, 'point degraded');
    assert(o.r.ok && o.r.mobility_warning === 'unknown' && o.r.distance_km > 40, 'route degraded but distance kept');
    assert(o.r.warnings.indexOf('no_terrain_data') !== -1 && o.r.needs_review === true, 'route warnings + review');
    assert(o.a.ok && o.a.terrain_confidence === 'unknown', 'area degraded');
    assert(o.z.ok && o.z.suitability === 'unknown' && o.z.needs_review === true, 'LZ degraded to unknown');
});

/* ── planning-model integration ─────────────────────────────────────── */
test('PM: attachRoute/Location/LandingZone store refs in terrain_analysis; no input mutation', () => {
    const m = PM.emptyPlanningModel();
    const route = TA.analyzeRouteTerrain(ROUTE);
    const area  = TA.analyzeAreaTerrain(BBOX);
    const lz    = TA.analyzeLandingZoneSuitability(BBOX);
    const before = { route: snap(route), area: snap(area), lz: snap(lz) };

    const e1 = TA.attachRouteTerrain(m, 'axis-north', route);
    const e2 = TA.attachLocationTerrain(m, 'cand-007', area);
    const e3 = TA.attachLandingZoneTerrain(m, 'lz-west', lz);

    assert(m.terrain_analysis.length === 3, 'three analyses attached');
    assert(e1.ref_kind === 'route' && e1.ref_id === 'axis-north', 'route ref');
    assert(e2.ref_kind === 'location_candidate' && e2.ref_id === 'cand-007', 'candidate ref');
    assert(e3.ref_kind === 'landing_zone' && e3.ref_id === 'lz-west', 'LZ ref');
    // source metadata preserved: analyses carried gis_analysis sources already
    assert(e1.source.type === 'gis_analysis' && e3.source.type === 'gis_analysis', 'existing provenance preserved');
    assert(e1.needs_review === true && e3.needs_review === true, 'needs_review survives attach');
    // inputs untouched (no ref stamps, no source rewrites)
    assert(snap(route) === before.route && snap(area) === before.area && snap(lz) === before.lz, 'inputs not mutated');
    // tally + finalize still coherent
    const types = PM.computeSourceSummary(m).map(t => t.type);
    assert(types.indexOf('gis_analysis') !== -1, 'tally counts attached analyses');
});

test('PM: attach helpers self-heal a pre-T-2 model and never throw on missing arrays', () => {
    const legacy = { units: [] };
    TA.attachRouteTerrain(legacy, 'r1', TA.analyzeRouteTerrain(ROUTE));
    assert(legacy.terrain_analysis.length === 1, 'legacy model self-heals');
});

console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
