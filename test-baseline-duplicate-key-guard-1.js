#!/usr/bin/env node
/* ============================================================================
 * test-baseline-duplicate-key-guard-1.js
 * Regression guard for the 2026-07-15 quarantine-accounting bug.
 * ----------------------------------------------------------------------------
 * scripts/test-baseline-known-failures.json got two JSON entries for the
 * same test filename (a corrected quarantine entry inserted as a NEW key
 * instead of replacing the existing one). JSON.parse silently kept only the
 * LAST occurrence and discarded the other with no error — so the mistake
 * cost nothing observable at the time, and would have again. This proves:
 *   (a) scripts/baseline-duplicate-key-check.js's scanner is correct in
 *       isolation on synthetic fixtures,
 *   (b) the real committed baseline has zero duplicate keys today,
 *   (c) the real runner (scripts/run-all-tests.js) refuses to proceed —
 *       loudly, non-zero exit, no test children spawned — when pointed at a
 *       baseline containing a duplicate key, and behaves normally on a
 *       clean one. (c) is proven by spawning the real script against
 *       disposable fixtures via the RMOOZ_TEST_BASELINE_PATH override added
 *       specifically to make this testable without ever touching the real
 *       baseline file.
 * ========================================================================== */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const { findDuplicateFilenameKeys } = require(path.join(ROOT, 'scripts', 'baseline-duplicate-key-check.js'));

let passed = 0;
let failed = 0;
function ok(label, cond, detail) {
    if (cond) { passed += 1; console.log('  PASS  ' + label); }
    else { failed += 1; console.error('  FAIL  ' + label + (detail ? ' — ' + detail : '')); }
}

console.log('\n=== Baseline duplicate-filename-key regression guard ===\n');

// ── 1. Unit: scanner correctness on synthetic fixtures ─────────────────────
ok('T-1 no duplicates in a clean two-entry fixture',
    findDuplicateFilenameKeys(JSON.stringify({
        known_failures: {
            'test-a.js': { reason: 'x', signature: ['s'], owner: 'o', quarantined_since: '2026-01-01', review_by: '2026-02-01' },
            'test-b.js': { reason: 'x', signature: ['s'], owner: 'o', quarantined_since: '2026-01-01', review_by: '2026-02-01' }
        }
    }, null, 2)).length === 0);

const dupText = [
    '{',
    '  "known_failures": {',
    '    "test-a.js": { "reason": "first", "signature": ["s1"] },',
    '    "test-b.js": { "reason": "x", "signature": ["s"] },',
    '    "test-a.js": { "reason": "second (silently shadows first on JSON.parse)", "signature": ["s2"] }',
    '  }',
    '}'
].join('\n');
const dupes = findDuplicateFilenameKeys(dupText);
ok('T-2 detects a duplicate filename key', dupes.length === 1 && dupes[0] === 'test-a.js', JSON.stringify(dupes));

const tripleDupText = [
    '{ "known_failures": {',
    '  "test-x.js": {"a":1},',
    '  "test-x.js": {"a":2},',
    '  "test-x.js": {"a":3}',
    '} }'
].join('\n');
const tripleDupes = findDuplicateFilenameKeys(tripleDupText);
ok('T-3 a key repeated 3x is reported exactly once, not 2x',
    tripleDupes.length === 1 && tripleDupes[0] === 'test-x.js', JSON.stringify(tripleDupes));

ok('T-4 a filename mentioned only inside a reason string (not as a key) is not a false positive',
    findDuplicateFilenameKeys(JSON.stringify({
        known_failures: {
            'test-a.js': { reason: 'unrelated mentions of test-a.js and test-a.js again', signature: ['s'] }
        }
    }, null, 2)).length === 0);

// ── 2. Regression: the real committed baseline has zero duplicates today ──
const REAL_BASELINE = path.join(ROOT, 'scripts', 'test-baseline-known-failures.json');
const realDupes = findDuplicateFilenameKeys(fs.readFileSync(REAL_BASELINE, 'utf8'));
ok('T-5 the real scripts/test-baseline-known-failures.json has no duplicate filename keys',
    realDupes.length === 0, JSON.stringify(realDupes));

// ── 3. Integration: the real runner fails fast + loud on a duplicate-key
// baseline, and runs normally on a clean one ───────────────────────────────
const RUNNER = path.join(ROOT, 'scripts', 'run-all-tests.js');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rmooz-baseline-guard-'));

const dupFixturePath = path.join(tmpDir, 'dup-baseline.json');
fs.writeFileSync(dupFixturePath, [
    '{',
    '  "schema": "rmooz.test-baseline/2",',
    '  "known_failures": {',
    '    "test-edit-mode-missions-slice.js": {',
    '      "reason": "fixture-a", "signature": ["s1"], "owner": "fixture",',
    '      "quarantined_since": "2026-01-01", "review_by": "2099-01-01"',
    '    },',
    '    "test-edit-mode-missions-slice.js": {',
    '      "reason": "fixture-b (would silently shadow fixture-a)", "signature": ["s2"], "owner": "fixture",',
    '      "quarantined_since": "2026-01-01", "review_by": "2099-01-01"',
    '    }',
    '  }',
    '}'
].join('\n'));

const dupRun = spawnSync(process.execPath, [RUNNER, '--mode', 'fast', '--filter', 'test-edit-mode-missions-slice.js'], {
    cwd: ROOT,
    env: Object.assign({}, process.env, { RMOOZ_TEST_BASELINE_PATH: dupFixturePath }),
    encoding: 'utf8'
});
const dupOutput = (dupRun.stdout || '') + (dupRun.stderr || '');
ok('T-6 runner exits non-zero when the baseline has a duplicate filename key', dupRun.status !== 0, 'exit=' + dupRun.status);
ok('T-7 runner reports the fatal duplicate-key message naming the offending file',
    /duplicate filename key/i.test(dupOutput) && /test-edit-mode-missions-slice\.js/.test(dupOutput));
ok('T-8 runner fails BEFORE spawning any test children (no PASS/FAIL lines)',
    !/^\s*(PASS|FAIL)\s/m.test(dupOutput));

const cleanFixturePath = path.join(tmpDir, 'clean-baseline.json');
fs.writeFileSync(cleanFixturePath, JSON.stringify({ schema: 'rmooz.test-baseline/2', known_failures: {} }, null, 2));
const cleanRun = spawnSync(process.execPath, [RUNNER, '--mode', 'fast', '--filter', 'test-edit-mode-missions-slice.js'], {
    cwd: ROOT,
    env: Object.assign({}, process.env, { RMOOZ_TEST_BASELINE_PATH: cleanFixturePath }),
    encoding: 'utf8'
});
const cleanOutput = (cleanRun.stdout || '') + (cleanRun.stderr || '');
ok('T-9 runner proceeds normally (no fatal duplicate-key message) against a clean baseline',
    !/duplicate filename key/i.test(cleanOutput) && /test-edit-mode-missions-slice\.js/.test(cleanOutput));

fs.rmSync(tmpDir, { recursive: true, force: true });

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
process.exit(failed ? 1 : 0);
