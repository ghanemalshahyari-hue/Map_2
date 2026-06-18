#!/usr/bin/env node
'use strict';
/* ============================================================================
 * run-rmooz-app.js — RMOOZ-CROSS-PLATFORM-RUN-SCRIPTS-G
 * ----------------------------------------------------------------------------
 * Cross-platform launcher for the RMOOZ web server.
 *
 * WHY: the old `npm run serve`/`web` scripts used Windows-cmd-only syntax —
 *   set RMOOZ_ALLOW_SIM_RUN=1&& ... && node server/web-server.js
 * On macOS/Linux `sh`, `set X=Y` does NOT export an env var, so the server ran
 * WITHOUT RMOOZ_ALLOW_SIM_RUN → the Free Fight AI gate was off ("AI execution
 * is disabled"). The scripts also hardcoded a foreign user's absolute paths
 * (C:\Users\ADMIN\...). This launcher sets the local-run defaults portably in
 * process.env, then spawns server/web-server.js with that env inherited.
 *
 * Zero runtime dependency (Node built-ins only) — deliberately NOT `cross-env`,
 * which is a devDependency and would break `npm run serve` in a prod / offline
 * (`npm ci --omit=dev`) install. The server treats process.env as authoritative
 * (it only fills gaps from .env), so these defaults take effect while still
 * letting an operator override ANY of them by exporting it first.
 *
 * Local-only is preserved: NO provider is set here, so provider resolution
 * defaults to local Ollama (see server/ai/ai-config.js). No combat / COA /
 * planner / ai-config logic is touched.
 * ========================================================================== */
const path = require('path');
const { spawn } = require('child_process');

// This file lives in UI_MOdified/scripts/ → the app dir is its parent.
const APP_DIR = path.join(__dirname, '..');

// Set a default only when the operator has not already provided the var
// (an empty string counts as "not provided"). Mutates and returns `env`.
function applyRunDefaults(env) {
    env = env || {};
    function setDefault(name, value) {
        var cur = env[name];
        if (cur == null || String(cur).trim() === '') env[name] = value;
    }
    // The single AI execution gate. Local-run default is ON so Free Fight works
    // out of the box; an explicit RMOOZ_ALLOW_SIM_RUN=0 (locked-down deploy) wins.
    setDefault('RMOOZ_ALLOW_SIM_RUN', '1');
    // Free Fight sim defaults (carried over from the previous run scripts).
    setDefault('RMOOZ_SIM_MODEL', 'qwen2.5:7b');
    setDefault('RMOOZ_FREE_FIGHT_TIMEOUT_MS', '300000');
    // RMOOZ-OFFLINE-AGENT-ARCHITECTURE-P: keep the local model resident so the operator doesn't pay
    // a cold reload between turns (Ollama unloads after 5m by default). Override with RMOOZ_LLM_KEEP_ALIVE.
    // (num_ctx is intentionally NOT defaulted — forcing a small context would truncate the COA prompt;
    //  set RMOOZ_OLLAMA_NUM_CTX explicitly to opt in.)
    setDefault('RMOOZ_LLM_KEEP_ALIVE', '8h');
    // RMOOZ-BLUE-RED-GREEN-WHITE-A: ONE main local planner model for Blue/Red commander work. The prior
    // fallback default (ai-config qwen2.5:7b) isn't installed on the target box, so the card showed
    // "needs model" until a manual pick. qwen3-coder:latest is the proven local COA model → make it the
    // app-wide default so the card is Ready out of the box. App-wide (also the adjudicator/MC default);
    // override with RMOOZ_LLM_MODEL, or pick another model in the card (that selection persists).
    setDefault('RMOOZ_LLM_MODEL', 'qwen3-coder:latest');
    // TestingAI dir — resolved RELATIVE to this repo (replaces the foreign
    // C:\Users\ADMIN\...\TestingAI absolute path).
    setDefault('RMOOZ_TESTINGAI_DIR', path.join(APP_DIR, 'TestingAI'));
    // Python interpreter — a sane per-OS default (replaces the foreign hardcoded
    // C:\Users\ADMIN\...\python.exe). Override with RMOOZ_PYTHON.
    setDefault('RMOOZ_PYTHON', process.platform === 'win32' ? 'python' : 'python3');
    // NOTE: no provider is set — resolution defaults to local Ollama (local-only).
    return env;
}

function main() {
    applyRunDefaults(process.env);
    var child = spawn(process.execPath, [path.join('server', 'web-server.js')], {
        cwd: APP_DIR,
        env: process.env,
        stdio: 'inherit',
    });
    child.on('exit', function (code, signal) {
        if (signal) { process.exit(1); return; }
        process.exit(code == null ? 0 : code);
    });
    child.on('error', function (err) {
        console.error('[run-rmooz-app] failed to start server:', err && err.message);
        process.exit(1);
    });
    ['SIGINT', 'SIGTERM'].forEach(function (sig) {
        process.on(sig, function () { try { child.kill(sig); } catch (_) {} });
    });
}

// Run only when invoked directly (so tests can require + call applyRunDefaults
// without spawning a server).
if (require.main === module) main();

module.exports = { applyRunDefaults: applyRunDefaults, APP_DIR: APP_DIR };
