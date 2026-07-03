/* ============================================================================
 * cmo-wargame-readiness-brief.js - RMOOZ-CMO-WARGAME-READINESS-1
 * ----------------------------------------------------------------------------
 * Read-only CMO war-game readiness brief. Converts the Scenario Evidence Flow
 * Snapshot into a concise go/no-go operator brief for testing the CMO war-game:
 * what is ready, what blocks release, what can still be tested with warnings,
 * and the next best operator actions. It never mutates scenario truth, world
 * state, doctrine, combat state, backend routes, or a database.
 * ========================================================================== */
(function (root) {
    'use strict';

    var CMO_WARGAME_READINESS_BRIEF_VERSION = '1.0.0-rmooz-cmo-wargame-readiness-1';

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
    function snapshotApi() { return localApi('RmoozScenarioEvidenceFlowSnapshot', 'scenario-evidence-flow-snapshot.js'); }

    function isSnapshot(input) {
        return !!(input && typeof input === 'object' && input.summary && input.checklist && input.release_gate);
    }
    function buildSnapshot(input, opts) {
        opts = opts || {};
        if (opts.snapshot) return opts.snapshot;
        if (isSnapshot(input)) return input;
        var SNAP = snapshotApi();
        if (SNAP && typeof SNAP.buildSnapshot === 'function') {
            return SNAP.buildSnapshot(input || null, opts);
        }
        return {
            scenario_fingerprint: opts.fingerprint || 'unknown',
            summary: {
                scenario_fingerprint: opts.fingerprint || 'unknown',
                normalized_fields: 0,
                units_affected: 0,
                review_issues: 0,
                closeout_status: 'incomplete',
                closeout_label_en: 'Incomplete',
                handoff_decision: 'pending',
                handoff_label_en: 'Pending Decision',
                release_status: 'incomplete',
                release_label_en: 'Incomplete',
                releasable: false,
                blocker_count: 0
            },
            checklist: [],
            release_gate: { blockers: [], warnings: [], checks: [], status: 'incomplete', releasable: false },
            read_only: true
        };
    }

    function gate(key, label, status, detail, action) {
        return {
            key: key,
            label: label,
            status: status,
            detail: detail || '',
            action: action || '',
            read_only: true
        };
    }
    function gateRank(status) {
        return status === 'fail' ? 0 : status === 'warn' ? 1 : status === 'pass' ? 2 : 1;
    }
    function decisionFromGates(gates, opts) {
        opts = opts || {};
        var anyFail = gates.some(function (g) { return g.status === 'fail'; });
        var anyWarn = gates.some(function (g) { return g.status === 'warn'; });
        if (anyFail && opts.allow_training_preview) return 'training_preview_only';
        if (anyFail) return 'no_go';
        if (anyWarn) return 'go_with_warnings';
        return 'go';
    }
    function decisionLabel(decision) {
        return {
            go: 'GO for CMO war-game test',
            go_with_warnings: 'GO with warnings',
            training_preview_only: 'Training preview only',
            no_go: 'NO-GO for release-grade test'
        }[decision] || 'NO-GO for release-grade test';
    }
    function decisionArabic(decision) {
        return {
            go: 'جاهز لاختبار المناورة',
            go_with_warnings: 'جاهز مع تنبيهات',
            training_preview_only: 'معاينة تدريبية فقط',
            no_go: 'غير جاهز للاختبار النهائي'
        }[decision] || 'غير جاهز للاختبار النهائي';
    }

    function releaseBlockerDigest(snapshot) {
        var rg = obj(snapshot.release_gate);
        return arr(rg.blockers).map(function (b) {
            return {
                code: obj(b).code || 'release_blocker',
                label: obj(b).label || obj(b).code || 'Release blocker',
                source: 'release_gate'
            };
        });
    }
    function checklistDigest(snapshot) {
        return arr(snapshot.checklist).map(function (step) {
            step = obj(step);
            return {
                key: step.key || 'step',
                label: step.label || step.key || 'Step',
                status: step.status || 'warn',
                detail: step.detail || '',
                source: 'flow_checklist'
            };
        });
    }
    function buildGates(snapshot, opts) {
        opts = opts || {};
        snapshot = obj(snapshot);
        var s = obj(snapshot.summary);
        var rg = obj(snapshot.release_gate);
        var gates = [];
        gates.push(gate(
            'scenario_identity',
            'Scenario identity',
            s.scenario_fingerprint && s.scenario_fingerprint !== 'unknown' ? 'pass' : 'warn',
            'Fingerprint: ' + (s.scenario_fingerprint || snapshot.scenario_fingerprint || 'unknown'),
            'Confirm scenario setup and Objective X identity.'
        ));
        gates.push(gate(
            'evidence_normalization',
            'Evidence normalization',
            (s.normalized_fields || 0) ? 'warn' : 'pass',
            (s.normalized_fields || 0) + ' field(s) normalized across ' + (s.units_affected || 0) + ' unit(s)',
            (s.normalized_fields || 0) ? 'Review normalized fields before trusting outcomes.' : 'No normalization action required.'
        ));
        gates.push(gate(
            'review_queue',
            'Review Queue',
            (s.review_issues || 0) ? 'warn' : 'pass',
            (s.review_issues || 0) + ' evidence issue(s)',
            (s.review_issues || 0) ? 'Open Scenario Evidence Review Queue.' : 'Review queue clear.'
        ));
        gates.push(gate(
            'closeout',
            'Review Closeout',
            s.closeout_status === 'ready_for_handoff' ? 'pass' : (s.closeout_status === 'ready_with_exceptions' ? 'warn' : 'fail'),
            s.closeout_label_en || s.closeout_status || 'Incomplete',
            'Open Closeout and resolve blockers/deferred notes.'
        ));
        gates.push(gate(
            'handoff',
            'Handoff Acceptance',
            s.handoff_decision === 'accepted' ? 'pass' : (s.handoff_decision === 'accepted_with_warnings' ? 'warn' : 'fail'),
            s.handoff_label_en || s.handoff_decision || 'Pending Decision',
            'Accept the handoff package or record why it is not accepted.'
        ));
        gates.push(gate(
            'release_gate',
            'Evidence Release Gate',
            s.releasable ? 'pass' : 'fail',
            (s.release_label_en || s.release_status || obj(rg).status || 'Incomplete') + ' — ' + (s.blocker_count || arr(rg.blockers).length || 0) + ' blocker(s)',
            'Open Release Gate and clear release blockers.'
        ));
        return gates;
    }
    function nextActionsFromGates(gates) {
        return arr(gates)
            .filter(function (g) { return g.status !== 'pass'; })
            .sort(function (a, b) { return gateRank(a.status) - gateRank(b.status); })
            .slice(0, 6)
            .map(function (g) {
                return {
                    key: g.key,
                    label: g.label,
                    status: g.status,
                    action: g.action,
                    detail: g.detail,
                    read_only: true
                };
            });
    }
    function confidence(gates) {
        gates = arr(gates);
        if (!gates.length) return { score: 0, label: 'Unknown', cls: 'unknown' };
        var pass = gates.filter(function (g) { return g.status === 'pass'; }).length;
        var warn = gates.filter(function (g) { return g.status === 'warn'; }).length;
        var fail = gates.filter(function (g) { return g.status === 'fail'; }).length;
        var raw = Math.round(((pass * 100) + (warn * 55)) / gates.length);
        var score = Math.max(0, Math.min(100, raw - fail * 18));
        var label = score >= 85 ? 'High' : score >= 60 ? 'Medium' : score >= 35 ? 'Low' : 'Blocked';
        return { score: score, label: label, cls: label.toLowerCase(), pass: pass, warn: warn, fail: fail };
    }

    function buildBrief(worldStateOrSnapshot, opts) {
        opts = opts || {};
        var snapshot = buildSnapshot(worldStateOrSnapshot, opts);
        var gates = buildGates(snapshot, opts);
        var decision = decisionFromGates(gates, opts);
        var conf = confidence(gates);
        return {
            version: CMO_WARGAME_READINESS_BRIEF_VERSION,
            generated_at: opts.generated_at || obj(snapshot).generated_at || new Date().toISOString(),
            scenario_fingerprint: obj(snapshot.summary).scenario_fingerprint || snapshot.scenario_fingerprint || 'unknown',
            decision: decision,
            decision_label_en: decisionLabel(decision),
            decision_label_ar: decisionArabic(decision),
            confidence: conf,
            gates: gates,
            release_blockers: releaseBlockerDigest(snapshot),
            checklist: checklistDigest(snapshot),
            next_actions: nextActionsFromGates(gates),
            snapshot_summary: obj(snapshot.summary),
            source: 'Scenario Evidence Flow Snapshot + CMO war-game readiness policy',
            read_only: true
        };
    }
    function summaryText(brief) {
        brief = brief && brief.version ? brief : buildBrief(brief || null);
        var lines = [
            'CMO War-Game Readiness Brief',
            '',
            'Decision: ' + (brief.decision_label_en || brief.decision || 'NO-GO'),
            'Confidence: ' + obj(brief.confidence).label + ' (' + (obj(brief.confidence).score || 0) + '%)',
            'Scenario fingerprint: ' + (brief.scenario_fingerprint || 'unknown'),
            '',
            'Gates:'
        ];
        arr(brief.gates).forEach(function (g) {
            lines.push('- [' + String(g.status || 'warn').toUpperCase() + '] ' + g.label + ': ' + g.detail);
        });
        if (arr(brief.next_actions).length) {
            lines.push('');
            lines.push('Next actions:');
            arr(brief.next_actions).forEach(function (a) { lines.push('- ' + a.action); });
        }
        lines.push('');
        lines.push('Read-only brief. It does not run, commit, release, mutate doctrine, or change scenario state.');
        return lines.join('\n');
    }
    function renderBriefHtml(brief) {
        brief = brief && brief.version ? brief : buildBrief(brief || null);
        var conf = obj(brief.confidence);
        var html = '<div class="cmo-wargame-readiness cmo-wargame-readiness--' + esc(brief.decision || 'no_go') + '">' +
            '<div class="cmo-wargame-readiness-header">' +
                '<span>CMO War-Game Readiness</span>' +
                '<span dir="rtl">جاهزية اختبار المناورة</span>' +
                '<strong>' + esc(brief.decision_label_en || brief.decision || 'NO-GO') + '</strong>' +
                '<small dir="rtl">' + esc(brief.decision_label_ar || '') + '</small>' +
            '</div>' +
            '<dl class="cmo-wargame-readiness-meta">' +
                '<div><dt>Confidence</dt><dd>' + esc(conf.label || 'Unknown') + ' (' + esc(conf.score || 0) + '%)</dd></div>' +
                '<div><dt>Fingerprint</dt><dd><code>' + esc(brief.scenario_fingerprint || 'unknown') + '</code></dd></div>' +
                '<div><dt>Release blockers</dt><dd>' + esc(arr(brief.release_blockers).length) + '</dd></div>' +
            '</dl>' +
            '<ol class="cmo-wargame-readiness-gates">';
        arr(brief.gates).forEach(function (g) {
            html += '<li class="cmo-wargame-readiness-gate cmo-wargame-readiness-gate--' + esc(g.status || 'warn') + '">' +
                '<strong>' + esc(g.label) + '</strong><span>' + esc(g.detail) + '</span></li>';
        });
        html += '</ol>';
        if (arr(brief.next_actions).length) {
            html += '<div class="cmo-wargame-readiness-next"><strong>Next actions</strong><ul>';
            arr(brief.next_actions).forEach(function (a) { html += '<li>' + esc(a.action || a.label) + '</li>'; });
            html += '</ul></div>';
        }
        html += '<div class="cmo-wargame-readiness-source">Source: ' + esc(brief.source || '') + '. Read-only.</div></div>';
        return html;
    }

    var api = {
        CMO_WARGAME_READINESS_BRIEF_VERSION: CMO_WARGAME_READINESS_BRIEF_VERSION,
        buildBrief: buildBrief,
        buildGates: buildGates,
        nextActionsFromGates: nextActionsFromGates,
        summaryText: summaryText,
        renderBriefHtml: renderBriefHtml
    };

    root.RmoozCmoWarGameReadinessBrief = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
