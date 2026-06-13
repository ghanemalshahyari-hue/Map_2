/* ============================================================================
 * demo-movement.js — DOC-UNDERSTANDING-1 / MULTI-COUNTRY-DEMO-A
 * ----------------------------------------------------------------------------
 * A SYMBOLIC demo-movement controller for the multi-country Step 1 coalition.
 * It converts proposed_units → demo_units (via RmoozDemoUnits), groups them per
 * base anchor, selects a small sample (3 BLUE + 2 RED groups), and glides those
 * groups from their base anchor toward the scenario centre.
 *
 * THIS IS NOT TACTICAL TRUTH. Movement is illustrative only:
 *   - not doctrinally correct, not final tasking, not adjudication
 *   - no weapons effects, no damage, no world-state / scenario mutation
 *   - demo markers are temporary visual overlays (demo_only / review_only)
 *
 * Pure state + math (init / start / pause / reset / step / getGroups / getState)
 * run headless in Node; the Leaflet layer + control panel render only when a map
 * is present (mapReady). Group markers open the Base Status Panel on click.
 *
 *   window.RmoozDemoMovement = {
 *     mount(payload)  — init + (browser) build panel/markers
 *     init(payload)   — build demo units/groups + sample + objective (no DOM)
 *     start() pause() reset() step() clear()
 *     getGroups() getAllGroups() getDemoUnits() getState()
 *   }
 * ========================================================================== */
