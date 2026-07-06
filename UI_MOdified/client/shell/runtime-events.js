/* ============================================================================
 * runtime-events.js - RMOOZ C4a runtime event evaluator
 * ----------------------------------------------------------------------------
 * Pure runtime-event contract. Reads scenario runtime time and returns due
 * events/decision points plus read-only mission/victory summaries.
 *
 * C4a deliberately does NOT execute effects, mutate world state, write journal,
 * touch the map, call a backend, or write storage. It is the "what is due now?"
 * evaluator only. C4b owns firing notification/log plumbing; later slices own
 * any event effect execution.
 * ========================================================================== */
(function (root) {
    'use strict';

    var VERSION = '1.0.0-rmooz-runtime-events-c4a';
    var HOUR_MS = 60 * 60 * 1000;

    function obj(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
    function arr(v) { return Array.isArray(v) ? v : []; }
    function clone(v) {
        try { return JSON.parse(JSON.stringify(v)); } catch (_) {
            return Array.isArray(v) ? v.slice() : (v && typeof v === 'object' ? Object.assign({}, v) : v);
        }
    }
    function finite(v) {
        var n = Number(v);
        return isFinite(n) ? n : null;
    }
    function boolDefault(v, fallback) {
        return typeof v === 'boolean' ? v : fallback;
    }
    function scenarioStartMs(scenario) {
        var scn = obj(scenario);
        var rt = obj(scn.runtime_scenario);
        var ts = scn.start_time || rt.start_time || null;
        if (!ts) return null;
        var ms = Date.parse(ts);
        return isFinite(ms) ? ms : null;
    }
    function elapsedFromTime(scenario, atTime) {
        var start = scenarioStartMs(scenario);
        if (start == null || !atTime) return null;
        var ms = Date.parse(atTime);
        return isFinite(ms) ? ((ms - start) / HOUR_MS) : null;
    }
    function firstFinite(values) {
        for (var i = 0; i < values.length; i += 1) {
            var n = finite(values[i]);
            if (n != null) return n;
        }
        return null;
    }
    function collection(scenario, key) {
        var scn = obj(scenario);
        var rt = obj(scn.runtime_scenario);
        return arr(scn[key]).concat(arr(rt[key]));
    }
    function normalizeTags(v) {
        return arr(v).map(function (tag) { return String(tag); }).filter(Boolean);
    }
    function normalizeEffects(v) {
        return arr(v).map(function (effect) { return clone(effect); });
    }

    function normalizeFiredState(firedState) {
        var fs = obj(firedState);
        var events = {};
        var decisions = {};
        if (Array.isArray(fs.runtime_events)) {
            fs.runtime_events.forEach(function (id) { if (id != null) events[String(id)] = true; });
        } else {
            Object.keys(obj(fs.runtime_events)).forEach(function (id) { if (fs.runtime_events[id]) events[String(id)] = true; });
        }
        if (Array.isArray(fs.decision_points)) {
            fs.decision_points.forEach(function (id) { if (id != null) decisions[String(id)] = true; });
        } else {
            Object.keys(obj(fs.decision_points)).forEach(function (id) { if (fs.decision_points[id]) decisions[String(id)] = true; });
        }
        return { runtime_events: events, decision_points: decisions };
    }

    function clockHours(clockOrState) {
        var c = obj(clockOrState && clockOrState.clock ? clockOrState.clock : clockOrState);
        return firstFinite([c.current_hours, c.elapsed_hours, c.hours]);
    }

    function eventTimeHours(scenario, event) {
        return firstFinite([
            event.at_elapsed_hours,
            event.elapsed_hours,
            event.trigger_elapsed_hours
        ]) != null
            ? firstFinite([event.at_elapsed_hours, event.elapsed_hours, event.trigger_elapsed_hours])
            : elapsedFromTime(scenario, event.at_time);
    }

    function normalizeRuntimeEvents(scenario) {
        return collection(scenario, 'runtime_events').map(function (raw, idx) {
            raw = obj(raw);
            var id = raw.id != null ? String(raw.id) : 'runtime-event-' + (idx + 1);
            var atHours = eventTimeHours(scenario, raw);
            return {
                id: id,
                index: idx,
                at_elapsed_hours: atHours,
                at_time: raw.at_time || null,
                kind: raw.kind || 'runtime_event',
                title: raw.title || id,
                description: raw.description || '',
                once: boolDefault(raw.once, true),
                enabled: raw.enabled !== false,
                effects: normalizeEffects(raw.effects),
                tags: normalizeTags(raw.tags),
                source: raw.source || 'scenario',
                read_only: true
            };
        });
    }

    function normalizeMissionTasks(scenario) {
        return collection(scenario, 'mission_tasks').map(function (raw, idx) {
            raw = obj(raw);
            var id = raw.id != null ? String(raw.id) : 'mission-task-' + (idx + 1);
            return {
                id: id,
                index: idx,
                unit_id: raw.unit_id || null,
                group_id: raw.group_id || null,
                kind: raw.kind || 'task',
                start_elapsed_hours: firstFinite([raw.start_elapsed_hours, raw.start_hours, raw.at_elapsed_hours]),
                end_elapsed_hours: firstFinite([raw.end_elapsed_hours, raw.end_hours]),
                objective_id: raw.objective_id || null,
                status: raw.status || 'planned',
                enabled: raw.enabled !== false,
                source: raw.source || 'scenario',
                read_only: true
            };
        });
    }

    function normalizeDecisionPoints(scenario) {
        return collection(scenario, 'decision_points').map(function (raw, idx) {
            raw = obj(raw);
            var id = raw.id != null ? String(raw.id) : 'decision-point-' + (idx + 1);
            return {
                id: id,
                index: idx,
                trigger_elapsed_hours: firstFinite([raw.trigger_elapsed_hours, raw.at_elapsed_hours, raw.elapsed_hours]),
                title: raw.title || id,
                options: arr(raw.options).map(function (option) { return clone(option); }),
                expires_elapsed_hours: firstFinite([raw.expires_elapsed_hours, raw.expire_elapsed_hours]),
                status: raw.status || 'pending',
                enabled: raw.enabled !== false,
                source: raw.source || 'scenario',
                read_only: true
            };
        });
    }

    function normalizeVictoryConditions(scenario) {
        return collection(scenario, 'victory_conditions').map(function (raw, idx) {
            raw = obj(raw);
            var id = raw.id != null ? String(raw.id) : 'victory-condition-' + (idx + 1);
            return {
                id: id,
                index: idx,
                kind: raw.kind || 'condition',
                threshold: raw.threshold != null ? clone(raw.threshold) : null,
                evaluate_at_elapsed_hours: firstFinite([raw.evaluate_at_elapsed_hours, raw.at_elapsed_hours]),
                continuous: boolDefault(raw.continuous, raw.evaluate_at_elapsed_hours == null && raw.at_elapsed_hours == null),
                side: raw.side || null,
                status: raw.status || 'pending',
                enabled: raw.enabled !== false,
                source: raw.source || 'scenario',
                read_only: true
            };
        });
    }

    function dueRuntimeEvents(scenario, currentHours, firedState) {
        var fired = normalizeFiredState(firedState).runtime_events;
        return normalizeRuntimeEvents(scenario).filter(function (event) {
            if (!event.enabled || event.at_elapsed_hours == null) return false;
            if (event.once && fired[event.id]) return false;
            return currentHours != null && currentHours >= event.at_elapsed_hours;
        });
    }

    function dueDecisionPoints(scenario, currentHours, firedState) {
        var fired = normalizeFiredState(firedState).decision_points;
        return normalizeDecisionPoints(scenario).filter(function (point) {
            if (!point.enabled || point.trigger_elapsed_hours == null) return false;
            if (fired[point.id]) return false;
            if (point.status === 'closed' || point.status === 'resolved' || point.status === 'expired') return false;
            if (point.expires_elapsed_hours != null && currentHours > point.expires_elapsed_hours) return false;
            return currentHours != null && currentHours >= point.trigger_elapsed_hours;
        });
    }

    function activeMissionTasks(scenario, currentHours) {
        return normalizeMissionTasks(scenario).filter(function (task) {
            if (!task.enabled) return false;
            var start = task.start_elapsed_hours == null ? 0 : task.start_elapsed_hours;
            if (currentHours == null || currentHours < start) return false;
            return task.end_elapsed_hours == null || currentHours <= task.end_elapsed_hours;
        }).map(function (task) {
            var out = clone(task);
            out.active = true;
            out.runtime_status = task.status === 'complete' || task.status === 'failed' ? task.status : 'active';
            return out;
        });
    }

    function evaluateVictoryConditions(scenario, currentHours) {
        return normalizeVictoryConditions(scenario).map(function (condition) {
            var due = false;
            if (condition.enabled) {
                due = condition.continuous === true ||
                    (condition.evaluate_at_elapsed_hours != null && currentHours != null && currentHours >= condition.evaluate_at_elapsed_hours);
            }
            return {
                id: condition.id,
                kind: condition.kind,
                side: condition.side,
                threshold: clone(condition.threshold),
                evaluate_at_elapsed_hours: condition.evaluate_at_elapsed_hours,
                continuous: condition.continuous,
                status: condition.status,
                due: due,
                result: 'pending',
                read_only: true
            };
        });
    }

    function nextEventHours(scenario, currentHours, firedState) {
        var fired = normalizeFiredState(firedState).runtime_events;
        var next = null;
        normalizeRuntimeEvents(scenario).forEach(function (event) {
            if (!event.enabled || event.at_elapsed_hours == null) return;
            if (event.once && fired[event.id]) return;
            if (currentHours != null && event.at_elapsed_hours < currentHours) return;
            if (next == null || event.at_elapsed_hours < next) next = event.at_elapsed_hours;
        });
        return next;
    }

    function markRuntimeEventsFired(firedState, dueEvents, dueDecisionPointsArg) {
        var out = normalizeFiredState(firedState);
        arr(dueEvents).forEach(function (event) {
            if (event && event.id != null) out.runtime_events[String(event.id)] = true;
        });
        arr(dueDecisionPointsArg).forEach(function (point) {
            if (point && point.id != null) out.decision_points[String(point.id)] = true;
        });
        return out;
    }

    function resetRuntimeEventState() {
        return { runtime_events: {}, decision_points: {} };
    }

    function evaluateRuntimeEvents(scenario, runtimeState) {
        runtimeState = obj(runtimeState);
        var current = clockHours(runtimeState);
        if (current == null) current = 0;
        var fired = runtimeState.fired_state || runtimeState.firedState || runtimeState.fired || {};
        var dueEvents = dueRuntimeEvents(scenario, current, fired);
        var duePoints = dueDecisionPoints(scenario, current, fired);
        return {
            version: VERSION,
            current_hours: current,
            due_events: dueEvents,
            due_decision_points: duePoints,
            active_mission_tasks: activeMissionTasks(scenario, current),
            victory_evaluations: evaluateVictoryConditions(scenario, current),
            next_event_hours: nextEventHours(scenario, current, markRuntimeEventsFired(fired, dueEvents, duePoints)),
            fired_state: markRuntimeEventsFired(fired, dueEvents, duePoints),
            read_only: true
        };
    }

    function getDueRuntimeEvents(scenario, clock, firedState) {
        return evaluateRuntimeEvents(scenario, { clock: clock, fired_state: firedState }).due_events;
    }

    var api = {
        RUNTIME_EVENTS_VERSION: VERSION,
        normalizeRuntimeEvents: normalizeRuntimeEvents,
        normalizeMissionTasks: normalizeMissionTasks,
        normalizeDecisionPoints: normalizeDecisionPoints,
        normalizeVictoryConditions: normalizeVictoryConditions,
        evaluateRuntimeEvents: evaluateRuntimeEvents,
        getDueRuntimeEvents: getDueRuntimeEvents,
        markRuntimeEventsFired: markRuntimeEventsFired,
        resetRuntimeEventState: resetRuntimeEventState,
        _internal: {
            elapsedFromTime: elapsedFromTime,
            normalizeFiredState: normalizeFiredState
        }
    };

    root.AppRuntimeEvents = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
