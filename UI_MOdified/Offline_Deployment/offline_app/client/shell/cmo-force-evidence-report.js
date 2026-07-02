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
    function coverageApi() { return localApi('RmoozCmoEvidenceCoverage', 'cmo-evidence-coverage.js'); }
    function completenessApi() { return localApi('RmoozScenarioEvidenceCompleteness', 'scenario-evidence-completeness.js'); }
    function reviewQueueApi()  { return localApi('RmoozScenarioEvidenceReviewQueue',   'scenario-evidence-review-queue.js'); }
    function repairPlannerApi(){ return localApi('RmoozScenarioEvidenceRepairPlanner', 'scenario-evidence-repair-planner.js'); }

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
        var COV = coverageApi();
        var coverage = (COV && typeof COV.buildCoverage === 'function')
            ? COV.buildCoverage(ws, { matrix: matrix, alerts: alerts })
            : null;
        var SEV = completenessApi();
        var completeness = (SEV && typeof SEV.buildCompleteness === 'function')
            ? SEV.buildCompleteness(ws, { matrix: matrix })
            : null;
        var RQ = reviewQueueApi();
        var reviewQueue = (RQ && typeof RQ.buildReviewQueue === 'function')
            ? RQ.buildReviewQueue(ws, { matrix: matrix, completeness: completeness })
            : null;
        var RPP = repairPlannerApi();
        var repairPlan = (RPP && typeof RPP.buildRepairPlan === 'function')
            ? RPP.buildRepairPlan(ws, { matrix: matrix, review_queue: reviewQueue })
            : null;
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
            coverage: coverage,
            completeness: completeness,
            review_queue: reviewQueue,
            repair_plan: repairPlan,
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
        var comp = obj(report.completeness);
        if (comp.total_checked != null) {
            lines.push('Scenario Evidence Completeness:');
            lines.push('  Units checked: ' + (comp.total_checked || 0));
            lines.push('  Complete evidence: ' + (comp.complete || 0));
            lines.push('  Needs review: ' + (comp.needs_review || 0));
            if (comp.no_contact > 0)       lines.push('  No-contact evidence: ' + comp.no_contact);
            if (comp.missing_weapon > 0)   lines.push('  Missing weapon evidence: ' + comp.missing_weapon);
            if (comp.missing_range > 0)    lines.push('  Missing range evidence: ' + comp.missing_range);
            if (comp.missing_side > 0)     lines.push('  Missing side assignment: ' + comp.missing_side);
            if (comp.missing_coordinates > 0) lines.push('  Missing coordinates: ' + comp.missing_coordinates);
            lines.push('  Verdict: ' + (comp.verdict || 'unknown'));
            lines.push('');
        }
        var rq = obj(report.review_queue);
        if (arr(rq.groups).length) {
            lines.push('Scenario Evidence Review Queue:');
            arr(rq.groups).forEach(function (g) {
                arr(g.issues).slice(0, 8).forEach(function (issue) {
                    var who = issue.uid || issue.label || 'Objective';
                    lines.push('- ' + who + ' — ' + issue.reason);
                });
            });
            if (rq.total_issues > 0) lines.push('  (' + rq.total_issues + ' issue(s) total)');
            lines.push('');
        }
        var rp = obj(report.repair_plan);
        if (arr(rp.plans).length) {
            var bp = obj(rp.by_priority);
            lines.push('Scenario Evidence Repair Plan:');
            lines.push('  ' + (rp.total_repairs || 0) + ' repair(s) — critical ' + (bp.critical || 0) +
                ' / high ' + (bp.high || 0) + ' / medium ' + (bp.medium || 0) + ' / low ' + (bp.low || 0));
            var orr = obj(rp.objective_readiness);
            lines.push('  Objective X readiness: ' + (orr.health_pct == null ? 'unknown' : orr.health_pct + '%') +
                (orr.ready ? ' (ready)' : ' (' + (orr.failing_count || 0) + ' to repair)'));
            arr(rp.plans).slice(0, 6).forEach(function (p) {
                lines.push('  - [' + p.priority_label_en + '] ' + (p.uid || p.label || 'Objective') + ' — ' + p.reason);
            });
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

    function readOnlyDisclaimer() {
        return 'Read-only force evidence report. This report does not authorize fire, mutate doctrine, or change scenario state.';
    }

    function buildPrintableReportHtml(report) {
        report = obj(report);
        var counts = obj(report.counts);
        var topBlockers = arr(report.top_blockers);
        var rows = arr(report.readiness_rows);
        var events = arr(report.force_events).slice(-10);
        var selected = obj(report.selected_unit);
        var html = '<article class="cmo-print-report cmo-print-report--force">' +
            '<header class="cmo-print-header">' +
                '<div class="cmo-print-kicker">RMOOZ CMO Evidence</div>' +
                '<h1>Force Evidence Report</h1>' +
                '<div class="cmo-print-subtitle">تقرير أدلة القوة</div>' +
            '</header>' +
            '<section class="cmo-print-grid">' +
                '<div><span>Generated</span><strong>' + esc(report.generated_at || 'Unknown') + '</strong></div>' +
                '<div><span>Evidence Quality</span><strong>' + esc(obj(report.quality).status || (counts.Unknown || report.no_contact_count ? 'Needs Review' : 'Ready for Review')) + '</strong></div>' +
                '<div><span>Ready</span><strong>' + esc(counts.Ready || 0) + '</strong></div>' +
                '<div><span>Blocked</span><strong>' + esc(counts.Blocked || 0) + '</strong></div>' +
                '<div><span>Unknown</span><strong>' + esc(counts.Unknown || 0) + '</strong></div>' +
                '<div><span>No-contact</span><strong>' + esc(report.no_contact_count || 0) + '</strong></div>' +
                '<div><span>Selected unit</span><strong>' + esc(selected.label || selected.uid || 'None') + '</strong></div>' +
            '</section>' +
            (function () {
                var rp = obj(report.repair_plan);
                if (!arr(rp.plans).length) return '';
                var out = '<section class="cmo-print-section">' +
                    '<h2>Scenario Evidence Repair Plan / خطة إصلاح أدلة السيناريو</h2>' +
                    '<ol class="cmo-print-list">';
                arr(rp.plans).slice(0, 12).forEach(function (p) {
                    out += '<li><strong>[' + esc(p.priority_label_en) + ']</strong> ' +
                        esc(p.uid || p.label || 'Objective') + ' &mdash; ' + esc(p.reason) +
                        (arr(p.steps).length ? ': ' + esc(p.steps[0].en) : '') + '</li>';
                });
                out += '</ol></section>';
                return out;
            }()) +
            (function () {
                var rq = obj(report.review_queue);
                if (!arr(rq.groups).length) return '';
                var out = '<section class="cmo-print-section">' +
                    '<h2>Scenario Evidence Review Queue / قائمة مراجعة أدلة السيناريو</h2>' +
                    '<ul class="cmo-print-list">';
                arr(rq.groups).forEach(function (g) {
                    arr(g.issues).slice(0, 10).forEach(function (issue) {
                        out += '<li>' + esc(issue.uid || issue.label || 'Objective') + ' &mdash; ' + esc(issue.reason) +
                            (issue.reason_label_ar ? ' - <span dir="rtl">' + esc(issue.reason_label_ar) + '</span>' : '') + '</li>';
                    });
                });
                out += '</ul></section>';
                return out;
            }()) +
            (function () {
                var comp = obj(report.completeness);
                if (comp.total_checked == null) return '';
                var rows = '<section class="cmo-print-section">' +
                    '<h2>Scenario Evidence Completeness / اكتمال أدلة السيناريو</h2>' +
                    '<dl class="cmo-print-dl">' +
                    '<div><dt>Units checked</dt><dd>' + esc(comp.total_checked || 0) + '</dd></div>' +
                    '<div><dt>Complete evidence</dt><dd>' + esc(comp.complete || 0) + '</dd></div>' +
                    '<div><dt>Needs review</dt><dd>' + esc(comp.needs_review || 0) + '</dd></div>' +
                    '<div><dt>No-contact evidence</dt><dd>' + esc(comp.no_contact || 0) + '</dd></div>' +
                    '<div><dt>Missing weapon</dt><dd>' + esc(comp.missing_weapon || 0) + '</dd></div>' +
                    '<div><dt>Missing range</dt><dd>' + esc(comp.missing_range || 0) + '</dd></div>' +
                    '<div><dt>Verdict</dt><dd>' + esc(comp.verdict || 'unknown') + '</dd></div>' +
                    '</dl></section>';
                return rows;
            }()) +
            '<section class="cmo-print-section">' +
                '<h2>Top Blockers / أهم أسباب المنع</h2>' +
                '<ul class="cmo-print-list">';
        if (!topBlockers.length) {
            html += '<li>None recorded.</li>';
        } else {
            topBlockers.forEach(function (blocker) {
                blocker = obj(blocker);
                html += '<li>' + esc(blocker.code || 'unknown_reason') + ' x ' + esc(blocker.count || 0) +
                    ' - <span dir="rtl">' + esc(blocker.label_ar || reasonLabel(blocker.code, 'ar')) + '</span></li>';
            });
        }
        html += '</ul></section>' +
            '<section class="cmo-print-section">' +
                '<h2>Readiness Matrix / مصفوفة الجاهزية</h2>' +
                '<table class="cmo-print-table"><thead><tr><th>Unit</th><th>Contact</th><th>Final</th><th>Reason</th><th>Arabic</th></tr></thead><tbody>';
        if (!rows.length) {
            html += '<tr><td colspan="5">No readiness rows available.</td></tr>';
        } else {
            rows.forEach(function (row) {
                row = obj(row);
                html += '<tr><td>' + esc(row.unit_label || row.uid || 'Unknown unit') + '</td><td>' +
                    esc(row.contact_status || 'Unknown') + '</td><td>' +
                    esc(row.final_status || 'Unknown') + '</td><td>' +
                    esc(row.reason_code || 'None') + '</td><td dir="rtl">' +
                    esc(row.reason_label_ar || (row.reason_code ? reasonLabel(row.reason_code, 'ar') : '')) + '</td></tr>';
            });
        }
        html += '</tbody></table></section>' +
            '<section class="cmo-print-section">' +
                '<h2>Force Events / سجل أدلة القوة</h2>' +
                '<ul class="cmo-print-list">';
        if (!events.length) {
            html += '<li>No force evidence events recorded.</li>';
        } else {
            events.forEach(function (event) {
                event = obj(event);
                html += '<li>' + esc(event.timestamp || 'time unknown') + ' - ' +
                    esc(event.unit_label || event.uid || 'Force') + ' - ' +
                    esc(event.status || event.type || 'Evidence') +
                    (event.reason_code ? ' - ' + esc(event.reason_code) : '') +
                    (event.reason_label_ar ? ' - <span dir="rtl">' + esc(event.reason_label_ar) + '</span>' : '') +
                    '</li>';
            });
        }
        html += '</ul></section>' +
            '<footer class="cmo-print-disclaimer">' + esc(readOnlyDisclaimer()) + '</footer>' +
            '</article>';
        return html;
    }

    function printHtml(html) {
        if (!root.document || typeof root.print !== 'function') return false;
        var doc = root.document;
        var host = doc.getElementById('cmo-print-root');
        if (!host) {
            host = doc.createElement('div');
            host.id = 'cmo-print-root';
            host.className = 'cmo-print-root';
            doc.body.appendChild(host);
        }
        host.innerHTML = html;
        doc.body.setAttribute('data-cmo-print-mode', 'evidence');
        var cleanup = function () {
            doc.body.removeAttribute('data-cmo-print-mode');
        };
        if (typeof root.addEventListener === 'function') {
            root.addEventListener('afterprint', cleanup, { once: true });
        }
        root.print();
        setTimeout(cleanup, 1000);
        return true;
    }

    function printReport(report) {
        return printHtml(buildPrintableReportHtml(report));
    }

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
            '<button type="button" class="usp-force-report-btn usp-force-report-btn--print" data-cmo-force-report-action="print">Print Force Report</button>' +
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
                else if (action === 'print') printReport(report);
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
        buildPrintableReportHtml: buildPrintableReportHtml,
        printReport: printReport,
        renderReportHtml: renderReportHtml,
        bindReportActions: bindReportActions
    };

    root.RmoozCmoForceEvidenceReport = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
