/**
 * ROADMAP-1A — visual/linguistic polish tests (static + safety)
 *
 * Builds on ROADMAP-1. Verifies the new current-position marker, the moving
 * right-to-left route band, refined Arabic, and re-asserts the core contract:
 * Arabic title, four phases, detail panel, and NO unsafe calls.
 *
 * Usage: node test-roadmap-1a.js
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
console.log('  ROADMAP-1A — roadmap polish tests');
console.log('══════════════════════════════════════════════════════════════════\n');

// ─── §1  Core preserved (title / phases / detail) ────────────────────────────
console.log('── §1  Core ROADMAP-1 behavior preserved ───────────────────────');

test('Arabic title "خارطة تطوير RMOOZ" preserved', () => {
    assert.ok(roadmap.includes('خارطة تطوير RMOOZ'), 'exact title required');
});

test('exactly four phases preserved', () => {
    const ids = (roadmap.match(/id:\s*'p[1-4]'/g) || []);
    assert.strictEqual(ids.length, 4, `expected 4 phase ids, found ${ids.length}`);
    ['الأساس المتين', 'المحاكاة التكتيكية', 'العمليات المتكاملة', 'منصة متقدمة شاملة'].forEach(function (p) {
        assert.ok(roadmap.includes(p), `phase "${p}" must remain`);
    });
});

test('detail panel still opens on item click', () => {
    assert.ok(roadmap.includes('function showDetail'), 'showDetail must exist');
    assert.ok(roadmap.includes("addEventListener('click'"), 'items must have click handlers');
    assert.ok(roadmap.includes('roadmap-detail'), 'detail panel element required');
});

test('all four status types still used', () => {
    ['completed', 'in_progress', 'next', 'pending'].forEach(function (s) {
        assert.ok(roadmap.includes("'" + s + "'") || roadmap.includes(s + ':'),
            `status "${s}" must be used`);
    });
});

// ─── §2  Current-position marker ──────────────────────────────────────────────
console.log('\n── §2  Current-position marker ─────────────────────────────────');

test('progress line has a current-position marker', () => {
    assert.ok(roadmap.includes('roadmap-progress-marker'), 'marker element must be built');
    assert.ok(roadmap.includes('الموقع الحالي'), 'marker must be labelled in Arabic');
});

test('marker is positioned at the completion % (RTL, from the right)', () => {
    assert.ok(/marker\.style\.right\s*=\s*pct\s*\+\s*'%'/.test(roadmap),
        'marker must move to the current completion percentage');
    assert.ok(/\.roadmap-progress-marker[\s\S]*?right:/.test(css) || /\.roadmap-progress-marker-label[\s\S]*?right:/.test(css),
        'marker CSS must anchor from the right (RTL)');
});

test('active phase card carries a "current position" badge', () => {
    assert.ok(roadmap.includes('roadmap-here-badge'), 'active card must show a here-badge');
    assert.ok(/\.roadmap-here-badge/.test(css), 'here-badge must be styled');
});

test('route band marks the active phase node as "here"', () => {
    assert.ok(roadmap.includes('is-here'), 'active route node must get is-here');
    assert.ok(roadmap.includes('roadmap-route-here') || /is-here/.test(css),
        'here state must be represented');
});

// ─── §3  Moving right-to-left route/path animation ───────────────────────────
console.log('\n── §3  Moving right-to-left route animation ────────────────────');

test('route band is built with four nodes', () => {
    assert.ok(roadmap.includes('function buildRoute'), 'buildRoute must exist');
    assert.ok(roadmap.includes('roadmap-route-nodes') && roadmap.includes('roadmap-route-node'),
        'route nodes must be created (one per phase)');
});

test('a moving flow/route animation exists (right-to-left)', () => {
    // Either the progress shimmer or the route line provides the motion.
    assert.ok(/@keyframes\s+roadmapFlow/.test(css) || /@keyframes\s+roadmapRoute/.test(css),
        'a flow/route keyframe animation must exist');
    // RTL motion = background drifts to a NEGATIVE x position.
    assert.ok(/background-position:\s*-\d+px\s+0/.test(css),
        'animation must drift leftward (negative background-position) for RTL motion');
});

test('route line element is present + animated', () => {
    assert.ok(roadmap.includes('roadmap-route-line'), 'route line element required');
    assert.ok(/\.roadmap-route-line[\s\S]*?animation:/.test(css), 'route line must be animated');
});

test('reduced-motion is respected', () => {
    assert.ok(/prefers-reduced-motion[\s\S]*?animation:\s*none/.test(css),
        'animations must be disabled under prefers-reduced-motion');
});

// ─── §4  Readability + RTL ────────────────────────────────────────────────────
console.log('\n── §4  Readability + RTL ───────────────────────────────────────');

test('per-phase progress bar added (RTL fill from right)', () => {
    assert.ok(roadmap.includes('roadmap-phase-bar'), 'per-phase bar must be built');
    assert.ok(/\.roadmap-phase-bar-fill[\s\S]*?right:\s*0/.test(css),
        'phase bar fill must anchor to the right (RTL)');
});

test('overlay + gauge remain RTL', () => {
    assert.ok(/\.roadmap-overlay[\s\S]*?direction:\s*rtl/.test(css), 'overlay must stay RTL');
});

test('refined Arabic subtitles present (polish landed)', () => {
    assert.ok(roadmap.includes('وجاهزية العمل دون اتصال'), 'phase 1 subtitle refined');
    assert.ok(roadmap.includes('التحليلات التنبؤية'), 'phase 4 subtitle refined');
});

// ─── §5  SAFETY CONTRACT (unchanged) ──────────────────────────────────────────
console.log('\n── §5  Safety contract unchanged ───────────────────────────────');

test('no storage access', () => {
    assert.ok(!/localStorage\s*[.\[]/.test(roadmap), 'no localStorage');
    assert.ok(!/sessionStorage\s*[.\[]/.test(roadmap), 'no sessionStorage');
});
// ROADMAP-4 (§5.1): fetch is allowed ONLY to /api/roadmap/status; XHR/WebSocket stay banned.
test('fetch is used ONLY for /api/roadmap/status (no XHR/WebSocket)', () => {
    var calls = roadmap.match(/fetch\s*\(\s*['"]([^'"]+)['"]/g) || [];
    calls.forEach(function (c) { assert.ok(/\/api\/roadmap\/status/.test(c), 'unexpected fetch target: ' + c); });
    assert.ok(!/new\s+XMLHttpRequest|XMLHttpRequest\s*\(/.test(roadmap), 'no XHR');
    assert.ok(!/new\s+WebSocket|WebSocket\s*\(/.test(roadmap), 'no WebSocket');
});
test('the ONLY API referenced is /api/roadmap/status (no /api/sim, etc.)', () => {
    var apis = roadmap.match(/\/api\/[a-z0-9/_-]+/gi) || [];
    apis.forEach(function (a) { assert.ok(/^\/api\/roadmap\/status/.test(a), 'unexpected API: ' + a); });
    assert.ok(!/\/api\/sim\b/.test(roadmap), 'no /api/sim/*');
});
test('no scenario/map/unit/event-log mutation', () => {
    assert.ok(!/window\.units\s*=|window\.map\s*=|window\.lines\s*=/.test(roadmap), 'no global state mutation');
    assert.ok(!/\baddEvent\s*\(|appendMessage\s*\(|eventLog\s*[.\[]/.test(roadmap), 'no Event Log writes');
    assert.ok(!/loadScenario\s*\(|saveScenario\s*\(|commitSim\s*\(|adjudicate\s*\(/i.test(roadmap), 'no scenario/commit calls');
    assert.ok(!/dispatchEvent\s*\([^)]*rmooz:/.test(roadmap), 'no rmooz:* mutation events');
});

// ─── Results ──────────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(66));
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log('═'.repeat(66) + '\n');
process.exit(failed > 0 ? 1 : 0);
