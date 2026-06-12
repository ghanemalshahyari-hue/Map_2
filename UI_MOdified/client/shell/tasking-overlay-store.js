/**
 * tasking-overlay-store.js — G-4-B pure Unit Tasking Mode overlay store
 *
 * Design gate: docs/g4-unit-tasking-mode-design.md
 *
 * Pure utility only:
 * - no DOM
 * - no storage
 * - no backend
 * - no world-state baseline mutation
 * - no imported source mutation
 * - no final units, placement, movement, readiness, or posture writes
 */
(function (root) {
    'use strict';

    var SCHEMA = 'rmooz.g4.tasking_overlay.v1';
    var ALLOWED_TASKING_FIELDS = [
        'action_component',
        'action_what',
        'action_why',
        'action_intended_effect',
        'action_doctrine_cited'
    ];
    var ALLOWED_TOP_FIELDS = [
        'candidate_id',
        'unit_uid',
        'side',
        'step_index',
        'phase',
        'tasking'
    ];
    var FORBIDDEN_FIELDS = [
        'assigned_objective',
        'assigned_objective_id',
        'objective_id',
        'objective_name',
        'readiness',
        'posture',
        'movement_order',
        'movement_orders',
        'order_route',
        'route',
        'routes',
        'coord',
        'coords',
        'coordinate',
        'coordinates',
        'lat',
        'lon',
        'lng',
        'position',
        'final_units',
        'final_unit',
        'unit',
        'units',
        'placement',
        'placement_anchor',
        'placement_anchors',
        'proposed_units',
        'imported_json',
        'source_json',
        'source_mutation',
        'world_state',
        'world_state_baseline',
        'live_unit',
        'live_units'
    ];

    function clone(v) {
        return v == null ? v : JSON.parse(JSON.stringify(v));
    }
    function arr(v) { return Array.isArray(v) ? v : []; }
    function obj(v) { return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {}; }
    function nonEmpty(v) { return v != null && String(v).trim() !== ''; }
    function makeId(prefix, overlay) {
        var count = arr(overlay && overlay.change_log).length + arr(overlay && overlay.entries).length + 1;
        return prefix + '-' + String(count).padStart(4, '0');
    }
    function hasOwn(o, k) {
        return Object.prototype.hasOwnProperty.call(o, k);
    }
    function uniq(list) {
        var seen = {};
        return list.filter(function (v) {
            if (seen[v]) return false;
            seen[v] = true;
            return true;
        });
    }
    function normalizeDoctrineList(v) {
        if (Array.isArray(v)) {
            return v.map(function (x) { return String(x == null ? '' : x).trim(); }).filter(Boolean);
        }
        if (v == null || v === '') return [];
        return [String(v).trim()].filter(Boolean);
    }
    function normalizeTasking(raw) {
        var src = obj(raw);
        var out = {};
        ALLOWED_TASKING_FIELDS.forEach(function (k) {
            if (!hasOwn(src, k)) return;
            out[k] = k === 'action_doctrine_cited'
                ? normalizeDoctrineList(src[k])
                : (src[k] == null ? null : String(src[k]));
        });
        if (!hasOwn(out, 'action_doctrine_cited')) out.action_doctrine_cited = [];
        return out;
    }
    function normalizeEntryFields(raw) {
        var c = obj(raw);
        return {
            unit_uid: c.unit_uid || c.uid || null,
            side: c.side || null,
            step_index: c.step_index == null ? null : c.step_index,
            phase: c.phase == null ? null : String(c.phase),
            tasking: normalizeTasking(c.tasking || c)
        };
    }
    function forbiddenKeys(raw) {
        var found = [];
        function walk(value, path) {
            if (!value || typeof value !== 'object') return;
            Object.keys(value).forEach(function (k) {
                var nextPath = path ? path + '.' + k : k;
                if (FORBIDDEN_FIELDS.indexOf(k) >= 0) found.push(nextPath);
                walk(value[k], nextPath);
            });
        }
        walk(raw, '');
        return uniq(found);
    }
    function unknownTopKeys(raw) {
        var c = obj(raw);
        return Object.keys(c).filter(function (k) {
            if (ALLOWED_TOP_FIELDS.indexOf(k) >= 0) return false;
            if (ALLOWED_TASKING_FIELDS.indexOf(k) >= 0) return false;
            if (FORBIDDEN_FIELDS.indexOf(k) >= 0) return false;
            return true;
        });
    }
    function unknownTaskingKeys(raw) {
        var t = obj(obj(raw).tasking);
        return Object.keys(t).filter(function (k) {
            return ALLOWED_TASKING_FIELDS.indexOf(k) < 0 && FORBIDDEN_FIELDS.indexOf(k) < 0;
        });
    }
    function createOverlay(opts) {
        opts = obj(opts);
        var stamp = opts.now || null;
        return {
            schema: SCHEMA,
            scenario_draft_id: opts.scenario_draft_id || opts.draft_id || null,
            source_scenario_id: opts.source_scenario_id || null,
            created_at: stamp,
            updated_at: stamp,
            status: opts.status || 'draft',
            entries: [],
            change_log: []
        };
    }
    function validateCandidate(candidate, opts) {
        opts = obj(opts);
        var c = obj(candidate);
        var blocked = [];
        var fields = normalizeEntryFields(c);
        var forbidden = forbiddenKeys(c);
        var unknownTop = unknownTopKeys(c);
        var unknownTasking = unknownTaskingKeys(c);

        if (!nonEmpty(fields.unit_uid)) blocked.push('unit_uid_required');
        if (opts.known_unit_uids && arr(opts.known_unit_uids).indexOf(fields.unit_uid) < 0) {
            blocked.push('unit_uid_unresolved');
        }
        forbidden.forEach(function (k) { blocked.push('forbidden_field:' + k); });
        unknownTop.forEach(function (k) { blocked.push('unknown_top_field:' + k); });
        unknownTasking.forEach(function (k) { blocked.push('unknown_tasking_field:' + k); });

        return {
            ok: blocked.length === 0,
            blocked: blocked.length > 0,
            blocked_reasons: blocked,
            normalized: fields,
            allowed_fields: ALLOWED_TASKING_FIELDS.slice()
        };
    }
    function latestActiveForUnit(overlay, unitUid, stepIndex, phase) {
        var active = activeEntries(overlay);
        for (var i = active.length - 1; i >= 0; i--) {
            var e = active[i];
            if (e.unit_uid !== unitUid) continue;
            if (stepIndex != null && e.step_index !== stepIndex) continue;
            if (phase != null && e.phase !== phase) continue;
            return e;
        }
        return null;
    }
    function baselineTaskingFor(candidate, opts) {
        opts = obj(opts);
        var n = normalizeEntryFields(candidate);
        var fromCandidate = obj(candidate).before || null;
        if (fromCandidate) return normalizeTasking(fromCandidate.tasking || fromCandidate);
        var baseline = obj(opts.baseline_tasking);
        var byUid = baseline[n.unit_uid];
        if (byUid) return normalizeTasking(byUid.tasking || byUid);
        var prior = latestActiveForUnit(opts.overlay, n.unit_uid, n.step_index, n.phase);
        if (prior) return normalizeTasking(prior.tasking);
        return {};
    }
    function valuesEqual(a, b) {
        return JSON.stringify(a == null ? null : a) === JSON.stringify(b == null ? null : b);
    }
    function buildDryRunDiff(overlay, candidate, opts) {
        opts = obj(opts);
        opts.overlay = overlay;
        var validation = validateCandidate(candidate, opts);
        var n = validation.normalized;
        var before = baselineTaskingFor(candidate, opts);
        var after = normalizeTasking(n.tasking);
        var changed = [];

        ALLOWED_TASKING_FIELDS.forEach(function (field) {
            var beforeValue = hasOwn(before, field) ? before[field] : (field === 'action_doctrine_cited' ? [] : null);
            var afterValue = hasOwn(after, field) ? after[field] : beforeValue;
            if (!valuesEqual(beforeValue, afterValue)) {
                changed.push({ field: field, before: clone(beforeValue), after: clone(afterValue) });
            }
        });

        if (changed.length === 0) {
            validation.blocked = true;
            validation.ok = false;
            validation.blocked_reasons = validation.blocked_reasons.concat(['no_changes']);
        }

        return {
            candidate_id: obj(candidate).candidate_id || null,
            unit_uid: n.unit_uid,
            side: n.side,
            step_index: n.step_index,
            phase: n.phase,
            blocked: validation.blocked,
            blocked_reasons: validation.blocked_reasons,
            before: before,
            after: after,
            changes: changed,
            invariants: {
                overlay_only: true,
                baseline_mutation: false,
                live_unit_mutation: false,
                imported_source_mutation: false,
                world_state_projection_only: true
            }
        };
    }
    function appendChange(overlay, change) {
        var next = clone(overlay || createOverlay());
        next.entries = arr(next.entries);
        next.change_log = arr(next.change_log);
        next.change_log = next.change_log.concat([change]);
        next.updated_at = change.approved_at || change.reverted_at || change.created_at || next.updated_at || null;
        return next;
    }
    function approveCandidate(overlay, candidate, opts) {
        opts = obj(opts);
        var diff = buildDryRunDiff(overlay, candidate, opts);
        var approvalBlocks = [];
        if (opts.dry_run_reviewed !== true) approvalBlocks.push('dry_run_review_required');
        if (opts.approved_label !== 'Approve tasking overlay') approvalBlocks.push('approval_label_required');
        if (approvalBlocks.length) {
            diff.blocked = true;
            diff.blocked_reasons = diff.blocked_reasons.concat(approvalBlocks);
        }
        if (diff.blocked) return { ok: false, overlay: clone(overlay), diff: diff, blocked_reasons: diff.blocked_reasons };

        var stamp = opts.now || null;
        var entryId = opts.entry_id || makeId('g4-entry', overlay);
        var changeId = opts.change_id || makeId('g4-change', overlay);
        var n = normalizeEntryFields(candidate);
        var entry = {
            entry_id: entryId,
            unit_uid: n.unit_uid,
            side: n.side,
            step_index: n.step_index,
            phase: n.phase,
            tasking: diff.after,
            approval: {
                approved: true,
                approved_by: opts.approved_by || 'operator',
                approved_label: opts.approved_label,
                approved_at: stamp
            },
            source: {
                kind: 'g4_tasking_overlay',
                basis: 'operator_review',
                confidence: 'operator_approved'
            },
            supersedes_entry_id: opts.supersedes_entry_id || null,
            reverted_by_change_id: null
        };
        var change = {
            change_id: changeId,
            change_type: 'approve_overlay_entry',
            entry_id: entryId,
            unit_uid: n.unit_uid,
            step_index: n.step_index,
            phase: n.phase,
            approved_by: opts.approved_by || 'operator',
            approved_at: stamp,
            before: clone(diff.before),
            after: clone(diff.after),
            diff: clone(diff.changes),
            invariants: clone(diff.invariants)
        };
        var next = clone(overlay || createOverlay());
        next.entries = arr(next.entries).concat([entry]);
        next.change_log = arr(next.change_log).concat([change]);
        next.updated_at = stamp;
        return { ok: true, overlay: next, entry: entry, change: change, diff: diff };
    }
    function revertedEntryIds(overlay) {
        var out = {};
        arr(overlay && overlay.change_log).forEach(function (c) {
            if (!c || typeof c !== 'object') return;
            if (c.change_type === 'revert_overlay_entry' && c.entry_id) out[c.entry_id] = true;
            if (c.change_type === 'revert_all_overlay_entries') {
                arr(c.reverted_entry_ids).forEach(function (id) { out[id] = true; });
            }
        });
        return out;
    }
    function activeEntries(overlay) {
        var reverted = revertedEntryIds(overlay);
        return arr(overlay && overlay.entries).filter(function (e) {
            return e && e.entry_id && !reverted[e.entry_id];
        }).map(clone);
    }
    function revertChange(overlay, entryOrChangeId, opts) {
        opts = obj(opts);
        var active = activeEntries(overlay);
        var entry = active.find(function (e) { return e.entry_id === entryOrChangeId; });
        if (!entry) {
            var change = arr(overlay && overlay.change_log).find(function (c) { return c.change_id === entryOrChangeId; });
            if (change && change.entry_id) {
                entry = active.find(function (e) { return e.entry_id === change.entry_id; });
            }
        }
        if (!entry) return { ok: false, overlay: clone(overlay), blocked_reasons: ['entry_not_active'] };
        var stamp = opts.now || null;
        var record = {
            change_id: opts.change_id || makeId('g4-change', overlay),
            change_type: 'revert_overlay_entry',
            entry_id: entry.entry_id,
            reverts_change_id: entryOrChangeId,
            reverted_by: opts.reverted_by || 'operator',
            reverted_at: stamp,
            invariants: {
                overlay_only: true,
                baseline_mutation: false,
                imported_source_mutation: false
            }
        };
        return { ok: true, overlay: appendChange(overlay, record), change: record };
    }
    function revertAll(overlay, opts) {
        opts = obj(opts);
        var active = activeEntries(overlay);
        var stamp = opts.now || null;
        var record = {
            change_id: opts.change_id || makeId('g4-change', overlay),
            change_type: 'revert_all_overlay_entries',
            scenario_draft_id: overlay && overlay.scenario_draft_id || null,
            reverted_entry_ids: active.map(function (e) { return e.entry_id; }),
            reverted_by: opts.reverted_by || 'operator',
            reverted_at: stamp,
            invariants: {
                overlay_only: true,
                baseline_mutation: false,
                imported_source_mutation: false
            }
        };
        return { ok: true, overlay: appendChange(overlay, record), change: record };
    }
    function projectTaskingPreview(baselineTasking, overlay) {
        var out = clone(baselineTasking || {});
        activeEntries(overlay).forEach(function (e) {
            if (!e.unit_uid) return;
            out[e.unit_uid] = Object.assign({}, obj(out[e.unit_uid]), clone(e.tasking), {
                uid: e.unit_uid,
                side: e.side || (out[e.unit_uid] && out[e.unit_uid].side) || null,
                step_index: e.step_index,
                phase: e.phase,
                source: { kind: 'g4_tasking_overlay', baseline_mutation: false }
            });
        });
        return out;
    }

    var api = {
        SCHEMA: SCHEMA,
        ALLOWED_TASKING_FIELDS: ALLOWED_TASKING_FIELDS.slice(),
        FORBIDDEN_FIELDS: FORBIDDEN_FIELDS.slice(),
        createOverlay: createOverlay,
        validateCandidate: validateCandidate,
        buildDryRunDiff: buildDryRunDiff,
        approveCandidate: approveCandidate,
        activeEntries: activeEntries,
        revertChange: revertChange,
        revertAll: revertAll,
        projectTaskingPreview: projectTaskingPreview
    };

    root.AppTaskingOverlayStore = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
