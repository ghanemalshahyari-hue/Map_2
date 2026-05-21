/**
 * AI adjudicator agent.
 *
 * Per-step pipeline:
 *   1. Build scenario constants block + compressed prev state block.
 *   2. Compose system + user prompt; call ollama.generate(format:'json').
 *   3. Parse JSON via extractJson (reused from red-team-agent).
 *   4. Validate via adjudicator-validator (3 layers; structural / monotonicity / plausibility).
 *   5. On structural failure: retry once with corrective prompt.
 *   6. On unrecoverable failure: fall back to scenario *_baseline values.
 *
 * `mockMode = true` skips Ollama entirely and returns the baseline. Used for
 * end-to-end testing without a live model and for the Monte Carlo runner's
 * regression suite.
 *
 * The function does NOT manage trial loops or multi-step chains. It resolves
 * exactly one step transition: (scenario, prevState, stepIndex) -> nextState.
 * The Monte Carlo runner walks the 12 steps and decides what to log.
 */

'use strict';

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const aiProvider   = require('./ai-provider');
const aiCfg        = require('./ai-config');
const loader       = require('./scenario-loader');
const schema       = require('./adjudicator-schema');
const validator    = require('./adjudicator-validator');
const learningStore = require('./learning-store');
const { extractJson } = require('./red-team-agent');

// 12-char fingerprint of a system prompt — small enough to log into every
// step row, long enough to detect drift if the file is edited (item #4).
function shortHash(s) {
    return crypto.createHash('sha256').update(String(s || ''), 'utf8').digest('hex').slice(0, 12);
}

const SYSTEM_PROMPT = fs.readFileSync(
    path.join(__dirname, 'prompts', 'adjudicator-system.txt'),
    'utf8',
).trim();
const SYSTEM_PROMPT_HASH = shortHash(SYSTEM_PROMPT);

// Claude-specific variant with XML tags for better adherence and to
// structure the cached prefix cleanly. Same doctrine + output contract
// as adjudicator-system.txt; the wrapping helps Claude parse the rules
// and lets us mark this whole block as prompt-cached on every call.
const SYSTEM_PROMPT_CLAUDE = (function loadClaudePrompt() {
    try {
        return fs.readFileSync(
            path.join(__dirname, 'prompts', 'adjudicator-system-claude.txt'),
            'utf8',
        ).trim();
    } catch (e) {
        // If the Claude prompt file is missing, fall back to the original.
        // Better degraded operation than a load-time crash.
        return SYSTEM_PROMPT;
    }
})();
const SYSTEM_PROMPT_CLAUDE_HASH = shortHash(SYSTEM_PROMPT_CLAUDE);

// 8 paraphrase hints rotated across trials. (trialHintId mod 8)
// Hint 0 is empty so the canonical run with hintId=0 has no extra signal.
const TRIAL_HINTS = [
    '',
    'this trial: weather lightly degrades night operations.',
    'this trial: one BLS sees an unexpected obstacle in the surf zone.',
    'this trial: Blue artillery is more accurate than baseline.',
    'this trial: RED_405EW receives a sea-launched counter-strike at H+24.',
    'this trial: pipeline integrity holds; logistics state stays Building longer.',
    'this trial: 9 MID sustains heavier wave-3 attrition.',
    'this trial: c121 posture is more aggressive than baseline.',
];

const DEFAULT_COA = Object.freeze({
    reserve_commit_hour: 72,
    posture:             'deliberate',
    main_effort_axis:    'BLS-3',
});

const DEFAULT_OLLAMA_OPTIONS = Object.freeze({
    // Keep this contract-style task deterministic. Higher sampling made
    // small local models repeat nested JSON until the response was cut off.
    temperature:    0.15,
    top_p:          0.85,
    repeat_penalty: 1.12,
    num_predict:    3000,
    keep_alive:     '30m',
});

const DEFAULT_TIMEOUT_MS = 180000;

