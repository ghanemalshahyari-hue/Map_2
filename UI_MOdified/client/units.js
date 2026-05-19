/**
 * FILE: units.js
 * Hierarchy Rules Engine:
 *   Army → Force → Brigade → Battalion → Company
 * Level is ALWAYS auto-determined from the selected parent.
 * User never picks Level manually in create mode.
 */
(function () {
    'use strict';

    const LEVELS = [
        { value: 0, label: 'Army' },
        { value: 1, label: 'Force' },
        { value: 2, label: 'Brigade' },
        { value: 3, label: 'Battalion' },
        { value: 4, label: 'Company' },
    ];

    const PREFIXES = ['ARMY', 'FRC', 'BDE', 'BN', 'CO'];

    // ── Symbol / SIDC mapping tables ────────────────────────────────
    // APP-6D echelon codes per hierarchy level
    const ECHELON_BY_LEVEL = { 0: '23', 1: '22', 2: '18', 3: '16', 4: '15' };
    // Standard identity digit (position 3 of 20-digit SIDC)
    const IDENTITY_BY_SIDE = { friendly: '3', hostile: '6', neutral: '4', unknown: '1' };
    // Symbol set (positions 4-5)
    const SET_BY_DOMAIN   = { Land: '10', Air: '01', Naval: '30', Joint: '10', Support: '10', Special: '15' };
    // Entity code (positions 10-15) per Land branch
    const ENTITY_BY_BRANCH = {
        Infantry:   '121100',
        Armor:      '120500',
        Artillery:  '130300',
        AirDefense: '131500',
        Engineers:  '121000',
        Recon:      '121300',
        Signal:     '121400',
        Medical:    '140600',
        Logistics:  '141000',
        HQ:         '110000',
    };
    // Default entity suggestion pool per domain (used when no branch is picked)
    const ENTITIES_BY_DOMAIN = {
        Land:    ['110000', '121100', '120500', '130300', '121000', '121300'],
        Air:     ['110200', '110300', '110100', '120000', '140000', '110000'],
        Naval:   ['120000', '130000', '140000', '120100', '150000', '110000'],
        Joint:   ['110000', '121100', '120500', '130300', '110200', '120000'],
        Support: ['141000', '140600', '121400', '121000', '110000', '141200'],
    };

    // Reverse lookup: given an entity code, find the branch name (only for Land set)
    function branchFromEntity(entity) {
        for (const [name, code] of Object.entries(ENTITY_BY_BRANCH)) {
            if (code === entity) return name;
        }
        return null;
    }

    function domainFromSet(set) {
        for (const [name, code] of Object.entries(SET_BY_DOMAIN)) {
            if (code === set) return name;
        }
        return null;
    }

    function buildSidcFromFields({ side, domain, level, entity }) {
        const identity = IDENTITY_BY_SIDE[side] || '3';
        const set      = SET_BY_DOMAIN[domain]  || '10';
        const echelon  = ECHELON_BY_LEVEL[level] ?? '00';
        const ent      = entity || '000000';
        // version(10) + context(0) + identity + set + status(0) + hqtf(0) + echelon(2) + entity(6) + mod1(00) + mod2(00)
        return '10' + '0' + identity + set + '0' + '0' + echelon + ent + '00' + '00';
    }

    function sidcEntityShort(sidc) {
        const s = String(sidc || '').replace(/\D/g, '');
        if (s.length < 20) return '';
        const setCode = s.substr(4, 2);
        const code = s.substr(10, 2) + s.substr(12, 2) + s.substr(14, 2);
        const std  = window.SIDC_PICKER_STANDARD?.APP6;
        const list = std?.[setCode]?.['main icon'];
        if (!list || !list.length) return '';
        let found = list.find(e => e.code === code);
        if (!found) found = list.find(e => e.code === code.substr(0, 4) + '00');
        if (!found) found = list.find(e => e.code === code.substr(0, 2) + '0000');
        if (!found) return '';
        const raw = found['entity subtype'] || found['entity type'] || found.entity || '';
        return trEntityName(raw);
    }

    function byId(id) { return document.getElementById(id); }

    function escapeHtml(s) {
        return String(s ?? '').replace(/[&<>"']/g, c =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
    }

    async function apiJson(url, opts = {}) {
        const res = await fetch(url, {
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            ...opts,
        });
        const txt = await res.text();
        let json = null;
        try { json = txt ? JSON.parse(txt) : null; } catch {}
        if (!res.ok) {
            const err = new Error(json?.error || txt || `${res.status} ${res.statusText}`);
            err.status = res.status;
            throw err;
        }
        return json;
    }

    function findNodeInRoots(roots, id) {
        const stack = [...(roots || [])];
        while (stack.length) {
            const n = stack.pop();
            if (!n) continue;
            if (n.id === id) return n;
            if (n.children?.length) stack.push(...n.children);
        }
        return null;
    }

    function flattenTree(roots, collapsedSet = new Set()) {
        const out = [];
        (function walk(nodes, depth) {
            for (const n of nodes || []) {
                const hasChildren = !!(n.children?.length);
                out.push({ ...n, _depth: depth, _hasChildren: hasChildren, _childCount: n.children?.length || 0 });
                if (hasChildren && !collapsedSet.has(n.id)) walk(n.children, depth + 1);
            }
        })(roots || [], 0);
        return out;
    }

    function computeBreadcrumb(units, unitId) {
        const path = [];
        let id = unitId;
        const seen = new Set();
        while (id) {
            if (seen.has(id)) break;
            seen.add(id);
            const u = units.find(x => x.id === id);
            if (!u) break;
            path.unshift(u);
            id = u.parent_id || null;
        }
        return path;
    }

    function randCode(level) {
        const prefix = PREFIXES[level] ?? 'U';
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let s = '';
        for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
        return `${prefix}-${s}`;
    }

    const LEVEL_I18N_KEYS = ['units-level-army', 'units-level-force', 'units-level-brigade', 'units-level-battalion', 'units-level-company'];
    const LEVEL_I18N_KEYS_P = ['units-level-army-p', 'units-level-force-p', 'units-level-brigade-p', 'units-level-battalion-p', 'units-level-company-p'];

    function levelLabel(lvl) {
        const key = LEVEL_I18N_KEYS[lvl];
        if (key && typeof window.t === 'function') return window.t(key);
        return LEVELS.find(l => l.value === lvl)?.label ?? `L${lvl}`;
    }

    function levelLabelPlural(lvl) {
        const key = LEVEL_I18N_KEYS_P[lvl];
        if (key && typeof window.t === 'function') return window.t(key);
        return levelLabel(lvl) + 's';
    }

    function sideLabelShort(side) {
        const key = `units-side-${side}-short`;
        if (typeof window.t === 'function') {
            const tr = window.t(key);
            if (tr && tr !== key) return tr;
        }
        return (side || 'friendly').charAt(0).toUpperCase() + (side || 'friendly').slice(1);
    }

    function tr(key, fallback) {
        if (typeof window.t === 'function') {
            const v = window.t(key);
            if (v && v !== key) return v;
        }
        return fallback != null ? fallback : key;
    }

    function isArabicLocale() {
        return typeof window.getCurrentLang === 'function' && window.getCurrentLang() === 'ar';
    }

    function trEntityName(name) {
        if (!name) return '';
        if (!isArabicLocale()) return name;
        const dict = window.sidcPickerArTrans;
        if (dict && dict[name]) return dict[name];
        return name;
    }

    function init() {
        const modal    = byId('units-modal');
        const backdrop = byId('units-modal-backdrop');
        const closeBtn = byId('units-modal-close');
        const treeEl   = byId('units-tree');
        const searchInput = byId('units-search-input');
        const refreshBtn  = byId('units-refresh-btn');
        const includeDeletedCb = byId('units-include-deleted');
        const railBtn  = document.querySelector('.tool-rail-btn[data-tool="units"]');
        if (!modal || !treeEl || !railBtn) return;

        // Context bar
        // Identity elements — these now live inside the edit panel's symbol
        // banner (the single, prominent "selected unit card"). The IDs are
        // preserved so updateCtxBar() keeps populating them in place.
        const ctxBreadcrumb= byId('units-ctx-breadcrumb');
        const ctxLvlBadge  = byId('units-ctx-lvl-badge');
        const ctxSelCode   = byId('units-ctx-sel-code');
        const ctxChildCount  = byId('units-ctx-child-count');
        const ctxSideBadge   = byId('units-ctx-side-badge');
        const placeBtn       = byId('units-place-btn');

        // Side selectors
        const sideBtnsEl     = byId('units-side-btns');
        const editSideBtnsEl = byId('units-edit-side-btns');

        // Main panel
        const mainPanel       = byId('units-main-panel');
        const creatingBadge   = byId('units-creating-badge');
        const creatingUnder   = byId('units-creating-under');
        const domainRow       = byId('units-domain-row');
        const domainBtns      = byId('units-domain-btns');
        const branchRow       = byId('units-branch-row');
        const branchBtns      = byId('units-branch-btns');
        const qaNameEl        = byId('units-qa-name');
        const qaCodeEl        = byId('units-qa-code');
        const qaSidcEl        = byId('units-qa-sidc');
        const quickSetupEl    = byId('units-quick-setup');
        const qaErrorEl       = byId('units-qa-error');
        const createBtn       = byId('units-create-btn');
        const createAddBtn    = byId('units-create-and-add-btn');
        const createPlaceBtn  = byId('units-create-and-place-btn');

        // Standalone placement panel (sibling of the units modal)
        const placementPanelEl       = byId('units-placement-panel');
        const placementPanelStatusEl = byId('units-placement-panel-status');
        const placementPanelSymbolEl = byId('units-placement-panel-symbol');
        const placementPanelNameEl   = byId('units-placement-panel-name');
        const placementPanelLvlEl    = byId('units-placement-panel-lvl');
        const placementPanelSideEl   = byId('units-placement-panel-side');
        const placementPanelCodeEl   = byId('units-placement-panel-code');
        const placementPanelParentEl     = byId('units-placement-panel-parent');
        const placementPanelParentNameEl = byId('units-placement-panel-parent-name');
        const placementContinuousEl  = byId('units-placement-continuous');
        const placementCancelBtn     = byId('units-placement-cancel-btn');
        const placementBackBtn       = byId('units-placement-back-btn');
        const placementQueueEl       = byId('units-placement-panel-queue');
        const placementQueueCountEl  = byId('units-placement-panel-queue-count');
        const placementQueueEmptyEl  = byId('units-placement-panel-queue-empty');

        // Symbol assignment section
        const symbolSection   = byId('units-symbol-section');
        const symbolPreviewEl = byId('units-symbol-preview');
        const symbolNameEl    = byId('units-symbol-name');
        const symbolSidcEl    = byId('units-symbol-sidc');
        const symbolClearBtn  = byId('units-symbol-clear-btn');
        const symbolChipsEl   = byId('units-symbol-chips');
        const symbolPickerBtn = byId('units-symbol-picker-btn');
        const generateSection = byId('units-generate-section');
        const genToggle       = byId('units-gen-toggle');
        const genForm         = byId('units-gen-form');
        const genCount        = byId('units-gen-count');
        const genPrefix       = byId('units-gen-prefix');
        const genErrorEl      = byId('units-gen-error');
        const genBtn          = byId('units-gen-btn');
        const noChildrenEl    = byId('units-no-children');

        // Edit panel
        const editPanel      = byId('units-edit-panel');
        const editBackBtn    = byId('units-edit-back-btn');
        const editNameEl     = byId('units-edit-name');
        const editCodeEl     = byId('units-edit-code');
        const editTypeEl     = byId('units-edit-type');
        const editSidcEl     = byId('units-edit-sidc');
        const editLevelDisp  = byId('units-edit-level-display');
        const editParentEl   = byId('units-edit-parent');
        const editErrorEl    = byId('units-edit-error');
        const saveBtn        = byId('units-save-btn');
        const deleteBtn      = byId('units-delete-btn');
        const restoreBtn     = byId('units-restore-btn');
        const placementRow   = byId('units-edit-placement-row');
        const unplaceBtn     = byId('units-edit-unplace-btn');
        // Symbol banner at the top of the edit panel
        const editSymbolPreviewEl = byId('units-edit-symbol-preview');
        const editSymbolMetaName  = byId('units-edit-symbol-meta-name');
        const editSymbolMetaSidc  = byId('units-edit-symbol-meta-sidc');
        const editSymbolPickBtn   = byId('units-edit-symbol-pick-btn');
        // Inline save confirmation
        const editConfirmEl       = byId('units-edit-confirm');
        const editConfirmListEl   = byId('units-edit-confirm-list');
        const editConfirmYesBtn   = byId('units-edit-confirm-yes');
        const editConfirmNoBtn    = byId('units-edit-confirm-cancel');
        // "Add child" action on the edit panel + back button on create panel
        const editAddChildBtn     = byId('units-edit-add-child-btn');
        const editAddChildLabel   = editAddChildBtn?.querySelector('[data-i18n="units-edit-add-child-label"]');
        const createBackRow       = byId('units-create-back-row');
        const createBackBtn       = byId('units-create-back-btn');
        const createBackName      = byId('units-create-back-name');

        const SIDES = [
            { value: 'friendly', label: 'Friendly' },
            { value: 'hostile',  label: 'Hostile'  },
            { value: 'neutral',  label: 'Neutral'  },
            { value: 'unknown',  label: 'Unknown'  },
        ];

        let state     = { roots: [], units: [], selectedId: null };

        // Sequential, meaningful auto-codes (e.g. ARMY-01, BDE-03) instead of
        // random gibberish like ARMY-RYJ2. `extra` is for batch creates that
        // pre-allocate codes before state.units refreshes (loop index).
        function nextCode(level, extra = 0) {
            const prefix = PREFIXES[level] ?? 'U';
            try {
                const re = new RegExp('^' + prefix + '-(\\d+)$');
                let max = 0;
                for (const u of state.units || []) {
                    const m = re.exec(u.code || '');
                    if (m) {
                        const n = parseInt(m[1], 10);
                        if (Number.isFinite(n) && n > max) max = n;
                    }
                }
                const next = max + 1 + extra;
                const padded = next < 100 ? String(next).padStart(2, '0') : String(next);
                return `${prefix}-${padded}`;
            } catch (_) {
                return randCode(level);
            }
        }
        let collapsed = new Set();
        // True while the standalone placement panel is visible and the main
        // modal is parked. Used to gate ESC/backdrop/close so they act on the
        // placement rather than closing the entire units UI.
        let inPlacement        = false;
        let currentPlacingUnit = null;
        let filterSide = null; // null = show all; 'friendly'|'hostile'|'neutral'|'unknown' = filter
        let selectedDomain = null; // 'Land' | 'Air' | 'Naval' | 'Joint' | 'Support'
        let selectedBranch = null; // 'Infantry' | 'Armor' | ... (ENTITY_BY_BRANCH keys)
        let selectedSidc   = null; // 20-digit SIDC when user explicitly picks from chip/picker/manual
        let selectedSide   = 'friendly'; // for create form
        let editSelectedSide = 'friendly'; // for edit panel
        let codeCheckTimer = null;
        let editCodeCheckTimer = null;
        let codeAvailable = true;
        let editCodeAvailable = true;

        // ── Visibility helpers ─────────────────────────────────────────────────
        function show(el, display = '')  { if (el) el.style.display = display || ''; }
        function hide(el)                { if (el) el.style.display = 'none'; }
        function showFlex(el)            { if (el) { el.style.display = 'flex'; } }

        // ── Side helpers ───────────────────────────────────────────────────────
        function setSideUI(container, sideValue) {
            if (!container) return;
            container.querySelectorAll('.units-side-btn').forEach(b => {
                b.classList.toggle('active', b.getAttribute('data-side') === sideValue);
            });
        }

        // ── Context bar ────────────────────────────────────────────────────────
        function isPlaced(unit) {
            if (!unit) return false;
            return unit.placed_at != null || unit.placedAt != null || (unit.lat != null && unit.lng != null);
        }

        function updateCtxBar() {
            // Identity targets are inside the edit panel's symbol banner —
            // they only matter when a unit is selected (and therefore the
            // edit panel is visible). When nothing is selected the welcome
            // panel is showing instead, so there's nothing to update.
            const u = getSelected();
            if (!u) return;
            const lbl = levelLabel(u.level);
            if (ctxLvlBadge) { ctxLvlBadge.textContent = lbl; ctxLvlBadge.className = `units-tree-level units-tree-level-${u.level}`; }
            const side = u.side || 'friendly';
            if (ctxSideBadge) { ctxSideBadge.textContent = sideLabelShort(side); ctxSideBadge.className = `units-side-badge units-side-${side}`; }
            if (ctxSelCode)   ctxSelCode.textContent  = u.code || '';
            const childCount = state.roots ? countDirectChildren(u.id) : 0;
            if (ctxChildCount) {
                ctxChildCount.textContent = childCount > 0
                    ? `${childCount} ${childCount !== 1 ? levelLabelPlural(u.level + 1) : levelLabel(u.level + 1)}`
                    : '';
            }
            if (ctxBreadcrumb) {
                const path = computeBreadcrumb(state.units, u.id);
                ctxBreadcrumb.innerHTML = path.length > 1
                    ? path.slice(0, -1).map(p => `<span class="units-bc-item">${escapeHtml(p.name)}</span>`).join('<span class="units-bc-sep">›</span>') + '<span class="units-bc-sep">›</span>'
                    : '';
            }
            if (placeBtn) {
                const placed = isPlaced(u);
                placeBtn.textContent = placed ? tr('units-place-btn-replace', '\u{1F4CD} Re-place')
                                              : tr('units-place-btn',         '\u{1F4CD} Place on map');
                placeBtn.title = placed ? tr('units-place-tooltip-replace', 'Click on the map to move this unit to a new position')
                                        : tr('units-place-tooltip',         'Click on the map to place this unit');
            }
        }

        function countDirectChildren(parentId) {
            return state.units.filter(u => u.parent_id === parentId && !u.deleted_at).length;
        }

        // ── Main panel ─────────────────────────────────────────────────────────
        function getCreateLevel() {
            const u = getSelected();
            return u ? u.level + 1 : 0;
        }

        function updateMainPanel() {
            const u   = getSelected();
            const lvl = getCreateLevel();

            // Company selected — no children
            if (u && u.level >= 4) {
                show(noChildrenEl, 'flex');
                hide(mainPanel.querySelector('.units-creating-card'));
                hide(domainRow);
                hide(branchRow);
                hide(symbolSection);
                hide(quickSetupEl);
                hide(generateSection);
                if (createBtn) createBtn.style.display = 'none';
                if (createAddBtn) createAddBtn.style.display = 'none';
                return;
            }

            hide(noChildrenEl);
            if (createBtn) createBtn.style.display = '';
            if (createAddBtn) createAddBtn.style.display = '';
            show(symbolSection);

            // Creating indicator — show full parent chain so the commander
            // sees exactly where in the hierarchy they're inserting (Recognition
            // over recall: NN/g heuristic #6).
            const lbl = levelLabel(lvl);
            if (creatingBadge) { creatingBadge.textContent = lbl; creatingBadge.className = `units-tree-level units-tree-level-${lvl}`; }
            if (creatingUnder) {
                if (u) {
                    const path = computeBreadcrumb(state.units, u.id);
                    const sep  = ` <span class="units-bc-sep">›</span> `;
                    const chain = path.map(p => `<span class="units-bc-item">${escapeHtml(p.name)}</span>`).join(sep);
                    const underWord = tr('units-creating-under-word', 'under');
                    creatingUnder.innerHTML = `<span class="units-creating-under-word">${escapeHtml(underWord)}</span> ${chain}`;
                } else {
                    creatingUnder.innerHTML = '';
                }
            }
            if (createBtn)     createBtn.textContent    = tr('units-create-label', '+ Create {0}').replace('{0}', lbl);

            // Show creating card
            const creatingCard = mainPanel ? mainPanel.querySelector('.units-creating-card') : null;
            if (creatingCard) creatingCard.style.display = '';

            // Domain row: shown for Force (1) and below. Army (0) skips domain.
            if (lvl >= 1) show(domainRow, 'flex'); else hide(domainRow);

            // Branch row: shown for Brigade+ (lvl 2-4) when domain is Land/Joint/Support.
            // Air/Naval are themselves branch-like, so no separate branch picker there.
            const branchable = selectedDomain === 'Land' || selectedDomain === 'Joint' || selectedDomain === 'Support';
            if (lvl >= 2 && branchable) show(branchRow, 'flex'); else hide(branchRow);

            // Quick Setup (Army only — shown when creating Army, i.e. no parent)
            if (lvl === 0) show(quickSetupEl); else hide(quickSetupEl);

            // Side selector: only visible when creating a root Army; children always inherit
            const sideRow = byId('units-side-row');
            const sideInheritedRow = byId('units-side-inherited');
            const sideBadge = byId('units-side-inherited-badge');
            if (lvl === 0) {
                if (sideRow) sideRow.style.display = '';
                if (sideInheritedRow) sideInheritedRow.style.display = 'none';
            } else {
                if (sideRow) sideRow.style.display = 'none';
                if (sideInheritedRow) sideInheritedRow.style.display = '';
                const inherited = u?.side || 'friendly';
                if (sideBadge) {
                    sideBadge.textContent = sideLabelShort(inherited);
                    sideBadge.className = `units-side-badge units-side-${inherited}`;
                }
            }

            // Generate children (when a unit is selected and it's not Company)
            if (u && u.level < 4) {
                show(generateSection);
                if (genPrefix && !genPrefix.value) genPrefix.value = levelLabel(lvl);
            } else {
                hide(generateSection);
            }

            // Fresh code
            if (qaCodeEl && !(qaCodeEl.value || '').trim()) qaCodeEl.value = nextCode(lvl);

            // Refresh symbol preview + chips whenever the form context changes
            updateSymbolPreview();
        }

        // ── Symbol preview + suggested chips ─────────────────────────────────────
        function getFormContext() {
            const u   = getSelected();
            const lvl = getCreateLevel();
            const side = (lvl === 0) ? selectedSide : (u?.side || 'friendly');
            // For Army (lvl 0) there is no domain; default to Land so preview still renders.
            const domain = selectedDomain || (lvl === 0 ? 'Land' : null);
            return { u, lvl, side, domain };
        }

        function currentDefaultEntity(ctx) {
            if (selectedBranch && ENTITY_BY_BRANCH[selectedBranch]) return ENTITY_BY_BRANCH[selectedBranch];
            const domain = ctx.domain || 'Land';
            return (ENTITIES_BY_DOMAIN[domain] || ENTITIES_BY_DOMAIN.Land)[0];
        }

        function currentSidc() {
            if (selectedSidc) return selectedSidc;
            const ctx = getFormContext();
            return buildSidcFromFields({ side: ctx.side, domain: ctx.domain || 'Land', level: ctx.lvl, entity: currentDefaultEntity(ctx) });
        }

        function renderSymbolInto(el, sidc, size) {
            if (!el) return;
            el.innerHTML = '';
            try {
                if (window.ms && typeof window.ms.Symbol === 'function') {
                    const sym = new window.ms.Symbol(sidc, { size, simpleStatusModifier: true });
                    if (sym.isValid()) {
                        el.appendChild(sym.asDOM());
                        return;
                    }
                }
            } catch (_) { /* fall through */ }
            el.innerHTML = '<div class="units-symbol-preview-placeholder">—</div>';
        }

        function updateSymbolPreview() {
            if (!symbolPreviewEl) return;
            const sidc = currentSidc();
            renderSymbolInto(symbolPreviewEl, sidc, 52);
            const label = sidcEntityShort(sidc);
            const branchKey = selectedBranch ? `units-branch-${selectedBranch.toLowerCase()}` : null;
            const domainKey = selectedDomain ? `units-domain-${selectedDomain.toLowerCase()}` : null;
            const fallback  = branchKey ? tr(branchKey, selectedBranch)
                            : domainKey ? tr(domainKey, selectedDomain)
                            : tr('units-symbol-default-name', 'Auto');
            if (symbolNameEl) symbolNameEl.textContent = label || fallback;
            if (symbolSidcEl) {
                const autoTag = tr('units-symbol-auto', '(auto)');
                symbolSidcEl.textContent = selectedSidc ? `SIDC: ${sidc}` : `SIDC: ${sidc} ${autoTag}`;
            }
            if (symbolClearBtn) symbolClearBtn.style.display = selectedSidc ? '' : 'none';
            if (qaSidcEl) qaSidcEl.value = selectedSidc || '';
            renderSuggestedChips();
        }

        function renderSuggestedChips() {
            if (!symbolChipsEl) return;
            const ctx = getFormContext();
            const domain = ctx.domain || 'Land';

            const entities = [];
            if (selectedBranch && ENTITY_BY_BRANCH[selectedBranch]) {
                entities.push(ENTITY_BY_BRANCH[selectedBranch]);
            }
            for (const e of (ENTITIES_BY_DOMAIN[domain] || ENTITIES_BY_DOMAIN.Land)) {
                if (!entities.includes(e)) entities.push(e);
                if (entities.length >= 6) break;
            }

            const activeSidc = currentSidc();
            symbolChipsEl.innerHTML = '';
            for (const entity of entities) {
                const sidc = buildSidcFromFields({ side: ctx.side, domain, level: ctx.lvl, entity });
                const isActive = sidc === activeSidc;
                const chip = document.createElement('button');
                chip.type = 'button';
                chip.className = 'units-symbol-chip' + (isActive ? ' active' : '');
                chip.setAttribute('data-sidc', sidc);
                const thumb = document.createElement('span');
                thumb.className = 'units-symbol-chip-thumb';
                renderSymbolInto(thumb, sidc, 28);
                chip.appendChild(thumb);
                const lbl = document.createElement('span');
                lbl.className = 'units-symbol-chip-label';
                lbl.textContent = sidcEntityShort(sidc) || tr('units-symbol-default-name', 'Unit');
                chip.appendChild(lbl);
                symbolChipsEl.appendChild(chip);
            }
        }

        // ── SIDC picker iframe integration ───────────────────────────────────────
        function openSymbolPicker() {
            const pickerModal = byId('sidc-picker-modal');
            const pickerFrame = byId('sidc-picker-frame');
            if (!pickerModal || !pickerFrame) return;
            const ctx    = getFormContext();
            const domain = ctx.domain || 'Land';
            const side   = IDENTITY_BY_SIDE[ctx.side] || '3';
            const set    = SET_BY_DOMAIN[domain] || '10';
            const ech    = ECHELON_BY_LEVEL[ctx.lvl] ?? '00';
            const ent    = currentDefaultEntity(ctx);
            let lang = 'en';
            try {
                if (typeof window.getCurrentLang === 'function') {
                    const l = window.getCurrentLang();
                    if (l === 'ar' || l === 'en') lang = l;
                }
            } catch (_) { /* ignore */ }
            const params = new URLSearchParams({
                lang,
                target: 'units',
                side, domain: set, echelon: ech, entity: ent,
            });
            window.__APP_UNITS_CAPTURING_SIDC = true;
            window.__APP_UNITS_CAPTURING_TARGET = 'create';
            pickerFrame.src = `../vendor/sidc-picker/simple.html?${params.toString()}`;
            pickerModal.classList.remove('hidden');
            pickerModal.setAttribute('aria-hidden', 'false');
        }

        // Same as openSymbolPicker but for the edit panel — pre-fills the
        // picker with the unit's current SIDC and routes the chosen result
        // back into the edit form's SIDC field instead of the create form.
        function openEditSymbolPicker() {
            const u = getSelected();
            if (!u) return;
            const pickerModal = byId('sidc-picker-modal');
            const pickerFrame = byId('sidc-picker-frame');
            if (!pickerModal || !pickerFrame) return;
            const cur = (editSidcEl?.value || '').trim();
            const side = IDENTITY_BY_SIDE[editSelectedSide || 'friendly'] || '3';
            let set = '10', ent = '000000';
            const ech = ECHELON_BY_LEVEL[u.level] ?? '00';
            if (cur.length >= 20) {
                set = cur.substr(4, 2);
                ent = cur.substr(10, 6);
            }
            let lang = 'en';
            try {
                if (typeof window.getCurrentLang === 'function') {
                    const l = window.getCurrentLang();
                    if (l === 'ar' || l === 'en') lang = l;
                }
            } catch (_) { /* ignore */ }
            const params = new URLSearchParams({
                lang, target: 'units',
                side, domain: set, echelon: ech, entity: ent,
            });
            window.__APP_UNITS_CAPTURING_SIDC = true;
            window.__APP_UNITS_CAPTURING_TARGET = 'edit';
            pickerFrame.src = `../vendor/sidc-picker/simple.html?${params.toString()}`;
            pickerModal.classList.remove('hidden');
            pickerModal.setAttribute('aria-hidden', 'false');
        }

        function closeSymbolPicker() {
            const pickerModal = byId('sidc-picker-modal');
            const pickerFrame = byId('sidc-picker-frame');
            if (pickerModal) {
                pickerModal.classList.add('hidden');
                pickerModal.setAttribute('aria-hidden', 'true');
            }
            window.__APP_UNITS_CAPTURING_SIDC = false;
            // Restore the default picker URL so the toolbar's Symbol panel doesn't open
            // pre-filtered with the last units-form state.
            if (pickerFrame) {
                let lang = 'en';
                try {
                    if (typeof window.getCurrentLang === 'function') {
                        const l = window.getCurrentLang();
                        if (l === 'ar' || l === 'en') lang = l;
                    }
                } catch (_) { /* ignore */ }
                pickerFrame.src = `../vendor/sidc-picker/simple.html?lang=${lang}`;
            }
        }

        // Message listener: capture SIDC from picker when we asked for it
        window.addEventListener('message', (ev) => {
            const d = ev?.data;
            if (!d || d.type !== 'sidc-picker:sidc') return;
            if (!window.__APP_UNITS_CAPTURING_SIDC) return;
            const raw = String(d.sidc || '').replace(/\D/g, '');
            if (raw.length < 20) return;
            const target = window.__APP_UNITS_CAPTURING_TARGET || 'create';
            // Edit-panel pick: drop the chosen SIDC straight into the edit
            // form's SIDC field and refresh the symbol preview. We don't
            // touch the create-form state vars at all.
            if (target === 'edit') {
                if (editSidcEl) editSidcEl.value = raw.slice(0, 20);
                updateEditSymbolBanner();
                setEditEnabled();
                closeSymbolPicker();
                return;
            }
            selectedSidc = raw.slice(0, 20);
            // Reflect entity back into the branch selector if it's a recognized land branch
            const setCode = selectedSidc.substr(4, 2);
            const entity  = selectedSidc.substr(10, 6);
            if (setCode === '10') {
                const maybeBranch = branchFromEntity(entity);
                if (maybeBranch) {
                    selectedBranch = maybeBranch;
                    setBranchUI(selectedBranch);
                }
            }
            // Reflect domain back from symbol set
            const maybeDomain = domainFromSet(setCode);
            if (maybeDomain && maybeDomain !== selectedDomain) {
                // Only adopt if it's meaningful for current level (don't override Army)
                const lvl = getCreateLevel();
                if (lvl >= 1) {
                    selectedDomain = maybeDomain;
                    setDomainUI(selectedDomain);
                    // Re-run panel logic to show/hide Branch row based on new domain
                    updateMainPanel();
                }
            }
            closeSymbolPicker();
            updateSymbolPreview();
        });

        function setDomainUI(domain) {
            domainBtns?.querySelectorAll('.units-domain-btn').forEach(b => {
                b.classList.toggle('active', b.getAttribute('data-domain') === domain);
            });
        }
        function setBranchUI(branch) {
            branchBtns?.querySelectorAll('.units-domain-btn').forEach(b => {
                b.classList.toggle('active', b.getAttribute('data-branch') === branch);
            });
        }

        function resetMainForm() {
            if (qaNameEl) qaNameEl.value = '';
            if (qaCodeEl) qaCodeEl.value = '';
            if (qaSidcEl) qaSidcEl.value = '';
            selectedDomain = null;
            selectedBranch = null;
            selectedSidc   = null;
            setDomainUI(null);
            setBranchUI(null);
            // Inherit side from the selected parent so children follow their army's affiliation
            const parentUnit = getSelected();
            selectedSide = (parentUnit?.side) || 'friendly';
            setSideUI(sideBtnsEl, selectedSide);
            showQaError('');
            codeAvailable = true;
            updateMainPanel();
            setCreateEnabled();
        }

        // ── Edit panel ─────────────────────────────────────────────────────────
        function openEditPanel() {
            const u = getSelected();
            if (!u) return;
            setHasSelection(true);
            hide(mainPanel);
            if (editPanel) { editPanel.style.display = 'flex'; editPanel.style.flexDirection = 'column'; }
            if (editNameEl)  editNameEl.value  = u.name || '';
            if (editCodeEl)  editCodeEl.value  = u.code || '';
            if (editTypeEl) {
                // The dropdown lists known Force Types and Specialties. If the
                // unit was created with a legacy free-text value (e.g. older
                // data), inject it as a one-off option so the select still
                // round-trips that value cleanly instead of dropping to "None".
                const t = u.unit_type || '';
                editTypeEl.value = t;
                if (t && editTypeEl.value !== t) {
                    const opt = document.createElement('option');
                    opt.value = t;
                    opt.textContent = t + ' (legacy)';
                    editTypeEl.appendChild(opt);
                    editTypeEl.value = t;
                }
            }
            if (editSidcEl)  editSidcEl.value  = u.sidc || '';
            editSelectedSide = u.side || 'friendly';
            setSideUI(editSideBtnsEl, editSelectedSide);
            if (editLevelDisp) editLevelDisp.textContent = levelLabel(u.level);
            renderEditParents(u.id, u.level);
            if (editParentEl) editParentEl.value = u.parent_id || '';
            showEditError('');
            editCodeAvailable = true;
            if (placementRow) placementRow.style.display = isPlaced(u) ? '' : 'none';
            updateEditSymbolBanner();
            updateAddChildButton(u);
            hideSaveConfirm();
            setEditEnabled();
        }

        // Render the symbol preview at the top of the edit panel using whatever
        // SIDC is currently in the editor (so manual SIDC edits update live).
        function updateEditSymbolBanner() {
            const sidc = (editSidcEl?.value || '').trim();
            if (editSymbolPreviewEl) {
                if (sidc) renderSymbolInto(editSymbolPreviewEl, sidc, 76);
                else editSymbolPreviewEl.innerHTML = '<span class="units-edit-symbol-empty">&mdash;</span>';
            }
            if (editSymbolMetaName) editSymbolMetaName.textContent = (editNameEl?.value || '').trim() || '—';
            if (editSymbolMetaSidc) editSymbolMetaSidc.textContent = sidc || '—';
        }

        // The "+ Add child" button on the edit panel labels itself with the
        // child level — "Add Force", "Add Brigade", etc. Hidden for Companies
        // (level 4) which can't have children.
        function updateAddChildButton(u) {
            if (!editAddChildBtn) return;
            const section = byId('units-edit-add-child-section');
            if (u.level >= 4) { if (section) section.style.display = 'none'; return; }
            if (section) section.style.display = '';
            const childLabel = levelLabel(u.level + 1);
            if (editAddChildLabel) editAddChildLabel.textContent = `${tr('units-edit-add-child-label-prefix', 'Add')} ${childLabel}`;
        }

        // Show the create-child form below the selected parent, with a back
        // button at the top so the user can return to the edit view.
        function openCreateChildPanel() {
            const u = getSelected();
            if (!u) return;
            hide(editPanel);
            show(mainPanel);
            resetMainForm();
            if (createBackRow) createBackRow.style.display = '';
            if (createBackName) createBackName.textContent = u.name || '';
            qaNameEl?.focus();
        }

        function closeEditPanel() {
            hide(editPanel);
            show(mainPanel);
        }

        // ── Save confirmation ─────────────────────────────────────────────────
        // Compare what's in the edit form to the original unit and return a
        // human-readable list of changes. Used to ask "are you sure?" before
        // committing edits — protects against accidental name/SIDC edits.
        function computeEditChanges(u) {
            const out = [];
            const newName = (editNameEl?.value || '').trim();
            const newCode = (editCodeEl?.value || '').trim();
            const newSidc = (editSidcEl?.value || '').trim();
            const newType = (editTypeEl?.value || '').trim();
            const newSide = editSelectedSide || 'friendly';
            const newParent = (editParentEl?.value || '').trim() || null;
            const oldSide = u.side || 'friendly';
            const oldParent = u.parent_id || null;
            if (newName !== (u.name || '')) out.push({ label: tr('units-name', 'Name'), from: u.name || '—', to: newName || '—' });
            if (newCode !== (u.code || '')) out.push({ label: tr('units-code', 'Code'), from: u.code || '—', to: newCode || '—' });
            if (newSidc !== (u.sidc || '')) out.push({ label: tr('units-sidc', 'SIDC'), from: u.sidc || '—', to: newSidc || '—' });
            if (newType !== (u.unit_type || '')) out.push({ label: tr('units-edit-type-label', 'Domain / Branch'), from: u.unit_type || '—', to: newType || '—' });
            if (newSide !== oldSide) out.push({ label: tr('units-edit-section-side', 'Side / Affiliation'), from: sideLabelShort(oldSide), to: sideLabelShort(newSide) });
            if (newParent !== oldParent) {
                const parentName = (id) => id ? (state.units.find(x => x.id === id)?.name || id) : tr('units-edit-no-parent', '(top level)');
                out.push({ label: tr('units-edit-move-under', 'Move under'), from: parentName(oldParent), to: parentName(newParent) });
            }
            return out;
        }

        function showSaveConfirm(changes) {
            if (!editConfirmEl || !editConfirmListEl) return;
            editConfirmListEl.innerHTML = changes.map(c =>
                `<li><span class="units-edit-confirm-field">${escapeHtml(c.label)}:</span> <span class="units-edit-confirm-from">${escapeHtml(String(c.from))}</span> <span class="units-edit-confirm-arrow">&rarr;</span> <span class="units-edit-confirm-to">${escapeHtml(String(c.to))}</span></li>`
            ).join('');
            editConfirmEl.style.display = '';
            if (saveBtn) saveBtn.style.display = 'none';
            // Bring the confirmation into view so the user actually sees what
            // they're being asked to confirm — important if they clicked Save
            // from a scrolled position where the card would otherwise be off
            // screen, hidden behind the sticky banner.
            try { editConfirmEl.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) { /* older browsers */ }
        }

        function hideSaveConfirm() {
            if (editConfirmEl) editConfirmEl.style.display = 'none';
            if (saveBtn) saveBtn.style.display = '';
        }

        // ── Standalone placement panel ────────────────────────────────────────
        // The centred Units modal is "parked" (display:none via .units-modal-parked)
        // while the dedicated placement panel is visible. Every form field, the
        // tree selection, and the edit panel content survive the round-trip
        // untouched — we never call refresh/reset while parking.
        function setPlacementStatus(key, fallback, placed = false) {
            if (!placementPanelStatusEl) return;
            placementPanelStatusEl.textContent = tr(key, fallback);
            placementPanelStatusEl.classList.toggle('is-placed', !!placed);
        }

        function populatePlacementCard(unit) {
            if (!placementPanelEl) return;
            const sidc = unit.sidc || null;
            if (placementPanelSymbolEl) {
                if (sidc) renderSymbolInto(placementPanelSymbolEl, sidc, 84);
                else placementPanelSymbolEl.innerHTML = '';
            }
            if (placementPanelNameEl) placementPanelNameEl.textContent = unit.name || '—';
            if (placementPanelLvlEl) {
                placementPanelLvlEl.textContent = levelLabel(unit.level);
                placementPanelLvlEl.className = `units-tree-level units-tree-level-${unit.level}`;
            }
            const side = unit.side || 'friendly';
            if (placementPanelSideEl) {
                placementPanelSideEl.textContent = sideLabelShort(side);
                placementPanelSideEl.className = `units-side-badge units-side-${side}`;
            }
            if (placementPanelCodeEl) placementPanelCodeEl.textContent = unit.code || '';
            const parent = unit.parent_id ? state.units.find(x => x.id === unit.parent_id) : null;
            if (placementPanelParentEl) {
                if (parent) {
                    placementPanelParentEl.style.display = '';
                    if (placementPanelParentNameEl) placementPanelParentNameEl.textContent = parent.name || '';
                } else {
                    placementPanelParentEl.style.display = 'none';
                }
            }
        }

        // Build the list of "other unplaced units" shown under the action
        // buttons. Clicking a row re-arms placement for that unit — the user
        // never has to leave the panel to work through many placements.
        function renderPlacementQueue() {
            if (!placementQueueEl) return;
            const currentId = currentPlacingUnit?.id || null;
            const rows = (state.units || [])
                .filter(u => !u.deleted_at && !isPlaced(u) && u.id !== currentId)
                .sort((a, b) => (a.level - b.level) || String(a.name).localeCompare(String(b.name)));

            if (placementQueueCountEl) placementQueueCountEl.textContent = rows.length ? String(rows.length) : '';
            if (!rows.length) {
                placementQueueEl.innerHTML = '';
                if (placementQueueEmptyEl) placementQueueEmptyEl.style.display = '';
                return;
            }
            if (placementQueueEmptyEl) placementQueueEmptyEl.style.display = 'none';

            placementQueueEl.innerHTML = rows.map(u => {
                const side = u.side || 'friendly';
                return `<button type="button" class="units-placement-panel-queue-item" data-id="${escapeHtml(u.id)}" role="listitem">
                    <span class="units-placement-panel-queue-item-symbol" data-sidc="${escapeHtml(u.sidc || '')}"></span>
                    <span class="units-placement-panel-queue-item-text">
                        <span class="units-placement-panel-queue-item-name">${escapeHtml(u.name || '—')}</span>
                        <span class="units-placement-panel-queue-item-meta">
                            <span class="units-tree-level units-tree-level-${u.level}">${escapeHtml(levelLabel(u.level))}</span>
                            <span class="units-side-dot units-side-dot-${side}" title="${escapeHtml(sideLabelShort(side))}"></span>
                            <span class="units-placement-panel-queue-item-code">${escapeHtml(u.code || '')}</span>
                        </span>
                    </span>
                </button>`;
            }).join('');

            // Lazy-render the symbols after the HTML is in place.
            placementQueueEl.querySelectorAll('.units-placement-panel-queue-item-symbol').forEach(slot => {
                const sidc = slot.getAttribute('data-sidc');
                if (sidc) renderSymbolInto(slot, sidc, 30);
            });
        }

        // Switch the active placement target to another unit without closing
        // or re-opening the panel. Keeps continuous toggle state.
        function switchPlacementUnit(unitId) {
            if (!unitId) return;
            const u = state.units.find(x => x.id === unitId);
            if (!u) return;
            currentPlacingUnit = u;
            // Align tree selection with the unit being placed so "Back to
            // details" brings the user to the right row in the modal.
            state.selectedId = u.id;
            populatePlacementCard(u);
            setPlacementStatus('units-placement-active', 'Placement mode active — click the map to set the location', false);
            armMapPlacement(u);
            renderPlacementQueue();
        }

        // Floating top-of-map cue (extra reinforcement beyond the side panel)
        let mapCueEl = null;
        function showMapCue() {
            if (mapCueEl || typeof document === 'undefined') return;
            mapCueEl = document.createElement('div');
            mapCueEl.className = 'units-map-placement-cue';
            mapCueEl.setAttribute('dir', isArabicLocale() ? 'rtl' : 'ltr');
            const cueText = tr('units-map-cue-text', 'Click the map to place');
            const cueHint = tr('units-map-cue-hint', 'ESC to cancel');
            mapCueEl.innerHTML = `<span>${escapeHtml(cueText)}</span><kbd>ESC</kbd><span style="opacity:0.85">${escapeHtml(cueHint)}</span>`;
            document.body.appendChild(mapCueEl);
        }
        function hideMapCue() {
            if (mapCueEl && mapCueEl.parentNode) mapCueEl.parentNode.removeChild(mapCueEl);
            mapCueEl = null;
        }

        // Separated from enterPlacementMode so continuous mode can re-arm
        // the map hook after a successful placement without toggling the panel.
        function armMapPlacement(unit) {
            if (!unit || !window.AppUnitsMap) return;
            window.__APP_UNITS_SIDEPANEL_PLACING = true;
            const unitRow = state.units.find(x => x.id === unit.id) || unit;
            window.AppUnitsMap.beginPlacement({
                id: unit.id, name: unit.name, code: unit.code, level: unit.level,
                side: unit.side, sidc: unitRow.sidc || unit.sidc || null,
            });
        }

        function enterPlacementMode(unit) {
            if (!unit || !window.AppUnitsMap) return;
            inPlacement = true;
            currentPlacingUnit = unit;
            // Park the centred modal — form/selection state is preserved intact.
            modal.classList.add('units-modal-parked');
            if (placementPanelEl) {
                placementPanelEl.hidden = false;
                placementPanelEl.setAttribute('aria-hidden', 'false');
            }
            populatePlacementCard(unit);
            setPlacementStatus('units-placement-active', 'Placement mode active — click the map to set the location', false);
            showMapCue();
            armMapPlacement(unit);
            renderPlacementQueue();
        }

        // returnToModal:
        //   true  → hide placement panel, unpark modal (user sees the full UI again).
        //   false → keep placement panel visible (continuous mode post-placement).
        function exitPlacementMode({ cancel = false, returnToModal = true } = {}) {
            if (!inPlacement && placementPanelEl?.hidden !== false) return;
            const wasInPlacement = inPlacement;
            // Clear state BEFORE calling cancelPlacement so the re-entrant
            // `units:placement-cancelled` listener short-circuits at its guard.
            inPlacement = false;
            window.__APP_UNITS_SIDEPANEL_PLACING = false;

            if (returnToModal) {
                if (placementPanelEl) {
                    placementPanelEl.hidden = true;
                    placementPanelEl.setAttribute('aria-hidden', 'true');
                }
                modal.classList.remove('units-modal-parked');
                hideMapCue();
                currentPlacingUnit = null;
            }
            if (cancel && wasInPlacement) window.AppUnitsMap?.cancelPlacement?.();
        }

        function renderEditParents(excludeId, level) {
            if (!editParentEl) return;
            if (level === 0) {
                editParentEl.innerHTML = `<option value="">${escapeHtml(tr('units-edit-select-none', '— None (root) —'))}</option>`;
                editParentEl.disabled = true;
                return;
            }
            editParentEl.disabled = false;
            const parentLvl = level - 1;
            const incDel = !!includeDeletedCb?.checked;
            const pool = incDel ? state.units : state.units.filter(u => !u.deleted_at);
            const selLabel = tr('units-edit-select-parent', '— Select {0} —').replace('{0}', levelLabel(parentLvl));
            const opts = [`<option value="">${escapeHtml(selLabel)}</option>`];
            for (const u of pool) {
                if (u.level !== parentLvl) continue;
                if (excludeId && u.id === excludeId) continue;
                opts.push(`<option value="${escapeHtml(u.id)}">${escapeHtml(u.name)}</option>`);
            }
            editParentEl.innerHTML = opts.join('');
        }

        // ── Buttons ────────────────────────────────────────────────────────────
        function setCreateEnabled() {
            if (!createBtn) return;
            const ok = !!(qaNameEl?.value || '').trim() && !!(qaCodeEl?.value || '').trim() && codeAvailable;
            createBtn.disabled = !ok;
            if (createAddBtn)   createAddBtn.disabled   = !ok;
            if (createPlaceBtn) createPlaceBtn.disabled = !ok;
        }

        function setEditEnabled() {
            if (!saveBtn) return;
            saveBtn.disabled = !((editNameEl?.value || '').trim()) || !((editCodeEl?.value || '').trim()) || !editCodeAvailable;
        }

        function showQaError(msg) {
            if (!qaErrorEl) return;
            qaErrorEl.textContent = msg || '';
            if (msg) show(qaErrorEl); else hide(qaErrorEl);
        }

        function showEditError(msg) {
            if (!editErrorEl) return;
            editErrorEl.textContent = msg || '';
            if (msg) show(editErrorEl); else hide(editErrorEl);
        }

        function showGenError(msg) {
            if (!genErrorEl) return;
            genErrorEl.textContent = msg || '';
            if (msg) show(genErrorEl); else hide(genErrorEl);
        }

        // ── Welcome mode ───────────────────────────────────────────────────────
        // On first open, show a calm "Get started" panel on the right instead
        // of dropping the user straight into the multi-section creation form.
        // Clicking the welcome button OR any unit in the tree exits this mode.
        const modalPanelEl = modal.querySelector('.units-modal-panel');
        function enterWelcomeMode() {
            state.selectedId = null;
            modalPanelEl?.classList.add('welcome-mode');
            modalPanelEl?.classList.remove('has-selection');
        }
        function exitWelcomeMode() {
            modalPanelEl?.classList.remove('welcome-mode');
        }
        // Toggle the right-column visibility based on whether a unit is
        // currently selected. The CSS uses .has-selection on the modal panel
        // to show/hide the dedicated card column.
        function setHasSelection(yes) {
            if (!modalPanelEl) return;
            modalPanelEl.classList.toggle('has-selection', !!yes);
        }

        // ── Open / Close ───────────────────────────────────────────────────────
        function open() { modal.classList.remove('hidden'); modal.setAttribute('aria-hidden', 'false'); enterWelcomeMode(); refresh({ collapseAll: true }); }
        function close() {
            // Tear down any dangling placement hook before the whole UI disappears.
            exitPlacementMode({ cancel: true });
            modal.classList.remove('units-modal-parked');
            modal.classList.add('hidden');
            modal.setAttribute('aria-hidden', 'true');
        }

        // ── Selection ──────────────────────────────────────────────────────────
        function getSelected() { return state.units.find(u => u.id === state.selectedId) || null; }

        function selectUnit(id) {
            exitWelcomeMode();
            state.selectedId = id;
            setHasSelection(!!id);
            updateCtxBar();
            renderTree();
            if (id) {
                // Selecting an existing unit → show its details for editing.
                // The user no longer has to hunt for the Edit button.
                if (createBackRow) createBackRow.style.display = 'none';
                openEditPanel();
            } else {
                // No selection → user wants to create a new top-level Army.
                closeEditPanel();
                if (createBackRow) createBackRow.style.display = 'none';
                resetMainForm();
                qaNameEl?.focus();
            }
        }

        // ── Tree ───────────────────────────────────────────────────────────────
        function renderTree() {
            let flat = flattenTree(state.roots, collapsed);
            if (filterSide) flat = flat.filter(n => (n.side || 'friendly') === filterSide);
            const selId = state.selectedId;
            treeEl.innerHTML = flat.map(n => {
                const pad        = 8 + n._depth * 16;
                const isSel      = n.id === selId;
                const deleted    = !!(n.deletedAt || n.deleted_at);
                const lbl        = levelLabel(n.level);
                const isCol      = collapsed.has(n.id);
                const toggleEl   = n._hasChildren
                    ? `<button class="units-toggle-btn${isCol ? ' collapsed' : ''}" data-toggle-id="${escapeHtml(n.id)}">${isCol ? '▶' : '▼'}</button>`
                    : `<span class="units-toggle-spacer"></span>`;
                const countTitle = n._childCount > 0
                    ? tr('units-tree-count-title', `${n._childCount} subordinate unit${n._childCount === 1 ? '' : 's'}`).replace('{n}', String(n._childCount))
                    : '';
                const countBadge = n._childCount > 0 ? `<span class="units-tree-count" title="${escapeHtml(countTitle)}">${n._childCount}</span>` : '';
                const delBtn = deleted
                    ? `<button class="units-tree-restore-btn" data-restore-id="${escapeHtml(n.id)}" title="${escapeHtml(tr('units-tree-restore-title', 'Restore'))}">↩</button>`
                    : `<button class="units-tree-del-btn" data-del-id="${escapeHtml(n.id)}" title="${escapeHtml(tr('units-tree-delete-title', 'Delete'))}">×</button>`;
                const orbatBtn = n._hasChildren
                    ? `<button class="units-tree-orbat-btn" data-orbat-id="${escapeHtml(n.id)}" title="${escapeHtml(tr('units-tree-orbat-title', 'View ORBAT tree'))}" aria-label="${escapeHtml(tr('units-tree-orbat-title', 'View ORBAT tree'))}"><svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="7.5" y="2" width="5" height="4" rx="1"/><rect x="1.5" y="13" width="5" height="4" rx="1"/><rect x="7.5" y="13" width="5" height="4" rx="1"/><rect x="13.5" y="13" width="5" height="4" rx="1"/><path d="M10 6v3M4 13v-2h12v2M10 11v2"/></g></svg></button>`
                    : '';
                const nodeSide = n.side || 'friendly';
                const nodeSideLabel = nodeSide.charAt(0).toUpperCase() + nodeSide.slice(1);
                const placedBadge = isPlaced(n)
                    ? `<span class="units-tree-placed" title="${escapeHtml(tr('units-tree-placed-title', 'Placed on map'))}">&#128205;</span>`
                    : '';
                const sideDotTitle = tr(
                    `units-side-dot-${nodeSide}-title`,
                    `${sideLabelShort(nodeSide)} affiliation`
                );
                return `<div class="units-tree-row ${isSel ? 'active' : ''} ${deleted ? 'deleted' : ''} units-side-row-${nodeSide}" data-id="${escapeHtml(n.id)}" style="padding-inline-start:${pad}px">
                  ${toggleEl}
                  <span class="units-tree-level units-tree-level-${n.level}">${escapeHtml(lbl)}</span>
                  <span class="units-tree-label">${escapeHtml(n.name)}</span>
                  ${countBadge}
                  <span class="units-tree-spacer"></span>
                  ${placedBadge}
                  <span class="units-side-dot units-side-dot-${nodeSide}" title="${escapeHtml(sideDotTitle)}"></span>
                  ${orbatBtn}
                  ${delBtn}
                </div>`;
            }).join('') || `<div class="units-tree-empty">${escapeHtml(tr('units-tree-empty', 'No units found.'))}</div>`;
        }

        // ── Refresh ────────────────────────────────────────────────────────────
        async function refresh({ collapseAll = false } = {}) {
            const incDel = !!includeDeletedCb?.checked;
            try {
                const data = await apiJson(`/api/units/tree?includeDeleted=${incDel ? 1 : 0}`);
                state.roots = data.roots || [];
                state.units = data.units || [];
                if (state.selectedId && !state.units.find(u => u.id === state.selectedId)) state.selectedId = null;
                if (collapseAll) {
                    collapsed = new Set(
                        state.units
                            .filter(u => state.units.some(c => c.parent_id === u.id))
                            .map(u => u.id)
                    );
                }
                updateCtxBar();
                updateMainPanel();
                renderTree();
                setCreateEnabled();
                setEditEnabled();
                // Resync map markers with whatever the server now reports
                // (covers cascaded deletes, SIDC edits, parent moves, etc).
                window.AppUnitsMap?.reload?.();
            } catch (e) { showQaError(e.message || tr('units-err-load', 'Failed to load units')); }
        }

        // ── Search ─────────────────────────────────────────────────────────────
        async function doSearch() {
            const q = (searchInput?.value || '').trim();
            if (!q) return refresh();
            const incDel = !!includeDeletedCb?.checked;
            try {
                const data = await apiJson(`/api/units/search?q=${encodeURIComponent(q)}&includeDeleted=${incDel ? 1 : 0}`);
                state.roots = [];
                state.units = data.results || [];
                treeEl.innerHTML = state.units.map(u => {
                    const isSel = u.id === state.selectedId;
                    return `<div class="units-tree-row ${isSel ? 'active' : ''} ${u.deleted_at ? 'deleted' : ''}" data-id="${escapeHtml(u.id)}" style="padding-inline-start:8px">
                      <span class="units-toggle-spacer"></span>
                      <span class="units-tree-level units-tree-level-${u.level}">${escapeHtml(levelLabel(u.level))}</span>
                      <span class="units-tree-label">${escapeHtml(u.name)}</span>
                    </div>`;
                }).join('') || `<div class="units-tree-empty">${escapeHtml(tr('units-search-nores', 'No results'))}</div>`;
            } catch (e) { showQaError(e.message || tr('units-err-search', 'Search failed')); }
        }

        // ── Code checks ────────────────────────────────────────────────────────
        async function checkQaCode() {
            const code = (qaCodeEl?.value || '').trim();
            if (!code) { codeAvailable = false; setCreateEnabled(); return; }
            try {
                const d = await apiJson(`/api/units/code-check?code=${encodeURIComponent(code)}&excludeId=`);
                codeAvailable = !!d.available;
                if (!codeAvailable) showQaError(tr('units-err-code-used', 'Code already in use — please change it.'));
                else if (qaErrorEl?.textContent && /already|مستخدم/.test(qaErrorEl.textContent)) showQaError('');
            } catch { codeAvailable = true; }
            setCreateEnabled();
        }

        async function checkEditCode() {
            const u    = getSelected();
            const code = (editCodeEl?.value || '').trim();
            if (!code) { editCodeAvailable = false; setEditEnabled(); return; }
            try {
                const d = await apiJson(`/api/units/code-check?code=${encodeURIComponent(code)}&excludeId=${encodeURIComponent(u?.id || '')}`);
                editCodeAvailable = !!d.available;
                if (!editCodeAvailable) showEditError(tr('units-err-code-used', 'Code already in use — please change it.'));
                else if (editErrorEl?.textContent && /already|مستخدم/.test(editErrorEl.textContent)) showEditError('');
            } catch { editCodeAvailable = true; }
            setEditEnabled();
        }

        // ── CREATE ─────────────────────────────────────────────────────────────
        function resolveSidcForSave() {
            // Prefer explicit user pick; else typed Advanced value (if 20 digits); else computed.
            if (selectedSidc) return selectedSidc;
            const typed = (qaSidcEl?.value || '').replace(/\D/g, '');
            if (typed.length >= 20) return typed.slice(0, 20);
            // Only auto-save a computed SIDC when the user chose a domain — otherwise leave null.
            if (!selectedDomain && getCreateLevel() > 0) return null;
            return currentSidc();
        }

        async function createUnit({ keepParent = false, placeAfter = false } = {}) {
            showQaError('');
            const lvl      = getCreateLevel();
            const u        = getSelected();
            const parentId = u ? u.id : null;
            await checkQaCode();
            if (!codeAvailable) return;
            const payload = {
                code:     (qaCodeEl?.value || '').trim(),
                name:     (qaNameEl?.value || '').trim(),
                level:    lvl,
                parentId,
                sidc:     resolveSidcForSave(),
                unitType: selectedBranch || selectedDomain || null,
                side:     selectedSide || 'friendly',
            };
            try {
                const row = await apiJson('/api/units', { method: 'POST', body: JSON.stringify(payload) });

                // Quick Setup: auto-create standard forces under a new Army
                if (lvl === 0) {
                    const forces = [];
                    if (byId('qs-air')?.checked)   forces.push({ name: 'Air Force',   unitType: 'Air',   domain: 'Air'   });
                    if (byId('qs-land')?.checked)  forces.push({ name: 'Land Force',  unitType: 'Land',  domain: 'Land'  });
                    if (byId('qs-naval')?.checked) forces.push({ name: 'Naval Force', unitType: 'Naval', domain: 'Naval' });
                    for (let i = 0; i < forces.length; i++) {
                        const f = forces[i];
                        const forceSidc = buildSidcFromFields({
                            side: row.side || 'friendly',
                            domain: f.domain,
                            level: 1,
                            entity: (ENTITIES_BY_DOMAIN[f.domain] || ENTITIES_BY_DOMAIN.Land)[0],
                        });
                        await apiJson('/api/units', { method: 'POST', body: JSON.stringify({
                            code: nextCode(1, i), name: f.name, level: 1,
                            parentId: row.id, sidc: forceSidc, unitType: f.unitType,
                        })}).catch(() => {});
                    }
                }

                // "Create & Place" keeps the parent selected (like Create & Add
                // Another) so the user can immediately create another sibling
                // after placing — the freshly-created unit is armed for
                // placement via enterPlacementMode below without touching the
                // tree selection.
                if (!keepParent && !placeAfter) state.selectedId = row.id;
                await refresh();
                resetMainForm();
                if (placeAfter && row && row.id) {
                    const freshRow = state.units.find(x => x.id === row.id) || row;
                    enterPlacementMode(freshRow);
                    return;
                }
                qaNameEl?.focus();
            } catch (e) { showQaError(e.message || tr('units-err-create', 'Create failed')); }
        }

        // ── GENERATE CHILDREN ──────────────────────────────────────────────────
        async function generateChildren() {
            showGenError('');
            const u = getSelected();
            if (!u || u.level >= 4) return;
            const childLvl = u.level + 1;
            const count    = Math.max(1, Math.min(20, parseInt(genCount?.value || '3', 10)));
            const prefix   = (genPrefix?.value || levelLabel(childLvl)).trim();
            if (genBtn) genBtn.disabled = true;
            try {
                for (let i = 1; i <= count; i++) {
                    await apiJson('/api/units', { method: 'POST', body: JSON.stringify({
                        code: nextCode(childLvl, i - 1),
                        name: `${prefix} ${i}`,
                        level: childLvl,
                        parentId: u.id,
                        sidc: null, unitType: null,
                    })});
                }
                await refresh();
                hide(genForm);
            } catch (e) { showGenError(e.message || tr('units-gen-err', 'Generate failed')); }
            finally { if (genBtn) genBtn.disabled = false; }
        }

        // ── SAVE ───────────────────────────────────────────────────────────────
        async function saveUnit() {
            const u = getSelected();
            if (!u) return;
            showEditError('');
            await checkEditCode();
            if (!editCodeAvailable) return;
            const newParentId   = (editParentEl?.value || '').trim() || null;
            const parentChanged = newParentId !== (u.parent_id || null);
            const payload = {
                code:     (editCodeEl?.value || '').trim(),
                name:     (editNameEl?.value || '').trim(),
                level:    u.level, // level never changes via edit
                sidc:     (editSidcEl?.value || '').trim() || null,
                unitType: (editTypeEl?.value || '').trim() || null,
                side:     editSelectedSide || 'friendly',
            };
            try {
                const row = await apiJson(`/api/units/${encodeURIComponent(u.id)}`, { method: 'PATCH', body: JSON.stringify(payload) });
                if (parentChanged) await apiJson(`/api/units/${encodeURIComponent(u.id)}/move`, { method: 'POST', body: JSON.stringify({ newParentId }) });
                state.selectedId = row.id;
                await refresh();
                // Stay on the edit view of the just-saved unit so the user
                // sees their changes reflected (and can keep editing).
                openEditPanel();
                updateCtxBar();
                // Refresh the map marker (name/side/sidc may have changed)
                if (isPlaced(row)) {
                    document.dispatchEvent(new CustomEvent('units:updated', { detail: {
                        id: row.id, name: row.name, code: row.code, level: row.level,
                        side: row.side, sidc: row.sidc, lat: row.lat, lng: row.lng,
                    } }));
                }
            } catch (e) { showEditError(e.message || tr('units-err-save', 'Save failed')); }
        }

        // ── DELETE / RESTORE ───────────────────────────────────────────────────
        async function deleteUnit() {
            const u = getSelected();
            if (!u) return;
            showEditError('');
            try {
                await apiJson(`/api/units/${encodeURIComponent(u.id)}/delete`, { method: 'POST', body: '{}' });
                document.dispatchEvent(new CustomEvent('units:removed', { detail: { unitId: u.id } }));
                state.selectedId = null;
                hide(editPanel);
                show(mainPanel);
                enterWelcomeMode();
                await refresh();
            } catch (e) { showEditError(e.message || tr('units-err-delete', 'Delete failed')); }
        }

        async function restoreUnit() {
            const u = getSelected();
            if (!u) return;
            showEditError('');
            try {
                await apiJson(`/api/units/${encodeURIComponent(u.id)}/restore`, { method: 'POST', body: '{}' });
                await refresh();
            } catch (e) { showEditError(e.message || tr('units-err-restore', 'Restore failed')); }
        }

        // ── Events ─────────────────────────────────────────────────────────────
        railBtn.addEventListener('click', (e) => { e.preventDefault(); open(); });
        // Guard backdrop click — during placement the modal is parked (not visible),
        // but if the user somehow triggers this we must not close the whole UI
        // while a placement is armed.
        backdrop?.addEventListener('click', () => { if (!inPlacement) close(); });
        closeBtn?.addEventListener('click', close);
        // ESC behaviour:
        //   - While placement is active, ESC cancels placement ONLY. The main
        //     modal re-appears with every field intact. Data is never discarded.
        //   - Otherwise ESC closes the whole units UI.
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            if (inPlacement) { exitPlacementMode({ cancel: true }); return; }
            if (!modal.classList.contains('hidden')) close();
        });
        refreshBtn?.addEventListener('click', () => refresh({ collapseAll: true }));
        includeDeletedCb?.addEventListener('change', refresh);

        byId('units-toggle-all-btn')?.addEventListener('click', (e) => {
            const btn = e.currentTarget;
            const parentIds = state.units.filter(u => state.units.some(c => c.parent_id === u.id)).map(u => u.id);
            const anyExpanded = parentIds.some(id => !collapsed.has(id));
            if (anyExpanded) {
                parentIds.forEach(id => collapsed.add(id));
                btn.textContent = '▼ Expand All';
            } else {
                collapsed.clear();
                btn.textContent = '▶ Collapse All';
            }
            renderTree();
        });
        byId('units-new-army-btn')?.addEventListener('click', () => selectUnit(null));
        byId('units-welcome-new-btn')?.addEventListener('click', () => selectUnit(null));

        // Click dead-end "Company selected" card → start a new Army
        noChildrenEl?.addEventListener('click', () => selectUnit(null));

        // Tree
        treeEl.addEventListener('click', async (e) => {
            const toggleBtn = e.target?.closest?.('.units-toggle-btn');
            if (toggleBtn) {
                e.stopPropagation();
                const id = toggleBtn.getAttribute('data-toggle-id');
                if (collapsed.has(id)) collapsed.delete(id); else collapsed.add(id);
                renderTree(); return;
            }
            const orbatBtn = e.target?.closest?.('.units-tree-orbat-btn');
            if (orbatBtn) {
                e.stopPropagation();
                const id = orbatBtn.getAttribute('data-orbat-id');
                const rootNode = findNodeInRoots(state.roots, id);
                if (rootNode) window.AppUnitsOrbat?.open?.(rootNode);
                return;
            }
            const delBtn = e.target?.closest?.('.units-tree-del-btn');
            if (delBtn) {
                e.stopPropagation();
                const id = delBtn.getAttribute('data-del-id');
                const u  = state.units.find(x => x.id === id);
                if (!u) return;
                const confirmMsg = tr('units-confirm-delete', 'Delete "{0}"?').replace('{0}', u.name);
                const ok = (typeof window.customConfirm === 'function')
                    ? await window.customConfirm(confirmMsg, {
                        okText: tr('dialog-delete', 'Delete'),
                        cancelText: tr('dialog-cancel', 'Cancel'),
                        danger: true,
                      })
                    : confirm(confirmMsg);
                if (!ok) return;
                try {
                    await apiJson(`/api/units/${encodeURIComponent(id)}/delete`, { method: 'POST', body: '{}' });
                    if (state.selectedId === id) {
                        state.selectedId = null;
                        hide(editPanel);
                        show(mainPanel);
                        enterWelcomeMode();
                    }
                    await refresh();
                } catch (err) {
                    const msg = err.message || tr('units-err-delete', 'Delete failed');
                    if (window.rmoozToast) window.rmoozToast(msg, 'error');
                    else alert(msg);
                }
                return;
            }
            const restoreBtn = e.target?.closest?.('.units-tree-restore-btn');
            if (restoreBtn) {
                e.stopPropagation();
                const id = restoreBtn.getAttribute('data-restore-id');
                try {
                    await apiJson(`/api/units/${encodeURIComponent(id)}/restore`, { method: 'POST', body: '{}' });
                    await refresh();
                } catch (err) {
                    const msg = err.message || tr('units-err-restore', 'Restore failed');
                    if (window.rmoozToast) window.rmoozToast(msg, 'error');
                    else alert(msg);
                }
                return;
            }
            const row = e.target?.closest?.('.units-tree-row');
            const id  = row?.getAttribute('data-id');
            if (id) selectUnit(id);
        });

        // Affiliation filter buttons
        modal.querySelectorAll('.units-filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const side = btn.getAttribute('data-filter-side');
                filterSide = (side === 'all') ? null : side;
                modal.querySelectorAll('.units-filter-btn').forEach(b => b.classList.toggle('active', b === btn));
                renderTree();
            });
        });

        let searchTimer = null;
        searchInput?.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(doSearch, 250); });

        // Edit panel
        // Edit-panel "Back" clears the selection and returns to the welcome
        // state — there's no longer a hidden create form to fall back into.
        editBackBtn?.addEventListener('click', () => {
            state.selectedId = null;
            hide(editPanel);
            show(mainPanel);
            enterWelcomeMode();
            renderTree();
        });
        editNameEl?.addEventListener('input', () => { setEditEnabled(); updateEditSymbolBanner(); });
        editCodeEl?.addEventListener('input', () => {
            editCodeAvailable = true;
            clearTimeout(editCodeCheckTimer);
            editCodeCheckTimer = setTimeout(checkEditCode, 300);
            setEditEnabled();
        });
        // Live symbol preview: typing a SIDC updates the banner immediately so
        // the user can see what the symbol will look like before saving.
        editSidcEl?.addEventListener('input', updateEditSymbolBanner);
        // Force Type dropdown live-rebuilds the SIDC so the preview updates
        // immediately. Reuses the existing buildSidcFromFields() helper, then
        // updates the SIDC input (which Save reads from) and re-renders the
        // banner. We pick the domain's first canonical entity rather than an
        // empty 000000 so the rendered NATO symbol is visually distinct per
        // domain (an empty entity often renders as the same neutral square
        // across domains, which makes the change look like nothing happened).
        editTypeEl?.addEventListener('change', () => {
            const u = getSelected();
            if (!u) return;
            const domain = (editTypeEl.value || '').trim();
            if (!domain) {
                if (editSidcEl) editSidcEl.value = '';
                updateEditSymbolBanner();
                return;
            }
            const entity = (ENTITIES_BY_DOMAIN[domain] || ENTITIES_BY_DOMAIN.Land)[0];
            const newSidc = buildSidcFromFields({
                side:   editSelectedSide || u.side || 'friendly',
                domain,
                level:  u.level,
                entity,
            });
            if (editSidcEl) editSidcEl.value = newSidc;
            updateEditSymbolBanner();
        });
        // Save now goes through a confirmation step that lists each change.
        saveBtn?.addEventListener('click', () => {
            const u = getSelected();
            if (!u) return;
            showEditError('');
            const changes = computeEditChanges(u);
            if (changes.length === 0) {
                showEditError(tr('units-edit-no-changes', 'Nothing to save — no changes detected.'));
                return;
            }
            showSaveConfirm(changes);
        });
        editConfirmYesBtn?.addEventListener('click', () => { hideSaveConfirm(); saveUnit(); });
        editConfirmNoBtn?.addEventListener('click', hideSaveConfirm);
        // "+ Add child" jumps from edit view to the create-child form, scoped
        // to the currently selected parent.
        editAddChildBtn?.addEventListener('click', openCreateChildPanel);
        // Back button on the create-child form returns to the parent's edit view.
        createBackBtn?.addEventListener('click', () => {
            if (createBackRow) createBackRow.style.display = 'none';
            const u = getSelected();
            if (u) openEditPanel(); else enterWelcomeMode();
        });
        deleteBtn?.addEventListener('click',  deleteUnit);
        restoreBtn?.addEventListener('click', restoreUnit);

        // Place on map — DO NOT close the modal. Park it and hand off to the
        // standalone placement panel; every field stays preserved for when the
        // user comes back via Cancel / Back / post-placement return.
        placeBtn?.addEventListener('click', () => {
            const u = getSelected();
            if (!u) return;
            enterPlacementMode(u);
        });

        // Placement panel actions (Cancel / Back / Continuous)
        placementCancelBtn?.addEventListener('click', () => exitPlacementMode({ cancel: true }));
        placementBackBtn?.addEventListener('click',   () => exitPlacementMode({ cancel: true }));

        // Queue: click a row to re-arm placement for that unit in-place —
        // never leaves the panel. Only Cancel / Back exit to the modal.
        placementQueueEl?.addEventListener('click', (e) => {
            const row = e.target?.closest?.('.units-placement-panel-queue-item');
            if (!row) return;
            const id = row.getAttribute('data-id');
            if (!id) return;
            // If the current placement isn't armed (e.g. after continuous
            // placement just completed), make sure the flag comes back on.
            if (!inPlacement) {
                inPlacement = true;
                window.__APP_UNITS_SIDEPANEL_PLACING = true;
            }
            switchPlacementUnit(id);
        });

        // Remove from map (edit panel)
        unplaceBtn?.addEventListener('click', async () => {
            const u = getSelected();
            if (!u) return;
            try {
                await apiJson(`/api/units/${encodeURIComponent(u.id)}/unplace`, { method: 'POST', body: '{}' });
                window.AppUnitsMap?.removeMarker?.(u.id);
                if (placementRow) placementRow.style.display = 'none';
                await refresh();
            } catch (e) { showEditError(e.message || tr('units-err-remove-map', 'Failed to remove from map')); }
        });

        // React when the map finishes placing a unit (dispatched by units-map.js).
        //   - Continuous OFF: exit placement, return to the main modal with
        //     every field preserved.
        //   - Continuous ON:  keep the placement panel open. Current unit is
        //     now placed, so we drop it from state and the queue re-render
        //     shows the next candidates. User picks one to keep going, or
        //     clicks Cancel/Back to return to the modal.
        document.addEventListener('units:placed', async () => {
            const keepOpen = !!placementContinuousEl?.checked;
            try { await refresh(); } catch (_) { /* ignore */ }
            if (keepOpen && inPlacement) {
                setPlacementStatus('units-placement-placed', 'Placed! Pick another unit below — or Back to return.', true);
                // Map hook was torn down after success; keep it down until the
                // user picks the next unit from the queue. currentPlacingUnit
                // is now a placed unit and shouldn't appear in the list.
                currentPlacingUnit = null;
                window.__APP_UNITS_SIDEPANEL_PLACING = false;
                renderPlacementQueue();
                return;
            }
            exitPlacementMode();
        });
        // External cancel (e.g. banner button or map-level ESC path) must also
        // exit our panel so the main modal re-appears.
        document.addEventListener('units:placement-cancelled', () => {
            if (inPlacement) exitPlacementMode();
        });

        // Side buttons (create form)
        sideBtnsEl?.addEventListener('click', (e) => {
            const btn = e.target?.closest?.('.units-side-btn');
            if (!btn) return;
            selectedSide = btn.getAttribute('data-side') || 'friendly';
            setSideUI(sideBtnsEl, selectedSide);
            // An explicit side change invalidates a previously-picked SIDC, whose identity
            // digit would otherwise contradict the new side.
            selectedSidc = null;
            updateSymbolPreview();
        });

        // Side buttons (edit panel)
        editSideBtnsEl?.addEventListener('click', (e) => {
            const btn = e.target?.closest?.('.units-side-btn');
            if (!btn) return;
            editSelectedSide = btn.getAttribute('data-side') || 'friendly';
            setSideUI(editSideBtnsEl, editSelectedSide);
            // Rewrite the identity digit (position 3) of the current SIDC so
            // the symbol preview reflects the new affiliation immediately.
            const cur = (editSidcEl?.value || '').trim();
            if (cur.length >= 20 && editSidcEl) {
                const newIdentity = IDENTITY_BY_SIDE[editSelectedSide] || '3';
                editSidcEl.value = cur.slice(0, 3) + newIdentity + cur.slice(4);
            }
            updateEditSymbolBanner();
            setEditEnabled();
        });

        // "Change symbol" — opens the full SIDC picker pre-filtered to the
        // unit being edited; the picker's result lands directly in the edit
        // form's SIDC field via the message listener target='edit' branch.
        editSymbolPickBtn?.addEventListener('click', openEditSymbolPicker);

        // Domain buttons
        domainBtns?.addEventListener('click', (e) => {
            const btn = e.target?.closest?.('.units-domain-btn');
            if (!btn) return;
            const domain = btn.getAttribute('data-domain');
            if (selectedDomain === domain) {
                selectedDomain = null;
            } else {
                selectedDomain = domain;
            }
            setDomainUI(selectedDomain);
            // Changing domain invalidates branch and any explicit SIDC pick
            selectedBranch = null;
            setBranchUI(null);
            selectedSidc = null;
            updateMainPanel();
        });

        // Branch buttons
        branchBtns?.addEventListener('click', (e) => {
            const btn = e.target?.closest?.('.units-domain-btn');
            if (!btn) return;
            const branch = btn.getAttribute('data-branch');
            if (selectedBranch === branch) {
                selectedBranch = null;
            } else {
                selectedBranch = branch;
            }
            setBranchUI(selectedBranch);
            selectedSidc = null; // branch change → re-auto-suggest
            updateSymbolPreview();
        });

        // Symbol suggestion chips
        symbolChipsEl?.addEventListener('click', (e) => {
            const chip = e.target?.closest?.('.units-symbol-chip');
            if (!chip) return;
            const sidc = chip.getAttribute('data-sidc');
            if (!sidc) return;
            selectedSidc = sidc;
            // Reflect the entity back to branch selector when we can
            const entity = sidc.substr(10, 6);
            const maybeBranch = branchFromEntity(entity);
            if (maybeBranch) {
                selectedBranch = maybeBranch;
                setBranchUI(selectedBranch);
            }
            updateSymbolPreview();
        });

        // Clear (reset to auto)
        symbolClearBtn?.addEventListener('click', () => {
            selectedSidc = null;
            updateSymbolPreview();
        });

        // Open full library
        symbolPickerBtn?.addEventListener('click', openSymbolPicker);

        // Clear the capture flag if the picker is closed via its own backdrop/close button
        byId('sidc-picker-close')?.addEventListener('click', () => {
            if (window.__APP_UNITS_CAPTURING_SIDC) closeSymbolPicker();
        });
        byId('sidc-picker-close-btn')?.addEventListener('click', () => {
            if (window.__APP_UNITS_CAPTURING_SIDC) closeSymbolPicker();
        });

        // Advanced SIDC manual input
        qaSidcEl?.addEventListener('input', () => {
            const raw = (qaSidcEl.value || '').replace(/\D/g, '');
            if (raw.length >= 20) {
                selectedSidc = raw.slice(0, 20);
                updateSymbolPreview();
            } else if (!raw) {
                selectedSidc = null;
                updateSymbolPreview();
            }
        });

        // Generate section toggle
        genToggle?.addEventListener('click', () => {
            const isHidden = genForm?.style.display === 'none' || !genForm?.style.display;
            if (isHidden) show(genForm, 'flex'); else hide(genForm);
        });
        genBtn?.addEventListener('click', generateChildren);

        // Quick-add fields
        qaNameEl?.addEventListener('input', setCreateEnabled);
        qaCodeEl?.addEventListener('input', () => {
            codeAvailable = true;
            clearTimeout(codeCheckTimer);
            codeCheckTimer = setTimeout(checkQaCode, 300);
            setCreateEnabled();
        });
        qaNameEl?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                if ((qaCodeEl?.value || '').trim()) createUnit(); else qaCodeEl?.focus();
            }
        });
        qaCodeEl?.addEventListener('keydown', (e) => { if (e.key === 'Enter') createUnit(); });
        createBtn?.addEventListener('click',      () => createUnit());
        createAddBtn?.addEventListener('click',   () => createUnit({ keepParent: true }));
        createPlaceBtn?.addEventListener('click', () => createUnit({ placeAfter: true }));

        // The Company dead-end message contains bold HTML — applyLanguage only sets textContent,
        // so we populate innerHTML manually here and on every language change.
        function refreshNoChildrenMsg() {
            const msg2Wrap = byId('units-no-children-msg-2-wrap');
            const hintWrap = byId('units-no-children-hint-wrap');
            if (msg2Wrap) msg2Wrap.innerHTML = tr('units-no-children-msg-2', 'Click <strong>Edit</strong> to modify it, or select a higher-level unit to add under.');
            if (hintWrap) hintWrap.innerHTML = tr('units-no-children-hint', 'Click anywhere here to start a <strong>+ New Army</strong>');
        }
        refreshNoChildrenMsg();

        // Re-render dynamic text when the user toggles language. Chains any existing handler.
        const prevOnLang = window.onLanguageChange;
        window.onLanguageChange = function (lang) {
            try { if (typeof prevOnLang === 'function') prevOnLang(lang); } catch (_) {}
            refreshNoChildrenMsg();
            updateCtxBar();
            updateMainPanel();
            renderTree();
        };

        // Initial state
        hide(ctxSel); hide(editPanel); hide(noChildrenEl); hide(domainRow); hide(branchRow); hide(quickSetupEl); hide(generateSection);
        show(ctxRoot); show(mainPanel);
        updateMainPanel();
        setCreateEnabled();

        // Expose a way to open the modal on a specific unit (used by map marker popups)
        publicApi.getSelectedId = () => state.selectedId || null;
        publicApi.getSelectedUnit = () => getSelected();

        publicApi.open = async (unitId) => {
            // If a placement was somehow left armed, tear it down before showing
            // the centred modal so we never display both surfaces at once.
            if (inPlacement) exitPlacementMode({ cancel: true });
            modal.classList.remove('units-modal-parked');
            modal.classList.remove('hidden');
            modal.setAttribute('aria-hidden', 'false');
            await refresh({ collapseAll: true });
            if (unitId && state.units.find(x => x.id === unitId)) {
                selectUnit(unitId);
                openEditPanel();
            }
        };
    }

    const publicApi = { init };
    window.AppUnits = publicApi;
})();
