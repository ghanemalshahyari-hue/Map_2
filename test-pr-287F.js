/**
 * test-pr-287F.js — PR-287F: step-aware Red Attrition card + BLS step-status.
 *
 * (A) New step-aware "Red Attrition" card in #sw-live-workspace surfacing the
 *     active step's red_losses_cumulative_baseline / red_degraded_baseline /
 *     red_strength_baseline (strength-index sum + full-strength count).
 * (B) Per-step bls_status_baseline wired into the existing BLS Snapshot card,
 *     made step-aware by adding paintBlsCard() to goToStep().
 *
 * Static verification (no DOM runtime) + algorithm-parity checks against real
 * wargame3.json. Asserts:
 *   - #sw-attr-card / #sw-attr-list <dl> present, title/badge/subheader bound to
 *     data-i18n, card promoted into #sw-live-workspace (NOT the secondary mocks).
 *   - computeStepAttrition() is a pure read of one step: typeof-number losses,
 *     Array-guarded degraded length, object-guarded strength aggregate (sum +
 *     full-strength count + total), returns the 5-field shape.
 *   - paintStepAttrition() reads getActiveStep(), renders into #sw-attr-list via
 *     createElement + textContent, has an empty state, fixed labels carry data-i18n.
 *   - paintBlsCard() now reads getActiveStep().bls_status_baseline, builds a
 *     .sw-bls-head wrapper + .sw-bls-status pill with a data-status attribute
 *     (status value rendered as scenario data — no i18n).
 *   - Hard boundary across all three functions: no fetch/XHR/storage/api/sim-commit,
 *     no map (AppAdjudicatorMap / window.units), no scenario / array / stepIndex
 *     mutation, innerHTML only as list-clear (= '').
 *   - Wired: paintStepAttrition in goToStep + refresh + init; paintBlsCard added
 *     to goToStep; computeStepAttrition exported.
 *   - EN + AR i18n keys resolve. CSS pill + variants present. JS parses.
 *   - Algorithm parity on real wargame3: step 0 → losses 0 / deg 0 / sum 82.7 /
 *     full 81 / total 84 / BLS LIMITED; step 5 → 2 / 2 / 80.3 / 78 / 84 / THREATENED;
 *     step 16 → 2 / 2 / 76.7 / 73 / 84 / SECURE. BLS joins bls_template by name.
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

const csaBody    = extractFn(swSrc, 'computeStepAttrition');
const psaBody    = extractFn(swSrc, 'paintStepAttrition');
const blsBody    = extractFn(swSrc, 'paintBlsCard');
const goToStep   = extractFn(swSrc, 'goToStep');
const allBodies  = (csaBody || '') + '\n' + (psaBody || '') + '\n' + (blsBody || '');

// ── Section 1: Red Attrition card markup (app.html) ───────────────────────
console.log('\n─── Section 1: Red Attrition card markup (app.html) ───');

check(idCount(htmlSrc, 'sw-attr-card') === 1,
      'T01: #sw-attr-card exists exactly once', 'count=' + idCount(htmlSrc, 'sw-attr-card'));
check(idCount(htmlSrc, 'sw-attr-list') === 1,
      'T02: #sw-attr-list present exactly once');
check(/<dl[^>]*\bid="sw-attr-list"/.test(htmlSrc),
      'T03: #sw-attr-list is a <dl> (key/value readout)');
check(/data-i18n="sw-attr-title"/.test(htmlSrc),
      'T04: card title bound to data-i18n="sw-attr-title"');
check(/data-i18n="sw-attr-badge"/.test(htmlSrc),
      'T05: read-only badge bound to data-i18n="sw-attr-badge"');
check(/data-i18n="sw-attr-hdr-kicker"/.test(htmlSrc) && /data-i18n="sw-attr-hdr-sub"/.test(htmlSrc),
      'T06: subheader kicker + sub bound to data-i18n');
check(isInsideSection(htmlSrc, 'sw-attr-card', 'sw-live-workspace'),
      'T07: #sw-attr-card promoted into #sw-live-workspace');
check(!isInsideSection(htmlSrc, 'sw-attr-card', 'sw-secondary-cards'),
      'T08: #sw-attr-card is NOT in #sw-secondary-cards (not a mock)');

// ── Section 2: computeStepAttrition() — pure read of one step ─────────────
console.log('\n─── Section 2: computeStepAttrition() data wiring ───');

check(csaBody !== null,
      'T09: computeStepAttrition() is defined');
check(csaBody && /red_losses_cumulative_baseline/.test(csaBody),
      'T10: reads step.red_losses_cumulative_baseline');
check(csaBody && /red_degraded_baseline/.test(csaBody),
      'T11: reads step.red_degraded_baseline');
check(csaBody && /red_strength_baseline/.test(csaBody),
      'T12: reads step.red_strength_baseline');
check(csaBody && /typeof\s+st\.red_losses_cumulative_baseline\s*===\s*'number'/.test(csaBody),
      'T13: guards losses with typeof number');
check(csaBody && /Array\.isArray\(\s*st\.red_degraded_baseline\s*\)/.test(csaBody),
      'T14: guards degraded with Array.isArray (→ .length)');
check(csaBody && /typeof\s+st\.red_strength_baseline\s*===\s*'object'/.test(csaBody),
      'T15: guards strength with typeof object');
check(csaBody && /losses\s*:/.test(csaBody) && /degraded\s*:/.test(csaBody) &&
                 /strengthSum\s*:/.test(csaBody) && /strengthFull\s*:/.test(csaBody) &&
                 /strengthTotal\s*:/.test(csaBody),
      'T16: returns losses / degraded / strengthSum / strengthFull / strengthTotal');

// ── Section 3: paintStepAttrition() — render + empty state ────────────────
console.log('\n─── Section 3: paintStepAttrition() render ───');

check(psaBody !== null,
      'T17: paintStepAttrition() is defined');
check(psaBody && /getElementById\(\s*'sw-attr-list'\s*\)/.test(psaBody),
      'T18: renders into #sw-attr-list');
check(psaBody && /getActiveStep\s*\(\s*\)/.test(psaBody),
      'T19: reads the active step via getActiveStep() (step-aware)');
check(psaBody && /'sw-attr-empty'/.test(psaBody) && /uild-comp--empty/.test(psaBody),
      'T20: has an empty-state path (sw-attr-empty / .uild-comp--empty)');
check(psaBody && /computeStepAttrition\(\s*step\s*\)/.test(psaBody),
      'T21: derives rows from computeStepAttrition(step)');
check(psaBody && /\.textContent\s*=/.test(psaBody) && /createElement\(/.test(psaBody),
      'T22: builds rows via createElement + textContent');
check(psaBody && /setAttribute\(\s*'data-i18n'\s*,\s*labelKey\s*\)/.test(psaBody),
      'T23: fixed labels carry data-i18n');

// ── Section 4: paintBlsCard() — per-step status wiring ────────────────────
console.log('\n─── Section 4: paintBlsCard() per-step status ───');

check(blsBody && /bls_status_baseline/.test(blsBody),
      'T24: paintBlsCard() reads step.bls_status_baseline');
check(blsBody && /getActiveStep\s*\(\s*\)/.test(blsBody),
      'T25: paintBlsCard() reads the active step (step-aware)');
check(blsBody && /sw-bls-head/.test(blsBody),
      'T26: builds .sw-bls-head flex wrapper');
check(blsBody && /sw-bls-status/.test(blsBody) && /setAttribute\(\s*'data-status'/.test(blsBody),
      'T27: builds .sw-bls-status pill with data-status attribute');
check(blsBody && /statusEl\.textContent\s*=/.test(blsBody) &&
                 !/statusEl\.setAttribute\(\s*'data-i18n'/.test(blsBody),
      'T28: status value rendered via textContent (scenario data, no i18n)');

// ── Section 5: hard boundary — read-only / no backend / no map / no mutation
console.log('\n─── Section 5: boundary (read-only / no backend / no map) ───');

function noneHave(re, label) { check(!re.test(allBodies), label); }

noneHave(/fetch\s*\(/,                              'T29: no fetch() in any function');
noneHave(/XMLHttpRequest/,                          'T30: no XMLHttpRequest');
noneHave(/localStorage|sessionStorage|indexedDB/,   'T31: no web storage');
noneHave(/\/api\//,                                 'T32: no /api/ calls');
noneHave(/sim\/commit/,                             'T33: no sim/commit');
noneHave(/AppAdjudicatorMap|window\.units|getUnitLayoutDiagnostics/,
                                                    'T34: no map / window.units access (map-free)');
// innerHTML appears only as list clears (= ''), never as data injection.
var allInner   = (allBodies.match(/innerHTML/g) || []).length;
var clearInner = (allBodies.match(/innerHTML\s*=\s*''/g) || []).length;
check(allInner >= 1 && allInner === clearInner,
      'T35: innerHTML used only to clear lists (no data injection)',
      'hits=' + allInner + ' clears=' + clearInner);
noneHave(/red_losses_cumulative_baseline\s*=[^=]/, 'T36: does not assign red_losses_cumulative_baseline');
noneHave(/red_strength_baseline\s*=[^=]/,          'T37: does not assign red_strength_baseline');
noneHave(/red_degraded_baseline\.(push|splice|sort|pop|shift|unshift)/,
                                                    'T38: does not mutate red_degraded_baseline in place');
noneHave(/RmoozScenario\.scenario\s*=/,            'T39: does not overwrite RmoozScenario.scenario');
noneHave(/stepIndex\s*=[^=]/,                       'T40: does not write stepIndex');

// ── Section 6: wiring + export ────────────────────────────────────────────
console.log('\n─── Section 6: wiring + export ───');

var psaCalls = (swSrc.match(/paintStepAttrition\s*\(\s*\)\s*;/g) || []).length;
check(psaCalls >= 3,
      'T41: paintStepAttrition() called in goToStep + refresh + init', 'calls=' + psaCalls);
check(goToStep && /paintStepAttrition\s*\(\s*\)/.test(goToStep),
      'T42: goToStep() repaints the attrition card');
check(goToStep && /paintBlsCard\s*\(\s*\)/.test(goToStep),
      'T43: goToStep() repaints the BLS card (makes BLS status step-aware)');
check(/computeStepAttrition\s*:\s*computeStepAttrition/.test(swSrc),
      'T44: computeStepAttrition exported on the public API');

// ── Section 7: i18n keys (EN + AR) ────────────────────────────────────────
console.log('\n─── Section 7: i18n keys (EN + AR) ───');

function keyCount(key) {
    return (i18nSrc.match(new RegExp("'" + key + "'\\s*:", 'g')) || []).length;
}
[['sw-attr-title', 2], ['sw-attr-badge', 2], ['sw-attr-hdr-kicker', 2], ['sw-attr-hdr-sub', 2],
 ['sw-attr-losses', 2], ['sw-attr-degraded', 2], ['sw-attr-strength', 2], ['sw-attr-full', 2],
 ['sw-attr-empty', 2]
].forEach(function (p, idx) {
    check(keyCount(p[0]) >= p[1],
          'T' + (45 + idx) + ': i18n key "' + p[0] + '" present in EN + AR',
          'count=' + keyCount(p[0]));
});

// ── Section 8: CSS pill + variants ────────────────────────────────────────
console.log('\n─── Section 8: CSS ───');

check(/\.sw-bls-head\b/.test(cssSrc),
      'T54: .sw-bls-head flex header present');
check(/\.sw-bls-status\b/.test(cssSrc),
      'T55: .sw-bls-status pill present');
check(/\.sw-bls-status\[data-status="secure"\]/.test(cssSrc) &&
      /\.sw-bls-status\[data-status="threatened"\]/.test(cssSrc) &&
      /\.sw-bls-status\[data-status="limited"\]/.test(cssSrc),
      'T56: 3 status colour variants (secure / threatened / limited) present');

// ── Section 9: algorithm parity on real wargame3.json ─────────────────────
console.log('\n─── Section 9: algorithm parity (real wargame3 data) ───');

// Local re-implementation mirroring the shipped computeStepAttrition().
function computeL(step) {
    var st = step || null;
    var losses = (st && typeof st.red_losses_cumulative_baseline === 'number')
                 ? st.red_losses_cumulative_baseline : null;
    var degraded = (st && Array.isArray(st.red_degraded_baseline))
                   ? st.red_degraded_baseline.length : null;
    var so = (st && st.red_strength_baseline && typeof st.red_strength_baseline === 'object')
             ? st.red_strength_baseline : null;
    var sum = null, full = null, total = null;
    if (so) {
        var keys = Object.keys(so);
        total = keys.length; sum = 0; full = 0;
        keys.forEach(function (k) {
            var v = so[k];
            if (typeof v === 'number') { sum += v; if (v >= 1) full++; }
        });
        sum = Math.round(sum * 10) / 10;
    }
    return { losses: losses, degraded: degraded, strengthSum: sum, strengthFull: full, strengthTotal: total };
}
function blsStatusOf(step) {
    var m = step && step.bls_status_baseline;
    return (m && typeof m === 'object') ? m['BLS-1'] : null;
}

var steps = w3.steps || [];
var s0 = computeL(steps[0]), s5 = computeL(steps[5]), s16 = computeL(steps[16]);

check(s0.losses === 0 && s0.degraded === 0 && s0.strengthSum === 82.7 &&
      s0.strengthFull === 81 && s0.strengthTotal === 84,
      'T57: step 0 → losses 0 / deg 0 / sum 82.7 / full 81 / total 84', JSON.stringify(s0));
check(blsStatusOf(steps[0]) === 'LIMITED',
      'T58: step 0 → BLS status LIMITED', String(blsStatusOf(steps[0])));
check(s5.losses === 2 && s5.degraded === 2 && s5.strengthSum === 80.3 &&
      s5.strengthFull === 78 && s5.strengthTotal === 84,
      'T59: step 5 → losses 2 / deg 2 / sum 80.3 / full 78 / total 84', JSON.stringify(s5));
check(blsStatusOf(steps[5]) === 'THREATENED',
      'T60: step 5 → BLS status THREATENED', String(blsStatusOf(steps[5])));
check(s16.losses === 2 && s16.degraded === 2 && s16.strengthSum === 76.7 &&
      s16.strengthFull === 73 && s16.strengthTotal === 84,
      'T61: step 16 → losses 2 / deg 2 / sum 76.7 / full 73 / total 84', JSON.stringify(s16));
check(blsStatusOf(steps[16]) === 'SECURE',
      'T62: step 16 → BLS status SECURE', String(blsStatusOf(steps[16])));

// BLS join key: status maps key by bls_template[0].name.
var blsName = Array.isArray(w3.bls_template) && w3.bls_template[0] ? w3.bls_template[0].name : null;
check(blsName === 'BLS-1' &&
      steps[0].bls_status_baseline && (blsName in steps[0].bls_status_baseline),
      'T63: BLS status joins bls_template by name ("BLS-1")', String(blsName));

// Missing / null step → all-null aggregate, no throw (matches empty path).
var e = computeL(null);
check(e.losses === null && e.degraded === null && e.strengthSum === null &&
      e.strengthFull === null && e.strengthTotal === null,
      'T64: null step → all-null attrition (no throw)');

// ── Section 10: JS parses ─────────────────────────────────────────────────
console.log('\n─── Section 10: JS integrity ───');
var parseOk = true;
try { require('child_process').execSync('node --check "' + SW_PATH + '"'); }
catch (e2) { parseOk = false; }
check(parseOk, 'T65: scenario-workspace.js parses without syntax error');

// ── Verdict ───────────────────────────────────────────────────────────────
console.log('\n═════════════════════════════════════════════════════════════════');
console.log('  PR-287F Test Results — Red Attrition card + BLS step-status');
console.log('═════════════════════════════════════════════════════════════════');
console.log('  Passed: ' + passed + '  |  Failed: ' + failed);
console.log('═════════════════════════════════════════════════════════════════');
console.log('\n  Verdict: ' + (failed === 0 ? 'PASS' : 'FAIL'));
process.exit(failed === 0 ? 0 : 1);
