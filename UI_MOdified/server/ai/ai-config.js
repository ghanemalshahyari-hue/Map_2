/**
 * AI gateway configuration — single source of truth.
 *
 * When you take this app offline / to a different machine, this is the
 * ONLY file you need to edit. Everywhere else (ollama-client.js,
 * red-team-agent.js, the web-server routes) reads from here.
 *
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │  HOW TO SWITCH                                              │
 *   │                                                              │
 *   │  • Different machine / IP:                                   │
 *   │      change `url` below (e.g. 'http://192.168.1.42:11434').  │
 *   │                                                              │
 *   │  • Different model:                                          │
 *   │      change `defaultModel` to the tag you've pulled with     │
 *   │      `ollama pull <name>` (e.g. 'qwen2.5:1.5b').             │
 *   │                                                              │
 *   │  • Auth-protected backend (Ollama Cloud, LiteLLM proxy,      │
 *   │    OpenAI-compatible gateway, etc.):                         │
 *   │      put your token in `apiKey`. It is sent as               │
 *   │      `Authorization: Bearer <key>`. For local Ollama,        │
 *   │      leave it empty.                                         │
 *   │                                                              │
 *   │  • Slower hardware / bigger model:                           │
 *   │      bump `requestTimeoutMs` and/or `numPredict`.            │
 *   │                                                              │
 *   │  Env vars still override every field — handy for CI, Docker, │
 *   │  or pointing a packaged build at a different backend without │
 *   │  touching code:                                              │
 *   │    RMOOZ_OLLAMA_URL          → url                           │
 *   │    RMOOZ_OLLAMA_MODEL        → defaultModel                  │
 *   │    RMOOZ_OLLAMA_API_KEY      → apiKey                        │
 *   │    RMOOZ_OLLAMA_TIMEOUT_MS   → requestTimeoutMs              │
 *   │    RMOOZ_OLLAMA_PING_TIMEOUT_MS → pingTimeoutMs              │
 *   │                                                              │
 *   │  ── For secrets you DON'T want committed ──                  │
 *   │  Create `ai-secrets.local.js` (gitignored) next to this      │
 *   │  file with shape:                                            │
 *   │      module.exports = { apiKey: 'sk-...', url: '...' };      │
 *   │  Its values overlay the defaults below (env vars still win). │
 *   │                                                              │
 *   │  No server restart strategy here — Node doesn't hot-reload.  │
 *   │  After editing, restart with: node server/web-server.js      │
 *   └──────────────────────────────────────────────────────────────┘
 */

'use strict';

const path = require('path');

