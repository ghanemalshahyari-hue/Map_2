/**
 * OpenRouter (openrouter.ai) client wrapper — RMOOZ-OPENROUTER-QWEN35-CLOUD-MODE-A.
 *
 * Mirrors the public surface of zen-client.js / claude-client.js / ollama-client.js
 * so ai-provider.js can dispatch to OpenRouter the same way. OpenRouter exposes an
 * OpenAI Chat Completions-compatible API and proxies many models (incl. Qwen3.5)
 * through a single endpoint.
 *
 * ⚠ CLOUD egress. This client only SPEAKS the protocol; whether it may RUN is gated
 * upstream (RMOOZ_ALLOW_SIM_RUN=1 + RMOOZ_ALLOW_CLOUD_AI=1 + key, via
 * llm-runtime-config.openrouterReady() and the free-fight isRemoteProvider guard).
 * The default AI Commander Free Fight path stays local-only.
 *
 * Self-contained HTTPS client (no SDK). NEVER logs the API key (masked only).
 *
 * Public surface:
 *   isConfigured()  → boolean (OPENROUTER_API_KEY present)
 *   ping()          → { ok, apiStyle, url, models, modelsTotal, auth, error? }
 *   listModels()    → string[]  (model ids from GET /models; [] on error)
 *   generate({...}) → { ok, response, raw, usage, error? }
 */

'use strict';

const http  = require('http');
const https = require('https');
const { URL } = require('url');

const cfg = require('./ai-config');

function orCfg() { return cfg.openrouter || {}; }

function isConfigured() {
    const k = (orCfg().apiKey || '').trim();
    return Boolean(k);
}

// RMOOZ-OPENROUTER-FREE-FIGHT-CONTROL-FIX-I: a *format* heuristic so the UI can warn pre-flight that a
// present-but-malformed key will 401 at generation (OpenRouter's /models is public, so key PRESENCE
// alone — isConfigured() — can't catch a bad key). Real OpenRouter keys are `sk-or-v1-<40+ chars>`.
// Returns true | false | null(no key). NEVER returns or logs the key itself.
function keyLooksValid() {
    const k = (orCfg().apiKey || '').trim();
    if (!k) return null;
    return /^sk-or-(v1-)?[A-Za-z0-9_-]{32,}$/.test(k);
}

function maskedKey() {
    const k = (orCfg().apiKey || '').trim();
    if (!k) return null;
    if (k.length <= 6) return '••••';
    return '••••' + k.slice(-4);
}

function isHttps(u) {
    try { return new URL(u).protocol === 'https:'; }
    catch { return false; }
}

function commonHeaders() {
    // HTTP-Referer + X-Title are OpenRouter's optional app-attribution headers.
    // (Spec also names X-OpenRouter-Title; sent too — harmless if ignored.)
    const referer = (process.env.RMOOZ_APP_URL || 'http://localhost:8000').trim();
    return {
        'User-Agent':         'rmooz-openrouter-client/1.0',
        'Accept':             'application/json',
        'HTTP-Referer':       referer,
        'X-Title':            'RMOOZ',
        'X-OpenRouter-Title': 'RMOOZ',
    };
}

function authHeaders() {
    const k = (orCfg().apiKey || '').trim();
    if (!k) return {};
    return { 'Authorization': 'Bearer ' + k };
}

