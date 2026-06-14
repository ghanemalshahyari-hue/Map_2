'use strict';
/* ============================================================================
 * free-fight-llm-decision.js — FREEFIGHT-LOCAL-LLM-ONLY-A
 * ----------------------------------------------------------------------------
 * Unit-level LLM action bridge for the Free Fight AI Decision Preview.
 *
 * LOCAL-ONLY POLICY: this module ONLY calls local providers (ollama / local).
 * Remote providers (claude, zen, openai, auto) are BLOCKED — the request falls
 * back to deterministic_demo_ai with fallback_reason
 * 'remote_provider_not_allowed_for_free_fight'.
 *
 * Provider resolution (never reads RMOOZ_AI_PROVIDER for this module):
 *   RMOOZ_FREE_FIGHT_LLM_PROVIDER || 'ollama'
 *
 * Model resolution:
 *   RMOOZ_FREE_FIGHT_LLM_MODEL || RMOOZ_LOCAL_LLM_MODEL || RMOOZ_AI_MODEL ||
 *   'qwen3-coder:latest'
 *
 * Controlled by RMOOZ_FREE_FIGHT_LLM=1.  When disabled or on any error,
 * returns a deterministic fallback with a fallback_reason string.
 *
 * Exports:
 *   normalizeAction(raw)                           → action | null  (pure, sync)
 *   askLlmForAction(units, objectives, opts, _p)   → { action, source, fallback_reason,
 *                                                       local_only, provider_policy,
 *                                                       provider_used?, model_used? }
 *   testLlmConnection(opts, _p)                    → { ok, provider, model, latency_ms,
 *                                                       local_only, provider_policy, error? }
 *
 * _p (optional last arg) is an ai-provider override for testing.
 * ========================================================================== */

const aiProvider = require('./ai-provider');
const ENGINE     = require('./free-fight-action-engine');

// ── Local-only provider enforcement ─────────────────────────────────────────
const REMOTE_PROVIDERS_BLOCKED = ['claude', 'zen', 'openai', 'auto'];

function resolveLocalProvider() {
    return (process.env.RMOOZ_FREE_FIGHT_LLM_PROVIDER || 'ollama').toLowerCase().trim();
}
function isRemoteProvider(name) {
    return REMOTE_PROVIDERS_BLOCKED.includes(String(name || '').toLowerCase().trim());
}
function resolveLocalModel() {
    return process.env.RMOOZ_FREE_FIGHT_LLM_MODEL ||
           process.env.RMOOZ_LOCAL_LLM_MODEL       ||
           process.env.RMOOZ_AI_MODEL              ||
           'qwen3-coder:latest';
}

const ALLOWED_ACTION_TYPES = ['MOVE_TOWARD_OBJECTIVE', 'DEFEND_BASE', 'HOLD_POSITION', 'PATROL_NEAR_BASE'];
const ALLOWED_SIDES        = ['RED', 'BLUE'];
const ALLOWED_RISK         = ['low', 'medium', 'high'];
const ALLOWED_CONFIDENCE   = ['low', 'medium', 'high'];

function str(v, max) {
    const s = String(v == null ? '' : v);
    return max ? s.slice(0, max) : s;
}

// ── Schema normalizer ────────────────────────────────────────────────────────
/**
 * normalizeAction(raw) — pure, sync.
 * Returns a valid action object conforming to the engine schema, or null if
 * the raw value cannot be normalized (wrong action_type, missing side, etc.)
 */
