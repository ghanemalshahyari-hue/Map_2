/**
 * clip-state.js — Focused state for the Clip tool.
 *
 * Tracks the two-click pick flow for polygon clipping (intersect / difference).
 * The controller updates this as the user interacts with the map.
 */

export const clipState = {
    /** 'idle' | 'pick-target' | 'pick-clipper' | 'ready' */
    mode: 'idle',
    /** 'intersect' | 'difference' */
    op: 'intersect',
    /** Leaflet L.Polygon picked as the shape to be clipped. */
    target: null,
    /** Leaflet L.Polygon picked as the clipping boundary. */
    clipper: null,
};

export function resetClipState() {
    clipState.mode = 'idle';
    clipState.op = 'intersect';
    clipState.target = null;
    clipState.clipper = null;
}
