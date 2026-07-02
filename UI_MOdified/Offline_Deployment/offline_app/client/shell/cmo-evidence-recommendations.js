/* ============================================================================
 * cmo-evidence-recommendations.js - RMOOZ-CMO-16 evidence recommendations
 * ----------------------------------------------------------------------------
 * Read-only operator checklist derived from existing CMO evidence reason codes.
 * It does not call backend routes, mutate scenario state, change doctrine, or
 * trigger combat actions. Recommendations are deterministic UI guidance only.
 * ========================================================================== */
(function (root) {
    'use strict';

    var CMO_EVIDENCE_RECOMMENDATIONS_VERSION = '1.0.0-rmooz-cmo-16';

    var DEFAULT_REASON = 'unknown';

    var RECOMMENDATIONS_BY_REASON = {
        out_of_range: [
            'Move the shooter closer to the target.',
            'Check whether another weapon has sufficient range.',
            'Confirm the target contact is current.',
            'Review sensor coverage before engagement.'
        ],
        no_contact_evidence: [
            'Check sensor coverage.',
            'Select a unit with detection capability.',
            'Refresh or review contact data.',
            'Review scenario generation output.'
        ],
        stale_contact: [
            'Refresh contact information.',
            'Confirm target position before engagement.',
            'Use another sensor source if available.'
        ],
        weapons_hold: [
            'Review doctrine or ROE settings.',
            'Confirm engagement authorization.',
            'Check whether the unit is intentionally restricted.'
        ],
        winchester: [
            'Select another shooter.',
            'Check ammunition status.',
            'Replenish or rearm before engagement.'
        ],
        no_fire_control_channel: [
            'Check fire-control capability.',
            'Confirm target tracking quality.',
            'Select another shooter with fire-control availability.'
        ],
        no_valid_target: [
            'Confirm a valid target is selected.',
            'Check contact classification and target identity.',
            'Review whether the target is eligible for engagement.'
        ],
        target_not_detected: [
            'Check sensor coverage.',
            'Confirm the target is detected by a friendly unit.',
            'Refresh contact information before engagement.'
        ],
        undetected: [
            'Check sensor coverage.',
            'Confirm the target is detected by a friendly unit.',
            'Refresh contact information before engagement.'
        ],
        no_detection: [
            'Check sensor coverage.',
            'Confirm the target is detected by a friendly unit.',
            'Refresh contact information before engagement.'
        ],
        no_engagement_evidence: [
            'Review missing engagement evidence.',
            'Check target, weapon, range, ammo, and doctrine fields.',
            'Select another unit if engagement evidence is unavailable.'
        ],
        no_engagement_solution: [
            'Check whether a valid weapon-target pairing exists.',
            'Review target validity and weapon availability.',
            'Select another shooter if no solution is available.'
        ],
        unknown_reason: [
            'Review missing evidence.',
            'Check contact, weapon, range, ammo, and doctrine fields.'
        ],
        unknown: [
            'Review missing evidence.',
            'Check contact, weapon, range, ammo, and doctrine fields.'
        ]
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

    function labelsApi() { return localApi('AppCmoEvidenceLabels', 'cmo-evidence-labels.js'); }
    function decisionApi() { return localApi('AppDecisionChainEvidence', 'decision-chain-evidence.js'); }

    function reasonLabel(code, lang) {
        var labels = labelsApi();
        if (labels && typeof labels.reasonLabel === 'function') {
            try { return labels.reasonLabel(code || DEFAULT_REASON, lang || 'en'); } catch (_) {}
        }
        return code || DEFAULT_REASON;
    }

    function normalizeReason(code) {
        var reason = String(code || '').trim();
        if (!reason) return DEFAULT_REASON;
        if (reason === 'target_not_detected' || reason === 'undetected' || reason === 'no_detection') return reason;
        return RECOMMENDATIONS_BY_REASON[reason] ? reason : DEFAULT_REASON;
    }

    function reasonFromEvidence(evidence) {
        evidence = obj(evidence);
        var contact = obj(evidence.contact);
        var engagement = obj(evidence.engagement);
        return evidence.blocking_reason_code ||
            evidence.reason_code ||
            engagement.reason_code ||
            contact.reason_code ||
            DEFAULT_REASON;
    }

    function buildRecommendations(evidence, opts) {
        opts = opts || {};
        evidence = obj(evidence);
        var finalStatus = evidence.final_status || evidence.status || 'Unknown';
        var reason = normalizeReason(reasonFromEvidence(evidence));
        var ready = String(finalStatus).toLowerCase() === 'ready' && !evidence.blocking_reason_code;
        var items = ready ? [] : arr(RECOMMENDATIONS_BY_REASON[reason]).slice();
        return {
            version: CMO_EVIDENCE_RECOMMENDATIONS_VERSION,
            final_status: finalStatus,
            reason_code: ready ? null : reason,
            reason_label_en: ready ? 'None' : reasonLabel(reason, 'en'),
            reason_label_ar: ready ? 'None' : reasonLabel(reason, 'ar'),
            recommendations: items,
            source: opts.source || 'Decision-chain derived evidence'
        };
    }

    function getUnitRecommendations(worldStateOrProvider, uid) {
        var ws = (typeof worldStateOrProvider === 'function') ? worldStateOrProvider() : worldStateOrProvider;
        var DC = decisionApi();
        var evidence = DC && typeof DC.getUnitDecisionChainEvidence === 'function'
            ? DC.getUnitDecisionChainEvidence(ws, uid)
            : { final_status: 'Unknown', blocking_reason_code: DEFAULT_REASON };
        return buildRecommendations(evidence);
    }

    function renderRecommendationsHtml(recommendations, opts) {
        opts = opts || {};
        var rec = recommendations || buildRecommendations(null);
        var items = arr(rec.recommendations);
        var html = '';
        if (!items.length) {
            return '<div class="usp-rec-empty">No recommendations available for the current evidence state.<br>' +
                '&#1604;&#1575; &#1578;&#1608;&#1580;&#1583; &#1578;&#1608;&#1589;&#1610;&#1575;&#1578; &#1605;&#1578;&#1575;&#1581;&#1577; &#1604;&#1581;&#1575;&#1604;&#1577; &#1575;&#1604;&#1571;&#1583;&#1604;&#1577; &#1575;&#1604;&#1581;&#1575;&#1604;&#1610;&#1577;.</div>';
        }
        html += '<div class="usp-rec-summary">' +
            '<span class="usp-rec-status">' + esc(rec.final_status || 'Unknown') + '</span>' +
            '<span class="usp-rec-reason">' + esc(rec.reason_code || DEFAULT_REASON) + '</span>' +
            '<span class="usp-rec-reason-ar" dir="rtl">' + esc(rec.reason_label_ar || '') + '</span>' +
            '</div>';
        html += '<ol class="usp-rec-list">';
        items.forEach(function (item) {
            html += '<li>' + esc(item) + '</li>';
        });
        html += '</ol>';
        html += '<div class="usp-rec-source">Source / &#1575;&#1604;&#1605;&#1589;&#1583;&#1585;: ' + esc(rec.source || 'Decision-chain derived evidence') + '</div>';
        return html;
    }

    var api = {
        CMO_EVIDENCE_RECOMMENDATIONS_VERSION: CMO_EVIDENCE_RECOMMENDATIONS_VERSION,
        RECOMMENDATIONS_BY_REASON: RECOMMENDATIONS_BY_REASON,
        normalizeReason: normalizeReason,
        buildRecommendations: buildRecommendations,
        getUnitRecommendations: getUnitRecommendations,
        renderRecommendationsHtml: renderRecommendationsHtml
    };

    root.RmoozCmoEvidenceRecommendations = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
