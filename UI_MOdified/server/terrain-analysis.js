/**
 * Terrain Analysis v1 — GIS-TERRAIN-1 / T-3
 * (design: docs/gis-terrain-integration-design.md §4 'terrain_analysis', §12 T-3).
 *
 * Deterministic decision-support products layered on the T-1 terrain API and
 * the T-2 planning-model terrain fields. SERVER-SIDE HELPERS ONLY — no HTTP
 * surface, no UI, no scenario-generation changes. Later consumers: Location
 * Intelligence checks, COA terrain warnings, Unit Tasking route terrain,
 * landing-zone suitability (T-4 wiring).
 *
 * Products (all pure functions; inputs never mutated):
 *   analyzePointTerrain(lat, lon)                → point elevation read
 *   analyzeRouteTerrain(points)                  → distance/profile/slope/mobility
 *   analyzeAreaTerrain(area)                     → light grid sample over bbox/polygon
 *   analyzeLandingZoneSuitability(area, opts?)   → flatness/coast/size verdict
 *
 * Planning-model integration (wraps PM.attachTerrainAnalysis — planning-model
 * itself is untouched in T-3):
 *   attachRouteTerrain(model, routeId, analysis)
 *   attachLocationTerrain(model, candidateId, analysis)
 *   attachLandingZoneTerrain(model, lzId, analysis)
 *
 * Hard rules:
 *   • Missing DEM degrades to a STRUCTURED UNKNOWN analysis — never a crash;
 *     warnings carry dem_not_configured / no_terrain_data; needs_review stays.
 *   • Every threshold here is INTERIM and marked so — doctrine rule cards
 *     (G-6, owner ruling L7/L8) will own the real values.
 *   • Every product stamps source.type = gis_analysis (terrain reads inside
 *     points stay terrain_layer) and needs_review: true (L6).
 */
'use strict';

const path = require('path');

const dem = require('./dem-service');
const API = require('./terrain-api');                    // T-1: elevationAt / profileFor
const PM  = require(path.join(__dirname, 'ai', 'planning-model.js'));
const { haversineKm } = require(path.join(__dirname, 'ai', 'scenario-normalizer.js'));

/* ── INTERIM thresholds (doctrine rule cards G-6 will own these) ────────── */
const INTERIM = Object.freeze({
    // mobility (route) — mirrors terrain-api so the two layers never disagree
    slow_go_deg: API.SLOPE_SLOW_GO_DEG,                  // 15
    no_go_deg:   API.SLOPE_NO_GO_DEG,                    // 30
    // landing-zone flatness
    lz_flat_max_avg_deg:     5,
    lz_marginal_max_avg_deg: 10,
    // landing-zone size
    lz_min_area_km2: 0.25,                               // ~500 m × 500 m
    // coast proximity (only evaluated when a coastline layer is supplied)
    lz_near_coast_km: 2,
});
function interimNote() {
    return { interim: true, basis: 'interim constants — doctrine rule cards (G-6) will own these' };
}

/* ── small pure helpers ─────────────────────────────────────────────────── */
function clone(o) { return o === undefined ? undefined : JSON.parse(JSON.stringify(o)); }
function validLatLon(lat, lon) {
    return Number.isFinite(lat) && Number.isFinite(lon) &&
           lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}
function gisSource(key, origin) {
    return PM.makeSource({ type: 'gis_analysis',
        file: path.basename(String(dem.DEM_PATH || 'dem')), key: key, origin: origin || null });
}
function degradedWarnings(base) {
    const w = Array.isArray(base) ? base.slice() : [];
    if (w.indexOf('dem_not_configured') === -1) w.push('dem_not_configured');
    if (w.indexOf('no_terrain_data') === -1) w.push('no_terrain_data');
    return w;
}

