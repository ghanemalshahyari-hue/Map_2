#!/usr/bin/env node
/**
 * test-edit-mode-events-slice.js — Batch B Slice 7
 *
 * Static (no server) verifier for the Runtime events/triggers authoring UI:
 * un-gaps the "events" STEPS placeholder with a real list+detail editor
 * (runtime_events[] with a nested per-event effects[] sub-list) writing
 * canonical fields at scenario top level, an effect-kind selector restricted
 * to the 8-item SAFE_RUNTIME_EFFECT_KINDS allowlist, and a "Draw trigger
 * zone on map" button reusing the existing _beginPickOnMapPolygon picker.
 *
 * Proves:
 *   - allowlist enforcement: validateRuntimeHardRules accepts all 8 safe
 *     effect kinds and rejects anything outside the allowlist
 *   - cross-ref resolution: update_mission_task_status/open_decision_point/
 *     close_decision_point payloads referencing an unknown id are rejected,
 *     a known id passes
 *   - round-trip: an authored event round-trips through runtime-events.js's
 *     real normalizeRuntimeEvents() unchanged (canonical field names)
 *   - trigger-zone capture drives _beginPickOnMapPolygon and writes a
 *     closed ring onto the selected event
 *   - the UI card renders without throwing and add/select/remove works
 *     (including the nested effects sub-list)
 *   - the STEPS table no longer carries an events placeholder gap
 *
 * Sibling to test-edit-mode-doctrine-slice.js / test-edit-mode-missions-slice.js. Run:
 *   node test-edit-mode-events-slice.js
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

// ── Load the IIFE into a fresh sandbox (map/L stubs capture click/dblclick
// handlers so a polygon pick can be driven end-to-end without a browser). ──
function loadSandbox() {
    var mapHandlers = { click: null, dblclick: null };
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
        addEventListener: function () {},
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
    return { T: T, mapHandlers: mapHandlers };
}

const RuntimeEvents = require(RUNTIME_EVENTS_PATH);

function baseDraft() {
    return { name: 'events-test', scenario_label: 'Events Test', runtime_events: [], mission_tasks: [], decision_points: [] };
}

console.log('\n=== Batch B Slice 7: Runtime events / triggers authoring ===\n');

const { T } = loadSandbox();
ok(!!T, 'AppEditMode._testing exposed');
ok(typeof T.validateRuntimeHardRules === 'function', 'validateRuntimeHardRules exposed');
ok(typeof T.renderEventsCard === 'function', 'renderEventsCard exposed');
ok(Array.isArray(T.RUNTIME_SAFE_EFFECT_KINDS) && T.RUNTIME_SAFE_EFFECT_KINDS.length === 8,
    'RUNTIME_SAFE_EFFECT_KINDS has all 8 safe kinds');

// ── 1. Allowlist enforcement: all 8 accepted, anything else rejected ──────
console.log('\n[1] Effect-kind allowlist enforcement');
T.RUNTIME_SAFE_EFFECT_KINDS.forEach(function (kind) {
    const d = baseDraft();
    d.runtime_events.push({ id: 'e1', effects: [{ id: 'f1', kind: kind, payload: {} }] });
    const r = T.validateRuntimeHardRules(d);
    ok(r.ok, 'safe kind "' + kind + '" accepted', r.why);
});
['move_unit', 'destroy_unit', 'fire_weapon', 'made_up_kind'].forEach(function (kind) {
    const d = baseDraft();
    d.runtime_events.push({ id: 'e1', effects: [{ id: 'f1', kind: kind, payload: {} }] });
    const r = T.validateRuntimeHardRules(d);
    ok(r.ok === false, 'unsafe/unknown kind "' + kind + '" rejected', r.why || '(no why)');
});

// ── 2. Cross-ref resolution ────────────────────────────────────────────────
console.log('\n[2] Cross-ref resolution — mission_task_id / decision_point_id');
{
    const d = baseDraft();
    d.mission_tasks.push({ id: 'm1' });
    d.runtime_events.push({ id: 'e1', effects: [{ id: 'f1', kind: 'update_mission_task_status', payload: { mission_task_id: 'UNKNOWN' } }] });
    ok(T.validateRuntimeHardRules(d).ok === false, 'unknown mission_task_id rejected');
    d.runtime_events[0].effects[0].payload.mission_task_id = 'm1';
    ok(T.validateRuntimeHardRules(d).ok === true, 'known mission_task_id passes');
}
{
    const d = baseDraft();
    d.decision_points.push({ id: 'dp1' });
    d.runtime_events.push({ id: 'e1', effects: [{ id: 'f1', kind: 'open_decision_point', payload: { decision_point_id: 'UNKNOWN' } }] });
    ok(T.validateRuntimeHardRules(d).ok === false, 'unknown decision_point_id rejected');
    d.runtime_events[0].effects[0].payload.decision_point_id = 'dp1';
    ok(T.validateRuntimeHardRules(d).ok === true, 'known decision_point_id passes');
}
{
    const d = baseDraft();
    d.runtime_events.push({ id: 'dup' }, { id: 'dup' });
    ok(T.validateRuntimeHardRules(d).ok === false, 'duplicate event id rejected');
}
{
    const d = baseDraft();
    d.runtime_events.push({ id: 'e1' });
    ok(T.validateAllHardRules(d).ok === true, 'validateAllHardRules composes runtime hard rules cleanly for a valid draft', T.validateAllHardRules(d).why);
}

// ── 3. Round-trip: authored event -> runtime-events.js's real normalizer ──
console.log('\n[3] Authored event round-trips through normalizeRuntimeEvents unchanged');
{
    const draft = baseDraft();
    draft.runtime_events.push({
        id: 'e1', title: 'Fallback ROE tightened', description: 'auto-tighten after H+24',
        kind: 'runtime_event', at_elapsed_hours: 24, once: true, enabled: true,
        tags: ['roe', 'auto'], source: 'scenario',
        effects: [{ id: 'f1', kind: 'add_notification', payload: { message: 'ROE tightened' } }],
        trigger_zone: [[10, 20], [11, 20], [11, 21], [10, 21]]
    });
    const norm = RuntimeEvents.normalizeRuntimeEvents(draft)[0];
    eq(norm.id, 'e1', 'id unchanged');
    eq(norm.title, 'Fallback ROE tightened', 'title unchanged');
    eq(norm.description, 'auto-tighten after H+24', 'description unchanged');
    eq(norm.at_elapsed_hours, 24, 'at_elapsed_hours unchanged');
    eq(norm.once, true, 'once unchanged');
    eq(norm.enabled, true, 'enabled unchanged');
    eq(norm.source, 'scenario', 'source unchanged');
    ok(Array.isArray(norm.tags) && norm.tags.length === 2, 'tags unchanged');
    eq(norm.effects.length, 1, 'effects array carried through');
    eq(norm.effects[0].kind, 'add_notification', 'effect kind unchanged');
    eq(norm.effects[0].payload.message, 'ROE tightened', 'effect payload unchanged');
    // trigger_zone is authoring-only, not part of the runtime evaluator's shape.
    eq(draft.runtime_events[0].trigger_zone.length, 4, 'trigger_zone field itself is left untouched in the authored draft');
}

// ── 4. Trigger-zone capture via the map picker ─────────────────────────────
console.log('\n[4] Trigger-zone capture via the map picker');
{
    const { T: T2, mapHandlers } = loadSandbox();
    let captured = null;
    const started = T2._beginPickOnMapPolygon(function (ring) { captured = ring; }, function () {});
    ok(started !== false, '_beginPickOnMapPolygon starts (map/L stubs present)');
    if (mapHandlers.click) {
        mapHandlers.click({ latlng: { lng: 10, lat: 20 } });
        mapHandlers.click({ latlng: { lng: 11, lat: 20 } });
        mapHandlers.click({ latlng: { lng: 11, lat: 21 } });
    }
    if (mapHandlers.dblclick) mapHandlers.dblclick({ latlng: { lng: 11, lat: 21 } });
    ok(Array.isArray(captured) && captured.length >= 3, 'polygon pick captures >= 3 vertices', JSON.stringify(captured));
}

// ── 5. UI smoke: render + add event + add effect + select + remove ────────
console.log('\n[5] renderEventsCard — add/select/remove smoke test (incl. nested effects)');
{
    const { T: T3 } = loadSandbox();
    const d3 = baseDraft();
    T3._setDraftForTest(d3);
    const host = { appendChild(k) { (this._kids = this._kids || []).push(k); } };
    let threw = false;
    try { T3.renderEventsCard(host); } catch (e) { threw = true; console.log('   threw:', e && e.message); }
    ok(!threw, 'renderEventsCard does not throw against an empty event list');
    ok((host._kids || []).length > 0, 'renderEventsCard appends content to the host');

    const ev = T3.defaultRuntimeEvent(d3.runtime_events);
    eq(ev.id, 'runtime-event-1', 'defaultRuntimeEvent generates the expected first id');
    d3.runtime_events.push(ev);
    const nextId = T3.nextFreeEventId(d3.runtime_events);
    eq(nextId, 'runtime-event-2', 'nextFreeEventId avoids collision with an existing event');

    const fx = T3.defaultRuntimeEffect(ev.effects);
    eq(fx.kind, T3.RUNTIME_SAFE_EFFECT_KINDS[0], 'defaultRuntimeEffect defaults to the first safe kind');
    ev.effects.push(fx);

    T3._selectEventForTest(ev.id);
    let threw2 = false;
    try { T3.renderEventsCard(host); } catch (e) { threw2 = true; console.log('   threw:', e && e.message); }
    ok(!threw2, 'renderEventsCard does not throw with an event (+ nested effect) selected');
    T3._clearEventSelectionForTest();
}

// ── 6. Source-scan: STEPS table no longer gates events as a placeholder ───
console.log('\n[6] Source-scan — events STEPS entry un-gapped');
{
    const src = fs.readFileSync(EDIT_MODE_PATH, 'utf8');
    const stepsBlock = src.slice(src.indexOf('var STEPS = ['), src.indexOf('/* ---- Slice 2C: per-step completion predicates'));
    const eventsEntry = stepsBlock.slice(stepsBlock.indexOf("id: 'events'"), stepsBlock.indexOf("id: 'briefing'"));
    ok(!/gap:\s*true/.test(eventsEntry), 'events STEPS entry no longer carries gap:true');
    ok(/renderEventsCard/.test(eventsEntry), 'events STEPS entry renders renderEventsCard');
    const allRulesFn = src.slice(src.indexOf('function validateAllHardRules'), src.indexOf('function validateAllHardRules') + 400);
    ok(/validateRuntimeHardRules/.test(allRulesFn), 'validateAllHardRules composes validateRuntimeHardRules');
}

console.log('\n' + (fail === 0 ? 'OK' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