// ── Committed defaults ──────────────────────────────────────────────
// Safe to share / push to git. Do NOT put real api keys in here — use
// the env var or the gitignored `ai-secrets.local.js` overlay.
const defaults = {
    // ── Which API dialect to speak ────────────────────────────────────
    // 'ollama' → POST /api/generate, /api/chat  (local Ollama, default)
    // 'openai' → POST /v1/chat/completions      (opencode Zen, OpenAI,
    //                                            LiteLLM, OpenRouter,
    //                                            most hosted gateways)
    apiStyle: 'ollama',

    // ── Where Ollama / your LLM gateway is listening ─────────────────
    // Local default. Examples for other setups:
    //   - Remote Ollama on LAN:    'http://192.168.1.42:11434'
    //   - Reverse proxy / TLS:     'https://ai.internal.example/'
    //   - Hosted OpenAI-compatible (set apiStyle: 'openai' too):
    //                              'https://opencode.ai/zen/v1'
    //                              'https://api.openai.com/v1'
    //                              'https://openrouter.ai/api/v1'
    //   - SSH tunnel forwarded:    'http://localhost:11500'
    url: 'http://localhost:11434',

    // ── Which model to use by default ────────────────────────────────
    // Must match a tag from `ollama list` (or a model id your hosted
    // gateway accepts). Some good options for local Ollama:
    //   Small/fast (good for testing the wiring, weak at reasoning):
    //     - 'llama3.2:1b'    (~1.3 GB,  fast)
    //     - 'qwen2.5:1.5b'   (~1.0 GB,  fast)
    //     - 'phi3:mini'      (~2.3 GB,  decent)
    //   Mid (balanced):
    //     - 'llama3.1:8b'    (~5 GB)
    //     - 'qwen2.5:7b'     (~5 GB)
    //   Heavy (best plans, slow on CPU):
    //     - 'gpt-oss:20b'    (~14 GB, ~24 tok/s CPU)
    defaultModel: 'llama3.2:1b',

    // ── Auth (optional) ──────────────────────────────────────────────
    // Empty string = no Authorization header sent (correct for local
    // Ollama with no auth). For hosted providers, put the bearer token
    // here OR — better — set RMOOZ_OLLAMA_API_KEY, OR — best — put it
    // in ai-secrets.local.js so it doesn't end up in git.
    apiKey: '',
    // Header name and prefix. Defaults match OpenAI / Anthropic / most
    // OAuth bearer schemes. Change apiKeyHeader to 'x-api-key' for
    // providers that use that instead (e.g. some Anthropic setups).
    apiKeyHeader: 'Authorization',
    apiKeyPrefix: 'Bearer ',

    // ── Request timeouts (milliseconds) ──────────────────────────────
    // pingTimeoutMs:  health check / model list — keep small so a hung
    //                 Ollama doesn't lock the page on startup.
    // requestTimeoutMs: a single generate/chat call. Heavy models on
    //                   CPU may need 120-180 s; small ones ~30 s.
    pingTimeoutMs:    5_000,
    requestTimeoutMs: 90_000,

    // ── Generation defaults ──────────────────────────────────────────
    // Per-call options can still override these. Lower temperature
    // produces more deterministic plans; raise for variety.
    options: {
        temperature: 0.2,
        numPredict:  2500,    // upper bound on output tokens
    },
    keepAlive: '30m',

    // ── Claude (Anthropic) — optional cloud backend ────────────────────
    // The Claude path is enabled when ANTHROPIC_API_KEY is set in the
    // environment OR `{ claude: { apiKey: 'sk-ant-...' } }` is present
    // in ai-secrets.local.js. Leaving apiKey empty disables the Claude
    // backend entirely; the Ollama path above remains the default.
    //
    // claude-client.js reads from cfg.claude.* (this nested block).
    claude: {
        apiKey:           '',
        defaultModel:     'claude-opus-4-7',
        requestTimeoutMs: 90_000,
        maxTokens:        4000,
    },

    // ── Zen (opencode.ai) — optional OpenAI-compatible gateway ─────────
    // Zen proxies Claude (and other providers) via OpenAI Chat Completions
    // API. Use this when you don't have direct Anthropic API access but do
    // have a Zen account. Prompt caching is NOT preserved through Zen, so
    // expect higher per-step cost than the direct Claude path.
    //
    // zen-client.js reads from cfg.zen.* (this nested block).
    zen: {
        url:              'https://opencode.ai/zen/v1',
        apiKey:           '',
        // Confirmed against the live Zen catalog (41 models): plain IDs,
        // no provider prefix. Opus 4.7 is the strongest available; swap
        // to claude-sonnet-4-6 for higher-throughput MC runs at lower cost.
        defaultModel:     'claude-opus-4-7',
        requestTimeoutMs: 90_000,
        maxTokens:        4000,
    },

    // ── Default AI provider ────────────────────────────────────────────
    // Which backend the adjudicator uses by default.
    //   'ollama' = always local Ollama (sovereign / air-gap)
    //   'claude' = always cloud Claude direct (requires ANTHROPIC_API_KEY)
    //   'zen'    = opencode.ai Zen gateway (requires OPENCODE_ZEN_API_KEY)
    //   'auto'   = first configured of (claude > zen > ollama)
    // Per-call override is supported via the `provider` arg in
    // adjudicator-agent.js / monte-carlo-runner.js / web-server.js routes.
    aiProvider: 'auto',
};

// ── Optional gitignored overlay (secrets) ───────────────────────────
// If you create `ai-secrets.local.js` next to this file, anything it
// exports overlays the defaults above. This lets you keep `apiKey`
// off the repo without breaking local-only Ollama setups.
let overlay = {};
try {
    // eslint-disable-next-line global-require
    overlay = require(path.join(__dirname, 'ai-secrets.local.js')) || {};
} catch (e) {
    if (!e || e.code !== 'MODULE_NOT_FOUND') {
        // Real syntax error in the secrets file is worth surfacing.
        console.warn('[ai-config] ai-secrets.local.js present but failed to load:', e.message);
    }
}

// ── Env-var overrides (always win) ──────────────────────────────────
function envOverride(value, ...names) {
    for (const name of names) {
        const v = process.env[name];
        if (v != null && String(v).trim() !== '') return v;
    }
    return value;
}

function asInt(v, fallback) {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : fallback;
}

