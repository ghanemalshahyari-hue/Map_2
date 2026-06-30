/* ============================================================================
 * contact-evidence.js - RMOOZ-CMO-2 read-only contact freshness evidence
 * ----------------------------------------------------------------------------
 * Display/accessor layer only. Reads existing World State contact records and
 * turns them into operator-facing evidence. It does not compute detections,
 * mutate scenario state, call backend routes, or change sensor behavior.
 * ========================================================================== */
(function (root) {
    'use strict';

    var CONTACT_EVIDENCE_VERSION = '1.0.0-rmooz-cmo-2';

    var CONTACT_REASON_LABELS_EN = {
        no_contact_evidence: 'No contact evidence available',
        detected_by_sensor: 'Contact held by existing sensor evidence',
        out_of_sensor_range: 'Out of sensor range',
        stale_contact: 'Stale contact',
        no_sensor_coverage: 'No sensor coverage',
        terrain_blocked: 'Terrain blocked',
        unknown_reason: 'Unknown contact reason'
    };

    var CONTACT_REASON_LABELS_AR = {
        no_contact_evidence: 'لا توجد أدلة رصد متاحة',
        detected_by_sensor: 'الرصد متاح من أدلة المستشعر',
        out_of_sensor_range: 'خارج مدى المستشعر',
        stale_contact: 'معلومة الرصد قديمة',
        no_sensor_coverage: 'لا توجد تغطية مستشعر',
        terrain_blocked: 'التضاريس تحجب الرصد',
        unknown_reason: 'سبب الرصد غير معروف'
    };

    function arr(v) { return Array.isArray(v) ? v : []; }
    function obj(v) { return v && typeof v === 'object' ? v : {}; }
    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    function reasonLabel(code, lang) {
        var k = code || 'unknown_reason';
        var map = String(lang || '').toLowerCase().indexOf('ar') === 0
            ? CONTACT_REASON_LABELS_AR
            : CONTACT_REASON_LABELS_EN;
        return map[k] || map.unknown_reason || k;
    }

    function confidenceLabel(conf) {
        var c = String(conf || '').toLowerCase();
        if (c === 'firm' || c === 'high') return 'High';
        if (c === 'tentative' || c === 'probable' || c === 'medium') return 'Medium';
        if (c === 'possible' || c === 'low') return 'Low';
        return 'Unknown';
    }

    function sourceLabel(rec) {
        var method = rec.method || rec.sensor_type || rec.source_sensor_type || '';
        var sensor = rec.by_sensor || rec.sensor || rec.sensor_id || '';
        if (method && sensor) return String(method).toUpperCase() + ' / ' + sensor;
        if (sensor) return sensor;
        if (method) return String(method).toUpperCase();
        return 'Unknown';
    }

    function firstReason(rec) {
        if (!rec) return null;
        if (rec.reason_code) return rec.reason_code;
        if (rec.reasonCode) return rec.reasonCode;
        if (rec.reason) return rec.reason;
        if (rec.stale || rec.is_stale) return 'stale_contact';
        if (Array.isArray(rec.reasons) && rec.reasons.length) return rec.reasons[0];
        return null;
    }

    function normalizeRecord(raw, meta) {
        raw = obj(raw);
        meta = obj(meta);
        var reason = firstReason(raw) || 'detected_by_sensor';
        var stale = !!(raw.stale || raw.is_stale || reason === 'stale_contact');
        return {
            detection_status: stale ? 'Stale' : 'Detected',
            reason_code: reason,
            target_uid: raw.target_uid || raw.target || raw.contact_uid || null,
            detected_by_side: raw.detected_by_side || raw.side || null,
            by_unit: raw.by_unit || raw.observer_uid || raw.unit_uid || raw.uid || null,
            by_sensor: raw.by_sensor || raw.sensor || raw.sensor_id || null,
            method: raw.method || raw.sensor_type || null,
            confidence: confidenceLabel(raw.confidence),
            confidence_code: raw.confidence || null,
            classification: raw.classification || raw.target_classification || null,
            last_seen: raw.last_seen || raw.lastSeen || raw.last_seen_tick || raw.lastSeenTick || raw.step_index || raw.tick || null,
            range_nm: raw.range_nm,
            max_range_nm: raw.max_range_nm,
            source: 'World-state derived evidence',
            step_index: meta.step_index != null ? meta.step_index : null,
            raw: raw
        };
    }

    function collectUnitRecords(ws, uid) {
        var d = obj(ws && ws.derived);
        var buckets = [
            d.contacts_by_unit, d.contact_evidence_by_unit,
            ws && ws.contacts_by_unit, ws && ws.contact_evidence_by_unit
        ];
        for (var i = 0; i < buckets.length; i++) {
            var b = obj(buckets[i]);
            if (b[uid]) return arr(b[uid]).length ? arr(b[uid]) : [b[uid]];
        }
        var lists = []
            .concat(arr(d.contacts))
            .concat(arr(d.contact_evidence))
            .concat(arr(ws && ws.contacts))
            .concat(arr(ws && ws.contact_evidence));
        return lists.filter(function (r) {
            return r && (r.by_unit === uid || r.observer_uid === uid || r.unit_uid === uid || r.uid === uid);
        });
    }

    function summarizeRecords(records, meta) {
        records = arr(records).map(function (r) { return normalizeRecord(r, meta); });
        if (!records.length) {
            return {
                detection_status: 'Unknown',
                reason_code: 'no_contact_evidence',
                confidence: 'Unknown',
                sensor_source: 'Unknown',
                source: 'World-state derived evidence',
                records: []
            };
        }
        var primary = records[0];
        return {
            detection_status: primary.detection_status,
            reason_code: primary.reason_code,
            target_uid: primary.target_uid,
            last_seen: primary.last_seen,
            confidence: primary.confidence,
            confidence_code: primary.confidence_code,
            sensor_source: sourceLabel(primary),
            classification: primary.classification,
            range_nm: primary.range_nm,
            max_range_nm: primary.max_range_nm,
            source: primary.source,
            records: records
        };
    }

    function getUnitContactEvidence(worldStateOrProvider, uid) {
        var ws = (typeof worldStateOrProvider === 'function') ? worldStateOrProvider() : worldStateOrProvider;
        if (!uid || !ws) return summarizeRecords([], {});
        return summarizeRecords(collectUnitRecords(ws, uid), obj(ws.meta));
    }

    function row(label, value, cls) {
        return '<div class="usp-contact-row ' + esc(cls || '') + '">' +
            '<span class="usp-contact-lbl">' + esc(label) + '</span>' +
            '<span class="usp-contact-val">' + esc(value == null || value === '' ? '-' : value) + '</span>' +
            '</div>';
    }

    function renderContactEvidenceHtml(evidence, opts) {
        opts = opts || {};
        var lang = opts.lang || 'en';
        var ev = evidence || summarizeRecords([], {});
        var reason = ev.reason_code || 'unknown_reason';
        var rangeText = (ev.range_nm != null && ev.max_range_nm != null)
            ? (ev.range_nm + ' / ' + ev.max_range_nm + ' nm')
            : 'Not reported';
        var html = '';
        html += '<div class="usp-contact-status ' + esc(String(ev.detection_status || 'unknown').toLowerCase()) + '">' +
            esc((ev.detection_status || 'Unknown') + ' / ' + (ev.detection_status === 'Detected' ? 'مرصود' : (ev.detection_status === 'Stale' ? 'قديم' : 'غير معروف'))) +
            '</div>';
        html += row('Detection status / حالة الرصد', ev.detection_status || 'Unknown', 'status');
        html += row('Last seen / آخر رصد', ev.last_seen == null ? 'Unknown' : ev.last_seen, 'last-seen');
        html += row('Confidence / الثقة', ev.confidence || 'Unknown', 'confidence');
        html += row('Sensor/source / المستشعر', ev.sensor_source || 'Unknown', 'sensor');
        html += row('Target / الهدف', ev.target_uid || 'Unknown', 'target');
        html += row('Range / المدى', rangeText, 'range');
        html += row('Reason / السبب', reasonLabel(reason, lang) + (reason ? ' (' + reason + ')' : ''), 'reason');
        html += row('Source / المصدر', ev.source || 'World-state derived evidence', 'source');
        return html;
    }

    var api = {
        CONTACT_EVIDENCE_VERSION: CONTACT_EVIDENCE_VERSION,
        CONTACT_REASON_LABELS_EN: CONTACT_REASON_LABELS_EN,
        CONTACT_REASON_LABELS_AR: CONTACT_REASON_LABELS_AR,
        reasonLabel: reasonLabel,
        confidenceLabel: confidenceLabel,
        normalizeRecord: normalizeRecord,
        getUnitContactEvidence: getUnitContactEvidence,
        renderContactEvidenceHtml: renderContactEvidenceHtml,
        _summarizeRecords: summarizeRecords
    };

    root.AppContactEvidence = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