// Join base URL + path; base is e.g. 'https://openrouter.ai/api/v1', paths are
// '/chat/completions' and '/models'. Dedupe a trailing version segment so a base
// written as '.../api/v1' + path '/v1/models' still resolves correctly.
function fullUrl(path) {
    const base = String(orCfg().url || '').replace(/\/+$/, '');
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
                    reject(new Error(`OpenRouter HTTP ${res.statusCode}: ${chunks.slice(0, 400)}`));
                    return;
                }
                try { resolve(JSON.parse(chunks)); }
                catch (e) { reject(new Error('OpenRouter returned non-JSON: ' + e.message)); }
            });
        });
        req.on('timeout', () => req.destroy(new Error(`OpenRouter timed out after ${opts.timeout}ms`)));
        req.on('error', (err) => {
            if (err && err.code === 'ECONNREFUSED') {
                reject(new Error(`Cannot reach OpenRouter at ${orCfg().url}. Check OPENROUTER_URL / network.`));
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
                    reject(new Error(`OpenRouter HTTP ${res.statusCode}: ${chunks.slice(0, 400)}`));
                    return;
                }
                try { resolve(JSON.parse(chunks)); }
                catch (e) { reject(new Error('OpenRouter returned non-JSON: ' + e.message)); }
            });
        });
        req.on('timeout', () => req.destroy(new Error('OpenRouter request timed out')));
        req.on('error', (err) => reject(err));
        req.end();
    });
}

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

function extractUsage(raw) {
    const u = (raw && raw.usage) || {};
    return {
        input_tokens:                u.prompt_tokens     || 0,
        output_tokens:               u.completion_tokens || 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens:     0,
    };
}

// Parse the OpenRouter model list (GET /models → { data: [{ id, ... }] }).
function parseModelList(raw) {
    const arr = Array.isArray(raw && raw.data) ? raw.data : [];
    return arr.map(m => (m && (m.id || m.name)) || null).filter(Boolean);
}

// ── Model list ──────────────────────────────────────────────────────
async function listModels() {
    if (!isConfigured()) return [];
    try {
        const r = await getJson('/models');
        return parseModelList(r);
    } catch (e) { return []; }
}

// ── Health probe ────────────────────────────────────────────────────
async function ping() {
    if (!isConfigured()) {
        return { ok: false, apiStyle: 'openrouter', error: 'OPENROUTER_API_KEY not set', auth: null };
    }
    try {
        const r = await getJson('/models');
        const models = parseModelList(r);
        return {
            ok:           true,
            apiStyle:     'openrouter',
            url:          orCfg().url,
            defaultModel: orCfg().defaultModel || null,
            models:       models.slice(0, 50),
            modelsTotal:  models.length,
            auth:         maskedKey(),
        };
    } catch (e) {
        return {
            ok:           false,
            apiStyle:     'openrouter',
            url:          orCfg().url,
            defaultModel: orCfg().defaultModel || null,
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
        return { ok: false, error: 'OPENROUTER_API_KEY not set' };
    }
    const model = args.model || orCfg().defaultModel;
    if (!model) {
        return { ok: false, error: 'no OpenRouter model selected (pick one from /api/v1/models or set RMOOZ_OPENROUTER_MODEL)' };
    }

    const messages = [];
    if (args.system) messages.push({ role: 'system', content: args.system });
    messages.push({ role: 'user', content: args.prompt });

    const opts = args.options || {};
    const body = {
        model,
        messages,
        max_tokens:  Number.isFinite(opts.max_tokens) ? opts.max_tokens
                   : Number.isFinite(opts.num_predict) ? opts.num_predict
                   : orCfg().maxTokens,
        temperature: Number.isFinite(opts.temperature) ? opts.temperature : 0.4,
        stream:      false,
    };
    if (Number.isFinite(opts.top_p))        body.top_p           = opts.top_p;
    if (args.format === 'json')             body.response_format = { type: 'json_object' };
    if (Array.isArray(opts.stop_sequences)) body.stop            = opts.stop_sequences;

    try {
        const raw = await postJson('/chat/completions', body, args.timeoutMs || orCfg().requestTimeoutMs);
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
    listModels,
    parseModelList,           // exposed for tests (parse without network)
    isConfigured,
    keyLooksValid,            // RMOOZ-OPENROUTER-FREE-FIGHT-CONTROL-FIX-I: pre-flight key format check (no secret)
    DEFAULT_MODEL: () => orCfg().defaultModel,
    API_STYLE: 'openrouter',
};
