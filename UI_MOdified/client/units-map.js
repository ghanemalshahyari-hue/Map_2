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

    // APP-6D position 7 (0-indexed) = HQ/TF. Setting to '2' makes milsymbol
    // extend the symbol's viewBox downward and draw a filled rectangle for
    // the HQ indicator. This particular milsymbol build uses a non-standard
    // green fill for that rectangle, so we ask for the HQ render (for the
    // extended viewBox) and then swap the green rectangle path for a plain
    // vertical staff line — the conventional NATO command indicator.
    function applyHqModifier(sidc) {
        const s = String(sidc || DEFAULT_SIDC);
        if (s.length < 20) return s;
        return s.substring(0, 7) + '2' + s.substring(8);
    }

    function rewriteHqStaff(svg) {
        return svg.replace(
            /<path d="M(-?\d+),(-?\d+) l(-?\d+),0 0,(-?\d+) -?\d+,0 z" stroke-width="\d+" stroke="[^"]+" fill="rgb\((?:0,255,0|255,255,0)\)"[^>]*><\/path>/,
            (_m, x, y, _w, h) => {
                // The green rect's top-left is 5 units below the frame's
                // bottom; draw the staff from the frame's bottom-left
                // corner down to where the green rectangle used to end.
                const top = Number(y) - 5;
                const bottom = Number(y) + Number(h);
                return `<path d="M${x},${top} L${x},${bottom}" stroke="black" stroke-width="4" fill="none"></path>`;
            }
        );
    }

    let map = null;
    let unitsLayer = null;
    const markers = new Map();   // unitId → L.marker
    let placement = null;        // active placement state

    // ── Echelon-based scale visibility ───────────────────────────────────
    // A unit is shown when the current map scale DENOMINATOR is below its
    // cap. Smaller denominator = zoomed in (larger scale). The user-facing
    // rule is phrased as "scale less than 1:N", i.e. denom < N.
    //
    //   level 0 Army       → all scales  (cap = Infinity)
    //   level 1 Force      → all scales  (cap = Infinity)
    //   level 2 Brigade    → all scales  (cap = Infinity)
    //   level 3 Battalion  → denom < 500,000
    //   level 4 Company    → denom < 250,000
    const SCALE_CAP_BY_LEVEL = [Infinity, Infinity, Infinity, 500000, 250000];

    function currentScaleDenominator() {
        if (!map) return null;
        try {
            const fn = window.AppUtils && window.AppUtils.getMapScaleDenominatorAtZoom;
            if (typeof fn !== 'function') return null;
            const d = fn(map.getZoom(), map.getCenter().lat);
            return (typeof d === 'number' && isFinite(d) && d > 0) ? d : null;
        } catch (_) { return null; }
    }

    // True only when the SIDC is missing or its 6-digit entity field is all
    // zeros — i.e. the user never picked a branch / entity, so milsymbol has
    // nothing to draw inside the frame. We deliberately do NOT try to infer
    // "frame only" from the rendered SVG: real branches like Infantry render
    // with very few paths and would be falsely classified as empty.
    function unitHasNoEntity(sidc) {
        const s = String(sidc || '').replace(/\D/g, '');
        if (s.length < 20) return true;
        return s.substr(10, 6) === '000000';
    }

    function isVisibleAtCurrentScale(unit) {
        // Bare-frame units (no entity in their SIDC) are always hidden — there
        // is nothing meaningful to draw and the empty rectangle just clutters
        // the map.
        if (unitHasNoEntity(unit?.sidc)) return false;
        const cap = SCALE_CAP_BY_LEVEL[Number(unit?.level)];
        if (cap === undefined) return true;   // unknown echelon → always show
        if (!isFinite(cap)) return true;      // Brigade and above
        const denom = currentScaleDenominator();
        if (denom == null) return true;       // map not ready yet
        return denom < cap;
    }

    function setMarkerHidden(m, hidden) {
        const el = (typeof m.getElement === 'function') ? m.getElement() : m._icon;
        if (!el) return false;
        // Belt-and-braces: display:none alone is normally enough, but some
        // marker pipelines (HQ rewrites, layer panel re-attachments) can
        // re-render the icon DOM and lose styles, so apply opacity + pointer
        // events too. setOpacity also covers the marker's shadow if any.
        el.style.display       = hidden ? 'none'   : '';
        el.style.opacity       = hidden ? '0'      : '';
        el.style.pointerEvents = hidden ? 'none'   : '';
        if (typeof m.setOpacity === 'function') m.setOpacity(hidden ? 0 : 1);
        // Make sure any open popup for a hidden marker closes itself.
        if (hidden && typeof m.closePopup === 'function') m.closePopup();
        return true;
    }

    function applyVisibilityToMarker(m) {
        if (!m || !m._unitData) return;
        const visible = isVisibleAtCurrentScale(m._unitData);
        m._unitsScaleHidden = !visible;
        // First try synchronously (icon DOM is usually live right after
        // addLayer). If the marker hasn't been rendered yet (active-layer
        // path can defer), retry on the next animation frame.
        if (setMarkerHidden(m, !visible)) return;
        requestAnimationFrame(() => setMarkerHidden(m, !visible));
    }

    function updateAllVisibility() {
        markers.forEach(applyVisibilityToMarker);
    }

    // ── Minimum spacing between units ────────────────────────────────────
    // Two unit markers must never sit closer than this on the ground.
    // Drop / drag / click-to-place all push the candidate latlng away from
    // any existing marker within this radius until the constraint holds.
    const MIN_UNIT_SPACING_METERS = 1000;
    const EARTH_RADIUS_M = 6378137;

    // Initial bearing in degrees from `a` to `b` on the great-circle path.
    // Returns NaN-safe value (0 if a and b coincide).
    function bearingFromTo(a, b) {
        const lat1 = a.lat * Math.PI / 180;
        const lat2 = b.lat * Math.PI / 180;
        const dLng = (b.lng - a.lng) * Math.PI / 180;
        const y = Math.sin(dLng) * Math.cos(lat2);
        const x = Math.cos(lat1) * Math.sin(lat2)
                - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
        const brng = Math.atan2(y, x);
        if (!isFinite(brng)) return 0;
        return ((brng * 180 / Math.PI) + 360) % 360;
    }

    // Move a latlng `meters` along `bearingDeg`. Spherical earth — good to
    // a few cm at brigade scales, well inside our 1000 m tolerance.
    function movePointMeters(latlng, bearingDeg, meters) {
        const angDist = meters / EARTH_RADIUS_M;
        const brng = bearingDeg * Math.PI / 180;
        const lat1 = latlng.lat * Math.PI / 180;
        const lng1 = latlng.lng * Math.PI / 180;
        const lat2 = Math.asin(
            Math.sin(lat1) * Math.cos(angDist) +
            Math.cos(lat1) * Math.sin(angDist) * Math.cos(brng)
        );
        const lng2 = lng1 + Math.atan2(
            Math.sin(brng) * Math.sin(angDist) * Math.cos(lat1),
            Math.cos(angDist) - Math.sin(lat1) * Math.sin(lat2)
        );
        return L.latLng(lat2 * 180 / Math.PI, lng2 * 180 / Math.PI);
    }

    // Iteratively nudge `latlng` away from any other placed unit marker
    // until every pairwise distance ≥ MIN_UNIT_SPACING_METERS. Excludes
    // the unit being placed (so dragging an existing marker doesn't push
    // it away from itself). Falls back to a golden-angle spread when the
    // candidate is stacked exactly on top of another marker.
    function nudgeAwayFromOthers(latlng, excludeUnitId) {
        if (!latlng || !Number.isFinite(latlng.lat) || !Number.isFinite(latlng.lng)) {
            return latlng;
        }
        const others = [];
        markers.forEach((m, id) => {
            if (excludeUnitId && id === excludeUnitId) return;
            const ll = m && typeof m.getLatLng === 'function' ? m.getLatLng() : null;
            if (ll && Number.isFinite(ll.lat) && Number.isFinite(ll.lng)) others.push(ll);
        });
        if (!others.length) return latlng;

        let candidate = L.latLng(latlng.lat, latlng.lng);
        const MAX_ITER = 30;
        const BUFFER_M = 25;     // small extra so we land just outside the ring
        for (let i = 0; i < MAX_ITER; i++) {
            let nearest = null;
            let nearestDist = Infinity;
            for (const o of others) {
                const d = candidate.distanceTo(o);
                if (d < nearestDist) { nearestDist = d; nearest = o; }
            }
            if (nearestDist >= MIN_UNIT_SPACING_METERS) return candidate;

            const need = (MIN_UNIT_SPACING_METERS - nearestDist) + BUFFER_M;
            let bearing;
            if (nearestDist < 1) {
                // Stacked exactly on another marker — bearing is undefined.
                // Use the golden angle so successive iterations spread
                // evenly instead of oscillating along one axis.
                bearing = (i * 137.50776) % 360;
            } else {
                bearing = bearingFromTo(nearest, candidate);
            }
            candidate = movePointMeters(candidate, bearing, need);
        }
        // Best effort — return whatever we've reached after MAX_ITER.
        return candidate;
    }

    function escapeHtml(s) {
        return String(s ?? '').replace(/[&<>"']/g, c =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
    }

    function tr(key, fallback) {
        if (typeof window.t === 'function') {
            const v = window.t(key);
            if (v && v !== key) return v;
        }
        return fallback != null ? fallback : key;
    }

    function levelLabelFor(level) {
        const keys = ['units-level-army', 'units-level-force', 'units-level-brigade', 'units-level-battalion', 'units-level-company'];
        const k = keys[level];
        if (k) return tr(k, ['Army', 'Force', 'Brigade', 'Battalion', 'Company'][level]);
        return `L${level}`;
    }

    function sideLabelShort(side) {
        return tr(`units-side-${side}-short`, (side || 'friendly').charAt(0).toUpperCase() + (side || 'friendly').slice(1));
    }

    function buildIcon(sidc, size = 34, isHq = false) {
        const effectiveSidc = isHq ? applyHqModifier(sidc) : (sidc || DEFAULT_SIDC);
        try {
            if (window.ms && typeof window.ms.Symbol === 'function') {
                const sym = new window.ms.Symbol(effectiveSidc, { size, simpleStatusModifier: true });
                if (sym.isValid()) {
                    const anchor = sym.getAnchor();
                    const dim    = sym.getSize();
                    const svg    = isHq ? rewriteHqStaff(sym.asSVG()) : sym.asSVG();
                    return L.divIcon({
                        className: 'units-map-marker' + (isHq ? ' units-map-marker-hq' : ''),
                        html: svg,
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
        wrap.setAttribute('dir', 'ltr');
        const lvl  = levelLabelFor(unit.level);
        const side = (unit.side || 'friendly');
        wrap.innerHTML = `
          <div class="umpop-title">${escapeHtml(unit.name || '—')}</div>
          <div class="umpop-sub">
            <span class="units-tree-level units-tree-level-${unit.level}">${escapeHtml(lvl)}</span>
            <span class="units-side-badge units-side-${side}">${escapeHtml(sideLabelShort(side))}</span>
            ${unit.code ? `<span class="umpop-code">${escapeHtml(unit.code)}</span>` : ''}
          </div>
          <div class="umpop-actions">
            <button type="button" class="umpop-btn" data-act="edit">${escapeHtml(tr('units-popup-edit', 'Edit unit'))}</button>
            <button type="button" class="umpop-btn danger" data-act="unplace">${escapeHtml(tr('units-popup-remove', 'Remove from map'))}</button>
          </div>`;
        wrap.addEventListener('click', async (e) => {
            const btn = e.target?.closest?.('[data-act]');
            if (!btn) return;
            const act = btn.getAttribute('data-act');
            if (act === 'unplace') {
                try {
                    const r = await fetch(`/api/units/${encodeURIComponent(unit.id)}/unplace`, {
                        method: 'POST', credentials: 'include',
                    });
                    if (!r.ok) {
                        if (r.status === 401) window.rmoozServerSync?.notifySessionExpired?.();
                        else window.rmoozToast?.(
                            (typeof window.t === 'function' ? window.t('units-toast-unplace-failed') : 'Could not unplace unit'),
                            'error'
                        );
                        return;
                    }
                    removeMarker(unit.id);
                    map.closePopup();
                } catch (err) {
                    console.warn('[units-map] unplace failed', err);
                    window.rmoozToast?.(
                        (typeof window.t === 'function' ? window.t('units-toast-network') : 'Network error — please try again'),
                        'error'
                    );
                }
            } else if (act === 'edit') {
                map.closePopup();
                window.AppUnits?.open?.(unit.id);
            }
        });
        return wrap;
    }

    // Attach a unit marker to the active user layer so it respects layer
    // visibility, shows up in the Layers panel, and is exported with the plan.
    // Falls back to the dedicated unitsLayer overlay if no layer system is
    // available (e.g. app bootstrap hasn't exposed it yet).
    function attachMarkerToActiveLayer(m) {
        if (typeof window.addToActiveLayer === 'function' &&
            typeof window.getActiveLayer === 'function' &&
            window.getActiveLayer()) {
            try { window.addToActiveLayer(m); return; } catch (_) { /* fall through */ }
        }
        m.addTo(unitsLayer);
    }

    // Reverse of attachMarkerToActiveLayer — use whichever attachment path
    // was taken. _layerId is set by addToActiveLayer, so its presence tells
    // us the marker lives in a user layer.
    function detachMarker(m) {
        if (!m) return;
        if (m._layerId && typeof window.removeFromLayer === 'function') {
            try { window.removeFromLayer(m); return; } catch (_) { /* fall through */ }
        }
        if (unitsLayer && unitsLayer.hasLayer(m)) unitsLayer.removeLayer(m);
    }

    function addOrUpdateMarker(unit) {
        if (!map || !unit || unit.lat == null || unit.lng == null) return;
        const sidc = unit.sidc || DEFAULT_SIDC;
        const isHq = !!unit.hasChildren;
        const icon = buildIcon(sidc, 34, isHq);
        if (!icon) return;
        if (markers.has(unit.id)) {
            detachMarker(markers.get(unit.id));
            markers.delete(unit.id);
        }
        const m = L.marker([unit.lat, unit.lng], {
            icon, draggable: true, pane: LAYER_PANE, autoPan: false,
        });
        m._unitId   = unit.id;
        m._unitData = unit;
        m.bindPopup(() => buildPopupContent(m._unitData));
        m.on('dragend', async () => {
            const dropped = m.getLatLng();
            // Enforce the 1000 m minimum spacing rule. We exclude this
            // unit's own id so we don't push the marker away from its
            // previous position. If the rule moved the marker, snap the
            // visible icon to the corrected coords too.
            const safe = nudgeAwayFromOthers(dropped, unit.id);
            if (safe && (safe.lat !== dropped.lat || safe.lng !== dropped.lng)) {
                m.setLatLng(safe);
            }
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
        attachMarkerToActiveLayer(m);
        markers.set(unit.id, m);
        applyVisibilityToMarker(m);
    }

    function removeMarker(unitId) {
        const m = markers.get(unitId);
        if (!m) return;
        detachMarker(m);
        markers.delete(unitId);
    }

    function hasPlacedUnits() {
        return markers.size > 0;
    }

    // Visual teardown + server-side unplace for every placed unit. Used by
    // the "Clear Layer" button so symbols actually stay gone after refresh.
    // Detaches markers synchronously (so the map updates immediately) and
    // fires /unplace calls in parallel; failures are logged but don't block.
    async function clearAll() {
        const ids = Array.from(markers.keys());
        if (ids.length === 0) return;
        for (const id of ids) {
            const m = markers.get(id);
            if (m) detachMarker(m);
            markers.delete(id);
            document.dispatchEvent(new CustomEvent('units:removed', { detail: { unitId: id } }));
        }
        await Promise.allSettled(ids.map(id =>
            fetch(`/api/units/${encodeURIComponent(id)}/unplace`, {
                method: 'POST', credentials: 'include',
            }).catch(err => console.warn('[units-map] clearAll unplace failed for', id, err))
        ));
    }

    async function loadAllPlaced() {
        try {
            const res  = await fetch('/api/units/tree', { credentials: 'include' });
            if (!res.ok) return;
            const data = await res.json();
            const rows = data.units || [];
            // Any unit that appears as a parent somewhere in the tree is a
            // command element. We compute this once per load so we can paint
            // command staffs on all placed HQs in a single pass.
            const parentIds = new Set();
            for (const r of rows) {
                if (r && !r.deleted_at && r.parent_id) parentIds.add(r.parent_id);
            }
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
                    hasChildren: parentIds.has(r.id),
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

        // Banner (force LTR so the layout doesn't flip when the page is Arabic).
        // Skipped when the Units side-panel owns the placement flow — that UI
        // already shows a larger status banner + map cue, so a second banner
        // here would be redundant clutter.
        let banner = null;
        if (!window.__APP_UNITS_SIDEPANEL_PLACING) {
            banner = document.createElement('div');
            banner.className = 'units-map-placement-banner';
            banner.setAttribute('dir', 'ltr');
            banner.innerHTML = `
              <span class="umplace-text">${escapeHtml(tr('units-place-banner-text', 'Click on the map to place'))}
                <strong>${escapeHtml(unit.name || 'unit')}</strong>
                <span class="umplace-hint">${escapeHtml(tr('units-place-banner-hint', '— ESC to cancel'))}</span>
              </span>
              <button type="button" class="umplace-cancel" data-act="cancel">${escapeHtml(tr('units-place-banner-cancel', 'Cancel'))}</button>`;
            banner.querySelector('[data-act="cancel"]').addEventListener('click', cancelPlacement);
            document.body.appendChild(banner);
        }

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
                // Enforce 1000 m minimum spacing — pushes the click point
                // outside any existing unit's exclusion ring before we
                // commit the placement to the server.
                const safe = nudgeAwayFromOthers(latlng, unit.id);
                try {
                    const res = await fetch(`/api/units/${encodeURIComponent(unit.id)}/place`, {
                        method: 'POST', credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ lat: safe.lat, lng: safe.lng }),
                    });
                    if (!res.ok) {
                        if (res.status === 401) {
                            window.rmoozServerSync?.notifySessionExpired?.();
                        }
                        throw new Error(await res.text());
                    }
                    const updated = await res.json();
                    // Silent teardown — a successful placement is not a cancel,
                    // so listeners tracking real user cancellations shouldn't fire.
                    cancelPlacement({ silent: true });
                    addOrUpdateMarker({
                        id: updated.id,
                        name: updated.name,
                        code: updated.code,
                        level: updated.level,
                        side: updated.side,
                        sidc: updated.sidc,
                        lat: Number(updated.lat),
                        lng: Number(updated.lng),
                        hasChildren: !!unit.hasChildren,
                    });
                    // Notify the Units modal so it can refresh its tree state
                    document.dispatchEvent(new CustomEvent('units:placed', { detail: { unitId: unit.id } }));
                } catch (err) {
                    console.warn('[units-map] place failed', err);
                    window.rmoozToast?.(
                        (typeof window.t === 'function' ? window.t('units-toast-place-failed') : 'Could not place unit — please try again'),
                        'error'
                    );
                    cancelPlacement();
                }
            },
        };
    }

    function cancelPlacement({ silent = false } = {}) {
        if (!placement) return;
        const { banner, previewMarker, onMove, onKey } = placement;
        if (map && onMove) map.off('mousemove', onMove);
        if (onKey) document.removeEventListener('keydown', onKey);
        if (previewMarker && unitsLayer.hasLayer(previewMarker)) unitsLayer.removeLayer(previewMarker);
        if (banner && banner.parentNode) banner.parentNode.removeChild(banner);
        if (map) map.getContainer().style.cursor = '';
        window.__APP_UNITS_PLACING = null;
        placement = null;
        // Silent teardown happens right after a successful placement so listeners
        // tracking user-cancel-only flows don't get a false signal.
        if (!silent) document.dispatchEvent(new CustomEvent('units:placement-cancelled'));
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

        // Echelon-based scale filter: re-evaluate every marker on zoom.
        map.on('zoomend', updateAllVisibility);

        loadAllPlaced().then(updateAllVisibility);
    }

    window.AppUnitsMap = {
        init,
        beginPlacement,
        cancelPlacement,
        addOrUpdateMarker,
        removeMarker,
        hasPlacedUnits,
        clearAll,
        reload: loadAllPlaced,
        refreshScaleVisibility: updateAllVisibility,
        nudgeAwayFromOthers,
        MIN_UNIT_SPACING_METERS,
    };
})();
