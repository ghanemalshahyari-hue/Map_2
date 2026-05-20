/**
 * Adjudicator HUD.
 *
 * Mounts into the empty <section id="wg-adjudicator-card"> in the wargame
 * panel. Provides:
 *   - Scenario/model/mode pickers
 *   - "Adjudicate next step" (single-step)
 *   - "Run 1 trial" (12 sequential steps on the live map)
 *   - "Run Monte Carlo" (N trials, server-side, SSE progress)
 *   - Live narrative + state display (EN + Arabic RTL)
 *   - MC progress + outcome histogram
 *
 * Depends on:
 *   window.AppAdjudicator       (HTTP wrapper)
 *   window.AppScenarioState     (per-trial state container)
 */
(function () {
    'use strict';

    const SCENARIO_DEFAULT = 'wargame2-brega';

    let trial = null;       // current per-trial state from AppScenarioState
    let mcRunSubscription = null;
    let activeRunId = null;
    let scenarioCache = null;  // full scenario JSON, fetched on demand for map overlay

    // ── Boot ─────────────────────────────────────────────────────────
    function boot() {
        const root = document.getElementById('wg-adjudicator-card');
        if (!root) return;
        root.innerHTML = renderShell();
        bindHandlers(root);
        if (window.AppScenarioState) {
            trial = window.AppScenarioState.create({ scenarioName: SCENARIO_DEFAULT });
        }
        setStatus('Idle. Click "Adjudicate next step" to begin.', 'idle');
        loadScenarios().then(autoDrawWhenReady);
    }

    // Try to draw the scenario on the map as soon as both the scenario JSON
    // and Leaflet's window.map are available. Poll briefly because the
    // wargame panel may be hidden when the HUD boots, but window.map is
    // already initialized by app.js at this point.
    async function autoDrawWhenReady() {
        const sc = await ensureScenarioLoaded();
        if (!sc) return;
        const tryDraw = (attemptsLeft) => {
            if (window.AppAdjudicatorMap && window.map && window.L) {
                const drew = window.AppAdjudicatorMap.drawScenario(sc);
                if (drew) {
                    setStatus('Scenario drawn on map — BLS, OBJ NASSER, pipeline, Red units visible.', 'ok');
                    return;
                }
            }
            if (attemptsLeft > 0) setTimeout(() => tryDraw(attemptsLeft - 1), 500);
            else setStatus('Map overlay unavailable (window.map not ready). Click "Show scenario on map" once panel is open.', 'idle');
        };
        tryDraw(10); // 10 attempts × 500 ms = 5 s max wait
    }

    // ── Shell HTML ───────────────────────────────────────────────────
    function renderShell() {
        return `
            <div class="wargame-feed-head">
                <span>&#127919; AI Adjudicator</span>
                <span id="wg-adj-pill" class="wargame-state-pill is-idle">Idle</span>
            </div>
            <div id="wg-adj-status" class="wargame-status-block">
                Loading scenarios…
            </div>

            <!-- ── Setup: scenario + model + mock toggle ── -->
            <div class="wg-adj-section">
                <div class="wg-adj-section-title">Setup</div>
                <div class="wg-adj-form-grid">
                    <label for="wg-adj-scenario" class="wg-adj-label">Scenario</label>
                    <select id="wg-adj-scenario" class="wg-adj-input"></select>

                    <label for="wg-adj-model" class="wg-adj-label">Model</label>
                    <input id="wg-adj-model" class="wg-adj-input" type="text" placeholder="(default)" />

                    <label for="wg-adj-coa-reserve" class="wg-adj-label">Reserve&nbsp;hr</label>
                    <input id="wg-adj-coa-reserve" class="wg-adj-input" type="number" value="72" min="0" max="144" step="1" />

                    <label for="wg-adj-coa-posture" class="wg-adj-label">Posture</label>
                    <select id="wg-adj-coa-posture" class="wg-adj-input">
                        <option value="deliberate">deliberate</option>
                        <option value="hasty">hasty</option>
                    </select>

                    <label for="wg-adj-seed" class="wg-adj-label">Trial&nbsp;seed</label>
                    <input id="wg-adj-seed" class="wg-adj-input" type="text" value="manual" />
                </div>
                <label class="wg-adj-toggle">
                    <input type="checkbox" id="wg-adj-mock" checked />
                    <span>Mock mode (no Ollama)</span>
                </label>
            </div>

            <!-- ── Map overlay buttons ── -->
            <div class="wg-adj-section">
                <div class="wg-adj-section-title">Scenario overlay</div>
                <div class="wg-adj-btn-row wg-adj-btn-row--2">
                    <button id="wg-adj-map-btn"   class="wargame-action-btn secondary" type="button">Show on map</button>
                    <button id="wg-adj-map-clear" class="wargame-action-btn secondary" type="button">Hide</button>
                </div>
            </div>

            <!-- ── Step-by-step adjudication ── -->
            <div class="wg-adj-section">
                <div class="wg-adj-section-title">Adjudicate</div>
                <div class="wg-adj-btn-row wg-adj-btn-row--3">
                    <button id="wg-adj-step-btn"  class="wargame-action-btn primary"   type="button">Next step</button>
                    <button id="wg-adj-trial-btn" class="wargame-action-btn success"   type="button">Run trial (12)</button>
                    <button id="wg-adj-reset-btn" class="wargame-action-btn secondary" type="button">Reset</button>
                </div>
                <div class="wg-adj-form-grid">
                    <label for="wg-adj-pace-ms" class="wg-adj-label">Step&nbsp;pace</label>
                    <div class="wg-adj-input-suffix">
                        <input id="wg-adj-pace-ms" class="wg-adj-input" type="number" value="1200" min="0" max="10000" step="100" />
                        <span class="wg-adj-unit">ms</span>
                    </div>
                </div>
            </div>

            <!-- ── Monte Carlo ── -->
            <div class="wg-adj-section">
                <div class="wg-adj-section-title">Monte Carlo</div>
                <div class="wg-adj-form-grid wg-adj-form-grid--tight">
                    <label for="wg-adj-mc-trials" class="wg-adj-label">MC trials</label>
                    <input id="wg-adj-mc-trials" class="wg-adj-input" type="number" value="3" min="1" max="100" step="1" />

                    <label for="wg-adj-mc-par" class="wg-adj-label">Parallel</label>
                    <input id="wg-adj-mc-par" class="wg-adj-input" type="number" value="2" min="1" max="8" step="1" />
                </div>
                <div class="wg-adj-btn-row wg-adj-btn-row--2">
                    <button id="wg-adj-mc-btn"     class="wargame-action-btn primary"   type="button">Run Monte Carlo</button>
                    <button id="wg-adj-mc-cancel"  class="wargame-action-btn secondary" type="button" disabled>Cancel</button>
                </div>
            </div>

            <div id="wg-adj-timeline" class="wargame-status-block" style="margin-top:8px; padding:6px 4px; display:none;">
                <div style="font-size:11px;color:#bbb;margin-bottom:4px;">Operation timeline</div>
                <div id="wg-adj-timeline-strip" style="display:flex;gap:2px;flex-wrap:wrap;"></div>
            </div>

            <div id="wg-adj-step-display" class="wargame-status-block" style="margin-top:8px; display:none;">
                <div id="wg-adj-step-summary" style="font-size:13px; line-height:1.5;"></div>
                <div id="wg-adj-bls-line" style="margin-top:4px; font-size:12px; color:#888;"></div>

                <div style="margin-top:10px;border-top:1px solid #2a3140;padding-top:8px;">
                    <div style="font-size:11px;color:#9ab;letter-spacing:.05em;text-transform:uppercase;margin-bottom:3px;">السرد &middot; AR</div>
                    <div id="wg-adj-narrative-ar" dir="rtl" lang="ar"
                         style="font-size:14px;line-height:1.75;text-align:right;
                                font-family:'Segoe UI', 'Tahoma', 'Arial', sans-serif;
                                color:#e6e6e6;background:#0e1623;padding:8px 10px;border-radius:4px;
                                border-right:3px solid #3a96d2;"></div>
                </div>

                <div style="margin-top:8px;">
                    <div style="font-size:11px;color:#9ab;letter-spacing:.05em;text-transform:uppercase;margin-bottom:3px;">Narrative &middot; EN</div>
                    <div id="wg-adj-narrative-en"
                         style="font-size:12px;line-height:1.55;color:#ccc;
                                background:#0e1623;padding:8px 10px;border-radius:4px;
                                border-left:3px solid #888;"></div>
                </div>

                <div id="wg-adj-charts" style="margin-top:10px;padding-top:8px;border-top:1px solid #2a3140;display:none;">
                    <div style="font-size:11px;color:#9ab;letter-spacing:.05em;text-transform:uppercase;margin-bottom:4px;">Trajectory</div>
                    <div id="wg-adj-charts-row" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;"></div>
                </div>

                <div id="wg-adj-validation" style="margin-top:6px; font-size:11px; color:#a87;"></div>
            </div>

            <div id="wg-adj-mc-panel" style="display:none; margin-top:8px;">
                <div class="wargame-feed-head" style="background:#1c2230;">
                    <span>Monte Carlo run</span>
                    <span id="wg-adj-mc-pill" class="wargame-state-pill is-active">starting…</span>
                </div>
                <div id="wg-adj-mc-progress" class="wargame-status-block" style="font-size:12px;"></div>
                <div id="wg-adj-mc-outcome" style="margin-top:6px; font-size:12px;"></div>
            </div>

            <div class="wargame-control-footer">
                <span>Adjudicator computes losses + force ratio + BLS + EW + Arabic narrative per step.
                Wargame2 scenario default. Mock mode skips Ollama and uses scenario baselines.</span>
            </div>
        `;
    }

    // ── DOM helpers ──────────────────────────────────────────────────
    function $(id) { return document.getElementById(id); }
    function setPill(el, kind, text) {
        el.classList.remove('is-idle', 'is-active', 'is-error', 'is-ok');
        el.classList.add('is-' + kind);
        el.textContent = text;
    }
    function setStatus(msg, kind) {
        const pill = $('wg-adj-pill');
        if (pill) setPill(pill, kind || 'idle', text => kind === 'ok' ? 'Ready' : kind === 'active' ? 'Working…' : kind === 'error' ? 'Error' : 'Idle');
        if (kind === 'ok')      setPill(pill, 'ok', 'Ready');
        if (kind === 'active')  setPill(pill, 'active', 'Working…');
        if (kind === 'error')   setPill(pill, 'error', 'Error');
        if (kind === 'idle')    setPill(pill, 'idle', 'Idle');
        const box = $('wg-adj-status');
        if (box) box.textContent = msg;
    }

    // ── Scenario list ────────────────────────────────────────────────
    async function loadScenarios() {
        const result = await window.AppAdjudicator.scenarios();
        const sel = $('wg-adj-scenario');
        sel.innerHTML = '';
        if (!result.ok) {
            setStatus('Could not load scenarios: ' + (result.error || 'unknown'), 'error');
            return;
        }
        for (const name of result.scenarios) {
            const opt = document.createElement('option');
            opt.value = name; opt.textContent = name;
            if (name === result.default) opt.selected = true;
            sel.appendChild(opt);
        }
        setStatus('Ready. Mock mode is on — toggle off to use live Ollama.', 'idle');
    }

    async function ensureScenarioLoaded() {
        const name = $('wg-adj-scenario').value || SCENARIO_DEFAULT;
        if (scenarioCache && scenarioCache.name === name) return scenarioCache;
        const r = await window.AppAdjudicator.scenario(name);
        if (!r.ok) { setStatus('Could not load scenario JSON: ' + (r.error || 'unknown'), 'error'); return null; }
        scenarioCache = r.scenario;
        return scenarioCache;
    }

    async function showScenarioOnMap() {
        const sc = await ensureScenarioLoaded();
        if (!sc) return;
        if (!window.AppAdjudicatorMap || !window.AppAdjudicatorMap.drawScenario(sc)) {
            setStatus('Map overlay unavailable (window.map not ready?)', 'error');
            return;
        }
        setStatus('Scenario drawn on map. BLS dots, OBJ NASSER, pipeline, Red units placed.', 'ok');
    }

    function hideScenarioFromMap() {
        if (window.AppAdjudicatorMap) window.AppAdjudicatorMap.clearScenario();
        setStatus('Scenario hidden from map.', 'idle');
    }

    // ── Sparkline charts (Blue dead, Red coy-eq, Phase line) ─────────
    function sparkline(values, maxY, color, currentIdx, label, unit) {
        const W = 140, H = 50, PAD = 4;
        const usableW = W - 2 * PAD;
        const usableH = H - 2 * PAD - 12;  // leave 12 px for label
        const maxIdx = 11;
        if (!values.length) return '';
        const path = values.map((v, i) => {
            const x = PAD + (i / maxIdx) * usableW;
            const y = PAD + 12 + usableH - (Math.max(0, Math.min(maxY, v)) / maxY) * usableH;
            return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
        }).join(' ');

        const dots = values.map((v, i) => {
            const x = PAD + (i / maxIdx) * usableW;
            const y = PAD + 12 + usableH - (Math.max(0, Math.min(maxY, v)) / maxY) * usableH;
            const r = i === currentIdx ? 3 : 1.5;
            const fill = i === currentIdx ? '#fff' : color;
            return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${fill}" stroke="${color}" stroke-width="1"/>`;
        }).join('');

        const latest = values[values.length - 1];
        return `
            <div style="background:#0e1623;border-radius:3px;padding:4px;">
                <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;">
                    <text x="${PAD}" y="10" fill="#9ab" font-size="9" font-family="sans-serif">${label}</text>
                    <text x="${W - PAD}" y="10" fill="#fff" font-size="9" font-family="sans-serif" text-anchor="end" font-weight="700">${latest}${unit || ''}</text>
                    <line x1="${PAD}" y1="${H - PAD}" x2="${W - PAD}" y2="${H - PAD}" stroke="#2a3140" stroke-width="1"/>
                    <path d="${path}" fill="none" stroke="${color}" stroke-width="1.5"/>
                    ${dots}
                </svg>
            </div>
        `;
    }

    function renderCharts(history) {
        const wrap = $('wg-adj-charts');
        const row  = $('wg-adj-charts-row');
        if (!wrap || !row) return;
        if (!history.length) { wrap.style.display = 'none'; return; }
        wrap.style.display = '';
        const blueVals = history.map(h => (h.state && h.state.losses_cumulative && h.state.losses_cumulative.blue_destroyed) || 0);
        const redVals  = history.map(h => (h.state && h.state.losses_cumulative && h.state.losses_cumulative.red_company_equivalent) || 0);
        const plVals   = history.map(h => (h.state && h.state.phase_line_km) || 0);
        const curIdx = history.length - 1;
        row.innerHTML =
              sparkline(blueVals, 39,  '#3a96d2', curIdx, 'Blue dead',    '/39')
            + sparkline(redVals,  10,  '#d23a3a', curIdx, 'Red coy-eq',   '/10')
            + sparkline(plVals,   100, '#e8a23a', curIdx, 'Phase line',   ' km');
    }

    // ── Timeline strip: 12 cells, one per step. Cells become clickable
    // once their step has been resolved (i.e. is present in trial.history).
    // Clicking a past cell scrubs the side panel + map back to that step.
    function renderTimeline(currentStepIndex, currentObjStatus) {
        const wrap = $('wg-adj-timeline');
        const strip = $('wg-adj-timeline-strip');
        if (!wrap || !strip) return;
        wrap.style.display = '';
        const labels = ['D-3h','H','H+2','H+6','H+12','H+24','H+36','H+48','H+72','H+96','H+120','H+144'];
        const phases = ['PRE','P1','P1','P2A','P2A','P2A','P2B','P2B','P3','P3','P3','RES'];
        const objColor = {
            DORMANT:'#445',     THREATENED:'#c9852e', CONTESTED:'#b07020',
            CAPTURED:'#b73a3a', DENIED:'#3a7fb7',     '__future':'#22293a',
        };
        // Build a quick lookup of resolved steps -> their objective_status
        const resolvedByIdx = {};
        const history = (trial && trial.history) || [];
        for (const h of history) {
            if (h && h.state) resolvedByIdx[h.state.step_index] = h.state.objective_status;
        }
        const cells = [];
        for (let i = 0; i < 12; i++) {
            const isResolved = (i in resolvedByIdx);
            const isCurrent  = i === currentStepIndex;
            const objAtI     = resolvedByIdx[i];
            const bg = isCurrent ? (objColor[currentObjStatus] || '#3a96d2')
                     : isResolved ? (objColor[objAtI] || '#2a3a52')
                                  : objColor.__future;
            const border = isCurrent ? '2px solid #fff' : '1px solid #1a2030';
            const cursor = isResolved ? 'pointer' : 'default';
            const hoverEffect = isResolved && !isCurrent ? 'opacity:.85;' : '';
            cells.push(`
                <div data-step="${i}" title="Step ${i} — ${labels[i]} (${phases[i]})${isResolved ? ' — click to scrub' : ''}" style="
                    flex:1;min-width:14px;height:30px;background:${bg};
                    border:${border};border-radius:2px;cursor:${cursor};${hoverEffect}
                    display:flex;flex-direction:column;align-items:center;justify-content:center;
                    font-size:8px;color:#cdd;font-weight:${isCurrent ? 700 : 400};
                    ${isCurrent ? 'box-shadow:0 0 4px rgba(58,150,210,.6);' : ''}
                ">
                    <div>${labels[i]}</div>
                    <div style="opacity:.6;">${phases[i]}</div>
                </div>
            `);
        }
        strip.innerHTML = cells.join('');
        // (Re-)wire click handlers via event delegation. Clicks on resolved
        // cells call scrubToStep(idx) to rewind the visualization.
        strip.onclick = (e) => {
            const cell = e.target.closest('[data-step]');
            if (!cell) return;
            const idx = Number(cell.getAttribute('data-step'));
            if (!Number.isInteger(idx)) return;
            if (idx in resolvedByIdx) scrubToStep(idx);
        };
    }

    // Rewind the visualization to step `idx`. Resets the map, then walks
    // trial.history[1..idx] re-applying each delta so cumulative state
    // (destroyed Blues, BLS colors, pipeline fill) lands at the right point.
    function scrubToStep(idx) {
        if (!trial || !trial.history || !window.AppAdjudicatorMap) return;
        const target = trial.history.find(h => h.state && h.state.step_index === idx);
        if (!target) return;

        window.AppAdjudicatorMap.resetMap();
        // Re-apply every resolved step from 1..idx so the map's cumulative
        // state matches the chosen frame. Step 0 is the seed (no deltas).
        for (const h of trial.history) {
            if (!h.state || h.state.step_index === 0) continue;
            if (h.state.step_index > idx) break;
            window.AppAdjudicatorMap.applyState(h.state, scenarioCache);
        }
        // Now render the side panel from the target frame.
        renderSidePanelOnly(target.state, target.validation, target.meta);
        setStatus(`Scrubbed to step ${idx} (${target.state.time_label}).`, 'idle');
    }

    // Like renderStep() but without re-pushing to the map (the scrubber has
    // already walked the map state forward). Avoids double-applying.
    function renderSidePanelOnly(state, validation, meta) {
        $('wg-adj-step-display').style.display = '';
        renderTimeline(state.step_index, state.objective_status);
        const blsLine = Object.entries(state.bls_status || {})
            .map(([k, v]) => `${k}·${v.slice(0, 3)}`).join(' ');
        const fallback = (validation && validation.fallback) ? ` [${validation.fallback}]` : '';
        $('wg-adj-step-summary').innerHTML = `
            <strong>Step ${state.step_index} — ${state.time_label} — ${state.phase}${fallback}</strong><br>
            PL: ${state.phase_line_km} km · FR: ${escapeHtml(state.force_ratio)} · OBJ: ${state.objective_status}<br>
            EW: ${state.ew_effect} · Logistics: ${escapeHtml(state.logistics_state)} · Decision: ${escapeHtml(state.decision_point)}<br>
            Losses: Blue ${state.losses_cumulative.blue_destroyed}/${state.losses_cumulative.blue_total} · Red coy-eq ${state.losses_cumulative.red_company_equivalent}
        `;
        $('wg-adj-bls-line').textContent = blsLine;
        $('wg-adj-narrative-en').textContent = state.narrative_en || '';
        $('wg-adj-narrative-ar').textContent = state.narrative_ar || '';
        const warns = [];
        if (meta && meta.durationMs != null) warns.push(`${Math.round(meta.durationMs)} ms`);
        if (meta && meta.model) warns.push(meta.model);
        $('wg-adj-validation').textContent = warns.join(' · ');
        if (trial && trial.history && trial.history.length) {
            renderCharts(trial.history);
        }
    }

    // ── Render one step's state into the display block + map ─────────
    function renderStep(state, validation, meta) {
        $('wg-adj-step-display').style.display = '';
        renderTimeline(state.step_index, state.objective_status);
        const blsLine = Object.entries(state.bls_status || {})
            .map(([k, v]) => `${k}·${v.slice(0, 3)}`).join(' ');
        const fallback = (validation && validation.fallback) ? ` [${validation.fallback}]` : '';
        $('wg-adj-step-summary').innerHTML = `
            <strong>Step ${state.step_index} — ${state.time_label} — ${state.phase}${fallback}</strong><br>
            PL: ${state.phase_line_km} km · FR: ${escapeHtml(state.force_ratio)} · OBJ: ${state.objective_status}<br>
            EW: ${state.ew_effect} · Logistics: ${escapeHtml(state.logistics_state)} · Decision: ${escapeHtml(state.decision_point)}<br>
            Losses: Blue ${state.losses_cumulative.blue_destroyed}/${state.losses_cumulative.blue_total} · Red coy-eq ${state.losses_cumulative.red_company_equivalent}
        `;
        $('wg-adj-bls-line').textContent = blsLine;
        $('wg-adj-narrative-en').textContent = state.narrative_en || '';
        $('wg-adj-narrative-ar').textContent = state.narrative_ar || '';
        const warns = [];
        if (validation && validation.clamped_fields && validation.clamped_fields.length) {
            warns.push(`clamped: ${validation.clamped_fields.join(', ')}`);
        }
        if (validation && validation.doctrinal_warnings && validation.doctrinal_warnings.length) {
            warns.push(`${validation.doctrinal_warnings.length} doctrinal warning(s)`);
        }
        if (meta && meta.durationMs != null) warns.push(`${Math.round(meta.durationMs)} ms`);
        if (meta && meta.model) warns.push(meta.model);

        // Push the state into the map overlay. If the scenario hasn't been
        // drawn yet, draw it first so the overlays exist for applyState.
        if (window.AppAdjudicatorMap && scenarioCache) {
            if (!document.querySelector('.leaflet-marker-icon.wg-adj-obj')) {
                window.AppAdjudicatorMap.drawScenario(scenarioCache);
            }
            const r = window.AppAdjudicatorMap.applyState(state, scenarioCache);
            if (r && r.missed && r.missed.length) {
                warns.push(`unmatched on map: ${r.missed.join(', ')}`);
            }
        }
        $('wg-adj-validation').textContent = warns.join(' · ');

        // Trajectory sparklines (Blue dead / Red coy-eq / Phase line) — built
        // from the trial's full step history so the operator sees the shape
        // of the campaign, not just the current frame.
        if (trial && trial.history && trial.history.length) {
            renderCharts(trial.history);
        }
    }

    function escapeHtml(s) {
        if (s == null) return '';
        return String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
    }

    // ── Read the current COA + scenario from the form ────────────────
    function currentRequest() {
        return {
            scenarioName: $('wg-adj-scenario').value || SCENARIO_DEFAULT,
            model:        ($('wg-adj-model').value || '').trim() || null,
            mockMode:     $('wg-adj-mock').checked,
            coaParams: {
                reserve_commit_hour: Number($('wg-adj-coa-reserve').value || 72),
                posture:             $('wg-adj-coa-posture').value,
                main_effort_axis:    'BLS-3',
            },
            trialSeed: ($('wg-adj-seed').value || 'manual').trim() || 'manual',
        };
    }

    // ── Single-step ──────────────────────────────────────────────────
    async function adjudicateNext() {
        if (!trial) trial = window.AppScenarioState.create({ scenarioName: SCENARIO_DEFAULT });
        const req = currentRequest();
        const nextIndex = (trial.stepIndex || 0) + 1;
        if (nextIndex > 11) {
            setStatus('Trial complete at step 11. Click Reset to start a new trial.', 'idle');
            return;
        }
        setStatus(`Adjudicating step ${nextIndex}…`, 'active');
        const body = {
            scenarioName: req.scenarioName,
            stepIndex:    nextIndex,
            prevState:    trial.currentState,
            trialId:      'manual',
            trialSeed:    req.trialSeed,
            trialHintId:  0,
            coaParams:    req.coaParams,
            model:        req.model,
            mockMode:     req.mockMode,
        };
        const t0 = Date.now();
        const r = await window.AppAdjudicator.adjudicateStep(body);
        const wall = Date.now() - t0;
        if (!r || !r.state) {
            setStatus(`Step ${nextIndex} failed: ${r && r.error}`, 'error');
            return;
        }
        window.AppScenarioState.applyDelta(trial, r);
        renderStep(r.state, r.validation, { ...r.meta, durationMs: r.meta && r.meta.durationMs || wall });
        const tag = r.ok ? '' : ` [fallback: ${r.validation && r.validation.fallback}]`;
        setStatus(`Step ${nextIndex} resolved in ${wall} ms${tag}.`, r.ok ? 'ok' : 'error');
    }

    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    // ── Walk all 12 steps in sequence ────────────────────────────────
    async function runOneTrial() {
        if (!trial) trial = window.AppScenarioState.create({ scenarioName: SCENARIO_DEFAULT });
        window.AppScenarioState.reset(trial);
        if (window.AppAdjudicatorMap) window.AppAdjudicatorMap.resetMap();
        const req = currentRequest();
        const paceMs = Math.max(0, Number(($('wg-adj-pace-ms') && $('wg-adj-pace-ms').value) || 1200));
        for (let i = 1; i <= 11; i++) {
            setStatus(`Trial step ${i}/11…`, 'active');
            const body = {
                scenarioName: req.scenarioName,
                stepIndex:    i,
                prevState:    trial.currentState,
                trialId:      'trial-' + req.trialSeed,
                trialSeed:    req.trialSeed + ':t0',
                trialHintId:  0,
                coaParams:    req.coaParams,
                model:        req.model,
                mockMode:     req.mockMode,
            };
            const r = await window.AppAdjudicator.adjudicateStep(body);
            if (!r || !r.state) {
                setStatus(`Trial aborted at step ${i}: ${r && r.error}`, 'error');
                return;
            }
            window.AppScenarioState.applyDelta(trial, r);
            renderStep(r.state, r.validation, r.meta);
            // Pace the playback so map effects (BLS color shifts, Blue
            // squares fading, phase-line creep) are visible step by step.
            // In mock mode each call is ~5 ms; without this delay you'd
            // never see the progression. In live Ollama mode each step is
            // already ~100 s so paceMs adds little.
            if (i < 11 && paceMs > 0) await sleep(paceMs);
        }
        const fallbacks = window.AppScenarioState.fallbackCount(trial);
        setStatus(`Trial complete — ${fallbacks} fallback step(s).`, 'ok');
    }

    function resetTrial() {
        if (trial) window.AppScenarioState.reset(trial);
        $('wg-adj-step-display').style.display = 'none';
        const tl = $('wg-adj-timeline');
        if (tl) tl.style.display = 'none';
        const ch = $('wg-adj-charts');
        if (ch) ch.style.display = 'none';
        if (window.AppAdjudicatorMap) window.AppAdjudicatorMap.resetMap();
        setStatus('Trial reset. Step 0 (D-3h). Map markers restored.', 'idle');
    }

    // ── Monte Carlo ──────────────────────────────────────────────────
    async function startMc() {
        const req = currentRequest();
        const body = {
            scenarioName: req.scenarioName,
            trials:       Math.max(1, Math.min(100, Number($('wg-adj-mc-trials').value || 3))),
            parallelism:  Math.max(1, Math.min(8, Number($('wg-adj-mc-par').value || 2))),
            coaParams:    req.coaParams,
            model:        req.model,
            mockMode:     req.mockMode,
        };
        setStatus(`Starting Monte Carlo (${body.trials} trials, parallelism ${body.parallelism})…`, 'active');
        const r = await window.AppAdjudicator.mcStart(body);
        if (!r.ok) { setStatus('MC failed to start: ' + (r.error || 'unknown'), 'error'); return; }
        activeRunId = r.runId;
        window.AppAdjudicator.setMcRunning(true);
        $('wg-adj-mc-panel').style.display = '';
        $('wg-adj-mc-cancel').disabled = false;
        $('wg-adj-mc-btn').disabled = true;
        $('wg-adj-mc-progress').textContent = `Run ${r.runId} — waiting for first event…`;
        $('wg-adj-mc-outcome').textContent = '';
        const outcomes = { CAPTURED: 0, DENIED: 0, THREATENED_terminal: 0, DORMANT_terminal: 0, other: 0 };
        let progress = 0;
        const expected = body.trials * 11;

        mcRunSubscription = window.AppAdjudicator.mcSubscribe(r.runId, (evt, data) => {
            if (evt === 'progress') {
                progress++;
                $('wg-adj-mc-progress').textContent = `Trial ${data.trial} step ${data.step}/11 — PL ${data.phase_line_km} km, OBJ ${data.objective_status} (${progress}/${expected})`;
            } else if (evt === 'trial-done') {
                const cls = data.final_objective_status === 'CAPTURED' ? 'CAPTURED'
                          : data.final_objective_status === 'DENIED'    ? 'DENIED'
                          : data.final_objective_status === 'THREATENED'? 'THREATENED_terminal'
                          : data.final_objective_status === 'DORMANT'   ? 'DORMANT_terminal' : 'other';
                outcomes[cls] = (outcomes[cls] || 0) + 1;
                renderOutcomes(outcomes, body.trials);
            } else if (evt === 'done') {
                $('wg-adj-mc-progress').textContent = `Run complete (${data.trialsCompleted}/${data.trialsRequested} trials, ${data.durationMs} ms wall).`;
                setPill($('wg-adj-mc-pill'), 'ok', 'Done');
                window.AppAdjudicator.setMcRunning(false);
                $('wg-adj-mc-cancel').disabled = true;
                $('wg-adj-mc-btn').disabled = false;
                renderOutcomes(data.outcomeCounts, data.trialsCompleted);
                if (mcRunSubscription) { mcRunSubscription.close(); mcRunSubscription = null; }
                setStatus(`Monte Carlo complete: ${formatOutcomeSummary(data.outcomeCounts, data.trialsCompleted)}`, 'ok');
            } else if (evt === 'error') {
                setStatus('MC error: ' + (data.msg || JSON.stringify(data)), 'error');
            }
        });
    }

    function renderOutcomes(counts, total) {
        const order = ['CAPTURED', 'DENIED', 'THREATENED_terminal', 'DORMANT_terminal', 'other'];
        const lines = order.map(k => {
            const n = counts[k] || 0;
            if (!n && k === 'other') return null;
            const pct = total ? Math.round((n / total) * 100) : 0;
            const bar = '█'.repeat(Math.round((pct / 100) * 20));
            return `${k.padEnd(20, ' ')} ${String(n).padStart(3, ' ')}  ${bar} ${pct}%`;
        }).filter(Boolean).join('\n');
        $('wg-adj-mc-outcome').innerHTML = `<pre style="margin:0; font-size:11px; color:#cdd;">${lines}</pre>`;
    }

    function formatOutcomeSummary(counts, total) {
        const parts = [];
        for (const k of ['CAPTURED','DENIED','THREATENED_terminal']) {
            const n = counts[k] || 0;
            if (n) parts.push(`${k}: ${n}/${total}`);
        }
        return parts.join(', ');
    }

    async function cancelMc() {
        if (!activeRunId) return;
        await window.AppAdjudicator.mcCancel(activeRunId);
        if (mcRunSubscription) { mcRunSubscription.close(); mcRunSubscription = null; }
        window.AppAdjudicator.setMcRunning(false);
        $('wg-adj-mc-cancel').disabled = true;
        $('wg-adj-mc-btn').disabled = false;
        setPill($('wg-adj-mc-pill'), 'error', 'Cancelled');
        setStatus('Monte Carlo cancelled.', 'idle');
    }

    // ── Wire buttons ─────────────────────────────────────────────────
    function bindHandlers(root) {
        root.querySelector('#wg-adj-map-btn').addEventListener('click', showScenarioOnMap);
        root.querySelector('#wg-adj-map-clear').addEventListener('click', hideScenarioFromMap);
        root.querySelector('#wg-adj-step-btn').addEventListener('click', async () => { await ensureScenarioLoaded(); adjudicateNext(); });
        root.querySelector('#wg-adj-trial-btn').addEventListener('click', async () => { await ensureScenarioLoaded(); runOneTrial(); });
        root.querySelector('#wg-adj-reset-btn').addEventListener('click', resetTrial);
        root.querySelector('#wg-adj-mc-btn').addEventListener('click', startMc);
        root.querySelector('#wg-adj-mc-cancel').addEventListener('click', cancelMc);
    }

    // ── Boot ─────────────────────────────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
