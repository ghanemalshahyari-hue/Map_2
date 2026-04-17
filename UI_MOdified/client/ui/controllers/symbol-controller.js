/**
 * symbol-controller.js — Handles Symbol panel interactions and bridges to app.js.
 *
 * Strategy: app.js caches DOM references at load time and owns all symbol
 * placement logic. This controller enhances the static HTML with new behavior
 * (affiliation segmented control, placement hints, search, quick-start,
 * more-options toggle, step indicator) and bridges to app.js through:
 *   - The shared DOM elements (same IDs app.js reads/writes)
 *   - window.__APP_SIDC_PICKER_SET(sidc) exposed by app.js
 *   - Events dispatched on the hidden #tool-mode select
 */

import { symbolState } from '../state/symbol-state.js';
import { setStatusBar } from '../utils/statusbar.js';

/* ── DOM references ───────────────────────────────────────────────── */
const sidcCodeDisplay   = document.getElementById('sidc-code-display');
const pickedSidcDisplay = document.getElementById('picked-sidc-display');
const placementHint     = document.getElementById('symbol-placement-hint');
const affiliationGroup  = document.getElementById('symbol-affiliation-group');
const searchInput       = document.getElementById('symbol-search-input');
const quickStartGrid    = document.getElementById('quick-start-grid');
const moreOptionsToggle = document.getElementById('symbol-more-options-toggle');
const extraOptions      = document.getElementById('symbol-extra-options');
const stepIndicator     = document.getElementById('symbol-step-indicator');
const symbolSummary     = document.getElementById('symbol-summary');
const openPickerBtn     = document.getElementById('open-sidc-picker');
const topFavoritesList  = document.getElementById('top-favorites-list');

function getLocale() {
    return document.documentElement.getAttribute('lang') || 'en';
}

/* ── Favorites helpers ──────────────────────────────────────────── */

function loadFavorites() {
    try {
        const raw = localStorage.getItem('nato-sidc-favorites');
        if (!raw) return [];
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr)) return [];
        return arr.filter(f => f && f.sidc);
    } catch { return []; }
}

/**
 * Resolve a human-readable label from a 20-digit SIDC using the
 * extracted SIDC_PICKER_STANDARD data.
 * Returns { full, short } where full is the complete hierarchy and
 * short is a compact version for the grid.
 */
function resolveSidcInfo(sidc) {
    const empty = { full: '', short: '' };
    const s = String(sidc || '').replace(/[^0-9]/g, '');
    if (s.length < 20) return empty;
    const symbolSet = s.substr(4, 2);
    const code = s.substr(10, 2) + s.substr(12, 2) + s.substr(14, 2);
    const std = window.SIDC_PICKER_STANDARD && window.SIDC_PICKER_STANDARD['APP6'];
    const icons = std && std[symbolSet] && std[symbolSet]['main icon'];
    if (!icons) return empty;
    let found = icons.find(i => i.code === code);
    if (!found) found = icons.find(i => i.code === code.substr(0, 4) + '00');
    if (!found) found = icons.find(i => i.code === code.substr(0, 2) + '0000');
    if (!found) return empty;

    const locale = getLocale();
    const tr = (text) => {
        if (locale === 'ar' && window.sidcPickerArTrans) {
            return window.sidcPickerArTrans[text] || text;
        }
        return text;
    };

    const entity      = found.entity          ? tr(found.entity) : '';
    const entityType   = found['entity type']  ? tr(found['entity type']) : '';
    const entitySub    = found['entity subtype'] ? tr(found['entity subtype']) : '';

    // Full label (for tooltip): entity — entity type — entity subtype
    const fullParts = [entity, entityType, entitySub].filter(Boolean);
    const full = fullParts.join(' — ');

    // Short label (for grid): entity type first, then entity subtype on second line
    // If only entity exists (no type/subtype), use entity
    let short = entityType || entity || '';
    if (entitySub) short += '\n' + entitySub;

    return { full, short };
}

/* ── Affiliation ──────────────────────────────────────────────────── */

/**
 * Change the standard-identity digit (index 3) in the current SIDC
 * and push it back through app.js's global hook.
 */
