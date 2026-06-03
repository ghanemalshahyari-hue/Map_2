/* ============================================================================
 * action-feasibility.js — L3-A "Why-Not" action feasibility evaluator
 * ----------------------------------------------------------------------------
 * Ladder L3 ("Why can't I do this?"). Takes a PROPOSED action and returns
 * "feasible / blocked / risky + why" by CONSOLIDATING reasons that already
 * exist in the World State. It performs NO simulation, NO prediction, NO new
 * math, NO scoring — it is a read/consolidation layer, same spirit as OBJ-C.
 * Contract: L3-A-SPECIFICATION.md.
 *
 * THIS SLICE = L3-A-1: action.type === 'ENGAGE' only. ENGAGE blockers map 1:1
 * to ENG1's own reasons (out_of_range / weapons_hold / winchester /
 * no_fire_control_channel), plus `undetected` when ENG1 emits no record because
 * the detection gate dropped the target. SUCCESS CONDITION: ENGAGE findings must
 * never diverge from the engagement engine's own reasons.
 *
 * OUT OF SCOPE (locked): no UI (L3-B), no ATTACK_OBJECTIVE (L3-A-2), no feasible
 * alternatives / `inverse` (L3.5), no projection (L5), no Team/Operator, no
 * mutation, no new thresholds. SAFETY: pure — never mutates ws/scenario/DOM.
 * ========================================================================== */
(function (root) {
    'use strict';

    var AF_VERSION = '1.0.0-l3a-1';

    function arr(v) { return Array.isArray(v) ? v : []; }

    // Factual explanations — no recommendation verbs (that wording is L3.5/AI, not here).
    var EXPLAIN = {
        // ENG1 reasons (verbatim from engagement.js — source: 'engagement')
        out_of_range:            'Target range exceeds the weapon’s effective range.',
        weapons_hold:            'Weapons are at HOLD (WRA / ROE).',
        winchester:              'Magazine is empty (no rounds remaining).',
        no_fire_control_channel: 'No fire-control channel is available.',
        // no-record classifications (the engine produced nothing for this pair)
        undetected:              'Target is not currently held by this side’s sensors.',          // source: 'detection'
        no_engagement_solution:  'No weapon can produce a firing solution against this target ' +
                                 '(shooter unarmed, or target outside every weapon’s domain).',   // source: 'engagement'
        // fallback
        unknown_unit:            'Actor or target unit was not found in the current world state.'       // source: 'world_state'
    };

    function finding(code, source) {
        return { code: code, explanation: EXPLAIN[code] || code, source: source };
    }

    // Resolve ENG1 in browser (window.AppEngagement) or Node (require).
    function getEngagement() {
        if (root.AppEngagement && typeof root.AppEngagement.computeEngagements === 'function') return root.AppEngagement;
        if (typeof require === 'function') { try { return require('./engagement.js'); } catch (_e) { return null; } }
        return null;
    }

    /* ---- L3-A-1: ENGAGE -------------------------------------------------- */
    function evaluateEngage(ws, action) {
        var out = {
            action: { type: 'ENGAGE', actor_uid: action.actor_uid || null, target_uid: action.target_uid || null },
            verdict: 'feasible', blockers: [], risks: [], evidence_gaps: []
        };

        // Resolve actor + target from the snapshot (fallback per spec §7).
        var units = arr(ws.units), actor = null, target = null;
        for (var i = 0; i < units.length; i++) {
            var u = units[i]; if (!u) continue;
            if (u.uid === action.actor_uid)  actor  = u;
            if (u.uid === action.target_uid) target = u;
        }
        if (!actor || !target) {
            out.blockers.push(finding('unknown_unit', 'world_state'));
            out.verdict = 'blocked';
            return out;
        }

        // Reuse the engine. It is the single source of truth for engage reasons.
        var eng = getEngagement();
        var records = eng ? (eng.computeEngagements(ws, arr(ws.derived && ws.derived.contacts)) || []) : [];
        var pair = records.filter(function (r) {
            return r && r.shooter === action.actor_uid && r.target === action.target_uid;
        });

        // At least one weapon has a firing solution → the action is feasible. No blockers.
        var anyEngaged = pair.some(function (r) { return r.status === 'engaged'; });
        if (anyEngaged) { out.verdict = 'feasible'; return out; }

        if (pair.length) {
            // All blocked → surface the engine's distinct reasons, 1:1 (deduped).
            var seen = {};
            pair.forEach(function (r) {
                if (r.reason && !seen[r.reason]) { seen[r.reason] = true; out.blockers.push(finding(r.reason, 'engagement')); }
            });
            if (!out.blockers.length) out.blockers.push(finding('no_engagement_solution', 'engagement'));
        } else {
            // No record for the pair: detection gate, or no weapon/domain solution.
            var contacts = arr(ws.derived && ws.derived.contacts);
            var detected = contacts.some(function (c) {
                return c && c.detected_by_side === actor.side && c.target_uid === action.target_uid;
            });
            out.blockers.push(detected ? finding('no_engagement_solution', 'engagement')
                                       : finding('undetected', 'detection'));
        }

        // Verdict rule (spec §5): blocked iff blockers; else risky iff risks; else feasible.
        out.verdict = out.blockers.length ? 'blocked' : (out.risks.length ? 'feasible_with_risk' : 'feasible');
        return out;
    }

    /* ---- public: evaluateAction ----------------------------------------- */
    function evaluateAction(ws, action) {
        if (!ws || ws.degraded) return null;            // parity gate, same as the evidence ledger
        action = action || {};
        if (action.type === 'ENGAGE') return evaluateEngage(ws, action);
        return null;                                    // L3-A-1 supports ENGAGE only
    }

    var api = {
        AF_VERSION: AF_VERSION,
        evaluateAction: evaluateAction
    };
    root.AppActionFeasibility = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
