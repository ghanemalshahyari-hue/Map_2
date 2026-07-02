/* ============================================================================
 * scenario-evidence-normalizer.js - RMOOZ-CMO-26 scenario evidence normalizer
 * ----------------------------------------------------------------------------
 * Normalizes missing fields in a world-state to safe CMO evidence defaults.
 * Returns a new normalized copy — the original is NEVER mutated.
 * No backend, no scenario writes, no combat mutation.
 * ========================================================================== */
(function (root) {
    'use strict';

    var SCENARIO_EVIDENCE_NORMALIZER_VERSION = '1.0.0-rmooz-cmo-26';

    function obj(v) { return v && typeof v === 'object' ? v : {}; }
    function arr(v) { return Array.isArray(v) ? v : []; }
    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

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

    var DEFAULTS = {
        side:               'unknown',
        role:               'unknown',
        contact_status:     'no_contact_evidence',
        engagement_status:  'no_engagement_evidence',
        weapon:             'no_weapon_evidence',
        sensor:             'no_sensor_evidence',
        doctrine:           'doctrine_unknown',
        range:              'unknown_range'
    };

    function normalizeUnit(unit, actions) {
        unit = obj(unit);
        var uid = uidOf(unit);
        var copy = Object.assign({}, unit);
        if (!copy.side && !copy.team) {
            copy.side = DEFAULTS.side;
            if (uid) actions.push({ uid: uid, field: 'side', applied: DEFAULTS.side });
        }
        if (!copy.role && !copy.type && !copy.domain) {
            copy.role = DEFAULTS.role;
            if (uid) actions.push({ uid: uid, field: 'role', applied: DEFAULTS.role });
        }
        if (!hasCoord(copy)) {
            copy.needs_placement = true;
            if (uid) actions.push({ uid: uid, field: 'coordinates', applied: 'needs_placement' });
        }
        if (!copy.weapon) {
            copy.weapon = DEFAULTS.weapon;
            if (uid) actions.push({ uid: uid, field: 'weapon', applied: DEFAULTS.weapon });
        }
        if (!copy.sensor) {
            copy.sensor = DEFAULTS.sensor;
            if (uid) actions.push({ uid: uid, field: 'sensor', applied: DEFAULTS.sensor });
        }
        if (!copy.doctrine) {
            copy.doctrine = DEFAULTS.doctrine;
            if (uid) actions.push({ uid: uid, field: 'doctrine', applied: DEFAULTS.doctrine });
        }
        return copy;
    }

    function normalizeUnitList(list, actions) {
        return arr(list).map(function (unit) { return normalizeUnit(unit, actions); });
    }

    function normalizeUnitMap(map, actions) {
        var copy = {};
        map = obj(map);
        Object.keys(map).forEach(function (k) {
            copy[k] = normalizeUnit(map[k], actions);
        });
        return copy;
    }

    function normalizeDerived(derived, actions) {
        derived = obj(derived);
        var copy = Object.assign({}, derived);
        if (copy.units)        copy.units        = normalizeUnitList(copy.units, actions);
        if (copy.units_by_uid) copy.units_by_uid = normalizeUnitMap(copy.units_by_uid, actions);
        if (copy.unit_by_uid)  copy.unit_by_uid  = normalizeUnitMap(copy.unit_by_uid, actions);
        return copy;
    }

    function normalizeWorldState(ws) {
        ws = obj(ws);
        var actions = [];
        var normalized = Object.assign({}, ws);
        if (normalized.units)              normalized.units              = normalizeUnitList(normalized.units, actions);
        if (normalized.red_units)          normalized.red_units          = normalizeUnitList(normalized.red_units, actions);
        if (normalized.blue_units)         normalized.blue_units         = normalizeUnitList(normalized.blue_units, actions);
        if (normalized.red_units_initial)  normalized.red_units_initial  = normalizeUnitList(normalized.red_units_initial, actions);
        if (normalized.blue_units_initial) normalized.blue_units_initial = normalizeUnitList(normalized.blue_units_initial, actions);
        if (normalized.forces)             normalized.forces             = normalizeUnitList(normalized.forces, actions);
        if (normalized.units_by_uid)       normalized.units_by_uid       = normalizeUnitMap(normalized.units_by_uid, actions);
        if (normalized.unit_by_uid)        normalized.unit_by_uid        = normalizeUnitMap(normalized.unit_by_uid, actions);
        if (normalized.derived)            normalized.derived            = normalizeDerived(normalized.derived, actions);
        var affectedSet = {};
        actions.forEach(function (a) { if (a.uid) affectedSet[a.uid] = true; });
        return {
            version: SCENARIO_EVIDENCE_NORMALIZER_VERSION,
            normalized_ws: normalized,
            actions: actions,
            fields_normalized: actions.length,
            units_affected: Object.keys(affectedSet).length
        };
    }

    function describeNormalizations(result) {
        result = obj(result);
        var actions = arr(result.actions);
        if (!actions.length) return [];
        var byField = {};
        var firstApplied = {};
        actions.forEach(function (a) {
            if (!byField[a.field]) { byField[a.field] = 0; firstApplied[a.field] = a.applied; }
            byField[a.field]++;
        });
        return Object.keys(byField).map(function (field) {
            return { field: field, count: byField[field], applied: firstApplied[field] || DEFAULTS[field] || 'normalized' };
        });
    }

    function renderNormalizerHtml(result) {
        var descriptions = describeNormalizations(result || {});
        if (!descriptions.length) {
            return '<div class="usp-norm-empty">No normalizations required. Evidence fields complete. / ' +
                '&#1604;&#1575; &#1578;&#1591;&#1576;&#1610;&#1593; &#1605;&#1591;&#1604;&#1608;&#1576;</div>';
        }
        var r = obj(result);
        var html = '<div class="usp-norm-header">' +
            '<span class="usp-norm-count">' + esc(r.fields_normalized) + ' normalization(s)</span>' +
            '<span class="usp-norm-units">' + esc(r.units_affected) + ' unit(s) affected</span>' +
            '</div><ul class="usp-norm-list">';
        descriptions.forEach(function (d) {
            html += '<li>' +
                '<span class="usp-norm-field">' + esc(d.field) + '</span>' +
                '<span class="usp-norm-badge">' + esc(d.count) + '</span>' +
                '<span class="usp-norm-applied">&#8594; ' + esc(d.applied) + '</span>' +
                '</li>';
        });
        html += '</ul>';
        return html;
    }

    var api = {
        SCENARIO_EVIDENCE_NORMALIZER_VERSION: SCENARIO_EVIDENCE_NORMALIZER_VERSION,
        DEFAULTS: DEFAULTS,
        normalizeWorldState: normalizeWorldState,
        normalizeUnit: normalizeUnit,
        describeNormalizations: describeNormalizations,
        renderNormalizerHtml: renderNormalizerHtml
    };

    root.RmoozScenarioEvidenceNormalizer = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