function normalizeAction(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const at   = str(raw.action_type).toUpperCase();
    if (!ALLOWED_ACTION_TYPES.includes(at)) return null;
    const side = str(raw.side).toUpperCase();
    if (!ALLOWED_SIDES.includes(side)) return null;
    const uid  = str(raw.unit_uid);
    if (!uid) return null;

    const tgt = (raw.target && typeof raw.target === 'object') ? {
        type: str(raw.target.type || 'coord', 20),
        lat:  Number.isFinite(Number(raw.target.lat)) ? Number(raw.target.lat) : null,
        lon:  Number.isFinite(Number(raw.target.lon)) ? Number(raw.target.lon) : null,
    } : null;

    return {
        action_type: at,
        side:        side,
        unit_uid:    uid,
        target:      tgt,
        reason:      str(raw.reason, 400),
        risk:        ALLOWED_RISK.includes(str(raw.risk).toLowerCase())       ? str(raw.risk).toLowerCase()       : 'medium',
        confidence:  ALLOWED_CONFIDENCE.includes(str(raw.confidence).toLowerCase()) ? str(raw.confidence).toLowerCase() : 'medium',
        source:      'llm',
        demo_only:   true,
        review_only: true,
        needs_review: true,
    };
}

// Strip common LLM preamble ("Here is the JSON:") so JSON.parse succeeds.
function parseJsonSafe(text) {
    const s = str(text).trim();
    const m = s.match(/\{[\s\S]*\}/);
    return JSON.parse(m ? m[0] : s);
}

// ── LLM call ─────────────────────────────────────────────────────────────────
/**
 * askLlmForAction(units, objectives, opts, _providerOverride)
 *   units       — array of proposed_unit objects
 *   objectives  — array of {lat,lon} objects
 *   opts        — { preferSide:'RED'|'BLUE' }
 *   _p          — optional provider override (for tests)
 *
 * Returns { action, source, fallback_reason, provider_used? }.
 * action is null on fallback; source is 'deterministic_demo_ai' on fallback.
 */
async function askLlmForAction(units, objectives, opts, _providerOverride) {
    opts = opts || {};
    const provider = _providerOverride || aiProvider;

    if (process.env.RMOOZ_FREE_FIGHT_LLM !== '1') {
        return { action: null, source: 'deterministic_demo_ai', fallback_reason: 'local_llm_disabled',
                 local_only: true, provider_policy: 'local_only' };
    }

    // LOCAL-ONLY: never read RMOOZ_AI_PROVIDER — Free Fight must not call cloud.
    const providerName = resolveLocalProvider();
    if (isRemoteProvider(providerName)) {
        return { action: null, source: 'deterministic_demo_ai',
                 fallback_reason: 'remote_provider_not_allowed_for_free_fight',
                 local_only: true, provider_policy: 'local_only' };
    }
    const model     = resolveLocalModel();
    let   timeoutMs = parseInt(process.env.RMOOZ_FREE_FIGHT_LLM_TIMEOUT_MS || process.env.RMOOZ_AI_TIMEOUT_MS || '15000', 10);
    if (!Number.isFinite(timeoutMs)) timeoutMs = 15000;

    const system = [
        'You are a military wargame AI for an advisory-only demo exercise.',
        'Return ONLY a JSON object matching the required_output_schema.',
        'No other text, explanation, or preamble.',
        'Do not invent new units or objectives outside the supplied lists.',
    ].join(' ');

    const prompt = JSON.stringify({
        units: (units || []).map(function (u) {
            return { id: u.id, side: u.side, lat: u.lat, lon: u.lon, platform: u.platform || u.type || null };
        }),
        objectives: (objectives || []).map(function (o) {
            return { lat: o.lat, lon: o.lon, name: o.name || o.label || 'Objective X' };
        }),
        preferSide: opts.preferSide || 'RED',
        required_output_schema: {
            action_type: 'MOVE_TOWARD_OBJECTIVE|DEFEND_BASE|HOLD_POSITION|PATROL_NEAR_BASE',
            side:        'RED|BLUE',
            unit_uid:    '<id from the units list>',
            target:      { type: 'objective|base|coord', lat: 0, lon: 0 },
            reason:      '<one sentence max>',
            risk:        'low|medium|high',
            confidence:  'low|medium|high',
            source:      'llm',
        },
    });

    let result;
    try {
        result = await provider.generate({
            provider:   providerName,
            model:      model,
            system:     system,
            prompt:     prompt,
            format:     'json',
            options:    { temperature: 0.1, numPredict: 400 },
            timeoutMs:  timeoutMs,
        });
    } catch (e) {
        return { action: null, source: 'deterministic_demo_ai',
                 fallback_reason: 'local_llm_error: ' + str(e && e.message || e, 120),
                 local_only: true, provider_policy: 'local_only' };
    }

    if (!result || !result.ok) {
        return { action: null, source: 'deterministic_demo_ai',
                 fallback_reason: 'local_llm_unavailable: ' + str(result && result.error, 120),
                 local_only: true, provider_policy: 'local_only' };
    }

    let parsed;
    try { parsed = parseJsonSafe(result.response || ''); }
    catch (e) { return { action: null, source: 'deterministic_demo_ai', fallback_reason: 'llm_invalid_json',
                         local_only: true, provider_policy: 'local_only' }; }

    const normalized = normalizeAction(parsed);
    if (!normalized) {
        return { action: null, source: 'deterministic_demo_ai', fallback_reason: 'llm_invalid_schema',
                 local_only: true, provider_policy: 'local_only' };
    }

    const validation = ENGINE.validateAction(normalized, units, objectives);
    if (!validation.ok) {
        return { action: null, source: 'deterministic_demo_ai',
                 fallback_reason: 'llm_validation_failed: ' + str(validation.reason, 120),
                 local_only: true, provider_policy: 'local_only' };
    }

    return {
        action:          normalized,
        source:          'llm',
        fallback_reason: null,
        provider_used:   result.providerUsed || providerName,
        model_used:      model,
        local_only:      true,
        provider_policy: 'local_only',
    };
}

