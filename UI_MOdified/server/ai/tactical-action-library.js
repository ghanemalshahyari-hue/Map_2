/**
 * tactical-action-library.js — RMOOZ-AI-COMMANDER-FREEDOM-A
 *
 * The doctrine-free tactical vocabulary. Each action is a DISTINCT tactical behavior with
 * its own movement geometry — recon stands off and observes, delay shapes the enemy's
 * corridor, flank uses a different axis, withdraw increases distance, deceive moves away
 * from the real objective, etc. This is what lets the AI commander pick genuinely
 * different courses of action instead of the same intercept/defend path with new labels.
 *
 * PURE: no DOM, no network, no mutation. Geometry is planar (small-area lat/lon), every
 * move is capped to MAX_STEP_DEG (< the validator's teleport guard) so output is always
 * physics-valid. The library decides BEHAVIOR; the validator only checks structure/physics.
 *
 * computeActionGeometry(action, unit, ctx) → { target, action, archetype, behavior,
 *   reason, flags, axis_offset_deg, distance_to_threat_deg, corridor_fraction }
 */
'use strict';

// The 16 allowed tactical actions (the operator/LLM may choose any).
var TACTICAL_ACTIONS = [
    'recon', 'probe', 'screen', 'delay', 'defend', 'withdraw', 'flank', 'deceive',
    'feint', 'attack', 'hold', 'reposition', 'avoid_contact', 'observe', 'support', 'reserve',
];

// Three COA archetypes the planner builds at least one of each cycle.
var COA_ARCHETYPES = [
    { key: 'cautious_recon',     label: 'Cautious / Recon / Security', actions: ['recon', 'observe', 'screen', 'avoid_contact', 'hold'] },
    { key: 'maneuver_deception', label: 'Maneuver / Deception / Flank', actions: ['flank', 'deceive', 'feint', 'reposition', 'delay'] },
    { key: 'direct_action',      label: 'Direct / Attack / Defense',    actions: ['attack', 'defend', 'probe', 'support', 'reserve'] },
];

var ACTION_TO_ARCHETYPE = (function () {
    var m = {};
    COA_ARCHETYPES.forEach(function (a) { a.actions.forEach(function (act) { m[act] = a.key; }); });
    return m;
})();

// Max single-cycle move (coordinate degrees). Below the validator's 0.15° teleport guard.
var MAX_STEP_DEG = 0.10;

// ── planar vector helpers (lon = x, lat = y) ──────────────────────────────────
function pt(o) {
    if (!o) return null;
    var lat = Number(o.lat != null ? o.lat : (Array.isArray(o.coord) ? o.coord[1] : o[1]));
    var lon = Number(o.lon != null ? o.lon : (o.lng != null ? o.lng : (Array.isArray(o.coord) ? o.coord[0] : o[0])));
    return (Number.isFinite(lat) && Number.isFinite(lon)) ? { lat: lat, lon: lon } : null;
}
function dist(a, b) { return Math.hypot(a.lon - b.lon, a.lat - b.lat); }
function norm(v) { var L = Math.hypot(v.x, v.y) || 1e-9; return { x: v.x / L, y: v.y / L }; }
function vec(from, to) { return { x: to.lon - from.lon, y: to.lat - from.lat }; }
function add(from, v, d) { return { lat: from.lat + v.y * d, lon: from.lon + v.x * d }; }
function clampStep(d) { return Math.min(MAX_STEP_DEG, Math.max(0, d)); }
// angle (deg) between two vectors
function angleDeg(a, b) {
    var la = Math.hypot(a.x, a.y) || 1e-9, lb = Math.hypot(b.x, b.y) || 1e-9;
    var c = (a.x * b.x + a.y * b.y) / (la * lb);
    c = Math.max(-1, Math.min(1, c));
    return Math.acos(c) * 180 / Math.PI;
}
function toward(from, to, d) { return add(from, norm(vec(from, to)), clampStep(d)); }
function away(from, fromPoint, d) { return add(from, norm(vec(fromPoint, from)), clampStep(d)); }
function lerp(a, b, t) { return { lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t }; }
// push a point radially out from a centre until it is at least r away
function clampOutside(target, centre, r) {
    if (!centre) return target;
    var d = dist(target, centre);
    if (d >= r) return target;
    var v = norm(vec(centre, target));
    if (!isFinite(v.x) || (v.x === 0 && v.y === 0)) v = { x: 1, y: 0 };
    return add(centre, v, r * 1.05);
}
// pull a point radially IN toward a centre so it stays within maxR (own-territory clamp)
function clampInsideOwn(target, centre, maxR) {
    if (!centre || !(maxR > 0)) return target;
    var d = dist(target, centre);
    if (d <= maxR) return target;
    var v = norm(vec(centre, target));
    return add(centre, v, maxR);
}

