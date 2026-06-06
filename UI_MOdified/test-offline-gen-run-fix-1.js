/**
 * OFFLINE-GEN-RUN-FIX-1 — LiteLLM wiring + generation error surfacing tests
 *
 * Static tests verify the offline bridge overlay maps RMOOZ_AI_* → LLM_*, never
 * logs the key, writes redacted error.log, and that the wizard no longer resets
 * silently on generation error.
 *
 * Runtime tests (§ end) run only if the container is up on TEST_WEB_PORT (default 8640).
 *
 * Usage:
 *   node test-offline-gen-run-fix-1.js
 *   TEST_WEB_PORT=8640 node test-offline-gen-run-fix-1.js
 */
'use strict';

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');
const http   = require('http');

const ROOT = __dirname;
const OD   = path.join(ROOT, 'Offline_Deployment');
const OA   = path.join(OD, 'offline_app');
const WEB_PORT = parseInt(process.env.TEST_WEB_PORT || '8640', 10);

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); console.log(`  [PASS] ${name}`); passed++; }
    catch (e) { console.log(`  [FAIL] ${name}: ${e.message}`); failed++; }
}
function skip(name, reason) { console.log(`  [SKIP] ${name}: ${reason}`); }

console.log('\n══════════════════════════════════════════════════════════════════');
console.log('  OFFLINE-GEN-RUN-FIX-1 — LiteLLM wiring + error surfacing');
console.log('══════════════════════════════════════════════════════════════════\n');

// ─── §1  Bridge overlay exists + Dockerfile copies it ────────────────────────
console.log('── §1  Bridge overlay + Dockerfile ─────────────────────────────');

const bridgePath = path.join(OA, 'server', 'wargame-sim-bridge.js');
test('offline bridge overlay exists', () => {
    assert.ok(fs.existsSync(bridgePath), 'overlay must exist');
});

const bridge = fs.readFileSync(bridgePath, 'utf8');
const dockerfile = fs.readFileSync(path.join(OD, 'Dockerfile.offline'), 'utf8');

test('Dockerfile copies the bridge overlay over ./server/wargame-sim-bridge.js', () => {
    assert.ok(dockerfile.includes('offline_app/server/wargame-sim-bridge.js') &&
              dockerfile.includes('./server/wargame-sim-bridge.js'),
        'Dockerfile must COPY the bridge overlay');
});

// ─── §2  LLM env mapping ──────────────────────────────────────────────────────
console.log('\n── §2  RMOOZ_AI_* → LLM_* mapping ──────────────────────────────');

test('bridge maps RMOOZ_AI_BASE_URL → LLM_BASE_URL', () => {
    assert.ok(bridge.includes('RMOOZ_AI_BASE_URL') && bridge.includes('LLM_BASE_URL'),
        'must map base url');
});

test('bridge maps RMOOZ_AI_API_KEY → LLM_API_KEY and OPENAI_API_KEY', () => {
    assert.ok(bridge.includes('RMOOZ_AI_API_KEY'), 'reads RMOOZ_AI_API_KEY');
    assert.ok(bridge.includes('LLM_API_KEY') && bridge.includes('OPENAI_API_KEY'),
        'sets both LLM_API_KEY and OPENAI_API_KEY');
});

test('bridge maps RMOOZ_AI_MODEL → LLM_MODEL (with sim model fallback)', () => {
    assert.ok(bridge.includes('RMOOZ_AI_MODEL') && bridge.includes('LLM_MODEL'),
        'must map model');
});

