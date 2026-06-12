/**
 * clip-controller.js — two-click polygon clipping (intersect / difference).
 *
 * Flow:
 *   1. User picks intersect / difference, then clicks "Start clip".
 *   2. First map click selects the target polygon (the shape to be clipped).
 *   3. Second map click selects the clipper polygon (the boundary).
 *   4. Turf runs the operation; the target element is replaced with a plain
 *      polygon whose geometry is the clip result. Style is copied from target.
 *
 * Hit-testing picks the smallest-area clippable polygon that contains the
 * click point (turf.booleanPointInPolygon). This disambiguates overlaps by
 * preferring the innermost polygon the user likely clicked on.
 *
 * Clippable kinds: any Leaflet polygon except text/symbol/polyline/TMG
 * elements. L.circle is handled via a temporary Polygon approximation on the fly.
 */

import { clipState, resetClipState } from '../state/clip-state.js';
import { setStatusBar } from '../utils/statusbar.js';

const CLIPPABLE_GEO_TYPES = new Set([
    'range-circle', 'range-sector', 'circle-2pt', 'semi-circle',
    'rectangle', 'oval', 'minefield', 'polygon', 'freeform',
]);

function getMap() { return window.map; }
function getAllElements() {
    if (typeof window.getAllLayerElements !== 'function') return [];
    return window.getAllLayerElements();
}

// Build a GeoJSON Polygon/MultiPolygon Feature from a Leaflet element. Returns
// null if the element isn't a polygon-producing shape.
function elementToGeoJson(el) {
    if (!el) return null;
    const G = window.AppGeoConvert;

    // L.circle (range-circle, circle-2pt) has no polygon vertices — approximate.
    if (el instanceof L.Circle) {
        const c = el.getLatLng();
        const radiusKm = el.getRadius() / 1000;
        if (G && typeof G.circleToPolygon === 'function') {
            const ring = G.circleToPolygon([c.lng, c.lat], radiusKm);
            if (ring) return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } };
        }
        return null;
    }
    if (el instanceof L.Polygon) {
        const lls = el.getLatLngs() || [];
        const rings = (lls.length && Array.isArray(lls[0])) ? lls : [lls];
        const coordRings = rings.map(r => {
            const out = (r || []).map(ll => [ll.lng, ll.lat]);
            if (out.length >= 3) {
                const f = out[0], l = out[out.length - 1];
                if (f[0] !== l[0] || f[1] !== l[1]) out.push([f[0], f[1]]);
            }
            return out;
        }).filter(r => r.length >= 4);
        if (coordRings.length === 0) return null;
        return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: coordRings } };
    }
    return null;
}

function isClippable(el) {
    if (!el) return false;
    if (el._geoType && CLIPPABLE_GEO_TYPES.has(el._geoType)) return true;
    // Plain polygons drawn via the "polygon" freehand tool
    if (el instanceof L.Polygon && !el._geoType && !el._tmgData) return true;
    return false;
}

// Find the clippable polygon that contains latlng. Prefers smallest bbox area
// so clicks on overlaps go to the innermost shape.
function pickPolygonAt(latlng) {
    if (!window.turf || typeof window.turf.booleanPointInPolygon !== 'function') return null;
    const pt = window.turf.point([latlng.lng, latlng.lat]);
    let best = null;
    let bestArea = Infinity;
    for (const el of getAllElements()) {
        if (!isClippable(el)) continue;
        const feat = elementToGeoJson(el);
        if (!feat) continue;
        try {
            if (!window.turf.booleanPointInPolygon(pt, feat)) continue;
        } catch { continue; }
        const bbox = window.turf.bbox(feat);
        const area = Math.abs((bbox[2] - bbox[0]) * (bbox[3] - bbox[1]));
        if (area < bestArea) {
            best = el;
            bestArea = area;
        }
    }
    return best;
}

let _panelEl = null;
let _opRadios = null;
let _startBtn = null;
let _cancelBtn = null;
let _statusEl = null;
let _domHandler = null;

