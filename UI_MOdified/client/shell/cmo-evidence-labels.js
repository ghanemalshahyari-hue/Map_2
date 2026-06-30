/* ============================================================================
 * cmo-evidence-labels.js - Shared CMO evidence labels
 * ----------------------------------------------------------------------------
 * One source for reason/status display labels used by CMO panels and map
 * overlays. Label-only helper; no backend calls, no state mutation.
 * ========================================================================== */
(function (root) {
    'use strict';

    var CMO_EVIDENCE_LABELS_VERSION = '1.0.0-cmo-evidence-lock-1';

    var REASON_LABELS_EN = {
        can_engage: 'Can engage',
        ready: 'Ready',
        weapons_hold: 'Weapons hold',
        out_of_range: 'Target outside weapon range',
        winchester: 'Winchester / no ammo',
        no_fire_control_channel: 'No fire-control channel',
        no_valid_target: 'No valid target',
        stale_contact: 'Track/contact is stale',
        target_not_detected: 'Target not detected',
        undetected: 'Target not detected',
        no_detection: 'Target not detected',
        no_contact_evidence: 'No contact evidence available',
        detected_by_sensor: 'Contact held by existing sensor evidence',
        out_of_sensor_range: 'Out of sensor range',
        no_sensor_coverage: 'No sensor coverage',
        terrain_blocked: 'Terrain blocked',
        no_engagement_evidence: 'No engagement evidence available',
        no_engagement_solution: 'No engagement solution',
        unknown_reason: 'Unknown evidence reason'
    };

    var REASON_LABELS_AR = {
        can_engage: 'يمكن الاشتباك',
        ready: 'جاهز',
        weapons_hold: 'إيقاف إطلاق حسب القواعد',
        out_of_range: 'الهدف خارج مدى السلاح',
        winchester: 'لا توجد ذخيرة متاحة',
        no_fire_control_channel: 'لا توجد قناة تحكم نيراني',
        no_valid_target: 'لا يوجد هدف صالح',
        stale_contact: 'معلومة الرصد قديمة',
        target_not_detected: 'الهدف غير مكتشف',
        undetected: 'الهدف غير مكتشف',
        no_detection: 'الهدف غير مكتشف',
        no_contact_evidence: 'لا توجد أدلة رصد متاحة',
        detected_by_sensor: 'الرصد متاح من أدلة المستشعر',
        out_of_sensor_range: 'خارج مدى المستشعر',
        no_sensor_coverage: 'لا توجد تغطية مستشعر',
        terrain_blocked: 'التضاريس تحجب الرصد',
        no_engagement_evidence: 'لا توجد أدلة اشتباك متاحة',
        no_engagement_solution: 'لا يوجد حل اشتباك صالح',
        unknown_reason: 'سبب أدلة غير معروف'
    };

    var STATUS_LABELS_EN = {
        Ready: 'Ready',
        Blocked: 'Blocked',
        Unknown: 'Unknown',
        Detected: 'Detected',
        Stale: 'Stale'
    };

    var STATUS_LABELS_AR = {
        Ready: 'جاهز',
        Blocked: 'ممنوع',
        Unknown: 'غير معروف',
        Detected: 'مرصود',
        Stale: 'قديم'
    };

    function isArabic(lang) {
        return String(lang || '').toLowerCase().indexOf('ar') === 0;
    }

    function reasonLabel(code, lang) {
        var k = code || 'unknown_reason';
        var map = isArabic(lang) ? REASON_LABELS_AR : REASON_LABELS_EN;
        return map[k] || map.unknown_reason || k;
    }

    function statusLabel(status, lang) {
        var s = status || 'Unknown';
        var map = isArabic(lang) ? STATUS_LABELS_AR : STATUS_LABELS_EN;
        return map[s] || map.Unknown || s;
    }

    var api = {
        CMO_EVIDENCE_LABELS_VERSION: CMO_EVIDENCE_LABELS_VERSION,
        REASON_LABELS_EN: REASON_LABELS_EN,
        REASON_LABELS_AR: REASON_LABELS_AR,
        STATUS_LABELS_EN: STATUS_LABELS_EN,
        STATUS_LABELS_AR: STATUS_LABELS_AR,
        reasonLabel: reasonLabel,
        statusLabel: statusLabel
    };

    root.AppCmoEvidenceLabels = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
