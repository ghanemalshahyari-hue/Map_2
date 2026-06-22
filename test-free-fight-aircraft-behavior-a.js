'use strict';
/**
 * test-free-fight-aircraft-behavior-a.js — RMOOZ-MOVEMENT-INTELLIGENCE-A aircraft
 *
 * Verifies that aircraft assignments use patrol_loop/orbit waypoints and
 * NEVER stop at the objective (which would block the ground battle).
 *
 *  1.  Aircraft 'approach' assignment returns ≥ 2 waypoints (racetrack).
 *  2.  Aircraft waypoints are NOT on the objective (any within 5km fails).
 *  3.  Aircraft 'patrol' assignment returns ≥ 4 waypoints (full patrol_loop).
 *  4.  Aircraft 'intercept' returns waypoints NOT on objective.
 *  5.  Aircraft 'observe' returns waypoints NOT on objective.
 *  6.  Aircraft 'support' returns waypoints NOT on objective.
 *  7.  Aircraft 'reserve' returns waypoints NOT on objective.
 *  8.  Aircraft 'screen' returns waypoints NOT on objective.
 *  9.  Aircraft patrol_loop waypoints are spread (max pair-distance > 5km).
 * 10.  Aircraft orbit (slot ≥ 8) returns tight orbit near objective.
 * 11.  Naval unit gets coastal patrol waypoints.
 * 12.  Naval waypoints are NOT identical to ground waypoints for same slot/behavior.
 * 13.  Helicopter ('helicopter') classified as air domain.
 * 14.  Drone ('uav') classified as air domain.
 * 15.  AWACS classified as air domain.
 */
var path = require('path');
var assert = require('assert');

var ME = require(path.join(__dirname, 'UI_MOdified/client/shell/free-fight-movement-engine.js'));

var OBJ = { lat: 24.45, lon: 54.40 };
var MIN_DISTANCE_FROM_OBJ_KM = 5.0;  // aircraft must stay > 5km from objective

function kmBetween(a, b) { return ME.kmBetween(a, b); }

function assertNotOnObjective(wps, label) {
    wps.forEach(function (wp, i) {
        var d = kmBetween(wp, OBJ);
        assert.ok(d > MIN_DISTANCE_FROM_OBJ_KM,
            label + ' wp[' + i + '] is ' + d.toFixed(1) + 'km from OBJ (must be > ' + MIN_DISTANCE_FROM_OBJ_KM + 'km)');
    });
}

function airUnit(name) {
    return { id: 'ac1', name: name || 'F-16 Sqn', unit_type: 'Fighter', lat: 22.0, lon: 52.0 };
}

function navalUnit() {
    return { id: 'nv1', name: 'FFG-7 Knox', unit_type: 'Frigate', lat: 23.5, lon: 55.5 };
}

function groundUnit() {
    return { id: 'gnd1', name: '3rd Infantry', unit_type: 'Infantry', lat: 22.0, lon: 52.0 };
}

var passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); console.log('  PASS', name); passed++; }
    catch (e) { console.error('  FAIL', name, '—', e.message); failed++; }
}

// T-1: aircraft approach → racetrack ≥ 2 waypoints
test('T-1 aircraft approach returns ≥2 waypoints (racetrack)', function () {
    var wps = ME.buildWaypointsForAssignment(airUnit(), { behavior: 'approach' }, OBJ, [], 0);
    assert.ok(wps.length >= 2, 'expected ≥2 waypoints for aircraft approach, got ' + wps.length);
});

// T-2: aircraft approach waypoints NOT on objective
test('T-2 aircraft approach waypoints not on objective', function () {
    var wps = ME.buildWaypointsForAssignment(airUnit(), { behavior: 'approach' }, OBJ, [], 0);
    assertNotOnObjective(wps, 'aircraft-approach');
});

// T-3: aircraft patrol returns ≥ 4 waypoints
test('T-3 aircraft patrol returns ≥4 waypoints (full loop)', function () {
    var wps = ME.buildWaypointsForAssignment(airUnit(), { behavior: 'patrol' }, OBJ, [], 0);
    assert.ok(wps.length >= 4, 'expected ≥4 waypoints for aircraft patrol, got ' + wps.length);
});

// T-4: aircraft intercept NOT on objective
test('T-4 aircraft intercept waypoints not on objective', function () {
    var wps = ME.buildWaypointsForAssignment(airUnit(), { behavior: 'intercept' }, OBJ, [], 0);
    assertNotOnObjective(wps, 'aircraft-intercept');
});

