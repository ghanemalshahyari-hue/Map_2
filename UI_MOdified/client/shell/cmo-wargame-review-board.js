/* ============================================================================
 * cmo-wargame-review-board.js - RMOOZ-CMO-WARGAME-REVIEW-BOARD-1
 * ----------------------------------------------------------------------------
 * Read-only CMO war-game evidence-package review board. Converts a CMO war-game
 * evidence package into a commander-style review decision: accepted, accepted
 * with warnings, rejected, or needs re-run, with reasons, sign-off checklist,
 * and next actions. It never starts, pauses, releases, mutates doctrine/combat
 * state, calls a backend route, writes a database, or stores browser-persistent
 * state.
 * ========================================================================== */
(function (root) {
    'use strict';

    var CMO_WARGAME_REVIEW_BOARD_VERSION = '1.0.0-rmooz-cmo-wargame-review-board-1';

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
    function packageApi() { return localApi('RmoozCmoWarGameEvidencePackage', 'cmo-wargame-evidence-package.js'); }

    function isPackage(input) {
        return !!(input && typeof input === 'object' && input.manifest && input.debrief && input.summary);
    }
    function buildPackage(input, opts) {
        opts = opts || {};
        if (opts.package && isPackage(opts.package)) return opts.package;
        if (isPackage(input)) return input;
        var PKG = packageApi();
        if (PKG && typeof PKG.buildPackage === 'function') return PKG.buildPackage(input || null, opts);
        return {
            version: 'fallback-cmo-evidence-package',
            manifest: { package_type: 'cmo_wargame_evidence_package', scenario_fingerprint: opts.fingerprint || 'unknown', package_id: 'fallback' },
            summary: { outcome: 'Unknown', release_interpretation: 'not release-grade evidence', release_grade_candidate: false, training_only: false, needs_review: true, blocked: true, unresolved_items: 1, evidence_changes: 0 },
            readiness: { blocked: true, needs_review: true, training_only: false, release_grade_candidate: false },
            handoff_checklist: [],
            sections: [],
            read_only: true
        };
    }
    function validatePackage(pkg, opts) {
        var PKG = packageApi();
        if (PKG && typeof PKG.validatePackage === 'function') return PKG.validatePackage(pkg, opts || {});
        return { valid: !!isPackage(pkg), status: isPackage(pkg) ? 'valid' : 'needs_review', warnings: isPackage(pkg) ? [] : ['Package could not be validated.'], read_only: true };
    }
    function reviewDecision(pkg, validation, opts) {
        opts = opts || {};
        pkg = obj(pkg);
        validation = obj(validation);
        var s = obj(pkg.summary);
        var r = obj(pkg.readiness);
        if (!validation.valid || arr(validation.warnings).length) return 'needs_review';
        if (r.blocked || s.blocked || (s.unresolved_items || 0) > 0) return 'rejected';
        if (r.training_only || s.training_only) return 'accepted_training_only';
        if (r.needs_review || s.needs_review || (s.evidence_changes || 0) > 0) return 'accepted_with_warnings';
        if (r.release_grade_candidate || s.release_grade_candidate) return 'accepted';
        return opts.default_decision || 'needs_review';
    }
    function decisionLabel(decision) {
        return {
            accepted: 'Accepted as release-grade evidence candidate',
            accepted_with_warnings: 'Accepted with warnings',
            accepted_training_only: 'Accepted as training-only evidence',
            rejected: 'Rejected for release-grade use',
            needs_review: 'Needs commander review'
        }[decision] || 'Needs commander review';
    }
    function decisionArabic(decision) {
        return {
            accepted: 'مقبول كمرشح دليل نهائي',
            accepted_with_warnings: 'مقبول مع تنبيهات',
            accepted_training_only: 'مقبول للتدريب فقط',
            rejected: 'مرفوض للاستخدام النهائي',
            needs_review: 'يتطلب مراجعة القائد'
        }[decision] || 'يتطلب مراجعة القائد';
    }
    function severity(decision) {
        return decision === 'accepted' ? 'pass' : decision === 'accepted_with_warnings' || decision === 'accepted_training_only' ? 'warn' : 'fail';
    }
    function reasons(pkg, validation, decision) {
        var s = obj(obj(pkg).summary);
        var out = [];
        arr(obj(validation).warnings).forEach(function (w) { out.push({ key: 'validation', label: w, status: 'fail', read_only: true }); });
        if (s.release_grade_candidate) out.push({ key: 'release_candidate', label: 'Package claims release-grade evidence candidate.', status: 'pass', read_only: true });
        if (s.training_only) out.push({ key: 'training_only', label: 'Package is training-only and must not be used as release-grade evidence.', status: 'warn', read_only: true });
        if (s.evidence_changes) out.push({ key: 'evidence_changes', label: s.evidence_changes + ' evidence change(s) require review.', status: 'warn', read_only: true });
        if (s.unresolved_items) out.push({ key: 'unresolved', label: s.unresolved_items + ' unresolved blocker/warning item(s).', status: 'fail', read_only: true });
        if (decision === 'accepted' && !out.length) out.push({ key: 'clean_accept', label: 'No unresolved blockers or package warnings found.', status: 'pass', read_only: true });
        if (!out.length) out.push({ key: 'manual_review', label: 'Review package sections before final sign-off.', status: 'warn', read_only: true });
        return out.slice(0, 10);
    }
    function signoffChecklist(pkg, decision) {
        var s = obj(obj(pkg).summary);
        return [
            { key: 'fingerprint', label: 'Scenario fingerprint and package id reviewed.', status: obj(pkg.manifest).scenario_fingerprint ? 'pass' : 'fail', read_only: true },
            { key: 'release_interpretation', label: 'Release interpretation reviewed: ' + (s.release_interpretation || 'unknown'), status: s.blocked ? 'fail' : (s.needs_review ? 'warn' : 'pass'), read_only: true },
            { key: 'training_guard', label: 'Training-only guard checked.', status: s.training_only ? 'warn' : 'pass', read_only: true },
            { key: 'unresolved_items', label: 'Unresolved items reviewed: ' + (s.unresolved_items || 0), status: (s.unresolved_items || 0) ? 'fail' : 'pass', read_only: true },
            { key: 'recommendations', label: 'Recommendations reviewed before sign-off.', status: (s.recommendations || 0) ? 'pass' : 'warn', read_only: true },
            { key: 'decision', label: 'Review board decision: ' + decisionLabel(decision), status: severity(decision), read_only: true }
        ];
    }
    function nextActions(pkg, decision) {
        var s = obj(obj(pkg).summary);
        var actions = [];
        if (decision === 'accepted') actions.push('Archive package as release-grade evidence candidate and continue commander review.');
        if (decision === 'accepted_with_warnings') actions.push('Accept package for review, but resolve or document warnings before release claim.');
        if (decision === 'accepted_training_only') actions.push('Keep package in training evidence only; do not use it for release-grade claims.');
        if (decision === 'rejected') actions.push('Reject package for release-grade use and rerun after blockers are fixed.');
        if (decision === 'needs_review') actions.push('Route package to commander review and validate fingerprint/package warnings.');
        if (s.unresolved_items) actions.push('Open Evidence Package unresolved section and clear blockers.');
        if (s.evidence_changes) actions.push('Review evidence changes against force report before sign-off.');
        if (!actions.length) actions.push('Review package manually before operational sign-off.');
        return actions.map(function (label, idx) { return { key: 'action_' + (idx + 1), label: label, read_only: true }; });
    }

    function buildReview(pkgOrRun, opts) {
        opts = opts || {};
        var pkg = buildPackage(pkgOrRun, opts);
        var validation = validatePackage(pkg, opts);
        var decision = reviewDecision(pkg, validation, opts);
        return {
            version: CMO_WARGAME_REVIEW_BOARD_VERSION,
            generated_at: opts.generated_at || new Date().toISOString(),
            package_id: obj(obj(pkg).manifest).package_id || 'unknown',
            scenario_fingerprint: obj(obj(pkg).manifest).scenario_fingerprint || obj(pkg).scenario_fingerprint || 'unknown',
            decision: decision,
            decision_label_en: decisionLabel(decision),
            decision_label_ar: decisionArabic(decision),
            severity: severity(decision),
            validation: validation,
            reasons: reasons(pkg, validation, decision),
            signoff_checklist: signoffChecklist(pkg, decision),
            next_actions: nextActions(pkg, decision),
            package_summary: obj(pkg.summary),
            evidence_package: pkg,
            source: 'CMO War-Game Evidence Package Review Board',
            read_only: true
        };
    }
    function summaryText(review) {
        review = review && review.version ? review : buildReview(review || null);
        var lines = [
            'CMO War-Game Evidence Review Board',
            '',
            'Decision: ' + (review.decision_label_en || review.decision || 'Needs review'),
            'Scenario fingerprint: ' + (review.scenario_fingerprint || 'unknown'),
            'Package: ' + (review.package_id || 'unknown'),
            'Severity: ' + (review.severity || 'warn'),
            '',
            'Reasons:'
        ];
        arr(review.reasons).forEach(function (r) { lines.push('- [' + String(r.status || '').toUpperCase() + '] ' + r.label); });
        lines.push('');
        lines.push('Next actions:');
        arr(review.next_actions).forEach(function (a) { lines.push('- ' + a.label); });
        lines.push('');
        lines.push('Read-only review. It does not accept, reject, release, mutate doctrine, mutate combat state, call a backend, or write storage.');
        return lines.join('\n');
    }
    function renderReviewHtml(review) {
        review = review && review.version ? review : buildReview(review || null);
        var html = '<div class="cmo-wargame-review-board cmo-wargame-review-board--' + esc(review.severity || 'warn') + '">' +
            '<div class="cmo-wargame-review-board-header">' +
                '<span>CMO War-Game Evidence Review Board</span>' +
                '<span dir="rtl">مراجعة حزمة أدلة المناورة</span>' +
                '<strong>' + esc(review.decision_label_en || review.decision || 'Needs review') + '</strong>' +
                '<small dir="rtl">' + esc(review.decision_label_ar || '') + '</small>' +
            '</div>' +
            '<dl class="cmo-wargame-review-board-meta">' +
                '<div><dt>Package</dt><dd><code>' + esc(review.package_id || 'unknown') + '</code></dd></div>' +
                '<div><dt>Fingerprint</dt><dd><code>' + esc(review.scenario_fingerprint || 'unknown') + '</code></dd></div>' +
                '<div><dt>Validation</dt><dd>' + esc(obj(review.validation).status || 'unknown') + '</dd></div>' +
            '</dl><div class="cmo-wargame-review-board-reasons"><strong>Reasons</strong><ul>';
        arr(review.reasons).forEach(function (r) { html += '<li class="cmo-wargame-review-board--' + esc(r.status || 'warn') + '">' + esc(r.label) + '</li>'; });
        html += '</ul></div><div class="cmo-wargame-review-board-signoff"><strong>Sign-off checklist</strong><ul>';
        arr(review.signoff_checklist).forEach(function (item) { html += '<li class="cmo-wargame-review-board--' + esc(item.status || 'warn') + '">' + esc(item.label) + '</li>'; });
        html += '</ul></div><div class="cmo-wargame-review-board-actions"><strong>Next actions</strong><ul>';
        arr(review.next_actions).forEach(function (a) { html += '<li>' + esc(a.label) + '</li>'; });
        html += '</ul></div><div class="cmo-wargame-review-board-source">Source: ' + esc(review.source || '') + '. Read-only.</div></div>';
        return html;
    }

    var api = {
        CMO_WARGAME_REVIEW_BOARD_VERSION: CMO_WARGAME_REVIEW_BOARD_VERSION,
        buildReview: buildReview,
        reviewDecision: reviewDecision,
        summaryText: summaryText,
        renderReviewHtml: renderReviewHtml
    };

    root.RmoozCmoWarGameReviewBoard = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
