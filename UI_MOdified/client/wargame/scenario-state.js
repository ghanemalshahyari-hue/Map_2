/**
 * Per-trial scenario state container.
 *
 * Holds the rolling state of one 12-step trial as the operator steps through
 * (or as Run-1-trial walks automatically). Mostly bookkeeping: history,
 * current step index, current state, fallback flags.
 *
 * The schema mirrors what /api/ai/adjudicate returns in `state`.
 *
 * Public surface: window.AppScenarioState = { create, applyDelta, ... }
 */
(function () {
    'use strict';

    function create({ scenarioName, scenarioMeta }) {
        return {
            scenarioName,
            scenarioMeta,           // { name, model_version, red_units[], blue_units_base_ids[], bls_template[], phase_table[] }
            stepIndex:   0,
            currentState: null,
            history:     [],        // array of { stepIndex, state, validation, meta }
            startedAt:   new Date().toISOString(),
            mode:        'idle',    // 'idle' | 'live' | 'mc-shadow' | 'replay'
        };
    }

    function applyDelta(trial, result) {
        if (!result || !result.state) return trial;
        trial.history.push({
            stepIndex: result.stepIndex,
            state:     result.state,
            validation:result.validation,
            meta:      result.meta,
            fallback:  !result.ok,
        });
        trial.stepIndex   = result.stepIndex;
        trial.currentState = result.state;
        return trial;
    }

    function reset(trial) {
        trial.stepIndex    = 0;
        trial.currentState = null;
        trial.history      = [];
        trial.startedAt    = new Date().toISOString();
        return trial;
    }

    function fallbackCount(trial) {
        return trial.history.filter(h => h.fallback).length;
    }

    window.AppScenarioState = { create, applyDelta, reset, fallbackCount };
})();
