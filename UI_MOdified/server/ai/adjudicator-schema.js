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

const TIME_LABELS = [
    'D-3h', 'H-Hour', 'H+2', 'H+6', 'H+12', 'H+24',
    'H+36', 'H+48', 'H+72', 'H+96', 'H+120', 'H+144',
];

const ELAPSED_HOURS_BY_INDEX = [-3, 0, 2, 6, 12, 24, 36, 48, 72, 96, 120, 144];

const PHASE_BY_INDEX = [
    'PRE-H', 'PHASE 1', 'PHASE 1', 'PHASE 2A', 'PHASE 2A', 'PHASE 2A',
    'PHASE 2B', 'PHASE 2B', 'PHASE 3', 'PHASE 3', 'PHASE 3', 'RESOLUTION',
];

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
// Blue unit_uid format: BLUE_<base>, where base matches one of:
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

function blueUidSet(scenario) {
    return new Set(scenario.blue_units_base_ids.map(id => 'BLUE_' + id));
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

function blankRedStrengths(scenario) {
    const out = {};
    for (const u of scenario.red_units) out[u.uid] = 1.0;
    return out;
}

/**
 * Step-0 state used as the seed for trial 0 of every Monte Carlo run.
 * Built from scenario.steps[0].* baselines — never invented.
 */
function freshState(scenario) {
    const s0 = scenario.steps[0];
    return {
        step_index: 0,
        time_label: s0.time_label,
        elapsed_hours: s0.elapsed_hours,
        phase: s0.phase,
        phase_line_km: s0.phase_line_km_baseline,
        objective_status: s0.objective_status_baseline,
        force_ratio: s0.force_ratio_baseline,
        ew_effect: s0.ew_effect_baseline,
        logistics_state: s0.logistics_state_baseline,
        decision_point: s0.decision_point_baseline,
        narrative_ar: s0.narrative_ar_fallback,
        narrative_en: s0.narrative_en_fallback,
        bls_status: { ...s0.bls_status_baseline },
        losses_step: { blue: 0, red_company_equivalent_cumulative: 0 },
        losses_cumulative: {
            blue_destroyed: 0,
            blue_total: scenario.blue_units_base_ids.length,
            red_company_equivalent: 0,
            red_aggregate_markers: scenario.red_units.length,
        },
        red_active_markers: scenario.red_units.length,
        per_unit_deltas: { blue_destroyed: [], red_degraded: [] },
        blue_actions: baselineBlueActionsForStep(0),
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
 */
function baselineStateForStep(scenario, stepIndex, prevState) {
    const s = scenario.steps[stepIndex];
    const blueDestroyed = s.blue_destroyed_baseline || [];
    const prevBlue = (prevState && prevState.blue_destroyed_cumulative) || [];
    const prevStepBlue = prevBlue.length;
    const blueStep = Math.max(0, blueDestroyed.length - prevStepBlue);

    const redStrength = blankRedStrengths(scenario);
    for (const uid of (s.red_degraded_baseline || [])) {
        redStrength[uid] = 0.7;
    }

    return {
        step_index: stepIndex,
        time_label: s.time_label,
        elapsed_hours: s.elapsed_hours,
        phase: s.phase,
        phase_line_km: s.phase_line_km_baseline,
        objective_status: s.objective_status_baseline,
        force_ratio: s.force_ratio_baseline,
        ew_effect: s.ew_effect_baseline,
        logistics_state: s.logistics_state_baseline,
        decision_point: s.decision_point_baseline,
        narrative_ar: s.narrative_ar_fallback,
        narrative_en: s.narrative_en_fallback,
        bls_status: { ...s.bls_status_baseline },
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
                unit_uid: uid, strength_current: 0.7, status: 'DEGRADED',
            })),
        },
        blue_actions: baselineBlueActionsForStep(stepIndex),
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
}

module.exports = {
    PHASES,
    OBJECTIVE_STATUS,
    TERMINAL_OBJECTIVE_STATUS,
    BLS_STATUS,
    EW_BANDS,
    EW_DECAY_ORDER,
    RED_UNIT_STATUS,
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
    redUidSet,
    blueUidSet,
    blsNames,
    parseForceRatio,
    baselineBlueActionsForStep,

    freshState,
    baselineStateForStep,
    blankRedStrengths,
    blankBlsStatus,
};
