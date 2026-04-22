/**
 * FILE: units-map.js
 * Persistent unit markers + click-to-place workflow for the Units hierarchy.
 *
 *   - Leaflet layer group dedicated to unit markers (separate from tactical overlays).
 *   - Markers are hydrated from the server (/api/units/tree) on startup.
 *   - beginPlacement(unit): cursor preview + one-shot map click routed via the
 *     global window.__APP_UNITS_PLACING flag (app.js honours it at the top of
 *     its main click handler).
 *
 * Bridge name: window.AppUnitsMap
 * Depends on: window.map (set by app.js after L.map() init), window.ms (milsymbol)
 */
(function () {
    'use strict';

    const LAYER_PANE     = 'unitsMarkerPane';
    const DEFAULT_SIDC   = '10031000001200000000';

    let map = null;
    let unitsLayer = null;
    const markers = new Map();   // unitId → L.marker
    let placement = null;        // active placement state

    function escapeHtml(s) {
        return String(s ?? '').replace(/[&<>"']/g, c =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
    }

    function levelLabelFor(level) {
        return ['Army', 'Force', 'Brigade', 'Battalion', 'Company'][level] ?? `L${level}`;
    }

    function buildIcon(sidc, size = 34) {
        try {
            if (window.ms && typeof window.ms.Symbol === 'function') {
                const sym = new window.ms.Symbol(sidc || DEFAULT_SIDC, { size, simpleStatusModifier: true });
                if (sym.isValid()) {
                    const anchor = sym.getAnchor();
                    const dim    = sym.getSize();
                    return L.divIcon({
                        className: 'units-map-marker',
                        html: sym.asSVG(),
                        iconAnchor: [anchor.x, anchor.y],
                        iconSize:   [dim.width, dim.height],
                    });
                }
            }
        } catch (_) { /* fall through */ }
        return null;
    }

    function buildPopupContent(unit) {
        const wrap = document.createElement('div');
        wrap.className = 'units-marker-popup';
        const lvl  = levelLabelFor(unit.level);
        const side = (unit.side || 'friendly');
        wrap.innerHTML = `
          <div class="umpop-title">${escapeHtml(unit.name || '—')}</div>
          <div class="umpop-sub">
            <span class="units-tree-level units-tree-level-${unit.level}">${escapeHtml(lvl)}</span>
            <span class="units-side-badge units-side-${side}">${escapeHtml(side.charAt(0).toUpperCase() + side.slice(1))}</span>
            ${unit.code ? `<span class="umpop-code">${escapeHtml(unit.code)}</span>` : ''}
          </div>
          <div class="umpop-actions">
            <button type="button" class="umpop-btn" data-act="edit">Edit unit</button>
            <button type="button" class="umpop-btn danger" data-act="unplace">Remove from map</button>
          </div>`;
        wrap.addEventListener('click', async (e) => {
            const btn = e.target?.closest?.('[data-act]');
            if (!btn) return;
            const act = btn.getAttribute('data-act');
            if (act === 'unplace') {
                try {
                    await fetch(`/api/units/${encodeURIComponent(unit.id)}/unplace`, {
                        method: 'POST', credentials: 'include',
                    });
                    removeMarker(unit.id);
                    map.closePopup();
                } catch (err) {
                    console.warn('[units-map] unplace failed', err);
                }
            } else if (act === 'edit') {
                map.closePopup();
                window.AppUnits?.open?.(unit.id);
            }
        });
        return wrap;
    }

    function addOrUpdateMarker(unit) {
        if (!map || !unit || unit.lat == null || unit.lng == null) return;
        const sidc = unit.sidc || DEFAULT_SIDC;
        const icon = buildIcon(sidc);
        if (!icon) return;
        if (markers.has(unit.id)) {
            unitsLayer.removeLayer(markers.get(unit.id));
            markers.delete(unit.id);
        }
        const m = L.marker([unit.lat, unit.lng], {
            icon, draggable: true, pane: LAYER_PANE, autoPan: false,
        });
        m._unitId   = unit.id;
        m._unitData = unit;
        m.bindPopup(() => buildPopupContent(m._unitData));
        m.on('dragend', async () => {
            const ll = m.getLatLng();
            try {
                const res = await fetch(`/api/units/${encodeURIComponent(unit.id)}/place`, {
                    method: 'POST', credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ lat: ll.lat, lng: ll.lng }),
                });
                if (res.ok) {
                    const updated = await res.json();
                    m._unitData = { ...m._unitData, ...updated };
                }
            } catch (err) {
                console.warn('[units-map] drag reposition failed', err);
            }
        });
        m.addTo(unitsLayer);
        markers.set(unit.id, m);
    }

    function removeMarker(unitId) {
        const m = markers.get(unitId);
        if (!m) return;
        unitsLayer.removeLayer(m);
        markers.delete(unitId);
    }

    async function loadAllPlaced() {
        try {
            const res  = await fetch('/api/units/tree', { credentials: 'include' });
            if (!res.ok) return;
            const data = await res.json();
            const rows = data.units || [];
            const wanted = new Set();
            for (const r of rows) {
                if (r.deleted_at) continue;
                if (r.lat == null || r.lng == null) continue;
                wanted.add(r.id);
                addOrUpdateMarker({
                    id: r.id,
                    name: r.name,
                    code: r.code,
                    level: r.level,
                    side: r.side,
                    sidc: r.sidc,
                    lat: Number(r.lat),
                    lng: Number(r.lng),
                });
            }
            // Drop markers whose units have been deleted or unplaced server-side
            for (const id of Array.from(markers.keys())) {
                if (!wanted.has(id)) removeMarker(id);
            }
        } catch (err) {
            console.warn('[units-map] loadAllPlaced failed', err);
        }
    }

    // ── Placement workflow ───────────────────────────────────────────────
    function beginPlacement(unit) {
        if (!map || !unit) return;
        cancelPlacement();

        const sidc       = unit.sidc || DEFAULT_SIDC;
        const previewIco = buildIcon(sidc, 30);

        // Banner
        const banner = document.createElement('div');
        banner.className = 'units-map-placement-banner';
        banner.innerHTML = `
          <span class="umplace-text">Click on the map to place
            <strong>${escapeHtml(unit.name || 'unit')}</strong>
            <span class="umplace-hint">— ESC to cancel</span>
          </span>
          <button type="button" class="umplace-cancel" data-act="cancel">Cancel</button>`;
        banner.querySelector('[data-act="cancel"]').addEventListener('click', cancelPlacement);
        document.body.appendChild(banner);

        // Cursor-follow preview marker
        let previewMarker = null;
        if (previewIco) {
            previewMarker = L.marker(map.getCenter(), {
                icon: previewIco, interactive: false, pane: LAYER_PANE, opacity: 0.55,
            }).addTo(unitsLayer);
        }
        const onMove = (e) => {
            if (previewMarker) previewMarker.setLatLng(e.latlng);
        };
        map.on('mousemove', onMove);

        const onKey = (e) => { if (e.key === 'Escape') cancelPlacement(); };
        document.addEventListener('keydown', onKey);

        map.getContainer().style.cursor = 'crosshair';

        placement = { unit, banner, previewMarker, onMove, onKey };

        // Install click hook — app.js's main click handler checks this flag
        // and routes the click here before running normal mode logic.
        window.__APP_UNITS_PLACING = {
            unitId: unit.id,
            async onClick(latlng) {
                try {
                    const res = await fetch(`/api/units/${encodeURIComponent(unit.id)}/place`, {
                        method: 'POST', credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ lat: latlng.lat, lng: latlng.lng }),
                    });
                    if (!res.ok) throw new Error(await res.text());
                    const updated = await res.json();
                    cancelPlacement();
                    addOrUpdateMarker({
                        id: updated.id,
                        name: updated.name,
                        code: updated.code,
                        level: updated.level,
                        side: updated.side,
                        sidc: updated.sidc,
                        lat: Number(updated.lat),
                        lng: Number(updated.lng),
                    });
                    // Notify the Units modal so it can refresh its tree state
                    document.dispatchEvent(new CustomEvent('units:placed', { detail: { unitId: unit.id } }));
                } catch (err) {
                    console.warn('[units-map] place failed', err);
                    cancelPlacement();
                }
            },
        };
    }

    function cancelPlacement() {
        if (!placement) return;
        const { banner, previewMarker, onMove, onKey } = placement;
        if (map && onMove) map.off('mousemove', onMove);
        if (onKey) document.removeEventListener('keydown', onKey);
        if (previewMarker && unitsLayer.hasLayer(previewMarker)) unitsLayer.removeLayer(previewMarker);
        if (banner && banner.parentNode) banner.parentNode.removeChild(banner);
        if (map) map.getContainer().style.cursor = '';
        window.__APP_UNITS_PLACING = null;
        placement = null;
    }

    function init(mapRef) {
        if (!mapRef || map) return;
        map = mapRef;
        if (!map.getPane(LAYER_PANE)) {
            const pane = map.createPane(LAYER_PANE);
            pane.style.zIndex = '650';
            pane.style.pointerEvents = 'auto';
        }
        unitsLayer = L.layerGroup().addTo(map);

        // Re-render a marker when the Units modal reports a change (name/side/sidc/etc)
        document.addEventListener('units:updated', (ev) => {
            const u = ev?.detail;
            if (!u || !u.id) return;
            if (u.lat == null || u.lng == null) { removeMarker(u.id); return; }
            addOrUpdateMarker(u);
        });
        document.addEventListener('units:removed', (ev) => {
            const id = ev?.detail?.unitId;
            if (id) removeMarker(id);
        });

        loadAllPlaced();
    }

    window.AppUnitsMap = {
        init,
        beginPlacement,
        cancelPlacement,
        addOrUpdateMarker,
        removeMarker,
        reload: loadAllPlaced,
    };
})();
