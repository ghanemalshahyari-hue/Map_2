/* ============================================================================
 * cmo-commander-brief.js - RMOOZ-CMO-21 commander evidence brief
 * ----------------------------------------------------------------------------
 * Read-only top-level brief that folds coverage, alerts, quality gate, and
 * top-blocker into a single commander-facing status. Built from existing CMO
 * modules — no backend routes, state mutation, combat triggers, or doctrine edits.
 * ========================================================================== */
(function (root) {
    'use strict';

    var CMO_COMMANDER_BRIEF_VERSION = '1.1.0-rmooz-cmo-21-qa32';

    var HEADLINE_STATUS = {
        ready_for_review: {
            code: 'ready_for_review',
            label_en: 'Evidence Ready for Review',
            label_ar: 'الأدلة جاهزة للمراجعة',
            cls: 'usp-brief--ready'
        },
        partial_evidence: {
            code: 'partial_evidence',
            label_en: 'Partial Evidence — Review Recommended',
            label_ar: 'أدلة جزئية — يُوصى بالمراجعة',
            cls: 'usp-brief--partial'
        },
        evidence_gaps: {
            code: 'evidence_gaps',
            label_en: 'Evidence Gaps Detected',
            label_ar: 'تم الكشف عن ثغرات في الأدلة',
            cls: 'usp-brief--gaps'
        },
        needs_attention: {
            code: 'needs_attention',
            label_en: 'Action Required — Evidence Incomplete',
            label_ar: 'إجراء مطلوب — الأدلة غير مكتملة',
            cls: 'usp-brief--action'
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

    function qualityApi()    { return localApi('RmoozCmoEvidenceQualityGate',   'cmo-evidence-quality-gate.js'); }
    function matrixApi()     { return localApi('RmoozCmoEvidenceReadinessMatrix','cmo-evidence-readiness-matrix.js'); }
    function alertsApi()     { return localApi('RmoozCmoEvidenceAlerts',         'cmo-evidence-alerts.js'); }
    function coverageApi()   { return localApi('RmoozCmoEvidenceCoverage',       'cmo-evidence-coverage.js'); }
    function remediationApi(){ return localApi('RmoozCmoBlockerRemediation',     'cmo-blocker-remediation.js'); }
    function reviewQueueApi(){ return localApi('RmoozScenarioEvidenceReviewQueue','scenario-evidence-review-queue.js'); }
    function objectiveApi()  { return localApi('RmoozObjectiveXEvidenceHealth',    'objective-x-evidence-health.js'); }
    function fixStatusApi()  { return localApi('RmoozScenarioEvidenceFixStatus',   'scenario-evidence-fix-status.js'); }
    function closeoutApi()   { return localApi('RmoozScenarioEvidenceReviewCloseout','scenario-evidence-review-closeout.js'); }

    function resolveHeadlineStatus(coverage, quality, alertCount, readyCount, totalCount) {
        var coveragePct = coverage && coverage.coverage_pct != null ? coverage.coverage_pct : 0;
        var qStatus = (quality && quality.status) ? String(quality.status).toLowerCase() : '';
        var blocked = coverage ? (coverage.blocked || 0) : 0;
        var unknown = coverage ? (coverage.unknown || 0) : 0;
        if (coveragePct >= 75 && alertCount === 0 && blocked === 0) {
            return HEADLINE_STATUS.ready_for_review;
        }
        if (coveragePct >= 50 && alertCount <= 2 && blocked <= 3) {
            return HEADLINE_STATUS.partial_evidence;
        }
        if (unknown > (totalCount * 0.4)) {
            return HEADLINE_STATUS.evidence_gaps;
        }
        return HEADLINE_STATUS.needs_attention;
    }

    function buildBrief(worldStateOrProvider, selectedUnit, opts) {
        opts = opts || {};
        var ws = (typeof worldStateOrProvider === 'function') ? worldStateOrProvider() : worldStateOrProvider;
        var QG = qualityApi();
        var MX = matrixApi();
        var AL = alertsApi();
        var COV = coverageApi();
        var REM = remediationApi();

        var matrix = opts.matrix || (MX && typeof MX.buildMatrix === 'function'
            ? MX.buildMatrix(ws, { limit: opts.limit || 80 })
            : { counts: { Ready: 0, Blocked: 0, Unknown: 0 }, rows: [], top_blockers: [] });
        var alerts = opts.alerts || (AL && typeof AL.buildAlerts === 'function'
            ? AL.buildAlerts(matrix, {})
            : { no_contact_count: 0, top_blocker: null, alerts: [] });
        var coverage = opts.coverage || (COV && typeof COV.buildCoverage === 'function'
            ? COV.buildCoverage(ws, { matrix: matrix, alerts: alerts })
            : { total: 0, ready: 0, blocked: 0, unknown: 0, coverage_pct: 0, verdict: {} });
        var quality = opts.quality || (QG && typeof QG.assess === 'function'
            ? QG.assess(matrix, { alerts: alerts })
            : { status: 'Unknown', pass: false });
        var remediation = opts.remediation || (REM && typeof REM.buildRemediation === 'function'
            ? REM.buildRemediation(ws, { matrix: matrix })
            : { total_blocked: 0, top_blocker: null, groups: [] });

        // QA-32: fold scenario QA (review queue + Objective X health) into the brief.
        var RQ = reviewQueueApi();
        var OH = objectiveApi();
        var objHealth = opts.objective_health || (OH && typeof OH.buildObjectiveHealth === 'function'
            ? OH.buildObjectiveHealth(ws, { matrix: matrix })
            : null);
        // Reuse the already-built matrix + objective health so buildReviewQueue
        // doesn't recompute Objective X health a second time per brief.
        var reviewQueue = opts.review_queue || (RQ && typeof RQ.buildReviewQueue === 'function'
            ? RQ.buildReviewQueue(ws, { matrix: matrix, objective_health: objHealth })
            : null);
        var FS = fixStatusApi();
        var manualReview = opts.manual_review || (FS && typeof FS.summarize === 'function'
            ? FS.summarize(reviewQueue || [])
            : { counts: { total: reviewQueue ? (reviewQueue.total_issues || 0) : 0, needs_review: reviewQueue ? (reviewQueue.total_issues || 0) : 0, reviewed: 0, deferred: 0, fixed_externally: 0 } });
        var CO = closeoutApi();
        var closeout = opts.closeout || (CO && typeof CO.buildCloseout === 'function'
            ? CO.buildCloseout(reviewQueue, { world_state: ws, generated_at: opts.generated_at })
            : null);

        var alertList = arr(alerts.alerts || []);
        var alertCount = alertList.length;
        var counts = obj(matrix.counts || coverage);
        var readyCount = counts.Ready || coverage.ready || 0;
        var totalCount = coverage.total || 0;
        var topBlocker = arr(matrix.top_blockers)[0] || null;
        var headline = resolveHeadlineStatus(coverage, quality, alertCount, readyCount, totalCount);

        var uid = selectedUnit && (selectedUnit.uid || selectedUnit.id || selectedUnit.unit_uid);
        var selectedSummary = uid ? {
            uid: uid,
            label: selectedUnit.label || selectedUnit.name || selectedUnit.displayName || uid,
            side: selectedUnit.side || null
        } : null;

        return {
            version: CMO_COMMANDER_BRIEF_VERSION,
            headline_status: headline,
            coverage: {
                pct: coverage.coverage_pct || 0,
                ready: readyCount,
                blocked: coverage.blocked || 0,
                unknown: coverage.unknown || 0,
                total: totalCount,
                verdict: obj(coverage.verdict)
            },
            quality: {
                status: quality.status || 'Unknown',
                pass: !!(quality.pass),
                reason: quality.reason || null
            },
            alerts: {
                count: alertCount,
                no_contact_count: alerts.no_contact_count || 0,
                top_alert: alertList[0] || null
            },
            top_blocker: topBlocker ? {
                code: topBlocker.code,
                count: topBlocker.count,
                label_ar: topBlocker.label_ar || null
            } : null,
            remediation_groups: arr(remediation.groups).length,
            scenario_qa: {
                needs_review: reviewQueue ? (reviewQueue.total_issues > 0 || reviewQueue.needs_review > 0) : false,
                evidence_issues: reviewQueue ? (reviewQueue.total_issues || 0) : 0,
                units_flagged: reviewQueue ? (reviewQueue.units_flagged || 0) : 0,
                objective_health_pct: objHealth ? (objHealth.health_score == null ? null : objHealth.health_score) : null,
                manual_review: manualReview,
                closeout: closeout
            },
            selected_unit: selectedSummary,
            source: 'Coverage + quality-gate + alerts + matrix + scenario QA — commander summary'
        };
    }

    function renderBriefHtml(brief, opts) {
        opts = opts || {};
        brief = brief || buildBrief(null, null);
        var headline = obj(brief.headline_status);
        var cov = obj(brief.coverage);
        var qual = obj(brief.quality);
        var alerts = obj(brief.alerts);
        var topBlocker = brief.top_blocker;

        var html = '<div class="usp-brief-header ' + esc(headline.cls || '') + '">';
        html += '<span class="usp-brief-status-en">' + esc(headline.label_en || 'Unknown') + '</span>';
        html += '<span class="usp-brief-status-ar" dir="rtl">' + esc(headline.label_ar || '') + '</span>';
        html += '</div>';

        html += '<dl class="usp-brief-grid">';
        html += '<div class="usp-brief-cell"><dt>Coverage</dt><dd>' + esc(cov.pct || 0) + '% (' + esc(cov.ready) + ' ready / ' + esc(cov.total) + ' total)</dd></div>';
        html += '<div class="usp-brief-cell"><dt>Quality Gate</dt><dd class="' + (qual.pass ? 'usp-brief-pass' : 'usp-brief-fail') + '">' + esc(qual.status) + '</dd></div>';
        html += '<div class="usp-brief-cell"><dt>Alerts</dt><dd>' + esc(alerts.count) + (alerts.no_contact_count ? ' (' + esc(alerts.no_contact_count) + ' no-contact)' : '') + '</dd></div>';
        if (topBlocker) {
            html += '<div class="usp-brief-cell"><dt>Top Blocker</dt><dd>';
            html += '<code>' + esc(topBlocker.code) + '</code> &times; ' + esc(topBlocker.count);
            if (topBlocker.label_ar) html += ' <span dir="rtl">' + esc(topBlocker.label_ar) + '</span>';
            html += '</dd></div>';
        }
        if (brief.remediation_groups > 0) {
            html += '<div class="usp-brief-cell"><dt>Blocker Groups</dt><dd>' + esc(brief.remediation_groups) + '</dd></div>';
        }
        var qa = obj(brief.scenario_qa);
        if (brief.scenario_qa) {
            var qaCls = qa.needs_review ? 'usp-brief-fail' : 'usp-brief-pass';
            html += '<div class="usp-brief-cell"><dt>Scenario QA</dt><dd class="' + qaCls + '">' +
                (qa.needs_review ? 'Needs Review' : 'Clear') +
                ' &mdash; ' + esc(qa.evidence_issues || 0) + ' issue' + ((qa.evidence_issues === 1) ? '' : 's') + '</dd></div>';
            if (qa.objective_health_pct != null) {
                html += '<div class="usp-brief-cell"><dt>Objective X Health</dt><dd>' + esc(qa.objective_health_pct) + '%</dd></div>';
            }
            var mr = obj(qa.manual_review);
            var mrc = obj(mr.counts);
            html += '<div class="usp-brief-cell"><dt>Manual Review</dt><dd>' +
                'Reviewed ' + esc(mrc.reviewed || 0) +
                ' / Deferred ' + esc(mrc.deferred || 0) +
                ' / Fixed externally ' + esc(mrc.fixed_externally || 0) +
                ' / Needs review ' + esc(mrc.needs_review || 0) +
                '</dd></div>';
            var co = obj(qa.closeout);
            if (co.status) {
                html += '<div class="usp-brief-cell"><dt>Review Closeout</dt><dd class="' +
                    (co.status === 'ready_for_handoff' ? 'usp-brief-pass' : 'usp-brief-fail') + '">' +
                    esc(co.status_label_en || co.status) +
                    (co.status_label_ar ? ' <span dir="rtl">' + esc(co.status_label_ar) + '</span>' : '') +
                    '</dd></div>';
            }
        }
        html += '</dl>';

        if (brief.selected_unit) {
            html += '<div class="usp-brief-unit">Selected: <strong>' + esc(brief.selected_unit.label || brief.selected_unit.uid) + '</strong></div>';
        }

        html += '<div class="usp-brief-disclaimer">Read-only evidence brief. Does not authorize any action.</div>';
        return html;
    }

    var api = {
        CMO_COMMANDER_BRIEF_VERSION: CMO_COMMANDER_BRIEF_VERSION,
        HEADLINE_STATUS: HEADLINE_STATUS,
        buildBrief: buildBrief,
        renderBriefHtml: renderBriefHtml
    };

    root.RmoozCmoCommanderBrief = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
