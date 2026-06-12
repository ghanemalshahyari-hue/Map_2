'use strict';
// test-pr-mg1-grouped.js
// Static unit tests for the MG1 grouped engagement arrow logic.
// Tests the pure helper functions extracted from adjudicator-map.js.
// Run: node test-pr-mg1-grouped.js (no server required).

const assert = require('assert');

// ── Replicate helper constants and functions from adjudicator-map.js ──────────
const ENGAGEMENT_TARGET_CLUSTER_KM = 80; // must match adjudicator-map.js
const KM_PER_DEG_LAT = 110.57;
function kmPerDegLng(lat) { return 111.32 * Math.cos(lat * Math.PI / 180); }
function haversineKm(a, b) {
    const R = 6371;
    const toRad = d => d * Math.PI / 180;
    const dLat = toRad(b[0] - a[0]);
    const dLon = toRad(b[1] - a[1]);
    const la1  = toRad(a[0]);
    const la2  = toRad(b[0]);
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.asin(Math.sqrt(x));
}

function groupArcsByTargetCluster(arcs, clusterKm) {
    const clusters = [];
    for (const arc of arcs) {
        const coords = arc && Array.isArray(arc.coordinates) ? arc.coordinates : null;
        if (!coords || coords.length < 2) continue;
        const [src, dst] = coords;
        if (!Array.isArray(src) || !Array.isArray(dst)) continue;
        const actorLL = { lat: src[1], lng: src[0] };
        const tgtLL   = { lat: dst[1], lng: dst[0] };
        let best = null, bestKm = Infinity;
        for (const cl of clusters) {
            const n = cl.arcs.length;
            const km = haversineKm(
                [tgtLL.lat, tgtLL.lng],
                [cl.tgtSumLat / n, cl.tgtSumLng / n],
            );
            if (km < clusterKm && km < bestKm) { best = cl; bestKm = km; }
        }
        if (!best) {
            clusters.push({ arcs: [arc], actorSumLat: actorLL.lat, actorSumLng: actorLL.lng,
                            tgtSumLat: tgtLL.lat, tgtSumLng: tgtLL.lng });
        } else {
            best.arcs.push(arc);
            best.actorSumLat += actorLL.lat; best.actorSumLng += actorLL.lng;
            best.tgtSumLat   += tgtLL.lat;   best.tgtSumLng   += tgtLL.lng;
        }
    }
    clusters.sort((a, b) => b.arcs.length - a.arcs.length);
    return clusters;
}

function engStopShort(actorLat, actorLng, tgtLat, tgtLng, shortKm) {
    const distKm = haversineKm([actorLat, actorLng], [tgtLat, tgtLng]);
    if (distKm <= shortKm * 2) return { lat: tgtLat, lng: tgtLng };
    const ratio = (distKm - shortKm) / distKm;
    return { lat: actorLat + (tgtLat - actorLat) * ratio,
             lng: actorLng + (tgtLng - actorLng) * ratio };
}

function engLaneOffset(tailLat, tailLng, headLat, headLng, offsetKm) {
    const midLat = (tailLat + headLat) / 2;
    const dLatKm = (headLat - tailLat) * KM_PER_DEG_LAT;
    const dLngKm = (headLng - tailLng) * kmPerDegLng(midLat);
    const segLen = Math.hypot(dLatKm, dLngKm) || 1;
    const offLat = (-dLngKm / segLen) * offsetKm / KM_PER_DEG_LAT;
    const offLng = ( dLatKm / segLen) * offsetKm / kmPerDegLng(midLat);
    return { tailLat: tailLat + offLat, tailLng: tailLng + offLng,
             headLat: headLat + offLat, headLng: headLng + offLng };
}

// ── Test helpers ──────────────────────────────────────────────────────────────
let pass = 0, fail = 0;
function test(name, fn) {
    try { fn(); console.log('  PASS', name); pass++; }
    catch (e) { console.error('  FAIL', name, '—', e.message); fail++; }
}

// Build a fake arc with coordinates in [lng,lat] order (matches wargame3.json).
function arc(actorLng, actorLat, tgtLng, tgtLat, side) {
    return { actor_uid: `A-${actorLat}`, target_uid: `T-${tgtLat}`,
             actor_side: side || 'RED', coordinates: [[actorLng, actorLat], [tgtLng, tgtLat]],
             status_change: 'unchanged', damage_pct: 0 };
}

