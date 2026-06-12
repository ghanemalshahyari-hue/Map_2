/**
 * utility-panel.js — Entry module for the utility/settings panel.
 *
 * Wires up open/close behavior for the slide-out settings panel.
 */

import { bindUtilityPanelEvents } from '../controllers/utility-controller.js';

function initUtilityPanel() {
    const panel = document.getElementById('utility-panel');
    if (!panel) return;

    bindUtilityPanelEvents();
}

// Auto-init
initUtilityPanel();

// Expose for non-module scripts
window.RMOOZ = window.RMOOZ || {};
window.RMOOZ.utilityPanel = { initUtilityPanel };
