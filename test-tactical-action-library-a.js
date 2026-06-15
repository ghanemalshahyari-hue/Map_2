/**
 * test-tactical-action-library-a.js — RMOOZ-AI-COMMANDER-FREEDOM-A
 *
 * Proves each tactical action produces a genuinely DIFFERENT behavior/geometry — recon
 * stands off, delay shapes the corridor, flank uses a different axis, withdraw increases
 * distance, deceive moves off the real axis, etc. (spec required-behavior 2–8).
 */
'use strict';
var assert = require('assert');
var path = require('path');
var LIB = require(path.join(__dirname, 'UI_MOdified/server/ai/tactical-action-library.js'));

var pass = 0;
function ok(n, fn) { fn(); pass++; console.log('  ✓ ' + n); }
function dist(a, b) { return Math.hypot(a.lon - b.lon, a.lat - b.lat); }

// Realistic non-collinear geometry: enemy advances on the objective from the east; the
// friendly unit sits to the south. (Collinear layouts would make "toward the corridor" and
// "toward the objective" coincide — real scenarios are not collinear.)
var objective = { lat: 24.50, lon: 54.30 };
var enemy = { lat: 24.50, lon: 54.58 };
var unit = { lat: 24.34, lon: 54.40 };
var ctx = { nearestEnemy: enemy, objective: objective, threatZoneRadiusDeg: 0.10 };

console.log('\nRMOOZ-AI-COMMANDER-FREEDOM-A — tactical action library\n');

// ── §1 vocabulary + archetypes ────────────────────────────────────────
console.log('§1 vocabulary');
ok('exposes all 16 actions', function () {
    ['recon', 'probe', 'screen', 'delay', 'defend', 'withdraw', 'flank', 'deceive',
     'feint', 'attack', 'hold', 'reposition', 'avoid_contact', 'observe', 'support', 'reserve']
        .forEach(function (a) { assert.ok(LIB.TACTICAL_ACTIONS.indexOf(a) >= 0, 'missing ' + a); });
    assert.strictEqual(LIB.TACTICAL_ACTIONS.length, 16);
});
ok('three COA archetypes', function () {
    var keys = LIB.COA_ARCHETYPES.map(function (a) { return a.key; });
    assert.deepStrictEqual(keys, ['cautious_recon', 'maneuver_deception', 'direct_action']);
});

// ── §2 recon: stand off, do NOT attack ────────────────────────────────
console.log('§2 recon behavior (spec 2)');
ok('recon stays OUTSIDE the threat zone and does not move onto the enemy', function () {
    var g = LIB.computeActionGeometry('recon', unit, ctx);
    assert.strictEqual(g.flags.stays_outside_threat, true);
    assert.ok(g.distance_to_threat_deg >= ctx.threatZoneRadiusDeg, 'recon entered threat zone: ' + g.distance_to_threat_deg);
    // and it is NOT the attack target (which drives onto the objective)
    var atk = LIB.computeActionGeometry('attack', unit, ctx);
    assert.ok(dist(g.target, atk.target) > 0.001, 'recon target must differ from attack target');
});
ok('observe is a smaller, LOS-seeking step that also stands off', function () {
    var o = LIB.computeActionGeometry('observe', unit, ctx);
    assert.strictEqual(o.flags.stays_outside_threat, true);
    var r = LIB.computeActionGeometry('recon', unit, ctx);
    assert.ok(dist(unit, o.target) <= dist(unit, r.target) + 1e-9, 'observe should not advance further than recon');
});

// ── §3 delay: shape the corridor, not attack ──────────────────────────
console.log('§3 delay behavior (spec 3)');
ok('delay shapes a point on the enemy→objective corridor (not the objective itself)', function () {
    var g = LIB.computeActionGeometry('delay', unit, ctx);
    assert.strictEqual(g.flags.shaping, true);
    var atk = LIB.computeActionGeometry('attack', unit, ctx);
    assert.ok(dist(g.target, atk.target) > 0.001, 'delay must differ from attack');
    // moves toward the corridor, not onto the objective
    assert.ok(dist(g.target, objective) > 0.05, 'delay should not drive onto the objective');
});

