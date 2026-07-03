/* ============================================================================
 * cmo-wargame-after-action-debrief.js - RMOOZ-CMO-WARGAME-AAR-1
 * ----------------------------------------------------------------------------
 * Read-only CMO war-game after-action debrief. Converts live CMO run
 * instrumentation into a compact post-run report: outcome, evidence changes,
 * unresolved blockers, lessons, recommendations, and after-action checklist.
 * It never starts, pauses, releases, mutates doctrine/combat state, calls a
 * backend route, writes a database, or stores browser-persistent state.
 * ========================================================================== */
(function (root) {
    'use strict';

    var CMO_WARGAME_AFTER_ACTION_DEBRIEF_VERSION = '1.0.0-rmooz-cmo-wargame-aar-1';

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
    function runApi() { return localApi('RmoozCmoWarGameRunInstrumentation', 'cmo-wargame-run-instrumentation.js'); }

    function isInstrumentation(input) {
        return !!(input && typeof input === 'object' && input.version && input.current_operator_step && input.observe_checklist);
    }
    function buildRunInstrumentation(input, opts) {
        opts = opts || {};
        if (opts.instrumentation && isInstrumentation(opts.instrumentation)) return opts.instrumentation;
        if (isInstrumentation(input)) return input;
        var RUN = runApi();
        if (RUN && typeof RUN.buildRunInstrumentation === 'function') return RUN.buildRunInstrumentation(input || null, opts);
        return {
            version: 'fallback-cmo-run-instrumentation',
            scenario_fingerprint: opts.fingerprint || 'unknown',
            run_mode: { key: 'blocked', label: 'Blocked', allowed: false },
            control_center: { state: 'no_scenario', state_label: 'No scenario', scenario_turn: 0 },
            current_operator_step: { key: 'preflight', title: 'Preflight', status: 'pending' },
            observe_checklist: [],
            pause_abort_warning: { status: 'fail', label: 'Unavailable', detail: 'Run instrumentation unavailable.' },
            after_action_checklist: [],
            evidence_state: {},
            evidence_changes: [],
            read_only: true
        };
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
    function classifyOutcome(run) {
        run = obj(run);
        var scc = obj(run.control_center);
        var warning = obj(run.pause_abort_warning);
        var observe = countByStatus(run.observe_checklist);
        var mode = obj(run.run_mode);
        if (scc.state === 'scenario_complete' && observe.fail === 0 && warning.status !== 'fail') {
            return mode.key === 'training_preview'
                ? { key: 'training_complete', label: 'Training preview completed', label_ar: 'اكتملت المعاينة التدريبية', severity: 'warn' }
                : { key: 'completed', label: 'CMO war-game run completed', label_ar: 'اكتمل اختبار المناورة', severity: observe.warn ? 'warn' : 'pass' };
        }
        if (scc.state === 'scenario_blocked' || warning.status === 'fail') {
            return { key: 'blocked', label: 'Run blocked / paused', label_ar: 'توقف أو تعطل التشغيل', severity: 'fail' };
        }
        if (mode.allowed === false) return { key: 'not_run', label: 'Run not authorized by readiness', label_ar: 'غير مصرح بالتشغيل', severity: 'fail' };
        if (arr(run.evidence_changes).length || observe.warn || warning.status === 'warn') {
            return { key: 'needs_review', label: 'Run needs evidence review', label_ar: 'يتطلب مراجعة الأدلة', severity: 'warn' };
        }
        return { key: 'observed', label: 'Run observed', label_ar: 'تمت المراقبة', severity: 'pass' };
    }
    function releaseInterpretation(run, outcome) {
        var mode = obj(run.run_mode).key || 'blocked';
        if (mode === 'release_grade' && (outcome.key === 'completed' || outcome.key === 'observed')) return 'release-grade evidence candidate';
        if (mode === 'training_preview' || outcome.key === 'training_complete') return 'training-only evidence; do not claim release-grade result';
        if (mode === 'cautious_test') return 'cautious evidence; review warnings before release claim';
        return 'not release-grade evidence';
    }
    function unresolvedItems(run) {
        run = obj(run);
        var out = [];
        arr(run.observe_checklist).forEach(function (item) {
            item = obj(item);
            if (item.status === 'fail' || item.status === 'warn' || item.status === 'blocked') {
                out.push({ key: item.key || 'observe', label: item.label || 'Observation item', status: item.status || 'warn', detail: item.detail || '', source: 'observe_checklist', read_only: true });
            }
        });
        var warning = obj(run.pause_abort_warning);
        if (warning.status === 'fail' || warning.status === 'warn') {
            out.unshift({ key: warning.key || 'pause_abort', label: warning.label || 'Pause / abort warning', status: warning.status, detail: warning.detail || '', source: 'pause_abort_warning', read_only: true });
        }
        return out.slice(0, 12);
    }
    function recommendations(run, outcome, unresolved) {
        run = obj(run);
        var recs = [];
        if (outcome.key === 'blocked') recs.push('Pause the CMO war-game and resolve the blocking SCC/evidence condition before continuing.');
        if (outcome.key === 'not_run') recs.push('Do not run a release-grade test until the readiness brief changes to GO or GO with warnings.');
        if (arr(run.evidence_changes).length) recs.push('Review evidence changes detected during the run and compare them against the force report.');
        if (unresolved.some(function (u) { return /release/i.test(String(u.label)); })) recs.push('Open Evidence Release Gate and clear or document release blockers.');
        if (unresolved.some(function (u) { return /handoff/i.test(String(u.label)); })) recs.push('Confirm handoff acceptance and fingerprint match before claiming test validity.');
        if (unresolved.some(function (u) { return /review/i.test(String(u.label)); })) recs.push('Open Scenario Evidence Review Queue and close remaining evidence issues.');
        if (!recs.length && outcome.severity === 'pass') recs.push('Proceed to after-action review and preserve the evidence summary used for the test.');
        if (!recs.length) recs.push('Review warnings, refresh the readiness brief, and rerun the operator test card before the next iteration.');
        return recs.map(function (text, idx) { return { key: 'recommendation_' + (idx + 1), label: text, read_only: true }; }).slice(0, 8);
    }
    function timeline(run) {
        run = obj(run);
        var scc = obj(run.control_center);
        var step = obj(run.current_operator_step);
        var warning = obj(run.pause_abort_warning);
        return [
            { key: 'state', label: 'Control Center state', value: scc.state_label || scc.state || 'Unavailable', read_only: true },
            { key: 'turn', label: 'Turn / actor', value: String(num(scc.scenario_turn, 0)) + (scc.current_actor ? ' / ' + scc.current_actor : ''), read_only: true },
            { key: 'phase', label: 'Phase', value: scc.current_phase_name || scc.phase_status || 'Not committed', read_only: true },
            { key: 'operator_step', label: 'Operator step', value: step.title || step.key || 'Unknown', read_only: true },
            { key: 'warning', label: 'Pause / abort', value: (warning.label || 'No warning') + (warning.detail ? ' — ' + warning.detail : ''), read_only: true }
        ];
    }

    function buildDebrief(runOrCard, opts) {
        opts = opts || {};
        var run = buildRunInstrumentation(runOrCard, opts);
        var outcome = classifyOutcome(run);
        var unresolved = unresolvedItems(run);
        return {
            version: CMO_WARGAME_AFTER_ACTION_DEBRIEF_VERSION,
            generated_at: opts.generated_at || new Date().toISOString(),
            scenario_fingerprint: run.scenario_fingerprint || 'unknown',
            outcome: outcome,
            release_interpretation: releaseInterpretation(run, outcome),
            run_mode: obj(run.run_mode),
            control_center: obj(run.control_center),
            operator_step: obj(run.current_operator_step),
            observe_counts: countByStatus(run.observe_checklist),
            after_action_counts: countByStatus(run.after_action_checklist),
            timeline: timeline(run),
            evidence_changes: arr(run.evidence_changes),
            unresolved_items: unresolved,
            recommendations: recommendations(run, outcome, unresolved),
            after_action_checklist: arr(run.after_action_checklist),
            instrumentation_summary: obj(run.evidence_state),
            source: 'CMO War-Game Run Instrumentation after-action debrief',
            read_only: true
        };
    }
    function summaryText(debrief) {
        debrief = debrief && debrief.version ? debrief : buildDebrief(debrief || null);
        var outcome = obj(debrief.outcome);
        var lines = [
            'CMO War-Game After-Action Debrief',
            '',
            'Outcome: ' + (outcome.label || outcome.key || 'Unknown'),
            'Release interpretation: ' + (debrief.release_interpretation || 'not release-grade evidence'),
            'Scenario fingerprint: ' + (debrief.scenario_fingerprint || 'unknown'),
            'Run mode: ' + (obj(debrief.run_mode).label || obj(debrief.run_mode).key || 'Unknown'),
            'Observe checklist: pass ' + num(obj(debrief.observe_counts).pass, 0) + ' / warn ' + num(obj(debrief.observe_counts).warn, 0) + ' / fail ' + num(obj(debrief.observe_counts).fail, 0),
            'Evidence changes: ' + arr(debrief.evidence_changes).length,
            'Unresolved items: ' + arr(debrief.unresolved_items).length,
            '',
            'Recommendations:'
        ];
        arr(debrief.recommendations).forEach(function (r) { lines.push('- ' + r.label); });
        lines.push('');
        lines.push('Read-only debrief. It does not run, pause, release, mutate doctrine, mutate combat state, call a backend, or write storage.');
        return lines.join('\n');
    }
    function renderDebriefHtml(debrief) {
        debrief = debrief && debrief.version ? debrief : buildDebrief(debrief || null);
        var outcome = obj(debrief.outcome);
        var html = '<div class="cmo-wargame-aar cmo-wargame-aar--' + esc(outcome.severity || 'warn') + '">' +
            '<div class="cmo-wargame-aar-header">' +
                '<span>CMO War-Game After-Action Debrief</span>' +
                '<span dir="rtl">مراجعة ما بعد اختبار المناورة</span>' +
                '<strong>' + esc(outcome.label || outcome.key || 'Unknown') + '</strong>' +
                '<small dir="rtl">' + esc(outcome.label_ar || '') + '</small>' +
            '</div>' +
            '<dl class="cmo-wargame-aar-meta">' +
                '<div><dt>Release interpretation</dt><dd>' + esc(debrief.release_interpretation || '') + '</dd></div>' +
                '<div><dt>Fingerprint</dt><dd><code>' + esc(debrief.scenario_fingerprint || 'unknown') + '</code></dd></div>' +
                '<div><dt>Evidence changes</dt><dd>' + esc(arr(debrief.evidence_changes).length) + '</dd></div>' +
                '<div><dt>Unresolved</dt><dd>' + esc(arr(debrief.unresolved_items).length) + '</dd></div>' +
            '</dl><div class="cmo-wargame-aar-timeline"><strong>Run timeline</strong><ol>';
        arr(debrief.timeline).forEach(function (t) { html += '<li><b>' + esc(t.label) + '</b><span>' + esc(t.value) + '</span></li>'; });
        html += '</ol></div><div class="cmo-wargame-aar-changes"><strong>Evidence changes</strong><ul>';
        arr(debrief.evidence_changes).forEach(function (c) { html += '<li><b>' + esc(c.label || c.key) + '</b><span>' + esc(c.previous) + ' -> ' + esc(c.current) + '</span></li>'; });
        if (!arr(debrief.evidence_changes).length) html += '<li>No evidence changes detected in the current debrief.</li>';
        html += '</ul></div><div class="cmo-wargame-aar-recommendations"><strong>Recommendations</strong><ul>';
        arr(debrief.recommendations).forEach(function (r) { html += '<li>' + esc(r.label) + '</li>'; });
        html += '</ul></div><div class="cmo-wargame-aar-source">Source: ' + esc(debrief.source || '') + '. Read-only.</div></div>';
        return html;
    }

    var api = {
        CMO_WARGAME_AFTER_ACTION_DEBRIEF_VERSION: CMO_WARGAME_AFTER_ACTION_DEBRIEF_VERSION,
        buildDebrief: buildDebrief,
        classifyOutcome: classifyOutcome,
        countByStatus: countByStatus,
        summaryText: summaryText,
        renderDebriefHtml: renderDebriefHtml
    };

    root.RmoozCmoWarGameAfterActionDebrief = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
