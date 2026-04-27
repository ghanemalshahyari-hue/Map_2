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

    let dockEl, treeEl, emptyEl, closeBtn, refreshBtn, resizeEl, collapseBtn;
    let map = null;
    let bound = false;
    let roots = [];
    let unitsFlat = [];
    const collapsed = new Set();
    // Ids we've already rendered at least once. Used so that on a refresh we
    // auto-collapse only brand-new units — previously-expanded branches stay
    // open, which respects whatever the user has done so far.
    const seenIds = new Set();

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
    // Request the HQ render (which extends the viewBox) then swap the
    // library's non-standard green rectangle for a plain vertical staff
    // line — the correct NATO command indicator.
    function applyHqModifier(sidc) {
        const s = String(sidc || DEFAULT_SIDC);
        if (s.length < 20) return s;
        return s.substring(0, 7) + '2' + s.substring(8);
    }

    function rewriteHqStaff(svg) {
        return svg.replace(
            /<path d="M(-?\d+),(-?\d+) l(-?\d+),0 0,(-?\d+) -?\d+,0 z" stroke-width="\d+" stroke="[^"]+" fill="rgb\((?:0,255,0|255,255,0)\)"[^>]*><\/path>/,
            (_m, x, y, _w, h) => {
                const top = Number(y) - 5;
                const bottom = Number(y) + Number(h);
                return `<path d="M${x},${top} L${x},${bottom}" stroke="black" stroke-width="4" fill="none"></path>`;
            }
        );
    }

    function buildSymbolHtml(sidc, size, isHq) {
        const effective = isHq ? applyHqModifier(sidc) : (sidc || DEFAULT_SIDC);
        try {
            if (window.ms && typeof window.ms.Symbol === 'function') {
                const sym = new window.ms.Symbol(effective, { size, simpleStatusModifier: true });
                if (sym.isValid()) {
                    return isHq ? rewriteHqStaff(sym.asSVG()) : sym.asSVG();
                }
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
        // Auto-collapse any parent we haven't rendered before. First load →
        // every parent is new, so the whole tree starts collapsed (only roots
        // visible). Refreshes preserve the user's current expand state.
        for (const u of unitsFlat) {
            if (u.deleted_at) continue;
            if (!seenIds.has(u.id)) {
                seenIds.add(u.id);
                const hasChildren = unitsFlat.some(c => c.parent_id === u.id && !c.deleted_at);
                if (hasChildren) collapsed.add(u.id);
            }
        }
        render();
    }

    // ── Render ──────────────────────────────────────────────────────────
    // Tree grows LEFT → RIGHT: the root is on the left, each descendant level
    // is one column further right. A node is a flex row of (card, children).
    // The children column stacks vertically, so sibling sub-trees don't
    // compete for horizontal space.
    function render() {
        if (!treeEl) return;
        treeEl.innerHTML = '';
        const live = (unitsFlat || []).filter(u => !u.deleted_at);
        if (!roots.length || !live.length) {
            if (emptyEl) emptyEl.hidden = false;
            return;
        }
        if (emptyEl) emptyEl.hidden = true;

        // Multiple roots are stacked vertically; each roots's sub-tree expands
        // to the right from its own card.
        const rootsWrap = document.createElement('div');
        rootsWrap.className = 'orbat-dock-roots';
        for (const n of roots) {
            if (n.deleted_at) continue;
            rootsWrap.appendChild(buildNode(n));
        }
        treeEl.appendChild(rootsWrap);
    }

    // After an expand, bring the newly-revealed children into the dock
    // viewport — including the hanging +/− toggle below each card and a bit
    // of breathing room so the user can see where the next level would land.
    // Runs after the next paint so the browser has computed the freshly-
    // rendered children's bounding box.
    function scrollChildrenIntoView(unitId) {
        requestAnimationFrame(() => {
            if (!treeEl) return;
            const nodeEl = treeEl.querySelector(`.orbat-dock-node[data-unit-id="${CSS.escape(unitId)}"]`);
            if (!nodeEl) return;
            const childrenEl = nodeEl.querySelector(':scope > .orbat-dock-children');
            const body = document.getElementById('orbat-dock-body');
            if (!childrenEl || !body) return;

            // Target area = children container PLUS the hanging toggle zone
            // below it (~24px) so the +/− button doesn't clip at the bottom edge.
            const TAIL = 28;
            const bodyRect  = body.getBoundingClientRect();
            const childRect = childrenEl.getBoundingClientRect();

            // Vertical: only scroll if the bottom of the children (+ tail) is
            // below the visible area. Leaves the dock alone if already in view.
            const desiredBottom = childRect.bottom + TAIL;
            const overflowY     = desiredBottom - bodyRect.bottom;

            // Horizontal: center the children row in the viewport so wide
            // sibling rows don't bleed off either edge.
            const childCenterX = childRect.left + childRect.width / 2;
            const viewCenterX  = bodyRect.left + bodyRect.width / 2;
            const deltaX       = childCenterX - viewCenterX;

            const nextTop  = overflowY > 0 ? body.scrollTop + overflowY : body.scrollTop;
            const nextLeft = body.scrollLeft + deltaX;

            try {
                body.scrollTo({ top: nextTop, left: nextLeft, behavior: 'smooth' });
            } catch (_) {
                body.scrollTop  = nextTop;
                body.scrollLeft = nextLeft;
            }
        });
    }

    function buildNode(unit) {
        const node = document.createElement('div');
        node.className = 'orbat-dock-node';
        node.dataset.unitId = unit.id;

        node.appendChild(buildCard(unit));

        const liveChildren = (unit.children || []).filter(c => !c.deleted_at);
        if (liveChildren.length && !collapsed.has(unit.id)) {
            const childrenWrap = document.createElement('div');
            childrenWrap.className = 'orbat-dock-children';
            for (const c of liveChildren) childrenWrap.appendChild(buildNode(c));
            node.appendChild(childrenWrap);
        }
        return node;
    }

    function buildCard(unit) {
        const card = document.createElement('div');
        card.className = 'orbat-dock-card';
        card.setAttribute('draggable', 'true');
        card.dataset.unitId = unit.id;
        if (isPlaced(unit)) card.classList.add('is-placed');
        const side = unit.side || 'friendly';
        card.classList.add('side-' + side);

        const liveChildren = (unit.children || []).filter(c => !c.deleted_at);
        const isHq = liveChildren.length > 0;
        if (isHq) card.classList.add('is-hq');

        // Milsymbol (top). Commanders get the proper NATO command-staff line
        // drawn underneath the frame's lower-left corner.
        const symWrap = document.createElement('div');
        symWrap.className = 'orbat-dock-card-sym';
        symWrap.innerHTML = buildSymbolHtml(unit.sidc, 28, isHq);
        card.appendChild(symWrap);

        // Name
        const name = document.createElement('div');
        name.className = 'orbat-dock-card-name';
        name.textContent = unit.name || '—';
        card.appendChild(name);

        // Meta (level + code + placed badge). The badge is a button so
        // clicking it unplaces the unit (removes its map marker).
        const meta = document.createElement('div');
        meta.className = 'orbat-dock-card-meta';
        meta.innerHTML =
            `<span>${escapeHtml(levelLabel(unit.level))}</span>` +
            (unit.code ? `<span>· ${escapeHtml(unit.code)}</span>` : '') +
            `<button type="button" class="orbat-dock-placed-badge" title="${escapeHtml(tr('orbat-dock-unplace-hint', 'click to remove from map'))}">${escapeHtml(tr('orbat-dock-placed', 'placed'))}</button>`;
        card.appendChild(meta);

        const badgeBtn = meta.querySelector('.orbat-dock-placed-badge');
        if (badgeBtn) {
            badgeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                unplaceUnit(unit.id);
            });
            // Don't let a click on the badge start a card drag.
            badgeBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
            badgeBtn.addEventListener('mousedown',   (e) => e.stopPropagation());
            badgeBtn.addEventListener('dragstart',   (e) => e.preventDefault());
        }

        // Expand/collapse toggle — only if the unit has descendants.
        if (liveChildren.length) {
            const toggle = document.createElement('button');
            toggle.type = 'button';
            toggle.className = 'orbat-dock-toggle';
            const isCollapsed = collapsed.has(unit.id);
            toggle.classList.toggle('is-collapsed', isCollapsed);
            toggle.setAttribute('aria-label', tr(isCollapsed ? 'orbat-dock-expand' : 'orbat-dock-collapse', isCollapsed ? 'Expand' : 'Collapse'));
            // Unicode minus (U+2212) is wider and visually balances the '+'.
            toggle.textContent = isCollapsed ? '+' : '−';
            toggle.addEventListener('click', (e) => {
                e.stopPropagation();
                const wasCollapsed = isCollapsed;
                if (wasCollapsed) collapsed.delete(unit.id);
                else collapsed.add(unit.id);
                render();
                // On expand, scroll so the newly-revealed children come into
                // view. `nearest` keeps motion minimal if they're already
                // partially visible; `center` horizontally centers wide rows.
                if (wasCollapsed) scrollChildrenIntoView(unit.id);
            });
            // Clicks on the toggle must NOT initiate a drag.
            toggle.addEventListener('pointerdown', (e) => e.stopPropagation());
            toggle.addEventListener('mousedown',   (e) => e.stopPropagation());
            toggle.addEventListener('dragstart',   (e) => e.preventDefault());
            card.appendChild(toggle);
        }

        // Drag source
        card.addEventListener('dragstart', (e) => {
            card.classList.add('dragging');
            try {
                e.dataTransfer.effectAllowed = 'copyMove';
                e.dataTransfer.setData(DRAG_MIME, JSON.stringify({ id: unit.id }));
                e.dataTransfer.setData('text/plain', unit.name || unit.id);
            } catch (_) { /* ignore */ }
        });
        card.addEventListener('dragend', () => {
            card.classList.remove('dragging');
        });

        card.title = `${unit.name || ''}${unit.code ? ' (' + unit.code + ')' : ''} ${tr('orbat-dock-drag-hint', '— drag onto the map to position')}`;
        return card;
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
            await handleDrop(payload.id, latlng);
        });
    }

    // Top-level drop router.
    // - If the drop is a Brigade (level 2) AND lands inside an auto-flank
    //   polygon, run formation placement across the three regions.
    // - Otherwise, place the single dropped unit at the drop location.
    async function handleDrop(unitId, latlng) {
        const unit = unitsFlat.find(u => u.id === unitId && !u.deleted_at);
        if (!unit) { await placeUnitAt(unitId, latlng); return; }
        if (unit.level === 2) {
            const polys = findAutoFlankSession(latlng);
            if (polys && polys.length) {
                await placeBrigadeFormation(unit, polys);
                return;
            }
        }
        await placeUnitAt(unitId, latlng);
    }

    // ── Formation placement (Brigade drop on auto-flank area) ──────────
    // All three regions are tagged `_autoFlankArea=true` with an `areaRole`
    // of 'battalion-left' | 'battalion-right' | 'brigade-rear'. We find the
    // polygon that contains the drop point, then gather all polygons of the
    // same auto-flank session (via _tmgData.sessionId) so battalions can be
    // distributed across the full formation.
    function findAutoFlankSession(latlng) {
        if (typeof window.getAllLayerElements !== 'function') return null;
        let all = [];
        try { all = window.getAllLayerElements() || []; } catch (_) { return null; }
        const flankPolys = all.filter(el =>
            el && el._autoFlankArea === true && typeof el.getLatLngs === 'function'
        );
        if (!flankPolys.length) return null;
        const hit = flankPolys.find(el => polygonContains(el, latlng));
        if (!hit) return null;
        const sid = hit._tmgData && hit._tmgData.sessionId;
        if (!sid) return [hit];
        return flankPolys.filter(el => el._tmgData && el._tmgData.sessionId === sid);
    }

    function outerRingOfPolygon(poly) {
        let raw;
        try { raw = poly.getLatLngs(); } catch (_) { return null; }
        if (!raw) return null;
        // Walk into nested arrays until we hit LatLngs.
        let ring = raw;
        while (Array.isArray(ring) && ring.length && Array.isArray(ring[0])) ring = ring[0];
        if (!Array.isArray(ring) || !ring.length || typeof ring[0].lat !== 'number') return null;
        return ring;
    }

    function pointInRing(latlng, ring) {
        if (!ring || ring.length < 3) return false;
        let r = ring;
        const a = ring[0], b = ring[ring.length - 1];
        if (a.lat === b.lat && a.lng === b.lng) r = ring.slice(0, -1);
        if (r.length < 3) return false;
        const x = latlng.lng, y = latlng.lat;
        let inside = false;
        for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
            const xi = r[i].lng, yi = r[i].lat;
            const xj = r[j].lng, yj = r[j].lat;
            if (((yi > y) !== (yj > y)) &&
                (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-18) + xi)) {
                inside = !inside;
            }
        }
        return inside;
    }

    function polygonContains(poly, latlng) {
        const ring = outerRingOfPolygon(poly);
        if (!ring) return false;
        return pointInRing(latlng, ring);
    }

    function polygonCentroid(poly) {
        const ring = outerRingOfPolygon(poly);
        if (!ring || !ring.length) return null;
        let lat = 0, lng = 0;
        for (const p of ring) { lat += p.lat; lng += p.lng; }
        return L.latLng(lat / ring.length, lng / ring.length);
    }

    // Rough "radius" of a polygon in metres — max vertex distance from its
    // centroid. Good enough for sizing company spacing and front offsets.
    function polygonRadiusMeters(poly) {
        const c = polygonCentroid(poly);
        const ring = outerRingOfPolygon(poly);
        if (!c || !ring) return 500;
        let max = 0;
        for (const p of ring) {
            const d = c.distanceTo(p);
            if (d > max) max = d;
        }
        return max || 500;
    }

    // Convert a metre-space offset (dxEast, dyNorth) into an offset latlng
    // anchored at `center`. Flat-earth OK for formation-scale distances.
    const EARTH_R = 6378137;
    function offsetLatLng(center, dxEastM, dyNorthM) {
        const dLat = (dyNorthM / EARTH_R) * (180 / Math.PI);
        const dLng = (dxEastM / (EARTH_R * Math.cos(center.lat * Math.PI / 180))) * (180 / Math.PI);
        return L.latLng(center.lat + dLat, center.lng + dLng);
    }

    function vectorMetersBetween(from, to) {
        const midLat = (from.lat + to.lat) / 2;
        const mPerDegLng = Math.cos(midLat * Math.PI / 180) * (EARTH_R * Math.PI / 180);
        const mPerDegLat = EARTH_R * Math.PI / 180;
        return { x: (to.lng - from.lng) * mPerDegLng, y: (to.lat - from.lat) * mPerDegLat };
    }

    function normalize(v) {
        const len = Math.hypot(v.x, v.y);
        if (!len) return { x: 0, y: 1 };
        return { x: v.x / len, y: v.y / len };
    }

    function sortByNameNumeric(a, b) {
        const n = (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' });
        if (n !== 0) return n;
        return (a.code || '').localeCompare(b.code || '');
    }

    // Distribute Brigade + descendants across the formation.
    //   Brigade HQ                     → brigade-rear centroid
    //   Battalion[0]                   → battalion-left   polygon
    //   Battalion[1]                   → battalion-right  polygon
    //   Battalion[2+]                  → brigade-rear     polygon (stacked)
    //   Each battalion's companies     → front line of its polygon, 35% forward
    //   Battalion marker               → ~20% behind its company line
    //
    // "Forward" for each battalion polygon is the vector from the rear
    // polygon's centroid to that polygon's centroid. "Right" is the 90° CCW
    // rotation of that, so companies spread sideways across the flank.
    async function placeBrigadeFormation(brigade, polys) {
        const byRole = {};
        for (const p of polys) {
            const role = p._tmgData && p._tmgData.areaRole;
            if (role && !byRole[role]) byRole[role] = p;
        }
        const leftPoly  = byRole['battalion-left']  || null;
        const rightPoly = byRole['battalion-right'] || null;
        const rearPoly  = byRole['brigade-rear']    || null;
        if (!leftPoly && !rightPoly && !rearPoly) return;

        const battalions = unitsFlat
            .filter(u => !u.deleted_at && u.parent_id === brigade.id && u.level === 3)
            .sort(sortByNameNumeric);

        const slots = [];
        if (leftPoly)  slots.push(leftPoly);
        if (rightPoly) slots.push(rightPoly);
        if (rearPoly)  slots.push(rearPoly);

        const placements = []; // [{ unitId, lat, lng }, ...]

        // Reference centroid for computing forward direction. Prefer the rear
        // polygon; fall back to the first flank polygon.
        const refCentroid = polygonCentroid(rearPoly || leftPoly || rightPoly);

        // Brigade HQ → rear polygon centroid (offset slightly if a battalion
        // is also being placed in rear, so the two markers don't stack).
        if (rearPoly) {
            const rc = polygonCentroid(rearPoly);
            if (rc) {
                // Small upward (north) offset toward the rear of the polygon.
                const rad = polygonRadiusMeters(rearPoly);
                const hqOffset = battalions.length > 2 ? rad * 0.25 : 0;
                const forward  = normalize(vectorMetersBetween(refCentroid, rc));
                const back     = { x: -forward.x, y: -forward.y };
                const pos = hqOffset
                    ? offsetLatLng(rc, back.x * hqOffset, back.y * hqOffset)
                    : rc;
                const finalPos = polygonContains(rearPoly, pos) ? pos : rc;
                placements.push({ unitId: brigade.id, lat: finalPos.lat, lng: finalPos.lng });
            }
        } else {
            // No rear polygon? Park the Brigade at the formation centroid.
            placements.push({ unitId: brigade.id, lat: refCentroid.lat, lng: refCentroid.lng });
        }

        // Assign battalions to slots; extras stack in the rear slot.
        for (let i = 0; i < battalions.length; i++) {
            const slot = slots[Math.min(i, slots.length - 1)];
            if (!slot) continue;
            const batt = battalions[i];
            // If this battalion is the "extra" one stacked into a slot, shift
            // its block sideways so it doesn't overlap the one before it.
            const stackIndex = Math.max(0, i - (slots.length - 1));
            layoutBattalionInPolygon(batt, slot, refCentroid, stackIndex, placements);
        }

        // Run the POSTs (sequential so the Layers panel count updates cleanly).
        for (const p of placements) {
            await placeAndAddMarker(p.unitId, L.latLng(p.lat, p.lng));
        }
        // Refresh the ORBAT dock so newly-placed units pick up their badge.
        await loadTree();
    }

    function layoutBattalionInPolygon(batt, poly, refCentroid, stackIndex, out) {
        const centroid = polygonCentroid(poly);
        if (!centroid) return;
        const rad = polygonRadiusMeters(poly);

        // Forward = rear→battalion direction. For the rear polygon (where
        // refCentroid === centroid) we fall back to "north" so the formation
        // still faces a sensible direction.
        let forward;
        const v = vectorMetersBetween(refCentroid, centroid);
        if (Math.hypot(v.x, v.y) < 1) forward = { x: 0, y: 1 };
        else forward = normalize(v);
        const right = { x: -forward.y, y: forward.x }; // 90° CCW

        // Stacking offset — shift the whole block along the "right" axis when
        // this isn't the first battalion in its polygon.
        const stackOffset = stackIndex * rad * 0.55;

        const companies = unitsFlat
            .filter(u => !u.deleted_at && u.parent_id === batt.id && u.level === 4)
            .sort(sortByNameNumeric);

        if (!companies.length) {
            const pos = stackOffset
                ? offsetLatLng(centroid, right.x * stackOffset, right.y * stackOffset)
                : centroid;
            const finalPos = polygonContains(poly, pos) ? pos : centroid;
            out.push({ unitId: batt.id, lat: finalPos.lat, lng: finalPos.lng });
            return;
        }

        const frontM   = rad * 0.35;             // companies pushed 35% forward
        const behindM  = rad * 0.20;             // battalion marker 20% behind centroid
        const spread   = rad * 1.10;             // total line width (capped by polygon)
        const step     = companies.length > 1 ? spread / (companies.length - 1) : 0;
        const half     = step * (companies.length - 1) / 2;

        for (let i = 0; i < companies.length; i++) {
            const side = -half + i * step + stackOffset;
            const dx = forward.x * frontM + right.x * side;
            const dy = forward.y * frontM + right.y * side;
            const pos = offsetLatLng(centroid, dx, dy);
            const finalPos = polygonContains(poly, pos) ? pos : centroid;
            out.push({ unitId: companies[i].id, lat: finalPos.lat, lng: finalPos.lng });
        }

        // Battalion marker: behind the company line.
        const bdx = -forward.x * behindM + right.x * stackOffset;
        const bdy = -forward.y * behindM + right.y * stackOffset;
        const battPos = offsetLatLng(centroid, bdx, bdy);
        const finalBattPos = polygonContains(poly, battPos) ? battPos : centroid;
        out.push({ unitId: batt.id, lat: finalBattPos.lat, lng: finalBattPos.lng });
    }

    function unitHasChildren(unitId) {
        return unitsFlat.some(u => u.parent_id === unitId && !u.deleted_at);
    }

    // Inner helper — POSTs the placement and reflects it in the map. Used by
    // both the single-drop path (placeUnitAt) and the formation path.
    async function placeAndAddMarker(unitId, latlng) {
        try {
            const res = await fetch(`/api/units/${encodeURIComponent(unitId)}/place`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lat: latlng.lat, lng: latlng.lng }),
            });
            if (!res.ok) return false;
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
                hasChildren: unitHasChildren(unitId),
            });
            document.dispatchEvent(new CustomEvent('units:placed', { detail: { unitId } }));
            // Reflect in our local cache so the ORBAT dock updates the
            // "placed" badge without a server round-trip.
            const local = unitsFlat.find(u => u.id === unitId);
            if (local) { local.lat = Number(updated.lat); local.lng = Number(updated.lng); }
            patchNodeLatLng(roots, unitId, Number(updated.lat), Number(updated.lng));
            return true;
        } catch (err) {
            console.warn('[orbat-dock] place failed for', unitId, err);
            return false;
        }
    }

    async function placeUnitAt(unitId, latlng) {
        const ok = await placeAndAddMarker(unitId, latlng);
        if (ok) render();
    }

    // Click handler for the green "placed" badge: drops the unit's map
    // marker and clears its coordinates server-side. Updates the local
    // cache optimistically so the badge disappears immediately, then
    // dispatches `units:removed` so the map (and any other listeners)
    // sync up.
    async function unplaceUnit(unitId) {
        const local = unitsFlat.find(u => u.id === unitId);
        const prevLat = local ? local.lat : null;
        const prevLng = local ? local.lng : null;
        if (local) { local.lat = null; local.lng = null; }
        patchNodeLatLng(roots, unitId, null, null);
        render();
        try {
            window.AppUnitsMap?.removeMarker?.(unitId);
        } catch (_) { /* ignore */ }
        try {
            const res = await fetch(`/api/units/${encodeURIComponent(unitId)}/unplace`, {
                method: 'POST',
                credentials: 'include',
            });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            document.dispatchEvent(new CustomEvent('units:removed', { detail: { unitId } }));
        } catch (err) {
            console.warn('[orbat-dock] unplace failed for', unitId, err);
            // Roll back the optimistic update so the badge comes back.
            if (local) { local.lat = prevLat; local.lng = prevLng; }
            patchNodeLatLng(roots, unitId, prevLat, prevLng);
            render();
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
    // After any visibility/collapse change we re-publish `--orbat-dock-h` so
    // the bottom-right Leaflet controls (zoom / scale / basemap) ride above
    // the dock — otherwise they stay pinned to the bottom and end up sitting
    // inside the dock card. We also invalidate the Leaflet size so the map
    // viewport tracks the new visible area.
    function syncLayout() {
        publishDockHeightVar();
        try { map?.invalidateSize?.(); } catch (_) {}
    }

    function open() {
        if (!ensureBound()) return;
        dockEl.classList.remove('hidden');
        dockEl.setAttribute('aria-hidden', 'false');
        loadTree();
        syncLayout();
    }

    function close() {
        if (!dockEl) return;
        dockEl.classList.add('hidden');
        dockEl.setAttribute('aria-hidden', 'true');
        syncLayout();
    }

    function toggle() {
        if (!dockEl) { open(); return; }
        if (dockEl.classList.contains('hidden')) open();
        else close();
    }

    function toggleCollapsed() {
        if (!dockEl) return;
        const collapsed = dockEl.classList.toggle('is-collapsed');
        if (collapseBtn) collapseBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        syncLayout();
    }

    // ── Resize handle ───────────────────────────────────────────────────
    function clampHeight(h) {
        const maxH = Math.max(MIN_H, Math.round(window.innerHeight * MAX_H_FRAC));
        return Math.max(MIN_H, Math.min(maxH, Math.round(h)));
    }

    // Publishes the dock's *visible* height as a CSS custom property
    // (`--orbat-dock-h`) on <html>, so floating widgets — Leaflet's
    // zoom/scale/basemap controls in the bottom-right corner — can sit
    // just above the dock and follow its top edge as it resizes,
    // collapses, or hides. Style rule lives in style.css beside the
    // .orbat-dock block.
    function publishDockHeightVar() {
        try {
            const root = document.documentElement;
            if (!root) return;
            const hidden = !dockEl || dockEl.classList.contains('hidden');
            const h = hidden ? 0 : Math.round((dockEl.getBoundingClientRect().height) || 0);
            root.style.setProperty('--orbat-dock-h', h + 'px');
        } catch (_) { /* ignore */ }
    }

    function applyHeight(h, { persist = true } = {}) {
        if (!dockEl) return;
        const clamped = clampHeight(h);
        dockEl.style.height = clamped + 'px';
        publishDockHeightVar();
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
            document.body.classList.remove('orbat-dock-resizing');
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
            document.body.classList.add('orbat-dock-resizing');
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
        collapseBtn = document.getElementById('orbat-dock-collapse');
        if (!dockEl || !treeEl) return false;

        closeBtn?.addEventListener('click', close);
        refreshBtn?.addEventListener('click', () => loadTree());
        collapseBtn?.addEventListener('click', () => {
            toggleCollapsed();
            // is-collapsed shrinks the dock via CSS without going through
            // applyHeight; publish synchronously so floating controls
            // (Leaflet zoom/scale/basemap) snap to the new top edge.
            publishDockHeightVar();
        });
        bindResize();
        restoreSavedHeight();

        // Catch any other size change — CSS collapse/expand transitions,
        // browser zoom, font-size changes — and keep --orbat-dock-h in sync
        // so floating controls always sit just above the dock.
        try {
            if (typeof ResizeObserver === 'function') {
                const ro = new ResizeObserver(() => publishDockHeightVar());
                ro.observe(dockEl);
            }
        } catch (_) { /* observer unavailable — applyHeight/open/close still cover the common cases */ }
        // Initial publish so the variable exists from the very first frame.
        publishDockHeightVar();

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
