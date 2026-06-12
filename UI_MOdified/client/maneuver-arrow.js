/**
 * maneuver-arrow.js — Animated, curving "Maneuver Arrow" tactical graphic.
 *
 * Draws a smooth cubic-bezier spine plus two thinner flanking bezier curves
 * offset perpendicular to the spine, with an arrowhead polygon at the tip.
 * The user lays it down with two clicks (tail then tip) and then bends it
 * by dragging three handles:
 *
 *   - c1, c2   — the two intermediate bezier control points
 *   - spread   — at the spine midpoint, drag perpendicular to grow/shrink
 *                the flank offset; drag onto the spine to hide the flanks
 *
 * All shapes live in a dedicated 'maneuverArrowPane' so they sit above the
 * tile overlay but below markers. Animations come from window.AppArrowAnim:
 * a continuous marching-dash flow on the spine, a one-shot draw-on when the
 * arrow is created or loaded, and an optional head-tracer pulse fired by
 * the turn engine each turn.
 *
 * Data model (also the on-disk shape under properties.app):
 *   {
 *     kind: 'tmg-maneuver-arrow',
 *     spine:   { p0:{lat,lng}, c1:{lat,lng}, c2:{lat,lng}, p3:{lat,lng} },
 *     style:   { color, spineWidthPx, flankWidthPx, flankOffsetKm,
 *                flankConverge, headWidthKm, headLengthKm, glow },
 *     animation:{ flowDashes, flowSpeedPxPerSec, drawOnMs, playOnTurn }
 *   }
 *
 * Bridge name: window.ManeuverArrow
 */
