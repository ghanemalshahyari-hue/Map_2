/* ============================================================================
 * scenario-evidence-review-closeout.js - RMOOZ-QA-59..65 closeout gate
 * ----------------------------------------------------------------------------
 * Read-only scenario evidence review closeout layer. It summarizes the current
 * review session, unresolved issues, deferred justifications, and fixed-
 * externally verification notes. It never mutates scenario/world-state truth,
 * doctrine, combat state, backend routes, or a database.
 * ========================================================================== */
(function (root) {
    'use strict';

    var SCENARIO_EVIDENCE_REVIEW_CLOSEOUT_VERSION = '1.0.0-rmooz-qa-59';

    var STATUS_META = {
        ready_for_handoff: {
            code: 'ready_for_handoff',
            label_en: 'Ready for Handoff',
            label_ar: '&#1580;&#1575;&#1607;&#1586; &#1604;&#1604;&#1578;&#1587;&#1604;&#1610;&#1605;',
            cls: 'ready'
        },
        needs_review: {
            code: 'needs_review',
            label_en: 'Needs Review',
            label_ar: '&#1610;&#1581;&#1578;&#1575;&#1580; &#1605;&#1585;&#1575;&#1580;&#1593;&#1577;',
            cls: 'needs'
        },
        ready_with_exceptions: {
            code: 'ready_with_exceptions',
            label_en: 'Ready with Exceptions',
            label_ar: '&#1580;&#1575;&#1607;&#1586; &#1605;&#1593; &#1575;&#1587;&#1578;&#1579;&#1606;&#1575;&#1569;&#1575;&#1578;',
            cls: 'exceptions'
        },
        incomplete: {
            code: 'incomplete',
            label_en: 'Incomplete',
            label_ar: '&#1594;&#1610;&#1585; &#1605;&#1603;&#1578;&#1605;&#1604;',
            cls: 'incomplete'
        }
    };

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

    function reviewQueueApi() { return localApi('RmoozScenarioEvidenceReviewQueue', 'scenario-evidence-review-queue.js'); }
    function fixStatusApi()  { return localApi('RmoozScenarioEvidenceFixStatus',   'scenario-evidence-fix-status.js'); }

    function hasNote(issue) {
        return !!String(obj(issue).manual_note || obj(issue).note || '').trim();
    }

    function compactIssue(issue) {
        issue = obj(issue);
        return {
            issue_id: issue.issue_id || ((issue.uid || 'force') + '|' + (issue.reason || issue.code || 'unknown')),
            uid: issue.uid || null,
            label: issue.label || issue.unit_label || issue.uid || null,
            side: issue.side || null,
            code: issue.reason || issue.code || 'unknown',
            status: issue.manual_status || issue.status || 'needs_review',
            note: issue.manual_note || issue.note || '',
            timestamp: issue.manual_timestamp || issue.timestamp || null
        };
    }

    function collectIssues(queueOrSummary, FS) {
        var issues = [];
        var queue = obj(queueOrSummary);
        if (arr(queue.records).length) issues = arr(queue.records);
        else if (arr(obj(queue.summary).records).length) issues = arr(queue.summary.records);
        else arr(queue.groups).forEach(function (g) {
            arr(g.issues).forEach(function (issue) { issues.push(issue); });
        });
        if (FS && typeof FS.enrichIssue === 'function') {
            issues = issues.map(function (issue) { return FS.enrichIssue(issue); });
        }
        return issues.map(compactIssue);
    }

    function countsFor(issues) {
        var c = { total: arr(issues).length, needs_review: 0, reviewed: 0, deferred: 0, fixed_externally: 0 };
        arr(issues).forEach(function (issue) {
            var s = compactIssue(issue).status;
            if (c[s] == null) c.needs_review++;
            else c[s]++;
        });
        return c;
    }

    function resolveStatus(issues, session, blockers) {
        var counts = countsFor(issues);
        var stored = arr(obj(session).records).length;
        if (counts.total === 0) return STATUS_META.incomplete;
        if (counts.total > 0 && stored === 0 && counts.reviewed === 0 && counts.deferred === 0 && counts.fixed_externally === 0) {
            return STATUS_META.incomplete;
        }
        if (counts.needs_review > 0) return STATUS_META.needs_review;
        if (arr(blockers).length) return STATUS_META.needs_review;
        if (counts.deferred > 0) return STATUS_META.ready_with_exceptions;
        return STATUS_META.ready_for_handoff;
    }

    function buildCloseout(queueOrProvider, opts) {
        opts = opts || {};
        var queue = typeof queueOrProvider === 'function' ? queueOrProvider() : queueOrProvider;
        var FS = fixStatusApi();
        var RQ = reviewQueueApi();
        if (!queue && RQ && typeof RQ.buildReviewQueue === 'function') {
            queue = RQ.buildReviewQueue(opts.world_state || null, opts);
        }
        var session = opts.session || (FS && typeof FS.getSessionMeta === 'function' ? FS.getSessionMeta() : null);
        var issues = collectIssues(queue, FS);
        var counts = countsFor(issues);
        var needs = issues.filter(function (i) { return i.status === 'needs_review'; });
        var deferred = issues.filter(function (i) { return i.status === 'deferred'; });
        var fixed = issues.filter(function (i) { return i.status === 'fixed_externally'; });
        var deferredMissing = deferred.filter(function (i) { return !hasNote(i); });
        var fixedMissing = fixed.filter(function (i) { return !hasNote(i); });
        var blockers = [];
        if (needs.length) blockers.push({ code: 'needs_review_remaining', count: needs.length, label: needs.length + ' issue(s) still need review' });
        if (deferredMissing.length) blockers.push({ code: 'deferred_missing_justification', count: deferredMissing.length, label: deferredMissing.length + ' deferred issue(s) need justification' });
        if (fixedMissing.length) blockers.push({ code: 'fixed_externally_missing_verification', count: fixedMissing.length, label: fixedMissing.length + ' fixed-externally issue(s) need verification note' });
        if (!issues.length) blockers.push({ code: 'no_review_state', count: 1, label: 'No review issue state available' });
        var status = resolveStatus(issues, session, blockers);
        return {
            version: SCENARIO_EVIDENCE_REVIEW_CLOSEOUT_VERSION,
            generated_at: opts.generated_at || new Date().toISOString(),
            status: status.code,
            status_label_en: status.label_en,
            status_label_ar: status.label_ar,
            counts: counts,
            blockers: blockers,
            unresolved: needs,
            deferred_without_note: deferredMissing,
            fixed_externally_without_note: fixedMissing,
            deferred: deferred,
            fixed_externally: fixed,
            reviewed: issues.filter(function (i) { return i.status === 'reviewed'; }),
            issues: issues,
            session: session,
            source: 'Review queue + persisted manual review session',
            read_only: true
        };
    }

    function buildSummary(closeout) {
        closeout = obj(closeout);
        var c = obj(closeout.counts);
        var lines = [
            'Evidence Review Closeout',
            '',
            'Status: ' + (closeout.status_label_en || closeout.status || 'Incomplete'),
            'Needs Review: ' + (c.needs_review || 0),
            'Deferred: ' + (c.deferred || 0),
            'Reviewed: ' + (c.reviewed || 0),
            'Fixed Externally: ' + (c.fixed_externally || 0),
            ''
        ];
        lines.push('Blocking closeout:');
        if (!arr(closeout.blockers).length) lines.push('- None');
        else arr(closeout.blockers).forEach(function (b) { lines.push('- ' + b.label); });
        lines.push('');
        if (arr(closeout.deferred).length) {
            lines.push('Deferred issue justifications:');
            arr(closeout.deferred).forEach(function (i) {
                lines.push('- ' + (i.uid || i.label || 'Objective') + ' - ' + i.code + ': ' + (i.note || 'JUSTIFICATION REQUIRED'));
            });
            lines.push('');
        }
        if (arr(closeout.fixed_externally).length) {
            lines.push('Fixed-externally verification:');
            arr(closeout.fixed_externally).forEach(function (i) {
                lines.push('- ' + (i.uid || i.label || 'Objective') + ' - ' + i.code + ': ' + (i.note || 'VERIFICATION NOTE REQUIRED'));
            });
            lines.push('');
        }
        lines.push('Read-only closeout summary. Does not modify scenario evidence, doctrine, or combat state.');
        lines.push('Generated: ' + (closeout.generated_at || 'unknown'));
        return lines.join('\n');
    }

    function toJson(closeout) { return JSON.stringify(closeout || {}, null, 2); }

    function copyText(text) {
        if (!root.navigator || !root.navigator.clipboard || typeof root.navigator.clipboard.writeText !== 'function') {
            return Promise.resolve(false);
        }
        return root.navigator.clipboard.writeText(String(text == null ? '' : text)).then(function () { return true; });
    }
    function copySummary(closeout) { return copyText(buildSummary(closeout)); }
    function copyJson(closeout) { return copyText(toJson(closeout)); }

    function downloadJson(closeout, filename) {
        if (!root.document || typeof root.Blob !== 'function' || !root.URL || typeof root.URL.createObjectURL !== 'function') return false;
        var blob = new root.Blob([toJson(closeout)], { type: 'application/json' });
        var url = root.URL.createObjectURL(blob);
        var a = root.document.createElement('a');
        a.href = url;
        a.download = filename || 'rmooz-evidence-review-closeout.json';
        root.document.body.appendChild(a);
        a.click();
        root.document.body.removeChild(a);
        setTimeout(function () { root.URL.revokeObjectURL(url); }, 0);
        return true;
    }

    function renderCloseoutHtml(closeout) {
        closeout = closeout || buildCloseout(null);
        var c = obj(closeout.counts);
        var cls = obj(STATUS_META[closeout.status]).cls || 'incomplete';
        var html = '<div class="usp-closeout-card usp-closeout-card--' + esc(cls) + '">' +
            '<div class="usp-closeout-header">' +
                '<span class="usp-closeout-title">Evidence Review Closeout</span>' +
                '<span class="usp-closeout-title-ar" dir="rtl">&#1573;&#1594;&#1604;&#1575;&#1602; &#1605;&#1585;&#1575;&#1580;&#1593;&#1577; &#1575;&#1604;&#1571;&#1583;&#1604;&#1577;</span>' +
                '<strong>' + esc(closeout.status_label_en || closeout.status) + '</strong>' +
                '<span dir="rtl">' + esc(closeout.status_label_ar || '') + '</span>' +
            '</div>' +
            '<div class="usp-closeout-counts">' +
                '<span>Needs Review: ' + esc(c.needs_review || 0) + '</span>' +
                '<span>Deferred: ' + esc(c.deferred || 0) + '</span>' +
                '<span>Reviewed: ' + esc(c.reviewed || 0) + '</span>' +
                '<span>Fixed Externally: ' + esc(c.fixed_externally || 0) + '</span>' +
            '</div>';
        html += '<div class="usp-closeout-blockers"><span>Blocking closeout</span><ul>';
        if (!arr(closeout.blockers).length) html += '<li>None</li>';
        else arr(closeout.blockers).forEach(function (b) { html += '<li>' + esc(b.label) + '</li>'; });
        html += '</ul></div>';
        if (arr(closeout.deferred_without_note).length) {
            html += '<div class="usp-closeout-prompt"><strong>Deferred Issue Justification Prompt</strong><ul>';
            arr(closeout.deferred_without_note).forEach(function (i) {
                html += '<li>' + esc(i.uid || i.label || 'Objective') + ' - ' + esc(i.code) + ': add a local note explaining why this remains deferred.</li>';
            });
            html += '</ul></div>';
        }
        if (arr(closeout.fixed_externally_without_note).length) {
            html += '<div class="usp-closeout-prompt"><strong>Fixed-Externally Verification Checklist</strong><ul>';
            arr(closeout.fixed_externally_without_note).forEach(function (i) {
                html += '<li>' + esc(i.uid || i.label || 'Objective') + ' - ' + esc(i.code) + ': verify source owner, evidence field, and re-check plan before handoff.</li>';
            });
            html += '</ul></div>';
        }
        html += '<div class="usp-closeout-actions">' +
            '<button type="button" data-closeout-action="summary">Copy Closeout Summary</button>' +
            '<button type="button" data-closeout-action="json">Copy Closeout JSON</button>' +
            '<button type="button" data-closeout-action="download">Download Closeout JSON</button>' +
            '</div>' +
            '<div class="usp-closeout-source">Source: ' + esc(closeout.source || '') + '</div>' +
            '</div>';
        return html;
    }

    function bindCloseoutActions(container, closeout) {
        if (!container || !container.querySelectorAll) return false;
        Array.prototype.forEach.call(container.querySelectorAll('[data-closeout-action]'), function (btn) {
            btn.addEventListener('click', function () {
                var action = btn.getAttribute('data-closeout-action');
                if (action === 'summary') copySummary(closeout);
                else if (action === 'json') copyJson(closeout);
                else if (action === 'download') downloadJson(closeout);
            });
        });
        return true;
    }

    var api = {
        SCENARIO_EVIDENCE_REVIEW_CLOSEOUT_VERSION: SCENARIO_EVIDENCE_REVIEW_CLOSEOUT_VERSION,
        STATUS_META: STATUS_META,
        buildCloseout: buildCloseout,
        buildSummary: buildSummary,
        toJson: toJson,
        copySummary: copySummary,
        copyJson: copyJson,
        downloadJson: downloadJson,
        renderCloseoutHtml: renderCloseoutHtml,
        bindCloseoutActions: bindCloseoutActions
    };

    root.RmoozScenarioEvidenceReviewCloseout = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
