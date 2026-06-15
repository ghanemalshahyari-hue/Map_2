/**
 * tactical-terrain-context.js — RMOOZ (GIS terrain-aware tactics)
 *
 * Assemble the GIS / terrain / zone context that the tactical action library reasons from,
 * with HONEST provenance for every factor (real data vs geometric/text-hint inference — we
 * never claim fabricated GIS). It consumes what the engines actually have:
 *   - threat rings + zones      ← free-fight-situation-triggers / sovereign-zone-engine (geometric)
 *   - country / sovereign zone  ← scenario-intel.zone_state (inferred, name-matched)
 *   - terrain class (coast/urban/desert/mountain/open) ← terrain text hints (inferred)
 *   - movement corridor         ← enemy→objective axis (inferred; no road network present)
 *   - choke point               ← point on the corridor (inferred; DEM-refined when available)
 *   - high ground / observation ← real elevation DEM when in coverage, else inferred vantage
 *   - own border / fallback     ← own-force centroid → rear (inferred)
 *   - route cost / ease         ← real DEM slope when available, else terrain-class modifier
 *
 * Pure + sync. An optional sync `elevationAt(lat,lon)→metres|null` (e.g. dem-service.getElevation
 * wrapped) upgrades high_ground / route_cost / choke to REAL data where the DEM covers the area.
 *
 * buildTacticalTerrainContext(opts) → ctx (consumed by tactical-action-library.computeActionGeometry)
 */
'use strict';

function pt(o) {
    if (!o) return null;
    var lat = Number(o.lat != null ? o.lat : (Array.isArray(o.coord) ? o.coord[1] : o[1]));
    var lon = Number(o.lon != null ? o.lon : (o.lng != null ? o.lng : (Array.isArray(o.coord) ? o.coord[0] : o[0])));
    return (Number.isFinite(lat) && Number.isFinite(lon)) ? { lat: lat, lon: lon } : null;
}
function dist(a, b) { return Math.hypot(a.lon - b.lon, a.lat - b.lat); }
function lerp(a, b, t) { return { lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t }; }
function unitVec(from, to) { var dx = to.lon - from.lon, dy = to.lat - from.lat, L = Math.hypot(dx, dy) || 1e-9; return { x: dx / L, y: dy / L }; }
function add(p, v, d) { return { lat: p.lat + v.y * d, lon: p.lon + v.x * d }; }

// Terrain class from any free-text terrain hint (same vocabulary the terrain-effects engine
// recognizes). Drives standoff/flank width and the route-cost ease factor.
function classifyTerrain(text) {
    var t = String(text || '').toLowerCase();
    if (/\b(coast|coastal|littoral|shore|sea|naval|amphib)/.test(t)) return 'coastal';
    if (/\b(urban|city|built[- ]?up|town)/.test(t)) return 'urban';
    if (/\b(mountain|ridge|highland|alpine|elevat)/.test(t)) return 'mountain';
    if (/\b(desert|arid|sand|dune)/.test(t)) return 'desert';
    if (/\b(open|plain|flat|steppe)/.test(t)) return 'open';
    return 'unknown';
}
// Movement ease 0..1 (1 = unimpeded). A coarse, honest stand-in for route cost when no DEM.
var TERRAIN_EASE = { open: 1.0, desert: 0.9, coastal: 0.8, urban: 0.65, mountain: 0.55, unknown: 0.85 };

/**
 * buildTacticalTerrainContext(opts)
 *   opts: { objective, nearestEnemy, situation, intel, ownUnits, side, elevationAt }
 */
