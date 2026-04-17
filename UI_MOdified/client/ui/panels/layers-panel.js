/**
 * layers-panel.js — Entry module for the Layers tool panel.
 *
 * Enhances the static #layers-section HTML with:
 *  - Search filtering of layers/folders
 */

import { bindLayersPanelEvents } from '../controllers/layers-controller.js';

function initLayersPanel() {
    const layersSection = document.getElementById('layers-section');
    if (!layersSection) return;

    bindLayersPanelEvents();
}

// Auto-init (modules are deferred, DOM is ready)
initLayersPanel();

// Expose for non-module scripts
window.RMOOZ = window.RMOOZ || {};
window.RMOOZ.layersPanel = { initLayersPanel };
