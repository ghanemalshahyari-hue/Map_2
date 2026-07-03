/* ============================================================================
 * scenario-evidence-flow-snapshot.js - CMO-WARGAME-LIVE-WIRING-1
 * ----------------------------------------------------------------------------
 * Read-only snapshot of the scenario evidence flow. It stitches existing
 * browser-local evidence surfaces into one compact state object for CMO
 * readiness/test-card consumers. No backend routes, storage writes, combat
 * mutation, doctrine mutation, or DOCX staging.
 * ========================================================================== */
(function (root) {
    'use strict';

    var FLOW_SNAPSHOT_VERSION = '1.0.0-cmo-wargame-live-wiring-1';

    function obj(v) { return v && typeof v === 'object' ? v : {}; }
    function arr(v) { return Array.isArray(v) ? v : []; }

    function localApi(globalName, moduleName) {
        if (root[globalName]) return root[globalName];
        if (typeof require === 'function') {
            try { return require('./' + moduleName); } catch (_) {}
        }
        return null;
    }

    function resolveWorldState(input) {
        if (typeof input === 'function') {
            try { return input(); } catch (_) { return null; }
        }
        return input || null;
    }

    function unitList(ws) {
        ws = obj(ws);
        var sc = obj(ws.scenario || ws);
        var out = [];
        [
            ws.units, ws.blue_units, ws.red_units, ws.blue_units_initial,
            sc.units, sc.blue_units, sc.red_units, sc.blue_units_initial
        ].forEach(function (list) {
            arr(list).forEach(function (u) { if (u && out.indexOf(u) === -1) out.push(u); });
        });
        return out;
    }

    function scenarioName(ws) {
        ws = obj(ws);
        var sc = obj(ws.scenario || ws);
        return sc.name || sc.title || sc.id || ws.name || ws.title || ws.id || 'Scenario';
    }

    function selectedUnit(unit) {
        unit = obj(unit);
        var uid = unit.uid || unit.id || unit.unit_uid || null;
        if (!uid && !unit.label && !unit.name) return null;
        return {
            uid: uid,
            label: unit.label || unit.name || unit.displayName || unit.display_name || uid || 'Selected unit',
            side: unit.side || null
        };
    }

    function fingerprint(ws, opts) {
        opts = opts || {};
        if (opts.fingerprint) return String(opts.fingerprint);
        var RS = localApi('RmoozScenarioEvidenceReviewSession', 'scenario-evidence-review-session.js');
        if (RS && typeof RS.computeFingerprint === 'function') {
            try { return RS.computeFingerprint(ws, opts); } catch (_) {}
        }
        return 'unknown';
    }

    function buildSnapshot(worldStateOrProvider, opts) {
        opts = opts || {};
        var generatedAt = opts.generated_at || new Date().toISOString();
        var ws = resolveWorldState(worldStateOrProvider);
        var units = unitList(ws);
        var MX = localApi('RmoozCmoEvidenceReadinessMatrix', 'cmo-evidence-readiness-matrix.js');
        var COV = localApi('RmoozCmoEvidenceCoverage', 'cmo-evidence-coverage.js');
        var RQ = localApi('RmoozScenarioEvidenceReviewQueue', 'scenario-evidence-review-queue.js');
        var CO = localApi('RmoozScenarioEvidenceReviewCloseout', 'scenario-evidence-review-closeout.js');
        var HA = localApi('RmoozScenarioEvidenceHandoffAcceptance', 'scenario-evidence-handoff-acceptance.js');
        var RG = localApi('RmoozScenarioEvidenceReleaseGate', 'scenario-evidence-release-gate.js');

        var matrix = opts.matrix || (MX && typeof MX.buildMatrix === 'function'
            ? MX.buildMatrix(ws, { limit: opts.limit || 80, generated_at: generatedAt })
            : { counts: { Ready: 0, Blocked: 0, Unknown: units.length }, rows: [], top_blockers: [] });
        var coverage = opts.coverage || (COV && typeof COV.buildCoverage === 'function'
            ? COV.buildCoverage(ws, { matrix: matrix, generated_at: generatedAt })
            : { total: units.length, ready: 0, blocked: 0, unknown: units.length, coverage_pct: units.length ? 50 : 0 });
        var reviewQueue = opts.review_queue || (RQ && typeof RQ.buildReviewQueue === 'function'
            ? RQ.buildReviewQueue(ws, { matrix: matrix, generated_at: generatedAt })
            : { total_issues: 0, units_flagged: 0, groups: [] });
        var closeout = opts.closeout || (CO && typeof CO.buildCloseout === 'function'
            ? CO.buildCloseout(reviewQueue, { world_state: ws, generated_at: generatedAt })
            : null);
        var fp = fingerprint(ws, opts);
        var acceptance = opts.handoff_acceptance || (HA && typeof HA.getDecision === 'function'
            ? HA.getDecision(fp)
            : null);
        if (!acceptance && HA && typeof HA.buildAcceptance === 'function') {
            try { acceptance = HA.buildAcceptance(ws, { generated_at: generatedAt }); } catch (_) {}
        }
        var releaseGate = opts.release_gate || (RG && typeof RG.buildReleaseGate === 'function'
            ? RG.buildReleaseGate(ws, { closeout: closeout, acceptance: acceptance, generated_at: generatedAt })
            : null);

        var counts = obj(matrix.counts);
        var issueCount = reviewQueue ? (reviewQueue.total_issues || reviewQueue.needs_review || 0) : 0;
        var blockers = arr(releaseGate && releaseGate.blockers).map(function (b) { return b.label || b.code; });
        arr(matrix.top_blockers).slice(0, 3).forEach(function (b) {
            if (b && b.code) blockers.push(b.code + ' x ' + (b.count || 0));
        });
        var trainingPreview = !!(opts.training_preview_only || obj(ws).training_preview_only || obj(ws).simulation_only);

        return {
            version: FLOW_SNAPSHOT_VERSION,
            generated_at: generatedAt,
            scenario: { name: scenarioName(ws), fingerprint: fp },
            selected_unit: selectedUnit(opts.selected_unit),
            counts: {
                units: units.length,
                ready: counts.Ready || counts.ready || 0,
                blocked: counts.Blocked || counts.blocked || 0,
                unknown: counts.Unknown || counts.unknown || 0,
                review_issues: issueCount
            },
            coverage: coverage,
            review_queue: reviewQueue,
            closeout: closeout,
            handoff_acceptance: acceptance,
            release_gate: releaseGate,
            training_preview_only: trainingPreview,
            blockers: blockers.filter(Boolean).slice(0, 8),
            warnings: arr(releaseGate && releaseGate.warnings).map(function (w) { return w.label || w.code; }).filter(Boolean),
            source: 'Scenario evidence flow snapshot; read-only browser state'
        };
    }

    function buildSummary(snapshot) {
        snapshot = obj(snapshot);
        var coverage = obj(snapshot.coverage);
        var release = obj(snapshot.release_gate);
        var closeout = obj(snapshot.closeout);
        var handoff = obj(snapshot.handoff_acceptance);
        return [
            'Scenario Evidence Flow Snapshot',
            'Scenario: ' + obj(snapshot.scenario).name,
            'Fingerprint: ' + obj(snapshot.scenario).fingerprint,
            'Coverage: ' + (coverage.coverage_pct == null ? 'unknown' : coverage.coverage_pct + '%'),
            'Review issues: ' + (obj(snapshot.counts).review_issues || 0),
            'Closeout: ' + (closeout.status_label_en || closeout.status || 'pending'),
            'Handoff: ' + (handoff.decision_label_en || handoff.decision || 'pending'),
            'Release: ' + (release.status_label_en || release.status || 'pending')
        ].join('\n');
    }

    function renderSnapshotHtml(snapshot) {
        snapshot = obj(snapshot);
        var counts = obj(snapshot.counts);
        return '<div class="usp-cmo-flow-snapshot" data-cmo-flow-snapshot>' +
            '<div class="usp-cmo-mini-grid">' +
            '<span>Units <b>' + String(counts.units || 0) + '</b></span>' +
            '<span>Ready <b>' + String(counts.ready || 0) + '</b></span>' +
            '<span>Blocked <b>' + String(counts.blocked || 0) + '</b></span>' +
            '<span>Review <b>' + String(counts.review_issues || 0) + '</b></span>' +
            '</div></div>';
    }

    var api = {
        FLOW_SNAPSHOT_VERSION: FLOW_SNAPSHOT_VERSION,
        buildSnapshot: buildSnapshot,
        buildSummary: buildSummary,
        renderSnapshotHtml: renderSnapshotHtml
    };

    root.RmoozScenarioEvidenceFlowSnapshot = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
