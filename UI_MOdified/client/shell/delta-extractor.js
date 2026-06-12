/**
 * delta-extractor.js — Extract readiness/supply deltas from proposals
 *
 * Pure utility to extract and format unit state deltas (readiness/supply)
 * from a proposal's projected_state by comparing against current scenario.
 * Used by ai-proposal-panel and event-log for operator visibility.
 *
 * NO MUTATION. NO PERSISTENCE. Display-only.
 */
(function (root) {
    'use strict';

    /**
     * extractDeltas(projectedState, currentScenario) → { readiness: [], supply: [] }
     *
     * Compares projected_state units against current scenario units
     * and returns arrays of readiness and supply changes.
     *
     * @param {object} projectedState - State after proposal is accepted
     * @param {object} currentScenario - Current scenario (window.RmoozScenario.scenario)
     * @returns {object} { readiness: [...], supply: [...] }
     */
    function extractDeltas(projectedState, currentScenario) {
        const deltas = {
            readiness: [],
            supply: [],
        };

        if (!projectedState || !currentScenario) {
            return deltas;
        }

        // Build current state unit index
        const currentUnits = {};
        const redCurrent = currentScenario.red_units || [];
        const blueCurrent = currentScenario.blue_units_initial || [];

        for (let i = 0; i < redCurrent.length; i++) {
            const u = redCurrent[i];
            if (u && u.uid) {
                currentUnits[u.uid] = {
                    readiness: u.readiness || 'ready',
                    supply: typeof u.supply === 'number' ? u.supply : 0.8,
                    label: u.label || u.uid,
                    side: 'RED',
                };
            }
        }

        for (let i = 0; i < blueCurrent.length; i++) {
            const u = blueCurrent[i];
            const uid = u.unit_uid || u.uid;
            if (u && uid) {
                currentUnits[uid] = {
                    readiness: u.readiness || 'ready',
                    supply: typeof u.supply === 'number' ? u.supply : 0.8,
                    label: u.label || uid,
                    side: 'BLUE',
                };
            }
        }

        // Compare projected state units
        const projectedUnits = projectedState.units || [];
        for (let i = 0; i < projectedUnits.length; i++) {
            const pUnit = projectedUnits[i];
            if (!pUnit || !pUnit.uid) continue;

            const cUnit = currentUnits[pUnit.uid];
            if (!cUnit) continue;  // Skip units not in current scenario

            const pReadiness = pUnit.readiness || 'ready';
            const pSupply = typeof pUnit.supply === 'number' ? pUnit.supply : cUnit.supply;

            // Check for readiness change
            if (pReadiness !== cUnit.readiness) {
                deltas.readiness.push({
                    unit_uid: pUnit.uid,
                    unit_label: pUnit.label || cUnit.label,
                    side: cUnit.side,
                    value_before: cUnit.readiness,
                    value_after: pReadiness,
                });
            }

            // Check for supply change (with small tolerance for floating point)
            const tolerance = 0.01;
            if (Math.abs(pSupply - cUnit.supply) > tolerance) {
                deltas.supply.push({
                    unit_uid: pUnit.uid,
                    unit_label: pUnit.label || cUnit.label,
                    side: cUnit.side,
                    value_before: cUnit.supply,
                    value_after: pSupply,
                });
            }
        }

        return deltas;
    }

    /**
     * formatReadinessDelta(delta) → 'ready → limited' (human readable)
     */
    function formatReadinessDelta(delta) {
        if (!delta) return '—';
        return (delta.value_before || '?') + ' → ' + (delta.value_after || '?');
    }

    /**
     * formatSupplyDelta(delta) → '80% → 60%' (as percentage)
     */
    function formatSupplyDelta(delta) {
        if (!delta) return '—';
        const before = typeof delta.value_before === 'number' ? Math.round(delta.value_before * 100) : '?';
        const after = typeof delta.value_after === 'number' ? Math.round(delta.value_after * 100) : '?';
        return before + '% → ' + after + '%';
    }

    /**
     * hasDelta(deltas) → boolean
     * Checks if there are any readiness or supply changes
     */
    function hasDelta(deltas) {
        return deltas && (
            (Array.isArray(deltas.readiness) && deltas.readiness.length > 0) ||
            (Array.isArray(deltas.supply) && deltas.supply.length > 0)
        );
    }

    const api = {
        extractDeltas,
        formatReadinessDelta,
        formatSupplyDelta,
        hasDelta,
    };

    root.AppDeltaExtractor = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
