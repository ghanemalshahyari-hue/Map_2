/**
 * draw-panel.js — Entry module for the Draw tool panel.
 *
 * Enhances the static #line-manager HTML with:
 *  - Draw sub-mode switching (path vs mission)
 *  - Status bar integration
 */

import { bindDrawPanelEvents, updateDrawHint } from '../controllers/draw-controller.js';

function initDrawPanel() {
    const lineManager = document.getElementById('line-manager');
    if (!lineManager) return;

    bindDrawPanelEvents();
    updateDrawHint();
}

// Auto-init (modules are deferred, DOM is ready)
initDrawPanel();

// Expose for non-module scripts
window.RMOOZ = window.RMOOZ || {};
window.RMOOZ.drawPanel = { initDrawPanel };
