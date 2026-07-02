/* ============================================================================
 * scenario-evidence-repair-planner.js - RMOOZ-QA-36..40 evidence repair planner
 * ----------------------------------------------------------------------------
 * Read-only GUIDANCE layer. Turns each evidence gap surfaced by the review queue
 * into a step-by-step repair PLAN, ranks gaps by priority, summarises Objective X
 * repair readiness, and exports the plan as JSON/text. It NEVER mutates the
 * scenario, world state, doctrine, or combat — it only explains how an operator
 * could repair the evidence themselves. No backend, no auto-fix, no revival of
 * any removed scenario-import flow.
 *
 * Distinct from cmo-blocker-remediation.js: that module remediates tactical
 * MATRIX blocker codes (out_of_range/winchester/weapons_hold…); this planner
 * repairs SCENARIO EVIDENCE gaps (no_contact_evidence/missing_weapon/doctrine_
 * unknown/missing_coordinates/objective_*) at the authoring level.
 * ========================================================================== */
(function (root) {
    'use strict';

    var SCENARIO_EVIDENCE_REPAIR_PLANNER_VERSION = '1.0.0-rmooz-qa-36';

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

    function reviewQueueApi() { return localApi('RmoozScenarioEvidenceReviewQueue', 'scenario-evidence-review-queue.js'); }
    function objectiveApi()   { return localApi('RmoozObjectiveXEvidenceHealth',     'objective-x-evidence-health.js'); }
    function matrixApi()      { return localApi('RmoozCmoEvidenceReadinessMatrix',    'cmo-evidence-readiness-matrix.js'); }

    /* ── QA-36: repair steps per evidence reason (read-only guidance) ──────── */
    function step(en, ar) { return { en: en, ar: ar }; }
    var REPAIR_STEPS = {
        no_contact_evidence: [
            step('Confirm sensor coverage for this unit\'s side.', 'تأكد من تغطية أجهزة الاستشعار لجهة الوحدة.'),
            step('Add or derive contact evidence for the nearest opposing unit.', 'أضف أو استنتج دليل اتصال لأقرب وحدة معادية.'),
            step('Mark the contact source (radar / manual / unknown).', 'حدد مصدر الاتصال (رادار / يدوي / غير معروف).'),
            step('Re-run the scenario evidence completeness check.', 'أعد فحص اكتمال أدلة السيناريو.')
        ],
        no_weapon_evidence: [
            step('Confirm the unit\'s platform/type carries a weapon system.', 'تأكد من أن منصة الوحدة تحمل نظام تسليح.'),
            step('Assign a weapon, or mark the unit as unarmed / observer.', 'عيّن سلاحاً أو حدد الوحدة كغير مسلحة / مراقب.'),
            step('Re-run the completeness check.', 'أعد فحص الاكتمال.')
        ],
        missing_weapon: [
            step('Confirm the unit\'s platform/type carries a weapon system.', 'تأكد من أن منصة الوحدة تحمل نظام تسليح.'),
            step('Assign a weapon, or mark the unit as unarmed / observer.', 'عيّن سلاحاً أو حدد الوحدة كغير مسلحة / مراقب.'),
            step('Re-run the completeness check.', 'أعد فحص الاكتمال.')
        ],
        no_engagement_evidence: [
            step('Verify the unit has a valid target and a weapon in range.', 'تحقق من وجود هدف صالح وسلاح ضمن المدى.'),
            step('Derive engagement-candidate evidence for the unit.', 'استنتج دليل مرشح اشتباك للوحدة.'),
            step('Re-run the completeness check.', 'أعد فحص الاكتمال.')
        ],
        missing_range: [
            step('Compare the weapon\'s maximum range with the target distance.', 'قارن المدى الأقصى للسلاح بمسافة الهدف.'),
            step('Reposition the unit or target, or annotate out-of-range as intended.', 'أعد تموضع الوحدة أو الهدف، أو وثّق الخروج عن المدى كأمر مقصود.'),
            step('Re-run the completeness check.', 'أعد فحص الاكتمال.')
        ],
        doctrine_unknown: [
            step('Assign a doctrine / behaviour profile to the unit.', 'عيّن مذهباً / ملف سلوك للوحدة.'),
            step('Or mark doctrine as not-applicable for this scenario.', 'أو حدد المذهب كغير منطبق على هذا السيناريو.'),
            step('Re-run the completeness check.', 'أعد فحص الاكتمال.')
        ],
        missing_coordinates: [
            step('Place the unit on the map (set latitude / longitude).', 'ضع الوحدة على الخريطة (حدد خط العرض / الطول).'),
            step('Verify the coordinates fall within the operational area.', 'تحقق من وقوع الإحداثيات ضمن منطقة العمليات.'),
            step('Re-run the completeness check.', 'أعد فحص الاكتمال.')
        ],
        missing_side: [
            step('Assign the unit to a side (RED or BLUE).', 'عيّن الوحدة لجهة (أحمر أو أزرق).'),
            step('Verify the side matches the order of battle.', 'تحقق من تطابق الجهة مع تشكيل القوة.'),
            step('Re-run the completeness check.', 'أعد فحص الاكتمال.')
        ],
        missing_role: [
            step('Set the unit\'s role / type / domain.', 'حدد دور / نوع / مجال الوحدة.'),
            step('Re-run the completeness check.', 'أعد فحص الاكتمال.')
        ],
        /* Objective X health checks (reasons prefixed objective_) */
        objective_objective_exists: [
            step('Define Objective X (name and coordinates).', 'عرّف الهدف X (الاسم والإحداثيات).')
        ],
        objective_red_units_exist: [
            step('Add RED force units to the scenario.', 'أضف وحدات القوة الحمراء إلى السيناريو.')
        ],
        objective_blue_units_exist: [
            step('Add BLUE force units to the scenario.', 'أضف وحدات القوة الزرقاء إلى السيناريو.')
        ],
        objective_contacts_derived: [
            step('Ensure at least one unit has contact evidence (see contact repairs).', 'تأكد من وجود دليل اتصال لوحدة واحدة على الأقل (راجع إصلاحات الاتصال).')
        ],
        objective_engagement_candidates: [
            step('Ensure at least one unit is Ready or Blocked with a target.', 'تأكد من أن وحدة واحدة على الأقل جاهزة أو محجوبة مع هدف.')
        ],
        objective_matrix_can_populate: [
            step('Ensure units carry uid + side so the readiness matrix can build rows.', 'تأكد من أن الوحدات تحمل معرفاً وجهة حتى تتمكن مصفوفة الجاهزية من البناء.')
        ]
    };

    function stepsFor(reason) {
        if (REPAIR_STEPS[reason]) return REPAIR_STEPS[reason];
        return [ step('Review the scenario data for this field and re-run the completeness check.',
            'راجع بيانات السيناريو لهذا الحقل وأعد فحص الاكتمال.') ];
    }

    /* ── QA-38: priority ranking (1 = most critical) ───────────────────────── */
    var PRIORITY = {
        // Structural / force-level — nothing else works without these.
        missing_side: 1, missing_coordinates: 1,
        objective_objective_exists: 1, objective_red_units_exist: 1,
        objective_blue_units_exist: 1, objective_matrix_can_populate: 1,
        // Detection — needed before engagement can be assessed.
        no_contact_evidence: 2, objective_contacts_derived: 2, missing_role: 2,
        // Engagement capability.
        no_weapon_evidence: 3, missing_weapon: 3, no_engagement_evidence: 3,
        objective_engagement_candidates: 3, missing_range: 3,
        // Advisory.
        doctrine_unknown: 4, no_sensor_evidence: 4
    };
    var PRIORITY_LABEL = {
        1: { en: 'Critical', ar: 'حرج' },
        2: { en: 'High',     ar: 'عالٍ' },
        3: { en: 'Medium',   ar: 'متوسط' },
        4: { en: 'Low',      ar: 'منخفض' }
    };
    function priorityOf(reason) { return PRIORITY[reason] || 3; }

    /* ── QA-40: Objective X repair readiness ───────────────────────────────── */
    function buildObjectiveReadiness(health) {
        health = obj(health);
        var failing = arr(health.checks).filter(function (c) { return c && c.pass === false; }).map(function (c) {
            var reason = 'objective_' + c.key;
            return {
                key: c.key,
                reason: reason,
                label_en: c.label_en || c.key,
                label_ar: c.label_ar || null,
                steps: stepsFor(reason)
            };
        });
        var pct = (health.health_score == null) ? null : health.health_score;
        return {
            health_pct: pct,
            ready: failing.length === 0,
            failing_count: failing.length,
            failing: failing
        };
    }

    function buildRepairPlan(worldStateOrProvider, opts) {
        opts = opts || {};
        var ws = (typeof worldStateOrProvider === 'function') ? worldStateOrProvider() : worldStateOrProvider;
        var MX = matrixApi();
        var RQ = reviewQueueApi();
        var OH = objectiveApi();

        var matrix = opts.matrix || (MX && typeof MX.buildMatrix === 'function'
            ? MX.buildMatrix(ws, { limit: opts.limit || 80 })
            : { rows: [] });
        // Build Objective X health ONCE and feed it to the review queue too, so the
        // objective_readiness banner and the objective_* repair cards can never drift.
        var health = opts.objective_health || (OH && typeof OH.buildObjectiveHealth === 'function'
            ? OH.buildObjectiveHealth(ws, { matrix: matrix })
            : { checks: [], health_score: null });
        var reviewQueue = opts.review_queue || (RQ && typeof RQ.buildReviewQueue === 'function'
            ? RQ.buildReviewQueue(ws, { matrix: matrix, objective_health: health })
            : { groups: [], total_issues: 0 });

        var plans = [];
        arr(reviewQueue.groups).forEach(function (group) {
            arr(group.issues).forEach(function (issue) {
                var reason = issue.reason;
                var prio = priorityOf(reason);
                plans.push({
                    uid: issue.uid || null,
                    label: issue.label || issue.uid || null,
                    side: issue.side || null,
                    reason: reason,
                    reason_label_ar: issue.reason_label_ar || null,
                    group: issue.group || group.key,
                    priority: prio,
                    priority_label_en: PRIORITY_LABEL[prio].en,
                    priority_label_ar: PRIORITY_LABEL[prio].ar,
                    steps: stepsFor(reason)
                });
            });
        });
        // QA-38: rank by priority (critical first), then group, then uid.
        plans.sort(function (a, b) {
            if (a.priority !== b.priority) return a.priority - b.priority;
            if (a.group !== b.group) return String(a.group).localeCompare(String(b.group));
            return String(a.uid || '').localeCompare(String(b.uid || ''));
        });

        var byPriority = { critical: 0, high: 0, medium: 0, low: 0 };
        plans.forEach(function (p) {
            if (p.priority === 1) byPriority.critical++;
            else if (p.priority === 2) byPriority.high++;
            else if (p.priority === 3) byPriority.medium++;
            else byPriority.low++;
        });

        return {
            version: SCENARIO_EVIDENCE_REPAIR_PLANNER_VERSION,
            generated_at: opts.generated_at || new Date().toISOString(),
            total_repairs: plans.length,
            by_priority: byPriority,
            plans: plans,
            objective_readiness: buildObjectiveReadiness(health),
            source: 'Review queue + Objective X health — read-only repair guidance'
        };
    }

    /* ── QA-39: export as text / JSON ──────────────────────────────────────── */
    function buildText(plan) {
        plan = obj(plan);
        var lines = ['Scenario Evidence Repair Plan', ''];
        var bp = obj(plan.by_priority);
        lines.push('Repairs: ' + (plan.total_repairs || 0) +
            '  (critical ' + (bp.critical || 0) + ' / high ' + (bp.high || 0) +
            ' / medium ' + (bp.medium || 0) + ' / low ' + (bp.low || 0) + ')');
        var orr = obj(plan.objective_readiness);
        lines.push('Objective X readiness: ' + (orr.health_pct == null ? 'unknown' : orr.health_pct + '%') +
            (orr.ready ? ' (ready)' : ' (' + (orr.failing_count || 0) + ' check(s) to repair)'));
        lines.push('');
        arr(plan.plans).forEach(function (p, i) {
            var who = p.uid || p.label || 'Objective';
            lines.push((i + 1) + '. [' + p.priority_label_en + '] ' + who + ' — ' + p.reason);
            arr(p.steps).forEach(function (s, j) {
                lines.push('     ' + (j + 1) + ') ' + s.en);
            });
        });
        lines.push('');
        lines.push('Read-only repair guidance. This plan does not modify the scenario, doctrine, or combat state.');
        lines.push('Generated: ' + (plan.generated_at || 'unknown'));
        return lines.join('\n');
    }

    function toJson(plan) { return JSON.stringify(plan || {}, null, 2); }

    function copyText(text) {
        if (!root.navigator || !root.navigator.clipboard || typeof root.navigator.clipboard.writeText !== 'function') {
            return Promise.resolve(false);
        }
        return root.navigator.clipboard.writeText(String(text == null ? '' : text)).then(function () { return true; });
    }
    function copyPlanText(plan) { return copyText(buildText(plan)); }
    function copyPlanJson(plan) { return copyText(toJson(plan)); }

    function downloadJson(plan, filename) {
        if (!root.document || typeof root.Blob !== 'function' || !root.URL || typeof root.URL.createObjectURL !== 'function') {
            return false;
        }
        var blob = new root.Blob([toJson(plan)], { type: 'application/json' });
        var url = root.URL.createObjectURL(blob);
        var a = root.document.createElement('a');
        a.href = url;
        a.download = filename || 'rmooz-evidence-repair-plan.json';
        root.document.body.appendChild(a);
        a.click();
        root.document.body.removeChild(a);
        setTimeout(function () { root.URL.revokeObjectURL(url); }, 0);
        return true;
    }

    /* ── QA-37: repair preview cards ───────────────────────────────────────── */
    function prioClass(p) { return p === 1 ? 'critical' : p === 2 ? 'high' : p === 3 ? 'medium' : 'low'; }

    function renderRepairHtml(plan, opts) {
        plan = plan || buildRepairPlan(null);
        opts = opts || {};
        var bp = obj(plan.by_priority);
        var orr = obj(plan.objective_readiness);
        var html = '<div class="usp-repair-actions">' +
            '<button type="button" class="usp-repair-btn" data-cmo-repair-action="text">Copy Text</button>' +
            '<button type="button" class="usp-repair-btn" data-cmo-repair-action="json">Copy JSON</button>' +
            '<button type="button" class="usp-repair-btn" data-cmo-repair-action="download">Download JSON</button>' +
            '</div>';
        html += '<div class="usp-repair-summary">' +
            '<span class="usp-repair-total">' + esc(plan.total_repairs || 0) + ' repair' + ((plan.total_repairs === 1) ? '' : 's') + '</span>' +
            '<span class="usp-repair-chip usp-repair-chip--critical">' + esc(bp.critical || 0) + ' critical</span>' +
            '<span class="usp-repair-chip usp-repair-chip--high">' + esc(bp.high || 0) + ' high</span>' +
            '<span class="usp-repair-chip usp-repair-chip--medium">' + esc(bp.medium || 0) + ' medium</span>' +
            '<span class="usp-repair-chip usp-repair-chip--low">' + esc(bp.low || 0) + ' low</span>' +
            '</div>';
        // QA-40 objective readiness banner
        var orrCls = orr.ready ? 'ready' : 'notready';
        html += '<div class="usp-repair-objective usp-repair-objective--' + esc(orrCls) + '">' +
            '<span class="usp-repair-obj-en">Objective X repair readiness</span>' +
            '<span class="usp-repair-obj-pct">' + (orr.health_pct == null ? '—' : esc(orr.health_pct) + '%') + '</span>' +
            '<span class="usp-repair-obj-state">' + (orr.ready ? 'Ready' : esc(orr.failing_count || 0) + ' to repair') + '</span>' +
            '</div>';
        if (!arr(plan.plans).length) {
            html += '<div class="usp-repair-empty">No repairs required. Scenario evidence is complete. / ' +
                '&#1604;&#1575; &#1578;&#1608;&#1580;&#1583; &#1573;&#1589;&#1604;&#1575;&#1581;&#1575;&#1578;</div>';
        } else {
            arr(plan.plans).forEach(function (p) {
                var who = p.uid ? esc(p.uid) : esc(p.label || 'Objective');
                html += '<div class="usp-repair-card usp-repair-card--' + esc(prioClass(p.priority)) + '">' +
                    '<div class="usp-repair-card-hdr">' +
                        '<span class="usp-repair-prio">' + esc(p.priority_label_en) + '</span>' +
                        '<span class="usp-repair-who">' + who + '</span>' +
                        '<span class="usp-repair-reason">' + esc(p.reason) + '</span>' +
                    '</div><ol class="usp-repair-steps">';
                arr(p.steps).forEach(function (s) {
                    html += '<li><span class="usp-repair-step-en">' + esc(s.en) + '</span>' +
                        '<span class="usp-repair-step-ar" dir="rtl">' + esc(s.ar) + '</span></li>';
                });
                html += '</ol></div>';
            });
        }
        html += '<div class="usp-repair-disclaimer">Read-only repair guidance. Does not modify the scenario, doctrine, or combat state.</div>';
        html += '<div class="usp-repair-source">Source: ' + esc(plan.source || '') + '</div>';
        return html;
    }

    function bindRepairActions(container, plan) {
        if (!container || !container.querySelectorAll) return false;
        Array.prototype.forEach.call(container.querySelectorAll('[data-cmo-repair-action]'), function (btn) {
            btn.addEventListener('click', function () {
                var action = btn.getAttribute('data-cmo-repair-action');
                if (action === 'text') copyPlanText(plan);
                else if (action === 'json') copyPlanJson(plan);
                else if (action === 'download') downloadJson(plan);
            });
        });
        return true;
    }

    var api = {
        SCENARIO_EVIDENCE_REPAIR_PLANNER_VERSION: SCENARIO_EVIDENCE_REPAIR_PLANNER_VERSION,
        REPAIR_STEPS: REPAIR_STEPS,
        PRIORITY: PRIORITY,
        buildRepairPlan: buildRepairPlan,
        buildText: buildText,
        toJson: toJson,
        copyPlanText: copyPlanText,
        copyPlanJson: copyPlanJson,
        downloadJson: downloadJson,
        renderRepairHtml: renderRepairHtml,
        bindRepairActions: bindRepairActions
    };

    root.RmoozScenarioEvidenceRepairPlanner = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