(function (root) {
    'use strict';

    var SAMPLE_BLUE = 3, SAMPLE_RED = 2;
    var STEP = 0.1, TICK_MS = 90;

    var _payload = null;
    var _demoUnits = [];
    var _allGroups = [];
    var _groups = [];          // the moving sample
    var _objective = null;     // { lat, lon }
    var _progress = 0;
    var _running = false, _paused = false;
    var _timer = null;
    var _layer = null, _panel = null;

    function W() { return (typeof window !== 'undefined') ? window : root; }
    function mapReady() { var w = W(); return !!(w && w.L && w.map && typeof w.L.layerGroup === 'function'); }
    function clone(o) { return o ? { lat: o.lat, lon: o.lon } : { lat: null, lon: null }; }
    function finiteAnchor(g) { return g && g.anchor && Number.isFinite(Number(g.anchor.lat)) && Number.isFinite(Number(g.anchor.lon)); }
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }

    function centroid(groups) {
        var n = 0, lat = 0, lon = 0;
        groups.forEach(function (g) { if (finiteAnchor(g)) { lat += Number(g.anchor.lat); lon += Number(g.anchor.lon); n++; } });
        return n ? { lat: lat / n, lon: lon / n } : null;
    }
    function lerp(a, b, t) { return { lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t }; }

    // 3 BLUE (preferring distinct countries) + 2 RED, deterministic order.
    function pickSample(groups) {
        var blue = groups.filter(function (g) { return g.side === 'BLUE'; });
        var red = groups.filter(function (g) { return g.side === 'RED'; });
        return diverseByCountry(blue, SAMPLE_BLUE).concat(red.slice(0, SAMPLE_RED));
    }
    function diverseByCountry(list, n) {
        var seen = {}, first = [], rest = [];
        list.forEach(function (g) { var k = g.country_key || g.country || g.id; if (!seen[k]) { seen[k] = 1; first.push(g); } else rest.push(g); });
        return first.concat(rest).slice(0, n);
    }

    function init(payload) {
        clearTimer();
        _payload = payload || {};
        var DU = (W() && W().RmoozDemoUnits) || (typeof require === 'function' ? safeRequire() : null);
        var built = DU && typeof DU.buildDemoUnits === 'function' ? DU.buildDemoUnits(_payload) : { demo_units: [], groups: [] };
        _demoUnits = built.demo_units || [];
        // Prefer anchor-based groups (placement_candidates carry coords); fall
        // back to proposed-unit grouping when there are no map anchors.
        var anchorGroups = (DU && typeof DU.buildGroupsFromAnchors === 'function') ? DU.buildGroupsFromAnchors(_payload) : [];
        var src = anchorGroups.length ? anchorGroups : (built.groups || []);
        _allGroups = src.filter(finiteAnchor);
        _objective = centroid(_allGroups);
        _groups = pickSample(_allGroups).map(function (g) {
            var anchor = clone(g.anchor);
            return Object.assign({}, g, { anchor: anchor, current: clone(anchor), _voff: visualOffset(g) });
        });
        _progress = 0; _running = false; _paused = false;
        return getState();
    }
    function safeRequire() { try { return require('./demo-units.js'); } catch (_) { return null; } }

    // Small, deterministic per-group visual jitter so the demo marker sits NEAR
    // (not exactly on) the base anchor — reinforcing exact_unit_position:false.
    function visualOffset(g) {
        var seed = 0, s = String(g.id || '');
        for (var i = 0; i < s.length; i++) seed = (seed + s.charCodeAt(i)) % 8;
        var ang = (seed / 8) * 2 * Math.PI;
        return { lat: Math.sin(ang) * 0.05, lon: Math.cos(ang) * 0.05 };
    }

    function step() {
        if (!_running) return;
        _progress = Math.min(1, _progress + STEP);
        if (_objective) _groups.forEach(function (g) { g.current = lerp(g.anchor, _objective, _progress); });
        if (_progress >= 1) { _running = false; clearTimer(); }
        if (mapReady()) syncMarkers();
        updatePanel();
    }
    function start() {
        if (!_groups.length) return getState();
        _running = true; _paused = false;
        if (mapReady() && typeof setInterval === 'function') { clearTimer(); _timer = setInterval(step, TICK_MS); }
        updatePanel();
        return getState();
    }
    function pause() { _running = false; _paused = true; clearTimer(); updatePanel(); return getState(); }
    function reset() {
        _running = false; _paused = false; _progress = 0; clearTimer();
        _groups.forEach(function (g) { g.current = clone(g.anchor); });
        if (mapReady()) syncMarkers();
        updatePanel();
        return getState();
    }
    function clearTimer() { if (_timer) { try { clearInterval(_timer); } catch (_) {} _timer = null; } }

    function getGroups() { return _groups; }
    function getAllGroups() { return _allGroups; }
    function getDemoUnits() { return _demoUnits; }
    function getState() {
        return {
            running: _running, paused: _paused, progress: _progress, objective: _objective,
            group_count: _groups.length, demo_unit_count: _demoUnits.length,
            sample_blue: _groups.filter(function (g) { return g.side === 'BLUE'; }).length,
            sample_red: _groups.filter(function (g) { return g.side === 'RED'; }).length,
            demo_only: true, review_only: true,
        };
    }

    // ── Browser-only rendering (guarded; never runs headless) ─────────────
    var COUNTRY_COLORS = { iran: '#f0707a', uae: '#5bd6a0', qatar: '#7bb8e8', bahrain: '#d9b34a', kuwait: '#b893e0', oman: '#5fc7c7', ksa: '#7fd6a0' };
    function colorFor(g) { return COUNTRY_COLORS[g.country_key] || (g.side === 'RED' ? '#f0a0a0' : (g.side === 'BLUE' ? '#7fd6a0' : '#cfe6ff')); }
    function groupSummary(g) {
        var parts = [];
        Object.keys(g.category_counts || {}).forEach(function (k) { if (g.category_counts[k] > 0) parts.push(k + ' ' + g.category_counts[k]); });
        return parts.join(' · ') || ('units ' + (g.total || 0));
    }
    function markerLatLng(g) { return [g.current.lat + g._voff.lat, g.current.lon + g._voff.lon]; }

    function syncMarkers() {
        var w = W();
        if (!mapReady()) return;
        if (!_layer) { _layer = w.L.layerGroup(); _layer.addTo(w.map); }
        _layer.clearLayers();
        _groups.forEach(function (g) {
            if (!Number.isFinite(g.current.lat) || !Number.isFinite(g.current.lon)) return;
            var color = colorFor(g);
            var icon = w.L.divIcon({
                className: 'rmooz-demo-move-marker',
                html: '<div style="display:flex;align-items:center;gap:3px;">' +
                    '<span style="width:14px;height:14px;border-radius:3px;background:' + color + ';border:2px solid #0c1118;box-shadow:0 0 0 2px rgba(255,255,255,.35);"></span>' +
                    '<span style="background:#0e1620;color:#e8eaed;border:1px solid ' + color + ';border-radius:3px;padding:0 4px;font-size:10px;font-weight:700;white-space:nowrap;">' +
                    esc(g.country || g.side) + '</span></div>',
                iconSize: [80, 18], iconAnchor: [7, 9],
            });
            var m = w.L.marker(markerLatLng(g), { icon: icon, interactive: true, keyboard: false, title: 'Demo movement — not final tasking' });
            m._rmoozDemoOnly = true; m._rmoozReviewOnly = true; m._rmoozExactUnitPosition = false;
            m.bindPopup('<div style="font-size:12px;color:#e8eaed;background:#0e1620;min-width:180px;">' +
                '<b>' + esc(g.base_name_en || g.base_name_ar || 'Demo group') + '</b><br>' +
                'country: ' + esc(g.country || '-') + '<br>side: ' + esc(g.side) + '<br>' +
                'base: ' + esc(g.base_name_ar || g.base_name_en || '-') + '<br>' +
                'platforms: ' + esc(groupSummary(g)) + ' (total ' + (g.total || 0) + ')<br>' +
                '<span style="color:#e0c060;">review_only:true · demo_only:true · not final tasking</span><br>' +
                '<span style="color:#e0c060;">عقيدة غير مرفوعة / Doctrine pending</span></div>');
            if (typeof m.on === 'function') {
                m.on('click', function () {
                    if (w.RmoozBaseStatusPanel && typeof w.RmoozBaseStatusPanel.open === 'function') {
                        w.RmoozBaseStatusPanel.open({
                            base_name_ar: g.base_name_ar, base_name_en: g.base_name_en, side: g.side,
                            country: g.country, site_type: g.site_type, lat: g.anchor.lat, lon: g.anchor.lon,
                        }, _payload || {});
                    }
                });
            }
            _layer.addLayer(m);
        });
    }

    // ── Control panel (Start / Pause / Reset + mandatory demo labels) ─────
    function buildPanel() {
        var w = W();
        if (!w || !w.document || !w.document.body) return;
        if (_panel && _panel.parentNode) _panel.parentNode.removeChild(_panel);
        _panel = w.document.createElement('div');
        _panel.id = 'rmooz-demo-move-panel';
        _panel.style.cssText = ['position:fixed', 'top:128px', 'left:18px', 'z-index:9950', 'background:#0e1620',
            'border:1px solid #2e5d7d', 'border-radius:8px', 'padding:12px 14px', 'min-width:300px',
            'box-shadow:0 4px 20px rgba(0,0,0,.65)', 'color:#e8eaed', 'font-family:inherit', 'direction:ltr'].join(';');
        w.document.body.appendChild(_panel);
        updatePanel();
    }
    function updatePanel() {
        if (!_panel) return;
        var st = getState();
        var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
            '<div style="font-weight:700;color:#cfe6ff;font-size:13px;">Demo Movement — حركة عرض</div>' +
            '<button data-act="close" style="background:transparent;border:none;color:#8fa5b8;cursor:pointer;font-size:16px;">✕</button></div>' +
            '<div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap;">' +
            '<button data-act="start" style="font:inherit;cursor:pointer;border:1px solid #2e7d54;background:#1f3a2b;color:#7fd6a0;border-radius:5px;padding:5px 10px;">▶ Start Demo Movement</button>' +
            '<button data-act="pause" style="font:inherit;cursor:pointer;border:1px solid #8a6a20;background:#2a2412;color:#e0c060;border-radius:5px;padding:5px 10px;">⏸ Pause</button>' +
            '<button data-act="reset" style="font:inherit;cursor:pointer;border:1px solid #5a6270;background:#2a2f37;color:#e8eaed;border-radius:5px;padding:5px 10px;">⟲ Reset</button></div>' +
            '<div style="font-size:11px;color:#9aa3ad;margin-bottom:6px;">groups: ' + st.group_count + ' (BLUE ' + st.sample_blue + ' / RED ' + st.sample_red + ') · demo_units: ' + st.demo_unit_count + ' · progress: ' + Math.round(st.progress * 100) + '%' + (st.running ? ' · running' : (st.paused ? ' · paused' : '')) + '</div>' +
            '<div style="padding:6px 8px;border-radius:5px;background:#2a2412;border:1px solid #b8860b;color:#e0c060;font-size:11px;line-height:1.5;">' +
            '⚠ <b>Demo movement</b> · Not final tasking · Requires commander approval<br>' +
            'عقيدة غير مرفوعة / Doctrine pending · symbolic only — not tactical truth</div>';
        _panel.innerHTML = html;
        bind('start', start); bind('pause', pause); bind('reset', reset); bind('close', clear);
    }
    function bind(act, fn) { if (!_panel) return; var b = _panel.querySelector('[data-act="' + act + '"]'); if (b && b.addEventListener) b.addEventListener('click', fn); }

    function clear() {
        pause();
        var w = W();
        if (_layer && mapReady()) { try { if (w.map.hasLayer(_layer)) w.map.removeLayer(_layer); } catch (_) {} }
        _layer = null;
        if (_panel && _panel.parentNode) _panel.parentNode.removeChild(_panel);
        _panel = null;
        _groups = []; _allGroups = []; _demoUnits = []; _progress = 0; _running = false; _paused = false;
    }

    function mount(payload) {
        init(payload);
        if (mapReady()) { syncMarkers(); buildPanel(); }
        return getState();
    }

    var API = {
        mount: mount, init: init, start: start, pause: pause, reset: reset, step: step, clear: clear,
        getGroups: getGroups, getAllGroups: getAllGroups, getDemoUnits: getDemoUnits, getState: getState,
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = API;
    if (typeof window !== 'undefined') window.RmoozDemoMovement = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
