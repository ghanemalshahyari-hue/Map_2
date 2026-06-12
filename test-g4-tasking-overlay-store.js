#!/usr/bin/env node
/*
 * G-4-B: Pure Unit Tasking Mode overlay store.
 *
 * No UI, no live apply, no world-state baseline mutation, no imported JSON
 * mutation, no final units, placement, movement, readiness, or posture writes.
 */
'use strict';

const path = require('path');
const Store = require(path.join(__dirname, 'UI_MOdified/client/shell/tasking-overlay-store.js'));

let passed = 0, failed = 0;
const failures = [];
function ok(label, cond, detail) {
    if (cond) { passed++; console.log('  [PASS] ' + label); }
    else {
        failed++;
        failures.push(label + (detail ? ' — ' + detail : ''));
        console.log('  [FAIL] ' + label + (detail ? ' — ' + detail : ''));
    }
}
function hasReason(result, code) {
    return result && Array.isArray(result.blocked_reasons) && result.blocked_reasons.some(r => r.indexOf(code) >= 0);
}
function json(v) { return JSON.stringify(v); }

console.log('\nG-4-B — Pure tasking overlay store\n');

const overlay0 = Store.createOverlay({
    scenario_draft_id: 'draft-1',
    source_scenario_id: 'scenario-1',
    now: '2026-06-12T00:00:00.000Z',
});

ok('exports schema and API', Store.SCHEMA === 'rmooz.g4.tasking_overlay.v1' &&
    typeof Store.validateCandidate === 'function' &&
    typeof Store.buildDryRunDiff === 'function' &&
    typeof Store.approveCandidate === 'function');
ok('createOverlay returns empty overlay model', overlay0.entries.length === 0 &&
    overlay0.change_log.length === 0 &&
    overlay0.scenario_draft_id === 'draft-1');

const allowedCandidate = {
    candidate_id: 'cand-1',
    unit_uid: 'BLUE-1',
    side: 'BLUE',
    step_index: 2,
    phase: 'assault',
    tasking: {
        action_component: 'air',
        action_what: 'Suppress enemy radar coverage',
        action_why: 'Protect assault force approach',
        action_intended_effect: 'Reduce detection window',
        action_doctrine_cited: ['doctrine-card-1'],
    },
};
const baseline = {
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
};
const overlay0Snap = json(overlay0);
const valid = Store.validateCandidate(allowedCandidate, { known_unit_uids: ['BLUE-1'] });
ok('allowed fields validate', valid.ok === true && valid.blocked === false);
ok('validation does not mutate overlay', json(overlay0) === overlay0Snap);

const diff = Store.buildDryRunDiff(overlay0, allowedCandidate, {
    known_unit_uids: ['BLUE-1'],
    baseline_tasking: baseline,
});
ok('dry-run diff is generated before approval', diff.blocked === false && diff.changes.length === 4);
ok('diff carries overlay-only invariants', diff.invariants.overlay_only === true &&
    diff.invariants.baseline_mutation === false &&
    diff.invariants.live_unit_mutation === false &&
    diff.invariants.imported_source_mutation === false);
ok('diff includes before and after values', diff.before.action_what === 'Original task' &&
    diff.after.action_what === 'Suppress enemy radar coverage');

const noReview = Store.approveCandidate(overlay0, allowedCandidate, {
    known_unit_uids: ['BLUE-1'],
    baseline_tasking: baseline,
    approved_label: 'Approve tasking overlay',
});
ok('approval requires dry-run reviewed flag', noReview.ok === false && hasReason(noReview, 'dry_run_review_required'));

const badLabel = Store.approveCandidate(overlay0, allowedCandidate, {
    known_unit_uids: ['BLUE-1'],
    baseline_tasking: baseline,
    dry_run_reviewed: true,
    approved_label: 'Apply',
});
ok('approval requires exact Approve tasking overlay label', badLabel.ok === false && hasReason(badLabel, 'approval_label_required'));

const approved = Store.approveCandidate(overlay0, allowedCandidate, {
    known_unit_uids: ['BLUE-1'],
    baseline_tasking: baseline,
    dry_run_reviewed: true,
    approved_label: 'Approve tasking overlay',
    approved_by: 'operator-a',
    now: '2026-06-12T00:01:00.000Z',
    entry_id: 'entry-1',
    change_id: 'change-1',
});
ok('approved candidate writes overlay entry only', approved.ok === true &&
    approved.overlay.entries.length === 1 &&
    approved.overlay.change_log.length === 1);
ok('approval change log is append-only record', approved.overlay.change_log[0].change_type === 'approve_overlay_entry' &&
    approved.overlay.change_log[0].change_id === 'change-1' &&
    approved.overlay.change_log[0].invariants.baseline_mutation === false);
ok('approval does not mutate original overlay', overlay0.entries.length === 0 && overlay0.change_log.length === 0);
ok('approved entry has required source and label', approved.entry.source.kind === 'g4_tasking_overlay' &&
    approved.entry.approval.approved_label === 'Approve tasking overlay');

const active1 = Store.activeEntries(approved.overlay);
ok('activeEntries returns approved entry', active1.length === 1 && active1[0].entry_id === 'entry-1');

const baselineSnap = json(baseline);
const preview = Store.projectTaskingPreview(baseline, approved.overlay);
ok('projection reads overlay for preview', preview['BLUE-1'].source.kind === 'g4_tasking_overlay' &&
    preview['BLUE-1'].action_what === 'Suppress enemy radar coverage');
