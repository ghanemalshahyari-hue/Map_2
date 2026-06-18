'use strict';
/* ============================================================================
 * green-summarizer.js — RMOOZ-BLUE-RED-GREEN-WHITE-A  (optional SMALL-model role)
 * ----------------------------------------------------------------------------
 * A SCAFFOLD for the "summarizer" role: turn a STRUCTURED assessment (e.g. the
 * green-world neutral-world struct, a replan reason, or a turn delta) into a
 * short operator note. It NEVER plans, NEVER moves units, NEVER decides — it
 * only compresses already-computed facts into ≤2 sentences.
 *
 * POLICY (owner ruling):
 *   - OFF by default. The LLM path runs ONLY when BOTH gates are on:
 *       RMOOZ_LLM_SUMMARIZER=1   (opt-in to the small-model note)
 *       RMOOZ_ALLOW_SIM_RUN=1    (the single AI-execution gate)
 *   - Uses a SMALL model (RMOOZ_LLM_MODEL_SUMMARIZER, e.g. llama3.2:3b / gemma3:4b)
 *     resolved via llm-runtime-config task 'summarizer'; tiny output cap.
 *   - ALWAYS has a deterministic fallback (no LLM): if disabled, no model, or any
 *     error, it returns the struct's own notes joined into one line. So callers
 *     get a usable note offline with zero LLM cost.
 *
 * `summarize` is async and accepts an injected `_generate` (defaults to
 * ollama-client.generate) so it is unit-testable without a network.
 * ========================================================================== */

var LLM_CFG = require('./llm-runtime-config');

var DEFAULT_SUMMARY_TOKENS = 200;   // short by design — a note, not an essay

// Both gates must be on for the LLM path. Deterministic-first otherwise.
function summarizerEnabled() {
    return String(process.env.RMOOZ_LLM_SUMMARIZER || '') === '1'
        && String(process.env.RMOOZ_ALLOW_SIM_RUN || '') === '1';
}

// Deterministic note from a struct — ALWAYS available, no LLM. Prefers an explicit
// `notes` array (green-world), else a `reason`/`message`, else a compact JSON tail.
function deterministicSummary(assessment) {
    if (!assessment) return '';
    if (Array.isArray(assessment.notes) && assessment.notes.length) return assessment.notes.join(' ');
    if (typeof assessment.reason === 'string' && assessment.reason) return assessment.reason;
    if (typeof assessment.message === 'string' && assessment.message) return assessment.message;
    try { return JSON.stringify(assessment).slice(0, 240); } catch (_) { return ''; }
}

function buildPrompt(assessment, kind) {
    var facts = deterministicSummary(assessment);
    return 'You are a military staff summariser. In at most two short sentences, plainly state the '
        + (kind || 'situation') + ' for the operator. Do NOT invent facts, do NOT give orders or recommend '
        + 'movement — only restate these computed facts:\n' + facts;
}

/**
 * summarize(assessment, opts) → Promise<{ ok, source, note, llm_called, model? }>
 *   source: 'deterministic' | 'llm'
 *   opts.kind        label for the prompt (e.g. 'civilian reaction', 'why blocked', 'turn delta')
 *   opts._generate   injected generate fn (test seam); defaults to ollama-client.generate
 */
function summarize(assessment, opts) {
    opts = opts || {};
    var deterministic = deterministicSummary(assessment);
    if (!summarizerEnabled()) {
        return Promise.resolve({ ok: true, source: 'deterministic', note: deterministic, llm_called: false });
    }
    var model = LLM_CFG.getModel('summarizer');
    var generate = (typeof opts._generate === 'function') ? opts._generate
        : function (a) { return require('./ollama-client').generate(a); };
    return Promise.resolve(generate({
        model: model,
        prompt: buildPrompt(assessment, opts.kind),
        options: { num_predict: DEFAULT_SUMMARY_TOKENS, temperature: 0.2 },
        timeoutMs: opts.timeoutMs || 30000,
    })).then(function (r) {
        var text = r && r.ok && typeof r.response === 'string' ? r.response.trim() : '';
        if (!text) return { ok: true, source: 'deterministic', note: deterministic, llm_called: !!(r && r.ok), model: model };
        return { ok: true, source: 'llm', note: text, llm_called: true, model: model };
    }).catch(function () {
        return { ok: true, source: 'deterministic', note: deterministic, llm_called: false };
    });
}

module.exports = {
    summarize: summarize,
    deterministicSummary: deterministicSummary,
    summarizerEnabled: summarizerEnabled,
};
