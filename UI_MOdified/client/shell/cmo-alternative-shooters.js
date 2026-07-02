/* ============================================================================
 * cmo-alternative-shooters.js - RMOOZ-CMO-18 alternative shooter candidates
 * ----------------------------------------------------------------------------
 * Read-only scan of the readiness matrix for units that are "Ready" and could
 * serve as alternative shooters for a blocked unit's target. No backend routes,
 * state mutation, combat triggers, doctrine edits, or fire authorizations.
 * ========================================================================== */
(function (root) {
    'use strict';

    var CMO_ALTERNATIVE_SHOOTERS_VERSION = '1.0.0-rmooz-cmo-18';

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

    function statusLabel(code, lang) {
        var labels = labelsApi();
        if (labels && typeof labels.statusLabel === 'function') {
            try { return labels.statusLabel(code || 'Unknown', lang || 'en'); } catch (_) {}
        }
        return code || 'Unknown';
    }

    function buildAlternatives(worldStateOrProvider, blockedUid, opts) {
        opts = opts || {};
        var ws = (typeof worldStateOrProvider === 'function') ? worldStateOrProvider() : worldStateOrProvider;
        var MX = matrixApi();
        var matrix = opts.matrix || (MX && typeof MX.buildMatrix === 'function'
            ? MX.buildMatrix(ws, { limit: opts.limit || 80 })
            : { rows: [], counts: {} });
        var rows = arr(matrix.rows);

        var blockedRow = null;
        if (blockedUid) {
            for (var i = 0; i < rows.length; i++) {
                if (rows[i].uid === blockedUid) { blockedRow = rows[i]; break; }
            }
        }

        var blockedSide = blockedRow ? (blockedRow.side || null) : (opts.side || null);
        var blockedTarget = blockedRow ? (blockedRow.target_uid || null) : (opts.target_uid || null);

        var candidates = [];
        rows.forEach(function (row) {
            row = obj(row);
            if (row.uid === blockedUid) return;
            if (row.final_status !== 'Ready') return;
            var sameSide = !blockedSide || !row.side || row.side === blockedSide;
            if (!sameSide) return;
            candidates.push({
                uid: row.uid,
                unit_label: row.unit_label || row.uid || 'Unknown unit',
                side: row.side || null,
                contact_status: row.contact_status || 'Unknown',
                engagement_status: row.engagement_status || 'Unknown',
                weapon: row.weapon || null,
                target_uid: row.target_uid || null,
                engagement_status_label_ar: statusLabel('Ready', 'ar'),
                shares_target: !!(blockedTarget && row.target_uid && row.target_uid === blockedTarget)
            });
        });

        candidates.sort(function (a, b) {
            if (a.shares_target && !b.shares_target) return -1;
            if (!a.shares_target && b.shares_target) return 1;
            return 0;
        });

        return {
            version: CMO_ALTERNATIVE_SHOOTERS_VERSION,
            blocked_uid: blockedUid || null,
            blocked_target: blockedTarget,
            blocked_side: blockedSide,
            alternatives: candidates.slice(0, opts.max || 10),
            total_ready: candidates.length,
            total_checked: rows.length,
            source: 'Readiness matrix — Ready units, same side'
        };
    }

    function renderAlternativesHtml(result, opts) {
        opts = opts || {};
        result = result || buildAlternatives(null, null);
        var alts = arr(result.alternatives);

        if (!alts.length) {
            return '<div class="usp-alt-empty">No ready alternative shooters found in the force.</div>';
        }

        var html = '<div class="usp-alt-meta">';
        html += '<span class="usp-alt-count">' + esc(result.total_ready) + '</span> ready unit(s) found of ';
        html += '<span class="usp-alt-total">' + esc(result.total_checked) + '</span> checked.';
        html += '</div>';
        html += '<table class="usp-alt-table">';
        html += '<thead><tr><th>Unit</th><th>Contact</th><th>Weapon</th><th>Shared Target</th></tr></thead>';
        html += '<tbody>';
        alts.forEach(function (a) {
            var sharedMark = a.shares_target ? '<span class="usp-alt-shared-target">&#10003;</span>' : '';
            html += '<tr class="' + (a.shares_target ? 'usp-alt-row--shared' : '') + '">';
            html += '<td>' + esc(a.unit_label) + '</td>';
            html += '<td>' + esc(a.contact_status) + '</td>';
            html += '<td>' + esc(a.weapon || '—') + '</td>';
            html += '<td>' + sharedMark + '</td>';
            html += '</tr>';
        });
        html += '</tbody></table>';
        html += '<div class="usp-alt-disclaimer">Read-only view. Does not authorize any engagement.</div>';
        return html;
    }

    var api = {
        CMO_ALTERNATIVE_SHOOTERS_VERSION: CMO_ALTERNATIVE_SHOOTERS_VERSION,
        buildAlternatives: buildAlternatives,
        renderAlternativesHtml: renderAlternativesHtml
    };

    root.RmoozCmoAlternativeShooters = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