// ── Prompt assembly ──────────────────────────────────────────────────
function buildScenarioConstantsBlock(scenario, coaParams) {
    const coa = { ...DEFAULT_COA, ...(coaParams || {}) };

    const blsLines = scenario.bls_template.map((b) => (
        `  ${b.name} (${b.role}, nominal ${b.throughput} coy-eq/24h, terrain_friction ${b.terrain_friction}` +
        // Doctrine flag (item #11): scenario JSON marks BLSes that can
        // never become a clean SECURE heavy-throughput beach. Prompt
        // wording stays "PERMANENTLY LIMITED" for back-compat with the
        // existing system prompt's vocabulary; validator also enforces.
        (b.permanently_limited ? ', PERMANENTLY LIMITED' : '') +
        ')'
    )).join('\n');

    const redLines = scenario.red_units.map((u) => (
        `  ${u.uid.padEnd(13)} ${u.label.padEnd(11)} (${u.role}, ${u.echelon}, ${u.bls}, appears step ${u.appear})`
    )).join('\n');

    const blueDiv  = scenario.blue_units_base_ids.filter(id => /^lc$/.test(id));
    const blueBde  = scenario.blue_units_base_ids.filter(id => /^b\dc$/.test(id));
    const blueBn   = scenario.blue_units_base_ids.filter(id => /^p\d{2}c$/.test(id));
    const blueCoy  = scenario.blue_units_base_ids.filter(id => /^c\d{3}$/.test(id));
    const hasLegacyBlueHierarchy = blueDiv.length || blueBde.length || blueBn.length || blueCoy.length;
    const blueGenericLines = (scenario.blue_units_initial || []).map((u) => (
        `  ${(u.unit_uid || u.base_id || '?').padEnd(16)} (${u.echelon || 'unit'})`
    )).join('\n');

    const phaseLines = scenario.phase_table.map((p) => (
        `  step ${String(p.index).padStart(2,' ')} ${p.time_label.padEnd(6)} ${p.phase}`
    )).join('\n');

    // Parametric SCENARIO header — derives step count and start/end labels
    // from the scenario itself so non-wargame2 operations (e.g. 6-step
    // template, 18-step long-campaign) describe themselves correctly.
    const stepCount  = Array.isArray(scenario.steps) ? scenario.steps.length : 0;
    const firstLabel = scenario.phase_table && scenario.phase_table[0]              && scenario.phase_table[0].time_label              || 'start';
    const lastLabel  = scenario.phase_table && scenario.phase_table[stepCount - 1] && scenario.phase_table[stepCount - 1].time_label || 'end';
    return [
        `SCENARIO: ${scenario.scenario_label}, ${stepCount} steps ${firstLabel}..${lastLabel}.`,
        `OBJ ${scenario.obj.name}: coord ~[${scenario.obj.coord[0].toFixed(3)}, ${scenario.obj.coord[1].toFixed(3)}], CARVER ${scenario.obj.carver}/60, depth ${scenario.obj.target_depth_km} km.`,
        `BLS:\n${blsLines}`,
        `RED OOB (${scenario.red_units.length} markers, strength in [0,1]):\n${redLines}`,
        hasLegacyBlueHierarchy
            ? `BLUE OOB (${scenario.blue_units_base_ids.length} units, unit_uid = "BLUE_<base id>"):\n` +
              `  div:        ${blueDiv.join(', ')}\n` +
              `  brigades:   ${blueBde.join(', ')}\n` +
              `  battalions: ${blueBn.join(', ')}\n` +
              `  companies:  ${blueCoy.join(', ')}`
            : `BLUE OOB (${scenario.blue_units_base_ids.length} units, unit_uid = scenario blue unit_uid):\n${blueGenericLines}`,
        `PHASE TABLE:\n${phaseLines}`,
        `BLUE COA PARAMS for this trial:`,
        `  blue_reserve_commit_hour: ${coa.reserve_commit_hour}`,
        `  blue_posture:             ${coa.posture}`,
        `  blue_main_effort_axis:    ${coa.main_effort_axis}`,
        `  weather:                 ${coa.weather || 'clear'}`,
        scenario.terrain_note ? `TERRAIN NOTE: ${scenario.terrain_note}` : '',
    ].filter(Boolean).join('\n\n');
}

function compressPrevState(prev) {
    // ~400 tokens of state info, NO geometry. The model only needs to roll
    // the simulation forward; geometry is reconstructed downstream from
    // unit_uid + status by the client.
    return {
        step_index:        prev.step_index,
        time_label:        prev.time_label,
        phase:             prev.phase,
        phase_line_km:     prev.phase_line_km,
        objective_status:  prev.objective_status,
        force_ratio:       prev.force_ratio,
        ew_effect:         prev.ew_effect,
        logistics_state:   prev.logistics_state,
        decision_point:    prev.decision_point,
        bls_status:        prev.bls_status,
        red_active_markers:prev.red_active_markers,
        losses_cumulative: prev.losses_cumulative,
        blue_destroyed_uids:    prev.blue_destroyed_cumulative || [],
        red_unit_strengths:     prev.red_strength_current      || {},
    };
}

// Render the per-side approved-action list as a compact, prompt-friendly
// block. Each line is one MOVE/ENGAGE/HOLD with target coords or unit id
// plus a short rationale when the operator supplied one. Empty lists
// render as "(none)" so the model always sees BOTH side headers.
function formatApprovedActionsBlock(approvedActions) {
    const red  = (approvedActions && Array.isArray(approvedActions.red))  ? approvedActions.red  : [];
    const blue = (approvedActions && Array.isArray(approvedActions.blue)) ? approvedActions.blue : [];
    if (red.length === 0 && blue.length === 0) {
        return '(none — resolve from posture and prior state)';
    }
    const fmt = (a) => {
        const type = String(a && a.type || '').toUpperCase();
        const unit = a && a.unitId ? a.unitId : '?';
        let detail = '';
        if (type === 'MOVE' && Array.isArray(a.to) && a.to.length === 2) {
            detail = ` → [${Number(a.to[0]).toFixed(4)}, ${Number(a.to[1]).toFixed(4)}]`;
        } else if (type === 'ENGAGE' && a.target) {
            detail = ` → ${a.target}`;
        }
        const why = (a && a.reason) ? ` (${String(a.reason).slice(0, 100)})` : '';
        return `  - ${type} ${unit}${detail}${why}`;
    };
    const lines = [];
    lines.push('Red side — operator-approved this step:');
    lines.push(red.length ? red.map(fmt).join('\n')  : '  (none)');
    lines.push('Blue side — operator-approved this step:');
    lines.push(blue.length ? blue.map(fmt).join('\n') : '  (none)');
    return lines.join('\n');
}

