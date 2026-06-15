/**
 * test-tactical-terrain-context-a.js — GIS terrain-aware tactics
 *
 * The terrain context builder assembles the 8 GIS factors with HONEST provenance, and the
 * 5 actions (recon/flank/delay/defend/withdraw) reason from them: recon to high ground
 * outside the threat ring and inside own territory; delay onto the corridor choke point;
 * flank avoiding the choke; defend on defensible terrain; withdraw toward own border.
 */
'use strict';
var assert = require('assert');
var path = require('path');
var TC = require(path.join(__dirname, 'UI_MOdified/server/ai/tactical-terrain-context.js'));
var LIB = require(path.join(__dirname, 'UI_MOdified/server/ai/tactical-action-library.js'));

var pass = 0;
function ok(n, fn) { fn(); pass++; console.log('  ✓ ' + n); }
function dist(a, b) { return Math.hypot(a.lon - b.lon, a.lat - b.lat); }

// Geometry: objective west, enemy advancing from the east, BLUE force to the south.
var objective = { lat: 24.50, lon: 54.30 };
var enemy = { lat: 24.50, lon: 54.58 };
var ownUnits = [{ lat: 24.34, lon: 54.40 }, { lat: 24.30, lon: 54.36 }, { lat: 24.38, lon: 54.44 }];
var situation = { thresholds_deg: { warning: 0.35, defended: 0.20, engagement: 0.10 }, nearest_red: enemy, alert_state: 'WARNING' };
var intel = { zone_state: { owner_country: 'UAE', zone_type: 'sovereign', center: [24.50, 54.30], radius_deg: 0.35, ring: 'warning' }, terrain_summary: 'coastal urban approach to the port' };

function buildCtx(extra) {
    return TC.buildTacticalTerrainContext(Object.assign({
        objective: objective, nearestEnemy: enemy, situation: situation, intel: intel, ownUnits: ownUnits, side: 'BLUE',
    }, extra || {}));
}

console.log('\nGIS terrain-aware tactics — terrain context + actions\n');

// ── §1 the 8 GIS factors with honest provenance ───────────────────────
console.log('§1 terrain context: 8 factors + provenance');
var ctx = buildCtx();
ok('borders / sovereign zone present (country labelled)', function () {
    assert.strictEqual(ctx.owner_country, 'UAE');
    assert.ok(ctx.sovereign_zone);
    assert.strictEqual(ctx.provenance.borders, 'inferred_country_label');
});
ok('threat rings present (geometric)', function () {
    assert.strictEqual(ctx.threat_rings.warning, 0.35);
    assert.strictEqual(ctx.provenance.threat_rings, 'inferred_geometric');
});
ok('movement corridor = enemy→objective axis', function () {
    assert.ok(ctx.corridor && ctx.corridor.from && ctx.corridor.to);
    assert.strictEqual(ctx.provenance.corridor, 'inferred_axis');
});
ok('choke point on the corridor (between enemy and objective)', function () {
    assert.ok(ctx.choke);
    assert.ok(dist(ctx.choke, objective) > 0.02 && dist(ctx.choke, enemy) > 0.02, 'choke not between');
    assert.strictEqual(ctx.provenance.choke, 'inferred_corridor');
});
ok('high ground / observation point present', function () {
    assert.ok(ctx.high_ground);
    assert.strictEqual(ctx.provenance.high_ground, 'inferred_vantage'); // no DEM coverage here
});
ok('terrain class derived from text hint (coastal)', function () {
    assert.strictEqual(ctx.terrain_class, 'coastal');
    assert.strictEqual(ctx.provenance.terrain_class, 'inferred_text_hint');
});
ok('route cost present + honest provenance (terrain-class, not fake DEM)', function () {
    assert.ok(typeof ctx.route_cost === 'number');
    assert.strictEqual(ctx.provenance.route_cost, 'inferred_terrain_class');
});
ok('own border / fallback toward own territory', function () {
    assert.ok(ctx.fallback && ctx.own_center);
    // fallback is on the far side of own centre from the objective (toward the rear)
    assert.ok(dist(ctx.fallback, objective) > dist(ctx.own_center, objective));
});

