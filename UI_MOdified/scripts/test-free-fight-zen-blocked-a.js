'use strict';
/* ============================================================================
 * test-free-fight-zen-blocked-a.js — SECURITY REGRESSION
 *   (RMOOZ-AI-FREE-FIGHT-SECURITY-CLEANUP-A)
 * ----------------------------------------------------------------------------
 * Locks the local-only policy after a foreign WIP change tried to (a) unblock
 * the `zen` cloud provider for Free Fight and (b) commit a real
 * OPENCODE_ZEN_API_KEY into the tracked .env.example. Both were reverted; this
 * test fails if either ever returns.
 *
 *   PART 1 — Free Fight BLOCKS remote/cloud providers (zen / claude / openai / auto):
 *     - isRemoteProvider() classifies them as remote (ollama is local)
 *     - routeHealth() with provider=zen → provider_blocked, ai_execution disabled,
 *       and it NEVER reports zen as the active provider (reports ollama)
 *     - _callLlm() with provider=zen short-circuits to remote_blocked and makes
 *       ZERO provider/cloud calls
 *     - planCoas() end-to-end with provider=zen makes ZERO aiProvider.generate
 *       calls (the COA path AND the capability-analyst path both block) and the
 *       plan is NOT presented as an LLM plan
 *
 *   PART 2 — tracked .env.example contains PLACEHOLDERS ONLY (no committed secret):
 *     - no sk-* / sk-ant-* secret token on any non-comment line
 *     - every *_API_KEY / *_TOKEN / *_SECRET var is a blank placeholder
 *     - OPENCODE_ZEN_API_KEY is explicitly blank
 *   (Failure messages REDACT any value — the secret is never printed.)
 *
 * Run: node scripts/test-free-fight-zen-blocked-a.js   (exit 0 = green)
 * ========================================================================== */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const SRV = path.join(__dirname, '..', 'server', 'ai');
const COA = require(path.join(SRV, 'free-fight-coa-planner.js'));
const AIP = require(path.join(SRV, 'ai-provider.js'));

let pass = 0, fail = 0;
function test(name, fn) { try { fn(); console.log('  ✓ ' + name); pass++; } catch (e) { console.log('  ✗ ' + name + ' — ' + (e && e.message)); fail++; } }
async function atest(name, fn) { try { await fn(); console.log('  ✓ ' + name); pass++; } catch (e) { console.log('  ✗ ' + name + ' — ' + (e && e.message)); fail++; } }

// ── env hygiene: save/restore the keys we toggle ──────────────────────────────
const SAVED = { p: process.env.RMOOZ_FREE_FIGHT_PROVIDER, g: process.env.RMOOZ_ALLOW_SIM_RUN };
function setZen() { process.env.RMOOZ_FREE_FIGHT_PROVIDER = 'zen'; process.env.RMOOZ_ALLOW_SIM_RUN = '1'; }
function restoreEnv() {
    if (SAVED.p === undefined) delete process.env.RMOOZ_FREE_FIGHT_PROVIDER; else process.env.RMOOZ_FREE_FIGHT_PROVIDER = SAVED.p;
    if (SAVED.g === undefined) delete process.env.RMOOZ_ALLOW_SIM_RUN; else process.env.RMOOZ_ALLOW_SIM_RUN = SAVED.g;
}

