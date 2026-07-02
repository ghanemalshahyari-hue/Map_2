/* ============================================================================
 * scenario-evidence-handoff-acceptance.js - RMOOZ-QA-83..88 handoff acceptance
 * ----------------------------------------------------------------------------
 * Browser-local acceptance workflow for a received evidence handoff package.
 * Diffs the incoming package against the local review session, lets the
 * receiving operator Accept / Accept with Warnings / Reject, records the
 * decision in the review audit trail, and exports an acceptance receipt.
 * Accepting applies the package's review-session UI state only (via the
 * handoff-package importer); it never mutates scenario truth, world state,
 * doctrine, combat state, backend routes, or a database.
 * ========================================================================== */
(function (root) {
    'use strict';

    var SCENARIO_EVIDENCE_HANDOFF_ACCEPTANCE_VERSION = '1.0.0-rmooz-qa-83';
    var RECEIPT_TYPE = 'rmooz.scenarioEvidenceHandoffAcceptanceReceipt';
    var STORAGE_PREFIX = 'rmooz.scenarioEvidenceHandoffAcceptance.';
    var memoryStore = {};
    var pendingPayload = '';

    var DECISION_META = {
        accepted: {
            code: 'accepted',
            label_en: 'Accepted',
            label_ar: '&#1605;&#1602;&#1576;&#1608;&#1604;',
            cls: 'accepted'
        },
        accepted_with_warnings: {
            code: 'accepted_with_warnings',
            label_en: 'Accepted with Warnings',
            label_ar: '&#1605;&#1602;&#1576;&#1608;&#1604; &#1605;&#1593; &#1578;&#1581;&#1584;&#1610;&#1585;&#1575;&#1578;',
            cls: 'warnings'
        },
        rejected: {
            code: 'rejected',
            label_en: 'Rejected',
            label_ar: '&#1605;&#1585;&#1601;&#1608;&#1590;',
            cls: 'rejected'
        },
        pending: {
            code: 'pending',
            label_en: 'Pending Decision',
            label_ar: '&#1576;&#1575;&#1606;&#1578;&#1592;&#1575;&#1585; &#1575;&#1604;&#1602;&#1585;&#1575;&#1585;',
            cls: 'pending'
        }
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

    function packageApi() { return localApi('RmoozScenarioEvidenceHandoffPackage', 'scenario-evidence-handoff-package.js'); }
    function sessionApi() { return localApi('RmoozScenarioEvidenceReviewSession', 'scenario-evidence-review-session.js'); }
    function fixStatusApi() { return localApi('RmoozScenarioEvidenceFixStatus', 'scenario-evidence-fix-status.js'); }
    function auditApi() { return localApi('RmoozScenarioEvidenceReviewAuditTrail', 'scenario-evidence-review-audit-trail.js'); }
    function closeoutApi() { return localApi('RmoozScenarioEvidenceReviewCloseout', 'scenario-evidence-review-closeout.js'); }
    function reviewQueueApi() { return localApi('RmoozScenarioEvidenceReviewQueue', 'scenario-evidence-review-queue.js'); }

    function storage() {
        try {
            if (root.localStorage && typeof root.localStorage.getItem === 'function') return root.localStorage;
        } catch (_) {}
        return null;
    }

    function resolveWorldState(input) {
        if (typeof input === 'function') {
            try { return input(); } catch (_) { return null; }
        }
        return input || null;
    }

    function fingerprint(input, opts) {
        opts = opts || {};
        if (opts.fingerprint) return String(opts.fingerprint);
        if (typeof input === 'string') return input;
        var RS = sessionApi();
        if (RS && typeof RS.computeFingerprint === 'function') {
            // Pass providers/null through untouched: computeFingerprint resolves
            // functions itself and hashes a null world state to the same
            // empty-scenario fingerprint every other evidence module uses.
            try { return RS.computeFingerprint(input, opts); } catch (_) {}
        }
        return 'unknown';
    }

    function decisionMeta(code) {
        return DECISION_META[code] || DECISION_META.pending;
    }

    function normalizeDecision(code) {
        code = String(code || '').toLowerCase();
        if (code === 'accept' || code === 'accepted') return 'accepted';
        if (code === 'accept_with_warnings' || code === 'accepted_with_warnings' || code === 'warnings') return 'accepted_with_warnings';
        if (code === 'reject' || code === 'rejected') return 'rejected';
        return null;
    }

    // ── Decision persistence (browser-local, per scenario fingerprint) ──
    function key(fp) { return STORAGE_PREFIX + String(fp || 'unknown'); }

    function getDecision(worldStateOrFingerprint, opts) {
        var fp = fingerprint(worldStateOrFingerprint, opts);
        var raw = null;
        var s = storage();
        if (s) {
            try { raw = s.getItem(key(fp)); } catch (_) {}
        }
        if (!raw) raw = memoryStore[key(fp)] || null;
        if (!raw) return null;
        try {
            var parsed = JSON.parse(raw);
            parsed.read_only = true;
            return parsed;
        } catch (_) { return null; }
    }

    function saveDecision(fp, record) {
        var text = JSON.stringify(record);
        var s = storage();
        if (s) {
            try { s.setItem(key(fp), text); return record; } catch (_) {}
        }
        memoryStore[key(fp)] = text;
        return record;
    }

    function clearDecision(worldStateOrFingerprint, opts) {
        var fp = fingerprint(worldStateOrFingerprint, opts);
        var s = storage();
        if (s) {
            try { s.removeItem(key(fp)); } catch (_) {}
        }
        delete memoryStore[key(fp)];
        return null;
    }

    // ── QA-83: package diff against the local review session ────────────
    function localRecords(fp) {
        var FS = fixStatusApi();
        var meta = FS && typeof FS.getSessionMeta === 'function' ? FS.getSessionMeta() : null;
        if (meta && meta.scenario_fingerprint === fp) return arr(meta.records);
        var RS = sessionApi();
        if (RS && typeof RS.loadSession === 'function') return arr(RS.loadSession(fp).records);
        return [];
    }

    function recordKey(rec) {
        rec = obj(rec);
        return String(rec.issue_id || ((rec.uid || 'force') + '|' + (rec.reason || rec.code || 'unknown')));
    }

    function compactRecord(rec) {
        rec = obj(rec);
        return {
            issue_id: recordKey(rec),
            uid: rec.uid || null,
            label: rec.label || rec.uid || null,
            code: rec.code || rec.reason || 'unknown',
            status: rec.status || rec.manual_status || 'needs_review',
            note: rec.note || rec.manual_note || ''
        };
    }

    function buildPackageDiff(payload, worldStateOrFingerprint, opts) {
        opts = opts || {};
        var HP = packageApi();
        var validation = HP && typeof HP.validatePackage === 'function'
            ? HP.validatePackage(payload, worldStateOrFingerprint, opts)
            : { valid: false, warnings: ['Handoff package module unavailable'], read_only: true };
        var pkg = obj(validation.package);
        var currentFp = validation.current_scenario_fingerprint || fingerprint(worldStateOrFingerprint, opts);
        var warnings = arr(validation.warnings).slice();

        var pkgRecords = arr(pkg.manual_statuses).length
            ? arr(pkg.manual_statuses)
            : arr(obj(pkg.review_session).records);
        var localList = validation.valid ? localRecords(currentFp) : [];
        var localByKey = {};
        localList.forEach(function (rec) { localByKey[recordKey(rec)] = compactRecord(rec); });

        var added = [], changed = [], unchanged = [];
        pkgRecords.map(compactRecord).forEach(function (incoming) {
            var local = localByKey[incoming.issue_id];
            if (!local) { added.push(incoming); return; }
            local._matched = true;
            if (local.status !== incoming.status || local.note !== incoming.note) {
                changed.push({
                    issue_id: incoming.issue_id,
                    uid: incoming.uid || local.uid,
                    label: incoming.label || local.label,
                    code: incoming.code || local.code,
                    local_status: local.status,
                    package_status: incoming.status,
                    note_changed: local.note !== incoming.note
                });
            } else {
                unchanged.push(incoming);
            }
        });
        var localOnly = Object.keys(localByKey)
            .filter(function (k) { return !localByKey[k]._matched; })
            .map(function (k) { var rec = localByKey[k]; delete rec._matched; return rec; });

        var localCloseoutStatus = null;
        var CO = closeoutApi();
        var RQ = reviewQueueApi();
        if (validation.valid && opts.local_closeout) {
            localCloseoutStatus = obj(opts.local_closeout).status || null;
        } else if (validation.valid && CO && typeof CO.buildCloseout === 'function' && RQ && typeof RQ.buildReviewQueue === 'function') {
            try {
                var ws = resolveWorldState(worldStateOrFingerprint);
                if (ws && typeof ws === 'object') {
                    var queue = RQ.buildReviewQueue(ws, { generated_at: opts.generated_at });
                    localCloseoutStatus = obj(CO.buildCloseout(queue, { world_state: ws, generated_at: opts.generated_at })).status || null;
                }
            } catch (_) {}
        }
        var pkgCloseoutStatus = obj(pkg.closeout).status || null;

        var AU = auditApi();
        var localAuditEvents = validation.valid && AU && typeof AU.getTrail === 'function'
            ? arr(AU.getTrail(currentFp).events).length : 0;
        var pkgAuditEvents = arr(obj(pkg.audit_trail).events).length;

        if (changed.length) warnings.push('Package would overwrite ' + changed.length + ' local review status(es)');
        if (localOnly.length) warnings.push(localOnly.length + ' local review status(es) are not in the package');
        if (pkgCloseoutStatus && localCloseoutStatus && pkgCloseoutStatus !== localCloseoutStatus) {
            warnings.push('Package closeout status (' + pkgCloseoutStatus + ') differs from local closeout (' + localCloseoutStatus + ')');
        }

        return {
            version: SCENARIO_EVIDENCE_HANDOFF_ACCEPTANCE_VERSION,
            generated_at: opts.generated_at || new Date().toISOString(),
            valid: !!validation.valid,
            same_scenario: !!validation.fingerprint_match,
            fingerprint_match: !!validation.fingerprint_match,
            package_fingerprint: validation.package_fingerprint || 'unknown',
            current_scenario_fingerprint: currentFp,
            package_status: validation.status || null,
            package_status_label_en: validation.status_label_en || null,
            closeout: {
                package_status: pkgCloseoutStatus,
                local_status: localCloseoutStatus,
                changed: !!(pkgCloseoutStatus && localCloseoutStatus && pkgCloseoutStatus !== localCloseoutStatus)
            },
            added_statuses: added,
            changed_statuses: changed,
            local_only_statuses: localOnly,
            counts: {
                package_records: pkgRecords.length,
                local_records: localList.length,
                added: added.length,
                changed: changed.length,
                unchanged: unchanged.length,
                local_only: localOnly.length,
                package_audit_events: pkgAuditEvents,
                local_audit_events: localAuditEvents,
                audit_event_delta: pkgAuditEvents - localAuditEvents
            },
            package: pkg,
            warnings: warnings,
            read_only: true
        };
    }

    // ── QA-84/85: decision recommendation + operator decision ───────────
    function recommendDecision(diff) {
        diff = obj(diff);
        if (!diff.valid) {
            return { decision: 'rejected', reason: 'Package is invalid and cannot be accepted.' };
        }
        if (!diff.fingerprint_match) {
            return { decision: 'rejected', reason: 'Package fingerprint does not match the current scenario.' };
        }
        if (arr(diff.warnings).length) {
            return { decision: 'accepted_with_warnings', reason: 'Package matches this scenario but carries ' + arr(diff.warnings).length + ' warning(s).' };
        }
        return { decision: 'accepted', reason: 'Package matches this scenario with no conflicting review state.' };
    }

    function decide(payload, worldStateOrFingerprint, decisionCode, opts) {
        opts = opts || {};
        var decidedAt = opts.generated_at || new Date().toISOString();
        var diff = opts.diff || buildPackageDiff(payload, worldStateOrFingerprint, Object.assign({}, opts, { generated_at: decidedAt }));
        var decision = normalizeDecision(decisionCode);
        if (!decision) {
            return { applied: false, decision: null, error: 'Unknown acceptance decision: ' + decisionCode, diff: diff, read_only: true };
        }
        var forced = false;
        if (!diff.valid && decision !== 'rejected') {
            decision = 'rejected';
            forced = true;
        }
        var meta = decisionMeta(decision);
        var HP = packageApi();
        var importResult = null;
        if (decision !== 'rejected' && HP && typeof HP.importPackage === 'function') {
            importResult = HP.importPackage(payload, worldStateOrFingerprint, Object.assign({}, opts, { generated_at: decidedAt }));
        }
        var record = {
            version: SCENARIO_EVIDENCE_HANDOFF_ACCEPTANCE_VERSION,
            decision: decision,
            decision_label_en: meta.label_en,
            decision_label_ar: meta.label_ar,
            decided_at: decidedAt,
            forced_rejection: forced,
            package_fingerprint: diff.package_fingerprint,
            current_scenario_fingerprint: diff.current_scenario_fingerprint,
            fingerprint_match: !!diff.fingerprint_match,
            imported: !!(importResult && importResult.imported),
            operator_note: opts.operator_note || '',
            counts: obj(diff.counts),
            warnings: arr(diff.warnings),
            read_only: true
        };
        saveDecision(diff.current_scenario_fingerprint, record);
        // QA-87: fold the acceptance decision into the review audit trail.
        var AU = auditApi();
        if (AU && typeof AU.recordEvent === 'function') {
            try {
                AU.recordEvent(diff.current_scenario_fingerprint, 'handoff_acceptance_' + decision, {
                    package_fingerprint: diff.package_fingerprint,
                    fingerprint_match: !!diff.fingerprint_match,
                    imported: record.imported,
                    warning_count: arr(diff.warnings).length,
                    summary: 'Handoff package ' + meta.label_en.toLowerCase() +
                        (diff.fingerprint_match ? ' (fingerprint match)' : ' (fingerprint mismatch)')
                }, { timestamp: decidedAt });
            } catch (_) {}
        }
        pendingPayload = '';
        return {
            applied: true,
            decision: decision,
            decision_label_en: meta.label_en,
            decision_label_ar: meta.label_ar,
            forced_rejection: forced,
            imported: record.imported,
            import_result: importResult,
            record: record,
            receipt: buildReceipt(record, { generated_at: decidedAt }),
            diff: diff,
            read_only: true
        };
    }

    // ── QA-86: acceptance receipt ────────────────────────────────────────
    function buildReceipt(decisionRecord, opts) {
        opts = opts || {};
        decisionRecord = obj(decisionRecord.record || decisionRecord);
        var meta = decisionMeta(decisionRecord.decision);
        return {
            receipt_type: RECEIPT_TYPE,
            version: SCENARIO_EVIDENCE_HANDOFF_ACCEPTANCE_VERSION,
            generated_at: opts.generated_at || new Date().toISOString(),
            decision: decisionRecord.decision || 'pending',
            decision_label_en: decisionRecord.decision_label_en || meta.label_en,
            decision_label_ar: decisionRecord.decision_label_ar || meta.label_ar,
            decided_at: decisionRecord.decided_at || null,
            package_fingerprint: decisionRecord.package_fingerprint || 'unknown',
            current_scenario_fingerprint: decisionRecord.current_scenario_fingerprint || 'unknown',
            fingerprint_match: !!decisionRecord.fingerprint_match,
            imported: !!decisionRecord.imported,
            operator_note: decisionRecord.operator_note || '',
            counts: obj(decisionRecord.counts),
            warnings: arr(decisionRecord.warnings),
            source: 'Browser-local handoff acceptance decision',
            read_only: true
        };
    }

    function receiptSummary(receipt) {
        receipt = obj(receipt);
        var counts = obj(receipt.counts);
        var lines = [
            'Evidence Handoff Acceptance Receipt',
            '',
            'Decision: ' + (receipt.decision_label_en || receipt.decision || 'Pending Decision'),
            'Package fingerprint: ' + (receipt.package_fingerprint || 'unknown'),
            'Current scenario fingerprint: ' + (receipt.current_scenario_fingerprint || 'unknown'),
            'Fingerprint match: ' + (receipt.fingerprint_match ? 'yes' : 'no'),
            'Review state imported: ' + (receipt.imported ? 'yes' : 'no'),
            'Statuses added: ' + (counts.added || 0) + ' / changed: ' + (counts.changed || 0) + ' / unchanged: ' + (counts.unchanged || 0)
        ];
        if (receipt.operator_note) lines.push('Operator note: ' + receipt.operator_note);
        arr(receipt.warnings).forEach(function (warning) { lines.push('- ' + warning); });
        lines.push('');
        lines.push('Read-only acceptance receipt. The decision applies review-session UI state only.');
        lines.push('Decided: ' + (receipt.decided_at || 'unknown'));
        return lines.join('\n');
    }

    function toJson(receipt) { return JSON.stringify(receipt || {}, null, 2); }

    function copyText(text) {
        if (!root.navigator || !root.navigator.clipboard || typeof root.navigator.clipboard.writeText !== 'function') {
            return Promise.resolve(false);
        }
        return root.navigator.clipboard.writeText(String(text == null ? '' : text)).then(function () { return true; });
    }
    function copyReceipt(receipt) { return copyText(toJson(receipt)); }

    function downloadReceipt(receipt, filename) {
        if (!root.document || typeof root.Blob !== 'function' || !root.URL || typeof root.URL.createObjectURL !== 'function') return false;
        var blob = new root.Blob([toJson(receipt)], { type: 'application/json' });
        var url = root.URL.createObjectURL(blob);
        var a = root.document.createElement('a');
        a.href = url;
        a.download = filename || 'rmooz-evidence-acceptance-receipt.json';
        root.document.body.appendChild(a);
        a.click();
        root.document.body.removeChild(a);
        setTimeout(function () { root.URL.revokeObjectURL(url); }, 0);
        return true;
    }

    // ── Panel state + rendering ──────────────────────────────────────────
    function buildAcceptance(worldStateOrProvider, opts) {
        opts = opts || {};
        var fp = fingerprint(worldStateOrProvider, opts);
        var record = getDecision(fp);
        var meta = decisionMeta(record && record.decision);
        return {
            version: SCENARIO_EVIDENCE_HANDOFF_ACCEPTANCE_VERSION,
            generated_at: opts.generated_at || new Date().toISOString(),
            current_scenario_fingerprint: fp,
            decision: record ? record.decision : 'pending',
            decision_label_en: meta.label_en,
            decision_label_ar: meta.label_ar,
            decision_record: record,
            receipt: record ? buildReceipt(record, { generated_at: opts.generated_at }) : null,
            source: 'Incoming handoff package diff + operator acceptance decision',
            read_only: true
        };
    }

    function renderDiffHtml(diff) {
        diff = obj(diff);
        if (!diff.version) return '';
        var counts = obj(diff.counts);
        var rec = recommendDecision(diff);
        var recMeta = decisionMeta(rec.decision);
        var html = '<div class="usp-acceptance-diff usp-acceptance-diff--' + (diff.fingerprint_match ? 'match' : 'mismatch') + '">' +
            '<strong>Package diff</strong>' +
            '<dl>' +
                '<div><dt>Package fingerprint</dt><dd><code>' + esc(diff.package_fingerprint || 'unknown') + '</code></dd></div>' +
                '<div><dt>Current scenario fingerprint</dt><dd><code>' + esc(diff.current_scenario_fingerprint || 'unknown') + '</code></dd></div>' +
                '<div><dt>Same scenario</dt><dd>' + (diff.fingerprint_match ? 'yes' : 'no') + '</dd></div>' +
                '<div><dt>Statuses</dt><dd>' + esc(counts.added || 0) + ' added / ' + esc(counts.changed || 0) + ' changed / ' + esc(counts.unchanged || 0) + ' unchanged / ' + esc(counts.local_only || 0) + ' local-only</dd></div>' +
                '<div><dt>Closeout</dt><dd>' + esc(obj(diff.closeout).package_status || 'unknown') + ' (package) vs ' + esc(obj(diff.closeout).local_status || 'unknown') + ' (local)</dd></div>' +
                '<div><dt>Recommendation</dt><dd>' + esc(recMeta.label_en) + ' &mdash; ' + esc(rec.reason) + '</dd></div>' +
            '</dl>';
        var changed = arr(diff.changed_statuses).slice(0, 6);
        if (changed.length) {
            html += '<ul class="usp-acceptance-changes">';
            changed.forEach(function (change) {
                html += '<li>' + esc(change.uid || change.label || 'Review issue') + ' &mdash; ' + esc(change.code) +
                    ': ' + esc(change.local_status) + ' &rarr; ' + esc(change.package_status) +
                    (change.note_changed ? ' (note changed)' : '') + '</li>';
            });
            html += '</ul>';
        }
        if (arr(diff.warnings).length) {
            html += '<ul class="usp-acceptance-warnings">';
            arr(diff.warnings).forEach(function (warning) { html += '<li>' + esc(warning) + '</li>'; });
            html += '</ul>';
        }
        html += '</div>';
        return html;
    }

    function renderAcceptanceHtml(acceptance, opts) {
        opts = opts || {};
        acceptance = acceptance || buildAcceptance(null);
        var meta = decisionMeta(acceptance.decision);
        var record = obj(acceptance.decision_record);
        var html = '<div class="usp-acceptance-card usp-acceptance-card--' + esc(meta.cls) + '">' +
            '<div class="usp-acceptance-header">' +
                '<span>Handoff Acceptance</span>' +
                '<span dir="rtl">&#1602;&#1576;&#1608;&#1604; &#1581;&#1586;&#1605;&#1577; &#1575;&#1604;&#1578;&#1587;&#1604;&#1610;&#1605;</span>' +
                '<strong>' + esc(acceptance.decision_label_en || meta.label_en) + '</strong>' +
                '<small dir="rtl">' + (acceptance.decision_label_ar || meta.label_ar) + '</small>' +
            '</div>' +
            '<div class="usp-acceptance-meta">Current scenario fingerprint: <code>' + esc(acceptance.current_scenario_fingerprint || 'unknown') + '</code></div>';
        if (record.decided_at) {
            var counts = obj(record.counts);
            html += '<div class="usp-acceptance-counts">' +
                '<span>Decided: ' + esc(record.decided_at) + '</span>' +
                '<span>Imported: ' + (record.imported ? 'yes' : 'no') + '</span>' +
                '<span>Added: ' + esc(counts.added || 0) + ' / Changed: ' + esc(counts.changed || 0) + '</span>' +
                '<span>Fingerprint match: ' + (record.fingerprint_match ? 'yes' : 'no') + '</span>' +
            '</div>';
        }
        html += '<textarea data-acceptance-input rows="3" placeholder="Paste received handoff-package JSON to diff and decide">' + esc(pendingPayload) + '</textarea>' +
            '<div class="usp-acceptance-actions">' +
                '<button type="button" data-acceptance-action="diff">Preview Diff</button>' +
                '<button type="button" data-acceptance-action="accept">Accept</button>' +
                '<button type="button" data-acceptance-action="accept-warnings">Accept with Warnings</button>' +
                '<button type="button" data-acceptance-action="reject">Reject</button>' +
                '<button type="button" data-acceptance-action="copy-receipt"' + (acceptance.receipt ? '' : ' disabled') + '>Copy Receipt</button>' +
                '<button type="button" data-acceptance-action="download-receipt"' + (acceptance.receipt ? '' : ' disabled') + '>Download Receipt</button>' +
            '</div>' +
            renderDiffHtml(opts.diff) +
            '<div class="usp-acceptance-source">Source: ' + esc(acceptance.source || '') + '. Accepting restores review-session UI state only.</div>' +
            '</div>';
        return html;
    }

    function bindAcceptanceActions(container, acceptance, opts) {
        opts = opts || {};
        if (!container || !container.querySelectorAll) return false;
        acceptance = acceptance || buildAcceptance(opts.world_state || null, opts);
        function payloadFrom(el) {
            var text = el && el.value ? String(el.value) : '';
            if (text) pendingPayload = text;
            return text || pendingPayload;
        }
        Array.prototype.forEach.call(container.querySelectorAll('[data-acceptance-action]'), function (btn) {
            btn.addEventListener('click', function () {
                var action = btn.getAttribute('data-acceptance-action');
                var input = container.querySelector('[data-acceptance-input]');
                if (action === 'diff') {
                    var payload = payloadFrom(input);
                    if (!payload) return;
                    var diff = buildPackageDiff(payload, opts.world_state || opts.fingerprint || acceptance.current_scenario_fingerprint, opts);
                    if (opts.onDiff) opts.onDiff(diff);
                } else if (action === 'accept' || action === 'accept-warnings' || action === 'reject') {
                    var text = payloadFrom(input);
                    if (!text) return;
                    var decision = action === 'accept' ? 'accepted' : (action === 'reject' ? 'rejected' : 'accepted_with_warnings');
                    var result = decide(text, opts.world_state || opts.fingerprint || acceptance.current_scenario_fingerprint, decision, opts);
                    if (opts.onDecide) opts.onDecide(result);
                } else if (action === 'copy-receipt') {
                    if (acceptance.receipt) copyReceipt(acceptance.receipt);
                } else if (action === 'download-receipt') {
                    if (acceptance.receipt) downloadReceipt(acceptance.receipt);
                }
            });
        });
        return true;
    }

    var api = {
        SCENARIO_EVIDENCE_HANDOFF_ACCEPTANCE_VERSION: SCENARIO_EVIDENCE_HANDOFF_ACCEPTANCE_VERSION,
        RECEIPT_TYPE: RECEIPT_TYPE,
        STORAGE_PREFIX: STORAGE_PREFIX,
        DECISION_META: DECISION_META,
        buildPackageDiff: buildPackageDiff,
        recommendDecision: recommendDecision,
        decide: decide,
        getDecision: getDecision,
        clearDecision: clearDecision,
        buildReceipt: buildReceipt,
        receiptSummary: receiptSummary,
        toJson: toJson,
        copyReceipt: copyReceipt,
        downloadReceipt: downloadReceipt,
        buildAcceptance: buildAcceptance,
        renderDiffHtml: renderDiffHtml,
        renderAcceptanceHtml: renderAcceptanceHtml,
        bindAcceptanceActions: bindAcceptanceActions
    };

    root.RmoozScenarioEvidenceHandoffAcceptance = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
