'use strict';
/* ============================================================================
 * server/load-dotenv.js — RMOOZ-WEB-SERVER-DOTENV-LOADER-A
 * ----------------------------------------------------------------------------
 * Minimal .env loader (NO dotenv dependency — Node built-ins only). Reads
 * KEY=VALUE lines from envPath into `env` (defaults to process.env):
 *   - blank lines and lines starting with `#` are ignored
 *   - surrounding single/double quotes are stripped from the value
 *   - an already-set env value is NEVER overridden — the file only fills GAPS
 *     (so `npm run serve`'s explicit RMOOZ_ALLOW_SIM_RUN etc. always win)
 *   - a missing/unreadable file is a silent no-op (never throws)
 *
 * Extracted verbatim from web-server.js's inline loader so the behaviour is
 * unit-testable in isolation (see test-web-server-dotenv-loader-a.js). Pure +
 * dependency-free; it does not log or expose any value it reads.
 * ========================================================================== */
const fs = require('fs');

function loadDotEnv(envPath, env) {
    env = env || process.env;
    let raw;
    try { raw = fs.readFileSync(envPath, 'utf8'); } catch (_) { return env; } // missing → no-op
    raw.split(/\r?\n/).forEach(function (line) {
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
        if (!m || line.trimStart().startsWith('#')) return;          // skip comments / non KEY=VALUE
        if (env[m[1]] == null) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2'); // gap-fill + strip quotes
    });
    return env;
}

module.exports = { loadDotEnv };
