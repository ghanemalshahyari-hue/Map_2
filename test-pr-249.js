'use strict';

// ── PR-249 Test Harness — Wargame 3 Movement Trail Coverage Audit ─────────────
// Tests auditWargame3MovementTrailCoverage: input guard, return shape, all
// summary stats, transition-level fields, bestTransitions / quietTransitions /
// clutteredTransitions, paint-option gating, safety invariants, and existing
// functions unaffected.
// No DOM. No Leaflet. No window.units. No window.lines. No storage. No fetch.

var fs   = require('fs');
var path = require('path');

var src    = fs.readFileSync(
    path.join(__dirname, 'UI_MOdified/client/shell/scenario-workspace.js'), 'utf8');
var w3json = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'UI_MOdified/data/scenarios/wargame3.json'), 'utf8'));

// ── Brace-matched function extractor ─────────────────────────────────────────
function extractFn(fnName) {
    var re  = new RegExp('function\\s+' + fnName + '\\s*\\(');
    var idx = src.search(re);
    if (idx === -1) { throw new Error('Cannot find function: ' + fnName); }
    var start = src.indexOf('{', idx);
    var depth = 0; var i = start;
    while (i < src.length) {
        if (src[i] === '{')      { depth++; }
        else if (src[i] === '}') { depth--; }
        if (depth === 0)         { break; }
        i++;
    }
    return src.slice(idx, i + 1);
}

// ── Minimal window mock ───────────────────────────────────────────────────────
var window = {
    // Track paint calls for tests 18-22
    _p249PaintCalled: false,
    L: null   // no Leaflet in test env
};

// ── Extract code blocks ───────────────────────────────────────────────────────
var bsspStart = src.indexOf('    var _BSSP_SAFETY_TRUE');
var bsspEnd   = src.indexOf('    function buildScenarioStepPreview', bsspStart);
var bsspSrc   = src.slice(bsspStart, bsspEnd);

var w3aStart = src.indexOf('// ── PR-215: Wargame 3 Fixture Adapter');
var w3aEnd   = src.indexOf('// ── PR-216: Wargame 3 Dry-Run Preview Harness');
if (w3aEnd === -1) { throw new Error('Cannot find PR-216 marker'); }
var w3aSrc = src.slice(w3aStart, w3aEnd);

var w3modConstStart = src.indexOf('// ── PR-241: Read-Only Map Overlay Data Builder — unsafe');
var w3modConstEnd   = src.indexOf('// ── PR-241: Wargame 3 Read-Only Map Overlay type guard');
var w3modConstSrc   = src.slice(w3modConstStart, w3modConstEnd);

var builderSrc      = extractFn('buildScenarioStepPreview');
var harnSrc         = extractFn('previewWargame3Fixture');
var isGuardSrc      = extractFn('isWargame3ReadOnlyMapOverlayDataSafe');
var buildOverlaySrc = extractFn('buildWargame3ReadOnlyMapOverlayData');
var auditCovSrc     = extractFn('auditWargame3MapPreviewCoverage');
var auditDeltaSrc   = extractFn('auditWargame3StepCoordinateDeltas');
var auditTrailSrc   = extractFn('auditWargame3MovementTrailCoverage');

// Stub paintWargame3ReadOnlyMapOverlay — no DOM/Leaflet in test environment.
// Records that it was called so tests 18-22 can verify paint gating.
var paintStubSrc = [
    'function paintWargame3ReadOnlyMapOverlay(overlay, options) {',
    '    window._p249PaintCalled = true;',
    '    return { passed: true, painted: false, markerCount: 0,',
    '             objectiveHighlightCount: 0, effectHintCount: 0,',
    '             movementTrailCount: 0, skippedCount: 0,',
    '             blockedReasons: [], warnings: [] };',
    '}'
].join('\n');

// ── Build execution environment ───────────────────────────────────────────────
var combined = [
    bsspSrc,
    builderSrc,
    w3aSrc,
    harnSrc,
    w3modConstSrc,
    isGuardSrc,
    buildOverlaySrc,
    paintStubSrc,            // stubbed — no real Leaflet needed
    auditCovSrc,
    auditDeltaSrc,
    auditTrailSrc
].join('\n');

