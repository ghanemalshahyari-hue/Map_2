'use strict';
/* ============================================================================
 * sovereign-zone-engine.js — shared AI-intelligence module
 * ----------------------------------------------------------------------------
 * Infers defended sovereign zones (airspace / territorial waters / land buffer /
 * base zone) around the defended objective and any base units, then evaluates
 * whether an intruding unit is inside a warning / defended / engagement ring.
 *
 * DEMO / REVIEW-ONLY HEURISTIC. All zones are INFERRED from scenario geometry,
 * never authoritative. Every zone is labeled inferred / review-only. Country
 * labeling is a coarse name-match only. No classified data. No kill logic.
 *
 * Scenario-generic: no hardcoded scenario/draft names, no hardcoded unit IDs.
 * Pure module — no DOM, no network, requireable in isolation (CommonJS).
 *
 * Exports:
 *   inferZones(scenario, objectives)              → [zone]
 *   evaluateZone(unit, position, scenarioOrZones) → zone evaluation
 * ========================================================================== */

var catalog = require('./platform-capability-catalog');

// Inferred concentric ring radii (degrees from the defended center). Review-only.
var WARNING_RING_DEG = 0.35;
var DEFENDED_RING_DEG = 0.20;
var ENGAGEMENT_RING_DEG = 0.10;
var BASE_ZONE_DEG = 0.12; // inferred protected radius around a base unit

function arr(v) { return Array.isArray(v) ? v : []; }
function finiteN(v) { var n = Number(v); return Number.isFinite(n) ? n : null; }

// Accept {lat,lon} OR [lon,lat]. Returns {lat,lon} or null.
function toLL(p) {
    if (!p) return null;
    if (Array.isArray(p) && p.length >= 2) {
        var lo = finiteN(p[0]), la = finiteN(p[1]);
        return (la != null && lo != null) ? { lat: la, lon: lo } : null;
    }
    var lat = finiteN(p.lat), lon = finiteN(p.lon);
    if (lat == null && lon == null && Array.isArray(p.coord) && p.coord.length >= 2) {
        return toLL(p.coord);
    }
    return (lat != null && lon != null) ? { lat: lat, lon: lon } : null;
}

function dist(a, b) { var dx = a.lat - b.lat, dy = a.lon - b.lon; return Math.sqrt(dx * dx + dy * dy); }

// Zone centers are stored as [lat, lon] (per the inferZones contract).
function centerLL(center) {
    if (Array.isArray(center) && center.length >= 2) {
        var la = finiteN(center[0]), lo = finiteN(center[1]);
        return (la != null && lo != null) ? { lat: la, lon: lo } : null;
    }
    return toLL(center);
}

function objectiveLL(objectives, scenario) {
    var list = arr(objectives);
    for (var i = 0; i < list.length; i++) {
        var ll = toLL(list[i]);
        if (ll) return { lat: ll.lat, lon: ll.lon, name: (list[i] && (list[i].name || list[i].label)) || 'Objective' };
    }
    if (scenario && scenario.objective) {
        var so = toLL(scenario.objective);
        if (so) return { lat: so.lat, lon: so.lon, name: scenario.objective.name || 'Objective' };
    }
    return null;
}

// Coarse country label from scenario name/label. Generic otherwise.
function inferCountry(scenario) {
    var s = scenario || {};
    var txt = String(s.name || s.scenario_label || s.label || s.title || '').toLowerCase();
    if (/uae|abu dhabi|emirates|emirati|u\.a\.e/.test(txt)) return 'UAE';
    return 'unknown';
}

function baseUnits(scenario) {
    var units = (scenario && (scenario.units || scenario.unit_list)) || [];
    return arr(units).filter(function (u) {
        var c = catalog.classifyUnit(u);
        return c.domain === 'base';
    });
}

/**
 * inferZones(scenario, objectives) → array of inferred defended zones.
 * Concentric warning/defended/engagement rings around the objective, plus an
 * inferred base zone around any base unit. All review-only / inferred.
 */
