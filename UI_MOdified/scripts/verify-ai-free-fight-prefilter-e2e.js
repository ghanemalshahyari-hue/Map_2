'use strict';
/* ============================================================================
 * verify-ai-free-fight-prefilter-e2e.js — RMOOZ-AI-FREE-FIGHT-CANDIDATE-PREFILTER-A
 * ----------------------------------------------------------------------------
 * REAL-LLM acceptance for the candidate pre-filter, with a Qatar objective and a
 * FULL scenario of hundreds of units. Spawns the real server (RMOOZ_ALLOW_SIM_RUN=1
 * + a local model) and POSTs the big force to /api/wargame-sim/free-fight/plan-coas.
 *
 * Acceptance:
 *   - full pool is hundreds of units
 *   - the AI prompt includes only 10–25 candidates (candidate_prefilter)
 *   - plan_source === 'llm' · llm_status === 'ok' · model_used === selected model
 *   - the plan moves ONLY candidate (near/relevant) units — no excluded far unit,
 *     no all-country mass movement
 *
 * Defaults to qwen2.5:3b (fast; the repair loop fixes its JSON). Set
 * RMOOZ_VERIFY_BASE_URL to use an already-running server. Real LLM required —
 * mocks/deterministic do not satisfy this.
 * ========================================================================== */
var path = require('path');
var cp = require('child_process');

var REPO = path.resolve(__dirname, '..');
var EXTERNAL = process.env.RMOOZ_VERIFY_BASE_URL || null;
var PORT = process.env.RMOOZ_VERIFY_PORT || '8104';
var BASE = EXTERNAL || ('http://localhost:' + PORT);
var MODEL = process.env.RMOOZ_FREE_FIGHT_MODEL || 'qwen2.5:3b';
var TIMEOUT_MS = parseInt(process.env.RMOOZ_FREE_FIGHT_TIMEOUT_MS || '150000', 10);

var fails = [];
function need(c, m) { if (c) { console.log('  ✓ ' + m); } else { fails.push(m); console.log('  ✗ ' + m); } }
function info(k, v) { console.log('    · ' + k + ': ' + v); }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
async function httpJson(url, opts) { var res = await fetch(url, opts); var t = await res.text(); var j = null; try { j = JSON.parse(t); } catch (_) {} return { status: res.status, ok: res.ok, json: j, text: t }; }

// ── the Qatar scenario: 25 RED near the objective + 320 RED far + BLUE near ──
function qatarForce() {
    var u = [];
    for (var i = 0; i < 25; i++) u.push({ id: 'NEAR-' + i, side: 'RED', country: 'Qatar', platform: i % 3 === 0 ? 'fighter jet' : (i % 3 === 1 ? 'frigate' : 'armor'), lat: 25.28 + (i % 6) * 0.03, lon: 51.20 + Math.floor(i / 6) * 0.03 });
    for (var j = 0; j < 320; j++) u.push({ id: 'FAR-' + j, side: 'RED', country: 'FarTheater', platform: 'tank', lat: 17 + (j % 18) * 0.45, lon: 39 + (j % 26) * 0.45 });
    for (var k = 0; k < 10; k++) u.push({ id: 'BLU-' + k, side: 'BLUE', country: 'Bahrain', platform: 'SAM battery', lat: 25.6 + k * 0.04, lon: 51.4 + k * 0.04 });
    return u;
}