var fn = new Function('window',
    combined + '\nreturn {' +
    ' adaptWargame3ToFixture:              adaptWargame3ToFixture,' +
    ' buildScenarioStepPreview:            buildScenarioStepPreview,' +
    ' previewWargame3Fixture:              previewWargame3Fixture,' +
    ' buildWargame3ReadOnlyMapOverlayData: buildWargame3ReadOnlyMapOverlayData,' +
    ' auditWargame3MapPreviewCoverage:     auditWargame3MapPreviewCoverage,' +
    ' auditWargame3StepCoordinateDeltas:   auditWargame3StepCoordinateDeltas,' +
    ' auditWargame3MovementTrailCoverage:  auditWargame3MovementTrailCoverage };'
);
var api = fn(window);

// ── Test runner ───────────────────────────────────────────────────────────────
var passed = 0; var failed = 0; var results = [];
function assert(label, cond, detail) {
    if (cond) { passed++; results.push('  PASS  ' + label); }
    else       { failed++; results.push('  FAIL  ' + label + (detail ? '  →  ' + detail : '')); }
}

// ── Run the audit once and cache result ───────────────────────────────────────
window._p249PaintCalled = false;
var auditResult = api.auditWargame3MovementTrailCoverage(w3json);

// ── T01: null w3json blocks safely ────────────────────────────────────────────
var t01 = api.auditWargame3MovementTrailCoverage(null);
assert('T01 — null w3json returns passed:false without throwing',
    t01.passed === false && t01.blockedReasons.length > 0,
    JSON.stringify(t01.blockedReasons));

// ── T02: valid W3 data returns passed:true ────────────────────────────────────
assert('T02 — valid W3 data returns passed:true',
    auditResult.passed === true,
    JSON.stringify(auditResult.blockedReasons));

// ── T03: stepCount remains 17 ─────────────────────────────────────────────────
assert('T03 — stepCount === 17',
    auditResult.stepCount === 17,
    'got: ' + auditResult.stepCount);

// ── T04: transitionCount equals 16 ───────────────────────────────────────────
assert('T04 — transitionCount === 16 (17 steps → 16 N-1→N transitions)',
    auditResult.transitionCount === 16,
    'got: ' + auditResult.transitionCount);

// ── T05: transitions array length equals 16 ──────────────────────────────────
assert('T05 — transitions.length === 16',
    Array.isArray(auditResult.transitions) && auditResult.transitions.length === 16,
    'got: ' + (auditResult.transitions ? auditResult.transitions.length : 'N/A'));

// ── T06: totalMovementTrails is calculated ────────────────────────────────────
assert('T06 — totalMovementTrails is a non-negative integer',
    typeof auditResult.totalMovementTrails === 'number' &&
    Number.isFinite(auditResult.totalMovementTrails) &&
    auditResult.totalMovementTrails >= 0,
    'got: ' + auditResult.totalMovementTrails);

assert('T06b — totalMovementTrails equals sum of transition movementTrailCounts',
    auditResult.totalMovementTrails ===
    auditResult.transitions.reduce(function (s, t) { return s + t.movementTrailCount; }, 0),
    'audit=' + auditResult.totalMovementTrails);

// ── T07: transitionsWithTrails is calculated ──────────────────────────────────
assert('T07 — transitionsWithTrails equals count of transitions with movementTrailCount > 0',
    auditResult.transitionsWithTrails ===
    auditResult.transitions.filter(function (t) { return t.movementTrailCount > 0; }).length,
    'got: ' + auditResult.transitionsWithTrails);

// ── T08: transitionsWithoutTrails is calculated ───────────────────────────────
assert('T08 — transitionsWithoutTrails + transitionsWithTrails === transitionCount',
    auditResult.transitionsWithTrails + auditResult.transitionsWithoutTrails ===
    auditResult.transitionCount,
    'with=' + auditResult.transitionsWithTrails +
    ' without=' + auditResult.transitionsWithoutTrails +
    ' total=' + auditResult.transitionCount);

