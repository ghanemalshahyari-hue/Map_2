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
        request_operator_decision: true,
        weapon_release: true
    };
    // Batch C Slice C9: 'move_unit' here also happens to be a kind
    // runtime-movement.js's isMovementExecutionPlan() matches (see the
    // comment there) — harmless today because blocked effects never reach
    // approved_effects/applied_effects/pending_effects (the only candidate
    // lists buildRuntimeExecutionPlans() reads below), but do not widen this
    // list's or that one's kind vocabulary without re-checking the overlap.
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
        if (!Array.isArray(st.applied_effects)) st.applied_effects = [];
        if (!Array.isArray(st.blocked_effects)) st.blocked_effects = [];
        if (!Array.isArray(st.last_effects)) st.last_effects = [];
        if (!st.journaled_ids || typeof st.journaled_ids !== 'object' || Array.isArray(st.journaled_ids)) st.journaled_ids = {};
        if (!Array.isArray(st.pending_journal_records)) st.pending_journal_records = [];
        if (st.last_journal_error === undefined) st.last_journal_error = null;
        if (!Array.isArray(st.doctrine_decisions)) st.doctrine_decisions = [];
        if (!st.pending_approvals || typeof st.pending_approvals !== 'object' || Array.isArray(st.pending_approvals)) st.pending_approvals = {};
        if (!st.approval_decisions || typeof st.approval_decisions !== 'object' || Array.isArray(st.approval_decisions)) st.approval_decisions = {};
        if (!Array.isArray(st.approved_effects)) st.approved_effects = [];
        if (!Array.isArray(st.rejected_effects)) st.rejected_effects = [];
        if (!Array.isArray(st.pending_execution_plans)) st.pending_execution_plans = [];
        if (!Array.isArray(st.blocked_execution_plans)) st.blocked_execution_plans = [];
        if (!Array.isArray(st.execution_plan_history)) st.execution_plan_history = [];
        if (!st.doctrine_journaled_ids || typeof st.doctrine_journaled_ids !== 'object' || Array.isArray(st.doctrine_journaled_ids)) st.doctrine_journaled_ids = {};
        if (!Array.isArray(st.pending_doctrine_journal_records)) st.pending_doctrine_journal_records = [];
        if (st.last_doctrine_journal_error === undefined) st.last_doctrine_journal_error = null;
        if (st.last_doctrine_journal_retry_at === undefined) st.last_doctrine_journal_retry_at = null;
        if (!isFinite(Number(st.doctrine_journal_retry_count))) st.doctrine_journal_retry_count = 0;
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
    function effectActionKind(kind) {
        return ({
            add_notification: 'notification',
            set_runtime_flag: 'runtime_flag',
            clear_runtime_flag: 'runtime_flag',
            update_mission_task_status: 'mission_task_update',
            open_decision_point: 'decision_point',
            close_decision_point: 'decision_point',
            request_operator_decision: 'decision_point',
            weapon_release: 'weapon_release'
        })[kind] || kind || 'unsupported';
    }
    function effectContext(proposal) {
        var payload = obj(proposal && proposal.payload);
        return {
            side: payload.side,
            actor_unit_id: payload.actor_unit_id || payload.unit_id || payload.shooter_unit_id,
            action_kind: effectActionKind(proposal && proposal.kind),
            target_unit_id: payload.target_unit_id,
            target_domain: payload.target_domain || payload.domain,
            target_class: payload.target_class || payload.target_domain || payload.domain,
            target_status: payload.target_status,
            hostile_confirmed: payload.hostile_confirmed,
            weapon_class: payload.weapon_class,
            range_nm: payload.range_nm,
            confidence: payload.confidence,
            sensor_quality: payload.sensor_quality,
            collateral_risk: payload.collateral_risk,
            area_id: payload.area_id,
            requested_by: payload.requested_by,
            current_hours: proposal && proposal.at_elapsed_hours,
            decision_point_id: payload.decision_point_id || payload.decision_id
        };
    }
    function doctrineApi(options) {
        options = obj(options);
        if (options.doctrine && typeof options.doctrine.evaluateDoctrineForAction === 'function') return options.doctrine;
        return root && root.AppDoctrineRules;
    }
    function hasDoctrineInputs(scenario, kind) {
        var scn = obj(scenario);
        if (kind === 'wra') return arr(scn.wra_rules).length || arr(obj(scn.runtime_scenario).wra_rules).length;
        if (kind === 'roe') return arr(scn.roe_rules).length || arr(obj(scn.runtime_scenario).roe_rules).length;
        return arr(scn.doctrine_rules).length || arr(obj(scn.runtime_scenario).doctrine_rules).length;
    }
    function mergeDoctrineResults(results) {
        var api = root && root.AppDoctrineRules;
        if (api && typeof api.buildDoctrineDecisionSummary === 'function') return api.buildDoctrineDecisionSummary(results);
        var rank = { allow: 0, require_approval: 1, block: 2 };
        var out = { decision: 'allow', reasons: [], matched_rules: [], required_authority: null, severity: 'info' };
        arr(results).forEach(function (r) {
            if (!r) return;
            if (rank[r.decision] > rank[out.decision]) out.decision = r.decision;
            out.reasons = out.reasons.concat(arr(r.reasons));
            out.matched_rules = out.matched_rules.concat(arr(r.matched_rules));
            if (!out.required_authority && r.required_authority) out.required_authority = r.required_authority;
        });
        return out;
    }
    function strongestDoctrineLayer(layers, decision) {
        var rank = { allow: 0, require_approval: 1, block: 2 };
        var desired = decision && decision.decision ? decision.decision : 'allow';
        var best = null;
        arr(layers).forEach(function (layer) {
            if (!layer || !layer.result) return;
            if (layer.result.decision !== desired) return;
            if (!best || (rank[layer.result.decision] || 0) > (rank[best.result.decision] || 0)) best = layer;
        });
        if (best) return best.source;
        return (arr(layers)[0] && arr(layers)[0].source) || 'doctrine';
    }
    function doctrineDecisionRecord(event, proposal, decision, source, status) {
        decision = decision || {};
        return {
            effect_id: proposal.effect_id,
            event_id: proposal.event_id,
            decision_point_id: obj(proposal.payload).decision_point_id || obj(proposal.payload).decision_id || null,
            doctrine_decision: decision.decision || 'allow',
            source: source || 'doctrine',
            matched_rules: clone(decision.matched_rules || []),
            reasons: clone(decision.reasons || []),
            required_authority: decision.required_authority || null,
            at_elapsed_hours: proposal.at_elapsed_hours,
            status: status || decision.decision || 'allow'
        };
    }
    function scenarioNameForJournal(scenario, options) {
        scenario = obj(scenario);
        options = obj(options);
        return options.scenarioName || options.scenario_name || scenario.name || scenario.scenarioName || scenario.scenario_name || scenario.scenario_label || null;
    }
    function scenarioIdForJournal(scenario, options) {
        scenario = obj(scenario);
        options = obj(options);
        return options.scenarioId || options.scenario_id || scenario.id || scenario.scenario_id || scenarioNameForJournal(scenario, options) || null;
    }
    function operatorIdForJournal(options) {
        options = obj(options);
        if (options.operatorId || options.operator_id) return String(options.operatorId || options.operator_id).slice(0, 80);
        try {
            var cu = root && root.AppConfig && root.AppConfig.CHAT_CONFIG && root.AppConfig.CHAT_CONFIG.currentUser;
            if (cu && cu.id) return String(cu.id).slice(0, 80);
        } catch (_) {}
        return 'operator';
    }
    function doctrineJournalKind(record) {
        var layer = record && record.source;
        var decision = record && record.doctrine_decision;
        if (layer === 'wra' && decision === 'require_approval') return 'wra_requires_approval';
        if (layer === 'roe' && decision === 'block') return 'roe_blocked';
        if (decision === 'approval_approve') return 'approval_approved';
        if (decision === 'approval_reject') return 'approval_rejected';
        if (decision === 'block') return 'doctrine_effect_blocked';
        if (decision === 'require_approval') return 'doctrine_effect_requires_approval';
        return 'doctrine_effect_allowed';
    }
    function doctrineJournalRecord(scenario, event, proposal, decisionRecord, options) {
        options = obj(options);
        var payload = obj(proposal && proposal.payload);
        var scenarioName = scenarioNameForJournal(scenario, options);
        var runId = options.runId || options.run_id || payload.run_id || ('doctrine-' + (scenarioName || 'runtime'));
        return {
            schema_version: 'doctrine-journal-v1',
            source: 'doctrine',
            kind: doctrineJournalKind(decisionRecord),
            scenario_id: scenarioIdForJournal(scenario, options),
            scenarioName: scenarioName,
            run_id: runId,
            event_id: decisionRecord.event_id,
            effect_id: decisionRecord.effect_id,
            decision_point_id: decisionRecord.decision_point_id || null,
            operator_id: operatorIdForJournal(options),
            elapsed_hours: decisionRecord.at_elapsed_hours,
            scenario_time_label: options.scenario_time_label || payload.scenario_time_label || null,
            doctrine_decision: decisionRecord.doctrine_decision,
            source_layer: decisionRecord.source || 'doctrine',
            matched_rules: clone(decisionRecord.matched_rules || []),
            reasons: clone(decisionRecord.reasons || []),
            required_authority: decisionRecord.required_authority || null,
            effect_kind: proposal.kind,
            effect_status: proposal.status
        };
    }
    function doctrineJournalId(record) {
        return [
            record && record.schema_version,
            record && record.run_id,
            record && record.event_id,
            record && record.effect_id,
            record && record.doctrine_decision,
            record && record.source_layer,
            record && record.effect_status
        ].map(function (v) { return v == null ? '' : String(v); }).join('|');
    }
    function normalizePendingDoctrineJournalRecord(record) {
        record = clone(obj(record));
        record.schema_version = record.schema_version || 'doctrine-journal-v1';
        record.source = record.source || 'doctrine';
        record.kind = record.kind || 'doctrine_effect_allowed';
        record.matched_rules = arr(record.matched_rules);
        record.reasons = arr(record.reasons);
        record.source_layer = record.source_layer || 'doctrine';
        record.doctrine_decision = record.doctrine_decision || 'allow';
        record.effect_status = record.effect_status || record.status || null;
        return record;
    }
    function browserFetch() {
        if (typeof window === 'undefined' || root !== window) return null;
        return root && typeof root.fetch === 'function' ? root.fetch.bind(root) : null;
    }
    function commitDoctrineJournalViaSim(record, options) {
        options = obj(options);
        var f = options.fetch || browserFetch();
        if (typeof f !== 'function') return null;
        if (!record || !record.scenarioName) return null;
        var headers = { 'Content-Type': 'application/json' };
        return f('/api/sim/propose', {
            method: 'POST',
            credentials: 'include',
            headers: headers,
            body: JSON.stringify({
                scenarioName: record.scenarioName,
                stepIndex: 0,
                mockMode: true,
                runId: record.run_id
            })
        }).then(function (r) {
            return (r && r.ok && typeof r.json === 'function') ? r.json() : null;
        }).then(function (prop) {
            if (!prop || !prop.proposal_id) throw new Error('doctrine_journal_propose_failed');
            return f('/api/sim/commit', {
                method: 'POST',
                credentials: 'include',
                headers: headers,
                body: JSON.stringify({
                    proposal_id: prop.proposal_id,
                    accepted_action_ids: 'ALL',
                    operator_id: record.operator_id,
                    source: 'deterministic-sim',
                    mods: { doctrine_journal: record }
                })
            }).then(function (r2) {
                return (r2 && typeof r2.json === 'function') ? r2.json() : null;
            });
        });
    }
    function rememberDoctrineJournalFailure(state, record, err) {
        state.last_doctrine_journal_error = err && err.message ? err.message : String(err || 'doctrine_journal_failed');
        state.pending_doctrine_journal_records.push(clone(record));
    }
    function journalDoctrineDecision(state, scenario, event, proposal, decisionRecord, options) {
        options = obj(options);
        if (options.doctrineJournal === false) return null;
        var record = doctrineJournalRecord(scenario, event, proposal, decisionRecord, options);
        var id = doctrineJournalId(record);
        if (state.doctrine_journaled_ids[id]) return record;
        state.doctrine_journaled_ids[id] = true;
        try {
            var writer = typeof options.journalDoctrineDecision === 'function'
                ? options.journalDoctrineDecision
                : commitDoctrineJournalViaSim;
            var result = writer(record, options);
            if (result && typeof result.then === 'function') {
                result.catch(function (err) { rememberDoctrineJournalFailure(state, record, err); });
            }
        } catch (err) {
            rememberDoctrineJournalFailure(state, record, err);
        }
        return record;
    }
    function pendingApprovalList(runtimeState) {
        var st = normalizeRuntimeEffectState(runtimeState);
        return Object.keys(st.pending_approvals).map(function (id) {
            var p = clone(st.pending_approvals[id]);
            p.approval_id = p.approval_id || id;
            return p;
        }).filter(function (p) { return p && p.status === 'requires_approval'; });
    }
    function historyItem(kind, source, item) {
        item = obj(item);
        var d = obj(item.doctrine_decision);
        return {
            kind: kind,
            source: source,
            approval_id: item.approval_id || item.effect_id || null,
            effect_id: item.effect_id || null,
            event_id: item.event_id || null,
            decision_point_id: item.decision_point_id || d.decision_point_id || null,
            effect_kind: item.effect_kind || item.kind || null,
            decision: item.selected_action || item.doctrine_decision || d.doctrine_decision || item.status || null,
            resulting_status: item.resulting_status || item.status || null,
            required_authority: item.required_authority || d.required_authority || null,
            matched_rules: clone(item.matched_rules || d.matched_rules || []),
            reason: item.reason || arr(item.reasons || d.reasons).join('; ') || null,
            scenario_time_label: item.scenario_time_label || null,
            elapsed_hours: item.decided_at_elapsed_hours != null ? item.decided_at_elapsed_hours : (item.at_elapsed_hours != null ? item.at_elapsed_hours : item.elapsed_hours),
            read_only: true
        };
    }
    function buildDoctrineApprovalHistory(runtimeState) {
        var st = normalizeRuntimeEffectState(runtimeState);
        var out = [];
        Object.keys(st.pending_approvals).forEach(function (id) {
            var p = clone(st.pending_approvals[id]);
            p.approval_id = p.approval_id || id;
            out.push(historyItem('pending_approval', 'pending_approvals', p));
        });
        Object.keys(st.approval_decisions).forEach(function (id) {
            var d = clone(st.approval_decisions[id]);
            d.approval_id = d.approval_id || id;
            out.push(historyItem(d.selected_action === 'reject' ? 'rejected' : 'approved', 'approval_decisions', d));
        });
        arr(st.doctrine_decisions).forEach(function (d) {
            out.push(historyItem('doctrine_decision', 'doctrine_decisions', d));
        });
        arr(st.blocked_effects).forEach(function (e) {
            out.push(historyItem('blocked', 'blocked_effects', e));
        });
        arr(st.approved_effects).forEach(function (e) {
            out.push(historyItem('approved_effect', 'approved_effects', e));
        });
        arr(st.rejected_effects).forEach(function (e) {
            out.push(historyItem('rejected_effect', 'rejected_effects', e));
        });
        arr(st.pending_doctrine_journal_records).forEach(function (r) {
            r = normalizePendingDoctrineJournalRecord(r);
            out.push(historyItem('pending_journal_retry', 'pending_doctrine_journal_records', {
                effect_id: r.effect_id,
                event_id: r.event_id,
                decision_point_id: r.decision_point_id,
                effect_kind: r.effect_kind,
                status: r.effect_status,
                doctrine_decision: r.doctrine_decision,
                required_authority: r.required_authority,
                matched_rules: r.matched_rules,
                reasons: r.reasons,
                scenario_time_label: r.scenario_time_label,
                elapsed_hours: r.elapsed_hours
            }));
        });
        return out;
    }
    function summarizeDoctrineApprovals(runtimeState) {
        var st = normalizeRuntimeEffectState(runtimeState);
        return {
            pending: pendingApprovalList(st).length,
            approved: arr(st.approved_effects).length,
            rejected: arr(st.rejected_effects).length,
            blocked: arr(st.blocked_effects).length,
            journal_retry_queue: arr(st.pending_doctrine_journal_records).length,
            decisions: Object.keys(st.approval_decisions).length,
            doctrine_decisions: arr(st.doctrine_decisions).length,
            read_only: true
        };
    }
    function executionPlanId(effect) {
        effect = obj(effect);
        return [
            'exec',
            effect.effect_id || effect.id || 'effect',
            effect.status || 'status',
            effect.kind || effect.effect_kind || 'kind'
        ].map(function (v) { return String(v); }).join('|');
    }
    function classifyRuntimeEffectForExecution(effect) {
        var kind = String((effect && (effect.kind || effect.effect_kind)) || '').toLowerCase();
        var safe = {
            add_notification: true,
            set_runtime_flag: true,
            clear_runtime_flag: true,
            update_mission_task_status: true,
            open_decision_point: true,
            close_decision_point: true,
            request_operator_decision: true
        };
        var dangerous = {
            move_unit: true,
            destroy_unit: true,
            mutate_unit: true,
            update_unit: true,
            damage_unit: true,
            kill_unit: true,
            set_contact: true,
            create_contact: true,
            update_contact: true,
            delete_contact: true,
            change_detection: true,
            modify_detection: true,
            weapon_release: true,
            fire_weapon: true,
            engage_unit: true,
            engage_target: true,
            mutate_map: true,
            update_map: true,
            apply_map_state: true
        };
        if (safe[kind]) return { classification: 'safe_session_only', status: 'planned', reason: 'safe runtime session effect planned only' };
        if (kind === 'runtime_movement' || kind === 'movement') return { classification: 'requires_world_state_executor', status: 'requires_executor', reason: 'movement requires runtime movement executor' };
        if (kind === 'weapon_release') return { classification: 'requires_world_state_executor', status: 'requires_executor', reason: 'weapon release requires a future world-state executor' };
        if (dangerous[kind]) return { classification: 'dangerous_blocked', status: 'blocked', reason: 'dangerous effect remains blocked pending a future executor' };
        return { classification: 'unsupported', status: 'blocked', reason: 'unsupported runtime effect execution plan' };
    }
    function buildRuntimeExecutionPlan(effect, context) {
        effect = clone(obj(effect));
        context = obj(context);
        var cls = classifyRuntimeEffectForExecution(effect);
        var approval = obj(effect.approval_decision);
        var doctrine = obj(effect.doctrine_decision);
        return {
            execution_id: context.execution_id || executionPlanId(effect),
            source_effect_id: effect.effect_id || effect.id || null,
            event_id: effect.event_id || null,
            decision_point_id: effect.decision_point_id || doctrine.decision_point_id || obj(effect.payload).decision_point_id || obj(effect.payload).decision_id || null,
            effect_kind: effect.kind || effect.effect_kind || null,
            classification: cls.classification,
            status: cls.status,
            reason: context.reason || cls.reason,
            payload: clone(effect.payload || {}),
            approved_by: approval.operator_id || context.approved_by || null,
            planned_at_elapsed_hours: context.planned_at_elapsed_hours != null ? context.planned_at_elapsed_hours : (approval.decided_at_elapsed_hours != null ? approval.decided_at_elapsed_hours : effect.at_elapsed_hours),
            scenario_time_label: context.scenario_time_label || approval.scenario_time_label || obj(effect.payload).scenario_time_label || null
        };
    }
    function shouldPlanEffect(effect) {
        var status = effect && effect.status;
        return status === 'approved_safe' || status === 'approved_pending_execution' ||
            status === 'applied_safe' || status === 'pending_effect_execution';
    }
    function buildRuntimeExecutionPlans(runtimeState, context) {
        var state = normalizeRuntimeEffectState(runtimeState);
        context = obj(context);
        var existing = {};
        arr(state.execution_plan_history).concat(arr(state.pending_execution_plans), arr(state.blocked_execution_plans)).forEach(function (p) {
            if (p && p.execution_id) existing[p.execution_id] = true;
        });
        var candidates = []
            .concat(arr(state.approved_effects))
            .concat(arr(state.applied_effects))
            .concat(arr(state.pending_effects));
        var plans = [];
        candidates.forEach(function (effect) {
            if (!effect || !shouldPlanEffect(effect)) return;
            var plan = buildRuntimeExecutionPlan(effect, context);
            if (existing[plan.execution_id]) return;
            existing[plan.execution_id] = true;
            plans.push(plan);
            state.execution_plan_history.push(plan);
            if (plan.status === 'planned' || plan.status === 'requires_executor') state.pending_execution_plans.push(plan);
            else state.blocked_execution_plans.push(plan);
        });
        return { state: state, plans: plans, read_only: true };
    }
    function summarizeRuntimeExecutionPlans(runtimeState) {
        var st = normalizeRuntimeEffectState(runtimeState);
        var all = arr(st.execution_plan_history);
        return {
            pending: arr(st.pending_execution_plans).length,
            blocked: arr(st.blocked_execution_plans).length,
            history: all.length,
            last_execution_plan: all.length ? clone(all[all.length - 1]) : null,
            read_only: true
        };
    }
    function approvalResultStatus(effect) {
        var kind = effect && effect.kind;
        if (kind === 'add_notification' || kind === 'set_runtime_flag' || kind === 'clear_runtime_flag' ||
            kind === 'open_decision_point' || kind === 'close_decision_point' || kind === 'update_mission_task_status') {
            return 'approved_safe';
        }
        return 'approved_pending_execution';
    }
    function approvalRecordFor(effect, selectedAction, options) {
        effect = obj(effect);
        options = obj(options);
        var rec = obj(effect.doctrine_decision);
        var payload = obj(effect.payload);
        var approvalId = effect.approval_id || effect.effect_id || options.approval_id || null;
        var result = selectedAction === 'approve' ? approvalResultStatus(effect) : 'rejected';
        return {
            approval_id: approvalId,
            effect_id: effect.effect_id || null,
            event_id: effect.event_id || null,
            decision_point_id: rec.decision_point_id || payload.decision_point_id || payload.decision_id || null,
            operator_id: operatorIdForJournal(options),
            selected_action: selectedAction,
            decided_at_elapsed_hours: options.decided_at_elapsed_hours != null ? options.decided_at_elapsed_hours : effect.at_elapsed_hours,
            scenario_time_label: options.scenario_time_label || payload.scenario_time_label || null,
            reason: effect.reason || arr(rec.reasons).join('; ') || null,
            required_authority: rec.required_authority || null,
            matched_rules: clone(rec.matched_rules || []),
            effect_kind: effect.kind || null,
            resulting_status: result
        };
    }
    function journalApprovalDecision(state, approvalRecord, effect, options) {
        options = obj(options);
        var rec = {
            effect_id: approvalRecord.effect_id,
            event_id: approvalRecord.event_id,
            decision_point_id: approvalRecord.decision_point_id,
            doctrine_decision: approvalRecord.selected_action === 'approve' ? 'approval_approve' : 'approval_reject',
            source: obj(effect && effect.doctrine_decision).source || 'doctrine',
            matched_rules: clone(approvalRecord.matched_rules || []),
            reasons: [approvalRecord.reason || approvalRecord.selected_action],
            required_authority: approvalRecord.required_authority || null,
            at_elapsed_hours: approvalRecord.decided_at_elapsed_hours,
            status: approvalRecord.resulting_status
        };
        var finalEffect = clone(effect || {});
        finalEffect.status = approvalRecord.resulting_status;
        finalEffect.reason = approvalRecord.reason;
        journalDoctrineDecision(state, options.scenario || {}, { id: approvalRecord.event_id, at_elapsed_hours: approvalRecord.decided_at_elapsed_hours }, finalEffect, rec, options);
    }
    function decideRuntimeApproval(runtimeState, approvalId, selectedAction, options) {
        var state = normalizeRuntimeEffectState(runtimeState);
        var action = selectedAction === 'reject' ? 'reject' : 'approve';
        var id = approvalId != null ? String(approvalId) : '';
        var effect = state.pending_approvals[id] || null;
        if (!effect) {
            return { state: state, approval: null, status: 'not_found', read_only: true };
        }
        if (effect.status === 'blocked') {
            return { state: state, approval: null, status: 'blocked_not_approvable', read_only: true };
        }
        if (state.approval_decisions[id]) {
            return { state: state, approval: state.approval_decisions[id], status: 'duplicate', read_only: true };
        }
        var approval = approvalRecordFor(effect, action, Object.assign({}, obj(options), { approval_id: id }));
        var finalEffect = clone(effect);
        finalEffect.status = approval.resulting_status;
        finalEffect.approval_decision = clone(approval);
        state.approval_decisions[id] = approval;
        delete state.pending_approvals[id];
        state.pending_effects = arr(state.pending_effects).map(function (p) {
            return p && p.effect_id === finalEffect.effect_id ? clone(finalEffect) : p;
        });
        if (action === 'approve') {
            state.approved_effects.push(finalEffect);
            // Batch C Slice C5: actually apply the mutation now — previously
            // approval only relabeled status + journaled, never re-entering
            // the mutation logic, so a doctrine-gated safe effect was
            // approved-and-forgotten (flag never set / decision point never
            // opened / task status never updated). weapon_release is
            // deliberately excluded (MUTABLE_SAFE_EFFECT_KINDS omits it) —
            // it stays pending_effect_execution regardless of approval.
            if (MUTABLE_SAFE_EFFECT_KINDS[finalEffect.kind]) {
                applyEffectMutation(state, finalEffect.kind, obj(finalEffect.payload), finalEffect);
            }
        } else {
            state.rejected_effects.push(finalEffect);
        }
        state.last_effects.push(finalEffect);
        journalApprovalDecision(state, approval, effect, options);
        if (typeof obj(options).operatorLog === 'function') {
            try { options.operatorLog(approval, finalEffect); } catch (_) {}
        }
        return { state: state, approval: approval, effect: finalEffect, status: 'recorded', read_only: true };
    }
    function retryPendingDoctrineJournalRecords(runtimeState, options) {
        var state = normalizeRuntimeEffectState(runtimeState);
        options = obj(options);
        var writer = typeof options.journalDoctrineDecision === 'function'
            ? options.journalDoctrineDecision
            : commitDoctrineJournalViaSim;
        var queued = arr(state.pending_doctrine_journal_records).map(normalizePendingDoctrineJournalRecord);
        var remaining = [];
        var attempted = 0;
        var succeeded = 0;
        var failed = 0;
        state.last_doctrine_journal_retry_at = new Date().toISOString();
        state.doctrine_journal_retry_count += 1;
        queued.forEach(function (record) {
            var id = doctrineJournalId(record);
            if (state.doctrine_journaled_ids[id]) return;
            attempted += 1;
            try {
                var result = writer(record, options);
                if (result && typeof result.then === 'function') {
                    remaining.push(record);
                    result.then(function () {
                        state.doctrine_journaled_ids[id] = true;
                        state.pending_doctrine_journal_records = arr(state.pending_doctrine_journal_records).filter(function (r) {
                            return doctrineJournalId(normalizePendingDoctrineJournalRecord(r)) !== id;
                        });
                    }).catch(function (err) {
                        state.last_doctrine_journal_error = err && err.message ? err.message : String(err || 'doctrine_journal_retry_failed');
                    });
                } else {
                    state.doctrine_journaled_ids[id] = true;
                    succeeded += 1;
                }
            } catch (err) {
                failed += 1;
                state.last_doctrine_journal_error = err && err.message ? err.message : String(err || 'doctrine_journal_retry_failed');
                remaining.push(record);
            }
        });
        state.pending_doctrine_journal_records = remaining;
        if (!failed) state.last_doctrine_journal_error = null;
        return { state: state, attempted: attempted, succeeded: succeeded, failed: failed, queued: remaining.length, read_only: true };
    }
    function gateRuntimeEffectWithDoctrine(state, event, proposal, options) {
        var scenario = obj(obj(options).scenario || obj(event).scenario);
        var api = doctrineApi(options);
        if (!api || !scenario || (!hasDoctrineInputs(scenario, 'doctrine') && !hasDoctrineInputs(scenario, 'roe') && !hasDoctrineInputs(scenario, 'wra') && proposal.kind !== 'weapon_release')) {
            return { proposal: proposal, blocked: false, approval: false };
        }
        var ctx = effectContext(proposal);
        var decisions = [];
        var layers = [];
        if (typeof api.evaluateDoctrineForAction === 'function') {
            var d = api.evaluateDoctrineForAction(scenario, ctx, state);
            if (d && d.matched_rules && d.matched_rules.length) { decisions.push(d); layers.push({ source: 'doctrine', result: d }); }
        }
        if ((proposal.kind === 'weapon_release' || hasDoctrineInputs(scenario, 'roe')) && typeof api.evaluateRoeForEngagement === 'function') {
            var r = api.evaluateRoeForEngagement(scenario, ctx, state);
            if (r && r.matched_rules && r.matched_rules.length) { decisions.push(r); layers.push({ source: 'roe', result: r }); }
        }
        if (proposal.kind === 'weapon_release' && typeof api.evaluateWraForWeaponRelease === 'function') {
            var w = api.evaluateWraForWeaponRelease(scenario, ctx, state);
            if (w) { decisions.push(w); layers.push({ source: 'wra', result: w }); }
        }
        if (!decisions.length) return { proposal: proposal, blocked: false, approval: false };
        var decision = mergeDoctrineResults(decisions);
        var source = strongestDoctrineLayer(layers, decision);
        var rec = doctrineDecisionRecord(event, proposal, decision, source, decision.decision);
        state.doctrine_decisions.push(rec);
        if (decision.decision === 'block') {
            var blocked = finalEffectProposal(proposal, 'blocked', 'doctrine_gate_blocked: ' + (decision.reasons || []).join('; '));
            blocked.doctrine_decision = rec;
            journalDoctrineDecision(state, scenario, event, blocked, rec, options);
            return { proposal: blocked, blocked: true, approval: false };
        }
        if (decision.decision === 'require_approval') {
            var approval = finalEffectProposal(proposal, 'requires_approval', 'doctrine_gate_requires_approval: ' + (decision.reasons || []).join('; '));
            approval.doctrine_decision = rec;
            state.pending_approvals[approval.effect_id || ('effect-' + state.doctrine_decisions.length)] = approval;
            state.pending_effects.push(approval);
            journalDoctrineDecision(state, scenario, event, approval, rec, options);
            return { proposal: approval, blocked: false, approval: true };
        }
        var allowed = clone(proposal);
        allowed.doctrine_decision = rec;
        return { proposal: allowed, blocked: false, approval: false };
    }
    // Batch C Slice C5: the kind-specific mutation logic, extracted so
    // decideRuntimeApproval() can invoke the SAME code post-approval.
    // Previously, an effect that required doctrine approval was, once the
    // operator clicked Approve, only relabeled to 'approved_safe'/
    // 'approved_pending_execution' and journaled — the underlying
    // runtime_flags/open_decision_points/mission_task_status write never
    // happened (approved-and-forgotten). `add_notification`/
    // `request_operator_decision`/`weapon_release` are deliberately NOT
    // routed through here: `add_notification` has no state to mutate,
    // `request_operator_decision` always opens its decision point and never
    // blocks on a missing id (a different contract than open_decision_point),
    // and `weapon_release` stays `pending_effect_execution` forever — no
    // executor exists for it (Locked Decision 8), approved or not.
    function applyEffectMutation(state, kind, payload, proposal) {
        if (kind === 'set_runtime_flag') {
            var setKey = firstString(payload, ['key', 'flag', 'name', 'id']);
            if (!setKey) return { ok: false, reason: 'missing_runtime_flag_key' };
            state.runtime_flags[setKey] = payload.value !== undefined ? clone(payload.value) : true;
            return { ok: true };
        }
        if (kind === 'clear_runtime_flag') {
            var clearKey = firstString(payload, ['key', 'flag', 'name', 'id']);
            if (!clearKey) return { ok: false, reason: 'missing_runtime_flag_key' };
            delete state.runtime_flags[clearKey];
            return { ok: true };
        }
        if (kind === 'open_decision_point') {
            var openId = firstString(payload, ['decision_point_id', 'decision_id', 'id']);
            if (!openId) return { ok: false, reason: 'missing_decision_point_id' };
            state.open_decision_points[openId] = {
                status: 'open',
                event_id: proposal.event_id,
                effect_id: proposal.effect_id,
                title: payload.title || payload.label || null,
                prompt: payload.prompt || payload.message || null,
                options: arr(payload.options || payload.choices).map(function (option) { return clone(option); }),
                at_elapsed_hours: proposal.at_elapsed_hours
            };
            return { ok: true };
        }
        if (kind === 'close_decision_point') {
            var closeId = firstString(payload, ['decision_point_id', 'decision_id', 'id']);
            if (!closeId) return { ok: false, reason: 'missing_decision_point_id' };
            state.open_decision_points[closeId] = {
                status: 'closed',
                event_id: proposal.event_id,
                effect_id: proposal.effect_id,
                at_elapsed_hours: proposal.at_elapsed_hours
            };
            return { ok: true };
        }
        if (kind === 'update_mission_task_status') {
            var taskId = firstString(payload, ['mission_task_id', 'task_id', 'id']);
            var mtStatus = firstString(payload, ['status', 'runtime_status']);
            if (!taskId) return { ok: false, reason: 'missing_mission_task_id' };
            if (!mtStatus) return { ok: false, reason: 'missing_mission_task_status' };
            state.mission_task_status[taskId] = {
                status: mtStatus,
                event_id: proposal.event_id,
                effect_id: proposal.effect_id,
                at_elapsed_hours: proposal.at_elapsed_hours
            };
            return { ok: true };
        }
        return { ok: false, reason: 'no_mutation_for_kind' };
    }
    var MUTABLE_SAFE_EFFECT_KINDS = {
        set_runtime_flag: true, clear_runtime_flag: true, open_decision_point: true,
        close_decision_point: true, update_mission_task_status: true
    };
    function applySafeRuntimeEventEffects(runtimeState, event, effects, options) {
        event = clone(obj(event));
        if (effects !== undefined) event.effects = effects;
        options = obj(options);
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

            var gate = gateRuntimeEffectWithDoctrine(state, event, proposal, options);
            if (gate.blocked || gate.approval) {
                finalProposal = gate.proposal;
                if (gate.blocked) state.blocked_effects.push(finalProposal);
                state.last_effects.push(finalProposal);
                finalEffects.push(finalProposal);
                return;
            }
            proposal = gate.proposal || proposal;

            if (kind === 'add_notification') {
                finalProposal = finalEffectProposal(proposal, 'applied_safe');
            } else if (MUTABLE_SAFE_EFFECT_KINDS[kind]) {
                var mutRes = applyEffectMutation(state, kind, payload, proposal);
                finalProposal = mutRes.ok ? finalEffectProposal(proposal, 'applied_safe') : blockedFinalProposal(proposal, mutRes.reason);
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
            } else if (kind === 'weapon_release') {
                var release = finalEffectProposal(proposal, 'pending_effect_execution', 'weapon_release_approved_for_later_execution');
                state.pending_effects.push(release);
                finalProposal = release;
            } else {
                finalProposal = blockedFinalProposal(proposal, unsafeRuntimeEffectReason(kind));
            }

            if (finalProposal.status === 'blocked') state.blocked_effects.push(finalProposal);
            else if (finalProposal.status === 'applied_safe') state.applied_effects.push(finalProposal);
            if (proposal.doctrine_decision &&
                (finalProposal.status === 'applied_safe' || finalProposal.status === 'pending_effect_execution' || finalProposal.status === 'proposed')) {
                finalProposal.doctrine_decision = proposal.doctrine_decision;
                journalDoctrineDecision(state, options.scenario || obj(event).scenario, event, finalProposal, proposal.doctrine_decision, options);
            }
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
                // Batch C Slice C4: trigger_zone was authored (a closed
                // polygon ring) but never read by any evaluator — 100% inert.
                // trigger_type opts an event into geo/both gating; 'time'
                // (default) preserves every existing scenario's behavior
                // unchanged. trigger_unit_id names which entity's live
                // position is tested against the zone; omitted = ANY known
                // position (a general area trigger).
                trigger_type: (raw.trigger_type === 'geo' || raw.trigger_type === 'both') ? raw.trigger_type : 'time',
                trigger_zone: Array.isArray(raw.trigger_zone) ? clone(raw.trigger_zone) : [],
                trigger_unit_id: raw.trigger_unit_id || null,
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
                // Batch C Slice C2: explicit member list for group movement —
                // resolves group_id (which has no membership registry
                // anywhere in the codebase) the same way the SCC's manual
                // group-movement form already does: an authored unit_ids[].
                unit_ids: Array.isArray(raw.unit_ids) ? raw.unit_ids.map(String).filter(Boolean) : [],
                kind: raw.kind || 'task',
                start_elapsed_hours: firstFinite([raw.start_elapsed_hours, raw.start_hours, raw.at_elapsed_hours]),
                end_elapsed_hours: firstFinite([raw.end_elapsed_hours, raw.end_hours]),
                objective_id: raw.objective_id || null,
                status: raw.status || 'planned',
                enabled: raw.enabled !== false,
                source: raw.source || 'scenario',
                // Batch C: route is now a real runtime input (drives
                // mission-task movement in free-fight-demo.js), not just an
                // authoring-only field — echoed through unvalidated; the
                // movement engine's own parseTaskRoutePoints normalizes it.
                route: Array.isArray(raw.route) ? clone(raw.route) : [],
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

    // Batch C Slice C4: reuses the turf.booleanPointInPolygon idiom already
    // used elsewhere in this codebase (client/ui/controllers/clip-controller.js)
    // rather than a new geometry implementation. turf is resolved from an
    // injected geoContext.turf first (keeps this module pure/testable in
    // Node, same "optional injected dependency" pattern as
    // runtime-movement.js's context.classifyUnit), falling back to the
    // browser global (root.turf, i.e. window.turf) in production.
    function resolveTurf(geoContext) {
        if (geoContext && geoContext.turf) return geoContext.turf;
        return (root && root.turf) || null;
    }
    function pointInZone(point, zone, turfLib) {
        if (!Array.isArray(point) || point.length < 2 || !isFinite(+point[0]) || !isFinite(+point[1])) return false;
        if (!Array.isArray(zone) || zone.length < 3) return false;
        if (!turfLib || typeof turfLib.booleanPointInPolygon !== 'function' || typeof turfLib.point !== 'function') return false;
        var ring = zone.map(function (p) { return [+p[0], +p[1]]; });
        var first = ring[0], last = ring[ring.length - 1];
        if (first[0] !== last[0] || first[1] !== last[1]) ring = ring.concat([[first[0], first[1]]]);
        try {
            var pt = turfLib.point([+point[0], +point[1]]);
            var poly = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } };
            return !!turfLib.booleanPointInPolygon(pt, poly);
        } catch (_) { return false; }
    }
    function geoTriggerDue(event, geoContext) {
        if (!Array.isArray(event.trigger_zone) || event.trigger_zone.length < 3) return false;
        var turfLib = resolveTurf(geoContext);
        if (!turfLib) return false;
        var positions = (geoContext && geoContext.positions && typeof geoContext.positions === 'object') ? geoContext.positions : {};
        if (event.trigger_unit_id) return pointInZone(positions[event.trigger_unit_id], event.trigger_zone, turfLib);
        return Object.keys(positions).some(function (uid) { return pointInZone(positions[uid], event.trigger_zone, turfLib); });
    }
    function dueRuntimeEvents(scenario, currentHours, firedState, geoContext) {
        var fired = normalizeFiredState(firedState).runtime_events;
        return normalizeRuntimeEvents(scenario).filter(function (event) {
            if (!event.enabled) return false;
            if (event.once && fired[event.id]) return false;
            var timeDue = event.at_elapsed_hours != null && currentHours != null && currentHours >= event.at_elapsed_hours;
            if (event.trigger_type === 'geo') return geoTriggerDue(event, geoContext);
            if (event.trigger_type === 'both') return timeDue && geoTriggerDue(event, geoContext);
            return timeDue; // 'time' (default) — every existing scenario's behavior, unchanged
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
        // Batch C Slice C4: live unit/objective positions + an optional
        // injected turf instance, so geo/both-triggered events can be
        // evaluated. Caller-supplied runtimeState.positions is the SAME
        // runtime_positions overlay free-fight-demo.js already maintains —
        // no new position-tracking concept.
        var geoContext = { positions: (runtimeState.positions || runtimeState.runtime_positions || {}), turf: runtimeState.turf };
        var dueEvents = dueRuntimeEvents(scenario, current, fired, geoContext);
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
        // Batch C Slice C1: was computed and returned inside
        // evaluateRuntimeEvents()'s result object but never exported on its
        // own, so no caller outside this module could ever invoke it
        // directly — free-fight-demo.js's new mission-task movement tick
        // needs to call it standalone (it doesn't want the rest of
        // evaluateRuntimeEvents's due-event/decision-point side effects).
        activeMissionTasks: activeMissionTasks,
        evaluateRuntimeEvents: evaluateRuntimeEvents,
        getDueRuntimeEvents: getDueRuntimeEvents,
        markRuntimeEventsFired: markRuntimeEventsFired,
        resetRuntimeEventState: resetRuntimeEventState,
        normalizeRuntimeEffects: normalizeRuntimeEffects,
        evaluateRuntimeEventEffects: evaluateRuntimeEventEffects,
        applySafeRuntimeEventEffects: applySafeRuntimeEventEffects,
        pendingApprovalList: pendingApprovalList,
        decideRuntimeApproval: decideRuntimeApproval,
        buildDoctrineApprovalHistory: buildDoctrineApprovalHistory,
        summarizeDoctrineApprovals: summarizeDoctrineApprovals,
        normalizePendingDoctrineJournalRecord: normalizePendingDoctrineJournalRecord,
        retryPendingDoctrineJournalRecords: retryPendingDoctrineJournalRecords,
        classifyRuntimeEffectForExecution: classifyRuntimeEffectForExecution,
        buildRuntimeExecutionPlan: buildRuntimeExecutionPlan,
        buildRuntimeExecutionPlans: buildRuntimeExecutionPlans,
        summarizeRuntimeExecutionPlans: summarizeRuntimeExecutionPlans,
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
