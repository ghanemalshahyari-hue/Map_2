/* ============================================================================
 * wargame-sim-bridge.js — FAST-DOC-1 / FAST-DOC-2: DOCX → WarGamingGEN → import
 * ----------------------------------------------------------------------------
 * Lets RMOOZ:
 *   1. accept red_team.docx / blue_team.docx uploads and place them where
 *      WarGamingGEN consumes them (inputs/forces, with .bak backup),
 *   2. RUN the real WarGamingGEN simulation on those DOCX (the full LLM run),
 *      forcing a working local config (LLM_LOCAL_FORCE_FALLBACK=0 + a capable
 *      local model) so it actually generates — only when explicitly enabled,
 *   3. PUBLISH each generation into its own DATED folder under
 *      export_to_rmooz/<run-id>/ (mirrors WarGamingGEN's runs/<ts> versioning,
 *      so every export is traceable to the run that produced it), and
 *   4. IMPORT the latest dated export's all_phases.geojson via the EXISTING
 *      porter (scripts/port-wargame.js), stamping DOCX provenance.
 *
 * Safety / guardrails:
 *   - DOCX only (ext + ZIP magic), fixed slots red|blue.
 *   - The ONLY runnable command is the WarGamingGEN run (test_full_run.py),
 *     and ONLY when RMOOZ_ALLOW_SIM_RUN=1. No arbitrary execution.
 *   - Import reuses port-wargame.js (no second parser, no rebuild).
 *   - No DOCX parsing in RMOOZ.
 *
 * Env config (all optional):
 *   RMOOZ_TESTINGAI_DIR   default C:/Users/ADMIN/Desktop/TestingAI
 *   RMOOZ_WARGAMEGEN_DIR  default <TESTINGAI>/WarGamingGEN
 *   RMOOZ_ALLOW_SIM_RUN   "1" to enable the real run trigger
 *   RMOOZ_SIM_MODEL       local model for the run (default qwen2.5:3b)
 *   RMOOZ_PYTHON          python executable (default "python")
 * ========================================================================== */
'use strict';

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');                 // UI_MOdified/
const PORTER = require(path.join(ROOT, 'scripts', 'port-wargame.js'));

// Resolve the TestingAI root. DEBUG-DOCX-1 root cause RC-2: the old hardcoded
// 'C:/Users/ADMIN/Desktop/TestingAI' default is dead on any box whose user isn't
// "ADMIN", so staged DOCX, the run, and the import all silently targeted a
// non-existent tree (uploads never reached WarGamingGEN/inputs/forces → same
// result every time). Honor the env override first, then auto-detect the tree
// under the CURRENT user's Desktop, then fall back to the legacy default.
function resolveTestingAiDir() {
    if (process.env.RMOOZ_TESTINGAI_DIR) return process.env.RMOOZ_TESTINGAI_DIR;
    const candidates = [];
    // GEN-RUN-CHAIN-1: prefer the TestingAI co-located with THIS server install.
    // It is guaranteed to match this build's generator code (e.g. the
    // objective-shift fix). A bare `node server/web-server.js` with no env must
    // NOT silently fall back to a SEPARATE standalone tree that may lack those
    // fixes — that defect made the objective marker move while units reverted to
    // the base objective (the standalone tree has no apply_objective_shift).
    const colocated = path.join(ROOT, 'TestingAI');
    candidates.push(colocated);
    const home = process.env.USERPROFILE || process.env.HOME;
    if (home) candidates.push(path.join(home, 'Desktop', 'TestingAI'));
    candidates.push('C:/Users/ADMIN/Desktop/TestingAI');   // legacy default (last resort)
    for (const cand of candidates) { try { if (fs.existsSync(cand)) return cand; } catch (_) {} }
    return candidates[0];                                   // best-effort: co-located tree
}

function cleanEnvPath(value) {
    return String(value || '').trim().replace(/^["']|["']$/g, '');
}

function resolvePython(testingAi) {
    const envPython = cleanEnvPath(process.env.RMOOZ_PYTHON);
    if (envPython && exists(envPython)) return envPython;
    const venvPython = process.platform === 'win32'
        ? path.join(testingAi, '.venv', 'Scripts', 'python.exe')
        : path.join(testingAi, '.venv', 'bin', 'python');
    if (exists(venvPython)) return venvPython;
    return envPython || 'python';
}

function cfg() {
    const testingAi = resolveTestingAiDir();
    const wgen      = process.env.RMOOZ_WARGAMEGEN_DIR || path.join(testingAi, 'WarGamingGEN');
    return {
        testingAi, wgen,
        importFromRmooz: path.join(testingAi, 'import_from_rmooz'),
        exportToRmooz:   path.join(testingAi, 'export_to_rmooz'),
        forcesDir:       path.join(wgen, 'inputs', 'forces'),
        runsDir:         path.join(wgen, 'runs'),
        allowRun:        process.env.RMOOZ_ALLOW_SIM_RUN === '1',
        python:          resolvePython(testingAi),
        simModel:        process.env.RMOOZ_SIM_MODEL || 'qwen2.5:3b',
    };
}

// ── OFFLINE-GEN-RUN-FIX-1 / OFFLINE-LITELLM-CERT-TIMEOUT-1 ──────────────────
// Build the Python child process environment.
// Maps RMOOZ_AI_* → LLM_* vars so WarGamingGEN uses the operator endpoint,
// NOT its baked localhost:11434 default.
// Also injects CA cert and timeout vars so the Python OpenAI client can
// reach internal HTTPS LiteLLM endpoints securely.
//
// Returns { env, summary } where summary is SAFE to log (no key value).
function buildLlmChildEnv(c, baseEnv) {
    const env = Object.assign({}, baseEnv);

    const provider = (process.env.RMOOZ_AI_PROVIDER || 'ollama').toLowerCase().trim();
    const aiBase   = (process.env.RMOOZ_AI_BASE_URL || '').trim();
    const aiKey    = (process.env.RMOOZ_AI_API_KEY || '').trim();
    const aiModel  = (process.env.RMOOZ_AI_MODEL || '').trim();

    let baseUrl = '';
    let model   = '';

    if (provider === 'litellm' || provider === 'openai' || aiBase) {
        // OpenAI-compatible / LiteLLM HTTPS endpoint.
        baseUrl = aiBase;
        model   = aiModel || c.simModel;
        if (aiKey) {
            env.LLM_API_KEY    = aiKey;
            env.OPENAI_API_KEY = aiKey;
        }
    } else {
        // Ollama: derive an OpenAI-compatible base from the OLLAMA host URL.
        const ollama = (process.env.RMOOZ_OLLAMA_URL || process.env.OLLAMA_HOST || 'http://host.docker.internal:11434').trim();
        baseUrl = ollama.replace(/\/+$/, '') + '/v1';
        model   = (process.env.RMOOZ_OLLAMA_MODEL || '').trim() || c.simModel;
        // Ollama ignores the key, but the OpenAI SDK requires a non-empty one.
        env.LLM_API_KEY    = env.LLM_API_KEY    || 'ollama';
        env.OPENAI_API_KEY = env.OPENAI_API_KEY || 'ollama';
    }

    if (baseUrl) env.LLM_BASE_URL = baseUrl;
    if (model)   env.LLM_MODEL    = model;
    env.LLM_USE_RESPONSES_API = '0';                  // LiteLLM/Ollama use chat-completions
    // A real endpoint is configured → do NOT force the deterministic local
    // fallback (that path skips the LLM and never progresses on schema calls).
    env.LLM_LOCAL_FORCE_FALLBACK = baseUrl ? '0' : '1';

    // ── OFFLINE-LITELLM-CERT-TIMEOUT-1: timeout vars ─────────────────────────
    // Python client.py reads RMOOZ_AI_TIMEOUT_MS / LLM_TIMEOUT_MS / OPENAI_TIMEOUT_MS
    // and converts to seconds. Default is 300 000 ms (300 s) in config.py.
    // Pass all three so the Python side can pick up whichever it checks first.
    const timeoutMs = (process.env.RMOOZ_AI_TIMEOUT_MS || '300000').trim();
    env.RMOOZ_AI_TIMEOUT_MS = timeoutMs;
    env.LLM_TIMEOUT_MS      = timeoutMs;
    env.OPENAI_TIMEOUT_MS   = timeoutMs;

    // ── OFFLINE-LITELLM-CA-1: CA certificate + TLS verify ────────────────────
    // Python ssl / httpx honours SSL_CERT_FILE and REQUESTS_CA_BUNDLE.
    // RMOOZ_AI_CA_CERT_PATH is read explicitly by config.py.
    // Pass all four so every Python HTTP library in the venv can find the cert.
    const caCertPath = (process.env.RMOOZ_AI_CA_CERT_PATH || '').trim();
    const sslCertFile = (process.env.SSL_CERT_FILE || caCertPath || '').trim();
    const reqsCaBundle = (process.env.REQUESTS_CA_BUNDLE || caCertPath || '').trim();
    const nodeExtraCa  = (process.env.NODE_EXTRA_CA_CERTS || '').trim();
    if (caCertPath)    env.RMOOZ_AI_CA_CERT_PATH = caCertPath;
    if (sslCertFile)   env.SSL_CERT_FILE          = sslCertFile;
    if (reqsCaBundle)  env.REQUESTS_CA_BUNDLE     = reqsCaBundle;
    if (nodeExtraCa)   env.NODE_EXTRA_CA_CERTS    = nodeExtraCa;

    // RMOOZ_AI_TLS_VERIFY: pass through to Python (0 = disable TLS check).
    // Emergency use only. Default is absent (TLS on). Log a warning if used.
    const tlsVerify = (process.env.RMOOZ_AI_TLS_VERIFY || '').trim();
    if (tlsVerify === '0') {
        env.RMOOZ_AI_TLS_VERIFY = '0';
        console.warn('[wargame-sim] WARNING: RMOOZ_AI_TLS_VERIFY=0 — TLS verification is DISABLED. ' +
            'Mount the internal CA certificate (RMOOZ_AI_CA_CERT_PATH) instead.');
    }

    // ── OFFLINE-LITELLM-MTLS-1: optional client certificate (mutual TLS) ─────
    // Forward cert + key PATHS (never contents) and the optional key password to
    // the Python child under both the RMOOZ_AI_CLIENT_* names and the shorter
    // LLM_CLIENT_* aliases config.py also accepts. The password is forwarded so
    // an encrypted key can be opened, but it is NEVER logged or summarised.
    const clientCertPath = (process.env.RMOOZ_AI_CLIENT_CERT_PATH || '').trim();
    const clientKeyPath  = (process.env.RMOOZ_AI_CLIENT_KEY_PATH  || '').trim();
    const clientCertPw   = (process.env.RMOOZ_AI_CLIENT_CERT_PASSWORD || ''); // not trimmed; not logged
    if (clientCertPath) { env.RMOOZ_AI_CLIENT_CERT_PATH = clientCertPath; env.LLM_CLIENT_CERT_PATH = clientCertPath; }
    if (clientKeyPath)  { env.RMOOZ_AI_CLIENT_KEY_PATH  = clientKeyPath;  env.LLM_CLIENT_KEY_PATH  = clientKeyPath; }
    if (clientCertPw)   { env.RMOOZ_AI_CLIENT_CERT_PASSWORD = clientCertPw; env.LLM_CLIENT_CERT_PASSWORD = clientCertPw; }
    const mtlsConfigured = !!(clientCertPath && clientKeyPath);

    const summary = {
        provider:           provider,
        baseUrlConfigured:  !!baseUrl,
        baseUrl:            baseUrl || null,           // endpoint URL is not a secret
        model:              model || null,
        apiKeyConfigured:   !!(env.LLM_API_KEY && env.LLM_API_KEY !== 'ollama'),
        useResponsesApi:    env.LLM_USE_RESPONSES_API,
        localForceFallback: env.LLM_LOCAL_FORCE_FALLBACK,
        timeoutMs:          timeoutMs,
        caCertConfigured:   !!caCertPath,
        caCertPath:         caCertPath || null,        // path only, never a secret
        tlsVerify:          tlsVerify !== '0',
        // mTLS — booleans + paths only; the key password is NEVER included here.
        clientCertConfigured: !!clientCertPath,
        clientKeyConfigured:  !!clientKeyPath,
        clientCertPath:       clientCertPath || null,  // path only, never a secret
        clientKeyPath:        clientKeyPath || null,    // path only, never a secret
        mtlsConfigured:       mtlsConfigured,
    };
    return { env: env, summary: summary };
}

// Redact any secret-bearing lines before persisting Python stderr to disk.
function redactSecrets(text) {
    if (!text) return '';
    return String(text)
        .split('\n')
        .map(function (line) {
            if (/(API_KEY|LLM_API_KEY|OPENAI_API_KEY|Authorization|Bearer)/i.test(line)) {
                return line.replace(/((?:API_KEY|LLM_API_KEY|OPENAI_API_KEY|Authorization|Bearer)\s*[:=]?\s*)\S+/gi, '$1<redacted>');
            }
            return line;
        })
        .join('\n');
}

const SLOT_FILE = { red: 'red_team.docx', blue: 'blue_team.docx' };

// Module-level state for the (long-running) simulation process.
var simState = {
    running: false, runName: null, startedAt: null, finishedAt: null,
    exitCode: null, error: null, published: null, cancelled: false, message: null,
};
var activeChild = null;

function mkdirp(d) { try { fs.mkdirSync(d, { recursive: true }); } catch (_) {} }
function exists(p) { try { return fs.existsSync(p); } catch (_) { return false; } }
function readJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return null; } }