function applyAffiliation(newDigit) {
    symbolState.affiliation = newDigit;

    const raw = sidcCodeDisplay?.textContent?.replace(/^SIDC:\s*/i, '').trim();
    if (!raw || raw.length < 20) return;

    const updated = raw.substring(0, 3) + newDigit + raw.substring(4);

    if (typeof window.__APP_SIDC_PICKER_SET === 'function') {
        window.__APP_SIDC_PICKER_SET(updated);
    }
    updateStepIndicator();
}

/* ── Placement hint updates ───────────────────────────────────────── */

function updatePlacementHint() {
    if (!placementHint) return;

    const hasSidc = pickedSidcDisplay &&
        pickedSidcDisplay.classList.contains('active');

    const hintSpan = placementHint.querySelector('span') || placementHint;

    if (hasSidc) {
        symbolState.isPlacementActive = true;
        const text = getLocale() === 'ar'
            ? 'انقر على الخريطة لوضع هذا الرمز.'
            : 'Click on the map to place this symbol.';
        hintSpan.textContent = text;
        setStatusBar('Symbol', text);
    } else {
        symbolState.isPlacementActive = false;
        const text = getLocale() === 'ar'
            ? 'اختر رمزًا للبدء.'
            : 'Choose a symbol to begin.';
        hintSpan.textContent = text;
        setStatusBar('Symbol', text);
    }
    updateStepIndicator();
    updateSymbolSummary();
}

/* ── Step indicator ──────────────────────────────────────────────── */

function updateStepIndicator() {
    if (!stepIndicator) return;
    const dots = stepIndicator.querySelectorAll('.step-dot');
    if (dots.length < 4) return;

    const hasSidc = pickedSidcDisplay && pickedSidcDisplay.classList.contains('active');
    let activeStep = 1;
    if (hasSidc) activeStep = 4;

    dots.forEach((dot, idx) => {
        const stepNum = idx + 1;
        dot.classList.toggle('active', stepNum === activeStep);
        dot.classList.toggle('done', stepNum < activeStep);
    });
}

/* ── Symbol summary ──────────────────────────────────────────────── */

function updateSymbolSummary() {
    if (!symbolSummary) return;
    symbolSummary.innerHTML = '';

    const raw = sidcCodeDisplay?.textContent?.replace(/^SIDC:\s*/i, '').trim();
    if (!raw || raw.length < 20) return;

    const digit = raw.charAt(3);
    const affiliationMap = { '3': 'Friendly', '6': 'Hostile', '4': 'Neutral', '1': 'Unknown' };
    const affiliationMapAr = { '3': 'صديق', '6': 'عدو', '4': 'محايد', '1': 'مجهول' };
    const locale = getLocale();
    const affLabel = locale === 'ar' ? (affiliationMapAr[digit] || '') : (affiliationMap[digit] || '');
    if (affLabel) {
        const tag = document.createElement('span');
        tag.className = 'symbol-tag';
        tag.textContent = affLabel;
        symbolSummary.appendChild(tag);
    }

    const info = resolveSidcInfo(raw);
    if (info.full) {
        const tag = document.createElement('span');
        tag.className = 'symbol-tag';
        tag.textContent = info.full;
        symbolSummary.appendChild(tag);
    }
}

/* ── Quick Start grid (always from saved symbols) ────────────────── */

function createQuickStartButton(sidc, shortLabel, fullLabel) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'quick-start-btn';
    btn.title = fullLabel || shortLabel;
    btn.dataset.searchText = ((fullLabel || '') + ' ' + (shortLabel || '')).toLowerCase();
    btn.dataset.sidc = sidc;

    try {
        const sym = new ms.Symbol(sidc, { size: 34, simpleStatusModifier: true });
        if (sym.isValid()) {
            const thumb = document.createElement('div');
            thumb.className = 'qs-symbol-thumb';
            const svgEl = sym.asDOM();
            svgEl.style.maxWidth = '28px';
            svgEl.style.maxHeight = '28px';
            thumb.appendChild(svgEl);
            btn.appendChild(thumb);
        }
    } catch (_) { /* milsymbol not loaded yet */ }

    // Short label may contain \n for two-line display
    const lines = (shortLabel || '').split('\n');
    const labelWrap = document.createElement('span');
    labelWrap.className = 'quick-start-label-text';
    lines.forEach((line, i) => {
        if (i > 0) labelWrap.appendChild(document.createElement('br'));
        labelWrap.appendChild(document.createTextNode(line));
    });
    btn.appendChild(labelWrap);

    btn.addEventListener('click', () => {
        if (typeof window.__APP_SIDC_PICKER_SET === 'function') {
            window.__APP_SIDC_PICKER_SET(sidc);
        }
    });
    return btn;
}

