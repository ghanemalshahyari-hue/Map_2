#!/usr/bin/env node
'use strict';
/* ============================================================================
 * verify-openrouter-qwen-e2e.js — RMOOZ-OPENROUTER-QWEN35-CLOUD-MODE-A
 * ----------------------------------------------------------------------------
 * OWNER-RUN, REAL-CLOUD acceptance. This makes REAL calls to openrouter.ai and
 * therefore needs YOUR key — it is NOT run in CI / by the agent (no key here).
 *
 * ⚠ CLOUD egress: this sends the filtered candidate units + objective to OpenRouter.
 *
 * Prereqs (local .env or shell — never commit the key):
 *   RMOOZ_ALLOW_SIM_RUN=1
 *   RMOOZ_ALLOW_CLOUD_AI=1
 *   OPENROUTER_API_KEY=<your key>
 *   (optional) RMOOZ_OPENROUTER_MODEL=<the Qwen3.5 slug>  — else auto-detected from the list
 *
 * What it does:
 *   1) verifies the 3 gates + key, lists OpenRouter models, picks the Qwen3.5 slug
 *   2) selects provider=openrouter + that model in the model selector
 *   3) runs the real Free Fight COA planner on a Qatar objective with a big force
 *   4) asserts provider_used=openrouter · model_used=<selected> · plan_source=llm ·
 *      llm_status=ok · candidates 10–25 · no deterministic fallback
 *
 * Run:  cd UI_MOdified && node scripts/verify-openrouter-qwen-e2e.js
 * Exit 0 = PASS; non-zero = a precondition failed or the plan was not a real LLM plan.
 * ========================================================================== */
const path = require('path');
const SRV = path.join(__dirname, '..', 'server', 'ai');
const LLM = require(path.join(SRV, 'llm-runtime-config.js'));
const OR  = require(path.join(SRV, 'openrouter-client.js'));
const MS  = require(path.join(SRV, 'model-selection.js'));
const COA = require(path.join(SRV, 'free-fight-coa-planner.js'));

function die(msg) { console.error('\n✗ ' + msg + '\n'); process.exit(1); }
function ok(label, cond, detail) {
    if (cond) { console.log('  ✓ ' + label); return true; }
    console.log('  ✗ ' + label + (detail ? '  (' + detail + ')' : '')); FAILED = true; return false;
}
let FAILED = false;

(async function () {
    console.log('\n═══ OpenRouter Qwen3.5 cloud-mode E2E (REAL cloud) ═══\n');

    // 1) Preconditions ────────────────────────────────────────────────────────
    if (process.env.RMOOZ_ALLOW_SIM_RUN !== '1') die('RMOOZ_ALLOW_SIM_RUN=1 is required.');
    if (process.env.RMOOZ_ALLOW_CLOUD_AI !== '1') die('RMOOZ_ALLOW_CLOUD_AI=1 is required (cloud gate).');
    if (!OR.isConfigured()) die('OPENROUTER_API_KEY is not set (put it in local .env / shell — never commit it).');
    if (!LLM.openrouterReady()) die('openrouterReady() is false — check RMOOZ_ALLOW_CLOUD_AI=1 + OPENROUTER_API_KEY.');
    console.log('[1] gates OK: RMOOZ_ALLOW_SIM_RUN=1, RMOOZ_ALLOW_CLOUD_AI=1, OPENROUTER_API_KEY set (masked).');

    // List models + pick the Qwen3.5 slug ──────────────────────────────────────
    console.log('[2] listing OpenRouter models…');
    const models = await OR.listModels();
    if (!models.length) die('OpenRouter returned no models (auth/network?).');
    console.log('    ' + models.length + ' models available.');
    let slug = (process.env.RMOOZ_OPENROUTER_MODEL || '').trim();
    if (!slug) {
        slug = models.find(function (m) { return /qwen3\.?5/i.test(m) && /(397b|a17b)/i.test(m); })
            || models.find(function (m) { return /qwen3\.?5/i.test(m); })
            || '';
    }
    if (!slug) die('Could not find a Qwen3.5 slug in the OpenRouter list — set RMOOZ_OPENROUTER_MODEL to the exact id.');
    if (models.indexOf(slug) === -1) console.log('    ⚠ "' + slug + '" not in the catalog list (will still attempt).');
    console.log('    selected slug: ' + slug);

    // 2) Select provider=openrouter + the model ─────────────────────────────────
    const sel = MS.setSelectedModel(slug, 'openrouter');
    if (!sel.ok) die('model selection failed: ' + sel.error);
    console.log('[3] selected provider=openrouter, model=' + MS.getSelectedModel());

    // 3) Run the real Free Fight planner on a Qatar objective + big force ────────
    process.env.RMOOZ_LLM_PROVIDER = 'openrouter';   // make the planner resolve openrouter
    const force = [];
    for (let i = 0; i < 60; i++) force.push({ id: 'R-' + i, side: 'RED', country: 'Qatar', lat: 25.30 + (i % 10) * 0.03, lon: 51.20 + Math.floor(i / 10) * 0.03, platform: i % 3 === 0 ? 'fighter jet' : i % 3 === 1 ? 'frigate' : 'armor' });
    for (let i = 0; i < 200; i++) force.push({ id: 'R-far-' + i, side: 'RED', country: 'Iran', lat: 27.5 + (i % 10) * 0.1, lon: 54.0 + Math.floor(i / 10) * 0.1, platform: 'armor' });
    force.push({ id: 'B-1', side: 'BLUE', country: 'Bahrain', lat: 25.55, lon: 51.42, platform: 'SAM battery' });
    const obj = [{ lat: 25.30, lon: 51.20, name: 'Objective X (Qatar)' }];

    console.log('[4] running planCoas via OpenRouter (real cloud call — may take 10–60s)…');
    const t0 = Date.now();
    const r = await COA.planCoas(force, obj, {}, { planning_mode: 'commander', ai_depth: 'normal', useLlm: true, preferSide: 'RED', commander_mode: 'free', capture_raw_llm: true });
    console.log('    done in ' + (Date.now() - t0) + 'ms\n');

    // 4) Assertions ─────────────────────────────────────────────────────────────
    const cand = r && r.planning_trace && r.planning_trace.input_understood && r.planning_trace.input_understood.candidates;
    ok('plan_source === "llm" (no deterministic fallback)', r.plan_source === 'llm', 'got ' + r.plan_source + (r.fallback_reason ? ' / ' + r.fallback_reason : ''));
    ok('provider_used === "openrouter"', r.provider_used === 'openrouter', 'got ' + r.provider_used);
    ok('model_used === selected Qwen3.5 slug', r.model_used === slug, 'got ' + r.model_used);
    ok('llm_status === "ok"', String(r.llm_status) === 'ok', 'got ' + r.llm_status);
    ok('no fallback_reason', !r.fallback_reason, r.fallback_reason || '');
    ok('candidate pre-filter applied', !!(cand && cand.applied), '');
    ok('candidates sent 10–25 (filtered, not the full force)', !!(cand && cand.sent >= 10 && cand.sent <= 25), cand ? (cand.sent + '/' + cand.total) : 'no candidates');
    ok('≥1 COA produced', Array.isArray(r.coas) && r.coas.length >= 1, (r.coas || []).length + ' coas');

    console.log('\n' + (FAILED ? '❌ FAIL — see ✗ above' : '✅ PASS — OpenRouter Qwen3.5 cloud mode verified end-to-end') + '\n');
    process.exit(FAILED ? 1 : 0);
})().catch(function (e) { console.error('\nFATAL', e && e.stack || e); process.exit(1); });
