'use strict';
/* ============================================================================
 * model-selection.js — RMOOZ-LOCAL-MODEL-SELECTOR-A
 * ----------------------------------------------------------------------------
 * SINGLE SOURCE OF TRUTH for "which local model does the app use right now".
 *
 * Before this module, every AI surface resolved its own model from a different
 * env-var chain (free-fight used RMOOZ_FREE_FIGHT_MODEL first and ignored the
 * RMOOZ_OLLAMA_MODEL the operator already had set, defaulting to an uninstalled
 * 'qwen3-coder:latest'). That meant the operator had to edit env vars to switch
 * models. Now the operator picks a model in the RMOOZ UI; the choice persists to
 * runtime/ai-model-selection.json and EVERY AI surface reads it from here:
 *   - ollama-client.js (the default model for /api/ai/generate, /coa, /chat,
 *     adjudicate, monte-carlo — anything that doesn't pass an explicit model)
 *   - free-fight-llm-decision.js / free-fight-coa-planner.js /
 *     free-fight-llm-capability-analyst.js / free-fight-llm-plan.js
 *
 * RESOLUTION PRECEDENCE (highest → lowest):
 *   1. runtime selection (runtime/ai-model-selection.json) — if valid (owned HERE)
 *   2..N. the env default chain + ai-config committed default — DELEGATED to
 *         llm-runtime-config.js (RMOOZ-LLM-RUNTIME-CONFIG-A): RMOOZ_LLM_MODEL →
 *         RMOOZ_OLLAMA_MODEL → RMOOZ_FREE_FIGHT_MODEL → RMOOZ_LOCAL_LLM_MODEL →
 *         RMOOZ_AI_MODEL → ai-config.defaultModel. This module NO LONGER reads
 *         model/provider env vars directly — it only owns the runtime UI pick.
 *
 * This module does NO network I/O on purpose — it must be safe to require from
 * ollama-client.js without a cycle. Availability (is the model actually pulled
 * in Ollama?) is checked at the route layer via the live /api/tags probe; the
 * SELECTION here is independent of availability so an operator can pre-pick a
 * model they are about to pull. The execution gate (RMOOZ_ALLOW_SIM_RUN) and the
 * model_available signal block a run on an absent model — we never silently
 * swap to a different model.
 *
 * Exports:
 *   getSelectedModel()            → string   (the effective model, per precedence)
 *   getProvider()                 → string   (local provider name, e.g. 'ollama')
 *   setSelectedModel(model)       → { ok, selected_model, persisted, file, error? }
 *   getSelectionInfo()            → { selected_model, source, provider, file, persisted }
 *   clearSelection()              → { ok }   (forget runtime selection → env chain)
 *   _setSelectionFileForTest(p)   test hook — override the persistence path
 *   _reloadForTest()              test hook — re-read the file from disk
 * ========================================================================== */

const fs   = require('fs');
const path = require('path');
const AI_CONFIG = require('./ai-config'); // for the committed default model (single source)
const LLM_CFG   = require('./llm-runtime-config'); // RMOOZ-LLM-RUNTIME-CONFIG-A: canonical env/default resolver

// UI_MOdified/ (server/ai/ → ../../ ). Persisted selection lives under runtime/.
const REPO_ROOT = path.join(__dirname, '..', '..');
const DEFAULT_FILE = path.join(REPO_ROOT, 'runtime', 'ai-model-selection.json');

let _fileOverride = null;            // test hook
let _loaded       = false;
let _selected     = null;            // the runtime-file model selection (null = none/invalid)
let _selectedProvider = null;        // the runtime-file provider ('openrouter'|'ollama'|null) — RMOOZ-OPENROUTER-QWEN35-CLOUD-MODE-A

function selectionFile() {
    return _fileOverride || process.env.RMOOZ_AI_MODEL_SELECTION_FILE || DEFAULT_FILE;
}

// Read the persisted selection. Corrupt/missing file → null (safe fallback to env).
function load() {
    _loaded = true;
    _selected = null;
    _selectedProvider = null;
    let raw;
    try { raw = fs.readFileSync(selectionFile(), 'utf8'); }
    catch (e) { return; } // no file yet → env precedence
    try {
        const obj = JSON.parse(raw);
        const m = obj && typeof obj.model === 'string' ? obj.model.trim() : '';
        if (m) _selected = m;
        const pr = obj && typeof obj.provider === 'string' ? obj.provider.trim().toLowerCase() : '';
        if (pr) _selectedProvider = pr;
    } catch (e) {
        // Corrupt JSON — log once, fall back to env precedence (never throw).
        console.warn('[model-selection] ' + selectionFile() + ' is not valid JSON; ignoring (falling back to env/default).');
    }
}

