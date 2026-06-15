'use strict';
/* ============================================================================
 * scenario-intel.js — shared AI-intelligence aggregator
 * ----------------------------------------------------------------------------
 * Combines the six intel engines into one situational picture: capability
 * summary, superiority, terrain, inferred zone state, contact picture, ROE/alert
 * state, recommended COA families and the defender's best assets for the threat.
 *
 * DEMO / REVIEW-ONLY. Composes pure heuristic engines only — no kill logic, no
 * unit removal, no classified data. Scenario-generic: no hardcoded scenario/
 * draft names, no hardcoded unit IDs.
 *
 * Pure module — no DOM, no network, requireable in isolation (CommonJS).
 *
 * Exports:
 *   buildScenarioIntel(units, objectives, context) → combined intel
 * ========================================================================== */

var catalog = require('./platform-capability-catalog');
var terrain = require('./terrain-effects-engine');
var zones = require('./sovereign-zone-engine');
var contacts = require('./contact-detection-engine');
var roe = require('./roe-escalation-engine');
var coa = require('./coa-variation-engine');

function arr(v) { return Array.isArray(v) ? v : []; }
function finiteN(v) { var n = Number(v); return Number.isFinite(n) ? n : null; }
function unitSide(u) { return String((u && u.side) || 'RED').toUpperCase(); }

function unitLL(u) {
    if (!u) return null;
    var la = finiteN(u.lat), lo = finiteN(u.lon);
    if ((la == null || lo == null) && Array.isArray(u.coord) && u.coord.length >= 2) { lo = finiteN(u.coord[0]); la = finiteN(u.coord[1]); }
    return (la != null && lo != null) ? { lat: la, lon: lo } : null;
}
function objLL(objectives) {
    var list = arr(objectives);
    for (var i = 0; i < list.length; i++) {
        var o = list[i]; if (!o) continue;
        var ll = unitLL(o); if (ll) return ll;
        var lat = finiteN(o.lat), lon = finiteN(o.lon);
        if (lat != null && lon != null) return { lat: lat, lon: lon };
    }
    return null;
}
function dist(a, b) { var dx = a.lat - b.lat, dy = a.lon - b.lon; return Math.sqrt(dx * dx + dy * dy); }

// Pick the intruding (non-defending) unit nearest the objective.
function nearestIntruder(units, defending, objective) {
    var best = null, bestD = Infinity;
    arr(units).forEach(function (u) {
        if (unitSide(u) === defending) return;
        var ll = unitLL(u); if (!ll) return;
        var ref = objective || ll;
        var d = objective ? dist(ll, objective) : 0;
        if (d < bestD) { bestD = d; best = u; }
    });
    return best;
}

// Map a zone/threat domain to the BLUE asset role to recommend.
function roleForThreat(zoneState) {
    var zt = String((zoneState && zoneState.zone_type) || '').toLowerCase();
    if (zt === 'airspace') return 'intercept';
    if (zt === 'territorial_waters') return 'naval_strike';
    if (zt === 'land_buffer' || zt === 'base_zone') return 'ground_attack';
    return 'air_defense';
}

/**
 * buildScenarioIntel(units, objectives, context) → combined intel object.
 */
function buildScenarioIntel(units, objectives, context) {
    var ctx = context || {};
    var defending = String(ctx.defending_side || 'BLUE').toUpperCase();
    var activeSide = String(ctx.active_side || 'RED').toUpperCase();
    var objective = objLL(objectives);

    var scenario = { objectives: objectives, name: ctx.scenario_name || ctx.name || (ctx.scenario && ctx.scenario.name) };

    var capability_summary = catalog.summarizeCapabilities(units);
    var superiority = catalog.computeSuperiority(units);
    var terrain_summary = terrain.terrainSummary(units, objectives, ctx);

    // Inferred zones + zone state for the nearest intruder (the worst violation).
    var inferred = zones.inferZones(scenario, objectives);
    var intruder = nearestIntruder(units, defending, objective);
    var zone_state = zones.evaluateZone(intruder || {}, intruder ? unitLL(intruder) : null, inferred);

    // Contact picture (objective passed through context for nearest-threat ranking).
    var contactCtx = Object.assign({}, ctx, { defending_side: defending, objective: objective });
    var contact_picture = contacts.buildContactPicture(units, contactCtx);

    // ROE escalation from the zone state + contacts.
    var escalation = roe.escalate(zone_state, contact_picture, { defending_side: defending });

    // COA family selection (vary across turns via previous_coa_families).
    var previousTurns = arr(ctx.previous_coa_families);
    var coaSituation = {
        threat_domain: zone_state.zone_type,
        violation: zone_state.violation,
        zone_state: zone_state,
        roe_state: escalation.roe_state,
        terrain_summary: terrain_summary,
    };
    var coaPick = coa.selectCoaFamily(coaSituation, previousTurns, capability_summary,
        { terrain_summary: terrain_summary }, escalation.roe_state);

    // Best defender assets for the threat-implied role.
    var role = roleForThreat(zone_state);
    var best_blue_assets = catalog.bestAssetsForSide(units, defending, role);

    // Human-readable warnings (zone + ROE).
    var warnings = [];
    if (zone_state.violation) warnings.push(zone_state.warning_text);
    if (escalation.commander_warning) warnings.push(escalation.commander_warning);
    if (contact_picture.detected_contacts.length) warnings.push(defending + ' has ' + contact_picture.detected_contacts.length + ' detected contact(s).');
    if (!warnings.length) warnings.push('No active zone violation or ROE escalation — review-only watch posture.');

    var confidence = 'medium';
    if (!objective) confidence = 'low';

    return {
        capability_summary: capability_summary,
        superiority: { air: superiority.air, naval: superiority.naval, ground: superiority.ground, sensor: superiority.sensor },
        terrain_summary: terrain_summary,
        zone_state: zone_state,
        contact_picture: contact_picture,
        roe_state: escalation.roe_state,
        alert_state: escalation.alert_state,
        roe_decision: escalation,
        recommended_coa_families: coaPick.candidate_families,
        recommended_coa_family: coaPick.recommended_family,
        coa_reason: coaPick.reason,
        best_blue_assets: best_blue_assets,
        best_asset_role: role,
        defending_side: defending,
        active_side: activeSide,
        warnings: warnings,
        confidence: confidence,
        demo_only: true, review_only: true,
    };
}

module.exports = {
    buildScenarioIntel: buildScenarioIntel,
};
