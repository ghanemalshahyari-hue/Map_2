/**
 * Adjudicator response schema.
 *
 * Single source of truth for the JSON object the LLM must emit per step.
 * Plain JS — no AJV / no schema lib. The validator (adjudicator-validator.js)
 * enforces these constraints with concrete checks.
 *
 * The LLM is told this schema (via the system prompt) and the validator
 * post-checks it. Belt-and-braces.
 */

'use strict';

// ── Enums ─────────────────────────────────────────────────────────────
const PHASES = ['PRE-H', 'PHASE 1', 'PHASE 2A', 'PHASE 2B', 'PHASE 3', 'RESOLUTION'];

// State machine: DORMANT → THREATENED → CONTESTED → {CAPTURED | DENIED}.
// CONTESTED is a late-game in-between state W1 uses at step 10 (Blue still
// fighting at the OBJ). DENIED can also be reached directly from THREATENED
// when Blue holds outright.
const OBJECTIVE_STATUS = ['DORMANT', 'THREATENED', 'CONTESTED', 'CAPTURED', 'DENIED'];
const TERMINAL_OBJECTIVE_STATUS = new Set(['CAPTURED', 'DENIED']);

const BLS_STATUS = ['STAGED', 'CONTESTED', 'SECURE', 'LIMITED', 'DENIED'];

// EW bands in monotone-decreasing order. Index increases = decay.
const EW_BANDS = ['Heavy', 'Active', 'Moderate', 'Low', 'Idle'];
// (`Idle` is the pre-H baseline; it may appear before `Active`. After H, the
//  band is monotone decreasing through Active → Heavy → Moderate → Low.)
const EW_DECAY_ORDER = ['Heavy', 'Active', 'Moderate', 'Low'];

const RED_UNIT_STATUS = ['STAGED', 'ACTIVE', 'DEGRADED', 'DISPLACED'];

// Per-step Blue actions enum. Drives the COUNTERATTACK / WITHDRAW movement
// shifts the client renders in `bluePositionLonLat`. `HOLD` is the implicit
// default for any base_id not present in the map.
const BLUE_ACTION_VALUES = ['HOLD', 'COUNTERATTACK', 'WITHDRAW'];

// Deterministic Blue action schedule mirroring wargame.py make_steps (Wargame2
// baseline). Keys are step_index → { base_id → action }. The reservoir of
// counter-attacking units widens as the operation deepens. Source of truth —
// the client falls back to the same table when state.blue_actions is missing.
const BLUE_ACTIONS_BY_STEP_BASELINE = {
    4:  { lc: 'COUNTERATTACK', p21c: 'COUNTERATTACK', p22c: 'COUNTERATTACK', p23c: 'COUNTERATTACK' },
    5:  { lc: 'COUNTERATTACK', p21c: 'COUNTERATTACK', p22c: 'COUNTERATTACK', p23c: 'COUNTERATTACK' },
    6:  { lc: 'COUNTERATTACK', p21c: 'COUNTERATTACK', p22c: 'COUNTERATTACK', p23c: 'COUNTERATTACK' },
    7:  { lc: 'COUNTERATTACK', p21c: 'COUNTERATTACK', p22c: 'COUNTERATTACK', p23c: 'COUNTERATTACK' },
    8:  { lc: 'COUNTERATTACK', p21c: 'COUNTERATTACK', p22c: 'COUNTERATTACK', p23c: 'COUNTERATTACK' },
    9:  { lc: 'COUNTERATTACK', p21c: 'COUNTERATTACK', p22c: 'COUNTERATTACK', p23c: 'COUNTERATTACK',
          p31c: 'COUNTERATTACK', p32c: 'COUNTERATTACK', p33c: 'COUNTERATTACK' },
    10: { lc: 'COUNTERATTACK', p21c: 'COUNTERATTACK', p22c: 'COUNTERATTACK', p23c: 'COUNTERATTACK',
          p31c: 'COUNTERATTACK', p32c: 'COUNTERATTACK', p33c: 'COUNTERATTACK' },
    11: { lc: 'COUNTERATTACK', p21c: 'COUNTERATTACK', p22c: 'COUNTERATTACK', p23c: 'COUNTERATTACK',
          p31c: 'COUNTERATTACK', p32c: 'COUNTERATTACK', p33c: 'COUNTERATTACK' },
};

