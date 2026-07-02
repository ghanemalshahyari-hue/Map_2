/* ============================================================================
 * scenario-evidence-handoff-package.js - RMOOZ-QA-75..82 handoff package
 * ----------------------------------------------------------------------------
 * Browser-local evidence review handoff package builder/import preview. Packages
 * review session UI state, closeout, audit trail, and force report artifacts.
 * Import restores review-session UI state only; it never mutates scenario truth,
 * world state, doctrine, combat state, backend routes, or a database.
 * ========================================================================== */
(function (root) {
    'use strict';

    var SCENARIO_EVIDENCE_HANDOFF_PACKAGE_VERSION = '1.0.0-rmooz-qa-75';
    var PACKAGE_TYPE = 'rmooz.scenarioEvidenceHandoffPackage';

    var STATUS_META = {
        ready: {
            code: 'ready',
            label_en: 'Ready',
            label_ar: '&#1580;&#1575;&#1607;&#1586;',
            cls: 'ready'
        },
        needs_review: {
            code: 'needs_review',
            label_en: 'Needs Review',
            label_ar: '&#1610;&#1581;&#1578;&#1575;&#1580; &#1605;&#1585;&#1575;&#1580;&#1593;&#1577;',
            cls: 'needs'
        },
        fingerprint_mismatch: {
            code: 'fingerprint_mismatch',
            label_en: 'Fingerprint mismatch',
            label_ar: '&#1593;&#1583;&#1605; &#1578;&#1591;&#1575;&#1576;&#1602; &#1576;&#1589;&#1605;&#1577; &#1575;&#1604;&#1587;&#1610;&#1606;&#1575;&#1585;&#1610;&#1608;',
            cls: 'mismatch'
        },
        invalid_package: {
            code: 'invalid_package',
            label_en: 'Invalid package',
            label_ar: '&#1581;&#1586;&#1605;&#1577; &#1594;&#1610;&#1585; &#1589;&#1575;&#1604;&#1581;&#1577;',
            cls: 'invalid'
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

    function sessionApi() { return localApi('RmoozScenarioEvidenceReviewSession', 'scenario-evidence-review-session.js'); }
    function fixStatusApi() { return localApi('RmoozScenarioEvidenceFixStatus', 'scenario-evidence-fix-status.js'); }
    function reviewQueueApi() { return localApi('RmoozScenarioEvidenceReviewQueue', 'scenario-evidence-review-queue.js'); }
    function closeoutApi() { return localApi('RmoozScenarioEvidenceReviewCloseout', 'scenario-evidence-review-closeout.js'); }
    function auditApi() { return localApi('RmoozScenarioEvidenceReviewAuditTrail', 'scenario-evidence-review-audit-trail.js'); }
    function reportApi() { return localApi('RmoozCmoForceEvidenceReport', 'cmo-force-evidence-report.js'); }

    function resolveWorldState(input) {
        if (typeof input === 'function') {
            try { return input(); } catch (_) { return null; }
        }
        return input || null;
    }

    function fingerprint(input, opts) {
        opts = opts || {};
        if (opts.fingerprint) return String(opts.fingerprint);
        if (typeof input === 'string') return input;
        var RS = sessionApi();
        if (RS && typeof RS.computeFingerprint === 'function') {
            try { return RS.computeFingerprint(input || 'unknown', opts); } catch (_) {}
        }
        return 'unknown';
    }

    function sessionFor(fp, opts) {
        opts = opts || {};
        if (opts.review_session) return obj(opts.review_session);
        var FS = fixStatusApi();
        var meta = FS && typeof FS.getSessionMeta === 'function' ? FS.getSessionMeta() : null;
        if (meta && meta.scenario_fingerprint === fp) return meta;
        var RS = sessionApi();
        return RS && typeof RS.loadSession === 'function' ? RS.loadSession(fp) : {
            scenario_fingerprint: fp,
            records: [],
            read_only: true
        };
    }

    function compactSession(session, fp, opts) {
        opts = opts || {};
        session = obj(session);
        var RS = sessionApi();
        if (RS && typeof RS.exportSession === 'function') {
            try {
                return RS.exportSession(fp, { session: session, generated_at: opts.generated_at });
            } catch (_) {}
        }
        return {
            scenario_fingerprint: fp,
            records: arr(session.records),
            stale: !!session.stale,
            read_only: true
        };
    }

    function buildQueue(ws, opts) {
        opts = opts || {};
        if (opts.review_queue) return opts.review_queue;
        var RQ = reviewQueueApi();
        return RQ && typeof RQ.buildReviewQueue === 'function'
            ? RQ.buildReviewQueue(ws, { generated_at: opts.generated_at })
            : null;
    }

    function buildCloseout(queue, ws, opts) {
        opts = opts || {};
        if (opts.closeout) return opts.closeout;
        var CO = closeoutApi();
        return CO && typeof CO.buildCloseout === 'function'
            ? CO.buildCloseout(queue, { world_state: ws, generated_at: opts.generated_at })
            : null;
    }

    function buildAuditTrail(fp, opts) {
        opts = opts || {};
        if (opts.audit_trail) return opts.audit_trail;
        var AU = auditApi();
        return AU && typeof AU.exportTrail === 'function'
            ? AU.exportTrail(fp, { generated_at: opts.generated_at })
            : { scenario_fingerprint: fp, events: [], read_only: true };
    }

    function buildForceReport(ws, opts) {
        opts = opts || {};
        if (opts.force_report) return opts.force_report;
        var FR = reportApi();
        return FR && typeof FR.buildReport === 'function'
            ? FR.buildReport(ws, {
                review_queue: opts.review_queue,
                review_closeout: opts.closeout,
                audit_trail: opts.audit_trail,
                selected_unit: opts.selected_unit,
                generated_at: opts.generated_at
            })
            : null;
    }

    function packageStatus(closeout) {
        var status = obj(closeout).status;
        if (status === 'ready_for_handoff' || status === 'ready_with_exceptions') return STATUS_META.ready;
        return STATUS_META.needs_review;
    }

    function buildManifest(fp, reviewSession, closeout, auditTrail, forceReport, opts) {
        opts = opts || {};
        var queue = obj(opts.review_queue);
        return {
            package_type: PACKAGE_TYPE,
            version: SCENARIO_EVIDENCE_HANDOFF_PACKAGE_VERSION,
            generated_at: opts.generated_at || new Date().toISOString(),
            scenario_fingerprint: fp,
            includes: {
                review_session: true,
                manual_statuses: true,
                closeout_summary: !!closeout,
                audit_trail: !!auditTrail,
                force_report: !!forceReport,
                scenario_fingerprint: true
            },
            record_counts: {
                manual_statuses: arr(reviewSession.records).length,
                audit_events: arr(obj(auditTrail).events).length,
                review_issues: queue.total_issues || arr(obj(closeout).issues).length || 0,
                force_rows: arr(obj(forceReport).readiness_rows).length
            },
            read_only: true
        };
    }

    function buildPackage(worldStateOrProvider, opts) {
        opts = opts || {};
        var generatedAt = opts.generated_at || new Date().toISOString();
        var ws = resolveWorldState(worldStateOrProvider);
        var fp = fingerprint(ws, opts);
        var session = sessionFor(fp, opts);
        var reviewSession = compactSession(session, fp, { generated_at: generatedAt });
        var queue = buildQueue(ws, Object.assign({}, opts, { generated_at: generatedAt }));
        var closeout = buildCloseout(queue, ws, Object.assign({}, opts, { generated_at: generatedAt }));
        var auditTrail = buildAuditTrail(fp, Object.assign({}, opts, { generated_at: generatedAt }));
        var forceReport = buildForceReport(ws, {
            review_queue: queue,
            closeout: closeout,
            audit_trail: auditTrail,
            selected_unit: opts.selected_unit,
            generated_at: generatedAt,
            force_report: opts.force_report
        });
        var status = packageStatus(closeout);
        var manifest = buildManifest(fp, reviewSession, closeout, auditTrail, forceReport, {
            review_queue: queue,
            generated_at: generatedAt
        });
        return {
            version: SCENARIO_EVIDENCE_HANDOFF_PACKAGE_VERSION,
            package_type: PACKAGE_TYPE,
            generated_at: generatedAt,
            status: status.code,
            status_label_en: status.label_en,
            status_label_ar: status.label_ar,
            scenario_fingerprint: fp,
            manifest: manifest,
            review_session: reviewSession,
            manual_statuses: arr(reviewSession.records),
            closeout: closeout,
            audit_trail: auditTrail,
            force_report: forceReport,
            source: 'Browser-local review session + closeout + audit trail + force report',
            read_only: true
        };
    }

    function parsePackage(payload) {
        if (typeof payload === 'string') payload = JSON.parse(payload);
        payload = obj(payload);
        if (payload.package && payload.package_type !== PACKAGE_TYPE) payload = obj(payload.package);
        return payload;
    }

    function packageFingerprint(pkg) {
        pkg = obj(pkg);
        return String(pkg.scenario_fingerprint ||
            obj(pkg.manifest).scenario_fingerprint ||
            obj(pkg.review_session).scenario_fingerprint ||
            obj(pkg.review_session).original_scenario_fingerprint ||
            'unknown');
    }

    function validatePackage(payload, worldStateOrFingerprint, opts) {
        opts = opts || {};
        var pkg;
        try { pkg = parsePackage(payload); }
        catch (err) {
            return {
                valid: false,
                status: STATUS_META.invalid_package.code,
                status_label_en: STATUS_META.invalid_package.label_en,
                status_label_ar: STATUS_META.invalid_package.label_ar,
                warnings: ['Package JSON could not be parsed'],
                read_only: true
            };
        }
        var pkgType = pkg.package_type || obj(pkg.manifest).package_type;
        var valid = pkgType === PACKAGE_TYPE || !!pkg.review_session;
        var packageFp = packageFingerprint(pkg);
        var currentFp = fingerprint(worldStateOrFingerprint || opts.world_state || packageFp, opts);
        var match = packageFp === currentFp;
        var status = !valid ? STATUS_META.invalid_package :
            (!match ? STATUS_META.fingerprint_mismatch : packageStatus(pkg.closeout));
        var warnings = [];
        if (!valid) warnings.push('Package manifest type is missing or invalid');
        if (!match) warnings.push('Scenario fingerprint mismatch. Review before applying imported review status.');
        if (!obj(pkg.review_session).records && !arr(pkg.manual_statuses).length) warnings.push('Package has no review-session records');
        return {
            valid: valid,
            status: status.code,
            status_label_en: status.label_en,
            status_label_ar: status.label_ar,
            package_fingerprint: packageFp,
            current_scenario_fingerprint: currentFp,
            fingerprint_match: match,
            package: pkg,
            warnings: warnings,
            read_only: true
        };
    }

    function previewImport(payload, worldStateOrFingerprint, opts) {
        var validation = validatePackage(payload, worldStateOrFingerprint, opts);
        validation.action = validation.fingerprint_match
            ? 'Package fingerprint matches. Import may restore review-session UI state only.'
            : 'Review before applying imported review status.';
        return validation;
    }

    function importPackage(payload, worldStateOrFingerprint, opts) {
        opts = opts || {};
        var preview = previewImport(payload, worldStateOrFingerprint, opts);
        if (!preview.valid) return Object.assign({ imported: false }, preview);
        var pkg = obj(preview.package);
        var reviewSession = obj(pkg.review_session);
        if (!arr(reviewSession.records).length && arr(pkg.manual_statuses).length) {
            reviewSession = Object.assign({}, reviewSession, {
                scenario_fingerprint: preview.package_fingerprint,
                records: arr(pkg.manual_statuses)
            });
        }
        var RS = sessionApi();
        var imported = null;
        if (RS && typeof RS.importSession === 'function') {
            imported = RS.importSession(reviewSession, {
                current_fingerprint: preview.current_scenario_fingerprint,
                generated_at: opts.generated_at || new Date().toISOString()
            });
        }
        var FS = fixStatusApi();
        if (FS && typeof FS.setScenarioContext === 'function') {
            try { FS.setScenarioContext(preview.current_scenario_fingerprint); } catch (_) {}
        } else if (FS && typeof FS.importRecords === 'function' && imported) {
            try { FS.importRecords(imported.records, { replace: true }); } catch (_) {}
        }
        var AU = auditApi();
        if (AU && typeof AU.recordEvent === 'function') {
            try {
                AU.recordEvent(preview.current_scenario_fingerprint, 'handoff_package_imported', {
                    package_fingerprint: preview.package_fingerprint,
                    fingerprint_match: preview.fingerprint_match,
                    record_count: arr(obj(imported).records).length,
                    summary: 'Evidence handoff package imported'
                }, { timestamp: opts.generated_at });
            } catch (_) {}
        }
        return Object.assign({ imported: !!imported, session: imported }, preview);
    }

    function buildSummary(pkg) {
        pkg = obj(pkg);
        var manifest = obj(pkg.manifest);
        var counts = obj(manifest.record_counts);
        var lines = [
            'Evidence Handoff Package',
            '',
            'Status: ' + (pkg.status_label_en || pkg.status || 'Needs Review'),
            'Scenario fingerprint: ' + (pkg.scenario_fingerprint || 'unknown'),
            'Manual statuses: ' + (counts.manual_statuses || 0),
            'Audit events: ' + (counts.audit_events || 0),
            'Review issues: ' + (counts.review_issues || 0),
            'Force report rows: ' + (counts.force_rows || 0),
            ''
        ];
        if (pkg.closeout && pkg.closeout.status_label_en) lines.push('Closeout: ' + pkg.closeout.status_label_en);
        lines.push('Includes: review session, manual fix statuses, closeout summary, audit trail, force report, scenario fingerprint.');
        lines.push('Read-only handoff package. Import restores review-session UI state only.');
        lines.push('Generated: ' + (pkg.generated_at || 'unknown'));
        return lines.join('\n');
    }

    function toJson(pkg) { return JSON.stringify(pkg || {}, null, 2); }

    function copyText(text) {
        if (!root.navigator || !root.navigator.clipboard || typeof root.navigator.clipboard.writeText !== 'function') {
            return Promise.resolve(false);
        }
        return root.navigator.clipboard.writeText(String(text == null ? '' : text)).then(function () { return true; });
    }
    function copyJson(pkg) { return copyText(toJson(pkg)); }

    function downloadJson(pkg, filename) {
        if (!root.document || typeof root.Blob !== 'function' || !root.URL || typeof root.URL.createObjectURL !== 'function') return false;
        var blob = new root.Blob([toJson(pkg)], { type: 'application/json' });
        var url = root.URL.createObjectURL(blob);
        var a = root.document.createElement('a');
        a.href = url;
        a.download = filename || 'rmooz-evidence-handoff-package.json';
        root.document.body.appendChild(a);
        a.click();
        root.document.body.removeChild(a);
        setTimeout(function () { root.URL.revokeObjectURL(url); }, 0);
        return true;
    }

    function renderImportPreviewHtml(preview) {
        preview = obj(preview);
        if (!preview.status) return '';
        var cls = obj(STATUS_META[preview.status]).cls || preview.status;
        var html = '<div class="usp-handoff-preview usp-handoff-preview--' + esc(cls) + '">' +
            '<strong>Imported package</strong>' +
            '<dl>' +
                '<div><dt>Scenario fingerprint</dt><dd><code>' + esc(preview.package_fingerprint || 'unknown') + '</code></dd></div>' +
                '<div><dt>Current scenario fingerprint</dt><dd><code>' + esc(preview.current_scenario_fingerprint || 'unknown') + '</code></dd></div>' +
                '<div><dt>Status</dt><dd>' + esc(preview.status_label_en || preview.status) +
                    (preview.status_label_ar ? ' <span dir="rtl">' + esc(preview.status_label_ar) + '</span>' : '') + '</dd></div>' +
                '<div><dt>Import action</dt><dd>' + esc(preview.action || 'Review before applying imported review status.') + '</dd></div>' +
            '</dl>';
        if (arr(preview.warnings).length) {
            html += '<ul>';
            arr(preview.warnings).forEach(function (warning) { html += '<li>' + esc(warning) + '</li>'; });
            html += '</ul>';
        }
        html += '</div>';
        return html;
    }

    function renderPackageHtml(pkg, opts) {
        opts = opts || {};
        pkg = pkg || buildPackage(null);
        var cls = obj(STATUS_META[pkg.status]).cls || 'needs';
        var manifest = obj(pkg.manifest);
        var includes = obj(manifest.includes);
        var counts = obj(manifest.record_counts);
        var html = '<div class="usp-handoff-card usp-handoff-card--' + esc(cls) + '">' +
            '<div class="usp-handoff-header">' +
                '<span>Evidence Handoff Package</span>' +
                '<span dir="rtl">&#1581;&#1586;&#1605;&#1577; &#1578;&#1587;&#1604;&#1610;&#1605; &#1575;&#1604;&#1571;&#1583;&#1604;&#1577;</span>' +
                '<strong>' + esc(pkg.status_label_en || pkg.status) + '</strong>' +
                '<small dir="rtl">' + esc(pkg.status_label_ar || '') + '</small>' +
            '</div>' +
            '<div class="usp-handoff-meta">Scenario fingerprint: <code>' + esc(pkg.scenario_fingerprint || 'unknown') + '</code></div>' +
            '<div class="usp-handoff-counts">' +
                '<span>Manual statuses: ' + esc(counts.manual_statuses || 0) + '</span>' +
                '<span>Audit events: ' + esc(counts.audit_events || 0) + '</span>' +
                '<span>Review issues: ' + esc(counts.review_issues || 0) + '</span>' +
                '<span>Force rows: ' + esc(counts.force_rows || 0) + '</span>' +
            '</div>' +
            '<div class="usp-handoff-includes"><span>Includes</span><ul>' +
                '<li>Review session: ' + (includes.review_session ? 'yes' : 'no') + '</li>' +
                '<li>Manual fix statuses: ' + (includes.manual_statuses ? 'yes' : 'no') + '</li>' +
                '<li>Closeout summary: ' + (includes.closeout_summary ? 'yes' : 'no') + '</li>' +
                '<li>Audit trail: ' + (includes.audit_trail ? 'yes' : 'no') + '</li>' +
                '<li>Force report: ' + (includes.force_report ? 'yes' : 'no') + '</li>' +
                '<li>Scenario fingerprint: ' + (includes.scenario_fingerprint ? 'yes' : 'no') + '</li>' +
            '</ul></div>' +
            '<div class="usp-handoff-actions">' +
                '<button type="button" data-handoff-action="copy">Copy Package JSON</button>' +
                '<button type="button" data-handoff-action="download">Download Package JSON</button>' +
                '<button type="button" data-handoff-action="preview">Preview Import</button>' +
                '<button type="button" data-handoff-action="import">Import Package JSON</button>' +
            '</div>' +
            '<textarea data-handoff-import rows="3" placeholder="Paste handoff-package JSON to preview or import"></textarea>' +
            renderImportPreviewHtml(opts.preview) +
            '<div class="usp-handoff-source">Source: ' + esc(pkg.source || '') + '. Import restores review-session UI state only.</div>' +
            '</div>';
        return html;
    }

    function bindPackageActions(container, pkg, opts) {
        opts = opts || {};
        if (!container || !container.querySelectorAll) return false;
        Array.prototype.forEach.call(container.querySelectorAll('[data-handoff-action]'), function (btn) {
            btn.addEventListener('click', function () {
                var action = btn.getAttribute('data-handoff-action');
                if (action === 'copy') copyJson(pkg);
                else if (action === 'download') downloadJson(pkg);
                else if (action === 'preview') {
                    var previewEl = container.querySelector('[data-handoff-import]');
                    var preview = previewImport(previewEl && previewEl.value ? previewEl.value : pkg, opts.world_state || opts.fingerprint || pkg.scenario_fingerprint, opts);
                    if (opts.onPreview) opts.onPreview(preview);
                } else if (action === 'import') {
                    var importEl = container.querySelector('[data-handoff-import]');
                    var result = importPackage(importEl && importEl.value ? importEl.value : pkg, opts.world_state || opts.fingerprint || pkg.scenario_fingerprint, opts);
                    if (opts.onImport) opts.onImport(result);
                }
            });
        });
        return true;
    }

    var api = {
        SCENARIO_EVIDENCE_HANDOFF_PACKAGE_VERSION: SCENARIO_EVIDENCE_HANDOFF_PACKAGE_VERSION,
        PACKAGE_TYPE: PACKAGE_TYPE,
        STATUS_META: STATUS_META,
        buildPackage: buildPackage,
        buildSummary: buildSummary,
        toJson: toJson,
        copyJson: copyJson,
        downloadJson: downloadJson,
        validatePackage: validatePackage,
        previewImport: previewImport,
        importPackage: importPackage,
        renderPackageHtml: renderPackageHtml,
        renderImportPreviewHtml: renderImportPreviewHtml,
        bindPackageActions: bindPackageActions
    };

    root.RmoozScenarioEvidenceHandoffPackage = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
