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
 * Slice 1 scope (CMO "first videos" order): Scenario Metadata + Sides + Posture.
 * Geography / Forces / Doctrine / Missions follow in later slices.
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
    // Slice 2B: cross-card reactivity hook. The Forces card stashes its inner
    // "refresh Add Red availability" callback here when it renders; the Geometry
    // card calls it after every BLS add/remove so the operator doesn't need to
    // close+reopen Edit Mode to see the Add Red button enable.
    var _refreshForcesAvailability = null;
    // Slice 2C: stepped layout state.
    var _activeStep = 0;
    var _showingNewScenarioForm = false;
    // Mirror of the server-side PHASES enum (adjudicator-schema.js:15).
    // Used by Step 6 (Time & Duration). Kept inline to avoid a network call
    // for a 6-item static enum; if the server enum changes, update both.
    var PHASES_ENUM = ['PRE-H', 'PHASE 1', 'PHASE 2A', 'PHASE 2B', 'PHASE 3', 'RESOLUTION'];

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
        fillGeographyDefaults(d);
        fillForcesDefaults(d);
        d.authoring_status = 'draft';
        return d;
    }

    /* ---- Slice 2B: forces defaults (red_units, blue_units_initial) ------- */
    function fillForcesDefaults(d) {
        if (!Array.isArray(d.red_units))           d.red_units = [];
        if (!Array.isArray(d.blue_units_initial))  d.blue_units_initial = [];
        if (!Array.isArray(d.blue_units_base_ids)) d.blue_units_base_ids = [];
    }

    /* ---- Slice 2B: blue_units_base_ids is DERIVED from blue_units_initial ---
     * Single source of truth = blue_units_initial[].base_id.  We rebuild the
     * parallel index at Save time so the operator never has to maintain two
     * lists in parallel — and the validator's "lengths must match" warning
     * (scenario-validator.js:145-149) is impossible to trip from the UI. */
    function syncBlueBaseIds(d) {
        if (!Array.isArray(d.blue_units_initial)) { d.blue_units_base_ids = []; return; }
        d.blue_units_base_ids = d.blue_units_initial.map(function (u) {
            return (u && u.base_id != null) ? String(u.base_id) : '';
        });
    }

    /* ---- Slice 2B: forces hard rules (mirrors scenario-validator.js) -----
     * Lines 145-168 of UI_MOdified/server/ai/scenario-validator.js:
     *   - every red_units[i].bls must reference an existing bls_template name
     *   - every red_units[i].appear must be in [0, steps.length-1]
     *   - uid / unit_uid must be non-empty and unique inside their array */
    function validateForcesHardRules(d) {
        var why = [];
        if (d && Array.isArray(d.red_units)) {
            var blsNames = new Set((Array.isArray(d.bls_template) ? d.bls_template : [])
                .map(function (b) { return b && b.name; }).filter(Boolean));
            var lastStep = (Array.isArray(d.steps) && d.steps.length > 0) ? d.steps.length - 1 : null;
            var seenUid  = Object.create(null);
            d.red_units.forEach(function (u, i) {
                if (!u || typeof u !== 'object') {
                    why.push('red_units[' + i + '] is not an object');
                    return;
                }
                if (!u.uid || !String(u.uid).trim()) {
                    why.push('red_units[' + i + '].uid is empty');
                } else if (seenUid[u.uid]) {
                    why.push('red_units[' + i + '].uid duplicates "' + u.uid + '"');
                } else {
                    seenUid[u.uid] = true;
                }
                if (u.bls && !blsNames.has(u.bls)) {
                    why.push('red_units[' + i + '].bls "' + u.bls + '" is not a defined BLS');
                }
                if (Number.isInteger(u.appear) && lastStep != null && (u.appear < 0 || u.appear > lastStep)) {
                    why.push('red_units[' + i + '].appear ' + u.appear + ' out of range [0..' + lastStep + ']');
                }
            });
        }
        if (d && Array.isArray(d.blue_units_initial)) {
            var seenBlueUid = Object.create(null);
            d.blue_units_initial.forEach(function (u, i) {
                if (!u || typeof u !== 'object') {
                    why.push('blue_units_initial[' + i + '] is not an object');
                    return;
                }
                if (!u.unit_uid || !String(u.unit_uid).trim()) {
                    why.push('blue_units_initial[' + i + '].unit_uid is empty');
                } else if (seenBlueUid[u.unit_uid]) {
                    why.push('blue_units_initial[' + i + '].unit_uid duplicates "' + u.unit_uid + '"');
                } else {
                    seenBlueUid[u.unit_uid] = true;
                }
            });
        }
        return { ok: why.length === 0, why: why.join('; ') };
    }

    /* ---- Slice 2B: combine all hard rules (carver + forces) -------------- */
    function validateAllHardRules(d) {
        var a = validateDraftHardRules(d);
        var b = validateForcesHardRules(d);
        if (a.ok && b.ok) return { ok: true, why: '' };
        var why = [a.why, b.why].filter(Boolean).join('; ');
        return { ok: false, why: why };
    }

    /* ---- Slice 2A: geography defaults (AO, obj, pipeline, BLS, throughput) ---- */
    function defaultGeography() {
        return {
            map_bbox: [0, 0, 0, 0],
            ao_boundaries: [],
            obj: { name: '', coord: [0, 0], target_depth_km: 0, carver: 0, radius_km: 0 },
            pipeline: [],
            throughput_ceilings_km: { H12: 0, H24: 0, H48: 0, H72: 0, H120: 0 },
            bls_template: []
        };
    }
    function fillGeographyDefaults(d) {
        var g = defaultGeography();
        if (!Array.isArray(d.map_bbox) || d.map_bbox.length !== 4) d.map_bbox = g.map_bbox.slice();
        if (!Array.isArray(d.ao_boundaries)) d.ao_boundaries = g.ao_boundaries.slice();
        if (!d.obj || typeof d.obj !== 'object') {
            d.obj = clone(g.obj);
        } else {
            // Explicit per-key fill: clone() was written for objects and
            // would coerce a primitive default of 0 into {} via `o || {}`.
            if (d.obj.name == null)            d.obj.name = '';
            if (!Array.isArray(d.obj.coord) || d.obj.coord.length < 2) d.obj.coord = [0, 0];
            if (d.obj.target_depth_km == null) d.obj.target_depth_km = 0;
            if (d.obj.carver == null)          d.obj.carver = 0;
            if (d.obj.radius_km == null)       d.obj.radius_km = 0;
        }
        if (!Array.isArray(d.pipeline)) d.pipeline = g.pipeline.slice();
        if (!d.throughput_ceilings_km || typeof d.throughput_ceilings_km !== 'object') {
            d.throughput_ceilings_km = clone(g.throughput_ceilings_km);
        } else {
            Object.keys(g.throughput_ceilings_km).forEach(function (k) {
                if (d.throughput_ceilings_km[k] == null) {
                    d.throughput_ceilings_km[k] = g.throughput_ceilings_km[k];
                }
            });
        }
        if (!Array.isArray(d.bls_template)) d.bls_template = g.bls_template.slice();
    }

    /* ---- Slice 2A: hard validation (mirrors scenario-validator) ----------- */
    // scenario-validator.js:214 — obj.carver must be integer 0..60.
    function validateDraftHardRules(d) {
        var why = [];
        if (d && d.obj && d.obj.carver != null) {
            var c = d.obj.carver;
            if (!Number.isInteger(c) || c < 0 || c > 60) {
                why.push('obj.carver must be integer 0..60 (got ' + c + ')');
            }
        }
        return { ok: why.length === 0, why: why.join('; ') };
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
        var i = el('input', {
            type:  'number',
            class: 'sw-edit-input',
            step:  opts.integer ? '1' : (opts.step || 'any'),
            value: (value == null || value === '') ? '' : String(value)
        });
        if (opts.min != null) i.setAttribute('min', String(opts.min));
        if (opts.max != null) i.setAttribute('max', String(opts.max));
        i.addEventListener('input', function () {
            var raw = i.value;
            if (raw === '' || raw == null) { onInput(null); return; }
            var n = Number(raw);
            if (!isFinite(n)) { onInput(null); return; }
            if (opts.integer) n = Math.trunc(n);
            if (opts.min != null && n < opts.min) n = opts.min;
            if (opts.max != null && n > opts.max) n = opts.max;
            onInput(n);
        });
        return i;
    }
    function textArea(value, rows, onChange) {
        var t = el('textarea', { class: 'sw-edit-input', rows: String(rows || 4) });
        t.value = value == null ? '' : String(value);
        t.addEventListener('input', function () { onChange(t.value); });
        return t;
    }

    /* ---- Slice 2A: coord-list parsing / serialisation -------------------- */
    // "lon, lat" (or "lon  lat") per non-empty line → [[lon, lat], ...]. Bad lines skipped.
    function parseCoordLines(txt) {
        var out = [];
        String(txt || '').split(/\r?\n/).forEach(function (line) {
            var s = line.trim();
            if (!s) return;
            var m = s.split(/[\s,]+/).filter(Boolean);
            if (m.length < 2) return;
            var lon = Number(m[0]), lat = Number(m[1]);
            if (isFinite(lon) && isFinite(lat)) out.push([lon, lat]);
        });
        return out;
    }
    function coordsToLines(coords) {
        return (coords || []).map(function (c) {
            return (c && c.length >= 2) ? (c[0] + ', ' + c[1]) : '';
        }).join('\n');
    }
    // The adjudicator-map renderer expects GeoJSON Polygon coordinates:
    //   ao.coordinates = [ outerRing, hole1, ... ]   (rings of [lon, lat])
    //   ao.coordinates = [[[ring]], ...]             when ao.type === 'MultiPolygon'
    // Slice 2A authors only the outer ring of the first polygon.
    function aoExteriorRing(ao) {
        if (!ao || !ao.coordinates) return [];
        if (ao.type === 'MultiPolygon') {
            return (ao.coordinates[0] && ao.coordinates[0][0]) || [];
        }
        return ao.coordinates[0] || [];
    }
    function setAoExteriorRing(ao, ring) {
        if (ao.type === 'MultiPolygon') ao.coordinates = [[ring]];
        else                            ao.coordinates = [ring];
    }
    function makeMapBboxAoPolygon(bbox) {
        if (!Array.isArray(bbox) || bbox.length !== 4) return null;
        var lo0 = Number(bbox[0]), la0 = Number(bbox[1]),
            lo1 = Number(bbox[2]), la1 = Number(bbox[3]);
        if (![lo0, la0, lo1, la1].every(isFinite)) return null;
        return {
            name: 'AO',
            coordinates: [[[lo0, la0], [lo1, la0], [lo1, la1], [lo0, la1], [lo0, la0]]]
        };
    }

    /* ---- Slice 2A: AO card ----------------------------------------------- */
    function renderAOCard(host) {
        var card = el('div', { class: 'builder-card sw-card' }, [
            el('div', { class: 'builder-card-header' }, [
                el('span', { class: 'builder-card-title',
                             text: 'Edit · Area of Operations / منطقة العمليات' })
            ])
        ]);

        var bbox = _draft.map_bbox;
        var bboxDl = el('dl', { class: 'sw-kv' });
        ['lon_min', 'lat_min', 'lon_max', 'lat_max'].forEach(function (label, idx) {
            bboxDl.appendChild(fieldRow('map_bbox · ' + label, numberInput(bbox[idx], function (v) {
                bbox[idx] = (v == null ? 0 : v);
            })));
        });
        card.appendChild(bboxDl);

        var aoList = el('div', { class: 'sw-edit-list' });
        function rerenderAOList() {
            aoList.innerHTML = '';
            if (!_draft.ao_boundaries.length) {
                aoList.appendChild(el('div', { class: 'sw-edit-empty', text: '(no AO polygons)' }));
            }
            _draft.ao_boundaries.forEach(function (ao, idx) {
                var nameInp = textInput(ao.name || '', function (v) { ao.name = v; });
                var ringTa  = textArea(coordsToLines(aoExteriorRing(ao)), 4, function (v) {
                    setAoExteriorRing(ao, parseCoordLines(v));
                });
                var rm = el('button', { type: 'button', class: 'sw-edit-btn', text: 'Remove' });
                rm.addEventListener('click', function () {
                    _draft.ao_boundaries.splice(idx, 1);
                    rerenderAOList();
                });
                aoList.appendChild(el('div', { class: 'sw-edit-list-item' }, [
                    el('dl', { class: 'sw-kv' }, [
                        fieldRow('Polygon #' + (idx + 1) + ' · name', nameInp),
                        fieldRow('Outer ring (one "lon, lat" per line)', ringTa)
                    ]),
                    rm
                ]));
            });
        }
        rerenderAOList();
        card.appendChild(aoList);

        var addBtn = el('button', { type: 'button', class: 'sw-edit-btn', text: 'Add polygon' });
        addBtn.addEventListener('click', function () {
            _draft.ao_boundaries.push({
                name: 'AO ' + (_draft.ao_boundaries.length + 1),
                coordinates: [[]]
            });
            rerenderAOList();
        });
        var useBboxBtn = el('button', { type: 'button', class: 'sw-edit-btn', text: 'Use map_bbox as AO' });
        useBboxBtn.addEventListener('click', function () {
            var poly = makeMapBboxAoPolygon(_draft.map_bbox);
            if (!poly) { setStatus('map_bbox must have 4 finite numbers first.', true); return; }
            _draft.ao_boundaries.push(poly);
            rerenderAOList();
        });
        card.appendChild(el('div', { class: 'sw-edit-actions' }, [addBtn, useBboxBtn]));

        host.appendChild(card);
    }

    /* ---- Slice 2A: Geometry card ----------------------------------------- */
    function renderGeometryCard(host) {
        var card = el('div', { class: 'builder-card sw-card' }, [
            el('div', { class: 'builder-card-header' }, [
                el('span', { class: 'builder-card-title',
                             text: 'Edit · Forces Geometry (Objective + Pipeline + BLS + Throughput) / هندسة القوات' })
            ])
        ]);

        var obj = _draft.obj;
        if (!Array.isArray(obj.coord) || obj.coord.length < 2) obj.coord = [0, 0];
        card.appendChild(el('dl', { class: 'sw-kv' }, [
            fieldRow('obj · name',
                textInput(obj.name, function (v) { obj.name = v; })),
            fieldRow('obj · coord.lon',
                numberInput(obj.coord[0], function (v) { obj.coord[0] = (v == null ? 0 : v); })),
            fieldRow('obj · coord.lat',
                numberInput(obj.coord[1], function (v) { obj.coord[1] = (v == null ? 0 : v); })),
            fieldRow('obj · target_depth_km',
                numberInput(obj.target_depth_km, function (v) { obj.target_depth_km = (v == null ? 0 : v); })),
            // obj.carver: deliberately NOT clamping/truncating in the input so a
            // bad value (75, 6.5, -1) reaches validateDraftHardRules and surfaces
            // a visible red error at Save time — the validator is the single
            // source of truth (scenario-validator.js:214).
            fieldRow('obj · carver (integer 0..60)',
                numberInput(obj.carver, function (v) { obj.carver = v; })),
            fieldRow('obj · radius_km',
                numberInput(obj.radius_km, function (v) { obj.radius_km = (v == null ? 0 : v); }))
        ]));

        var pipeTa = textArea(coordsToLines(_draft.pipeline), 5, function (v) {
            _draft.pipeline = parseCoordLines(v);
        });
        card.appendChild(el('dl', { class: 'sw-kv' }, [
            fieldRow('pipeline (one "lon, lat" per line; ≥2 waypoints)', pipeTa)
        ]));

        var t = _draft.throughput_ceilings_km;
        var tDl = el('dl', { class: 'sw-kv' });
        ['H12', 'H24', 'H48', 'H72', 'H120'].forEach(function (k) {
            tDl.appendChild(fieldRow('throughput_ceilings_km · ' + k,
                numberInput(t[k], function (v) { t[k] = (v == null ? 0 : v); })));
        });
        card.appendChild(tDl);

        var blsList = el('div', { class: 'sw-edit-list' });
        function rerenderBlsList() {
            blsList.innerHTML = '';
            if (!_draft.bls_template.length) {
                blsList.appendChild(el('div', { class: 'sw-edit-empty', text: '(no BLS rows)' }));
            }
            _draft.bls_template.forEach(function (b, idx) {
                if (!Array.isArray(b.coord) || b.coord.length < 2) b.coord = [0, 0];
                var rm = el('button', { type: 'button', class: 'sw-edit-btn', text: 'Remove' });
                rm.addEventListener('click', function () {
                    _draft.bls_template.splice(idx, 1);
                    rerenderBlsList();
                    // Slice 2B: a BLS removal may invalidate red_units[].bls
                    // references and may need to disable Add Red unit.
                    if (typeof _refreshForcesAvailability === 'function') {
                        try { _refreshForcesAvailability(); } catch (_) {}
                    }
                });
                var label = 'BLS #' + (idx + 1);
                blsList.appendChild(el('div', { class: 'sw-edit-list-item' }, [
                    el('dl', { class: 'sw-kv' }, [
                        fieldRow(label + ' · name',
                            textInput(b.name || '', function (v) { b.name = v; })),
                        fieldRow(label + ' · coord.lon',
                            numberInput(b.coord[0], function (v) { b.coord[0] = (v == null ? 0 : v); })),
                        fieldRow(label + ' · coord.lat',
                            numberInput(b.coord[1], function (v) { b.coord[1] = (v == null ? 0 : v); })),
                        fieldRow(label + ' · role',
                            textInput(b.role || '', function (v) { b.role = v; })),
                        fieldRow(label + ' · throughput',
                            numberInput(b.throughput, function (v) { b.throughput = (v == null ? 0 : v); },
                                        { integer: true, min: 0 })),
                        fieldRow(label + ' · terrain_friction (0..1)',
                            numberInput(b.terrain_friction, function (v) { b.terrain_friction = (v == null ? 0 : v); },
                                        { min: 0, max: 1, step: '0.01' }))
                    ]),
                    rm
                ]));
            });
        }
        rerenderBlsList();
        card.appendChild(blsList);

        var addBls = el('button', { type: 'button', class: 'sw-edit-btn', text: 'Add BLS' });
        addBls.addEventListener('click', function () {
            _draft.bls_template.push({
                name: 'BLS-' + (_draft.bls_template.length + 1),
                coord: [0, 0], role: '', throughput: 0, terrain_friction: 0
            });
            rerenderBlsList();
            // Slice 2B: notify the Forces card so Add Red unit can enable.
            if (typeof _refreshForcesAvailability === 'function') {
                try { _refreshForcesAvailability(); } catch (_) {}
            }
        });
        card.appendChild(el('div', { class: 'sw-edit-actions' }, [addBls]));

        host.appendChild(card);
    }

    /* ---- Slice 2B: Forces card (Red OOB + Blue OOB) ---------------------- */
    // CMO maneuver-role enum the renderer recognises (adjudicator-map.js).
    var RED_UNIT_ROLES = [
        'Main effort', 'Fixing', 'Support', 'External envelopment',
        'Follow-on', 'Exploitation', 'Recon'
    ];

    function nextFreeUid(prefix, list, key) {
        var taken = new Set(list.map(function (u) { return u && u[key]; }).filter(Boolean));
        var i = 1;
        while (taken.has(prefix + '-' + i)) i++;
        return prefix + '-' + i;
    }

    function renderForcesCard(host) {
        var card = el('div', { class: 'builder-card sw-card' }, [
            el('div', { class: 'builder-card-header' }, [
                el('span', { class: 'builder-card-title',
                             text: 'Edit · Forces (Red OOB + Blue OOB) / القوات' })
            ])
        ]);

        var blsNames = (Array.isArray(_draft.bls_template) ? _draft.bls_template : [])
            .map(function (b) { return b && b.name; }).filter(Boolean);
        var stepCount = Array.isArray(_draft.steps) ? _draft.steps.length : 0;

        /* --- Red OOB --- */
        var redCard = el('div', { class: 'sw-edit-subcard' }, [
            el('div', { class: 'sw-edit-subcard-header', text: 'Red Order of Battle / ترتيب المعركة (أحمر)' })
        ]);
        var redList = el('div', { class: 'sw-edit-list' });
        function rerenderRedList() {
            redList.innerHTML = '';
            if (!_draft.red_units.length) {
                redList.appendChild(el('div', { class: 'sw-edit-empty', text: '(no Red units — Add Red unit below)' }));
            }
            // Refresh local BLS-name cache each render so removing/renaming a BLS
            // in the Geometry card upstream is reflected here.
            blsNames = (Array.isArray(_draft.bls_template) ? _draft.bls_template : [])
                .map(function (b) { return b && b.name; }).filter(Boolean);
            _draft.red_units.forEach(function (u, idx) {
                if (!Array.isArray(u.coord) || u.coord.length < 2) u.coord = [0, 0];
                var label = 'Red #' + (idx + 1);
                var rm = el('button', { type: 'button', class: 'sw-edit-btn', text: 'Remove' });
                rm.addEventListener('click', function () {
                    _draft.red_units.splice(idx, 1);
                    rerenderRedList();
                });
                // Build the BLS select — must include the unit's current value
                // even if it's no longer in bls_template (so the operator can see
                // and fix the broken reference rather than have it silently change).
                var blsOpts = blsNames.slice();
                if (u.bls && blsOpts.indexOf(u.bls) === -1) blsOpts.push(u.bls);
                redList.appendChild(el('div', { class: 'sw-edit-list-item' }, [
                    el('dl', { class: 'sw-kv' }, [
                        fieldRow(label + ' · uid',
                            textInput(u.uid || '', function (v) { u.uid = v; })),
                        fieldRow(label + ' · label',
                            textInput(u.label || '', function (v) { u.label = v; })),
                        fieldRow(label + ' · bls',
                            selectInput(blsOpts, u.bls || (blsOpts[0] || ''),
                                        function (v) { u.bls = v; })),
                        fieldRow(label + ' · appear (step index)',
                            numberInput(u.appear == null ? 0 : u.appear,
                                        function (v) { u.appear = (v == null ? 0 : v); })),
                        fieldRow(label + ' · role',
                            selectInput(RED_UNIT_ROLES, u.role || 'Main effort',
                                        function (v) { u.role = v; })),
                        fieldRow(label + ' · coord.lon',
                            numberInput(u.coord[0], function (v) { u.coord[0] = (v == null ? 0 : v); })),
                        fieldRow(label + ' · coord.lat',
                            numberInput(u.coord[1], function (v) { u.coord[1] = (v == null ? 0 : v); })),
                        fieldRow(label + ' · echelon',
                            textInput(u.echelon || '', function (v) { u.echelon = v; })),
                        fieldRow(label + ' · strength (0..1)',
                            numberInput(u.strength == null ? 1 : u.strength,
                                        function (v) { u.strength = (v == null ? 1 : v); },
                                        { min: 0, max: 1, step: '0.05' })),
                        fieldRow(label + ' · sidc',
                            textInput(u.sidc || '', function (v) { u.sidc = v; }))
                    ]),
                    rm
                ]));
            });
        }
        rerenderRedList();
        redCard.appendChild(redList);

        var addRed = el('button', { type: 'button', class: 'sw-edit-btn', text: 'Add Red unit' });
        var redHint = el('div', { class: 'sw-edit-hint',
            text: 'Add Red unit needs at least one BLS — define one in the Forces Geometry card above.' });
        function refreshAddRedAvailability() {
            var hasBls = (Array.isArray(_draft.bls_template) ? _draft.bls_template : [])
                            .some(function (b) { return b && b.name; });
            if (hasBls) {
                addRed.removeAttribute('disabled');
                redHint.style.display = 'none';
            } else {
                addRed.setAttribute('disabled', 'disabled');
                redHint.style.display = '';
            }
        }
        addRed.addEventListener('click', function () {
            // Repopulate the BLS cache RIGHT NOW (operator may have just added one upstream).
            blsNames = (Array.isArray(_draft.bls_template) ? _draft.bls_template : [])
                .map(function (b) { return b && b.name; }).filter(Boolean);
            if (!blsNames.length) {
                setStatus('Add at least one BLS in the Forces Geometry card before adding Red units.', true);
                return;
            }
            var firstBls = (_draft.bls_template[0] && Array.isArray(_draft.bls_template[0].coord))
                ? _draft.bls_template[0].coord.slice() : [0, 0];
            _draft.red_units.push({
                uid:      nextFreeUid('RED', _draft.red_units, 'uid'),
                label:    '',
                bls:      blsNames[0],
                appear:   0,
                role:     'Main effort',
                coord:    firstBls,
                strength: 1
            });
            rerenderRedList();
        });
        refreshAddRedAvailability();
        // Slice 2B: publish the in-place refresh callback so the Geometry card
        // can update Add Red availability when bls_template changes — without
        // forcing a full editor re-render that would lose input focus.
        _refreshForcesAvailability = refreshAddRedAvailability;
        redCard.appendChild(el('div', { class: 'sw-edit-actions' }, [addRed, redHint]));
        card.appendChild(redCard);

        /* --- Blue OOB --- */
        var blueCard = el('div', { class: 'sw-edit-subcard' }, [
            el('div', { class: 'sw-edit-subcard-header', text: 'Blue Order of Battle / ترتيب المعركة (أزرق)' })
        ]);
        var blueList = el('div', { class: 'sw-edit-list' });
        function rerenderBlueList() {
            blueList.innerHTML = '';
            if (!_draft.blue_units_initial.length) {
                blueList.appendChild(el('div', { class: 'sw-edit-empty', text: '(no Blue units)' }));
            }
            _draft.blue_units_initial.forEach(function (u, idx) {
                if (!Array.isArray(u.coord) || u.coord.length < 2) u.coord = [0, 0];
                var label = 'Blue #' + (idx + 1);
                var rm = el('button', { type: 'button', class: 'sw-edit-btn', text: 'Remove' });
                rm.addEventListener('click', function () {
                    _draft.blue_units_initial.splice(idx, 1);
                    rerenderBlueList();
                });
                blueList.appendChild(el('div', { class: 'sw-edit-list-item' }, [
                    el('dl', { class: 'sw-kv' }, [
                        fieldRow(label + ' · unit_uid',
                            textInput(u.unit_uid || '', function (v) { u.unit_uid = v; })),
                        fieldRow(label + ' · base_id',
                            textInput(u.base_id || '', function (v) { u.base_id = v; })),
                        fieldRow(label + ' · coord.lon',
                            numberInput(u.coord[0], function (v) { u.coord[0] = (v == null ? 0 : v); })),
                        fieldRow(label + ' · coord.lat',
                            numberInput(u.coord[1], function (v) { u.coord[1] = (v == null ? 0 : v); })),
                        fieldRow(label + ' · echelon',
                            textInput(u.echelon || '', function (v) { u.echelon = v; })),
                        fieldRow(label + ' · sidc',
                            textInput(u.sidc || '', function (v) { u.sidc = v; }))
                    ]),
                    rm
                ]));
            });
        }
        rerenderBlueList();
        blueCard.appendChild(blueList);

        var addBlue = el('button', { type: 'button', class: 'sw-edit-btn', text: 'Add Blue unit' });
        addBlue.addEventListener('click', function () {
            // Default coord: copy the first existing blue unit's coord if any,
            // else use map_bbox centre, else [0,0].
            var seed = [0, 0];
            if (_draft.blue_units_initial.length &&
                Array.isArray(_draft.blue_units_initial[0].coord) &&
                _draft.blue_units_initial[0].coord.length >= 2) {
                seed = _draft.blue_units_initial[0].coord.slice();
            } else if (Array.isArray(_draft.map_bbox) && _draft.map_bbox.length === 4 &&
                       _draft.map_bbox.every(function (n) { return typeof n === 'number'; })) {
                seed = [(_draft.map_bbox[0] + _draft.map_bbox[2]) / 2,
                        (_draft.map_bbox[1] + _draft.map_bbox[3]) / 2];
            }
            var nextN = _draft.blue_units_initial.length + 1;
            _draft.blue_units_initial.push({
                unit_uid: nextFreeUid('BLUE', _draft.blue_units_initial, 'unit_uid'),
                base_id:  'B' + nextN,
                coord:    seed
            });
            rerenderBlueList();
        });
        blueCard.appendChild(el('div', { class: 'sw-edit-actions' }, [addBlue]));
        card.appendChild(blueCard);

        // Note: blue_units_base_ids is DERIVED at Save time from
        // blue_units_initial[].base_id — no separate editor.
        card.appendChild(el('div', { class: 'sw-edit-hint',
            text: 'blue_units_base_ids is derived from Blue · base_id on Save (kept in sync automatically).' }));

        host.appendChild(card);
    }

    /* ---- Slice 2C: factored existing card renderers ---------------------- */
    function renderMetadataCard(host) {
        var card = el('div', { class: 'builder-card sw-card' }, [
            el('div', { class: 'builder-card-header' }, [
                el('span', { class: 'builder-card-title',
                             text: 'Edit · Scenario Metadata & Version / بيانات السيناريو + الإصدار' })
            ]),
            el('dl', { class: 'sw-kv' }, [
                fieldRow('Name / الاسم (filename — must equal on-disk name)',
                    textInput(_draft.name, function (v) { _draft.name = v; })),
                fieldRow('Label / التسمية',
                    textInput(_draft.scenario_label, function (v) { _draft.scenario_label = v; })),
                fieldRow('Scenario ID',
                    textInput(_draft.scenario_id, function (v) { _draft.scenario_id = v; })),
                // CMO Step 1: Database / version. RMOOZ has no unit DB, so this
                // maps to model_version + schema_variant only.
                fieldRow('model_version',
                    textInput(_draft.model_version, function (v) { _draft.model_version = v; })),
                fieldRow('schema_variant (e.g. "authored", "w3-rich")',
                    textInput(_draft.schema_variant, function (v) { _draft.schema_variant = v; }))
            ])
        ]);
        host.appendChild(card);
    }

    function renderSidesCard(host) {
        var card = el('div', { class: 'builder-card sw-card' }, [
            el('div', { class: 'builder-card-header' }, [
                el('span', { class: 'builder-card-title', text: 'Edit · Sides / الأطراف' })
            ])
        ]);
        _draft.sides.forEach(function (side) {
            card.appendChild(el('dl', { class: 'sw-kv' }, [
                fieldRow(side.id + ' · name (EN)', textInput(side.name_en, function (v) { side.name_en = v; })),
                fieldRow(side.id + ' · name (AR)', textInput(side.name_ar, function (v) { side.name_ar = v; })),
                fieldRow(side.id + ' · role',      selectInput(ROLES, side.role, function (v) { side.role = v; })),
                fieldRow(side.id + ' · color',     textInput(side.color, function (v) { side.color = v; }))
            ]));
        });
        host.appendChild(card);
    }

    function renderPostureCard(host) {
        var card = el('div', { class: 'builder-card sw-card' }, [
            el('div', { class: 'builder-card-header' }, [
                el('span', { class: 'builder-card-title',
                             text: 'Edit · Posture matrix (from → to) / مصفوفة الموقف' })
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
        card.appendChild(dl);
        host.appendChild(card);
    }

    /* ---- Slice 2C: Time & Duration card (Step 6) ------------------------- */
    // The 6-step Sahil-style default. Mirrors the playbook walkthrough.
    function synthesizeDefaultPhaseTable() {
        return [
            { index: 0, time_label: 'H-3',   elapsed_hours: -3,  phase: 'PRE-H' },
            { index: 1, time_label: 'H+0',   elapsed_hours: 0,   phase: 'PHASE 1' },
            { index: 2, time_label: 'H+12',  elapsed_hours: 12,  phase: 'PHASE 2A' },
            { index: 3, time_label: 'H+36',  elapsed_hours: 36,  phase: 'PHASE 2B' },
            { index: 4, time_label: 'H+72',  elapsed_hours: 72,  phase: 'PHASE 3' },
            { index: 5, time_label: 'H+120', elapsed_hours: 120, phase: 'RESOLUTION' }
        ];
    }
    // Keep phase_table and steps length in lockstep (validator hard rule).
    function ensureStepsMatchPhaseTable(d) {
        if (!Array.isArray(d.phase_table)) d.phase_table = [];
        if (!Array.isArray(d.steps)) d.steps = [];
        while (d.steps.length < d.phase_table.length) {
            var i = d.steps.length;
            var ph = d.phase_table[i] || {};
            d.steps.push({
                index: i, time_label: ph.time_label || ('H+' + i),
                elapsed_hours: ph.elapsed_hours == null ? 0 : ph.elapsed_hours,
                phase: ph.phase || 'PHASE 1'
            });
        }
        while (d.steps.length > d.phase_table.length) d.steps.pop();
        // Re-stamp index/time/phase from phase_table so the two stay aligned.
        d.phase_table.forEach(function (pt, i) {
            if (!d.steps[i]) return;
            d.steps[i].index = i;
            d.steps[i].time_label = pt.time_label;
            d.steps[i].elapsed_hours = pt.elapsed_hours;
            d.steps[i].phase = pt.phase;
        });
    }

    function renderTimeDurationCard(host) {
        var card = el('div', { class: 'builder-card sw-card' }, [
            el('div', { class: 'builder-card-header' }, [
                el('span', { class: 'builder-card-title',
                             text: 'Edit · Time & Duration (phase_table) / الزمن والمدة' })
            ])
        ]);

        if (!Array.isArray(_draft.phase_table)) _draft.phase_table = [];
        var list = el('div', { class: 'sw-edit-list' });
        function rerender() {
            list.innerHTML = '';
            if (!_draft.phase_table.length) {
                list.appendChild(el('div', { class: 'sw-edit-empty',
                    text: '(no phases — click "Synthesize H-3 → H+120 (6 steps)" below for the Sahil default)' }));
            }
            _draft.phase_table.forEach(function (pt, idx) {
                // Defensive: ensure index field matches array position
                pt.index = idx;
                var rm = el('button', { type: 'button', class: 'sw-edit-btn', text: 'Remove' });
                rm.addEventListener('click', function () {
                    _draft.phase_table.splice(idx, 1);
                    ensureStepsMatchPhaseTable(_draft);
                    rerender();
                });
                var label = 'Step #' + idx;
                list.appendChild(el('div', { class: 'sw-edit-list-item' }, [
                    el('dl', { class: 'sw-kv' }, [
                        fieldRow(label + ' · time_label (e.g. "H-3", "H+0")',
                            textInput(pt.time_label || '', function (v) { pt.time_label = v; ensureStepsMatchPhaseTable(_draft); })),
                        fieldRow(label + ' · elapsed_hours',
                            numberInput(pt.elapsed_hours, function (v) { pt.elapsed_hours = (v == null ? 0 : v); ensureStepsMatchPhaseTable(_draft); })),
                        fieldRow(label + ' · phase',
                            selectInput(PHASES_ENUM, pt.phase || 'PHASE 1', function (v) { pt.phase = v; ensureStepsMatchPhaseTable(_draft); }))
                    ]),
                    rm
                ]));
            });
        }
        rerender();
        card.appendChild(list);

        var addRow = el('button', { type: 'button', class: 'sw-edit-btn', text: 'Add step' });
        addRow.addEventListener('click', function () {
            var i = _draft.phase_table.length;
            _draft.phase_table.push({ index: i, time_label: 'H+' + i, elapsed_hours: i, phase: 'PHASE 1' });
            ensureStepsMatchPhaseTable(_draft);
            rerender();
        });
        var synth = el('button', { type: 'button', class: 'sw-edit-btn sw-edit-btn-primary',
            text: 'Synthesize H-3 → H+120 (6 steps)' });
        synth.addEventListener('click', function () {
            _draft.phase_table = synthesizeDefaultPhaseTable();
            ensureStepsMatchPhaseTable(_draft);
            rerender();
        });
        card.appendChild(el('div', { class: 'sw-edit-actions' }, [addRow, synth]));
        card.appendChild(el('div', { class: 'sw-edit-hint',
            text: 'phase_table and steps stay in lockstep on edit (validator hard rule: equal length).' }));

        host.appendChild(card);
    }

    /* ---- Slice 2C: Briefing card (Step 12) ------------------------------- */
    function renderBriefingCard(host) {
        var card = el('div', { class: 'builder-card sw-card' }, [
            el('div', { class: 'builder-card-header' }, [
                el('span', { class: 'builder-card-title',
                             text: 'Edit · Briefing (per-step narratives) / التلخيص' })
            ])
        ]);

        if (!Array.isArray(_draft.steps) || !_draft.steps.length) {
            card.appendChild(el('div', { class: 'sw-edit-empty',
                text: '(no steps yet — define phase_table in Step 6 first)' }));
            host.appendChild(card);
            return;
        }

        _draft.steps.forEach(function (st, idx) {
            var sub = el('div', { class: 'sw-edit-subcard' }, [
                el('div', { class: 'sw-edit-subcard-header',
                    text: 'Step ' + idx + ' · ' + (st.time_label || '?') + ' · ' + (st.phase || '?') })
            ]);
            var enTa = textArea(st.narrative_en_baseline || '', 3, function (v) { st.narrative_en_baseline = v; });
            var arTa = textArea(st.narrative_ar_baseline || '', 3, function (v) { st.narrative_ar_baseline = v; });
            arTa.setAttribute('dir', 'rtl');
            sub.appendChild(el('dl', { class: 'sw-kv' }, [
                fieldRow('Narrative (EN)', enTa),
                fieldRow('Narrative (AR / عربي)', arTa)
            ]));
            card.appendChild(sub);
        });

        host.appendChild(card);
    }

    /* ---- Slice 2C: placeholder card for engine-gap steps ----------------- */
    function renderPlaceholderCard(host, opts) {
        opts = opts || {};
        host.appendChild(el('div', { class: 'sw-gap-card' }, [
            el('div', { class: 'sw-gap-card-title', text: opts.title || 'Coming soon' }),
            el('div', { class: 'sw-gap-card-why',
                text: opts.why || 'This CMO build-order step is not yet modeled in RMOOZ.' }),
            el('div', { class: 'sw-gap-card-why',
                text: opts.slice ? ('Planned slice: ' + opts.slice) : '' })
        ]));
    }

    /* ---- Slice 2C: STEPS table (CMO build-order navigator) --------------- */
    // Mirrors docs/cmo-functional-rules/5-build-playbook.md step order. Steps
    // that aren't built yet render a placeholder card and carry gap:true so
    // the rail shows them as engine-GAPs (dashed pill instead of solid).
    var STEPS = [
        { id: 'meta',     title_en: 'Metadata & Version', title_ar: 'البيانات والإصدار',
          render: function (h) { renderMetadataCard(h); } },
        { id: 'map',      title_en: 'Map & AO',            title_ar: 'الخريطة ومنطقة العمليات',
          render: function (h) { renderAOCard(h); } },
        { id: 'sides',    title_en: 'Sides',               title_ar: 'الأطراف',
          render: function (h) { renderSidesCard(h); } },
        { id: 'posture',  title_en: 'Posture',             title_ar: 'الموقف',
          render: function (h) { renderPostureCard(h); } },
        { id: 'doctrine', title_en: 'Doctrine / ROE',      title_ar: 'العقيدة / قواعد الاشتباك', gap: true,
          render: function (h) { renderPlaceholderCard(h, {
            title: 'Doctrine / ROE / WRA',
            why: 'CMO playbook Step 5 ⚠️ GAP — no scenario field for doctrine/WRA/ROE exists yet. The AI adjudicator uses prompt prose, not authored policy.',
            slice: 'DOC1 (the next chosen roadmap item)'
          }); } },
        { id: 'time',     title_en: 'Time & Duration',     title_ar: 'الزمن والمدة',
          render: function (h) { renderTimeDurationCard(h); } },
        { id: 'weather',  title_en: 'Weather',             title_ar: 'الطقس', gap: true,
          render: function (h) { renderPlaceholderCard(h, {
            title: 'Weather / Sea State',
            why: 'CMO playbook Step 8 ⚠️ partial — only terrain_note + terrain_friction exist. No weather / sea-state schema yet.',
            slice: 'A later schema-extension slice'
          }); } },
        { id: 'geom',     title_en: 'Forces Geometry',     title_ar: 'هندسة القوات',
          render: function (h) { renderGeometryCard(h); } },
        { id: 'forces',   title_en: 'Forces (OOB)',        title_ar: 'القوات',
          render: function (h) { renderForcesCard(h); } },
        { id: 'missions', title_en: 'Missions',            title_ar: 'المهام', gap: true,
          render: function (h) { renderPlaceholderCard(h, {
            title: 'Missions / Packages',
            why: 'CMO playbook Step 11 ⚠️ GAP — no missions[] schema. Intent is expressed per-step via actors/affected/engagement_arcs.',
            slice: 'TASK1 in the roadmap'
          }); } },
        { id: 'events',   title_en: 'Events',              title_ar: 'الأحداث', gap: true,
          render: function (h) { renderPlaceholderCard(h, {
            title: 'Events (trigger → condition → action)',
            why: 'CMO playbook Step 12 ⚠️ GAP — no structured events[] schema. The Event Log is a ledger, not rules that fire.',
            slice: 'A later events-schema slice'
          }); } },
        { id: 'briefing', title_en: 'Briefing',            title_ar: 'التلخيص',
          render: function (h) { renderBriefingCard(h); } },
        { id: 'save',     title_en: 'Validate & Save',     title_ar: 'التحقق والحفظ',
          render: function (h) { renderSaveStepCard(h); } }
    ];

    /* ---- Slice 2C: per-step completion predicates ------------------------ */
    function isBboxValidish(b) {
        return Array.isArray(b) && b.length === 4 && b.every(function (n) { return typeof n === 'number' && isFinite(n); }) &&
               (b[0] !== 0 || b[1] !== 0 || b[2] !== 0 || b[3] !== 0);
    }
    function stepIsComplete(d, stepIdx) {
        if (!d) return false;
        switch (STEPS[stepIdx] && STEPS[stepIdx].id) {
            case 'meta':     return !!(d.name && d.scenario_label);
            case 'map':      return isBboxValidish(d.map_bbox) && Array.isArray(d.ao_boundaries) && d.ao_boundaries.length > 0;
            case 'sides':    return Array.isArray(d.sides) && d.sides.length >= 2;
            case 'posture':  return !!(d.postures && d.postures.BLUE && d.postures.RED);
            case 'doctrine': return null; // gap — no completion concept
            case 'time':     return Array.isArray(d.phase_table) && d.phase_table.length > 0 &&
                                    Array.isArray(d.steps) && d.steps.length === d.phase_table.length;
            case 'weather':  return null; // gap
            case 'geom':     return Array.isArray(d.bls_template) && d.bls_template.length >= 1 &&
                                    d.obj && !!d.obj.name && Array.isArray(d.pipeline) && d.pipeline.length >= 2;
            case 'forces':   return Array.isArray(d.red_units) && d.red_units.length >= 1 &&
                                    Array.isArray(d.blue_units_initial) && d.blue_units_initial.length >= 1;
            case 'missions': return null; // gap
            case 'events':   return null; // gap
            case 'briefing': return Array.isArray(d.steps) && d.steps.length > 0 &&
                                    d.steps.every(function (s) { return s && !!s.narrative_en_baseline; });
            case 'save':     return validateAllHardRules(d).ok;
            default:         return false;
        }
    }
    function stepPillClass(d, stepIdx) {
        var step = STEPS[stepIdx];
        if (!step) return 'empty';
        if (step.gap) return 'gap';
        var c = stepIsComplete(d, stepIdx);
        if (c === true)  return 'ok';
        if (c === false) return 'empty';
        return 'gap';
    }

    /* ---- Slice 2C: New Scenario inline form ------------------------------ */
    function renderNewScenarioForm(host) {
        var nameInp  = el('input', { type: 'text', class: 'sw-edit-input', placeholder: 'e.g. my-scenario' });
        var labelInp = el('input', { type: 'text', class: 'sw-edit-input', placeholder: 'Human-readable title' });
        var labelAr  = el('input', { type: 'text', class: 'sw-edit-input', placeholder: 'العنوان بالعربية', dir: 'rtl' });
        var baseSel  = el('select', { class: 'sw-edit-input' });
        ['empty', 'sahil-corridor-sample'].forEach(function (k) {
            var o = el('option', { value: k, text: k });
            baseSel.appendChild(o);
        });
        var cancelBtn = el('button', { type: 'button', class: 'sw-edit-btn', text: 'Cancel' });
        var createBtn = el('button', { type: 'button', class: 'sw-edit-btn sw-edit-btn-primary', text: 'Create' });
        var statusSpan = el('span', { class: 'sw-edit-status', text: '' });

        var form = el('div', { class: 'sw-newscen-form' }, [
            el('div', { class: 'sw-newscen-form-title', text: 'New scenario / سيناريو جديد' }),
            el('dl', { class: 'sw-kv' }, [
                fieldRow('name (filename, sanitised)', nameInp),
                fieldRow('Label (EN)', labelInp),
                fieldRow('Label (AR / عربي)', labelAr),
                fieldRow('Base template', baseSel)
            ]),
            el('div', { class: 'sw-edit-actions' }, [createBtn, cancelBtn, statusSpan])
        ]);

        function close() {
            _showingNewScenarioForm = false;
            if (form.parentNode) form.parentNode.removeChild(form);
        }
        function sanitiseName(raw) {
            return String(raw || '').toLowerCase()
                .replace(/[^a-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 64);
        }
        cancelBtn.addEventListener('click', close);
        createBtn.addEventListener('click', function () {
            var name = sanitiseName(nameInp.value);
            if (!name) { statusSpan.textContent = 'Name required'; statusSpan.style.color = '#d6332e'; return; }
            // Build a fresh draft. The base template option is informational
            // for now — both produce an empty draft via the standard template
            // (the "sahil-corridor-sample" option is hinted for a future
            // template loader; not yet implemented to keep the slice small).
            var fresh;
            if (window.AppScenarioAuthoring &&
                typeof window.AppScenarioAuthoring.buildStandardScenarioAuthoringTemplate === 'function') {
                fresh = clone(window.AppScenarioAuthoring.buildStandardScenarioAuthoringTemplate());
            } else {
                fresh = { scenario_label: '', steps: [] };
            }
            fresh.name = name;
            fresh.scenario_label = labelInp.value || name;
            if (labelAr.value) fresh.scenario_label_ar = labelAr.value;
            if (!fresh.sides || !fresh.sides.length) fresh.sides = defaultSides();
            if (!fresh.postures) fresh.postures = defaultPostures();
            fillGeographyDefaults(fresh);
            fillForcesDefaults(fresh);
            fresh.schema_variant = 'authored';
            fresh.model_version  = 'authored-v1';
            fresh.authoring_status = 'draft';
            _draft = fresh;
            _activeStep = 0;
            close();
            // Re-render the editor with the fresh draft on Step 1.
            renderEditor();
            try { logOperator('New scenario draft created (in-memory only)', { name: name }); } catch (_) {}
        });

        host.appendChild(form);
    }

    /* ---- Slice 2C: Step 13 — Validate & Save card ------------------------ */
    function renderSaveStepCard(host) {
        var card = el('div', { class: 'builder-card sw-card' }, [
            el('div', { class: 'builder-card-header' }, [
                el('span', { class: 'builder-card-title',
                             text: 'Validate & Save / التحقق والحفظ' })
            ])
        ]);

        // Summary: which steps are complete?
        var summary = el('dl', { class: 'sw-kv' });
        STEPS.forEach(function (s, i) {
            if (i === STEPS.length - 1) return; // skip self
            var c = stepIsComplete(_draft, i);
            var label = (i + 1) + '. ' + s.title_en;
            var ind = c === true ? '✓' : (c === false ? '—' : '·');
            var color = c === true ? '#1a7f37' : (c === false ? '#c9a227' : '#8d949e');
            var row = el('div', { class: 'sw-kv-row sw-edit-row' }, [
                el('dt', { text: label }),
                el('dd', null, [el('span', { text: ind + (s.gap ? ' (gap)' : ''), style: 'color:' + color })])
            ]);
            summary.appendChild(row);
        });
        card.appendChild(summary);

        // Save action row (in addition to the always-visible save bar below).
        var saveBtn = el('button', { type: 'button', class: 'sw-edit-btn sw-edit-btn-primary',
            text: 'Save draft (in-memory) / حفظ المسودة' });
        saveBtn.addEventListener('click', saveDraft);
        var saveAsBtn = el('button', { type: 'button', class: 'sw-edit-btn',
            text: 'Save As JSON (download) / حفظ كملف' });
        saveAsBtn.addEventListener('click', saveAsJson);
        var saveToServerBtn = el('button', { type: 'button', class: 'sw-edit-btn',
            text: 'Save to server / حفظ على الخادم' });
        saveToServerBtn.addEventListener('click', saveToServer);
        var copyBtn = el('button', { type: 'button', class: 'sw-edit-btn',
            text: 'Copy JSON / نسخ' });
        copyBtn.addEventListener('click', copyJson);

        card.appendChild(el('div', { class: 'sw-edit-actions' }, [
            saveBtn, saveAsBtn, saveToServerBtn, copyBtn
        ]));
        card.appendChild(el('div', { class: 'sw-edit-hint',
            text: 'In-memory save updates the live RmoozScenario. Save As / Save to server persist outside the in-memory boundary.' }));

        host.appendChild(card);
    }

    /* ---- Slice 2C: Save As JSON (Blob download) -------------------------- */
    function saveAsJson() {
        if (!_draft) return;
        // Sync derived fields first so the file mirrors the in-memory model.
        syncBlueBaseIds(_draft);
        var hard = validateAllHardRules(_draft);
        if (!hard.ok) { setStatus('Blocked: ' + hard.why, true); return; }
        try {
            var json = JSON.stringify(_draft, null, 2);
            var blob = new Blob([json], { type: 'application/json' });
            var url  = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = (_draft.name || 'scenario') + '.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
            setStatus('Downloaded ' + a.download, false);
            logOperator('Scenario draft downloaded as JSON', { name: _draft.name || '' });
        } catch (e) {
            setStatus('Download failed: ' + (e && e.message), true);
        }
    }

    /* ---- Slice 2C: POST /api/scenarios (durable server save) ------------- */
    function saveToServer() {
        if (!_draft) return;
        syncBlueBaseIds(_draft);
        var hard = validateAllHardRules(_draft);
        if (!hard.ok) { setStatus('Blocked: ' + hard.why, true); return; }
        var body = JSON.stringify({ scenario: _draft });
        setStatus('Saving to server …', false);
        fetch('/api/scenarios', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: body
        }).then(function (r) {
            return r.json().then(function (j) { return { ok: r.ok, status: r.status, body: j }; });
        }).then(function (resp) {
            if (resp.ok) {
                setStatus('Saved to server as "' + resp.body.name + '" (active).', false);
                logOperator('Scenario saved to server', { name: resp.body.name });
                return;
            }
            if (resp.status === 409) {
                if (window.confirm('Scenario "' + (_draft.name || '') + '" already exists on the server. Overwrite?')) {
                    fetch('/api/scenarios?overwrite=1', {
                        method: 'POST', credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: body
                    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, status: r.status, body: j }; }); })
                      .then(function (resp2) {
                          if (resp2.ok) {
                              setStatus('Overwritten on server as "' + resp2.body.name + '".', false);
                              logOperator('Scenario overwritten on server', { name: resp2.body.name });
                          } else {
                              setStatus('Server rejected overwrite: ' + (resp2.body && resp2.body.error || resp2.status), true);
                          }
                      }).catch(function (e) { setStatus('Network error: ' + (e && e.message), true); });
                } else {
                    setStatus('Server save cancelled — scenario already exists.', true);
                }
                return;
            }
            setStatus('Server rejected save: ' + (resp.body && resp.body.error || resp.status), true);
        }).catch(function (e) {
            setStatus('Network error: ' + (e && e.message), true);
        });
    }

    /* ---- Slice 2C: stepped editor render --------------------------------- */
    function renderEditor() {
        var host = document.getElementById(EDITOR_ID);
        if (!host) return;
        host.innerHTML = '';
        if (!_draft) _draft = buildDraft();

        // Clamp _activeStep to valid range so a fresh start lands on Step 1.
        if (_activeStep < 0 || _activeStep >= STEPS.length) _activeStep = 0;

        var layout = el('div', { class: 'sw-step-layout' });
        var rail   = el('div', { class: 'sw-step-rail' });
        var content = el('div', { class: 'sw-step-content' });

        // Build the rail.
        STEPS.forEach(function (s, i) {
            var classes = ['sw-step-item'];
            if (i === _activeStep) classes.push('active');
            if (s.gap)             classes.push('gap');
            var item = el('div', { class: classes.join(' ') }, [
                el('span', { class: 'sw-step-num',   text: String(i + 1) }),
                el('span', { class: 'sw-step-title', text: s.title_en + ' · ' + s.title_ar }),
                el('span', { class: 'sw-step-pill ' + stepPillClass(_draft, i) })
            ]);
            item.addEventListener('click', function () {
                _activeStep = i;
                renderEditor();
            });
            rail.appendChild(item);
        });

        // Render the active step into the content pane.
        try {
            STEPS[_activeStep].render(content);
        } catch (e) {
            content.appendChild(el('div', { class: 'sw-gap-card',
                text: 'Step render failed: ' + (e && e.message) }));
            try { console.warn('[edit-mode] step render error', e); } catch (_) {}
        }

        layout.appendChild(rail);
        layout.appendChild(content);
        host.appendChild(layout);

        // Always-visible bottom actions row (Save / Copy / Status).
        var status = el('span', { id: 'sw-editmode-status', class: 'sw-edit-status', text: '' });
        var saveBtn = el('button', { type: 'button', class: 'sw-edit-btn sw-edit-btn-primary',
            text: 'Save draft / حفظ المسودة' });
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

        // Slice 2B: keep the derived blue_units_base_ids parallel array in
        // lockstep with the authoritative blue_units_initial. Runs FIRST so
        // the hard-rules check sees the synced state.
        syncBlueBaseIds(_draft);

        // Hard validator rules (Slice 2A carver + Slice 2B forces). Mirrors
        // UI_MOdified/server/ai/scenario-validator.js so the operator gets
        // immediate feedback instead of a later server-side reject.
        var hard = validateAllHardRules(_draft);
        if (!hard.ok) { setStatus('Blocked: ' + hard.why, true); return; }

        var gate = draftIsSafe(_draft);
        if (!gate.ok) { setStatus('Blocked: ' + gate.why, true); return; }

        var slot = window.RmoozScenario || (window.RmoozScenario = { scenario: null, stepIndex: 0 });
        slot.scenario = clone(_draft);                 // in-memory working copy ONLY
        if (typeof slot.stepIndex !== 'number') slot.stepIndex = 0;

        try { window.AppShellScenarioWorkspace && window.AppShellScenarioWorkspace.refresh(); } catch (_) {}

        // Slice 2A: geometry edits must repaint AO/obj/pipeline/BLS markers.
        // Reuses the public AppAdjudicatorMap API (clears-then-redraws);
        // does not duplicate any drawing logic.
        try {
            if (window.AppAdjudicatorMap && typeof window.AppAdjudicatorMap.drawScenario === 'function') {
                window.AppAdjudicatorMap.drawScenario(slot.scenario);
            }
        } catch (_) {}
        try {
            if (window.AppAdjudicatorMap && typeof window.AppAdjudicatorMap.fitScenarioAO === 'function') {
                window.AppAdjudicatorMap.fitScenarioAO();
            }
        } catch (_) {}

        logOperator('Scenario draft edited (metadata/sides/posture/geography) — in-memory only, not committed',
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

        // Slice 2C: + New scenario opens an inline form to stamp a fresh draft.
        var newBtn = el('button', {
            id: 'sw-editmode-newscen', type: 'button', class: 'sw-edit-btn',
            text: '+ New scenario / سيناريو جديد'
        });
        newBtn.addEventListener('click', function () {
            // Open the form inside the BAR_ID strip itself (not the editor pane,
            // because the editor pane is hidden until Edit Mode is ON).
            if (_showingNewScenarioForm) return;
            _showingNewScenarioForm = true;
            renderNewScenarioForm(document.getElementById(BAR_ID));
        });

        var bar = el('div', { id: BAR_ID, class: 'sw-editmode-bar' }, [btn, newBtn]);

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
        isOn: function () { return _on; },
        // Slice 2A/2B/2C: pure helpers exposed for static Node tests.
        // Not intended for runtime callers.
        _testing: {
            defaultSides:            defaultSides,
            defaultPostures:         defaultPostures,
            defaultGeography:        defaultGeography,
            fillGeographyDefaults:   fillGeographyDefaults,
            validateDraftHardRules:  validateDraftHardRules,
            parseCoordLines:         parseCoordLines,
            coordsToLines:           coordsToLines,
            aoExteriorRing:          aoExteriorRing,
            setAoExteriorRing:       setAoExteriorRing,
            makeMapBboxAoPolygon:    makeMapBboxAoPolygon,
            // Slice 2B
            fillForcesDefaults:      fillForcesDefaults,
            syncBlueBaseIds:         syncBlueBaseIds,
            validateForcesHardRules: validateForcesHardRules,
            validateAllHardRules:    validateAllHardRules,
            RED_UNIT_ROLES:          RED_UNIT_ROLES,
            nextFreeUid:             nextFreeUid,
            // Slice 2C
            STEPS:                       STEPS,
            stepIsComplete:              stepIsComplete,
            stepPillClass:               stepPillClass,
            synthesizeDefaultPhaseTable: synthesizeDefaultPhaseTable,
            ensureStepsMatchPhaseTable:  ensureStepsMatchPhaseTable,
            PHASES_ENUM:                 PHASES_ENUM
        }
    };
})();