// Render the priors aggregate as a compact prompt block. Returns the
// empty string when no past matching runs exist — the caller then
// omits the LEARNED PRIORS section entirely (cold-start prompt stays
// clean). Format intentionally terse: tabular, no prose, so the
// model reads the numbers and not opinionated narration.
function formatLearnedPriorsBlock(priors) {
    // Past trials, operator feedback, OR AAR lessons can populate the block.
    if (!priors) return '';
    const hasTrials = priors.trialsSampled > 0;
    const hasFb     = priors.operatorFeedback && priors.operatorFeedback.total > 0;
    const hasLessons = Array.isArray(priors.lessons) && priors.lessons.length > 0;
    if (!hasTrials && !hasFb && !hasLessons) return '';

    const filt = priors.coaFilter
        ? `posture=${priors.coaFilter.posture}, reserve_hr=${priors.coaFilter.reserve_commit_hour}`
        : 'any';

    const lines = [];
    if (hasTrials) {
        const outcome = Object.entries(priors.outcomePct || {})
            .filter(([, v]) => v > 0)
            .sort((a, b) => b[1] - a[1])
            .map(([k, v]) => `${k} ${v}%`)
            .join(', ');
        const fmtStat = (s, unit) => {
            if (!s) return '(n/a)';
            const u = unit ? ` ${unit}` : '';
            return `median ${s.median.toFixed(1)}${u} (p25 ${s.p25.toFixed(1)}, p75 ${s.p75.toFixed(1)}, n ${s.n})`;
        };
        const reasons = (priors.fallbackReasonsTop || [])
            .map(r => `${r.count}×${r.reason}`)
            .join(', ');
        lines.push(
            `Across ${priors.trialsSampled} past trial(s) on this scenario (filter: ${filt}, ${priors.runsSampled} run(s)):`,
            `  Outcomes:           ${outcome || '(none)'}`,
            `  Final phase line:   ${fmtStat(priors.finalPhaseLineKm, 'km')}`,
            `  Blue destroyed:     ${fmtStat(priors.finalBlueDestroyed, 'of 39')}`,
            `  Red coy-eq losses:  ${fmtStat(priors.finalRedCoyEqLosses)}`,
            `  Model reliability:  ${priors.schemaOkRate}% schema_ok across ${priors.trialsSampled * 11} resolved steps`,
            reasons ? `  Top failure modes:  ${reasons}` : '  Top failure modes:  (none recorded)',
        );
    } else {
        lines.push(`No past trials yet on this scenario (filter: ${filt}).`);
    }

    // Operator feedback (item #9).
    if (hasFb) {
        const f = priors.operatorFeedback;
        const accRej = f.accept + f.reject;
        const pctText = (accRej > 0) ? `${f.operatorAcceptPct}% accept` : 'commentary only';
        const noteText = f.note ? `, ${f.note} note(s)` : '';
        lines.push(`  Operator feedback:  ${pctText} of ${accRej} graded step(s)${noteText}`);
    }

    // AAR lessons (item #5) — operator-written after-action lessons.
    if (hasLessons) {
        for (const l of priors.lessons.slice(0, 3)) {
            const cat = l.category ? `[${l.category}]` : '';
            const nar = l.narrative ? `: ${l.narrative.slice(0, 200)}` : '';
            lines.push(`  AAR ${cat} ${l.title}${nar}`);
        }
        if (priors.lessons.length > 3) {
            lines.push(`  AAR — ${priors.lessons.length - 3} more lesson(s) not shown.`);
        }
    }

    lines.push(
        `  These are observed priors from past trials — they describe what tends to happen, not what MUST happen for this run.`,
    );
    return lines.join('\n');
}

function buildJsonGuardrailsBlock(scenario) {
    const blsKeys = scenario.bls_template.map(b => `"${b.name}"`).join(', ');
    return [
        'Return exactly one complete JSON object.',
        'Do not include markdown, comments, copied prompt text, or a second JSON object.',
        'Do not repeat or nest the output object inside confidence_per_field.',
        'Use only the output keys from the contract; do not emit blue_destroyed_uids or red_unit_strengths.',
        `bls_status must include exactly these keys: ${blsKeys}.`,
        'per_unit_deltas must be { "blue_destroyed": [], "red_degraded": [] } when there are no losses.',
        'confidence_per_field values must be only "high", "medium", or "low".',
    ].join('\n');
}

