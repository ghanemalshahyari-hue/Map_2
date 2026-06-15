'use strict';
/* ============================================================================
 * coalition-posture-engine.js — shared AI-intelligence module
 * ----------------------------------------------------------------------------
 * GENERIC coalition logic. A country maps to whatever coalition it belongs to
 * (GCC, NATO, …) via a DATA table, and each coalition shares one posture
 * ruleset. Adding a coalition is DATA (a new COALITION_TABLE key), never code.
 *
 * REVIEW-ONLY / INFERRED. Every output is a deterministic fallback inference
 * meant to be REFINED by an LLM or doctrine source with real NATO/GCC/coalition
 * doctrine. It is NOT authoritative tasking. No classified data of any kind is
 * encoded here — coalition membership, lead nations and postures are public /
 * demo abstractions only.
 *
 * Posture ladder NEVER produces engage/destroy/kill instructions. The hardest
 * posture is "engagement-ready (defensive)" and any escalation beyond posture
 * always requires ROE / national / coalition approval.
 *
 * Scenario-generic: no hardcoded scenario/draft names, no hardcoded unit IDs.
 * Pure module — no DOM, no network, requireable in isolation (CommonJS).
 *
 * Exports:
 *   COALITION_TABLE                                  → data-driven coalition map
 *   detectCoalition(country)                         → coalition match for a country
 *   coalitionForSide(units, side, scenarioName)      → infer coalition for a side
 *   coalitionPosture(coalition, alertState, leadNation) → posture ruleset result
 * ========================================================================== */

// --------------------------------------------------------------------------
// COALITION_TABLE — pure data. Membership is matched by case-insensitive
// substring/alias on the country string. To add a coalition, add a key here
// (members[], lead_default, doctrine_note) — NO code change required.
// --------------------------------------------------------------------------
var COALITION_TABLE = {
    GCC: {
        members: [
            'uae', 'united arab emirates', 'emirates', 'abu dhabi', 'dubai',
            'saudi', 'ksa', 'saudi arabia', 'qatar', 'kuwait', 'bahrain', 'oman',
        ],
        lead_default: 'UAE',
        doctrine_note: 'Gulf Cooperation Council collective defense (inferred).',
    },
    NATO: {
        members: [
            'usa', 'us', 'united states', 'america', 'uk', 'united kingdom',
            'britain', 'england', 'france', 'germany', 'italy', 'spain',
            'turkey', 'turkiye', 'türkiye', 'netherlands', 'belgium', 'canada',
            'poland', 'norway', 'greece', 'portugal', 'denmark', 'romania',
            'czech', 'hungary',
        ],
        lead_default: 'NATO command',
        doctrine_note: 'NATO Article-5 collective defense (inferred).',
    },
};

var REVIEW_NOTE = 'Review-only inferred coalition posture — deterministic fallback. ' +
    'An LLM or doctrine source with real NATO/GCC/coalition doctrine can refine this. ' +
    'Not authoritative tasking; no classified data.';

// Alert ladder ordering (WATCH < WARNING < ALERT < ENGAGEMENT_READY).
var ALERT_ORDER = ['WATCH', 'WARNING', 'ALERT', 'ENGAGEMENT_READY'];

function arr(v) { return Array.isArray(v) ? v : []; }
function lc(v) { return String(v == null ? '' : v).toLowerCase().trim(); }

// Longest-alias-first match so e.g. 'saudi arabia' is preferred over 'saudi'
// when both would hit (irrelevant to the coalition result, but stable).
function matchAlias(countryLc, members) {
    var best = null, bestLen = -1;
    for (var i = 0; i < members.length; i++) {
        var alias = members[i];
        if (alias && countryLc.indexOf(alias) !== -1 && alias.length > bestLen) {
            best = alias; bestLen = alias.length;
        }
    }
    return best;
}

/**
 * detectCoalition(country) → coalition match for a single country string.
 * Unknown / empty → coalition 'none', confidence 'low'.
 */
function detectCoalition(country) {
    var c = lc(country);
    if (c) {
        var keys = Object.keys(COALITION_TABLE);
        for (var i = 0; i < keys.length; i++) {
            var name = keys[i];
            var entry = COALITION_TABLE[name];
            // Match a member alias OR the coalition key name itself (e.g. "NATO",
            // "GCC") so a string that names the coalition directly resolves too.
            // Both are pure data — the key is the coalition name.
            var hit = matchAlias(c, arr(entry && entry.members).concat([lc(name)]));
            if (hit) {
                // Exact alias match → high confidence; substring-only → medium.
                var confidence = (c === hit) ? 'high' : 'medium';
                return {
                    coalition: name,
                    confidence: confidence,
                    members: arr(entry.members).slice(),
                    lead_default: entry.lead_default || null,
                    source: 'inferred_review_only',
                    note: 'Country "' + String(country) + '" inferred as ' + name + ' (matched alias "' + hit + '"). ' + REVIEW_NOTE,
                };
            }
        }
    }
    return {
        coalition: 'none',
        confidence: 'low',
        members: [],
        lead_default: null,
        source: 'inferred_review_only',
        note: 'No recognized coalition inferred for country "' + String(country == null ? '' : country) + '". ' + REVIEW_NOTE,
    };
}

