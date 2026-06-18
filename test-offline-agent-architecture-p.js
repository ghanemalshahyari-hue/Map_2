/**
 * test-offline-agent-architecture-p.js — RMOOZ-OFFLINE-AGENT-ARCHITECTURE-P (Phase 1)
 *
 * Local-inference speed instrumentation: every Ollama call now honors keep_alive
 * (RMOOZ_LLM_KEEP_ALIVE) + an optional context cap (RMOOZ_OLLAMA_NUM_CTX); a timing extractor
 * turns Ollama's nanosecond stats into ms + tokens/sec; warmup/benchmark surface cold-vs-warm.
 *
 * Acceptance (the unit-testable slice; warmup/benchmark endpoints verified live against the real
 * server + ollama — see the PR notes / benchmark output):
 *  1 extractTimings: ns→ms, tokens/sec, cold/warm flag, null-safe on non-Ollama raw
 *  2 keep_alive (RMOOZ_LLM_KEEP_ALIVE) is passed to Ollama on every call
 *  3 num_ctx: opt-in via RMOOZ_OLLAMA_NUM_CTX (unset → model default; explicit option wins)
 *  4 num_predict is passed (numPredict alias normalized)
 *  5 client _benchHtml renders cold/warm load + generation tok/s + warmup/benchmark buttons
 *  6 num_ctx is NOT defaulted by the launcher (forcing a small ctx would truncate the COA prompt)
 */
'use strict';
var assert = require('assert');
var path = require('path');
var fs = require('fs');

var AI = path.join(__dirname, 'UI_MOdified', 'server', 'ai');
var ollama = require(path.join(AI, 'ollama-client.js'));

var pass = 0, fail = 0;
function ok(n) { pass++; console.log('  ✓ ' + n); }
function bad(n, e) { fail++; console.log('  ✗ ' + n + (e ? (' — ' + (e && e.message || e)) : '')); }

// 1 — extractTimings (ns→ms + tokens/sec + cold flag), from the real COLD benchmark shape.
try {
    var t = ollama.extractTimings({ total_duration: 9306000000, load_duration: 9228000000,
        prompt_eval_duration: 63000000, prompt_eval_count: 13, eval_duration: 14000000, eval_count: 2 });
    assert(t.total_ms === 9306 && t.load_ms === 9228, 'ns→ms (total/load)');
    assert(t.prompt_tokens === 13 && t.eval_tokens === 2, 'token counts');
    assert(Math.abs(t.eval_tokens_per_sec - 142.9) < 0.5, 'eval tok/s ≈142.9, got ' + t.eval_tokens_per_sec);
    assert(t.was_loaded === false, 'load 9228ms ≥ 200 → cold');
    ok('extractTimings: ns→ms, tokens/sec, cold flag');
} catch (e) { bad('extractTimings cold', e); }

// 1b — warm signal + 1c null-safe.
try {
    var w = ollama.extractTimings({ load_duration: 50000000, eval_count: 10, eval_duration: 100000000 });
    assert(w.was_loaded === true, 'load 50ms < 200 → warm');
    assert(w.eval_tokens_per_sec === 100, '10 tok / 0.1s = 100 tok/s');
    var n = ollama.extractTimings({ choices: [] });
    assert(n && n.total_ms === null && n.eval_tokens_per_sec === null, 'non-Ollama raw → null fields');
    assert(ollama.extractTimings(null) === null, 'null raw → null');
    ok('extractTimings: warm flag + null-safe on non-Ollama/empty raw');
} catch (e) { bad('extractTimings warm/null', e); }

// 2 — keep_alive threaded from RMOOZ_LLM_KEEP_ALIVE into the request body.
try {
    process.env.RMOOZ_LLM_KEEP_ALIVE = '8h';
    var b = ollama._ollamaBodyForTest({ temperature: 0 });
    assert(b.keep_alive === '8h', 'keep_alive from env = ' + b.keep_alive);
    ok('keep_alive (RMOOZ_LLM_KEEP_ALIVE) passed to Ollama on every call');
} catch (e) { bad('keep_alive wiring', e); }

// 3 — num_ctx opt-in.
try {
    delete process.env.RMOOZ_OLLAMA_NUM_CTX;
    var b1 = ollama._ollamaBodyForTest({});
    assert(!b1.options || b1.options.num_ctx == null, 'no num_ctx when env unset (model default)');
    process.env.RMOOZ_OLLAMA_NUM_CTX = '4096';
    var b2 = ollama._ollamaBodyForTest({});
    assert(b2.options && b2.options.num_ctx === 4096, 'num_ctx=4096 from env, got ' + (b2.options && b2.options.num_ctx));
    var b3 = ollama._ollamaBodyForTest({ num_ctx: 8192 });
    assert(b3.options.num_ctx === 8192, 'explicit option wins over env');
    delete process.env.RMOOZ_OLLAMA_NUM_CTX;
    ok('num_ctx: opt-in via RMOOZ_OLLAMA_NUM_CTX (unset→default, explicit wins)');
} catch (e) { bad('num_ctx wiring', e); }

