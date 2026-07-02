/* ============================================================================
 * scenario-evidence-completeness.js - RMOOZ-CMO-25 scenario evidence completeness
 * ----------------------------------------------------------------------------
 * Validates generated scenario world-state for evidence completeness.
 * Reports missing fields per unit and force-level summary.
 * Read-only. No backend, no scenario writes, no combat mutation, no auto-fix.
 * ========================================================================== */
(function (root) {
    'use strict';

    var SCENARIO_EVIDENCE_COMPLETENESS_VERSION = '1.0.0-rmooz-cmo-25';

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

    function uidOf(unit) {
        unit = obj(unit);
        return unit.uid || unit.id || unit.unit_uid || unit.unitId || unit.base_id || null;
    }

    function hasCoord(unit) {
        unit = obj(unit);
        var lat = unit.lat != null ? unit.lat : (unit.latitude != null ? unit.latitude : null);
        var lng = unit.lng != null ? unit.lng
            : (unit.lon != null ? unit.lon : (unit.longitude != null ? unit.longitude : null));
        return lat != null && lng != null && isFinite(Number(lat)) && isFinite(Number(lng));
    }

    function collectUnitsFromWs(ws) {
        ws = obj(ws);
        var d = obj(ws.derived);
        var out = [];
        var seen = {};
        function add(u) {
            if (!u || typeof u !== 'object') return;
            var uid = uidOf(u);
            if (!uid || seen[uid]) return;
            seen[uid] = true;
            out.push(u);
        }
        function addMap(map) {
            map = obj(map);
            Object.keys(map).forEach(function (k) {
                var u = obj(map[k]);
                if (!uidOf(u)) u = Object.assign({ uid: k }, u);
                add(u);
            });
        }
        [d.units_by_uid, d.unit_by_uid, ws.units_by_uid, ws.unit_by_uid].forEach(addMap);
        [
            d.units, ws.units, ws.red_units, ws.blue_units,
            ws.red_units_initial, ws.blue_units_initial, ws.forces, d.forces
        ].forEach(function (list) { arr(list).forEach(add); });
        return out;
    }

    function checkUnit(unit, matrixRow) {
        unit = obj(unit);
        matrixRow = obj(matrixRow);
        var uid = uidOf(unit);
        var issues = [];
        if (!unit.side && !unit.team) issues.push('missing_side');
        if (!hasCoord(unit)) issues.push('missing_coordinates');
        if (!unit.role && !unit.type && !unit.domain) issues.push('missing_role');
        if (matrixRow.contact_status === 'Unknown'
                || matrixRow.reason_code === 'no_contact_evidence'
                || matrixRow.contact_status === 'no_contact_evidence') {
            issues.push('no_contact_evidence');
        }
        if (matrixRow.final_status === 'Unknown'
                && matrixRow.reason_code !== 'no_contact_evidence'
                && !matrixRow.weapon) {
            issues.push('no_engagement_evidence');
        }
        if (!matrixRow.weapon) issues.push('missing_weapon');
        if (matrixRow.reason_code === 'out_of_range') issues.push('missing_range');
        return {
            uid: uid,
            label: unit.label || unit.name || uid || 'Unknown',
            side: unit.side || unit.team || null,
            issues: issues,
            complete: issues.length === 0
        };
    }

    function countIssue(results, issueKey) {
        return results.filter(function (r) {
            return r.issues.indexOf(issueKey) !== -1;
        }).length;
    }

    function buildCompleteness(worldStateOrProvider, opts) {
        opts = opts || {};
        var ws = (typeof worldStateOrProvider === 'function') ? worldStateOrProvider() : worldStateOrProvider;
        ws = obj(ws);
        var MX = matrixApi();
        var matrix = opts.matrix || (MX && typeof MX.buildMatrix === 'function'
            ? MX.buildMatrix(ws, { limit: opts.limit || 80 })
            : { rows: [] });
        var matrixByUid = {};
        arr(obj(matrix).rows).forEach(function (row) {
            if (row && row.uid) matrixByUid[row.uid] = row;
        });
        var units = collectUnitsFromWs(ws);
        if (!units.length) {
            units = arr(obj(matrix).rows).map(function (row) {
                return obj(row).unit || { uid: row.uid };
            });
        }
        var unitResults = units.map(function (unit) {
            var uid = uidOf(unit);
            return checkUnit(unit, uid ? (matrixByUid[uid] || {}) : {});
        });
        var total = unitResults.length;
        var complete = unitResults.filter(function (r) { return r.complete; }).length;
        var needsReview = total - complete;
        var noContact      = countIssue(unitResults, 'no_contact_evidence');
        var missingWeapon  = countIssue(unitResults, 'missing_weapon');
        var missingRange   = countIssue(unitResults, 'missing_range');
        var missingSide    = countIssue(unitResults, 'missing_side');
        var missingCoord   = countIssue(unitResults, 'missing_coordinates');
        var missingRole    = countIssue(unitResults, 'missing_role');
        var verdict = (needsReview === 0)   ? 'complete'
                    : (complete >= total * 0.75) ? 'mostly_complete'
                    : 'needs_review';
        return {
            version: SCENARIO_EVIDENCE_COMPLETENESS_VERSION,
            generated_at: opts.generated_at || new Date().toISOString(),
            total_checked: total,
            complete: complete,
            needs_review: needsReview,
            no_contact: noContact,
            missing_weapon: missingWeapon,
            missing_range: missingRange,
            missing_side: missingSide,
            missing_coordinates: missingCoord,
            missing_role: missingRole,
            verdict: verdict,
            unit_results: unitResults,
            source: 'Readiness matrix + world state unit fields'
        };
    }

    function verdictLabel(verdict) {
        if (verdict === 'complete')         return { en: 'Complete',         ar: 'مكتمل' };
        if (verdict === 'mostly_complete')  return { en: 'Mostly Complete',  ar: 'مكتمل جزئياً' };
        return { en: 'Needs Review', ar: 'يحتاج مراجعة' };
    }

    function renderCompletenessHtml(completeness, opts) {
        completeness = completeness || buildCompleteness(null);
        opts = opts || {};
        var v = completeness.verdict || 'needs_review';
        var vLabel = verdictLabel(v);
        var cls = v === 'complete' ? 'complete' : (v === 'mostly_complete' ? 'mostly' : 'review');
        var html = '<div class="usp-comp-header usp-comp--' + esc(cls) + '">' +
            '<span class="usp-comp-title-en">Scenario Evidence Review / مراجعة أدلة السيناريو</span>' +
            '<span class="usp-comp-verdict-en">' + esc(vLabel.en) + '</span>' +
            '<span class="usp-comp-verdict-ar" dir="rtl">' + esc(vLabel.ar) + '</span>' +
            '</div>' +
            '<dl class="usp-comp-stats">' +
            '<div class="usp-comp-stat"><dt>Units checked</dt><dd>' + esc(completeness.total_checked) + '</dd></div>' +
            '<div class="usp-comp-stat usp-comp-stat--ok"><dt>Complete evidence</dt><dd>' + esc(completeness.complete) + '</dd></div>' +
            '<div class="usp-comp-stat usp-comp-stat--warn"><dt>Needs review</dt><dd>' + esc(completeness.needs_review) + '</dd></div>';
        if (completeness.no_contact > 0) {
            html += '<div class="usp-comp-stat usp-comp-stat--issue"><dt>No-contact evidence</dt><dd>' + esc(completeness.no_contact) + '</dd></div>';
        }
        if (completeness.missing_weapon > 0) {
            html += '<div class="usp-comp-stat usp-comp-stat--issue"><dt>Missing weapon evidence</dt><dd>' + esc(completeness.missing_weapon) + '</dd></div>';
        }
        if (completeness.missing_range > 0) {
            html += '<div class="usp-comp-stat usp-comp-stat--issue"><dt>Missing range evidence</dt><dd>' + esc(completeness.missing_range) + '</dd></div>';
        }
        if (completeness.missing_side > 0) {
            html += '<div class="usp-comp-stat usp-comp-stat--issue"><dt>Missing side assignment</dt><dd>' + esc(completeness.missing_side) + '</dd></div>';
        }
        if (completeness.missing_coordinates > 0) {
            html += '<div class="usp-comp-stat usp-comp-stat--issue"><dt>Missing coordinates</dt><dd>' + esc(completeness.missing_coordinates) + '</dd></div>';
        }
        html += '</dl><div class="usp-comp-source">Source: ' + esc(completeness.source || '') + '</div>';
        return html;
    }

    var api = {
        SCENARIO_EVIDENCE_COMPLETENESS_VERSION: SCENARIO_EVIDENCE_COMPLETENESS_VERSION,
        buildCompleteness: buildCompleteness,
        renderCompletenessHtml: renderCompletenessHtml
    };

    root.RmoozScenarioEvidenceCompleteness = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
