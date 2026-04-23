/**
 * FILE: units-orbat-dock.js
 * Bottom-docked ORBAT panel that renders the current plan's unit hierarchy as
 * a collapsible tree of NATO symbols. Each row is draggable onto the Leaflet
 * map; dropping a row calls /api/units/{id}/place at the drop point and adds
 * (or updates) the unit's map marker. Lives alongside the existing cursor-
 * follow placement flow in units-map.js — this is a second way to place.
 *
 * Bridge name: window.AppUnitsOrbatDock
 * Depends on: window.map (Leaflet), window.ms (milsymbol), window.AppUnitsMap
 */
(function () {
    'use strict';

    const DEFAULT_SIDC = '10031000001200000000';
    const DRAG_MIME    = 'application/x-rmooz-unit';
    const HEIGHT_STORAGE_KEY = 'rmooz.orbatDock.height';
    const MIN_H = 120;  // kept in sync with CSS min-height
    const MAX_H_FRAC = 0.85; // fraction of viewport (matches CSS max-height: 85vh)

    let dockEl, treeEl, emptyEl, closeBtn, refreshBtn, resizeEl;
    let map = null;
    let bound = false;
    let roots = [];
    let unitsFlat = [];
    const collapsed = new Set();

    function tr(key, fallback) {
        if (typeof window.t === 'function') {
            const v = window.t(key);
            if (v && v !== key) return v;
        }
        return fallback != null ? fallback : key;
    }

    function escapeHtml(s) {
        return String(s ?? '').replace(/[&<>"']/g, c =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
    }

    function levelLabel(level) {
        const keys = ['units-level-army', 'units-level-force', 'units-level-brigade', 'units-level-battalion', 'units-level-company'];
        const fall = ['Army', 'Force', 'Brigade', 'Battalion', 'Company'];
        return tr(keys[level], fall[level] ?? `L${level}`);
    }

    function isPlaced(u) {
        return u && (u.lat != null && u.lng != null);
    }

    // ── Symbol rendering ────────────────────────────────────────────────
    function buildSymbolHtml(sidc, size) {
        try {
            if (window.ms && typeof window.ms.Symbol === 'function') {
                const sym = new window.ms.Symbol(sidc || DEFAULT_SIDC, { size, simpleStatusModifier: true });
                if (sym.isValid()) return sym.asSVG();
            }
        } catch (_) { /* fall through */ }
        return '';
    }

    // ── Data load ───────────────────────────────────────────────────────
    async function loadTree() {
        try {
            const res = await fetch('/api/units/tree', { credentials: 'include' });
            if (!res.ok) throw new Error(String(res.status));
            const data = await res.json();
            roots = data.roots || [];
            unitsFlat = data.units || [];
        } catch (err) {
            console.warn('[orbat-dock] tree load failed', err);
            roots = [];
            unitsFlat = [];
        }
        render();
    }

    // ── Render ──────────────────────────────────────────────────────────
    function render() {
        if (!treeEl) return;
        treeEl.innerHTML = '';
        const live = (unitsFlat || []).filter(u => !u.deleted_at);
        if (!roots.length || !live.length) {
            if (emptyEl) emptyEl.hidden = false;
            return;
        }
        if (emptyEl) emptyEl.hidden = true;

        const frag = document.createDocumentFragment();
        (function walk(nodes, depth) {
            for (const n of nodes) {
                if (n.deleted_at) continue;
                frag.appendChild(buildRow(n, depth));
                if (n.children?.length && !collapsed.has(n.id)) {
                    walk(n.children, depth + 1);
                }
            }
        })(roots, 0);
        treeEl.appendChild(frag);
    }

    function buildRow(unit, depth) {
        const row = document.createElement('div');
        row.className = 'orbat-dock-row';
        row.setAttribute('draggable', 'true');
        row.dataset.unitId = unit.id;
        row.style.paddingInlineStart = (6 + depth * 18) + 'px';
        if (isPlaced(unit)) row.classList.add('is-placed');

        // Caret (expand / collapse)
        const caret = document.createElement('span');
        caret.className = 'orbat-dock-caret';
        if (!unit.children?.length) {
            caret.classList.add('is-leaf');
            caret.textContent = '';
        } else {
            caret.textContent = collapsed.has(unit.id) ? '▸' : '▾';
            caret.addEventListener('click', (e) => {
                e.stopPropagation();
                if (collapsed.has(unit.id)) collapsed.delete(unit.id);
                else collapsed.add(unit.id);
                render();
            });
        }
        row.appendChild(caret);

        // Milsymbol
        const symWrap = document.createElement('span');
        symWrap.className = 'orbat-dock-sym';
        symWrap.innerHTML = buildSymbolHtml(unit.sidc, 22);
        row.appendChild(symWrap);

        // Name + meta
        const info = document.createElement('span');
        info.className = 'orbat-dock-info';
        const name = document.createElement('span');
        name.className = 'orbat-dock-name';
        name.textContent = unit.name || '—';
        info.appendChild(name);
        const meta = document.createElement('span');
        meta.className = 'orbat-dock-meta';
        meta.innerHTML =
            `<span>${escapeHtml(levelLabel(unit.level))}</span>` +
            (unit.code ? `<span>· ${escapeHtml(unit.code)}</span>` : '') +
            `<span class="orbat-dock-placed-badge">${escapeHtml(tr('orbat-dock-placed', 'placed'))}</span>`;
        info.appendChild(meta);
        row.appendChild(info);

        // Drag source
        row.addEventListener('dragstart', (e) => {
            row.classList.add('dragging');
            try {
                e.dataTransfer.effectAllowed = 'copyMove';
                e.dataTransfer.setData(DRAG_MIME, JSON.stringify({ id: unit.id }));
                e.dataTransfer.setData('text/plain', unit.name || unit.id);
            } catch (_) { /* ignore */ }
        });
        row.addEventListener('dragend', () => {
            row.classList.remove('dragging');
        });

        // Tooltip
        row.title = `${unit.name || ''}${unit.code ? ' (' + unit.code + ')' : ''} — drag onto the map to position`;

        return row;
    }

    // ── Map drop target ─────────────────────────────────────────────────
    function bindMapDropTarget() {
        if (!map) return;
        const container = map.getContainer();
        if (!container || container._orbatDockBound) return;
        container._orbatDockBound = true;

        const hasUnitDrag = (e) => {
            const t = e.dataTransfer?.types;
            if (!t) return false;
            if (typeof t.includes === 'function') return t.includes(DRAG_MIME);
            for (let i = 0; i < t.length; i++) if (t[i] === DRAG_MIME) return true;
            return false;
        };

        container.addEventListener('dragenter', (e) => {
            if (!hasUnitDrag(e)) return;
            e.preventDefault();
            container.classList.add('map-dock-dragover');
        });
        container.addEventListener('dragover', (e) => {
            if (!hasUnitDrag(e)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        });
        container.addEventListener('dragleave', (e) => {
            // Only clear if leaving the container entirely (not a child).
            if (e.target === container) container.classList.remove('map-dock-dragover');
        });
        container.addEventListener('drop', async (e) => {
            if (!hasUnitDrag(e)) return;
            e.preventDefault();
            container.classList.remove('map-dock-dragover');
            let payload = null;
            try { payload = JSON.parse(e.dataTransfer.getData(DRAG_MIME) || 'null'); } catch (_) {}
            if (!payload?.id) return;
            const rect = container.getBoundingClientRect();
            const pt = L.point(e.clientX - rect.left, e.clientY - rect.top);
            const latlng = map.containerPointToLatLng(pt);
            await placeUnitAt(payload.id, latlng);
        });
    }

    async function placeUnitAt(unitId, latlng) {
        try {
            const res = await fetch(`/api/units/${encodeURIComponent(unitId)}/place`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lat: latlng.lat, lng: latlng.lng }),
            });
            if (!res.ok) throw new Error(await res.text());
            const updated = await res.json();
            window.AppUnitsMap?.addOrUpdateMarker?.({
                id: updated.id,
                name: updated.name,
                code: updated.code,
                level: updated.level,
                side: updated.side,
                sidc: updated.sidc,
                lat: Number(updated.lat),
                lng: Number(updated.lng),
            });
            // Reflect the new placement in the dock and anything else that listens.
            document.dispatchEvent(new CustomEvent('units:placed', { detail: { unitId } }));
            // Update the local copy so the row immediately shows the "placed" style.
            const u = unitsFlat.find(x => x.id === unitId);
            if (u) { u.lat = Number(updated.lat); u.lng = Number(updated.lng); }
            patchNodeLatLng(roots, unitId, Number(updated.lat), Number(updated.lng));
            render();
        } catch (err) {
            console.warn('[orbat-dock] place failed', err);
        }
    }

    function patchNodeLatLng(nodes, id, lat, lng) {
        for (const n of nodes || []) {
            if (n.id === id) { n.lat = lat; n.lng = lng; return true; }
            if (n.children?.length && patchNodeLatLng(n.children, id, lat, lng)) return true;
        }
        return false;
    }

    // ── Open / close ────────────────────────────────────────────────────
    function open() {
        if (!ensureBound()) return;
        dockEl.classList.remove('hidden');
        dockEl.setAttribute('aria-hidden', 'false');
        // Always refresh on open so we reflect latest server state.
        loadTree();
        // Map tiles need a size nudge when a chunk of viewport is covered.
        setTimeout(() => { try { map?.invalidateSize?.(); } catch (_) {} }, 260);
    }

    function close() {
        if (!dockEl) return;
        dockEl.classList.add('hidden');
        dockEl.setAttribute('aria-hidden', 'true');
        setTimeout(() => { try { map?.invalidateSize?.(); } catch (_) {} }, 260);
    }

    function toggle() {
        if (!dockEl) { open(); return; }
        if (dockEl.classList.contains('hidden')) open();
        else close();
    }

    // ── Resize handle ───────────────────────────────────────────────────
    function clampHeight(h) {
        const maxH = Math.max(MIN_H, Math.round(window.innerHeight * MAX_H_FRAC));
        return Math.max(MIN_H, Math.min(maxH, Math.round(h)));
    }

    function applyHeight(h, { persist = true } = {}) {
        if (!dockEl) return;
        const clamped = clampHeight(h);
        dockEl.style.height = clamped + 'px';
        // Keep the map viewport accurate to the new panel size.
        try { map?.invalidateSize?.(); } catch (_) {}
        if (persist) {
            try { localStorage.setItem(HEIGHT_STORAGE_KEY, String(clamped)); } catch (_) {}
        }
    }

    function restoreSavedHeight() {
        try {
            const raw = localStorage.getItem(HEIGHT_STORAGE_KEY);
            const n = raw ? parseInt(raw, 10) : NaN;
            if (Number.isFinite(n)) applyHeight(n, { persist: false });
        } catch (_) { /* ignore */ }
    }

    function bindResize() {
        if (!resizeEl || !dockEl || resizeEl._orbatBound) return;
        resizeEl._orbatBound = true;

        // Pointer drag: height grows as the pointer moves up (clientY decreases).
        let pointerId = null;
        let startY = 0;
        let startH = 0;

        const onMove = (e) => {
            if (pointerId == null) return;
            const dy = startY - e.clientY; // up = positive
            applyHeight(startH + dy, { persist: false });
        };
        const onUp = (e) => {
            if (pointerId == null) return;
            try { resizeEl.releasePointerCapture(pointerId); } catch (_) {}
            pointerId = null;
            dockEl.classList.remove('is-resizing');
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);
            // Persist final height.
            const h = dockEl.getBoundingClientRect().height;
            applyHeight(h, { persist: true });
        };
        resizeEl.addEventListener('pointerdown', (e) => {
            if (e.button !== 0 && e.pointerType === 'mouse') return;
            pointerId = e.pointerId;
            startY = e.clientY;
            startH = dockEl.getBoundingClientRect().height;
            dockEl.classList.add('is-resizing');
            try { resizeEl.setPointerCapture(pointerId); } catch (_) {}
            window.addEventListener('pointermove', onMove);
            window.addEventListener('pointerup', onUp);
            window.addEventListener('pointercancel', onUp);
            e.preventDefault();
        });

        // Keyboard a11y — ArrowUp/Down nudge the height by 24px (Shift for 80).
        resizeEl.addEventListener('keydown', (e) => {
            const big = e.shiftKey ? 80 : 24;
            if (e.key === 'ArrowUp')   { e.preventDefault(); applyHeight(dockEl.getBoundingClientRect().height + big); }
            else if (e.key === 'ArrowDown') { e.preventDefault(); applyHeight(dockEl.getBoundingClientRect().height - big); }
            else if (e.key === 'Home') { e.preventDefault(); applyHeight(MIN_H); }
            else if (e.key === 'End')  { e.preventDefault(); applyHeight(window.innerHeight * MAX_H_FRAC); }
        });

        // Double-click the handle to snap between default (220) and max.
        resizeEl.addEventListener('dblclick', () => {
            const cur  = dockEl.getBoundingClientRect().height;
            const maxH = Math.round(window.innerHeight * MAX_H_FRAC);
            applyHeight(cur < maxH - 20 ? maxH : 220);
        });

        // Re-clamp on window resize so the dock never exceeds the new viewport.
        window.addEventListener('resize', () => {
            const cur = dockEl.getBoundingClientRect().height;
            applyHeight(cur, { persist: false });
        });
    }

    // ── Bind ────────────────────────────────────────────────────────────
    function ensureBound() {
        if (bound) return true;
        dockEl     = document.getElementById('orbat-dock');
        treeEl     = document.getElementById('orbat-dock-tree');
        emptyEl    = document.getElementById('orbat-dock-empty');
        closeBtn   = document.getElementById('orbat-dock-close');
        refreshBtn = document.getElementById('orbat-dock-refresh');
        resizeEl   = document.getElementById('orbat-dock-resize');
        if (!dockEl || !treeEl) return false;

        closeBtn?.addEventListener('click', close);
        refreshBtn?.addEventListener('click', () => loadTree());
        bindResize();
        restoreSavedHeight();

        // Any change to unit state should refresh the tree. We listen for the
        // events units-map.js and units.js already dispatch.
        document.addEventListener('units:placed',              () => loadTree());
        document.addEventListener('units:placement-cancelled', () => { /* no-op — no local state change */ });
        document.addEventListener('units:updated',             () => loadTree());
        document.addEventListener('units:removed',             () => loadTree());

        bound = true;
        return true;
    }

    function init(mapRef) {
        if (mapRef) map = mapRef;
        ensureBound();
        bindMapDropTarget();
    }

    window.AppUnitsOrbatDock = { init, open, close, toggle, refresh: loadTree };
})();
