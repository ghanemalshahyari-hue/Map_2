#!/usr/bin/env node
'use strict';
/**
 * fix(loader) — restore the last-loaded scenario after a plain refresh.
 *
 * The loader is a browser IIFE, so the SAFE-pointer logic is replicated here
 * (behavioural) and the wiring is verified by source assertions (repo pattern).
 *
 * Run:  node scripts/test-loader-restore-last-scenario.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const NSL = fs.readFileSync(path.join(ROOT, 'client', 'shell', 'native-scenario-loader.js'), 'utf8');
const WIZ = fs.readFileSync(path.join(ROOT, 'client', 'shell', 'scenario-import-wizard.js'), 'utf8');

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); console.log('  PASS', name); passed++; }
    catch (e) { console.error('  FAIL', name, '—', e.message); failed++; }
}

// ── Replica of the pointer helpers over a fake localStorage ───────────────────
const SAFE_NAME_RE = /^[a-z0-9._-]+$/i;
function isSafeScenarioName(name) {
    return typeof name === 'string' && name.length > 0 && name.length <= 80 &&
           SAFE_NAME_RE.test(name) && name.indexOf('..') === -1;
}
let store = {};
const LS = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
const KEY = 'rmooz.last-loaded';
function remember(name) {
    if (!isSafeScenarioName(name)) return;
    LS.setItem(KEY, JSON.stringify({ name: name, file: name + '.json', source: 'data/scenarios', savedAt: 'T' }));
}
function get() {
    const raw = LS.getItem(KEY);
    if (!raw) return null;
    let p; try { p = JSON.parse(raw); } catch (_) { return null; }
    if (!p || p.source !== 'data/scenarios' || !isSafeScenarioName(p.name)) return null;
    return p;
}
function clear() { LS.removeItem(KEY); }

console.log('\nfix(loader) — safe pointer behaviour');

test('1. successful load saves a name-only pointer (not full JSON)', () => {
    store = {}; remember('gulf_of_sidra_2026_amphibious_assault');
    const p = get();
    assert.ok(p && p.name === 'gulf_of_sidra_2026_amphibious_assault');
    assert.strictEqual(p.file, 'gulf_of_sidra_2026_amphibious_assault.json');
    assert.strictEqual(p.source, 'data/scenarios');
    assert.ok(!/steps|red_units|features/.test(LS.getItem(KEY)), 'pointer must not embed scenario JSON');
});
test('2. valid pointer is returned for restore', () => {
    store = {}; remember('coastal-shield-training-v1');
    assert.ok(get() && get().name === 'coastal-shield-training-v1');
});
test('4. invalid pointer (bad source) is rejected → cleared state', () => {
    store = {}; LS.setItem(KEY, JSON.stringify({ name: 'x', source: 'C:/evil' }));
    assert.strictEqual(get(), null);
});
test('4b. malformed JSON pointer is rejected', () => {
    store = {}; LS.setItem(KEY, '{not json');
    assert.strictEqual(get(), null);
});
test('5. path-traversal pointer is rejected (never stored, never returned)', () => {
    store = {};
    remember('../../etc/passwd');            // not stored
    assert.strictEqual(LS.getItem(KEY), null, 'traversal name must not be stored');
    LS.setItem(KEY, JSON.stringify({ name: '../../etc/passwd', source: 'data/scenarios' }));
    assert.strictEqual(get(), null, 'traversal name must not be returned');
});
test('5b. separators rejected, valid safeName accepted', () => {
    assert.ok(!isSafeScenarioName('a/b') && !isSafeScenarioName('a\\b') && !isSafeScenarioName('..') && !isSafeScenarioName(''));
    assert.ok(isSafeScenarioName('wargame3') && isSafeScenarioName('coastal-shield-training-v1'));
});

console.log('\nfix(loader) — wiring (source)');

test('3+6+7. restore runs ONLY when there is no launch intent; explicit launch wins', () => {
    const s = NSL.indexOf('function start');
    const b = NSL.slice(s, s + 1400);
    // The no-intent branch restores; intents fall through to handleLaunchIntent.
    assert.ok(/if \(!intent\)\s*\{[\s\S]*restoreLastLoadedScenario\(\)/.test(b),
        'no-intent branch must restore');
    assert.ok(/handleLaunchIntent\(\)/.test(b), 'explicit intents still dispatch (win over restore)');
    // restore is NOT called for explicit intents (it is inside the !intent guard).
    assert.ok(b.indexOf('restoreLastLoadedScenario') < b.indexOf('handleLaunchIntent'),
        'restore must be gated before the intent dispatch');
});
test('8+9. demo + resume paths untouched (still present)', () => {
    assert.ok(/function loadNativeSample/.test(NSL), 'Quick Demo loader present');
    assert.ok(/function handleResumeIntent/.test(NSL), 'Resume handler present');
    assert.ok(/intent === 'demo'/.test(NSL) && /intent === 'resume'/.test(NSL), 'demo/resume intents present');
});
test('restoreLastLoadedScenario fetches via the normal loader + clears on failure', () => {
    // The GET/load/encode now live in the shared _restoreByName helper; the
    // public restore fn drives it (pointer first, server-active fallback) and
    // self-heals by clearing a bad pointer.
    const h = NSL.slice(NSL.indexOf('function _restoreByName'), NSL.indexOf('function _restoreByName') + 700);
    assert.ok(/\/api\/ai\/scenario\//.test(h), 'helper must use the normal GET scenario path');
    assert.ok(/loadLiveScenarioFromJson/.test(h), 'helper must load via the workspace loader');
    assert.ok(/encodeURIComponent\(name\)/.test(h), 'helper must encode the (already-safe) name');

    const i = NSL.indexOf('function restoreLastLoadedScenario');
    const b = NSL.slice(i, i + 1300);
    assert.ok(/_restoreByName\(ws,/.test(b), 'restore must drive the shared loader helper');
    assert.ok(/clearRememberedScenario\(\)/.test(b), 'must clear an invalid/failed pointer');
});
test('handleLoadIntent remembers the pointer after a successful load', () => {
    const i = NSL.indexOf('function handleLoadIntent');
    const b = NSL.slice(i, i + 2600);
    assert.ok(/rememberLastLoadedScenario\(/.test(b), 'load path must remember the pointer');
});
test('import wizard remembers the pointer after a successful import', () => {
    assert.ok(/rememberLastLoadedScenario\(body\.name\)/.test(WIZ),
        'import wizard must remember body.name after load');
});
test('helpers exported on AppNativeScenarioLoader', () => {
    assert.ok(/rememberLastLoadedScenario:\s*rememberLastLoadedScenario/.test(NSL));
    assert.ok(/restoreLastLoadedScenario:\s*restoreLastLoadedScenario/.test(NSL));
});

// Related suites (no-autoopen, wizard-save, wizard-state) are verified as
// SEPARATE top-level processes in the sweep — not embedded here. Nesting them
// transitively re-runs test-unified-import-3 (which snapshots data/scenarios)
// and flakes when the dev server is live and mutating _active.json.

console.log('\n' + (failed ? 'FAIL' : 'PASS') +
    ` test-loader-restore-last-scenario — ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
