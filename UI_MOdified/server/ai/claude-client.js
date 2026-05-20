/**
 * Claude (Anthropic) client wrapper.
 *
 * Mirrors the public surface of ollama-client.js so the rest of the code
 * (adjudicator-agent, monte-carlo-runner, web-server routes) can be
 * provider-agnostic via ai-provider.js.
 *
 * Public surface:
 *   ping()                            → { ok, model, defaultModel, error? }
 *   generate({ model, system, prompt, format, options, timeoutMs,
 *              systemCacheable, promptCacheable })
 *                                     → { ok, response, raw, usage, error? }
 *
 * Caching strategy (the latency + cost win):
 *   - `system` (or `systemCacheable`) is sent as a single content block with
 *     `cache_control: { type: 'ephemeral' }`. After the first call within
 *     a 5-min window the system tokens are billed at ~10% of normal cost
 *     and read at full speed.
 *   - `promptCacheable` is an optional second cache breakpoint inside the
 *     user message — pass the scenario constants here so they're cached
 *     per-scenario, and put per-step state in `prompt` (uncached).
 *
 * The SDK is loaded lazily so the module imports cleanly even if the
 * dependency isn't installed yet (the caller will see an ok:false error
 * with a helpful install hint rather than an unhandled throw).
 */

'use strict';

const cfg = require('./ai-config');

let _sdk = null;
let _client = null;
let _loadError = null;

function loadSdk() {
    if (_sdk || _loadError) return;
    try {
        // eslint-disable-next-line global-require
        _sdk = require('@anthropic-ai/sdk');
    } catch (e) {
        _loadError = e;
    }
}

function getClient() {
    loadSdk();
    if (_loadError) {
        const hint = _loadError.code === 'MODULE_NOT_FOUND'
            ? 'Run: npm install --prefix UI_MOdified @anthropic-ai/sdk'
            : _loadError.message;
        throw new Error(`@anthropic-ai/sdk not available: ${hint}`);
    }
    const apiKey = (cfg.claude && cfg.claude.apiKey || '').trim();
    if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY is not set. See UI_MOdified/.env.example.');
    }
    if (!_client || _client.__apiKeyTail !== apiKey.slice(-6)) {
        const Anthropic = _sdk.Anthropic || _sdk.default || _sdk;
        _client = new Anthropic({
            apiKey,
            timeout: cfg.claude.requestTimeoutMs || 90000,
            maxRetries: 1,
        });
        _client.__apiKeyTail = apiKey.slice(-6);
    }
    return _client;
}

function isConfigured() {
    return Boolean(cfg.claude && cfg.claude.apiKey && cfg.claude.apiKey.trim());
}

function maskedKey() {
    const k = (cfg.claude && cfg.claude.apiKey || '').trim();
    if (!k) return null;
    if (k.length <= 6) return '••••';
    return '••••' + k.slice(-4);
}

// Build a system content block array with cache_control on the static
// prefix. Empty string → null so the SDK omits the system parameter.
function buildSystem(systemText) {
    const s = String(systemText || '').trim();
    if (!s) return null;
    return [{
        type: 'text',
        text: s,
        cache_control: { type: 'ephemeral' },
    }];
}

// Build the user message content. If a `cacheable` chunk is supplied, the
// user message becomes a two-block array with the cacheable block marked.
// Otherwise it's a single text block (string form is also valid for the
// SDK, but we use an array for consistency).
function buildUserContent(promptCacheable, prompt) {
    const cached = String(promptCacheable || '').trim();
    const dyn    = String(prompt || '').trim();
    if (cached && dyn) {
        return [
            { type: 'text', text: cached, cache_control: { type: 'ephemeral' } },
            { type: 'text', text: dyn },
        ];
    }
    if (cached) {
        return [{ type: 'text', text: cached, cache_control: { type: 'ephemeral' } }];
    }
    return [{ type: 'text', text: dyn || '' }];
}

// Strip leading markdown code fences from the response. Claude is usually
// good at "JSON only", but ~5% of the time it wraps the JSON in ```json … ```.
function stripCodeFence(s) {
    if (!s) return s;
    let t = s.trim();
    if (t.startsWith('```')) {
        const firstNl = t.indexOf('\n');
        if (firstNl > 0) t = t.slice(firstNl + 1);
        if (t.endsWith('```')) t = t.slice(0, -3);
    }
    return t.trim();
}