function baselineBlueActionsForStep(stepIndex) {
    return { ...(BLUE_ACTIONS_BY_STEP_BASELINE[stepIndex] || {}) };
}

function blueActionsForScenarioStep(stepIndex, scenario) {
    const actions = baselineBlueActionsForStep(stepIndex);
    if (!scenario || !Array.isArray(scenario.blue_units_base_ids)) return actions;
    const valid = new Set(scenario.blue_units_base_ids);
    return Object.fromEntries(Object.entries(actions).filter(([baseId]) => valid.has(baseId)));
}

const TIME_LABELS = [
    'D-3h', 'H-Hour', 'H+2', 'H+6', 'H+12', 'H+24',
    'H+36', 'H+48', 'H+72', 'H+96', 'H+120', 'H+144',
];

const ELAPSED_HOURS_BY_INDEX = [-3, 0, 2, 6, 12, 24, 36, 48, 72, 96, 120, 144];

const PHASE_BY_INDEX = [
    'PRE-H', 'PHASE 1', 'PHASE 1', 'PHASE 2A', 'PHASE 2A', 'PHASE 2A',
    'PHASE 2B', 'PHASE 2B', 'PHASE 3', 'PHASE 3', 'PHASE 3', 'RESOLUTION',
];

function scenarioStepMeta(scenario, stepIndex) {
    const phaseRow = Array.isArray(scenario && scenario.phase_table) ? scenario.phase_table[stepIndex] : null;
    const stepRow  = Array.isArray(scenario && scenario.steps)       ? scenario.steps[stepIndex]       : null;
    // W3-rich scenarios carry the producer's native phase name (e.g.
    // "h_hour_strike") in `kind_native` alongside the legacy enum (`phase`).
    // We surface both so the HUD can render "PHASE 1 (h_hour_strike)".
    const kindNative = (phaseRow && typeof phaseRow.kind_native === 'string')
        ? phaseRow.kind_native
        : ((stepRow && typeof stepRow.kind_native === 'string') ? stepRow.kind_native : null);
    return {
        time_label: (phaseRow && typeof phaseRow.time_label === 'string')
            ? phaseRow.time_label
            : ((stepRow && typeof stepRow.time_label === 'string') ? stepRow.time_label : TIME_LABELS[stepIndex]),
        elapsed_hours: Number.isFinite(phaseRow && phaseRow.elapsed_hours)
            ? phaseRow.elapsed_hours
            : (Number.isFinite(stepRow && stepRow.elapsed_hours) ? stepRow.elapsed_hours : ELAPSED_HOURS_BY_INDEX[stepIndex]),
        phase: (phaseRow && typeof phaseRow.phase === 'string')
            ? phaseRow.phase
            : ((stepRow && typeof stepRow.phase === 'string') ? stepRow.phase : PHASE_BY_INDEX[stepIndex]),
        kind_native: kindNative,
    };
}

// Hard throughput ceiling for Red's phase_line_km by elapsed_hours.
// Tuned to W1 (CAPTURED) + 10% slack — W1 is the high-water mark we want
// Monte Carlo to be able to reach. Tighter doctrinal guidance lives in the
// system prompt; the validator only clamps the absolute upper bound.
// W1 observed: pl=45@H+48, 65@H+72, 75@H+96, 92@H+120, 100@H+144.
function throughputCeilingKm(elapsedHours) {
    if (elapsedHours <= -1)  return 0;
    if (elapsedHours <= 0)   return 2;
    if (elapsedHours <= 2)   return 4;
    if (elapsedHours <= 6)   return 8;
    if (elapsedHours <= 12)  return 12;
    if (elapsedHours <= 24)  return 14;
    if (elapsedHours <= 36)  return 22;
    if (elapsedHours <= 48)  return 55;
    if (elapsedHours <= 72)  return 75;
    if (elapsedHours <= 96)  return 90;
    if (elapsedHours <= 120) return 105;
    return 115;
}

