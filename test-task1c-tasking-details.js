'use strict';
/**
 * test-task1c-tasking-details.js — TASK1-C: Current Orders UI details
 *
 * Verifies the collapsible "CURRENT ORDERS" block that surfaces
 * action_why, action_intended_effect, action_doctrine_cited from
 * ws.derived.unit_tasking.
 *
 * TC-1   usp-tasking-block element exists in HTML
 * TC-2   usp-tasking-why element present
 * TC-3   usp-tasking-effect element present
 * TC-4   usp-tasking-doctrine element present
 * TC-5   usp-tasking-step element present
 * TC-6   _populateTaskingDetails function in panel JS
 * TC-7   _setTaskingRow function in panel JS
 * TC-8   panel hides block when tasking is null
 * TC-9   panel hides block when all detail fields are empty
 * TC-10  panel hides individual row when field missing/empty
 * TC-11  action_why shown when present
 * TC-12  action_intended_effect shown when present
 * TC-13  action_doctrine_cited array joined with ·
 * TC-14  empty doctrine array → doctrine row hidden
 * TC-15  step_index + phase shown in step label
 * TC-16  step only (no phase) shows gracefully
 * TC-17  phase only (no step) shows gracefully
 * TC-18  neither step nor phase → step label empty
 * TC-19  i18n EN key usp-lbl-orders present in i18n.js
 * TC-20  i18n EN key usp-lbl-why present
 * TC-21  i18n EN key usp-lbl-effect present
 * TC-22  i18n EN key usp-lbl-doctrine present
 * TC-23  i18n AR key usp-lbl-orders present (Arabic text)
 * TC-24  i18n AR key usp-lbl-why present (Arabic)
 * TC-25  i18n AR key usp-lbl-effect present (Arabic)
 * TC-26  i18n AR key usp-lbl-doctrine present (Arabic)
 * TC-27  data-i18n attributes on tasking HTML rows
 * TC-28  CSS .usp-tasking-block in app.html
 * TC-29  CSS light theme override for tasking block
 * TC-30  CSS RTL override for tasking row
 * TC-31  no mutation/apply/commit buttons in panel HTML
 * TC-32  no AppMiddleEastPlatform reference in panel JS
 * TC-33  no old #unit-panel in HTML
 * PREV-1 existing test-task1b still loads correctly (world-state derives unit_tasking)
 */

const fs   = require('fs');
const path = require('path');
const ROOT = __dirname;

let passed = 0, failed = 0;
const failures = [];
function ok(label, cond, detail) {
    if (cond) { passed++; }
    else { failed++; failures.push('FAIL: ' + label + (detail ? '  — ' + detail : '')); }
}

// ── Source files ──────────────────────────────────────────────────────────
const APP_HTML  = fs.readFileSync(path.join(ROOT, 'UI_MOdified/client/app.html'), 'utf8');
const PANEL_JS  = fs.readFileSync(path.join(ROOT, 'UI_MOdified/client/shell/unit-status-panel.js'), 'utf8');
const I18N_JS   = fs.readFileSync(path.join(ROOT, 'UI_MOdified/client/i18n.js'), 'utf8');

// Extract Commander Panel HTML block only
const panelStart = APP_HTML.indexOf('id="unit-status-panel"');
const panelEnd   = APP_HTML.indexOf('<!-- OBJ-C:', panelStart);
const panelHtml  = panelStart >= 0 && panelEnd > panelStart
    ? APP_HTML.slice(panelStart, panelEnd) : '';

// ═══════════════════════════════════════════════════════════════════════════
// TC-1..5: HTML structure
// ═══════════════════════════════════════════════════════════════════════════
ok('TC-1: usp-tasking-block element in panel HTML',
    panelHtml.includes('id="usp-tasking-block"'));
ok('TC-2: usp-tasking-why element in panel HTML',
    panelHtml.includes('id="usp-tasking-why"'));
ok('TC-3: usp-tasking-effect element in panel HTML',
    panelHtml.includes('id="usp-tasking-effect"'));
ok('TC-4: usp-tasking-doctrine element in panel HTML',
    panelHtml.includes('id="usp-tasking-doctrine"'));
