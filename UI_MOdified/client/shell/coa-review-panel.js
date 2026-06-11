/* ============================================================================
 * coa-review-panel.js — DOC-UNDERSTANDING-1 / G-3 (build contract:
 * docs/coa-wargame-design.md §1, owner rulings D1–D10).
 * ----------------------------------------------------------------------------
 * COA Review Panel — renders operational_brief.courses_of_action[] (the G-2
 * adapter contract) as commander-friendly cards inside the AI-Understanding
 * review, with client-side Select / Reject / Edit / Compare state.
 *
 * Locked behavior:
 *   • BLUE possibilities first, then Enemy Most Likely, then an Enemy Most
 *     Dangerous placeholder when missing ("not generated / needs Generate
 *     More" — D3: never invented).
 *   • coa_recommendation is RATIONALE ONLY — never auto-selected, decided_by
 *     never set here. Only the operator's explicit Select approves (D9).
 *   • Generation gate: when COAs exist, a selected/approved BLUE COA is
 *     required (doc-understanding-review.js consults canGenerate()).
 *   • Rejected COAs cannot be selected until un-rejected.
 *   • Generate More is pending (deployment LLM) — no stub behavior invented.
 *
 * The state machine (createState/select/reject/…) is DOM-free on purpose so
 * scripts/test-coa-review-panel-1.js can drive it under node. render() is the
 * only DOM-touching function.
 *
 *   window.RmoozCoaPanel = { hasCoas, createState, select, reject, unreject,
 *     toggleCompare, applyEdit, coaById, getSelectedBlue, canGenerate,
 *     groupModel, render, getState, BLOCK_MESSAGE }
 * ========================================================================== */
