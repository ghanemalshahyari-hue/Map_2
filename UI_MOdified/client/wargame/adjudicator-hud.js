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

    // Resolved at boot from /api/ai/scenarios — whichever was last imported
    // or selected. Falls back to 'wargame3' only if the server has no record.
    let SCENARIO_DEFAULT = 'wargame3';

    let trial = null;       // current per-trial state from AppScenarioState
    let mcRunSubscription = null;
    let activeRunId = null;
    // Active COA — when set, every adjudicate step is preceded by a
    // headless Blue + Red AI proposal (Blue's prompt sees the plan, Red's
    // doesn't) and the proposed actions animate the real markers on the
    // map BEFORE the adjudicator resolves outcomes. This is what makes
    // "Use this plan" actually drive the wargame instead of being decorative.
    let activeCoa = null;
    let tacticalMovesAppliedThisStep = false;
    const ACTIVE_COA_STORAGE_KEY = 'wg-adj-active-coa';
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
            window.AppAdjudicator.getNextStepIndex    = () => {
                const maxStep = scenarioCache && Array.isArray(scenarioCache.steps) ? scenarioCache.steps.length - 1 : 11;
                return Math.min(maxStep, ((trial && trial.stepIndex) || 0) + 1);
            };
        }
        restoreActiveCoa();
        loadScenarios().then(autoDrawWhenReady);
        // Drop-zone for `all_phases.geojson` upload + SSE channel that
        // auto-refreshes the active scenario when it changes on disk.
        wireImportZone();
        wireScenarioWatcher();
        // Probe the AI backend so the Mock toggle and status row reflect
        // reality at boot — and the user knows up-front whether trials will
        // actually use the LLM or fall back to baseline.
        probeAiHealth();
        // Multi-provider status — populates the AI-provider dropdown with
        // Ollama / Claude / Zen, disabling whichever aren't configured.
        probeProviders();
        // Initial preview render — empty unless approvals are already cached.
        renderApprovedPreview();
        // Auto-refresh the preview when approvals change anywhere in the page.
        document.addEventListener('wargame:approved-actions-changed', renderApprovedPreview);
    }

    // ── AI backend health probe (items 1+2+3) ────────────────────────
    // Calls /api/ai/provider/status (multi-provider), updates the setup
    // row, and chooses the Mock toggle default. The probe is fire-and-
    // forget: an unreachable backend just degrades the UI to "Mock
    // required" without breaking the rest.
    async function probeAiHealth() {
        try {
            const res = await fetch('/api/ai/provider/status');
            const body = await res.json().catch(() => null);
            const s = body || {};
            aiHealth = {
                ok:       !!(s.available && s.available.length > 0),
                available: s.available || [],
                defaultResolved: s.defaultResolved || null,
                providers: s.providers || {},
                error:     (!s.available || !s.available.length) ? 'no AI provider available' : null,
            };
        } catch (e) {
            aiHealth = { ok: false, available: [], defaultResolved: null, providers: {}, error: (e && e.message) || String(e) };
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
        // Update the status message now that we know the real mock state.
        const statusEl = $('wg-adj-status');
        if (statusEl && !aiHealth.probedAsking) {
            aiHealth.probedAsking = true;
            if (aiHealth.ok) {
                statusEl.textContent = `AI backend ready (${aiHealth.available.join(', ')}). Mock mode is OFF — toggle on to replay scenario baseline.`;
            } else {
                statusEl.textContent = 'AI backend unavailable. Mock mode is ON (required for trials). Click ↻ to re-probe.';
            }
        }
        // Show warning banner if mock is already checked.
        const warnEl = $('wg-adj-mock-warning');
        if (mockEl && warnEl) {
            warnEl.style.display = mockEl.checked ? 'block' : 'none';
        }
    }

    // ── Multi-provider status probe (Ollama + Claude + Zen) ──────────
    // Calls /api/ai/provider/status and populates the AI-provider <select>.
    // Each option's enabled state reflects whether that provider's health
    // probe returned ok. 'Auto' is always selectable and resolves on the
    // server to the first available of (claude > zen > ollama).
    async function probeProviders() {
        const sel = $('wg-adj-provider');
        if (!sel) return;
        let status;
        try {
            const res = await fetch('/api/ai/provider/status');
            status = await res.json();
        } catch (e) {
            // Leave the select with just 'Auto' if the endpoint is unreachable.
            return;
        }
        const available = (status && status.available) || [];
        const def       = (status && status.defaultResolved) || null;

        // Rebuild options preserving the current selection if still valid.
        const prev = sel.value;
        sel.innerHTML = '';
        const autoLabel = def ? `Auto → ${def}` : 'Auto (no providers up)';
        sel.appendChild(new Option(autoLabel, 'auto'));
        ['ollama', 'claude', 'zen'].forEach((p) => {
            const ok = available.includes(p);
            const opt = new Option(p + (ok ? '' : ' (unavailable)'), p);
            if (!ok) opt.disabled = true;
            sel.appendChild(opt);
        });
        sel.value = (prev && Array.from(sel.options).some(o => o.value === prev && !o.disabled))
            ? prev
            : 'auto';
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
                <span id="wg-adj-mode-chip" class="wargame-state-pill is-idle" style="font-size:10px;padding:1px 8px;">Last: —</span>
            </div>

            <!-- ── Setup: scenario + model + mock toggle ── -->
            <div class="wg-adj-section">
                <div class="wg-adj-section-title">Setup</div>
                <div class="wg-adj-form-grid">
                    <label for="wg-adj-scenario" class="wg-adj-label">Scenario</label>
                    <select id="wg-adj-scenario" class="wg-adj-input"></select>

                    <label class="wg-adj-label">Import</label>
                    <div id="wg-adj-import" class="wg-adj-import-zone"
                         style="border:1px dashed #4a6;border-radius:4px;padding:8px;
                                background:rgba(74,170,102,0.06);font-size:11px;color:#9cb;
                                cursor:pointer;text-align:center;line-height:1.4;">
                        Drop <code>all_phases.geojson</code> here<br>
                        <span style="font-size:10px;color:#7a9;">or click to choose a file</span>
                        <input id="wg-adj-import-file" type="file" accept=".geojson,.json,application/json"
                               style="display:none;" />
                    </div>

                    <label for="wg-adj-model" class="wg-adj-label">Model</label>
                    <input id="wg-adj-model" class="wg-adj-input" type="text" placeholder="(default)" />

                    <label for="wg-adj-coa-reserve" class="wg-adj-label">Reserve&nbsp;hr</label>
                    <input id="wg-adj-coa-reserve" class="wg-adj-input" type="number" value="72" min="0" max="144" step="1" />

                    <label for="wg-adj-coa-posture" class="wg-adj-label">Posture</label>
                    <select id="wg-adj-coa-posture" class="wg-adj-input">
                        <option value="deliberate">deliberate</option>
                        <option value="hasty">hasty</option>
                    </select>

                    <label for="wg-adj-coa-weather" class="wg-adj-label">Weather</label>
                    <select id="wg-adj-coa-weather" class="wg-adj-input">
                        <option value="clear">clear</option>
                        <option value="overcast">overcast</option>
                        <option value="storm">storm</option>
                        <option value="night">night</option>
                    </select>

                    <label for="wg-adj-seed" class="wg-adj-label">Trial&nbsp;seed</label>
                    <input id="wg-adj-seed" class="wg-adj-input" type="text" value="manual" />

                    <label for="wg-adj-provider" class="wg-adj-label">AI&nbsp;provider</label>
                    <select id="wg-adj-provider" class="wg-adj-input">
                        <option value="auto">Auto (detect)</option>
                    </select>
                </div>
                <label class="wg-adj-toggle">
                    <input type="checkbox" id="wg-adj-mock" />
                    <span id="wg-adj-mock-label">Mock mode — replays scenario baseline</span>
                </label>
                <div id="wg-adj-mock-warning" style="display:none;margin-top:6px;padding:6px 8px;
                    background:rgba(232,162,58,0.12);border:1px solid #e8a23a;border-radius:4px;
                    font-size:11px;color:#e8a23a;line-height:1.5;">
                    &#9888; Mock mode active: AI model is NOT being called. Outcomes are scenario baselines (deterministic).
                    Uncheck to run live AI trials.
                </div>
            </div>

            <!-- ── Map overlay buttons ── -->
            <div class="wg-adj-section">
                <div class="wg-adj-section-title">Scenario overlay</div>
                <div class="wg-adj-btn-row wg-adj-btn-row--3">
                    <button id="wg-adj-map-btn"   class="wargame-action-btn secondary" type="button">Show on map</button>
                    <button id="wg-adj-map-clear" class="wargame-action-btn secondary" type="button">Hide</button>
                    <button id="wg-adj-3d-btn"    class="wargame-action-btn secondary" type="button">&#127760; 3D</button>
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

            <!-- ── Plan options (COA generator — AI co-pilot) ── -->
            <div class="wg-adj-section">
                <div class="wg-adj-section-title">Plan options &mdash; AI co-pilot</div>
                <div class="wg-adj-form-grid">
                    <label for="wg-adj-coa-intent" class="wg-adj-label">Intent</label>
                    <textarea id="wg-adj-coa-intent" class="wg-adj-input" rows="2"
                        style="font-family:inherit;resize:vertical;min-height:38px;"
                        placeholder="Seize OBJ NASSER by H+96 with <20 Blue casualties; preserve reserve."></textarea>
                </div>
                <div class="wg-adj-btn-row wg-adj-btn-row--2">
                    <button id="wg-adj-coa-btn"   class="wargame-action-btn primary"   type="button">Generate COA</button>
                    <button id="wg-adj-coa-clear" class="wargame-action-btn secondary" type="button">Clear</button>
                </div>
                <div id="wg-adj-coa-status" style="margin-top:6px;font-size:11px;color:#9ab;min-height:1em;"></div>

                <!-- Active-plan banner. Hidden until the operator clicks "Use this plan"
                     on a COA card. When visible, every subsequent adjudicate step runs
                     the headless Blue/Red propose+execute loop FIRST so the AI actually
                     moves the markers on the map according to the chosen plan.
                     IMPORTANT: keep display:none as the SOLE display rule on this
                     element so setActiveCoa()s flip to display:flex actually shows it. -->
                <div id="wg-adj-coa-active-banner" style="display:none;margin-top:8px;padding:8px 10px;
                    background:rgba(58,154,58,.10);border:1px solid #3aaa3a;border-left-width:3px;
                    border-radius:4px;font-size:12px;color:#cfeacf;
                    align-items:center;gap:8px;">
                    <span style="color:#3aaa3a;font-weight:bold;">&#9679; ACTIVE</span>
                    <span id="wg-adj-coa-active-name" style="color:#e6e6e6;font-weight:600;flex:1;"></span>
                    <span id="wg-adj-coa-active-risk" style="font-size:10px;text-transform:uppercase;letter-spacing:.05em;padding:1px 6px;border-radius:3px;"></span>
                    <button id="wg-adj-coa-deactivate" class="wargame-action-btn secondary"
                        type="button" style="padding:2px 8px;font-size:10px;">Deactivate</button>
                </div>

                <div id="wg-adj-coa-cards"  style="margin-top:8px;display:flex;flex-direction:column;gap:8px;"></div>
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

                <!-- AAR lessons (item #5). Shows recent operator-written lessons
                     for the active scenario. Click to expand. -->
                <div id="wg-adj-lessons-area" style="margin-top:6px;display:none;">
                    <div style="display:flex;gap:4px;">
                        <button id="wg-adj-lessons-toggle" type="button"
                            class="wargame-action-btn secondary"
                            style="padding:2px 6px;font-size:10px;flex:1;text-align:left;">
                            &#128214; AAR lessons <span id="wg-adj-lessons-count" style="color:#9ab;"></span>
                        </button>
                        <button id="wg-adj-lessons-write" type="button"
                            class="wargame-action-btn success"
                            style="padding:2px 6px;font-size:10px;">&#9998; Write</button>
                    </div>
                    <div id="wg-adj-lessons-list" style="margin-top:4px;display:none;font-size:11px;"></div>
                    <!-- Inline compose form, hidden by default -->
                    <div id="wg-adj-lessons-form" style="margin-top:4px;display:none;font-size:11px;
                        border:1px solid #2a3140;padding:6px;background:#191e29;">
                        <div style="margin-bottom:4px;">
                            <input id="wg-adj-les-title" type="text" placeholder="Lesson title (required, max 120)"
                                style="width:100%;box-sizing:border-box;background:#12161e;border:1px solid #2a3140;color:#ddd;padding:3px 5px;font-size:11px;">
                        </div>
                        <div style="margin-bottom:4px;display:flex;gap:4px;">
                            <select id="wg-adj-les-category"
                                style="background:#12161e;border:1px solid #2a3140;color:#ddd;padding:3px 5px;font-size:11px;">
                                <option value="general">general</option>
                                <option value="tactics">tactics</option>
                                <option value="logistics">logistics</option>
                                <option value="intel">intel</option>
                                <option value="fires">fires</option>
                                <option value="maneuver">maneuver</option>
                            </select>
                            <input id="wg-adj-les-author" type="text" placeholder="Author"
                                style="flex:1;background:#12161e;border:1px solid #2a3140;color:#ddd;padding:3px 5px;font-size:11px;">
                        </div>
                        <div style="margin-bottom:4px;">
                            <textarea id="wg-adj-les-narrative" rows="2" placeholder="Narrative (optional, max 2000)"
                                style="width:100%;box-sizing:border-box;background:#12161e;border:1px solid #2a3140;color:#ddd;padding:3px 5px;font-size:11px;resize:vertical;"></textarea>
                        </div>
                        <div style="display:flex;gap:4px;justify-content:flex-end;">
                            <button id="wg-adj-les-cancel" type="button" class="wargame-action-btn secondary"
                                style="padding:2px 8px;font-size:10px;">Cancel</button>
                            <button id="wg-adj-les-submit" type="button" class="wargame-action-btn success"
                                style="padding:2px 8px;font-size:10px;">Save lesson</button>
                            <span id="wg-adj-les-status" style="color:#9ab;font-size:10px;align-self:center;"></span>
                        </div>
                    </div>
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

            <!-- Item #12 — comparison report. Always visible; the link opens
                 a printable HTML page comparing baseline / live AI / MC for
                 the currently selected scenario (latest completed run). -->
            <div style="margin-top:10px;font-size:12px;color:#cdd;">
                <a id="wg-adj-report-link" href="/api/ai/report.html?scenario=wargame2-brega"
                   target="_blank" rel="noopener"
                   style="color:#5da9e8;text-decoration:none;">&#128202; Open comparison report</a>
                <span style="color:#888;margin-left:6px;">(baseline vs live AI vs MC)</span>
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
        el.classList.remove('is-idle', 'is-active', 'is-error', 'is-warning', 'is-ok');
        el.classList.add('is-' + kind);
        el.textContent = text;
    }
    function setStatus(msg, kind) {
        const pill = $('wg-adj-pill');
        if (pill) setPill(pill, kind || 'idle', text => kind === 'ok' ? 'Ready' : kind === 'active' ? 'Working…' : kind === 'error' ? 'Error' : kind === 'warning' ? 'Warning' : 'Idle');
        if (kind === 'ok')      setPill(pill, 'ok', 'Ready');
        if (kind === 'active')  setPill(pill, 'active', 'Working…');
        if (kind === 'error')   setPill(pill, 'error', 'Error');
        if (kind === 'warning') setPill(pill, 'warning', 'Warning');
        if (kind === 'idle')    setPill(pill, 'idle', 'Idle');
        const box = $('wg-adj-status');
        if (box) box.innerHTML = msg;
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
        const avail = (aiHealth.available && aiHealth.available.length) ? aiHealth.available : [];
        if (aiHealth.ok) {
            dot.style.background = '#4caf50';
            const resolved = aiHealth.defaultResolved ? `→ ${aiHealth.defaultResolved}` : '';
            text.innerHTML = `Live AI ready · <strong>${escapeHtml(avail.join(', '))}</strong> ${resolved}`;
            if (label) label.textContent = 'Mock mode (skip LLM, replay scenario baseline)';
        } else {
            dot.style.background = '#d23a3a';
            const err = aiHealth.error || 'unreachable';
            text.innerHTML = `AI backend offline — <span style="color:#e8a23a;">${escapeHtml(err)}</span>` +
                ` · <span style="color:#888;">avail: ${avail.length ? escapeHtml(avail.join(', ')) : 'none'}</span>`;
            if (label) label.textContent = 'Mock mode (backend offline — required for trials)';
        }
    }

    // Classify one adjudicate response into a mode label + pill kind + pill color.
    //   - validation.mocked === true                    → 'mock'
    //   - r.ok && !mocked                               → 'live'
    //   - !r.ok or validation.fallback present          → 'model_error' / 'validation_error' / 'parse_error' / 'fallback'
    // Returns { mode, label, kind, bg, fg } where bg/fg are CSS colors (item #3).
    // Status pill kind drives the colored Ready/Working/Error pill at the
    // top of the card. Mock-mode runs are SUCCESSFUL adjudications (just
    // simulated), so they map to kind 'ok' (pill → "Ready") with the
    // yellow chip below labelled "Mock" to distinguish from a live run.
    // Using 'idle' here caused the pill to drop from "Ready" → "Idle" the
    // moment a mock step completed, which was wrong.
    const MODE_STYLES = {
        mock:             { kind: 'ok',      bg: '#8a7520', fg: '#e8d88a' },
        live:             { kind: 'ok',      bg: '#1a6b3a', fg: '#8ae8aa' },
        model_error:      { kind: 'error',   bg: '#7a2a2a', fg: '#e88a8a' },
        validation_error: { kind: 'warning', bg: '#7a4a2a', fg: '#e8b88a' },
        parse_error:      { kind: 'warning', bg: '#6a4a2a', fg: '#d8b88a' },
        fallback:         { kind: 'warning', bg: '#6a5a2a', fg: '#d8c88a' },
        idle:             { kind: 'idle',    bg: '#333',    fg: '#888'    },
    };
    function classifyRun(r) {
        const mocked   = !!(r && r.validation && r.validation.mocked);
        const fallback = String((r && r.validation && r.validation.fallback) || (r && r.meta && r.meta.fallback) || '');
        let mode = 'idle';
        let label = '\u2014';
        if (mocked) {
            mode = 'mock'; label = 'Mock';
        } else if (fallback) {
            if (fallback.endsWith('_error') || fallback.endsWith('_error_on_retry')) {
                mode = 'model_error'; label = 'Model error \xb7 ' + fallback;
            } else if (fallback === 'validation_failed') {
                mode = 'validation_error'; label = 'Validation error';
            } else if (fallback === 'parse_failed') {
                mode = 'parse_error'; label = 'Parse error';
            } else {
                mode = 'fallback'; label = 'Fallback \xb7 ' + fallback;
            }
        } else if (r && r.ok) {
            mode = 'live'; label = 'Live \xb7 ' + ((r.meta && r.meta.model) || '(model)');
        }
        const style = MODE_STYLES[mode] || MODE_STYLES.idle;
        return { mode, label, kind: style.kind, bg: style.bg, fg: style.fg };
    }

    function setLastMode(r) {
        const chip = $('wg-adj-mode-chip');
        if (!chip) return;
        const c = classifyRun(r);
        lastRunMode = c.mode;
        chip.classList.remove('is-idle', 'is-active', 'is-error', 'is-warning', 'is-ok');
        chip.classList.add('is-' + c.kind);
        chip.textContent = 'Last: ' + c.label;
        chip.style.background = c.bg || '';
        chip.style.color      = c.fg || '';
    }

    function clearLastMode() {
        const chip = $('wg-adj-mode-chip');
        lastRunMode = null;
        if (!chip) return;
        chip.classList.remove('is-active', 'is-error', 'is-warning', 'is-ok');
        chip.classList.add('is-idle');
        chip.textContent = 'Last: —';
        chip.style.background = '';
        chip.style.color = '';
    }

    // ── Scenario list ────────────────────────────────────────────────
    // Keep the comparison-report link in sync with the active scenario so
    // clicking it always opens the right one (item #12).
    function updateReportLink() {
        const link = $('wg-adj-report-link');
        const sel  = $('wg-adj-scenario');
        if (!link || !sel) return;
        const name = sel.value || SCENARIO_DEFAULT;
        link.href = '/api/ai/report.html?scenario=' + encodeURIComponent(name);
    }

    async function loadScenarios() {
        const result = await window.AppAdjudicator.scenarios();
        const sel = $('wg-adj-scenario');
        sel.innerHTML = '';
        if (!result.ok) {
            setStatus('Could not load scenarios: ' + (result.error || 'unknown'), 'error');
            return;
        }
        // Server tells us which scenario was last active. Update the module
        // default so every subsequent reference to SCENARIO_DEFAULT is current.
        const activeName = result.active || result.default || SCENARIO_DEFAULT;
        SCENARIO_DEFAULT = activeName;
        for (const name of result.scenarios) {
            const opt = document.createElement('option');
            opt.value = name; opt.textContent = name;
            if (name === activeName) opt.selected = true;
            sel.appendChild(opt);
        }
        // Persist whenever the operator manually switches scenarios.
        sel.addEventListener('change', () => {
            updateReportLink();
            const chosen = sel.value;
            if (chosen) {
                fetch('/api/scenario/active', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: chosen }),
                }).catch(() => {});
            }
        });
        updateReportLink();
        setStatus('Connecting to AI backend…', 'idle');
    }

    // ── Import zone ──────────────────────────────────────────────────
    // Drop or pick an `all_phases.geojson` (or a step bundle). The file is
    // streamed straight to /api/scenario/import which runs the porter and
    // writes data/scenarios/<name>.json. We then refresh the scenario list
    // and select the new one.
    function wireImportZone() {
        const zone  = $('wg-adj-import');
        const input = $('wg-adj-import-file');
        if (!zone || !input) return;

        const setBusy = (msg, kind) => {
            zone.style.background = kind === 'error' ? 'rgba(232,80,80,0.10)'
                                : kind === 'ok'    ? 'rgba(74,200,120,0.12)'
                                                   : 'rgba(74,170,102,0.06)';
            zone.innerHTML = msg + (kind === 'busy'
                ? '<br><span style="font-size:10px;color:#7a9;">Uploading…</span>'
                : '<br><span style="font-size:10px;color:#7a9;">Drop another file to import again</span>');
            // Re-attach the input so re-importing still works.
            const reInput = document.createElement('input');
            reInput.type = 'file';
            reInput.id = 'wg-adj-import-file';
            reInput.accept = '.geojson,.json,application/json';
            reInput.style.display = 'none';
            zone.appendChild(reInput);
            reInput.addEventListener('change', onPick);
        };

        const importBlob = async (file) => {
            if (!file) return;
            const baseName = String(file.name || 'imported')
                .replace(/\.(geo)?json$/i, '')
                .replace(/^all_phases$/i, 'imported');
            setBusy(`Importing <code>${file.name}</code>…`, 'busy');
            try {
                const text = await file.text();
                let parsed;
                try { parsed = JSON.parse(text); }
                catch (e) { throw new Error('Not valid JSON: ' + (e.message || e)); }
                const res = await fetch('/api/scenario/import?name=' + encodeURIComponent(baseName), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(parsed),
                });
                const body = await res.json().catch(() => ({}));
                if (!res.ok || !body.ok) {
                    throw new Error(body.error || ('HTTP ' + res.status));
                }
                setBusy(`Imported <strong>${body.name}</strong> · ${body.steps} steps · `
                      + `${body.red_units} red / ${body.blue_units} blue`, 'ok');
                // Refresh the scenario dropdown and select the freshly-imported one.
                await loadScenarios();
                const sel = $('wg-adj-scenario');
                if (sel) {
                    sel.value = body.name;
                    sel.dispatchEvent(new Event('change'));
                }
                setStatus('Scenario "' + body.name + '" imported and selected.', 'ok');
                // Auto-draw it on the map.
                try { await showScenarioOnMap(); } catch (_) {}
            } catch (e) {
                setBusy(`Import failed: ${e.message || e}`, 'error');
                setStatus('Import failed: ' + (e.message || e), 'error');
            }
        };

        const onPick = (ev) => {
            const f = ev && ev.target && ev.target.files && ev.target.files[0];
            if (f) importBlob(f);
        };

        zone.addEventListener('click', () => {
            const el = $('wg-adj-import-file');
            if (el) el.click();
        });
        zone.addEventListener('dragover', (ev) => {
            ev.preventDefault();
            zone.style.background = 'rgba(74,200,120,0.18)';
        });
        zone.addEventListener('dragleave', () => {
            zone.style.background = 'rgba(74,170,102,0.06)';
        });
        zone.addEventListener('drop', (ev) => {
            ev.preventDefault();
            const f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
            if (f) importBlob(f);
        });
        input.addEventListener('change', onPick);
    }

    // ── Live reload: SSE channel ─────────────────────────────────────
    // The server watches data/scenarios/ and emits `scenario-changed` events
    // when files are written (either by the CLI porter or our import
    // endpoint). On receipt we clear the local cache and, if the changed
    // file matches the active scenario, re-draw it.
    function wireScenarioWatcher() {
        if (typeof EventSource === 'undefined') return;
        try {
            const es = new EventSource('/api/scenario/events');
            es.addEventListener('scenario-changed', async (ev) => {
                let payload = {};
                try { payload = JSON.parse(ev.data || '{}'); } catch (_) {}
                const sel = $('wg-adj-scenario');
                const active = sel && sel.value;
                // Refresh the list (catches added/removed scenarios).
                try { await loadScenarios(); } catch (_) {}
                if (sel && active) {
                    sel.value = active;
                    sel.dispatchEvent(new Event('change'));
                }
                if (payload.name && active && payload.name === active) {
                    scenarioCache = null;
                    setStatus('Scenario "' + payload.name + '" updated on disk — redrawing.', 'ok');
                    try { await showScenarioOnMap(); } catch (_) {}
                }
            });
            es.onerror = () => { /* let the browser auto-reconnect */ };
        } catch (_) { /* SSE unavailable; the user can still click reload */ }
    }

    async function ensureScenarioLoaded() {
        const name = ($('wg-adj-scenario') && $('wg-adj-scenario').value) || SCENARIO_DEFAULT;
        // Always re-fetch — never serve a stale cached copy that was built
        // before a server restart added new fields (e.g. red_unit_step_coords).
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

    async function toggle3DGlobe() {
        if (!window.AppCesiumView) {
            setStatus('Cesium 3D module not loaded.', 'error');
            return;
        }
        const btn = document.getElementById('wg-adj-3d-btn');
        const turningOn = !window.AppCesiumView.isVisible;
        if (turningOn) setStatus('Loading 3D globe…', 'idle');
        await window.AppCesiumView.toggle();
        const on = window.AppCesiumView.isVisible;
        if (btn) btn.classList.toggle('active', on);
        if (on) {
            setStatus('3D globe enabled.', 'ok');
        } else {
            setStatus('3D globe hidden.', 'idle');
        }
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

    // Like classifyRun() but for a historical step — determines mode from
    // the step's history entry (validation + meta). Used to color timeline
    // cells by run mode (item #3).
    function classifyHistoricalStep(h) {
        if (!h || !h.validation) return 'future';
        if (h.validation.mocked)           return 'mock';
        if (h.validation.fallback) {
            const fb = h.validation.fallback;
            if (fb.endsWith('_error') || fb.endsWith('_error_on_retry')) return 'model_error';
            if (fb === 'validation_failed') return 'validation_error';
            if (fb === 'parse_failed')      return 'parse_error';
            return 'fallback';
        }
        if (h.state && h.state.step_index > 0) return 'live';
        return 'seeded';
    }

    const MODE_COLORS = {
        live:             '#1a6b3a',
        mock:             '#8a7520',
        fallback:         '#8a5e20',
        model_error:      '#7a2a2a',
        validation_error: '#7a4a2a',
        parse_error:      '#6a4a2a',
        seeded:           '#2a3a52',
        future:           '#22293a',
    };
    const MODE_LABELS = {
        live: 'live AI',
        mock: 'mock',
        fallback: 'fallback',
        model_error: 'model error',
        validation_error: 'validation error',
        parse_error: 'parse error',
        seeded: 'seeded',
        future: 'future',
    };

    // ── Timeline strip: one cell per step. Cells become clickable
    // once their step has been resolved (i.e. is present in trial.history).
    // Clicking a past cell scrubs the side panel + map back to that step.
    // Each cell is colored by its run mode (item #3) with a thin mode bar.
    // Step count + labels come from scenarioCache.phase_table so non-W1/W2
    // scenarios (4..20 steps) render correctly.
    function renderTimeline(currentStepIndex, currentObjStatus) {
        const wrap = $('wg-adj-timeline');
        const strip = $('wg-adj-timeline-strip');
        if (!wrap || !strip) return;
        wrap.style.display = '';
        const pt = scenarioCache && Array.isArray(scenarioCache.phase_table) ? scenarioCache.phase_table : null;
        const labels = pt
            ? pt.map(r => r.time_label || `step ${r.index}`)
            : ['D-3h','H','H+2','H+6','H+12','H+24','H+36','H+48','H+72','H+96','H+120','H+144'];
        const phases = pt
            ? pt.map(r => (r.phase || '').replace(/^PHASE\s+/i, 'P').replace(/^PRE-H$/i, 'PRE').replace(/^RESOLUTION$/i, 'RES'))
            : ['PRE','P1','P1','P2A','P2A','P2A','P2B','P2B','P3','P3','P3','RES'];
        const cellCount = labels.length;
        const objColor = {
            DORMANT:'#445',     THREATENED:'#c9852e', CONTESTED:'#b07020',
            CAPTURED:'#b73a3a', DENIED:'#3a7fb7',     '__future':'#22293a',
        };
        // Build a quick lookup of resolved steps -> their objective_status + full entry
        const resolvedByIdx = {};
        const historyByStep = {};
        const history = (trial && trial.history) || [];
        for (const h of history) {
            if (h && h.state) {
                resolvedByIdx[h.state.step_index] = h.state.objective_status;
                historyByStep[h.state.step_index] = h;
            }
        }
        const cells = [];
        for (let i = 0; i < cellCount; i++) {
            const isResolved = (i in resolvedByIdx);
            const isCurrent  = i === currentStepIndex;
            const objAtI     = resolvedByIdx[i];
            const stepEntry  = historyByStep[i];
            const mode       = classifyHistoricalStep(stepEntry);
            const modeColor  = MODE_COLORS[mode] || MODE_COLORS.future;
            const modeLabel  = MODE_LABELS[mode] || '';
            const bg = isCurrent ? (objColor[currentObjStatus] || '#3a96d2')
                     : isResolved ? modeColor
                                  : objColor.__future;
            const border = isCurrent ? '2px solid #fff' : '1px solid #1a2030';
            const cursor = isResolved ? 'pointer' : 'default';
            const hoverEffect = isResolved && !isCurrent ? 'opacity:.85;' : '';
            const modeHint = isResolved ? ` \xb7 ${modeLabel}` : '';
            cells.push(`
                <div data-step="${i}" title="Step ${i} — ${labels[i]} (${phases[i]})${modeHint}${isResolved ? ' — click to scrub' : ''}" style="
                    flex:1;min-width:14px;height:30px;background:${bg};
                    border:${border};border-radius:2px;cursor:${cursor};${hoverEffect}
                    display:flex;flex-direction:column;align-items:center;justify-content:center;
                    font-size:8px;color:#cdd;font-weight:${isCurrent ? 700 : 400};
                    ${isCurrent ? 'box-shadow:0 0 4px rgba(58,150,210,.6);' : ''}
                    position:relative;overflow:hidden;
                ">
                    <div>${labels[i]}</div>
                    <div style="opacity:.6;">${phases[i]}</div>
                    ${isResolved ? `<div style="position:absolute;bottom:0;left:0;right:0;height:3px;background:${modeColor};opacity:0.7;"></div>` : ''}
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

    // Format the phase string for the HUD step summary. W3-rich scenarios
    // carry a `kind_native` (e.g. "h_hour_strike") alongside the legacy
    // `phase` enum — show both so operators can read both the doctrinal
    // bucket and the W3 producer's authentic phase label.
    function phaseSummary(state) {
        const phase = state && state.phase ? String(state.phase) : '';
        const kind  = state && state.kind_native ? String(state.kind_native) : '';
        if (!kind || kind === phase) return phase;
        return `${phase} (${kind})`;
    }

    // Build an HTML block summarising the W3-rich per-step narrative —
    // force ratios, step advantage, top actors with action_what, top
    // affected with status_change + cause. Returns '' for legacy
    // scenarios so the existing single-paragraph narrative_en panel is
    // used unchanged.
    function renderW3Narrative(state) {
        if (!state || !state.kind_native) return '';     // legacy path
        const actors   = Array.isArray(state.actors)   ? state.actors   : [];
        const affected = Array.isArray(state.affected) ? state.affected : [];
        const arcs     = Array.isArray(state.engagement_arcs) ? state.engagement_arcs : [];
        const adv      = state.step_advantage || '';
        const advColor = adv === 'RED_ADV' ? '#ef4444' : adv === 'BLUE_ADV' ? '#3b82f6' : '#aaa';
        const frLoc    = state.force_ratio_local;
        const frOp     = state.force_ratio_operational;

        const out = [];
        // Header strip: kind_native + force ratios + advantage call
        const headerBits = [];
        if (state.phase_name_ar) headerBits.push(`<span dir="rtl" style="color:#cce;">${escapeHtml(state.phase_name_ar)}</span>`);
        if (adv)                 headerBits.push(`<span style="background:${advColor};color:#fff;padding:1px 6px;border-radius:6px;font-size:10px;font-weight:700;">${escapeHtml(adv)}</span>`);
        if (Number.isFinite(frLoc)) headerBits.push(`FR local <strong>${frLoc.toFixed(2)}</strong>`);
        if (Number.isFinite(frOp))  headerBits.push(`FR op <strong>${frOp.toFixed(2)}</strong>`);
        if (headerBits.length) out.push(`<div style="margin-top:6px;font-size:11px;">${headerBits.join(' &nbsp;·&nbsp; ')}</div>`);

        // Top actors (capped at 6 to fit the panel)
        if (actors.length) {
            const items = actors.slice(0, 6).map(a => {
                const comp = a.action_component ? `<span style="color:#9bd6a3;">[${escapeHtml(a.action_component)}]</span> ` : '';
                return `<li style="margin:3px 0;"><strong>${escapeHtml(a.uid || '?')}</strong> ${comp}${escapeHtml(a.action_what || '')}</li>`;
            }).join('');
            const more = actors.length > 6 ? `<li style="opacity:0.6;">…and ${actors.length - 6} more</li>` : '';
            out.push(`<div style="margin-top:6px;">
                <div style="font-size:10px;color:#9ab;font-weight:700;letter-spacing:0.04em;">▶ ACTORS (${actors.length})</div>
                <ul style="margin:2px 0 0 0;padding-left:16px;font-size:11px;line-height:1.3;">${items}${more}</ul>
            </div>`);
        }
        // Top affected
        if (affected.length) {
            const items = affected.slice(0, 6).map(a => {
                const color = ({
                    destroyed: '#b00020', damaged_partial: '#d97706',
                    suppressed: '#ca8a04', delayed: '#7c3aed',
                    expended: '#2563eb',
                })[a.status_change] || '#888';
                const dmg = Number.isFinite(a.damage_pct) ? ` (${Math.round(a.damage_pct * 100)}%)` : '';
                const cause = a.cause_actor ? `<span style="color:#a98;">by ${escapeHtml(a.cause_actor)}</span>` : '';
                return `<li style="margin:3px 0;">
                    <strong>${escapeHtml(a.uid || '?')}</strong>
                    <span style="color:${color};">${escapeHtml(a.status_change || '?')}${dmg}</span>
                    ${escapeHtml(a.cause_what || '')} ${cause}
                </li>`;
            }).join('');
            const more = affected.length > 6 ? `<li style="opacity:0.6;">…and ${affected.length - 6} more</li>` : '';
            out.push(`<div style="margin-top:6px;">
                <div style="font-size:10px;color:#9ab;font-weight:700;letter-spacing:0.04em;">◆ AFFECTED (${affected.length})</div>
                <ul style="margin:2px 0 0 0;padding-left:16px;font-size:11px;line-height:1.3;">${items}${more}</ul>
            </div>`);
        }
        // Engagement-arc count
        if (arcs.length) {
            out.push(`<div style="margin-top:4px;font-size:10px;color:#9ab;">— ${arcs.length} engagement arc(s) drawn on map</div>`);
        }
        return out.join('');
    }

    // Append the W3 narrative block beneath the existing narrative paragraph.
    // The narrative_en element is a <div> in the HUD, so we can inject HTML
    // safely by appending a sibling node — but the simpler path is to
    // overwrite innerHTML with [text, structured]. To keep the change
    // surgical, we wrap the original narrative + the W3 detail together
    // when the state carries W3 fields.
    function paintNarrative(state) {
        const baseEn = state.narrative_en || '';
        const baseAr = state.narrative_ar || '';
        const w3 = renderW3Narrative(state);
        if (w3) {
            $('wg-adj-narrative-en').innerHTML = (baseEn ? `<div>${escapeHtml(baseEn)}</div>` : '') + w3;
        } else {
            $('wg-adj-narrative-en').textContent = baseEn;
        }
        $('wg-adj-narrative-ar').textContent = baseAr;
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
            <strong>Step ${state.step_index} — ${state.time_label} — ${phaseSummary(state)}${fallback}</strong><br>
            PL: ${state.phase_line_km} km · FR: ${escapeHtml(state.force_ratio)} · OBJ: ${state.objective_status}<br>
            EW: ${state.ew_effect} · Logistics: ${escapeHtml(state.logistics_state)} · Decision: ${escapeHtml(state.decision_point)}<br>
            Losses: Blue ${state.losses_cumulative.blue_destroyed}/${state.losses_cumulative.blue_total} · Red coy-eq ${state.losses_cumulative.red_company_equivalent}
        `;
        $('wg-adj-bls-line').textContent = blsLine;
        paintNarrative(state);
        const warns = [];
        if (validation && validation.normalized_fields && validation.normalized_fields.length) {
            warns.push(`normalized: ${validation.normalized_fields.slice(0, 3).join(', ')}${validation.normalized_fields.length > 3 ? '...' : ''}`);
        }
        if (meta && meta.durationMs != null) warns.push(`${Math.round(meta.durationMs)} ms`);
        if (meta && meta.model) warns.push(meta.model);
        $('wg-adj-validation').textContent = warns.join(' · ');
        if (trial && trial.history && trial.history.length) {
            renderCharts(trial.history);
        }
        // item #9 — scrubber should let the operator grade older steps too.
        showFeedbackRow(state.step_index);
        // item #5 — refresh AAR lessons after each adjudication.
        loadLessons(trial && trial.scenarioName);
    }

    // ── Render one step's state into the display block + map ─────────
    function renderStep(state, validation, meta) {
        $('wg-adj-step-display').style.display = '';
        renderTimeline(state.step_index, state.objective_status);
        const blsLine = Object.entries(state.bls_status || {})
            .map(([k, v]) => `${k}·${v.slice(0, 3)}`).join(' ');
        const fallback = (validation && validation.fallback) ? ` [${validation.fallback}]` : '';
        $('wg-adj-step-summary').innerHTML = `
            <strong>Step ${state.step_index} — ${state.time_label} — ${phaseSummary(state)}${fallback}</strong><br>
            PL: ${state.phase_line_km} km · FR: ${escapeHtml(state.force_ratio)} · OBJ: ${state.objective_status}<br>
            EW: ${state.ew_effect} · Logistics: ${escapeHtml(state.logistics_state)} · Decision: ${escapeHtml(state.decision_point)}<br>
            Losses: Blue ${state.losses_cumulative.blue_destroyed}/${state.losses_cumulative.blue_total} · Red coy-eq ${state.losses_cumulative.red_company_equivalent}
        `;
        $('wg-adj-bls-line').textContent = blsLine;
        paintNarrative(state);
        const warns = [];
        if (validation && validation.clamped_fields && validation.clamped_fields.length) {
            warns.push(`clamped: ${validation.clamped_fields.join(', ')}`);
        }
        if (validation && validation.normalized_fields && validation.normalized_fields.length) {
            warns.push(`normalized: ${validation.normalized_fields.slice(0, 3).join(', ')}${validation.normalized_fields.length > 3 ? '...' : ''}`);
        }
        if (validation && validation.doctrinal_warnings && validation.doctrinal_warnings.length) {
            warns.push(`${validation.doctrinal_warnings.length} doctrinal warning(s)`);
        }
        if (meta && meta.durationMs != null) warns.push(`${Math.round(meta.durationMs)} ms`);
        if (meta && meta.model) warns.push(meta.model);

        // Push the state into the map overlay. If the scenario hasn't been
        // drawn yet, draw it first so the overlays exist for applyState.
        // Skip deterministic positioning only if this step already animated
        // tactical actions. Fast COA mode intentionally lets scripted
        // positions advance so the map still moves without live AI latency.
        if (window.AppAdjudicatorMap && scenarioCache) {
            if (!document.querySelector('.leaflet-marker-icon.wg-adj-obj')) {
                window.AppAdjudicatorMap.drawScenario(scenarioCache);
            }
            const applyOpts = { skipUnitPositioning: !!tacticalMovesAppliedThisStep };
            const r = window.AppAdjudicatorMap.applyState(state, scenarioCache, applyOpts);
            tacticalMovesAppliedThisStep = false;
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
        const providerEl = $('wg-adj-provider');
        return {
            scenarioName: $('wg-adj-scenario').value || SCENARIO_DEFAULT,
            model:        ($('wg-adj-model').value || '').trim() || null,
            mockMode:     $('wg-adj-mock').checked,
            // 'auto' / 'ollama' / 'claude' / 'zen' — null means server picks
            // its configured default. The HUD pill is populated by
            // probeProviders() against /api/ai/provider/status.
            provider:     (providerEl && providerEl.value) || null,
            coaParams: {
                reserve_commit_hour: Number($('wg-adj-coa-reserve').value || 72),
                posture:             $('wg-adj-coa-posture').value,
                main_effort_axis:    'BLS-3',
                weather:             ($('wg-adj-coa-weather') && $('wg-adj-coa-weather').value) || 'clear',
            },
            trialSeed: ($('wg-adj-seed').value || 'manual').trim() || 'manual',
        };
    }

    // ── COA generator (AI co-pilot) ─────────────────────────────────
    // Calls POST /api/ai/coa with the current scenario + commander intent +
    // selected provider. Renders the returned plans as a card stack the
    // commander can scan and click. Each card has a "Use this plan" button
    // that populates the existing Reserve hr + Posture inputs so the next
    // adjudicate-step uses the chosen plan's parameters.
    //
    // Empty intent is allowed — the server prompt has a sensible default.
    async function handleCoaGenerate() {
        const req           = currentRequest();
        const intent        = ($('wg-adj-coa-intent').value || '').trim();
        const cards         = $('wg-adj-coa-cards');
        const statusEl      = $('wg-adj-coa-status');
        const btn           = $('wg-adj-coa-btn');
        cards.innerHTML     = '';
        statusEl.textContent = 'Generating 3-5 candidate plans…';
        btn.disabled        = true;
        const t0 = Date.now();
        try {
            const r = await window.AppAdjudicator.coa({
                scenarioName:    req.scenarioName,
                commanderIntent: intent || null,
                constraints:     { min_options: 3, max_options: 5 },
                provider:        req.provider,
                model:           req.model || null,
            });
            const ms = Date.now() - t0;
            const plans = (r && r.plans) || [];
            const provLabel = (r && r.meta && r.meta.provider) || '(unknown)';
            const iter = (r && r.meta && r.meta.iterativeAttempts) || 0;
            const iterTxt = iter > 0 ? ` · backfill iterations: ${iter}` : '';
            if (!plans.length) {
                const err = (r && r.error) || 'unknown';
                statusEl.textContent = `Failed (${err}) — ${ms} ms`;
                return;
            }
            statusEl.textContent = `${plans.length} plans · ${ms} ms · provider: ${provLabel}${iterTxt}`;
            plans.forEach((p, i) => cards.appendChild(renderCoaCard(p, i)));
        } catch (e) {
            statusEl.textContent = 'Error: ' + ((e && e.message) || String(e));
        } finally {
            btn.disabled = false;
        }
    }

    function clearCoaCards() {
        const cards    = $('wg-adj-coa-cards');
        const statusEl = $('wg-adj-coa-status');
        if (cards)    cards.innerHTML    = '';
        if (statusEl) statusEl.textContent = '';
    }

    // Render one plan card. Inline styles keep this self-contained — no
    // CSS changes needed elsewhere. Risk tier color-codes the badge.
    // Keep the selected plan alive across refreshes so a stale tab reload
    // does not silently drop the active COA.
    function rememberActiveCoa(plan) {
        try {
            if (plan) sessionStorage.setItem(ACTIVE_COA_STORAGE_KEY, JSON.stringify(plan));
            else sessionStorage.removeItem(ACTIVE_COA_STORAGE_KEY);
        } catch (_) { /* storage can be disabled */ }
    }

    function restoreActiveCoa() {
        try {
            const raw = sessionStorage.getItem(ACTIVE_COA_STORAGE_KEY);
            if (!raw) return;
            const plan = JSON.parse(raw);
            if (plan && typeof plan === 'object') {
                setActiveCoa(plan, { persist: false });
                setStatus(`Plan "${escapeHtml(plan.name || 'plan')}" restored. Mock off will use live Ollama; Mock on replays baseline.`, 'ok');
            }
        } catch (_) {
            try { sessionStorage.removeItem(ACTIVE_COA_STORAGE_KEY); } catch (__) {}
        }
    }

    // Render one plan card. Inline styles keep this self-contained.
    function renderCoaCard(plan, idx) {
        const riskColors = { low: '#3aaa3a', medium: '#e8a23a', high: '#e85c2a', extreme: '#d23a3a' };
        const riskColor  = riskColors[plan.risk_tier] || '#888';
        const partialBadge = plan._partial
            ? '<span style="font-size:9px;color:#e8a23a;letter-spacing:.05em;text-transform:uppercase;padding:1px 5px;border-radius:3px;border:1px dashed #e8a23a;margin-left:4px;">partial</span>'
            : '';
        const card = document.createElement('div');
        card.className = 'wg-coa-card';
        card.style.cssText = [
            'border:1px solid #2a3140',
            'border-left:3px solid ' + riskColor,
            'border-radius:5px',
            'background:rgba(15,22,35,.65)',
            'padding:10px 12px',
            'font-size:12px',
            'line-height:1.45',
            'color:#ddd',
        ].join(';');

        const head = document.createElement('div');
        head.style.cssText = 'display:flex;align-items:baseline;gap:8px;margin-bottom:4px;';
        head.innerHTML = `
            <strong style="font-size:14px;color:#e6e6e6;">${escapeHtml(plan.name || '(unnamed)')}</strong>
            <span style="font-size:9px;color:${riskColor};text-transform:uppercase;letter-spacing:.05em;padding:1px 6px;border-radius:3px;border:1px solid ${riskColor};">${escapeHtml(plan.risk_tier || '?')}</span>
            ${partialBadge}
            <span style="margin-left:auto;font-size:11px;color:#9ab;">ETA ${plan.eta_hours != null ? plan.eta_hours : '?'}h</span>
        `;
        card.appendChild(head);

        const stats = document.createElement('div');
        stats.style.cssText = 'font-size:11px;color:#9ab;margin-bottom:5px;';
        stats.innerHTML = `Blue casualties: <strong style="color:#e6e6e6;">${plan.blue_casualty_p50 != null ? plan.blue_casualty_p50 : '?'}</strong> / ${plan.blue_casualty_p90 != null ? plan.blue_casualty_p90 : '?'} <span style="color:#777;">(p50 / p90)</span>`;
        card.appendChild(stats);

        if (plan.rationale) {
            const rat = document.createElement('div');
            rat.style.cssText = 'font-size:12px;color:#bbb;font-style:italic;margin-bottom:6px;';
            rat.textContent = plan.rationale;
            card.appendChild(rat);
        }

        if (Array.isArray(plan.plan) && plan.plan.length) {
            const steps = document.createElement('div');
            steps.style.cssText = 'font-size:11px;color:#bbb;margin-bottom:6px;';
            steps.innerHTML = plan.plan.map(s => `<div style="padding-left:14px;text-indent:-14px;">&#9656; ${escapeHtml(s)}</div>`).join('');
            card.appendChild(steps);
        }

        if (Array.isArray(plan.key_assumptions) && plan.key_assumptions.length) {
            const asmp = document.createElement('div');
            asmp.style.cssText = 'font-size:10px;color:#789;margin-bottom:6px;';
            asmp.innerHTML = '<span style="text-transform:uppercase;letter-spacing:.05em;">Assumptions:</span> ' + plan.key_assumptions.map(escapeHtml).join(' · ');
            card.appendChild(asmp);
        }

        const useBtn = document.createElement('button');
        useBtn.type = 'button';
        useBtn.className = 'wargame-action-btn primary';
        useBtn.style.cssText = 'margin-top:4px;font-size:11px;padding:4px 10px;';
        useBtn.textContent = 'Use this plan';
        useBtn.addEventListener('click', (ev) => { ev.stopPropagation(); usePlanInCoa(plan); });
        card.appendChild(useBtn);

        return card;
    }

    // Activate a chosen plan as the wargame's "live" COA. Subsequent
    // adjudicate steps run the headless Blue+Red propose+execute loop
    // first, animating real unit markers based on the AI's per-step
    // decisions that advance THIS plan.
    function setActiveCoa(plan, opts = {}) {
        activeCoa = plan || null;
        if (opts.persist !== false) rememberActiveCoa(activeCoa);
        console.log('[setActiveCoa] activeCoa is now:', activeCoa ? activeCoa.name : '(null)');
        const banner = $('wg-adj-coa-active-banner');
        const nameEl = $('wg-adj-coa-active-name');
        const riskEl = $('wg-adj-coa-active-risk');
        if (!banner) { console.warn('[setActiveCoa] banner element missing'); return; }
        if (!plan) {
            banner.style.display = 'none';
            return;
        }
        // Render the banner. flex display matches the css set in renderShell.
        banner.style.display = 'flex';
        if (nameEl) nameEl.textContent = plan.name || '(unnamed plan)';
        const riskColors = { low: '#3aaa3a', medium: '#e8a23a', high: '#e85c2a', extreme: '#d23a3a' };
        const color = riskColors[plan.risk_tier] || '#888';
        if (riskEl) {
            riskEl.textContent     = plan.risk_tier || '?';
            riskEl.style.color     = color;
            riskEl.style.border    = '1px solid ' + color;
        }
    }

    function clearActiveCoa() {
        if (!activeCoa) return;
        const name = activeCoa.name || '(plan)';
        activeCoa = null;
        rememberActiveCoa(null);
        const banner = $('wg-adj-coa-active-banner');
        if (banner) banner.style.display = 'none';
        setStatus(`Plan "${name}" deactivated. Adjudicator runs without per-step AI proposals.`, 'idle');
    }

    // Heuristic mapping from a chosen plan → the existing Reserve hr +
    // Posture form inputs. Parses "H+N" from plan steps for reserve timing
    // and risk_tier for posture. Operator can always override after.
    function usePlanInCoa(plan) {
        const reserveEl = $('wg-adj-coa-reserve');
        const postureEl = $('wg-adj-coa-posture');
        const weatherEl = $('wg-adj-coa-weather');
        const seedEl    = $('wg-adj-seed');

        // posture: hasty for high/extreme risk, deliberate otherwise.
        const posture = (plan.risk_tier === 'high' || plan.risk_tier === 'extreme') ? 'hasty' : 'deliberate';

        // reserve hour: prefer an explicit "commit reserve at H+N" mention
        // in plan steps; fall back to plan.eta_hours / 2 (rough half-life heuristic).
        let reserveHr = null;
        const planText = (plan.plan || []).join(' ');
        const m = planText.match(/commit\s+(?:1\s*AD\s+)?reserve.*?H\+(\d+)/i)
              || planText.match(/reserve\s+at\s+H\+(\d+)/i);
        if (m) reserveHr = parseInt(m[1], 10);
        else if (plan.eta_hours) reserveHr = Math.round(plan.eta_hours / 2);

        // weather: parse from plan text, default to clear.
        const wxMatch = planText.match(/weather[=:\s]+(clear|overcast|storm|night)/i);
        const weather = wxMatch ? wxMatch[1].toLowerCase() : 'clear';

        if (postureEl)             postureEl.value = posture;
        if (reserveEl && reserveHr != null) reserveEl.value = String(reserveHr);
        if (weatherEl)             weatherEl.value = weather;
        // Trial seed gets the plan name so MC runs are identifiable.
        if (seedEl) seedEl.value = (plan.name || 'manual').replace(/\s+/g, '-').toLowerCase();

        // Activate the plan. Fast mode uses the plan's posture/reserve
        // settings during adjudication and lets the scenario map progression
        // move markers immediately.
        setActiveCoa(plan);

        setStatus(`Plan "${escapeHtml(plan.name || 'plan')}" applied (posture=${posture}, reserve=H+${reserveHr || '?'}). Mock off will use live Ollama; Mock on replays baseline.`, 'ok');
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

    // ── AAR lessons (item #5) ───────────────────────────────────────
    // Fetches recent lessons for the active scenario and populates the
    // collapsible area in the HUD. Called after each adjudication so the
    // list stays fresh if the operator wrote a lesson on the server.
    async function loadLessons(scenarioName) {
        const area = $('wg-adj-lessons-area');
        const list = $('wg-adj-lessons-list');
        const cnt  = $('wg-adj-lessons-count');
        if (!area || !list || !cnt) return;
        if (!scenarioName) { area.style.display = 'none'; return; }
        try {
            const res = await fetch(`/api/ai/lessons?scenario=${encodeURIComponent(scenarioName)}&limit=5`);
            if (!res.ok) { area.style.display = 'none'; return; }
            const data = await res.json().catch(() => null);
            const lessons = (data && Array.isArray(data.lessons)) ? data.lessons : [];
            area.style.display = 'block';
            cnt.textContent = lessons.length ? `(${lessons.length})` : '(none)';
            list.innerHTML = '';
            for (const l of lessons) {
                const cat = l.category ? `<span style="color:#b87;">[${escapeHtml(l.category)}]</span> ` : '';
                const nar = l.narrative ? ` — ${escapeHtml(l.narrative.slice(0, 250))}` : '';
                const div = document.createElement('div');
                div.style.cssText = 'padding:3px 4px;border-bottom:1px solid #2a3140;line-height:1.4;';
                div.innerHTML = `${cat}<strong>${escapeHtml(l.title)}</strong>${nar}`;
                list.appendChild(div);
            }
        } catch (_) { /* silently ignore */ }
    }
    function toggleLessons() {
        const list = $('wg-adj-lessons-list');
        if (!list) return;
        list.style.display = list.style.display === 'none' ? 'block' : 'none';
    }
    function toggleLessonForm(show) {
        const f = $('wg-adj-lessons-form');
        if (!f) return;
        f.style.display = show ? 'block' : 'none';
        if (!show) {
            $('wg-adj-les-title').value = '';
            $('wg-adj-les-narrative').value = '';
            $('wg-adj-les-author').value = '';
            $('wg-adj-les-category').value = 'general';
        }
    }
    async function postLesson() {
        const title     = $('wg-adj-les-title');
        const narrative = $('wg-adj-les-narrative');
        const category  = $('wg-adj-les-category');
        const author    = $('wg-adj-les-author');
        const status    = $('wg-adj-les-status');
        if (!title || !narrative || !category || !author || !status) return;
        const t = title.value.trim();
        if (!t) { status.textContent = 'Title required.'; return; }
        status.textContent = 'saving…';
        const body = {
            scenarioName: trial && trial.scenarioName || 'default',
            title: t,
            category: category.value || 'general',
            narrative: narrative.value.trim().slice(0, 2000) || '',
            author: author.value.trim() || 'operator',
        };
        try {
            const res = await fetch('/api/ai/lessons', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const r = await res.json().catch(() => ({ ok: false }));
            if (r.ok) {
                status.textContent = 'Saved.';
                toggleLessonForm(false);
                loadLessons(trial && trial.scenarioName);
            } else {
                status.textContent = `Error: ${(r && r.error) || 'unknown'}`;
            }
        } catch (e) {
            status.textContent = `Failed: ${(e && e.message) || 'network'}`;
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
        if (!scenarioCache) await ensureScenarioLoaded();
        const nextIndex = (trial.stepIndex || 0) + 1;
        const maxStep = scenarioCache && Array.isArray(scenarioCache.steps) ? scenarioCache.steps.length - 1 : 11;
        if (nextIndex > maxStep) {
            setStatus(`Trial complete at step ${maxStep}. Click Reset to start a new trial.`, 'idle');
            return;
        }

        // ── COA-driven dynamic execution ─────────────────────────────
        // When a plan is active, BEFORE adjudicating the step we ask the
        // AI to propose Blue moves (informed by the chosen plan) and Red
        // moves (its own reaction), then animate the real markers on the
        // map. The proposed actions are auto-recorded into AppApprovedActions
        // for this step so the adjudicator that follows sees them as the
        // PROPOSED ACTIONS block — fusing tactical AI with strategic AI.
        tacticalMovesAppliedThisStep = false;
        // Live tactical AI = Blue/Red propose-and-execute on this step.
        // The old gate (`activeCoa.live_ai === true`) was dead — that flag
        // is checked here but never set by the COA generator or any UI
        // control, so the AI loop never fired. Tie it instead to the
        // existing Mock-mode toggle (default OFF when AI backend is up):
        //   mockMode OFF + AI loaded + COA active → run tactical AI
        //   mockMode ON                            → fast path (no AI calls)
        // Explicit per-plan opt-out still wins via `activeCoa.live_ai === false`.
        const aiAvailable = !!(window.AppRedTeam && typeof window.AppRedTeam.proposeAndExecuteHeadless === 'function');
        const planOptOut  = activeCoa && activeCoa.live_ai === false;
        const liveTacticalCoa = !!activeCoa && !req.mockMode && aiAvailable && !planOptOut;
        console.log('[adj-next] activeCoa =', activeCoa ? activeCoa.name : '(none)',
                    '| mockMode =', !!req.mockMode,
                    '| aiAvailable =', aiAvailable,
                    '| live tactical AI =', liveTacticalCoa);
        if (liveTacticalCoa) {
            console.log('[adj-next] entering COA-driven loop for', activeCoa.name);
            setStatus(`Step ${nextIndex} · "${activeCoa.name}" — AI planning Blue moves…`, 'active');
            try {
                const blueResult = await window.AppRedTeam.proposeAndExecuteHeadless({
                    side: 'blue',
                    coaContext: activeCoa,
                    turn: nextIndex,
                    provider: req.provider,
                });
                console.log('[adj-next] Blue propose result:', blueResult);
                const blueExec = blueResult && blueResult.execution || {};
                const blueCount = Number.isFinite(blueExec.executed) ? blueExec.executed : (blueResult && blueResult.actions
                    ? blueResult.actions.filter(a => a.validation && a.validation.ok).length : 0);
                const blueMoves = Number(blueExec.moved) || 0;
                setStatus(`Step ${nextIndex} · ${blueCount} Blue moves executed — AI planning Red counter…`, 'active');

                const redResult = await window.AppRedTeam.proposeAndExecuteHeadless({
                    side: 'red',
                    turn: nextIndex,
                    provider: req.provider,
                });
                console.log('[adj-next] Red propose result:', redResult);
                const redExec = redResult && redResult.execution || {};
                const redCount = Number.isFinite(redExec.executed) ? redExec.executed : (redResult && redResult.actions
                    ? redResult.actions.filter(a => a.validation && a.validation.ok).length : 0);
                const redMoves = Number(redExec.moved) || 0;
                const moveCount = blueMoves + redMoves;
                const engageCount = (Number(blueExec.engaged) || 0) + (Number(redExec.engaged) || 0);
                const heldCount = (Number(blueExec.held) || 0) + (Number(redExec.held) || 0);
                tacticalMovesAppliedThisStep = moveCount > 0;
                if ((blueCount + redCount) > 0) await sleep(800);
                setStatus(`Step ${nextIndex} - ${blueCount} Blue, ${redCount} Red effects (${moveCount} move, ${engageCount} engage, ${heldCount} hold). Adjudicating outcomes...`, 'active');
                setStatus(`Step ${nextIndex} · ${blueCount} Blue, ${redCount} Red moves executed. Adjudicating outcomes…`, 'active');
                setStatus(`Step ${nextIndex} - ${blueCount} Blue, ${redCount} Red effects (${moveCount} move, ${engageCount} engage, ${heldCount} hold). Adjudicating outcomes...`, 'active');
            } catch (e) {
                // Don't block adjudication on a propose failure; the operator
                // sees a warning but the step still resolves on the scenario
                // baseline / previous state.
                setStatus(`Step ${nextIndex} · AI propose failed (${e && e.message || 'unknown'}), adjudicating anyway…`, 'active');
            }
        } else if (activeCoa) {
            console.log('[adj-next] fast COA path for', activeCoa.name);
            const modeTxt = req.mockMode ? 'baseline' : 'live AI';
            setStatus(`Step ${nextIndex} - "${escapeHtml(activeCoa.name || 'COA')}" ${modeTxt} adjudication...`, 'active');
        } else {
            setStatus(`Adjudicating step ${nextIndex}…`, 'active');
        }

        // Pull any approved Red/Blue actions — either from the manual flow
        // (operator clicked Execute on red-team panel) or from the COA loop
        // above (proposeAndExecuteHeadless calls recordApproved internally).
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
            provider:       req.provider,
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
        const tag = r.ok ? '' : ` [${r.validation && r.validation.fallback}]`;
        const cls = classifyRun(r);
        setStatus(`Step ${nextIndex} resolved in ${wall} ms${tag}.`, cls.kind);
    }

    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    // ── Walk every step in sequence (count from scenario.steps.length) ───
    async function runOneTrial() {
        if (!trial) trial = window.AppScenarioState.create({ scenarioName: SCENARIO_DEFAULT });
        window.AppScenarioState.reset(trial);
        if (window.AppAdjudicatorMap) window.AppAdjudicatorMap.resetMap();
        const req = currentRequest();
        const sc  = await ensureScenarioLoaded();
        const stepCount = (sc && Array.isArray(sc.steps)) ? sc.steps.length : 12;
        const lastStep  = stepCount - 1;
        const paceMs = Math.max(0, Number(($('wg-adj-pace-ms') && $('wg-adj-pace-ms').value) || 1200));
        // Per-trial mode tally so the closing line tells the truth about
        // what actually ran instead of just "N fallback step(s)".
        const modeCounts = { live: 0, mock: 0, fallback: 0, model_error: 0, validation_error: 0, parse_error: 0 };
        const fallbackReasons = {};
        for (let i = 1; i <= lastStep; i++) {
            setStatus(`Trial step ${i}/${lastStep}…`, 'active');
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
                provider:       req.provider,
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
            const fb = (r.validation && r.validation.fallback) || '';
            if (fb) fallbackReasons[fb] = (fallbackReasons[fb] || 0) + 1;
            // Pace the playback so map effects (BLS color shifts, Blue
            // squares fading, phase-line creep) are visible step by step.
            // In mock mode each call is ~5 ms; without this delay you'd
            // never see the progression. In live Ollama mode each step is
            // already ~100 s so paceMs adds little.
            if (i < 11 && paceMs > 0) await sleep(paceMs);
        }
        const modeLabels = {
            live: 'Live', mock: 'Mock', model_error: 'Model err',
            validation_error: 'Validation err', parse_error: 'Parse err', fallback: 'Fallback',
        };
        const modeColors = {
            live: '#1a6b3a', mock: '#8a7520', model_error: '#7a2a2a',
            validation_error: '#7a4a2a', parse_error: '#6a4a2a', fallback: '#6a5a2a',
        };
        const parts = [];
        for (const [m, count] of Object.entries(modeCounts)) {
            if (count > 0 && modeLabels[m]) {
                const color = modeColors[m] || '#555';
                parts.push(`<span style="color:${color};font-weight:600;">${modeLabels[m]} ${count}</span>`);
            }
        }
        const errorCount = modeCounts.model_error + modeCounts.validation_error + modeCounts.parse_error + modeCounts.fallback;
        if (errorCount) {
            const detail = Object.entries(fallbackReasons).map(([k, v]) => `${v}×${k}`).join(', ');
            parts.push(`<span style="color:#888;">(${detail})</span>`);
        }
        const ok = errorCount === 0;
        setStatus(`Trial complete \u2014 ${parts.join(' \xb7 ')}.`, ok ? 'ok' : (modeCounts.model_error ? 'error' : 'warning'));
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
        clearLastMode();
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
            provider:     req.provider,
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
        // Per-trial step count = scenario.steps.length − 1 (number of step
        // transitions). W1/W2 = 11; W3 = 16. Fall back to 11 if scenario
        // wasn't loaded yet.
        const stepsPerTrial = (scenarioCache && Array.isArray(scenarioCache.steps) && scenarioCache.steps.length)
            ? scenarioCache.steps.length - 1 : 11;
        const expected = body.trials * stepsPerTrial;

        mcRunSubscription = window.AppAdjudicator.mcSubscribe(r.runId, (evt, data) => {
            if (evt === 'progress') {
                progress++;
                $('wg-adj-mc-progress').textContent = `Trial ${data.trial} step ${data.step}/${stepsPerTrial} — PL ${data.phase_line_km} km, OBJ ${data.objective_status} (${progress}/${expected})`;
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
            } else if (evt === 'connection-lost') {
                if (window.AppAdjudicator.isMcRunning()) {
                    setStatus('MC event stream disconnected; the run may still be finishing on the server.', 'warning');
                }
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
        root.querySelector('#wg-adj-3d-btn').addEventListener('click', toggle3DGlobe);
        root.querySelector('#wg-adj-step-btn').addEventListener('click', async () => { await ensureScenarioLoaded(); adjudicateNext(); });
        root.querySelector('#wg-adj-trial-btn').addEventListener('click', async () => { await ensureScenarioLoaded(); runOneTrial(); });
        root.querySelector('#wg-adj-reset-btn').addEventListener('click', resetTrial);
        root.querySelector('#wg-adj-mc-btn').addEventListener('click', startMc);
        root.querySelector('#wg-adj-mc-cancel').addEventListener('click', cancelMc);
        // COA generator buttons (AI co-pilot). Provider pill change triggers
        // a no-op handler so the selection persists across renders without
        // a page reload.
        const coaBtn = root.querySelector('#wg-adj-coa-btn');
        if (coaBtn) coaBtn.addEventListener('click', handleCoaGenerate);
        const coaClear = root.querySelector('#wg-adj-coa-clear');
        if (coaClear) coaClear.addEventListener('click', clearCoaCards);
        // Deactivate the active plan — adjudicate steps return to baseline
        // behaviour (no headless AI propose loop). The Use-this-plan button
        // on any COA card re-activates a plan.
        const coaDeact = root.querySelector('#wg-adj-coa-deactivate');
        if (coaDeact) coaDeact.addEventListener('click', clearActiveCoa);
        const refresh = root.querySelector('#wg-adj-backend-refresh');
        if (refresh) refresh.addEventListener('click', () => {
            const text = $('wg-adj-backend-text');
            if (text) text.textContent = 'Re-probing backend…';
            probeAiHealth();
        });
        // Mock toggle warning (items 1+3).
        const mockToggle = root.querySelector('#wg-adj-mock');
        const mockWarn   = root.querySelector('#wg-adj-mock-warning');
        if (mockToggle && mockWarn) {
            mockToggle.addEventListener('change', () => {
                mockWarn.style.display = mockToggle.checked ? 'block' : 'none';
            });
        }
        // Feedback buttons (item #9).
        const fbA = root.querySelector('#wg-adj-fb-accept');
        const fbR = root.querySelector('#wg-adj-fb-reject');
        const fbN = root.querySelector('#wg-adj-fb-note');
        if (fbA) fbA.addEventListener('click', () => postFeedback('accept'));
        if (fbR) fbR.addEventListener('click', () => postFeedback('reject'));
        if (fbN) fbN.addEventListener('click', () => postFeedback('note'));
        // AAR lessons toggle (item #5).
        const lt = root.querySelector('#wg-adj-lessons-toggle');
        if (lt) lt.addEventListener('click', toggleLessons);
        const lw = root.querySelector('#wg-adj-lessons-write');
        if (lw) lw.addEventListener('click', () => toggleLessonForm(true));
        const lc = root.querySelector('#wg-adj-les-cancel');
        if (lc) lc.addEventListener('click', () => toggleLessonForm(false));
        const ls = root.querySelector('#wg-adj-les-submit');
        if (ls) ls.addEventListener('click', postLesson);
    }

    // ── Boot ─────────────────────────────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
