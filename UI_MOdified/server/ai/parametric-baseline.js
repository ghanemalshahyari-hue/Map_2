/**
 * Parametric adjustments to the scenario baseline (item #8).
 *
 * Today's mock-mode + fallback path returns scenario.steps[i].*_baseline
 * verbatim — the same outcome regardless of COA. That makes the comparison
 * report (item #12) less useful and the learning store (items #5/#6) only
 * differentiate runs by what the LLM says, not by what the baseline says.
 *
 * This module lets baselineStateForStep nudge the NUMERICAL fields
 * (phase_line_km, losses_step.blue, per_unit_deltas.blue_destroyed,
 * red_losses_cumulative) by COA — four knobs:
 *
 *   posture ∈ {deliberate, hasty}
 *     hasty trades early speed for friction: +20% PL on steps 1..5,
 *     +1 extra Blue casualty per step from P2A onward.
 *
 *   reserve_commit_hour ∈ ℝ (default 72)
 *     < 72: Blue counterattack hits earlier, capping Red's PL. ~+1 km
 *           penalty per 8h of early commit, applied from step ⌊reserveHr/6⌋
 *           onward.
 *     > 72: Red gets further before reserves arrive. ~+1 km bonus per
 *           12h of late commit, applied through step 10. Defenders are
 *           exposed longer, so cumulative Blue losses also climb.
 *
 *   main_effort_axis ∈ {BLS-1, BLS-2, BLS-3, BLS-4}
 *     Anything other than BLS-3 (the unconstrained exit corridor per
 *     scenario.terrain_note) throttles PL by 15%.
 *
 *   weather ∈ {clear, overcast, storm, night}
 *     Affects EW effect decay (storm/night accelerate), logistics strain,
 *     and phase line speed.
 *
 * Strings (objective_status, narrative_*, force_ratio) stay on the
 * curated baseline — those are doctrinal narrative, not numerical state.
 *
 * Contract: when coaParams equals DEFAULT_COA (deliberate / 72 / BLS-3 /
 * clear) every adjustment is zero, so applyParametric is a no-op. That
 * keeps the item-10 regression tests (W1→CAPTURED, W2→DENIED) passing.
 *
 * Public surface:
 *   parametricAdjustments(stepIndex, baselineStep, coaParams)
 *     → { plDelta, blueLossDelta, redLossDelta, ewShift, logiShift }
 *   applyParametric(state, deltas, scenario, prevState)
 *     → mutated state
 *   isDefaultCoa(coaParams) → boolean
 */

'use strict';

const DEFAULT_POSTURE   = 'deliberate';
const DEFAULT_RESERVE   = 72;
const DEFAULT_AXIS      = 'BLS-3';
const DEFAULT_WEATHER   = 'clear';

// EW progression order (increasing index = more intense EW operations).
const EW_ORDER = ['Idle', 'Active', 'Heavy', 'Moderate', 'Low'];
const EW_IDX  = Object.fromEntries(EW_ORDER.map((v, i) => [v, i]));

// Logistics progression (increasing index = deeper strain).
// Values match the scenario step baselines in campaign order.
const LOGI_ORDER = [
    'Beachhead support area forming',
    'Single-corridor constrained',
    'Culminating',
];
const LOGI_IDX  = Object.fromEntries(LOGI_ORDER.map((v, i) => [v, i]));

