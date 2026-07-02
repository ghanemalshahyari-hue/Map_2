/* ============================================================================
 * scenario-evidence-release-gate.js - RMOOZ-QA-92..100 evidence release gate
 * ----------------------------------------------------------------------------
 * Read-only release-decision layer. Synthesizes the review closeout, the
 * handoff acceptance decision, and the scenario fingerprint into a single
 * deterministic "can this evidence package be released?" verdict, lists the
 * blockers, and exports a release certificate (JSON/text). It never mutates
 * scenario/world-state truth, doctrine, combat state, backend routes, or a
 * database — it only reads other browser-local evidence layers.
 * ========================================================================== */
(function (root) {
    'use strict';

    var SCENARIO_EVIDENCE_RELEASE_GATE_VERSION = '1.0.0-rmooz-qa-92';
    var CERTIFICATE_TYPE = 'rmooz.scenarioEvidenceReleaseCertificate';

    var STATUS_META = {
        ready_for_release: {
            code: 'ready_for_release',
            label_en: 'Ready for Release',
            label_ar: '&#1580;&#1575;&#1607;&#1586; &#1604;&#1604;&#1575;&#1593;&#1578;&#1605;&#1575;&#1583;',
            cls: 'ready'
        },
        ready_with_warnings: {
            code: 'ready_with_warnings',
            label_en: 'Ready with Warnings',
            label_ar: '&#1580;&#1575;&#1607;&#1586; &#1605;&#1593; &#1578;&#1606;&#1576;&#1610;&#1607;&#1575;&#1578;',
            cls: 'warnings'
        },
        not_ready: {
            code: 'not_ready',
            label_en: 'Not Ready',
            label_ar: '&#1594;&#1610;&#1585; &#1580;&#1575;&#1607;&#1586;',
            cls: 'not-ready'
        },
        incomplete: {
            code: 'incomplete',
            label_en: 'Incomplete',
            label_ar: '&#1594;&#1610;&#1585; &#1605;&#1603;&#1578;&#1605;&#1604;',
            cls: 'incomplete'
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

    function closeoutApi()   { return localApi('RmoozScenarioEvidenceReviewCloseout', 'scenario-evidence-review-closeout.js'); }
    function reviewQueueApi(){ return localApi('RmoozScenarioEvidenceReviewQueue',   'scenario-evidence-review-queue.js'); }
    function acceptanceApi() { return localApi('RmoozScenarioEvidenceHandoffAcceptance', 'scenario-evidence-handoff-acceptance.js'); }
    function sessionApi()    { return localApi('RmoozScenarioEvidenceReviewSession',  'scenario-evidence-review-session.js'); }

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
            // Pass providers/null through: computeFingerprint resolves functions
            // itself and hashes null to the shared empty-scenario fingerprint.
            try { return RS.computeFingerprint(input, opts); } catch (_) {}
        }
        return 'unknown';
    }

    function statusMeta(code) { return STATUS_META[code] || STATUS_META.incomplete; }

    function resolveCloseout(worldStateOrProvider, opts) {
        if (opts.closeout) return obj(opts.closeout);
        var CO = closeoutApi();
        var RQ = reviewQueueApi();
        if (!CO || typeof CO.buildCloseout !== 'function') return null;
        var ws = resolveWorldState(worldStateOrProvider);
        var queue = opts.review_queue || (RQ && typeof RQ.buildReviewQueue === 'function'
            ? RQ.buildReviewQueue(ws, { generated_at: opts.generated_at })
            : null);
        return CO.buildCloseout(queue, { world_state: ws, generated_at: opts.generated_at });
    }

    function resolveAcceptance(fp, opts) {
        if (opts.acceptance) return obj(opts.acceptance);
        var HA = acceptanceApi();
        if (HA && typeof HA.getDecision === 'function') {
            return HA.getDecision(fp) || null;
        }
        return null;
    }

    // ── QA-92/94/95: deterministic release checks ────────────────────────
    function buildChecks(closeout, acceptance, currentFp) {
        closeout = obj(closeout);
        var counts = obj(closeout.counts);
        var checks = [];

        // 1. Closeout status
        var coStatus = closeout.status || 'incomplete';
        checks.push({
            key: 'closeout_status',
            label_en: 'Closeout status',
            required: 'Ready for Handoff',
            actual: closeout.status_label_en || coStatus,
            status: coStatus === 'ready_for_handoff' ? 'pass'
                : coStatus === 'ready_with_exceptions' ? 'warn'
                : coStatus === 'incomplete' ? 'na' : 'fail'
        });

        // 2. Unresolved (needs-review) issues
        var unresolved = counts.needs_review || 0;
        checks.push({
            key: 'unresolved_issues',
            label_en: 'Unresolved issues',
            required: '0',
            actual: String(unresolved),
            status: unresolved === 0 ? 'pass' : 'fail'
        });

        // 3. Deferred issues justified
        var deferredMissing = arr(closeout.deferred_without_note).length;
        checks.push({
            key: 'deferred_justified',
            label_en: 'Deferred issues justified',
            required: 'all deferred have a note',
            actual: deferredMissing === 0
                ? (counts.deferred ? counts.deferred + ' deferred, all justified' : 'none deferred')
                : deferredMissing + ' missing justification',
            status: deferredMissing === 0 ? 'pass' : 'fail'
        });

        // 4. Fixed-externally verified
        var fixedMissing = arr(closeout.fixed_externally_without_note).length;
        checks.push({
            key: 'fixed_externally_verified',
            label_en: 'Fixed externally verified',
            required: 'all fixed-externally have a verification note',
            actual: fixedMissing === 0
                ? (counts.fixed_externally ? counts.fixed_externally + ' fixed, all verified' : 'none fixed externally')
                : fixedMissing + ' missing verification',
            status: fixedMissing === 0 ? 'pass' : 'fail'
        });

        // 5. Handoff acceptance decision
        var decision = acceptance ? acceptance.decision : null;
        checks.push({
            key: 'handoff_acceptance',
            label_en: 'Handoff acceptance',
            required: 'Accepted or Accepted with Warnings',
            actual: acceptance ? (acceptance.decision_label_en || decision) : 'No decision yet',
            status: decision === 'accepted' ? 'pass'
                : decision === 'accepted_with_warnings' ? 'warn' : 'fail'
        });

        // 6. Scenario fingerprint match (package accepted for THIS scenario, unchanged since)
        var fpStatus, fpActual;
        if (!acceptance) {
            fpStatus = 'na';
            fpActual = 'No accepted package';
        } else if (!acceptance.fingerprint_match) {
            fpStatus = 'fail';
            fpActual = 'Package fingerprint mismatch';
        } else if (acceptance.current_scenario_fingerprint && acceptance.current_scenario_fingerprint !== currentFp) {
            fpStatus = 'fail';
            fpActual = 'Scenario changed since acceptance';
        } else {
            fpStatus = 'pass';
            fpActual = 'Match';
        }
        checks.push({
            key: 'fingerprint_match',
            label_en: 'Scenario fingerprint',
            required: 'Match',
            actual: fpActual,
            status: fpStatus
        });

        return checks;
    }

    function blockerLabel(check) {
        switch (check.key) {
            case 'closeout_status': return 'Review closeout is "' + check.actual + '" (needs Ready for Handoff)';
            case 'unresolved_issues': return check.actual + ' issue(s) still need review';
            case 'deferred_justified': return check.actual + ' — add justification notes';
            case 'fixed_externally_verified': return check.actual + ' — add verification notes';
            case 'handoff_acceptance': return 'Handoff package not accepted (' + check.actual + ')';
            case 'fingerprint_match': return check.actual;
            default: return check.label_en + ': ' + check.actual;
        }
    }

    function buildReleaseGate(worldStateOrProvider, opts) {
        opts = opts || {};
        var generatedAt = opts.generated_at || new Date().toISOString();
        var currentFp = fingerprint(worldStateOrProvider, opts);
        var closeout = resolveCloseout(worldStateOrProvider, Object.assign({}, opts, { generated_at: generatedAt }));
        var acceptance = resolveAcceptance(currentFp, opts);
        var checks = buildChecks(closeout, acceptance, currentFp);

        var fails = checks.filter(function (c) { return c.status === 'fail'; });
        var warns = checks.filter(function (c) { return c.status === 'warn'; });
        var reviewIncomplete = !closeout || closeout.status === 'incomplete';

        var status;
        if (reviewIncomplete) status = STATUS_META.incomplete;
        else if (fails.length) status = STATUS_META.not_ready;
        else if (warns.length) status = STATUS_META.ready_with_warnings;
        else status = STATUS_META.ready_for_release;

        var blockers = fails.map(function (c) { return { code: c.key, label: blockerLabel(c) }; });
        if (reviewIncomplete && !blockers.some(function (b) { return b.code === 'closeout_status'; })) {
            blockers.unshift({ code: 'review_incomplete', label: 'Evidence review is incomplete — complete the review closeout first' });
        }
        var warnings = warns.map(function (c) { return { code: c.key, label: c.label_en + ': ' + c.actual }; });

        return {
            version: SCENARIO_EVIDENCE_RELEASE_GATE_VERSION,
            generated_at: generatedAt,
            status: status.code,
            status_label_en: status.label_en,
            status_label_ar: status.label_ar,
            releasable: status.code === 'ready_for_release' || status.code === 'ready_with_warnings',
            scenario_fingerprint: currentFp,
            checks: checks,
            blockers: blockers,
            warnings: warnings,
            closeout_status: closeout ? (closeout.status || null) : null,
            acceptance_decision: acceptance ? (acceptance.decision || null) : null,
            acceptance_fingerprint_match: acceptance ? !!acceptance.fingerprint_match : null,
            counts: obj(obj(closeout).counts),
            source: 'Review closeout + handoff acceptance + scenario fingerprint',
            read_only: true
        };
    }

    // ── QA-96: release certificate ───────────────────────────────────────
    function buildCertificate(gate, opts) {
        opts = opts || {};
        gate = gate || buildReleaseGate(null, opts);
        var meta = statusMeta(gate.status);
        return {
            certificate_type: CERTIFICATE_TYPE,
            version: SCENARIO_EVIDENCE_RELEASE_GATE_VERSION,
            generated_at: opts.generated_at || gate.generated_at || new Date().toISOString(),
            release_status: gate.status,
            release_status_label_en: gate.status_label_en || meta.label_en,
            release_status_label_ar: gate.status_label_ar || meta.label_ar,
            releasable: !!gate.releasable,
            scenario_fingerprint: gate.scenario_fingerprint || 'unknown',
            closeout_status: gate.closeout_status || null,
            acceptance_decision: gate.acceptance_decision || null,
            acceptance_fingerprint_match: gate.acceptance_fingerprint_match,
            checks: arr(gate.checks).map(function (c) {
                return { key: c.key, label_en: c.label_en, required: c.required, actual: c.actual, status: c.status };
            }),
            blockers: arr(gate.blockers),
            warnings: arr(gate.warnings),
            operator_note: opts.operator_note || '',
            source: 'Browser-local evidence release gate decision',
            read_only: true
        };
    }

    function certificateSummary(cert) {
        cert = obj(cert);
        var lines = [
            'Evidence Release Certificate',
            '',
            'Release status: ' + (cert.release_status_label_en || cert.release_status || 'Incomplete'),
            'Releasable: ' + (cert.releasable ? 'yes' : 'no'),
            'Scenario fingerprint: ' + (cert.scenario_fingerprint || 'unknown'),
            'Closeout status: ' + (cert.closeout_status || 'unknown'),
            'Handoff acceptance: ' + (cert.acceptance_decision || 'none'),
            ''
        ];
        lines.push('Required checks:');
        arr(cert.checks).forEach(function (c) {
            var mark = c.status === 'pass' ? '[PASS]' : c.status === 'warn' ? '[WARN]' : c.status === 'na' ? '[ N/A]' : '[FAIL]';
            lines.push('  ' + mark + ' ' + c.label_en + ' — required ' + c.required + '; actual ' + c.actual);
        });
        lines.push('');
        lines.push('Blockers:');
        if (!arr(cert.blockers).length) lines.push('  - None');
        else arr(cert.blockers).forEach(function (b) { lines.push('  - ' + b.label); });
        if (arr(cert.warnings).length) {
            lines.push('');
            lines.push('Warnings:');
            arr(cert.warnings).forEach(function (w) { lines.push('  - ' + w.label); });
        }
        if (cert.operator_note) { lines.push(''); lines.push('Operator note: ' + cert.operator_note); }
        lines.push('');
        lines.push('Read-only release certificate. This decision does not release, mutate, or authorize any scenario action.');
        lines.push('Generated: ' + (cert.generated_at || 'unknown'));
        return lines.join('\n');
    }

    function toJson(cert) { return JSON.stringify(cert || {}, null, 2); }

    function copyText(text) {
        if (!root.navigator || !root.navigator.clipboard || typeof root.navigator.clipboard.writeText !== 'function') {
            return Promise.resolve(false);
        }
        return root.navigator.clipboard.writeText(String(text == null ? '' : text)).then(function () { return true; });
    }
    function copyCertificate(cert) { return copyText(certificateSummary(cert)); }
    function copyJson(cert) { return copyText(toJson(cert)); }

    function downloadJson(cert, filename) {
        if (!root.document || typeof root.Blob !== 'function' || !root.URL || typeof root.URL.createObjectURL !== 'function') return false;
        var blob = new root.Blob([toJson(cert)], { type: 'application/json' });
        var url = root.URL.createObjectURL(blob);
        var a = root.document.createElement('a');
        a.href = url;
        a.download = filename || 'rmooz-evidence-release-certificate.json';
        root.document.body.appendChild(a);
        a.click();
        root.document.body.removeChild(a);
        setTimeout(function () { root.URL.revokeObjectURL(url); }, 0);
        return true;
    }

    // ── Rendering ────────────────────────────────────────────────────────
    function checkMark(status) {
        return status === 'pass' ? '&#10003;' : status === 'warn' ? '&#9888;' : status === 'na' ? '&#8211;' : '&#10007;';
    }

    function renderReleaseGateHtml(gate) {
        gate = gate || buildReleaseGate(null);
        var meta = statusMeta(gate.status);
        var html = '<div class="usp-release-card usp-release-card--' + esc(meta.cls) + '">' +
            '<div class="usp-release-header">' +
                '<span>Evidence Release Gate</span>' +
                '<span dir="rtl">&#1576;&#1608;&#1575;&#1576;&#1577; &#1575;&#1593;&#1578;&#1605;&#1575;&#1583; &#1575;&#1604;&#1571;&#1583;&#1604;&#1577;</span>' +
                '<strong>' + esc(gate.status_label_en || meta.label_en) + '</strong>' +
                '<small dir="rtl">' + (gate.status_label_ar || meta.label_ar) + '</small>' +
            '</div>' +
            '<div class="usp-release-meta">Scenario fingerprint: <code>' + esc(gate.scenario_fingerprint || 'unknown') + '</code></div>' +
            '<div class="usp-release-checks"><span>Required</span><ul>';
        arr(gate.checks).forEach(function (c) {
            html += '<li class="usp-release-check--' + esc(c.status) + '">' +
                '<span class="usp-release-check-mark">' + checkMark(c.status) + '</span> ' +
                esc(c.label_en) + ': ' + esc(c.actual) + '</li>';
        });
        html += '</ul></div>';
        html += '<div class="usp-release-blockers"><span>Blockers</span><ul>';
        if (!arr(gate.blockers).length) html += '<li>None</li>';
        else arr(gate.blockers).forEach(function (b) { html += '<li>' + esc(b.label) + '</li>'; });
        html += '</ul></div>';
        if (arr(gate.warnings).length) {
            html += '<div class="usp-release-warnings"><span>Warnings</span><ul>';
            arr(gate.warnings).forEach(function (w) { html += '<li>' + esc(w.label) + '</li>'; });
            html += '</ul></div>';
        }
        html += '<div class="usp-release-actions">' +
                '<button type="button" data-release-action="certificate">Copy Release Certificate</button>' +
                '<button type="button" data-release-action="json">Copy Release JSON</button>' +
                '<button type="button" data-release-action="download">Download Release JSON</button>' +
            '</div>' +
            '<div class="usp-release-source">Source: ' + esc(gate.source || '') + '. Read-only release decision — does not release or mutate scenario state.</div>' +
            '</div>';
        return html;
    }

    function bindReleaseGateActions(container, gate, opts) {
        opts = opts || {};
        if (!container || !container.querySelectorAll) return false;
        Array.prototype.forEach.call(container.querySelectorAll('[data-release-action]'), function (btn) {
            btn.addEventListener('click', function () {
                var action = btn.getAttribute('data-release-action');
                var cert = buildCertificate(gate, opts);
                if (action === 'certificate') copyCertificate(cert);
                else if (action === 'json') copyJson(cert);
                else if (action === 'download') downloadJson(cert);
            });
        });
        return true;
    }

    var api = {
        SCENARIO_EVIDENCE_RELEASE_GATE_VERSION: SCENARIO_EVIDENCE_RELEASE_GATE_VERSION,
        CERTIFICATE_TYPE: CERTIFICATE_TYPE,
        STATUS_META: STATUS_META,
        buildReleaseGate: buildReleaseGate,
        buildCertificate: buildCertificate,
        certificateSummary: certificateSummary,
        toJson: toJson,
        copyCertificate: copyCertificate,
        copyJson: copyJson,
        downloadJson: downloadJson,
        renderReleaseGateHtml: renderReleaseGateHtml,
        bindReleaseGateActions: bindReleaseGateActions
    };

    root.RmoozScenarioEvidenceReleaseGate = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
