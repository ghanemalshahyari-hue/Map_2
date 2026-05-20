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

const ollama       = require('./ollama-client');   // kept for DEFAULT_MODEL reference
const aiProvider   = require('./ai-provider');
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
    temperature:    0.85,
    top_p:          0.92,
    repeat_penalty: 1.05,
    num_predict:    2500,
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

    const phaseLines = scenario.phase_table.map((p) => (
        `  step ${String(p.index).padStart(2,' ')} ${p.time_label.padEnd(6)} ${p.phase}`
    )).join('\n');

    return [
        `SCENARIO: ${scenario.scenario_label}, 12 steps D-3h..H+144.`,
        `OBJ ${scenario.obj.name}: coord ~[${scenario.obj.coord[0].toFixed(3)}, ${scenario.obj.coord[1].toFixed(3)}], CARVER ${scenario.obj.carver}/60, depth ${scenario.obj.target_depth_km} km.`,
        `BLS:\n${blsLines}`,
        `RED OOB (${scenario.red_units.length} markers, strength in [0,1]):\n${redLines}`,
        `BLUE OOB (${scenario.blue_units_base_ids.length} units, unit_uid = "BLUE_<base id>"):`,
        `  div:        ${blueDiv.join(', ')}`,
        `  brigades:   ${blueBde.join(', ')}`,
        `  battalions: ${blueBn.join(', ')}`,
        `  companies:  ${blueCoy.join(', ')}`,
        `PHASE TABLE:\n${phaseLines}`,
        `BLUE COA PARAMS for this trial:`,
        `  blue_reserve_commit_hour: ${coa.reserve_commit_hour}`,
        `  blue_posture:             ${coa.posture}`,
        `  blue_main_effort_axis:    ${coa.main_effort_axis}`,
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
    if (!priors || !priors.trialsSampled) return '';
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
    const filt = priors.coaFilter
        ? `posture=${priors.coaFilter.posture}, reserve_hr=${priors.coaFilter.reserve_commit_hour}`
        : 'any';
    return [
        `Across ${priors.trialsSampled} past trial(s) on this scenario (filter: ${filt}, ${priors.runsSampled} run(s)):`,
        `  Outcomes:           ${outcome || '(none)'}`,
        `  Final phase line:   ${fmtStat(priors.finalPhaseLineKm, 'km')}`,
        `  Blue destroyed:     ${fmtStat(priors.finalBlueDestroyed, 'of 39')}`,
        `  Red coy-eq losses:  ${fmtStat(priors.finalRedCoyEqLosses)}`,
        `  Model reliability:  ${priors.schemaOkRate}% schema_ok across ${priors.trialsSampled * 11} resolved steps`,
        reasons ? `  Top failure modes:  ${reasons}` : '  Top failure modes:  (none recorded)',
        `  These are observed priors from past trials — they describe what tends to happen, not what MUST happen for this run.`,
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
        'Re-emit the JSON object, fixing only the listed fields. Keep the narrative and other valid fields. Respond with JSON only.',
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
function fallbackResult(scenario, stepIndex, prevState, meta, why, extra, userPrompt) {
    const baseline = schema.baselineStateForStep(scenario, stepIndex, prevState);
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

// ── Main entry ───────────────────────────────────────────────────────
/**
 * Resolve one step transition.
 *
 * Arguments (object):
 *   scenario      — loaded scenario JSON; default: loader.getDefaultScenario()
 *   stepIndex     — 1..11 (step 0 has no transition; it is the seed)
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
    if (!Number.isInteger(stepIndex) || stepIndex < 0 || stepIndex > 11) {
        throw new Error(`adjudicateStep: stepIndex must be 0..11, got ${stepIndex}`);
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
        const repaired = schema.baselineStateForStep(scenario, stepIndex, prevState);
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
        model:        model || (providerName === 'claude' ? 'claude-default' : ollama.DEFAULT_MODEL),
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
        return fallbackResult(scenario, stepIndex, prevState, baseMeta, `${baseMeta.provider}_error`, { error: resp.error }, userPrompt);
    }

    baseMeta.responseChars = (resp.response || '').length;
    // Hold on to the raw LLM text across the retry loop so we can persist
    // even malformed responses to the trial log (item #4 — invaluable for
    // debugging why a prompt change broke parsing weeks later).
    let lastRawText = resp.response || '';

    let parsed = tryParse(resp.response);
    let val    = parsed ? validator.validateStateDelta(parsed, prevState, scenario, stepIndex) : null;

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
            return fallbackResult(scenario, stepIndex, prevState, baseMeta, `${baseMeta.provider}_error_on_retry`, { error: resp.error }, userPrompt);
        }
        baseMeta.responseChars += (resp.response || '').length;
        lastRawText = resp.response || lastRawText;
        parsed = tryParse(resp.response);
        val    = parsed ? validator.validateStateDelta(parsed, prevState, scenario, stepIndex) : null;
    }

    baseMeta.durationMs = Date.now() - start;

    if (!parsed) {
        return fallbackResult(scenario, stepIndex, prevState, baseMeta, 'parse_failed',
            { rawHead: lastRawText.slice(0, 200), rawText: lastRawText },
            userPrompt);
    }
    if (!val.ok) {
        return fallbackResult(scenario, stepIndex, prevState, baseMeta, 'validation_failed',
            { schema_errors: val.schema_errors },
            userPrompt);
    }

    return {
        ok: true,
        stepIndex,
        state: val.repaired,
        validation: {
            schema_ok:             true,
            clamped_fields:        val.clamped_fields,
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
    DEFAULT_COA,
    DEFAULT_OLLAMA_OPTIONS,
    DEFAULT_TIMEOUT_MS,
    TRIAL_HINTS,
    SYSTEM_PROMPT_TEXT:        SYSTEM_PROMPT,
    SYSTEM_PROMPT_HASH,
    SYSTEM_PROMPT_CLAUDE_TEXT: SYSTEM_PROMPT_CLAUDE,
    SYSTEM_PROMPT_CLAUDE_HASH,
};
