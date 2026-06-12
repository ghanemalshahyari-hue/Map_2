/**
 * Terrain API — GIS-TERRAIN-1 / T-1 (design: docs/gis-terrain-integration-design.md §3, §12).
 *
 * Wires the previously ORPHANED dem-service.js behind three SAFE, READ-ONLY
 * endpoints. No writes, no scenario mutation, no COA/tasking behavior change.
 * Missing DEM degrades gracefully (structured availability + warnings — never
 * a crash): terrain is an enhancer, never a dependency.
 *
 *   GET  /api/terrain/health          service availability, dataset, cache, ops
 *   GET  /api/terrain/elevation?lat=&lon=
 *        point elevation · source.type = terrain_layer (direct data read)
 *   POST /api/terrain/profile         { points: [{lat,lon}|[lon,lat], ...] }
 *        sampled elevation profile + distance + min/max + slope summary ·
 *        source.type = gis_analysis (derived computation) · needs_review:true
 *        (slope thresholds are INTERIM constants pending doctrine rule cards, G-6)
 *
 * Source stamps come from planning-model.makeSource so the T-2 taxonomy
 * (terrain_layer trust 3 / gis_analysis trust 2, L15 precedence) is the single
 * authority for provenance shape.
 */
'use strict';

const path = require('path');
const fs   = require('fs');

const dem = require('./dem-service');
const PM  = require(path.join(__dirname, 'ai', 'planning-model.js'));
// Reuse the proven great-circle helper instead of duplicating it.
const { haversineKm } = require(path.join(__dirname, 'ai', 'scenario-normalizer.js'));

// INTERIM mobility thresholds (degrees). Real values belong in doctrine rule
// cards (G-6, owner ruling L7/L8) — every profile response flags these as
// interim + needs_review so they are never mistaken for doctrine.
const SLOPE_SLOW_GO_DEG = 15;
const SLOPE_NO_GO_DEG   = 30;

const MAX_PROFILE_POINTS  = 64;    // route vertices accepted
const MAX_PROFILE_SAMPLES = 256;   // total elevation samples per request

const DEM_FILE = path.basename(String(dem.DEM_PATH || 'dem'));

function srcTerrainLayer(origin, confidence) {
    return PM.makeSource({ type: 'terrain_layer', file: DEM_FILE, key: 'elevation',
                           origin: origin || null, confidence: confidence || null });
}
function srcGisAnalysis(key, origin) {
    return PM.makeSource({ type: 'gis_analysis', file: DEM_FILE, key: key,
                           origin: origin || null });
}

function insideCoverage(lon, lat) {
    const m = dem.getMeta();
    return lon >= m.west && lon <= m.east && lat >= m.south && lat <= m.north;
}

/* ── health ─────────────────────────────────────────────────────────────── */
function health() {
    const available = dem.isAvailable();
    let cache = { dir: dem.CACHE_DIR, exists: false, zoom_levels: 0 };
    try {
        if (fs.existsSync(dem.CACHE_DIR)) {
            cache.exists = true;
            cache.zoom_levels = fs.readdirSync(dem.CACHE_DIR)
                .filter(d => /^\d+$/.test(d)).length;
        }
    } catch (_) { /* cache status is best-effort, never fatal */ }

    const out = {
        ok: true,
        service: 'terrain',
        available: available,
        dem_path: dem.DEM_PATH,
        dem_exists: available,
        cache: cache,
        operations: ['health', 'elevation', 'profile'],
        source_types: { point: 'terrain_layer', analysis: 'gis_analysis' },
        warnings: [],
    };
    if (available) {
        const m = dem.getMeta();
        out.coverage = { west: m.west, south: m.south, east: m.east, north: m.north };
        out.resolution_deg = { x: m.pixelX, y: m.pixelY };
    } else {
        out.warnings.push('dem_not_configured: set DEM_PATH (see .env.offline) — terrain features degrade gracefully without it');
    }
    return out;
}

