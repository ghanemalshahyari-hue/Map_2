/**
 * AI provider router.
 *
 * The single entry point for the adjudicator, COA agent, and Monte Carlo
 * runner. Translates a `provider` arg ('ollama' | 'claude' | 'auto') into
 * the right backend call, applies caching where supported, and handles
 * the auto-fallback path.
 *
 * Why this module exists:
 *   - ollama-client.js predates Claude; its name still implies a single
 *     backend even though it already speaks two dialects.
 *   - claude-client.js needs a different prompt structure (XML tags,
 *     cache_control markers) than ollama needs.
 *   - We want one place to decide which backend handles which call so
 *     calling code (adjudicator-agent.js, web-server.js) doesn't grow
 *     `if (provider === 'claude') ... else ...` everywhere.
 *
 * Public surface:
 *   resolveProvider(name)        → 'ollama' | 'claude'   (handles 'auto')
 *   generate({ provider, ... })  → { ok, response, raw, usage?, error?, providerUsed }
 *   getStatus()                  → { available, default, health: {...} }
 */

'use strict';

const cfg          = require('./ai-config');
const ollamaClient = require('./ollama-client');
const claudeClient = require('./claude-client');
const zenClient    = require('./zen-client');

const VALID = new Set(['ollama', 'claude', 'zen', 'auto']);

function envProvider() {
    const v = String(process.env.RMOOZ_AI_PROVIDER || '').trim().toLowerCase();
    return VALID.has(v) ? v : '';
}

function configuredDefault() {
    // Explicit env > overlay/config > derived (auto-prefer-claude-then-zen).
    const fromEnv = envProvider();
    if (fromEnv) return fromEnv;
    if (cfg.aiProvider && VALID.has(String(cfg.aiProvider).toLowerCase())) {
        return String(cfg.aiProvider).toLowerCase();
    }
    if (claudeClient.isConfigured() || zenClient.isConfigured()) return 'auto';
    return 'ollama';
}

/**
 * Resolve a possibly-'auto' provider name to a concrete backend, given
 * what's currently available. Returns 'ollama' if the requested provider
 * is unavailable AND the caller asked for 'auto'; throws an error if the
 * caller forced a provider that isn't configured.
 */
function resolveProvider(requested) {
    const raw = String(requested || configuredDefault()).toLowerCase();
    const name = VALID.has(raw) ? raw : configuredDefault();
    if (name === 'claude') {
        if (!claudeClient.isConfigured()) {
            throw new Error('Provider "claude" requested but ANTHROPIC_API_KEY is not set.');
        }
        return 'claude';
    }
    if (name === 'zen') {
        if (!zenClient.isConfigured()) {
            throw new Error('Provider "zen" requested but OPENCODE_ZEN_API_KEY is not set.');
        }
        return 'zen';
    }
    if (name === 'ollama') return 'ollama';
    // 'auto' → prefer claude > zen > ollama based on what's configured.
    if (claudeClient.isConfigured()) return 'claude';
    if (zenClient.isConfigured())    return 'zen';
    return 'ollama';
}

/**
 * Provider-agnostic generate. Accepts a superset of the ollama-client
 * args; extra fields (promptCacheable, systemCacheable) are honoured by
 * the Claude path and silently ignored by the Ollama path.
 *
 * If the caller asks for 'auto' and Claude fails (network, 5xx, auth),
 * we transparently retry once on Ollama and return providerUsed:'ollama'.
 * If they forced a specific provider, no fallback — the error propagates
 * so the caller's existing fallback (baseline state) kicks in.
 */
async function generate(args) {
    args = args || {};
    const requested = String(args.provider || configuredDefault()).toLowerCase();
    const isAuto    = requested === 'auto';
    const target    = resolveProvider(requested);

    const passthrough = {
        model:           args.model,
        system:          args.system,
        prompt:          args.prompt,
        promptCacheable: args.promptCacheable,
        format:          args.format,
        options:         args.options,
        timeoutMs:       args.timeoutMs,
    };

    if (target === 'claude') {
        const r = await claudeClient.generate(passthrough);
        if (r.ok) return { ...r, providerUsed: 'claude' };
        if (isAuto) {
            // Auto-fallback chain on Claude failure: try Zen first if
            // configured (still high quality, OpenAI-compatible), then
            // local Ollama as last resort.
            if (zenClient.isConfigured()) {
                const rz = await zenClient.generate(passthrough);
                if (rz.ok) return { ...rz, providerUsed: 'zen', fellBackFrom: 'claude', claudeError: r.error };
            }
            const ro = await ollamaClient.generate(passthrough);
            return {
                ...ro,
                providerUsed: 'ollama',
                fellBackFrom: 'claude',
                claudeError:  r.error,
            };
        }
        return { ...r, providerUsed: 'claude' };
    }

    if (target === 'zen') {
        const r = await zenClient.generate(passthrough);
        if (r.ok) return { ...r, providerUsed: 'zen' };
        if (isAuto) {
            const ro = await ollamaClient.generate(passthrough);
            return {
                ...ro,
                providerUsed: 'ollama',
                fellBackFrom: 'zen',
                zenError:     r.error,
            };
        }
        return { ...r, providerUsed: 'zen' };
    }

    // target === 'ollama'
    const r = await ollamaClient.generate(passthrough);
    return { ...r, providerUsed: 'ollama' };
}

/**
 * Combined health probe. Used by GET /api/ai/provider/status. Each provider
 * gets pinged in parallel; we return per-provider health + the resolved
 * default. Errors per provider do not fail the overall call.
 */
async function getStatus() {
    const [ollamaHealth, claudeHealth, zenHealth] = await Promise.all([
        ollamaClient.ping().catch(e => ({ ok: false, apiStyle: 'ollama', error: e && e.message })),
        claudeClient.isConfigured()
            ? claudeClient.ping().catch(e => ({ ok: false, apiStyle: 'claude', error: e && e.message }))
            : Promise.resolve({ ok: false, apiStyle: 'claude', error: 'not_configured', auth: null }),
        zenClient.isConfigured()
            ? zenClient.ping().catch(e => ({ ok: false, apiStyle: 'zen', error: e && e.message }))
            : Promise.resolve({ ok: false, apiStyle: 'zen', error: 'not_configured', auth: null }),
    ]);

    const available = [];
    if (ollamaHealth.ok) available.push('ollama');
    if (claudeHealth.ok) available.push('claude');
    if (zenHealth.ok)    available.push('zen');

    return {
        defaultRequested: configuredDefault(),
        defaultResolved:  available.length ? resolveProvider('auto') : null,
        available,
        providers: {
            ollama: ollamaHealth,
            claude: claudeHealth,
            zen:    zenHealth,
        },
    };
}

module.exports = {
    generate,
    resolveProvider,
    configuredDefault,
    getStatus,
    VALID_PROVIDERS: Array.from(VALID),
};
