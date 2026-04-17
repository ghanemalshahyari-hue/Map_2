/**
 * measure-controller.js — Handles Measure panel interactions.
 *
 * Bridges measure type selection to the existing geo-tool-select in app.js.
 * Distance, range-circle, and range-sector are the measurement tools.
 */

import { measureState } from '../state/measure-state.js';
import { setStatusBar } from '../utils/statusbar.js';

/* ── DOM references ───────────────────────────────────────────────── */
const measureCards = document.getElementById('measure-type-cards');
const hintEl       = document.getElementById('measure-hint');

/* ── Hint text per measure type ──────────────────────────────────── */
const HINTS = {
    distance:       'Click points on the map to measure distance.',
    'range-circle': 'Click the map to place the center of the radius circle.',
    'range-sector': 'Click the map to place the center of the direction cone.',
};

/* ── Measure type activation ─────────────────────────────────────── */

function activateMeasureType(type) {
    measureState.type = type;

    // Update card active state
    if (measureCards) {
        measureCards.querySelectorAll('.tool-card').forEach(card => {
            card.classList.toggle('active', card.dataset.measure === type);
        });
    }

    // Update hint
    const hint = HINTS[type] || 'Measure on the map.';
    if (hintEl) hintEl.textContent = hint;
    setStatusBar('Measure', hint);

    // Bridge: set geo-tool-select to this measure type
    const geoToolSelect = document.getElementById('geo-tool-select');
    if (geoToolSelect && geoToolSelect.value !== type) {
        geoToolSelect.value = type;
        geoToolSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }
}

/* ── Public binding ──────────────────────────────────────────────── */

export function bindMeasurePanelEvents() {
    if (measureCards) {
        measureCards.addEventListener('click', (e) => {
            const card = e.target.closest('.tool-card');
            if (!card || !card.dataset.measure) return;
            activateMeasureType(card.dataset.measure);
        });
    }
}

export function activateMeasureDefault() {
    activateMeasureType(measureState.type);
}

export function updateMeasureHint() {
    const hint = HINTS[measureState.type] || 'Measure on the map.';
    if (hintEl) hintEl.textContent = hint;
    setStatusBar('Measure', hint);
}