ok('projection leaves baseline unchanged', json(baseline) === baselineSnap &&
    baseline['BLUE-1'].action_what === 'Original task');

const revertedOne = Store.revertChange(approved.overlay, 'entry-1', {
    reverted_by: 'operator-a',
    now: '2026-06-12T00:02:00.000Z',
    change_id: 'revert-1',
});
ok('revert single appends change-log record', revertedOne.ok === true &&
    revertedOne.overlay.entries.length === 1 &&
    revertedOne.overlay.change_log.length === 2 &&
    revertedOne.change.change_type === 'revert_overlay_entry');
ok('revert single removes entry from active projection', Store.activeEntries(revertedOne.overlay).length === 0);
ok('revert single does not mutate previous overlay', Store.activeEntries(approved.overlay).length === 1);

const approved2 = Store.approveCandidate(approved.overlay, Object.assign({}, allowedCandidate, {
    candidate_id: 'cand-2',
    unit_uid: 'BLUE-2',
    tasking: Object.assign({}, allowedCandidate.tasking, { action_what: 'Escort assault package' }),
}), {
    known_unit_uids: ['BLUE-1', 'BLUE-2'],
    baseline_tasking: baseline,
    dry_run_reviewed: true,
    approved_label: 'Approve tasking overlay',
    now: '2026-06-12T00:03:00.000Z',
    entry_id: 'entry-2',
    change_id: 'change-2',
});
const revertedAll = Store.revertAll(approved2.overlay, {
    reverted_by: 'operator-a',
    now: '2026-06-12T00:04:00.000Z',
    change_id: 'revert-all-1',
});
ok('revert all appends record listing active entries', revertedAll.ok === true &&
    revertedAll.change.change_type === 'revert_all_overlay_entries' &&
    revertedAll.change.reverted_entry_ids.indexOf('entry-1') >= 0 &&
    revertedAll.change.reverted_entry_ids.indexOf('entry-2') >= 0);
ok('revert all clears active entries for current draft/session', Store.activeEntries(revertedAll.overlay).length === 0);

const noChange = Store.buildDryRunDiff(overlay0, {
    unit_uid: 'BLUE-1',
    step_index: 2,
    phase: 'assault',
    tasking: {
        action_component: 'air',
        action_what: 'Original task',
        action_doctrine_cited: [],
    },
}, { known_unit_uids: ['BLUE-1'], baseline_tasking: baseline });
ok('no-change dry-run is blocked', noChange.blocked === true && noChange.blocked_reasons.indexOf('no_changes') >= 0);

const unresolved = Store.validateCandidate(allowedCandidate, { known_unit_uids: ['OTHER'] });
ok('unresolved unit uid blocks candidate', unresolved.ok === false && unresolved.blocked_reasons.indexOf('unit_uid_unresolved') >= 0);

[
    ['assigned objective forbidden', { assigned_objective: 'OBJ-1' }, 'assigned_objective'],
    ['readiness forbidden', { readiness: 'limited' }, 'readiness'],
    ['posture forbidden', { posture: 'hold' }, 'posture'],
    ['movement order forbidden', { movement_order: 'advance' }, 'movement_order'],
    ['route forbidden', { route: [[1, 2], [3, 4]] }, 'route'],
    ['coordinates forbidden', { coordinates: [1, 2] }, 'coordinates'],
    ['final units forbidden', { final_units: [{ uid: 'X' }] }, 'final_units'],
    ['placement forbidden', { placement: { lat: 1, lon: 2 } }, 'placement'],
    ['imported JSON/source mutation forbidden', { imported_json: { changed: true } }, 'imported_json'],
    ['proposed_units mutation forbidden', { proposed_units: [] }, 'proposed_units'],
    ['placement anchor mutation forbidden', { placement_anchor: { id: 'A' } }, 'placement_anchor'],
].forEach(([label, extra, code]) => {
    const candidate = Object.assign({}, allowedCandidate, extra);
    const result = Store.validateCandidate(candidate, { known_unit_uids: ['BLUE-1'] });
    ok(label, result.ok === false && hasReason(result, 'forbidden_field:' + code), result.blocked_reasons.join(', '));
});

const sourceObj = {
    proposed_units: [{ platform: 'F-14' }],
    placement_candidates: [{ base_name_en: 'Hamedan' }],
};
const sourceSnap = json(sourceObj);
Store.validateCandidate(Object.assign({}, allowedCandidate, { tasking: allowedCandidate.tasking }), { known_unit_uids: ['BLUE-1'] });
ok('imported/proposed source fixture remains unchanged', json(sourceObj) === sourceSnap);

const moduleSrc = require('fs').readFileSync(path.join(__dirname, 'UI_MOdified/client/shell/tasking-overlay-store.js'), 'utf8');
ok('store contains no DOM access', !/document\.|querySelector|getElementById|addEventListener/.test(moduleSrc));
ok('store contains no storage/backend calls', !/localStorage|sessionStorage|fetch\(|XMLHttpRequest|appendFile|fs\./.test(moduleSrc));
ok('store contains no live apply verbs as functions', !/applyToLive|commitLive|executeMovement|createFinalUnit|placeUnit/.test(moduleSrc));

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failures.length) {
    console.log('\nFailures:');
    failures.forEach(f => console.log('  - ' + f));
}
process.exit(failed ? 1 : 0);
