/* ============================================================================
 * native-scenario-loader.js — PR2: RMOOZ-native scenario loader + launch wiring.
 * ----------------------------------------------------------------------------
 * Proves the scenario pipeline is GLOBAL (not Wargame-3-specific) by routing a
 * RMOOZ-native sample through the SAME existing global path:
 *
 *   scenario JSON  →  AppShellScenarioWorkspace.loadLiveScenarioFromJson(json)
 *                     (validate → normalize → window.RmoozScenario → workspace
 *                      repaint → maybeDrawLiveScenarioOnMap → adjudicator map)
 *
 * NO new render/normalize/world-state logic (reuses the Live Scenario Import
 * baseline). NO backend, NO storage, NO mutation, NO W3 adapter. Only acts when
 * a ?launch= intent is present on app.html, so direct /app.html and the existing
 * Wargame-3 path are untouched.
 * ========================================================================== */
(function () {
    'use strict';

    var SAMPLE_URL = 'samples/rmooz-native-01.json';

    function workspace() {
        var w = window.AppShellScenarioWorkspace;
        return (w && typeof w.loadLiveScenarioFromJson === 'function') ? w : null;
    }
    function logEvent(msg) {
        try {
            var el = window.AppShellEventLog;
            if (el && typeof el.append === 'function') {
                el.append({ category: 'SYSTEM', severity: 'INFO', source: 'LAUNCH', message: msg });
            }
        } catch (_) {}
    }

    // Load the RMOOZ-native sample through the existing global pipeline.
    function loadNativeSample() {
        return fetch(SAMPLE_URL, { credentials: 'same-origin' })
            .then(function (r) { if (!r.ok) throw new Error('sample fetch ' + r.status); return r.json(); })
            .then(function (json) {
                var ws = workspace();
                if (!ws) { logEvent('Native sample: workspace loader unavailable.'); return false; }
                var res = ws.loadLiveScenarioFromJson(json);   // validate + normalize + RmoozScenario + repaint + draw
                if (res && res.passed) {
                    logEvent('Loaded RMOOZ-native scenario: ' + (res.scenarioLabel || res.scenarioId || 'rmooz-native-01'));
                    return true;
                }
                logEvent('Native sample blocked: ' + ((res && (res.blockedReasons || []).join(', ')) || 'unknown'));
                return false;
            })
            .catch(function (e) { logEvent('Native sample load failed: ' + e.message); return false; });
    }

    // PR2 wiring: act on the home-hub launch intent. Only 'demo' loads a scenario
    // this slice; the rest log a safe placeholder (no workspace disturbance).
    function handleLaunchIntent() {
        var intent = null;
        try { intent = new URLSearchParams(window.location.search).get('launch'); } catch (_) {}
        if (!intent) return;                       // direct /app.html → untouched

        if (intent === 'demo') { loadNativeSample(); return; }

        var PLACEHOLDER = {
            'new':    'Launch intent “Start New Scenario” — scenario authoring flow arrives in a later slice. Use Edit Mode in the workspace for now.',
            'load':   'Launch intent “Load Scenario” — scenario picker arrives in a later slice. Use the workspace scenario controls for now.',
            'editor': 'Launch intent “Scenario Editor” — deep-link into Edit Mode arrives in a later slice.',
            'resume': 'Launch intent “Resume Last Session” — session resume arrives in a later slice.'
        };
        logEvent(PLACEHOLDER[intent] || ('Launch intent “' + intent + '” received.'));
    }

    // Run after the workspace module has initialized. loadLiveScenarioFromJson is
    // defined by scenario-workspace.js (loaded before this script); a short retry
    // covers async init ordering without polling forever.
    function start() {
        var tries = 0;
        (function attempt() {
            var intent = null;
            try { intent = new URLSearchParams(window.location.search).get('launch'); } catch (_) {}
            if (!intent) return;                   // nothing to do for a plain workspace open
            if (intent === 'demo' && !workspace() && tries < 20) { tries++; return void setTimeout(attempt, 150); }
            handleLaunchIntent();
        })();
    }

    if (typeof window !== 'undefined' && window.document) {
        if (document.readyState !== 'loading') start();
        else document.addEventListener('DOMContentLoaded', start);
    }

    window.AppNativeScenarioLoader = { loadNativeSample: loadNativeSample, SAMPLE_URL: SAMPLE_URL };
})();