(function () {
    'use strict';

    var BLOCK_MESSAGE = 'Select and approve a BLUE COA before generation. — اختر واعتمد عملاً ممكناً أزرق قبل التوليد.';
    var HARD_CAP_PER_SIDE = 5;   // D3

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"]/g, function (ch) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch];
        });
    }
    function arr(v) { return Array.isArray(v) ? v : []; }

    function coasFromPayload(payload) {
        var ob = payload && payload.brief && payload.brief.operational_brief;
        return ob ? arr(ob.courses_of_action) : [];
    }
    function hasCoas(payload) { return coasFromPayload(payload).length > 0; }

    // ── DOM-free state machine ──────────────────────────────────────────
    // NO auto-selection: selectedId starts null even when a recommendation
    // exists (D9 — commander decision required).
    function createState(payload) {
        var ob = (payload && payload.brief && payload.brief.operational_brief) || {};
        return {
            setId: (payload && payload.document_set_id) || null,
            coas: arr(ob.courses_of_action),
            recommendation: ob.coa_recommendation || null,
            force_comparison: ob.force_comparison || null,
            selectedId: null,
            rejected: {},          // id → true
            compare: {},           // id → true
            edits: {},             // id → parsed replacement object
            editedFlags: {},       // id → true (badge)
        };
    }
    function coaById(state, id) {
        for (var i = 0; i < state.coas.length; i++) {
            if (state.coas[i] && state.coas[i].id === id) {
                return state.edits[id] || state.coas[i];
            }
        }
        return null;
    }
    function select(state, id) {
        var c = coaById(state, id);
        if (!c) return { ok: false, error: 'unknown COA: ' + id };
        if (c.side !== 'BLUE') return { ok: false, error: 'only BLUE possibilities can be selected for generation' };
        if (state.rejected[id]) return { ok: false, error: 'COA is rejected — un-reject it before selecting' };
        state.selectedId = id;
        return { ok: true };
    }
    function deselect(state) { state.selectedId = null; }
    function reject(state, id) {
        var c = coaById(state, id);
        if (!c) return { ok: false, error: 'unknown COA: ' + id };
        state.rejected[id] = true;
        if (state.selectedId === id) state.selectedId = null;
        return { ok: true };
    }
    function unreject(state, id) { delete state.rejected[id]; return { ok: true }; }
    function toggleCompare(state, id) {
        if (state.compare[id]) delete state.compare[id];
        else state.compare[id] = true;
        return { ok: true };
    }
    // Inline JSON edit (kept client-side; needs_review stays true).
    function applyEdit(state, id, jsonText) {
        var orig = null;
        for (var i = 0; i < state.coas.length; i++) if (state.coas[i] && state.coas[i].id === id) orig = state.coas[i];
        if (!orig) return { ok: false, error: 'unknown COA: ' + id };
        var parsed;
        try { parsed = JSON.parse(jsonText); } catch (e) { return { ok: false, error: 'invalid JSON: ' + e.message }; }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ok: false, error: 'edit must be a JSON object' };
        parsed.id = orig.id;                 // identity + side are not editable here
        parsed.side = orig.side;
        parsed.needs_review = true;          // L6 — editing never clears review
        state.edits[id] = parsed;
        state.editedFlags[id] = true;
        return { ok: true };
    }
    function getSelectedBlue(state) {
        if (!state || !state.selectedId) return null;
        var c = coaById(state, state.selectedId);
        return (c && c.side === 'BLUE' && !state.rejected[c.id]) ? c : null;
    }
    // Generation gate (D9 + G-3 rule #4): COAs present ⇒ a BLUE COA must be
    // selected. No COAs ⇒ legacy flow unchanged.
    function canGenerate(state) {
        if (!state || !state.coas.length) return { ok: true };
        return getSelectedBlue(state) ? { ok: true } : { ok: false, reason: BLOCK_MESSAGE };
    }

    // Commander-friendly grouping (#6): BLUE possibilities (1..n), Enemy Most
    // Likely, Enemy Most Dangerous (null ⇒ placeholder card).
    function groupModel(state) {
        var blue = [], redMl = null, redMd = null;
        for (var i = 0; i < state.coas.length; i++) {
            var c = state.edits[state.coas[i].id] || state.coas[i];
            if (c.side === 'BLUE') blue.push(c);
            else if (c.side === 'RED') {
                var idn = String(c.id || '') + ' ' + String(c.name_en || '') + ' ' + String(c.name || '');
                if (/danger|md\b|الأخطر/i.test(idn)) redMd = c;
                else redMl = redMl || c;
            }
        }
        return {
            blue: blue.slice(0, HARD_CAP_PER_SIDE),
            red_most_likely: redMl,
            red_most_dangerous: redMd,                   // null ⇒ render placeholder
            md_missing: !redMd,
        };
    }

    // ── Rendering ───────────────────────────────────────────────────────
    var _state = null;
    var _container = null;
    var _payload = null;

    function badge(text, color, border) {
        return '<span style="display:inline-block;margin:1px 4px 1px 0;padding:1px 7px;border-radius:9px;font-size:10px;' +
            'background:#10181f;border:1px solid ' + (border || '#2e5d7d') + ';color:' + color + ';">' + esc(text) + '</span>';
    }
    function miniList(title, items, color) {
        items = arr(items).map(function (x) { return typeof x === 'string' ? x : (x && (x.text || x.label || x.name)); }).filter(Boolean);
        if (!items.length) return '';
        var lis = items.slice(0, 4).map(function (t) { return '<li style="margin:1px 0;">' + esc(t) + '</li>'; }).join('');
        var more = items.length > 4 ? '<li style="color:#6a7a8a;">+' + (items.length - 4) + ' more…</li>' : '';
        return '<div style="margin:5px 0;"><div style="font-size:10px;color:' + (color || '#8fa5b8') + ';">' + esc(title) +
            ' (' + items.length + ')</div><ul style="margin:1px 0 0;padding:0 16px;font-size:11px;color:#cfd6dd;direction:rtl;text-align:right;">' +
            lis + more + '</ul></div>';
    }
    function citeLine(c) {
        var files = arr(c.source_citations).map(function (s) { return s && s.file; }).filter(Boolean);
        if (!files.length) return '';
        var uniq = files.filter(function (f, i) { return files.indexOf(f) === i; });
        var keys = 0;
        arr(c.source_citations).forEach(function (s) { keys += arr(s && s.keys).length; });
        return '<div style="font-size:10px;color:#6f93b8;margin-top:4px;">⌕ Sources — المصادر: ' + esc(uniq.join(', ')) + ' · ' + keys + ' keys</div>';
    }
    function cardShell(inner, accent, selected) {
        return '<div style="flex:0 0 270px;max-width:300px;border:1px solid ' + (selected ? '#5fc98a' : accent) +
            ';border-radius:8px;background:#0d141b;padding:9px;' + (selected ? 'box-shadow:0 0 0 1px #5fc98a;' : '') + '">' + inner + '</div>';
    }
    function btn(act, id, label, style) {
        return '<button type="button" data-coa-act="' + act + '" data-coa-id="' + esc(id) + '" style="font:inherit;cursor:pointer;font-size:11px;border-radius:5px;padding:4px 9px;' + style + '">' + label + '</button>';
    }

    function renderCard(state, c, title) {
        var sel = state.selectedId === c.id;
        var rej = !!state.rejected[c.id];
        var cmp = !!state.compare[c.id];
        var isBlue = c.side === 'BLUE';
        var accent = isBlue ? '#2e5d7d' : '#7d2e2e';
        var h = '';
        h += '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:6px;">' +
             '<div style="font-size:12px;font-weight:600;color:' + (isBlue ? '#9fd0ff' : '#f0a0a0') + ';">' + esc(title) + '</div>' +
             badge(c.side, isBlue ? '#9fd0ff' : '#f0a0a0', accent) + '</div>';
        h += '<div style="font-size:10px;color:#6a7a8a;margin-bottom:4px;">' + esc(c.id) + (c.name ? ' · <span style="direction:rtl;">' + esc(c.name) + '</span>' : '') + '</div>';
        h += '<div style="margin-bottom:4px;">' +
             badge('confidence: ' + (c.confidence || '—'), c.confidence === 'high' ? '#7fd6a0' : '#e0c060', '#5a5a2e') +
             (c.needs_review !== false ? badge('needs review — يتطلب مراجعة', '#e0a93a', '#b8860b') : '') +
             (state.editedFlags[c.id] ? badge('edited', '#cfe6ff', '#4a7bb8') : '') +
             (sel ? badge('SELECTED — معتمد', '#5fc98a', '#2e7d54') : '') +
             (rej ? badge('REJECTED — مرفوض', '#f08080', '#7d2e2e') : '') + '</div>';
        if (c.intent) h += '<div style="font-size:11px;color:#e8eaed;direction:rtl;text-align:right;background:#121a22;border-radius:4px;padding:5px;max-height:72px;overflow:auto;">' + esc(c.intent) + '</div>';
        h += miniList('Phases — المراحل', arr(c.phases).map(function (p) { return 'P' + p.index + ': ' + p.label; }));
        h += miniList('Risks — المخاطر', c.risks, '#e0a93a');
        h += miniList('Assumptions — الافتراضات', c.assumptions);
        h += miniList('Missing — نواقص', c.missing_information, '#e0a93a');
        var turns = arr(c.wargame_turns).length;
        h += '<div style="font-size:10px;color:#9aa3ad;margin-top:3px;">Wargame turns — جولات: <b>' + turns + '</b></div>';
        if (c.expected_enemy_reaction) h += '<div style="font-size:10px;color:#f0b0b0;direction:rtl;text-align:right;margin-top:3px;">⚠ رد العدو المتوقع: ' + esc(String(c.expected_enemy_reaction).slice(0, 140)) + '</div>';
        if (c.counteraction) h += '<div style="font-size:10px;color:#9fd0ff;direction:rtl;text-align:right;margin-top:2px;">↩ الإجراء المضاد: ' + esc(String(c.counteraction).slice(0, 140)) + '</div>';
        h += citeLine(c);
        // controls
        var controls = '';
        if (isBlue) {
            controls += sel
                ? btn('deselect', c.id, 'Deselect — إلغاء', 'border:1px solid #2e7d54;background:#1f3a2b;color:#7fd6a0;')
                : btn('select', c.id, 'Select — اعتماد', 'border:1px solid #2e7d54;background:#16241b;color:#7fd6a0;' + (rej ? 'opacity:.45;' : ''));
            controls += rej
                ? btn('unreject', c.id, 'Un-reject — تراجع', 'border:1px solid #b8860b;background:#2a2412;color:#e0c060;')
                : btn('reject', c.id, 'Reject — رفض', 'border:1px solid #7d2e2e;background:#241616;color:#f08080;');
        }
        controls += btn('edit', c.id, 'Edit — تعديل', 'border:1px solid #4a7bb8;background:#22303f;color:#cfe6ff;');
        controls += btn('compare', c.id, cmp ? '✓ Compare' : 'Compare — مقارنة', 'border:1px solid #5a6270;background:' + (cmp ? '#2e3a46' : '#2a2f37') + ';color:#e8eaed;');
        h += '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:7px;">' + controls + '</div>';
        h += '<div data-coa-editbox="' + esc(c.id) + '" style="display:none;margin-top:6px;">' +
             '<textarea data-coa-edittext="' + esc(c.id) + '" spellcheck="false" style="width:100%;height:110px;background:#0a0e12;color:#c0c6cd;border:1px solid #2a2f37;border-radius:4px;font-size:10px;font-family:monospace;box-sizing:border-box;"></textarea>' +
             '<div style="display:flex;gap:4px;margin-top:3px;">' +
             btn('apply-edit', c.id, 'Apply — تطبيق', 'border:1px solid #2e7d54;background:#16241b;color:#7fd6a0;') +
             btn('cancel-edit', c.id, 'Close', 'border:1px solid #5a6270;background:#2a2f37;color:#e8eaed;') +
             '</div><div data-coa-editerr="' + esc(c.id) + '" style="color:#f08080;font-size:10px;margin-top:2px;"></div></div>';
        return cardShell(h, accent, sel);
    }

    function renderMdPlaceholder() {
        var h = '<div style="font-size:12px;font-weight:600;color:#f0a0a0;">Enemy Most Dangerous — العمل الأخطر للعدو</div>' +
            '<div style="margin:6px 0;">' + badge('not generated — لم يُولَّد بعد', '#e0a93a', '#b8860b') + '</div>' +
            '<div style="font-size:11px;color:#9aa3ad;direction:rtl;text-align:right;">لم يرد العمل الأخطر في ملفات المصدر، ولا يُخترع تلقائياً (قرار D3). استخدم "توليد المزيد" عند توفر نموذج النشر.</div>' +
            '<div style="margin-top:7px;"><button type="button" disabled title="Pending deployment LLM — بانتظار نموذج الشبكة" ' +
            'style="font:inherit;font-size:11px;border-radius:5px;padding:4px 9px;border:1px dashed #5a6270;background:#1a1f25;color:#6a7a8a;cursor:not-allowed;">Generate More — توليد المزيد (pending)</button></div>';
        return cardShell(h, '#7d2e2e', false);
    }

    function renderCompare(state) {
        var ids = Object.keys(state.compare);
        if (ids.length < 2) return '';
        var cols = ids.slice(0, 3).map(function (id) { return coaById(state, id); }).filter(Boolean);
        function row(label, fn) {
            return '<tr><td style="padding:3px 6px;color:#8fa5b8;white-space:nowrap;">' + esc(label) + '</td>' +
                cols.map(function (c) { return '<td style="padding:3px 6px;color:#e8eaed;direction:rtl;text-align:right;vertical-align:top;">' + esc(fn(c) || '—') + '</td>'; }).join('') + '</tr>';
        }
        return '<div style="margin-top:10px;border:1px solid #2e5d7d;border-radius:6px;padding:8px;background:#0e1620;">' +
            '<div style="font-size:11px;color:#9fd0ff;margin-bottom:4px;">Compare — مقارنة الأعمال (' + cols.length + ')</div>' +
            '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:11px;min-width:420px;">' +
            '<tr><td></td>' + cols.map(function (c) { return '<td style="padding:3px 6px;font-weight:600;color:' + (c.side === 'BLUE' ? '#9fd0ff' : '#f0a0a0') + ';">' + esc(c.name_en || c.id) + '</td>'; }).join('') + '</tr>' +
            row('Side', function (c) { return c.side; }) +
            row('Intent', function (c) { return c.intent && String(c.intent).slice(0, 120); }) +
            row('Phases', function (c) { return String(arr(c.phases).length); }) +
            row('Turns', function (c) { return String(arr(c.wargame_turns).length); }) +
            row('Risks', function (c) { return String(arr(c.risks).length); }) +
            row('Confidence', function (c) { return c.confidence; }) +
            row('Evaluation', function (c) { return c.evaluation && c.evaluation.conclusion; }) +
            '</table></div></div>';
    }

    function render(container, payload) {
        if (!container) return;
        _container = container;
        _payload = payload;
        if (!_state || _state.setId !== ((payload && payload.document_set_id) || null)) {
            _state = createState(payload);
        } else {
            _state.coas = coasFromPayload(payload);       // refresh data, keep decisions
        }
        var g = groupModel(_state);
        var html = '<div style="border-top:1px solid #23303d;margin-top:10px;padding-top:10px;">' +
            '<div style="font-size:13px;color:#7fd6a0;font-weight:600;">Courses of Action — الأعمال الممكنة</div>' +
            '<div style="font-size:11px;color:#e0a93a;margin:2px 0 8px;">Commander decision required — قرار القائد مطلوب. AI-assisted possibilities, not tactical truth.</div>';

        // Recommendation strip — rationale only, NEVER auto-selected (D9).
        if (_state.recommendation && _state.recommendation.rationale) {
            html += '<div data-coa-el="recommendation" style="margin-bottom:8px;padding:6px 8px;border-radius:5px;background:#16222e;border:1px solid #2e5d7d;font-size:11px;color:#cfe6ff;">' +
                '<b>Recommended by analysis (rationale only — no auto-selection):</b> ' +
                '<span style="direction:rtl;">' + esc(_state.recommendation.rationale) + '</span>' +
                '<div style="color:#e0a93a;margin-top:2px;">⚖ Commander decision required — القرار النهائي للقائد فقط.</div></div>';
        }

        html += '<div style="font-size:11px;color:#9fd0ff;margin:4px 0;">BLUE possibilities — الأعمال الزرقاء</div>';
        html += '<div style="display:flex;gap:8px;overflow-x:auto;padding-bottom:4px;">';
        if (g.blue.length) {
            g.blue.forEach(function (c, i) { html += renderCard(_state, c, 'Possibility ' + (i + 1) + ' — الاحتمال ' + (i + 1)); });
        } else {
            html += '<div style="font-size:11px;color:#9aa3ad;">No BLUE possibilities in the brief.</div>';
        }
        // Generate More (BLUE) — pending; no LLM behavior invented (G-3 rule).
        html += '<div style="flex:0 0 150px;display:flex;align-items:center;">' +
            '<button type="button" data-coa-act="generate-more" disabled title="Pending deployment LLM — بانتظار نموذج الشبكة" ' +
            'style="font:inherit;font-size:11px;border-radius:6px;padding:8px 10px;border:1px dashed #5a6270;background:#1a1f25;color:#6a7a8a;cursor:not-allowed;width:100%;">+ Generate More<br>توليد المزيد (pending)</button></div>';
        html += '</div>';

        html += '<div style="font-size:11px;color:#f0a0a0;margin:8px 0 4px;">Enemy possibilities — أعمال العدو المحتملة</div>';
        html += '<div style="display:flex;gap:8px;overflow-x:auto;padding-bottom:4px;">';
        if (g.red_most_likely) html += renderCard(_state, g.red_most_likely, 'Enemy Most Likely — الأكثر احتمالاً');
        else html += '<div style="font-size:11px;color:#9aa3ad;align-self:center;">Enemy Most Likely not present in the source.</div>';
        html += g.red_most_dangerous ? renderCard(_state, g.red_most_dangerous, 'Enemy Most Dangerous — الأخطر') : renderMdPlaceholder();
        html += '</div>';

        html += renderCompare(_state);
        html += '</div>';
        container.innerHTML = html;

        container.querySelectorAll('[data-coa-act]').forEach(function (b) {
            b.addEventListener('click', function () {
                var act = b.getAttribute('data-coa-act');
                var id = b.getAttribute('data-coa-id');
                if (act === 'select') {
                    var r = select(_state, id);
                    if (!r.ok) { b.title = r.error; return; }
                } else if (act === 'deselect') deselect(_state);
                else if (act === 'reject') reject(_state, id);
                else if (act === 'unreject') unreject(_state, id);
                else if (act === 'compare') toggleCompare(_state, id);
                else if (act === 'edit') {
                    var box = container.querySelector('[data-coa-editbox="' + id + '"]');
                    var ta = container.querySelector('[data-coa-edittext="' + id + '"]');
                    if (ta && !ta.value) { try { ta.value = JSON.stringify(coaById(_state, id), null, 2); } catch (_) {} }
                    if (box) { box.style.display = box.style.display === 'none' ? 'block' : 'none'; }
                    return;   // no re-render — keep the textarea open
                } else if (act === 'apply-edit') {
                    var ta2 = container.querySelector('[data-coa-edittext="' + id + '"]');
                    var er = applyEdit(_state, id, ta2 ? ta2.value : '');
                    if (!er.ok) {
                        var errEl = container.querySelector('[data-coa-editerr="' + id + '"]');
                        if (errEl) errEl.textContent = er.error;
                        return;
                    }
                } else if (act === 'cancel-edit') {
                    var box2 = container.querySelector('[data-coa-editbox="' + id + '"]');
                    if (box2) box2.style.display = 'none';
                    return;
                } else if (act === 'generate-more') {
                    return;   // pending — disabled anyway
                }
                render(_container, _payload);    // re-render with updated state
            });
        });
    }

    function getState() { return _state; }
    function resetState() { _state = null; _container = null; _payload = null; }

    window.RmoozCoaPanel = {
        // payload helpers
        hasCoas: hasCoas,
        // DOM-free state machine (node-testable)
        createState: createState,
        select: select,
        deselect: deselect,
        reject: reject,
        unreject: unreject,
        toggleCompare: toggleCompare,
        applyEdit: applyEdit,
        coaById: coaById,
        groupModel: groupModel,
        canGenerate: canGenerate,
        BLOCK_MESSAGE: BLOCK_MESSAGE,
        HARD_CAP_PER_SIDE: HARD_CAP_PER_SIDE,
        // live-state accessors (the review renderer's generate gate uses these)
        render: render,
        getState: getState,
        resetState: resetState,
        getSelectedBlue: function () { return getSelectedBlue(_state); },
        canGenerateNow: function () { return canGenerate(_state || { coas: [] }); },
        getSelectedBlueOf: getSelectedBlue,
    };
})();