// Extract token-usage and cache stats from the Anthropic response. Both
// regular and cache_creation / cache_read fields are returned so the MC
// runner can compute hit rate and cost.
function extractUsage(msg) {
    const u = msg && msg.usage || {};
    return {
        input_tokens:               u.input_tokens || 0,
        output_tokens:              u.output_tokens || 0,
        cache_creation_input_tokens:u.cache_creation_input_tokens || 0,
        cache_read_input_tokens:    u.cache_read_input_tokens || 0,
    };
}

// ── Health check ─────────────────────────────────────────────────────
async function ping() {
    if (!isConfigured()) {
        return {
            ok: false,
            apiStyle: 'claude',
            error: 'ANTHROPIC_API_KEY not set',
            auth: null,
        };
    }
    try {
        const client = getClient();
        // Anthropic has no /v1/models GET; use a tiny chat call as the health
        // probe. ~1 token, ~$0.0001. Surfaces network + auth issues cleanly.
        const probe = await client.messages.create({
            model: cfg.claude.defaultModel,
            max_tokens: 4,
            messages: [{ role: 'user', content: 'ping' }],
        });
        return {
            ok: true,
            apiStyle: 'claude',
            defaultModel: cfg.claude.defaultModel,
            models: [cfg.claude.defaultModel],
            auth: maskedKey(),
            probeId: probe.id,
        };
    } catch (e) {
        return {
            ok: false,
            apiStyle: 'claude',
            defaultModel: cfg.claude.defaultModel,
            error: e.message || String(e),
            auth: maskedKey(),
        };
    }
}

// ── Generate ─────────────────────────────────────────────────────────
/**
 * Non-streaming generation, mirroring ollama-client.generate().
 *
 * Args:
 *   model            override the default model
 *   system           system prompt (string); cached automatically
 *   prompt           user message text
 *   promptCacheable  optional cached prefix inside the user message
 *                    (use for scenario constants that repeat across steps)
 *   format           kept for surface parity with ollama-client; Claude does
 *                    not have a JSON mode, the prompt enforces JSON output
 *   options          { temperature, max_tokens, top_p, stop_sequences }
 *   timeoutMs        per-call timeout override
 *
 * Returns:
 *   { ok, response, raw, usage, error? }
 *   `response` is the assistant text with markdown fences stripped if any.
 */
async function generate(args) {
    args = args || {};
    if (!args.prompt && !args.promptCacheable) {
        return { ok: false, error: 'prompt (string) is required' };
    }
    if (!isConfigured()) {
        return { ok: false, error: 'ANTHROPIC_API_KEY not set' };
    }

    let client;
    try { client = getClient(); }
    catch (e) { return { ok: false, error: e.message || String(e) }; }

    const opts = args.options || {};
    const body = {
        model:       args.model || cfg.claude.defaultModel,
        max_tokens:  Number.isFinite(opts.max_tokens) ? opts.max_tokens
                   : Number.isFinite(opts.num_predict) ? opts.num_predict
                   : cfg.claude.maxTokens,
        temperature: Number.isFinite(opts.temperature) ? opts.temperature : 0.85,
        messages: [{
            role:    'user',
            content: buildUserContent(args.promptCacheable, args.prompt),
        }],
    };
    const sys = buildSystem(args.system);
    if (sys) body.system = sys;
    if (Number.isFinite(opts.top_p)) body.top_p = opts.top_p;
    if (Array.isArray(opts.stop_sequences)) body.stop_sequences = opts.stop_sequences;

    const timeoutMs = args.timeoutMs || cfg.claude.requestTimeoutMs || 90000;

    try {
        const msg = await client.messages.create(body, { timeout: timeoutMs });
        // content is an array of blocks; we expect a single text block for
        // the JSON adjudicator response. Concatenate any text blocks just
        // in case the model splits its output.
        const text = (msg.content || [])
            .filter(b => b && b.type === 'text')
            .map(b => b.text || '')
            .join('');
        return {
            ok: true,
            response: stripCodeFence(text),
            raw: msg,
            usage: extractUsage(msg),
        };
    } catch (e) {
        // Anthropic SDK throws APIError with structured fields; surface the
        // most useful bits for the caller's fallback path.
        const status = e && (e.status || e.statusCode);
        const code   = e && (e.code || (e.error && e.error.type));
        const detail = e && (e.message || String(e));
        return {
            ok: false,
            error: detail,
            status: status || null,
            code:   code   || null,
        };
    }
}

module.exports = {
    ping,
    generate,
    isConfigured,
    DEFAULT_MODEL: () => cfg.claude && cfg.claude.defaultModel,
    API_STYLE: 'claude',
};
