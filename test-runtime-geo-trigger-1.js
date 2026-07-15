#!/usr/bin/env node
/**
 * test-runtime-geo-trigger-1.js — Batch C Slice C4
 *
 * Geo trigger zones: authored `runtime_events[].trigger_zone` was 100% inert
 * (normalized nowhere, read nowhere — confirmed by the Batch C audit). This
 * slice makes it real: an optional `trigger_type` ('time'|'geo'|'both',
 * default 'time' — every existing scenario unaffected) evaluates
 * `trigger_zone` (a closed polygon ring) against `trigger_unit_id`'s live
 * position (or ANY known position if `trigger_unit_id` is blank) via
 * turf.booleanPointInPolygon — the SAME idiom already used elsewhere in this
 * codebase (client/ui/controllers/clip-controller.js), not a new geometry
 * implementation.
 *
 * turf is vendored at UI_MOdified/lib/turf.min.js and (confirmed) is
 * directly require()-able in Node — this test injects a REAL turf instance
 * via runtime-events.js's optional geoContext.turf (the same "optional
 * injected dependency" pattern as runtime-movement.js's context.classifyUnit),
 * so this is genuine geometry evaluation, not a mocked stand-in.
 *
 * Proves:
 *   - normalizeRuntimeEvents() echoes trigger_type/trigger_zone/trigger_unit_id;
 *     trigger_type defaults to 'time' when omitted (backward compatible)
 *   - a geo-only event (trigger_type:'geo', no at_elapsed_hours at all) never
 *     fires while the referenced unit is outside the zone, and fires once it
 *     enters — bypassing the old at_elapsed_hours==null null-guard the audit
 *     flagged as blocking pure-geo events entirely
 *   - trigger_unit_id blank means ANY known position triggers it (a general
 *     area trigger), not just one specific unit
 *   - trigger_type:'both' requires BOTH the time gate and the geo gate
 *   - existing time-only events (no trigger_type authored at all) behave
 *     EXACTLY as before — unaffected by geo/positions being absent, malformed,
 *     or even by turf not being available at all (graceful, never throws)
 *   - a trigger_zone with < 3 points never fires a geo trigger (invalid ring)
 *   - `once` firing semantics are respected for geo-triggered events same as
 *     time-triggered ones
 *
 * Sibling to test-runtime-events-journal-1.js / test-runtime-events-evaluator-1.js.
 * Run: node test-runtime-geo-trigger-1.js
 */
'use strict';

const path = require('path');
const ROOT = __dirname;
const RuntimeEvents = require(path.join(ROOT, 'UI_MOdified/client/shell/runtime-events.js'));
const turf = require(path.join(ROOT, 'UI_MOdified/lib/turf.min.js'));