(function () {
    'use strict';

    const SVG_NS = 'http://www.w3.org/2000/svg';
    const KM_PER_DEG_LAT = 110.574;
    const kmPerDegLng = (lat) => 111.32 * Math.cos(lat * Math.PI / 180);

    const DEFAULT_STYLE = {
        color: '#22c55e',
        spineWidthPx: 5,
        flankWidthPx: 3,
        flankOffsetKm: 1.5,
        flankConverge: 0.35,
        headWidthKm: 2.4,
        headLengthKm: 2.0,
        glow: true,
    };
    const DEFAULT_ANIM = {
        flowDashes: true,
        flowSpeedPxPerSec: 60,
        drawOnMs: 1800,
        playOnTurn: true,
    };

    // ── km <-> latlng helpers (same math as turn-engine.js) ──────────
    function latLngToKm(ll, origin) {
        return {
            kmE: (ll.lng - origin.lng) * kmPerDegLng(origin.lat),
            kmN: (ll.lat - origin.lat) * KM_PER_DEG_LAT,
        };
    }
    function kmToLatLng(kmE, kmN, origin) {
        return L.latLng(
            origin.lat + kmN / KM_PER_DEG_LAT,
            origin.lng + kmE / kmPerDegLng(origin.lat)
        );
    }
    function asLatLng(p) {
        if (!p) return null;
        if (p instanceof L.LatLng) return p;
        if (Array.isArray(p)) return L.latLng(p[0], p[1]);
        if (typeof p.lat === 'number' && typeof p.lng === 'number') return L.latLng(p.lat, p.lng);
        return null;
    }

    // ── Bezier math in km space ─────────────────────────────────────
    function bezierPoint(t, p0, p1, p2, p3) {
        const u = 1 - t;
        const uu = u * u, uuu = uu * u;
        const tt = t * t, ttt = tt * t;
        return {
            x: uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x,
            y: uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y,
        };
    }
    function bezierTangent(t, p0, p1, p2, p3) {
        const u = 1 - t;
        return {
            x: 3 * u * u * (p1.x - p0.x) + 6 * u * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x),
            y: 3 * u * u * (p1.y - p0.y) + 6 * u * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y),
        };
    }
    function unitVec(v) {
        const len = Math.hypot(v.x, v.y) || 1;
        return { x: v.x / len, y: v.y / len };
    }
    function perpVec(v) {
        // 90° CCW rotation; in a kmE/kmN frame this gives the left-of-direction normal
        return { x: -v.y, y: v.x };
    }

    // Approximate arc length by sampling the bezier
    function bezierArcLengthSamples(p0, p1, p2, p3, samples) {
        const out = [];
        let totalKm = 0;
        let prev = bezierPoint(0, p0, p1, p2, p3);
        out.push({ t: 0, s: 0, p: prev });
        for (let i = 1; i <= samples; i++) {
            const t = i / samples;
            const cur = bezierPoint(t, p0, p1, p2, p3);
            totalKm += Math.hypot(cur.x - prev.x, cur.y - prev.y);
            out.push({ t, s: totalKm, p: cur });
            prev = cur;
        }
        return { samples: out, totalKm };
    }

    // ── ManeuverArrow class ─────────────────────────────────────────
    class ManeuverArrowLayer {
        constructor(map, spine, style, anim, opts) {
            this.map = map;
            this.spine = {
                p0: asLatLng(spine.p0),
                c1: asLatLng(spine.c1),
                c2: asLatLng(spine.c2),
                p3: asLatLng(spine.p3),
            };
            this.style = Object.assign({}, DEFAULT_STYLE, style || {});
            this.anim = Object.assign({}, DEFAULT_ANIM, anim || {});
            this._flowToken = null;
            this._handlesVisible = false;
            this._dragging = null;
            this._opts = opts || {};

            // The public LayerGroup that callers add to the map / a layer.
            this.group = L.layerGroup();
            // Mark for io.js export + turn-engine discovery.
            this.group._tmgData = {
                isManeuverArrow: true,
                kind: 'tmg-maneuver-arrow',
                typeId: 'maneuver-arrow',
                spine: this.spine,
                style: this.style,
                animation: this.anim,
                color: this.style.color,
            };
            this.group._maneuverArrow = this;

            this._buildSvg();
            this._buildHandles();
            this._redraw();
            this._attachMapHooks();
        }

        // Build the four SVG paths (left-flank, right-flank, spine, head) and
        // append them directly to the dedicated pane. We don't use L.Polyline
        // because we need exact bezier control over the d attribute and we
        // share one SVG element host per pane (Leaflet creates one on demand).
        _buildSvg() {
            const pane = this.map.getPane('maneuverArrowPane') || this.map.getPane('overlayPane');
            // Ensure an <svg> host exists in the pane. Leaflet doesn't create one
            // for empty custom panes, so we make our own and reuse it for every
            // ManeuverArrow drawn into this pane.
            let host = pane.querySelector('svg.maneuver-arrow-host');
            if (!host) {
                host = document.createElementNS(SVG_NS, 'svg');
                host.setAttribute('class', 'leaflet-zoom-animated maneuver-arrow-host');
                host.style.position = 'absolute';
                host.style.left = '0';
                host.style.top = '0';
                host.style.width = '100%';
                host.style.height = '100%';
                host.style.pointerEvents = 'none';
                host.style.overflow = 'visible';
                pane.appendChild(host);
            }
            this._svgHost = host;

            const mk = (cls) => {
                const p = document.createElementNS(SVG_NS, 'path');
                p.setAttribute('class', cls);
                p.setAttribute('fill', 'none');
                p.style.pointerEvents = 'auto';
                host.appendChild(p);
                return p;
            };
            this._flankL = mk('maneuver-arrow-flank');
            this._flankR = mk('maneuver-arrow-flank');
            this._spine  = mk('maneuver-arrow-spine');
            this._head   = document.createElementNS(SVG_NS, 'path');
            this._head.setAttribute('class', 'maneuver-arrow-head');
            host.appendChild(this._head);

            // Click on the spine selects the arrow (toggles handles). During
            // placement we deliberately do nothing so the user can still click
            // through to drop the next placement point.
            const stop = (e) => {
                e.preventDefault?.();
                e.stopPropagation?.();
                if (typeof L !== 'undefined' && L.DomEvent) {
                    try { L.DomEvent.stop(e); } catch (_) {}
                }
            };
            const onPick = (e) => {
                if (placement) return;   // placement flow takes priority
                stop(e);
                this.setHandlesVisible(!this._handlesVisible);
            };
            ['mousedown', 'click'].forEach(ev => {
                this._spine.addEventListener(ev, onPick);
                this._flankL.addEventListener(ev, onPick);
                this._flankR.addEventListener(ev, onPick);
                this._head.addEventListener(ev, onPick);
            });

            // Open the popup on right-click for the replay/delete actions.
            const onCtx = (e) => {
                if (placement) return;
                stop(e);
                this._openContextPopup(e);
            };
            this._spine.addEventListener('contextmenu', onCtx);
            this._head.addEventListener('contextmenu', onCtx);
        }

        _buildHandles() {
            const mkHandle = (cls) => {
                const m = L.circleMarker([0, 0], {
                    pane: 'maneuverArrowPane',
                    radius: 7,
                    weight: 2,
                    color: '#0ea5e9',
                    fillColor: '#fff',
                    fillOpacity: 1,
                    interactive: true,
                    bubblingMouseEvents: false,
                    className: 'maneuver-arrow-handle ' + cls,
                });
                m.on('mousedown', (e) => this._beginHandleDrag(cls, e));
                return m;
            };
            this._handleC1 = mkHandle('handle-c1');
            this._handleC2 = mkHandle('handle-c2');
            this._handleSpread = mkHandle('handle-spread');
        }

        _attachMapHooks() {
            this._onViewReset = () => this._redraw();
            this.map.on('zoom move zoomend moveend viewreset', this._onViewReset);
            // The raw SVG paths live on the pane host independently of the
            // L.LayerGroup, so hide/show them in sync with the group's add/remove
            // events. This keeps "hide layer" working as users expect.
            const setSvgDisplay = (display) => {
                [this._spine, this._flankL, this._flankR, this._head].forEach(p => {
                    if (p) p.style.display = display;
                });
            };
            this.group.on('add', () => setSvgDisplay(''));
            this.group.on('remove', () => setSvgDisplay('none'));
        }

        // Centroid of the spine in latlng — used by io.js for the lat anchor when
        // converting km offsets to lat/lng for the flank computation.
        _origin() {
            const s = this.spine;
            return L.latLng(
                (s.p0.lat + s.p3.lat) / 2,
                (s.p0.lng + s.p3.lng) / 2,
            );
        }

        // Convert all four spine control points to (kmE, kmN) in a shared local
        // frame, so the flank-offset (in km) is geometrically faithful.
        _spineKm() {
            const origin = this._origin();
            const s = this.spine;
            return {
                origin,
                p0: latLngToKm(s.p0, origin),
                p1: latLngToKm(s.c1, origin),
                p2: latLngToKm(s.c2, origin),
                p3: latLngToKm(s.p3, origin),
            };
        }

        // Convert a km-space point back to a layer-pixel point for SVG.
        _kmToPx(kmPt, origin) {
            const ll = kmToLatLng(kmPt.x, kmPt.y, origin);
            return this.map.latLngToLayerPoint(ll);
        }

        // Recompute every path's d attribute and reposition handles.
        _redraw() {
            if (!this._svgHost) return;
            const km = this._spineKm();
            const origin = km.origin;

            // Spine path in pixel space — we resample the bezier in km, then
            // emit a single C command in pixels through the four control
            // points. SVG draws an identical cubic to what we sampled because
            // affine transforms preserve bezier degree.
            const ppx = (k) => this._kmToPx(k, origin);
            const sp0 = ppx({ x: km.p0.kmE, y: km.p0.kmN });
            const sp1 = ppx({ x: km.p1.kmE, y: km.p1.kmN });
            const sp2 = ppx({ x: km.p2.kmE, y: km.p2.kmN });
            const sp3 = ppx({ x: km.p3.kmE, y: km.p3.kmN });
            // Convert sample.km objects to {x:kmE, y:kmN} for math
            const Q0 = { x: km.p0.kmE, y: km.p0.kmN };
            const Q1 = { x: km.p1.kmE, y: km.p1.kmN };
            const Q2 = { x: km.p2.kmE, y: km.p2.kmN };
            const Q3 = { x: km.p3.kmE, y: km.p3.kmN };

            // Spine d
            const dSpine = `M ${sp0.x.toFixed(2)} ${sp0.y.toFixed(2)} `
                         + `C ${sp1.x.toFixed(2)} ${sp1.y.toFixed(2)}, `
                         +   `${sp2.x.toFixed(2)} ${sp2.y.toFixed(2)}, `
                         +   `${sp3.x.toFixed(2)} ${sp3.y.toFixed(2)}`;
            this._spine.setAttribute('d', dSpine);

            // Flank curves — offset each control point along the LOCAL bezier
            // normal at t = 0, 1/3, 2/3, 1, with offset shrinking toward the
            // tip when flankConverge > 0. This is the standard cubic-bezier
            // offsetting approximation (good enough below ~30° curvature).
            const offset = Math.max(0, Number(this.style.flankOffsetKm) || 0);
            const converge = Math.max(0, Math.min(1, Number(this.style.flankConverge) || 0));
            const buildFlank = (side /* +1 left, -1 right */) => {
                const ts = [0, 1 / 3, 2 / 3, 1];
                const ctrls = [Q0, Q1, Q2, Q3];
                const out = ctrls.map((c, i) => {
                    const tan = unitVec(bezierTangent(ts[i], Q0, Q1, Q2, Q3));
                    const n = perpVec(tan);
                    const k = offset * (1 - converge * ts[i]) * side;
                    return { x: c.x + n.x * k, y: c.y + n.y * k };
                });
                const f0 = ppx(out[0]); const f1 = ppx(out[1]);
                const f2 = ppx(out[2]); const f3 = ppx(out[3]);
                return `M ${f0.x.toFixed(2)} ${f0.y.toFixed(2)} `
                     + `C ${f1.x.toFixed(2)} ${f1.y.toFixed(2)}, `
                     +   `${f2.x.toFixed(2)} ${f2.y.toFixed(2)}, `
                     +   `${f3.x.toFixed(2)} ${f3.y.toFixed(2)}`;
            };
            const showFlanks = offset > 0.001;
            this._flankL.setAttribute('d', showFlanks ? buildFlank(+1) : '');
            this._flankR.setAttribute('d', showFlanks ? buildFlank(-1) : '');

            // Arrowhead polygon at the tip — sized in km, oriented along the
            // bezier tangent at t = 1.
            const tipTan = unitVec(bezierTangent(1, Q0, Q1, Q2, Q3));
            const tipN = perpVec(tipTan);
            const headLen = Math.max(0.05, Number(this.style.headLengthKm) || 1);
            const headHalfW = Math.max(0.03, (Number(this.style.headWidthKm) || 1) / 2);
            // Tip at the actual end of the bezier so the head visually sits on top
            const tipKm = Q3;
            const baseCenter = { x: tipKm.x - tipTan.x * headLen, y: tipKm.y - tipTan.y * headLen };
            const baseL = { x: baseCenter.x + tipN.x * headHalfW, y: baseCenter.y + tipN.y * headHalfW };
            const baseR = { x: baseCenter.x - tipN.x * headHalfW, y: baseCenter.y - tipN.y * headHalfW };
            const tPx = ppx(tipKm), bL = ppx(baseL), bR = ppx(baseR);
            const dHead = `M ${tPx.x.toFixed(2)} ${tPx.y.toFixed(2)} `
                        + `L ${bL.x.toFixed(2)} ${bL.y.toFixed(2)} `
                        + `L ${bR.x.toFixed(2)} ${bR.y.toFixed(2)} Z`;
            this._head.setAttribute('d', dHead);

            // Style
            const color = this.style.color || DEFAULT_STYLE.color;
            this._spine.setAttribute('stroke', color);
            this._spine.setAttribute('stroke-width', String(this.style.spineWidthPx || 5));
            this._spine.setAttribute('stroke-linecap', 'round');
            this._spine.setAttribute('stroke-linejoin', 'round');
            this._flankL.setAttribute('stroke', color);
            this._flankR.setAttribute('stroke', color);
            this._flankL.setAttribute('stroke-width', String(this.style.flankWidthPx || 3));
            this._flankR.setAttribute('stroke', color);
            this._flankR.setAttribute('stroke-width', String(this.style.flankWidthPx || 3));
            this._flankL.setAttribute('stroke-linecap', 'round');
            this._flankR.setAttribute('stroke-linecap', 'round');
            this._flankL.setAttribute('stroke-dasharray', '10 6');
            this._flankR.setAttribute('stroke-dasharray', '10 6');
            this._flankL.setAttribute('opacity', '0.85');
            this._flankR.setAttribute('opacity', '0.85');
            this._head.setAttribute('fill', color);
            this._head.setAttribute('stroke', color);
            this._head.setAttribute('stroke-linejoin', 'round');
            this._head.setAttribute('stroke-width', '1');
            if (this.style.glow) {
                this._spine.classList.add('maneuver-arrow-glow');
                this._head.classList.add('maneuver-arrow-glow');
            } else {
                this._spine.classList.remove('maneuver-arrow-glow');
                this._head.classList.remove('maneuver-arrow-glow');
            }

            // Handle positions: c1, c2, and a spread handle at midpoint + normal*offset.
            this._handleC1.setLatLng(this.spine.c1);
            this._handleC2.setLatLng(this.spine.c2);
            const midKm = bezierPoint(0.5, Q0, Q1, Q2, Q3);
            const midTan = unitVec(bezierTangent(0.5, Q0, Q1, Q2, Q3));
            const midN = perpVec(midTan);
            // Spread handle sits at the current flank-L position at t=0.5 so the
            // user can grab the same point they see on the left flank.
            const spreadKm = { x: midKm.x + midN.x * offset * (1 - converge * 0.5),
                               y: midKm.y + midN.y * offset * (1 - converge * 0.5) };
            const spreadLL = kmToLatLng(spreadKm.x, spreadKm.y, origin);
            this._handleSpread.setLatLng(spreadLL);

            // Geo origin cached for spread-drag projection.
            this._cachedKm = { origin, Q0, Q1, Q2, Q3, midKm, midN };
        }

        setHandlesVisible(visible) {
            this._handlesVisible = !!visible;
            const onMap = this.group.hasLayer(this._handleC1);
            if (visible && !onMap) {
                this.group.addLayer(this._handleC1);
                this.group.addLayer(this._handleC2);
                this.group.addLayer(this._handleSpread);
            } else if (!visible && onMap) {
                this.group.removeLayer(this._handleC1);
                this.group.removeLayer(this._handleC2);
                this.group.removeLayer(this._handleSpread);
            }
        }

        // Handle drag — uses raw DOM mouse events on the map container so we
        // can update on every mousemove without rebinding through Leaflet.
        _beginHandleDrag(which, leafletEvent) {
            const orig = leafletEvent.originalEvent;
            orig.preventDefault();
            orig.stopPropagation();
            this.map.dragging.disable();
            const container = this.map.getContainer();
            const onMove = (ev) => {
                const rect = container.getBoundingClientRect();
                const px = L.point(ev.clientX - rect.left, ev.clientY - rect.top);
                const ll = this.map.containerPointToLatLng(px);
                if (which === 'handle-c1') {
                    this.spine.c1 = ll;
                } else if (which === 'handle-c2') {
                    this.spine.c2 = ll;
                } else if (which === 'handle-spread') {
                    // Project the cursor onto the spine midpoint's normal direction
                    // to get the new flank offset in km. Negative => clamp to 0.
                    const cached = this._cachedKm;
                    if (!cached) return;
                    const cur = latLngToKm(ll, cached.origin);
                    const dx = cur.kmE - cached.midKm.x;
                    const dy = cur.kmN - cached.midKm.y;
                    const projection = dx * cached.midN.x + dy * cached.midN.y;
                    this.style.flankOffsetKm = Math.max(0, projection);
                }
                this._syncTmgData();
                this._redraw();
            };
            const onUp = () => {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                this.map.dragging.enable();
                if (typeof this._opts.onChange === 'function') {
                    try { this._opts.onChange(this); } catch (_) {}
                }
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        }

        _syncTmgData() {
            const d = this.group._tmgData;
            d.spine = this.spine;
            d.style = this.style;
            d.animation = this.anim;
            d.color = this.style.color;
        }

        // Convenience: start flow + run draw-on. Call once after the group has
        // been attached to a map (so getTotalLength works for the draw-on tween).
        start() {
            if (this.anim.drawOnMs > 0) {
                this.playDrawOn(this.anim.drawOnMs);
            } else {
                this.startFlow();
            }
        }

        // ── Animations ──
        startFlow() {
            if (this._flowToken != null) return;
            if (!this.anim.flowDashes) return;
            this._flowToken = window.AppArrowAnim.startFlow(this._spine, {
                speedPxPerSec: this.anim.flowSpeedPxPerSec,
                dashArray: '14 10',
            });
        }
        stopFlow() {
            if (this._flowToken != null) {
                window.AppArrowAnim.stopFlow(this._flowToken);
                this._flowToken = null;
            }
        }
        playDrawOn(durationMs) {
            this.stopFlow();
            const ms = durationMs != null ? durationMs : this.anim.drawOnMs;
            window.AppArrowAnim.playDrawOn(this._spine, ms, () => this.startFlow());
        }
        playHeadPulse(durationMs) {
            window.AppArrowAnim.playHeadPulse(this._spine, durationMs || 900);
        }

        // ── Popup (replay + delete) ──
        _openContextPopup(domEvent) {
            const t = (key, fallback) => {
                try { if (window.t) { const v = window.t(key); if (v && v !== key) return v; } } catch (_) {}
                return fallback;
            };
            const popup = L.popup({
                closeButton: true,
                autoPan: false,
                className: 'maneuver-arrow-popup',
            });
            const html = document.createElement('div');
            html.className = 'maneuver-popup-body';
            html.innerHTML = `
                <button type="button" class="glass-btn maneuver-replay-btn">${t('maneuver-replay', 'Replay')}</button>
                <label class="maneuver-popup-row">
                    <span>${t('maneuver-flank-spread', 'Flank spread')}</span>
                    <input type="range" min="0" max="6" step="0.1" class="maneuver-spread-range" value="${this.style.flankOffsetKm.toFixed(2)}"/>
                </label>
                <label class="maneuver-popup-row">
                    <input type="checkbox" class="maneuver-converge-check" ${this.style.flankConverge > 0 ? 'checked' : ''}/>
                    <span>${t('maneuver-converge', 'Converge to tip')}</span>
                </label>
                <button type="button" class="glass-btn glass-btn--danger maneuver-delete-btn">${t('delete-btn', 'Delete')}</button>
            `;
            const rect = this.map.getContainer().getBoundingClientRect();
            const ll = this.map.containerPointToLatLng(L.point(domEvent.clientX - rect.left, domEvent.clientY - rect.top));
            popup.setLatLng(ll).setContent(html).openOn(this.map);
            html.querySelector('.maneuver-replay-btn').addEventListener('click', () => {
                this.playDrawOn();
                this.playHeadPulse();
                this.map.closePopup(popup);
            });
            html.querySelector('.maneuver-spread-range').addEventListener('input', (e) => {
                this.style.flankOffsetKm = Number(e.target.value) || 0;
                this._syncTmgData();
                this._redraw();
                if (typeof this._opts.onChange === 'function') this._opts.onChange(this);
            });
            html.querySelector('.maneuver-converge-check').addEventListener('change', (e) => {
                this.style.flankConverge = e.target.checked ? 0.35 : 0;
                this._syncTmgData();
                this._redraw();
                if (typeof this._opts.onChange === 'function') this._opts.onChange(this);
            });
            html.querySelector('.maneuver-delete-btn').addEventListener('click', () => {
                this.map.closePopup(popup);
                this.destroy();
                if (typeof this._opts.onDelete === 'function') this._opts.onDelete(this);
            });
        }

        destroy() {
            this.stopFlow();
            try { this._spine.parentNode?.removeChild(this._spine); } catch (_) {}
            try { this._flankL.parentNode?.removeChild(this._flankL); } catch (_) {}
            try { this._flankR.parentNode?.removeChild(this._flankR); } catch (_) {}
            try { this._head.parentNode?.removeChild(this._head); } catch (_) {}
            this.map.off('zoom move zoomend moveend viewreset', this._onViewReset);
            this.group.clearLayers();
            if (this.group._map) this.map.removeLayer(this.group);
        }
    }

    // ── Public API ──────────────────────────────────────────────────
    function ensurePane(map) {
        if (!map.getPane('maneuverArrowPane')) {
            map.createPane('maneuverArrowPane');
            const pane = map.getPane('maneuverArrowPane');
            pane.style.zIndex = '410';
            pane.style.pointerEvents = 'none';   // host svg overrides per-shape
        }
    }

    // Build a ManeuverArrowLayer instance. The caller is responsible for
    // attaching `arrow.group` to a map / layer group, and for calling
    // `arrow.start()` after attachment so animations fire from a connected DOM.
    function createFromSpine(map, spine, style, anim, opts) {
        ensurePane(map);
        return new ManeuverArrowLayer(map, spine, style, anim, opts);
    }

    // Sensible default control points so the curve has a gentle S-bend even
    // before the user touches the handles. p0 = tail, p3 = tip; c1, c2 are
    // placed at 1/3 and 2/3 of the straight line, offset to one side by 15%.
    function defaultSpineFromEndpoints(tail, tip) {
        const t = asLatLng(tail), p = asLatLng(tip);
        const dLat = p.lat - t.lat;
        const dLng = p.lng - t.lng;
        // Perpendicular offset in latlng (rough, OK for visual default)
        const len = Math.hypot(dLat, dLng) || 1e-6;
        const offsetMag = len * 0.15;
        const pLat = -dLng / len * offsetMag;
        const pLng =  dLat / len * offsetMag;
        return {
            p0: t,
            c1: L.latLng(t.lat + dLat * (1 / 3) + pLat * 0.6, t.lng + dLng * (1 / 3) + pLng * 0.6),
            c2: L.latLng(t.lat + dLat * (2 / 3) + pLat * 0.2, t.lng + dLng * (2 / 3) + pLng * 0.2),
            p3: p,
        };
    }

    // ── Placement state machine ─────────────────────────────────────
    let placement = null;     // { phase, tail, previewArrow }

    function startPlacement(map, opts) {
        ensurePane(map);
        cancelPlacement();
        placement = { phase: 'awaitingTail', map, opts: opts || {} };
        map.getContainer().style.cursor = 'crosshair';
    }

    function cancelPlacement() {
        if (!placement) return;
        if (placement.previewArrow) {
            placement.previewArrow.destroy();
        }
        if (placement.map) placement.map.getContainer().style.cursor = '';
        placement = null;
    }

    // Returns true if the click was consumed by placement.
    function handleMapClick(latlng) {
        if (!placement) return false;
        const map = placement.map;
        if (placement.phase === 'awaitingTail') {
            placement.tail = asLatLng(latlng);
            // Show a tiny preview arrow co-located with the tail; tip will follow cursor.
            const spine = defaultSpineFromEndpoints(placement.tail, placement.tail);
            placement.previewArrow = new ManeuverArrowLayer(map, spine, placement.opts.style, {
                ...DEFAULT_ANIM, drawOnMs: 0, flowDashes: false,
            }, {});
            placement.previewArrow.group.addTo(map);
            placement.phase = 'awaitingTip';
            return true;
        }
        if (placement.phase === 'awaitingTip') {
            const tip = asLatLng(latlng);
            const finalSpine = defaultSpineFromEndpoints(placement.tail, tip);
            placement.previewArrow.destroy();
            const onChange = placement.opts.onChange;
            const onDelete = placement.opts.onDelete;
            const arrow = createFromSpine(map, finalSpine, placement.opts.style, placement.opts.animation, {
                onChange, onDelete,
            });
            const cb = placement.opts.onCreate;
            cancelPlacement();
            // Hand off to the caller so they can attach arrow.group to the
            // active layer; animations + handles fire after that attachment.
            if (typeof cb === 'function') cb(arrow);
            arrow.start();
            arrow.setHandlesVisible(true);
            return true;
        }
        return false;
    }

    function handleMapMove(latlng) {
        if (!placement || placement.phase !== 'awaitingTip' || !placement.previewArrow) return;
        const tail = placement.tail;
        const tip = asLatLng(latlng);
        const sp = defaultSpineFromEndpoints(tail, tip);
        placement.previewArrow.spine = sp;
        placement.previewArrow._syncTmgData();
        placement.previewArrow._redraw();
    }

    function isPlacing() { return !!placement; }

    function replayDrawOn(arrowOrGroup) {
        const arrow = arrowOrGroup instanceof ManeuverArrowLayer
            ? arrowOrGroup
            : (arrowOrGroup && arrowOrGroup._maneuverArrow);
        if (!arrow) return;
        arrow.playDrawOn();
        arrow.playHeadPulse();
    }

    window.ManeuverArrow = {
        ensurePane,
        createFromSpine,
        defaultSpineFromEndpoints,
        startPlacement,
        cancelPlacement,
        handleMapClick,
        handleMapMove,
        isPlacing,
        replayDrawOn,
        // Expose the class for advanced consumers (turn engine)
        _Layer: ManeuverArrowLayer,
        // Bezier helpers — re-exported so the turn engine can sample the curve.
        bezierPoint,
        bezierTangent,
        bezierArcLengthSamples,
        latLngToKm,
        kmToLatLng,
        DEFAULTS: { style: DEFAULT_STYLE, animation: DEFAULT_ANIM },
    };
})();
