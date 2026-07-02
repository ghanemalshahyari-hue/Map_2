/* ============================================================================
 * scenario-evidence-fix-status.js - RMOOZ-QA-45 manual evidence fix status
 * ----------------------------------------------------------------------------
 * Bounded review-status ledger for scenario evidence issues. By default this
 * is in memory; Batch 5 can attach browser-local review-session persistence.
 * This tracks operator review progress only. It never mutates world state,
 * scenario truth, doctrine, combat state, backend routes, or a database.
 * ========================================================================== */
(function (root) {
    'use strict';

    var SCENARIO_EVIDENCE_FIX_STATUS_VERSION = '1.0.0-rmooz-qa-45';
    var MAX_RECORDS = 250;

    var STATUS = {
        needs_review: {
            code: 'needs_review',
            label_en: 'Needs Review',
            label_ar: '&#1610;&#1581;&#1578;&#1575;&#1580; &#1605;&#1585;&#1575;&#1580;&#1593;&#1577;'
        },
        reviewed: {
            code: 'reviewed',
            label_en: 'Reviewed',
            label_ar: '&#1578;&#1605;&#1578; &#1575;&#1604;&#1605;&#1585;&#1575;&#1580;&#1593;&#1577;'
        },
        deferred: {
            code: 'deferred',
            label_en: 'Deferred',
            label_ar: '&#1605;&#1572;&#1580;&#1604;'
        },
        fixed_externally: {
            code: 'fixed_externally',
            label_en: 'Fixed Externally',
            label_ar: '&#1578;&#1605; &#1575;&#1604;&#1573;&#1589;&#1604;&#1575;&#1581; &#1582;&#1575;&#1585;&#1580;&#1610;&#1575;'
        }
    };
    var STATUS_ORDER = ['needs_review', 'reviewed', 'deferred', 'fixed_externally'];
    var records = {};
    var order = [];
    var currentFingerprint = null;
    var currentSessionMeta = null;

    function obj(v) { return v && typeof v === 'object' ? v : {}; }
    function arr(v) { return Array.isArray(v) ? v : []; }
    function localApi(globalName, moduleName) {
        if (root[globalName]) return root[globalName];
        if (typeof require === 'function') {
            try { return require('./' + moduleName); } catch (_) {}
        }
        return null;
    }
    function sessionApi() {
        return localApi('RmoozScenarioEvidenceReviewSession', 'scenario-evidence-review-session.js');
    }

    function normalizeStatus(status) {
        var s = String(status || 'needs_review').trim();
        return STATUS[s] ? s : 'needs_review';
    }

    function issueId(issue) {
        issue = obj(issue);
        return String(issue.issue_id || issue.id || ((issue.uid || 'force') + '|' + (issue.reason || issue.code || 'unknown'))).trim();
    }

    function normalizeIssue(issue) {
        issue = obj(issue);
        var code = issue.code || issue.reason || 'unknown';
        return {
            issue_id: issueId(issue),
            uid: issue.uid || null,
            label: issue.label || issue.unit_label || issue.uid || null,
            side: issue.side || null,
            code: code,
            reason: code,
            reason_label_ar: issue.reason_label_ar || null,
            priority: issue.priority || null,
            priority_label_en: issue.priority_label_en || null,
            priority_label_ar: issue.priority_label_ar || null,
            group: issue.group || null
        };
    }

    function touch(id) {
        var idx = order.indexOf(id);
        if (idx >= 0) order.splice(idx, 1);
        order.push(id);
        while (order.length > MAX_RECORDS) {
            var old = order.shift();
            delete records[old];
        }
    }

    function defaultRecord(issue) {
        var normalized = normalizeIssue(issue);
        return {
            issue_id: normalized.issue_id,
            uid: normalized.uid,
            label: normalized.label,
            side: normalized.side,
            code: normalized.code,
            status: 'needs_review',
            note: '',
            timestamp: null
        };
    }

    function getStatus(issue) {
        var id = issueId(issue);
        return records[id] ? Object.assign({}, records[id]) : defaultRecord(issue);
    }

    function importRecords(list, opts) {
        opts = opts || {};
        if (opts.replace !== false) {
            records = {};
            order = [];
        }
        arr(list).forEach(function (rec) {
            rec = obj(rec);
            var issue = normalizeIssue(rec);
            var out = Object.assign(defaultRecord(issue), rec, {
                issue_id: issue.issue_id,
                uid: issue.uid,
                label: issue.label,
                side: issue.side,
                code: rec.code || rec.reason || issue.code,
                status: normalizeStatus(rec.status || rec.manual_status),
                note: rec.note || rec.manual_note || '',
                timestamp: rec.timestamp || rec.manual_timestamp || null
            });
            records[out.issue_id] = out;
            touch(out.issue_id);
        });
        return all();
    }

    function persist(opts) {
        opts = opts || {};
        if (!currentFingerprint) return null;
        var RS = sessionApi();
        if (!RS || typeof RS.saveRecords !== 'function') return null;
        currentSessionMeta = RS.saveRecords(currentFingerprint, all(), opts);
        return currentSessionMeta;
    }

    function setScenarioContext(worldStateOrFingerprint, opts) {
        opts = opts || {};
        var RS = sessionApi();
        if (!RS || typeof RS.computeFingerprint !== 'function') return null;
        var fp = RS.computeFingerprint(worldStateOrFingerprint, opts);
        currentFingerprint = fp;
        var session = RS.loadSession(fp);
        currentSessionMeta = session;
        importRecords(session.records, { replace: true });
        return session;
    }

    function getSessionMeta() {
        return currentSessionMeta ? Object.assign({}, currentSessionMeta) : null;
    }

    function setStatus(issue, status, note, opts) {
        opts = opts || {};
        var normalized = normalizeIssue(issue);
        var rec = Object.assign(defaultRecord(normalized), records[normalized.issue_id] || {});
        rec.uid = normalized.uid;
        rec.label = normalized.label;
        rec.side = normalized.side;
        rec.code = normalized.code;
        rec.status = normalizeStatus(status);
        if (note != null) rec.note = String(note);
        rec.timestamp = opts.timestamp || new Date().toISOString();
        records[normalized.issue_id] = rec;
        touch(normalized.issue_id);
        persist({ generated_at: rec.timestamp });
        return Object.assign({}, rec);
    }

    function reset() {
        records = {};
        order = [];
        if (currentFingerprint) {
            var RS = sessionApi();
            if (RS && typeof RS.clearSession === 'function') currentSessionMeta = RS.clearSession(currentFingerprint);
        }
    }

    function all() {
        return order.map(function (id) { return Object.assign({}, records[id]); }).filter(Boolean);
    }

    function label(status, lang) {
        var meta = STATUS[normalizeStatus(status)];
        return String(lang || '').toLowerCase().indexOf('ar') === 0 ? meta.label_ar : meta.label_en;
    }

    function enrichIssue(issue) {
        var out = Object.assign({}, normalizeIssue(issue));
        var rec = getStatus(out);
        out.manual_status = rec.status;
        out.manual_status_label_en = label(rec.status, 'en');
        out.manual_status_label_ar = label(rec.status, 'ar');
        out.manual_note = rec.note || '';
        out.manual_timestamp = rec.timestamp || null;
        return out;
    }

    function summarize(queueOrIssues) {
        var issues = arr(queueOrIssues);
        if (!issues.length && queueOrIssues && queueOrIssues.groups) {
            arr(queueOrIssues.groups).forEach(function (group) {
                arr(group.issues).forEach(function (issue) { issues.push(issue); });
            });
        }
        var counts = { total: issues.length, needs_review: 0, reviewed: 0, deferred: 0, fixed_externally: 0 };
        issues.forEach(function (issue) {
            var rec = getStatus(issue);
            counts[normalizeStatus(rec.status)]++;
        });
        return {
            version: SCENARIO_EVIDENCE_FIX_STATUS_VERSION,
            counts: counts,
            records: issues.map(enrichIssue),
            stored_records: all(),
            session: getSessionMeta(),
            source: 'Client-side manual evidence review status'
        };
    }

    function exportStatus(queueOrIssues) {
        return {
            version: SCENARIO_EVIDENCE_FIX_STATUS_VERSION,
            generated_at: new Date().toISOString(),
            summary: summarize(queueOrIssues),
            read_only: true
        };
    }

    var api = {
        SCENARIO_EVIDENCE_FIX_STATUS_VERSION: SCENARIO_EVIDENCE_FIX_STATUS_VERSION,
        STATUS: STATUS,
        STATUS_ORDER: STATUS_ORDER,
        issueId: issueId,
        normalizeIssue: normalizeIssue,
        getStatus: getStatus,
        setStatus: setStatus,
        setScenarioContext: setScenarioContext,
        getSessionMeta: getSessionMeta,
        importRecords: importRecords,
        persist: persist,
        enrichIssue: enrichIssue,
        summarize: summarize,
        exportStatus: exportStatus,
        label: label,
        all: all,
        reset: reset
    };

    root.RmoozScenarioEvidenceFixStatus = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
