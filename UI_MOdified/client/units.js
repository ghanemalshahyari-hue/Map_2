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
    const SET_BY_DOMAIN   = { Land: '10', Air: '01', Naval: '30', Joint: '10', Support: '10' };
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
        return found['entity subtype'] || found['entity type'] || found.entity || '';
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

    function levelLabel(lvl) {
        return LEVELS.find(l => l.value === lvl)?.label ?? `L${lvl}`;
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
        const ctxRoot      = byId('units-ctx-root');
        const ctxSel       = byId('units-ctx-sel');
        const ctxBreadcrumb= byId('units-ctx-breadcrumb');
        const ctxLvlBadge  = byId('units-ctx-lvl-badge');
        const ctxSelName   = byId('units-ctx-sel-name');
        const ctxSelCode   = byId('units-ctx-sel-code');
        const ctxChildCount  = byId('units-ctx-child-count');
        const ctxSideBadge   = byId('units-ctx-side-badge');
        const editBtn        = byId('units-edit-btn');
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

        const SIDES = [
            { value: 'friendly', label: 'Friendly' },
            { value: 'hostile',  label: 'Hostile'  },
            { value: 'neutral',  label: 'Neutral'  },
            { value: 'unknown',  label: 'Unknown'  },
        ];

        let state     = { roots: [], units: [], selectedId: null };
        let collapsed = new Set();
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
            const u = getSelected();
            if (u) { hide(ctxRoot); showFlex(ctxSel); } else { show(ctxRoot); hide(ctxSel); }
            if (!u) return;
            const lbl = levelLabel(u.level);
            if (ctxLvlBadge) { ctxLvlBadge.textContent = lbl; ctxLvlBadge.className = `units-tree-level units-tree-level-${u.level}`; }
            const side = u.side || 'friendly';
            if (ctxSideBadge) { ctxSideBadge.textContent = side.charAt(0).toUpperCase() + side.slice(1); ctxSideBadge.className = `units-side-badge units-side-${side}`; }
            if (ctxSelName)   ctxSelName.textContent  = u.name || '—';
            if (ctxSelCode)   ctxSelCode.textContent  = u.code || '';
            const childCount = state.roots ? countDirectChildren(u.id) : 0;
            if (ctxChildCount) ctxChildCount.textContent = childCount > 0 ? `${childCount} ${levelLabel(u.level + 1)}${childCount !== 1 ? 's' : ''}` : '';
            if (ctxBreadcrumb) {
                const path = computeBreadcrumb(state.units, u.id);
                ctxBreadcrumb.innerHTML = path.length > 1
                    ? path.slice(0, -1).map(p => `<span class="units-bc-item">${escapeHtml(p.name)}</span>`).join('<span class="units-bc-sep">›</span>') + '<span class="units-bc-sep">›</span>'
                    : '';
            }
            if (placeBtn) {
                const placed = isPlaced(u);
                placeBtn.textContent = placed ? '\u{1F4CD} Re-place' : '\u{1F4CD} Place on map';
                placeBtn.title = placed
                    ? 'Click on the map to move this unit to a new position'
                    : 'Click on the map to place this unit';
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

            // Creating indicator
            const lbl = levelLabel(lvl);
            if (creatingBadge) { creatingBadge.textContent = lbl; creatingBadge.className = `units-tree-level units-tree-level-${lvl}`; }
            if (creatingUnder) creatingUnder.textContent = u ? `under ${u.name}` : '';
            if (createBtn) createBtn.textContent = `+ Create ${lbl}`;

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
                    sideBadge.textContent = inherited.charAt(0).toUpperCase() + inherited.slice(1);
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
            if (qaCodeEl && !(qaCodeEl.value || '').trim()) qaCodeEl.value = randCode(lvl);

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
            if (symbolNameEl) symbolNameEl.textContent = label || (selectedBranch || selectedDomain || 'Auto');
            if (symbolSidcEl) symbolSidcEl.textContent = selectedSidc ? `SIDC: ${sidc}` : `SIDC: ${sidc} (auto)`;
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
                lbl.textContent = sidcEntityShort(sidc) || 'Unit';
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
            hide(mainPanel);
            if (editPanel) { editPanel.style.display = 'flex'; editPanel.style.flexDirection = 'column'; }
            if (editNameEl)  editNameEl.value  = u.name || '';
            if (editCodeEl)  editCodeEl.value  = u.code || '';
            if (editTypeEl)  editTypeEl.value  = u.unit_type || '';
            if (editSidcEl)  editSidcEl.value  = u.sidc || '';
            editSelectedSide = u.side || 'friendly';
            setSideUI(editSideBtnsEl, editSelectedSide);
            if (editLevelDisp) editLevelDisp.textContent = levelLabel(u.level);
            renderEditParents(u.id, u.level);
            if (editParentEl) editParentEl.value = u.parent_id || '';
            showEditError('');
            editCodeAvailable = true;
            if (placementRow) placementRow.style.display = isPlaced(u) ? '' : 'none';
            setEditEnabled();
        }

        function closeEditPanel() {
            hide(editPanel);
            show(mainPanel);
        }

        function renderEditParents(excludeId, level) {
            if (!editParentEl) return;
            if (level === 0) { editParentEl.innerHTML = `<option value="">— None (root) —</option>`; editParentEl.disabled = true; return; }
            editParentEl.disabled = false;
            const parentLvl = level - 1;
            const incDel = !!includeDeletedCb?.checked;
            const pool = incDel ? state.units : state.units.filter(u => !u.deleted_at);
            const opts = [`<option value="">— Select ${levelLabel(parentLvl)} —</option>`];
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
            if (createAddBtn) createAddBtn.disabled = !ok;
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

        // ── Open / Close ───────────────────────────────────────────────────────
        function open() { modal.classList.remove('hidden'); modal.setAttribute('aria-hidden', 'false'); refresh({ collapseAll: true }); }
        function close() { modal.classList.add('hidden'); modal.setAttribute('aria-hidden', 'true'); }

        // ── Selection ──────────────────────────────────────────────────────────
        function getSelected() { return state.units.find(u => u.id === state.selectedId) || null; }

        function selectUnit(id) {
            state.selectedId = id;
            closeEditPanel();
            updateCtxBar();
            resetMainForm();
            renderTree();
            qaNameEl?.focus();
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
                const countBadge = n._childCount > 0 ? `<span class="units-tree-count">${n._childCount}</span>` : '';
                const delBtn = deleted
                    ? `<button class="units-tree-restore-btn" data-restore-id="${escapeHtml(n.id)}" title="Restore">↩</button>`
                    : `<button class="units-tree-del-btn" data-del-id="${escapeHtml(n.id)}" title="Delete">×</button>`;
                const nodeSide = n.side || 'friendly';
                const nodeSideLabel = nodeSide.charAt(0).toUpperCase() + nodeSide.slice(1);
                const placedBadge = isPlaced(n)
                    ? `<span class="units-tree-placed" title="Placed on map">&#128205;</span>`
                    : '';
                return `<div class="units-tree-row ${isSel ? 'active' : ''} ${deleted ? 'deleted' : ''} units-side-row-${nodeSide}" data-id="${escapeHtml(n.id)}" style="padding-inline-start:${pad}px">
                  ${toggleEl}
                  <span class="units-tree-level units-tree-level-${n.level}">${escapeHtml(lbl)}</span>
                  <span class="units-tree-label">${escapeHtml(n.name)}</span>
                  ${countBadge}
                  <span class="units-tree-spacer"></span>
                  ${placedBadge}
                  <span class="units-side-dot units-side-dot-${nodeSide}" title="${nodeSideLabel}"></span>
                  ${delBtn}
                </div>`;
            }).join('') || `<div class="units-tree-empty">No units found.</div>`;
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
            } catch (e) { showQaError(e.message || 'Failed to load units'); }
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
                }).join('') || `<div class="units-tree-empty">No results</div>`;
            } catch (e) { showQaError(e.message || 'Search failed'); }
        }

        // ── Code checks ────────────────────────────────────────────────────────
        async function checkQaCode() {
            const code = (qaCodeEl?.value || '').trim();
            if (!code) { codeAvailable = false; setCreateEnabled(); return; }
            try {
                const d = await apiJson(`/api/units/code-check?code=${encodeURIComponent(code)}&excludeId=`);
                codeAvailable = !!d.available;
                if (!codeAvailable) showQaError('Code already in use — please change it.');
                else if (qaErrorEl?.textContent.includes('Code already')) showQaError('');
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
                if (!editCodeAvailable) showEditError('Code already in use.');
                else if (editErrorEl?.textContent.includes('Code already')) showEditError('');
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

        async function createUnit({ keepParent = false } = {}) {
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
                    for (const f of forces) {
                        const forceSidc = buildSidcFromFields({
                            side: row.side || 'friendly',
                            domain: f.domain,
                            level: 1,
                            entity: (ENTITIES_BY_DOMAIN[f.domain] || ENTITIES_BY_DOMAIN.Land)[0],
                        });
                        await apiJson('/api/units', { method: 'POST', body: JSON.stringify({
                            code: randCode(1), name: f.name, level: 1,
                            parentId: row.id, sidc: forceSidc, unitType: f.unitType,
                        })}).catch(() => {});
                    }
                }

                if (!keepParent) state.selectedId = row.id;
                await refresh();
                resetMainForm();
                qaNameEl?.focus();
            } catch (e) { showQaError(e.message || 'Create failed'); }
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
                        code: randCode(childLvl),
                        name: `${prefix} ${i}`,
                        level: childLvl,
                        parentId: u.id,
                        sidc: null, unitType: null,
                    })});
                }
                await refresh();
                hide(genForm);
            } catch (e) { showGenError(e.message || 'Generate failed'); }
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
                closeEditPanel();
                await refresh();
                // Refresh the map marker (name/side/sidc may have changed)
                if (isPlaced(row)) {
                    document.dispatchEvent(new CustomEvent('units:updated', { detail: {
                        id: row.id, name: row.name, code: row.code, level: row.level,
                        side: row.side, sidc: row.sidc, lat: row.lat, lng: row.lng,
                    } }));
                }
            } catch (e) { showEditError(e.message || 'Save failed'); }
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
                closeEditPanel();
                await refresh();
            } catch (e) { showEditError(e.message || 'Delete failed'); }
        }

        async function restoreUnit() {
            const u = getSelected();
            if (!u) return;
            showEditError('');
            try {
                await apiJson(`/api/units/${encodeURIComponent(u.id)}/restore`, { method: 'POST', body: '{}' });
                await refresh();
            } catch (e) { showEditError(e.message || 'Restore failed'); }
        }

        // ── Events ─────────────────────────────────────────────────────────────
        railBtn.addEventListener('click', (e) => { e.preventDefault(); open(); });
        backdrop?.addEventListener('click', close);
        closeBtn?.addEventListener('click', close);
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.classList.contains('hidden')) close(); });
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
            const delBtn = e.target?.closest?.('.units-tree-del-btn');
            if (delBtn) {
                e.stopPropagation();
                const id = delBtn.getAttribute('data-del-id');
                const u  = state.units.find(x => x.id === id);
                if (!u) return;
                if (!confirm(`Delete "${u.name}"?`)) return;
                try {
                    await apiJson(`/api/units/${encodeURIComponent(id)}/delete`, { method: 'POST', body: '{}' });
                    if (state.selectedId === id) { state.selectedId = null; closeEditPanel(); }
                    await refresh();
                } catch (err) { alert(err.message || 'Delete failed'); }
                return;
            }
            const restoreBtn = e.target?.closest?.('.units-tree-restore-btn');
            if (restoreBtn) {
                e.stopPropagation();
                const id = restoreBtn.getAttribute('data-restore-id');
                try {
                    await apiJson(`/api/units/${encodeURIComponent(id)}/restore`, { method: 'POST', body: '{}' });
                    await refresh();
                } catch (err) { alert(err.message || 'Restore failed'); }
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
        editBtn?.addEventListener('click', openEditPanel);
        editBackBtn?.addEventListener('click', closeEditPanel);
        editNameEl?.addEventListener('input', setEditEnabled);
        editCodeEl?.addEventListener('input', () => {
            editCodeAvailable = true;
            clearTimeout(editCodeCheckTimer);
            editCodeCheckTimer = setTimeout(checkEditCode, 300);
            setEditEnabled();
        });
        saveBtn?.addEventListener('click',    saveUnit);
        deleteBtn?.addEventListener('click',  deleteUnit);
        restoreBtn?.addEventListener('click', restoreUnit);

        // Place on map — close the modal, hand off to units-map.js
        placeBtn?.addEventListener('click', () => {
            const u = getSelected();
            if (!u || !window.AppUnitsMap) return;
            // units-map expects a flat unit descriptor
            const unitRow = state.units.find(x => x.id === u.id) || u;
            close();
            window.AppUnitsMap.beginPlacement({
                id: u.id, name: u.name, code: u.code, level: u.level,
                side: u.side, sidc: unitRow.sidc || u.sidc || null,
            });
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
            } catch (e) { showEditError(e.message || 'Failed to remove from map'); }
        });

        // React when the map finishes placing a unit (dispatched by units-map.js)
        document.addEventListener('units:placed', () => { refresh().catch(() => {}); });

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
        });

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
        createBtn?.addEventListener('click', () => createUnit());
        createAddBtn?.addEventListener('click', () => createUnit({ keepParent: true }));

        // Initial state
        hide(ctxSel); hide(editPanel); hide(noChildrenEl); hide(domainRow); hide(branchRow); hide(quickSetupEl); hide(generateSection);
        show(ctxRoot); show(mainPanel);
        updateMainPanel();
        setCreateEnabled();

        // Expose a way to open the modal on a specific unit (used by map marker popups)
        publicApi.open = async (unitId) => {
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