// ── Identifiers ───────────────────────────────────────────────────────
// Legacy Blue unit_uid format: BLUE_<base>, where base matches one of:
//   c\d{3}    company (c111..c333)
//   p\d{2}c   battalion (p11c..p33c)
//   b\dc      brigade (b1c..b3c)
//   lc        division reserve
const BLUE_UID_RE = /^BLUE_(c\d{3}|p\d{2}c|b\dc|lc)$/;

function isBlueUidShape(s) { return typeof s === 'string' && BLUE_UID_RE.test(s); }

// Red unit_uid is exactly one of the 11 listed in scenario.red_units.
function redUidSet(scenario) {
    return new Set(scenario.red_units.map(u => u.uid));
}

function blueUnitUids(scenario) {
    if (Array.isArray(scenario && scenario.blue_units_initial) && scenario.blue_units_initial.length) {
        const fromInitial = scenario.blue_units_initial
            .map(u => u && u.unit_uid)
            .filter(s => typeof s === 'string' && s.trim());
        if (fromInitial.length) return fromInitial;
    }
    return (scenario && Array.isArray(scenario.blue_units_base_ids))
        ? scenario.blue_units_base_ids.map(id => 'BLUE_' + id)
        : [];
}

function blueUidSet(scenario) {
    return new Set(blueUnitUids(scenario));
}

function blueUidAliasMap(scenario) {
    const out = new Map();
    if (Array.isArray(scenario && scenario.blue_units_initial) && scenario.blue_units_initial.length) {
        for (const unit of scenario.blue_units_initial) {
            const uid = unit && typeof unit.unit_uid === 'string' ? unit.unit_uid.trim() : '';
            const baseId = unit && typeof unit.base_id === 'string' ? unit.base_id.trim() : '';
            if (!uid) continue;
            out.set(uid, uid);
            if (baseId) {
                out.set(baseId, uid);
                out.set('BLUE_' + baseId, uid);
            }
            if (uid.startsWith('BLUE_')) out.set(uid.slice(5), uid);
        }
        if (out.size) return out;
    }
    if (Array.isArray(scenario && scenario.blue_units_base_ids)) {
        for (const baseId of scenario.blue_units_base_ids) {
            if (typeof baseId !== 'string' || !baseId.trim()) continue;
            const uid = 'BLUE_' + baseId;
            out.set(uid, uid);
            out.set(baseId, uid);
        }
    }
    return out;
}

function blsNames(scenario) {
    return scenario.bls_template.map(b => b.name);
}

// ── Force ratio parser ────────────────────────────────────────────────
// Accepts:  "3.2:1", "3.2:1 local", "Not engaged", "Decisive at OBJ",
//           "Below decisive at objective", "N/A"
const FORCE_RATIO_NUM_RE = /^(\d{1,2}(?:\.\d)?):1(?:\s+.+)?$/;

function parseForceRatio(s) {
    if (typeof s !== 'string') return null;
    const m = s.match(FORCE_RATIO_NUM_RE);
    if (m) return Number(m[1]);
    return null; // qualitative ("Not engaged", "Decisive at OBJ", etc.)
}

// ── Schema description (human-readable for the system prompt) ─────────
//
// The model is told *what shape* to emit. This object is also used by
// `freshState(scenario)` to seed validator fallbacks.
const RESPONSE_KEYS = [
    'step_index', 'time_label', 'elapsed_hours', 'phase',
    'phase_line_km', 'objective_status',
    'force_ratio', 'ew_effect', 'logistics_state', 'decision_point',
    'narrative_ar', 'narrative_en',
    'bls_status',
    'losses_step', 'losses_cumulative',
    'red_active_markers',
    'per_unit_deltas',
    // Optional: per-step Blue actions keyed by base_id (e.g. { lc: 'COUNTERATTACK' }).
    // When present, the client renders the corresponding +N km / -N km shift;
    // when absent, the client falls back to its local Wargame2 schedule.
    'blue_actions',
    'confidence_per_field',
    'notes',
];

