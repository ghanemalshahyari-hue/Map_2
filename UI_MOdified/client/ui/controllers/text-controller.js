/**
 * text-controller.js — Handles Text panel interactions and bridges to app.js.
 *
 * Strategy: app.js opens #text-label-modal on every map click in text mode.
 * When the panel's inline input has text ready, this controller intercepts the
 * modal open, auto-fills the modal input, and auto-clicks OK — making the modal
 * invisible to the user. The text is placed instantly via app.js's own pipeline
 * (placeTextLabelAt), preserving all existing behavior.
 *
 * If the panel input is empty, the modal opens normally as a fallback.
 */

import { textState, resetTextState } from '../state/text-state.js';
import { setStatusBar } from '../utils/statusbar.js';

/* ── DOM references ───────────────────────────────────────────────── */
const panelInput   = document.getElementById('text-panel-input');
const panelHint    = document.getElementById('text-panel-hint');
const presetRow    = document.getElementById('text-panel-presets');
const modal        = document.getElementById('text-label-modal');
const modalInput   = document.getElementById('text-label-input');
const modalOkBtn   = document.getElementById('text-label-ok-btn');

/* ── Auto-place via modal interception ────────────────────────────── */

/**
 * MutationObserver on the text-label modal. When app.js opens it
 * (removes .hidden), we check if inline text is ready. If so, we
 * auto-fill the modal input and click OK on the next microtask.
 * The modal is suppressed visually via an inline style.
 */
function setupModalInterceptor() {
    if (!modal || !modalInput || !modalOkBtn) return;

    const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
            if (m.type !== 'attributes' || m.attributeName !== 'class') continue;

            const wasHidden = m.oldValue?.includes('hidden');
            const isNowVisible = !modal.classList.contains('hidden');

            if (wasHidden && isNowVisible && textState.value.trim()) {
                // Suppress modal visibility
                modal.style.visibility = 'hidden';

                // Auto-fill and confirm on next microtask
                // (showTextLabelModal has finished setting up onclick handlers by now)
                Promise.resolve().then(() => {
                    modalInput.value = textState.value;
                    modalOkBtn.click();
                    modal.style.visibility = '';
                });
            }
        }
    });

    observer.observe(modal, {
        attributes: true,
        attributeOldValue: true,
        attributeFilter: ['class'],
    });
}

/* ── Panel input & presets ────────────────────────────────────────── */

function updateHint() {
    if (!panelHint) return;

    if (textState.value.trim()) {
        textState.isPlacementActive = true;
        panelHint.textContent = 'Click on the map to place text.';
        setStatusBar('Text', 'Click on the map to place the label.');
    } else {
        textState.isPlacementActive = false;
        panelHint.textContent = 'Enter text, then click the map to place it.';
        setStatusBar('Text', 'Type text first.');
    }
}

export function bindTextPanelEvents() {
    // Inline text input
    if (panelInput) {
        panelInput.addEventListener('input', () => {
            textState.value = panelInput.value;
            updateHint();
        });
    }

    // Quick presets (set value directly)
    if (presetRow) {
        presetRow.addEventListener('click', (e) => {
            const btn = e.target.closest('.preset-btn');
            if (!btn) return;

            textState.value = btn.dataset.value;
            if (panelInput) panelInput.value = textState.value;
            textState.isPlacementActive = true;
            updateHint();
        });
    }

    // Start the modal interceptor
    setupModalInterceptor();
}

export { updateHint as updateTextHint };
