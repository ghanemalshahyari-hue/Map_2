'use strict';
/* ============================================================================
 * llm-runtime-config.js — RMOOZ-LLM-RUNTIME-CONFIG-A
 * ----------------------------------------------------------------------------
 * THE canonical LLM runtime-config resolver. Every AI/LLM feature (Free Fight
 * COA planner, capability analyst, decision, plan, the route health, and the
 * model-selector integration) gets its provider / model / timeout / repair /
 * draft / keep-alive config FROM HERE — no feature module decides them locally.
 *
 * Change the model/provider/timeout in ONE place: env/runtime config, read only
 * by this module. Add a new env knob here, not inside a planner.
 *
 * ── What this module exclusively owns (the ONLY reader of these names) ────────
 *   Provider : RMOOZ_LLM_PROVIDER            (+ legacy RMOOZ_FREE_FIGHT_PROVIDER)
 *   Model    : RMOOZ_LLM_MODEL               (+ legacy RMOOZ_FREE_FIGHT_MODEL,
 *                                                     RMOOZ_AI_MODEL,
 *                                                     RMOOZ_LOCAL_LLM_MODEL,
 *                                                     RMOOZ_OLLAMA_MODEL*)
 *   Timeout  : RMOOZ_LLM_TIMEOUT_MS          (+ legacy RMOOZ_FREE_FIGHT_TIMEOUT_MS,
 *                                                     RMOOZ_AI_TIMEOUT_MS,
 *                                                     RMOOZ_OLLAMA_TIMEOUT_MS*)
 *   Repair   : RMOOZ_LLM_REPAIR_ATTEMPTS     (+ legacy RMOOZ_FREE_FIGHT_REPAIR_ATTEMPTS)
 *   Draft    : RMOOZ_LLM_ATTEMPTS            (+ legacy RMOOZ_FREE_FIGHT_ATTEMPTS)
 *   KeepAlive: RMOOZ_LLM_KEEP_ALIVE
 *   Task-specific overrides (optional, win over the default):
 *     RMOOZ_LLM_MODEL_<TASK>      e.g. RMOOZ_LLM_MODEL_COA_PLANNER
 *     RMOOZ_LLM_TIMEOUT_MS_<TASK> e.g. RMOOZ_LLM_TIMEOUT_MS_CAPABILITY_ANALYST
 *
 *   *RMOOZ_OLLAMA_MODEL / RMOOZ_OLLAMA_TIMEOUT_MS are ALSO the documented base
 *    knobs of ai-config.js (the adjudicator/ollama-client SoT). This resolver
 *    layers the LLM-feature names on top of ai-config's committed defaults; it
 *    reads the OLLAMA aliases here so the Free Fight feature precedence is
 *    preserved without each planner re-reading env.
 *
 * Legacy aliases (req #5) keep working but are marked legacy below.
 *
 * Layering / no cycle:
 *   - This module requires ai-config (committed defaults). ai-config never
 *     requires this module.
 *   - model-selection.js requires this module (delegates its env default to
 *     envDefaultModel/envDefaultSource) and keeps ownership of the operator's
 *     runtime UI selection (runtime/ai-model-selection.json).
 *   - getModel(task) consults model-selection LAZILY (require inside the fn) so
 *     there is no load-time cycle: task override → UI selection → env default.
 *
 * Pure config resolution; no network I/O. Behavior-preserving (req #7): the
 * defaults below match what the feature modules used before centralization
 * (timeout 120000, draft attempts 2, repair attempts 1).
 * ========================================================================== */

const AI_CONFIG = require('./ai-config'); // committed defaults (model, keepAlive)

// task key → ENV suffix used for task-specific overrides
const TASK_ENV_SUFFIX = {
    coa_planner:        'COA_PLANNER',
    capability_analyst: 'CAPABILITY_ANALYST',
    decision:           'DECISION',
    plan:               'PLAN',
    // RMOOZ-BLUE-RED-GREEN-WHITE-A: the Green/ops SUMMARIZER role — a SMALL model for short notes only
    // (never planning). RMOOZ_LLM_MODEL_SUMMARIZER overrides it (e.g. llama3.2:3b / gemma3:4b).
    summarizer:         'SUMMARIZER',
};
const TASKS = Object.freeze({
    COA_PLANNER:        'coa_planner',
    CAPABILITY_ANALYST: 'capability_analyst',
    DECISION:           'decision',
    PLAN:               'plan',
    SUMMARIZER:         'summarizer',
});

const DEFAULT_TIMEOUT_MS    = 120000; // matches the prior per-module default
const DEFAULT_DRAFT_ATTEMPTS  = 2;    // matches RMOOZ_FREE_FIGHT_ATTEMPTS || 2
const DEFAULT_REPAIR_ATTEMPTS = 1;    // matches RMOOZ_FREE_FIGHT_REPAIR_ATTEMPTS || 1

