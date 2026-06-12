/**
 * COA (Course of Action) schema validator.
 *
 * The COA generator (coa-agent.js) asks the LLM for a JSON ARRAY of 3-5
 * plans. This module validates the structural shape and value ranges so
 * the HUD never renders garbage cards. Failures are soft where possible
 * (a single bad card is dropped, not the whole response) and hard when
 * the array shape itself is wrong.
 *
 * Public surface:
 *   RISK_TIERS                   → frozen array of allowed risk tiers
 *   REQUIRED_KEYS                → top-level required fields per COA
 *   validateCoaArray(parsed)     → { ok, plans, dropped, errors }
 *
 * Designed to be lenient with medium-quality models (qwen2.5:7b et al.)
 * while still rejecting unusable output. We coerce strings→numbers when
 * the field demands a number; we default missing optional arrays to [];
 * we drop bad cards rather than fail the whole batch.
 */

'use strict';

const RISK_TIERS   = Object.freeze(['low', 'medium', 'high', 'extreme']);
const REQUIRED_KEYS = Object.freeze([
    'name', 'risk_tier', 'eta_hours', 'blue_casualty_p50',
    'blue_casualty_p90', 'rationale', 'key_assumptions', 'plan',
]);

function asInt(v, fallback) {
    if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v);
    if (typeof v === 'string') {
        const m = v.match(/-?\d+/);
        if (m) {
            const n = parseInt(m[0], 10);
            if (Number.isFinite(n)) return n;
        }
    }
    return fallback;
}

function clamp(n, lo, hi) {
    if (typeof n !== 'number' || !Number.isFinite(n)) return lo;
    return Math.max(lo, Math.min(hi, n));
}

function asArray(v) {
    if (Array.isArray(v)) return v;
    if (v == null) return [];
    return [v];
}

