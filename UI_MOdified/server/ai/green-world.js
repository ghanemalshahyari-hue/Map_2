'use strict';
/* ============================================================================
 * green-world.js — RMOOZ-BLUE-RED-GREEN-WHITE-A  (GREEN = neutral world)
 * ----------------------------------------------------------------------------
 * The "Green" lane of the classic war-game colour model: a NEUTRAL-WORLD
 * reaction layer — civilians, infrastructure, road/movement constraints,
 * collateral-risk bands and a host-nation/political friction score.
 *
 * DESIGN (owner ruling, [[project_offline_agent_architecture]]):
 *   - GREEN is deterministic-FIRST. This module is **pure + sync, NO LLM,
 *     NO mutation** — exactly like tactical-terrain-context.js / the validator.
 *   - It is an ADVISORY realism layer. It NEVER moves units, NEVER gates
 *     execution, and is NOT called on the hot path / normal ticks.
 *   - Optional short natural-language summarisation is a SEPARATE, gated,
 *     small-model role — see green-summarizer.js. This file stays no-LLM.
 *   - HONEST provenance: every factor is labelled (inferred from terrain
 *     class / geometry, or absent) because RMOOZ has no census / road /
 *     infrastructure layer. We never dress an inference up as ground truth.
 *
 * Inputs (all optional — degrades gracefully):
 *   opts.units      [{ id, side, lat|coord }]            both sides' positions
 *   opts.objective  { lat|coord, name? }                 the contested point
 *   opts.terrain    tactical-terrain-context output      { terrain_class, route_cost,
 *                     choke, sovereign_zone, owner_country, threat_rings, ... }
 *   opts.coa        a committed COA (for note context — not required)
 *
 * Output: a structured assessment (see assessNeutralWorld). Stable shape;
 * deterministic for a given input.
 * ========================================================================== */

