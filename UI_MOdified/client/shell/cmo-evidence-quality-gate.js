/* ============================================================================
 * cmo-evidence-quality-gate.js - RMOOZ-CMO-12 evidence quality gate
 * ----------------------------------------------------------------------------
 * Read-only force-level trust check built from existing CMO readiness, alerts,
 * feed, and force-report evidence. Produces local UI evidence only.
 * No backend routes, scenario writes, combat mutation, or doctrine edits.
 * ========================================================================== */
(function (root) {
    'use strict';

    var CMO_EVIDENCE_QUALITY_GATE_VERSION = '1.0.0-rmooz-cmo-12';

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
    function alertsApi() { return localApi('RmoozCmoEvidenceAlerts', 'cmo-evidence-alerts.js'); }
    function reportApi() { return localApi('RmoozCmoForceEvidenceReport', 'cmo-force-evidence-report.js'); }
    function feedApi() { return localApi('RmoozCmoForceEvidenceFeed', 'cmo-force-evidence-feed.js'); }
    function labelsApi() { return localApi('AppCmoEvidenceLabels', 'cmo-evidence-labels.js'); }

    function reasonLabel(code, lang) {
        var labels = labelsApi();
        if (labels && typeof labels.reasonLabel === 'function') {
            try { return labels.reasonLabel(code || 'unknown_reason', lang || 'en'); } catch (_) {}
        }
        return code || 'unknown_reason';
    }

    function addWarning(warnings, code, count, text, labelAr) {
        warnings.push({
            code: code,
            count: count == null ? null : count,
            text: text,
            label_ar: labelAr || null
        });
    }

    function reportHasUnknown(report) {
        report = obj(report);
        if (obj(report.counts).Unknown > 0) return true;
        return arr(report.readiness_rows).some(function (row) {
            return obj(row).final_status === 'Unknown' || obj(row).reason_code === 'unknown_reason';
        });
    }

    function buildQualityGate(worldStateOrProvider, opts) {
        opts = opts || {};
        var ws = (typeof worldStateOrProvider === 'function') ? worldStateOrProvider() : worldStateOrProvider;
        var MX = matrixApi();
        var AL = alertsApi();
        var RP = reportApi();
        var FF = feedApi();
        var matrix = opts.matrix || (MX && typeof MX.buildMatrix === 'function'
            ? MX.buildMatrix(ws, { limit: opts.limit || 80, generated_at: opts.generated_at })
            : { counts: { Ready: 0, Blocked: 0, Unknown: 0 }, rows: [], top_blockers: [] });
        var alerts = opts.alerts || (AL && typeof AL.buildAlerts === 'function'
            ? AL.buildAlerts(matrix, { generated_at: opts.generated_at })
            : { no_contact_count: 0, top_blocker: null });
        var feedEvents = opts.feed_events || (FF && typeof FF.get === 'function' ? FF.get() : []);
        var report = opts.report || (RP && typeof RP.buildReport === 'function'
            ? RP.buildReport(ws, {
                matrix: matrix,
                alerts: alerts,
                feed_events: feedEvents,
                selected_unit: opts.selected_unit,
                generated_at: opts.generated_at
            })
            : { counts: obj(matrix.counts), readiness_rows: matrix.rows || [], force_events: feedEvents });
        var counts = {
            Ready: obj(matrix.counts).Ready || 0,
            Blocked: obj(matrix.counts).Blocked || 0,
            Unknown: obj(matrix.counts).Unknown || 0
        };
        var warnings = [];
        var noContact = alerts.no_contact_count || 0;
        if (!arr(matrix.rows).length) {
            addWarning(warnings, 'no_force_evidence', null, 'No force evidence rows are available', reasonLabel('no_engagement_evidence', 'ar'));
        }
        if (noContact > 0) {
            addWarning(warnings, 'no_contact_evidence', noContact, 'units have no contact evidence', reasonLabel('no_contact_evidence', 'ar'));
        }
        arr(matrix.top_blockers).forEach(function (blocker) {
            blocker = obj(blocker);
            if (blocker.code === 'no_contact_evidence') return;
            if (blocker.count > 0) {
                addWarning(warnings, blocker.code, blocker.count, 'units are blocked by ' + blocker.code, blocker.label_ar || reasonLabel(blocker.code, 'ar'));
            }
        });
        if (reportHasUnknown(report)) {
            addWarning(warnings, 'force_report_unknown', null, 'Force report includes unknown evidence', reasonLabel('unknown_reason', 'ar'));
        }

        var status = 'Ready for Review';
        if (!arr(matrix.rows).length) status = 'Unknown';
        else if (warnings.length || counts.Unknown > 0 || counts.Blocked > 0) status = 'Needs Review';

        return {
            version: CMO_EVIDENCE_QUALITY_GATE_VERSION,
            generated_at: opts.generated_at || new Date().toISOString(),
            status: status,
            counts: counts,
            no_contact_count: noContact,
            top_blockers: arr(matrix.top_blockers).map(function (b) {
                return {
                    code: b.code,
                    count: b.count,
                    label_ar: b.label_ar || reasonLabel(b.code, 'ar')
                };
            }),
            warnings: warnings,
            source: 'Readiness matrix + alerts + force report'
        };
    }

    function statusClass(status) {
        if (status === 'Ready for Review') return 'ready';
        if (status === 'Unknown') return 'unknown';
        return 'review';
    }

    function filterForWarning(code) {
        if (code === 'no_contact_evidence') return { status: 'Unknown', reason_code: 'no_contact_evidence' };
        if (code === 'force_report_unknown') return { status: 'Unknown', reason_code: null };
        if (code === 'no_force_evidence') return { status: 'All', reason_code: null };
        if (code) return { status: 'All', reason_code: code };
        return { status: 'All', reason_code: null };
    }

    function renderQualityGateHtml(quality) {
        quality = quality || buildQualityGate(null);
        var counts = obj(quality.counts);
        var warnings = arr(quality.warnings);
        var html = '<div class="usp-quality-status ' + esc(statusClass(quality.status)) + '">' +
            '<span>Status / &#1575;&#1604;&#1581;&#1575;&#1604;&#1577;</span><strong>' + esc(quality.status || 'Unknown') + '</strong>' +
            '</div>' +
            '<div class="usp-quality-counts">' +
            '<div><strong>' + esc(counts.Ready || 0) + '</strong><span>Ready units</span></div>' +
            '<div><strong>' + esc(counts.Blocked || 0) + '</strong><span>Blocked units</span></div>' +
            '<div><strong>' + esc(counts.Unknown || 0) + '</strong><span>Unknown units</span></div>' +
            '<div><strong>' + esc(quality.no_contact_count || 0) + '</strong><span>No-contact evidence</span></div>' +
            '</div>' +
            '<div class="usp-quality-warnings-title">Warnings / &#1578;&#1581;&#1584;&#1610;&#1585;&#1575;&#1578;</div>';
        if (!warnings.length) {
            html += '<div class="usp-quality-empty">No evidence quality warnings. / &#1604;&#1575; &#1578;&#1608;&#1580;&#1583; &#1578;&#1581;&#1584;&#1610;&#1585;&#1575;&#1578;</div>';
        } else {
            html += '<ul class="usp-quality-warnings">' + warnings.map(function (warning) {
                var count = warning.count == null ? '' : '<strong>' + esc(warning.count) + '</strong> ';
                var label = warning.label_ar ? '<em>' + esc(warning.label_ar) + '</em>' : '';
                return '<li><button type="button" class="usp-quality-warning-btn" data-cmo-quality-warning="' + esc(warning.code || '') + '">' +
                    count + '<span>' + esc(warning.text || warning.code || 'Evidence warning') + '</span>' + label +
                    '</button></li>';
            }).join('') + '</ul>';
        }
        html += '<div class="usp-quality-source">Source: ' + esc(quality.source || 'Readiness matrix + alerts + force report') + '</div>';
        return html;
    }

    function bindQualityInteractions(container, quality, opts) {
        opts = opts || {};
        if (!container || !container.querySelectorAll) return false;
        Array.prototype.forEach.call(container.querySelectorAll('[data-cmo-quality-warning]'), function (btn) {
            btn.addEventListener('click', function () {
                var code = btn.getAttribute('data-cmo-quality-warning');
                var filter = filterForWarning(code);
                if (opts.onFilter && typeof opts.onFilter === 'function') {
                    try { opts.onFilter(filter, quality); } catch (_) {}
                }
            });
        });
        return true;
    }

    var api = {
        CMO_EVIDENCE_QUALITY_GATE_VERSION: CMO_EVIDENCE_QUALITY_GATE_VERSION,
        buildQualityGate: buildQualityGate,
        filterForWarning: filterForWarning,
        renderQualityGateHtml: renderQualityGateHtml,
        bindQualityInteractions: bindQualityInteractions
    };

    root.RmoozCmoEvidenceQualityGate = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