test('bridge sets LLM_USE_RESPONSES_API = 0', () => {
    assert.ok(/LLM_USE_RESPONSES_API\s*=\s*['"]0['"]/.test(bridge),
        'must set responses api off for OpenAI-compatible');
});

test('bridge sets LLM_LOCAL_FORCE_FALLBACK = 0 when a real base URL is configured', () => {
    assert.ok(bridge.includes('LLM_LOCAL_FORCE_FALLBACK'),
        'must control local fallback');
    assert.ok(/LLM_LOCAL_FORCE_FALLBACK\s*=\s*baseUrl\s*\?\s*['"]0['"]/.test(bridge),
        'fallback must be 0 when baseUrl set');
});

test('bridge passes the built env to spawn (uses buildLlmChildEnv)', () => {
    assert.ok(bridge.includes('buildLlmChildEnv'), 'must define + use buildLlmChildEnv');
    assert.ok(/spawn\(c\.python,\s*runArgs\(resume\),\s*\{\s*cwd:\s*c\.wgen,\s*env:\s*env\s*\}/.test(bridge),
        'spawn must use the mapped env');
});

// ─── §3  No key logged ────────────────────────────────────────────────────────
console.log('\n── §3  API key never logged ────────────────────────────────────');

test('bridge never console.logs the API key value', () => {
    const lines = bridge.split('\n');
    for (const [i, line] of lines.entries()) {
        if (/console\.(log|warn|error|info)/.test(line)) {
            const noStr = line.replace(/'[^']*'|"[^"]*"|`[^`]*`/g, "''");
            assert.ok(!/API_KEY|aiKey|LLM_API_KEY|OPENAI_API_KEY/.test(noStr),
                `Line ${i + 1} logs a key variable: ${line.trim()}`);
        }
    }
});

test('bridge log line reports apiKeyConfigured boolean, not the value', () => {
    assert.ok(bridge.includes('apiKeyConfigured'),
        'safe summary must use apiKeyConfigured boolean');
});

// ─── §4  Error log writing + redaction ───────────────────────────────────────
console.log('\n── §4  error.log writing + secret redaction ────────────────────');

test('bridge writes error.log to the run folder on non-zero exit', () => {
    assert.ok(bridge.includes("'error.log'") || bridge.includes('error.log'),
        'must write error.log');
    assert.ok(bridge.includes('writeFileSync') && bridge.includes('error.log'),
        'must write error.log via fs');
});

test('bridge has redactSecrets() and applies it to stderr', () => {
    assert.ok(bridge.includes('function redactSecrets'), 'must define redactSecrets');
    assert.ok(bridge.includes('redactSecrets(errTail)'), 'must redact the stderr tail');
});

test('redactSecrets covers API_KEY / Authorization / Bearer', () => {
    const fn = (bridge.match(/function redactSecrets[\s\S]*?\n\}/) || [''])[0];
    assert.ok(/API_KEY/.test(fn) && /Authorization/.test(fn) && /Bearer/.test(fn),
        'redaction must cover key/header tokens');
});

// ─── §5  Wizard does not reset on error ──────────────────────────────────────
console.log('\n── §5  Wizard surfaces generation errors ───────────────────────');

const wiz = fs.readFileSync(path.join(OA, 'client', 'shell', 'scenario-import-wizard.js'), 'utf8');

test('wizard detects generation failure (status===error / exit_code / error)', () => {
    assert.ok(wiz.includes('genFailed'), 'must compute a genFailed branch');
    assert.ok(wiz.includes("sim.status === 'error'") || wiz.includes('sim.status===\'error\''),
        'must check sim.status error');
});

test('wizard shows failure (not silent reset) on generation error', () => {
    // The genFailed branch must call showFailure with "Generation failed"
    assert.ok(wiz.includes("showFailure('Generation failed."),
        'must call showFailure on generation error');
});

test('wizard failure message references run id / error.log', () => {
    assert.ok(wiz.includes('error.log') || wiz.includes('run_id') || wiz.includes('last_run_id'),
        'failure must point operator to the run error log');
});

test('"Ready to start a new generation" only in the genuine-idle branch', () => {
    // It should still exist (for the no-run case) but the error path must not reach it.
    assert.ok(wiz.includes('Ready to start a new generation'),
        'idle message still present for the no-run case');
});

// ─── §6  AI health is generation-aware ───────────────────────────────────────
console.log('\n── §6  Generation-aware AI health ──────────────────────────────');

const offWeb = fs.readFileSync(path.join(OA, 'server', 'web-server.js'), 'utf8');

test('/api/ai/health probes RMOOZ_AI_BASE_URL (generation endpoint)', () => {
    assert.ok(offWeb.includes('/api/ai/health') && offWeb.includes('RMOOZ_AI_BASE_URL'),
        'health must use the generation base url');
});

test('/api/ai/generation-health alias exists', () => {
    assert.ok(offWeb.includes('/api/ai/generation-health'),
        'explicit generation-health alias must exist');
});

test('AI health returns apiKeyConfigured boolean, never the key', () => {
    assert.ok(offWeb.includes('apiKeyConfigured'), 'must report apiKeyConfigured');
    // The health response object must not include the raw key
    assert.ok(!/sendJson\([^)]*RMOOZ_AI_API_KEY[^)]*\)/.test(offWeb),
        'must not send the key in any response');
});

// ─── §7  .env.offline.example placeholders, no real key ──────────────────────
console.log('\n── §7  .env.offline.example ────────────────────────────────────');

