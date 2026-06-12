/**
 * test-pr-286L1A.js — PR-286L1A: Scenario Source Hub Simplification.
 *
 * Verifies the source area is reorganized:
 *   - #sw-scenario-source-hub wraps primary + advanced + rules
 *   - Live Scenario Import card is inside #sw-source-live-primary (visible by default)
 *   - Decision Package Import is inside collapsed #sw-source-advanced-imports
 *   - Folder Intake stays inside the live import card
 *   - All PR-286L0 / PR-286L1 functionality preserved
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

let passed = 0, failed = 0;
const results = [];

function check(ok, label, detail) {
    results.push({ ok, label, detail });
    if (ok) passed++; else failed++;
    console.log('  ' + (ok ? '✅' : '❌') + '  ' + label +
                (detail !== undefined ? ' — ' + detail : ''));
}

function isInsideSection(html, innerId, outerId) {
    var openIdx  = html.indexOf('id="' + outerId + '"');
    var innerIdx = html.indexOf('id="' + innerId + '"');
    if (openIdx < 0 || innerIdx < 0 || innerIdx < openIdx) return false;
    // Walk from outer-open, counting <div / </div> opens/closes to find matching close.
    var i = html.indexOf('>', openIdx);
    if (i < 0) return false;
    var depth = 1;
    while (i < html.length && depth > 0) {
        var nextOpen  = html.indexOf('<div', i + 1);
        var nextClose = html.indexOf('</div>', i + 1);
        if (nextClose < 0) return false;
        if (nextOpen > 0 && nextOpen < nextClose) { depth++; i = nextOpen; }
        else                                       { depth--; i = nextClose; }
    }
    return innerIdx < i;
}

function elementHasHiddenAttr(html, attrFragment) {
    var idx = html.indexOf(attrFragment);
    if (idx < 0) return false;
    var start = html.lastIndexOf('<', idx);
    var end   = html.indexOf('>', idx);
    if (start < 0 || end < 0) return false;
    return /\shidden(\s|>|=)/.test(html.slice(start, end + 1));
}

// ── Section 1: New IDs exist (T1-T4) ──────────────────────────────────────
console.log('\n─── Section 1: New IDs exist ───');

[
    ['T01', 'sw-scenario-source-hub'],
    ['T02', 'sw-source-live-primary'],
    ['T03', 'sw-source-advanced-imports'],
    ['T04', 'sw-source-import-rules']
].forEach(function(p) {
    check(htmlSrc.indexOf('id="' + p[1] + '"') >= 0,
          p[0] + ': #' + p[1] + ' present');
});

// ── Section 2: Primary card holds Live Import + Folder Intake (T5-T6) ─────
console.log('\n─── Section 2: Primary card contents ───');

check(isInsideSection(htmlSrc, 'sw-live-scenario-import-card', 'sw-source-live-primary'),
      'T05: Live Scenario Import card is INSIDE #sw-source-live-primary');
check(isInsideSection(htmlSrc, 'sw-live-scenario-folder-intake', 'sw-source-live-primary'),
      'T06: Folder Intake is INSIDE primary (still inside Live Scenario Import card)');

// Primary card is visible by default (not hidden)
check(!elementHasHiddenAttr(htmlSrc, 'id="sw-source-live-primary"'),
      'T05b: #sw-source-live-primary has no hidden attribute (visible by default)');

// ── Section 3: Decision Package Import demoted to Advanced (T7-T9) ────────
console.log('\n─── Section 3: Decision Package Import demoted ───');

check(isInsideSection(htmlSrc, 'sw-local-json-source-card', 'sw-source-advanced-imports'),
      'T07: Decision Package Import card is INSIDE #sw-source-advanced-imports');
check(elementHasHiddenAttr(htmlSrc, 'id="sw-source-advanced-body"'),
      'T08: #sw-source-advanced-body is hidden by default (collapsed)');
check(isInsideSection(htmlSrc, 'sw-local-json-source-card', 'sw-source-advanced-body'),
      'T09: Decision Package Import is INSIDE the collapsed body specifically');

// Toggle button exists
check(htmlSrc.indexOf('id="sw-source-advanced-toggle"') >= 0,
      'T09b: #sw-source-advanced-toggle button exists');

// ── Section 4: All existing functionality preserved (T10-T13) ─────────────
console.log('\n─── Section 4: Existing functionality preserved ───');

// T10: single-file live import button intact
check(htmlSrc.indexOf('id="sw-live-scenario-import-btn"') >= 0,
      'T10: single-file live import button (#sw-live-scenario-import-btn) intact');

// T11: folder scan button intact
check(htmlSrc.indexOf('id="sw-live-scenario-folder-scan-btn"') >= 0,
      'T11: folder scan button (#sw-live-scenario-folder-scan-btn) intact');

// T12: selected folder JSON import button intact
check(htmlSrc.indexOf('id="sw-live-scenario-folder-import-btn"') >= 0,
      'T12: folder import button (#sw-live-scenario-folder-import-btn) intact');

// T13: Decision Package Import IDs intact
var dpkgIds = [
    'sw-dpkg-manifest-input', 'sw-dpkg-steps-input', 'sw-dpkg-import-json',
    'sw-local-json-source-card', 'sw-src-local-title'
];
var missing = dpkgIds.filter(function(id) {
    return htmlSrc.indexOf('id="' + id + '"') < 0;
});
check(missing.length === 0,
      'T13: Decision Package Import IDs intact',
      missing.length ? 'MISSING: ' + missing.join(', ') : 'all present');

// ── Section 5: W3 dry-run + AMBER still hidden (T14) ──────────────────────
console.log('\n─── Section 5: W3 dry-run + AMBER still hidden ───');

check(elementHasHiddenAttr(htmlSrc, 'id="sw-drp-section"'),
      'T14a: #sw-drp-section remains hidden');
check(elementHasHiddenAttr(htmlSrc, 'id="sw-w3-load-bar"'),
      'T14b: #sw-w3-load-bar remains hidden');
var initBlockStart = swSrc.indexOf('_initDrpNavButtons();');
var initBlockEnd   = swSrc.indexOf("logSystem('elog-evt-sw-rendered'");
var initBlock      = swSrc.slice(initBlockStart, initBlockEnd);
check(!/(?:^|\n)\s*paintDryRunPreview\s*\(\s*\)\s*;/.test(initBlock),
      'T14c: AMBER RIDGE not auto-rendered in init');

// ── Section 6: No backend / Gate 7 / mutation (T15-T17) ───────────────────
console.log('\n─── Section 6: No backend / Gate 7 / mutation ───');

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

var toggleFn = extractFn(swSrc, 'initSourceAdvancedImportsToggle');
check(toggleFn !== null,
      'T15a: initSourceAdvancedImportsToggle defined');
check(toggleFn && !/fetch\s*\(|XMLHttpRequest|\$\.ajax/.test(toggleFn),
      'T15: no fetch / XHR / backend in new toggle');
check(toggleFn && !/localStorage\s*\.|sessionStorage\s*\.|indexedDB\s*\./.test(toggleFn),
      'T15b: no storage in new toggle');
check(toggleFn && !/\/api\/sim\/commit|applyDecision|executeSimulation|Gate\s*7|go[\s_-]?live/i
                  .test(toggleFn),
      'T16: no Gate 7 / apply / execute / commit / go-live in new toggle');
check(toggleFn && !/window\.RmoozScenario\.scenario\s*=|RmoozScenario\.stepIndex\s*=/.test(toggleFn),
      'T17: toggle does not mutate window.RmoozScenario');

// ── Section 7: Protected files unchanged (T18-T20) ────────────────────────
console.log('\n─── Section 7: Protected files unchanged ───');

if (fs.existsSync(W3_PATH)) {
    var w3 = JSON.parse(fs.readFileSync(W3_PATH, 'utf8'));
    check(Array.isArray(w3.red_units) && w3.red_units.length === 70 &&
          Array.isArray(w3.blue_units_initial) && w3.blue_units_initial.length === 83,
          'T18: wargame3.json unchanged (70 red + 83 blue)');
}
if (fs.existsSync(APP_JS)) {
    check(fs.readFileSync(APP_JS, 'utf8').indexOf('PR-286L1A') < 0,
          'T19: app.js not modified by PR-286L1A');
}
if (fs.existsSync(ADJ_MAP)) {
    check(fs.readFileSync(ADJ_MAP, 'utf8').indexOf('PR-286L1A') < 0,
          'T20: adjudicator-map.js not modified by PR-286L1A');
}

// ── Section 8: i18n EN + AR (T21) ─────────────────────────────────────────
console.log('\n─── Section 8: i18n EN + AR ───');

var KEYS = [
    'sw-source-live-primary-title', 'sw-source-live-primary-subtitle',
    'sw-source-advanced-title', 'sw-source-advanced-sub',
    'sw-source-advanced-toggle-show', 'sw-source-advanced-toggle-hide',
    'sw-source-import-rules-title',
    'sw-source-rule-1', 'sw-source-rule-2', 'sw-source-rule-3', 'sw-source-rule-4'
];
var enStart = i18nSrc.indexOf('en:');
var arStart = i18nSrc.indexOf('ar:');
var enBlock = i18nSrc.slice(enStart, arStart);
var arBlock = i18nSrc.slice(arStart);
var missEn  = KEYS.filter(function(k) { return enBlock.indexOf("'" + k + "'") < 0; });
var missAr  = KEYS.filter(function(k) { return arBlock.indexOf("'" + k + "'") < 0; });

check(missEn.length === 0, 'T21a: all PR-286L1A EN keys present',
      missEn.length ? 'MISSING: ' + missEn.join(', ') : 'all present');
check(missAr.length === 0, 'T21b: all PR-286L1A AR keys present',
      missAr.length ? 'MISSING: ' + missAr.join(', ') : 'all present');
check(arBlock.indexOf('الاستيرادات المتقدمة') >= 0,
      'T21c: AR advanced-title contains Arabic text');

// ── Section 9: CSS (T22-like) ─────────────────────────────────────────────
console.log('\n─── Section 9: CSS ───');

[
    '.sw-scenario-source-hub',
    '.sw-source-live-primary',
    '.sw-source-advanced-imports',
    '.sw-source-advanced-toggle',
    '.sw-source-advanced-body',
    '.sw-source-import-rules',
    '.sw-source-rules-list'
].forEach(function(sel, i) {
    check(cssSrc.indexOf(sel) >= 0, 'T22.' + (i + 1) + ': CSS ' + sel + ' defined');
});

// ── Section 10: Source loads without syntax error (T22-end) ───────────────
console.log('\n─── Section 10: source syntax ───');

try {
    new Function(swSrc);
    check(true, 'T22-end: scenario-workspace.js parses without syntax error');
} catch (err) {
    check(false, 'T22-end: scenario-workspace.js parses without syntax error', err.message);
}

// ── Extras ────────────────────────────────────────────────────────────────

check(initBlock.indexOf('initSourceAdvancedImportsToggle()') >= 0,
      'Extra-01: initSourceAdvancedImportsToggle() wired into init() block');

check(swSrc.indexOf('initSourceAdvancedImportsToggle:') >= 0,
      'Extra-02: initSourceAdvancedImportsToggle exported');

// External Scenario Catalog still present (outside the hub by design)
check(htmlSrc.indexOf('id="sw-external-catalog-source-card"') >= 0,
      'Extra-03: External Scenario Catalog card still present (unchanged)');

// All PR-280–286L1 exports still present
var prevExports = [
    'validateLiveScenarioJson', 'loadLiveScenarioFromJson',
    'getCurrentLiveScenarioSummary', 'initLiveScenarioImport',
    'classifyScenarioFolderFile', 'scanScenarioFolderFiles',
    'getLiveScenarioFolderScanState', 'importSelectedFolderScenarioJson',
    'initLiveScenarioFolderImport', 'getLiveScenarioIdentity',
    'paintLiveScenarioHeader', 'paintLiveDecisionActionCard',
    'recordLiveOperatorSelection', 'initSecondaryCardsToggle'
];
var missingPrev = prevExports.filter(function(n) { return swSrc.indexOf(n + ':') < 0; });
check(missingPrev.length === 0,
      'Extra-04: all previous PR exports still present',
      missingPrev.length ? 'MISSING: ' + missingPrev.join(', ') : 'all present');

// Rules list contains 4 li items
var rulesBlock = htmlSrc.slice(
    htmlSrc.indexOf('id="sw-source-import-rules"'),
    htmlSrc.indexOf('id="sw-source-import-rules"') + 1500
);
var liCount = (rulesBlock.match(/<li/g) || []).length;
check(liCount >= 4, 'Extra-05: rules strip lists ≥ 4 rule items', 'li:' + liCount);

// ── Final ─────────────────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(65));
console.log('  PR-286L1A Test Results');
console.log('═'.repeat(65));
console.log('  Passed: ' + passed + '  |  Failed: ' + failed);
console.log('═'.repeat(65));
console.log('\n  Verdict: ' + (failed === 0 ? 'PASS' : 'FAIL'));

process.exit(failed === 0 ? 0 : 1);
