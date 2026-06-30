/* ============================================================================
 * engagement-evidence.js - RMOOZ-CMO-1 read-only engagement "why not" evidence
 * ----------------------------------------------------------------------------
 * Display/accessor layer only. Reads existing ENG1 / World State engagement
 * records and turns them into operator-facing evidence. It does not compute
 * firing solutions, mutate scenario state, call backend routes, or trigger fire.
 * ========================================================================== */
(function (root) {
    'use strict';

    var ENGAGEMENT_EVIDENCE_VERSION = '1.0.0-rmooz-cmo-1';

    var ENGAGEMENT_REASON_LABELS_EN = {
        weapons_hold: 'Weapons hold',
        out_of_range: 'Out of range',
        winchester: 'Winchester / no ammo',
        no_fire_control_channel: 'No fire-control channel',
        no_valid_target: 'No valid target',
        stale_contact: 'Target contact is stale',
        target_not_detected: 'Target not detected',
        undetected: 'Target not detected',
        no_detection: 'Target not detected',
        no_engagement_solution: 'No engagement solution',
        no_engagement_evidence: 'No engagement evidence available',
        unknown_reason: 'Unknown engagement reason'
    };

    var ENGAGEMENT_REASON_LABELS_AR = {
        weapons_hold: 'إيقاف إطلاق حسب القواعد',
        out_of_range: 'الهدف خارج مدى السلاح',
        winchester: 'لا توجد ذخيرة متاحة',
        no_fire_control_channel: 'لا توجد قناة تحكم نيراني',
        no_valid_target: 'لا يوجد هدف صالح',
        stale_contact: 'معلومة الهدف قديمة',
        target_not_detected: 'الهدف غير مكتشف',
        undetected: 'الهدف غير مكتشف',
        no_detection: 'الهدف غير مكتشف',
        no_engagement_solution: 'لا يوجد حل اشتباك صالح',
        no_engagement_evidence: 'لا توجد أدلة اشتباك متاحة',
        unknown_reason: 'سبب اشتباك غير معروف'
    };

    function arr(v) { return Array.isArray(v) ? v : []; }
    function obj(v) { return v && typeof v === 'object' ? v : {}; }
    function isYes(v) { return v === true || v === 'true' || v === 'yes' || v === 'engaged' || v === 'can_engage'; }
    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    function labelsApi() {
        if (root.AppCmoEvidenceLabels) return root.AppCmoEvidenceLabels;
        if (typeof require === 'function') {
            try { return require('./cmo-evidence-labels.js'); } catch (_) {}
        }
        return null;
    }

    function reasonLabel(code, lang) {
        var shared = labelsApi();
        if (shared && typeof shared.reasonLabel === 'function') {
            try { return shared.reasonLabel(code || 'unknown_reason', lang); } catch (_) {}
        }
        var k = code || 'unknown_reason';
        var map = String(lang || '').toLowerCase().indexOf('ar') === 0
            ? ENGAGEMENT_REASON_LABELS_AR
            : ENGAGEMENT_REASON_LABELS_EN;
        return map[k] || map.unknown_reason || k;
    }

    function firstReason(rec) {
        if (!rec) return null;
        if (rec.reason_code) return rec.reason_code;
        if (rec.reasonCode) return rec.reasonCode;
        if (rec.reason) return rec.reason;
        if (Array.isArray(rec.reasons) && rec.reasons.length) return rec.reasons[0];
        if (Array.isArray(rec.blocked_reasons) && rec.blocked_reasons.length) return rec.blocked_reasons[0];
        return null;
    }

    function normalizeRecord(raw) {
        raw = obj(raw);
        var status = raw.status || raw.verdict || raw.engagement_status || '';
        var can = raw.can_engage;
        if (can == null) can = raw.canEngage;
        if (can == null) can = raw.can_fire;
        if (can == null) can = raw.canFire;
        if (can == null) can = isYes(status);

        var reason = firstReason(raw);
        if (!can && !reason) reason = 'unknown_reason';
        return {
            can_engage: !!can,
            reason_code: can ? (reason || null) : (reason || 'unknown_reason'),
            source: raw.source || raw.evidence_source || 'Adjudicator evidence',
            shooter: raw.shooter || raw.actor_uid || raw.unit_uid || raw.uid || null,
            target: raw.target || raw.target_uid || raw.contact_uid || null,
            weapon: raw.weapon || raw.weapon_id || raw.weapon_class || null,
            status: status || (can ? 'engaged' : 'blocked'),
            range_nm: raw.range_nm,
            max_range_nm: raw.max_range_nm,
            raw: raw
        };
    }

    function collectUnitRecords(ws, uid) {
        var d = obj(ws && ws.derived);
        var buckets = [
            d.engagements_by_unit, d.engagement_by_unit, d.engagement_evidence_by_unit,
            ws && ws.engagements_by_unit, ws && ws.engagement_by_unit
        ];
        for (var i = 0; i < buckets.length; i++) {
            var b = obj(buckets[i]);
            if (b[uid]) return arr(b[uid]).length ? arr(b[uid]) : [b[uid]];
        }

        var lists = []
            .concat(arr(d.engagement_outcomes))
            .concat(arr(d.engagements))
            .concat(arr(d.engagement_evidence))
            .concat(arr(ws && ws.engagement_outcomes))
            .concat(arr(ws && ws.engagements));
        return lists.filter(function (r) {
            return r && (r.shooter === uid || r.actor_uid === uid || r.unit_uid === uid || r.uid === uid);
        });
    }

    function summarizeRecords(records) {
        records = arr(records).map(normalizeRecord);
        if (!records.length) {
            return {
                can_engage: false,
                reason_code: 'no_engagement_evidence',
                label: ENGAGEMENT_REASON_LABELS_EN.no_engagement_evidence,
                source: 'Adjudicator evidence',
                records: []
            };
        }
        var engaged = records.filter(function (r) { return r.can_engage || r.status === 'engaged'; });
        var blocked = records.filter(function (r) { return !r.can_engage && r.reason_code; });
        var primary = engaged[0] || blocked[0] || records[0];
        return {
            can_engage: !!engaged.length,
            reason_code: engaged.length ? null : (primary.reason_code || 'unknown_reason'),
            label: engaged.length ? 'Can engage' : reasonLabel(primary.reason_code, 'en'),
            source: primary.source || 'Adjudicator evidence',
            target_uid: primary.target || null,
            weapon: primary.weapon || null,
            range_nm: primary.range_nm,
            max_range_nm: primary.max_range_nm,
            records: records
        };
    }

    function getUnitEngagementWhyNot(worldStateOrProvider, uid) {
        var ws = (typeof worldStateOrProvider === 'function') ? worldStateOrProvider() : worldStateOrProvider;
        if (!uid || !ws) return summarizeRecords([]);
        return summarizeRecords(collectUnitRecords(ws, uid));
    }

    function row(label, value, cls) {
        return '<div class="usp-engagement-row ' + esc(cls || '') + '">' +
            '<span class="usp-engagement-lbl">' + esc(label) + '</span>' +
            '<span class="usp-engagement-val">' + esc(value == null || value === '' ? '-' : value) + '</span>' +
            '</div>';
    }

    function renderEngagementEvidenceHtml(evidence, opts) {
        opts = opts || {};
        var lang = opts.lang || 'en';
        var ev = evidence || summarizeRecords([]);
        var reason = ev.reason_code || (ev.can_engage ? 'can_engage' : 'unknown_reason');
        var statusText = ev.can_engage ? 'Can engage / يمكن الاشتباك' : 'Cannot engage / لا يمكن الاشتباك';
        var reasonText = ev.can_engage ? 'Firing solution available' : reasonLabel(reason, lang);
        var rangeText = (ev.range_nm != null && ev.max_range_nm != null)
            ? (ev.range_nm + ' / ' + ev.max_range_nm + ' nm')
            : (reason === 'out_of_range' ? reasonLabel('out_of_range', lang) : 'Not reported');
        var html = '';
        html += '<div class="usp-engagement-status ' + (ev.can_engage ? 'can' : 'cannot') + '">' + esc(statusText) + '</div>';
        html += row('Reason / السبب', reasonText + (reason && reason !== 'can_engage' ? ' (' + reason + ')' : ''), 'reason');
        html += row('Target status / حالة الهدف', ev.target_uid || (reason === 'no_valid_target' ? reasonLabel(reason, lang) : 'Not reported'), 'target');
        html += row('Weapon availability / توفر السلاح', ev.weapon || (reason === 'no_engagement_solution' ? reasonLabel(reason, lang) : 'Not reported'), 'weapon');
        html += row('Range status / حالة المدى', rangeText, 'range');
        html += row('Fire-control issue / التحكم النيراني', reason === 'no_fire_control_channel' ? reasonLabel(reason, lang) : 'Not reported', 'fc');
        html += row('Winchester/ammo issue / الذخيرة', reason === 'winchester' ? reasonLabel(reason, lang) : 'Not reported', 'ammo');
        html += row('Doctrine hold issue / قواعد الاشتباك', reason === 'weapons_hold' ? reasonLabel(reason, lang) : 'Not reported', 'doctrine');
        html += row('Source / المصدر', ev.source || 'Adjudicator evidence', 'source');
        return html;
    }

    var api = {
        ENGAGEMENT_EVIDENCE_VERSION: ENGAGEMENT_EVIDENCE_VERSION,
        ENGAGEMENT_REASON_LABELS_EN: ENGAGEMENT_REASON_LABELS_EN,
        ENGAGEMENT_REASON_LABELS_AR: ENGAGEMENT_REASON_LABELS_AR,
        reasonLabel: reasonLabel,
        normalizeRecord: normalizeRecord,
        getUnitEngagementWhyNot: getUnitEngagementWhyNot,
        renderEngagementEvidenceHtml: renderEngagementEvidenceHtml,
        _summarizeRecords: summarizeRecords
    };

    root.AppEngagementEvidence = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
