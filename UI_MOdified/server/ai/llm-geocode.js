'use strict';
/* ============================================================================
 * llm-geocode.js — RMOOZ-RESOLVER-LLM-FALLBACK-A
 * ----------------------------------------------------------------------------
 * "Ask an LLM for a location" — the LOWEST resolver rung, used only after
 * gazetteer / fuzzy / MGRS fail. Provider-agnostic via the canonical runtime
 * resolver (llm-runtime-config):
 *
 *   - LOCAL FIRST  : provider 'ollama' (or any local runtime) is the default.
 *   - GATED CLOUD  : provider 'openrouter' is used ONLY when the operator has
 *                    explicitly enabled it (RMOOZ_ALLOW_CLOUD_AI=1 + key →
 *                    llm-runtime-config.openrouterReady() === true).
 *   - BLOCKED      : any other remote provider (zen/claude/openai/auto), or a
 *                    not-ready openrouter, returns { ok:false } — the caller
 *                    then leaves the place UNRESOLVED (candidate / review).
 *
 * GUARDRAILS (enforced by the caller in location-intelligence.js):
 *   coord_status: 'candidate' · needs_review: true · exact_unit_position: false
 *   source: 'local_llm' | 'gated_cloud_llm' · confidence + provenance visible.
 * This module NEVER returns an "exact" placement and NEVER does a web/HTTP
 * lookup of its own — it only asks the configured LLM provider.
 * ========================================================================== */

const LLM = require('./llm-runtime-config');
let OLLAMA = null, OPENROUTER = null, ZEN = null;
try { OLLAMA = require('./ollama-client'); } catch (_) { /* optional */ }
try { OPENROUTER = require('./openrouter-client'); } catch (_) { /* optional */ }
try { ZEN = require('./zen-client'); } catch (_) { /* optional */ }
// opencode.ai/zen is a SECOND gated cloud provider (parallel to openrouter):
// usable ONLY when the operator has EXPLICITLY enabled it (RMOOZ_ALLOW_CLOUD_AI=1
// + OPENCODE_ZEN_API_KEY). Otherwise zen stays blocked like any remote provider.
function zenReady() { return String(process.env.RMOOZ_ALLOW_CLOUD_AI || '') === '1' && !!String(process.env.OPENCODE_ZEN_API_KEY || '').trim(); }

// Strict shape for providers that support structured output (OpenRouter json_schema).
const GEO_SCHEMA = {
    type: 'object', additionalProperties: false,
    properties: {
        lat: { type: ['number', 'null'] },
        lon: { type: ['number', 'null'] },
        confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        reasoning: { type: 'string' },
    },
    required: ['lat', 'lon', 'confidence'],
};

function inLat(v) { return typeof v === 'number' && isFinite(v) && v >= -90 && v <= 90; }
function inLon(v) { return typeof v === 'number' && isFinite(v) && v >= -180 && v <= 180; }

function buildPrompt(name, ctx) {
    ctx = ctx || {};
    var hints = [];
    if (ctx.country) hints.push('country: ' + ctx.country);
    if (ctx.kind) hints.push('type: ' + ctx.kind);
    if (ctx.side) hints.push('side: ' + ctx.side);
    return [
        'You are a careful military geo-locator. Given a named place (usually a military',
        'air base, naval base, port, or land garrison), return its APPROXIMATE WGS84',
        'coordinate in decimal degrees.',
        '',
        'Place: "' + String(name).trim() + '"' + (hints.length ? '  (' + hints.join(', ') + ')' : ''),
        '',
        'Rules:',
        '- Return ONLY a JSON object: {"lat": <number|null>, "lon": <number|null>, "confidence": "high|medium|low", "reasoning": "<short>"}.',
        '- If you are NOT reasonably sure where this specific place is, return lat=null and lon=null. Do NOT guess wildly.',
        '- Decimal degrees only (e.g. 24.43, 54.55). No MGRS, no DMS, no prose outside the JSON.',
    ].join('\n');
}

/**
 * geocodeNamedPlace(name, ctx) → Promise<result>
 *  ok:true  → { ok, lat, lon, confidence, reasoning, source, provider, model, raw }
 *  ok:false → { ok:false, reason, provider?, model? }   (caller leaves it unresolved)
 * `source` is 'local_llm' (ollama/local) or 'gated_cloud_llm' (openrouter).
 */
