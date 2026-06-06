#!/usr/bin/env node
'use strict';
/**
 * WIZARD-SAVE-1 — non-destructive scenario import naming.
 *
 * Exercises the server helpers (safeScenarioName, scenarioFileExists,
 * makeUniqueScenarioName, isSafeScenarioName, resolveScenarioSaveTarget) against
 * the real data/scenarios dir using a unique throwaway prefix, with cleanup in a
 * finally block. Proves: existing files are never overwritten unless overwrite
 * is set; explicit-name collisions return a conflict with a unique suggestion;
 * auto-name collisions auto-suffix; no path traversal.
 *
 * Run:  node scripts/test-wizard-save-1-no-overwrite.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SCN_DIR = path.join(ROOT, 'data', 'scenarios');
const bridge = require(path.join(ROOT, 'server', 'wargame-sim-bridge.js'));
const H = bridge._internals;

const PREFIX = '__wizsave_test_';
const created = [];
function makeFile(name, content) {
    const p = path.join(SCN_DIR, name + '.json');
    fs.writeFileSync(p, content || JSON.stringify({ name: name, steps: [] }));
    created.push(p);
    return p;
}

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); console.log('  PASS', name); passed++; }
    catch (e) { console.error('  FAIL', name, '—', e.message); failed++; }
}

try {
    if (!fs.existsSync(SCN_DIR)) fs.mkdirSync(SCN_DIR, { recursive: true });

    // Run the existing wizard regression FIRST, in a clean scenarios dir (before
    // we create any temp files) — test-unified-import-3 asserts the scenario dir
    // is unchanged across a cancel, so it must not see our throwaway files.
    console.log('\nWIZARD-SAVE-1 — existing wizard stop/restart regression');
    try {
        execSync('node ' + JSON.stringify(path.join(ROOT, 'scripts', 'test-wizard-state-1-stop-restart-reset.js')),
            { cwd: ROOT, stdio: 'pipe' });
        console.log('  PASS (existing) test-wizard-state-1-stop-restart-reset'); passed++;
    } catch (e) {
        console.error('  FAIL (existing) wizard-state-1\n' + ((e.stdout || '') + (e.stderr || '')).toString().slice(-400));
        failed++;
    }

    console.log('\nWIZARD-SAVE-1 — sanitize once + path safety');

    test('safeScenarioName sanitizes to safe form', () => {
        assert.strictEqual(H.safeScenarioName('Test Coastal Scenario'), 'test_coastal_scenario');
    });
    test('safeScenarioName is idempotent (sanitize exactly once is stable)', () => {
        const once = H.safeScenarioName('Test Coastal Scenario');
        assert.strictEqual(H.safeScenarioName(once), once);
    });
    test('safeScenarioName never empty', () => {
        assert.ok(H.safeScenarioName('') && H.safeScenarioName('!!!').length > 0);
    });
    test('safeScenarioName strips path separators (no traversal in name)', () => {
        const s = H.safeScenarioName('../../etc/passwd');
        assert.ok(s.indexOf('/') === -1 && s.indexOf('\\') === -1, 'separators survived: ' + s);
    });
    test('isSafeScenarioName rejects separators, accepts clean names', () => {
        assert.strictEqual(H.isSafeScenarioName('coastal_v1'), true);
        assert.strictEqual(H.isSafeScenarioName('a/b'), false);
        assert.strictEqual(H.isSafeScenarioName('a\\b'), false);
        assert.strictEqual(H.isSafeScenarioName(''), false);
    });
    test('sanitized name resolves inside SCENARIOS_DIR (no traversal)', () => {
        const s = H.safeScenarioName('../../etc/passwd');
        const target = path.resolve(H.scenarioFilePath(s));
        assert.ok(target.indexOf(path.resolve(SCN_DIR) + path.sep) === 0, 'escaped dir: ' + target);
    });

    console.log('\nWIZARD-SAVE-1 — existence + unique-name');

    const base = PREFIX + 'base';
    test('scenarioFileExists false before create, true after', () => {
        assert.strictEqual(H.scenarioFileExists(base), false);
        makeFile(base);
        assert.strictEqual(H.scenarioFileExists(base), true);
    });
    test('makeUniqueScenarioName suggests base-2 when base exists', () => {
        assert.strictEqual(H.makeUniqueScenarioName(base), base + '-2');
    });
    test('makeUniqueScenarioName skips to base-3 when base-2 also exists', () => {
        makeFile(base + '-2');
        assert.strictEqual(H.makeUniqueScenarioName(base), base + '-3');
    });
    test('makeUniqueScenarioName returns base unchanged when free', () => {
        const free = PREFIX + 'free';
        assert.strictEqual(H.makeUniqueScenarioName(free), free);
    });

    console.log('\nWIZARD-SAVE-1 — resolveScenarioSaveTarget (the core rule)');

    test('1. free name → write as-is', () => {
        const r = H.resolveScenarioSaveTarget({ baseName: PREFIX + 'newname', explicit: true });
        assert.deepStrictEqual(r, { name: PREFIX + 'newname' });
    });
    test('2. existing + explicit name → conflict (no overwrite), unique suggestion', () => {
        const r = H.resolveScenarioSaveTarget({ baseName: base, explicit: true });
        assert.strictEqual(r.conflict, true);
        assert.strictEqual(r.requestedName, base);
        assert.strictEqual(r.suggestedName, base + '-3');   // base, base-2 exist
        assert.ok(!('name' in r), 'conflict result must not carry a write target');
    });
    test('3. existing + overwrite → replace the same file (explicit Replace)', () => {
        const r = H.resolveScenarioSaveTarget({ baseName: base, explicit: true, overwrite: true });
        assert.strictEqual(r.name, base);
        assert.strictEqual(r.replaced, true);
    });
    test('4. existing + auto name → auto-suffix (never overwrite)', () => {
        const r = H.resolveScenarioSaveTarget({ baseName: base, explicit: false });
        assert.strictEqual(r.name, base + '-3');
        assert.strictEqual(r.auto_renamed, true);
        assert.notStrictEqual(r.name, base);
    });
    test('5. resolver never writes/deletes files (pure decision)', () => {
        const before = fs.readdirSync(SCN_DIR).length;
        H.resolveScenarioSaveTarget({ baseName: base, explicit: true });
        H.resolveScenarioSaveTarget({ baseName: base, explicit: false });
        assert.strictEqual(fs.readdirSync(SCN_DIR).length, before, 'resolver mutated the dir');
    });
    test('6. existing content is untouched when a conflict is returned', () => {
        const sentinel = JSON.stringify({ name: base, steps: [], sentinel: 'KEEP-ME' });
        fs.writeFileSync(path.join(SCN_DIR, base + '.json'), sentinel);
        H.resolveScenarioSaveTarget({ baseName: base, explicit: true });   // conflict, no write
        assert.strictEqual(fs.readFileSync(path.join(SCN_DIR, base + '.json'), 'utf8'), sentinel);
    });

} finally {
    // Clean up every temp file we created (and any stray PREFIX files).
    try {
        for (const f of fs.readdirSync(SCN_DIR)) {
            if (f.startsWith(PREFIX)) { try { fs.unlinkSync(path.join(SCN_DIR, f)); } catch (_) {} }
        }
    } catch (_) {}
}

console.log('\n' + (failed ? 'FAIL' : 'PASS') +
    ` test-wizard-save-1-no-overwrite — ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
