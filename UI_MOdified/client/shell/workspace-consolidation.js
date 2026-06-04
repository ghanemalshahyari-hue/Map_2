/* ============================================================================
 * workspace-consolidation.js — Scenario Entry Consolidation (PR).
 * ----------------------------------------------------------------------------
 * Makes app.html operations-focused: scenario loading lives in home.html.
 *   • "← Main Window" → navigates to /home.html (no state mutation).
 *   • "Export Scenario" → downloads window.RmoozScenario.scenario as JSON
 *     (read-only copy; neutral message if none). NO backend, NO mutation.
 *   • Injects a single collapsed "Developer / Import" toggle that reveals the
 *     scenario import/source clutter (CSS hides #sw-scenario-source-section +
 *     the HUD GeoJSON import zone by default). Nothing is deleted — the global
 *     import path + diagnostics remain recoverable.
 * No backend, no storage, no simulation, no DB, no command-execution controls.
 * ========================================================================== */
(function () {
    'use strict';

    function setStatus(msg) {
        var el = document.getElementById('rmooz-export-status');
        if (!el) return;
        el.textContent = msg || '';
        if (msg) setTimeout(function () { if (el.textContent === msg) el.textContent = ''; }, 4000);
    }

    // Safe local export of the loaded scenario. Read-only: never mutates state,
    // never writes to a backend.
    function exportScenario() {
        var slot = window.RmoozScenario;
        var scn = slot && slot.scenario;
        if (!scn) { setStatus('No scenario loaded to export.'); return; }
        try {
            var json = JSON.stringify(scn, null, 2);                 // copy; input untouched
            var blob = new Blob([json], { type: 'application/json' });
            var url = URL.createObjectURL(blob);
            var name = (scn.scenario_id || scn.scenario_label || scn.name || 'scenario')
                .toString().replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 64) || 'scenario';
            var a = document.createElement('a');
            a.href = url; a.download = name + '.json';
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
            setStatus('Exported ' + a.download);
        } catch (e) {
            setStatus('Export failed.');
        }
    }

    function backToMainWindow() {
        // Navigate only. No state clear/mutation — a natural reload handles state.
        window.location.assign('/home.html');
    }

    // Inject one collapsed "Developer / Import" toggle before the source section.
    function injectDevImportToggle() {
        var anchor = document.getElementById('sw-scenario-source-section');
        if (!anchor || document.getElementById('rmooz-dev-import-toggle')) return;
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'rmooz-dev-import-toggle';
        btn.className = 'rmooz-dev-import-toggle';
        function relabel() {
            var open = document.body.classList.contains('rmooz-dev-import-open');
            btn.textContent = (open ? '▾ ' : '▸ ') + 'Developer / Import';
            btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        }
        btn.addEventListener('click', function () {
            document.body.classList.toggle('rmooz-dev-import-open');
            relabel();
        });
        relabel();
        anchor.parentNode.insertBefore(btn, anchor);
    }

    function init() {
        var back = document.getElementById('rmooz-back-home');
        if (back) back.addEventListener('click', backToMainWindow);
        var exp = document.getElementById('rmooz-export-scenario');
        if (exp) exp.addEventListener('click', exportScenario);
        injectDevImportToggle();
    }

    if (typeof window !== 'undefined' && window.document) {
        if (document.readyState !== 'loading') init();
        else document.addEventListener('DOMContentLoaded', init);
    }

    window.AppWorkspaceConsolidation = { exportScenario: exportScenario, backToMainWindow: backToMainWindow };
})();
