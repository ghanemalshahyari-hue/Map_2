/* ============================================================================
 * cmo-wargame-test-card.js - CMO-WARGAME-LIVE-WIRING-1
 * ----------------------------------------------------------------------------
 * Read-only operator test card derived from the CMO war-game readiness brief.
 * It gives test steps, observation focus, abort/pause criteria, and after-action
 * checks. It does not run, fix, mutate, or authorize anything.
 * ========================================================================== */
(function (root) {
    'use strict';

    var CMO_WARGAME_TEST_CARD_VERSION = '1.0.0-cmo-wargame-live-wiring-1';

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

    function briefFrom(input, snapshot, opts) {
        if (input && input.version && input.decision) return input;
        var RB = localApi('RmoozCmoWarGameReadinessBrief', 'cmo-wargame-readiness-brief.js');
        return RB && typeof RB.buildBrief === 'function' ? RB.buildBrief(snapshot || input, opts) : {};
    }

    function stepsFor(brief) {
        var decision = brief.decision || 'training_preview_only';
        var base = [
            'Open Scenario Control Center and confirm the committed COA is current.',
            'Open Scenario Evidence and keep CMO War-Game Readiness visible.',
            'Start the run only in the displayed run mode.',
            'Observe release, closeout, coverage, and handoff status after each turn.'
        ];
        if (decision === 'no_go') return [
            'Do not start the scenario run.',
            'Open release blockers and review queue.',
            'Resolve or defer blockers through the manual review workflow before retesting.'
        ];
        if (decision === 'training_preview_only') base[2] = 'Start only as a training preview; do not capture it as release-grade evidence.';
        if (decision === 'go_with_warnings') base.push('Pause at the first warning escalation and capture an after-action note.');
        return base;
    }

    function observationFocus(snapshot) {
        snapshot = obj(snapshot);
        var focus = [
            'Objective status and scenario turn progression',
            'Evidence coverage and review queue movement',
            'Handoff fingerprint and acceptance receipt',
            'Release gate blocker count'
        ];
        arr(snapshot.blockers).slice(0, 3).forEach(function (b) { focus.push('Blocker: ' + b); });
        return focus.slice(0, 7);
    }

    function abortCriteria(brief) {
        var decision = brief.decision || 'training_preview_only';
        var criteria = [
            'Unexpected combat/action mutation outside the committed scenario run.',
            'Doctrine or source-truth fields change without operator review.',
            'Release fingerprint changes during handoff acceptance.'
        ];
        if (decision === 'training_preview_only' || decision === 'no_go') {
            criteria.unshift('Operator attempts to treat training-only output as release evidence.');
        }
        if (decision === 'go_with_warnings') criteria.unshift('Warning becomes a blocking release gate failure.');
        return criteria;
    }

    function buildTestCard(briefOrSnapshot, snapshotOrOpts, opts) {
        opts = opts || {};
        var snapshot = snapshotOrOpts && snapshotOrOpts.coverage ? snapshotOrOpts : obj(briefOrSnapshot.flow_snapshot || {});
        var brief = briefFrom(briefOrSnapshot, snapshot, opts);
        snapshot = snapshot && snapshot.coverage ? snapshot : obj(brief.flow_snapshot);
        return {
            version: CMO_WARGAME_TEST_CARD_VERSION,
            generated_at: opts.generated_at || brief.generated_at || new Date().toISOString(),
            readiness_decision: brief.decision,
            readiness_label: brief.decision_label_en,
            run_mode: brief.run_mode,
            operator_steps: stepsFor(brief),
            observation_focus: observationFocus(snapshot),
            abort_criteria: abortCriteria(brief),
            after_action_checklist: [
                'Confirm release gate still reflects the final run state.',
                'Copy or export the CMO readiness brief and test card.',
                'Review audit trail for local review and handoff events.',
                'Record whether the run remains release-grade or training-only.'
            ],
            read_only_disclaimer: 'Operator test card is read-only guidance. It does not run, mutate, or approve the scenario.'
        };
    }

    function buildSummary(card) {
        card = obj(card);
        function block(title, items) {
            return [title].concat(arr(items).map(function (x) { return '- ' + x; })).join('\n');
        }
        return [
            'CMO War-Game Operator Test Card',
            'Readiness: ' + (card.readiness_label || card.readiness_decision || 'Unknown'),
            'Run mode: ' + (card.run_mode || 'unknown'),
            '',
            block('Operator steps:', card.operator_steps),
            '',
            block('Observation focus:', card.observation_focus),
            '',
            block('Abort / pause criteria:', card.abort_criteria),
            '',
            block('After-action checklist:', card.after_action_checklist),
            '',
            card.read_only_disclaimer || 'Read-only.'
        ].join('\n');
    }

    function renderList(items) {
        return '<ol>' + arr(items).map(function (item) { return '<li>' + esc(item) + '</li>'; }).join('') + '</ol>';
    }

    function renderTestCardHtml(card) {
        card = obj(card);
        return '<div class="usp-cmo-test-card" id="usp-cmo-wargame-test-card">' +
            '<div class="usp-cmo-readiness-subhead">Operator test steps</div>' + renderList(card.operator_steps) +
            '<div class="usp-cmo-readiness-subhead">Observation focus</div>' + renderList(card.observation_focus) +
            '<div class="usp-cmo-readiness-subhead">Abort / pause criteria</div>' + renderList(card.abort_criteria) +
            '<div class="usp-cmo-readiness-subhead">After-action checklist</div>' + renderList(card.after_action_checklist) +
            '<div class="usp-cmo-readiness-disclaimer">' + esc(card.read_only_disclaimer || 'Read-only.') + '</div>' +
            '</div>';
    }

    function copyTestCard(card) {
        var text = buildSummary(card);
        var nav = root.navigator || {};
        if (nav.clipboard && typeof nav.clipboard.writeText === 'function') return nav.clipboard.writeText(text);
        return text;
    }

    var api = {
        CMO_WARGAME_TEST_CARD_VERSION: CMO_WARGAME_TEST_CARD_VERSION,
        buildTestCard: buildTestCard,
        buildSummary: buildSummary,
        renderTestCardHtml: renderTestCardHtml,
        copyTestCard: copyTestCard
    };

    root.RmoozCmoWarGameTestCard = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
