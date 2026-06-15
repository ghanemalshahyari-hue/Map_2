'use strict';
/* ============================================================================
 * verify-ai-free-fight-real-llm-e2e.js — RMOOZ-AI-FREE-FIGHT-REAL-AI-TEST-A
 * ----------------------------------------------------------------------------
 * REAL acceptance for the "AI Commander Free Fight — القتال الحر بقيادة الذكاء
 * الاصطناعي" card. This is NOT a unit test and does NOT accept mocks, the
 * deterministic planner, the fast planner, or the loop-mechanics test bypass.
 * It proves the actual configured LOCAL LLM produced the plan and the REAL app
 * loop used that LLM response to move units.
 *
 * What it does:
 *   1. Starts the real RMOOZ web server with RMOOZ_ALLOW_SIM_RUN=1 + a real
 *      local provider/model (ollama / qwen3-coder by default), on its own port.
 *      (Set RMOOZ_VERIFY_BASE_URL to use an already-running server instead.)
 *   2. Verifies preconditions against the live server route health AND the live
 *      provider (ollama /api/tags): LLM enabled, provider+model present/loaded.
 *   3. Loads the REAL client module (free-fight-demo.js), points its fetch at the
 *      live server, keeps the AI-only gate ON (no bypass), enables the LLM toggle
 *      + Normal depth + capture_raw_llm, sets a scenario + objective, and presses
 *      Start (the real loop → real fetch → real server → real local LLM).
 *   4. Captures: raw LLM response, MCP prompt, plan_source, llm_called, llm_status,
 *      provider_used, model_used, selected COA, selected units, non_selected_units,
 *      action_type, target, final marker position, and the EXECUTED event-log line.
 *
 * FAILS (non-zero exit) if: RMOOZ_ALLOW_SIM_RUN not enabled · provider/model
 * missing/unreachable · plan_source !== 'llm' · llm_status !== 'ok' · llm_called
 * !== true · fallback_reason present · no raw LLM response captured · the
 * deterministic planner moved units · no unit moved · no EXECUTED line.
 * ========================================================================== */

var path = require('path');
var http = require('http');
var cp = require('child_process');

var REPO = path.resolve(__dirname, '..');                 // UI_MOdified
var EXTERNAL = process.env.RMOOZ_VERIFY_BASE_URL || null;
var PORT = process.env.RMOOZ_VERIFY_PORT || '8099';
var BASE = EXTERNAL || ('http://localhost:' + PORT);
var PROVIDER = (process.env.RMOOZ_FREE_FIGHT_PROVIDER || 'ollama').toLowerCase();
// RMOOZ-AI-FREE-FIGHT-MODEL-SOT-A: default matches ai-config.js committed default (single source).
var MODEL = process.env.RMOOZ_FREE_FIGHT_MODEL || 'qwen2.5:7b';
var OLLAMA = (process.env.OLLAMA_HOST || 'http://localhost:11434').replace(/\/$/, '');
var LLM_TIMEOUT_MS = parseInt(process.env.RMOOZ_FREE_FIGHT_TIMEOUT_MS || '180000', 10);
var ATTEMPTS = parseInt(process.env.RMOOZ_VERIFY_ATTEMPTS || '3', 10); // real LLMs are flaky on strict JSON

var fails = [];
function need(cond, msg) { if (cond) { console.log('  ✓ ' + msg); } else { fails.push(msg); console.log('  ✗ ' + msg); } }
function info(k, v) { console.log('    · ' + k + ': ' + v); }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

async function httpJson(url, opts) {
    var res = await fetch(url, opts);
    var text = await res.text();
    var json = null; try { json = JSON.parse(text); } catch (_) {}
    return { status: res.status, ok: res.ok, json: json, text: text };
}

