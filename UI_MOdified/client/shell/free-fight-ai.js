/* ============================================================================
 * free-fight-ai.js — DOC-UNDERSTANDING-1 / FREE-FIGHT-AI-LITE-A
 * ----------------------------------------------------------------------------
 * A DETERMINISTIC, OFFLINE "AI-lite" planner for the Free Fight demo. It is a
 * heuristic (nearest-anchor + platform-category suitability + terrain/route
 * feasibility) — NOT an LLM and NOT a wargame. It decides, for review only:
 *   • which RED groups attack Objective X        → red_attack_plan[]
 *   • which BLUE groups react and how/where       → blue_reaction_plan[]
 *   • a preferred route/vector (terrain-aware when terrain is available, else
 *     straight-line geometry with a warning).
 *
 * EVERYTHING is demo/review-only. The planner creates NO final units, NO
 * tasking, NO COA, NO weapons/damage/kill-probability, NO adjudication, NO
 * world-state. Every plan entry is needs_review + requires_commander_approval +
 * low/medium confidence (L6); exact_unit_position stays false.
 *
 * Pure + synchronous + Node-requireable. Terrain results are INJECTED via
 * opts.terrain (the browser does the async /api/terrain probe and passes it in);
 * with no terrain the planner falls back to distance geometry + a warning.
 *
 *   window.RmoozFreeFightAI = {
 *     buildPlan(groups, objective, opts), planAttack(...), planReaction(...),
 *     scoreRoute(...), dominantCategory(group)
 *   }
 * ========================================================================== */
