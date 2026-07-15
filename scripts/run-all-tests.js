#!/usr/bin/env node
/**
 * scripts/run-all-tests.js — unified main-app test/release gate.
 *
 * Three modes, matching CLAUDE.md's actual test taxonomy:
 *   --mode fast     deterministic static contracts, no server (the vast
 *                    majority of root test-*.js files).
 *   --mode main     server-integration tests (spawn a real web-server.js
 *                    child process + hit it over HTTP) — auth, scenario
 *                    write chain, session/CSRF, etc.
 *   --mode browser  the canonical-workflow Playwright gate
 *                    (verify-canonical-workflow-1.js) — real login, real
 *                    session, app-shell smoke. NOT the full set of
 *                    historical PR-numbered verify-*.js snapshots — those
 *                    remain individually runnable as before, unchanged.
 *   --mode all      fast + main (default; browser is opt-in — it needs
 *                    Playwright's browser binaries, which may not be
 *                    provisioned in every environment).
 *
 * Offline-tree tests are out of scope by construction: this runner only
 * scans repo-ROOT test-*.js files, and the actual Offline_Deployment test
 * suite lives under UI_MOdified/ and UI_MOdified/scripts/ — never picked up
 * here. (Root test-*.js files that check one offline-parity assertion
 * ALONGSIDE otherwise-unrelated main-app assertions are NOT excluded — that
 * would require rewriting those files' internals; instead their failures
 * are tracked honestly in the known-failure baseline below.)
 *
 * QUARANTINE, NOT AMNESTY: scripts/test-baseline-known-failures.json records
 * each known-failing file's REASON plus a normalized FAILURE SIGNATURE (the
 * specific failing-assertion lines, or a fallback fingerprint for a crash).
 * A file already in the baseline still fails the gate if its CURRENT
 * signature contains anything not in the recorded one — i.e. an existing
 * known failure growing an ADDITIONAL or DIFFERENT failure is treated as new,
 * not silently absorbed into the same quarantine entry. Every baseline entry
 * also carries `owner` + `review_by` — this is a dated quarantine, not
 * permanent, invisible debt; entries past their review_by print a loud
 * warning (not a gate failure) every run so they can't be forgotten.
 *
 * Report format is deliberately literal, not "all green" framing:
 *   <N> passing
 *   <M> quarantined known failures
 *   <K> new failures
 *
 *   node scripts/run-all-tests.js                    (fast + main)
 *   node scripts/run-all-tests.js --mode fast
 *   node scripts/run-all-tests.js --mode main
 *   node scripts/run-all-tests.js --mode browser
 *   node scripts/run-all-tests.js --mode all --filter doctrine
 *   node scripts/run-all-tests.js --update-baseline   (rewrite the baseline
 *                                                       signatures/reasons to
 *                                                       match the current run
 *                                                       — use deliberately,
 *                                                       never automatically;
 *                                                       preserves existing
 *                                                       owner/review_by)
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const CONCURRENCY = 8;
const BASELINE_PATH = path.join(__dirname, 'test-baseline-known-failures.json');

// Server-spawning integration tests — anything else at root is a fast,
// deterministic static contract. Kept as an explicit list (not an
// auto-detected heuristic at run time) so the classification is stable and
// reviewable in a diff, not silently redrawn file-by-file.
const MAIN_INTEGRATION_FILES = new Set([
    'test-ai-generate-from-brief-endpoint-1.js',
    'test-api-scenarios-post.js',
    'test-batch-a-final-policy-matrix-1.js',
    'test-command-authority-slice2.js',
    'test-fast-doc-1-docx-sim-bridge.js',
    'test-fast-doc-2-publish-before-import.js',
    'test-fast-int-2-wargame-geojson-import.js',
    'test-proxy-trust-1.js',
    'test-scenario-sim-endpoint-auth-matrix-1.js',
    'test-scenario-stale-revision-guard-1.js',
    'test-session-security-hardening-1.js',
    'test-sim-route-auth-matrix-1.js',
]);
const BROWSER_FILES = ['verify-canonical-workflow-1.js', 'verify-batch-b-launch-journey-1.js'];

function parseArg(name, def) {
    const i = process.argv.indexOf(name);
    return i !== -1 ? process.argv[i + 1] : def;
}
const mode = parseArg('--mode', 'all');
const filter = parseArg('--filter', null);
const updateBaseline = process.argv.includes('--update-baseline');

function loadBaseline() {
    try { return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')); }
    catch (_) { return { known_failures: {} }; }
}

// ── Failure signature extraction ────────────────────────────────────────
// Different test files report failures in different home-grown formats
// ("  FAIL  label", "FAIL: TC-15: ...", "✗ label", a bare stack trace on an
// uncaught crash). A signature is the sorted, de-duplicated set of
// normalized failing-assertion lines — or, if none match, a fallback
// fingerprint from the crash output — so "this file still fails the same
// way" can be checked mechanically instead of trusting the filename alone.
const FAIL_LINE_RE = /^\s*(?:FAIL\b|FAILED\b|✗|✘)[:\s]*(.*)$/i;
// Strip run-specific noise that would otherwise make an identical failure
// look "changed" on every run: absolute temp-dir/file paths (random per
// spawn — mkdtemp suffixes, random ports baked into generated filenames) and
// bare numeric run-tokens (random ports, random ids, timestamps).
function normalizeSignatureLine(text) {
    return text
        .replace(/[A-Za-z]:\\[^\s"']+/g, '<PATH>')   // Windows absolute paths
        .replace(/\/(?:[\w.-]+\/)*[\w.-]+\.\w+/g, '<PATH>') // Unix-style paths
        .replace(/\d+/g, '#')                         // any run of digits
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, 200);
}
function extractFailureSignature(output) {
    const lines = output.split('\n');
    const hits = [];
    for (const line of lines) {
        const m = FAIL_LINE_RE.exec(line);
        if (m) {
            const norm = normalizeSignatureLine(m[1]);
            if (norm) hits.push(norm);
        }
    }
    if (hits.length) return Array.from(new Set(hits)).sort();
    // Fallback for crashes with no recognizable FAIL-style line: use the
    // most specific line available (an Error/TypeError message if present,
    // else the last non-empty line — usually the most specific one for an
    // uncaught-exception stack trace).
    const errLine = lines.find(l => /error|exception/i.test(l) && l.trim());
    if (errLine) return [normalizeSignatureLine(errLine)];
    const nonEmpty = lines.map(l => l.trim()).filter(Boolean);
    return nonEmpty.length ? [normalizeSignatureLine(nonEmpty[nonEmpty.length - 1])] : ['(no output captured)'];
}
function signaturesEqualOrSubset(current, baseline) {
    const base = new Set(baseline || []);
    return current.every(line => base.has(line));
}

let files;
if (mode === 'browser') {
    files = BROWSER_FILES.slice();
} else {
    const all = fs.readdirSync(ROOT).filter(f => /^test-.*\.js$/i.test(f));
    if (mode === 'fast') files = all.filter(f => !MAIN_INTEGRATION_FILES.has(f));
    else if (mode === 'main') files = all.filter(f => MAIN_INTEGRATION_FILES.has(f));
    else files = all; // 'all'
}
files = files.filter(f => !filter || f.includes(filter)).sort();

if (!files.length) {
    console.error(`No test files found for --mode ${mode}` + (filter ? ` matching "${filter}"` : ''));
    process.exit(1);
}

console.log(`[run-all-tests] mode=${mode} — ${files.length} file(s), concurrency=${CONCURRENCY}\n`);

function runOne(file) {
    return new Promise((resolve) => {
        const started = Date.now();
        const child = spawn(process.execPath, [path.join(ROOT, file)], { stdio: ['ignore', 'pipe', 'pipe'] });
        let out = '';
        child.stdout.on('data', d => { out += d; });
        child.stderr.on('data', d => { out += d; });
        child.on('close', (code) => resolve({ file, code, out, ms: Date.now() - started }));
        child.on('error', (err) => resolve({ file, code: -1, out: String(err && err.message || err), ms: Date.now() - started }));
    });
}

async function run() {
    const baseline = loadBaseline();
    const known = baseline.known_failures || {};
    const results = [];
    let idx = 0;
    async function worker() {
        while (idx < files.length) {
            const file = files[idx++];
            const r = await runOne(file);
            r.signature = r.code !== 0 ? extractFailureSignature(r.out) : null;
            results.push(r);
            let status = 'PASS';
            if (r.code !== 0) {
                const entry = known[file];
                if (!entry) status = 'FAIL (new)';
                else if (signaturesEqualOrSubset(r.signature, entry.signature)) status = 'FAIL (quarantined)';
                else status = 'FAIL (new signature)';
            }
            console.log(`  ${status}  ${file}  (${r.ms}ms)`);
        }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, files.length) }, worker));

    const failed = results.filter(r => r.code !== 0).sort((a, b) => a.file.localeCompare(b.file));
    const quarantined = [];
    const newOrChanged = [];
    for (const f of failed) {
        const entry = known[f.file];
        if (entry && signaturesEqualOrSubset(f.signature, entry.signature)) quarantined.push(f);
        else newOrChanged.push(f);
    }
    const passed = results.length - failed.length;

    if (updateBaseline) {
        const next = {
            schema: baseline.schema || 'rmooz.test-baseline/2',
            note: baseline.note || '',
            known_failures: {}
        };
        const today = (baseline.known_failures && Object.values(baseline.known_failures)[0] && baseline.known_failures[Object.keys(baseline.known_failures)[0]].quarantined_since) || undefined;
        for (const f of failed) {
            const prior = known[f.file];
            next.known_failures[f.file] = {
                reason: (prior && prior.reason) || 'unclassified — added via --update-baseline',
                signature: f.signature,
                owner: (prior && prior.owner) || 'unassigned',
                quarantined_since: (prior && prior.quarantined_since) || today || new Date().toISOString().slice(0, 10),
                review_by: (prior && prior.review_by) || null
            };
        }
        fs.writeFileSync(BASELINE_PATH, JSON.stringify(next, null, 2) + '\n');
        console.log(`\n[baseline] rewrote ${BASELINE_PATH} with ${failed.length} entries.`);
    }

    // ── Report literally — no "all green" framing ───────────────────────
    console.log(`\n${passed} passing`);
    console.log(`${quarantined.length} quarantined known failures`);
    console.log(`${newOrChanged.length} new failures`);

    // Surface stale quarantine entries loudly (never silently) — this is
    // what stops "unclassified, review later" from becoming permanent.
    const nowIso = new Date().toISOString().slice(0, 10);
    const stale = Object.entries(known).filter(([, e]) => e.review_by && e.review_by < nowIso);
    if (stale.length) {
        console.log(`\n⚠ ${stale.length} quarantine entr${stale.length === 1 ? 'y is' : 'ies are'} PAST their review_by date — re-triage needed:`);
        for (const [file, e] of stale) console.log(`  - ${file} (review_by ${e.review_by}, owner: ${e.owner})`);
    }

    if (quarantined.length) {
        console.log(`\nQuarantined (pre-existing, tracked, signature unchanged):`);
        for (const f of quarantined) {
            const e = known[f.file];
            console.log(`  - ${f.file} [owner: ${e.owner}, review_by: ${e.review_by || 'unset'}]: ${e.reason}`);
        }
    }
    if (newOrChanged.length) {
        console.log(`\n${newOrChanged.length} NEW or CHANGED failure(s) — this is what fails the gate:\n`);
        for (const f of newOrChanged) {
            const entry = known[f.file];
            if (entry) {
                console.log(`--- ${f.file} (exit ${f.code}) — SIGNATURE CHANGED from the quarantined baseline ---`);
                console.log('  baseline signature: ' + JSON.stringify(entry.signature));
                console.log('  current  signature: ' + JSON.stringify(f.signature));
            } else {
                console.log(`--- ${f.file} (exit ${f.code}) — not in baseline ---`);
            }
            console.log(f.out.trim().split('\n').slice(-15).join('\n'));
            console.log('');
        }
    }
    // The gate fails on any failure that is either unbaselined OR whose
    // signature no longer matches (a subset check) what's quarantined — a
    // known-failing file developing an ADDITIONAL or DIFFERENT failure is
    // treated as new, not silently absorbed into the existing entry.
    process.exit(newOrChanged.length ? 1 : 0);
}

run();
