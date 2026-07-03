/* ============================================================================
 * test-cmo-wargame-evidence-package-main-batch-1.js
 * RMOOZ-CMO-WARGAME-EVIDENCE-PACKAGE-1 - Main Evidence Package Gate
 * ----------------------------------------------------------------------------
 * Main-app-only gate for the read-only CMO war-game evidence package builder.
 * This test does not touch, inspect, sync, rebuild, or run offline files.
 * Offline sync/testing is pending by user instruction.
 * ========================================================================== */
'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = __dirname;
var SHELL = path.join(ROOT, 'UI_MOdified', 'client', 'shell');
var PKG_FILE = path.join(SHELL, 'cmo-wargame-evidence-package.js');
var AAR_FILE = path.join(SHELL, 'cmo-wargame-after-action-debrief.js');

var passed = 0, failed = 0;
function assert(label, cond) {
    if (cond) { console.log('  PASS  ' + label); passed++; }
    else { console.error('  FAIL  ' + label); failed++; }
}
function src(file) { return fs.readFileSync(file, 'utf8'); }
function shell(name) { return require(path.join(SHELL, name)); }
function arr(v) { return Array.isArray(v) ? v : []; }
function hasAll(text, needles) { return needles.every(function (needle) { return String(text).indexOf(needle) !== -1; }); }
function cleanSource(text) {
    return String(text || '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
}
function debrief(kind) {
    var blocked = kind === 'blocked';
    var training = kind === 'training';
    return {
        version: '1.0.0-cmo-wargame-aar-1',
        generated_at: '2026-07-03T15:00:00.000Z',
        scenario_fingerprint: 'scenario-package-' + kind,
        outcome: training
            ? { key: 'training_complete', label: 'Training preview completed', severity: 'warn' }
            : (blocked ? { key: 'blocked', label: 'Run blocked / paused', severity: 'fail' } : { key: 'completed', label: 'CMO war-game run completed', severity: 'pass' }),
        release_interpretation: training
            ? 'training-only evidence; do not claim release-grade result'
            : (blocked ? 'not release-grade evidence' : 'release-grade evidence candidate'),
        run_mode: training
            ? { key: 'training_preview', label: 'Training preview only', allowed: true }
            : (blocked ? { key: 'blocked', label: 'Blocked until evidence fixes', allowed: false } : { key: 'release_grade', label: 'Release-grade CMO test', allowed: true }),
        control_center: { state: blocked ? 'scenario_blocked' : 'scenario_complete', state_label: blocked ? 'Blocked' : 'Complete' },
        timeline: [
            { key: 'state', label: 'Control Center state', value: blocked ? 'Blocked' : 'Complete' },
            { key: 'turn', label: 'Turn / actor', value: '3 / BLUE-1' }
        ],
        evidence_changes: blocked ? [{ key: 'release_status', label: 'Release status', previous: 'ready', current: 'not_ready' }] : [],
        unresolved_items: blocked ? [{ key: 'release_gate', label: 'Evidence Release Gate', status: 'fail', detail: '2 blockers', source: 'observe_checklist' }] : [],
        recommendations: blocked ? [{ key: 'r1', label: 'Open Evidence Release Gate and clear or document release blockers.' }] : [{ key: 'r1', label: 'Proceed to after-action review and preserve the evidence summary used for the test.' }],
        after_action_checklist: [{ key: 'save', label: 'Save/read the readiness decision used for the run.' }],
        instrumentation_summary: { release_status: blocked ? 'not_ready' : 'ready_for_release' },
        read_only: true
    };
}

console.log('\n=== RMOOZ-CMO-WARGAME-EVIDENCE-PACKAGE-1 Main Gate ===\n');

var PKG = shell('cmo-wargame-evidence-package.js');

console.log('--- CMO-PKG-1: module API and main-only foundation ---');
(function () {
    assert('T-1  evidence package module exists', fs.existsSync(PKG_FILE));
    assert('T-2  after-action debrief foundation exists', fs.existsSync(AAR_FILE));
    assert('T-3  API version exposed', PKG.CMO_WARGAME_EVIDENCE_PACKAGE_VERSION === '1.0.0-rmooz-cmo-wargame-evidence-package-1');
    assert('T-4  public API methods exposed', ['buildPackage', 'buildSummary', 'buildHandoffChecklist', 'validatePackage', 'comparePackages', 'summaryText', 'toJson', 'renderPackageHtml'].every(function (name) { return typeof PKG[name] === 'function'; }));
})();

console.log('\n--- CMO-PKG-2: package build and readiness classification ---');
(function () {
    var ready = PKG.buildPackage(debrief('ready'), { generated_at: '2026-07-03T15:00:00.000Z' });
    var training = PKG.buildPackage(debrief('training'), { generated_at: '2026-07-03T15:00:00.000Z' });
    var blocked = PKG.buildPackage(debrief('blocked'), { generated_at: '2026-07-03T15:00:00.000Z' });
    assert('T-1  ready package is release-grade candidate', ready.readiness.release_grade_candidate === true && ready.summary.release_grade_candidate === true);
    assert('T-2  training package is training-only', training.readiness.training_only === true && training.summary.training_only === true);
    assert('T-3  blocked package is blocked and needs review', blocked.readiness.blocked === true && blocked.summary.blocked === true && blocked.summary.unresolved_items === 1);
    assert('T-4  package sections include outcome/timeline/changes/unresolved/recommendations/AAR', arr(ready.sections).map(function (s) { return s.key; }).join('|') === 'outcome|timeline|evidence_changes|unresolved|recommendations|after_action');
})();

console.log('\n--- CMO-PKG-3: validation, fingerprint matching, and compare ---');
(function () {
    var ready = PKG.buildPackage(debrief('ready'));
    var blocked = PKG.buildPackage(debrief('blocked'));
    var json = PKG.toJson(ready);
    var valid = PKG.validatePackage(json, { current_fingerprint: ready.scenario_fingerprint });
    var mismatch = PKG.validatePackage(json, { current_fingerprint: 'different-fingerprint' });
    var invalid = PKG.validatePackage('{bad json');
    var compare = PKG.comparePackages(blocked, ready);
    assert('T-1  JSON package validates cleanly for matching fingerprint', valid.valid === true && valid.fingerprint_match === true);
    assert('T-2  fingerprint mismatch is visible warning', mismatch.valid === false && mismatch.fingerprint_match === false && mismatch.warnings.indexOf('Scenario fingerprint mismatch.') !== -1);
    assert('T-3  invalid JSON is rejected safely', invalid.valid === false && invalid.status === 'invalid_json');
    assert('T-4  package compare reports outcome/readiness changes', compare.changed === true && arr(compare.changes).some(function (c) { return c.key === 'blocked'; }));
})();

console.log('\n--- CMO-PKG-4: handoff checklist, summaries, and render output ---');
(function () {
    var blocked = PKG.buildPackage(debrief('blocked'));
    var text = PKG.summaryText(blocked);
    var html = PKG.renderPackageHtml(blocked);
    assert('T-1  handoff checklist includes read-only and unresolved state', arr(blocked.handoff_checklist).some(function (item) { return item.key === 'read_only' && item.status === 'pass'; }) && arr(blocked.handoff_checklist).some(function (item) { return item.key === 'unresolved_reviewed' && item.status === 'fail'; }));
    assert('T-2  summary text is operator-readable', hasAll(text, ['CMO War-Game Evidence Package', 'Package:', 'Release interpretation:', 'Handoff checklist:', 'Read-only package']));
    assert('T-3  render includes bilingual heading and sections', hasAll(html, ['CMO War-Game Evidence Package', 'حزمة أدلة اختبار المناورة', 'cmo-wargame-evidence-package-sections', 'Handoff checklist']));
    assert('T-4  fallback from null input is safe/read-only', PKG.buildPackage(null).read_only === true && PKG.renderPackageHtml(null).indexOf('CMO War-Game Evidence Package') !== -1);
})();

console.log('\n--- CMO-PKG-5: strict boundaries ---');
(function () {
    var source = cleanSource(src(PKG_FILE));
    [
        ['no fetch/network/backend route', /fetch\s*\(|XMLHttpRequest|\/api\//],
        ['no browser database/storage writes', /indexedDB|openDatabase|localStorage\s*\./i],
        ['no DOCX/stage-doc/SLOT_FILE path', /stage-doc|SLOT_FILE|docs\.red|docs\.blue|DOCX/i],
        ['no combat/action/doctrine mutation', /applyAction|commitAction|executeAction|autoFire|auto-fire|applyDoctrine|commitDoctrine|setDoctrine|\/doctrine/i],
        ['no protected runtime files referenced', /legacy-shim-attack_objective_draft-15\.jsonl|scenario_overrides\.json/]
    ].forEach(function (pair) { assert('T-boundary  ' + pair[0], !pair[1].test(source)); });
})();

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
if (failed) process.exit(1);
