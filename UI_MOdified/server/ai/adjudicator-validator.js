/**
 * Adjudicator response validator.
 *
 * Three layers:
 *   1. Hard structural — schema, types, enums, identifier existence,
 *      arithmetic identities. Failures → caller should retry once, then
 *      fall back to scenario baseline.
 *   2. Monotonicity soft-clamp — phase_line_km regression, EW re-intensify,
 *      bls_status illegal transitions, red strength_current rises. Clamped
 *      in place; warning logged.
 *   3. Plausibility / cosmetic — force_ratio bounds, narrative word counts,
 *      banned-word lint, narrative leaking unit_uid prefixes. Warning only.
 *
 * The returned `repaired` object is what the runner should commit. The raw
 * LLM output is the caller's responsibility to retain in the trial log.
 */

'use strict';

const schema = require('./adjudicator-schema');

const ARABIC_RE = /[؀-ۿ]/;

const BANNED_NARRATIVE_WORDS = [
    'magnificent', 'valiant', 'heroic', 'tragic', 'stunning',
    'glorious', 'triumphant', 'devastating',
];

function isNum(v)    { return typeof v === 'number' && Number.isFinite(v); }
function isStr(v)    { return typeof v === 'string'; }
function isObj(v)    { return v && typeof v === 'object' && !Array.isArray(v); }
function arr(v)      { return Array.isArray(v); }

function arabicWordCount(s) {
    if (!isStr(s)) return 0;
    return s.trim().split(/[\s،.؟!.,]+/).filter(Boolean).length;
}

function englishWordCount(s) {
    if (!isStr(s)) return 0;
    return s.trim().split(/\s+/).filter(Boolean).length;
}

function ewBandIndex(s) {
    // EW_DECAY_ORDER: Heavy < Active < Moderate < Low (decreasing intensity).
    // Idle is the pre-H baseline; treat as either pre-peak (before Heavy) or
    // post-decay (after Low). For monotone-decrease after H, we compare
    // against EW_DECAY_ORDER only; Idle is skipped.
    return schema.EW_DECAY_ORDER.indexOf(s);
}

function blsTransitionAllowed(prev, next, scenario) {
    if (prev === next) return true;
    // STAGED → CONTESTED is allowed.
    if (prev === 'STAGED' && next === 'CONTESTED') return true;
    // CONTESTED → {SECURE, LIMITED, DENIED}.
    if (prev === 'CONTESTED' && (next === 'SECURE' || next === 'LIMITED' || next === 'DENIED')) return true;
    // SECURE → LIMITED (throughput constrained) allowed.
    if (prev === 'SECURE' && next === 'LIMITED') return true;
    // SECURE → CONTESTED only under blue counterattack (callers approve elsewhere).
    if (prev === 'SECURE' && next === 'CONTESTED') return true;
    // LIMITED → CONTESTED or LIMITED → DENIED.
    if (prev === 'LIMITED' && (next === 'CONTESTED' || next === 'DENIED')) return true;
    // DENIED is terminal except can become CONTESTED if Red repushes (rare).
    if (prev === 'DENIED' && next === 'CONTESTED') return true;
    return false;
}

function pushErr(list, path, msg) { list.push({ path, msg }); }

