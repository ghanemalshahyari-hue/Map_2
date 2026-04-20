(function () {
    const REQUIRED_TMG_ID = 'circle-x';

    let map = null;
    let isActive = false;
    let stage = 'idle'; // idle, drawing, placement, post-circle
    let sketchPoints = [];
    let sketchPolyline = null;
    let isSketching = false;
    let convertLineBtn = null;
    let affiliationPopup = null;
    let affiliationPopupOutsideHandler = null;
    let chosenAffiliation = 'friendly';
    let pendingAffiliation = null;
    let circleXCount = 0;
    let maxCircleX = 3;
    let placedCircleCenters = [];
    let circlePlacementPreviewLine = null;
    let circlePlacementPreviewBoundary = null;
    let circlePlacementPreviewHardLimit = null;
    let circlePlacementPreviewGhost = null;
    let circlePlacementPreviewTooltip = null;
    let selectedFlankTag = 'battalion';
    let setupComplete = false;           // true only after Start is clicked with valid selections
    let changeSetupBtn = null;
    let savedBatFront = 8;
    let savedBatDeep = 20;
    let savedBrigFront = 20;
    let savedBrigDeep = 40;
    let _initialized = false;

    // ── Default/favorite formation persistence ──
    function getDefaultFormation() {
        try { return localStorage.getItem('fd-default-formation') || null; } catch (e) { return null; }
    }
    function saveDefaultFormation(tag) {
        try {
            if (tag) localStorage.setItem('fd-default-formation', tag);
            else localStorage.removeItem('fd-default-formation');
        } catch (e) { /* storage unavailable */ }
    }

    function initFreeDrawSignatureWorkflow(options) {
        if (!options || !options.map) return;
        if (_initialized) { map = options.map; return; }
        _initialized = true;
        map = options.map;

        const btn = document.getElementById('free-draw-signature-btn');
        if (!btn) return;

        const affiliationSelect = document.getElementById('free-draw-affiliation-select');
        if (affiliationSelect) {
            affiliationSelect.style.display = 'none'; // hide static control
            window.freeDrawSignatureAffiliation = affiliationSelect.value || 'friendly';
            chosenAffiliation = window.freeDrawSignatureAffiliation;
        } else {
            window.freeDrawSignatureAffiliation = 'friendly';
            chosenAffiliation = 'friendly';
        }

        btn.addEventListener('click', () => {
            activateFreeDrawSignature();
        });

        // Chain into the global language-change hook so all Free Draw UI
        // updates instantly when the user clicks the header translate button.
        const _prevOnLangChange = window.onLanguageChange;
        window.onLanguageChange = function (lang) {
            if (typeof _prevOnLangChange === 'function') _prevOnLangChange(lang);
            applyFdTranslations();
        };

        // Cancel free draw workflow when user clicks any other header tool or changes tool-mode
        var headerBtnIds = ['text-tool-t-btn', 'freehand-f-btn', 'select-area-header-btn', 'eraser-e-btn', 'pan-inspect-m-btn'];
        headerBtnIds.forEach(function(id) {
            var el = document.getElementById(id);
            if (el) el.addEventListener('click', function() { cancelFreeDrawWorkflow(); });
        });
        var toolModeEl = document.getElementById('tool-mode');
        if (toolModeEl) {
            toolModeEl.addEventListener('change', function() { cancelFreeDrawWorkflow(); });
        }

        // Global dismiss: clicking anywhere outside the flank panel / affiliation popup
        // hides the battalion/brigade flank panel when the workflow is idle.
        document.addEventListener('click', function (e) {
            var target = e.target;
            // Always ignore clicks inside the flank panel first (even if stage strings desync).
            var flankPanel = document.getElementById('auto-flank-controls');
            if (flankPanel && flankPanel.contains(target)) return;
            if (stage !== 'idle') return;
            // Don't dismiss if clicking inside the affiliation popup
            var affPopup = document.getElementById('free-draw-affiliation-popup');
            if (affPopup && affPopup.contains(target)) return;
            // Don't dismiss if clicking the free-draw button (it starts the workflow)
            if (target.closest && target.closest('#free-draw-signature-btn')) return;

            hideAutoFlankControls();
        }, true);

        map.on('click', (e) => {
            // ── Guard: block map drawing if Step 1 setup is incomplete ──
            // setupComplete is false until the user clicks Start with valid
            // Formation + Affiliation.  The outside-click handler may close
            // the popup before this handler fires, so we cannot rely on
            // affiliationPopup alone — setupComplete is the source of truth.
            if (stage === 'placement' && isActive && !setupComplete && e.latlng) {
                const popup = document.getElementById('free-draw-affiliation-popup');
                // Case 1: no Formation → block draw, centered warning + flash Box 2 red
                if (!selectedFlankTag) {
                    showCenterWarning(fdT('need-formation'));
                    const section = popup?.querySelector('#fd-formations-section');
                    if (section) triggerBreathing(section, 'red');
                    return;
                }
                // Case 2: Formation set, no Affiliation → centered warning + flash Box 1 red
                if (!pendingAffiliation) {
                    showCenterWarning(fdT('need-affiliation'));
                    const friendBtn = document.getElementById('fd-aff-friend');
                    const enemyBtn = document.getElementById('fd-aff-enemy');
                    if (friendBtn) triggerBreathing(friendBtn, 'red');
                    if (enemyBtn) triggerBreathing(enemyBtn, 'red');
                    return;
                }
                // Case 3: Formation + Affiliation set, but Start not clicked
                showCenterWarning(fdT('need-start'));
                const startBtn = document.getElementById('fd-aff-start');
                if (startBtn) triggerBreathing(startBtn, 'red');
                return;
            }

            if (stage === 'placement' && isActive && e.latlng) {
                if (e.originalEvent) {
                    e.originalEvent.preventDefault();
                    e.originalEvent.stopPropagation();
                    e.originalEvent.stopImmediatePropagation?.();
                    if (typeof L !== 'undefined' && L.DomEvent) {
                        L.DomEvent.preventDefault(e.originalEvent);
                        L.DomEvent.stopPropagation(e.originalEvent);
                        if (typeof L.DomEvent.stopImmediatePropagation === 'function') {
                            L.DomEvent.stopImmediatePropagation(e.originalEvent);
                        }
                    }
                }
                window.freeDrawSignatureRecentClick = true;
                placeSymbolAt(e.latlng);
            }
        });

        map.on('mousemove', (e) => {
            if (stage === 'placement' && isActive && e.latlng) {
                updateCirclePlacementPreview(e.latlng);
            }
        });

        map.on('dblclick', (e) => {
            if (stage === 'placement' && isActive) {
                e.originalEvent.preventDefault();
                e.originalEvent.stopPropagation();
                finishFreeDrawSignature();
            }
        });

        // low-level freehand sketch drag
        const mapContainer = map.getContainer();

        mapContainer.addEventListener('mousedown', (e) => {
            if (!isActive || stage !== 'drawing') return;
            if (e.button !== 0) return;
            if (isPointInUI(e.target)) return;

            const latlng = map.mouseEventToLatLng(e);
            if (!latlng) return;

            // Disable map drag while sketching so screen stays fixed during draw.
            if (map.dragging && map.dragging.enabled) map.dragging.disable();

            isSketching = true;
            sketchPoints = [latlng];
            sketchPolyline = L.polyline(sketchPoints, { color: '#22c55e', weight: 4, dashArray: '6,4', interactive: false, pane: 'placementPreviewPane' }).addTo(map);
            updateInstruction('Keep drawing circle X obstacle by hand until complete, then release mouse.');
            e.preventDefault();
            e.stopPropagation();
        });

        mapContainer.addEventListener('mousemove', (e) => {
            if (!isActive || !isSketching || stage !== 'drawing') return;
            const latlng = map.mouseEventToLatLng(e);
            if (!latlng) return;
            const last = sketchPoints[sketchPoints.length - 1];
            if (last && last.equals(latlng)) return;
            sketchPoints.push(latlng);
            if (sketchPolyline) sketchPolyline.setLatLngs(sketchPoints);
        });

        mapContainer.addEventListener('mouseup', (e) => {
            if (!isActive || stage !== 'drawing') return;
            if (!isSketching) return;
            isSketching = false;
            // Re-enable map dragging when sketch is done, regardless of success.
            if (map.dragging && map.dragging.disabled) map.dragging.enable();
            if (sketchPoints.length < 20) {
                updateInstruction('Too brief. Draw the circle X obstacle again with a clear round shape and cross.');
                cleanupSketch(false);
                return;
            }

            if (!recognizeCircleX(sketchPoints)) {
                updateInstruction('Could not recognize shape as circle X obstacle. Please draw again.');
                cleanupSketch(false);
                return;
            }

            stage = 'placement';
            window.freeDrawSignatureStage = stage;
            updateInstruction('Shape recognized as circle X obstacle. Now click on map to place the symbol. Double-click to finish.');
            // Keep sketch polyline as modest feedback for user; remove after finish.
        });
    }

    function isPointInUI(target) {
        return target.closest?.('.sidebar') || target.closest?.('.top-bar') || target.closest?.('.modal') || target.closest?.('.leaflet-control');
    }

    function updateInstruction(text) {
        const instructionText = document.getElementById('instruction-text');
        if (instructionText) instructionText.textContent = text;
    }

    function setStepMessage(steps) {
        // not used now; keep for compatibility
        return;
    }

    function setCriticalMessage(text) {
        const msg = text || '';
        let el = document.getElementById('free-draw-critical');
        if (!el) {
            el = document.createElement('p');
            el.id = 'free-draw-critical';
            el.setAttribute('aria-live', 'polite');
            el.style.cssText = 'margin-top:8px;font-size:0.78rem;line-height:1.35;color:#fbbf24;min-height:1.2em;';
            const anchor = document.getElementById('free-draw-signature-btn');
            if (anchor && anchor.parentNode) {
                anchor.parentNode.appendChild(el);
            } else {
                document.body.appendChild(el);
            }
        }
        el.textContent = msg;
    }
    /** Exposed for app.js auto-flank (same DOM slot as free-draw status). */
    window.setCriticalMessage = setCriticalMessage;

    // ── Validation toast (small corner toast) ──────────────────────────────
    var _toastTimer = null;
    function showValidationToast(message, icon) {
        let toast = document.getElementById('fd-validation-toast');
        if (toast) { clearTimeout(_toastTimer); toast.remove(); }
        toast = document.createElement('div');
        toast.id = 'fd-validation-toast';
        toast.dir = isArabic() ? 'rtl' : 'ltr';
        toast.innerHTML = (icon ? '<span class="fd-toast-icon">' + icon + '</span>' : '') + message;
        document.body.appendChild(toast);
        _toastTimer = setTimeout(() => {
            toast.classList.add('fd-toast-exit');
            setTimeout(() => toast.remove(), 300);
        }, 2500);
    }

    // ── Large centered screen warning ────────────────────────────────────
    // Shown when the user clicks the map before completing Step 1 setup.
    var _centerMsgTimer = null;
    function showCenterWarning(message) {
        let el = document.getElementById('fd-center-warning');
        if (el) { clearTimeout(_centerMsgTimer); el.remove(); }
        el = document.createElement('div');
        el.id = 'fd-center-warning';
        el.dir = isArabic() ? 'rtl' : 'ltr';
        el.style.cssText =
            'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:20000;' +
            'background:rgba(15,23,42,0.95);color:#fbbf24;padding:22px 40px;border-radius:14px;' +
            'font-size:1.25rem;font-weight:700;text-align:center;pointer-events:none;' +
            'box-shadow:0 8px 32px rgba(0,0,0,0.5),0 0 0 2px rgba(251,191,36,0.4);' +
            'border:2px solid rgba(251,191,36,0.6);' +
            'font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;' +
            'animation:fd-center-warn-in 0.25s ease;';
        el.textContent = message;
        document.body.appendChild(el);
        // Inject keyframes once (center warning + breathing flicker for formation/affiliation)
        if (!document.getElementById('fd-center-warn-style')) {
            const style = document.createElement('style');
            style.id = 'fd-center-warn-style';
            style.textContent =
                '@keyframes fd-center-warn-in{0%{opacity:0;transform:translate(-50%,-50%) scale(0.85)}100%{opacity:1;transform:translate(-50%,-50%) scale(1)}}' +
                '@keyframes fd-center-warn-out{0%{opacity:1;transform:translate(-50%,-50%) scale(1)}100%{opacity:0;transform:translate(-50%,-50%) scale(0.9)}}' +
                // Flickering red glow border — guides the user to the required section
                '@keyframes fd-flicker-red{' +
                    '0%{box-shadow:0 0 6px 2px rgba(239,68,68,0.8);border-color:#ef4444}' +
                    '50%{box-shadow:0 0 18px 6px rgba(239,68,68,0.3);border-color:rgba(239,68,68,0.3)}' +
                    '100%{box-shadow:0 0 6px 2px rgba(239,68,68,0.8);border-color:#ef4444}}' +
                '.fd-breathing-red{border:2px solid #ef4444!important;border-radius:10px;animation:fd-flicker-red 0.5s ease infinite!important}' +
                // Flickering amber glow border
                '@keyframes fd-flicker-amber{' +
                    '0%{box-shadow:0 0 6px 2px rgba(245,158,11,0.8);border-color:#f59e0b}' +
                    '50%{box-shadow:0 0 18px 6px rgba(245,158,11,0.3);border-color:rgba(245,158,11,0.3)}' +
                    '100%{box-shadow:0 0 6px 2px rgba(245,158,11,0.8);border-color:#f59e0b}}' +
                '.fd-breathing-amber{border:2px solid #f59e0b!important;border-radius:10px;animation:fd-flicker-amber 0.5s ease infinite!important}';
            document.head.appendChild(style);
        }
        _centerMsgTimer = setTimeout(() => {
            el.style.animation = 'fd-center-warn-out 0.3s ease forwards';
            setTimeout(() => el.remove(), 300);
        }, 2000);
    }

    function triggerBreathing(element, color) {
        if (!element) return;
        const cls = color === 'amber' ? 'fd-breathing-amber' : 'fd-breathing-red';
        element.classList.remove('fd-breathing-red', 'fd-breathing-amber');
        // Force reflow so animation restarts
        void element.offsetWidth;
        element.classList.add(cls);
        setTimeout(() => element.classList.remove(cls), 3000);
    }

    // ── Formation → Affiliation dependency ──────────────────────────────
    // Box 1 (Affiliation: Friendly / Enemy / Start) stays disabled until
    // a Formation is chosen in Box 2.  Drawing on the map is blocked until
    // both Formation AND Affiliation are set.
    //
    // State tracked by:  selectedFlankTag  (Formation)
    //                    pendingAffiliation (Affiliation)

    /** IDs of the elements inside Box 1 that must be disabled. */
    const AFF_BUTTON_IDS = ['fd-aff-friend', 'fd-aff-enemy', 'fd-aff-start'];

    /**
     * Disable Box 1 (Affiliation section).
     * Grays out Friendly, Enemy, Start buttons and the circles dropdown.
     * pointer-events is NOT removed — clicks are blocked in logic instead.
     */
    function disableAffiliationSection() {
        AFF_BUTTON_IDS.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.style.opacity = '0.35';
            el.style.filter  = 'grayscale(0.7)';
            el.style.cursor  = 'not-allowed';
            el.dataset.fdDisabled = 'true';       // logical flag
        });
        const countSel = document.getElementById('fd-circle-count');
        if (countSel) {
            countSel.disabled = true;
            countSel.style.opacity = '0.35';
        }
        // Gray out the "Choose affiliation" label
        const popup = document.getElementById('free-draw-affiliation-popup');
        if (popup) {
            const label = popup.querySelector('[data-fd-i18n="choose-aff"]');
            if (label) label.style.opacity = '0.35';
        }
    }

    /**
     * Enable Box 1 (Affiliation section).
     * Restores full interactivity after a Formation has been selected.
     */
    function enableAffiliationSection() {
        AFF_BUTTON_IDS.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.style.opacity = '';
            el.style.filter  = '';
            el.style.cursor  = 'pointer';
            delete el.dataset.fdDisabled;
        });
        const countSel = document.getElementById('fd-circle-count');
        if (countSel) {
            countSel.disabled = false;
            countSel.style.opacity = '';
        }
        const popup = document.getElementById('free-draw-affiliation-popup');
        if (popup) {
            const label = popup.querySelector('[data-fd-i18n="choose-aff"]');
            if (label) label.style.opacity = '';
        }
    }

    /**
     * Sync Box 1 enabled/disabled state based on whether a Formation is set.
     * Called whenever the formation selection changes.
     */
    function syncAffiliationEnabled() {
        if (selectedFlankTag) {
            enableAffiliationSection();
        } else {
            disableAffiliationSection();
        }
    }

    // ── End Formation → Affiliation dependency helpers ──────────────────

    function isArabic() {
        return typeof window.getCurrentLang === 'function' && window.getCurrentLang() === 'ar';
    }

    const FD_I18N = {
        en: {
            'battalion': 'Battalion', 'brigade': 'Brigade',
            'front-org': 'Front Org:', 'deep-org': 'Deep Org:\u00a0',
            'km': 'km', 'draw': 'Draw', 'both': 'Both',
            'select': 'Select', 'selected': '\u2714 Selected',
            'choose-aff': 'Choose affiliation', 'friendly': 'Friendly', 'enemy': 'Enemy',
            'circles-to-place': 'Circles to place', 'close': 'Close',
            'change-setup': '\u2190 Change Setup',
            'convert-line': 'Convert line to frontline',
            'start-over': '\u21ba Start Over',
            'start-btn': 'Start \u2192',
            'need-formation': 'Select a formation first',
            'need-affiliation': 'Choose an affiliation first',
            'need-start': 'You didn\'t click on Start',
            'set-default': 'Set as default',
            'is-default': 'Default formation',
            'remove-default': 'Remove default',
            'add-formation-title': 'Add Formation',
            'eng-name': 'English Name:',
            'ar-name': 'Arabic Name:',
            'cancel': 'Cancel',
            'add': 'Add',
            'enter-both-names': 'Please enter both English and Arabic names.',
            'add-formation-btn': '+ Add Formation',
        },
        ar: {
            'battalion': '\u0643\u062a\u064a\u0628\u0629', 'brigade': '\u0644\u0648\u0627\u0621',
            'front-org': '\u062a\u0646\u0638\u064a\u0645 \u0623\u0645\u0627\u0645\u064a:', 'deep-org': '\u062a\u0646\u0638\u064a\u0645 \u0639\u0645\u0642:\u00a0',
            'km': '\u0643\u0645', 'draw': '\u0631\u0633\u0645', 'both': '\u0643\u0644\u0627\u0647\u0645\u0627',
            'select': '\u0627\u062e\u062a\u0631', 'selected': '\u2714 \u0645\u062d\u062f\u062f',
            'choose-aff': '\u0627\u062e\u062a\u0631 \u0627\u0644\u0627\u0646\u062a\u0645\u0627\u0621',
            'friendly': '\u0635\u062f\u064a\u0642', 'enemy': '\u0639\u062f\u0648',
            'circles-to-place': 'عدد نقاط التنسيق',
            'close': '\u0625\u063a\u0644\u0627\u0642',
            'change-setup': '\u2190 \u062a\u063a\u064a\u064a\u0631 \u0627\u0644\u0625\u0639\u062f\u0627\u062f',
            'convert-line': '\u062a\u062d\u0648\u064a\u0644 \u0627\u0644\u062e\u0637 \u0625\u0644\u0649 \u062e\u0637 \u062a\u0645\u0627\u0633',
            'start-over': '\u21ba \u0625\u0639\u0627\u062f\u0629 \u0627\u0644\u0628\u062f\u0621',
            'start-btn': '\u2190 \u0627\u0628\u062f\u0623',
            'need-formation': '\u0627\u062e\u062a\u0631 \u062a\u0634\u0643\u064a\u0644\u0627\u064b \u0623\u0648\u0644\u0627\u064b',
            'need-affiliation': '\u0627\u062e\u062a\u0631 \u0627\u0644\u0627\u0646\u062a\u0645\u0627\u0621 \u0623\u0648\u0644\u0627\u064b',
            'need-start': '\u0644\u0645 \u062a\u0636\u063a\u0637 \u0639\u0644\u0649 \u0627\u0628\u062f\u0623',
            'set-default': '\u062a\u0639\u064a\u064a\u0646 \u0643\u0627\u0641\u062a\u0631\u0627\u0636\u064a',
            'is-default': '\u0627\u0644\u062a\u0634\u0643\u064a\u0644 \u0627\u0644\u0627\u0641\u062a\u0631\u0627\u0636\u064a',
            'remove-default': '\u0625\u0632\u0627\u0644\u0629 \u0627\u0644\u0627\u0641\u062a\u0631\u0627\u0636\u064a',
            'add-formation-title': '\u0625\u0636\u0627\u0641\u0629 \u062a\u0634\u0643\u064a\u0644',
            'eng-name': '\u0627\u0644\u0627\u0633\u0645 \u0628\u0627\u0644\u0625\u0646\u062c\u0644\u064a\u0632\u064a\u0629:',
            'ar-name': '\u0627\u0644\u0627\u0633\u0645 \u0628\u0627\u0644\u0639\u0631\u0628\u064a\u0629:',
            'cancel': '\u0625\u0644\u063a\u0627\u0621',
            'add': '\u0625\u0636\u0627\u0641\u0629',
            'enter-both-names': '\u064a\u0631\u062c\u0649 \u0625\u062f\u062e\u0627\u0644 \u0627\u0644\u0627\u0633\u0645\u064a\u0646 \u0628\u0627\u0644\u0625\u0646\u062c\u0644\u064a\u0632\u064a\u0629 \u0648\u0627\u0644\u0639\u0631\u0628\u064a\u0629.',
            'add-formation-btn': '+ \u0625\u0636\u0627\u0641\u0629 \u062a\u0634\u0643\u064a\u0644',
        }
    };

    function fdT(key) {
        const lang = isArabic() ? 'ar' : 'en';
        return (FD_I18N[lang] && FD_I18N[lang][key] !== undefined) ? FD_I18N[lang][key] : (FD_I18N.en[key] || key);
    }

    function applyFdTranslations() {
        document.querySelectorAll('[data-fd-i18n]').forEach(el => {
            el.textContent = fdT(el.getAttribute('data-fd-i18n'));
        });
        const setupBtn = document.getElementById('fd-change-setup-btn');
        if (setupBtn) setupBtn.textContent = fdT('change-setup');
        const convertBtn = document.getElementById('free-draw-convert-line-btn');
        if (convertBtn) convertBtn.textContent = fdT('convert-line');
        const startOverBtn = document.getElementById('fd-start-over-btn');
        if (startOverBtn) startOverBtn.textContent = fdT('start-over');
        const panel = document.getElementById('auto-flank-controls');
        if (panel) panel.dir = isArabic() ? 'rtl' : 'ltr';
        const popup = document.getElementById('free-draw-affiliation-popup');
        if (popup) popup.dir = isArabic() ? 'rtl' : 'ltr';
        setSelectedFlankTag(selectedFlankTag);
        refreshAffButtonHighlight();
    }

    function refreshAffButtonHighlight() {
        if (!affiliationPopup) return;
        const fBtn = affiliationPopup.querySelector('#fd-aff-friend');
        const eBtn = affiliationPopup.querySelector('#fd-aff-enemy');
        const sBtn = affiliationPopup.querySelector('#fd-aff-start');
        const aff = pendingAffiliation;
        if (fBtn) {
            const sel = aff === 'friendly';
            fBtn.style.background  = sel ? '#2563eb' : '#1e3a5f';
            fBtn.style.border      = sel ? '2px solid #93c5fd' : '1px solid #475569';
            fBtn.style.boxShadow   = sel ? '0 0 0 3px rgba(59,130,246,0.3)' : 'none';
            fBtn.style.color       = '#ffffff';
            fBtn.textContent       = (sel ? '\u2714 ' : '') + fdT('friendly');
            // Clear breathing animation when user selects
            if (sel) fBtn.classList.remove('fd-breathing-red', 'fd-breathing-amber');
        }
        if (eBtn) {
            const sel = aff === 'enemy';
            eBtn.style.background  = sel ? '#dc2626' : '#3d1515';
            eBtn.style.border      = sel ? '2px solid #fca5a5' : '1px solid #475569';
            eBtn.style.boxShadow   = sel ? '0 0 0 3px rgba(239,68,68,0.3)' : 'none';
            eBtn.style.color       = '#ffffff';
            eBtn.textContent       = (sel ? '\u2714 ' : '') + fdT('enemy');
            if (sel) eBtn.classList.remove('fd-breathing-red', 'fd-breathing-amber');
        }
        if (sBtn) {
            // Start is disabled when Formation is not selected (affiliation section locked).
            // When Formation IS selected but Affiliation is not, Start remains clickable
            // so its click handler can show the proper validation message.
            const ready = !!aff && !!selectedFlankTag;
            const formationMissing = !selectedFlankTag;
            sBtn.disabled          = formationMissing;
            sBtn.style.cursor      = formationMissing ? 'not-allowed' : 'pointer';
            sBtn.style.opacity     = ready ? '1' : (formationMissing ? '0.35' : '0.65');
            sBtn.style.filter      = formationMissing ? 'grayscale(0.7)' : '';
            sBtn.style.background  = ready ? '#16a34a' : '#374151';
            sBtn.style.border      = ready ? '1px solid #4ade80' : '1px solid #475569';
            sBtn.style.color       = ready ? '#ffffff' : '#d1d5db';
            sBtn.style.boxShadow   = ready ? '0 0 8px rgba(22,163,74,0.4)' : 'none';
        }
    }

    function getSelectedFrontOrgDistance() {
        const frontId = selectedFlankTag === 'brigade' ? 'fd-brig-front' : 'fd-bat-front';
        const input = document.getElementById(frontId);
        const value = input ? parseFloat(input.value) : NaN;
        // Fall back to the values saved when the user confirmed the setup popup
        return isFinite(value) && value > 0 ? value : (selectedFlankTag === 'brigade' ? savedBrigFront : savedBatFront);
    }

    function getCirclePlacementReference() {
        if (placedCircleCenters.length === 0) return null;
        if (placedCircleCenters.length === 1) {
            return {
                center: placedCircleCenters[0],
                maxDistance: getSelectedFrontOrgDistance() * 1000,
                label: 'Front Org distance'
            };
        }
        if (placedCircleCenters.length === 2 && maxCircleX === 3) {
            const a = placedCircleCenters[0];
            const b = placedCircleCenters[1];
            const mid = L.latLng((a.lat + b.lat) / 2, (a.lng + b.lng) / 2);
            return {
                center: mid,
                maxDistance: (getSelectedFrontOrgDistance() * 1000) / 2,
                label: 'Half Front Org distance'
            };
        }
        return null;
    }

    function getConstrainedCirclePlacement(latlng) {
        const constraint = getCirclePlacementReference();
        if (!constraint || !map || !latlng) return latlng;
        const distance = map.distance(constraint.center, latlng);
        const hardLimit = constraint.maxDistance * 1.2;
        if (distance <= hardLimit) return latlng;  // within warning zone — allow as-is

        const centerPoint = map.latLngToLayerPoint(constraint.center);
        const cursorPoint = map.latLngToLayerPoint(latlng);
        const dx = cursorPoint.x - centerPoint.x;
        const dy = cursorPoint.y - centerPoint.y;
        const scale = hardLimit / distance;
        return map.layerPointToLatLng(L.point(
            centerPoint.x + dx * scale,
            centerPoint.y + dy * scale
        ));
    }

    function clearCirclePlacementPreview() {
        if (circlePlacementPreviewBoundary) {
            map.removeLayer(circlePlacementPreviewBoundary);
            circlePlacementPreviewBoundary = null;
        }
        if (circlePlacementPreviewHardLimit) {
            map.removeLayer(circlePlacementPreviewHardLimit);
            circlePlacementPreviewHardLimit = null;
        }
        if (circlePlacementPreviewLine) {
            map.removeLayer(circlePlacementPreviewLine);
            circlePlacementPreviewLine = null;
        }
        if (circlePlacementPreviewGhost) {
            map.removeLayer(circlePlacementPreviewGhost);
            circlePlacementPreviewGhost = null;
        }
        if (circlePlacementPreviewTooltip) {
            circlePlacementPreviewTooltip.remove();
            circlePlacementPreviewTooltip = null;
        }
    }

    function createPlacementBoundary(constraint) {
        if (!constraint || !map) return;
        circlePlacementPreviewBoundary = L.circle(constraint.center, {
            radius: constraint.maxDistance,
            color: '#60a5fa',
            weight: 2,
            fill: true,
            fillColor: '#60a5fa',
            fillOpacity: 0.06,
            opacity: 0.55,
            interactive: false,
            pane: 'placementPreviewPane'
        }).addTo(map);
    }

    function formatPlacementLabel(distance, maxDistance, exceed) {
        const dkm = (distance / 1000).toFixed(1);
        const maxKm = (maxDistance / 1000).toFixed(0);
        if (exceed) {
            return `\u26a0 ${dkm} km (limit ${maxKm} km)`;
        }
        return `${dkm} km / ${maxKm} km`;
    }

    function updateCirclePlacementPreview(latlng) {
        clearCirclePlacementPreview();
        const constraint = getCirclePlacementReference();
        if (!constraint || !map || !latlng) return;

        const hardLimit = constraint.maxDistance * 1.2;
        const distance = map.distance(constraint.center, latlng);
        const inWarning = distance > constraint.maxDistance && distance <= hardLimit;
        const beyondHard = distance > hardLimit;

        // Clamp display point to hard boundary
        let displayPoint = latlng;
        if (beyondHard) {
            const centerPoint = map.latLngToLayerPoint(constraint.center);
            const cursorPoint = map.latLngToLayerPoint(latlng);
            const dx = cursorPoint.x - centerPoint.x;
            const dy = cursorPoint.y - centerPoint.y;
            const scale = hardLimit / distance;
            displayPoint = map.layerPointToLatLng(L.point(
                centerPoint.x + dx * scale,
                centerPoint.y + dy * scale
            ));
        }

        // Green solid ring = recommended max
        circlePlacementPreviewBoundary = L.circle(constraint.center, {
            radius: constraint.maxDistance,
            color: '#22c55e',
            weight: 2,
            fill: true,
            fillColor: '#22c55e',
            fillOpacity: 0.05,
            opacity: 0.55,
            interactive: false,
            pane: 'placementPreviewPane'
        }).addTo(map);

        // Red dashed outer ring = hard limit (120%)
        circlePlacementPreviewHardLimit = L.circle(constraint.center, {
            radius: hardLimit,
            color: '#ef4444',
            weight: 1.5,
            dashArray: '6,5',
            fill: false,
            opacity: 0.45,
            interactive: false,
            pane: 'placementPreviewPane'
        }).addTo(map);

        const color = (inWarning || beyondHard) ? '#ef4444' : '#22c55e';
        const exceed = inWarning || beyondHard;
        circlePlacementPreviewLine = L.polyline([constraint.center, displayPoint], {
            color,
            weight: 3,
            opacity: 0.6,
            lineCap: 'round',
            interactive: false,
            pane: 'placementPreviewPane'
        }).addTo(map);

        circlePlacementPreviewGhost = L.circle(displayPoint, {
            radius: 120,
            color,
            weight: 2,
            fill: true,
            fillColor: color,
            fillOpacity: 0.16,
            opacity: 0.8,
            interactive: false,
            pane: 'placementPreviewPane'
        }).addTo(map);

        const label = formatPlacementLabel(Math.min(distance, hardLimit), constraint.maxDistance, exceed);
        const midPoint = L.latLng(
            (constraint.center.lat + displayPoint.lat) / 2,
            (constraint.center.lng + displayPoint.lng) / 2
        );
        circlePlacementPreviewTooltip = L.marker(midPoint, {
            icon: L.divIcon({
                className: 'free-draw-preview-tooltip',
                html: `<div style="position:relative;width:0;overflow:visible;"><div style="position:absolute;left:50%;transform:translateX(-50%);bottom:6px;padding:6px 18px;border-radius:7px;background:rgba(10,14,26,0.88);color:${color};font-size:0.95rem;font-weight:700;white-space:nowrap;box-shadow:0 2px 10px rgba(0,0,0,0.55);border:1px solid ${color};pointer-events:none;">${label}</div></div>`,
                iconSize: [0, 0],
                iconAnchor: [0, 0]
            }),
            interactive: false,
            pane: 'markerPane'
        }).addTo(map);
    }

    function recognizeCircleX(points) {
        if (!points || points.length < 20) return false;

        // Very simple heuristic: closed-ish shape + cross-like spread.
        const center = points.reduce((acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng, n: acc.n + 1 }), { lat: 0, lng: 0, n: 0 });
        if (center.n === 0) return false;
        const cx = center.lat / center.n;
        const cy = center.lng / center.n;

        let quad = new Set();
        points.forEach(p => {
            const dx = p.lat - cx;
            const dy = p.lng - cy;
            if (Math.abs(dx) < 1e-6 || Math.abs(dy) < 1e-6) return;
            if (dx > 0 && dy > 0) quad.add('q1');
            if (dx > 0 && dy < 0) quad.add('q2');
            if (dx < 0 && dy > 0) quad.add('q3');
            if (dx < 0 && dy < 0) quad.add('q4');
        });

        if (quad.size < 3) return false;

        const first = points[0];
        const last = points[points.length - 1];
        const closedDist = map.distance(first, last);
        const diagStretch = map.distance(L.latLng(cx, cy), points[Math.floor(points.length / 2)]);
        if (closedDist > diagStretch * 0.5) return false;

        return true;
    }

    function cleanupSketch(removePolyline = true) {
        if (removePolyline && sketchPolyline) {
            map.removeLayer(sketchPolyline);
            sketchPolyline = null;
        }
        sketchPoints = [];
        isSketching = false;
    }

    function placeSymbolAt(latlng) {
        if (!isActive || stage !== 'placement') return;
        if (!latlng || !map) return;

        let activeLayer = window.getActiveLayer?.();
        if (!activeLayer && typeof window.createLayer === 'function') {
            // ensure there is always a layer for placement (fallback behavior)
            window.createLayer('Free Draw Layer');
            activeLayer = window.getActiveLayer?.();
        }
        if (!activeLayer) {
            updateInstruction('No active layer selected. Please choose a layer before placing symbols.');
            setStepMessage(['Select or create an active layer first.']);
            return;
        }

        if (typeof window.placeFreeDrawSignatureTmg !== 'function') return;
        const constraint = getCirclePlacementReference();
        let placementLatLng = latlng;
        if (constraint) {
            const distance = map.distance(constraint.center, latlng);
            const hardLimit = constraint.maxDistance * 1.2;
            if (distance > hardLimit) {
                placementLatLng = getConstrainedCirclePlacement(latlng);
                setCriticalMessage('Placed at hard boundary (120% of Front Org).');
            } else if (distance > constraint.maxDistance) {
                // warning zone — allow but notify
                setCriticalMessage('\u26a0 Placed outside recommended range (within 120% of Front Org).');
            }
        }

        console.log('[FreeDraw] placing symbol at', placementLatLng, 'affiliation', chosenAffiliation);
        window.placeFreeDrawSignatureTmg(placementLatLng, REQUIRED_TMG_ID, chosenAffiliation);
        placedCircleCenters.push(placementLatLng);

        circleXCount += 1;
        if (circleXCount >= maxCircleX) {
            // Use the same shared function for activating scalloped drawing
            activateScallopedDrawingMode();
            clearCirclePlacementPreview();
            return;
        }

        if (placedCircleCenters.length === 1) {
            const constraint = getCirclePlacementReference();
            if (constraint) {
                updateInstruction(`Place the next circle within ${Math.round(constraint.maxDistance)} meters of the first circle.`);
            }
        } else if (placedCircleCenters.length === 2 && maxCircleX === 3) {
            const constraint = getCirclePlacementReference();
            if (constraint) {
                updateInstruction(`Place the middle circle within ${Math.round(constraint.maxDistance)} meters of the midpoint.`);
            }
        }

        setCriticalMessage(`Circle X placed (${circleXCount}/${maxCircleX}). Place one more.`);
    }

    function createConvertLineButton() {
        if (convertLineBtn) return;

        convertLineBtn = document.createElement('button');
        convertLineBtn.id = 'free-draw-convert-line-btn';
        convertLineBtn.textContent = fdT('convert-line');
        convertLineBtn.title = 'Convert drawn line to TMG scalloped (front line border)';
        convertLineBtn.style.cssText = 'position:fixed;left:50%;bottom:90px;transform:translateX(-50%);z-index:9999;padding:8px 14px;border-radius:8px;border:none;background:#1d4ed8;color:white;font-size:0.9rem;cursor:pointer;box-shadow:0 4px 8px rgba(0,0,0,0.35);';
        function findPlainLinePolylines() {
            const lines = [];
            const tryAdd = (el) => {
                if (el instanceof L.Polyline && !el._geoType && !el._tmgData) {
                    lines.push(el);
                }
            };
            if (typeof window.getActiveLayer === 'function') {
                const activeLayer = window.getActiveLayer();
                if (activeLayer?.elements) activeLayer.elements.forEach(tryAdd);
            }
            if (lines.length === 0 && typeof window.getAllLayerElements === 'function') {
                window.getAllLayerElements().forEach(tryAdd);
            }
            return lines;
        }

        convertLineBtn.addEventListener('click', async () => {
            const plannedLine = (typeof window.getCurrentDrawLinePolyline === 'function')
                ? window.getCurrentDrawLinePolyline()
                : null;
            const lines = findPlainLinePolylines();
            if (plannedLine && !lines.includes(plannedLine) && plannedLine instanceof L.Polyline && !plannedLine._geoType && !plannedLine._tmgData) {
                lines.unshift(plannedLine);
            }

            if (!lines.length) {
                setCriticalMessage('No line found. Draw a line first in Line mode, then click this button.');
                return;
            }
            if (typeof window.ensureObstaclePolygonsLoaded === 'function') {
                try {
                    await window.ensureObstaclePolygonsLoaded();
                } catch (e) {
                    console.error('ensureObstaclePolygonsLoaded failed before frontline convert', e);
                }
            }
            if (typeof window.convertPlainLineToTmgScalloped === 'function') {
                let converted = 0;
                // Only convert obstacle-adjusted baseline polylines
                lines.forEach((line) => {
                    if (line._autoFlankLine && line._tmgData && line._tmgData.typeId === 'auto-flank-baseline') {
                        window.convertPlainLineToTmgScalloped(line);
                        converted += 1;
                    }
                });
                setCriticalMessage(`${converted} frontline${converted === 1 ? '' : 's'} converted to scalloped border. Now select flank distance.`);
                if (convertLineBtn) {
                    convertLineBtn.remove();
                    convertLineBtn = null;
                }
                showAutoFlankControls();
            } else {
                setCriticalMessage('Conversion function not available yet. Ensure app.js is updated.');
            }
        });
        document.body.appendChild(convertLineBtn);
    }

    function callFlank(mode, tag) {
        if (typeof window.autoDrawCircleXFlankLines !== 'function') {
            setCriticalMessage('Auto-flank draw is not ready yet. Reload the page if this persists.');
            return;
        }
        const dist1 = parseFloat(document.getElementById('fd-bat-front')?.value) || savedBatFront;
        const dist2 = parseFloat(document.getElementById('fd-bat-deep')?.value) || savedBatDeep;
        const dist3 = parseFloat(document.getElementById('fd-brig-front')?.value) || savedBrigFront;
        const dist4 = parseFloat(document.getElementById('fd-brig-deep')?.value) || savedBrigDeep;
        // Clear the other tag's lines so they don't overlap
        const otherTag = tag === 'battalion' ? 'brigade' : 'battalion';
        if (typeof window.clearAutoFlankLinesByTag === 'function') {
            window.clearAutoFlankLinesByTag(otherTag);
        }
        const opts = tag === 'battalion'
            ? { mode, tag: 'battalion', dist1, dist2 }
            : { mode, tag: 'brigade', dist1: dist3, dist2: dist4 };
        const p = window.autoDrawCircleXFlankLines(opts);
        if (p && typeof p.then === 'function') {
            p.catch((err) => {
                console.error('autoDrawCircleXFlankLines', err);
                setCriticalMessage('Auto-flank failed: ' + (err && err.message ? err.message : String(err)));
            });
        }
    }

    /**
     * Flank Draw / Both: wire on the floating panel only. Uses capture-phase pointerdown + click
     * (debounced) so a gesture still runs if another layer eats one of the events.
     */
    function wireAutoFlankDrawButtons() {
        const panel = document.getElementById('auto-flank-controls');
        if (!panel) return;
        const pairs = [
            ['fd-bat-front-draw', '8', 'battalion'],
            ['fd-bat-deep-draw', '20', 'battalion'],
            ['fd-bat-both', '8&20', 'battalion'],
            ['fd-brig-front-draw', '8', 'brigade'],
            ['fd-brig-deep-draw', '20', 'brigade'],
            ['fd-brig-both', '8&20', 'brigade']
        ];
        pairs.forEach(([id, mode, tag]) => {
            const btn = panel.querySelector('#' + id);
            if (!btn) return;
            const prev = btn._fdFlankWire;
            if (prev) {
                btn.removeEventListener('pointerdown', prev.pd, true);
                btn.removeEventListener('click', prev.ck, true);
            }
            let lastFire = 0;
            function invoke(e) {
                const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
                if (now - lastFire < 450) return;
                lastFire = now;
                if (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
                }
                callFlank(mode, tag);
            }
            function onPointerDown(e) {
                if (e.pointerType === 'mouse' && e.button !== 0) return;
                invoke(e);
            }
            function onClick(e) {
                invoke(e);
            }
            btn.addEventListener('pointerdown', onPointerDown, true);
            btn.addEventListener('click', onClick, true);
            btn._fdFlankWire = { pd: onPointerDown, ck: onClick };
        });
    }

    function setSelectedFlankTag(tag) {
        selectedFlankTag = tag || null;
        const batt = document.getElementById('fd-col-battalion');
        const brig = document.getElementById('fd-col-brigade');
        if (batt) {
            batt.style.border = tag === 'battalion' ? '2px solid #60a5fa' : '1px solid rgba(255,255,255,0.12)';
            batt.style.background = tag === 'battalion' ? 'rgba(59,130,246,0.12)' : 'rgba(255,255,255,0.05)';
        }
        if (brig) {
            brig.style.border = tag === 'brigade' ? '2px solid #86efac' : '1px solid rgba(255,255,255,0.12)';
            brig.style.background = tag === 'brigade' ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.05)';
        }
        const batSel = document.getElementById('fd-bat-select');
        const brigSel = document.getElementById('fd-brig-select');
        if (batSel) {
            batSel.style.background = tag === 'battalion' ? '#166534' : '#1e293b';
            batSel.style.border = tag === 'battalion' ? '2px solid #4ade80' : '1px solid #475569';
            batSel.textContent = tag === 'battalion' ? fdT('selected') : fdT('select');
        }
        if (brigSel) {
            brigSel.style.background = tag === 'brigade' ? '#166534' : '#1e293b';
            brigSel.style.border = tag === 'brigade' ? '2px solid #4ade80' : '1px solid #475569';
            brigSel.textContent = tag === 'brigade' ? fdT('selected') : fdT('select');
        }
        // Deselect custom formation cards when a built-in is selected
        document.querySelectorAll('.fd-col-custom-formation').forEach(c => {
            const btn = c.querySelector('.fd-custom-select-btn');
            if (btn && tag && (tag === 'battalion' || tag === 'brigade')) {
                c.style.border = '1px solid rgba(255,255,255,0.12)';
                c.style.background = 'rgba(255,255,255,0.05)';
                btn.textContent = fdT('select');
                btn.style.background = '#1e293b';
                btn.style.border = '1px solid #475569';
            }
        });
        // Clear breathing on formations section when user makes a selection
        if (tag) {
            const section = document.getElementById('fd-formations-section');
            if (section) section.classList.remove('fd-breathing-red', 'fd-breathing-amber');
        }
        // Update Start button readiness
        refreshAffButtonHighlight();
        // Formation changed → sync Box 1 (Affiliation) enabled/disabled
        syncAffiliationEnabled();
    }

    function attachFlankCardSelection(panel) {
        const batt = panel.querySelector('#fd-col-battalion');
        const brig = panel.querySelector('#fd-col-brigade');
        if (batt) {
            batt.style.cursor = 'pointer';
            batt.addEventListener('click', (ev) => {
                if (ev.target.closest('button[id^="fd-bat-"]')) return;
                setSelectedFlankTag('battalion');
            });
        }
        if (brig) {
            brig.style.cursor = 'pointer';
            brig.addEventListener('click', (ev) => {
                if (ev.target.closest('button[id^="fd-brig-"]')) return;
                setSelectedFlankTag('brigade');
            });
        }
    }

    function positionFlankControlsUnderAffiliation() {
        const panel = document.getElementById('auto-flank-controls');
        if (!panel) return;
        const affPopup = document.getElementById('free-draw-affiliation-popup');
        const topBar = document.querySelector('.top-bar');
        const top = affPopup ? affPopup.getBoundingClientRect().bottom + 8 : (topBar ? topBar.getBoundingClientRect().bottom + 8 : 70);
        panel.style.top = `${top}px`;
        panel.style.right = '18px';
    }

    function showFlankConfigPanel() {
        const panel = createFloatingAutoFlankControls();
        if (!panel) return;
        panel.style.display = 'flex';
        setSelectedFlankTag(selectedFlankTag);
        positionFlankControlsUnderAffiliation();
    }

    function createFloatingAutoFlankControls() {
        let panel = document.getElementById('auto-flank-controls');
        if (panel) return panel;

        const INPUT = 'width:52px;padding:4px 6px;border-radius:5px;border:1px solid #475569;background:#1e293b;color:#fff;font-size:0.82rem;text-align:center;';
        const BTN_BLUE = 'background:#2563eb;color:#fff;border:none;border-radius:5px;padding:5px 9px;font-size:0.78rem;cursor:pointer;';
        const BTN_GREEN = 'background:#16a34a;color:#fff;border:none;border-radius:5px;padding:5px 9px;font-size:0.78rem;cursor:pointer;margin-top:4px;width:100%;';
        const COL = 'display:flex;flex-direction:column;gap:5px;padding:8px 10px;border-radius:8px;background:rgba(255,255,255,0.06);min-width:160px;';
        const ROW = 'display:flex;align-items:center;gap:5px;';
        const LBL = 'font-size:0.7rem;color:#94a3b8;white-space:nowrap;';

        panel = document.createElement('div');
        panel.id = 'auto-flank-controls';
        panel.style.cssText = 'position:fixed;top:60px;right:18px;z-index:50000;background:rgba(15,23,42,0.95);color:#fff;padding:10px 14px;border-radius:12px;box-shadow:0 6px 18px rgba(0,0,0,0.4);display:flex;flex-direction:column;gap:10px;align-items:stretch;';
        panel.innerHTML = `
            <div id="fd-col-battalion" style="${COL}">
                <span data-fd-i18n="battalion" style="font-size:0.8rem;font-weight:700;color:#93c5fd;margin-bottom:2px;">Battalion</span>
                <div style="${ROW}"><span data-fd-i18n="front-org" style="${LBL}">Front Org:</span><input id="fd-bat-front" type="number" min="1" max="999" value="${savedBatFront}" style="${INPUT}"/><span data-fd-i18n="km" style="${LBL}">km</span><button type="button" data-fd-i18n="draw" id="fd-bat-front-draw" style="${BTN_BLUE}">Draw</button></div>
                <div style="${ROW}"><span data-fd-i18n="deep-org" style="${LBL}">Deep Org:&nbsp;</span><input id="fd-bat-deep" type="number" min="1" max="999" value="${savedBatDeep}" style="${INPUT}"/><span data-fd-i18n="km" style="${LBL}">km</span><button type="button" data-fd-i18n="draw" id="fd-bat-deep-draw" style="${BTN_BLUE}">Draw</button></div>
                <button type="button" data-fd-i18n="both" id="fd-bat-both" style="${BTN_GREEN}">Both</button>
            </div>
            <div id="fd-col-divider" style="height:1px;background:rgba(255,255,255,0.12);"></div>
            <div id="fd-col-brigade" style="${COL}">
                <span data-fd-i18n="brigade" style="font-size:0.8rem;font-weight:700;color:#86efac;margin-bottom:2px;">Brigade</span>
                <div style="${ROW}"><span data-fd-i18n="front-org" style="${LBL}">Front Org:</span><input id="fd-brig-front" type="number" min="1" max="999" value="${savedBrigFront}" style="${INPUT}"/><span data-fd-i18n="km" style="${LBL}">km</span><button type="button" data-fd-i18n="draw" id="fd-brig-front-draw" style="${BTN_BLUE}">Draw</button></div>
                <div style="${ROW}"><span data-fd-i18n="deep-org" style="${LBL}">Deep Org:&nbsp;</span><input id="fd-brig-deep" type="number" min="1" max="999" value="${savedBrigDeep}" style="${INPUT}"/><span data-fd-i18n="km" style="${LBL}">km</span><button type="button" data-fd-i18n="draw" id="fd-brig-deep-draw" style="${BTN_BLUE}">Draw</button></div>
                <button type="button" data-fd-i18n="both" id="fd-brig-both" style="${BTN_GREEN}">Both</button>
            </div>
        `;
        panel.style.display = 'none';
        document.body.appendChild(panel);

        attachFlankCardSelection(panel);
        setSelectedFlankTag(selectedFlankTag);
        applyFdTranslations();
        wireAutoFlankDrawButtons();
        return panel;
    }

    function showAutoFlankControls() {
        removeChangeSetupButton();
        let controls = document.getElementById('auto-flank-controls');
        if (!controls) {
            controls = createFloatingAutoFlankControls();
        }
        if (!controls) return;

        // Show only the selected tag's card; hide the other and the divider
        const tag = selectedFlankTag;
        const batCol = controls.querySelector('#fd-col-battalion');
        const brigCol = controls.querySelector('#fd-col-brigade');
        const divider = controls.querySelector('#fd-col-divider');
        if (batCol) batCol.style.display = tag === 'battalion' ? 'flex' : 'none';
        if (brigCol) brigCol.style.display = tag === 'brigade' ? 'flex' : 'none';
        if (divider) divider.style.display = 'none';

        // Lock all number inputs so values can't be changed at this stage
        controls.querySelectorAll('input[type="number"]').forEach(inp => {
            inp.readOnly = true;
            inp.style.opacity = '0.65';
            inp.style.cursor = 'not-allowed';
        });

        // Add a "Start Over" button if not already present
        if (!controls.querySelector('#fd-start-over-btn')) {
            const restartBtn = document.createElement('button');
            restartBtn.id = 'fd-start-over-btn';
            restartBtn.textContent = fdT('start-over');
            restartBtn.style.cssText = 'width:100%;margin-top:4px;padding:6px;border-radius:6px;border:1px solid #f59e0b;background:rgba(245,158,11,0.15);color:#fbbf24;font-size:0.8rem;font-weight:700;cursor:pointer;';
            restartBtn.addEventListener('click', () => {
                hideAutoFlankControls();
                // Destroy the panel so it's fully rebuilt next time
                const existing = document.getElementById('auto-flank-controls');
                if (existing) existing.remove();
                startNewFreeDrawSession();
            });
            controls.appendChild(restartBtn);
        }

        controls.style.display = 'flex';
        // Advance stage so the global dismiss handler may hide this panel when idle
        stage = 'post-flank';
        window.freeDrawSignatureStage = stage;
        wireAutoFlankDrawButtons();
    }
    window.showAutoFlankControls = showAutoFlankControls;

    function hideAutoFlankControls() {
        const controls = document.getElementById('auto-flank-controls');
        if (!controls) return;
        controls.style.display = 'none';
    }

    function removeConvertLineButton() {
        if (convertLineBtn) {
            convertLineBtn.remove();
            convertLineBtn = null;
        }
        hideAutoFlankControls();
    }

    function showChangeSetupButton() {
        removeChangeSetupButton();
        changeSetupBtn = document.createElement('button');
        changeSetupBtn.id = 'fd-change-setup-btn';
        changeSetupBtn.textContent = fdT('change-setup');
        changeSetupBtn.style.cssText = 'position:fixed;right:12px;z-index:1000;background:rgba(15,23,42,0.88);color:#93c5fd;border:1px solid #3b82f6;border-radius:6px;padding:5px 12px;font-size:0.76rem;cursor:pointer;font-weight:600;';
        const topBar = document.querySelector('.top-bar');
        const topBarBottom = topBar ? topBar.getBoundingClientRect().bottom : 48;
        changeSetupBtn.style.top = `${topBarBottom + 6}px`;
        changeSetupBtn.addEventListener('click', () => {
            removeChangeSetupButton();
            showAffiliationPopup();
        });
        document.body.appendChild(changeSetupBtn);
    }

    function removeChangeSetupButton() {
        if (changeSetupBtn) { changeSetupBtn.remove(); changeSetupBtn = null; }
        const existing = document.getElementById('fd-change-setup-btn');
        if (existing) existing.remove();
    }

    function showAffiliationPopup() {
        removeAffiliationPopup();
        removeChangeSetupButton();
        setupComplete = false;  // Re-entering setup — block drawing until Start is clicked
        // Remove flank panel from DOM so its IDs (#fd-bat-front, #fd-col-battalion, etc.)
        // don't shadow the same IDs inside the popup
        const existingPanel = document.getElementById('auto-flank-controls');
        if (existingPanel) existingPanel.remove();

        const INPUT = 'width:52px;padding:4px 6px;border-radius:5px;border:1px solid #475569;background:#1e293b;color:#fff;font-size:0.82rem;text-align:center;';
        const ROW = 'display:flex;align-items:center;gap:5px;margin-bottom:4px;';
        const LBL = 'font-size:0.7rem;color:#94a3b8;white-space:nowrap;';
        const CARD = 'padding:8px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.05);margin-bottom:8px;';
        const SEL_BTN = 'width:100%;margin-top:6px;padding:6px;border-radius:5px;border:1px solid #475569;background:#1e293b;color:#fff;font-size:0.8rem;font-weight:600;cursor:pointer;';

        affiliationPopup = document.createElement('div');
        affiliationPopup.id = 'free-draw-affiliation-popup';
        affiliationPopup.style.cssText = 'position:fixed;right:12px;top:0;z-index:1000;background:rgba(15,23,42,0.96);color:#f8fafc;border:1px solid rgba(255,255,255,0.08);border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,0.45),0 0 0 1px rgba(255,255,255,0.05);padding:12px 14px;width:230px;font-size:0.8rem;max-height:92vh;overflow-y:auto;backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);';
        affiliationPopup.innerHTML = `
            <div data-fd-i18n="choose-aff" style="font-weight:700;margin-bottom:10px;color:#e2e8f0;">Choose affiliation</div>
            <button id="fd-aff-friend" class="fd-aff-button fd-aff-friend">Friendly</button>
            <button id="fd-aff-enemy" class="fd-aff-button fd-aff-enemy">Enemy</button>
            <button id="fd-aff-start" data-fd-i18n="start-btn" class="fd-aff-button" style="margin-top:6px;opacity:0.65;">Start &rarr;</button>
            <div data-fd-i18n="circles-to-place" style="margin-top:10px;font-weight:600;color:#e2e8f0;">Circles to place</div>
            <select id="fd-circle-count" style="width:100%;padding:6px;margin-top:4px;border-radius:6px;border:1px solid #94a3b8;background:#0f172a;color:#f8fafc;margin-bottom:10px;">
                <option value="2">2</option>
                <option value="3" selected>3</option>
                <option value="4">4</option>
                <option value="5">5</option>
            </select>
            <div style="height:1px;background:rgba(255,255,255,0.15);margin-bottom:10px;"></div>
            <div id="fd-formations-section">
            <div id="fd-col-battalion" class="fd-formation-card" style="${CARD}cursor:pointer;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                    <span data-fd-i18n="battalion" style="font-size:0.8rem;font-weight:700;color:#93c5fd;">Battalion</span>
                    <button class="fd-default-star" data-default-tag="battalion" title="${fdT('set-default')}">&#9734;</button>
                </div>
                <div style="${ROW}"><span data-fd-i18n="front-org" style="${LBL}">Front Org:</span><input id="fd-bat-front" type="number" min="1" max="999" value="${savedBatFront}" style="${INPUT}"/><span data-fd-i18n="km" style="${LBL}">km</span></div>
                <div style="${ROW}"><span data-fd-i18n="deep-org" style="${LBL}">Deep Org:&nbsp;</span><input id="fd-bat-deep" type="number" min="1" max="999" value="${savedBatDeep}" style="${INPUT}"/><span data-fd-i18n="km" style="${LBL}">km</span></div>
                <button data-fd-i18n="select" id="fd-bat-select" style="${SEL_BTN}">Select</button>
            </div>
            <div id="fd-col-brigade" class="fd-formation-card" style="${CARD}cursor:pointer;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                    <span data-fd-i18n="brigade" style="font-size:0.8rem;font-weight:700;color:#86efac;">Brigade</span>
                    <button class="fd-default-star" data-default-tag="brigade" title="${fdT('set-default')}">&#9734;</button>
                </div>
                <div style="${ROW}"><span data-fd-i18n="front-org" style="${LBL}">Front Org:</span><input id="fd-brig-front" type="number" min="1" max="999" value="${savedBrigFront}" style="${INPUT}"/><span data-fd-i18n="km" style="${LBL}">km</span></div>
                <div style="${ROW}"><span data-fd-i18n="deep-org" style="${LBL}">Deep Org:&nbsp;</span><input id="fd-brig-deep" type="number" min="1" max="999" value="${savedBrigDeep}" style="${INPUT}"/><span data-fd-i18n="km" style="${LBL}">km</span></div>
                <button data-fd-i18n="select" id="fd-brig-select" style="${SEL_BTN}">Select</button>
            </div>
            </div>
            <button id="fd-add-formation-btn" data-fd-i18n="add-formation-btn" style="width:100%;margin:8px 0 0 0;padding:8px;border-radius:6px;border:1px solid #22c55e;background:#0f172a;color:#22c55e;font-weight:700;cursor:pointer;">+ Add Formation</button>
            <button data-fd-i18n="close" id="fd-aff-close" class="fd-aff-button fd-aff-close" style="margin-top:4px;background:#374151;color:#f8fafc;border:1px solid #9ca3af;">Close</button>
        `;
        // Store custom formations in memory for this popup
        let customFormations = [];


        function renderCustomFormations() {
            // Remove all existing custom formation cards
            affiliationPopup.querySelectorAll('.fd-col-custom-formation').forEach(c => c.remove());
            // Insert all in order, under Brigade
            const brigadeCard = affiliationPopup.querySelector('#fd-col-brigade');
            let insertAfter = brigadeCard;
            customFormations.forEach(f => {
                const card = createFormationCard(f.engName, f.arName, f.id, f.front, f.deep);
                insertAfter.parentNode.insertBefore(card, insertAfter.nextSibling);
                insertAfter = card;
            });
            // Re-enable drag-and-drop
            enableFormationDragDrop();
        }

        function createFormationCard(engName, arName, id, front, deep) {
            const frontVal = front || 8;
            const deepVal = deep || 20;
            const card = document.createElement('div');
            card.className = 'fd-col-custom-formation';
            card.setAttribute('draggable', 'true');
            card.dataset.formationId = id;
            card.style = CARD + 'cursor:move;position:relative;';
            const isDefault = (getDefaultFormation() === engName);
            card.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                    <span class="fd-formation-title" style="font-size:0.8rem;font-weight:700;color:#22c55e;"></span>
                    <div style="display:flex;align-items:center;gap:4px;">
                        <button class="fd-default-star" data-default-tag="${engName}" title="${isDefault ? fdT('remove-default') : fdT('set-default')}">${isDefault ? '&#9733;' : '&#9734;'}</button>
                        <button class="fd-delete-formation-btn" title="Delete" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:1.1em;padding:0 4px;opacity:0.7;">✕</button>
                    </div>
                </div>
                <div style="${ROW}"><span style="${LBL}">${fdT('front-org')}</span><input class="fd-custom-front" type="number" min="1" max="999" value="${frontVal}" style="${INPUT}"/><span style="${LBL}">${fdT('km')}</span></div>
                <div style="${ROW}"><span style="${LBL}">${fdT('deep-org')}</span><input class="fd-custom-deep" type="number" min="1" max="999" value="${deepVal}" style="${INPUT}"/><span style="${LBL}">${fdT('km')}</span></div>
                <button class="fd-custom-select-btn" style="${SEL_BTN}">${fdT('select')}</button>
                <span class="fd-drag-handle" style="position:absolute;right:8px;bottom:8px;cursor:grab;font-size:1.2em;color:#64748b;">☰</span>
            `;
            // Language switching
            function updateTitle() {
                card.querySelector('.fd-formation-title').innerHTML = isArabic() ? `${arName} <span style=\"color:#38bdf8;font-size:0.7em;\">${engName}</span>` : `${engName} <span style=\"color:#fbbf24;font-size:0.7em;\">${arName}</span>`;
            }
            updateTitle();
            // Auto-calculate Deep = 2 × Front
            const cFront = card.querySelector('.fd-custom-front');
            const cDeep = card.querySelector('.fd-custom-deep');
            if (cFront && cDeep) {
                cFront.addEventListener('input', () => {
                    const v = parseFloat(cFront.value);
                    if (isFinite(v) && v > 0) cDeep.value = (v * 2).toString();
                });
            }
            // Selection logic
            card.querySelector('.fd-custom-select-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                setSelectedCustomFormation(card, engName, arName);
            });
            // Favorite star — set/unset as default formation
            card.querySelector('.fd-default-star').addEventListener('click', (e) => {
                e.stopPropagation();
                const currentDefault = getDefaultFormation();
                if (currentDefault === engName) {
                    saveDefaultFormation(null);
                } else {
                    saveDefaultFormation(engName);
                }
                refreshStarButtons();
            });
            // Delete button — remove this custom formation
            card.querySelector('.fd-delete-formation-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                customFormations = customFormations.filter(f => f.id !== id);
                // If this was the default, clear default
                if (getDefaultFormation() === engName) {
                    saveDefaultFormation(null);
                }
                // If this was the selected formation, clear selection
                if (selectedFlankTag === engName) {
                    setSelectedFlankTag(null);
                }
                renderCustomFormations();
            });
            // Listen for language change
            window.addEventListener('fdLangChange', updateTitle);
            return card;
        }

        function addFormationCard(engName, arName, front, deep) {
            // Generate a unique id for the new formation
            const id = 'fd-col-' + engName.toLowerCase().replace(/[^a-z0-9]/g, '') + '-' + Date.now();
            customFormations.push({id, engName, arName, front: front || 8, deep: deep || 20});
            renderCustomFormations();
        }

        function enableFormationDragDrop() {
            const cards = Array.from(affiliationPopup.querySelectorAll('.fd-col-custom-formation'));
            let dragSrc = null;
            cards.forEach(card => {
                card.addEventListener('dragstart', function(e) {
                    dragSrc = card;
                    card.style.opacity = '0.5';
                    e.dataTransfer.effectAllowed = 'move';
                });
                card.addEventListener('dragend', function() {
                    dragSrc = null;
                    card.style.opacity = '';
                });
                card.addEventListener('dragover', function(e) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                });
                card.addEventListener('drop', function(e) {
                    e.preventDefault();
                    if (dragSrc && dragSrc !== card) {
                        // Find indexes
                        const fromId = dragSrc.dataset.formationId;
                        const toId = card.dataset.formationId;
                        const fromIdx = customFormations.findIndex(f => f.id === fromId);
                        const toIdx = customFormations.findIndex(f => f.id === toId);
                        if (fromIdx !== -1 && toIdx !== -1) {
                            // Move formation
                            const [moved] = customFormations.splice(fromIdx, 1);
                            customFormations.splice(toIdx, 0, moved);
                            renderCustomFormations();
                        }
                    }
                });
            });
        }

        function setSelectedCustomFormation(card, engName, arName) {
            // Deselect all
            affiliationPopup.querySelectorAll('.fd-col-custom-formation').forEach(c => {
                c.style.border = CARD.match(/border:[^;]+;/)[0];
                c.style.background = CARD.match(/background:[^;]+;/)[0];
                c.querySelector('.fd-custom-select-btn').textContent = 'Select';
                c.querySelector('.fd-custom-select-btn').style.background = '#1e293b';
                c.querySelector('.fd-custom-select-btn').style.border = '1px solid #475569';
            });
            // Deselect battalion/brigade
            setSelectedFlankTag(null);
            // Select this one
            card.style.border = '2px solid #22c55e';
            card.style.background = 'rgba(34,197,94,0.10)';
            card.querySelector('.fd-custom-select-btn').textContent = '✓ Selected';
            card.querySelector('.fd-custom-select-btn').style.background = '#166534';
            card.querySelector('.fd-custom-select-btn').style.border = '2px solid #4ade80';
            // Store selection
            selectedFlankTag = engName;
            // Custom formation selected → enable Box 1 (Affiliation) + refresh Start
            refreshAffButtonHighlight();
            syncAffiliationEnabled();
        }

        // Add formation button logic
        affiliationPopup.querySelector('#fd-add-formation-btn').addEventListener('click', () => {
            // Show modal for new formation: names + Front Org / Deep Org
            const modal = document.createElement('div');
            modal.dir = isArabic() ? 'rtl' : 'ltr';
            modal.style = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:20000;background:#1e293b;color:#fff;padding:24px 18px;border-radius:10px;box-shadow:0 4px 24px rgba(0,0,0,0.45);display:flex;flex-direction:column;gap:10px;align-items:stretch;min-width:240px;';
            modal.innerHTML = `
                <div style="font-weight:700;font-size:1em;color:#e2e8f0;margin-bottom:2px;">${fdT('add-formation-title')}</div>
                <label style="font-size:0.9em;">${fdT('eng-name')}<input id="fd-new-eng" style="margin-${isArabic()?'right':'left'}:8px;padding:4px 8px;border-radius:5px;border:1px solid #475569;background:#0f172a;color:#fff;"/></label>
                <label style="font-size:0.9em;">${fdT('ar-name')}<input id="fd-new-ar" style="margin-${isArabic()?'right':'left'}:8px;padding:4px 8px;border-radius:5px;border:1px solid #475569;background:#0f172a;color:#fff;"/></label>
                <div style="display:flex;align-items:center;gap:5px;">
                    <span style="font-size:0.8em;color:#94a3b8;white-space:nowrap;">${fdT('front-org')}</span>
                    <input id="fd-new-front" type="number" min="1" max="999" value="8" style="width:52px;padding:4px 6px;border-radius:5px;border:1px solid #475569;background:#0f172a;color:#fff;font-size:0.82rem;text-align:center;"/>
                    <span style="font-size:0.8em;color:#94a3b8;">${fdT('km')}</span>
                </div>
                <div style="display:flex;align-items:center;gap:5px;">
                    <span style="font-size:0.8em;color:#94a3b8;white-space:nowrap;">${fdT('deep-org')}</span>
                    <input id="fd-new-deep" type="number" min="1" max="999" value="20" style="width:52px;padding:4px 6px;border-radius:5px;border:1px solid #475569;background:#0f172a;color:#fff;font-size:0.82rem;text-align:center;"/>
                    <span style="font-size:0.8em;color:#94a3b8;">${fdT('km')}</span>
                </div>
                <div style="display:flex;gap:10px;justify-content:flex-end;">
                    <button id="fd-cancel-new-formation" style="padding:6px 16px;border-radius:6px;background:#374151;color:#fff;border:1px solid #475569;cursor:pointer;">${fdT('cancel')}</button>
                    <button id="fd-save-new-formation" style="padding:6px 16px;border-radius:6px;background:#22c55e;color:#fff;border:1px solid #22c55e;cursor:pointer;">${fdT('add')}</button>
                </div>
            `;
            document.body.appendChild(modal);
            // Auto-calculate Deep = 2 × Front
            const frontInput = modal.querySelector('#fd-new-front');
            const deepInput = modal.querySelector('#fd-new-deep');
            frontInput.addEventListener('input', () => {
                const v = parseFloat(frontInput.value);
                if (isFinite(v) && v > 0) deepInput.value = (v * 2).toString();
            });
            modal.querySelector('#fd-cancel-new-formation').onclick = () => modal.remove();
            modal.querySelector('#fd-save-new-formation').onclick = () => {
                const eng = modal.querySelector('#fd-new-eng').value.trim();
                const ar = modal.querySelector('#fd-new-ar').value.trim();
                if (eng && ar) {
                    const front = parseFloat(frontInput.value) || 8;
                    const deep = parseFloat(deepInput.value) || 20;
                    addFormationCard(eng, ar, front, deep);
                    modal.remove();
                } else {
                    alert(fdT('enter-both-names'));
                }
            };
        });

        affiliationPopup.querySelectorAll('.fd-aff-button').forEach(btn => {
            btn.style.display = 'block';
            btn.style.width = '100%';
            btn.style.margin = '4px 0';
            btn.style.padding = '8px';
            btn.style.borderRadius = '6px';
            btn.style.border = '1px solid #94a3b8';
            btn.style.cursor = 'pointer';
            btn.style.fontWeight = '700';
        });

        pendingAffiliation = null;

        document.body.appendChild(affiliationPopup);

        const topBar = document.querySelector('.top-bar');
        const topBarBottom = topBar ? topBar.getBoundingClientRect().bottom : 48;
        const finalTop = Math.max(topBarBottom - 1, 0);
        affiliationPopup.style.top = `${finalTop}px`;

        const countSelect = document.getElementById('fd-circle-count');
        if (countSelect) {
            countSelect.value = String(maxCircleX || 3);
            maxCircleX = Number(countSelect.value) || 3;
            countSelect.addEventListener('change', () => {
                const val = Number(countSelect.value);
                if (Number.isInteger(val) && val >= 2 && val <= 5) {
                    maxCircleX = val;
                } else {
                    maxCircleX = 2;
                    countSelect.value = '2';
                }
            });
        }

        affiliationPopup.querySelector('#fd-bat-select')?.addEventListener('click', (e) => {
            e.stopPropagation();
            setSelectedFlankTag('battalion');
        });
        affiliationPopup.querySelector('#fd-col-battalion')?.addEventListener('click', () => {
            setSelectedFlankTag('battalion');
        });
        affiliationPopup.querySelector('#fd-brig-select')?.addEventListener('click', (e) => {
            e.stopPropagation();
            setSelectedFlankTag('brigade');
        });
        affiliationPopup.querySelector('#fd-col-brigade')?.addEventListener('click', () => {
            setSelectedFlankTag('brigade');
        });

        // ── Reset formation: use default favorite if set, otherwise nothing ──
        const defaultFormationTag = getDefaultFormation();
        if (defaultFormationTag) {
            setSelectedFlankTag(defaultFormationTag);
        } else {
            setSelectedFlankTag(null);
        }

        // ── Wire star/default buttons on built-in formation cards ──
        function refreshStarButtons() {
            const currentDefault = getDefaultFormation();
            affiliationPopup?.querySelectorAll('.fd-default-star').forEach(star => {
                const tag = star.getAttribute('data-default-tag');
                const isDefault = (tag === currentDefault);
                star.innerHTML = isDefault ? '&#9733;' : '&#9734;';
                star.classList.toggle('fd-is-default', isDefault);
                star.title = isDefault ? fdT('remove-default') : fdT('set-default');
            });
        }
        affiliationPopup.querySelectorAll('.fd-default-star').forEach(star => {
            star.addEventListener('click', (e) => {
                e.stopPropagation();
                const tag = star.getAttribute('data-default-tag');
                const currentDefault = getDefaultFormation();
                if (currentDefault === tag) {
                    saveDefaultFormation(null);
                } else {
                    saveDefaultFormation(tag);
                }
                refreshStarButtons();
            });
        });
        refreshStarButtons();

        // Auto-calculate Deep Org = 2 × Front Org as the user types (overrideable)
        function wireAutoDeep(frontId, deepId) {
            const frontEl = affiliationPopup.querySelector('#' + frontId);
            const deepEl  = affiliationPopup.querySelector('#' + deepId);
            if (!frontEl || !deepEl) return;
            frontEl.addEventListener('input', () => {
                const v = parseFloat(frontEl.value);
                if (isFinite(v) && v > 0) deepEl.value = (v * 2).toString();
            });
        }
        wireAutoDeep('fd-bat-front',  'fd-bat-deep');
        wireAutoDeep('fd-brig-front', 'fd-brig-deep');

        // Render any custom formations (if any)
        renderCustomFormations();

        function startWithAffiliation(aff) {
            // Capture current input values before popup is destroyed
            const bf = parseFloat(affiliationPopup.querySelector('#fd-bat-front')?.value);
            const bd = parseFloat(affiliationPopup.querySelector('#fd-bat-deep')?.value);
            const gf = parseFloat(affiliationPopup.querySelector('#fd-brig-front')?.value);
            const gd = parseFloat(affiliationPopup.querySelector('#fd-brig-deep')?.value);
            if (isFinite(bf) && bf > 0) savedBatFront = bf;
            if (isFinite(bd) && bd > 0) savedBatDeep = bd;
            if (isFinite(gf) && gf > 0) savedBrigFront = gf;
            if (isFinite(gd) && gd > 0) savedBrigDeep = gd;

            chosenAffiliation = aff;
            window.freeDrawSignatureAffiliation = aff;
            setupComplete = true;  // Step 1 done — drawing is now allowed
            updateInstruction('Affiliation set to ' + (aff === 'enemy' ? 'Enemy' : 'Friendly') + '. Click map to place symbol.');
            removeAffiliationPopup();
            showChangeSetupButton();
        }

        // ── Affiliation buttons: blocked until a Formation is selected ──
        document.getElementById('fd-aff-friend')?.addEventListener('click', () => {
            // Ignore click if Formation not yet chosen (Box 1 is disabled)
            if (!selectedFlankTag) return;
            pendingAffiliation = 'friendly';
            refreshAffButtonHighlight();
        });
        document.getElementById('fd-aff-enemy')?.addEventListener('click', () => {
            // Ignore click if Formation not yet chosen (Box 1 is disabled)
            if (!selectedFlankTag) return;
            pendingAffiliation = 'enemy';
            refreshAffButtonHighlight();
        });
        // ── Start button: enforces Formation → Affiliation order ──
        document.getElementById('fd-aff-start')?.addEventListener('click', () => {
            // Case 1: no Formation selected → centered warning + flash Box 2 red
            if (!selectedFlankTag) {
                showCenterWarning(fdT('need-formation'));
                const formationsSection = affiliationPopup?.querySelector('#fd-formations-section');
                if (formationsSection) triggerBreathing(formationsSection, 'red');
                return;
            }
            // Case 2: Formation selected but no Affiliation → centered warning + flash Box 1 red
            if (!pendingAffiliation) {
                showCenterWarning(fdT('need-affiliation'));
                const friendBtn = document.getElementById('fd-aff-friend');
                const enemyBtn = document.getElementById('fd-aff-enemy');
                if (friendBtn) triggerBreathing(friendBtn, 'red');
                if (enemyBtn) triggerBreathing(enemyBtn, 'red');
                return;
            }
            // Case 3: both set → proceed
            startWithAffiliation(pendingAffiliation);
        });
        document.getElementById('fd-aff-close')?.addEventListener('click', () => {
            removeAffiliationPopup();
            const btn = document.getElementById('free-draw-signature-btn');
            if (btn) btn.classList.remove('fd-btn-active');
        });

        applyFdTranslations();

        // Close popup when clicking anywhere outside it (or outside the Auto Draw button).
        // Don't dismiss when clicking on the map — the popup must stay visible so the
        // Formation/Affiliation validation flash is visible to the user.
        affiliationPopupOutsideHandler = function(e) {
            if (!affiliationPopup) return;
            const btn = document.getElementById('free-draw-signature-btn');
            if (affiliationPopup.contains(e.target)) return;
            if (btn && btn.contains(e.target)) return;
            // Keep popup open if clicking on the map (user needs to complete setup first)
            const mapContainer = map?.getContainer();
            if (mapContainer && mapContainer.contains(e.target)) return;
            // Keep popup open if clicking inside a modal overlay (e.g. Add Formation modal)
            if (e.target.closest('#fd-cancel-new-formation, #fd-save-new-formation, #fd-new-eng, #fd-new-ar, #fd-new-front, #fd-new-deep') ||
                e.target.closest('[style*="z-index:20000"]')) return;
            removeAffiliationPopup();
        };
        // Use setTimeout so the current click that opened the popup doesn't immediately close it
        setTimeout(() => {
            document.addEventListener('mousedown', affiliationPopupOutsideHandler);
        }, 0);
    }

    function removeAffiliationPopup() {
        if (!affiliationPopup) return;
        affiliationPopup.remove();
        affiliationPopup = null;
        if (affiliationPopupOutsideHandler) {
            document.removeEventListener('mousedown', affiliationPopupOutsideHandler);
            affiliationPopupOutsideHandler = null;
        }
    }

    function finishFreeDrawSignature() {
        if (!isActive && stage !== 'post-circle') return;
        stage = 'idle';
        window.freeDrawSignatureStage = stage;
        isActive = false;
        setupComplete = false;
        map.getContainer().style.cursor = '';
        if (map.dragging && map.dragging.disabled) map.dragging.enable();
        removeAffiliationPopup();
        removeChangeSetupButton();
        updateInstruction('Free draw signature complete. You can use other tools now.');
        removeConvertLineButton();
        cleanupSketch(true);
        window.freeDrawSignatureActive = false;
        window.freeDrawSignatureRecentClick = true;
        clearCirclePlacementPreview();
        setStepMessage([]);
    }

    // Force-cancel from any stage — used when user switches to another tool
    function cancelFreeDrawWorkflow() {
        if (stage === 'idle') return;
        stage = 'idle';
        window.freeDrawSignatureStage = stage;
        isActive = false;
        setupComplete = false;
        map.getContainer().style.cursor = '';
        if (map.dragging && map.dragging.disabled) map.dragging.enable();
        removeAffiliationPopup();
        removeChangeSetupButton();
        removeConvertLineButton();
        cleanupSketch(true);
        window.freeDrawSignatureActive = false;
        clearCirclePlacementPreview();
        setStepMessage([]);
        hideAutoFlankControls();
        // Also remove the center warning if visible
        var warn = document.getElementById('fd-center-warning');
        if (warn) warn.remove();
    }

    // Shared logic: activate scalloped frontline drawing after circles are in place.
    // Used by both the normal post-circle flow and the resume-orphan flow.
    function activateScallopedDrawingMode() {
        stage = 'post-circle';
        window.freeDrawSignatureStage = stage;

        setCriticalMessage('Now draw the front line between the circles.');
        updateInstruction('Click near a circle-X to start drawing the front line. Double-click or press Finish to complete.');

        // Directly select scalloped (Front Line Border) TMG type with affiliation color
        var lineColor = (chosenAffiliation === 'enemy') ? '#ef4444' : '#3b82f6';
        if (typeof window.selectTmgType === 'function') {
            window.selectTmgType('scalloped', lineColor);
        } else {
            var modeSelect = document.getElementById('tool-mode');
            if (modeSelect) {
                modeSelect.value = 'line';
                modeSelect.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }

        isActive = false;
        window.freeDrawSignatureActive = false;
        window.freeDrawSignatureRecentClick = true;
        map.getContainer().style.cursor = 'crosshair';
    }

    function resumeOrphanedSession(orphan) {
        // Restore the old session so circle-X centers are in scope
        window.freeDrawSignatureSessionId = orphan.sessionId;
        chosenAffiliation = orphan.affiliation || 'friendly';
        window.freeDrawSignatureAffiliation = chosenAffiliation;
        circleXCount = orphan.centers.length;
        maxCircleX = orphan.centers.length;

        // Use the same function as the normal post-circle flow
        activateScallopedDrawingMode();

        // Pan map to show all orphaned circles
        var bounds = L.latLngBounds(orphan.centers);
        map.fitBounds(bounds.pad(0.3));
    }

    function showContinueDialog(orphan) {
        // Remove any pre-existing dialog
        var existing = document.getElementById('fd-continue-dialog');
        if (existing) existing.remove();

        var dialog = document.createElement('div');
        dialog.id = 'fd-continue-dialog';
        dialog.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:10000;background:rgba(15,23,42,0.97);color:#f8fafc;border:1px solid #3b82f6;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.5);padding:24px;width:340px;text-align:center;font-size:0.95rem;';
        dialog.innerHTML =
            '<div style="font-weight:700;font-size:1.1rem;margin-bottom:12px;color:#f59e0b;">Front Line Not Drawn</div>' +
            '<div style="margin-bottom:18px;line-height:1.5;">You have <b>' + orphan.centers.length + '</b> circle-X markers from a previous session without a front line.<br>Would you like to continue drawing the front line?</div>' +
            '<div style="display:flex;gap:10px;justify-content:center;">' +
                '<button id="fd-continue-yes" style="padding:10px 28px;border-radius:8px;border:none;background:#3b82f6;color:#fff;font-weight:700;cursor:pointer;font-size:0.95rem;">Yes, continue</button>' +
                '<button id="fd-continue-no" style="padding:10px 28px;border-radius:8px;border:1px solid #6b7280;background:#374151;color:#f8fafc;font-weight:700;cursor:pointer;font-size:0.95rem;">No, start new</button>' +
            '</div>';

        document.body.appendChild(dialog);

        // Dismiss dialog when clicking anywhere outside it (map, header, sidebar, etc.)
        function dismissOnOutsideClick(e) {
            if (!dialog.contains(e.target)) {
                dialog.remove();
                document.removeEventListener('mousedown', dismissOnOutsideClick, true);
            }
        }
        // Use capture phase + setTimeout so the current click that opened the dialog doesn't immediately close it
        setTimeout(function () {
            document.addEventListener('mousedown', dismissOnOutsideClick, true);
        }, 0);

        document.getElementById('fd-continue-yes').addEventListener('click', function () {
            document.removeEventListener('mousedown', dismissOnOutsideClick, true);
            dialog.remove();
            resumeOrphanedSession(orphan);
        });
        document.getElementById('fd-continue-no').addEventListener('click', function () {
            document.removeEventListener('mousedown', dismissOnOutsideClick, true);
            dialog.remove();
            // Remove old orphaned circle-X markers from the map before starting fresh
            if (typeof window.removeCircleXBySession === 'function') {
                window.removeCircleXBySession(orphan.sessionId);
            }
            startNewFreeDrawSession();
        });
    }

    function startNewFreeDrawSession() {
        window.freeDrawSignatureSessionId = 'free-draw-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
        isActive = true;
        stage = 'placement';
        setupComplete = false;  // Reset — user must complete Step 1 before drawing
        window.freeDrawSignatureStage = stage;
        window.freeDrawSignatureActive = true;
        window.freeDrawSignatureCurrentTMG = REQUIRED_TMG_ID;

        circleXCount = 0;
        placedCircleCenters = [];
        clearCirclePlacementPreview();
        // Remove (not just hide) the old flank panel so its IDs don't collide with the popup
        const oldPanel = document.getElementById('auto-flank-controls');
        if (oldPanel) oldPanel.remove();
        updateInstruction('Free draw signature active: click map once to place circle X obstacle. Repeat as needed. Double-click or tick to finish.');
        setCriticalMessage('');
        map.getContainer().style.cursor = 'crosshair';

        removeConvertLineButton();
        cleanupSketch(true);
        showAffiliationPopup();
    }

    function activateFreeDrawSignature() {
        if (!map) return;

        // Cancel any active drawing mode (freehand pen, eraser, line, etc.) before starting
        var modeSelect = document.getElementById('tool-mode');
        if (modeSelect && modeSelect.value !== 'pan') {
            modeSelect.value = 'pan';
            modeSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
        // Also cancel geo freehand / distance / freeform tools
        var geoToolSelect = document.getElementById('geo-tool-select');
        if (geoToolSelect && geoToolSelect.value !== 'none') {
            geoToolSelect.value = 'none';
            geoToolSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }

        // Check if there's an orphaned session (circles placed but no frontline)
        if (typeof window.findOrphanedCircleXSession === 'function') {
            var orphan = window.findOrphanedCircleXSession();
            if (orphan) {
                showContinueDialog(orphan);
                return;
            }
        }

        startNewFreeDrawSession();
    }

    window.freeDrawSignature = {
        init: initFreeDrawSignatureWorkflow,
        activate: activateFreeDrawSignature,
        finish: finishFreeDrawSignature,
        cancel: cancelFreeDrawWorkflow,
        isActive: () => isActive,
        getStage: () => stage,
        getRequiredTMG: () => REQUIRED_TMG_ID,
        /** Keeps internal `stage` in sync after app.js auto-flank draw (avoids idle dismiss / odd UI state). */
        syncPostFlankStage: () => {
            stage = 'post-flank';
            window.freeDrawSignatureStage = stage;
        },
        /** Circle X centres in placement order: left, center, right (for auto-flank rectangle geometry). */
        getOrderedCircleCenters: () => placedCircleCenters.map(p => L.latLng(p.lat, p.lng))
    };
})();