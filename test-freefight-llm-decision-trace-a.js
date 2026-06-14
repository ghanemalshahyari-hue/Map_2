'use strict';
/* ============================================================================
 * test-freefight-llm-decision-trace-a.js — FREEFIGHT-LLM-DECISION-TRACE-A
 * Static + unit checks — no server required.
 * ========================================================================== */

const fs   = require('fs');
const path = require('path');

let PASS = 0, FAIL = 0;
function ok(label, cond, detail) {
    if (cond) { console.log('  PASS  ' + label); PASS++; }
    else       { console.log('  FAIL  ' + label + (detail ? '  (' + detail + ')' : '')); FAIL++; }
}

const llmSrc    = fs.readFileSync(path.join(__dirname, 'UI_MOdified/server/ai/free-fight-llm-decision.js'), 'utf8');
const bridgeSrc = fs.readFileSync(path.join(__dirname, 'UI_MOdified/server/wargame-sim-bridge.js'), 'utf8');
const clientSrc = fs.readFileSync(path.join(__dirname, 'UI_MOdified/client/shell/free-fight-demo.js'), 'utf8');

// ── SECTION 1: LLM success path returns final_decision_source: llm ───────────
console.log('\n§1  LLM success returns final_decision_source: llm');
const BRIDGE = require('./UI_MOdified/server/ai/free-fight-llm-decision.js');
const ENGINE = require('./UI_MOdified/server/ai/free-fight-action-engine.js');

const UNITS = [
    { id: 'R-001', uid: 'R-001', side: 'RED', lat: 24.5, lon: 55.0, platform: 'armor' },
    { id: 'B-001', uid: 'B-001', side: 'BLUE', lat: 24.6, lon: 55.1, platform: 'infantry' },
];
const OBJECTIVES = [{ lat: 24.33, lon: 54.66, name: 'Objective X' }];
const OPTS = { preferSide: 'RED', useLlm: true, allowed_unit_ids: ['R-001', 'B-001'] };

const VALID_LLM_JSON = JSON.stringify({
    action_type: 'MOVE_TOWARD_OBJECTIVE', side: 'RED', unit_uid: 'R-001',
    target: { type: 'objective', lat: 24.33, lon: 54.66 },
    reason: 'Advance.', risk: 'medium', confidence: 'high', source: 'llm',
});

function mockOk(resp) {
    return { generate: function() { return Promise.resolve({ ok: true, response: resp, providerUsed: 'ollama' }); } };
}
function mockFail(errMsg) {
    return { generate: function() { return Promise.resolve({ ok: false, error: errMsg }); } };
}
function mockThrow(msg) {
    return { generate: function() { return Promise.reject(new Error(msg)); } };
}

