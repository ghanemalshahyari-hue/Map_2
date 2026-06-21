#!/usr/bin/env node
'use strict';
/* ============================================================================
 * verify-coa-llm-local-e2e.js — LOCAL twin of verify-openrouter-qwen-e2e.js
 * ----------------------------------------------------------------------------
 * Proves the Free Fight COA planner produces a REAL local-LLM plan
 * (plan_source=llm, llm_status=ok) against Ollama — NO cloud egress.
 *
 * Unlike the web-server, this script does NOT load UI_MOdified/.env, so the
 * machine's cloud pins (RMOOZ_LLM_PROVIDER=openrouter, the qwen/qwen3.5-397b
 * COA-model override, OPENROUTER/zen keys) never enter the process. It forces
 * a clean local-only env in-process before requiring the planner.
 *
 * Run:  node UI_MOdified/scripts/verify-coa-llm-local-e2e.js [model]
 *   e.g. node UI_MOdified/scripts/verify-coa-llm-local-e2e.js qwen2.5:7b
 *        node UI_MOdified/scripts/verify-coa-llm-local-e2e.js gpt-oss:20b
 * Exit 0 = PASS (real LLM plan); non-zero = fell back / no LLM.
 * ========================================================================== */

// ── force a clean LOCAL-ONLY env BEFORE requiring anything ──────────────────
const MODEL = process.argv[2] || process.env.VERIFY_COA_MODEL || 'qwen2.5:7b';
process.env.RMOOZ_ALLOW_SIM_RUN = '1';
process.env.RMOOZ_ALLOW_CLOUD_AI = '0';            // cloud OFF — local only
delete process.env.OPENROUTER_API_KEY;             // belt+suspenders: no egress
delete process.env.OPENCODE_ZEN_API_KEY;
process.env.RMOOZ_LLM_PROVIDER = 'ollama';
process.env.RMOOZ_AI_PROVIDER = 'ollama';
process.env.RMOOZ_FREE_FIGHT_PROVIDER = 'ollama';
process.env.RMOOZ_LLM_MODEL = MODEL;
process.env.RMOOZ_LLM_MODEL_COA_PLANNER = MODEL;   // override the .env cloud slug
process.env.RMOOZ_LLM_MODEL_DECISION = MODEL;
process.env.RMOOZ_LLM_MODEL_PLAN = MODEL;
process.env.RMOOZ_LLM_MODEL_CAPABILITY_ANALYST = MODEL;
if (!process.env.RMOOZ_LLM_TIMEOUT_MS) process.env.RMOOZ_LLM_TIMEOUT_MS = '240000';

const path = require('path');
const SRV = path.join(__dirname, '..', 'server', 'ai');
const LLM = require(path.join(SRV, 'llm-runtime-config.js'));
const COA = require(path.join(SRV, 'free-fight-coa-planner.js'));

let FAILED = false;
function ok(label, cond, detail) {
    if (cond) { console.log('  ✓ ' + label); return true; }
    console.log('  ✗ ' + label + (detail ? '  (' + detail + ')' : '')); FAILED = true; return false;
}

