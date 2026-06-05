/* ============================================================================
 * native-scenario-loader.js — launch-intent consumer for app.html.
 * ----------------------------------------------------------------------------
 * Reads the ?launch= param set by home.html and routes into the SINGLE global
 * scenario pipeline:
 *
 *   scenario JSON  →  AppShellScenarioWorkspace.loadLiveScenarioFromJson(json)
 *                     (validate → normalize → RmoozScenario → workspace repaint
 *                      → maybeDrawLiveScenarioOnMap → adjudicator map)
 *
 * Intents handled:
 *   demo    → fetch samples/rmooz-native-01.json → load
 *   load    → read sessionStorage['rmooz.pending-import'] → load → clear
 *   resume  → read sessionStorage['rmooz.last-json'] → load
 *   editor  → show Editor placeholder notice (no load)
 *   new     → show New Scenario notice (no load — authoring in development)
 *   (others)→ log receipt, no workspace disturbance
 *
 * After every successful load: saves to sessionStorage['rmooz.last-json'] +
 * localStorage['rmooz.last-session'] so home.html Resume can offer a reload.
 *
 * Invariants:
 *   • Direct /app.html (no ?launch=) → untouched.
 *   • Wargame 3 path → untouched (it owns its own scenario load).
 *   • Quick Demo → untouched (same fetch path as before, just now also saves).
 *   • On any failure: workspace state is NOT mutated; error is surfaced to the
 *     event log + a transient in-page notice.
 * ========================================================================== */
