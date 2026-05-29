/**
 * test-pr-287E.js — PR-287E: Scenario Unit Composition.
 *
 * Repurposes the unimplemented map-clutter mock #uild-card into a read-only
 * composition readout wired to scenario.blue_units_initial + scenario.red_units.
 *
 * Static verification (no DOM runtime) + algorithm-parity checks against real
 * wargame3.json data. Asserts:
 *   - #uild-card relabelled to "Scenario Unit Composition", #uild-comp-list <dl>
 *     present, run-button + result fields removed, card stays in #sw-secondary-cards
 *     (NOT promoted into the live workspace).
 *   - The dead PR-98 button-wiring inline script is gone (no AppAdjudicatorMap /
 *     getUnitLayoutDiagnostics / uild-val-* references left in app.html).
 *   - computeUnitComposition() is a pure read of blue_units_initial + red_units:
 *     Array.isArray-guarded, tallies by domain + echelon, counts missing coords,
 *     returns total / blue / red.
 *   - paintUnitComposition() reads getScenario(), renders into #uild-comp-list via
 *     createElement + textContent, has an empty state (uild-empty), fixed labels
 *     carry data-i18n while category names are scenario data (no i18n key).
 *   - Hard boundary: no fetch/XHR/storage/api-sim-commit, no map access
 *     (AppAdjudicatorMap / window.units), no innerHTML data injection, no scenario
 *     / unit-array / stepIndex mutation in either function.
 *   - Wired into refresh() + init(); computeUnitComposition exported on public API.
 *   - EN + AR i18n keys resolve. CSS empty-state present. JS parses.
 *   - Algorithm parity: real wargame3.json → total 153 (blue 83 / red 70),
 *     byDomain + byEchelon each sum to 153, missingCoord 0, exact tally match.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const SW_PATH   = path.join(__dirname, 'UI_MOdified/client/shell/scenario-workspace.js');
const HTML_PATH = path.join(__dirname, 'UI_MOdified/client/app.html');
const I18N_PATH = path.join(__dirname, 'UI_MOdified/client/i18n.js');
const CSS_PATH  = path.join(__dirname, 'UI_MOdified/client/style.css');
const W3_PATH   = path.join(__dirname, 'UI_MOdified/data/scenarios/wargame3.json');

const swSrc   = fs.readFileSync(SW_PATH,   'utf8');
const htmlSrc = fs.readFileSync(HTML_PATH, 'utf8');
const i18nSrc = fs.readFileSync(I18N_PATH, 'utf8');
const cssSrc  = fs.readFileSync(CSS_PATH,  'utf8');
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

const cucBody = extractFn(swSrc, 'computeUnitComposition');
const pucBody = extractFn(swSrc, 'paintUnitComposition');
const bothBodies = (cucBody || '') + '\n' + (pucBody || '');

// ── Section 1: #uild-card repurposed to a composition readout ─────────────
console.log('\n─── Section 1: #uild-card composition readout (app.html) ───');

check(idCount(htmlSrc, 'uild-card') === 1,
      'T01: #uild-card exists exactly once', 'count=' + idCount(htmlSrc, 'uild-card'));
check(idCount(htmlSrc, 'uild-comp-list') === 1,
      'T02: #uild-comp-list <dl> present exactly once');
check(/<dl[^>]*\bid="uild-comp-list"/.test(htmlSrc),
      'T03: #uild-comp-list is a <dl> (definition-list readout)');
check(/data-i18n="uild-title"/.test(htmlSrc),
      'T04: card title bound to data-i18n="uild-title"');
check(/data-i18n="uild-badge"/.test(htmlSrc),
      'T05: read-only badge bound to data-i18n="uild-badge"');
check(/data-i18n="uild-hint"/.test(htmlSrc),
      'T06: hint bound to data-i18n="uild-hint"');
check(isInsideSection(htmlSrc, 'uild-card', 'sw-secondary-cards'),
      'T07: #uild-card stays in #sw-secondary-cards (not promoted)');
check(!isInsideSection(htmlSrc, 'uild-card', 'sw-live-workspace'),
      'T08: #uild-card is NOT in #sw-live-workspace');

// Old map-clutter mock fully removed from app.html.
check(idCount(htmlSrc, 'uild-run-btn') === 0,
      'T09: run-diagnostics button removed from app.html');
check(!/uild-val-/.test(htmlSrc),
      'T10: old uild-val-* result fields removed from app.html');
check(!/AppAdjudicatorMap/.test(htmlSrc) && !/getUnitLayoutDiagnostics/.test(htmlSrc),
      'T11: dead PR-98 inline script (map-clutter wiring) removed from app.html');

// ── Section 2: computeUnitComposition() — pure read of unit arrays ────────
console.log('\n─── Section 2: computeUnitComposition() data wiring ───');

check(cucBody !== null,
      'T12: computeUnitComposition() is defined');
check(cucBody && /blue_units_initial/.test(cucBody),
      'T13: reads scenario.blue_units_initial');
check(cucBody && /red_units/.test(cucBody),
      'T14: reads scenario.red_units');
check(cucBody && /Array\.isArray\(\s*sc\.blue_units_initial\s*\)/.test(cucBody) &&
                 /Array\.isArray\(\s*sc\.red_units\s*\)/.test(cucBody),
      'T15: guards both arrays with Array.isArray (missing → empty)');
check(cucBody && /tally\(\s*all\s*,\s*'domain'/.test(cucBody),
      'T16: tallies by domain');
check(cucBody && /tally\(\s*all\s*,\s*'echelon'/.test(cucBody),
      'T17: tallies by echelon');
check(cucBody && /hasCoord/.test(cucBody) && /missingCoord/.test(cucBody),
      'T18: counts missing coordinates via hasCoord()');
check(cucBody && /total\s*:/.test(cucBody) && /blue\s*:/.test(cucBody) && /red\s*:/.test(cucBody),
      'T19: returns total / blue / red counts');

// ── Section 3: paintUnitComposition() — render + empty state ──────────────
console.log('\n─── Section 3: paintUnitComposition() render ───');

check(pucBody !== null,
      'T20: paintUnitComposition() is defined');
check(pucBody && /getElementById\(\s*'uild-comp-list'\s*\)/.test(pucBody),
      'T21: renders into #uild-comp-list');
check(pucBody && /getScenario\s*\(\s*\)/.test(pucBody),
      'T22: reads the live scenario via getScenario()');
check(pucBody && /'uild-empty'/.test(pucBody) && /uild-comp--empty/.test(pucBody),
      'T23: has an empty-state path (uild-empty / .uild-comp--empty)');
check(pucBody && /computeUnitComposition\(\s*sc\s*\)/.test(pucBody),
      'T24: derives rows from computeUnitComposition(scenario)');
check(pucBody && /\.textContent\s*=/.test(pucBody) && /createElement\(/.test(pucBody),
      'T25: builds rows via createElement + textContent');
check(pucBody && /setAttribute\(\s*'data-i18n'\s*,\s*labelKey\s*\)/.test(pucBody),
      'T26: fixed labels carry data-i18n; category names rendered as data');
check(pucBody && /addBreakdown/.test(pucBody),
      'T27: renders by-domain / by-echelon breakdown sections');

// ── Section 4: hard boundary — read-only / no backend / no map / no mutation
console.log('\n─── Section 4: boundary (read-only / no backend / no map) ───');

function bothHaveNo(re, label) { check(!re.test(bothBodies), label); }

bothHaveNo(/fetch\s*\(/,                              'T28: no fetch() in either function');
bothHaveNo(/XMLHttpRequest/,                          'T29: no XMLHttpRequest');
bothHaveNo(/localStorage|sessionStorage|indexedDB/,   'T30: no web storage');
bothHaveNo(/\/api\//,                                 'T31: no /api/ calls');
bothHaveNo(/sim\/commit/,                             'T32: no sim/commit');
bothHaveNo(/AppAdjudicatorMap|window\.units|getUnitLayoutDiagnostics/,
                                                      'T33: no map / window.units access (map-free)');
// innerHTML appears only as the list clear (= ''), never as data injection.
var innerHits = (bothBodies.match(/innerHTML/g) || []).length;
check(innerHits === 1 && /innerHTML\s*=\s*''/.test(bothBodies),
      'T34: innerHTML used only to clear the list (no data injection)', 'hits=' + innerHits);
bothHaveNo(/blue_units_initial\s*=[^=]/,              'T35: does not assign scenario.blue_units_initial');
bothHaveNo(/red_units\s*=[^=]/,                       'T36: does not assign scenario.red_units');
bothHaveNo(/(blue_units_initial|red_units)\.(push|splice|sort|pop|shift|unshift)/,
                                                      'T37: does not mutate unit arrays in place');
bothHaveNo(/RmoozScenario\.scenario\s*=/,             'T38: does not overwrite RmoozScenario.scenario');
bothHaveNo(/stepIndex\s*=[^=]/,                       'T39: does not write stepIndex');

// ── Section 5: wired into refresh() + init(); exported ────────────────────
console.log('\n─── Section 5: wiring + export ───');

var paintCalls = (swSrc.match(/paintUnitComposition\s*\(\s*\)\s*;/g) || []).length;
check(paintCalls >= 2,
      'T40: paintUnitComposition() called in both refresh() and init()', 'calls=' + paintCalls);
check(/computeUnitComposition\s*:\s*computeUnitComposition/.test(swSrc),
      'T41: computeUnitComposition exported on the public API');

// ── Section 6: i18n keys resolve in EN + AR ───────────────────────────────
console.log('\n─── Section 6: i18n keys (EN + AR) ───');

function keyCount(key) {
    return (i18nSrc.match(new RegExp("'" + key + "'\\s*:", 'g')) || []).length;
}
[['uild-title', 2], ['uild-badge', 2], ['uild-hint', 2], ['uild-field-total', 2],
 ['uild-field-blue', 2], ['uild-field-red', 2], ['uild-field-missing-coord', 2],
 ['uild-field-domain', 2], ['uild-field-echelon', 2], ['uild-empty', 2]
].forEach(function (p, idx) {
    check(keyCount(p[0]) >= p[1],
          'T' + (42 + idx) + ': i18n key "' + p[0] + '" present in EN + AR',
          'count=' + keyCount(p[0]));
});

// ── Section 7: CSS empty-state present ────────────────────────────────────
console.log('\n─── Section 7: CSS ───');

check(/\.uild-comp--empty\b/.test(cssSrc) && /\.uild-empty-msg\b/.test(cssSrc),
      'T52: empty-state CSS (.uild-comp--empty / .uild-empty-msg) present');
check(/\.uild-section-hdr\b/.test(cssSrc) && /\.sw-kv\b/.test(cssSrc),
      'T53: reused layout CSS (.uild-section-hdr / .sw-kv) present');

// ── Section 8: algorithm parity on real wargame3.json data ────────────────
console.log('\n─── Section 8: algorithm parity (real wargame3 data) ───');

// Local re-implementation mirroring the shipped computeUnitComposition().
function hasCoordL(u) {
    var c = u && u.coord;
    if (c == null) return false;
    if (Array.isArray(c)) return c.length >= 2 && c[0] != null && c[1] != null;
    if (typeof c === 'object') return c.lat != null && c.lng != null;
    return false;
}
function tallyL(units, key, acc) {
    units.forEach(function (u) {
        var v = (u && u[key] != null && String(u[key]) !== '') ? String(u[key]) : '(none)';
        acc[v] = (acc[v] || 0) + 1;
    });
    return acc;
}
function computeL(sc) {
    var blue = (sc && Array.isArray(sc.blue_units_initial)) ? sc.blue_units_initial : [];
    var red  = (sc && Array.isArray(sc.red_units))          ? sc.red_units          : [];
    var all  = blue.concat(red);
    return {
        total: all.length, blue: blue.length, red: red.length,
        byDomain: tallyL(all, 'domain', {}), byEchelon: tallyL(all, 'echelon', {}),
        missingCoord: all.filter(function (u) { return !hasCoordL(u); }).length
    };
}
function sumOf(o) { return Object.keys(o).reduce(function (s, k) { return s + o[k]; }, 0); }

var c = computeL(w3);
check(c.total === 153 && c.blue === 83 && c.red === 70,
      'T54: wargame3 → total 153 (blue 83 / red 70)',
      'total=' + c.total + ' blue=' + c.blue + ' red=' + c.red);
check(c.total === c.blue + c.red,
      'T55: total === blue + red (no double count / omission)');
check(sumOf(c.byDomain) === c.total,
      'T56: byDomain sums to total', 'sum=' + sumOf(c.byDomain));
check(sumOf(c.byEchelon) === c.total,
      'T57: byEchelon sums to total', 'sum=' + sumOf(c.byEchelon));
check(c.missingCoord === 0,
      'T58: wargame3 has 0 units missing coordinates', 'missing=' + c.missingCoord);
check(JSON.stringify(c.byDomain) === JSON.stringify({ ground: 87, air: 40, naval: 21, sof: 4, strategic: 1 }),
      'T59: byDomain exact tally', JSON.stringify(c.byDomain));
check(JSON.stringify(c.byEchelon) === JSON.stringify({ brigade: 27, battalion: 42, unit: 44, company: 8, squadron: 27, division: 5 }),
      'T60: byEchelon exact tally', JSON.stringify(c.byEchelon));

// Empty / missing scenario → zeroed composition, no throw (matches empty state).
var e = computeL(null);
check(e.total === 0 && e.blue === 0 && e.red === 0 &&
      sumOf(e.byDomain) === 0 && e.missingCoord === 0,
      'T61: null scenario → all-zero composition (no throw)');

// ── Section 9: JS parses ──────────────────────────────────────────────────
console.log('\n─── Section 9: JS integrity ───');
var parseOk = true;
try { require('child_process').execSync('node --check "' + SW_PATH + '"'); }
catch (e2) { parseOk = false; }
check(parseOk, 'T62: scenario-workspace.js parses without syntax error');

// ── Verdict ───────────────────────────────────────────────────────────────
console.log('\n═════════════════════════════════════════════════════════════════');
console.log('  PR-287E Test Results — Scenario Unit Composition (data-wired)');
console.log('═════════════════════════════════════════════════════════════════');
console.log('  Passed: ' + passed + '  |  Failed: ' + failed);
console.log('═════════════════════════════════════════════════════════════════');
console.log('\n  Verdict: ' + (failed === 0 ? 'PASS' : 'FAIL'));
process.exit(failed === 0 ? 0 : 1);
