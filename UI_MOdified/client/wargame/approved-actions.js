/**
 * Per-step "approved actions" store.
 *
 * Bridges the red/blue propose flow (red-team-controller.js) to the
 * adjudicator (adjudicator-hud.js / adjudicator-agent.js). When the
 * operator clicks ✓ Execute on a proposal card, the action is recorded
 * here under the next adjudicate step; the adjudicator's
 * `currentRequest()` then ships them in the request body, and the
 * server formats them into the PROPOSED ACTIONS block of the prompt.
 *
 * Schema (in-memory only — no persistence, cleared on page reload):
 *   { [stepIndex]: { red: Action[], blue: Action[] } }
 *
 * Action shape:
 *   {
 *     type:    'MOVE' | 'ENGAGE' | 'HOLD',
 *     unitId:  string,
 *     to?:     [lng, lat],          // MOVE only
 *     target?: string,              // ENGAGE only
 *     reason?: string,
 *   }
 *
 * Public surface:
 *   window.AppApprovedActions = {
 *     add(stepIndex, side, action)
 *     getForStep(stepIndex)         → { red: Action[], blue: Action[] }
 *     clearForStep(stepIndex)
 *     clearAll()
 *     hasAny(stepIndex)             → boolean
 *   }
 *
 * Why a separate module instead of stuffing this onto AppScenarioState:
 * the propose flow has no opinion about scenarios — it works on any
 * markers on the map. Keeping the store independent means red-team
 * approvals work even when the adjudicator scenario isn't loaded, and
 * vice versa.
 */
(function () {
    'use strict';

    const SIDES = new Set(['red', 'blue']);
    const TYPES = new Set(['MOVE', 'ENGAGE', 'HOLD']);

    // Map<number, { red: [], blue: [] }> — keys are integer step indexes
    // (the step about to be adjudicated next, not the one just executed).
    const byStep = new Map();

    function ensureStep(stepIndex) {
        let bucket = byStep.get(stepIndex);
        if (!bucket) {
            bucket = { red: [], blue: [] };
            byStep.set(stepIndex, bucket);
        }
        return bucket;
    }

    function normalize(action) {
        if (!action || typeof action !== 'object') return null;
        const type = String(action.type || '').toUpperCase();
        if (!TYPES.has(type)) return null;
        const unitId = action.unitId || action.unit_id || action.id;
        if (!unitId) return null;
        const out = { type, unitId: String(unitId), reason: action.reason || '' };
        if (type === 'MOVE' && Array.isArray(action.to) && action.to.length === 2
                && Number.isFinite(action.to[0]) && Number.isFinite(action.to[1])) {
            out.to = [Number(action.to[0]), Number(action.to[1])];
        }
        if (type === 'ENGAGE' && action.target) {
            out.target = String(action.target);
        }
        return out;
    }

    function emit() {
        try {
            document.dispatchEvent(new CustomEvent('wargame:approved-actions-changed'));
        } catch (_) { /* ignore */ }
    }

    function add(stepIndex, side, action) {
        if (!Number.isInteger(stepIndex) || stepIndex < 0) return false;
        const s = side === 'blue' ? 'blue' : 'red';
        if (!SIDES.has(s)) return false;
        const a = normalize(action);
        if (!a) return false;
        ensureStep(stepIndex)[s].push(a);
        emit();
        return true;
    }

    function getForStep(stepIndex) {
        const b = byStep.get(stepIndex);
        if (!b) return { red: [], blue: [] };
        // Defensive copy so callers can mutate without affecting our store.
        return { red: b.red.slice(), blue: b.blue.slice() };
    }

    function clearForStep(stepIndex) {
        if (byStep.delete(stepIndex)) emit();
    }

    function clearAll() {
        if (byStep.size > 0) { byStep.clear(); emit(); }
    }

    function hasAny(stepIndex) {
        const b = byStep.get(stepIndex);
        return !!(b && (b.red.length || b.blue.length));
    }

    window.AppApprovedActions = { add, getForStep, clearForStep, clearAll, hasAny };
})();