function onMapClick(ev) {
    if (clipState.mode === 'pick-target') {
        const target = pickPolygonAt(ev.latlng);
        if (!target) {
            setStatusBar('Clip', 'No clippable polygon here. Click inside a polygon.');
            return;
        }
        clipState.target = target;
        clipState.mode = 'pick-clipper';
        setStatusBar('Clip', 'Target set. Click the boundary polygon.');
        if (_statusEl) _statusEl.textContent = 'Target set. Click the boundary polygon.';
        return;
    }
    if (clipState.mode === 'pick-clipper') {
        const clipper = pickPolygonAt(ev.latlng);
        if (!clipper) {
            setStatusBar('Clip', 'No polygon here. Click inside the boundary polygon.');
            return;
        }
        if (clipper === clipState.target) {
            setStatusBar('Clip', 'Clipper must be a different polygon.');
            return;
        }
        clipState.clipper = clipper;
        clipState.mode = 'ready';
        runClip();
        return;
    }
}

function runClip() {
    const { target, clipper, op } = clipState;
    const G = window.AppGeoConvert;
    const bridge = (window.RMOOZ && window.RMOOZ.clip) || null;
    if (!G || !bridge) {
        setStatusBar('Clip', 'Clip engine unavailable (turf or bridge missing).');
        finish();
        return;
    }
    const a = elementToGeoJson(target);
    const b = elementToGeoJson(clipper);
    if (!a || !b) {
        setStatusBar('Clip', 'Could not build geometry for clip.');
        finish();
        return;
    }
    const result = op === 'difference' ? G.difference(a, b) : G.intersect(a, b);
    if (!result || !result.geometry) {
        setStatusBar('Clip', op === 'difference' ? 'No area left after difference.' : 'Polygons do not intersect.');
        finish();
        return;
    }
    const style = bridge.extractStyle(target);
    const ok = bridge.replaceElementWithPolygonGeometry(target, result.geometry, style);
    if (ok) {
        setStatusBar('Clip', `Done (${op}).`);
    } else {
        setStatusBar('Clip', 'Could not replace the target element.');
    }
    finish();
}

function finish() {
    resetClipState();
    if (_startBtn) _startBtn.disabled = false;
    if (_cancelBtn) _cancelBtn.disabled = true;
    if (_statusEl) _statusEl.textContent = 'Pick an operation and press Start.';
    unbindMapClick();
}

function bindMapClick() {
    const m = getMap();
    if (!m || _domHandler) return;
    const container = m.getContainer();
    // Capture-phase DOM listener: fires before Leaflet's per-layer click
    // handlers, so clicks on polygons (which normally open popups instead of
    // bubbling to map 'click') still reach us. We stop propagation so popups
    // don't open during clip-mode picking.
    _domHandler = (e) => {
        if (e.button !== 0) return; // left-click only
        const rect = container.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        const latlng = m.containerPointToLatLng([px, py]);
        e.preventDefault();
        e.stopImmediatePropagation();
        e.stopPropagation();
        onMapClick({ latlng });
    };
    container.addEventListener('click', _domHandler, true);
}

function unbindMapClick() {
    const m = getMap();
    if (!m || !_domHandler) return;
    m.getContainer().removeEventListener('click', _domHandler, true);
    _domHandler = null;
}

function onStart() {
    if (clipState.mode !== 'idle') return;
    const selected = _opRadios && Array.from(_opRadios).find(r => r.checked);
    clipState.op = selected ? selected.value : 'intersect';
    clipState.mode = 'pick-target';
    clipState.target = null;
    clipState.clipper = null;
    if (_startBtn) _startBtn.disabled = true;
    if (_cancelBtn) _cancelBtn.disabled = false;
    const hint = 'Click the shape to clip.';
    if (_statusEl) _statusEl.textContent = hint;
    setStatusBar('Clip', hint);
    bindMapClick();
}

function onCancel() {
    finish();
    setStatusBar('Clip', 'Cancelled.');
}

export function bindClipPanelEvents() {
    _panelEl    = document.getElementById('clip-tool-section');
    if (!_panelEl) return;
    _opRadios   = _panelEl.querySelectorAll('input[name="clip-op"]');
    _startBtn   = document.getElementById('clip-start-btn');
    _cancelBtn  = document.getElementById('clip-cancel-btn');
    _statusEl   = document.getElementById('clip-status-hint');

    if (_startBtn) _startBtn.addEventListener('click', onStart);
    if (_cancelBtn) {
        _cancelBtn.addEventListener('click', onCancel);
        _cancelBtn.disabled = true;
    }
}
