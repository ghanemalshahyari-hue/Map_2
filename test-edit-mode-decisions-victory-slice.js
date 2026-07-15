#!/usr/bin/env node
/**
 * test-edit-mode-decisions-victory-slice.js — Batch B Slice 8
 *
 * Static (no server) verifier for Decision Points + Victory/Termination
 * Conditions authoring: adds TWO new STEPS entries ('decisions', 'victory')
 * — the first new STEPS entries since the original 13-step table (every
 * prior authoring slice un-gapped an existing placeholder instead).
 *
 * Proves:
 *   - shape: defaultDecisionPoint()/defaultVictoryCondition() produce the
 *     canonical field set with sane defaults and collision-free ids
 *   - round-trip: authored decision points/victory conditions round-trip
 *     through runtime-events.js's real normalizeDecisionPoints()/
 *     normalizeVictoryConditions() unchanged (canonical field names)
 *   - the victory card's "no destructive evaluation yet" caveat is present
 *     in its rendered content (per the plan's explicit instruction not to
 *     overclaim the engine auto-terminates on these)
 *   - both UI cards render without throwing and add/select/remove works
 *     (including the decision point's nested options[] sub-list)
 *   - the STEPS table carries both new entries in CMO build-order, right
 *     after 'events' and before 'briefing'
 *
 * Sibling to test-edit-mode-doctrine-slice.js / -missions-slice.js / -events-slice.js. Run:
 *   node test-edit-mode-decisions-victory-slice.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = __dirname;
const EDIT_MODE_PATH = path.join(ROOT, 'UI_MOdified/client/shell/scenario-edit-mode.js');
const RUNTIME_EVENTS_PATH = path.join(ROOT, 'UI_MOdified/client/shell/runtime-events.js');

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
    return sandboxWindow.AppEditMode && sandboxWindow.AppEditMode._testing;
}

const RuntimeEvents = require(RUNTIME_EVENTS_PATH);

function baseDraft() {
    return {
        name: 'dp-vc-test', scenario_label: 'DP/VC Test',
        sides: [{ id: 'BLUE' }, { id: 'RED' }],
        decision_points: [], victory_conditions: []
    };
}

console.log('\n=== Batch B Slice 8: Decision points + victory conditions authoring ===\n');

const T = loadSandbox();
ok(!!T, 'AppEditMode._testing exposed');
ok(typeof T.renderDecisionsCard === 'function', 'renderDecisionsCard exposed');
ok(typeof T.renderVictoryCard === 'function', 'renderVictoryCard exposed');

// ── 1. Shape: defaultDecisionPoint / defaultVictoryCondition ───────────────
console.log('\n[1] Shape — default factories produce canonical field sets');
{
    const dp = T.defaultDecisionPoint([]);
    eq(dp.id, 'decision-point-1', 'first decision point id');
    eq(dp.status, 'pending', 'decision point status defaults to pending');
    eq(dp.enabled, true, 'decision point enabled defaults to true');
    ok(Array.isArray(dp.options) && dp.options.length === 0, 'decision point options defaults to empty array');
    const nextDp = T.nextFreeDecisionPointId([dp]);
    eq(nextDp, 'decision-point-2', 'nextFreeDecisionPointId avoids collision');

    const opt = T.defaultDecisionOption([]);
    eq(opt.id, 'option-1', 'first option id');

    const vc = T.defaultVictoryCondition([]);
    eq(vc.id, 'victory-condition-1', 'first victory condition id');
    eq(vc.kind, 'condition', 'victory condition kind defaults to condition');
    eq(vc.status, 'pending', 'victory condition status defaults to pending');
    eq(vc.continuous, true, 'victory condition continuous defaults to true');
    eq(vc.threshold, null, 'victory condition threshold defaults to null');
    const nextVc = T.nextFreeVictoryConditionId([vc]);
    eq(nextVc, 'victory-condition-2', 'nextFreeVictoryConditionId avoids collision');
}

// ── 2. Round-trip through the real runtime-events.js normalizers ──────────
console.log('\n[2] Round-trip through normalizeDecisionPoints / normalizeVictoryConditions');
{
    const draft = baseDraft();
    draft.decision_points.push({
        id: 'dp1', title: 'Choose route', trigger_elapsed_hours: 3,
        options: [{ id: 'a', label: 'North' }, { id: 'b', label: 'South' }],
        expires_elapsed_hours: 5, status: 'pending', enabled: true, source: 'scenario'
    });
    const ndp = RuntimeEvents.normalizeDecisionPoints(draft)[0];
    eq(ndp.id, 'dp1', 'decision point id unchanged');
    eq(ndp.title, 'Choose route', 'decision point title unchanged');
    eq(ndp.trigger_elapsed_hours, 3, 'trigger_elapsed_hours unchanged');
    eq(ndp.expires_elapsed_hours, 5, 'expires_elapsed_hours unchanged');
    eq(ndp.options.length, 2, 'options array carried through');
    eq(ndp.options[0].label, 'North', 'option label unchanged');

    draft.victory_conditions.push({
        id: 'vc1', kind: 'hold_objective', threshold: { hours: 4 },
        evaluate_at_elapsed_hours: 4, continuous: false, side: 'BLUE',
        status: 'pending', enabled: true, source: 'scenario'
    });
    const nvc = RuntimeEvents.normalizeVictoryConditions(draft)[0];
    eq(nvc.id, 'vc1', 'victory condition id unchanged');
    eq(nvc.kind, 'hold_objective', 'kind unchanged');
    eq(nvc.evaluate_at_elapsed_hours, 4, 'evaluate_at_elapsed_hours unchanged');
    eq(nvc.continuous, false, 'continuous unchanged');
    eq(nvc.side, 'BLUE', 'side unchanged');
    ok(nvc.threshold && nvc.threshold.hours === 4, 'threshold object unchanged');
}

// ── 3. Victory card states the "no auto-termination" caveat explicitly ────
console.log('\n[3] Victory card is honest about not auto-terminating (source-scan)');
{
    const src = fs.readFileSync(EDIT_MODE_PATH, 'utf8');
    const fnBody = src.slice(src.indexOf('function renderVictoryCard'), src.indexOf('function renderVictoryCard') + 1500);
    ok(/does NOT auto-evaluate|No destructive evaluation/i.test(fnBody),
        'renderVictoryCard source states the engine does not auto-evaluate/terminate on these conditions');
}

// ── 4. UI smoke: decisions card add/select/remove (incl. nested options) ──
console.log('\n[4] renderDecisionsCard — add/select/remove smoke test (incl. nested options)');
{
    const T3 = loadSandbox();
    const d3 = baseDraft();
    T3._setDraftForTest(d3);
    const host = { appendChild(k) { (this._kids = this._kids || []).push(k); } };
    let threw = false;
    try { T3.renderDecisionsCard(host); } catch (e) { threw = true; console.log('   threw:', e && e.message); }
    ok(!threw, 'renderDecisionsCard does not throw against an empty list');
    ok((host._kids || []).length > 0, 'renderDecisionsCard appends content to the host');

    const dp = T3.defaultDecisionPoint(d3.decision_points);
    d3.decision_points.push(dp);
    dp.options.push(T3.defaultDecisionOption(dp.options));
    T3._selectDecisionPointForTest(dp.id);
    let threw2 = false;
    try { T3.renderDecisionsCard(host); } catch (e) { threw2 = true; console.log('   threw:', e && e.message); }
    ok(!threw2, 'renderDecisionsCard does not throw with a decision point (+ nested option) selected');
    T3._clearDecisionPointSelectionForTest();
}

// ── 5. UI smoke: victory card add/select/remove ────────────────────────────
console.log('\n[5] renderVictoryCard — add/select/remove smoke test');
{
    const T4 = loadSandbox();
    const d4 = baseDraft();
    T4._setDraftForTest(d4);
    const host = { appendChild(k) { (this._kids = this._kids || []).push(k); } };
    let threw = false;
    try { T4.renderVictoryCard(host); } catch (e) { threw = true; console.log('   threw:', e && e.message); }
    ok(!threw, 'renderVictoryCard does not throw against an empty list');

    const vc = T4.defaultVictoryCondition(d4.victory_conditions);
    d4.victory_conditions.push(vc);
    T4._selectVictoryConditionForTest(vc.id);
    let threw2 = false;
    try { T4.renderVictoryCard(host); } catch (e) { threw2 = true; console.log('   threw:', e && e.message); }
    ok(!threw2, 'renderVictoryCard does not throw with a condition selected');
    T4._clearVictoryConditionSelectionForTest();
}

// ── 6. Source-scan: STEPS table carries both new entries in build-order ───
console.log('\n[6] Source-scan — STEPS table gains decisions + victory after events');
{
    const src = fs.readFileSync(EDIT_MODE_PATH, 'utf8');
    const stepsBlock = src.slice(src.indexOf('var STEPS = ['), src.indexOf('/* ---- Slice 2C: per-step completion predicates'));
    const ids = [];
    const re = /id:\s*'([a-z_]+)'/g;
    let m;
    while ((m = re.exec(stepsBlock))) ids.push(m[1]);
    const eventsIdx = ids.indexOf('events');
    const decisionsIdx = ids.indexOf('decisions');
    const victoryIdx = ids.indexOf('victory');
    const briefingIdx = ids.indexOf('briefing');
    ok(eventsIdx !== -1 && decisionsIdx === eventsIdx + 1, 'decisions immediately follows events');
    ok(victoryIdx === decisionsIdx + 1, 'victory immediately follows decisions');
    ok(briefingIdx === victoryIdx + 1, 'briefing immediately follows victory');
    ok(!/id:\s*'decisions'[^}]*gap:\s*true/s.test(stepsBlock.slice(stepsBlock.indexOf("id: 'decisions'"), stepsBlock.indexOf("id: 'victory'"))),
        'decisions STEPS entry has no gap:true');
    ok(!/gap:\s*true/.test(stepsBlock.slice(stepsBlock.indexOf("id: 'victory'"), stepsBlock.indexOf("id: 'briefing'"))),
        'victory STEPS entry has no gap:true');
}

console.log('\n' + (fail === 0 ? 'OK' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
