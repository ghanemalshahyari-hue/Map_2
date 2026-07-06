/* ============================================================================
 * cmo-wargame-run-instrumentation.js - CMO-WARGAME-RUN-INSTRUMENTATION-1
 * ----------------------------------------------------------------------------
 * Read-only live instrumentation for the CMO war-game test card. It connects
 * the operator readiness/test-card layer to the Scenario Control Center's
 * current run snapshot so a tester can see run mode, current step, observe
 * checklist, pause/abort warning, after-action checklist, and evidence deltas.
 *
 * It never starts, pauses, commits, releases, mutates doctrine/combat state,
 * calls a backend route, writes a database, or stores browser-persistent state.
 * ========================================================================== */
(function (root) {
    'use strict';

    var CMO_WARGAME_RUN_INSTRUMENTATION_VERSION = '1.0.0-cmo-wargame-run-instrumentation-1';
    var previousByKey = {};

    function obj(v) { return v && typeof v === 'object' ? v : {}; }
    function arr(v) { return Array.isArray(v) ? v : []; }
    function num(v, fallback) {
        var n = Number(v);
        return isFinite(n) ? n : (fallback == null ? 0 : fallback);
    }
    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }
    function localApi(globalName, moduleName) {
        if (root[globalName]) return root[globalName];
        if (typeof require === 'function') {
            try { return require('./' + moduleName); } catch (_) {}
        }
        return null;
    }
    function testCardApi() { return localApi('RmoozCmoWarGameTestCard', 'cmo-wargame-test-card.js'); }
    function sccApi() { return localApi('RmoozScenarioControlCenter', 'scenario-control-center.js'); }

    function isTestCard(input) {
        return !!(input && typeof input === 'object' && input.operator_steps && input.run_mode);
    }
    function buildTestCard(input, opts) {
        opts = opts || {};
        if (isTestCard(input)) return input;
        if (opts.test_card && isTestCard(opts.test_card)) return opts.test_card;
        var TC = testCardApi();
        if (TC && typeof TC.buildTestCard === 'function') return TC.buildTestCard(input || null, opts);
        return {
            version: 'fallback-cmo-test-card',
            scenario_fingerprint: opts.fingerprint || 'unknown',
            decision: 'no_go',
            run_mode: { key: 'blocked', label: 'Blocked until evidence fixes', allowed: false },
            operator_steps: [],
            observation_focus: [],
            abort_criteria: [],
            after_action_checklist: [],
            read_only: true
        };
    }
    function readScenarioControlSnapshot(opts) {
        opts = opts || {};
        if (opts.scc_snapshot) return opts.scc_snapshot;
        if (opts.run_snapshot) return opts.run_snapshot;
        var SCC = sccApi();
        if (SCC && typeof SCC.runSnapshot === 'function') {
            try { return SCC.runSnapshot(); } catch (_) {}
        }
        return {
            version: CMO_WARGAME_RUN_INSTRUMENTATION_VERSION,
            read_only: true,
            available: false,
            state: 'no_scenario',
            state_label: 'No scenario',
            flow_step: 1,
            reason: 'Scenario Control Center run snapshot unavailable'
        };
    }
    function stepKeyForState(state) {
        return ({
            no_scenario: 'preflight',
            step1_review_required: 'preflight',
            ready_to_generate: 'prepare_coa',
            generating_coa: 'prepare_coa',
            coa_review: 'prepare_coa',
            committed: 'commit_order',
            scenario_running: 'run_wargame',
            scenario_paused: 'observe',
            scenario_blocked: 'observe',
            scenario_complete: 'after_action'
        })[state] || 'preflight';
    }
    function findStep(card, key) {
        var steps = arr(obj(card).operator_steps);
        for (var i = 0; i < steps.length; i++) {
            if (steps[i] && steps[i].key === key) return steps[i];
        }
        return null;
    }
    function operatorStep(card, scc) {
        var key = stepKeyForState(obj(scc).state);
        var found = findStep(card, key) || findStep(card, key === 'run_wargame' ? 'observe' : 'preflight');
        return Object.assign({
            key: key,
            title: key.replace(/_/g, ' '),
            detail: 'Current operator step inferred from Scenario Control Center state.',
            status: obj(scc).state === 'scenario_blocked' ? 'blocked' : 'active',
            operator_action: '',
            active: true,
            read_only: true
        }, obj(found), {
            key: (found && found.key) || key,
            scc_state: obj(scc).state || 'no_scenario',
            scc_state_label: obj(scc).state_label || obj(scc).state || 'No scenario',
            active: true,
            read_only: true
        });
    }
    function checklistItem(key, label, detail, status) {
        return { key: key, label: label, detail: detail || '', status: status || 'pending', read_only: true };
    }
    function isRunState(state) {
        return state === 'scenario_running' || state === 'scenario_paused' ||
            state === 'scenario_blocked' || state === 'scenario_complete';
    }
    function buildObserveChecklist(card, scc, flow) {
        scc = obj(scc);
        flow = obj(flow);
        var summary = obj(flow.summary);
        var releaseGate = obj(flow.release_gate);
        var closeout = obj(flow.closeout);
        var handoff = obj(flow.handoff_acceptance);
        var runMode = obj(obj(card).run_mode);
        var movement = obj(scc.movement_summary);
        var blockers = num(summary.blocker_count, arr(releaseGate.blockers).length);
        var reviewIssues = num(summary.review_issues, obj(flow.review_queue).total_issues || 0);
        var running = isRunState(scc.state);
        var items = [
            checklistItem('control_center', 'Scenario Control Center state', scc.state_label || scc.state || 'Unavailable', scc.available === false ? 'fail' : 'pass'),
            checklistItem('run_mode', 'CMO run mode', runMode.label || 'Blocked', runMode.allowed ? (runMode.key === 'release_grade' ? 'pass' : 'warn') : 'fail'),
            checklistItem('runtime_started', 'Runtime started', scc.scenario_status || scc.phase_status || scc.state_label || 'Not started', running ? 'pass' : (scc.state === 'committed' ? 'warn' : 'pending')),
            checklistItem('turn_observed', 'Internal turn observed', 'Internal turn ' + num(scc.scenario_turn, 0), num(scc.scenario_turn, 0) > 0 ? 'pass' : (running ? 'warn' : 'pending')),
            checklistItem('movement_evidence', 'Movement evidence', num(scc.movement_trace_count, 0) + ' trace(s), ' + num(movement.moved, 0) + ' moved action(s)', (num(scc.movement_trace_count, 0) > 0 || num(movement.moved, 0) > 0) ? 'pass' : (running ? 'warn' : 'pending')),
            checklistItem('decision_log', 'Decision log', num(scc.decision_log_count, 0) + ' decision(s)', num(scc.decision_log_count, 0) > 0 ? 'pass' : (running ? 'warn' : 'pending')),
            checklistItem('release_gate', 'Evidence release gate', (summary.release_label_en || summary.release_status || releaseGate.status_label_en || releaseGate.status || 'Incomplete') + ' / blockers ' + blockers, blockers > 0 ? 'fail' : (summary.releasable || releaseGate.releasable ? 'pass' : 'warn')),
            checklistItem('closeout', 'Closeout state', summary.closeout_label_en || summary.closeout_status || closeout.status_label_en || closeout.status || 'Incomplete', /ready/.test(String(summary.closeout_status || closeout.status || '')) ? 'pass' : 'warn'),
            checklistItem('handoff', 'Handoff acceptance', summary.handoff_label_en || summary.handoff_decision || handoff.decision_label_en || handoff.decision || 'Pending Decision', /accept/.test(String(summary.handoff_decision || handoff.decision || '')) ? 'pass' : 'warn'),
            checklistItem('review_queue', 'Review queue', reviewIssues + ' issue(s) still visible', reviewIssues > 0 ? 'warn' : 'pass')
        ];
        return items;
    }
    function pauseAbortWarning(card, scc, flow) {
        scc = obj(scc);
        flow = obj(flow);
        var summary = obj(flow.summary);
        var mode = obj(obj(card).run_mode);
        var reason = scc.run_blocked_reason || scc.pending_replan_reason || null;
        if (scc.state === 'scenario_blocked' || reason) {
            return {
                key: 'scenario_blocked',
                status: 'fail',
                label: 'Pause / abort warning',
                detail: reason || 'Scenario Control Center reports the run is blocked.',
                read_only: true
            };
        }
        if (!mode.allowed) {
            return {
                key: 'run_mode_blocked',
                status: 'fail',
                label: 'Do not run',
                detail: mode.label || 'CMO readiness is blocked.',
                read_only: true
            };
        }
        if (isRunState(scc.state) && num(summary.blocker_count, 0) > 0) {
            return {
                key: 'release_blockers_visible',
                status: 'warn',
                label: 'Run with caution',
                detail: num(summary.blocker_count, 0) + ' release blocker(s) remain visible during the run.',
                read_only: true
            };
        }
        return {
            key: 'no_active_warning',
            status: 'pass',
            label: 'No active pause / abort warning',
            detail: 'Continue observing the CMO test card and evidence deltas.',
            read_only: true
        };
    }
    function afterActionChecklist(card, scc) {
        var complete = obj(scc).state === 'scenario_complete';
        return arr(obj(card).after_action_checklist).map(function (item, idx) {
            return {
                key: item.key || ('after_action_' + (idx + 1)),
                label: item.label || String(item),
                status: complete ? 'pending' : 'locked',
                available: complete,
                read_only: true
            };
        });
    }
    function evidenceDigest(card, scc, flow) {
        flow = obj(flow);
        scc = obj(scc);
        var summary = obj(flow.summary);
        return {
            scenario_fingerprint: obj(card).scenario_fingerprint || summary.scenario_fingerprint || 'unknown',
            scc_state: scc.state || 'no_scenario',
            scenario_status: scc.scenario_status || '',
            scenario_turn: num(scc.scenario_turn, 0),
            current_actor: scc.current_actor || '',
            current_phase_name: scc.current_phase_name || '',
            objective_control: scc.objective_control || '',
            movement_trace_count: num(scc.movement_trace_count, 0),
            movement_debug_count: num(scc.movement_debug_count, 0),
            decision_log_count: num(scc.decision_log_count, 0),
            release_status: summary.release_status || obj(flow.release_gate).status || 'incomplete',
            blocker_count: num(summary.blocker_count, arr(obj(flow.release_gate).blockers).length),
            closeout_status: summary.closeout_status || obj(flow.closeout).status || 'incomplete',
            handoff_decision: summary.handoff_decision || obj(flow.handoff_acceptance).decision || 'pending',
            review_issues: num(summary.review_issues, obj(flow.review_queue).total_issues || 0)
        };
    }
    var DIGEST_LABELS = {
        scc_state: 'Run state',
        scenario_status: 'Scenario status',
        scenario_turn: 'Internal turn',
        current_actor: 'Current actor',
        current_phase_name: 'Review phase',
        objective_control: 'Objective control',
        movement_trace_count: 'Movement trace count',
        movement_debug_count: 'Movement debug count',
        decision_log_count: 'Decision log count',
        release_status: 'Release status',
        blocker_count: 'Release blocker count',
        closeout_status: 'Closeout status',
        handoff_decision: 'Handoff decision',
        review_issues: 'Review issue count'
    };
    function buildEvidenceChanges(current, previous) {
        current = obj(current);
        previous = obj(previous);
        if (!Object.keys(previous).length) return [];
        return Object.keys(DIGEST_LABELS).filter(function (key) {
            return String(current[key] == null ? '' : current[key]) !== String(previous[key] == null ? '' : previous[key]);
        }).map(function (key) {
            return {
                key: key,
                label: DIGEST_LABELS[key],
                previous: previous[key],
                current: current[key],
                read_only: true
            };
        });
    }
    function memoryKey(card, scc, opts) {
        opts = opts || {};
        return opts.memory_key || obj(card).scenario_fingerprint || obj(scc).selected_coa_id || 'cmo-wargame-default';
    }
    function buildRunInstrumentation(cardOrBrief, opts) {
        opts = opts || {};
        var card = buildTestCard(cardOrBrief, opts);
        var scc = readScenarioControlSnapshot(opts);
        var flow = opts.flow_snapshot || opts.snapshot || opts.scenario_evidence_snapshot || {};
        var digest = evidenceDigest(card, scc, flow);
        var key = memoryKey(card, scc, opts);
        var previous = opts.previous_evidence_state || (opts.track_evidence_changes === false ? null : previousByKey[key]);
        var changes = buildEvidenceChanges(digest, previous || {});
        if (opts.track_evidence_changes !== false) previousByKey[key] = Object.assign({}, digest);
        var step = operatorStep(card, scc);
        var mode = obj(card.run_mode);
        return {
            version: CMO_WARGAME_RUN_INSTRUMENTATION_VERSION,
            generated_at: opts.generated_at || new Date().toISOString(),
            scenario_fingerprint: card.scenario_fingerprint || digest.scenario_fingerprint || 'unknown',
            read_only: true,
            run_mode: {
                key: mode.key || 'blocked',
                label: mode.label || 'Blocked',
                label_ar: mode.label_ar || '',
                allowed: !!mode.allowed
            },
            control_center: scc,
            current_operator_step: step,
            observe_checklist: buildObserveChecklist(card, scc, flow),
            pause_abort_warning: pauseAbortWarning(card, scc, flow),
            after_action_checklist: afterActionChecklist(card, scc),
            evidence_state: digest,
            evidence_changes: changes,
            source: 'Scenario Control Center run snapshot + CMO war-game test card'
        };
    }
    function summaryText(instrumentation) {
        instrumentation = instrumentation && instrumentation.version ? instrumentation : buildRunInstrumentation(instrumentation || null);
        var scc = obj(instrumentation.control_center);
        var step = obj(instrumentation.current_operator_step);
        var warning = obj(instrumentation.pause_abort_warning);
        var lines = [
            'CMO War-Game Run Diagnostics',
            '',
            'Run mode: ' + (obj(instrumentation.run_mode).label || 'Blocked'),
            'Control Center: ' + (scc.state_label || scc.state || 'Unavailable'),
            'Operator review checkpoint: ' + (step.title || step.key || 'Unknown'),
            'Internal turn: ' + num(scc.scenario_turn, 0) + (scc.current_actor ? ' / actor ' + scc.current_actor : ''),
            'Pause/abort: ' + (warning.label || 'No active warning') + (warning.detail ? ' - ' + warning.detail : ''),
            'Evidence changes: ' + arr(instrumentation.evidence_changes).length,
            '',
            'Read-only instrumentation. It does not run, pause, release, mutate doctrine, mutate combat state, call a backend, or write storage.'
        ];
        return lines.join('\n');
    }
    function statusClass(status) {
        return 'cmo-wargame-run-instrumentation--' + esc(status || 'pending');
    }
    function renderRunInstrumentationHtml(instrumentation) {
        instrumentation = instrumentation && instrumentation.version ? instrumentation : buildRunInstrumentation(instrumentation || null);
        var mode = obj(instrumentation.run_mode);
        var scc = obj(instrumentation.control_center);
        var step = obj(instrumentation.current_operator_step);
        var warning = obj(instrumentation.pause_abort_warning);
        var html = '<div class="cmo-wargame-run-instrumentation" data-cmo-run-instrumentation="true">' +
            '<div class="cmo-wargame-run-instrumentation-header">' +
                '<span>CMO War-Game Run Diagnostics</span>' +
                '<span dir="rtl">&#1578;&#1588;&#1594;&#1610;&#1604; &#1575;&#1604;&#1605;&#1606;&#1575;&#1608;&#1585;&#1577;</span>' +
                '<strong>' + esc(scc.state_label || scc.state || 'Unavailable') + '</strong>' +
            '</div>' +
            '<dl class="cmo-wargame-run-instrumentation-meta">' +
                '<div><dt>Run mode</dt><dd>' + esc(mode.label || 'Blocked') + '</dd></div>' +
                '<div><dt>Operator review checkpoint</dt><dd>' + esc(step.title || step.key || 'Unknown') + '</dd></div>' +
                '<div><dt>Internal turn / actor</dt><dd>' + esc(num(scc.scenario_turn, 0)) + (scc.current_actor ? ' / ' + esc(scc.current_actor) : '') + '</dd></div>' +
                '<div><dt>Review phase</dt><dd>' + esc(scc.current_phase_name || scc.phase_status || 'Not committed') + '</dd></div>' +
            '</dl>' +
            '<div class="cmo-wargame-run-warning ' + statusClass(warning.status) + '"><strong>' + esc(warning.label || 'Pause / abort') + '</strong><span>' + esc(warning.detail || '') + '</span></div>' +
            '<div class="cmo-wargame-run-step"><strong>Current operator review checkpoint</strong><span>' + esc(step.detail || '') + '</span><em>' + esc(step.operator_action || '') + '</em></div>' +
            '<div class="cmo-wargame-run-observe"><strong>Live observe checklist</strong><ul>';
        arr(instrumentation.observe_checklist).forEach(function (item) {
            html += '<li class="' + statusClass(item.status) + '"><b>' + esc(item.label) + '</b><span>' + esc(item.detail) + '</span></li>';
        });
        html += '</ul></div><div class="cmo-wargame-run-after"><strong>After-action checklist</strong><ul>';
        arr(instrumentation.after_action_checklist).forEach(function (item) {
            html += '<li class="' + statusClass(item.status) + '"><b>' + esc(item.label) + '</b></li>';
        });
        if (!arr(instrumentation.after_action_checklist).length) html += '<li class="cmo-wargame-run-instrumentation--locked"><b>No after-action checklist available.</b></li>';
        html += '</ul></div><div class="cmo-wargame-run-deltas"><strong>Evidence changes during run</strong><ul>';
        arr(instrumentation.evidence_changes).forEach(function (change) {
            html += '<li><b>' + esc(change.label) + '</b><span>' + esc(change.previous) + ' -> ' + esc(change.current) + '</span></li>';
        });
        if (!arr(instrumentation.evidence_changes).length) html += '<li><b>No evidence changes detected since last refresh.</b></li>';
        html += '</ul></div><div class="cmo-wargame-run-source">Source: ' + esc(instrumentation.source || '') + '. Read-only.</div></div>';
        return html;
    }
    function resetEvidenceMemory() { previousByKey = {}; }

    var api = {
        CMO_WARGAME_RUN_INSTRUMENTATION_VERSION: CMO_WARGAME_RUN_INSTRUMENTATION_VERSION,
        buildRunInstrumentation: buildRunInstrumentation,
        buildObserveChecklist: buildObserveChecklist,
        buildEvidenceChanges: buildEvidenceChanges,
        buildEvidenceDigest: evidenceDigest,
        summaryText: summaryText,
        buildSummary: summaryText,
        renderRunInstrumentationHtml: renderRunInstrumentationHtml,
        _resetEvidenceMemoryForTest: resetEvidenceMemory
    };

    root.RmoozCmoWarGameRunInstrumentation = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