(async function() {
    // §1 — LLM success
    var savedEnv = process.env.RMOOZ_FREE_FIGHT_LLM;
    process.env.RMOOZ_FREE_FIGHT_LLM = '1';
    var r1 = await BRIDGE.askLlmForAction(UNITS, OBJECTIVES, OPTS, mockOk(VALID_LLM_JSON));
    ok('§1 llm_called = true on success',     r1.llm_called === true);
    ok('§1 llm_status = success',              r1.llm_status === 'success');
    ok('§1 source = llm',                      r1.source === 'llm');
    ok('§1 action not null',                   !!r1.action);
    ok('§1 action.unit_uid = R-001',           r1.action && r1.action.unit_uid === 'R-001');
    ok('§1 llm_validation.ok = true',          r1.llm_validation && r1.llm_validation.ok === true);
    ok('§1 llm_raw_action present',            !!r1.llm_raw_action);
    ok('§1 llm_normalized_action present',     !!r1.llm_normalized_action);
    ok('§1 fallback_reason = null',            r1.fallback_reason === null);

    // ── SECTION 2: LLM timeout returns llm_status: timeout ──────────────────
    console.log('\n§2  LLM timeout returns llm_status: timeout');
    var r2 = await BRIDGE.askLlmForAction(UNITS, OBJECTIVES, OPTS, mockFail('Backend timed out after 45000ms'));
    ok('§2 llm_called = true',                 r2.llm_called === true);
    ok('§2 llm_status = timeout',              r2.llm_status === 'timeout');
    ok('§2 source = deterministic_demo_ai',    r2.source === 'deterministic_demo_ai');
    ok('§2 fallback_reason contains timed out',r2.fallback_reason && /timed.out/i.test(r2.fallback_reason));

    // ── SECTION 3: timeout fallback picks valid deterministic unit ───────────
    console.log('\n§3  Timeout fallback still picks valid deterministic unit');
    ok('§3 action not null (deterministic unit found)', !!r2.action);
    ok('§3 action.unit_uid is one of UNITS ids',
        r2.action && UNITS.some(function(u) { return u.id === r2.action.unit_uid; }));
    ok('§3 local_only = true',                 r2.local_only === true);
    ok('§3 provider_policy = local_only',      r2.provider_policy === 'local_only');

    // ── SECTION 4: invalid_schema path ──────────────────────────────────────
    console.log('\n§4  LLM invalid_schema returns correct trace');
    var r4 = await BRIDGE.askLlmForAction(UNITS, OBJECTIVES, OPTS,
        mockOk(JSON.stringify({ action_type: 'NUKE_CITY', side: 'RED', unit_uid: 'R-001', reason: 'x', risk: 'high', confidence: 'high', source: 'llm' })));
    ok('§4 llm_called = true',                 r4.llm_called === true);
    ok('§4 llm_status = invalid_schema',       r4.llm_status === 'invalid_schema');
    ok('§4 llm_raw_action present',            !!r4.llm_raw_action);
    ok('§4 source = deterministic_demo_ai',    r4.source === 'deterministic_demo_ai');
    ok('§4 action not null (deter fallback)',   !!r4.action);

    // ── SECTION 5: disabled path ─────────────────────────────────────────────
    console.log('\n§5  LLM disabled path');
    var savedEnv5 = process.env.RMOOZ_FREE_FIGHT_LLM;
    delete process.env.RMOOZ_FREE_FIGHT_LLM;
    var r5 = await BRIDGE.askLlmForAction(UNITS, OBJECTIVES, OPTS, mockOk(VALID_LLM_JSON));
    ok('§5 llm_called = false when disabled',  r5.llm_called === false);
    ok('§5 llm_status = disabled',             r5.llm_status === 'disabled');
    ok('§5 local_only = true',                 r5.local_only === true);
    if (savedEnv5 !== undefined) process.env.RMOOZ_FREE_FIGHT_LLM = savedEnv5;
    else delete process.env.RMOOZ_FREE_FIGHT_LLM;

    // ── SECTION 6: default timeout 45000ms ───────────────────────────────────
    console.log('\n§6  Default timeout is 45000ms');
    ok('§6 source has 45000 default',  /45000/.test(llmSrc));
    ok('§6 fallback timeoutMs = 45000',/timeoutMs\s*=\s*45000/.test(llmSrc));

    // ── SECTION 7: local-only policy preserved ───────────────────────────────
    console.log('\n§7  Local-only policy preserved in all paths');
    ok('§7 REMOTE_PROVIDERS_BLOCKED present',  /REMOTE_PROVIDERS_BLOCKED/.test(llmSrc));
    ok('§7 provider_policy: local_only in >= 3 paths',
        (llmSrc.match(/provider_policy.*local_only/g) || []).length >= 3);
    ok('§7 all llm ret() calls have local_only via BASE',
        /BASE.*local_only.*true/.test(llmSrc) || /local_only.*true.*provider_policy.*local_only/.test(llmSrc));

    // ── SECTION 8: bridge carries trace fields to response ───────────────────
    console.log('\n§8  Bridge passes trace fields in response');
    ok('§8 final_decision_source in bridge response',
        /final_decision_source/.test(bridgeSrc));
    ok('§8 llm_called passed from llmResult',
        /llm_called.*llmResult\.llm_called/.test(bridgeSrc) ||
        /llm_called.*llmResult/.test(bridgeSrc));
    ok('§8 llm_status passed from llmResult',
        /llm_status.*llmResult/.test(bridgeSrc));
    ok('§8 llm_validation passed from llmResult',
        /llm_validation.*llmResult/.test(bridgeSrc));
    ok('§8 non-LLM path sets llm_called: false',
        /llm_called.*false/.test(bridgeSrc));

    // ── SECTION 9: UI trace block present in client ───────────────────────────
    console.log('\n§9  UI trace block in free-fight-demo.js');
    ok('§9 Decision Trace block present',
        /Decision Trace/.test(clientSrc));
    ok('§9 LLM called rendered',
        /LLM called/.test(clientSrc));
    ok('§9 LLM result rendered',
        /LLM result/.test(clientSrc));
    ok('§9 Final decision source rendered',
        /Final decision source/.test(clientSrc));
    ok('§9 Fallback decision generated message',
        /Fallback decision generated by RMOOZ/.test(clientSrc));
    ok('§9 Try LLM Again button label present',
        /Try LLM Again/.test(clientSrc));

    // Restore env
    if (savedEnv !== undefined) process.env.RMOOZ_FREE_FIGHT_LLM = savedEnv;
    else delete process.env.RMOOZ_FREE_FIGHT_LLM;

    // ── Summary ──────────────────────────────────────────────────────────────
    console.log('\n' + '─'.repeat(52));
    console.log('PASS: ' + PASS + '  FAIL: ' + FAIL + '  TOTAL: ' + (PASS + FAIL));
    if (FAIL > 0) process.exit(1);
})().catch(function(e) { console.error(e); process.exit(1); });
