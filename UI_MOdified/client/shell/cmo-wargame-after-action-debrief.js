/* ============================================================================
 * cmo-wargame-after-action-debrief.js - CMO-WARGAME-AAR-1
 * ----------------------------------------------------------------------------
 * Read-only after-action debrief for the CMO war-game live instrumentation.
 * It interprets completed, paused, blocked, or not-authorized test runs into an
 * operator-facing debrief with evidence deltas, unresolved blockers, a timeline,
 * recommendations, checklist items, readable text, and HTML output.
 *
 * It never starts, pauses, releases, mutates doctrine/combat state, calls a
 * backend route, writes a database, or stores browser-persistent state.
 * ========================================================================== */
(function (root) {
    'use strict';

    var CMO_WARGAME_AFTER_ACTION_DEBRIEF_VERSION = '1.0.0-cmo-wargame-aar-1';

    function obj(v) { return v && typeof v === 'object' ? v : {}; }
    function arr(v) { return Array.isArray(v) ? v : []; }
    function num(v, fallback) {
        var n = Number(v);
        return isFinite(n) ? n : (fallback == null ? 0 : fallback);
    }
    function text(v, fallback) {
        var s = String(v == null ? '' : v);
        return s || (fallback || '');
    }
    function norm(v) {
        return String(v == null ? '' : v).toLowerCase().replace(/\s+/g, '_');
    }
    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }
    function uniqPush(list, item) {
        if (!item || !item.key) return;
        for (var i = 0; i < list.length; i++) {
            if (list[i].key === item.key) return;
        }
        list.push(item);
    }
    function statusClass(prefix, status) {
        return prefix + '--' + esc(status || 'pending');
    }
    function countByStatus(list) {
        var counts = { pass: 0, warn: 0, fail: 0, pending: 0, locked: 0, blocked: 0, other: 0, total: 0 };
        arr(list).forEach(function (item) {
            var st = String(obj(item).status || 'other');
            if (counts[st] == null) counts.other++;
            else counts[st]++;
            counts.total++;
        });
        return counts;
    }

    var OUTCOMES = {
        completed: {
            key: 'completed',
            label: 'Completed',
            label_ar: '\u0627\u0643\u062a\u0645\u0644\u062a',
            status: 'pass',
            detail: 'Scenario run completed with release-grade mode available.'
        },
        training_completed: {
            key: 'training_completed',
            label: 'Training completed',
            label_ar: '\u062a\u062f\u0631\u064a\u0628 \u0645\u0643\u062a\u0645\u0644',
            status: 'warn',
            detail: 'Scenario run completed, but the evidence remains training-only.'
        },
        blocked_paused: {
            key: 'blocked_paused',
            label: 'Blocked / paused',
            label_ar: '\u0645\u062a\u0648\u0642\u0641 / \u0645\u0639\u0637\u0644',
            status: 'fail',
            detail: 'Scenario Control Center reported a pause, block, or replan condition.'
        },
        not_authorized: {
            key: 'not_authorized',
            label: 'Not authorized',
            label_ar: '\u063a\u064a\u0631 \u0645\u0635\u0631\u062d',
            status: 'fail',
            detail: 'CMO readiness does not authorize a run yet.'
        },
        needs_review: {
            key: 'needs_review',
            label: 'Needs review',
            label_ar: '\u064a\u062d\u062a\u0627\u062c \u0645\u0631\u0627\u062c\u0639\u0629',
            status: 'warn',
            detail: 'The run state is not final enough for an after-action debrief.'
        }
    };

    var RELEASE_INTERPRETATIONS = {
        release_grade_candidate: {
            key: 'release_grade_candidate',
            label: 'Release-grade evidence candidate',
            label_ar: '\u0645\u0631\u0634\u062d \u0644\u0623\u062f\u0644\u0629 \u0642\u0627\u0628\u0644\u0629 \u0644\u0644\u0627\u0639\u062a\u0645\u0627\u062f',
            status: 'pass',
            detail: 'Completed run has no visible release blockers and can move to final evidence review.'
        },
        training_only_evidence: {
            key: 'training_only_evidence',
            label: 'Training-only evidence',
            label_ar: '\u0623\u062f\u0644\u0629 \u062a\u062f\u0631\u064a\u0628\u064a\u0629 \u0641\u0642\u0637',
            status: 'warn',
            detail: 'Use the run for training and rehearsal, not release-grade evidence.'
        },
        cautious_evidence: {
            key: 'cautious_evidence',
            label: 'Cautious evidence',
            label_ar: '\u0623\u062f\u0644\u0629 \u0628\u062d\u0630\u0631',
            status: 'warn',
            detail: 'Evidence can inform review, but visible warnings or blockers remain.'
        },
        not_release_grade: {
            key: 'not_release_grade',
            label: 'Not release-grade',
            label_ar: '\u0644\u064a\u0633\u062a \u0642\u0627\u0628\u0644\u0629 \u0644\u0644\u0627\u0639\u062a\u0645\u0627\u062f',
            status: 'fail',
            detail: 'The run cannot be treated as release-grade evidence.'
        }
    };

    function isComplete(state) { return norm(state) === 'scenario_complete' || norm(state) === 'complete'; }
    function isPausedOrBlocked(state) { return norm(state) === 'scenario_paused' || norm(state) === 'scenario_blocked'; }
    function isReleaseReady(state) {
        var value = norm(state);
        return value === 'ready' || value === 'release_ready' || value === 'ready_with_exceptions' || value === 'releasable' || value === 'ready_for_release';
    }
    function acceptedHandoff(value) {
        return /accept/.test(norm(value || ''));
    }
    function classifyOutcome(instrumentation) {
        instrumentation = obj(instrumentation);
        var mode = obj(instrumentation.run_mode);
        var scc = obj(instrumentation.control_center);
        var warning = obj(instrumentation.pause_abort_warning);
        var evidence = obj(instrumentation.evidence_state);
        var complete = isComplete(scc.state || evidence.scc_state || evidence.scenario_status);
        if (complete) {
            if (mode.allowed && norm(mode.key) === 'release_grade') return Object.assign({}, OUTCOMES.completed);
            return Object.assign({}, OUTCOMES.training_completed);
        }
        if (isPausedOrBlocked(scc.state || evidence.scc_state) || warning.key === 'scenario_blocked') {
            return Object.assign({}, OUTCOMES.blocked_paused);
        }
        if (!mode.allowed || warning.key === 'run_mode_blocked') return Object.assign({}, OUTCOMES.not_authorized);
        if (warning.status === 'fail') return Object.assign({}, OUTCOMES.blocked_paused);
        if (num(evidence.blocker_count, 0) > 0 || num(evidence.review_issues, 0) > 0 || warning.status === 'warn') {
            return Object.assign({}, OUTCOMES.needs_review);
        }
        return Object.assign({}, OUTCOMES.needs_review);
    }
    function classifyReleaseInterpretation(instrumentation, outcome) {
        instrumentation = obj(instrumentation);
        outcome = outcome || classifyOutcome(instrumentation);
        var mode = obj(instrumentation.run_mode);
        var warning = obj(instrumentation.pause_abort_warning);
        var evidence = obj(instrumentation.evidence_state);
        var blockerCount = num(evidence.blocker_count, 0);
        var reviewIssues = num(evidence.review_issues, 0);
        var releaseReady = isReleaseReady(evidence.release_status);
        var handoffAccepted = acceptedHandoff(evidence.handoff_decision);
        if (outcome.key === 'completed' && norm(mode.key) === 'release_grade' && blockerCount === 0 && reviewIssues === 0 && releaseReady && handoffAccepted) {
            return Object.assign({}, RELEASE_INTERPRETATIONS.release_grade_candidate);
        }
        if (outcome.key === 'not_authorized') {
            return Object.assign({}, RELEASE_INTERPRETATIONS.not_release_grade);
        }
        if (outcome.key === 'training_completed' || norm(mode.key) === 'training_preview' || /training/i.test(text(mode.label))) {
            return Object.assign({}, RELEASE_INTERPRETATIONS.training_only_evidence);
        }
        if (outcome.key === 'blocked_paused' || norm(mode.key) === 'cautious_test' || warning.status === 'warn' || blockerCount > 0 || reviewIssues > 0) {
            return Object.assign({}, RELEASE_INTERPRETATIONS.cautious_evidence);
        }
        return Object.assign({}, RELEASE_INTERPRETATIONS.not_release_grade);
    }
    function buildEvidenceChanges(instrumentation) {
        return arr(obj(instrumentation).evidence_changes).map(function (change) {
            return {
                key: change.key || change.label || 'evidence_change',
                label: change.label || change.key || 'Evidence change',
                previous: change.previous,
                current: change.current,
                read_only: true
            };
        });
    }
    function buildUnresolvedBlockers(instrumentation) {
        instrumentation = obj(instrumentation);
        var evidence = obj(instrumentation.evidence_state);
        var warning = obj(instrumentation.pause_abort_warning);
        var items = [];
        var blockerCount = num(evidence.blocker_count, 0);
        var reviewIssues = num(evidence.review_issues, 0);
        if (blockerCount > 0) {
            uniqPush(items, {
                key: 'release_blockers',
                label: 'Release blockers',
                detail: blockerCount + ' blocker(s) remain before release-grade evidence.',
                status: 'fail',
                read_only: true
            });
        }
        if (reviewIssues > 0) {
            uniqPush(items, {
                key: 'review_issues',
                label: 'Review queue',
                detail: reviewIssues + ' issue(s) still need operator review.',
                status: 'warn',
                read_only: true
            });
        }
        if (evidence.handoff_decision && !acceptedHandoff(evidence.handoff_decision)) {
            uniqPush(items, {
                key: 'handoff_acceptance',
                label: 'Handoff acceptance',
                detail: 'Decision is ' + evidence.handoff_decision + '.',
                status: 'warn',
                read_only: true
            });
        }
        if (warning.key && warning.key !== 'no_active_warning' && warning.status !== 'pass') {
            uniqPush(items, {
                key: warning.key,
                label: warning.label || 'Pause / abort warning',
                detail: warning.detail || 'Scenario requires operator review.',
                status: warning.status || 'warn',
                read_only: true
            });
        }
        arr(instrumentation.observe_checklist).forEach(function (item) {
            if (item && (item.status === 'fail' || item.status === 'warn')) {
                uniqPush(items, {
                    key: 'check_' + (item.key || item.label),
                    label: item.label || item.key || 'Observe checklist',
                    detail: item.detail || '',
                    status: item.status,
                    read_only: true
                });
            }
        });
        return items;
    }
    function timelineItem(key, label, detail, status) {
        return { key: key, label: label, detail: detail || '', value: detail || '', status: status || 'pending', read_only: true };
    }
    function buildRunTimeline(instrumentation) {
        instrumentation = obj(instrumentation);
        var scc = obj(instrumentation.control_center);
        var step = obj(instrumentation.current_operator_step);
        var evidence = obj(instrumentation.evidence_state);
        var movement = obj(scc.movement_summary);
        var timeline = [
            timelineItem('generated', 'Debrief generated', text(instrumentation.generated_at, 'Current browser time'), 'pass'),
            timelineItem('control_state', 'Scenario Control Center', text(scc.state_label, scc.state || evidence.scc_state || 'Unavailable'), scc.available === false ? 'fail' : 'pass'),
            timelineItem('operator_step', 'Operator review checkpoint', text(step.title, step.key || 'Unknown'), step.status || 'pending')
        ];
        if (num(evidence.scenario_turn, 0) > 0 || num(scc.scenario_turn, 0) > 0) {
            timeline.push(timelineItem('turn', 'Internal turn observed', 'Internal turn ' + num(evidence.scenario_turn, scc.scenario_turn) + (evidence.current_actor ? ' / ' + evidence.current_actor : ''), 'pass'));
        }
        if (evidence.current_phase_name || scc.current_phase_name) {
            timeline.push(timelineItem('phase', 'Review phase', text(evidence.current_phase_name, scc.current_phase_name), 'pass'));
        }
        if (evidence.objective_control || scc.objective_control) {
            timeline.push(timelineItem('objective', 'Objective control', text(evidence.objective_control, scc.objective_control), 'warn'));
        }
        timeline.push(timelineItem('movement', 'Movement evidence', num(evidence.movement_trace_count, scc.movement_trace_count) + ' trace(s), ' + num(movement.moved, 0) + ' moved action(s)', num(evidence.movement_trace_count, scc.movement_trace_count) > 0 ? 'pass' : 'pending'));
        timeline.push(timelineItem('decisions', 'Decision log', num(evidence.decision_log_count, scc.decision_log_count) + ' decision(s)', num(evidence.decision_log_count, scc.decision_log_count) > 0 ? 'pass' : 'pending'));
        timeline.push(timelineItem('evidence_changes', 'Evidence changes', arr(instrumentation.evidence_changes).length + ' change(s) since last refresh', arr(instrumentation.evidence_changes).length ? 'warn' : 'pass'));
        return timeline;
    }
    function buildRecommendations(instrumentation, outcome, interpretation, blockers) {
        instrumentation = obj(instrumentation);
        var evidence = obj(instrumentation.evidence_state);
        var out = outcome || classifyOutcome(instrumentation);
        var rel = interpretation || classifyReleaseInterpretation(instrumentation, out);
        var items = [];
        if (out.key === 'completed' && rel.key === 'release_grade_candidate') {
            items.push('Review the force report and release certificate before marking the evidence package final.');
        }
        if (out.key === 'training_completed' || rel.key === 'training_only_evidence') {
            items.push('Label this run as training evidence and do not use it as release-grade evidence without a fresh readiness pass.');
        }
        if (out.key === 'blocked_paused') {
            items.push('Pause the operator journey, review the SCC block or replan reason, and decide whether to abort or rerun.');
        }
        if (out.key === 'not_authorized') {
            items.push('Resolve readiness blockers before starting a new CMO war-game run.');
        }
        if (num(evidence.blocker_count, 0) > 0) {
            items.push('Open the release blockers and clear or defer each blocker with an operator note.');
        }
        if (num(evidence.review_issues, 0) > 0) {
            items.push('Work the review queue before treating the run as final evidence.');
        }
        if (arr(blockers).length) {
            items.push('Record the unresolved blocker list in the after-action notes.');
        }
        if (!items.length) {
            items.push('Capture operator notes, export receipts, and preserve the run summary for after-action review.');
        }
        return items.map(function (label, idx) {
            return { key: 'recommendation_' + (idx + 1), label: label, status: idx === 0 ? rel.status : 'pending', read_only: true };
        });
    }
    function buildAfterActionChecklist(instrumentation, outcome) {
        var visible = outcome && (outcome.key === 'completed' || outcome.key === 'training_completed' || outcome.key === 'blocked_paused');
        var list = arr(obj(instrumentation).after_action_checklist).map(function (item, idx) {
            return {
                key: item.key || ('after_action_' + (idx + 1)),
                label: item.label || String(item),
                status: visible ? (item.status === 'locked' ? 'pending' : (item.status || 'pending')) : 'locked',
                available: visible,
                read_only: true
            };
        });
        if (!list.length) {
            list = [
                { key: 'review_force_report', label: 'Review force report and evidence changes.', status: visible ? 'pending' : 'locked', available: visible, read_only: true },
                { key: 'record_operator_notes', label: 'Record operator notes and unresolved blockers.', status: visible ? 'pending' : 'locked', available: visible, read_only: true },
                { key: 'confirm_release_grade', label: 'Confirm whether the run is release-grade or training-only.', status: visible ? 'pending' : 'locked', available: visible, read_only: true }
            ];
        }
        return list;
    }
    function shouldRenderOutcome(outcome) {
        return !!(outcome && (outcome.key === 'completed' || outcome.key === 'training_completed' || outcome.key === 'blocked_paused'));
    }
    function buildDebrief(instrumentation, opts) {
        opts = opts || {};
        instrumentation = obj(instrumentation);
        var outcome = classifyOutcome(instrumentation);
        var interpretation = classifyReleaseInterpretation(instrumentation, outcome);
        var blockers = buildUnresolvedBlockers(instrumentation);
        var timeline = buildRunTimeline(instrumentation);
        var recommendations = buildRecommendations(instrumentation, outcome, interpretation, blockers);
        var checklist = buildAfterActionChecklist(instrumentation, outcome);
        var changes = buildEvidenceChanges(instrumentation);
        return {
            version: CMO_WARGAME_AFTER_ACTION_DEBRIEF_VERSION,
            generated_at: opts.generated_at || instrumentation.generated_at || new Date().toISOString(),
            scenario_fingerprint: instrumentation.scenario_fingerprint || obj(instrumentation.evidence_state).scenario_fingerprint || 'unknown',
            read_only: true,
            visible: shouldRenderOutcome(outcome),
            outcome: outcome,
            release_interpretation: interpretation,
            release_interpretation_text: interpretation.label || interpretation.key || 'Not release-grade',
            evidence_changes: changes,
            unresolved_blockers: blockers,
            unresolved_items: blockers,
            run_timeline: timeline,
            timeline: timeline,
            recommendations: recommendations,
            after_action_checklist: checklist,
            observe_counts: countByStatus(instrumentation.observe_checklist),
            after_action_counts: countByStatus(instrumentation.after_action_checklist),
            source: 'CMO war-game run instrumentation',
            source_instrumentation_version: instrumentation.version || '',
            source_run_mode: obj(instrumentation.run_mode),
            source_control_center: obj(instrumentation.control_center),
            source_evidence_state: obj(instrumentation.evidence_state),
            run_mode: obj(instrumentation.run_mode),
            control_center: obj(instrumentation.control_center),
            operator_step: obj(instrumentation.current_operator_step),
            instrumentation_summary: obj(instrumentation.evidence_state)
        };
    }
    function shouldRenderDebrief(debrief) {
        debrief = debrief && debrief.version === CMO_WARGAME_AFTER_ACTION_DEBRIEF_VERSION ? debrief : buildDebrief(debrief || {});
        return !!debrief.visible;
    }
    function summaryText(debrief) {
        debrief = debrief && debrief.version === CMO_WARGAME_AFTER_ACTION_DEBRIEF_VERSION ? debrief : buildDebrief(debrief || {});
        var outcome = obj(debrief.outcome);
        var interpretation = obj(debrief.release_interpretation);
        var lines = [
            'CMO War-Game After-Action Debrief',
            '',
            'Outcome: ' + text(outcome.label, outcome.key || 'Needs review'),
            'Release interpretation: ' + text(interpretation.label, interpretation.key || 'Not release-grade'),
            'Scenario fingerprint: ' + text(debrief.scenario_fingerprint, 'unknown'),
            'Evidence changes: ' + arr(debrief.evidence_changes).length,
            'Unresolved blockers: ' + arr(debrief.unresolved_blockers).length,
            '',
            'Recommendations:'
        ];
        arr(debrief.recommendations).forEach(function (item) { lines.push('- ' + item.label); });
        lines.push('', 'After-action checklist:');
        arr(debrief.after_action_checklist).forEach(function (item) { lines.push('- [' + (item.available ? ' ' : 'locked') + '] ' + item.label); });
        lines.push('', 'Read-only debrief. It does not run, pause, release, mutate doctrine, mutate combat state, call a backend, write a database, or store browser-persistent state.');
        return lines.join('\n');
    }
    function listHtml(items, empty, classPrefix, detailKey) {
        var html = '<ul>';
        arr(items).forEach(function (item) {
            html += '<li class="' + statusClass(classPrefix, item.status || 'pending') + '"><b>' + esc(item.label || item.key || '') + '</b>';
            var detail = detailKey ? item[detailKey] : item.detail;
            if (detail) html += '<span>' + esc(detail) + '</span>';
            html += '</li>';
        });
        if (!arr(items).length) html += '<li class="' + statusClass(classPrefix, 'pass') + '"><b>' + esc(empty) + '</b></li>';
        return html + '</ul>';
    }
    function renderEvidenceChanges(changes) {
        var html = '<ul>';
        arr(changes).forEach(function (change) {
            html += '<li><b>' + esc(change.label || change.key || 'Evidence change') + '</b><span>' + esc(change.previous) + ' -> ' + esc(change.current) + '</span></li>';
        });
        if (!arr(changes).length) html += '<li><b>No evidence changes captured for this refresh.</b></li>';
        return html + '</ul>';
    }
    function renderDebriefHtml(debrief) {
        debrief = debrief && debrief.version === CMO_WARGAME_AFTER_ACTION_DEBRIEF_VERSION ? debrief : buildDebrief(debrief || {});
        var outcome = obj(debrief.outcome);
        var interpretation = obj(debrief.release_interpretation);
        var scc = obj(debrief.source_control_center);
        var evidence = obj(debrief.source_evidence_state);
        var html = '<div class="cmo-wargame-after-action-debrief ' + statusClass('cmo-wargame-after-action-debrief', outcome.status) + '" data-cmo-after-action-debrief="true">' +
            '<div class="cmo-wargame-after-action-debrief-header">' +
                '<span>CMO War-Game After-Action Debrief</span>' +
                '<span dir="rtl">&#1578;&#1602;&#1585;&#1610;&#1585; &#1605;&#1575; &#1576;&#1593;&#1583; &#1575;&#1604;&#1578;&#1588;&#1594;&#1610;&#1604;</span>' +
                '<strong>' + esc(outcome.label || 'Needs review') + '</strong>' +
            '</div>' +
            '<dl class="cmo-wargame-after-action-debrief-meta">' +
                '<div><dt>Outcome</dt><dd>' + esc(outcome.label || outcome.key || 'Needs review') + '</dd></div>' +
                '<div><dt>Release meaning</dt><dd>' + esc(interpretation.label || interpretation.key || 'Not release-grade') + '</dd></div>' +
                '<div><dt>Internal turn / actor</dt><dd>' + esc(num(evidence.scenario_turn, scc.scenario_turn)) + (evidence.current_actor ? ' / ' + esc(evidence.current_actor) : '') + '</dd></div>' +
                '<div><dt>Fingerprint</dt><dd>' + esc(debrief.scenario_fingerprint || 'unknown') + '</dd></div>' +
            '</dl>' +
            '<div class="cmo-wargame-after-action-debrief-note"><strong>' + esc(interpretation.detail || outcome.detail || '') + '</strong><span>' + esc(outcome.detail || '') + '</span></div>' +
            '<div class="cmo-wargame-aar-section"><strong>AAR review timeline</strong>' + listHtml(debrief.run_timeline, 'No review timeline available.', 'cmo-wargame-aar') + '</div>' +
            '<div class="cmo-wargame-aar-section"><strong>Evidence changes</strong>' + renderEvidenceChanges(debrief.evidence_changes) + '</div>' +
            '<div class="cmo-wargame-aar-section"><strong>Unresolved blockers</strong>' + listHtml(debrief.unresolved_blockers, 'No unresolved blockers visible in the debrief.', 'cmo-wargame-aar') + '</div>' +
            '<div class="cmo-wargame-aar-section"><strong>Recommendations</strong>' + listHtml(debrief.recommendations, 'No recommendations available.', 'cmo-wargame-aar') + '</div>' +
            '<div class="cmo-wargame-aar-section"><strong>After-action checklist</strong>' + listHtml(debrief.after_action_checklist, 'No after-action checklist available.', 'cmo-wargame-aar') + '</div>' +
            '<div class="cmo-wargame-after-action-debrief-source">Source: ' + esc(debrief.source || '') + '. Read-only.</div>' +
        '</div>';
        return html;
    }
    function copyDebrief(debrief) {
        var summary = summaryText(debrief);
        if (root.navigator && root.navigator.clipboard && typeof root.navigator.clipboard.writeText === 'function') {
            return root.navigator.clipboard.writeText(summary).then(function () { return summary; });
        }
        return summary;
    }

    var api = {
        CMO_WARGAME_AFTER_ACTION_DEBRIEF_VERSION: CMO_WARGAME_AFTER_ACTION_DEBRIEF_VERSION,
        buildDebrief: buildDebrief,
        classifyOutcome: classifyOutcome,
        classifyReleaseInterpretation: classifyReleaseInterpretation,
        countByStatus: countByStatus,
        buildEvidenceChanges: buildEvidenceChanges,
        buildUnresolvedBlockers: buildUnresolvedBlockers,
        buildRunTimeline: buildRunTimeline,
        buildRecommendations: buildRecommendations,
        shouldRenderDebrief: shouldRenderDebrief,
        summaryText: summaryText,
        buildSummary: summaryText,
        renderDebriefHtml: renderDebriefHtml,
        copyDebrief: copyDebrief
    };

    root.RmoozCmoWarGameAfterActionDebrief = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
