/**
 * symbol-state.js — Focused state object for the Symbol tool.
 *
 * Tracks UI state that the new panel system needs beyond what the DOM holds.
 * The DOM remains the source of truth for values that app.js reads
 * (e.g. #text-unique-designation), but this module tracks higher-level
 * state like the current affiliation selection and placement status.
 */

export const symbolState = {
    /** APP-6D standard identity digit: '3' = friend, '6' = hostile, '4' = neutral, '1' = unknown */
    affiliation: '3',
    /** Whether a symbol has been selected and the user can click the map */
    isPlacementActive: false,
    /**
     * True only after the user has actually chosen a symbol from the picker /
     * library / quick-start / favorites. Flipping the affiliation on the
     * default fallback symbol does NOT count — used to gate the onboarding
     * empty-state guidance so it doesn't disappear from a stray click.
     */
    userPickedSymbol: false,
};

export function resetSymbolState() {
    symbolState.affiliation = '3';
    symbolState.isPlacementActive = false;
    symbolState.userPickedSymbol = false;
}
