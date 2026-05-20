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
 * red_losses_cumulative) by COA — three knobs:
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
 * Strings (objective_status, bls_status, narrative_*, force_ratio,
 * logistics_state) stay on the curated baseline — those are doctrinal
 * narrative, not numerical state.
 *
 * Contract: when coaParams equals DEFAULT_COA (deliberate / 72 / BLS-3)
 * every adjustment is zero, so applyParametric is a no-op. That keeps
 * the item-10 regression tests (W1→CAPTURED, W2→DENIED) passing.
 *
 * Public surface:
 *   parametricAdjustments(stepIndex, baselineStep, coaParams)
 *     → { plDelta, blueLossDelta, redLossDelta, ... }
 *   applyParametric(state, deltas, scenario, prevState)
 *     → mutated state
 *   isDefaultCoa(coaParams) → boolean
 */

'use strict';

const DEFAULT_POSTURE   = 'deliberate';
const DEFAULT_RESERVE   = 72;
const DEFAULT_AXIS      = 'BLS-3';

function isDefaultCoa(coa) {
    if (!coa) return true;
    const posture = coa.posture || DEFAULT_POSTURE;
    const reserveHr = Number(coa.reserve_commit_hour);
    const axis = coa.main_effort_axis || DEFAULT_AXIS;
    return posture === DEFAULT_POSTURE
        && (!Number.isFinite(reserveHr) || reserveHr === DEFAULT_RESERVE)
        && axis === DEFAULT_AXIS;
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function parametricAdjustments(stepIndex, baselineStep, coaParams) {
    const zero = { plDelta: 0, blueLossDelta: 0, redLossDelta: 0 };
    if (isDefaultCoa(coaParams)) return zero;

    const posture   = coaParams.posture || DEFAULT_POSTURE;
    const reserveHr = Number.isFinite(Number(coaParams.reserve_commit_hour))
                        ? Number(coaParams.reserve_commit_hour)
                        : DEFAULT_RESERVE;
    const axis      = coaParams.main_effort_axis || DEFAULT_AXIS;

    const basePl = Number.isFinite(baselineStep.phase_line_km_baseline)
                      ? baselineStep.phase_line_km_baseline
                      : 0;

    let plDelta = 0;
    let blueLossDelta = 0;
    let redLossDelta = 0;

    // ── posture
    if (posture === 'hasty') {
        if (stepIndex >= 1 && stepIndex <= 5) plDelta += Math.round(basePl * 0.20);
        if (stepIndex >= 4) blueLossDelta += 1;
        if (stepIndex >= 6) redLossDelta  += 1;  // friction accumulates
    }

    // ── reserve_commit_hour
    // The triggering step is roughly reserveHr / 6 (each step ≈ 6h of
    // elapsed campaign time on average through P2A). Earlier commit → Red
    // runs into Blue's counterattack sooner.
    if (reserveHr < DEFAULT_RESERVE) {
        const triggerStep = Math.max(1, Math.floor(reserveHr / 6));
        if (stepIndex >= triggerStep) {
            plDelta -= Math.round((DEFAULT_RESERVE - reserveHr) / 8);
            // Counterattacking earlier means Red also takes more losses.
            if (stepIndex >= triggerStep + 1) redLossDelta += 1;
        }
    } else if (reserveHr > DEFAULT_RESERVE) {
        // Apply through step 11 so terminal PL also reflects the late-commit
        // bonus — Red has more time to push toward OBJ before reserves bite.
        if (stepIndex >= 1 && stepIndex <= 11) {
            plDelta += Math.round((reserveHr - DEFAULT_RESERVE) / 12);
        }
        // Defenders exposed longer when reserves arrive late.
        if (stepIndex >= 8) blueLossDelta += 1;
    }

    // ── main_effort_axis — only BLS-3 has the unconstrained corridor.
    if (axis !== DEFAULT_AXIS) {
        plDelta -= Math.round(basePl * 0.15);
    }

    return { plDelta, blueLossDelta, redLossDelta };
}

// Pick alive Blue uids to mark destroyed (or revive baseline-destroyed ones)
// in a deterministic order so two runs with the same COA produce identical
// per_unit_deltas. We order by base_id (alphabetic) — operators can audit
// "which units got picked first" by looking at scenario.blue_units_base_ids.
function adjustBlueDestroyed(scenario, baselineDestroyedUids, prevDestroyedCum, delta) {
    const ids = Array.isArray(baselineDestroyedUids) ? baselineDestroyedUids.slice() : [];
    if (delta === 0) return ids;

    if (delta > 0) {
        const all = (scenario.blue_units_base_ids || []).map(b => 'BLUE_' + b);
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
    if (deltas.plDelta === 0 && deltas.blueLossDelta === 0 && deltas.redLossDelta === 0) {
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

    return state;
}

module.exports = {
    parametricAdjustments,
    applyParametric,
    adjustBlueDestroyed,
    isDefaultCoa,
    DEFAULT_POSTURE,
    DEFAULT_RESERVE,
    DEFAULT_AXIS,
};
