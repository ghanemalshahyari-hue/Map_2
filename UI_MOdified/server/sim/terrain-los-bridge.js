'use strict';
/**
 * terrain-los-bridge.js — Batch E Slice 2 (DET2), HARDENED.
 *
 * Connects DET1's `opts.losBlocked(obs, tgt)` hook to real DEM terrain, but
 * with a strict separation of concerns so terrain sampling NEVER happens
 * inside DET1's synchronous `computeContacts` loop:
 *
 *   precomputeLos(worldState, opts)  ->  { losBlocked, status }
 *
 * `precomputeLos` runs BEFORE detection: it (1) candidate-filters pairs by
 * cross-side + great-circle range against a DB-driven sensor bound, so only
 * pairs a sensor could plausibly reach are considered; (2) looks each survivor
 * up in a bounded LRU cache keyed on DEM dataset version + quantized
 * observer/target coordinates + observer/target heights + sampling resolution
 * + a movement/revision generation token; (3) on a miss, samples the real DEM
 * via server/terrain-api.js::profileFor and stores the boolean result. The
 * returned `losBlocked` is a PURE synchronous lookup over the precomputed
 * result set — it performs no sampling, so DET1 stays synchronous and does
 * zero terrain I/O.
 *
 * Fail-open + non-silent: a missing DEM, a profile error, or an unsupported
 * area never suppresses or fabricates a contact (LOS only ever REMOVES a pair;
 * on any failure it declines to block). The degraded condition is exposed on
 * `status.terrain_los_status` / `status.terrain_los_reason` (surfaced to
 * diagnostics / the why-not UI), never swallowed.
 *
 * Server-only by construction (profileFor needs dem-service.js's synchronous
 * file-backed reads); the browser live-preview path stays LOS-agnostic.
 */

const path = require('path');
const fs   = require('fs');

const terrainApi = require('../terrain-api.js');
const dem        = require('../dem-service.js');
const terrainLos = require(path.join(__dirname, '..', '..', 'client', 'shell', 'terrain-los.js'));
const detection  = require(path.join(__dirname, '..', '..', 'client', 'shell', 'detection.js'));

const FT_TO_M = 0.3048;
const COORD_QUANTUM = 1e-4;          // ~11 m — cache/sampling resolution
const DEFAULT_LRU_CAPACITY = 4096;
const RANGE_BOUND_FACTOR = 4;        // covers RCS range-scaling (~3.76x for very_large) + ESM 1.5x
const MAX_LOS_RANGE_NM = 1500;       // beyond any real sensor+horizon reach — hard cap on candidate range

