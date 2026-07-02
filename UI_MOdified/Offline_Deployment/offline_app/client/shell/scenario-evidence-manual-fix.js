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
            source: 'Review queue / repair planner issue'
        };
    }

    function renderWorkspaceHtml(workspace, opts) {
        opts = opts || {};
        var FS = statusApi();
        workspace = workspace || buildWorkspace(null);
        if (!workspace.active) {
            return '<div class="usp-manual-empty">Select a review-queue or repair-plan issue to track manual evidence review.<br>' +
                '&#1575;&#1582;&#1578;&#1585; &#1605;&#1588;&#1603;&#1604;&#1577; &#1605;&#1606; &#1602;&#1575;&#1574;&#1605;&#1577; &#1575;&#1604;&#1605;&#1585;&#1575;&#1580;&#1593;&#1577; &#1604;&#1578;&#1578;&#1576;&#1593; &#1575;&#1604;&#1605;&#1585;&#1575;&#1580;&#1593;&#1577; &#1575;&#1604;&#1610;&#1583;&#1608;&#1610;&#1577;.</div>';
        }
        var issue = obj(workspace.issue);
        var status = issue.manual_status || 'needs_review';
        var who = issue.uid || issue.label || 'Objective';
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
            '<div class="usp-manual-disclaimer">Local review status only. Does not modify scenario evidence, doctrine, or combat state.</div>' +
            '</div>';
        return html;
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
