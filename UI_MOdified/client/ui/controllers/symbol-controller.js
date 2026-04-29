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
const sidcCodeMirror    = document.getElementById('sidc-code-mirror');
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

    // Onboarding visibility is gated on whether the user *actually* picked a
    // symbol (from picker/quick-start/favorites), not on whether the SIDC
    // display happens to be active — toggling affiliation also activates the
    // display, which would prematurely hide the onboarding.
    const panel = document.querySelector('.symbol-panel');
    if (panel) panel.classList.toggle('no-selection', !symbolState.userPickedSymbol);

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
    // NOTE: do NOT call updateSymbolSummary() here. The summary is driven by
    // the sidc-code-display observer, and updateSymbolSummary writes back to
    // pickedSidcDisplay — which would re-fire this observer and create an
    // infinite loop (browser freeze).
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

    // Mirror the raw SIDC into the expert disclosure so power users still see it
    // even though it's hidden from the main preview card.
    if (sidcCodeMirror) sidcCodeMirror.textContent = raw || '—';

    if (!raw || raw.length < 20) return;

    const digit = raw.charAt(3);
    const affiliationMap = { '3': 'Friendly', '6': 'Hostile', '4': 'Neutral', '1': 'Unknown' };
    const affiliationMapAr = { '3': 'صديق', '6': 'عدو', '4': 'محايد', '1': 'مجهول' };
    const locale = getLocale();
    const affLabel = locale === 'ar' ? (affiliationMapAr[digit] || '') : (affiliationMap[digit] || '');

    // Affiliation pill is always rendered — it reflects the current side
    // (Friendly by default), regardless of whether a symbol was picked.
    if (affLabel) {
        const tag = document.createElement('span');
        tag.className = 'symbol-tag symbol-tag-affiliation aff-' + digit;
        tag.textContent = affLabel;
        symbolSummary.appendChild(tag);
    }

    // Friendly name in the heading is gated on a real pick — toggling
    // affiliation alone shouldn't claim a symbol has been chosen.
    if (!symbolState.userPickedSymbol) return;

    const info = resolveSidcInfo(raw);
    if (pickedSidcDisplay) {
        const friendly = info.full || (locale === 'ar' ? 'رمز محدد' : 'Symbol selected');
        if (pickedSidcDisplay.textContent !== friendly) {
            pickedSidcDisplay.textContent = friendly;
        }
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

    if (typeof window.ms === 'undefined' || !window.ms.Symbol) {
        // milsymbol library not loaded — log once so this doesn't ship as a silent failure.
        console.warn('[symbol-panel] milsymbol library not available; Quick Start tile rendered without icon', { sidc });
    } else {
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
            } else {
                console.warn('[symbol-panel] milsymbol reports invalid SIDC for Quick Start tile', { sidc, label: fullLabel });
            }
        } catch (err) {
            console.warn('[symbol-panel] milsymbol render threw for Quick Start tile', { sidc, err });
        }
    }

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
        symbolState.userPickedSymbol = true;
        if (typeof window.__APP_SIDC_PICKER_SET === 'function') {
            window.__APP_SIDC_PICKER_SET(sidc);
        }
        updatePlacementHint();
    });
    return btn;
}

// Translations for the small set of default seeded fallback labels.
// `resolveSidcInfo` is the primary source of localized labels (via the SIDC
// standard data); this map only kicks in when that data hasn't loaded yet
// and we'd otherwise fall back to the English label baked into seeds.
const SEEDED_LABEL_AR = {
    'Friendly Infantry': 'مشاة صديقة',
    'Hostile Infantry':  'مشاة معادية',
    'Unknown Infantry':  'مشاة غير محددة',
};

function localizeSeededLabel(label) {
    if (!label) return label;
    if (getLocale() !== 'ar') return label;
    return SEEDED_LABEL_AR[label] || label;
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
        const seededLocalized = localizeSeededLabel(fav.label);
        const shortLabel = info.short || (seededLocalized || fav.sidc.substring(0, 10) + '…');
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
    // Always strip any prior CTA before re-evaluating.
    const oldCta = quickStartGrid.querySelector('.quick-start-search-cta');
    if (oldCta) oldCta.remove();

    if (!q) {
        buttons.forEach(btn => { btn.style.display = ''; });
        return;
    }

    let visible = 0;
    buttons.forEach(btn => {
        const searchText = btn.dataset.searchText || '';
        const match = searchText.includes(q);
        btn.style.display = match ? '' : 'none';
        if (match) visible++;
    });

    if (visible === 0) {
        const cta = document.createElement('button');
        cta.type = 'button';
        cta.className = 'quick-start-search-cta';
        const locale = getLocale();
        const tpl = locale === 'ar'
            ? 'لا توجد نتائج لـ "%s" في المحفوظة. افتح المكتبة ←'
            : 'No match for "%s" in saved. Open Library →';
        cta.textContent = tpl.replace('%s', query.trim());
        cta.addEventListener('click', () => {
            if (openPickerBtn) openPickerBtn.click();
        });
        quickStartGrid.appendChild(cta);
    }
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

    // Initial pass: makes sure the no-selection / onboarding state is correct
    // on first open, before the user has interacted with anything.
    updatePlacementHint();
}

// Exposed so app.js can mark a real symbol-pick action (favorites, picker
// modal, manual SIDC) — distinct from affiliation toggling, which also
// updates the SIDC but should not count as "user picked a symbol".
window.__SYMBOL_MARK_PICKED = function () {
    symbolState.userPickedSymbol = true;
    updatePlacementHint();
};

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
