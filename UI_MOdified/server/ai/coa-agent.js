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
    temperature: 0.45,   // enough variety for the seed plan, but easier to keep JSON-valid
    top_p:       0.9,
    num_predict: 1400,
    max_tokens:  1400,   // claude/zen surface
});

// Default LLM call ceiling. Prefer the central ai-config.js value
// (RMOOZ_OLLAMA_TIMEOUT_MS / .requestTimeoutMs) so a 7B CPU model gets
// the same 90 s budget as the rest of the gateway. Floor at 60 s — a 7B
// on CPU often needs 40-50 s just for model load + a 1400-token plan,
// and the old 30 s hard-coded ceiling was timing every request out.
const DEFAULT_TIMEOUT_MS = Math.max(
    Number(aiCfg && aiCfg.requestTimeoutMs) || 0,
    60000
);

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

function requestedRange(constraints) {
    const cons = constraints || {};
    const minOptions = Math.max(3, Math.min(5, cons.min_options | 0 || 3));
    const maxOptions = Math.max(minOptions, Math.min(5, cons.max_options | 0 || 5));
    return { minOptions, maxOptions };
}

function scenarioBlsNames(scenario) {
    const fromScenario = scenario && Array.isArray(scenario.bls_template)
        ? scenario.bls_template.map(b => b && b.name).filter(Boolean)
        : [];
    return fromScenario.length ? fromScenario : ['BLS-1', 'BLS-2', 'BLS-3', 'BLS-4'];
}

function pickBls(scenario, preferred, fallbackIndex) {
    const names = scenarioBlsNames(scenario);
    if (preferred && names.includes(preferred)) return preferred;
    return names[Math.min(fallbackIndex, names.length - 1)] || names[0] || 'BLS-1';
}

function bestMainBls(scenario) {
    const entries = scenario && Array.isArray(scenario.bls_template) ? scenario.bls_template : [];
    const ranked = entries
        .filter(b => b && b.name && !b.permanently_limited)
        .sort((a, b) => Number(b.throughput || b.nominal_throughput || 0) - Number(a.throughput || a.nominal_throughput || 0));
    return (ranked[0] && ranked[0].name) || pickBls(scenario, 'BLS-3', 2);
}

function localCoaTemplates(scenario) {
    const names = scenarioBlsNames(scenario);
    const main = bestMainBls(scenario);
    const supporting = names.find(n => n !== main) || pickBls(scenario, 'BLS-1', 0);
    const third = names.find(n => n !== main && n !== supporting) || supporting;
    const limitedEntry = scenario && Array.isArray(scenario.bls_template)
        ? scenario.bls_template.find(b => b && b.permanently_limited)
        : null;
    const limited = (limitedEntry && limitedEntry.name) || names[names.length - 1] || third;
    const obj = scenario && scenario.obj && scenario.obj.name ? scenario.obj.name : 'OBJ';

    return [
        {
            name: 'Deliberate Bridge',
            risk_tier: 'low',
            eta_hours: 120,
            blue_casualty_p50: 10,
            blue_casualty_p90: 18,
            rationale: 'Preserves combat power while building a secure beachhead before the decisive push. Best when Blue can trade tempo for lower downside risk.',
            key_assumptions: [`${main} secure by H+24`, 'Red EW pressure declines after H+24', 'Reserve remains uncommitted until the beachhead is stable'],
            plan: [`Land main effort through ${main}`, `Use ${supporting} as supporting entry and casualty evacuation lane`, 'Consolidate logistics and fires to H+48', `Commit reserve after beachhead is secure`, `Seize ${obj} by H+120`],
            decision_points: [{ at_hour: 48, trigger: `${main} not secure`, branch_if_not: `Shift tempo to ${supporting} and delay reserve` }],
        },
        {
            name: 'Hasty Thrust',
            risk_tier: 'high',
            eta_hours: 72,
            blue_casualty_p50: 20,
            blue_casualty_p90: 32,
            rationale: 'Maximizes tempo and tries to outrun Red consolidation. Pick this when speed matters more than preserving the reserve.',
            key_assumptions: [`${main} opens by H+8`, 'EW shock suppresses Red C2 through H+18', 'Reserve can move immediately without traffic collapse'],
            plan: [`Mass landing at ${main}`, 'Push reconnaissance inland without waiting for full beach clearance', 'Commit reserve by H+24', `Drive directly on ${obj}`, 'Accept higher flank risk to preserve momentum'],
            decision_points: [{ at_hour: 24, trigger: `${main} still contested`, branch_if_not: 'Abort thrust and transition to deliberate bridgehead' }],
        },
        {
            name: 'Feint Hook',
            risk_tier: 'medium',
            eta_hours: 108,
            blue_casualty_p50: 14,
            blue_casualty_p90: 24,
            rationale: 'Uses deception to split Red markers before the main effort commits. It balances tempo and protection better than a single-axis attack.',
            key_assumptions: [`${supporting} demonstration fixes Red`, `${main} remains the reliable exit`, `${limited} used only for fixing or deception`],
            plan: [`Demonstrate at ${supporting}`, `Land main combat power through ${main}`, `Screen ${limited} without relying on it for heavy throughput`, 'Commit reserve in the mid-window', `Approach ${obj} from the less defended flank`],
            decision_points: [{ at_hour: 36, trigger: 'Red does not react to feint', branch_if_not: `Re-mass on ${main}` }],
        },
        {
            name: 'EW Pulse',
            risk_tier: 'medium',
            eta_hours: 96,
            blue_casualty_p50: 16,
            blue_casualty_p90: 26,
            rationale: 'Times the decisive ground move to the best electronic-warfare window. It is useful when Red sensors are the main obstacle.',
            key_assumptions: ['Blue EW can mask the first heavy lift', `${main} can absorb priority traffic`, 'Red indirect fires are delayed by disrupted C2'],
            plan: ['Open with EW and ISR suppression', `Land first wave at ${main} under jamming cover`, `Use ${third} for fires and sustainment support`, 'Commit reserve as EW effects peak', `Exploit toward ${obj} before Red C2 recovers`],
        },
        {
            name: 'Fires Screen',
            risk_tier: 'low',
            eta_hours: 132,
            blue_casualty_p50: 9,
            blue_casualty_p90: 17,
            rationale: 'Uses fires and ISR to reduce Red combat power before the reserve is exposed. Slowest option, but gives the commander the cleanest abort points.',
            key_assumptions: ['Sufficient fires are available for shaping', `Sustainment through ${main} remains uninterrupted`, 'Red armor can be fixed short of the objective'],
            plan: [`Secure ${main} and ${supporting} before deep movement`, 'Shape Red artillery and armor with fires', 'Advance by bounded phase lines', 'Commit reserve only after Red markers degrade', `Finish seizure of ${obj} after H+120`],
        },
    ];
}

