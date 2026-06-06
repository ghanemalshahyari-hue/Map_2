#!/usr/bin/env node
'use strict';
/**
 * WIZARD-FINGERPRINT-1 — a stopped/partial run is only offered for Continue /
 * Partial-Import when the current staged setup (red+blue DOCX content + active
 * objective) matches the fingerprint that run was launched with.
 *
 * Server behaviour is exercised against the real bridge functions with temp
 * dirs; client gating is verified by replicated logic + source assertions
 * (browser IIFE can't be imported — repo pattern).
 *
 * Run:  node scripts/test-wizard-fingerprint-1.js
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const bridge = require(path.join(ROOT, 'server', 'wargame-sim-bridge.js'));
const {
    computeSimProgress, currentSetupFingerprint, setupMatchesRun, persistRunMetaWhenReady,
} = bridge._internals;

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); console.log('  PASS', name); passed++; }
    catch (e) { console.error('  FAIL', name, '—', e.message); failed++; }
}

// ── temp fixture ──────────────────────────────────────────────────────────────
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wzfp-'));
const wgen = path.join(tmp, 'wgen');
const forces = path.join(tmp, 'forces');
const runsDir = path.join(wgen, 'runs');
fs.mkdirSync(path.join(wgen, 'inputs'), { recursive: true });
fs.mkdirSync(forces, { recursive: true });
fs.mkdirSync(runsDir, { recursive: true });
fs.writeFileSync(path.join(wgen, 'inputs', 'scenario.json'),
    JSON.stringify({ objective: { id: 'OBJ-X', lon: 19.55, lat: 29.74 } }));
function setObjectiveOverride(lon, lat) {
    fs.writeFileSync(path.join(wgen, 'inputs', 'scenario_overrides.json'),
        JSON.stringify({ objective: { id: 'OBJ-X', lon: lon, lat: lat } }));
}
function setDocs(redBytes, blueBytes) {
    fs.writeFileSync(path.join(forces, 'red_team.docx'), redBytes);
    fs.writeFileSync(path.join(forces, 'blue_team.docx'), blueBytes);
}
function makeRun(name, checkpoints, withMeta) {
    const d = path.join(runsDir, name);
    fs.mkdirSync(path.join(d, 'checkpoints'), { recursive: true });
    for (let i = 0; i < checkpoints; i++) {
        fs.writeFileSync(path.join(d, 'checkpoints', 'phase' + String(i).padStart(2, '0') + '.json'), '{}');
    }
    if (withMeta) {
        const fp = currentSetupFingerprint(c);   // meta == the setup on disk right now
        fs.writeFileSync(path.join(d, 'run-meta.json'),
            JSON.stringify(Object.assign({ runId: name, requestedName: 'Test 5', createdAt: 'x' }, fp)));
    }
    return d;
}
const c = { runsDir: runsDir, wgen: wgen, forcesDir: forces };

// Replicated client gate (mirror of stoppedBelongsToSetup in the wizard).
function stoppedBelongsToSetup(sim, setupDirty) {
    return !setupDirty && !!(sim && sim.setup_matches_stopped_run === true);
}

try {
    setDocs('RED-v1', 'BLUE-v1');
    setObjectiveOverride(52.73, 29.02);

    console.log('\nWIZARD-FINGERPRINT-1 — server fingerprint match');

    test('currentSetupFingerprint hashes both docs + active objective', () => {
        const fp = currentSetupFingerprint(c);
        assert.ok(fp.red_hash && fp.blue_hash, 'both doc hashes present');
        assert.strictEqual(fp.objective_lon, 52.73);
        assert.strictEqual(fp.objective_lat, 29.02);
    });

    test('4. matching stopped-run metadata → setup_matches_stopped_run true', () => {
        makeRun('2026-01-01_00-00-01', 15, true);             // meta == current setup
        const p = computeSimProgress(c, { running: false });
        assert.strictEqual(p.status, 'stopped_partial');
        assert.strictEqual(p.phases_done, 15);
        assert.strictEqual(p.setup_matches_stopped_run, true);
        assert.ok(p.stopped_run_meta && p.stopped_run_meta.requestedName === 'Test 5');
    });

    test('2. new DOCX after a stopped run → match false', () => {
        setDocs('RED-v2-DIFFERENT', 'BLUE-v1');               // red doc changed
        const p = computeSimProgress(c, { running: false });
        assert.strictEqual(p.setup_matches_stopped_run, false);
        setDocs('RED-v1', 'BLUE-v1');                          // restore
    });

    test('3. objective changed after a stopped run → match false', () => {
        setObjectiveOverride(1.26, 48.31);                    // objective changed
        const p = computeSimProgress(c, { running: false });
        assert.strictEqual(p.setup_matches_stopped_run, false);
        setObjectiveOverride(52.73, 29.02);                   // restore
    });

    test('1/5. stopped run WITHOUT run-meta (old run) → conservative no match', () => {
        // wipe the matching run, leave a metadata-less partial (pre-feature run)
        fs.rmSync(path.join(runsDir, '2026-01-01_00-00-01'), { recursive: true, force: true });
        makeRun('2026-01-01_00-00-02', 15, false);            // NO run-meta.json
        const p = computeSimProgress(c, { running: false });
        assert.strictEqual(p.status, 'stopped_partial');
        assert.strictEqual(p.setup_matches_stopped_run, false, 'missing metadata must not match');
        assert.strictEqual(p.stopped_run_meta, null);
    });

    test('running/gating branch never reports a setup match', () => {
        // newest run IS the baseline → gating branch
        const p = computeSimProgress(c, { running: true, baselineRun: '2026-01-01_00-00-02' });
        assert.strictEqual(p.phases_done, 0);
        assert.strictEqual(p.setup_matches_stopped_run, false);
    });

    test('persistRunMetaWhenReady writes meta into the new run dir', () => {
        const newRun = path.join(runsDir, '2026-01-01_00-00-03');
        fs.mkdirSync(path.join(newRun, 'checkpoints'), { recursive: true });
        const fp = currentSetupFingerprint(c);
        // baseline = the older run, so the newest (00-03) != baseline → writes now
        persistRunMetaWhenReady(c, '2026-01-01_00-00-02', fp, 'Test 6', 0);
        const meta = JSON.parse(fs.readFileSync(path.join(newRun, 'run-meta.json'), 'utf8'));
        assert.strictEqual(meta.requestedName, 'Test 6');
        assert.strictEqual(meta.objective_lon, 52.73);
        assert.ok(meta.red_hash && meta.blue_hash);
    });

    console.log('\nWIZARD-FINGERPRINT-1 — client gate truth table (replicated)');

    test('1. stopped run + new name (dirty) → not ours', () => {
        assert.strictEqual(stoppedBelongsToSetup({ setup_matches_stopped_run: true }, true), false);
    });
    test('2. stopped run + new DOCX (dirty) → not ours', () => {
        assert.strictEqual(stoppedBelongsToSetup({ setup_matches_stopped_run: false }, true), false);
    });
    test('4. matching run + clean setup → ours (show Continue/Partial)', () => {
        assert.strictEqual(stoppedBelongsToSetup({ setup_matches_stopped_run: true }, false), true);
    });
    test('mismatch run + clean setup → not ours', () => {
        assert.strictEqual(stoppedBelongsToSetup({ setup_matches_stopped_run: false }, false), false);
    });

} finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
}

// ── client source assertions ──────────────────────────────────────────────────
const WIZ = fs.readFileSync(path.join(ROOT, 'client', 'shell', 'scenario-import-wizard.js'), 'utf8');
console.log('\nWIZARD-FINGERPRINT-1 — client wiring (source)');

test('open path gates the stopped panel on stoppedBelongsToSetup', () => {
    assert.ok(/&& stoppedBelongsToSetup\(sim\)\) \{ showStopped\(b\); \}\s*\n\s*else \{ hideStopped\(\); \}/.test(WIZ),
        'initial open must guard showStopped + fall back to clean state');
});
test('6. poll terminal branch gates showStopped (stale poll cannot repaint)', () => {
    const i = WIZ.indexOf('} else if (stoppedBelongsToSetup(sim)) {');
    assert.ok(i > -1, 'poll terminal must guard showStopped');
    assert.ok(/Ready to start a new generation/.test(WIZ.slice(i, i + 800)), 'stale poll falls back to clean state');
});
test('2. staging a DOCX marks the setup dirty', () => {
    const i = WIZ.indexOf('function stageDoc');
    assert.ok(/markSetupDirty\(\);/.test(WIZ.slice(i, i + 1600)), 'stageDoc must mark dirty');
});
test('3. saving the objective marks the setup dirty', () => {
    const i = WIZ.indexOf('function saveObjective');
    assert.ok(/markSetupDirty\(\);/.test(WIZ.slice(i, i + 1600)), 'saveObjective must mark dirty');
});
test('1. typing a scenario name marks the setup dirty', () => {
    assert.ok(/el\.name\.addEventListener\('input'[\s\S]{0,160}markSetupDirty\(\)/.test(WIZ),
        'name input listener must mark dirty');
});
test('5. fresh Start clears dirty + passes name to /run', () => {
    assert.ok(/if \(!resume\) st\.setupDirty = false;/.test(WIZ), 'start resets dirty for fresh run');
    assert.ok(/runUrl \+= '\?name=' \+ encodeURIComponent\(nm0\)/.test(WIZ), 'start passes name to /run');
    assert.ok(/setProgress\(resume \? 20 : 0/.test(WIZ), 'fresh start resets bar to 0');
});
test('7. importPartial refuses when the setup is dirty', () => {
    const i = WIZ.indexOf('function importPartial');
    assert.ok(/if \(st\.setupDirty\) \{[\s\S]{0,400}return;/.test(WIZ.slice(i, i + 600)),
        'importPartial must bail when dirty');
});

console.log('\n' + (failed ? 'FAIL' : 'PASS') +
    ` test-wizard-fingerprint-1 — ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