function _s(v) { return v == null ? '' : String(v).trim(); }
function firstNonEmpty() {
    for (let i = 0; i < arguments.length; i++) { const v = _s(arguments[i]); if (v !== '') return v; }
    return '';
}
function _int(v, fallback) { const n = parseInt(v, 10); return Number.isFinite(n) ? n : fallback; }
function _suffix(task) { return TASK_ENV_SUFFIX[task] || ''; }

// ── Provider ─────────────────────────────────────────────────────────────────
// Canonical RMOOZ_LLM_PROVIDER; legacy RMOOZ_FREE_FIGHT_PROVIDER; default ollama.
// Returns the RAW configured provider (lower-cased) so callers can detect and
// block a remote provider (Free Fight is local-only; the block lives in the
// feature modules' isRemoteProvider). We do NOT fall through to RMOOZ_AI_PROVIDER
// — that is the adjudicator/ai-config provider, a separate concern.
function getProvider() {
    // Precedence: explicit env (canonical, then legacy) WINS over the runtime UI selection so an
    // operator's env config is authoritative and the zen/claude env block-tests stay deterministic;
    // the UI selection (model-selector runtime file) supplies the provider only when no env is set
    // (this is how a UI pick of provider=openrouter takes effect).
    return firstNonEmpty(
        process.env.RMOOZ_LLM_PROVIDER,         // canonical env
        process.env.RMOOZ_FREE_FIGHT_PROVIDER,  // legacy env alias
        _runtimeSelectedProvider()              // operator UI selection (model-selector)
    ).toLowerCase() || 'ollama';
}
// The provider the operator picked in the UI (model-selection runtime file), RAW.
// Lazy-required to avoid a load cycle. '' when none / unavailable.
function _runtimeSelectedProvider() {
    try { const MS = require('./model-selection'); if (MS && typeof MS.selectedProviderRaw === 'function') return MS.selectedProviderRaw(); }
    catch (_) { /* model-selection unavailable */ }
    return '';
}

// ── Cloud mode (RMOOZ-OPENROUTER-QWEN35-CLOUD-MODE-A) ─────────────────────────
// The app is LOCAL-ONLY by default. Cloud (OpenRouter) runs ONLY in explicit cloud
// mode. `cloudAllowed()` is the dedicated cloud gate (separate from the execution
// gate RMOOZ_ALLOW_SIM_RUN); `openrouterReady()` also requires the API key. The
// feature modules' isRemoteProvider blocks `openrouter` unless openrouterReady().
function cloudAllowed() { return _s(process.env.RMOOZ_ALLOW_CLOUD_AI) === '1'; }
function _openrouterKeyPresent() {
    return !!(AI_CONFIG && AI_CONFIG.openrouter && _s(AI_CONFIG.openrouter.apiKey) !== '');
}
function openrouterReady() { return cloudAllowed() && _openrouterKeyPresent(); }
// RMOOZ-OPENCODE-ZEN-COA-A: opencode.ai/zen as a GATED online provider — mirrors openrouter and the
// resolver's zenReady (llm-geocode.js). Requires cloud mode (RMOOZ_ALLOW_CLOUD_AI=1) + the opencode key.
function _zenKeyPresent() {
    return !!(AI_CONFIG && AI_CONFIG.zen && _s(AI_CONFIG.zen.apiKey) !== '');
}
function zenReady() { return cloudAllowed() && _zenKeyPresent(); }

// ── Model ──────────────────────────────────────────────────────────────────
// env/default model only (NO runtime UI file — that layer is model-selection).
function envDefaultModel() {
    return firstNonEmpty(
        process.env.RMOOZ_LLM_MODEL,        // canonical
        process.env.RMOOZ_OLLAMA_MODEL,     // legacy (kept first to preserve model-selection precedence)
        process.env.RMOOZ_FREE_FIGHT_MODEL, // legacy alias
        process.env.RMOOZ_LOCAL_LLM_MODEL,  // legacy alias
        process.env.RMOOZ_AI_MODEL          // legacy alias
    ) || (AI_CONFIG && AI_CONFIG.defaultModel) || 'qwen2.5:7b';
}
function envDefaultSource() {
    if (_s(process.env.RMOOZ_LLM_MODEL))        return 'env:RMOOZ_LLM_MODEL';
    if (_s(process.env.RMOOZ_OLLAMA_MODEL))     return 'env:RMOOZ_OLLAMA_MODEL';
    if (_s(process.env.RMOOZ_FREE_FIGHT_MODEL)) return 'env:RMOOZ_FREE_FIGHT_MODEL';
    if (_s(process.env.RMOOZ_LOCAL_LLM_MODEL))  return 'env:RMOOZ_LOCAL_LLM_MODEL';
    if (_s(process.env.RMOOZ_AI_MODEL))         return 'env:RMOOZ_AI_MODEL';
    return 'default';
}
function taskModelOverride(task) {
    const suf = _suffix(task);
    return suf ? _s(process.env['RMOOZ_LLM_MODEL_' + suf]) : '';
}
// Effective model for a task (req #3): task-specific override → operator UI
// selection (model-selection) → env default. The UI selection is consulted
// lazily to avoid a load-time cycle.
function getModel(task) {
    const t = taskModelOverride(task);
    if (t) return t;
    try {
        const MS = require('./model-selection');
        if (MS && typeof MS.getSelectedModel === 'function') return MS.getSelectedModel();
    } catch (_) { /* model-selection unavailable → env default */ }
    return envDefaultModel();
}
function modelSource(task) {
    const suf = _suffix(task);
    if (suf && _s(process.env['RMOOZ_LLM_MODEL_' + suf])) return 'env:RMOOZ_LLM_MODEL_' + suf;
    try {
        const MS = require('./model-selection');
        if (MS && typeof MS.selectionSource === 'function') return MS.selectionSource();
    } catch (_) { /* fall through */ }
    return envDefaultSource();
}

