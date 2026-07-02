/* ============================================================================
 * scenario-evidence-release-audit.js - RMOOZ-QA-101/102 release decision audit
 * ----------------------------------------------------------------------------
 * Browser-local audit + receipt history for the Evidence Release Gate. Observes
 * the release-gate verdict and logs status transitions, blocker changes, and
 * certificate/JSON exports into the existing Evidence Review Audit Trail, and
 * keeps a small local history of release-decision receipts. It never mutates
 * scenario/world-state truth, doctrine, combat state, backend routes, or a
 * database — it only reads the release gate and appends to the browser-local
 * audit trail.
 * ========================================================================== */
(function (root) {
    'use strict';

    var SCENARIO_EVIDENCE_RELEASE_AUDIT_VERSION = '1.0.0-rmooz-qa-101';
    var STORAGE_PREFIX = 'rmooz.scenarioEvidenceReleaseAudit.';
    var MAX_HISTORY = 50;
    var memoryStore = {};

    var STATUS_EVENT = {
        ready_for_release:   { type: 'release_ready',                label: 'Release ready' },
        ready_with_warnings: { type: 'release_ready_with_warnings',  label: 'Release ready with warnings' },
        not_ready:           { type: 'release_not_ready',            label: 'Release not ready' },
        incomplete:          { type: 'release_incomplete',           label: 'Release incomplete' }
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

    function auditApi()   { return localApi('RmoozScenarioEvidenceReviewAuditTrail', 'scenario-evidence-review-audit-trail.js'); }
    function sessionApi() { return localApi('RmoozScenarioEvidenceReviewSession',    'scenario-evidence-review-session.js'); }

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
            try { return RS.computeFingerprint(input, opts); } catch (_) {}
        }
        return 'unknown';
    }

    function key(fp) { return STORAGE_PREFIX + String(fp || 'unknown'); }

    function readState(fp) {
        var raw = null;
        var s = storage();
        if (s) { try { raw = s.getItem(key(fp)); } catch (_) {} }
        if (!raw) raw = memoryStore[key(fp)] || null;
        if (!raw) return { scenario_fingerprint: fp, last_status: null, last_blockers_key: null, latest: null, history: [] };
        try {
            var parsed = JSON.parse(raw);
            parsed.history = arr(parsed.history);
            parsed.scenario_fingerprint = parsed.scenario_fingerprint || fp;
            return parsed;
        } catch (_) {
            return { scenario_fingerprint: fp, last_status: null, last_blockers_key: null, latest: null, history: [] };
        }
    }

    function writeState(fp, state) {
        state.history = arr(state.history).slice(-MAX_HISTORY);
        var text = JSON.stringify(state);
        var s = storage();
        if (s) { try { s.setItem(key(fp), text); return state; } catch (_) {} }
        memoryStore[key(fp)] = text;
        return state;
    }

    function blockersKey(gate) {
        return arr(obj(gate).blockers).map(function (b) { return obj(b).code; }).sort().join(',');
    }

    function primaryReason(gate) {
        gate = obj(gate);
        if (gate.status === 'ready_for_release') return 'all release checks passed';
        if (gate.status === 'ready_with_warnings') {
            var w = arr(gate.warnings)[0];
            return w ? w.label : 'released with warnings';
        }
        if (gate.status === 'incomplete') return 'evidence review incomplete';
        var b = arr(gate.blockers)[0];
        return b ? b.label : 'not ready for release';
    }

    function buildReceipt(gate, opts) {
        opts = opts || {};
        gate = obj(gate);
        var meta = STATUS_EVENT[gate.status] || STATUS_EVENT.incomplete;
        return {
            version: SCENARIO_EVIDENCE_RELEASE_AUDIT_VERSION,
            decision: gate.status || 'incomplete',
            decision_label_en: gate.status_label_en || meta.label,
            decision_label_ar: gate.status_label_ar || null,
            releasable: !!gate.releasable,
            reason: primaryReason(gate),
            blocker_count: arr(gate.blockers).length,
            blockers: arr(gate.blockers).map(function (b) { return { code: obj(b).code, label: obj(b).label }; }),
            scenario_fingerprint: gate.scenario_fingerprint || opts.fingerprint || 'unknown',
            timestamp: opts.timestamp || new Date().toISOString(),
            exported: false,
            read_only: true
        };
    }

    function recordAudit(fp, type, payload, ts) {
        var AU = auditApi();
        if (AU && typeof AU.recordEvent === 'function') {
            try { AU.recordEvent(fp, type, payload, { timestamp: ts }); } catch (_) {}
        }
    }

    function pushHistory(state, receipt) {
        state.history = arr(state.history);
        state.history.push(receipt);
        state.latest = receipt;
    }

    // QA-101: observe status/blocker transitions and log audit events. Logs only
    // on change (like the closeout observer) so repeated renders don't flood.
    function observeRelease(gate, opts) {
        opts = opts || {};
        gate = obj(gate);
        var fp = gate.scenario_fingerprint || fingerprint(opts.world_state, opts);
        var state = readState(fp);
        var ts = opts.timestamp || new Date().toISOString();
        var meta = STATUS_EVENT[gate.status] || STATUS_EVENT.incomplete;
        var bk = blockersKey(gate);
        var receipt = buildReceipt(gate, { timestamp: ts, fingerprint: fp });
        var changed = false;

        if (state.last_status !== gate.status) {
            recordAudit(fp, meta.type, {
                release_status: gate.status,
                releasable: !!gate.releasable,
                blocker_count: receipt.blocker_count,
                summary: meta.label + (receipt.blocker_count ? ' — ' + receipt.blocker_count + ' blocker(s)' : '')
            }, ts);
            state.last_status = gate.status;
            state.last_blockers_key = bk;
            pushHistory(state, receipt);
            changed = true;
        } else if (state.last_blockers_key !== bk) {
            recordAudit(fp, 'release_blockers_changed', {
                release_status: gate.status,
                blocker_count: receipt.blocker_count,
                summary: 'Release blockers changed — ' + receipt.blocker_count + ' blocker(s)'
            }, ts);
            state.last_blockers_key = bk;
            pushHistory(state, receipt);
            changed = true;
        }
        if (changed) writeState(fp, state);
        return state.latest || receipt;
    }

    // QA-101: log an explicit certificate / JSON export action.
    function recordExport(kind, gate, opts) {
        opts = opts || {};
        gate = obj(gate);
        var fp = gate.scenario_fingerprint || fingerprint(opts.world_state, opts);
        var ts = opts.timestamp || new Date().toISOString();
        var type = kind === 'certificate' ? 'release_certificate_exported' : 'release_json_exported';
        var label = kind === 'certificate' ? 'Release certificate exported' : 'Release JSON exported';
        recordAudit(fp, type, {
            release_status: gate.status,
            summary: label + ' (' + (gate.status_label_en || gate.status || 'unknown') + ')'
        }, ts);
        var state = readState(fp);
        if (state.latest) {
            state.latest.exported = true;
            state.latest.exported_at = ts;
            state.latest.export_kind = kind;
            writeState(fp, state);
        }
        return true;
    }

    function getLatest(worldStateOrFingerprint, opts) {
        return readState(fingerprint(worldStateOrFingerprint, opts)).latest || null;
    }
    function getHistory(worldStateOrFingerprint, opts) {
        return arr(readState(fingerprint(worldStateOrFingerprint, opts)).history);
    }
    function clear(worldStateOrFingerprint, opts) {
        var fp = fingerprint(worldStateOrFingerprint, opts);
        var s = storage();
        if (s) { try { s.removeItem(key(fp)); } catch (_) {} }
        delete memoryStore[key(fp)];
        return null;
    }

    function exportState(worldStateOrFingerprint, opts) {
        opts = opts || {};
        var fp = fingerprint(worldStateOrFingerprint, opts);
        var state = readState(fp);
        return {
            version: SCENARIO_EVIDENCE_RELEASE_AUDIT_VERSION,
            exported_at: opts.generated_at || new Date().toISOString(),
            scenario_fingerprint: fp,
            latest: state.latest || null,
            history: arr(state.history),
            read_only: true
        };
    }

    function historySummary(worldStateOrFingerprint, opts) {
        var data = exportState(worldStateOrFingerprint, opts);
        var lines = ['Release Decision History', '', 'Scenario fingerprint: ' + (data.scenario_fingerprint || 'unknown'), ''];
        if (data.latest) {
            lines.push('Latest: ' + (data.latest.decision_label_en || data.latest.decision) +
                ' — ' + (data.latest.reason || '') + ' (' + (data.latest.timestamp || 'unknown') + ')');
            lines.push('');
        }
        lines.push('History (' + data.history.length + '):');
        if (!data.history.length) lines.push('  - None recorded');
        else data.history.slice(-12).forEach(function (r) {
            lines.push('  - ' + (r.timestamp || 'unknown') + ' — ' + (r.decision_label_en || r.decision) +
                ' (' + r.blocker_count + ' blocker(s))' + (r.exported ? ' [exported]' : ''));
        });
        return lines.join('\n');
    }

    function toJson(worldStateOrFingerprint, opts) { return JSON.stringify(exportState(worldStateOrFingerprint, opts), null, 2); }

    function copyText(text) {
        if (!root.navigator || !root.navigator.clipboard || typeof root.navigator.clipboard.writeText !== 'function') {
            return Promise.resolve(false);
        }
        return root.navigator.clipboard.writeText(String(text == null ? '' : text)).then(function () { return true; });
    }
    function copyHistory(worldStateOrFingerprint, opts) { return copyText(historySummary(worldStateOrFingerprint, opts)); }

    // QA-102: render the latest release decision + a short history tail.
    function renderLatestHtml(latestOrFingerprint, opts) {
        opts = opts || {};
        var receipt = latestOrFingerprint && typeof latestOrFingerprint === 'object' && latestOrFingerprint.decision
            ? latestOrFingerprint
            : getLatest(latestOrFingerprint, opts);
        if (!receipt) {
            return '<div class="usp-release-history usp-release-history--empty">' +
                '<span>Latest Release Decision</span>' +
                '<p>No release decision recorded yet.</p></div>';
        }
        var cls = receipt.releasable ? 'ok' : (receipt.decision === 'incomplete' ? 'incomplete' : 'blocked');
        var html = '<div class="usp-release-history usp-release-history--' + esc(cls) + '">' +
            '<span>Latest Release Decision</span>' +
            '<dl>' +
                '<div><dt>Decision</dt><dd>' + esc(receipt.decision_label_en || receipt.decision) +
                    (receipt.decision_label_ar ? ' <span dir="rtl">' + receipt.decision_label_ar + '</span>' : '') + '</dd></div>' +
                '<div><dt>Reason</dt><dd>' + esc(receipt.reason || '') + '</dd></div>' +
                '<div><dt>Timestamp</dt><dd>' + esc(receipt.timestamp || 'unknown') + '</dd></div>' +
                '<div><dt>Fingerprint</dt><dd><code>' + esc(receipt.scenario_fingerprint || 'unknown') + '</code></dd></div>' +
            '</dl>' +
            '<button type="button" data-release-audit-action="copy-history">Copy Release History</button>' +
            '</div>';
        return html;
    }

    function bindLatestActions(container, worldStateOrFingerprint, opts) {
        if (!container || !container.querySelectorAll) return false;
        Array.prototype.forEach.call(container.querySelectorAll('[data-release-audit-action]'), function (btn) {
            btn.addEventListener('click', function () {
                if (btn.getAttribute('data-release-audit-action') === 'copy-history') copyHistory(worldStateOrFingerprint, opts);
            });
        });
        return true;
    }

    var api = {
        SCENARIO_EVIDENCE_RELEASE_AUDIT_VERSION: SCENARIO_EVIDENCE_RELEASE_AUDIT_VERSION,
        STORAGE_PREFIX: STORAGE_PREFIX,
        STATUS_EVENT: STATUS_EVENT,
        observeRelease: observeRelease,
        recordExport: recordExport,
        buildReceipt: buildReceipt,
        getLatest: getLatest,
        getHistory: getHistory,
        clear: clear,
        exportState: exportState,
        historySummary: historySummary,
        toJson: toJson,
        copyHistory: copyHistory,
        renderLatestHtml: renderLatestHtml,
        bindLatestActions: bindLatestActions
    };

    root.RmoozScenarioEvidenceReleaseAudit = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
