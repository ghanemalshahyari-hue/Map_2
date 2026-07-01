/* ============================================================================
 * evidence-map-overlays.js - RMOOZ-CMO-4 read-only map evidence overlays
 * ----------------------------------------------------------------------------
 * Visualizes existing CMO evidence on the Leaflet map: weapon/sensor rings,
 * shooter-target line, and a status marker with the blocking reason. This module
 * reads CMO-1/2/3 outputs and existing map/world-state positions only. It does
 * not compute combat outcomes, mutate doctrine/actions, call backend routes, or
 * trigger fires.
 * ========================================================================== */
(function (root) {
    'use strict';

    var EVIDENCE_MAP_OVERLAYS_VERSION = '1.0.0-rmooz-cmo-4';
    var NM_TO_METERS = 1852;
    var overlayLayer = null;
    var lastOverlayState = null;

    var STATUS_COLORS = {
        Ready: '#22c55e',
        Blocked: '#f97316',
        Unknown: '#94a3b8'
    };

    var REASON_LABELS_AR = {
        out_of_range: 'الهدف خارج مدى السلاح',
        weapons_hold: 'إيقاف إطلاق حسب القواعد',
        winchester: 'لا توجد ذخيرة متاحة',
        no_fire_control_channel: 'لا توجد قناة تحكم نيراني',
        no_valid_target: 'لا يوجد هدف صالح',
        stale_contact: 'معلومة الرصد قديمة',
        target_not_detected: 'الهدف غير مكتشف',
        undetected: 'الهدف غير مكتشف',
        no_detection: 'الهدف غير مكتشف',
        no_contact_evidence: 'لا توجد أدلة رصد متاحة',
        no_engagement_evidence: 'لا توجد أدلة اشتباك متاحة',
        no_engagement_solution: 'لا يوجد حل اشتباك صالح',
        unknown_reason: 'سبب غير معروف'
    };

    function obj(v) { return v && typeof v === 'object' ? v : {}; }
    function arr(v) { return Array.isArray(v) ? v : []; }
    function finite(v) { return Number.isFinite(Number(v)); }
    function num(v) { return Number(v); }
    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    function localDecisionApi() {
        if (root.AppDecisionChainEvidence) return root.AppDecisionChainEvidence;
        if (typeof require === 'function') {
            try { return require('./decision-chain-evidence.js'); } catch (_) {}
        }
        return null;
    }

    function localContactApi() {
        if (root.AppContactEvidence) return root.AppContactEvidence;
        if (typeof require === 'function') {
            try { return require('./contact-evidence.js'); } catch (_) {}
        }
        return null;
    }

    function localEngagementApi() {
        if (root.AppEngagementEvidence) return root.AppEngagementEvidence;
        if (typeof require === 'function') {
            try { return require('./engagement-evidence.js'); } catch (_) {}
        }
        return null;
    }

    function labelsApi() {
        if (root.AppCmoEvidenceLabels) return root.AppCmoEvidenceLabels;
        if (typeof require === 'function') {
            try { return require('./cmo-evidence-labels.js'); } catch (_) {}
        }
        return null;
    }

    function reasonLabelAr(code) {
        var shared = labelsApi();
        if (shared && typeof shared.reasonLabel === 'function') {
            try { return shared.reasonLabel(code || 'unknown_reason', 'ar'); } catch (_) {}
        }
        var DC = localDecisionApi();
        if (DC && typeof DC.reasonLabel === 'function') {
            try { return DC.reasonLabel(code || 'unknown_reason', 'ar'); } catch (_) {}
        }
        return REASON_LABELS_AR[code || 'unknown_reason'] || REASON_LABELS_AR.unknown_reason;
    }

    function toLatLng(raw) {
        if (!raw) return null;
        if (typeof raw.getLatLng === 'function') {
            try {
                var ll = raw.getLatLng();
                if (ll && finite(ll.lat) && finite(ll.lng)) return { lat: num(ll.lat), lng: num(ll.lng) };
            } catch (_) {}
        }
        if (finite(raw.lat) && finite(raw.lng)) return { lat: num(raw.lat), lng: num(raw.lng) };
        if (finite(raw.latitude) && finite(raw.longitude)) return { lat: num(raw.latitude), lng: num(raw.longitude) };
        if (finite(raw.live_lat) && finite(raw.live_lng)) return { lat: num(raw.live_lat), lng: num(raw.live_lng) };
        if (finite(raw.target_lat) && finite(raw.target_lon)) return { lat: num(raw.target_lat), lng: num(raw.target_lon) };
        if (finite(raw.shooter_lat) && finite(raw.shooter_lon)) return { lat: num(raw.shooter_lat), lng: num(raw.shooter_lon) };
        if (Array.isArray(raw.coord) && raw.coord.length >= 2 && finite(raw.coord[0]) && finite(raw.coord[1])) {
            return { lat: num(raw.coord[1]), lng: num(raw.coord[0]) };
        }
        if (Array.isArray(raw.position) && raw.position.length >= 2 && finite(raw.position[0]) && finite(raw.position[1])) {
            return { lat: num(raw.position[1]), lng: num(raw.position[0]) };
        }
        if (raw.position && typeof raw.position === 'object') return toLatLng(raw.position);
        if (Array.isArray(raw.coordinates) && raw.coordinates.length >= 2 && finite(raw.coordinates[0]) && finite(raw.coordinates[1])) {
            return { lat: num(raw.coordinates[1]), lng: num(raw.coordinates[0]) };
        }
        return null;
    }

    function uidOf(v) {
        v = obj(v);
        return v.uid || v.id || v.unit_uid || v.unitId || v.base_id || v.target_uid || v.shooter || null;
    }

    function markerUid(marker) {
        var data = obj(marker && marker._unitData);
        var red = obj(marker && marker._wgRedMeta);
        var blue = obj(marker && marker._wgBlueMeta);
        return uidOf(data) || red.uid || blue.uid || red.base_id || blue.base_id || null;
    }

    function findScenarioMarker(uid) {
        if (!uid || !root.AppAdjudicatorMap || typeof root.AppAdjudicatorMap.getScenarioMarkers !== 'function') return null;
        var groups;
        try { groups = root.AppAdjudicatorMap.getScenarioMarkers(); } catch (_) { return null; }
        var markers = arr(groups && groups.red).concat(arr(groups && groups.blue));
        for (var i = 0; i < markers.length; i++) {
            if (markerUid(markers[i]) === uid) return markers[i];
        }
        return null;
    }

    function findEntityInWorldState(ws, uid) {
        if (!uid || !ws) return null;
        var d = obj(ws.derived);
        var maps = [
            d.units_by_uid, d.unit_by_uid, d.units,
            ws.units_by_uid, ws.unit_by_uid
        ];
        for (var i = 0; i < maps.length; i++) {
            var m = maps[i];
            if (m && !Array.isArray(m) && typeof m === 'object' && m[uid]) return m[uid];
        }
        var lists = []
            .concat(arr(d.units))
            .concat(arr(ws.units))
            .concat(arr(ws.red_units))
            .concat(arr(ws.blue_units))
            .concat(arr(ws.blue_units_initial))
            .concat(arr(ws.red_units_initial));
        for (var j = 0; j < lists.length; j++) {
            if (uidOf(lists[j]) === uid) return lists[j];
        }
        return null;
    }

    function resolveLatLng(ws, uid, fallback) {
        return toLatLng(fallback)
            || toLatLng(findScenarioMarker(uid))
            || toLatLng(findEntityInWorldState(ws, uid));
    }

    function firstRangeNm(ev, field) {
        if (finite(ev && ev[field])) return num(ev[field]);
        var records = arr(ev && ev.records);
        for (var i = 0; i < records.length; i++) {
            if (finite(records[i] && records[i][field])) return num(records[i][field]);
        }
        return null;
    }

    function firstRawLatLng(ev, prefix) {
        var records = arr(ev && ev.records);
        for (var i = 0; i < records.length; i++) {
            var rec = records[i] || {};
            var ll = prefix === 'target'
                ? toLatLng({ target_lat: rec.target_lat || rec.lat, target_lon: rec.target_lon || rec.lon || rec.lng })
                : toLatLng(rec);
            if (ll) return ll;
            if (rec.raw) {
                ll = prefix === 'target'
                    ? toLatLng({ target_lat: rec.raw.target_lat || rec.raw.lat, target_lon: rec.raw.target_lon || rec.raw.lon || rec.raw.lng })
                    : toLatLng(rec.raw);
                if (ll) return ll;
            }
        }
        return null;
    }

    function buildTooltip(state) {
        var parts = [
            '<strong>' + esc(state.status) + ': ' + esc(state.reason_code || 'ready') + '</strong>',
            esc(state.reason_label_ar || ''),
            'Source: ' + esc(state.source || 'Contact + engagement derived evidence')
        ];
        if (state.weapon_range_meters) parts.push('Weapon range: ' + Math.round(state.weapon_range_meters / NM_TO_METERS) + ' nm');
        if (state.sensor_range_meters) parts.push('Sensor/contact range: ' + Math.round(state.sensor_range_meters / NM_TO_METERS) + ' nm');
        return parts.filter(Boolean).join('<br>');
    }

    function buildOverlayState(worldStateOrProvider, unit, opts) {
        opts = opts || {};
        var ws = (typeof worldStateOrProvider === 'function') ? worldStateOrProvider() : worldStateOrProvider;
        var uid = opts.uid || uidOf(unit);
        var DC = localDecisionApi();
        var CE = localContactApi();
        var EE = localEngagementApi();
        var decision = DC && typeof DC.getUnitDecisionChainEvidence === 'function'
            ? DC.getUnitDecisionChainEvidence(ws, uid)
            : { final_status: 'Unknown', blocking_reason_code: 'unknown_reason' };
        var contact = CE && typeof CE.getUnitContactEvidence === 'function'
            ? CE.getUnitContactEvidence(ws, uid)
            : obj(decision.contact);
        var engagement = EE && typeof EE.getUnitEngagementWhyNot === 'function'
            ? EE.getUnitEngagementWhyNot(ws, uid)
            : obj(decision.engagement);

        var targetUid = engagement.target_uid || contact.target_uid || opts.target_uid || null;
        var shooterLatLng = resolveLatLng(ws, uid, opts.shooterLatLng || unit);
        var targetLatLng = resolveLatLng(ws, targetUid, opts.targetLatLng)
            || firstRawLatLng(engagement, 'target')
            || firstRawLatLng(contact, 'target');
        var status = decision.final_status || (engagement.can_engage ? 'Ready' : 'Unknown');
        var reason = status === 'Ready'
            ? null
            : (decision.blocking_reason_code || engagement.reason_code || contact.reason_code || null);
        var weaponRangeNm = firstRangeNm(engagement, 'max_range_nm');
        var sensorRangeNm = firstRangeNm(contact, 'max_range_nm');

        var state = {
            uid: uid,
            target_uid: targetUid,
            status: status,
            reason_code: reason,
            reason_label_ar: reason ? reasonLabelAr(reason) : 'جاهز',
            source: 'Contact + engagement derived evidence',
            shooter_latlng: shooterLatLng,
            target_latlng: targetLatLng,
            weapon_range_meters: weaponRangeNm == null ? null : Math.max(0, weaponRangeNm * NM_TO_METERS),
            sensor_range_meters: sensorRangeNm == null ? null : Math.max(0, sensorRangeNm * NM_TO_METERS),
            target_line: shooterLatLng && targetLatLng ? [shooterLatLng, targetLatLng] : null,
            decision: decision,
            contact: contact,
            engagement: engagement
        };
        state.tooltip_html = buildTooltip(state);
        return state;
    }

    function clearOverlay(map) {
        map = map || root.map;
        if (overlayLayer && map && typeof map.removeLayer === 'function') {
            try { map.removeLayer(overlayLayer); } catch (_) {}
        }
        overlayLayer = null;
        lastOverlayState = null;
    }

    function addTooltip(layer, html) {
        if (layer && typeof layer.bindTooltip === 'function') {
            try { layer.bindTooltip(html, { sticky: true, direction: 'top', className: 'cmo-map-evidence-tooltip' }); } catch (_) {}
        }
        return layer;
    }

    function renderOverlay(state, map) {
        map = map || root.map;
        clearOverlay(map);
        lastOverlayState = state || null;
        if (!state || !map || !root.L || typeof root.L.layerGroup !== 'function') return state;
        var L = root.L;
        var color = STATUS_COLORS[state.status] || STATUS_COLORS.Unknown;
        overlayLayer = L.layerGroup();

        if (state.shooter_latlng && state.weapon_range_meters && typeof L.circle === 'function') {
            addTooltip(L.circle(state.shooter_latlng, {
                radius: state.weapon_range_meters,
                color: color,
                weight: 2,
                opacity: 0.85,
                fillColor: color,
                fillOpacity: 0.045,
                dashArray: state.status === 'Ready' ? null : '7 5',
                interactive: true,
                className: 'cmo-map-evidence-ring cmo-map-evidence-weapon'
            }), state.tooltip_html).addTo(overlayLayer);
        }

        if (state.shooter_latlng && state.sensor_range_meters && typeof L.circle === 'function') {
            addTooltip(L.circle(state.shooter_latlng, {
                radius: state.sensor_range_meters,
                color: '#38bdf8',
                weight: 1.4,
                opacity: 0.75,
                fill: false,
                dashArray: '4 6',
                interactive: true,
                className: 'cmo-map-evidence-ring cmo-map-evidence-sensor'
            }), state.tooltip_html).addTo(overlayLayer);
        }

        if (state.target_line && typeof L.polyline === 'function') {
            addTooltip(L.polyline(state.target_line, {
                color: color,
                weight: 2.5,
                opacity: 0.9,
                dashArray: state.status === 'Ready' ? null : '9 6',
                interactive: true,
                className: 'cmo-map-evidence-line'
            }), state.tooltip_html).addTo(overlayLayer);
        }

        if (state.shooter_latlng && typeof L.circleMarker === 'function') {
            addTooltip(L.circleMarker(state.shooter_latlng, {
                radius: 9,
                color: color,
                weight: 2.5,
                opacity: 0.95,
                fillColor: color,
                fillOpacity: 0.45,
                interactive: true,
                className: 'cmo-map-evidence-status'
            }), state.tooltip_html).addTo(overlayLayer);
        }

        try { overlayLayer.addTo(map); } catch (_) {}
        try {
            if (root.RmoozCmoEvidenceTimeline && typeof root.RmoozCmoEvidenceTimeline.observeOverlay === 'function') {
                root.RmoozCmoEvidenceTimeline.observeOverlay(state.uid, state);
            }
        } catch (_) {}
        return state;
    }

    function renderForUnit(unit, opts) {
        opts = opts || {};
        var mapApi = root.AppAdjudicatorMap;
        var wsProvider = opts.worldState || function () {
            return mapApi && typeof mapApi.getWorldState === 'function' ? mapApi.getWorldState() : null;
        };
        var state = buildOverlayState(wsProvider, unit, opts);
        return renderOverlay(state, opts.map || root.map);
    }

    function init() {
        if (!root.document || typeof root.document.addEventListener !== 'function') return;
        root.document.addEventListener('rmooz:unit-selected', function (e) {
            var unit = e && e.detail && e.detail.unit;
            if (unit) renderForUnit(unit);
        });
        root.document.addEventListener('rmooz:unit-cleared', function () { clearOverlay(); });
    }

    var api = {
        EVIDENCE_MAP_OVERLAYS_VERSION: EVIDENCE_MAP_OVERLAYS_VERSION,
        REASON_LABELS_AR: REASON_LABELS_AR,
        reasonLabelAr: reasonLabelAr,
        toLatLng: toLatLng,
        buildOverlayState: buildOverlayState,
        renderOverlay: renderOverlay,
        renderForUnit: renderForUnit,
        clearOverlay: clearOverlay,
        getLastOverlayState: function () { return lastOverlayState; }
    };

    root.AppEvidenceMapOverlays = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    init();
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
