/**
 * AI gateway — speaks either Ollama or OpenAI dialect depending on
 * `apiStyle` in ai-config.js. Filename is still ollama-client.js for
 * backwards-compat with web-server.js's require() — historically the
 * only backend was local Ollama.
 *
 * Browser → web-server.js → this module → backend (local or hosted).
 * Centralising the network call here lets us swap providers without
 * touching the routes, prompts, or red-team agent.
 *
 * Public surface (stable across dialects):
 *   ping()                           → { ok, url, defaultModel, models, auth, error? }
 *   generate({ model, prompt, ... }) → { ok, response, raw, error? }
 *   chat({ model, messages, ... })   → { ok, message, raw, error? }
 */

const http  = require('http');
const https = require('https');
const { URL } = require('url');

const cfg = require('./ai-config');

const API_STYLE       = cfg.apiStyle;
const DEFAULT_URL     = cfg.url;
const DEFAULT_MODEL   = cfg.defaultModel;
const DEFAULT_TIMEOUT = cfg.requestTimeoutMs;
const DEFAULT_OPTIONS = cfg.options || {};

function isHttps(u) {
    try { return new URL(u).protocol === 'https:'; }
    catch { return false; }
}

// Build the auth header from ai-config.js. Empty key → no header sent
// (correct for local Ollama with no auth). For OpenAI-shape providers,
// 'Authorization: Bearer <key>' is the universal default.
function authHeaders() {
    const key = (cfg.apiKey || '').trim();
    if (!key) return {};
    const name   = (cfg.apiKeyHeader || 'Authorization').trim();
    const prefix = cfg.apiKeyPrefix == null ? 'Bearer ' : String(cfg.apiKeyPrefix);
    return { [name]: prefix + key };
}

// Some hosted gateways (notably opencode.ai/zen, but likely others fronted
// by CDNs) serve an HTML landing page when the request has no User-Agent
// — Node's http.request omits one by default. Always send a real-looking
// UA + Accept so the gateway routes us to the API path.
function commonHeaders() {
    return {
        'User-Agent': 'rmooz-ai-gateway/1.0 (+node)',
        'Accept':     'application/json',
    };
}

// Join base + path so that paths like '/v1/chat/completions' do NOT
// clobber the base URL's path prefix (e.g. '/zen/v1' on opencode Zen).
// `new URL(absolutePath, base)` drops base.pathname — that's the bug
// we're avoiding by concatenating strings ourselves.
//
// Also: if the base URL already ends with the same versioned prefix
// the path is asking for (e.g. base = '.../zen/v1', path = '/v1/models'),
// strip the duplicate so we don't get '.../zen/v1/v1/models'. This lets
// users write the URL either as '.../zen' or '.../zen/v1' — both work.
function fullUrlString(path) {
    let base  = String(DEFAULT_URL || '').replace(/\/+$/, '');
    let pPath = path.startsWith('/') ? path : '/' + path;
    // De-duplicate trailing version segment of base against leading
    // version segment of path (handles /v1, /v2, /api/v1, etc.).
    const m = pPath.match(/^\/((?:api\/)?v\d+)(\/|$)/);
    if (m) {
        const versionSeg = m[1];                                  // e.g. 'v1' or 'api/v1'
        const tail = new RegExp('/' + versionSeg + '$');           // matches base ending in same
        if (tail.test(base)) {
            pPath = pPath.slice(1 + versionSeg.length);            // drop the duplicate from path
            if (!pPath.startsWith('/')) pPath = '/' + pPath;
        }
    }
    return base + pPath;
}

function requestOptions(method, fullUrl, extraHeaders) {
    const parsed = new URL(fullUrl);
    const port = parsed.port
        || (parsed.protocol === 'https:' ? 443
            : parsed.protocol === 'http:'  ? 80
            : 11434);
    return {
        hostname: parsed.hostname,
        port,
        // path must include search/query if any
        path: parsed.pathname + (parsed.search || ''),
        method,
        headers: extraHeaders || {},
    };
}

function postJson(path, body, timeoutMs) {
    return new Promise((resolve, reject) => {
        let fullUrl;
        try { fullUrl = fullUrlString(path); }
        catch (e) { reject(new Error('Bad URL: ' + e.message)); return; }

        const payload = Buffer.from(JSON.stringify(body), 'utf8');
        const driver  = isHttps(fullUrl) ? https : http;
        const opts    = requestOptions('POST', fullUrl, {
            ...commonHeaders(),
            'Content-Type':   'application/json',
            'Content-Length': payload.length,
            ...authHeaders(),
        });
        opts.timeout = timeoutMs || DEFAULT_TIMEOUT;

        const req = driver.request(opts, (res) => {
            let chunks = '';
            res.setEncoding('utf8');
            res.on('data', (c) => { chunks += c; });
            res.on('end', () => {
                if (res.statusCode < 200 || res.statusCode >= 300) {
                    reject(new Error(`${API_STYLE === 'openai' ? 'API' : 'Ollama'} HTTP ${res.statusCode}: ${chunks.slice(0, 400)}`));
                    return;
                }
                try { resolve(JSON.parse(chunks)); }
                catch (e) { reject(new Error('Backend returned non-JSON: ' + e.message)); }
            });
        });

        req.on('timeout', () => {
            req.destroy(new Error(`Backend timed out after ${timeoutMs || DEFAULT_TIMEOUT}ms`));
        });
        req.on('error', (err) => {
            if (err && err.code === 'ECONNREFUSED') {
                reject(new Error(`Cannot reach backend at ${DEFAULT_URL}. ${API_STYLE === 'ollama' ? 'Is "ollama serve" running?' : 'Check url/apiKey in ai-config.js.'}`));
                return;
            }
            reject(err);
        });

        req.write(payload);
        req.end();
    });
}

