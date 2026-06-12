#!/usr/bin/env node
'use strict';
/**
 * APP-FLOW-2 — in-app scenario run bar (Load + Import + current-scenario label
 * in the bottom timeline strip).
 *
 * Markup + browser-IIFE wiring are verified by source assertions; the label
 * logic is replicated for a behavioural check (repo pattern).
 *
 * Run:  node scripts/test-app-flow-2-run-bar.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'client', 'app.html'), 'utf8');
const TL   = fs.readFileSync(path.join(ROOT, 'client', 'shell', 'timeline.js'), 'utf8');
const NSL  = fs.readFileSync(path.join(ROOT, 'client', 'shell', 'native-scenario-loader.js'), 'utf8');

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); console.log('  PASS', name); passed++; }
    catch (e) { console.error('  FAIL', name, '—', e.message); failed++; }
}

console.log('\nAPP-FLOW-2 — run bar markup');

test('1. timeline strip shows a "No scenario loaded" default label', () => {
    assert.ok(/id="tl-scenario-name"/.test(HTML), '#tl-scenario-name missing');
    assert.ok(/No scenario loaded/.test(HTML) && /لا يوجد سيناريو/.test(HTML), 'bilingual empty label missing');
});
test('2. Load Scenario button exists in the timeline bar', () => {
    assert.ok(/id="tl-load-scenario"/.test(HTML), 'Load button missing');
    assert.ok(/تحميل/.test(HTML), 'bilingual Load label missing');
});
test('3. Import Scenario button exists in the timeline bar', () => {
    assert.ok(/id="tl-import-scenario"/.test(HTML), 'Import button missing');
    assert.ok(/استيراد/.test(HTML), 'bilingual Import label missing');
});
test('3b. scenario group sits inside the timeline strip', () => {
    const strip = HTML.indexOf('id="timeline-strip"');
    const grp = HTML.indexOf('timeline-group--scenario');
    const end = HTML.indexOf('id="event-log"') >= 0 ? HTML.indexOf('id="event-log"') : HTML.length;
    assert.ok(strip >= 0 && grp > strip && grp < end, 'scenario group must be within the timeline strip');
});

console.log('\nAPP-FLOW-2 — wiring (source)');

test('4. Import button → openImportScenario (modal, opens once via existing guard)', () => {
    assert.ok(/openImportScenario/.test(TL) && /tl-import-scenario/.test(TL), 'import not wired in timeline.js');
    const i = NSL.indexOf('function openImportScenario');
    const b = NSL.slice(i, i + 200);
    assert.ok(/openImportCardModal\('wg-wizard-card'/.test(b), 'must reuse the existing import modal');
    // The modal has an already-open guard so repeated clicks open it once.
    assert.ok(/getElementById\('wg-import-modal'\)\) return/.test(NSL), 'import modal must guard against double-open');
});
test('5. Import opens only from a click (no URL launch) → no auto-open on refresh', () => {
    // openImportScenario does not navigate / set ?launch=, so a refresh cannot re-trigger it.
    const i = NSL.indexOf('function openImportScenario');
    const b = NSL.slice(i, i + 200);
    assert.ok(!/launch=|location\.href|history\./.test(b), 'import entry must not use URL launch');
});
test('6. Load button → openScenarioPicker → loadScenarioByName via normal loader', () => {
    assert.ok(/openScenarioPicker/.test(TL) && /tl-load-scenario/.test(TL), 'load not wired in timeline.js');
    const i = NSL.indexOf('function loadScenarioByName');
    const b = NSL.slice(i, i + 1500);
    assert.ok(/\/api\/ai\/scenario\//.test(b) && /loadLiveScenarioFromJson/.test(b), 'must reuse the normal loader');
    assert.ok(/isSafeScenarioName\(name\)/.test(b), 'must validate the name (no traversal)');
    assert.ok(/rememberLastLoadedScenario\(name\)/.test(b), 'must remember the pointer for refresh restore');
    const p = NSL.indexOf('function openScenarioPicker');
    assert.ok(/\/api\/ai\/scenarios/.test(NSL.slice(p, p + 600)), 'picker must list scenarios from the server');
});
test('7+8. playback hint when no scenario; transport unchanged (placeholder, no crash)', () => {
    const i = TL.indexOf('function refreshScenarioLabel');
    const b = TL.slice(i, i + 800);
    assert.ok(/timeline-group--transport/.test(b), 'must reference the transport group');
    assert.ok(/opacity/.test(b) && /Load a scenario first|tl-load-first/.test(b), 'must show a load-first hint');
    // bindTransport still present + unchanged behaviour (no scenario calls).
    assert.ok(/function bindTransport/.test(TL) && /dispatchUiAction\('play'\)/.test(TL), 'transport wiring preserved');
});
test('helpers exported on AppNativeScenarioLoader', () => {
    assert.ok(/openImportScenario:\s*openImportScenario/.test(NSL));
    assert.ok(/openScenarioPicker:\s*openScenarioPicker/.test(NSL));
    assert.ok(/loadScenarioByName:\s*loadScenarioByName/.test(NSL));
});

console.log('\nAPP-FLOW-2 — label logic (behavioural)');

const NO_SCENARIO = 'No scenario loaded · لا يوجد سيناريو محمّل';
function currentScenarioName(win) {
    try { const s = win.RmoozScenario && win.RmoozScenario.scenario; return s ? (s.scenario_label || s.name || s.id || null) : null; }
    catch (_) { return null; }
}
test('6b. label reflects the loaded scenario / empty state', () => {
    assert.strictEqual(currentScenarioName({}), null);
    assert.strictEqual(currentScenarioName({ RmoozScenario: { scenario: { name: 'gulf_x' } } }), 'gulf_x');
    assert.strictEqual(currentScenarioName({ RmoozScenario: { scenario: { scenario_label: 'Gulf X' } } }), 'Gulf X');
    const lbl = currentScenarioName({}) || NO_SCENARIO;
    assert.ok(/No scenario loaded/.test(lbl));
});

// Note: related suites (no-autoopen, loader-restore, wizard-state, wizard-save,
// map-clarity) are run as SEPARATE top-level processes in the verification sweep
// — not embedded here. Nesting them via execSync transitively re-runs
// test-unified-import-3 (which snapshots data/scenarios) and flakes when the dev
// server is live and mutating _active.json. Keeping this suite source/behavioural
// makes it deterministic regardless of server state.

console.log('\n' + (failed ? 'FAIL' : 'PASS') +
    ` test-app-flow-2-run-bar — ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