// ── §2 real DEM upgrades high ground + choke provenance ───────────────
console.log('§2 real elevation upgrades provenance');
ok('a covering elevationAt upgrades high_ground → gis_dem', function () {
    // fake DEM: elevation increases to the north (higher lat)
    var demCtx = buildCtx({ elevationAt: function (lat, lon) { return (lat - 24) * 1000; } });
    assert.strictEqual(demCtx.provenance.high_ground, 'gis_dem');
    assert.ok(demCtx.high_ground._elev_m != null, 'no elevation recorded on high ground');
});

// ── §3 recon: high ground, outside threat ring, inside own territory ──
console.log('§3 recon reasons from terrain (spec)');
ok('recon moves to high ground, stands off the WARNING ring, stays in own zone', function () {
    var u = { lat: 24.34, lon: 54.40 };
    var g = LIB.computeActionGeometry('recon', u, ctx);
    assert.strictEqual(g.flags.uses_high_ground, true);
    assert.strictEqual(g.flags.respects_threat_ring, true);
    assert.ok(g.distance_to_threat_deg >= ctx.threat_rings.warning, 'recon inside the warning ring: ' + g.distance_to_threat_deg);
    assert.ok(g.terrain_basis.some(function (b) { return /high_ground/.test(b); }));
});

// ── §4 delay: occupy the choke point ──────────────────────────────────
console.log('§4 delay holds the choke point');
ok('delay targets the corridor choke point', function () {
    var u = { lat: 24.34, lon: 54.40 };
    var g = LIB.computeActionGeometry('delay', u, ctx);
    assert.strictEqual(g.flags.holds_choke_point, true);
    assert.strictEqual(g.flags.follows_corridor, true);
    assert.ok(g.terrain_basis.some(function (b) { return /choke/.test(b); }));
});

// ── §5 flank: avoid the choke, terrain-class width ────────────────────
console.log('§5 flank avoids the choke on a different axis');
ok('flank uses a different axis and avoids the choke', function () {
    var u = { lat: 24.34, lon: 54.40 };
    var g = LIB.computeActionGeometry('flank', u, ctx);
    assert.strictEqual(g.flags.different_axis, true);
    assert.ok(g.axis_offset_deg > 30, 'flank not off-axis: ' + g.axis_offset_deg);
    assert.ok(g.terrain_basis.some(function (b) { return /avoid_choke|terrain/.test(b); }));
});

// ── §6 defend: defensible high ground within own zone ─────────────────
console.log('§6 defend occupies defensible terrain');
ok('defend holds high ground covering the objective, within own zone', function () {
    var u = { lat: 24.34, lon: 54.40 };
    var g = LIB.computeActionGeometry('defend', u, ctx);
    assert.strictEqual(g.flags.occupies_terrain, true);
    assert.strictEqual(g.flags.uses_high_ground, true);
    assert.ok(g.terrain_basis.some(function (b) { return /high_ground|terrain/.test(b); }));
    // does not chase the enemy
    assert.ok(dist(g.target, enemy) > 0.1, 'defend moved onto the enemy');
});

// ── §7 withdraw: fall back toward own border, open distance ───────────
console.log('§7 withdraw falls back toward own territory');
ok('withdraw moves toward own border and increases distance from the threat', function () {
    var u = { lat: 24.40, lon: 54.46 }; // forward unit
    var g = LIB.computeActionGeometry('withdraw', u, ctx);
    assert.strictEqual(g.flags.increases_distance_from_threat, true);
    assert.strictEqual(g.flags.toward_own_territory, true);
    assert.ok(dist(g.target, enemy) > dist(u, enemy), 'withdraw did not open distance');
    assert.ok(dist(g.target, ctx.fallback) < dist(u, ctx.fallback), 'withdraw not toward fallback');
});

// ── §8 honesty: nothing fabricated; degrades without context ──────────
console.log('§8 honest degradation');
ok('with NO terrain context the actions still work (pure geometry)', function () {
    var bare = { nearestEnemy: enemy, objective: objective, threatZoneRadiusDeg: 0.1 };
    ['recon', 'flank', 'delay', 'defend', 'withdraw'].forEach(function (a) {
        var g = LIB.computeActionGeometry(a, { lat: 24.34, lon: 54.40 }, bare);
        assert.ok(g.target && Number.isFinite(g.target.lat), a + ' produced no target');
    });
});

console.log('\n✅ ' + pass + ' assertions passed (test-tactical-terrain-context-a.js)\n');