ok('TC-5: usp-tasking-step element in panel HTML',
    panelHtml.includes('id="usp-tasking-step"'));

// ═══════════════════════════════════════════════════════════════════════════
// TC-6..7: JS function presence
// ═══════════════════════════════════════════════════════════════════════════
ok('TC-6: _populateTaskingDetails in panel JS',
    PANEL_JS.includes('function _populateTaskingDetails'));
ok('TC-7: _setTaskingRow in panel JS',
    PANEL_JS.includes('function _setTaskingRow'));

// ═══════════════════════════════════════════════════════════════════════════
// TC-8..10: null / empty guards (via source inspection)
// ═══════════════════════════════════════════════════════════════════════════
ok('TC-8: block hidden when tasking null (setAttribute hidden)',
    PANEL_JS.includes('block.setAttribute(\'hidden\'') ||
    PANEL_JS.includes('block.setAttribute("hidden"'));

ok('TC-9: block hidden when all fields empty (anyVisible check)',
    PANEL_JS.includes('anyVisible'));

ok('TC-10: individual row hidden when field empty/missing',
    PANEL_JS.includes('row.setAttribute(\'hidden\'') ||
    PANEL_JS.includes('row.setAttribute("hidden"'));

// ═══════════════════════════════════════════════════════════════════════════
// TC-11..14: field rendering (via source inspection)
// ═══════════════════════════════════════════════════════════════════════════
ok('TC-11: action_why used for why row',
    PANEL_JS.includes('action_why') &&
    PANEL_JS.includes('usp-tasking-why'));

ok('TC-12: action_intended_effect used for effect row',
    PANEL_JS.includes('action_intended_effect') &&
    PANEL_JS.includes('usp-tasking-effect'));

ok('TC-13: doctrine array joined with separator',
    PANEL_JS.includes('action_doctrine_cited') &&
    PANEL_JS.includes('join(') &&
    PANEL_JS.includes('usp-tasking-doctrine'));

ok('TC-14: empty doctrine array → row hidden (filter + length check)',
    PANEL_JS.includes('docArr.length'));

// ═══════════════════════════════════════════════════════════════════════════
// TC-15..18: step/phase label logic (via source inspection)
// ═══════════════════════════════════════════════════════════════════════════
ok('TC-15: step_index + phase both used in step label',
    PANEL_JS.includes('step_index + 1') && PANEL_JS.includes('tasking.phase'));

ok('TC-16: step_index only path exists (phase conditional)',
    PANEL_JS.includes('step_index != null'));

ok('TC-17: phase only path exists (step conditional)',
    PANEL_JS.includes("tasking.phase &&") ||
    PANEL_JS.includes("if (tasking.phase)") ||
    PANEL_JS.includes("tasking.phase ?") ||
    PANEL_JS.includes("if (tasking.phase) {"));

ok('TC-18: no step/phase → empty label (step label defaults to empty string)',
    PANEL_JS.includes("var stepLabel = ''"));

// ═══════════════════════════════════════════════════════════════════════════
// TC-19..26: i18n keys
// ═══════════════════════════════════════════════════════════════════════════
ok('TC-19: EN key usp-lbl-orders',   I18N_JS.includes("'usp-lbl-orders'"));
ok('TC-20: EN key usp-lbl-why',      I18N_JS.includes("'usp-lbl-why'"));
ok('TC-21: EN key usp-lbl-effect',   I18N_JS.includes("'usp-lbl-effect'"));
ok('TC-22: EN key usp-lbl-doctrine', I18N_JS.includes("'usp-lbl-doctrine'"));
ok('TC-23: AR key usp-lbl-orders (Arabic text)', I18N_JS.includes('الأوامر الحالية'));
ok('TC-24: AR key usp-lbl-why (Arabic text)', I18N_JS.includes('السبب'));
ok('TC-25: AR key usp-lbl-effect (Arabic text)', I18N_JS.includes('الأثر المقصود'));
ok('TC-26: AR key usp-lbl-doctrine (Arabic text)', I18N_JS.includes('المبدأ'));

