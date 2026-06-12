/**
 * text-panel.js — Entry module for the Text tool panel.
 *
 * Enhances the static #text-manager HTML with:
 *  - Inline text input (bypasses the modal when filled)
 *  - Quick preset buttons
 *  - Dynamic placement hints
 *  - Status bar integration
 *
 * The modal (#text-label-modal) is kept in the DOM as a fallback when
 * the inline input is empty. The modal interception makes placement
 * feel instant when text is pre-typed.
 */

import { bindTextPanelEvents, updateTextHint } from '../controllers/text-controller.js';
import { setStatusBar } from '../utils/statusbar.js';

function initTextPanel() {
    const textManager = document.getElementById('text-manager');
    if (!textManager) return;

    bindTextPanelEvents();
    updateTextHint();
}

// Auto-init (modules are deferred, DOM is ready)
initTextPanel();

// Expose for non-module scripts
window.RMOOZ = window.RMOOZ || {};
window.RMOOZ.textPanel = { initTextPanel };