/* ── point elevation ────────────────────────────────────────────────────── */
function elevationAt(lat, lon) {
    const warnings = [];
    let elevation = null;
    let confidence = 'high';

    if (!dem.isAvailable()) {
        warnings.push('dem_not_configured');
        confidence = 'low';
    } else if (!insideCoverage(lon, lat)) {
        warnings.push('outside_dem_coverage');
        confidence = 'low';
    } else {
        elevation = dem.getElevation(lon, lat);
        if (elevation === null) { warnings.push('no_data_at_point'); confidence = 'low'; }
    }
    return {
        ok: true,
        lat: lat, lon: lon,
        elevation_m: elevation,
        available: dem.isAvailable(),
        source: srcTerrainLayer(lon.toFixed(5) + ',' + lat.toFixed(5), confidence),
        confidence: confidence,
        warnings: warnings,
    };
}

/* ── route profile ──────────────────────────────────────────────────────── */
// Accept [{lat,lon}, …] or [[lon,lat], …]; returns null on a malformed vertex.
function normPoint(p) {
    if (Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1])) {
        return { lon: p[0], lat: p[1] };                       // GeoJSON order
    }
    if (p && typeof p === 'object' && Number.isFinite(p.lat) && Number.isFinite(p.lon)) {
        return { lon: p.lon, lat: p.lat };
    }
    return null;
}
function validCoord(pt) {
    return pt && pt.lat >= -90 && pt.lat <= 90 && pt.lon >= -180 && pt.lon <= 180;
}

function profileFor(rawPoints) {
    const pts = [];
    for (const raw of rawPoints) {
        const p = normPoint(raw);
        if (!p || !validCoord(p)) return { error: 'every route point must be {lat,lon} or [lon,lat] with valid earth coordinates' };
        pts.push(p);
    }
    if (pts.length < 2) return { error: 'profile requires at least 2 route points' };
    if (pts.length > MAX_PROFILE_POINTS) return { error: 'profile accepts at most ' + MAX_PROFILE_POINTS + ' route points' };

    const available = dem.isAvailable();
    const warnings = available ? [] : ['dem_not_configured'];

    // Segment lengths → total distance (always computable, DEM or not).
    const segKm = [];
    let distanceKm = 0;
    for (let i = 1; i < pts.length; i++) {
        const d = haversineKm([pts[i - 1].lon, pts[i - 1].lat], [pts[i].lon, pts[i].lat]);
        segKm.push(d);
        distanceKm += d;
    }

    // Sample along the route: ~1 sample / 200 m, bounded per segment and in total.
    const samples = [];
    let cum = 0;
    for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        const remainingBudget = MAX_PROFILE_SAMPLES - samples.length;
        if (remainingBudget <= 1) break;
        const n = Math.max(2, Math.min(Math.ceil(segKm[i - 1] / 0.2) + 1,
                                       Math.ceil(remainingBudget / (pts.length - i))));
        const startK = (i === 1) ? 0 : 1;                       // skip duplicated vertex
        for (let k = startK; k < n; k++) {
            const t = k / (n - 1);
            const lon = a.lon + (b.lon - a.lon) * t;
            const lat = a.lat + (b.lat - a.lat) * t;
            const dKm = cum + segKm[i - 1] * t;
            const elev = available ? dem.getElevation(lon, lat) : null;
            samples.push({ d_km: Math.round(dKm * 1000) / 1000,
                           lon: Math.round(lon * 1e6) / 1e6,
                           lat: Math.round(lat * 1e6) / 1e6,
                           elevation_m: elev === null ? null : Math.round(elev * 10) / 10 });
        }
        cum += segKm[i - 1];
    }

    const withElev = samples.filter(s => s.elevation_m !== null);
    if (available && withElev.length === 0) warnings.push('route_outside_dem_coverage');
    else if (available && withElev.length < samples.length) warnings.push('route_partially_outside_dem_coverage');

    // Slope between consecutive elevated samples.
    let maxSlope = null, slopeSum = 0, slopePairs = 0, steep = 0, noGo = 0;
    for (let i = 1; i < samples.length; i++) {
        const a = samples[i - 1], b = samples[i];
        if (a.elevation_m === null || b.elevation_m === null) continue;
        const runM = (b.d_km - a.d_km) * 1000;
        if (runM <= 0) continue;
        const slopeDeg = Math.abs(Math.atan2(b.elevation_m - a.elevation_m, runM) * 180 / Math.PI);
        slopePairs++;
        slopeSum += slopeDeg;
        if (maxSlope === null || slopeDeg > maxSlope) maxSlope = slopeDeg;
        if (slopeDeg > SLOPE_NO_GO_DEG) noGo++;
        else if (slopeDeg > SLOPE_SLOW_GO_DEG) steep++;
    }

    const elevs = withElev.map(s => s.elevation_m);
    return {
        ok: true,
        available: available,
        point_count: pts.length,
        sample_count: samples.length,
        distance_km: Math.round(distanceKm * 1000) / 1000,
        elevation: {
            min_m: elevs.length ? Math.min.apply(null, elevs) : null,
            max_m: elevs.length ? Math.max.apply(null, elevs) : null,
            start_m: samples.length ? samples[0].elevation_m : null,
            end_m: samples.length ? samples[samples.length - 1].elevation_m : null,
        },
        slope: {
            max_deg: maxSlope === null ? null : Math.round(maxSlope * 10) / 10,
            avg_deg: slopePairs ? Math.round((slopeSum / slopePairs) * 10) / 10 : null,
            slow_go_segments: steep,
            no_go_segments: noGo,
            thresholds: {
                slow_go_deg: SLOPE_SLOW_GO_DEG, no_go_deg: SLOPE_NO_GO_DEG,
                interim: true,
                basis: 'interim constants — doctrine rule cards (G-6) will own these',
            },
        },
        coverage: { sampled: samples.length, with_elevation: withElev.length },
        samples: samples,
        source: srcGisAnalysis('elevation_profile', 'route(' + pts.length + ' pts)'),
        needs_review: true,
        warnings: warnings,
    };
}

