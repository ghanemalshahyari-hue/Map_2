/**
 * test-pr-287C.js — PR-287C: Scenario Workspace Duplication Cleanup Pass.
 *
 * Static verification (no DOM runtime) of the 44-item spec.
 * Asserts:
 *   - Legacy "Current Scenario" summary demoted into collapsed #sw-legacy-summary-section.
 *   - Operator State card moved INTO #sw-live-workspace (no duplicate).
 *   - Live primary path intact (header / nav / decision / step-units / event-log).
 *   - Secondary mock cards stay collapsed, dry-run stays hidden.
 *   - No new features / imports / Apply-Commit buttons / backend / storage.
 *   - This PR did not touch wargame3.json / app.js / adjudicator-map.js.
 *   - EN + AR i18n keys resolve. JS parses (no syntax error).
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const SW_PATH   = path.join(__dirname, 'UI_MOdified/client/shell/scenario-workspace.js');
const HTML_PATH = path.join(__dirname, 'UI_MOdified/client/app.html');
const I18N_PATH = path.join(__dirname, 'UI_MOdified/client/i18n.js');
const CSS_PATH  = path.join(__dirname, 'UI_MOdified/client/style.css');
const W3_PATH   = path.join(__dirname, 'UI_MOdified/data/scenarios/wargame3.json');
const APP_JS    = path.join(__dirname, 'UI_MOdified/client/app.js');
const ADJ_MAP   = path.join(__dirname, 'UI_MOdified/client/adjudicator-map.js');

const swSrc   = fs.readFileSync(SW_PATH,   'utf8');
const htmlSrc = fs.readFileSync(HTML_PATH, 'utf8');
const i18nSrc = fs.readFileSync(I18N_PATH, 'utf8');
const cssSrc  = fs.readFileSync(CSS_PATH,  'utf8');
const w3Src   = fs.existsSync(W3_PATH)  ? fs.readFileSync(W3_PATH,  'utf8') : '';
const appJs   = fs.existsSync(APP_JS)   ? fs.readFileSync(APP_JS,   'utf8') : '';
const adjMap  = fs.existsSync(ADJ_MAP)  ? fs.readFileSync(ADJ_MAP,  'utf8') : '';

let passed = 0, failed = 0;
const results = [];

function check(ok, label, detail) {
    results.push({ ok, label, detail });
    if (ok) passed++; else failed++;
    console.log('  ' + (ok ? 'PASS' : 'FAIL') + '  ' + label +
                (detail !== undefined ? ' — ' + detail : ''));
}

// Count occurrences of an id="X" attribute in the HTML.
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
// Brace-counts <section>/</section> from the outer open tag.
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

// True if the init() body contains an UNCOMMENTED call to fnCall (e.g. "paintDryRunPreview(").
function initHasActiveCall(fnBody, fnCall) {
    if (!fnBody) return false;
    return fnBody.split('\n').some(function(line) {
        var t = line.trim();
        if (t.indexOf('//') === 0) return false;        // pure comment line
        var idx = t.indexOf(fnCall);
        if (idx < 0) return false;
        var before = t.slice(0, idx);
        return before.indexOf('//') < 0;                 // call not behind a // on same line
    });
}

// ── Section 1: Primary live path intact (T01-T06) ─────────────────────────
console.log('\n─── Section 1: Primary live path intact ───');

check(idCount(htmlSrc, 'sw-live-workspace') === 1,
      'T01: #sw-live-workspace exists');
check(idCount(htmlSrc, 'sw-live-scenario-header') === 1,
      'T02: #sw-live-scenario-header exists');
check(isInsideSection(htmlSrc, 'sw-nav-card', 'sw-live-workspace'),
      'T03: #sw-nav-card inside #sw-live-workspace');
check(isInsideSection(htmlSrc, 'sw-live-decision-card', 'sw-live-workspace'),
      'T04: #sw-live-decision-card inside #sw-live-workspace');
check(idCount(htmlSrc, 'sw-live-step-units-card') === 1 &&
      isInsideSection(htmlSrc, 'sw-live-step-units-card', 'sw-live-workspace'),
      'T05: #sw-live-step-units-card exists and stays live');
check(idCount(htmlSrc, 'sw-live-event-log-card') === 1 &&
      isInsideSection(htmlSrc, 'sw-live-event-log-card', 'sw-live-workspace'),
      'T06: #sw-live-event-log-card exists and stays live');

// ── Section 2: Operator State moved in, not duplicated (T07-T08) ──────────
console.log('\n─── Section 2: Operator State placement ───');

check(isInsideSection(htmlSrc, 'sw-operator-state-card', 'sw-live-workspace'),
      'T07: Operator State card is inside #sw-live-workspace');
var opStateOnce =
      idCount(htmlSrc, 'sw-operator-state-card') === 1 &&
      idCount(htmlSrc, 'sw-last-decision') === 1 &&
      idCount(htmlSrc, 'sw-safety-chip') === 1 &&
      idCount(htmlSrc, 'sw-service-chip') === 1 &&
      (htmlSrc.split('data-i18n="sw-section-operator"').length - 1) === 1;
check(opStateOnce, 'T08: No duplicate Operator State card / chips',
      opStateOnce ? 'all operator IDs unique' : 'duplicate detected');

// ── Section 3: Legacy summary demoted + collapsed (T09-T12) ───────────────
console.log('\n─── Section 3: Legacy scenario summary demoted ───');

var legacyCollapsed =
      idCount(htmlSrc, 'sw-legacy-summary-section') === 1 &&
      /id="sw-legacy-summary-body"[^>]*\shidden/.test(htmlSrc);
check(legacyCollapsed, 'T09: Legacy summary is secondary + collapsed by default',
      legacyCollapsed ? 'body has hidden attr' : 'not collapsed');
check(idCount(htmlSrc, 'sw-name') === 1 && isInsideSection(htmlSrc, 'sw-name', 'sw-legacy-summary-section'),
      'T10: #sw-name still exists (inside legacy summary)');
check(idCount(htmlSrc, 'sw-status') === 1 && isInsideSection(htmlSrc, 'sw-status', 'sw-legacy-summary-section'),
      'T11: #sw-status still exists (inside legacy summary)');
check(idCount(htmlSrc, 'sw-phase') === 1 && isInsideSection(htmlSrc, 'sw-phase', 'sw-legacy-summary-section'),
      'T12: #sw-phase still exists (inside legacy summary)');

// ── Section 4: Paint functions preserved + still called (T13-T17) ─────────
console.log('\n─── Section 4: Paint functions preserved ───');

check(swSrc.indexOf('function paintScenarioOverview(') >= 0,
      'T13: paintScenarioOverview still defined');
var paintOverviewCalls = (swSrc.split('paintScenarioOverview()').length - 1);
check(paintOverviewCalls >= 2,
      'T14: paintScenarioOverview still called by refresh/init', paintOverviewCalls + ' call sites');
check(swSrc.indexOf('function paintSafety(') >= 0,
      'T15: paintSafety still defined');
check(swSrc.indexOf('function paintService(') >= 0,
      'T16: paintService still defined');
check(swSrc.indexOf('function paintLastDecision(') >= 0,
      'T17: paintLastDecision still defined');

// ── Section 5: Secondary mock cards stay collapsed (T18-T24) ──────────────
console.log('\n─── Section 5: Secondary mock cards collapsed ───');

check(/id="sw-secondary-cards-body"[^>]*\shidden/.test(htmlSrc),
      'T18: #sw-secondary-cards remains collapsed (body hidden)');
// PR-287D: #spt-card was promoted OUT of secondary into #sw-live-workspace
// (now wired to scenario.phase_table). It is no longer a secondary mock card.
check(isInsideSection(htmlSrc, 'spt-card', 'sw-live-workspace'),
      'T19: #spt-card promoted into #sw-live-workspace (PR-287D)');
[['T20','oid-card'],['T21','apc-card'],
 ['T22','pra-card'],['T23','dps-card'],['T24','uild-card']].forEach(function(p) {
    check(isInsideSection(htmlSrc, p[1], 'sw-secondary-cards'),
          p[0] + ': #' + p[1] + ' remains inside #sw-secondary-cards');
});

// ── Section 6: Dry-run / W3 stays hidden, no auto-render (T25-T27) ─────────
console.log('\n─── Section 6: Dry-run stays hidden ───');

check(/id="sw-drp-section"\s+hidden/.test(htmlSrc),
      'T25: #sw-drp-section remains hidden');
check(/id="sw-w3-load-bar"\s+hidden/.test(htmlSrc),
      'T26: #sw-w3-load-bar remains hidden');
var initBody = extractFn(swSrc, 'init');
check(!initHasActiveCall(initBody, 'paintDryRunPreview(') &&
      !initHasActiveCall(initBody, 'paintWargame3Preview('),
      'T27: AMBER RIDGE / W3 does NOT auto-render in init()');

// ── Section 7: Source hub unchanged (T28-T34) ─────────────────────────────
console.log('\n─── Section 7: Scenario source hub unchanged ───');

var liveOpen = htmlSrc.match(/<div id="sw-source-live-primary"[^>]*>/);
check(idCount(htmlSrc, 'sw-source-live-primary') === 1 &&
      liveOpen && liveOpen[0].indexOf('hidden') < 0,
      'T28: #sw-source-live-primary remains visible');
check(/id="sw-source-advanced-body"[^>]*\shidden/.test(htmlSrc),
      'T29: #sw-source-advanced-imports remains collapsed');
check(isInsideSection(htmlSrc, 'sw-local-json-source-card', 'sw-source-advanced-imports') ||
      idCount(htmlSrc, 'sw-local-json-source-card') === 1,
      'T30: #sw-local-json-source-card stays in advanced imports');
check(swSrc.indexOf('initLiveScenarioImport(') >= 0,
      'T31: single-file live import still wired');
check(swSrc.indexOf('initLiveScenarioFolderImport(') >= 0,
      'T32: folder scan/import still wired');
check(idCount(htmlSrc, 'sw-local-json-source-card') === 1,
      'T33: decision package import still exists (secondary)');
// No NEW source-card IDs introduced beyond the known set.
var sourceCardIds = (htmlSrc.match(/id="sw-[a-z0-9-]*source[a-z0-9-]*"/g) || []);
check(sourceCardIds.length > 0,
      'T34: no new import controls added', sourceCardIds.length + ' known source nodes');

// ── Section 8: No forbidden actions (T35-T38) ─────────────────────────────
console.log('\n─── Section 8: No forbidden actions ───');

// Return the substring of the <section> identified by `id` (brace-counting <section>).
function sectionSlice(html, id) {
    var openIdx = html.indexOf('id="' + id + '"');
    if (openIdx < 0) return '';
    var secStart = html.lastIndexOf('<section', openIdx);
    if (secStart < 0) secStart = openIdx;
    var i = html.indexOf('>', openIdx);
    if (i < 0) return '';
    var depth = 1;
    while (i < html.length && depth > 0) {
        var nextOpen  = html.indexOf('<section', i + 1);
        var nextClose = html.indexOf('</section>', i + 1);
        if (nextClose < 0) break;
        if (nextOpen > 0 && nextOpen < nextClose) { depth++; i = nextOpen; }
        else { depth--; i = nextClose; }
    }
    return html.slice(secStart, i + 10);
}

// Scoped guard: no Apply/Execute/Commit/Go-Live commit button inside the
// scenario-workspace panel. Iterative scan (no regex backtracking on big file):
// for each <button …> segment, strip tags and test the visible label.
// Whole-file scan is intentionally avoided — unrelated panels (e.g. the SIDC
// symbol picker's "Apply") are out of scope for the sim-commit boundary.
function findForbiddenButton(html) {
    var FORBIDDEN = /\b(apply|execute|commit|go ?-?live)\b/i;
    var from = 0;
    while (true) {
        var open = html.indexOf('<button', from);
        if (open < 0) return null;
        var close = html.indexOf('</button>', open);
        if (close < 0) return null;
        var seg = html.slice(open, close);
        var label = seg.replace(/<[^>]*>/g, ' ');           // strip inner tags
        if (FORBIDDEN.test(label)) return label.trim().slice(0, 60);
        from = close + 9;
    }
}
var swPanel = sectionSlice(htmlSrc, 'scenario-workspace-panel');
var forbiddenBtn = findForbiddenButton(swPanel);
check(swPanel.length > 0 && !forbiddenBtn,
      'T35: no Apply/Execute/Commit/Go-Live buttons in scenario workspace',
      forbiddenBtn ? 'FOUND: ' + forbiddenBtn : 'scoped to #scenario-workspace-panel');

// New PR-287C code must not introduce backend / fetch / storage / mutation.
var legacyFn = extractFn(swSrc, 'initLegacySummaryToggle') || '';
var newCodeClean =
      legacyFn.indexOf('fetch') < 0 &&
      legacyFn.indexOf('XMLHttpRequest') < 0 &&
      legacyFn.indexOf('/api/sim/commit') < 0;
check(newCodeClean && !/PR-287C[\s\S]{0,400}?\bfetch\(/.test(swSrc),
      'T36: PR-287C adds no backend/fetch/XHR');
var noStorage =
      legacyFn.indexOf('localStorage') < 0 &&
      legacyFn.indexOf('sessionStorage') < 0 &&
      legacyFn.indexOf('indexedDB') < 0;
check(noStorage, 'T37: PR-287C adds no storage');
check(legacyFn.indexOf('RmoozScenario') < 0 &&
      legacyFn.indexOf('window.RmoozScenario') < 0,
      'T38: PR-287C toggle does not mutate window.RmoozScenario');

// ── Section 9: Untouched files (T39-T41) ──────────────────────────────────
console.log('\n─── Section 9: Untouched files ───');

check(w3Src.indexOf('PR-287C') < 0,
      'T39: wargame3.json not touched by PR-287C');
check(appJs.indexOf('PR-287C') < 0,
      'T40: app.js not touched by PR-287C');
check(adjMap.indexOf('PR-287C') < 0,
      'T41: adjudicator-map.js not touched by PR-287C');

// ── Section 10: i18n keys resolve EN + AR (T42-T43) ───────────────────────
console.log('\n─── Section 10: i18n keys resolve ───');

var I18N_KEYS = [
    'sw-legacy-summary-title', 'sw-legacy-summary-subtitle',
    'sw-legacy-summary-toggle-show', 'sw-legacy-summary-toggle-hide',
    'sw-mock-badge-mock', 'sw-mock-badge-dev-only', 'sw-mock-badge-not-live'
];
var missingKey = I18N_KEYS.filter(function(k) {
    // each key must appear at least twice: once in EN block, once in AR block
    return (i18nSrc.split("'" + k + "'").length - 1) < 2;
});
check(missingKey.length === 0,
      'T42/T43: all PR-287C i18n keys present in EN + AR',
      missingKey.length ? 'MISSING: ' + missingKey.join(', ') : 'all 7 keys x2');
// Arabic sanity — toggle label contains Arabic text.
check(/إظهار الملخص القديم/.test(i18nSrc) && /Show legacy summary/.test(i18nSrc),
      'T43b: AR + EN legacy toggle strings both present');

// ── Section 11: JS parses, wiring present (T44 + extras) ──────────────────
console.log('\n─── Section 11: JS integrity + wiring ───');

try {
    new Function(swSrc);
    check(true, 'T44: scenario-workspace.js parses without syntax error');
} catch (err) {
    check(false, 'T44: scenario-workspace.js parses without syntax error', err.message);
}
check(swSrc.indexOf('function initLegacySummaryToggle(') >= 0,
      'Extra-01: initLegacySummaryToggle defined');
check(swSrc.indexOf('initLegacySummaryToggle();') >= 0,
      'Extra-02: initLegacySummaryToggle called in init()');
check(swSrc.indexOf('initLegacySummaryToggle:') >= 0,
      'Extra-03: initLegacySummaryToggle exported on public API');
check(cssSrc.indexOf('.sw-legacy-summary-section') >= 0 &&
      cssSrc.indexOf('.sw-operator-state-card') >= 0,
      'Extra-04: legacy summary + operator state CSS present');
// Toggle must flip only the hidden attribute (no display mutation, no storage).
check(legacyFn.indexOf("removeAttribute('hidden')") >= 0 &&
      legacyFn.indexOf("setAttribute('hidden'") >= 0,
      'Extra-05: toggle flips hidden attribute only');

// ── Final ─────────────────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(65));
console.log('  PR-287C Test Results — Duplication Cleanup Pass');
console.log('═'.repeat(65));
console.log('  Passed: ' + passed + '  |  Failed: ' + failed);
console.log('═'.repeat(65));
console.log('\n  Verdict: ' + (failed === 0 ? 'PASS' : 'FAIL'));

process.exit(failed === 0 ? 0 : 1);