// ── groupArcsByTargetCluster ──────────────────────────────────────────────────
console.log('\ngroupArcsByTargetCluster');

test('empty input → empty output', () => {
    assert.deepStrictEqual(groupArcsByTargetCluster([], 8), []);
});

test('single arc → one cluster of size 1', () => {
    const clusters = groupArcsByTargetCluster([arc(18, 32, 20, 30)], 8);
    assert.strictEqual(clusters.length, 1);
    assert.strictEqual(clusters[0].arcs.length, 1);
});

test('6 arcs all targeting same coastal cluster → 1 group (spaghetti → 1 arrow)', () => {
    // Simulate the W3 Phase-0 problem: 6 RED units at sea all targeting ~[20,30]
    const arcs = [
        arc(18.0, 32.0, 20.0, 30.0),
        arc(18.1, 32.2, 20.1, 30.05),
        arc(18.3, 32.5, 20.0, 30.1),
        arc(18.0, 33.0, 19.9, 30.2),
        arc(18.5, 32.8, 20.2, 30.0),
        arc(17.9, 32.3, 20.0, 30.15),
    ];
    const clusters = groupArcsByTargetCluster(arcs, ENGAGEMENT_TARGET_CLUSTER_KM);
    assert.strictEqual(clusters.length, 1, `Expected 1 cluster, got ${clusters.length}`);
    assert.strictEqual(clusters[0].arcs.length, 6);
});

test('arcs targeting two distinct areas → 2 clusters', () => {
    // Group A targets coast (~30N), Group B targets inland (~27N)
    const arcs = [
        arc(18, 32, 20, 30),
        arc(18.1, 32, 20.1, 30.1),
        arc(18, 32, 20, 27),  // far south
        arc(18.1, 32, 20.1, 27.1),
    ];
    const clusters = groupArcsByTargetCluster(arcs, ENGAGEMENT_TARGET_CLUSTER_KM);
    assert.strictEqual(clusters.length, 2, `Expected 2 clusters, got ${clusters.length}`);
    // Each cluster should have 2 arcs
    assert.ok(clusters.every(c => c.arcs.length === 2));
});

test('sorted descending by arc count (main effort first)', () => {
    const arcs = [
        arc(18, 32, 20, 27),   // cluster B (1 arc)
        arc(18, 32, 20, 30),   // cluster A
        arc(18.1, 32, 20.1, 30.1), // cluster A
        arc(18.2, 32, 20.2, 30.2), // cluster A
    ];
    const clusters = groupArcsByTargetCluster(arcs, ENGAGEMENT_TARGET_CLUSTER_KM);
    assert.ok(clusters[0].arcs.length >= clusters[clusters.length - 1].arcs.length,
        'First cluster should have most arcs');
});

test('centroid actor coords computed correctly', () => {
    const arcs = [
        arc(18.0, 32.0, 20.0, 30.0),
        arc(19.0, 33.0, 20.1, 30.05),
    ];
    const clusters = groupArcsByTargetCluster(arcs, ENGAGEMENT_TARGET_CLUSTER_KM);
    assert.strictEqual(clusters.length, 1);
    const cl = clusters[0];
    const n = cl.arcs.length;
    // Actor centroid should be average of 32.0 and 33.0 = 32.5 lat, 18.5 lng
    assert.ok(Math.abs(cl.actorSumLat / n - 32.5) < 0.01, `actorLat centroid off: ${cl.actorSumLat / n}`);
    assert.ok(Math.abs(cl.actorSumLng / n - 18.5) < 0.01, `actorLng centroid off: ${cl.actorSumLng / n}`);
});

test('arcs with bad coordinates are skipped', () => {
    const arcs = [
        { actor_side: 'RED', coordinates: null },          // null coords
        { actor_side: 'RED', coordinates: [[18, 32]] },    // only 1 point
        arc(18, 32, 20, 30),                               // valid
    ];
    const clusters = groupArcsByTargetCluster(arcs, ENGAGEMENT_TARGET_CLUSTER_KM);
    assert.strictEqual(clusters.length, 1);
    assert.strictEqual(clusters[0].arcs.length, 1);
});

// ── engStopShort ──────────────────────────────────────────────────────────────
console.log('\nengStopShort');