function inferZones(scenario, objectives) {
    var scen = scenario || {};
    var country = inferCountry(scen);
    var zones = [];
    var obj = objectiveLL(objectives, scen);

    if (obj) {
        var center = [obj.lat, obj.lon];
        zones.push({ zone_type: 'airspace', owner_side: 'BLUE', owner_country: country, center: center, radius_deg: WARNING_RING_DEG, ring: 'warning', source: 'inferred_review_only', label: 'inferred warning zone (review-only) around ' + obj.name });
        zones.push({ zone_type: 'land_buffer', owner_side: 'BLUE', owner_country: country, center: center, radius_deg: DEFENDED_RING_DEG, ring: 'defended', source: 'inferred_review_only', label: 'inferred defended zone (review-only) around ' + obj.name });
        zones.push({ zone_type: 'exclusion_zone', owner_side: 'BLUE', owner_country: country, center: center, radius_deg: ENGAGEMENT_RING_DEG, ring: 'engagement', source: 'inferred_review_only', label: 'inferred engagement-ready zone (review-only) around ' + obj.name });
    }

    baseUnits(scen).forEach(function (u) {
        var ll = toLL(u);
        if (!ll) return;
        zones.push({ zone_type: 'base_zone', owner_side: 'BLUE', owner_country: country, center: [ll.lat, ll.lon], radius_deg: BASE_ZONE_DEG, ring: 'base', source: 'inferred_review_only', label: 'inferred base zone (review-only)' });
    });

    return zones;
}

// Domain-driven zone type for an intruding unit inside a ring near the objective.
function zoneTypeFor(unit) {
    var domain = catalog.classifyUnit(unit || {}).domain;
    if (domain === 'air') return 'airspace';
    if (domain === 'naval') return 'territorial_waters';
    return 'land_buffer';
}

var SEVERITY_BY_RING = { warning: 'warning', defended: 'alert', engagement: 'engagement_ready', base: 'alert' };

/**
 * evaluateZone(unit, position, scenarioOrZones) → which inferred ring the unit
 * is inside (worst/innermost), its violation severity and an event code.
 * scenarioOrZones may be a scenario object (zones inferred) or a zones[] array.
 */
function evaluateZone(unit, position, scenarioOrZones) {
    var pos = toLL(position) || toLL(unit);
    var zones;
    if (Array.isArray(scenarioOrZones)) zones = scenarioOrZones;
    else zones = inferZones(scenarioOrZones, (scenarioOrZones && scenarioOrZones.objectives) || []);

    var clear = {
        zone_type: 'unknown',
        owner_side: null,
        owner_country: (zones[0] && zones[0].owner_country) || 'unknown',
        violation: false,
        severity: 'watch',
        warning_text: 'No inferred zone violation — unit outside all review-only rings.',
        event_code: 'outside_all_zones',
        source: 'inferred_review_only',
        demo_only: true, review_only: true,
    };
    if (!pos || !zones.length) return clear;

    // Find the most severe ring the unit is inside (smallest radius wins).
    var hit = null;
    zones.forEach(function (z) {
        var c = centerLL(z.center);
        if (!c) return;
        if (dist(pos, c) <= Number(z.radius_deg)) {
            if (!hit || Number(z.radius_deg) < Number(hit.radius_deg)) hit = z;
        }
    });
    if (!hit) return clear;

    var severity = SEVERITY_BY_RING[hit.ring] || 'warning';
    var ztype = hit.ring === 'base' ? 'base_zone' : zoneTypeFor(unit);
    var owner = hit.owner_country && hit.owner_country !== 'unknown' ? (' (' + hit.owner_country + ')') : '';
    var ringWord = hit.ring === 'engagement' ? 'engagement-ready' : (hit.ring === 'base' ? 'base' : hit.ring);
    var eventCode = 'red_in_' + (hit.ring === 'engagement' ? 'engagement' : hit.ring) + '_zone';

    return {
        zone_type: ztype,
        owner_side: hit.owner_side || 'BLUE',
        owner_country: hit.owner_country || 'unknown',
        violation: true,
        severity: severity,
        warning_text: 'Intruding unit inside inferred ' + ringWord + ' ' + ztype.replace('_', ' ') + owner + ' — review-only.',
        event_code: eventCode,
        ring: hit.ring,
        source: 'inferred_review_only',
        demo_only: true, review_only: true,
    };
}

module.exports = {
    inferZones: inferZones,
    evaluateZone: evaluateZone,
    WARNING_RING_DEG: WARNING_RING_DEG,
    DEFENDED_RING_DEG: DEFENDED_RING_DEG,
    ENGAGEMENT_RING_DEG: ENGAGEMENT_RING_DEG,
};