// ── Layer 1 — structural / hard ───────────────────────────────────────
function structuralCheck(delta, prevState, scenario, stepIndex) {
    const errs = [];

    if (!isObj(delta)) {
        pushErr(errs, 'root', 'response is not an object');
        return errs;
    }

    if (delta.step_index !== stepIndex) {
        pushErr(errs, 'step_index', `expected ${stepIndex}, got ${delta.step_index}`);
    }

    if (delta.time_label !== schema.TIME_LABELS[stepIndex]) {
        pushErr(errs, 'time_label', `expected ${schema.TIME_LABELS[stepIndex]}, got ${delta.time_label}`);
    }

    if (delta.elapsed_hours !== schema.ELAPSED_HOURS_BY_INDEX[stepIndex]) {
        pushErr(errs, 'elapsed_hours', `expected ${schema.ELAPSED_HOURS_BY_INDEX[stepIndex]}, got ${delta.elapsed_hours}`);
    }

    if (delta.phase !== schema.PHASE_BY_INDEX[stepIndex]) {
        pushErr(errs, 'phase', `expected ${schema.PHASE_BY_INDEX[stepIndex]}, got ${delta.phase}`);
    }

    if (!isNum(delta.phase_line_km) || delta.phase_line_km < 0) {
        pushErr(errs, 'phase_line_km', `must be a non-negative number, got ${delta.phase_line_km}`);
    }

    if (!schema.OBJECTIVE_STATUS.includes(delta.objective_status)) {
        pushErr(errs, 'objective_status', `invalid value ${delta.objective_status}`);
    }

    if (!isStr(delta.force_ratio) || !delta.force_ratio.trim()) {
        pushErr(errs, 'force_ratio', 'must be non-empty string');
    }

    if (!schema.EW_BANDS.includes(delta.ew_effect)) {
        pushErr(errs, 'ew_effect', `invalid value ${delta.ew_effect}`);
    }

    if (!isStr(delta.logistics_state) || !delta.logistics_state.trim()) {
        pushErr(errs, 'logistics_state', 'must be non-empty string');
    }

    if (!isStr(delta.decision_point) || !delta.decision_point.trim()) {
        pushErr(errs, 'decision_point', 'must be non-empty string');
    }

    if (!isStr(delta.narrative_ar) || !ARABIC_RE.test(delta.narrative_ar)) {
        pushErr(errs, 'narrative_ar', 'must contain Arabic characters');
    }

    if (!isStr(delta.narrative_en) || !delta.narrative_en.trim()) {
        pushErr(errs, 'narrative_en', 'must be non-empty string');
    }

    if (!isObj(delta.bls_status)) {
        pushErr(errs, 'bls_status', 'must be object keyed by BLS name');
    } else {
        const expectedNames = schema.blsNames(scenario);
        for (const name of expectedNames) {
            if (!schema.BLS_STATUS.includes(delta.bls_status[name])) {
                pushErr(errs, `bls_status.${name}`, `invalid value ${delta.bls_status[name]}`);
            }
        }
        for (const k of Object.keys(delta.bls_status)) {
            if (!expectedNames.includes(k)) {
                pushErr(errs, `bls_status.${k}`, 'unknown BLS name');
            }
        }
    }

    if (!isObj(delta.losses_step) || !isNum(delta.losses_step.blue) || delta.losses_step.blue < 0) {
        pushErr(errs, 'losses_step.blue', 'must be non-negative number');
    }

    if (!isObj(delta.losses_cumulative)
            || !isNum(delta.losses_cumulative.blue_destroyed)
            || delta.losses_cumulative.blue_destroyed < 0) {
        pushErr(errs, 'losses_cumulative.blue_destroyed', 'must be non-negative number');
    }

    if (!isObj(delta.per_unit_deltas)
            || !arr(delta.per_unit_deltas.blue_destroyed)
            || !arr(delta.per_unit_deltas.red_degraded)) {
        pushErr(errs, 'per_unit_deltas', 'must have blue_destroyed[] and red_degraded[]');
    } else {
        const blueValid = schema.blueUidSet(scenario);
        const redValid = schema.redUidSet(scenario);
        const prevDestroyed = new Set(prevState ? prevState.blue_destroyed_cumulative || [] : []);
        for (const uid of delta.per_unit_deltas.blue_destroyed) {
            if (!schema.isBlueUidShape(uid)) {
                pushErr(errs, 'per_unit_deltas.blue_destroyed', `bad shape: ${uid}`);
            } else if (!blueValid.has(uid)) {
                pushErr(errs, 'per_unit_deltas.blue_destroyed', `unknown unit_uid: ${uid}`);
            } else if (prevDestroyed.has(uid)) {
                pushErr(errs, 'per_unit_deltas.blue_destroyed', `already destroyed: ${uid}`);
            }
        }
        for (const entry of delta.per_unit_deltas.red_degraded) {
            if (!isObj(entry) || !redValid.has(entry.unit_uid)) {
                pushErr(errs, 'per_unit_deltas.red_degraded', `unknown red unit_uid: ${entry && entry.unit_uid}`);
            }
            if (entry && (!isNum(entry.strength_current) || entry.strength_current < 0 || entry.strength_current > 1)) {
                pushErr(errs, 'per_unit_deltas.red_degraded.strength_current', 'must be in [0,1]');
            }
            if (entry && !schema.RED_UNIT_STATUS.includes(entry.status)) {
                pushErr(errs, 'per_unit_deltas.red_degraded.status', `invalid status: ${entry && entry.status}`);
            }
        }
    }

    // Arithmetic identities (only check if prior layers passed).
    if (errs.length === 0 && prevState) {
        const prevCum = prevState.losses_cumulative.blue_destroyed;
        const expectedCum = prevCum + delta.losses_step.blue;
        if (delta.losses_cumulative.blue_destroyed !== expectedCum) {
            pushErr(errs, 'losses_cumulative.blue_destroyed',
                `expected prev(${prevCum}) + step(${delta.losses_step.blue}) = ${expectedCum}, got ${delta.losses_cumulative.blue_destroyed}`);
        }
        if (delta.per_unit_deltas.blue_destroyed.length !== delta.losses_step.blue) {
            pushErr(errs, 'per_unit_deltas.blue_destroyed.length',
                `length(${delta.per_unit_deltas.blue_destroyed.length}) != losses_step.blue(${delta.losses_step.blue})`);
        }
    }

    return errs;
}

