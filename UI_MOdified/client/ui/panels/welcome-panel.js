/**
 * welcome-panel.js — Entry module for the welcome overlay.
 *
 * Shows a first-time welcome card with quick-start tool buttons.
 * Supports "don't show again" via localStorage.
 */

import { bindWelcomeEvents } from '../controllers/welcome-controller.js';

function initWelcome() {
    bindWelcomeEvents();
}

// Auto-init
initWelcome();

// Expose for non-module scripts
window.RMOOZ = window.RMOOZ || {};
window.RMOOZ.welcome = { initWelcome };
