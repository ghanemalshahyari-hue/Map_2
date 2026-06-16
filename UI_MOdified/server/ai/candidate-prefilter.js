'use strict';
/* ============================================================================
 * candidate-prefilter.js — RMOOZ-AI-FREE-FIGHT-CANDIDATE-PREFILTER-A
 * ----------------------------------------------------------------------------
 * Reduce the LLM problem size BEFORE the MCP prompt. A real commander does not
 * inspect/move all units across all countries for one objective; neither should
 * the AI. From the full active-side force this picks the 10–25 MOST RELEVANT
 * units for THIS objective and produces a grouped summary of why the rest were
 * excluded. The planner then sends ONLY the candidates to the model and sets
 * allowed_unit_ids = candidates, so a small model gets a small, clean problem
 * and the validator rejects any non-candidate the model invents.
 *
 * Pure / deterministic (no Date/RNG/IO/LLM). REAL data only: distance, objective
 * country/zone, role/capability (from the capability catalog), and a per-domain
 * reachability heuristic are always scored; readiness / supply / already-tasked
 * are scored ONLY when present on the unit — never invented (the demo/ORBAT units
 * don't carry them, so they stay neutral, consistent with the never-invent rule).
 *
 * selectCandidates(allUnits, obj, ctx) → {
 *   applied, total, sent, excluded, target,
 *   candidate_ids: [...], candidate_units: [{unit_uid, distance_deg, domain,
 *     capability_fit, country_match, reachable, selection_reason}],
 *   non_candidate_summary: [{reason, label, count, sample:[ids]}],
 *   objective_country }
 * ctx: { capByUid, objCountry, threatRef, tasked_set, maxCandidates, send_all_units }
 * ========================================================================== */

var MIN_CANDIDATES = 10, MAX_CANDIDATES = 25, DEFAULT_TARGET = 20;

// Interim per-domain reachability radius (degrees) — a RELEVANCE heuristic, NOT a real
// weapon/fuel range (flagged interim, like the GIS slope thresholds; pending a real range model).
var REACH_DEG = { air: 6.0, air_defense: 2.2, naval: 3.5, radar: 2.2, ground: 1.3, base: 0.6, logistics: 0.8, unknown: 2.5 };

function num(v) { var n = Number(v); return Number.isFinite(n) ? n : null; }
function unitId(u) { return (u && (u.unit_uid || u.uid || u.id)) || null; }
function reachFor(domain) { var r = REACH_DEG[String(domain || 'unknown').toLowerCase()]; return r == null ? REACH_DEG.unknown : r; }
// Planar degree distance with a longitude cosine correction (good enough for relevance ranking).
function degDist(a, b) {
    if (!a || !b) return Infinity;
    var la = num(a.lat), lo = num(a.lon), lb = num(b.lat), ob = num(b.lon);
    if (la == null || lo == null || lb == null || ob == null) return Infinity;
    var dLat = la - lb, dLon = (lo - ob) * Math.cos((la + lb) / 2 * Math.PI / 180);
    return Math.sqrt(dLat * dLat + dLon * dLon);
}
function bestCapScore(p) {
    var sc = (p && p.capability_scores) || {};
    var keys = ['air_superiority', 'intercept', 'naval_strike', 'naval_screen', 'ground_attack', 'ground_hold', 'air_defense', 'sensor'];
    var m = 0; keys.forEach(function (k) { var v = Number(sc[k]); if (Number.isFinite(v) && v > m) m = v; });
    return m;
}
function lowReadiness(u) { return typeof u.readiness === 'string' && /low|degraded|down|red|unready|not[_ ]?ready/i.test(u.readiness); }
function lowSupply(u) { var s = num(u.supply); return s != null && s < 0.3; }
function isTasked(u, taskedSet) { var id = unitId(u); return !!(u.already_tasked || u.tasked || (taskedSet && id && taskedSet[id])); }

var REASON_LABEL = {
    out_of_reach: 'too far for its type to reach the objective',
    already_tasked: 'already tasked',
    low_readiness: 'low readiness',
    low_supply: 'low supply',
    far_from_objective: 'farther from the objective',
    different_country_zone: 'different country/zone from the objective',
    low_capability_fit: 'lower capability fit for this mission',
    lower_relevance_rank: 'lower overall relevance',
};