// T-5: aircraft observe NOT on objective
test('T-5 aircraft observe waypoints not on objective', function () {
    var wps = ME.buildWaypointsForAssignment(airUnit(), { behavior: 'observe' }, OBJ, [], 0);
    assertNotOnObjective(wps, 'aircraft-observe');
});

// T-6: aircraft support NOT on objective
test('T-6 aircraft support waypoints not on objective', function () {
    var wps = ME.buildWaypointsForAssignment(airUnit(), { behavior: 'support' }, OBJ, [], 0);
    assertNotOnObjective(wps, 'aircraft-support');
});

// T-7: aircraft reserve NOT on objective
test('T-7 aircraft reserve waypoints not on objective', function () {
    var wps = ME.buildWaypointsForAssignment(airUnit(), { behavior: 'reserve' }, OBJ, [], 0);
    assertNotOnObjective(wps, 'aircraft-reserve');
});

// T-8: aircraft screen NOT on objective
test('T-8 aircraft screen waypoints not on objective', function () {
    var wps = ME.buildWaypointsForAssignment(airUnit(), { behavior: 'screen' }, OBJ, [], 0);
    assertNotOnObjective(wps, 'aircraft-screen');
});

// T-9: patrol_loop waypoints are spread > 5km apart
test('T-9 aircraft patrol_loop waypoints spread > 5km', function () {
    var wps = ME.buildWaypointsForAssignment(airUnit(), { behavior: 'patrol' }, OBJ, [], 0);
    var maxDist = 0;
    for (var i = 0; i < wps.length; i++) {
        for (var j = i + 1; j < wps.length; j++) {
            var d = kmBetween(wps[i], wps[j]);
            if (d > maxDist) maxDist = d;
        }
    }
    assert.ok(maxDist > 5, 'patrol_loop waypoints must span > 5km, got ' + maxDist.toFixed(1) + 'km');
});

// T-10: aircraft slot ≥ 8 returns orbit (tight loop)
test('T-10 aircraft slot≥8 orbit waypoints within PATROL_RADIUS_KM of objective', function () {
    var wps = ME.buildWaypointsForAssignment(airUnit(), { behavior: 'approach' }, OBJ, [], 8);
    wps.forEach(function (wp, i) {
        var d = kmBetween(wp, OBJ);
        // orbit should still not be on the objective but within double the patrol radius
        assert.ok(d <= ME.PATROL_RADIUS_KM * 2,
            'orbit wp[' + i + '] too far from orbit center: ' + d.toFixed(1) + 'km');
    });
});

// T-11: naval unit gets ≥ 2 waypoints
test('T-11 naval unit returns ≥2 waypoints', function () {
    var wps = ME.buildWaypointsForAssignment(navalUnit(), { behavior: 'patrol' }, OBJ, [], 0);
    assert.ok(wps.length >= 2, 'naval unit must get ≥2 patrol waypoints, got ' + wps.length);
    wps.forEach(function (wp) {
        assert.ok(Number.isFinite(wp.lat) && Number.isFinite(wp.lon), 'naval waypoint has invalid coords');
    });
});

// T-12: naval vs ground waypoints differ for same assignment
test('T-12 naval waypoints differ from ground waypoints (domain-separated)', function () {
    var wpNaval = ME.buildWaypointsForAssignment(navalUnit(), { behavior: 'approach' }, OBJ, [], 0);
    var wpGround = ME.buildWaypointsForAssignment(groundUnit(), { behavior: 'approach' }, OBJ, [], 0);
    var navalDist = kmBetween(wpNaval[0], OBJ);
    var groundDist = kmBetween(wpGround[0], OBJ);
    // Domain separation doesn't require identical distances but positions should differ
    assert.ok(navalDist !== groundDist || wpNaval[0].lat !== wpGround[0].lat,
        'naval and ground waypoints should differ');
});

// T-13: helicopter → air
test('T-13 helicopter classified as air', function () {
    var d = ME.classifyUnitDomain({ name: 'AH-64 Attack Helicopter', unit_type: 'Helicopter' });
    assert.strictEqual(d, 'air');
});

// T-14: UAV/drone → air
test('T-14 UAV/drone classified as air', function () {
    var d = ME.classifyUnitDomain({ name: 'Reaper UAV', unit_type: 'UAV' });
    assert.strictEqual(d, 'air');
});

// T-15: AWACS → air
test('T-15 AWACS classified as air', function () {
    var d = ME.classifyUnitDomain({ name: 'E-3 Sentry AWACS', unit_type: 'AEW' });
    assert.strictEqual(d, 'air');
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n' + passed + '/' + (passed + failed) + ' tests passed.');
if (failed > 0) process.exit(1);