// Ray-cast point-in-polygon on a [[lon,lat], …] ring (server has no Turf —
// Turf is a client library here; ~12 lines beats a new dependency).
function pointInRing(lon, lat, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
        if (((yi > lat) !== (yj > lat)) &&
            (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
}

/* Normalize an area input → { bbox:[w,s,e,n], ring|null } (or { error }).
 * Accepted: [w,s,e,n] · {bbox} · GeoJSON Polygon/MultiPolygon (or {geometry})
 * · a bare ring (≥3 [lon,lat] vertices). */
function normalizeArea(area) {
    if (Array.isArray(area) && area.length === 4 && area.every(Number.isFinite)) {
        const [w, s, e, n] = area;
        if (!(w < e && s < n) || !validLatLon(s, w) || !validLatLon(n, e)) {
            return { error: 'bbox must be [west,south,east,north] with valid earth coordinates' };
        }
        return { bbox: [w, s, e, n], ring: null };
    }
    if (Array.isArray(area) && area.length >= 3 &&
        area.every(p => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]))) {
        return ringToArea(area);
    }
    if (area && typeof area === 'object') {
        if (Array.isArray(area.bbox)) return normalizeArea(area.bbox);
        const g = (area.type ? area : area.geometry) || null;
        if (g && g.type === 'Polygon' && Array.isArray(g.coordinates) && Array.isArray(g.coordinates[0])) {
            return ringToArea(g.coordinates[0]);
        }
        if (g && g.type === 'MultiPolygon' && Array.isArray(g.coordinates) && g.coordinates[0] && Array.isArray(g.coordinates[0][0])) {
            return ringToArea(g.coordinates[0][0]);       // outer ring of first polygon (v1)
        }
    }
    return { error: 'area must be a bbox [w,s,e,n], a GeoJSON Polygon/MultiPolygon, or a ring of [lon,lat] points' };
}
function ringToArea(ring) {
    let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
    for (const p of ring) {
        if (!validLatLon(p[1], p[0])) return { error: 'ring vertex outside valid earth coordinates' };
        if (p[0] < w) w = p[0]; if (p[0] > e) e = p[0];
        if (p[1] < s) s = p[1]; if (p[1] > n) n = p[1];
    }
    if (!(w < e && s < n)) return { error: 'ring has no area (degenerate bbox)' };
    return { bbox: [w, s, e, n], ring: ring };
}

/* ── A. point ───────────────────────────────────────────────────────────── */
function analyzePointTerrain(lat, lon) {
    if (!validLatLon(lat, lon)) {
        return { ok: false, error: 'lat/lon must be valid earth coordinates' };
    }
    const e = API.elevationAt(lat, lon);                  // T-1 reuse (terrain_layer source)
    return {
        ok: true,
        kind: 'point_terrain',
        lat: lat, lon: lon,
        available: e.available,
        elevation_m: e.elevation_m,
        confidence: e.confidence,
        source: e.source,
        warnings: e.available ? e.warnings : degradedWarnings(e.warnings),
    };
}

/* ── B. route ───────────────────────────────────────────────────────────── */
function mobilityFromSlope(slope, available, withElevation) {
    if (!available || !withElevation || slope.max_deg === null) return 'unknown';
    if (slope.no_go_segments > 0) return 'no_go';
    if (slope.slow_go_segments > 0) return 'slow_go';
    return 'none';
}

function analyzeRouteTerrain(points) {
    const p = API.profileFor(Array.isArray(points) ? points : []);   // T-1 reuse
    if (p.error) return { ok: false, error: p.error };
    const mobility = mobilityFromSlope(p.slope, p.available, p.coverage.with_elevation > 0);
    return {
        ok: true,
        kind: 'route_terrain',
        available: p.available,
        point_count: p.point_count,
        distance_km: p.distance_km,
        elevation_profile: p.samples,
        elevation: p.elevation,
        slope: {
            max_deg: p.slope.max_deg,
            avg_deg: p.slope.avg_deg,
            slow_go_segments: p.slope.slow_go_segments,
            no_go_segments: p.slope.no_go_segments,
        },
        mobility_warning: mobility,                       // none | slow_go | no_go | unknown
        thresholds: Object.assign({ slow_go_deg: INTERIM.slow_go_deg, no_go_deg: INTERIM.no_go_deg }, interimNote()),
        confidence: mobility === 'unknown' ? 'low' : 'medium',
        source: gisSource('route_terrain', 'route(' + p.point_count + ' pts)'),
        needs_review: true,
        warnings: p.available ? p.warnings : degradedWarnings(p.warnings),
    };
}

/* ── C. area ────────────────────────────────────────────────────────────── */
const GRID_COLS = 8, GRID_ROWS = 8;                       // ≤64 reads — safe/light

