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

        // Side selectors
        const sideBtnsEl     = byId('units-side-btns');
        const editSideBtnsEl = byId('units-edit-side-btns');

        // Main panel
        const mainPanel       = byId('units-main-panel');
        const creatingBadge   = byId('units-creating-badge');
        const creatingUnder   = byId('units-creating-under');
        const domainRow       = byId('units-domain-row');
        const domainBtns      = byId('units-domain-btns');
        const qaNameEl        = byId('units-qa-name');
        const qaCodeEl        = byId('units-qa-code');
        const qaSidcEl        = byId('units-qa-sidc');
        const quickSetupEl    = byId('units-quick-setup');
        const qaErrorEl       = byId('units-qa-error');
        const createBtn       = byId('units-create-btn');
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

        const SIDES = [
            { value: 'friendly', label: 'Friendly' },
            { value: 'hostile',  label: 'Hostile'  },
            { value: 'neutral',  label: 'Neutral'  },
            { value: 'unknown',  label: 'Unknown'  },
        ];

        let state     = { roots: [], units: [], selectedId: null };
        let collapsed = new Set();
        let filterSide = null; // null = show all; 'friendly'|'hostile'|'neutral'|'unknown' = filter
        let selectedDomain = null; // for Force creation
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
                hide(quickSetupEl);
                hide(generateSection);
                if (createBtn) createBtn.style.display = 'none';
                return;
            }

            hide(noChildrenEl);
            if (createBtn) createBtn.style.display = '';

            // Creating indicator
            const lbl = levelLabel(lvl);
            if (creatingBadge) { creatingBadge.textContent = lbl; creatingBadge.className = `units-tree-level units-tree-level-${lvl}`; }
            if (creatingUnder) creatingUnder.textContent = u ? `under ${u.name}` : '';
            if (createBtn) createBtn.textContent = `+ Create ${lbl}`;

            // Show creating card
            const creatingCard = mainPanel ? mainPanel.querySelector('.units-creating-card') : null;
            if (creatingCard) creatingCard.style.display = '';

            // Domain row (Force only)
            if (lvl === 1) show(domainRow, 'flex'); else hide(domainRow);

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
        }

        function resetMainForm() {
            if (qaNameEl) qaNameEl.value = '';
            if (qaCodeEl) qaCodeEl.value = '';
            if (qaSidcEl) qaSidcEl.value = '';
            selectedDomain = null;
            domainBtns?.querySelectorAll('.units-domain-btn').forEach(b => b.classList.remove('active'));
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
                return `<div class="units-tree-row ${isSel ? 'active' : ''} ${deleted ? 'deleted' : ''} units-side-row-${nodeSide}" data-id="${escapeHtml(n.id)}" style="padding-inline-start:${pad}px">
                  ${toggleEl}
                  <span class="units-tree-level units-tree-level-${n.level}">${escapeHtml(lbl)}</span>
                  <span class="units-tree-label">${escapeHtml(n.name)}</span>
                  ${countBadge}
                  <span class="units-tree-spacer"></span>
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
        async function createUnit() {
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
                sidc:     (qaSidcEl?.value || '').trim() || null,
                unitType: selectedDomain || null,
                side:     selectedSide || 'friendly',
            };
            try {
                const row = await apiJson('/api/units', { method: 'POST', body: JSON.stringify(payload) });

                // Quick Setup: auto-create standard forces under a new Army
                if (lvl === 0) {
                    const forces = [];
                    if (byId('qs-air')?.checked)   forces.push({ name: 'Air Force',   unitType: 'Air' });
                    if (byId('qs-land')?.checked)  forces.push({ name: 'Land Force',  unitType: 'Land' });
                    if (byId('qs-naval')?.checked) forces.push({ name: 'Naval Force', unitType: 'Naval' });
                    for (const f of forces) {
                        await apiJson('/api/units', { method: 'POST', body: JSON.stringify({
                            code: randCode(1), name: f.name, level: 1,
                            parentId: row.id, sidc: null, unitType: f.unitType,
                        })}).catch(() => {});
                    }
                }

                state.selectedId = row.id;
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
            } catch (e) { showEditError(e.message || 'Save failed'); }
        }

        // ── DELETE / RESTORE ───────────────────────────────────────────────────
        async function deleteUnit() {
            const u = getSelected();
            if (!u) return;
            showEditError('');
            try {
                await apiJson(`/api/units/${encodeURIComponent(u.id)}/delete`, { method: 'POST', body: '{}' });
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

        // Side buttons (create form)
        sideBtnsEl?.addEventListener('click', (e) => {
            const btn = e.target?.closest?.('.units-side-btn');
            if (!btn) return;
            selectedSide = btn.getAttribute('data-side') || 'friendly';
            setSideUI(sideBtnsEl, selectedSide);
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
                btn.classList.remove('active');
            } else {
                selectedDomain = domain;
                domainBtns.querySelectorAll('.units-domain-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
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
        createBtn?.addEventListener('click', createUnit);

        // Initial state
        hide(ctxSel); hide(editPanel); hide(noChildrenEl); hide(domainRow); hide(quickSetupEl); hide(generateSection);
        show(ctxRoot); show(mainPanel);
        updateMainPanel();
        setCreateEnabled();
    }

    window.AppUnits = { init };
})();
