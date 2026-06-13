/* ============================================================================
 * free-fight-demo.js — DOC-UNDERSTANDING-1 / FREE-FIGHT-DEMO-A
 * ----------------------------------------------------------------------------
 * A SYMBOLIC action–reaction demo on the multi-country Step 1 output:
 *   RED attacks Objective X  →  BLUE coalition reacts to protect / intercept.
 *
 * THIS IS NOT TACTICAL TRUTH and NOT a wargame:
 *   - no final tasking, no final COA, no weapons, no damage, no kill probability
 *   - no doctrine execution, no WHITE adjudication, no permanent world-state write
 *   - demo groups are temporary visual overlays (demo_only / review_only);
 *     exact_unit_position stays false; nothing is created/approved/journaled.
 *
 * Reuses RmoozDemoUnits.buildGroupsFromAnchors (groups anchored on
 * placement_candidates) + RmoozSymbolRegistry (glyphs) + RmoozBaseStatusPanel
 * (base markers still open the base card). Pure state + math run headless in
 * Node; the Leaflet layer + control panel render only when a map is present.
 *
 *   window.RmoozFreeFightDemo = {
 *     mount(payload)          — init + (browser) build panel/markers
 *     init(payload, opts)     — build groups; opts.objective reuses a set point
 *     setObjective({lat,lon}) — place/replace Objective X, re-select sample
 *     clearObjective()        — remove Objective X + the demo sample
 *     start() pause() reset() step() clear()
 *     getState() getGroups() getRed() getBlue() getObjective()
 *   }
 * ========================================================================== */
