/* ============================================================================
 * cmo-blocker-remediation.js - RMOOZ-CMO-19 blocker remediation guide
 * ----------------------------------------------------------------------------
 * Read-only aggregation of blocked units by reason code, with operator-facing
 * remediation steps. Derived from the readiness matrix and recommendations
 * modules — no backend routes, state mutation, combat triggers, or doctrine edits.
 * ========================================================================== */
(function (root) {
    'use strict';

    var CMO_BLOCKER_REMEDIATION_VERSION = '1.0.0-rmooz-cmo-19';

    var REMEDIATION_STEPS = {
        out_of_range: [
            { en: 'Select an alternative shooter from the ready units panel.', ar: 'اختر رامياً بديلاً من لوحة الوحدات الجاهزة.' },
            { en: 'Verify target coordinates for accuracy before re-checking range.', ar: 'تحقق من دقة إحداثيات الهدف قبل إعادة فحص المدى.' },
            { en: 'Review unit reposition options in the scenario workspace.', ar: 'راجع خيارات إعادة تمركز الوحدة في مساحة عمل السيناريو.' }
        ],
        no_contact_evidence: [
            { en: 'Step the scenario forward to generate new contact detections.', ar: 'تقدم في السيناريو لتوليد اكتشافات رصد جديدة.' },
            { en: 'Ensure a sensor-capable unit is within detection range of the target.', ar: 'تأكد وجود وحدة قادرة على الاستشعار ضمن نطاق الكشف.' },
            { en: 'Review sensor placement in the scenario step detail.', ar: 'راجع تمركز المستشعرات في تفاصيل خطوة السيناريو.' }
        ],
        stale_contact: [
            { en: 'Advance the scenario to refresh sensor tracks.', ar: 'تقدم في السيناريو لتحديث مسارات الاستشعار.' },
            { en: 'Confirm the sensor unit has not moved out of effective range.', ar: 'تأكد أن وحدة الاستشعار لم تخرج من نطاق الفعالية.' }
        ],
        weapons_hold: [
            { en: 'Review the ROE and doctrine tags for this unit.', ar: 'راجع قواعد الاشتباك والوسوم العقائدية لهذه الوحدة.' },
            { en: 'Confirm weapons hold is intentional and not a scenario error.', ar: 'تأكد أن تعليق النيران مقصود وليس خطأً في السيناريو.' }
        ],
        winchester: [
            { en: 'Assign an alternative shooter with remaining ammunition.', ar: 'عيّن رامياً بديلاً لديه ذخيرة متبقية.' },
            { en: 'Check scenario step for resupply or rearm events.', ar: 'تحقق من خطوة السيناريو لأحداث إعادة التزود.' }
        ],
        no_fire_control_channel: [
            { en: 'Verify that the unit has a fire-control capable weapon loaded.', ar: 'تأكد أن الوحدة لديها سلاح مجهز بقدرة تحكم بالنيران.' },
            { en: 'Check target track quality in the engagement evidence panel.', ar: 'تحقق من جودة تتبع الهدف في لوحة أدلة الاشتباك.' }
        ],
        no_valid_target: [
            { en: 'Confirm target classification and identity in contact evidence.', ar: 'أكد تصنيف الهدف وهويته في أدلة الرصد.' },
            { en: 'Review ROE for target eligibility criteria.', ar: 'راجع قواعد الاشتباك لمعايير أهلية الهدف.' }
        ],
        unknown: [
            { en: 'Open the unit panel and review all evidence fields in order.', ar: 'افتح لوحة الوحدة وراجع جميع حقول الأدلة بالترتيب.' },
            { en: 'Check the decision chain evidence for the primary blocker.', ar: 'تحقق من أدلة سلسلة القرار لتحديد الحاصر الرئيسي.' }
        ]
    };

    REMEDIATION_STEPS.unknown_reason = REMEDIATION_STEPS.unknown;
    REMEDIATION_STEPS.no_engagement_evidence = REMEDIATION_STEPS.unknown;
    REMEDIATION_STEPS.target_not_detected = REMEDIATION_STEPS.no_contact_evidence;
    REMEDIATION_STEPS.undetected = REMEDIATION_STEPS.no_contact_evidence;
    REMEDIATION_STEPS.no_detection = REMEDIATION_STEPS.no_contact_evidence;

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

    function matrixApi() { return localApi('RmoozCmoEvidenceReadinessMatrix', 'cmo-evidence-readiness-matrix.js'); }
    function labelsApi() { return localApi('AppCmoEvidenceLabels', 'cmo-evidence-labels.js'); }

    function reasonLabel(code, lang) {
        var labels = labelsApi();
        if (labels && typeof labels.reasonLabel === 'function') {
            try { return labels.reasonLabel(code || 'unknown', lang || 'en'); } catch (_) {}
        }
        return code || 'unknown';
    }

    function buildRemediation(worldStateOrProvider, opts) {
        opts = opts || {};
        var ws = (typeof worldStateOrProvider === 'function') ? worldStateOrProvider() : worldStateOrProvider;
        var MX = matrixApi();
        var matrix = opts.matrix || (MX && typeof MX.buildMatrix === 'function'
            ? MX.buildMatrix(ws, { limit: opts.limit || 80 })
            : { rows: [], counts: {}, top_blockers: [] });
        var rows = arr(matrix.rows);
        var byReason = {};

        rows.forEach(function (row) {
            row = obj(row);
            if (row.final_status !== 'Blocked') return;
            var code = row.reason_code || 'unknown';
            if (!byReason[code]) {
                byReason[code] = {
                    reason_code: code,
                    reason_label_en: reasonLabel(code, 'en'),
                    reason_label_ar: reasonLabel(code, 'ar'),
                    steps: arr(REMEDIATION_STEPS[code] || REMEDIATION_STEPS.unknown),
                    units: []
                };
            }
            byReason[code].units.push({
                uid: row.uid,
                unit_label: row.unit_label || row.uid || 'Unknown unit',
                side: row.side || null
            });
        });

        var groups = Object.keys(byReason).map(function (k) { return byReason[k]; });
        groups.sort(function (a, b) { return b.units.length - a.units.length; });

        var totalBlocked = rows.filter(function (r) { return r.final_status === 'Blocked'; }).length;
        var topBlocker = groups.length ? groups[0].reason_code : null;

        return {
            version: CMO_BLOCKER_REMEDIATION_VERSION,
            total_blocked: totalBlocked,
            top_blocker: topBlocker,
            group_count: groups.length,
            by_reason: byReason,
            groups: groups,
            source: 'Readiness matrix — Blocked units grouped by reason'
        };
    }

    function renderRemediationHtml(result, opts) {
        opts = opts || {};
        result = result || buildRemediation(null);
        var groups = arr(result.groups);

        if (!groups.length) {
            return '<div class="usp-rem-empty">No blocked units found — all units are ready or unknown.</div>';
        }

        var html = '<div class="usp-rem-summary">';
        html += '<strong>' + esc(result.total_blocked) + '</strong> blocked unit(s) across ';
        html += '<strong>' + esc(result.group_count) + '</strong> blocker type(s).';
        html += '</div>';

        groups.forEach(function (group) {
            group = obj(group);
            var units = arr(group.units);
            var steps = arr(group.steps);
            html += '<details class="usp-rem-group" open>';
            html += '<summary class="usp-rem-group-hdr">';
            html += '<span class="usp-rem-code">' + esc(group.reason_code) + '</span>';
            html += ' <span class="usp-rem-count">' + esc(units.length) + ' unit(s)</span>';
            html += ' <span class="usp-rem-label-ar" dir="rtl">' + esc(group.reason_label_ar) + '</span>';
            html += '</summary>';

            html += '<div class="usp-rem-units">';
            units.forEach(function (u) {
                html += '<span class="usp-rem-unit-tag">' + esc(u.unit_label) + '</span> ';
            });
            html += '</div>';

            if (steps.length) {
                html += '<ol class="usp-rem-steps">';
                steps.forEach(function (step) {
                    html += '<li>';
                    html += '<span class="usp-rem-step-en">' + esc(step.en || '') + '</span>';
                    if (step.ar) html += '<br><span class="usp-rem-step-ar" dir="rtl">' + esc(step.ar) + '</span>';
                    html += '</li>';
                });
                html += '</ol>';
            }
            html += '</details>';
        });

        html += '<div class="usp-rem-disclaimer">Read-only remediation guide. Does not change scenario state.</div>';
        return html;
    }

    var api = {
        CMO_BLOCKER_REMEDIATION_VERSION: CMO_BLOCKER_REMEDIATION_VERSION,
        REMEDIATION_STEPS: REMEDIATION_STEPS,
        buildRemediation: buildRemediation,
        renderRemediationHtml: renderRemediationHtml
    };

    root.RmoozCmoBlockerRemediation = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
