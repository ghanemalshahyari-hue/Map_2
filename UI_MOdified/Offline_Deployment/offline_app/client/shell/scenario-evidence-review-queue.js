/* ============================================================================
 * scenario-evidence-review-queue.js - RMOOZ-QA-30 evidence review queue
 * ----------------------------------------------------------------------------
 * Read-only review-and-navigation layer over the scenario QA modules. Collects
 * every evidence gap found by the completeness validator, the normalizer, and
 * the Objective X health check into a grouped, clickable queue. Clicking an
 * issue resolves a drilldown intent (unit selection + matrix filter + section
 * scroll) that reuses the panel's EXISTING selection/filter flows.
 * No backend, no scenario writes, no combat/doctrine mutation, no auto-fix.
 * ========================================================================== */
(function (root) {
    'use strict';

    var SCENARIO_EVIDENCE_REVIEW_QUEUE_VERSION = '1.0.0-rmooz-qa-30';

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

    function completenessApi() { return localApi('RmoozScenarioEvidenceCompleteness', 'scenario-evidence-completeness.js'); }
    function normalizerApi()   { return localApi('RmoozScenarioEvidenceNormalizer',   'scenario-evidence-normalizer.js'); }
    function objectiveApi()    { return localApi('RmoozObjectiveXEvidenceHealth',     'objective-x-evidence-health.js'); }
    function matrixApi()       { return localApi('RmoozCmoEvidenceReadinessMatrix',   'cmo-evidence-readiness-matrix.js'); }
    function labelsApi()       { return localApi('AppCmoEvidenceLabels',              'cmo-evidence-labels.js'); }

    /* ── Reason → group + drilldown mapping ─────────────────────────────── */
    var GROUP_ORDER = ['contact', 'weapon', 'range', 'doctrine', 'coordinate_role', 'objective_x_health'];
    var GROUP_LABELS = {
        contact:            { en: 'Contact issues',            ar: 'مشاكل الاتصال' },
        weapon:             { en: 'Weapon issues',             ar: 'مشاكل السلاح' },
        range:              { en: 'Range issues',              ar: 'مشاكل المدى' },
        doctrine:           { en: 'Doctrine issues',           ar: 'مشاكل المذهب' },
        coordinate_role:    { en: 'Coordinate / role issues',  ar: 'مشاكل الإحداثيات والدور' },
        objective_x_health: { en: 'Objective X health',        ar: 'صحة الهدف' }
    };
    var REASON_GROUP = {
        no_contact_evidence:   'contact',
        missing_weapon:        'weapon',
        no_weapon_evidence:    'weapon',
        no_engagement_evidence:'weapon',
        missing_range:         'range',
        doctrine_unknown:      'doctrine',
        missing_coordinates:   'coordinate_role',
        missing_side:          'coordinate_role',
        missing_role:          'coordinate_role'
    };
    // Fields the completeness validator does NOT cover — sourced from normalizer.
    // (sensor is intentionally excluded: units rarely carry a `sensor` field, so it
    //  would fire on essentially every unit and drown out real gaps.)
    var NORM_FIELD_REASON = { doctrine: 'doctrine_unknown' };

    var REASON_LABEL_AR = {
        no_contact_evidence:    'لا يوجد دليل اتصال',
        missing_weapon:         'سلاح غير محدد',
        no_weapon_evidence:     'لا يوجد دليل سلاح',
        no_engagement_evidence: 'لا يوجد دليل اشتباك',
        missing_range:          'مدى غير معروف',
        doctrine_unknown:       'مذهب غير معروف',
        missing_coordinates:    'إحداثيات مفقودة',
        missing_side:           'الجهة غير محددة',
        missing_role:           'الدور غير محدد'
    };

    function reasonLabelAr(reason) {
        var labels = labelsApi();
        if (labels && typeof labels.reasonLabel === 'function') {
            try {
                var l = labels.reasonLabel(reason, 'ar');
                if (l && l !== reason) return l;
            } catch (_) {}
        }
        return REASON_LABEL_AR[reason] || '';
    }

    /* ── QA-31: where a given issue should send the operator ─────────────── */
    function resolveDrilldownIntent(reason) {
        switch (reason) {
            case 'no_contact_evidence':
                return { matrix_filter: { status: 'Unknown', reason_code: 'no_contact_evidence' }, select_unit: true, scroll_to: 'usp-contact-evidence-block' };
            case 'no_engagement_evidence':
                // The matrix DOES carry this reason code, so filtering is meaningful.
                return { matrix_filter: { status: 'All', reason_code: 'no_engagement_evidence' }, select_unit: true, scroll_to: 'usp-engagement-evidence-block' };
            case 'missing_weapon':
            case 'no_weapon_evidence':
                // The readiness matrix never emits these as reason codes, so a matrix
                // filter would render empty — just focus the unit + engagement section.
                return { select_unit: true, scroll_to: 'usp-engagement-evidence-block' };
            case 'missing_range':
                return { matrix_filter: { status: 'All', reason_code: 'out_of_range' }, select_unit: true, scroll_to: 'usp-chain-evidence-block' };
            case 'doctrine_unknown':
                return { select_unit: true, scroll_to: 'usp-chain-evidence-block' };
            case 'missing_coordinates':
            case 'missing_side':
            case 'missing_role':
                return { select_unit: true, scroll_to: 'usp-identity-block' };
            default:
                if (String(reason).indexOf('objective_') === 0) {
                    return { scroll_to: 'usp-objective-health-block' };
                }
                return { select_unit: true, scroll_to: null };
        }
    }

    function buildReviewQueue(worldStateOrProvider, opts) {
        opts = opts || {};
        var ws = (typeof worldStateOrProvider === 'function') ? worldStateOrProvider() : worldStateOrProvider;
        var SEV = completenessApi();
        var NORM = normalizerApi();
        var OH = objectiveApi();
        var MX = matrixApi();

        var matrix = opts.matrix || (MX && typeof MX.buildMatrix === 'function'
            ? MX.buildMatrix(ws, { limit: opts.limit || 80 })
            : { rows: [] });
        var completeness = opts.completeness || (SEV && typeof SEV.buildCompleteness === 'function'
            ? SEV.buildCompleteness(ws, { matrix: matrix })
            : { unit_results: [], needs_review: 0 });
        var health = opts.objective_health || (OH && typeof OH.buildObjectiveHealth === 'function'
            ? OH.buildObjectiveHealth(ws, { matrix: matrix })
            : { checks: [], health_score: null });
        // Normalizer is called for its non-mutating safe-copy + action list only.
        var normResult = (NORM && typeof NORM.normalizeWorldState === 'function')
            ? NORM.normalizeWorldState(ws)
            : { actions: [], fields_normalized: 0, units_affected: 0 };

        // uid → { label, side }
        var labelMap = {};
        arr(completeness.unit_results).forEach(function (u) {
            u = obj(u);
            if (u.uid) labelMap[u.uid] = { label: u.label || u.uid, side: u.side || null };
        });
        arr(obj(matrix).rows).forEach(function (r) {
            r = obj(r);
            if (r.uid && !labelMap[r.uid]) labelMap[r.uid] = { label: r.unit_label || r.uid, side: r.side || null };
        });

        var issues = [];
        var seen = {};
        function addIssue(uid, reason) {
            var group = REASON_GROUP[reason];
            if (!group) return;
            var key = (uid || '-') + '|' + reason;
            if (seen[key]) return;
            seen[key] = true;
            var info = labelMap[uid] || {};
            issues.push({
                uid: uid || null,
                label: info.label || uid || null,
                side: info.side || null,
                reason: reason,
                reason_label_ar: reasonLabelAr(reason),
                group: group
            });
        }

        // 1. Completeness-detected issues (contact / weapon / range / coord / side / role / engagement).
        arr(completeness.unit_results).forEach(function (u) {
            u = obj(u);
            arr(u.issues).forEach(function (reason) { addIssue(u.uid, reason); });
        });
        // 2. Normalizer-only fields not covered by completeness (doctrine / sensor).
        arr(normResult.actions).forEach(function (a) {
            a = obj(a);
            var reason = NORM_FIELD_REASON[a.field];
            if (reason) addIssue(a.uid, reason);
        });
        // 3. Objective X health failures (force-level, no unit).
        arr(health.checks).forEach(function (c) {
            c = obj(c);
            if (c.pass) return;
            issues.push({
                uid: null,
                label: c.label_en || c.key,
                label_ar: c.label_ar || null,
                side: null,
                reason: 'objective_' + c.key,
                reason_label_ar: c.label_ar || '',
                group: 'objective_x_health'
            });
        });

        var groups = GROUP_ORDER.map(function (g) {
            var groupIssues = issues.filter(function (i) { return i.group === g; });
            return {
                key: g,
                label_en: GROUP_LABELS[g].en,
                label_ar: GROUP_LABELS[g].ar,
                count: groupIssues.length,
                issues: groupIssues
            };
        }).filter(function (g) { return g.count > 0; });

        var flagged = {};
        issues.forEach(function (i) { if (i.uid) flagged[i.uid] = true; });

        return {
            version: SCENARIO_EVIDENCE_REVIEW_QUEUE_VERSION,
            generated_at: opts.generated_at || new Date().toISOString(),
            total_issues: issues.length,
            needs_review: completeness.needs_review || 0,
            units_flagged: Object.keys(flagged).length,
            group_count: groups.length,
            groups: groups,
            objective_health_pct: health.health_score,
            normalization: {
                fields_normalized: normResult.fields_normalized || 0,
                units_affected: normResult.units_affected || 0
            },
            source: 'Completeness + normalizer + Objective X health'
        };
    }

    function renderQueueHtml(queue, opts) {
        queue = queue || buildReviewQueue(null);
        opts = opts || {};
        var groups = arr(queue.groups);
        var html = '<div class="usp-queue-header">' +
            '<span class="usp-queue-title-en">Scenario Evidence Review Queue</span>' +
            '<span class="usp-queue-title-ar" dir="rtl">قائمة مراجعة أدلة السيناريو</span>' +
            '<span class="usp-queue-count">' + esc(queue.total_issues || 0) + ' issue' + ((queue.total_issues === 1) ? '' : 's') + '</span>' +
            '</div>';
        if (!groups.length) {
            html += '<div class="usp-queue-empty">No evidence issues found. Scenario evidence is complete. / ' +
                '&#1604;&#1575; &#1578;&#1608;&#1580;&#1583; &#1605;&#1588;&#1575;&#1603;&#1604;</div>';
            html += '<div class="usp-queue-source">Source: ' + esc(queue.source || '') + '</div>';
            return html;
        }
        groups.forEach(function (g) {
            html += '<div class="usp-queue-group">' +
                '<div class="usp-queue-group-hdr">' +
                    '<span class="usp-queue-group-en">' + esc(g.label_en) + '</span>' +
                    '<span class="usp-queue-group-ar" dir="rtl">' + esc(g.label_ar) + '</span>' +
                    '<span class="usp-queue-group-count">' + esc(g.count) + '</span>' +
                '</div><ul class="usp-queue-list">';
            arr(g.issues).forEach(function (issue) {
                var who = issue.uid ? esc(issue.uid) : esc(issue.label || 'Objective');
                var ar = issue.reason_label_ar ? '<span class="usp-queue-reason-ar" dir="rtl">' + esc(issue.reason_label_ar) + '</span>' : '';
                html += '<li><button type="button" class="usp-queue-issue" ' +
                    'data-cmo-queue-issue="1" ' +
                    'data-cmo-queue-uid="' + esc(issue.uid || '') + '" ' +
                    'data-cmo-queue-reason="' + esc(issue.reason) + '">' +
                    '<span class="usp-queue-uid">' + who + '</span>' +
                    '<span class="usp-queue-reason">' + esc(issue.reason) + '</span>' + ar +
                    '</button></li>';
            });
            html += '</ul></div>';
        });
        html += '<div class="usp-queue-source">Source: ' + esc(queue.source || '') + '</div>';
        return html;
    }

    function findIssue(queue, uid, reason) {
        var groups = arr(obj(queue).groups);
        for (var g = 0; g < groups.length; g++) {
            var list = arr(groups[g].issues);
            for (var i = 0; i < list.length; i++) {
                var it = list[i];
                if ((it.uid || '') === (uid || '') && it.reason === reason) return it;
            }
        }
        return { uid: uid || null, reason: reason };
    }

    function bindQueueInteractions(container, queue, opts) {
        opts = opts || {};
        if (!container || !container.querySelectorAll) return false;
        Array.prototype.forEach.call(container.querySelectorAll('[data-cmo-queue-issue]'), function (btn) {
            btn.addEventListener('click', function () {
                var uid = btn.getAttribute('data-cmo-queue-uid') || '';
                var reason = btn.getAttribute('data-cmo-queue-reason') || '';
                var issue = findIssue(queue, uid, reason);
                var intent = resolveDrilldownIntent(reason);
                if (opts.onSelectIssue && typeof opts.onSelectIssue === 'function') {
                    try { opts.onSelectIssue(issue, intent); } catch (_) {}
                }
            });
        });
        return true;
    }

    var api = {
        SCENARIO_EVIDENCE_REVIEW_QUEUE_VERSION: SCENARIO_EVIDENCE_REVIEW_QUEUE_VERSION,
        GROUP_ORDER: GROUP_ORDER,
        REASON_GROUP: REASON_GROUP,
        buildReviewQueue: buildReviewQueue,
        resolveDrilldownIntent: resolveDrilldownIntent,
        renderQueueHtml: renderQueueHtml,
        bindQueueInteractions: bindQueueInteractions
    };

    root.RmoozScenarioEvidenceReviewQueue = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
