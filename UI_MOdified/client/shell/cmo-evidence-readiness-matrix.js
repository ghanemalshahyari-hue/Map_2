/* ============================================================================
 * cmo-evidence-readiness-matrix.js - RMOOZ-CMO-7 force evidence matrix
 * ----------------------------------------------------------------------------
 * Read-only force-level rollup of CMO evidence. Aggregates existing contact,
 * engagement, and decision-chain evidence for units already present in world
 * state. No backend routes, scenario writes, combat mutation, or doctrine edits.
 * ========================================================================== */
(function (root) {
    'use strict';

    var CMO_EVIDENCE_READINESS_MATRIX_VERSION = '1.0.0-rmooz-cmo-7';
    var DEFAULT_LIMIT = 40;

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
    function contactApi() { return localApi('AppContactEvidence', 'contact-evidence.js'); }
    function engagementApi() { return localApi('AppEngagementEvidence', 'engagement-evidence.js'); }
    function decisionApi() { return localApi('AppDecisionChainEvidence', 'decision-chain-evidence.js'); }

    function uidOf(unit) {
        unit = obj(unit);
        return unit.uid || unit.id || unit.unit_uid || unit.unitId || unit.base_id || null;
    }

    function displayUnitName(unit, uid) {
        unit = obj(unit);
        return unit.label || unit.name || unit.displayName || unit.display_name ||
            unit.platformLabel || unit.platform_name || uid || 'Unknown unit';
    }

    function reasonLabel(code, lang) {
        var labels = labelsApi();
        if (labels && typeof labels.reasonLabel === 'function') {
            try { return labels.reasonLabel(code || 'unknown_reason', lang || 'en'); } catch (_) {}
        }
        return code || 'unknown_reason';
    }

    function statusLabel(status, lang) {
        var labels = labelsApi();
        if (labels && typeof labels.statusLabel === 'function') {
            try { return labels.statusLabel(status || 'Unknown', lang || 'en'); } catch (_) {}
        }
        return status || 'Unknown';
    }

    function addUnit(out, seen, unit) {
        unit = obj(unit);
        var uid = uidOf(unit);
        if (!uid || seen[uid]) return;
        seen[uid] = true;
        out.push(unit);
    }

    function addUnitMap(out, seen, map) {
        map = obj(map);
        Object.keys(map).forEach(function (uid) {
            var unit = obj(map[uid]);
            if (!uidOf(unit)) unit = Object.assign({ uid: uid }, unit);
            addUnit(out, seen, unit);
        });
    }

    function addUnitList(out, seen, list) {
        arr(list).forEach(function (unit) { addUnit(out, seen, unit); });
    }

    function collectUnits(ws) {
        ws = obj(ws);
        var d = obj(ws.derived);
        var out = [];
        var seen = {};
        [
            d.units_by_uid, d.unit_by_uid, d.units,
            ws.units_by_uid, ws.unit_by_uid
        ].forEach(function (map) { addUnitMap(out, seen, map); });
        [
            d.units, ws.units, ws.red_units, ws.blue_units,
            ws.red_units_initial, ws.blue_units_initial,
            ws.forces, d.forces
        ].forEach(function (list) { addUnitList(out, seen, list); });
        return out;
    }

    function inferUnitIdsFromEvidence(ws) {
        ws = obj(ws);
        var d = obj(ws.derived);
        var out = [];
        var seen = {};
        function addUid(uid) {
            if (!uid || seen[uid]) return;
            seen[uid] = true;
            out.push({ uid: uid });
        }
        [d.contacts_by_unit, d.contact_evidence_by_unit, ws.contacts_by_unit, ws.contact_evidence_by_unit,
         d.engagements_by_unit, d.engagement_by_unit, d.engagement_evidence_by_unit,
         ws.engagements_by_unit, ws.engagement_by_unit].forEach(function (map) {
            Object.keys(obj(map)).forEach(addUid);
        });
        arr(d.contacts).concat(arr(d.contact_evidence)).concat(arr(ws.contacts)).concat(arr(ws.contact_evidence)).forEach(function (r) {
            r = obj(r);
            addUid(r.by_unit || r.observer_uid || r.unit_uid || r.uid);
        });
        arr(d.engagement_outcomes).concat(arr(d.engagements)).concat(arr(d.engagement_evidence))
            .concat(arr(ws.engagement_outcomes)).concat(arr(ws.engagements)).forEach(function (r) {
                r = obj(r);
                addUid(r.shooter || r.actor_uid || r.unit_uid || r.uid);
            });
        return out;
    }

    function normalizeEngagementStatus(engagement) {
        engagement = obj(engagement);
        if (engagement.can_engage) return 'Can engage';
        if (engagement.reason_code && engagement.reason_code !== 'no_engagement_evidence') return 'Cannot engage';
        return 'Unknown';
    }

    function sortRows(rows) {
        var rank = { Blocked: 0, Unknown: 1, Ready: 2 };
        return arr(rows).slice().sort(function (a, b) {
            var ra = rank[a.final_status] == null ? 9 : rank[a.final_status];
            var rb = rank[b.final_status] == null ? 9 : rank[b.final_status];
            if (ra !== rb) return ra - rb;
            return String(a.unit_label || a.uid).localeCompare(String(b.unit_label || b.uid));
        });
    }

    function buildRow(ws, unit) {
        var uid = uidOf(unit);
        var CE = contactApi();
        var EE = engagementApi();
        var DC = decisionApi();
        var contact = CE && typeof CE.getUnitContactEvidence === 'function'
            ? CE.getUnitContactEvidence(ws, uid)
            : { detection_status: 'Unknown', reason_code: 'no_contact_evidence' };
        var engagement = EE && typeof EE.getUnitEngagementWhyNot === 'function'
            ? EE.getUnitEngagementWhyNot(ws, uid)
            : { can_engage: false, reason_code: 'no_engagement_evidence' };
        var decision = DC && typeof DC.getUnitDecisionChainEvidence === 'function'
            ? DC.getUnitDecisionChainEvidence(ws, uid)
            : { final_status: 'Unknown', blocking_reason_code: 'unknown_reason' };
        var finalStatus = decision.final_status || 'Unknown';
        var reason = finalStatus === 'Ready'
            ? null
            : (decision.blocking_reason_code || engagement.reason_code || contact.reason_code || 'unknown_reason');
        return {
            uid: uid,
            unit_label: displayUnitName(unit, uid),
            side: obj(unit).side || obj(unit).team || null,
            contact_status: obj(contact).detection_status || 'Unknown',
            engagement_status: normalizeEngagementStatus(engagement),
            final_status: finalStatus,
            reason_code: reason,
            reason_label_ar: reason ? reasonLabel(reason, 'ar') : null,
            target_uid: obj(engagement).target_uid || obj(contact).target_uid || null,
            weapon: obj(engagement).weapon || null,
            source: obj(decision).source || 'Contact + engagement derived evidence'
        };
    }

    function buildMatrix(worldStateOrProvider, opts) {
        opts = opts || {};
        var ws = (typeof worldStateOrProvider === 'function') ? worldStateOrProvider() : worldStateOrProvider;
        ws = obj(ws);
        var units = collectUnits(ws);
        if (!units.length) units = inferUnitIdsFromEvidence(ws);
        if (opts.units) units = arr(opts.units);

        var rows = units.map(function (unit) { return buildRow(ws, unit); }).filter(function (row) { return !!row.uid; });
        rows = sortRows(rows);
        var counts = { Ready: 0, Blocked: 0, Unknown: 0 };
        var blockers = {};
        rows.forEach(function (row) {
            var status = counts[row.final_status] == null ? 'Unknown' : row.final_status;
            counts[status] += 1;
            if (status !== 'Ready' && row.reason_code) blockers[row.reason_code] = (blockers[row.reason_code] || 0) + 1;
        });
        var top_blockers = Object.keys(blockers).map(function (code) {
            return {
                code: code,
                count: blockers[code],
                label_ar: reasonLabel(code, 'ar')
            };
        }).sort(function (a, b) {
            if (b.count !== a.count) return b.count - a.count;
            return a.code.localeCompare(b.code);
        });

        return {
            version: CMO_EVIDENCE_READINESS_MATRIX_VERSION,
            generated_at: opts.generated_at || new Date().toISOString(),
            counts: counts,
            top_blockers: top_blockers,
            rows: rows.slice(0, opts.limit || DEFAULT_LIMIT),
            total_units: rows.length,
            source: 'Contact + engagement derived evidence'
        };
    }

    function renderCount(label, value, cls) {
        return '<div class="usp-matrix-count ' + esc(cls || '') + '">' +
            '<span class="usp-matrix-count-val">' + esc(value) + '</span>' +
            '<span class="usp-matrix-count-lbl">' + esc(label) + '</span>' +
            '</div>';
    }

    function renderBlockers(matrix) {
        var blockers = arr(matrix.top_blockers).slice(0, 5);
        if (!blockers.length) return '<div class="usp-matrix-empty">No blocking reasons reported. / لا توجد أسباب منع مسجلة</div>';
        return '<div class="usp-matrix-blockers">' + blockers.map(function (b) {
            return '<div class="usp-matrix-blocker"><span>' + esc(b.code) + '</span><strong>' +
                esc(b.count) + '</strong><em>' + esc(b.label_ar || '') + '</em></div>';
        }).join('') + '</div>';
    }

    function renderRow(row) {
        var cls = String(row.final_status || 'Unknown').toLowerCase();
        return '<tr class="usp-matrix-row ' + esc(cls) + '">' +
            '<td>' + esc(row.unit_label || row.uid) + '</td>' +
            '<td>' + esc(row.contact_status || 'Unknown') + '</td>' +
            '<td>' + esc(row.engagement_status || 'Unknown') + '</td>' +
            '<td><span class="usp-matrix-pill ' + esc(cls) + '">' + esc(row.final_status || 'Unknown') + '</span></td>' +
            '<td>' + esc(row.reason_code || '-') + '</td>' +
            '</tr>';
    }

    function renderMatrixHtml(matrix, opts) {
        opts = opts || {};
        matrix = matrix || buildMatrix(null, opts);
        var counts = obj(matrix.counts);
        var rows = arr(matrix.rows);
        var html = '';
        html += '<div class="usp-matrix-summary">' +
            renderCount('Ready / ' + statusLabel('Ready', 'ar'), counts.Ready || 0, 'ready') +
            renderCount('Blocked / ' + statusLabel('Blocked', 'ar'), counts.Blocked || 0, 'blocked') +
            renderCount('Unknown / ' + statusLabel('Unknown', 'ar'), counts.Unknown || 0, 'unknown') +
            '</div>';
        html += '<div class="usp-matrix-subtitle">Top blockers / أهم أسباب المنع</div>';
        html += renderBlockers(matrix);
        if (!rows.length) {
            html += '<div class="usp-matrix-empty">No units available for evidence matrix. / لا توجد وحدات لعرض المصفوفة</div>';
        } else {
            html += '<div class="usp-matrix-table-wrap"><table class="usp-matrix-table">' +
                '<thead><tr><th>Unit</th><th>Contact</th><th>Engagement</th><th>Final</th><th>Reason</th></tr></thead>' +
                '<tbody>' + rows.map(renderRow).join('') + '</tbody></table></div>';
        }
        html += '<div class="usp-matrix-source">Source / المصدر: ' + esc(matrix.source || 'Contact + engagement derived evidence') + '</div>';
        return html;
    }

    var api = {
        CMO_EVIDENCE_READINESS_MATRIX_VERSION: CMO_EVIDENCE_READINESS_MATRIX_VERSION,
        collectUnits: collectUnits,
        inferUnitIdsFromEvidence: inferUnitIdsFromEvidence,
        buildMatrix: buildMatrix,
        renderMatrixHtml: renderMatrixHtml
    };

    root.RmoozCmoEvidenceReadinessMatrix = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
