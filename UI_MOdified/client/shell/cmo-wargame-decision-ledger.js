/* ============================================================================
 * cmo-wargame-decision-ledger.js - RMOOZ-CMO-WARGAME-DECISION-LEDGER-1
 * ----------------------------------------------------------------------------
 * Read-only CMO war-game decision ledger. Builds a deterministic explanation
 * trail across readiness, test card, run instrumentation, after-action debrief,
 * evidence package, and optional review board objects so commanders can see why
 * a CMO run is accepted, warning-only, training-only, blocked, or rejected.
 * It never starts, pauses, releases, mutates doctrine/combat state, calls a
 * backend route, writes a database, or stores browser-persistent state.
 * ========================================================================== */
(function (root) {
    'use strict';

    var CMO_WARGAME_DECISION_LEDGER_VERSION = '1.0.0-rmooz-cmo-wargame-decision-ledger-1';

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
    function readinessApi() { return localApi('RmoozCmoWarGameReadinessBrief', 'cmo-wargame-readiness-brief.js'); }
    function testCardApi() { return localApi('RmoozCmoWarGameTestCard', 'cmo-wargame-test-card.js'); }
    function runApi() { return localApi('RmoozCmoWarGameRunInstrumentation', 'cmo-wargame-run-instrumentation.js'); }
    function aarApi() { return localApi('RmoozCmoWarGameAfterActionDebrief', 'cmo-wargame-after-action-debrief.js'); }
    function packageApi() { return localApi('RmoozCmoWarGameEvidencePackage', 'cmo-wargame-evidence-package.js'); }
    function reviewBoardApi() { return localApi('RmoozCmoWarGameReviewBoard', 'cmo-wargame-review-board.js'); }

    function buildWith(api, fn, input, opts, fallback) {
        opts = opts || {};
        if (input && typeof input === 'object') return input;
        if (api && typeof api[fn] === 'function') {
            try { return api[fn](input || null, opts); } catch (_) {}
        }
        return fallback || null;
    }
    function sourceFrom(input, opts) {
        opts = opts || {};
        var readiness = opts.readiness || opts.brief || buildWith(readinessApi(), 'buildBrief', input, opts, null);
        var card = opts.test_card || opts.card || buildWith(testCardApi(), 'buildTestCard', readiness || input, opts, null);
        var run = opts.run || opts.instrumentation || buildWith(runApi(), 'buildRunInstrumentation', card || readiness || input, opts, null);
        var aar = opts.aar || opts.debrief || buildWith(aarApi(), 'buildDebrief', run || card || input, opts, null);
        var evidencePackage = opts.package || opts.evidence_package || buildWith(packageApi(), 'buildPackage', aar || run || input, opts, null);
        var reviewBoard = opts.review_board || null;
        var RB = reviewBoardApi();
        if (!reviewBoard && RB && typeof RB.buildReviewBoard === 'function') {
            try { reviewBoard = RB.buildReviewBoard(evidencePackage || aar || run || input, opts); } catch (_) {}
        }
        return { readiness: readiness, test_card: card, run: run, aar: aar, evidence_package: evidencePackage, review_board: reviewBoard };
    }
    function pickFingerprint(src, opts) {
        opts = opts || {};
        return opts.fingerprint || obj(src.evidence_package).scenario_fingerprint || obj(obj(src.evidence_package).summary).scenario_fingerprint || obj(src.aar).scenario_fingerprint || obj(src.run).scenario_fingerprint || obj(src.readiness).scenario_fingerprint || 'unknown';
    }
    function event(key, label, status, detail, source, weight) {
        return { key: key, label: label, status: status || 'info', detail: detail || '', source: source || 'unknown', weight: weight == null ? 1 : weight, read_only: true };
    }
    function eventsFromReadiness(readiness) {
        readiness = obj(readiness);
        if (!readiness.decision && !readiness.decision_label_en) return [];
        var status = readiness.decision === 'go' ? 'pass' : readiness.decision === 'no_go' ? 'fail' : 'warn';
        var conf = obj(readiness.confidence);
        var out = [event('readiness_decision', 'Readiness decision', status, (readiness.decision_label_en || readiness.decision) + ' / confidence ' + (conf.label || 'Unknown') + ' ' + (conf.score == null ? '' : conf.score + '%'), 'readiness_brief', 4)];
        arr(readiness.gates).forEach(function (g) {
            if (g && g.status && g.status !== 'pass') out.push(event('readiness_gate_' + (g.key || g.label || 'warn'), g.label || g.key || 'Readiness gate', g.status, g.detail || g.action || '', 'readiness_brief', g.status === 'fail' ? 3 : 2));
        });
        return out;
    }
    function eventsFromCard(card) {
        card = obj(card);
        var mode = obj(card.run_mode);
        if (!mode.key && !mode.label) return [];
        var status = mode.allowed === false ? 'fail' : mode.key === 'training_preview' || mode.key === 'cautious_test' ? 'warn' : 'pass';
        var out = [event('test_card_mode', 'Operator test-card mode', status, mode.label || mode.key || 'Unknown', 'test_card', 3)];
        arr(card.abort_criteria).forEach(function (a, idx) {
            out.push(event('abort_criteria_' + idx, 'Abort / pause criterion', 'info', a.label || String(a), 'test_card', 1));
        });
        return out;
    }
    function eventsFromRun(run) {
        run = obj(run);
        var scc = obj(run.control_center);
        var warn = obj(run.pause_abort_warning);
        var out = [];
        if (scc.state || scc.state_label) out.push(event('run_state', 'Scenario Control Center state', scc.state === 'scenario_blocked' ? 'fail' : (scc.state === 'scenario_complete' ? 'pass' : 'info'), scc.state_label || scc.state || 'Unknown', 'run_instrumentation', 3));
        if (warn.key || warn.label) out.push(event('pause_abort', 'Pause / abort status', warn.status || 'info', (warn.label || '') + (warn.detail ? ' — ' + warn.detail : ''), 'run_instrumentation', warn.status === 'fail' ? 4 : 2));
        if (arr(run.evidence_changes).length) out.push(event('evidence_changes', 'Evidence changes during run', 'warn', arr(run.evidence_changes).length + ' change(s)', 'run_instrumentation', 2));
        return out;
    }
    function eventsFromAar(aar) {
        aar = obj(aar);
        var outcome = obj(aar.outcome);
        var status = outcome.severity === 'fail' ? 'fail' : outcome.severity === 'warn' ? 'warn' : 'pass';
        var out = [];
        if (outcome.key || outcome.label) out.push(event('aar_outcome', 'After-action outcome', status, (outcome.label || outcome.key || 'Unknown') + ' / ' + (aar.release_interpretation || 'not release-grade evidence'), 'after_action_debrief', 5));
        arr(aar.unresolved_items).forEach(function (u) { out.push(event('aar_unresolved_' + (u.key || u.label || 'item'), u.label || u.key || 'Unresolved item', u.status || 'warn', u.detail || '', 'after_action_debrief', u.status === 'fail' ? 3 : 2)); });
        return out;
    }
    function eventsFromPackage(pkg) {
        pkg = obj(pkg);
        var summary = obj(pkg.summary);
        var readiness = obj(pkg.readiness);
        var out = [];
        if (summary.package_id || pkg.manifest) {
            out.push(event('package_summary', 'Evidence package', readiness.blocked ? 'fail' : (readiness.needs_review ? 'warn' : 'pass'), (summary.package_id || obj(pkg.manifest).package_id || 'package') + ' / ' + (summary.release_interpretation || readiness.release_interpretation || 'not release-grade evidence'), 'evidence_package', 4));
        }
        arr(pkg.handoff_checklist).forEach(function (item) {
            if (item && item.status && item.status !== 'pass') out.push(event('package_handoff_' + (item.key || item.label || 'item'), item.label || item.key || 'Package handoff item', item.status, item.detail || '', 'evidence_package', item.status === 'fail' ? 3 : 2));
        });
        return out;
    }
    function eventsFromReviewBoard(board) {
        board = obj(board);
        if (!board || !Object.keys(board).length) return [];
        var decision = board.decision || board.status || obj(board.summary).decision || obj(board.summary).status || 'review_pending';
        var label = board.decision_label_en || board.status_label_en || obj(board.summary).label || decision;
        var status = /approve|accepted|pass|ready/i.test(decision) ? 'pass' : /reject|blocked|fail|no/i.test(decision) ? 'fail' : 'warn';
        return [event('review_board_decision', 'Review Board decision', status, label, 'review_board', 4)];
    }
    function collectEvents(src) {
        return []
            .concat(eventsFromReadiness(src.readiness))
            .concat(eventsFromCard(src.test_card))
            .concat(eventsFromRun(src.run))
            .concat(eventsFromAar(src.aar))
            .concat(eventsFromPackage(src.evidence_package))
            .concat(eventsFromReviewBoard(src.review_board));
    }
    function counts(events) {
        var out = { pass: 0, warn: 0, fail: 0, info: 0, total: 0 };
        arr(events).forEach(function (e) { var s = e.status || 'info'; if (out[s] == null) out.info++; else out[s]++; out.total++; });
        return out;
    }
    function finalDecision(events, src) {
        var c = counts(events);
        var pkg = obj(src.evidence_package);
        var summary = obj(pkg.summary);
        if (c.fail > 0 || summary.blocked) return { key: 'blocked', label: 'Blocked / not accepted', severity: 'fail' };
        if (summary.training_only) return { key: 'training_only', label: 'Training-only evidence', severity: 'warn' };
        if (summary.release_grade_candidate && c.warn === 0) return { key: 'accepted', label: 'Accepted as release-grade candidate', severity: 'pass' };
        if (summary.release_grade_candidate || c.warn > 0) return { key: 'accepted_with_warnings', label: 'Accepted with warnings', severity: 'warn' };
        return { key: 'review_required', label: 'Review required', severity: 'warn' };
    }
    function nextActions(events, decision) {
        var actions = arr(events)
            .filter(function (e) { return e.status === 'fail' || e.status === 'warn'; })
            .sort(function (a, b) { return (b.weight || 0) - (a.weight || 0); })
            .slice(0, 8)
            .map(function (e) { return { key: 'action_' + e.key, label: e.label, detail: e.detail, source: e.source, status: e.status, read_only: true }; });
        if (!actions.length && obj(decision).severity === 'pass') {
            actions.push({ key: 'preserve_package', label: 'Preserve evidence package and after-action debrief.', detail: 'Use it as the baseline for the next CMO test iteration.', source: 'decision_ledger', status: 'pass', read_only: true });
        }
        return actions;
    }

    function buildLedger(input, opts) {
        opts = opts || {};
        var src = sourceFrom(input, opts);
        var events = collectEvents(src);
        var decision = finalDecision(events, src);
        return {
            version: CMO_WARGAME_DECISION_LEDGER_VERSION,
            generated_at: opts.generated_at || new Date().toISOString(),
            scenario_fingerprint: pickFingerprint(src, opts),
            final_decision: decision,
            event_counts: counts(events),
            events: events,
            next_actions: nextActions(events, decision),
            sources: {
                readiness: !!src.readiness,
                test_card: !!src.test_card,
                run_instrumentation: !!src.run,
                after_action_debrief: !!src.aar,
                evidence_package: !!src.evidence_package,
                review_board: !!src.review_board
            },
            source: 'CMO war-game readiness/run/AAR/package/review decision ledger',
            read_only: true
        };
    }
    function summaryText(ledger) {
        ledger = ledger && ledger.version ? ledger : buildLedger(ledger || null);
        var decision = obj(ledger.final_decision);
        var c = obj(ledger.event_counts);
        var lines = [
            'CMO War-Game Decision Ledger',
            '',
            'Final decision: ' + (decision.label || decision.key || 'Review required'),
            'Scenario fingerprint: ' + (ledger.scenario_fingerprint || 'unknown'),
            'Events: pass ' + (c.pass || 0) + ' / warn ' + (c.warn || 0) + ' / fail ' + (c.fail || 0) + ' / info ' + (c.info || 0),
            '',
            'Decision trail:'
        ];
        arr(ledger.events).forEach(function (e) { lines.push('- [' + String(e.status || 'info').toUpperCase() + '] ' + e.label + ': ' + e.detail + ' (' + e.source + ')'); });
        lines.push('');
        lines.push('Next actions:');
        arr(ledger.next_actions).forEach(function (a) { lines.push('- ' + a.label + (a.detail ? ': ' + a.detail : '')); });
        lines.push('');
        lines.push('Read-only ledger. It does not run, pause, release, mutate doctrine, mutate combat state, call a backend, or write storage.');
        return lines.join('\n');
    }
    function toJson(ledger) { return JSON.stringify(ledger && ledger.version ? ledger : buildLedger(ledger || null), null, 2); }
    function renderLedgerHtml(ledger) {
        ledger = ledger && ledger.version ? ledger : buildLedger(ledger || null);
        var d = obj(ledger.final_decision);
        var c = obj(ledger.event_counts);
        var html = '<div class="cmo-wargame-decision-ledger cmo-wargame-decision-ledger--' + esc(d.severity || 'warn') + '">' +
            '<div class="cmo-wargame-decision-ledger-header"><span>CMO War-Game Decision Ledger</span><span dir="rtl">سجل قرار اختبار المناورة</span><strong>' + esc(d.label || d.key || 'Review required') + '</strong></div>' +
            '<dl class="cmo-wargame-decision-ledger-meta"><div><dt>Fingerprint</dt><dd><code>' + esc(ledger.scenario_fingerprint || 'unknown') + '</code></dd></div><div><dt>Events</dt><dd>pass ' + esc(c.pass || 0) + ' / warn ' + esc(c.warn || 0) + ' / fail ' + esc(c.fail || 0) + '</dd></div></dl>' +
            '<ol class="cmo-wargame-decision-ledger-events">';
        arr(ledger.events).forEach(function (e) { html += '<li class="cmo-wargame-decision-ledger-event--' + esc(e.status || 'info') + '"><b>' + esc(e.label) + '</b><span>' + esc(e.detail) + '</span><em>' + esc(e.source) + '</em></li>'; });
        html += '</ol><div class="cmo-wargame-decision-ledger-actions"><strong>Next actions</strong><ul>';
        arr(ledger.next_actions).forEach(function (a) { html += '<li>' + esc(a.label) + (a.detail ? ' — ' + esc(a.detail) : '') + '</li>'; });
        html += '</ul></div><div class="cmo-wargame-decision-ledger-source">Source: ' + esc(ledger.source || '') + '. Read-only.</div></div>';
        return html;
    }

    var api = {
        CMO_WARGAME_DECISION_LEDGER_VERSION: CMO_WARGAME_DECISION_LEDGER_VERSION,
        buildLedger: buildLedger,
        collectEvents: collectEvents,
        summaryText: summaryText,
        toJson: toJson,
        renderLedgerHtml: renderLedgerHtml
    };

    root.RmoozCmoWarGameDecisionLedger = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
