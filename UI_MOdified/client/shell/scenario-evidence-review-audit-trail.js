/* ============================================================================
 * scenario-evidence-review-audit-trail.js - RMOOZ-QA-67..73 audit trail
 * ----------------------------------------------------------------------------
 * Browser-local history for scenario evidence review activity. Records review
 * status changes, note changes, session import/export/reset activity, and
 * closeout status transitions. It never mutates scenario/world-state truth,
 * doctrine, combat state, backend routes, or a database.
 * ========================================================================== */
(function (root) {
    'use strict';

    var SCENARIO_EVIDENCE_REVIEW_AUDIT_TRAIL_VERSION = '1.0.0-rmooz-qa-67';
    var STORAGE_PREFIX = 'rmooz.scenarioEvidenceReviewAudit.';
    var MAX_EVENTS = 250;
    var memoryStore = {};

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

    function sessionApi() { return localApi('RmoozScenarioEvidenceReviewSession', 'scenario-evidence-review-session.js'); }

    function storage() {
        try {
            if (root.localStorage && typeof root.localStorage.getItem === 'function') return root.localStorage;
        } catch (_) {}
        return null;
    }

    function fingerprint(input, opts) {
        opts = opts || {};
        if (opts.fingerprint) return String(opts.fingerprint);
        if (typeof input === 'string') return input;
        var RS = sessionApi();
        if (RS && typeof RS.computeFingerprint === 'function') {
            try { return RS.computeFingerprint(input || 'unknown', opts); } catch (_) {}
        }
        return 'unknown';
    }

    function key(fp) { return STORAGE_PREFIX + String(fp || 'unknown'); }

    function readTrail(fp) {
        var raw = null;
        var s = storage();
        if (s) {
            try { raw = s.getItem(key(fp)); } catch (_) {}
        }
        if (!raw) raw = memoryStore[key(fp)] || null;
        if (!raw) return { version: SCENARIO_EVIDENCE_REVIEW_AUDIT_TRAIL_VERSION, scenario_fingerprint: fp, events: [], last_closeout_status: null, read_only: true };
        try {
            var parsed = JSON.parse(raw);
            parsed.events = arr(parsed.events);
            parsed.scenario_fingerprint = parsed.scenario_fingerprint || fp;
            parsed.read_only = true;
            return parsed;
        } catch (_) {
            return { version: SCENARIO_EVIDENCE_REVIEW_AUDIT_TRAIL_VERSION, scenario_fingerprint: fp, events: [], last_closeout_status: null, read_only: true };
        }
    }

    function writeTrail(fp, trail) {
        trail = Object.assign({ version: SCENARIO_EVIDENCE_REVIEW_AUDIT_TRAIL_VERSION, scenario_fingerprint: fp, events: [], read_only: true }, obj(trail));
        trail.events = arr(trail.events).slice(-MAX_EVENTS);
        trail.updated_at = trail.updated_at || new Date().toISOString();
        var text = JSON.stringify(trail);
        var s = storage();
        if (s) {
            try { s.setItem(key(fp), text); return trail; } catch (_) {}
        }
        memoryStore[key(fp)] = text;
        return trail;
    }

    function eventSummary(event) {
        event = obj(event);
        var unit = event.uid || event.label || 'Review session';
        var code = event.code ? ' - ' + event.code : '';
        if (event.type === 'status_changed') return unit + code + ' - ' + (event.old_status || 'unknown') + ' -> ' + (event.new_status || 'unknown');
        if (event.type === 'note_updated') return unit + code + ' - note updated';
        if (event.type === 'session_imported') return 'Review session imported';
        if (event.type === 'session_exported') return 'Review session exported';
        if (event.type === 'session_reset') return 'Review session reset';
        if (event.type === 'closeout_status_changed') return 'Closeout status changed: ' + (event.old_status || 'unknown') + ' -> ' + (event.new_status || 'unknown');
        if (event.type === 'release_ready') return 'Release ready';
        if (event.type === 'release_ready_with_warnings') return 'Release ready with warnings';
        if (event.type === 'release_not_ready') return 'Release not ready' + (event.blocker_count ? ' - ' + event.blocker_count + ' blocker(s)' : '');
        if (event.type === 'release_incomplete') return 'Release incomplete';
        if (event.type === 'release_blockers_changed') return 'Release blockers changed' + (event.blocker_count != null ? ' - ' + event.blocker_count + ' blocker(s)' : '');
        if (event.type === 'release_certificate_exported') return 'Release certificate exported';
        if (event.type === 'release_json_exported') return 'Release JSON exported';
        return event.type || 'review_event';
    }

    function recordEvent(worldStateOrFingerprint, type, payload, opts) {
        opts = opts || {};
        var fp = fingerprint(worldStateOrFingerprint, opts);
        var trail = readTrail(fp);
        var event = Object.assign({}, obj(payload), {
            event_id: opts.event_id || (String(Date.now()) + '-' + Math.random().toString(16).slice(2, 8)),
            timestamp: opts.timestamp || new Date().toISOString(),
            type: type || obj(payload).type || 'review_event',
            scenario_fingerprint: fp,
            source: opts.source || obj(payload).source || 'Scenario evidence review audit trail',
            read_only: true
        });
        event.summary = event.summary || eventSummary(event);
        trail.events.push(event);
        trail.updated_at = event.timestamp;
        return writeTrail(fp, trail);
    }

    function recordStatusChange(issue, before, after, opts) {
        issue = obj(issue);
        before = obj(before);
        after = obj(after);
        opts = opts || {};
        var changedStatus = before.status !== after.status;
        var changedNote = String(before.note || '') !== String(after.note || '');
        if (!changedStatus && !changedNote) return null;
        return recordEvent(opts.fingerprint || opts.world_state || 'unknown', changedStatus ? 'status_changed' : 'note_updated', {
            issue_id: after.issue_id || before.issue_id || issue.issue_id || ((issue.uid || 'force') + '|' + (issue.reason || issue.code || after.code || 'unknown')),
            uid: after.uid || issue.uid || null,
            label: after.label || issue.label || issue.uid || null,
            code: after.code || issue.reason || issue.code || 'unknown',
            old_status: before.status || 'needs_review',
            new_status: after.status || 'needs_review',
            old_note: before.note || '',
            new_note: after.note || '',
            summary: changedStatus
                ? ((after.uid || issue.uid || after.label || 'Review issue') + ' - ' + (after.code || issue.reason || issue.code || 'unknown') + ' - ' + (before.status || 'needs_review') + ' -> ' + (after.status || 'needs_review'))
                : ((after.uid || issue.uid || after.label || 'Review issue') + ' - ' + (after.code || issue.reason || issue.code || 'unknown') + ' - note updated')
        }, opts);
    }

    function recordSessionEvent(type, session, opts) {
        session = obj(session);
        opts = opts || {};
        return recordEvent(session.scenario_fingerprint || opts.fingerprint || 'unknown', type, {
            session_fingerprint: session.scenario_fingerprint || null,
            original_scenario_fingerprint: session.original_scenario_fingerprint || null,
            stale: !!session.stale,
            record_count: arr(session.records).length
        }, opts);
    }

    function observeCloseout(closeout, opts) {
        closeout = obj(closeout);
        opts = opts || {};
        var session = obj(closeout.session);
        var fp = session.scenario_fingerprint || opts.fingerprint || 'unknown';
        var trail = readTrail(fp);
        var oldStatus = trail.last_closeout_status || null;
        var newStatus = closeout.status || 'incomplete';
        trail.last_closeout_status = newStatus;
        writeTrail(fp, trail);
        if (oldStatus && oldStatus !== newStatus) {
            return recordEvent(fp, 'closeout_status_changed', {
                old_status: oldStatus,
                new_status: newStatus,
                blocker_count: arr(closeout.blockers).length
            }, opts);
        }
        return trail;
    }

    function getTrail(worldStateOrFingerprint, opts) {
        var fp = fingerprint(worldStateOrFingerprint, opts);
        return readTrail(fp);
    }

    function clearTrail(worldStateOrFingerprint, opts) {
        var fp = fingerprint(worldStateOrFingerprint, opts);
        var s = storage();
        if (s) {
            try { s.removeItem(key(fp)); } catch (_) {}
        }
        delete memoryStore[key(fp)];
        return readTrail(fp);
    }

    function exportTrail(worldStateOrFingerprint, opts) {
        opts = opts || {};
        var fp = fingerprint(worldStateOrFingerprint, opts);
        var trail = readTrail(fp);
        return {
            version: SCENARIO_EVIDENCE_REVIEW_AUDIT_TRAIL_VERSION,
            exported_at: opts.generated_at || new Date().toISOString(),
            scenario_fingerprint: fp,
            events: arr(trail.events),
            last_activity: arr(trail.events).length ? arr(trail.events)[arr(trail.events).length - 1] : null,
            read_only: true
        };
    }

    function renderAuditTrailHtml(trail, opts) {
        opts = opts || {};
        trail = trail || getTrail(opts.fingerprint || 'unknown');
        var events = arr(trail.events).slice(-(opts.limit || 8)).reverse();
        var html = '<div class="usp-audit-card">' +
            '<div class="usp-audit-header">' +
                '<span>Evidence Review Audit Trail</span>' +
                '<span dir="rtl">&#1587;&#1580;&#1604; &#1605;&#1585;&#1575;&#1580;&#1593;&#1577; &#1575;&#1604;&#1571;&#1583;&#1604;&#1577;</span>' +
            '</div>' +
            '<div class="usp-audit-meta">Latest activity: ' + esc(events.length) + ' event' + (events.length === 1 ? '' : 's') + '</div>';
        if (!events.length) {
            html += '<div class="usp-audit-empty">No review activity recorded yet.</div>';
        } else {
            html += '<ul class="usp-audit-list">';
            events.forEach(function (event) {
                html += '<li><span>' + esc(event.timestamp || '') + '</span><strong>' + esc(event.summary || eventSummary(event)) + '</strong></li>';
            });
            html += '</ul>';
        }
        html += '<div class="usp-audit-source">Browser-local review history only. Does not modify scenario truth.</div></div>';
        return html;
    }

    var api = {
        SCENARIO_EVIDENCE_REVIEW_AUDIT_TRAIL_VERSION: SCENARIO_EVIDENCE_REVIEW_AUDIT_TRAIL_VERSION,
        STORAGE_PREFIX: STORAGE_PREFIX,
        recordEvent: recordEvent,
        recordStatusChange: recordStatusChange,
        recordSessionEvent: recordSessionEvent,
        observeCloseout: observeCloseout,
        getTrail: getTrail,
        clearTrail: clearTrail,
        exportTrail: exportTrail,
        renderAuditTrailHtml: renderAuditTrailHtml
    };

    root.RmoozScenarioEvidenceReviewAuditTrail = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
