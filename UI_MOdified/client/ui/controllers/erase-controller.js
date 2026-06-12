/**
 * erase-controller.js — Handles Erase panel interactions.
 *
 * Bridges the three erase sub-modes to existing app.js behaviors:
 *  - Object erase → sets mode to 'eraser' (click-to-delete)
 *  - Area erase   → sets mode to 'select' (area select, then delete)
 *  - Stroke trim   → activates freehand geo tool + trimmer mode
 */

import { eraseState } from '../state/erase-state.js';
import { setStatusBar } from '../utils/statusbar.js';

/* ── DOM references ───────────────────────────────────────────────── */
const modeCards = document.getElementById('erase-mode-cards');
const hintEl    = document.getElementById('erase-hint');

/* ── Mode hints ──────────────────────────────────────────────────── */
const HINTS = {
    object: 'Click an item on the map to erase it.',
    area:   'Drag an area on the map to select items, then press Delete.',
    trim:   'Drag across freehand strokes to trim them.',
};

/* ── Sub-mode switching ──────────────────────────────────────────── */

function applyEraseMode(mode) {
    eraseState.mode = mode;

    // Update card active state
    if (modeCards) {
        modeCards.querySelectorAll('.tool-card').forEach(card => {
            card.classList.toggle('active', card.dataset.eraseMode === mode);
        });
    }

    // Update hint
    if (hintEl) hintEl.textContent = HINTS[mode] || '';
    setStatusBar('Erase', HINTS[mode] || '');

    // Bridge to app.js
    const modeSelect = document.getElementById('tool-mode');
    const geoToolSelect = document.getElementById('geo-tool-select');

    if (mode === 'object') {
        // Standard eraser mode — click to delete
        if (modeSelect && modeSelect.value !== 'eraser') {
            modeSelect.value = 'eraser';
            modeSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
    } else if (mode === 'area') {
        // Area select mode — drag to select, then delete
        document.getElementById('select-area-header-btn')?.click();
    } else if (mode === 'trim') {
        // Activate freehand geo tool, then enable trimmer
        // First ensure geo freehand tool is active
        if (geoToolSelect && geoToolSelect.value !== 'freehand') {
            // Switch to geo tab and freehand tool
            document.querySelector('.sidebar-tab[data-tab="geo"]')?.click();
            geoToolSelect.value = 'freehand';
            geoToolSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
        // Then click the trimmer button
        setTimeout(() => {
            const trimmerBtn = document.getElementById('geo-freehand-trimmer-btn');
            if (trimmerBtn && !trimmerBtn.classList.contains('active')) {
                trimmerBtn.click();
            }
        }, 50);
    }
}

/* ── Public binding ──────────────────────────────────────────────── */

export function bindErasePanelEvents() {
    if (modeCards) {
        modeCards.addEventListener('click', (e) => {
            const card = e.target.closest('.tool-card');
            if (!card || !card.dataset.eraseMode) return;
            applyEraseMode(card.dataset.eraseMode);
        });
    }
}

export function activateEraseDefault() {
    applyEraseMode(eraseState.mode);
}

export function updateEraseHint() {
    if (hintEl) hintEl.textContent = HINTS[eraseState.mode] || '';
    setStatusBar('Erase', HINTS[eraseState.mode] || '');
}
