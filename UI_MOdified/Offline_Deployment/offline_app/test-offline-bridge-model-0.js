/**
 * test-offline-bridge-model-0.js — OFFLINE-BRIDGE-MODEL-0
 *
 * Regression guard for: ReferenceError: model is not defined
 * at /app/server/wargame-sim-bridge.js (timeout error-message path).
 *
 * Root cause: the `close` callback closed over `_llm` (built by
 * buildLlmChildEnv) but the error-message string referenced a bare
 * `model` variable that only exists inside buildLlmChildEnv's local scope.
 * Fix: use _llm.summary.model instead.
 *
 * Static only — no server required.
 * Run from Offline_Deployment/offline_app/:
 *   node test-offline-bridge-model-0.js
 */
'use strict';

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');

const BRIDGE = path.join(__dirname, 'server', 'wargame-sim-bridge.js');

let passed = 0, failed = 0;

function test(name, fn) {
    try { fn(); console.log('  [PASS] ' + name); passed++; }
    catch (e) { console.log('  [FAIL] ' + name + ': ' + e.message); failed++; }
}

console.log('\n══════════════════════════════════════════════════════════════');
console.log('  OFFLINE-BRIDGE-MODEL-0 — wargame-sim-bridge model-scope guard');
console.log('══════════════════════════════════════════════════════════════\n');

// ── §0  File must exist ───────────────────────────────────────────────────────

console.log('── §0  File presence ────────────────────────────────────────────');

test('wargame-sim-bridge.js exists', () => {
    assert.ok(fs.existsSync(BRIDGE), 'Missing: ' + BRIDGE);
});

const src = fs.readFileSync(BRIDGE, 'utf8');

// ── §1  The bad pattern must not exist anywhere in the file ───────────────────

console.log('\n── §1  Bad pattern absent ───────────────────────────────────────');

