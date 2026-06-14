/**
 * ai-json.js — shared JSON extraction from raw LLM responses
 *
 * Handles all the noise that real LLMs emit around the JSON object:
 *   • <think>…</think> reasoning blocks (qwen3-coder, DeepSeek-R1, etc.)
 *   • markdown code fences  ```json … ```
 *   • leading/trailing prose
 *   • outermost-brace slicing with tolerant JSON.parse
 *
 * This was extracted from step1-llm-fill.js (AI-GLOBAL-REFACTOR-PHASE-1-A).
 * Behavior is identical to the original — no logic change.
 */
'use strict';

/**
 * extractJson(raw) → object | null
 *
 * Strips noise, finds the outermost { … } block, and parses it.
 * Returns null on any failure — never throws.
 */
function extractJson(raw) {
    if (!raw || typeof raw !== 'string') return null;
    var s = raw.trim();
    // Strip <think>…</think> reasoning blocks emitted by thinking models
    s = s.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    // Strip markdown code fence if present
    var fenceMatch = s.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) s = fenceMatch[1].trim();
    // Find the outermost { ... }
    var start = s.indexOf('{');
    var end   = s.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    try { return JSON.parse(s.slice(start, end + 1)); }
    catch (_) { return null; }
}

module.exports = { extractJson };
