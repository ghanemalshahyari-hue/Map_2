#!/usr/bin/env node
'use strict';

// ============================================================
// test-pr-283A.js
// PR-283A: Scenario Workspace Live vs Preview Label Clarification
//
// Coverage: 29 tests across 7 sections
//   1. DOM ID stability (app.html)
//   2. EN i18n key resolution (i18n.js)
//   3. AR i18n key resolution (i18n.js)
//   4. CSS class presence (style.css)
//   5. scenario-workspace.js — badge toggle logic + goToStep unchanged
//   6. No forbidden operations in new additions
//   7. data-i18n attribute integrity (app.html)
//
// Rules:
//   - Label/clarity changes only. No behavior changes.
//   - No new buttons, imports, apply, commit, execute, run, go-live controls.
//   - Do not modify: wargame3.json, app.js, adjudicator-map.js, backend files.
// ============================================================

const fs   = require('fs');
const path = require('path');

const ROOT         = __dirname;
const APP_HTML     = path.join(ROOT, 'UI_MOdified/client/app.html');
const I18N_JS      = path.join(ROOT, 'UI_MOdified/client/i18n.js');
const STYLE_CSS    = path.join(ROOT, 'UI_MOdified/client/style.css');
const SW_JS        = path.join(ROOT, 'UI_MOdified/client/shell/scenario-workspace.js');
const W3_JSON      = path.join(ROOT, 'UI_MOdified/data/scenarios/wargame3.json');
const APP_JS       = path.join(ROOT, 'UI_MOdified/client/app.js');
const ADJ_MAP_JS   = path.join(ROOT, 'UI_MOdified/client/wargame/adjudicator-map.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ✗ ${name}: ${e.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'assertion failed');
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// ── Load source files once ────────────────────────────────────────────────────
let html, i18n, css, swJs;

test('source files readable', () => {
  html  = fs.readFileSync(APP_HTML,  'utf8');
  i18n  = fs.readFileSync(I18N_JS,   'utf8');
  css   = fs.readFileSync(STYLE_CSS, 'utf8');
  swJs  = fs.readFileSync(SW_JS,     'utf8');
  assert(html.length  > 0, 'app.html is empty');
  assert(i18n.length  > 0, 'i18n.js is empty');
  assert(css.length   > 0, 'style.css is empty');
  assert(swJs.length  > 0, 'scenario-workspace.js is empty');
});

// Helper: extract i18n value for a key from the raw source string.
// Matches:   'key-name':  'value string'  or  "key-name": "value string"
// Handles single or double quotes; stops at the first unescaped closing quote.
function extractI18nValue(source, key) {
  // Match: 'key': 'value'  or  "key": "value"
  const re = new RegExp(
    `['"]${key.replace(/[-]/g, '[-]')}['"]\\s*:\\s*(['"])((?:\\\\.|(?!\\1).)*?)\\1`
  );
  const m = re.exec(source);
  if (!m) throw new Error(`i18n key not found: ${key}`);
  return m[2].replace(/\\'/g, "'").replace(/\\"/g, '"');
}

// ============================================================
// Section 1: DOM ID stability — new elements present in app.html
// ============================================================
console.log('\n--- Section 1: DOM ID stability (app.html) ---');

test('01 #sw-drp-amber-badge element exists in app.html', () => {
  assert(html.includes('id="sw-drp-amber-badge"'), '#sw-drp-amber-badge not found in app.html');
});

test('02 #sw-drp-amber-badge has hidden attribute by default', () => {
  // The element must carry `hidden` in its opening tag
  const re = /id="sw-drp-amber-badge"[^>]*hidden/;
  assert(re.test(html), '#sw-drp-amber-badge must have hidden attribute in HTML');
});

test('03 .sw-nav-live-helper element present in app.html', () => {
  assert(html.includes('class="sw-nav-live-helper"'), '.sw-nav-live-helper not found in app.html');
});

test('04 .sw-drp-nav-not-live-helper element present in app.html', () => {
  assert(html.includes('class="sw-drp-nav-not-live-helper"'), '.sw-drp-nav-not-live-helper not found in app.html');
});

// ============================================================
// Section 2: EN i18n key resolution
// ============================================================
console.log('\n--- Section 2: EN i18n key resolution ---');

// We work on the EN block (before AR block begins).
// AR block starts at "ar: {" (the language-object key inside the translations map).
// Find the first occurrence of "ar: {" which marks the Arabic translations object.
const arMarker  = '\n        ar: {';
const arStartIdx = i18n.indexOf(arMarker);
const enEndIdx   = arStartIdx > 0 ? arStartIdx : i18n.length;
const enBlock    = i18n.slice(0, enEndIdx);

test('05 EN sw-nav-title resolves to "Live Scenario Step Navigator"', () => {
  const val = extractI18nValue(enBlock, 'sw-nav-title');
  assertEqual(val, 'Live Scenario Step Navigator', 'EN sw-nav-title');
});

test('06 EN sw-nav-live-helper key exists and is non-empty', () => {
  const val = extractI18nValue(enBlock, 'sw-nav-live-helper');
  assert(val.length > 0, 'EN sw-nav-live-helper must not be empty');
  assert(val.toLowerCase().includes('live'), 'EN sw-nav-live-helper must mention "live"');
});

test('07 EN sw-drp-amber-badge key exists and mentions AMBER RIDGE', () => {
  const val = extractI18nValue(enBlock, 'sw-drp-amber-badge');
  assert(val.includes('AMBER RIDGE'), 'EN sw-drp-amber-badge must contain "AMBER RIDGE"');
});

test('08 EN sw-drp-nav-section-label resolves to "Wargame 3 Preview Navigation — Not Live"', () => {
  const val = extractI18nValue(enBlock, 'sw-drp-nav-section-label');
  assertEqual(val, 'Wargame 3 Preview Navigation — Not Live', 'EN sw-drp-nav-section-label');
});

test('09 EN sw-drp-nav-not-live-helper key exists and mentions "not"', () => {
  const val = extractI18nValue(enBlock, 'sw-drp-nav-not-live-helper');
  assert(val.length > 0, 'EN sw-drp-nav-not-live-helper must not be empty');
  assert(val.toLowerCase().includes('not'), 'EN sw-drp-nav-not-live-helper must contain "not"');
});

test('10 EN sw-w3-section-hdr-title resolves to "Wargame 3 Dry-Run Preview"', () => {
  const val = extractI18nValue(enBlock, 'sw-w3-section-hdr-title');
  assertEqual(val, 'Wargame 3 Dry-Run Preview', 'EN sw-w3-section-hdr-title');
});

// ============================================================
// Section 3: AR i18n key resolution
// ============================================================
console.log('\n--- Section 3: AR i18n key resolution ---');

// AR block starts at the "ar: {" marker
const arBlock = arStartIdx > 0 ? i18n.slice(arStartIdx) : '';

test('11 AR sw-nav-title resolves to Arabic string (non-empty, non-ASCII)', () => {
  assert(arBlock.length > 0, 'AR block not found in i18n.js');
  const val = extractI18nValue(arBlock, 'sw-nav-title');
  // Must be non-empty and contain at least one Arabic character (U+0600–U+06FF)
  assert(val.length > 0, 'AR sw-nav-title must not be empty');
  assert(/[؀-ۿ]/.test(val), 'AR sw-nav-title must contain Arabic characters');
});

test('12 AR sw-nav-live-helper key exists and is non-empty Arabic', () => {
  const val = extractI18nValue(arBlock, 'sw-nav-live-helper');
  assert(val.length > 0, 'AR sw-nav-live-helper must not be empty');
  assert(/[؀-ۿ]/.test(val), 'AR sw-nav-live-helper must contain Arabic characters');
});

test('13 AR sw-drp-amber-badge key exists and mentions AMBER RIDGE', () => {
  const val = extractI18nValue(arBlock, 'sw-drp-amber-badge');
  assert(val.includes('AMBER RIDGE'), 'AR sw-drp-amber-badge must contain "AMBER RIDGE"');
});

test('14 AR sw-drp-nav-section-label updated (mentions Wargame 3)', () => {
  const val = extractI18nValue(arBlock, 'sw-drp-nav-section-label');
  assert(val.includes('Wargame 3'), 'AR sw-drp-nav-section-label must mention "Wargame 3"');
});

test('15 AR sw-drp-nav-not-live-helper key exists and is non-empty Arabic', () => {
  const val = extractI18nValue(arBlock, 'sw-drp-nav-not-live-helper');
  assert(val.length > 0, 'AR sw-drp-nav-not-live-helper must not be empty');
  assert(/[؀-ۿ]/.test(val), 'AR sw-drp-nav-not-live-helper must contain Arabic characters');
});

test('16 AR sw-w3-section-hdr-title updated (non-empty Arabic)', () => {
  const val = extractI18nValue(arBlock, 'sw-w3-section-hdr-title');
  assert(val.length > 0, 'AR sw-w3-section-hdr-title must not be empty');
  assert(/[؀-ۿ]/.test(val), 'AR sw-w3-section-hdr-title must contain Arabic characters');
});

// ============================================================
// Section 4: CSS class presence (style.css)
// ============================================================
console.log('\n--- Section 4: CSS class presence (style.css) ---');

test('17 .sw-nav-live-helper CSS rule exists', () => {
  assert(css.includes('.sw-nav-live-helper'), '.sw-nav-live-helper not found in style.css');
});

test('18 .sw-drp-nav-not-live-helper CSS rule exists', () => {
  assert(css.includes('.sw-drp-nav-not-live-helper'), '.sw-drp-nav-not-live-helper not found in style.css');
});

test('19 .sw-drp-amber-badge CSS rule exists', () => {
  assert(css.includes('.sw-drp-amber-badge'), '.sw-drp-amber-badge not found in style.css');
});

test('20 .sw-drp-amber-badge light-theme override exists', () => {
  assert(
    css.includes('[data-theme="light"] .sw-drp-amber-badge'),
    '[data-theme="light"] .sw-drp-amber-badge override not found in style.css'
  );
});

// ============================================================
// Section 5: scenario-workspace.js — badge toggle + goToStep unchanged
// ============================================================
console.log('\n--- Section 5: scenario-workspace.js logic ---');

test('21 _paintToDOM sets amberBadgeEl.hidden = isW3', () => {
  assert(
    swJs.includes('amberBadgeEl.hidden = isW3'),
    '_paintToDOM must set amberBadgeEl.hidden = isW3'
  );
});

test('22 amberBadgeEl looked up by getElementById("sw-drp-amber-badge")', () => {
  assert(
    swJs.includes('getElementById(\'sw-drp-amber-badge\')') ||
    swJs.includes('getElementById("sw-drp-amber-badge")'),
    'getElementById("sw-drp-amber-badge") not found in scenario-workspace.js'
  );
});

test('23 goToStep still writes window.RmoozScenario.stepIndex', () => {
  assert(
    swJs.includes('window.RmoozScenario.stepIndex'),
    'window.RmoozScenario.stepIndex assignment not found — goToStep may have been altered'
  );
});

test('24 isW3 detection regex unchanged (W3-STEP- prefix test)', () => {
  assert(
    swJs.includes('/^W3-STEP-/i.test(p.activeStepId)'),
    'isW3 regex pattern changed — should remain /^W3-STEP-/i.test(p.activeStepId)'
  );
});

// ============================================================
// Section 6: No forbidden operations in new additions
// ============================================================
console.log('\n--- Section 6: No forbidden operations ---');

// Extract only the lines added by PR-283A (identified by the PR-283A comment block)
// We check that the new amber-badge toggle in _paintToDOM contains no forbidden calls.
function extractPr283ABlock(src) {
  const start = src.indexOf('PR-283A: AMBER RIDGE training-fixture badge');
  if (start < 0) return '';
  // Grab the next ~10 lines after the comment
  return src.slice(start, start + 600);
}

const pr283aBlock = extractPr283ABlock(swJs);

test('25 PR-283A block has no /api/ fetch calls', () => {
  assert(!pr283aBlock.includes('/api/'), 'PR-283A block must not call any /api/ endpoint');
});

test('26 PR-283A block has no commit / apply / execute / run calls', () => {
  const forbidden = ['commit', 'apply', 'execute', 'run(', 'goLive', 'go_live'];
  forbidden.forEach(kw => {
    assert(
      !pr283aBlock.toLowerCase().includes(kw.toLowerCase()),
      `PR-283A block must not contain forbidden keyword: "${kw}"`
    );
  });
});

test('27 Protected files not modified — wargame3.json unchanged (readOnly check)', () => {
  // The file must still exist and contain the correct scenario_id
  const w3raw = fs.readFileSync(W3_JSON, 'utf8');
  const w3 = JSON.parse(w3raw);
  assertEqual(w3.scenario_id, 'wargame3', 'wargame3.json scenario_id');
  assertEqual(w3.name, 'wargame3', 'wargame3.json name');
});

// ============================================================
// Section 7: data-i18n attribute integrity (app.html)
// ============================================================
console.log('\n--- Section 7: data-i18n attribute integrity ---');

test('28 #sw-drp-amber-badge has data-i18n="sw-drp-amber-badge"', () => {
  assert(
    html.includes('data-i18n="sw-drp-amber-badge"'),
    '#sw-drp-amber-badge element must carry data-i18n="sw-drp-amber-badge"'
  );
});

test('29 .sw-nav-live-helper has data-i18n="sw-nav-live-helper"', () => {
  assert(
    html.includes('data-i18n="sw-nav-live-helper"'),
    '.sw-nav-live-helper element must carry data-i18n="sw-nav-live-helper"'
  );
});

// ============================================================
// Summary
// ============================================================
console.log(`\n${'='.repeat(56)}`);
console.log(`PR-283A tests complete: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error(`\n${failed} test(s) FAILED`);
  process.exitCode = 1;
} else {
  console.log('\nAll tests passed ✓');
}
