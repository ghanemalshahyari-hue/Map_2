/**
 * tool-rail.js — Bridge between the new tool rail UI and the existing mode system in app.js.
 *
 * Strategy: The old mode <select> and sidebar tabs are hidden but still in the DOM.
 * This script drives them programmatically so all existing event listeners in app.js,
 * chat.js, and free_draw_signature.js continue to work without modification.
 *
 * Tool set: Select | Symbol | Draw | Text | Measure | Shapes | Erase | Layers
 */
(function () {
    'use strict';

    /* ── Tool definitions ─────────────────────────────────────────────── *
     * title/hint hold the English fallback. titleKey/hintKey resolve through
     * window.t() so the panel header and status bar update when the user
     * toggles language — they previously stayed in English regardless. */
    const TOOL_CONFIG = {
        select:  { mode: 'pan',    tab: 'drawing', title: 'Select',  titleKey: 'tool-select',  hint: 'Click or drag on the map to select items',           hintKey: 'tool-hint-select' },
        symbol:  { mode: 'symbol', tab: 'drawing', title: 'Symbol',  titleKey: 'tool-symbol',  hint: 'Choose a symbol, then click the map to place it',    hintKey: 'tool-hint-symbol' },
        draw:    { mode: 'line',   tab: 'drawing', title: 'Draw',    titleKey: 'tool-draw',    hint: 'Click to add points. Double-click to finish',         hintKey: 'tool-hint-draw' },
        text:    { mode: 'text',   tab: 'drawing', title: 'Text',    titleKey: 'tool-text',    hint: 'Enter text, then click the map to place it',          hintKey: 'tool-hint-text' },
        erase:   { mode: 'eraser', tab: 'drawing', title: 'Erase',   titleKey: 'tool-erase',   hint: 'Click items to erase them',                           hintKey: 'tool-hint-erase' },
        measure: { mode: 'pan',    tab: 'geo',     title: 'Measure', titleKey: 'tool-measure', hint: 'Click points on the map to measure distance',         hintKey: 'tool-hint-measure' },
        shapes:  { mode: 'pan',    tab: 'geo',     title: 'Shapes',  titleKey: 'tool-shapes',  hint: 'Choose a shape, then click the map',                  hintKey: 'tool-hint-shapes' },
        layers:  { mode: null,     tab: null,      title: 'Layers',   titleKey: 'tool-layers',  hint: 'Organize your map items',                            hintKey: 'tool-hint-layers' },
        wargame: { mode: null,     tab: null,      title: 'Scenario', titleKey: 'tool-wargame', hint: 'Run an operational scenario (turn-based)',          hintKey: 'tool-hint-wargame' },
        // PR-42: Scenario Workspace Shell — read-only scenario overview
        'scenario-workspace': { mode: null, tab: null, title: 'Scenario', titleKey: 'sw-tool-label', hint: 'Scenario overview — read-only workspace', hintKey: 'sw-tool-hint' },
    };

    function tx(key, fallback) {
        if (typeof window.t === 'function') {
            const v = window.t(key);
            if (v && v !== key) return v;
        }
        return fallback;
    }

    /* ── DOM references ───────────────────────────────────────────────── */
    const modeSelect       = document.getElementById('tool-mode');
    const geoToolSelect    = document.getElementById('geo-tool-select');
    const contextPanel          = document.getElementById('context-panel');
    const drawingPanel          = document.getElementById('drawing-panel');
    const geoPanel              = document.getElementById('geo-panel');
    const measurePanel          = document.getElementById('measure-panel');
    const shapesPanel           = document.getElementById('shapes-panel');
    const layersSection         = document.getElementById('layers-section');
    const wargamePanel          = document.getElementById('wargame-panel');
    const scenarioWorkspacePanel = document.getElementById('scenario-workspace-panel');
    const opsIntelPanel         = document.getElementById('ops-intel-panel');
    const panelTitle       = document.getElementById('context-panel-title');
    const panelHint        = document.getElementById('context-panel-hint');
    const statusbarTool    = document.getElementById('statusbar-tool-display');
    const statusbarHint    = document.getElementById('statusbar-hint-display');

    // Inner drawing-panel sections (managed by tool-rail to override app.js's switchSidebarForMode)
    const selectPanel      = document.getElementById('select-panel');
    const symbolManager    = document.getElementById('symbol-manager');
    const lineManager      = document.getElementById('line-manager');
    const textManager      = document.getElementById('text-manager');
    const erasePanel       = document.getElementById('erase-panel');

    let currentTool = 'select';

    /* ── Top-level section visibility ─────────────────────────────────── *
     * Use ONLY the .hidden class (not inline style.display) so we stay
     * consistent with app.js which toggles .hidden on drawing-panel and
     * geo-panel.  The CSS rule .context-section.hidden { display:none }
     * and .sidebar-panel.hidden { display:none } handle the rest.
     *
     * Note: geoPanel stays in the DOM (hidden) as a bridge for app.js's
     * geo tool handlers. Shapes/Measure panels are the new visible panels.
     */
    const contextSections = [drawingPanel, geoPanel, measurePanel, shapesPanel, layersSection, wargamePanel, scenarioWorkspacePanel];

    function setOpsIntelVisible(visible) {
        if (!opsIntelPanel) return;
        opsIntelPanel.classList.toggle('is-visible', !!visible);
        opsIntelPanel.setAttribute('aria-hidden', visible ? 'false' : 'true');
    }

    function setVisibleSections(tool) {
        const show = {
            select:               [drawingPanel],
            symbol:               [drawingPanel],
            draw:                 [drawingPanel],
            text:                 [drawingPanel],
            erase:                [drawingPanel],
            measure:              [measurePanel],
            shapes:               [shapesPanel],
            layers:               [layersSection],
            wargame:              [wargamePanel],
            'scenario-workspace': [scenarioWorkspacePanel],
        };

        const visible = show[tool] || [];
        const geoToolActive = (tool === 'shapes' || tool === 'measure');
        setOpsIntelVisible(tool === 'wargame');

        contextSections.forEach(sec => {
            if (!sec) return;
            sec.style.display = '';

            if (visible.includes(sec)) {
                sec.classList.remove('hidden');
            } else if (sec === geoPanel && geoToolActive) {
                // Special case: keep geoPanel without .hidden class so app.js's
                // isGeoPanelActive() returns true (it checks for .hidden).
                // Visually hide it with inline display:none instead.
                sec.classList.remove('hidden');
                sec.style.display = 'none';
            } else {
                sec.classList.add('hidden');
            }
        });
    }

    /* ── Inner drawing-panel section visibility ─────────────────────────
     * app.js's switchSidebarForMode manages symbol-manager, line-manager,
     * and text-manager with inline display styles. It doesn't know about
     * select-panel or erase-panel. This helper overrides those inline
     * styles AFTER the mode change event so the correct section is visible.
     */
    const drawingSections = [selectPanel, symbolManager, lineManager, textManager, erasePanel];
    const toolToDrawingSection = {
        select: selectPanel,
        symbol: symbolManager,
        draw:   lineManager,
        text:   textManager,
        erase:  erasePanel,
    };

    function showDrawingSection(tool) {
        const active = toolToDrawingSection[tool] || null;
        drawingSections.forEach(sec => {
            if (!sec) return;
            sec.style.display = sec === active ? '' : 'none';
        });
    }

    /* ── Header & status bar updates ──────────────────────────────────── */
    function updateHeaders(tool) {
        const cfg = TOOL_CONFIG[tool];
        if (!cfg) return;
        const title = tx(cfg.titleKey, cfg.title);
        const hint  = tx(cfg.hintKey,  cfg.hint);
        if (panelTitle)    panelTitle.textContent = title;
        if (panelHint)     panelHint.textContent = hint;
        if (statusbarTool) statusbarTool.textContent = title;
        if (statusbarHint) statusbarHint.textContent = hint;
    }

    // Re-paint the active tool's header strings when the user toggles
    // language — without this they'd stay in whatever language was active
    // at first render.
    (function chainToolLang() {
        const prev = window.onLanguageChange;
        window.onLanguageChange = function (lang) {
            try { updateHeaders(currentTool); } catch (_) {}
            if (typeof prev === 'function') prev(lang);
        };
    })();

    /* ── Sidebar tab helper (triggers existing tab click handlers) ──── */
    function clickSidebarTab(tabName) {
        const tab = document.querySelector('.sidebar-tab[data-tab="' + tabName + '"]');
        if (tab && !tab.classList.contains('active')) {
            tab.click();
        }
    }

    /* ── Mode select helper (triggers existing change handlers) ──────── */
    function setMode(mode) {
        if (!modeSelect || modeSelect.value === mode) return;
        modeSelect.value = mode;
        modeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }

    /* ── Geo tool helper ─────────────────────────────────────────────── */
    function setGeoTool(value) {
        if (!geoToolSelect) return;
        if (geoToolSelect.value !== value) {
            geoToolSelect.value = value;
            geoToolSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }

    let warGameLoadPromise = null;
    function loadWarGameEngine() {
        if (window.AppTurnEngine && typeof window.AppTurnEngine.showHud === 'function') {
            return Promise.resolve(window.AppTurnEngine);
        }
        if (warGameLoadPromise) return warGameLoadPromise;
        warGameLoadPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'turn-engine.js?v=' + Date.now();
            script.onload = () => resolve(window.AppTurnEngine || null);
            script.onerror = () => reject(new Error('Could not load turn-engine.js'));
            document.body.appendChild(script);
        });
        return warGameLoadPromise;
    }

    /* ── Rail button state ────────────────────────────────────────────── */
    function updateRailButtons(tool) {
        document.querySelectorAll('.tool-rail-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tool === tool);
        });
    }

    /* ── Main tool switch ─────────────────────────────────────────────── */
    function switchTool(tool) {
        if (tool === 'chat') {
            const chatBtn = document.getElementById('chat-toggle-btn');
            if (chatBtn) chatBtn.click();
            return;
        }

        const cfg = TOOL_CONFIG[tool];
        if (!cfg) return;

        currentTool = tool;

        // 1. Update visual state immediately
        updateRailButtons(tool);
        updateHeaders(tool);

        if (tool === 'wargame') {
            setVisibleSections(tool);
            if (contextPanel) {
                contextPanel.style.display = '';
                contextPanel.classList.remove('is-minimized');
            }
            const peek = document.getElementById('context-panel-peek');
            if (peek) peek.classList.add('hidden');

            const showWarGameHud = () => {
                if (window.AppTurnEngine && typeof window.AppTurnEngine.showHud === 'function') {
                    window.AppTurnEngine.showHud();
                }
            };
            showWarGameHud();
            loadWarGameEngine()
                .then(engine => {
                    if (engine && typeof engine.showHud === 'function') engine.showHud();
                })
                .catch(err => console.warn('War Game engine load failed', err));
            setTimeout(showWarGameHud, 250);
            return;
        }

        // 2. Drive existing mode/tab system (may change panel visibility)
        //    This must happen BEFORE our visibility overrides.
        if (cfg.tab) {
            clickSidebarTab(cfg.tab);
        }
        if (cfg.mode) {
            setMode(cfg.mode);
        }

        // 3. Override panel visibility AFTER mode/tab changes
        //    This corrects app.js's switchSidebarForMode which doesn't know
        //    about our new panels (select-panel, erase-panel, shapes-panel, etc.)
        setVisibleSections(tool);
        if (cfg.tab === 'drawing') {
            showDrawingSection(tool);
        }

        // 4. For measure/shapes, activate the default geo tool
        //    The geo panel is kept "active" (no .hidden class) but visually
        //    hidden, so app.js's isGeoPanelActive() returns true.
        if (tool === 'measure') {
            setGeoTool('distance');
        }
        if (tool === 'shapes') {
            setGeoTool('rectangle');
        }

        // 5. Ensure context panel is visible
        if (contextPanel) contextPanel.style.display = '';
    }

    /* ── Wire tool rail clicks ────────────────────────────────────────── */
    document.querySelectorAll('.tool-rail-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            switchTool(btn.dataset.tool);
        });
    });

    window.AppToolRail = { switchTool };

    /* ── Keyboard shortcut integration ────────────────────────────────── *
     * When the existing keyboard shortcuts (M, T, F, E) change the mode,
     * we need to update the tool rail highlight to stay in sync.
     * We use requestAnimationFrame so that all synchronous code in the
     * activateXxx functions (which may click sidebar tabs, set geo tools,
     * etc.) finishes before we examine the final panel state.
     */
    if (modeSelect) {
        modeSelect.addEventListener('change', () => {
            requestAnimationFrame(syncRailFromMode);
        });
    }

    function syncRailFromMode() {
        if (!modeSelect) return;
        const mode = modeSelect.value;

        // If the geo panel is currently active (e.g. F key → freehand geo draw),
        // keep the rail on a geo tool instead of overriding to a drawing tool.
        const geoActive = geoPanel && !geoPanel.classList.contains('hidden');
        let tool;
        if (geoActive) {
            // When geo panel is shown by app.js (e.g. F key), map to shapes
            tool = (currentTool === 'measure' || currentTool === 'shapes') ? currentTool : 'shapes';
        } else {
            const modeToTool = {
                pan: 'select',
                symbol: 'symbol',
                line: 'draw',
                eraser: 'erase',
                select: 'select',
                text: 'text',
            };
            tool = modeToTool[mode];
        }

        if (tool) {
            if (tool !== currentTool) {
                currentTool = tool;
                updateRailButtons(tool);
                updateHeaders(tool);
                setVisibleSections(tool);
            }
            // Always re-apply drawing section visibility to override app.js's
            // switchSidebarForMode which may have shown symbolManager for 'pan' mode
            // even when tool-rail's active tool is 'select' or 'erase'.
            const cfg = TOOL_CONFIG[tool];
            if (cfg && cfg.tab === 'drawing') {
                showDrawingSection(tool);
            }
        }
    }

    /* ── Initialize on load ───────────────────────────────────────────── */
    // Set initial state: show Select tool, hide non-active sections
    // Also clear any inline display styles left in the HTML
    contextSections.forEach(sec => { if (sec) sec.style.display = ''; });
    setVisibleSections('select');
    showDrawingSection('select');
    updateRailButtons('select');
    updateHeaders('select');

})();
