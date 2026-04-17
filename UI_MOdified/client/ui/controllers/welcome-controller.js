/**
 * welcome-controller.js — Welcome overlay dismissal logic.
 *
 * Shows the welcome overlay on first visit (or when localStorage flag
 * is absent). Dismisses when the user clicks "Get Started" or picks
 * a quick-start tool. If the "Don't show again" checkbox is checked,
 * sets a localStorage flag to suppress future appearances.
 */

const STORAGE_KEY = 'rmooz-welcome-dismissed';

const overlay     = document.getElementById('welcome-overlay');
const closeBtn    = document.getElementById('welcome-close-btn');
const dismissCb   = document.getElementById('welcome-dismiss-checkbox');

function shouldShow() {
    try {
        return !localStorage.getItem(STORAGE_KEY);
    } catch {
        return true; // localStorage unavailable — show anyway
    }
}

function dismiss() {
    if (!overlay) return;
    overlay.classList.add('closing');
    // Wait for fade-out animation
    setTimeout(() => {
        overlay.classList.add('hidden');
        overlay.classList.remove('closing');
    }, 250);

    if (dismissCb && dismissCb.checked) {
        try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* noop */ }
    }
}

function activateTool(toolName) {
    // Drive tool-rail.js's switchTool by clicking the rail button
    const btn = document.querySelector(`.tool-rail-btn[data-tool="${toolName}"]`);
    if (btn) btn.click();
}

export function bindWelcomeEvents() {
    if (!overlay) return;

    // Hide immediately if already dismissed
    if (!shouldShow()) {
        overlay.classList.add('hidden');
        return;
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', dismiss);
    }

    // Quick-start tool buttons
    overlay.querySelectorAll('.welcome-action-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tool = btn.dataset.welcomeTool;
            if (tool) activateTool(tool);
            dismiss();
        });
    });

    // Also close on backdrop click
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) dismiss();
    });
}
