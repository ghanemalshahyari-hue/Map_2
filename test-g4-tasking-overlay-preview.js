#!/usr/bin/env node
/*
 * G-4-C: read-only tasking overlay preview wiring.
 *
 * Verifies that the overlay store is loaded before world-state.js, the preview
 * path is explicit/read-only, and baseline world-state tasking is unchanged.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = __dirname;

let passed = 0;
let failed = 0;
const failures = [];

function ok(label, cond, detail) {
    if (cond) {
        passed++;
        console.log('  [PASS] ' + label);
    } else {
        failed++;
        failures.push(label + (detail ? ' — ' + detail : ''));
        console.log('  [FAIL] ' + label + (detail ? ' — ' + detail : ''));
    }
}
function json(v) { return JSON.stringify(v); }

console.log('\nG-4-C — Read-only tasking overlay preview wiring\n');

const appHtml = fs.readFileSync(path.join(ROOT, 'UI_MOdified/client/app.html'), 'utf8');
const storeLoadIdx = appHtml.indexOf('shell/tasking-overlay-store.js');
const wsLoadIdx = appHtml.indexOf('shell/world-state.js');
ok('app.html loads tasking-overlay-store.js', storeLoadIdx >= 0);
ok('tasking-overlay-store.js loads before world-state.js', storeLoadIdx >= 0 && wsLoadIdx > storeLoadIdx);
ok('app.html does not add approval UI for G-4-C', appHtml.indexOf('Approve tasking overlay') === -1);

const sandbox = {};
sandbox.window = sandbox;
const storeSrc = fs.readFileSync(
    path.join(ROOT, 'UI_MOdified/client/shell/tasking-overlay-store.js'), 'utf8');
const wsSrc = fs.readFileSync(
    path.join(ROOT, 'UI_MOdified/client/shell/world-state.js'), 'utf8');
(new Function('window', storeSrc))(sandbox);
(new Function('window', wsSrc))(sandbox);

const Store = sandbox.AppTaskingOverlayStore;
const WS = sandbox.AppWorldState;
ok('store is available on window', Store && typeof Store.projectTaskingPreview === 'function');
ok('world-state exports buildTaskingOverlayPreview', WS && typeof WS.buildTaskingOverlayPreview === 'function');

const baselineWs = {
    meta: { step_index: 2, phase: 'assault' },
    units: [
        { uid: 'BLUE-1', side: 'BLUE', readiness: 'ready', position: [51, 35] },
    ],
    derived: {
        unit_tasking: {
            'BLUE-1': {
                uid: 'BLUE-1',
                side: 'BLUE',
                action_component: 'air',
                action_what: 'Original task',
                action_why: null,
                action_intended_effect: null,
                action_doctrine_cited: [],
                step_index: 2,
                phase: 'assault',
            },
        },
    },
};
const overlay0 = Store.createOverlay({
    scenario_draft_id: 'draft-g4c',
    source_scenario_id: 'scenario-g4c',
    now: '2026-06-12T00:00:00.000Z',
});
const approved = Store.approveCandidate(overlay0, {
    candidate_id: 'cand-g4c',
    unit_uid: 'BLUE-1',
    side: 'BLUE',
    step_index: 2,
    phase: 'assault',
    tasking: {
        action_component: 'air',
        action_what: 'Preview overlay task',
        action_why: 'Operator review only',
        action_intended_effect: 'Show projected tasking intent',
        action_doctrine_cited: ['doctrine-card'],
    },
}, {
    known_unit_uids: ['BLUE-1'],
    baseline_tasking: baselineWs.derived.unit_tasking,
    dry_run_reviewed: true,
    approved_label: 'Approve tasking overlay',
    approved_by: 'operator-a',
    now: '2026-06-12T00:01:00.000Z',
});
ok('fixture overlay approval succeeds', approved.ok === true);

const baselineSnap = json(baselineWs);
const previewWs = WS.buildTaskingOverlayPreview(baselineWs, approved.overlay);

ok('preview helper does not mutate baseline ws', json(baselineWs) === baselineSnap);
ok('baseline unit_tasking remains baseline in returned preview snapshot',
    previewWs.derived.unit_tasking['BLUE-1'].action_what === 'Original task');
ok('overlay preview is exposed on controlled read-only path',
    previewWs.derived.unit_tasking_overlay_preview['BLUE-1'].action_what === 'Preview overlay task');
ok('overlay preview entry carries source label',
    previewWs.derived.unit_tasking_overlay_preview['BLUE-1'].source.kind === 'g4_tasking_overlay');
ok('overlay preview entry declares baseline_mutation false',
    previewWs.derived.unit_tasking_overlay_preview['BLUE-1'].baseline_mutation === false &&
    previewWs.derived.unit_tasking_overlay_preview['BLUE-1'].source.baseline_mutation === false);
ok('overlay preview entry declares read_only and overlay_only',
    previewWs.derived.unit_tasking_overlay_preview['BLUE-1'].read_only === true &&
    previewWs.derived.unit_tasking_overlay_preview['BLUE-1'].overlay_only === true &&
    previewWs.derived.unit_tasking_overlay_preview['BLUE-1'].source.read_only === true &&
    previewWs.derived.unit_tasking_overlay_preview['BLUE-1'].source.overlay_only === true);
ok('preview metadata is read-only and overlay-only',
    previewWs.tasking_overlay_preview.read_only === true &&
    previewWs.tasking_overlay_preview.overlay_only === true &&
    previewWs.tasking_overlay_preview.baseline_mutation === false);
ok('preview metadata forbids storage and live mutation',
    previewWs.tasking_overlay_preview.persistent_storage === false &&
    previewWs.tasking_overlay_preview.live_scenario_mutation === false &&
    previewWs.tasking_overlay_preview.imported_source_mutation === false);
ok('preview does not change unit readiness/posture/movement/placement',
    previewWs.units[0].readiness === 'ready' &&
    json(previewWs.units[0].position) === json([51, 35]) &&
    !previewWs.units[0].movement_order &&
    !previewWs.units[0].placement);

const worldStateSource = wsSrc;
ok('preview helper is not registered as a DERIVATIONS row',
    !/unit_tasking_overlay_preview\s*:/.test(worldStateSource));
ok('world-state source has no storage/backend calls for G-4-C',
    !/localStorage|sessionStorage|fetch\(|XMLHttpRequest/.test(worldStateSource));

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failures.length) {
    console.log('\nFailures:');
    failures.forEach(f => console.log('  - ' + f));
}
process.exit(failed ? 1 : 0);