function populateQuickStartGrid() {
    if (!quickStartGrid) return;
    quickStartGrid.innerHTML = '';

    const favs = loadFavorites();
    if (favs.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'quick-start-empty';
        empty.textContent = getLocale() === 'ar'
            ? 'لا توجد رموز محفوظة بعد. أضف رموزاً من المكتبة.'
            : 'No saved symbols yet. Add from the library.';
        quickStartGrid.appendChild(empty);
        return;
    }

    favs.forEach(fav => {
        const info = resolveSidcInfo(fav.sidc);
        const shortLabel = info.short || (fav.label || fav.sidc.substring(0, 10) + '…');
        const fullLabel  = info.full  || shortLabel;
        const btn = createQuickStartButton(fav.sidc, shortLabel, fullLabel);
        quickStartGrid.appendChild(btn);
    });
}

/* ── Search ──────────────────────────────────────────────────────── */

function handleSearch(query) {
    if (!quickStartGrid) return;
    const q = (query || '').trim().toLowerCase();

    const buttons = quickStartGrid.querySelectorAll('.quick-start-btn');
    if (!q) {
        buttons.forEach(btn => { btn.style.display = ''; });
        return;
    }

    buttons.forEach(btn => {
        const searchText = btn.dataset.searchText || '';
        btn.style.display = searchText.includes(q) ? '' : 'none';
    });
}

/* ── More options toggle ─────────────────────────────────────────── */

function toggleMoreOptions() {
    if (!extraOptions || !moreOptionsToggle) return;
    const hidden = extraOptions.style.display === 'none';
    extraOptions.style.display = hidden ? '' : 'none';
    moreOptionsToggle.classList.toggle('expanded', hidden);
    const svg = moreOptionsToggle.querySelector('svg');
    if (svg) svg.style.transform = hidden ? 'rotate(180deg)' : '';
}

/* ── Event binding ────────────────────────────────────────────────── */

export function bindSymbolPanelEvents() {
    // Affiliation segmented control
    if (affiliationGroup) {
        affiliationGroup.addEventListener('click', (e) => {
            const btn = e.target.closest('.segment-btn');
            if (!btn) return;

            affiliationGroup.querySelectorAll('.segment-btn').forEach(b =>
                b.classList.remove('active')
            );
            btn.classList.add('active');

            applyAffiliation(btn.dataset.affiliation);
        });
    }

    // More options toggle
    if (moreOptionsToggle) {
        moreOptionsToggle.addEventListener('click', toggleMoreOptions);
    }

    // Search input
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            handleSearch(searchInput.value);
        });
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (openPickerBtn) openPickerBtn.click();
            }
        });
    }

    // Quick Start — always from saved symbols
    populateQuickStartGrid();

    // Watch for app.js updating the picked-sidc display
    if (pickedSidcDisplay) {
        const observer = new MutationObserver(() => {
            updatePlacementHint();
            syncAffiliationFromSidc();
        });
        observer.observe(pickedSidcDisplay, {
            childList: true,
            characterData: true,
            subtree: true,
        });
    }

    // Watch sidc-code-display for changes
    if (sidcCodeDisplay) {
        const observer = new MutationObserver(() => {
            updateSymbolSummary();
            updateStepIndicator();
        });
        observer.observe(sidcCodeDisplay, {
            childList: true,
            characterData: true,
            subtree: true,
        });
    }

    // Watch favorites list — auto-refresh quick-start when user adds/removes favorites
    if (topFavoritesList) {
        const favObserver = new MutationObserver(() => {
            populateQuickStartGrid();
        });
        favObserver.observe(topFavoritesList, { childList: true });
    }
}

/**
 * When app.js sets a new SIDC (e.g. from picker), read the affiliation
 * digit and update the segmented control to match.
 */
function syncAffiliationFromSidc() {
    if (!affiliationGroup) return;

    const raw = sidcCodeDisplay?.textContent?.replace(/^SIDC:\s*/i, '').trim();
    if (!raw || raw.length < 20) return;

    const digit = raw.charAt(3);
    symbolState.affiliation = digit;

    affiliationGroup.querySelectorAll('.segment-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.affiliation === digit);
    });
}

export { updatePlacementHint };