// ── T09: maxTrailsInTransition is calculated ──────────────────────────────────
var expectedMax = auditResult.transitions.reduce(function (m, t) {
    return Math.max(m, t.movementTrailCount); }, 0);
assert('T09 — maxTrailsInTransition equals actual max of transition trail counts',
    auditResult.maxTrailsInTransition === expectedMax,
    'got=' + auditResult.maxTrailsInTransition + ' expected=' + expectedMax);

// ── T10: averageTrailsPerTransition is calculated ─────────────────────────────
var expectedAvg = auditResult.transitionCount > 0
    ? Math.round((auditResult.totalMovementTrails / auditResult.transitionCount) * 100) / 100 : 0;
assert('T10 — averageTrailsPerTransition is numeric and matches rounded total/count',
    typeof auditResult.averageTrailsPerTransition === 'number' &&
    auditResult.averageTrailsPerTransition === expectedAvg,
    'got=' + auditResult.averageTrailsPerTransition + ' expected=' + expectedAvg);

// ── T11: sideBreakdown is calculated ─────────────────────────────────────────
assert('T11 — sideBreakdown has friendly, enemy, neutral, unknown keys',
    auditResult.sideBreakdown &&
    typeof auditResult.sideBreakdown.friendly === 'number' &&
    typeof auditResult.sideBreakdown.enemy    === 'number' &&
    typeof auditResult.sideBreakdown.neutral  === 'number' &&
    typeof auditResult.sideBreakdown.unknown  === 'number',
    JSON.stringify(auditResult.sideBreakdown));

assert('T11b — sideBreakdown total equals totalMovementTrails',
    (auditResult.sideBreakdown.friendly +
     auditResult.sideBreakdown.enemy    +
     auditResult.sideBreakdown.neutral  +
     auditResult.sideBreakdown.unknown) === auditResult.totalMovementTrails,
    'breakdown sum=' + (auditResult.sideBreakdown.friendly +
                        auditResult.sideBreakdown.enemy    +
                        auditResult.sideBreakdown.neutral  +
                        auditResult.sideBreakdown.unknown) +
    ' total=' + auditResult.totalMovementTrails);

// ── T12: every transition has fromStepRef and toStepRef ──────────────────────
assert('T12 — every transition has non-empty fromStepRef and toStepRef strings',
    auditResult.transitions.every(function (t) {
        return typeof t.fromStepRef === 'string' && t.fromStepRef &&
               typeof t.toStepRef   === 'string' && t.toStepRef;
    }),
    'first bad: ' + JSON.stringify(
        auditResult.transitions.find(function (t) {
            return !t.fromStepRef || !t.toStepRef;
        })));

// ── T13: every transition has movementTrailCount ──────────────────────────────
assert('T13 — every transition has numeric movementTrailCount >= 0',
    auditResult.transitions.every(function (t) {
        return typeof t.movementTrailCount === 'number' && t.movementTrailCount >= 0;
    }),
    'first bad: ' + JSON.stringify(
        auditResult.transitions.find(function (t) {
            return typeof t.movementTrailCount !== 'number';
        })));

// ── T14: every transition has clutterRisk ────────────────────────────────────
assert('T14 — every transition has clutterRisk of "low", "medium", or "high"',
    auditResult.transitions.every(function (t) {
        return t.clutterRisk === 'low' || t.clutterRisk === 'medium' || t.clutterRisk === 'high';
    }),
    'first bad: ' + JSON.stringify(
        auditResult.transitions.find(function (t) {
            return t.clutterRisk !== 'low' && t.clutterRisk !== 'medium' && t.clutterRisk !== 'high';
        })));

// Verify clutter thresholds: 0-4 → low, 5-12 → medium, ≥13 → high
assert('T14b — clutterRisk thresholds: ≤4 trails → low, 5-12 → medium, ≥13 → high',
    auditResult.transitions.every(function (t) {
        var n = t.movementTrailCount;
        if (n <= 4)  { return t.clutterRisk === 'low'; }
        if (n <= 12) { return t.clutterRisk === 'medium'; }
        return t.clutterRisk === 'high';
    }),
    'threshold mismatch in: ' + JSON.stringify(
        auditResult.transitions.filter(function (t) {
            var n = t.movementTrailCount;
            if (n <= 4)  { return t.clutterRisk !== 'low'; }
            if (n <= 12) { return t.clutterRisk !== 'medium'; }
            return t.clutterRisk !== 'high';
        }).map(function (t) { return t.toStepRef + ':' + n + '→' + t.clutterRisk; })));

