/**
 * measure-panel.js — Entry module for the Measure tool panel.
 *
 * Enhances the static #measure-panel HTML with:
 *  - Measure type selection via cards
 *  - Status bar integration
 */

import { bindMeasurePanelEvents, updateMeasureHint } from '../controllers/measure-controller.js';

function initMeasurePanel() {
    const measurePanel = document.getElementById('measure-panel');
    if (!measurePanel) return;

    bindMeasurePanelEvents();
    updateMeasureHint();
}

// Auto-init (modules are deferred, DOM is ready)
initMeasurePanel();

// Expose for non-module scripts
window.RMOOZ = window.RMOOZ || {};
window.RMOOZ.measurePanel = { initMeasurePanel };
