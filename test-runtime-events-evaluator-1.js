/* ============================================================================
 * test-runtime-events-evaluator-1.js
 * C4a Runtime Events Evaluator Gate
 * ----------------------------------------------------------------------------
 * Clock drives runtime events. Step index does not. C4a returns due/read-only
 * facts only; it does not execute effects or mutate scenario/world state.
 * ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const RuntimeEvents = require(path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'runtime-events.js'));
const source = fs.readFileSync(path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'runtime-events.js'), 'utf8');

let passed = 0;
let failed = 0;
function ok(label, cond) {
    if (cond) { passed += 1; console.log('  PASS  ' + label); }
    else { failed += 1; console.error('  FAIL  ' + label); }
}

function clone(v) { return JSON.parse(JSON.stringify(v)); }
function cleanSource(text) {
    return String(text || '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
}

function scenario() {
    return {
        name: 'runtime-events-c4a',
        scenario_label: 'Runtime Events C4a',
        start_time: '2026-07-06T00:00:00Z',
        runtime_scenario: {
            start_time: '2026-07-06T00:00:00Z',
            start_hours: 0,
            duration_hours: 6,
            clock_model: 'continuous'
        },
        runtime_events: [
            { id: 'h0030', at_elapsed_hours: 0.5, kind: 'intel', title: 'First contact', once: true, effects: [{ type: 'note', value: 'read-only' }] },
            { id: 'h0110', at_elapsed_hours: 1.1667, kind: 'radar_contact', title: 'Radar contact appears', once: true },
            { id: 'disabled', at_elapsed_hours: 0.25, kind: 'disabled', title: 'Disabled', enabled: false },
            { id: 'absolute-time', at_time: '2026-07-06T02:00:00Z', kind: 'phase', title: 'Absolute event' }
        ],
        mission_tasks: [
            { id: 'task-active', unit_id: 'BLUE-1', kind: 'patrol', start_elapsed_hours: 0.25, end_elapsed_hours: 1.5, objective_id: 'OBJ-A' },
            { id: 'task-late', group_id: 'CAP', kind: 'hold', start_elapsed_hours: 3, end_elapsed_hours: 4 }
        ],
        decision_points: [
            { id: 'dp-1', trigger_elapsed_hours: 1.0, title: 'Open decision', options: [{ id: 'a', label: 'A' }], expires_elapsed_hours: 2.0 }
        ],
        victory_conditions: [
            { id: 'vc-1', kind: 'hold_objective', threshold: { hours: 4 }, evaluate_at_elapsed_hours: 4, side: 'BLUE' },
            { id: 'vc-cont', kind: 'force_preservation', threshold: 0.7, continuous: true, side: 'RED' }
        ],
        steps: [
            { index: 0, elapsed_hours: 0, time_label: 'H', phase: 'START' },
            { index: 1, elapsed_hours: 2, time_label: 'H+2', phase: 'MID' },
            { index: 2, elapsed_hours: 4, time_label: 'H+4', phase: 'LATE' },
            { index: 3, elapsed_hours: 6, time_label: 'H+6', phase: 'END' }
        ]
    };
}

console.log('\n=== C4a runtime event evaluator gate ===\n');

console.log('--- C4A-EVAL-1: time-based runtime event firing ---');
(function () {
    const s = scenario();
    const before = JSON.stringify(s);
    let state = RuntimeEvents.resetRuntimeEventState();

    let r = RuntimeEvents.evaluateRuntimeEvents(s, { clock: { current_hours: 0.49, step_index: 3 }, fired_state: state });
    ok('T-1 before H+00:30 no event is due even if step_index is later', r.due_events.length === 0);

    r = RuntimeEvents.evaluateRuntimeEvents(s, { clock: { current_hours: 0.5, step_index: 0 }, fired_state: state });
    ok('T-2 H+00:30 event fires when current_hours crosses 0.5', r.due_events.map(e => e.id).includes('h0030'));

    state = RuntimeEvents.markRuntimeEventsFired(state, r.due_events, r.due_decision_points);
    r = RuntimeEvents.evaluateRuntimeEvents(s, { clock: { current_hours: 0.5, playing: false }, fired_state: state });
    ok('T-3 same once-event does not fire twice', !r.due_events.map(e => e.id).includes('h0030'));
    ok('T-4 paused/no-advance clock creates no new due events', r.due_events.length === 0);

    r = RuntimeEvents.evaluateRuntimeEvents(s, { clock: { current_hours: 1.2, playing: true }, fired_state: state });
    ok('T-5 resume continues and later event fires', r.due_events.map(e => e.id).includes('h0110'));

    const reset = RuntimeEvents.resetRuntimeEventState();
    r = RuntimeEvents.evaluateRuntimeEvents(s, { clock: { current_hours: 0.5 }, fired_state: reset });
    ok('T-6 stop/reset clears fired state so H+00:30 can fire in a new run', r.due_events.map(e => e.id).includes('h0030'));

    r = RuntimeEvents.evaluateRuntimeEvents(s, { clock: { current_hours: 0.49, step_index: 99 }, fired_state: reset });
    ok('T-7 events are selected by elapsed time, not step_index', r.due_events.length === 0);
    ok('T-8 disabled events do not fire', !RuntimeEvents.evaluateRuntimeEvents(s, { clock: { current_hours: 10 } }).due_events.map(e => e.id).includes('disabled'));
    ok('T-9 evaluator does not mutate scenario input', JSON.stringify(s) === before);
})();

console.log('\n--- C4A-EVAL-2: absolute time, missing arrays, missions, decisions, victory ---');
(function () {
    const s = scenario();
    let r = RuntimeEvents.evaluateRuntimeEvents(s, { clock: { current_hours: 2.0 } });
    ok('T-1 at_time works when start_time exists', r.due_events.map(e => e.id).includes('absolute-time'));

    r = RuntimeEvents.evaluateRuntimeEvents({ name: 'legacy' }, { clock: { current_hours: 99 } });
    ok('T-2 missing runtime_events is backward-compatible', Array.isArray(r.due_events) && r.due_events.length === 0);

    r = RuntimeEvents.evaluateRuntimeEvents(s, { clock: { current_hours: 1.0 } });
    ok('T-3 mission_tasks active window works', r.active_mission_tasks.length === 1 && r.active_mission_tasks[0].id === 'task-active');
    ok('T-4 decision_points become due by time', r.due_decision_points.length === 1 && r.due_decision_points[0].id === 'dp-1');
    ok('T-5 victory_conditions are normalized/evaluated read-only in C4a',
        r.victory_evaluations.length === 2 &&
        r.victory_evaluations.every(v => v.read_only === true && v.result === 'pending'));
    ok('T-6 next_event_hours reports the next unfired runtime event', r.next_event_hours === 1.1667);

    const dueOnly = RuntimeEvents.getDueRuntimeEvents(s, { current_hours: 0.5 }, {});
    ok('T-7 getDueRuntimeEvents facade returns due_events only', Array.isArray(dueOnly) && dueOnly.length === 1 && dueOnly[0].id === 'h0030');
})();

console.log('\n--- C4A-EVAL-3: hard boundaries ---');
(function () {
    const clean = cleanSource(source);
    ok('T-1 module exports expected pure API',
        RuntimeEvents.RUNTIME_EVENTS_VERSION === '1.0.0-rmooz-runtime-events-c4a' &&
        typeof RuntimeEvents.normalizeRuntimeEvents === 'function' &&
        typeof RuntimeEvents.evaluateRuntimeEvents === 'function' &&
        typeof RuntimeEvents.markRuntimeEventsFired === 'function' &&
        typeof RuntimeEvents.resetRuntimeEventState === 'function');
    ok('T-2 no DOM/map/unit/backend/journal effect execution',
        !/(document\.|querySelector|getElementById|AppAdjudicatorMap|applyState|window\.units|fetch\s*\(|XMLHttpRequest|localStorage|indexedDB|journal|appendJournal)/.test(clean));
})();

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
process.exit(failed ? 1 : 0);
