/**
 * erase-panel.js — Entry module for the Erase tool panel.
 *
 * Enhances the static #erase-panel HTML with:
 *  - Erase mode switching (object / area / trim)
 *  - Status bar integration
 */

import { bindErasePanelEvents, updateEraseHint } from '../controllers/erase-controller.js';

function initErasePanel() {
    const erasePanel = document.getElementById('erase-panel');
    if (!erasePanel) return;

    bindErasePanelEvents();
    updateEraseHint();
}

// Auto-init (modules are deferred, DOM is ready)
initErasePanel();

// Expose for non-module scripts
window.RMOOZ = window.RMOOZ || {};
window.RMOOZ.erasePanel = { initErasePanel };