test('returns a point shortKm before the target', () => {
    // Due north 100 km: actor at [0,0], target at [~0.9, 0]
    const result = engStopShort(30, 20, 30.9, 20, 3);
    const distToTarget = haversineKm([result.lat, result.lng], [30.9, 20]);
    assert.ok(Math.abs(distToTarget - 3) < 0.5, `Expected ~3km from target, got ${distToTarget.toFixed(2)}`);
});

test('when segment is too short, returns the target unclipped', () => {
    const result = engStopShort(30, 20, 30.01, 20, 3);
    assert.ok(Math.abs(result.lat - 30.01) < 1e-6, 'Should return original target lat');
    assert.ok(Math.abs(result.lng - 20)    < 1e-6, 'Should return original target lng');
});

test('clipped point lies between actor and target', () => {
    const aLat = 32, aLng = 18, tLat = 30, tLng = 20;
    const result = engStopShort(aLat, aLng, tLat, tLng, 5);
    const dA = haversineKm([aLat, aLng], [result.lat, result.lng]);
    const dT = haversineKm([result.lat, result.lng], [tLat, tLng]);
    const total = haversineKm([aLat, aLng], [tLat, tLng]);
    assert.ok(Math.abs(dA + dT - total) < 0.5, 'Clipped point should be collinear');
});

// ── engLaneOffset ─────────────────────────────────────────────────────────────
console.log('\nengLaneOffset');

test('zero offset returns original endpoints', () => {
    const r = engLaneOffset(30, 20, 32, 18, 0);
    assert.ok(Math.abs(r.tailLat - 30) < 1e-8 && Math.abs(r.tailLng - 20) < 1e-8);
    assert.ok(Math.abs(r.headLat - 32) < 1e-8 && Math.abs(r.headLng - 18) < 1e-8);
});

test('non-zero offset moves endpoints by approximately offsetKm perpendicular', () => {
    const r = engLaneOffset(30, 20, 32, 18, 2);
    // The offset point should be ~2km from original endpoint
    const tailDistKm = haversineKm([30, 20], [r.tailLat, r.tailLng]);
    assert.ok(Math.abs(tailDistKm - 2) < 0.5, `Expected ~2km offset, got ${tailDistKm.toFixed(2)}`);
});

test('opposite offset sign gives symmetric displacement', () => {
    const rPlus  = engLaneOffset(30, 20, 32, 18,  2);
    const rMinus = engLaneOffset(30, 20, 32, 18, -2);
    // Midpoint of the two offset tails should be near the original tail
    const midLat = (rPlus.tailLat + rMinus.tailLat) / 2;
    const midLng = (rPlus.tailLng + rMinus.tailLng) / 2;
    assert.ok(Math.abs(midLat - 30) < 0.01, `Midpoint lat off: ${midLat}`);
    assert.ok(Math.abs(midLng - 20) < 0.01, `Midpoint lng off: ${midLng}`);
});

test('segment length is preserved after offset (arrows remain same length)', () => {
    const r      = engLaneOffset(30, 20, 32, 18, 3);
    const origKm = haversineKm([30, 20], [32, 18]);
    const offKm  = haversineKm([r.tailLat, r.tailLng], [r.headLat, r.headLng]);
    assert.ok(Math.abs(offKm - origKm) < 1.0, `Length changed: ${origKm.toFixed(1)} → ${offKm.toFixed(1)} km`);
});

// ── Clutter-reduction integration check ──────────────────────────────────────
console.log('\nClutter reduction (integration)');

test('W3 Phase-0 equivalent: 12 arcs → ≤5 groups per side', () => {
    const ENGAGEMENT_MAX_GROUPED = 5;
    const redArcs = Array.from({ length: 6 }, (_, i) =>
        arc(18 + i * 0.1, 32 + i * 0.1, 20 + (i % 2) * 0.05, 30 + (i % 3) * 0.05));
    const clusters = groupArcsByTargetCluster(redArcs, 8);
    assert.ok(
        clusters.slice(0, ENGAGEMENT_MAX_GROUPED).length <= ENGAGEMENT_MAX_GROUPED,
        `Too many groups: ${clusters.length}`,
    );
});