// The local provider name. The app is locked to local Ollama; free-fight may set
// RMOOZ_FREE_FIGHT_PROVIDER but a remote value is never reported as the provider.
// RMOOZ-LLM-RUNTIME-CONFIG-A: the raw provider comes from the canonical resolver;
// model-selection only CLAMPS it for display (the actual remote-block lives in the
// feature modules).
function getProvider() {
    const p = LLM_CFG.getProvider();
    if (p === 'ollama' || p === 'local') return p;
    // RMOOZ-OPENROUTER-QWEN35-CLOUD-MODE-A: openrouter is reported as the active provider ONLY in
    // explicit cloud mode (gate + key). Any other remote (zen/claude/...) is never reported.
    if (p === 'openrouter' && LLM_CFG.openrouterReady()) return 'openrouter';
    return 'ollama';
}
// RMOOZ-OPENROUTER-QWEN35-CLOUD-MODE-A: the RAW provider the operator persisted in the runtime
// file (e.g. 'openrouter'), un-clamped. Used by llm-runtime-config.getProvider() to resolve the
// effective provider; the actual cloud gate is enforced by isRemoteProvider/ai-provider.
function selectedProviderRaw() {
    if (!_loaded) load();
    return _selectedProvider || '';
}

// The effective model, by precedence. The runtime-file selection (operator UI
// pick) wins; otherwise the env default + ai-config committed default come from
// the canonical resolver (RMOOZ-LLM-RUNTIME-CONFIG-A — single source for env reads).
function getSelectedModel() {
    if (!_loaded) load();
    if (_selected) return _selected;
    return LLM_CFG.envDefaultModel();
}

// Where did the effective model come from? (for diagnostics / route health)
function selectionSource() {
    if (!_loaded) load();
    if (_selected) return 'runtime_selection';
    return LLM_CFG.envDefaultSource();
}

// Persist + adopt a new selection. Validates a non-empty string; does NOT require
// the model to be installed (availability is gated separately at run time).
function setSelectedModel(model, provider) {
    const m = (typeof model === 'string') ? model.trim() : '';
    if (!m) return { ok: false, error: 'model must be a non-empty string', selected_model: getSelectedModel() };
    if (m.length > 200) return { ok: false, error: 'model name too long', selected_model: getSelectedModel() };

    // RMOOZ-OPENROUTER-QWEN35-CLOUD-MODE-A: only ollama (local) and openrouter (gated cloud) are
    // selectable. zen/claude/etc. are never selectable here. Default to ollama when unspecified.
    let prov = (typeof provider === 'string') ? provider.trim().toLowerCase() : '';
    if (prov && prov !== 'ollama' && prov !== 'local' && prov !== 'openrouter') {
        return { ok: false, error: 'unsupported provider "' + prov + '" (only ollama or openrouter)', selected_model: getSelectedModel() };
    }
    if (!prov) prov = 'ollama';

    _selected = m;
    _selectedProvider = prov;
    _loaded = true;

    const file = selectionFile();
    const record = {
        model:      m,
        provider:   prov,
        source:     'ui_selection',
        updated_at: new Date().toISOString(),
    };
    try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, JSON.stringify(record, null, 2) + '\n', 'utf8');
        return { ok: true, selected_model: m, selected_provider: prov, persisted: true, file: file };
    } catch (e) {
        // In-memory selection still applies for this process even if the disk
        // write failed (read-only fs, etc.) — report it so the UI can warn.
        return { ok: true, selected_model: m, selected_provider: prov, persisted: false, file: file,
                 warning: 'selection applied in-memory but could not be persisted: ' + (e && e.message || e) };
    }
}

// Forget the runtime selection (delete the file) → resolution falls to the env
// chain / default. Used by tests and a possible "reset to default" UI control.
function clearSelection() {
    _selected = null;
    _selectedProvider = null;
    _loaded = true;
    try { fs.unlinkSync(selectionFile()); } catch (e) { /* already absent */ }
    return { ok: true };
}

function getSelectionInfo() {
    if (!_loaded) load();
    const file = selectionFile();
    let persisted = false;
    try { persisted = fs.existsSync(file); } catch (e) { persisted = false; }
    return {
        selected_model: getSelectedModel(),
        source:         selectionSource(),
        provider:       getProvider(),
        // RMOOZ-OPENROUTER-QWEN35-CLOUD-MODE-A: cloud diagnostics for the model HUD.
        is_cloud:       getProvider() === 'openrouter',
        cloud_allowed:  LLM_CFG.cloudAllowed(),
        file:           file,
        persisted:      persisted,
    };
}

// ── test hooks ───────────────────────────────────────────────────────────────
function _setSelectionFileForTest(p) { _fileOverride = p || null; _loaded = false; _selected = null; _selectedProvider = null; }
function _reloadForTest() { _loaded = false; _selected = null; _selectedProvider = null; load(); }

module.exports = {
    getSelectedModel,
    getProvider,
    selectedProviderRaw,     // RMOOZ-OPENROUTER-QWEN35-CLOUD-MODE-A
    setSelectedModel,
    clearSelection,
    getSelectionInfo,
    selectionSource,
    _setSelectionFileForTest,
    _reloadForTest,
};
