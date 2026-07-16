'use strict';
/**
 * scenario-library.js — Batch D Slice 6: the Scenario Library.
 *
 * The ONE canonical, discoverable place to browse every authored scenario —
 * search/filter, owner, status, revision, approval, last-modified — sourced
 * from the enhanced GET /api/ai/scenarios?detail=1 (Batch D Slice 1-5's
 * server-side work; no new list endpoint). Replaces
 * native-scenario-loader.js's bare `openScenarioPicker()` dropdown modal,
 * which listed nothing but filenames and gave no visibility into approval
 * state — a real, pre-existing duplication this batch's audit flagged
 * (two disconnected scenario pickers with different approval-gating
 * guarantees; see APP_INVENTORY.md's Batch D row).
 *
 * Deliberately does NOT change what "Load on Map" does — that still calls
 * the existing `AppNativeScenarioLoader.loadScenarioByName()` unchanged (a
 * legitimate direct-to-map viewing path). "Open in Builder" reuses the
 * SAME switchTool('scenario-workspace') + AppEditMode.setMode(true) sequence
 * already established for the New-Scenario blank-draft flow in
 * native-scenario-loader.js — not a new mechanism.
 */
(function (global) {
    var STATUS_COLORS = {
        draft: '#8fa5b8', in_review: '#e0a93a', approved: '#7fd6a0',
        rejected: '#f0707a', activated: '#4a9fd8', archived: '#6a7280',
    };
    var STATUS_LABELS = {
        draft: 'Draft · مسودة', in_review: 'In Review · قيد المراجعة',
        approved: 'Approved · معتمد', rejected: 'Rejected · مرفوض',
        activated: 'Activated · مفعّل', archived: 'Archived · مؤرشف',
    };

    var SECTION_TITLES = {
        units: 'Units · الوحدات', placement: 'Placement · المواقع', doctrine: 'Doctrine · العقيدة',
        missions: 'Missions · المهام', runtime_events: 'Events · الأحداث', objectives: 'Objectives · الأهداف',
        victory_conditions: 'Victory Conditions · شروط النصر', timing: 'Timing · التوقيت',
        metadata: 'Other Metadata · بيانات أخرى',
    };

    var _panel = null;
    var _box = null;
    var _view = 'list'; // 'list' | 'revisions' — gates arrow/Enter keyboard nav to the list view only
    var _allRows = [];
    var _filtered = [];
    var _selectedIdx = -1;

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function fmtDate(iso) {
        if (!iso) return '—';
        try { return new Date(iso).toLocaleString(); } catch (_) { return iso; }
    }
    function statusPill(status) {
        var color = STATUS_COLORS[status] || '#8fa5b8';
        // Any status not in the known enum — null (a legacy/orphan scenario
        // with no lifecycle row) OR an unrecognized string — degrades to the
        // same honest "Unmanaged" label, never a blank pill or the raw value.
        var label = STATUS_LABELS[status] || 'Unmanaged · غير مُدار';
        return '<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;' +
            'background:' + color + '22;color:' + color + ';border:1px solid ' + color + '55;">' + esc(label) + '</span>';
    }

    function fetchScenarios() {
        return fetch('/api/ai/scenarios?detail=1', { credentials: 'include' })
            .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
            .then(function (j) { return (j && Array.isArray(j.scenarios)) ? j.scenarios : []; });
    }

    // Pure — no DOM, no module state — so it's directly unit-testable
    // (exposed via _testing below) without a browser or DOM stub.
    function filterAndSortScenarios(rows, searchText, statusFilter) {
        var q = (searchText || '').trim().toLowerCase();
        var out = (rows || []).filter(function (row) {
            if (statusFilter && statusFilter !== 'all') {
                var effectiveStatus = row.status || 'unmanaged';
                if (effectiveStatus !== statusFilter) return false;
            }
            if (!q) return true;
            var hay = (row.name + ' ' + (row.label || '')).toLowerCase();
            return hay.indexOf(q) !== -1;
        });
        // Most-recently-modified first — the operationally relevant default.
        out.sort(function (a, b) {
            var ta = a.last_modified ? Date.parse(a.last_modified) : 0;
            var tb = b.last_modified ? Date.parse(b.last_modified) : 0;
            return tb - ta;
        });
        return out;
    }

    function applyFilters(searchText, statusFilter) {
        _filtered = filterAndSortScenarios(_allRows, searchText, statusFilter);
        _selectedIdx = _filtered.length ? 0 : -1;
        renderRows();
    }

    function openInBuilder(name) {
        var loader = global.AppNativeScenarioLoader;
        if (!loader || typeof loader.loadScenarioByName !== 'function') return;
        loader.loadScenarioByName(name);
        // Same sequence native-scenario-loader.js already uses for the blank
        // New-Scenario draft flow — give loadLiveScenarioFromJson's map-fit
        // time to settle before switching tool + entering Edit Mode.
        setTimeout(function () {
            try { if (global.AppToolRail && typeof global.AppToolRail.switchTool === 'function') global.AppToolRail.switchTool('scenario-workspace'); } catch (_) {}
            try { if (global.AppEditMode && typeof global.AppEditMode.setMode === 'function') global.AppEditMode.setMode(true); } catch (_) {}
        }, 600);
        close();
    }

    function loadOnMap(name) {
        var loader = global.AppNativeScenarioLoader;
        if (loader && typeof loader.loadScenarioByName === 'function') loader.loadScenarioByName(name);
        close();
    }

    function rowActionsHtml(row) {
        return '<button type="button" class="rmooz-lib-action" data-act="open-builder" data-name="' + esc(row.name) + '">Open in Builder · فتح للتحرير</button>' +
               '<button type="button" class="rmooz-lib-action rmooz-lib-action-sec" data-act="load-map" data-name="' + esc(row.name) + '">Load on Map · تحميل على الخريطة</button>' +
               '<button type="button" class="rmooz-lib-action rmooz-lib-action-sec" data-act="revisions" data-name="' + esc(row.name) + '">Revisions · الإصدارات</button>';
    }

    function renderRows() {
        if (!_panel) return;
        var list = _panel.querySelector('#rmooz-lib-list');
        if (!list) return;
        if (!_filtered.length) {
            list.innerHTML = '<div class="rmooz-lib-empty">No scenarios match · لا توجد نتائج</div>';
            return;
        }
        list.innerHTML = _filtered.map(function (row, idx) {
            var selected = idx === _selectedIdx ? ' rmooz-lib-row-selected' : '';
            return '<div class="rmooz-lib-row' + selected + '" data-idx="' + idx + '" role="option" aria-selected="' + (idx === _selectedIdx) + '">' +
                '<div class="rmooz-lib-row-main">' +
                    '<div class="rmooz-lib-row-label">' + esc(row.label || row.name) + '</div>' +
                    '<div class="rmooz-lib-row-name">' + esc(row.name) + '</div>' +
                '</div>' +
                '<div class="rmooz-lib-row-meta">' +
                    statusPill(row.status) +
                    '<span class="rmooz-lib-meta-item">Owner: ' + esc(row.owner || '—') + '</span>' +
                    '<span class="rmooz-lib-meta-item">Rev: ' + esc(row.revision != null ? row.revision : '—') + '</span>' +
                    '<span class="rmooz-lib-meta-item">' + esc(fmtDate(row.last_modified)) + '</span>' +
                '</div>' +
                '<div class="rmooz-lib-row-actions">' + rowActionsHtml(row) + '</div>' +
            '</div>';
        }).join('');
    }

    function selectDelta(delta) {
        if (!_filtered.length) return;
        _selectedIdx = Math.max(0, Math.min(_filtered.length - 1, _selectedIdx + delta));
        renderRows();
        var el = _panel && _panel.querySelector('.rmooz-lib-row-selected');
        if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
    }

    function activateSelected() {
        if (_selectedIdx < 0 || !_filtered[_selectedIdx]) return;
        loadOnMap(_filtered[_selectedIdx].name);
    }

    function onKeydown(e) {
        if (e.key === 'Escape') { e.preventDefault(); close(); return; }
        // Row-navigation keys only apply to the list view — in the revisions
        // view they'd silently no-op against list rows that aren't on screen,
        // which is harmless but not real keyboard support for that view.
        if (_view !== 'list') return;
        if (e.key === 'ArrowDown') { e.preventDefault(); selectDelta(1); return; }
        if (e.key === 'ArrowUp') { e.preventDefault(); selectDelta(-1); return; }
        if (e.key === 'Enter') { e.preventDefault(); activateSelected(); return; }
    }

    function close() {
        if (_panel && _panel.parentNode) _panel.parentNode.removeChild(_panel);
        _panel = null;
        _box = null;
        document.removeEventListener('keydown', onKeydown, true);
    }

    function renderListView() {
        _view = 'list';
        _box.innerHTML =
            '<div class="rmooz-lib-header">' +
                '<div class="rmooz-lib-title">Scenario Library · مكتبة السيناريوهات</div>' +
                '<button type="button" class="rmooz-lib-close" id="rmooz-lib-close" aria-label="Close · إغلاق">✕</button>' +
            '</div>' +
            '<div class="rmooz-lib-controls">' +
                '<input type="text" id="rmooz-lib-search" class="rmooz-lib-search" placeholder="Search name or label · بحث بالاسم أو العنوان">' +
                '<select id="rmooz-lib-status" class="rmooz-lib-status-select">' +
                    '<option value="all">All statuses · جميع الحالات</option>' +
                    '<option value="draft">Draft · مسودة</option>' +
                    '<option value="in_review">In Review · قيد المراجعة</option>' +
                    '<option value="approved">Approved · معتمد</option>' +
                    '<option value="rejected">Rejected · مرفوض</option>' +
                    '<option value="activated">Activated · مفعّل</option>' +
                    '<option value="archived">Archived · مؤرشف</option>' +
                '</select>' +
            '</div>' +
            '<div id="rmooz-lib-list" class="rmooz-lib-list" role="listbox" aria-label="Scenario Library results">Loading · جارٍ التحميل…</div>';

        _box.querySelector('#rmooz-lib-close').addEventListener('click', close);
        var searchInp = _box.querySelector('#rmooz-lib-search');
        var statusSel = _box.querySelector('#rmooz-lib-status');
        searchInp.addEventListener('input', function () { applyFilters(searchInp.value, statusSel.value); });
        statusSel.addEventListener('change', function () { applyFilters(searchInp.value, statusSel.value); });
        _box.querySelector('#rmooz-lib-list').addEventListener('click', function (e) {
            var btn = e.target.closest ? e.target.closest('[data-act]') : null;
            if (btn) {
                var name = btn.getAttribute('data-name');
                var act = btn.getAttribute('data-act');
                if (act === 'open-builder') openInBuilder(name);
                else if (act === 'load-map') loadOnMap(name);
                else if (act === 'revisions') openRevisionsView(name);
                return;
            }
            var row = e.target.closest ? e.target.closest('.rmooz-lib-row') : null;
            if (row) { _selectedIdx = parseInt(row.getAttribute('data-idx'), 10); renderRows(); }
        });
        searchInp.focus();

        if (_allRows.length) { applyFilters('', 'all'); return; }
        fetchScenarios().then(function (rows) {
            _allRows = rows;
            applyFilters('', 'all');
        }).catch(function (e) {
            var list = _box.querySelector('#rmooz-lib-list');
            if (list) list.innerHTML = '<div class="rmooz-lib-empty">Could not load scenarios: ' + esc(e && e.message) + '</div>';
        });
    }

    // ── D7: revision compare/restore view ───────────────────────────────────
    function fetchRevisions(name) {
        return fetch('/api/scenarios/' + encodeURIComponent(name) + '/revisions', { credentials: 'include' })
            .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
            .then(function (j) { return (j && Array.isArray(j.revisions)) ? j.revisions : []; });
    }
    function fetchCompare(name, a, b) {
        return fetch('/api/scenarios/' + encodeURIComponent(name) + '/revisions/' + a + '/compare/' + b, { credentials: 'include' })
            .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); });
    }
    // D8: full provenance — author/approver/rejecter/activator/archiver +
    // timestamps + the complete append-only history (every submit/approve/
    // reject/reopen/archive/restore-from-archive event, not just the latest
    // of each). A scenario with no lifecycle record at all (a legacy file
    // never touched through the real workflow) returns null, handled
    // honestly rather than fabricated.
    function fetchApproval(name) {
        return fetch('/api/scenarios/' + encodeURIComponent(name) + '/approval', { credentials: 'include' })
            .then(function (r) {
                if (r.status === 404) return null;
                if (!r.ok) throw new Error('http ' + r.status);
                return r.json();
            });
    }
    var HISTORY_EVENT_LABELS = {
        authored: 'Authored · تم التأليف', submitted_for_review: 'Submitted for review · قُدّم للمراجعة',
        reviewed: 'Reviewed · تمت المراجعة', approved: 'Approved · اعتُمد', rejected: 'Rejected · رُفض',
        reopened: 'Reopened to draft · أُعيد فتحه كمسودة', activated: 'Activated · فُعّل',
        archived: 'Archived · أُرشف', restored_from_archive: 'Restored from archive · استُعيد من الأرشيف',
        revision_invalidated_approval: 'Approval invalidated by a new revision · أُبطل الاعتماد بإصدار جديد',
    };
    // Pure — the approval payload -> human-readable provenance HTML. Exposed
    // via _testing for direct unit-testing without a DOM.
    function renderProvenanceHtml(payload) {
        if (!payload) {
            return '<div class="rmooz-lib-empty">No lifecycle record — this scenario has never been submitted through the approval workflow · لا يوجد سجل دورة حياة</div>';
        }
        var lines = [];
        lines.push('Author · المؤلف: ' + esc(payload.author_id || '—'));
        if (payload.submitted_by) lines.push('Submitted by · قدّمه: ' + esc(payload.submitted_by) + ' (' + esc(fmtDate(payload.submitted_at)) + ')');
        if (payload.approved_by) lines.push('Approved by · اعتمده: ' + esc(payload.approved_by) + ' (' + esc(fmtDate(payload.approved_at)) + ') — revision ' + esc(payload.approved_revision != null ? payload.approved_revision : '—'));
        if (payload.rejected_by) lines.push('Rejected by · رفضه: ' + esc(payload.rejected_by) + ' (' + esc(fmtDate(payload.rejected_at)) + ') — ' + esc(payload.reject_reason || 'no reason given'));
        if (payload.activated_by) lines.push('Activated by · فعّله: ' + esc(payload.activated_by) + ' (' + esc(fmtDate(payload.activated_at)) + ') — revision ' + esc(payload.activated_revision != null ? payload.activated_revision : '—'));
        if (payload.archived_by) lines.push('Archived by · أرشفه: ' + esc(payload.archived_by) + ' (' + esc(fmtDate(payload.archived_at)) + ')');

        var html = '<div class="rmooz-rev-provenance-lines">' + lines.map(function (l) { return '<div>' + l + '</div>'; }).join('') + '</div>';
        if (payload.history && payload.history.length) {
            html += '<div class="rmooz-lib-diff-title" style="margin-top:10px;">History · السجل</div>' +
                '<ul class="rmooz-lib-diff-lines">' + payload.history.map(function (h) {
                    var label = HISTORY_EVENT_LABELS[h.event] || h.event;
                    return '<li>' + esc(fmtDate(h.ts)) + ' — ' + esc(label) + ' — ' + esc(h.actor_id || '—') + (h.reason ? (': ' + esc(h.reason)) : '') + '</li>';
                }).join('') + '</ul>';
        }
        return html;
    }
    function fmtValue(v) {
        if (v == null) return '—';
        if (typeof v === 'object') { try { return JSON.stringify(v).slice(0, 60); } catch (_) { return '(object)'; } }
        return String(v);
    }
    // Best-effort human label for an added/removed item — tries a label/
    // title/name field first, falls back to whatever id field the section
    // uses (uid for red units, unit_uid for blue, id for everything else).
    function describeItem(item) {
        if (item == null) return '—';
        if (typeof item !== 'object') return String(item);
        var label = item.label || item.title || item.name;
        var idVal = item.uid || item.unit_uid || item.id;
        if (label && idVal) return label + ' (' + idVal + ')';
        if (label) return label;
        if (idVal) return String(idVal);
        try { return JSON.stringify(item).slice(0, 80); } catch (_) { return '(item)'; }
    }
    // A metadata field (e.g. "obj", "postures") can itself be a plain object
    // — dumping its raw JSON would violate "no raw JSON shown to the
    // operator". Describe it as a shallow list of which of ITS OWN keys
    // changed instead (one level deep — matches this diff's field-level,
    // not deep-structural, scope).
    function isPlainObject(v) { return v != null && typeof v === 'object' && !Array.isArray(v); }
    function describeObjectFieldChange(field, before, after) {
        var b = isPlainObject(before) ? before : {};
        var a = isPlainObject(after) ? after : {};
        var keys = Object.keys(b).concat(Object.keys(a)).filter(function (k, i, arr) { return arr.indexOf(k) === i; });
        var subChanges = keys.filter(function (k) {
            return JSON.stringify(b[k]) !== JSON.stringify(a[k]);
        }).map(function (k) {
            return esc(k) + ': ' + esc(fmtValue(b[k])) + ' → ' + esc(fmtValue(a[k]));
        });
        return esc(field) + ' (' + (subChanges.join('; ') || 'changed') + ')';
    }
    function describeFieldChange(f) {
        if (isPlainObject(f.before) && isPlainObject(f.after)) return describeObjectFieldChange(f.field, f.before, f.after);
        return esc(f.field) + ': ' + esc(fmtValue(f.before)) + ' → ' + esc(fmtValue(f.after));
    }
    // Pure — converts one section of the structured diff (scenario-revision-
    // compare.js's output) into human-readable lines. No JSON is shown raw to
    // the operator; every line names WHAT changed in plain language.
    function describeDiffSection(key, section) {
        var lines = [];
        if (key === 'placement') {
            (section.moved || []).forEach(function (m) {
                lines.push('↔ ' + esc(String(m.id)) + ' moved: ' + esc(fmtValue(m.before)) + ' → ' + esc(fmtValue(m.after)));
            });
            return lines;
        }
        if (key === 'metadata' || key === 'timing') {
            (section.changed || []).forEach(function (f) { lines.push('~ ' + describeFieldChange(f)); });
            return lines;
        }
        (section.added || []).forEach(function (item) { lines.push('+ Added · أُضيف: ' + esc(describeItem(item))); });
        (section.removed || []).forEach(function (item) { lines.push('− Removed · أُزيل: ' + esc(describeItem(item))); });
        (section.changed || []).forEach(function (c) {
            var fieldsStr = (c.fields || []).map(describeFieldChange).join('; ');
            lines.push('~ ' + esc(String(c.id)) + ': ' + fieldsStr);
        });
        return lines;
    }
    // Pure — the full diff object -> { sectionKey: [line, ...] }, only for
    // sections that actually changed. Exposed via _testing for direct
    // unit-testing without a DOM.
    function describeDiff(diff) {
        var out = {};
        var sections = (diff && diff.sections) || {};
        Object.keys(sections).forEach(function (key) {
            var lines = describeDiffSection(key, sections[key]);
            if (lines.length) out[key] = lines;
        });
        return out;
    }
    function renderDiffHtml(diff) {
        var described = describeDiff(diff);
        var keys = Object.keys(described);
        if (!keys.length) return '<div class="rmooz-lib-empty">No differences between these revisions · لا توجد اختلافات</div>';
        return keys.map(function (key) {
            return '<div class="rmooz-lib-diff-section">' +
                '<div class="rmooz-lib-diff-title">' + esc(SECTION_TITLES[key] || key) + '</div>' +
                '<ul class="rmooz-lib-diff-lines">' + described[key].map(function (l) { return '<li>' + l + '</li>'; }).join('') + '</ul>' +
            '</div>';
        }).join('');
    }

    function restoreRevision(name, n, confirmFn) {
        var confirm2 = confirmFn || global.confirm;
        var msg = 'Restore revision ' + n + ' as a new draft? This creates a NEW revision — it never rewrites history.\n' +
                  'استعادة الإصدار ' + n + ' كمسودة جديدة؟ هذا يُنشئ إصداراً جديداً ولا يُعيد كتابة التاريخ.';
        if (!confirm2(msg)) return Promise.resolve(null);
        return fetch('/api/scenarios/' + encodeURIComponent(name) + '/revisions/' + n + '/restore', {
            method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}'
        }).then(function (r) { return r.json().then(function (j) { return { status: r.status, body: j }; }); });
    }

    function revisionOptionsHtml(revisions, selectedNumber) {
        return revisions.map(function (r) {
            var sel = r.revision_number === selectedNumber ? ' selected' : '';
            return '<option value="' + r.revision_number + '"' + sel + '>Rev ' + r.revision_number + ' · ' + esc(r.source) + '</option>';
        }).join('');
    }

    // D9/D10 follow-up: Clone, Save as Template, and Archive/Restore-from-
    // Archive were built server-side in Slice 5 but never given a UI entry
    // point — a real gap (the batch's own scope explicitly lists these as
    // operator-facing features, not just endpoints). Surfaced here in the
    // Revisions view's management toolbar rather than cluttering every list
    // row with 6 buttons.
    function cloneScenario(name, promptFn) {
        var prompt2 = promptFn || global.prompt;
        var newName = prompt2('Clone "' + name + '" as a new scenario — enter a name for the copy:\nاستنساخ السيناريو باسم جديد:');
        if (!newName || !newName.trim()) return Promise.resolve(null);
        return fetch('/api/scenarios/' + encodeURIComponent(name) + '/clone', {
            method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ new_name: newName.trim() })
        }).then(function (r) { return r.json().then(function (j) { return { status: r.status, body: j }; }); });
    }
    function saveScenarioAsTemplate(name, promptFn) {
        var prompt2 = promptFn || global.prompt;
        var label = prompt2('Save "' + name + '" as a reusable template — enter a label:\nحفظ كقالب قابل لإعادة الاستخدام — أدخل تسمية:');
        if (!label || !label.trim()) return Promise.resolve(null);
        return fetch('/api/scenarios/' + encodeURIComponent(name) + '/save-as-template', {
            method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label: label.trim() })
        }).then(function (r) { return r.json().then(function (j) { return { status: r.status, body: j }; }); });
    }
    function archiveOrRestoreScenario(name, isArchived, confirmFn) {
        var confirm2 = confirmFn || global.confirm;
        var action = isArchived ? 'restore-from-archive' : 'archive';
        var msg = isArchived
            ? 'Restore "' + name + '" from archive? It returns to its exact pre-archive status.\nاستعادة السيناريو من الأرشيف؟'
            : 'Archive "' + name + '"? This is reversible — it never deletes anything.\nأرشفة السيناريو؟ هذا إجراء قابل للعكس ولا يحذف أي شيء.';
        if (!confirm2(msg)) return Promise.resolve(null);
        return fetch('/api/scenarios/' + encodeURIComponent(name) + '/' + action, {
            method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}'
        }).then(function (r) { return r.json().then(function (j) { return { status: r.status, body: j }; }); });
    }

    function openRevisionsView(name, opts) {
        opts = opts || {};
        ensurePanel();
        _view = 'revisions';
        _box.innerHTML =
            '<div class="rmooz-lib-header">' +
                '<button type="button" class="rmooz-lib-close" id="rmooz-lib-back" aria-label="Back · رجوع">← Back · رجوع</button>' +
                '<div class="rmooz-lib-title">Revisions · الإصدارات — ' + esc(name) + '</div>' +
                '<button type="button" class="rmooz-lib-close" id="rmooz-lib-close" aria-label="Close · إغلاق">✕</button>' +
            '</div>' +
            '<div id="rmooz-rev-body" class="rmooz-lib-list">Loading · جارٍ التحميل…</div>';
        _box.querySelector('#rmooz-lib-back').addEventListener('click', renderListView);
        _box.querySelector('#rmooz-lib-close').addEventListener('click', close);

        Promise.all([fetchRevisions(name), fetchApproval(name)]).then(function (results) {
            var revisions = results[0], approval = results[1];
            var body = _box.querySelector('#rmooz-rev-body');
            if (!body) return;
            if (!revisions.length) { body.innerHTML = '<div class="rmooz-lib-empty">No revisions yet · لا توجد إصدارات بعد</div>'; return; }
            var latest = revisions[revisions.length - 1].revision_number;
            var prior = revisions.length > 1 ? revisions[revisions.length - 2].revision_number : latest;
            var statusHtml = opts.statusMessage
                ? '<div id="rmooz-rev-status" class="rmooz-rev-status ' + (opts.statusIsError ? 'rmooz-rev-status-error' : 'rmooz-rev-status-ok') + '" role="status" aria-live="polite">' + esc(opts.statusMessage) + '</div>'
                : '<div id="rmooz-rev-status" class="rmooz-rev-status" role="status" aria-live="polite"></div>';
            var isArchived = approval && approval.status === 'archived';
            var archiveLabel = isArchived ? 'Restore from Archive · استعادة من الأرشيف' : 'Archive · أرشفة';
            body.innerHTML =
                statusHtml +
                '<div class="rmooz-rev-manage-toolbar">' +
                    '<button type="button" class="rmooz-lib-action rmooz-lib-action-sec" id="rmooz-rev-clone">Clone · استنساخ</button>' +
                    '<button type="button" class="rmooz-lib-action rmooz-lib-action-sec" id="rmooz-rev-save-template">Save as Template · حفظ كقالب</button>' +
                    '<button type="button" class="rmooz-lib-action rmooz-lib-action-sec" id="rmooz-rev-archive">' + esc(archiveLabel) + '</button>' +
                '</div>' +
                '<table class="rmooz-rev-table"><thead><tr>' +
                    '<th>Rev</th><th>Source · المصدر</th><th>By · بواسطة</th><th>When · متى</th><th></th>' +
                '</tr></thead><tbody>' +
                revisions.slice().reverse().map(function (r) {
                    return '<tr>' +
                        '<td>' + r.revision_number + '</td>' +
                        '<td>' + esc(r.source) + '</td>' +
                        '<td>' + esc(r.created_by || '—') + '</td>' +
                        '<td>' + esc(fmtDate(r.created_at)) + '</td>' +
                        '<td><button type="button" class="rmooz-lib-action rmooz-lib-action-sec" data-restore="' + r.revision_number + '">Restore · استعادة</button></td>' +
                    '</tr>';
                }).join('') +
                '</tbody></table>' +
                '<div class="rmooz-rev-compare">' +
                    '<div class="rmooz-lib-diff-title">Compare revisions · مقارنة الإصدارات</div>' +
                    '<div class="rmooz-rev-compare-controls">' +
                        '<select id="rmooz-rev-a">' + revisionOptionsHtml(revisions, prior) + '</select>' +
                        '<span>vs · مقابل</span>' +
                        '<select id="rmooz-rev-b">' + revisionOptionsHtml(revisions, latest) + '</select>' +
                        '<button type="button" class="rmooz-lib-action" id="rmooz-rev-compare-btn">Compare · قارن</button>' +
                    '</div>' +
                    '<div id="rmooz-rev-diff"></div>' +
                '</div>' +
                '<div class="rmooz-rev-provenance">' +
                    '<div class="rmooz-lib-diff-title">Provenance & History · المصدر والسجل</div>' +
                    renderProvenanceHtml(approval) +
                '</div>';

            function setStatus(msg, isError) {
                var el = body.querySelector('#rmooz-rev-status');
                if (!el) return;
                el.textContent = msg;
                el.className = 'rmooz-rev-status' + (isError ? ' rmooz-rev-status-error' : ' rmooz-rev-status-ok');
            }

            body.querySelectorAll('[data-restore]').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var n = parseInt(btn.getAttribute('data-restore'), 10);
                    restoreRevision(name, n, opts.confirmFn).then(function (result) {
                        if (result === null) return; // operator declined the confirmation — no status change needed
                        if (result.status === 200) {
                            // The view is about to be fully rebuilt (fresh
                            // revision list + provenance) — bake the status
                            // message into THAT render rather than patching
                            // the current, soon-to-be-replaced DOM (which
                            // would silently write to a detached node).
                            openRevisionsView(name, Object.assign({}, opts, {
                                statusMessage: 'Restored as revision ' + result.body.revision + ' · تمت الاستعادة كإصدار ' + result.body.revision,
                                statusIsError: false,
                            }));
                        } else {
                            setStatus('Restore failed · فشلت الاستعادة: ' + ((result.body && result.body.error) || ('HTTP ' + result.status)), true);
                        }
                    }).catch(function (e) {
                        setStatus('Restore failed · فشلت الاستعادة: ' + (e && e.message), true);
                    });
                });
            });
            var runCompare = function () {
                var a = body.querySelector('#rmooz-rev-a').value;
                var b = body.querySelector('#rmooz-rev-b').value;
                var diffEl = body.querySelector('#rmooz-rev-diff');
                diffEl.innerHTML = 'Comparing · جارٍ المقارنة…';
                fetchCompare(name, a, b).then(function (diff) {
                    diffEl.innerHTML = renderDiffHtml(diff);
                }).catch(function (e) {
                    diffEl.innerHTML = '<div class="rmooz-lib-empty">Could not compare: ' + esc(e && e.message) + '</div>';
                });
            };
            body.querySelector('#rmooz-rev-compare-btn').addEventListener('click', runCompare);
            runCompare();

            body.querySelector('#rmooz-rev-clone').addEventListener('click', function () {
                cloneScenario(name, opts.promptFn).then(function (result) {
                    if (result === null) return; // operator cancelled the prompt
                    if (result.status === 200) {
                        setStatus('Cloned as "' + result.body.name + '" · تم الاستنساخ باسم "' + result.body.name + '"', false);
                    } else {
                        setStatus('Clone failed · فشل الاستنساخ: ' + ((result.body && result.body.error) || ('HTTP ' + result.status)), true);
                    }
                }).catch(function (e) { setStatus('Clone failed · فشل الاستنساخ: ' + (e && e.message), true); });
            });
            body.querySelector('#rmooz-rev-save-template').addEventListener('click', function () {
                saveScenarioAsTemplate(name, opts.promptFn).then(function (result) {
                    if (result === null) return;
                    if (result.status === 200) {
                        setStatus('Saved as template "' + result.body.template.label + '" · حُفظ كقالب "' + result.body.template.label + '"', false);
                    } else {
                        setStatus('Save as template failed · فشل الحفظ كقالب: ' + ((result.body && result.body.error) || ('HTTP ' + result.status)), true);
                    }
                }).catch(function (e) { setStatus('Save as template failed · فشل الحفظ كقالب: ' + (e && e.message), true); });
            });
            body.querySelector('#rmooz-rev-archive').addEventListener('click', function () {
                archiveOrRestoreScenario(name, isArchived, opts.confirmFn).then(function (result) {
                    if (result === null) return;
                    if (result.status === 200) {
                        openRevisionsView(name, Object.assign({}, opts, {
                            statusMessage: isArchived
                                ? 'Restored from archive · تمت الاستعادة من الأرشيف'
                                : 'Archived · تمت الأرشفة',
                            statusIsError: false,
                        }));
                    } else {
                        setStatus((isArchived ? 'Restore-from-archive' : 'Archive') + ' failed: ' + ((result.body && result.body.error) || ('HTTP ' + result.status)), true);
                    }
                }).catch(function (e) { setStatus((isArchived ? 'Restore-from-archive' : 'Archive') + ' failed: ' + (e && e.message), true); });
            });
        }).catch(function (e) {
            var body = _box.querySelector('#rmooz-rev-body');
            if (body) body.innerHTML = '<div class="rmooz-lib-empty">Could not load revisions: ' + esc(e && e.message) + '</div>';
        });
    }

    // Creates the modal shell (backdrop + box) if it doesn't already exist.
    // Both open() and openRevisionsView() go through this — so
    // openRevisionsView(name) works as a genuine standalone entry point
    // (e.g. a future direct link into a scenario's history) and not only as
    // a row action inside an already-open Library.
    function ensurePanel() {
        if (_panel) return;
        var backdrop = document.createElement('div');
        backdrop.id = 'rmooz-scenario-library';
        backdrop.setAttribute('dir', (document.documentElement.dir === 'rtl') ? 'rtl' : 'ltr');
        backdrop.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:24px;';
        var box = document.createElement('div');
        box.className = 'rmooz-lib-box';
        backdrop.appendChild(box);
        document.body.appendChild(backdrop);
        _panel = backdrop;
        _box = box;

        backdrop.addEventListener('click', function (e) { if (e.target === backdrop) close(); });
        document.addEventListener('keydown', onKeydown, true);
    }

    function open() {
        var alreadyOpen = !!_panel;
        ensurePanel();
        if (!alreadyOpen) renderListView();
    }

    // Self-mounting tool-rail trigger — same pattern as import-plan.js's own
    // `.tool-rail-btn[data-tool="import"]` binding. data-tool="scenario-library"
    // has no TOOL_CONFIG entry, so tool-rail.js's switchTool() no-ops for it;
    // this is the ONLY normal-operator-reachable entry point for the Library
    // (native-scenario-loader.js's openScenarioPicker() delegates to open()
    // too, but its own trigger, #tl-load-scenario, lives inside the
    // data-dev-only #timeline-strip, hidden by default).
    function mountToolRailButton() {
        // Some test harnesses load this file against a minimal document stub
        // (createElement/getElementById only, no querySelector) — degrade to
        // a no-op there rather than throwing at module-load time.
        if (typeof document.querySelector !== 'function') return;
        var btn = document.querySelector('.tool-rail-btn[data-tool="scenario-library"]');
        if (!btn || btn._rmoozLibraryBound) return;
        btn._rmoozLibraryBound = true;
        btn.addEventListener('click', open);
    }
    if (document.readyState === 'loading' && typeof document.addEventListener === 'function') {
        document.addEventListener('DOMContentLoaded', mountToolRailButton);
    } else {
        mountToolRailButton();
    }

    global.AppScenarioLibrary = {
        open: open, close: close,
        openRevisionsView: openRevisionsView,
        _testing: {
            filterAndSortScenarios: filterAndSortScenarios,
            statusPill: statusPill,
            fmtDate: fmtDate,
            esc: esc,
            STATUS_LABELS: STATUS_LABELS,
            describeItem: describeItem,
            describeDiffSection: describeDiffSection,
            describeDiff: describeDiff,
            renderDiffHtml: renderDiffHtml,
            SECTION_TITLES: SECTION_TITLES,
            renderProvenanceHtml: renderProvenanceHtml,
            HISTORY_EVENT_LABELS: HISTORY_EVENT_LABELS,
        },
    };
})(typeof window !== 'undefined' ? window : global);