function buildUserPrompt(scenario, stepIndex, prevState, trialId, trialSeed, hint, coaParams, approvedActions, priors) {
    const constants = buildScenarioConstantsBlock(scenario, coaParams);
    const phaseRow  = scenario.phase_table[stepIndex];
    const proposed  = formatApprovedActionsBlock(approvedActions);
    const priorsBlock = formatLearnedPriorsBlock(priors);

    const parts = [
        '=== SCENARIO CONSTANTS ===',
        constants,
        '',
        '=== PREVIOUS STEP STATE ===',
        JSON.stringify(compressPrevState(prevState), null, 2),
        '',
        '=== RESOLVE THIS STEP ===',
        `step_index:    ${stepIndex}`,
        `time_label:    ${phaseRow.time_label}`,
        `elapsed_hours: ${phaseRow.elapsed_hours}`,
        `phase:         ${phaseRow.phase}`,
        `trial_id:      ${trialId || 'manual'}`,
        `trial_seed:    ${trialSeed}`,
        `trial_hint:    ${hint || '(none)'}`,
        '',
        '=== PROPOSED ACTIONS ===',
        proposed,
        '',
        '=== JSON GUARDRAILS ===',
        buildJsonGuardrailsBlock(scenario),
    ];
    if (priorsBlock) {
        parts.push('', '=== LEARNED PRIORS ===', priorsBlock);
    }
    parts.push('', `Resolve step ${stepIndex}. Respond with the JSON object only.`);
    return parts.join('\n');
}

function buildCorrectivePrompt(prevPrompt, errors) {
    const errText = errors.slice(0, 8).map(e => `  - ${e.path}: ${e.msg}`).join('\n');
    return [
        prevPrompt,
        '',
        '=== PREVIOUS RESPONSE FAILED VALIDATION ===',
        errText,
        '',
        'Re-emit one complete JSON object from scratch. Do not copy the previous response structure if it repeated fields.',
        'Do not include blue_destroyed_uids, red_unit_strengths, markdown, comments, or prose outside JSON.',
        'Keep confidence_per_field as a flat object of confidence labels only.',
        'Respond with JSON only.',
    ].join('\n');
}

// ── Seeding ──────────────────────────────────────────────────────────
function deriveSeed(trialSeed, stepIndex) {
    // trialSeed can be a string ("run-XYZ:t42") or a number. We need a 32-bit
    // int for Ollama's `options.seed`. Hash the string to a stable int.
    let n;
    if (typeof trialSeed === 'number' && Number.isFinite(trialSeed)) {
        n = Math.abs(Math.trunc(trialSeed));
    } else {
        const s = String(trialSeed || 'default');
        let h = 2166136261; // FNV-1a 32-bit
        for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        n = (h >>> 0);
    }
    return ((n * 1000) + stepIndex) >>> 0;
}

// ── Result helpers ───────────────────────────────────────────────────
function fallbackResult(scenario, stepIndex, prevState, meta, why, extra, userPrompt, coaParams) {
    const baseline = schema.baselineStateForStep(scenario, stepIndex, prevState, coaParams);
    return {
        ok: false,
        stepIndex,
        state: baseline,
        validation: {
            schema_ok: false,
            fallback:  why,
            ...(extra || {}),
        },
        meta: { ...meta, fallback: why },
        // userPrompt preserved on fallback too so trial logs capture what
        // we *asked* even when the model failed (item #4 debug pipeline).
        userPrompt: userPrompt || null,
    };
}

function tryParse(responseText) {
    if (!responseText) return null;
    try { return JSON.parse(responseText); } catch (e) { /* fall through */ }
    const extracted = extractJson(responseText);
    if (!extracted) return null;
    try { return JSON.parse(extracted); } catch (e) { return null; }
}

function isObj(v) {
    return v && typeof v === 'object' && !Array.isArray(v);
}

function toFiniteNumber(v) {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '') {
        const n = Number(v);
        if (Number.isFinite(n)) return n;
    }
    return null;
}

function isNonEmptyString(v) {
    return typeof v === 'string' && v.trim() !== '';
}

function clampInt(n, lo, hi) {
    return Math.max(lo, Math.min(hi, Math.round(n)));
}

function normalizeConfidence(value, fallback, fields) {
    const allowed = new Set(['high', 'medium', 'low']);
    const keys = ['phase_line_km', 'force_ratio', 'objective_status', 'ew_effect', 'bls_status', 'per_unit_deltas'];
    const out = {};
    const src = isObj(value) ? value : {};
    for (const key of keys) {
        if (allowed.has(src[key])) out[key] = src[key];
        else {
            out[key] = fallback[key] || 'medium';
            if (value !== undefined) fields.push(`confidence_per_field.${key}`);
        }
    }
    return out;
}

function normalizeBlueUid(raw, blueAliases) {
    if (!isNonEmptyString(raw)) return null;
    return blueAliases.get(raw.trim()) || null;
}

function normalizeRedDeltaEntry(entry, prevStrength, redValid) {
    if (!isObj(entry)) return null;
    const uid = isNonEmptyString(entry.unit_uid) ? entry.unit_uid.trim() : '';
    if (!redValid.has(uid)) return null;
    const prev = toFiniteNumber(prevStrength[uid]);
    const strength = toFiniteNumber(entry.strength_current);
    const safeStrength = strength == null
        ? (prev == null ? 0.7 : Math.min(prev, 0.7))
        : Math.max(0, Math.min(1, strength));
    const status = schema.RED_UNIT_STATUS.includes(entry.status) ? entry.status : 'DEGRADED';
    return { unit_uid: uid, strength_current: safeStrength, status };
}

