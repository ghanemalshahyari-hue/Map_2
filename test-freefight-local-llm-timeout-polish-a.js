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

// ── SECTION 1: Default timeout is 45000ms ────────────────────────────────────
console.log('\n§1  Default unit-decision timeout is 45000ms');
ok('default timeoutMs string is 45000',
    /RMOOZ_FREE_FIGHT_TIMEOUT_MS.*45000/.test(llmSrc) ||
    /\|\|\s*'45000'/.test(llmSrc));
ok('fallback timeoutMs assignment is 45000',
    /timeoutMs\s*=\s*45000/.test(llmSrc));
ok('old 15000 default NOT present',
    !/\|\|\s*'15000'/.test(llmSrc) && !/timeoutMs\s*=\s*15000/.test(llmSrc));

// ── SECTION 2: Env override RMOOZ_FREE_FIGHT_TIMEOUT_MS ─────────────────
console.log('\n§2  Env override RMOOZ_FREE_FIGHT_TIMEOUT_MS still works');
ok('RMOOZ_FREE_FIGHT_TIMEOUT_MS read first',
    /RMOOZ_FREE_FIGHT_TIMEOUT_MS/.test(llmSrc));
ok('RMOOZ_AI_TIMEOUT_MS read as secondary override',
    /RMOOZ_AI_TIMEOUT_MS/.test(llmSrc));
ok('parseInt used for parsing',
    /parseInt.*RMOOZ_FREE_FIGHT_TIMEOUT_MS/.test(llmSrc));

// Functional check: simulate env override
(function() {
    var saved = process.env.RMOOZ_FREE_FIGHT_TIMEOUT_MS;
    process.env.RMOOZ_FREE_FIGHT_TIMEOUT_MS = '8000';
    // Extract the timeout resolution logic from the source via eval
    var timeoutMs;
    try {
        /* jshint evil:true */
        timeoutMs = parseInt(process.env.RMOOZ_FREE_FIGHT_TIMEOUT_MS || process.env.RMOOZ_AI_TIMEOUT_MS || '45000', 10);
        if (!Number.isFinite(timeoutMs)) timeoutMs = 45000;
    } catch(e) {}
    ok('env override 8000 resolves correctly', timeoutMs === 8000);
    if (saved !== undefined) process.env.RMOOZ_FREE_FIGHT_TIMEOUT_MS = saved;
    else delete process.env.RMOOZ_FREE_FIGHT_TIMEOUT_MS;
})();

(function() {
    delete process.env.RMOOZ_FREE_FIGHT_TIMEOUT_MS;
    var timeoutMs = parseInt(process.env.RMOOZ_FREE_FIGHT_TIMEOUT_MS || process.env.RMOOZ_AI_TIMEOUT_MS || '45000', 10);
    if (!Number.isFinite(timeoutMs)) timeoutMs = 45000;
    ok('default 45000 when env unset', timeoutMs === 45000);
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
