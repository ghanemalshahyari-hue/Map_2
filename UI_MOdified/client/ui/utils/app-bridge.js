/**
 * app-bridge.js — Central bridge for new UI modules to communicate with app.js.
 *
 * app.js lives inside an IIFE and can't be imported. It watches DOM elements
 * (mode select, geo-tool-select, buttons) for changes. This bridge provides
 * a clean API that drives those DOM elements programmatically.
 *
 * Usage: import { appBridge } from '../utils/app-bridge.js';
 *        appBridge.setMode('eraser');
 */

export const appBridge = {
    /** Set the main drawing mode (pan, symbol, line, eraser, select, text) */
    setMode(mode) {
        const el = document.getElementById('tool-mode');
        if (el && el.value !== mode) {
            el.value = mode;
            el.dispatchEvent(new Event('change', { bubbles: true }));
        }
    },

    /** Set the geo tool (distance, range-circle, rectangle, freehand, etc.) */
    setGeoTool(tool) {
        const el = document.getElementById('geo-tool-select');
        if (el && el.value !== tool) {
            el.value = tool;
            el.dispatchEvent(new Event('change', { bubbles: true }));
        }
    },

    /** Click the geo sidebar tab to activate geo mode in app.js */
    activateGeoTab() {
        const tab = document.querySelector('.sidebar-tab[data-tab="geo"]');
        if (tab && !tab.classList.contains('active')) {
            tab.click();
        }
    },

    /** Click the drawing sidebar tab */
    activateDrawingTab() {
        const tab = document.querySelector('.sidebar-tab[data-tab="drawing"]');
        if (tab && !tab.classList.contains('active')) {
            tab.click();
        }
    },

    /** Click finish/cancel buttons for line drawing */
    finishLine()  { document.getElementById('finish-line-btn')?.click(); },
    cancelLine()  { document.getElementById('cancel-line-btn')?.click(); },

    /** Click finish/cancel buttons for geo polygon drawing */
    finishGeo()   { document.getElementById('finish-geo-polygon-btn')?.click(); },
    cancelGeo()   { document.getElementById('cancel-geo-polygon-btn')?.click(); },

    /** Activate area-select mode (for area erase) */
    startAreaSelect() {
        document.getElementById('select-area-header-btn')?.click();
    },

    /** Activate freehand trimmer (for stroke trim erase) */
    startFreehandTrimmer() {
        const btn = document.getElementById('geo-freehand-trimmer-btn');
        if (btn && !btn.classList.contains('active')) {
            btn.click();
        }
    },

    /** Layer operations (drive existing buttons cached by app.js) */
    addLayer()           { document.getElementById('add-layer-btn')?.click(); },
    addFolder()          { document.getElementById('add-folder-btn')?.click(); },
    openLayerTemplates() { document.getElementById('layer-templates-btn')?.click(); },
    exportLayers()       { document.getElementById('export-layers-btn')?.click(); },
    importLayers()       { document.getElementById('import-layers-btn')?.click(); },
};

// Also expose globally for non-module scripts
window.appActions = appBridge;