function normalizeModelDelta(delta, prevState, scenario, stepIndex, coaParams) {
    if (!isObj(delta)) return { delta, fields: [] };

    const fields = [];
    const baseline = schema.baselineStateForStep(scenario, stepIndex, prevState, coaParams);
    const out = {
        ...baseline,
        bls_status: { ...baseline.bls_status },
        losses_step: { ...baseline.losses_step },
        losses_cumulative: { ...baseline.losses_cumulative },
        per_unit_deltas: {
            blue_destroyed: baseline.per_unit_deltas.blue_destroyed.slice(),
            red_degraded: baseline.per_unit_deltas.red_degraded.map(e => ({ ...e })),
        },
        blue_actions: { ...(baseline.blue_actions || {}) },
        confidence_per_field: { ...baseline.confidence_per_field },
        red_strength_current: { ...(baseline.red_strength_current || {}) },
        blue_destroyed_cumulative: baseline.blue_destroyed_cumulative.slice(),
    };

    const expectedMeta = schema.scenarioStepMeta(scenario, stepIndex);
    out.step_index = stepIndex;
    out.time_label = expectedMeta.time_label;
    out.elapsed_hours = expectedMeta.elapsed_hours;
    out.phase = expectedMeta.phase;
    // Pass through the W3-rich producer's native phase label so the HUD
    // can display "PHASE 1 (h_hour_strike)" without polluting the legacy
    // `phase` field.
    if (expectedMeta.kind_native) out.kind_native = expectedMeta.kind_native;
    // Pass through the W3-rich per-step baselines so the renderer can read
    // them off `state` directly. These are ground-truth source data — the
    // LLM is not allowed to invent them, only the deltas it returns. See
    // docs/wargame3-schema.md for the full W3 per-step contract.
    const stepRow = Array.isArray(scenario && scenario.steps) ? scenario.steps[stepIndex] : null;
    if (stepRow) {
        if (Array.isArray(stepRow.affected))        out.affected        = stepRow.affected;
        if (Array.isArray(stepRow.actors))          out.actors          = stepRow.actors;
        if (Array.isArray(stepRow.engagement_arcs)) out.engagement_arcs = stepRow.engagement_arcs;
        if (stepRow.unit_state && typeof stepRow.unit_state === 'object') out.unit_state = stepRow.unit_state;
        if (stepRow.combined_effect)                out.combined_effect         = stepRow.combined_effect;
        if (Number.isFinite(stepRow.force_ratio_local))       out.force_ratio_local       = stepRow.force_ratio_local;
        if (Number.isFinite(stepRow.force_ratio_operational)) out.force_ratio_operational = stepRow.force_ratio_operational;
        if (stepRow.step_advantage)                 out.step_advantage          = stepRow.step_advantage;
        if (stepRow.phase_name_ar)                  out.phase_name_ar           = stepRow.phase_name_ar;
    }

    const phaseLine = toFiniteNumber(delta.phase_line_km);
    if (phaseLine != null) out.phase_line_km = phaseLine;
    else if (delta.phase_line_km !== undefined) fields.push('phase_line_km');

    if (schema.OBJECTIVE_STATUS.includes(delta.objective_status)) out.objective_status = delta.objective_status;
    else if (delta.objective_status !== undefined) fields.push('objective_status');

    if (isNonEmptyString(delta.force_ratio)) out.force_ratio = delta.force_ratio.trim().slice(0, 100);
    else if (delta.force_ratio !== undefined) fields.push('force_ratio');

    if (schema.EW_BANDS.includes(delta.ew_effect)) out.ew_effect = delta.ew_effect;
    else if (delta.ew_effect !== undefined) fields.push('ew_effect');

    if (isNonEmptyString(delta.logistics_state)) out.logistics_state = delta.logistics_state.trim().slice(0, 120);
    else if (delta.logistics_state !== undefined) fields.push('logistics_state');

    if (isNonEmptyString(delta.decision_point)) out.decision_point = delta.decision_point.trim().slice(0, 80);
    else if (delta.decision_point !== undefined) fields.push('decision_point');

    if (isNonEmptyString(delta.narrative_ar) && /[\u0600-\u06FF]/.test(delta.narrative_ar)) {
        out.narrative_ar = delta.narrative_ar.trim();
    } else if (delta.narrative_ar !== undefined) {
        fields.push('narrative_ar');
    }

    if (isNonEmptyString(delta.narrative_en)) out.narrative_en = delta.narrative_en.trim();
    else if (delta.narrative_en !== undefined) fields.push('narrative_en');

    if (isObj(delta.bls_status)) {
        for (const name of schema.blsNames(scenario)) {
            if (schema.BLS_STATUS.includes(delta.bls_status[name])) out.bls_status[name] = delta.bls_status[name];
            else fields.push(`bls_status.${name}`);
        }
    } else if (delta.bls_status !== undefined) {
        fields.push('bls_status');
    }

    const blueAliases = schema.blueUidAliasMap(scenario);
    const prevDestroyed = new Set((prevState && prevState.blue_destroyed_cumulative) || []);
    const rawBlue = isObj(delta.per_unit_deltas) && Array.isArray(delta.per_unit_deltas.blue_destroyed)
        ? delta.per_unit_deltas.blue_destroyed
        : (Array.isArray(delta.blue_destroyed_uids) ? delta.blue_destroyed_uids : null);
    if (rawBlue) {
        const next = [];
        for (const raw of rawBlue) {
            const uid = normalizeBlueUid(raw, blueAliases);
            if (uid && !prevDestroyed.has(uid) && !next.includes(uid)) next.push(uid);
            else fields.push('per_unit_deltas.blue_destroyed');
        }
        out.per_unit_deltas.blue_destroyed = next;
    } else if (delta.blue_destroyed_uids !== undefined || (isObj(delta.per_unit_deltas) && delta.per_unit_deltas.blue_destroyed !== undefined)) {
        fields.push('per_unit_deltas.blue_destroyed');
    }

    const redValid = schema.redUidSet(scenario);
    const prevStrength = (prevState && prevState.red_strength_current) || schema.blankRedStrengths(scenario);
    const rawRed = isObj(delta.per_unit_deltas) && Array.isArray(delta.per_unit_deltas.red_degraded)
        ? delta.per_unit_deltas.red_degraded
        : null;
    if (rawRed) {
        const next = [];
        const seen = new Set();
        for (const entry of rawRed) {
            const normalized = normalizeRedDeltaEntry(entry, prevStrength, redValid);
            if (normalized && !seen.has(normalized.unit_uid)) {
                next.push(normalized);
                seen.add(normalized.unit_uid);
            } else {
                fields.push('per_unit_deltas.red_degraded');
            }
        }
        out.per_unit_deltas.red_degraded = next;
    } else if (isObj(delta.red_unit_strengths)) {
        const next = [];
        for (const uid of redValid) {
            const strength = toFiniteNumber(delta.red_unit_strengths[uid]);
            const prev = toFiniteNumber(prevStrength[uid]);
            if (strength != null && prev != null && strength < prev) {
                next.push({ unit_uid: uid, strength_current: Math.max(0, Math.min(1, strength)), status: 'DEGRADED' });
            }
        }
        out.per_unit_deltas.red_degraded = next;
        fields.push('per_unit_deltas.red_degraded');
    } else if (isObj(delta.per_unit_deltas) && delta.per_unit_deltas.red_degraded !== undefined) {
        fields.push('per_unit_deltas.red_degraded');
    }

    const blueStep = out.per_unit_deltas.blue_destroyed.length;
    const prevBlueDestroyed = prevState && prevState.losses_cumulative
        ? prevState.losses_cumulative.blue_destroyed
        : 0;
    out.losses_step.blue = blueStep;
    out.losses_cumulative.blue_destroyed = prevBlueDestroyed + blueStep;
    out.losses_cumulative.blue_total = scenario.blue_units_base_ids.length;
    out.losses_cumulative.red_aggregate_markers = scenario.red_units.length;

    const prevRedLoss = prevState && prevState.losses_cumulative
        ? toFiniteNumber(prevState.losses_cumulative.red_company_equivalent) || 0
        : 0;
    const redLoss = isObj(delta.losses_cumulative)
        ? toFiniteNumber(delta.losses_cumulative.red_company_equivalent)
        : null;
    const redLossFromStep = isObj(delta.losses_step)
        ? toFiniteNumber(delta.losses_step.red_company_equivalent_cumulative)
        : null;
    const safeRedLoss = Math.max(
        prevRedLoss,
        redLoss != null ? redLoss : (redLossFromStep != null ? redLossFromStep : out.losses_cumulative.red_company_equivalent),
    );
    out.losses_step.red_company_equivalent_cumulative = safeRedLoss;
    out.losses_cumulative.red_company_equivalent = safeRedLoss;

    const active = toFiniteNumber(delta.red_active_markers);
    if (active != null) out.red_active_markers = clampInt(active, 0, scenario.red_units.length);
    else if (delta.red_active_markers !== undefined) fields.push('red_active_markers');

    if (isObj(delta.blue_actions)) out.blue_actions = { ...delta.blue_actions };

    out.confidence_per_field = normalizeConfidence(delta.confidence_per_field, out.confidence_per_field, fields);
    if (isNonEmptyString(delta.notes)) out.notes = delta.notes.trim().slice(0, 200);

    return { delta: out, fields: Array.from(new Set(fields)) };
}