// ── Timeout (ms) ─────────────────────────────────────────────────────────────
function taskTimeoutEnv(task) {
    const suf = _suffix(task);
    return suf ? _s(process.env['RMOOZ_LLM_TIMEOUT_MS_' + suf]) : '';
}
function getTimeoutMs(task) {
    return _int(firstNonEmpty(
        taskTimeoutEnv(task),                    // task-specific (highest)
        process.env.RMOOZ_LLM_TIMEOUT_MS,        // canonical
        process.env.RMOOZ_FREE_FIGHT_TIMEOUT_MS, // legacy alias
        process.env.RMOOZ_AI_TIMEOUT_MS,         // legacy alias
        process.env.RMOOZ_OLLAMA_TIMEOUT_MS      // legacy alias (free-fight-llm-plan used it)
    ), DEFAULT_TIMEOUT_MS);
}

// ── Repair attempts (COA planner sends validator violations back to the LLM) ──
function getRepairAttempts() {
    return _int(firstNonEmpty(
        process.env.RMOOZ_LLM_REPAIR_ATTEMPTS,        // canonical
        process.env.RMOOZ_FREE_FIGHT_REPAIR_ATTEMPTS  // legacy alias
    ), DEFAULT_REPAIR_ATTEMPTS);
}

// ── Draft attempts (retry a bad-JSON / <2-COA draft before falling back) ──────
function getDraftAttempts() {
    return _int(firstNonEmpty(
        process.env.RMOOZ_LLM_ATTEMPTS,        // canonical
        process.env.RMOOZ_FREE_FIGHT_ATTEMPTS  // legacy alias
    ), DEFAULT_DRAFT_ATTEMPTS);
}

// ── keep_alive (Ollama model residency) ──────────────────────────────────────
// Exposed for centralization; defaults to ai-config.keepAlive so a caller that
// passes it is behavior-neutral. Not wired into call sites in this pass (req #7).
function getKeepAlive() {
    return firstNonEmpty(process.env.RMOOZ_LLM_KEEP_ALIVE) || (AI_CONFIG && AI_CONFIG.keepAlive) || null;
}

// ── num_ctx (Ollama context window) ───────────────────────────────────────────
// RMOOZ-OFFLINE-AGENT-ARCHITECTURE-P: a smaller context window means less prefill
// work + less memory pressure for local inference. Opt-in only (RMOOZ_OLLAMA_NUM_CTX);
// when unset we return null so the model's own default is used (forcing a too-small
// ctx would truncate the COA prompt). Returns a positive integer or null.
function getNumCtx() {
    var n = parseInt(_s(process.env.RMOOZ_OLLAMA_NUM_CTX), 10);
    return (Number.isFinite(n) && n > 0) ? n : null;
}

// ── One-shot bundle for a task ────────────────────────────────────────────────
function forTask(task) {
    return {
        task:           task || null,
        provider:       getProvider(),
        model:          getModel(task),
        model_source:   modelSource(task),
        timeoutMs:      getTimeoutMs(task),
        repairAttempts: getRepairAttempts(),
        draftAttempts:  getDraftAttempts(),
        keepAlive:      getKeepAlive(),
    };
}

module.exports = {
    TASKS,
    getProvider,
    cloudAllowed,        // RMOOZ-OPENROUTER-QWEN35-CLOUD-MODE-A
    openrouterReady,     // RMOOZ-OPENROUTER-QWEN35-CLOUD-MODE-A
    zenReady,            // RMOOZ-OPENCODE-ZEN-COA-A: gated opencode.ai/zen
    getModel,
    modelSource,
    envDefaultModel,
    envDefaultSource,
    taskModelOverride,
    getTimeoutMs,
    getRepairAttempts,
    getDraftAttempts,
    getKeepAlive,
    getNumCtx,            // RMOOZ-OFFLINE-AGENT-ARCHITECTURE-P
    forTask,
    // exposed for tests / diagnostics
    DEFAULT_TIMEOUT_MS,
    DEFAULT_DRAFT_ATTEMPTS,
    DEFAULT_REPAIR_ATTEMPTS,
};