// ── Layer 2 — monotonicity / soft-clamp ──────────────────────────────
function monotonicityClamp(delta, prevState, scenario, stepIndex) {
    const warns = [];
    const clamped = [];

    if (!prevState) return { warns, clamped };

    // phase_line_km non-decreasing
    if (delta.phase_line_km < prevState.phase_line_km) {
        delta.phase_line_km = prevState.phase_line_km;
        clamped.push('phase_line_km');
        warns.push({ path: 'phase_line_km', msg: 'regression clamped to prev' });
    }

    // phase_line_km doctrinal throughput ceiling
    const ceiling = schema.throughputCeilingKm(delta.elapsed_hours);
    if (delta.phase_line_km > ceiling) {
        delta.phase_line_km = ceiling;
        clamped.push('phase_line_km');
        warns.push({ path: 'phase_line_km', msg: `exceeded throughput ceiling at ${delta.elapsed_hours}h; clamped to ${ceiling}` });
    }

    // EW band monotone-decreasing (after H+0; pre-H ignored)
    if (delta.elapsed_hours > 0) {
        const prevIdx = ewBandIndex(prevState.ew_effect);
        const nextIdx = ewBandIndex(delta.ew_effect);
        if (prevIdx >= 0 && nextIdx >= 0 && nextIdx < prevIdx) {
            delta.ew_effect = prevState.ew_effect;
            clamped.push('ew_effect');
            warns.push({ path: 'ew_effect', msg: `re-intensified from ${schema.EW_DECAY_ORDER[prevIdx]} to ${schema.EW_DECAY_ORDER[nextIdx]}; clamped` });
        }
    }

    // bls_status transitions
    for (const name of schema.blsNames(scenario)) {
        const prev = prevState.bls_status[name];
        const next = delta.bls_status[name];
        if (!blsTransitionAllowed(prev, next, scenario)) {
            delta.bls_status[name] = prev;
            clamped.push(`bls_status.${name}`);
            warns.push({ path: `bls_status.${name}`, msg: `illegal transition ${prev}→${next}; reverted` });
        }
    }

    // objective_status: terminal only at step >= 10
    if (schema.TERMINAL_OBJECTIVE_STATUS.has(delta.objective_status) && stepIndex < 10) {
        delta.objective_status = 'THREATENED';
        clamped.push('objective_status');
        warns.push({ path: 'objective_status', msg: `terminal at step ${stepIndex}; reverted to THREATENED` });
    }

    // objective_status: can't regress from terminal
    if (schema.TERMINAL_OBJECTIVE_STATUS.has(prevState.objective_status)
            && delta.objective_status !== prevState.objective_status) {
        delta.objective_status = prevState.objective_status;
        clamped.push('objective_status');
        warns.push({ path: 'objective_status', msg: `regressed from terminal; restored` });
    }

    // Red strength_current can only decrease.
    const prevStrength = prevState.red_strength_current || {};
    for (const entry of delta.per_unit_deltas.red_degraded) {
        const prev = prevStrength[entry.unit_uid];
        if (isNum(prev) && entry.strength_current > prev) {
            entry.strength_current = prev;
            clamped.push(`per_unit_deltas.red_degraded.${entry.unit_uid}.strength_current`);
            warns.push({ path: `red_degraded.${entry.unit_uid}.strength_current`, msg: `rose from ${prev}; clamped` });
        }
    }

    // Optional blue_actions: drop unknown base_ids and invalid action values.
    // Missing field stays missing (client falls back to its baseline table).
    if (delta.blue_actions !== undefined) {
        if (!isObj(delta.blue_actions)) {
            delta.blue_actions = schema.baselineBlueActionsForStep(stepIndex);
            clamped.push('blue_actions');
            warns.push({ path: 'blue_actions', msg: 'not an object; replaced with baseline schedule' });
        } else {
            const validBase = new Set(scenario.blue_units_base_ids);
            const validAction = new Set(schema.BLUE_ACTION_VALUES);
            for (const [base, action] of Object.entries(delta.blue_actions)) {
                if (!validBase.has(base)) {
                    delete delta.blue_actions[base];
                    clamped.push(`blue_actions.${base}`);
                    warns.push({ path: `blue_actions.${base}`, msg: 'unknown base_id; dropped' });
                } else if (!validAction.has(action)) {
                    delete delta.blue_actions[base];
                    clamped.push(`blue_actions.${base}`);
                    warns.push({ path: `blue_actions.${base}`, msg: `invalid action ${action}; dropped` });
                }
            }
        }
    }

    return { warns, clamped };
}