(function (root) {
    'use strict';

    var RED_ATTACK = 2, BLUE_REACT = 3;     // sample sizes (nearest to Objective X)
    var STEP = 0.1, TICK_MS = 90;
    var BLUE_RING = 0.35;                    // BLUE intercept standoff (fraction of anchor→obj dist)

    var _payload = null, _objective = null;
    var _allGroups = [], _red = [], _blue = [];
    var _progress = 0, _running = false, _paused = false, _timer = null;
    var _layer = null, _panel = null, _card = null;

    function W() { return (typeof window !== 'undefined') ? window : root; }
    function mapReady() { var w = W(); return !!(w && w.L && w.map && typeof w.L.layerGroup === 'function'); }
    function num(v) { var n = Number(v); return Number.isFinite(n) ? n : null; }
    function cloneLL(o) { return o ? { lat: num(o.lat), lon: num(o.lon) } : null; }
    function finiteLL(o) { return !!(o && Number.isFinite(o.lat) && Number.isFinite(o.lon)); }
    function lerp(a, b, t) { return { lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t }; }
    function dist2(a, b) { var dx = a.lat - b.lat, dy = a.lon - b.lon; return dx * dx + dy * dy; }
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
    function clearTimer() { if (_timer) { try { clearInterval(_timer); } catch (_) {} _timer = null; } }

    // Reuse a set objective if the brief already has one; else null (operator places it).
    function deriveObjective(payload) {
        var ob = (payload && payload.brief && payload.brief.operational_brief) || (payload && payload.operational_brief) || {};
        var objs = Array.isArray(ob.objectives) ? ob.objectives : [];
        for (var i = 0; i < objs.length; i++) {
            var o = objs[i];
            if (o && Array.isArray(o.coord) && o.coord.length >= 2 && Number.isFinite(+o.coord[0]) && Number.isFinite(+o.coord[1])) {
                return { lat: +o.coord[1], lon: +o.coord[0] };   // coord = [lon,lat]
            }
            if (o && Number.isFinite(+o.lat) && Number.isFinite(+o.lon)) return { lat: +o.lat, lon: +o.lon };
        }
        var ao = ob.area_of_operations || {};
        if (Array.isArray(ao.center) && ao.center.length === 2 && Number.isFinite(+ao.center[0]) && Number.isFinite(+ao.center[1])) {
            return { lat: +ao.center[1], lon: +ao.center[0] };
        }
        return null;
    }

    function buildGroups(payload) {
        var DU = (W() && W().RmoozDemoUnits) || (typeof require === 'function' ? safeRequire() : null);
        var groups = (DU && typeof DU.buildGroupsFromAnchors === 'function') ? DU.buildGroupsFromAnchors(payload) : [];
        if (!groups.length && DU && typeof DU.buildDemoUnits === 'function') groups = DU.buildDemoUnits(payload).groups || [];
        return groups.filter(function (g) { return finiteLL(g && g.anchor); });
    }
    function safeRequire() { try { return require('./demo-units.js'); } catch (_) { return null; } }

    // BLUE intercept point: a defensive standoff between Objective X and the BLUE
    // group's home base (on the bearing from X toward that base).
    function interceptPoint(anchor, obj) {
        return lerp(obj, anchor, BLUE_RING);
    }

    function selectSample() {
        _red = []; _blue = [];
        if (!finiteLL(_objective)) return;
        var reds = _allGroups.filter(function (g) { return g.side === 'RED'; }).slice();
        var blues = _allGroups.filter(function (g) { return g.side === 'BLUE'; }).slice();
        reds.sort(function (a, b) { return dist2(a.anchor, _objective) - dist2(b.anchor, _objective); });
        blues.sort(function (a, b) { return dist2(a.anchor, _objective) - dist2(b.anchor, _objective); });
        _red = reds.slice(0, RED_ATTACK).map(function (g) { return prep(g, 'RED', cloneLL(_objective)); });
        _blue = blues.slice(0, BLUE_REACT).map(function (g) { return prep(g, 'BLUE', interceptPoint(g.anchor, _objective)); });
    }
    function prep(g, role, target) {
        return {
            id: g.id, side: g.side, role: role, country: g.country, country_key: g.country_key,
            base_name_ar: g.base_name_ar, base_name_en: g.base_name_en, site_type: g.site_type,
            category_counts: g.category_counts || {}, total: g.total || 0, member_ids: g.member_ids || [],
            anchor: cloneLL(g.anchor), target: target, current: cloneLL(g.anchor),
            phase: 'staged', demo_only: true, review_only: true, exact_unit_position: false, movement_status: 'demo',
        };
    }

    function phaseFor(role, p) {
        if (p <= 0) return 'staged';
        if (p < 0.5) return 'moving';
        if (p < 0.9) return role === 'RED' ? 'approaching objective' : 'reacting';
        return 'holding';
    }

    function init(payload, opts) {
        clearTimer();
        opts = opts || {};
        _payload = payload || {};
        _allGroups = buildGroups(_payload);
        _objective = finiteLL(opts.objective) ? cloneLL(opts.objective) : deriveObjective(_payload);
        _progress = 0; _running = false; _paused = false;
        selectSample();
        return getState();
    }
    function setObjective(latlon) {
        _objective = finiteLL(cloneLL(latlon)) ? cloneLL(latlon) : null;
        _progress = 0; _running = false; _paused = false; clearTimer();
        selectSample();
        if (mapReady()) { syncMarkers(); }
        updatePanel();
        return getState();
    }
    function clearObjective() {
        _objective = null; _red = []; _blue = []; _progress = 0; _running = false; _paused = false; clearTimer();
        if (mapReady()) syncMarkers();
        updatePanel();
        return getState();
    }
    function groups() { return _red.concat(_blue); }

    function step() {
        if (!_running || !finiteLL(_objective)) return;
        _progress = Math.min(1, _progress + STEP);
        groups().forEach(function (g) { g.current = lerp(g.anchor, g.target, _progress); g.phase = phaseFor(g.role, _progress); });
        if (_progress >= 1) { _running = false; clearTimer(); }
        if (mapReady()) syncMarkers();
        updatePanel();
    }
    function start() {
        if (!finiteLL(_objective) || !groups().length) return getState();
        _running = true; _paused = false;
        if (mapReady() && typeof setInterval === 'function') { clearTimer(); _timer = setInterval(step, TICK_MS); }
        updatePanel();
        return getState();
    }
    function pause() { _running = false; _paused = true; clearTimer(); updatePanel(); return getState(); }
    function reset() {
        _running = false; _paused = false; _progress = 0; clearTimer();
        groups().forEach(function (g) { g.current = cloneLL(g.anchor); g.phase = 'staged'; });
        if (mapReady()) syncMarkers();
        updatePanel();
        return getState();
    }

    function getState() {
        return {
            running: _running, paused: _paused, progress: _progress,
            objective: _objective ? cloneLL(_objective) : null, objective_set: finiteLL(_objective),
            red_groups: _red.length, blue_groups: _blue.length, all_groups: _allGroups.length,
            demo_only: true, review_only: true,
        };
    }
    function getGroups() { return groups(); }
    function getRed() { return _red; }
    function getBlue() { return _blue; }
    function getObjective() { return _objective ? cloneLL(_objective) : null; }

    // ── Browser-only rendering (guarded) ─────────────────────────────────
    var COUNTRY_COLORS = { iran: '#f0707a', uae: '#5bd6a0', qatar: '#7bb8e8', bahrain: '#d9b34a', kuwait: '#b893e0', oman: '#5fc7c7', ksa: '#7fd6a0' };
    function colorFor(g) { return COUNTRY_COLORS[g.country_key] || (g.side === 'RED' ? '#f0a0a0' : '#7fd6a0'); }
    function dominant(g) {
        var best = 'unknown', n = -1, cc = g.category_counts || {};
        Object.keys(cc).forEach(function (k) { if (cc[k] > n) { n = cc[k]; best = k; } });
        return best;
    }
    function groupGlyph(g) {
        var REG = W() && W().RmoozSymbolRegistry;
        if (REG && REG.platformSymbol) { var s = REG.platformSymbol(dominant(g)); return (s && s.glyph) || '▢'; }
        return g.role === 'RED' ? '▲' : '◆';
    }
    function markerLatLng(g) { return [g.current.lat, g.current.lon]; }

    function syncMarkers() {
        var w = W();
        if (!mapReady()) return;
        if (!_layer) { _layer = w.L.layerGroup(); _layer.addTo(w.map); }
        _layer.clearLayers();
        // Objective X
        if (finiteLL(_objective)) {
            var objIcon = w.L.divIcon({ className: 'rmooz-ff-objective', html: '<div title="Objective X — review only" style="width:26px;height:26px;border-radius:50%;border:2px dashed #e0c060;background:rgba(224,192,96,.18);display:flex;align-items:center;justify-content:center;color:#ffe28a;font-size:14px;">◉</div>', iconSize: [28, 28], iconAnchor: [14, 14] });
            var om = w.L.marker([_objective.lat, _objective.lon], { icon: objIcon, interactive: true, keyboard: false, title: 'Objective X — review only / الهدف X' });
            om._rmoozReviewOnly = true; om._rmoozObjectiveX = true;
            om.bindPopup('<div style="font-size:12px;color:#e8eaed;background:#0e1620;"><b>Objective X — الهدف X</b><br>review only · not final tasking<br>عقيدة غير مرفوعة / Doctrine pending</div>');
            _layer.addLayer(om);
        }
        groups().forEach(function (g) {
            if (!finiteLL(g.current)) return;
            var color = colorFor(g);
            var icon = w.L.divIcon({
                className: 'rmooz-ff-group rmooz-ff-' + g.role.toLowerCase(),
                html: '<div title="' + esc(g.role + ' demo group') + '" style="display:flex;align-items:center;gap:3px;">' +
                    '<span style="width:15px;height:15px;border-radius:3px;background:' + color + ';border:2px solid ' + (g.role === 'RED' ? '#8f1f1f' : '#1f7a4d') + ';box-shadow:0 0 0 2px rgba(255,255,255,.3);display:flex;align-items:center;justify-content:center;color:#0c1118;font-size:10px;">' + groupGlyph(g) + '</span>' +
                    '<span style="background:#0e1620;color:#e8eaed;border:1px solid ' + color + ';border-radius:3px;padding:0 4px;font-size:10px;font-weight:700;white-space:nowrap;">' + esc(g.country || g.side) + ' · ' + esc(g.phase) + '</span></div>',
                iconSize: [120, 18], iconAnchor: [7, 9],
            });
            var m = w.L.marker(markerLatLng(g), { icon: icon, interactive: true, keyboard: false, title: g.role + ' demo group — not final tasking' });
            m._rmoozDemoOnly = true; m._rmoozReviewOnly = true; m._rmoozExactUnitPosition = false;
            if (typeof m.on === 'function') m.on('click', function () { openDemoUnitCard(g); });
            _layer.addLayer(m);
        });
    }

    // Simple demo unit card (NOT the base card) — review-only.
    function openDemoUnitCard(g) {
        var w = W();
        if (!w || !w.document || !w.document.body) return;
        if (_card && _card.parentNode) _card.parentNode.removeChild(_card);
        _card = w.document.createElement('div');
        _card.id = 'rmooz-ff-demo-unit-card';
        _card.style.cssText = ['position:fixed', 'top:140px', 'right:24px', 'z-index:9960', 'background:#0e1620', 'border:1px solid ' + colorFor(g), 'border-radius:8px', 'padding:12px 14px', 'min-width:260px', 'box-shadow:0 4px 20px rgba(0,0,0,.65)', 'color:#e8eaed', 'font-family:inherit'].join(';');
        var cats = Object.keys(g.category_counts || {}).filter(function (k) { return g.category_counts[k] > 0; }).map(function (k) { return k + ' ' + g.category_counts[k]; }).join(' · ') || ('units ' + (g.total || 0));
        _card.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
            '<div style="font-weight:700;color:#cfe6ff;">Demo Unit Card — ' + esc(g.role) + '</div>' +
            '<button data-act="x" style="background:transparent;border:none;color:#8fa5b8;cursor:pointer;font-size:15px;">✕</button></div>' +
            '<div style="font-size:12px;line-height:1.7;">' +
            'country: <b>' + esc(g.country || '-') + '</b><br>side: <b>' + esc(g.side) + '</b><br>' +
            'source base: <b>' + esc(g.base_name_en || g.base_name_ar || '-') + '</b><br>' +
            'grouped platforms: ' + esc(cats) + '<br>phase: ' + esc(g.phase) + '<br>' +
            '<span style="color:#e0c060;">demo_only:true · review_only:true · exact_unit_position:false</span></div>' +
            '<div style="margin-top:8px;padding:5px 7px;border-radius:4px;background:#2a2412;border:1px solid #b8860b;color:#e0c060;font-size:11px;">Demo only — not final tasking — requires commander approval<br>حركة تجريبية فقط — ليست إسناد واجب نهائي — تحتاج اعتماد القائد</div>';
        w.document.body.appendChild(_card);
        var x = _card.querySelector('[data-act="x"]'); if (x) x.addEventListener('click', function () { if (_card && _card.parentNode) _card.parentNode.removeChild(_card); _card = null; });
    }

    // ── Control panel (Start / Pause / Reset / Clear Objective X + labels) ──
    function buildPanel() {
        var w = W();
        if (!w || !w.document || !w.document.body) return;
        if (_panel && _panel.parentNode) _panel.parentNode.removeChild(_panel);
        _panel = w.document.createElement('div');
        _panel.id = 'rmooz-free-fight-panel';
        _panel.style.cssText = ['position:fixed', 'top:128px', 'left:18px', 'z-index:9955', 'background:#0e1620', 'border:1px solid #7a3030', 'border-radius:8px', 'padding:12px 14px', 'min-width:320px', 'box-shadow:0 4px 20px rgba(0,0,0,.65)', 'color:#e8eaed', 'font-family:inherit', 'direction:ltr'].join(';');
        w.document.body.appendChild(_panel);
        updatePanel();
    }
    function updatePanel() {
        if (!_panel) return;
        var st = getState();
        var objLine = st.objective_set
            ? ('Objective X set · RED attack ' + st.red_groups + ' / BLUE react ' + st.blue_groups + ' · progress ' + Math.round(st.progress * 100) + '%' + (st.running ? ' · running' : (st.paused ? ' · paused' : '')))
            : 'No Objective X — place it on the map to begin.';
        var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
            '<div style="font-weight:700;color:#f0a0a0;font-size:13px;">Free Fight Demo — قتال تجريبي</div>' +
            '<button data-act="close" style="background:transparent;border:none;color:#8fa5b8;cursor:pointer;font-size:16px;">✕</button></div>';
        if (!st.objective_set) {
            html += '<button data-act="place-obj" style="font:inherit;cursor:pointer;border:1px solid #b8860b;background:#2a2412;color:#e0c060;border-radius:5px;padding:6px 10px;margin-bottom:8px;">＋ Place Objective X — ضع الهدف X</button>';
        }
        html += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">' +
            '<button data-act="start" style="font:inherit;cursor:pointer;border:1px solid #2e7d54;background:#1f3a2b;color:#7fd6a0;border-radius:5px;padding:5px 10px;">▶ Start Free Fight Demo</button>' +
            '<button data-act="pause" style="font:inherit;cursor:pointer;border:1px solid #8a6a20;background:#2a2412;color:#e0c060;border-radius:5px;padding:5px 10px;">⏸ Pause</button>' +
            '<button data-act="reset" style="font:inherit;cursor:pointer;border:1px solid #5a6270;background:#2a2f37;color:#e8eaed;border-radius:5px;padding:5px 10px;">⟲ Reset</button>' +
            '<button data-act="clear-obj" style="font:inherit;cursor:pointer;border:1px solid #7a3030;background:#241414;color:#f0a0a0;border-radius:5px;padding:5px 10px;">✕ Clear Objective X</button></div>';
        html += '<div style="font-size:11px;color:#9aa3ad;margin-bottom:4px;">' + esc(objLine) + '</div>';
        html += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px;font-size:11px;">' +
            '<span style="color:#f0a0a0;">RED demo attack — هجوم تجريبي للطرف الأحمر</span> · ' +
            '<span style="color:#7fd6a0;">BLUE demo reaction — رد فعل تجريبي للطرف الأزرق</span></div>';
        html += '<div style="padding:6px 8px;border-radius:5px;background:#2a2412;border:1px solid #b8860b;color:#e0c060;font-size:11px;line-height:1.5;">' +
            '⚠ Demo only — not final tasking — requires commander approval<br>' +
            'حركة تجريبية فقط — ليست إسناد واجب نهائي — تحتاج اعتماد القائد</div>';
        _panel.innerHTML = html;
        bind('start', start); bind('pause', pause); bind('reset', reset); bind('clear-obj', clearObjective); bind('close', clear);
        bind('place-obj', armPlaceObjective);
    }
    function bind(act, fn) { if (!_panel) return; var b = _panel.querySelector('[data-act="' + act + '"]'); if (b && b.addEventListener) b.addEventListener('click', fn); }

    // Arm a one-shot map click to place Objective X (review-only).
    function armPlaceObjective() {
        var w = W();
        if (!mapReady()) return;
        if (_panel) { var b = _panel.querySelector('[data-act="place-obj"]'); if (b) b.textContent = 'Click the map to place Objective X…'; }
        var handler = function (e) {
            w.map.off('click', handler);
            if (e && e.latlng) setObjective({ lat: e.latlng.lat, lon: e.latlng.lng });
        };
        w.map.on('click', handler);
    }

    function clear() {
        pause();
        var w = W();
        if (_layer && mapReady()) { try { if (w.map.hasLayer(_layer)) w.map.removeLayer(_layer); } catch (_) {} }
        _layer = null;
        if (_panel && _panel.parentNode) _panel.parentNode.removeChild(_panel); _panel = null;
        if (_card && _card.parentNode) _card.parentNode.removeChild(_card); _card = null;
        _red = []; _blue = []; _allGroups = []; _objective = null; _progress = 0; _running = false; _paused = false;
    }

    function mount(payload, opts) {
        init(payload, opts);
        if (mapReady()) { syncMarkers(); buildPanel(); }
        return getState();
    }

    var API = {
        mount: mount, init: init, setObjective: setObjective, clearObjective: clearObjective,
        start: start, pause: pause, reset: reset, step: step, clear: clear,
        getState: getState, getGroups: getGroups, getRed: getRed, getBlue: getBlue, getObjective: getObjective,
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = API;
    if (typeof window !== 'undefined') window.RmoozFreeFightDemo = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
