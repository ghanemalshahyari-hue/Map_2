'use strict';
/**
 * test-demo-scenario-preview.js — PR #10 verification
 *
 * Verifies that demo-scenario-preview.js on the fix/review-density-objective-preview
 * branch correctly implements the safe Objective X priority:
 *   1. Explicit user/operator objective fields
 *   2. operational_brief.objectives[]
 *   3. area_of_operations.center  (approximate fallback)
 *   4. NEVER placement_candidates
 *
 * Usage: node test-demo-scenario-preview.js
 */

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');
const vm     = require('vm');

const ROOT     = __dirname;
const SRC_PATH = path.join(ROOT, 'client', 'shell', 'demo-scenario-preview.js');
const src      = fs.readFileSync(SRC_PATH, 'utf8');

// ── Test runner ──────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
const queue = [];
function test(name, fn) { queue.push({ name, fn }); }

// ── Sandbox helpers ──────────────────────────────────────────────────────────

/** Minimal DOM element stub — enough to silence document.createElement/body calls */
function makeElem() {
    const el = {
        style: { cssText: '' },
        id: '',
        innerHTML: '',
        parentNode: null,
        appendChild(child) { if (child) child.parentNode = el; return child; },
        removeChild() {},
        querySelector() { return null; },
        addEventListener() {},
    };
    return el;
}

function makeDoc() {
    return { createElement() { return makeElem(); }, body: makeElem(), getElementById() { return null; } };
}

/**
 * Runs the IIFE in a fresh vm context.
 * window.L / window.map are absent → mapReady() === false → no Leaflet calls.
 * window.fetch is stubbed to capture the request body and return a valid preview.
 *
 * Returns { api: window.RmoozDemoPreview, captures: Array<{url, body}> }.
 */
function makeSandbox() {
    const captures = [];
    const win = {
        fetch(url, opts) {
            captures.push({ url, body: opts ? JSON.parse(opts.body) : null });
            return Promise.resolve({
                json() {
                    return Promise.resolve({ ok: true, preview: { _isPreview: true, steps: [] } });
                }
            });
        },
        // L and map intentionally absent — keeps mapReady() false throughout the test
    };
    const ctx = { window: win, document: makeDoc(), console: console };
    vm.runInNewContext(src, ctx);
    return { api: ctx.window.RmoozDemoPreview, captures };
}

// ── §1  Static assertions ────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════════════════════');
console.log('  test-demo-scenario-preview.js — PR #10 verification');
console.log('══════════════════════════════════════════════════════════════════\n');
console.log('§1  Static assertions');

test('source contains asObjectiveCoord helper', function () {
    assert.ok(src.includes('function asObjectiveCoord'), 'asObjectiveCoord missing');
});

test('source contains _deriveObjective function', function () {
    assert.ok(src.includes('function _deriveObjective'), '_deriveObjective missing');
});

test('old placement_candidates-first pattern is absent', function () {
    // The old code did: var cands = (payload && payload.placement && payload.placement.placement_candidates)
    assert.ok(!src.includes('payload.placement.placement_candidates'),
        'Old payload.placement.placement_candidates pattern still present');
    assert.ok(!src.includes('var cands = (payload && payload.placement &&'),
        'Old var cands assignment still present');
});

test('source checks _isPreview flag on server response', function () {
    assert.ok(src.includes('_isPreview'), '_isPreview check missing');
    assert.ok(src.includes('!preview || !preview._isPreview'),
        'Missing guard for invalid preview object');
});

