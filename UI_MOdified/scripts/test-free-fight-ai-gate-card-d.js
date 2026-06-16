'use strict';
/* ============================================================================
 * test-free-fight-ai-gate-card-d.js — RMOOZ-FREE-FIGHT-AI-GATE-CARD-D
 * ----------------------------------------------------------------------------
 * The Free Fight AI status card must explain the EXACT blocking reason + fix,
 * separately for the execution gate (RMOOZ_ALLOW_SIM_RUN) and the raw provider
 * (local-only policy), and show BOTH when both are blocked.
 *
 *   SERVER) routeHealth() exposes configured_provider (raw) + provider_blocked,
 *           while the active `provider` stays masked to ollama.
 *   1) allow_sim_run=false                → execution-gate fix message
 *   2) provider=zen (remote)              → local-only fix names the provider
 *   3) both blocked                       → BOTH messages
 *   4) provider=ollama + allow_sim_run=1  → "ready", no fix messages
 *   5) Staff-Safe stays available + un-warned when AI Commander is blocked
 *
 * Run: node scripts/test-free-fight-ai-gate-card-d.js   (exit 0 = green)
 * ========================================================================== */
const assert = require('assert');
const path = require('path');

let pass = 0, fail = 0;
function test(name, fn) { try { fn(); console.log('  ✓ ' + name); pass++; } catch (e) { console.log('  ✗ ' + name + ' — ' + (e && e.message)); fail++; } }