(function (root) {
    'use strict';

    var MAX_RED = 3, MAX_BLUE = 3;
    var DEFEND_RING = 0.15, INTERCEPT_RING = 0.35, SCREEN_RING = 0.5; // fraction objective→anchor

    function num(v) { if (v == null || v === '') return null; var n = Number(v); return Number.isFinite(n) ? n : null; }
    function finiteLL(o) { return !!(o && Number.isFinite(num(o.lat)) && Number.isFinite(num(o.lon))); }
    function arr(v) { return Array.isArray(v) ? v : []; }
    function lerp(a, b, t) { return { lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t }; }

    // Approximate great-circle distance (km) — symbolic, fine for demo ranking.
    function distKm(a, b) {
        var R = 6371, toRad = Math.PI / 180;
        var dLat = (b.lat - a.lat) * toRad, dLon = (b.lon - a.lon) * toRad;
        var la1 = a.lat * toRad, la2 = b.lat * toRad;
        var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
    }

    // Platform-category suitability (0..1) for striking vs intercepting.
    var ATTACK_SUIT = { air_fighter: 1, air_attack: 1, uav: 0.9, helicopter: 0.7, naval_surface: 0.6, submarine: 0.5, ground_unit: 0.4, air_defense: 0.2, radar: 0.1, logistics: 0.1, unknown: 0.3 };
    var INTERCEPT_SUIT = { air_defense: 1, air_fighter: 0.9, radar: 0.7, naval_surface: 0.6, helicopter: 0.6, ground_unit: 0.5, uav: 0.4, air_attack: 0.4, submarine: 0.4, logistics: 0.1, unknown: 0.3 };

    function dominantCategory(g) {
        var cc = (g && g.category_counts) || {}, best = 'unknown', n = -1;
        Object.keys(cc).forEach(function (k) { if (cc[k] > n) { n = cc[k]; best = k; } });
        if (n <= 0 && g && g.symbol_category) best = g.symbol_category;
        return best;
    }

    // Score the base-anchor → target route. terrain (optional, per-group) carries
    // a profile: { available, max_slope_deg, elevation_gain_m, mobility } from the
    // terrain API; absent → geometric only + warning.
    function scoreRoute(anchor, target, terrain) {
        var out = { distance_km: null, distance_score: 0, terrain_score: null, terrain_used: false,
            obstacle_warning: null, elevation_warning: null, confidence: 'low',
            route_summary: '', terrain_summary: '', warnings: [] };
        if (!finiteLL(anchor) || !finiteLL(target)) {
            out.warnings.push('missing_coordinates'); out.route_summary = 'no coordinates'; out.terrain_summary = '—';
            return out;
        }
        var d = distKm(anchor, target);
        out.distance_km = Math.round(d * 10) / 10;
        out.distance_score = 1 / (1 + d / 100);          // closer = higher (0..1)
        if (terrain && terrain.available) {
            out.terrain_used = true;
            var slope = num(terrain.max_slope_deg), gain = num(terrain.elevation_gain_m), mob = terrain.mobility || 'unknown';
            out.terrain_score = (mob === 'no_go') ? 0.2 : (mob === 'slow_go' ? 0.6 : 0.9);
            if (slope != null && slope >= 30) out.obstacle_warning = 'steep_slope_' + slope + 'deg';
            if (gain != null && gain >= 1000) out.elevation_warning = 'high_elevation_gain_' + gain + 'm';
            out.route_summary = 'route profile ≈ ' + out.distance_km + ' km (terrain-profiled)';
            out.terrain_summary = 'mobility: ' + mob + (slope != null ? ', max slope ' + slope + '°' : '') + (gain != null ? ', +' + gain + ' m' : '');
            out.confidence = (mob === 'no_go') ? 'low' : 'medium';
            if (out.obstacle_warning) out.warnings.push(out.obstacle_warning);
            if (out.elevation_warning) out.warnings.push(out.elevation_warning);
        } else {
            out.route_summary = 'straight-line ≈ ' + out.distance_km + ' km (geometric)';
            out.terrain_summary = 'Terrain unavailable — geometric demo movement only';
            out.warnings.push('terrain_unavailable_geometric_only');
            out.confidence = d < 400 ? 'medium' : 'low';
        }
        return out;
    }

    function terrainFor(opts, groupId) {
        var t = opts && opts.terrain;
        if (!t || !t.available) return { available: false };
        var routes = t.routes || {};
        var r = routes[groupId];
        return r ? Object.assign({ available: true }, r) : { available: true };
    }

    function planAttack(reds, objective, opts) {
        opts = opts || {};
        var scored = arr(reds).filter(function (g) { return finiteLL(g.anchor); }).map(function (g) {
            var cat = dominantCategory(g), suit = ATTACK_SUIT[cat] != null ? ATTACK_SUIT[cat] : 0.3;
            var route = scoreRoute(g.anchor, objective, terrainFor(opts, g.id));
            var score = route.distance_score * 0.6 + suit * 0.4;
            return { g: g, cat: cat, suit: suit, route: route, score: score };
        });
        scored.sort(function (a, b) { return b.score - a.score; });
        return scored.slice(0, opts.maxRed || MAX_RED).map(function (s) {
            var w = s.route.warnings.slice();
            if (s.suit < 0.5) w.push('low_strike_suitability_' + s.cat);
            return {
                demo_group_id: s.g.id, country: s.g.country || null, source_base: s.g.base_name_en || s.g.base_name_ar || '—',
                dominant_category: s.cat, distance_km: s.route.distance_km,
                reason: 'Nearest RED anchor (' + (s.route.distance_km != null ? s.route.distance_km + ' km' : '—') + ') with ' + s.cat + ' suitability ' + Math.round(s.suit * 100) + '% for a strike toward Objective X.',
                route_summary: s.route.route_summary, terrain_summary: s.route.terrain_summary,
                confidence: s.route.confidence, warnings: w,
                _target: { lat: objective.lat, lon: objective.lon },
                demo_only: true, review_only: true, needs_review: true, requires_commander_approval: true, exact_unit_position: false,
            };
        });
    }

    function reactionTypeFor(cat) {
        if (cat === 'air_defense' || cat === 'air_fighter' || cat === 'radar') return 'intercept';
        if (cat === 'ground_unit') return 'defend_objective';
        if (cat === 'naval_surface' || cat === 'submarine') return 'screen';
        return 'hold';
    }
    function ringFor(rt) { return rt === 'defend_objective' ? DEFEND_RING : (rt === 'intercept' ? INTERCEPT_RING : SCREEN_RING); }

    function planReaction(blues, objective, redPlan, opts) {
        opts = opts || {};
        var scored = arr(blues).filter(function (g) { return finiteLL(g.anchor); }).map(function (g) {
            var cat = dominantCategory(g), suit = INTERCEPT_SUIT[cat] != null ? INTERCEPT_SUIT[cat] : 0.3;
            var route = scoreRoute(g.anchor, objective, terrainFor(opts, g.id));
            // protective value: near the objective + interceptor-capable.
            var score = route.distance_score * 0.6 + suit * 0.4;
            return { g: g, cat: cat, suit: suit, route: route, score: score };
        });
        scored.sort(function (a, b) { return b.score - a.score; });
        var picked = scored.slice(0, opts.maxBlue || MAX_BLUE);
        // Guarantee at least one explicit defender/interceptor (the top pick).
        return picked.map(function (s, i) {
            var rt = reactionTypeFor(s.cat);
            if (i === 0 && rt === 'hold') rt = 'defend_objective';
            var loc = lerp(objective, s.g.anchor, ringFor(rt));   // standoff between objective and home base
            var w = s.route.warnings.slice();
            if (s.suit < 0.4) w.push('low_intercept_suitability_' + s.cat);
            return {
                demo_group_id: s.g.id, country: s.g.country || null, source_base: s.g.base_name_en || s.g.base_name_ar || '—',
                dominant_category: s.cat, distance_km: s.route.distance_km,
                reaction_type: rt,
                reason: 'Nearest BLUE anchor (' + (s.route.distance_km != null ? s.route.distance_km + ' km' : '—') + '); ' + s.cat + ' → ' + rt + ' to protect Objective X.',
                intercept_or_defend_location: { lat: Math.round(loc.lat * 1e5) / 1e5, lon: Math.round(loc.lon * 1e5) / 1e5 },
                route_summary: s.route.route_summary, terrain_summary: s.route.terrain_summary,
                confidence: s.route.confidence, warnings: w,
                _target: loc,
                demo_only: true, review_only: true, needs_review: true, requires_commander_approval: true, exact_unit_position: false,
            };
        });
    }

    function buildPlan(groups, objective, opts) {
        opts = opts || {};
        var terrain = (opts.terrain && opts.terrain.available) ? opts.terrain : { available: false };
        var warnings = [], missing = [];
        groups = arr(groups);
        var anchored = groups.filter(function (g) { return finiteLL(g && g.anchor); });
        var out = {
            red_attack_plan: [], blue_reaction_plan: [],
            terrain_used: !!terrain.available,
            warnings: warnings, missing_information: missing,
            planner: 'free-fight-ai-lite (deterministic heuristic; no LLM)',
            requires_commander_approval: true, needs_review: true, demo_only: true,
        };
        if (!anchored.length) { warnings.push('No map anchors available — لا توجد مراسٍ على الخريطة'); return out; }
        if (!finiteLL(objective)) { warnings.push('Place Objective X to plan — ضع الهدف X للتخطيط'); return out; }
        if (!terrain.available) { warnings.push('Terrain unavailable; using geometric demo movement only'); missing.push('terrain_profile'); }
        var reds = anchored.filter(function (g) { return String(g.side).toUpperCase() === 'RED'; });
        var blues = anchored.filter(function (g) { return String(g.side).toUpperCase() === 'BLUE'; });
        out.red_attack_plan = planAttack(reds, objective, opts);
        out.blue_reaction_plan = planReaction(blues, objective, out.red_attack_plan, opts);
        if (!reds.length) warnings.push('No RED attack groups available — لا توجد مجموعات هجوم حمراء');
        if (!blues.length) warnings.push('No BLUE reaction groups available — لا توجد مجموعات رد فعل زرقاء');
        return out;
    }

    var API = { buildPlan: buildPlan, planAttack: planAttack, planReaction: planReaction, scoreRoute: scoreRoute, dominantCategory: dominantCategory, distKm: distKm };
    if (typeof module !== 'undefined' && module.exports) module.exports = API;
    if (typeof window !== 'undefined') window.RmoozFreeFightAI = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