// ── Fresh state from scenario baselines ───────────────────────────────
function blankBlsStatus(scenario) {
    const out = {};
    for (const b of scenario.bls_template) out[b.name] = 'STAGED';
    return out;
}

function normalizeBlsStatusValue(value) {
    if (BLS_STATUS.includes(value)) return value;
    if (String(value || '').toUpperCase() === 'THREATENED') return 'CONTESTED';
    return null;
}

function baselineBlsStatus(scenario, rawStatus) {
    const out = blankBlsStatus(scenario);
    const src = rawStatus && typeof rawStatus === 'object' ? rawStatus : {};
    for (const name of blsNames(scenario)) {
        const normalized = normalizeBlsStatusValue(src[name]);
        if (normalized) out[name] = normalized;
    }
    return out;
}

function blankRedStrengths(scenario) {
    const out = {};
    for (const u of scenario.red_units) out[u.uid] = 1.0;
    return out;
}

function baselineForceRatio(value, elapsedHours) {
    if (typeof value === 'string' && value.trim()) return value;
    if (typeof value === 'number' && Number.isFinite(value)) {
        return `${Number(value.toFixed(2))}:1`;
    }
    return elapsedHours <= 0 ? 'Not engaged' : 'N/A';
}

function baselineEwEffect(value, elapsedHours) {
    if (EW_BANDS.includes(value)) return value;
    return elapsedHours <= 0 ? 'Idle' : 'Active';
}

function baselineLogisticsState(value, elapsedHours) {
    if (typeof value === 'string' && value.trim()) return value;
    return elapsedHours <= 0 ? 'Pre-assault staging' : 'Building';
}

function baselineDecisionPoint(value, meta) {
    if (typeof value === 'string' && value.trim()) return value;
    // W3-rich scenarios pass kind_native (e.g. "h_hour_strike") which is
    // more informative than the legacy phase enum and — crucially — does
    // NOT equal state.phase, so the SITREP banner won't duplicate the
    // phase pill text on the next line.
    if (meta.kind_native) return meta.kind_native;
    return meta.phase || meta.time_label || 'Step progression';
}

/**
 * Step-0 state used as the seed for trial 0 of every Monte Carlo run.
 * Built from scenario.steps[0].* baselines — never invented.
 */
function freshState(scenario) {
    const s0 = scenario.steps[0];
    const meta = scenarioStepMeta(scenario, 0);
    return {
        step_index: 0,
        time_label: meta.time_label,
        elapsed_hours: meta.elapsed_hours,
        phase: meta.phase,
        kind_native: meta.kind_native || null,
        // W3-rich per-step detail. Pass-through when present on the
        // scenario; absent on W1/W2 so legacy code paths are unaffected.
        // Schema reference: docs/wargame3-schema.md.
        affected:                Array.isArray(s0.affected)        ? s0.affected        : null,
        actors:                  Array.isArray(s0.actors)          ? s0.actors          : null,
        engagement_arcs:         Array.isArray(s0.engagement_arcs) ? s0.engagement_arcs : null,
        // Per-unit live state for this phase (uid → strength/status/counters).
        unit_state:              (s0.unit_state && typeof s0.unit_state === 'object') ? s0.unit_state : null,
        // Phase-level narrative + force ratios + step advantage call.
        combined_effect:         s0.combined_effect      || null,
        force_ratio_local:       Number.isFinite(s0.force_ratio_local)       ? s0.force_ratio_local       : null,
        force_ratio_operational: Number.isFinite(s0.force_ratio_operational) ? s0.force_ratio_operational : null,
        step_advantage:          s0.step_advantage       || null,
        phase_name_ar:           s0.phase_name_ar        || null,
        phase_line_km: s0.phase_line_km_baseline,
        objective_status: s0.objective_status_baseline,
        force_ratio: baselineForceRatio(s0.force_ratio_baseline, meta.elapsed_hours),
        ew_effect: baselineEwEffect(s0.ew_effect_baseline, meta.elapsed_hours),
        logistics_state: baselineLogisticsState(s0.logistics_state_baseline, meta.elapsed_hours),
        decision_point: baselineDecisionPoint(s0.decision_point_baseline, meta),
        narrative_ar: s0.narrative_ar_fallback,
        narrative_en: s0.narrative_en_fallback,
        bls_status: baselineBlsStatus(scenario, s0.bls_status_baseline),
        losses_step: { blue: 0, red_company_equivalent_cumulative: 0 },
        losses_cumulative: {
            blue_destroyed: 0,
            blue_total: scenario.blue_units_base_ids.length,
            red_company_equivalent: 0,
            red_aggregate_markers: scenario.red_units.length,
        },
        red_active_markers: scenario.red_units.length,
        per_unit_deltas: { blue_destroyed: [], red_degraded: [] },
        blue_actions: blueActionsForScenarioStep(0, scenario),
        confidence_per_field: {
            phase_line_km:    'high',
            force_ratio:      'high',
            objective_status: 'high',
            ew_effect:        'high',
            bls_status:       'high',
            per_unit_deltas:  'high',
        },
        notes: '',
        red_strength_current: blankRedStrengths(scenario),
        blue_destroyed_cumulative: [],
    };
}