function prepareDeltaForValidation(parsed, prevState, scenario, stepIndex, meta, coaParams) {
    const prepared = normalizeModelDelta(parsed, prevState, scenario, stepIndex, coaParams);
    if (prepared.fields.length) {
        meta.normalizedFields = Array.from(new Set([
            ...(meta.normalizedFields || []),
            ...prepared.fields,
        ])).slice(0, 50);
    }
    return prepared.delta;
}

// ── Main entry ───────────────────────────────────────────────────────
/**
 * Resolve one step transition.
 *
 * Arguments (object):
 *   scenario      — loaded scenario JSON; default: loader.getDefaultScenario()
 *   stepIndex     — 1..(scenario.steps.length - 1); step 0 is the seed
 *   prevState     — output of the previous adjudicateStep, or freshState() for step 1
 *   trialId       — string trial identifier (e.g. "run-xyz:t42")
 *   trialSeed     — string or int; combined with stepIndex into the LLM seed
 *   trialHintId   — int 0..7; selects a paraphrase hint
 *   coaParams     — { reserve_commit_hour, posture, main_effort_axis }
 *   model         — Ollama model override; default from ai-config.js
 *   timeoutMs     — per-call timeout; default 180000
 *   mockMode      — true → skip Ollama and return scenario baseline
 *
 * Returns:
 *   { ok, stepIndex, state, validation, meta }
 *   `state` is ALWAYS populated (live result on ok, baseline on fallback)
 *   so the caller's trial loop can keep marching forward.
 */