(function () {
console.log('\n═══ RMOOZ-FREE-FIGHT-AI-GATE-CARD-D ═══\n');

// ── SERVER: routeHealth exposes the raw provider + provider_blocked ───────────
console.log('SERVER) routeHealth exposes configured_provider + provider_blocked (masked provider stays ollama)');
const COA = require(path.join(__dirname, '..', 'server', 'ai', 'free-fight-coa-planner.js'));
const SAVED_P = process.env.RMOOZ_FREE_FIGHT_PROVIDER, SAVED_L = process.env.RMOOZ_LLM_PROVIDER;
test('provider=zen → configured_provider=zen, provider_blocked=true, provider masked to ollama', function () {
    process.env.RMOOZ_FREE_FIGHT_PROVIDER = 'zen'; delete process.env.RMOOZ_LLM_PROVIDER;
    const h = COA.routeHealth();
    assert.strictEqual(h.configured_provider, 'zen', 'raw configured_provider surfaced');
    assert.strictEqual(h.provider_blocked, true, 'provider_blocked true');
    assert.strictEqual(h.provider, 'ollama', 'active provider stays masked');
});
test('provider=ollama (default) → configured_provider=ollama, not blocked', function () {
    delete process.env.RMOOZ_FREE_FIGHT_PROVIDER; delete process.env.RMOOZ_LLM_PROVIDER;
    const h = COA.routeHealth();
    assert.strictEqual(h.configured_provider, 'ollama');
    assert.strictEqual(h.provider_blocked, false);
});
if (SAVED_P === undefined) delete process.env.RMOOZ_FREE_FIGHT_PROVIDER; else process.env.RMOOZ_FREE_FIGHT_PROVIDER = SAVED_P;
if (SAVED_L === undefined) delete process.env.RMOOZ_LLM_PROVIDER; else process.env.RMOOZ_LLM_PROVIDER = SAVED_L;

// ── CLIENT: DOM harness so free-fight-demo.js loads ───────────────────────────
const elById = {};
function mk(t) { const e = { tagName: t, id: '', innerHTML: '', textContent: '', children: [], style: {}, appendChild: function (x) { this.children.push(x); if (x && x.id) elById[x.id] = x; return x; }, removeChild: function (x) { return x; }, setAttribute: function () {}, removeAttribute: function () {}, addEventListener: function () {}, querySelector: function () { return null; }, querySelectorAll: function () { return []; }, getAttribute: function () { return null; } }; Object.defineProperty(e, 'parentNode', { value: null, writable: true }); return e; }
global.document = { body: mk('b'), head: mk('h'), createElement: mk, getElementById: function (id) { return elById[id] || null; }, querySelector: function () { return null; }, addEventListener: function () {} };
global.window = { document: global.document, AppShellEventLog: { append: function () {} }, sessionStorage: { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} }, setTimeout: function () { return 0; }, clearTimeout: function () {}, setInterval: function () { return 0; }, clearInterval: function () {}, fetch: function () { return Promise.resolve({ ok: true, status: 200, text: function () { return Promise.resolve('{}'); } }); } };
global.window.window = global.window;
const C = path.join(__dirname, '..', 'client', 'shell');
require(path.join(C, 'world-state-db.js')); require(path.join(C, 'symbol-db.js')); require(path.join(C, 'symbol-registry.js')); require(path.join(C, 'free-fight-demo.js'));
const DEMO = global.window.RmoozFreeFightDemo;

function gateHtml(rh) { return String(DEMO._aiGateStatusHtmlForTest(rh)); }

console.log('\n1) allow_sim_run=false → execution-gate fix');
test('shows the exact RMOOZ_ALLOW_SIM_RUN fix + blocked headline + separate signals', function () {
    const html = gateHtml({ ok: true, allow_sim_run: false, provider_blocked: false, configured_provider: 'ollama', model_available: false, model: 'qwen2.5:7b' });
    assert.ok(/Free Fight AI is blocked/.test(html), 'blocked headline');
    assert.ok(/Set RMOOZ_ALLOW_SIM_RUN=1 and restart the server\./.test(html), 'exact exec-gate fix (req #4)');
    assert.ok(/data-ff-coa="fix-exec_gate"/.test(html), 'exec-gate fix row present');
    assert.ok(/Execution gate \(RMOOZ_ALLOW_SIM_RUN\)/.test(html) && /DISABLED/.test(html), 'separate exec-gate signal');
    assert.ok(/Local-only policy/.test(html), 'separate local-only signal');
});

console.log('\n2) provider=zen (remote) → local-only fix names the provider');
test('shows the exact local-only fix naming the configured provider (req #5)', function () {
    const html = gateHtml({ ok: true, allow_sim_run: true, provider_blocked: true, configured_provider: 'zen', model_available: true, model: 'qwen2.5:7b' });
    assert.ok(/Free Fight is local-only\. Current provider is zen\./.test(html), 'names the configured provider');
    assert.ok(/Set RMOOZ_LLM_PROVIDER=ollama or remove remote provider env\./.test(html), 'exact provider fix');
    assert.ok(/data-ff-coa="fix-provider"/.test(html), 'provider fix row present');
    assert.ok(/zen — REMOTE, blocked/.test(html), 'provider signal shows remote/blocked');
    assert.ok(!/fix-exec_gate/.test(html), 'no exec-gate fix when the gate is enabled');
});

console.log('\n3) both blocked → BOTH messages (req #6)');
test('shows the exec-gate fix AND the local-only fix together', function () {
    const html = gateHtml({ ok: true, allow_sim_run: false, provider_blocked: true, configured_provider: 'claude', model_available: false, model: 'qwen2.5:7b' });
    assert.ok(/Set RMOOZ_ALLOW_SIM_RUN=1 and restart the server\./.test(html), 'exec-gate fix present');
    assert.ok(/Free Fight is local-only\. Current provider is claude\./.test(html), 'provider fix present (claude)');
    assert.ok(/data-ff-coa="fix-exec_gate"/.test(html) && /data-ff-coa="fix-provider"/.test(html), 'BOTH fix rows present');
});

console.log('\n4) provider=ollama + allow_sim_run=1 + model available → ready');
test('shows ready, no fix messages', function () {
    const html = gateHtml({ ok: true, allow_sim_run: true, provider_blocked: false, configured_provider: 'ollama', model_available: true, model: 'qwen2.5:7b' });
    assert.ok(/Free Fight AI is ready/.test(html), 'ready headline');
    assert.ok(!/data-ff-coa="ai-gate-fixes"/.test(html), 'no fixes block when ready');
    assert.ok(!/Set RMOOZ_ALLOW_SIM_RUN=1/.test(html) && !/local-only\. Current provider/.test(html), 'no fix messages');
    assert.ok(/enabled/.test(html) && /ollama — local/.test(html), 'signals show enabled + local provider');
});

console.log('\n5) Staff-Safe stays available + un-warned when AI Commander is blocked');
test('commander+blocked warns the Generate button; staff_safe does NOT', function () {
    // blocked route health (gate off)
    DEMO._setRouteHealthForTest({ ok: true, allow_sim_run: false, provider_blocked: false, configured_provider: 'ollama', model_available: false, model: 'qwen2.5:7b' });
    DEMO._setAiDepthForTest('normal');

    DEMO._setPlanningModeForTest('commander');
    const cmdHtml = String(DEMO._renderAiDecisionHtmlForTest());
    assert.ok(/data-ff-coa="generate-warning"/.test(cmdHtml), 'commander mode shows the blocked warning banner (req #8)');
    assert.ok(/Generate AI Attack Plan \(blocked\)/.test(cmdHtml), 'commander Generate button labelled blocked');

    DEMO._setPlanningModeForTest('staff_safe');
    const ssHtml = String(DEMO._renderAiDecisionHtmlForTest());
    assert.ok(!/data-ff-coa="generate-warning"/.test(ssHtml), 'Staff-Safe shows NO blocked warning (req #9)');
    assert.ok(/Generate Staff-Safe Plan \(fast\)/.test(ssHtml), 'Staff-Safe Generate button available');
    assert.ok(!/\(blocked\)/.test(ssHtml), 'Staff-Safe button is not marked blocked');
});

console.log('\n' + (fail === 0 ? '✅ PASS' : '❌ FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail === 0 ? 0 : 1);
})();