(function () {
    'use strict';

    var SAMPLE_URL        = 'samples/rmooz-native-01.json';
    var STORAGE_PENDING   = 'rmooz.pending-import';
    var STORAGE_LAST_JSON = 'rmooz.last-json';
    var STORAGE_LAST_META = 'rmooz.last-session';

    /* ---- helpers --------------------------------------------------------- */
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

    /* Persist the successfully loaded scenario so Resume can offer a reload.
       sessionStorage survives same-tab navigation; localStorage keeps metadata only. */
    function saveLastSession(jsonText, source, id, label) {
        try { sessionStorage.setItem(STORAGE_LAST_JSON, jsonText); } catch (_) {}
        try {
            localStorage.setItem(STORAGE_LAST_META, JSON.stringify({
                source: source, id: id || '', label: label || '', ts: new Date().toISOString()
            }));
        } catch (_) {}
    }

    /* Transient notice anchored below the app header (dismissed after durationMs or on ×). */
    function showAppNotice(mainText, subText, isError, durationMs) {
        var el = document.getElementById('rmooz-launch-notice');
        if (!el) {
            el = document.createElement('div');
            el.id = 'rmooz-launch-notice';
            el.style.cssText = [
                'position:fixed;top:66px;left:50%;transform:translateX(-50%);z-index:9000;',
                'max-width:560px;width:90%;border-radius:10px;padding:13px 40px 13px 16px;',
                'font-size:13px;line-height:1.5;box-shadow:0 4px 24px rgba(0,0,0,.55);',
                'font-family:"Segoe UI",system-ui,sans-serif;'
            ].join('');

            var msgEl = document.createElement('div');
            msgEl.id = 'rmooz-launch-notice-main';
            var subEl = document.createElement('div');
            subEl.id = 'rmooz-launch-notice-sub';
            subEl.style.cssText = 'font-size:11px;opacity:.75;margin-top:3px;display:none;';

            var closeBtn = document.createElement('button');
            closeBtn.textContent = '×';
            closeBtn.setAttribute('aria-label', 'Dismiss');
            closeBtn.style.cssText = [
                'position:absolute;top:8px;right:10px;background:none;border:none;',
                'color:inherit;font-size:16px;cursor:pointer;line-height:1;opacity:.7;'
            ].join('');
            closeBtn.addEventListener('click', function () { el.style.display = 'none'; });

            el.appendChild(msgEl);
            el.appendChild(subEl);
            el.appendChild(closeBtn);
            document.body.appendChild(el);
        }

        var isErr = !!isError;
        el.style.background = isErr ? 'rgba(140,30,24,.92)' : 'rgba(18,36,56,.95)';
        el.style.border      = '1px solid ' + (isErr ? 'rgba(220,80,70,.55)' : '#3a96d2');
        el.style.color       = isErr ? '#f0c8c5' : '#c5ddf0';

        document.getElementById('rmooz-launch-notice-main').textContent = mainText;
        var sub = document.getElementById('rmooz-launch-notice-sub');
        if (sub) {
            sub.textContent = subText || '';
            sub.style.display = subText ? 'block' : 'none';
        }
        el.style.display = 'block';

        if (el._timer) clearTimeout(el._timer);
        el._timer = setTimeout(function () { el.style.display = 'none'; }, durationMs || 6000);
    }

    /* ---- intent: demo ---------------------------------------------------- */
    function loadNativeSample() {
        return fetch(SAMPLE_URL, { credentials: 'same-origin' })
            .then(function (r) {
                if (!r.ok) throw new Error('fetch ' + r.status);
                return r.json();
            })
            .then(function (json) {
                var ws = workspace();
                if (!ws) { logEvent('Native sample: workspace loader unavailable.'); return false; }
                var res = ws.loadLiveScenarioFromJson(json);
                if (res && res.passed) {
                    var label = res.scenarioLabel || res.scenarioId || 'rmooz-native-01';
                    logEvent('Loaded RMOOZ-native scenario: ' + label);
                    saveLastSession(JSON.stringify(json), 'demo',
                        res.scenarioId || json.scenario_id || 'rmooz-native-01',
                        label);
                    return true;
                }
                logEvent('Native sample blocked: ' +
                    ((res && (res.blockedReasons || []).join(', ')) || 'unknown'));
                return false;
            })
            .catch(function (e) {
                logEvent('Native sample load failed: ' + e.message);
                return false;
            });
    }

    /* ---- intent: load (file from home.html picker) ----------------------- */
    function handleLoadIntent() {
        var raw = null;
        try { raw = sessionStorage.getItem(STORAGE_PENDING); } catch (_) {}

        if (!raw) {
            logEvent('Load Scenario: no pending import. Go back to the launch window and try again.');
            showAppNotice(
                'No scenario was passed from the launcher.',
                'Go back (← Main Window) and use Load Scenario to select a file.',
                true, 8000
            );
            return;
        }

        var json;
        try { json = JSON.parse(raw); } catch (_) {
            logEvent('Load Scenario: pending import was not valid JSON.');
            showAppNotice(
                'The selected file could not be parsed.',
                'Select a valid RMOOZ scenario JSON from the launch window.',
                true, 8000
            );
            try { sessionStorage.removeItem(STORAGE_PENDING); } catch (_) {}
            return;
        }

        var ws = workspace();
        if (!ws) {
            logEvent('Load Scenario: workspace loader unavailable.');
            return;
        }

        var res = ws.loadLiveScenarioFromJson(json);
        if (res && res.passed) {
            var label = res.scenarioLabel || res.scenarioId || json.scenario_label || json.name || 'scenario';
            logEvent('Loaded scenario: ' + label);
            saveLastSession(raw, 'load',
                res.scenarioId || json.scenario_id || '',
                label);
            try { sessionStorage.removeItem(STORAGE_PENDING); } catch (_) {}
            return;
        }

        /* validation failed — workspace was NOT mutated */
        var reasons = (res && res.blockedReasons && res.blockedReasons.length)
            ? res.blockedReasons.join('; ')
            : 'validation failed';
        logEvent('Load Scenario blocked: ' + reasons);
        showAppNotice(
            'Scenario could not be loaded: ' + reasons,
            'The workspace was not changed.',
            true, 10000
        );
        try { sessionStorage.removeItem(STORAGE_PENDING); } catch (_) {}
    }

    /* ---- intent: resume -------------------------------------------------- */
    function handleResumeIntent() {
        var raw = null;
        try { raw = sessionStorage.getItem(STORAGE_LAST_JSON); } catch (_) {}

        if (!raw) {
            logEvent('Resume: no session data found in this browser tab.');
            showAppNotice(
                'No session to resume in this window.',
                'Load a scenario from the launch window to begin.',
                false, 5000
            );
            return;
        }

        var json;
        try { json = JSON.parse(raw); } catch (_) {
            logEvent('Resume: stored session data was invalid.');
            try { sessionStorage.removeItem(STORAGE_LAST_JSON); } catch (_) {}
            return;
        }

        var ws = workspace();
        if (!ws) { logEvent('Resume: workspace loader unavailable.'); return; }

        var res = ws.loadLiveScenarioFromJson(json);
        if (res && res.passed) {
            logEvent('Resumed session: ' + (res.scenarioLabel || res.scenarioId || 'last session'));
            return;
        }
        logEvent('Resume blocked: ' + ((res && (res.blockedReasons || []).join(', ')) || 'unknown'));
        showAppNotice(
            'Could not resume the last session.',
            'The scenario may no longer be compatible. Try loading a fresh copy.',
            true, 8000
        );
    }

    /* ---- intent: new scenario ------------------------------------------- */
    function handleNewIntent() {
        var raw = null;
        try { raw = sessionStorage.getItem(STORAGE_PENDING); } catch (_) {}

        if (!raw) {
            logEvent('New Scenario: no draft template found. Go back and use Start New Scenario again.');
            showAppNotice(
                'No draft was passed from the launcher.',
                'Go back (← Main Window) and use Start New Scenario again.',
                true, 8000
            );
            return;
        }

        var json;
        try { json = JSON.parse(raw); } catch (_) {
            logEvent('New Scenario: draft template was invalid JSON.');
            showAppNotice('The new scenario template could not be parsed.', null, true, 8000);
            try { sessionStorage.removeItem(STORAGE_PENDING); } catch (_) {}
            return;
        }

        var ws = workspace();
        if (!ws) { logEvent('New Scenario: workspace loader unavailable.'); return; }

        var res = ws.loadLiveScenarioFromJson(json);
        if (res && res.passed) {
            var label = res.scenarioLabel || json.scenario_label || 'New Scenario';
            logEvent('New Scenario: blank draft loaded — opening Edit Mode.');
            saveLastSession(raw, 'new', res.scenarioId || 'new-draft', label);
            try { sessionStorage.removeItem(STORAGE_PENDING); } catch (_) {}

            /* Open the scenario workspace panel + Edit Mode after the workspace
             * and map have had time to paint (loadLiveScenarioFromJson schedules
             * a 360ms map-fit; we wait a bit longer to let it settle). */
            setTimeout(function () {
                try {
                    if (window.AppToolRail && typeof window.AppToolRail.switchTool === 'function') {
                        window.AppToolRail.switchTool('scenario-workspace');
                    }
                } catch (_) {}
                try {
                    if (window.AppEditMode && typeof window.AppEditMode.setMode === 'function') {
                        window.AppEditMode.setMode(true);
                    }
                } catch (_) {}
            }, 600);
            return;
        }

        var reasons = (res && res.blockedReasons && res.blockedReasons.length)
            ? res.blockedReasons.join('; ')
            : 'validation failed';
        logEvent('New Scenario blocked: ' + reasons);
        showAppNotice(
            'Could not load the new scenario draft: ' + reasons,
            'The workspace was not changed.',
            true, 10000
        );
        try { sessionStorage.removeItem(STORAGE_PENDING); } catch (_) {}
    }

    /* ---- intent: editor ------------------------------------------------- */
    function handleEditorIntent() {
        logEvent('Launch intent "editor": scenario authoring controls are in development.');
        showAppNotice(
            'Scenario Editor — authoring controls are being built.',
            'Available now: Edit Mode in the workspace panel (metadata, sides, posture).',
            false, 8000
        );
    }

    /* ---- intents: reveal an existing import card (NO scenario mutation) --- */
    /* FAST-INT-3: the Home Command Launch screen routes the two WarGamingGEN
     * import flows here. We only OPEN the scenario-workspace panel and scroll
     * the existing FAST-INT-2 / FAST-DOC-1 card into view — we never load,
     * convert, or mutate scenario state. The card's own buttons remain the
     * single, explicit import trigger. */
    function revealImportCard(cardId, label) {
        var tries = 0;
        (function attempt() {
            try {
                if (window.AppToolRail && typeof window.AppToolRail.switchTool === 'function') {
                    window.AppToolRail.switchTool('scenario-workspace');
                }
            } catch (_) {}
            var card = document.getElementById(cardId);
            if (!card && tries < 20) { tries++; return void setTimeout(attempt, 150); }
            if (!card) {
                showAppNotice(label + ' panel not found.',
                    'Open Scenario Workspace → Source & Origin to use it.', true, 8000);
                return;
            }
            try { card.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
            // brief, self-clearing highlight — visual only
            var prev = card.style.boxShadow;
            card.style.boxShadow = '0 0 0 2px #e0c060';
            setTimeout(function () { card.style.boxShadow = prev; }, 2200);
            logEvent('Launch intent "' + label + '": revealed import panel (no scenario change).');
        })();
    }

    /* ---- dispatch -------------------------------------------------------- */
    function handleLaunchIntent() {
        var intent = null;
        try { intent = new URLSearchParams(window.location.search).get('launch'); } catch (_) {}
        if (!intent) return;

        if (intent === 'demo')           { loadNativeSample();   return; }
        if (intent === 'load')           { handleLoadIntent();   return; }
        if (intent === 'resume')         { handleResumeIntent(); return; }
        if (intent === 'new')            { handleNewIntent();    return; }
        if (intent === 'editor')         { handleEditorIntent(); return; }
        if (intent === 'import-geojson') { revealImportCard('wg-geojson-import-card', 'Import WarGamingGEN GeoJSON'); return; }
        if (intent === 'import-docx')    { revealImportCard('wg-sim-import-card', 'DOCX Simulation Import'); return; }

        /* settings / layers / help / unknown — receipt only */
        logEvent('Launch intent "' + intent + '" received.');
    }

    /* ---- startup: wait for workspace, then dispatch ---------------------- */
    function start() {
        var tries = 0;
        (function attempt() {
            var intent = null;
            try { intent = new URLSearchParams(window.location.search).get('launch'); } catch (_) {}
            if (!intent) return;

            /* demo, load, resume, new all need the workspace loader; editor does not */
            var needsWs = (intent === 'demo' || intent === 'load' || intent === 'resume' || intent === 'new');
            if (needsWs && !workspace() && tries < 20) {
                tries++;
                return void setTimeout(attempt, 150);
            }
            handleLaunchIntent();
        })();
    }

    if (typeof window !== 'undefined' && window.document) {
        if (document.readyState !== 'loading') start();
        else document.addEventListener('DOMContentLoaded', start);
    }

    window.AppNativeScenarioLoader = { loadNativeSample: loadNativeSample, SAMPLE_URL: SAMPLE_URL };
})();
