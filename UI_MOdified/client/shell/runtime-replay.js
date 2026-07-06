/* ============================================================================
 * runtime-replay.js - RMOOZ C4g runtime replay/AAR builder
 * ----------------------------------------------------------------------------
 * Pure read-only reconstruction from durable runtime_journal records.
 * No DOM, map, scenario, storage, or backend side effects.
 * ========================================================================== */
(function (root) {
    'use strict';

    var VERSION = '1.0.0-rmooz-runtime-replay-c4g';
    var JOURNAL_SCHEMA = 'runtime-events-journal-v1';

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
    function text(v) {
        return v == null ? '' : String(v);
    }
    function firstString(values) {
        for (var i = 0; i < values.length; i += 1) {
            if (values[i] != null && String(values[i])) return String(values[i]);
        }
        return null;
    }
    function runtimePayload(row) {
        row = obj(row);
        if (row.mods && row.mods.runtime_journal && typeof row.mods.runtime_journal === 'object') return row.mods.runtime_journal;
        if (row.runtime_journal && typeof row.runtime_journal === 'object') return row.runtime_journal;
        if (row.schema_version === JOURNAL_SCHEMA || row.source === 'runtime-events') return row;
        return null;
    }
    function effectKey(effect) {
        effect = obj(effect);
        var payload = obj(effect.payload);
        return [
            effect.effect_id || effect.id || '',
            effect.kind || '',
            effect.status || '',
            effect.reason || '',
            payload.key || payload.flag || payload.id || payload.decision_point_id || payload.task_id || ''
        ].join('|');
    }
    function recordKey(payload, row, index) {
        row = obj(row);
        payload = obj(payload);
        var seq = firstString([row.seq, row.journal_seq, payload.journal_seq]);
        var runId = firstString([payload.run_id, row.run_id]);
        if (runId && seq) return 'seq:' + runId + ':' + seq;
        return [
            payload.kind || 'runtime_record',
            runId || '',
            payload.event_id || '',
            payload.decision_point_id || '',
            payload.elapsed_hours != null ? String(payload.elapsed_hours) : '',
            payload.recorded_at || '',
            obj(payload.decision).option_id || '',
            arr(payload.safe_effects_applied).map(effectKey).join(','),
            arr(payload.blocked_effects).map(effectKey).join(',')
        ].join('::') || ('input:' + index);
    }
    function hourLabel(hours) {
        var h = finite(hours);
        if (h == null) return 'Scenario time unknown';
        if (h === 0) return 'Scenario time H';
        var rounded = Math.round(h * 100) / 100;
        return 'Scenario time H' + (rounded < 0 ? '' : '+') + rounded;
    }
    function categoryFor(kind) {
        if (kind === 'runtime_event_fired') return 'runtime_event';
        if (kind === 'operator_decision_selected' || kind === 'runtime_decision_opened' || kind === 'runtime_decision_resolved') return 'operator_decision';
        if (kind === 'runtime_effect_applied_safe') return 'safe_effect';
        if (kind === 'runtime_effect_blocked') return 'blocked_effect';
        return 'runtime_record';
    }
    function labelFor(record) {
        var detail = obj(record.detail);
        var decision = obj(record.decision);
        var safe = arr(record.safe_effects_applied)[0] || null;
        var blocked = arr(record.blocked_effects)[0] || null;
        if (record.kind === 'runtime_event_fired') {
            return 'Runtime event: ' + text(detail.title || record.event_id || 'event');
        }
        if (record.kind === 'operator_decision_selected') {
            return 'Operator decision: ' + text(decision.option_label || decision.option_id || record.decision_point_id || 'selected');
        }
        if (record.kind === 'runtime_decision_opened') {
            return 'Operator decision opened: ' + text(detail.title || record.decision_point_id || 'decision');
        }
        if (record.kind === 'runtime_decision_resolved') {
            return 'Operator decision resolved: ' + text(decision.option_label || decision.option_id || record.decision_point_id || 'decision');
        }
        if (record.kind === 'runtime_effect_applied_safe') {
            return 'Runtime effect applied: ' + text((safe && safe.kind) || 'safe effect');
        }
        if (record.kind === 'runtime_effect_blocked') {
            return 'Runtime effect blocked: ' + text((blocked && blocked.kind) || 'blocked effect');
        }
        return 'Runtime record: ' + text(record.kind || 'record');
    }
    function compareRecords(a, b) {
        var ah = finite(a && a.elapsed_hours);
        var bh = finite(b && b.elapsed_hours);
        if (ah == null && bh != null) return 1;
        if (ah != null && bh == null) return -1;
        if (ah != null && bh != null && ah !== bh) return ah - bh;
        var as = finite(a && a.journal_seq);
        var bs = finite(b && b.journal_seq);
        if (as != null && bs != null && as !== bs) return as - bs;
        if (as != null && bs == null) return -1;
        if (as == null && bs != null) return 1;
        return (a && a.input_index || 0) - (b && b.input_index || 0);
    }

    function normalizeRuntimeJournalRecord(row, index) {
        var payload = runtimePayload(row);
        if (!payload) return null;
        payload = obj(payload);
        var kind = text(payload.kind || payload.action).trim();
        if (!kind) return null;
        var normalized = {
            schema_version: payload.schema_version || JOURNAL_SCHEMA,
            source: payload.source || 'runtime-events',
            kind: kind,
            action: payload.action || kind,
            category: categoryFor(kind),
            scenario_id: payload.scenario_id || null,
            scenarioName: payload.scenarioName || payload.scenario_name || null,
            run_id: payload.run_id || obj(row).run_id || null,
            event_id: payload.event_id || null,
            decision_point_id: payload.decision_point_id || null,
            operator_id: payload.operator_id || obj(row).operator_id || null,
            elapsed_hours: finite(payload.elapsed_hours),
            scenario_time_label: payload.scenario_time_label || null,
            decision: clone(payload.decision || null),
            safe_effects_applied: arr(payload.safe_effects_applied).map(clone),
            blocked_effects: arr(payload.blocked_effects).map(clone),
            detail: clone(payload.detail || null),
            recorded_at: payload.recorded_at || obj(row).ts || obj(row).timestamp || null,
            journal_seq: finite(obj(row).seq != null ? obj(row).seq : obj(row).journal_seq),
            journal_id: null,
            input_index: index || 0,
            warnings: [],
            read_only: true
        };
        if (normalized.elapsed_hours == null) normalized.warnings.push('missing_elapsed_hours');
        if (normalized.source !== 'runtime-events') normalized.warnings.push('unexpected_source');
        normalized.journal_id = firstString([payload.journal_id, obj(row).journal_id]) || recordKey(payload, row, index || 0);
        normalized.scenario_time_label = normalized.scenario_time_label || hourLabel(normalized.elapsed_hours);
        normalized.label = labelFor(normalized);
        return normalized;
    }

    function extractRuntimeJournalRecords(rows) {
        var warnings = [];
        var out = [];
        var seen = {};
        var ignored = 0;
        var duplicates = 0;
        arr(rows).forEach(function (row, index) {
            if (!runtimePayload(row)) {
                ignored++;
                return;
            }
            var rec = normalizeRuntimeJournalRecord(row, index);
            if (!rec) {
                warnings.push({ index: index, reason: 'malformed_runtime_journal_record' });
                return;
            }
            rec.warnings.forEach(function (reason) { warnings.push({ index: index, journal_id: rec.journal_id, reason: reason }); });
            if (seen[rec.journal_id]) {
                duplicates++;
                return;
            }
            seen[rec.journal_id] = true;
            out.push(rec);
        });
        out.sort(compareRecords);
        return { records: out, warnings: warnings, ignored_count: ignored, duplicate_count: duplicates, read_only: true };
    }
    function recordsFrom(input) {
        if (input && Array.isArray(input.records)) return input.records.map(clone).sort(compareRecords);
        if (Array.isArray(input)) return extractRuntimeJournalRecords(input).records;
        return [];
    }
    function timelineItem(record) {
        return {
            kind: record.kind,
            category: record.category,
            label: record.label,
            elapsed_hours: record.elapsed_hours,
            scenario_time_label: record.scenario_time_label,
            event_id: record.event_id,
            decision_point_id: record.decision_point_id,
            decision: clone(record.decision),
            safe_effects_applied: clone(record.safe_effects_applied),
            blocked_effects: clone(record.blocked_effects),
            journal_id: record.journal_id,
            journal_seq: record.journal_seq,
            read_only: true
        };
    }
    function buildRuntimeReplay(records) {
        var sorted = recordsFrom(records);
        return {
            version: VERSION,
            timeline_label: 'Runtime replay/AAR',
            records: sorted.map(clone),
            timeline: sorted.map(timelineItem),
            summary: buildRuntimeAarSummary(sorted),
            read_only: true
        };
    }
    function buildRuntimeAarSummary(records) {
        var sorted = recordsFrom(records);
        var times = sorted.map(function (r) { return finite(r.elapsed_hours); }).filter(function (v) { return v != null; });
        var summary = {
            events_fired_count: 0,
            decisions_opened_count: 0,
            decisions_selected_count: 0,
            safe_effects_applied_count: 0,
            blocked_effects_count: 0,
            first_event_time: times.length ? times[0] : null,
            last_event_time: times.length ? times[times.length - 1] : null,
            read_only: true
        };
        sorted.forEach(function (record) {
            if (record.kind === 'runtime_event_fired') summary.events_fired_count += 1;
            else if (record.kind === 'runtime_decision_opened') summary.decisions_opened_count += 1;
            else if (record.kind === 'operator_decision_selected') summary.decisions_selected_count += 1;
            if (record.kind === 'runtime_effect_applied_safe') summary.safe_effects_applied_count += Math.max(1, arr(record.safe_effects_applied).length);
            if (record.kind === 'runtime_effect_blocked') summary.blocked_effects_count += Math.max(1, arr(record.blocked_effects).length);
        });
        return summary;
    }
    function groupRuntimeReplayByTime(records) {
        var sorted = recordsFrom(records);
        var groups = [];
        var byKey = {};
        sorted.forEach(function (record) {
            var key = record.elapsed_hours == null ? 'unknown' : String(record.elapsed_hours);
            if (!byKey[key]) {
                byKey[key] = {
                    elapsed_hours: record.elapsed_hours,
                    scenario_time_label: record.scenario_time_label,
                    items: [],
                    read_only: true
                };
                groups.push(byKey[key]);
            }
            byKey[key].items.push(timelineItem(record));
        });
        return groups;
    }
    function filterRuntimeReplay(records, filters) {
        filters = obj(filters);
        var kinds = arr(filters.kinds).map(String);
        var categories = arr(filters.categories).map(String);
        return recordsFrom(records).filter(function (record) {
            if (kinds.length && kinds.indexOf(record.kind) === -1) return false;
            if (categories.length && categories.indexOf(record.category) === -1) return false;
            if (filters.event_id && record.event_id !== filters.event_id) return false;
            if (filters.decision_point_id && record.decision_point_id !== filters.decision_point_id) return false;
            if (filters.from_elapsed_hours != null && (record.elapsed_hours == null || record.elapsed_hours < +filters.from_elapsed_hours)) return false;
            if (filters.to_elapsed_hours != null && (record.elapsed_hours == null || record.elapsed_hours > +filters.to_elapsed_hours)) return false;
            return true;
        }).map(clone);
    }

    var api = {
        RUNTIME_REPLAY_VERSION: VERSION,
        normalizeRuntimeJournalRecord: normalizeRuntimeJournalRecord,
        extractRuntimeJournalRecords: extractRuntimeJournalRecords,
        buildRuntimeReplay: buildRuntimeReplay,
        buildRuntimeAarSummary: buildRuntimeAarSummary,
        groupRuntimeReplayByTime: groupRuntimeReplayByTime,
        filterRuntimeReplay: filterRuntimeReplay,
        _internal: {
            compareRecords: compareRecords,
            recordKey: recordKey
        }
    };

    root.AppRuntimeReplay = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
