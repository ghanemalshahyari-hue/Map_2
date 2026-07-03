/* ============================================================================
 * demo-scenario-preview.js — RETIRED + live workspace entry polish
 * ----------------------------------------------------------------------------
 * Legacy AI Decision-Making Scenario Preview was removed from the operator path.
 * It created a second, isolated AI/demo scenario layer beside the real live
 * workspace and confused operators about what was actual scenario state.
 *
 * Product ruling 2026-07-03:
 *   - Do not build AI scenario previews from Step 1/2 payloads.
 *   - Do not draw preview-only units, anchors, dashed movement, or step panels.
 *   - Keep window.RmoozDemoPreview as a compatibility shim only.
 *   - Use this already-loaded module to correct the old workspace banner copy
 *     from "read-only" to the real live workspace / Edit Mode path.
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

    function installLiveWorkspaceEntryCopy() {
        var strip = document.querySelector && document.querySelector('.sw-readonly-strip');
        if (!strip || strip.getAttribute('data-live-entry-polished') === '1') return false;
        strip.setAttribute('data-live-entry-polished', '1');
        strip.setAttribute('data-workspace-mode', 'live');
        strip.setAttribute('aria-label', 'Live scenario workspace entry');
        strip.innerHTML = '' +
            '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
            '<path d="M12 2v20"/><path d="M2 12h20"/><circle cx="12" cy="12" r="7"/></svg>' +
            '<span data-i18n="sw-live-workspace-notice">Live workspace: edit the scenario in Edit Mode, save the draft to update the active scenario, then run through Scenario Control Center.</span>';
        return true;
    }

    function initLiveWorkspaceEntryCopy() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', installLiveWorkspaceEntryCopy, { once: true });
        } else {
            installLiveWorkspaceEntryCopy();
        }
    }

    initLiveWorkspaceEntryCopy();

    window.RmoozDemoPreview = {
        build: build,
        clear: clear,
        isActive: isActive,
        stepTo: stepTo,
        getStepCount: getStepCount,
        installLiveWorkspaceEntryCopy: installLiveWorkspaceEntryCopy,
        RETIRED: cloneRetired()
    };
})();
