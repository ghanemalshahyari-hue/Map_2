/**
 * draw-controller.js — Handles Draw panel interactions.
 *
 * Manages the draw sub-mode (path vs mission) and shows/hides
 * the relevant controls within #line-manager. The actual drawing
 * logic stays in app.js — we only toggle UI visibility here.
 */

import { drawState } from '../state/draw-state.js';
import { setStatusBar } from '../utils/statusbar.js';

/* ── DOM references ───────────────────────────────────────────────── */
const modeCards      = document.getElementById('draw-mode-cards');
const pathControls   = document.getElementById('draw-path-controls');
const tmgSection     = document.getElementById('draw-tmg-section');
const lineManager    = document.getElementById('line-manager');

/* ── Sub-mode switching ──────────────────────────────────────────── */

function applyDrawMode(mode) {
    drawState.mode = mode;

    // Update card active state
    if (modeCards) {
        modeCards.querySelectorAll('.draw-mode-card').forEach(card => {
            card.classList.toggle('active', card.dataset.drawMode === mode);
        });
    }

    // Show/hide sections
    if (pathControls) pathControls.style.display = mode === 'path' ? '' : 'none';
    if (tmgSection)   tmgSection.style.display   = mode === 'mission' ? '' : 'none';

    // Update status bar
    if (mode === 'path') {
        setStatusBar('Draw', 'Click to add points. Double-click to finish.');
    } else {
        setStatusBar('Draw', 'Select a mission graphic, then click the map.');
    }
}

/* ── TMG affiliation sync ────────────────────────────────────────── *
 * The new .tmg-affiliation-btn buttons mirror the .line-color-btn
 * buttons in #draw-path-controls.  app.js's getLineColor() reads
 * from .line-color-btn.active, so we must keep them in sync.
 * We also call syncTmgPreviewColor() (via the line-color-btn click)
 * so the TMG grid SVG previews update to the chosen affiliation color.
 */
function syncTmgAffiliation(color) {
    if (!lineManager) return;
    // Find the matching line-color-btn and click it to trigger app.js handlers
    const target = lineManager.querySelector('.line-color-btn[data-color="' + color + '"]');
    if (target && !target.classList.contains('active')) {
        target.click();
    }
}

function syncTmgAffiliationButtons() {
    if (!tmgSection) return;
    const btns = tmgSection.querySelectorAll('.tmg-affiliation-btn');
    btns.forEach(btn => {
        btn.addEventListener('click', () => {
            btns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            syncTmgAffiliation(btn.dataset.color);
        });
    });
}

/* Keep TMG affiliation buttons in sync when path-side buttons change */
function watchPathAffiliationChanges() {
    if (!lineManager || !tmgSection) return;
    const pathBtns = lineManager.querySelectorAll('#draw-path-controls .line-color-btn');
    const tmgBtns  = tmgSection.querySelectorAll('.tmg-affiliation-btn');
    pathBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const color = btn.dataset.color;
            tmgBtns.forEach(b => b.classList.toggle('active', b.dataset.color === color));
        });
    });
}

/* ── Public binding ──────────────────────────────────────────────── */

export function bindDrawPanelEvents() {
    // Mode card clicks
    if (modeCards) {
        modeCards.addEventListener('click', (e) => {
            const card = e.target.closest('.draw-mode-card');
            if (!card) return;
            applyDrawMode(card.dataset.drawMode);
        });
    }

    // TMG affiliation toggle
    syncTmgAffiliationButtons();
    watchPathAffiliationChanges();

    // Position Unit — opens the ORBAT bottom dock so the user can drag units onto the map.
    // We always OPEN (not toggle): the button is an action, not a panel toggle, and
    // toggling caused the bar to disappear if the dock was already showing from an
    // earlier session or had been hidden by map-hide-panels' click-on-map handler.
    // Also lazy-init() the dock against the map so the drag-from-tree → drop-on-map
    // path is wired up — without init(), the map never registers as a drop target.
    const positionBtn = document.getElementById('position-unit-btn');
    if (positionBtn) {
        positionBtn.addEventListener('click', () => {
            const dock = window.AppUnitsOrbatDock;
            if (!dock) return;
            try { if (window.map && typeof dock.init === 'function') dock.init(window.map); } catch (_) {}
            dock.open?.();
        });
    }

    // Apply initial mode
    applyDrawMode(drawState.mode);
}

export function updateDrawHint() {
    if (drawState.mode === 'path') {
        setStatusBar('Draw', 'Click to add points. Double-click to finish.');
    } else {
        setStatusBar('Draw', 'Select a mission graphic, then click the map.');
    }
}
