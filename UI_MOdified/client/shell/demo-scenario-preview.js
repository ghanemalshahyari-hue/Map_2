/* ============================================================================
 * demo-scenario-preview.js — DEMO-ACTUAL-1
 * ----------------------------------------------------------------------------
 * AI Decision-Making Scenario Preview. Builds a fast preview scenario from
 * an AI Understanding Review / External Step 1–2 payload without mutating any
 * existing scenario state. Shows preview units, bases/anchors, dashed movement
 * lines, and a step navigation panel on the map.
 *
 * Isolation guarantees:
 *   - Never touches window.RmoozScenario.stepIndex
 *   - Never mutates imported source JSON
 *   - Never mutates proposed_units
 *   - Never writes a final scenario or commits placement
 *   - Never calls live sim/commit paths
 *
 *   window.RmoozDemoPreview = {
 *     build(payload)   → Promise<preview> — POST generate-preview, render on map
 *     clear()          — remove all preview layers and step panel
 *     isActive()       → boolean
 *     stepTo(n)        — navigate to step n (clamped to valid range)
 *     getStepCount()   → number of decision steps in current preview
 *   }
 * ========================================================================== */
(function () {
    'use strict';

    // ── State ─────────────────────────────────────────────────────────────────
    var _active = false;
    var _stepIndex = 0;
    var _preview = null;
    var _baseLayer = null;   // Leaflet LayerGroup — base/anchor markers (step-invariant)
    var _stepLayer = null;   // Leaflet LayerGroup — unit markers + movement lines (per step)
    var _panel = null;       // DOM panel element

    // ── Utilities ─────────────────────────────────────────────────────────────
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"]/g, function (ch) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch];
        });
    }

    function mapReady() {
        return !!(window.L && window.map && typeof window.L.layerGroup === 'function');
    }

    function asObjectiveCoord(obj) {
        if (!obj) return null;
        var coord = obj.coord || obj.coords || obj.coordinates || obj.location;
        if (Array.isArray(coord) && coord.length >= 2 && Number.isFinite(Number(coord[0])) && Number.isFinite(Number(coord[1]))) {
            return { lon: Number(coord[0]), lat: Number(coord[1]) };
        }
        if (coord && typeof coord === 'object') {
            return asObjectiveCoord(coord);
        }
        if (obj.lon != null && obj.lat != null && Number.isFinite(Number(obj.lon)) && Number.isFinite(Number(obj.lat))) {
            return { lon: Number(obj.lon), lat: Number(obj.lat) };
        }
        if (obj.longitude != null && obj.latitude != null && Number.isFinite(Number(obj.longitude)) && Number.isFinite(Number(obj.latitude))) {
            return { lon: Number(obj.longitude), lat: Number(obj.latitude) };
        }
        return null;
    }

    function lineReviewHtml(line) {
        var step = line && line.step_label ? line.step_label : ('Step ' + (((line && line.step_index) || 0) + 1));
        return [
            '<div style="font-size:12px;color:#e8eaed;background:#0e1620;padding:5px;min-width:180px;">',
            '<b>' + esc(step) + '</b><br>',
            '<span style="color:#8fa5b8;">From:</span> ' + esc(line && line.from_label || 'unknown') + '<br>',
            '<span style="color:#8fa5b8;">To:</span> ' + esc(line && line.to_label || 'objective/area') + '<br>',
            '<span style="color:#e0c060;">approximate_route:true</span><br>',
            '<span style="color:#e0c060;">requires_review:true</span>',
            '</div>',
        ].join('');
    }

    function unitReviewHtml(u) {
        return [
            '<div style="font-size:12px;color:#e8eaed;background:#0e1620;padding:5px;min-width:180px;">',
            '<b>' + esc(u && (u.label || u.uid) || 'Preview unit') + '</b><br>',
            '<span style="color:#8fa5b8;">side:</span> ' + esc(u && u.side || 'unknown') + '<br>',
            '<span style="color:#8fa5b8;">role/platform:</span> ' + esc(u && (u.platform || u.role) || 'unknown') + '<br>',
            '<span style="color:#e0c060;">preview_only:true</span>',
            '</div>',
        ].join('');
    }

    function compactListHtml(items) {
        var list = Array.isArray(items) ? items.filter(Boolean).slice(0, 6) : [];
        if (!list.length) return '<span style="color:#8fa5b8;">review data pending</span>';
        return list.map(function (item) {
            return '<span style="display:inline-block;margin:0 4px 4px 0;padding:2px 6px;' +
                   'border:1px solid #2e5d7d;border-radius:3px;background:#121a22;color:#cfe6ff;">' +
                   esc(item) + '</span>';
        }).join('');
    }

    // ── Public API ────────────────────────────────────────────────────────────
    function isActive() { return _active; }

    function getStepCount() {
        return (_preview && Array.isArray(_preview.steps)) ? _preview.steps.length : 0;
    }

    function stepTo(n) {
        if (!_active || !_preview) return;
        var max = getStepCount() - 1;
        _stepIndex = Math.max(0, Math.min(max, typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : 0));
        if (mapReady()) renderStep(_stepIndex);
        if (_panel) updatePanel(_stepIndex);
    }

    function clear() {
        _active = false;
        _preview = null;
        _stepIndex = 0;
        _clearLayers();
        _clearPanel();
    }

    function build(payload) {
        clear();
        var objective = _deriveObjective(payload);
        // Compose body — never modify the original payload
        var brief = (payload && payload.brief) ? payload.brief : (payload || {});
        var body = { brief: brief };
        if (payload && payload.understanding) body.understanding = payload.understanding;
        if (objective) body.objective = objective;

        return window.fetch('/api/wargame-sim/generate-preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        })
        .then(function (r) { return r.json(); })
        .then(function (resp) {
            if (!resp || !resp.ok) throw new Error(resp && resp.error || 'Preview generation failed');
            var preview = resp.preview;
            if (!preview || !preview._isPreview) throw new Error('Server did not return a valid preview object');
            _preview = preview;
            _active = true;
            _stepIndex = 0;
            if (mapReady()) {
                _initLayers();
                _renderBases();
                renderStep(0);
            }
            _createPanel();
            return preview;
        });
    }

    // ── Objective derivation (never mutates payload) ──────────────────────────

    function _deriveObjective(payload) {
        var ob = (payload && payload.brief && payload.brief.operational_brief) ||
            (payload && payload.operational_brief) || {};

        // 1. User/operator-selected or explicit objective fields. These are the
        // only safe direct target sources for preview. Placement candidates are
        // bases/anchors and must never become Objective X by accident.
        var explicit = [
            payload && payload.objective,
            payload && payload.objective_x,
            payload && payload.selected_objective,
            payload && payload.review_objective,
            payload && payload.target_location,
            ob.objective,
            ob.objective_x,
            ob.selected_objective,
            ob.review_objective,
            ob.target_location
        ];
        for (var ei = 0; ei < explicit.length; ei++) {
            var ex = asObjectiveCoord(explicit[ei]);
            if (ex) return ex;
        }

        // 2. Brief objectives list. Prefer named/objective records over generic
        // area centers. Support coord arrays and lat/lon objects.
        var objectives = ob.objectives || ob.objectives_list || [];
        for (var oi = 0; oi < objectives.length; oi++) {
            var obj = asObjectiveCoord(objectives[oi]);
            if (obj) return obj;
        }

        // 3. Area of operations center is a fallback only. It is approximate and
        // should be treated as review-required by the preview route.
        var ao = ob.area_of_operations || {};
        if (Array.isArray(ao.center) && ao.center.length === 2 &&
            Number.isFinite(Number(ao.center[0])) && Number.isFinite(Number(ao.center[1]))) {
            return { lon: Number(ao.center[0]), lat: Number(ao.center[1]) };
        }
        if (ao.center && typeof ao.center === 'object') {
            var center = asObjectiveCoord(ao.center);
            if (center) return center;
        }

        return null;
    }

    // ── Layer management ──────────────────────────────────────────────────────

    function _clearLayers() {
        if (_baseLayer) {
            try { if (mapReady() && window.map.hasLayer(_baseLayer)) window.map.removeLayer(_baseLayer); } catch (_) {}
            _baseLayer = null;
        }
        if (_stepLayer) {
            try { if (mapReady() && window.map.hasLayer(_stepLayer)) window.map.removeLayer(_stepLayer); } catch (_) {}
            _stepLayer = null;
        }
    }

    function _initLayers() {
        if (!mapReady()) return;
        _baseLayer = window.L.layerGroup().addTo(window.map);
        _stepLayer = window.L.layerGroup().addTo(window.map);
    }

    function _anchorIcon() {
        return window.L.divIcon({
            className: 'rmooz-demo-preview-anchor',
            html: '<div style="width:22px;height:22px;border-radius:4px;background:#cfe6ff;' +
                  'border:2px solid #2e5d7d;box-shadow:0 0 0 2px rgba(207,230,255,.45);' +
                  'display:flex;align-items:center;justify-content:center;color:#0a1820;' +
                  'font-size:10px;font-weight:800;">A</div>',
            iconSize: [24, 24], iconAnchor: [12, 12],
        });
    }

    function _objectiveIcon() {
        return window.L.divIcon({
            className: 'rmooz-demo-preview-objective',
            html: '<div style="position:relative;width:28px;height:28px;border-radius:50%;' +
                  'border:2px dashed #e0c060;background:rgba(224,192,96,.16);' +
                  'box-shadow:0 0 0 3px rgba(224,192,96,.18);display:flex;align-items:center;' +
                  'justify-content:center;color:#ffe28a;font-size:11px;font-weight:800;">T</div>',
            iconSize: [32, 32], iconAnchor: [16, 16],
        });
    }

    function _unitIcon(unit) {
        var side = unit && unit.side === 'BLUE' ? 'BLUE' : 'RED';
        var bg     = side === 'BLUE' ? '#77d59a' : '#f09a9a';
        var border = side === 'BLUE' ? '#1f7a4d' : '#8f1f1f';
        var ring   = side === 'BLUE' ? 'rgba(119,213,154,.38)' : 'rgba(240,154,154,.38)';
        var label  = esc((unit && (unit.uid || unit.label)) || (side === 'BLUE' ? 'B' : 'R')).slice(0, 12);
        var sideClass = side === 'BLUE' ? 'rmooz-demo-preview-unit-friendly' : 'rmooz-demo-preview-unit-enemy';
        return window.L.divIcon({
            className: 'rmooz-demo-preview-unit ' + sideClass,
            html: '<div style="position:relative;display:flex;align-items:center;gap:4px;">' +
                  '<span style="width:16px;height:16px;border-radius:3px;background:' + bg +
                  ';border:2px solid ' + border + ';box-shadow:0 0 0 4px ' + ring +
                  ';display:inline-flex;align-items:center;justify-content:center;color:#0a1820;' +
                  'font-size:9px;font-weight:900;">P</span>' +
                  '<span style="max-width:82px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;' +
                  'background:#0e1620;color:#e8eaed;border:1px solid ' + border + ';border-radius:3px;' +
                  'padding:1px 4px;font-size:10px;font-weight:700;box-shadow:0 1px 4px rgba(0,0,0,.55);">' +
                  label + '</span></div>',
            iconSize: [108, 24], iconAnchor: [8, 12],
        });
    }

    function _renderBases() {
        if (!_baseLayer || !window.L || !_preview) return;
        (_preview.bases || []).forEach(function (b) {
            var coord = b.coord;
            if (!Array.isArray(coord) || coord.length < 2) return;
            if (!Number.isFinite(coord[0]) || !Number.isFinite(coord[1])) return;
            var m = window.L.marker([coord[1], coord[0]], {
                icon: _anchorIcon(),
                interactive: true,
                keyboard: false,
                title: 'Preview base/anchor — review only',
                alt: 'Preview base/anchor — review only',
            });
            m._rmoozPreview = true;
            m._rmoozReviewOnly = true;
            if (typeof m.bindTooltip === 'function') {
                m.bindTooltip(
                    esc(b.label || b.name || 'Base') + ' | preview_only:true | requires_review:true',
                    { sticky: true }
                );
            }
            m.bindPopup(
                '<div style="font-size:12px;color:#e8eaed;background:#0e1620;padding:4px;">' +
                '<b>' + esc(b.label || b.name || 'Base') + '</b><br>' +
                '<span style="color:#cfe6ff;font-size:11px;">Preview anchor — review only</span><br>' +
                '<span style="color:#e0c060;font-size:11px;">requires_review:true</span>' +
                '</div>'
            );
            _baseLayer.addLayer(m);
        });
        var obj = _preview.obj || {};
        if (Array.isArray(obj.coord) && obj.coord.length >= 2 &&
            Number.isFinite(obj.coord[0]) && Number.isFinite(obj.coord[1])) {
            var target = window.L.marker([obj.coord[1], obj.coord[0]], {
                icon: _objectiveIcon(),
                interactive: true,
                keyboard: false,
                title: 'Approximate target / requires review',
                alt: 'Approximate target / requires review',
            });
            target._rmoozPreview = true;
            target._rmoozReviewOnly = true;
            target._rmoozApproximateTarget = true;
            if (typeof target.bindTooltip === 'function') {
                target.bindTooltip('Approximate target / requires review', { sticky: true });
            }
            target.bindPopup(
                '<div style="font-size:12px;color:#e8eaed;background:#0e1620;padding:4px;">' +
                '<b>' + esc(obj.name || obj.label || 'Approximate target') + '</b><br>' +
                '<span style="color:#e0c060;font-size:11px;">Approximate target / requires review</span>' +
                '</div>'
            );
            _baseLayer.addLayer(target);
        }
    }

    function renderStep(idx) {
        if (!_stepLayer || !window.L || !_preview) return;
        _stepLayer.clearLayers();
        var step = _preview.steps && _preview.steps[idx];
        if (!step) return;

        // Unit markers
        var redPos  = (step.unit_positions && step.unit_positions.red)  || [];
        var bluePos = (step.unit_positions && step.unit_positions.blue) || [];

        redPos.forEach(function (u) {
            if (!u || !Array.isArray(u.coord) || u.coord.length < 2) return;
            if (!Number.isFinite(u.coord[0]) || !Number.isFinite(u.coord[1])) return;
            var m = window.L.marker([u.coord[1], u.coord[0]], {
                icon: _unitIcon(u), interactive: true, keyboard: false,
            });
            m._rmoozPreview = true;
            m._rmoozReviewOnly = true;
            m._rmoozPreviewUnit = u;
            if (typeof m.bindTooltip === 'function') {
                m.bindTooltip(
                    esc(u.label || u.uid || 'RED preview unit') +
                    ' | side:RED | role/platform:' + esc(u.platform || u.role || 'unknown') +
                    ' | preview_only:true',
                    { sticky: true }
                );
            }
            if (typeof m.bindPopup === 'function') m.bindPopup(unitReviewHtml(u));
            _stepLayer.addLayer(m);
        });

        bluePos.forEach(function (u) {
            if (!u || !Array.isArray(u.coord) || u.coord.length < 2) return;
            if (!Number.isFinite(u.coord[0]) || !Number.isFinite(u.coord[1])) return;
            var m = window.L.marker([u.coord[1], u.coord[0]], {
                icon: _unitIcon(u), interactive: true, keyboard: false,
            });
            m._rmoozPreview = true;
            m._rmoozReviewOnly = true;
            m._rmoozPreviewUnit = u;
            if (typeof m.bindTooltip === 'function') {
                m.bindTooltip(
                    esc(u.label || u.uid || 'BLUE preview unit') +
                    ' | side:BLUE | role/platform:' + esc(u.platform || u.role || 'unknown') +
                    ' | preview_only:true',
                    { sticky: true }
                );
            }
            if (typeof m.bindPopup === 'function') m.bindPopup(unitReviewHtml(u));
            _stepLayer.addLayer(m);
        });

        // Dashed movement lines
        (step.movement_lines || []).forEach(function (line) {
            if (!line || !Array.isArray(line.from) || !Array.isArray(line.to)) return;
            if (line.from.length < 2 || line.to.length < 2) return;
            var dx = line.from[0] - line.to[0], dy = line.from[1] - line.to[1];
            if (dx * dx + dy * dy < 1e-10) return; // skip zero-length lines
            var color = line.side === 'BLUE' ? '#7fd6a0' : '#f0a0a0';
            var pl = window.L.polyline(
                [[line.from[1], line.from[0]], [line.to[1], line.to[0]]],
                {
                    color: color,
                    weight: 4,
                    dashArray: '8,5',
                    opacity: 0.92,
                    interactive: true,
                    className: 'rmooz-demo-preview-line rmooz-demo-preview-line-active',
                }
            );
            pl._rmoozPreview = true;
            pl._rmoozReviewOnly = true;
            pl._rmoozPreviewActiveStep = true;
            pl._rmoozPreviewLine = line;
            var reviewHtml = lineReviewHtml(line);
            if (typeof pl.bindPopup === 'function') pl.bindPopup(reviewHtml);
            if (typeof pl.bindTooltip === 'function') {
                pl.bindTooltip(
                    'Step ' + (idx + 1) +
                    ' | From: ' + esc(line.from_label || 'unknown') +
                    ' | To: ' + esc(line.to_label || 'objective/area') +
                    ' | approximate_route:true | requires_review:true',
                    { sticky: true }
                );
            }
            _stepLayer.addLayer(pl);
        });
    }

    // ── Step panel ────────────────────────────────────────────────────────────

    function _clearPanel() {
        if (_panel && _panel.parentNode) _panel.parentNode.removeChild(_panel);
        _panel = null;
    }

    function _createPanel() {
        _clearPanel();
        _panel = document.createElement('div');
        _panel.id = 'rmooz-demo-preview-panel';
        _panel.style.cssText = [
            'position:fixed', 'top:122px', 'right:24px',
            'z-index:9900', 'background:#0e1620', 'border:1px solid #2e5d7d',
            'border-radius:8px', 'padding:12px 16px', 'min-width:340px', 'max-width:min(520px, calc(100vw - 32px))',
            'max-height:calc(100vh - 270px)', 'overflow:auto',
            'box-shadow:0 4px 20px rgba(0,0,0,.65)', 'font-family:inherit', 'color:#e8eaed',
            'direction:ltr',
        ].join(';');
        updatePanel(0);
        document.body.appendChild(_panel);
    }

    function updatePanel(idx) {
        if (!_panel || !_preview) return;
        var steps = _preview.steps || [];
        var step  = steps[idx] || {};
        var total = steps.length;
        var phaseEn  = step.phase_name_en || step.phase_kind || '';
        var phaseAr  = step.phase_name_ar || '';
        var action   = step.action_en || step.decision_en || '';
        var reason   = step.reason_en || '';
        var risk     = step.risk_en || '';
        var evidence = step.evidence_en || '';
        var units    = step.units_involved || [];
        var bases    = step.related_bases || [];
        var reviewWarning = step.review_warning || 'preview_only:true | approximate_route:true | requires_review:true';
        var warning  = _preview.movement_warning || 'Approximate demo movement — route requires review';

        var prevDisabled = idx === 0 ? ' disabled style="opacity:0.4;"' : '';
        var nextDisabled = idx >= total - 1 ? ' disabled style="opacity:0.4;"' : '';

        var html = [
            '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">',
            '<div style="font-size:13px;font-weight:700;color:#cfe6ff;">',
            'Preview Decision Steps / معاينة خطوات القرار</div>',
            '<button data-act="close" style="background:transparent;border:none;cursor:pointer;',
            'color:#8fa5b8;font-size:16px;padding:0 4px 0 8px;" title="Clear Preview">✕</button>',
            '</div>',
            '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">',
            '<button data-act="prev"' + prevDisabled + ' style="font:inherit;cursor:pointer;',
            'border:1px solid #2e5d7d;background:#16222e;color:#cfe6ff;border-radius:4px;padding:4px 12px;">◀</button>',
            '<div style="flex:1;text-align:center;font-size:12px;color:#8fa5b8;">',
            'Step ' + (idx + 1) + ' / ' + total + '</div>',
            '<button data-act="next"' + nextDisabled + ' style="font:inherit;cursor:pointer;',
            'border:1px solid #2e5d7d;background:#16222e;color:#cfe6ff;border-radius:4px;padding:4px 12px;">▶</button>',
            '</div>',
            '<div style="margin-bottom:6px;font-size:12px;">',
            '<span style="color:#8fa5b8;">Phase / المرحلة: </span>',
            '<span style="color:#cfe6ff;">' + esc(phaseEn) + (phaseAr ? ' — ' + esc(phaseAr) : '') + '</span>',
            '</div>',
        ];
        if (action) {
            html.push(
                '<div style="margin-bottom:5px;">',
                '<div style="font-size:11px;color:#8fa5b8;margin-bottom:2px;">Action / العمل</div>',
                '<div style="font-size:12px;color:#e8eaed;background:#121a22;border-radius:3px;',
                'padding:4px 6px;">' + esc(action) + '</div></div>'
            );
        }
        if (reason) {
            html.push(
                '<div style="margin-bottom:5px;">',
                '<div style="font-size:11px;color:#8fa5b8;margin-bottom:2px;">Reason / السبب</div>',
                '<div style="font-size:12px;color:#e8eaed;background:#121a22;border-radius:3px;',
                'padding:4px 6px;">' + esc(reason) + '</div></div>'
            );
        }
        if (risk) {
            html.push(
                '<div style="margin-bottom:5px;">',
                '<div style="font-size:11px;color:#e0a93a;margin-bottom:2px;">Risk / المخاطر</div>',
                '<div style="font-size:12px;color:#e8eaed;background:#1a1208;border-radius:3px;',
                'padding:4px 6px;">' + esc(risk) + '</div></div>'
            );
        }
        html.push(
            '<div style="margin-bottom:5px;">',
            '<div style="font-size:11px;color:#8fa5b8;margin-bottom:2px;">Units involved / الوحدات المشاركة</div>',
            '<div style="font-size:12px;background:#0f1922;border-radius:3px;padding:4px 6px;">',
            compactListHtml(units),
            '</div></div>',
            '<div style="margin-bottom:5px;">',
            '<div style="font-size:11px;color:#8fa5b8;margin-bottom:2px;">Related bases/anchors / القواعد والمراسي المرتبطة</div>',
            '<div style="font-size:12px;background:#0f1922;border-radius:3px;padding:4px 6px;">',
            compactListHtml(bases),
            '</div></div>'
        );
        if (evidence) {
            html.push(
                '<div style="margin-bottom:5px;">',
                '<div style="font-size:11px;color:#8fa5b8;margin-bottom:2px;">Evidence / الأدلة</div>',
                '<div style="font-size:12px;color:#9aa3ad;background:#121a22;border-radius:3px;',
                'padding:4px 6px;">' + esc(evidence) + '</div></div>'
            );
        }
        html.push(
            '<div class="rmooz-demo-preview-legend" style="margin-top:8px;padding:6px 7px;',
            'border:1px solid #2e5d7d;border-radius:4px;background:#0b131b;font-size:11px;color:#cfe6ff;">',
            '<div style="font-weight:700;margin-bottom:4px;color:#8fbce0;">Legend / مفتاح الخريطة</div>',
            '<div><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#77d59a;',
            'border:1px solid #1f7a4d;box-shadow:0 0 0 3px rgba(119,213,154,.28);margin-right:6px;"></span>',
            'Friendly preview unit</div>',
            '<div><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#f09a9a;',
            'border:1px solid #8f1f1f;box-shadow:0 0 0 3px rgba(240,154,154,.28);margin-right:6px;"></span>',
            'Enemy preview unit</div>',
            '<div><span style="display:inline-block;width:28px;border-top:3px dashed #f0a0a0;margin-right:6px;',
            'vertical-align:middle;"></span>Approximate movement/action</div>',
            '<div><span style="display:inline-block;width:10px;height:10px;border-radius:50%;border:2px dashed #e0c060;',
            'margin-right:6px;vertical-align:middle;"></span>Requires review</div>',
            '</div>'
        );
        html.push(
            '<div style="margin-top:8px;padding:5px 7px;border-radius:4px;background:#2a2412;',
            'border:1px solid #b8860b;color:#e0c060;font-size:11px;">',
            '<b>⚠ preview_only · approximate_route · requires_review</b><br>',
            esc(reviewWarning) + '<br>',
            esc(warning),
            '</div>',
            '<div style="display:flex;justify-content:flex-end;margin-top:8px;">',
            '<button data-act="clear" style="font:inherit;cursor:pointer;border:1px solid #b8860b;',
            'background:#17130a;color:#e0c060;border-radius:4px;padding:4px 10px;font-size:11px;">',
            'Clear Preview / مسح المعاينة</button></div>'
        );

        _panel.innerHTML = html.join('');

        var closeBtn = _panel.querySelector('[data-act="close"]');
        if (closeBtn) closeBtn.addEventListener('click', clear);
        var clearBtn = _panel.querySelector('[data-act="clear"]');
        if (clearBtn) clearBtn.addEventListener('click', clear);
        var prevBtn = _panel.querySelector('[data-act="prev"]');
        if (prevBtn && !prevBtn.disabled) prevBtn.addEventListener('click', function () { stepTo(idx - 1); });
        var nextBtn = _panel.querySelector('[data-act="next"]');
        if (nextBtn && !nextBtn.disabled) nextBtn.addEventListener('click', function () { stepTo(idx + 1); });
    }

    // ── Export ────────────────────────────────────────────────────────────────
    window.RmoozDemoPreview = {
        build: build,
        clear: clear,
        isActive: isActive,
        stepTo: stepTo,
        getStepCount: getStepCount,
    };
})();