function emptyFlags() {
    return {
        no_move: false, stays_outside_threat: false, keeps_distance: false,
        increases_distance_from_threat: false, different_axis: false, misleading: false,
        shaping: false, occupies_terrain: false, limited_commitment: false, reconnoiters: false,
        // GIS terrain-aware flags
        uses_high_ground: false, respects_threat_ring: false, within_own_zone: false,
        seeks_los: false, holds_choke_point: false, follows_corridor: false, toward_own_territory: false,
    };
}

/**
 * computeActionGeometry(action, unit, ctx)
 *   ctx: { nearestEnemy:{lat,lon}, objective:{lat,lon}, threatZoneRadiusDeg, fallback:{lat,lon},
 *          side, terrain:{ corridor?, choke?, high_ground?:{lat,lon} } }
 */
function computeActionGeometry(action, unit, ctx) {
    action = String(action || '').toLowerCase().trim();
    ctx = ctx || {};
    var u = pt(unit);
    var enemy = pt(ctx.nearestEnemy);
    var obj = pt(ctx.objective);
    var threatR = Number(ctx.threatZoneRadiusDeg);
    if (!Number.isFinite(threatR) || threatR <= 0) threatR = 0.10;
    var fallback = pt(ctx.fallback) || pt(ctx.border_ref);
    var flags = emptyFlags();
    var target = u ? { lat: u.lat, lon: u.lon } : { lat: 0, lon: 0 };
    var behavior = '', reason = '', corridorFraction = null;

    // GIS terrain-aware tactics: richer context (gated — degrades to pure geometry when absent).
    var rings = ctx.threat_rings || null;                                   // {warning,defended,engagement}
    var warnR = rings && Number.isFinite(+rings.warning) ? +rings.warning : threatR;
    var chokePt = (ctx.choke && pt(ctx.choke)) || (ctx.terrain && pt(ctx.terrain.choke));
    var highGround = (ctx.high_ground && pt(ctx.high_ground)) || (ctx.terrain && pt(ctx.terrain.high_ground));
    var ownCenter = pt(ctx.own_center);
    var terrainClass = ctx.terrain_class || (ctx.terrain && ctx.terrain.terrain_class) || null;
    var prov = ctx.provenance || {};
    var terrainBasis = [];   // which GIS factors drove this action (for the event log / LLM)

    if (!u) {
        return { target: target, action: action, archetype: ACTION_TO_ARCHETYPE[action] || 'direct_action',
            behavior: 'no unit position', reason: 'unit position unavailable', flags: flags,
            axis_offset_deg: 0, distance_to_threat_deg: null, corridor_fraction: null };
    }

    // direct axis (unit → objective) used to measure how different an approach is
    var directAxis = obj ? vec(u, obj) : (enemy ? vec(u, enemy) : { x: 1, y: 0 });

    switch (action) {
        case 'recon':
        case 'observe': {
            // Move to a HIGH-GROUND observation point with line of sight, standing off the
            // WARNING ring (not just the inner zone) and staying inside own territory.
            var look = obj || enemy;
            var step = (action === 'observe') ? MAX_STEP_DEG * 0.4 : MAX_STEP_DEG * 0.8;
            if (highGround) {
                target = toward(u, highGround, step);
                flags.uses_high_ground = true; terrainBasis.push('high_ground:' + (prov.high_ground || 'inferred'));
            } else {
                target = look ? toward(u, look, step) : { lat: u.lat, lon: u.lon };
            }
            // Stand off the warning ring around the threat (terrain-aware standoff).
            target = clampOutside(target, enemy, warnR);
            if (rings) { flags.respects_threat_ring = true; terrainBasis.push('threat_ring:warning'); }
            // Do not cross into enemy ground: keep within own sovereign zone if known.
            if (ownCenter && obj) {
                var beyond = dist(target, ownCenter) - dist(obj, ownCenter);
                if (beyond > 0) { target = clampInsideOwn(target, ownCenter, dist(obj, ownCenter)); flags.within_own_zone = true; terrainBasis.push('sovereign_zone'); }
            }
            flags.stays_outside_threat = true; flags.keeps_distance = true; flags.reconnoiters = true; flags.seeks_los = !!highGround;
            behavior = (highGround ? 'occupy high ground for observation/LOS' : 'move to an observation area') + ', standing off the warning ring' + (flags.within_own_zone ? ' inside own territory' : '');
            reason = 'Gain situational awareness from a covered vantage without crossing the threat ring or the border.';
            break;
        }
        case 'probe': {
            // Test enemy contact with LIMITED commitment — partial advance toward the enemy.
            var to = enemy || obj;
            target = to ? toward(u, to, MAX_STEP_DEG * 0.45) : { lat: u.lat, lon: u.lon };
            flags.limited_commitment = true;
            behavior = 'advance with limited commitment to test enemy disposition';
            reason = 'Develop the situation by probing enemy reaction without decisive engagement.';
            break;
        }
        case 'screen': {
            // Position on the enemy→objective line, between them.
            if (enemy && obj) { target = toward(u, lerp(enemy, obj, 0.5), MAX_STEP_DEG); flags.shaping = true; }
            else if (obj) target = toward(u, obj, MAX_STEP_DEG * 0.6);
            behavior = 'screen between the enemy axis and the protected area';
            reason = 'Provide early warning and security along the threat approach.';
            break;
        }
        case 'delay': {
            // Occupy the CHOKE POINT on the enemy's movement corridor to slow/shape the
            // advance (a real relief pinch when DEM-derived, else a corridor point).
            if (chokePt) {
                target = toward(u, chokePt, MAX_STEP_DEG);
                flags.shaping = true; flags.holds_choke_point = true; flags.follows_corridor = true;
                terrainBasis.push('choke:' + (prov.choke || 'inferred'));
                corridorFraction = 0.4;
            } else if (enemy && obj) {
                corridorFraction = 0.35;
                target = toward(u, lerp(enemy, obj, corridorFraction), MAX_STEP_DEG);
                flags.shaping = true; flags.follows_corridor = true;
            } else if (enemy) {
                target = toward(u, enemy, MAX_STEP_DEG * 0.5); flags.shaping = true;
            }
            behavior = (chokePt ? 'occupy the choke point on the enemy corridor' : 'occupy a position on the enemy corridor') + ' to slow/shape the advance';
            reason = 'Trade space for time at the terrain pinch and disrupt the enemy timetable short of decisive battle.';
            break;
        }
        case 'defend': {
            // Occupy defensible HIGH GROUND covering the objective — do NOT chase. Urban/
            // coastal terrain favours holding close to the objective; open ground allows a
            // forward defensible position.
            var hold = highGround || obj || u;
            var holdStep = (terrainClass === 'urban' || terrainClass === 'coastal') ? MAX_STEP_DEG * 0.25 : MAX_STEP_DEG * 0.4;
            target = toward(u, hold, holdStep);
            // Keep the defensive position inside own territory.
            if (ownCenter && obj) { target = clampInsideOwn(target, ownCenter, Math.max(dist(obj, ownCenter), warnR)); flags.within_own_zone = true; }
            flags.occupies_terrain = true;
            if (highGround) { flags.uses_high_ground = true; terrainBasis.push('high_ground:' + (prov.high_ground || 'inferred')); }
            if (terrainClass) terrainBasis.push('terrain:' + terrainClass);
            behavior = (highGround ? 'occupy defensible high ground' : 'hold prepared positions') + ' covering the objective' + (terrainClass && terrainClass !== 'unknown' ? ' (' + terrainClass + ' approach)' : '');
            reason = 'Deny the approach from covered, defensible terrain rather than pursuing the enemy.';
            break;
        }
        case 'withdraw': {
            // Break contact and fall back toward OWN territory / the border (rear fallback),
            // increasing distance from the threat rings.
            if (fallback) {
                target = toward(u, fallback, MAX_STEP_DEG);
                flags.toward_own_territory = true; terrainBasis.push('own_border:' + (prov.own_border || 'inferred'));
            } else if (ownCenter) {
                target = toward(u, ownCenter, MAX_STEP_DEG); flags.toward_own_territory = true;
            } else if (enemy) { target = away(u, enemy, MAX_STEP_DEG); }
            else if (obj) { target = away(u, obj, MAX_STEP_DEG); }
            // Make sure we actually open distance from the threat ring.
            if (enemy && dist(target, enemy) <= dist(u, enemy)) { target = away(u, enemy, MAX_STEP_DEG); flags.toward_own_territory = !!fallback; }
            flags.increases_distance_from_threat = true;
            if (rings) { flags.respects_threat_ring = true; terrainBasis.push('threat_ring:warning'); }
            behavior = 'break contact and fall back toward own territory' + (fallback ? ' / the border' : '');
            reason = 'Preserve the force; fall back along the corridor toward own ground, opening distance from the threat.';
            break;
        }
        case 'avoid_contact': {
            // Keep distance laterally from the enemy.
            if (enemy) {
                var awayDir = norm(vec(enemy, u));
                target = add(u, awayDir, MAX_STEP_DEG * 0.7);
            } else if (obj) target = toward(u, obj, MAX_STEP_DEG * 0.4);
            flags.keeps_distance = true; flags.increases_distance_from_threat = !!enemy;
            behavior = 'maneuver to avoid decisive contact while repositioning';
            reason = 'Mission does not require contact here; preserve freedom of action.';
            break;
        }
        case 'flank': {
            // Approach from a DIFFERENT axis — offset perpendicular to the direct line and
            // OFF the enemy corridor/choke, with a small forward component. Open terrain
            // allows a wider flank; urban/mountain forces a tighter one.
            var d = norm(directAxis);
            var perp = { x: -d.y, y: d.x };
            // Prefer the flank side AWAY from the choke point (avoid the enemy's covered pinch);
            // otherwise the side toward the enemy's flank.
            if (chokePt) {
                var toChoke = vec(u, chokePt);
                if ((perp.x * toChoke.x + perp.y * toChoke.y) > 0) { perp = { x: d.y, y: -d.x }; }
                flags.follows_corridor = true; terrainBasis.push('avoid_choke:' + (prov.choke || 'inferred'));
            } else if (enemy) {
                var toEnemy = vec(u, enemy);
                if ((perp.x * toEnemy.x + perp.y * toEnemy.y) < 0) { perp = { x: d.y, y: -d.x }; }
            }
            var width = (terrainClass === 'urban' || terrainClass === 'mountain') ? 0.7
                : (terrainClass === 'open' || terrainClass === 'desert') ? 1.0 : 0.9;
            if (terrainClass) terrainBasis.push('terrain:' + terrainClass);
            var sideStep = add(u, perp, MAX_STEP_DEG * width);
            target = add(sideStep, d, MAX_STEP_DEG * 0.3);
            flags.different_axis = true;
            behavior = 'maneuver on a flanking axis offset from the direct approach' + (chokePt ? ', avoiding the choke point' : '');
            reason = 'Avoid the enemy\'s strength and the corridor choke; threaten a flank on favourable terrain.';
            break;
        }
        case 'deceive':
        case 'feint': {
            // Misleading movement AWAY from the real objective — toward a decoy axis.
            var base = obj || enemy;
            if (base) {
                var d2 = norm(vec(u, base));
                var decoyDir = { x: -d2.y, y: d2.x }; // 90° off the real axis
                // bias the decoy slightly opposite the real objective so it reads as a feint
                decoyDir = norm({ x: decoyDir.x - d2.x * 0.4, y: decoyDir.y - d2.y * 0.4 });
                target = add(u, decoyDir, MAX_STEP_DEG * 0.85);
            }
            flags.misleading = true; flags.different_axis = true;
            behavior = (action === 'feint') ? 'demonstrate toward a false axis to fix the enemy' : 'present a misleading movement to deceive the enemy as to the main effort';
            reason = 'Draw enemy attention/forces away from the true main effort.';
            break;
        }
        case 'attack': {
            // Direct movement toward the objective (or enemy if no objective).
            var dest = obj || enemy;
            target = dest ? toward(u, dest, MAX_STEP_DEG) : { lat: u.lat, lon: u.lon };
            behavior = 'advance directly on the objective to take/secure it';
            reason = 'Conditions favour direct action on the decisive point.';
            break;
        }
        case 'reposition': {
            // Lateral move to a better position (moderate perpendicular shift).
            var dr = norm(directAxis);
            var perp2 = { x: -dr.y, y: dr.x };
            target = add(u, perp2, MAX_STEP_DEG * 0.6);
            behavior = 'reposition to improve posture/coverage';
            reason = 'Improve fields of observation/fire or mutual support.';
            break;
        }
        case 'support': {
            // Move toward the friendly main effort (objective side) to reinforce.
            var sp = (ctx.support_point && pt(ctx.support_point)) || obj || u;
            target = toward(u, sp, MAX_STEP_DEG * 0.7);
            behavior = 'move to support the main effort';
            reason = 'Weight the decisive operation / be prepared to reinforce.';
            break;
        }
        case 'reserve': {
            // Hold back toward the rear — move away from the front (objective/enemy) a little.
            var front = enemy || obj;
            if (front) target = away(u, front, MAX_STEP_DEG * 0.35);
            behavior = 'remain in reserve, prepared to commit on order';
            reason = 'Retain a reserve to influence the decisive point later.';
            break;
        }
        case 'hold':
        default: {
            target = { lat: u.lat, lon: u.lon };
            flags.no_move = true; flags.occupies_terrain = true;
            behavior = 'hold current position';
            reason = 'Maintain current posture pending new information or orders.';
            break;
        }
    }

    var axisOffset = obj ? angleDeg(vec(u, target), directAxis) : 0;
    var distThreat = enemy ? dist(target, enemy) : null;
    return {
        target: target,
        action: action,
        archetype: ACTION_TO_ARCHETYPE[action] || 'direct_action',
        behavior: behavior,
        reason: reason,
        flags: flags,
        axis_offset_deg: Math.round(axisOffset * 10) / 10,
        distance_to_threat_deg: distThreat == null ? null : Math.round(distThreat * 10000) / 10000,
        corridor_fraction: corridorFraction,
        terrain_basis: terrainBasis,   // GIS factors that drove this action (with provenance tags)
    };
}

// archetype lookup for an action (cautious_recon | maneuver_deception | direct_action)
function classifyArchetype(action) { return ACTION_TO_ARCHETYPE[String(action || '').toLowerCase()] || 'direct_action'; }

function isTacticalAction(action) { return TACTICAL_ACTIONS.indexOf(String(action || '').toLowerCase()) !== -1; }

module.exports = {
    TACTICAL_ACTIONS: TACTICAL_ACTIONS,
    COA_ARCHETYPES: COA_ARCHETYPES,
    MAX_STEP_DEG: MAX_STEP_DEG,
    computeActionGeometry: computeActionGeometry,
    classifyArchetype: classifyArchetype,
    isTacticalAction: isTacticalAction,
};