function num(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }
function getLL(o) {
    if (!o) return null;
    if (num(o.lat) != null && num(o.lon) != null) return { lat: o.lat, lon: o.lon };
    if (Array.isArray(o.coord) && o.coord.length >= 2 && num(+o.coord[0]) != null && num(+o.coord[1]) != null) {
        return { lat: +o.coord[1], lon: +o.coord[0] };
    }
    return null;
}
// Great-circle distance in km (null if either point is missing).
function distKm(a, b) {
    if (!a || !b) return null;
    var R = 6371, toR = Math.PI / 180;
    var dLat = (b.lat - a.lat) * toR, dLon = (b.lon - a.lon) * toR;
    var la1 = a.lat * toR, la2 = b.lat * toR;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
// Population density band inferred from the terrain class (no census layer).
function populationBandFromTerrain(terrainClass) {
    var t = String(terrainClass || '').toLowerCase();
    if (/urban|built|city|town|industrial/.test(t)) return { band: 'high',   weight: 75 };
    if (/coast|port|river|forest|veget|farm|agric/.test(t)) return { band: 'medium', weight: 45 };
    return { band: 'low', weight: 15 };   // desert / mountain / open / unknown / absent
}
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
function bandFromScore(s) { return s >= 67 ? 'high' : (s >= 34 ? 'medium' : 'low'); }

/**
 * assessNeutralWorld(opts) → deterministic neutral-world assessment.
 * Pure + sync. No LLM. No mutation.
 */
function assessNeutralWorld(opts) {
    opts = opts || {};
    var terrain = opts.terrain || {};
    var obj = getLL(opts.objective) || getLL(terrain.objective);
    var units = Array.isArray(opts.units) ? opts.units : [];

    // ── population (inferred from terrain class) ──
    var pop = populationBandFromTerrain(terrain.terrain_class);
    var populationProvenance = terrain.terrain_class ? 'inferred_terrain_class' : 'absent';

    // ── force concentration near the objective (geometric) ──
    var NEAR_KM = 8;
    var nearObjective = 0, placed = 0;
    if (obj) {
        units.forEach(function (u) {
            var ll = getLL(u); if (!ll) return; placed++;
            var d = distKm(ll, obj);
            if (d != null && d <= NEAR_KM) nearObjective++;
        });
    }
    var concentrationPct = placed > 0 ? Math.round((nearObjective / placed) * 100) : 0;
    var concentrationProvenance = (obj && placed > 0) ? 'inferred_geometric' : 'absent';

    // ── collateral risk (population weight + force concentration near it) ──
    var collateralScore = clamp(Math.round(pop.weight * 0.7 + concentrationPct * 0.3), 0, 100);
    var drivers = [];
    if (pop.band !== 'low') drivers.push(pop.band + ' population density (terrain: ' + (terrain.terrain_class || 'unknown') + ')');
    if (nearObjective > 0) drivers.push(nearObjective + ' unit(s) within ' + NEAR_KM + 'km of the objective');
    if (!drivers.length) drivers.push('low population + dispersed forces');

    // ── road / movement constraint (real route data only; honest "unknown" otherwise) ──
    // We have no road network, so "open" is asserted ONLY when a real route_cost is supplied; a
    // terrain class alone is NOT enough to claim roads are open.
    var roadStatus, roadBasis;
    var routeCost = num(terrain.route_cost);
    if ((routeCost != null && routeCost > 0.3) || terrain.choke) {
        roadStatus = 'constrained';
        roadBasis = terrain.choke ? 'choke point on the approach axis' : 'high terrain route cost';
    } else if (routeCost != null) {
        roadStatus = 'open'; roadBasis = 'low terrain route cost';
    } else {
        roadStatus = 'unknown'; roadBasis = 'no route data (no road network layer)';
    }

    // ── infrastructure (no infrastructure layer → honest inference only) ──
    var infraNote = pop.band === 'high'
        ? 'urban infrastructure likely in the engagement area'
        : (pop.band === 'medium' ? 'some fixed infrastructure possible' : 'no significant fixed infrastructure inferred');

    // ── host-nation / political friction (neutral reaction score 0..100) ──
    var hostNation = terrain.owner_country || (terrain.sovereign_zone && terrain.sovereign_zone.owner_country) || null;
    var sovereignBump = hostNation && hostNation !== 'unknown' ? 12 : 0;
    var neutralReactionScore = clamp(Math.round(collateralScore * 0.7 + concentrationPct * 0.15 + sovereignBump), 0, 100);

    var notes = [];
    notes.push('Collateral risk ' + bandFromScore(collateralScore) + ' (' + collateralScore + '/100) — ' + drivers[0] + '.');
    notes.push('Movement: roads ' + roadStatus + ' (' + roadBasis + ').');
    if (hostNation && hostNation !== 'unknown') notes.push('Host nation: ' + hostNation + ' — political friction factored.');
    notes.push('Neutral reaction ' + bandFromScore(neutralReactionScore) + ' (' + neutralReactionScore + '/100).');

    return {
        population_band: pop.band,
        collateral_risk: { band: bandFromScore(collateralScore), score: collateralScore, drivers: drivers },
        road_status: { status: roadStatus, basis: roadBasis },
        infra_status: { note: infraNote, provenance: terrain.terrain_class ? 'inferred_terrain_class' : 'absent' },
        host_nation: hostNation || null,
        neutral_reaction_score: neutralReactionScore,
        units_near_objective: nearObjective,
        force_concentration_pct: concentrationPct,
        notes: notes,
        provenance: {
            engine: 'deterministic',
            population: populationProvenance,
            collateral: concentrationProvenance === 'absent' && populationProvenance === 'absent' ? 'absent' : 'inferred',
            roads: roadStatus === 'unknown' ? 'absent' : 'inferred_terrain_class',
            reaction: 'inferred',
        },
        // honest framing for any consumer/UI (mirrors tactical-terrain-context)
        review_only: true,
        deterministic: true,
        llm_used: false,
    };
}

module.exports = {
    assessNeutralWorld: assessNeutralWorld,
    populationBandFromTerrain: populationBandFromTerrain,
};
