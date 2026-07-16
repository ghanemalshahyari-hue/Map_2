#!/usr/bin/env node
/**
 * test-scenario-revisions-compare-restore-ui-slice7.js — Batch D Slice 7
 *
 * The revision compare/restore UI, nested inside the Scenario Library
 * (Slice 6): a human-readable diff view (no raw JSON shown to the operator)
 * and a restore action gated by a confirmation dialog before it fires.
 *
 *   node test-scenario-revisions-compare-restore-ui-slice7.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = __dirname;
const LIBRARY_PATH = path.join(ROOT, 'UI_MOdified/client/shell/scenario-library.js');
const COMPARE_PATH = path.join(ROOT, 'UI_MOdified/server/scenario-revision-compare.js');

let pass = 0, fail = 0;
function ok(cond, label, detail) {
    if (cond) { console.log('  PASS  ' + label); pass++; }
    else      { console.error('  FAIL  ' + label + (detail ? ' — ' + detail : '')); fail++; }
}
function eq(a, b, label) { ok(a === b, label, 'expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a)); }

function loadSandbox() {
    const sandboxWindow = { confirm: function () { return true; } };
    const stubDoc = {
        createElement: function () { return { style: {}, setAttribute() {}, addEventListener() {}, appendChild() {}, classList: { add() {}, remove() {} } }; },
        addEventListener: function () {}, removeEventListener: function () {},
        body: { appendChild: function () {}, removeChild: function () {} },
        documentElement: { dir: 'ltr' },
        getElementById: function () { return null; },
    };
    const src = fs.readFileSync(LIBRARY_PATH, 'utf8');
    // eslint-disable-next-line no-new-func
    new Function('window', 'document', 'fetch', src)(sandboxWindow, stubDoc, function () { return Promise.resolve({ ok: true, json: () => Promise.resolve({}) }); });
    return sandboxWindow.AppScenarioLibrary && sandboxWindow.AppScenarioLibrary._testing;
}

console.log('\n=== Part 1: human-readable diff description (pure logic) ===\n');
(function pureLogic() {
    const T = loadSandbox();
    ok(!!T, 'AppScenarioLibrary._testing exposed (openRevisionsView helpers included)');

    const COMPARE = require(COMPARE_PATH);

    console.log('\n[1] describeItem — best-effort human label, never raw JSON for a labeled item');
    eq(T.describeItem({ uid: 'RED-1', label: 'Red Recon Coy' }), 'Red Recon Coy (RED-1)', 'label + id combined');
    eq(T.describeItem({ unit_uid: 'BLUE-1' }), 'BLUE-1', 'falls back to the id field when no label/title/name');
    eq(T.describeItem({ id: 'm1', title: 'Patrol Route' }), 'Patrol Route (m1)', 'title used the same as label');
    ok(T.describeItem({ foo: 'bar', baz: [1, 2, 3] }).indexOf('{') !== -1, 'a genuinely unlabeled item falls back to a JSON snippet, not a blank string');

    console.log('\n[2] describeDiffSection — units (added/removed/changed) rendered as plain-language lines');
    const unitsSection = {
        added: [{ uid: 'R2', label: 'New Unit' }],
        removed: [{ unit_uid: 'B1' }],
        changed: [{ id: 'R1', fields: [{ field: 'role', before: 'recon', after: 'assault' }] }],
    };
    const unitLines = T.describeDiffSection('units', unitsSection);
    eq(unitLines.length, 3, 'one line per added/removed/changed entry');
    ok(unitLines.some((l) => l.indexOf('Added') !== -1 && l.indexOf('New Unit') !== -1), 'added line names the new unit in plain language');
    ok(unitLines.some((l) => l.indexOf('Removed') !== -1 && l.indexOf('B1') !== -1), 'removed line names the removed unit');
    ok(unitLines.some((l) => l.indexOf('R1') !== -1 && l.indexOf('recon') !== -1 && l.indexOf('assault') !== -1), 'changed line explains role: recon -> assault in plain language');
    ok(!unitLines.some((l) => /^\{.*\}$/.test(l.trim())), 'no line is a bare raw JSON blob');

    console.log('\n[3] describeDiffSection — placement (moved) rendered distinctly from a generic field change');
    const placementSection = { moved: [{ id: 'R1', before: [1, 1], after: [9, 9] }] };
    const placeLines = T.describeDiffSection('placement', placementSection);
    eq(placeLines.length, 1, 'one moved-unit line');
    ok(placeLines[0].indexOf('moved') !== -1 && placeLines[0].indexOf('R1') !== -1, 'line reads as a plain-language "moved" statement');

    console.log('\n[4] describeDiffSection — timing/metadata (changed-only) rendered as field: before -> after');
    const timingSection = { changed: [{ field: 'duration_hours', before: 2, after: 4 }] };
    const timingLines = T.describeDiffSection('timing', timingSection);
    eq(timingLines.length, 1, 'one timing change line');
    ok(timingLines[0].indexOf('duration_hours') !== -1 && timingLines[0].indexOf('2') !== -1 && timingLines[0].indexOf('4') !== -1, 'line names the field and both values');

    console.log('\n[5] describeDiff — only sections with real changes are included; unchanged sections are silent');
    const fullDiff = COMPARE.compareScenarios(
        { name: 'a', red_units: [{ uid: 'R1', coord: [0, 0] }] },
        { name: 'a', red_units: [{ uid: 'R1', coord: [5, 5] }] }
    );
    const described = T.describeDiff(fullDiff);
    ok(!!described.units, 'units section present (coord counts as a unit field change)');
    ok(!!described.placement, 'placement section present (the unit moved)');
    ok(!described.doctrine, 'doctrine section absent — nothing changed there');
    ok(!described.metadata, 'metadata section absent — nothing changed there');

    console.log('\n[6] renderDiffHtml — no raw JSON leaks into the rendered HTML, and it IS escaped (XSS-safe)');
    const dangerousDiff = COMPARE.compareScenarios(
        { name: 'a', scenario_label: 'safe' },
        { name: 'a', scenario_label: '<img src=x onerror=alert(1)>' }
    );
    const html = T.renderDiffHtml(dangerousDiff);
    ok(html.indexOf('<img src=x') === -1, 'a dangerous field VALUE is escaped, not injected as raw HTML');
    ok(html.indexOf('&lt;img') !== -1, 'the escaped form is present instead');
    ok(html.indexOf('scenario_label') !== -1, 'the changed field name is shown in plain language');

    console.log('\n[7] renderDiffHtml — a true no-change comparison shows an honest "no differences" message, not an empty div');
    const noChangeHtml = T.renderDiffHtml({ sections: { units: { added: [], removed: [], changed: [] } } });
    ok(/no differences/i.test(noChangeHtml) || /لا توجد/.test(noChangeHtml), 'explicit "no differences" message shown when nothing changed');
})();

console.log('\n=== Part 2: source-scan — restore is confirmation-gated, not fire-and-forget ===\n');
(function sourceScan() {
    const src = fs.readFileSync(LIBRARY_PATH, 'utf8');
    const fnStart = src.indexOf('function restoreRevision(');
    const fnBody = src.slice(fnStart, fnStart + 700);
    ok(/confirmFn \|\| .*\.confirm/.test(fnBody), 'restoreRevision() uses an overridable confirmFn, defaulting to window.confirm — matching the existing launchToSCC() idiom');
    ok(/if \(!confirm2\(msg\)\) return Promise\.resolve\(null\)/.test(fnBody), 'a declined confirmation short-circuits BEFORE any fetch/POST is made');
    ok(/method: 'POST'/.test(fnBody), 'restore fires a real POST only after confirmation passes');

    // Confirm the Library wires "Open in Builder" / "Load on Map" / "Revisions"
    // as three distinct, discoverable actions per row (Slice 6 + Slice 7 together).
    ok(/data-act="revisions"/.test(src), 'each row exposes a Revisions action');
    ok(/openRevisionsView/.test(src), 'the Revisions action opens the compare/restore view');

    console.log('\n[D9/D10 follow-up] Clone / Save as Template / Archive now have REAL UI buttons — a real gap the audit before D10 caught (server endpoints existed since Slice 5 with no way to reach them)');
    ok(/id="rmooz-rev-clone"/.test(src), 'a Clone button exists in the Revisions view toolbar');
    ok(/id="rmooz-rev-save-template"/.test(src), 'a Save-as-Template button exists');
    ok(/id="rmooz-rev-archive"/.test(src), 'a single Archive/Restore-from-Archive toggle button exists (label switches on current status)');

    const cloneFnBody = src.slice(src.indexOf('function cloneScenario('), src.indexOf('function cloneScenario(') + 500);
    ok(/promptFn \|\| .*\.prompt/.test(cloneFnBody), 'cloneScenario() prompts for a new name via an overridable promptFn (window.prompt by default)');
    ok(/if \(!newName \|\| !newName\.trim\(\)\) return Promise\.resolve\(null\)/.test(cloneFnBody), 'an empty/cancelled prompt short-circuits before any request');

    const archiveFnBody = src.slice(src.indexOf('function archiveOrRestoreScenario('), src.indexOf('function archiveOrRestoreScenario(') + 900);
    ok(/confirmFn \|\| .*\.confirm/.test(archiveFnBody), 'archiveOrRestoreScenario() is confirmation-gated too, not fire-and-forget');
    ok(/isArchived \? 'restore-from-archive' : 'archive'/.test(archiveFnBody), 'the SAME function toggles between archive/restore-from-archive based on current status, not two separate code paths that could drift');
})();

console.log('\n' + (fail === 0 ? 'OK' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
