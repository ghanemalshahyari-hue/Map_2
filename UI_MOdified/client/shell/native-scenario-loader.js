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
    // fix(loader): a SAFE pointer (name only) to the last-loaded data/scenarios
    // scenario, so a plain refresh can restore it without storing the full JSON.
    var STORAGE_LAST_LOADED = 'rmooz.last-loaded';
    // Server safeName charset only — blocks path separators and traversal.
    var SAFE_NAME_RE = /^[a-z0-9._-]+$/i;

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

    /* fix(loader): last-loaded SAFE pointer (data/scenarios files only) ------ */
    // A scenario name is safe iff it matches the server safeName charset and
    // carries no path traversal — so the GET /api/ai/scenario/<name> restore can
    // never escape data/scenarios.
    function isSafeScenarioName(name) {
        return typeof name === 'string' && name.length > 0 && name.length <= 80 &&
               SAFE_NAME_RE.test(name) && name.indexOf('..') === -1;
    }
    // Persist ONLY a pointer (name + derived file), never the full scenario JSON.
    function rememberLastLoadedScenario(name) {
        try {
            if (!isSafeScenarioName(name)) return;
            localStorage.setItem(STORAGE_LAST_LOADED, JSON.stringify({
                name: name, file: name + '.json', source: 'data/scenarios',
                savedAt: new Date().toISOString(),
            }));
        } catch (_) {}
    }
    function getRememberedScenario() {
        try {
            var raw = localStorage.getItem(STORAGE_LAST_LOADED);
            if (!raw) return null;
            var p = JSON.parse(raw);
            if (!p || p.source !== 'data/scenarios' || !isSafeScenarioName(p.name)) return null;
            return p;
        } catch (_) { return null; }
    }
    function clearRememberedScenario() {
        try { localStorage.removeItem(STORAGE_LAST_LOADED); } catch (_) {}
    }
    // RUNFIX-1: announce the canonical active scenario to every run surface.
    // The Wargame HUD listens (syncs its #wg-adj-scenario dropdown + default) so
    // "Run trial" adjudicates the SAME scenario the workspace/Play path renders.
    // persist=true also records it as the server's active scenario — the single
    // cross-surface arbiter (data/scenarios/_active.json) the HUD reads at init.
    function announceActiveScenario(name, persist) {
        if (!isSafeScenarioName(name)) return;
        if (persist) {
            try {
                fetch('/api/scenario/active', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify({ name: name }),
                }).catch(function () {});
            } catch (_) {}
        }
        try {
            document.dispatchEvent(new CustomEvent('rmooz:active-scenario-changed', {
                detail: { name: name, source: 'native-scenario-loader' }
            }));
        } catch (_) {}
    }
    // Load a data/scenarios scenario by (validated) name into the workspace.
    function _restoreByName(ws, name, persistActive) {
        if (!isSafeScenarioName(name)) return Promise.reject(new Error('unsafe name'));
        return fetch('/api/ai/scenario/' + encodeURIComponent(name), { credentials: 'same-origin' })
            .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
            .then(function (j) {
                var sc = (j && j.scenario) ? j.scenario : j;   // unwrap { ok, scenario }
                var res = ws.loadLiveScenarioFromJson(sc);
                if (!res || res.passed !== true) throw new Error('blocked');
                rememberLastLoadedScenario(name);              // keep the pointer fresh
                announceActiveScenario(name, persistActive !== false);   // RUNFIX-1: one canonical scenario
                logEvent('Restored scenario: ' + name);
                return true;
            });
    }
    // On a plain refresh (no explicit launch intent), reload the last scenario
    // via the NORMAL loader path. RUNFIX-1: the SERVER's active scenario (set by
    // the latest explicit import/load/selection on ANY surface, incl. the HUD
    // dropdown) is canonical and is tried FIRST; the local pointer is only the
    // offline fallback. This stops a stale localStorage pointer from overriding
    // the operator's latest selection — the old order let the stale pointer win
    // whenever it still loaded. Invalid/missing everywhere → cleared pointer +
    // clean default state, no modal, no crash.
    function restoreLastLoadedScenario() {
        var ws = workspace();
        if (!ws) return;
        var p = getRememberedScenario();
        var pointer = p ? p.name : null;
        fetch('/api/ai/scenarios', { credentials: 'same-origin' })
            .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
            .then(function (j) {
                var active = j && j.active;
                if (!isSafeScenarioName(active)) throw new Error('no server active');
                // Server active is already canonical — restoring it must not re-POST.
                return _restoreByName(ws, active, false);
            })
            .catch(function () {
                // Offline / no server active: fall back to the local pointer.
                if (!pointer) return;
                return _restoreByName(ws, pointer, false)
                    .catch(function () { clearRememberedScenario(); });   // self-heal
            });
    }

    /* APP-FLOW-2: in-app load/import entry points (reuse existing flows) ----- */
    // Open the existing Import Scenario modal directly (no URL launch, so it
    // never auto-opens on refresh). The modal's own already-open guard means
    // repeated clicks open it only once.
    function openImportScenario() {
        try { openImportCardModal('wg-wizard-card', 'Import Scenario'); } catch (_) {}
    }
    // Load a data/scenarios scenario by name through the NORMAL loader path
    // (same as restore). Validates the name (no traversal), remembers the
    // pointer, and surfaces failures without mutating the workspace.
    function loadScenarioByName(name) {
        if (!isSafeScenarioName(name)) { showAppNotice('Invalid scenario name.', null, true, 5000); return; }
        var ws = workspace();
        if (!ws) { showAppNotice('Scenario workspace is not ready yet.', 'Try again in a moment.', true, 5000); return; }
        fetch('/api/ai/scenario/' + encodeURIComponent(name), { credentials: 'same-origin' })
            .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
            .then(function (j) {
                var sc = (j && j.scenario) ? j.scenario : j;   // unwrap { ok, scenario }
                var res = ws.loadLiveScenarioFromJson(sc);
                if (!res || res.passed !== true) {
                    throw new Error((res && res.blockedReasons && res.blockedReasons.join('; ')) || 'validation failed');
                }
                rememberLastLoadedScenario(name);
                announceActiveScenario(name, true);   // RUNFIX-1: explicit load ⇒ new canonical active
                logEvent('Loaded scenario: ' + name);
            })
            .catch(function (e) {
                showAppNotice('Could not load scenario "' + name + '".', String(e && e.message || e), true, 7000);
            });
    }
    // Minimal in-app scenario picker: lists data/scenarios via the existing
    // /api/ai/scenarios endpoint and loads the chosen one. No file parsing here.
    function openScenarioPicker() {
        if (document.getElementById('rmooz-scenario-picker')) return;   // single instance
        fetch('/api/ai/scenarios', { credentials: 'same-origin' })
            .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
            .then(function (j) {
                var raw = (j && Array.isArray(j.scenarios)) ? j.scenarios : [];
                var names = raw.map(function (s) { return typeof s === 'string' ? s : (s && (s.name || s.id)); })
                               .filter(function (n) { return isSafeScenarioName(n); });
                if (!names.length) { showAppNotice('No saved scenarios found.', 'Import a scenario to begin.', false, 6000); return; }

                var backdrop = document.createElement('div');
                backdrop.id = 'rmooz-scenario-picker';
                backdrop.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:24px;';
                var box = document.createElement('div');
                box.style.cssText = 'background:#141a22;border:1px solid #2a3a55;border-radius:10px;min-width:320px;max-width:480px;width:100%;box-shadow:0 14px 52px rgba(0,0,0,.6);padding:16px;';
                var h = document.createElement('div'); h.textContent = 'Load Scenario · تحميل سيناريو';
                h.style.cssText = 'color:#e0c060;font-weight:700;font-size:13px;margin-bottom:10px;';
                var sel = document.createElement('select');
                sel.style.cssText = 'width:100%;padding:7px;border:1px solid #3a5570;background:#161b18;color:#e8eaed;border-radius:5px;font:inherit;font-size:13px;margin-bottom:12px;';
                var active = j && j.active;
                names.forEach(function (n) {
                    var o = document.createElement('option'); o.value = n; o.textContent = n;
                    if (n === active) o.selected = true;
                    sel.appendChild(o);
                });
                var row = document.createElement('div'); row.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;';
                var cancel = document.createElement('button'); cancel.textContent = 'Cancel · إلغاء';
                cancel.style.cssText = 'font:inherit;cursor:pointer;border:1px solid #5a6270;background:#2a2f37;color:#e8eaed;border-radius:5px;padding:5px 12px;';
                var load = document.createElement('button'); load.textContent = 'Load · تحميل';
                load.style.cssText = 'font:inherit;cursor:pointer;border:1px solid #4a7bb8;background:#22303f;color:#e8eaed;border-radius:5px;padding:5px 12px;';
                function close() { if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop); }
                cancel.addEventListener('click', close);
                load.addEventListener('click', function () { var n = sel.value; close(); loadScenarioByName(n); });
                backdrop.addEventListener('click', function (e) { if (e.target === backdrop) close(); });
                row.appendChild(cancel); row.appendChild(load);
                box.appendChild(h); box.appendChild(sel); box.appendChild(row);
                backdrop.appendChild(box); document.body.appendChild(backdrop);
            })
            .catch(function (e) { showAppNotice('Could not list scenarios.', String(e && e.message || e), true, 6000); });
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
            // Remember the data/scenarios pointer so a refresh restores it.
            rememberLastLoadedScenario(json.name || res.scenarioId);
            // RUNFIX-1: sync run surfaces to the loaded identity (event only — a
            // launcher file may not exist server-side, so don't persist active).
            announceActiveScenario(json.name || res.scenarioId, false);
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

    function openSettingsPanel() {
        var panel = document.getElementById('utility-panel');
        if (panel) {
            panel.classList.remove('hidden');
            panel.setAttribute('aria-hidden', 'false');
            return true;
        }
        if (window.AppSettingsPanel && typeof window.AppSettingsPanel.open === 'function') {
            try { window.AppSettingsPanel.open(); return true; } catch (_) {}
        }
        return false;
    }

    function openLayersPanel() {
        if (window.AppToolRail && typeof window.AppToolRail.switchTool === 'function') {
            window.AppToolRail.switchTool('layers');
            return true;
        }
        return false;
    }

    function handleSettingsIntent() {
        if (openSettingsPanel()) {
            logEvent('Launch intent "settings": settings panel opened.');
            return;
        }
        logEvent('Launch intent "settings": settings panel unavailable.');
        showAppNotice('Settings are not available yet in this view.', null, true, 6000);
    }

    function handleLayersIntent() {
        if (openLayersPanel()) {
            logEvent('Launch intent "layers": layers panel opened.');
            return;
        }
        logEvent('Launch intent "layers": layers panel unavailable.');
        showAppNotice('Map Layers could not be opened.', 'The workspace tool rail is not ready yet.', true, 6000);
    }

    function handleHelpIntent() {
        logEvent('Launch intent "help": guide notice shown.');
        showAppNotice(
            'Guide: use the left tool rail for map tools and the header Settings button for workspace options.',
            'Load, create, or resume a scenario to unlock the Scenario workspace and Edit Mode.',
            false, 9000
        );
    }

    /* ---- intents: open an existing import card in a POPUP (NO mutation) --- */
    /* FAST-INT-3: the Home Command Launch screen routes the two WarGamingGEN
     * import flows here. Earlier attempts revealed the card inside the
     * scenario-workspace side panel, but the tool-rail re-hides that panel
     * during init (syncRailFromMode → setVisibleSections('select')), so on the
     * full app the card never appeared. Instead we host the EXISTING card in a
     * top-level modal popup (z-index above everything) — immune to the tool-rail
     * / side-panel state. We MOVE the real card element (preserving its wired
     * buttons — no importer logic is duplicated) and move it back on close.
     * Pure presentation — never loads/converts/mutates scenario state. */
    function openImportCardModal(cardId, title) {
        var start = Date.now(), DEADLINE = 8000;
        (function attempt() {
            var card = document.getElementById(cardId);
            if (!card) {
                if (Date.now() - start < DEADLINE) return void setTimeout(attempt, 200);
                showAppNotice(title + ' is not available yet.', 'Reload the page and try again.', true, 8000);
                return;
            }
            if (document.getElementById('wg-import-modal')) return;   // already open

            // Remember where the card lives so we can restore it on close.
            var origParent = card.parentNode, origNext = card.nextSibling, origStyle = card.getAttribute('style') || '';

            var backdrop = document.createElement('div');
            backdrop.id = 'wg-import-modal';
            backdrop.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.62);' +
                'display:flex;align-items:flex-start;justify-content:center;padding:46px 16px;overflow:auto;';
            var box = document.createElement('div');
            box.style.cssText = 'background:#141a22;border:1px solid #2a3a55;border-radius:10px;max-width:660px;' +
                'width:100%;box-shadow:0 14px 52px rgba(0,0,0,.6);';
            var hdr = document.createElement('div');
            hdr.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border-bottom:1px solid #2a3a55;';
            var h = document.createElement('div'); h.textContent = title;
            h.style.cssText = 'color:#e0c060;font-weight:700;font-size:13px;';
            var x = document.createElement('button'); x.textContent = '✕'; x.setAttribute('aria-label', 'Close');
            x.style.cssText = 'background:none;border:none;color:#c5ddf0;font-size:16px;cursor:pointer;line-height:1;';
            var body = document.createElement('div'); body.style.cssText = 'padding:14px;';

            function close() {
                card.setAttribute('style', origStyle);
                if (origParent) { origNext ? origParent.insertBefore(card, origNext) : origParent.appendChild(card); }
                if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
                document.removeEventListener('rmooz:wg-import-loaded', onImported);
            }
            // Keep import popups persistent while errors/status are visible.
            // Successful full or partial imports emit this event and close the popup.
            function onImported() { setTimeout(close, 400); }
            x.addEventListener('click', close);
            document.addEventListener('rmooz:wg-import-loaded', onImported);

            hdr.appendChild(h); hdr.appendChild(x);
            // Move the REAL card (keeps its wired file inputs + import buttons).
            card.style.margin = '0'; card.style.boxShadow = 'none'; card.style.border = 'none';
            body.appendChild(card);
            box.appendChild(hdr); box.appendChild(body); backdrop.appendChild(box);
            document.body.appendChild(backdrop);
            logEvent('Launch intent "' + title + '": opened import popup (no scenario change).');
        })();
    }

    /* Remove the one-shot ?launch= flag from the URL after we've acted on it, so
     * a plain page REFRESH does not re-trigger the launch (e.g. re-open the
     * Import Scenario modal). The modal then opens only on an explicit click that
     * re-navigates with launch=, or a fresh launch= URL — never on refresh.
     * Pure URL housekeeping: no navigation, no scenario/map mutation. */
    function consumeLaunchParam() {
        try {
            var url = new URL(window.location.href);
            if (!url.searchParams.has('launch')) return;
            url.searchParams.delete('launch');
            var qs = url.searchParams.toString();
            window.history.replaceState({}, document.title, url.pathname + (qs ? '?' + qs : '') + url.hash);
        } catch (_) { /* ignore */ }
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
        // Import modals are one-shot: open, then consume the launch flag so a
        // refresh won't auto-reopen the wizard (fix(import) — no auto-open).
        if (intent === 'import-geojson') { openImportCardModal('wg-geojson-import-card', 'Import WarGamingGEN GeoJSON'); consumeLaunchParam(); return; }
        if (intent === 'import-docx')    { openImportCardModal('wg-wizard-card', 'Import Scenario'); consumeLaunchParam(); return; }
        if (intent === 'settings')       { handleSettingsIntent(); return; }
        if (intent === 'layers')         { handleLayersIntent();   return; }
        if (intent === 'help')           { handleHelpIntent();     return; }

        /* settings / layers / help / unknown — receipt only */
        logEvent('Launch intent "' + intent + '" received.');
    }

    /* ---- startup: wait for workspace, then dispatch ---------------------- */
    function start() {
        var tries = 0;
        (function attempt() {
            var intent = null;
            try { intent = new URLSearchParams(window.location.search).get('launch'); } catch (_) {}

            // No explicit launch intent (e.g. a plain page REFRESH): restore the
            // last-loaded scenario from its safe pointer once the workspace is
            // ready. An explicit launch intent ALWAYS wins over restore (handled
            // in the branch below). No pointer → clean default state.
            if (!intent) {
                if (!getRememberedScenario()) return;
                if (!workspace() && tries < 20) { tries++; return void setTimeout(attempt, 150); }
                restoreLastLoadedScenario();
                return;
            }

            /* demo, load, resume, new all need the workspace loader; editor does not */
            var needsWs = (intent === 'demo' || intent === 'load' || intent === 'resume' || intent === 'new');
            if (needsWs && !workspace() && tries < 20) {
                tries++;
                return void setTimeout(attempt, 150);
            }
            handleLaunchIntent();
        })();
    }

    // OPSCENARIO-AI-1: wire the Operational Scenario panel's "Generate (offline AI)"
    // button to the SAME generation flow Scenario Import uses — no separate AI
    // integration, no Ollama, no new endpoint. It simply opens the existing
    // WarGamingGEN wizard modal (DOCX → Start → 17-phase LiteLLM generation →
    // stop/continue → Import Partial → loads via the normal scenario loader).
    function bindOperationalScenarioGenerate() {
        var btn = document.getElementById('wg-generate-ai');
        if (!btn || btn._opGenBound) return;
        btn._opGenBound = true;
        btn.addEventListener('click', function (ev) {
            if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();
            openImportScenario();   // reuse the proven offline generation wizard
        });
    }

    if (typeof window !== 'undefined' && window.document) {
        if (document.readyState !== 'loading') { start(); bindOperationalScenarioGenerate(); }
        else document.addEventListener('DOMContentLoaded', function () { start(); bindOperationalScenarioGenerate(); });
    }

    window.AppNativeScenarioLoader = {
        bindOperationalScenarioGenerate: bindOperationalScenarioGenerate,
        loadNativeSample: loadNativeSample,
        SAMPLE_URL: SAMPLE_URL,
        // fix(loader): exposed so other load paths (e.g. the import wizard) can
        // remember the data/scenarios pointer after a successful load.
        rememberLastLoadedScenario: rememberLastLoadedScenario,
        getRememberedScenario: getRememberedScenario,
        clearRememberedScenario: clearRememberedScenario,
        restoreLastLoadedScenario: restoreLastLoadedScenario,
        // RUNFIX-1: canonical active-scenario announcement (HUD dropdown sync).
        announceActiveScenario: announceActiveScenario,
        // APP-FLOW-2: in-app run-bar entry points.
        openImportScenario: openImportScenario,
        loadScenarioByName: loadScenarioByName,
        openScenarioPicker: openScenarioPicker,
    };
})();
