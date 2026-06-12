/**
 * clip-panel.js — Entry module for the Clip tool section in the Shapes panel.
 * Delegates wiring to clip-controller.js.
 */

import { bindClipPanelEvents } from '../controllers/clip-controller.js';

function initClipPanel() {
    const section = document.getElementById('clip-tool-section');
    if (!section) return;
    bindClipPanelEvents();
}

initClipPanel();

window.RMOOZ = window.RMOOZ || {};
window.RMOOZ.clipPanel = { initClipPanel };