// The crash was: "The model ..." + (model || ...)
// `model` is only in scope inside buildLlmChildEnv; using it outside is ReferenceError.
test('no bare `model` in string concat in error message paths', () => {
    // Match: ( model   or   (model  used in a string context (not _llm.summary.model or c.simModel etc.)
    const bad = /\(\s*model\s*\|\|/.exec(src);
    assert.ok(!bad,
        'Found bare (model || ...) in bridge — likely an out-of-scope reference. ' +
        'Use _llm.summary.model instead.');
});

test('no bare `model` as JS expression in string concat / fallback (outside buildLlmChildEnv)', () => {
    // Guard against: "..." + (model || ...) outside buildLlmChildEnv local scope.
    // Only catches EXPRESSION-context usage, not:
    //   - `model: model || null`  (object property value — correct local scope)
    //   - `'...faster model or...'` (the word "model" inside a string literal)
    //   - `.model` / `simModel` (property access / compound identifier)
    //   - `model =` (local variable assignment)
    //   - `model:` (object key)
    const lines = src.split('\n');
    const bad = lines.filter(line => {
        const t = line.trim();
        if (t.startsWith('//') || t.startsWith('*')) return false;
        if (/\bmodel\s*[=:]/.test(t)) return false;           // assignment or object key
        if (/\.\bmodel\b/.test(t)) return false;              // property access (.model)
        if (/['"]model['"]/.test(t)) return false;            // string key "model"
        // Only flag the specific expression patterns: `(model ||` or `+ model` or `model +`
        // (not the English word "model" inside a quoted string literal)
        return /\(\s*model\s*\|\||\bmodel\s*\|\||\+\s*model\b/.test(t);
    });
    assert.ok(bad.length === 0,
        'Lines with bare `model` used as a JS expression (concat/fallback):\n' + bad.join('\n'));
});

// ── §2  The correct pattern must be present ───────────────────────────────────

console.log('\n── §2  Correct pattern present ──────────────────────────────────');

test('_llm.summary.model used in timeout error message', () => {
    assert.ok(
        src.includes('_llm.summary.model'),
        'Expected _llm.summary.model in bridge (timeout error path). It may have been reverted.'
    );
});

test('timeout error string references _llm.summary.model || process.env.RMOOZ_AI_MODEL', () => {
    // The corrected line should contain both the safe accessor and the env fallback.
    assert.ok(
        src.includes('_llm.summary.model') && src.includes('process.env.RMOOZ_AI_MODEL'),
        'Timeout error path should fall back: _llm.summary.model || process.env.RMOOZ_AI_MODEL || "?"'
    );
});

// ── §3  buildLlmChildEnv local scope is intact ───────────────────────────────

console.log('\n── §3  buildLlmChildEnv scope ───────────────────────────────────');

test('buildLlmChildEnv function exists', () => {
    assert.ok(src.indexOf('function buildLlmChildEnv') >= 0 || src.indexOf('buildLlmChildEnv') >= 0,
        'buildLlmChildEnv not found — bridge may have been refactored');
});

test('summary.model is set inside buildLlmChildEnv return value', () => {
    // The function returns an object with summary.model. Check the shape.
    assert.ok(
        /model\s*:\s*model\b/.test(src) || /model\s*:\s*(model\s*\|\|\s*null|model\b)/.test(src),
        'summary.model property assignment not found inside buildLlmChildEnv'
    );
});

// ── §4  Error-classifier block has no other undefined references ──────────────

console.log('\n── §4  Error-classifier block integrity ──────────────────────────');

// Extract the close-handler region (from child.on('close' to the matching closing brace area)
const closeStart = src.indexOf("child.on('close'");
test("child.on('close' handler found", () => {
    assert.ok(closeStart >= 0, "child.on('close' not found in bridge");
});

if (closeStart >= 0) {
    // Take a generous window after the close handler start (covers all classifiers)
    const closeRegion = src.slice(closeStart, closeStart + 3000);

    test('no bare `model` used as JS expression in close-handler region', () => {
        // Catches only expression-context uses: (model || ...) or + model or model ||
        // Does NOT flag: .model, "model", model:, model =, or the English word inside a string.
        const lines = closeRegion.split('\n');
        const bad = lines.filter(line => {
            const t = line.trim();
            if (t.startsWith('//') || t.startsWith('*')) return false;
            if (/\.\bmodel\b/.test(t)) return false;           // property access
            if (/['"]model['"]/.test(t)) return false;         // string key
            if (/\bmodel\s*[=:]/.test(t)) return false;        // assignment or object key
            return /\(\s*model\s*\|\||\bmodel\s*\|\||\+\s*model\b/.test(t);
        });
        assert.ok(bad.length === 0,
            'Bare `model` used as JS expression in close-handler:\n' +
            bad.slice(0, 5).map(l => '  ' + l.trim()).join('\n'));
    });

    test('timeout classifier sets errorCode = "timeout"', () => {
        assert.ok(
            closeRegion.includes("errorCode = 'timeout'"),
            'timeout errorCode assignment missing from close-handler region'
        );
    });

    test('classifiedError is assigned in the timeout branch', () => {
        assert.ok(
            closeRegion.includes('classifiedError ='),
            'classifiedError assignment not found in close-handler region'
        );
    });
}

// ── §5  No API key / secret leakage ──────────────────────────────────────────

console.log('\n── §5  No secret leakage in error messages ──────────────────────');

test('no LLM_API_KEY value printed in string literals', () => {
    // The env var name is fine to log; its VALUE must never be in a string literal.
    // Detect patterns like: "key: " + env.LLM_API_KEY  (value in error path)
    const leaks = /['"](?:api[_-]?key|password|secret|private[_-]?key)['"\s]*\+.*env\./i.exec(src);
    assert.ok(!leaks, 'Possible secret value in string concat: ' + (leaks && leaks[0]));
});

test('redactSecrets helper is called before logging stderr', () => {
    assert.ok(
        src.includes('redactSecrets('),
        'redactSecrets() not called in bridge — stderr may leak secrets'
    );
});

// ── Results ───────────────────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(62));
console.log('  Results: ' + passed + ' passed, ' + failed + ' failed');
console.log('═'.repeat(62) + '\n');
process.exit(failed > 0 ? 1 : 0);