async function geocodeNamedPlace(name, ctx) {
    name = String(name == null ? '' : name).trim();
    if (!name) return { ok: false, reason: 'empty_name' };

    var provider = LLM.getProvider();
    var isZen = (provider === 'zen' || provider === 'opencode');
    // Provider gating — LOCAL FIRST. The only allowed cloud providers are an
    // EXPLICITLY-enabled openrouter or opencode.ai/zen. Any other remote → blocked
    // (caller then leaves the place unresolved / review-needed).
    var cloudReady = (provider === 'openrouter' && LLM.openrouterReady()) || (isZen && zenReady());
    if (provider !== 'ollama' && !cloudReady) {
        return { ok: false, reason: 'provider_blocked_local_only', provider: provider };
    }

    var isCloud = (provider === 'openrouter') || isZen;
    var client = (provider === 'openrouter') ? OPENROUTER : isZen ? ZEN : OLLAMA;
    if (!client || typeof client.generate !== 'function') {
        return { ok: false, reason: 'no_client_for_provider', provider: provider };
    }

    // Model: each cloud provider uses its own slug; local uses the runtime-resolved model.
    var model;
    if (provider === 'openrouter') {
        model = (ctx && ctx.model) || process.env.RMOOZ_LLM_MODEL_GEOCODE || process.env.RMOOZ_OPENROUTER_MODEL
            || (typeof client.DEFAULT_MODEL === 'function' ? client.DEFAULT_MODEL() : null) || null;
    } else if (isZen) {
        model = (ctx && ctx.model) || process.env.RMOOZ_LLM_MODEL_GEOCODE || process.env.RMOOZ_ZEN_MODEL
            || (typeof client.DEFAULT_MODEL === 'function' ? client.DEFAULT_MODEL() : null) || null;
    } else {
        // local: explicit caller override (ctx.model) → task env → runtime resolver.
        model = (ctx && ctx.model) || process.env.RMOOZ_LLM_MODEL_GEOCODE || LLM.getModel('geocode');
    }
    var timeoutMs = (typeof LLM.getTimeoutMs === 'function' ? LLM.getTimeoutMs('geocode') : 0) || 60000;

    var res;
    try {
        res = await client.generate({
            prompt: buildPrompt(name, ctx),
            model: model || undefined,
            schema: GEO_SCHEMA, schemaName: 'geocode', format: 'json',
            // higher cap so cloud REASONING models (which spend tokens in
            // reasoning_content before answering) still emit the final JSON.
            options: { temperature: 0.1, num_predict: 256, max_tokens: 700, top_p: 0.9 },
            timeoutMs: timeoutMs,
        });
    } catch (e) {
        return { ok: false, reason: 'llm_error: ' + String((e && e.message) || e).slice(0, 160), provider: provider, model: model };
    }
    if (!res || !res.ok) return { ok: false, reason: 'llm_unavailable: ' + String((res && res.error) || '?').slice(0, 160), provider: provider, model: model };

    // Some cloud reasoning models leave message.content empty and place the answer
    // in message.reasoning_content — use it as a fallback before giving up.
    var rc = res.raw && res.raw.choices && res.raw.choices[0] && res.raw.choices[0].message && res.raw.choices[0].message.reasoning_content;
    var obj = null;
    try { var t = String(res.response || rc || '').trim(); var m = t.match(/\{[\s\S]*\}/); obj = JSON.parse(m ? m[0] : t); } catch (_) { obj = null; }
    if (!obj || !inLat(obj.lat) || !inLon(obj.lon)) {
        return { ok: false, reason: 'no_coordinate', provider: provider, model: model, raw: String(res.response || '').slice(0, 200) };
    }

    return {
        ok: true,
        lat: obj.lat, lon: obj.lon,
        confidence: (obj.confidence === 'high' || obj.confidence === 'medium') ? obj.confidence : 'low',
        reasoning: obj.reasoning ? String(obj.reasoning).slice(0, 200) : null,
        source: isCloud ? 'gated_cloud_llm' : 'local_llm',
        provider: provider, model: model,
        raw: String(res.response || '').slice(0, 300),
    };
}

module.exports = { geocodeNamedPlace, buildPrompt, GEO_SCHEMA, _inLat: inLat, _inLon: inLon };
