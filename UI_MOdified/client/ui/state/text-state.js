/**
 * text-state.js — Focused state for the Text tool.
 *
 * Tracks the inline panel input value so the controller can auto-place
 * text on map click without requiring the modal.
 */

export const textState = {
    /** Text typed in the inline panel input */
    value: '',
    /** Whether text is ready to be placed on next map click */
    isPlacementActive: false,
};

export function resetTextState() {
    textState.value = '';
    textState.isPlacementActive = false;
}
