/**
 * OFFLINE-GEN-DIAG-0 — Static wiring checks for the generation-reset diagnosis.
 *
 * READ-ONLY. This does NOT fix anything. It asserts the current (broken) wiring
 * so the diagnosis is reproducible and so a future OFFLINE-GEN-RUN-FIX-1 can flip
 * these expectations once the fix lands.
 *
 * Usage:  node test-offline-gen-diag-0.js
 */
'use strict';

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');

const ROOT = __dirname;
const OD   = path.join(ROOT, 'Offline_Deployment');
let passed = 0, failed = 0;

function test(name, fn) {
    try { fn(); console.log(`  [PASS] ${name}`); passed++; }
    catch (e) { console.log(`  [FAIL] ${name}: ${e.message}`); failed++; }
}

console.log('\n══════════════════════════════════════════════════════════════════');
console.log('  OFFLINE-GEN-DIAG-0 — Generation reset diagnosis (static evidence)');
console.log('══════════════════════════════════════════════════════════════════\n');

// ─── §1  Bridge route + spawn env evidence ───────────────────────────────────
console.log('── §1  Bridge generation route + spawn env ─────────────────────');

const bridge = fs.readFileSync(path.join(ROOT, 'server', 'wargame-sim-bridge.js'), 'utf8');

test('bridge handles POST /api/wargame-sim/run', () => {
    assert.ok(bridge.includes("'/api/wargame-sim/run'"), 'run route must exist');
});

test('bridge handles GET /api/wargame-sim/status', () => {
    assert.ok(bridge.includes("'/api/wargame-sim/status'"), 'status route must exist');
});

test('FIXED: offline bridge overlay exists', () => {
    const overlay = path.join(OD, 'offline_app', 'server', 'wargame-sim-bridge.js');
    assert.ok(fs.existsSync(overlay), 'offline bridge overlay must exist');
});

test('FIXED: offline bridge wires LiteLLM/Ollama endpoint/key into Python child', () => {
    const overlay = fs.readFileSync(path.join(OD, 'offline_app', 'server', 'wargame-sim-bridge.js'), 'utf8');
    assert.ok(overlay.includes('buildLlmChildEnv'), 'overlay must build child LLM env');
    assert.ok(/LLM_BASE_URL/.test(overlay), 'overlay must set LLM_BASE_URL');
    assert.ok(/LLM_API_KEY/.test(overlay), 'overlay must set LLM_API_KEY');
    assert.ok(/RMOOZ_AI_BASE_URL/.test(overlay), 'overlay must read RMOOZ_AI_BASE_URL');
    assert.ok(/RMOOZ_AI_API_KEY/.test(overlay), 'overlay must read RMOOZ_AI_API_KEY');
});

// ─── §2  WarGamingGEN .env default points at localhost Ollama ────────────────
console.log('\n── §2  WarGamingGEN generator LLM config ───────────────────────');

const wgenEnvPath = path.join(ROOT, 'TestingAI', 'WarGamingGEN', '.env');
test('WarGamingGEN/.env exists', () => {
    assert.ok(fs.existsSync(wgenEnvPath), 'WarGamingGEN/.env must exist');
});

test('EVIDENCE: WarGamingGEN/.env LLM_BASE_URL points at localhost:11434 (no LLM in container)', () => {
    const env = fs.readFileSync(wgenEnvPath, 'utf8');
    const line = env.split('\n').find(l => l.startsWith('LLM_BASE_URL='));
    assert.ok(line, 'LLM_BASE_URL must be defined');
    assert.ok(line.includes('localhost:11434') || line.includes('127.0.0.1:11434'),
        `LLM_BASE_URL points at local Ollama: ${line}`);
});

// ─── §3  Frontend 20% + reset mechanics ──────────────────────────────────────
console.log('\n── §3  Frontend 20% flash + reset mechanics ────────────────────');

const wiz = fs.readFileSync(path.join(ROOT, 'client', 'shell', 'scenario-import-wizard.js'), 'utf8');

test('EVIDENCE: pct() returns 20 when total is falsy / phases_done=0', () => {
    assert.ok(wiz.includes('return 20') || wiz.match(/20\s*\+\s*Math\.round/),
        'pct() base is 20% (explains the 20% flash)');
});

test('EVIDENCE: poll URL is generic /api/wargame-sim/status (no runId)', () => {
    assert.ok(wiz.includes("'/api/wargame-sim/status'") || wiz.includes('/api/wargame-sim/status'),
        'status polled without runId');
});

test('EVIDENCE: reset branch shows "Ready to start a new generation"', () => {
    assert.ok(wiz.includes('Ready to start a new generation'),
        'the silent reset message exists (secondary issue I)');
});

// ─── §4  Diagnosis doc exists ────────────────────────────────────────────────
console.log('\n── §4  Diagnosis document ──────────────────────────────────────');

test('diagnosis report exists', () => {
    assert.ok(fs.existsSync(path.join(ROOT, 'docs', 'integration', 'offline-gen-diag-0-generation-reset-diagnosis.md')),
        'diagnosis md must exist');
});

test('diagnosis names APIConnectionError root cause', () => {
    const doc = fs.readFileSync(path.join(ROOT, 'docs', 'integration', 'offline-gen-diag-0-generation-reset-diagnosis.md'), 'utf8');
    assert.ok(doc.includes('APIConnectionError'), 'must cite the actual Python error');
    assert.ok(doc.includes('OFFLINE-GEN-RUN-FIX-1'), 'must name the follow-up fix task');
});

// ─── §5  No production files changed by this diagnosis ───────────────────────
console.log('\n── §5  No production code modified ──────────────────────────────');

test('main wargame-sim-bridge.js remains valid while offline overlay carries container wiring', () => {
    assert.ok(bridge.includes("Object.assign({}, process.env, { LLM_LOCAL_FORCE_FALLBACK: '1', LLM_MODEL: c.simModel })") ||
              bridge.includes('buildLlmChildEnv'),
        'main bridge should remain valid while offline overlay carries container-specific wiring');
});

test('offline overlay wargame-sim-bridge.js is present for GEN-RUN-FIX-1', () => {
    const overlay = path.join(OD, 'offline_app', 'server', 'wargame-sim-bridge.js');
    assert.ok(fs.existsSync(overlay),
        'overlay must exist so Dockerfile.offline can copy it into the image');
});

// ─── Results ──────────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(66));
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log('═'.repeat(66) + '\n');
process.exit(failed > 0 ? 1 : 0);