var serverProc = null;
async function waitForServer(url, ms) { var t0 = Date.now(); while (Date.now() - t0 < ms) { try { var r = await fetch(url); if (r.ok || r.status === 200) return true; } catch (_) {} await sleep(500); } return false; }
async function startServer() {
    if (EXTERNAL) { console.log('Using external server: ' + BASE); return; }
    console.log('Starting RMOOZ server on :' + PORT + ' (ollama/' + MODEL + ', RMOOZ_ALLOW_SIM_RUN=1)…');
    serverProc = cp.spawn('node', ['server/web-server.js'], { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'],
        env: Object.assign({}, process.env, { PORT: PORT, RMOOZ_ALLOW_SIM_RUN: '1', RMOOZ_FREE_FIGHT_PROVIDER: 'ollama', RMOOZ_FREE_FIGHT_MODEL: MODEL, RMOOZ_FREE_FIGHT_TIMEOUT_MS: String(TIMEOUT_MS), RMOOZ_FREE_FIGHT_ATTEMPTS: '1' }) });
    serverProc.stdout.on('data', function (d) { var s = String(d); if (/\[free-fight\//.test(s)) process.stdout.write('  [server] ' + s); });
    serverProc.stderr.on('data', function () {});
    if (!await waitForServer(BASE + '/api/ai/models', 15000)) throw new Error('server did not come up on ' + BASE);
}
function stopServer() { if (serverProc) { try { serverProc.kill('SIGTERM'); } catch (_) {} serverProc = null; } }

async function main() {
    await startServer();

    console.log('\n[1] Select the model + confirm it is installed');
    var sel = await httpJson(BASE + '/api/ai/model/select', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: MODEL }) });
    need(sel.json && sel.json.ok, 'POST /api/ai/model/select ok');
    need(sel.json && sel.json.model_available === true, 'selected model "' + MODEL + '" is installed');
    if (fails.length) return finish();

    console.log('\n[2] POST the FULL force (hundreds of units) + Qatar objective to plan-coas…');
    var force = qatarForce();
    info('total units posted', force.length);
    var body = { units: force, objectives: [{ lat: 25.30, lon: 51.20, name: 'Objective X (Qatar)' }],
        context: { commander_mode: 'free', ai_depth: 'normal' },
        opts: { preferSide: 'RED', useLlm: true, ai_depth: 'normal', commander_mode: 'free' } };
    var t0 = Date.now();
    var r = await httpJson(BASE + '/api/wargame-sim/free-fight/plan-coas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    info('elapsed', Math.round((Date.now() - t0) / 1000) + 's');
    var plan = r.json || {};

    console.log('\n[3] Acceptance — small candidate set, real LLM, only candidate units');
    var cp2 = plan.candidate_prefilter || {};
    need(cp2.applied === true, 'candidate pre-filter applied on the large force');
    need(cp2.total >= 200, 'full pool is hundreds of units (total=' + cp2.total + ')');
    need(cp2.sent >= 10 && cp2.sent <= 25, 'AI prompt includes only 10–25 candidates (sent=' + cp2.sent + ')');
    info('candidates sent / total / excluded', cp2.sent + ' / ' + cp2.total + ' / ' + cp2.excluded);
    info('top exclusions', (cp2.non_candidate_summary || []).slice(0, 3).map(function (x) { return x.count + ' ' + x.reason; }).join(' | '));
    need(plan.plan_source === 'llm', 'plan_source === "llm" (got ' + plan.plan_source + ')');
    need(plan.llm_status === 'ok', 'llm_status === "ok" (got ' + plan.llm_status + ')');
    need(plan.model_used === MODEL, 'model_used === the selected model (' + plan.model_used + ')');
    info('repaired', plan.repaired + ' (' + (plan.repair_attempts || 0) + ' attempts)');

    // Only candidate (near/relevant) units in the plan — no excluded far unit, no mass movement.
    var candSet = {}; (cp2.candidate_ids || []).forEach(function (id) { candSet[id] = true; });
    var actionUnits = [];
    (plan.coas || []).forEach(function (c) { (c.phases || []).forEach(function (ph) { (ph.actions || []).forEach(function (a) { if (a && a.unit_uid) actionUnits.push(String(a.unit_uid)); }); }); });
    var farMoved = actionUnits.filter(function (id) { return /^FAR-/.test(id); });
    var nonCand = actionUnits.filter(function (id) { return !candSet[id]; });
    need(farMoved.length === 0, 'no excluded FAR unit appears in the plan (got ' + farMoved.length + ')');
    need(nonCand.length === 0, 'every unit in the plan is a candidate (non-candidates: ' + nonCand.length + ')');
    need(actionUnits.length > 0 && actionUnits.length <= cp2.sent, 'plan moves a SMALL force package, not all-country mass movement (' + actionUnits.length + ' actions)');
    info('units in plan', actionUnits.slice(0, 12).join(', '));

    finish();
}

function finish() {
    stopServer();
    if (fails.length === 0) {
        console.log('\n✅ PREFILTER E2E PASSED — hundreds of units, only 10–25 sent to the AI, LLM plan used only candidates.');
        process.exit(0);
    }
    console.log('\n❌ PREFILTER E2E FAILED (' + fails.length + '):');
    fails.forEach(function (m) { console.log('   - ' + m); });
    console.log('\nNeeds a REAL local LLM (RMOOZ_ALLOW_SIM_RUN=1 + a loaded model). The pre-filter itself is\nproven without an LLM by scripts/test-free-fight-candidate-prefilter-a.js; this adds the live model.');
    process.exit(1);
}
main().catch(function (e) { console.error('FATAL', e && e.stack || e); stopServer(); process.exit(1); });
