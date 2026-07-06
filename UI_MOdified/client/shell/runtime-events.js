/* ============================================================================
 * runtime-events.js - RMOOZ C4a runtime event evaluator
 * ----------------------------------------------------------------------------
 * Pure runtime-event contract. Reads scenario runtime time and returns due
 * events/decision points plus read-only mission/victory summaries.
 *
 * C4a deliberately does NOT execute effects, mutate world state, write journal,
 * touch the map, call a backend, or write storage. It is the "what is due now?"
 * evaluator only. C4b owns firing notification/log plumbing. C4c converts
 * safe effects into explicit runtime-session proposals; later slices own any
 * world-changing effect execution.
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
    var SAFE_RUNTIME_EFFECT_KINDS = {
        add_notification: true,
        set_runtime_flag: true,
        clear_runtime_flag: true,
        open_decision_point: true,
        close_decision_point: true,
        update_mission_task_status: true,
        request_operator_decision: true
    };
    var DANGEROUS_RUNTIME_EFFECT_REASONS = {
        move_unit: 'direct_unit_mutation_blocked',
        teleport_unit: 'direct_unit_mutation_blocked',
        mutate_unit: 'direct_unit_mutation_blocked',
        update_unit: 'direct_unit_mutation_blocked',
        destroy_unit: 'direct_unit_mutation_blocked',
        damage_unit: 'direct_combat_mutation_blocked',
        kill_unit: 'direct_combat_mutation_blocked',
        engage_unit: 'direct_combat_mutation_blocked',
        engage_target: 'direct_combat_mutation_blocked',
        set_contact: 'direct_detection_or_contact_mutation_blocked',
        create_contact: 'direct_detection_or_contact_mutation_blocked',
        update_contact: 'direct_detection_or_contact_mutation_blocked',
        delete_contact: 'direct_detection_or_contact_mutation_blocked',
        change_detection: 'direct_detection_or_contact_mutation_blocked',
        modify_detection: 'direct_detection_or_contact_mutation_blocked',
        change_weapon_state: 'direct_engagement_or_weapon_mutation_blocked',
        fire_weapon: 'direct_engagement_or_weapon_mutation_blocked',
        mutate_map: 'direct_map_mutation_blocked',
        update_map: 'direct_map_mutation_blocked',
        apply_map_state: 'direct_map_mutation_blocked'
    };

    function effectKind(raw) {
        if (typeof raw === 'string') return String(raw).toLowerCase();
        raw = obj(raw);
        return String(raw.kind || raw.type || raw.effect_type || raw.action || 'unsupported').toLowerCase();
    }
    function effectPayload(raw) {
        if (typeof raw === 'string') return {};
        raw = obj(raw);
        if (raw.payload && typeof raw.payload === 'object' && !Array.isArray(raw.payload)) return clone(raw.payload);
        var payload = {};
        Object.keys(raw).forEach(function (key) {
            if (/^(id|effect_id|kind|type|effect_type|action|enabled|source)$/.test(key)) return;
            payload[key] = clone(raw[key]);
        });
        return payload;
    }
    function normalizeRuntimeEffects(event) {
        event = obj(event);
        return arr(event.effects).map(function (raw, idx) {
            raw = (typeof raw === 'string') ? { kind: raw } : obj(raw);
            var id = raw.id != null ? raw.id : (raw.effect_id != null ? raw.effect_id : ((event.id || 'runtime-event') + '-effect-' + (idx + 1)));
            return {
                id: String(id),
                index: idx,
                kind: effectKind(raw),
                enabled: raw.enabled !== false,
                payload: effectPayload(raw),
                source: raw.source || event.source || 'scenario',
                read_only: true
            };
        });
    }
    function runtimeEffectProposal(event, effect, status, reason, payload) {
        event = obj(event);
        effect = obj(effect);
        return {
            event_id: event.id != null ? String(event.id) : null,
            effect_id: effect.id != null ? String(effect.id) : null,
            kind: effect.kind || 'unsupported',
            status: status || 'proposed',
            reason: reason || null,
            payload: clone(payload !== undefined ? payload : effect.payload),
            at_elapsed_hours: firstFinite([event.at_elapsed_hours, event.elapsed_hours, event.trigger_elapsed_hours]),
            read_only: true
        };
    }
    function unsafeRuntimeEffectReason(kind) {
        kind = String(kind || 'unsupported').toLowerCase();
        return DANGEROUS_RUNTIME_EFFECT_REASONS[kind] || 'unsupported_effect_kind';
    }
    function blockUnsafeRuntimeEffect(effect, reason, context) {
        context = obj(context);
        var event = {
            id: context.event_id || null,
            at_elapsed_hours: context.at_elapsed_hours
        };
        var normalized = (effect && effect.kind && effect.id !== undefined)
            ? effect
            : normalizeRuntimeEffects({ id: event.id || 'runtime-event', effects: [effect] })[0];
        return runtimeEffectProposal(event, normalized, 'blocked', reason || unsafeRuntimeEffectReason(normalized && normalized.kind), normalized && normalized.payload);
    }
    function evaluateRuntimeEventEffects(event, runtimeState) {
        runtimeState = obj(runtimeState);
        return normalizeRuntimeEffects(event).filter(function (effect) {
            return effect && effect.enabled;
        }).map(function (effect) {
            if (SAFE_RUNTIME_EFFECT_KINDS[effect.kind]) return runtimeEffectProposal(event, effect, 'proposed', null, effect.payload);
            return runtimeEffectProposal(event, effect, 'blocked', unsafeRuntimeEffectReason(effect.kind), effect.payload);
        });
    }
    function normalizeRuntimeEffectState(runtimeState) {
        var st = clone(obj(runtimeState));
        if (!st.runtime_flags || typeof st.runtime_flags !== 'object' || Array.isArray(st.runtime_flags)) st.runtime_flags = {};
        if (!st.open_decision_points || typeof st.open_decision_points !== 'object' || Array.isArray(st.open_decision_points)) st.open_decision_points = {};
        if (!st.operator_decisions || typeof st.operator_decisions !== 'object' || Array.isArray(st.operator_decisions)) st.operator_decisions = {};
        if (!st.mission_task_status || typeof st.mission_task_status !== 'object' || Array.isArray(st.mission_task_status)) st.mission_task_status = {};
        if (!Array.isArray(st.pending_effects)) st.pending_effects = [];
        if (!Array.isArray(st.blocked_effects)) st.blocked_effects = [];
        if (!Array.isArray(st.last_effects)) st.last_effects = [];
        return st;
    }
    function firstString(payload, keys) {
        payload = obj(payload);
        for (var i = 0; i < keys.length; i += 1) {
            var v = payload[keys[i]];
            if (v != null && String(v)) return String(v);
        }
        return null;
    }
    function finalEffectProposal(proposal, status, reason, payload) {
        var out = clone(proposal);
        out.status = status;
        out.reason = reason || null;
        if (payload !== undefined) out.payload = clone(payload);
        return out;
    }
    function blockedFinalProposal(proposal, reason) {
        return finalEffectProposal(proposal, 'blocked', reason || 'invalid_effect_payload');
    }
    function applySafeRuntimeEventEffects(runtimeState, event, effects) {
        event = clone(obj(event));
        if (effects !== undefined) event.effects = effects;
        var state = normalizeRuntimeEffectState(runtimeState);
        var proposals = evaluateRuntimeEventEffects(event, state);
        var finalEffects = [];

        proposals.forEach(function (proposal) {
            var kind = proposal.kind;
            var payload = obj(proposal.payload);
            var finalProposal = null;

            if (proposal.status === 'blocked') {
                finalProposal = proposal;
                state.blocked_effects.push(finalProposal);
                state.last_effects.push(finalProposal);
                finalEffects.push(finalProposal);
                return;
            }

            if (kind === 'add_notification') {
                finalProposal = finalEffectProposal(proposal, 'applied_safe');
            } else if (kind === 'set_runtime_flag') {
                var setKey = firstString(payload, ['key', 'flag', 'name', 'id']);
                if (!setKey) finalProposal = blockedFinalProposal(proposal, 'missing_runtime_flag_key');
                else {
                    state.runtime_flags[setKey] = payload.value !== undefined ? clone(payload.value) : true;
                    finalProposal = finalEffectProposal(proposal, 'applied_safe');
                }
            } else if (kind === 'clear_runtime_flag') {
                var clearKey = firstString(payload, ['key', 'flag', 'name', 'id']);
                if (!clearKey) finalProposal = blockedFinalProposal(proposal, 'missing_runtime_flag_key');
                else {
                    delete state.runtime_flags[clearKey];
                    finalProposal = finalEffectProposal(proposal, 'applied_safe');
                }
            } else if (kind === 'open_decision_point') {
                var openId = firstString(payload, ['decision_point_id', 'decision_id', 'id']);
                if (!openId) finalProposal = blockedFinalProposal(proposal, 'missing_decision_point_id');
                else {
                    state.open_decision_points[openId] = {
                        status: 'open',
                        event_id: proposal.event_id,
                        effect_id: proposal.effect_id,
                        title: payload.title || payload.label || null,
                        prompt: payload.prompt || payload.message || null,
                        options: arr(payload.options || payload.choices).map(function (option) { return clone(option); }),
                        at_elapsed_hours: proposal.at_elapsed_hours
                    };
                    finalProposal = finalEffectProposal(proposal, 'applied_safe');
                }
            } else if (kind === 'close_decision_point') {
                var closeId = firstString(payload, ['decision_point_id', 'decision_id', 'id']);
                if (!closeId) finalProposal = blockedFinalProposal(proposal, 'missing_decision_point_id');
                else {
                    state.open_decision_points[closeId] = {
                        status: 'closed',
                        event_id: proposal.event_id,
                        effect_id: proposal.effect_id,
                        at_elapsed_hours: proposal.at_elapsed_hours
                    };
                    finalProposal = finalEffectProposal(proposal, 'applied_safe');
                }
            } else if (kind === 'update_mission_task_status') {
                var taskId = firstString(payload, ['mission_task_id', 'task_id', 'id']);
                var status = firstString(payload, ['status', 'runtime_status']);
                if (!taskId) finalProposal = blockedFinalProposal(proposal, 'missing_mission_task_id');
                else if (!status) finalProposal = blockedFinalProposal(proposal, 'missing_mission_task_status');
                else {
                    state.mission_task_status[taskId] = {
                        status: status,
                        event_id: proposal.event_id,
                        effect_id: proposal.effect_id,
                        at_elapsed_hours: proposal.at_elapsed_hours
                    };
                    finalProposal = finalEffectProposal(proposal, 'applied_safe');
                }
            } else if (kind === 'request_operator_decision') {
                var request = finalEffectProposal(proposal, 'proposed');
                var requestId = firstString(payload, ['decision_point_id', 'decision_id', 'id']) || proposal.effect_id || proposal.event_id;
                if (requestId) {
                    state.open_decision_points[requestId] = {
                        status: 'open',
                        event_id: proposal.event_id,
                        effect_id: proposal.effect_id,
                        title: payload.title || payload.label || payload.prompt || null,
                        prompt: payload.prompt || payload.message || null,
                        options: arr(payload.options || payload.choices).map(function (option) { return clone(option); }),
                        at_elapsed_hours: proposal.at_elapsed_hours
                    };
                }
                state.pending_effects.push(request);
                finalProposal = request;
            } else {
                finalProposal = blockedFinalProposal(proposal, unsafeRuntimeEffectReason(kind));
            }

            if (finalProposal.status === 'blocked') state.blocked_effects.push(finalProposal);
            state.last_effects.push(finalProposal);
            finalEffects.push(finalProposal);
        });

        return { state: state, effects: finalEffects, read_only: true };
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
        normalizeRuntimeEffects: normalizeRuntimeEffects,
        evaluateRuntimeEventEffects: evaluateRuntimeEventEffects,
        applySafeRuntimeEventEffects: applySafeRuntimeEventEffects,
        blockUnsafeRuntimeEffect: blockUnsafeRuntimeEffect,
        _internal: {
            elapsedFromTime: elapsedFromTime,
            normalizeFiredState: normalizeFiredState,
            normalizeRuntimeEffectState: normalizeRuntimeEffectState
        }
    };

    root.AppRuntimeEvents = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