function terminateChildTree(child) {
    if (!child || !child.pid) return false;
    try {
        if (process.platform === 'win32') {
            const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
            killer.on('error', function () {
                try { child.kill(); } catch (_) {}
            });
        } else {
            try { child.kill('SIGTERM'); } catch (_) {}
            setTimeout(function () {
                try {
                    if (!child.killed) child.kill('SIGKILL');
                } catch (_) {}
            }, 1200).unref?.();
        }
        return true;
    } catch (_) {
        try { child.kill(); return true; } catch (__) { return false; }
    }
}

// Windows can't create the runs/latest symlink, so pick the newest run dir by
// its timestamped name (YYYY-MM-DD_HH-MM-SS sorts lexically == chronologically).
function latestRunDir(c) {
    if (!exists(c.runsDir)) return null;
    var dirs = fs.readdirSync(c.runsDir).filter(function (n) {
        return /^\d{4}-\d{2}-\d{2}_/.test(n) && (function () { try { return fs.statSync(path.join(c.runsDir, n)).isDirectory(); } catch (_) { return false; } })();
    }).sort();
    return dirs.length ? path.join(c.runsDir, dirs[dirs.length - 1]) : null;
}

function manualCommands(c) {
    return {
        full_run:  `cd "${c.wgen}" && LLM_LOCAL_FORCE_FALLBACK=1 LLM_MODEL=${c.simModel} ${c.python} tests/test_full_run.py --all`,
        regenerate:`cd "${c.wgen}" && ${c.python} -m src.tools.regenerate_outputs`,
        note: 'RMOOZ runs the full sim only when RMOOZ_ALLOW_SIM_RUN=1; otherwise run the above manually, then Import.',
    };
}

