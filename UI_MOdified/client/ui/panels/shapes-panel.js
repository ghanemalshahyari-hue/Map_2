/**
 * shapes-panel.js — Entry module for the Shapes tool panel.
 *
 * Enhances the static #shapes-panel HTML with:
 *  - Shape type selection via cards
 *  - Fill style and color sync to geo panel
 *  - Status bar integration
 */

import { bindShapesPanelEvents, updateShapesHint } from '../controllers/shapes-controller.js';

function initShapesPanel() {
    const shapesPanel = document.getElementById('shapes-panel');
    if (!shapesPanel) return;

    bindShapesPanelEvents();
    updateShapesHint();
}

// Auto-init (modules are deferred, DOM is ready)
initShapesPanel();

// Expose for non-module scripts
window.RMOOZ = window.RMOOZ || {};
window.RMOOZ.shapesPanel = { initShapesPanel };