// ── server lifecycle ──
var serverProc = null;
async function waitForServer(url, ms) {
    var t0 = Date.now();
    while (Date.now() - t0 < ms) {
        try { var r = await fetch(url); if (r.ok || r.status === 200) return true; } catch (_) {}
        await sleep(500);
    }
    return false;
}
async function startServer() {
    if (EXTERNAL) { console.log('Using external server: ' + BASE); return; }
    console.log('Starting RMOOZ server on :' + PORT + ' with RMOOZ_ALLOW_SIM_RUN=1 (' + PROVIDER + '/' + MODEL + ')…');
    serverProc = cp.spawn('node', ['server/web-server.js'], {
        cwd: REPO,
        env: Object.assign({}, process.env, {
            PORT: PORT,
            RMOOZ_ALLOW_SIM_RUN: '1',
            RMOOZ_FREE_FIGHT_PROVIDER: PROVIDER,
            RMOOZ_FREE_FIGHT_MODEL: MODEL,
            RMOOZ_FREE_FIGHT_TIMEOUT_MS: String(LLM_TIMEOUT_MS),
        }),
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    serverProc.stdout.on('data', function (d) { var s = String(d); if (/\[free-fight\//.test(s)) process.stdout.write('  [server] ' + s); });
    serverProc.stderr.on('data', function () {});
    var up = await waitForServer(BASE + '/api/wargame-sim/free-fight/plan-coas/health', 15000);
    if (!up) throw new Error('server did not come up on ' + BASE);
}
function stopServer() { if (serverProc) { try { serverProc.kill('SIGTERM'); } catch (_) {} serverProc = null; } }

// ── client driver (the REAL app loop, in Node, against the REAL server) ──
var _eventLog = [];
function mountClientHarness() {
    var elById = {};
    function makeEl(t) {
        var el = { tagName: t, id: '', className: '', innerHTML: '', textContent: '', children: [], attrs: {}, style: {},
            appendChild: function (e) { this.children.push(e); if (e && e.id) elById[e.id] = e; return e; },
            removeChild: function (e) { var i = this.children.indexOf(e); if (i >= 0) this.children.splice(i, 1); return e; },
            setAttribute: function () {}, removeAttribute: function () {}, addEventListener: function () {},
            querySelector: function () { return null; }, querySelectorAll: function () { return []; }, getAttribute: function () { return null; } };
        Object.defineProperty(el, 'parentNode', { value: null, writable: true });
        return el;
    }
    var bodyEl = makeEl('body');
    global.document = { body: bodyEl, head: makeEl('head'), createElement: makeEl, getElementById: function (id) { return elById[id] || null; }, querySelector: function () { return null; } };
    global.window = {
        document: global.document,
        AppShellEventLog: { append: function (o) { _eventLog.push(o && o.message != null ? o.message : ''); } },
        sessionStorage: (function () { var d = {}; return { getItem: function (k) { return d[k] || null; }, setItem: function (k, v) { d[k] = String(v); }, removeItem: function (k) { delete d[k]; } }; })(),
        // No map (mapReady() false) → _applyCoaAnimated takes the INSTANT path: real move + EXECUTED log, no timers.
        setTimeout: function () { return 0; }, clearTimeout: function () {}, setInterval: function () { return 0; }, clearInterval: function () {},
        // point the client's fetch at the REAL server (relative → absolute).
        fetch: function (u, o) { return fetch(BASE + u, o); },
    };
    global.window.window = global.window;
    var CLIENT = path.join(REPO, 'client', 'shell');
    require(path.join(CLIENT, 'world-state-db.js'));
    require(path.join(CLIENT, 'symbol-db.js'));
    require(path.join(CLIENT, 'symbol-registry.js'));
    require(path.join(CLIENT, 'free-fight-demo.js'));
    return global.window.RmoozFreeFightDemo;
}

function scenario() {
    function mk(n, side, lat0, lon0) { var u = []; for (var i = 0; i < n; i++) { var lat = lat0 + i * 0.03, lon = lon0 + i * 0.03; u.push({ id: side[0] + '-' + (i + 1), side: side, country: 'UAE', lat: lat, lon: lon, coord: [lon, lat] }); } return u; }
    return { red_units: mk(4, 'RED', 24.75, 54.85), blue_units_initial: mk(3, 'BLUE', 24.40, 54.40), obj: { name: 'Objective X', coord: [54.35, 24.45] } };
}

async function driveOneRealTurn(DEMO) {
    _eventLog.length = 0;
    global.window.RmoozScenario = { scenario: scenario() };
    DEMO._resetWinStateForTest();
    DEMO.clear();
    DEMO.mount({ brief: { operational_brief: { proposed_units: [], objectives: [{ label: 'Objective X', lat: 24.45, lon: 54.35 }] } } });
    DEMO._setAiOnlyGateForTest(true);                 // REAL gate — NO bypass
    DEMO._setCommanderModeForTest('high_variation');
    DEMO._setUseLlmForTest(true);
    DEMO._setAiDepthForTest('normal');                // NOT fast
    DEMO._setCaptureRawLlmForTest(true);
    var snapBefore = global.window.RmoozScenario.scenario.red_units.map(function (u) { return u.lat + ',' + u.lon; }).join('|');

    DEMO._startLoopForTest();                          // press Start → real loop → real fetch → real LLM
    var t0 = Date.now();
    while (Date.now() - t0 < LLM_TIMEOUT_MS + 10000) {
        var p = DEMO._getLastLoopPlanForTest();
        if (p) break;
        await sleep(1000);
    }
    try { DEMO._pauseLoopForTest && DEMO._pauseLoopForTest(); } catch (_) {}
    var snapAfter = global.window.RmoozScenario.scenario.red_units.map(function (u) { return u.lat + ',' + u.lon; }).join('|');
    return { plan: DEMO._getLastLoopPlanForTest(), moved: DEMO._getCoaMovedUnitsForTest(), movedScenario: snapAfter !== snapBefore, eventLog: _eventLog.slice() };
}

async function main() {
    await startServer();

    // ── preconditions (hard fail) ──
    console.log('\n[1] Preconditions — real local LLM must be configured + reachable');
    var health = await httpJson(BASE + '/api/wargame-sim/free-fight/plan-coas/health', { method: 'GET' });
    need(health.json && health.json.ok, 'planner route health reachable');
    var hh = health.json || {};
    need(hh.allow_sim_run === true, 'RMOOZ_ALLOW_SIM_RUN is enabled on the server (allow_sim_run=true)');
    need(hh.ai_execution_enabled === true, 'AI execution is enabled (ai_execution_enabled=true)');
    need(!!hh.provider && hh.provider_blocked !== true, 'a non-blocked local provider is configured');
    need(!!hh.model, 'a local model is configured');
    need(hh.model_available === true, 'the local model is available (route health model_available=true)');
    info('allow_sim_run / ai_execution_enabled', hh.allow_sim_run + ' / ' + hh.ai_execution_enabled);
    info('provider', hh.provider); info('model', hh.model); info('model_available', hh.model_available);
    if (hh.reason_if_blocked) info('reason_if_blocked', hh.reason_if_blocked);
    // the provider itself must be reachable with the model loaded
    var tags = null;
    try { tags = await httpJson(OLLAMA + '/api/tags', { method: 'GET' }); } catch (_) {}
    if (PROVIDER === 'ollama') {
        var models = (tags && tags.json && Array.isArray(tags.json.models)) ? tags.json.models.map(function (m) { return m.name || m.model; }) : null;
        need(!!models, 'local provider (ollama) is reachable at ' + OLLAMA);
        need(models && models.indexOf(MODEL) !== -1, 'model "' + MODEL + '" is present in the local provider');
        if (models) info('models', models.join(', '));
    }
    if (fails.length) return finish(); // do not even attempt without a real LLM

    // ── drive the REAL app loop against the REAL server + LLM ──
    console.log('\n[2] Driving the REAL AI Commander Free Fight loop (gate ON, no bypass) — calling the local LLM…');
    var DEMO = mountClientHarness();
    // Configure the REAL card the way an operator would (LLM toggle on, Normal depth) BEFORE the
    // pre-gate check. AI-only gate stays ON (no bypass). capture_raw_llm asks the server for the raw output.
    DEMO._setAiOnlyGateForTest(true);
    DEMO._setUseLlmForTest(true);
    DEMO._setAiDepthForTest('normal');
    DEMO._setCommanderModeForTest('high_variation');
    DEMO._setCaptureRawLlmForTest(true);
    DEMO._setRouteHealthForTest(hh); // real route health → the AI-ready pre-gate uses the real signals
    var ready = DEMO._freeFightAiReadyForTest();
    need(ready.ok === true, 'AI Free Fight pre-gate is satisfied (LLM on, Normal depth, provider/model)');
    if (!ready.ok) { info('reason', ready.reason); return finish(); }

    var run = null;
    for (var attempt = 1; attempt <= ATTEMPTS; attempt++) {
        console.log('  attempt ' + attempt + '/' + ATTEMPTS + ' — waiting for the local model (up to ' + Math.round(LLM_TIMEOUT_MS / 1000) + 's)…');
        run = await driveOneRealTurn(DEMO);
        var ps = run.plan && run.plan.plan_source;
        console.log('    → plan_source=' + ps + ' llm_called=' + (run.plan && run.plan.llm_called) + ' llm_status=' + (run.plan && run.plan.llm_status) + ' moved=' + run.moved.length);
        if (ps === 'llm' && run.moved.length > 0) break; // got a real LLM turn that moved units
    }

    // ── assertions (the acceptance) ──
    console.log('\n[3] Acceptance — the plan came from the real LLM and the app moved units with it');
    var plan = (run && run.plan) || {};
    need(!!run && !!run.plan, 'the live loop received a plan from the server');
    need(plan.plan_source === 'llm', 'plan_source === "llm" (got ' + plan.plan_source + ')');
    need(plan.llm_called === true, 'llm_called === true');
    need(plan.llm_status === 'ok', 'llm_status === "ok" (got ' + plan.llm_status + ')');
    need(!!plan.provider_used, 'provider_used present (' + plan.provider_used + ')');
    need(!!plan.model_used, 'model_used present (' + plan.model_used + ')');
    need(!plan.fallback_reason, 'fallback_reason is empty (got ' + (plan.fallback_reason || 'none') + ')');
    need(typeof plan.llm_raw_response === 'string' && plan.llm_raw_response.trim().length > 0, 'raw LLM response was captured');
    need(plan.mcp_prompt && plan.mcp_prompt.system && plan.mcp_prompt.prompt, 'MCP prompt was sent + captured');
    need(!/deterministic|fallback|fast/.test(String(plan.plan_source)), 'plan_source is NOT deterministic/fallback/fast (anti-cheat)');
    need(run && run.moved.length > 0, 'the app moved at least one unit FROM the LLM plan (got ' + (run ? run.moved.length : 0) + ')');
    need(run && run.movedScenario, 'real scenario unit positions changed (markers moved)');
    var executed = (run && run.eventLog || []).filter(function (m) { return /^EXECUTED: /.test(m); });
    need(executed.length > 0, 'event log has an EXECUTED line (action → movement → final position)');
    var skipped = (run && run.eventLog || []).filter(function (m) { return /AI turn skipped/.test(m); });
    need(skipped.length === 0, 'no "AI turn skipped" — the real LLM turn was applied, not blocked');

    // ── capture dump (the proof artifact) ──
    console.log('\n[4] Capture');
    var rec = run.moved[0] || {};
    var recCoa = (plan.coas || []).filter(function (c) { return c.recommended; })[0] || (plan.coas || [])[0] || {};
    var lead = (recCoa.phases && recCoa.phases[0] && recCoa.phases[0].actions && recCoa.phases[0].actions[0]) || {};
    info('plan_source', plan.plan_source);
    info('llm_called / llm_status', plan.llm_called + ' / ' + plan.llm_status);
    info('provider_used / model_used', plan.provider_used + ' / ' + plan.model_used);
    info('fallback_reason', plan.fallback_reason || '(none)');
    info('mcp_prompt version', plan.mcp_prompt && plan.mcp_prompt.version);
    info('selected COA', (recCoa.plan_id || '?') + ' / ' + (recCoa.coa_family || recCoa.title || '?'));
    info('selected units', (recCoa.phases && recCoa.phases[0] ? (recCoa.phases[0].actions || []).map(function (a) { return a.unit_uid + ':' + a.action_type; }).join(', ') : ''));
    info('non_selected_units', JSON.stringify(recCoa.non_selected_units || []));
    info('lead action_type / target', (lead.action_type || '?') + ' / ' + JSON.stringify(lead.target || null));
    info('final marker (lead moved unit)', rec.finalPos ? JSON.stringify(rec.finalPos) : '(see EXECUTED)');
    info('EXECUTED line', executed[0] || '(none)');
    console.log('    · raw LLM response (first 400 chars):');
    console.log('      ' + String(plan.llm_raw_response || '').replace(/\s+/g, ' ').slice(0, 400));

    finish();
}

function finish() {
    stopServer();
    if (fails.length === 0) {
        console.log('\n✅ REAL-LLM E2E PASSED — the local model produced the plan and the app moved units with it (verify-ai-free-fight-real-llm-e2e.js)');
        process.exit(0);
    } else {
        console.log('\n❌ REAL-LLM E2E FAILED (' + fails.length + '):');
        fails.forEach(function (m) { console.log('   - ' + m); });
        console.log('\nThis acceptance requires a REAL local LLM. Start the server with RMOOZ_ALLOW_SIM_RUN=1 and a');
        console.log('loaded local model (e.g. `ollama pull qwen2.5:7b`), then re-run. Mocks / deterministic / fast / test');
        console.log('bypass do NOT satisfy this test by design.');
        process.exit(1);
    }
}

main().catch(function (e) { console.error('FATAL', e && e.stack || e); stopServer(); process.exit(1); });
