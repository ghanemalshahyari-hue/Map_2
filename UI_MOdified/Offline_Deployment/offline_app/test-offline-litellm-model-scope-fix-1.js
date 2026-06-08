/**
 * test-offline-litellm-model-scope-fix-1.js — OFFLINE-LITELLM-MODEL-SCOPE-FIX-1
 *
 * Regression guard: ReferenceError: model is not defined
 * at /app/server/wargame-sim-bridge.js (child close handler, timeout branch).
 *
 * Root cause: the child.on('close') callback references `model` which is only
 * defined inside buildLlmChildEnv(). Fix: use _llm.summary.model instead.
 *
 * This test FAILS if the bad pattern is re-introduced and PASSES with the fix.
 * No server, no API keys, no certificates required.
 *
 * Run from Offline_Deployment/offline_app/:
 *   node test-offline-litellm-model-scope-fix-1.js
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

console.log('\n══════════════════════════════════════════════════════════════════');
console.log('  OFFLINE-LITELLM-MODEL-SCOPE-FIX-1 — model scope regression guard');
console.log('══════════════════════════════════════════════════════════════════\n');

test('wargame-sim-bridge.js exists', () => {
    assert.ok(fs.existsSync(BRIDGE), 'Missing: ' + BRIDGE);
});

const src = fs.existsSync(BRIDGE) ? fs.readFileSync(BRIDGE, 'utf8') : '';

// ── T1: the specific crashing expression is gone ──────────────────────────────

test('T1: unsafe (model || process.env.RMOOZ_AI_MODEL) NOT in file', () => {
    // This exact pattern crashed the close handler with ReferenceError.
    assert.ok(
        !src.includes('(model || process.env.RMOOZ_AI_MODEL'),
        'REGRESSION: found (model || process.env.RMOOZ_AI_MODEL...) — bare model is out of scope here'
    );
});

// ── T2: the safe replacement is present ──────────────────────────────────────

test('T2: safe (_llm.summary.model || process.env.RMOOZ_AI_MODEL) IS in file', () => {
    assert.ok(
        src.includes('_llm.summary.model || process.env.RMOOZ_AI_MODEL'),
        'Fix missing: expected (_llm.summary.model || process.env.RMOOZ_AI_MODEL) in timeout branch'
    );
});

// ── T3: close handler region contains no bare model expression ────────────────

test('T3: no bare `model` JS expression inside child.on("close") region', () => {
    const closeIdx = src.indexOf("child.on('close'");
    assert.ok(closeIdx >= 0, "child.on('close') not found");
    const region = src.slice(closeIdx, closeIdx + 3500);
    const badLines = region.split('\n').filter(line => {
        const t = line.trim();
        if (t.startsWith('//') || t.startsWith('*')) return false;
        if (/\.\bmodel\b/.test(t)) return false;       // .model  — property access OK
        if (/['"]model['"]/.test(t)) return false;     // "model" — string key OK
        if (/\bmodel\s*[=:]/.test(t)) return false;    // model= or model: — assignment/key OK
        return /\(\s*model\s*\|\||\bmodel\s*\|\||\+\s*model\b/.test(t);
    });
    assert.ok(badLines.length === 0,
        'Bare model expression in close handler:\n' +
        badLines.slice(0, 3).map(l => '  ' + l.trim()).join('\n'));
});

// ── T4: _llm is defined in the same scope that close() closes over ────────────

test('T4: `const _llm = buildLlmChildEnv` defined before child spawn', () => {
    assert.ok(
        src.includes('const _llm = buildLlmChildEnv('),
        '_llm is not built via buildLlmChildEnv — close handler cannot access _llm.summary.model'
    );
});

test('T5: _llm.summary.model used in the timeout classifier branch', () => {
    // The timeout branch should show the model name to the operator.
    const timeoutIdx = src.indexOf("errorCode = 'timeout'");
    assert.ok(timeoutIdx >= 0, "timeout errorCode assignment not found");
    const branch = src.slice(timeoutIdx, timeoutIdx + 500);
    assert.ok(
        branch.includes('_llm.summary.model'),
        'timeout branch does not use _llm.summary.model for the model name in the error message'
    );
});

// ── T5: buildLlmChildEnv returns summary.model ────────────────────────────────

test('T6: summary.model is set in buildLlmChildEnv return value', () => {
    assert.ok(
        /model\s*:\s*model/.test(src),
        'summary.model: model not found in buildLlmChildEnv return — _llm.summary.model would be null/undefined'
    );
});

// ── Results ───────────────────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(68));
console.log('  Results: ' + passed + ' passed, ' + failed + ' failed');
console.log('═'.repeat(68) + '\n');
process.exit(failed > 0 ? 1 : 0);
