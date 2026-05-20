/**
 * COA (Course of Action) generator.
 *
 * Asks the configured LLM provider (Ollama / Claude / Zen) for 3-5
 * distinct courses of action given a scenario, current state, and a
 * short commander's intent. Returns validated plan cards that the HUD
 * can render directly.
 *
 * Public surface:
 *   generateCoaSet({ scenario, currentState, commanderIntent, constraints,
 *                    provider, model, timeoutMs }) → { ok, plans, raw, meta, error? }
 *
 * On hard failure (no provider available, all retries failed, no usable
 * plans extracted), returns ok:false with an error message. The route
 * handler in web-server.js translates this into a 502 with detail.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const aiProvider = require('./ai-provider');
const aiCfg      = require('./ai-config');
const coaSchema  = require('./coa-schema');
const { extractJson } = require('./red-team-agent');

const SYSTEM_PROMPT = fs.readFileSync(
    path.join(__dirname, 'prompts', 'coa-system.txt'),
    'utf8',
).trim();

const DEFAULT_OPTIONS = Object.freeze({
    temperature: 0.7,    // some variety across the 3-5 plans, but not chaotic
    top_p:       0.92,
    num_predict: 3000,
    max_tokens:  3000,   // claude/zen surface
});

const DEFAULT_TIMEOUT_MS = 120000;

// ── Prompt assembly ──────────────────────────────────────────────────
function buildUserPrompt({ scenario, currentState, commanderIntent, constraints }) {
    const intent = String(commanderIntent || '').trim() || 'Seize OBJ NASSER by H+144 with minimum Blue casualties.';

    const cons = constraints || {};
    const minOptions = Math.max(3, Math.min(5, cons.min_options | 0 || 3));
    const maxOptions = Math.max(minOptions, Math.min(5, cons.max_options | 0 || 5));
    const mustConsider = Array.isArray(cons.must_consider) ? cons.must_consider.slice(0, 5) : [];

    // State snapshot — compressed and optional. Step 0 (fresh) is fine.
    const state = currentState || {};
    const stateBlock = [
        `current step:    ${state.step_index != null ? state.step_index : 0}`,
        `time label:      ${state.time_label || 'D-3h'}`,
        `phase:           ${state.phase || 'PRE-H'}`,
        `phase_line_km:   ${state.phase_line_km != null ? state.phase_line_km : 0}`,
        `objective:       ${state.objective_status || 'DORMANT'}`,
        `force_ratio:     ${state.force_ratio || 'pre-contact'}`,
        `ew_effect:       ${state.ew_effect || 'Idle'}`,
        `bls_status:      ${state.bls_status ? JSON.stringify(state.bls_status) : '{"BLS-1":"STAGED","BLS-2":"STAGED","BLS-3":"STAGED","BLS-4":"STAGED"}'}`,
        `blue_destroyed:  ${state.losses_cumulative && state.losses_cumulative.blue_destroyed != null ? state.losses_cumulative.blue_destroyed : 0} / 39`,
    ].join('\n');

    // Scenario summary — keep it short, just the key constants.
    const scen = scenario || {};
    const scenarioBlock = [
        `scenario_label:  ${scen.scenario_label || 'wargame2-brega'}`,
        `obj_name:        ${scen.obj && scen.obj.name || 'NASSER'}`,
        `obj_carver:      ${scen.obj && scen.obj.carver != null ? scen.obj.carver : 37}/60`,
        `obj_depth_km:    ${scen.obj && scen.obj.target_depth_km != null ? scen.obj.target_depth_km : 95}`,
        `red_markers:     ${(scen.red_units && scen.red_units.length) || 11}`,
        `blue_oob_total:  ${(scen.blue_units_base_ids && scen.blue_units_base_ids.length) || 39}`,
    ].join('\n');

    const mustLine = mustConsider.length
        ? `\nMUST consider at least these approaches: ${mustConsider.join(', ')}.`
        : '';

    return [
        '=== SCENARIO ===',
        scenarioBlock,
        '',
        '=== CURRENT STATE ===',
        stateBlock,
        '',
        '=== COMMANDER INTENT ===',
        intent,
        '',
        '=== CONSTRAINTS ===',
        `Generate EXACTLY ${minOptions} distinct COAs (up to ${maxOptions} if a fifth materially adds choice).${mustLine}`,
        `Your response MUST be a JSON ARRAY with at least ${minOptions} elements.`,
        'A single object response (without surrounding [ ]) is INVALID and will be rejected.',
        '',
        `Respond with the JSON array only. Begin with [ and end with ]. The array must contain ${minOptions} to ${maxOptions} plan objects, each materially different in approach.`,
    ].join('\n');
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
 * Generate a COA set.
 *
 * Args (object):
 *   scenario         loaded scenario JSON; required
 *   currentState     optional; defaults to fresh state implicitly
 *   commanderIntent  short string; default if missing
 *   constraints      { min_options, max_options, must_consider[] }
 *   provider         'ollama' | 'claude' | 'zen' | 'auto' (default from env)
 *   model            override default model
 *   timeoutMs        per-call timeout (default 120s)
 *
 * Returns:
 *   { ok, plans, raw, meta }
 *   meta = { provider, model, durationMs, parseFailed, validationDropped, errors }
 *
 * The plans array contains 1+ validated COAs on success. Each card may
 * be flagged `_partial: true` with `_errors` if some fields had issues
 * but the card was salvageable (renderable in the HUD).
 */
