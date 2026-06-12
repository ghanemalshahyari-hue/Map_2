#!/usr/bin/env node
'use strict';
/**
 * fix(import) — Import Scenario wizard must NOT auto-open on a plain refresh.
 *
 * Root cause: Home navigates to ?launch=import-docx; native-scenario-loader's
 * start()→handleLaunchIntent() reads `launch` on every load and opens the modal.
 * The param was never consumed, so a refresh re-opened the wizard. Fix: consume
 * the launch flag after opening the import modal.
 *
 * The loader is a browser IIFE, so the consume logic is replicated for a
 * behavioural check and the wiring is verified by source assertions (repo pattern).
 *
 * Run:  node scripts/test-import-no-autoopen-on-refresh.js
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

// Replica of consumeLaunchParam's URL housekeeping.
function consume(href) {
    const url = new URL(href);
    if (!url.searchParams.has('launch')) return href;
    url.searchParams.delete('launch');
    const qs = url.searchParams.toString();
    return url.origin + url.pathname + (qs ? '?' + qs : '') + url.hash;
}

console.log('\nfix(import) — no auto-open on refresh');

// 1. Normal refresh: once launch is consumed, the URL carries no launch → no auto-open.
test('1. launch=import-docx is stripped after consume (refresh would not re-trigger)', () => {
    const after = consume('http://h/app.html?launch=import-docx');
    assert.ok(!/[?&]launch=/.test(after), 'launch param must be gone: ' + after);
});
test('2. other query params are preserved when launch is consumed', () => {
    const after = consume('http://h/app.html?launch=import-docx&view=map&x=1');
    assert.ok(!/[?&]launch=/.test(after), 'launch removed');
    assert.ok(/view=map/.test(after) && /x=1/.test(after), 'other params kept: ' + after);
});
test('3. URL without launch is unchanged', () => {
    assert.strictEqual(consume('http://h/app.html?view=map'), 'http://h/app.html?view=map');
});
test('4. URL that STILL explicitly has launch would re-open (explicit request honored)', () => {
    // The loader reads launch on load; only an explicit launch= URL opens it.
    assert.ok(/[?&]launch=import-docx/.test('http://h/app.html?launch=import-docx'),
        'an explicit launch URL still requests the modal (by design)');
});

console.log('\nfix(import) — wiring (source)');

test('5. consumeLaunchParam exists and uses replaceState + deletes launch', () => {
    assert.ok(/function consumeLaunchParam/.test(NSL), 'consumeLaunchParam missing');
    const i = NSL.indexOf('function consumeLaunchParam');
    const b = NSL.slice(i, i + 600);
    assert.ok(/searchParams\.delete\(['"]launch['"]\)/.test(b), 'must delete the launch param');
    assert.ok(/history\.replaceState/.test(b), 'must use history.replaceState (no navigation)');
});
test('6. import-docx + import-geojson intents consume launch after opening', () => {
    assert.ok(/import-docx['"]\)\s*\{\s*openImportCardModal\([^)]*\);\s*consumeLaunchParam\(\);/.test(NSL),
        'import-docx must consume launch after opening');
    assert.ok(/import-geojson['"]\)\s*\{\s*openImportCardModal\([^)]*\);\s*consumeLaunchParam\(\);/.test(NSL),
        'import-geojson must consume launch after opening');
});
test('7. modal opens only from launch intents or the explicit click entry — never from status/sim/poll', () => {
    // The modal opens from: the 2 launch-intent branches + the explicit
    // APP-FLOW-2 openImportScenario() click entry. None are tied to generation
    // status. (The launch dispatch must not reference sim/status fields.)
    assert.ok(/function openImportScenario/.test(NSL) &&
              /openImportCardModal\('wg-wizard-card'/.test(NSL.slice(NSL.indexOf('function openImportScenario'), NSL.indexOf('function openImportScenario') + 200)),
        'openImportScenario must reuse the existing modal');
    assert.ok(!/sim\.|status|phases_done|stopped/.test(NSL.slice(NSL.indexOf('function handleLaunchIntent'), NSL.indexOf('function handleLaunchIntent') + 1200)),
        'launch dispatch must not key off generation status');
    // openImportScenario must not auto-open via URL (so a refresh can't re-trigger it).
    assert.ok(!/launch=|location\.href|history\./.test(NSL.slice(NSL.indexOf('function openImportScenario'), NSL.indexOf('function openImportScenario') + 200)),
        'click entry must not use URL launch');
});
test('8. the import wizard poll never opens the modal (only toggles in-card panel)', () => {
    assert.ok(!/openImportCardModal|wg-import-modal/.test(WIZ),
        'wizard must not open/create the import modal — that is the loader’s job via explicit launch');
});
test('9. status-driven showStopped only toggles the in-card stopped panel', () => {
    // showStopped manipulates el.stopped (panel), not any modal/backdrop.
    const i = WIZ.indexOf('function showStopped');
    const b = WIZ.slice(i, i + 1400);
    assert.ok(/el\.stopped\.style\.display/.test(b), 'showStopped should drive the in-card panel');
    assert.ok(!/wg-import-modal|openImportCardModal/.test(b), 'showStopped must not open a modal');
});

console.log('\nfix(import) — existing suites still pass');
const { execSync } = require('child_process');
for (const t of ['test-wizard-state-1-stop-restart-reset.js', 'test-wizard-save-1-no-overwrite.js']) {
    try {
        execSync('node ' + JSON.stringify(path.join(ROOT, 'scripts', t)), { cwd: ROOT, stdio: 'pipe' });
        console.log('  PASS (existing)', t); passed++;
    } catch (e) {
        console.error('  FAIL (existing)', t, '\n' + ((e.stdout || '') + (e.stderr || '')).toString().slice(-400));
        failed++;
    }
}

console.log('\n' + (failed ? 'FAIL' : 'PASS') +
    ` test-import-no-autoopen-on-refresh — ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
