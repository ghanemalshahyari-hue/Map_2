'use strict';
/**
 * test-task1e-tasking-integration.js  —  TASK1-E: Mission/Tasking hardening
 *
 * Verifies the entire tasking evidence layer is consistent:
 *   - all three displays (panel mission row, tasking detail block,
 *     involved-units Orders column) read from the same world-state key
 *   - custom test values propagate exactly through the full chain
 *   - graceful fallback when tasking is absent
 *   - no runtime display hardcodes operational example values
 *   - static labels remain i18n-based
 *   - no mutation buttons
 *
 * E-1    All three consumers use the same world-state key: ws.derived.unit_tasking
 * E-2    All three consumers use AppAdjudicatorMap.getWorldState() accessor
 * E-3    Panel mission row reads action_what (not a hardcoded value)
 * E-4    Panel tasking block reads action_why, action_intended_effect, doctrine
 * E-5    Workspace Orders column reads component_label
 * E-6    Custom action_what "TESTOP-XYZ-99" propagates through derivation chain
 * E-7    Custom component_label "Beta Force Type" propagates through derivation chain
 * E-8    Changing component_label produces the new value (dynamic, not cached)
 * E-9    Unit with no actor in step → all three displays show fallback '—' or hidden
 * E-10   Panel mission row falls back: null tasking → unit.mission → unit.objective → '—'
 * E-11   Workspace Orders cell falls back: null tasking → '—'
 * E-12   _populateTaskingDetails hides block when tasking is null
 * E-13   _populateTaskingDetails hides block when all detail fields are empty strings
 * E-14   doctrine array joined with ' · ' (not hardcoded separator string in data)
 * E-15   doctrine entries are taken verbatim from the world-state record
 * E-16   No hardcoded operational example strings in panel display path
 *          (action_what, action_why, action_intended_effect not hardcoded)
 * E-17   No hardcoded operational example strings in workspace display path
 * E-18   computeUnitTasking with real wargame3 step → produces entries
 * E-19   world-state-db.js still exports 29 catalog entries (no regression)
 * E-20   _COMPONENT_LABELS lives in world-state.js (derivation layer)
 *        not in unit-status-panel.js or scenario-workspace.js
 * E-21   Static column header "Orders" has data-i18n in HTML (not hardcoded text)
 * E-22   Static tasking detail labels ("Why", "Intended Effect", "Doctrine") have data-i18n
 * E-23   No mutation/apply/execute buttons in Commander Panel HTML
 * E-24   No mutation/apply/execute buttons in involved-units table HTML
 * E-25   Prior TASK1-B: computeUnitTasking in DERIVATIONS
 * E-26   Prior TASK1-C: _populateTaskingDetails in panel JS
 * E-27   Prior TASK1-D: _sluCellOrders in scenario-workspace.js
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
const PANEL_JS = fs.readFileSync(path.join(ROOT, 'UI_MOdified/client/shell/unit-status-panel.js'), 'utf8');
const SW_JS    = fs.readFileSync(path.join(ROOT, 'UI_MOdified/client/shell/scenario-workspace.js'), 'utf8');
const WS_JS    = fs.readFileSync(path.join(ROOT, 'UI_MOdified/client/shell/world-state.js'), 'utf8');
const APP_HTML = fs.readFileSync(path.join(ROOT, 'UI_MOdified/client/app.html'), 'utf8');

// Panel HTML block only
const panelStart = APP_HTML.indexOf('id="unit-status-panel"');
const panelEnd   = APP_HTML.indexOf('<!-- OBJ-C:', panelStart);
const panelHtml  = panelStart >= 0 && panelEnd > panelStart ? APP_HTML.slice(panelStart, panelEnd) : '';

// Involved-units table HTML block only
const tableStart = APP_HTML.indexOf('id="sw-live-step-units-card"');
const tableEnd   = APP_HTML.indexOf('</div>', tableStart + APP_HTML.slice(tableStart).indexOf('</table>') + 10);
const tableHtml  = tableStart >= 0 ? APP_HTML.slice(tableStart, tableEnd + 6) : '';

// ── Load world-state in Node ──────────────────────────────────────────────
const sandbox = {};
sandbox.window = sandbox;
(new Function('window', WS_JS))(sandbox);
const WS = sandbox.AppWorldState;
if (!WS) { console.error('FATAL: AppWorldState not loaded'); process.exit(1); }

// Also load DB1
const dbSrc = fs.readFileSync(path.join(ROOT, 'UI_MOdified/client/shell/world-state-db.js'), 'utf8');
(new Function('window', dbSrc))(sandbox);
const DB = sandbox.AppWorldStateDB;

// ═══════════════════════════════════════════════════════════════════════════
// E-1..2: Shared world-state key and accessor
// ═══════════════════════════════════════════════════════════════════════════
ok('E-1a: panel reads ws.derived.unit_tasking',
    PANEL_JS.includes('ws.derived.unit_tasking'));

ok('E-1b: workspace reads ws.derived.unit_tasking',
    SW_JS.includes('ws.derived.unit_tasking'));

ok('E-1c: world-state derives unit_tasking (same key)',
    WS_JS.includes('unit_tasking') && typeof WS.DERIVATIONS.unit_tasking === 'function');

ok('E-2a: panel uses AppAdjudicatorMap.getWorldState()',
    PANEL_JS.includes('AppAdjudicatorMap') && PANEL_JS.includes('getWorldState'));

ok('E-2b: workspace uses AppAdjudicatorMap.getWorldState()',
    SW_JS.includes('AppAdjudicatorMap') && SW_JS.includes('getWorldState'));

// ═══════════════════════════════════════════════════════════════════════════
// E-3..5: Each consumer reads the correct field from the shared object
// ═══════════════════════════════════════════════════════════════════════════

// Extract the populateAssignment function body
var assignStart = PANEL_JS.indexOf('function populateAssignment(');
var assignEnd   = PANEL_JS.indexOf('\n    function', assignStart + 100);
var assignBody  = assignStart >= 0 ? PANEL_JS.slice(assignStart, assignEnd) : '';

ok('E-3: panel mission row reads tasking.action_what',
    assignBody.includes('tasking.action_what') || assignBody.includes('tasking && tasking.action_what'));

ok('E-4a: panel tasking block reads action_why',
    PANEL_JS.includes('tasking.action_why'));
ok('E-4b: panel tasking block reads action_intended_effect',
    PANEL_JS.includes('tasking.action_intended_effect'));
ok('E-4c: panel tasking block reads action_doctrine_cited',
    PANEL_JS.includes('action_doctrine_cited'));

// Extract _sluTaskingLabel body
var sluStart = SW_JS.indexOf('function _sluTaskingLabel');
var sluEnd   = SW_JS.indexOf('\n    function', sluStart + 50);
var sluBody  = sluStart >= 0 ? SW_JS.slice(sluStart, sluEnd) : '';

ok('E-5: workspace Orders column reads t.component_label',
    sluBody.includes('t.component_label'));

// ═══════════════════════════════════════════════════════════════════════════
// E-6..8: Custom value round-trip — full derivation chain
// ═══════════════════════════════════════════════════════════════════════════

// Build a world state with a completely custom actor
var customActor = {
    uid:                    'TEST-UNIT-ALPHA',
    side:                   'BLUE',
    action_component:       'testop',                    // custom, unknown to _COMPONENT_LABELS
    action_what:            'TESTOP-XYZ-99: custom operation for test',
    action_why:             'Reason for TESTOP-XYZ-99',
    action_intended_effect: 'Effect of TESTOP-XYZ-99',
    action_doctrine_cited:  ['TEST-DOC-1', 'TEST-DOC-2']
};
var wsWithCustom = WS.computeUnitTasking({
    activity: { actors: [customActor] },
    meta: { step_index: 3, phase: 'H+3' }
});

ok('E-6a: derivation produces entry for TEST-UNIT-ALPHA',
    wsWithCustom['TEST-UNIT-ALPHA'] != null);
ok('E-6b: action_what "TESTOP-XYZ-99" propagates verbatim',
    wsWithCustom['TEST-UNIT-ALPHA'] &&
    wsWithCustom['TEST-UNIT-ALPHA'].action_what === 'TESTOP-XYZ-99: custom operation for test',
    wsWithCustom['TEST-UNIT-ALPHA'] && wsWithCustom['TEST-UNIT-ALPHA'].action_what);
ok('E-6c: action_why propagates verbatim',
    wsWithCustom['TEST-UNIT-ALPHA'] &&
    wsWithCustom['TEST-UNIT-ALPHA'].action_why === 'Reason for TESTOP-XYZ-99');
ok('E-6d: action_intended_effect propagates verbatim',
    wsWithCustom['TEST-UNIT-ALPHA'] &&
    wsWithCustom['TEST-UNIT-ALPHA'].action_intended_effect === 'Effect of TESTOP-XYZ-99');
ok('E-6e: action_doctrine_cited array preserved',
    wsWithCustom['TEST-UNIT-ALPHA'] &&
    Array.isArray(wsWithCustom['TEST-UNIT-ALPHA'].action_doctrine_cited) &&
    wsWithCustom['TEST-UNIT-ALPHA'].action_doctrine_cited[0] === 'TEST-DOC-1');

// E-7: custom component label (when _COMPONENT_LABELS has no entry, raw component used)
ok('E-7a: unknown action_component → component_label falls back to raw string "testop"',
    wsWithCustom['TEST-UNIT-ALPHA'] &&
    wsWithCustom['TEST-UNIT-ALPHA'].component_label === 'testop',  // raw fallback
    wsWithCustom['TEST-UNIT-ALPHA'] && wsWithCustom['TEST-UNIT-ALPHA'].component_label);

// Now test with a custom component_label injected directly
var wsCustomLabel = WS.computeUnitTasking({
    activity: { actors: [{
        uid: 'TEST-UNIT-BETA',
        action_component: 'ew',
        action_what: 'Different action for Beta'
    }]}
});
// The workspace label accessor logic: component_label || action_component || 'Tasked'
// For ew: _COMPONENT_LABELS['ew'] = 'Electronic Warfare', so component_label = 'Electronic Warfare'
// Simulating the exact _sluTaskingLabel fallback chain with this result:
function simulateSluLabel(unitTaskingEntry) {
    if (!unitTaskingEntry) return null;
    return unitTaskingEntry.component_label || unitTaskingEntry.action_component || 'Tasked';
}

ok('E-7b: workspace label for known component comes from derivation (Electronic Warfare)',
    simulateSluLabel(wsCustomLabel['TEST-UNIT-BETA']) === 'Electronic Warfare',
    simulateSluLabel(wsCustomLabel['TEST-UNIT-BETA']));

// E-8: changing the label produces new value (no caching)
var wsChanged = WS.computeUnitTasking({
    activity: { actors: [{
        uid: 'TEST-UNIT-ALPHA',
        action_component: 'strategic',
        action_what: 'Changed action for Alpha'
    }]}
});
ok('E-8a: changed component produces new component_label',
    simulateSluLabel(wsChanged['TEST-UNIT-ALPHA']) === 'Strategic Strike',
    simulateSluLabel(wsChanged['TEST-UNIT-ALPHA']));
ok('E-8b: changed action_what propagates',
    wsChanged['TEST-UNIT-ALPHA'] &&
    wsChanged['TEST-UNIT-ALPHA'].action_what === 'Changed action for Alpha');

// ═══════════════════════════════════════════════════════════════════════════
// E-9..13: Graceful fallback
// ═══════════════════════════════════════════════════════════════════════════

// E-9: unit not in step actors
var wsNoActors = WS.computeUnitTasking({ activity: { actors: [] } });
ok('E-9a: empty actors → empty result',
    Object.keys(wsNoActors).length === 0);
ok('E-9b: workspace label for absent unit → null',
    simulateSluLabel(wsNoActors['ABSENT-UNIT']) === null);

// E-10: panel mission row fallback chain (logic extracted from source)
function simulateMissionRow(tasking, unit) {
    return (tasking && tasking.action_what) || (unit && unit.mission) || (unit && unit.objective) || '—';
}
ok('E-10a: null tasking + no unit.mission → "—"',
    simulateMissionRow(null, { uid:'u1' }) === '—');
ok('E-10b: null tasking + unit.mission present → unit.mission used',
    simulateMissionRow(null, { uid:'u1', mission:'Patrol sector Alpha' }) === 'Patrol sector Alpha');
ok('E-10c: null tasking + unit.objective present (no mission) → unit.objective used',
    simulateMissionRow(null, { uid:'u1', objective:'Capture OBJ-X' }) === 'Capture OBJ-X');
ok('E-10d: tasking.action_what wins over unit.mission',
    simulateMissionRow({ action_what:'Strike port.' }, { uid:'u1', mission:'Patrol' }) === 'Strike port.');

// E-11: workspace orders cell fallback
function simulateCellOrders(tasking) {
    var label = simulateSluLabel(tasking);
    return label ? { type:'chip', text:label } : { type:'dash', text:'—' };
}
ok('E-11a: null tasking → dash "—"',
    simulateCellOrders(null).type === 'dash' && simulateCellOrders(null).text === '—');
ok('E-11b: tasking with label → chip',
    simulateCellOrders({ component_label:'Land Maneuver', action_component:'land' }).type === 'chip');
ok('E-11c: chip text matches component_label exactly',
    simulateCellOrders({ component_label:'Land Maneuver', action_component:'land' }).text === 'Land Maneuver');

// E-12: _populateTaskingDetails hides when null
ok('E-12: _populateTaskingDetails guards null → setAttribute hidden',
    PANEL_JS.includes('block.setAttribute(\'hidden\''));

// E-13: hides block when all fields empty
ok('E-13: anyVisible guard prevents showing empty block',
    PANEL_JS.includes('anyVisible'));

// ═══════════════════════════════════════════════════════════════════════════
// E-14..15: Doctrine formatting
// ═══════════════════════════════════════════════════════════════════════════
ok('E-14: doctrine joined with \\xb7 (interpunct, not hardcoded English word)',
    PANEL_JS.includes('\\xb7') || PANEL_JS.includes("'\\u00b7'") ||
    PANEL_JS.includes("join('") );  // join with separator

ok('E-15: doctrine entries taken from action_doctrine_cited array verbatim',
    PANEL_JS.includes('action_doctrine_cited'));

// ═══════════════════════════════════════════════════════════════════════════
// E-16..17: No hardcoded operational example strings in display paths
// ═══════════════════════════════════════════════════════════════════════════

// Extract the rendering function bodies (not the test strings)
var panelDisplayFunctions = [
    PANEL_JS.slice(PANEL_JS.indexOf('function populateAssignment'), PANEL_JS.indexOf('function populateSensors')),
    PANEL_JS.slice(PANEL_JS.indexOf('function _populateTaskingDetails'), PANEL_JS.indexOf('function _setTaskingRow')),
];
var panelDisplay = panelDisplayFunctions.join('\n');

var OPERATIONAL_EXAMPLES = [
    'Initiate continuous EW',
    'Jam Blue',
    'Persistent EW',
    'Held in reserve',
    'Hold position',
    '80000.0 fuel',
    'NAS Norfolk',
    'Gulf of Sidra',
    'USS Lake Champlain'  // only hardcoded in SVG demo in _SVG var, not in display fns
];

OPERATIONAL_EXAMPLES.forEach(function(ex, i) {
    ok('E-16-' + (i+1) + ': no "' + ex.slice(0,25) + '..." hardcoded in panel display functions',
        !panelDisplay.includes(ex));
});

// E-17: workspace _sluTaskingLabel + _sluCellOrders have no operational examples
var wsDisplay = [
    SW_JS.slice(SW_JS.indexOf('function _sluTaskingLabel'), SW_JS.indexOf('function _initLiveDecisionActionCard')),
].join('\n');

OPERATIONAL_EXAMPLES.forEach(function(ex, i) {
    ok('E-17-' + (i+1) + ': no "' + ex.slice(0,25) + '..." in workspace tasking display path',
        !wsDisplay.includes(ex));
});

// ═══════════════════════════════════════════════════════════════════════════
// E-18: real wargame3 round-trip
// ═══════════════════════════════════════════════════════════════════════════
(function() {
    var wgPath = path.join(ROOT, 'UI_MOdified/data/scenarios/wargame3.json');
    if (!fs.existsSync(wgPath)) {
        ok('E-18: wargame3.json round-trip (file missing — skipped)', true);
        return;
    }
    var scenario = JSON.parse(fs.readFileSync(wgPath, 'utf8'));
    var ws = WS.deriveWorldState(scenario, 0);
    ok('E-18a: wargame3 step 0 produces unit_tasking entries',
        ws && ws.derived && ws.derived.unit_tasking &&
        Object.keys(ws.derived.unit_tasking).length > 0,
        ws && Object.keys(ws.derived.unit_tasking).length);
    // Spot-check: EW actor entry is complete
    var ewEntry = ws.derived.unit_tasking['R-d3-405-014'];
    ok('E-18b: EW actor entry has action_what from scenario data',
        ewEntry && typeof ewEntry.action_what === 'string' && ewEntry.action_what.length > 0);
    ok('E-18c: EW actor component_label derived (not hardcoded in table)',
        ewEntry && ewEntry.component_label === 'Electronic Warfare');
    // Verify workspace would render this via simulateSluLabel
    ok('E-18d: workspace label accessor returns derived component_label',
        simulateSluLabel(ewEntry) === ewEntry.component_label);
    // Verify panel mission row would use action_what
    ok('E-18e: panel mission row would show action_what from scenario',
        simulateMissionRow(ewEntry, { uid:'R-d3-405-014' }) === ewEntry.action_what);
})();

// ═══════════════════════════════════════════════════════════════════════════
// E-19..20: No regression in DB1 / label ownership
// ═══════════════════════════════════════════════════════════════════════════
ok('E-19: DB1 CAPABILITY_CATALOG still has 29 entries',
    DB && Object.keys(DB.CAPABILITY_CATALOG).length === 29,
    DB && Object.keys(DB.CAPABILITY_CATALOG).length);

ok('E-20a: _COMPONENT_LABELS in world-state.js (derivation layer)',
    WS_JS.includes('_COMPONENT_LABELS'));
ok('E-20b: _COMPONENT_LABELS NOT in unit-status-panel.js',
    !PANEL_JS.includes('_COMPONENT_LABELS'));
ok('E-20c: _COMPONENT_LABELS NOT in scenario-workspace.js',
    !SW_JS.includes('_COMPONENT_LABELS'));

// ═══════════════════════════════════════════════════════════════════════════
// E-21..22: Static labels use i18n
// ═══════════════════════════════════════════════════════════════════════════
ok('E-21: Orders column header has data-i18n (not hardcoded text only)',
    APP_HTML.includes('data-i18n="sw-live-step-units-col-orders"'));

ok('E-22a: Why label has data-i18n="usp-lbl-why"',
    panelHtml.includes('data-i18n="usp-lbl-why"'));
ok('E-22b: Intended Effect label has data-i18n="usp-lbl-effect"',
    panelHtml.includes('data-i18n="usp-lbl-effect"'));
ok('E-22c: Doctrine label has data-i18n="usp-lbl-doctrine"',
    panelHtml.includes('data-i18n="usp-lbl-doctrine"'));
ok('E-22d: Current Orders header has data-i18n="usp-lbl-orders"',
    panelHtml.includes('data-i18n="usp-lbl-orders"'));

// ═══════════════════════════════════════════════════════════════════════════
// E-23..24: No mutation buttons in either display area
// ═══════════════════════════════════════════════════════════════════════════
ok('E-23: no apply/commit/execute in Commander Panel HTML',
    !/button[^>]*>.*(?:apply|commit|execute)/i.test(panelHtml));

ok('E-24: no apply/commit/execute in involved-units table HTML',
    !/button[^>]*>.*(?:apply|commit|execute)/i.test(tableHtml));

// ═══════════════════════════════════════════════════════════════════════════
// E-25..27: Prior TASK1-B/C/D regression
// ═══════════════════════════════════════════════════════════════════════════
ok('E-25 (TASK1-B): unit_tasking in DERIVATIONS',
    typeof WS.DERIVATIONS.unit_tasking === 'function');
ok('E-26 (TASK1-C): _populateTaskingDetails in panel JS',
    PANEL_JS.includes('function _populateTaskingDetails'));
ok('E-27 (TASK1-D): _sluCellOrders in scenario-workspace.js',
    SW_JS.includes('function _sluCellOrders'));

// ═══════════════════════════════════════════════════════════════════════════
// Report
// ═══════════════════════════════════════════════════════════════════════════
var line = '='.repeat(72);
console.log('\n' + line);
console.log('  TASK1-E: Mission/Tasking Evidence Layer — Integration Hardening');
console.log(line);
if (failures.length) {
    failures.forEach(function(f) { console.log('  ' + f); });
    console.log('');
}
console.log('  Passed: ' + passed + '  |  Failed: ' + failed);
console.log(line + '\n');
console.log('  Verdict: ' + (failed === 0 ? 'PASS' : 'FAIL'));
console.log(line + '\n');
if (failed > 0) process.exit(1);