function analyzeAreaTerrain(area) {
    const norm = normalizeArea(area);
    if (norm.error) return { ok: false, error: norm.error };
    const [w, s, e, n] = norm.bbox;
    const available = dem.isAvailable();

    // Light grid sample as a 2-D lattice (null = ring-filtered out), so slope
    // neighbors are TRUE grid neighbors — a compacted array would pair
    // row-ends with next-row starts and mispair filtered polygons.
    const grid = [];                                      // grid[r][c] = sample | null
    const samples = [];
    for (let r = 0; r < GRID_ROWS; r++) {
        const row = [];
        for (let c = 0; c < GRID_COLS; c++) {
            const lon = w + (e - w) * ((c + 0.5) / GRID_COLS);
            const lat = s + (n - s) * ((r + 0.5) / GRID_ROWS);
            if (norm.ring && !pointInRing(lon, lat, norm.ring)) { row.push(null); continue; }
            const sample = { lon, lat, elevation_m: available ? dem.getElevation(lon, lat) : null };
            row.push(sample);
            samples.push(sample);
        }
        grid.push(row);
    }
    const withElev = samples.filter(x => Number.isFinite(x.elevation_m));

    // Neighbor-pair slope (right + below only — each pair counted once).
    const spacingKm = haversineKm([w, (s + n) / 2], [e, (s + n) / 2]) / GRID_COLS;
    let maxSlope = null, slopeSum = 0, slopePairs = 0;
    for (let r = 0; r < GRID_ROWS; r++) {
        for (let c = 0; c < GRID_COLS; c++) {
            const a = grid[r][c];
            if (!a || !Number.isFinite(a.elevation_m)) continue;
            const neighbors = [
                c + 1 < GRID_COLS ? grid[r][c + 1] : null,
                r + 1 < GRID_ROWS ? grid[r + 1][c] : null,
            ];
            for (const b of neighbors) {
                if (!b || !Number.isFinite(b.elevation_m)) continue;
                const runM = haversineKm([a.lon, a.lat], [b.lon, b.lat]) * 1000;
                if (runM <= 0) continue;
                const deg = Math.abs(Math.atan2(b.elevation_m - a.elevation_m, runM) * 180 / Math.PI);
                slopePairs++; slopeSum += deg;
                if (maxSlope === null || deg > maxSlope) maxSlope = deg;
            }
        }
    }

    const warnings = [];
    if (!available) degradedWarnings([]).forEach(x => warnings.push(x));
    else if (withElev.length === 0) { warnings.push('area_outside_dem_coverage'); warnings.push('no_terrain_data'); }
    else if (withElev.length < samples.length) warnings.push('area_partially_outside_dem_coverage');
    if (spacingKm > 0.5) warnings.push('coarse_sampling');

    const elevs = withElev.map(x => x.elevation_m);
    const confidence = !available || withElev.length === 0 ? 'unknown'
        : (withElev.length < samples.length ? 'low' : 'medium');

    return {
        ok: true,
        kind: 'area_terrain',
        available: available,
        bbox: [w, s, e, n],
        polygon_filtered: !!norm.ring,
        grid: { cols: GRID_COLS, rows: GRID_ROWS, sampled: samples.length,
                with_elevation: withElev.length, spacing_km_approx: Math.round(spacingKm * 100) / 100 },
        elevation: {
            min_m: elevs.length ? Math.min.apply(null, elevs) : null,
            max_m: elevs.length ? Math.max.apply(null, elevs) : null,
            avg_m: elevs.length ? Math.round((elevs.reduce((a, b) => a + b, 0) / elevs.length) * 10) / 10 : null,
        },
        slope: {
            max_deg: maxSlope === null ? null : Math.round(maxSlope * 10) / 10,
            avg_deg: slopePairs ? Math.round((slopeSum / slopePairs) * 10) / 10 : null,
            basis: 'grid_neighbor_pairs',
        },
        terrain_confidence: confidence,
        source: gisSource('area_terrain', 'bbox(' + [w, s, e, n].map(v => v.toFixed(3)).join(',') + ')'),
        needs_review: true,
        warnings: warnings,
    };
}

/* ── D. landing-zone suitability ────────────────────────────────────────── */
// Min distance (km) from the area centroid to a supplied coastline layer.
// Accepted layer shapes: [[lon,lat]…] · GeoJSON LineString / MultiLineString /
// Feature(s) thereof. Returns null when no usable geometry was supplied.
function coastDistanceKm(centroid, coastline) {
    const pts = [];
    const push = c => { if (Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1])) pts.push(c); };
    const walk = g => {
        if (!g) return;
        if (Array.isArray(g)) { g.forEach(x => Array.isArray(x) && Array.isArray(x[0]) ? walk(x) : push(x)); return; }
        if (g.type === 'FeatureCollection') return (g.features || []).forEach(walk);
        if (g.type === 'Feature') return walk(g.geometry);
        if (g.type === 'LineString') return g.coordinates.forEach(push);
        if (g.type === 'MultiLineString' || g.type === 'Polygon') return g.coordinates.forEach(r => r.forEach(push));
    };
    walk(coastline);
    if (!pts.length) return null;
    let min = Infinity;
    for (const p of pts) {
        const d = haversineKm(centroid, p);
        if (d < min) min = d;
    }
    return Math.round(min * 100) / 100;
}

