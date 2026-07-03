/* ============================================================================
 * cmo-wargame-readiness-brief.js - CMO-WARGAME-LIVE-WIRING-1
 * ----------------------------------------------------------------------------
 * Read-only CMO war-game readiness decision derived from the scenario evidence
 * flow snapshot. It answers whether the operator can run the war-game now.
 * ========================================================================== */
(function (root) {
    'use strict';

    var CMO_WARGAME_READINESS_BRIEF_VERSION = '1.0.0-cmo-wargame-live-wiring-1';

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
    function pct(snapshot) {
        var coverage = obj(snapshot.coverage);
        var n = Number(coverage.coverage_pct);
        return isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0;
    }
    function snapshotFrom(input, opts) {
        if (input && input.version && input.scenario && input.coverage) return input;
        var FS = localApi('RmoozScenarioEvidenceFlowSnapshot', 'scenario-evidence-flow-snapshot.js');
        return FS && typeof FS.buildSnapshot === 'function' ? FS.buildSnapshot(input, opts) : {};
    }

    function decisionFor(snapshot) {
        var coveragePct = pct(snapshot);
        var counts = obj(snapshot.counts);
        var release = obj(snapshot.release_gate);
        var closeout = obj(snapshot.closeout);
        var handoff = obj(snapshot.handoff_acceptance);
        var issues = counts.review_issues || 0;
        var accepted = /accepted/.test(String(handoff.decision || ''));
        var releaseStatus = String(release.status || '');
        var closeoutStatus = String(closeout.status || '');

        if (release.releasable === true && coveragePct >= 80 && issues === 0 && accepted) return 'go';
        if ((releaseStatus === 'ready_with_warnings' || closeoutStatus === 'ready_with_exceptions' || (coveragePct >= 70 && issues <= 2)) && accepted) return 'go_with_warnings';
        if (snapshot.training_preview_only || coveragePct >= 40 || counts.units > 0) return 'training_preview_only';
        return 'no_go';
    }

    var DECISION_META = {
        go: { label: 'GO', cls: 'go', run_mode: 'release-grade war-game' },
        go_with_warnings: { label: 'GO with warnings', cls: 'warn', run_mode: 'controlled war-game with CMO watch' },
        training_preview_only: { label: 'Training preview only', cls: 'training', run_mode: 'training preview only' },
        no_go: { label: 'NO-GO', cls: 'no-go', run_mode: 'hold / do not run' }
    };

    function confidenceFor(snapshot, decision) {
        var coveragePct = pct(snapshot);
        var issues = obj(snapshot.counts).review_issues || 0;
        var release = obj(snapshot.release_gate);
        var handoff = obj(snapshot.handoff_acceptance);
        var score = coveragePct;
        if (release.releasable) score += 10;
        if (/accepted/.test(String(handoff.decision || ''))) score += 8;
        score -= Math.min(24, issues * 6);
        if (decision === 'training_preview_only') score = Math.min(score, 68);
        if (decision === 'no_go') score = Math.min(score, 35);
        return Math.max(0, Math.min(100, Math.round(score)));
    }

    function nextActions(snapshot, decision) {
        var actions = [];
        var blockers = arr(snapshot.blockers);
        if (decision === 'go') {
            actions.push('Run the scenario from the Scenario Control Center.');
            actions.push('Watch release gate, handoff receipt, and force evidence deltas.');
        } else if (decision === 'go_with_warnings') {
            actions.push('Run with CMO monitoring and keep the release blockers visible.');
            actions.push('Pause if any warning becomes a blocking issue.');
        } else if (decision === 'training_preview_only') {
            actions.push('Use training preview mode only; do not treat outcomes as release evidence.');
            actions.push('Resolve review queue issues before release-grade execution.');
        } else {
            actions.push('Do not run the war-game yet.');
            actions.push('Resolve release blockers and regenerate the handoff package.');
        }
        blockers.slice(0, 3).forEach(function (b) { actions.push('Review blocker: ' + b); });
        return actions.slice(0, 6);
    }

    function buildBrief(snapshotOrWorldState, opts) {
        opts = opts || {};
        var snapshot = snapshotFrom(snapshotOrWorldState, opts);
        var decision = opts.decision || decisionFor(snapshot);
        var meta = DECISION_META[decision] || DECISION_META.no_go;
        return {
            version: CMO_WARGAME_READINESS_BRIEF_VERSION,
            generated_at: opts.generated_at || snapshot.generated_at || new Date().toISOString(),
            flow_snapshot: snapshot,
            decision: decision,
            decision_label_en: meta.label,
            decision_label_ar: decision === 'go' ? '&#1575;&#1606;&#1591;&#1604;&#1575;&#1602;' : decision === 'no_go' ? '&#1593;&#1583;&#1605; &#1575;&#1604;&#1575;&#1606;&#1591;&#1604;&#1575;&#1602;' : '&#1605;&#1585;&#1575;&#1580;&#1593;&#1577;',
            cls: meta.cls,
            confidence: confidenceFor(snapshot, decision),
            run_mode: meta.run_mode,
            next_actions: nextActions(snapshot, decision),
            blockers: arr(snapshot.blockers),
            warnings: arr(snapshot.warnings),
            read_only_disclaimer: 'Read-only CMO readiness brief. It does not authorize, mutate, or auto-run scenario actions.'
        };
    }

    function buildSummary(brief) {
        brief = obj(brief);
        return [
            'CMO War-Game Readiness Brief',
            'Decision: ' + (brief.decision_label_en || brief.decision || 'Unknown'),
            'Confidence: ' + (brief.confidence == null ? 'unknown' : brief.confidence + '%'),
            'Run mode: ' + (brief.run_mode || 'unknown'),
            '',
            'Next actions:',
            arr(brief.next_actions).map(function (a) { return '- ' + a; }).join('\n') || '- Review scenario evidence.',
            '',
            brief.read_only_disclaimer || 'Read-only.'
        ].join('\n');
    }

    function renderList(items) {
        return '<ul>' + arr(items).map(function (item) { return '<li>' + esc(item) + '</li>'; }).join('') + '</ul>';
    }

    function renderBriefHtml(brief) {
        brief = obj(brief);
        return '<div class="usp-cmo-readiness-card usp-cmo-readiness-card--' + esc(brief.cls || 'training') + '" id="usp-cmo-wargame-readiness-brief">' +
            '<div class="usp-cmo-readiness-head">' +
            '<span class="usp-cmo-readiness-kicker">CMO War-Game Readiness</span>' +
            '<strong>' + esc(brief.decision_label_en || 'Unknown') + '</strong>' +
            '<span dir="rtl">' + (brief.decision_label_ar || '') + '</span>' +
            '</div>' +
            '<dl class="usp-cmo-readiness-grid">' +
            '<div><dt>Confidence</dt><dd>' + esc(brief.confidence == null ? 'unknown' : brief.confidence + '%') + '</dd></div>' +
            '<div><dt>Run mode</dt><dd>' + esc(brief.run_mode || 'unknown') + '</dd></div>' +
            '</dl>' +
            '<div class="usp-cmo-readiness-subhead">Next actions</div>' +
            renderList(brief.next_actions) +
            '<div class="usp-cmo-readiness-disclaimer">' + esc(brief.read_only_disclaimer || 'Read-only.') + '</div>' +
            '</div>';
    }

    function copyBrief(brief) {
        var text = buildSummary(brief);
        var nav = root.navigator || {};
        if (nav.clipboard && typeof nav.clipboard.writeText === 'function') return nav.clipboard.writeText(text);
        return text;
    }

    var api = {
        CMO_WARGAME_READINESS_BRIEF_VERSION: CMO_WARGAME_READINESS_BRIEF_VERSION,
        buildBrief: buildBrief,
        buildSummary: buildSummary,
        renderBriefHtml: renderBriefHtml,
        copyBrief: copyBrief
    };

    root.RmoozCmoWarGameReadinessBrief = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
