'use strict';
/* ============================================================================
 * test-ai-config-guard-f.js — RMOOZ-SECURITY-AI-CONFIG-GUARD-F
 * ----------------------------------------------------------------------------
 * A committed safety net so `server/ai/ai-config.js` can never accidentally
 * carry a real cloud secret or a cloud-default provider/url/style change.
 *
 * This is a STATIC guard — it changes NO AI behavior. It reads the source of
 * ai-config.js, evaluates ONLY its committed `defaults` object literal (NOT the
 * env/overlay-merged export, which CI/operator env legitimately overrides), and
 * fails if any of these is true:
 *   • the file text contains a real `sk-…` style API key
 *   • any `apiKey` in the committed defaults (top-level OR nested) is non-empty
 *   • the top-level `url` default moved away from http://localhost:11434
 *   • the default `apiStyle` moved away from 'ollama'
 *   • the default `aiProvider` moved to a cloud backend (goal: no cloud default)
 *
 * Comment placeholders such as <api-key> / <claude-api-key> are ALLOWED (they
 * are not real keys and are not values). Secrets belong in env vars or the
 * gitignored ai-secrets.local.js — NEVER in the committed defaults.
 *
 * Run: node scripts/test-ai-config-guard-f.js   (exit 0 = green)
 * ========================================================================== */
const assert = require('assert');
const fs     = require('fs');
const path   = require('path');

const AI_CONFIG_PATH = path.join(__dirname, '..', 'server', 'ai', 'ai-config.js');

let pass = 0, fail = 0;
function test(name, fn) { try { fn(); console.log('  ✓ ' + name); pass++; } catch (e) { console.log('  ✗ ' + name + ' — ' + (e && e.message)); fail++; } }

// The single operator-facing remediation message (req #5). Every violation ends
// with it so the fix is obvious without reading the test.
const FIX = 'Put secrets/overrides in env vars (RMOOZ_OLLAMA_API_KEY / ANTHROPIC_API_KEY / ' +
    'OPENCODE_ZEN_API_KEY / OPENROUTER_API_KEY, RMOOZ_OLLAMA_URL, RMOOZ_AI_PROVIDER) or the ' +
    'gitignored ai-secrets.local.js overlay — NEVER in ai-config.js committed defaults.';

// A real-key shape: sk-, sk-ant-, sk-or-v1-, … followed by a long key body.
// 20+ key chars so prose like "use sk-…" or "<api-key>" never matches.
const SECRET_RE = /sk-[A-Za-z0-9._-]{20,}/;

// ── pure auditor: same logic for the real file AND synthetic tamper strings ──
function extractDefaultsLiteral(src) {
    const anchor = src.indexOf('const defaults');
    if (anchor < 0) throw new Error('could not find `const defaults` in ai-config.js');
    const start = src.indexOf('{', anchor);
    if (start < 0) throw new Error('could not find the defaults object opening brace');
    let depth = 0, inStr = null, inLine = false, inBlock = false, i = start;
    for (; i < src.length; i++) {
        const c = src[i], n = src[i + 1];
        if (inLine)  { if (c === '\n') inLine = false; continue; }
        if (inBlock) { if (c === '*' && n === '/') { inBlock = false; i++; } continue; }
        if (inStr)   { if (c === '\\') { i++; continue; } if (c === inStr) inStr = null; continue; }
        if (c === '/' && n === '/') { inLine = true;  i++; continue; }
        if (c === '/' && n === '*') { inBlock = true; i++; continue; }
        if (c === '\'' || c === '"' || c === '`') { inStr = c; continue; }
        if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth === 0) { i++; break; } }
    }
    return src.slice(start, i);
}
function parseDefaults(src) {
    // Pure data literal (numbers may use 5_000 separators) — eval in isolation.
    // eslint-disable-next-line no-new-func
    return (new Function('return (' + extractDefaultsLiteral(src) + ')'))();
}
// Collect every apiKey value anywhere in the defaults tree (top-level + nested).
function collectApiKeys(obj, prefix, out) {
    out = out || [];
    if (!obj || typeof obj !== 'object') return out;
    Object.keys(obj).forEach(function (k) {
        const v = obj[k];
        const p = prefix ? (prefix + '.' + k) : k;
        if (k === 'apiKey') out.push({ path: p, value: v });
        else if (v && typeof v === 'object') collectApiKeys(v, p, out);
    });
    return out;
}
// Returns a list of violations: { code, message }. Empty = clean.
function auditAiConfig(src) {
    const v = [];
    if (SECRET_RE.test(src)) {
        v.push({ code: 'secret_literal', message: 'ai-config.js contains a real `sk-…` style API key. ' + FIX });
    }
    let d;
    try { d = parseDefaults(src); }
    catch (e) { v.push({ code: 'unparseable_defaults', message: 'could not evaluate the committed `defaults` literal: ' + e.message }); return v; }

    if (d.apiStyle !== 'ollama') {
        v.push({ code: 'apiStyle_changed', message: 'default apiStyle must be "ollama" (got "' + d.apiStyle + '"). ' + FIX });
    }
    if (d.url !== 'http://localhost:11434') {
        v.push({ code: 'url_changed', message: 'top-level url default must be http://localhost:11434 (got "' + d.url + '"). ' + FIX });
    }
    if (d.aiProvider !== 'ollama') {
        v.push({ code: 'provider_changed', message: 'default aiProvider must be "ollama" — no cloud default (got "' + d.aiProvider + '"). ' + FIX });
    }
    collectApiKeys(d).forEach(function (k) {
        if (k.value !== '') {
            v.push({ code: 'apiKey_nonempty', message: 'committed default ' + k.path + ' must be an empty string (got non-empty). ' + FIX });
        }
    });
    return v;
}

