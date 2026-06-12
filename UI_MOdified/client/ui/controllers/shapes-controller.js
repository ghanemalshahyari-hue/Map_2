/**
 * shapes-controller.js — Handles Shapes panel interactions.
 *
 * Bridges shape type selection to the existing geo-tool-select in app.js.
 * When a shape card is clicked, we programmatically set the geo tool and
 * ensure the geo tab is active so app.js's geo tool handlers work.
 *
 * The existing geo panel (with fill style, color, and shape-specific options)
 * stays in the DOM. App.js continues to read inputs from there.
 * We sync values from the shapes panel to those inputs.
 */

import { shapesState } from '../state/shapes-state.js';
import { setStatusBar } from '../utils/statusbar.js';

/* ── DOM references ───────────────────────────────────────────────── */
const shapesPanel      = document.getElementById('shapes-panel');
const shapeCards       = document.getElementById('shape-type-cards');
const hintEl           = document.getElementById('shapes-hint');
const fillStyleSelect  = document.getElementById('shapes-fill-style');
const colorGroup       = document.getElementById('shapes-color-group');

/* ── Hint text per shape ─────────────────────────────────────────── */
const HINTS = {
    rectangle:     'Click two opposite corners to draw a rectangle.',
    'circle-2pt':  'Click the center, then click the edge.',
    oval:          'Click two opposite corners to draw an oval.',
    polygon:       'Click the map to place the center.',
    freeform:      'Click to add points. Double-click to finish.',
    'semi-circle': 'Click the map to place the center.',
    'range-sector':'Click the map to place the center.',
    minefield:     'Click two opposite corners to define the minefield.',
    freehand:      'Click and drag to draw. Release to finish.',
};

/* ── Shape activation ────────────────────────────────────────────── */

function activateShape(type) {
    shapesState.type = type;

    // Update card active state (covers both basic and advanced cards)
    const cardContainer = shapesPanel || shapeCards;
    if (cardContainer) {
        cardContainer.querySelectorAll('.tool-card').forEach(card => {
            card.classList.toggle('active', card.dataset.shape === type);
        });
    }

    // Update hint
    const hint = HINTS[type] || 'Draw shape on the map.';
    if (hintEl) hintEl.textContent = hint;
    setStatusBar('Shapes', hint);

    // Bridge: set geo-tool-select to this shape
    const geoToolSelect = document.getElementById('geo-tool-select');
    if (geoToolSelect && geoToolSelect.value !== type) {
        geoToolSelect.value = type;
        geoToolSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }
}

/* ── Fill style sync ─────────────────────────────────────────────── */

function syncFillStyle() {
    const geoFillSelect = document.getElementById('geo-fill-style-select');
    if (fillStyleSelect && geoFillSelect) {
        geoFillSelect.value = fillStyleSelect.value;
        geoFillSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }
}

/* ── Color sync ──────────────────────────────────────────────────── */

function syncColor(color) {
    // Find and click the matching color button in the geo panel
    const geoColorBtn = document.querySelector('#geo-panel .geo-color-btn[data-color="' + color + '"]');
    if (geoColorBtn) {
        geoColorBtn.click();
    }
}

/* ── Public binding ──────────────────────────────────────────────── */

export function bindShapesPanelEvents() {
    // Shape card clicks — listen on the whole shapes panel so both
    // the basic cards grid and the advanced <details> section are covered.
    const clickTarget = shapesPanel || shapeCards;
    if (clickTarget) {
        clickTarget.addEventListener('click', (e) => {
            const card = e.target.closest('.tool-card');
            if (!card || !card.dataset.shape) return;
            activateShape(card.dataset.shape);
        });
    }

    // Fill style sync
    if (fillStyleSelect) {
        fillStyleSelect.addEventListener('change', syncFillStyle);
    }

    // Color button clicks
    if (colorGroup) {
        colorGroup.addEventListener('click', (e) => {
            const btn = e.target.closest('.color-btn');
            if (!btn) return;
            colorGroup.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            syncColor(btn.dataset.color);
        });
    }
}

export function activateShapesDefault() {
    activateShape(shapesState.type);
}

export function updateShapesHint() {
    const hint = HINTS[shapesState.type] || 'Draw shape on the map.';
    if (hintEl) hintEl.textContent = hint;
    setStatusBar('Shapes', hint);
}
