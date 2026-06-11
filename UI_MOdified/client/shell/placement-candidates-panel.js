/* ============================================================================
 * placement-candidates-panel.js — DOC-UNDERSTANDING-1 / G-3C
 * ----------------------------------------------------------------------------
 * Read-only surfacing of G-3B location placement CANDIDATES inside the AI
 * Understanding Review. Sibling of coa-review-panel.js — pure render, no
 * fetch, no mutation, no map writes. The candidates are produced server-side
 * by /api/wargame-sim/placement (the G-3B resolver) and attached by the
 * import wizard as payload.placement before RmoozDocReview.render() runs.
 *
 * These are CANDIDATES for commander review — never final placement. The panel
 * makes the honesty explicit: confidence, source, AO check, incident status,
 * warnings, and a "needs review" badge on every card.
 *
 *   window.RmoozPlacementPanel = { hasCandidates(payload), render(mount, payload) }
 * ========================================================================== */
(function () {
    'use strict';

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"]/g, function (ch) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch];
        });
    }

    // payload.placement.placement_candidates (wizard attaches the endpoint body
    // under .placement) — tolerate a few shapes defensively.
    function candidatesOf(payload) {
        var p = payload || {};
        var src = p.placement || p;
        var list = src.placement_candidates || src.candidates || p.placement_candidates;
        return Array.isArray(list) ? list : [];
    }
    function hasCandidates(payload) { return candidatesOf(payload).length > 0; }

    var TYPE_LABEL = {
        known_base:          'Known base — قاعدة معروفة',
        known_location:      'Known location — موقع معروف',
        exact_unit_position: 'Exact position — موقع دقيق',
        approximate:         'Approximate — تقريبي',
        suspected:           'Suspected — مشتبه',
        unknown_named:       'Unknown place — مكان مجهول',
        ambiguous:           'Ambiguous — غامض',
    };
    var TYPE_TONE = {
        known_base: '#3a96d2', known_location: '#3a96d2', exact_unit_position: '#7fd6a0',
        approximate: '#e0c060', suspected: '#e0a93a', unknown_named: '#c98', ambiguous: '#d28',
    };
    var AO_LABEL = { inside: 'in AO — داخل', outside_warn: 'outside AO — خارج', unknown: 'AO unknown — غير محدد' };
    var WARN_LABEL = {
        base_known_exact_unit_position_unknown: 'base known · exact unit position unknown',
        outside_ao: 'outside area of operation',
        incident_damaged: 'prior incident: damaged',
        incident_destroyed: 'prior incident: destroyed',
        stale_intel: 'stale intel',
        incident_conflicting: 'conflicting incident reports',
        unknown_location: 'place not in gazetteer',
        ambiguous_location: 'name matches multiple places',
        from_incident_only: 'from incident log only',
        llm_only_source: 'AI suggestion only',
        mgrs_not_converted: 'MGRS not converted',
        coordinate_latlon_order_assumed: 'lat/lon order assumed',
    };

    function chip(text, color, bg) {
        return '<span style="display:inline-block;margin:2px 4px 2px 0;padding:1px 7px;border-radius:9px;font-size:10px;' +
            'background:' + (bg || '#16222e') + ';border:1px solid ' + (color || '#2e5d7d') + ';color:' + (color || '#cfe6ff') + ';">' +
            esc(text) + '</span>';
    }

    function card(c) {
        var tone = TYPE_TONE[c.placement_type] || '#8fa5b8';
        var coords = (c.lat != null && c.lon != null)
            ? '<span dir="ltr" style="font-family:monospace;color:#cfe6ff;">' + esc(c.lat) + ', ' + esc(c.lon) + '</span>'
            + (c.coordinate_format ? ' <span style="color:#7f93a6;">(' + esc(c.coordinate_format) + ')</span>' : '')
            : '<span style="color:#e0a93a;">no coordinate — لا إحداثيات</span>';

        var h = '<div style="border:1px solid #284050;border-radius:6px;padding:8px 10px;margin:6px 0;background:#0e1620;">';
        // header: name + type + needs-review
        h += '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">';
        h += '<strong style="color:#e8eaed;">' + esc(c.mention || c.normalized_name || '—') + '</strong>';
        h += '<span>' + chip(TYPE_LABEL[c.placement_type] || c.placement_type, tone) +
             (c.needs_review ? chip('needs review — مراجعة', '#e0c060', '#2a2412') : '') + '</span>';
        h += '</div>';
        // facts
        h += '<div style="font-size:11px;color:#9ab;margin-top:4px;">' + coords + ' &nbsp;·&nbsp; ' +
             chip(AO_LABEL[c.ao_check] || c.ao_check, c.ao_check === 'inside' ? '#7fd6a0' : (c.ao_check === 'outside_warn' ? '#e0a93a' : '#7f93a6')) +
             chip('confidence: ' + esc(c.confidence), tone) +
             (c.location_id ? chip(esc(c.location_id), '#5a7', '#13201a') : '') +
             '</div>';
        // honesty line: exact unit position?
        h += '<div style="font-size:10px;color:#7f93a6;margin-top:2px;">exact unit position: <b style="color:' +
             (c.exact_unit_position ? '#7fd6a0' : '#e0a93a') + ';">' + (c.exact_unit_position ? 'yes' : 'no') + '</b>' +
             ' &nbsp;·&nbsp; source: ' + esc(c.source && c.source.type || '—') + '</div>';
        // incident status
        if (c.incident_status) {
            var inc = c.incident_status;
            h += '<div style="font-size:10px;margin-top:3px;color:#e0a93a;">⚠ incident: ' + esc(inc.event_type) +
                 (inc.date ? ' (' + esc(inc.date) + ')' : '') + (inc.stale ? ' · stale' : '') +
                 ' · conf ' + esc(inc.confidence) + '</div>';
        }
        // warnings
        var warns = (c.warnings || []);
        if (warns.length) {
            h += '<div style="margin-top:4px;">' + warns.map(function (w) {
                return chip(WARN_LABEL[w] || w, '#b8860b', '#2a2412');
            }).join('') + '</div>';
        }
        h += '</div>';
        return h;
    }

    function render(mount, payload) {
        if (!mount) return;
        var cands = candidatesOf(payload);
        if (!cands.length) { mount.innerHTML = ''; return; }

        var src = (payload && payload.placement) || payload || {};
        var missing = (src.missing_information || []).filter(function (s) { return /^unresolved_location/.test(s); });
        var conflicts = (src.conflicts || []).filter(function (c) { return c.collection === 'placement_candidates'; });

        var html = '<section style="border:1px solid #2e5d7d;border-radius:8px;padding:10px;margin:10px 0;background:#0c141d;">';
        html += '<div style="color:#8fb8e0;font-weight:600;font-size:13px;">Location Placement Candidates — مرشّحو مواقع الوحدات</div>';
        html += '<div style="font-size:11px;color:#9aa3ad;margin:2px 0 8px;">Commander review required — قرار القائد مطلوب. Resolved evidence, not final placement.</div>';
        cands.forEach(function (c) { html += card(c); });
        if (conflicts.length) {
            html += '<div style="margin-top:6px;font-size:11px;color:#e0a93a;">⚠ ' + conflicts.length +
                ' ambiguous mention(s) need a decision — غموض يتطلب قراراً.</div>';
        }
        if (missing.length) {
            html += '<div style="margin-top:4px;font-size:11px;color:#c98;">Unresolved locations — مواقع غير محلولة: ' +
                missing.map(function (s) { return esc(s.replace(/^unresolved_location:/, '')); }).join('، ') + '</div>';
        }
        html += '</section>';
        mount.innerHTML = html;
    }

    window.RmoozPlacementPanel = { hasCandidates: hasCandidates, render: render };
})();