// 4 — num_predict (numPredict alias).
try {
    var b = ollama._ollamaBodyForTest({ numPredict: 600 });
    assert(b.options && b.options.num_predict === 600, 'numPredict→num_predict = ' + (b.options && b.options.num_predict));
    ok('num_predict passed to Ollama (numPredict alias normalized)');
} catch (e) { bad('num_predict', e); }

// 6 — launcher does NOT force num_ctx (would truncate the COA prompt), but DOES keep the model warm.
try {
    var launcher = fs.readFileSync(path.join(__dirname, 'UI_MOdified', 'scripts', 'run-rmooz-app.js'), 'utf8');
    assert(/setDefault\('RMOOZ_LLM_KEEP_ALIVE'/.test(launcher), 'launcher defaults RMOOZ_LLM_KEEP_ALIVE');
    assert(launcher.indexOf("setDefault('RMOOZ_OLLAMA_NUM_CTX'") === -1, 'launcher does NOT default num_ctx');
    ok('launcher keeps model warm (keep_alive) but never force-sets num_ctx');
} catch (e) { bad('launcher defaults', e); }

// 5 — client _benchHtml render (DOM stub + module load).
try {
    var elById = {};
    function makeEl(t) { return { tagName: t, id: '', innerHTML: '', children: [], attrs: {}, style: {},
        appendChild: function (e) { this.children.push(e); if (e && e.id) elById[e.id] = e; return e; },
        removeChild: function () {}, setAttribute: function (k, v) { this.attrs[k] = v; }, removeAttribute: function () {},
        addEventListener: function () {}, querySelector: function () { return null; }, querySelectorAll: function () { return []; },
        getAttribute: function (k) { return this.attrs[k]; } }; }
    global.document = { body: makeEl('body'), head: makeEl('head'), createElement: makeEl, getElementById: function (id) { return elById[id] || null; }, querySelector: function () { return null; } };
    global.window = { document: global.document, AppShellEventLog: { append: function () {} },
        sessionStorage: { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} },
        setTimeout: function () { return 0; }, clearTimeout: function () {}, setInterval: function () { return 0; }, clearInterval: function () {}, fetch: null };
    global.window.window = global.window;
    var CL = path.join(__dirname, 'UI_MOdified', 'client', 'shell');
    require(path.join(CL, 'world-state-db.js'));
    require(path.join(CL, 'symbol-db.js'));
    require(path.join(CL, 'symbol-registry.js'));
    require(path.join(CL, 'free-fight-demo.js'));
    var DEMO = global.window.RmoozFreeFightDemo;

    var warmHtml = DEMO._benchHtmlForTest(
        { ok: true, model: 'qwen3-coder:latest', was_loaded: true, wall_ms: 119, keep_alive: '8h' },
        { ok: true, model: 'qwen3-coder:latest', num_ctx: null, keep_alive: '8h', wall_ms: 110,
          timings: { load_ms: 86, was_loaded: true, eval_tokens_per_sec: 185.4, prompt_tokens_per_sec: 1187.9 } });
    assert(/data-act="bench-warmup"/.test(warmHtml) && /data-act="bench-run"/.test(warmHtml), 'warmup + benchmark buttons');
    assert(/185\.4 tok\/s/.test(warmHtml), 'shows generation tok/s');
    assert(/warm/.test(warmHtml) && /keep_alive/.test(warmHtml), 'shows warm + keep_alive');

    var coldHtml = DEMO._benchHtmlForTest(undefined, { ok: true, model: 'm', timings: { load_ms: 9228, was_loaded: false, eval_tokens_per_sec: 142.3 } });
    assert(/cold/.test(coldHtml) && /9228ms/.test(coldHtml), 'cold load shown');
    ok('client _benchHtml renders cold/warm load + generation tok/s + warmup/benchmark buttons');
} catch (e) { bad('client _benchHtml render', e); }

console.log('\n' + (fail === 0 ? '✅ ' : '❌ ') + pass + ' passed, ' + fail + ' failed (test-offline-agent-architecture-p.js)');
process.exit(fail === 0 ? 0 : 1);