/* ── body reader (strict JSON; small) ───────────────────────────────────── */
function readBody(req, cb) {
    var chunks = [], size = 0, MAX = 1000000;
    req.on('data', function (d) { size += d.length; if (size <= MAX) chunks.push(d); });
    req.on('error', function () { cb(undefined); });
    req.on('end', function () {
        if (!chunks.length) return cb(null);
        try { cb(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch (_) { cb(undefined); }
    });
}

/* ── HTTP dispatch (same contract as the other bridges) ─────────────────── */
function handle(req, res, ctx) {
    const { url, pathname, method, sendJson } = ctx;
    if (!pathname.startsWith('/api/terrain/')) return false;

    try {
        if (pathname === '/api/terrain/health' && method === 'GET') {
            sendJson(res, 200, health());
            return true;
        }

        if (pathname === '/api/terrain/elevation' && method === 'GET') {
            const lat = parseFloat(url.searchParams.get('lat'));
            const lon = parseFloat(url.searchParams.get('lon'));
            if (!Number.isFinite(lat) || !Number.isFinite(lon) ||
                lat < -90 || lat > 90 || lon < -180 || lon > 180) {
                sendJson(res, 400, { ok: false, error: 'lat and lon query params required (lat -90..90, lon -180..180)' });
                return true;
            }
            sendJson(res, 200, elevationAt(lat, lon));
            return true;
        }

        if (pathname === '/api/terrain/profile' && method === 'POST') {
            readBody(req, function (body) {
                if (body === undefined) { sendJson(res, 400, { ok: false, error: 'body is not valid JSON' }); return; }
                const points = body && (Array.isArray(body.points) ? body.points
                    : Array.isArray(body.route) ? body.route : null);
                if (!points) { sendJson(res, 400, { ok: false, error: 'JSON body must carry points: [{lat,lon}|[lon,lat], ...]' }); return; }
                const out = profileFor(points);
                if (out.error) { sendJson(res, 400, { ok: false, error: out.error }); return; }
                sendJson(res, 200, out);
            });
            return true;
        }

        sendJson(res, 404, { ok: false, error: 'unknown terrain endpoint (have: health, elevation, profile)' });
        return true;
    } catch (e) {
        sendJson(res, 500, { ok: false, error: 'terrain endpoint failed: ' + (e && e.message) });
        return true;
    }
}

module.exports = {
    handle,
    // exposed for tests:
    health,
    elevationAt,
    profileFor,
    SLOPE_SLOW_GO_DEG,
    SLOPE_NO_GO_DEG,
};