test('source never assigns to window.RmoozScenario.stepIndex', function () {
    // Strip block and line comments before checking — the isolation guarantee is
    // documented in the header comment as "Never touches window.RmoozScenario.stepIndex"
    // which would otherwise trigger a false positive.
    const code = src
        .replace(/\/\*[\s\S]*?\*\//g, '')   // block comments
        .replace(/\/\/[^\n]*/g, '');          // line comments
    assert.ok(!code.includes('window.RmoozScenario.stepIndex'),
        'Isolation violated: assignment to window.RmoozScenario.stepIndex found in code (not comments)');
});

test('source never calls /api/sim/commit', function () {
    assert.ok(!src.includes('/api/sim/commit'),
        'Isolation violated: /api/sim/commit call found');
});

test('source never references window.units', function () {
    assert.ok(!src.includes('window.units'),
        'Isolation violated: window.units reference found');
});

test('public API exports correct shape', function () {
    assert.ok(src.includes('build: build'),        'build missing from export');
    assert.ok(src.includes('clear: clear'),        'clear missing from export');
    assert.ok(src.includes('isActive: isActive'),  'isActive missing from export');
    assert.ok(src.includes('stepTo: stepTo'),      'stepTo missing from export');
    assert.ok(src.includes('getStepCount: getStepCount'), 'getStepCount missing from export');
});

// ── §2  Functional — _deriveObjective priority ───────────────────────────────
console.log('§2  Functional — _deriveObjective priority');

test('only placement_candidates present → no objective sent to server', async function () {
    const { api, captures } = makeSandbox();
    await api.build({
        placement_candidates: [{ lat: 32.5, lon: 36.2 }],
        brief: { operational_brief: {} }
    });
    assert.strictEqual(captures.length, 1, 'Expected exactly one fetch call');
    assert.ok(!captures[0].body.objective,
        'objective must NOT be derived from placement_candidates; got: ' +
        JSON.stringify(captures[0].body.objective));
});

test('payload.placement.placement_candidates only → no objective sent', async function () {
    const { api, captures } = makeSandbox();
    await api.build({
        placement: { placement_candidates: [{ lat: 33.0, lon: 36.5 }] },
        brief: { operational_brief: {} }
    });
    assert.strictEqual(captures.length, 1);
    assert.ok(!captures[0].body.objective,
        'objective must NOT derive from placement.placement_candidates; got: ' +
        JSON.stringify(captures[0].body.objective));
});

test('placement_candidates present alongside empty objectives[] → still no objective', async function () {
    const { api, captures } = makeSandbox();
    await api.build({
        placement_candidates: [{ lat: 50.0, lon: 50.0 }, { lat: 51.0, lon: 51.0 }],
        brief: { operational_brief: { objectives: [] } }
    });
    assert.strictEqual(captures.length, 1);
    assert.ok(!captures[0].body.objective,
        'placement_candidates must never fill the objective even when objectives[] is empty; got: ' +
        JSON.stringify(captures[0].body.objective));
});

test('operational_brief.objectives[{coord:[lon,lat]}] → correct objective', async function () {
    const { api, captures } = makeSandbox();
    await api.build({
        placement_candidates: [{ lat: 99.0, lon: 99.0 }],   // decoy — must be ignored
        brief: {
            operational_brief: {
                objectives: [{ coord: [36.8, 32.1], label: 'Objective Alpha' }]
            }
        }
    });
    assert.strictEqual(captures.length, 1);
    const obj = captures[0].body.objective;
    assert.ok(obj, 'objective must be set from objectives[{coord}]');
    assert.strictEqual(obj.lon, 36.8, 'lon should be 36.8');
    assert.strictEqual(obj.lat, 32.1, 'lat should be 32.1');
});

test('objectives[{lat,lon}] → resolved via lat/lon fields', async function () {
    const { api, captures } = makeSandbox();
    await api.build({
        brief: {
            operational_brief: {
                objectives: [{ lat: 31.5, lon: 35.9, name: 'Hill 72' }]
            }
        }
    });
    assert.strictEqual(captures.length, 1);
    const obj = captures[0].body.objective;
    assert.ok(obj, 'objective must be resolved from lat/lon on objective object');
    assert.strictEqual(obj.lon, 35.9, 'lon=35.9');
    assert.strictEqual(obj.lat, 31.5, 'lat=31.5');
});

test('explicit payload.objective → takes precedence over objectives[]', async function () {
    const { api, captures } = makeSandbox();
    await api.build({
        objective: { coord: [37.0, 33.0] },
        brief: {
            operational_brief: {
                objectives: [{ coord: [99.0, 99.0] }]  // must be skipped
            }
        }
    });
    assert.strictEqual(captures.length, 1);
    const obj = captures[0].body.objective;
    assert.ok(obj, 'objective must be set from explicit payload.objective');
    assert.strictEqual(obj.lon, 37.0, 'lon=37.0 from payload.objective');
    assert.strictEqual(obj.lat, 33.0, 'lat=33.0 from payload.objective');
});

test('ob.objective_x (inside operational_brief) → correct objective', async function () {
    const { api, captures } = makeSandbox();
    await api.build({
        brief: {
            operational_brief: {
                objective_x: { lon: 35.5, lat: 31.8 }
            }
        }
    });
    assert.strictEqual(captures.length, 1);
    const obj = captures[0].body.objective;
    assert.ok(obj, 'objective must be set from ob.objective_x');
    assert.strictEqual(obj.lon, 35.5, 'lon=35.5');
    assert.strictEqual(obj.lat, 31.8, 'lat=31.8');
});

test('ao.center only → objective uses ao.center as approximate fallback', async function () {
    const { api, captures } = makeSandbox();
    await api.build({
        brief: {
            operational_brief: {
                area_of_operations: { center: [36.0, 32.0] }
            }
        }
    });
    assert.strictEqual(captures.length, 1);
    const obj = captures[0].body.objective;
    assert.ok(obj, 'objective must be set from ao.center fallback');
    assert.strictEqual(obj.lon, 36.0, 'lon=36.0 from ao.center');
    assert.strictEqual(obj.lat, 32.0, 'lat=32.0 from ao.center');
});

test('no objective data at all → no objective, no crash', async function () {
    const { api, captures } = makeSandbox();
    await api.build({ brief: { operational_brief: {} } });
    assert.strictEqual(captures.length, 1);
    assert.ok(!captures[0].body.objective, 'objective must be absent when no source data exists');
});

// ── §3  Isolation guarantees ──────────────────────────────────────────────────
console.log('§3  Isolation guarantees');

test('build() does not mutate the source payload', async function () {
    const payload = {
        placement_candidates: [{ lat: 32.5, lon: 36.2 }],
        brief: {
            operational_brief: {
                objectives: [{ coord: [36.8, 32.1] }]
            }
        }
    };
    const frozen = JSON.parse(JSON.stringify(payload));
    const { api } = makeSandbox();
    await api.build(payload);
    assert.deepStrictEqual(payload, frozen, 'build() must not mutate the source payload');
});

test('isActive() starts false; clear() leaves it false', function () {
    const { api } = makeSandbox();
    assert.strictEqual(api.isActive(), false, 'isActive() should start false');
    api.clear();
    assert.strictEqual(api.isActive(), false, 'isActive() should remain false after clear()');
});

test('getStepCount() returns 0 when no preview is loaded', function () {
    const { api } = makeSandbox();
    assert.strictEqual(api.getStepCount(), 0, 'getStepCount() must be 0 before build()');
});

test('fetch is called only to /api/wargame-sim/generate-preview', async function () {
    const { api, captures } = makeSandbox();
    await api.build({ brief: { operational_brief: {} } });
    assert.strictEqual(captures.length, 1);
    assert.strictEqual(captures[0].url, '/api/wargame-sim/generate-preview',
        'Unexpected fetch URL: ' + captures[0].url);
});

// ── Run ───────────────────────────────────────────────────────────────────────
(async function () {
    for (const { name, fn } of queue) {
        try {
            await fn();
            console.log('  ✓  ' + name);
            passed++;
        } catch (e) {
            console.log('  ✗  ' + name);
            console.log('       ' + e.message.split('\n')[0]);
            failed++;
        }
    }
    console.log('\n──────────────────────────────────────────────────────────────────');
    console.log('  ' + passed + ' passed, ' + failed + ' failed');
    console.log('──────────────────────────────────────────────────────────────────\n');
    if (failed > 0) process.exit(1);
})();
