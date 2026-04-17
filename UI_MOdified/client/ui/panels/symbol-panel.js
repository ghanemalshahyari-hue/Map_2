/**
 * symbol-panel.js — Entry module for the Symbol tool panel.
 *
 * Enhances the static #symbol-manager HTML with:
 *  - Affiliation segmented control behavior
 *  - Dynamic placement hints
 *  - Status bar integration
 *
 * Loaded as <script type="module"> so it runs after app.js has initialised.
 * Does NOT use innerHTML or recreate elements — app.js's cached references
 * continue to work.
 */

import { bindSymbolPanelEvents, updatePlacementHint } from '../controllers/symbol-controller.js';
import { setStatusBar } from '../utils/statusbar.js';

function initSymbolPanel() {
    const symbolManager = document.getElementById('symbol-manager');
    if (!symbolManager) return;

    // Bind new interactive behaviors
    bindSymbolPanelEvents();

    // Set initial hint state
    updatePlacementHint();
}

// Auto-init (modules are deferred, so DOM is ready)
initSymbolPanel();

// Expose for potential use by tool-rail or other non-module scripts
window.RMOOZ = window.RMOOZ || {};
window.RMOOZ.symbolPanel = { initSymbolPanel };
