/**
 * Local Ollama gateway (Chunk 08 from wargame-vision.html).
 *
 * Browser → web-server.js → ollama-client.js → http://localhost:11434.
 * Everything stays on the user's machine; the browser never speaks to
 * Ollama directly so we can authorise, rate-limit, and log centrally.
 *
 * Public surface:
 *   ping()                           → { ok, version, models, error? }
 *   generate({ model, prompt, ... }) → { ok, response, raw, error? }
 *   chat({ model, messages, ... })   → { ok, message, raw, error? }
 */

const http = require('http');
const { URL } = require('url');

const DEFAULT_URL = process.env.RMOOZ_OLLAMA_URL || 'http://localhost:11434';
// Default model: picked because the user's local Ollama already has it
// installed (gpt-oss:20b, ~14 GB). Override with the RMOOZ_OLLAMA_MODEL
// env var or pass `model` per request.
const DEFAULT_MODEL = process.env.RMOOZ_OLLAMA_MODEL || 'gpt-oss:20b';
// Single LLM call ceiling — a 20B model on CPU can take a while for the
// first token, but we still cap it so a hung Ollama doesn't wedge the page.
const DEFAULT_TIMEOUT_MS = 90_000;

function postJson(pathname, body, timeoutMs) {
    return new Promise((resolve, reject) => {
        let parsed;
        try { parsed = new URL(pathname, DEFAULT_URL); }
        catch (e) { reject(new Error('Bad Ollama URL: ' + e.message)); return; }

        const payload = Buffer.from(JSON.stringify(body), 'utf8');
        const req = http.request({
            hostname: parsed.hostname,
            port:     parsed.port || 11434,
            path:     parsed.pathname,
            method:   'POST',
            headers:  {
                'Content-Type':   'application/json',
                'Content-Length': payload.length,
            },
            timeout: timeoutMs || DEFAULT_TIMEOUT_MS,
        }, (res) => {
            let chunks = '';
            res.setEncoding('utf8');
            res.on('data', (c) => { chunks += c; });
            res.on('end', () => {
                if (res.statusCode < 200 || res.statusCode >= 300) {
                    reject(new Error(`Ollama HTTP ${res.statusCode}: ${chunks.slice(0, 400)}`));
                    return;
                }
                try { resolve(JSON.parse(chunks)); }
                catch (e) { reject(new Error('Ollama returned non-JSON: ' + e.message)); }
            });
        });

        req.on('timeout', () => {
            req.destroy(new Error(`Ollama timed out after ${timeoutMs || DEFAULT_TIMEOUT_MS}ms`));
        });
        req.on('error', (err) => {
            // Most common failure mode: Ollama isn't running. Translate the
            // bare ECONNREFUSED into something a human can act on.
            if (err && err.code === 'ECONNREFUSED') {
                reject(new Error(`Cannot reach Ollama at ${DEFAULT_URL}. Is "ollama serve" running?`));
                return;
            }
            reject(err);
        });

        req.write(payload);
        req.end();
    });
}

function getJson(pathname, timeoutMs) {
    return new Promise((resolve, reject) => {
        let parsed;
        try { parsed = new URL(pathname, DEFAULT_URL); }
        catch (e) { reject(new Error('Bad Ollama URL: ' + e.message)); return; }

        const req = http.request({
            hostname: parsed.hostname,
            port:     parsed.port || 11434,
            path:     parsed.pathname,
            method:   'GET',
            timeout:  timeoutMs || 5_000,
        }, (res) => {
            let chunks = '';
            res.setEncoding('utf8');
            res.on('data', (c) => { chunks += c; });
            res.on('end', () => {
                if (res.statusCode < 200 || res.statusCode >= 300) {
                    reject(new Error(`Ollama HTTP ${res.statusCode}: ${chunks.slice(0, 400)}`));
                    return;
                }
                try { resolve(JSON.parse(chunks)); }
                catch (e) { reject(new Error('Ollama returned non-JSON: ' + e.message)); }
            });
        });
        req.on('timeout', () => req.destroy(new Error('Ollama timed out')));
        req.on('error', (err) => {
            if (err && err.code === 'ECONNREFUSED') {
                reject(new Error(`Cannot reach Ollama at ${DEFAULT_URL}. Is "ollama serve" running?`));
                return;
            }
            reject(err);
        });
        req.end();
    });
}

async function ping() {
    try {
        const tags = await getJson('/api/tags');
        const models = Array.isArray(tags && tags.models) ? tags.models.map(m => m.name) : [];
        return { ok: true, url: DEFAULT_URL, defaultModel: DEFAULT_MODEL, models };
    } catch (e) {
        return { ok: false, url: DEFAULT_URL, defaultModel: DEFAULT_MODEL, error: e.message || String(e) };
    }
}

async function generate({ model, prompt, system, format, options, timeoutMs }) {
    if (!prompt || typeof prompt !== 'string') {
        return { ok: false, error: 'prompt (string) is required' };
    }
    const body = {
        model:  model || DEFAULT_MODEL,
        prompt,
        stream: false,
    };
    if (system) body.system = system;
    if (format) body.format = format; // 'json' for structured output
    if (options) body.options = options;
    try {
        const raw = await postJson('/api/generate', body, timeoutMs);
        return { ok: true, response: raw.response || '', raw };
    } catch (e) {
        return { ok: false, error: e.message || String(e) };
    }
}

async function chat({ model, messages, format, options, timeoutMs }) {
    if (!Array.isArray(messages) || messages.length === 0) {
        return { ok: false, error: 'messages (non-empty array) is required' };
    }
    const body = {
        model:    model || DEFAULT_MODEL,
        messages,
        stream:   false,
    };
    if (format) body.format = format;
    if (options) body.options = options;
    try {
        const raw = await postJson('/api/chat', body, timeoutMs);
        return { ok: true, message: raw.message || null, raw };
    } catch (e) {
        return { ok: false, error: e.message || String(e) };
    }
}

module.exports = { ping, generate, chat, DEFAULT_URL, DEFAULT_MODEL };
