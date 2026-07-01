/* ============================================================================
 * cmo-evidence-timeline.js - RMOOZ-CMO-5 bounded evidence timeline
 * ----------------------------------------------------------------------------
 * Client-side, read-only event log of evidence RMOOZ has actually rendered or
 * observed. It stores only a bounded in-memory history per unit. No backend
 * routes, database writes, scenario mutation, combat mutation, or doctrine edits.
 * ========================================================================== */
(function (root) {
    'use strict';

    var CMO_EVIDENCE_TIMELINE_VERSION = '1.0.0-rmooz-cmo-5';
    var DEFAULT_LIMIT = 50;
    var eventsByUnit = {};
    var lastFingerprintByUnit = {};

    function arr(v) { return Array.isArray(v) ? v : []; }
    function obj(v) { return v && typeof v === 'object' ? v : {}; }
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

    function uidOf(unitOrUid) {
        if (typeof unitOrUid === 'string') return unitOrUid;
        unitOrUid = obj(unitOrUid);
        return unitOrUid.uid || unitOrUid.id || unitOrUid.unit_uid || unitOrUid.unitId || null;
    }

    function reasonLabelAr(code) {
        var labels = labelsApi();
        if (labels && typeof labels.reasonLabel === 'function') {
            try { return labels.reasonLabel(code || 'unknown_reason', 'ar'); } catch (_) {}
        }
        return code || 'unknown_reason';
    }

    function statusLabel(status, lang) {
        var labels = labelsApi();
        if (labels && typeof labels.statusLabel === 'function') {
            try { return labels.statusLabel(status || 'Unknown', lang || 'en'); } catch (_) {}
        }
        return status || 'Unknown';
    }

    function normalizeStatus(status) {
        var s = String(status || 'Unknown');
        if (s === 'engaged' || s === 'can_engage' || s === 'Can engage') return 'Ready';
        if (s === 'blocked' || s === 'Cannot engage') return 'Blocked';
        if (s === 'detected') return 'Detected';
        if (s === 'stale') return 'Stale';
        return s.charAt(0).toUpperCase() + s.slice(1);
    }

    function fingerprint(uid, event) {
        return [
            uid,
            event.type || '',
            event.status || '',
            event.reason_code || '',
            event.target || event.target_uid || '',
            event.weapon || '',
            event.source || ''
        ].join('|');
    }

    function record(uid, event, opts) {
        opts = opts || {};
        uid = uidOf(uid) || uidOf(event);
        if (!uid || !event || !event.type) return null;
        var normalized = Object.assign({}, event, {
            uid: uid,
            timestamp: event.timestamp || new Date().toISOString()
        });
        if (normalized.reason_code && !normalized.reason_label_ar) {
            normalized.reason_label_ar = reasonLabelAr(normalized.reason_code);
        }
        var fp = event.fingerprint || fingerprint(uid, normalized);
        var key = normalized.type || 'event';
        if (!lastFingerprintByUnit[uid]) lastFingerprintByUnit[uid] = {};
        if (!opts.force && lastFingerprintByUnit[uid][key] === fp) return null;
        lastFingerprintByUnit[uid][key] = fp;

        if (!eventsByUnit[uid]) eventsByUnit[uid] = [];
        eventsByUnit[uid].push(Object.assign({}, normalized, { fingerprint: fp }));
        var limit = Math.max(1, opts.limit || DEFAULT_LIMIT);
        if (eventsByUnit[uid].length > limit) {
            eventsByUnit[uid] = eventsByUnit[uid].slice(eventsByUnit[uid].length - limit);
        }
        return eventsByUnit[uid][eventsByUnit[uid].length - 1];
    }

    function get(uid) {
        uid = uidOf(uid);
        return uid && eventsByUnit[uid] ? eventsByUnit[uid].slice() : [];
    }

    function clear(uid) {
        uid = uidOf(uid);
        if (uid) {
            delete eventsByUnit[uid];
            delete lastFingerprintByUnit[uid];
            return;
        }
        eventsByUnit = {};
        lastFingerprintByUnit = {};
    }

    function observeContact(uid, evidence) {
        evidence = obj(evidence);
        if (!evidence.records || !evidence.records.length) {
            return record(uid, {
                type: 'evidence_missing',
                status: 'Unknown',
                reason_code: evidence.reason_code || 'no_contact_evidence',
                source: 'contact-evidence'
            });
        }
        return record(uid, {
            type: 'contact_status_changed',
            status: normalizeStatus(evidence.detection_status || 'Unknown'),
            reason_code: evidence.reason_code || null,
            reason_label_ar: evidence.reason_code ? reasonLabelAr(evidence.reason_code) : null,
            target: evidence.target_uid || null,
            source: 'contact-evidence',
            tick: evidence.last_seen == null ? null : evidence.last_seen,
            sensor: evidence.sensor_source || null,
            confidence: evidence.confidence || null
        });
    }

    function observeEngagement(uid, evidence) {
        evidence = obj(evidence);
        var missing = evidence.reason_code === 'no_engagement_evidence' || !arr(evidence.records).length;
        if (missing) {
            return record(uid, {
                type: 'evidence_missing',
                status: 'Unknown',
                reason_code: evidence.reason_code || 'no_engagement_evidence',
                source: 'engagement-evidence'
            });
        }
        return record(uid, {
            type: 'engagement_status_changed',
            status: evidence.can_engage ? 'Ready' : 'Blocked',
            reason_code: evidence.can_engage ? null : (evidence.reason_code || 'unknown_reason'),
            target: evidence.target_uid || null,
            weapon: evidence.weapon || null,
            source: 'engagement-evidence'
        });
    }

    function observeDecision(uid, evidence) {
        evidence = obj(evidence);
        var status = evidence.final_status || 'Unknown';
        record(uid, {
            type: 'decision_chain_evaluated',
            status: status,
            reason_code: evidence.blocking_reason_code || null,
            target: evidence.engagement && evidence.engagement.target_uid || evidence.contact && evidence.contact.target_uid || null,
            weapon: evidence.engagement && evidence.engagement.weapon || null,
            source: 'decision-chain'
        });
        if (evidence.blocking_reason_code) {
            return record(uid, {
                type: 'blocking_reason_changed',
                status: status,
                reason_code: evidence.blocking_reason_code,
                reason_label_ar: reasonLabelAr(evidence.blocking_reason_code),
                target: evidence.engagement && evidence.engagement.target_uid || evidence.contact && evidence.contact.target_uid || null,
                weapon: evidence.engagement && evidence.engagement.weapon || null,
                source: 'decision-chain'
            });
        }
        return null;
    }

    function observeOverlay(uid, overlayState) {
        overlayState = obj(overlayState);
        var parts = [];
        if (overlayState.weapon_range_meters) parts.push('weapon range');
        if (overlayState.sensor_range_meters) parts.push('sensor range');
        if (overlayState.target_line) parts.push('target line');
        return record(uid || overlayState.uid, {
            type: 'overlay_rendered',
            status: overlayState.status || 'Unknown',
            reason_code: overlayState.reason_code || null,
            reason_label_ar: overlayState.reason_label_ar || (overlayState.reason_code ? reasonLabelAr(overlayState.reason_code) : null),
            target: overlayState.target_uid || null,
            source: 'map-overlay',
            detail: parts.length ? parts.join(' + ') : 'no map geometry'
        });
    }

    function formatTime(event) {
        var ts = event && event.timestamp;
        if (!ts) return '--:--:--';
        var d = new Date(ts);
        if (Number.isNaN(d.getTime())) return String(ts);
        return d.toTimeString().slice(0, 8);
    }

    function eventSummary(event) {
        event = obj(event);
        if (event.type === 'contact_status_changed') {
            return (event.status || 'Contact') + ': ' + (event.sensor || 'Sensor unknown') +
                (event.confidence ? ' - confidence ' + event.confidence : '');
        }
        if (event.type === 'engagement_status_changed') {
            return (event.status || 'Engagement') +
                (event.reason_code ? ': ' + event.reason_code + ' - ' + reasonLabelAr(event.reason_code) : '');
        }
        if (event.type === 'decision_chain_evaluated') {
            return 'Decision chain evaluated - ' + (event.status || 'Unknown');
        }
        if (event.type === 'blocking_reason_changed') {
            return 'Blocking reason - ' + (event.reason_code || 'unknown_reason') + ' - ' + (event.reason_label_ar || reasonLabelAr(event.reason_code));
        }
        if (event.type === 'overlay_rendered') {
            return 'Overlay rendered - ' + (event.detail || 'evidence overlay') +
                (event.reason_code ? ' - ' + event.reason_code + ' - ' + reasonLabelAr(event.reason_code) : '');
        }
        if (event.type === 'evidence_missing') {
            return 'Evidence missing - ' + (event.reason_code || 'unknown_reason') + ' - ' + reasonLabelAr(event.reason_code);
        }
        return (event.type || 'Evidence event') + (event.reason_code ? ' - ' + event.reason_code : '');
    }

    function row(event) {
        var cls = String(event.status || 'Unknown').toLowerCase();
        return '<div class="usp-timeline-row ' + esc(cls) + '">' +
            '<span class="usp-timeline-time">' + esc(formatTime(event)) + '</span>' +
            '<span class="usp-timeline-text">' + esc(eventSummary(event)) + '</span>' +
            '</div>';
    }

    function renderTimelineHtml(uid, opts) {
        opts = opts || {};
        var limit = opts.limit || 6;
        var rows = get(uid).slice(-limit).reverse();
        var html = '<div class="usp-timeline-intro">Latest evidence changes / آخر تغيّرات الأدلة</div>';
        if (!rows.length) {
            return html + '<div class="usp-timeline-empty">No evidence changes recorded yet. / لا توجد تغيّرات مسجلة بعد</div>';
        }
        return html + rows.map(row).join('');
    }

    var api = {
        CMO_EVIDENCE_TIMELINE_VERSION: CMO_EVIDENCE_TIMELINE_VERSION,
        record: record,
        get: get,
        clear: clear,
        observeContact: observeContact,
        observeEngagement: observeEngagement,
        observeDecision: observeDecision,
        observeOverlay: observeOverlay,
        renderTimelineHtml: renderTimelineHtml,
        _fingerprint: fingerprint,
        _eventSummary: eventSummary
    };

    root.RmoozCmoEvidenceTimeline = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