function getJson(path, timeoutMs) {
    return new Promise((resolve, reject) => {
        let fullUrl;
        try { fullUrl = fullUrlString(path); }
        catch (e) { reject(new Error('Bad URL: ' + e.message)); return; }

        const driver = isHttps(fullUrl) ? https : http;
        const opts   = requestOptions('GET', fullUrl, { ...commonHeaders(), ...authHeaders() });
        opts.timeout = timeoutMs || cfg.pingTimeoutMs;

        const req = driver.request(opts, (res) => {
            let chunks = '';
            res.setEncoding('utf8');
            res.on('data', (c) => { chunks += c; });
            res.on('end', () => {
                if (res.statusCode < 200 || res.statusCode >= 300) {
                    reject(new Error(`${API_STYLE === 'openai' ? 'API' : 'Ollama'} HTTP ${res.statusCode}: ${chunks.slice(0, 400)}`));
                    return;
                }
                try { resolve(JSON.parse(chunks)); }
                catch (e) { reject(new Error('Backend returned non-JSON: ' + e.message)); }
            });
        });
        req.on('timeout', () => req.destroy(new Error('Backend timed out')));
        req.on('error', (err) => {
            if (err && err.code === 'ECONNREFUSED') {
                reject(new Error(`Cannot reach backend at ${DEFAULT_URL}. ${API_STYLE === 'ollama' ? 'Is "ollama serve" running?' : 'Check url/apiKey in ai-config.js.'}`));
                return;
            }
            reject(err);
        });
        req.end();
    });
}

// Mask an api key for diagnostic output. Returns null if no key is set so
// the JSON stays compact for local Ollama; otherwise returns the last 4
// chars only so the user can confirm WHICH key is in use without leaking it.
function maskedKey() {
    const k = (cfg.apiKey || '').trim();
    if (!k) return null;
    if (k.length <= 6) return '••••';
    return '••••' + k.slice(-4);
}

// ═══════════════════════════════════════════════════════════════════
// Ollama dialect ─ POST /api/generate, /api/chat ; GET /api/tags
// ═══════════════════════════════════════════════════════════════════

async function ollamaPing() {
    const tags = await getJson('/api/tags');
    const models = Array.isArray(tags && tags.models) ? tags.models.map(m => m.name) : [];
    return { models };
}

function shouldGenerateViaChat(model) {
    return /^gpt-oss(?::|$)/i.test(String(model || ''));
}

function applyOllamaOptions(body, options) {
    const opts = { ...DEFAULT_OPTIONS, ...(options || {}) };
    const keepAlive = opts.keep_alive || opts.keepAlive || cfg.keepAlive;
    if (opts.numPredict != null && opts.num_predict == null) opts.num_predict = opts.numPredict;
    delete opts.keep_alive;
    delete opts.keepAlive;
    delete opts.numPredict;
    if (keepAlive) body.keep_alive = keepAlive;
    if (Object.keys(opts).length) body.options = opts;
}

async function ollamaGenerateViaChat({ model, prompt, system, format, options, timeoutMs }) {
    const body = {
        model:    model || DEFAULT_MODEL,
        messages: [],
        stream:   false,
    };
    if (system) body.messages.push({ role: 'system', content: system });
    body.messages.push({ role: 'user', content: prompt });
    if (format) body.format = format;
    applyOllamaOptions(body, options);
    const raw = await postJson('/api/chat', body, timeoutMs);
    const text = raw && raw.message && typeof raw.message.content === 'string'
        ? raw.message.content
        : '';
    return { response: text, raw };
}

async function ollamaGenerate({ model, prompt, system, format, options, timeoutMs }) {
    const chosenModel = model || DEFAULT_MODEL;
    if (shouldGenerateViaChat(chosenModel)) {
        return ollamaGenerateViaChat({ model: chosenModel, prompt, system, format, options, timeoutMs });
    }

    const body = {
        model:  chosenModel,
        prompt,
        stream: false,
    };
    if (system) body.system = system;
    if (format) body.format = format;
    applyOllamaOptions(body, options);
    const raw = await postJson('/api/generate', body, timeoutMs);
    return { response: raw.response || '', raw };
}