// ═══════════════════════════════════════════════════════════════════════════
// TC-27: data-i18n on tasking rows
// ═══════════════════════════════════════════════════════════════════════════
ok('TC-27a: data-i18n=usp-lbl-orders in tasking block HTML',
    panelHtml.includes('data-i18n="usp-lbl-orders"'));
ok('TC-27b: data-i18n=usp-lbl-why in tasking block HTML',
    panelHtml.includes('data-i18n="usp-lbl-why"'));
ok('TC-27c: data-i18n=usp-lbl-effect in tasking block HTML',
    panelHtml.includes('data-i18n="usp-lbl-effect"'));
ok('TC-27d: data-i18n=usp-lbl-doctrine in tasking block HTML',
    panelHtml.includes('data-i18n="usp-lbl-doctrine"'));

// ═══════════════════════════════════════════════════════════════════════════
// TC-28..30: CSS
// ═══════════════════════════════════════════════════════════════════════════
ok('TC-28: CSS .usp-tasking-block defined',
    APP_HTML.includes('.usp-tasking-block'));
ok('TC-29: CSS light theme override for tasking',
    APP_HTML.includes('[data-theme="light"] .usp-tasking-block'));
ok('TC-30: CSS RTL override for tasking row',
    APP_HTML.includes('[dir="rtl"] .usp-tasking-row'));

// ═══════════════════════════════════════════════════════════════════════════
// TC-31..33: safety
// ═══════════════════════════════════════════════════════════════════════════
ok('TC-31: no apply/commit/execute in Commander Panel HTML',
    !/button[^>]*>.*(?:apply|commit|execute)/i.test(panelHtml));
ok('TC-32: no AppMiddleEastPlatform API call in panel JS',
    !/AppMiddleEastPlatform\s*\./.test(PANEL_JS));
ok('TC-33: no old #unit-panel in HTML',
    !/id=["']unit-panel["']/.test(APP_HTML));

// ═══════════════════════════════════════════════════════════════════════════
// PREV-1: regression — world state still derives unit_tasking
// ═══════════════════════════════════════════════════════════════════════════
(function() {
    var sandbox = {};
    sandbox.window = sandbox;
    var src = fs.readFileSync(path.join(ROOT, 'UI_MOdified/client/shell/world-state.js'), 'utf8');
    (new Function('window', src))(sandbox);
    var WS = sandbox.AppWorldState;
    ok('PREV-1a: AppWorldState loads', !!WS);
    ok('PREV-1b: unit_tasking in DERIVATIONS', WS && typeof WS.DERIVATIONS.unit_tasking === 'function');
    var r = WS && WS.computeUnitTasking({
        activity: { actors: [{ uid:'u1', action_component:'ew', action_what:'Jam.', action_why:'Degrade.', action_intended_effect:'Reduce.', action_doctrine_cited:['ADP3-0'] }] },
        meta: { step_index: 1, phase: 'H+1' }
    });
    ok('PREV-1c: round-trip produces entry', r && r['u1'] && r['u1'].action_what === 'Jam.');
    ok('PREV-1d: component_label correct', r && r['u1'] && r['u1'].component_label === 'Electronic Warfare');
    ok('PREV-1e: doctrine_cited array preserved', r && r['u1'] && Array.isArray(r['u1'].action_doctrine_cited) && r['u1'].action_doctrine_cited[0] === 'ADP3-0');
})();

// ═══════════════════════════════════════════════════════════════════════════
// Report
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n═'.repeat(72).slice(0,72));
console.log('  TASK1-C: Current Orders Tasking Detail Block');
console.log('═'.repeat(72).slice(0,72));
if (failures.length) {
    failures.forEach(function(f) { console.log('  ' + f); });
    console.log('');
}
console.log('  Passed: ' + passed + '  |  Failed: ' + failed);
console.log('═'.repeat(72).slice(0,72) + '\n');
console.log('  Verdict: ' + (failed === 0 ? 'PASS' : 'FAIL'));
console.log('═'.repeat(72).slice(0,72) + '\n');
if (failed > 0) process.exit(1);
