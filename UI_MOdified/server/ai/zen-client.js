/**
 * Zen (opencode.ai) client wrapper.
 *
 * Mirrors the public surface of claude-client.js / ollama-client.js so
 * ai-provider.js can dispatch to Zen the same way it dispatches to
 * Claude or Ollama. Zen exposes an OpenAI Chat Completions-compatible
 * API and proxies to multiple back-end providers (Anthropic, OpenAI,
 * others) via a single endpoint.
 *
 * Self-contained HTTP client (no SDK dependency) — keeps the install
 * footprint small and matches the style of ollama-client.js.
 *
 * Public surface:
 *   isConfigured()  → boolean
 *   ping()          → { ok, apiStyle, defaultModel, models, auth, error? }
 *   generate({...}) → { ok, response, raw, usage, error? }
 *
 * Notes on caching:
 *   Zen's OpenAI Chat Completions API does not expose Anthropic prompt
 *   caching. cache_*_input_tokens are always 0 in the returned usage.
 *   For sovereign caching, prefer the direct Claude path (claude-client).
 */

'use strict';

const http  = require('http');
const https = require('https');
const { URL } = require('url');

const cfg = require('./ai-config');

function isConfigured() {
    return Boolean(cfg.zen && cfg.zen.apiKey && cfg.zen.apiKey.trim());
}

function maskedKey() {
    const k = (cfg.zen && cfg.zen.apiKey || '').trim();
    if (!k) return null;
    if (k.length <= 6) return '••••';
    return '••••' + k.slice(-4);
}

function isHttps(u) {
    try { return new URL(u).protocol === 'https:'; }
    catch { return false; }
}

function commonHeaders() {
    return {
        'User-Agent': 'rmooz-zen-client/1.0',
        'Accept':     'application/json',
    };
}

function authHeaders() {
    const k = (cfg.zen && cfg.zen.apiKey || '').trim();
    if (!k) return {};
    return { 'Authorization': 'Bearer ' + k };
}

// Join base URL + path, deduping the version segment (so users can write
// the base URL as either '.../zen' or '.../zen/v1' and both work).
function fullUrl(path) {
    const base = String((cfg.zen && cfg.zen.url) || '').replace(/\/+$/, '');
    let p = path.startsWith('/') ? path : '/' + path;
    const m = p.match(/^\/((?:api\/)?v\d+)(\/|$)/);
    if (m) {
        const versionSeg = m[1];
        if (new RegExp('/' + versionSeg + '$').test(base)) {
            p = p.slice(1 + versionSeg.length);
            if (!p.startsWith('/')) p = '/' + p;
        }
    }
    return base + p;
}

function requestOptions(method, urlStr, headers) {
    const parsed = new URL(urlStr);
    const port = parsed.port || (parsed.protocol === 'https:' ? 443 : 80);
    return {
        hostname: parsed.hostname,
        port,
        path:     parsed.pathname + (parsed.search || ''),
        method,
        headers:  headers || {},
    };
}