function asShortString(v, maxLen) {
    if (v == null) return '';
    const s = String(v).trim();
    return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function validateSingle(card, idx) {
    const errors = [];
    if (!card || typeof card !== 'object' || Array.isArray(card)) {
        return { ok: false, errors: [{ path: `[${idx}]`, msg: 'not an object' }] };
    }

    const out = {};

    // name — short string, required
    out.name = asShortString(card.name, 60);
    if (!out.name) errors.push({ path: `[${idx}].name`, msg: 'missing or empty' });

    // risk_tier — enum
    const tier = String(card.risk_tier || '').trim().toLowerCase();
    if (RISK_TIERS.includes(tier)) {
        out.risk_tier = tier;
    } else {
        errors.push({ path: `[${idx}].risk_tier`, msg: `must be one of ${RISK_TIERS.join('|')}, got "${card.risk_tier}"` });
    }

    // eta_hours — int 24..168 (with coercion + clamp)
    const eta = asInt(card.eta_hours, null);
    if (eta == null) {
        errors.push({ path: `[${idx}].eta_hours`, msg: 'must be an integer' });
    } else {
        out.eta_hours = clamp(eta, 6, 240);  // be generous; clamp at hard sanity bounds
    }

    // blue_casualty_p50, p90 — int 0..39
    const p50 = asInt(card.blue_casualty_p50, null);
    const p90 = asInt(card.blue_casualty_p90, null);
    if (p50 == null) errors.push({ path: `[${idx}].blue_casualty_p50`, msg: 'must be an integer' });
    else             out.blue_casualty_p50 = clamp(p50, 0, 39);
    if (p90 == null) errors.push({ path: `[${idx}].blue_casualty_p90`, msg: 'must be an integer' });
    else             out.blue_casualty_p90 = clamp(p90, 0, 39);
    if (out.blue_casualty_p50 != null && out.blue_casualty_p90 != null
        && out.blue_casualty_p90 < out.blue_casualty_p50) {
        // Soft repair: bump p90 up to p50 (a single point estimate is better
        // than rejecting the whole card over inverted percentiles).
        out.blue_casualty_p90 = out.blue_casualty_p50;
    }

    // rationale — short string
    out.rationale = asShortString(card.rationale, 400);
    if (!out.rationale) errors.push({ path: `[${idx}].rationale`, msg: 'missing or empty' });

    // key_assumptions — array of 1-6 short strings
    const ka = asArray(card.key_assumptions)
        .map(s => asShortString(s, 140))
        .filter(Boolean)
        .slice(0, 6);
    if (ka.length === 0) {
        // Some weaker models drop this entirely. Soft repair: empty array
        // is allowed but flagged in errors so the agent can log it.
        out.key_assumptions = [];
    } else {
        out.key_assumptions = ka;
    }

    // plan — array of 3-7 short strings (required)
    const plan = asArray(card.plan)
        .map(s => asShortString(s, 200))
        .filter(Boolean);
    if (plan.length < 2) {
        errors.push({ path: `[${idx}].plan`, msg: `must have at least 2 steps, got ${plan.length}` });
    } else {
        out.plan = plan.slice(0, 10);  // generous cap
    }

    // decision_points — optional array of { at_hour, trigger, branch_if_not }
    if (card.decision_points != null) {
        const dps = asArray(card.decision_points)
            .map((d) => {
                if (!d || typeof d !== 'object') return null;
                const at = asInt(d.at_hour, null);
                const trig = asShortString(d.trigger, 120);
                const branch = asShortString(d.branch_if_not, 120);
                if (at == null || !trig) return null;
                return { at_hour: clamp(at, 0, 240), trigger: trig, branch_if_not: branch };
            })
            .filter(Boolean)
            .slice(0, 4);
        if (dps.length) out.decision_points = dps;
    }

    return { ok: errors.length === 0, errors, repaired: out };
}

/**
 * Validate a parsed COA response. The LLM is asked for a JSON array;
 * `parsed` is the result of JSON.parse on the model output (after fence-
 * stripping in the client). Lone objects are tolerated by wrapping into
 * an array (some models return a single plan when they should return many).
 */
function validateCoaArray(parsed) {
    if (parsed == null) {
        return { ok: false, plans: [], dropped: [], errors: [{ path: 'root', msg: 'null parsed value' }] };
    }
    let arr;
    if (Array.isArray(parsed)) {
        arr = parsed;
    } else if (typeof parsed === 'object' && Array.isArray(parsed.coas)) {
        // Some models wrap in { coas: [...] } — accept it.
        arr = parsed.coas;
    } else if (typeof parsed === 'object' && Array.isArray(parsed.plans)) {
        arr = parsed.plans;
    } else if (typeof parsed === 'object') {
        // Lone object — wrap so we can still report it as 1 plan.
        arr = [parsed];
    } else {
        return { ok: false, plans: [], dropped: [], errors: [{ path: 'root', msg: 'response is not an array or object' }] };
    }

    const plans = [];
    const dropped = [];
    const allErrors = [];

    arr.forEach((card, idx) => {
        const r = validateSingle(card, idx);
        if (r.ok) {
            plans.push(r.repaired);
        } else if (r.repaired && r.repaired.name && r.repaired.plan && r.repaired.plan.length >= 2) {
            // Partial: enough core fields to render a degraded card. Keep it
            // but flag the errors so the operator/log knows it's imperfect.
            plans.push({ ...r.repaired, _partial: true, _errors: r.errors });
            allErrors.push(...r.errors);
        } else {
            dropped.push({ idx, card, errors: r.errors });
            allErrors.push(...r.errors);
        }
    });

    if (plans.length === 0) {
        return { ok: false, plans, dropped, errors: allErrors.length ? allErrors : [{ path: 'root', msg: 'no usable plans extracted' }] };
    }

    return { ok: true, plans, dropped, errors: allErrors };
}

module.exports = {
    RISK_TIERS,
    REQUIRED_KEYS,
    validateCoaArray,
    // Exposed for unit tests:
    asInt,
    asArray,
    asShortString,
    clamp,
    validateSingle,
};
