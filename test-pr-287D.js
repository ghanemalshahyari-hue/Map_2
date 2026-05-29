/**
 * test-pr-287D.js — PR-287D: Scenario Phase Timeline wired to scenario.phase_table.
 *
 * Static verification (no DOM runtime) + algorithm-parity checks against real
 * wargame3.json data. Asserts:
 *   - #spt-card promoted INTO #sw-live-workspace (out of the secondary mock cards).
 *   - paintPhaseTimeline() is data-driven: reads getScenario().phase_table,
 *     groups rows into distinct phases (first-seen order), derives current/
 *     complete/not-started read-only from the active step's .phase.
 *   - Phase name rendered via textContent (scenario data, NOT an i18n key).
 *   - Empty state when no scenario / no phase_table.
 *   - goToStep() repaints the timeline (live step-awareness).
 *   - Hard boundary: no fetch/XHR/storage/api-sim-commit, no innerHTML data
 *     injection, no scenario / stepIndex mutation inside the renderer.
 *   - CSS states (complete / empty / promoted-card) present.
 *   - EN + AR i18n keys (spt-empty, spt-status-complete) resolve. JS parses.
 *   - Algorithm parity: real wargame3.json (17 rows → 6 distinct phases) yields
 *     the expected per-phase status at step 0, a middle step, and the last step.
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

const ptpBody = extractFn(swSrc, 'paintPhaseTimeline');

// ── Section 1: #spt-card promoted into the live workspace ─────────────────
console.log('\n─── Section 1: #spt-card promoted into live workspace ───');

check(idCount(htmlSrc, 'spt-card') === 1,
      'T01: #spt-card exists exactly once', 'count=' + idCount(htmlSrc, 'spt-card'));
check(isInsideSection(htmlSrc, 'spt-card', 'sw-live-workspace'),
      'T02: #spt-card is inside #sw-live-workspace');
check(!isInsideSection(htmlSrc, 'spt-card', 'sw-secondary-cards'),
      'T03: #spt-card is NOT inside #sw-secondary-cards (demoted-card removed)');
check(idCount(htmlSrc, 'spt-phase-list') === 1,
      'T04: #spt-phase-list <ol> present exactly once');
check(/class="[^"]*sw-live-phase-timeline-card[^"]*"\s+id="spt-card"/.test(htmlSrc),
      'T05: #spt-card carries .sw-live-phase-timeline-card class');
check(/data-i18n="spt-title"/.test(htmlSrc),
      'T06: card title bound to data-i18n="spt-title"');
check(/data-i18n="spt-readonly"/.test(htmlSrc),
      'T07: read-only badge bound to data-i18n="spt-readonly"');

// ── Section 2: paintPhaseTimeline() is data-driven ────────────────────────
console.log('\n─── Section 2: paintPhaseTimeline() data wiring ───');

check(ptpBody !== null,
      'T08: paintPhaseTimeline() is defined');
check(ptpBody && /getScenario\s*\(\s*\)/.test(ptpBody),
      'T09: reads live scenario via getScenario()');
check(ptpBody && /Array\.isArray\(\s*sc\.phase_table\s*\)/.test(ptpBody),
      'T10: guards on Array.isArray(sc.phase_table)');
check(ptpBody && /getActiveStep\s*\(\s*\)/.test(ptpBody),
      'T11: derives current phase from getActiveStep()');
check(ptpBody && /order\.indexOf\(\s*currentPhaseName\s*\)/.test(ptpBody),
      'T12: maps current phase name to position via order.indexOf()');
check(ptpBody && /spt-item--'\s*\+\s*status/.test(ptpBody),
      'T13: emits per-status item class (spt-item--{status})');
check(ptpBody && /spt-badge--'\s*\+\s*status/.test(ptpBody),
      'T14: emits per-status badge class (spt-badge--{status})');
check(ptpBody && /\.textContent\s*=\s*d\.name/.test(ptpBody),
      'T15: phase name rendered via textContent (scenario data, not i18n)');
check(ptpBody && /renderEmpty\s*\(\s*\)/.test(ptpBody),
      'T16: has an empty-state path (renderEmpty)');
check(ptpBody && /'spt-empty'/.test(ptpBody),
      'T17: empty-state uses data-i18n="spt-empty"');
// Hardcoded PHASES array fully removed — renderer now reads scenario data.
check(!/var\s+PHASES\s*=/.test(swSrc) && !/\bPHASES\b/.test(ptpBody || ''),
      'T18: legacy hardcoded PHASES array removed');

// ── Section 3: hard boundary — read-only, no backend, no mutation ─────────
console.log('\n─── Section 3: boundary (read-only / no backend / no mutation) ───');

function bodyHasNo(re, label) { check(!(ptpBody && re.test(ptpBody)), label); }

bodyHasNo(/fetch\s*\(/,          'T19: no fetch() in renderer');
bodyHasNo(/XMLHttpRequest/,      'T20: no XMLHttpRequest in renderer');
bodyHasNo(/localStorage|sessionStorage|indexedDB/, 'T21: no web storage in renderer');
bodyHasNo(/\/api\//,             'T22: no /api/ calls in renderer');
bodyHasNo(/sim\/commit/,         'T23: no sim/commit in renderer');
// innerHTML appears only as the list clear (= ''), never as data injection.
var innerHits = (ptpBody.match(/innerHTML/g) || []).length;
check(innerHits === 1 && /innerHTML\s*=\s*''/.test(ptpBody),
      'T24: innerHTML used only to clear the list (no data injection)', 'hits=' + innerHits);
bodyHasNo(/phase_table\s*=/,                 'T25: does not assign scenario.phase_table');
bodyHasNo(/phase_table\.(push|splice|sort|pop|shift|unshift)/, 'T26: does not mutate phase_table in place');
bodyHasNo(/RmoozScenario\.scenario\s*=/,     'T27: does not overwrite RmoozScenario.scenario');
bodyHasNo(/stepIndex\s*=[^=]/,               'T28: does not write stepIndex (read-only nav state)');
check(ptpBody && /createElement\(/.test(ptpBody),
      'T29: builds DOM via createElement (safe construction)');

// ── Section 4: live step-awareness — goToStep repaints the timeline ───────
console.log('\n─── Section 4: live step-awareness ───');

var goStepBody = extractFn(swSrc, 'goToStep');
check(goStepBody !== null, 'T30: goToStep() is defined');
check(goStepBody && /paintPhaseTimeline\s*\(/.test(goStepBody),
      'T31: goToStep() repaints the phase timeline on navigation');
check(goStepBody && /window\.RmoozScenario\.stepIndex\s*=/.test(goStepBody),
      'T32: goToStep() owns the only stepIndex write');

// ── Section 5: CSS states present ─────────────────────────────────────────
console.log('\n─── Section 5: CSS states ───');

check(/\.spt-item--complete\s+\.spt-dot/.test(cssSrc),
      'T33: .spt-item--complete .spt-dot styled');
check(/\.spt-badge--complete\b/.test(cssSrc),
      'T34: .spt-badge--complete styled');
check(/\.spt-item--empty\b/.test(cssSrc) && /\.spt-empty-msg\b/.test(cssSrc),
      'T35: empty-state CSS (.spt-item--empty / .spt-empty-msg) present');
check(/\.sw-live-phase-timeline-card\b/.test(cssSrc),
      'T36: .sw-live-phase-timeline-card spacing present');

// ── Section 6: i18n keys resolve in EN + AR ───────────────────────────────
console.log('\n─── Section 6: i18n keys (EN + AR) ───');

function keyCount(key) {
    return (i18nSrc.match(new RegExp("'" + key + "'\\s*:", 'g')) || []).length;
}
[['spt-empty', 2], ['spt-status-complete', 2], ['spt-status-current', 2],
 ['spt-status-not-started', 2], ['spt-title', 2], ['spt-readonly', 2]
].forEach(function (p, idx) {
    check(keyCount(p[0]) >= p[1],
          'T' + (37 + idx) + ': i18n key "' + p[0] + '" present in EN + AR',
          'count=' + keyCount(p[0]));
});

// ── Section 7: algorithm parity on real wargame3.json data ────────────────
console.log('\n─── Section 7: algorithm parity (real wargame3 data) ───');

// Local re-implementation mirroring the shipped grouping + status derivation.
function groupPhases(table) {
    var order = [], byName = {};
    (table || []).forEach(function (row) {
        var name = (row && row.phase != null) ? String(row.phase) : '';
        if (name === '') return;
        if (!Object.prototype.hasOwnProperty.call(byName, name)) {
            byName[name] = true; order.push(name);
        }
    });
    return order;
}
function statusesFor(order, currentPhaseName) {
    var pos = (currentPhaseName != null && order.indexOf(currentPhaseName) >= 0)
        ? order.indexOf(currentPhaseName) : -1;
    return order.map(function (_n, i) {
        return (pos < 0) ? 'not-started'
             : (i <  pos) ? 'complete'
             : (i === pos) ? 'current'
             : 'not-started';
    });
}

var order  = groupPhases(w3.phase_table);
var EXPECT = ['PRE-H', 'PHASE 1', 'PHASE 2A', 'PHASE 2B', 'PHASE 3', 'RESOLUTION'];
check(JSON.stringify(order) === JSON.stringify(EXPECT),
      'T43: 17 rows collapse to 6 distinct phases in order', JSON.stringify(order));

var steps    = w3.steps || [];
var firstPh  = steps[0] && steps[0].phase;
var lastPh   = steps[steps.length - 1] && steps[steps.length - 1].phase;

check(JSON.stringify(statusesFor(order, firstPh)) ===
      JSON.stringify(['current', 'not-started', 'not-started', 'not-started', 'not-started', 'not-started']),
      'T44: step 0 (' + firstPh + ') → first current, rest not-started');

check(JSON.stringify(statusesFor(order, lastPh)) ===
      JSON.stringify(['complete', 'complete', 'complete', 'complete', 'complete', 'current']),
      'T45: last step (' + lastPh + ') → 5 complete + 1 current');

// A middle phase: "PHASE 2A" is index 2 → two complete, one current, three upcoming.
check(JSON.stringify(statusesFor(order, 'PHASE 2A')) ===
      JSON.stringify(['complete', 'complete', 'current', 'not-started', 'not-started', 'not-started']),
      'T46: middle phase (PHASE 2A) → 2 complete, 1 current, 3 not-started');

// No resolvable current phase (no scenario / unknown phase) → all not-started.
check(statusesFor(order, null).every(function (s) { return s === 'not-started'; }),
      'T47: no current phase → all phases not-started (empty-ish fallback)');

// ── Section 8: JS parses ──────────────────────────────────────────────────
console.log('\n─── Section 8: JS integrity ───');
var parseOk = true;
try { require('child_process').execSync('node --check "' + SW_PATH + '"'); }
catch (e) { parseOk = false; }
check(parseOk, 'T48: scenario-workspace.js parses without syntax error');

// ── Verdict ───────────────────────────────────────────────────────────────
console.log('\n═════════════════════════════════════════════════════════════════');
console.log('  PR-287D Test Results — Scenario Phase Timeline (data-wired)');
console.log('═════════════════════════════════════════════════════════════════');
console.log('  Passed: ' + passed + '  |  Failed: ' + failed);
console.log('═════════════════════════════════════════════════════════════════');
console.log('\n  Verdict: ' + (failed === 0 ? 'PASS' : 'FAIL'));
process.exit(failed === 0 ? 0 : 1);