/**
 * Build the state the validator will fall back to when the LLM call fails
 * or produces unrecoverable garbage at `stepIndex`. Uses the scenario's
 * *_baseline fields — this is the "reproduce W2" path.
 *
 * `coaParams` (item #8) optionally biases the numerical fields by COA
 * (phase_line_km, blue/red losses, per_unit_deltas). When coaParams is
 * null/undefined or matches the default COA the output is unchanged,
 * preserving the regression-test contract.
 */
function baselineStateForStep(scenario, stepIndex, prevState, coaParams) {
    const s = scenario.steps[stepIndex];
    const meta = scenarioStepMeta(scenario, stepIndex);
    const blueDestroyed = s.blue_destroyed_baseline || [];
    const prevBlue = (prevState && prevState.blue_destroyed_cumulative) || [];
    const prevStepBlue = prevBlue.length;
    const blueStep = Math.max(0, blueDestroyed.length - prevStepBlue);

    const redStrength = blankRedStrengths(scenario);
    const baselineStrengths = s.red_strength_baseline && typeof s.red_strength_baseline === 'object'
        ? s.red_strength_baseline
        : null;
    for (const uid of Object.keys(redStrength)) {
        const strength = baselineStrengths && Number.isFinite(baselineStrengths[uid]) ? baselineStrengths[uid] : null;
        if (strength != null) redStrength[uid] = Math.max(0, Math.min(1, strength));
    }

    const state = {
        step_index: stepIndex,
        time_label: meta.time_label,
        elapsed_hours: meta.elapsed_hours,
        phase: meta.phase,
        kind_native: meta.kind_native || null,
        // W3-rich per-step detail (pass-through; null on legacy scenarios).
        // Schema reference: docs/wargame3-schema.md.
        affected:                Array.isArray(s.affected)        ? s.affected        : null,
        actors:                  Array.isArray(s.actors)          ? s.actors          : null,
        engagement_arcs:         Array.isArray(s.engagement_arcs) ? s.engagement_arcs : null,
        // Per-unit live state for this phase (uid → strength/status/counters).
        unit_state:              (s.unit_state && typeof s.unit_state === 'object') ? s.unit_state : null,
        // Phase-level narrative + force ratios + step advantage call.
        combined_effect:         s.combined_effect       || null,
        force_ratio_local:       Number.isFinite(s.force_ratio_local)       ? s.force_ratio_local       : null,
        force_ratio_operational: Number.isFinite(s.force_ratio_operational) ? s.force_ratio_operational : null,
        step_advantage:          s.step_advantage        || null,
        phase_name_ar:           s.phase_name_ar         || null,
        phase_line_km: s.phase_line_km_baseline,
        objective_status: s.objective_status_baseline,
        force_ratio: baselineForceRatio(s.force_ratio_baseline, meta.elapsed_hours),
        ew_effect: baselineEwEffect(s.ew_effect_baseline, meta.elapsed_hours),
        logistics_state: baselineLogisticsState(s.logistics_state_baseline, meta.elapsed_hours),
        decision_point: baselineDecisionPoint(s.decision_point_baseline, meta),
        narrative_ar: s.narrative_ar_fallback,
        narrative_en: s.narrative_en_fallback,
        bls_status: baselineBlsStatus(scenario, s.bls_status_baseline),
        losses_step: { blue: blueStep, red_company_equivalent_cumulative: s.red_losses_cumulative_baseline },
        losses_cumulative: {
            blue_destroyed: blueDestroyed.length,
            blue_total: scenario.blue_units_base_ids.length,
            red_company_equivalent: s.red_losses_cumulative_baseline,
            red_aggregate_markers: scenario.red_units.length,
        },
        red_active_markers: scenario.red_units.length - (s.red_degraded_baseline || []).filter(u => /DISPLACED/i.test(u)).length,
        per_unit_deltas: {
            blue_destroyed: blueDestroyed.filter(u => !prevBlue.includes(u)),
            red_degraded: (s.red_degraded_baseline || []).map(uid => ({
                unit_uid: uid, strength_current: redStrength[uid] != null ? redStrength[uid] : 0.7, status: 'DEGRADED',
            })),
        },
        blue_actions: blueActionsForScenarioStep(stepIndex, scenario),
        confidence_per_field: {
            phase_line_km:    'medium',
            force_ratio:      'medium',
            objective_status: 'medium',
            ew_effect:        'medium',
            bls_status:       'medium',
            per_unit_deltas:  'medium',
        },
        notes: 'baseline-fallback',
        red_strength_current: redStrength,
        blue_destroyed_cumulative: blueDestroyed.slice(),
    };

    // Item #8 — apply COA-driven adjustments after the state is built.
    // Default COA → adjustments are zero → state is unchanged (regression
    // contract preserved). Required lazily to avoid a circular load.
    const parametric = require('./parametric-baseline');
    if (!parametric.isDefaultCoa(coaParams)) {
        const deltas = parametric.parametricAdjustments(stepIndex, s, coaParams);
        parametric.applyParametric(state, deltas, scenario, prevState);
        // Annotate so trial logs make the variation visible.
        state.notes = 'baseline-fallback (parametric: ' +
            `pl${deltas.plDelta >= 0 ? '+' : ''}${deltas.plDelta}, ` +
            `blue${deltas.blueLossDelta >= 0 ? '+' : ''}${deltas.blueLossDelta}, ` +
            `red${deltas.redLossDelta >= 0 ? '+' : ''}${deltas.redLossDelta}, ` +
            `ew${deltas.ewShift >= 0 ? '+' : ''}${deltas.ewShift}, ` +
            `logi${deltas.logiShift >= 0 ? '+' : ''}${deltas.logiShift})`;
    }

    return state;
}