// ── great-circle range in NM (matches detection.js's own R=3440.065 nm) ─────
function nmBetween(a, b) {
    if (!a || !b) return null;
    const toR = Math.PI / 180, R = 3440.065;
    const dLat = (b[1] - a[1]) * toR, dLon = (b[0] - a[0]) * toR;
    const lat1 = a[1] * toR, lat2 = b[1] * toR;
    const h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Height above terrain (ft) — mirrors detection.js's altFt() fallback exactly
// (reuses its DEFAULT_DB.alt_ft_by_domain), so the cache key's height inputs
// match the elevations the geometry actually uses.
function unitHeightFt(unit) {
    if (unit && typeof unit.altitude_ft === 'number') return unit.altitude_ft;
    const domain = (unit && unit.domain) || 'ground';
    const table = detection.DEFAULT_DB.alt_ft_by_domain;
    return (table[domain] != null) ? table[domain] : 30;
}
function unitElevationM(unit, terrainElevationM) {
    const terrain = (typeof terrainElevationM === 'number') ? terrainElevationM : 0;
    return terrain + unitHeightFt(unit) * FT_TO_M;
}

// A stable fingerprint of the DEM dataset so a different/updated DEM naturally
// misses the cache. 'unavailable' when no DEM is configured.
function demVersionToken() {
    try {
        if (!dem.isAvailable()) return 'unavailable';
        let size = 0, mtime = 0;
        try { const st = fs.statSync(dem.DEM_PATH); size = st.size; mtime = Math.round(st.mtimeMs); } catch (_) {}
        const m = dem.getMeta();
        return [path.basename(String(dem.DEM_PATH || 'dem')), size, mtime,
                m.west, m.south, m.east, m.north, m.width, m.height].join(':');
    } catch (_) { return 'unknown'; }
}

let _maxRadarRefCache = null;
function maxRadarRefNm(db) {
    if (_maxRadarRefCache != null) return _maxRadarRefCache;
    let max = 0;
    const classes = (db && db.sensor_class) || {};
    Object.keys(classes).forEach(function (k) {
        const c = classes[k];
        if (c && c.type === 'radar' && typeof c.ref_range_nm === 'number' && c.ref_range_nm > max) max = c.ref_range_nm;
    });
    _maxRadarRefCache = max;
    return max;
}

// Candidate range bound (nm) for an observer: the farthest a contact could
// plausibly form, so pairs beyond it are culled BEFORE any DEM work. Never
// under-bounds a real detection (culling only ever fails-open by skipping a
// mask, never suppresses a contact), but tight enough to skip the O(N^2) long
// tail. ESM observers get a bound covering their passive reach (~1.5x the
// largest DB radar range) since their own ref range is 0.
function candidateBoundNm(obs, db) {
    const sensors = (obs && obs.sensors) || [];
    if (!sensors.length) return 0;
    let ownMax = 0, hasEsm = false;
    for (let i = 0; i < sensors.length; i++) {
        const s = sensors[i];
        const t = detection.sensorType(s, db);
        if (t === 'esm') hasEsm = true;
        const ref = detection.sensorRef(s, db);
        if (ref > ownMax) ownMax = ref;
    }
    let bound = ownMax;
    if (hasEsm) bound = Math.max(bound, maxRadarRefNm(db) * 1.5);
    bound = bound * RANGE_BOUND_FACTOR;
    return Math.min(bound, MAX_LOS_RANGE_NM);
}

function quant(n) { return Math.round(n / COORD_QUANTUM) * COORD_QUANTUM; }

function losCacheKey(demVer, obs, tgt, resolution, generation) {
    // Absolute elevation = terrain(coords, DEM) + height; coords + DEM version
    // + height are all in the key, so elevations are fully determined by it.
    return [demVer, resolution,
            quant(obs.position[0]), quant(obs.position[1]), unitHeightFt(obs),
            quant(tgt.position[0]), quant(tgt.position[1]), unitHeightFt(tgt),
            (generation == null ? '' : generation)].join('|');
}

// Bounded LRU (insertion-order Map; get promotes, set evicts oldest past cap).
function makeLruCache(capacity) {
    const cap = (typeof capacity === 'number' && capacity > 0) ? capacity : DEFAULT_LRU_CAPACITY;
    const map = new Map();
    return {
        capacity: cap,
        get size() { return map.size; },
        has: function (k) { return map.has(k); },
        get: function (k) {
            if (!map.has(k)) return undefined;
            const v = map.get(k); map.delete(k); map.set(k, v); return v;
        },
        set: function (k, v) {
            if (map.has(k)) map.delete(k);
            map.set(k, v);
            while (map.size > cap) { map.delete(map.keys().next().value); }
            return v;
        },
        clear: function () { map.clear(); }
    };
}

// Module-level default cache — persists across computeContacts calls so a unit
// that hasn't moved (same quantized coords + generation) hits the cache next
// tick; movement or a revision bump changes the key and naturally misses.
const _defaultCache = makeLruCache(DEFAULT_LRU_CAPACITY);

function markReason(status, reason) {
    status.error_pairs++;
    if (!status.terrain_los_reason) status.terrain_los_reason = reason;
}

// Samples the real DEM for ONE pair. Returns boolean blocked; on any failure
// returns false (fail-open) and records the reason on status.
function sampleLosForPair(profileFn, obs, tgt, opts, status) {
    try {
        const profile = profileFn([
            { lon: obs.position[0], lat: obs.position[1] },
            { lon: tgt.position[0], lat: tgt.position[1] },
        ]);
        if (!profile || profile.error) { markReason(status, 'profile_error'); return false; }
        if (profile.available === false) { markReason(status, 'dem_unavailable'); return false; }
        const samples = profile.samples || [];
        if (samples.length < 2) { markReason(status, 'unsupported_area'); return false; }
        if (!samples.some(function (s) { return typeof s.elevation_m === 'number'; })) {
            markReason(status, 'unsupported_area'); return false;
        }
        const obsElevM = unitElevationM(obs, samples[0].elevation_m);
        const tgtElevM = unitElevationM(tgt, samples[samples.length - 1].elevation_m);
        status.ok_pairs++;
        return terrainLos.isLosBlocked(samples, obsElevM, tgtElevM, opts);
    } catch (_) {
        markReason(status, 'profile_error');
        return false;
    }
}

/**
 * precomputeLos(worldState, opts) -> { losBlocked, status }
 *  opts.db          detection DB (defaults to detection.DEFAULT_DB)
 *  opts.profileFn   terrain profiler (defaults to terrainApi.profileFor) — injectable for tests
 *  opts.cache       LRU cache (defaults to the module-level persistent cache)
 *  opts.generation  movement/revision token folded into the cache key
 *  opts.clearance_m passed through to the sight-line geometry
 */
function precomputeLos(worldState, opts) {
    opts = opts || {};
    const db = opts.db || detection.DEFAULT_DB;
    const profileFn = opts.profileFn || terrainApi.profileFor;
    const cache = opts.cache || _defaultCache;
    const generation = (opts.generation != null) ? opts.generation : null;
    const demVer = (opts.demVersion != null) ? opts.demVersion : demVersionToken();
    const demAvailable = demVer !== 'unavailable';

    const results = new Map();   // 'obsUid|tgtUid' -> true (blocked)
    const status = {
        terrain_los_status: demAvailable ? 'evaluated' : 'not_evaluated',
        terrain_los_reason: demAvailable ? null : 'dem_unavailable',
        dem_version: demVer,
        candidate_pairs: 0, culled_pairs: 0, evaluated_pairs: 0,
        cached_hits: 0, sampled_pairs: 0, ok_pairs: 0, error_pairs: 0,
        cache_size: cache.size, cache_capacity: cache.capacity,
    };

    const units = Array.isArray(worldState && worldState.units) ? worldState.units : [];

    if (demAvailable) {
        for (let i = 0; i < units.length; i++) {
            const obs = units[i];
            if (!obs || !Array.isArray(obs.position) || !obs.sensors || !obs.sensors.length) continue;
            const bound = candidateBoundNm(obs, db);
            if (!(bound > 0)) continue;
            for (let j = 0; j < units.length; j++) {
                const tgt = units[j];
                if (!tgt || tgt === obs || !Array.isArray(tgt.position)) continue;
                if (tgt.side && obs.side && tgt.side === obs.side) continue;   // own side
                status.candidate_pairs++;
                const rng = nmBetween(obs.position, tgt.position);
                if (rng == null || rng > bound) { status.culled_pairs++; continue; }  // cull BEFORE any DEM work
                const key = losCacheKey(demVer, obs, tgt, COORD_QUANTUM, generation);
                let blocked;
                if (cache.has(key)) { blocked = cache.get(key); status.cached_hits++; }
                else { blocked = sampleLosForPair(profileFn, obs, tgt, opts, status); cache.set(key, blocked); status.sampled_pairs++; }
                status.evaluated_pairs++;
                if (blocked === true) results.set(obs.uid + '|' + tgt.uid, true);
            }
        }
        // If DEM was available but EVERY evaluated pair failed to sample
        // (systemic profile error / all-unsupported), surface not_evaluated so
        // the degrade is visible rather than looking like "all clear".
        if (status.evaluated_pairs > 0 && status.ok_pairs === 0 && status.terrain_los_reason) {
            status.terrain_los_status = 'not_evaluated';
        }
        status.cache_size = cache.size;
    }

    const losBlocked = function (o, t) {
        if (!o || !t) return false;
        return results.get(o.uid + '|' + t.uid) === true;   // pure lookup; never samples
    };
    return { losBlocked: losBlocked, status: status };
}

module.exports = {
    precomputeLos,
    makeLruCache,
    unitElevationM,
    unitHeightFt,
    candidateBoundNm,
    demVersionToken,
    losCacheKey,
    COORD_QUANTUM,
    DEFAULT_LRU_CAPACITY,
    MAX_LOS_RANGE_NM,
};