// ── Layer 3 — plausibility / cosmetic ────────────────────────────────
function plausibilityWarnings(delta) {
    const warns = [];

    const fr = schema.parseForceRatio(delta.force_ratio);
    if (fr !== null && (fr < 0.1 || fr > 20)) {
        warns.push({ path: 'force_ratio', msg: `numeric ${fr} outside [0.1, 20]` });
    }

    const arWords = arabicWordCount(delta.narrative_ar);
    if (arWords < 90 || arWords > 140) {
        warns.push({ path: 'narrative_ar', msg: `word count ${arWords} outside [90,140]` });
    }

    const enWords = englishWordCount(delta.narrative_en);
    if (enWords < 60 || enWords > 90) {
        warns.push({ path: 'narrative_en', msg: `word count ${enWords} outside [60,90]` });
    }

    if (/\b(BLUE_|RED_)/.test(delta.narrative_ar)) {
        warns.push({ path: 'narrative_ar', msg: 'leaks unit_uid prefix (use base id)' });
    }
    if (/\b(BLUE_|RED_)/.test(delta.narrative_en)) {
        warns.push({ path: 'narrative_en', msg: 'leaks unit_uid prefix (use base id)' });
    }

    const dpWords = (delta.decision_point || '').split(/\s+/).filter(Boolean).length;
    if (dpWords > 6) {
        warns.push({ path: 'decision_point', msg: `${dpWords} words (max 6)` });
    }

    const lower = (delta.narrative_en || '').toLowerCase();
    for (const banned of BANNED_NARRATIVE_WORDS) {
        if (lower.includes(banned)) {
            warns.push({ path: 'narrative_en', msg: `banned word: ${banned}` });
        }
    }

    return warns;
}

// ── Merge clamped delta into the next prevState ──────────────────────
function nextPrevStateFromDelta(delta, prevState, scenario) {
    const nextDestroyed = prevState
        ? prevState.blue_destroyed_cumulative.slice()
        : [];
    for (const uid of delta.per_unit_deltas.blue_destroyed) {
        if (!nextDestroyed.includes(uid)) nextDestroyed.push(uid);
    }
    const nextStrength = { ...(prevState ? prevState.red_strength_current : schema.blankRedStrengths(scenario)) };
    for (const entry of delta.per_unit_deltas.red_degraded) {
        nextStrength[entry.unit_uid] = entry.strength_current;
    }
    return {
        ...delta,
        red_strength_current: nextStrength,
        blue_destroyed_cumulative: nextDestroyed,
    };
}

// ── Main entry ────────────────────────────────────────────────────────
function validateStateDelta(delta, prevState, scenario, stepIndex) {
    const schema_errors = structuralCheck(delta, prevState, scenario, stepIndex);
    if (schema_errors.length > 0) {
        return {
            ok: false,
            schema_errors,
            doctrinal_warnings: [],
            plausibility_warnings: [],
            clamped_fields: [],
            repaired: null,
        };
    }
    const m = monotonicityClamp(delta, prevState, scenario, stepIndex);
    const p = plausibilityWarnings(delta);

    return {
        ok: true,
        schema_errors: [],
        doctrinal_warnings: m.warns,
        plausibility_warnings: p,
        clamped_fields: m.clamped,
        repaired: nextPrevStateFromDelta(delta, prevState, scenario),
    };
}

module.exports = {
    validateStateDelta,
    structuralCheck,
    monotonicityClamp,
    plausibilityWarnings,
    nextPrevStateFromDelta,
    blsTransitionAllowed,
    arabicWordCount,
    englishWordCount,
};
