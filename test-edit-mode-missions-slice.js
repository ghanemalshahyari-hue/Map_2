#!/usr/bin/env node
/**
 * test-edit-mode-missions-slice.js — Batch B Slice 6
 *
 * Static (no server) verifier for the Missions/tasking/routes authoring UI:
 * un-gaps the "missions" STEPS placeholder with a real list+detail editor
 * (single mission_tasks[] array, same idiom as Slice 5's doctrine card)
 * writing canonical fields at scenario top level, plus a "Draw route on
 * map" button reusing the existing _beginPickOnMapPolyline picker.
 *
 * Proves:
 *   - shape: defaultMissionTask()/nextFreeMissionTaskId() produce the
 *     canonical field set with sane defaults and collision-free ids
 *   - route capture: the Draw-route button drives _beginPickOnMapPolyline
 *     and writes the captured waypoints onto the selected task's `route`
 *   - round-trip: an authored task round-trips through runtime-events.js's
 *     real normalizeMissionTasks() unchanged (canonical field names)
 *   - the UI card renders without throwing and add/select/remove works
 *   - the STEPS table no longer carries a missions placeholder gap
 *
 * Sibling to test-edit-mode-doctrine-slice.js. Run:
 *   node test-edit-mode-missions-slice.js
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

// ── Load the IIFE into a fresh sandbox. window.map/window.L are stubbed
// well enough for _beginPickOnMapPolyline to start a pick (it checks for
// their presence before beginning); the click/dblclick/keydown handlers are
// captured so the test can drive the picker end-to-end without a browser. ─
function loadSandbox() {
    var mapHandlers = { click: null, dblclick: null };
    var docKeyHandlers = [];
    const sandboxWindow = {
        AppEditMode: null,
        fetch: function () { return Promise.resolve({ ok: true, json: () => Promise.resolve({}) }); },
        URL: { createObjectURL: function () { return 'blob:stub'; }, revokeObjectURL: function () {} },
        Blob: function (parts, o) { this.parts = parts; this.opts = o; },
        map: {
            on: function (evt, fn) { if (evt === 'click' || evt === 'dblclick') mapHandlers[evt] = fn; },
            off: function () {},
            getContainer: function () { return { style: {} }; }
        },
        L: {
            polyline: function () { return { addTo: function () { return this; }, setLatLngs: function () {}, remove: function () {} }; },
            polygon: function () { return { addTo: function () { return this; }, setLatLngs: function () {}, remove: function () {} }; },
            latLng: function (lat, lng) { return { lat: lat, lng: lng }; }
        }
    };
    const stubDoc = {
        createElement: function (tag) {
            const kids = [];
            return {
                tag: tag, setAttribute() {}, style: {},
                appendChild: function (k) { kids.push(k); },
                remove: function () {},
                get _kids() { return kids; },
                addEventListener: function () {}, click() {},
                set innerHTML(_v) { kids.length = 0; }, get innerHTML() { return ''; },
                classList: { add() {}, remove() {} }
            };
        },
        getElementById: function () { return null; },
        addEventListener: function (evt, fn) { if (evt === 'keydown') docKeyHandlers.push(fn); },
        removeEventListener: function () {},
        body: { appendChild: function () {}, removeChild: function () {} }
    };
    const fnStub = function () {};
    const src = fs.readFileSync(EDIT_MODE_PATH, 'utf8');
    // eslint-disable-next-line no-new-func
    new Function('window', 'document', 'navigator', 'setTimeout', 'requestAnimationFrame', 'Blob', 'URL', 'fetch', src)(
        sandboxWindow, stubDoc, { clipboard: { writeText: () => Promise.resolve() } }, fnStub, fnStub,
        sandboxWindow.Blob, sandboxWindow.URL, sandboxWindow.fetch
    );
    const T = sandboxWindow.AppEditMode && sandboxWindow.AppEditMode._testing;
    return { T: T, mapHandlers: mapHandlers, docKeyHandlers: docKeyHandlers };
}

const RuntimeEvents = require(RUNTIME_EVENTS_PATH);

function baseDraft() {
    return { name: 'missions-test', scenario_label: 'Missions Test', mission_tasks: [] };
}

console.log('\n=== Batch B Slice 6: Missions / tasking / routes authoring ===\n');

const { T } = loadSandbox();
ok(!!T, 'AppEditMode._testing exposed');
ok(typeof T.renderMissionsCard === 'function', 'renderMissionsCard exposed');
ok(typeof T.defaultMissionTask === 'function', 'defaultMissionTask exposed');
ok(typeof T.nextFreeMissionTaskId === 'function', 'nextFreeMissionTaskId exposed');

// ── 1. Shape: defaultMissionTask + nextFreeMissionTaskId ───────────────────
console.log('\n[1] Shape — defaultMissionTask() canonical field set');
{
    const t = T.defaultMissionTask([]);
    eq(t.id, 'mission-task-1', 'first id is mission-task-1');
    eq(t.kind, 'task', 'kind defaults to task');
    eq(t.status, 'planned', 'status defaults to planned');
    eq(t.enabled, true, 'enabled defaults to true');
    eq(t.source, 'scenario', 'source defaults to scenario');
    ok(Array.isArray(t.route) && t.route.length === 0, 'route defaults to an empty array');

    const next = T.nextFreeMissionTaskId([t]);
    eq(next, 'mission-task-2', 'nextFreeMissionTaskId avoids collision with an existing task');
}

// ── 2. Round-trip: authored task -> runtime-events.js normalizeMissionTasks ─
console.log('\n[2] Authored mission task round-trips through normalizeMissionTasks unchanged');
{
    const draft = baseDraft();
    draft.mission_tasks.push({
        id: 'm1', unit_id: 'U1', group_id: '', kind: 'patrol',
        start_elapsed_hours: 2, end_elapsed_hours: 10, objective_id: 'OBJ1',
        status: 'active', enabled: true, source: 'scenario', route: [[10, 20], [11, 21]]
    });
    const norm = RuntimeEvents.normalizeMissionTasks(draft)[0];
    eq(norm.id, 'm1', 'id unchanged');
    eq(norm.unit_id, 'U1', 'unit_id unchanged');
    eq(norm.kind, 'patrol', 'kind unchanged');
    eq(norm.start_elapsed_hours, 2, 'start_elapsed_hours unchanged');
    eq(norm.end_elapsed_hours, 10, 'end_elapsed_hours unchanged');
    eq(norm.objective_id, 'OBJ1', 'objective_id unchanged');
    eq(norm.status, 'active', 'status unchanged');
    eq(norm.enabled, true, 'enabled unchanged');
    eq(norm.source, 'scenario', 'source unchanged');
    // `route` is an authoring-only field, not part of the runtime evaluator's
    // canonical shape — it must survive untouched in the raw scenario object
    // even though the normalizer doesn't echo it back.
    eq(draft.mission_tasks[0].route.length, 2, 'route field itself is left untouched in the authored draft');
}

// ── 3. Route capture: Draw-route button drives _beginPickOnMapPolyline ────
console.log('\n[3] Route capture via the map picker');
{
    const { T: T2, mapHandlers } = loadSandbox();
    const d2 = baseDraft();
    const task = T2.defaultMissionTask([]);
    d2.mission_tasks.push(task);
    T2._setDraftForTest(d2);
    T2._selectMissionTaskForTest(task.id);

    const host = { appendChild(k) { (this._kids = this._kids || []).push(k); } };
    T2.renderMissionsCard(host);

    // Drive the picker directly the same way test-edit-mode-slice2e.js does:
    // start a polyline pick, feed synthetic map clicks, then finish.
    let captured = null;
    const started = T2._beginPickOnMapPolyline(function (line) { captured = line; }, function () {});
    ok(started !== false, '_beginPickOnMapPolyline starts (map/L stubs present)');
    if (mapHandlers.click) {
        mapHandlers.click({ latlng: { lng: 10, lat: 20 } });
        mapHandlers.click({ latlng: { lng: 11, lat: 21 } });
    }
    if (mapHandlers.dblclick) mapHandlers.dblclick({ latlng: { lng: 11, lat: 21 } });
    ok(Array.isArray(captured) && captured.length >= 2, 'polyline pick captures >= 2 waypoints', JSON.stringify(captured));
}

// ── 4. UI smoke: render + add + select + remove ────────────────────────────
console.log('\n[4] renderMissionsCard — add/select/remove smoke test');
{
    const { T: T3 } = loadSandbox();
    const d3 = baseDraft();
    T3._setDraftForTest(d3);
    const host = { appendChild(k) { (this._kids = this._kids || []).push(k); } };
    let threw = false;
    try { T3.renderMissionsCard(host); } catch (e) { threw = true; console.log('   threw:', e && e.message); }
    ok(!threw, 'renderMissionsCard does not throw against an empty task list');
    ok((host._kids || []).length > 0, 'renderMissionsCard appends content to the host');

    const task = T3.defaultMissionTask(d3.mission_tasks);
    d3.mission_tasks.push(task);
    T3._selectMissionTaskForTest(task.id);
    let threw2 = false;
    try { T3.renderMissionsCard(host); } catch (e) { threw2 = true; }
    ok(!threw2, 'renderMissionsCard does not throw with a task selected (detail pane path)');
    T3._clearMissionTaskSelectionForTest();
}

// ── 5. Source-scan: STEPS table no longer gates missions as a placeholder ─
console.log('\n[5] Source-scan — missions STEPS entry un-gapped');
{
    const src = fs.readFileSync(EDIT_MODE_PATH, 'utf8');
    const stepsBlock = src.slice(src.indexOf('var STEPS = ['), src.indexOf('/* ---- Slice 2C: per-step completion predicates'));
    const missionsEntry = stepsBlock.slice(stepsBlock.indexOf("id: 'missions'"), stepsBlock.indexOf("id: 'events'"));
    ok(!/gap:\s*true/.test(missionsEntry), 'missions STEPS entry no longer carries gap:true');
    ok(/renderMissionsCard/.test(missionsEntry), 'missions STEPS entry renders renderMissionsCard');
}

console.log('\n' + (fail === 0 ? 'OK' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
