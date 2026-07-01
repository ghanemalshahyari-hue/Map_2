/* ============================================================================
 * cmo-evidence-alerts.js - RMOOZ-CMO-9 evidence alert badges
 * ----------------------------------------------------------------------------
 * Read-only alert strip derived from the CMO readiness matrix. It surfaces
 * blocked/unknown/no-contact/top-blocker counts and emits matrix filter intents.
 * No backend routes, scenario writes, combat mutation, or doctrine edits.
 * ========================================================================== */
(function (root) {
    'use strict';

    var CMO_EVIDENCE_ALERTS_VERSION = '1.0.0-rmooz-cmo-9';

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

    function matrixApi() { return localApi('RmoozCmoEvidenceReadinessMatrix', 'cmo-evidence-readiness-matrix.js'); }
    function labelsApi() { return localApi('AppCmoEvidenceLabels', 'cmo-evidence-labels.js'); }

    function reasonLabel(code, lang) {
        var labels = labelsApi();
        if (labels && typeof labels.reasonLabel === 'function') {
            try { return labels.reasonLabel(code || 'unknown_reason', lang || 'en'); } catch (_) {}
        }
        return code || 'unknown_reason';
    }

    function buildAlerts(matrixOrWorldState, opts) {
        opts = opts || {};
        var MX = matrixApi();
        var matrix = matrixOrWorldState && matrixOrWorldState.rows && matrixOrWorldState.counts
            ? matrixOrWorldState
            : (MX && typeof MX.buildMatrix === 'function' ? MX.buildMatrix(matrixOrWorldState, opts) : { counts: {}, rows: [], top_blockers: [] });
        var rows = arr(matrix.rows);
        var noContact = rows.filter(function (row) { return row.reason_code === 'no_contact_evidence'; }).length;
        var top = arr(matrix.top_blockers)[0] || null;
        return {
            version: CMO_EVIDENCE_ALERTS_VERSION,
            generated_at: opts.generated_at || new Date().toISOString(),
            blocked_count: obj(matrix.counts).Blocked || 0,
            unknown_count: obj(matrix.counts).Unknown || 0,
            no_contact_count: noContact,
            top_blocker: top ? {
                code: top.code,
                count: top.count,
                label_ar: top.label_ar || reasonLabel(top.code, 'ar')
            } : null,
            matrix: matrix
        };
    }

    function badge(label, value, cls, action, extra) {
        extra = extra || '';
        return '<button type="button" class="usp-alert-badge ' + esc(cls || '') + '" data-cmo-alert-action="' +
            esc(action || '') + '"' + extra + '>' +
            '<span class="usp-alert-label">' + esc(label) + '</span>' +
            '<strong class="usp-alert-value">' + esc(value) + '</strong>' +
            '</button>';
    }

    function renderAlertsHtml(alerts) {
        alerts = alerts || buildAlerts(null);
        var top = alerts.top_blocker;
        var topText = top ? (top.code + ' x ' + top.count) : 'None';
        var topExtra = top ? ' data-cmo-alert-reason="' + esc(top.code) + '"' : '';
        return '<div class="usp-alert-grid">' +
            badge('Blocked / ممنوع', alerts.blocked_count || 0, 'blocked', 'blocked') +
            badge('Unknown / غير معروف', alerts.unknown_count || 0, 'unknown', 'unknown') +
            badge('No contact / لا رصد', alerts.no_contact_count || 0, 'contact', 'no_contact') +
            badge('Top blocker / أهم سبب', topText, 'top', 'top_blocker', topExtra) +
            '</div>' +
            (top && top.label_ar ? '<div class="usp-alert-top-label">' + esc(top.label_ar) + '</div>' : '');
    }

    function filterForAction(action, reason) {
        if (action === 'blocked') return { status: 'Blocked', reason_code: null };
        if (action === 'unknown') return { status: 'Unknown', reason_code: null };
        if (action === 'no_contact') return { status: 'All', reason_code: 'no_contact_evidence' };
        if (action === 'top_blocker' && reason) return { status: 'All', reason_code: reason };
        return { status: 'All', reason_code: null };
    }

    function bindAlertInteractions(container, alerts, opts) {
        opts = opts || {};
        if (!container || !container.querySelectorAll) return false;
        Array.prototype.forEach.call(container.querySelectorAll('[data-cmo-alert-action]'), function (btn) {
            btn.addEventListener('click', function () {
                var action = btn.getAttribute('data-cmo-alert-action');
                var reason = btn.getAttribute('data-cmo-alert-reason');
                var filter = filterForAction(action, reason);
                if (opts.onFilter && typeof opts.onFilter === 'function') {
                    try { opts.onFilter(filter, alerts); } catch (_) {}
                }
            });
        });
        return true;
    }

    var api = {
        CMO_EVIDENCE_ALERTS_VERSION: CMO_EVIDENCE_ALERTS_VERSION,
        buildAlerts: buildAlerts,
        renderAlertsHtml: renderAlertsHtml,
        filterForAction: filterForAction,
        bindAlertInteractions: bindAlertInteractions
    };

    root.RmoozCmoEvidenceAlerts = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
