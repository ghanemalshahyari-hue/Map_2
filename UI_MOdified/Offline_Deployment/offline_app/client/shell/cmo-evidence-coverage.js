/* ============================================================================
 * cmo-evidence-coverage.js - RMOOZ-CMO-20 evidence coverage summary
 * ----------------------------------------------------------------------------
 * Read-only force-level coverage summary: what fraction of the force has full
 * evidence, partial evidence, or none. Derived from readiness matrix counts.
 * No backend routes, state mutation, combat triggers, or doctrine edits.
 * ========================================================================== */
(function (root) {
    'use strict';

    var CMO_EVIDENCE_COVERAGE_VERSION = '1.0.0-rmooz-cmo-20';

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

    function pct(num, denom) {
        if (!denom) return 0;
        return Math.round((num / denom) * 100);
    }

    function coverageVerdict(coveragePct) {
        if (coveragePct >= 80) return { code: 'high', label_en: 'High Coverage', label_ar: 'تغطية عالية', cls: 'usp-cov--high' };
        if (coveragePct >= 50) return { code: 'medium', label_en: 'Partial Coverage', label_ar: 'تغطية جزئية', cls: 'usp-cov--medium' };
        return { code: 'low', label_en: 'Low Coverage', label_ar: 'تغطية منخفضة', cls: 'usp-cov--low' };
    }

    function buildCoverage(worldStateOrProvider, opts) {
        opts = opts || {};
        var ws = (typeof worldStateOrProvider === 'function') ? worldStateOrProvider() : worldStateOrProvider;
        var MX = matrixApi();
        var AL = alertsApi();
        var matrix = opts.matrix || (MX && typeof MX.buildMatrix === 'function'
            ? MX.buildMatrix(ws, { limit: opts.limit || 80 })
            : { counts: { Ready: 0, Blocked: 0, Unknown: 0 }, rows: [], top_blockers: [] });
        var alerts = opts.alerts || (AL && typeof AL.buildAlerts === 'function'
            ? AL.buildAlerts(matrix, {})
            : { no_contact_count: 0, top_blocker: null });
        var counts = obj(matrix.counts);
        var ready = counts.Ready || 0;
        var blocked = counts.Blocked || 0;
        var unknown = counts.Unknown || 0;
        var total = ready + blocked + unknown;
        var withEvidence = ready + blocked;
        var coveragePct = pct(withEvidence, total);
        var readyPct = pct(ready, total);
        var blockedPct = pct(blocked, total);
        var unknownPct = pct(unknown, total);
        var verdict = coverageVerdict(coveragePct);
        var noContactCount = alerts.no_contact_count || 0;
        var topBlockers = arr(matrix.top_blockers).slice(0, 3);

        return {
            version: CMO_EVIDENCE_COVERAGE_VERSION,
            total: total,
            ready: ready,
            blocked: blocked,
            unknown: unknown,
            with_evidence: withEvidence,
            no_contact_count: noContactCount,
            coverage_pct: coveragePct,
            ready_pct: readyPct,
            blocked_pct: blockedPct,
            unknown_pct: unknownPct,
            verdict: verdict,
            top_blockers: topBlockers,
            source: 'Readiness matrix counts + alert no-contact count'
        };
    }

    function renderCoverageHtml(coverage, opts) {
        opts = opts || {};
        coverage = coverage || buildCoverage(null);
        var verdict = obj(coverage.verdict);
        var topBlockers = arr(coverage.top_blockers);

        var html = '<div class="usp-cov-header ' + esc(verdict.cls || '') + '">';
        html += '<span class="usp-cov-pct">' + esc(coverage.coverage_pct) + '%</span>';
        html += '<span class="usp-cov-verdict-en">' + esc(verdict.label_en || 'Unknown') + '</span>';
        html += '<span class="usp-cov-verdict-ar" dir="rtl">' + esc(verdict.label_ar || '') + '</span>';
        html += '</div>';

        html += '<div class="usp-cov-bar-wrap">';
        if (coverage.total > 0) {
            html += '<div class="usp-cov-bar">';
            if (coverage.ready_pct > 0) html += '<div class="usp-cov-bar-ready" style="width:' + esc(coverage.ready_pct) + '%" title="Ready: ' + esc(coverage.ready) + '"></div>';
            if (coverage.blocked_pct > 0) html += '<div class="usp-cov-bar-blocked" style="width:' + esc(coverage.blocked_pct) + '%" title="Blocked: ' + esc(coverage.blocked) + '"></div>';
            if (coverage.unknown_pct > 0) html += '<div class="usp-cov-bar-unknown" style="width:' + esc(coverage.unknown_pct) + '%" title="Unknown: ' + esc(coverage.unknown) + '"></div>';
            html += '</div>';
        }
        html += '</div>';

        html += '<dl class="usp-cov-stats">';
        html += '<div class="usp-cov-stat"><dt>Total</dt><dd>' + esc(coverage.total) + '</dd></div>';
        html += '<div class="usp-cov-stat usp-cov-stat--ready"><dt>Ready</dt><dd>' + esc(coverage.ready) + ' (' + esc(coverage.ready_pct) + '%)</dd></div>';
        html += '<div class="usp-cov-stat usp-cov-stat--blocked"><dt>Blocked</dt><dd>' + esc(coverage.blocked) + ' (' + esc(coverage.blocked_pct) + '%)</dd></div>';
        html += '<div class="usp-cov-stat usp-cov-stat--unknown"><dt>Unknown</dt><dd>' + esc(coverage.unknown) + ' (' + esc(coverage.unknown_pct) + '%)</dd></div>';
        html += '<div class="usp-cov-stat"><dt>No-contact</dt><dd>' + esc(coverage.no_contact_count) + '</dd></div>';
        html += '</dl>';

        if (topBlockers.length) {
            html += '<div class="usp-cov-blockers-hdr">Top blockers:</div><ul class="usp-cov-blockers">';
            topBlockers.forEach(function (b) {
                b = obj(b);
                html += '<li><code>' + esc(b.code || 'unknown') + '</code> &times; ' + esc(b.count || 0);
                if (b.label_ar) html += ' <span dir="rtl">' + esc(b.label_ar) + '</span>';
                html += '</li>';
            });
            html += '</ul>';
        }

        return html;
    }

    var api = {
        CMO_EVIDENCE_COVERAGE_VERSION: CMO_EVIDENCE_COVERAGE_VERSION,
        buildCoverage: buildCoverage,
        renderCoverageHtml: renderCoverageHtml,
        coverageVerdict: coverageVerdict
    };

    root.RmoozCmoEvidenceCoverage = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
