/* ============================================================================
 * domain-movement.js — DOMAIN-AWARE-MOVEMENT-A
 * ----------------------------------------------------------------------------
 * Pure, review-only ROUTE-SHAPE helper for the Free Fight demo so movement is
 * domain-aware: ships don't glide straight into an inland Objective X, support
 * units hold, air/ground move directly. This is schematic demo geometry — NOT a
 * tasking engine, NOT amphibious-assault simulation, NOT a real route planner.
 *
 * HARD BOUNDARY: no final tasking, no final route approval, no weapons/damage/
 * adjudication, no world-state. Every route is demo_only / review_only /
 * needs_review / exact_route:false. No coastline GIS — uses available anchor /
 * base coordinates only (nearest naval/port/shore anchor = "coastal approach").
 *
 *   window.RmoozDomainMovement = {
 *     classifyMovementDomain(group)            → 'air'|'naval'|'ground'|'support'|'unknown'
 *     isLikelyInlandObjective(objective, anchors)
 *     findCoastalApproachPoint(group, objective, anchors)  → {lat,lon}|null
 *     buildDemoRoute(group, objective, anchors)            → route schema
 *   }   (+ module.exports for Node tests)
 * ========================================================================== */
(function (root) {
    'use strict';

    var AIR = { air_fighter: 1, air_attack: 1, uav: 1, helicopter: 1, air_transport: 1 };
    var NAVAL = { naval_surface: 1, submarine: 1, maritime_patrol: 1 };
    var GROUND = { infantry: 1, mechanized_infantry: 1, armor: 1, artillery: 1, engineer: 1, logistics: 1, ground_unit: 1, reconnaissance: 1 };
    var SUPPORT = { radar: 1, air_defense: 1, hq: 1 };
    var COAST_RE = /naval|port|harbou?r|shore|coast|marin|jetty|wharf|بحر|مينا|ساحل/i;

    function num(v) { if (v == null || v === '') return null; var n = Number(v); return Number.isFinite(n) ? n : null; }
    function ll(o) { if (!o) return null; var a = num(o.lat), b = num(o.lon != null ? o.lon : o.lng); return (a == null || b == null) ? null : { lat: a, lon: b }; }
    function dist2(a, b) { var dx = a.lat - b.lat, dy = a.lon - b.lon; return dx * dx + dy * dy; }
    function arr(v) { return Array.isArray(v) ? v : []; }

    // Dominant symbol category of a group (group may be a string, or carry
    // symbol_category / dominant_symbol_category / unit_intel_summary / category_counts).
    function domCat(group) {
        if (typeof group === 'string') return group.toLowerCase();
        group = group || {};
        if (group.unit_intel_summary && group.unit_intel_summary.dominant_symbol_category &&
            group.unit_intel_summary.dominant_symbol_category !== 'unknown') return group.unit_intel_summary.dominant_symbol_category;
        if (group.dominant_symbol_category) return group.dominant_symbol_category;
        if (group.symbol_category) return group.symbol_category;
        var cc = group.category_counts;
        if (cc) { var best = 'unknown', n = -1; Object.keys(cc).forEach(function (k) { if (cc[k] > n) { n = cc[k]; best = k; } }); return best; }
        return 'unknown';
    }

    function classifyMovementDomain(group) {
        var c = domCat(group);
        if (AIR[c]) return 'air';
        if (NAVAL[c]) return 'naval';
        if (SUPPORT[c]) return 'support';
        if (GROUND[c]) return 'ground';
        return 'unknown';
    }

    function isCoastalAnchor(a) {
        if (!a) return false;
        var t = [a.site_type, a.object_type, a.base_type, a.anchor_type, a.placement_type, a.type, a.symbol_category, a.mention]
            .filter(Boolean).join(' ');
        return COAST_RE.test(t);
    }

    // Heuristic (no coastline GIS): the objective is "likely inland" when it sits
    // nearer to a non-coastal anchor than to any coastal/naval anchor. No coastal
    // anchors at all → treat as inland (naval route will warn separately).
    function isLikelyInlandObjective(objective, anchors) {
        var obj = ll(objective); if (!obj) return false;
        var coastal = [], land = [];
        arr(anchors).forEach(function (a) { var p = ll(a); if (!p) return; (isCoastalAnchor(a) ? coastal : land).push(p); });
        if (!coastal.length) return true;
        if (!land.length) return false;
        var nearestCoast = Math.min.apply(null, coastal.map(function (p) { return dist2(obj, p); }));
        var nearestLand = Math.min.apply(null, land.map(function (p) { return dist2(obj, p); }));
        return nearestLand <= nearestCoast;
    }

    // Nearest coastal/naval/port/shore-like anchor to the destination.
    function findCoastalApproachPoint(group, objective, anchors) {
        var obj = ll(objective); if (!obj) return null;
        var best = null, bestD = Infinity;
        arr(anchors).forEach(function (a) {
            if (!isCoastalAnchor(a)) return;
            var p = ll(a); if (!p) return;
            var d = dist2(obj, p);
            if (d < bestD) { bestD = d; best = p; }
        });
        return best;
    }

    function wp(p, label, phase) { return { lat: p.lat, lng: p.lon, label: label, phase: phase }; }

    function buildDemoRoute(group, objective, anchors) {
        var domain = classifyMovementDomain(group);
        var anchor = ll(group && group.anchor) || ll(group);
        var obj = ll(objective);
        var out = { movement_domain: domain, route_type: 'unknown_direct', waypoints: [], warnings: [],
            needs_review: true, demo_only: true, review_only: true, exact_route: false };

        if (!anchor) { out.warnings.push('No usable start anchor; route is schematic only'); if (obj) out.waypoints.push(wp(obj, 'Objective (schematic)', 'approach')); return out; }

        if (domain === 'support') {
            out.route_type = 'support_hold';
            out.waypoints = [wp(anchor, 'Hold position', 'hold')];
            out.warnings.push('Support unit holds position unless commander assigns relocation');
            return out;
        }
        if (!obj) { out.warnings.push('No objective; route is schematic only'); out.waypoints.push(wp(anchor, 'Start', 'staged')); return out; }

        if (domain === 'naval') {
            out.route_type = 'naval_to_coast';
            var coast = findCoastalApproachPoint(group, objective, anchors);
            if (coast) {
                out.waypoints = [wp(anchor, 'Naval start', 'staged'), wp(coast, 'Coastal approach', 'approach')];
                if (isLikelyInlandObjective(objective, anchors)) out.warnings.push('Landing/shore movement is future phase — route shown is schematic.');
            } else {
                out.waypoints = [wp(anchor, 'Naval start', 'staged'), wp(obj, 'Objective (schematic)', 'approach')];
                out.warnings.push('No coastal approach point found; naval route is schematic only');
            }
            return out;
        }
        if (domain === 'air') {
            out.route_type = 'air_direct';
            out.waypoints = [wp(anchor, 'Air start', 'staged'), wp(obj, 'Objective area', 'approach')];
            return out;
        }
        if (domain === 'ground') {
            out.route_type = 'ground_direct';
            out.waypoints = [wp(anchor, 'Ground start', 'staged'), wp(obj, 'Objective', 'approach')];
            return out;
        }
        // unknown
        out.route_type = 'unknown_direct';
        out.waypoints = [wp(anchor, 'Start', 'staged'), wp(obj, 'Objective (schematic)', 'approach')];
        out.warnings.push('Unknown movement domain; using schematic direct demo route');
        return out;
    }

    var API = {
        classifyMovementDomain: classifyMovementDomain,
        isLikelyInlandObjective: isLikelyInlandObjective,
        findCoastalApproachPoint: findCoastalApproachPoint,
        buildDemoRoute: buildDemoRoute,
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = API;
    if (typeof window !== 'undefined') window.RmoozDomainMovement = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
