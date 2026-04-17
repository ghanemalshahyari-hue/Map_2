/**
 * select-panel.js — Entry module for the Select tool panel.
 *
 * Enhances the static #select-panel HTML with:
 *  - Selection count sync from app.js
 *  - Status bar integration
 */

import { bindSelectPanelEvents, updateSelectHint } from '../controllers/select-controller.js';

function initSelectPanel() {
    const selectPanel = document.getElementById('select-panel');
    if (!selectPanel) return;

    bindSelectPanelEvents();
    updateSelectHint();
}

// Auto-init (modules are deferred, DOM is ready)
initSelectPanel();

// Expose for non-module scripts
window.RMOOZ = window.RMOOZ || {};
window.RMOOZ.selectPanel = { initSelectPanel };