async function ollamaChat({ model, messages, format, options, timeoutMs }) {
    const body = {
        model:    model || DEFAULT_MODEL,
        messages,
        stream:   false,
    };
    if (format) body.format = format;
    applyOllamaOptions(body, options);
    const raw = await postJson('/api/chat', body, timeoutMs);
    return { message: raw.message || null, raw };
}

// ═══════════════════════════════════════════════════════════════════
// OpenAI dialect ─ POST /v1/chat/completions ; GET /v1/models
// Works with opencode Zen, LiteLLM, OpenRouter, OpenAI itself, any
// other OpenAI-compatible gateway.
// ═══════════════════════════════════════════════════════════════════

// Translate Ollama-style options to OpenAI-style request fields. Most
// of the red-team agent + existing callers pass options keyed for
// Ollama (num_predict, temperature) — we accept both here so they
// don't need to know which backend they're talking to.
function openaiTranslateOptions(options) {
    const o = { ...DEFAULT_OPTIONS, ...(options || {}) };
    const out = {};
    if (Number.isFinite(o.temperature))                  out.temperature = o.temperature;
    if (Number.isFinite(o.top_p))                        out.top_p       = o.top_p;
    // Ollama uses num_predict; OpenAI accepts max_tokens (or
    // max_completion_tokens on newer endpoints — most gateways still
    // accept both). max_tokens is the safer broad default.
    const maxTok = Number.isFinite(o.max_tokens) ? o.max_tokens
                 : Number.isFinite(o.numPredict) ? o.numPredict
                 : Number.isFinite(o.num_predict) ? o.num_predict
                 : null;
    if (maxTok != null) out.max_tokens = maxTok;
    return out;
}

async function openaiPing() {
    const r = await getJson('/v1/models');
    const models = Array.isArray(r && r.data) ? r.data.map(m => m.id || m.name).filter(Boolean) : [];
    return { models };
}

async function openaiGenerate({ model, prompt, system, format, options, timeoutMs }) {
    const messages = [];
    if (system) messages.push({ role: 'system', content: system });
    messages.push({ role: 'user', content: prompt });
    const body = {
        model:  model || DEFAULT_MODEL,
        messages,
        stream: false,
        ...openaiTranslateOptions(options),
    };
    // `format:'json'` on Ollama → response_format on OpenAI.
    if (format === 'json') body.response_format = { type: 'json_object' };
    const raw = await postJson('/v1/chat/completions', body, timeoutMs);
    const text = raw && raw.choices && raw.choices[0] && raw.choices[0].message
        ? (raw.choices[0].message.content || '')
        : '';
    return { response: text, raw };
}

async function openaiChat({ model, messages, format, options, timeoutMs }) {
    const body = {
        model:  model || DEFAULT_MODEL,
        messages,
        stream: false,
        ...openaiTranslateOptions(options),
    };
    if (format === 'json') body.response_format = { type: 'json_object' };
    const raw = await postJson('/v1/chat/completions', body, timeoutMs);
    const message = raw && raw.choices && raw.choices[0] && raw.choices[0].message
        ? raw.choices[0].message
        : null;
    return { message, raw };
}

// ═══════════════════════════════════════════════════════════════════
// Public façade ─ dispatches to the right dialect
// ═══════════════════════════════════════════════════════════════════

async function ping() {
    const auth = maskedKey();
    try {
        const r = API_STYLE === 'openai' ? await openaiPing() : await ollamaPing();
        return { ok: true, url: DEFAULT_URL, apiStyle: API_STYLE, defaultModel: DEFAULT_MODEL, models: r.models, auth };
    } catch (e) {
        return { ok: false, url: DEFAULT_URL, apiStyle: API_STYLE, defaultModel: DEFAULT_MODEL, error: e.message || String(e), auth };
    }
}

async function generate(args) {
    args = args || {};
    if (!args.prompt || typeof args.prompt !== 'string') {
        return { ok: false, error: 'prompt (string) is required' };
    }
    try {
        const r = API_STYLE === 'openai' ? await openaiGenerate(args) : await ollamaGenerate(args);
        return { ok: true, response: r.response, raw: r.raw };
    } catch (e) {
        return { ok: false, error: e.message || String(e) };
    }
}

async function chat(args) {
    args = args || {};
    if (!Array.isArray(args.messages) || args.messages.length === 0) {
        return { ok: false, error: 'messages (non-empty array) is required' };
    }
    try {
        const r = API_STYLE === 'openai' ? await openaiChat(args) : await ollamaChat(args);
        return { ok: true, message: r.message, raw: r.raw };
    } catch (e) {
        return { ok: false, error: e.message || String(e) };
    }
}

module.exports = { ping, generate, chat, DEFAULT_URL, DEFAULT_MODEL, API_STYLE };
