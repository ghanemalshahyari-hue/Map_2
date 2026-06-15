'use strict';
/* ============================================================================
 * contact-detection-engine.js — shared AI-intelligence module
 * ----------------------------------------------------------------------------
 * Builds a defender's sensor contact picture: which intruding units are
 * detected / suspected / unknown given the defender's proximity and sensors.
 *
 * DEMO / REVIEW-ONLY HEURISTIC. Detection is a coarse distance model in
 * coordinate degrees — NOT a real radar/sensor performance model and NO
 * classified ranges. No omniscience unless context.demo_omniscient === true.
 *
 * Scenario-generic: no hardcoded scenario/draft names, no hardcoded unit IDs.
 * Pure module — no DOM, no network, requireable in isolation (CommonJS).
 *
 * Exports:
 *   buildContactPicture(units, context) → contact picture
 * ========================================================================== */

var catalog = require('./platform-capability-catalog');

// Demo detection radii (degrees). Sensor/radar units extend the firm range.
var BASE_DETECT_DEG = 0.18;     // any defender holds a firm contact within this
var SENSOR_DETECT_DEG = 0.45;   // a sensor/radar defender holds firm contact within this
var SUSPECT_DEG = 0.70;         // beyond firm but within this → suspected
var DEG_TO_KM = 111;

function arr(v) { return Array.isArray(v) ? v : []; }
function finiteN(v) { var n = Number(v); return Number.isFinite(n) ? n : null; }
function unitUid(u) { return (u && (u.uid || u.unit_uid || u.id)) || null; }
function unitSide(u) { return String((u && u.side) || 'RED').toUpperCase(); }

function unitLL(u) {
    if (!u) return null;
    var la = finiteN(u.lat), lo = finiteN(u.lon);
    if ((la == null || lo == null) && Array.isArray(u.coord) && u.coord.length >= 2) { lo = finiteN(u.coord[0]); la = finiteN(u.coord[1]); }
    return (la != null && lo != null) ? { lat: la, lon: lo } : null;
}
function dist(a, b) { var dx = a.lat - b.lat, dy = a.lon - b.lon; return Math.sqrt(dx * dx + dy * dy); }
function round4(n) { return Math.round(n * 1e4) / 1e4; }

function isSensor(unit) {
    var c = catalog.classifyUnit(unit);
    return c.domain === 'radar' || (Number(c.capability_scores.sensor) || 0) >= 70;
}

function objectiveLL(context) {
    var c = context || {};
    if (c.objective) {
        var ll = unitLL(c.objective);
        if (ll) return ll;
        var lat = finiteN(c.objective.lat), lon = finiteN(c.objective.lon);
        if (lat != null && lon != null) return { lat: lat, lon: lon };
    }
    if (Array.isArray(c.objectives)) {
        for (var i = 0; i < c.objectives.length; i++) { var o = unitLL(c.objectives[i]); if (o) return o; }
    }
    return null;
}

/**
 * buildContactPicture(units, context) → defender's sensor picture.
 * Intruders (the non-defending side) are classified detected / suspected /
 * unknown relative to the defender's units and sensors.
 */
function buildContactPicture(units, context) {
    var ctx = context || {};
    var defending = String(ctx.defending_side || 'BLUE').toUpperCase();
    var omniscient = ctx.demo_omniscient === true;
    var all = arr(units).filter(unitLL);
    var defenders = all.filter(function (u) { return unitSide(u) === defending; });
    var intruders = all.filter(function (u) { return unitSide(u) !== defending; });
    var obj = objectiveLL(ctx);

    var detected = [], suspected = [], unknown = [];

    intruders.forEach(function (iu) {
        var ill = unitLL(iu);
        var entry = { unit_uid: unitUid(iu), side: unitSide(iu), distance_deg: null, detected_by: null };

        if (omniscient) {
            entry.distance_deg = obj ? round4(dist(ill, obj)) : null;
            entry.detected_by = 'demo_omniscient';
            detected.push(entry);
            return;
        }

        // Closest defender + whether any sensor/proximity range covers the intruder.
        var best = { d: Infinity, by: null, range: 0 };
        defenders.forEach(function (du) {
            var dll = unitLL(du);
            var d = dist(ill, dll);
            var range = isSensor(du) ? SENSOR_DETECT_DEG : BASE_DETECT_DEG;
            if (d < best.d) { best = { d: d, by: unitUid(du), range: range, du: du }; }
            // Track the widest covering sensor too.
            if (d <= range && (best.covered == null || d < best.coveredD)) {
                best.covered = unitUid(du); best.coveredD = d; best.coveredRange = range;
            }
        });

        entry.distance_deg = best.d === Infinity ? null : round4(best.d);

        if (best.d === Infinity) {
            unknown.push(entry);
        } else if (best.covered != null) {
            entry.detected_by = best.covered;
            detected.push(entry);
        } else if (best.d <= SUSPECT_DEG) {
            entry.detected_by = best.by;
            suspected.push(entry);
        } else {
            unknown.push(entry);
        }
    });

    // Nearest threats: intruders ranked by distance to objective (or nearest defender).
    var nearest = intruders.map(function (iu) {
        var ill = unitLL(iu);
        var d;
        if (obj) d = dist(ill, obj);
        else {
            d = Infinity;
            defenders.forEach(function (du) { var dd = dist(ill, unitLL(du)); if (dd < d) d = dd; });
        }
        return { unit_uid: unitUid(iu), side: unitSide(iu), distance_deg: d === Infinity ? null : round4(d), distance_km: d === Infinity ? null : Math.round(d * DEG_TO_KM * 10) / 10 };
    }).filter(function (e) { return e.distance_deg != null; })
      .sort(function (a, b) { return a.distance_deg - b.distance_deg; });

    var sensorSide = catalog.computeSuperiority(units).sensor;

    return {
        detected_contacts: detected,
        suspected_contacts: suspected,
        unknown_contacts: unknown,
        nearest_threats: nearest,
        sensor_advantage_side: sensorSide,
        defending_side: defending,
        confidence: omniscient ? 'demo_omniscient' : (defenders.length ? 'medium' : 'low'),
        demo_only: true, review_only: true,
    };
}

module.exports = {
    buildContactPicture: buildContactPicture,
    BASE_DETECT_DEG: BASE_DETECT_DEG,
    SENSOR_DETECT_DEG: SENSOR_DETECT_DEG,
    SUSPECT_DEG: SUSPECT_DEG,
};
