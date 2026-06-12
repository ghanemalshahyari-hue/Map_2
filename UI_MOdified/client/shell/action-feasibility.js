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
        // --- ENGAGE (L3-A-1) -------------------------------------------------
        // ENG1 reasons (verbatim from engagement.js — source: 'engagement')
        out_of_range:            'Target range exceeds the weapon’s effective range.',
        weapons_hold:            'Weapons are at HOLD (WRA / ROE).',
        winchester:              'Magazine is empty (no rounds remaining).',
        no_fire_control_channel: 'No fire-control channel is available.',
        // no-record classifications (the engine produced nothing for this pair)
        undetected:              'Target is not currently held by this side’s sensors.',          // source: 'detection'
        no_engagement_solution:  'No weapon can produce a firing solution against this target ' +
                                 '(shooter unarmed, or target outside every weapon’s domain).',   // source: 'engagement'
        // --- ATTACK_OBJECTIVE (L3-A-2) — blockers ----------------------------
        unknown_objective:          'Objective was not found in the current world state.',          // world_state
        objective_already_captured: 'Objective is already CAPTURED — an attack is unnecessary.',    // objective_status_display
        objective_evidence_missing: 'No objective evidence ledger is available to assess this action.', // world_state
        objective_not_actionable:   'Objective has no position in the current state — it cannot be targeted.', // world_state
        readiness_unavailable:      'Unit is not ready to execute this action.',                   // ws.units[].readiness
        // --- ATTACK_OBJECTIVE (L3-A-2) — risks -------------------------------
        objective_contested:        'Objective control is contested (current evidence).',           // objective_status_display / bls_status
        objective_threatened:       'Objective is under threat and not yet ready for capture.',      // objective_status_display
        readiness_degraded:         'Unit readiness is limited - execution risk is increased.',      // ws.units[].readiness
        supply_limited:             'Supply is low (below 50%) - sustainability is at risk.',         // ws.units[].supply
        contact_unresolved:         'The contact picture is uncertain (non-firm or missing contacts).', // contacts
        engagement_pressure:        'Opposing forces currently have firing solutions against friendly units.', // engagement
        doctrine_caution:           'Doctrine indicates caution (weapons HOLD / hold posture).',      // ws.doctrine
        // --- fallback --------------------------------------------------------
        unknown_unit:            'Actor or target unit was not found in the current world state.'       // world_state
    };

    // Read a value from the OBJ-A evidence ledger by type (no recompute — consume it).
    function evVal(ws, type) {
        var ev = arr(ws.derived && ws.derived.objective_evidence);
        for (var i = 0; i < ev.length; i++) if (ev[i] && ev[i].evidence_type === type) return ev[i].value;
        return undefined;
    }

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

    /* ---- L3-A-2: ATTACK_OBJECTIVE ---------------------------------------
     * Consumes EXISTING state only — objective_status_display (OBJ-B), the
     * objective_evidence ledger (OBJ-A / READINESS-A / DOCTRINE-A), the unit
     * readiness/supply enums, and ENG1's engagement output. It does NOT simulate
     * the attack ("will I win?"), invent thresholds, or mutate. Conservative:
     * blockers fire only on clear existing state gaps; everything else is a risk. */
    function evaluateAttackObjective(ws, action) {
        var actorUid = action.actor_uid || action.actorUid || null;
        var objectiveId = action.objective_id || action.objectiveId || null;
        var out = {
            action: { type: 'ATTACK_OBJECTIVE', actor_uid: actorUid, objective_id: objectiveId },
            verdict: 'feasible', blockers: [], risks: [], evidence_gaps: []
        };
        function block(code, source) { out.blockers.push(finding(code, source)); }
        function risk(code, source)  { out.risks.push(finding(code, source)); }

        var units = arr(ws.units);
        // resolve actor (optional) — if a uid is given but not found, that's a clear gap
        var actor = null;
        if (actorUid) { for (var i = 0; i < units.length; i++) if (units[i] && units[i].uid === actorUid) { actor = units[i]; break; } }
        if (actorUid && !actor) block('unknown_unit', 'world_state');

        // resolve objective (default to first) — clear gap if none/unmatched
        var objectives = arr(ws.objectives);
        var objective = null;
        if (objectiveId) { for (var j = 0; j < objectives.length; j++) if (objectives[j] && (objectives[j].id === objectiveId)) { objective = objectives[j]; break; } }
        else objective = objectives[0] || null;
        if (!objective) block('unknown_objective', 'world_state');

        // no evidence ledger → we cannot assess (the "no consumption path" gap)
        var hasLedger = arr(ws.derived && ws.derived.objective_evidence).length > 0;
        if (!hasLedger) block('objective_evidence_missing', 'world_state');

        // If we can't even identify the objective or have no evidence, stop here.
        if (!objective || !hasLedger) {
            out.verdict = out.blockers.length ? 'blocked' : 'feasible';
            return out;
        }

        var status = (ws.derived && ws.derived.objective_status_display) || objective.status || null;

        /* ---- BLOCKERS (clear existing-state gaps only) ---- */
        if (status === 'CAPTURED') block('objective_already_captured', 'objective_status_display');
        if (!objective.position) block('objective_not_actionable', 'world_state');
        // readiness_unavailable: ONLY the existing 'not_ready' enum, and only for a named actor.
        if (actor && actor.readiness === 'not_ready') block('readiness_unavailable', 'ws.units[].readiness');

        /* ---- RISKS (current-state concerns; reuse existing categoricals) ---- */
        // objective state (from OBJ-B's status_display + OBJ-A control evidence)
        var blsContested = evVal(ws, 'bls_contested_count');
        if (status === 'CONTESTED' || status === 'DENIED' || (typeof blsContested === 'number' && blsContested > 0))
            risk('objective_contested', 'objective_status_display');
        if (status === 'THREATENED') risk('objective_threatened', 'objective_status_display');

        // readiness (actor enum if present, else READINESS-A force-level state)
        var readyState = actor ? actor.readiness : evVal(ws, 'combat_readiness_state');
        if (readyState === 'limited' || (!actor && readyState === 'not_ready'))
            risk('readiness_degraded', 'ws.units[].readiness');

        // supply: reuse READINESS-A's OWN neutral midpoint (0.5) — not a new threshold.
        var supply = (actor && typeof actor.supply === 'number') ? actor.supply : evVal(ws, 'supply_sustainability');
        if (typeof supply === 'number' && supply < 0.5) risk('supply_limited', 'ws.units[].supply');

        // contacts: uncertain if non-firm contacts exist, or no contact evidence at all
        var cc = evVal(ws, 'contact_confidence_summary');
        if (cc === undefined) risk('contact_unresolved', 'contacts');
        else if (((cc.probable || 0) + (cc.possible || 0)) > 0) risk('contact_unresolved', 'contacts');

        // engagement pressure: ENG1 says opposing forces currently have firing solutions
        var eng = getEngagement();
        if (eng) {
            var friendly = actor ? actor.side : 'BLUE';
            var recs = eng.computeEngagements(ws, arr(ws.derived && ws.derived.contacts)) || [];
            if (recs.some(function (r) { return r.status === 'engaged' && r.side !== friendly; }))
                risk('engagement_pressure', 'engagement');
        }

        // doctrine caution: authored WCS HOLD (air/surface) or hold posture (DOCTRINE-A)
        var wcs = evVal(ws, 'side_weapons_control_status');
        var posture = evVal(ws, 'unit_posture_state');
        if ((wcs && (wcs.air === 'HOLD' || wcs.surface === 'HOLD')) || posture === 'hold')
            risk('doctrine_caution', 'ws.doctrine');

        out.verdict = out.blockers.length ? 'blocked' : (out.risks.length ? 'feasible_with_risk' : 'feasible');
        return out;
    }

    /* ---- public: evaluateAction ----------------------------------------- */
    function evaluateAction(ws, action) {
        if (!ws || ws.degraded) return null;            // parity gate, same as the evidence ledger
        action = action || {};
        var type = String(action.type || '').toUpperCase();   // accept 'ENGAGE' / 'attack_objective' etc.
        if (type === 'ENGAGE')           return evaluateEngage(ws, action);
        if (type === 'ATTACK_OBJECTIVE') return evaluateAttackObjective(ws, action);
        return null;                                    // L3-A supports ENGAGE + ATTACK_OBJECTIVE
    }

    /* ---- L3.5-A: Feasible Alternatives generator -----------------------
     * Inverts the L3-A finding: each blocker/risk it surfaced maps to a known
     * feasible-alternative OPTION (constraint → known inverse), drawn entirely
     * from existing state. It does NOT simulate outcomes, rank/score, mutate, or
     * recommend — it lists read-only candidate options the operator could weigh.
     * ATTACK_OBJECTIVE only for this slice (ENGAGE alternatives later).
     *
     * Codes with no tactical inverse (data/structural gaps: unknown_unit,
     * unknown_objective, objective_evidence_missing, objective_not_actionable,
     * objective_already_captured) intentionally map to NOTHING → empty when those
     * are the only issues, and empty when the action is already feasible. */

    // code (blocker/risk) → alternative id
    var ALT_MAP = {
        readiness_unavailable: 'restore_readiness',
        readiness_degraded:    'restore_readiness',
        supply_limited:        'resupply',
        engagement_pressure:   'reduce_engagement_pressure',
        contact_unresolved:    'resolve_contacts',
        doctrine_caution:      'review_doctrine',
        objective_contested:   'improve_objective_state',
        objective_threatened:  'improve_objective_state'
    };

    // alternative definitions. requiredCapabilities reference EXISTING capability
    // layers (READINESS-A / DB1 weapons & sensors / WS3 mobility / DOCTRINE-A) —
    // not invented. `limits` state plainly that no outcome is simulated.
    // Declaration order = deterministic output order (NOT a ranking/score).
    var ALT_DEF = {
        restore_readiness: {
            label: 'Restore unit readiness',
            reason: 'Current readiness state limits the action.',
            requiredCapabilities: ['readiness'],
            limits: ['Read-only option. Time-to-ready and its effect are not simulated.']
        },
        resupply: {
            label: 'Resupply before committing',
            reason: 'Supply is below the readiness layer’s neutral level.',
            requiredCapabilities: ['supply'],
            limits: ['Read-only option. Resupply availability and timing are not simulated.']
        },
        reduce_engagement_pressure: {
            label: 'Reduce engagement pressure (engage or reposition)',
            reason: 'Opposing forces currently have firing solutions against friendly units.',
            requiredCapabilities: ['weapons', 'mobility'],
            limits: ['Read-only option. No engagement outcome is simulated.']
        },
        resolve_contacts: {
            label: 'Resolve the contact picture',
            reason: 'The contact picture is uncertain.',
            requiredCapabilities: ['sensors'],
            limits: ['Read-only option. Detection improvement is not simulated.']
        },
        review_doctrine: {
            label: 'Review ROE / weapons-control posture',
            reason: 'Doctrine indicates caution.',
            requiredCapabilities: ['doctrine_authority'],
            limits: ['Read-only option. Doctrine is authored; this does not change it.']
        },
        improve_objective_state: {
            label: 'Defer until the objective state improves',
            reason: 'The objective is contested or under threat.',
            requiredCapabilities: [],
            limits: ['Read-only option. Future objective state is not projected.']
        }
    };

    function generateFeasibleAlternatives(ws, action, finding) {
        var result = { alternatives: [] };
        if (!ws || ws.degraded) return result;
        action = action || {};
        if (String(action.type || '').toUpperCase() !== 'ATTACK_OBJECTIVE') return result;  // L3.5-A scope

        var f = finding || evaluateAction(ws, action);
        if (!f) return result;

        // Collect alternatives keyed by id; merge basedOn from every matching code.
        var byId = {};
        [].concat(f.blockers || [], f.risks || [], f.evidence_gaps || []).forEach(function (item) {
            var altId = item && ALT_MAP[item.code];
            if (!altId) return;                      // no tactical inverse for data/structural gaps
            if (!byId[altId]) {
                var d = ALT_DEF[altId];
                byId[altId] = {
                    id: altId, label: d.label, reason: d.reason,
                    basedOn: [], requiredCapabilities: d.requiredCapabilities.slice(),
                    limits: d.limits.slice(), readOnly: true
                };
            }
            if (byId[altId].basedOn.indexOf(item.code) < 0) byId[altId].basedOn.push(item.code);
        });

        // Deterministic order (declaration order) — explicitly NOT a ranking.
        Object.keys(ALT_DEF).forEach(function (id) { if (byId[id]) result.alternatives.push(byId[id]); });
        return result;
    }

    var api = {
        AF_VERSION: AF_VERSION,
        evaluateAction: evaluateAction,
        generateFeasibleAlternatives: generateFeasibleAlternatives
    };
    root.AppActionFeasibility = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
