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

    /* ── Tool definitions ─────────────────────────────────────────────── */
    const TOOL_CONFIG = {
        select:  { mode: 'pan',    tab: 'drawing', title: 'Select',  hint: 'Click or drag on the map to select items' },
        symbol:  { mode: 'symbol', tab: 'drawing', title: 'Symbol',  hint: 'Choose a symbol, then click the map to place it' },
        draw:    { mode: 'line',   tab: 'drawing', title: 'Draw',    hint: 'Click to add points. Double-click to finish' },
        text:    { mode: 'text',   tab: 'drawing', title: 'Text',    hint: 'Enter text, then click the map to place it' },
        erase:   { mode: 'eraser', tab: 'drawing', title: 'Erase',   hint: 'Click items to erase them' },
        measure: { mode: 'pan',    tab: 'geo',     title: 'Measure', hint: 'Click points on the map to measure distance' },
        shapes:  { mode: 'pan',    tab: 'geo',     title: 'Shapes',  hint: 'Choose a shape, then click the map' },
        layers:  { mode: null,     tab: null,       title: 'Layers',  hint: 'Organize your map items' },
    };

    /* ── DOM references ───────────────────────────────────────────────── */
    const modeSelect       = document.getElementById('tool-mode');
    const geoToolSelect    = document.getElementById('geo-tool-select');
    const contextPanel     = document.getElementById('context-panel');
    const drawingPanel     = document.getElementById('drawing-panel');
    const geoPanel         = document.getElementById('geo-panel');
    const measurePanel     = document.getElementById('measure-panel');
    const shapesPanel      = document.getElementById('shapes-panel');
    const layersSection    = document.getElementById('layers-section');
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
    const contextSections = [drawingPanel, geoPanel, measurePanel, shapesPanel, layersSection];

    function setVisibleSections(tool) {
        const show = {
            select:  [drawingPanel],
            symbol:  [drawingPanel],
            draw:    [drawingPanel],
            text:    [drawingPanel],
            erase:   [drawingPanel],
            measure: [measurePanel],
            shapes:  [shapesPanel],
            layers:  [layersSection],
        };

        const visible = show[tool] || [];
        const geoToolActive = (tool === 'shapes' || tool === 'measure');

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
        if (panelTitle)    panelTitle.textContent = cfg.title;
        if (panelHint)     panelHint.textContent = cfg.hint;
        if (statusbarTool) statusbarTool.textContent = cfg.title;
        if (statusbarHint) statusbarHint.textContent = cfg.hint;
    }

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