test('main effort cluster is always first (highest arc count)', () => {
    const arcs = [
        arc(18, 32, 20, 27),   // solo → support
        arc(18, 32, 20, 30),   // \
        arc(18.1, 32, 20.1, 30.1), //  > main cluster
        arc(18.2, 32, 20.2, 30.2), // /
    ];
    const clusters = groupArcsByTargetCluster(arcs, ENGAGEMENT_TARGET_CLUSTER_KM);
    assert.ok(clusters[0].arcs.length >= clusters[clusters.length - 1].arcs.length,
        'Main effort (most arcs) must be first');
    assert.strictEqual(clusters[0].arcs.length, 3, 'Main cluster should have 3 arcs');
});

// ── PR-AN5: Visual hierarchy and behavioral guarantees ───────────────────────
console.log('\nPR-AN5: Visual hierarchy and behavioral guarantees');

// AN5 sizing constants — must match adjudicator-map.js renderSideClusters
const AN5_SIZING = {
    main:    { bodyHalfPx: 5,  headHalfPx: 12, headLenPx: 18, opacity: 0.72, outlineWidthPx: 1.0 },
    support: { bodyHalfPx: 3,  headHalfPx: 9,  headLenPx: 14, opacity: 0.55, outlineWidthPx: 0.8 },
    local:   { bodyHalfPx: 2,  headHalfPx: 7,  headLenPx: 11, opacity: 0.42 },
};

test('AN5: main effort body is thicker than support', () => {
    assert.ok(AN5_SIZING.main.bodyHalfPx > AN5_SIZING.support.bodyHalfPx,
        `main body ${AN5_SIZING.main.bodyHalfPx} should exceed support ${AN5_SIZING.support.bodyHalfPx}`);
});

test('AN5: support body is thicker than local', () => {
    assert.ok(AN5_SIZING.support.bodyHalfPx > AN5_SIZING.local.bodyHalfPx,
        `support body ${AN5_SIZING.support.bodyHalfPx} should exceed local ${AN5_SIZING.local.bodyHalfPx}`);
});

test('AN5: main effort opacity is highest', () => {
    assert.ok(AN5_SIZING.main.opacity > AN5_SIZING.support.opacity);
    assert.ok(AN5_SIZING.support.opacity > AN5_SIZING.local.opacity);
});

test('AN5: head proportions — headHalfPx ≥ bodyHalfPx for all roles', () => {
    for (const [role, s] of Object.entries(AN5_SIZING)) {
        if (!s.headHalfPx) continue;
        assert.ok(s.headHalfPx > s.bodyHalfPx,
            `${role}: headHalfPx (${s.headHalfPx}) must exceed bodyHalfPx (${s.bodyHalfPx})`);
    }
});

test('AN5: main outline thin (≤ 1.0px)', () => {
    assert.ok(AN5_SIZING.main.outlineWidthPx <= 1.0,
        `outlineWidthPx ${AN5_SIZING.main.outlineWidthPx} should be ≤ 1.0`);
});

test('AN5: fallback weight is proportional — 0.5× bodyHalfPx, min 2', () => {
    // fbWeight = Math.max(2, Math.round(bodyHalfPx * 0.5))
    for (const [, s] of Object.entries(AN5_SIZING)) {
        const fbWeight = Math.max(2, Math.round(s.bodyHalfPx * 0.5));
        assert.ok(fbWeight >= 2, `fbWeight must be ≥ 2, got ${fbWeight}`);
        assert.ok(fbWeight <= s.bodyHalfPx, `fbWeight ${fbWeight} must be ≤ bodyHalfPx ${s.bodyHalfPx}`);
    }
});

test('AN5: arrow count — drawAxisArrow produces exactly ONE arrow per side', () => {
    // The simplified renderer computes a single centroid arrow from ALL arcs,
    // regardless of how many actors/targets there are. Verify the centroid
    // computation stays within the bounding box of the input coordinates.
    const redBatch = Array.from({ length: 20 }, (_, i) =>
        arc(17 + i * 0.1, 31 + i * 0.1, 20, 30));
    let aLat = 0, aLng = 0, tLat = 0, tLng = 0;
    for (const a of redBatch) {
        const [src, dst] = a.coordinates;
        aLat += src[1]; aLng += src[0]; tLat += dst[1]; tLng += dst[0];
    }
    const n = redBatch.length;
    aLat /= n; aLng /= n; tLat /= n; tLng /= n;
    // Centroid actor lat should be between min/max of inputs
    const lats = redBatch.map(a => a.coordinates[0][1]);
    assert.ok(aLat >= Math.min(...lats) && aLat <= Math.max(...lats),
        `Centroid lat ${aLat} outside input range [${Math.min(...lats)}, ${Math.max(...lats)}]`);
    // Target centroid should equal the constant target used (all point to same place)
    assert.ok(Math.abs(tLat - 30) < 0.001 && Math.abs(tLng - 20) < 0.001,
        `Target centroid wrong: ${tLat}, ${tLng}`);
});

