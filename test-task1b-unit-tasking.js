'use strict';
/**
 * test-task1b-unit-tasking.js — TASK1-B: Mission/Tasking Evidence Layer
 *
 * Verifies that ws.derived.unit_tasking is built correctly from
 * ws.activity.actors and that unit-status-panel.js reads it properly.
 *
 * Tests:
 *  UT-1   unit_tasking key added to DERIVATIONS
 *  UT-2   computeUnitTasking exported on AppWorldState
 *  UT-3   empty actors array → empty object, no error
 *  UT-4   null actors → empty object, no error
 *  UT-5   single actor mapped by uid
 *  UT-6   multiple actors mapped correctly
 *  UT-7   component_label resolved for known components
 *  UT-8   unknown component falls back to raw action_component
 *  UT-9   actor without uid skipped
 *  UT-10  step_index and phase forwarded from meta
 *  UT-11  action_what, action_why, action_intended_effect, doctrine_cited preserved
 *  UT-12  deriveWorldState + computeUnitTasking round-trip with real scenario step
 *  UT-13  unit with no actor record not in result (null from lookup)
 *  UT-14  does NOT alter actors array (immutability)
 *  UT-15  panel JS has _getUnitTasking function
 *  UT-16  panel populateAssignment reads unit.bls as assigned_base fallback
 *  UT-17  mission row prefers action_what over unit.mission
 *  UT-18  status row shows component_label when tasking available
 *  UT-19  graceful when AppAdjudicatorMap absent (no world state)
 *  UT-20  no mutation/apply/execute buttons in panel HTML
 *  UT-21  Commander Panel hardening: no AppMiddleEastPlatform
 *  UT-22  hardening: no old #unit-panel in HTML
 *  DB1-T  world-state-db.js still has 29 catalog entries (no regression)
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

// ── Load world-state.js in Node sandbox ──────────────────────────────────
const sandbox = {};
sandbox.window = sandbox;
const wsSrc = fs.readFileSync(
    path.join(ROOT, 'UI_MOdified/client/shell/world-state.js'), 'utf8');
(new Function('window', wsSrc))(sandbox);
const WS = sandbox.AppWorldState;
if (!WS) { console.error('FATAL: AppWorldState not loaded'); process.exit(1); }

// Load DB1 for round-trip test
const dbSrc = fs.readFileSync(
    path.join(ROOT, 'UI_MOdified/client/shell/world-state-db.js'), 'utf8');
(new Function('window', dbSrc))(sandbox);
const DB = sandbox.AppWorldStateDB;

// ── Load panel JS source for text inspection ──────────────────────────────
const PANEL_JS = fs.readFileSync(
    path.join(ROOT, 'UI_MOdified/client/shell/unit-status-panel.js'), 'utf8');
const APP_HTML  = fs.readFileSync(
    path.join(ROOT, 'UI_MOdified/client/app.html'), 'utf8');

// ═══════════════════════════════════════════════════════════════════════════
// UT-1..2: API presence
// ═══════════════════════════════════════════════════════════════════════════
ok('UT-1: unit_tasking in DERIVATIONS',
    WS.DERIVATIONS && typeof WS.DERIVATIONS.unit_tasking === 'function');

ok('UT-2: computeUnitTasking exported on AppWorldState',
    typeof WS.computeUnitTasking === 'function');

// ═══════════════════════════════════════════════════════════════════════════
// UT-3..4: empty / null guards
// ═══════════════════════════════════════════════════════════════════════════
var r3 = WS.computeUnitTasking({ activity: { actors: [] } });
ok('UT-3: empty actors → empty object', r3 && typeof r3 === 'object' && Object.keys(r3).length === 0);

var r4a = WS.computeUnitTasking({});
ok('UT-4a: no activity property → empty object',
    r4a && typeof r4a === 'object' && Object.keys(r4a).length === 0);

var r4b = WS.computeUnitTasking(null);
ok('UT-4b: null ws → empty object, no throw',
    r4b && typeof r4b === 'object' && Object.keys(r4b).length === 0);

var r4c = WS.computeUnitTasking({ activity: { actors: null } });
ok('UT-4c: null actors → empty object',
    r4c && typeof r4c === 'object' && Object.keys(r4c).length === 0);

// ═══════════════════════════════════════════════════════════════════════════
// UT-5..6: mapping
// ═══════════════════════════════════════════════════════════════════════════
var actor1 = {
    uid: 'R-d3-405-014', side: 'RED',
    action_component: 'ew',
    action_what: 'Jam Blue C2.',
    action_why: 'Degrade coordination.',
    action_intended_effect: 'Reduce effectiveness.',
    action_doctrine_cited: ['Doctrines.md']
};
var r5 = WS.computeUnitTasking({
    activity: { actors: [actor1] },
    meta: { step_index: 2, phase: 'PRE-H' }
});
ok('UT-5a: single actor mapped by uid', r5['R-d3-405-014'] != null);
ok('UT-5b: action_what preserved',
    r5['R-d3-405-014'].action_what === 'Jam Blue C2.');
ok('UT-5c: action_why preserved',
    r5['R-d3-405-014'].action_why === 'Degrade coordination.');
ok('UT-5d: action_intended_effect preserved',
    r5['R-d3-405-014'].action_intended_effect === 'Reduce effectiveness.');
ok('UT-5e: action_doctrine_cited is array',
    Array.isArray(r5['R-d3-405-014'].action_doctrine_cited));
ok('UT-5f: step_index from meta',
    r5['R-d3-405-014'].step_index === 2);
ok('UT-5g: phase from meta',
    r5['R-d3-405-014'].phase === 'PRE-H');
ok('UT-5h: component_label for ew',
    r5['R-d3-405-014'].component_label === 'Electronic Warfare');

var actor2 = { uid: 'B-d2-3-048', side: 'BLUE', action_component: 'air', action_what: 'Intercept.' };
var r6 = WS.computeUnitTasking({
    activity: { actors: [actor1, actor2] },
    meta: { step_index: 0, phase: 'D-5' }
});
ok('UT-6a: two actors → two entries', Object.keys(r6).length === 2);
ok('UT-6b: second actor mapped', r6['B-d2-3-048'] && r6['B-d2-3-048'].action_what === 'Intercept.');
ok('UT-6c: second actor component_label air',
    r6['B-d2-3-048'].component_label === 'Air Operations');

// ═══════════════════════════════════════════════════════════════════════════
// UT-7..8: component labels
// ═══════════════════════════════════════════════════════════════════════════
var COMPS = ['air','land','naval','ew','strategic','sof','usv_uav','mines','logistics'];
var LABELS= ['Air Operations','Land Maneuver','Naval Operations','Electronic Warfare',
             'Strategic Strike','Special Operations','Drone / USV','Mine Warfare','Logistics'];
COMPS.forEach(function(c, i) {
    var r = WS.computeUnitTasking({ activity: { actors: [{ uid:'u1', action_component: c }] } });
    ok('UT-7-' + c + ': component_label correct',
        r['u1'] && r['u1'].component_label === LABELS[i],
        'got: ' + (r['u1'] && r['u1'].component_label));
});

var rUnk = WS.computeUnitTasking({
    activity: { actors: [{ uid:'u2', action_component: 'amphibious_special' }] }
});
ok('UT-8: unknown component → raw action_component as fallback',
    rUnk['u2'].component_label === 'amphibious_special',
    'got: ' + rUnk['u2'].component_label);

// ═══════════════════════════════════════════════════════════════════════════
// UT-9: actor without uid skipped
// ═══════════════════════════════════════════════════════════════════════════
var rNoUid = WS.computeUnitTasking({
    activity: { actors: [
        { action_component: 'ew', action_what: 'No uid!' },  // should be skipped
        { uid: 'u3', action_component: 'land', action_what: 'Has uid.' }
    ]}
});
ok('UT-9a: actor without uid not included', !rNoUid['undefined'] && !rNoUid['null']);
ok('UT-9b: actor with uid still included', rNoUid['u3'] && rNoUid['u3'].action_what === 'Has uid.');
ok('UT-9c: only one entry', Object.keys(rNoUid).length === 1);

// ═══════════════════════════════════════════════════════════════════════════
// UT-10: step_index + phase from meta
// ═══════════════════════════════════════════════════════════════════════════
var rMeta = WS.computeUnitTasking({
    activity: { actors: [{ uid:'m1', action_component:'land' }] },
    meta: { step_index: 7, phase: 'H+2' }
});
ok('UT-10a: step_index correct', rMeta['m1'].step_index === 7);
ok('UT-10b: phase correct', rMeta['m1'].phase === 'H+2');

var rNoMeta = WS.computeUnitTasking({
    activity: { actors: [{ uid:'m2', action_component:'air' }] }
    // no meta
});
ok('UT-10c: missing meta → step_index null',   rNoMeta['m2'].step_index === null);
ok('UT-10d: missing meta → phase null',        rNoMeta['m2'].phase === null);

// ═══════════════════════════════════════════════════════════════════════════
// UT-11: field preservation
// ═══════════════════════════════════════════════════════════════════════════
var fullActor = {
    uid: 'fa1', side: 'RED', action_component: 'strategic',
    action_what: 'Strike port.', action_why: 'Deny logistics.',
    action_intended_effect: 'Degrade supply chain.',
    action_doctrine_cited: ['ADP3-0', 'Doctrines.md']
};
var rFull = WS.computeUnitTasking({ activity: { actors: [fullActor] } });
ok('UT-11a: side preserved',   rFull['fa1'].side === 'RED');
ok('UT-11b: action_why preserved', rFull['fa1'].action_why === 'Deny logistics.');
ok('UT-11c: doctrine_cited array with 2 items',
    Array.isArray(rFull['fa1'].action_doctrine_cited) &&
    rFull['fa1'].action_doctrine_cited.length === 2);

// ═══════════════════════════════════════════════════════════════════════════
// UT-12: round-trip with real wargame3 scenario data
// ═══════════════════════════════════════════════════════════════════════════
(function() {
    var wgPath = path.join(ROOT, 'UI_MOdified/data/scenarios/wargame3.json');
    if (!fs.existsSync(wgPath)) {
        ok('UT-12: wargame3.json exists for round-trip test', false, 'file missing');
        return;
    }
    var scenario = JSON.parse(fs.readFileSync(wgPath, 'utf8'));
    var ws = WS.deriveWorldState(scenario, 0);  // step 0
    ok('UT-12a: deriveWorldState returns ws', ws != null);
    ok('UT-12b: ws.derived.unit_tasking present',
        ws && ws.derived && ws.derived.unit_tasking != null);

    var tasking = ws.derived.unit_tasking;
    var taskingKeys = Object.keys(tasking);
    ok('UT-12c: unit_tasking has at least one entry for step 0',
        taskingKeys.length > 0,
        'entries: ' + taskingKeys.length);

    // Find a specific actor from step 0 (we know R-d3-405-014 acts in EW)
    var ewActor = tasking['R-d3-405-014'];
    ok('UT-12d: EW actor uid matched',
        ewActor != null, 'keys: ' + taskingKeys.slice(0,5).join(', '));
    if (ewActor) {
        ok('UT-12e: action_component is ew', ewActor.action_component === 'ew');
        ok('UT-12f: component_label is Electronic Warfare',
            ewActor.component_label === 'Electronic Warfare');
        ok('UT-12g: action_what is a non-empty string',
            typeof ewActor.action_what === 'string' && ewActor.action_what.length > 0);
        ok('UT-12h: step_index is 0', ewActor.step_index === 0);
    }

    // Unit NOT in actors should be absent
    ok('UT-12i: unit with no actor not in tasking',
        !tasking['R-d2-4-004'],   // division HQ rarely acts in first step
        'unexpected entry found');
})();

// ═══════════════════════════════════════════════════════════════════════════
// UT-13: null lookup for unit without actor
// ═══════════════════════════════════════════════════════════════════════════
var r13 = WS.computeUnitTasking({ activity: { actors: [{ uid:'u-a' }] } });
ok('UT-13: uid not in actors → absent (not null key)', !('u-b' in r13));

// ═══════════════════════════════════════════════════════════════════════════
// UT-14: immutability — original actors array unchanged
// ═══════════════════════════════════════════════════════════════════════════
var originalActors = [{ uid:'x1', action_component:'land', action_what:'Move.' }];
var actorsCopy = JSON.stringify(originalActors);
WS.computeUnitTasking({ activity: { actors: originalActors } });
ok('UT-14: actors array not mutated after computeUnitTasking',
    JSON.stringify(originalActors) === actorsCopy);

// ═══════════════════════════════════════════════════════════════════════════
// UT-15..18: panel JS checks
// ═══════════════════════════════════════════════════════════════════════════
ok('UT-15: panel has _getUnitTasking function',
    PANEL_JS.includes('function _getUnitTasking'));

ok('UT-16: populateAssignment uses unit.bls fallback for assigned_base',
    PANEL_JS.includes('unit.bls') && PANEL_JS.includes('usp-assigned-base'));

ok('UT-17: mission row prefers tasking.action_what over unit.mission',
    (function() {
        var fn = PANEL_JS.match(/function populateAssignment[\s\S]*?^    \}/m);
        if (!fn) return PANEL_JS.includes('tasking.action_what') &&
                        PANEL_JS.indexOf('action_what') < PANEL_JS.indexOf('unit.mission');
        var body = fn[0];
        return body.includes('action_what') &&
               body.indexOf('action_what') < body.indexOf('unit.mission');
    })());

ok('UT-18: status row shows component_label from tasking',
    PANEL_JS.includes('component_label') && PANEL_JS.includes('usp-unit-status'));

// ═══════════════════════════════════════════════════════════════════════════
// UT-19: graceful when AppAdjudicatorMap absent
// ═══════════════════════════════════════════════════════════════════════════
ok('UT-19: _getUnitTasking guards against missing AppAdjudicatorMap',
    PANEL_JS.includes('AppAdjudicatorMap') &&
    PANEL_JS.includes('getWorldState') &&
    PANEL_JS.includes('try {') &&
    PANEL_JS.includes('} catch (_) { return null; }'));

// ═══════════════════════════════════════════════════════════════════════════
// UT-20..21: safety checks (no mutation, no ME loader)
// ═══════════════════════════════════════════════════════════════════════════
// Extract Commander Panel HTML block only (not other panels in app.html)
var panelStart = APP_HTML.indexOf('id="unit-status-panel"');
var panelEnd   = APP_HTML.indexOf('<!-- OBJ-C:', panelStart);
var panelHtml  = panelStart >= 0 && panelEnd > panelStart
    ? APP_HTML.slice(panelStart, panelEnd) : '';
ok('UT-20: no apply/commit/execute in Commander Panel HTML',
    !/button[^>]*>.*(?:apply|commit|execute)/i.test(panelHtml),
    'panel block chars: ' + panelHtml.length);

ok('UT-21: no AppMiddleEastPlatform API call in panel JS',
    !/AppMiddleEastPlatform\s*\./.test(PANEL_JS));

ok('UT-22: no old #unit-panel in HTML',
    !/id=["']unit-panel["']/.test(APP_HTML));

// ═══════════════════════════════════════════════════════════════════════════
// DB1-T: no regression in catalog count
// ═══════════════════════════════════════════════════════════════════════════
ok('DB1-T: CAPABILITY_CATALOG still has 29 entries',
    DB && Object.keys(DB.CAPABILITY_CATALOG).length === 29,
    DB && Object.keys(DB.CAPABILITY_CATALOG).length);

// ═══════════════════════════════════════════════════════════════════════════
// Report
// ═══════════════════════════════════════════════════════════════════════════
var total = 9 /*UT-7 loop*/ + 1 /*UT-8*/ + 1 /*UT-12 block*/ + 3 + 3 + 5 + 1 + 3 + 3 + 2 + 3 + 2 + 1 + 2 + 1 + 2 + 1 + 1 + 1 + 1 + 1;
console.log('\n═══════════════════════════════════════════════════════════════════════════');
console.log('  TASK1-B: Mission/Tasking Evidence Layer — Unit Tasking Tests');
console.log('═══════════════════════════════════════════════════════════════════════════');
if (failures.length) {
    failures.forEach(function(f) { console.log('  ' + f); });
    console.log('');
}
console.log('  Passed: ' + passed + '  |  Failed: ' + failed);
console.log('═══════════════════════════════════════════════════════════════════════════\n');
console.log('  Verdict: ' + (failed === 0 ? 'PASS' : 'FAIL'));
console.log('═══════════════════════════════════════════════════════════════════════════\n');
if (failed > 0) process.exit(1);
