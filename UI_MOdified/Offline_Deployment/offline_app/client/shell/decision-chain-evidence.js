/* ============================================================================
 * decision-chain-evidence.js - RMOOZ-CMO-3 read-only sensor-to-shooter chain
 * ----------------------------------------------------------------------------
 * Aggregates existing CMO-1 engagement evidence and CMO-2 contact evidence into
 * an operator-facing pass/blocked/unknown chain. It does not compute detection,
 * firing solutions, mutate state, call backend routes, or trigger actions.
 * ========================================================================== */
(function (root) {
    'use strict';

    var DECISION_CHAIN_EVIDENCE_VERSION = '1.0.0-rmooz-cmo-3';

    var STEP_LABELS_EN = {
        contact: 'Contact',
        track_freshness: 'Track freshness',
        target_validity: 'Target validity',
        weapon: 'Weapon',
        range: 'Range',
        fire_control: 'Fire-control',
        ammo: 'Ammo',
        doctrine: 'Doctrine'
    };

    var STEP_LABELS_AR = {
        contact: 'الرصد',
        track_freshness: 'حداثة التتبع',
        target_validity: 'صلاحية الهدف',
        weapon: 'السلاح',
        range: 'المدى',
        fire_control: 'التحكم النيراني',
        ammo: 'الذخيرة',
        doctrine: 'قواعد الاشتباك'
    };

    var BLOCKING_REASON_LABELS_EN = {
        out_of_range: 'Target outside weapon range',
        weapons_hold: 'Doctrine/weapons hold',
        winchester: 'No ammunition available',
        no_fire_control_channel: 'No fire-control channel',
        no_valid_target: 'No valid target',
        stale_contact: 'Track/contact is stale',
        target_not_detected: 'Target not detected',
        undetected: 'Target not detected',
        no_detection: 'Target not detected',
        no_contact_evidence: 'No contact evidence available',
        no_engagement_evidence: 'No engagement evidence available',
        no_engagement_solution: 'No engagement solution',
        unknown_reason: 'Unknown decision blocker'
    };

    var BLOCKING_REASON_LABELS_AR = {
        out_of_range: 'الهدف خارج مدى السلاح',
        weapons_hold: 'إيقاف إطلاق حسب القواعد',
        winchester: 'لا توجد ذخيرة متاحة',
        no_fire_control_channel: 'لا توجد قناة تحكم نيراني',
        no_valid_target: 'لا يوجد هدف صالح',
        stale_contact: 'معلومة الرصد قديمة',
        target_not_detected: 'الهدف غير مكتشف',
        undetected: 'الهدف غير مكتشف',
        no_detection: 'الهدف غير مكتشف',
        no_contact_evidence: 'لا توجد أدلة رصد متاحة',
        no_engagement_evidence: 'لا توجد أدلة اشتباك متاحة',
        no_engagement_solution: 'لا يوجد حل اشتباك صالح',
        unknown_reason: 'سبب قرار غير معروف'
    };

    function obj(v) { return v && typeof v === 'object' ? v : {}; }
    function arr(v) { return Array.isArray(v) ? v : []; }
    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    function localContactApi() {
        if (root.AppContactEvidence) return root.AppContactEvidence;
        if (typeof require === 'function') {
            try { return require('./contact-evidence.js'); } catch (_) {}
        }
        return null;
    }

    function localEngagementApi() {
        if (root.AppEngagementEvidence) return root.AppEngagementEvidence;
        if (typeof require === 'function') {
            try { return require('./engagement-evidence.js'); } catch (_) {}
        }
        return null;
    }

    function labelsApi() {
        if (root.AppCmoEvidenceLabels) return root.AppCmoEvidenceLabels;
        if (typeof require === 'function') {
            try { return require('./cmo-evidence-labels.js'); } catch (_) {}
        }
        return null;
    }

    function statusStep(key, status, reason, detail) {
        return {
            key: key,
            label: STEP_LABELS_EN[key] || key,
            label_ar: STEP_LABELS_AR[key] || key,
            status: status,
            reason_code: reason || null,
            detail: detail || ''
        };
    }

    function hasTargetEvidence(contact, engagement) {
        return !!(contact.target_uid || engagement.target_uid || arr(contact.records).some(function (r) {
            return r && r.target_uid;
        }) || arr(engagement.records).some(function (r) {
            return r && r.target;
        }));
    }

    function firstBlocked(steps) {
        return arr(steps).filter(function (s) { return s.status === 'Blocked'; })[0] || null;
    }

    function allPass(steps) {
        return !!arr(steps).length && arr(steps).every(function (s) { return s.status === 'Pass'; });
    }

    function reasonLabel(code, lang) {
        var shared = labelsApi();
        if (shared && typeof shared.reasonLabel === 'function') {
            try { return shared.reasonLabel(code || 'unknown_reason', lang); } catch (_) {}
        }
        var k = code || 'unknown_reason';
        var map = String(lang || '').toLowerCase().indexOf('ar') === 0
            ? BLOCKING_REASON_LABELS_AR
            : BLOCKING_REASON_LABELS_EN;
        return map[k] || map.unknown_reason || k;
    }

    function stepForContact(contact) {
        var status = contact.detection_status || 'Unknown';
        if (status === 'Detected') return statusStep('contact', 'Pass', null, contact.target_uid || '');
        if (status === 'Stale') return statusStep('contact', 'Blocked', 'stale_contact', contact.target_uid || '');
        var reason = contact.reason_code || 'no_contact_evidence';
        return statusStep('contact', reason === 'no_contact_evidence' ? 'Unknown' : 'Blocked', reason, '');
    }

    function stepForFreshness(contact) {
        var status = contact.detection_status || 'Unknown';
        if (status === 'Detected') return statusStep('track_freshness', 'Pass', null, contact.last_seen == null ? '' : contact.last_seen);
        if (status === 'Stale') return statusStep('track_freshness', 'Blocked', 'stale_contact', contact.last_seen == null ? '' : contact.last_seen);
        return statusStep('track_freshness', 'Unknown', contact.reason_code || 'no_contact_evidence', '');
    }

    function stepForTarget(contact, engagement) {
        var reason = engagement.reason_code || contact.reason_code || null;
        if (reason === 'no_valid_target' || reason === 'target_not_detected' || reason === 'undetected' || reason === 'no_detection') {
            return statusStep('target_validity', 'Blocked', reason, '');
        }
        if (hasTargetEvidence(contact, engagement)) return statusStep('target_validity', 'Pass', null, engagement.target_uid || contact.target_uid || '');
        return statusStep('target_validity', 'Unknown', 'no_contact_evidence', '');
    }

    function stepForReason(key, engagement, blockerCode, detailValue) {
        if (engagement.reason_code === blockerCode) return statusStep(key, 'Blocked', blockerCode, detailValue || '');
        if (engagement.can_engage) return statusStep(key, 'Pass', null, detailValue || '');
        if (engagement.reason_code && engagement.reason_code !== 'no_engagement_evidence') return statusStep(key, 'Unknown', null, detailValue || '');
        return statusStep(key, 'Unknown', 'no_engagement_evidence', '');
    }

    function stepForWeapon(engagement) {
        if (engagement.reason_code === 'no_engagement_solution') return statusStep('weapon', 'Blocked', 'no_engagement_solution', '');
        if (engagement.weapon || engagement.can_engage) return statusStep('weapon', 'Pass', null, engagement.weapon || '');
        return statusStep('weapon', 'Unknown', 'no_engagement_evidence', '');
    }

    function stepForRange(engagement) {
        var detail = (engagement.range_nm != null && engagement.max_range_nm != null)
            ? (engagement.range_nm + ' / ' + engagement.max_range_nm + ' nm')
            : '';
        return stepForReason('range', engagement, 'out_of_range', detail);
    }

    function buildSteps(contact, engagement) {
        return [
            stepForContact(contact),
            stepForFreshness(contact),
            stepForTarget(contact, engagement),
            stepForWeapon(engagement),
            stepForRange(engagement),
            stepForReason('fire_control', engagement, 'no_fire_control_channel', ''),
            stepForReason('ammo', engagement, 'winchester', ''),
            stepForReason('doctrine', engagement, 'weapons_hold', '')
        ];
    }

    function getUnitDecisionChainEvidence(worldStateOrProvider, uid) {
        var ws = (typeof worldStateOrProvider === 'function') ? worldStateOrProvider() : worldStateOrProvider;
        var CE = localContactApi();
        var EE = localEngagementApi();
        var contact = CE && typeof CE.getUnitContactEvidence === 'function'
            ? CE.getUnitContactEvidence(ws, uid)
            : { detection_status: 'Unknown', reason_code: 'no_contact_evidence', records: [] };
        var engagement = EE && typeof EE.getUnitEngagementWhyNot === 'function'
            ? EE.getUnitEngagementWhyNot(ws, uid)
            : { can_engage: false, reason_code: 'no_engagement_evidence', records: [] };
        contact = obj(contact);
        engagement = obj(engagement);

        var steps = buildSteps(contact, engagement);
        var blocked = firstBlocked(steps);
        var finalStatus = blocked ? 'Blocked' : (allPass(steps) ? 'Ready' : 'Unknown');
        var blockingReason = blocked
            ? (blocked.reason_code || engagement.reason_code || contact.reason_code || 'unknown_reason')
            : (finalStatus === 'Ready' ? null : (contact.reason_code || engagement.reason_code || 'unknown_reason'));

        return {
            final_status: finalStatus,
            can_engage: finalStatus === 'Ready',
            blocking_reason_code: blockingReason,
            blocking_reason_label: blockingReason ? reasonLabel(blockingReason, 'en') : 'None',
            source: 'Contact + engagement derived evidence',
            contact: contact,
            engagement: engagement,
            steps: steps
        };
    }

    function row(step) {
        var cls = String(step.status || 'Unknown').toLowerCase();
        var detail = step.detail ? ' - ' + step.detail : '';
        var reason = step.reason_code ? ' (' + step.reason_code + ')' : '';
        return '<div class="usp-chain-row ' + esc(cls) + '">' +
            '<span class="usp-chain-lbl">' + esc(step.label + ' / ' + step.label_ar) + '</span>' +
            '<span class="usp-chain-val"><span class="usp-chain-pill ' + esc(cls) + '">' +
            esc(step.status || 'Unknown') + '</span>' + esc(detail + reason) + '</span>' +
            '</div>';
    }

    function renderDecisionChainEvidenceHtml(evidence, opts) {
        opts = opts || {};
        var lang = opts.lang || 'en';
        var ev = evidence || getUnitDecisionChainEvidence(null, null);
        var status = ev.final_status || 'Unknown';
        var reasonCode = ev.blocking_reason_code || null;
        var reasonText = reasonCode ? reasonLabel(reasonCode, lang) + ' (' + reasonCode + ')' : 'None';
        var shared = labelsApi();
        var statusArabic = shared && typeof shared.statusLabel === 'function'
            ? shared.statusLabel(status, 'ar')
            : (status === 'Ready' ? 'جاهز' : (status === 'Blocked' ? 'ممنوع' : 'غير معروف'));
        var html = '';
        html += '<div class="usp-chain-status ' + esc(String(status).toLowerCase()) + '">' +
            esc(status + ' / ' + statusArabic) + '</div>';
        html += arr(ev.steps).map(row).join('');
        html += '<div class="usp-chain-row final"><span class="usp-chain-lbl">Final / النتيجة النهائية</span>' +
            '<span class="usp-chain-val">' + esc(status) + '</span></div>';
        html += '<div class="usp-chain-row reason"><span class="usp-chain-lbl">Blocking reason / سبب المنع</span>' +
            '<span class="usp-chain-val">' + esc(reasonText) + '</span></div>';
        html += '<div class="usp-chain-row source"><span class="usp-chain-lbl">Source / المصدر</span>' +
            '<span class="usp-chain-val">' + esc(ev.source || 'Contact + engagement derived evidence') + '</span></div>';
        return html;
    }

    var api = {
        DECISION_CHAIN_EVIDENCE_VERSION: DECISION_CHAIN_EVIDENCE_VERSION,
        STEP_LABELS_EN: STEP_LABELS_EN,
        STEP_LABELS_AR: STEP_LABELS_AR,
        BLOCKING_REASON_LABELS_EN: BLOCKING_REASON_LABELS_EN,
        BLOCKING_REASON_LABELS_AR: BLOCKING_REASON_LABELS_AR,
        reasonLabel: reasonLabel,
        getUnitDecisionChainEvidence: getUnitDecisionChainEvidence,
        renderDecisionChainEvidenceHtml: renderDecisionChainEvidenceHtml
    };

    root.AppDecisionChainEvidence = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
