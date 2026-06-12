/**
 * select-state.js — Focused state for the Select tool.
 *
 * Tracks the selection count so the panel can display it
 * independently of the floating toolbar.
 */

export const selectState = {
    /** Number of currently selected items */
    count: 0,
};

export function resetSelectState() {
    selectState.count = 0;
}
