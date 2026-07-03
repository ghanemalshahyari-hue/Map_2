/* ============================================================================
 * cmo-wargame-test-card.js - RMOOZ-CMO-WARGAME-TEST-CARD-1
 * ----------------------------------------------------------------------------
 * Read-only CMO war-game operator test card. Converts the CMO War-Game
 * Readiness Brief into a concrete, safe test run plan: run mode, allowed scope,
 * operator steps, observation focus, abort criteria, and after-action checklist.
 * It never mutates scenario truth, world state, doctrine, combat state, backend
 * routes, or a database.
 * ========================================================================== */
(function (root) {
    'use strict';

    var CMO_WARGAME_TEST_CARD_VERSION = '1.0.0-rmooz-cmo-wargame-test-card-1';

    function obj(v) { return v && typeof v === 'object' ? v : {}; }
    function arr(v) { return Array.isArray(v) ? v : []; }
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
    function briefApi() { return localApi('RmoozCmoWarGameReadinessBrief', 'cmo-wargame-readiness-brief.js'); }

    function isBrief(input) { return !!(input && typeof input === 'object' && input.version && input.gates && input.decision); }
    function buildBrief(input, opts) {
        opts = opts || {};
        if (opts.brief) return opts.brief;
        if (isBrief(input)) return input;
        var BR = briefApi();
        if (BR && typeof BR.buildBrief === 'function') return BR.buildBrief(input || null, opts);
        return {
            decision: 'no_go',
            decision_label_en: 'NO-GO for release-grade test',
            decision_label_ar: 'غير جاهز للاختبار النهائي',
            confidence: { score: 0, label: 'Unknown', pass: 0, warn: 0, fail: 1 },
            gates: [],
            release_blockers: [],
            next_actions: [],
            scenario_fingerprint: opts.fingerprint || 'unknown',
            read_only: true
        };
    }
    function runMode(decision) {
        if (decision === 'go') return { key: 'release_grade', label: 'Release-grade CMO test', label_ar: 'اختبار CMO نهائي', allowed: true };
        if (decision === 'go_with_warnings') return { key: 'cautious_test', label: 'Cautious CMO test', label_ar: 'اختبار CMO مع تنبيهات', allowed: true };
        if (decision === 'training_preview_only') return { key: 'training_preview', label: 'Training preview only', label_ar: 'معاينة تدريبية فقط', allowed: true };
        return { key: 'blocked', label: 'Blocked until evidence fixes', label_ar: 'محظور حتى إغلاق الأدلة', allowed: false };
    }
    function step(key, title, detail, status, operatorAction) {
        return { key: key, title: title, detail: detail || '', status: status || 'pending', operator_action: operatorAction || '', read_only: true };
    }
    function buildRunSteps(brief, mode) {
        brief = obj(brief);
        mode = mode || runMode(brief.decision);
        if (!mode.allowed || mode.key === 'blocked') {
            return [
                step('fix_evidence', 'Fix evidence blockers', 'CMO war-game run is blocked by evidence gates.', 'blocked', 'Resolve the listed next actions before attempting a release-grade test.'),
                step('rebuild_brief', 'Rebuild readiness brief', 'Refresh the CMO War-Game Readiness Brief after fixes.', 'pending', 'Run the readiness brief again and confirm all failed gates are cleared.'),
                step('rerun_gate', 'Rerun verification gate', 'Confirm the main-app gate stack is green.', 'pending', 'Run the main CMO/scenario verification stack before the live test.')
            ];
        }
        var firstStatus = mode.key === 'release_grade' ? 'pass' : 'warn';
        var guardText = mode.key === 'training_preview'
            ? 'Simulation-only: do not treat results as release-grade evidence.'
            : (mode.key === 'cautious_test' ? 'Proceed, but keep warnings visible during observation.' : 'Proceed with normal release-grade observation.');
        return [
            step('preflight', 'Preflight readiness', guardText, firstStatus, 'Open readiness brief and confirm decision/confidence before starting.'),
            step('prepare_coa', 'Prepare / review COA', 'Use Scenario Control Center to generate and review COAs.', 'pending', 'Pick the COA that matches commander intent and evidence constraints.'),
            step('commit_order', 'Commit selected COA', 'Commit only after confirming stale-plan and handoff warnings are clear.', 'pending', 'Commit the selected COA in the control center.'),
            step('run_wargame', 'Run CMO war-game', 'Run the scenario while watching status, blockers, and evidence feed.', 'pending', 'Start or continue the CMO war-game test run.'),
            step('observe', 'Observe evidence', 'Watch release gate, closeout, coverage, handoff, and force report deltas.', 'pending', 'Record any blocker, warning, or unexpected force evidence change.'),
            step('after_action', 'After-action review', 'Export/report the evidence summary after the run.', 'pending', 'Use force report and readiness brief for post-run review.')
        ];
    }
    function buildObservationFocus(brief) {
        brief = obj(brief);
        var focus = [
            { key: 'release_gate', label: 'Release Gate', detail: 'Watch for new blockers or status regression.', read_only: true },
            { key: 'closeout', label: 'Closeout', detail: 'Confirm review state remains ready or justified.', read_only: true },
            { key: 'handoff', label: 'Handoff', detail: 'Confirm accepted package fingerprint still matches.', read_only: true },
            { key: 'force_report', label: 'Force Report', detail: 'Verify force evidence remains explainable after the run.', read_only: true }
        ];
        arr(brief.gates).forEach(function (g) {
            if (g && g.status !== 'pass') {
                focus.push({ key: 'gate_' + (g.key || 'warn'), label: g.label || 'Warning gate', detail: g.detail || g.action || '', read_only: true });
            }
        });
        return focus.slice(0, 10);
    }
    function buildAbortCriteria(brief, mode) {
        brief = obj(brief);
        mode = mode || runMode(brief.decision);
        var aborts = [];
        if (mode.key === 'blocked') aborts.push('Do not run: evidence readiness decision is NO-GO.');
        if (mode.key === 'training_preview') aborts.push('Abort release-grade interpretation: this is training preview only.');
        if (arr(brief.release_blockers).length) aborts.push('Abort release-grade test if release blockers remain unresolved.');
        if (obj(brief.confidence).fail > 0) aborts.push('Abort if any failed readiness gate is still present.');
        aborts.push('Pause if scenario status becomes blocked or pending replan is raised.');
        aborts.push('Pause if evidence fingerprint/package mismatch appears.');
        aborts.push('Pause if force report cannot explain a major outcome.');
        return aborts.map(function (text, idx) { return { key: 'abort_' + (idx + 1), label: text, read_only: true }; });
    }
    function buildAfterActionChecklist(brief) {
        brief = obj(brief);
        return [
            { key: 'save_readiness', label: 'Save/read the readiness decision used for the run.', read_only: true },
            { key: 'review_gates', label: 'Review pass/warn/fail gates after the run.', read_only: true },
            { key: 'review_force_report', label: 'Review force evidence report and outcome explanations.', read_only: true },
            { key: 'capture_blockers', label: 'Capture new blockers or warnings for the next scenario iteration.', read_only: true },
            { key: 'confirm_no_release_override', label: 'Confirm no release-grade claim was made from a training-only run.', read_only: true }
        ];
    }

    function buildTestCard(worldStateOrBrief, opts) {
        opts = opts || {};
        var brief = buildBrief(worldStateOrBrief, opts);
        var mode = runMode(brief.decision);
        var steps = buildRunSteps(brief, mode);
        return {
            version: CMO_WARGAME_TEST_CARD_VERSION,
            generated_at: opts.generated_at || new Date().toISOString(),
            scenario_fingerprint: brief.scenario_fingerprint || 'unknown',
            decision: brief.decision || 'no_go',
            decision_label_en: brief.decision_label_en || mode.label,
            decision_label_ar: brief.decision_label_ar || mode.label_ar,
            run_mode: mode,
            confidence: obj(brief.confidence),
            operator_steps: steps,
            observation_focus: buildObservationFocus(brief),
            abort_criteria: buildAbortCriteria(brief, mode),
            after_action_checklist: buildAfterActionChecklist(brief),
            next_actions: arr(brief.next_actions),
            readiness_brief: brief,
            source: 'CMO War-Game Readiness Brief + operator test-card policy',
            read_only: true
        };
    }
    function summaryText(card) {
        card = card && card.version ? card : buildTestCard(card || null);
        var lines = [
            'CMO War-Game Operator Test Card',
            '',
            'Decision: ' + (card.decision_label_en || card.decision || 'NO-GO'),
            'Run mode: ' + (obj(card.run_mode).label || 'Blocked'),
            'Confidence: ' + (obj(card.confidence).label || 'Unknown') + ' (' + (obj(card.confidence).score || 0) + '%)',
            'Scenario fingerprint: ' + (card.scenario_fingerprint || 'unknown'),
            '',
            'Operator steps:'
        ];
        arr(card.operator_steps).forEach(function (s, i) { lines.push((i + 1) + '. ' + s.title + ' — ' + s.detail); });
        lines.push('');
        lines.push('Abort / pause criteria:');
        arr(card.abort_criteria).forEach(function (a) { lines.push('- ' + a.label); });
        lines.push('');
        lines.push('Read-only test card. It does not run, commit, release, mutate doctrine, or change scenario state.');
        return lines.join('\n');
    }
    function renderCardHtml(card) {
        card = card && card.version ? card : buildTestCard(card || null);
        var mode = obj(card.run_mode);
        var conf = obj(card.confidence);
        var html = '<div class="cmo-wargame-test-card cmo-wargame-test-card--' + esc(mode.key || 'blocked') + '">' +
            '<div class="cmo-wargame-test-card-header">' +
                '<span>CMO War-Game Operator Test Card</span>' +
                '<span dir="rtl">بطاقة اختبار المناورة</span>' +
                '<strong>' + esc(mode.label || card.decision_label_en || 'Blocked') + '</strong>' +
                '<small dir="rtl">' + esc(mode.label_ar || card.decision_label_ar || '') + '</small>' +
            '</div>' +
            '<dl class="cmo-wargame-test-card-meta">' +
                '<div><dt>Decision</dt><dd>' + esc(card.decision_label_en || card.decision || 'NO-GO') + '</dd></div>' +
                '<div><dt>Confidence</dt><dd>' + esc(conf.label || 'Unknown') + ' (' + esc(conf.score || 0) + '%)</dd></div>' +
                '<div><dt>Fingerprint</dt><dd><code>' + esc(card.scenario_fingerprint || 'unknown') + '</code></dd></div>' +
            '</dl><ol class="cmo-wargame-test-card-steps">';
        arr(card.operator_steps).forEach(function (s) {
            html += '<li class="cmo-wargame-test-card-step cmo-wargame-test-card-step--' + esc(s.status || 'pending') + '">' +
                '<strong>' + esc(s.title) + '</strong><span>' + esc(s.detail) + '</span><em>' + esc(s.operator_action) + '</em></li>';
        });
        html += '</ol><div class="cmo-wargame-test-card-observe"><strong>Observation focus</strong><ul>';
        arr(card.observation_focus).forEach(function (f) { html += '<li>' + esc(f.label) + ' — ' + esc(f.detail) + '</li>'; });
        html += '</ul></div><div class="cmo-wargame-test-card-abort"><strong>Abort / pause criteria</strong><ul>';
        arr(card.abort_criteria).forEach(function (a) { html += '<li>' + esc(a.label) + '</li>'; });
        html += '</ul></div><div class="cmo-wargame-test-card-source">Source: ' + esc(card.source || '') + '. Read-only.</div></div>';
        return html;
    }

    var api = {
        CMO_WARGAME_TEST_CARD_VERSION: CMO_WARGAME_TEST_CARD_VERSION,
        buildTestCard: buildTestCard,
        buildRunSteps: buildRunSteps,
        buildObservationFocus: buildObservationFocus,
        buildAbortCriteria: buildAbortCriteria,
        buildAfterActionChecklist: buildAfterActionChecklist,
        summaryText: summaryText,
        renderCardHtml: renderCardHtml
    };

    root.RmoozCmoWarGameTestCard = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