// ── T15: bestTransitions is populated if trails exist ────────────────────────
assert('T15 — bestTransitions is an array',
    Array.isArray(auditResult.bestTransitions),
    typeof auditResult.bestTransitions);
if (auditResult.transitionsWithTrails > 0) {
    assert('T15b — bestTransitions non-empty when trails exist',
        auditResult.bestTransitions.length > 0,
        'length: ' + auditResult.bestTransitions.length);
    assert('T15c — bestTransitions capped at 5',
        auditResult.bestTransitions.length <= 5,
        'length: ' + auditResult.bestTransitions.length);
    // bestTransitions should be sorted descending by movementTrailCount
    var bestSorted = true;
    for (var bi = 1; bi < auditResult.bestTransitions.length; bi++) {
        if (auditResult.bestTransitions[bi].movementTrailCount >
            auditResult.bestTransitions[bi - 1].movementTrailCount) {
            bestSorted = false; break;
        }
    }
    assert('T15d — bestTransitions sorted by movementTrailCount descending',
        bestSorted,
        JSON.stringify(auditResult.bestTransitions.map(function (t) {
            return t.toStepRef + ':' + t.movementTrailCount; })));
}

// ── T16: quietTransitions populated if transitions without trails exist ────────
assert('T16 — quietTransitions is an array',
    Array.isArray(auditResult.quietTransitions), typeof auditResult.quietTransitions);
assert('T16b — quietTransitions contains only transitions with movementTrailCount === 0',
    auditResult.quietTransitions.every(function (t) { return t.movementTrailCount === 0; }),
    'first non-zero: ' + JSON.stringify(
        auditResult.quietTransitions.find(function (t) { return t.movementTrailCount !== 0; })));
assert('T16c — quietTransitions.length === transitionsWithoutTrails',
    auditResult.quietTransitions.length === auditResult.transitionsWithoutTrails,
    'quiet=' + auditResult.quietTransitions.length +
    ' without=' + auditResult.transitionsWithoutTrails);

// ── T17: sampleTrails capped at 5 ────────────────────────────────────────────
assert('T17 — sampleTrails in each transition is capped at 5',
    auditResult.transitions.every(function (t) {
        return Array.isArray(t.sampleTrails) && t.sampleTrails.length <= 5;
    }),
    'first violation: ' + JSON.stringify(
        auditResult.transitions.find(function (t) {
            return !Array.isArray(t.sampleTrails) || t.sampleTrails.length > 5;
        })));
assert('T17b — sampleTrails.length <= movementTrailCount',
    auditResult.transitions.every(function (t) {
        return t.sampleTrails.length <= t.movementTrailCount;
    }),
    'first violation: ' + JSON.stringify(
        auditResult.transitions.find(function (t) {
            return t.sampleTrails.length > t.movementTrailCount;
        })));
// sampleTrails have uid, name, side, from/to fields
var trWithTrails = auditResult.transitions.filter(function (t) { return t.movementTrailCount > 0; });
if (trWithTrails.length > 0) {
    var sampleOk = trWithTrails.every(function (t) {
        return t.sampleTrails.every(function (s) {
            return typeof s.uid      === 'string' &&
                   typeof s.name     === 'string' &&
                   typeof s.side     === 'string' &&
                   typeof s.fromLat  === 'number' &&
                   typeof s.fromLon  === 'number' &&
                   typeof s.toLat    === 'number' &&
                   typeof s.toLon    === 'number';
        });
    });
    assert('T17c — sampleTrail entries have uid/name/side/fromLat/fromLon/toLat/toLon',
        sampleOk,
        'first bad: ' + JSON.stringify(
            trWithTrails[0].sampleTrails.find(function (s) {
                return typeof s.uid !== 'string' || typeof s.fromLat !== 'number';
            })));
}

