/**
 * ROADMAP-2 — Editable Roadmap Status UI tests (static + safety)
 *
 * Verifies the UI-only status editor: 4 status options, an "تحديث الحالة"
 * button, an in-memory model update + live re-render, selection restore,
 * and the unchanged safety contract (no persistence/backend/storage).
 *
 * Usage: node test-roadmap-2.js
 */
'use strict';

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');

const ROOT   = __dirname;
const CLIENT = path.join(ROOT, 'client');
let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); console.log(`  [PASS] ${name}`); passed++; }
    catch (e) { console.log(`  [FAIL] ${name}: ${e.message}`); failed++; }
}

const roadmap = fs.readFileSync(path.join(CLIENT, 'roadmap-page.js'), 'utf8');
const css     = fs.readFileSync(path.join(CLIENT, 'style.css'), 'utf8');

console.log('\n══════════════════════════════════════════════════════════════════');
console.log('  ROADMAP-2 — editable status UI tests');
console.log('══════════════════════════════════════════════════════════════════\n');

// ─── §1  Status editor present with 4 options ────────────────────────────────
console.log('── §1  Status editor + four options ────────────────────────────');

test('detail panel builds a status editor', () => {
    assert.ok(roadmap.includes('roadmap-editor'), 'editor container required');
    assert.ok(roadmap.includes('roadmap-editor-seg'), 'segmented control required');
    assert.ok(/\.roadmap-editor\b/.test(css), 'editor must be styled');
});

test('editor offers the four statuses (completed/in_progress/next/pending)', () => {
    assert.ok(roadmap.includes("STATUS_ORDER"), 'must iterate STATUS_ORDER');
    assert.ok(/STATUS_ORDER\s*=\s*\[\s*'completed',\s*'in_progress',\s*'next',\s*'pending'\s*\]/.test(roadmap),
        'STATUS_ORDER must list all four statuses');
});

test('Arabic labels match the requested vocabulary', () => {
    assert.ok(roadmap.includes("completed:   { ar: 'مكتمل'") || roadmap.includes("ar: 'مكتمل'"), 'مكتمل');
    assert.ok(roadmap.includes("ar: 'قيد العمل'"), 'قيد العمل');
    assert.ok(roadmap.includes("ar: 'القادم'"), 'القادم');
    assert.ok(roadmap.includes("ar: 'مؤجل'"), 'مؤجل');
});

// ─── §2  "تحديث الحالة" button + behavior ─────────────────────────────────────
console.log('\n── §2  "تحديث الحالة" button ────────────────────────────────────');

test('"تحديث الحالة" button exists', () => {
    assert.ok(roadmap.includes('roadmap-update-btn'), 'update button element required');
    assert.ok(roadmap.includes('تحديث الحالة'), 'button must be labelled "تحديث الحالة"');
    assert.ok(/\.roadmap-update-btn/.test(css), 'update button must be styled');
});

