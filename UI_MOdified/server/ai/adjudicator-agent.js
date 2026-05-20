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

const fs   = require('fs');
const path = require('path');

const ollama    = require('./ollama-client');
const loader    = require('./scenario-loader');
const schema    = require('./adjudicator-schema');
const validator = require('./adjudicator-validator');
const { extractJson } = require('./red-team-agent');

const SYSTEM_PROMPT = fs.readFileSync(
    path.join(__dirname, 'prompts', 'adjudicator-system.txt'),
    'utf8',
).trim();

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
        (b.name === 'BLS-4' ? ', PERMANENTLY LIMITED' : '') +
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

function buildUserPrompt(scenario, stepIndex, prevState, trialId, trialSeed, hint, coaParams) {
    const constants = buildScenarioConstantsBlock(scenario, coaParams);
    const phaseRow  = scenario.phase_table[stepIndex];

    return [
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
        '(none — resolve from posture and prior state)',
        '',
        `Resolve step ${stepIndex}. Respond with the JSON object only.`,
    ].join('\n');
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
function fallbackResult(scenario, stepIndex, prevState, meta, why, extra) {
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
    const userPrompt = buildUserPrompt(scenario, stepIndex, prevState, trialId, seed, hint, coaParams);

    const callOpts = { ...DEFAULT_OLLAMA_OPTIONS, seed };

    const baseMeta = {
        durationMs:   0,
        model:        model || ollama.DEFAULT_MODEL,
        trialId,
        trialSeed,
        trialHintId,
        seed,
        promptChars:  userPrompt.length,
        responseChars:0,
        retries:      0,
    };

    let resp = await ollama.generate({
        model,
        system:  SYSTEM_PROMPT,
        prompt:  userPrompt,
        format:  'json',
        options: callOpts,
        timeoutMs,
    });

    if (!resp.ok) {
        baseMeta.durationMs = Date.now() - start;
        return fallbackResult(scenario, stepIndex, prevState, baseMeta, 'ollama_error', { error: resp.error });
    }

    baseMeta.responseChars = (resp.response || '').length;

    let parsed = tryParse(resp.response);
    let val    = parsed ? validator.validateStateDelta(parsed, prevState, scenario, stepIndex) : null;

    // Retry once with corrective prompt if structural failure
    if ((!parsed || !val.ok) && (val == null || val.schema_errors.length > 0)) {
        baseMeta.retries = 1;
        const errors = val ? val.schema_errors : [{ path: 'root', msg: 'JSON parse failed' }];
        const corrective = buildCorrectivePrompt(userPrompt, errors);
        resp = await ollama.generate({
            model,
            system:  SYSTEM_PROMPT,
            prompt:  corrective,
            format:  'json',
            options: callOpts,
            timeoutMs,
        });
        if (!resp.ok) {
            baseMeta.durationMs = Date.now() - start;
            return fallbackResult(scenario, stepIndex, prevState, baseMeta, 'ollama_error_on_retry', { error: resp.error });
        }
        baseMeta.responseChars += (resp.response || '').length;
        parsed = tryParse(resp.response);
        val    = parsed ? validator.validateStateDelta(parsed, prevState, scenario, stepIndex) : null;
    }

    baseMeta.durationMs = Date.now() - start;

    if (!parsed) {
        return fallbackResult(scenario, stepIndex, prevState, baseMeta, 'parse_failed', { rawHead: (resp.response || '').slice(0, 200) });
    }
    if (!val.ok) {
        return fallbackResult(scenario, stepIndex, prevState, baseMeta, 'validation_failed', { schema_errors: val.schema_errors });
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
        rawLlm: parsed, // useful for trial logs; runner may strip before sending to client
    };
}

module.exports = {
    adjudicateStep,
    buildScenarioConstantsBlock,
    buildUserPrompt,
    compressPrevState,
    deriveSeed,
    DEFAULT_COA,
    DEFAULT_OLLAMA_OPTIONS,
    DEFAULT_TIMEOUT_MS,
    TRIAL_HINTS,
    SYSTEM_PROMPT_TEXT: SYSTEM_PROMPT,
};