async function generateCoaSet(args) {
    args = args || {};
    if (!args.scenario) {
        return { ok: false, error: 'scenario is required' };
    }

    const requestedProvider = args.provider || null;
    let providerName;
    try {
        providerName = aiProvider.resolveProvider(requestedProvider);
    } catch (e) {
        providerName = 'ollama';
    }

    const userPrompt = buildUserPrompt(args);
    const callOpts = { ...DEFAULT_OPTIONS };
    const timeoutMs = args.timeoutMs || DEFAULT_TIMEOUT_MS;

    const start = Date.now();
    const meta = {
        provider:     providerName,
        model:        args.model || (
                          providerName === 'claude' ? (aiCfg.claude && aiCfg.claude.defaultModel) || 'claude-default' :
                          providerName === 'zen'    ? (aiCfg.zen    && aiCfg.zen.defaultModel)    || 'zen-default'    :
                          (aiCfg.defaultModel || 'ollama-default')
                      ),
        durationMs:   0,
        parseFailed:  false,
        validationDropped: 0,
        errors:       [],
    };

    const resp = await aiProvider.generate({
        provider: providerName,
        model:    args.model,
        system:   SYSTEM_PROMPT,
        prompt:   userPrompt,
        format:   'json',
        options:  callOpts,
        timeoutMs,
    });
    meta.durationMs = Date.now() - start;
    if (resp && resp.providerUsed) meta.provider = resp.providerUsed;

    if (!resp.ok) {
        return {
            ok: false,
            error: `${meta.provider}_error: ${resp.error || 'unknown'}`,
            meta,
        };
    }

    const parsed = tryParse(resp.response);
    if (parsed == null) {
        meta.parseFailed = true;
        return {
            ok: false,
            error: 'parse_failed',
            meta,
            rawHead: (resp.response || '').slice(0, 400),
        };
    }

    const validation = coaSchema.validateCoaArray(parsed);
    meta.validationDropped = validation.dropped.length;
    meta.errors = validation.errors.slice(0, 10);

    const minOptions = Math.max(3, Math.min(5, (args.constraints && args.constraints.min_options) | 0 || 3));
    const maxOptions = Math.max(minOptions, Math.min(5, (args.constraints && args.constraints.max_options) | 0 || 5));

    // Initial plans (whatever the first call produced — may be 1 from a weak
    // model that ignored "generate 3-5"). We'll backfill iteratively below.
    let plans = (validation.plans || []).slice();

    if (!validation.ok && plans.length === 0) {
        return {
            ok: false,
            error: 'validation_failed',
            plans: [],
            dropped: validation.dropped,
            meta,
            rawHead: (resp.response || '').slice(0, 400),
        };
    }

    // ── Iterative backfill (the 7B-model fix) ────────────────────────
    // qwen2.5:7b et al. tend to return ONE high-quality plan when asked
    // for multiple. We fix that by making focused single-plan follow-ups
    // with diversifying hints. Strong models (Claude, gpt-oss:20b) skip
    // this loop entirely because the first call already gave us enough.
    const diversifyHints = [
        'HIGH-RISK FAST: speed over preservation. Single-axis assault. Early reserve commit (≤ H+48).',
        'LOW-RISK DELIBERATE: maximum reserve preservation, multi-axis support, slow deliberate phasing.',
        'MEDIUM FEINT-AND-FLANK: demonstration at one BLS, main effort at another, indirect approach to OBJ.',
        'AIR-HEAVY: leverage CAS/ISR for stand-off; minimize ground commitment until objective.',
        'EW-DOMINANT: time the assault to peak Red EW disruption (H+2 to H+24); aggressive during shock.',
    ];

    const ITER_CAP = 6;  // hard cap on follow-up calls to prevent runaway
    let iterations = 0;
    while (plans.length < minOptions && iterations < ITER_CAP) {
        const hint = diversifyHints[iterations % diversifyHints.length];
        const existingNames = plans.map(p => p.name).join(', ') || '(none yet)';
        const followupPrompt = [
            '=== SCENARIO ===',
            // Recap scenario block briefly so the LLM has context if the system prompt was evicted.
            args.scenario.scenario_label || 'wargame2-brega',
            '',
            '=== FOLLOW-UP REQUEST ===',
            `You previously returned ${plans.length} plan(s) with name(s): ${existingNames}.`,
            'Generate ONE MORE plan, materially different from those listed above.',
            '',
            `Focus this plan on: ${hint}`,
            '',
            'Respond with a JSON ARRAY containing exactly ONE new plan object: [ { ... } ].',
            'Do NOT repeat any of the names listed above. The shape must match the system schema exactly.',
        ].join('\n');

        const followup = await aiProvider.generate({
            provider: providerName,
            model:    args.model,
            system:   SYSTEM_PROMPT,
            prompt:   followupPrompt,
            format:   'json',
            options:  callOpts,
            timeoutMs,
        });

        iterations++;
        if (!followup.ok) {
            // Soft-stop on call failure — return what we have.
            meta.errors.push({ path: `iterative[${iterations}]`, msg: 'provider call failed: ' + (followup.error || 'unknown') });
            break;
        }

        const followupParsed = tryParse(followup.response);
        if (followupParsed == null) {
            meta.errors.push({ path: `iterative[${iterations}]`, msg: 'parse failed' });
            continue;
        }

        const followupVal = coaSchema.validateCoaArray(followupParsed);
        const existingLc = new Set(plans.map(p => p.name.toLowerCase()));
        for (const plan of followupVal.plans) {
            if (!plan.name) continue;
            if (existingLc.has(plan.name.toLowerCase())) continue;  // dedupe by name
            plans.push(plan);
            existingLc.add(plan.name.toLowerCase());
            if (plans.length >= maxOptions) break;
        }
    }

    meta.iterativeAttempts = iterations;
    meta.durationMs = Date.now() - start;
    meta.requestedMin = minOptions;
    meta.requestedMax = maxOptions;

    return {
        ok:    plans.length > 0,
        plans,
        meta,
        raw:   resp.raw || null,
    };
}

module.exports = {
    generateCoaSet,
    buildUserPrompt,
    SYSTEM_PROMPT_TEXT: SYSTEM_PROMPT,
    DEFAULT_OPTIONS,
    DEFAULT_TIMEOUT_MS,
};