let pass = 0, fail = 0;
function ok(cond, label, detail) {
    if (cond) { console.log('  ok   ' + label); pass++; }
    else      { console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); fail++; }
}
function eq(a, b, label) { ok(a === b, label, 'expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a)); }

console.log('\n=== Batch C Slice C4: geo trigger zones ===\n');

// A simple square zone: lon 0..10, lat 0..10.
const SQUARE_ZONE = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
const INSIDE = [5, 5];
const OUTSIDE = [50, 50];

function scenarioWith(event) { return { name: 'geo-trigger-test', runtime_events: [event] }; }

// ── 1. normalizeRuntimeEvents echoes the new fields, defaults trigger_type ─
console.log('\n[1] normalizeRuntimeEvents echoes trigger_type/trigger_zone/trigger_unit_id');
{
    const ev = { id: 'e1', trigger_zone: SQUARE_ZONE, trigger_unit_id: 'U1', trigger_type: 'geo' };
    const norm = RuntimeEvents.normalizeRuntimeEvents(scenarioWith(ev))[0];
    eq(norm.trigger_type, 'geo', 'trigger_type echoed');
    eq(norm.trigger_unit_id, 'U1', 'trigger_unit_id echoed');
    ok(Array.isArray(norm.trigger_zone) && norm.trigger_zone.length === 5, 'trigger_zone echoed');

    const legacy = { id: 'e2', at_elapsed_hours: 3 };
    const normLegacy = RuntimeEvents.normalizeRuntimeEvents(scenarioWith(legacy))[0];
    eq(normLegacy.trigger_type, 'time', 'trigger_type defaults to "time" when omitted (backward compatible)');
    eq(normLegacy.trigger_zone.length, 0, 'trigger_zone defaults to an empty array');
    eq(normLegacy.trigger_unit_id, null, 'trigger_unit_id defaults to null');
}

// ── 2. Geo-only event fires only once the unit enters the zone ────────────
console.log('\n[2] Geo-only event (no at_elapsed_hours at all) fires purely on zone entry');
{
    const ev = { id: 'geo1', trigger_type: 'geo', trigger_unit_id: 'U1', trigger_zone: SQUARE_ZONE, once: true };
    const outside = RuntimeEvents.evaluateRuntimeEvents(scenarioWith(ev), {
        clock: { current_hours: 0 }, positions: { U1: OUTSIDE }, turf: turf
    });
    eq(outside.due_events.length, 0, 'not due while the unit is outside the zone');

    const inside = RuntimeEvents.evaluateRuntimeEvents(scenarioWith(ev), {
        clock: { current_hours: 0 }, positions: { U1: INSIDE }, turf: turf
    });
    eq(inside.due_events.length, 1, 'due once the unit enters the zone — despite having no at_elapsed_hours at all');
}

// ── 3. trigger_unit_id blank -> ANY known position triggers it ────────────
console.log('\n[3] Blank trigger_unit_id means ANY unit entering the zone fires it');
{
    const ev = { id: 'geo2', trigger_type: 'geo', trigger_zone: SQUARE_ZONE, once: true };
    const noneInside = RuntimeEvents.evaluateRuntimeEvents(scenarioWith(ev), {
        clock: { current_hours: 0 }, positions: { U1: OUTSIDE, U2: OUTSIDE }, turf: turf
    });
    eq(noneInside.due_events.length, 0, 'not due when no known unit is inside the zone');

    const oneInside = RuntimeEvents.evaluateRuntimeEvents(scenarioWith(ev), {
        clock: { current_hours: 0 }, positions: { U1: OUTSIDE, U2: INSIDE }, turf: turf
    });
    eq(oneInside.due_events.length, 1, 'due once ANY unit (here U2) is inside the zone, not just a specifically-named one');
}

// ── 4. trigger_type:'both' requires BOTH the time gate and the geo gate ───
console.log('\n[4] trigger_type "both" requires time AND geo');
{
    const ev = { id: 'both1', trigger_type: 'both', at_elapsed_hours: 5, trigger_unit_id: 'U1', trigger_zone: SQUARE_ZONE, once: true };

    const neither = RuntimeEvents.evaluateRuntimeEvents(scenarioWith(ev), { clock: { current_hours: 2 }, positions: { U1: OUTSIDE }, turf: turf });
    eq(neither.due_events.length, 0, 'not due: neither time nor geo satisfied');

    const timeOnly = RuntimeEvents.evaluateRuntimeEvents(scenarioWith(ev), { clock: { current_hours: 6 }, positions: { U1: OUTSIDE }, turf: turf });
    eq(timeOnly.due_events.length, 0, 'not due: time satisfied but unit still outside the zone');

    const geoOnly = RuntimeEvents.evaluateRuntimeEvents(scenarioWith(ev), { clock: { current_hours: 2 }, positions: { U1: INSIDE }, turf: turf });
    eq(geoOnly.due_events.length, 0, 'not due: unit inside the zone but too early');

    const both = RuntimeEvents.evaluateRuntimeEvents(scenarioWith(ev), { clock: { current_hours: 6 }, positions: { U1: INSIDE }, turf: turf });
    eq(both.due_events.length, 1, 'due only when BOTH conditions hold simultaneously');
}

// ── 5. Legacy time-only events are completely unaffected ──────────────────
console.log('\n[5] Legacy time-only events (no trigger_type authored) are unaffected by geo/turf availability');
{
    const ev = { id: 'legacy1', at_elapsed_hours: 3, once: true }; // no trigger_type at all
    const before = RuntimeEvents.evaluateRuntimeEvents(scenarioWith(ev), { clock: { current_hours: 2 } }); // no positions, no turf at all
    eq(before.due_events.length, 0, 'not due before its time, with no positions/turf supplied at all (no crash)');
    const after = RuntimeEvents.evaluateRuntimeEvents(scenarioWith(ev), { clock: { current_hours: 3 } });
    eq(after.due_events.length, 1, 'due at its time, completely independent of geo machinery');

    // Also prove a malformed/garbage trigger_zone on an unrelated time-only
    // event can never accidentally make it geo-gated.
    const ev2 = { id: 'legacy2', at_elapsed_hours: 1, trigger_zone: 'not-an-array', once: true };
    const due2 = RuntimeEvents.evaluateRuntimeEvents(scenarioWith(ev2), { clock: { current_hours: 1 }, turf: turf });
    eq(due2.due_events.length, 1, 'a garbage trigger_zone on a time-type event does not block it from firing on time');
}

// ── 6. No turf available -> geo events are inert, never throw ─────────────
console.log('\n[6] No turf instance available -> geo/both events are inert (never throw)');
{
    const ev = { id: 'geo3', trigger_type: 'geo', trigger_unit_id: 'U1', trigger_zone: SQUARE_ZONE, once: true };
    let threw = false;
    let result = null;
    try {
        result = RuntimeEvents.evaluateRuntimeEvents(scenarioWith(ev), { clock: { current_hours: 0 }, positions: { U1: INSIDE } }); // no turf injected
    } catch (e) { threw = true; }
    ok(!threw, 'evaluateRuntimeEvents does not throw when turf is unavailable');
    ok(result && result.due_events.length === 0, 'geo event is simply never due without turf (safe default, not a crash)');
}

// ── 7. A trigger_zone with < 3 points never fires a geo trigger ───────────
console.log('\n[7] Degenerate trigger_zone (< 3 points) never fires');
{
    const ev = { id: 'geo4', trigger_type: 'geo', trigger_unit_id: 'U1', trigger_zone: [[0, 0], [1, 1]], once: true };
    const result = RuntimeEvents.evaluateRuntimeEvents(scenarioWith(ev), { clock: { current_hours: 0 }, positions: { U1: [0.5, 0.5] }, turf: turf });
    eq(result.due_events.length, 0, 'a 2-point "zone" is not a valid polygon and never fires');
}

// ── 8. `once` semantics are respected for geo-triggered events too ────────
console.log('\n[8] once:true prevents re-firing a geo event across repeated evaluations');
{
    const ev = { id: 'geo5', trigger_type: 'geo', trigger_unit_id: 'U1', trigger_zone: SQUARE_ZONE, once: true };
    const first = RuntimeEvents.evaluateRuntimeEvents(scenarioWith(ev), { clock: { current_hours: 0 }, positions: { U1: INSIDE }, turf: turf });
    eq(first.due_events.length, 1, 'fires the first time the unit is inside the zone');
    const second = RuntimeEvents.evaluateRuntimeEvents(scenarioWith(ev), {
        clock: { current_hours: 1 }, positions: { U1: INSIDE }, turf: turf, fired_state: first.fired_state
    });
    eq(second.due_events.length, 0, 'does not re-fire once marked fired, even while the unit remains inside the zone');
}

console.log('\n' + (fail === 0 ? 'OK' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
