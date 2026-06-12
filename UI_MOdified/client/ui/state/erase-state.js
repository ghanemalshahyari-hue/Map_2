/**
 * erase-state.js — Focused state for the Erase tool.
 *
 * Tracks which erase sub-mode is active:
 *  - object: click to erase a single item
 *  - area:   drag-select multiple items, then delete
 *  - trim:   drag across freehand strokes to trim them
 */

export const eraseState = {
    /** Current erase sub-mode: 'object' | 'area' | 'trim' */
    mode: 'object',
};

export function resetEraseState() {
    eraseState.mode = 'object';
}