// ── T18: default audit does not paint the map ─────────────────────────────────
assert('T18 — default audit (no options) does not call paintWargame3ReadOnlyMapOverlay',
    window._p249PaintCalled === false,
    'paint was called unexpectedly');

// ── T19: options.paint:false does not paint ───────────────────────────────────
window._p249PaintCalled = false;
api.auditWargame3MovementTrailCoverage(w3json, { paint: false });
assert('T19 — options.paint:false does not call paintWargame3ReadOnlyMapOverlay',
    window._p249PaintCalled === false, 'paint was called');

// ── T20: options.paint:true without stepRef does not paint ────────────────────
window._p249PaintCalled = false;
api.auditWargame3MovementTrailCoverage(w3json, { paint: true }); // no stepRef
assert('T20 — options.paint:true without stepRef does not paint',
    window._p249PaintCalled === false, 'paint was called without stepRef');

// ── T21: options.paint:true with stepRef paints only that step ────────────────
window._p249PaintCalled = false;
var paintRes = api.auditWargame3MovementTrailCoverage(w3json, { paint: true, stepRef: 'W3-STEP-05' });
assert('T21 — options.paint:true with stepRef calls paintWargame3ReadOnlyMapOverlay once',
    window._p249PaintCalled === true, 'paint was NOT called');
assert('T21b — result.paintResult is present when paint was requested and target found',
    paintRes.paintResult !== undefined,
    'paintResult: ' + JSON.stringify(paintRes.paintResult));

// ── T22: overlay can be cleared after optional paint ─────────────────────────
// clearWargame3ReadOnlyMapOverlay is not in scope here (needs DOM) — verify via source
assert('T22 — source exposes clearWargame3ReadOnlyMapOverlay on AppShellScenarioWorkspace',
    src.indexOf('clearWargame3ReadOnlyMapOverlay:     clearWargame3ReadOnlyMapOverlay') !== -1,
    'export not found');

// ── T23: raw w3json is not mutated ────────────────────────────────────────────
var originalStepCount = w3json.steps.length;
var originalRedCount  = w3json.red_units.length;
assert('T23 — w3json.steps.length unchanged after audit',
    w3json.steps.length === originalStepCount, 'got: ' + w3json.steps.length);
assert('T23b — w3json.red_units.length unchanged after audit',
    w3json.red_units.length === originalRedCount, 'got: ' + w3json.red_units.length);

// ── T24: window.RmoozScenario.stepIndex remains unchanged ────────────────────
// In test env window.RmoozScenario is not set — verify function never references it
var p249fnSrc = extractFn('auditWargame3MovementTrailCoverage');
var p249fnNoComments = p249fnSrc
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
assert('T24 — auditWargame3MovementTrailCoverage does not reference RmoozScenario',
    p249fnNoComments.indexOf('RmoozScenario') === -1,
    'RmoozScenario reference found');

// ── T25: window.units is not mutated ─────────────────────────────────────────
assert('T25 — function body does not reference window.units',
    p249fnNoComments.indexOf('window.units') === -1,
    'window.units reference found');

// ── T26: window.lines is not mutated ─────────────────────────────────────────
assert('T26 — function body does not reference window.lines',
    p249fnNoComments.indexOf('window.lines') === -1,
    'window.lines reference found');

// ── T27: window.RmoozScenario not mutated (covered by T24) ───────────────────
assert('T27 — no window.RmoozScenario access in function body',
    p249fnNoComments.indexOf('RmoozScenario') === -1,
    'reference found');

// ── T28: no storage calls ─────────────────────────────────────────────────────
assert('T28 — no localStorage/sessionStorage in function body',
    p249fnNoComments.indexOf('localStorage') === -1 &&
    p249fnNoComments.indexOf('sessionStorage') === -1,
    'storage call found');

// ── T29: no fetch/backend calls ──────────────────────────────────────────────
assert('T29 — no fetch() or XMLHttpRequest in function body',
    p249fnNoComments.indexOf('fetch(') === -1 &&
    p249fnNoComments.indexOf('XMLHttpRequest') === -1,
    'fetch/XHR found');

