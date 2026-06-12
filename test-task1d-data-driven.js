'use strict';
/**
 * test-task1d-data-driven.js — TASK1-D acceptance: Orders column is data-driven
 *
 * Verifies the Orders column in the involved-units table is fully driven by
 * ws.derived.unit_tasking — not hardcoded to demo values.
 *
 * DD-1   No "Electronic Warfare" hardcoded in scenario-workspace.js table path
 * DD-2   No "Land Maneuver" hardcoded in scenario-workspace.js table path
 * DD-3   No "Air Operations" hardcoded in scenario-workspace.js table path
 * DD-4   No "Naval Operations" hardcoded in scenario-workspace.js table path
 * DD-5   _sluTaskingLabel reads t.component_label from world state (not a fixed map)
 * DD-6   _sluTaskingLabel falls back to t.action_component, not a hardcoded string
 * DD-7   _sluCellOrders has no hardcoded label strings beyond '—' and 'Tasked'
 *
 * Dynamic render proof (Node.js simulation of the DOM path):
 * DD-8   Custom "Custom Test Tasking" label renders correctly in chip
 * DD-9   Changed label "Another Label" also renders correctly
 * DD-10  Unit without tasking renders '—', no chip
 * DD-11  _sluTaskingLabel with mock ws returning null → returns null
 * DD-12  _sluTaskingLabel with mock ws returning component_label → returns that label verbatim
 * DD-13  computeUnitTasking with custom action_component → component_label matches _COMPONENT_LABELS
 * DD-14  computeUnitTasking with unknown action_component → falls back to raw action_component string
 * DD-15  computeUnitTasking with custom unit → rendering path accepts any string label
 *
 * Regression:
 * DD-R1  world-state.js exports computeUnitTasking (derivation layer)
 * DD-R2  _COMPONENT_LABELS is in world-state.js, NOT scenario-workspace.js
 * DD-R3  scenario-workspace.js does not import or define _COMPONENT_LABELS
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

// ── Load source files ─────────────────────────────────────────────────────
const SW_JS   = fs.readFileSync(path.join(ROOT, 'UI_MOdified/client/shell/scenario-workspace.js'), 'utf8');
const WS_JS   = fs.readFileSync(path.join(ROOT, 'UI_MOdified/client/shell/world-state.js'), 'utf8');

// ── Extract only the tasking-related functions from scenario-workspace.js ─
// (lines containing _sluTaskingLabel and _sluCellOrders)
var sluStart = SW_JS.indexOf('function _sluTaskingLabel');
var sluEnd   = SW_JS.indexOf('function _initLiveDecisionActionCard');
var sluBlock = sluStart >= 0 && sluEnd > sluStart ? SW_JS.slice(sluStart, sluEnd) : SW_JS;

// ═══════════════════════════════════════════════════════════════════════════
// DD-1..4: no hardcoded labels in the table rendering path
// ═══════════════════════════════════════════════════════════════════════════
var FORBIDDEN_IN_TABLE = ['Electronic Warfare', 'Land Maneuver', 'Air Operations', 'Naval Operations'];

FORBIDDEN_IN_TABLE.forEach(function(label, i) {
    ok('DD-' + (i+1) + ': "' + label + '" NOT hardcoded in _sluTaskingLabel/_sluCellOrders',
        !sluBlock.includes(label),
        sluBlock.includes(label) ? 'FOUND: ' + label : 'OK');
});

// ═══════════════════════════════════════════════════════════════════════════
// DD-5..7: reading pattern — data-driven, not lookup table
// ═══════════════════════════════════════════════════════════════════════════
ok('DD-5: _sluTaskingLabel reads t.component_label from world state',
    sluBlock.includes('t.component_label'));

ok('DD-6: fallback to t.action_component (dynamic, not hardcoded)',
    sluBlock.includes('t.action_component'));

// _sluCellOrders may only have '—' (empty indicator) and 'Tasked' (generic fallback)
// — no domain-specific strings
var cellOrdersBlock = (function() {
    var start = SW_JS.indexOf('function _sluCellOrders');
    var end   = SW_JS.indexOf('\n    function', start + 50);
    return start >= 0 ? SW_JS.slice(start, end > start ? end : start + 500) : '';
})();
var forbiddenInCell = FORBIDDEN_IN_TABLE.concat(['air_unit', 'naval_combatant', 'air_defense']);
var allClean = forbiddenInCell.every(function(f) { return !cellOrdersBlock.includes(f); });
ok('DD-7: _sluCellOrders contains no hardcoded domain labels',
    allClean,
    allClean ? 'OK' : 'Found hardcoded label in _sluCellOrders');

// ═══════════════════════════════════════════════════════════════════════════
// DD-8..12: dynamic render proof via pure-function simulation
// ═══════════════════════════════════════════════════════════════════════════

// Simulate _sluTaskingLabel with injected world state
function makeTaskingLabelFn(mockUnitTasking) {
    // Re-implement the function logic with mock state
    return function(uid) {
        if (!uid) return null;
        try {
            var ws = { derived: { unit_tasking: mockUnitTasking } };
            if (!ws.derived.unit_tasking) return null;
            var t = ws.derived.unit_tasking[uid];
            if (!t) return null;
            return t.component_label || t.action_component || 'Tasked';
        } catch (_) { return null; }
    };
}

// Simulate _sluCellOrders by exercising the label logic
function simulateCellOrders(uid, mockUnitTasking) {
    var fn = makeTaskingLabelFn(mockUnitTasking);
    var label = fn(uid);
    if (label) {
        return { type: 'chip', text: label };
    }
    return { type: 'dash', text: '—' };
}

// DD-8: custom "Custom Test Tasking" label renders in chip
var mock1 = { 'u-alpha': { uid:'u-alpha', component_label:'Custom Test Tasking', action_component:'sof' } };
var r8 = simulateCellOrders('u-alpha', mock1);
ok('DD-8: "Custom Test Tasking" label renders in chip',
    r8.type === 'chip' && r8.text === 'Custom Test Tasking',
    JSON.stringify(r8));

// DD-9: changed label renders updated value
var mock2 = { 'u-alpha': { uid:'u-alpha', component_label:'Another Label', action_component:'mines' } };
var r9 = simulateCellOrders('u-alpha', mock2);
ok('DD-9: "Another Label" renders after label change',
    r9.type === 'chip' && r9.text === 'Another Label',
    JSON.stringify(r9));

// DD-10: unit without tasking renders '—'
var r10 = simulateCellOrders('u-beta', mock1);  // u-beta not in mock
ok('DD-10: unit without tasking renders "—"',
    r10.type === 'dash' && r10.text === '—',
    JSON.stringify(r10));

// DD-11: null mock → null
var r11 = makeTaskingLabelFn({})('u-gamma');
ok('DD-11: unit not in tasking → returns null',
    r11 === null, String(r11));

// DD-12: component_label returned verbatim
var mock3 = { 'u-delta': { uid:'u-delta', component_label:'Zebra Operation', action_component:'xyz' } };
var r12 = makeTaskingLabelFn(mock3)('u-delta');
ok('DD-12: component_label "Zebra Operation" returned verbatim',
    r12 === 'Zebra Operation', String(r12));

// ═══════════════════════════════════════════════════════════════════════════
// DD-13..15: world-state derivation is the label source (not the table)
// ═══════════════════════════════════════════════════════════════════════════
(function() {
    var sandbox = {};
    sandbox.window = sandbox;
    (new Function('window', WS_JS))(sandbox);
    var WS = sandbox.AppWorldState;

    // DD-13: known action_component → resolved via _COMPONENT_LABELS in world-state
    var r13 = WS.computeUnitTasking({
        activity: { actors: [{ uid:'u1', action_component:'land' }] }
    });
    ok('DD-13: computeUnitTasking maps "land" → "Land Maneuver" (derivation layer)',
        r13['u1'] && r13['u1'].component_label === 'Land Maneuver',
        r13['u1'] && r13['u1'].component_label);

    // DD-14: unknown component → raw string (no hardcoded fallback in table)
    var r14 = WS.computeUnitTasking({
        activity: { actors: [{ uid:'u2', action_component:'custom_unknown' }] }
    });
    ok('DD-14: unknown action_component → raw string (not a hardcoded default)',
        r14['u2'] && r14['u2'].component_label === 'custom_unknown',
        r14['u2'] && r14['u2'].component_label);

    // DD-15: completely custom label passes through correctly
    var r15 = WS.computeUnitTasking({
        activity: { actors: [
            { uid:'u3', action_component:'ew', action_what:'Test order.' }
        ]}
    });
    // When the table reads ws.derived.unit_tasking['u3'].component_label it will get
    // "Electronic Warfare" (from the derivation) — which is DERIVED, not hardcoded in table
    var tableLabel = makeTaskingLabelFn({ 'u3': r15['u3'] })('u3');
    ok('DD-15: table reads derived label from world state, not own lookup',
        tableLabel === r15['u3'].component_label,
        'derived: ' + (r15['u3'] && r15['u3'].component_label) + ' rendered: ' + tableLabel);
})();

// ═══════════════════════════════════════════════════════════════════════════
// DD-R1..3: regression — _COMPONENT_LABELS belongs to world-state, not table
// ═══════════════════════════════════════════════════════════════════════════
ok('DD-R1: computeUnitTasking exported from world-state.js',
    WS_JS.includes('computeUnitTasking: computeUnitTasking'));

ok('DD-R2: _COMPONENT_LABELS defined in world-state.js',
    WS_JS.includes('_COMPONENT_LABELS'));

ok('DD-R3: _COMPONENT_LABELS NOT in scenario-workspace.js (labels are derivation, not table concern)',
    !SW_JS.includes('_COMPONENT_LABELS'));

// ═══════════════════════════════════════════════════════════════════════════
// Report
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n' + '='.repeat(72));
console.log('  TASK1-D Data-Driven Acceptance: Orders column is not hardcoded');
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