function selectCandidates(allUnits, obj, ctx) {
    ctx = ctx || {};
    var capByUid = ctx.capByUid || {};
    var objCountry = ctx.objCountry ? String(ctx.objCountry).toLowerCase() : null;
    var taskedSet = ctx.tasked_set || null;
    var threatRef = ctx.threatRef || null;
    var target = Math.max(MIN_CANDIDATES, Math.min(MAX_CANDIDATES, parseInt(ctx.maxCandidates, 10) || DEFAULT_TARGET));

    var units = (allUnits || []).filter(function (u) { return u && unitId(u) && num(u.lat) != null && num(u.lon) != null; });
    var total = units.length;

    var scored = units.map(function (u, i) {
        var id = unitId(u);
        var p = capByUid[id] || capByUid[u.id] || capByUid[u.uid] || {};
        var domain = p.domain || 'unknown';
        var d = degDist(u, obj);
        var reach = reachFor(domain);
        var reachable = d <= reach;
        var capFit = bestCapScore(p);
        var countryMatch = !!(objCountry && u.country && String(u.country).toLowerCase() === objCountry);
        var tasked = isTasked(u, taskedSet);
        var lowR = lowReadiness(u), lowS = lowSupply(u);

        var score = 0;
        score += Math.max(0, 100 - d * 18);          // proximity to objective (≈5.5° → 0)
        score += reachable ? 25 : -60;               // range/reachability (per-domain heuristic)
        score += capFit * 0.5;                        // role/capability fit (0–50)
        if (countryMatch) score += 25;               // objective country/zone
        if (threatRef && degDist(u, threatRef) < reach * 0.5) score += 10; // threat proximity (minor)
        if (tasked) score -= 40;                      // already-tasked
        if (lowR) score -= 30;                        // readiness (only when present)
        if (lowS) score -= 20;                        // supply (only when present)

        return { id: id, unit: u, score: score, d: d, reach: reach, reachable: reachable,
                 capFit: capFit, domain: domain, countryMatch: countryMatch, tasked: tasked, lowR: lowR, lowS: lowS, _i: i };
    });
    // Score desc, then nearer, then stable.
    scored.sort(function (a, b) { return (b.score - a.score) || (a.d - b.d) || (a._i - b._i); });

    var sendAll = !!ctx.send_all_units || total <= target;
    var candidates = sendAll ? scored : scored.slice(0, target);
    var excluded = sendAll ? [] : scored.slice(target);

    function exclusionReason(s) {
        if (!s.reachable) return 'out_of_reach';
        if (s.tasked) return 'already_tasked';
        if (s.lowR) return 'low_readiness';
        if (s.lowS) return 'low_supply';
        if (s.d > s.reach * 0.66) return 'far_from_objective';
        if (objCountry && !s.countryMatch) return 'different_country_zone';
        if (s.capFit < 30) return 'low_capability_fit';
        return 'lower_relevance_rank';
    }
    var byReason = {};
    excluded.forEach(function (s) {
        var r = exclusionReason(s);
        if (!byReason[r]) byReason[r] = { reason: r, label: REASON_LABEL[r] || r, count: 0, sample: [] };
        byReason[r].count++;
        if (byReason[r].sample.length < 5) byReason[r].sample.push(s.id);
    });
    var nonCandidateSummary = Object.keys(byReason).map(function (k) { return byReason[k]; })
        .sort(function (a, b) { return b.count - a.count; });

    function inclusionReason(s) {
        var bits = [];
        if (s.d != null && s.d < 0.5) bits.push('very close to objective');
        else if (s.reachable) bits.push('within reach');
        if (s.capFit >= 60) bits.push('high capability');
        else if (s.capFit >= 30) bits.push('capable');
        if (s.countryMatch) bits.push('objective country');
        return bits.join(', ') || 'relevant';
    }
    var candidateUnits = candidates.map(function (s) {
        return { unit_uid: s.id, distance_deg: Math.round(s.d * 1e3) / 1e3, domain: s.domain,
                 capability_fit: Math.round(s.capFit), country_match: s.countryMatch, reachable: s.reachable,
                 selection_reason: inclusionReason(s) };
    });

    return {
        applied: !sendAll,
        total: total,
        sent: candidates.length,
        excluded: excluded.length,
        target: target,
        candidate_ids: candidates.map(function (s) { return s.id; }),
        candidate_units: candidateUnits,
        non_candidate_summary: nonCandidateSummary,
        objective_country: ctx.objCountry || null,
    };
}

module.exports = { selectCandidates, REACH_DEG, MIN_CANDIDATES, MAX_CANDIDATES, DEFAULT_TARGET };
