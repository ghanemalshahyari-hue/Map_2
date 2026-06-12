/**
 * select-controller.js — Handles Select panel interactions.
 *
 * Strategy: app.js manages selection state internally and updates
 * #selection-controls (count text, button visibility). This controller
 * observes #selection-count for text changes and mirrors the count
 * into the panel's own display so users see feedback even when the
 * floating toolbar is off-screen.
 */

import { selectState } from '../state/select-state.js';
import { setStatusBar } from '../utils/statusbar.js';

/* ── DOM references ───────────────────────────────────────────────── */
const selectionCountEl  = document.getElementById('selection-count');
const panelCountDisplay = document.getElementById('select-panel-count');

/* ── Count sync via MutationObserver ─────────────────────────────── */

/**
 * Watches #selection-count for text content changes (app.js writes
 * the translated count string there). We parse the number out and
 * update both the panel display and state.
 */
function setupCountSync() {
    if (!selectionCountEl || !panelCountDisplay) return;

    const observer = new MutationObserver(() => {
        const text = selectionCountEl.textContent || '';
        // Extract number from strings like "3 selected" or "تم تحديد 3"
        const match = text.match(/\d+/);
        const count = match ? parseInt(match[0], 10) : 0;

        selectState.count = count;

        if (count > 0) {
            panelCountDisplay.textContent = window.t('selection-count', count);
            panelCountDisplay.classList.add('has-selection');
            setStatusBar(window.t('select-statusbar-title'), window.t('selection-statusbar', count));
        } else {
            panelCountDisplay.textContent = window.t('select-panel-no-items');
            panelCountDisplay.classList.remove('has-selection');
            setStatusBar(window.t('select-statusbar-title'), window.t('select-statusbar-hint'));
        }
    });

    observer.observe(selectionCountEl, {
        childList: true,
        characterData: true,
        subtree: true,
    });
}

/* ── Hint update ─────────────────────────────────────────────────── */

export function updateSelectHint() {
    if (!panelCountDisplay) return;
    if (selectState.count > 0) {
        const c = selectState.count;
        panelCountDisplay.textContent = window.t('selection-count', c);
        panelCountDisplay.classList.add('has-selection');
    } else {
        panelCountDisplay.textContent = window.t('select-panel-no-items');
        panelCountDisplay.classList.remove('has-selection');
    }
}

/* ── Public binding ──────────────────────────────────────────────── */

export function bindSelectPanelEvents() {
    setupCountSync();
}