async function adjudicateStep(args) {
    args = args || {};
    const scenario   = args.scenario || loader.getDefaultScenario();
    const stepIndex  = args.stepIndex;
    // Parametric step range: each scenario decides how many steps it has
    // (validator allows 4-20). The hardcoded fallback only fires when scenario
    // is malformed; loader will have rejected it long before we get here.
    const maxStepIndex = Math.max(0, (Array.isArray(scenario.steps) ? scenario.steps.length : 12) - 1);
    if (!Number.isInteger(stepIndex) || stepIndex < 0 || stepIndex > maxStepIndex) {
        throw new Error(`adjudicateStep: stepIndex must be 0..${maxStepIndex} for this scenario, got ${stepIndex}`);
    }

    const prevState   = args.prevState || schema.freshState(scenario);
    const trialId     = args.trialId || 'manual';
    const trialSeed   = (args.trialSeed != null) ? args.trialSeed : trialId;
    const trialHintId = Number.isInteger(args.trialHintId) ? args.trialHintId : 0;
    const coaParams   = args.coaParams || DEFAULT_COA;
    const model       = args.model || undefined;
    const timeoutMs   = args.timeoutMs || DEFAULT_TIMEOUT_MS;
    const mockMode    = args.mockMode === true;
    const approvedActions = args.approvedActions || null;
    const requestedProvider = args.provider || null;

    // Resolve provider once so the retry path uses the same backend (we
    // don't want half-Claude / half-Ollama trial logs). On 'claude' requested
    // without an API key we fall back to Ollama transparently.
    let providerName;
    try {
        providerName = aiProvider.resolveProvider(requestedProvider);
    } catch (e) {
        providerName = 'ollama';
    }
    const systemPrompt     = providerName === 'claude' ? SYSTEM_PROMPT_CLAUDE      : SYSTEM_PROMPT;
    const systemPromptHash = providerName === 'claude' ? SYSTEM_PROMPT_CLAUDE_HASH : SYSTEM_PROMPT_HASH;

    const start = Date.now();

    // ── Mock mode ─────────────────────────────────────────────────────
    if (mockMode) {
        // Item #8 — coaParams threads into baselineStateForStep so mock
        // replays vary with posture / reserve_commit_hour / axis.
        const repaired = schema.baselineStateForStep(scenario, stepIndex, prevState, coaParams);
        return {
            ok: true,
            stepIndex,
            state: repaired,
            validation: {
                schema_ok:             true,
                mocked:                true,
                clamped_fields:        [],
                doctrinal_warnings:    [],
                plausibility_warnings: [],
            },
            meta: {
                mockMode:    true,
                durationMs:  Date.now() - start,
                model:       'mock',
                trialId,
                trialSeed,
                trialHintId,
            },
        };
    }

    // ── Live Ollama path ──────────────────────────────────────────────
    const seed = deriveSeed(trialSeed, stepIndex);
    const hint = TRIAL_HINTS[trialHintId % TRIAL_HINTS.length];
    // Item #6 — learned priors. Computed once per step; failures (corrupt
    // mc-runs/ dir, etc.) degrade silently so adjudication still runs.
    let priors = null;
    try {
        priors = learningStore.computePriors({ scenarioName: scenario.name, coaParams });
    } catch (e) {
        priors = null;
    }
    const userPrompt = buildUserPrompt(scenario, stepIndex, prevState, trialId, seed, hint, coaParams, approvedActions, priors);

    const callOpts = { ...DEFAULT_OLLAMA_OPTIONS, seed };

    const baseMeta = {
        durationMs:   0,
        provider:     providerName,
        model:        model || (
                          providerName === 'claude' ? (aiCfg.claude && aiCfg.claude.defaultModel) || 'claude-default' :
                          providerName === 'zen'    ? (aiCfg.zen    && aiCfg.zen.defaultModel)    || 'zen-default'    :
                          aiCfg.defaultModel || 'qwen2.5:7b'
                      ),
        trialId,
        trialSeed,
        trialHintId,
        seed,
        // System prompt fingerprint — detects drift if the prompt file is
        // edited between runs (item #4 — every trial log should carry the
        // version of the prompt that produced it).
        systemPromptHash:  systemPromptHash,
        systemPromptChars: systemPrompt.length,
        promptChars:  userPrompt.length,
        responseChars:0,
        retries:      0,
        cacheReadTokens:     0,
        cacheCreationTokens: 0,
        // Snapshot of the learned-priors that shaped this step's prompt
        // (item #6). Null on cold start. Persists into the trial log so
        // we can ask later: "what priors did the model see at step N?"
        priorsApplied: priors,
    };

    let resp = await aiProvider.generate({
        provider: providerName,
        model,
        system:  systemPrompt,
        prompt:  userPrompt,
        format:  'json',
        options: callOpts,
        timeoutMs,
    });
    if (resp && resp.providerUsed) baseMeta.provider = resp.providerUsed;
    if (resp && resp.usage) {
        baseMeta.cacheReadTokens     += resp.usage.cache_read_input_tokens     || 0;
        baseMeta.cacheCreationTokens += resp.usage.cache_creation_input_tokens || 0;
    }

    if (!resp.ok) {
        baseMeta.durationMs = Date.now() - start;
        return fallbackResult(scenario, stepIndex, prevState, baseMeta, `${baseMeta.provider}_error`, { error: resp.error }, userPrompt, coaParams);
    }

    baseMeta.responseChars = (resp.response || '').length;
    // Hold on to the raw LLM text across the retry loop so we can persist
    // even malformed responses to the trial log (item #4 — invaluable for
    // debugging why a prompt change broke parsing weeks later).
    let lastRawText = resp.response || '';

    let parsed = tryParse(resp.response);
    let preparedDelta = parsed ? prepareDeltaForValidation(parsed, prevState, scenario, stepIndex, baseMeta, coaParams) : null;
    let val    = preparedDelta ? validator.validateStateDelta(preparedDelta, prevState, scenario, stepIndex) : null;

    // Retry once with corrective prompt if structural failure
    if ((!parsed || !val.ok) && (val == null || val.schema_errors.length > 0)) {
        baseMeta.retries = 1;
        const errors = val ? val.schema_errors : [{ path: 'root', msg: 'JSON parse failed' }];
        const corrective = buildCorrectivePrompt(userPrompt, errors);
        resp = await aiProvider.generate({
            provider: providerName,
            model,
            system:  systemPrompt,
            prompt:  corrective,
            format:  'json',
            options: callOpts,
            timeoutMs,
        });
        if (resp && resp.providerUsed) baseMeta.provider = resp.providerUsed;
        if (resp && resp.usage) {
            baseMeta.cacheReadTokens     += resp.usage.cache_read_input_tokens     || 0;
            baseMeta.cacheCreationTokens += resp.usage.cache_creation_input_tokens || 0;
        }
        if (!resp.ok) {
            baseMeta.durationMs = Date.now() - start;
            return fallbackResult(scenario, stepIndex, prevState, baseMeta, `${baseMeta.provider}_error_on_retry`, { error: resp.error }, userPrompt, coaParams);
        }
        baseMeta.responseChars += (resp.response || '').length;
        lastRawText = resp.response || lastRawText;
        parsed = tryParse(resp.response);
        preparedDelta = parsed ? prepareDeltaForValidation(parsed, prevState, scenario, stepIndex, baseMeta, coaParams) : null;
        val    = preparedDelta ? validator.validateStateDelta(preparedDelta, prevState, scenario, stepIndex) : null;
    }

    baseMeta.durationMs = Date.now() - start;

    if (!parsed) {
        return fallbackResult(scenario, stepIndex, prevState, baseMeta, 'parse_failed',
            { rawHead: lastRawText.slice(0, 200), rawText: lastRawText },
            userPrompt, coaParams);
    }
    if (!val.ok) {
        return fallbackResult(scenario, stepIndex, prevState, baseMeta, 'validation_failed',
            { schema_errors: val.schema_errors },
            userPrompt, coaParams);
    }

    return {
        ok: true,
        stepIndex,
        state: val.repaired,
        validation: {
            schema_ok:             true,
            clamped_fields:        val.clamped_fields,
            normalized_fields:     baseMeta.normalizedFields || [],
            doctrinal_warnings:    val.doctrinal_warnings,
            plausibility_warnings: val.plausibility_warnings,
        },
        meta: baseMeta,
        rawLlm:     parsed,      // parsed JSON the model emitted (item #4 trial logs)
        rawText:    lastRawText, // raw text — captures even pre-parse garbage
        userPrompt: userPrompt,  // exact user prompt this step was resolved with
    };
}

module.exports = {
    adjudicateStep,
    buildScenarioConstantsBlock,
    buildUserPrompt,
    formatApprovedActionsBlock,
    formatLearnedPriorsBlock,
    compressPrevState,
    deriveSeed,
    normalizeModelDelta,
    DEFAULT_COA,
    DEFAULT_OLLAMA_OPTIONS,
    DEFAULT_TIMEOUT_MS,
    TRIAL_HINTS,
    SYSTEM_PROMPT_TEXT:        SYSTEM_PROMPT,
    SYSTEM_PROMPT_HASH,
    SYSTEM_PROMPT_CLAUDE_TEXT: SYSTEM_PROMPT_CLAUDE,
    SYSTEM_PROMPT_CLAUDE_HASH,
};
