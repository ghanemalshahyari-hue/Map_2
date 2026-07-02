/* ============================================================================
 * scenario-evidence-manual-fix.js - RMOOZ-QA-44 manual evidence fix workspace
 * ----------------------------------------------------------------------------
 * Guided manual review card for scenario evidence issues. It records local
 * review status only; it never applies fixes or changes scenario truth.
 * ========================================================================== */
(function (root) {
    'use strict';

    var SCENARIO_EVIDENCE_MANUAL_FIX_VERSION = '1.0.0-rmooz-qa-44';

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

    function statusApi() { return localApi('RmoozScenarioEvidenceFixStatus', 'scenario-evidence-fix-status.js'); }
    function plannerApi() { return localApi('RmoozScenarioEvidenceRepairPlanner', 'scenario-evidence-repair-planner.js'); }
    function sessionApi() { return localApi('RmoozScenarioEvidenceReviewSession', 'scenario-evidence-review-session.js'); }
    function auditApi() { return localApi('RmoozScenarioEvidenceReviewAuditTrail', 'scenario-evidence-review-audit-trail.js'); }

    var REQUIRED_FIELDS = {
        no_contact_evidence: ['contact source', 'detecting unit', 'last seen / freshness'],
        missing_weapon: ['weapon name or unarmed marker', 'weapon source'],
        no_weapon_evidence: ['weapon name or unarmed marker', 'weapon source'],
        no_engagement_evidence: ['target', 'weapon', 'range evidence'],
        missing_range: ['target distance', 'weapon max range'],
        doctrine_unknown: ['doctrine / ROE profile', 'source'],
        missing_coordinates: ['latitude', 'longitude', 'coordinate source'],
        missing_side: ['side', 'order-of-battle source'],
        missing_role: ['role / type / domain'],
        unknown: ['evidence source', 'operator note']
    };

    function priorityLabel(issue) {
        issue = obj(issue);
        if (issue.priority_label_en) return issue.priority_label_en;
        if (issue.priority === 1) return 'Critical';
        if (issue.priority === 2) return 'High';
        if (issue.priority === 3) return 'Medium';
        if (issue.priority === 4) return 'Low';
        return 'Medium';
    }

    function stepsFor(issue, repairPlan) {
        issue = obj(issue);
        var id = issue.issue_id || ((issue.uid || 'force') + '|' + (issue.reason || issue.code || 'unknown'));
        var code = issue.reason || issue.code || 'unknown';
        var plans = arr(obj(repairPlan).plans);
        for (var i = 0; i < plans.length; i++) {
            var p = plans[i];
            var pid = (p.issue_id || ((p.uid || 'force') + '|' + (p.reason || p.code || 'unknown')));
            if (pid === id || ((p.uid || '') === (issue.uid || '') && (p.reason || p.code) === code)) return arr(p.steps);
        }
        var RP = plannerApi();
        if (RP && RP.REPAIR_STEPS) return arr(RP.REPAIR_STEPS[code] || RP.REPAIR_STEPS.unknown);
        return [];
    }

    function buildWorkspace(issue, opts) {
        opts = opts || {};
        var FS = statusApi();
        var normalized = FS && typeof FS.enrichIssue === 'function'
            ? FS.enrichIssue(issue || {})
            : Object.assign({ manual_status: 'needs_review' }, obj(issue));
        var code = normalized.reason || normalized.code || 'unknown';
        var fields = arr(REQUIRED_FIELDS[code] || REQUIRED_FIELDS.unknown);
        return {
            version: SCENARIO_EVIDENCE_MANUAL_FIX_VERSION,
            active: !!(issue && (issue.reason || issue.code || issue.uid || issue.label)),
            issue: normalized,
            required_fields: fields,
            recommended_steps: stepsFor(normalized, opts.repair_plan),
            session: opts.session || (FS && typeof FS.getSessionMeta === 'function' ? FS.getSessionMeta() : null),
            source: 'Review queue / repair planner issue'
        };
    }

    function renderWorkspaceHtml(workspace, opts) {
        opts = opts || {};
        var FS = statusApi();
        workspace = workspace || buildWorkspace(null);
        if (!workspace.active) {
            return '<div class="usp-manual-empty">Select a review-queue or repair-plan issue to track manual evidence review.<br>' +
                '&#1575;&#1582;&#1578;&#1585; &#1605;&#1588;&#1603;&#1604;&#1577; &#1605;&#1606; &#1602;&#1575;&#1574;&#1605;&#1577; &#1575;&#1604;&#1605;&#1585;&#1575;&#1580;&#1593;&#1577; &#1604;&#1578;&#1578;&#1576;&#1593; &#1575;&#1604;&#1605;&#1585;&#1575;&#1580;&#1593;&#1577; &#1575;&#1604;&#1610;&#1583;&#1608;&#1610;&#1577;.</div>' +
                renderSessionControls(workspace);
        }
        var issue = obj(workspace.issue);
        var status = issue.manual_status || 'needs_review';
        var who = issue.uid || issue.label || 'Objective';
        var session = obj(workspace.session);
        var html = '<div class="usp-manual-card" data-manual-issue-id="' + esc(issue.issue_id || '') + '">' +
            '<div class="usp-manual-summary">' +
                '<span class="usp-manual-kicker">Manual Evidence Fix / &#1573;&#1589;&#1604;&#1575;&#1581; &#1575;&#1604;&#1571;&#1583;&#1604;&#1577; &#1575;&#1604;&#1610;&#1583;&#1608;&#1610;</span>' +
                '<strong>' + esc(who) + ' &mdash; ' + esc(issue.reason || issue.code || 'unknown') + '</strong>' +
                '<span class="usp-manual-priority">Priority: ' + esc(priorityLabel(issue)) + '</span>' +
                '<span class="usp-manual-status usp-manual-status--' + esc(status) + '">' +
                    esc(FS && FS.label ? FS.label(status, 'en') : status) +
                '</span>' +
            '</div>';
        if (arr(workspace.required_fields).length) {
            html += '<div class="usp-manual-fields"><span>Required fields</span><ul>';
            arr(workspace.required_fields).forEach(function (field) {
                html += '<li>' + esc(field) + '</li>';
            });
            html += '</ul></div>';
        }
        if (arr(workspace.recommended_steps).length) {
            html += '<div class="usp-manual-steps"><span>Recommended action</span><ol>';
            arr(workspace.recommended_steps).forEach(function (step) {
                step = obj(step);
                html += '<li>' + esc(step.en || step) + (step.ar ? '<small dir="rtl">' + esc(step.ar) + '</small>' : '') + '</li>';
            });
            html += '</ol></div>';
        }
        html += '<div class="usp-manual-controls" data-manual-status-controls="1">' +
            '<button type="button" data-manual-status="needs_review">Needs Review</button>' +
            '<button type="button" data-manual-status="reviewed">Reviewed</button>' +
            '<button type="button" data-manual-status="deferred">Deferred</button>' +
            '<button type="button" data-manual-status="fixed_externally">Fixed Externally</button>' +
            '</div>' +
            '<label class="usp-manual-note">Local note <textarea data-manual-note rows="2">' + esc(issue.manual_note || '') + '</textarea></label>' +
            renderSessionControls(workspace) +
            (session.stale ? '<div class="usp-manual-stale">Review session fingerprint differs from the current scenario. Verify before briefing.</div>' : '') +
            '<div class="usp-manual-disclaimer">Local review status only. Does not modify scenario evidence, doctrine, or combat state.</div>' +
            '</div>';
        return html;
    }

    function renderSessionControls(workspace) {
        var session = obj(obj(workspace).session);
        var fp = session.scenario_fingerprint || 'not-set';
        return '<div class="usp-manual-session">' +
            '<div class="usp-manual-session-meta">Review session: <code>' + esc(fp) + '</code>' +
                (session.updated_at ? ' · updated ' + esc(session.updated_at) : '') + '</div>' +
            '<div class="usp-manual-session-actions">' +
                '<button type="button" data-manual-session-action="copy">Copy Session JSON</button>' +
                '<button type="button" data-manual-session-action="download">Download Session JSON</button>' +
                '<button type="button" data-manual-session-action="import">Import Session JSON</button>' +
                '<button type="button" data-manual-session-action="clear">Clear Session</button>' +
            '</div>' +
            '<textarea data-manual-session-import rows="2" placeholder="Paste review-session JSON to import"></textarea>' +
            '</div>';
    }

    function copyText(text) {
        if (!root.navigator || !root.navigator.clipboard || typeof root.navigator.clipboard.writeText !== 'function') {
            return Promise.resolve(false);
        }
        return root.navigator.clipboard.writeText(String(text == null ? '' : text)).then(function () { return true; });
    }

    function downloadJson(payload, filename) {
        if (!root.document || typeof root.Blob !== 'function' || !root.URL || typeof root.URL.createObjectURL !== 'function') return false;
        var blob = new root.Blob([JSON.stringify(payload || {}, null, 2)], { type: 'application/json' });
        var url = root.URL.createObjectURL(blob);
        var a = root.document.createElement('a');
        a.href = url;
        a.download = filename || 'rmooz-evidence-review-session.json';
        root.document.body.appendChild(a);
        a.click();
        root.document.body.removeChild(a);
        setTimeout(function () { root.URL.revokeObjectURL(url); }, 0);
        return true;
    }

    function bindWorkspaceInteractions(container, workspace, opts) {
        opts = opts || {};
        if (!container || !container.querySelectorAll) return false;
        var FS = statusApi();
        if (!FS || typeof FS.setStatus !== 'function') return false;
        var issue = obj(obj(workspace).issue);
        Array.prototype.forEach.call(container.querySelectorAll('[data-manual-status]'), function (btn) {
            btn.addEventListener('click', function () {
                var noteEl = container.querySelector('[data-manual-note]');
                var rec = FS.setStatus(issue, btn.getAttribute('data-manual-status'), noteEl ? noteEl.value : '');
                if (opts.onStatusChange && typeof opts.onStatusChange === 'function') {
                    try { opts.onStatusChange(rec); } catch (_) {}
                }
            });
        });
        Array.prototype.forEach.call(container.querySelectorAll('[data-manual-session-action]'), function (btn) {
            var declaredAction = btn.getAttribute && btn.getAttribute('data-manual-session-action');
            if (['copy', 'download', 'import', 'clear'].indexOf(declaredAction) === -1) return;
            btn.addEventListener('click', function () {
                var action = btn.getAttribute('data-manual-session-action');
                var RS = sessionApi();
                if (!RS) return;
                var session = FS.getSessionMeta && FS.getSessionMeta();
                var fp = session && session.scenario_fingerprint;
                if (action === 'copy' && RS.exportSession) {
                    var copied = RS.exportSession(fp || 'unknown');
                    var AU = auditApi();
                    if (AU && AU.recordSessionEvent) try { AU.recordSessionEvent('session_exported', copied, { fingerprint: fp || 'unknown' }); } catch (_) {}
                    copyText(JSON.stringify(copied, null, 2));
                } else if (action === 'download' && RS.exportSession) {
                    var exported = RS.exportSession(fp || 'unknown');
                    var AUD = auditApi();
                    if (AUD && AUD.recordSessionEvent) try { AUD.recordSessionEvent('session_exported', exported, { fingerprint: fp || 'unknown' }); } catch (_) {}
                    downloadJson(exported);
                } else if (action === 'import' && RS.importSession) {
                    var importEl = container.querySelector('[data-manual-session-import]');
                    if (importEl && importEl.value) {
                        var imported = RS.importSession(importEl.value, { current_fingerprint: fp || 'unknown' });
                        if (FS.setScenarioContext) FS.setScenarioContext(imported.scenario_fingerprint || fp || 'unknown');
                        else if (FS.importRecords) FS.importRecords(imported.records, { replace: true });
                        var AUI = auditApi();
                        if (AUI && AUI.recordSessionEvent) try { AUI.recordSessionEvent('session_imported', imported, { fingerprint: imported.scenario_fingerprint || fp || 'unknown' }); } catch (_) {}
                        if (opts.onSessionChange) opts.onSessionChange(imported);
                    }
                } else if (action === 'clear') {
                    FS.reset();
                    if (opts.onSessionChange) opts.onSessionChange(FS.getSessionMeta && FS.getSessionMeta());
                }
            });
        });
        return true;
    }

    var api = {
        SCENARIO_EVIDENCE_MANUAL_FIX_VERSION: SCENARIO_EVIDENCE_MANUAL_FIX_VERSION,
        REQUIRED_FIELDS: REQUIRED_FIELDS,
        buildWorkspace: buildWorkspace,
        renderWorkspaceHtml: renderWorkspaceHtml,
        bindWorkspaceInteractions: bindWorkspaceInteractions
    };

    root.RmoozScenarioEvidenceManualFix = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
