/**
 * statusbar.js — Reusable status bar utility.
 * Updates the map status bar with the current tool name and next-step hint.
 */

export function setStatusBar(toolName, nextStep) {
    const toolEl = document.getElementById('statusbar-tool-display');
    const hintEl = document.getElementById('statusbar-hint-display');
    if (toolEl) toolEl.textContent = toolName;
    if (hintEl) hintEl.textContent = nextStep;
}
