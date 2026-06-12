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
        // 1. Placement candidates attached by the wizard
        var cands = (payload && payload.placement && payload.placement.placement_candidates) ||
                    (payload && payload.placement_candidates) || [];
        for (var ci = 0; ci < cands.length; ci++) {
            var c = cands[ci];
            if (c && c.lat != null && c.lon != null &&
                Number.isFinite(Number(c.lat)) && Number.isFinite(Number(c.lon))) {
                return { lon: Number(c.lon), lat: Number(c.lat) };
            }
        }
        // 2. Brief area_of_operations center
        var ob = (payload && payload.brief && payload.brief.operational_brief) || {};
        var ao = ob.area_of_operations || {};
        if (Array.isArray(ao.center) && ao.center.length === 2 &&
            Number.isFinite(ao.center[0]) && Number.isFinite(ao.center[1])) {
            return { lon: ao.center[0], lat: ao.center[1] };
        }
        // 3. Brief objectives list
        var objectives = ob.objectives || [];
        for (var oi = 0; oi < objectives.length; oi++) {
            var obj = objectives[oi];
            if (obj && Array.isArray(obj.coord) && obj.coord.length === 2 &&
                Number.isFinite(obj.coord[0]) && Number.isFinite(obj.coord[1])) {
                return { lon: obj.coord[0], lat: obj.coord[1] };
            }
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
            html: '<div style="width:20px;height:20px;border-radius:3px;background:#cfe6ff;' +
                  'border:2px solid #2e5d7d;box-shadow:0 0 0 2px rgba(207,230,255,.45);' +
                  'display:flex;align-items:center;justify-content:center;color:#0a1820;' +
                  'font-size:10px;font-weight:800;">A</div>',
            iconSize: [24, 24], iconAnchor: [12, 12],
        });
    }

    function _unitIcon(side) {
        var bg     = side === 'BLUE' ? '#7fd6a0' : '#f0a0a0';
        var border = side === 'BLUE' ? '#2e7d54' : '#8b0000';
        return window.L.divIcon({
            className: 'rmooz-demo-preview-unit-' + (side === 'BLUE' ? 'blue' : 'red'),
            html: '<div style="width:12px;height:12px;border-radius:2px;background:' + bg +
                  ';border:2px solid ' + border + ';opacity:0.85;"></div>',
            iconSize: [16, 16], iconAnchor: [8, 8],
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
            m.bindPopup(
                '<div style="font-size:12px;color:#e8eaed;background:#0e1620;padding:4px;">' +
                '<b>' + esc(b.name || 'Base') + '</b><br>' +
                '<span style="color:#cfe6ff;font-size:11px;">Preview anchor — review only</span>' +
                '</div>'
            );
            _baseLayer.addLayer(m);
        });
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
                icon: _unitIcon('RED'), interactive: false, keyboard: false,
            });
            m._rmoozPreview = true;
            m._rmoozReviewOnly = true;
            _stepLayer.addLayer(m);
        });

        bluePos.forEach(function (u) {
            if (!u || !Array.isArray(u.coord) || u.coord.length < 2) return;
            if (!Number.isFinite(u.coord[0]) || !Number.isFinite(u.coord[1])) return;
            var m = window.L.marker([u.coord[1], u.coord[0]], {
                icon: _unitIcon('BLUE'), interactive: false, keyboard: false,
            });
            m._rmoozPreview = true;
            m._rmoozReviewOnly = true;
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
                { color: color, weight: 2, dashArray: '6,4', opacity: 0.7, interactive: false }
            );
            pl._rmoozPreview = true;
            pl._rmoozReviewOnly = true;
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
            'position:fixed', 'bottom:80px', 'left:50%', 'transform:translateX(-50%)',
            'z-index:9900', 'background:#0e1620', 'border:1px solid #2e5d7d',
            'border-radius:8px', 'padding:12px 16px', 'min-width:340px', 'max-width:480px',
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
        var decision = step.decision_en || '';
        var risk     = step.risk_en || '';
        var evidence = step.evidence_en || '';
        var warning  = _preview.movement_warning || 'Approximate demo movement — route requires review';

        var prevDisabled = idx === 0 ? ' disabled style="opacity:0.4;"' : '';
        var nextDisabled = idx >= total - 1 ? ' disabled style="opacity:0.4;"' : '';

        var html = [
            '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">',
            '<div style="font-size:13px;font-weight:700;color:#cfe6ff;">',
            'Preview Decision Steps / معاينة خطوات القرار</div>',
            '<button data-act="close" style="background:transparent;border:none;cursor:pointer;',
            'color:#8fa5b8;font-size:16px;padding:0 4px 0 8px;" title="Close">✕</button>',
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
        if (decision) {
            html.push(
                '<div style="margin-bottom:5px;">',
                '<div style="font-size:11px;color:#8fa5b8;margin-bottom:2px;">Decision / القرار</div>',
                '<div style="font-size:12px;color:#e8eaed;background:#121a22;border-radius:3px;',
                'padding:4px 6px;direction:rtl;text-align:right;">' + esc(decision) + '</div></div>'
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
        if (evidence) {
            html.push(
                '<div style="margin-bottom:5px;">',
                '<div style="font-size:11px;color:#8fa5b8;margin-bottom:2px;">Evidence / الأدلة</div>',
                '<div style="font-size:12px;color:#9aa3ad;background:#121a22;border-radius:3px;',
                'padding:4px 6px;">' + esc(evidence) + '</div></div>'
            );
        }
        html.push(
            '<div style="margin-top:8px;padding:5px 7px;border-radius:4px;background:#2a2412;',
            'border:1px solid #b8860b;color:#e0c060;font-size:11px;">',
            '⚠ ' + esc(warning),
            '</div>'
        );

        _panel.innerHTML = html.join('');

        var closeBtn = _panel.querySelector('[data-act="close"]');
        if (closeBtn) closeBtn.addEventListener('click', clear);
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