function addLocalBackfill(plans, scenario, minOptions, maxOptions) {
    const out = (plans || []).slice(0, maxOptions);
    const seen = new Set(out.map(p => String(p.name || '').trim().toLowerCase()).filter(Boolean));
    const validation = coaSchema.validateCoaArray(localCoaTemplates(scenario));
    for (const plan of validation.plans) {
        const key = String(plan.name || '').trim().toLowerCase();
        if (!key || seen.has(key)) continue;
        out.push(plan);
        seen.add(key);
        if (out.length >= Math.min(maxOptions, Math.max(minOptions, 3))) break;
    }
    return out.slice(0, maxOptions);
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
    const { minOptions, maxOptions } = requestedRange(args.constraints);

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

    // Previously: when providerName === 'ollama' and constraints.live_ai
    // wasn't set, this returned canned `addLocalBackfill` plans without
    // ever calling the LLM. That meant "Generate COA" on a local-Ollama
    // setup never reached the model — users saw hardcoded plans every
    // time. Removed: we always call the AI now; the existing `if (!resp.ok)`
    // path below still falls back to local backfill when the LLM errors,
    // times out, or is unreachable. Pass constraints.skip_ai: true if you
    // need the old fast-bypass behavior for a specific request.
    const skipAi = !!(args.constraints && args.constraints.skip_ai);
    if (skipAi) {
        const plans = addLocalBackfill([], args.scenario, minOptions, maxOptions);
        meta.durationMs = Date.now() - start;
        meta.fallback = 'skipped_ai';
        meta.localBackfillAdded = plans.length;
        meta.requestedMin = minOptions;
        meta.requestedMax = maxOptions;
        meta.iterativeAttempts = 0;
        return {
            ok: plans.length > 0,
            plans,
            meta,
            raw: null,
        };
    }

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
        const fallbackPlans = addLocalBackfill([], args.scenario, minOptions, maxOptions);
        meta.fallback = 'local_provider_error';
        meta.localBackfillAdded = fallbackPlans.length;
        meta.errors.push({ path: 'provider', msg: resp.error || 'unknown provider error' });
        return {
            ok: fallbackPlans.length > 0,
            plans: fallbackPlans,
            error: fallbackPlans.length ? null : `${meta.provider}_error: ${resp.error || 'unknown'}`,
            meta,
        };
    }

    const parsed = tryParse(resp.response);
    if (parsed == null) {
        meta.parseFailed = true;
        const fallbackPlans = addLocalBackfill([], args.scenario, minOptions, maxOptions);
        meta.fallback = 'local_parse_failed';
        meta.localBackfillAdded = fallbackPlans.length;
        return {
            ok: fallbackPlans.length > 0,
            plans: fallbackPlans,
            error: 'parse_failed',
            meta,
            rawHead: (resp.response || '').slice(0, 400),
        };
    }

    const validation = coaSchema.validateCoaArray(parsed);
    meta.validationDropped = validation.dropped.length;
    meta.errors = validation.errors.slice(0, 10);

    // Initial plans (whatever the first call produced — may be 1 from a weak
    // model that ignored "generate 3-5"). We backfill locally below so the
    // UI doesn't wait for serial follow-up model calls.
    let plans = (validation.plans || []).slice();

    if (!validation.ok && plans.length === 0) {
        plans = addLocalBackfill([], args.scenario, minOptions, maxOptions);
        meta.fallback = 'local_validation_failed';
        meta.localBackfillAdded = plans.length;
        return {
            ok: plans.length > 0,
            error: plans.length ? null : 'validation_failed',
            plans,
            dropped: validation.dropped,
            meta,
            rawHead: (resp.response || '').slice(0, 400),
        };
    }

    const beforeBackfill = plans.length;
    plans = addLocalBackfill(plans, args.scenario, minOptions, maxOptions);
    meta.localBackfillAdded = Math.max(0, plans.length - beforeBackfill);

    meta.iterativeAttempts = 0;
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
