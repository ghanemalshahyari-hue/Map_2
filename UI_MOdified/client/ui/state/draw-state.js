/**
 * draw-state.js — Focused state for the Draw tool.
 *
 * Tracks which draw sub-mode is active (path vs mission graphics)
 * so the panel can show/hide the relevant controls.
 */

export const drawState = {
    /** Current draw sub-mode: 'path' | 'mission' */
    mode: 'path',
};

export function resetDrawState() {
    drawState.mode = 'path';
}