function postJson(path, body, timeoutMs) {
    return new Promise((resolve, reject) => {
        let urlStr;
        try { urlStr = fullUrl(path); }
        catch (e) { reject(new Error('Bad URL: ' + e.message)); return; }
        const payload = Buffer.from(JSON.stringify(body), 'utf8');
        const driver = isHttps(urlStr) ? https : http;
        const opts = requestOptions('POST', urlStr, {
            ...commonHeaders(),
            'Content-Type':   'application/json',
            'Content-Length': payload.length,
            ...authHeaders(),
        });
        opts.timeout = timeoutMs || 90_000;
        const req = driver.request(opts, (res) => {
            let chunks = '';
            res.setEncoding('utf8');
            res.on('data', (c) => { chunks += c; });
            res.on('end', () => {
                if (res.statusCode < 200 || res.statusCode >= 300) {
                    reject(new Error(`Zen HTTP ${res.statusCode}: ${chunks.slice(0, 400)}`));
                    return;
                }
                try { resolve(JSON.parse(chunks)); }
                catch (e) { reject(new Error('Zen returned non-JSON: ' + e.message)); }
            });
        });
        req.on('timeout', () => req.destroy(new Error(`Zen timed out after ${opts.timeout}ms`)));
        req.on('error', (err) => {
            if (err && err.code === 'ECONNREFUSED') {
                reject(new Error(`Cannot reach Zen at ${(cfg.zen || {}).url}. Check OPENCODE_ZEN_URL / network.`));
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
        let urlStr;
        try { urlStr = fullUrl(path); }
        catch (e) { reject(new Error('Bad URL: ' + e.message)); return; }
        const driver = isHttps(urlStr) ? https : http;
        const opts = requestOptions('GET', urlStr, { ...commonHeaders(), ...authHeaders() });
        opts.timeout = timeoutMs || 10_000;
        const req = driver.request(opts, (res) => {
            let chunks = '';
            res.setEncoding('utf8');
            res.on('data', (c) => { chunks += c; });
            res.on('end', () => {
                if (res.statusCode < 200 || res.statusCode >= 300) {
                    reject(new Error(`Zen HTTP ${res.statusCode}: ${chunks.slice(0, 400)}`));
                    return;
                }
                try { resolve(JSON.parse(chunks)); }
                catch (e) { reject(new Error('Zen returned non-JSON: ' + e.message)); }
            });
        });
        req.on('timeout', () => req.destroy(new Error('Zen ping timed out')));
        req.on('error', (err) => reject(err));
        req.end();
    });
}

// Strip ```json fences in case the model wraps the JSON.
function stripCodeFence(s) {
    if (!s) return s;
    let t = s.trim();
    if (t.startsWith('```')) {
        const nl = t.indexOf('\n');
        if (nl > 0) t = t.slice(nl + 1);
        if (t.endsWith('```')) t = t.slice(0, -3);
    }
    return t.trim();
}

// OpenAI Chat Completions exposes prompt_tokens / completion_tokens; the
// cache_*_input_tokens slots stay 0 because OpenAI dialect doesn't carry
// Anthropic's prompt-caching signal. Returning the same shape as
// claude-client.extractUsage keeps downstream meta consistent.
function extractUsage(raw) {
    const u = (raw && raw.usage) || {};
    return {
        input_tokens:                u.prompt_tokens     || 0,
        output_tokens:               u.completion_tokens || 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens:     0,
    };
}

// ── Health probe ────────────────────────────────────────────────────
async function ping() {
    if (!isConfigured()) {
        return { ok: false, apiStyle: 'zen', error: 'OPENCODE_ZEN_API_KEY not set', auth: null };
    }
    try {
        const r = await getJson('/v1/models');
        const models = Array.isArray(r && r.data) ? r.data.map(m => m.id || m.name).filter(Boolean) : [];
        return {
            ok:           true,
            apiStyle:     'zen',
            url:          cfg.zen.url,
            defaultModel: cfg.zen.defaultModel,
            models:       models.slice(0, 30),
            modelsTotal:  models.length,
            auth:         maskedKey(),
        };
    } catch (e) {
        return {
            ok:           false,
            apiStyle:     'zen',
            url:          cfg.zen && cfg.zen.url,
            defaultModel: cfg.zen && cfg.zen.defaultModel,
            error:        e.message || String(e),
            auth:         maskedKey(),
        };
    }
}

// ── Generate ────────────────────────────────────────────────────────
async function generate(args) {
    args = args || {};
    if (!args.prompt) {
        return { ok: false, error: 'prompt (string) is required' };
    }
    if (!isConfigured()) {
        return { ok: false, error: 'OPENCODE_ZEN_API_KEY not set' };
    }

    const messages = [];
    if (args.system) messages.push({ role: 'system', content: args.system });
    messages.push({ role: 'user', content: args.prompt });

    const opts = args.options || {};
    const body = {
        model:       args.model || cfg.zen.defaultModel,
        messages,
        max_tokens:  Number.isFinite(opts.max_tokens) ? opts.max_tokens
                   : Number.isFinite(opts.num_predict) ? opts.num_predict
                   : cfg.zen.maxTokens,
        temperature: Number.isFinite(opts.temperature) ? opts.temperature : 0.85,
        stream:      false,
    };
    if (Number.isFinite(opts.top_p))      body.top_p           = opts.top_p;
    if (args.format === 'json')           body.response_format = { type: 'json_object' };
    if (Array.isArray(opts.stop_sequences)) body.stop          = opts.stop_sequences;

    try {
        const raw = await postJson('/v1/chat/completions', body, args.timeoutMs || cfg.zen.requestTimeoutMs);
        const choice0 = raw && raw.choices && raw.choices[0];
        const text = (choice0 && choice0.message && choice0.message.content) || '';
        return {
            ok:       true,
            response: stripCodeFence(text),
            raw,
            usage:    extractUsage(raw),
        };
    } catch (e) {
        return { ok: false, error: e.message || String(e) };
    }
}

module.exports = {
    ping,
    generate,
    isConfigured,
    DEFAULT_MODEL: () => cfg.zen && cfg.zen.defaultModel,
    API_STYLE: 'zen',
};
