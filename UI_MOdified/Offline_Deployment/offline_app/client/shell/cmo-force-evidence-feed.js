/* ============================================================================
 * cmo-force-evidence-feed.js - RMOOZ-CMO-10 force evidence event feed
 * ----------------------------------------------------------------------------
 * Read-only, bounded in-memory feed of force-level evidence changes observed
 * from the CMO readiness matrix. No backend routes, state writes, combat
 * mutation, scenario contract changes, or doctrine edits.
 * ========================================================================== */
(function (root) {
    'use strict';

    var CMO_FORCE_EVIDENCE_FEED_VERSION = '1.0.0-rmooz-cmo-10';
    var DEFAULT_LIMIT = 60;
    var events = [];
    var lastFingerprintByKey = {};

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

    function reasonLabelAr(code) {
        var labels = labelsApi();
        if (labels && typeof labels.reasonLabel === 'function') {
            try { return labels.reasonLabel(code || 'unknown_reason', 'ar'); } catch (_) {}
        }
        return code || 'unknown_reason';
    }

    function eventKey(event) {
        return [event.type || '', event.uid || '', event.reason_code || ''].join('|');
    }

    function fingerprint(event) {
        return [
            event.type || '',
            event.uid || '',
            event.status || '',
            event.reason_code || '',
            event.count == null ? '' : event.count
        ].join('|');
    }

    function record(event, opts) {
        opts = opts || {};
        event = obj(event);
        if (!event.type) return null;
        var normalized = Object.assign({}, event, {
            timestamp: event.timestamp || new Date().toISOString(),
            source: event.source || 'force-readiness-matrix'
        });
        if (normalized.reason_code && !normalized.reason_label_ar) {
            normalized.reason_label_ar = reasonLabelAr(normalized.reason_code);
        }
        var key = eventKey(normalized);
        var fp = event.fingerprint || fingerprint(normalized);
        if (!opts.force && lastFingerprintByKey[key] === fp) return null;
        lastFingerprintByKey[key] = fp;
        normalized.fingerprint = fp;
        events.push(normalized);
        var limit = Math.max(1, opts.limit || DEFAULT_LIMIT);
        if (events.length > limit) events = events.slice(events.length - limit);
        return normalized;
    }

    function clear() {
        events = [];
        lastFingerprintByKey = {};
    }

    function get() {
        return events.slice();
    }

    function observeMatrix(matrix, opts) {
        opts = opts || {};
        matrix = obj(matrix);
        var recorded = [];
        arr(matrix.rows).forEach(function (row) {
            row = obj(row);
            var type = row.final_status === 'Ready'
                ? 'unit_ready'
                : (row.final_status === 'Blocked' ? 'unit_blocked' : 'unit_unknown');
            var ev = record({
                type: type,
                uid: row.uid,
                unit_label: row.unit_label || row.uid,
                status: row.final_status || 'Unknown',
                reason_code: row.reason_code || null,
                target_uid: row.target_uid || null,
                weapon: row.weapon || null,
                unit: row.unit || null
            }, opts);
            if (ev) recorded.push(ev);
            if (row.reason_code === 'no_contact_evidence') {
                ev = record({
                    type: 'no_contact_evidence',
                    uid: row.uid,
                    unit_label: row.unit_label || row.uid,
                    status: row.final_status || 'Unknown',
                    reason_code: 'no_contact_evidence',
                    unit: row.unit || null
                }, opts);
                if (ev) recorded.push(ev);
            }
        });
        var top = arr(matrix.top_blockers)[0];
        if (top && top.code) {
            var topEv = record({
                type: 'top_blocker_changed',
                status: 'Force',
                reason_code: top.code,
                count: top.count,
                unit_label: 'Force',
                reason_label_ar: top.label_ar || reasonLabelAr(top.code)
            }, opts);
            if (topEv) recorded.push(topEv);
        }
        return recorded;
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
        var unit = event.unit_label || event.uid || 'Force';
        if (event.type === 'unit_ready') return 'Ready: ' + unit;
        if (event.type === 'unit_blocked') {
            return 'Blocked: ' + unit + ' - ' + (event.reason_code || 'unknown_reason') +
                (event.reason_code ? ' - ' + reasonLabelAr(event.reason_code) : '');
        }
        if (event.type === 'unit_unknown') {
            return 'Unknown: ' + unit + (event.reason_code ? ' - ' + event.reason_code : '');
        }
        if (event.type === 'no_contact_evidence') return 'No contact evidence: ' + unit;
        if (event.type === 'top_blocker_changed') {
            return 'Top blocker changed: ' + (event.reason_code || 'unknown_reason') + ' x ' + (event.count || 0) +
                ' - ' + (event.reason_label_ar || reasonLabelAr(event.reason_code));
        }
        if (event.type === 'blocking_reason_changed') {
            return 'Blocking reason changed: ' + unit + ' - ' + (event.reason_code || 'unknown_reason');
        }
        return (event.type || 'Force evidence') + ': ' + unit;
    }

    function row(event) {
        var cls = String(event.status || 'Unknown').toLowerCase();
        var uid = event.uid ? ' data-cmo-force-feed-uid="' + esc(event.uid) + '" tabindex="0" role="button"' : '';
        return '<div class="usp-force-feed-row ' + esc(cls) + '"' + uid + '>' +
            '<span class="usp-force-feed-time">' + esc(formatTime(event)) + '</span>' +
            '<span class="usp-force-feed-text">' + esc(eventSummary(event)) + '</span>' +
            '</div>';
    }

    function renderFeedHtml(opts) {
        opts = opts || {};
        var rows = get().slice(-(opts.limit || 7)).reverse();
        var html = '<div class="usp-force-feed-intro">Latest force evidence changes / آخر تغيرات أدلة القوة</div>';
        if (!rows.length) {
            return html + '<div class="usp-force-feed-empty">No force evidence changes recorded yet. / لا توجد تغيرات مسجلة بعد</div>';
        }
        return html + rows.map(row).join('');
    }

    function bindFeedInteractions(container, opts) {
        opts = opts || {};
        if (!container || !container.querySelectorAll) return false;
        Array.prototype.forEach.call(container.querySelectorAll('[data-cmo-force-feed-uid]'), function (el) {
            function select() {
                var uid = el.getAttribute('data-cmo-force-feed-uid');
                var event = get().filter(function (ev) { return ev.uid === uid; }).slice(-1)[0] || { uid: uid };
                if (opts.onSelectUnit && typeof opts.onSelectUnit === 'function') {
                    try { opts.onSelectUnit(event); } catch (_) {}
                }
            }
            el.addEventListener('click', select);
            el.addEventListener('keydown', function (ev) {
                if (ev && (ev.key === 'Enter' || ev.key === ' ')) {
                    if (ev.preventDefault) ev.preventDefault();
                    select();
                }
            });
        });
        return true;
    }

    var api = {
        CMO_FORCE_EVIDENCE_FEED_VERSION: CMO_FORCE_EVIDENCE_FEED_VERSION,
        record: record,
        observeMatrix: observeMatrix,
        get: get,
        clear: clear,
        renderFeedHtml: renderFeedHtml,
        bindFeedInteractions: bindFeedInteractions,
        eventSummary: eventSummary
    };

    root.RmoozCmoForceEvidenceFeed = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
