/* ============================================================================
 * cmo-force-evidence-report.js - RMOOZ-CMO-11 force evidence report export
 * ----------------------------------------------------------------------------
 * Read-only force-level report built from the readiness matrix, alert counts,
 * and force evidence feed. Produces local JSON and summary text only.
 * No backend routes, PDF generation, state writes, combat mutation, or doctrine edits.
 * ========================================================================== */
(function (root) {
    'use strict';

    var CMO_FORCE_EVIDENCE_REPORT_VERSION = '1.0.0-rmooz-cmo-11';

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

    function labelsApi() { return localApi('AppCmoEvidenceLabels', 'cmo-evidence-labels.js'); }
    function matrixApi() { return localApi('RmoozCmoEvidenceReadinessMatrix', 'cmo-evidence-readiness-matrix.js'); }
    function alertsApi() { return localApi('RmoozCmoEvidenceAlerts', 'cmo-evidence-alerts.js'); }
    function feedApi() { return localApi('RmoozCmoForceEvidenceFeed', 'cmo-force-evidence-feed.js'); }

    function reasonLabel(code, lang) {
        var labels = labelsApi();
        if (labels && typeof labels.reasonLabel === 'function') {
            try { return labels.reasonLabel(code || 'unknown_reason', lang || 'en'); } catch (_) {}
        }
        return code || 'unknown_reason';
    }

    function compactRows(rows) {
        return arr(rows).map(function (row) {
            row = obj(row);
            return {
                uid: row.uid || null,
                unit_label: row.unit_label || row.uid || 'Unknown unit',
                side: row.side || null,
                contact_status: row.contact_status || 'Unknown',
                engagement_status: row.engagement_status || 'Unknown',
                final_status: row.final_status || 'Unknown',
                reason_code: row.reason_code || null,
                reason_label_ar: row.reason_code ? reasonLabel(row.reason_code, 'ar') : null,
                target_uid: row.target_uid || null,
                weapon: row.weapon || null
            };
        });
    }

    function compactEvents(events) {
        return arr(events).map(function (event) {
            event = obj(event);
            return {
                timestamp: event.timestamp || null,
                type: event.type || null,
                uid: event.uid || null,
                unit_label: event.unit_label || event.uid || 'Force',
                status: event.status || null,
                reason_code: event.reason_code || null,
                reason_label_ar: event.reason_label_ar || (event.reason_code ? reasonLabel(event.reason_code, 'ar') : null),
                count: event.count == null ? null : event.count,
                source: event.source || null
            };
        });
    }

    function selectedUnitSummary(unit) {
        unit = obj(unit);
        var uid = unit.uid || unit.id || unit.unit_uid || unit.unitId || null;
        if (!uid && !unit.label && !unit.name) return null;
        return {
            uid: uid,
            label: unit.label || unit.name || unit.displayName || unit.display_name || uid || 'Unknown unit',
            side: unit.side || unit.team || null,
            domain: unit.domain || null,
            role: unit.role || null
        };
    }

    function buildReport(worldStateOrProvider, opts) {
        opts = opts || {};
        var ws = (typeof worldStateOrProvider === 'function') ? worldStateOrProvider() : worldStateOrProvider;
        var MX = matrixApi();
        var AL = alertsApi();
        var FF = feedApi();
        var matrix = opts.matrix || (MX && typeof MX.buildMatrix === 'function'
            ? MX.buildMatrix(ws, { limit: opts.limit || 80, generated_at: opts.generated_at })
            : { counts: { Ready: 0, Blocked: 0, Unknown: 0 }, rows: [], top_blockers: [] });
        var alerts = opts.alerts || (AL && typeof AL.buildAlerts === 'function'
            ? AL.buildAlerts(matrix, { generated_at: opts.generated_at })
            : { no_contact_count: 0, top_blocker: null });
        var feedEvents = opts.feed_events || (FF && typeof FF.get === 'function' ? FF.get() : []);
        var selected = selectedUnitSummary(opts.selected_unit);
        return {
            version: CMO_FORCE_EVIDENCE_REPORT_VERSION,
            generated_at: opts.generated_at || new Date().toISOString(),
            scenario: obj(opts.scenario),
            counts: {
                Ready: obj(matrix.counts).Ready || 0,
                Blocked: obj(matrix.counts).Blocked || 0,
                Unknown: obj(matrix.counts).Unknown || 0
            },
            no_contact_count: alerts.no_contact_count || 0,
            top_blockers: arr(matrix.top_blockers).map(function (b) {
                return {
                    code: b.code,
                    count: b.count,
                    label_ar: b.label_ar || reasonLabel(b.code, 'ar')
                };
            }),
            readiness_rows: compactRows(matrix.rows),
            force_events: compactEvents(feedEvents),
            selected_unit: selected,
            source: 'Readiness matrix + force evidence feed'
        };
    }

    function buildSummary(report) {
        report = obj(report);
        var counts = obj(report.counts);
        var top = arr(report.top_blockers)[0];
        var events = arr(report.force_events).slice(-6);
        var lines = [
            'Force Evidence Report',
            '',
            'Ready units: ' + (counts.Ready || 0),
            'Blocked units: ' + (counts.Blocked || 0),
            'Unknown units: ' + (counts.Unknown || 0),
            'No contact evidence: ' + (report.no_contact_count || 0),
            ''
        ];
        if (top) {
            lines.push('Top blocker:');
            lines.push(top.code + ' x ' + top.count + ' - ' + (top.label_ar || reasonLabel(top.code, 'ar')));
            lines.push('');
        }
        if (report.selected_unit) {
            lines.push('Selected unit: ' + (report.selected_unit.label || report.selected_unit.uid || 'Unknown unit'));
            lines.push('');
        }
        lines.push('Latest force events:');
        if (!events.length) {
            lines.push('- None recorded');
        } else {
            events.forEach(function (event) {
                var unit = event.unit_label || event.uid || 'Force';
                var status = event.status || event.type || 'Evidence';
                var reason = event.reason_code ? ': ' + event.reason_code : '';
                var label = event.reason_code ? ' - ' + (event.reason_label_ar || reasonLabel(event.reason_code, 'ar')) : '';
                lines.push('- ' + unit + ' ' + String(status).toLowerCase() + reason + label);
            });
        }
        lines.push('');
        lines.push('Generated: ' + (report.generated_at || 'Unknown'));
        return lines.join('\n');
    }

    function toJson(report) {
        return JSON.stringify(report || {}, null, 2);
    }

    function copyText(text) {
        if (!root.navigator || !root.navigator.clipboard || typeof root.navigator.clipboard.writeText !== 'function') {
            return Promise.resolve(false);
        }
        return root.navigator.clipboard.writeText(String(text == null ? '' : text)).then(function () { return true; });
    }

    function copyJson(report) { return copyText(toJson(report)); }
    function copySummary(report) { return copyText(buildSummary(report)); }

    function downloadJson(report, filename) {
        if (!root.document || typeof root.Blob !== 'function' || !root.URL || typeof root.URL.createObjectURL !== 'function') {
            return false;
        }
        var blob = new root.Blob([toJson(report)], { type: 'application/json' });
        var url = root.URL.createObjectURL(blob);
        var a = root.document.createElement('a');
        a.href = url;
        a.download = filename || 'rmooz-force-evidence-report.json';
        root.document.body.appendChild(a);
        a.click();
        root.document.body.removeChild(a);
        setTimeout(function () { root.URL.revokeObjectURL(url); }, 0);
        return true;
    }

    function renderReportHtml(report) {
        return '<div class="usp-force-report-actions">' +
            '<button type="button" class="usp-force-report-btn" data-cmo-force-report-action="summary">Copy Summary</button>' +
            '<button type="button" class="usp-force-report-btn" data-cmo-force-report-action="json">Copy JSON</button>' +
            '<button type="button" class="usp-force-report-btn" data-cmo-force-report-action="download">Download JSON</button>' +
            '</div>' +
            '<pre class="usp-force-report-summary">' + esc(buildSummary(report)) + '</pre>';
    }

    function bindReportActions(container, report) {
        if (!container || !container.querySelectorAll) return false;
        Array.prototype.forEach.call(container.querySelectorAll('[data-cmo-force-report-action]'), function (btn) {
            btn.addEventListener('click', function () {
                var action = btn.getAttribute('data-cmo-force-report-action');
                if (action === 'summary') copySummary(report);
                else if (action === 'json') copyJson(report);
                else if (action === 'download') downloadJson(report);
            });
        });
        return true;
    }

    var api = {
        CMO_FORCE_EVIDENCE_REPORT_VERSION: CMO_FORCE_EVIDENCE_REPORT_VERSION,
        buildReport: buildReport,
        buildSummary: buildSummary,
        toJson: toJson,
        copyJson: copyJson,
        copySummary: copySummary,
        downloadJson: downloadJson,
        renderReportHtml: renderReportHtml,
        bindReportActions: bindReportActions
    };

    root.RmoozCmoForceEvidenceReport = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
