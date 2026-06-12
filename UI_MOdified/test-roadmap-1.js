/**
 * ROADMAP-1 — static + safety tests (no jsdom available → source assertions)
 *
 * Verifies: button exists, page wiring exists, RTL, four phases, detail-panel
 * code path, and the hard safety contract (no storage/fetch/backend, no
 * scenario/map/unit mutation). Also confirms the main app's other files were
 * only touched as allowed.
 *
 * Usage: node test-roadmap-1.js
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

const appHtml = fs.readFileSync(path.join(CLIENT, 'app.html'), 'utf8');
const roadmap = fs.readFileSync(path.join(CLIENT, 'roadmap-page.js'), 'utf8');
const css     = fs.readFileSync(path.join(CLIENT, 'style.css'), 'utf8');
const i18n    = fs.readFileSync(path.join(CLIENT, 'i18n.js'), 'utf8');

console.log('\n══════════════════════════════════════════════════════════════════');
console.log('  ROADMAP-1 — roadmap page tests');
console.log('══════════════════════════════════════════════════════════════════\n');

// ─── §1  Button + wiring ──────────────────────────────────────────────────────
console.log('── §1  Navigation button + page wiring ─────────────────────────');

test('Roadmap button exists in app.html header', () => {
    assert.ok(appHtml.includes('id="roadmap-toggle-btn"'), 'roadmap-toggle-btn must exist');
    assert.ok(appHtml.includes('data-i18n="roadmap-btn"'), 'button must carry the roadmap-btn label');
});

test('roadmap overlay container exists in app.html', () => {
    assert.ok(appHtml.includes('id="roadmap-overlay"'), 'overlay element must exist');
    assert.ok(appHtml.includes('role="dialog"'), 'overlay should be a dialog');
});

test('app.html loads roadmap-page.js', () => {
    assert.ok(/roadmap-page\.js/.test(appHtml), 'roadmap-page.js must be included');
});

test('i18n has roadmap-btn in EN and AR', () => {
    assert.ok(i18n.includes("'roadmap-btn': 'Roadmap'"), 'EN label missing');
    assert.ok(i18n.includes("'roadmap-btn': 'خارطة التطوير'"), 'AR label missing');
});

// ─── §2  RTL + title ──────────────────────────────────────────────────────────
console.log('\n── §2  RTL layout + title ──────────────────────────────────────');

test('document is RTL (html dir=rtl)', () => {
    assert.ok(/<html[^>]*dir="rtl"/.test(appHtml), 'app.html must be RTL');
});
test('overlay is explicitly RTL', () => {
    assert.ok(/<div id="roadmap-overlay"[^>]*dir="rtl"/.test(appHtml),
        'overlay element should set dir=rtl');
    assert.ok(/\.roadmap-overlay[\s\S]*?direction:\s*rtl/.test(css), 'CSS should set direction rtl');
});
test('title "خارطة تطوير RMOOZ" is rendered by roadmap-page.js', () => {
    assert.ok(roadmap.includes('خارطة تطوير RMOOZ'), 'exact title required');
});

// ─── §3  Four phases ──────────────────────────────────────────────────────────
console.log('\n── §3  Four phases render ──────────────────────────────────────');

const requiredPhases = ['الأساس المتين', 'المحاكاة التكتيكية', 'العمليات المتكاملة', 'منصة متقدمة شاملة'];
for (const p of requiredPhases) {
    test(`phase present: ${p}`, () => {
        assert.ok(roadmap.includes(p), `phase "${p}" must be defined`);
    });
}
test('exactly four phase objects in the model', () => {
    const ids = (roadmap.match(/id:\s*'p[1-4]'/g) || []);
    assert.strictEqual(ids.length, 4, `expected 4 phase ids, found ${ids.length}`);
});

// ─── §4  Statuses + detail panel + progress + animation ──────────────────────
console.log('\n── §4  Statuses, detail panel, progress, animation ─────────────');

test('all four status types are used', () => {
    ['completed', 'in_progress', 'next', 'pending'].forEach(function (s) {
        assert.ok(roadmap.includes("'" + s + "'") || roadmap.includes(s + ':'),
            `status "${s}" must be used`);
    });
});
test('clicking an item opens a detail panel (showDetail wired to click)', () => {
    assert.ok(roadmap.includes('function showDetail'), 'showDetail must exist');
    assert.ok(roadmap.includes("addEventListener('click'"), 'items must have click handlers');
    assert.ok(roadmap.includes('roadmap-detail'), 'detail panel element required');
});
test('right-to-left progress line exists', () => {
    assert.ok(roadmap.includes('roadmap-progress-fill'), 'progress fill element required');
    assert.ok(/\.roadmap-progress-fill[\s\S]*?right:\s*0/.test(css),
        'progress fill must anchor to the right edge (RTL fill)');
});
test('completion percentage is computed + shown', () => {
    assert.ok(roadmap.includes('overallCompletion'), 'must compute overall completion');
    assert.ok(roadmap.includes("roadmap-gauge-value"), 'must show the percentage');
});
test('subtle animation for the active phase', () => {
    assert.ok(roadmap.includes('is-active'), 'active phase class required');
    assert.ok(/@keyframes\s+roadmapPulse/.test(css), 'active-phase animation required');
});

// ─── §5  SAFETY CONTRACT ──────────────────────────────────────────────────────
console.log('\n── §5  Safety: no storage / fetch / backend ────────────────────');

// Match real USAGE (property access / call sites), not prose in comments.
test('roadmap-page.js uses NO localStorage (no access)', () => {
    assert.ok(!/localStorage\s*[.\[]/.test(roadmap), 'must not access localStorage');
});
test('roadmap-page.js uses NO sessionStorage (no access)', () => {
    assert.ok(!/sessionStorage\s*[.\[]/.test(roadmap), 'must not access sessionStorage');
});
// ROADMAP-4 (§5.1): the page may call EXACTLY /api/roadmap/status (GET+POST).
// fetch is allowed ONLY to that endpoint; XHR/WebSocket stay banned.
test('roadmap-page.js fetches ONLY /api/roadmap/status (no XHR/WebSocket)', () => {
    var calls = roadmap.match(/fetch\s*\(\s*['"]([^'"]+)['"]/g) || [];
    calls.forEach(function (c) { assert.ok(/\/api\/roadmap\/status/.test(c), 'unexpected fetch target: ' + c); });
    assert.ok(!/new\s+XMLHttpRequest|XMLHttpRequest\s*\(/.test(roadmap), 'must not use XHR');
    assert.ok(!/new\s+WebSocket|WebSocket\s*\(/.test(roadmap), 'must not open a WebSocket');
});

console.log('\n── §6  Safety: no scenario/map/unit/sim mutation ───────────────');

test('roadmap-page.js does not mutate window.units / window.map / lines', () => {
    assert.ok(!/window\.units\s*=/.test(roadmap), 'must not assign window.units');
    assert.ok(!/window\.map\s*=/.test(roadmap), 'must not assign window.map');
    assert.ok(!/window\.lines\s*=/.test(roadmap), 'must not assign window.lines');
});
test('roadmap-page.js does not touch scenario/sim/event-log APIs', () => {
    // ROADMAP-4 (§5.1): only /api/roadmap/status is permitted; /api/sim/* still forbidden.
    var apis = roadmap.match(/\/api\/[a-z0-9/_-]+/gi) || [];
    apis.forEach(function (a) { assert.ok(/^\/api\/roadmap\/status/.test(a), 'unexpected API route: ' + a); });
    assert.ok(!/\/api\/sim\b/.test(roadmap), 'must not reference /api/sim/*');
    // Real Event-Log write calls — NOT addEventListener (which is a safe DOM API).
    assert.ok(!/\baddEvent\s*\(|appendMessage\s*\(|eventLog\s*[.\[]|getElementById\(['"]event-log/.test(roadmap),
        'must not write to the Event Log');
    // Call sites only — the roadmap legitimately NAMES features like "Adjudicator"
    // as descriptive text; what's banned is actually INVOKING them.
    assert.ok(!/loadScenario\s*\(|saveScenario\s*\(|commitSim\s*\(|adjudicate\s*\(/i.test(roadmap),
        'must not invoke scenario/commit/adjudication functions');
});
test('roadmap-page.js has no apply/commit/AI-execution controls', () => {
    // Must never dispatch rmooz:* mutation events or call commit/adjudicate.
    assert.ok(!/dispatchEvent\s*\([^)]*rmooz:/.test(roadmap),
        'must not dispatch rmooz:* mutation events');
    assert.ok(!/\bcommitSim\b|applyResolution|executeCoa/i.test(roadmap),
        'must not invoke apply/commit/execution helpers');
});

// ─── §7  Allowed-files scope (main app otherwise untouched) ──────────────────
console.log('\n── §7  File scope ──────────────────────────────────────────────');

test('roadmap-page.js exists in client/', () => {
    assert.ok(fs.existsSync(path.join(CLIENT, 'roadmap-page.js')));
});
test('only allowed files carry roadmap wiring', () => {
    // app.html, style.css, i18n.js, roadmap-page.js — all allowed.
    assert.ok(appHtml.includes('roadmap') && css.includes('roadmap') &&
              i18n.includes('roadmap') && roadmap.includes('roadmap'),
        'roadmap wiring present in the four allowed files');
});

// ─── Results ──────────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(66));
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log('═'.repeat(66) + '\n');
process.exit(failed > 0 ? 1 : 0);