(function () {
console.log('\n═══ RMOOZ-SECURITY-AI-CONFIG-GUARD-F ═══\n');
const SRC = fs.readFileSync(AI_CONFIG_PATH, 'utf8');

console.log('1) the committed ai-config.js passes the guard (no secrets / cloud defaults)');
test('ai-config.js has ZERO guard violations', function () {
    const vio = auditAiConfig(SRC);
    assert.strictEqual(vio.length, 0, 'unexpected violations:\n  - ' + vio.map(function (x) { return x.code + ': ' + x.message; }).join('\n  - '));
});

console.log('\n2) committed defaults are the safe, local-only values');
test('no real sk-… API key anywhere in the file', function () {
    assert.ok(!SECRET_RE.test(SRC), 'a real `sk-…` style key is present. ' + FIX);
});
test('default apiStyle is "ollama"', function () {
    assert.strictEqual(parseDefaults(SRC).apiStyle, 'ollama');
});
test('top-level url default is http://localhost:11434', function () {
    assert.strictEqual(parseDefaults(SRC).url, 'http://localhost:11434');
});
test('top-level apiKey default is an empty string', function () {
    assert.strictEqual(parseDefaults(SRC).apiKey, '');
});
test('default aiProvider is "ollama" (no cloud default)', function () {
    assert.strictEqual(parseDefaults(SRC).aiProvider, 'ollama');
});

console.log('\n3) nested cloud blocks ship BLANK keys in committed defaults');
test('claude.apiKey and zen.apiKey are empty strings (req #4)', function () {
    const d = parseDefaults(SRC);
    assert.strictEqual(d.claude.apiKey, '', 'claude.apiKey must be empty. ' + FIX);
    assert.strictEqual(d.zen.apiKey, '', 'zen.apiKey must be empty. ' + FIX);
});
test('every apiKey in the defaults tree (incl. openrouter) is empty', function () {
    const keys = collectApiKeys(parseDefaults(SRC));
    assert.ok(keys.length >= 3, 'expected to find the top-level + claude + zen apiKey fields (found ' + keys.length + ')');
    keys.forEach(function (k) { assert.strictEqual(k.value, '', k.path + ' must be empty. ' + FIX); });
});

console.log('\n4) comment placeholders such as <api-key> / <claude-api-key> are allowed');
test('the placeholder tokens do NOT trip the real-secret scan', function () {
    assert.ok(!SECRET_RE.test('<api-key>'), '<api-key> placeholder must be allowed');
    assert.ok(!SECRET_RE.test('<claude-api-key>'), '<claude-api-key> placeholder must be allowed');
    // the live file uses these placeholders in comments and still passes (proven by §1)
    assert.ok(/<api-key>/.test(SRC) || /<claude-api-key>/.test(SRC), 'file uses a placeholder comment (allowed)');
});

console.log('\n5) the guard actually bites — negative (tamper) cases fail closed');
function codes(src) { return auditAiConfig(src).map(function (x) { return x.code; }); }
test('a real sk-… key in the file → secret_literal violation', function () {
    const tampered = SRC.replace("apiKey:           '',", "apiKey:           'sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',");
    assert.ok(codes(tampered).indexOf('secret_literal') !== -1, 'must flag the planted key');
    assert.ok(codes(tampered).indexOf('apiKey_nonempty') !== -1, 'must also flag the non-empty apiKey default');
});
test('apiStyle flipped to openai → apiStyle_changed violation', function () {
    assert.ok(codes(SRC.replace("apiStyle: 'ollama',", "apiStyle: 'openai',")).indexOf('apiStyle_changed') !== -1);
});
test('url flipped to a cloud gateway → url_changed violation', function () {
    assert.ok(codes(SRC.replace("url: 'http://localhost:11434',", "url: 'https://openrouter.ai/api/v1',")).indexOf('url_changed') !== -1);
});
test('aiProvider flipped to a cloud backend → provider_changed violation', function () {
    assert.ok(codes(SRC.replace("aiProvider: 'ollama',", "aiProvider: 'zen',")).indexOf('provider_changed') !== -1);
});
test('a non-empty nested cloud key → apiKey_nonempty violation', function () {
    // zen block: first nested apiKey:'' after the zen url — flip it to a non-empty value
    const tampered = SRC.replace("apiKey:           '',\n        // Confirmed against the live Zen catalog",
                                 "apiKey:           'opencode-zen-live-secret',\n        // Confirmed against the live Zen catalog");
    assert.notStrictEqual(tampered, SRC, 'tamper anchor must match the zen block');
    assert.ok(codes(tampered).indexOf('apiKey_nonempty') !== -1, 'must flag the non-empty nested key');
});
test('the violation message tells the operator to use env vars / ai-secrets.local.js (req #5)', function () {
    const vio = auditAiConfig(SRC.replace("apiStyle: 'ollama',", "apiStyle: 'openai',"));
    assert.ok(vio.length && /env vars/.test(vio[0].message) && /ai-secrets\.local\.js/.test(vio[0].message),
        'message must name env vars + ai-secrets.local.js');
});

console.log('\n' + (fail === 0 ? '✅ PASS' : '❌ FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail === 0 ? 0 : 1);
})();