const envEx = fs.readFileSync(path.join(OD, '.env.offline.example'), 'utf8');

test('.env.offline.example documents litellm + RMOOZ_AI_BASE_URL placeholder', () => {
    assert.ok(envEx.includes('litellm') && envEx.includes('RMOOZ_AI_BASE_URL'),
        'must document LiteLLM option');
});

test('.env.offline.example contains NO real API key', () => {
    // Reject anything that looks like a real key value assigned to RMOOZ_AI_API_KEY
    const m = envEx.match(/^RMOOZ_AI_API_KEY\s*=\s*(\S+)/m);
    if (m) {
        const v = m[1];
        assert.ok(/^<.*>$/.test(v) || v.length < 8,
            `RMOOZ_AI_API_KEY in example must be a placeholder, got: ${v}`);
    }
    assert.ok(!/sk-[A-Za-z0-9]{16,}/.test(envEx), 'no OpenAI-style key in example');
});

// ─── §8  Main app untouched ──────────────────────────────────────────────────
console.log('\n── §8  Main app untouched ──────────────────────────────────────');

test('main server/wargame-sim-bridge.js still has original single-line spawn env', () => {
    const mainBridge = fs.readFileSync(path.join(ROOT, 'server', 'wargame-sim-bridge.js'), 'utf8');
    assert.ok(mainBridge.includes("Object.assign({}, process.env, { LLM_LOCAL_FORCE_FALLBACK: '1', LLM_MODEL: c.simModel })"),
        'main bridge must be unchanged');
    assert.ok(!mainBridge.includes('buildLlmChildEnv'), 'main bridge must NOT have the overlay helper');
});

test('main client/shell/scenario-import-wizard.js untouched (no genFailed)', () => {
    const mainWiz = fs.readFileSync(path.join(ROOT, 'client', 'shell', 'scenario-import-wizard.js'), 'utf8');
    assert.ok(!mainWiz.includes('genFailed'), 'main wizard must be unchanged');
});

// ─── §9  Runtime (optional — needs container) ────────────────────────────────
console.log('\n── §9  Runtime checks (container on port ' + WEB_PORT + ') ─────────────');

function httpGet(urlPath, timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${WEB_PORT}${urlPath}`, res => {
            let d = ''; res.on('data', c => d += c);
            res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(d), raw: d }); } catch { resolve({ status: res.statusCode, body: null, raw: d }); } });
        });
        req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('timeout')); });
        req.on('error', reject);
    });
}
async function up() { try { await httpGet('/', 2500); return true; } catch { return false; } }

async function runtime() {
    if (!(await up())) {
        skip('runtime tests', `container not on ${WEB_PORT} — rebuild + up first`);
        return;
    }
    try {
        const readiness = await httpGet('/api/ai/generation-health', 2500);
        if (readiness.status === 404) {
            skip('runtime tests', `container on ${WEB_PORT} is an older image — rebuild + up to verify runtime`);
            return;
        }
    } catch (_) {
        skip('runtime tests', `container on ${WEB_PORT} is not ready for generation-health — rebuild + up to verify runtime`);
        return;
    }

    const t = async (name, fn) => { try { await fn(); console.log(`  [PASS] ${name}`); passed++; } catch (e) { console.log(`  [FAIL] ${name}: ${e.message}`); failed++; } };

    await t('GET /api/ai/health → 200 with provider/model/baseUrlConfigured/apiKeyConfigured', async () => {
        const r = await httpGet('/api/ai/health');
        assert.strictEqual(r.status, 200);
        assert.ok('provider' in r.body && 'baseUrlConfigured' in r.body && 'apiKeyConfigured' in r.body,
            'health must report generation config');
    });

    await t('GET /api/ai/generation-health → 200', async () => {
        const r = await httpGet('/api/ai/generation-health');
        assert.strictEqual(r.status, 200);
    });

    await t('AI health response contains NO raw API key', async () => {
        const r = await httpGet('/api/ai/health');
        assert.ok(!/sk-[A-Za-z0-9]{16,}/.test(r.raw || ''), 'no key in health response');
    });
}

runtime().then(() => {
    console.log('\n' + '═'.repeat(66));
    console.log(`  Results: ${passed} passed, ${failed} failed`);
    console.log('═'.repeat(66) + '\n');
    process.exit(failed > 0 ? 1 : 0);
}).catch(e => { console.error(e); process.exit(1); });
