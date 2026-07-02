/* ============================================================================
 * objective-x-evidence-health.js - RMOOZ-CMO-27 objective X evidence health
 * ----------------------------------------------------------------------------
 * Checks the Objective X evidence health chain: objective exists, RED/BLUE
 * forces assigned, contacts derived, engagement candidates present, CMO matrix
 * can populate. Read-only. No backend, no scenario writes, no combat mutation.
 * ========================================================================== */
(function (root) {
    'use strict';

    var OBJECTIVE_X_EVIDENCE_HEALTH_VERSION = '1.0.0-rmooz-cmo-27';

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

    var CHECKS = [
        {
            key:         'objective_exists',
            label_en:    'Objective exists',
            label_ar:    'يوجد هدف',
            describe_en: 'Scenario has a named Objective X entry',
            describe_ar: 'يحتوي السيناريو على هدف محدد'
        },
        {
            key:         'red_units_exist',
            label_en:    'RED units assigned',
            label_ar:    'وحدات أحمر معيّنة',
            describe_en: 'RED force units present in world state',
            describe_ar: 'توجد وحدات قوة حمراء في الحالة العالمية'
        },
        {
            key:         'blue_units_exist',
            label_en:    'BLUE units assigned',
            label_ar:    'وحدات أزرق معيّنة',
            describe_en: 'BLUE force units present in world state',
            describe_ar: 'توجد وحدات قوة زرقاء في الحالة العالمية'
        },
        {
            key:         'contacts_derived',
            label_en:    'Contacts derived',
            label_ar:    'جهات الاتصال مشتقة',
            describe_en: 'Contact evidence exists for at least one unit',
            describe_ar: 'توجد أدلة اتصال لوحدة واحدة على الأقل'
        },
        {
            key:         'engagement_candidates',
            label_en:    'Engagement candidates',
            label_ar:    'مرشحو الاشتباك',
            describe_en: 'At least one unit has Ready or Blocked engagement status',
            describe_ar: 'توجد وحدة واحدة على الأقل جاهزة أو محجوبة'
        },
        {
            key:         'matrix_can_populate',
            label_en:    'CMO matrix populates',
            label_ar:    'مصفوفة CMO تمتلئ',
            describe_en: 'Readiness matrix has at least one row',
            describe_ar: 'مصفوفة الجاهزية تحتوي على صف واحد على الأقل'
        }
    ];

    function checkObjectiveExists(ws) {
        ws = obj(ws);
        var sc = obj(ws.scenario);
        if (ws.objective || sc.objective) return true;
        if (arr(ws.objectives).length > 0) return true;
        if (arr(obj(sc).objectives).length > 0) return true;
        if (ws.objective_name || ws.objective_id) return true;
        var steps = arr(ws.steps).concat(arr(sc.steps));
        for (var i = 0; i < steps.length; i++) {
            if (obj(steps[i]).objective) return true;
        }
        return false;
    }

    function checkSideUnits(ws, side) {
        ws = obj(ws);
        var d = obj(ws.derived);
        var sideUpper = side.toUpperCase();
        if (sideUpper === 'RED' && (arr(ws.red_units).length > 0 || arr(ws.red_units_initial).length > 0)) return true;
        if (sideUpper === 'BLUE' && (arr(ws.blue_units).length > 0 || arr(ws.blue_units_initial).length > 0)) return true;
        var units = arr(ws.units).concat(arr(d.units));
        for (var i = 0; i < units.length; i++) {
            var u = obj(units[i]);
            if ((u.side || u.team || '').toUpperCase() === sideUpper) return true;
        }
        return false;
    }

    function checkContactsDerived(ws, matrix) {
        ws = obj(ws);
        var d = obj(ws.derived);
        if (arr(d.contacts).length > 0) return true;
        if (arr(d.contact_evidence).length > 0) return true;
        if (Object.keys(obj(d.contacts_by_unit)).length > 0) return true;
        if (Object.keys(obj(d.contact_evidence_by_unit)).length > 0) return true;
        if (matrix) {
            var rows = arr(obj(matrix).rows);
            for (var i = 0; i < rows.length; i++) {
                var cs = obj(rows[i]).contact_status;
                if (cs && cs !== 'Unknown' && cs !== 'no_contact_evidence') return true;
            }
        }
        return false;
    }

    function checkEngagementCandidates(matrix) {
        if (!matrix) return false;
        var rows = arr(obj(matrix).rows);
        for (var i = 0; i < rows.length; i++) {
            var s = obj(rows[i]).final_status;
            if (s === 'Ready' || s === 'Blocked') return true;
        }
        return false;
    }

    function buildObjectiveHealth(worldStateOrProvider, opts) {
        opts = opts || {};
        var ws = (typeof worldStateOrProvider === 'function') ? worldStateOrProvider() : worldStateOrProvider;
        ws = obj(ws);
        var MX = matrixApi();
        var matrix = opts.matrix || (MX && typeof MX.buildMatrix === 'function'
            ? MX.buildMatrix(ws, { limit: 80 })
            : null);
        var results = {
            objective_exists:     checkObjectiveExists(ws),
            red_units_exist:      checkSideUnits(ws, 'RED'),
            blue_units_exist:     checkSideUnits(ws, 'BLUE'),
            contacts_derived:     checkContactsDerived(ws, matrix),
            engagement_candidates: checkEngagementCandidates(matrix),
            matrix_can_populate:  matrix ? arr(obj(matrix).rows).length > 0 : false
        };
        var checks = CHECKS.map(function (c) {
            return {
                key:         c.key,
                label_en:    c.label_en,
                label_ar:    c.label_ar,
                describe_en: c.describe_en,
                describe_ar: c.describe_ar,
                pass:        !!results[c.key]
            };
        });
        var passCount = checks.filter(function (c) { return c.pass; }).length;
        var total = checks.length;
        var healthScore = Math.round((passCount / total) * 100);
        var healthStatus = passCount === total             ? 'healthy'
                         : passCount >= total - 1         ? 'mostly_healthy'
                         : passCount >= Math.ceil(total / 2) ? 'partial'
                         : 'unhealthy';
        return {
            version: OBJECTIVE_X_EVIDENCE_HEALTH_VERSION,
            generated_at: opts.generated_at || new Date().toISOString(),
            checks: checks,
            pass_count: passCount,
            total_checks: total,
            health_score: healthScore,
            health_status: healthStatus,
            source: 'World state structure + readiness matrix'
        };
    }

    var HEALTH_AR = {
        healthy:        'سليم',
        mostly_healthy: 'سليم جزئياً',
        partial:        'جزئي',
        unhealthy:      'غير سليم'
    };

    function renderObjectiveHealthHtml(health, opts) {
        health = health || buildObjectiveHealth(null);
        opts = opts || {};
        var hs = health.health_status || 'unhealthy';
        var cls = hs === 'healthy' ? 'healthy'
                : hs === 'mostly_healthy' ? 'mostly'
                : hs === 'partial' ? 'partial' : 'unhealthy';
        var html = '<div class="usp-objh-header usp-objh--' + esc(cls) + '">' +
            '<span class="usp-objh-score">' + esc(health.health_score) + '%</span>' +
            '<span class="usp-objh-status-en">Objective X Health / ' +
                'صحة الهدف X</span>' +
            '<span class="usp-objh-status-badge">' + esc(health.health_status || 'unknown') + '</span>' +
            '<span class="usp-objh-status-ar" dir="rtl">' + esc(HEALTH_AR[hs] || hs) + '</span>' +
            '</div>' +
            '<ul class="usp-objh-checks">';
        arr(health.checks).forEach(function (check) {
            html += '<li class="usp-objh-check usp-objh-check--' + (check.pass ? 'pass' : 'fail') + '">' +
                '<span class="usp-objh-icon">' + (check.pass ? '✓' : '✗') + '</span>' +
                '<span class="usp-objh-label-en">' + esc(check.label_en) + '</span>' +
                '<span class="usp-objh-label-ar" dir="rtl">' + esc(check.label_ar) + '</span>' +
                '</li>';
        });
        html += '</ul><div class="usp-objh-source">Source: ' + esc(health.source || '') + '</div>';
        return html;
    }

    var api = {
        OBJECTIVE_X_EVIDENCE_HEALTH_VERSION: OBJECTIVE_X_EVIDENCE_HEALTH_VERSION,
        CHECKS: CHECKS,
        buildObjectiveHealth: buildObjectiveHealth,
        renderObjectiveHealthHtml: renderObjectiveHealthHtml
    };

    root.RmoozObjectiveXEvidenceHealth = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