// ── Proposal / Commit contract (boundary plan Step 1) ─────────────────
//
// The AI agents (LLM-narrator today, deterministic-sim later) emit
// Proposals. A Proposal is a *projection* — it describes what would
// happen if accepted, but no state is mutated until /api/sim/commit
// processes it. The legacy shim auto-accepts via headless commit; the
// operator UI (Step 2) accepts/rejects per action.

// Action.kind enum. Step 1 carries the legacy MOVE/ENGAGE/HOLD set
// (matches client/wargame/approved-actions.js) plus 'STATE_DELTA',
// which is the synthetic action emitted by the LLM-narrator when its
// output is a whole-state projection rather than a per-unit order.
const ACTION_KINDS = ['STATE_DELTA', 'MOVE', 'ENGAGE', 'HOLD'];

// Decision enum for journal rows.
const DECISIONS = ['accept', 'reject', 'auto'];

// Producer source for a Proposal / journal row.
const PROPOSAL_SOURCES = ['llm-narrator', 'deterministic-sim', 'legacy-shim'];

function isActionKind(k) { return typeof k === 'string' && ACTION_KINDS.indexOf(k) >= 0; }
function isDecision(d)   { return typeof d === 'string' && DECISIONS.indexOf(d) >= 0; }
function isProposalSource(s) { return typeof s === 'string' && PROPOSAL_SOURCES.indexOf(s) >= 0; }

