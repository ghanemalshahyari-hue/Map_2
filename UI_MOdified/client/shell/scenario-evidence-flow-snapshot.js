/* ============================================================================
 * scenario-evidence-flow-snapshot.js - RMOOZ-SCENARIO-FLOW-SNAPSHOT-1
 * ----------------------------------------------------------------------------
 * Read-only operator-flow snapshot for Scenario Evidence. Builds one deterministic
 * view across normalization, review queue, manual review, closeout, handoff,
 * release gate, HUD cluster, and force report. This module never mutates
 * scenario truth, world state, doctrine, combat state, backend routes, or a
 * database; it only composes existing browser-local evidence layers.
 * ========================================================================== */
(function (root) {
    'use strict';

    var SCENARIO_EVIDENCE_FLOW_SNAPSHOT_VERSION = '1.0.0-rmooz-scenario-flow-snapshot-1';

    function obj(v) { return v && typeof v === 'object' ? v : {}; }
    function arr(v) { return Array.isArray(v) ? v : []; }
    function num(v, fallback) {
        var n = Number(v);
        return isFinite(n) ? n : (fallback == null ? 0 : fallback);
    }
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

    function normalizerApi() { return localApi('RmoozScenarioEvidenceNormalizer', 'scenario-evidence-normalizer.js'); }
    function reviewQueueApi() { return localApi('RmoozScenarioEvidenceReviewQueue', 'scenario-evidence-review-queue.js'); }
    function repairApi() { return localApi('RmoozScenarioEvidenceRepairPlanner', 'scenario-evidence-repair-planner.js'); }
    function fixApi() { return localApi('RmoozScenarioEvidenceFixStatus', 'scenario-evidence-fix-status.js'); }
    function closeoutApi() { return localApi('RmoozScenarioEvidenceReviewCloseout', 'scenario-evidence-review-closeout.js'); }
    function handoffPackageApi() { return localApi('RmoozScenarioEvidenceHandoffPackage', 'scenario-evidence-handoff-package.js'); }
    function handoffAcceptanceApi() { return localApi('RmoozScenarioEvidenceHandoffAcceptance', 'scenario-evidence-handoff-acceptance.js'); }
    function releaseGateApi() { return localApi('RmoozScenarioEvidenceReleaseGate', 'scenario-evidence-release-gate.js'); }
    function releaseAuditApi() { return localApi('RmoozScenarioEvidenceReleaseAudit', 'scenario-evidence-release-audit.js'); }
    function sessionApi() { return localApi('RmoozScenarioEvidenceReviewSession', 'scenario-evidence-review-session.js'); }
    function coverageApi() { return localApi('RmoozCmoEvidenceCoverage', 'cmo-evidence-coverage.js'); }
    function reportApi() { return localApi('RmoozCmoForceEvidenceReport', 'cmo-force-evidence-report.js'); }
    function hudApi() { return localApi('RmoozScenarioEvidenceReleaseHud', 'scenario-evidence-release-hud.js'); }

    function resolveWorldState(input) {
        if (typeof input === 'function') {
            try { return input(); } catch (_) { return null; }
        }
        return input || null;
    }
    function fingerprint(worldStateOrProvider, opts) {
        opts = opts || {};
        if (opts.fingerprint) return String(opts.fingerprint);
        if (typeof worldStateOrProvider === 'string') return worldStateOrProvider;
        var RS = sessionApi();
        if (RS && typeof RS.computeFingerprint === 'function') {
            try { return RS.computeFingerprint(worldStateOrProvider, opts); } catch (_) {}
        }
        return 'unknown';
    }
    function buildNormalization(ws) {
        var N = normalizerApi();
        if (N && typeof N.normalizeWorldState === 'function') return N.normalizeWorldState(ws || {});
        return { normalized_ws: ws || {}, actions: [], fields_normalized: 0, units_affected: 0 };
    }
    function buildQueue(ws, opts) {
        var RQ = reviewQueueApi();
        if (opts.review_queue) return opts.review_queue;
        if (RQ && typeof RQ.buildReviewQueue === 'function') return RQ.buildReviewQueue(ws, opts);
        return { total_issues: 0, groups: [], read_only: true };
    }
    function buildRepairPlan(ws, queue, opts) {
        var RP = repairApi();
        if (opts.repair_plan) return opts.repair_plan;
        if (RP && typeof RP.buildRepairPlan === 'function') return RP.buildRepairPlan(ws, Object.assign({}, opts, { review_queue: queue }));
        return { plans: [], total_repairs: 0, read_only: true };
    }
    function buildManualSummary(queue) {
        var FS = fixApi();
        if (FS && typeof FS.summarize === 'function') return FS.summarize(queue || {});
        return { counts: { total: 0, needs_review: 0, reviewed: 0, deferred: 0, fixed_externally: 0 }, records: [], read_only: true };
    }
    function buildCloseout(queue, ws, opts) {
        var CO = closeoutApi();
        if (opts.closeout) return opts.closeout;
        if (CO && typeof CO.buildCloseout === 'function') return CO.buildCloseout(queue, Object.assign({}, opts, { world_state: ws }));
        return { status: 'incomplete', status_label_en: 'Incomplete', counts: {}, blockers: [], read_only: true };
    }
    function buildAcceptance(fp, opts) {
        var HA = handoffAcceptanceApi();
        if (opts.acceptance) return opts.acceptance;
        if (opts.handoff_acceptance) return opts.handoff_acceptance;
        if (HA && typeof HA.getDecision === 'function') return HA.getDecision(fp) || (HA.buildAcceptance ? HA.buildAcceptance(fp, opts) : null);
        return { decision: 'pending', decision_label_en: 'Pending Decision', current_scenario_fingerprint: fp, read_only: true };
    }
    function buildPackage(ws, fp, queue, closeout, report, opts) {
        var HP = handoffPackageApi();
        if (opts.handoff_package) return opts.handoff_package;
        if (HP && typeof HP.buildPackage === 'function') {
            return HP.buildPackage(ws, Object.assign({}, opts, {
                fingerprint: fp,
                review_queue: queue,
                closeout: closeout,
                force_report: report
            }));
        }
        return null;
    }
    function buildReleaseGate(ws, fp, closeout, acceptance, opts) {
        var RG = releaseGateApi();
        if (opts.release_gate) return opts.release_gate;
        if (RG && typeof RG.buildReleaseGate === 'function') {
            return RG.buildReleaseGate(ws, Object.assign({}, opts, {
                fingerprint: fp,
                closeout: closeout,
                acceptance: acceptance && acceptance.decision_record ? acceptance.decision_record : acceptance
            }));
        }
        return { status: 'incomplete', status_label_en: 'Incomplete', releasable: false, blockers: [], read_only: true };
    }
    function buildCoverage(ws, matrix, opts) {
        var COV = coverageApi();
        if (opts.coverage) return opts.coverage;
        if (COV && typeof COV.buildCoverage === 'function') return COV.buildCoverage(ws, Object.assign({}, opts, { matrix: matrix }));
        return { coverage_pct: 0, total: num(matrix && matrix.total_units), read_only: true };
    }
    function buildCluster(releaseGate, closeout, coverage, acceptance) {
        var HUD = hudApi();
        if (HUD && typeof HUD.buildCluster === 'function') return HUD.buildCluster({
            release_gate: releaseGate,
            closeout: closeout,
            coverage: coverage,
            acceptance: acceptance && acceptance.decision_record ? acceptance.decision_record : acceptance
        });
        return { chips: [] };
    }
    function buildReport(ws, queue, closeout, acceptance, releaseGate, handoffPackage, opts) {
        var FR = reportApi();
        if (opts.force_report) return opts.force_report;
        if (FR && typeof FR.buildReport === 'function') {
            return FR.buildReport(ws, Object.assign({}, opts, {
                review_queue: queue,
                review_closeout: closeout,
                handoff_acceptance: acceptance && acceptance.decision_record ? acceptance.decision_record : acceptance,
                release_gate: releaseGate,
                handoff_package: handoffPackage
            }));
        }
        return null;
    }
    function buildReleaseHistory(fp, opts) {
        var RA = releaseAuditApi();
        if (opts.release_history) return opts.release_history;
        if (RA && typeof RA.exportState === 'function') return RA.exportState(fp, opts);
        return { latest: null, history: [], read_only: true };
    }

    function statusOfStep(key, snapshot) {
        snapshot = obj(snapshot);
        if (key === 'normalize') return obj(snapshot.normalization).fields_normalized > 0 ? 'warn' : 'pass';
        if (key === 'review') return obj(snapshot.review_queue).total_issues > 0 ? 'warn' : 'pass';
        if (key === 'repair') return obj(snapshot.repair_plan).total_repairs > 0 || arr(obj(snapshot.repair_plan).plans).length ? 'warn' : 'pass';
        if (key === 'closeout') {
            var co = obj(snapshot.closeout).status;
            return co === 'ready_for_handoff' ? 'pass' : (co === 'ready_with_exceptions' ? 'warn' : 'fail');
        }
        if (key === 'handoff') {
            var h = obj(snapshot.handoff_acceptance).decision;
            return h === 'accepted' ? 'pass' : (h === 'accepted_with_warnings' ? 'warn' : 'fail');
        }
        if (key === 'release') return obj(snapshot.release_gate).releasable ? 'pass' : 'fail';
        return snapshot.force_report ? 'pass' : 'warn';
    }
    function buildChecklist(snapshot) {
        var steps = [
            { key: 'normalize', label: 'Normalize Evidence Inputs', detail: obj(snapshot.normalization).fields_normalized + ' field(s) normalized' },
            { key: 'review', label: 'Review Queue', detail: obj(snapshot.review_queue).total_issues + ' issue(s)' },
            { key: 'repair', label: 'Repair Plan', detail: (obj(snapshot.repair_plan).total_repairs || arr(obj(snapshot.repair_plan).plans).length || 0) + ' repair(s)' },
            { key: 'closeout', label: 'Review Closeout', detail: obj(snapshot.closeout).status_label_en || obj(snapshot.closeout).status || 'Incomplete' },
            { key: 'handoff', label: 'Handoff Acceptance', detail: obj(snapshot.handoff_acceptance).decision_label_en || obj(snapshot.handoff_acceptance).decision || 'Pending Decision' },
            { key: 'release', label: 'Evidence Release Gate', detail: obj(snapshot.release_gate).status_label_en || obj(snapshot.release_gate).status || 'Incomplete' },
            { key: 'report', label: 'Force Report', detail: snapshot.force_report ? 'Built' : 'Unavailable' }
        ];
        return steps.map(function (step) {
            return Object.assign({}, step, { status: statusOfStep(step.key, snapshot) });
        });
    }

    function buildSnapshot(worldStateOrProvider, opts) {
        opts = opts || {};
        var generatedAt = opts.generated_at || new Date().toISOString();
        var ws = resolveWorldState(worldStateOrProvider) || {};
        var fp = fingerprint(ws, opts);
        var normalization = buildNormalization(ws);
        var evidenceWs = opts.use_normalized_world_state ? obj(normalization).normalized_ws : ws;
        var matrix = opts.matrix || null;
        var queue = buildQueue(evidenceWs, Object.assign({}, opts, { generated_at: generatedAt, matrix: matrix }));
        var repairPlan = buildRepairPlan(evidenceWs, queue, Object.assign({}, opts, { generated_at: generatedAt, matrix: matrix }));
        var manualReview = buildManualSummary(queue);
        var closeout = buildCloseout(queue, evidenceWs, Object.assign({}, opts, { generated_at: generatedAt }));
        var acceptance = buildAcceptance(fp, Object.assign({}, opts, { generated_at: generatedAt, fingerprint: fp }));
        var releaseGate = buildReleaseGate(evidenceWs, fp, closeout, acceptance, Object.assign({}, opts, { generated_at: generatedAt }));
        var coverage = buildCoverage(evidenceWs, matrix, Object.assign({}, opts, { generated_at: generatedAt }));
        var cluster = buildCluster(releaseGate, closeout, coverage, acceptance);
        var provisionalReport = buildReport(evidenceWs, queue, closeout, acceptance, releaseGate, opts.handoff_package || null, Object.assign({}, opts, { generated_at: generatedAt, matrix: matrix }));
        var handoffPackage = buildPackage(evidenceWs, fp, queue, closeout, provisionalReport, Object.assign({}, opts, { generated_at: generatedAt }));
        var forceReport = provisionalReport || buildReport(evidenceWs, queue, closeout, acceptance, releaseGate, handoffPackage, Object.assign({}, opts, { generated_at: generatedAt, matrix: matrix }));
        var releaseHistory = buildReleaseHistory(fp, Object.assign({}, opts, { generated_at: generatedAt, fingerprint: fp }));
        var snapshot = {
            version: SCENARIO_EVIDENCE_FLOW_SNAPSHOT_VERSION,
            generated_at: generatedAt,
            scenario_fingerprint: fp,
            normalization: normalization,
            review_queue: queue,
            repair_plan: repairPlan,
            manual_review: manualReview,
            closeout: closeout,
            handoff_package: handoffPackage,
            handoff_acceptance: acceptance,
            release_gate: releaseGate,
            release_history: releaseHistory,
            coverage: coverage,
            status_cluster: cluster,
            force_report: forceReport,
            source: 'Browser-local scenario evidence flow snapshot',
            read_only: true
        };
        snapshot.checklist = buildChecklist(snapshot);
        snapshot.summary = buildSummary(snapshot);
        return snapshot;
    }

    function buildSummary(snapshot) {
        snapshot = obj(snapshot);
        var co = obj(snapshot.closeout);
        var ha = obj(snapshot.handoff_acceptance);
        var rg = obj(snapshot.release_gate);
        var norm = obj(snapshot.normalization);
        var rq = obj(snapshot.review_queue);
        return {
            scenario_fingerprint: snapshot.scenario_fingerprint || 'unknown',
            normalized_fields: norm.fields_normalized || 0,
            units_affected: norm.units_affected || 0,
            review_issues: rq.total_issues || 0,
            closeout_status: co.status || 'incomplete',
            closeout_label_en: co.status_label_en || 'Incomplete',
            handoff_decision: ha.decision || 'pending',
            handoff_label_en: ha.decision_label_en || 'Pending Decision',
            release_status: rg.status || 'incomplete',
            release_label_en: rg.status_label_en || 'Incomplete',
            releasable: !!rg.releasable,
            blocker_count: arr(rg.blockers).length,
            source: 'Scenario evidence flow summary',
            read_only: true
        };
    }

    function summaryText(snapshot) {
        snapshot = snapshot && snapshot.summary ? snapshot.summary : buildSummary(snapshot);
        var lines = [
            'Scenario Evidence Flow Snapshot',
            '',
            'Scenario fingerprint: ' + (snapshot.scenario_fingerprint || 'unknown'),
            'Normalized fields: ' + (snapshot.normalized_fields || 0) + ' across ' + (snapshot.units_affected || 0) + ' unit(s)',
            'Review issues: ' + (snapshot.review_issues || 0),
            'Closeout: ' + (snapshot.closeout_label_en || snapshot.closeout_status || 'Incomplete'),
            'Handoff: ' + (snapshot.handoff_label_en || snapshot.handoff_decision || 'Pending Decision'),
            'Release: ' + (snapshot.release_label_en || snapshot.release_status || 'Incomplete') + ' — releasable: ' + (snapshot.releasable ? 'yes' : 'no'),
            'Release blockers: ' + (snapshot.blocker_count || 0),
            '',
            'Read-only snapshot. No scenario truth, doctrine, combat, backend, or database mutation.'
        ];
        return lines.join('\n');
    }

    function renderSnapshotHtml(snapshot) {
        snapshot = snapshot || buildSnapshot(null);
        var summary = snapshot.summary || buildSummary(snapshot);
        var checklist = arr(snapshot.checklist || buildChecklist(snapshot));
        var html = '<div class="scenario-flow-snapshot scenario-flow-snapshot--' + esc(summary.release_status || 'incomplete') + '">' +
            '<div class="scenario-flow-snapshot-header">' +
                '<span>Scenario Evidence Flow Snapshot</span>' +
                '<span dir="rtl">ملخص تدفق أدلة السيناريو</span>' +
                '<strong>' + esc(summary.release_label_en || 'Incomplete') + '</strong>' +
            '</div>' +
            '<dl class="scenario-flow-snapshot-meta">' +
                '<div><dt>Fingerprint</dt><dd><code>' + esc(summary.scenario_fingerprint || 'unknown') + '</code></dd></div>' +
                '<div><dt>Normalized</dt><dd>' + esc(summary.normalized_fields || 0) + ' field(s) / ' + esc(summary.units_affected || 0) + ' unit(s)</dd></div>' +
                '<div><dt>Review issues</dt><dd>' + esc(summary.review_issues || 0) + '</dd></div>' +
                '<div><dt>Closeout</dt><dd>' + esc(summary.closeout_label_en || summary.closeout_status || 'Incomplete') + '</dd></div>' +
                '<div><dt>Handoff</dt><dd>' + esc(summary.handoff_label_en || summary.handoff_decision || 'Pending Decision') + '</dd></div>' +
                '<div><dt>Release blockers</dt><dd>' + esc(summary.blocker_count || 0) + '</dd></div>' +
            '</dl><ol class="scenario-flow-snapshot-checklist">';
        checklist.forEach(function (step) {
            html += '<li class="scenario-flow-snapshot-step scenario-flow-snapshot-step--' + esc(step.status) + '">' +
                '<strong>' + esc(step.label) + '</strong><span>' + esc(step.detail) + '</span></li>';
        });
        html += '</ol><div class="scenario-flow-snapshot-source">Source: ' + esc(snapshot.source || '') + '. Read-only.</div></div>';
        return html;
    }

    var api = {
        SCENARIO_EVIDENCE_FLOW_SNAPSHOT_VERSION: SCENARIO_EVIDENCE_FLOW_SNAPSHOT_VERSION,
        buildSnapshot: buildSnapshot,
        buildChecklist: buildChecklist,
        buildSummary: buildSummary,
        summaryText: summaryText,
        renderSnapshotHtml: renderSnapshotHtml
    };

    root.RmoozScenarioEvidenceFlowSnapshot = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
