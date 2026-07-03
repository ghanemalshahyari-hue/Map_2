/* ============================================================================
 * demo-scenario-preview.js — RETIRED
 * ----------------------------------------------------------------------------
 * Legacy AI Decision-Making Scenario Preview was removed from the operator path.
 * It created a second, isolated AI/demo scenario layer beside the real live
 * workspace and confused operators about what was actual scenario state.
 *
 * Product ruling 2026-07-03:
 *   - Do not build AI scenario previews from Step 1/2 payloads.
 *   - Do not draw preview-only units, anchors, dashed movement, or step panels.
 *   - Keep window.RmoozDemoPreview as a compatibility shim only.
 *   - Rebuild scenario generation later from the stable CMO-style base workflow.
 * ========================================================================== */
(function () {
    'use strict';

    var RETIRED = Object.freeze({
        ok: false,
        disabled: true,
        retired: true,
        code: 'legacy_ai_decision_scenario_preview_retired',
        reason: 'Legacy AI Decision-Making Scenario Preview is retired. Use the live Scenario Workspace, Edit Mode, and Scenario Control Center as the single operator path.'
    });

    function cloneRetired() {
        return {
            ok: RETIRED.ok,
            disabled: RETIRED.disabled,
            retired: RETIRED.retired,
            code: RETIRED.code,
            reason: RETIRED.reason
        };
    }

    function clear() {
        return cloneRetired();
    }

    function build() {
        return Promise.resolve(cloneRetired());
    }

    function isActive() { return false; }
    function stepTo() { return cloneRetired(); }
    function getStepCount() { return 0; }

    window.RmoozDemoPreview = {
        build: build,
        clear: clear,
        isActive: isActive,
        stepTo: stepTo,
        getStepCount: getStepCount,
        RETIRED: cloneRetired()
    };
})();