// Merge precedence (low → high): defaults → overlay → env vars.
function normalizeStyle(s) {
    const v = String(s || '').trim().toLowerCase();
    return v === 'openai' ? 'openai' : 'ollama';
}
const merged = {
    apiStyle:         normalizeStyle(envOverride(overlay.apiStyle ?? defaults.apiStyle, 'RMOOZ_OLLAMA_API_STYLE', 'RMOOZ_AI_STYLE')),
    url:              envOverride(overlay.url              ?? defaults.url,              'RMOOZ_OLLAMA_URL'),
    defaultModel:     envOverride(overlay.defaultModel     ?? defaults.defaultModel,     'RMOOZ_OLLAMA_MODEL'),
    apiKey:           envOverride(overlay.apiKey           ?? defaults.apiKey,           'RMOOZ_OLLAMA_API_KEY'),
    apiKeyHeader:     envOverride(overlay.apiKeyHeader     ?? defaults.apiKeyHeader,     'RMOOZ_OLLAMA_API_KEY_HEADER'),
    apiKeyPrefix:     overlay.apiKeyPrefix      ?? defaults.apiKeyPrefix,
    pingTimeoutMs:    asInt(envOverride(overlay.pingTimeoutMs    ?? defaults.pingTimeoutMs,    'RMOOZ_OLLAMA_PING_TIMEOUT_MS'), defaults.pingTimeoutMs),
    requestTimeoutMs: asInt(envOverride(overlay.requestTimeoutMs ?? defaults.requestTimeoutMs, 'RMOOZ_OLLAMA_TIMEOUT_MS'),      defaults.requestTimeoutMs),
    options:          { ...defaults.options, ...(overlay.options || {}) },
    keepAlive:        envOverride(overlay.keepAlive ?? overlay.keep_alive ?? defaults.keepAlive, 'RMOOZ_OLLAMA_KEEP_ALIVE'),

    // Claude block — env vars: ANTHROPIC_API_KEY, RMOOZ_CLAUDE_MODEL,
    // RMOOZ_CLAUDE_TIMEOUT_MS, RMOOZ_CLAUDE_MAX_TOKENS.
    claude: {
        apiKey:           envOverride(
                              (overlay.claude && overlay.claude.apiKey)           ?? defaults.claude.apiKey,
                              'ANTHROPIC_API_KEY', 'RMOOZ_CLAUDE_API_KEY'),
        defaultModel:     envOverride(
                              (overlay.claude && overlay.claude.defaultModel)     ?? defaults.claude.defaultModel,
                              'RMOOZ_CLAUDE_MODEL'),
        requestTimeoutMs: asInt(envOverride(
                              (overlay.claude && overlay.claude.requestTimeoutMs) ?? defaults.claude.requestTimeoutMs,
                              'RMOOZ_CLAUDE_TIMEOUT_MS'), defaults.claude.requestTimeoutMs),
        maxTokens:        asInt(envOverride(
                              (overlay.claude && overlay.claude.maxTokens)        ?? defaults.claude.maxTokens,
                              'RMOOZ_CLAUDE_MAX_TOKENS'), defaults.claude.maxTokens),
    },

    // Zen block — env vars: OPENCODE_ZEN_API_KEY, OPENCODE_ZEN_URL,
    // RMOOZ_ZEN_MODEL, RMOOZ_ZEN_TIMEOUT_MS, RMOOZ_ZEN_MAX_TOKENS.
    zen: {
        url:              envOverride(
                              (overlay.zen && overlay.zen.url)              ?? defaults.zen.url,
                              'OPENCODE_ZEN_URL', 'RMOOZ_ZEN_URL'),
        apiKey:           envOverride(
                              (overlay.zen && overlay.zen.apiKey)           ?? defaults.zen.apiKey,
                              'OPENCODE_ZEN_API_KEY', 'RMOOZ_ZEN_API_KEY'),
        defaultModel:     envOverride(
                              (overlay.zen && overlay.zen.defaultModel)     ?? defaults.zen.defaultModel,
                              'RMOOZ_ZEN_MODEL', 'OPENCODE_ZEN_MODEL'),
        requestTimeoutMs: asInt(envOverride(
                              (overlay.zen && overlay.zen.requestTimeoutMs) ?? defaults.zen.requestTimeoutMs,
                              'RMOOZ_ZEN_TIMEOUT_MS'), defaults.zen.requestTimeoutMs),
        maxTokens:        asInt(envOverride(
                              (overlay.zen && overlay.zen.maxTokens)        ?? defaults.zen.maxTokens,
                              'RMOOZ_ZEN_MAX_TOKENS'), defaults.zen.maxTokens),
    },

    aiProvider:       envOverride(overlay.aiProvider ?? defaults.aiProvider, 'RMOOZ_AI_PROVIDER'),
};

module.exports = merged;
