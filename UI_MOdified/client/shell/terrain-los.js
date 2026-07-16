/* ============================================================================
 * terrain-los.js — Batch E Slice 2: terrain-aware line-of-sight geometry
 * ----------------------------------------------------------------------------
 * Pure geometry only — no DEM access, no fetch, no DOM. Given an elevation
 * profile sampled along the observer->target line (the exact shape
 * server/terrain-api.js::profileFor() already returns) plus the two ends'
 * absolute eye-height elevations (terrain + height-above-ground), decides
 * whether any intermediate terrain sample pokes above the straight sight
 * line connecting them — the standard viewshed/profile LOS check.
 *
 * This is the DET2 hook's geometry half. The DEM-fetching half lives
 * server-side (server/sim/terrain-los-bridge.js) because only the server has
 * synchronous elevation access (dem-service.js reads the GeoTIFF directly);
 * this file itself has no DEM dependency so it can be unit-tested with
 * synthetic samples and reused from either side if a client-side LOS source
 * is ever wired up.
 *
 * SAFETY: pure data, framework-free (browser + Node), matches detection.js's
 * own conventions exactly.
 * ========================================================================== */
(function (root) {
    'use strict';

    var TERRAIN_LOS_VERSION = '1.0.0-los1';

    // samples: [{d_km, elevation_m}], sorted by d_km ascending, spanning the
    // full observer->target line (the first/last sample need not be exactly
    // at 0/total distance — the straight-line interpolation uses each
    // sample's own d_km fraction of the total span).
    // obsElevM/tgtElevM: absolute elevation (metres) of the observer's and
    // target's eye/sensor height — i.e. terrain elevation at that end PLUS
    // height above ground, not terrain elevation alone.
    // opts.clearance_m: extra margin (metres) terrain must clear the sight
    // line by before it's NOT considered blocking — defaults to 0.
    //
    // Missing/unavailable data never blocks: a sample with elevation_m==null,
    // fewer than 2 samples, or a zero-length line all return false (clear) —
    // terrain is an enhancer, never a dependency (matches terrain-api.js's
    // own stated philosophy for the rest of the DEM stack).
    function isLosBlocked(samples, obsElevM, tgtElevM, opts) {
        opts = opts || {};
        var clearance = (typeof opts.clearance_m === 'number') ? opts.clearance_m : 0;
        if (!Array.isArray(samples) || samples.length < 2) return false;
        if (typeof obsElevM !== 'number' || typeof tgtElevM !== 'number') return false;
        var d0 = samples[0].d_km, dN = samples[samples.length - 1].d_km;
        var totalKm = dN - d0;
        if (!(totalKm > 0)) return false;
        for (var i = 1; i < samples.length - 1; i++) {
            var s = samples[i];
            if (!s || typeof s.elevation_m !== 'number') continue;
            var t = (s.d_km - d0) / totalKm;
            var sightHeightM = obsElevM + (tgtElevM - obsElevM) * t;
            if (s.elevation_m > sightHeightM + clearance) return true;
        }
        return false;
    }

    var api = {
        TERRAIN_LOS_VERSION: TERRAIN_LOS_VERSION,
        isLosBlocked: isLosBlocked
    };
    root.AppTerrainLos = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
