/**
 * measure-state.js — Focused state for the Measure tool.
 *
 * Tracks which measurement type is selected.
 */

export const measureState = {
    /** Current measure type: 'distance' | 'range-circle' | 'range-sector' */
    type: 'distance',
};

export function resetMeasureState() {
    measureState.type = 'distance';
}
