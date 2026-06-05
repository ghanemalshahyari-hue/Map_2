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

    // Poll until check() returns truthy, then call cb(result). Max 30 tries × 150 ms.
    function waitFor(check, cb, max) {
        var tries = 0, limit = max || 30;
        (function attempt() {
            var result = check();
            if (result) { try { cb(result); } catch (_) {} }
            else if (tries++ < limit) { setTimeout(attempt, 150); }
        })();
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

    // ── Scenario Picker Modal (for 'load' intent) ────────────────────────────

    function loadAndShow(name) {
        fetch('/api/ai/scenario/' + encodeURIComponent(name), { credentials: 'same-origin' })
            .then(function (r) { if (!r.ok) throw new Error('fetch ' + r.status); return r.json(); })
            .then(function (json) {
                var ws = workspace();
                if (!ws) { logEvent('Workspace not ready.'); return; }
                var res = ws.loadLiveScenarioFromJson(json);
                if (res && res.passed) {
                    logEvent('Loaded scenario: ' + (json.label || json.name || name));
                } else {
                    logEvent('Scenario load blocked: ' + ((res && (res.blockedReasons || []).join(', ')) || 'unknown'));
                }
            })
            .catch(function (e) { logEvent('Scenario load failed: ' + e.message); });
    }

    function renderPickerModal(scenarios) {
        var old = document.getElementById('rmooz-launch-picker');
        if (old && old.parentNode) old.parentNode.removeChild(old);

        var backdrop = document.createElement('div');
        backdrop.id = 'rmooz-launch-picker';
        backdrop.style.cssText = [
            'position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:9999;',
            'display:flex;align-items:center;justify-content:center;'
        ].join('');

        var box = document.createElement('div');
        box.style.cssText = [
            'background:#141f30;border:1px solid #2a3a55;border-radius:10px;',
            'padding:24px;min-width:320px;max-width:460px;max-height:75vh;',
            'display:flex;flex-direction:column;gap:10px;'
        ].join('');

        var title = document.createElement('div');
        title.style.cssText = 'color:#c8d8e8;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin-bottom:4px;';
        title.textContent = 'Load Scenario';

        var list = document.createElement('div');
        list.style.cssText = 'display:flex;flex-direction:column;gap:6px;overflow-y:auto;max-height:50vh;';

        if (!scenarios.length) {
            var empty = document.createElement('div');
            empty.style.cssText = 'color:#6a7a8a;font-size:13px;padding:8px 0;';
            empty.textContent = 'No scenarios found.';
            list.appendChild(empty);
        }

        scenarios.forEach(function (name) {
            var btn = document.createElement('button');
            btn.style.cssText = [
                'background:#0d1a2a;border:1px solid #1e2e44;border-radius:6px;',
                'color:#b0c4d8;padding:10px 14px;text-align:left;cursor:pointer;',
                'font-size:13px;font-family:inherit;width:100%;'
            ].join('');
            btn.textContent = name;
            btn.addEventListener('mouseover', function () { btn.style.background = '#162538'; });
            btn.addEventListener('mouseout',  function () { btn.style.background = '#0d1a2a'; });
            btn.addEventListener('click', function () {
                if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
                loadAndShow(name);
            });
            list.appendChild(btn);
        });

        var cancel = document.createElement('button');
        cancel.style.cssText = [
            'margin-top:4px;background:transparent;border:1px solid #2a3a55;',
            'border-radius:6px;color:#6a7a8a;padding:8px 14px;cursor:pointer;',
            'font-size:12px;font-family:inherit;'
        ].join('');
        cancel.textContent = 'Cancel';
        cancel.addEventListener('click', function () {
            if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
        });

        backdrop.addEventListener('click', function (e) {
            if (e.target === backdrop && backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
        });

        box.appendChild(title);
        box.appendChild(list);
        box.appendChild(cancel);
        backdrop.appendChild(box);
        document.body.appendChild(backdrop);
    }

    function showScenarioPicker() {
        fetch('/api/ai/scenarios', { credentials: 'same-origin' })
            .then(function (r) { if (!r.ok) throw new Error('fetch ' + r.status); return r.json(); })
            .then(function (data) { renderPickerModal((data && data.scenarios) || []); })
            .catch(function (e) { logEvent('Scenario picker failed: ' + e.message); });
    }

    // ── Launch intent handlers ───────────────────────────────────────────────

    function handleLaunchIntent() {
        var intent = null;
        try { intent = new URLSearchParams(window.location.search).get('launch'); } catch (_) {}
        if (!intent) return;

        // Quick Demo — load the RMOOZ-native sample
        if (intent === 'demo') {
            loadNativeSample();
            return;
        }

        // Resume Last Session — workspace already loads the active scenario; nothing to do
        if (intent === 'resume') {
            logEvent('Resumed last session.');
            return;
        }

        // Scenario Editor — open the scenario workspace panel then toggle Edit Mode on.
        // switchTool() does bookkeeping but its modeSelect.dispatchEvent triggers app.js
        // handlers that synchronously re-hide the panel; we force-remove .hidden after
        // switchTool returns to override the cascade, then immediately call toggle().
        if (intent === 'editor') {
            waitFor(
                function () {
                    return window.AppToolRail &&
                           window.AppEditMode && typeof window.AppEditMode.toggle === 'function' &&
                           document.getElementById('scenario-workspace-panel');
                },
                function () {
                    window.AppToolRail.switchTool('scenario-workspace');
                    var p = document.getElementById('scenario-workspace-panel');
                    if (p) p.classList.remove('hidden');   // override cascade re-hide
                    if (!window.AppEditMode.isOn()) window.AppEditMode.toggle();
                }
            );
            return;
        }

        // Start New Scenario — activate Edit Mode (same overlay as 'editor') then
        // click the "+ New scenario" button.  Edit Mode's sw-editmode-wide CSS has
        // display:flex !important so the overlay stays visible regardless of .hidden.
        if (intent === 'new') {
            waitFor(
                function () {
                    return window.AppToolRail &&
                           window.AppEditMode && typeof window.AppEditMode.toggle === 'function' &&
                           document.getElementById('sw-editmode-newscen');
                },
                function () {
                    window.AppToolRail.switchTool('scenario-workspace');
                    var p = document.getElementById('scenario-workspace-panel');
                    if (p) p.classList.remove('hidden');
                    if (!window.AppEditMode.isOn()) window.AppEditMode.toggle();
                    var btn = document.getElementById('sw-editmode-newscen');
                    if (btn) btn.click();
                }
            );
            return;
        }

        // Load Scenario — show a picker modal populated from /api/ai/scenarios
        if (intent === 'load') {
            waitFor(
                function () { return workspace(); },
                function () { showScenarioPicker(); }
            );
            return;
        }

        logEvent('Unknown launch intent: ' + intent);
    }

    // Run after modules have initialized. Retries for demo until workspace is ready;
    // other intents use their own waitFor loops inside handleLaunchIntent.
    function start() {
        var intent = null;
        try { intent = new URLSearchParams(window.location.search).get('launch'); } catch (_) {}
        if (!intent) return;

        if (intent === 'demo') {
            // demo needs workspace; retry until it's available
            var tries = 0;
            (function attempt() {
                if (workspace()) { handleLaunchIntent(); }
                else if (tries++ < 20) { setTimeout(attempt, 150); }
            })();
        } else {
            // all other intents use their own waitFor loops
            handleLaunchIntent();
        }
    }

    if (typeof window !== 'undefined' && window.document) {
        if (document.readyState !== 'loading') start();
        else document.addEventListener('DOMContentLoaded', start);
    }

    window.AppNativeScenarioLoader = { loadNativeSample: loadNativeSample, SAMPLE_URL: SAMPLE_URL };
})();
