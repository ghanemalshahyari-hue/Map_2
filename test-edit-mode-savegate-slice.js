#!/usr/bin/env node
/**
 * test-edit-mode-savegate-slice.js — Batch B Slice 4
 *
 * Static (no server) verifier for the save-gate bug fix: `draftIsSafe()`
 * (the P0 authoring safety gate) previously ran only inside `saveDraft()`
 * (in-memory save) — `saveAsJson()` (Save As / Blob download) and
 * `saveToServer()` (POST /api/scenarios) skipped it entirely, so a
 * P0-unsafe draft could still be exported to disk or pushed to the server
 * even though the in-memory path refused it. Proves both paths now call
 * the same gate and refuse identically.
 *
 * Sibling to test-edit-mode-slice2{a,b,c,d,e}.js. Run:
 *   node test-edit-mode-savegate-slice.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = __dirname;
const EDIT_MODE_PATH = path.join(ROOT, 'UI_MOdified/client/shell/scenario-edit-mode.js');
const SAMPLE_PATH    = path.join(ROOT, 'docs/cmo-functional-rules/sample-sahil-corridor.json');

let pass = 0, fail = 0;
function ok(cond, label, detail) {
    if (cond) { console.log('  ok   ' + label); pass++; }
    else      { console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); fail++; }
}
function eq(a, b, label) { ok(a === b, label, 'expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a)); }

// ── Load the IIFE into a fresh sandbox per scenario (same pattern as 2A-2C) ─
function loadSandbox(opts) {
    opts = opts || {};
    const sandboxWindow = {
        AppEditMode: null,
        AppScenarioAuthoring: opts.authoring,
        fetch: opts.fetch || function () { return Promise.resolve({ ok: true, json: () => Promise.resolve({}) }); },
        URL: { createObjectURL: function () { opts.calls && opts.calls.push('createObjectURL'); return 'blob:stub'; },
               revokeObjectURL: function () {} },
        Blob: function (parts, o) { opts.calls && opts.calls.push('Blob'); this.parts = parts; this.opts = o; },
        confirm: function () { return false; }
    };
    const createdEls = [];
    const stubDoc = {
        createElement: function (tag) {
            const node = { tag: tag, setAttribute() {}, appendChild() {}, addEventListener() {}, style: {},
                click: function () { opts.calls && opts.calls.push('a.click'); } };
            createdEls.push(node);
            return node;
        },
        getElementById: function () { return null; },
        addEventListener: function () {},
        body: { appendChild: function () {}, removeChild: function () {} }
    };
    const fnStub = function () {};
    const src = fs.readFileSync(EDIT_MODE_PATH, 'utf8');
    // The source references Blob/URL/fetch as bare globals (not window.Blob
    // etc.) — pass them explicitly so the sandbox's stubs are actually hit
    // instead of falling through to Node's own global Blob/URL classes.
    // eslint-disable-next-line no-new-func
    new Function('window', 'document', 'navigator', 'setTimeout', 'requestAnimationFrame', 'Blob', 'URL', 'fetch', src)(
        sandboxWindow, stubDoc, { clipboard: { writeText: () => Promise.resolve() } }, fnStub, fnStub,
        sandboxWindow.Blob, sandboxWindow.URL, sandboxWindow.fetch
    );
    return sandboxWindow.AppEditMode && sandboxWindow.AppEditMode._testing;
}

const sample = JSON.parse(fs.readFileSync(SAMPLE_PATH, 'utf8'));
// A minimal draft (no forces/geometry) trivially passes validateAllHardRules —
// used to isolate the draftIsSafe gate itself from unrelated hard-rule noise
// in the full sample (e.g. base_id cross-refs that need syncBlueBaseIds first).
const minimalDraft = { name: 'savegate-test', scenario_label: 'Save Gate Test' };

console.log('\n=== Batch B Slice 4: save-gate parity across saveDraft/saveAsJson/saveToServer ===\n');

// ── 1. draftIsSafe itself: unsafe -> blocked, safe -> ok ───────────────────
console.log('\n[1] draftIsSafe — the P0 gate primitive');
{
    const T = loadSandbox({ authoring: { isScenarioAuthoringDraftSafe: () => ({ safe: false, violations: ['P0 test violation'] }) } });
    ok(!!T, 'AppEditMode._testing exposed');
    ok(typeof T.draftIsSafe === 'function', 'draftIsSafe exposed for testing');
    const r1 = T.draftIsSafe(sample);
    eq(r1.ok, false, 'unsafe draft -> ok:false');
    ok(/P0 test violation/.test(r1.why), 'unsafe draft -> violation surfaced in why');

    const T2 = loadSandbox({ authoring: { isScenarioAuthoringDraftSafe: () => ({ safe: true }) } });
    eq(T2.draftIsSafe(sample).ok, true, 'safe draft -> ok:true');
}

// ── 2. saveAsJson refuses a P0-unsafe draft (no Blob/no download) ─────────
console.log('\n[2] saveAsJson() now calls draftIsSafe()');
{
    const calls = [];
    const T = loadSandbox({ calls: calls, authoring: { isScenarioAuthoringDraftSafe: () => ({ safe: false, violations: ['blocked-for-test'] }) } });
    T._setDraftForTest(JSON.parse(JSON.stringify(minimalDraft)));
    T.saveAsJson();
    eq(calls.length, 0, 'unsafe draft: saveAsJson triggers NO Blob/createObjectURL/anchor-click');
}
{
    const calls = [];
    const T = loadSandbox({ calls: calls, authoring: { isScenarioAuthoringDraftSafe: () => ({ safe: true }) } });
    T._setDraftForTest(JSON.parse(JSON.stringify(minimalDraft)));
    T.saveAsJson();
    ok(calls.indexOf('Blob') !== -1 && calls.indexOf('createObjectURL') !== -1 && calls.indexOf('a.click') !== -1,
        'safe draft: saveAsJson proceeds to Blob/createObjectURL/anchor-click', calls.join(','));
}

// ── 3. saveToServer refuses a P0-unsafe draft (no fetch) ──────────────────
console.log('\n[3] saveToServer() now calls draftIsSafe()');
{
    let fetchCalled = false;
    const T = loadSandbox({
        authoring: { isScenarioAuthoringDraftSafe: () => ({ safe: false, violations: ['blocked-for-test'] }) },
        fetch: function () { fetchCalled = true; return Promise.resolve({ ok: true, json: () => Promise.resolve({}) }); }
    });
    T._setDraftForTest(JSON.parse(JSON.stringify(minimalDraft)));
    T.saveToServer();
    eq(fetchCalled, false, 'unsafe draft: saveToServer never calls fetch');
}
{
    let fetchCalled = false;
    const T = loadSandbox({
        authoring: { isScenarioAuthoringDraftSafe: () => ({ safe: true }) },
        fetch: function () { fetchCalled = true; return Promise.resolve({ ok: true, json: () => Promise.resolve({ name: minimalDraft.name }) }); }
    });
    T._setDraftForTest(JSON.parse(JSON.stringify(minimalDraft)));
    T.saveToServer();
    eq(fetchCalled, true, 'safe draft: saveToServer proceeds to fetch');
}

// ── 4. saveDraft (the original gated path) is unaffected ──────────────────
console.log('\n[4] saveDraft() — pre-existing gate still works (regression)');
{
    const T = loadSandbox({ authoring: { isScenarioAuthoringDraftSafe: () => ({ safe: false, violations: ['blocked-for-test'] }) } });
    T._setDraftForTest(JSON.parse(JSON.stringify(minimalDraft)));
    // saveDraft writes to window.RmoozScenario on success; absence of a throw plus
    // no crash is what we can observe headlessly here — the shared draftIsSafe
    // unit tests in [1] already prove the gate logic itself.
    let threw = false;
    try { T.saveDraft(); } catch (e) { threw = true; }
    ok(!threw, 'saveDraft does not throw when blocked by the gate');
}

// ── 5. Source-scan: both call sites actually invoke draftIsSafe ───────────
console.log('\n[5] Source-scan — saveAsJson/saveToServer bodies call draftIsSafe');
{
    const src = fs.readFileSync(EDIT_MODE_PATH, 'utf8');
    function block(from, to) {
        const a = src.indexOf(from);
        const b = src.indexOf(to, a + from.length);
        return src.slice(a, b < 0 ? a + 2000 : b);
    }
    const asJsonFn = block('function saveAsJson()', 'function saveToServer()');
    ok(/draftIsSafe\(_draft\)/.test(asJsonFn), 'saveAsJson body calls draftIsSafe(_draft)');
    const toServerFn = block('function saveToServer()', "/* ---- Slice 2C: stepped editor render");
    ok(/draftIsSafe\(_draft\)/.test(toServerFn), 'saveToServer body calls draftIsSafe(_draft)');
}

console.log('\n' + (fail === 0 ? 'OK' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