// ── §4 flank: different axis than direct ──────────────────────────────
console.log('§4 flank behavior (spec 5)');
ok('flank approaches on a different axis from the direct objective line', function () {
    var g = LIB.computeActionGeometry('flank', unit, ctx);
    assert.strictEqual(g.flags.different_axis, true);
    assert.ok(g.axis_offset_deg > 30, 'flank axis offset too small: ' + g.axis_offset_deg);
    var atk = LIB.computeActionGeometry('attack', unit, ctx);
    assert.ok(atk.axis_offset_deg < 15, 'attack should be near the direct axis: ' + atk.axis_offset_deg);
    assert.ok(g.axis_offset_deg > atk.axis_offset_deg + 20, 'flank must diverge from the direct attack axis');
});

// ── §5 withdraw: increase distance from threat ────────────────────────
console.log('§5 withdraw behavior (spec 6)');
ok('withdraw increases distance from the nearest threat', function () {
    var g = LIB.computeActionGeometry('withdraw', unit, ctx);
    assert.strictEqual(g.flags.increases_distance_from_threat, true);
    assert.ok(dist(g.target, enemy) > dist(unit, enemy), 'withdraw did not increase distance from enemy');
});
ok('withdraw prefers an explicit fallback when given', function () {
    var fb = { lat: 24.05, lon: 54.05 };
    var g = LIB.computeActionGeometry('withdraw', unit, { nearestEnemy: enemy, objective: objective, fallback: fb });
    assert.ok(dist(g.target, fb) < dist(unit, fb), 'withdraw should move toward the fallback');
});

// ── §6 deceive/feint: misleading, off the real axis ───────────────────
console.log('§6 deception behavior (spec 4)');
ok('deceive/feint move on a misleading axis, not a direct objective assault', function () {
    var d = LIB.computeActionGeometry('deceive', unit, ctx);
    assert.strictEqual(d.flags.misleading, true);
    var atk = LIB.computeActionGeometry('attack', unit, ctx);
    assert.ok(d.axis_offset_deg > atk.axis_offset_deg + 20, 'deception must diverge from the direct axis');
});

// ── §7 defend / probe / hold distinct ─────────────────────────────────
console.log('§7 defend / probe / hold (spec 7,8)');
ok('defend occupies terrain (small move), does not chase the enemy', function () {
    var g = LIB.computeActionGeometry('defend', unit, ctx);
    assert.strictEqual(g.flags.occupies_terrain, true);
    assert.ok(dist(unit, g.target) <= LIB.MAX_STEP_DEG * 0.5, 'defend should not chase far');
    assert.ok(dist(g.target, enemy) > 0.1, 'defend must not move onto the enemy');
});
ok('probe is a limited-commitment advance toward the enemy', function () {
    var g = LIB.computeActionGeometry('probe', unit, ctx);
    assert.strictEqual(g.flags.limited_commitment, true);
    assert.ok(dist(unit, g.target) > 0, 'probe should move');
    assert.ok(dist(unit, g.target) < LIB.MAX_STEP_DEG * 0.6, 'probe should be limited');
});
ok('hold does not move', function () {
    var g = LIB.computeActionGeometry('hold', unit, ctx);
    assert.strictEqual(g.flags.no_move, true);
    assert.ok(dist(unit, g.target) < 1e-9);
});

// ── §8 all actions stay within the teleport-safe step ─────────────────
console.log('§8 physics safety');
ok('every action keeps the move within MAX_STEP_DEG (< validator teleport guard)', function () {
    LIB.TACTICAL_ACTIONS.forEach(function (a) {
        var g = LIB.computeActionGeometry(a, unit, ctx);
        var d = dist(unit, g.target);
        assert.ok(d <= LIB.MAX_STEP_DEG + 1e-6, a + ' moved ' + d + ' > MAX_STEP_DEG');
    });
});
ok('distinct actions yield distinct targets (not the same path relabeled)', function () {
    var targets = ['recon', 'flank', 'withdraw', 'attack', 'delay', 'deceive'].map(function (a) {
        return LIB.computeActionGeometry(a, unit, ctx).target;
    });
    var uniquePairs = 0, total = 0;
    for (var i = 0; i < targets.length; i++) for (var j = i + 1; j < targets.length; j++) {
        total++; if (dist(targets[i], targets[j]) > 0.005) uniquePairs++;
    }
    assert.strictEqual(uniquePairs, total, 'some actions collapsed to the same target');
});

console.log('\n✅ ' + pass + ' assertions passed (test-tactical-action-library-a.js)\n');