test('clicking update applies the chosen status (persisted in ROADMAP-4) and re-renders', () => {
    assert.ok(/item\.s\s*=\s*(staged|target)/.test(roadmap), 'must set item.s to the chosen status');
    assert.ok(/updateBtn\.addEventListener\('click'/.test(roadmap), 'update button must have a click handler');
    assert.ok(/saveStatus\s*\(/.test(roadmap), 'must persist via saveStatus() (ROADMAP-4)');
    assert.ok(roadmap.includes('rerender()'), 'must re-render after the update');
});

test('a status must be chosen before update is enabled (staged choice)', () => {
    assert.ok(/updateBtn\.disabled\s*=\s*true/.test(roadmap), 'update starts disabled');
    assert.ok(/updateBtn\.disabled\s*=\s*\(staged\s*===\s*item\.s\)/.test(roadmap),
        'update enables only when a different status is chosen');
});

test('re-render plumbing exists (renderContent + contentHostRef)', () => {
    assert.ok(/function\s+renderContent/.test(roadmap), 'renderContent must exist');
    assert.ok(roadmap.includes('contentHostRef'), 'a re-render host reference must exist');
    assert.ok(/function\s+rerender/.test(roadmap), 'rerender helper must exist');
});

test('selected item is restored after re-render (object identity)', () => {
    assert.ok(/item\s*===\s*selectedItem/.test(roadmap), 'must compare item identity to restore selection');
    assert.ok(roadmap.includes('reopen'), 'must re-open the selected item after render');
});

// ─── §3  Core ROADMAP-1/1A preserved ─────────────────────────────────────────
console.log('\n── §3  Core preserved ──────────────────────────────────────────');

test('Arabic title preserved', () => {
    assert.ok(roadmap.includes('خارطة تطوير RMOOZ'));
});
test('four phases preserved', () => {
    assert.strictEqual((roadmap.match(/id:\s*'p[1-4]'/g) || []).length, 4);
});
test('current-position marker + route band preserved', () => {
    assert.ok(roadmap.includes('roadmap-progress-marker'), 'marker preserved');
    assert.ok(roadmap.includes('function buildRoute'), 'route band preserved');
});

// ─── §4  SAFETY: UI-only, NO persistence/backend/storage ─────────────────────
console.log('\n── §4  Safety: bounded persistence (admin-only, two endpoints) ──');

test('NO localStorage / sessionStorage (server-side persistence only)', () => {
    assert.ok(!/localStorage\s*[.\[]/.test(roadmap), 'must not use localStorage');
    assert.ok(!/sessionStorage\s*[.\[]/.test(roadmap), 'must not use sessionStorage');
});
// ROADMAP-4 (§5.1): fetch allowed ONLY to /api/roadmap/status; XHR/WebSocket banned.
test('fetch is used ONLY for /api/roadmap/status (no XHR/WebSocket)', () => {
    var calls = roadmap.match(/fetch\s*\(\s*['"]([^'"]+)['"]/g) || [];
    calls.forEach(function (c) { assert.ok(/\/api\/roadmap\/status/.test(c), 'unexpected fetch target: ' + c); });
    assert.ok(!/new\s+XMLHttpRequest|XMLHttpRequest\s*\(/.test(roadmap), 'no XHR');
    assert.ok(!/new\s+WebSocket|WebSocket\s*\(/.test(roadmap), 'no WebSocket');
});
test('the ONLY API referenced is /api/roadmap/status', () => {
    var apis = roadmap.match(/\/api\/[a-z0-9/_-]+/gi) || [];
    apis.forEach(function (a) { assert.ok(/^\/api\/roadmap\/status/.test(a), 'unexpected API: ' + a); });
    assert.ok(!/\/api\/sim\b/.test(roadmap), 'no /api/sim/*');
});
test('editor states the change is saved on the server and shared (ROADMAP-4)', () => {
    assert.ok(/يُحفظ التغيير على الخادم|لجميع المستخدمين|سجل التغييرات/.test(roadmap),
        'editor must state the change persists + is shared');
});
test('NO scenario/map/unit/Event-Log mutation', () => {
    assert.ok(!/window\.units\s*=|window\.map\s*=|window\.lines\s*=/.test(roadmap), 'no global state mutation');
    assert.ok(!/\baddEvent\s*\(|appendMessage\s*\(|eventLog\s*[.\[]/.test(roadmap), 'no Event Log writes');
    assert.ok(!/loadScenario\s*\(|saveScenario\s*\(|commitSim\s*\(|adjudicate\s*\(/i.test(roadmap), 'no scenario/commit calls');
    assert.ok(!/dispatchEvent\s*\([^)]*rmooz:/.test(roadmap), 'no rmooz:* mutation events');
});
test('the ONLY model mutation is item.s on the in-memory PHASES model', () => {
    // item.s assignment is allowed (the editable status); ensure no other
    // assignment writes outside the roadmap model.
    assert.ok(/item\.s\s*=\s*(staged|target)/.test(roadmap), 'status edit present');
    assert.ok(!/PHASES\s*=/.test(roadmap.replace(/var PHASES =/, '')), 'PHASES array is not reassigned');
});

// ─── Results ──────────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(66));
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log('═'.repeat(66) + '\n');
process.exit(failed > 0 ? 1 : 0);