// ── T30: no AI/simulation/journal calls ──────────────────────────────────────
assert('T30 — no AI/simulation/journal calls in function body',
    p249fnNoComments.indexOf('journal') === -1 &&
    p249fnNoComments.indexOf('simulate') === -1 &&
    p249fnNoComments.indexOf('/api/ai') === -1,
    'AI/sim/journal reference found');

// ── T31: no app.js changes ────────────────────────────────────────────────────
// Verify the PR-249 marker only appears inside scenario-workspace.js, not app.js
var appJs = '';
try { appJs = fs.readFileSync(path.join(__dirname, 'UI_MOdified/client/app.js'), 'utf8'); } catch (_) {}
assert('T31 — app.js does not contain PR-249 marker',
    appJs.indexOf('PR-249') === -1, 'PR-249 found in app.js');

// ── T32: no adjudicator-map.js changes ───────────────────────────────────────
var adjJs = '';
try { adjJs = fs.readFileSync(path.join(__dirname, 'UI_MOdified/client/adjudicator-map.js'), 'utf8'); } catch (_) {}
assert('T32 — adjudicator-map.js does not contain PR-249 marker',
    adjJs.indexOf('PR-249') === -1, 'PR-249 found in adjudicator-map.js');

// ── T33: no apply/commit/confirm/execute/Gate 7 controls ─────────────────────
assert('T33 — no apply/commit/confirm/execute/Gate 7 in PR-249 function body',
    !/\bapply\b/i.test(p249fnNoComments) &&
    !/\bcommit\b/i.test(p249fnNoComments) &&
    !/\bconfirm\b/i.test(p249fnNoComments) &&
    !/gate.?7/i.test(p249fnNoComments),
    'violation found');

// ── T34: existing W3 preview panel still works (previewWargame3Fixture) ───────
var previewResult = api.previewWargame3Fixture(w3json, 'W3-STEP-05');
assert('T34 — previewWargame3Fixture still works after PR-249',
    previewResult.passed === true,
    JSON.stringify(previewResult.blockedReasons));

// ── T35: existing W3 event log (auditWargame3MapPreviewCoverage) still works ──
var covResult = api.auditWargame3MapPreviewCoverage(w3json);
assert('T35 — auditWargame3MapPreviewCoverage still works after PR-249',
    covResult.passed === true && covResult.stepCount === 17,
    JSON.stringify(covResult.blockedReasons));

// ── T36: existing marker overlay still works ─────────────────────────────────
var adaptR = api.adaptWargame3ToFixture(w3json);
var p5r    = api.buildScenarioStepPreview(adaptR.fixture, 'W3-STEP-05');
var ov5r   = api.buildWargame3ReadOnlyMapOverlayData(p5r.preview, {});
assert('T36 — buildWargame3ReadOnlyMapOverlayData still works after PR-249',
    ov5r.passed === true && Array.isArray(ov5r.overlay.markers),
    JSON.stringify(ov5r.blockedReasons));

// ── T37: existing movement trail paint still works ────────────────────────────
var p4r   = api.buildScenarioStepPreview(adaptR.fixture, 'W3-STEP-04');
var ov5wt = api.buildWargame3ReadOnlyMapOverlayData(p5r.preview, { previousPreview: p4r.preview });
assert('T37 — movement trail overlay still builds with previousPreview after PR-249',
    ov5wt.passed === true &&
    Array.isArray(ov5wt.overlay.movementTrails) &&
    ov5wt.overlay.movementTrails.length > 0,
    'trails: ' + (ov5wt.overlay && ov5wt.overlay.movementTrails ? ov5wt.overlay.movementTrails.length : 'N/A'));

// ── T38: existing top/bottom navigation (buildScenarioStepPreview) ────────────
var p0r = api.buildScenarioStepPreview(adaptR.fixture, 'W3-STEP-00');
var p16 = api.buildScenarioStepPreview(adaptR.fixture, 'W3-STEP-16');
assert('T38 — buildScenarioStepPreview W3-STEP-00 and W3-STEP-16 still work',
    p0r.passed === true && p16.passed === true,
    'step00=' + p0r.passed + ' step16=' + p16.passed);

