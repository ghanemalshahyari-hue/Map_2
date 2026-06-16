'use strict';
/* ============================================================================
 * test-freefight-local-llm-timeout-polish-a.js — FREEFIGHT-LOCAL-LLM-TIMEOUT-POLISH-A
 * Static checks — no server required.
 * ========================================================================== */

const fs   = require('fs');
const path = require('path');

let PASS = 0, FAIL = 0;
function ok(label, cond, detail) {
    if (cond) { console.log('  PASS  ' + label); PASS++; }
    else       { console.log('  FAIL  ' + label + (detail ? '  (' + detail + ')' : '')); FAIL++; }
}

const llmSrc = fs.readFileSync(
    path.join(__dirname, 'UI_MOdified/server/ai/free-fight-llm-decision.js'), 'utf8');
const clientSrc = fs.readFileSync(
    path.join(__dirname, 'UI_MOdified/client/shell/free-fight-demo.js'), 'utf8');
// RMOOZ-LLM-RUNTIME-CONFIG-A: the per-call timeout was centralized into the canonical
// resolver; the decision module now delegates to it. Scan/exercise the resolver.
const cfgSrc  = fs.readFileSync(
    path.join(__dirname, 'UI_MOdified/server/ai/llm-runtime-config.js'), 'utf8');
const LLM_CFG = require(path.join(__dirname, 'UI_MOdified/server/ai/llm-runtime-config.js'));

// ── SECTION 1: Default timeout is 120000ms, owned by the canonical resolver ───
// (Default bumped 45s→120s by RMOOZ-AI-COA-TIMEOUT-RETRY-A, then centralized into
// llm-runtime-config.js by RMOOZ-LLM-RUNTIME-CONFIG-A — the decision module delegates.)
console.log('\n§1  Default unit-decision timeout is 120000ms (canonical resolver)');
ok('canonical resolver default timeout constant is 120000',
    LLM_CFG.DEFAULT_TIMEOUT_MS === 120000);
ok('decision module delegates the timeout to the resolver (LLM_CFG.getTimeoutMs)',
    /LLM_CFG\.getTimeoutMs\(/.test(llmSrc));
ok('old 15000/45000 default NOT present in decision module code',
    !/timeoutMs\s*=\s*(15000|45000)/.test(llmSrc) && !/\|\|\s*'(15000|45000)'/.test(llmSrc));

// ── SECTION 2: Env override + precedence (now owned by the resolver) ──────────
console.log('\n§2  Timeout env override + precedence (canonical resolver)');
ok('resolver reads canonical RMOOZ_LLM_TIMEOUT_MS', /RMOOZ_LLM_TIMEOUT_MS/.test(cfgSrc));
ok('resolver reads legacy RMOOZ_FREE_FIGHT_TIMEOUT_MS', /RMOOZ_FREE_FIGHT_TIMEOUT_MS/.test(cfgSrc));
ok('resolver reads legacy RMOOZ_AI_TIMEOUT_MS', /RMOOZ_AI_TIMEOUT_MS/.test(cfgSrc));
ok('resolver parses with parseInt', /parseInt/.test(cfgSrc));
ok('decision module no longer reads RMOOZ_*_TIMEOUT_MS env directly',
    !/process\.env\.RMOOZ_[A-Z_]*TIMEOUT_MS/.test(llmSrc));

// Functional check: the REAL resolver honors the env override
(function() {
    var saved = process.env.RMOOZ_FREE_FIGHT_TIMEOUT_MS;
    process.env.RMOOZ_FREE_FIGHT_TIMEOUT_MS = '8000';
    ok('env override 8000 resolves correctly (resolver)', LLM_CFG.getTimeoutMs('decision') === 8000);
    if (saved !== undefined) process.env.RMOOZ_FREE_FIGHT_TIMEOUT_MS = saved;
    else delete process.env.RMOOZ_FREE_FIGHT_TIMEOUT_MS;
})();

// Functional check: default 120000 when every timeout knob is unset
(function() {
    var keys = ['RMOOZ_FREE_FIGHT_TIMEOUT_MS', 'RMOOZ_AI_TIMEOUT_MS', 'RMOOZ_LLM_TIMEOUT_MS', 'RMOOZ_OLLAMA_TIMEOUT_MS', 'RMOOZ_LLM_TIMEOUT_MS_DECISION'];
    var snap = {}; keys.forEach(function (k) { snap[k] = process.env[k]; delete process.env[k]; });
    ok('default 120000 when env unset (resolver)', LLM_CFG.getTimeoutMs('decision') === 120000);
    keys.forEach(function (k) { if (snap[k] !== undefined) process.env[k] = snap[k]; });
})();

// ── SECTION 3: Timeout fallback returns deterministic valid unit ──────────────
console.log('\n§3  Timeout fallback returns deterministic valid unit');
ok('local_llm_unavailable path returns action:null (bridge calls ENGINE)',
    /local_llm_unavailable/.test(llmSrc));
ok('ENGINE.decideAction imported',
    /require.*free-fight-action-engine/.test(llmSrc));
ok('deterministic fallback used comment present in validation fail paths',
    /deterministic fallback used/.test(llmSrc));

// ── SECTION 4: Local-only policy unchanged ───────────────────────────────────
console.log('\n§4  Local-only provider policy unchanged');
ok('REMOTE_PROVIDERS_BLOCKED still includes claude',
    /REMOTE_PROVIDERS_BLOCKED.*claude/.test(llmSrc) ||
    /claude.*REMOTE_PROVIDERS_BLOCKED/.test(llmSrc) ||
    /'claude'/.test(llmSrc));
ok('never reads RMOOZ_AI_PROVIDER comment present',
    /never read.*RMOOZ_AI_PROVIDER|LOCAL-ONLY.*never read/i.test(llmSrc));
ok('provider_policy: local_only in all return paths',
    (llmSrc.match(/provider_policy.*local_only/g) || []).length >= 3);

// ── SECTION 5: UI warming label and timeout hint ─────────────────────────────
console.log('\n§5  UI warming label and timeout hint in client');
ok('Test button shows Warming LLM while testing',
    /Warming LLM/.test(clientSrc));
ok('Test button has tooltip about warming',
    /warms.*Ollama|Warms.*local|warm.*model/i.test(clientSrc));
ok('Timeout fallback_reason shows warm-model hint',
    /timeout.*Test Local LLM|warm model.*retry/i.test(clientSrc) ||
    /click Test Local LLM to warm model/.test(clientSrc));
ok('isTimeout check detects timed.out in fallback_reason',
    /isTimeout.*timed.out|timeout.*isTimeout/i.test(clientSrc) ||
    /timed\.out/.test(clientSrc));

// ── SECTION 6: Existing local-only policy checks (spot check) ────────────────
console.log('\n§6  Existing local-only policy spot checks');
ok('askLlmForAction signature unchanged',
    /async function askLlmForAction/.test(llmSrc));
ok('testLlmConnection exported',
    /testLlmConnection/.test(llmSrc) && /module\.exports/.test(llmSrc));
ok('allowed_unit_ids still in prompt (FREEFIGHT-REAL-SCENARIO-UNIT-FEED-A)',
    /allowed_unit_ids/.test(llmSrc));

// ── Summary ──────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(52));
console.log('PASS: ' + PASS + '  FAIL: ' + FAIL + '  TOTAL: ' + (PASS + FAIL));
if (FAIL > 0) process.exit(1);
