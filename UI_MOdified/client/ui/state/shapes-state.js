/**
 * shapes-state.js — Focused state for the Shapes tool.
 *
 * Tracks which shape type is selected so the panel can
 * show the correct options and hint text.
 */

export const shapesState = {
    /** Currently selected shape type (maps to geo-tool-select values) */
    type: 'rectangle',
};

export function resetShapesState() {
    shapesState.type = 'rectangle';
}
