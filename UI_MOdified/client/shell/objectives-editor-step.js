/**
 * RMOOZ Edit Mode: Step 5 — Objectives Editor
 *
 * Allows editing of strategic objectives: placement, ownership, difficulty, defenses, constraints.
 * Part of Scenario Authoring Slice 2A (Geography & Forces).
 *
 * Pattern: renderObjectivesCard(host) is invoked by scenario-edit-mode.js STEPS carousel.
 * All mutations happen on window._RMOOZEditModeObjectives.shared._draft.objectives
 * via callbacks that trigger _markDirty() and are persisted in saveDraft().
 */

(function () {
    'use strict';

    // Module exposes: window.RMOOZEditModeObjectives = { renderObjectivesCard: fn }
    var exports = {
        renderObjectivesCard: renderObjectivesCard
    };

    function renderObjectivesCard(host) {
        // Main container
        var card = el('div', { class: 'builder-card sw-card' }, [
            el('div', { class: 'builder-card-header' }, [
                el('span', { class: 'builder-card-title', text: 'Edit · Objectives / الأهداف' })
            ])
        ]);

        // Two-pane layout: list on left, detail editor on right
        var container = el('div', { class: 'sw-objectives-container' });
        var listPane = el('div', { class: 'sw-objectives-list-pane' });
        var detailPane = el('div', { class: 'sw-objectives-detail-pane' });

        container.appendChild(listPane);
        container.appendChild(detailPane);
        card.appendChild(container);

        // Get references to shared state (scenario-edit-mode.js sets this up)
        var shared = getSharedState();
        if (!shared || !shared._draft) {
            host.appendChild(el('div', { class: 'sw-error', text: 'Edit mode not initialized' }));
            return;
        }

        var draft = shared._draft;
        var markDirty = shared._markDirty;

        // Ensure objectives array exists
        if (!Array.isArray(draft.objectives)) {
            draft.objectives = [];
        }

        // Track selected objective index
        var selectedIndex = -1;

        // Render the objectives list
        function renderList() {
            listPane.innerHTML = '';
            var list = el('div', { class: 'sw-objectives-list' });

            if (draft.objectives.length === 0) {
                list.appendChild(el('div', { class: 'sw-objectives-empty',
                    text: 'No objectives defined. Load a scenario or create your own.' }));
            } else {
                draft.objectives.forEach(function (obj, index) {
                    var item = el('div', {
                        class: 'sw-objective-item' + (index === selectedIndex ? ' sw-objective-item--selected' : '')
                    }, [
                        el('div', { class: 'sw-objective-item-id', text: obj.id || '(unnamed)' }),
                        el('div', { class: 'sw-objective-item-name', text: obj.name || '(no name)' }),
                        el('div', { class: 'sw-objective-item-owner', text: obj.owner || '?' })
                    ]);
                    item.addEventListener('click', function () {
                        selectedIndex = index;
                        renderList();
                        renderDetail();
                    });
                    list.appendChild(item);
                });
            }

            listPane.appendChild(list);
        }

        // Render the detail editor for selected objective
        function renderDetail() {
            detailPane.innerHTML = '';

            if (selectedIndex < 0 || selectedIndex >= draft.objectives.length) {
                detailPane.appendChild(el('div', { class: 'sw-objectives-detail-empty',
                    text: 'Select an objective from the list to edit its properties.' }));
                return;
            }

            var obj = draft.objectives[selectedIndex];
            var dl = el('dl', { class: 'sw-kv' });

            // Helper to create field rows with validation
            function addField(label, inputNode, required, validator) {
                var hint = required ? el('span', { class: 'sw-meta-hint sw-meta-hint--required', text: ' *required' }) : null;
                var errHint = el('div', { class: 'sw-meta-hint sw-meta-hint--err' });
                var labelEl = el('div', { class: 'sw-field-label-with-hint' }, [
                    el('span', { text: label }),
                    hint
                ]);
                var row = el('div', { class: 'sw-kv-row sw-edit-row' }, [
                    labelEl,
                    el('dd', null, [inputNode])
                ]);

                // Add validation feedback if validator provided
                if (validator && inputNode) {
                    var checkValidation = function () {
                        var err = validator();
                        if (err) {
                            errHint.textContent = err;
                            errHint.style.display = 'block';
                        } else {
                            errHint.style.display = 'none';
                        }
                    };
                    if (inputNode.addEventListener) {
                        inputNode.addEventListener('change', checkValidation);
                        inputNode.addEventListener('blur', checkValidation);
                    }
                }

                dl.appendChild(row);
                if (validator) dl.appendChild(errHint);
            }

            // id (read-only — changing id breaks references)
            var idInput = el('input', {
                type: 'text', class: 'sw-edit-input', value: obj.id || '', readonly: 'readonly',
                style: 'opacity: 0.7;'
            });
            addField('id', idInput, true, function () {
                return !obj.id ? 'objective id is required' : null;
            });

            // name (required)
            var nameInput = textInput(obj.name, function (v) {
                obj.name = v;
                markDirty();
                renderList(); // Update list display
            });
            addField('name / label', nameInput, true, function () {
                return !obj.name || obj.name.trim().length === 0 ? 'objective name is required' : null;
            });

            // owner (side — select from defined sides)
            var sideIds = (draft.sides || []).map(function (s) { return s.id; });
            if (sideIds.length === 0) sideIds = ['BLUE', 'RED', 'NEUTRAL'];
            var ownerInput = selectInput(sideIds, obj.owner || '', function (v) {
                obj.owner = v;
                markDirty();
                renderList();
            });
            addField('owner / side', ownerInput, !!draft.sides && draft.sides.length > 0, function () {
                if (!draft.sides || draft.sides.length === 0) return null;
                var knownSideIds = draft.sides.map(function (s) { return s.id; });
                return obj.owner && knownSideIds.indexOf(obj.owner) === -1 ? 'owner must be one of: ' + knownSideIds.join(', ') : null;
            });

            // type/category
            addField('type / category', textInput(obj.type, function (v) {
                obj.type = v;
                markDirty();
            }), false);

            // location: lat/lon
            if (!obj.location) obj.location = { lat: 0, lon: 0 };
            var latInput = numberInput(obj.location.lat, function (v) {
                obj.location.lat = parseFloat(v) || 0;
                markDirty();
            }, { step: '0.01' });
            addField('latitude', latInput, false, function () {
                var lat = obj.location?.lat;
                return (lat != null && !Number.isFinite(lat)) ? 'latitude must be a valid number' : null;
            });

            var lonInput = numberInput(obj.location.lon, function (v) {
                obj.location.lon = parseFloat(v) || 0;
                markDirty();
            }, { step: '0.01' });
            addField('longitude', lonInput, false, function () {
                var lon = obj.location?.lon;
                return (lon != null && !Number.isFinite(lon)) ? 'longitude must be a valid number' : null;
            });

            // difficulty_rating
            var difficultyOptions = ['VERY_HIGH', 'HIGH', 'MEDIUM_HIGH', 'MEDIUM', 'MEDIUM_LOW', 'LOW'];
            addField('difficulty / importance', selectInput(difficultyOptions, obj.difficulty_rating || '', function (v) {
                obj.difficulty_rating = v;
                markDirty();
            }), false);

            // description
            var descInput = el('textarea', { class: 'sw-edit-textarea', text: obj.description || '' });
            descInput.addEventListener('input', function () {
                obj.description = descInput.value;
                markDirty();
            });
            addField('description', descInput, false);

            // constraints (as textarea showing one per line)
            var constraintsText = Array.isArray(obj.constraints) ? obj.constraints.join('\n') : '';
            var constraintsInput = el('textarea', { class: 'sw-edit-textarea', text: constraintsText });
            constraintsInput.addEventListener('input', function () {
                obj.constraints = constraintsInput.value
                    .split('\n')
                    .map(function (s) { return s.trim(); })
                    .filter(function (s) { return s.length > 0; });
                markDirty();
            });
            addField('constraints / notes', constraintsInput, false);

            // value/importance
            addField('value / strategic importance', textInput(obj.value, function (v) {
                obj.value = v;
                markDirty();
            }), false);

            // defenses (display only, read from object structure)
            if (obj.defenses) {
                var defenseText = '';
                if (obj.defenses.sam_count != null) defenseText += 'SAM: ' + obj.defenses.sam_count + ' · ';
                if (obj.defenses.aaa_count != null) defenseText += 'AAA: ' + obj.defenses.aaa_count + ' · ';
                if (obj.defenses.defense_description) defenseText += obj.defenses.defense_description;
                if (defenseText) {
                    addField('defenses (display)', el('div', { class: 'sw-field-display', text: defenseText }), false);
                }
            }

            detailPane.appendChild(dl);
        }

        // Initial render
        renderList();
        renderDetail();

        host.appendChild(card);
    }

    // ── Helper functions (mirrors scenario-edit-mode.js) ──────────────────
    function el(tag, attrs, kids) {
        var n = document.createElement(tag);
        if (attrs) Object.keys(attrs).forEach(function (k) {
            if (k === 'text') n.textContent = attrs[k];
            else if (k === 'html') n.innerHTML = attrs[k];
            else if (k === 'style') n.setAttribute('style', attrs[k]);
            else n.setAttribute(k, attrs[k]);
        });
        (kids || []).forEach(function (c) { if (c) n.appendChild(c); });
        return n;
    }

    function textInput(value, onInput) {
        var i = el('input', { type: 'text', class: 'sw-edit-input', value: value == null ? '' : String(value) });
        i.addEventListener('input', function () { onInput(i.value); });
        return i;
    }

    function numberInput(value, onInput, opts) {
        opts = opts || {};
        var i = el('input', {
            type: 'number',
            class: 'sw-edit-input',
            step: opts.step || 'any',
            value: (value == null || value === '') ? '' : String(value)
        });
        if (opts.min != null) i.setAttribute('min', String(opts.min));
        if (opts.max != null) i.setAttribute('max', String(opts.max));
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

    // Get shared state from scenario-edit-mode.js
    function getSharedState() {
        return window._RMOOZEditModeObjectives && window._RMOOZEditModeObjectives.shared;
    }

    // Export to window
    if (typeof window !== 'undefined') {
        window.RMOOZEditModeObjectives = exports;
    }
})();
