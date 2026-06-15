'use strict';
/* ============================================================================
 * coa-variation-engine.js — shared AI-intelligence module
 * ----------------------------------------------------------------------------
 * Picks a COA "family" that fits the situation while avoiding repeating the
 * last family or two — so successive turns produce varied courses of action.
 *
 * DEMO / REVIEW-ONLY HEURISTIC. Deterministic — no Math.random; variation comes
 * from the previousTurns history (length + content). No classified data.
 *
 * Scenario-generic: no hardcoded scenario/draft names, no hardcoded unit IDs.
 * Pure module — no DOM, no network, requireable in isolation (CommonJS).
 *
 * Exports:
 *   selectCoaFamily(situation, previousTurns, capabilitySummary, terrainEffects, roeState)
 *     → { candidate_families, avoid_repeating, recommended_family, reason }
 * ========================================================================== */

var FAMILIES = ['air_intercept', 'naval_screen', 'ground_blocking', 'recon_probe', 'hold_and_defend', 'flank', 'feint', 'disperse', 'reinforce', 'strike_package'];

function arr(v) { return Array.isArray(v) ? v : []; }
function lc(v) { return String(v == null ? '' : v).toLowerCase(); }

// Build a ranked preference list of families for the situation (best first).
function rankFamilies(situation, capabilitySummary, terrainEffects, roeState) {
    var s = situation || {};
    var threatDomain = lc(s.threat_domain || s.dominant_threat_domain || (s.zone_state && s.zone_state.zone_type) || '');
    var roe = String(roeState || s.roe_state || 'HOLD').toUpperCase();
    var terrain = lc((terrainEffects && (terrainEffects.terrain_summary || terrainEffects.terrain_notes)) || s.terrain_summary || '');
    var hasViolation = !!(s.violation || (s.zone_state && s.zone_state.violation));

    var ranked = [];
    function add(f) { if (FAMILIES.indexOf(f) !== -1 && ranked.indexOf(f) === -1) ranked.push(f); }

    var airThreat = /air|airspace|intercept/.test(threatDomain);
    var navalThreat = /naval|water|sea|maritime|territorial_waters/.test(threatDomain) || /sea|coast|littoral/.test(terrain);
    var groundThreat = /ground|land|buffer|armor|infantry/.test(threatDomain);

    if (airThreat) { add('air_intercept'); add('strike_package'); }
    if (navalThreat) { add('naval_screen'); add('strike_package'); }
    if (groundThreat) { add('ground_blocking'); add('flank'); }

    // Escalation-driven preferences.
    if (roe === 'INTERCEPT' || roe === 'ENGAGE_IF_HOSTILE') { add('air_intercept'); add('ground_blocking'); }
    if (roe === 'WARN') { add('reinforce'); add('recon_probe'); }

    // No / low threat → posture toward recon and holding.
    if (!hasViolation && !airThreat && !navalThreat && !groundThreat) { add('recon_probe'); add('hold_and_defend'); }

    // Always provide a reasonable spread of fallbacks for variation.
    add('reinforce'); add('feint'); add('flank'); add('disperse'); add('hold_and_defend'); add('recon_probe');
    FAMILIES.forEach(add); // ensure full coverage at the tail
    return ranked;
}

/**
 * selectCoaFamily(...) → recommended family + candidates, avoiding repeats.
 * Deterministic: when the natural top choice was just used, deterministically
 * rotate to the next best family so COAs vary across turns.
 */
function selectCoaFamily(situation, previousTurns, capabilitySummary, terrainEffects, roeState) {
    var prev = arr(previousTurns).map(function (p) { return lc(p); });
    var avoid_repeating = prev.slice(Math.max(0, prev.length - 2)); // last 1-2 families

    var ranked = rankFamilies(situation, capabilitySummary, terrainEffects, roeState);

    // First candidate not in avoid_repeating; deterministic fallback by history length.
    var recommended = null, reasonExtra = '';
    for (var i = 0; i < ranked.length; i++) {
        if (avoid_repeating.indexOf(ranked[i]) === -1) { recommended = ranked[i]; break; }
    }
    if (!recommended) {
        // All ranked recently used (unlikely) — rotate by previousTurns length.
        recommended = ranked[prev.length % ranked.length] || FAMILIES[0];
        reasonExtra = ' (all preferred families recently used; rotated deterministically by turn count)';
    } else if (ranked[0] && avoid_repeating.indexOf(ranked[0]) !== -1 && recommended !== ranked[0]) {
        reasonExtra = ' (natural choice "' + ranked[0] + '" was just used; rotated to next-best for variation)';
    }

    var natural = ranked[0];
    var reason = 'Selected "' + recommended + '" as best fit for the situation' +
        (natural && natural !== recommended ? ' (top-fit was "' + natural + '")' : '') +
        reasonExtra + '. Avoiding recently used: [' + avoid_repeating.join(', ') + '].';

    return {
        candidate_families: ranked.slice(0, Math.min(5, ranked.length)),
        avoid_repeating: avoid_repeating,
        recommended_family: recommended,
        reason: reason,
        demo_only: true, review_only: true,
    };
}

module.exports = {
    selectCoaFamily: selectCoaFamily,
    FAMILIES: FAMILIES,
};
