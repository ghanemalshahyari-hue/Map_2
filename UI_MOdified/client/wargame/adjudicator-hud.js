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
    let aiHealth = null;       // last /api/ai/health probe: { ok, url, defaultModel, models?, error? }
    let lastRunMode = null;    // 'mock' | 'live' | 'fallback' — last adjudicate response's actual run mode

    // item #9 — feedback button state. Tracks the step the buttons currently
    // refer to and which steps already have feedback this session so the
    // same step can't be double-posted (server is idempotent but the UX
    // should still reflect already-recorded).
    let currentFeedbackStep = null;
    const feedbackSentThisSession = new Set();   // key: `${scenarioName}#${stepIndex}`
    function feedbackKey(stepIndex) {
        const sc = $('wg-adj-scenario') && $('wg-adj-scenario').value || SCENARIO_DEFAULT;
        return `${sc}#${stepIndex}`;
    }

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
        // Publish the next-step accessor so red-team-controller.js can
        // record approved actions against the right step (todo item #7).
        if (window.AppAdjudicator) {
            window.AppAdjudicator.getCurrentStepIndex = () => (trial && trial.stepIndex) || 0;
            window.AppAdjudicator.getNextStepIndex    = () => Math.min(11, ((trial && trial.stepIndex) || 0) + 1);
        }
        loadScenarios().then(autoDrawWhenReady);
        // Probe the AI backend so the Mock toggle and status row reflect
        // reality at boot — and the user knows up-front whether trials will
        // actually use the LLM or fall back to baseline.
        probeAiHealth();
        // Initial preview render — empty unless approvals are already cached.
        renderApprovedPreview();
        // Auto-refresh the preview when approvals change anywhere in the page.
        document.addEventListener('wargame:approved-actions-changed', renderApprovedPreview);
    }

    // ── AI backend health probe (items 1+2+3) ────────────────────────
    // Calls /api/ai/health, updates the setup row, and chooses the Mock
    // toggle default. The probe is fire-and-forget: an unreachable backend
    // just degrades the UI to "Mock required" without breaking the rest.
    async function probeAiHealth() {
        try {
            const res = await fetch('/api/ai/health');
            const body = await res.json().catch(() => null);
            aiHealth = body || { ok: false, error: 'no body' };
        } catch (e) {
            aiHealth = { ok: false, error: (e && e.message) || String(e) };
        }
        renderBackendRow();
        // Default Mock OFF when backend is up (so trials actually exercise
        // the LLM); ON + disabled when backend is down (so trials still run
        // but no surprise ECONNREFUSED at every step).
        const mockEl = $('wg-adj-mock');
        if (mockEl) {
            if (aiHealth.ok) {
                mockEl.checked  = false;
                mockEl.disabled = false;
            } else {
                mockEl.checked  = true;
                mockEl.disabled = true;
            }
        }
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

            <!-- ── AI backend health + last-run mode ── -->
            <div id="wg-adj-backend-row" style="display:flex;align-items:center;gap:8px;font-size:11px;color:#cdd;margin:4px 2px 2px;">
                <span id="wg-adj-backend-dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#888;"></span>
                <span id="wg-adj-backend-text" style="flex:1;">Checking backend…</span>
                <button id="wg-adj-backend-refresh" type="button" title="Re-probe AI backend"
                    style="background:transparent;border:none;color:#9ab;cursor:pointer;font-size:12px;padding:0 4px;">&#8635;</button>
                <span id="wg-adj-mode-chip" class="wargame-state-pill is-idle" style="font-size:10px;padding:1px 8px;">Mode: —</span>
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
                    <span id="wg-adj-mock-label">Mock mode (no Ollama) — replays scenario baseline</span>
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

            <!-- Pending approved actions for the next adjudicate step.
                 Populated by red-team-controller.js's Execute clicks via
                 AppApprovedActions; consumed and cleared inside
                 adjudicateNext() once shipped to the server. (todo #7) -->
            <div id="wg-adj-approved-preview" style="display:none;margin-top:6px;padding:6px 8px;
                background:#0e1623;border-left:3px solid #ffc94a;border-radius:3px;
                font-size:11px;color:#cdd;">
                <div style="font-size:10px;color:#9ab;letter-spacing:.05em;text-transform:uppercase;margin-bottom:4px;">
                    Approved actions for next step
                </div>
                <div id="wg-adj-approved-list"></div>
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

                <!-- Operator feedback row (item #9). Three buttons + a
                     status line. Disabled once feedback has been recorded
                     for the current step so the operator can't double-post. -->
                <div id="wg-adj-feedback-row" style="margin-top:8px;padding-top:8px;border-top:1px solid #2a3140;
                    display:none;align-items:center;gap:6px;font-size:11px;">
                    <span style="color:#9ab;letter-spacing:.04em;text-transform:uppercase;font-size:10px;">
                        Was this step right?
                    </span>
                    <button id="wg-adj-fb-accept" type="button"
                        class="wargame-action-btn success"
                        style="padding:2px 8px;font-size:11px;">&#10003; Accept</button>
                    <button id="wg-adj-fb-reject" type="button"
                        class="wargame-action-btn secondary"
                        style="padding:2px 8px;font-size:11px;background:#7a2a2a;">&#10007; Reject</button>
                    <button id="wg-adj-fb-note" type="button"
                        class="wargame-action-btn secondary"
                        style="padding:2px 8px;font-size:11px;" title="Add a free-text note about this step">&#9998; Note</button>
                    <span id="wg-adj-fb-status" style="color:#9ab;margin-left:6px;"></span>
                </div>
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

    // ── Backend row + mode chip rendering (items 1+2+3) ──────────────
    function renderBackendRow() {
        const dot   = $('wg-adj-backend-dot');
        const text  = $('wg-adj-backend-text');
        const label = $('wg-adj-mock-label');
        if (!dot || !text) return;
        if (!aiHealth) {
            dot.style.background = '#888';
            text.textContent     = 'Checking backend…';
            return;
        }
        if (aiHealth.ok) {
            dot.style.background = '#4caf50';
            const style = aiHealth.apiStyle ? aiHealth.apiStyle + ' · ' : '';
            text.innerHTML = `Live AI ready · ${style}${escapeHtml(aiHealth.defaultModel || '(default)')} @ ${escapeHtml(aiHealth.url || '?')}`;
            if (label) label.textContent = 'Mock mode (skip LLM, replay scenario baseline)';
        } else {
            dot.style.background = '#d23a3a';
            const err = aiHealth.error || 'unreachable';
            text.innerHTML = `Backend offline · ${escapeHtml(aiHealth.url || '?')} — <span style="color:#e8a23a;">${escapeHtml(err)}</span>`;
            if (label) label.textContent = 'Mock mode (backend offline — required for trials)';
        }
    }

    // Classify one adjudicate response into a mode label + pill kind.
    //   - validation.mocked === true                → 'mock'
    //   - r.ok && !mocked                           → 'live'
    //   - !r.ok or validation.fallback present      → 'fallback'
    function classifyRun(r) {
        const mocked   = !!(r && r.validation && r.validation.mocked);
        const fallback = (r && r.validation && r.validation.fallback) || (r && r.meta && r.meta.fallback);
        if (mocked)      return { mode: 'mock',     label: 'Mock', kind: 'idle' };
        if (fallback)    return { mode: 'fallback', label: 'Fallback · ' + fallback, kind: 'error' };
        if (r && r.ok)   return { mode: 'live',     label: 'Live · ' + ((r.meta && r.meta.model) || '(model)'), kind: 'ok' };
        return { mode: 'idle', label: '—', kind: 'idle' };
    }

    function setLastMode(r) {
        const chip = $('wg-adj-mode-chip');
        if (!chip) return;
        const c = classifyRun(r);
        lastRunMode = c.mode;
        chip.classList.remove('is-idle', 'is-active', 'is-error', 'is-ok');
        chip.classList.add('is-' + c.kind);
        chip.textContent = 'Mode: ' + c.label;
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
        // item #9 — scrubber should let the operator grade older steps too.
        showFeedbackRow(state.step_index);
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

        // item #9 — make the feedback row visible/refreshed for this step.
        showFeedbackRow(state.step_index);
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

    // ── Operator feedback row (todo item #9) ────────────────────────
    // Shown after a step has been adjudicated. Click → POST to the server.
    // Re-clicks on already-graded steps short-circuit on the client.
    function showFeedbackRow(stepIndex) {
        const row = $('wg-adj-feedback-row');
        if (!row) return;
        // Step 0 is the seed — no LLM call, nothing for the operator to
        // grade. Hide the row so we don't pretend otherwise.
        if (stepIndex === 0) { hideFeedbackRow(); return; }
        currentFeedbackStep = stepIndex;
        row.style.display = 'flex';
        const sent = feedbackSentThisSession.has(feedbackKey(stepIndex));
        const setBtn = (id, disabled) => {
            const b = $(id);
            if (!b) return;
            b.disabled = !!disabled;
            b.style.opacity = disabled ? '0.5' : '1';
            b.style.cursor  = disabled ? 'not-allowed' : 'pointer';
        };
        setBtn('wg-adj-fb-accept', sent);
        setBtn('wg-adj-fb-reject', sent);
        setBtn('wg-adj-fb-note',   false);   // notes are stackable
        const st = $('wg-adj-fb-status');
        if (st) st.textContent = sent ? `Recorded for step ${stepIndex}.` : '';
    }
    function hideFeedbackRow() {
        const row = $('wg-adj-feedback-row');
        if (row) row.style.display = 'none';
        currentFeedbackStep = null;
    }
    async function postFeedback(decision) {
        if (currentFeedbackStep == null) return;
        const stepIndex = currentFeedbackStep;
        const key = feedbackKey(stepIndex);
        // Only block a SECOND accept/reject — a stacked note is fine.
        if (decision !== 'note' && feedbackSentThisSession.has(key)) return;
        let note = null;
        if (decision === 'note' || decision === 'reject') {
            const msg = decision === 'reject'
                ? `Why is step ${stepIndex} wrong? (optional, max 500 chars)`
                : `Add a note about step ${stepIndex} (optional, max 500 chars)`;
            const v = window.prompt(msg, '');
            if (v == null) return;  // operator cancelled
            note = v.trim().slice(0, 500) || null;
        }
        const req = currentRequest();
        const body = {
            scenarioName: req.scenarioName,
            stepIndex,
            decision,
            trialId:   (trial && trial.scenarioName) ? `manual-${trial.startedAt || ''}` : 'manual',
            coaParams: req.coaParams,
            provider:  (aiHealth && aiHealth.apiStyle) || null,
            model:     req.model || (aiHealth && aiHealth.defaultModel) || null,
            note,
        };
        const st = $('wg-adj-fb-status');
        if (st) st.textContent = 'sending…';
        try {
            const res = await fetch('/api/ai/feedback', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify(body),
            });
            const r = await res.json().catch(() => ({ ok: false }));
            if (r.ok) {
                if (decision !== 'note') feedbackSentThisSession.add(key);
                if (st) st.textContent = decision === 'note'
                    ? `Note recorded for step ${stepIndex}.`
                    : `${decision === 'accept' ? 'Accepted' : 'Rejected'} step ${stepIndex}.`;
                // Refresh the accept/reject button state.
                showFeedbackRow(stepIndex);
            } else {
                if (st) st.textContent = `Failed: ${(r && r.error) || 'unknown'}`;
            }
        } catch (e) {
            if (st) st.textContent = `Failed: ${(e && e.message) || 'network'}`;
        }
    }

    // ── Approved actions preview (todo item #7) ─────────────────────
    // Reads from AppApprovedActions and shows what's pending for the
    // next step. Called at boot, before each adjudicateNext(), and
    // after each consumption.
    function renderApprovedPreview() {
        const wrap = $('wg-adj-approved-preview');
        const list = $('wg-adj-approved-list');
        if (!wrap || !list) return;
        const store = window.AppApprovedActions;
        if (!store) { wrap.style.display = 'none'; return; }
        const nextIdx = (trial && trial.stepIndex || 0) + 1;
        const bucket = store.getForStep(nextIdx);
        const total = bucket.red.length + bucket.blue.length;
        if (total === 0) { wrap.style.display = 'none'; return; }
        const fmt = a => {
            let detail = '';
            if (a.type === 'MOVE' && Array.isArray(a.to)) {
                detail = ` → [${a.to[0].toFixed(3)}, ${a.to[1].toFixed(3)}]`;
            } else if (a.type === 'ENGAGE' && a.target) {
                detail = ` → ${escapeHtml(a.target)}`;
            }
            return `<div>• <strong>${escapeHtml(a.type)}</strong> ${escapeHtml(a.unitId)}${detail}` +
                (a.reason ? ` <span style="color:#9ab;">— ${escapeHtml(a.reason)}</span>` : '') + '</div>';
        };
        const redHtml = bucket.red.length
            ? `<div style="margin-top:2px;color:#e8a23a;">Red (${bucket.red.length}):</div>${bucket.red.map(fmt).join('')}`
            : '';
        const blueHtml = bucket.blue.length
            ? `<div style="margin-top:2px;color:#5da9e8;">Blue (${bucket.blue.length}):</div>${bucket.blue.map(fmt).join('')}`
            : '';
        list.innerHTML = `<div style="color:#9ab;margin-bottom:3px;">Step ${nextIdx} · ${total} action${total === 1 ? '' : 's'}</div>${redHtml}${blueHtml}`;
        wrap.style.display = '';
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
        // Pull any approved Red/Blue actions the operator executed since
        // the last step — these go into the PROPOSED ACTIONS prompt block.
        const approved = window.AppApprovedActions
            ? window.AppApprovedActions.getForStep(nextIndex)
            : { red: [], blue: [] };
        const body = {
            scenarioName:   req.scenarioName,
            stepIndex:      nextIndex,
            prevState:      trial.currentState,
            trialId:        'manual',
            trialSeed:      req.trialSeed,
            trialHintId:    0,
            coaParams:      req.coaParams,
            model:          req.model,
            mockMode:       req.mockMode,
            approvedActions:approved,
        };
        const t0 = Date.now();
        const r = await window.AppAdjudicator.adjudicateStep(body);
        const wall = Date.now() - t0;
        if (!r || !r.state) {
            setStatus(`Step ${nextIndex} failed: ${r && r.error}`, 'error');
            return;
        }
        // Consume the approved actions — the adjudicator has them now.
        if (window.AppApprovedActions) window.AppApprovedActions.clearForStep(nextIndex);
        window.AppScenarioState.applyDelta(trial, r);
        renderStep(r.state, r.validation, { ...r.meta, durationMs: r.meta && r.meta.durationMs || wall });
        setLastMode(r);
        renderApprovedPreview();
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
        // Per-trial mode tally so the closing line tells the truth about
        // what actually ran instead of just "N fallback step(s)".
        const modeCounts = { live: 0, mock: 0, fallback: 0 };
        const fallbackReasons = {};
        for (let i = 1; i <= 11; i++) {
            setStatus(`Trial step ${i}/11…`, 'active');
            const approved = window.AppApprovedActions
                ? window.AppApprovedActions.getForStep(i)
                : { red: [], blue: [] };
            const body = {
                scenarioName:   req.scenarioName,
                stepIndex:      i,
                prevState:      trial.currentState,
                trialId:        'trial-' + req.trialSeed,
                trialSeed:      req.trialSeed + ':t0',
                trialHintId:    0,
                coaParams:      req.coaParams,
                model:          req.model,
                mockMode:       req.mockMode,
                approvedActions:approved,
            };
            const r = await window.AppAdjudicator.adjudicateStep(body);
            if (!r || !r.state) {
                setStatus(`Trial aborted at step ${i}: ${r && r.error}`, 'error');
                return;
            }
            if (window.AppApprovedActions) window.AppApprovedActions.clearForStep(i);
            window.AppScenarioState.applyDelta(trial, r);
            renderStep(r.state, r.validation, r.meta);
            setLastMode(r);
            renderApprovedPreview();
            const cls = classifyRun(r);
            modeCounts[cls.mode] = (modeCounts[cls.mode] || 0) + 1;
            if (cls.mode === 'fallback') {
                const why = (r.validation && r.validation.fallback) || 'unknown';
                fallbackReasons[why] = (fallbackReasons[why] || 0) + 1;
            }
            // Pace the playback so map effects (BLS color shifts, Blue
            // squares fading, phase-line creep) are visible step by step.
            // In mock mode each call is ~5 ms; without this delay you'd
            // never see the progression. In live Ollama mode each step is
            // already ~100 s so paceMs adds little.
            if (i < 11 && paceMs > 0) await sleep(paceMs);
        }
        const parts = [];
        if (modeCounts.live)     parts.push(`Live ${modeCounts.live}`);
        if (modeCounts.mock)     parts.push(`Mock ${modeCounts.mock}`);
        if (modeCounts.fallback) {
            const detail = Object.entries(fallbackReasons).map(([k, v]) => `${v}×${k}`).join(', ');
            parts.push(`Fallback ${modeCounts.fallback} (${detail})`);
        }
        const ok = modeCounts.fallback === 0;
        setStatus(`Trial complete — ${parts.join(' · ')}.`, ok ? 'ok' : 'error');
    }

    function resetTrial() {
        if (trial) window.AppScenarioState.reset(trial);
        $('wg-adj-step-display').style.display = 'none';
        const tl = $('wg-adj-timeline');
        if (tl) tl.style.display = 'none';
        const ch = $('wg-adj-charts');
        if (ch) ch.style.display = 'none';
        if (window.AppAdjudicatorMap) window.AppAdjudicatorMap.resetMap();
        // Drop any approved actions queued for past/future steps — a fresh
        // trial starts with a clean COA.
        if (window.AppApprovedActions) window.AppApprovedActions.clearAll();
        renderApprovedPreview();
        // Feedback already on disk stays put — only clear the per-session
        // "already-clicked" set so the buttons re-enable for the next pass.
        feedbackSentThisSession.clear();
        hideFeedbackRow();
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
        const refresh = root.querySelector('#wg-adj-backend-refresh');
        if (refresh) refresh.addEventListener('click', () => {
            const text = $('wg-adj-backend-text');
            if (text) text.textContent = 'Re-probing backend…';
            probeAiHealth();
        });
        // Feedback buttons (item #9).
        const fbA = root.querySelector('#wg-adj-fb-accept');
        const fbR = root.querySelector('#wg-adj-fb-reject');
        const fbN = root.querySelector('#wg-adj-fb-note');
        if (fbA) fbA.addEventListener('click', () => postFeedback('accept'));
        if (fbR) fbR.addEventListener('click', () => postFeedback('reject'));
        if (fbN) fbN.addEventListener('click', () => postFeedback('note'));
    }

    // ── Boot ─────────────────────────────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
