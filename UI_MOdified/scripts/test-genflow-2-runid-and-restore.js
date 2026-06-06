#!/usr/bin/env node
'use strict';
/**
 * GENFLOW-2 — run-id gating (Part A) + restore/active fallback + gen-tree env (Part B).
 *
 * Part A is tested behaviourally against the real computeSimProgress with temp
 * run dirs. Part B (browser-IIFE restore + package.json env) is verified by
 * source assertions (repo pattern).
 *
 * Run:  node scripts/test-genflow-2-runid-and-restore.js
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const bridge = require(path.join(ROOT, 'server', 'wargame-sim-bridge.js'));
const { computeSimProgress } = bridge._internals;

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); console.log('  PASS', name); passed++; }
    catch (e) { console.error('  FAIL', name, '—', e.message); failed++; }
}

// ── temp filesystem fixture ───────────────────────────────────────────────────
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'genflow2-'));
const runsDir = path.join(tmp, 'runs');
fs.mkdirSync(runsDir, { recursive: true });
function makeRun(name, checkpoints, withOutputs) {
    const d = path.join(runsDir, name);
    fs.mkdirSync(path.join(d, 'checkpoints'), { recursive: true });
    for (let i = 0; i < checkpoints; i++) {
        fs.writeFileSync(path.join(d, 'checkpoints', 'phase' + String(i).padStart(2, '0') + '.json'), '{}');
    }
    if (withOutputs) {
        fs.mkdirSync(path.join(d, 'outputs', 'geojson'), { recursive: true });
        fs.writeFileSync(path.join(d, 'outputs', 'geojson', 'all_phases.geojson'), '{}');
    }
    return d;
}
// c stub: computeSimProgress only needs runsDir (latestRunDir) + wgen (phasesTotal→17 fallback).
const c = { runsDir: runsDir, wgen: path.join(tmp, 'no-wgen') };

try {
    // An OLD, COMPLETE run exists (17 checkpoints + outputs) — the pre-Start baseline.
    makeRun('2026-01-01_00-00-00', 17, true);

    console.log('\nGENFLOW-2 — Part A: run-id gating');

    test('1. starting a new run does NOT report the old run\'s 17 (gated → 0)', () => {
        const p = computeSimProgress(c, { running: true, baselineRun: '2026-01-01_00-00-00' });
        assert.strictEqual(p.phases_done, 0, 'must report 0 while the new run dir has not appeared');
        assert.strictEqual(p.status, 'running');
        assert.strictEqual(p.last_run_id, null, 'must not attribute the old run id to the new run');
        assert.ok(/Starting new generation/i.test(p.message), 'starting message');
    });

    test('2. once the new run dir appears, progress tracks IT (not the baseline)', () => {
        makeRun('2026-02-02_00-00-00', 3, false);   // new run, 3 checkpoints, newer name
        const p = computeSimProgress(c, { running: true, baselineRun: '2026-01-01_00-00-00' });
        assert.strictEqual(p.last_run_id, '2026-02-02_00-00-00', 'should track the new run');
        assert.strictEqual(p.phases_done, 3, 'counts the new run checkpoints');
        assert.strictEqual(p.status, 'running');
    });

    test('3. not running → reports the newest run normally (no gating)', () => {
        const p = computeSimProgress(c, { running: false, baselineRun: null });
        // newest is 2026-02-02 with 3 ckpts, no outputs → stopped_partial
        assert.strictEqual(p.last_run_id, '2026-02-02_00-00-00');
        assert.strictEqual(p.phases_done, 3);
    });

    test('4. resume (no baseline) is never gated — keeps counting the run', () => {
        const p = computeSimProgress(c, { running: true, baselineRun: null });
        assert.strictEqual(p.phases_done, 3, 'resume continues the existing run');
        assert.notStrictEqual(p.last_run_id, null);
    });

    test('5. gating only triggers while the newest run IS the baseline', () => {
        // baseline points at the OLDER run, but newest on disk is the new one →
        // not gated (the session run already appeared).
        const p = computeSimProgress(c, { running: true, baselineRun: '2026-01-01_00-00-00' });
        assert.strictEqual(p.last_run_id, '2026-02-02_00-00-00');
        assert.notStrictEqual(p.status, undefined);
    });

} finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
}

// ── Part B: source assertions ─────────────────────────────────────────────────
const PKG = fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8');
const NSL = fs.readFileSync(path.join(ROOT, 'client', 'shell', 'native-scenario-loader.js'), 'utf8');
const WIZ = fs.readFileSync(path.join(ROOT, 'client', 'shell', 'scenario-import-wizard.js'), 'utf8');
const BR  = fs.readFileSync(path.join(ROOT, 'server', 'wargame-sim-bridge.js'), 'utf8');

console.log('\nGENFLOW-2 — Part B: gen-tree env + restore fallback (source)');

test('6. serve/web point the server at the MAP_2 TestingAI tree (has the shift fix)', () => {
    assert.ok(/"serve":[^\n]*RMOOZ_TESTINGAI_DIR=[^\n]*MAP_2\\\\UI_MOdified\\\\TestingAI/.test(PKG),
        'serve must set RMOOZ_TESTINGAI_DIR to the MAP_2 tree');
    assert.ok(/"web":[^\n]*RMOOZ_TESTINGAI_DIR=[^\n]*MAP_2\\\\UI_MOdified\\\\TestingAI/.test(PKG),
        'web must set RMOOZ_TESTINGAI_DIR to the MAP_2 tree');
});
test('7. restore falls back to the server active scenario, then self-heals', () => {
    const i = NSL.indexOf('function restoreLastLoadedScenario');
    const b = NSL.slice(i, i + 1200);
    assert.ok(/\/api\/ai\/scenarios/.test(b), 'must query the active scenario as fallback');
    assert.ok(/j\.active/.test(b) && /_restoreByName\(ws, active\)/.test(b), 'must load the server active');
    assert.ok(/clearRememberedScenario\(\)/.test(b), 'must self-heal when nothing restorable');
});
test('8. fresh start resets the bar to 0 (no flash of the old run value)', () => {
    assert.ok(/setProgress\(resume \? 20 : 0/.test(WIZ), 'start() must reset to 0 for a fresh run');
});
test('9. server captures a baseline run on /run for gating', () => {
    assert.ok(/const baselineRun = resume \? null :/.test(BR), 'baselineRun captured (skipped on resume)');
    assert.ok(/baselineRun: baselineRun/.test(BR), 'baselineRun stored on simState');
});
test('10. no hardcoded objective coordinates in the new server gating code', () => {
    const i = BR.indexOf('Part A run-id gating');
    const b = BR.slice(i, i + 900);
    for (const lit of ['19.55', '29.74', '20.63', '30.98', '1.26', '48.31']) {
        assert.ok(b.indexOf(lit) === -1, 'gating code must not hardcode ' + lit);
    }
});

console.log('\n' + (failed ? 'FAIL' : 'PASS') +
    ` test-genflow-2-runid-and-restore — ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
