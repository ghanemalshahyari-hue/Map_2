#!/usr/bin/env node
/**
 * test-edit-mode-entrypaths-slice.js — Batch B Slice 10
 *
 * Static (no server) verifier for the four-entry-path unification:
 * manual/AI/template/import all converge on ONE canonical door,
 * `AppEditMode.openDraftForReview(draft, {source})`, which stamps
 * `commander_review_status:'needs_review'` + `entry_source` and opens the
 * editor — it never mounts, never activates, never calls the live
 * scenario-workspace loader.
 *
 * Proves:
 *   - openDraftForReview() is a REAL public API on window.AppEditMode
 *     (not test-only), and stamps commander_review_status/entry_source
 *     identically regardless of which of the 4 sources is passed
 *   - manual creation (applyDraftAndOpen, used by the New Scenario form)
 *     delegates to the SAME door rather than opening the editor itself
 *   - openDraftForReview's own body never calls mount()/setMode(true)/
 *     loadLiveScenarioFromJson/setActiveName — source-scanned directly
 *   - scenario-import-wizard.js's success handler now calls
 *     AppEditMode.openDraftForReview and no longer activates the scenario
 *     live via loadLiveScenarioFromJson
 *   - the New Scenario form wires both new client sources (starter-template
 *     registry fetch + AI brief-generation fetch)
 *   - the server-side starter-template registry (scenario-templates.js)
 *     lists >= 2 templates and each loads real, schema-shaped JSON
 *
 * Sibling to test-edit-mode-doctrine-slice.js etc. Run:
 *   node test-edit-mode-entrypaths-slice.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = __dirname;
const EDIT_MODE_PATH = path.join(ROOT, 'UI_MOdified/client/shell/scenario-edit-mode.js');
const WIZARD_PATH = path.join(ROOT, 'UI_MOdified/client/shell/scenario-import-wizard.js');
const TEMPLATES_MODULE_PATH = path.join(ROOT, 'UI_MOdified/server/ai/scenario-templates.js');

let pass = 0, fail = 0;
function ok(cond, label, detail) {
    if (cond) { console.log('  ok   ' + label); pass++; }
    else      { console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); fail++; }
}
function eq(a, b, label) { ok(a === b, label, 'expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a)); }

function loadSandbox() {
    const sandboxWindow = {
        AppEditMode: null,
        fetch: function () { return Promise.resolve({ ok: true, json: () => Promise.resolve({}) }); },
        URL: { createObjectURL: function () { return 'blob:stub'; }, revokeObjectURL: function () {} },
        Blob: function (parts, o) { this.parts = parts; this.opts = o; }
    };
    const stubDoc = {
        createElement: function (tag) {
            const kids = [];
            return {
                tag: tag, setAttribute() {}, style: {},
                appendChild: function (k) { kids.push(k); },
                get _kids() { return kids; },
                addEventListener: function () {}, click() {},
                set innerHTML(_v) { kids.length = 0; }, get innerHTML() { return ''; },
                classList: { add() {}, remove() {} }
            };
        },
        getElementById: function () { return null; },
        addEventListener: function () {},
        body: { appendChild: function () {}, removeChild: function () {} }
    };
    const fnStub = function () {};
    const src = fs.readFileSync(EDIT_MODE_PATH, 'utf8');
    // eslint-disable-next-line no-new-func
    new Function('window', 'document', 'navigator', 'setTimeout', 'requestAnimationFrame', 'Blob', 'URL', 'fetch', src)(
        sandboxWindow, stubDoc, { clipboard: { writeText: () => Promise.resolve() } }, fnStub, fnStub,
        sandboxWindow.Blob, sandboxWindow.URL, sandboxWindow.fetch
    );
    return sandboxWindow.AppEditMode;
}

console.log('\n=== Batch B Slice 10: four-entry-path unification ===\n');

// ── 1. openDraftForReview is a real public API ─────────────────────────────
console.log('\n[1] openDraftForReview() is exposed on window.AppEditMode directly');
{
    const AppEditMode = loadSandbox();
    ok(!!AppEditMode, 'AppEditMode exposed');
    ok(typeof AppEditMode.openDraftForReview === 'function', 'openDraftForReview is a real public method (not _testing-only)');
}

// ── 2. All four sources stamp identically ──────────────────────────────────
console.log('\n[2] All four entry sources stamp commander_review_status/entry_source identically');
const SOURCES = ['manual', 'ai', 'template', 'import'];
SOURCES.forEach(function (source) {
    const AppEditMode = loadSandbox();
    const draft = { name: 'entry-' + source, red_units: [], blue_units_initial: [] };
    const result = AppEditMode.openDraftForReview(draft, { source: source });
    eq(result.commander_review_status, 'needs_review', source + ': stamped commander_review_status=needs_review');
    eq(result.entry_source, source, source + ': stamped entry_source=' + source);
    ok(AppEditMode.getDraft() && AppEditMode.getDraft().entry_source === source, source + ': getDraft() reflects the opened draft');
});

// ── 3. Manual creation delegates to the same door ──────────────────────────
console.log('\n[3] applyDraftAndOpen (manual/native path) delegates to openDraftForReview');
{
    const src = fs.readFileSync(EDIT_MODE_PATH, 'utf8');
    const fnBody = src.slice(src.indexOf('function applyDraftAndOpen'), src.indexOf('function applyDraftAndOpen') + 900);
    ok(/openDraftForReview\(fresh/.test(fnBody), 'applyDraftAndOpen calls openDraftForReview(fresh, ...)');
    ok(!/renderEditor\(\)/.test(fnBody), 'applyDraftAndOpen no longer opens the editor itself (delegates instead)');
}

// ── 4. openDraftForReview itself never mounts/activates ────────────────────
console.log('\n[4] Source-scan — openDraftForReview never mounts/activates a scenario');
{
    const src = fs.readFileSync(EDIT_MODE_PATH, 'utf8');
    const fnBody = src.slice(src.indexOf('function openDraftForReview'), src.indexOf('function openDraftForReview') + 900);
    ok(!/setMode\(true\)/.test(fnBody), 'does not call setMode(true)');
    ok(!/\.mount\(/.test(fnBody), 'does not call any .mount(...)');
    ok(!/loadLiveScenarioFromJson/.test(fnBody), 'does not call loadLiveScenarioFromJson');
    ok(!/setActiveName|scenario\/active/.test(fnBody), 'does not activate a scenario server-side');
    ok(/renderEditor\(\)/.test(fnBody), 'does open the editor for review (renderEditor)');
}

// ── 5. scenario-import-wizard.js reroutes to openDraftForReview ────────────
console.log('\n[5] scenario-import-wizard.js reroutes its success handler');
{
    // Wide enough to cover the whole openScenario body, including the
    // feature-detected fallback branch (added post-Slice-10, see below) —
    // a narrower window previously let this check silently look at a
    // truncated slice and miss the reintroduced loadLiveScenarioFromJson
    // call entirely.
    const wizSrc = fs.readFileSync(WIZARD_PATH, 'utf8');
    const startIdx = wizSrc.indexOf('function openScenario');
    const endIdx = wizSrc.indexOf('\n        }\n', startIdx); // end of openScenario()
    const fnBody = wizSrc.slice(startIdx, endIdx > startIdx ? endIdx : startIdx + 3000);
    ok(/AppEditMode\.openDraftForReview|editMode\.openDraftForReview/.test(fnBody), 'openScenario calls AppEditMode.openDraftForReview');
    ok(/source:\s*'import'/.test(fnBody), 'import is stamped with source:"import"');
    // Post-Slice-10 fix (found during the pre-push audit, see D6/D7 offline-
    // parity below): scenario-import-wizard.js is byte-shared with the
    // offline build, which has no scenario-edit-mode.js at all — so this
    // file feature-detects window.AppEditMode.openDraftForReview and falls
    // back to the original loadLiveScenarioFromJson() activation when it's
    // absent (offline), rather than throwing. The call must exist, but ONLY
    // inside that fallback branch, gated behind the feature check.
    ok(/loadLiveScenarioFromJson\s*\(/.test(fnBody), 'openScenario retains a loadLiveScenarioFromJson(...) fallback call (for builds without Edit Mode, e.g. offline)');
    const editModeCheckIdx = fnBody.search(/editMode\s*&&\s*typeof\s*editMode\.openDraftForReview\s*===\s*'function'/);
    const fallbackCallIdx = fnBody.indexOf('loadLiveScenarioFromJson(');
    ok(editModeCheckIdx !== -1, 'the fallback is gated behind an explicit editMode feature check');
    ok(fallbackCallIdx > editModeCheckIdx && editModeCheckIdx !== -1, 'loadLiveScenarioFromJson(...) sits AFTER (inside the else of) the feature check, not unconditionally');
}

// ── 5b. scenario-import-wizard.js stays byte-identical with the offline copy ─
console.log('\n[5b] scenario-import-wizard.js parity with Offline_Deployment (OFFLINE-PARITY-D6/D7)');
{
    const OFFLINE_WIZARD_PATH = path.join(ROOT, 'UI_MOdified/Offline_Deployment/offline_app/client/shell/scenario-import-wizard.js');
    const mainSrc = fs.readFileSync(WIZARD_PATH, 'utf8');
    const offlineSrc = fs.readFileSync(OFFLINE_WIZARD_PATH, 'utf8');
    eq(mainSrc, offlineSrc, 'main and offline scenario-import-wizard.js are byte-identical (no D6/D7-style drift reintroduced by Slice 10)');
}

// ── 6. New Scenario form wires the template registry + AI generation ───────
console.log('\n[6] renderNewScenarioForm wires the template registry + AI-brief generation');
{
    const src = fs.readFileSync(EDIT_MODE_PATH, 'utf8');
    const fnBody = src.slice(src.indexOf('function renderNewScenarioForm'), src.indexOf('function renderNewScenarioForm') + 6000);
    ok(/\/api\/scenario-templates/.test(fnBody), 'fetches /api/scenario-templates for the starter-template optgroup');
    ok(/\/api\/ai\/scenario\/generate-from-brief/.test(fnBody), 'wires the AI brief-generation endpoint');
    ok(/openDraftForReview\(resp\.body\.scenario,\s*\{\s*source:\s*'ai'\s*\}\)/.test(fnBody), 'AI-generated draft opens via openDraftForReview with source:"ai"');
}

// ── 7. Server-side starter-template registry ────────────────────────────────
console.log('\n[7] Server-side starter-template registry');
{
    const Templates = require(TEMPLATES_MODULE_PATH);
    const list = Templates.listTemplates();
    ok(Array.isArray(list) && list.length >= 2, 'at least 2 starter templates registered');
    list.forEach(function (t) {
        ok(!!t.id && !!t.label, 'template "' + t.id + '" has id + label');
        const full = Templates.loadTemplate(t.id);
        ok(!!full && !!full.name, 'template "' + t.id + '" loads real scenario JSON with a name');
    });
    let threw = false;
    try { Templates.loadTemplate('does-not-exist'); } catch (_) { threw = true; }
    ok(threw, 'loading an unknown template id throws (caller handles via 404)');
}

console.log('\n' + (fail === 0 ? 'OK' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