// ── Health probe ─────────────────────────────────────────────────────────────
/**
 * testLlmConnection(opts, _providerOverride)
 * Returns { ok, provider, model, latency_ms, error? }
 */
async function testLlmConnection(opts, _providerOverride) {
    const provider     = _providerOverride || aiProvider;
    // LOCAL-ONLY: never read RMOOZ_AI_PROVIDER.
    const providerName = resolveLocalProvider();
    const model        = resolveLocalModel();
    const start        = Date.now();

    // Remote-provider check runs before the disabled check so a misconfigured
    // env is caught immediately regardless of the RMOOZ_FREE_FIGHT_LLM flag.
    if (isRemoteProvider(providerName)) {
        return { ok: false, reason: 'remote_provider_not_allowed_for_free_fight',
                 provider: 'ollama', model: model || null, latency_ms: 0,
                 local_only: true, provider_policy: 'local_only' };
    }

    if (process.env.RMOOZ_FREE_FIGHT_LLM !== '1') {
        return { ok: false, reason: 'llm_disabled', provider: providerName, model: model || null,
                 latency_ms: 0, local_only: true, provider_policy: 'local_only' };
    }

    try {
        const result = await provider.generate({
            provider:  providerName,
            model:     model,
            system:    'Reply with exactly: {"ok":true}',
            prompt:    '{"test":true}',
            format:    'json',
            options:   { temperature: 0, numPredict: 20 },
            timeoutMs: 8000,
        });
        const latency_ms = Date.now() - start;
        if (!result || !result.ok) {
            return { ok: false, provider: result && result.providerUsed || providerName, model: model || null,
                     latency_ms, error: str(result && result.error, 200),
                     local_only: true, provider_policy: 'local_only' };
        }
        return { ok: true, provider: result.providerUsed || providerName, model: model || null,
                 latency_ms, local_only: true, provider_policy: 'local_only' };
    } catch (e) {
        return { ok: false, provider: providerName, model: model || null, latency_ms: Date.now() - start,
                 error: str(e && e.message || e, 200), local_only: true, provider_policy: 'local_only' };
    }
}

module.exports = { normalizeAction, askLlmForAction, testLlmConnection };
