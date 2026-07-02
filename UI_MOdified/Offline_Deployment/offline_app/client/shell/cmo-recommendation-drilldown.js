/* ============================================================================
 * cmo-recommendation-drilldown.js - RMOOZ-CMO-17 recommendation drilldown
 * ----------------------------------------------------------------------------
 * Read-only per-unit drilldown into the primary evidence blocker. Provides
 * step-by-step contextual checks for the active reason code, built from
 * existing CMO evidence. No backend routes, state mutation, combat triggers,
 * or doctrine edits.
 * ========================================================================== */
(function (root) {
    'use strict';

    var CMO_RECOMMENDATION_DRILLDOWN_VERSION = '1.0.0-rmooz-cmo-17';

    var DRILLDOWN_CONTEXT = {
        out_of_range: {
            title_en: 'Target Out of Weapon Range',
            title_ar: 'الهدف خارج نطاق السلاح',
            context_en: 'The shooter cannot reach the target with available weapons. Check range, weapon selection, and target position.',
            context_ar: 'لا يستطيع الرامي الوصول إلى الهدف بالأسلحة المتاحة.',
            checks: [
                { en: 'Verify target coordinates are current and accurate.', ar: 'تحقق من دقة إحداثيات الهدف.' },
                { en: 'Compare weapon max_range against target distance in engagement evidence.', ar: 'قارن الحد الأقصى لمدى السلاح بمسافة الهدف.' },
                { en: 'Consider an alternative shooter with longer range from the matrix.', ar: 'فكر في رامٍ بديل بمدى أطول.' },
                { en: 'Review whether repositioning the shooter unit is feasible.', ar: 'راجع إمكانية إعادة تمركز الوحدة.' }
            ]
        },
        no_contact_evidence: {
            title_en: 'No Contact Evidence',
            title_ar: 'لا توجد أدلة رصد',
            context_en: 'No current contact track exists for the target. The sensor chain has not produced a valid track.',
            context_ar: 'لا يوجد مسار رصد حالي للهدف.',
            checks: [
                { en: 'Check sensor-to-target line-of-sight in the scenario.', ar: 'تحقق من خط الرؤية بين المستشعر والهدف.' },
                { en: 'Confirm a detection-capable sensor unit is in range of the target.', ar: 'تأكد وجود وحدة استشعار في النطاق.' },
                { en: 'Refresh the scenario step to update contact data.', ar: 'تقدم في خطوات السيناريو لتحديث بيانات الرصد.' },
                { en: 'Review scenario generation for correct sensor placement.', ar: 'راجع توليد السيناريو للتحقق من تمركز المستشعرات.' }
            ]
        },
        stale_contact: {
            title_en: 'Stale Contact Track',
            title_ar: 'مسار رصد قديم',
            context_en: 'The contact track is outdated. The target may have moved since last detection.',
            context_ar: 'مسار الرصد غير حديث. قد يكون الهدف قد تحرك.',
            checks: [
                { en: 'Step the scenario forward to refresh contact tracks.', ar: 'تقدم في السيناريو لتحديث مسارات الرصد.' },
                { en: 'Verify sensor units are still covering the target area.', ar: 'تأكد أن وحدات الاستشعار لا تزال تغطي منطقة الهدف.' },
                { en: 'Use a secondary sensor source if available.', ar: 'استخدم مصدر استشعار ثانوياً إن توفر.' }
            ]
        },
        weapons_hold: {
            title_en: 'Weapons Hold',
            title_ar: 'تعليق النيران',
            context_en: 'The unit is under weapons hold. Engagement is restricted by doctrine or ROE.',
            context_ar: 'الوحدة تحت أمر تعليق الأسلحة.',
            checks: [
                { en: 'Confirm whether weapons hold is intentional for this unit.', ar: 'تأكد إذا كان تعليق النيران مقصوداً لهذه الوحدة.' },
                { en: 'Review ROE settings in the scenario step.', ar: 'راجع إعدادات قواعد الاشتباك في خطوة السيناريو.' },
                { en: 'Check doctrine tags for engagement authorization.', ar: 'تحقق من وسوم العقيدة للحصول على إذن الاشتباك.' }
            ]
        },
        winchester: {
            title_en: 'Winchester — No Ammunition',
            title_ar: 'وينشستر — لا ذخيرة',
            context_en: 'The unit has expended all available ammunition and cannot engage.',
            context_ar: 'استنفدت الوحدة كل ذخيرتها.',
            checks: [
                { en: 'Check the ammunition / magazine status in the unit panel.', ar: 'تحقق من حالة الذخيرة في لوحة الوحدة.' },
                { en: 'Select an alternative shooter from the readiness matrix.', ar: 'اختر رامياً بديلاً من مصفوفة الجاهزية.' },
                { en: 'Consider resupply or rearm before re-engaging.', ar: 'فكر في إعادة التزود أو إعادة التسليح.' }
            ]
        },
        no_fire_control_channel: {
            title_en: 'No Fire-Control Channel',
            title_ar: 'لا يوجد قناة تحكم بالنيران',
            context_en: 'The unit lacks a valid fire-control data link to engage the target.',
            context_ar: 'تفتقر الوحدة إلى رابط بيانات تحكم بالنيران صالح.',
            checks: [
                { en: 'Check fire-control capability in the unit weapons tab.', ar: 'تحقق من قدرة التحكم بالنيران في علامة الأسلحة.' },
                { en: 'Verify target tracking quality in the engagement evidence.', ar: 'تحقق من جودة تتبع الهدف في أدلة الاشتباك.' },
                { en: 'Consider another shooter with a fire-control capability.', ar: 'فكر في رامٍ آخر لديه قناة تحكم بالنيران.' }
            ]
        },
        no_valid_target: {
            title_en: 'No Valid Target',
            title_ar: 'لا يوجد هدف صالح',
            context_en: 'The target does not meet engagement criteria — identity, classification, or ROE.',
            context_ar: 'الهدف لا يستوفي معايير الاشتباك.',
            checks: [
                { en: 'Confirm target identity and classification in contact evidence.', ar: 'تأكد من هوية الهدف وتصنيفه في أدلة الرصد.' },
                { en: 'Review whether the target side is eligible under ROE.', ar: 'راجع ما إذا كان جانب الهدف مؤهلاً بموجب قواعد الاشتباك.' },
                { en: 'Check doctrine tags for valid-target criteria.', ar: 'تحقق من وسوم العقيدة لمعايير الهدف الصالح.' }
            ]
        },
        unknown: {
            title_en: 'Evidence Review Required',
            title_ar: 'مراجعة الأدلة مطلوبة',
            context_en: 'Review all available evidence fields for this unit before engagement.',
            context_ar: 'راجع جميع حقول الأدلة المتاحة.',
            checks: [
                { en: 'Check contact, weapon, range, ammo, and doctrine fields.', ar: 'تحقق من حقول الرصد والسلاح والمدى والذخيرة والعقيدة.' },
                { en: 'Review the decision chain for the primary blocker.', ar: 'راجع سلسلة القرار لتحديد الحاصر الرئيسي.' }
            ]
        }
    };

    DRILLDOWN_CONTEXT.unknown_reason = DRILLDOWN_CONTEXT.unknown;
    DRILLDOWN_CONTEXT.no_engagement_evidence = DRILLDOWN_CONTEXT.unknown;
    DRILLDOWN_CONTEXT.no_engagement_solution = DRILLDOWN_CONTEXT.unknown;
    DRILLDOWN_CONTEXT.target_not_detected = DRILLDOWN_CONTEXT.no_contact_evidence;
    DRILLDOWN_CONTEXT.undetected = DRILLDOWN_CONTEXT.no_contact_evidence;
    DRILLDOWN_CONTEXT.no_detection = DRILLDOWN_CONTEXT.no_contact_evidence;

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

    function labelsApi() { return localApi('AppCmoEvidenceLabels', 'cmo-evidence-labels.js'); }
    function recApi()    { return localApi('RmoozCmoEvidenceRecommendations', 'cmo-evidence-recommendations.js'); }

    function reasonLabel(code, lang) {
        var labels = labelsApi();
        if (labels && typeof labels.reasonLabel === 'function') {
            try { return labels.reasonLabel(code || 'unknown', lang || 'en'); } catch (_) {}
        }
        return code || 'unknown';
    }

    function buildDrilldown(evidence, opts) {
        opts = opts || {};
        evidence = obj(evidence);
        var REC = recApi();
        var recs = (REC && typeof REC.buildRecommendations === 'function')
            ? REC.buildRecommendations(evidence)
            : { recommendations: [], reason_code: 'unknown', final_status: 'Unknown' };
        var reasonCode = recs.reason_code || 'unknown';
        var ctx = DRILLDOWN_CONTEXT[reasonCode] || DRILLDOWN_CONTEXT.unknown;
        return {
            version: CMO_RECOMMENDATION_DRILLDOWN_VERSION,
            unit_uid: evidence.unit_uid || opts.uid || null,
            final_status: recs.final_status,
            reason_code: reasonCode,
            reason_label_en: reasonLabel(reasonCode, 'en'),
            reason_label_ar: reasonLabel(reasonCode, 'ar'),
            title_en: ctx.title_en,
            title_ar: ctx.title_ar,
            context_en: ctx.context_en,
            context_ar: ctx.context_ar,
            checks: arr(ctx.checks),
            recommendations: arr(recs.recommendations),
            source: recs.source || 'Decision-chain derived evidence'
        };
    }

    function renderDrilldownHtml(drilldown, opts) {
        opts = opts || {};
        var d = drilldown || buildDrilldown(null);
        var checks = arr(d.checks);
        if (!checks.length) {
            return '<div class="usp-drilldown-empty">No drilldown available for the current evidence state.</div>';
        }
        var html = '<div class="usp-drilldown-header">';
        html += '<span class="usp-drilldown-title">' + esc(d.title_en) + '</span>';
        if (d.title_ar) html += '<span class="usp-drilldown-title-ar" dir="rtl"> / ' + esc(d.title_ar) + '</span>';
        html += '</div>';
        if (d.context_en) html += '<div class="usp-drilldown-context">' + esc(d.context_en) + '</div>';
        html += '<ol class="usp-drilldown-list">';
        checks.forEach(function (c) {
            html += '<li><span class="usp-drilldown-check-en">' + esc(c.en || '') + '</span>';
            if (c.ar) html += '<br><span class="usp-drilldown-check-ar" dir="rtl">' + esc(c.ar) + '</span>';
            html += '</li>';
        });
        html += '</ol>';
        html += '<div class="usp-drilldown-source">Source: ' + esc(d.source || 'evidence-derived') + '</div>';
        return html;
    }

    var api = {
        CMO_RECOMMENDATION_DRILLDOWN_VERSION: CMO_RECOMMENDATION_DRILLDOWN_VERSION,
        DRILLDOWN_CONTEXT: DRILLDOWN_CONTEXT,
        buildDrilldown: buildDrilldown,
        renderDrilldownHtml: renderDrilldownHtml
    };

    root.RmoozCmoRecommendationDrilldown = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
