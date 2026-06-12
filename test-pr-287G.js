/**
 * test-pr-287G.js — PR-287G: step-aware Engagement Tempo card.
 *
 * New step-aware "Engagement Tempo" card in #sw-live-workspace surfacing the
 * active step's engagement-volume counts:
 *   n_actors          (actors[] length fallback)         → Actors engaged
 *   n_affected        (affected[] length fallback)        → Units affected
 *   n_engagement_arcs (engagement_arcs[] length fallback) → Engagement arcs
 *
 * Static verification (no DOM runtime) + algorithm-parity checks against real
 * wargame3.json. Asserts:
 *   - #sw-tempo-card / #sw-tempo-list <dl> present, title/badge/subheader bound
 *     to data-i18n, card promoted into #sw-live-workspace (NOT the secondary mocks).
 *   - computeStepActivity() is a pure read of one step: prefers the numeric
 *     n_* count, falls back to the matching array's .length, else null.
 *   - paintStepActivity() reads getActiveStep(), renders into #sw-tempo-list via
 *     createElement + textContent, has an empty state, fixed labels carry data-i18n.
 *   - Hard boundary: no fetch/XHR/storage/api/sim-commit, no map
 *     (AppAdjudicatorMap / window.units), no scenario / array / stepIndex
 *     mutation, innerHTML only as list-clear (= '').
 *   - Wired: paintStepActivity in goToStep + refresh + init; computeStepActivity
 *     exported.
 *   - EN + AR i18n keys resolve. JS parses.
 *   - NAMESPACE REGRESSION: the new keys use the sw-tempo-* prefix and do NOT
 *     collide with the pre-existing PR-132 "Actions & Effects" sw-act-* card —
 *     sw-act-title still resolves to "Actions & Effects".
 *   - Algorithm parity on real wargame3: step 0 → actors 14 / affected 7 / arcs 12;
 *     step 5 → 14 / 8 / 8; step 16 → 12 / 10 / 10. Array-length fallback +
 *     n_*-preferred + null-step all-null behaviour.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const SW_PATH   = path.join(__dirname, 'UI_MOdified/client/shell/scenario-workspace.js');
const HTML_PATH = path.join(__dirname, 'UI_MOdified/client/app.html');
const I18N_PATH = path.join(__dirname, 'UI_MOdified/client/i18n.js');
const W3_PATH   = path.join(__dirname, 'UI_MOdified/data/scenarios/wargame3.json');

const swSrc   = fs.readFileSync(SW_PATH,   'utf8');
const htmlSrc = fs.readFileSync(HTML_PATH, 'utf8');
const i18nSrc = fs.readFileSync(I18N_PATH, 'utf8');
const w3      = JSON.parse(fs.readFileSync(W3_PATH, 'utf8'));

let passed = 0, failed = 0;

function check(ok, label, detail) {
    if (ok) passed++; else failed++;
    console.log('  ' + (ok ? 'PASS' : 'FAIL') + '  ' + label +
                (detail !== undefined ? ' — ' + detail : ''));
}

function idCount(html, id) {
    return html.split('id="' + id + '"').length - 1;
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

// True if `innerId` element sits inside the <section> identified by `outerId`.
function isInsideSection(html, innerId, outerId) {
    var openIdx = html.indexOf('id="' + outerId + '"');
    if (openIdx < 0) return false;
    var innerIdx = html.indexOf('id="' + innerId + '"');
    if (innerIdx < 0 || innerIdx < openIdx) return false;
    var i = html.indexOf('>', openIdx);
    if (i < 0) return false;
    var depth = 1;
    while (i < html.length && depth > 0) {
        var nextOpen  = html.indexOf('<section', i + 1);
        var nextClose = html.indexOf('</section>', i + 1);
        if (nextClose < 0) return false;
        if (nextOpen > 0 && nextOpen < nextClose) { depth++; i = nextOpen; }
        else { depth--; i = nextClose; }
    }
    return innerIdx > openIdx && innerIdx < i;
}

const csaBody   = extractFn(swSrc, 'computeStepActivity');
const psaBody   = extractFn(swSrc, 'paintStepActivity');
const goToStep  = extractFn(swSrc, 'goToStep');
const allBodies = (csaBody || '') + '\n' + (psaBody || '');

// ── Section 1: Engagement Tempo card markup (app.html) ────────────────────
console.log('\n─── Section 1: Engagement Tempo card markup (app.html) ───');

check(idCount(htmlSrc, 'sw-tempo-card') === 1,
      'T01: #sw-tempo-card exists exactly once', 'count=' + idCount(htmlSrc, 'sw-tempo-card'));
check(idCount(htmlSrc, 'sw-tempo-list') === 1,
      'T02: #sw-tempo-list present exactly once');
check(/<dl[^>]*\bid="sw-tempo-list"/.test(htmlSrc),
      'T03: #sw-tempo-list is a <dl> (key/value readout)');
check(/data-i18n="sw-tempo-title"/.test(htmlSrc),
      'T04: card title bound to data-i18n="sw-tempo-title"');
check(/data-i18n="sw-tempo-badge"/.test(htmlSrc),
      'T05: read-only badge bound to data-i18n="sw-tempo-badge"');
check(/data-i18n="sw-tempo-hdr-kicker"/.test(htmlSrc) && /data-i18n="sw-tempo-hdr-sub"/.test(htmlSrc),
      'T06: subheader kicker + sub bound to data-i18n');
check(isInsideSection(htmlSrc, 'sw-tempo-card', 'sw-live-workspace'),
      'T07: #sw-tempo-card promoted into #sw-live-workspace');
check(!isInsideSection(htmlSrc, 'sw-tempo-card', 'sw-secondary-cards'),
      'T08: #sw-tempo-card is NOT in #sw-secondary-cards (not a mock)');

// ── Section 2: computeStepActivity() — pure read of one step ──────────────
console.log('\n─── Section 2: computeStepActivity() data wiring ───');

check(csaBody !== null,
      'T09: computeStepActivity() is defined');
check(csaBody && /n_actors/.test(csaBody) && /n_affected/.test(csaBody) && /n_engagement_arcs/.test(csaBody),
      'T10: reads n_actors / n_affected / n_engagement_arcs');
check(csaBody && /typeof\s+st\[numKey\]\s*===\s*'number'/.test(csaBody),
      'T11: prefers the numeric n_* count (typeof number)');
check(csaBody && /Array\.isArray\(\s*st\[arrKey\]\s*\)/.test(csaBody) && /\.length/.test(csaBody),
      'T12: falls back to the matching array .length');
check(csaBody && /return\s+null/.test(csaBody),
      'T13: returns null when neither count nor array present (guarded)');
check(csaBody && /actors\s*:/.test(csaBody) && /affected\s*:/.test(csaBody) && /arcs\s*:/.test(csaBody),
      'T14: returns { actors, affected, arcs }');

// ── Section 3: paintStepActivity() — render + empty state ─────────────────
console.log('\n─── Section 3: paintStepActivity() render ───');

check(psaBody !== null,
      'T15: paintStepActivity() is defined');
check(psaBody && /getElementById\(\s*'sw-tempo-list'\s*\)/.test(psaBody),
      'T16: renders into #sw-tempo-list');
check(psaBody && /getActiveStep\s*\(\s*\)/.test(psaBody),
      'T17: reads the active step via getActiveStep() (step-aware)');
check(psaBody && /'sw-tempo-empty'/.test(psaBody) && /uild-comp--empty/.test(psaBody),
      'T18: has an empty-state path (sw-tempo-empty / .uild-comp--empty)');
check(psaBody && /computeStepActivity\(\s*step\s*\)/.test(psaBody),
      'T19: derives rows from computeStepActivity(step)');
check(psaBody && /\.textContent\s*=/.test(psaBody) && /createElement\(/.test(psaBody),
      'T20: builds rows via createElement + textContent');
check(psaBody && /setAttribute\(\s*'data-i18n'\s*,\s*labelKey\s*\)/.test(psaBody),
      'T21: fixed labels carry data-i18n');

// ── Section 4: hard boundary — read-only / no backend / no map / no mutation
console.log('\n─── Section 4: boundary (read-only / no backend / no map) ───');

function noneHave(re, label) { check(!re.test(allBodies), label); }

noneHave(/fetch\s*\(/,                              'T22: no fetch() in any function');
noneHave(/XMLHttpRequest/,                          'T23: no XMLHttpRequest');
noneHave(/localStorage|sessionStorage|indexedDB/,   'T24: no web storage');
noneHave(/\/api\//,                                 'T25: no /api/ calls');
noneHave(/sim\/commit/,                             'T26: no sim/commit');
noneHave(/AppAdjudicatorMap|window\.units|getUnitLayoutDiagnostics/,
                                                    'T27: no map / window.units access (map-free)');
var allInner   = (allBodies.match(/innerHTML/g) || []).length;
var clearInner = (allBodies.match(/innerHTML\s*=\s*''/g) || []).length;
check(allInner >= 1 && allInner === clearInner,
      'T28: innerHTML used only to clear lists (no data injection)',
      'hits=' + allInner + ' clears=' + clearInner);
noneHave(/n_actors\s*=[^=]|n_affected\s*=[^=]|n_engagement_arcs\s*=[^=]/,
                                                    'T29: does not assign the n_* count fields');
noneHave(/(actors|affected|engagement_arcs)\.(push|splice|sort|pop|shift|unshift)/,
                                                    'T30: does not mutate the source arrays in place');
noneHave(/RmoozScenario\.scenario\s*=|stepIndex\s*=[^=]/,
                                                    'T31: does not write scenario / stepIndex');

// ── Section 5: wiring + export ────────────────────────────────────────────
console.log('\n─── Section 5: wiring + export ───');

var psaCalls = (swSrc.match(/paintStepActivity\s*\(\s*\)\s*;/g) || []).length;
check(psaCalls >= 3,
      'T32: paintStepActivity() called in goToStep + refresh + init', 'calls=' + psaCalls);
check(goToStep && /paintStepActivity\s*\(\s*\)/.test(goToStep),
      'T33: goToStep() repaints the tempo card (step-aware)');
check(/computeStepActivity\s*:\s*computeStepActivity/.test(swSrc),
      'T34: computeStepActivity exported on the public API');

// ── Section 6: i18n keys (EN + AR) ────────────────────────────────────────
console.log('\n─── Section 6: i18n keys (EN + AR) ───');

function keyCount(key) {
    return (i18nSrc.match(new RegExp("'" + key + "'\\s*:", 'g')) || []).length;
}
[['sw-tempo-title', 2], ['sw-tempo-badge', 2], ['sw-tempo-hdr-kicker', 2], ['sw-tempo-hdr-sub', 2],
 ['sw-tempo-actors', 2], ['sw-tempo-affected', 2], ['sw-tempo-arcs', 2], ['sw-tempo-empty', 2]
].forEach(function (p, idx) {
    check(keyCount(p[0]) >= p[1],
          'T' + (35 + idx) + ': i18n key "' + p[0] + '" present in EN + AR',
          'count=' + keyCount(p[0]));
});

// ── Section 7: namespace-collision regression (PR-132 sw-act-* card) ──────
console.log('\n─── Section 7: namespace regression (no sw-act-* collision) ───');

// The pre-existing "Actions & Effects" card owns sw-act-title — it must NOT be
// clobbered by the new card. New keys live under the distinct sw-tempo-* prefix.
check(keyCount('sw-act-title') === 2 &&
      /'sw-act-title'\s*:\s*'Actions & Effects'/.test(i18nSrc),
      'T43: pre-existing sw-act-title still resolves to "Actions & Effects" (not clobbered)',
      'count=' + keyCount('sw-act-title'));
check(psaBody && /'sw-tempo-actors'/.test(psaBody) && /'sw-tempo-empty'/.test(psaBody),
      'T44: new card uses sw-tempo-* labels (distinct namespace)');
check(!/sw-act-/.test(csaBody || '') && !/sw-act-/.test(psaBody || ''),
      'T45: compute/paint functions reference no sw-act-* keys');

// ── Section 8: algorithm parity on real wargame3.json ─────────────────────
console.log('\n─── Section 8: algorithm parity (real wargame3 data) ───');

// Local re-implementation mirroring the shipped computeStepActivity().
function computeL(step) {
    var st = step || null;
    function cnt(numKey, arrKey) {
        if (st && typeof st[numKey] === 'number') return st[numKey];
        if (st && Array.isArray(st[arrKey])) return st[arrKey].length;
        return null;
    }
    return {
        actors:   cnt('n_actors',          'actors'),
        affected: cnt('n_affected',        'affected'),
        arcs:     cnt('n_engagement_arcs', 'engagement_arcs')
    };
}

var steps = w3.steps || [];
var s0 = computeL(steps[0]), s5 = computeL(steps[5]), s16 = computeL(steps[16]);

check(s0.actors === 14 && s0.affected === 7 && s0.arcs === 12,
      'T46: step 0 → actors 14 / affected 7 / arcs 12', JSON.stringify(s0));
check(s5.actors === 14 && s5.affected === 8 && s5.arcs === 8,
      'T47: step 5 → actors 14 / affected 8 / arcs 8', JSON.stringify(s5));
check(s16.actors === 12 && s16.affected === 10 && s16.arcs === 10,
      'T48: step 16 → actors 12 / affected 10 / arcs 10', JSON.stringify(s16));

// n_* preferred over array length when both present.
var prefer = computeL({ n_actors: 5, actors: [1, 2] });
check(prefer.actors === 5,
      'T49: numeric n_actors preferred over actors.length', JSON.stringify(prefer));

// Array-length fallback when the n_* count is absent.
var fallback = computeL({ actors: [1, 2, 3], affected: [1], engagement_arcs: [] });
check(fallback.actors === 3 && fallback.affected === 1 && fallback.arcs === 0,
      'T50: array .length fallback when n_* absent', JSON.stringify(fallback));

// Non-number / non-array → null (no throw).
var bad = computeL({ n_actors: 'x', actors: 'y' });
check(bad.actors === null,
      'T51: non-number count + non-array source → null');

// Missing / null step → all-null, no throw (matches empty path).
var e = computeL(null);
check(e.actors === null && e.affected === null && e.arcs === null,
      'T52: null step → all-null activity (no throw)');

// Every step yields integer-or-null counts across the whole scenario (no NaN).
var allClean = steps.every(function (st) {
    var a = computeL(st);
    return [a.actors, a.affected, a.arcs].every(function (v) {
        return v === null || (typeof v === 'number' && v >= 0 && v === Math.floor(v));
    });
});
check(allClean,
      'T53: all 17 steps yield non-negative integer counts (no NaN/garbage)');

// ── Section 9: JS parses ──────────────────────────────────────────────────
console.log('\n─── Section 9: JS integrity ───');
var parseOk = true;
try { require('child_process').execSync('node --check "' + SW_PATH + '"'); }
catch (e2) { parseOk = false; }
check(parseOk, 'T54: scenario-workspace.js parses without syntax error');

// ── Verdict ───────────────────────────────────────────────────────────────
console.log('\n═════════════════════════════════════════════════════════════════');
console.log('  PR-287G Test Results — Engagement Tempo card');
console.log('═════════════════════════════════════════════════════════════════');
console.log('  Passed: ' + passed + '  |  Failed: ' + failed);
console.log('═════════════════════════════════════════════════════════════════');
console.log('\n  Verdict: ' + (failed === 0 ? 'PASS' : 'FAIL'));
process.exit(failed === 0 ? 0 : 1);
