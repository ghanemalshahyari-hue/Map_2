/* ============================================================================
 * scenario-edit-mode.js — RMOOZ Scenario Workspace "Edit Mode" (slice 1)
 * ----------------------------------------------------------------------------
 * OWNER RULING 2026-06-01 (Ghanem): the scenario workspace becomes editable —
 * a CMO-style "start → build/edit a scenario → fix issues as we proceed" flow,
 * overriding the previously read-only design.
 * See memory [[project_workspace_editable_owner_ruling]] +
 *     docs/cmo-functional-rules/exhaustive/ (CMO behavior rules — source of truth) +
 *     APP_INVENTORY.md "TODO — CMO→RMOOZ capability roadmap" (chosen-function list).
 *
 * SAFETY BOUNDARY PRESERVED (the agreed default):
 *   - Edits mutate an in-memory WORKING COPY draft, then (on Save) the in-memory
 *     `window.RmoozScenario.scenario` — NOT the durable journal.
 *   - The commit/journal path (R1/R2/R3 in docs/read-only-surface-audit.md) is
 *     UNTOUCHED. Nothing here calls /api/sim/commit, writes journal, or downloads.
 *   - Export = copy-to-clipboard (no Blob / <a download>) to respect the locked
 *     journal-download guard.
 *   - Draft safety is checked through the P0 module
 *     (window.AppScenarioAuthoring.isScenarioAuthoringDraftSafe).
 *
 * Slice 1 (done): Scenario Metadata + Sides + Posture.
 * Slice 2 (in progress, CMO build-order): Geography — Objective (this step);
 *   BLS / pipeline / AO and Forces/OOB placement follow. Forces/Doctrine/Missions later.
 * Vanilla JS, no build step. Self-mounts into #scenario-workspace-panel.
 * ========================================================================== */