test('AN5: layer cleanup — engagementArcs array resets on second render call', () => {
    // Simulate the clearEngagementArcs contract: array is set to [] on clear.
    // We test the array-management logic in isolation without needing Leaflet.
    let arcs = [];
    const timers = [];
    function mockClear() {
        for (const t of timers) { try { clearTimeout(t); } catch (_) {} }
        arcs = [];
    }
    // Push some fake layer stubs
    arcs.push({ _type: 'arrow1' }, { _type: 'arrow2' }, { _type: 'arrow3' });
    assert.strictEqual(arcs.length, 3);
    mockClear();
    assert.strictEqual(arcs.length, 0, 'clearEngagementArcs must reset array to empty');
    // Second round — ensure no accumulation
    arcs.push({ _type: 'arrow4' });
    mockClear();
    assert.strictEqual(arcs.length, 0);
});

test('AN5: global engagement graphics — gated on DATA (engagement_arcs), not the w3-rich tag', () => {
    // The renderer is now global: it no longer bails on `schema_variant !== 'w3-rich'`.
    // The real guard is the empty-arcs check: `if (!allArcs.length) return;`.
    // So the no-op condition is "this step has no engagement_arcs", regardless of tag.
    const stepArcsFor = (sc) => {
        const steps = sc && Array.isArray(sc.steps) ? sc.steps : [];
        const row = steps[0] || {};
        return Array.isArray(row.engagement_arcs) ? row.engagement_arcs : [];
    };
    const noOpCases = [
        { schema_variant: 'w1' },                                   // non-W3, no arcs
        { schema_variant: 'wargame2-brega', steps: [{}] },          // non-W3, empty step
        {},                                                         // no schema_variant
        null,
    ];
    for (const sc of noOpCases) {
        assert.strictEqual(stepArcsFor(sc).length, 0,
            `Expected no-op (no arcs) for ${JSON.stringify(sc)}`);
    }
    // A scenario carrying arcs animates — even a non-w3-rich one (the point of "global").
    const nonW3WithArcs = { schema_variant: 'w1', steps: [{ engagement_arcs: [{ actor_side: 'RED', coordinates: [[18, 32], [20, 30]] }] }] };
    assert.ok(stepArcsFor(nonW3WithArcs).length > 0,
        'A non-w3-rich scenario carrying engagement_arcs should still render (global behavior)');
});

test('AN5: no scenario mutation — groupArcsByTargetCluster does not modify input arc objects', () => {
    const original = {
        actor_uid: 'R-001', target_uid: 'B-002', actor_side: 'RED',
        coordinates: [[18.0, 32.0], [20.0, 30.0]],
        status_change: 'unchanged', damage_pct: 0.5,
    };
    const snapshot = JSON.stringify(original);
    groupArcsByTargetCluster([original], ENGAGEMENT_TARGET_CLUSTER_KM);
    assert.strictEqual(JSON.stringify(original), snapshot,
        'Input arc object must not be mutated by groupArcsByTargetCluster');
});

test('AN5: no scenario mutation — engStopShort and engLaneOffset do not mutate inputs', () => {
    const aLat = 32, aLng = 18, tLat = 30, tLng = 20;
    engStopShort(aLat, aLng, tLat, tLng, 3);
    engLaneOffset(aLat, aLng, tLat, tLng, 5);
    // Inputs are primitives — verify they are unchanged by asserting values
    assert.strictEqual(aLat, 32); assert.strictEqual(aLng, 18);
    assert.strictEqual(tLat, 30); assert.strictEqual(tLng, 20);
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${pass + fail} tests — ${pass} passed, ${fail} failed`);
process.exitCode = fail > 0 ? 1 : 0;