/**
 * coalitionForSide(units, side, scenarioName) → coalition string.
 * Infers the coalition for a side from the units' country fields first, then
 * (as a fallback) from the scenario name. Returns 'none' when nothing matches.
 */
function coalitionForSide(units, side, scenarioName) {
    var want = String(side || 'BLUE').toUpperCase();
    var votes = {};
    arr(units).forEach(function (u) {
        if (!u) return;
        if (String(u.side || '').toUpperCase() !== want) return;
        var det = detectCoalition(u.country);
        if (det.coalition !== 'none') votes[det.coalition] = (votes[det.coalition] || 0) + 1;
    });
    // Pick the coalition with the most member votes among this side's units.
    var bestName = 'none', bestVotes = 0;
    Object.keys(votes).forEach(function (k) {
        if (votes[k] > bestVotes) { bestVotes = votes[k]; bestName = k; }
    });
    if (bestName !== 'none') return bestName;

    // Fallback: scan the scenario name for any coalition alias.
    var fromName = detectCoalition(scenarioName);
    if (fromName.coalition !== 'none') return fromName.coalition;

    return 'none';
}

// Posture rung definitions per alert level (generic across coalitions). Support
// actions accumulate as the alert rises (each rung ⊇ the rung below it).
function postureLadder() {
    var watch = {
        posture: 'routine',
        partner_readiness: 'normal',
        support_actions: ['shared early-warning awareness'],
    };
    var warning = {
        posture: 'heightened',
        partner_readiness: 'raised',
        support_actions: watch.support_actions.concat(['maritime/air surveillance support considered']),
    };
    var alert = {
        posture: 'alert',
        partner_readiness: 'high',
        support_actions: warning.support_actions.concat(['partner intercept/screen support on request']),
    };
    var engagementReady = {
        posture: 'engagement-ready (defensive)',
        partner_readiness: 'maximum-defensive',
        support_actions: alert.support_actions.concat(['reinforcement reserve readied — engagement only on approved hostile criteria']),
    };
    return { WATCH: watch, WARNING: warning, ALERT: alert, ENGAGEMENT_READY: engagementReady };
}

function normalizeAlert(alertState) {
    var a = String(alertState == null ? '' : alertState).toUpperCase().trim().replace(/[\s-]+/g, '_');
    return ALERT_ORDER.indexOf(a) !== -1 ? a : 'WATCH';
}

var ESCALATION_RULE = 'escalation beyond posture requires ROE / national / coalition approval';

/**
 * coalitionPosture(coalition, alertState, leadNation) → posture ruleset result.
 * Generic for any coalition. 'none' → national-defense-only posture.
 */
function coalitionPosture(coalition, alertState, leadNation) {
    var coName = String(coalition == null ? 'none' : coalition);
    var entry = COALITION_TABLE[coName] || null;
    var alert = normalizeAlert(alertState);

    // No recognized coalition → national defense only (still review-only).
    if (!entry) {
        return {
            coalition: 'none',
            lead_nation: leadNation || null,
            alert_state: alert,
            posture: 'national defense only',
            partner_readiness: 'n/a',
            support_actions: ['national assets only — no recognized coalition inferred'],
            escalation_rule: ESCALATION_RULE,
            event_log_entries: [
                'COALITION: none — no recognized coalition inferred; national defense posture only (' + alert + ').',
            ],
            note: 'No recognized coalition was inferred for "' + coName + '" — national defense posture only. ' + REVIEW_NOTE,
        };
    }

    var lead = leadNation || entry.lead_default || coName + ' lead';
    var rung = postureLadder()[alert];

    // Event-log line: lead nation responds first; partners raise readiness as alert rises.
    var logLine = 'COALITION: ' + coName + ' posture — ' + lead + ' responds first; partners ' +
        (alert === 'WATCH'
            ? 'maintain normal readiness and shared early warning'
            : 'raise readiness (' + rung.partner_readiness + ')') +
        '.';

    return {
        coalition: coName,
        lead_nation: lead,
        alert_state: alert,
        posture: rung.posture,
        partner_readiness: rung.partner_readiness,
        support_actions: rung.support_actions.slice(),
        escalation_rule: ESCALATION_RULE,
        event_log_entries: [logLine],
        doctrine_note: entry.doctrine_note || null,
        note: entry.doctrine_note + ' ' + REVIEW_NOTE,
    };
}

module.exports = {
    COALITION_TABLE: COALITION_TABLE,
    detectCoalition: detectCoalition,
    coalitionForSide: coalitionForSide,
    coalitionPosture: coalitionPosture,
};