function analyzeLandingZoneSuitability(area, opts) {
    const o = (opts && typeof opts === 'object') ? opts : {};
    const base = analyzeAreaTerrain(area);
    if (!base.ok) return base;
    const [w, s, e, n] = base.bbox;

    // size check (bbox approximation — honest label)
    const widthKm  = haversineKm([w, (s + n) / 2], [e, (s + n) / 2]);
    const heightKm = haversineKm([(w + e) / 2, s], [(w + e) / 2, n]);
    const areaKm2 = Math.round(widthKm * heightKm * 100) / 100;
    const sizeOk = areaKm2 >= INTERIM.lz_min_area_km2;

    // coast proximity (only when the caller supplies a coastline layer)
    const centroid = [(w + e) / 2, (s + n) / 2];
    const coastKm = coastDistanceKm(centroid, o.coastline);
    const nearCoast = coastKm === null ? null : coastKm <= INTERIM.lz_near_coast_km;

    const warnings = base.warnings.slice();
    if (coastKm === null) warnings.push('no_coastline_layer');

    // flatness from the area slope summary
    const avgSlope = base.slope.avg_deg;
    let flatness = 'unknown';
    if (base.terrain_confidence !== 'unknown' && avgSlope !== null) {
        flatness = avgSlope <= INTERIM.lz_flat_max_avg_deg ? 'flat'
            : avgSlope <= INTERIM.lz_marginal_max_avg_deg ? 'moderate' : 'steep';
    }

    // verdict — unknown stays unknown (no invention); geometry-only facts
    // (size) can still mark a zone unsuitable without a DEM.
    let suitability;
    if (!sizeOk) suitability = 'unsuitable';
    else if (flatness === 'unknown') suitability = 'unknown';
    else if (flatness === 'flat' && (nearCoast !== false)) suitability = 'suitable';
    else if (flatness === 'steep') suitability = 'unsuitable';
    else suitability = 'marginal';

    return {
        ok: true,
        kind: 'landing_zone_suitability',
        available: base.available,
        bbox: base.bbox,
        factors: {
            flatness: flatness,
            avg_slope_deg: avgSlope,
            max_slope_deg: base.slope.max_deg,
            area_km2: areaKm2, size_ok: sizeOk,
            coast_distance_km: coastKm, near_coast: nearCoast,
        },
        suitability: suitability,                         // suitable | marginal | unsuitable | unknown
        thresholds: Object.assign({
            flat_max_avg_deg: INTERIM.lz_flat_max_avg_deg,
            marginal_max_avg_deg: INTERIM.lz_marginal_max_avg_deg,
            min_area_km2: INTERIM.lz_min_area_km2,
            near_coast_km: INTERIM.lz_near_coast_km,
        }, interimNote()),
        terrain_confidence: base.terrain_confidence,
        source: gisSource('landing_zone_suitability', 'bbox(' + base.bbox.map(v => v.toFixed(3)).join(',') + ')'),
        needs_review: true,
        warnings: warnings,
    };
}

/* ── Planning-model integration (T-2 helpers reused; no PM edits) ───────── */
// Each attaches a CLONE of the analysis to model.terrain_analysis with a
// reference stamp; the analysis input is never mutated and an existing valid
// source on it is preserved (PM.attachTerrainAnalysis / withSource semantics).
function attachWithRef(model, refKind, refId, analysis) {
    const entry = Object.assign(clone(analysis) || {}, {
        ref_kind: refKind,
        ref_id: refId == null ? null : String(refId),
    });
    return PM.attachTerrainAnalysis(model, entry, {
        key: (analysis && analysis.kind) || refKind,
        origin: refKind + ':' + (refId == null ? '?' : String(refId)),
    });
}
function attachRouteTerrain(model, routeId, analysis)      { return attachWithRef(model, 'route', routeId, analysis); }
function attachLocationTerrain(model, candidateId, analysis) { return attachWithRef(model, 'location_candidate', candidateId, analysis); }
function attachLandingZoneTerrain(model, lzId, analysis)   { return attachWithRef(model, 'landing_zone', lzId, analysis); }

module.exports = {
    analyzePointTerrain,
    analyzeRouteTerrain,
    analyzeAreaTerrain,
    analyzeLandingZoneSuitability,
    attachRouteTerrain,
    attachLocationTerrain,
    attachLandingZoneTerrain,
    INTERIM,
    // exposed for tests:
    _internal: { normalizeArea, pointInRing, coastDistanceKm, mobilityFromSlope },
};