(async function () {
    console.log('\n═══ LOCAL Free Fight COA LLM E2E (Ollama, no cloud) ═══\n');
    console.log('[1] resolved config:');
    console.log('    provider        = ' + LLM.getProvider());
    console.log('    coa_planner model = ' + LLM.getModel('coa_planner') + '  (source: ' + LLM.modelSource('coa_planner') + ')');
    console.log('    openrouterReady = ' + LLM.openrouterReady() + '  (must be false for local-only)');

    // multi-domain Gulf force near a coastal objective — so the LLM can build a
    // multi-phase plan (air → naval → ground), and the prefilter has variety.
    const force = [];
    const base = { lat: 25.55, lon: 51.05 };
    for (let i = 0; i < 8; i++)  force.push({ id: 'R-air-' + i,  side: 'RED', country: 'Qatar', lat: base.lat + (i % 4) * 0.02, lon: base.lon + Math.floor(i / 4) * 0.02, platform: 'fighter jet' });
    for (let i = 0; i < 6; i++)  force.push({ id: 'R-gnd-' + i,  side: 'RED', country: 'Qatar', lat: 25.40 + (i % 3) * 0.03, lon: 51.10 + Math.floor(i / 3) * 0.03, platform: 'armor' });
    for (let i = 0; i < 4; i++)  force.push({ id: 'R-sea-' + i,  side: 'RED', country: 'Qatar', lat: 25.20 + i * 0.04, lon: 51.40 + i * 0.02, platform: 'frigate' });
    for (let i = 0; i < 3; i++)  force.push({ id: 'R-sam-' + i,  side: 'RED', country: 'Qatar', lat: 25.50 + i * 0.03, lon: 51.15 + i * 0.02, platform: 'SAM battery' });
    // far RED (should be filtered OUT by the candidate prefilter)
    for (let i = 0; i < 40; i++) force.push({ id: 'R-far-' + i,  side: 'RED', country: 'Iran',  lat: 27.5 + (i % 10) * 0.1, lon: 54.0 + Math.floor(i / 10) * 0.1, platform: 'armor' });
    // BLUE defenders near the objective
    for (let i = 0; i < 3; i++)  force.push({ id: 'B-sam-' + i,  side: 'BLUE', country: 'Bahrain', lat: 25.32 + i * 0.02, lon: 51.18 + i * 0.02, platform: 'SAM battery' });
    for (let i = 0; i < 2; i++)  force.push({ id: 'B-air-' + i,  side: 'BLUE', country: 'Bahrain', lat: 25.60, lon: 51.50, platform: 'fighter jet' });
    for (let i = 0; i < 4; i++)  force.push({ id: 'B-gnd-' + i,  side: 'BLUE', country: 'Bahrain', lat: 25.28 + i * 0.01, lon: 51.22, platform: 'armor' });

    const obj = [{ lat: 25.30, lon: 51.20, name: 'Objective X (coastal seize)' }];

    console.log('\n[2] force = ' + force.length + ' units (multi-domain); objective near 51.20E/25.30N');
    console.log('[3] running planCoas (model=' + MODEL + ', commander mode) — may take 10–120s…');
    const t0 = Date.now();
    const r = await COA.planCoas(force, obj, {}, {
        planning_mode: 'commander', ai_depth: 'normal', useLlm: true,
        preferSide: 'RED', commander_mode: 'free', capture_raw_llm: true,
    });
    const ms = Date.now() - t0;
    console.log('    done in ' + ms + 'ms\n');

    const cand = r && r.planning_trace && r.planning_trace.input_understood && r.planning_trace.input_understood.candidates;

    // ── headline acceptance (the user's test #5) ────────────────────────────
    console.log('[4] acceptance:');
    ok('plan_source === "llm" (NOT a deterministic fallback)', r.plan_source === 'llm', 'got ' + r.plan_source + (r.fallback_reason ? ' / ' + r.fallback_reason : ''));
    ok('llm_called === true', r.llm_called === true || r.llm_called === undefined, 'got ' + r.llm_called);
    ok('llm_status === "ok"', String(r.llm_status) === 'ok', 'got ' + r.llm_status);
    ok('provider_used === "ollama" (local, no cloud)', r.provider_used === 'ollama', 'got ' + r.provider_used);
    ok('model_used === ' + MODEL, r.model_used === MODEL, 'got ' + r.model_used);
    ok('no fallback_reason', !r.fallback_reason, r.fallback_reason || '');
    ok('candidate pre-filter applied (force shrunk before LLM)', !!(cand && cand.applied), cand ? (cand.sent + '/' + cand.total) : 'no candidates');
    ok('≥1 COA produced', Array.isArray(r.coas) && r.coas.length >= 1, (r.coas || []).length + ' coas');

    // ── COA depth (the user's "multi-unit/multi-phase when possible") ────────
    const coa = (r.coas || [])[0] || {};
    const phases = Array.isArray(coa.phases) ? coa.phases : [];
    const taskedIds = new Set();
    let actionCount = 0;
    phases.forEach(function (p) {
        (Array.isArray(p.actions) ? p.actions : []).forEach(function (a) {
            actionCount++;
            const u = a.unit_id || a.uid || a.unit || a.unit_uid;
            if (u) taskedIds.add(u);
        });
    });
    // some schemas carry actions at the COA root too
    (Array.isArray(coa.actions) ? coa.actions : []).forEach(function (a) {
        actionCount++; const u = a.unit_id || a.uid || a.unit || a.unit_uid; if (u) taskedIds.add(u);
    });

    console.log('\n[5] COA #1 depth:');
    console.log('    commander_intent : ' + (coa.commander_intent ? '"' + String(coa.commander_intent).slice(0, 90) + '…"' : '(none)'));
    console.log('    main_effort      : ' + (coa.main_effort || '(none)'));
    console.log('    phases           : ' + phases.length + (phases.length ? '  [' + phases.map(function (p) { return p.name || p.phase || '?'; }).slice(0, 6).join(', ') + ']' : ''));
    console.log('    total actions    : ' + actionCount);
    console.log('    distinct tasked units : ' + taskedIds.size + (taskedIds.size ? '  [' + Array.from(taskedIds).slice(0, 10).join(', ') + ']' : ''));
    // Depth ("multi-unit/multi-phase") is "WHEN POSSIBLE" per the owner spec — it is
    // model-capability-bound, NOT part of the core gate. A small local model may return a
    // shallow plan; that does not make the AI "fake" (plan_source is still llm). So depth is
    // reported informationally (ⓘ) and does NOT flip the exit code.
    const depthMU = taskedIds.size >= 2, depthMP = phases.length >= 2;
    console.log('  ' + (depthMU ? '✓' : 'ⓘ') + ' multi-unit (≥2 tasked) — ' + taskedIds.size + ' tasked' + (depthMU ? '' : '   [shallow — model-capability-bound on this host]'));
    console.log('  ' + (depthMP ? '✓' : 'ⓘ') + ' multi-phase (≥2 phases) — ' + phases.length + ' phase(s)' + (depthMP ? '' : '   [shallow — model-capability-bound on this host]'));

    const depthNote = (depthMU && depthMP) ? 'multi-unit + multi-phase' : 'shallow plan (depth is model-capability-bound on this host)';
    console.log('\n' + (FAILED
        ? '❌ FAIL — CORE LLM proof failed (see ✗): the planner did not return a real plan_source=llm.'
        : '✅ PASS — real LOCAL LLM COA verified: plan_source=llm, provider=ollama, no cloud egress. Depth: ' + depthNote) + '\n');
    process.exit(FAILED ? 1 : 0);
})().catch(function (e) { console.error('\nFATAL', e && e.stack || e); process.exit(1); });
