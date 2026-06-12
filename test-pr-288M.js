/**
 * test-pr-288M.js — PR-288M: wire live scenario load → adjudicator map draw.
 *
 * Scenario Workspace's live-load path (loadLiveScenarioFromJson) previously
 * populated window.RmoozScenario + the live cards (incl. BLS Snapshot) but
 * never drew BLS / scenario markers on the map. PR-288M adds a guarded bridge,
 * maybeDrawLiveScenarioOnMap(scenario, options), that delegates to the already-
 * shipped window.AppAdjudicatorMap.drawScenario() and is invoked from the load
 * path. This is WIRING ONLY: no geometry, no duplicate draw logic, no map-file
 * change, no data mutation.
 *
 * The behaviour matrix (Section 5) evaluates the REAL shipped helper source
 * (extracted by brace-matching, eval'd in a sandbox with an injected `window`)
 * against mock AppAdjudicatorMap objects — not a re-implementation. Asserts:
 *   - helper defined, guarded, returns { painted, reason, warnings }, exported;
 *   - loadLiveScenarioFromJson invokes it + surfaces the outcome on .mapDraw;
 *   - hard boundary on the helper body (no fetch/XHR/storage/api/Gate7/mutation,
 *     no innerHTML, no per-step applyState, no duplicated marker geometry);
 *   - the delegation target (drawScenario/clearScenario/isScenarioDrawn) exists
 *     in wargame/adjudicator-map.js and the helper is NOT duplicated there;
 *   - decision matrix: no-scenario / map-api-unavailable / draw-unavailable /
 *     map-not-ready(false) / painted(true) / draw-unconfirmed / draw-threw,
 *     plus delegation identity, no-mutation, and the no-bls-template warning;
 *   - real wargame3.json carries bls_template and round-trips untouched.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const SW_PATH  = path.join(__dirname, 'UI_MOdified/client/shell/scenario-workspace.js');
const MAP_PATH = path.join(__dirname, 'UI_MOdified/client/wargame/adjudicator-map.js');
const W3_PATH  = path.join(__dirname, 'UI_MOdified/data/scenarios/wargame3.json');

const swSrc  = fs.readFileSync(SW_PATH,  'utf8');
const mapSrc = fs.readFileSync(MAP_PATH, 'utf8');
const w3     = JSON.parse(fs.readFileSync(W3_PATH, 'utf8'));

let passed = 0, failed = 0;

function check(ok, label, detail) {
    if (ok) passed++; else failed++;
    console.log('  ' + (ok ? 'PASS' : 'FAIL') + '  ' + label +
                (detail !== undefined ? ' — ' + detail : ''));
}

// Extract a function body by brace-matching from `function NAME(`.
function extractFn(src, name) {
    var start = src.indexOf('function ' + name + '(');
    if (start < 0) start = src.indexOf('function ' + name + ' (');
    if (start < 0) return null;
    var depth = 0, i = start;
    while (i < src.length) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) break; }
        i++;
    }
    return src.slice(start, i + 1);
}

const fnSrc   = extractFn(swSrc, 'maybeDrawLiveScenarioOnMap');
const loadFn  = extractFn(swSrc, 'loadLiveScenarioFromJson');

// ── Section 1: helper presence + signature + return shape ─────────────────
console.log('\n─── Section 1: maybeDrawLiveScenarioOnMap presence/shape ───');

check(fnSrc !== null,
      'T01: maybeDrawLiveScenarioOnMap() is defined');
check(/function\s+maybeDrawLiveScenarioOnMap\s*\(\s*scenario\s*,\s*options\s*\)/.test(swSrc),
      'T02: signature is (scenario, options)');
check(fnSrc && /options\s*=\s*options\s*\|\|\s*\{\}/.test(fnSrc),
      'T03: options defaulted ES5-style (options = options || {})');
check(fnSrc && /painted\s*:/.test(fnSrc) && /reason\s*:/.test(fnSrc) && /warnings\s*:/.test(fnSrc),
      'T04: builds a { painted, reason, warnings } result');
check(fnSrc && /'no-scenario'/.test(fnSrc) && /'map-api-unavailable'/.test(fnSrc) &&
      /'draw-unavailable'/.test(fnSrc) && /'map-not-ready'/.test(fnSrc) && /'painted'/.test(fnSrc),
      'T05: declares the full reason vocabulary (guards + success)');
check(fnSrc && /window\.AppAdjudicatorMap/.test(fnSrc) && /\.drawScenario\s*\(/.test(fnSrc),
      'T06: delegates to window.AppAdjudicatorMap.drawScenario()');
check(fnSrc && /try\s*\{/.test(fnSrc) && /catch\s*\(/.test(fnSrc) && /'draw-threw'/.test(fnSrc),
      'T07: drawScenario() call is wrapped in try/catch → draw-threw');
check(fnSrc && /isScenarioDrawn/.test(fnSrc),
      'T08: confirms the draw via isScenarioDrawn() when available');

// ── Section 2: wiring into the load path + export ─────────────────────────
console.log('\n─── Section 2: load-path wiring + export ───');

check(loadFn && /maybeDrawLiveScenarioOnMap\s*\(\s*s\s*,/.test(loadFn),
      'T09: loadLiveScenarioFromJson() calls maybeDrawLiveScenarioOnMap(s, ...)');
check(loadFn && /mapDraw\s*:/.test(loadFn) && /var\s+mapDraw\s*=/.test(loadFn),
      'T10: load result surfaces the outcome on .mapDraw');
check(/maybeDrawLiveScenarioOnMap\s*:\s*maybeDrawLiveScenarioOnMap/.test(swSrc),
      'T11: maybeDrawLiveScenarioOnMap exported on the public API');
// The draw must happen AFTER window.RmoozScenario is set, so the scenario the
// cards read and the scenario the map draws are the same load.
check(loadFn &&
      loadFn.indexOf('window.RmoozScenario =') >= 0 &&
      loadFn.indexOf('maybeDrawLiveScenarioOnMap') > loadFn.indexOf('window.RmoozScenario ='),
      'T12: map draw is wired after window.RmoozScenario is set');

// ── Section 3: hard boundary on the helper body ───────────────────────────
console.log('\n─── Section 3: boundary (helper is a pure safe bridge) ───');

function noneInFn(re, label) { check(fnSrc && !re.test(fnSrc), label); }

noneInFn(/fetch\s*\(/,                            'T13: no fetch()');
noneInFn(/XMLHttpRequest/,                        'T14: no XMLHttpRequest');
noneInFn(/localStorage|sessionStorage|indexedDB/, 'T15: no web storage');
noneInFn(/\/api\/|sim\/commit/,                   'T16: no /api/ or sim/commit');
noneInFn(/gate7|Gate ?7|liveMutationAllowed|backendCommitAllowed/i,
                                                  'T17: no Gate-7 / live-commit flags');
noneInFn(/innerHTML/,                             'T18: no innerHTML');
noneInFn(/RmoozScenario\s*=|stepIndex\s*=[^=]|\.bls_template\s*=[^=]/,
                                                  'T19: no scenario / stepIndex / bls write');
// Wiring only: this helper draws the loaded scenario; per-step applyState is a
// separate, deliberately-deferred concern and must NOT appear here.
noneInFn(/applyState/,                            'T20: no per-step applyState (load-draw scope only)');
// Must not re-implement the map: no Leaflet marker / semicircle / icon geometry.
noneInFn(/L\.marker|L\.circle|semicircle|blsIcon|setIcon|layerGroup|\.coord\[/,
                                                  'T21: no duplicated marker / geometry logic');

// ── Section 4: delegation target exists; helper not duplicated in map ─────
console.log('\n─── Section 4: map subsystem dependency intact ───');

check(/function\s+drawScenario\s*\(/.test(mapSrc),
      'T22: adjudicator-map.js still defines drawScenario()');
check(/window\.AppAdjudicatorMap\s*=/.test(mapSrc) &&
      /\bdrawScenario\b/.test(mapSrc) && /\bclearScenario\b/.test(mapSrc) &&
      /\bisScenarioDrawn\b/.test(mapSrc),
      'T23: AppAdjudicatorMap still exports drawScenario/clearScenario/isScenarioDrawn');
check(mapSrc.indexOf('maybeDrawLiveScenarioOnMap') < 0,
      'T24: bridge helper is NOT duplicated into adjudicator-map.js');

// ── Section 5: behaviour matrix on the REAL shipped helper ────────────────
console.log('\n─── Section 5: decision matrix (real helper, sandboxed) ───');

// Compile the actual extracted source against an injected `window` global.
function makeHelper(win) {
    // eslint-disable-next-line no-new-func
    return new Function('window', fnSrc + '\nreturn maybeDrawLiveScenarioOnMap;')(win);
}
function mockMap(b) {
    var m = { _drawCalls: [] };
    m.drawScenario = function (s) {
        m._drawCalls.push(s);
        if (b.throws) throw new Error('boom-draw');
        return b.drawReturns;
    };
    if (b.hasIsDrawn !== false) {
        m.isScenarioDrawn = function () { return b.isDrawn; };
    }
    return m;
}
var SCN     = { bls_template: [{ name: 'BLS-1', role: 'PRIMARY', coord: [10, 20] }], steps: [] };
var SCN_NOBLS = { steps: [] };

function isShape(r) {
    return r && typeof r.painted === 'boolean' && typeof r.reason === 'string' && Array.isArray(r.warnings);
}

// no-scenario
var rNull = makeHelper({ AppAdjudicatorMap: mockMap({ drawReturns: true, isDrawn: true }) })(null);
check(isShape(rNull) && rNull.painted === false && rNull.reason === 'no-scenario',
      'T25: null scenario → not painted, reason=no-scenario', JSON.stringify(rNull));
var rStr = makeHelper({ AppAdjudicatorMap: mockMap({ drawReturns: true, isDrawn: true }) })('nope');
check(rStr.painted === false && rStr.reason === 'no-scenario',
      'T26: non-object scenario → reason=no-scenario');

// map-api-unavailable (window present, no AppAdjudicatorMap)
var rNoApi = makeHelper({})(SCN);
check(rNoApi.painted === false && rNoApi.reason === 'map-api-unavailable',
      'T27: no AppAdjudicatorMap → reason=map-api-unavailable');
// map-api-unavailable (window itself undefined → typeof window === 'undefined')
var rNoWin = makeHelper(undefined)(SCN);
check(rNoWin.painted === false && rNoWin.reason === 'map-api-unavailable',
      'T28: undefined window → reason=map-api-unavailable (no throw)');

// draw-unavailable (api exists but drawScenario is not a function)
var rNoDraw = makeHelper({ AppAdjudicatorMap: { isScenarioDrawn: function () { return true; } } })(SCN);
check(rNoDraw.painted === false && rNoDraw.reason === 'draw-unavailable',
      'T29: drawScenario missing → reason=draw-unavailable');

// map-not-ready (drawScenario returns false)
var notReady = mockMap({ drawReturns: false, isDrawn: false });
var rNotReady = makeHelper({ AppAdjudicatorMap: notReady })(SCN);
check(rNotReady.painted === false && rNotReady.reason === 'map-not-ready',
      'T30: drawScenario()===false → reason=map-not-ready (expected, not error)');

// painted (drawScenario true + isScenarioDrawn true)
var ready = mockMap({ drawReturns: true, isDrawn: true });
var rOk = makeHelper({ AppAdjudicatorMap: ready })(SCN);
check(rOk.painted === true && rOk.reason === 'painted',
      'T31: drawScenario()===true + confirmed → painted, reason=painted');

// painted even when isScenarioDrawn is absent (check is optional)
var noConfirm = mockMap({ drawReturns: true, hasIsDrawn: false });
var rNoConfirm = makeHelper({ AppAdjudicatorMap: noConfirm })(SCN);
check(rNoConfirm.painted === true && rNoConfirm.reason === 'painted',
      'T32: no isScenarioDrawn() → still painted (predicate optional)');

// draw-unconfirmed (drawScenario true but isScenarioDrawn false)
var unconf = mockMap({ drawReturns: true, isDrawn: false });
var rUnconf = makeHelper({ AppAdjudicatorMap: unconf })(SCN);
check(rUnconf.painted === false && rUnconf.reason === 'draw-unconfirmed' && rUnconf.warnings.length >= 1,
      'T33: true draw but isScenarioDrawn()===false → draw-unconfirmed + warning');

// draw-threw (drawScenario throws → caught, not propagated)
var threw = mockMap({ throws: true });
var rThrew = makeHelper({ AppAdjudicatorMap: threw })(SCN);
check(rThrew.painted === false && rThrew.reason === 'draw-threw' &&
      rThrew.warnings.join('|').indexOf('boom-draw') >= 0,
      'T34: drawScenario throw is caught → draw-threw + captured message');

// delegation identity: the SAME scenario object reaches drawScenario
check(ready._drawCalls.length === 1 && ready._drawCalls[0] === SCN,
      'T35: drawScenario received the exact loaded scenario object (delegation)');

// no mutation of the scenario
var before = JSON.stringify(SCN);
makeHelper({ AppAdjudicatorMap: mockMap({ drawReturns: true, isDrawn: true }) })(SCN);
check(JSON.stringify(SCN) === before,
      'T36: helper does not mutate the scenario object');

// no-bls-template warning (drawn, but flagged)
var rNoBls = makeHelper({ AppAdjudicatorMap: mockMap({ drawReturns: true, isDrawn: true }) })(SCN_NOBLS);
check(rNoBls.painted === true && rNoBls.warnings.indexOf('no-bls-template') >= 0,
      'T37: scenario with no bls_template → painted + no-bls-template warning');

// bls present → no spurious no-bls-template warning
check(rOk.warnings.indexOf('no-bls-template') < 0,
      'T38: scenario WITH bls_template → no no-bls-template warning');

// every branch returns the documented shape
check([rNull, rStr, rNoApi, rNoWin, rNoDraw, rNotReady, rOk, rNoConfirm, rUnconf, rThrew, rNoBls]
        .every(isShape),
      'T39: every branch returns { painted:boolean, reason:string, warnings:array }');

// options is accepted without altering behaviour (reserved param)
var rOpts = makeHelper({ AppAdjudicatorMap: mockMap({ drawReturns: true, isDrawn: true }) })(SCN, { foo: 1 });
check(rOpts.painted === true && rOpts.reason === 'painted',
      'T40: passing options does not change the outcome (reserved param)');

// ── Section 6: real wargame3.json round-trip ──────────────────────────────
console.log('\n─── Section 6: real wargame3 data ───');

check(Array.isArray(w3.bls_template) && w3.bls_template.length > 0,
      'T41: wargame3.json carries a non-empty bls_template (headline payload)',
      'len=' + (Array.isArray(w3.bls_template) ? w3.bls_template.length : 'n/a'));
var w3map = mockMap({ drawReturns: true, isDrawn: true });
var w3Before = JSON.stringify(w3);
var rW3 = makeHelper({ AppAdjudicatorMap: w3map })(w3);
check(rW3.painted === true && rW3.reason === 'painted' && rW3.warnings.indexOf('no-bls-template') < 0,
      'T42: real wargame3 → painted, no no-bls-template warning');
check(w3map._drawCalls.length === 1 && w3map._drawCalls[0] === w3,
      'T43: real wargame3 scenario delegated by reference to drawScenario');
check(JSON.stringify(w3) === w3Before,
      'T44: real wargame3 scenario is untouched after the bridge');

// ── Section 7: JS parses ──────────────────────────────────────────────────
console.log('\n─── Section 7: JS integrity ───');
var parseOk = true;
try { require('child_process').execSync('node --check "' + SW_PATH + '"'); }
catch (e) { parseOk = false; }
check(parseOk, 'T45: scenario-workspace.js parses without syntax error');

// ── Verdict ───────────────────────────────────────────────────────────────
console.log('\n═════════════════════════════════════════════════════════════════');
console.log('  PR-288M Test Results — wire live scenario load → map draw');
console.log('═════════════════════════════════════════════════════════════════');
console.log('  Passed: ' + passed + '  |  Failed: ' + failed);
console.log('═════════════════════════════════════════════════════════════════');
console.log('\n  Verdict: ' + (failed === 0 ? 'PASS' : 'FAIL'));
process.exit(failed === 0 ? 0 : 1);