// Lightweight shape check for an Action. Step 1: STATE_DELTA carries
// empty payload; per-unit kinds carry { unit_id, payload }. Returns
// the first problem found or null.
function validateAction(action) {
    if (!action || typeof action !== 'object') return 'action must be an object';
    if (typeof action.id !== 'string' || !action.id) return 'action.id required (string)';
    if (!isActionKind(action.kind)) return `action.kind must be one of ${ACTION_KINDS.join('/')}`;
    if (action.kind !== 'STATE_DELTA') {
        if (typeof action.unit_id !== 'string' || !action.unit_id) {
            return `action.unit_id required for kind ${action.kind}`;
        }
    }
    if (action.side != null && typeof action.side !== 'string') return 'action.side must be a string when present';
    if (action.rationale != null && typeof action.rationale !== 'string') return 'action.rationale must be a string';
    return null;
}

// Validate a Proposal envelope. Internal fields (projected_state,
// validation, rawLlm, …) are not deeply checked here — they pass
// through whatever the producer emitted.
function validateProposal(p) {
    if (!p || typeof p !== 'object') return 'proposal must be an object';
    if (typeof p.proposal_id !== 'string' || !p.proposal_id) return 'proposal_id required';
    if (!Number.isInteger(p.step_index) || p.step_index < 0) return 'step_index must be a non-negative integer';
    if (!isProposalSource(p.source)) return `source must be one of ${PROPOSAL_SOURCES.join('/')}`;
    if (!Array.isArray(p.proposed_actions)) return 'proposed_actions must be an array';
    for (let i = 0; i < p.proposed_actions.length; i++) {
        const err = validateAction(p.proposed_actions[i]);
        if (err) return `proposed_actions[${i}]: ${err}`;
    }
    return null;
}

// Validate a /api/sim/commit request body.
function validateCommitRequest(body) {
    if (!body || typeof body !== 'object') return 'commit body must be an object';
    if (typeof body.proposal_id !== 'string' || !body.proposal_id) return 'proposal_id required';
    const ids = body.accepted_action_ids;
    const isAll = ids === 'ALL';
    if (!isAll && !Array.isArray(ids)) return "accepted_action_ids must be an array or the literal 'ALL'";
    if (body.rejected_action_ids != null && !Array.isArray(body.rejected_action_ids)) {
        return 'rejected_action_ids must be an array when present';
    }
    // operator_id OR headless.reason is required (R2 — no commit without intent)
    const hasOp = typeof body.operator_id === 'string' && body.operator_id;
    const hasHeadless = body.headless && typeof body.headless.reason === 'string' && body.headless.reason;
    if (!hasOp && !hasHeadless) {
        return 'either operator_id (UI commit) or headless.reason (in-process commit) is required';
    }
    return null;
}

module.exports = {
    PHASES,
    OBJECTIVE_STATUS,
    TERMINAL_OBJECTIVE_STATUS,
    BLS_STATUS,
    EW_BANDS,
    EW_DECAY_ORDER,
    RED_UNIT_STATUS,
    scenarioStepMeta,
    TIME_LABELS,
    ELAPSED_HOURS_BY_INDEX,
    PHASE_BY_INDEX,
    RESPONSE_KEYS,
    BLUE_UID_RE,
    FORCE_RATIO_NUM_RE,
    BLUE_ACTION_VALUES,
    BLUE_ACTIONS_BY_STEP_BASELINE,

    throughputCeilingKm,
    isBlueUidShape,
    blueUnitUids,
    redUidSet,
    blueUidSet,
    blueUidAliasMap,
    blsNames,
    parseForceRatio,
    baselineBlueActionsForStep,
    blueActionsForScenarioStep,

    freshState,
    baselineStateForStep,
    blankRedStrengths,
    blankBlsStatus,

    // Proposal / commit contract (Step 1 of the AI/sim boundary plan)
    ACTION_KINDS,
    DECISIONS,
    PROPOSAL_SOURCES,
    isActionKind,
    isDecision,
    isProposalSource,
    validateAction,
    validateProposal,
    validateCommitRequest,
};