function isDefaultCoa(coa) {
    if (!coa) return true;
    const posture = coa.posture || DEFAULT_POSTURE;
    const reserveHr = Number(coa.reserve_commit_hour);
    const axis = coa.main_effort_axis || DEFAULT_AXIS;
    const weather = coa.weather || DEFAULT_WEATHER;
    return posture === DEFAULT_POSTURE
        && (!Number.isFinite(reserveHr) || reserveHr === DEFAULT_RESERVE)
        && axis === DEFAULT_AXIS
        && weather === DEFAULT_WEATHER;
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// ── EW helpers ────────────────────────────────────────────────────────
function ewIndex(baselineEw) {
    return EW_IDX[baselineEw] != null ? EW_IDX[baselineEw] : 2; // fallback to Heavy
}

function ewBandForIndex(i) {
    const idx = clamp(Math.round(i), 0, EW_ORDER.length - 1);
    return EW_ORDER[idx];
}

// The EW band at each step follows the baseline progression shifted by
// `ewShift` steps (positive = decays faster, negative = sustained longer).
function parametricEw(baselineEw, stepIndex, ewShift) {
    const baseIdx = ewIndex(baselineEw);
    // Before H-Hour (step 0) EW builds up; parametric shift is attenuated.
    const shift = stepIndex === 0 ? Math.round(ewShift * 0.3) : ewShift;
    return ewBandForIndex(baseIdx + shift);
}

// ── Logistics helpers ─────────────────────────────────────────────────
function logiIndex(baselineLogi) {
    return LOGI_IDX[baselineLogi] != null ? LOGI_IDX[baselineLogi] : 1; // fallback to constrained
}

function logiBandForIndex(i) {
    const idx = clamp(Math.round(i), 0, LOGI_ORDER.length - 1);
    return LOGI_ORDER[idx];
}

// Logistics strain shifts the index forward (higher = more strained).
function parametricLogi(baselineLogi, stepIndex, logiShift) {
    const baseIdx = logiIndex(baselineLogi);
    return logiBandForIndex(baseIdx + logiShift);
}

// ── Weather tables ────────────────────────────────────────────────────
// Each weather condition maps to { ewDecay, plPenalty, logiStrain, blueLossBonus }.
// ewDecay: extra EW decay steps (positive = decays faster, negative = sustained longer)
// plPenalty: percentage of base PL to subtract
// logiStrain: extra logistics strain index shift
// blueLossBonus: extra Blue casualties per step from P2A onward
const WEATHER_TABLE = {
    clear:    { ewDecay: 0,  plPenalty: 0,    logiStrain: 0, blueLossBonus: 0 },
    overcast: { ewDecay: 1,  plPenalty: 0.05, logiStrain: 1, blueLossBonus: 0 },
    storm:    { ewDecay: 2,  plPenalty: 0.20, logiStrain: 2, blueLossBonus: 1 },
    night:    { ewDecay: 1,  plPenalty: 0,    logiStrain: 0, blueLossBonus: 1 },  // limited visibility
};

function parametricAdjustments(stepIndex, baselineStep, coaParams) {
    const zero = { plDelta: 0, blueLossDelta: 0, redLossDelta: 0, ewShift: 0, logiShift: 0 };
    if (isDefaultCoa(coaParams)) return zero;

    const posture   = coaParams.posture || DEFAULT_POSTURE;
    const reserveHr = Number.isFinite(Number(coaParams.reserve_commit_hour))
                        ? Number(coaParams.reserve_commit_hour)
                        : DEFAULT_RESERVE;
    const axis      = coaParams.main_effort_axis || DEFAULT_AXIS;
    const weather   = coaParams.weather || DEFAULT_WEATHER;
    const wx        = WEATHER_TABLE[weather] || WEATHER_TABLE.clear;

    const basePl = Number.isFinite(baselineStep.phase_line_km_baseline)
                      ? baselineStep.phase_line_km_baseline
                      : 0;

    let plDelta = 0;
    let blueLossDelta = 0;
    let redLossDelta = 0;
    let ewShift = 0;      // positive = EW decays faster (less effective)
    let logiShift = 0;    // positive = logistics more strained

    // ── posture
    if (posture === 'hasty') {
        if (stepIndex >= 1 && stepIndex <= 5) plDelta += Math.round(basePl * 0.20);
        if (stepIndex >= 4) blueLossDelta += 1;
        if (stepIndex >= 6) redLossDelta  += 1;  // friction accumulates
        // Hasty ops degrade EW prep and strain logistics.
        if (stepIndex >= 2) { ewShift += 1; logiShift += 1; }
    }

    // ── reserve_commit_hour
    if (reserveHr < DEFAULT_RESERVE) {
        const triggerStep = Math.max(1, Math.floor(reserveHr / 6));
        if (stepIndex >= triggerStep) {
            plDelta -= Math.round((DEFAULT_RESERVE - reserveHr) / 8);
            if (stepIndex >= triggerStep + 1) redLossDelta += 1;
        }
        // Early reserves relieve logistics strain slightly.
        if (stepIndex >= triggerStep) logiShift -= 1;
    } else if (reserveHr > DEFAULT_RESERVE) {
        // Apply late-reserve PL bonus to every step past the seed. Caller
        // bounds stepIndex to scenario.steps.length-1, so no upper clamp.
        if (stepIndex >= 1) {
            plDelta += Math.round((reserveHr - DEFAULT_RESERVE) / 12);
        }
        if (stepIndex >= 8) blueLossDelta += 1;
        // Late reserves strain logistics further.
        if (stepIndex >= 6) logiShift += 1;
    }

    // ── main_effort_axis — only BLS-3 has the unconstrained corridor.
    if (axis !== DEFAULT_AXIS) {
        plDelta -= Math.round(basePl * 0.15);
    }

    // ── weather — applied multiplicatively with existing deltas.
    ewShift     += wx.ewDecay;
    logiShift   += wx.logiStrain;
    plDelta     -= Math.round(basePl * wx.plPenalty);
    blueLossDelta += wx.blueLossBonus;

    return { plDelta, blueLossDelta, redLossDelta, ewShift, logiShift };
}

// Pick alive Blue uids to mark destroyed (or revive baseline-destroyed ones)
// in a deterministic order so two runs with the same COA produce identical
// per_unit_deltas. We order by base_id (alphabetic) — operators can audit
// "which units got picked first" by looking at scenario.blue_units_base_ids.
function adjustBlueDestroyed(scenario, baselineDestroyedUids, prevDestroyedCum, delta) {
    const ids = Array.isArray(baselineDestroyedUids) ? baselineDestroyedUids.slice() : [];
    if (delta === 0) return ids;

    if (delta > 0) {
        const all = (Array.isArray(scenario.blue_units_initial) && scenario.blue_units_initial.length)
            ? scenario.blue_units_initial.map(u => u && u.unit_uid).filter(Boolean)
            : (scenario.blue_units_base_ids || []).map(b => 'BLUE_' + b);
        const alreadyDead = new Set([...(prevDestroyedCum || []), ...ids]);
        const candidates = all.filter(uid => !alreadyDead.has(uid));
        // Deterministic order: scenario's listed order (which is hierarchical:
        // lc, brigades, battalions, companies). Picking from the end of that
        // list = lower echelons first, mirroring "fringe units hit first".
        for (let i = candidates.length - 1; i >= 0 && delta > 0; i--) {
            ids.push(candidates[i]);
            delta--;
        }
        return ids;
    }
    // delta < 0: drop the last |delta| entries (most-recently-destroyed
    // get a reprieve when the COA caps Red's reach).
    return ids.slice(0, Math.max(0, ids.length + delta));
}

function applyParametric(state, deltas, scenario, prevState) {
    if (!state || !deltas) return state;
    if (deltas.plDelta === 0 && deltas.blueLossDelta === 0 && deltas.redLossDelta === 0
        && deltas.ewShift === 0 && deltas.logiShift === 0) {
        return state;
    }

    // phase_line_km: monotone non-decreasing, clamped at OBJ depth.
    if (Number.isFinite(state.phase_line_km)) {
        const prevPl = (prevState && Number.isFinite(prevState.phase_line_km)) ? prevState.phase_line_km : 0;
        const depth = (scenario.obj && Number.isFinite(scenario.obj.target_depth_km))
                          ? scenario.obj.target_depth_km : 95;
        state.phase_line_km = clamp(state.phase_line_km + deltas.plDelta, prevPl, depth);
    }

    // Blue casualties — keep losses_step.blue == per_unit_deltas.blue_destroyed.length
    // so downstream consumers (validator, learning store) stay consistent.
    if (state.losses_step && state.per_unit_deltas) {
        const prevCum = (prevState && prevState.blue_destroyed_cumulative) || [];
        const newPerStep = adjustBlueDestroyed(
            scenario, state.per_unit_deltas.blue_destroyed, prevCum, deltas.blueLossDelta);
        state.per_unit_deltas.blue_destroyed = newPerStep;
        state.losses_step.blue = newPerStep.length;
        if (state.losses_cumulative) {
            const prevDestroyed = prevCum.length;
            state.losses_cumulative.blue_destroyed = prevDestroyed + newPerStep.length;
        }
        state.blue_destroyed_cumulative = (prevCum || []).concat(newPerStep);
    }

    // Red coy-eq losses — monotone non-decreasing on the cumulative field.
    if (state.losses_cumulative && Number.isFinite(state.losses_cumulative.red_company_equivalent)) {
        const prevRed = (prevState && prevState.losses_cumulative && Number.isFinite(prevState.losses_cumulative.red_company_equivalent))
                          ? prevState.losses_cumulative.red_company_equivalent : 0;
        state.losses_cumulative.red_company_equivalent = Math.max(
            prevRed,
            state.losses_cumulative.red_company_equivalent + deltas.redLossDelta,
        );
        if (state.losses_step) {
            state.losses_step.red_company_equivalent_cumulative = state.losses_cumulative.red_company_equivalent;
        }
    }

    // EW effect — shift the band by ewShift (positive = faster decay).
    if (deltas.ewShift !== 0 && state.ew_effect) {
        state.ew_effect = parametricEw(state.ew_effect, state.step_index, deltas.ewShift);
    }

    // Logistics state — shift the band by logiShift (positive = more strain).
    if (deltas.logiShift !== 0 && state.logistics_state) {
        state.logistics_state = parametricLogi(state.logistics_state, state.step_index, deltas.logiShift);
    }

    return state;
}

module.exports = {
    parametricAdjustments,
    applyParametric,
    adjustBlueDestroyed,
    isDefaultCoa,
    parametricEw,
    parametricLogi,
    EW_ORDER,
    LOGI_ORDER,
    WEATHER_TABLE,
    DEFAULT_POSTURE,
    DEFAULT_RESERVE,
    DEFAULT_AXIS,
    DEFAULT_WEATHER,
};
