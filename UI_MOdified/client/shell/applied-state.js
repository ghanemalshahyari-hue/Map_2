/**
 * applied-state.js — In-Memory Applied State Overlay
 *
 * Pure utility for deriving applied unit state from immutable scenario baseline
 * plus accepted STATE_DELTA event-log entries.
 *
 * DESIGN PRINCIPLES:
 * - Pure functions (no side effects, deterministic)
 * - Never mutates inputs (scenario baseline protected)
 * - In-memory only (no persistence)
 * - Display-only (not used for adjudication)
 * - Step-bounded (single-step initially)
 * - Graceful degradation (unknown units/malformed deltas ignored)
 *
 * PUBLIC API:
 *   AppAppliedState.reconstructUnits(scenario, deltaEvents, step) → cloned units
 *   AppAppliedState.getAppliedUnit(unit, deltaEvents, step) → unit with deltas
 *   AppAppliedState.hasAppliedDeltas(deltaEvents, unitUid, step) → boolean
 */
(function (root) {
    'use strict';

    // ── Readiness enum labels (canonical RMOOZ Phase 6) ─────────────────
    // ready: operationally ready for all tasking
    // limited: partially capable; some degradation (risk state in Why-Not)
    // not_ready: unit unavailable (BLOCKER in Why-Not)
    const READINESS_VALUES = new Set(['ready', 'limited', 'not_ready']);

    /**
     * reconstructUnits(scenario, deltaEvents, step) → Array of cloned units with deltas applied
     *
     * @param {object} scenario - Scenario baseline (immutable)
     * @param {array} deltaEvents - Event log rows with STATE_DELTA payloads
     * @param {number} step - Step index (optional, for future step-bound filtering)
     * @returns {array} Cloned units with applied deltas, never mutating scenario
     */
    function reconstructUnits(scenario, deltaEvents, step) {
        if (!scenario || typeof scenario !== 'object') {
            return [];
        }

        // Gather all units from scenario
        const baselineUnits = [
            ...(scenario.red_units || []),
            ...(scenario.blue_units_initial || [])
        ];

        if (!Array.isArray(baselineUnits)) {
            return [];
        }

        // Clone and apply deltas to each unit
        const applied = baselineUnits.map(unit => {
            if (!unit || typeof unit !== 'object') return null;
            return getAppliedUnit(unit, deltaEvents, step);
        }).filter(Boolean);

        return applied;
    }

    /**
     * getAppliedUnit(unit, deltaEvents, step) → Cloned unit with deltas applied
     *
     * @param {object} unit - Unit from scenario baseline
     * @param {array} deltaEvents - Event log rows
     * @param {number} step - Step index (optional)
     * @returns {object} New object with unit data + applied deltas
     */
    function getAppliedUnit(unit, deltaEvents, step) {
        if (!unit || typeof unit !== 'object') return null;

        // Clone unit (deep copy to prevent any mutation)
        const applied = JSON.parse(JSON.stringify(unit));

        if (!Array.isArray(deltaEvents)) {
            return applied;
        }

        // Get unit UID (could be uid or unit_uid)
        const unitUid = unit.uid || unit.unit_uid;
        if (!unitUid) {
            return applied;
        }

        // Find all deltas for this unit
        const deltas = deltaEvents.filter(e => {
            if (!e || typeof e !== 'object') return false;
            if (!e.payload || typeof e.payload !== 'object') return false;
            if (e.payload.event_type !== 'STATE_DELTA') return false;
            if (e.payload.unit_uid !== unitUid) return false;
            // Step filtering (future enhancement)
            // if (step !== undefined && e.payload.step !== step) return false;
            return true;
        });

        // Apply deltas in order (oldest first)
        deltas.sort((a, b) => {
            const timeA = a.time || '';
            const timeB = b.time || '';
            return timeA.localeCompare(timeB);
        });

        for (const deltaEvent of deltas) {
            const delta = deltaEvent.payload;
            if (!delta) continue;

            if (delta.delta_type === 'readiness') {
                if (READINESS_VALUES.has(delta.value_after)) {
                    applied.readiness = delta.value_after;
                }
            } else if (delta.delta_type === 'supply') {
                const supply = parseFloat(delta.value_after);
                if (typeof supply === 'number' && !isNaN(supply)) {
                    // Clamp to 0-1 range
                    applied.supply = Math.max(0, Math.min(1, supply));
                }
            }
        }

        return applied;
    }

    /**
     * hasAppliedDeltas(deltaEvents, unitUid, step) → boolean
     *
     * Check if a unit has any applied deltas
     *
     * @param {array} deltaEvents - Event log rows
     * @param {string} unitUid - Unit UID to check
     * @param {number} step - Step index (optional)
     * @returns {boolean} True if unit has any STATE_DELTA entries
     */
    function hasAppliedDeltas(deltaEvents, unitUid, step) {
        if (!Array.isArray(deltaEvents) || !unitUid) {
            return false;
        }

        return deltaEvents.some(e => {
            if (!e || !e.payload) return false;
            if (e.payload.event_type !== 'STATE_DELTA') return false;
            if (e.payload.unit_uid !== unitUid) return false;
            return true;
        });
    }

    /**
     * getAppliedReadiness(unit, deltaEvents, step) → Readiness value (ready/limited/degraded)
     *
     * Get only the applied readiness value for a unit
     *
     * @param {object} unit - Unit from scenario
     * @param {array} deltaEvents - Event log rows
     * @param {number} step - Step index (optional)
     * @returns {string} Readiness value (falls back to unit.readiness or 'ready')
     */
    function getAppliedReadiness(unit, deltaEvents, step) {
        if (!unit) return 'ready';

        const applied = getAppliedUnit(unit, deltaEvents, step);
        return applied.readiness || 'ready';
    }

    /**
     * getAppliedSupply(unit, deltaEvents, step) → Supply value (0–1)
     *
     * Get only the applied supply value for a unit
     *
     * @param {object} unit - Unit from scenario
     * @param {array} deltaEvents - Event log rows
     * @param {number} step - Step index (optional)
     * @returns {number} Supply value, clamped to 0–1 (falls back to unit.supply or 0.8)
     */
    function getAppliedSupply(unit, deltaEvents, step) {
        if (!unit) return 0.8;

        const applied = getAppliedUnit(unit, deltaEvents, step);
        const supply = parseFloat(applied.supply);
        if (typeof supply === 'number' && !isNaN(supply)) {
            return Math.max(0, Math.min(1, supply));
        }
        return 0.8;
    }

    /**
     * getAppliedState(unit, deltaEvents, step) → {readiness, supply}
     *
     * Get both readiness and supply in one call
     *
     * @param {object} unit - Unit from scenario
     * @param {array} deltaEvents - Event log rows
     * @param {number} step - Step index (optional)
     * @returns {object} {readiness, supply} with applied deltas
     */
    function getAppliedState(unit, deltaEvents, step) {
        if (!unit) {
            return { readiness: 'ready', supply: 0.8 };
        }

        const applied = getAppliedUnit(unit, deltaEvents, step);
        return {
            readiness: applied.readiness || 'ready',
            supply: Math.max(0, Math.min(1, parseFloat(applied.supply) || 0.8))
        };
    }

    /**
     * extractDeltasForUnit(deltaEvents, unitUid) → Array of deltas
     *
     * Get all deltas for a specific unit in chronological order
     *
     * @param {array} deltaEvents - Event log rows
     * @param {string} unitUid - Unit UID to filter
     * @returns {array} Array of STATE_DELTA payloads for unit
     */
    function extractDeltasForUnit(deltaEvents, unitUid) {
        if (!Array.isArray(deltaEvents) || !unitUid) {
            return [];
        }

        // Filter and sort before mapping (to preserve event-level timestamp)
        const sorted = deltaEvents
            .filter(e => {
                if (!e || !e.payload) return false;
                if (e.payload.event_type !== 'STATE_DELTA') return false;
                if (e.payload.unit_uid !== unitUid) return false;
                return true;
            })
            .sort((a, b) => {
                const timeA = a.time || a.timestamp || 0;
                const timeB = b.time || b.timestamp || 0;
                if (typeof timeA === 'string' && typeof timeB === 'string') {
                    return timeA.localeCompare(timeB);
                }
                return timeA - timeB;
            });

        // Now map to payloads
        return sorted.map(e => e.payload);
    }

    // ── Wiring ─────────────────────────────────────────────────────
    // Export public API
    root.AppAppliedState = {
        reconstructUnits,
        getAppliedUnit,
        hasAppliedDeltas,
        getAppliedReadiness,
        getAppliedSupply,
        getAppliedState,
        extractDeltasForUnit,
    };
})(window);