// ── T39: existing jump selector (all 17 steps buildable) ─────────────────────
var allBuild = true;
for (var ji = 0; ji <= 16; ji++) {
    var jref = 'W3-STEP-' + (ji < 10 ? '0' + ji : String(ji));
    var jr   = api.buildScenarioStepPreview(adaptR.fixture, jref);
    if (!jr.passed) { allBuild = false; break; }
}
assert('T39 — all 17 steps still build successfully after PR-249',
    allBuild, 'at least one step failed');

// ── T40: no console errors (function is exported on public API in source) ─────
assert('T40 — auditWargame3MovementTrailCoverage exported on AppShellScenarioWorkspace',
    src.indexOf('auditWargame3MovementTrailCoverage: auditWargame3MovementTrailCoverage') !== -1,
    'export not found in source');

// ── Results ───────────────────────────────────────────────────────────────────
results.forEach(function (r) { console.log(r); });
console.log(
    '\n' + (failed === 0 ? 'ALL PASS' : failed + ' FAILED') +
    '  (' + passed + '/' + (passed + failed) + ')');

// ── Audit summary report ──────────────────────────────────────────────────────
if (auditResult.passed) {
    console.log('\n── PR-249 Audit Summary ─────────────────────────────');
    console.log('  stepCount:                  ' + auditResult.stepCount);
    console.log('  transitionCount:            ' + auditResult.transitionCount);
    console.log('  transitionsWithTrails:      ' + auditResult.transitionsWithTrails);
    console.log('  transitionsWithoutTrails:   ' + auditResult.transitionsWithoutTrails);
    console.log('  totalMovementTrails:        ' + auditResult.totalMovementTrails);
    console.log('  maxTrailsInTransition:      ' + auditResult.maxTrailsInTransition);
    console.log('  averageTrailsPerTransition: ' + auditResult.averageTrailsPerTransition);
    console.log('  markerTotal:                ' + auditResult.markerTotal);
    console.log('  effectHintTotal:            ' + auditResult.effectHintTotal);
    console.log('  sideBreakdown:              ' + JSON.stringify(auditResult.sideBreakdown));
    console.log('\n  Best 5 transitions (by trail count):');
    auditResult.bestTransitions.forEach(function (t) {
        console.log('    ' + t.fromStepRef + ' → ' + t.toStepRef +
            '  trails=' + t.movementTrailCount +
            '  markers=' + t.markerCount +
            '  clutter=' + t.clutterRisk);
    });
    if (auditResult.clutteredTransitions.length > 0) {
        console.log('\n  Cluttered transitions (clutterRisk=high):');
        auditResult.clutteredTransitions.forEach(function (t) {
            console.log('    ' + t.fromStepRef + ' → ' + t.toStepRef +
                '  trails=' + t.movementTrailCount);
        });
    } else {
        console.log('\n  No cluttered transitions (all clutterRisk ≤ medium).');
    }
    console.log('\n  Quiet transitions (0 trails): ' + auditResult.quietTransitions.length);
    auditResult.quietTransitions.forEach(function (t) {
        console.log('    ' + t.fromStepRef + ' → ' + t.toStepRef +
            '  markers=' + t.markerCount);
    });
    if (auditResult.bestTransitions.length > 0) {
        var best = auditResult.bestTransitions[0];
        console.log('\n  Sample trail from strongest transition (' +
            best.fromStepRef + '→' + best.toStepRef + '):');
        if (best.sampleTrails.length > 0) {
            var st = best.sampleTrails[0];
            console.log('    uid=' + st.uid + '  side=' + st.side +
                '  (' + st.fromLat.toFixed(3) + ',' + st.fromLon.toFixed(3) + ')' +
                ' → (' + st.toLat.toFixed(3) + ',' + st.toLon.toFixed(3) + ')');
        }
    }
    console.log('─────────────────────────────────────────────────────');
}

process.exit(failed > 0 ? 1 : 0);