(function () {
    'use strict';

    var PANEL_ID   = 'scenario-workspace-panel';
    var BAR_ID     = 'sw-editmode-bar';
    var EDITOR_ID  = 'sw-editmode-editor';
    var SIDE_IDS   = ['BLUE', 'RED', 'NEUTRAL'];
    var ROLES      = ['friendly', 'hostile', 'neutral'];
    var POSTURES   = ['FRIENDLY', 'NEUTRAL', 'UNFRIENDLY', 'HOSTILE'];

    var _on    = false;   // edit mode active?
    var _draft = null;    // working-copy scenario draft (deep clone)
    // transient BLS add-form (kept across re-renders so map-pick survives renderEditor)
    var _blsForm  = { name: '', lon: null, lat: null };

    /* ---- small helpers ---------------------------------------------------- */
    function el(tag, attrs, kids) {
        var n = document.createElement(tag);
        if (attrs) Object.keys(attrs).forEach(function (k) {
            if (k === 'text') n.textContent = attrs[k];
            else if (k === 'html') n.innerHTML = attrs[k];
            else n.setAttribute(k, attrs[k]);
        });
        (kids || []).forEach(function (c) { if (c) n.appendChild(c); });
        return n;
    }
    function clone(o) { try { return JSON.parse(JSON.stringify(o || {})); } catch (_) { return {}; } }
    function liveScenario() {
        var slot = window.RmoozScenario;
        return (slot && slot.scenario) ? slot.scenario : null;
    }
    function logOperator(msg, payload) {
        try {
            window.AppShellEventLog && window.AppShellEventLog.append({
                severity: 'info', category: 'OPERATOR', source: 'edit-mode',
                message: msg, payload: payload || undefined
            });
        } catch (_) {}
    }

    /* ---- draft defaults (mirror scenario-schema-spec.js sides/postures) ---- */
    function defaultSides() {
        return [
            { id: 'BLUE',    name_en: 'Blue Force',  name_ar: 'القوات الزرقاء', role: 'friendly', color: '#2f6fed' },
            { id: 'RED',     name_en: 'Red Force',   name_ar: 'القوات الحمراء', role: 'hostile',  color: '#d6332e' },
            { id: 'NEUTRAL', name_en: 'Neutral',     name_ar: 'محايد',          role: 'neutral',  color: '#9aa0a6' }
        ];
    }
    function defaultPostures() {
        return {
            BLUE:    { BLUE: 'FRIENDLY', RED: 'HOSTILE',  NEUTRAL: 'NEUTRAL' },
            RED:     { BLUE: 'HOSTILE',  RED: 'FRIENDLY', NEUTRAL: 'NEUTRAL' },
            NEUTRAL: { BLUE: 'NEUTRAL',  RED: 'NEUTRAL',  NEUTRAL: 'FRIENDLY' }
        };
    }

    function buildDraft() {
        var live = liveScenario();
        var d;
        if (live) {
            d = clone(live);
        } else if (window.AppScenarioAuthoring &&
                   typeof window.AppScenarioAuthoring.buildStandardScenarioAuthoringTemplate === 'function') {
            d = clone(window.AppScenarioAuthoring.buildStandardScenarioAuthoringTemplate());
        } else {
            d = { scenario_label: '', steps: [] };
        }
        if (!Array.isArray(d.sides) || !d.sides.length) d.sides = defaultSides();
        if (!d.postures || typeof d.postures !== 'object') d.postures = defaultPostures();
        d.authoring_status = 'draft';
        return d;
    }

    /* ---- forces/OOB helpers ----------------------------------------------- */
    function previewDraftOnMap() {
        try {
            if (window.AppAdjudicatorMap && typeof window.AppAdjudicatorMap.drawScenario === 'function' && _draft) {
                window.AppAdjudicatorMap.drawScenario(clone(_draft));
            }
        } catch (_) {}
    }
    function genUid(prefix, arr, key) {
        var n = (arr ? arr.length : 0) + 1, id = prefix + n;
        var taken = function (v) { return (arr || []).some(function (u) { return u && u[key] === v; }); };
        while (taken(id)) { n++; id = prefix + n; }
        return id;
    }
    // Side from the SIDC standard-identity digit (20-digit APP-6D: index 3).
    // 6 hostile / 5 suspect → RED; everything else (3 friend, 2 assumed, 4 neutral, 1 unknown) → BLUE.
    function sidcSide(sidc) {
        var idc = String(sidc || '').charAt(3);
        return (idc === '6' || idc === '5') ? 'RED' : 'BLUE';
    }
    function nearestBlsName(lon, lat) {
        var arr = _draft.bls_template || [], best = null, bd = Infinity;
        arr.forEach(function (b) {
            if (!b || !Array.isArray(b.coord)) return;
            var dx = b.coord[0] - lon, dy = b.coord[1] - lat, d = dx * dx + dy * dy;
            if (d < bd) { bd = d; best = b; }
        });
        return best ? best.name : null;
    }
    function addUnitFromSymbol(sidc, lon, lat) {
        var side = sidcSide(sidc);
        if (side === 'RED') {
            var bls = nearestBlsName(lon, lat);
            if (!bls) { setStatus('Add a landing site (BLS) first — red units must reference one.', true); return; }
            _draft.red_units = _draft.red_units || [];
            var rn = _draft.red_units.length + 1;
            _draft.red_units.push({ uid: genUid('R-cust-', _draft.red_units, 'uid'), label: 'Red unit ' + rn,
                bls: bls, appear: 0, role: 'unit', coord: [lon, lat], echelon: 'battalion', sidc: sidc });
        } else {
            _draft.blue_units_initial = _draft.blue_units_initial || [];
            _draft.blue_units_base_ids = _draft.blue_units_base_ids || [];
            var uid = genUid('B-cust-', _draft.blue_units_initial, 'unit_uid'), bn = _draft.blue_units_initial.length + 1;
            _draft.blue_units_initial.push({ unit_uid: uid, base_id: uid, label: 'Blue unit ' + bn,
                coord: [lon, lat], echelon: 'battalion', role: 'unit', sidc: sidc });
            _draft.blue_units_base_ids.push(uid);
        }
        renderEditor(); previewDraftOnMap();
        setStatus(side + ' unit placed from symbol at ' + lon.toFixed(3) + ', ' + lat.toFixed(3) + '.', false);
    }
    // Reuse the app's existing SIDC/symbol picker, then click-to-place into the scenario.
    function placeUnitViaSymbol() {
        var openBtn = document.getElementById('open-sidc-picker');
        if (!openBtn) { setStatus('Symbol picker not available on this view.', true); return; }
        window.__APP_UNITS_CAPTURING_SIDC = true;   // make the operator-symbol flow ignore this pick
        function onMsg(ev) {
            var d = ev && ev.data;
            if (!d || d.type !== 'sidc-picker:sidc') return;
            window.removeEventListener('message', onMsg);
            window.__APP_UNITS_CAPTURING_SIDC = false;
            var modal = document.getElementById('sidc-picker-modal');
            if (modal) { modal.classList.add('hidden'); modal.setAttribute('aria-hidden', 'true'); }
            var sidc = String(d.sidc || '');
            if (!sidc) { setStatus('No symbol picked.', true); return; }
            setStatus('Now click the map to place the ' + sidcSide(sidc) + ' unit…', false);
            pickCoordOnMap(function (lon, lat) { addUnitFromSymbol(sidc, lon, lat); });
        }
        window.addEventListener('message', onMsg);
        setStatus('Pick a NATO symbol… then click the map to place it.', false);
        openBtn.click();
    }

    /* ---- "New scenario" seeds (build fresh, not edit the loaded one) ------- */
    // Blank = a RUNTIME-shape scenario skeleton (the shape the validator / adjudicator /
    // these editor cards use: name, scenario_label, obj, bls_template, red_units,
    // blue_units_initial, postures, …). NOT the P0 authoring-template shape, which is a
    // different contract (metadata{}, units[], posture, objectives[]) and would mismatch.
    function buildBlankDraft() {
        return {
            name: 'new-scenario',
            scenario_label: '',
            model_version: 'authored-v1',
            obj: { name: 'OBJ', coord: [0, 0], target_depth_km: 40, carver: 0 },
            pipeline: [],
            bls_template: [],
            red_units: [],
            blue_units_base_ids: [],
            blue_units_initial: [],
            phase_table: [],
            steps: [],
            sides: defaultSides(),
            postures: defaultPostures(),
            authoring_status: 'draft'
        };
    }
    function startBlankScenario() {
        _draft = buildBlankDraft();
        // Wipe whatever scenario is currently drawn — a blank start = empty map.
        try { if (window.AppAdjudicatorMap && typeof window.AppAdjudicatorMap.clearScenario === 'function') window.AppAdjudicatorMap.clearScenario(); } catch (_) {}
        renderEditor();
        setStatus('New BLANK scenario started — map cleared. Build it step by step, then Save.', false);
        logOperator('New blank scenario started (map cleared)');
    }
    function startScenarioFromSample() {
        setStatus('Loading sample…', false);
        fetch('/samples/sample-sahil-corridor.json', { credentials: 'same-origin' })
            .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
            .then(function (j) {
                _draft = clone(j);
                if (!Array.isArray(_draft.sides) || !_draft.sides.length) _draft.sides = defaultSides();
                if (!_draft.postures || typeof _draft.postures !== 'object') _draft.postures = defaultPostures();
                _draft.authoring_status = 'draft';
                renderEditor();
                setStatus('New scenario seeded from sample (Sahil Corridor). Edit, then Save to working copy.', false);
                logOperator('New scenario started from sample');
            })
            .catch(function (e) { setStatus('Could not load sample: ' + e.message, true); });
    }

    /* ---- safety gate via the P0 authoring module -------------------------- */
    function draftIsSafe(d) {
        try {
            if (window.AppScenarioAuthoring &&
                typeof window.AppScenarioAuthoring.isScenarioAuthoringDraftSafe === 'function') {
                var wrap = { liveMutationAllowed: false, aiCommitAllowed: false, operatorEditable: true, scenario: d };
                var r = window.AppScenarioAuthoring.isScenarioAuthoringDraftSafe(wrap);
                if (r && r.safe === false) {
                    return { ok: false, why: (r.violations || []).join('; ') || 'draft rejected' };
                }
            }
        } catch (e) { /* non-blocking: real gate is the untouched commit path */ }
        return { ok: true, why: '' };
    }

    /* ---- editor UI -------------------------------------------------------- */
    function fieldRow(labelTxt, inputNode) {
        return el('div', { class: 'sw-kv-row sw-edit-row' }, [
            el('dt', { text: labelTxt }), el('dd', null, [inputNode])
        ]);
    }
    function textInput(value, onInput) {
        var i = el('input', { type: 'text', class: 'sw-edit-input', value: value == null ? '' : String(value) });
        i.addEventListener('input', function () { onInput(i.value); });
        return i;
    }
    function selectInput(options, value, onChange) {
        var s = el('select', { class: 'sw-edit-input' });
        options.forEach(function (o) {
            var opt = el('option', { value: o, text: o });
            if (o === value) opt.setAttribute('selected', 'selected');
            s.appendChild(opt);
        });
        s.addEventListener('change', function () { onChange(s.value); });
        return s;
    }
    function numberInput(value, onInput, opts) {
        opts = opts || {};
        var attrs = { type: 'number', class: 'sw-edit-input', value: (value == null ? '' : String(value)) };
        if (opts.step != null) attrs.step = String(opts.step);
        if (opts.min  != null) attrs.min  = String(opts.min);
        if (opts.max  != null) attrs.max  = String(opts.max);
        var i = el('input', attrs);
        i.addEventListener('input', function () {
            var n = parseFloat(i.value);
            onInput(isFinite(n) ? n : null);
        });
        return i;
    }
    /* One-shot map-click coord capture — reuses app.js's __APP_UNITS_PLACING hook
       (app.js routes the next map click to onClick(latlng) then we clear it).
       cb receives (lon, lat) in scenario [lon,lat] convention. */
    function pickCoordOnMap(cb) {
        window.__APP_UNITS_PLACING = {
            unitId: '__scenario_authoring_coord__',
            onClick: function (latlng) {
                window.__APP_UNITS_PLACING = null;
                try { if (latlng) cb(latlng.lng, latlng.lat); } catch (_) {}
            }
        };
    }

    function renderEditor() {
        var host = document.getElementById(EDITOR_ID);
        if (!host) return;
        host.innerHTML = '';
        if (!_draft) _draft = buildDraft();

        /* --- New scenario picker (Blank vs From-sample) — build fresh, not edit loaded --- */
        var newCard = el('div', { class: 'builder-card sw-card' }, [
            el('div', { class: 'builder-card-header' }, [
                el('span', { class: 'builder-card-title', text: 'New scenario / سيناريو جديد' })
            ])
        ]);
        var blankBtn = el('button', { type: 'button', class: 'sw-edit-btn', text: 'Blank / فارغ' });
        blankBtn.addEventListener('click', function () {
            if (window.confirm('Start a new BLANK scenario? This replaces the current draft (the loaded scenario is untouched until you Save).')) startBlankScenario();
        });
        var sampleBtn = el('button', { type: 'button', class: 'sw-edit-btn', text: 'From sample / من نموذج' });
        sampleBtn.addEventListener('click', function () {
            if (window.confirm('Start from the sample scenario (Sahil Corridor)? This replaces the current draft.')) startScenarioFromSample();
        });
        newCard.appendChild(el('div', { class: 'sw-edit-actions' }, [blankBtn, sampleBtn]));
        newCard.appendChild(el('div', { class: 'sw-edit-hint',
            text: 'Blank = empty template, build from scratch (CMO step by step). From sample = the validated Sahil Corridor example to edit.' }));
        host.appendChild(newCard);

        /* --- Scenario Metadata --- */
        var meta = el('div', { class: 'builder-card sw-card' }, [
            el('div', { class: 'builder-card-header' }, [
                el('span', { class: 'builder-card-title', text: 'Edit · Scenario Metadata / بيانات السيناريو' })
            ]),
            el('dl', { class: 'sw-kv' }, [
                fieldRow('Label / التسمية', textInput(_draft.scenario_label, function (v) { _draft.scenario_label = v; })),
                fieldRow('Scenario ID', textInput(_draft.scenario_id, function (v) { _draft.scenario_id = v; }))
            ])
        ]);
        host.appendChild(meta);

        /* --- Sides --- */
        var sidesCard = el('div', { class: 'builder-card sw-card' }, [
            el('div', { class: 'builder-card-header' }, [
                el('span', { class: 'builder-card-title', text: 'Edit · Sides / الأطراف' })
            ])
        ]);
        _draft.sides.forEach(function (side) {
            sidesCard.appendChild(el('dl', { class: 'sw-kv' }, [
                fieldRow(side.id + ' · name (EN)', textInput(side.name_en, function (v) { side.name_en = v; })),
                fieldRow(side.id + ' · name (AR)', textInput(side.name_ar, function (v) { side.name_ar = v; })),
                fieldRow(side.id + ' · role',      selectInput(ROLES, side.role, function (v) { side.role = v; })),
                fieldRow(side.id + ' · color',     textInput(side.color, function (v) { side.color = v; }))
            ]));
        });
        host.appendChild(sidesCard);

        /* --- Posture matrix --- */
        var postCard = el('div', { class: 'builder-card sw-card' }, [
            el('div', { class: 'builder-card-header' }, [
                el('span', { class: 'builder-card-title', text: 'Edit · Posture matrix (from → to) / مصفوفة الموقف' })
            ])
        ]);
        var dl = el('dl', { class: 'sw-kv' });
        SIDE_IDS.forEach(function (from) {
            SIDE_IDS.forEach(function (to) {
                if (from === to) return;
                _draft.postures[from] = _draft.postures[from] || {};
                var cur = _draft.postures[from][to] || 'NEUTRAL';
                dl.appendChild(fieldRow(from + ' → ' + to, selectInput(POSTURES, cur, function (v) {
                    _draft.postures[from][to] = v;
                })));
            });
        });
        postCard.appendChild(dl);
        host.appendChild(postCard);

        /* --- Geography · Objective (Slice 2, CMO build-order step: define the area/objective
               before placing units — see docs/cmo-functional-rules/exhaustive/scenario-authoring) --- */
        _draft.obj = _draft.obj || { name: 'OBJ', coord: [0, 0], target_depth_km: 40, carver: 0 };
        if (!Array.isArray(_draft.obj.coord) || _draft.obj.coord.length < 2) _draft.obj.coord = [0, 0];
        var objCard = el('div', { class: 'builder-card sw-card' }, [
            el('div', { class: 'builder-card-header' }, [
                el('span', { class: 'builder-card-title', text: 'Edit · Geography: Objective / الجغرافيا: الهدف' })
            ])
        ]);
        objCard.appendChild(el('dl', { class: 'sw-kv' }, [
            fieldRow('Objective name / اسم الهدف', textInput(_draft.obj.name, function (v) { _draft.obj.name = v; })),
            fieldRow('Longitude / خط الطول',  numberInput(_draft.obj.coord[0], function (v) { _draft.obj.coord[0] = v; }, { step: 'any' })),
            fieldRow('Latitude / خط العرض',   numberInput(_draft.obj.coord[1], function (v) { _draft.obj.coord[1] = v; }, { step: 'any' })),
            fieldRow('Target depth km / عمق الهدف', numberInput(_draft.obj.target_depth_km, function (v) { _draft.obj.target_depth_km = v; }, { step: 1, min: 0 })),
            fieldRow('Carve index 0–60', numberInput(_draft.obj.carver, function (v) { _draft.obj.carver = v; }, { min: 0, max: 60, step: 1 }))
        ]));
        var pickBtn = el('button', { type: 'button', class: 'sw-edit-btn', text: 'Pick on map / تحديد على الخريطة' });
        pickBtn.addEventListener('click', function () {
            pickCoordOnMap(function (lon, lat) {
                _draft.obj.coord = [lon, lat];
                renderEditor();
                setStatus('Objective set from map: ' + lon.toFixed(4) + ', ' + lat.toFixed(4), false);
            });
            setStatus('Click the map to set the objective…', false);
        });
        objCard.appendChild(el('div', { class: 'sw-edit-actions' }, [pickBtn]));
        host.appendChild(objCard);

        /* --- Geography · Beach Landing Sites (red units must reference one) --- */
        _draft.bls_template = Array.isArray(_draft.bls_template) ? _draft.bls_template : [];
        var blsCard = el('div', { class: 'builder-card sw-card' }, [
            el('div', { class: 'builder-card-header' }, [
                el('span', { class: 'builder-card-title', text: 'Edit · Beach Landing Sites / مواقع الإنزال' })
            ])
        ]);
        var blsList = el('div', { class: 'sw-edit-list' });
        _draft.bls_template.forEach(function (b, idx) {
            var rm = el('button', { type: 'button', class: 'sw-edit-btn sw-edit-rm', text: '×' });
            rm.addEventListener('click', function () { _draft.bls_template.splice(idx, 1); renderEditor(); previewDraftOnMap(); });
            blsList.appendChild(el('div', { class: 'sw-edit-listrow' }, [
                el('span', { text: (b.name || '(unnamed)') + ' · [' + (b.coord ? b.coord[0] : '?') + ', ' + (b.coord ? b.coord[1] : '?') + ']' }), rm
            ]));
        });
        if (!_draft.bls_template.length) blsList.appendChild(el('div', { class: 'sw-edit-hint', text: 'No landing sites yet.' }));
        blsCard.appendChild(blsList);
        blsCard.appendChild(el('dl', { class: 'sw-kv' }, [
            fieldRow('BLS name / الاسم', textInput(_blsForm.name, function (v) { _blsForm.name = v; })),
            fieldRow('Longitude', numberInput(_blsForm.lon, function (v) { _blsForm.lon = v; }, { step: 'any' })),
            fieldRow('Latitude',  numberInput(_blsForm.lat, function (v) { _blsForm.lat = v; }, { step: 'any' }))
        ]));
        var blsPick = el('button', { type: 'button', class: 'sw-edit-btn', text: 'Pick on map / تحديد' });
        blsPick.addEventListener('click', function () {
            pickCoordOnMap(function (lon, lat) { _blsForm.lon = lon; _blsForm.lat = lat; renderEditor(); });
            setStatus('Click the map to set the landing-site location…', false);
        });
        var blsAdd = el('button', { type: 'button', class: 'sw-edit-btn sw-edit-btn-primary', text: '+ Add BLS' });
        blsAdd.addEventListener('click', function () {
            if (!_blsForm.name) { setStatus('Landing site needs a name.', true); return; }
            if (_blsForm.lon == null || _blsForm.lat == null) { setStatus('Landing site needs a location (lon/lat or Pick on map).', true); return; }
            _draft.bls_template.push({ name: _blsForm.name, coord: [_blsForm.lon, _blsForm.lat], role: 'supporting', throughput: 800, terrain_friction: 0.3 });
            _blsForm = { name: '', lon: null, lat: null };
            renderEditor(); previewDraftOnMap(); setStatus('Landing site added.', false);
        });
        blsCard.appendChild(el('div', { class: 'sw-edit-actions' }, [blsPick, blsAdd]));
        host.appendChild(blsCard);

        /* --- Forces · Order of Battle: add / list / remove units (the "place units" step) --- */
        _draft.red_units          = Array.isArray(_draft.red_units) ? _draft.red_units : [];
        _draft.blue_units_initial = Array.isArray(_draft.blue_units_initial) ? _draft.blue_units_initial : [];
        _draft.blue_units_base_ids= Array.isArray(_draft.blue_units_base_ids) ? _draft.blue_units_base_ids : [];
        var blsNames = _draft.bls_template.map(function (b) { return b.name; }).filter(Boolean);
        var oobCard = el('div', { class: 'builder-card sw-card' }, [
            el('div', { class: 'builder-card-header' }, [
                el('span', { class: 'builder-card-title', text: 'Edit · Forces / OOB — place units / القوات' })
            ])
        ]);
        function unitRow(label, coord, role, onRemove) {
            var rm = el('button', { type: 'button', class: 'sw-edit-btn sw-edit-rm', text: '×' });
            rm.addEventListener('click', onRemove);
            return el('div', { class: 'sw-edit-listrow' }, [
                el('span', { text: (label || '(unnamed)') + ' · ' + (role || '') + ' · [' + (coord ? coord[0] : '?') + ', ' + (coord ? coord[1] : '?') + ']' }), rm
            ]);
        }
        var redList = el('div', { class: 'sw-edit-list' });
        redList.appendChild(el('div', { class: 'sw-edit-sublabel', text: 'RED (' + _draft.red_units.length + ')' }));
        _draft.red_units.forEach(function (u, idx) {
            redList.appendChild(unitRow(u.label, u.coord, u.role, function () { _draft.red_units.splice(idx, 1); renderEditor(); previewDraftOnMap(); }));
        });
        var blueList = el('div', { class: 'sw-edit-list' });
        blueList.appendChild(el('div', { class: 'sw-edit-sublabel', text: 'BLUE (' + _draft.blue_units_initial.length + ')' }));
        _draft.blue_units_initial.forEach(function (u, idx) {
            blueList.appendChild(unitRow(u.label, u.coord, u.role, function () {
                var uid = u.unit_uid; _draft.blue_units_initial.splice(idx, 1);
                var bi = _draft.blue_units_base_ids.indexOf(uid); if (bi >= 0) _draft.blue_units_base_ids.splice(bi, 1);
                renderEditor(); previewDraftOnMap();
            }));
        });
        oobCard.appendChild(redList);
        oobCard.appendChild(blueList);
        // Symbol-driven placement: pick a NATO symbol (existing SIDC picker) → click the map.
        // Side is derived from the symbol; red units auto-link to the nearest BLS.
        oobCard.appendChild(el('div', { class: 'sw-edit-hint',
            text: 'Place units by symbol: pick a NATO symbol, then click the map. Friend → Blue, hostile → Red (from the symbol); red units auto-link to the nearest landing site.' }));
        var placeBtn = el('button', { type: 'button', class: 'sw-edit-btn sw-edit-btn-primary', text: '➕ Place unit (pick symbol) / إضافة وحدة بالرمز' });
        placeBtn.addEventListener('click', placeUnitViaSymbol);
        if (!blsNames.length) {
            oobCard.appendChild(el('div', { class: 'sw-edit-hint', text: 'Tip: add a landing site above before placing red (hostile) units.' }));
        }
        oobCard.appendChild(el('div', { class: 'sw-edit-actions' }, [placeBtn]));
        host.appendChild(oobCard);

        /* --- actions --- */
        var status = el('span', { id: 'sw-editmode-status', class: 'sw-edit-status', text: '' });
        var saveBtn = el('button', { type: 'button', class: 'sw-edit-btn sw-edit-btn-primary', text: 'Save draft / حفظ المسودة' });
        saveBtn.addEventListener('click', saveDraft);
        var copyBtn = el('button', { type: 'button', class: 'sw-edit-btn', text: 'Copy JSON / نسخ' });
        copyBtn.addEventListener('click', copyJson);
        host.appendChild(el('div', { class: 'sw-edit-actions' }, [saveBtn, copyBtn, status]));
    }

    function setStatus(txt, isErr) {
        var s = document.getElementById('sw-editmode-status');
        if (!s) return;
        s.textContent = txt;
        s.style.color = isErr ? '#d6332e' : '#1a7f37';
    }

    /* ---- save: validate → apply to in-memory scenario → repaint ----------- */
    function saveDraft() {
        if (!_draft) return;
        var gate = draftIsSafe(_draft);
        if (!gate.ok) { setStatus('Blocked: ' + gate.why, true); return; }

        var slot = window.RmoozScenario || (window.RmoozScenario = { scenario: null, stepIndex: 0 });
        slot.scenario = clone(_draft);                 // in-memory working copy ONLY
        if (typeof slot.stepIndex !== 'number') slot.stepIndex = 0;

        try { window.AppShellScenarioWorkspace && window.AppShellScenarioWorkspace.refresh(); } catch (_) {}
        // Slice 2: live map feedback — best-effort redraw of the scenario from the draft.
        try {
            if (window.AppAdjudicatorMap && typeof window.AppAdjudicatorMap.drawScenario === 'function'
                && slot.scenario && slot.scenario.obj && Array.isArray(slot.scenario.obj.coord)) {
                window.AppAdjudicatorMap.drawScenario(slot.scenario);
            }
        } catch (_) {}
        logOperator('Scenario draft edited (metadata/sides/posture/objective) — in-memory only, not committed',
            { label: _draft.scenario_label || '' });
        setStatus('Saved to working copy (not committed). Commit stays gated.', false);
    }

    function copyJson() {
        if (!_draft) return;
        var txt = JSON.stringify(_draft, null, 2);
        try {
            navigator.clipboard.writeText(txt).then(
                function () { setStatus('Draft JSON copied to clipboard.', false); },
                function () { setStatus('Clipboard blocked — see console.', true); console.log(txt); }
            );
        } catch (_) { console.log(txt); setStatus('See console for draft JSON.', true); }
    }

    /* ---- toggle / mount --------------------------------------------------- */
    function setMode(on) {
        _on = !!on;
        var panel = document.getElementById(PANEL_ID);
        if (!panel) return;
        var strip  = panel.querySelector('.sw-readonly-strip');
        var editor = document.getElementById(EDITOR_ID);
        var btn    = document.getElementById('sw-editmode-toggle');

        if (_on) {
            _draft = buildDraft();
            if (strip)  strip.style.display = 'none';
            if (editor) { editor.hidden = false; renderEditor(); }
            if (btn) btn.textContent = 'Exit edit mode / إنهاء التحرير';
            logOperator('Edit mode ON');
        } else {
            if (strip)  strip.style.display = '';
            if (editor) editor.hidden = true;
            if (btn) btn.textContent = 'Edit mode / تحرير';
            logOperator('Edit mode OFF');
        }
    }
    function toggle() { setMode(!_on); }

    function mount() {
        var panel = document.getElementById(PANEL_ID);
        if (!panel || document.getElementById(BAR_ID)) return;

        var btn = el('button', {
            id: 'sw-editmode-toggle', type: 'button', class: 'sw-edit-btn sw-edit-btn-primary',
            text: 'Edit mode / تحرير'
        });
        btn.addEventListener('click', toggle);
        var bar = el('div', { id: BAR_ID, class: 'sw-editmode-bar' }, [btn]);

        var editor = el('div', { id: EDITOR_ID, class: 'sw-editmode-editor', hidden: 'hidden' });

        // Insert the bar + editor right after the read-only strip (top of panel).
        var strip = panel.querySelector('.sw-readonly-strip');
        if (strip && strip.parentNode) {
            strip.parentNode.insertBefore(bar, strip.nextSibling);
            bar.parentNode.insertBefore(editor, bar.nextSibling);
        } else {
            panel.insertBefore(bar, panel.firstChild);
            panel.insertBefore(editor, bar.nextSibling);
        }
    }

    function init() {
        try { mount(); } catch (e) { try { console.warn('[edit-mode] mount failed', e); } catch (_) {} }
    }

    window.AppEditMode = {
        init: init,
        toggle: toggle,
        setMode: setMode,
        getDraft: function () { return _draft ? clone(_draft) : null; },
        isOn: function () { return _on; }
    };
})();