function buildTacticalTerrainContext(opts) {
    opts = opts || {};
    var obj = pt(opts.objective);
    var enemy = pt(opts.nearestEnemy) || (opts.situation && pt(opts.situation.nearest_red));
    var situation = opts.situation || {};
    var intel = opts.intel || {};
    var ownUnits = Array.isArray(opts.ownUnits) ? opts.ownUnits.map(pt).filter(Boolean) : [];
    var elevationAt = (typeof opts.elevationAt === 'function') ? opts.elevationAt : null;

    var provenance = {};

    // ── threat rings (geometric, real-as-computed) ──
    var rings = (situation.thresholds_deg && situation.thresholds_deg.warning != null)
        ? { warning: +situation.thresholds_deg.warning, defended: +situation.thresholds_deg.defended, engagement: +situation.thresholds_deg.engagement }
        : { warning: 0.35, defended: 0.20, engagement: 0.10 };
    provenance.threat_rings = 'inferred_geometric';

    // ── country / sovereign zone (inferred, name-matched) ──
    var zone = (intel.zone_state && typeof intel.zone_state === 'object') ? intel.zone_state : null;
    provenance.zones = zone ? 'inferred' : 'absent';
    provenance.borders = zone && zone.owner_country && zone.owner_country !== 'unknown' ? 'inferred_country_label' : 'absent';

    // ── own territory direction + fallback (inferred from own force centroid) ──
    var ownCenter = null, fallback = null;
    if (ownUnits.length) {
        var sl = 0, sn = 0; ownUnits.forEach(function (u) { sl += u.lat; sn += u.lon; });
        ownCenter = { lat: sl / ownUnits.length, lon: sn / ownUnits.length };
        if (obj) fallback = { lat: ownCenter.lat + (ownCenter.lat - obj.lat) * 0.6, lon: ownCenter.lon + (ownCenter.lon - obj.lon) * 0.6 };
    }
    provenance.own_border = fallback ? 'inferred' : 'absent';

    // ── terrain class + movement ease (text hint; DEM upgrades route cost) ──
    var terrainText = intel.terrain_summary || (intel.terrain && (intel.terrain.summary || intel.terrain.notes)) || opts.terrain_note || '';
    var terrainClass = classifyTerrain(terrainText);
    provenance.terrain_class = terrainClass === 'unknown' ? 'absent' : 'inferred_text_hint';
    var routeEase = TERRAIN_EASE[terrainClass] || TERRAIN_EASE.unknown;

    // ── movement corridor (inferred axis; no road network present) ──
    var corridor = (enemy && obj) ? { from: enemy, to: obj } : null;
    provenance.corridor = corridor ? 'inferred_axis' : 'absent';

    // ── choke point on the corridor (inferred; DEM-refined to a relief pinch if available) ──
    var choke = null;
    if (corridor) {
        choke = lerp(enemy, obj, 0.4);
        provenance.choke = 'inferred_corridor';
        if (elevationAt) {
            // Pick the corridor sample with the steepest local relief (a real pinch point).
            var best = null, bestRelief = -1, samples = [0.3, 0.4, 0.5, 0.6];
            for (var i = 0; i < samples.length; i++) {
                var p = lerp(enemy, obj, samples[i]);
                var e0 = elevationAt(p.lat, p.lon);
                if (e0 == null) continue;
                var perp = { x: -(obj.lat - enemy.lat), y: (obj.lon - enemy.lon) };
                var Lp = Math.hypot(perp.x, perp.y) || 1e-9; perp = { x: perp.x / Lp, y: perp.y / Lp };
                var eL = elevationAt(p.lat + perp.y * 0.02, p.lon + perp.x * 0.02);
                var eR = elevationAt(p.lat - perp.y * 0.02, p.lon - perp.x * 0.02);
                var relief = Math.max(eL == null ? 0 : eL - e0, eR == null ? 0 : eR - e0);
                if (relief > bestRelief) { bestRelief = relief; best = p; }
            }
            if (best) { choke = best; provenance.choke = 'gis_dem_relief'; }
        }
    }

    // ── high ground / observation point (real DEM peak when covered; else inferred vantage) ──
    var highGround = null;
    if (obj && enemy) {
        // Candidate overwatch positions: offset to the friendly flank of the corridor, at the
        // defended-ring standoff from the objective, on the own-force side.
        var ax = unitVec(enemy, obj);
        var perp2 = { x: -ax.y, y: ax.x };
        if (ownCenter) { var toOwn = unitVec(obj, ownCenter); if ((perp2.x * toOwn.x + perp2.y * toOwn.y) < 0) perp2 = { x: ax.y, y: -ax.x }; }
        var standoff = rings.defended || 0.2;
        var baseVantage = add(obj, perp2, standoff);
        if (elevationAt) {
            var cands = [-1, -0.5, 0, 0.5, 1].map(function (k) { return add(baseVantage, { x: ax.x, y: ax.y }, k * standoff * 0.5); });
            var hi = null, hiE = -Infinity;
            cands.forEach(function (c) { var e = elevationAt(c.lat, c.lon); if (e != null && e > hiE) { hiE = e; hi = c; hi._elev_m = e; } });
            if (hi) { highGround = hi; provenance.high_ground = 'gis_dem'; }
        }
        if (!highGround) { highGround = baseVantage; provenance.high_ground = 'inferred_vantage'; }
    } else { provenance.high_ground = 'absent'; }

    // ── route cost / ease (derived from terrain class; honest — we do NOT compute DEM
    // slope here, so the provenance is terrain-class inference even when a DEM is wired) ──
    var routeCost = +(1 - routeEase).toFixed(2); // 0 (easy) .. ~0.45 (hard)
    provenance.route_cost = 'inferred_terrain_class';

    return {
        objective: obj,
        nearestEnemy: enemy,
        threat_rings: rings,
        threatZoneRadiusDeg: rings.defended, // back-compat with the action library
        sovereign_zone: zone,
        owner_country: zone && zone.owner_country || null,
        own_center: ownCenter,
        border_ref: fallback,
        fallback: fallback,
        terrain_class: terrainClass,
        route_ease: routeEase,
        route_cost: routeCost,
        corridor: corridor,
        choke: choke,
        high_ground: highGround,
        provenance: provenance,
        // nested shape the library already understands
        terrain: { corridor: corridor, choke: choke, high_ground: highGround, terrain_class: terrainClass },
        review_only: true,
        demo_only: true,
    };
}

module.exports = {
    buildTacticalTerrainContext: buildTacticalTerrainContext,
    classifyTerrain: classifyTerrain,
    TERRAIN_EASE: TERRAIN_EASE,
};