(async function () {
console.log('\n═══ RMOOZ-AI-FREE-FIGHT-SECURITY-CLEANUP-A (zen blocked + .env.example clean) ═══\n');

// ─────────────────────────────────────────────────────────────────────────────
console.log('PART 1 — Free Fight blocks remote/cloud providers');

test('isRemoteProvider: zen/claude/openai/auto blocked; ollama allowed', function () {
    assert.strictEqual(COA.isRemoteProvider('zen'), true, 'zen MUST be blocked');
    assert.strictEqual(COA.isRemoteProvider('Zen'), true, 'case-insensitive');
    assert.strictEqual(COA.isRemoteProvider('  ZEN '), true, 'trimmed + case-insensitive');
    assert.strictEqual(COA.isRemoteProvider('claude'), true);
    assert.strictEqual(COA.isRemoteProvider('openai'), true);
    assert.strictEqual(COA.isRemoteProvider('auto'), true);
    assert.strictEqual(COA.isRemoteProvider('ollama'), false, 'local ollama is allowed');
});

test('routeHealth() with provider=zen → blocked + never leaks zen as active provider', function () {
    setZen();
    const h = COA.routeHealth();
    restoreEnv();
    assert.strictEqual(h.provider_blocked, true, 'provider_blocked must be true');
    assert.strictEqual(h.ai_execution_enabled, false, 'ai_execution must be disabled for a blocked provider');
    assert.strictEqual(h.provider, 'ollama', 'must NOT report zen as the active provider (reports ollama)');
    assert.ok(Array.isArray(h.remote_providers_blocked) && h.remote_providers_blocked.indexOf('zen') !== -1, 'zen listed in remote_providers_blocked');
    assert.ok(/blocked/i.test(String(h.reason_if_blocked || '')), 'reason_if_blocked names the block');
});

await atest('_callLlm() with provider=zen → remote_blocked, ZERO provider calls', async function () {
    let genCalls = 0;
    const spy = { generate: function () { genCalls++; return Promise.resolve({ ok: true, response: '{"coas":[]}' }); } };
    setZen();
    const r = await COA._callLlmForTest([{ id: 'R-1', side: 'RED', lat: 25.3, lon: 51.2 }], [{ lat: 25.3, lon: 51.2 }], {}, {}, spy);
    restoreEnv();
    assert.strictEqual(r.ok, false, 'must not be ok');
    assert.strictEqual(r.llm_status, 'remote_blocked', 'llm_status = remote_blocked');
    assert.strictEqual(r.fallback_reason, 'remote_provider_not_allowed_for_free_fight', 'honest fallback_reason');
    assert.strictEqual(genCalls, 0, 'NO cloud/provider call was made (short-circuits before generate)');
});

await atest('planCoas() end-to-end with provider=zen → ZERO aiProvider.generate calls + not an LLM plan', async function () {
    const realGen = AIP.generate; let genCalls = 0;
    AIP.generate = function () { genCalls++; return Promise.resolve({ ok: true, providerUsed: 'zen', response: '{"coas":[]}' }); };
    setZen();
    const units = [
        { id: 'R-1', side: 'RED', country: 'Qatar', lat: 25.30, lon: 51.20, platform: 'fighter jet' },
        { id: 'R-2', side: 'RED', country: 'Qatar', lat: 25.33, lon: 51.23, platform: 'armor' },
        { id: 'B-1', side: 'BLUE', country: 'Bahrain', lat: 25.55, lon: 51.42, platform: 'SAM battery' },
    ];
    let r;
    try {
        r = await COA.planCoas(units, [{ lat: 25.30, lon: 51.20, name: 'Objective X' }], {},
            { planning_mode: 'commander', ai_depth: 'normal', useLlm: true, preferSide: 'RED', commander_mode: 'free' });
    } finally { AIP.generate = realGen; restoreEnv(); }
    assert.strictEqual(genCalls, 0, 'a blocked (zen) provider must NEVER reach aiProvider.generate from Free Fight');
    assert.notStrictEqual(r && r.plan_source, 'llm', 'a blocked provider must NOT yield an LLM plan');
    // The attempt is logged honestly (llm_called:true) but the block is surfaced and no cloud was used.
    assert.strictEqual(r && r.llm_status, 'remote_blocked', 'block surfaced honestly (llm_status=remote_blocked)');
    assert.strictEqual(r && r.fallback_reason, 'remote_provider_not_allowed_for_free_fight', 'honest fallback_reason');
    assert.ok(!(r && r.provider_used), 'no cloud provider was used (provider_used is falsy)');
});

// ─────────────────────────────────────────────────────────────────────────────
console.log('\nPART 2 — tracked .env.example contains placeholders only (no committed secret)');

const ENV_EXAMPLE = path.join(__dirname, '..', '.env.example');
// secret-shaped tokens (the value is NEVER printed on failure — only the line number)
const SECRET_SHAPE = /(sk-ant-[A-Za-z0-9_-]{6,}|sk-[A-Za-z0-9]{16,})/;
const KEYISH = /^\s*([A-Za-z_][A-Za-z0-9_]*(?:_API_KEY|_KEY|_TOKEN|_SECRET))\s*=\s*(.*)$/;
function stripQuotes(v) { return String(v).trim().replace(/^(['"])(.*)\1$/, '$2').trim(); }

test('.env.example exists and is readable', function () {
    assert.ok(fs.existsSync(ENV_EXAMPLE), '.env.example present at ' + ENV_EXAMPLE);
});

test('.env.example: no sk-* / sk-ant-* secret token on any non-comment line', function () {
    const lines = fs.readFileSync(ENV_EXAMPLE, 'utf8').split(/\r?\n/);
    lines.forEach(function (line, i) {
        if (/^\s*#/.test(line)) return;                       // skip comments (placeholders like sk-ant-... live there)
        assert.ok(!SECRET_SHAPE.test(line), 'secret-shaped token committed on line ' + (i + 1) + ' [value REDACTED]');
    });
});

test('.env.example: every *_API_KEY / *_TOKEN / *_SECRET is a BLANK placeholder', function () {
    const lines = fs.readFileSync(ENV_EXAMPLE, 'utf8').split(/\r?\n/);
    lines.forEach(function (line, i) {
        if (/^\s*#/.test(line)) return;
        const m = line.match(KEYISH);
        if (!m) return;
        const val = stripQuotes(m[2]);
        assert.strictEqual(val, '', m[1] + ' must be a blank placeholder (line ' + (i + 1) + ') — found a non-empty value [REDACTED]');
    });
});

test('.env.example: OPENCODE_ZEN_API_KEY is explicitly blank', function () {
    const lines = fs.readFileSync(ENV_EXAMPLE, 'utf8').split(/\r?\n/);
    const hit = lines.find(function (l) { return /^\s*OPENCODE_ZEN_API_KEY\s*=/.test(l); });
    assert.ok(hit !== undefined, 'OPENCODE_ZEN_API_KEY line present');
    assert.strictEqual(stripQuotes(hit.split('=').slice(1).join('=')), '', 'OPENCODE_ZEN_API_KEY must be blank [value REDACTED]');
});

// best-effort scan of any other tracked *.example env files alongside it (no strict-blank rule there)
['.env.offline.example'].forEach(function (rel) {
    const p = path.join(__dirname, '..', rel);
    if (!fs.existsSync(p)) return;
    test(rel + ': no sk-* / sk-ant-* secret token on any non-comment line', function () {
        fs.readFileSync(p, 'utf8').split(/\r?\n/).forEach(function (line, i) {
            if (/^\s*#/.test(line)) return;
            assert.ok(!SECRET_SHAPE.test(line), 'secret-shaped token committed in ' + rel + ' line ' + (i + 1) + ' [value REDACTED]');
        });
    });
});

console.log('\n' + (fail === 0 ? '✅ PASS' : '❌ FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail === 0 ? 0 : 1);
})().catch(function (e) { console.error('FATAL', e && e.stack || e); process.exit(1); });