// Copy one run's outputs into a DATED folder under export_to_rmooz and update
// the latest.json pointer. Pure file copy — no sim, no LLM.
function publishRunToExport(c, runDir, inputDocs) {
    runDir = runDir || latestRunDir(c);
    if (!runDir || !exists(runDir)) return { ok: false, error: 'no run to publish' };
    var runName = path.basename(runDir);
    var srcOut  = path.join(runDir, 'outputs');
    var srcGeo  = path.join(srcOut, 'geojson');
    if (!exists(path.join(srcGeo, 'all_phases.geojson'))) {
        return { ok: false, error: 'run ' + runName + ' has no outputs/geojson/all_phases.geojson yet' };
    }
    var destDir = path.join(c.exportToRmooz, runName);          // DATED folder
    mkdirp(path.join(destDir, 'geojson'));
    var steps = [];
    for (var f of fs.readdirSync(srcGeo)) {
        if (!/\.geojson$/i.test(f) || f.startsWith('._')) continue;
        fs.copyFileSync(path.join(srcGeo, f), path.join(destDir, 'geojson', f));
        if (/^step\d+\.geojson$/i.test(f)) steps.push('geojson/' + f);
    }
    var report = false, schedule = false;
    if (exists(path.join(srcOut, 'wargame_report.md')))   { fs.copyFileSync(path.join(srcOut, 'wargame_report.md'),   path.join(destDir, 'wargame_report.md'));   report = true; }
    if (exists(path.join(srcOut, 'wargameschedule.csv'))) { fs.copyFileSync(path.join(srcOut, 'wargameschedule.csv'), path.join(destDir, 'wargameschedule.csv')); schedule = true; }
    var manifest = {
        schema: 'testingai-export', version: 2,
        run_id: runName,
        generated_at: new Date().toISOString(),
        input_docs: inputDocs || ['red_team.docx', 'blue_team.docx'],
        files: {
            geojson_all: 'geojson/all_phases.geojson',
            geojson_steps: steps.sort(),
            report: report ? 'wargame_report.md' : null,
            schedule: schedule ? 'wargameschedule.csv' : null,
        },
    };
    fs.writeFileSync(path.join(destDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
    // latest.json pointer (Windows symlink-free "runs/latest" equivalent).
    mkdirp(c.exportToRmooz);
    fs.writeFileSync(path.join(c.exportToRmooz, 'latest.json'),
        JSON.stringify({ latest: runName, all_phases: runName + '/geojson/all_phases.geojson', updated: new Date().toISOString() }, null, 2), 'utf8');
    return { ok: true, run_id: runName, dir: destDir, manifest: manifest };
}

// Resolve the latest dated export folder (via latest.json, else newest subdir).
function latestExport(c) {
    var ptr = readJson(path.join(c.exportToRmooz, 'latest.json'));
    var runName = ptr && ptr.latest;
    if (!runName && exists(c.exportToRmooz)) {
        var dirs = fs.readdirSync(c.exportToRmooz).filter(function (n) {
            return /^\d{4}-\d{2}-\d{2}_/.test(n);
        }).sort();
        runName = dirs.length ? dirs[dirs.length - 1] : null;
    }
    if (!runName) return null;
    var dir = path.join(c.exportToRmooz, runName);
    var all = path.join(dir, 'geojson', 'all_phases.geojson');
    return {
        run_id: runName, dir: dir, all_phases: all,
        all_phases_present: exists(all),
        report: exists(path.join(dir, 'wargame_report.md')),
        schedule: exists(path.join(dir, 'wargameschedule.csv')),
    };
}

// ── UNIFIED-IMPORT-2: phase progress, resume/regenerate args, partial import ──
// PARTIAL-IMPORT-404-1: honor RMOOZ_DATA_DIR like the porter + scenario-loader,
// so collision/existence checks here match where the file is actually written/read.
const SCENARIOS_DIR = path.join(process.env.RMOOZ_DATA_DIR || path.join(ROOT, 'data'), 'scenarios');   // where the porter writes
function scenarioFilePath(name) { return path.join(SCENARIOS_DIR, name + '.json'); }

// ── WIZARD-SAVE-1: non-destructive scenario naming ───────────────────────────
// Sanitize a requested/raw name to the on-disk safe form. Applied EXACTLY ONCE
// per import (mirrors the porter/web-server safeName rule). Strips path
// separators and anything outside [a-z0-9._-]; never yields an empty name.
function safeScenarioName(raw) {
    return String(raw == null ? '' : raw)
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 64) || 'wargame-import';
}

// True iff a scenario file already exists for this (already-safe) name.
function scenarioFileExists(name) { return exists(scenarioFilePath(name)); }

// Defense-in-depth path guard: the resolved file must sit directly inside
// SCENARIOS_DIR (no traversal, no separators). safeScenarioName already strips
// separators, but we re-verify the resolved path before any write.
function isSafeScenarioName(name) {
    if (!name || typeof name !== 'string') return false;
    if (/[\\/]/.test(name)) return false;
    var root   = path.resolve(SCENARIOS_DIR);
    var target = path.resolve(scenarioFilePath(name));
    return target === path.join(root, name + '.json') &&
           (target === root || target.indexOf(root + path.sep) === 0);
}

// Return `base` if free, else the first free `base-2`, `base-3`, … suffix.
function makeUniqueScenarioName(base) {
    if (!scenarioFileExists(base)) return base;
    for (var i = 2; i < 1000; i++) {
        var cand = (base + '-' + i).slice(0, 64);
        if (!scenarioFileExists(cand)) return cand;
    }
    return (base + '-' + Date.now()).slice(0, 64);
}

// Resolve the final save target for an import, non-destructively.
// Returns one of:
//   { conflict:true, requestedName, suggestedName }   — caller should 409
//   { name }                                          — caller writes here
// Rules:
//   - free name              → write as-is
//   - exists + overwrite     → write over it (explicit operator Replace)
//   - exists + explicit name → conflict (operator must rename or confirm Replace)
//   - exists + auto name     → silently pick a unique suffix (never overwrite)
function resolveScenarioSaveTarget(opts) {
    var base = opts.baseName;
    if (!scenarioFileExists(base)) return { name: base };
    if (opts.overwrite)   return { name: base, replaced: true };
    if (opts.explicit)    return { conflict: true, requestedName: base, suggestedName: makeUniqueScenarioName(base) };
    return { name: makeUniqueScenarioName(base), auto_renamed: true };
}

// Count completed phases by the checkpoints WarGamingGEN writes per phase
// (runs/<run>/checkpoints/phaseNN.json) — the only real-time progress signal
// (geojson outputs are written once at the very end).
function countCheckpoints(runDir) {
    if (!runDir) return 0;
    try {
        return fs.readdirSync(path.join(runDir, 'checkpoints'))
            .filter(function (n) { return /^phase\d+\.json$/i.test(n) && !n.startsWith('._'); }).length;
    } catch (_) { return 0; }
}

// Total phases for this scenario (WarGamingGEN/inputs/scenario.json), default 17.
function phasesTotal(c) {
    try {
        var sc = readJson(path.join(c.wgen, 'inputs', 'scenario.json'));
        if (sc && Array.isArray(sc.phases) && sc.phases.length) return sc.phases.length;
    } catch (_) {}
    return 17;
}

// Spawn args for a run. resume → append --resume (engine picks up the latest run
// dir's checkpoints and continues). Full-run behavior is otherwise unchanged.
function runArgs(resume) {
    var a = ['tests/test_full_run.py', '--all'];
    if (resume) a.push('--resume');
    return a;
}

// Spawn args for regenerate_outputs (replays checkpoints → outputs, NO LLM).
function regenArgs(runName) {
    var a = ['-m', 'src.tools.regenerate_outputs'];
    if (runName) { a.push('--run-dir'); a.push('runs/' + runName); }
    return a;
}

function partialName(base, n) {
    return String(base) + '__partial-' + String(n).padStart(2, '0');
}

// True iff overwriting `existing` would silently change a generated scenario's
// lineage. Plain authored/legacy scenarios (no generation metadata) are NOT
// guarded here — only generated imports (which carry generation_status/source_run).
function clobberConflict(existing, incomingStatus, incomingRun) {
    if (!existing) return false;
    var hasMeta = existing.generation_status != null || existing.source_run != null || existing.partial_import != null;
    if (!hasMeta) return false;
    if (existing.generation_status && existing.generation_status !== incomingStatus) return true;
    if (existing.source_run && existing.source_run !== incomingRun) return true;
    if (existing.partial_import === true && incomingStatus !== 'partial') return true;
    return false;
}

// Real progress + partial detection for /status (read-only).
function computeSimProgress(c, st) {
    var runDir   = latestRunDir(c);
    var lastRunId = runDir ? path.basename(runDir) : null;
    var total = phasesTotal(c);
    var running = !!(st && st.running);
    // Part A run-id gating: while a new run is starting but the spawned process
    // hasn't created its own run dir yet, the newest-on-disk run is still the
    // pre-Start baseline. Do NOT report that older run's checkpoints as the new
    // run's progress — report 0 ("starting") and a null run id until the
    // session's own run dir appears (lastRunId !== baselineRun).
    var startingNewRun = running && st.baselineRun && lastRunId === st.baselineRun;
    if (startingNewRun) {
        return {
            phases_done: 0, phases_total: total,
            partial_available: false, partial_import_allowed: false,
            last_run_id: null, can_resume: false, outputs_present: false,
            status: 'running', message: 'Starting new generation…', cancelled: false,
            setup_matches_stopped_run: false, stopped_run_meta: null,
        };
    }
    var done  = countCheckpoints(runDir);
    var outputsPresent = !!(runDir && exists(path.join(runDir, 'outputs', 'geojson', 'all_phases.geojson')));
    var cancelledStopped = !!(st && st.cancelled) && done > 0 && !outputsPresent;
    var partialAvailable = !running && done > 0 && (done < total || cancelledStopped);
    var status, message;
    if (running)              { status = 'running';         message = 'Generating — phase ' + done + ' of ' + total + '…'; }
    else if (cancelledStopped) { status = 'stopped_partial'; message = 'Generation stopped by operator after ' + done + ' of ' + total + ' phases.'; }
    else if (st && st.cancelled) { status = 'cancelled';     message = st.message || 'Generation stopped before checkpoints were written.'; }
    else if (st && st.error) { status = 'error';           message = String(st.error).slice(0, 200); }
    else if (done === 0)     { status = 'idle';            message = 'No run yet.'; }
    else if (done >= total)  { status = 'complete';        message = 'All ' + total + ' phases generated.'; }
    else                     { status = 'stopped_partial'; message = 'Generation stopped after ' + done + ' of ' + total + ' phases.'; }
    // WIZARD-FINGERPRINT-1: only let the client offer Continue / Partial-Import
    // when the current staged setup matches the fingerprint this run launched
    // with. While running, match is irrelevant (the progress panel owns the UI).
    var fp = (!running && done > 0) ? setupMatchesRun(c, runDir) : { matches: false, meta: null };
    return {
        phases_done: done,
        phases_total: total,
        partial_available: partialAvailable,
        partial_import_allowed: partialAvailable && done >= 4,   // validator floor (steps ∈ [4..20])
        last_run_id: lastRunId,
        can_resume: done > 0,
        outputs_present: outputsPresent,
        status: status,
        message: message,
        cancelled: !!(st && st.cancelled),
        // Setup-fingerprint gate for the stopped/partial panel.
        setup_matches_stopped_run: fp.matches,
        stopped_run_meta: fp.meta ? {
            runId: fp.meta.runId || lastRunId,
            requestedName: fp.meta.requestedName || null,
            objective_lon: fp.meta.objective_lon, objective_lat: fp.meta.objective_lat,
            createdAt: fp.meta.createdAt || null,
            phases_done: done, status: status,
        } : null,
    };
}

function simPayload(c) {
    var obj = Object.assign({
        running: simState.running,
        run_name: simState.runName,
        started_at: simState.startedAt,
        finished_at: simState.finishedAt,
        exit_code: simState.exitCode,
        error: simState.error,
    }, computeSimProgress(c, simState));
    // PREGEN-CONTROL-2: include current objective (default + any override).
    var defObj = getDefaultObjective(c);
    var ovObj = readObjectiveOverride(c);
    obj.objective = { default: defObj, override: ovObj, active: ovObj || defObj };
    return obj;
}

// ── SOURCE-INSPECTOR-1: read-only "where does the scenario come from?" map ────
// Pure inspection — never writes, never parses DOCX, never runs the sim. Tells
// the operator which files build the scenario, what each controls, and how to
// change units (DOCX) vs phases (scenario.json) safely.
function fileStatus(p) {
    var info = statInfo(p);
    if (info.present) info.sha256 = sha256File(p);
    return info;
}
// Count distinct phases / RED+BLUE unit uids / objective in a GeoJSON output.
function countGeoFeatures(file) {
    try {
        var fc = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (!fc || !Array.isArray(fc.features)) return null;
        var phases = {}, red = {}, blue = {}, hasObj = false;
        for (var i = 0; i < fc.features.length; i++) {
            var p = (fc.features[i] && fc.features[i].properties) || {};
            if (Number.isInteger(p.phase)) phases[p.phase] = true;
            if (p.kind === 'objective') hasObj = true;
            if (p.kind === 'unit') { var uid = p.uid || p.unit_uid;
                if (uid && p.side === 'RED') red[uid] = true; if (uid && p.side === 'BLUE') blue[uid] = true; }
        }
        return { phases: Object.keys(phases).length, red_units: Object.keys(red).length,
                 blue_units: Object.keys(blue).length, objective: hasObj };
    } catch (_) { return null; }
}
// RED/BLUE counts from the DOCX-parsed OOB JSON (generated by WarGamingGEN).
function oobCounts(file) {
    try {
        var j = JSON.parse(fs.readFileSync(file, 'utf8'));
        return { red:  j && j.red  && Array.isArray(j.red.units)  ? j.red.units.length  : null,
                 blue: j && j.blue && Array.isArray(j.blue.units) ? j.blue.units.length : null };
    } catch (_) { return { red: null, blue: null }; }
}
function listStep0(c) {
    var dir = path.join(c.testingAi, 'Step 0');
    try {
        var files = fs.readdirSync(dir).filter(function (n) { return /\.json$/i.test(n) && !n.startsWith('._'); });
        return { dir: dir, present: true, count: files.length, files: files.sort() };
    } catch (_) { return { dir: dir, present: false, count: 0, files: [] }; }
}

function computeSources(c, ctx) {
    var runDir   = latestRunDir(c);
    var runId    = runDir ? path.basename(runDir) : null;
    var scenarioJsonPath = path.join(c.wgen, 'inputs', 'scenario.json');
    var oobPath  = path.join(c.forcesDir, 'current_oob_from_docx.json');
    var allPath  = runDir ? path.join(runDir, 'outputs', 'geojson', 'all_phases.geojson') : null;
    var redIn    = path.join(c.forcesDir, 'red_team.docx');
    var blueIn   = path.join(c.forcesDir, 'blue_team.docx');
    var redStg   = path.join(c.importFromRmooz, 'red_team.docx');
    var blueStg  = path.join(c.importFromRmooz, 'blue_team.docx');
    var ex       = latestExport(c);
    var fresh    = computeFreshness(c);
    var step0    = listStep0(c);
    var oob      = oobCounts(oobPath);

    // Active RMOOZ scenario record (read-only peek).
    var activeName = null, activeFile = null, activeInfo = { present: false }, activeMeta = null;
    try { activeName = ctx && ctx.scenarios && ctx.scenarios.getActiveName ? ctx.scenarios.getActiveName() : null; } catch (_) {}
    if (activeName) {
        activeFile = scenarioFilePath(activeName);
        activeInfo = statInfo(activeFile);
        if (activeInfo.present) { var sc = readJson(activeFile); if (sc) activeMeta = {
            source: sc.source || null, generation_status: sc.generation_status || null,
            steps: Array.isArray(sc.steps) ? sc.steps.length : null,
            source_run: sc.source_run || null, partial_import: !!sc.partial_import }; }
    }

    var T = phasesTotal(c);
    var sources = [
        { key: 'red_docx', file: 'red_team.docx', location: redIn,
          role: 'RED force source document', used_for: 'enemy/RED ORBAT — formations, units, capabilities',
          source_type: 'source input', editable: true,
          how_to_modify: 'Edit the DOCX, re-upload in the wizard, then Start (regenerate).',
          regen_needed: true, status: { input: fileStatus(redIn), staged: fileStatus(redStg) } },
        { key: 'blue_docx', file: 'blue_team.docx', location: blueIn,
          role: 'BLUE force source document', used_for: 'friendly/BLUE ORBAT — units, defenses, reserves',
          source_type: 'source input', editable: true,
          how_to_modify: 'Edit the DOCX, re-upload in the wizard, then Start (regenerate).',
          regen_needed: true, status: { input: fileStatus(blueIn), staged: fileStatus(blueStg) } },
        { key: 'scenario_json', file: 'scenario.json', location: scenarioJsonPath,
          role: 'scenario plan / phase list', used_for: 'phase count, phase names, timeline, objective',
          source_type: 'advanced input', editable: true, editable_note: 'advanced — edit carefully',
          how_to_modify: 'Edit scenario.json, then rerun generation. phases.length sets the phase count.',
          regen_needed: true, status: Object.assign(fileStatus(scenarioJsonPath), { phases_total: T }) },
        { key: 'scenario_overrides', file: 'scenario_overrides.json', location: path.join(c.wgen, 'inputs', 'scenario_overrides.json'),
          role: 'operator-controlled scenario modifications (PREGEN-CONTROL-2)',
          used_for: 'Objective X position override before generation',
          source_type: 'operator override', editable: true,
          how_to_modify: 'Set via RMOOZ "Scenario Setup" wizard (saves automatically).',
          regen_needed: true,
          status: Object.assign(
              readObjectiveOverride(c) ? fileStatus(path.join(c.wgen, 'inputs', 'scenario_overrides.json')) : { present: false },
              { override: readObjectiveOverride(c) }) },
        { key: 'step0', file: 'Step 0/*.json', location: step0.dir,
          role: 'planning context (MDMP: warning order, staff brief, planning guide)',
          used_for: 'context only — NOT the current phase source (per STEP0-DISCOVERY-1)',
          source_type: 'planning context', editable: false, editable_note: 'advanced/context',
          how_to_modify: 'Edit only if WarGamingGEN’s input contract consumes it; today it does not drive phases.',
          regen_needed: 'only if wired as a generator input', status: step0 },
        { key: 'oob', file: 'current_oob_from_docx.json', location: oobPath,
          role: 'parsed OOB from DOCX (generated by WarGamingGEN)',
          used_for: 'pre-generation RED/BLUE unit estimates', source_type: 'generated intermediate',
          editable: false, how_to_modify: 'Do not edit. Change the DOCX and regenerate the OOB/run.',
          regen_needed: true, status: Object.assign(fileStatus(oobPath), { red_units: oob.red, blue_units: oob.blue }) },
        { key: 'checkpoints', file: 'checkpoints/phaseNN.json',
          location: runDir ? path.join(runDir, 'checkpoints') : path.join(c.runsDir, '<run_id>', 'checkpoints'),
          role: 'per-phase generated state', used_for: 'progress, resume, partial import, regenerate',
          source_type: 'runtime checkpoint', editable: false,
          how_to_modify: 'Do not edit manually; Continue or Restart the run.',
          regen_needed: 'no for resume; yes for final outputs if partial',
          status: { run_id: runId, phases_done: countCheckpoints(runDir), phases_total: T } },
        { key: 'all_phases', file: 'all_phases.geojson', location: allPath || '(no run yet)',
          role: 'final map-ready GeoJSON (generated output)', used_for: 'publish + import into RMOOZ',
          source_type: 'final output', editable: false,
          how_to_modify: 'Do not edit. Change source files and rerun generation.',
          regen_needed: 'no if current; yes if sources changed',
          status: Object.assign(allPath ? fileStatus(allPath) : { present: false },
              { features: (allPath && exists(allPath)) ? countGeoFeatures(allPath) : null }) },
        { key: 'export', file: 'export_to_rmooz/<run_id>/', location: c.exportToRmooz,
          role: 'published handoff folder (generated)', used_for: 'RMOOZ import',
          source_type: 'published output', editable: false, how_to_modify: 'Publish the latest run again.',
          regen_needed: 'publish when stale',
          status: { run_id: ex ? ex.run_id : null, all_phases_present: ex ? ex.all_phases_present : false,
                    stale: !!fresh.stale, reason: fresh.reason } },
        { key: 'rmooz_scenario', file: 'data/scenarios/<scenario>.json',
          location: activeFile || path.join(SCENARIOS_DIR, '<scenario>.json'),
          role: 'imported RMOOZ scenario record', used_for: 'workspace / map / live scenario',
          source_type: 'RMOOZ database record', editable: false, editable_note: 'via RMOOZ editor only',
          how_to_modify: 'Use the RMOOZ scenario editor, or regenerate + reimport as a new version.',
          regen_needed: false, status: { active_name: activeName, present: activeInfo.present, meta: activeMeta } },
    ];

    return {
        ok: true, run_id: runId,
        paths: { testingAi: c.testingAi, wgen: c.wgen, forces: c.forcesDir,
                 runs: c.runsDir, export: c.exportToRmooz, scenarios: SCENARIOS_DIR },
        legend: { 'source input': 'editable file you provide', 'advanced input': 'editable, advanced',
                  'generated intermediate': 'produced by the pipeline; do not edit',
                  'runtime checkpoint': 'per-phase run state; do not edit',
                  'final output': 'generated GeoJSON; output, not source',
                  'published output': 'handoff copy for import', 'planning context': 'reference only',
                  'RMOOZ database record': 'edit via the RMOOZ editor' },
        sources: sources,
    };
}

// ── PREGEN-CONTROL-2: Objective X override (operator-controlled placement before generation) ──
function getDefaultObjective(c) {
    // Read current/default objective from scenario.json if present.
    var scenarioPath = path.join(c.wgen, 'inputs', 'scenario.json');
    try {
        var scenario = JSON.parse(fs.readFileSync(scenarioPath, 'utf8'));
        return scenario.objective || null;
    } catch (_) { return null; }
}
function readObjectiveOverride(c) {
    // Read the operator objective override if present. WarGamingGEN reads the
    // canonical plural name (scenario_overrides.json); also accept the singular
    // scenario_override.json an operator might hand-create. Plural wins.
    var dir = path.join(c.wgen, 'inputs');
    var candidates = [path.join(dir, 'scenario_overrides.json'), path.join(dir, 'scenario_override.json')];
    for (var i = 0; i < candidates.length; i++) {
        try {
            var data = JSON.parse(fs.readFileSync(candidates[i], 'utf8'));
            if (data && typeof data === 'object' && data.objective) return data.objective;
        } catch (_) { /* try next */ }
    }
    return null;
}
function writeObjectiveOverride(c, obj) {
    // Write scenario_overrides.json with the operator-selected objective.
    // obj = { id, lon, lat, name_ar, name_en, ... }
    if (!obj || typeof obj !== 'object') return false;
    // Validate required + types
    if (typeof obj.lon !== 'number' || obj.lon < -180 || obj.lon > 180) return false;
    if (typeof obj.lat !== 'number' || obj.lat < -90 || obj.lat > 90) return false;
    if (!obj.id || typeof obj.id !== 'string') return false;
    var overridePath = path.join(c.wgen, 'inputs', 'scenario_overrides.json');
    try {
        var override = {
            schema_version: 'rmooz-operator-overrides-1.0',
            created_by: 'RMOOZ',
            created_at: new Date().toISOString(),
            objective: { id: obj.id, lon: obj.lon, lat: obj.lat }
        };
        if (obj.name_ar) override.objective.name_ar = obj.name_ar;
        if (obj.name_en) override.objective.name_en = obj.name_en;
        if (typeof obj.depth_km_from_coast === 'number') override.objective.depth_km_from_coast = obj.depth_km_from_coast;
        fs.writeFileSync(overridePath, JSON.stringify(override, null, 2), 'utf8');
        return true;
    } catch (_) { return false; }
}

// ── SCENARIO-AUTOGEN-1: guarantee inputs/scenario.json exists with a valid objective ──
// WarGamingGEN (tests/test_full_run.py) loads inputs/scenario.json and reads
// scenario.objective.lon/.lat; the objective-override route reads the same file.
// RMOOZ never created it, so a fresh container failed with:
//   - "no default objective found in scenario.json"  (Save Objective Position)
//   - FileNotFoundError: scenario file not found      (WarGamingGEN run)
// These helpers make generation self-sufficient — no manual file injection.
function scenarioJsonPathOf(c) { return path.join(c.wgen, 'inputs', 'scenario.json'); }

function isValidScenarioObjective(o) {
    return !!(o && typeof o === 'object' && o.id && typeof o.id === 'string' &&
              typeof o.lon === 'number' && isFinite(o.lon) &&
              typeof o.lat === 'number' && isFinite(o.lat));
}

// Minimal but schema-valid Scenario (matches WarGamingGEN scenario_parser.py).
// Fallback only — used when the canonical Python sample can't be written.
function buildMinimalScenario(lon, lat) {
    var L = (typeof lon === 'number' && isFinite(lon)) ? lon : 32.89;
    var T = (typeof lat === 'number' && isFinite(lat)) ? lat : 34.76;
    return {
        operation_name: 'RMOOZ Auto Scenario',
        bbox_wgs84: [L - 0.6, T - 0.6, L + 0.6, T + 0.6],
        coast_lat_approx: T + 0.5,
        objective: { id: 'OBJ-X', name_ar: 'الهدف X', name_en: 'Objective X',
                     lon: L, lat: T, depth_km_from_coast: 50.0, carver_total: 40 },
        d_day_iso: '2026-05-20T00:00:00Z',
        phases: [
            { step: 0, time_label: 'D-7',   phase_name_ar: 'تمهيد',          phase_name_en: 'Shaping',          kind: 'shaping',                  phase_line_km: 0.0 },
            { step: 1, time_label: 'D-H',   phase_name_ar: 'الضربة والإنزال', phase_name_en: 'H-hour strike',    kind: 'h_hour_strike',            phase_line_km: 1.5 },
            { step: 2, time_label: 'D+12h', phase_name_ar: 'رأس الجسر',       phase_name_en: 'Beachhead',        kind: 'beachhead_consolidation',  phase_line_km: 8.5 },
            { step: 3, time_label: 'D+144h',phase_name_ar: 'الحسم النهائي',   phase_name_en: 'Final resolution', kind: 'final_resolution',         phase_line_km: 95.0 }
        ],
        off_map_markers: [],
        attack_ratio_decisive: 3.0, attack_ratio_contested: 1.5, prepared_defense_mult: 1.5
    };
}

// Prefer the canonical 17-phase Libya sample via the EXISTING Python writer (zero
// drift; the DOCX force lay-down is authored around it). Returns true on success.
function writeCanonicalScenarioViaPython(c) {
    try {
        var r = spawnSync(c.python, ['-c',
            'from src.parsers.scenario_parser import write_libya_sample;' +
            'from pathlib import Path;' +
            'write_libya_sample(Path("inputs/scenario.json"))'
        ], { cwd: c.wgen, timeout: 60000, encoding: 'utf8' });
        if (r && r.status === 0) {
            var sc = readJson(scenarioJsonPathOf(c));
            return isValidScenarioObjective(sc && sc.objective);
        }
    } catch (_) { /* fall through to Node fallback */ }
    return false;
}

// Guarantee scenario.json exists + has a valid objective.
// Returns { scenario, created, source }. Never throws on the happy path.
function ensureScenarioJson(c, opts) {
    opts = opts || {};
    var p = scenarioJsonPathOf(c);
    var existing = readJson(p);
    // 1) Already valid → preserve untouched (never overwrite operator/demo data).
    if (existing && isValidScenarioObjective(existing.objective)) {
        return { scenario: existing, created: false, source: 'existing' };
    }
    // 2) Structurally usable but missing/invalid objective → inject one, keep the rest.
    if (existing && Array.isArray(existing.phases) && existing.phases.length >= 1 &&
        Array.isArray(existing.bbox_wgs84) && existing.bbox_wgs84.length === 4) {
        var fallbackObj = buildMinimalScenario(opts.lon, opts.lat).objective;
        var cur = (existing.objective && typeof existing.objective === 'object') ? existing.objective : {};
        existing.objective = {
            id: cur.id || fallbackObj.id,
            name_ar: cur.name_ar || fallbackObj.name_ar,
            name_en: cur.name_en || fallbackObj.name_en,
            lon: isFinite(cur.lon) ? cur.lon : fallbackObj.lon,
            lat: isFinite(cur.lat) ? cur.lat : fallbackObj.lat
        };
        if (isFinite(cur.depth_km_from_coast)) existing.objective.depth_km_from_coast = cur.depth_km_from_coast;
        if (Number.isInteger(cur.carver_total)) existing.objective.carver_total = cur.carver_total;
        try { mkdirp(path.dirname(p)); fs.writeFileSync(p, JSON.stringify(existing, null, 2), 'utf8'); } catch (_) {}
        return { scenario: existing, created: true, source: 'objective_injected' };
    }
    // 3) Missing/unusable → prefer the canonical Python sample, else Node minimal.
    mkdirp(path.dirname(p));
    if (writeCanonicalScenarioViaPython(c)) {
        return { scenario: readJson(p), created: true, source: 'python_canonical' };
    }
    var min = buildMinimalScenario(opts.lon, opts.lat);
    try { fs.writeFileSync(p, JSON.stringify(min, null, 2), 'utf8'); } catch (_) {}
    return { scenario: min, created: true, source: 'node_minimal' };
}

// If an operator hand-created the SINGULAR scenario_override.json but not the
// canonical plural scenario_overrides.json (the only name WarGamingGEN reads),
// mirror it to the plural so the Python pipeline picks it up. Never overwrites.
function normalizeOverrideFile(c) {
    var dir = path.join(c.wgen, 'inputs');
    var plural = path.join(dir, 'scenario_overrides.json');
    var singular = path.join(dir, 'scenario_override.json');
    try {
        if (!exists(plural) && exists(singular)) {
            mkdirp(dir);
            fs.copyFileSync(singular, plural);
            return 'mirrored_singular_to_plural';
        }
    } catch (_) {}
    return null;
}

// ── WIZARD-FINGERPRINT-1: tie a stopped run to the setup that produced it ─────
// A stopped/partial run must only be offered for Continue / Partial-Import when
// the CURRENT staged setup (red+blue DOCX content + active objective) matches the
// setup the run was launched with. Otherwise the wizard would mix an old stopped
// run into a brand-new scenario setup. We fingerprint by DOCX content hash (the
// raw bytes staged into inputs/forces) + the active objective, persisted as
// runs/<runId>/run-meta.json at launch. Runs without a meta file (older runs,
// pre-feature) are treated as NON-matching — conservative by design.
function hashFile(p) {
    try { return crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex'); }
    catch (_) { return null; }
}
function round4(n) { return (typeof n === 'number' && isFinite(n)) ? Math.round(n * 1e4) / 1e4 : null; }

// The setup currently staged on disk (what the next run would use).
function currentSetupFingerprint(c) {
    var act = readObjectiveOverride(c) || getDefaultObjective(c) || {};
    return {
        red_hash:  hashFile(path.join(c.forcesDir, SLOT_FILE.red)),
        blue_hash: hashFile(path.join(c.forcesDir, SLOT_FILE.blue)),
        objective_lon: round4(act.lon),
        objective_lat: round4(act.lat),
    };
}

// Does the current staged setup match the fingerprint a stopped run was made
// with? Missing/partial metadata or any hash/objective mismatch → false.
function setupMatchesRun(c, runDir) {
    var meta = runDir ? readJson(path.join(runDir, 'run-meta.json')) : null;
    if (!meta || !meta.red_hash || !meta.blue_hash) return { matches: false, meta: meta || null };
    var cur = currentSetupFingerprint(c);
    var matches = meta.red_hash === cur.red_hash &&
                  meta.blue_hash === cur.blue_hash &&
                  meta.objective_lon === cur.objective_lon &&
                  meta.objective_lat === cur.objective_lat;
    return { matches: matches, meta: meta };
}

// Persist run-meta.json once the spawned process has created its own run dir.
// Fresh runs only — a resume continues an existing run and keeps its meta.
function persistRunMetaWhenReady(c, baselineRun, fingerprint, requestedName, attempt) {
    attempt = attempt || 0;
    var d = latestRunDir(c);
    var runId = d ? path.basename(d) : null;
    if (runId && runId !== baselineRun) {
        try {
            if (!exists(path.join(d, 'run-meta.json'))) {
                var meta = {
                    runId: runId,
                    requestedName: requestedName || null,
                    red_hash: fingerprint.red_hash,
                    blue_hash: fingerprint.blue_hash,
                    objective_lon: fingerprint.objective_lon,
                    objective_lat: fingerprint.objective_lat,
                    createdAt: new Date().toISOString(),
                };
                fs.writeFileSync(path.join(d, 'run-meta.json'), JSON.stringify(meta, null, 2), 'utf8');
            }
        } catch (_) {}
        return;
    }
    if (attempt < 90) setTimeout(function () {
        persistRunMetaWhenReady(c, baselineRun, fingerprint, requestedName, attempt + 1);
    }, 1000);
}

// ── FAST-DOC-2: read-only freshness audit ────────────────────────────────────
// Pure inspection — NEVER deletes or writes anything (RC-1 runs/latest is left
// intact by design). Surfaces enough for the UI to warn before a stale import.
function statInfo(p) {
    try { var st = fs.statSync(p); return { present: true, size: st.size, mtime_ms: st.mtimeMs, mtime: new Date(st.mtimeMs).toISOString() }; }
    catch (_) { return { present: false }; }
}
function sha256File(p) {
    try { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); } catch (_) { return null; }
}
function readLatestTxt(c) {
    try { var t = fs.readFileSync(path.join(c.runsDir, 'latest.txt'), 'utf8').trim(); return t || null; } catch (_) { return null; }
}
// RC-1: on Windows `runs/latest` is often a STALE real directory (the symlink
// can't be created). Detect it (real dir vs symlink) but never touch it.
function runsLatestInfo(c) {
    var rl = path.join(c.runsDir, 'latest');
    var info = { exists: false, is_symlink: false, is_real_dir: false, all_phases: { present: false } };
    try {
        var ls = fs.lstatSync(rl);
        info.exists = true;
        info.is_symlink = ls.isSymbolicLink();
        info.is_real_dir = ls.isDirectory() && !info.is_symlink;
        info.all_phases = statInfo(path.join(rl, 'outputs', 'geojson', 'all_phases.geojson'));
    } catch (_) {}
    return info;
}
function computeFreshness(c) {
    var latestTxt    = readLatestTxt(c);
    var newestRun    = latestRunDir(c);                       // newest runs/<ts> by name
    var newestRunName = newestRun ? path.basename(newestRun) : null;
    var newestAll    = newestRun ? statInfo(path.join(newestRun, 'outputs', 'geojson', 'all_phases.geojson')) : { present: false };
    var ex           = latestExport(c);
    var exAll        = (ex && ex.all_phases_present) ? statInfo(ex.all_phases) : { present: false };
    var runsLatest   = runsLatestInfo(c);

    var noExport = !(ex && ex.all_phases_present);
    var exportBehind = false, reason = null;
    // The published export points at an OLDER run than the newest one available.
    if (!noExport && newestRunName && ex.run_id !== newestRunName) {
        exportBehind = true;
        reason = 'Published export (' + ex.run_id + ') is older than the newest run (' + newestRunName + '). Click "Publish latest run" before Import.';
    }
    // Belt-and-suspenders: published file older than the newest run output (>1s).
    if (!noExport && newestAll.present && exAll.present && (exAll.mtime_ms + 1000) < newestAll.mtime_ms) {
        exportBehind = true;
        reason = reason || 'Published export file is older than the newest run output. Publish before Import.';
    }
    if (runsLatest.is_real_dir) {
        runsLatest.note = 'runs/latest is a REAL directory (cannot symlink on Windows). Use latest.txt instead. This build does NOT delete it.';
    }
    runsLatest.stale_dir_warning = !!(runsLatest.is_real_dir && newestAll.present &&
        runsLatest.all_phases.present && (runsLatest.all_phases.mtime_ms + 1000) < newestAll.mtime_ms);

    var stale = noExport || exportBehind;
    return {
        stale: stale,
        no_export: noExport,
        export_behind: exportBehind,
        reason: noExport ? 'No published export yet — Run WarGamingGEN, then click "Publish latest run".' : reason,
        prefer: 'latest.txt',                                 // status display preference (not runs/latest)
        latest_txt: { present: !!latestTxt, target: latestTxt },
        newest_run: { name: newestRunName, all_phases: newestAll },
        export: { run_id: ex ? ex.run_id : null, all_phases: exAll, sha256: exAll.present ? sha256File(ex.all_phases) : null },
        runs_latest: runsLatest,
    };
}

// ── main router ─────────────────────────────────────────────────────────────
function handle(req, res, ctx) {
    const { url, pathname, method, sendJson } = ctx;
    if (!pathname.startsWith('/api/wargame-sim/')) return false;
    const c = cfg();

    // ── status ──
    if (pathname === '/api/wargame-sim/status' && method === 'GET') {
        var ex = latestExport(c);
        sendJson(res, 200, {
            ok: true,
            docs: { red: exists(path.join(c.importFromRmooz, SLOT_FILE.red)),
                    blue: exists(path.join(c.importFromRmooz, SLOT_FILE.blue)) },
            export: ex ? { run_id: ex.run_id, all_phases: ex.all_phases_present, report: ex.report, schedule: ex.schedule }
                       : { run_id: null, all_phases: false, report: false, schedule: false },
            sim: simPayload(c),                         // UNIFIED-IMPORT-2/3: real phase progress + cancel state
            runEnabled: c.allowRun,
            paths: { import_from_rmooz: c.importFromRmooz, export_to_rmooz: c.exportToRmooz, forces: c.forcesDir, runs: c.runsDir },
            commands: manualCommands(c),
            freshness: computeFreshness(c),               // FAST-DOC-2: stale-source visibility
        });
        return true;
    }

    // ── SOURCE-INSPECTOR-1: read-only source-chain map (no writes, no sim, no DOCX parse) ──
    if (pathname === '/api/wargame-sim/sources' && method === 'GET') {
        sendJson(res, 200, computeSources(c, ctx));
        return true;
    }

    // ── stage a docx (raw body) ──
    if (pathname === '/api/wargame-sim/stage-doc' && method === 'POST') {
        const slot = (url.searchParams.get('slot') || '').toLowerCase();
        if (!SLOT_FILE[slot]) { sendJson(res, 400, { ok: false, error: 'slot must be red|blue' }); return true; }
        const chunks = []; let size = 0; const MAX = 20_000_000;
        req.on('data', (d) => { size += d.length; if (size <= MAX) chunks.push(d); });
        req.on('error', () => sendJson(res, 400, { ok: false, error: 'upload error' }));
        req.on('end', () => {
            if (size > MAX) { sendJson(res, 413, { ok: false, error: 'file too large' }); return; }
            const buf = Buffer.concat(chunks);
            if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4B) {
                sendJson(res, 400, { ok: false, error: 'not a .docx (ZIP/PK signature missing)' }); return;
            }
            try {
                mkdirp(c.importFromRmooz);
                fs.writeFileSync(path.join(c.importFromRmooz, SLOT_FILE[slot]), buf);
                let placed = false;
                if (exists(c.forcesDir)) {
                    const dest = path.join(c.forcesDir, SLOT_FILE[slot]);
                    try { if (exists(dest)) fs.copyFileSync(dest, dest + '.bak'); fs.writeFileSync(dest, buf); placed = true; } catch (_) {}
                }
                sendJson(res, 200, { ok: true, slot, file: SLOT_FILE[slot], bytes: buf.length, placed_in_forces: placed });
            } catch (e) { sendJson(res, 500, { ok: false, error: e.message }); }
        });
        return true;
    }

    // ── run the REAL WarGamingGEN simulation on the staged DOCX ──
    if (pathname === '/api/wargame-sim/run' && method === 'POST') {
        if (!c.allowRun) {
            sendJson(res, 200, { ok: false, manual: true,
                reason: 'Local simulation run is disabled (set RMOOZ_ALLOW_SIM_RUN=1 to enable).',
                commands: manualCommands(c) });
            return true;
        }
        if (simState.running) { sendJson(res, 200, { ok: true, already_running: true, sim: simState }); return true; }
        // UNIFIED-IMPORT-2: resume=1 continues the latest run from its checkpoints.
        const resume = url.searchParams.get('resume') === '1';
        // Force a working local config: local model for text calls, deterministic
        // schema fallback for structured commander/adjudicator calls. Small local
        // models often hang or emit malformed JSON on those long schema prompts;
        // fallback keeps generation moving without inventing combat effects.
        // OFFLINE-GEN-RUN-FIX-1: map RMOOZ_AI_* / Ollama → LLM_* and pass to the
        // Python child so it uses the operator LLM endpoint, NOT localhost:11434.
        const _llm = buildLlmChildEnv(c, process.env);
        const env = _llm.env;
        // SAFE log line — never prints the key value.
        console.log('[wargame-sim] LLM child env: provider=' + _llm.summary.provider +
            ' baseUrl=' + (_llm.summary.baseUrl || '(none)') +
            ' model=' + (_llm.summary.model || '(none)') +
            ' apiKeyConfigured=' + _llm.summary.apiKeyConfigured +
            ' caCertConfigured=' + _llm.summary.caCertConfigured +
            ' mtlsConfigured=' + _llm.summary.mtlsConfigured +
            ' clientCertConfigured=' + _llm.summary.clientCertConfigured +
            ' clientKeyConfigured=' + _llm.summary.clientKeyConfigured +
            ' localForceFallback=' + _llm.summary.localForceFallback);
        // Run-id gating (Part A): remember the newest run that EXISTS right now.
        // While the spawned process hasn't created its own run dir yet, the
        // newest-on-disk run is this baseline (a previous, possibly complete
        // run) — computeSimProgress must NOT report its phases_done as the new
        // run's progress (that caused the "17 then 0" flash). For a resume we
        // keep counting the baseline (we're continuing it), so no gating.
        const baselineRun = resume ? null : (function () { const d = latestRunDir(c); return d ? path.basename(d) : null; })();
        // SCENARIO-AUTOGEN-1: WarGamingGEN requires inputs/scenario.json. Create it
        // (and mirror any singular override file) BEFORE Python starts, so a fresh
        // container never dies with FileNotFoundError. Existing scenarios untouched.
        try {
            normalizeOverrideFile(c);
            const ens = ensureScenarioJson(c);
            if (!ens || !isValidScenarioObjective(ens.scenario && ens.scenario.objective)) {
                sendJson(res, 500, { ok: false, error: 'could not prepare inputs/scenario.json for generation' });
                return true;
            }
            if (ens.created) console.log('[wargame-sim] scenario.json prepared before run (source=' + ens.source + ')');
        } catch (e) {
            sendJson(res, 500, { ok: false, error: 'scenario.json preparation failed: ' + e.message });
            return true;
        }
        let child;
        try {
            child = spawn(c.python, runArgs(resume), { cwd: c.wgen, env: env });
        } catch (e) { sendJson(res, 500, { ok: false, error: 'spawn failed: ' + e.message }); return true; }
        // WIZARD-FINGERPRINT-1: snapshot the staged setup and persist run-meta.json
        // into the new run dir once it appears, so a later "stopped run" can be
        // matched to (and only offered for) the setup that produced it. Fresh runs
        // only — a resume continues an existing run and keeps its original meta.
        if (!resume) {
            const fp = currentSetupFingerprint(c);
            const reqName = (url.searchParams.get('name') || '').trim() || null;
            persistRunMetaWhenReady(c, baselineRun, fp, reqName, 0);
        }
        simState = {
            running: true, runName: null, startedAt: new Date().toISOString(),
            finishedAt: null, exitCode: null, error: null, published: null,
            cancelled: false, message: null, baselineRun: baselineRun,
        };
        activeChild = child;
        let errTail = '';
        if (child.stderr) child.stderr.on('data', (d) => { errTail = (errTail + d.toString()).slice(-1000); });
        child.on('error', (e) => {
            simState.running = false;
            simState.error = 'spawn error: ' + e.message;
            simState.finishedAt = new Date().toISOString();
            if (activeChild === child) activeChild = null;
        });
        child.on('close', (code) => {
            simState.running = false; simState.exitCode = code; simState.finishedAt = new Date().toISOString();
            if (activeChild === child) activeChild = null;
            if (simState.cancelled) {
                simState.error = null;
                simState.published = null;
                simState.message = 'Generation stopped by operator.';
                return;
            }
            if (code === 0) {
                const pub = publishRunToExport(c, latestRunDir(c), ['red_team.docx', 'blue_team.docx']);
                simState.published = pub.ok ? pub.run_id : null;
                simState.runName = pub.ok ? pub.run_id : simState.runName;
                if (!pub.ok) simState.error = 'publish: ' + pub.error;
            } else {
                // OFFLINE-LITELLM-CERT-TIMEOUT-1: classify the error for operators.
                const rawErr = redactSecrets(errTail);
                const timeoutMs = (process.env.RMOOZ_AI_TIMEOUT_MS || '300000').trim();
                let classifiedError = 'sim exited ' + code + (rawErr ? ' — ' + rawErr.slice(-400) : '');
                let errorCode = 'unknown';
                if (/APITimeoutError|Request timed out|timeout/i.test(rawErr)) {
                    errorCode = 'timeout';
                    classifiedError =
                        'LiteLLM request timed out after ' + timeoutMs + ' ms. ' +
                        'The model "' + (_llm.summary.model || process.env.RMOOZ_AI_MODEL || '?') + '" may be slow. ' +
                        'Try a faster model or increase RMOOZ_AI_TIMEOUT_MS (currently ' + timeoutMs + ' ms). ' +
                        'stderr: ' + rawErr.slice(-300);
                } else if (/certificate required|alert certificate required|tlsv13 alert certificate required|peer did not return a certificate|SSL_ERROR_WANT_CLIENT_CERT|client certificate (?:is )?required/i.test(rawErr)) {
                    // mTLS: the server is asking RMOOZ to present a client cert.
                    errorCode = 'mtls_client_cert_required';
                    classifiedError =
                        'LiteLLM appears to require a client certificate. Configure ' +
                        'RMOOZ_AI_CLIENT_CERT_PATH and RMOOZ_AI_CLIENT_KEY_PATH if mTLS is required. ' +
                        'stderr: ' + rawErr.slice(-300);
                } else if (/unknown ca|certificate verify failed|unable to get local issuer|self.signed|self-signed|UNABLE_TO_VERIFY/i.test(rawErr)) {
                    // Server cert not trusted — CA chain problem (one-way TLS).
                    errorCode = 'tls_ca_trust_failed';
                    classifiedError =
                        'TLS CA trust failed — the LiteLLM server certificate is not trusted. ' +
                        'Mount the internal CA chain and set RMOOZ_AI_CA_CERT_PATH=/app/certs/tawasol-ca.crt. ' +
                        'stderr: ' + rawErr.slice(-300);
                } else if (/handshake failure|bad certificate|sslv3 alert|alert handshake|decryption failed|wrong version number|tlsv1 alert/i.test(rawErr)) {
                    errorCode = 'tls_handshake_failed';
                    classifiedError =
                        'TLS handshake failed with the LiteLLM endpoint. If the server requires mTLS, ' +
                        'configure RMOOZ_AI_CLIENT_CERT_PATH and RMOOZ_AI_CLIENT_KEY_PATH; otherwise verify ' +
                        'the CA chain (RMOOZ_AI_CA_CERT_PATH). stderr: ' + rawErr.slice(-300);
                } else if (/SSL|certificate|CERTIFICATE|ssl_cert|self.signed|tlsv1|CERT_/i.test(rawErr)) {
                    errorCode = 'tls_cert';
                    classifiedError =
                        'TLS/certificate error reaching the LiteLLM endpoint. ' +
                        'Mount the internal CA certificate and set RMOOZ_AI_CA_CERT_PATH. ' +
                        'stderr: ' + rawErr.slice(-300);
                } else if (/401|Unauthorized|unauthorized/i.test(rawErr)) {
                    errorCode = 'auth_401';
                    classifiedError = 'LiteLLM returned 401 Unauthorized — check RMOOZ_AI_API_KEY.';
                } else if (/403|Forbidden|forbidden/i.test(rawErr)) {
                    errorCode = 'auth_403';
                    classifiedError = 'LiteLLM returned 403 Forbidden — key may lack generation permissions.';
                } else if (/404|Not Found|NotFoundError/i.test(rawErr)) {
                    errorCode = 'not_found_404';
                    classifiedError =
                        'LiteLLM returned 404 — check RMOOZ_AI_BASE_URL and RMOOZ_AI_MODEL. ' +
                        'Model "' + (process.env.RMOOZ_AI_MODEL || '?') + '" may not exist at this endpoint.';
                } else if (/Name or service not known|Temporary failure in name resolution|nodename nor servname|getaddrinfo|EAI_AGAIN|\[Errno -2\]|\[Errno -3\]/i.test(rawErr)) {
                    // DNS must be checked BEFORE the generic APIConnectionError — the
                    // OpenAI SDK wraps DNS failures in APIConnectionError("Connection error.").
                    errorCode = 'dns_failure';
                    classifiedError =
                        'DNS resolution failed inside the container for the LiteLLM host (' + (process.env.RMOOZ_AI_BASE_URL || '?') + '). ' +
                        'The host may resolve it but the container does not. Run the diagnostic: ' +
                        'docker exec rmooz-offline /opt/rmooz-venv/bin/python /app/server/diag-litellm.py — ' +
                        'then use the host-networking compose or add the LiteLLM IP via extra_hosts. stderr: ' + rawErr.slice(-300);
                } else if (/Connection refused|ECONNREFUSED|\[Errno 111\]/i.test(rawErr)) {
                    errorCode = 'connection_refused';
                    classifiedError =
                        'Connection REFUSED by the LiteLLM endpoint (' + (process.env.RMOOZ_AI_BASE_URL || '?') + '). ' +
                        'A host answered with RST — wrong port, or a proxy/firewall actively refusing. stderr: ' + rawErr.slice(-300);
                } else if (/No route to host|Network is unreachable|\[Errno 113\]|\[Errno 101\]/i.test(rawErr)) {
                    errorCode = 'network_unreachable';
                    classifiedError =
                        'No route from the container to the LiteLLM host (' + (process.env.RMOOZ_AI_BASE_URL || '?') + '). ' +
                        'The host can reach it but the container bridge network cannot (route/VPN). ' +
                        'Use the host-networking compose (docker-compose.hostnet.offline.yml). stderr: ' + rawErr.slice(-300);
                } else if (/ConnectTimeout|Connection timed out|\[Errno 110\]/i.test(rawErr)) {
                    errorCode = 'connect_timeout';
                    classifiedError =
                        'TCP connect to the LiteLLM host timed out (' + (process.env.RMOOZ_AI_BASE_URL || '?') + '). ' +
                        'Likely a route/firewall drop from the container. Run diag-litellm.py; consider host networking. stderr: ' + rawErr.slice(-300);
                } else if (/APIConnectionError|Connection error|httpx\.ConnectError|ConnectError/i.test(rawErr)) {
                    // Generic connection failure — the SDK could not establish the HTTP
                    // connection but did not surface a more specific cause. Do NOT claim
                    // "refused"; point the operator at the layered diagnostic.
                    errorCode = 'connection_error';
                    classifiedError =
                        'Could not connect to the LiteLLM endpoint (' + (process.env.RMOOZ_AI_BASE_URL || '?') + ') from inside the container. ' +
                        'The host may reach it while the container cannot (DNS/route/VPN). ' +
                        'Run: docker exec rmooz-offline /opt/rmooz-venv/bin/python /app/server/diag-litellm.py to pinpoint the failing layer, ' +
                        'then use the host-networking compose if the container has no route. stderr: ' + rawErr.slice(-300);
                }
                simState.error     = classifiedError;
                simState.errorCode = errorCode;
                // OFFLINE-GEN-RUN-FIX-1: persist the full (redacted) stderr to the
                // run folder so the operator can see WHY generation failed.
                try {
                    var failDir = latestRunDir(c);
                    if (failDir) {
                        var logBody =
                            '# WarGamingGEN generation error\n' +
                            'exit_code:    ' + code + '\n' +
                            'error_code:   ' + errorCode + '\n' +
                            'finished_at:  ' + simState.finishedAt + '\n' +
                            'run_dir:      ' + failDir + '\n' +
                            'model:        ' + (process.env.RMOOZ_AI_MODEL || '?') + '\n' +
                            'provider:     ' + (process.env.RMOOZ_AI_PROVIDER || 'ollama') + '\n' +
                            'timeout_ms:   ' + timeoutMs + '\n' +
                            'ca_cert:      ' + (process.env.RMOOZ_AI_CA_CERT_PATH ? 'configured' : 'not configured') + '\n' +
                            'mtls:         ' + ((process.env.RMOOZ_AI_CLIENT_CERT_PATH && process.env.RMOOZ_AI_CLIENT_KEY_PATH) ? 'client cert+key configured' : 'not configured') + '\n' +
                            '\n--- classified error ---\n' +
                            classifiedError + '\n' +
                            '\n--- stderr (secrets redacted) ---\n' +
                            rawErr;
                        fs.writeFileSync(path.join(failDir, 'error.log'), logBody, 'utf8');
                        simState.errorLog = path.join(failDir, 'error.log');
                        simState.runName  = simState.runName || path.basename(failDir);
                    }
                } catch (_) { /* best-effort; never throw from close handler */ }
            }
        });
        sendJson(res, 200, { ok: true, started: true,
            note: 'Full WarGamingGEN run started on the staged DOCX (model ' + c.simModel + '). This takes a while; poll /status, then Import when sim.running is false and export.all_phases is true.',
            sim: simState });
        return true;
    }

    // ── UNIFIED-IMPORT-3: stop/cancel active generation (preserve checkpoints) ──
    if (pathname === '/api/wargame-sim/cancel' && method === 'POST') {
        if (!simState.running || !activeChild) {
            // No-op: nothing to stop. Return 200 with safe status so the UI
            // can treat a double-press gracefully without showing an error.
            sendJson(res, 200, Object.assign({
                ok: true,
                cancelled: false,
                no_active_run: true,
                message: 'No active generation — nothing to stop.',
            }, computeSimProgress(c, simState)));
            return true;
        }

        const child = activeChild;
        simState.cancelled = true;
        simState.error = null;
        simState.message = 'Cancellation requested by operator.';

        let replied = false;
        function reply(statusCode, extra) {
            if (replied) return;
            replied = true;
            const sim = simPayload(c);
            sendJson(res, statusCode, Object.assign({
                ok: true,
                cancelled: true,
                phases_done: sim.phases_done,
                phases_total: sim.phases_total,
                partial_available: sim.partial_available,
                partial_import_allowed: sim.partial_import_allowed,
                can_resume: sim.can_resume,
                sim: sim,
            }, extra || {}));
        }

        child.once('close', function () {
            reply(200);
        });
        const killIssued = terminateChildTree(child);
        if (!killIssued) {
            simState.cancelled = false;
            simState.message = null;
            replied = true;
            sendJson(res, 500, { ok: false, cancelled: false, error: 'failed to signal active WarGamingGEN process' });
            return true;
        }
        setTimeout(function () {
            reply(202, { cancel_pending: true });
        }, 2500).unref?.();
        return true;
    }

    // ── UNIFIED-IMPORT-2: regenerate outputs from checkpoints (NO LLM) ──
    // Replays a stopped run's checkpoints into outputs/geojson so a PARTIAL run
    // (checkpoints only, no geojson yet) becomes publishable + importable. Pure
    // parsers+writers — never calls the LLM, never parses DOCX, never touches the
    // retrieval index. Only the N phases actually generated are materialized.
    if (pathname === '/api/wargame-sim/regenerate' && method === 'POST') {
        if (!c.allowRun) {
            sendJson(res, 200, { ok: false, manual: true,
                reason: 'Regenerate is disabled (set RMOOZ_ALLOW_SIM_RUN=1 to enable).',
                command: 'cd "' + c.wgen + '" && ' + c.python + ' -m src.tools.regenerate_outputs' });
            return true;
        }
        const runName = (url.searchParams.get('run') || '').trim()
            || (function () { const d = latestRunDir(c); return d ? path.basename(d) : null; })();
        if (!runName) { sendJson(res, 404, { ok: false, error: 'no run to regenerate' }); return true; }
        const ckRunDir = path.join(c.runsDir, runName);
        if (countCheckpoints(ckRunDir) < 1) {
            sendJson(res, 400, { ok: false, error: 'run ' + runName + ' has no checkpoints to replay' });
            return true;
        }
        let rchild;
        try { rchild = spawn(c.python, regenArgs(runName), { cwd: c.wgen, env: process.env }); }   // NO LLM env
        catch (e) { sendJson(res, 500, { ok: false, error: 'spawn failed: ' + e.message }); return true; }
        let rErr = '';
        if (rchild.stderr) rchild.stderr.on('data', (d) => { rErr = (rErr + d.toString()).slice(-1000); });
        rchild.on('error', (e) => { sendJson(res, 500, { ok: false, error: 'regenerate spawn error: ' + e.message }); });
        rchild.on('close', (code) => {
            const outOk = exists(path.join(ckRunDir, 'outputs', 'geojson', 'all_phases.geojson'));
            if (code === 0 && outOk) {
                sendJson(res, 200, { ok: true, run_id: runName, regenerated: true, no_llm: true,
                    outputs_present: true, phases_done: countCheckpoints(ckRunDir) });
            } else {
                sendJson(res, 500, { ok: false, run_id: runName, outputs_present: outOk,
                    error: 'regenerate exited ' + code + (rErr ? ' — ' + rErr.slice(-300) : '') });
            }
        });
        return true;
    }

    // ── publish newest run → dated export folder (no sim) ──
    if (pathname === '/api/wargame-sim/publish' && method === 'POST') {
        const pub = publishRunToExport(c, latestRunDir(c), ['red_team.docx', 'blue_team.docx']);
        sendJson(res, pub.ok ? 200 : 400, pub);
        return true;
    }

    // ── import the latest dated export via the EXISTING porter ──
    if (pathname === '/api/wargame-sim/import' && method === 'POST') {
        const ex = latestExport(c);
        if (!ex || !ex.all_phases_present) {
            sendJson(res, 404, { ok: false, error: 'no published export found — run/publish first', commands: manualCommands(c) });
            return true;
        }
        // FAST-DOC-2 stale guard: refuse to import an export that is older than the
        // newest run (operator likely ran the sim but forgot to Publish). The
        // operator can override with ?confirm=1. Never auto-imports, never deletes.
        const fresh = computeFreshness(c);
        const confirmed = url.searchParams.get('confirm') === '1' || url.searchParams.get('force') === '1';
        if (fresh.export_behind && !confirmed) {
            sendJson(res, 409, {
                ok: false, stale: true, warning: fresh.reason, freshness: fresh,
                hint: 'A newer run exists than the published export. Click "Publish latest run" first, or re-POST with ?confirm=1 to import the older export anyway.',
            });
            return true;
        }
        let fc;
        try { fc = JSON.parse(fs.readFileSync(ex.all_phases, 'utf8')); }
        catch (e) { sendJson(res, 400, { ok: false, error: 'invalid geojson: ' + e.message }); return true; }

        // UNIFIED-IMPORT-2: partial import (a stopped run regenerated into < full phases).
        const partial = url.searchParams.get('partial') === '1';
        const total   = phasesTotal(c);

        // WIZARD-SAVE-1: explicit operator name vs auto-name; explicit Replace.
        const explicitName = !!url.searchParams.get('name');
        const overwrite    = url.searchParams.get('overwrite') === '1' || url.searchParams.get('replace') === '1';

        // Sanitize the requested/auto name EXACTLY ONCE.
        const rawName  = (url.searchParams.get('name') || (fc.properties && fc.properties.operation_name) || ('wargame-' + ex.run_id));
        const safeName = safeScenarioName(rawName);
        try {
            const scenario = PORTER.buildScenarioFromGeoJson(fc, { name: safeName });
            scenario.source = 'WarGamingGEN';
            scenario.input_docs = ['red_team.docx', 'blue_team.docx'];
            scenario.generated_from_docs = true;
            scenario.imported_from_geojson = true;
            scenario.source_file = 'all_phases.geojson';
            scenario.source_run = ex.run_id;                 // which dated generation this came from

            // PREGEN-CONTROL-2: stamp provenance — did the generated GeoJSON already
            // carry the operator's override coordinates?  Read-only check, no patch.
            var ovObj = readObjectiveOverride(c);
            if (ovObj && typeof ovObj.lon === 'number' && typeof ovObj.lat === 'number') {
                var geoCoord = scenario.obj && Array.isArray(scenario.obj.coord) && scenario.obj.coord.length === 2
                    ? scenario.obj.coord : null;
                var coordsMatch = geoCoord &&
                    Math.abs(geoCoord[0] - ovObj.lon) < 0.0001 &&
                    Math.abs(geoCoord[1] - ovObj.lat) < 0.0001;
                scenario.objective_override_in_geojson = !!coordsMatch;
                scenario.objective_override_expected = { lon: ovObj.lon, lat: ovObj.lat };
                if (!coordsMatch) {
                    // GeoJSON was generated before the override or with old checkpoints.
                    // Generator did not apply the override — regenerate from new run.
                    scenario.objective_override_warning =
                        'GeoJSON objective does not match scenario_overrides.json. ' +
                        'Re-run generation so WarGamingGEN consumes the override.';
                }
            }

            const nSteps = (scenario.steps || []).length;

            // Determine the BASE name for this import. Partials default to a
            // phase-suffixed auto-name unless the operator typed an explicit one.
            let baseName;
            if (partial) {
                // Hard floor: the loader validator requires steps ∈ [4..20] — do NOT
                // relax it here; below 4 phases, refuse (the UI offers Continue/Restart).
                if (nSteps < 4) {
                    sendJson(res, 400, { ok: false, partial: true,
                        error: 'partial import requires at least 4 generated phases (got ' + nSteps + ')',
                        generated_phase_count: nSteps, expected_phase_count: total });
                    return true;
                }
                baseName = explicitName ? safeName : partialName(safeName, nSteps);
                scenario.generation_status = 'partial';
                scenario.generated_phase_count = nSteps;
                scenario.expected_phase_count = total;
                scenario.partial_import = true;
                scenario.can_resume_generation = countCheckpoints(latestRunDir(c)) > 0;
            } else {
                baseName = safeName;
            }

            // WIZARD-SAVE-1: non-destructive save. Existing files are never
            // overwritten unless the operator explicitly confirmed Replace
            // (overwrite=1). An explicit typed name that collides returns 409;
            // an auto-name that collides is auto-suffixed.
            const target = resolveScenarioSaveTarget({ baseName: baseName, explicit: explicitName, overwrite: overwrite });
            if (target.conflict) {
                sendJson(res, 409, { ok: false, name_conflict: true,
                    error: 'scenario name already exists',
                    requestedName: target.requestedName,
                    existing: { name: target.requestedName, file: path.basename(scenarioFilePath(target.requestedName)) },
                    suggestedName: target.suggestedName,
                    partial: !!partial,
                    hint: 're-POST with ?name=<suggestedName> to save a copy, or ?name=' + target.requestedName + '&overwrite=1 to replace.' });
                return true;
            }
            const finalName = target.name;
            if (!isSafeScenarioName(finalName)) {
                sendJson(res, 400, { ok: false, error: 'unsafe scenario name' });
                return true;
            }
            scenario.name = finalName;

            const outFile = PORTER.writeScenario(scenario);
            if (ctx.scenarios) { try { ctx.scenarios.clearCache(); } catch (_) {} try { ctx.scenarios.setActiveName(scenario.name); } catch (_) {} }
            sendJson(res, 200, {
                ok: true, name: scenario.name, file: outFile,
                // WIZARD-SAVE-1 save provenance:
                requested_name: baseName,
                renamed: finalName !== baseName,           // auto-suffixed off a collision
                replaced: !!target.replaced,               // operator-confirmed overwrite
                source: 'WarGamingGEN', input_docs: scenario.input_docs,
                generated_from_docs: true, imported_from_geojson: true,
                source_file: 'all_phases.geojson', source_run: ex.run_id,
                red_units: (scenario.red_units || []).length,
                blue_units: (scenario.blue_units_initial || []).length,
                steps: nSteps,
                objective: !!(scenario.obj && Array.isArray(scenario.obj.coord) && scenario.obj.coord.length === 2),
                report_present: ex.report, schedule_present: ex.schedule,
                imported_stale: !!(fresh.export_behind && confirmed),   // FAST-DOC-2: operator overrode the stale warning
                // UNIFIED-IMPORT-2: partial provenance (full imports report complete).
                partial_import: !!partial,
                generation_status: partial ? 'partial' : 'complete',
                generated_phase_count: nSteps,
                expected_phase_count: total,
                can_resume_generation: partial ? (countCheckpoints(latestRunDir(c)) > 0) : false,
                // PREGEN-CONTROL-2: did the generated GeoJSON contain the override coords?
                objective_override_in_geojson: scenario.objective_override_in_geojson || false,
                objective_override_warning: scenario.objective_override_warning || null,
            });
        } catch (e) { sendJson(res, 400, { ok: false, error: 'import failed: ' + e.message }); }
        return true;
    }

    // ── PREGEN-CONTROL-2: operator-controlled Objective X override ──
    if (pathname === '/api/wargame-sim/objective-override' && method === 'POST') {
        var lon = parseFloat(url.searchParams.get('lon') || '');
        var lat = parseFloat(url.searchParams.get('lat') || '');
        var name = url.searchParams.get('name') || 'Objective X';
        // SCENARIO-AUTOGEN-1: UI normally sends lon/lat; if absent, use a safe default
        // instead of erroring. A value that IS provided but out of range is still rejected.
        if (isNaN(lon)) lon = 32.89;
        if (isNaN(lat)) lat = 34.76;
        if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
            sendJson(res, 400, { ok: false, error: 'invalid coordinates (lon [-180..180], lat [-90..90])', lon: lon, lat: lat });
            return true;
        }
        // SCENARIO-AUTOGEN-1: ensure scenario.json exists so a default objective is
        // always available — Save Objective Position must never fail for a missing file.
        try { ensureScenarioJson(c, { lon: lon, lat: lat }); } catch (_) {}
        var defObj = getDefaultObjective(c);
        if (!defObj || !defObj.id) {
            // Last-resort: synthesize a stable objective id so the placement still saves.
            defObj = { id: 'OBJ-X' };
        }
        var override = { id: defObj.id, lon: lon, lat: lat, name_en: name };
        if (defObj.depth_km_from_coast !== undefined) override.depth_km_from_coast = defObj.depth_km_from_coast;
        var ok = writeObjectiveOverride(c, override);
        if (!ok) {
            sendJson(res, 500, { ok: false, error: 'failed to write scenario_overrides.json' });
            return true;
        }
        sendJson(res, 200, {
            ok: true, override: override, previous: readObjectiveOverride(c)
        });
        return true;
    }

    return false;
}

module.exports = { handle, _internals: {
    cfg, publishRunToExport, latestExport, latestRunDir, manualCommands, computeFreshness, runsLatestInfo,
    // UNIFIED-IMPORT-2
    countCheckpoints, phasesTotal, runArgs, regenArgs, partialName, clobberConflict, computeSimProgress,
    scenarioFilePath,
    // WIZARD-SAVE-1
    safeScenarioName, scenarioFileExists, isSafeScenarioName, makeUniqueScenarioName, resolveScenarioSaveTarget,
    // SOURCE-INSPECTOR-1
    computeSources, listStep0, oobCounts, countGeoFeatures, fileStatus,
    // PREGEN-CONTROL-2
    getDefaultObjective, readObjectiveOverride, writeObjectiveOverride,
    // SCENARIO-AUTOGEN-1
    scenarioJsonPathOf, isValidScenarioObjective, buildMinimalScenario,
    writeCanonicalScenarioViaPython, ensureScenarioJson, normalizeOverrideFile,
    // WIZARD-FINGERPRINT-1
    hashFile, round4, currentSetupFingerprint, setupMatchesRun, persistRunMetaWhenReady,
} };
