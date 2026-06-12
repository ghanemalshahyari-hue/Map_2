'use strict';
/**
 * test-task1d-tasking-indicator.js — TASK1-D: tasking indicator in involved-units table
 *
 * TD-1   Orders <th> column header present in app.html table
 * TD-2   data-i18n="sw-live-step-units-col-orders" on the <th>
 * TD-3   i18n EN key sw-live-step-units-col-orders = 'Orders'
 * TD-4   i18n AR key sw-live-step-units-col-orders = 'الأوامر'
 * TD-5   _sluTaskingLabel function exists in scenario-workspace.js
 * TD-6   _sluCellOrders function exists in scenario-workspace.js
 * TD-7   _sluCellOrders appends td with class sw-slu-cell-orders
 * TD-8   unit WITH tasking → chip element rendered with component_label
 * TD-9   unit WITHOUT tasking → '—' rendered, no chip
 * TD-10  chip has title attribute for truncated-text tooltip
 * TD-11  CSS .sw-slu-orders-chip defined in app.html
 * TD-12  CSS light theme override for orders chip
 * TD-13  CSS RTL override for orders cell
 * TD-14  _sluTaskingLabel returns null gracefully when AppAdjudicatorMap absent
 * TD-15  _sluTaskingLabel returns null when world state has no unit_tasking
 * TD-16  _sluTaskingLabel returns component_label when available
 * TD-17  _sluTaskingLabel falls back to action_component when no label
 * TD-18  _sluTaskingLabel falls back to 'Tasked' when neither
 * TD-19  no mutation/apply/execute buttons in Commander Panel HTML
 * TD-20  no AppMiddleEastPlatform in scenario-workspace.js
 * TD-21  no old #unit-panel in HTML
 * TASK1B-REG: world-state unit_tasking derivation still works
 * TASK1C-REG: _populateTaskingDetails still in panel JS
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

const APP_HTML  = fs.readFileSync(path.join(ROOT, 'UI_MOdified/client/app.html'), 'utf8');
const SW_JS     = fs.readFileSync(path.join(ROOT, 'UI_MOdified/client/shell/scenario-workspace.js'), 'utf8');
const I18N_JS   = fs.readFileSync(path.join(ROOT, 'UI_MOdified/client/i18n.js'), 'utf8');
const PANEL_JS  = fs.readFileSync(path.join(ROOT, 'UI_MOdified/client/shell/unit-status-panel.js'), 'utf8');

// Extract Commander Panel HTML
const panelStart = APP_HTML.indexOf('id="unit-status-panel"');
const panelEnd   = APP_HTML.indexOf('<!-- OBJ-C:', panelStart);
const panelHtml  = panelStart >= 0 && panelEnd > panelStart
    ? APP_HTML.slice(panelStart, panelEnd) : '';

// ── TD-1..4: HTML + i18n ──────────────────────────────────────────────────
ok('TD-1: Orders <th> column in table header',
    APP_HTML.includes('class="sw-slu-col-orders"'));

ok('TD-2: data-i18n on Orders <th>',
    APP_HTML.includes('data-i18n="sw-live-step-units-col-orders"'));

ok('TD-3: i18n EN key sw-live-step-units-col-orders',
    I18N_JS.includes("'sw-live-step-units-col-orders'") &&
    I18N_JS.includes("'Orders'"));

ok('TD-4: i18n AR key sw-live-step-units-col-orders (Arabic)',
    I18N_JS.includes('الأوامر'));

// ── TD-5..6: JS function presence ────────────────────────────────────────
ok('TD-5: _sluTaskingLabel in scenario-workspace.js',
    SW_JS.includes('function _sluTaskingLabel'));

ok('TD-6: _sluCellOrders in scenario-workspace.js',
    SW_JS.includes('function _sluCellOrders'));

// ── TD-7..10: cell rendering (source inspection) ─────────────────────────
ok('TD-7: _sluCellOrders creates td with sw-slu-cell-orders class',
    SW_JS.includes("'sw-slu-cell-orders'") ||
    SW_JS.includes('"sw-slu-cell-orders"'));

ok('TD-8: chip element created with sw-slu-orders-chip class when tasking present',
    SW_JS.includes("'sw-slu-orders-chip'") ||
    SW_JS.includes('"sw-slu-orders-chip"'));

ok('TD-9: plain dash rendered when no tasking (else branch)',
    SW_JS.includes("td.textContent = '—'") ||
    SW_JS.includes('td.textContent = "—"'));

ok('TD-10: chip has title attribute for tooltip',
    SW_JS.includes('chip.title = label'));

// ── TD-11..13: CSS ────────────────────────────────────────────────────────
ok('TD-11: CSS .sw-slu-orders-chip defined', APP_HTML.includes('.sw-slu-orders-chip'));
ok('TD-12: CSS light theme override for chip',
    APP_HTML.includes('[data-theme="light"] .sw-slu-orders-chip'));
ok('TD-13: CSS RTL override for orders cell',
    APP_HTML.includes('[dir="rtl"] .sw-slu-cell-orders'));

// ── TD-14..18: _sluTaskingLabel logic (via source inspection) ─────────────
ok('TD-14: _sluTaskingLabel guards absent AppAdjudicatorMap → return null',
    SW_JS.includes('return null') && SW_JS.includes('AppAdjudicatorMap'));

ok('TD-15: _sluTaskingLabel guards no unit_tasking → return null',
    SW_JS.includes('unit_tasking'));

ok('TD-16: _sluTaskingLabel returns component_label when available',
    SW_JS.includes('component_label'));

ok('TD-17: _sluTaskingLabel falls back to action_component',
    SW_JS.includes('action_component'));

ok('TD-18: _sluTaskingLabel falls back to literal "Tasked"',
    SW_JS.includes("'Tasked'"));

// ── TD-19..21: safety ─────────────────────────────────────────────────────
ok('TD-19: no apply/commit/execute in Commander Panel HTML',
    !/button[^>]*>.*(?:apply|commit|execute)/i.test(panelHtml));

ok('TD-20: no AppMiddleEastPlatform API in scenario-workspace.js',
    !/AppMiddleEastPlatform\s*\./.test(SW_JS));

ok('TD-21: no old #unit-panel in HTML',
    !/id=["']unit-panel["']/.test(APP_HTML));

// ── Regression: TASK1-B world state, TASK1-C panel ───────────────────────
(function() {
    var sandbox = {};
    sandbox.window = sandbox;
    var src = fs.readFileSync(path.join(ROOT, 'UI_MOdified/client/shell/world-state.js'), 'utf8');
    (new Function('window', src))(sandbox);
    var WS = sandbox.AppWorldState;
    ok('TASK1B-REG: unit_tasking derivation still works',
        WS && typeof WS.DERIVATIONS.unit_tasking === 'function');
    var r = WS && WS.computeUnitTasking({
        activity: { actors: [{ uid:'u1', action_component:'air',
                               action_what:'Intercept.', action_why:'Protect.' }] },
        meta: { step_index:0, phase:'H-1' }
    });
    ok('TASK1B-REG: component_label Air Operations',
        r && r['u1'] && r['u1'].component_label === 'Air Operations');
})();

ok('TASK1C-REG: _populateTaskingDetails still in panel JS',
    PANEL_JS.includes('function _populateTaskingDetails'));
ok('TASK1C-REG: _sluTaskingLabel uses getWorldState accessor',
    SW_JS.includes('getWorldState'));

// ── Report ────────────────────────────────────────────────────────────────
console.log('\n' + '='.repeat(72));
console.log('  TASK1-D: Tasking Indicator in Involved-Units Table');
console.log('='.repeat(72));
if (failures.length) {
    failures.forEach(function(f) { console.log('  ' + f); });
    console.log('');
}
console.log('  Passed: ' + passed + '  |  Failed: ' + failed);
console.log('='.repeat(72) + '\n');
console.log('  Verdict: ' + (failed === 0 ? 'PASS' : 'FAIL'));
console.log('='.repeat(72) + '\n');
if (failed > 0) process.exit(1);
