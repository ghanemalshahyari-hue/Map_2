#!/usr/bin/env node
/**
 * test-terrain-los-slice2.js — Batch E Slice 2 (DET2), HARDENED.
 *
 * Covers the owner's eight hardening criteria:
 *   1. sensor/range candidate filtering BEFORE any terrain profile request;
 *   2. terrain sampling never happens inside the synchronous losBlocked lookup;
 *   3. bounded LRU cache;
 *   4. cache key includes DEM version, obs+tgt coords, obs+tgt heights,
 *      sampling resolution, and a movement/revision generation token;
 *   5. movement or revision changes naturally miss/invalidate the cache;
 *   6. missing DEM / sampling failure stays fail-open but exposes
 *      terrain_los_status + terrain_los_reason;
 *   7. that degraded status is observable (not swallowed);
 *   8. scale: unreachable pairs trigger no DEM work; cache growth is bounded.
 *
 * No real DEM is configured in this dev env, so behavior is proven via the
 * injectable profileFn seam and by monkey-patching the real cached
 * terrain-api.js module for the full-wiring check.
 *
 *   node test-terrain-los-slice2.js
 */
'use strict';

const path = require('path');
const ROOT = __dirname;

let pass = 0, fail = 0;
function ok(cond, label, detail) {
    if (cond) { console.log('  PASS  ' + label); pass++; }
    else      { console.error('  FAIL  ' + label + (detail ? ' — ' + detail : '')); fail++; }
}
function eq(a, b, label) { ok(a === b, label, 'expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a)); }

const terrainLos = require(path.join(ROOT, 'UI_MOdified/client/shell/terrain-los.js'));
const bridge     = require(path.join(ROOT, 'UI_MOdified/server/sim/terrain-los-bridge.js'));
const detection  = require(path.join(ROOT, 'UI_MOdified/client/shell/detection.js'));

// A blocking ridge profile / a clear profile, for injection.
function ridgeProfile() { return { ok: true, available: true, samples: [{ d_km: 0, elevation_m: 0 }, { d_km: 2, elevation_m: 900 }, { d_km: 4, elevation_m: 0 }] }; }
function clearProfile() { return { ok: true, available: true, samples: [{ d_km: 0, elevation_m: 0 }, { d_km: 2, elevation_m: 1 }, { d_km: 4, elevation_m: 0 }] }; }

function twoUnits(dLon) {
    return { units: [
        { uid: 'RED-1', side: 'RED', domain: 'ground', position: [10, 30],
          sensors: [{ id: 's1', type: 'radar', class: 'surface_search', emcon: 'active' }] },
        { uid: 'BLUE-1', side: 'BLUE', domain: 'ground', position: [10 + dLon, 30] },
    ] };
}

console.log('\n=== Part 1: isLosBlocked — pure sight-line geometry (unchanged) ===\n');
(function pureGeometry() {
    ok(!terrainLos.isLosBlocked([{ d_km: 0, elevation_m: 0 }, { d_km: 10, elevation_m: 0 }], 10, 10), 'flat terrain never blocks');
    ok(terrainLos.isLosBlocked([{ d_km: 0, elevation_m: 0 }, { d_km: 5, elevation_m: 500 }, { d_km: 10, elevation_m: 0 }], 9, 9), 'a tall ridge blocks');
    ok(!terrainLos.isLosBlocked([{ d_km: 0, elevation_m: 0 }, { d_km: 5, elevation_m: 3 }, { d_km: 10, elevation_m: 0 }], 9, 9), 'a low bump does not block');
    ok(!terrainLos.isLosBlocked([{ d_km: 0, elevation_m: 500 }], 9, 9), 'fewer than 2 samples never blocks');
})();

console.log('\n=== Part 2: elevation/height reuse detection.js defaults ===\n');
(function elevation() {
    eq(bridge.unitHeightFt({ altitude_ft: 1000 }), 1000, 'authored altitude_ft used directly');
    eq(bridge.unitHeightFt({ domain: 'air' }), detection.DEFAULT_DB.alt_ft_by_domain.air, 'air height falls back to detection.js air default');
    eq(bridge.unitElevationM({ domain: 'ground' }, 50), 50 + detection.DEFAULT_DB.alt_ft_by_domain.ground * 0.3048, 'elevation = terrain + height(ft->m)');
})();

console.log('\n=== Part 3: precomputeLos — pure lookup, injected profile, blocked/clear ===\n');
(function precompute() {
    const blockedRun = bridge.precomputeLos(twoUnits(0.05), { profileFn: ridgeProfile, cache: bridge.makeLruCache(64), demVersion: 'test-dem-v1' });
    const obs = twoUnits(0.05).units[0], tgt = twoUnits(0.05).units[1];
    ok(blockedRun.losBlocked(obs, tgt) === true, 'a ridge between the pair -> losBlocked true');
    eq(blockedRun.status.terrain_los_status, 'evaluated', 'status is evaluated when DEM available');
    eq(blockedRun.status.terrain_los_reason, null, 'no degraded reason on a clean run');
    ok(blockedRun.status.sampled_pairs >= 1, 'at least one pair was sampled');

    const clearRun = bridge.precomputeLos(twoUnits(0.05), { profileFn: clearProfile, cache: bridge.makeLruCache(64), demVersion: 'test-dem-v1' });
    eq(clearRun.losBlocked(obs, tgt), false, 'a clear profile -> losBlocked false');
})();

console.log('\n=== Part 4: losBlocked is a PURE lookup — it never samples terrain ===\n');
(function pureLookupNeverSamples() {
    let sampleCalls = 0;
    const profileFn = function () { sampleCalls++; return ridgeProfile(); };
    const run = bridge.precomputeLos(twoUnits(0.05), { profileFn, cache: bridge.makeLruCache(64), demVersion: 'v' });
    const callsAfterPrecompute = sampleCalls;
    const obs = twoUnits(0.05).units[0], tgt = twoUnits(0.05).units[1];
    // Hammer the lookup — this is what DET1's synchronous loop does.
    for (let i = 0; i < 50; i++) run.losBlocked(obs, tgt);
    eq(sampleCalls, callsAfterPrecompute, 'calling losBlocked 50x triggers ZERO additional profile samples (all sampling happened in precompute)');
    ok(callsAfterPrecompute >= 1, 'sampling did happen — during precompute, not the lookup');
})();

console.log('\n=== Part 5 (criterion 1 & 8): unreachable pairs are culled BEFORE any DEM work ===\n');
(function candidateCulling() {
    let sampleCalls = 0;
    const profileFn = function () { sampleCalls++; return ridgeProfile(); };
    // surface_search radar ref ~60nm; bound = 60 * 4 = 240nm, capped 1500. Put
    // the target ~600nm away (dLon ~9 deg at 30N ~ 520nm; use 12 deg ~ 690nm).
    const far = bridge.precomputeLos(twoUnits(12), { profileFn, cache: bridge.makeLruCache(64), demVersion: 'v' });
    eq(sampleCalls, 0, 'a pair far beyond sensor range triggers NO terrain profile at all');
    eq(far.status.culled_pairs, 1, 'the unreachable pair is counted as culled');
    eq(far.status.sampled_pairs, 0, 'nothing was sampled');
    const obs = twoUnits(12).units[0], tgt = twoUnits(12).units[1];
    eq(far.losBlocked(obs, tgt), false, 'a culled pair is never blocked (fail-open — LOS only suppresses in-range pairs)');

    // In-range pair DOES sample.
    let near = 0;
    bridge.precomputeLos(twoUnits(0.3), { profileFn: function () { near++; return clearProfile(); }, cache: bridge.makeLruCache(64), demVersion: 'v' });
    ok(near >= 1, 'an in-range pair IS sampled');
})();

console.log('\n=== Part 6 (criterion 3 & 8): bounded LRU cache growth ===\n');
(function boundedLru() {
    const cache = bridge.makeLruCache(10);
    for (let i = 0; i < 100; i++) cache.set('k' + i, i % 2 === 0);
    eq(cache.size, 10, 'cache never grows beyond its capacity of 10 despite 100 inserts');
    ok(cache.has('k99') && !cache.has('k0'), 'LRU keeps the most recent, evicts the oldest');
    // get() promotes recency.
    const c2 = bridge.makeLruCache(3);
    c2.set('a', 1); c2.set('b', 1); c2.set('c', 1); c2.get('a'); c2.set('d', 1);
    ok(c2.has('a') && !c2.has('b'), 'get() promotes recency so the touched key survives eviction');
})();

console.log('\n=== Part 7 (criterion 4 & 5): cache key + movement/revision invalidation ===\n');
(function cacheKeyInvalidation() {
    const cache = bridge.makeLruCache(64);
    let samples = 0;
    const profileFn = function () { samples++; return clearProfile(); };

    bridge.precomputeLos(twoUnits(0.3), { profileFn, cache, demVersion: 'v1', generation: 1 });
    const afterFirst = samples;
    // Same units, same generation, same DEM -> cache HIT, no new sample.
    bridge.precomputeLos(twoUnits(0.3), { profileFn, cache, demVersion: 'v1', generation: 1 });
    eq(samples, afterFirst, 'an identical re-run (same coords, generation, DEM) hits the cache — no new sampling');

    // Generation bump (revision change) -> miss.
    bridge.precomputeLos(twoUnits(0.3), { profileFn, cache, demVersion: 'v1', generation: 2 });
    ok(samples > afterFirst, 'a generation (revision) bump misses the cache -> re-samples');
    const afterGen = samples;

    // Unit moved (different coords) -> miss.
    bridge.precomputeLos(twoUnits(0.35), { profileFn, cache, demVersion: 'v1', generation: 2 });
    ok(samples > afterGen, 'a moved unit (changed coordinates) misses the cache -> re-samples');
    const afterMove = samples;

    // DEM version change -> miss.
    bridge.precomputeLos(twoUnits(0.35), { profileFn, cache, demVersion: 'v2-different-dem', generation: 2 });
    ok(samples > afterMove, 'a DEM dataset version change misses the cache -> re-samples');

    // Height change (altitude) -> miss. Same coords/gen/DEM but observer higher.
    const beforeHeight = samples;
    const hi = twoUnits(0.35); hi.units[0].altitude_ft = 25000;
    bridge.precomputeLos(hi, { profileFn, cache, demVersion: 'v2-different-dem', generation: 2 });
    ok(samples > beforeHeight, 'an observer height/elevation change misses the cache -> re-samples');

    // Confirm the key literally contains all required components.
    const key = bridge.losCacheKey('demX', hi.units[0], hi.units[1], bridge.COORD_QUANTUM, 7);
    ok(key.indexOf('demX') !== -1, 'cache key includes the DEM version');
    ok(key.indexOf('25000') !== -1, 'cache key includes observer height');
    ok(key.indexOf('|7') !== -1 || key.indexOf('7') === key.length - 1, 'cache key includes the generation token');
    ok(key.indexOf(String(bridge.COORD_QUANTUM)) !== -1, 'cache key includes the sampling resolution');
})();

console.log('\n=== Part 8 (criterion 6 & 7): fail-open with EXPOSED status ===\n');
(function exposedStatus() {
    // DEM unavailable.
    const noDem = bridge.precomputeLos(twoUnits(0.3), { demVersion: 'unavailable', cache: bridge.makeLruCache(8) });
    eq(noDem.status.terrain_los_status, 'not_evaluated', 'DEM unavailable -> terrain_los_status not_evaluated');
    eq(noDem.status.terrain_los_reason, 'dem_unavailable', 'reason dem_unavailable');
    const obs = twoUnits(0.3).units[0], tgt = twoUnits(0.3).units[1];
    eq(noDem.losBlocked(obs, tgt), false, 'DEM unavailable is fail-open — never blocks');

    // Profile throws -> profile_error, fail-open, status surfaced.
    const errRun = bridge.precomputeLos(twoUnits(0.3), { profileFn: function () { throw new Error('boom'); }, cache: bridge.makeLruCache(8), demVersion: 'v' });
    eq(errRun.status.terrain_los_reason, 'profile_error', 'a throwing profiler surfaces reason profile_error');
    eq(errRun.status.terrain_los_status, 'not_evaluated', 'all-error run downgrades status to not_evaluated (not silently "clear")');
    eq(errRun.losBlocked(obs, tgt), false, 'profile error is fail-open — never blocks/fabricates');

    // Outside coverage / no elevation -> unsupported_area.
    const unsup = bridge.precomputeLos(twoUnits(0.3), { profileFn: function () { return { ok: true, available: true, samples: [{ d_km: 0, elevation_m: null }, { d_km: 4, elevation_m: null }] }; }, cache: bridge.makeLruCache(8), demVersion: 'v' });
    eq(unsup.status.terrain_los_reason, 'unsupported_area', 'all-null-elevation samples surface reason unsupported_area');
    eq(unsup.losBlocked(obs, tgt), false, 'unsupported area is fail-open');
})();

console.log('\n=== Part 9: full wiring world-state.js -> precomputeLos -> terrain-api.js ===\n');
(function fullWiring() {
    const terrainApiModule = require(path.join(ROOT, 'UI_MOdified/server/terrain-api.js'));
    const originalProfileFor = terrainApiModule.profileFor;
    const demSvc = require(path.join(ROOT, 'UI_MOdified/server/dem-service.js'));
    const originalIsAvailable = demSvc.isAvailable;

    // The full-wiring path uses the module-level PERSISTENT cache (world-state
    // doesn't inject one). Terrain for a fixed DEM+coords is stable, so a fixed
    // key legitimately caches. To model two DIFFERENT terrain realities we bump
    // the revision (generation) per run — exactly how a real new tick would
    // miss the cache (criterion 5), rather than expecting a stale key to
    // re-sample.
    function ws(revision) {
        return { units: [
            { uid: 'RED-1', side: 'RED', domain: 'ground', position: [10, 30],
              sensors: [{ id: 's1', type: 'radar', class: 'surface_search', emcon: 'active' }] },
            { uid: 'BLUE-1', side: 'BLUE', domain: 'ground', position: [10.05, 30] },
        ], meta: { revision: revision } };
    }
    try {
        // Force DEM "available" so precompute runs, and feed synthetic terrain.
        demSvc.isAvailable = function () { return true; };

        terrainApiModule.profileFor = ridgeProfile;
        delete require.cache[require.resolve(path.join(ROOT, 'UI_MOdified/client/shell/world-state.js'))];
        const ws1 = require(path.join(ROOT, 'UI_MOdified/client/shell/world-state.js'));
        const state1 = ws(1);
        const blocked = ws1.computeContacts(state1);
        ok(!(Array.isArray(blocked) && blocked.some((c) => c.target_uid === 'BLUE-1')), 'ridge (via full wiring) suppresses the RED->BLUE contact');
        ok(state1.derived && state1.derived.terrain_los && state1.derived.terrain_los.terrain_los_status === 'evaluated',
            'ws.derived.terrain_los status is stashed for diagnostics/why-not UI');

        terrainApiModule.profileFor = clearProfile;
        delete require.cache[require.resolve(path.join(ROOT, 'UI_MOdified/client/shell/world-state.js'))];
        const ws2 = require(path.join(ROOT, 'UI_MOdified/client/shell/world-state.js'));
        const cleared = ws2.computeContacts(ws(2));   // new revision -> cache miss -> re-samples clear terrain
        ok(Array.isArray(cleared) && cleared.some((c) => c.target_uid === 'BLUE-1'), 'clear terrain at a new revision restores the contact (cache correctly invalidated by generation)');
    } finally {
        terrainApiModule.profileFor = originalProfileFor;
        demSvc.isAvailable = originalIsAvailable;
        try { delete require.cache[require.resolve(path.join(ROOT, 'UI_MOdified/client/shell/world-state.js'))]; } catch (_) {}
    }

    // Against the REAL (absent) DEM, detection is unchanged from pre-Slice-2.
    delete require.cache[require.resolve(path.join(ROOT, 'UI_MOdified/client/shell/world-state.js'))];
    const ws3 = require(path.join(ROOT, 'UI_MOdified/client/shell/world-state.js'));
    const realDem = ws3.computeContacts(ws(3));
    ok(Array.isArray(realDem) && realDem.some((c) => c.target_uid === 'BLUE-1'), 'with the real (absent) DEM, detection behaves exactly as pre-Slice-2 (no regression)');
})();

console.log('\n' + (fail === 0 ? 'OK' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
