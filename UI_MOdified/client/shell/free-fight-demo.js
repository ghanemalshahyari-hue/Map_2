/* ============================================================================
 * free-fight-demo.js — DOC-UNDERSTANDING-1 / FREE-FIGHT-DEMO-A
 * ----------------------------------------------------------------------------
 * A SYMBOLIC action–reaction demo on the multi-country Step 1 output:
 *   RED attacks Objective X  →  BLUE coalition reacts to protect / intercept.
 *
 * THIS IS NOT TACTICAL TRUTH and NOT a wargame:
 *   - no final tasking, no final COA, no weapons, no damage, no kill probability
 *   - no doctrine execution, no WHITE adjudication, no permanent world-state write
 *   - demo groups are temporary visual overlays (demo_only / review_only);
 *     exact_unit_position stays false; nothing is created/approved/journaled.
 *
 * Reuses RmoozDemoUnits.buildGroupsFromAnchors (groups anchored on
 * placement_candidates) + RmoozSymbolRegistry (glyphs) + RmoozBaseStatusPanel
 * (base markers still open the base card). Pure state + math run headless in
 * Node; the Leaflet layer + control panel render only when a map is present.
 *
 *   window.RmoozFreeFightDemo = {
 *     mount(payload)          — init + (browser) build panel/markers
 *     init(payload, opts)     — build groups; opts.objective reuses a set point
 *     setObjective({lat,lon}) — place/replace Objective X, re-select sample
 *     clearObjective()        — remove Objective X + the demo sample
 *     start() pause() reset() step() clear()
 *     getState() getGroups() getRed() getBlue() getObjective()
 *   }
 * ========================================================================== */
(function (root) {
    'use strict';

    var RED_ATTACK = 2, BLUE_REACT = 3;     // sample sizes (nearest to Objective X)
    var STEP = 0.1, TICK_MS = 90;
    var BLUE_RING = 0.35;                    // BLUE intercept standoff (fraction of anchor→obj dist)

    var _payload = null, _objective = null;
    var _allGroups = [], _red = [], _blue = [], _anchors = [];
    var _progress = 0, _running = false, _paused = false, _timer = null;
    var _layer = null, _panel = null, _card = null, _aiPanel = null, _cmdrPanel = null;
    var _winState = null, _viewportResizeHandler = null;
    var _plan = null, _terrain = { available: false }, _objectiveSource = null;
    var _aiDecision = null, _aiLoading = false, _aiApplied = false, _aiDiagnostics = null;
    var _aiMovedUnit = null, _aiMovedUnitOldPos = null, _aiMovedUnitSource = null;
    var _useLlm = false, _llmTestStatus = null;
    // FREEFIGHT-AI-COA-PLANNER-A: multi-unit COA state
    var _coaPlan = null, _coaLoading = false, _coaApplied = false, _coaSelectedIdx = 0;
    var _coaMovedUnits = [];  // [{unit, oldPos}, ...] — only units that VISIBLY moved
    // FREEFIGHT-BLUE-THREAT-AWARE-MOVEMENT-A: a unit whose move is below this is
    // "already in position" — not counted as moved (so zero/tiny moves aren't faked).
    var MIN_VISIBLE_MOVE_DEG = 0.003;
    var _coaHeldCount = 0;    // units already in position (move below epsilon)
    // RMOOZ-COA-COMMIT-EXECUTION-L: "COA Commitment Mode" — the operator commits ONE generated COA and
    // RMOOZ executes it phase-by-phase, deterministically, with NO LLM call on normal ticks. AI is
    // re-engaged ONLY when a replan trigger fires or the operator clicks Replan. This is an ADDITIONAL
    // mode alongside the AI-every-turn loop (which is unchanged).
    var _coaExec = null;        // active_coa_execution_state (see _commitCoa) | null
    var _coaExecTimer = null;   // setInterval handle for the committed-COA tick loop
    var COA_EXEC_STUCK_TICKS = 4;       // phase makes no progress for this many ticks → replan trigger
    var COA_EXEC_FORCE_LOSS_FRAC = 0.5; // active-side units missing above this fraction → replan trigger
    // RMOOZ-FREE-FIGHT-CONTINUOUS-SCENARIO-AA: continuous scenario runtime (orchestrates committed-COA
    // execution + deterministic White adjudication + deterministic Red reaction + Green updates). null = idle.
    var _scenario = null;
    var _scenarioTimer = null;          // setInterval handle for the scenario loop
    var _scenarioAutoContinue = false;  // RMOOZ-FREE-FIGHT-AUTO-SCENARIO-DIRECTOR-AB: operator "Auto Continue" toggle (persists across scenarios)
    // FREEFIGHT-AI-CONTINUOUS-COMMANDER-LOOP-A: continuous AI commander loop state
    var _turnNumber = 0;
    var _activeSide = 'RED';
    var _loopRunning = false, _loopPaused = false;
    var _freeFightSpeed = 'x1';
    var _lastCommanderDecision = null; // { turn, side, coa_id, coa_title, source, moved, rationale[], expected[], summary }
    var _turnLog = [];                 // newest-last list of per-turn records
    var _pendingTimer = null;          // setTimeout handle for next turn
    var _moveAnimTimer = null;         // setInterval handle for cinematic movement
    var _loopAllUnitsForReset = [];    // [{unit, origPos}] captured at loop start for full reset
    // RMOOZ-AI-FREE-FIGHT-AI-ONLY-A: the "AI Commander Free Fight" card is AI-ONLY. No LLM = no
    // movement (no deterministic/fallback/fast animation in this card). _aiUnavailableMsg is the
    // operator message; _aiOnlyGate enforces it for the LIVE loop. A test seam can relax the gate
    // for the loop-MECHANICS suites (the deterministic planner is allowed "for tests", not the card).
    var _aiUnavailableMsg = null;
    var _aiOnlyGate = true;
    var _captureRawLlm = false;        // RMOOZ-AI-FREE-FIGHT-REAL-AI-TEST-A: ask the server for the raw LLM output (E2E proof)
    var _lastLoopPlan = null;          // the actual plan the LIVE loop last received (for the real-LLM E2E)
    // RMOZ-INTEL-CAPABILITY-TERRAIN-ZONE-A: recent COA families (for variation) + last intel snapshot
    var _coaFamilyHistory = [];        // newest-last list of recommended_coa_family strings
    var _lastIntel = null;             // last plan.intel snapshot (for the Intel Snapshot UI block)
    // RMOZ-COMMANDER-BRIEF-COALITION-A: last commander brief (prose + coalition posture)
    var _lastBrief = null;
    var _briefExpanded = false;        // operator toggles the full copyable brief
    var _mcpPromptExpanded = false;    // RMOOZ-AI-ATTACK-PLAN-MCP-PROMPT-A: "View MCP Prompt" toggle
    // FREEFIGHT-LLM-CAPABILITY-ANALYST-A: last capability summary (best assets per mission)
    var _lastCapability = null;
    // RMOZ-AI-TOOL-CONTRACT-A: last tool-contract record
    var _lastToolContract = null;
    // FREEFIGHT-COA-ROUTE-JSON-GUARD-A: planner route health probe result
    var _routeHealth = null;           // { ok, allow_sim_run, ai_execution_enabled, model_available, provider, model, reason_if_blocked } | { ok:false, reason }
    var _routeUnavailableMsg = null;   // set when a plan fetch returns non-JSON / 405
    // RMOOZ-LOCAL-MODEL-SELECTOR-A: local model picker state (mirrors the global header HUD).
    var _modelInfo = null;             // last /api/ai/models payload
    var _benchBusy = false;            // RMOOZ-OFFLINE-AGENT-ARCHITECTURE-P: warmup/benchmark in flight
    var _benchResult = null;           // last /api/ai/benchmark payload
    var _warmupResult = null;          // last /api/ai/warmup payload
    var _greenWorld = null;            // RMOOZ-GREEN-WORLD-UI-R: last /neutral-world assessment
    var _greenBusy = false;            // a Green refresh is in flight (debounce)
    var _greenOverlayOn = false;       // map risk-ring overlay toggle (default OFF)
    var _greenLayer = null;            // Leaflet layer group for the Green risk ring (review-only)
    var _decisionLog = [];             // RMOOZ-AI-SCHEDULER-DECISION-LOG-S: in-memory audit buffer (record-only)
    var DECISION_LOG_CAP = 200;
    var _whiteAdvisoryLevel = null;    // RMOOZ-WHITE-GREEN-ANNOTATION-T: last recorded White advisory level (dedup)
    var _greenScoringKey = null;       // RMOOZ-GREEN-WHITE-SCORING-T: last recorded green-advisory scoring key (dedup)
    var _ffTab = 'operator';           // RMOOZ-FREE-FIGHT-CONTROL-WINDOW-REBUILD-W: active tab (operator|coa_plans|green|white|diagnostics)
    var _ffLegacyOpen = false;         // RMOOZ-FREE-FIGHT-CONTROL-HARD-RESET-X: "Diagnostics / Legacy" drawer (closed by default; body renders ONLY when open)
    var _pendingModel = null;          // dropdown's current (uncommitted) value
    // RMOOZ-AI-USER-FRIENDLY-MODEL-FLOW-A: the operator-facing simple model flow.
    // _modelPickerOpen = the "Select AI Model" picker toggle; _autoSelectedModel guards the
    // auto-select so it fires at most once per available single model (no select→refetch loop).
    var _modelPickerOpen = false;
    var _autoSelectedModel = null;
    // FREEFIGHT-MANUAL-MAP-CAMERA-A: the camera stays where the operator left it.
    // AI movement NEVER pans/zooms/fitBounds the map unless mode is 'follow'.
    var _freeFightCameraMode = 'manual'; // 'manual' (default) | 'follow'
    // RMOOZ-AI-COMMANDER-FREEDOM-A: AI Commander Mode —
    //   'controlled'    : doctrine-guided (intercept/defend bias)
    //   'free'          : free tactical reasoning (recon/flank/delay/deceive/withdraw/…)
    //   'high_variation': creative, rotates the recommended approach each cycle
    // RMOOZ-AI-COMMANDER-FREEDOM-B: default to High Variation while testing AI freedom, so
    // the app exercises genuine tactical variety out of the box. Controlled stays available
    // as an explicit operator option (it keeps the doctrine-guided intercept/overlay path).
    var _commanderMode = 'high_variation';
    var FF_COMMANDER_MODES = {
        controlled:     { label: 'Controlled' },
        free:           { label: 'Free Tactical' },
        high_variation: { label: 'High Variation' },
    };
    // RMOOZ-AI-COA-PERFORMANCE-A: AI planning depth —
    //   'fast'   : heuristic capability, NO LLM analyst, terrain summary only (no DEM sampling) — quickest
    //   'normal' : current behavior (LLM analyst/commander when enabled), real terrain
    //   'deep'   : full LLM + full terrain/provenance; Generate-5 re-runs the LLM per seed
    var _aiDepth = 'normal';
    var FF_AI_DEPTHS = {
        fast:   { label: 'Fast' },
        normal: { label: 'Normal' },
        deep:   { label: 'Deep' },
    };
    // RMOOZ-AI-COMMANDER-REPAIR-LOOP-A: planning mode — 'commander' (LLM drafts + RMOOZ validates/
    // repairs) is the demo default; 'staff_safe' = deterministic staff planner (also the auto-fallback).
    var _planningMode = 'commander';
    var _coaLoadingStart = 0;   // ms when the current Generate started (for the live "thinking" timer)
    var _coaLoadingTimer = null;
    // Cinematic speeds: decisionDelayMs between turns, moveAnimMs per move animation.
    var FF_SPEEDS = {
        x1:    { decisionDelayMs: 8000, moveAnimMs: 6000, label: 'x1' },
        x5:    { decisionDelayMs: 3000, moveAnimMs: 2500, label: 'x5' },
        x15:   { decisionDelayMs: 1200, moveAnimMs: 1000, label: 'x15' },
        fire:  { decisionDelayMs: 500,  moveAnimMs: 450,  label: '🔥' },
        fire2: { decisionDelayMs: 120,  moveAnimMs: 120,  label: '🔥🔥' },
    };
    var FF_SPEED_ORDER = ['x1', 'x5', 'x15', 'fire', 'fire2'];
    // Canonical display order for unit roles — RED attack roles, then BLUE defense
    // roles, then reserve/hold. Any future role still renders (appended).
    var FF_ROLE_DISPLAY_ORDER = ['assault', 'support', 'screen', 'recon', 'reinforce', 'intercept', 'defend', 'reserve', 'hold'];
    function _orderedRoleKeys(rb) {
        if (!rb) return [];
        var seen = {};
        var keys = FF_ROLE_DISPLAY_ORDER.filter(function (r) { if (rb[r] > 0) { seen[r] = 1; return true; } return false; });
        Object.keys(rb).forEach(function (r) { if (rb[r] > 0 && !seen[r]) keys.push(r); });
        return keys;
    }
    var _plannerMode = 'deterministic';
    var _planSource = 'deterministic';
    var _llmStatus = {
        state: 'idle',
        message: '',
        validation_result: 'not_requested',
        fallback_reason: null,
    };
    var _llmRequestSeq = 0;

    function W() { return (typeof window !== 'undefined') ? window : root; }
    function mapReady() { var w = W(); return !!(w && w.L && w.map && typeof w.L.layerGroup === 'function'); }
    function arr(v) { return Array.isArray(v) ? v : []; }
    // FREE-FIGHT-AI-LITE-A: deterministic planner + injected terrain results.
    function aiPlanner() { var w = W(); if (w && w.RmoozFreeFightAI) return w.RmoozFreeFightAI; try { return require('./free-fight-ai.js'); } catch (_) { return null; } }
    function num(v) { var n = Number(v); return Number.isFinite(n) ? n : null; }
    function cloneLL(o) { return o ? { lat: num(o.lat), lon: num(o.lon) } : null; }
    function finiteLL(o) { return !!(o && Number.isFinite(o.lat) && Number.isFinite(o.lon)); }
    function lerp(a, b, t) { return { lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t }; }
    function dist2(a, b) { var dx = a.lat - b.lat, dy = a.lon - b.lon; return dx * dx + dy * dy; }
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
    function clearTimer() { if (_timer) { try { clearInterval(_timer); } catch (_) {} _timer = null; } }

    // Reuse a set objective if the brief already has one; else null (operator places it).
    function deriveObjective(payload) {
        var ob = (payload && payload.brief && payload.brief.operational_brief) || (payload && payload.operational_brief) || {};
        var objs = Array.isArray(ob.objectives) ? ob.objectives : [];
        for (var i = 0; i < objs.length; i++) {
            var o = objs[i];
            if (o && Array.isArray(o.coord) && o.coord.length >= 2 && Number.isFinite(+o.coord[0]) && Number.isFinite(+o.coord[1])) {
                return { lat: +o.coord[1], lon: +o.coord[0] };   // coord = [lon,lat]
            }
            if (o && Number.isFinite(+o.lat) && Number.isFinite(+o.lon)) return { lat: +o.lat, lon: +o.lon };
        }
        var ao = ob.area_of_operations || {};
        if (Array.isArray(ao.center) && ao.center.length === 2 && Number.isFinite(+ao.center[0]) && Number.isFinite(+ao.center[1])) {
            return { lat: +ao.center[1], lon: +ao.center[0] };
        }
        return null;
    }

    function buildGroups(payload) {
        var DU = (W() && W().RmoozDemoUnits) || (typeof require === 'function' ? safeRequire() : null);
        var groups = (DU && typeof DU.buildGroupsFromAnchors === 'function') ? DU.buildGroupsFromAnchors(payload) : [];
        if (!groups.length && DU && typeof DU.buildDemoUnits === 'function') groups = DU.buildDemoUnits(payload).groups || [];
        return groups.filter(function (g) { return finiteLL(g && g.anchor); });
    }
    function safeRequire() { try { return require('./demo-units.js'); } catch (_) { return null; } }
    // Base anchors (placement_candidates) carry coords + site_type — used by
    // DOMAIN-AWARE-MOVEMENT-A to find a coastal approach point for naval groups.
    function anchorsOf(payload) {
        var ob = (payload && payload.brief && payload.brief.operational_brief) || (payload && payload.operational_brief) || payload || {};
        return arr(ob.placement_candidates).filter(function (c) { return c && finiteLL({ lat: num(c.lat), lon: num(c.lon) }); });
    }

    // BLUE intercept point: a defensive standoff between Objective X and the BLUE
    // group's home base (on the bearing from X toward that base).
    function interceptPoint(anchor, obj) {
        return lerp(obj, anchor, BLUE_RING);
    }

    // DOMAIN-AWARE-MOVEMENT-A: route each demo group by movement domain so ships
    // don't glide straight into an inland Objective X and support units hold.
    // window-only resolver with a Node require fallback (pure helper); review-only.
    function domainMovement() { var w = W(); if (w && w.RmoozDomainMovement) return w.RmoozDomainMovement; try { return require('./domain-movement.js'); } catch (_) { return null; } }
    function domainize(pg) {
        if (!pg) return pg;
        var DM = domainMovement();
        if (!DM || typeof DM.buildDemoRoute !== 'function') { pg.movement_domain = null; pg.route_type = 'unknown_direct'; pg.route = null; return pg; }
        var dest = finiteLL(pg.target) ? { lat: pg.target.lat, lon: pg.target.lon } : (finiteLL(_objective) ? cloneLL(_objective) : null);
        var route = DM.buildDemoRoute(pg, dest, _anchors);   // pg carries anchor + category_counts + unit_intel_summary
        pg.movement_domain = route.movement_domain;
        pg.route_type = route.route_type;
        pg.route = route;
        // The marker glides to the route's TERMINAL waypoint (naval → coastal
        // approach; support → hold at anchor; air/ground → destination).
        var term = arr(route.waypoints).length ? route.waypoints[route.waypoints.length - 1] : null;
        if (term && Number.isFinite(term.lat) && Number.isFinite(term.lng)) pg.target = { lat: term.lat, lon: term.lng };
        arr(route.warnings).forEach(function (w) { if (pg.plan_warnings.indexOf(w) === -1) pg.plan_warnings.push(w); });
        return pg;
    }
    function applyPlanToGroups(plan, source) {
        _plan = plan || null;
        _planSource = source || 'deterministic';
        var byId = {}; _allGroups.forEach(function (g) { byId[g.id] = g; });
        _red = arr(_plan && _plan.red_attack_plan).map(function (e) {
            var g = byId[e.demo_group_id]; if (!g) return null;
            var pg = domainize(prep(g, 'RED', cloneLL(e._target || _objective), e));
            e.movement_domain = pg.movement_domain; e.route_type = pg.route_type; e.route_warnings = pg.route ? arr(pg.route.warnings) : [];
            return pg;
        }).filter(Boolean);
        _blue = arr(_plan && _plan.blue_reaction_plan).map(function (e) {
            var g = byId[e.demo_group_id]; if (!g) return null;
            var t = cloneLL(e._target || e.intercept_or_defend_location);
            var pg = domainize(prep(g, 'BLUE', t, e));
            e.movement_domain = pg.movement_domain; e.route_type = pg.route_type; e.route_warnings = pg.route ? arr(pg.route.warnings) : [];
            return pg;
        }).filter(Boolean);
    }

    function buildDeterministicPlan() {
        var AI = aiPlanner();
        if (AI && typeof AI.buildPlan === 'function') {
            return AI.buildPlan(_allGroups, _objective, { terrain: _terrain });
        }
        var reds = _allGroups.filter(function (g) { return g.side === 'RED'; }).slice();
        var blues = _allGroups.filter(function (g) { return g.side === 'BLUE'; }).slice();
        reds.sort(function (a, b) { return dist2(a.anchor, _objective) - dist2(b.anchor, _objective); });
        blues.sort(function (a, b) { return dist2(a.anchor, _objective) - dist2(b.anchor, _objective); });
        return {
            planner: 'free-fight-ai-lite (deterministic fallback; planner module unavailable)',
            terrain_used: false,
            red_attack_plan: reds.slice(0, RED_ATTACK).map(function (g) {
                return { demo_group_id: g.id, reason: 'Nearest RED anchor fallback.', route_summary: 'geometric fallback', confidence: 'low', warnings: ['planner_module_unavailable'], _target: cloneLL(_objective) };
            }),
            blue_reaction_plan: blues.slice(0, BLUE_REACT).map(function (g) {
                return { demo_group_id: g.id, reaction_type: 'intercept', reason: 'Nearest BLUE anchor fallback.', route_summary: 'geometric fallback', confidence: 'low', warnings: ['planner_module_unavailable'], _target: interceptPoint(g.anchor, _objective) };
            }),
            warnings: ['deterministic_planner_module_unavailable'],
            missing_information: [],
        };
    }

    function selectSample() {
        _red = []; _blue = []; _plan = null;
        if (!finiteLL(_objective) || !_allGroups.length) return;
        applyPlanToGroups(buildDeterministicPlan(), 'deterministic');
    }
    function prep(g, role, target, planEntry) {
        planEntry = planEntry || {};
        return {
            id: g.id, side: g.side, role: role, country: g.country, country_key: g.country_key,
            base_name_ar: g.base_name_ar, base_name_en: g.base_name_en, site_type: g.site_type,
            category_counts: g.category_counts || {}, total: g.total || 0, member_ids: g.member_ids || [],
            unit_intel_summary: g.unit_intel_summary || null, unit_intel_warnings: g.unit_intel_warnings || [],
            anchor: cloneLL(g.anchor), target: target, current: cloneLL(g.anchor),
            phase: 'staged', demo_only: true, review_only: true, needs_review: true,
            requires_commander_approval: true, exact_unit_position: false, movement_status: 'demo',
            // AI-lite plan context (review-only):
            reaction_type: planEntry.reaction_type || null, reason: planEntry.reason || null,
            confidence: planEntry.confidence || 'low', plan_warnings: planEntry.warnings || [],
            route_summary: planEntry.route_summary || null, terrain_summary: planEntry.terrain_summary || null,
        };
    }

    function phaseFor(role, p) {
        if (p <= 0) return 'staged';
        if (p < 0.5) return 'moving';
        if (p < 0.9) return role === 'RED' ? 'approaching objective' : 'reacting';
        return 'holding';
    }

    function init(payload, opts) {
        clearTimer();
        opts = opts || {};
        _payload = payload || {};
        _allGroups = buildGroups(_payload);
        _anchors = anchorsOf(_payload);
        if (finiteLL(opts.objective)) { _objective = cloneLL(opts.objective); _objectiveSource = 'opts'; }
        else { var d = deriveObjective(_payload); _objective = d; _objectiveSource = finiteLL(d) ? 'brief' : null; }
        _progress = 0; _running = false; _paused = false;
        _planSource = 'deterministic';
        _llmStatus = { state: 'idle', message: '', validation_result: 'not_requested', fallback_reason: null };
        selectSample();
        return getState();
    }
    function setObjective(latlon) {
        _objective = finiteLL(cloneLL(latlon)) ? cloneLL(latlon) : null;
        _objectiveSource = finiteLL(_objective) ? 'user_marked_demo_objective' : null;
        // Persist (browser) so a re-opened card can reuse the placed Objective X.
        try { if (finiteLL(_objective)) W().__rmoozFreeFightObjective = { lat: _objective.lat, lon: _objective.lon }; } catch (_) {}
        _terrain = { available: false };   // re-probe per new objective/targets
        _progress = 0; _running = false; _paused = false; clearTimer();
        _planSource = 'deterministic';
        _llmStatus = { state: 'idle', message: '', validation_result: 'not_requested', fallback_reason: null };
        selectSample();
        if (mapReady()) { syncMarkers(); }
        updatePanel(); renderAiPanel(); probeTerrain();
        return getState();
    }
    function clearObjective() {
        _objective = null; _objectiveSource = null; _red = []; _blue = []; _plan = null; _terrain = { available: false };
        _planSource = 'deterministic';
        _llmStatus = { state: 'idle', message: '', validation_result: 'not_requested', fallback_reason: null };
        try { delete W().__rmoozFreeFightObjective; } catch (_) {}   // forget the persisted Objective X
        _progress = 0; _running = false; _paused = false; clearTimer();
        if (mapReady()) syncMarkers();
        updatePanel(); renderAiPanel();
        return getState();
    }
    function groups() { return _red.concat(_blue); }

    function setPlannerMode(mode) {
        _plannerMode = String(mode || '').toLowerCase() === 'llm' ? 'llm' : 'deterministic';
        _progress = 0; _running = false; _paused = false; clearTimer();
        if (_plannerMode === 'deterministic') {
            selectSample();
            setLlmStatus('idle', '', 'not_requested', null);
        } else {
            setLlmStatus('idle', '', 'not_requested', null);
        }
        if (mapReady()) syncMarkers();
        updatePanel(); renderAiPanel();
        return getState();
    }

    function step() {
        if (!_running || !finiteLL(_objective)) return;
        _progress = Math.min(1, _progress + STEP);
        // DOMAIN-AWARE-MOVEMENT-A: support groups hold at their anchor, so label
        // them "holding" instead of a progress-based "moving" (route logic unchanged).
        groups().forEach(function (g) { g.current = lerp(g.anchor, g.target, _progress); g.phase = (g.route_type === 'support_hold') ? 'holding' : phaseFor(g.role, _progress); });
        if (_progress >= 1) { _running = false; clearTimer(); }
        if (mapReady()) syncMarkers();
        updatePanel();
    }
    function setLlmStatus(state, message, validation, fallback) {
        _llmStatus = {
            state: state || 'idle',
            message: message || '',
            validation_result: validation || _llmStatus.validation_result || 'not_requested',
            fallback_reason: fallback || null,
        };
        updatePanel();
        renderAiPanel();
    }
    function startMovementNow() {
        if (!canStartFreeFight()) return getState();
        _running = true; _paused = false;
        if (mapReady() && typeof setInterval === 'function') { clearTimer(); _timer = setInterval(step, TICK_MS); }
        updatePanel();
        return getState();
    }
    function buildLlmRequestBody() {
        return {
            objective: _objective ? cloneLL(_objective) : null,
            groups: _allGroups.map(function (g) {
                return {
                    id: g.id, side: g.side, country: g.country || null, country_key: g.country_key || null,
                    base_name_en: g.base_name_en || null, base_name_ar: g.base_name_ar || null,
                    category_counts: g.category_counts || {}, symbol_category: g.symbol_category || null,
                    anchor: g.anchor ? cloneLL(g.anchor) : null,
                };
            }),
            terrain: _terrain || { available: false },
            missing_information: arr(_plan && _plan.missing_information),
        };
    }
    function fallbackToDeterministic(reason, startAfter) {
        selectSample();
        setLlmStatus('fallback', 'Group Planner LLM: unavailable or invalid response — using RMOOZ deterministic planner', 'rejected', reason || 'llm_unavailable');
        if (mapReady()) syncMarkers();
        renderAiPanel();
        if (startAfter) return startMovementNow();
        return getState();
    }
    function requestLlmPlan(startAfter) {
        var w = W();
        if (!canStartFreeFight()) return Promise.resolve(getState());
        if (!w || typeof w.fetch !== 'function') return Promise.resolve(fallbackToDeterministic('fetch_unavailable', startAfter));
        var seq = ++_llmRequestSeq;
        setLlmStatus('loading', 'Requesting LLM advisory plan...', 'pending', null);
        var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        var timeout = null;
        if (controller && typeof setTimeout === 'function') {
            timeout = setTimeout(function () { try { controller.abort(); } catch (_) {} }, 30000);
        }
        return w.fetch('/api/wargame-sim/free-fight/llm-plan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(buildLlmRequestBody()),
            signal: controller ? controller.signal : undefined,
        }).then(function (r) { return r.json(); }).then(function (body) {
            if (timeout) clearTimeout(timeout);
            if (seq !== _llmRequestSeq) return getState();
            if (!body || body.ok !== true || body.planner !== 'llm_advisory') {
                return fallbackToDeterministic((body && (body.reason || body.error)) || 'invalid_llm_response', startAfter);
            }
            body.terrain_used = !!(_terrain && _terrain.available);
            applyPlanToGroups(body, 'llm_advisory');
            setLlmStatus('received', 'LLM advisory plan received - validated by RMOOZ', 'accepted', null);
            if (mapReady()) syncMarkers();
            renderAiPanel();
            if (startAfter) return startMovementNow();
            return getState();
        }).catch(function (e) {
            if (timeout) clearTimeout(timeout);
            if (seq !== _llmRequestSeq) return getState();
            return fallbackToDeterministic((e && e.name === 'AbortError') ? 'timeout' : 'llm_unavailable', startAfter);
        });
    }
    function replan() {
        _progress = 0; _running = false; _paused = false; clearTimer();
        if (_plannerMode === 'llm') return requestLlmPlan(false);
        selectSample();
        setLlmStatus('idle', '', 'not_requested', null);
        if (mapReady()) syncMarkers();
        renderAiPanel(); updatePanel();
        return getState();
    }
    function start() {
        if (!canStartFreeFight()) return getState();   // needs Objective X + a group + anchors
        if (_plannerMode === 'llm') return requestLlmPlan(true);
        setLlmStatus('idle', '', 'not_requested', null);
        return startMovementNow();
    }
    function pause() { _running = false; _paused = true; clearTimer(); updatePanel(); return getState(); }
    function reset() {
        _running = false; _paused = false; _progress = 0; clearTimer();
        groups().forEach(function (g) { g.current = cloneLL(g.anchor); g.phase = 'staged'; });
        _aiDecision = null; _aiLoading = false; _aiApplied = false;
        if (mapReady()) syncMarkers();
        updatePanel();
        return getState();
    }

    // FREE-FIGHT-DEMO-B: graceful degradation messages (no crash for any shape).
    function freeFightWarnings() {
        var w = [];
        if (!_allGroups.length) { w.push('No map anchors available — لا توجد مراسٍ على الخريطة'); return w; }
        if (!finiteLL(_objective)) { w.push('Place Objective X to begin — ضع الهدف X للبدء'); return w; }
        if (!_red.length) w.push('No RED attack units found — لا توجد وحدات هجوم حمراء');
        if (!_blue.length) w.push('No BLUE reaction units found — لا توجد وحدات رد فعل زرقاء');
        if (_plan && _plan.terrain_used === false) w.push('Terrain unavailable; using geometric demo movement only');
        if (_llmStatus && _llmStatus.state === 'fallback') w.push(_llmStatus.message);
        return w;
    }
    // FREE-FIGHT-AI-LITE visibility fix: the card SHOWS regardless of objective
    // (decided in doc-understanding-review.canShowFreeFight); the demo can only
    // START when there is an Objective X + at least one RED/BLUE group + anchors.
    function canStartFreeFight() {
        return finiteLL(_objective) && _allGroups.length > 0 && (_red.length > 0 || _blue.length > 0);
    }
    function getState() {
        return {
            running: _running, paused: _paused, progress: _progress,
            objective: _objective ? cloneLL(_objective) : null, objective_set: finiteLL(_objective),
            objective_source: _objectiveSource,
            red_groups: _red.length, blue_groups: _blue.length, all_groups: _allGroups.length,
            has_anchors: _allGroups.length > 0, can_start: canStartFreeFight(), warnings: freeFightWarnings(),
            terrain_used: !!(_terrain && _terrain.available), terrain_available: !!(_terrain && _terrain.available),
            red_attack_plan: arr(_plan && _plan.red_attack_plan).length,
            blue_reaction_plan: arr(_plan && _plan.blue_reaction_plan).length,
            planner_mode: _plannerMode,
            planner: _planSource,
            llm_status: Object.assign({}, _llmStatus),
            validation_result: _llmStatus.validation_result,
            fallback_reason: _llmStatus.fallback_reason,
            ai_assisted: _plannerMode === 'llm', requires_commander_approval: true,
            demo_only: true, review_only: true,
        };
    }
    function getPlan() { return _plan; }
    function getGroups() { return groups(); }
    function getRed() { return _red; }
    function getBlue() { return _blue; }
    function getObjective() {
        if (!finiteLL(_objective)) return null;
        // Stored as a review-only, user-marked demo objective (FREE-FIGHT-AI-LITE-A #1).
        return { lat: _objective.lat, lon: _objective.lon, object_type: 'objective', name: 'Objective X',
            needs_review: true, review_only: true, source_type: 'user_marked_demo_objective',
            objective_source: _objectiveSource };
    }

    // ── Browser-only rendering (guarded) ─────────────────────────────────
    var COUNTRY_COLORS = { iran: '#f0707a', uae: '#5bd6a0', qatar: '#7bb8e8', bahrain: '#d9b34a', kuwait: '#b893e0', oman: '#5fc7c7', ksa: '#7fd6a0' };
    function colorFor(g) { return COUNTRY_COLORS[g.country_key] || (g.side === 'RED' ? '#f0a0a0' : '#7fd6a0'); }
    function dominant(g) {
        if (g && g.unit_intel_summary && g.unit_intel_summary.dominant_symbol_category && g.unit_intel_summary.dominant_symbol_category !== 'unknown') return g.unit_intel_summary.dominant_symbol_category;
        var best = 'unknown', n = -1, cc = g.category_counts || {};
        Object.keys(cc).forEach(function (k) { if (cc[k] > n) { n = cc[k]; best = k; } });
        return best;
    }
    // GLOBAL-SYMBOL-IDENTITY-A: prefer the shared resolver; fall back to the
    // registry/role glyph if it is not loaded (window-only, never required).
    function identity() { var w = W(); return (w && w.RmoozSymbolIdentity && w.RmoozSymbolIdentity.resolve) ? w.RmoozSymbolIdentity : null; }
    function groupGlyph(g) {
        var ID = identity();
        if (ID) { var r = ID.resolve({ symbol_category: dominant(g), side: g.side }); if (r && r.display_glyph) return r.display_glyph; }
        var REG = W() && W().RmoozSymbolRegistry;
        if (REG && REG.platformSymbol) { var s = REG.platformSymbol(dominant(g)); return (s && s.glyph) || '▢'; }
        return g.role === 'RED' ? '▲' : '◆';
    }
    function markerLatLng(g) { return [g.current.lat, g.current.lon]; }

    function syncMarkers() {
        var w = W();
        if (!mapReady()) return;
        if (!_layer) { _layer = w.L.layerGroup(); _layer.addTo(w.map); }
        _layer.clearLayers();
        // Objective X
        if (finiteLL(_objective)) {
            var objIcon = w.L.divIcon({ className: 'rmooz-ff-objective', html: '<div title="Objective X — review only" style="width:26px;height:26px;border-radius:50%;border:2px dashed #e0c060;background:rgba(224,192,96,.18);display:flex;align-items:center;justify-content:center;color:#ffe28a;font-size:14px;">◉</div>', iconSize: [28, 28], iconAnchor: [14, 14] });
            var om = w.L.marker([_objective.lat, _objective.lon], { icon: objIcon, interactive: true, keyboard: false, title: 'Objective X — review only / الهدف X' });
            om._rmoozReviewOnly = true; om._rmoozObjectiveX = true;
            om.bindPopup('<div style="font-size:12px;color:#e8eaed;background:#0e1620;"><b>Objective X — الهدف X</b><br>review only · not final tasking<br>عقيدة غير مرفوعة / Doctrine pending</div>');
            _layer.addLayer(om);
        }
        groups().forEach(function (g) {
            if (!finiteLL(g.current)) return;
            var color = colorFor(g);
            var icon = w.L.divIcon({
                className: 'rmooz-ff-group rmooz-ff-' + g.role.toLowerCase(),
                html: '<div title="' + esc(g.role + ' demo group') + '" style="display:flex;align-items:center;gap:3px;">' +
                    '<span style="width:15px;height:15px;border-radius:3px;background:' + color + ';border:2px solid ' + (g.role === 'RED' ? '#8f1f1f' : '#1f7a4d') + ';box-shadow:0 0 0 2px rgba(255,255,255,.3);display:flex;align-items:center;justify-content:center;color:#0c1118;font-size:10px;">' + groupGlyph(g) + '</span>' +
                    '<span style="background:#0e1620;color:#e8eaed;border:1px solid ' + color + ';border-radius:3px;padding:0 4px;font-size:10px;font-weight:700;white-space:nowrap;">' + esc(g.country || g.side) + ' · ' + esc(g.phase) + '</span></div>',
                iconSize: [120, 18], iconAnchor: [7, 9],
            });
            var m = w.L.marker(markerLatLng(g), { icon: icon, interactive: true, keyboard: false, title: 'Free Fight Preview Group (' + g.role + ') — preview overlay only, not actual imported positions' });
            m._rmoozDemoOnly = true; m._rmoozReviewOnly = true; m._rmoozExactUnitPosition = false;
            m._rmoozSymbolCategory = dominant(g);
            m._rmoozUnitIntelSummary = g.unit_intel_summary || null;
            if (typeof m.on === 'function') m.on('click', function () { openDemoUnitCard(g); });
            _layer.addLayer(m);
        });
        // FREEFIGHT-AI-REAL-MAP-MOVE-A: trail + pulse after Apply Unit AI Action
        if (_aiApplied && _aiDecision && _aiDecision.ok && _aiDecision.scenario_patch) {
            var ap = _aiDecision.scenario_patch;
            var newLat = +ap.lat, newLon = +ap.lon;
            if (Number.isFinite(newLat) && Number.isFinite(newLon)) {
                var aiActM = _aiDecision.action || {};
                var popupHtml = '<div style="font-size:11px;min-width:200px;">' +
                    '<div style="font-weight:700;color:#90d090;margin-bottom:3px;">AI moved ' + esc(ap.unit_uid || aiActM.unit_uid || '') + '</div>';
                // Trail line: old → new (only if we have an old position)
                if (_aiMovedUnitOldPos && Number.isFinite(_aiMovedUnitOldPos.lat)) {
                    var oldLat = _aiMovedUnitOldPos.lat, oldLon = _aiMovedUnitOldPos.lon;
                    try {
                        var trail = w.L.polyline([[oldLat, oldLon], [newLat, newLon]], {
                            color: '#90d090', weight: 3, opacity: 0.85, dashArray: '8 5',
                        });
                        _layer.addLayer(trail);
                        // Arrow head at new position
                        var arrowIcon = w.L.divIcon({
                            className: '',
                            html: '<div style="width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-bottom:14px solid #90d090;margin:-7px 0 0 -7px;filter:drop-shadow(0 0 3px #50a050);"></div>',
                            iconSize: [14, 14], iconAnchor: [7, 14],
                        });
                        var arrowM = w.L.marker([newLat, newLon], { icon: arrowIcon, interactive: false, keyboard: false });
                        _layer.addLayer(arrowM);
                    } catch (_) {}
                    popupHtml += '<div style="color:#8fa5b8;margin-bottom:2px;">old: ' + oldLat.toFixed(4) + ', ' + oldLon.toFixed(4) + '</div>';
                }
                popupHtml += '<div style="color:#e0e8f0;margin-bottom:2px;">new: ' + newLat.toFixed(4) + ', ' + newLon.toFixed(4) + '</div>';
                if (aiActM.reason) popupHtml += '<div style="color:#a0c0b0;font-style:italic;">reason: ' + esc(aiActM.reason) + '</div>';
                if (!_aiDecision.real_unit_moved) {
                    popupHtml += '<div style="color:#e0a93a;margin-top:3px;">⚠ preview marker only — real scenario unit not found</div>';
                }
                popupHtml += '</div>';
                // Pulse circle at new position
                var pulse = w.L.circleMarker([newLat, newLon], {
                    radius: 14, color: '#90d090', weight: 3, fillColor: '#182818', fillOpacity: 0.7,
                });
                pulse.bindPopup(popupHtml, { maxWidth: 320 });
                _layer.addLayer(pulse);
                // Inner bright dot
                var dot = w.L.circleMarker([newLat, newLon], {
                    radius: 5, color: '#c0ffc0', weight: 2, fillColor: '#90d090', fillOpacity: 1,
                });
                _layer.addLayer(dot);
            }
        }
        // FREEFIGHT-AI-COA-PLANNER-A: trails for all COA-moved units
        if (_coaApplied && _coaMovedUnits.length) {
            _coaMovedUnits.forEach(function (mv) {
                if (!mv || !mv.unit || !mv.oldPos) return;
                var newLat = mv.unit.lat, newLon = mv.unit.lon;
                if (!Number.isFinite(newLat) || !Number.isFinite(newLon)) return;
                var oldLat = mv.oldPos.lat, oldLon = mv.oldPos.lon;
                var role = mv.role || '';
                // Role colours — RED attack roles + BLUE defense roles.
                var ROLE_COLORS = { assault: '#ff9060', support: '#60b0ff', recon: '#b0b0b0',
                    reinforce: '#7fd6a0', intercept: '#5ad0d0', defend: '#9ec2ec', screen: '#c0a0e0' };
                var trailColor = ROLE_COLORS[role] || '#90d090';
                try {
                    var coaTrail = w.L.polyline([[oldLat, oldLon], [newLat, newLon]], {
                        color: trailColor, weight: 2, opacity: 0.7, dashArray: '6 4',
                    });
                    _layer.addLayer(coaTrail);
                    var coaPulse = w.L.circleMarker([newLat, newLon], {
                        radius: 9, color: trailColor, weight: 2, fillColor: '#101820', fillOpacity: 0.7,
                    });
                    var popText = '<div style="font-size:11px;color:#e8eaed;min-width:160px;">' +
                        '<b style="color:' + esc(trailColor) + ';">' + esc(mv.unit.id || mv.unit.uid || mv.unit_uid || '') + '</b>' +
                        ' [' + esc(role) + ']<br>' +
                        'old: ' + oldLat.toFixed(4) + ', ' + oldLon.toFixed(4) + '<br>' +
                        'new: ' + newLat.toFixed(4) + ', ' + newLon.toFixed(4) + '</div>';
                    coaPulse.bindPopup(popText, { maxWidth: 260 });
                    _layer.addLayer(coaPulse);
                } catch (_e) {}
            });
        }
        // FREEFIGHT-ACTION-REACTION-MAP-OVERLAY-A: draw the action/reaction story
        // (zones, RED threat axis, block point, BLUE intercept line, alert label).
        try { renderActionReactionOverlay(w); } catch (_ov) {}
    }

    // FREEFIGHT-ACTION-REACTION-MAP-OVERLAY-A: review-only map overlay that explains
    // the action/reaction visually. Fully guarded (no-op without situation data or
    // when a Leaflet primitive is missing). NEVER moves the camera. No kill markers.
    function renderActionReactionOverlay(w) {
        if (!_layer || !w || !w.L) return;
        var L = w.L;
        // Latest situation comes from the COA plan (manual + loop both set _coaPlan)
        // or the last commander decision. No situation/objective → nothing to tell.
        var plan = _coaPlan;
        var rec = _lastCommanderDecision;
        var situation = (plan && plan.situation_state) || (rec && rec.situation) || null;
        if (!situation || !situation.objective) return;
        var obj = situation.objective;
        if (!Number.isFinite(+obj.lat) || !Number.isFinite(+obj.lon)) return;
        var objLat = +obj.lat, objLon = +obj.lon;

        function add(layer) {
            if (!layer) return null;
            layer._rmoozDemoOnly = true; layer._rmoozReviewOnly = true; layer._rmoozActionReaction = true;
            try { _layer.addLayer(layer); } catch (_) {}
            return layer;
        }
        function label(lat, lon, html, anchor) {
            if (typeof L.divIcon !== 'function' || typeof L.marker !== 'function') return null;
            try {
                var ic = L.divIcon({ className: 'rmooz-ff-overlay-label', html: html, iconSize: [10, 10], iconAnchor: anchor || [5, 5] });
                return add(L.marker([lat, lon], { icon: ic, interactive: false, keyboard: false }));
            } catch (_) { return null; }
        }

        // 1) Warning / defended / engagement rings around the objective (labelled).
        var th = situation.thresholds_deg || {};
        if (typeof L.circle === 'function') {
            [
                { deg: +th.warning,    color: '#e0a93a', dash: '6 6', text: 'Warning zone — review only' },
                { deg: +th.defended,   color: '#f08040', dash: '4 5', text: 'Defended zone — review only' },
                { deg: +th.engagement, color: '#f05050', dash: '2 4', text: 'Engagement-ready zone — review only' },
            ].forEach(function (r) {
                if (!Number.isFinite(r.deg) || r.deg <= 0) return;
                try { add(L.circle([objLat, objLon], { radius: r.deg * 111000, color: r.color, weight: 1.5, opacity: 0.7, fill: false, dashArray: r.dash, interactive: false })); } catch (_) {}
                label(objLat + r.deg, objLon, '<div data-ff-ovl="ring" style="font-size:9px;color:' + r.color + ';background:rgba(8,14,20,.72);padding:0 3px;border-radius:2px;white-space:nowrap;">' + esc(r.text) + '</div>', [0, 6]);
            });
        }

        // 2) RED threat axis: nearest RED → objective.
        var nr = situation.nearest_red;
        if (nr && Number.isFinite(+nr.lat) && Number.isFinite(+nr.lon) && typeof L.polyline === 'function') {
            try { add(L.polyline([[+nr.lat, +nr.lon], [objLat, objLon]], { color: '#f0606a', weight: 2, opacity: 0.85, dashArray: '9 6', interactive: false })); } catch (_) {}
            label((+nr.lat + objLat) / 2, (+nr.lon + objLon) / 2, '<div data-ff-ovl="red-axis" style="font-size:9px;color:#f0808a;background:rgba(8,14,20,.72);padding:0 3px;border-radius:2px;white-space:nowrap;">RED threat axis</div>', [0, 0]);
        }

        // 3) + 4) BLUE intercept/block point + intercept line (from the selected COA).
        var coa = (plan && Array.isArray(plan.coas)) ? (plan.coas[_coaSelectedIdx] || plan.coas[0]) : null;
        var ip = coa && coa.intercept_point;
        if (ip && Number.isFinite(+ip.lat) && Number.isFinite(+ip.lon)) {
            var ipLat = +ip.lat, ipLon = +ip.lon;
            if (typeof L.circleMarker === 'function') {
                try { add(L.circleMarker([ipLat, ipLon], { radius: 10, color: '#5ad0d0', weight: 3, fillColor: '#0a2630', fillOpacity: 0.7, interactive: false })); } catch (_) {}
                try { add(L.circleMarker([ipLat, ipLon], { radius: 4, color: '#c0ffff', weight: 2, fillColor: '#5ad0d0', fillOpacity: 1, interactive: false })); } catch (_) {}
            }
            label(ipLat, ipLon, '<div data-ff-ovl="block-point" style="font-size:9px;font-weight:700;color:#9fe8e8;background:rgba(8,14,20,.82);padding:0 4px;border-radius:2px;white-space:nowrap;">BLOCK POINT · نقطة الاعتراض</div>', [0, -12]);
            // BLUE intercept line: a strong shared line from a moved BLUE unit's start to the block point.
            if (_coaMovedUnits.length && typeof L.polyline === 'function') {
                var origin = _coaMovedUnits[0];
                if (origin && origin.oldPos && Number.isFinite(+origin.oldPos.lat)) {
                    try { add(L.polyline([[+origin.oldPos.lat, +origin.oldPos.lon], [ipLat, ipLon]], { color: '#5ad0d0', weight: 3, opacity: 0.9, dashArray: '10 5', interactive: false })); } catch (_) {}
                }
            }
        }

        // 5) Floating alert / ROE label near the objective.
        var alert = situation.alert_state;
        if (alert && alert !== 'WATCH') {
            var ru = situation.nearest_red_uid || 'RED';
            var zoneTxt = situation.red_inside_engagement_zone ? 'engagement zone'
                : (situation.red_inside_blue_defended_zone ? 'defended zone'
                : (situation.red_inside_blue_warning_zone ? 'warning zone' : 'approach'));
            var aColor = alert === 'ENGAGEMENT_READY' ? '#f05050' : (alert === 'ALERT' ? '#f0a040' : '#e0c060');
            label(objLat, objLon, '<div data-ff-ovl="alert" style="font-size:10px;font-weight:700;color:' + aColor + ';background:rgba(8,14,20,.88);border:1px solid ' + aColor + ';padding:2px 5px;border-radius:3px;white-space:nowrap;">BLUE ' + esc(alert) + ' · ROE: ' + esc(situation.roe_state || '') + '<br>' + esc(ru) + ' inside ' + esc(zoneTxt) + '</div>', [0, 30]);
        }

        // 6) Role badges on moved BLUE units + a grouped already-in-position label.
        if (_coaApplied && _coaMovedUnits.length) {
            _coaMovedUnits.forEach(function (mv) {
                if (!mv || !mv.unit || !mv.role) return;
                var lat = mv.unit.lat, lon = mv.unit.lon;
                if (!Number.isFinite(+lat) || !Number.isFinite(+lon)) return;
                label(+lat, +lon, '<div data-ff-ovl="role" style="font-size:8px;color:#cfeaff;background:rgba(8,30,40,.8);padding:0 3px;border-radius:2px;white-space:nowrap;">' + esc(mv.role) + '</div>', [0, 14]);
            });
        }
        if (_coaHeldCount > 0) {
            label(objLat - (+th.warning || 0.2), objLon, '<div data-ff-ovl="held" style="font-size:9px;color:#9ab0c0;background:rgba(8,14,20,.75);padding:0 3px;border-radius:2px;white-space:nowrap;">' + _coaHeldCount + ' BLUE units already in position</div>', [0, 0]);
        }
    }

    // SIDC-BRIDGE-A: review-only SIDC preview (app favorites only; never final).
    function sidcBridge() { var w = W(); if (w && w.RmoozSidcPreview) return w.RmoozSidcPreview; try { return require('./sidc-preview.js'); } catch (_) { return null; } }
    function sidcPreviewHtml(u, g) {
        var SP = sidcBridge();
        if (!SP || !u) return '';
        var p = SP.previewFor({ symbol_category: u.symbol_category, echelon: u.echelon, side: g && g.side });
        var cand = p.sidc_preview_candidate;
        var svg = cand ? SP.previewSvg(cand.sidc, { size: 22 }) : null;
        var line = cand
            ? 'SIDC preview: <b>' + esc(cand.sidc) + '</b> <span style="color:#9ab;">(' + esc(cand.source) + ' · ' + esc(cand.confidence) + ')</span>' + (svg ? ' <span style="display:inline-block;vertical-align:middle;">' + svg + '</span>' : '')
            : 'SIDC preview: <span style="color:#e0a93a;">none — ' + esc(arr(p.warnings).join('; ') || 'No safe internal SIDC mapping found') + '</span>';
        return '<div style="margin-top:3px;">' + line + '</div>' +
            '<div style="color:#e0c060;font-size:10px;">Review required before final symbol — مطلوب مراجعة قبل الرمز النهائي</div>';
    }

    // Simple demo unit card (NOT the base card) — review-only.
    function unitIntelCardHtml(g) {
        var summary = (g && g.unit_intel_summary) || {};
        var units = arr(summary.normalized_units);
        if (!units.length) {
            return '<div style="margin-top:7px;color:#e0a93a;font-size:11px;">unit intel: unknown - using review-only fallback</div>';
        }
        return '<div style="margin-top:7px;border-top:1px solid #26384a;padding-top:7px;">' +
            units.slice(0, 5).map(function (u) {
                var comp = arr(u.composition).map(function (c) {
                    return (c.count || 1) + 'x ' + (c.echelon || '-') + ' ' + (c.unit_type || c.symbol_category || 'unknown');
                }).join(', ') || '-';
                var warns = arr(u.warnings).join(', ') || '-';
                return '<div style="margin:5px 0;padding:6px 7px;border:1px solid #2a3f55;border-radius:5px;background:#0c141d;">' +
                    '<div dir="rtl" style="color:#d8e0e8;">original: <b>' + esc(u.original_text || '-') + '</b></div>' +
                    '<div>normalized: <b>' + esc(u.normalized_name_en || u.unit_type || '-') + '</b></div>' +
                    '<div>type/echelon: ' + esc((u.unit_type || '-') + ' / ' + (u.echelon || '-')) + '</div>' +
                    '<div>composition: ' + esc(comp) + '</div>' +
                    '<div>symbol_category: <b>' + esc(u.symbol_category || 'unknown') + '</b></div>' +
                    '<div>SIDC: <b>' + esc(u.sidc_candidate || 'review_required') + '</b> (' + esc(u.sidc_confidence || 'review_required') + ')</div>' +
                    '<div>confidence: ' + esc(u.confidence || 'low') + ' | warnings: ' + esc(warns) + '</div>' +
                    sidcPreviewHtml(u, g) +
                '</div>';
            }).join('') +
            '<div style="color:#e0c060;font-size:11px;">SIDC candidate is review-required; no final SIDC or exact unit position is assigned.</div>' +
        '</div>';
    }

    function openDemoUnitCard(g) {
        var w = W();
        if (!w || !w.document || !w.document.body) return;
        if (_card && _card.parentNode) _card.parentNode.removeChild(_card);
        _card = w.document.createElement('div');
        _card.id = 'rmooz-ff-demo-unit-card';
        _card.style.cssText = ['position:fixed', 'top:140px', 'right:24px', 'z-index:9960', 'background:#0e1620', 'border:1px solid ' + colorFor(g), 'border-radius:8px', 'padding:12px 14px', 'min-width:260px', 'box-shadow:0 4px 20px rgba(0,0,0,.65)', 'color:#e8eaed', 'font-family:inherit'].join(';');
        var cats = Object.keys(g.category_counts || {}).filter(function (k) { return g.category_counts[k] > 0; }).map(function (k) { return k + ' ' + g.category_counts[k]; }).join(' · ') || ('units ' + (g.total || 0));
        _card.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
            '<div style="font-weight:700;color:#cfe6ff;">Demo Unit Card — ' + esc(g.role) + '</div>' +
            '<button data-act="x" style="background:transparent;border:none;color:#8fa5b8;cursor:pointer;font-size:15px;">✕</button></div>' +
            '<div style="font-size:12px;line-height:1.7;">' +
            'country: <b>' + esc(g.country || '-') + '</b><br>side: <b>' + esc(g.side) + '</b><br>' +
            'source base: <b>' + esc(g.base_name_en || g.base_name_ar || '-') + '</b><br>' +
            'grouped platforms: ' + esc(cats) + '<br>phase: ' + esc(g.phase) + '<br>' +
            '<span style="color:#e0c060;">demo_only:true · review_only:true · exact_unit_position:false</span></div>' +
            '<div style="margin-top:8px;padding:5px 7px;border-radius:4px;background:#2a2412;border:1px solid #b8860b;color:#e0c060;font-size:11px;">Demo only — not final tasking — requires commander approval<br>حركة تجريبية فقط — ليست إسناد واجب نهائي — تحتاج اعتماد القائد</div>';
        _card.innerHTML += '<div style="margin-top:7px;color:#9ec2ec;font-size:11px;">dominant symbol: <b>' + esc(dominant(g)) + '</b></div>' + unitIntelCardHtml(g);
        w.document.body.appendChild(_card);
        var x = _card.querySelector('[data-act="x"]'); if (x) x.addEventListener('click', function () { if (_card && _card.parentNode) _card.parentNode.removeChild(_card); _card = null; });
    }

    // ── FREEFIGHT-PANEL-WINDOW-CONTROLS-A: window management helpers ─────────
    var FF_WIN_KEY  = 'rmooz.freeFightPanel.window';
    var FF_WIN_MINW = 420, FF_WIN_MINH = 260;

    function _defaultWinState() {
        return { left: 18, top: 128, width: 440, height: 540, minimized: false, maximized: false, prevRect: null };
    }
    function _loadWinState() {
        try {
            var raw = (typeof sessionStorage !== 'undefined') && sessionStorage.getItem(FF_WIN_KEY);
            if (raw) { var p = JSON.parse(raw); if (p && typeof p.left === 'number') return p; }
        } catch (_) {}
        return _defaultWinState();
    }
    function _saveWinState() {
        try {
            if (typeof sessionStorage !== 'undefined' && _winState)
                sessionStorage.setItem(FF_WIN_KEY, JSON.stringify(_winState));
        } catch (_) {}
    }
    function _clampWinState() {
        if (!_winState) return;
        var ww = W(), vw = (ww && ww.innerWidth) || 800, vh = (ww && ww.innerHeight) || 600;
        _winState.width  = Math.min(Math.max(_winState.width  || 440, FF_WIN_MINW), vw - 12);
        _winState.height = Math.min(Math.max(_winState.height || 540, FF_WIN_MINH), vh - 12);
        _winState.left   = Math.max(0, Math.min(_winState.left  || 18,  vw - _winState.width));
        _winState.top    = Math.max(0, Math.min(_winState.top   || 128, vh - 40));
    }
    function _applyWinState() {
        if (!_panel || !_winState) return;
        var body   = _panel.querySelector('[data-ff="body"]');
        var handle = _panel.querySelector('[data-ff="resize"]');
        var ww = W(), vw = (ww && ww.innerWidth) || 800, vh = (ww && ww.innerHeight) || 600;
        if (_winState.maximized) {
            _panel.style.left = '12px'; _panel.style.top = '72px';
            _panel.style.width = (vw - 24) + 'px'; _panel.style.height = (vh - 90) + 'px';
            if (body)   body.style.display   = '';
            if (handle) handle.style.display = 'none';
        } else if (_winState.minimized) {
            _panel.style.left = _winState.left + 'px'; _panel.style.top  = _winState.top + 'px';
            _panel.style.width = _winState.width + 'px'; _panel.style.height = '';
            if (body)   body.style.display   = 'none';
            if (handle) handle.style.display = 'none';
        } else {
            _panel.style.left = _winState.left + 'px'; _panel.style.top  = _winState.top + 'px';
            _panel.style.width  = _winState.width  + 'px'; _panel.style.height = _winState.height + 'px';
            if (body)   body.style.display   = '';
            if (handle) handle.style.display = '';
        }
    }
    function _updateMaxBtn() {
        if (!_panel || !_winState) return;
        var b = _panel.querySelector('[data-act="win-max"]');
        if (b) b.textContent = _winState.maximized ? '❐' : '□';
    }
    function _winMinimize() {
        if (!_winState) return;
        _winState.minimized = !_winState.minimized;
        _applyWinState(); _saveWinState();
    }
    function _winMaximize() {
        if (!_winState) return;
        if (_winState.maximized) {
            if (_winState.prevRect) {
                _winState.left = _winState.prevRect.left; _winState.top  = _winState.prevRect.top;
                _winState.width = _winState.prevRect.width; _winState.height = _winState.prevRect.height;
            }
            _winState.maximized = false;
        } else {
            _winState.prevRect  = { left: _winState.left, top: _winState.top, width: _winState.width, height: _winState.height };
            _winState.maximized = true; _winState.minimized = false;
        }
        _applyWinState(); _updateMaxBtn(); _saveWinState();
    }
    function _attachDrag(titlebar) {
        titlebar.addEventListener('pointerdown', function (e) {
            var t = e.target;
            if (t && (t.tagName === 'BUTTON' || t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'A')) return;
            if (!_winState || _winState.maximized) return;
            var startX = e.clientX, startY = e.clientY, origL = _winState.left, origT = _winState.top;
            if (titlebar.setPointerCapture) titlebar.setPointerCapture(e.pointerId);
            function onMove(ev) {
                var ww = W(), vw = (ww && ww.innerWidth) || 800, vh = (ww && ww.innerHeight) || 600;
                _winState.left = Math.max(0, Math.min(origL + ev.clientX - startX, vw - _winState.width));
                _winState.top  = Math.max(0, Math.min(origT + ev.clientY - startY, vh - 40));
                _panel.style.left = _winState.left + 'px'; _panel.style.top = _winState.top + 'px';
            }
            function onUp() {
                titlebar.removeEventListener('pointermove', onMove);
                titlebar.removeEventListener('pointerup', onUp);
                _saveWinState();
            }
            titlebar.addEventListener('pointermove', onMove);
            titlebar.addEventListener('pointerup', onUp);
        });
    }
    function _attachResize(handle) {
        handle.addEventListener('pointerdown', function (e) {
            e.stopPropagation();
            if (!_winState) return;
            var startX = e.clientX, startY = e.clientY, origW = _winState.width, origH = _winState.height;
            if (handle.setPointerCapture) handle.setPointerCapture(e.pointerId);
            function onMove(ev) {
                var ww = W(), vw = (ww && ww.innerWidth) || 800, vh = (ww && ww.innerHeight) || 600;
                _winState.width  = Math.min(Math.max(origW + ev.clientX - startX, FF_WIN_MINW), vw - _winState.left - 4);
                _winState.height = Math.min(Math.max(origH + ev.clientY - startY, FF_WIN_MINH), vh - _winState.top  - 4);
                _panel.style.width = _winState.width + 'px'; _panel.style.height = _winState.height + 'px';
            }
            function onUp() {
                handle.removeEventListener('pointermove', onMove);
                handle.removeEventListener('pointerup', onUp);
                _saveWinState();
            }
            handle.addEventListener('pointermove', onMove);
            handle.addEventListener('pointerup', onUp);
        });
    }
    function _attachViewportResize(w) {
        if (_viewportResizeHandler) { try { w.removeEventListener('resize', _viewportResizeHandler); } catch (_) {} }
        _viewportResizeHandler = function () {
            if (!_panel || !_winState) return;
            _clampWinState(); _applyWinState(); _saveWinState();
        };
        w.addEventListener('resize', _viewportResizeHandler);
    }
    // ── end FREEFIGHT-PANEL-WINDOW-CONTROLS-A helpers ────────────────────────

    // ── Control panel (Start / Pause / Reset / Clear Objective X + labels) ──
    function buildPanel() {
        var w = W();
        if (!w || !w.document || !w.document.body) return;
        if (_panel && _panel.parentNode) _panel.parentNode.removeChild(_panel);
        if (!_winState) _winState = _loadWinState();
        _clampWinState();

        _panel = w.document.createElement('div');
        _panel.id = 'rmooz-free-fight-panel';
        _panel.style.cssText = [
            'position:fixed', 'left:' + _winState.left + 'px', 'top:' + _winState.top + 'px',
            'width:' + _winState.width + 'px', 'height:' + _winState.height + 'px',
            'z-index:9955', 'background:#0e1620', 'border:1px solid #7a3030',
            'border-radius:8px', 'box-shadow:0 4px 20px rgba(0,0,0,.65)',
            'color:#e8eaed', 'font-family:inherit', 'direction:ltr',
            'display:flex', 'flex-direction:column', 'overflow:hidden',
        ].join(';');

        // Permanent titlebar — never re-rendered by updatePanel
        var titlebar = w.document.createElement('div');
        titlebar.setAttribute('data-ff', 'titlebar');
        titlebar.style.cssText = [
            'display:flex', 'justify-content:space-between', 'align-items:center',
            'padding:7px 10px', 'background:#121c28', 'border-bottom:1px solid #2a3f55',
            'cursor:move', 'user-select:none', 'flex-shrink:0', 'border-radius:7px 7px 0 0',
        ].join(';');
        titlebar.innerHTML =
            '<div style="font-weight:700;color:#f0a0a0;font-size:13px;pointer-events:none;">Free Fight Control Window — نافذة التحكم بالقتال التجريبي</div>' +
            '<div style="display:flex;gap:4px;align-items:center;">' +
            '<button data-act="win-min" title="Minimize" style="background:transparent;border:1px solid #4a5f75;color:#9ec2ec;cursor:pointer;font-size:12px;border-radius:3px;width:22px;height:22px;padding:0;line-height:1;text-align:center;">—</button>' +
            '<button data-act="win-max" title="Maximize / Restore" style="background:transparent;border:1px solid #4a5f75;color:#9ec2ec;cursor:pointer;font-size:12px;border-radius:3px;width:22px;height:22px;padding:0;line-height:1;text-align:center;">□</button>' +
            '<button data-act="win-close" title="Close" style="background:transparent;border:1px solid #7a3030;color:#f0a0a0;cursor:pointer;font-size:13px;border-radius:3px;width:22px;height:22px;padding:0;line-height:1;text-align:center;">×</button>' +
            '</div>';
        _panel.appendChild(titlebar);

        // Scrollable body
        var body = w.document.createElement('div');
        body.setAttribute('data-ff', 'body');
        body.style.cssText = ['overflow-y:auto', 'overflow-x:hidden', 'flex:1', 'padding:10px 12px', 'min-height:0'].join(';');
        _panel.appendChild(body);

        // Resize handle (↘ bottom-right corner)
        var rh = w.document.createElement('div');
        rh.setAttribute('data-ff', 'resize');
        rh.style.cssText = [
            'position:absolute', 'bottom:2px', 'right:2px', 'width:16px', 'height:16px',
            'cursor:se-resize', 'color:#4a5f75', 'font-size:11px',
            'text-align:center', 'line-height:16px', 'user-select:none',
        ].join(';');
        rh.textContent = '↘';
        _panel.appendChild(rh);

        w.document.body.appendChild(_panel);
        _applyWinState();
        _updateMaxBtn();

        // Wire titlebar controls
        var minBtn = titlebar.querySelector('[data-act="win-min"]');
        var maxBtn = titlebar.querySelector('[data-act="win-max"]');
        var closeBtn = titlebar.querySelector('[data-act="win-close"]');
        if (minBtn)   minBtn.addEventListener('click',   _winMinimize);
        if (maxBtn)   maxBtn.addEventListener('click',   _winMaximize);
        if (closeBtn) closeBtn.addEventListener('click', clear);

        _attachDrag(titlebar);
        _attachResize(rh);
        _attachViewportResize(w);
        updatePanel();
    }
    function updatePanel() {
        if (!_panel) return;
        var bodyDiv = _panel.querySelector('[data-ff="body"]');
        if (!bodyDiv) return;
        var st = getState();
        var objLine = st.objective_set
            ? ('Objective X set · RED attack ' + st.red_groups + ' / BLUE react ' + st.blue_groups + ' · progress ' + Math.round(st.progress * 100) + '%' + (st.running ? ' · running' : (st.paused ? ' · paused' : '')))
            : 'No Objective X — place it on the map to begin.';
        var html = '';
        if (!st.objective_set) {
            html += '<button data-act="place-obj" style="font:inherit;cursor:pointer;border:1px solid #b8860b;background:#2a2412;color:#e0c060;border-radius:5px;padding:6px 10px;margin-bottom:8px;">＋ Place Objective X — ضع الهدف X</button>';
        } else {
            if (st.objective_source === 'reused_previous') html += '<div style="margin-bottom:4px;font-size:11px;color:#7fd6a0;">↻ Reusing previous Objective X — إعادة استخدام الهدف السابق</div>';
            html += '<button data-act="place-obj" style="font:inherit;cursor:pointer;border:1px solid #5a6270;background:#22303f;color:#cfe6ff;border-radius:5px;padding:6px 10px;margin-bottom:8px;">↻ Place new Objective X — ضع هدفاً جديداً</button>';
        }
        html += '<div style="margin:0 0 6px;padding:5px 8px;border:1px solid #1a3050;border-radius:4px;background:#0a1220;">' +
            '<div style="font-size:11px;font-weight:700;color:#9ec2ec;letter-spacing:.5px;">GROUP MOVEMENT DEMO</div>' +
            '<div style="font-size:10px;color:#6a8fa8;margin-top:1px;">Animated group planner — لا علاقة له بالوحدات الحقيقية</div>' +
            '</div>';
        html += '<div style="margin:2px 0 8px;padding:7px 8px;border:1px solid #2a3f55;border-radius:5px;background:#0c141d;">' +
            '<label for="rmooz-ff-planner-mode" style="display:block;font-size:11px;color:#9ec2ec;margin-bottom:4px;">Group demo mode:</label>' +
            '<select id="rmooz-ff-planner-mode" data-act="planner-mode" style="width:100%;font:inherit;font-size:12px;background:#101b27;color:#e8eaed;border:1px solid #4a5f75;border-radius:4px;padding:5px;">' +
            '<option value="deterministic"' + (_plannerMode === 'deterministic' ? ' selected' : '') + '>Deterministic Planner - RMOOZ planner, works offline</option>' +
            '<option value="llm"' + (_plannerMode === 'llm' ? ' selected' : '') + '>LLM Assisted - Qwen/LiteLLM advisory, needs model</option>' +
            '</select></div>';
        // RMOOZ-AI-USER-FRIENDLY-MODEL-FLOW-A: the model picker no longer clutters the group-demo
        // header — model selection now lives in the AI Free Fight card (the operator-friendly flow +
        // the raw dropdown under Advanced diagnostics), so there is ONE place to choose the AI model.
        // FREE-FIGHT-CARD-VISIBILITY: the panel always opens; Start is gated on
        // Objective X (+ groups + anchors). No anchors → disabled + note; no
        // objective → disabled + "Place Objective X to start" note.
        var startBtn, startNote = '';
        if (!st.has_anchors) {
            startBtn = '<button data-act="start" disabled style="font:inherit;cursor:not-allowed;border:1px solid #3a5040;background:#162018;color:#5f8f74;border-radius:5px;padding:5px 10px;opacity:.55;">▶ Start Group Movement Demo</button>';
            startNote = '<div style="margin:2px 0 6px;font-size:11px;color:#e0a93a;">No map anchors available — لا توجد مراسٍ على الخريطة</div>';
        } else if (!st.can_start) {
            startBtn = '<button data-act="start" disabled title="Place Objective X first" style="font:inherit;cursor:not-allowed;border:1px solid #3a5040;background:#162018;color:#5f8f74;border-radius:5px;padding:5px 10px;opacity:.6;">▶ Start Group Movement Demo</button>';
            startNote = '<div style="margin:2px 0 6px;font-size:11px;color:#e0c060;">Place Objective X to start AI Free Fight<br>ضع الهدف X لبدء القتال التجريبي بالذكاء الاصطناعي</div>';
        } else {
            startBtn = '<button data-act="start" style="font:inherit;cursor:pointer;border:1px solid #2e7d54;background:#1f3a2b;color:#7fd6a0;border-radius:5px;padding:5px 10px;">▶ Start Group Movement Demo</button>';
        }
        html += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">' +
            startBtn +
            '<button data-act="replan" style="font:inherit;cursor:pointer;border:1px solid #4a7bb8;background:#172436;color:#9ec2ec;border-radius:5px;padding:5px 10px;">Re-plan Group Demo</button>' +
            '<button data-act="pause" style="font:inherit;cursor:pointer;border:1px solid #8a6a20;background:#2a2412;color:#e0c060;border-radius:5px;padding:5px 10px;">⏸ Pause</button>' +
            '<button data-act="reset" style="font:inherit;cursor:pointer;border:1px solid #5a6270;background:#2a2f37;color:#e8eaed;border-radius:5px;padding:5px 10px;">⟲ Reset Group Demo</button>' +
            '<button data-act="clear-obj" style="font:inherit;cursor:pointer;border:1px solid #7a3030;background:#241414;color:#f0a0a0;border-radius:5px;padding:5px 10px;">✕ Clear Objective X</button></div>';
        html += startNote;
        if (_llmStatus && _llmStatus.message) {
            var statusColor = _llmStatus.state === 'received' ? '#7fd6a0' : (_llmStatus.state === 'loading' ? '#e0c060' : '#e0a93a');
            html += '<div style="margin:2px 0 6px;font-size:11px;color:' + statusColor + ';">Group demo planner: ' + esc(_llmStatus.message) + '</div>';
        }
        html += '<div style="font-size:11px;color:#9aa3ad;margin-bottom:4px;">' + esc(objLine) + '</div>';
        if (st.warnings && st.warnings.length) {
            html += '<div style="margin-bottom:6px;font-size:11px;color:#e0a93a;">' +
                st.warnings.map(function (w) { return '⚠ ' + esc(w); }).join('<br>') + '</div>';
        }
        html += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px;font-size:11px;">' +
            '<span style="color:#f0a0a0;">RED demo attack — هجوم تجريبي للطرف الأحمر</span> · ' +
            '<span style="color:#7fd6a0;">BLUE demo reaction — رد فعل تجريبي للطرف الأزرق</span></div>';
        html += '<div style="padding:6px 8px;border-radius:5px;background:#2a2412;border:1px solid #b8860b;color:#e0c060;font-size:11px;line-height:1.5;">' +
            '⚠ AI-assisted demo only — not final tasking — requires commander approval<br>' +
            'عرض تجريبي بمساعدة الذكاء الاصطناعي — ليس إسناد واجب نهائي — يحتاج اعتماد القائد</div>';
        html += renderAiDecisionHtml();
        // RMOOZ-FREE-FIGHT-CONTROL-HARD-RESET-X: the operator-facing path is now the clean V2 control
        // window (renderFreeFightControlV2) — it renders ONLY the active state's view with unique v2-*
        // data-act ids, so no hidden duplicate buttons compete for clicks. The entire old crowded UI
        // (objective placement + group-movement demo + the full diagnostics card, built into `html`
        // above) is PRESERVED but inserted into the DOM ONLY when the closed "Diagnostics / Legacy"
        // drawer is opened. Engine unchanged — this is cockpit-only.
        bodyDiv.innerHTML = renderFreeFightControlV2() + _freeFightLegacyDrawerHtml(html);
        bind('start', start); bind('replan', replan); bind('pause', pause); bind('reset', reset); bind('clear-obj', clearObjective);
        bind('place-obj', armPlaceObjective);
        // RMOOZ-FREE-FIGHT-CONTROL-HARD-RESET-X: V2 control-window binds. Unique v2-* ids, scoped to the
        // new window — no collision with the legacy data-act ids (which only exist in the DOM when the
        // Diagnostics/Legacy drawer is open). Every visible v2 button maps to an EXISTING engine fn.
        bindFreeFightControlV2();
        bind('preview-ai', _fetchAiDecision); bind('apply-ai', _applyAiDecision); bind('reset-ai', _resetAiDecision);
        bind('test-llm', _testLlm);
        // FREEFIGHT-AI-COA-PLANNER-A: COA planner bindings
        bind('generate-coa', _generateCoaPlan);
        bind('apply-coa', _applySelectedCoa);
        bind('reset-coa', _resetCoa);
        // RMOOZ-COA-COMMIT-EXECUTION-L: COA Commitment Mode controls.
        bind('coa-commit', function () { _commitCoa(_coaSelectedIdx); });
        bind('coa-run', _runCommittedCoa);
        bind('coa-pause', _pauseCommittedCoa);
        bind('coa-replan', _replanCoa);
        bind('coa-exec-reset', _resetCoaExec);
        // RMOOZ-FREE-FIGHT-SIMPLE-OPERATOR-UX-O: primary-strip controls (wire to existing functions only).
        // Generate / Use Recommended / Use Selected are the only primary commit actions; COA reselection
        // happens via the COA cards (select-coa-*), and Staff-Safe / Replan / Clear live under Advanced.
        bind('generate-ai-plan', function () { setPlanningMode('commander'); _generateCoaPlan(); });
        bind('coa-use-recommended', function () { _coaSelectedIdx = _pickRecommendedIdx(_coaPlan); _commitCoa(_coaSelectedIdx); });
        bind('coa-use-selected', function () { _commitCoa(_coaSelectedIdx); });
        bind('select-coa-0', function () { _coaSelectedIdx = 0; updatePanel(); });
        bind('select-coa-1', function () { _coaSelectedIdx = 1; updatePanel(); });
        bind('select-coa-2', function () { _coaSelectedIdx = 2; updatePanel(); });
        // FREEFIGHT-AI-CONTINUOUS-COMMANDER-LOOP-A: loop + speed bindings
        bind('loop-start', startLoop);
        bind('loop-pause', pauseLoop);
        bind('loop-step', stepOnce);
        bind('loop-reset', resetLoop);
        bind('loop-route-check', _probeRouteHealth);
        bind('camera-manual', function () { setCameraMode('manual'); });
        bind('camera-follow', function () { setCameraMode('follow'); });
        ['controlled', 'free', 'high_variation'].forEach(function (m) { bind('mode-' + m, function () { setCommanderMode(m); }); });
        ['fast', 'normal', 'deep'].forEach(function (d) { bind('depth-' + d, function () { setAiDepth(d); }); });
        ['commander', 'staff_safe'].forEach(function (pm) { bind('planmode-' + pm, function () { setPlanningMode(pm); }); }); // RMOOZ-AI-COMMANDER-REPAIR-LOOP-A
        bind('view-mcp-prompt', function () { _mcpPromptExpanded = !_mcpPromptExpanded; updatePanel(); });
        bind('gen5-coas', generate5Coas);
        FF_SPEED_ORDER.forEach(function (sp) { bind('loop-speed-' + sp, function () { setFreeFightSpeed(sp); }); });
        renderCommanderPanel();
        var modeSel = _panel.querySelector('[data-act="planner-mode"]');
        if (modeSel && modeSel.addEventListener) modeSel.addEventListener('change', function () { setPlannerMode(modeSel.value); });
        var llmCb = _panel.querySelector('[data-act="toggle-llm"]');
        if (llmCb && llmCb.addEventListener) llmCb.addEventListener('change', function () { _useLlm = !!(llmCb && llmCb.checked); });
        // RMOOZ-LOCAL-MODEL-SELECTOR-A: model picker controls (raw dropdown, under Advanced).
        // Refresh keeps the current listing (local vs cloud) instead of receiving the click event.
        bind('model-refresh', function () { _fetchModels(_modelInfo && _modelInfo.is_cloud ? 'openrouter' : undefined); });
        bind('model-use', function () {
            var s = _panel && _panel.querySelector('[data-act="model-select"]');
            var v = s ? s.value : _pendingModel;
            if (v) _selectModel(v);
        });
        var modelSel = _panel.querySelector('[data-act="model-select"]');
        if (modelSel && modelSel.addEventListener) modelSel.addEventListener('change', function () { _pendingModel = modelSel.value; });
        // RMOOZ-AI-USER-FRIENDLY-MODEL-FLOW-A: the friendly model flow controls.
        bind('ff-open-model-picker', function () { _modelPickerOpen = !_modelPickerOpen; updatePanel(); });
        bind('ff-reset-model', function () { _resetModelSelection(); });
        bind('ff-load-local', function () { _fetchModels(); });
        bind('ff-load-cloud', function () { _fetchModels('openrouter'); });
        // RMOOZ-OFFLINE-AGENT-ARCHITECTURE-P: local-inference warmup + benchmark (Advanced diagnostics).
        bind('bench-warmup', _warmupModel);
        bind('bench-run', _runBenchmark);
        // RMOOZ-GREEN-WORLD-UI-R: manual Green refresh + the optional map-ring toggle.
        bind('green-refresh', function () { _refreshGreenWorld('manual'); });
        var greenCb = _panel.querySelector('[data-act="green-overlay-toggle"]');
        if (greenCb && greenCb.addEventListener) greenCb.addEventListener('change', function () { _greenOverlayOn = !!greenCb.checked; _greenOverlayApply(); });
        // RMOOZ-AI-SCHEDULER-DECISION-LOG-S: clear the audit buffer (record-only feature).
        bind('decision-log-clear', _clearDecisionLog);
        // RMOOZ-FREE-FIGHT-CONTROL-WINDOW-REBUILD-W: tab switching (view-only).
        ['operator', 'coa_plans', 'green', 'white', 'diagnostics'].forEach(function (t) { bind('ff-tab-' + t, function () { _ffTab = t; updatePanel(); }); });
        var picks = _panel.querySelectorAll ? _panel.querySelectorAll('[data-ff-model-pick]') : null;
        if (picks && picks.forEach) picks.forEach(function (el) {
            if (!el || !el.addEventListener) return;
            el.addEventListener('click', function () {
                var m = el.getAttribute('data-model');
                var p = el.getAttribute('data-provider');
                if (m) { _modelPickerOpen = false; _selectModel(m, p || undefined); }
            });
        });
    }
    function bind(act, fn) { if (!_panel) return; var b = _panel.querySelector('[data-act="' + act + '"]'); if (b && b.addEventListener) b.addEventListener('click', fn); }

    // Arm a one-shot map click to place Objective X (review-only).
    function armPlaceObjective() {
        var w = W();
        if (!mapReady()) return;
        if (_panel) { var b = _panel.querySelector('[data-act="place-obj"]'); if (b) b.textContent = 'Click the map to place Objective X…'; }
        var handler = function (e) {
            w.map.off('click', handler);
            if (e && e.latlng) setObjective({ lat: e.latlng.lat, lon: e.latlng.lng });
        };
        w.map.on('click', handler);
    }

    // FREEFIGHT-BLUE-WARNING-ROE-A: the BLUE Warning / ROE block — alert state,
    // ROE state, the top trigger and the BLUE warning/intercept actions. Shown in
    // both the right-side reasoning panel and the COA card. Review-only, no kills.
    function _blueWarningRoeHtml(situation, warningActions) {
        var s = situation;
        if (!s || !s.ok || !s.alert_state) return '';
        var alert = s.alert_state, roe = s.roe_state || 'HOLD';
        var alertColor = alert === 'ENGAGEMENT_READY' ? '#f08080' : (alert === 'ALERT' ? '#f0b060' : (alert === 'WARNING' ? '#e0c060' : '#7fd6a0'));
        var top = arr(s.triggers)[arr(s.triggers).length - 1];
        var h = '<div data-ff-roe="block" style="margin-top:5px;border:1px solid ' + (alert === 'WATCH' ? '#2a4d3a' : '#7a5a20') + ';border-radius:4px;padding:6px 8px;background:#1a1408;font-size:10px;line-height:1.45;">';
        h += '<div style="font-weight:700;color:#e0c060;margin-bottom:2px;">BLUE Warning / ROE</div>';
        h += '<div><span style="color:#8fa5b8;">Alert:</span> <span style="color:' + alertColor + ';font-weight:700;">' + esc(alert) + '</span> · <span style="color:#8fa5b8;">ROE:</span> <span style="color:' + alertColor + ';font-weight:700;">' + esc(roe) + '</span></div>';
        if (s.nearest_red_uid && s.nearest_red_to_objective_deg != null) {
            h += '<div><span style="color:#8fa5b8;">Threat:</span> <span style="color:#f0a0a0;">RED ' + esc(s.nearest_red_uid) + '</span> at ' + esc(s.nearest_red_to_objective_deg) + '° (' + esc(s.nearest_red_to_objective_km) + ' km) from ' + esc((s.objective && s.objective.name) || 'Objective X') + '</div>';
        }
        if (top) h += '<div><span style="color:#8fa5b8;">Trigger:</span> <span style="color:#d8c08a;">' + esc(top.text) + '</span></div>';
        var acts = arr(warningActions);
        if (acts.length) {
            h += '<div style="color:#8fa5b8;margin-top:2px;">Action:</div><ul style="margin:1px 0 0;padding-left:15px;">' +
                acts.map(function (a) { return '<li style="color:#e0d0a0;">' + esc(a) + '</li>'; }).join('') + '</ul>';
        }
        h += '<div style="color:#6a8fa8;margin-top:2px;font-size:9px;">Demo heuristic / review-only — no engagement resolution.</div>';
        h += '</div>';
        return h;
    }

    // RMOZ-INTEL-CAPABILITY-TERRAIN-ZONE-A: compact Intel Snapshot block — superiority
    // by domain, terrain, sovereign zone, ROE, best capability-matched BLUE assets,
    // and the recommended COA family. Review-only / demo abstraction.
    function _intelSnapshotHtml(intel) {
        if (!intel) return '';
        function supColor(v) { return v === 'BLUE' ? '#7fb0ff' : (v === 'RED' ? '#f0a0a0' : (v === 'contested' ? '#e0c060' : '#8fa5b8')); }
        function sup(label, v) { return '<span style="color:#8fa5b8;">' + label + ':</span> <span style="color:' + supColor(v) + ';">' + esc(v || 'unknown') + '</span>'; }
        var s = intel.superiority || {};
        var zs = intel.zone_state || {};
        var h = '<div data-ff-intel="block" style="margin-top:5px;border:1px solid #2a4d6a;border-radius:4px;padding:6px 8px;background:#08131e;font-size:10px;line-height:1.45;">';
        h += '<div style="font-weight:700;color:#9ec2ec;margin-bottom:2px;">Intel Snapshot <span style="color:#6a8fa8;font-weight:400;font-size:9px;">(demo / review-only)</span></div>';
        h += '<div>' + sup('Air', s.air) + ' · ' + sup('Naval', s.naval) + ' · ' + sup('Ground', s.ground) + ' · ' + sup('Sensor', s.sensor) + '</div>';
        h += '<div><span style="color:#8fa5b8;">Terrain:</span> <span style="color:#cdd8e4;">' + esc(intel.terrain_summary || 'unknown') + '</span></div>';
        if (zs.violation) {
            var ctry = (zs.owner_country && zs.owner_country !== 'unknown') ? (zs.owner_country + ' ') : '';
            h += '<div><span style="color:#8fa5b8;">Zone:</span> <span style="color:#f0b060;">RED in inferred ' + esc(ctry) + esc(zs.zone_type) + ' zone (' + esc(zs.severity) + ')</span></div>';
        } else {
            h += '<div><span style="color:#8fa5b8;">Zone:</span> <span style="color:#7fd6a0;">no inferred-zone violation</span></div>';
        }
        h += '<div><span style="color:#8fa5b8;">ROE:</span> <span style="color:#e0c060;">' + esc(intel.alert_state || 'WATCH') + ' / ' + esc(intel.roe_state || 'HOLD') + '</span></div>';
        var best = arr(intel.best_blue_assets).slice(0, 3).map(function (a) { return (a.unit_uid || '?') + ' ' + (a.class || ''); });
        if (best.length) h += '<div><span style="color:#8fa5b8;">Best BLUE assets:</span> <span style="color:#cdd8e4;">' + esc(best.join(', ')) + '</span>' + (intel.best_asset_role ? ' <span style="color:#6a8fa8;">(' + esc(intel.best_asset_role) + ')</span>' : '') + '</div>';
        if (intel.recommended_coa_family) h += '<div><span style="color:#8fa5b8;">COA family:</span> <span style="color:#7fd6a0;">' + esc(intel.recommended_coa_family) + '</span></div>';
        h += '</div>';
        return h;
    }

    // FREEFIGHT-LLM-CAPABILITY-ANALYST-A: compact "Capability Intelligence" block —
    // best asset per mission for the acting side + the selection logic + source.
    function _capabilityIntelHtml(cap, side, situation) {
        if (!cap) return '';
        var best = (cap.best_by_side && cap.best_by_side[side]) || cap.best || {};
        function line(lbl, b) {
            if (!b || !b.unit_uid) return '';
            return '<div><span style="color:#8fa5b8;">' + lbl + ':</span> <span style="color:#cfeaff;">' + esc(b.unit_uid) + ' ' + esc(b.class || '') + '</span></div>';
        }
        var rows = line('Best air intercept', best.air_intercept) + line('Best sensor', best.sensor) +
                   line('Best air defense', best.air_defense) + line('Best naval screen', best.naval_screen) +
                   line('Best ground hold', best.ground_hold);
        if (!rows) return '';
        // Selection logic from the situation/threat.
        var logic = '';
        if (situation && situation.alert_state && situation.alert_state !== 'WATCH') {
            var dom = situation.red_inside_engagement_zone || situation.red_inside_blue_defended_zone || situation.red_inside_blue_warning_zone;
            logic = 'asset chosen for the active threat (' + esc(situation.alert_state) + ' / ' + esc(situation.roe_state || '') + ')';
        } else {
            logic = 'no active threat — assets held in capability-matched roles';
        }
        var src = cap.review_required === false ? 'verified' : 'llm_inferred / heuristic — review required';
        var h = '<div data-ff-cap="block" style="margin-top:5px;border:1px solid #2a4d4d;border-radius:4px;padding:6px 8px;background:#081818;font-size:10px;line-height:1.45;">';
        h += '<div style="font-weight:700;color:#7fe0d0;margin-bottom:2px;">Capability Intelligence <span style="color:#6a8fa8;font-weight:400;font-size:9px;">(' + esc(src) + ')</span></div>';
        h += rows;
        h += '<div><span style="color:#8fa5b8;">Selection logic:</span> <span style="color:#cdd8e4;">' + esc(logic) + '</span></div>';
        h += '</div>';
        return h;
    }

    // RMOZ-COMMANDER-BRIEF-COALITION-A: coalition posture line + expandable, copyable
    // "AI Commander Decision" prose brief (review-only).
    function _commanderBriefHtml(brief) {
        if (!brief) return '';
        var cp = brief.coalition_posture || {};
        var h = '<div data-ff-brief="block" style="margin-top:5px;border:1px solid #2a4d6a;border-radius:4px;padding:6px 8px;background:#0a1622;font-size:10px;line-height:1.45;">';
        h += '<div style="font-weight:700;color:#9ec2ec;margin-bottom:2px;">Commander Brief <span style="color:#6a8fa8;font-weight:400;font-size:9px;">(demo / review-only)</span></div>';
        if (cp.coalition) {
            var coalColor = cp.coalition === 'none' ? '#8fa5b8' : '#7fd6a0';
            h += '<div><span style="color:#8fa5b8;">Coalition:</span> <span style="color:' + coalColor + ';font-weight:700;">' + esc(cp.coalition) + '</span>' +
                 (cp.lead_nation ? ' <span style="color:#6a8fa8;">(lead: ' + esc(cp.lead_nation) + ')</span>' : '') + '</div>';
            if (cp.text) h += '<div style="color:#cdd8e4;">' + esc(cp.text) + '</div>';
        }
        h += '<div style="margin-top:3px;"><button data-act="brief-toggle" style="font:inherit;cursor:pointer;border:1px solid #4a5f75;background:#101b27;color:#8fb8e0;border-radius:4px;padding:2px 7px;font-size:9px;">' +
             (_briefExpanded ? '▾ Hide full brief' : '▸ Show full brief (copyable)') + '</button>';
        if (_briefExpanded) h += ' <button data-act="brief-copy" style="font:inherit;cursor:pointer;border:1px solid #2e7d54;background:#1f3a2b;color:#7fd6a0;border-radius:4px;padding:2px 7px;font-size:9px;">⧉ Copy</button>';
        h += '</div>';
        if (_briefExpanded) {
            h += '<textarea data-ff-brief="copy" readonly style="width:100%;box-sizing:border-box;margin-top:4px;height:200px;background:#060c12;color:#cdd8e4;border:1px solid #2a4d6a;border-radius:4px;font:11px/1.4 monospace;padding:6px;resize:vertical;">' +
                 esc(brief.text || '') + '</textarea>';
        }
        h += '</div>';
        return h;
    }

    // FREEFIGHT-AI-CONTINUOUS-COMMANDER-LOOP-A: the right-side "AI Commander
    // Reasoning" panel — shows the current turn, active side, the auto-selected
    // COA, why it was chosen, units moved, expected next reaction, and a running
    // situation summary. Read-only mirror of the loop state.
    function renderCommanderPanel() {
        var w = W();
        if (!w || !w.document || !w.document.body) return;
        var rec = _lastCommanderDecision;
        // Only show while the loop has produced (or is producing) a decision.
        if (!rec && !_loopRunning) {
            if (_cmdrPanel && _cmdrPanel.parentNode) { _cmdrPanel.parentNode.removeChild(_cmdrPanel); _cmdrPanel = null; }
            return;
        }
        if (!_cmdrPanel) {
            _cmdrPanel = w.document.createElement('div');
            _cmdrPanel.id = 'rmooz-free-fight-commander-panel';
            _cmdrPanel.style.cssText = ['position:fixed', 'top:128px', 'right:24px', 'z-index:9955', 'background:#0a1018', 'border:1px solid #3a6a8a', 'border-radius:8px', 'padding:12px 14px', 'min-width:320px', 'max-width:380px', 'max-height:calc(100vh - 200px)', 'overflow:auto', 'box-shadow:0 4px 20px rgba(0,0,0,.7)', 'color:#e8eaed', 'font-family:inherit', 'direction:ltr'].join(';');
            w.document.body.appendChild(_cmdrPanel);
            // RMOZ-COMMANDER-BRIEF-COALITION-A: delegated handler for brief toggle / copy.
            if (typeof _cmdrPanel.addEventListener === 'function') {
                _cmdrPanel.addEventListener('click', function (ev) {
                    var t = ev && ev.target; if (!t || !t.getAttribute) return;
                    var act = t.getAttribute('data-act');
                    if (act === 'brief-toggle') { _briefExpanded = !_briefExpanded; renderCommanderPanel(); }
                    else if (act === 'brief-copy') {
                        try {
                            var ta = _cmdrPanel.querySelector('[data-ff-brief="copy"]');
                            if (ta) { if (ta.select) ta.select(); var d = w.document; if (d && d.execCommand) d.execCommand('copy'); else if (w.navigator && w.navigator.clipboard) w.navigator.clipboard.writeText(ta.value || ''); }
                        } catch (_) {}
                    }
                });
            }
        }
        function blist(list, color) {
            var a = arr(list);
            if (!a.length) return '';
            return '<ul style="margin:2px 0 4px;padding-left:16px;">' +
                a.map(function (b) { return '<li style="color:' + (color || '#cdd8e4') + ';margin-bottom:1px;">' + esc(b) + '</li>'; }).join('') + '</ul>';
        }
        var sideColor = (rec && rec.side === 'BLUE') ? '#7fb0ff' : '#f0a0a0';
        var runState = _loopRunning ? (_loopPaused ? 'Paused' : 'Running') : 'Stopped';
        // RMOOZ-AI-ATTACK-PLAN-MCP-PROMPT-A / honest labeling: only call it "AI Commander Reasoning"
        // when the decision actually came from the LLM. A deterministic/fallback plan must NOT be
        // presented as AI — it is the deterministic tactical planner (LLM not used).
        var isLlm = !!(rec && rec.source === 'llm');
        var title = isLlm ? 'AI Commander Reasoning — تفكير القائد الآلي' : 'Deterministic tactical planner — LLM not used';
        var titleColor = isLlm ? '#9ec2ec' : '#cdb86a';
        var h = '<div style="font-weight:700;color:' + titleColor + ';font-size:13px;margin-bottom:5px;">' + title + '</div>';
        h += '<div style="font-size:11px;color:#8fa5b8;margin-bottom:5px;">Status: <span style="color:#e0e8f0;">' + esc(runState) + '</span> · Speed: <span style="color:#e0e8f0;">' + esc(_ffSpeed().label) + '</span></div>';
        if (rec && !isLlm) {
            h += '<div data-ff-cmdr="not-ai" style="margin-bottom:5px;font-size:10px;color:#cdb86a;padding:4px 7px;border:1px solid #5a4f20;border-radius:4px;background:#1a1708;line-height:1.45;">Deterministic tactical planner — LLM not used. This is a fallback plan for the demo loop, not AI commander reasoning.</div>';
        }
        if (rec) {
            h += '<div style="border:1px solid #2a3f55;border-radius:5px;background:#0c141d;padding:7px 9px;font-size:11px;">';
            h += '<div style="margin-bottom:2px;"><span style="color:#8fa5b8;">Turn:</span> <span style="color:#e0e8f0;font-weight:700;">' + rec.turn + '</span> · <span style="color:#8fa5b8;">Active side:</span> <span style="color:' + sideColor + ';font-weight:700;">' + esc(rec.side) + '</span></div>';
            h += '<div style="margin-bottom:2px;"><span style="color:#8fa5b8;">Selected COA:</span> <span style="color:#7fd6a0;font-weight:700;">' + esc(rec.coa_id) + ' — ' + esc(rec.coa_title) + '</span></div>';
            var srcColor = rec.source === 'llm' ? '#90d090' : '#9ab0c0';
            h += '<div style="margin-bottom:2px;"><span style="color:#8fa5b8;">Decision source:</span> <span style="color:' + srcColor + ';">' + esc(rec.source) + '</span></div>';
            h += '<div style="margin-bottom:2px;"><span style="color:#8fa5b8;">Units moved:</span> <span style="color:#e0e8f0;">' + rec.moved + '</span>' +
                 (rec.held ? ' · <span style="color:#8fa5b8;">Already in position:</span> <span style="color:#9ab0c0;">' + rec.held + '</span>' : '') + '</div>';
            if (arr(rec.rationale).length) { h += '<div style="color:#7a9ab8;font-weight:600;margin-top:3px;">' + (isLlm ? 'Why this COA:' : 'Planner rationale (deterministic — not AI):') + '</div>'; h += blist(rec.rationale, '#cdd8e4'); }
            if (arr(rec.expected).length) { h += '<div style="color:#7a9ab8;font-weight:600;margin-top:2px;">Expected next reaction <span style="color:#8a6a3a;font-weight:400;">(preview)</span>:</div>'; h += blist(rec.expected, '#d8c08a'); }
            if (rec.summary) { h += '<div style="color:#7a9ab8;font-weight:600;margin-top:2px;">Situation summary:</div><div style="color:#cdd8e4;font-size:10px;line-height:1.4;">' + esc(rec.summary) + '</div>'; }
            // FREEFIGHT-BLUE-WARNING-ROE-A: BLUE warning / ROE block (when BLUE acted)
            if (rec.side === 'BLUE') h += _blueWarningRoeHtml(rec.situation, rec.warning_actions);
            // RMOZ-INTEL-CAPABILITY-TERRAIN-ZONE-A: Intel Snapshot block
            if (rec.intel) h += _intelSnapshotHtml(rec.intel);
            // FREEFIGHT-LLM-CAPABILITY-ANALYST-A: Capability Intelligence block
            if (rec.capability) h += _capabilityIntelHtml(rec.capability, rec.side, rec.situation);
            // RMOZ-COMMANDER-BRIEF-COALITION-A: coalition + copyable commander brief
            if (rec.brief) h += _commanderBriefHtml(rec.brief);
            // RMOZ-AI-TOOL-CONTRACT-A: compact tool-contract status line
            if (rec.tool_contract) {
                var tc = rec.tool_contract;
                var vColor = tc.validated ? '#7fd6a0' : '#f0a040';
                h += '<div data-ff-toolcontract="line" style="margin-top:5px;font-size:9.5px;color:#8fa5b8;border-top:1px solid #1a3050;padding-top:3px;">' +
                     'AI Tool Contract: <span style="color:' + vColor + ';font-weight:700;">' + (tc.validated ? 'valid' : 'rejected') + '</span>' +
                     (tc.rejected_reason ? ' <span style="color:#e0a93a;">(' + esc(tc.rejected_reason) + ')</span>' : '') +
                     ' · tools: <span style="color:#cdd8e4;">' + esc(arr(tc.tools_used).join(', ')) + '</span>' +
                     ' · fallback: <span style="color:#cdd8e4;">' + (tc.fallback_used ? 'yes' : 'no') + '</span></div>';
            }
            h += '</div>';
        } else {
            h += '<div style="font-size:11px;color:#7a9ab8;padding:4px 0;">Waiting for first AI commander decision…</div>';
        }
        h += '<div style="margin-top:6px;padding:5px 7px;border-radius:4px;background:#2a2412;border:1px solid #b8860b;color:#e0c060;font-size:10px;">AI-controlled free fight demo — review-only — not final tasking — requires commander approval</div>';
        _cmdrPanel.innerHTML = h;
    }

    // FREE-FIGHT-AI-LITE-A: the "AI Free Fight Reasoning" panel (why RED/BLUE
    // were chosen, terrain used, missing info, confidence, warnings). Read-only.
    function renderAiPanel() {
        var w = W();
        if (!w || !w.document || !w.document.body) return;
        if (!finiteLL(_objective) || !_plan) {
            if (_aiPanel && _aiPanel.parentNode) { _aiPanel.parentNode.removeChild(_aiPanel); _aiPanel = null; }
            return;
        }
        if (!_aiPanel) {
            _aiPanel = w.document.createElement('div');
            _aiPanel.id = 'rmooz-free-fight-ai-panel';
            _aiPanel.style.cssText = ['position:fixed', 'top:128px', 'right:24px', 'z-index:9954', 'background:#0e1620', 'border:1px solid #4a7bb8', 'border-radius:8px', 'padding:12px 14px', 'min-width:320px', 'max-width:380px', 'max-height:calc(100vh - 200px)', 'overflow:auto', 'box-shadow:0 4px 20px rgba(0,0,0,.65)', 'color:#e8eaed', 'font-family:inherit', 'direction:ltr'].join(';');
            w.document.body.appendChild(_aiPanel);
        }
        function entry(e, c) {
            var rw = arr(e.route_warnings);
            return '<div style="margin:5px 0;padding:6px 8px;border:1px solid #2a3f55;border-radius:5px;background:#0c141d;font-size:11px;">' +
                '<div style="color:' + c + ';font-weight:600;">' + esc(e.country || e.demo_group_id) + (e.reaction_type ? ' · ' + esc(e.reaction_type) : '') + ' · ' + esc(e.source_base || '-') + '</div>' +
                '<div style="color:#cdd8e4;margin-top:2px;">' + esc(e.reason || '') + '</div>' +
                '<div style="color:#9ab;margin-top:2px;">domain: ' + esc(e.movement_domain || '-') + ' · route_type: ' + esc(e.route_type || '-') + '</div>' +
                '<div style="color:#9ab;">route: ' + esc(e.route_summary || '-') + '</div>' +
                '<div style="color:#9ab;">terrain: ' + esc(e.terrain_summary || '-') + '</div>' +
                (rw.length ? '<div style="color:#e0a93a;">⚠ ' + esc(rw.join('; ')) + '</div>' : '') +
                '<div style="color:#8fa5b8;">confidence: ' + esc(e.confidence || 'low') + (arr(e.warnings).length ? ' · ⚠ ' + esc(e.warnings.join(', ')) : '') + '</div></div>';
        }
        var h = '<div style="font-weight:700;color:#9ec2ec;font-size:13px;margin-bottom:4px;">AI Attack Plan Reasoning — تفسير قرار الذكاء الاصطناعي</div>' +
            '<div style="font-size:10px;color:#7f93a6;margin-bottom:6px;">' + esc(_plan.planner || 'deterministic heuristic (no LLM)') + ' · terrain_used: ' + (!!_plan.terrain_used) + '</div>';
        h += '<div style="font-size:11px;color:#cdd8e4;margin-bottom:6px;padding:5px 7px;border:1px solid #2a3f55;border-radius:4px;background:#0c141d;">' +
            'planner mode: ' + esc(_plannerMode === 'llm' ? 'LLM Assisted' : 'Deterministic Planner') + '<br>' +
            'active planner: ' + esc(_planSource === 'llm_advisory' ? 'LLM advisory' : 'deterministic') + '<br>' +
            'validation: ' + esc(_llmStatus.validation_result || 'not_requested') +
            (_llmStatus.fallback_reason ? '<br>fallback: ' + esc(_llmStatus.fallback_reason) : '') + '<br>' +
            'LLM output is advisory only - RMOOZ validated</div>';
        h += '<div style="color:#f0a0a0;font-weight:600;font-size:12px;">RED attack (' + arr(_plan.red_attack_plan).length + ')</div>';
        h += arr(_plan.red_attack_plan).map(function (e) { return entry(e, '#f0a0a0'); }).join('') || '<div style="color:#e0a93a;font-size:11px;">No RED attack groups available</div>';
        h += '<div style="color:#7fd6a0;font-weight:600;font-size:12px;margin-top:6px;">BLUE reaction (' + arr(_plan.blue_reaction_plan).length + ')</div>';
        h += arr(_plan.blue_reaction_plan).map(function (e) { return entry(e, '#7fd6a0'); }).join('') || '<div style="color:#e0a93a;font-size:11px;">No BLUE reaction groups available</div>';
        if (arr(_plan.warnings).length) h += '<div style="margin-top:6px;font-size:11px;color:#e0a93a;">' + _plan.warnings.map(function (x) { return '⚠ ' + esc(x); }).join('<br>') + '</div>';
        if (arr(_plan.missing_information).length) h += '<div style="margin-top:4px;font-size:11px;color:#c98;">missing: ' + esc(_plan.missing_information.join(', ')) + '</div>';
        h += '<div style="margin-top:6px;font-size:10px;color:#9ec2ec;">domain-aware demo route — not final tasking</div>';
        h += '<div style="margin-top:8px;padding:5px 7px;border-radius:4px;background:#10202c;border:1px solid #2e5d7d;color:#9ec2ec;font-size:11px;">Preview overlay only — not actual imported positions. Imported proposed rows remain grouped under base/location anchors. <span style="color:#8fa5b8;">(Free Fight Preview Group · review_only · demo_only · exact_unit_position:false)</span></div>';
        h += '<div style="margin-top:6px;padding:5px 7px;border-radius:4px;background:#2a2412;border:1px solid #b8860b;color:#e0c060;font-size:11px;">AI-assisted demo only — not final tasking — requires commander approval<br>عرض تجريبي بمساعدة الذكاء الاصطناعي — ليس إسناد واجب نهائي — يحتاج اعتماد القائد</div>';
        _aiPanel.innerHTML = h;
    }

    // Best-effort terrain enrichment: probe /api/terrain, re-plan if a DEM is
    // available. Graceful no-op when terrain/DEM is absent (stays geometric).
    function probeTerrain() {
        var w = W();
        if (!w || typeof w.fetch !== 'function' || !finiteLL(_objective) || !groups().length) return;
        try {
            w.fetch('/api/terrain/health').then(function (r) { return r.json(); }).then(function (hh) {
                if (!hh || hh.available !== true) return;   // no DEM → stay geometric (graceful, advisory-only)
                var gs = groups().filter(function (g) { return finiteLL(g.anchor) && finiteLL(g.target); });
                var jobs = gs.map(function (g) {
                    // /api/terrain/profile expects { points: [{lat,lon}, ...] }.
                    return w.fetch('/api/terrain/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ points: [{ lat: g.anchor.lat, lon: g.anchor.lon }, { lat: g.target.lat, lon: g.target.lon }] }) })
                        .then(function (r) { return r.json(); }).then(function (p) { return { id: g.id, p: p }; }).catch(function () { return null; });
                });
                Promise.all(jobs).then(function (res) {
                    var routes = {};
                    res.filter(Boolean).forEach(function (x) {
                        var p = x.p || {}, s = p.slope || {}, e = p.elevation || {};
                        var mob = (s.no_go_segments > 0) ? 'no_go' : (s.slow_go_segments > 0 ? 'slow_go' : 'go');
                        var gain = (e.max_m != null && e.min_m != null) ? Math.round(e.max_m - e.min_m) : null;
                        routes[x.id] = { available: true, max_slope_deg: (s.max_deg != null ? s.max_deg : null), elevation_gain_m: gain, mobility: mob, distance_km: p.distance_km };
                    });
                    _terrain = { available: true, routes: routes };
                    if (_planSource !== 'llm_advisory') selectSample();
                    if (mapReady()) syncMarkers();
                    renderAiPanel(); updatePanel();
                }).catch(function () {});
            }).catch(function () {});
        } catch (_) {}
    }

    // ── FREEFIGHT-DEMO-AI-INTEGRATE-A: unit-level AI decision (integrated) ────
    function _appendToEventLog(entry) {
        if (!entry) return;
        try {
            var w = W();
            if (w && w.AppShellEventLog && typeof w.AppShellEventLog.append === 'function') {
                w.AppShellEventLog.append({ category: 'OPERATOR', severity: 'info', source: 'FF-AI', message: entry });
            }
        } catch (_) {}
    }
    // RMOZ-INTEL-CAPABILITY-TERRAIN-ZONE-A: narrate the intel snapshot to the ledger
    // (INTEL zone violation, ROE, CAPABILITY asset selection, TERRAIN — honest if N/A).
    function _appendIntelEventLog(intel) {
        if (!intel) return;
        var zs = intel.zone_state;
        if (zs && zs.violation) {
            var ctry = zs.owner_country && zs.owner_country !== 'unknown' ? (zs.owner_country + ' ') : '';
            _appendToEventLog('INTEL: RED unit entered inferred ' + ctry + esc(zs.zone_type) + ' zone (' + esc(zs.severity) + ') — review-only.');
        }
        if (intel.roe_state && intel.roe_state !== 'HOLD') {
            _appendToEventLog('ROE: BLUE alert ' + esc(intel.alert_state) + ' / ROE ' + esc(intel.roe_state) + '.');
        }
        var best = arr(intel.best_blue_assets)[0];
        if (best && intel.best_asset_role) {
            _appendToEventLog('CAPABILITY: BLUE ' + esc(best.class || 'asset') + ' package selected for ' + esc(intel.best_asset_role) + ' (capability-matched).');
        }
        if (intel.terrain_summary) {
            _appendToEventLog('TERRAIN: ' + esc(intel.terrain_summary) + '.');
        }
    }
    // FREEFIGHT-LLM-CAPABILITY-ANALYST-A: narrate per-mission asset selection to the
    // ledger (which unit is the air-intercept / sensor / naval asset, and what is held).
    function _appendCapabilityEventLog(cap, side, situation) {
        if (!cap) return;
        var best = (cap.best_by_side && cap.best_by_side[side]) || cap.best || {};
        var srcTag = cap.review_required === false ? 'verified' : 'llm_inferred';
        var airThreat = situation && (situation.red_inside_engagement_zone || situation.red_inside_blue_defended_zone || situation.red_inside_blue_warning_zone);
        if (best.air_intercept) _appendToEventLog('CAPABILITY: ' + best.air_intercept.unit_uid + ' ' + (best.air_intercept.class || '') + ' selected as air-intercept asset (' + srcTag + ').');
        if (best.sensor) _appendToEventLog('CAPABILITY: ' + best.sensor.unit_uid + ' radar/sensor kept in sensor support role.');
        if (best.air_defense) _appendToEventLog('CAPABILITY: ' + best.air_defense.unit_uid + ' ' + (best.air_defense.class || '') + ' held in air-defense posture.');
        if (best.naval_screen) _appendToEventLog('CAPABILITY: ' + best.naval_screen.unit_uid + ' ' + (best.naval_screen.class || '') + ' available for naval screen.');
        if (airThreat && best.ground_hold) _appendToEventLog('CAPABILITY: ground reserve ' + best.ground_hold.unit_uid + ' held — not suitable for air intercept.');
    }
    // RMOZ-AI-TOOL-CONTRACT-A: narrate the tool-contract pipeline to the ledger.
    function _appendToolContractEventLog(tc) {
        if (!tc) return;
        _appendToEventLog('AI TOOL: ' + arr(tc.tools_used).join(' + ') + ' context built (' + tc.version + ').');
        if (tc.recommended_family) {
            var avoided = arr(tc.avoid_repeating)[0];
            _appendToEventLog('AI TOOL: COA family selected: ' + tc.recommended_family + (avoided ? ', previous family avoided: ' + avoided : '') + '.');
        }
        _appendToEventLog('AI VALIDATOR: COA ' + (tc.validated ? 'accepted' : ('rejected — ' + (tc.rejected_reason || 'invalid') + (tc.fallback_used ? ' (deterministic fallback used)' : ''))) + '.');
    }
    function _buildAiRequestBody() {
        var w = W();
        var sourceUsed = 'none';
        var dTotal = 0, dWithId = 0, dWithCoords = 0, dMovable = 0;

        function normUnit(u) {
            if (!u) return null;
            var id = u.id || u.uid || u.unit_uid;
            if (!id) return null;
            var lat = u.lat, lon = u.lon;
            if ((lat == null || lon == null) && Array.isArray(u.coord) && u.coord.length >= 2) {
                lon = u.coord[0]; lat = u.coord[1];
            }
            if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lon))) return null;
            // RMOOZ-UNIT-IDENTITY-CONTRACT-A: resolve identity ONE way. Never let a
            // role token or a synthetic role-index label pose as the platform — that
            // made the LLM mistake a unit for a real platform.
            var ident = (window.RmoozUnitIdentity && window.RmoozUnitIdentity.unitIdentityForLlm)
                ? window.RmoozUnitIdentity.unitIdentityForLlm(u, { side: u.side }) : null;
            return { id: String(id), uid: String(id), lat: +lat, lon: +lon,
                     side: String(u.side || 'RED').toUpperCase(),
                     // RMOZ-INTEL/COMMANDER-BRIEF: preserve fields the intel layer reads.
                     role: u.role || null,
                     country: u.country || u.nation || null,
                     platform: (ident && ident.platform_name && ident.platform_name !== 'unknown')
                         ? ident.platform_name : (u.platform || null),
                     display_name: ident ? ident.display_name : (u.label || u.name || String(id)),
                     unit_identity: ident || undefined };
        }

        function tallyRaw(raw) {
            dTotal = raw.length;
            dWithId = raw.filter(function(u) { return u && (u.id || u.uid || u.unit_uid); }).length;
            dWithCoords = raw.filter(function(u) {
                if (!u) return false;
                var la = u.lat, lo = u.lon;
                if ((la == null || lo == null) && Array.isArray(u.coord) && u.coord.length >= 2) { lo = u.coord[0]; la = u.coord[1]; }
                return Number.isFinite(Number(la)) && Number.isFinite(Number(lo));
            }).length;
        }

        var units = [];

        // Priority A: window.RmoozScenario.scenario units (real loaded scenario)
        var sc = w && w.RmoozScenario && w.RmoozScenario.scenario;
        if (sc) {
            var rawA = (Array.isArray(sc.red_units) ? sc.red_units : []).concat(
                       Array.isArray(sc.blue_units_initial) ? sc.blue_units_initial : []);
            if (rawA.length) {
                tallyRaw(rawA);
                units = rawA.map(normUnit).filter(Boolean);
                dMovable = units.length;
                if (units.length) sourceUsed = 'scenario';
            }
        }

        // Priority B: operational_brief.proposed_units
        if (!units.length) {
            var ob = (_payload && _payload.brief && _payload.brief.operational_brief) || (_payload && _payload.operational_brief) || {};
            var rawB = Array.isArray(ob.proposed_units) ? ob.proposed_units : [];
            if (rawB.length) {
                tallyRaw(rawB);
                units = rawB.map(normUnit).filter(Boolean);
                dMovable = units.length;
                if (units.length) sourceUsed = 'proposed_units';
            }
        }

        // Priority C: _allGroups anchor positions
        if (!units.length) {
            var grps = _allGroups.filter(function(g) { return g && g.anchor && finiteLL(g.anchor); });
            if (grps.length) {
                dTotal = grps.length; dWithId = grps.length; dWithCoords = grps.length;
                units = grps.map(function(g) {
                    return { id: g.id, uid: g.id, lat: g.anchor.lat, lon: g.anchor.lon,
                             side: String(g.side || 'RED').toUpperCase(), platform: null };
                });
                dMovable = units.length;
                sourceUsed = 'groups';
            }
        }

        _aiDiagnostics = { source_used: sourceUsed, units_total: dTotal, units_with_id: dWithId, units_with_coords: dWithCoords, units_movable: dMovable };

        // FREEFIGHT-AI-CONTINUOUS-COMMANDER-LOOP-A: the loop must follow the LOADED
        // scenario's OWN objective — never a stale operator-placed Objective X left
        // over from a previously-loaded scenario. Priority:
        //   1. loaded scenario objective (sc.obj / sc.objective / sc.objectives[0])
        //   2. operator-placed Objective X (_objective) — for scenarios with none
        //   3. operational_brief objectives from the payload
        function scenObjToLL(o) {
            if (!o) return null;
            if (Array.isArray(o.coord) && o.coord.length >= 2 && Number.isFinite(+o.coord[0]) && Number.isFinite(+o.coord[1]))
                return { lat: +o.coord[1], lon: +o.coord[0], name: o.name || 'Objective X' };
            if (Number.isFinite(+o.lat) && Number.isFinite(+o.lon)) return { lat: +o.lat, lon: +o.lon, name: o.name || 'Objective X' };
            return null;
        }
        var objectives = [];
        var scLL = sc ? (scenObjToLL(sc.obj) || scenObjToLL(sc.objective)) : null;
        if (!scLL && sc && Array.isArray(sc.objectives) && sc.objectives.length) scLL = scenObjToLL(sc.objectives[0]);
        if (scLL) objectives = [scLL];

        var ob2 = (_payload && _payload.brief && _payload.brief.operational_brief) || (_payload && _payload.operational_brief) || {};
        if (!objectives.length && finiteLL(_objective)) objectives = [{ lat: _objective.lat, lon: _objective.lon, name: 'Objective X' }];
        if (!objectives.length && Array.isArray(ob2.placement_candidates)) {
            objectives = ob2.placement_candidates.filter(function(c) { return c && String(c.type || '').toLowerCase() === 'objective'; });
        }
        if (!objectives.length && Array.isArray(ob2.objectives)) objectives = ob2.objectives;

        var allowedUnitIds = units.map(function(u) { return u.id; });
        return { units: units, objectives: objectives, opts: { preferSide: 'RED', useLlm: _useLlm, ai_depth: _aiDepth, commander_mode: _commanderMode, planning_mode: _planningMode, allowed_unit_ids: allowedUnitIds } };
    }
    // FREEFIGHT-COA-ROUTE-JSON-GUARD-A: never blindly call r.json(). A stale/wrong
    // server answers POSTs to unknown routes with plain "Method Not Allowed" (405),
    // which would throw "Unexpected token 'M' … is not valid JSON". This reads the
    // body as text first and returns a structured object on any non-JSON response.
    function _fetchJsonSafe(url, options) {
        var w = W();
        return w.fetch(url, options).then(function (r) {
            return r.text().then(function (txt) {
                var parsed = null;
                try { parsed = txt ? JSON.parse(txt) : null; } catch (_) {}
                if (!parsed || typeof parsed !== 'object') {
                    return {
                        ok: false,
                        reason: 'non_json_response',
                        status: r.status,
                        statusText: r.statusText || '',
                        body_preview: String(txt || '').slice(0, 240),
                        route: url,
                    };
                }
                if (!r.ok && parsed.ok !== false) {
                    parsed.ok = false;
                    parsed.reason = parsed.reason || ('http_' + r.status);
                    parsed.status = r.status;
                }
                return parsed;
            });
        });
    }
    // A response signals the route is unavailable (stub/old/wrong server) when it is
    // non-JSON or an HTTP 405/404 — NOT an LLM failure.
    function _isRouteUnavailable(resp) {
        if (!resp || typeof resp !== 'object') return false;
        if (resp.reason === 'non_json_response') return true;
        if (resp.status === 405 || resp.status === 404) return true;
        if (typeof resp.reason === 'string' && /^http_(404|405)/.test(resp.reason)) return true;
        return false;
    }
    function _routeUnavailableText(resp) {
        var route = (resp && resp.route) || '/api/wargame-sim/free-fight/plan-coas';
        var detail = '';
        if (resp && resp.status) detail = ' (HTTP ' + resp.status + (resp.body_preview ? ': ' + resp.body_preview : '') + ')';
        return 'Planner route unavailable — running server does not support POST ' + route + detail +
               '. Start the real RMOOZ server, not the stub preview server, and restart after the latest commit.';
    }
    // Probe the planner route health endpoint (GET, cheap). Updates _routeHealth.
    // RMOOZ-AI-MODEL-READY-STATE-A: returns the promise so callers (e.g. _selectModel) can chain/await,
    // and a transient probe failure does NOT clobber a known-good health (e.g. one just reconciled
    // from a model selection) — otherwise a flaky probe would wrongly drop the card out of "Ready".
    function _probeRouteHealth() {
        var w = W();
        if (!w || typeof w.fetch !== 'function') return Promise.resolve(_routeHealth);
        return _fetchJsonSafe('/api/wargame-sim/free-fight/plan-coas/health', { method: 'GET' })
            .then(function (h) { _routeHealth = h; updatePanel(); return h; })
            .catch(function (e) {
                if (!_routeHealth || _routeHealth.allow_sim_run == null) {
                    _routeHealth = { ok: false, reason: 'probe_failed', error: (e && e.message) || 'error' };
                }
                updatePanel();
                return _routeHealth;
            });
    }
    // RMOOZ-AI-MODEL-READY-STATE-A: the /api/ai/models (and /model/select) payload is the authoritative,
    // up-to-the-moment model state for the CURRENT selection (gate + provider + model_available, cloud
    // flags). The route-health probe is a second async round-trip that lags it. To make the card flip to
    // "Ready" the instant an available model is selected (no reload, no waiting on the probe), fold that
    // fresh model state into _routeHealth — the single signal _freeFightAiReady()/_modelFlowStatus() read.
    // The async probe then re-confirms (idempotent: they agree — same local /api/tags check).
    function _reconcileRouteHealthFromModelInfo(m) {
        if (!m || m.ok === false) return;
        var prev = _routeHealth || {};
        var cloud = (m.is_cloud === true) || (m.provider === 'openrouter');
        _routeHealth = Object.assign({}, prev, {
            ok: true,
            allow_sim_run:    (m.allow_sim_run    != null) ? m.allow_sim_run    : prev.allow_sim_run,
            model_available:  (m.model_available  != null) ? m.model_available  : prev.model_available,
            provider_blocked: (m.provider_blocked != null) ? !!m.provider_blocked : prev.provider_blocked,
            configured_provider: m.configured_provider || (cloud ? 'openrouter' : 'ollama'),
            provider: (m.provider_blocked ? 'ollama' : (cloud ? 'openrouter' : 'ollama')),
            model:          m.selected_model || prev.model,
            selected_model: m.selected_model || prev.selected_model,
        });
    }
    // RMOOZ-LOCAL-MODEL-SELECTOR-A: list models + current selection (mirrors the global header HUD).
    // RMOOZ-AI-USER-FRIENDLY-MODEL-FLOW-A: optional provider ('openrouter') previews the cloud
    // catalog (only meaningful when cloud mode is enabled); default = the current selection's provider.
    function _fetchModels(provider) {
        var w = W();
        if (!w || typeof w.fetch !== 'function') return;
        var url = '/api/ai/models' + (provider ? ('?provider=' + encodeURIComponent(provider)) : '');
        _fetchJsonSafe(url, { method: 'GET' })
            .then(function (m) {
                _modelInfo = m;
                if (_pendingModel == null && m && m.selected_model) _pendingModel = m.selected_model;
                // RMOOZ-AI-MODEL-READY-STATE-A: the DEFAULT listing reflects the real current selection
                // (gate + provider + model_available), so fold it into _routeHealth — the signal
                // readiness reads — so ANY model-list refresh (mount, header-HUD change, Refresh) flips
                // the card to Ready, not just the in-card picker. A provider PREVIEW (?provider=…) does
                // NOT reflect the active selection, so it must not move readiness.
                if (!provider) _reconcileRouteHealthFromModelInfo(m);
                _maybeAutoSelectModel();   // RMOOZ-AI-USER-FRIENDLY-MODEL-FLOW-A
                updatePanel();
            })
            .catch(function (e) { _modelInfo = { ok: false, error: (e && e.message) || 'error' }; updatePanel(); });
    }
    // RMOOZ-AI-USER-FRIENDLY-MODEL-FLOW-A: auto-select the best model so the operator rarely has to
    // pick. Rules (req #4): saved model available → keep it (no-op); exactly ONE installed local model
    // → select it automatically; multiple installed but the saved one is missing → leave it for the
    // operator (the status shows "Choose another model"). Cloud is never auto-selected (data-leaves
    // consent must be explicit). The guard prevents a select→refetch→select loop.
    function _maybeAutoSelectModel() {
        var info = _modelInfo;
        if (!info || info.ok === false) return false;
        if (info.model_available === true) return false;   // saved model is available → nothing to do
        if (info.is_cloud === true) return false;          // never auto-pick a cloud model
        var avail = (Array.isArray(info.models) ? info.models : []).filter(function (m) { return m && m.available !== false; });
        if (avail.length === 1) {
            var only = avail[0] && avail[0].name;
            if (only && only !== info.selected_model && _autoSelectedModel !== only) {
                _autoSelectedModel = only;
                _selectModel(only, 'ollama');
                return true;
            }
        }
        return false;
    }
    // RMOOZ-LOCAL-MODEL-SELECTOR-A: persist the operator's choice app-wide, then re-probe route health
    // (model_available may flip) and tell the rest of the app via rmooz:ai-model-changed.
    // RMOOZ-AI-USER-FRIENDLY-MODEL-FLOW-A: provider is optional ('ollama' default | 'openrouter' cloud).
    function _selectModel(model, provider) {
        var w = W();
        if (!model || !w || typeof w.fetch !== 'function') return Promise.resolve();
        var body = provider ? { model: model, provider: provider } : { model: model };
        return _fetchJsonSafe('/api/ai/model/select', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        }).then(function (m) {
            if (m && m.ok) {
                _modelInfo = m;
                _pendingModel = m.selected_model || model;
                // RMOOZ-AI-MODEL-READY-STATE-A: fold the fresh model state into _routeHealth NOW so the
                // card flips to "Ready" on this render — without waiting on the route-health probe.
                _reconcileRouteHealthFromModelInfo(m);
                try {
                    document.dispatchEvent(new CustomEvent('rmooz:ai-model-changed',
                        { detail: { model: _pendingModel, source: 'free_fight_card', model_available: !!m.model_available } }));
                } catch (_) {}
            } else {
                _modelInfo = Object.assign({}, _modelInfo || {}, { ok: false, error: (m && m.error) || 'select_failed' });
            }
            updatePanel();                 // immediate: shows Ready from the reconciled state
            // RMOOZ-AI-MODEL-READY-LIVE-A: after the selection persists, force a full refresh of BOTH
            // authoritative signals — /api/ai/models (list + availability) and route-health (the gate +
            // live /api/tags probe) — then re-render. No page reload needed; the card flips to Ready the
            // moment the selected model is available. _fetchModels() also reconciles _routeHealth and
            // calls updatePanel(); the model is now available so it never re-enters the auto-select path.
            try { _fetchModels(); } catch (_) {}
            return _probeRouteHealth();    // re-confirm with the authoritative server health (idempotent)
        }).catch(function (e) {
            _modelInfo = Object.assign({}, _modelInfo || {}, { ok: false, error: (e && e.message) || 'select_failed' });
            updatePanel();
        });
    }
    // RMOOZ-OPENROUTER-FREE-FIGHT-CONTROL-FIX-I: "Reset AI Selection" — clear the runtime selection
    // (server deletes runtime/ai-model-selection.json) so resolution falls back to the env chain /
    // default, then refresh the model list + route health so the card re-renders the true state.
    function _resetModelSelection() {
        var w = W();
        if (!w || typeof w.fetch !== 'function') return Promise.resolve();
        _pendingModel = null; _autoSelectedModel = null;
        return _fetchJsonSafe('/api/ai/model/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
            .then(function (m) {
                if (m && m.ok) { _modelInfo = m; _reconcileRouteHealthFromModelInfo(m); }
                try { document.dispatchEvent(new CustomEvent('rmooz:ai-model-changed',
                    { detail: { model: (m && m.selected_model) || '', source: 'free_fight_card', reset: true } })); } catch (_) {}
                updatePanel();
                return _probeRouteHealth();
            })
            .catch(function (e) { _modelInfo = Object.assign({}, _modelInfo || {}, { ok: false, error: (e && e.message) || 'reset_failed' }); updatePanel(); });
    }
    // RMOOZ-LOCAL-MODEL-SELECTOR-A: model-picker block for the Free Fight control panel.
    function renderModelSelectorHtml() {
        var info = _modelInfo;
        var models = (info && Array.isArray(info.models)) ? info.models : [];
        var selected = (info && info.selected_model) || '';
        var sel = _pendingModel != null ? _pendingModel : selected;
        var opts = models.length
            ? models.map(function (m) {
                var name = (m && m.name) ? m.name : String(m);
                var label = name + (m && m.available === false ? '  (not installed)' : '');
                return '<option value="' + esc(name) + '"' + (name === sel ? ' selected' : '') + '>' + esc(label) + '</option>';
            }).join('')
            : '<option value="">' + ((info && info.ok === false) ? '(provider offline)' : '(loading…)') + '</option>';
        var statusColor = (!info || info.ok === false) ? '#e0a93a'
            : (info.allow_sim_run !== true ? '#e0c060'
            : (info.model_available === false ? '#f0a0a0' : '#7fd6a0'));
        var statusTxt;
        if (!info || info.ok === false) {
            statusTxt = 'Models unavailable — تعذّر جلب النماذج' + (info && info.error ? ' (' + esc(info.error) + ')' : '');
        } else {
            statusTxt = 'Selected — المختار: ' + esc(info.selected_model || '—') +
                ' · installed — مُثبّت: ' + (info.model_available === true ? 'yes/نعم' : (info.model_available === false ? 'NO/لا' : '?')) +
                ' · AI gate (RMOOZ_ALLOW_SIM_RUN): ' + (info.allow_sim_run === true ? 'on/مفعّل' : 'off/معطّل');
        }
        return '<div style="margin:2px 0 8px;padding:7px 8px;border:1px solid #2a3f55;border-radius:5px;background:#0c141d;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;color:#9ec2ec;margin-bottom:4px;">' +
                '<span>Local AI model — النموذج المحلي</span><span style="color:#6a8fa8;">Provider: Ollama</span></div>' +
            '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">' +
                '<select id="rmooz-ff-model-select" data-act="model-select" dir="ltr" style="flex:1 1 150px;min-width:120px;font:inherit;font-size:12px;background:#101b27;color:#e8eaed;border:1px solid #4a5f75;border-radius:4px;padding:5px;">' + opts + '</select>' +
                '<button data-act="model-refresh" title="Refresh models — تحديث القائمة" style="font:inherit;cursor:pointer;border:1px solid #4a7bb8;background:#172436;color:#9ec2ec;border-radius:4px;padding:5px 8px;">↻</button>' +
                '<button data-act="model-use" title="Use this model app-wide — استخدم هذا النموذج" style="font:inherit;cursor:pointer;border:1px solid #2e7d54;background:#1f3a2b;color:#7fd6a0;border-radius:4px;padding:5px 8px;">Use — استخدم</button>' +
            '</div>' +
            '<div style="margin-top:4px;font-size:10px;color:' + statusColor + ';">' + statusTxt + '</div>' +
        '</div>';
    }

    // ════════════════════════════════════════════════════════════════════════
    // RMOOZ-AI-USER-FRIENDLY-MODEL-FLOW-A — the operator-facing simple AI model flow.
    // The main AI Free Fight card shows ONLY: AI Model · Status · Select AI Model · Start.
    // No env-variable names here — those live under Advanced diagnostics. The status is a
    // single plain word (Ready / Needs model / Cloud disabled / …) + one action message.
    // ════════════════════════════════════════════════════════════════════════
    // RMOOZ-OPENROUTER-SETUP-AND-AI-DEMO-H: an OpenRouter slug is always `vendor/model` (has a `/`);
    // a local Ollama tag is `name` / `name:tag` and never has a `/`. Used to catch the "local model
    // selected while in OpenRouter mode" mismatch with a precise operator message.
    function _looksLocalModel(name) {
        var s = String(name || '');
        return s.length > 0 && s.indexOf('/') === -1;
    }
    // RMOOZ-OPENROUTER-FREE-FIGHT-CONTROL-FIX-I: route-health is authoritative for LOCAL (ollama) —
    // it live-probes /api/tags. For CLOUD (openrouter) the route-health probe returns null (no cloud
    // probe), so fall back to /api/ai/models, which DOES compute cloud availability (slug in catalog).
    // Returns true | false | null(unknown). This is why the card no longer says "Choose an AI model"
    // when OpenRouter is configured and the selected slug IS in the catalog.
    function _modelAvailableEffective() {
        var rh = _routeHealth, info = _modelInfo;
        if (rh && rh.model_available != null) return rh.model_available === true;
        if (info && info.model_available != null) return info.model_available === true;
        return null;
    }
    // Combine route-health (the execution gate + model availability) and the /api/ai/models
    // payload (the model list + cloud flags) into ONE operator-friendly status. Returns:
    //   { state, label, color, message, selected, providerLabel, isCloud, canStart }
    function _modelFlowStatus() {
        var rh = _routeHealth, info = _modelInfo;
        var GREEN = '#7fd6a0', AMBER = '#e0a93a', GREY = '#8fa5b8';
        var selected = (info && info.selected_model) || (rh && rh.model) || '';
        // The RUNNING server's provider (authoritative) drives cloud-vs-local messaging.
        var cfgProvider = (rh && (rh.configured_provider || rh.provider)) || (info && info.provider) || 'ollama';
        var serverOpenRouter = cfgProvider === 'openrouter';
        var isCloud = serverOpenRouter || !!(info && (info.is_cloud === true || info.provider === 'openrouter'));
        var providerLabel = isCloud ? 'Cloud model' : 'Local model';
        function out(state, label, color, message, canStart) {
            return { state: state, label: label, color: color, message: message,
                     selected: selected, providerLabel: providerLabel, isCloud: isCloud, canStart: !!canStart };
        }
        if (!rh && !info) return out('unknown', 'Checking…', GREY, 'Checking AI status…', false);
        var gateOn = rh ? (rh.allow_sim_run === true) : (info ? info.allow_sim_run === true : false);
        var avail = _modelAvailableEffective();      // true | false | null(unknown)
        var providerBlocked = !!((rh && rh.provider_blocked === true) || (info && info.provider_blocked === true));
        var cloudAllowed = info ? info.cloud_allowed : null;   // RMOOZ_ALLOW_CLOUD_AI in the running server
        var cloudEnabled = info ? info.cloud_enabled : null;   // gate + key present

        if (!gateOn) return out('gate_off', 'Needs setup', AMBER,
            'AI execution is turned off. Open Advanced diagnostics to enable it.', false);

        // ── OpenRouter is the RUNNING provider ───────────────────────────────
        if (serverOpenRouter) {
            if (providerBlocked || cloudEnabled === false) {
                // #8 vs #7: key missing (gate on, no key) vs cloud gate off in the running server.
                if (cloudAllowed === false) {
                    return out('cloud_disabled', 'Cloud disabled', AMBER,
                        'OpenRouter is not active in the running server. Restart with RMOOZ_LLM_PROVIDER=openrouter and RMOOZ_ALLOW_CLOUD_AI=1.', false);
                }
                return out('cloud_disabled', 'Cloud disabled', AMBER,
                    'OpenRouter key is not loaded in the running server. Add OPENROUTER_API_KEY or gitignored ai-secrets.local.js and restart.', false);
            }
            // RMOOZ-OPENROUTER-FREE-FIGHT-CONTROL-FIX-I: key present but MALFORMED (not sk-or-…) → it will
            // 401 at generation. Warn pre-flight instead of showing "Ready" then failing (req #13).
            if (info && info.key_format_ok === false) {
                return out('cloud_disabled', 'Cloud disabled', AMBER,
                    'OpenRouter key looks invalid (it should start with sk-or-). Replace it with a valid key and restart.', false);
            }
            if (selected && _looksLocalModel(selected)) {       // #9
                return out('needs_model', 'Needs model', AMBER,
                    'This is a local Ollama model. Choose an OpenRouter model from the OpenRouter list.', false);
            }
            if (avail === false) return out('needs_model', 'Needs model', AMBER,
                'Your saved model is not available. Choose another model.', false);
            if (avail !== true) return out('needs_model', 'Needs model', AMBER, AI_NO_MODEL_MSG, false);
            if (_aiDepth === 'fast') return out('fast', 'Fast — AI off', AMBER,
                'Fast depth skips the AI. Switch Depth to Normal or Deep to use the model.', false);
            return out('ready', 'Ready', GREEN, 'Ready — press Start AI Free Fight.', _freeFightAiReady().ok !== false);
        }

        // ── Operator selected/viewing cloud but the SERVER is still ollama (#7) ──
        if (isCloud && !serverOpenRouter) {
            return out('cloud_disabled', 'Cloud disabled', AMBER,
                'OpenRouter is not active in the running server. Restart with RMOOZ_LLM_PROVIDER=openrouter and RMOOZ_ALLOW_CLOUD_AI=1.', false);
        }

        // ── LOCAL (ollama) ───────────────────────────────────────────────────
        if (avail !== true) {
            var models = (info && Array.isArray(info.models)) ? info.models : null;
            // RMOOZ-AI-MODEL-READY-LIVE-A (req #4): a SAVED runtime selection (runtime/ai-model-selection.json)
            // that is no longer installed gets a simple, action-oriented message; the picker stays open so
            // the operator can choose another model. (The env/default-model case keeps the #6 detail below.)
            var savedSelection = !!((info && info.selection_source === 'runtime_selection') ||
                                    (rh && rh.selection_source === 'runtime_selection'));
            var msg;
            if (models == null) {                             // model list not loaded yet → generic
                msg = AI_NO_MODEL_MSG;
            } else {
                var availCount = models.filter(function (m) { return m && m.available !== false; }).length;
                if (availCount === 0) {                       // nothing installed / Ollama down
                    msg = 'No AI model found. Start Ollama or choose a cloud model.';
                } else if (selected && savedSelection) {      // req #4: saved model missing, others available
                    msg = 'Your saved model is not available. Choose another model.';
                } else if (selected) {                        // #6: exact model + installed count
                    msg = 'Local Ollama model "' + selected + '" is not installed. Pull this model or choose an installed local model (' + availCount + ' installed locally).';
                } else {
                    msg = AI_NO_MODEL_MSG;
                }
            }
            return out('needs_model', 'Needs model', AMBER, msg, false);
        }
        if (_aiDepth === 'fast') return out('fast', 'Fast — AI off', AMBER,
            'Fast depth skips the AI. Switch Depth to Normal or Deep to use the model.', false);
        // Gate on + a model is available + depth uses the LLM → Ready. canStart mirrors the single
        // runtime gate (_freeFightAiReady) so display and behavior never disagree.
        return out('ready', 'Ready', GREEN, 'Ready — press Start AI Free Fight.', _freeFightAiReady().ok !== false);
    }
    // One model row (a clickable one-tap selection) for the friendly picker.
    function _modelPickRow(name, provider, kindLabel, on) {
        var accent = (provider === 'openrouter') ? '#e0a060' : '#7fd6a0';
        return '<button data-ff-model-pick="1" data-model="' + esc(name) + '" data-provider="' + esc(provider) + '"' +
            ' style="display:flex;justify-content:space-between;align-items:center;gap:8px;width:100%;text-align:left;cursor:pointer;' +
            'border:1px solid ' + (on ? '#2e9d6a' : '#34516a') + ';background:' + (on ? '#0f2a1c' : '#0c1824') + ';' +
            'color:' + (on ? '#9fe8c0' : '#dbe7f2') + ';border-radius:4px;padding:5px 8px;margin-bottom:3px;font:inherit;font-size:10.5px;">' +
            '<span>' + (on ? '✓ ' : '') + esc(name) + '</span>' +
            '<span style="font-size:9px;color:' + accent + ';white-space:nowrap;">' + esc(kindLabel) + (provider === 'openrouter' ? ' ☁' : '') + '</span>' +
        '</button>';
    }
    // The model picker revealed by "Select AI Model": local models first, then cloud (clearly
    // labelled, with a data-leaves warning) ONLY when cloud mode is enabled. No env names.
    function _modelPickerHtml() {
        var info = _modelInfo;
        var selected = (info && info.selected_model) || '';
        var isCloudListing = !!(info && info.is_cloud === true);
        var cloudEnabled = !!(info && info.cloud_enabled === true);
        var cloudAllowed = !!(info && info.cloud_allowed === true);
        var models = (info && Array.isArray(info.models)) ? info.models.filter(function (m) { return m && m.available !== false; }) : [];
        var h = '<div data-ff-model="picker" style="margin-top:5px;padding:6px 8px;border:1px solid #2a4d6a;border-radius:5px;background:#08131e;">';
        // Source switch — Local first; Cloud only appears when cloud mode is enabled.
        h += '<div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:5px;align-items:center;">';
        h += '<span style="font-size:9.5px;color:#8fa5b8;">Source:</span>';
        h += '<button data-act="ff-load-local" style="font:inherit;cursor:pointer;border:1px solid ' + (!isCloudListing ? '#5ab0e0' : '#4a5f75') + ';background:' + (!isCloudListing ? '#1a4a6a' : '#101b27') + ';color:' + (!isCloudListing ? '#cfeaff' : '#8fb8e0') + ';border-radius:4px;padding:3px 8px;font-size:9.5px;font-weight:' + (!isCloudListing ? '700' : '400') + ';">🖥 Local</button>';
        if (cloudEnabled) {
            h += '<button data-act="ff-load-cloud" style="font:inherit;cursor:pointer;border:1px solid ' + (isCloudListing ? '#e0a060' : '#4a5f75') + ';background:' + (isCloudListing ? '#2a2412' : '#101b27') + ';color:' + (isCloudListing ? '#e8d68a' : '#8fb8e0') + ';border-radius:4px;padding:3px 8px;font-size:9.5px;font-weight:' + (isCloudListing ? '700' : '400') + ';">☁ Cloud</button>';
        }
        h += '</div>';
        if (isCloudListing) {
            h += '<div style="font-size:10px;font-weight:700;color:#e0a060;margin-bottom:2px;">Cloud models ☁ — النماذج السحابية</div>';
            h += '<div data-ff-model="cloud-warn" style="font-size:9px;color:#e0a060;margin-bottom:3px;">⚠ Cloud model — data leaves this machine.</div>';
        } else {
            h += '<div style="font-size:10px;font-weight:700;color:#7fd6a0;margin-bottom:3px;">Local models — النماذج المحلية</div>';
        }
        if (models.length) {
            var prov = isCloudListing ? 'openrouter' : 'ollama';
            var kind = isCloudListing ? 'Cloud model' : 'Local model';
            models.forEach(function (m) { var nm = (m && m.name) ? m.name : String(m); h += _modelPickRow(nm, prov, kind, nm === selected); });
        } else if (isCloudListing) {
            h += '<div style="font-size:9.5px;color:#8fa5b8;">No cloud models returned. Check the cloud API key in Advanced diagnostics.</div>';
        } else {
            h += '<div data-ff-model="no-local" style="font-size:9.5px;color:#e0a93a;">No AI model found. Start Ollama or choose a cloud model.</div>';
        }
        if (!cloudEnabled) {
            h += '<div style="margin-top:4px;font-size:9px;color:#6a8fa8;">Cloud models are off' + (cloudAllowed ? ' (no API key set)' : '') + '. Local-only is the default.</div>';
        }
        h += '<div style="margin-top:5px;"><button data-act="model-refresh" style="font:inherit;cursor:pointer;border:1px solid #4a5f75;background:#101b27;color:#8fb8e0;border-radius:4px;padding:3px 8px;font-size:9.5px;">↻ Refresh</button></div>';
        h += '</div>';
        return h;
    }
    // The simple operator block for the main AI Free Fight card: AI Model + Status + one action
    // message + the single "Select AI Model" button (which reveals the picker). NO env names.
    function _modelFlowHtml() {
        var s = _modelFlowStatus();
        var h = '<div data-ff-loop="model-flow" style="margin-top:4px;border-top:1px solid #1a3050;padding-top:5px;">';
        h += '<div style="font-size:11px;color:#cdd8e4;">' +
            '<span style="color:#8fa5b8;">AI Model:</span> ' +
            '<span data-ff-model="selected" style="color:#e8eaed;font-weight:700;">' + esc(s.selected || '—') + '</span> ' +
            '<span data-ff-model="kind" style="color:' + (s.isCloud ? '#e0a060' : '#7fd6a0') + ';font-size:10px;">· ' + esc(s.providerLabel) + (s.isCloud ? ' ☁' : '') + '</span></div>';
        h += '<div style="font-size:11px;color:#cdd8e4;margin-top:2px;">' +
            '<span style="color:#8fa5b8;">Status:</span> ' +
            '<span data-ff-model="status" style="color:' + s.color + ';font-weight:700;">' + esc(s.label) + '</span></div>';
        h += '<div data-ff-model="message" style="font-size:10px;color:' + s.color + ';margin-top:2px;">' + esc(s.message) + '</div>';
        h += '<div style="margin-top:5px;display:flex;gap:6px;flex-wrap:wrap;">' +
            '<button data-act="ff-open-model-picker" style="font:inherit;cursor:pointer;border:1px solid #4a7bb8;background:#172436;color:#9ec2ec;border-radius:5px;padding:4px 10px;font-size:10.5px;font-weight:600;">' +
            (_modelPickerOpen ? '▲ Hide models — إخفاء' : '🧠 Select AI Model — اختر النموذج') + '</button>' +
            // RMOOZ-OPENROUTER-FREE-FIGHT-CONTROL-FIX-I: clear a stale/wrong runtime selection in one click.
            '<button data-act="ff-reset-model" title="Forget the saved model — fall back to the server default" style="font:inherit;cursor:pointer;border:1px solid #5a6270;background:#22272f;color:#cdd8e4;border-radius:5px;padding:4px 10px;font-size:10.5px;">↺ Reset AI Selection</button>' +
            '</div>';
        if (_modelPickerOpen) h += _modelPickerHtml();
        h += '</div>';
        return h;
    }
    // RMOOZ-OFFLINE-AGENT-ARCHITECTURE-P: warm up (preload) the local model so the first real request
    // doesn't pay the cold-load penalty, and pin it resident via keep_alive (server-side default 8h).
    function _warmupModel() {
        var w = W(); if (!w || typeof w.fetch !== 'function') return;
        _benchBusy = true; _warmupResult = null; updatePanel();
        _fetchJsonSafe('/api/ai/warmup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
            .then(function (r) { _warmupResult = r; })
            .catch(function (e) { _warmupResult = { ok: false, error: (e && e.message) || 'warmup_failed' }; })
            .then(function () { _benchBusy = false; updatePanel(); });
    }
    // RMOOZ-OFFLINE-AGENT-ARCHITECTURE-P: one short timed generation → load/eval ms + tokens/sec.
    function _runBenchmark() {
        var w = W(); if (!w || typeof w.fetch !== 'function') return;
        _benchBusy = true; _benchResult = null; updatePanel();
        _fetchJsonSafe('/api/ai/benchmark', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ numPredict: 16 }) })
            .then(function (r) { _benchResult = r; })
            .catch(function (e) { _benchResult = { ok: false, error: (e && e.message) || 'benchmark_failed' }; })
            .then(function () { _benchBusy = false; updatePanel(); });
    }
    // RMOOZ-OFFLINE-AGENT-ARCHITECTURE-P: the local-inference panel (warmup + benchmark) — lives under
    // Advanced diagnostics. Shows cold/warm load, generation tok/s, num_ctx and keep_alive.
    function _benchHtml() {
        var busy = _benchBusy;
        function btn(act, label) { return '<button data-act="' + act + '"' + (busy ? ' disabled' : '') + ' style="font:inherit;cursor:' + (busy ? 'not-allowed' : 'pointer') + ';border:1px solid #4a5f75;background:#101b27;color:#8fb8e0;border-radius:4px;padding:3px 8px;font-size:10px;' + (busy ? 'opacity:.55;' : '') + '">' + (busy ? '⏳ …' : label) + '</button>'; }
        var h = '<div data-ff-bench="block" style="margin-top:6px;border-top:1px solid #1a3050;padding-top:5px;">';
        h += '<div style="font-size:10px;color:#8fa5b8;font-weight:600;margin-bottom:3px;">Local inference — keep-alive · warmup · benchmark</div>';
        h += '<div style="display:flex;gap:6px;flex-wrap:wrap;">' + btn('bench-warmup', '🔥 Warm up model') + btn('bench-run', '⏱ Run benchmark') + '</div>';
        if (_warmupResult) {
            var wr = _warmupResult;
            h += '<div data-ff-bench="warmup" style="margin-top:4px;font-size:9.5px;color:' + (wr.ok ? '#7fd6a0' : '#e0a93a') + ';">' +
                 (wr.ok ? ('Warmup: ' + esc(wr.model || '') + ' · ' + (wr.was_loaded ? 'already loaded' : 'loaded') + (wr.wall_ms != null ? ' · ' + wr.wall_ms + 'ms' : '') + ' · keep_alive ' + esc(String(wr.keep_alive || '—')))
                        : ('Warmup: ' + esc(wr.message || wr.error || 'failed'))) + '</div>';
        }
        if (_benchResult) {
            var br = _benchResult, t = br.timings || {};
            if (br.ok) {
                h += '<div data-ff-bench="result" style="margin-top:4px;font-size:9.5px;color:#cdd8e4;line-height:1.5;">' +
                     '<div><span style="color:#8fa5b8;">model:</span> ' + esc(br.model || '') + ' · <span style="color:#8fa5b8;">num_ctx:</span> ' + (br.num_ctx || 'default') + ' · <span style="color:#8fa5b8;">keep_alive:</span> ' + esc(String(br.keep_alive || '—')) + '</div>' +
                     '<div><span style="color:#8fa5b8;">load:</span> <b style="color:' + (t.was_loaded ? '#7fd6a0' : '#e0a93a') + ';">' + (t.load_ms != null ? t.load_ms + 'ms' : '—') + '</b> (' + (t.was_loaded ? 'warm' : 'cold') + ') · <span style="color:#8fa5b8;">wall:</span> ' + (br.wall_ms != null ? br.wall_ms + 'ms' : '—') + '</div>' +
                     '<div><span style="color:#8fa5b8;">gen:</span> <b style="color:#9fe8c0;">' + (t.eval_tokens_per_sec != null ? t.eval_tokens_per_sec + ' tok/s' : '—') + '</b> · <span style="color:#8fa5b8;">prompt:</span> ' + (t.prompt_tokens_per_sec != null ? t.prompt_tokens_per_sec + ' tok/s' : '—') + '</div></div>';
            } else {
                h += '<div data-ff-bench="result" style="margin-top:4px;font-size:9.5px;color:#e0a93a;">Benchmark: ' + esc(br.message || br.error || 'failed') + '</div>';
            }
        }
        h += '</div>';
        return h;
    }
    // Advanced diagnostics (collapsed by default): the technical signals the operator does NOT need
    // day-to-day — the execution gate (RMOOZ_ALLOW_SIM_RUN), cloud gate (RMOOZ_ALLOW_CLOUD_AI), raw
    // provider, model_available, plan_source — plus the route probe and the raw model dropdown.
    function _advancedDiagnosticsHtml() {
        var rh = _routeHealth, info = _modelInfo;
        var h = '<details data-ff-loop="advanced-diagnostics" style="margin-top:6px;">';
        h += '<summary style="cursor:pointer;font-size:10px;color:#8fa5b8;font-weight:600;">⚙ Advanced diagnostics — تفاصيل تقنية</summary>';
        h += '<div style="margin-top:5px;border-top:1px solid #1a3050;padding-top:5px;">';
        var rhOk = rh && rh.ok === true;
        var rhColor = rhOk ? '#7fd6a0' : (rh ? '#e0a93a' : '#8fa5b8');
        var rhText = rhOk ? 'OK' : (rh ? 'unavailable' : 'unknown — click Check');
        h += '<div style="font-size:10px;color:#cdd8e4;"><span style="color:#8fa5b8;">Planner route:</span> <span style="color:' + rhColor + ';font-weight:700;">' + esc(rhText) + '</span>';
        h += ' <button data-act="loop-route-check" style="font:inherit;cursor:pointer;border:1px solid #4a5f75;background:#101b27;color:#8fb8e0;border-radius:4px;padding:1px 6px;font-size:9px;">Check route</button></div>';
        var gateStatus = _aiGateStatusHtml();
        if (gateStatus) h += '<div style="margin-top:4px;">' + gateStatus + '</div>';
        var cloudAllowed = info ? info.cloud_allowed === true : null;
        var cloudEnabled = info ? info.cloud_enabled === true : null;
        h += '<div style="margin-top:4px;font-size:9.5px;color:#8fa5b8;">Cloud AI (RMOOZ_ALLOW_CLOUD_AI): ' +
            (cloudAllowed === true ? 'allowed' : (cloudAllowed === false ? 'off' : 'unknown')) +
            ' · cloud ready: ' + (cloudEnabled === true ? 'yes' : (cloudEnabled === false ? 'no' : 'unknown')) + '</div>';
        h += '<div style="margin-top:3px;font-size:9.5px;color:#8fa5b8;">provider: ' + esc((rh && (rh.configured_provider || rh.provider)) || '—') +
            ' · model_available: ' + (rh ? String(rh.model_available) : '—') +
            (_coaPlan && _coaPlan.plan_source ? ' · plan_source: ' + esc(_coaPlan.plan_source) : '') + '</div>';
        h += '<div style="margin-top:5px;">' + renderModelSelectorHtml() + '</div>';
        h += _benchHtml();   // RMOOZ-OFFLINE-AGENT-ARCHITECTURE-P: warmup + benchmark
        h += _decisionLogHtml();   // RMOOZ-AI-SCHEDULER-DECISION-LOG-S: Blue/Red/Green/White audit trail
        h += '</div></details>';
        return h;
    }
    function _fetchAiDecision() {
        var w = W();
        if (!w || typeof w.fetch !== 'function') return;
        _aiLoading = true; _aiDecision = null; _aiApplied = false;
        updatePanel();
        _fetchJsonSafe('/api/wargame-sim/free-fight/demo-ai-step', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(_buildAiRequestBody()),
        }).then(function (dec) {
            if (_isRouteUnavailable(dec)) { dec = { ok: false, _error: _routeUnavailableText(dec), _route_unavailable: true }; }
            _aiDecision = dec; _aiLoading = false; _aiApplied = false;
            updatePanel();
        }).catch(function (e) {
            _aiDecision = { ok: false, _error: (e && e.message) || 'fetch failed' };
            _aiLoading = false; updatePanel();
        });
    }
    // FREEFIGHT-AI-REAL-MAP-MOVE-A: find the real unit object across all scenario stores.
    function _findRealUnit(unitUid) {
        if (!unitUid) return null;
        var w = W();
        if (!w) return null;
        var uid = String(unitUid);
        function matchesUid(u) {
            return u && (String(u.id || '') === uid || String(u.uid || '') === uid || String(u.unit_uid || '') === uid);
        }
        // Priority A: window.RmoozScenario.scenario
        var sc = w.RmoozScenario && w.RmoozScenario.scenario;
        if (sc) {
            var r = (sc.red_units || []).filter(matchesUid)[0];
            if (r) return { unit: r, source: 'scenario_red_units' };
            var b = (sc.blue_units_initial || []).filter(matchesUid)[0];
            if (b) return { unit: b, source: 'scenario_blue_units_initial' };
        }
        // Priority B: direct flat arrays on RmoozScenario
        var rs = w.RmoozScenario;
        if (rs) {
            var r2 = (Array.isArray(rs.red_units) ? rs.red_units : []).filter(matchesUid)[0];
            if (r2) return { unit: r2, source: 'rmooz_red_units' };
            var b2 = (Array.isArray(rs.blue_units_initial) ? rs.blue_units_initial : []).filter(matchesUid)[0];
            if (b2) return { unit: b2, source: 'rmooz_blue_units_initial' };
        }
        // Priority C: operational_brief.proposed_units
        var ob = (_payload && _payload.brief && _payload.brief.operational_brief) ||
                 (_payload && _payload.operational_brief) || {};
        var pu = (Array.isArray(ob.proposed_units) ? ob.proposed_units : []).filter(matchesUid)[0];
        if (pu) return { unit: pu, source: 'proposed_units' };
        return null;
    }

    // FREEFIGHT-AI-REAL-MAP-MOVE-A: update real unit coords in-place; return result.
    function _applyMoveToScenario(unitUid, newLat, newLon) {
        var found = _findRealUnit(unitUid);
        if (!found) return { found: false, source: null, unit: null, oldPos: null };
        var u = found.unit;
        var oldLat = u.lat != null ? +u.lat : (Array.isArray(u.coord) ? +u.coord[1] : null);
        var oldLon = u.lon != null ? +u.lon : (Array.isArray(u.coord) ? +u.coord[0] : null);
        var oldPos = (Number.isFinite(oldLat) && Number.isFinite(oldLon))
            ? { lat: oldLat, lon: oldLon } : null;
        // Mutate lat/lon
        u.lat = +newLat; u.lon = +newLon;
        // Keep coord array in sync (GeoJSON: [lon, lat])
        if (Array.isArray(u.coord) && u.coord.length >= 2) {
            u.coord[0] = +newLon; u.coord[1] = +newLat;
        } else if (u.coord !== undefined) {
            u.coord = [+newLon, +newLat];
        }
        u._ff_ai_moved_by_ai = true;
        u._ff_ai_old_coord   = oldPos ? [oldPos.lon, oldPos.lat] : null;
        u._ff_ai_event_log_entry = _aiDecision ? (_aiDecision.event_log_entry || null) : null;
        return { found: true, source: found.source, unit: u, oldPos: oldPos };
    }

    // FREEFIGHT-AI-REAL-MAP-MOVE-A: trigger scenario layer redraw via available bridges.
    // Returns {called_bridges: string[], fired_count: number} for status tracking.
    function _triggerScenarioRedraw() {
        var w = W();
        var called = [];
        if (!w) return { called_bridges: called, fired_count: 0 };
        var sc = w.RmoozScenario && w.RmoozScenario.scenario;
        // FREEFIGHT-MANUAL-MAP-CAMERA-A: the scenario-layer redraw (drawScenario) would
        // otherwise auto-fitBounds the camera on every AI move. Suppress that re-frame
        // during our redraws so the operator's view is preserved; free-fight applies its
        // OWN camera policy (manual = nothing, follow = panTo) afterwards.
        var prevSuppress = w.__rmoozSuppressAutoFit;
        w.__rmoozSuppressAutoFit = true;
        try {
            // Bridge 1: AppAdjudicatorMap.drawScenario (wargame map layer)
            try {
                if (w.AppAdjudicatorMap && typeof w.AppAdjudicatorMap.drawScenario === 'function' && sc) {
                    w.AppAdjudicatorMap.drawScenario(sc);
                    called.push('AppAdjudicatorMap.drawScenario');
                }
            } catch (_) {}
            // Bridge 2: AppScenarioWorkspace.maybeDrawLiveScenarioOnMap (workspace layer)
            try {
                if (w.AppScenarioWorkspace && typeof w.AppScenarioWorkspace.maybeDrawLiveScenarioOnMap === 'function' && sc) {
                    w.AppScenarioWorkspace.maybeDrawLiveScenarioOnMap(sc);
                    called.push('AppScenarioWorkspace.maybeDrawLiveScenarioOnMap');
                }
            } catch (_) {}
            // Bridge 3: CustomEvent so other listeners can react
            try {
                var ap = _aiDecision && _aiDecision.scenario_patch;
                if (typeof document !== 'undefined' && document.dispatchEvent && ap) {
                    document.dispatchEvent(new CustomEvent('rmooz:ff-ai-unit-moved', { detail: {
                        unit_uid: ap.unit_uid, lat: ap.lat, lon: ap.lon,
                        old_pos: _aiMovedUnitOldPos,
                        source: _aiMovedUnitSource,
                    }}));
                    called.push('rmooz:ff-ai-unit-moved');
                }
            } catch (_) {}
        } finally {
            w.__rmoozSuppressAutoFit = prevSuppress;
        }
        return { called_bridges: called, fired_count: called.length };
    }

    function _applyAiDecision() {
        if (!_aiDecision || !_aiDecision.ok || !_aiDecision.scenario_patch) return;
        var ap = _aiDecision.scenario_patch;
        var unitUid = ap.unit_uid || (_aiDecision.action && _aiDecision.action.unit_uid);
        // Reset previous move tracking
        _aiMovedUnit = null; _aiMovedUnitOldPos = null; _aiMovedUnitSource = null;
        // Attempt real-unit coordinate update
        var mv = _applyMoveToScenario(unitUid, ap.lat, ap.lon);
        _aiDecision.real_unit_moved  = mv.found;
        _aiDecision.real_unit_source = mv.source;
        if (mv.found) {
            _aiMovedUnit      = mv.unit;
            _aiMovedUnitOldPos = mv.oldPos;
            _aiMovedUnitSource = mv.source;
        }
        _aiApplied = true;
        _appendToEventLog(_aiDecision.event_log_entry);
        // FREEFIGHT-AI-VISIBLE-MARKER-TRUTH-A: track redraw + overlay for UI status
        _aiDecision.real_unit_updated = mv.found;
        _aiDecision.map_redraw_called = false;
        _aiDecision.map_redraw_bridges = [];
        _aiDecision.visible_overlay_created = false;
        if (mapReady()) {
            var rdResult = _triggerScenarioRedraw();
            _aiDecision.map_redraw_called   = rdResult.fired_count > 0;
            _aiDecision.map_redraw_bridges  = rdResult.called_bridges;
            syncMarkers(); // draws trail + pulse in FF overlay layer
            _aiDecision.visible_overlay_created = true;
            // FREEFIGHT-MANUAL-MAP-CAMERA-A: camera stays put unless Follow mode is on.
            _maybeFollowAiMovement([+ap.lat, +ap.lon]);
        }
        updatePanel();
    }
    function _resetAiDecision() {
        // Restore real unit coords if we mutated them
        if (_aiMovedUnit && _aiMovedUnitOldPos) {
            _aiMovedUnit.lat = _aiMovedUnitOldPos.lat;
            _aiMovedUnit.lon = _aiMovedUnitOldPos.lon;
            if (Array.isArray(_aiMovedUnit.coord) && _aiMovedUnit.coord.length >= 2) {
                _aiMovedUnit.coord[0] = _aiMovedUnitOldPos.lon;
                _aiMovedUnit.coord[1] = _aiMovedUnitOldPos.lat;
            }
            _aiMovedUnit._ff_ai_moved_by_ai    = false;
            _aiMovedUnit._ff_ai_old_coord       = null;
            _aiMovedUnit._ff_ai_event_log_entry = null;
            if (mapReady()) _triggerScenarioRedraw();
        }
        _aiMovedUnit = null; _aiMovedUnitOldPos = null; _aiMovedUnitSource = null;
        _aiDecision = null; _aiLoading = false; _aiApplied = false; _aiDiagnostics = null;
        if (mapReady()) syncMarkers();
        updatePanel();
    }
    function _testLlm() {
        var w = W();
        if (!w || typeof w.fetch !== 'function') return;
        _llmTestStatus = { testing: true };
        updatePanel();
        _fetchJsonSafe('/api/wargame-sim/free-fight/test-llm', { method: 'POST' })
            .then(function (result) {
                if (_isRouteUnavailable(result)) { result = { ok: false, reason: 'route_unavailable', error: _routeUnavailableText(result) }; }
                _llmTestStatus = result; updatePanel();
            })
            .catch(function (e) { _llmTestStatus = { ok: false, error: e && e.message || 'fetch failed' }; updatePanel(); });
    }
    // FREEFIGHT-AI-COA-PLANNER-A ───────────────────────────────────────────────
    function _generateCoaPlan() {
        var w = W();
        if (!w || typeof w.fetch !== 'function') return;
        _coaLoading = true; _coaPlan = null; _coaApplied = false; _coaMovedUnits = []; _mcpPromptExpanded = false;
        _routeUnavailableMsg = null;
        _coaLoadingStart = (function () { try { return Date.now(); } catch (_) { return 0; } })();
        _startCoaLoadingTicker();   // RMOOZ-AI-COMMANDER-REPAIR-LOOP-A: live elapsed timer while the model thinks
        updatePanel();
        var body = _buildAiRequestBody();
        // RMOOZ-AI-COMMANDER-DEMO-PACING-C: shape the request by planner mode.
        if (_planningMode === 'staff_safe') {
            // Staff-Safe = FAST deterministic. useLlm:false → the capability analyst uses deterministic
            // (catalog/DB-Lite) summaries instead of the slow LLM; ai_depth:'fast' → no DEM sampling and
            // the server's llmAllowed gate is off → the COA-generation LLM is skipped too. Honestly
            // labeled deterministic; the Planning Trace still renders (mode: staff_safe).
            body.opts.useLlm = false;
            body.opts.ai_depth = 'fast';
        } else {
            // RMOOZ-AI-ATTACK-PLAN-MCP-PROMPT-A: AI Commander FORCES the full local-LLM/MCP path —
            // useLlm true, never fast (fast skips the LLM). commander_mode stays the operator's choice.
            body.opts.useLlm = true;
            if (body.opts.ai_depth === 'fast') body.opts.ai_depth = 'normal';
        }
        var _genT0 = _nowMs();   // RMOOZ-AI-SCHEDULER-DECISION-LOG-S: measure the commander call duration
        _fetchJsonSafe('/api/wargame-sim/free-fight/plan-coas', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ units: body.units, objectives: body.objectives, context: { commander_mode: body.opts.commander_mode, ai_depth: body.opts.ai_depth }, opts: body.opts }),
        }).then(function (plan) {
            if (_isRouteUnavailable(plan)) {
                _routeUnavailableMsg = _routeUnavailableText(plan);
                _coaPlan = { ok: false, _error: _routeUnavailableMsg, _route_unavailable: true, _requestedVia: 'manual_generate' };
            } else {
                _coaPlan = plan || {};
                // RMOOZ-AI-ATTACK-PLAN-AI-ONLY-A: mark this plan as the manual "Generate AI Attack
                // Plan" output, so the render applies the strict AI-only display gate (this page
                // presents real LLM results ONLY — never deterministic/fallback dressed as AI).
                _coaPlan._requestedVia = 'manual_generate';
            }
            // RMOOZ-FREE-FIGHT-SIMPLE-OPERATOR-UX-O: auto-select the recommended COA so the simple flow
            // can offer "Use Recommended Plan" by default.
            if (_coaPlan && _coaPlan.ok && arr(_coaPlan.coas).length) { try { _coaSelectedIdx = _pickRecommendedIdx(_coaPlan); } catch (_) {} }
            _coaLoading = false; _coaApplied = false; _stopCoaLoadingTicker();
            updatePanel();
            // RMOOZ-GREEN-WORLD-UI-R + RMOOZ-GREEN-WHITE-SCORING-T: refresh Green, then score it onto the
            // White review (deterministic; no /plan-coas, no LLM; advisory-only — never invalidates the COA).
            if (_coaPlan && _coaPlan.ok) { _greenScoringKey = null; try { _refreshGreenWorld('after_deep_plan').then(function () { try { _applyGreenAdvisoryScoring('plan_review'); _applyCoaRanking(); } catch (_) {} }); } catch (_) {} }
            // RMOOZ-AI-SCHEDULER-DECISION-LOG-S: record commander/performance/validation decisions (record-only, no new calls).
            try { _recordPlanDecision(_coaPlan, _nowMs() - _genT0); } catch (_) {}
        }).catch(function (e) {
            _coaPlan = { ok: false, _error: (e && e.message) || 'fetch failed', _requestedVia: 'manual_generate' };
            _coaLoading = false; _stopCoaLoadingTicker(); updatePanel();
            try { _recordPlanDecision(_coaPlan, _nowMs() - _genT0); } catch (_) {}
        });
    }
    // RMOOZ-AI-COMMANDER-REPAIR-LOOP-A: tick the in-flight "AI Planning Trace" elapsed timer (~1s)
    // while a plan is generating, so the wait visibly reads as the AI thinking. Cleared on completion.
    function _startCoaLoadingTicker() {
        _stopCoaLoadingTicker();
        var w = W();
        if (w && typeof w.setInterval === 'function') {
            _coaLoadingTimer = w.setInterval(function () {
                if (_coaLoading) { try { updatePanel(); } catch (_) {} } else { _stopCoaLoadingTicker(); }
            }, 1000);
        }
    }
    function _stopCoaLoadingTicker() {
        var w = W();
        if (_coaLoadingTimer && w && typeof w.clearInterval === 'function') { try { w.clearInterval(_coaLoadingTimer); } catch (_) {} }
        _coaLoadingTimer = null;
    }
    function _applySelectedCoa() {
        if (!_coaPlan || !_coaPlan.ok || !Array.isArray(_coaPlan.coas) || !_coaPlan.coas.length) return;
        var idx = _coaSelectedIdx;
        if (idx < 0 || idx >= _coaPlan.coas.length) idx = 0;
        var coa = _coaPlan.coas[idx];
        // Use the shared step+epsilon resolver so manual apply matches the loop:
        // capped step toward the (intercept) target, and below-epsilon = already in position.
        var moves = _resolveCoaMoves(coa);
        _writeMoveFrame(moves, 1);
        _coaMovedUnits = _movedRecords(moves);
        _coaHeldCount = moves.filter(function (m) { return m.held; }).length;
        _coaApplied = true;
        // Trigger scenario redraw once after all units updated
        if (mapReady()) {
            _triggerScenarioRedraw();
            syncMarkers();
            // FREEFIGHT-MANUAL-MAP-CAMERA-A: no auto-pan in manual mode (the default).
            _maybePanToMovedCentroid();
        }
        _buildCoaEventLogEntries().forEach(function (entry) { _appendToEventLog(entry); });
        _logExecutedMoves(moves); // RMOOZ-AI-MOVEMENT-EXECUTION-AUDIT-A: per-unit execution proof
        updatePanel();
    }
    function _resetCoa() {
        _coaMovedUnits.forEach(function (mv) {
            if (!mv || !mv.unit || !mv.oldPos) return;
            mv.unit.lat = mv.oldPos.lat;
            mv.unit.lon = mv.oldPos.lon;
            if (Array.isArray(mv.unit.coord) && mv.unit.coord.length >= 2) {
                mv.unit.coord[0] = mv.oldPos.lon;
                mv.unit.coord[1] = mv.oldPos.lat;
            }
            mv.unit._ff_coa_moved_by_ai = false;
        });
        if (mapReady()) { _triggerScenarioRedraw(); syncMarkers(); }
        _coaMovedUnits = []; _coaApplied = false;
        updatePanel();
    }

    // ════════════════════════════════════════════════════════════════════════
    // RMOOZ-COA-COMMIT-EXECUTION-L — "COA Commitment Mode": commit ONE COA, then RMOOZ executes it
    // phase-by-phase deterministically (NO LLM on normal ticks); AI is re-engaged only on a replan
    // trigger or operator Replan. Reuses the SAME movement step (_stepTowardCapped clamp/teleport
    // guard), validator, and HOLD handling as the manual apply path — no combat/terrain/validator change.
    // ════════════════════════════════════════════════════════════════════════
    function _nowMs() { var d = (typeof Date !== 'undefined' && Date.now) ? Date.now() : 0; return d; }
    function _nowISO() { try { return new Date().toISOString(); } catch (_) { return ''; } }
    function _objKey(o) { return (o && Number.isFinite(+o.lat)) ? (Number(o.lat).toFixed(4) + ',' + Number(o.lon).toFixed(4)) : 'none'; }
    function _coaActiveSide(coa) {
        var a = arr(coa && coa.phases)[0]; var act = a && arr(a.actions)[0];
        return String((act && act.side) || (_coaPlan && _coaPlan.active_side) || _activeSide || 'RED').toUpperCase();
    }
    function _sideUnitCount(side) {
        var w = W(); var n = 0; if (!w) return 0;
        var sc = w.RmoozScenario && w.RmoozScenario.scenario;
        function cnt(list) { arr(list).forEach(function (u) { if (u && String(u.side || '').toUpperCase() === side) n++; }); }
        if (sc) { cnt(sc.red_units); cnt(sc.blue_units_initial); }
        return n;
    }
    // ── COA-exec persistence (RMOOZ-COA-COMMIT-PERSISTENCE-M) ────────────────────
    // Persist the committed-COA state to sessionStorage (operator UI state, scenario-keyed) so it
    // survives a browser refresh. This is NOT scenario world-state or a journal write — it does not
    // touch the AI/sim boundary. The deterministic tick executor is UNCHANGED, so a restored COA ticks
    // with the SAME no-LLM guarantee (llm_called_this_tick=false, no /plan-coas fetch).
    var COA_EXEC_STORE_KEY = 'rmooz_coa_exec_state';
    function _coaStore() { try { var w = W(); return (w && w.sessionStorage) ? w.sessionStorage : null; } catch (_) { return null; } }
    function _scenarioKey() {
        var w = W(); var sc = w && w.RmoozScenario && w.RmoozScenario.scenario;
        return (sc && (sc.id || sc.scenario_id || sc.name)) ? String(sc.id || sc.scenario_id || sc.name) : 'default';
    }
    function _persistCoaExec() {
        var s = _coaStore(); if (!s) return;
        try {
            if (_coaExec && _coaExec.active) {
                var save = {}; for (var k in _coaExec) { if (k !== '_restored') save[k] = _coaExec[k]; }   // don't persist the transient restored flag
                s.setItem(COA_EXEC_STORE_KEY, JSON.stringify({ v: 1, scenario_key: _scenarioKey(), state: save }));
            } else { s.removeItem(COA_EXEC_STORE_KEY); }
        } catch (_) { /* quota/serialize — best-effort, never throw */ }
    }
    function _peekPersistedCoaExec() {
        var s = _coaStore(); if (!s) return null;
        try { var raw = s.getItem(COA_EXEC_STORE_KEY); return raw ? JSON.parse(raw) : null; } catch (_) { return null; }
    }
    // Restore on UI mount / scenario resume. Returns true if a (matching-scenario) state was restored.
    // Restored state comes back PAUSED — the operator presses Run to resume (no auto-run, no AI call).
    function _restoreCoaExec() {
        if (_coaExec) return false;                              // live state already present
        var blob = _peekPersistedCoaExec();
        if (!blob || !blob.state || !blob.state.selected_coa) return false;
        if (blob.scenario_key !== _scenarioKey()) return false;  // different scenario → ignore stale
        _coaExec = blob.state;
        _coaExec.paused = true; _coaExec._restored = true;       // restored = paused until the operator runs
        if (_coaExecTimer) { _clearIntervalSafe(_coaExecTimer); _coaExecTimer = null; }
        try { _appendToEventLog('COA restored from session — ' + esc(_coaExec.selected_coa_id || 'COA-?') + ' (phase ' + (_coaExec.current_phase_index + 1) + (_coaExec.replan_required ? ', replan required' : '') + '). Press Run to resume; the AI is NOT called on resume.'); } catch (_) {}
        updatePanel();
        return true;
    }
    // Resolve the moves for ONE phase's actions (same guard/HOLD logic as _resolveCoaMoves). Adds
    // `reached` (unit is within epsilon of the ACTION target → the order is complete).
    function _resolvePhaseMoves(actions) {
        var moves = [];
        arr(actions).forEach(function (act) {
            if (!act) return;
            if (act.action_type === 'HOLD_POSITION') {                    // never moves; order is complete
                moves.push({ uid: act.unit_uid, role: act.role || '', action_type: 'HOLD_POSITION', held: true, hold: true, reached: true, unit: (_findRealUnit(act.unit_uid) || {}).unit || null });
                return;
            }
            if (!act.target || !Number.isFinite(+act.target.lat) || !Number.isFinite(+act.target.lon)) return;
            var found = _findRealUnit(act.unit_uid);
            if (!found || !found.unit) return;
            var u = found.unit;
            var startLat = u.lat != null ? +u.lat : (Array.isArray(u.coord) ? +u.coord[1] : null);
            var startLon = u.lon != null ? +u.lon : (Array.isArray(u.coord) ? +u.coord[0] : null);
            if (!Number.isFinite(startLat) || !Number.isFinite(startLon)) return;
            var tgt = { lat: +act.target.lat, lon: +act.target.lon };
            var fin = _stepTowardCapped({ lat: startLat, lon: startLon }, tgt);   // clamp/teleport guard
            var dLat = round5(fin.lat) - startLat, dLon = round5(fin.lon) - startLon;
            var stepDist = Math.sqrt(dLat * dLat + dLon * dLon);
            var dt = round5(fin.lat) - tgt.lat, dn = round5(fin.lon) - tgt.lon;
            var reached = Math.sqrt(dt * dt + dn * dn) < MIN_VISIBLE_MOVE_DEG;   // at the action target
            moves.push({ unit: u, uid: act.unit_uid, role: act.role || '', action_type: act.action_type || '',
                execution_mode: act.execution_mode || '', held: stepDist < MIN_VISIBLE_MOVE_DEG, hold: false, reached: reached,
                start: { lat: startLat, lon: startLon }, final: { lat: round5(fin.lat), lon: round5(fin.lon) }, target: tgt });
        });
        return moves;
    }
    // Commit the currently-selected COA as the active execution plan (req #2). Pure state + timing.
    // RMOOZ-ADVISORY-COMMIT-JOURNAL-V: snapshot the advisory/ranking decision context at commit time so the
    // brief / event log / commit journal can explain WHY a plan was recommended and whether the operator
    // overrode it. Pure — no LLM, no fetch, no behaviour change. Degrades honestly to considered:false.
    function _buildCommitAdvisoryContext(committedIdx) {
        var coas = arr(_coaPlan && _coaPlan.coas);
        var selCoa = coas[committedIdx] || {};
        var selId = selCoa.plan_id || ('COA-' + (committedIdx + 1));
        var hasRanking = !!(_coaPlan && typeof _coaPlan._ranking_recommended_idx === 'number');
        var hasGreen = !!(_coaPlan && _coaPlan._green_advisory);
        if (!coas.length || (!hasRanking && !hasGreen)) {
            return { considered: false, reason: 'no advisory context available', selected_coa_id: selId, recorded_at: _nowISO() };
        }
        var recIdx = hasRanking ? _coaPlan._ranking_recommended_idx : _pickRecommendedIdx(_coaPlan);
        var recCoa = coas[recIdx] || {};
        var recId = recCoa.plan_id || ('COA-' + (recIdx + 1));
        var wasRec = (committedIdx === recIdx);
        var gw = _greenWorld, wa = _whiteAdvisory(gw);
        return {
            considered: true,
            selected_coa_id: selId, recommended_coa_id: recId,
            was_recommended_selected: wasRec, operator_override: !wasRec,
            selected_coa_ranking: selCoa._ranking || null, recommended_coa_ranking: recCoa._ranking || null,
            green_advisory: (_coaPlan && _coaPlan._green_advisory) || _greenAdvisoryScoring(gw),
            green_world_summary: gw ? { collateral_risk_band: _greenBand(gw), neutral_reaction_score: gw.neutral_reaction_score,
                road_status: (gw.road_status && gw.road_status.status) || null, host_nation: gw.host_nation || null } : null,
            white_advisory_summary: wa ? { advisory_level: wa.advisory_level, note: wa.note } : null,
            decision_log_snapshot: _decisionLog.slice(-10),
            recorded_at: _nowISO(),
        };
    }
    function _commitCoa(idx) {
        if (!_coaPlan || !_coaPlan.ok || !Array.isArray(_coaPlan.coas) || !_coaPlan.coas.length) return null;
        var i = (idx == null) ? _coaSelectedIdx : idx;
        if (i < 0 || i >= _coaPlan.coas.length) i = 0;
        var t0 = _nowMs();
        var coa = _coaPlan.coas[i];
        var side = _coaActiveSide(coa);
        _coaExec = {
            active: true, side: side, selected_coa_id: coa.plan_id || ('COA-' + (i + 1)), selected_coa: coa,
            objective: getObjective() || null, objective_key: _objKey(getObjective()),
            current_phase_index: 0, phase_status: 'pending', unit_order_status: {}, completed_orders: [],
            branch_triggers: arr(coa.branches), replan_required: false, replan_reason: null, paused: false,
            ticks: 0, stuck_ticks: 0, commit_unit_count: _sideUnitCount(side),
            last_plan_hash: (_coaPlan.plan_source || '') + ':' + (coa.plan_id || '') + ':' + arr(coa.phases).length,
            created_at: _nowISO(), updated_at: _nowISO(),
            last_tick_timing: { coa_commit_ms: _nowMs() - t0, coa_tick_execute_ms: 0, replan_trigger_check_ms: 0, llm_called_this_tick: false },
        };
        // RMOOZ-ADVISORY-COMMIT-JOURNAL-V: persist the advisory/ranking decision context with the commit.
        var _ctx = _buildCommitAdvisoryContext(i);
        _coaExec.commit_advisory_context = _ctx;
        try { _appendToEventLog('COA committed — ' + esc(_coaExec.selected_coa_id) + ' (' + arr(coa.phases).length + ' phases). RMOOZ will execute it; the AI is NOT called on normal ticks.'); } catch (_) {}
        try {
            if (_ctx.considered && _ctx.was_recommended_selected) _appendToEventLog('Committed recommended ' + esc(_ctx.selected_coa_id) + '; advisory context recorded.');
            else if (_ctx.considered) _appendToEventLog('Operator override: committed ' + esc(_ctx.selected_coa_id) + ' instead of recommended ' + esc(_ctx.recommended_coa_id) + '; advisory context recorded.');
        } catch (_) {}
        try { _recordDecision({ role: 'white', action: 'commit_advisory_context_recorded', called_llm: false, source: 'commit-journal',
            reason: _ctx.considered ? (_ctx.operator_override ? 'operator override' : 'recommended committed') : 'no advisory context available',
            result_summary: _ctx.considered ? ('sel ' + _ctx.selected_coa_id + ' · rec ' + _ctx.recommended_coa_id + ' · override ' + _ctx.operator_override) : 'considered=false' }); } catch (_) {}
        _persistCoaExec();   // RMOOZ-COA-COMMIT-PERSISTENCE-M (now also persists commit_advisory_context)
        updatePanel();
        _whiteAdvisoryLevel = null;   // RMOOZ-WHITE-GREEN-ANNOTATION-T: fresh committed decision → re-advise
        try { _refreshGreenWorld('after_commit'); } catch (_) {}   // RMOOZ-GREEN-WORLD-UI-R (deterministic, no LLM)
        return _coaExec;
    }
    // Deterministic replan-trigger check (req: branch/replan triggers). Returns { fired, reason, code }.
    function _checkReplanTriggers() {
        if (!_coaExec || !_coaExec.selected_coa) return { fired: false };
        var coa = _coaExec.selected_coa;
        var phase = arr(coa.phases)[_coaExec.current_phase_index];
        var actions = arr(phase && phase.actions);
        // objective changed
        if (_objKey(getObjective()) !== _coaExec.objective_key) return { fired: true, code: 'objective_changed', reason: 'Objective changed — the committed COA no longer matches.' };
        for (var k = 0; k < actions.length; k++) {
            var a = actions[k]; if (!a) continue;
            // assigned unit missing / destroyed / unavailable
            var f = _findRealUnit(a.unit_uid);
            if (!f || !f.unit) return { fired: true, code: 'unit_missing', reason: 'Assigned unit "' + (a.unit_uid || '?') + '" is missing/destroyed/unavailable.' };
            // selected target invalid
            if (a.action_type !== 'HOLD_POSITION' && (!a.target || !Number.isFinite(+a.target.lat) || !Number.isFinite(+a.target.lon))) return { fired: true, code: 'invalid_target', reason: 'A selected target is invalid for unit "' + (a.unit_uid || '?') + '".' };
        }
        // active-force loss above threshold
        if (_coaExec.commit_unit_count > 0) {
            var now = _sideUnitCount(_coaExec.side);
            if ((_coaExec.commit_unit_count - now) / _coaExec.commit_unit_count > COA_EXEC_FORCE_LOSS_FRAC) return { fired: true, code: 'force_loss', reason: _coaExec.side + ' force loss above ' + Math.round(COA_EXEC_FORCE_LOSS_FRAC * 100) + '% — replan recommended.' };
        }
        // phase stuck for N ticks (units cannot make progress / blocked by safety/validator)
        if (_coaExec.stuck_ticks >= COA_EXEC_STUCK_TICKS) return { fired: true, code: 'phase_stuck', reason: 'Phase "' + ((phase && phase.name) || _coaExec.current_phase_index) + '" stuck for ' + _coaExec.stuck_ticks + ' ticks (units cannot reach their targets).' };
        return { fired: false };
    }
    function _pauseForReplan(reason, code) {
        _clearIntervalSafe(_coaExecTimer); _coaExecTimer = null;
        if (_coaExec) { _coaExec.phase_status = 'blocked'; _coaExec.replan_required = true; _coaExec.replan_reason = reason; _coaExec.replan_code = code; _coaExec.updated_at = _nowISO(); }
        try { _appendToEventLog('COA execution PAUSED — replan trigger: ' + esc(reason) + ' (choose: Continue / Replan / Staff-Safe).'); } catch (_) {}
        _persistCoaExec();   // RMOOZ-COA-COMMIT-PERSISTENCE-M: blocked/replan state survives refresh
        updatePanel();
        // RMOOZ-AI-SCHEDULER-DECISION-LOG-S: White is the deterministic referee — record the trigger (no LLM).
        try { _recordDecision({ role: 'white', action: 'replan_trigger', called_llm: false, source: 'deterministic_triggers', reason: reason || 'replan required', result_summary: code || '' }); } catch (_) {}
        try { _refreshGreenWorld('replan_trigger'); } catch (_) {}   // RMOOZ-GREEN-WORLD-UI-R (deterministic, no LLM)
    }
    // One deterministic execution tick — NO LLM. Executes the current phase, advances phases, checks
    // triggers. Returns the per-tick timing (incl. llm_called_this_tick:false). Safe to call directly.
    function _coaExecTick() {
        if (!_coaExec || !_coaExec.active || _coaExec.paused || _coaExec.replan_required) return null;
        var coa = _coaExec.selected_coa;
        var phases = arr(coa && coa.phases);
        if (_coaExec.current_phase_index >= phases.length) { _coaExec.phase_status = 'complete'; _clearIntervalSafe(_coaExecTimer); _coaExecTimer = null; _persistCoaExec(); updatePanel(); return { llm_called_this_tick: false }; }
        // 1) replan trigger check FIRST
        var tc0 = _nowMs();
        var trig = _checkReplanTriggers();
        var replan_trigger_check_ms = _nowMs() - tc0;
        if (trig.fired) { _coaExec.last_tick_timing = { coa_tick_execute_ms: 0, replan_trigger_check_ms: replan_trigger_check_ms, llm_called_this_tick: false }; _pauseForReplan(trig.reason, trig.code); return _coaExec.last_tick_timing; }
        // 2) execute ONLY the current phase (deterministic move; clamp/teleport guard; HOLD never moves)
        var te0 = _nowMs();
        _coaExec.phase_status = 'running';
        var phase = phases[_coaExec.current_phase_index];
        var actions = arr(phase && phase.actions);
        var moves = _resolvePhaseMoves(actions);
        var realMoves = moves.filter(function (m) { return !m.hold; });
        _writeMoveFrame(realMoves, 1);
        var movedNow = _movedRecords(realMoves);
        _coaMovedUnits = movedNow; _coaApplied = true;
        var _el0 = _nowMs(); _logExecutedMoves(realMoves); var event_log_ms = _nowMs() - _el0;   // RMOOZ-...-LIVE-DELAY-AUDIT-N
        // 3) per-order status + completion
        var anyMovedThisTick = false, allComplete = true;
        moves.forEach(function (m) {
            var done = m.hold || m.reached;
            if (done && _coaExec.unit_order_status[m.uid] !== 'complete') { _coaExec.unit_order_status[m.uid] = 'complete'; _coaExec.completed_orders.push({ uid: m.uid, action_type: m.action_type, phase: _coaExec.current_phase_index }); }
            else if (!done) { _coaExec.unit_order_status[m.uid] = 'moving'; allComplete = false; }
            if (!m.held && !m.hold) anyMovedThisTick = true;
        });
        if (!actions.length) allComplete = true;   // empty phase → immediately complete
        // 4) stuck detection: a non-complete phase where nothing moved this tick
        _coaExec.stuck_ticks = (!allComplete && !anyMovedThisTick) ? (_coaExec.stuck_ticks + 1) : 0;
        // 5) advance phase / finish COA
        if (allComplete) {
            _coaExec.stuck_ticks = 0;
            _coaExec.current_phase_index++;
            if (_coaExec.current_phase_index >= phases.length) {
                _coaExec.phase_status = 'complete'; _clearIntervalSafe(_coaExecTimer); _coaExecTimer = null;
                try { _appendToEventLog('COA execution COMPLETE — ' + esc(_coaExec.selected_coa_id) + ' (all ' + phases.length + ' phases done). No AI calls were made during execution.'); } catch (_) {}
            } else {
                _coaExec.phase_status = 'pending';
                try { _appendToEventLog('COA phase complete — advancing to phase ' + (_coaExec.current_phase_index + 1) + '/' + phases.length + ' (deterministic, no AI).'); } catch (_) {}
            }
            // RMOOZ-GREEN-WORLD-UI-R: a phase boundary changed the situation → refresh Green
            // (deterministic /neutral-world only; NO /plan-coas, NO LLM — the tick stays llm_called_this_tick:false).
            try { _refreshGreenWorld('phase_advance'); } catch (_) {}
        }
        _coaExec.ticks++; _coaExec.updated_at = _nowISO();
        var coa_tick_execute_ms = _nowMs() - te0;
        // RMOOZ-COA-COMMIT-LIVE-DELAY-AUDIT-N: instrument the REAL per-tick UI/map/persist costs so the
        // operator can see (in their browser) exactly where any delay is. coa_tick_execute_ms is the
        // pure phase work; the rest is rendering/persistence the browser pays each tick.
        var _sp0 = _nowMs(); _persistCoaExec(); var storage_persist_ms = _nowMs() - _sp0;
        var _mp0 = _nowMs(); if (mapReady()) { _triggerScenarioRedraw(); syncMarkers(); _maybePanToMovedCentroid(); } var map_paint_ms = _nowMs() - _mp0;
        var _ui0 = _nowMs(); updatePanel(); var ui_update_ms = _nowMs() - _ui0;
        _coaExec.last_tick_timing = {
            coa_tick_execute_ms: coa_tick_execute_ms, replan_trigger_check_ms: replan_trigger_check_ms,
            event_log_ms: event_log_ms, storage_persist_ms: storage_persist_ms, map_paint_ms: map_paint_ms,
            ui_update_ms: ui_update_ms, tick_interval_delay_ms: _coaExecIntervalMs, llm_called_this_tick: false,
        };
        // RMOOZ-AI-SCHEDULER-DECISION-LOG-S: the committed-COA executor is a deterministic unit-controller — no LLM.
        try { _recordDecision({ role: 'unit-controller', action: 'execute_phase_tick', called_llm: false, duration_ms: coa_tick_execute_ms, source: 'coa_commitment', result_summary: 'phase ' + (_coaExec.current_phase_index + 1) + ' · moved ' + movedNow.length }); } catch (_) {}
        return _coaExec.last_tick_timing;
    }
    // RMOOZ-COA-COMMIT-LIVE-DELAY-AUDIT-N: committed-COA execution is DETERMINISTIC (no LLM, no
    // animation to wait on), so it must NOT inherit the cinematic LLM-loop pacing (x1 = one step every
    // 6s — the source of the "delay" the operator felt). Tick briskly by default (COA_EXEC_TICK_MS), and
    // let the fire speeds accelerate further — but never throttle deterministic execution to 6s.
    var COA_EXEC_TICK_MS = 500;
    var _coaExecIntervalMs = COA_EXEC_TICK_MS;
    function _coaExecTickMs() {
        var cinematic = _ffSpeed().moveAnimMs || COA_EXEC_TICK_MS;
        return Math.max(120, Math.min(COA_EXEC_TICK_MS, cinematic));   // x1/x5/x15 → 500ms; fire → 450; fire2 → 120
    }
    function _runCommittedCoa() {
        if (!_coaExec || !_coaExec.active) return;
        if (_coaExec.phase_status === 'complete') return;
        _coaExec._restored = false;   // resuming → drop the "restored from session" banner
        _coaExec.paused = false; _coaExec.replan_required = false; _coaExec.replan_reason = null; _coaExec.phase_status = 'running';
        _clearIntervalSafe(_coaExecTimer); _coaExecTimer = null;
        _coaExecIntervalMs = _coaExecTickMs();   // brisk, deterministic — NOT the 6s cinematic LLM pacing
        _coaExecTick();   // run one immediately
        _coaExecTimer = _setIntervalSafe(_coaExecTick, _coaExecIntervalMs);
        updatePanel();
    }
    function _pauseCommittedCoa() {
        _clearIntervalSafe(_coaExecTimer); _coaExecTimer = null;
        if (_coaExec) { _coaExec.paused = true; _coaExec.updated_at = _nowISO(); }
        try { _appendToEventLog('COA execution paused by operator.'); } catch (_) {}
        _persistCoaExec();   // RMOOZ-COA-COMMIT-PERSISTENCE-M
        updatePanel();
    }
    function _resetCoaExec() {
        _clearIntervalSafe(_coaExecTimer); _coaExecTimer = null;
        _coaExec = null;
        _persistCoaExec();   // RMOOZ-COA-COMMIT-PERSISTENCE-M: !_coaExec → removes the persisted key (safe clear, req #8)
        updatePanel();
    }
    // The ONLY operator path that re-engages the AI: stop executing + run a fresh Deep Plan (LLM).
    function _replanCoa() {
        _clearIntervalSafe(_coaExecTimer); _coaExecTimer = null;
        try { _appendToEventLog('Replan requested — calling the AI Commander for a fresh plan.'); } catch (_) {}
        _coaExec = null;
        _generateCoaPlan();   // the single LLM call (Deep Plan)
    }
    // The COA Commitment Mode control block (Commit / Run / Pause / Replan + live status).
    function _coaExecHtml() {
        function btn(act, label, col) { return '<button data-act="' + act + '" style="font:inherit;cursor:pointer;border:1px solid ' + col + ';background:#101b27;color:#cfe6ff;border-radius:5px;padding:4px 9px;font-size:10.5px;">' + label + '</button>'; }
        var hasPlan = !!(_coaPlan && _coaPlan.ok && arr(_coaPlan.coas).length);
        if (!hasPlan && !_coaExec) return '';
        var ex = _coaExec;
        var running = !!(ex && ex.active && !ex.paused && !ex.replan_required && ex.phase_status !== 'complete');
        var h = '<div data-ff-coa="commit-exec" style="margin:4px 0 8px;padding:6px 9px;border:1px solid #2e5d7d;border-radius:5px;background:#0a1420;">';
        h += '<div style="font-size:10.5px;font-weight:700;color:#9ec2ec;margin-bottom:3px;">🎖 COA Commitment Mode — plan once · commit · RMOOZ executes the cycle</div>';
        h += '<div style="display:flex;gap:5px;flex-wrap:wrap;">';
        if (hasPlan) h += btn('coa-commit', '✔ Commit this COA', '#2e7d54');
        if (ex && ex.active && ex.phase_status !== 'complete') {
            if (!running) h += btn('coa-run', '▶ Run selected COA', '#2e7d54');
            if (running)  h += btn('coa-pause', '⏸ Pause COA', '#8a6a20');
            h += btn('coa-replan', '↻ Replan (AI)', '#4a7bb8');
        }
        if (ex) h += btn('coa-exec-reset', '⟲ Clear committed COA', '#5a6270');
        h += '</div>';
        if (ex) {
            var phases = arr(ex.selected_coa && ex.selected_coa.phases);
            var pIdx = Math.min(ex.current_phase_index, Math.max(0, phases.length - 1));
            var phase = phases[pIdx] || {};
            var ordersTotal = arr(phase.actions).length;
            var ordersDone = arr(ex.completed_orders).filter(function (o) { return o.phase === ex.current_phase_index; }).length;
            var statusColor = ex.phase_status === 'complete' ? '#7fd6a0' : (ex.replan_required ? '#f0a0a0' : (running ? '#7fd6a0' : '#e0c060'));
            h += '<div style="margin-top:4px;font-size:10px;color:#cdd8e4;line-height:1.55;">';
            if (ex._restored) h += '<div data-ff-coa="restored-note" style="color:#9fe8c0;font-weight:700;margin-bottom:2px;">↺ Restored committed COA from session. Press Run to resume.</div>';
            h += '<div><span style="color:#8fa5b8;">Active COA:</span> <span style="color:#e8eaed;font-weight:700;">' + esc(ex.selected_coa_id) + '</span> <span style="color:#7a9ab8;">· side ' + esc(ex.side) + '</span></div>';
            h += '<div><span style="color:#8fa5b8;">Current phase:</span> <span style="color:#cfe6ff;">' + (ex.phase_status === 'complete' ? 'all done' : ((ex.current_phase_index + 1) + ' / ' + phases.length + (phase.name ? ' — ' + esc(phase.name) : ''))) + '</span></div>';
            h += '<div><span style="color:#8fa5b8;">Orders complete:</span> <span style="color:#bfe89a;">' + ordersDone + ' / ' + ordersTotal + '</span> · <span style="color:#8fa5b8;">status</span> <span style="color:' + statusColor + ';font-weight:700;">' + esc(ex.phase_status) + '</span> · <span style="color:#7a9ab8;">tick ' + ex.ticks + '</span></div>';
            if (ex.replan_required) {
                h += '<div data-ff-coa="replan-banner" style="margin-top:3px;padding:5px 7px;border:1px solid #6a3030;border-radius:4px;background:#241414;color:#f0b0b0;">⚠ Replan required — ' + esc(ex.replan_reason || '') +
                    '<div style="color:#cdb86a;margin-top:2px;">Choose: <b>Run selected COA</b> (continue anyway) · <b>Replan (AI)</b> · or switch the Planner to <b>Staff-Safe</b>.</div></div>';
            }
            h += '</div>';
            // RMOOZ-ADVISORY-COMMIT-JOURNAL-V: the advisory/ranking context recorded at commit time.
            var cac = ex.commit_advisory_context;
            if (cac) {
                h += '<div data-ff-coa="commit-advisory" style="margin-top:4px;padding:5px 7px;border:1px solid #2a4d6a;border-radius:4px;background:#08131e;font-size:9.5px;color:#cdd8e4;">';
                h += '<div style="color:#9ec2ec;font-weight:700;margin-bottom:2px;">Committed COA advisory context</div>';
                if (!cac.considered) {
                    h += '<div style="color:#8fa5b8;">' + esc(cac.reason || 'no advisory context available') + '</div>';
                } else {
                    h += '<div>Recommended: <b style="color:#7fd6a0;">' + esc(cac.recommended_coa_id) + '</b> · Selected: <b style="color:#cfe6ff;">' + esc(cac.selected_coa_id) + '</b></div>';
                    h += '<div>Operator override: <b style="color:' + (cac.operator_override ? '#e0a93a' : '#7fd6a0') + ';">' + (cac.operator_override ? 'yes' : 'no') + '</b>';
                    var _sd = cac.selected_coa_ranking && cac.selected_coa_ranking.green_advisory_delta;
                    if (_sd != null) h += ' · Green/White Δ on selected: <b style="color:#e0a93a;">' + _sd + '</b>';
                    h += '</div>';
                    var _ga = cac.green_advisory || {};
                    if (arr(_ga.warnings).length) h += '<div style="color:#e0a93a;">⚠ ' + arr(_ga.warnings).map(function (x) { return esc(x); }).join(' · ') + '</div>';
                    if (arr(_ga.recommendations).length) h += '<div style="color:#9fd6b0;">↪ ' + arr(_ga.recommendations).map(function (x) { return esc(x); }).join(' · ') + '</div>';
                }
                h += '</div>';
            }
            if (running) h += '<div data-ff-coa="no-llm-note" style="margin-top:3px;font-size:9.5px;color:#7fd6a0;">✅ AI is NOT being called on normal ticks. Running the committed COA deterministically.</div>';
            // per-tick timing (perf proof)
            var tt = ex.last_tick_timing || {};
            h += '<div style="margin-top:2px;font-size:9px;color:#6a8fa8;">commit ' + _fmtMs(tt.coa_commit_ms || 0) + ' · tick ' + _fmtMs(tt.coa_tick_execute_ms || 0) + ' · trigger-check ' + _fmtMs(tt.replan_trigger_check_ms || 0) +
                ' · ui ' + _fmtMs(tt.ui_update_ms || 0) + ' · map ' + _fmtMs(tt.map_paint_ms || 0) + ' · log ' + _fmtMs(tt.event_log_ms || 0) + ' · persist ' + _fmtMs(tt.storage_persist_ms || 0) +
                ' · interval ' + (tt.tick_interval_delay_ms != null ? tt.tick_interval_delay_ms + 'ms' : '—') +
                ' · llm_called_this_tick: <b style="color:' + (tt.llm_called_this_tick ? '#f0a0a0' : '#7fd6a0') + ';">' + String(!!tt.llm_called_this_tick) + '</b></div>';
        }
        h += '</div>';
        return h;
    }

    function _buildCoaEventLogEntries() {
        if (!_coaPlan || !_coaPlan.ok || !Array.isArray(_coaPlan.coas)) return [];
        var idx = _coaSelectedIdx;
        if (idx < 0 || idx >= _coaPlan.coas.length) idx = 0;
        var coa = _coaPlan.coas[idx] || {};
        var moved = _coaMovedUnits;
        var srcTag = (_coaPlan.plan_source === 'llm') ? 'llm' : 'deterministic';
        var roleCounts = {};
        moved.forEach(function (mv) { var r = mv.role || 'unknown'; roleCounts[r] = (roleCounts[r] || 0) + 1; });
        var roleStr = Object.keys(roleCounts).map(function (r) { return roleCounts[r] + ' ' + r; }).join(', ');
        var heldStr = _coaHeldCount > 0 ? (', ' + _coaHeldCount + ' already in position') : '';
        return [
            'AI COA Applied: ' + esc(coa.plan_id || 'COA-?') + ' ' + esc(coa.title || '') +
            ' — ' + moved.length + ' units moved' + heldStr + (roleStr ? ', ' + roleStr : '') +
            ' [' + srcTag + ']'
        ];
    }

    // ── FREEFIGHT-AI-CONTINUOUS-COMMANDER-LOOP-A ───────────────────────────────
    // A continuous, AI-controlled commander loop. Each turn: read state → ask the
    // planner for the active side → auto-pick the recommended COA → move units
    // (cinematically at slow speeds) → log → switch side → schedule next turn.
    function round5(n) { return Math.round(n * 1e5) / 1e5; }
    function _ffSpeed() { return FF_SPEEDS[_freeFightSpeed] || FF_SPEEDS.x1; }
    function _winFn(name) { var w = W(); return (w && typeof w[name] === 'function') ? w[name].bind(w) : (typeof global !== 'undefined' && typeof global[name] === 'function' ? global[name] : (typeof globalThis !== 'undefined' ? globalThis[name] : null)); }
    function _setTimeoutSafe(fn, ms) { var f = _winFn('setTimeout'); return f ? f(fn, ms) : null; }
    function _clearTimeoutSafe(t) { var f = _winFn('clearTimeout'); if (f && t != null) f(t); }
    function _setIntervalSafe(fn, ms) { var f = _winFn('setInterval'); return f ? f(fn, ms) : null; }
    function _clearIntervalSafe(t) { var f = _winFn('clearInterval'); if (f && t != null) f(t); }

    // Cap a move toward the target by one tactical step (≈ STEP_DEG), like the server.
    var FF_LOOP_STEP_DEG = 0.05;
    function _stepTowardCapped(from, to) {
        var dx = to.lat - from.lat, dy = to.lon - from.lon;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d <= FF_LOOP_STEP_DEG || d === 0) return { lat: +to.lat, lon: +to.lon };
        var t = FF_LOOP_STEP_DEG / d;
        return { lat: from.lat + dx * t, lon: from.lon + dy * t };
    }

    // Build the plan-coas request body for the active side, with loop context.
    function _buildLoopRequestBody() {
        var base = _buildAiRequestBody(); // units + objectives + opts (preferSide RED)
        var pressure = _computeObjectivePressure(base.units, base.objectives);
        var lastMoved = (_lastCommanderDecision && _lastCommanderDecision.moved) || 0;
        var prevActions = _turnLog.slice(-3).map(function (t) {
            return { turn: t.turn, side: t.side, coa_id: t.coa_id, moved: t.moved };
        });
        return {
            units: base.units,
            objectives: base.objectives,
            context: {
                turn_number: _turnNumber + 1,
                active_side: _activeSide,
                previous_actions: prevActions,
                moved_units_last_turn: lastMoved,
                current_objective_pressure: pressure,
                // RMOZ-INTEL-CAPABILITY-TERRAIN-ZONE-A: feed recent COA families so the
                // intel layer's COA-variation engine avoids repeating the same family.
                previous_coa_families: _coaFamilyHistory.slice(-3),
                defending_side: 'BLUE',
                // RMOOZ-AI-COMMANDER-FREEDOM-A: commander mode + a per-turn variation seed
                // so high-variation rotates the recommended approach across cycles.
                commander_mode: _commanderMode,
                variation_seed: _turnNumber + 1,
                // RMOZ-COMMANDER-BRIEF-COALITION-A: scenario name → sovereign-zone country
                // + coalition detection (UAE→GCC, NATO members→NATO, etc.).
                scenario_name: (function () { var w = W(); var sc = w && w.RmoozScenario && w.RmoozScenario.scenario; return sc && (sc.name || sc.scenario_label || sc.scenario_name) || null; })(),
            },
            // RMOOZ-AI-EXECUTION-SINGLE-GATE-A: the AI Free Fight loop ALWAYS requests the LLM — the
            // single gate is RMOOZ_ALLOW_SIM_RUN on the server, not a separate client toggle.
            opts: { preferSide: _activeSide, useLlm: true, ai_depth: _aiDepth, commander_mode: _commanderMode, planning_mode: _planningMode, capture_raw_llm: _captureRawLlm, allowed_unit_ids: base.units.map(function (u) { return u.id; }) },
        };
    }

    // Simple pressure metric: fraction of RED units within ~0.15° of the objective.
    function _computeObjectivePressure(units, objectives) {
        var obj = arr(objectives)[0];
        if (!obj || !Number.isFinite(+obj.lat) || !Number.isFinite(+obj.lon)) return 0;
        var red = arr(units).filter(function (u) { return String(u.side || 'RED').toUpperCase() === 'RED'; });
        if (!red.length) return 0;
        var near = red.filter(function (u) {
            var dx = (+u.lat) - (+obj.lat), dy = (+u.lon) - (+obj.lon);
            return Math.sqrt(dx * dx + dy * dy) <= 0.15;
        }).length;
        return Math.round((near / red.length) * 100) / 100;
    }

    // Auto-pick the recommended COA index (falls back to 0).
    function _pickRecommendedIdx(plan) {
        if (!plan || !Array.isArray(plan.coas)) return 0;
        // RMOOZ-COA-RANKING-WITH-ADVISORY-U: a computed ranking (which folds in the Green/White advisory)
        // wins when present; otherwise fall back to the planner's recommendation. Ranking is advisory —
        // it changes the DEFAULT recommendation only, never validity or executability.
        if (typeof plan._ranking_recommended_idx === 'number' && plan._ranking_recommended_idx >= 0 && plan._ranking_recommended_idx < plan.coas.length) return plan._ranking_recommended_idx;
        if (plan.recommended_plan_id) {
            for (var i = 0; i < plan.coas.length; i++) {
                if (plan.coas[i] && plan.coas[i].plan_id === plan.recommended_plan_id) return i;
            }
        }
        for (var j = 0; j < plan.coas.length; j++) {
            if (plan.coas[j] && plan.coas[j].recommended) return j;
        }
        return 0;
    }
    // ── RMOOZ-COA-RANKING-WITH-ADVISORY-U: deterministic COA ranking with the Green/White advisory as an
    // INPUT. Pure, no LLM, no fetch. The advisory delta affects ranking/recommendation ONLY — it NEVER
    // changes validation.ok and NEVER blocks Run Plan. Per-COA green penalty scales by the COA's approach
    // intensity (how much it commits force toward the high-collateral objective), so a lower-tactical,
    // lower-exposure COA can out-rank a high-exposure one when Green risk is high.
    function _kmBetween(a, b) {
        if (!a || !b) return Infinity;
        var R = 6371, toR = Math.PI / 180;
        var dLat = (b.lat - a.lat) * toR, dLon = (b.lon - a.lon) * toR, la1 = a.lat * toR, la2 = b.lat * toR;
        var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
    }
    function _coaApproachIntensity(coa, obj) {
        if (!obj) return 0.65;   // no objective placed → neutral exposure (uniform, can't differentiate)
        var move = 0, near = 0;
        arr(coa && coa.phases).forEach(function (ph) {
            arr(ph.actions).forEach(function (act) {
                if (!act || act.action_type === 'HOLD_POSITION') return;
                var t = act.target; if (!t || !Number.isFinite(+t.lat) || !Number.isFinite(+t.lon)) return;
                move++; if (_kmBetween({ lat: +t.lat, lon: +t.lon }, obj) <= 8) near++;
            });
        });
        if (!move) return 0;            // all HOLD / standoff → minimal exposure
        return near / move;             // 0..1
    }
    function _num(v, d) { return (typeof v === 'number' && isFinite(v)) ? v : d; }
    function _rankCoas(plan, green) {
        var coas = arr(plan && plan.coas);
        if (!coas.length) return { ranked: [], recommended_idx: 0, plan_green_delta: 0 };
        var obj = getObjective();
        var ga = _greenAdvisoryScoring(green);          // green==null → delta 0, low-confidence
        var planDelta = ga.advisory_score_delta || 0;   // <= 0
        var best = -Infinity, bestIdx = 0;
        coas.forEach(function (coa, i) {
            var isPlannerRec = (plan.recommended_plan_id && coa.plan_id === plan.recommended_plan_id) || coa.recommended === true;
            var base = _num(coa.base_score, _num(coa.score, 50));
            var tactical = _num(coa.tactical_score, isPlannerRec ? 20 : 10);
            var readiness = _num(coa.readiness_score, 0);   // no per-COA readiness layer → 0 (honest)
            var terrain = _num(coa.terrain_score, 0);
            var exposure = 0.3 + 0.7 * _coaApproachIntensity(coa, obj);   // standoff 0.3 … full commit 1.0
            var greenDelta = Math.round(planDelta * exposure);            // <= 0, advisory only
            var final = base + tactical + readiness + terrain + greenDelta;
            coa._ranking = { base_score: base, tactical_score: tactical, readiness_score: readiness, terrain_score: terrain,
                green_advisory_delta: greenDelta, final_score: final, recommended: false, ranking_reason: '',
                ranking_components: { base: base, tactical: tactical, readiness: readiness, terrain: terrain, green_advisory: greenDelta } };
            if (final > best) { best = final; bestIdx = i; }
        });
        coas.forEach(function (coa, i) {
            var rk = coa._ranking;
            rk.recommended = (i === bestIdx);
            rk.ranking_reason = (i === bestIdx)
                ? ('highest final score ' + rk.final_score + (rk.green_advisory_delta < 0 ? ' — lower Green/White risk vs alternatives (advisory ' + rk.green_advisory_delta + ')' : ''))
                : ('final score ' + rk.final_score + (rk.green_advisory_delta < 0 ? ' (Green/White advisory ' + rk.green_advisory_delta + ')' : ''));
        });
        return { ranked: coas.map(function (c) { return c._ranking; }), recommended_idx: bestIdx, plan_green_delta: planDelta, green_band: ga.collateral_risk_band };
    }
    // Compute + attach ranking to the current plan, re-select the ranking recommendation, and record it.
    function _applyCoaRanking() {
        if (!_coaPlan || !arr(_coaPlan.coas).length) return null;
        var r = _rankCoas(_coaPlan, _greenWorld);
        _coaPlan._ranking = r;
        _coaPlan._ranking_recommended_idx = r.recommended_idx;
        _coaSelectedIdx = r.recommended_idx;   // default selection follows the ranking (operator may still pick any)
        var recCoa = arr(_coaPlan.coas)[r.recommended_idx] || {};
        var recDelta = recCoa._ranking ? recCoa._ranking.green_advisory_delta : 0;
        try { _recordDecision({ role: 'performance', action: 'coa_ranking_with_green_advisory', called_llm: false, source: 'green-world→white',
            reason: 'green risk considered in ranking', result_summary: 'recommended ' + (recCoa.plan_id || ('COA-' + (r.recommended_idx + 1))) + ' · green Δ ' + recDelta + ' · final ' + (recCoa._ranking ? recCoa._ranking.final_score : '?') }); } catch (_) {}
        // event log — the COA most penalised by the advisory (non-zero only)
        var worst = { id: null, d: 0 };
        arr(_coaPlan.coas).forEach(function (c) { var d = c._ranking ? c._ranking.green_advisory_delta : 0; if (d < worst.d) worst = { id: c.plan_id || '', d: d }; });
        if (worst.id && worst.d < 0) { try { _appendToEventLog('COA ranking updated: Green/White advisory adjusted ' + esc(worst.id) + ' by ' + worst.d + '.'); } catch (_) {} }
        updatePanel();
        return r;
    }

    // Resolve the non-HOLD moves in a COA into {unit, start, final, role} records.
    function _resolveCoaMoves(coa) {
        var moves = [];
        arr(coa && coa.phases).forEach(function (ph) {
            arr(ph.actions).forEach(function (act) {
                if (!act || act.action_type === 'HOLD_POSITION') return;
                if (!act.target || !Number.isFinite(+act.target.lat) || !Number.isFinite(+act.target.lon)) return;
                var found = _findRealUnit(act.unit_uid);
                if (!found || !found.unit) return;
                var u = found.unit;
                var startLat = u.lat != null ? +u.lat : (Array.isArray(u.coord) ? +u.coord[1] : null);
                var startLon = u.lon != null ? +u.lon : (Array.isArray(u.coord) ? +u.coord[0] : null);
                if (!Number.isFinite(startLat) || !Number.isFinite(startLon)) return;
                var fin = _stepTowardCapped({ lat: startLat, lon: startLon }, { lat: +act.target.lat, lon: +act.target.lon });
                // FREEFIGHT-BLUE-THREAT-AWARE-MOVEMENT-A: classify below-epsilon as already-in-position.
                var dLat = round5(fin.lat) - startLat, dLon = round5(fin.lon) - startLon;
                var held = Math.sqrt(dLat * dLat + dLon * dLon) < MIN_VISIBLE_MOVE_DEG;
                // RMOOZ-AI-MOVEMENT-EXECUTION-AUDIT-A: carry the action_type + execution_mode + the
                // action-specific target so the EXECUTED event log / debug overlay can PROVE the
                // marker followed the COA's action target (recon standoff / flank off-axis / …).
                moves.push({ unit: u, uid: act.unit_uid, role: act.role || '', action_type: act.action_type || '',
                    execution_mode: act.execution_mode || '', held: held,
                    start: { lat: startLat, lon: startLon }, final: { lat: round5(fin.lat), lon: round5(fin.lon) },
                    target: { lat: +act.target.lat, lon: +act.target.lon } });
            });
        });
        return moves;
    }

    // RMOOZ-AI-MOVEMENT-EXECUTION-AUDIT-A: one ledger line per moved unit proving
    // raw action → applied movement → final marker position, e.g.
    //   "EXECUTED: B-3 recon from 24.10,54.20 to 24.14,54.24 via recon_standoff_target"
    function _ll2(o) { return (Number(o.lat)).toFixed(2) + ',' + (Number(o.lon)).toFixed(2); }
    function _logExecutedMoves(moves) {
        arr(moves).forEach(function (m) {
            if (!m) return;
            var uid = String(m.uid || (m.unit && (m.unit.id || m.unit.uid || m.unit.unit_uid)) || '?');
            var at = String(m.action_type || '?');
            var mode = String(m.execution_mode || 'generic_target');
            if (m.held) {
                _appendToEventLog('EXECUTED: ' + esc(uid) + ' ' + esc(at) + ' HELD at ' + _ll2(m.start) + ' (already in position) via ' + esc(mode));
            } else {
                _appendToEventLog('EXECUTED: ' + esc(uid) + ' ' + esc(at) + ' from ' + _ll2(m.start) + ' to ' + _ll2(m.final) + ' via ' + esc(mode));
            }
        });
    }
    // Build the enriched moved-unit records (carry action_type / execution_mode / final / target
    // for the debug overlay). held units are excluded from the moved set (counted separately).
    function _movedRecords(moves) {
        return arr(moves).filter(function (m) { return !m.held; }).map(function (m) {
            return { unit: m.unit, uid: m.uid, oldPos: m.start, finalPos: m.final, role: m.role,
                action_type: m.action_type, execution_mode: m.execution_mode, target: m.target };
        });
    }

    function _writeMoveFrame(moves, t) {
        moves.forEach(function (m) {
            var lat = m.start.lat + (m.final.lat - m.start.lat) * t;
            var lon = m.start.lon + (m.final.lon - m.start.lon) * t;
            m.unit.lat = round5(lat); m.unit.lon = round5(lon);
            if (Array.isArray(m.unit.coord) && m.unit.coord.length >= 2) { m.unit.coord[0] = round5(lon); m.unit.coord[1] = round5(lat); }
            else if (m.unit.coord !== undefined) { m.unit.coord = [round5(lon), round5(lat)]; }
            m.unit._ff_coa_moved_by_ai = true;
        });
    }

    // Apply a COA. Cinematic at slow speeds (animate over animMs), instant when
    // animMs is tiny or no map. Calls done(movedUnits) when finished.
    function _applyCoaAnimated(coa, animMs, done) {
        if (_moveAnimTimer) { _clearIntervalSafe(_moveAnimTimer); _moveAnimTimer = null; }
        var moves = _resolveCoaMoves(coa);
        function finishNow() {
            _writeMoveFrame(moves, 1);
            // Only count VISIBLY-moved units; held units (already in position) excluded from
            // the moved set + trails, but tracked for the "already in position" count.
            _coaMovedUnits = _movedRecords(moves);
            _coaHeldCount = moves.filter(function (m) { return m.held; }).length;
            _coaApplied = true;
            if (mapReady()) { _triggerScenarioRedraw(); syncMarkers(); _maybePanToMovedCentroid(); }
            _logExecutedMoves(moves); // RMOOZ-AI-MOVEMENT-EXECUTION-AUDIT-A: per-unit execution proof
            if (done) done(_coaMovedUnits);
        }
        if (!moves.length) { _coaMovedUnits = []; _coaHeldCount = 0; _coaApplied = true; if (done) done([]); return; }
        // Instant path: tiny anim window, no map, or no usable interval timer.
        if (!mapReady() || !Number.isFinite(animMs) || animMs <= 150 || !_winFn('setInterval')) { finishNow(); return; }
        var frames = Math.max(2, Math.min(24, Math.round(animMs / 250)));
        var interval = Math.max(40, animMs / frames);
        var f = 0;
        _moveAnimTimer = _setIntervalSafe(function () {
            f++;
            var t = f / frames;
            if (t >= 1) {
                _clearIntervalSafe(_moveAnimTimer); _moveAnimTimer = null;
                finishNow();
            } else {
                _writeMoveFrame(moves, t);
                if (mapReady()) { _triggerScenarioRedraw(); syncMarkers(); }
            }
        }, interval);
    }

    // FREEFIGHT-MANUAL-MAP-CAMERA-A: the ONLY place the camera may move on AI
    // movement. A no-op in the default 'manual' mode — the operator's view is
    // preserved. Only 'follow' mode pans (never zoom / flyTo / fitBounds).
    function _maybeFollowAiMovement(latlng) {
        if (_freeFightCameraMode !== 'follow') return;
        if (!mapReady() || !latlng) return;
        try { W().map.panTo(latlng); } catch (_) {}
    }
    function _maybePanToMovedCentroid() {
        if (_freeFightCameraMode !== 'follow') return; // manual default: never move the camera
        if (!mapReady() || !_coaMovedUnits.length) return;
        var latSum = 0, lonSum = 0, n = 0;
        _coaMovedUnits.forEach(function (mv) { if (mv.unit && Number.isFinite(+mv.unit.lat)) { latSum += +mv.unit.lat; lonSum += +mv.unit.lon; n++; } });
        if (n) _maybeFollowAiMovement([latSum / n, lonSum / n]);
    }
    function setCameraMode(mode) {
        _freeFightCameraMode = (mode === 'follow') ? 'follow' : 'manual';
        updatePanel();
    }
    // RMOOZ-AI-COMMANDER-FREEDOM-A: switch the AI Commander Mode (controlled / free /
    // high_variation). Takes effect on the next planning cycle; logged for transparency.
    function setCommanderMode(mode) {
        if (!FF_COMMANDER_MODES[mode]) return;
        _commanderMode = mode;
        try { _appendToEventLog('AI COMMANDER MODE: ' + FF_COMMANDER_MODES[mode].label + ' — ' +
            (mode === 'controlled' ? 'doctrine-guided' : mode === 'high_variation' ? 'creative / rotating approach' : 'free tactical reasoning') + '.'); } catch (_) {}
        updatePanel();
    }
    // RMOOZ-AI-COMMANDER-REPAIR-LOOP-A: switch the planning mode — 'commander' (LLM drafts +
    // RMOOZ validates/repairs) or 'staff_safe' (deterministic staff planner, the manual + auto fallback).
    function setPlanningMode(mode) {
        if (mode !== 'commander' && mode !== 'staff_safe') return;
        _planningMode = mode;
        try { _appendToEventLog('AI PLANNER: ' + (mode === 'commander'
            ? 'AI Commander — LLM drafts COAs, RMOOZ validates & repairs.'
            : 'Staff-Safe — deterministic staff planner (no LLM).')); } catch (_) {}
        updatePanel();
    }
    // RMOOZ-AI-COA-PERFORMANCE-A: switch the AI planning depth (fast / normal / deep).
    // Takes effect on the next planning request; logged for transparency.
    function setAiDepth(depth) {
        if (!FF_AI_DEPTHS[depth]) return;
        _aiDepth = depth;
        try { _appendToEventLog('AI DEPTH: ' + FF_AI_DEPTHS[depth].label + ' — ' +
            (depth === 'fast' ? 'heuristic capability, no LLM, terrain summary only' :
             depth === 'deep' ? 'full LLM + full terrain/provenance' : 'LLM when enabled, real terrain') + '.'); } catch (_) {}
        updatePanel();
    }

    // Format a millisecond span for the operator (seconds once it crosses ~1s).
    function _fmtMs(ms) {
        var n = Number(ms);
        if (!Number.isFinite(n)) return '—';
        return n >= 1000 ? (Math.round(n / 100) / 10) + 's' : Math.round(n) + 'ms';
    }
    // RMOOZ-AI-SPEED-ARCHITECTURE-J #3: "AI Performance Breakdown" — every debug_timing span plus the
    // cache hit/miss, repair attempts, provider/model, and token usage. Returns '' when no timing.
    function _coaTimingHtml(t, plan) {
        if (!t || typeof t !== 'object') return '';
        function row(label, ms, color) {
            if (ms == null) return '';
            return '<span style="color:#7a9ab8;">' + esc(label) + ':</span> <span style="color:' + (color || '#cdd8e4') + ';">' + esc(_fmtMs(ms)) + '</span>';
        }
        var parts = [
            row('AI total', t.total_ms, '#cfe8ff'),
            (t.llm_ms ? row('LLM', t.llm_ms, '#90d0b0') : ''),
            (t.llm_repair_ms ? row('LLM repair', t.llm_repair_ms, '#e0c060') : ''),
            row('capability', t.analyze_unit_capabilities_ms, '#d8ccff'),
            row('intel', t.build_scenario_intel_ms),
            row('terrain', t.tactical_terrain_context_ms),
            row('prompt pack', t.build_commander_prompt_pack_ms),
            row('validation', t.validation_ms),
            row('brief', t.commander_brief_ms),
            row('COA build', t.build_diverse_coas_ms, '#bfe89a'),
        ].filter(Boolean);
        if (!parts.length) return '';
        // cache + repair + provider/model + tokens (only show what's present)
        var meta = [];
        if (t.cap_cache) meta.push('<span style="color:#7a9ab8;">capability cache:</span> <span style="color:' + (t.cap_cache === 'hit' ? '#7fd6a0' : '#e0a93a') + ';font-weight:600;">' + esc(t.cap_cache) + '</span>' +
            ((t.cap_cache_hits != null) ? ' <span style="color:#5a7a90;">(' + (t.cap_cache_hits || 0) + ' hits / ' + (t.cap_cache_misses || 0) + ' miss)</span>' : ''));
        var p = plan || {};
        if (p.attempts != null || p.repair_attempts != null) meta.push('<span style="color:#7a9ab8;">repair attempts:</span> <span style="color:#cdd8e4;">' + (p.repair_attempts != null ? p.repair_attempts : (p.attempts > 1 ? (p.attempts - 1) : 0)) + '</span>');
        if (p.provider_used || p.model_used) meta.push('<span style="color:#7a9ab8;">provider/model:</span> <span style="color:#9ec2ec;">' + esc((p.provider_used || '—') + ' · ' + (p.model_used || '—')) + '</span>');
        var usage = p.usage || (p.llm_raw_response && p.llm_raw_response.usage) || null;
        if (usage && (usage.output_tokens != null || usage.completion_tokens != null)) meta.push('<span style="color:#7a9ab8;">output tokens:</span> <span style="color:#cdd8e4;">' + (usage.output_tokens != null ? usage.output_tokens : usage.completion_tokens) + '</span>');
        return '<div data-ff-coa="timing" style="margin-bottom:6px;font-size:9.5px;color:#8fa5b8;line-height:1.6;border:1px solid #20364e;border-radius:4px;padding:5px 8px;background:#0a1420;">' +
            '<div style="color:#9ec2ec;font-weight:700;margin-bottom:2px;">⏱ AI Performance Breakdown</div>' +
            '<div>' + parts.join(' · ') + '</div>' +
            (meta.length ? '<div style="margin-top:2px;">' + meta.join(' · ') + '</div>' : '') + '</div>';
    }
    // RMOOZ-AI-ATTACK-PLAN-AI-ONLY-A: is this a REAL LLM result? The manual "Generate AI Attack
    // Plan" page renders cards/numbers ONLY when this is true. Strict gate per the spec.
    function _isRealLlmPlan(p) {
        if (!p || p.ok !== true) return false;
        if (p.llm_called !== true) return false;
        if (p.plan_source !== 'llm') return false;
        var st = String(p.llm_status || '').toLowerCase();
        if (st !== 'ok' && st !== 'success') return false;   // not success/ok → reject
        if (p.fallback_reason) return false;                  // any fallback → reject
        if (!p.provider_used || !p.model_used) return false;  // provider/model missing → reject
        if (p.ai_depth === 'fast') return false;              // fast skips the LLM → reject
        return true;
    }
    // RMOOZ-AI-EXECUTION-SINGLE-GATE-A: the SINGLE top-level permission gate is RMOOZ_ALLOW_SIM_RUN
    // (surfaced on the plan as allow_sim_run / on route health as allow_sim_run). These are the only
    // operator-facing messages — the single gate is RMOOZ_ALLOW_SIM_RUN (no separate free-fight flag).
    var AI_EXECUTION_DISABLED_MSG = 'AI execution is disabled. Enable RMOOZ_ALLOW_SIM_RUN=1.';
    // RMOOZ-AI-USER-FRIENDLY-MODEL-FLOW-A: the operator-facing no-model text is now simple and
    // action-oriented — no provider/env jargon. This replaces the old technical "no local model"
    // wording. The technical detail (gate, provider, availability) lives only under Advanced diagnostics.
    var AI_NO_MODEL_MSG = 'Choose an AI model to start.';
    // RMOOZ-AI-COMMANDER-REPAIR-LOOP-A: a TIMEOUT means the model IS installed but too slow for the
    // time budget — say so honestly (the old code mislabeled it "no model available").
    var AI_TIMEOUT_MSG = 'The local AI timed out — the selected model is too slow for the current time budget. Pick a faster model (e.g. qwen2.5:3b) in the model selector, raise RMOOZ_FREE_FIGHT_TIMEOUT_MS, or switch to Staff-Safe mode.';
    var AI_FREE_FIGHT_REQUIRES_LLM = 'Enable RMOOZ_ALLOW_SIM_RUN=1 and select a local model.';
    // RMOOZ-FREE-FIGHT-AI-GATE-CARD-D: the EXACT fix per blocking gate. Free Fight can be blocked
    // independently by (1) the execution gate RMOOZ_ALLOW_SIM_RUN and (2) a remote raw provider
    // (local-only policy) — both can be true at once, so we show ALL that apply (req #4/#5/#6).
    var AI_FIX_EXEC_GATE = 'AI execution is disabled. Set RMOOZ_ALLOW_SIM_RUN=1 and restart the server.';
    function _aiProviderFix(provider) {
        return 'Free Fight is local-only. Current provider is ' + (provider || 'unknown') + '. Set RMOOZ_LLM_PROVIDER=ollama or remove remote provider env.';
    }
    // Read the route-health and return the list of ACTIVE blocking reasons (gate + provider).
    // [] when nothing at the gate level blocks. Each: { code, fix }.
    function _aiBlockReasons(rh) {
        var out = [];
        if (!rh || rh.ok === false || rh.allow_sim_run == null) return out;
        if (rh.allow_sim_run === false) out.push({ code: 'exec_gate', fix: AI_FIX_EXEC_GATE });
        if (rh.provider_blocked === true) out.push({ code: 'provider', fix: _aiProviderFix(rh.configured_provider || rh.provider) });
        return out;
    }
    // The structured AI-gate status card: shows the FOUR signals separately (execution gate,
    // raw provider, model availability, local-only policy) + the EXACT fix for every active
    // block. Reads the route health (_routeHealth). Returns '' when health is unknown.
    function _aiGateStatusHtml() {
        var rh = _routeHealth;
        if (!rh || rh.ok === false || rh.allow_sim_run == null) return '';
        var GREEN = '#7fd6a0', AMBER = '#e0a93a', GREY = '#8fa5b8';
        var gateOk = rh.allow_sim_run === true;
        var providerBlocked = rh.provider_blocked === true;
        var cfgProvider = rh.configured_provider || rh.provider || 'ollama';
        var modelAvail = rh.model_available;                 // true | false | null
        var reasons = _aiBlockReasons(rh);
        var blocked = reasons.length > 0;
        function sig(label, value, color) {
            return '<div><span style="color:#7a9ab8;">' + esc(label) + ':</span> <span style="color:' + color + ';font-weight:600;">' + esc(value) + '</span></div>';
        }
        var h = '<div data-ff-coa="ai-gate-status" style="font-size:10px;line-height:1.55;border:1px solid ' + (blocked ? '#5a4520' : '#205a40') + ';border-radius:5px;padding:6px 9px;background:' + (blocked ? '#1b1608' : '#0a1f14') + ';">';
        h += '<div data-ff-coa="ai-gate-headline" style="font-weight:700;color:' + (blocked ? '#f4d57a' : GREEN) + ';margin-bottom:3px;">' + (blocked ? '🛑 Free Fight AI is blocked' : '✅ Free Fight AI is ready') + '</div>';
        // FOUR separate signals (req #3)
        h += sig('Execution gate (RMOOZ_ALLOW_SIM_RUN)', gateOk ? 'enabled' : 'DISABLED', gateOk ? GREEN : AMBER);
        // RMOOZ-OPENROUTER-QWEN35-CLOUD-MODE-A: a cloud-ready openrouter provider is NOT local —
        // label it ☁ CLOUD so the operator always sees that data leaves the machine.
        var _provDesc = providerBlocked ? (cfgProvider + ' — REMOTE, blocked')
            : (cfgProvider === 'openrouter' ? (cfgProvider + ' — ☁ CLOUD (data leaves machine)') : (cfgProvider + ' — local'));
        h += sig('Provider (llm-runtime-config)', _provDesc, providerBlocked ? AMBER : (cfgProvider === 'openrouter' ? '#e0a060' : GREEN));
        h += sig('Model available', (modelAvail === true ? 'yes' : (modelAvail === false ? 'no' : 'unknown')) + (rh.model ? ' (' + rh.model + ')' : ''), modelAvail === true ? GREEN : (modelAvail === false ? AMBER : GREY));
        h += sig('Local-only policy', 'enforced', GREEN);
        // EXACT fixes — show ALL active blocks (req #4/#5/#6)
        if (blocked) {
            h += '<div data-ff-coa="ai-gate-fixes" style="margin-top:4px;border-top:1px solid #3a3018;padding-top:4px;">';
            reasons.forEach(function (r) {
                h += '<div data-ff-coa="fix-' + esc(r.code) + '" style="color:#f0c060;margin-bottom:2px;">• ' + esc(r.fix) + '</div>';
            });
            h += '</div>';
            // Staff-Safe escape hatch stays available (req #9)
            h += '<div data-ff-coa="staff-safe-hint" style="margin-top:4px;color:#cdb86a;font-size:9.5px;">Staff-Safe (deterministic, no LLM) is still available — switch the Planner to Staff-Safe for a guaranteed plan.</div>';
        } else if (modelAvail === false) {
            h += '<div data-ff-coa="fix-model" style="margin-top:4px;color:#f0c060;border-top:1px solid #3a3018;padding-top:4px;">• The selected model is not installed. Run <code>ollama pull ' + esc(rh.model || '<model>') + '</code> or pick an installed model.</div>';
        }
        h += '</div>';
        return h;
    }
    function _isTimeoutPlan(p) {
        var blob = String((p && p.llm_status) || '').toLowerCase() + ' ' + String((p && p.fallback_reason) || '').toLowerCase();
        return /timeout|timed.?out/.test(blob);
    }
    // Is AI execution disabled at the gate (RMOOZ_ALLOW_SIM_RUN not '1')?
    function _llmDisabled(p) { return !!(p && (p.allow_sim_run === false || p.llm_enabled === false)); }
    // Human reason WHY a manual plan is not a real AI result (for the gate message).
    function _aiOnlyReason(p) {
        if (!p) return 'no plan';
        if (_llmDisabled(p)) return 'AI execution disabled (RMOOZ_ALLOW_SIM_RUN not set)';
        if (p.ai_depth === 'fast') return 'fast mode (LLM skipped)';
        if (p.fallback_reason) return String(p.fallback_reason);
        var st = String(p.llm_status || '').toLowerCase();
        if (/timeout/.test(st)) return 'LLM timeout';
        if (/unavailable|remote_blocked|error|invalid/.test(st)) return 'no local model available (LLM ' + st + ')';
        if (p.llm_called !== true) return 'LLM not used';
        if (p.plan_source && p.plan_source !== 'llm') return 'deterministic fallback (' + p.plan_source + ')';
        if (!p.provider_used || !p.model_used) return 'no local model available (LLM did not run)';
        return 'deterministic fallback';
    }
    // The ONLY thing the manual page shows when the result is not real AI: the honest message
    // + the diagnostic fields + "View MCP Prompt". No cards, no scores, no fallback dressed as AI.
    function _aiOnlyGateHtml(p) {
        function row(k, v) { return '<div><span style="color:#7a9ab8;">' + esc(k) + ':</span> <span style="color:#cdd8e4;">' + esc(v == null || v === '' ? '—' : String(v)) + '</span></div>'; }
        var disabled = _llmDisabled(p);
        // allowed at the gate but the LLM did not actually run (no local model / provider unavailable)
        var noModel = !disabled && p && p.plan_source !== 'llm';
        // RMOOZ-FREE-FIGHT-AI-GATE-CARD-D: lead with the structured gate status (the EXACT
        // blocking reasons + fixes, separated by gate) from route health, then the plan diagnostics.
        var gateStatus = _aiGateStatusHtml();
        var h = gateStatus ? ('<div style="margin-bottom:6px;">' + gateStatus + '</div>') : '';
        h += '<div data-ff-coa="ai-only-gate" style="color:#f0c060;font-size:11px;padding:8px 10px;border:1px solid #6a5520;border-radius:5px;background:#1c1708;line-height:1.55;">';
        h += '<div style="font-weight:700;color:#f4d57a;">No AI result generated.</div>';
        if (disabled) {
            // Rule 1 — gate off.
            h += '<div data-ff-coa="exec-disabled" style="margin-top:2px;">' + esc(AI_EXECUTION_DISABLED_MSG) + '</div>';
        } else if (_isTimeoutPlan(p)) {
            // Rule 2a — the model IS installed but timed out (too slow). Honest, actionable message.
            h += '<div data-ff-coa="llm-timeout" style="margin-top:2px;">' + esc(AI_TIMEOUT_MSG) + '</div>';
            h += '<div>Reason: ' + esc(_aiOnlyReason(p)) + '</div>';
        } else if (noModel) {
            // Rule 2 — allowed, but the LLM produced nothing usable (no local model / unavailable).
            h += '<div data-ff-coa="no-model" style="margin-top:2px;">' + esc(AI_NO_MODEL_MSG) + '</div>';
            h += '<div>Reason: ' + esc(_aiOnlyReason(p)) + '</div>';
        } else {
            h += '<div>LLM was not used.</div>';
            h += '<div>Reason: ' + esc(_aiOnlyReason(p)) + '</div>';
        }
        h += '</div>';
        h += '<div data-ff-coa="ai-only-diag" style="margin-top:6px;font-size:9.5px;line-height:1.5;border:1px solid #20364e;border-radius:4px;padding:5px 8px;background:#0a1420;color:#8fa5b8;">';
        h += row('AI execution (RMOOZ_ALLOW_SIM_RUN)', (p.allow_sim_run === true || p.llm_enabled === true) ? 'allowed' : 'disabled');
        h += row('provider_used', p.provider_used);
        h += row('model_used', p.model_used);
        h += row('plan_source', p.plan_source);
        h += row('llm_called', String(!!p.llm_called));
        h += row('llm_status', p.llm_status);
        h += row('fallback_reason', p.fallback_reason);
        h += row('MCP prompt pack', p.mcp_prompt_version);
        h += row('commander_mode', p.commander_mode);
        h += row('ai_depth', p.ai_depth);
        h += '</div>';
        h += _mcpPromptHtml(p); // "View MCP Prompt" — proves the AI was instructed through MCP
        return h;
    }
    // RMOOZ-AI-ATTACK-PLAN-MCP-PROMPT-A: "View MCP Prompt" toggle — shows the EXACT prompt the MCP
    // tool-contract composed (commander instructions, tools_context summary, allowed units,
    // objective, terrain/zone context, system + user message). Proof the AI is instructed via MCP.
    function _mcpPromptHtml(p) {
        var mp = p && p.mcp_prompt;
        if (!mp) return '';
        var h = '<div style="margin-top:6px;"><button data-act="view-mcp-prompt" style="font:inherit;cursor:pointer;border:1px solid #3a5f7a;background:#0e1c28;color:#9ec2ec;border-radius:4px;padding:3px 9px;font-size:10px;">' + (_mcpPromptExpanded ? '▾ Hide MCP Prompt' : '▸ View MCP Prompt') + '</button></div>';
        if (_mcpPromptExpanded) {
            var pre = function (label, body) {
                return '<div style="margin-top:4px;"><div style="color:#7a9ab8;font-size:9px;font-weight:600;">' + esc(label) + '</div>' +
                    '<pre style="white-space:pre-wrap;word-break:break-word;margin:2px 0;font-size:9px;color:#cdd8e4;background:#06101a;border:1px solid #1a2c40;border-radius:3px;padding:5px 7px;max-height:220px;overflow:auto;">' + esc(body) + '</pre></div>';
            };
            var prettyPrompt = mp.prompt;
            try { prettyPrompt = JSON.stringify(JSON.parse(mp.prompt), null, 2); } catch (_) {}
            h += '<div data-ff-coa="mcp-prompt" style="margin-top:4px;border:1px solid #20364e;border-radius:4px;padding:6px 8px;background:#0a1420;">';
            h += '<div style="font-size:9.5px;color:#8fa5b8;">version: <span style="color:#cdd8e4;">' + esc(mp.version) + '</span> · tools_context: <span style="color:#cdd8e4;">' + esc((mp.tools_context_summary || []).join(', ')) + '</span> · allowed_unit_ids: <span style="color:#cdd8e4;">' + esc((mp.allowed_unit_ids || []).length) + '</span> · force pool: <span style="color:#cdd8e4;">' + esc(mp.force_pool_count) + '</span></div>';
            if (Array.isArray(mp.commander_instructions)) {
                h += '<div style="margin-top:4px;color:#7a9ab8;font-size:9px;font-weight:600;">commander instructions</div>';
                h += '<ul style="margin:2px 0;padding-left:15px;">' + mp.commander_instructions.map(function (r) { return '<li style="color:#bfe89a;font-size:9px;margin-bottom:1px;">' + esc(r) + '</li>'; }).join('') + '</ul>';
            }
            h += pre('system (commander instruction)', mp.system);
            h += pre('prompt (tools_context + objective + terrain/zone + allowed units + schema)', prettyPrompt);
            h += '</div>';
        }
        return h;
    }
    // RMOOZ-AI-MOVEMENT-EXECUTION-AUDIT-A: state plainly whether the LLM controlled this plan.
    //  - ai_depth=fast (LLM skipped)          → "Fast tactical planner — no LLM used."
    //  - plan_source not 'llm' (deterministic) → "LLM not used — deterministic tactical planner."
    //  - plan_source 'llm'                     → "LLM-planned."
    function _planSourceNoteHtml(plan) {
        if (!plan || !plan.ok) return '';
        var msg, color, bdr, bg;
        if (plan.ai_depth === 'fast') {
            msg = 'Fast tactical planner, no LLM.'; color = '#7fd0c0'; bdr = '#205a50'; bg = '#0a1f1a';
        } else if (plan.plan_source !== 'llm') {
            msg = 'LLM not used — deterministic tactical planner' + (plan.llm_called ? ' (LLM tried, fell back).' : '.');
            color = '#cdb86a'; bdr = '#5a4f20'; bg = '#1a1708';
        } else {
            msg = 'LLM-planned (validated, review-only).'; color = '#7fd6a0'; bdr = '#205a40'; bg = '#0a1f14';
        }
        return '<div data-ff-coa="source-note" style="margin-bottom:5px;font-size:10px;color:' + color + ';padding:4px 7px;border:1px solid ' + bdr + ';border-radius:4px;background:' + bg + ';">' + esc(msg) + '</div>';
    }
    // RMOOZ-AI-MOVEMENT-EXECUTION-AUDIT-A: per-COA movement-execution debug overlay. Surfaces the
    // selected COA's source/mode/depth/seed + lead action's target AND the actual final marker
    // position after animation — the proof that the marker followed the action-specific target.
    function _coaDebugHtml() {
        var p = _coaPlan;
        if (!p || !p.ok || !Array.isArray(p.coas) || !p.coas.length) return '';
        var idx = (_coaSelectedIdx >= 0 && _coaSelectedIdx < p.coas.length) ? _coaSelectedIdx : 0;
        var coa = p.coas[idx] || {};
        var lead = (coa.phases && coa.phases[0] && coa.phases[0].actions && coa.phases[0].actions[0]) || {};
        var tgt = lead.target ? (Number(lead.target.lat).toFixed(3) + ',' + Number(lead.target.lon).toFixed(3)) : '—';
        var finalStr = '(apply to see)';
        if (_coaApplied) {
            var rec = arr(_coaMovedUnits).filter(function (m) { return String(m.uid) === String(lead.unit_uid); })[0];
            if (rec && rec.finalPos) finalStr = Number(rec.finalPos.lat).toFixed(3) + ',' + Number(rec.finalPos.lon).toFixed(3);
            else {
                var fu = _findRealUnit(lead.unit_uid);
                if (fu && fu.unit && fu.unit.lat != null) finalStr = Number(fu.unit.lat).toFixed(3) + ',' + Number(fu.unit.lon).toFixed(3);
                else finalStr = '(held / no move)';
            }
        }
        function row(k, v, c) { return '<div><span style="color:#7a9ab8;">' + esc(k) + ':</span> <span style="color:' + (c || '#cdd8e4') + ';">' + esc(String(v)) + '</span></div>'; }
        var llmColor = p.llm_called ? (p.plan_source === 'llm' ? '#7fd6a0' : '#e0a040') : '#9ab0c0';
        var h = '<details data-ff-coa="debug" style="margin-bottom:6px;"><summary style="cursor:pointer;font-size:10px;color:#9ec2ec;font-weight:600;">🔬 Movement execution debug</summary>';
        h += '<div style="font-size:9.5px;line-height:1.5;border:1px solid #20364e;border-radius:4px;padding:5px 8px;background:#0a1420;margin-top:3px;">';
        h += row('plan_source', p.plan_source || '—', p.plan_source === 'llm' ? '#7fd6a0' : '#9ab0c0');
        h += row('AI execution (RMOOZ_ALLOW_SIM_RUN)', (p.allow_sim_run === true || p.llm_enabled === true) ? 'allowed' : 'disabled', (p.allow_sim_run === true || p.llm_enabled === true) ? '#7fd6a0' : '#e0a040');
        h += row('llm_called', String(!!p.llm_called), llmColor);
        h += row('llm_status', p.llm_status || '—');
        h += row('fallback_reason', p.fallback_reason || '—');
        h += row('MCP prompt pack', p.mcp_prompt_version || '—');
        h += row('commander_mode', p.commander_mode || '—', '#d8ccff');
        h += row('ai_depth', p.ai_depth || '—');
        h += row('variation_seed', (p.variation_seed != null ? p.variation_seed : '—'));
        h += row('selected family', coa.coa_family || coa.title || '—', '#d8ccff');
        h += row('lead action', (lead.action_type || '—') + ' · ' + (lead.execution_mode || '—'), '#bfe89a');
        h += row('lead unit', lead.unit_uid || '—');
        h += row('target coord', tgt);
        h += row('final coord (after anim)', finalStr, '#cfeaff');
        h += '</div></details>';
        return h;
    }
    // RMOOZ-AI-COMMANDER-FREEDOM-B + RMOOZ-AI-COA-PERFORMANCE-A: produce 5 COAs for seeds 0–4
    // (High Variation) and show whether the lead family / action / unit changed. ONE request —
    // the server builds the heavy intel/capability/tool-pack ONCE and varies only the seed /
    // buildDiverseCoas (not 5× planning), unless Deep mode re-runs the LLM per seed.
    function generate5Coas() {
        var resultEl = _panel && _panel.querySelector('[data-ff-gen5="result"]');
        var base;
        try { base = _buildLoopRequestBody(); } catch (e) { if (resultEl) resultEl.textContent = 'No scenario loaded.'; return; }
        if (!base.units || !base.units.length) { if (resultEl) resultEl.textContent = 'No movable units for the active side.'; return; }
        var deepTag = (_aiDepth === 'deep') ? ' · Deep: LLM per seed' : ' · one shared context';
        if (resultEl) resultEl.innerHTML = '<span style="color:#8fa5b8;">Planning… 5 COAs (seeds 0–4, High Variation' + esc(deepTag) + ')</span>';
        var seeds = [0, 1, 2, 3, 4];
        var body = {
            units: base.units, objectives: base.objectives,
            context: Object.assign({}, base.context, { commander_mode: 'high_variation' }),
            opts: Object.assign({}, base.opts, { commander_mode: 'high_variation', ai_depth: _aiDepth, variation_seeds: seeds }),
        };
        _fetchJsonSafe('/api/wargame-sim/free-fight/plan-coas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
            .then(function (resp) {
                if (_isRouteUnavailable(resp)) { if (resultEl) resultEl.textContent = _routeUnavailableText(resp); return; }
                var variations = arr(resp && resp.variations);
                if (!variations.length) { if (resultEl) resultEl.textContent = 'Generate-5 returned no variations.'; return; }
                var rows = variations.map(function (v, i) {
                    var coas = arr(v && v.coas);
                    var rec = coas.filter(function (c) { return c.recommended; })[0] || coas[0] || {};
                    var lead = (rec.phases && rec.phases[0] && rec.phases[0].actions && rec.phases[0].actions[0]) || {};
                    var seed = (v && v.variation_seed != null) ? v.variation_seed : ((resp.seeds && resp.seeds[i] != null) ? resp.seeds[i] : i);
                    return { seed: seed, family: rec.coa_family || rec.title || '?', action: lead.action_type || '?', unit: lead.unit_uid || '?' };
                });
                _renderGen5(rows, resultEl, resp.debug_timing, resp.shared_context, resp.ai_depth);
            })
            .catch(function () { if (resultEl) resultEl.textContent = 'Generate-5 failed (fetch error).'; });
    }
    function _renderGen5(rows, el, timing, shared, depth) {
        if (!el) return;
        rows.sort(function (a, b) { return a.seed - b.seed; });
        var fams = {}, acts = {}, units = {};
        rows.forEach(function (r) { fams[r.family] = 1; acts[r.action] = 1; units[r.unit] = 1; });
        var varied = (Object.keys(fams).length > 1) || (Object.keys(acts).length > 1) || (Object.keys(units).length > 1);
        var h = '<table data-ff-gen5="table" style="border-collapse:collapse;font-size:10px;width:100%;">' +
            '<tr style="color:#7a9ab8;"><th style="text-align:left;padding:2px 5px;">seed</th><th style="text-align:left;padding:2px 5px;">family</th><th style="text-align:left;padding:2px 5px;">lead action</th><th style="text-align:left;padding:2px 5px;">lead unit</th></tr>';
        rows.forEach(function (r) {
            h += '<tr><td style="padding:2px 5px;color:#cfeaff;">' + esc(String(r.seed)) + '</td><td style="padding:2px 5px;color:#d8ccff;">' + esc(r.family) + '</td><td style="padding:2px 5px;color:#bfe89a;">' + esc(r.action) + '</td><td style="padding:2px 5px;color:#aec0d8;">' + esc(r.unit) + '</td></tr>';
        });
        h += '</table>';
        h += '<div data-ff-gen5="verdict" style="margin-top:4px;font-weight:700;color:' + (varied ? '#7ad07a' : '#e0a040') + ';">' +
            (varied ? '✓ Variation confirmed: family / action / unit changed across seeds.' : '⚠ No variation detected across seeds.') + '</div>';
        // RMOOZ-AI-COA-PERFORMANCE-A: timing + the "one shared context, not N× planning" fact.
        if (timing) {
            h += '<div data-ff-gen5="timing" style="margin-top:3px;font-size:9px;color:#8fa5b8;line-height:1.4;">' +
                'Total: ' + esc(_fmtMs(timing.total_ms)) + ' · ' + rows.length + ' COAs' +
                (depth ? ' · depth ' + esc(depth) : '') +
                (shared ? '<br>shared context built once — capability ' + esc(_fmtMs(timing.analyze_unit_capabilities_ms)) +
                    ', tool-pack ' + esc(_fmtMs(timing.build_commander_prompt_pack_ms)) +
                    ', terrain ' + esc(_fmtMs(timing.tactical_terrain_context_ms)) +
                    ' (not ' + rows.length + '× planning)' : '') + '</div>';
        }
        el.innerHTML = h;
        try { _appendToEventLog('AI TEST: Generate 5 COAs — ' + (varied ? 'variation confirmed across seeds 0–4 (family/action/unit changed).' : 'no variation detected across seeds.') +
            (timing ? ' [total ' + _fmtMs(timing.total_ms) + (shared ? ', one shared context' : '') + ']' : '')); } catch (_) {}
    }

    // Capture original positions of every unit once, so Reset can fully restore.
    function _captureUnitsForReset() {
        _loopAllUnitsForReset = [];
        var body = _buildAiRequestBody();
        body.units.forEach(function (nu) {
            var found = _findRealUnit(nu.id);
            if (found && found.unit) {
                var u = found.unit;
                var lat = u.lat != null ? +u.lat : (Array.isArray(u.coord) ? +u.coord[1] : null);
                var lon = u.lon != null ? +u.lon : (Array.isArray(u.coord) ? +u.coord[0] : null);
                if (Number.isFinite(lat) && Number.isFinite(lon)) _loopAllUnitsForReset.push({ unit: u, origPos: { lat: lat, lon: lon } });
            }
        });
    }

    function _switchSide() { _activeSide = (_activeSide === 'RED') ? 'BLUE' : 'RED'; }

    // The core of one turn, given a fetched plan. Synchronous + testable.
    // Returns a summary record. Does NOT schedule the next turn.
    function _runTurnCore(plan, animMs) {
        if (!plan || !plan.ok || !Array.isArray(plan.coas) || !plan.coas.length) {
            return { ok: false, reason: (plan && (plan._error || plan.reason)) || 'no_plan' };
        }
        var idx = _pickRecommendedIdx(plan);
        _coaPlan = plan;
        _coaSelectedIdx = idx;
        var coa = plan.coas[idx] || {};
        var source = plan.plan_source || 'deterministic_coa_fallback';
        var sideForTurn = plan.active_side || _activeSide;
        _turnNumber += 1;
        var turnNo = _turnNumber;
        // Apply (animated or instant). The callback records moved + logs.
        _applyCoaAnimated(coa, animMs, function (moved) {
            var record = {
                turn: turnNo,
                side: sideForTurn,
                coa_id: coa.plan_id || 'COA-?',
                coa_title: coa.title || '',
                source: source,
                moved: moved.length,
                rationale: arr(coa.rationale),
                expected: arr(coa.expected_enemy_reaction),
                summary: plan.commander_assessment || '',
                // FREEFIGHT-BLUE-WARNING-ROE-A: carry the situation + BLUE reaction
                situation: plan.situation_state || null,
                warning_actions: arr(coa.warning_actions),
                // FREEFIGHT-BLUE-THREAT-AWARE-MOVEMENT-A: held = already-in-position count
                held: _coaHeldCount,
                // RMOZ-INTEL-CAPABILITY-TERRAIN-ZONE-A: shared intel snapshot
                intel: plan.intel || null,
                // RMOZ-COMMANDER-BRIEF-COALITION-A: prose commander brief + coalition posture
                brief: plan.commander_brief || null,
                // FREEFIGHT-LLM-CAPABILITY-ANALYST-A: capability summary (best assets per mission)
                capability: plan.capability_summary || null,
                // RMOZ-AI-TOOL-CONTRACT-A: tool-contract record (validated / fallback / families)
                tool_contract: plan.tool_contract || null,
            };
            // Record the recommended COA family so the next turn varies (avoid repeats).
            if (plan.intel && plan.intel.recommended_coa_family) {
                _coaFamilyHistory.push(plan.intel.recommended_coa_family);
                if (_coaFamilyHistory.length > 12) _coaFamilyHistory = _coaFamilyHistory.slice(-12);
            }
            _lastIntel = plan.intel || _lastIntel;
            _lastCapability = plan.capability_summary || _lastCapability;
            _lastToolContract = plan.tool_contract || _lastToolContract;
            _lastBrief = plan.commander_brief || _lastBrief;
            _lastCommanderDecision = record;
            _turnLog.push(record);
            var heldTail = _coaHeldCount > 0 ? (', ' + _coaHeldCount + ' already in position') : '';
            _appendToEventLog('AI Commander Turn ' + turnNo + ' (' + sideForTurn + '): ' +
                record.coa_id + ' ' + record.coa_title + ' — ' + moved.length + ' units moved' + heldTail + ' [' +
                (source === 'llm' ? 'llm' : (plan.plan_source || 'deterministic')) + ']');
            // RMOOZ-AI-COMMANDER-FREEDOM-A: explain the AI's tactical reasoning — the chosen
            // COA family + the lead unit's action, why, and the deciding factor.
            try {
                var leadAct = (coa.phases && coa.phases[0] && coa.phases[0].actions && coa.phases[0].actions[0]) || null;
                if (leadAct && leadAct.action_type) {
                    // RMOOZ-AI-COMMANDER-FREEDOM-B: mode + seed + family + lead action + why.
                    var modeTag = plan.commander_mode || _commanderMode || 'controlled';
                    var seedTag = (plan.variation_seed != null) ? plan.variation_seed : turnNo;
                    var fam = coa.coa_family ? (' family: ' + esc(coa.coa_family)) : '';
                    var why = leadAct.why_action || leadAct.reason || leadAct.behavior || '';
                    var factor = leadAct.deciding_factor ? (' · factor: ' + esc(leadAct.deciding_factor)) : '';
                    _appendToEventLog('AI REASONING [mode: ' + esc(modeTag) + ' · seed: ' + esc(String(seedTag)) + ']' +
                        fam + ' · lead: ' + esc(String(leadAct.unit_uid || '')) + ' ' + esc(String(leadAct.action_type)) +
                        (why ? ' — ' + esc(String(why)).slice(0, 150) : '') + factor + '.');
                }
            } catch (_) {}
            // FREEFIGHT-BLUE-THREAT-AWARE-MOVEMENT-A: BLUE intercept event line when BLUE
            // moves to block the RED axis (only when units actually moved).
            if (sideForTurn === 'BLUE' && /intercept|block/i.test(record.coa_title) && moved.length > 0) {
                var objNm = (plan.situation_state && plan.situation_state.objective && plan.situation_state.objective.name) || 'Objective X';
                _appendToEventLog('BLUE INTERCEPT: ' + moved.length + ' units moved to block RED axis near ' + objNm + '.');
            }
            // BLUE warning / alert event-log entries (RED intrusion). No kill logic.
            if (sideForTurn === 'BLUE' && plan.blue_reaction_intent && arr(plan.blue_reaction_intent.event_log).length) {
                plan.blue_reaction_intent.event_log.forEach(function (e) { _appendToEventLog(e); });
            }
            // RMOZ-INTEL-CAPABILITY-TERRAIN-ZONE-A: intel narration (INTEL / ROE / CAPABILITY / TERRAIN).
            if (sideForTurn === 'BLUE') _appendIntelEventLog(plan.intel);
            // FREEFIGHT-LLM-CAPABILITY-ANALYST-A: per-mission capability asset narration.
            _appendCapabilityEventLog(plan.capability_summary, sideForTurn, plan.situation_state);
            // RMOZ-AI-TOOL-CONTRACT-A: tool-contract + validator narration.
            _appendToolContractEventLog(plan.tool_contract);
            // RMOZ-COMMANDER-BRIEF-COALITION-A: coalition posture narration (COALITION ...).
            if (plan.commander_brief && plan.commander_brief.coalition_posture) {
                arr(plan.commander_brief.coalition_posture.event_log_entries).forEach(function (e) { _appendToEventLog(e); });
            }
            renderCommanderPanel();
            updatePanel();
        });
        // Switch side for the NEXT turn (simple alternation policy).
        _switchSide();
        return { ok: true, turn: turnNo, coa_id: coa.plan_id, source: source };
    }

    // Fetch a plan and run one turn. scheduleNext=true continues the loop.
    function runNextTurn(scheduleNext) {
        var w = W();
        if (_loopPaused) return;
        if (scheduleNext && !_loopRunning) return;
        if (!w || typeof w.fetch !== 'function') return;
        var body = _buildLoopRequestBody();
        _fetchJsonSafe('/api/wargame-sim/free-fight/plan-coas', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        }).then(function (plan) {
            if (_loopPaused) return;
            // Route unavailable (stub/old/wrong server) → pause the loop and show a
            // clear route message. This is NOT an LLM failure, so don't run a turn.
            if (_isRouteUnavailable(plan)) {
                _routeUnavailableMsg = _routeUnavailableText(plan);
                _appendToEventLog('AI Commander loop paused — ' + _routeUnavailableMsg);
                _loopPaused = true;
                _clearTimeoutSafe(_pendingTimer); _pendingTimer = null;
                updatePanel();
                return;
            }
            _routeUnavailableMsg = null;
            _lastLoopPlan = plan; // RMOOZ-AI-FREE-FIGHT-REAL-AI-TEST-A: the real plan the live loop received
            // RMOOZ-AI-FREE-FIGHT-AI-ONLY-A: AI-only card — a turn applies movement ONLY for a REAL
            // LLM plan (llm_called + plan_source==='llm' + llm_status ok + no fallback + provider/model
            // + not fast). A deterministic/fallback/fast plan is NEVER applied or animated here: the
            // turn is skipped and the loop pauses (it would only keep producing fallback otherwise).
            if (_aiOnlyGate && !_isRealLlmPlan(plan)) {
                // Pick the honest message from the gate state on the plan (disabled vs no-model).
                var blockMsg = (plan && (plan.allow_sim_run === false || plan.llm_enabled === false)) ? AI_EXECUTION_DISABLED_MSG : AI_NO_MODEL_MSG;
                _appendToEventLog('AI turn skipped — LLM not used' +
                    (plan && plan.fallback_reason ? ' (' + plan.fallback_reason + ')' : (plan && plan.plan_source ? ' (' + plan.plan_source + ')' : '')) + '.');
                _aiUnavailableMsg = blockMsg;
                _loopPaused = true;
                _clearTimeoutSafe(_pendingTimer); _pendingTimer = null;
                _appendToEventLog('AI Commander Free Fight paused — ' + blockMsg);
                updatePanel();
                return; // no _runTurnCore → no movement, no animation
            }
            _aiUnavailableMsg = null;
            _runTurnCore(plan, _ffSpeed().moveAnimMs);
            if (scheduleNext && _loopRunning && !_loopPaused) _scheduleNextTurn();
        }).catch(function (e) {
            // Transient network/fetch error → log and keep the loop alive on the next tick.
            _appendToEventLog('AI Commander Turn skipped — planner fetch failed: ' + ((e && e.message) || 'error'));
            if (scheduleNext && _loopRunning && !_loopPaused) _scheduleNextTurn();
        });
    }

    function _scheduleNextTurn() {
        _clearTimeoutSafe(_pendingTimer);
        _pendingTimer = _setTimeoutSafe(function () {
            _pendingTimer = null;
            if (_loopRunning && !_loopPaused) runNextTurn(true);
        }, _ffSpeed().decisionDelayMs);
    }

    // RMOOZ-AI-EXECUTION-SINGLE-GATE-A: is the AI Commander Free Fight card allowed to run? The SINGLE
    // gate is RMOOZ_ALLOW_SIM_RUN (route health allow_sim_run); then a local model must be available
    // (route health model_available); depth must not be fast. Returns a code so the caller picks the
    // right operator message (disabled vs no-model vs fast). The gate is RMOOZ_ALLOW_SIM_RUN only.
    function _freeFightAiReady() {
        if (_aiDepth === 'fast') return { ok: false, code: 'fast', reason: 'Fast mode skips the LLM — use Normal or Deep', msg: AI_FREE_FIGHT_REQUIRES_LLM };
        var rh = _routeHealth;
        if (rh && rh.ok !== false) {
            // RMOOZ-FREE-FIGHT-AI-GATE-CARD-D: combine ALL active blocks (exec gate + remote provider),
            // not just the first one, so the operator sees every reason + fix at once (req #6).
            var reasons = _aiBlockReasons(rh);
            if (reasons.length) {
                return { ok: false, code: 'disabled',
                    reason: reasons.map(function (r) { return r.code; }).join(' + '),
                    msg: reasons.map(function (r) { return r.fix; }).join('  ') };
            }
            // RMOOZ-OPENROUTER-FREE-FIGHT-CONTROL-FIX-I: use the EFFECTIVE availability (route-health
            // for local; /api/ai/models for cloud, where route-health is null) so Start is correctly
            // disabled for an unavailable cloud slug and ENABLED when the cloud slug is in the catalog.
            if (rh.allow_sim_run === true && _modelAvailableEffective() === false) return { ok: false, code: 'no_model', reason: rh.reason_if_blocked || 'no model available', msg: AI_NO_MODEL_MSG };
        }
        // RMOOZ-OPENROUTER-FREE-FIGHT-CONTROL-FIX-I: a present-but-malformed cloud key (not sk-or-…) will
        // 401 at generation — disable Start so the card's pre-flight warning and the button agree.
        if (_modelInfo && _modelInfo.key_format_ok === false) return { ok: false, code: 'bad_key', reason: 'openrouter key malformed', msg: AI_NO_MODEL_MSG };
        return { ok: true };
    }

    function startLoop() {
        if (_loopRunning && !_loopPaused) return;
        // RMOOZ-AI-FREE-FIGHT-AI-ONLY-A: do NOT start (and never run the deterministic fallback) when
        // the local AI/LLM is unavailable — show how to enable it instead of moving units.
        if (_aiOnlyGate) {
            var ready = _freeFightAiReady();
            if (!ready.ok) {
                _aiUnavailableMsg = ready.msg || AI_FREE_FIGHT_REQUIRES_LLM;
                try { _appendToEventLog('AI Commander Free Fight not started — ' + ready.reason + '. ' + _aiUnavailableMsg); } catch (_) {}
                updatePanel();
                return;
            }
        }
        _aiUnavailableMsg = null;
        if (!_loopAllUnitsForReset.length) _captureUnitsForReset();
        _loopRunning = true; _loopPaused = false;
        updatePanel();
        runNextTurn(true);
    }

    function pauseLoop() {
        _loopPaused = true;
        _clearTimeoutSafe(_pendingTimer); _pendingTimer = null;
        if (_moveAnimTimer) { _clearIntervalSafe(_moveAnimTimer); _moveAnimTimer = null; }
        updatePanel();
    }

    function stepOnce() {
        // Run exactly one turn without scheduling the next.
        // RMOOZ-AI-FREE-FIGHT-AI-ONLY-A: a single step is still AI-only — no LLM, no movement.
        if (_aiOnlyGate) {
            var ready = _freeFightAiReady();
            if (!ready.ok) {
                _aiUnavailableMsg = ready.msg || AI_FREE_FIGHT_REQUIRES_LLM;
                try { _appendToEventLog('AI Commander Free Fight step skipped — ' + ready.reason + '. ' + _aiUnavailableMsg); } catch (_) {}
                updatePanel();
                return;
            }
        }
        if (!_loopAllUnitsForReset.length) _captureUnitsForReset();
        _loopPaused = false; // allow this single turn to apply
        runNextTurn(false);
    }

    function resetLoop() {
        _loopRunning = false; _loopPaused = false; _aiUnavailableMsg = null;
        _clearTimeoutSafe(_pendingTimer); _pendingTimer = null;
        if (_moveAnimTimer) { _clearIntervalSafe(_moveAnimTimer); _moveAnimTimer = null; }
        // Restore every captured unit to its original position.
        _loopAllUnitsForReset.forEach(function (rec) {
            if (!rec || !rec.unit || !rec.origPos) return;
            rec.unit.lat = rec.origPos.lat; rec.unit.lon = rec.origPos.lon;
            if (Array.isArray(rec.unit.coord) && rec.unit.coord.length >= 2) {
                rec.unit.coord[0] = rec.origPos.lon; rec.unit.coord[1] = rec.origPos.lat;
            }
            rec.unit._ff_coa_moved_by_ai = false;
        });
        _loopAllUnitsForReset = [];
        _turnNumber = 0; _activeSide = 'RED';
        _turnLog = []; _lastCommanderDecision = null; _coaFamilyHistory = []; _lastIntel = null; _lastBrief = null; _briefExpanded = false; _lastCapability = null; _lastToolContract = null;
        _coaMovedUnits = []; _coaApplied = false; _coaPlan = null;
        if (mapReady()) { _triggerScenarioRedraw(); syncMarkers(); }
        if (_cmdrPanel && _cmdrPanel.parentNode) { _cmdrPanel.parentNode.removeChild(_cmdrPanel); _cmdrPanel = null; }
        updatePanel();
    }

    function setFreeFightSpeed(sp) {
        if (FF_SPEEDS[sp]) { _freeFightSpeed = sp; }
        // If running, re-arm the next-turn timer with the new cadence.
        if (_loopRunning && !_loopPaused && _pendingTimer != null) { _scheduleNextTurn(); }
        updatePanel();
    }

    // RMOOZ-AI-COMMANDER-REPAIR-LOOP-A: the demo-facing "AI Planning Trace" — Input understood →
    // AI reasoning → Validation — plus a clear AI Commander / Staff-Safe mode badge. Renders ONLY
    // real server data (plan.planning_trace); nothing when absent (older server). The Staff-Safe badge
    // + the why-not-AI note keep it honest (deterministic plans are never dressed as AI).
    // ── RMOOZ-AI-FREE-FIGHT-UX-PROOF-A: operator-facing proof blocks ─────────────
    // These CONSOLIDATE data RMOOZ already produces (route health, candidate pre-filter,
    // COA actions, moved-unit records, non_selected_units) into clearly-labelled blocks so
    // an operator/demo can understand what happened WITHOUT reading server logs. No planner
    // logic changes — pure rendering of existing fields.

    // Resolve an operator label for a unit uid (display name + code + country + location)
    // from the real scenario unit via the shared identity contract.
    function _aiUnitLabel(uid) {
        var out = { name: String(uid == null ? '?' : uid), code: String(uid == null ? '?' : uid), country: '', loc: '' };
        var fr = _findRealUnit(uid); var u = fr && fr.unit; if (!u) return out;
        var w = W();
        var ident = (w && w.RmoozUnitIdentity && w.RmoozUnitIdentity.unitIdentityForLlm) ? w.RmoozUnitIdentity.unitIdentityForLlm(u, { side: u.side }) : null;
        out.name = (ident && ident.display_name) || u.name || u.label || u.platform || out.code;
        out.country = u.country || u.nation || '';
        var lat = (u.lat != null) ? u.lat : (Array.isArray(u.coord) ? u.coord[1] : null);
        var lon = (u.lon != null) ? u.lon : (Array.isArray(u.coord) ? u.coord[0] : null);
        if (lat != null && lon != null && Number.isFinite(+lat) && Number.isFinite(+lon)) out.loc = (+lat).toFixed(3) + ',' + (+lon).toFixed(3);
        return out;
    }

    // 1) AI Readiness — gate / provider / selected model / model available, then (after a
    //    plan) plan source + LLM status. Reuses _aiGateStatusHtml (gate-card-d) for the gate
    //    signals + fixes, then appends the post-generation result.
    function _aiReadinessHtml(plan) {
        var rh = _routeHealth;
        var h = '<div data-ff-coa="ai-readiness" style="margin:2px 0 7px;padding:7px 9px;border:1px solid #25455f;border-radius:5px;background:#0a1622;">';
        h += '<div style="font-weight:700;font-size:11px;color:#9ec2ec;margin-bottom:4px;">🛰 AI Readiness — جاهزية الذكاء الاصطناعي</div>';
        var gate = _aiGateStatusHtml();
        if (gate) h += gate;
        else h += '<div style="font-size:10px;color:#8fa5b8;">Route health unknown — click "Check route" to probe the gate.</div>';
        // Selected model (explicit row) + post-generation result.
        function row(k, v, c) { return '<div style="font-size:10px;"><span style="color:#7a9ab8;">' + esc(k) + ':</span> <span style="color:' + (c || '#cdd8e4') + ';font-weight:600;">' + esc(v == null || v === '' ? '—' : String(v)) + '</span></div>'; }
        h += '<div style="margin-top:4px;border-top:1px solid #16324a;padding-top:4px;">';
        h += row('Selected model', (rh && rh.model) || (plan && plan.model_used) || '—');
        if (plan && plan.ok) {
            var isLlm = plan.plan_source === 'llm';
            h += row('Plan source (after generation)', plan.plan_source || 'deterministic_coa_fallback', isLlm ? '#90d090' : '#e0a93a');
            h += row('LLM status', (plan.llm_status || (plan.llm_called ? 'called' : 'not called')) + (plan.fallback_reason ? ' · ' + plan.fallback_reason : ''), isLlm ? '#90d090' : '#e0a93a');
            h += '<div data-ff-coa="readiness-verdict" style="margin-top:3px;font-size:10px;font-weight:700;color:' + (isLlm ? '#7fd6a0' : '#e0a93a') + ';">' +
                (isLlm ? '✅ Movement came from the local LLM (plan_source=llm).' : '⚠ Deterministic plan — the LLM did not produce this (not "AI").') + '</div>';
            // RMOOZ-OPENROUTER-FREE-FIGHT-CONTROL-FIX-I (#16): an auth/401 in the fallback reason means
            // the cloud key was rejected or not sent — say so plainly with the fix.
            if (/\b401\b|missing auth|authentication|no auth|unauthor/i.test(String(plan.fallback_reason || '') + ' ' + String(plan.llm_status || ''))) {
                h += '<div data-ff-coa="readiness-auth-error" style="margin-top:3px;font-size:10px;color:#f0b0b0;">⚠ OpenRouter rejected the request (HTTP 401) — the API key is invalid or was not sent. Rotate/reload the key and restart the server.</div>';
            }
        } else {
            h += row('Plan source (after generation)', 'not generated yet', '#8fa5b8');
        }
        h += '</div></div>';
        return h;
    }

    // 2) AI Candidate Filter — "the AI saw only X of Y units" + exclusions + top reasons.
    //    Shown before generation (explainer) and after (real numbers from planning_trace).
    function _aiCandidateFilterHtml(plan) {
        var cand = plan && plan.planning_trace && plan.planning_trace.input_understood && plan.planning_trace.input_understood.candidates;
        var h = '<div data-ff-coa="ai-candidate-filter" style="margin:2px 0 7px;padding:7px 9px;border:1px solid #3a4a5f;border-radius:5px;background:#0c141d;">';
        h += '<div style="font-weight:700;font-size:11px;color:#9ec2ec;margin-bottom:3px;">🎯 AI Candidate Filter — تصفية الوحدات</div>';
        if (cand && cand.applied) {
            h += '<div data-ff-coa="cand-counts" style="font-size:10.5px;color:#cdd8e4;">Candidate units sent to AI: <b style="color:#7fd6a0;">' + (cand.sent || 0) + '</b> / total <b style="color:#e0e8f0;">' + (cand.total || 0) + '</b> · Excluded units: <b style="color:#e0c060;">' + (cand.excluded || 0) + '</b></div>';
            var tx = arr(cand.top_exclusions);
            if (tx.length) {
                h += '<div style="font-size:9.5px;color:#7a9ab8;margin-top:3px;">Top exclusion reasons:</div><ul style="margin:1px 0 0;padding-left:16px;">';
                tx.forEach(function (x) { h += '<li style="font-size:9.5px;color:#9ab0c0;">' + (x.count || 0) + ' — ' + esc(x.label || x.reason || 'excluded') + '</li>'; });
                h += '</ul>';
            }
            h += '<div data-ff-coa="cand-proof" style="font-size:9.5px;color:#5a8a6a;margin-top:3px;">Proof: the AI reasoned over only ' + (cand.sent || 0) + ' of ' + (cand.total || 0) + ' units (the rest were pre-filtered as far / out-of-reach / different-country / low-relevance).</div>';
        } else if (cand && cand.total) {
            h += '<div data-ff-coa="cand-counts" style="font-size:10.5px;color:#cdd8e4;">All <b style="color:#e0e8f0;">' + cand.total + '</b> units sent to AI (force is below the pre-filter size — no exclusions).</div>';
        } else {
            h += '<div data-ff-coa="cand-preview" style="font-size:10px;color:#8fa5b8;">Before generation: the candidate pre-filter sends only the most relevant units (top ~10–25) of the active-side force to the AI; the rest are excluded as out-of-reach / different-country-zone / far-from-objective / not-relevant-role. The real X / Y appears here after you generate.</div>';
        }
        h += '</div>';
        return h;
    }

    // RMOOZ-SELECTED-UNITS-REMOVE: the "AI Selected Units (N)" per-unit roster (UX-PROOF-A block 3)
    // was removed at owner request — surfacing "AI moved N units" as a long list is noise, not
    // commander insight. The COA cards, AI Planning Trace, and the map markers already convey what
    // the AI did. The Candidate Filter (how many units the AI reasoned over) and the collapsed
    // Non-Selected Units block remain.

    // 4) AI Non-Selected Units — the units the AI deliberately did NOT move + why. Collapsed.
    function _aiNonSelectedUnitsHtml(plan) {
        var coas = arr(plan && plan.coas); if (!coas.length) return '';
        var coa = coas[(_coaSelectedIdx >= 0 && _coaSelectedIdx < coas.length) ? _coaSelectedIdx : 0] || {};
        var ns = arr(coa.non_selected_units);
        if (!ns.length) return '';
        var h = '<details data-ff-coa="ai-non-selected" style="margin:2px 0 7px;">';
        h += '<summary style="cursor:pointer;font-size:11px;font-weight:700;color:#cdb86a;">⊘ AI Non-Selected Units (' + ns.length + ') — وحدات لم تتحرك (انقر للتوسيع)</summary>';
        h += '<div style="margin-top:3px;padding:6px 8px;border:1px solid #4a4020;border-radius:4px;background:#16130a;">';
        h += '<div style="font-size:9.5px;color:#8a9aa8;margin-bottom:2px;">Why the AI held these candidates back:</div>';
        ns.forEach(function (n) {
            var lbl = _aiUnitLabel(n && n.unit_uid);
            h += '<div data-ff-coa="nonsel-unit" style="font-size:9.5px;color:#cdd8e4;margin-bottom:1px;">• ' + esc(lbl.name) + ' <span style="color:#7a9ab8;">(' + esc(lbl.code) + ')</span>' + ((n && n.reason) ? ': ' + esc(n.reason) : '') + '</div>';
        });
        h += '</div></details>';
        return h;
    }

    function renderPlanningTraceHtml(plan) {
        var t = plan && plan.planning_trace;
        if (!t) return '';
        function row(ok, label) {
            return '<div style="font-size:10px;color:' + (ok ? '#90d090' : '#e0a93a') + ';margin-bottom:1px;">' + (ok ? '✓' : '•') + ' ' + esc(label) + '</div>';
        }
        var iu = t.input_understood || {}, rc = iu.role_counts || {}, en = iu.enemy_assessment || {}, v = t.validation || {};
        var isCmd = t.mode === 'ai_commander';
        var modeColor = isCmd ? '#7fd6a0' : '#e0c060';
        var modeBorder = isCmd ? '#2e7d54' : '#6a5a20';
        var modeBg = isCmd ? '#0f2418' : '#241f08';
        var modeLabel = isCmd ? 'AI Commander Mode — وضع القائد بالذكاء الاصطناعي'
                              : 'Staff-Safe Mode — الوضع الآمن (تخطيط حتمي)';
        var h = '<div data-ff-coa="planning-trace" data-ff-mode="' + (isCmd ? 'ai_commander' : 'staff_safe') + '" style="margin:2px 0 7px;padding:7px 9px;border:1px solid ' + modeBorder + ';border-radius:5px;background:' + modeBg + ';">';
        h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;gap:6px;">' +
            '<span style="font-weight:700;font-size:11px;color:' + modeColor + ';">' + (isCmd ? '🧠 ' : '🛡 ') + esc(modeLabel) + '</span>' +
            (t.model_used ? '<span style="font-size:9px;color:#7a9ab8;white-space:nowrap;">' + esc(t.provider_used || '') + ' · ' + esc(t.model_used) + '</span>' : '') +
            '</div>';
        // 1) Input understood
        h += '<div style="font-weight:700;font-size:10px;color:#9ec2ec;margin:3px 0 2px;">Input understood — الإدخال مفهوم</div>';
        h += row(true, (iu.total_units || 0) + ' units analyzed');
        // RMOOZ-AI-FREE-FIGHT-CANDIDATE-PREFILTER-A: how many of the force were sent to the AI.
        var cand = iu.candidates;
        if (cand && cand.applied) {
            h += row(true, 'Candidate units sent to AI: ' + cand.sent + ' / ' + cand.total +
                '  ·  excluded far/not-relevant: ' + cand.excluded);
            arr(cand.top_exclusions).forEach(function (x) {
                h += '<div style="font-size:9px;color:#8a9aa8;margin-left:12px;">— excluded ' + (x.count || 0) + ': ' + esc(x.label || '') + '</div>';
            });
        } else if (cand && cand.total) {
            h += row(true, 'All ' + cand.total + ' units sent to AI (force is below the pre-filter size)');
        }
        var rcParts = ['maneuver', 'fires', 'air_defense', 'recon', 'support']
            .filter(function (k) { return rc[k]; })
            .map(function (k) { return rc[k] + ' ' + k.replace('_', '-'); });
        if (rcParts.length) h += row(true, 'Force (' + esc(iu.active_side || '') + '): ' + rcParts.join(' · '));
        if (en && en.total) h += row(true, 'Enemy (' + esc(en.side || '') + '): ' + (en.air_defense || 0) + ' air-defense · ' + (en.armor || 0) + ' armor · ' + (en.recon || 0) + ' recon');
        h += row(true, (iu.objectives || 0) + ' objective(s) prioritized');
        if (iu.terrain_class) h += row(true, 'Terrain: ' + esc(iu.terrain_class) + ' (' + esc(iu.terrain_provenance || 'inferred') + ')');
        if (iu.alert_state || iu.roe_state) h += row(true, 'Posture: alert ' + esc(iu.alert_state || '—') + ' · ROE ' + esc(iu.roe_state || '—'));
        // 2) AI reasoning
        var rs = arr(t.reasoning);
        if (rs.length) {
            h += '<div style="font-weight:700;font-size:10px;color:#9ec2ec;margin:5px 0 2px;">AI reasoning — تفسير الذكاء الاصطناعي</div>';
            rs.forEach(function (c) {
                h += '<div style="font-size:10px;color:#cdd8e4;margin-bottom:1px;">' + (c.recommended ? '★ ' : '• ') + esc(c.plan_id || '') + (c.title ? ' (' + esc(c.title) + ')' : '') + (c.why ? ': ' + esc(c.why) : '') + '</div>';
                arr(c.rejected_units).slice(0, 3).forEach(function (ru) {
                    h += '<div style="font-size:9px;color:#8a9aa8;margin-left:12px;">— not used: ' + esc(ru.unit_uid || '') + (ru.reason ? ' (' + esc(ru.reason) + ')' : '') + '</div>';
                });
            });
        }
        // 3) Validation
        h += '<div style="font-weight:700;font-size:10px;color:#9ec2ec;margin:5px 0 2px;">Validation — التحقق</div>';
        h += row(v.unit_ids_valid !== false, 'All unit IDs valid');
        h += row(v.actions_matched !== false, 'All actions matched to real units');
        h += row(v.kill_actions_blocked !== false, 'Kill/engage actions blocked');
        h += row(v.within_bounds !== false, 'Targets within map bounds (no teleport)');
        if (v.repaired) h += row(true, 'Repaired ' + (v.repaired_count || 1) + ' invalid reference(s) — AI revised after staff validation');
        h += row((v.valid_coa_count || 0) > 0, (v.valid_coa_count || 0) + ' valid COA(s) generated');
        if (!isCmd && (plan.fallback_message || plan.fallback_reason)) {
            h += '<div style="font-size:9px;color:#cdb86a;margin-top:4px;">' + esc(plan.fallback_message || ('AI did not run: ' + plan.fallback_reason)) + '</div>';
        }
        h += '</div>';
        return h;
    }
    function renderCoaPlanHtml() {
        var h = '';
        // FREEFIGHT-COA-COMMANDER-NARRATIVE-A: render a bullet list
        function bullets(list, color) {
            var a = arr(list);
            if (!a.length) return '';
            return '<ul style="margin:2px 0 0;padding-left:16px;">' +
                a.map(function (b) { return '<li style="color:' + (color || '#cdd8e4') + ';margin-bottom:1px;">' + esc(b) + '</li>'; }).join('') +
                '</ul>';
        }
        // Role breakdown one-liner from a COA's role_breakdown map (server-provided)
        function roleLine(coa) {
            var rb = coa && coa.role_breakdown;
            if (!rb) return '';
            var parts = _orderedRoleKeys(rb)
                .map(function (r) { return '<span style="color:#e0e8f0;">' + rb[r] + '</span> ' + r; });
            return parts.length ? parts.join(' · ') : '';
        }
        if (_coaLoading) {
            // RMOOZ-AI-COMMANDER-REPAIR-LOOP-A: a live "AI Planning Trace" while the local model thinks.
            // Honest in-progress (no fake token streaming); the elapsed timer ticks via _coaLoadingTimer.
            var _elapsed = _coaLoadingStart ? Math.max(0, Math.round((Date.now() - _coaLoadingStart) / 1000)) : 0;
            var _hdr = (_planningMode === 'staff_safe') ? '🛡 Staff-Safe planner working…' : '🧠 AI Commander reasoning…';
            h += '<div data-ff-coa="planning-inflight" style="padding:8px 9px;border:1px solid #2e5d7d;border-radius:5px;background:#0a1622;">';
            h += '<div style="font-weight:700;font-size:11px;color:#9ec2ec;">' + _hdr + ' <span style="color:#7fd6a0;">' + _elapsed + 's</span></div>';
            h += '<div style="font-size:9px;color:#6a8fa8;margin:2px 0 5px;">' + esc(FF_AI_DEPTHS[_aiDepth] ? FF_AI_DEPTHS[_aiDepth].label : _aiDepth) + ' · ' + esc(FF_COMMANDER_MODES[_commanderMode] ? FF_COMMANDER_MODES[_commanderMode].label : _commanderMode) + ' · local model</div>';
            ['Reading OOB, capability & terrain', 'Drafting courses of action', 'Validating against real units', 'Repairing invalid references'].forEach(function (s, i) {
                h += '<div style="font-size:10px;color:#8a9aa8;margin-bottom:1px;">' + (i === 0 ? '◐' : '○') + ' ' + esc(s) + '</div>';
            });
            h += '<div style="font-size:9px;color:#5a7a90;margin-top:4px;">Local LLM on this hardware can take 1–3 minutes — the commander is thinking. التخطيط جارٍ</div>';
            h += '</div>';
            return h;
        }
        if (!_coaPlan) {
            // RMOOZ-AI-FREE-FIGHT-UX-PROOF-A: show Readiness + the Candidate-Filter explainer BEFORE
            // generation so the operator knows the gate state and that the AI sees a filtered subset.
            h += _aiReadinessHtml(null);
            h += _aiCandidateFilterHtml(null);
            // COA cards shown after generation — typical COAs: Direct Assault, Flank / Fix, Probe / Recon
            h += '<div style="color:#7a9ab8;font-size:11px;padding:4px 0;">Click "Generate AI Attack Plan" to generate COAs for all RED units.<br>' +
                 '<span style="color:#5a7a60;font-size:10px;">Typical plans: Direct Assault · Flank / Fix · Probe / Recon</span></div>';
            return h;
        }
        if (_coaPlan._route_unavailable) {
            // Route problem — explicitly NOT an LLM failure.
            h += '<div data-ff-coa="route-unavailable" style="color:#f0b0b0;font-size:11px;padding:6px 8px;border:1px solid #7a3030;border-radius:4px;background:#241414;line-height:1.4;">⚠ ' + esc(_coaPlan._error || _routeUnavailableText(_coaPlan)) + '</div>';
            return h;
        }
        if (_coaPlan._error || !_coaPlan.ok) {
            h += '<div style="color:#e0a93a;font-size:11px;padding:4px;">Error: ' + esc(_coaPlan._error || _coaPlan.reason || 'unknown error') + '</div>';
            return h;
        }
        // RMOOZ-AI-ATTACK-PLAN-AI-ONLY-A: the manual "Generate AI Attack Plan" page presents ONLY
        // real LLM results. If this plan came from that button and is not a real LLM plan (LLM off
        // / timeout / unavailable / fast mode / deterministic fallback / provider missing), render
        // NOTHING but the honest message + diagnostics — no cards, no score numbers, no stale
        // values, no fallback dressed as AI. (The loop / Generate-5 are separate flows, untouched.)
        // RMOOZ-AI-COMMANDER-REPAIR-LOOP-A: the ONE exception is an EXPLICITLY-chosen Staff-Safe plan
        // (planning_mode='staff_safe', echoed by the server) — a deliberate, clearly-badged
        // deterministic mode whose COAs ARE shown (honestly labeled, not "AI"). A Commander-mode
        // deterministic/auto-fallback is NOT exempt: it still hits the AI-only honesty gate even when
        // it carries COAs. (Gating on "no coas at all" let Commander-mode fallbacks through dressed as
        // a plan and broke the AI-only spec — RMOOZ-AI-ATTACK-PLAN-AI-ONLY-A.)
        var _explicitStaffSafe = String(_coaPlan.planning_mode || '').toLowerCase() === 'staff_safe';
        if (_coaPlan._requestedVia === 'manual_generate' && !_isRealLlmPlan(_coaPlan) && !_explicitStaffSafe) {
            h += _aiOnlyGateHtml(_coaPlan);
            return h;
        }
        var coas = _coaPlan.coas || [];
        // Plan source banner
        var srcColor = _coaPlan.plan_source === 'llm' ? '#90d090' : '#9ab0c0';
        h += '<div style="margin-bottom:5px;font-size:10px;">' +
             '<span style="color:#7a9ab8;">Plan source:</span> <span style="color:' + srcColor + ';">' + esc(_coaPlan.plan_source || 'deterministic_coa_fallback') + '</span>';
        if (_coaPlan.fallback_reason) h += ' <span style="color:#e0a93a;font-size:9px;">(' + esc(_coaPlan.fallback_reason) + ')</span>';
        if (_coaPlan.ai_depth) h += ' <span style="color:#7a9ab8;font-size:9px;">· depth ' + esc(_coaPlan.ai_depth) + '</span>';
        h += '</div>';
        // RMOOZ-AI-FREE-FIGHT-UX-PROOF-A: lead with the operator-facing proof blocks (Readiness →
        // Candidate Filter → Non-Selected), then the existing detail (trace/cards/debug).
        // RMOOZ-SELECTED-UNITS-REMOVE: the per-unit "AI Selected Units (N)" roster was removed at
        // owner request — a long "AI moved N units" list is noise, not commander insight. The COA
        // cards + AI Planning Trace + the map already show what the AI did.
        h += _aiReadinessHtml(_coaPlan);
        h += _aiCandidateFilterHtml(_coaPlan);
        h += _aiNonSelectedUnitsHtml(_coaPlan);
        // RMOOZ-AI-COMMANDER-REPAIR-LOOP-A: the demo-facing "AI Planning Trace" (Input understood →
        // AI reasoning → Validation) + the AI Commander / Staff-Safe mode badge.
        h += renderPlanningTraceHtml(_coaPlan);
        // RMOOZ-AI-COA-PERFORMANCE-A: honest message when the LLM was slow/unavailable.
        if (_coaPlan.fallback_message) {
            h += '<div data-ff-coa="fallback-msg" style="margin-bottom:5px;font-size:10px;color:#e0c060;padding:4px 7px;border:1px solid #6a5a20;border-radius:4px;background:#1f1a08;">⏱ ' + esc(_coaPlan.fallback_message) + '</div>';
        }
        // RMOOZ-AI-MOVEMENT-EXECUTION-AUDIT-A: state plainly whether the LLM actually ran.
        h += _planSourceNoteHtml(_coaPlan);
        // RMOOZ-AI-COA-PERFORMANCE-A: stage timings (AI total / LLM / capability / terrain / COA build).
        h += _coaTimingHtml(_coaPlan.debug_timing, _coaPlan);
        // RMOOZ-AI-MOVEMENT-EXECUTION-AUDIT-A: per-COA movement-execution debug overlay.
        h += _coaDebugHtml();
        // RMOOZ-AI-ATTACK-PLAN-MCP-PROMPT-A: "View MCP Prompt" on the real-LLM render too.
        h += _mcpPromptHtml(_coaPlan);
        // FREEFIGHT-COA-COMMANDER-NARRATIVE-A: Commander assessment banner. Honest labeling —
        // only an LLM plan is "AI"; a deterministic plan is the tactical planner (LLM not used).
        if (_coaPlan.commander_assessment || _coaPlan.recommended_plan_id) {
            var _isLlmPlan = _coaPlan.plan_source === 'llm';
            var _assessTitle = _isLlmPlan ? 'Commander AI Assessment — تقدير القائد' : 'Tactical Planner Assessment — تقدير المخطط (deterministic — LLM not used)';
            h += '<div data-ff-coa="assessment" style="margin-bottom:6px;padding:6px 9px;border:1px solid ' + (_isLlmPlan ? '#2e5d7d' : '#5a4f20') + ';border-radius:5px;background:' + (_isLlmPlan ? '#0a1622' : '#1a1708') + ';">';
            h += '<div style="font-weight:700;font-size:11px;color:' + (_isLlmPlan ? '#9ec2ec' : '#cdb86a') + ';margin-bottom:3px;">' + _assessTitle + '</div>';
            if (_coaPlan.commander_assessment) {
                h += '<div style="font-size:10px;color:#cdd8e4;line-height:1.4;">' + esc(_coaPlan.commander_assessment) + '</div>';
            }
            if (_coaPlan.recommended_plan_id) {
                h += '<div style="margin-top:3px;font-size:10.5px;"><span style="color:#7a9ab8;">Recommended:</span> <span style="color:#7fd6a0;font-weight:700;">' + esc(_coaPlan.recommended_plan_id) + '</span></div>';
            }
            h += '</div>';
        }
        // FREEFIGHT-BLUE-WARNING-ROE-A: BLUE Warning / ROE block on the COA card when BLUE is acting
        if (_coaPlan.active_side === 'BLUE' && _coaPlan.situation_state) {
            var roeActs = (_coaPlan.blue_reaction_intent && _coaPlan.blue_reaction_intent.warning_actions) || [];
            h += _blueWarningRoeHtml(_coaPlan.situation_state, roeActs);
        }
        // COA cards
        coas.forEach(function (coa, ci) {
            var isSelected = (ci === _coaSelectedIdx);
            var riskColor = coa.risk === 'high' ? '#f08080' : (coa.risk === 'medium' ? '#e0c060' : '#90d090');
            var selBorder = isSelected ? '#4a9ed6' : '#2a3f55';
            var selBg     = isSelected ? '#0a1830' : '#0c141d';
            h += '<div data-act="select-coa-' + ci + '" style="margin-bottom:6px;padding:7px 9px;border:1px solid ' + selBorder + ';border-radius:5px;background:' + selBg + ';cursor:pointer;">';
            h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;">';
            h += '<span style="font-weight:700;font-size:11px;color:#e8eaed;">' + esc(coa.plan_id) + ' — ' + esc(coa.title) + '</span>';
            // RMOOZ-COA-RANKING-WITH-ADVISORY-U: the badge follows the RANKING recommendation when present
            // (so the badge, "Recommended because", and the default selection all agree); else the planner flag.
            var _isRankRec = (typeof _coaPlan._ranking_recommended_idx === 'number') ? (ci === _coaPlan._ranking_recommended_idx) : !!coa.recommended;
            if (_isRankRec) h += '<span style="background:#1a5030;color:#7fd6a0;border-radius:3px;padding:1px 5px;font-size:9px;">Recommended</span>';
            h += '</div>';
            h += '<div style="font-size:10px;margin-bottom:3px;">' +
                 '<span style="color:#8fa5b8;">Risk:</span> <span style="color:' + riskColor + ';">' + esc(coa.risk) + '</span> · ' +
                 '<span style="color:#8fa5b8;">Confidence:</span> <span style="color:#9ec2ec;">' + esc(coa.confidence) + '</span> · ' +
                 '<span style="color:#8fa5b8;">Units:</span> <span style="color:#e0e8f0;">' + (coa.units_selected_count || 0) + '/' + (coa.units_total_considered || 0) + '</span></div>';
            // RMOOZ-COA-RANKING-WITH-ADVISORY-U: per-COA score breakdown + advisory note + recommendation reason.
            if (coa._ranking) {
                var rk = coa._ranking;
                h += '<div data-ff-coa="ranking" style="font-size:9.5px;color:#9ab0c0;margin-bottom:2px;">Score: <b style="color:#cfe6ff;">' + rk.final_score + '</b> = base ' + rk.base_score + ' + tac ' + rk.tactical_score +
                     (rk.readiness_score ? ' + rdy ' + rk.readiness_score : '') + (rk.terrain_score ? ' + terr ' + rk.terrain_score : '') +
                     (rk.green_advisory_delta ? ' <span style="color:#e0a93a;">' + (rk.green_advisory_delta < 0 ? '' : '+') + rk.green_advisory_delta + ' green</span>' : '') + '</div>';
                if (rk.green_advisory_delta < 0) h += '<div data-ff-coa="ranking-advisory" style="font-size:9px;color:#e0a93a;margin-bottom:2px;">⚖ Green/White advisory affected ranking (' + rk.green_advisory_delta + ')</div>';
                if (ci === _coaPlan._ranking_recommended_idx) h += '<div data-ff-coa="ranking-reason" style="font-size:9px;color:#7fd6a0;margin-bottom:2px;">Recommended because: ' + esc(rk.ranking_reason) + '</div>';
            }
            if (coa.summary) h += '<div style="font-size:10px;color:#cdd8e4;margin-bottom:3px;font-style:italic;">' + esc(coa.summary) + '</div>';
            // Role breakdown one-liner (server-provided role_breakdown)
            var rl = roleLine(coa);
            if (rl) h += '<div style="font-size:10px;color:#9ab0c0;margin-bottom:2px;">Force: ' + rl + '</div>';
            // Phase actions summary
            (coa.phases || []).forEach(function (ph) {
                var roleCounts = {};
                (ph.actions || []).forEach(function (act) { var r = act.role || 'unknown'; roleCounts[r] = (roleCounts[r] || 0) + 1; });
                var roleStr = Object.keys(roleCounts).map(function (r) { return roleCounts[r] + ' ' + r; }).join(', ');
                if (roleStr) h += '<div style="font-size:10px;color:#9ab0c0;">Phase: ' + esc(ph.name || ph.phase_id) + ' — ' + roleStr + '</div>';
            });
            if (isSelected) h += '<div style="margin-top:3px;font-size:10px;color:#4a9ed6;font-weight:700;">▶ Selected</div>';
            h += '</div>';
        });
        // FREEFIGHT-COA-COMMANDER-NARRATIVE-A: detailed commander decision for the SELECTED COA
        var selCoa = coas[_coaSelectedIdx] || coas[0];
        if (selCoa) {
            var srb = selCoa.role_breakdown || {};
            h += '<div data-ff-coa="commander-decision" style="margin-top:4px;margin-bottom:4px;padding:7px 9px;border:1px solid #2a4d6a;border-radius:5px;background:#08131e;">';
            h += '<div style="font-weight:700;font-size:11px;color:#9ec2ec;margin-bottom:3px;">' +
                 esc(selCoa.plan_id || '') + ' — Commander Decision</div>';
            // Why
            h += '<div style="font-size:10px;color:#7a9ab8;font-weight:600;margin-top:2px;">Why:</div>';
            h += bullets(selCoa.rationale, '#cdd8e4');
            // Units (RED attack + BLUE defense roles)
            var unitLines = _orderedRoleKeys(srb)
                .map(function (r) { return r.charAt(0).toUpperCase() + r.slice(1) + ': ' + srb[r]; });
            h += '<div style="font-size:10px;color:#7a9ab8;font-weight:600;margin-top:3px;">Units:</div>';
            h += bullets(unitLines, '#e0e8f0');
            // Expected enemy reaction (PREVIEW — not simulated)
            h += '<div style="font-size:10px;color:#7a9ab8;font-weight:600;margin-top:3px;">Likely enemy reaction <span style="color:#8a6a3a;font-weight:400;">(preview — not yet simulated)</span>:</div>';
            h += bullets(selCoa.expected_enemy_reaction, '#d8c08a');
            h += '</div>';
        }
        // Applied status
        if (_coaApplied) {
            h += '<div style="margin-top:5px;border:1px solid #1a4050;border-radius:4px;padding:6px 8px;background:#070e14;font-size:10px;" data-ff-truth="coa-status">';
            h += '<div style="color:#5a8aa8;font-weight:600;margin-bottom:3px;">Map Movement Truth</div>';
            function flag(val) { return val ? '<span style="color:#90d090;font-weight:700;">yes</span>' : '<span style="color:#e0a93a;font-weight:700;">no</span>'; }
            h += '<div>Real units updated: ' + flag(_coaMovedUnits.length > 0) + '</div>';
            h += '<div>Units moved: <span style="color:#e0e8f0;">' + _coaMovedUnits.length + '</span></div>';
            var visibleOverlay = mapReady() && _coaMovedUnits.length > 0;
            h += '<div>Visible movement layer: ' + flag(visibleOverlay) + '</div>';
            h += '</div>';
        }
        return h;
    }
    // ── end FREEFIGHT-AI-COA-PLANNER-A ────────────────────────────────────────

    // FREEFIGHT-AI-CONTINUOUS-COMMANDER-LOOP-A: the continuous AI commander control block.
    function renderCommanderLoopHtml() {
        var h = '';
        h += '<div data-ff-loop="panel" style="margin-bottom:8px;padding:7px 9px;border:1px solid #2e5d7d;border-radius:5px;background:#0a1420;">';
        h += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">' +
             '<span style="font-size:10px;font-weight:700;color:#04121e;background:#5ab0e0;border-radius:3px;padding:1px 6px;letter-spacing:.5px;">AI COMMANDER</span>' +
             '<span style="font-size:11px;font-weight:700;color:#9ec2ec;">AI Commander Free Fight — القتال الحر بقيادة الذكاء الاصطناعي</span></div>';
        var runState = _loopRunning ? (_loopPaused ? 'Paused' : 'Running') : 'Stopped';
        var runColor = _loopRunning ? (_loopPaused ? '#e0c060' : '#7fd6a0') : '#9ab0c0';
        var sideColor = _activeSide === 'BLUE' ? '#7fb0ff' : '#f0a0a0';
        h += '<div style="font-size:10.5px;color:#cdd8e4;line-height:1.5;">';
        h += '<span style="color:#8fa5b8;">Status:</span> <span style="color:' + runColor + ';font-weight:700;">' + esc(runState) + '</span>';
        h += ' · <span style="color:#8fa5b8;">Turn:</span> <span style="color:#e0e8f0;font-weight:700;">' + _turnNumber + '</span>';
        h += ' · <span style="color:#8fa5b8;">Active side:</span> <span style="color:' + sideColor + ';font-weight:700;">' + esc(_activeSide) + '</span>';
        h += '</div>';
        if (_lastCommanderDecision) {
            var d = _lastCommanderDecision;
            var dSrcColor = d.source === 'llm' ? '#90d090' : '#9ab0c0';
            h += '<div style="font-size:10.5px;color:#cdd8e4;margin-top:2px;">' +
                 '<span style="color:#8fa5b8;">Last decision source:</span> <span style="color:' + dSrcColor + ';">' + esc(d.source) + '</span></div>';
            h += '<div style="font-size:10.5px;color:#cdd8e4;">' +
                 '<span style="color:#8fa5b8;">Last action:</span> <span style="color:#e0e8f0;">' + esc(d.coa_id) + ' ' + esc(d.coa_title) + ' — ' + d.moved + ' units moved</span></div>';
        }
        // RMOOZ-AI-USER-FRIENDLY-MODEL-FLOW-A: the simple operator surface — AI Model · Status ·
        // "Select AI Model". The technical signals (execution gate, raw provider, model_available,
        // plan_source, route probe, raw dropdown) move into the collapsed Advanced diagnostics so the
        // everyday flow is just "Choose model → Ready → Start AI Free Fight". The single execution
        // gate (RMOOZ_ALLOW_SIM_RUN) and local-only policy are unchanged — only their presentation.
        h += _modelFlowHtml();
        h += _advancedDiagnosticsHtml();
        // Prominent route-unavailable banner — NOT an LLM failure
        if (_routeUnavailableMsg) {
            h += '<div data-ff-loop="route-unavailable" style="margin-top:5px;padding:6px 8px;border:1px solid #7a3030;border-radius:4px;background:#241414;color:#f0b0b0;font-size:10px;line-height:1.4;">⚠ ' + esc(_routeUnavailableMsg) + '</div>';
        }
        // RMOOZ-AI-FREE-FIGHT-AI-ONLY-A: AI-required banner — this card moves units ONLY via a real
        // local LLM. Shown when the loop was blocked / paused because the LLM was not used.
        if (_aiUnavailableMsg) {
            h += '<div data-ff-loop="ai-required" style="margin-top:5px;padding:6px 8px;border:1px solid #6a5520;border-radius:4px;background:#1c1708;color:#f0c060;font-size:10px;line-height:1.45;font-weight:600;">🛑 ' + esc(_aiUnavailableMsg) + '</div>';
        }
        // Control buttons
        h += '<div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:6px;">';
        if (!_loopRunning || _loopPaused) {
            // RMOOZ-AI-USER-FRIENDLY-MODEL-FLOW-A: Start is disabled until a model is ready (same single
            // runtime gate as startLoop) so the operator can't press a button that won't run.
            var _startReady = _freeFightAiReady();
            if (_startReady.ok !== false) {
                h += '<button data-act="loop-start" style="font:inherit;cursor:pointer;border:1px solid #2e7d54;background:#1f3a2b;color:#7fd6a0;border-radius:5px;padding:5px 9px;font-size:11px;">▶ Start AI Free Fight</button>';
            } else {
                h += '<button data-act="loop-start" disabled title="' + esc(_modelFlowStatus().message || 'Select an AI model first') + '" style="font:inherit;cursor:not-allowed;opacity:.55;border:1px solid #3a5040;background:#162018;color:#5f8f74;border-radius:5px;padding:5px 9px;font-size:11px;">▶ Start AI Free Fight</button>';
            }
        }
        if (_loopRunning && !_loopPaused) {
            h += '<button data-act="loop-pause" style="font:inherit;cursor:pointer;border:1px solid #8a6a20;background:#2a2412;color:#e0c060;border-radius:5px;padding:5px 9px;font-size:11px;">⏸ Pause</button>';
        }
        h += '<button data-act="loop-step" style="font:inherit;cursor:pointer;border:1px solid #4a7bb8;background:#172436;color:#9ec2ec;border-radius:5px;padding:5px 9px;font-size:11px;">⏭ Step Once</button>';
        h += '<button data-act="loop-reset" style="font:inherit;cursor:pointer;border:1px solid #5a6270;background:#2a2f37;color:#e8eaed;border-radius:5px;padding:5px 9px;font-size:11px;">⟲ Reset</button>';
        h += '</div>';
        // Speed control
        h += '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px;align-items:center;">';
        h += '<span style="font-size:10px;color:#8fa5b8;">Speed:</span>';
        FF_SPEED_ORDER.forEach(function (sp) {
            var active = (_freeFightSpeed === sp);
            var bg = active ? '#1a4a6a' : '#101b27';
            var bc = active ? '#5ab0e0' : '#4a5f75';
            var fc = active ? '#cfeaff' : '#8fb8e0';
            h += '<button data-act="loop-speed-' + sp + '" title="' + esc(sp) + '" style="font:inherit;cursor:pointer;border:1px solid ' + bc + ';background:' + bg + ';color:' + fc + ';border-radius:4px;padding:3px 7px;font-size:10px;font-weight:' + (active ? '700' : '400') + ';">' + esc(FF_SPEEDS[sp].label) + '</button>';
        });
        h += '</div>';
        h += '<div style="font-size:9.5px;color:#6a8fa8;margin-top:4px;">x1 = cinematic (slow, visible). 🔥🔥 = super fast. AI auto-picks the recommended COA each turn; no manual side selection.</div>';
        // FREEFIGHT-MANUAL-MAP-CAMERA-A: camera policy toggle — Manual is the default;
        // the map never moves on AI movement unless the operator chooses Follow AI.
        h += '<div data-ff-loop="camera" style="display:flex;gap:5px;flex-wrap:wrap;align-items:center;margin-top:6px;">';
        h += '<span style="font-size:10px;color:#8fa5b8;">Camera:</span>';
        [['manual', 'Manual'], ['follow', 'Follow AI']].forEach(function (m) {
            var on = (_freeFightCameraMode === m[0]);
            var bg = on ? '#1a4a6a' : '#101b27', bc = on ? '#5ab0e0' : '#4a5f75', fc = on ? '#cfeaff' : '#8fb8e0';
            h += '<button data-act="camera-' + m[0] + '" style="font:inherit;cursor:pointer;border:1px solid ' + bc + ';background:' + bg + ';color:' + fc + ';border-radius:4px;padding:3px 8px;font-size:10px;font-weight:' + (on ? '700' : '400') + ';">' + m[1] + '</button>';
        });
        h += '<span style="font-size:9px;color:#6a8fa8;">' + (_freeFightCameraMode === 'follow' ? 'map pans to follow AI moves' : 'map stays where you left it') + '</span>';
        h += '</div>';
        // RMOOZ-AI-COMMANDER-FREEDOM-A/B: AI Commander Mode + a visible current-mode indicator.
        h += '<div data-ff-ai-mode="indicator" style="margin-top:7px;font-size:10.5px;font-weight:700;color:#d8ccff;">Current AI Mode: <span style="color:#b89aff;">' + esc(FF_COMMANDER_MODES[_commanderMode].label) + '</span></div>';
        h += '<div data-ff-loop="commander-mode" style="display:flex;gap:5px;flex-wrap:wrap;align-items:center;margin-top:3px;">';
        h += '<span style="font-size:10px;color:#8fa5b8;">Set mode:</span>';
        ['controlled', 'free', 'high_variation'].forEach(function (m) {
            var on = (_commanderMode === m);
            var bg = on ? '#2a1a4a' : '#101b27', bc = on ? '#9a7be0' : '#4a5f75', fc = on ? '#d8ccff' : '#9fb8e0';
            h += '<button data-act="mode-' + m + '" style="font:inherit;cursor:pointer;border:1px solid ' + bc + ';background:' + bg + ';color:' + fc + ';border-radius:4px;padding:3px 8px;font-size:10px;font-weight:' + (on ? '700' : '400') + ';">' + esc(FF_COMMANDER_MODES[m].label) + '</button>';
        });
        h += '</div>';
        h += '<div style="font-size:9px;color:#6a8fa8;margin-top:3px;">' +
            (_commanderMode === 'controlled' ? 'Doctrine-guided: intercept / defend.' :
             _commanderMode === 'high_variation' ? 'Creative: rotates recon / flank / deceive / delay / attack each cycle.' :
             'Free tactical reasoning: AI may choose recon, delay, flank, deceive, withdraw, defend, probe, or attack — operator reviews.') + '</div>';
        // RMOOZ-AI-COMMANDER-REPAIR-LOOP-A: planning mode — AI Commander (LLM drafts + RMOOZ
        // validates/repairs) vs Staff-Safe (deterministic staff planner). Commander is the default.
        h += '<div data-ff-loop="planning-mode" style="display:flex;gap:5px;flex-wrap:wrap;align-items:center;margin-top:6px;">';
        h += '<span style="font-size:10px;color:#8fa5b8;">Planner:</span>';
        [['commander', 'AI Commander'], ['staff_safe', 'Staff-Safe']].forEach(function (pm) {
            var on = (_planningMode === pm[0]);
            var isCmd = pm[0] === 'commander';
            var bg = on ? (isCmd ? '#0f2a1c' : '#241f08') : '#101b27';
            var bc = on ? (isCmd ? '#2e9d6a' : '#a08a30') : '#4a5f75';
            var fc = on ? (isCmd ? '#9fe8c0' : '#e8d68a') : '#9fb8e0';
            h += '<button data-act="planmode-' + pm[0] + '" style="font:inherit;cursor:pointer;border:1px solid ' + bc + ';background:' + bg + ';color:' + fc + ';border-radius:4px;padding:3px 8px;font-size:10px;font-weight:' + (on ? '700' : '400') + ';">' + esc(pm[1]) + '</button>';
        });
        h += '</div>';
        // RMOOZ-AI-COMMANDER-DEMO-PACING-C: honest timing labels so the operator knows the pacing.
        h += '<div style="font-size:9px;color:#6a8fa8;margin-top:3px;">' +
            (_planningMode === 'staff_safe'
                ? '<b style="color:#cdb86a;">Fast deterministic planning — AI explanation optional.</b> Staff-Safe builds the COAs from the deterministic staff planner (no LLM) — guaranteed and near-instant.'
                : '<b style="color:#9fe8c0;">Full local AI planning — may take 2–5 minutes.</b> AI Commander: the local LLM drafts COAs; RMOOZ validates and sends invalid parts back to the AI to repair. Auto-falls to Staff-Safe if the AI cannot produce a valid plan.') + '</div>';
        // RMOOZ-AI-COA-PERFORMANCE-A: AI planning depth (speed vs depth trade-off).
        h += '<div data-ff-loop="ai-depth" style="display:flex;gap:5px;flex-wrap:wrap;align-items:center;margin-top:6px;">';
        h += '<span style="font-size:10px;color:#8fa5b8;">Depth:</span>';
        ['fast', 'normal', 'deep'].forEach(function (d) {
            var on = (_aiDepth === d);
            var bg = on ? '#143a30' : '#101b27', bc = on ? '#4ab090' : '#4a5f75', fc = on ? '#aef0d0' : '#9fb8e0';
            h += '<button data-act="depth-' + d + '" style="font:inherit;cursor:pointer;border:1px solid ' + bc + ';background:' + bg + ';color:' + fc + ';border-radius:4px;padding:3px 8px;font-size:10px;font-weight:' + (on ? '700' : '400') + ';">' + esc(FF_AI_DEPTHS[d].label) + '</button>';
        });
        h += '</div>';
        h += '<div style="font-size:9px;color:#6a8fa8;margin-top:3px;">' +
            (_aiDepth === 'fast' ? 'Fast: heuristic capability, no LLM, terrain summary only — quickest.' :
             _aiDepth === 'deep' ? 'Deep: full LLM + full terrain/provenance (Generate-5 re-runs the LLM per seed).' :
             'Normal: LLM analyst/commander when enabled, real terrain.') + '</div>';
        // RMOOZ-AI-COMMANDER-FREEDOM-B: quick variation test — run 5 cycles with seeds 0-4.
        h += '<div style="margin-top:6px;">';
        h += '<button data-act="gen5-coas" style="font:inherit;cursor:pointer;border:1px solid #6a9a4a;background:#16240f;color:#bfe89a;border-radius:5px;padding:4px 9px;font-size:10.5px;font-weight:600;">⚙ Generate 5 different COAs</button>';
        h += '<div data-ff-gen5="result" style="margin-top:5px;font-size:10px;color:#aec0d8;"></div>';
        h += '</div>';
        // Turn log (most recent first, capped)
        if (_turnLog.length) {
            h += '<div data-ff-loop="turnlog" style="margin-top:6px;border-top:1px solid #1a3050;padding-top:4px;">';
            h += '<div style="font-size:10px;color:#7a9ab8;font-weight:600;margin-bottom:2px;">Turn log (' + _turnLog.length + '):</div>';
            _turnLog.slice(-8).reverse().forEach(function (t) {
                var sc = t.side === 'BLUE' ? '#7fb0ff' : '#f0a0a0';
                h += '<div style="font-size:9.5px;color:#9ab0c0;">T' + t.turn + ' <span style="color:' + sc + ';">' + esc(t.side) + '</span> · ' + esc(t.coa_id) + ' ' + esc(t.coa_title) + ' · ' + t.moved + ' moved · ' + esc(t.source === 'llm' ? 'llm' : 'det') + '</div>';
            });
            h += '</div>';
        }
        h += '</div>';
        return h;
    }

    // ── RMOOZ-GREEN-WORLD-UI-R: GREEN neutral-world surface (read-only, deterministic) ──────────────
    // Calls ONLY the deterministic /neutral-world endpoint — NEVER /plan-coas, NEVER the LLM. The
    // optional summarizer (green-summarizer.js) is server-side + gated; this UI shows the deterministic
    // note only (req #9). Auto-refreshes after deep plan / commit / phase advance / replan trigger, and
    // on demand — none of which moves units, changes combat/adjudication, or affects llm_called_this_tick.
    function _greenUnits() {
        var w = W(); var sc = w && w.RmoozScenario && w.RmoozScenario.scenario;
        if (!sc) return [];
        var raw = (Array.isArray(sc.red_units) ? sc.red_units : []).concat(Array.isArray(sc.blue_units_initial) ? sc.blue_units_initial : []);
        return raw.map(function (u) {
            var la = (u && u.lat != null) ? u.lat : (u && Array.isArray(u.coord) ? u.coord[1] : null);
            var lo = (u && u.lon != null) ? u.lon : (u && Array.isArray(u.coord) ? u.coord[0] : null);
            if (!Number.isFinite(Number(la)) || !Number.isFinite(Number(lo))) return null;
            return { id: (u.id || u.uid || u.unit_uid), side: u.side, lat: Number(la), lon: Number(lo) };
        }).filter(Boolean);
    }
    // Best-effort terrain hint from the last plan intel — Green degrades to low/unknown when absent.
    // We never fabricate route data (roads stay "unknown" unless real route_cost is present).
    function _greenTerrainHint() {
        var intel = _lastIntel || (_coaPlan && _coaPlan.intel) || null;
        if (!intel) return null;
        var tc = intel.terrain_class || (intel.terrain && (intel.terrain.terrain_class || intel.terrain.class)) || null;
        var zs = intel.zone_state || intel.zone || null;
        var oc = (zs && zs.owner_country) || intel.owner_country || null;
        var hint = {};
        if (tc) hint.terrain_class = tc;
        if (oc && oc !== 'unknown') hint.owner_country = oc;
        return Object.keys(hint).length ? hint : null;
    }
    function _greenBand(a) { return (a && a.collateral_risk && a.collateral_risk.band) || 'low'; }
    function _greenColor(band) { return band === 'high' ? '#f0707a' : (band === 'medium' ? '#e0a93a' : '#5bd6a0'); }
    // ── RMOOZ-WHITE-GREEN-ANNOTATION-T: White (referee) reads Green and produces a DETERMINISTIC,
    // ADVISORY adjudication annotation — never a gate. The validator stays structure/physics-only
    // ([[feedback_validator_structure_physics_only]]); this advisory never blocks/rejects/pauses
    // execution and never calls the LLM. It is surfaced + recorded as a White decision only.
    function _whiteAdvisory(green) {
        if (!green || !green.collateral_risk) return null;
        var c = green.collateral_risk.band || 'low';                 // low|medium|high
        var nr = (typeof green.neutral_reaction_score === 'number') ? green.neutral_reaction_score : 0;
        var rBand = nr >= 67 ? 'high' : (nr >= 34 ? 'medium' : 'low');
        var order = { low: 0, medium: 1, high: 2 };
        var worst = (order[c] >= order[rBand]) ? c : rBand;          // worst of collateral + neutral reaction
        var level = worst === 'high' ? 'restricted' : (worst === 'medium' ? 'caution' : 'clear');
        return {
            advisory_level: level, collateral_band: c, neutral_reaction_score: nr,
            gate: false,   // ALWAYS advisory — White never blocks on Green; execution is unaffected
            note: level === 'restricted' ? 'Collateral/neutral-reaction high — ROE & political review advised before execution.'
                : level === 'caution' ? 'Elevated collateral/neutral-reaction — weigh proportionality.'
                : 'Collateral and neutral reaction low — no advisory.',
            source: 'green-world', engine: 'deterministic', review_only: true,
        };
    }
    function _whiteAdvisoryColor(level) { return level === 'restricted' ? '#f0707a' : (level === 'caution' ? '#e0a93a' : '#7fd6a0'); }
    // Record the advisory as a White decision — ONLY for a committed decision, and ONLY when the level
    // changes (dedup), so it annotates the committed COA without flooding the log. No gate, no LLM.
    function _recordWhiteAdvisory(green) {
        var adv = _whiteAdvisory(green);
        if (!adv) return;
        if (!(_coaExec && _coaExec.active)) return;                  // advisory annotates a COMMITTED decision
        if (adv.advisory_level === _whiteAdvisoryLevel) return;      // dedup: record only on change
        _whiteAdvisoryLevel = adv.advisory_level;
        try { _recordDecision({ role: 'white', action: 'adjudication_advisory', called_llm: false, source: 'green-world→white',
            reason: 'collateral ' + adv.collateral_band + ' · reaction ' + adv.neutral_reaction_score,
            result_summary: adv.advisory_level + ' (advisory · not a block)' }); } catch (_) {}
        try { _appendToEventLog('White (referee) advisory on committed COA: ' + esc(adv.advisory_level) + ' — ' + esc(adv.note) + ' (advisory only; validator/execution unchanged).'); } catch (_) {}
    }
    // ── RMOOZ-GREEN-WHITE-SCORING-T: White reads Green during plan validation/COA review and produces a
    // structured ADVISORY scoring object. Pure + deterministic, NO LLM, NO fetch. The score delta is
    // ADVISORY ONLY — it NEVER invalidates a COA, never gates execution, and never touches the
    // structure/physics validator. low→0, medium→-5, high→-15; absent/inferred provenance → low-confidence.
    function _greenAdvisoryScoring(green) {
        if (!green || !green.collateral_risk) {
            return { considered: true, collateral_risk_band: 'unknown', neutral_reaction_score: null, advisory_score_delta: 0,
                warnings: ['No neutral-world assessment available — low confidence / inferred.'],
                recommendations: ['Refresh Green World for a collateral read.'], provenance: 'absent' };
        }
        var band = green.collateral_risk.band || 'low';
        var nr = (typeof green.neutral_reaction_score === 'number') ? green.neutral_reaction_score : null;
        var adv = _whiteAdvisory(green);                          // worst-of collateral + neutral reaction
        var level = adv ? adv.advisory_level : 'clear';
        var delta = level === 'restricted' ? -15 : (level === 'caution' ? -5 : 0);
        var warnings = [], recs = [];
        if (level === 'restricted') { warnings.push('High collateral / neutral-reaction risk near the objective.'); recs.push('ROE & political review advised; consider a lower-collateral COA or phasing.'); }
        else if (level === 'caution') { warnings.push('Elevated collateral / neutral-reaction risk.'); recs.push('Weigh proportionality; minimise dwell in populated areas.'); }
        var prov = (green.provenance && typeof green.provenance === 'object') ? green.provenance : { engine: 'deterministic' };
        var lowConf = !!(green.provenance && (green.provenance.population === 'absent' || green.provenance.collateral === 'absent' || green.provenance.roads === 'absent'));
        if (lowConf) warnings.push('Low confidence — some factors inferred (no census / road / infrastructure layer).');
        return { considered: true, collateral_risk_band: band, neutral_reaction_score: nr, advisory_score_delta: delta,
            warnings: warnings, recommendations: recs, provenance: prov };
    }
    // Attach the green_advisory to the CLIENT White review (never the server validator) + record it.
    function _applyGreenAdvisoryScoring(reason) {
        var ga = _greenAdvisoryScoring(_greenWorld);
        if (_coaPlan) _coaPlan._green_advisory = ga;              // composed onto the White review, advisory-only
        var key = ga.collateral_risk_band + ':' + ga.advisory_score_delta;
        if (key !== _greenScoringKey) {
            _greenScoringKey = key;
            try { _recordDecision({ role: 'white', action: 'green_advisory_scoring', called_llm: false, source: 'green-world→white',
                reason: 'green risk considered', result_summary: ga.collateral_risk_band + ' · Δ' + ga.advisory_score_delta + ' (advisory)' }); } catch (_) {}
            try { _appendToEventLog('White advisory: Green collateral risk ' + esc(ga.collateral_risk_band) + '; score adjusted ' + ga.advisory_score_delta + '.'); } catch (_) {}
        }
        updatePanel();
        return ga;
    }
    function _logGreenChanges(prev, a) {
        try {
            var cb = _greenBand(a), rs = (a.road_status && a.road_status.status) || 'unknown', nr = a.neutral_reaction_score;
            _appendToEventLog('Green World assessed — collateral ' + esc(cb) + ' (' + (a.collateral_risk && a.collateral_risk.score) + '/100) · roads ' + esc(rs) + ' · reaction ' + esc(nr) + '/100. Deterministic, no AI.');
            if (prev) {
                if (_greenBand(prev) !== cb) _appendToEventLog('Green World — collateral risk changed: ' + esc(_greenBand(prev)) + ' → ' + esc(cb) + '.');
                var prs = (prev.road_status && prev.road_status.status) || 'unknown';
                if (prs !== rs) _appendToEventLog('Green World — road status changed: ' + esc(prs) + ' → ' + esc(rs) + '.');
                var pin = (prev.infra_status && prev.infra_status.note) || '', nin = (a.infra_status && a.infra_status.note) || '';
                if (pin !== nin) _appendToEventLog('Green World — infrastructure status changed.');
            }
        } catch (_) {}
    }
    // Refresh the Green assessment. Hits ONLY /neutral-world (deterministic, ungated). Debounced; bails
    // quietly when there is nothing to assess. Returns a promise resolving to the assessment.
    function _refreshGreenWorld(reason) {
        var w = W();
        if (!w || typeof w.fetch !== 'function') return Promise.resolve(_greenWorld);
        if (_greenBusy) return Promise.resolve(_greenWorld);
        var units = _greenUnits();
        var objective = getObjective();
        if (!objective || !units.length) return Promise.resolve(_greenWorld);  // nothing to assess yet
        _greenBusy = true;
        var prev = _greenWorld;
        var body = { units: units, objective: { lat: objective.lat, lon: objective.lon }, terrain: _greenTerrainHint() };
        var _gT0 = _nowMs();   // RMOOZ-AI-SCHEDULER-DECISION-LOG-S
        return _fetchJsonSafe('/api/wargame-sim/free-fight/neutral-world', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        }).then(function (a) {
            if (a && a.ok && a.collateral_risk) { a._reason = reason || 'manual'; _logGreenChanges(prev, a); _greenWorld = a; if (_greenOverlayOn) _greenOverlayApply();
                try { _recordDecision({ role: 'green', action: 'neutral_world_refresh', called_llm: false, duration_ms: _nowMs() - _gT0, reason: reason || 'manual', source: 'green-world', result_summary: 'collateral ' + _greenBand(a) + ' (' + (a.collateral_risk && a.collateral_risk.score) + ')' }); } catch (_) {}
                try { _recordWhiteAdvisory(a); } catch (_) {} }   // RMOOZ-WHITE-GREEN-ANNOTATION-T: deterministic White advisory (no gate, no LLM)
            _greenBusy = false; updatePanel();
            return _greenWorld;
        }).catch(function () { _greenBusy = false; updatePanel(); return _greenWorld; });
    }
    // Map overlay: a risk ring around the objective coloured by collateral band. Optional/toggleable,
    // review-only — its OWN layer group; it never touches scenario / combat / marker layers.
    function _greenOverlayApply() {
        var w = W();
        if (!mapReady()) return;
        try {
            if (_greenLayer) { if (w.map.hasLayer(_greenLayer)) w.map.removeLayer(_greenLayer); _greenLayer = null; }
            if (!_greenOverlayOn || !_greenWorld) return;
            var obj = getObjective(); if (!obj) return;
            var col = _greenColor(_greenBand(_greenWorld));
            _greenLayer = w.L.layerGroup();
            if (typeof w.L.circle === 'function') {
                _greenLayer.addLayer(w.L.circle([obj.lat, obj.lon], { radius: 8000, color: col, weight: 1.5, opacity: 0.85, fillColor: col, fillOpacity: 0.12, dashArray: '4 4', interactive: false }));
            }
            _greenLayer.addTo(w.map);
        } catch (_) {}
    }
    function _greenWorldHtml() {
        var a = _greenWorld;
        var h = '<div data-ff-green="panel" style="margin-top:8px;border:1px solid #1a4030;border-radius:6px;background:#091810;padding:7px 9px;">';
        h += '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:space-between;">';
        h += '<span style="font-size:10.5px;font-weight:700;color:#7fd6a0;">🌍 Green World — neutral environment (deterministic)</span>';
        h += '<span style="display:flex;gap:8px;align-items:center;">';
        h += '<label style="font-size:9.5px;color:#9ec2ec;display:flex;gap:4px;align-items:center;cursor:pointer;"><input type="checkbox" data-act="green-overlay-toggle"' + (_greenOverlayOn ? ' checked' : '') + ' style="accent-color:#5bd6a0;cursor:pointer;"> map ring</label>';
        h += '<button data-act="green-refresh"' + (_greenBusy ? ' disabled' : '') + ' style="font:inherit;cursor:' + (_greenBusy ? 'not-allowed' : 'pointer') + ';border:1px solid #2a7a50;background:#131e18;color:#90d0a0;border-radius:4px;padding:3px 8px;font-size:10px;' + (_greenBusy ? 'opacity:.55;' : '') + '">' + (_greenBusy ? '⏳ …' : '↻ Refresh Green World') + '</button>';
        h += '</span></div>';
        if (!a) {
            h += '<div style="margin-top:4px;font-size:9.5px;color:#8fa5b8;">No assessment yet — generate a plan, commit a COA, or press Refresh. Deterministic, no AI call.</div></div>';
            return h;
        }
        var band = _greenBand(a), col = _greenColor(band);
        function row(label, val, c) { return '<div style="font-size:9.5px;color:#cdd8e4;"><span style="color:#8fa5b8;">' + label + ':</span> <span style="color:' + (c || '#e0e8f0') + ';">' + val + '</span></div>'; }
        h += '<div style="margin-top:5px;">';
        h += row('Civilian / collateral risk', esc(band) + ' (' + (a.collateral_risk && a.collateral_risk.score) + '/100)', col);
        h += row('Road status', esc((a.road_status && a.road_status.status) || 'unknown') + ' — ' + esc((a.road_status && a.road_status.basis) || ''));
        h += row('Infrastructure', esc((a.infra_status && a.infra_status.note) || '—'));
        h += row('Host-nation pressure', a.host_nation ? esc(a.host_nation) : 'none identified');
        h += row('Neutral reaction score', (a.neutral_reaction_score != null ? a.neutral_reaction_score + '/100' : '—'), col);
        h += '</div>';
        // RMOOZ-WHITE-GREEN-ANNOTATION-T / RMOOZ-GREEN-WHITE-SCORING-T: White (referee) advisory from Green.
        // When a plan has been scored, show the structured scoring (band + score delta + recommendation +
        // warnings); otherwise the simpler execution-time advisory line. Both are advisory only.
        var _adv = _whiteAdvisory(a);
        var _ga = _coaPlan && _coaPlan._green_advisory;
        if (_ga) {
            var _gc = _whiteAdvisoryColor(_adv ? _adv.advisory_level : 'clear');
            h += '<div data-ff-green="white-scoring" style="margin-top:5px;padding:4px 6px;border-radius:4px;background:#0a1622;border:1px solid #24435f;color:#cdd8e4;font-size:9.5px;">' +
                 '⚖ <b style="color:' + _gc + ';">White considered Green risk: ' + esc(_ga.collateral_risk_band) + '</b> · score &Delta; ' + _ga.advisory_score_delta +
                 (arr(_ga.recommendations).length ? ' · ' + esc(_ga.recommendations[0]) : '') +
                 '<br><span style="color:#5a7a8a;">Advisory only — not a block; validator unchanged (structure/physics).</span>' +
                 (arr(_ga.warnings).length ? '<br><span style="color:#e0a93a;">⚠ ' + _ga.warnings.map(function (x) { return esc(x); }).join(' · ') + '</span>' : '') + '</div>';
        } else if (_adv) {
            h += '<div data-ff-green="white-advisory" style="margin-top:5px;padding:4px 6px;border-radius:4px;background:#0a1622;border:1px solid #24435f;color:#cdd8e4;font-size:9.5px;">' +
                 '⚖ <b style="color:' + _whiteAdvisoryColor(_adv.advisory_level) + ';">White advisory: ' + esc(_adv.advisory_level) + '</b> — ' + esc(_adv.note) +
                 ' <span style="color:#5a7a8a;">Advisory only — not a block; validator unchanged (structure/physics).</span></div>';
        }
        h += '<div data-ff-green="note" style="margin-top:5px;padding:4px 6px;border-radius:4px;background:#0c1f14;border:1px solid #1a4030;color:#9fd6b0;font-size:9.5px;">' + esc(arr(a.notes).join(' ')) + ' <span style="color:#5a7a60;">(deterministic note · summarizer off)</span></div>';
        h += '<div style="margin-top:3px;font-size:9px;color:#5a7a60;">provenance: ' + esc(JSON.stringify(a.provenance || {})) + (a._reason ? ' · trigger: ' + esc(a._reason) : '') + '</div>';
        h += '<details style="margin-top:4px;"><summary style="cursor:pointer;font-size:9px;color:#5a7a9a;">Green JSON</summary><pre style="font-size:8.5px;color:#9ab0c0;white-space:pre-wrap;word-break:break-word;max-height:160px;overflow:auto;margin:3px 0 0;">' + esc(JSON.stringify(a, null, 2)) + '</pre></details>';
        h += '</div>';
        return h;
    }
    // ── RMOOZ-AI-SCHEDULER-DECISION-LOG-S: Blue/Red/Green/White audit trail (RECORD-ONLY) ──────────
    // A transparency layer: which role acted/skipped, did it call the LLM, how long, and why. It does
    // NOT change scheduler behaviour, never calls the LLM, and adds no model/network calls — every
    // record is a synchronous in-memory push. Bounded buffer; the UI shows the latest 10.
    function _recordDecision(rec) {
        try {
            var r = rec || {};
            var entry = {
                ts: _nowISO(), tick: (_coaExec && _coaExec.ticks) || 0,
                role: r.role || 'unit-controller', action: r.action || '',
                called_llm: r.called_llm === true,
                provider: r.provider || null, model: r.model || null,
                duration_ms: (typeof r.duration_ms === 'number' && isFinite(r.duration_ms)) ? Math.round(r.duration_ms) : null,
                reason: r.reason || null, skipped_reason: r.skipped_reason || null,
                source: r.source || null, result_summary: r.result_summary || null,
            };
            _decisionLog.push(entry);
            if (_decisionLog.length > DECISION_LOG_CAP) _decisionLog.splice(0, _decisionLog.length - DECISION_LOG_CAP);
            return entry;
        } catch (_) { return null; }
    }
    function _clearDecisionLog() { _decisionLog = []; updatePanel(); }
    // Record a Blue/Red commander plan + the performance-governor depth choice + White validation, from a
    // plan response. Pure recording — derives everything from the already-returned plan (no new calls).
    function _recordPlanDecision(plan, durMs) {
        plan = plan || {};
        var side = String(plan.active_side || (arr(plan.coas)[0] && arr(plan.coas)[0].side) || _activeSide || 'RED').toUpperCase();
        var role = side === 'BLUE' ? 'blue' : 'red';
        var calledLlm = !!(plan.llm_called && plan.plan_source === 'llm' && (!plan.llm_status || /ok|success/i.test(String(plan.llm_status))));
        // performance governor — which depth/mode it allowed (deterministic decision, no LLM).
        _recordDecision({ role: 'performance', action: 'select_depth', called_llm: false, source: 'performance_governor',
            reason: 'ai_depth=' + (_aiDepth || 'normal') + (_planningMode === 'staff_safe' ? ' · staff_safe' : '') });
        // Blue/Red commander plan.
        _recordDecision({ role: role, action: (plan._requestedVia === 'manual_generate' ? 'deep_plan' : 'plan'),
            called_llm: calledLlm, provider: plan.provider_used || null, model: plan.model_used || null, duration_ms: durMs,
            reason: calledLlm ? 'AI commander plan' : (plan.fallback_reason || plan.plan_source || (plan.ok ? 'deterministic plan' : 'plan failed')),
            source: plan.plan_source || null,
            result_summary: plan.ok ? (arr(plan.coas).length + ' COA(s) · ' + (plan.plan_source || 'unknown')) : ('failed: ' + (plan._error || 'error')) });
        // White validation (deterministic referee), when the plan carried a validation verdict.
        if (plan.validation) {
            _recordDecision({ role: 'white', action: 'validate_coa', called_llm: false, source: 'deterministic_validator',
                reason: plan.validation.ok ? 'COA valid' : (plan.validation.reason || 'rejected'),
                result_summary: plan.validation.ok ? 'ok' : ('errors: ' + arr(plan.validation.errors).length) });
        }
    }
    var DECISION_ROLE_COLORS = { blue: '#7bb8e8', red: '#f0707a', green: '#5bd6a0', white: '#cdd8e4', performance: '#e0a93a', 'unit-controller': '#9ec2ec' };
    function _decisionLogHtml() {
        var n = _decisionLog.length;
        var h = '<div data-ff-sched="panel" style="margin-top:6px;border-top:1px solid #1a3050;padding-top:5px;">';
        h += '<div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">';
        h += '<span style="font-size:10px;color:#8fa5b8;font-weight:600;">Scheduler decision log — Blue/Red/Green/White audit (' + n + ')</span>';
        h += '<button data-act="decision-log-clear" style="font:inherit;cursor:pointer;border:1px solid #5a6270;background:#22272f;color:#cdd8e4;border-radius:4px;padding:2px 7px;font-size:9px;">Clear decision log</button>';
        h += '</div>';
        if (!n) { h += '<div style="margin-top:4px;font-size:9px;color:#5a7a60;">No decisions recorded yet — generate a plan, commit/run a COA, or refresh Green.</div></div>'; return h; }
        h += '<div data-ff-sched="rows" style="margin-top:4px;display:flex;flex-direction:column;gap:2px;">';
        _decisionLog.slice(-10).reverse().forEach(function (d) {
            var col = DECISION_ROLE_COLORS[d.role] || '#9ec2ec';
            var llm = d.called_llm ? '<span style="color:#f0c060;">LLM</span>' : '<span style="color:#7fd6a0;">no-LLM</span>';
            var dur = (d.duration_ms != null) ? (d.duration_ms + 'ms') : '—';
            var why = d.skipped_reason ? ('skipped: ' + d.skipped_reason) : (d.reason || d.result_summary || '');
            h += '<div style="font-size:9px;color:#cdd8e4;display:flex;gap:6px;align-items:baseline;">' +
                 '<span style="background:' + col + ';color:#06101c;border-radius:3px;padding:0 5px;font-weight:700;min-width:80px;text-align:center;">' + esc(d.role) + '</span>' +
                 '<span style="color:#9ec2ec;min-width:118px;">' + esc(d.action) + '</span>' +
                 '<span style="min-width:46px;">' + llm + '</span>' +
                 '<span style="color:#8fa5b8;min-width:48px;">' + dur + '</span>' +
                 '<span style="color:#9ab0c0;flex:1;">' + esc(String(why).slice(0, 64)) + '</span>' +
                 '</div>';
        });
        h += '</div></div>';
        return h;
    }
    // RMOOZ-FREE-FIGHT-SIMPLE-OPERATOR-UX-O: the SIMPLE primary operator flow — ONE primary action per
    // state: Generate AI Plan (slow) → Use Recommended Plan → Run Plan (fast) → Pause, state-driven
    // (no plan → plan → committed → running → blocked → complete). It wires to the EXISTING functions
    // only (no logic change). "Start AI Free Fight" / Commit / Replan / Clear / Staff-Safe / model
    // controls / diagnostics all live under "Advanced controls" (collapsed). The blocked state points
    // the operator into Advanced (Replan stays there, per owner ruling) rather than surfacing it. The
    // committed-COA Run path keeps the no-LLM guarantee from -L (deterministic ticks,
    // llm_called_this_tick=false, no /plan-coas fetch).
    function _operatorStatusLine(ex) {
        var phases = arr(ex.selected_coa && ex.selected_coa.phases);
        var word = ex.phase_status === 'complete' ? 'Complete' : (ex.replan_required ? 'Blocked' : (ex.paused ? 'Paused' : (ex.phase_status === 'running' ? 'Running' : 'Ready')));
        return '<div data-ff-op="status" style="margin-top:5px;font-size:10px;color:#cdd8e4;line-height:1.5;">' +
            '<div><span style="color:#8fa5b8;">Active Plan:</span> <b style="color:#e8eaed;">' + esc(ex.selected_coa_id) + '</b></div>' +
            '<div><span style="color:#8fa5b8;">Phase:</span> ' + (ex.phase_status === 'complete' ? 'all done' : ((ex.current_phase_index + 1) + ' / ' + phases.length)) +
            ' · <span style="color:#8fa5b8;">Status:</span> <b style="color:#cfe6ff;">' + word + '</b></div>' +
            '<div><span style="color:#8fa5b8;">AI calls on normal ticks:</span> <b style="color:#7fd6a0;">OFF</b></div></div>';
    }
    // ══ RMOOZ-FREE-FIGHT-CONTINUOUS-SCENARIO-AA: continuous scenario orchestration ════════════════════
    // A deterministic layer ON TOP of committed-COA execution. Run Plan executes the committed COA ONCE
    // (existing). Run Scenario keeps the fight alive: it reuses the EXISTING deterministic tick
    // (_coaExecTick — no LLM, no /plan-coas), the EXISTING Green refresh (/neutral-world only), and the
    // EXISTING decision log, and adds a deterministic White outcome check + a simple deterministic Red
    // reaction + turn/end-condition bookkeeping. NORMAL TICKS NEVER CALL THE LLM. The LLM is reached
    // ONLY when the operator explicitly Replans (the existing _replanCoa → /plan-coas path). Frozen:
    // movement physics / teleport guard / validation / Green logic / White advisory scoring / ranking /
    // Staff-Safe / LLM config / DB-Lite·terrain·readiness·supply — all UNCHANGED.
    var SCENARIO_MAX_TURNS = 12;
    var SCENARIO_MAX_AUTO_TURNS = 8;       // RMOOZ-...-AB: auto-director hard cap (forces a human decision)
    var SCENARIO_OBJ_NEAR_KM = 8;          // a unit within this range of the objective counts as "at" it
    function _scenarioActive() { return !!(_scenario && _scenario.scenario_active); }
    function _newScenario() {
        return { scenario_active: true, scenario_status: 'running', scenario_turn: 1, blue_cycle: 0, red_cycle: 0,
            current_actor: 'unit-controller', end_condition: null, last_outcome: null, pending_replan_reason: null,
            max_turns: SCENARIO_MAX_TURNS, started_at: _nowISO(), updated_at: _nowISO(),
            // RMOOZ-FREE-FIGHT-AUTO-SCENARIO-DIRECTOR-AB: auto-director settings
            auto_continue: _scenarioAutoContinue, auto_director_enabled: true, max_auto_turns: SCENARIO_MAX_AUTO_TURNS,
            last_auto_order_source: null, last_red_maneuver: null };
    }
    function _scenarioSideNearObj(side, obj) {
        if (!obj) return 0;
        var n = 0;
        _greenUnits().forEach(function (u) {
            if (String(u.side || '').toUpperCase() !== side) return;
            if (_kmBetween({ lat: u.lat, lon: u.lon }, { lat: obj.lat, lon: obj.lon }) <= SCENARIO_OBJ_NEAR_KM) n++;
        });
        return n;
    }
    // White deterministic adjudication of the current battlefield (NO LLM, NO fetch).
    function _whiteScenarioOutcome() {
        var obj = getObjective();
        var blueTotal = _sideUnitCount('BLUE'), redTotal = _sideUnitCount('RED');
        var blueNear = _scenarioSideNearObj('BLUE', obj), redNear = _scenarioSideNearObj('RED', obj);
        var committed = (_coaExec && _coaExec.commit_unit_count) || 0;
        var activeSide = (_coaExec && _coaExec.side) || 'RED';
        var unitsMissing = committed > 0 ? Math.max(0, committed - _sideUnitCount(activeSide)) : 0;
        var objectiveReached = obj ? (blueNear > 0) : false;
        var objectiveContested = obj ? (redNear > 0) : (redTotal > 0);
        var blueSuccess = objectiveReached && !objectiveContested && blueTotal > 0;
        var redActive = redTotal > 0;
        var blueUnable = blueTotal === 0;
        var redUnable = redTotal === 0;
        var shouldContinue = !(blueSuccess || blueUnable || redUnable);
        var replanRequired = shouldContinue && (objectiveContested || !objectiveReached);
        var summary = objectiveReached
            ? (objectiveContested ? 'Objective reached but contested — Red still active near the objective.' : 'Objective reached and uncontested.')
            : (obj ? 'Objective not yet reached.' : 'No objective placed — adjudicating force status only.');
        return { objective: obj || null, objective_reached: objectiveReached, objective_contested: objectiveContested,
            blue_success: blueSuccess, red_active: redActive, blue_total: blueTotal, red_total: redTotal,
            blue_near_obj: blueNear, red_near_obj: redNear, units_missing: unitsMissing,
            blue_unable: blueUnable, red_unable: redUnable, should_continue: shouldContinue,
            replan_required: replanRequired,
            replan_reason: replanRequired ? (objectiveContested ? 'Objective contested by Red — Blue needs new orders.' : 'Objective not secured — Blue needs new orders.') : null,
            reason: summary, summary: summary };
    }
    // Simple deterministic Red reaction posture (v1 — NO Red LLM yet; decision recorded only).
    function _redReaction(outcome) {
        var posture, reason;
        if (outcome.blue_success) { posture = 'withdraw'; reason = 'Blue secured the objective — Red withdraws to preserve force.'; }
        else if (outcome.objective_contested && outcome.objective_reached) { posture = 'counter'; reason = 'Objective contested — Red counters to retake it.'; }
        else if (outcome.objective_reached) { posture = 'block'; reason = 'Blue at the objective — Red blocks consolidation.'; }
        else if (!outcome.red_active) { posture = 'none'; reason = 'Red has no active units to react.'; }
        else { posture = 'hold'; reason = 'Objective not yet reached — Red holds a defensive posture.'; }
        return { posture: posture, reason: reason, summary: 'Red ' + posture + ' (deterministic, no LLM)' };
    }
    // ── RMOOZ-FREE-FIGHT-AUTO-SCENARIO-DIRECTOR-AB ───────────────────────────────────────────────────
    // Deterministic Staff-Safe next Blue order — NO LLM, NO /plan-coas. Builds a small COA from the White
    // outcome and commits it into the EXISTING committed-COA execution state (via _commitCoa). Returns
    // {ok, coa_id, posture} or {ok:false, reason} when no safe deterministic order is possible.
    function _scenarioSideUnits(side) { return _greenUnits().filter(function (u) { return String(u.side || '').toUpperCase() === side; }); }
    function _autoDirectorBuildCoa(outcome) {
        var obj = getObjective();
        var blue = _scenarioSideUnits('BLUE');
        if (!blue.length) return null;                          // nothing to order
        var posture, title;
        if (!obj) { posture = 'consolidate'; title = 'Consolidate (no objective)'; }
        else if (outcome.blue_total > 0 && outcome.blue_total < outcome.units_missing) { posture = 'consolidate'; title = 'Consolidate / hold (Blue weak)'; }
        else if (outcome.objective_contested && outcome.objective_reached) { posture = 'hold_screen'; title = 'Hold & screen the objective'; }
        else if (outcome.objective_contested) { posture = 'secure'; title = 'Secure / screen the objective'; }
        else if (!outcome.objective_reached) { posture = 'advance'; title = 'Continue the advance'; }
        else { posture = 'consolidate'; title = 'Consolidate on the objective'; }
        var actions = blue.map(function (u) {
            if (posture === 'consolidate' || posture === 'hold_screen') {
                // hold in place (or a screen) — no relocation needed for v1's deterministic order
                return { unit_uid: u.id, action_type: 'HOLD_POSITION', role: (posture === 'hold_screen' ? 'screen' : 'reserve') };
            }
            // secure / advance → move toward the objective (capped + teleport-guarded at execution time)
            return { unit_uid: u.id, action_type: 'MOVE', role: (posture === 'secure' ? 'assault' : 'advance'), target: { lat: obj.lat, lon: obj.lon } };
        });
        return { plan_id: 'AUTO-T' + (_scenario ? _scenario.scenario_turn : 1), title: title, side: 'BLUE',
            recommended: true, risk: 'low', confidence: 'medium', source_type: 'staff_safe_auto_director', posture: posture,
            phases: [{ name: title, actions: actions }] };
    }
    function _autoDirectorNextBlueOrder(outcome) {
        var coa = _autoDirectorBuildCoa(outcome);
        if (!coa || !arr(coa.phases[0].actions).length) return { ok: false, reason: 'No safe deterministic Blue order available — operator decision needed.' };
        // a deterministic, honestly-labelled Staff-Safe plan (NOT an LLM plan, never hits /plan-coas)
        _coaPlan = { ok: true, plan_source: 'deterministic', planning_mode: 'staff_safe', recommended_plan_id: coa.plan_id,
            source: { type: 'staff_safe_auto_director' }, _requestedVia: 'auto_director', coas: [coa] };
        _coaSelectedIdx = 0;
        var ex = _commitCoa(0);   // builds _coaExec (pending) — deterministic, no LLM, no /plan-coas
        if (!ex) return { ok: false, reason: 'Auto-director order could not be committed — operator decision needed.' };
        return { ok: true, coa_id: coa.plan_id, posture: coa.posture, source: 'staff_safe_auto_director' };
    }
    // Deterministic Red maneuver — actually MOVES Red units through the SAME safe/teleport-guarded path
    // as Blue (_resolveCoaMoves → _writeMoveFrame). NO LLM. Returns {posture, moved, summary}.
    function _redManeuverOrder(outcome) {
        var posture = _redReaction(outcome).posture;
        var obj = getObjective();
        var red = _scenarioSideUnits('RED');
        var actions = [];
        if ((posture === 'counter' || posture === 'block') && obj) {
            // move toward the objective to contest / block
            red.forEach(function (u) { actions.push({ unit_uid: u.id, action_type: 'MOVE', role: posture, target: { lat: obj.lat, lon: obj.lon } }); });
        } else if (posture === 'withdraw' && obj) {
            // move away from the objective (reflect the obj→unit vector outward)
            red.forEach(function (u) {
                var dLat = (u.lat - obj.lat), dLon = (u.lon - obj.lon);
                var mag = Math.sqrt(dLat * dLat + dLon * dLon) || 1;
                actions.push({ unit_uid: u.id, action_type: 'MOVE', role: 'withdraw', target: { lat: u.lat + (dLat / mag) * 0.2, lon: u.lon + (dLon / mag) * 0.2 } });
            });
        } // hold / none → no movement orders
        var moved = 0;
        if (actions.length) {
            var redCoa = { plan_id: 'RED-AUTO-T' + (_scenario ? _scenario.scenario_turn : 1), side: 'RED', phases: [{ name: posture, actions: actions }] };
            var moves = _resolveCoaMoves(redCoa).filter(function (m) { return !m.hold; });   // capped + teleport-guarded
            _writeMoveFrame(moves, 1);                                                        // apply the safe move
            moved = moves.length;
            if (moved && mapReady()) { try { _triggerScenarioRedraw(); syncMarkers(); } catch (_) {} }
        }
        return { posture: posture, moved: moved, summary: 'Red ' + posture + (moved ? ' — moved ' + moved + ' unit(s)' : ' — held') + ' (deterministic, no LLM)' };
    }
    function _scenarioEndCondition(outcome) {
        if (outcome.blue_success) return { code: 'objective_secured', summary: 'Objective secured by Blue — scenario complete.' };
        if (outcome.blue_unable) return { code: 'blue_unable_to_continue', summary: 'Blue has no units able to continue — scenario complete.' };
        if (outcome.red_unable) return { code: 'red_unable_to_contest', summary: 'Red has no units able to contest — scenario complete.' };
        if (_scenario && _scenario.scenario_turn >= (_scenario.max_turns || SCENARIO_MAX_TURNS)) return { code: 'max_turns_reached', summary: 'Maximum scenario turns reached — scenario complete.' };
        return null;
    }
    function _startScenarioTimer() { _clearIntervalSafe(_scenarioTimer); _scenarioTimer = _setIntervalSafe(_scenarioTick, _coaExecTickMs()); }
    function _stopScenarioTimer() { _clearIntervalSafe(_scenarioTimer); _scenarioTimer = null; }
    // One scenario tick: drive the deterministic Blue execution, OR — when phases finish/block — run the
    // White→Green→Red turn transition. NEVER calls the LLM; NEVER hits /plan-coas.
    function _scenarioTick() {
        if (!_scenarioActive() || _scenario.scenario_status !== 'running') return null;
        var ex = _coaExec;
        if (ex && ex.active && !ex.replan_required && ex.phase_status !== 'complete') {
            _scenario.current_actor = 'unit-controller';
            return _coaExecTick();   // deterministic; llm_called_this_tick:false; no /plan-coas
        }
        return _scenarioTransition();
    }
    // White → Green → (Red maneuver) → next Blue order. All deterministic, no LLM, no /plan-coas.
    // Manual: pauses "needs new Blue orders". Auto: the Auto Director commits a Staff-Safe next order and
    // the fight continues — pausing only on an end condition, a serious blocked state, or the auto-turn cap.
    function _scenarioTransition() {
        if (!_scenarioActive()) return null;
        var auto = !!(_scenario.auto_continue && _scenario.auto_director_enabled);
        // serious blocked condition mid-execution (replan trigger) → pause for a human decision, even in auto.
        if (_coaExec && _coaExec.replan_required) {
            _scenario.scenario_status = 'blocked';
            _scenario.pending_replan_reason = _coaExec.replan_reason || 'Execution blocked — operator decision needed.';
            _scenario.current_actor = 'blue'; _scenario.updated_at = _nowISO();
            _stopScenarioTimer();
            try { _appendToEventLog('Scenario BLOCKED (turn ' + _scenario.scenario_turn + '): ' + esc(_scenario.pending_replan_reason) + ' — operator decision needed (auto-director will not override a blocked state).'); } catch (_) {}
            updatePanel();
            return _scenario;
        }
        // 1) White adjudication (deterministic)
        _scenario.current_actor = 'white';
        var outcome = _whiteScenarioOutcome();
        _scenario.last_outcome = outcome.summary;
        try { _recordDecision({ role: 'white', action: 'scenario_outcome_check', called_llm: false, source: 'scenario',
            reason: outcome.reason, result_summary: 'turn ' + _scenario.scenario_turn + ' · ' + outcome.summary + ' · contested ' + outcome.objective_contested }); } catch (_) {}
        try { _appendToEventLog('White: ' + (outcome.blue_success ? 'objective secured' : (outcome.objective_contested ? 'objective contested — scenario continues' : 'scenario continues')) + ' (turn ' + _scenario.scenario_turn + ', deterministic, no AI).'); } catch (_) {}
        // 2) Green refresh (deterministic; /neutral-world only; fire-and-forget; no LLM)
        _scenario.current_actor = 'green';
        try { _refreshGreenWorld('scenario_turn'); } catch (_) {}
        // end conditions (incl. the auto-turn cap in auto mode)
        var end = _scenarioEndCondition(outcome);
        if (!end && auto && _scenario.scenario_turn >= (_scenario.max_auto_turns || SCENARIO_MAX_AUTO_TURNS)) {
            end = { code: 'max_auto_turns_reached', summary: 'Auto-director turn limit reached — operator decision needed.' };
        }
        if (end) {
            _scenario.scenario_status = 'complete'; _scenario.end_condition = end.code; _scenario.last_outcome = end.summary;
            _scenario.current_actor = 'white'; _scenario.pending_replan_reason = null; _scenario.updated_at = _nowISO();
            _stopScenarioTimer();
            try { _appendToEventLog('Scenario complete — ' + esc(end.code) + ': ' + esc(end.summary)); } catch (_) {}
            updatePanel();
            return _scenario;
        }
        // 3) Red reaction (decision + a real deterministic maneuver that MOVES Red units, teleport-guarded)
        _scenario.current_actor = 'red';
        var red = _redReaction(outcome);
        try { _recordDecision({ role: 'red', action: 'red_reaction', called_llm: false, source: 'scenario', reason: red.reason, result_summary: red.summary }); } catch (_) {}
        var maneuver = _redManeuverOrder(outcome);
        _scenario.last_red_maneuver = maneuver.summary;
        try { _recordDecision({ role: 'red', action: 'red_maneuver_order', called_llm: false, source: 'scenario', reason: red.reason, result_summary: maneuver.summary }); } catch (_) {}
        try { _appendToEventLog('Red maneuver (turn ' + _scenario.scenario_turn + '): ' + esc(maneuver.posture) + (maneuver.moved ? ' — moved ' + maneuver.moved + ' unit(s)' : ' — held') + '.'); } catch (_) {}
        _scenario.blue_cycle++; _scenario.red_cycle++;
        _scenario.scenario_turn++;
        // 4) next Blue order
        if (auto) {
            var blue = _autoDirectorNextBlueOrder(outcome);
            if (blue.ok) {
                _scenario.last_auto_order_source = blue.source;   // 'staff_safe_auto_director'
                _scenario.scenario_status = 'running'; _scenario.current_actor = 'unit-controller';
                _scenario.pending_replan_reason = null; _scenario.updated_at = _nowISO();
                try { _recordDecision({ role: 'performance', action: 'auto_director_next_blue_order', called_llm: false, source: 'staff_safe_auto_director', reason: 'deterministic next Blue order (' + blue.posture + ')', result_summary: blue.coa_id + ' · ' + blue.posture }); } catch (_) {}
                try { _appendToEventLog('Auto Director: generated Staff-Safe Blue next order (' + esc(blue.posture) + ') — turn ' + _scenario.scenario_turn + ', no AI.'); } catch (_) {}
                if (!_scenarioTimer) _startScenarioTimer();   // keep the fight ticking
            } else {
                _scenario.scenario_status = 'blocked'; _scenario.pending_replan_reason = blue.reason;
                _scenario.current_actor = 'blue'; _scenario.updated_at = _nowISO();
                _stopScenarioTimer();
                try { _appendToEventLog('Auto Director could not continue safely (turn ' + _scenario.scenario_turn + '): ' + esc(blue.reason)); } catch (_) {}
            }
        } else {
            _scenario.scenario_status = 'paused';   // manual — the fight continues, but Blue needs new orders (no LLM on ticks)
            _scenario.pending_replan_reason = outcome.replan_reason || 'Scenario continues — Blue needs new orders for the next turn.';
            _scenario.current_actor = 'blue'; _scenario.updated_at = _nowISO();
            _stopScenarioTimer();
            try { _appendToEventLog('Scenario needs new Blue orders (turn ' + _scenario.scenario_turn + '): ' + esc(_scenario.pending_replan_reason)); } catch (_) {}
        }
        updatePanel();
        return _scenario;
    }
    // RMOOZ-FREE-FIGHT-AUTO-SCENARIO-DIRECTOR-AB: the operator "Auto Continue" toggle. Persists across
    // scenarios; turning it ON while paused-for-orders resumes the auto loop immediately.
    function _toggleScenarioAuto() {
        _scenarioAutoContinue = !_scenarioAutoContinue;
        if (_scenario) _scenario.auto_continue = _scenarioAutoContinue;
        try { _appendToEventLog('Auto Continue Scenario ' + (_scenarioAutoContinue ? 'ENABLED — deterministic Staff-Safe orders, no AI on normal turns.' : 'disabled — manual orders.')); } catch (_) {}
        if (_scenarioAutoContinue && _scenario && (_scenario.scenario_status === 'paused')) { _runScenario(); return; }
        updatePanel();
    }
    function _runScenario() {
        if (!_coaExec || !_coaExec.active) return null;
        if (!_scenarioActive()) {
            _scenario = _newScenario();
            try { _appendToEventLog('Run Scenario — continuous fight started. Deterministic ticks; the AI is NOT called on normal ticks.'); } catch (_) {}
        } else { _scenario.scenario_status = 'running'; _scenario.pending_replan_reason = null; }
        if (_coaExec.phase_status !== 'complete') { _coaExec.paused = false; _coaExec.replan_required = false; }
        _startScenarioTimer();
        _scenarioTick();   // run one immediately so the operator sees the fight move
        updatePanel();
        return _scenario;
    }
    function _pauseScenario() {
        if (!_scenarioActive()) return;
        _scenario.scenario_status = 'paused'; _scenario.updated_at = _nowISO();
        _stopScenarioTimer(); _clearIntervalSafe(_coaExecTimer); _coaExecTimer = null;
        try { _appendToEventLog('Scenario paused by operator.'); } catch (_) {}
        updatePanel();
    }
    function _stopScenario() {
        if (!_scenario) return;
        _stopScenarioTimer(); _clearIntervalSafe(_coaExecTimer); _coaExecTimer = null;
        _scenario.scenario_status = 'complete'; _scenario.end_condition = 'operator_stopped';
        _scenario.last_outcome = 'Operator stopped the scenario.'; _scenario.pending_replan_reason = null; _scenario.updated_at = _nowISO();
        try { _appendToEventLog('Scenario stopped by operator.'); } catch (_) {}
        updatePanel();
    }
    function _resetScenario() { _stopScenarioTimer(); _scenario = null; }
    // ── RMOOZ-FREE-FIGHT-CONTROL-HARD-RESET-X: the NEW Free Fight control window (the "cockpit") ───────
    // A clean, single-flow, state-driven UI built from scratch. It REUSES the existing engine (planner,
    // COA execution, deterministic ticks, validation, Green/White advisory, ranking) — it changes NO
    // backend logic. Design rules: render ONLY the active state's view; unique `v2-*` data-act ids (no
    // hidden duplicates); ≤2 primary actions visible at once; no raw JSON / benchmark / decision log in
    // the main flow (those live behind the closed Diagnostics/Legacy drawer). Every visible button maps
    // to an existing engine function and updates the visible state immediately on click.
    function _freeFightControlStateV2() {
        var coas = arr(_coaPlan && _coaPlan.coas);
        var hasPlan = !!(_coaPlan && _coaPlan.ok && coas.length);
        var ex = _coaExec;
        if (_coaLoading) return 'planning';
        if (ex && ex.replan_required) return 'blocked';
        if (ex && ex.phase_status === 'complete') return 'complete';
        if (ex && ex.active) {
            if (!ex.paused && ex.phase_status === 'running') return 'running';
            if (ex.paused) return 'paused';
            return 'committed';   // active + pending (committed, not yet run)
        }
        return hasPlan ? 'ready' : 'empty';
    }
    function _v2StateLabel(s) { return ({ empty: 'No plan', planning: 'Planning…', ready: 'Plan ready', committed: 'Committed', running: 'Running', paused: 'Paused', blocked: 'Blocked', complete: 'Complete' })[s] || s; }
    function _v2StateColor(s) { return ({ planning: '#e0c060', running: '#7fd6a0', paused: '#cdb86a', blocked: '#f0707a', complete: '#7fd6a0', committed: '#9ec2ec', ready: '#9ec2ec', empty: '#8fa5b8' })[s] || '#9ec2ec'; }
    function _v2CoaId(coas, i) { return (coas[i] && coas[i].plan_id) || ('COA-' + (i + 1)); }
    function _v2Pri(act, label, title) { return '<button data-ff-v2-primary="1" data-act="' + act + '"' + (title ? ' title="' + esc(title) + '"' : '') + ' style="font:inherit;cursor:pointer;border:1px solid #2e7d54;background:#15301f;color:#9fe8c0;border-radius:6px;padding:8px 16px;font-size:12.5px;font-weight:700;">' + label + '</button>'; }
    function _v2Sec(act, label, title) { return '<button data-act="' + act + '"' + (title ? ' title="' + esc(title) + '"' : '') + ' style="font:inherit;cursor:pointer;border:1px solid #4a5f75;background:#101b27;color:#9fb8c8;border-radius:6px;padding:7px 12px;font-size:11px;">' + label + '</button>'; }
    function _v2Adv(act, label, title) { return '<button data-act="' + act + '"' + (title ? ' title="' + esc(title) + '"' : '') + ' style="font:inherit;cursor:pointer;border:1px dashed #5a6270;background:#171b21;color:#8fa5b8;border-radius:5px;padding:4px 9px;font-size:10px;">' + label + '</button>'; }
    function _v2Note(t, c) { return '<div style="margin-top:6px;font-size:10.5px;color:' + (c || '#9fb8c8') + ';line-height:1.5;">' + t + '</div>'; }
    function _v2ModelReadinessHtml() {
        var s = null; try { s = _modelFlowStatus(); } catch (_) {}
        var label = (s && s.label) ? s.label : 'Checking AI…';
        var col = (s && s.color) ? s.color : '#8fa5b8';
        var sel = (s && s.selected) ? (' · ' + esc(s.selected)) : '';
        return '<div data-ff-v2="model-readiness" style="margin-top:6px;font-size:9.5px;color:' + col + ';">● ' + esc(label) + sel + '</div>';
    }
    // Clickable COA cards — recommended is visually first-class; the selected card is clearly highlighted.
    function _v2CoaCardsHtml(coas, recIdx) {
        var h = '<div data-ff-v2="coa-cards" style="margin-top:8px;display:flex;flex-direction:column;gap:6px;">';
        coas.forEach(function (coa, i) {
            var sel = (i === _coaSelectedIdx);
            var isRec = (i === recIdx);
            var id = _v2CoaId(coas, i);
            var border = sel ? '#4a9ed6' : (isRec ? '#2e7d54' : '#2a3f55');
            var bg = sel ? '#0a1c33' : '#0c141d';
            var risk = coa.risk || '—';
            var riskCol = risk === 'high' ? '#f08080' : (risk === 'medium' ? '#e0c060' : '#90d090');
            var score = (coa._ranking && coa._ranking.final_score != null) ? coa._ranking.final_score : null;
            h += '<div data-act="v2-coa-' + i + '" data-ff-v2-coa="' + i + '"' + (sel ? ' data-ff-v2-selected="1"' : '') + ' style="cursor:pointer;border:' + (sel ? '2px' : '1px') + ' solid ' + border + ';border-radius:6px;background:' + bg + ';padding:' + (isRec ? '9px 11px' : '7px 10px') + ';">';
            h += '<div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">';
            h += '<span style="font-weight:700;font-size:' + (isRec ? '12px' : '11px') + ';color:#e8eaed;">' + (sel ? '▶ ' : '') + esc(id) + ' — ' + esc(coa.title || '') + '</span>';
            h += '<span style="display:flex;gap:4px;align-items:center;flex-shrink:0;">';
            if (isRec) h += '<span style="background:#1a5030;color:#7fd6a0;border-radius:3px;padding:1px 6px;font-size:9px;font-weight:700;">★ Recommended</span>';
            if (sel) h += '<span data-ff-v2="selected-badge" style="background:#13344f;color:#cfe6ff;border-radius:3px;padding:1px 6px;font-size:9px;font-weight:700;">Selected</span>';
            h += '</span></div>';
            h += '<div style="margin-top:3px;font-size:10px;color:#9ab0c0;">Risk <span style="color:' + riskCol + ';">' + esc(risk) + '</span> · Confidence <span style="color:#9ec2ec;">' + esc(coa.confidence || '—') + '</span>' + (score != null ? ' · Score <b style="color:#cfe6ff;">' + score + '</b>' : '') + '</div>';
            if (isRec && coa._ranking && coa._ranking.ranking_reason) h += '<div style="margin-top:2px;font-size:9px;color:#7fd6a0;">Recommended because: ' + esc(coa._ranking.ranking_reason) + '</div>';
            if (coa.summary) h += '<div style="margin-top:2px;font-size:9.5px;color:#cdd8e4;font-style:italic;">' + esc(coa.summary) + '</div>';
            h += '</div>';
        });
        h += '</div>';
        return h;
    }
    // ── RMOOZ-FREE-FIGHT-V2-OPERATOR-WALKTHROUGH-Y: a compact "What to do now" stepper + microcopy +
    // a richer selected-COA summary. UI guidance only — NO new actions, NO backend touch. ──────────────
    var _V2_STEPS = [[1, 'Generate'], [2, 'Select COA'], [3, 'Commit'], [4, 'Run'], [5, 'Pause/Resume']];
    // current step(s) per state — a small set so 'ready' can highlight both Select + Commit.
    function _v2StepperCurrentSet(state) {
        return ({ empty: [1], planning: [1], ready: [2, 3], committed: [4], running: [4], paused: [5], blocked: [4], complete: [5] })[state] || [1];
    }
    function _v2StepStatus(state, n) {
        var cur = _v2StepperCurrentSet(state);
        if (cur.indexOf(n) !== -1) return (state === 'blocked' && n === 4) ? 'blocked' : 'current';
        return n < Math.min.apply(null, cur) ? 'done' : 'todo';
    }
    function _v2StepperHtml(state) {
        var h = '<div data-ff-v2="stepper" data-ff-v2-stepper-state="' + state + '" style="margin:8px 0 2px;padding:6px 8px;border:1px solid #1d3a52;border-radius:6px;background:#0a1320;">';
        h += '<div style="font-size:9px;color:#8fa5b8;font-weight:700;margin-bottom:4px;letter-spacing:.4px;">WHAT TO DO NOW</div>';
        h += '<div style="display:flex;gap:3px;flex-wrap:wrap;align-items:center;">';
        _V2_STEPS.forEach(function (s, i) {
            var st = _v2StepStatus(state, s[0]);
            var col = st === 'blocked' ? '#f0707a' : (st === 'current' ? '#cfe6ff' : (st === 'done' ? '#5a9a70' : '#5a6f80'));
            var bg = st === 'current' ? '#13314f' : (st === 'blocked' ? '#2a1416' : 'transparent');
            var bd = st === 'current' ? '#3a6fa0' : (st === 'blocked' ? '#7a3030' : '#243443');
            var mark = st === 'done' ? '✓' : s[0];
            h += '<span data-ff-v2-step="' + s[0] + '" data-ff-v2-step-status="' + st + '" style="display:inline-flex;align-items:center;gap:3px;font-size:9px;color:' + col + ';border:1px solid ' + bd + ';background:' + bg + ';border-radius:10px;padding:2px 7px;' + ((st === 'current' || st === 'blocked') ? 'font-weight:700;' : '') + '"><b>' + mark + '</b> ' + s[1] + '</span>';
            if (i < _V2_STEPS.length - 1) h += '<span style="color:#3a4a59;font-size:9px;">→</span>';
        });
        h += '</div></div>';
        return h;
    }
    // Terse microcopy printed under the primary action(s), per state (the exact owner-specified phrases).
    function _v2MicrocopyHtml(state) {
        var items = [];
        if (state === 'empty' || state === 'planning' || state === 'complete') items.push(['⚡ Generate AI Plan', 'slow — calls AI']);
        if (state === 'ready') items.push(['✅ Commit Selected Plan', 'locks the selected COA']);
        if (state === 'committed' || state === 'running' || state === 'paused') items.push(['▶ Run Plan', 'fast — no AI on normal ticks']);
        if (state === 'blocked') { items.push(['▶ Run Plan', 'fast — no AI on normal ticks']); items.push(['↻ Replan with AI', 'advanced — calls AI again']); }
        if (!items.length) return '';
        var h = '<div data-ff-v2="microcopy" style="margin-top:5px;display:flex;flex-direction:column;gap:1px;">';
        items.forEach(function (it) { h += '<div style="font-size:9px;color:#7a93a6;"><b style="color:#9fb8c8;">' + it[0] + '</b> — ' + it[1] + '</div>'; });
        h += '</div>';
        return h;
    }
    // Richer selected-COA summary for the READY state: Selected · Recommended · Operator override · Final
    // score (when ranked). When nothing is selected, guides the operator to pick a card first.
    function _v2SelectedSummaryHtml(coas, recIdx) {
        var hasSel = (_coaSelectedIdx >= 0 && _coaSelectedIdx < coas.length);
        var h = '<div data-ff-v2="selected-summary" style="margin-top:8px;padding:6px 9px;border:1px solid #2a4d6a;border-radius:6px;background:#08131e;font-size:10px;color:#cdd8e4;">';
        if (!hasSel) {
            h += '<div data-ff-v2="no-selection" style="color:#e0a93a;">⚠ Select a COA card first.</div></div>';
            return h;
        }
        var selId = _v2CoaId(coas, _coaSelectedIdx), recId = _v2CoaId(coas, recIdx);
        var override = (_coaSelectedIdx !== recIdx);
        var sel = coas[_coaSelectedIdx] || {};
        var score = (sel._ranking && sel._ranking.final_score != null) ? sel._ranking.final_score : null;
        h += '<div><span style="color:#8fa5b8;">Selected COA:</span> <b style="color:#cfe6ff;">' + esc(selId) + '</b> · <span style="color:#8fa5b8;">Recommended:</span> <b style="color:#7fd6a0;">' + esc(recId) + '</b></div>';
        h += '<div><span style="color:#8fa5b8;">Operator override:</span> <b style="color:' + (override ? '#e0a93a' : '#7fd6a0') + ';">' + (override ? 'yes' : 'no') + '</b>' + (score != null ? ' · <span style="color:#8fa5b8;">Final score:</span> <b style="color:#cfe6ff;">' + score + '</b>' : '') + '</div>';
        if (override) h += '<div data-ff-v2="override" style="margin-top:3px;color:#e0a93a;">⚠ Operator override: you selected ' + esc(selId) + ' instead of recommended ' + esc(recId) + '.</div>';
        h += '</div>';
        return h;
    }
    // Committed/blocked/complete summary: selected + recommended + override + Green/White advisory (advisory only).
    function _v2CommittedSummaryHtml() {
        var ex = _coaExec;
        if (!ex) return '';
        var cac = ex.commit_advisory_context || {};
        var h = '<div data-ff-v2="committed-summary" style="margin-top:8px;padding:7px 9px;border:1px solid #2a4d6a;border-radius:6px;background:#08131e;font-size:10px;color:#cdd8e4;">';
        h += '<div><span style="color:#8fa5b8;">Committed plan:</span> <b style="color:#e8eaed;">' + esc(ex.selected_coa_id) + '</b></div>';
        if (cac.considered) {
            h += '<div><span style="color:#8fa5b8;">Recommended:</span> <b style="color:#7fd6a0;">' + esc(cac.recommended_coa_id) + '</b> · <span style="color:#8fa5b8;">Operator override:</span> <b style="color:' + (cac.operator_override ? '#e0a93a' : '#7fd6a0') + ';">' + (cac.operator_override ? 'yes' : 'no') + '</b></div>';
        }
        var adv = _whiteAdvisory(_greenWorld);
        var ga = cac.green_advisory || _greenAdvisoryScoring(_greenWorld);
        h += '<div data-ff-v2="advisory" style="margin-top:4px;padding-top:4px;border-top:1px solid #163048;">';
        h += '<div>⚖ <span style="color:#8fa5b8;">Green/White advisory:</span> ' + (adv
            ? '<b style="color:' + _whiteAdvisoryColor(adv.advisory_level) + ';">' + esc(adv.advisory_level) + '</b> — ' + esc(adv.note)
            : '<span style="color:#8fa5b8;">no Green assessment yet (refresh Green in Diagnostics).</span>') + '</div>';
        if (ga && ga.considered) h += '<div style="color:#9ab0c0;">Green collateral: ' + esc(ga.collateral_risk_band) + ' · advisory Δ ' + ga.advisory_score_delta + (ga.neutral_reaction_score != null ? ' · reaction ' + ga.neutral_reaction_score : '') + '</div>';
        h += '<div style="margin-top:2px;font-size:9px;color:#5a7a8a;">Advisory only — not a block. The structure/physics validator is the only gate.</div>';
        h += '</div></div>';
        return h + _v2MovementSummaryHtml();
    }
    function _v2RunProgressHtml() {
        var ex = _coaExec;
        if (!ex) return '';
        var phases = arr(ex.selected_coa && ex.selected_coa.phases);
        var pIdx = Math.min(ex.current_phase_index, Math.max(0, phases.length - 1));
        var phase = phases[pIdx] || {};
        var pct = phases.length ? Math.round((Math.min(ex.current_phase_index, phases.length) / phases.length) * 100) : 0;
        var h = '<div data-ff-v2="progress" style="margin-top:8px;font-size:10.5px;color:#cdd8e4;">';
        h += '<div><span style="color:#8fa5b8;">Plan:</span> <b style="color:#e8eaed;">' + esc(ex.selected_coa_id) + '</b> · <span style="color:#8fa5b8;">tick</span> ' + ex.ticks + '</div>';
        h += '<div><span style="color:#8fa5b8;">Current phase:</span> <b style="color:#cfe6ff;">' + (ex.phase_status === 'complete' ? 'all done' : ((ex.current_phase_index + 1) + ' / ' + phases.length + (phase.name ? ' — ' + esc(phase.name) : ''))) + '</b></div>';
        h += '<div data-ff-v2="tickstatus" style="font-size:9.5px;color:#7fd6a0;">Tick status: deterministic · llm_called_this_tick: <b>false</b></div>';
        h += '<div style="margin-top:4px;height:6px;background:#0c1622;border:1px solid #24435f;border-radius:4px;overflow:hidden;"><div style="width:' + pct + '%;height:100%;background:#2e7d54;"></div></div>';
        h += '</div>';
        return h + _v2MovementSummaryHtml();
    }
    // ── RMOOZ-FREE-FIGHT-V2-REAL-OPERATOR-ACCEPTANCE-Z: movement feedback. A committed COA that holds
    // position (or whose units are already at their objective) runs to "complete" with ZERO map movement
    // — without this line the operator reads that as "Run doesn't work". Render-time only; reads the
    // committed COA's own orders + the exec's completed_orders. No engine/movement/physics change.
    function _v2CoaActionCounts(coa) {
        var move = 0, hold = 0;
        arr(coa && coa.phases).forEach(function (ph) {
            arr(ph.actions).forEach(function (a) { if (!a) return; if (a.action_type === 'HOLD_POSITION') hold++; else move++; });
        });
        return { move: move, hold: hold };
    }
    function _v2MovementSummaryHtml() {
        var ex = _coaExec;
        if (!ex || !ex.selected_coa) return '';
        var c = _v2CoaActionCounts(ex.selected_coa);
        var doneMoves = arr(ex.completed_orders).filter(function (o) { return o && o.action_type && o.action_type !== 'HOLD_POSITION'; }).length;
        var complete = ex.phase_status === 'complete';
        var h = '<div data-ff-v2="movement" style="margin-top:6px;font-size:9.5px;color:#9ab0c0;border-top:1px solid #163048;padding-top:4px;">';
        h += 'Movement: this plan orders <b style="color:#cfe6ff;">' + c.move + '</b> move · <b style="color:#cfe6ff;">' + c.hold + '</b> hold' + (c.move > 0 ? ' · executed <b style="color:#cfe6ff;">' + doneMoves + '</b>' : '');
        h += '</div>';
        if (c.move === 0) {
            h += '<div data-ff-v2="no-movement" style="margin-top:3px;font-size:9.5px;color:#e0a93a;">ⓘ This COA holds position — no unit movement is expected on the map. Generate or select a maneuver COA (one with MOVE orders) to see units move.</div>';
        } else if (complete && doneMoves === 0) {
            h += '<div data-ff-v2="no-movement" style="margin-top:3px;font-size:9.5px;color:#e0a93a;">ⓘ The plan completed but no maneuver orders executed — units may already be at their objective. Open Diagnostics → COA to review the committed orders.</div>';
        }
        return h;
    }
    function _v2PlanningElapsed() { try { return _coaLoadingStart ? Math.max(0, Math.round((Date.now() - _coaLoadingStart) / 1000)) : 0; } catch (_) { return 0; } }
    // Distinct blue primary for the scenario action (visually separates Run Scenario from Run Plan).
    function _v2ScenarioPri(act, label, title) { return '<button data-ff-v2-primary="1" data-act="' + act + '"' + (title ? ' title="' + esc(title) + '"' : '') + ' style="font:inherit;cursor:pointer;border:1px solid #4a7bb8;background:#13243a;color:#9ec2ec;border-radius:6px;padding:8px 16px;font-size:12.5px;font-weight:700;">' + label + '</button>'; }
    // What the operator must do next, in plain language (drives the "Next required action" line).
    function _scenarioNextActionText() {
        var s = _scenario; if (!s) return '';
        var auto = !!(s.auto_continue && s.auto_director_enabled);
        if (s.scenario_status === 'running') return auto ? 'Auto Director running — deterministic Staff-Safe orders, no AI.' : ('Fight running — ' + (s.current_actor || 'unit-controller') + ' acting.');
        if (s.scenario_status === 'complete') return 'Scenario over (' + (s.end_condition || 'ended') + ').';
        if (s.scenario_status === 'blocked') return 'Blocked — operator decision needed: ' + (s.pending_replan_reason || '');
        if (_coaLoading) return 'Generating the next Blue order…';
        if (_coaExec && _coaExec.active && _coaExec.phase_status !== 'complete') return 'Press Continue Scenario to run the next turn.';
        if (_coaPlan && _coaPlan.ok && arr(_coaPlan.coas).length) return 'Commit the next order, then Continue Scenario.';
        return auto ? 'Enable Auto Continue to keep going, or give Blue new orders.' : 'Blue needs new orders — Replan with AI or use a Staff-Safe order.';
    }
    // The Auto Continue toggle + its one-line explanation (shown in committed view and the scenario console).
    function _v2AutoToggleHtml() {
        var on = !!_scenarioAutoContinue;
        return '<div data-ff-v2="auto-toggle" style="margin-top:6px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:10px;">' +
            '<label style="display:flex;align-items:center;gap:5px;cursor:pointer;color:#9ec2ec;font-weight:600;"><input type="checkbox" data-act="v2-scenario-auto-toggle"' + (on ? ' checked' : '') + ' style="accent-color:#5bd6a0;cursor:pointer;"> Auto Continue Scenario</label>' +
            '<span data-ff-v2-auto="' + (on ? '1' : '0') + '" style="color:' + (on ? '#7fd6a0' : '#8fa5b8') + ';">' + (on ? 'ON' : 'OFF') + '</span>' +
            '<span style="flex-basis:100%;font-size:9px;color:#5a7a8a;">Auto Continue uses deterministic Staff-Safe orders. No AI on normal turns.</span></div>';
    }
    // The continuous-scenario console: mode · Plan status · Scenario · Turn · Actor · Last outcome ·
    // Blue auto order source · Red last maneuver · Next action.
    function _renderScenarioCockpitV2() {
        var s = _scenario;
        var status = s.scenario_status;
        var auto = !!(s.auto_continue && s.auto_director_enabled);
        var COL = { running: '#7fd6a0', paused: '#cdb86a', complete: '#7fd6a0', blocked: '#f0707a' };
        var LBL = { running: 'Scenario running', paused: 'Scenario paused', complete: 'Scenario complete', blocked: 'Scenario blocked' };
        var phases = arr(_coaExec && _coaExec.selected_coa && _coaExec.selected_coa.phases);
        var planStatus = _coaExec
            ? (_coaExec.phase_status === 'complete' ? (esc(_coaExec.selected_coa_id) + ' complete') : (esc(_coaExec.selected_coa_id) + ' · phase ' + (Math.min(_coaExec.current_phase_index, phases.length) + (_coaExec.phase_status === 'complete' ? 0 : 1)) + '/' + phases.length))
            : (_coaLoading ? 'generating new orders…' : (_coaPlan && _coaPlan.ok ? 'new plan ready — commit to continue' : 'no committed COA'));
        var head = '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;">' +
            '<span style="font-size:12.5px;font-weight:700;color:#9ec2ec;">🎬 Free Fight — Continuous Scenario</span>' +
            '<span data-ff-v2="scenario-state" data-ff-v2-scenario-status="' + status + '" style="font-size:9.5px;font-weight:700;color:' + (COL[status] || '#9ec2ec') + ';background:#0c1622;border:1px solid #24435f;border-radius:10px;padding:2px 9px;">' + (LBL[status] || status) + '</span></div>';
        var cons = '<div data-ff-v2="scenario-status" style="margin-top:2px;padding:7px 9px;border:1px solid #2a4d6a;border-radius:6px;background:#08131e;font-size:10px;color:#cdd8e4;line-height:1.6;">' +
            '<div><span style="color:#8fa5b8;">Scenario mode:</span> <b data-ff-v2-scenario-mode="' + (auto ? 'auto' : 'manual') + '" style="color:' + (auto ? '#7fd6a0' : '#cdb86a') + ';">' + (auto ? 'Auto Continue' : 'Manual') + '</b></div>' +
            '<div><span style="color:#8fa5b8;">Plan status:</span> <b style="color:#cfe6ff;">' + planStatus + '</b></div>' +
            '<div><span style="color:#8fa5b8;">Scenario:</span> <b style="color:' + (COL[status] || '#cfe6ff') + ';">' + esc(status) + '</b> · <span style="color:#8fa5b8;">Turn:</span> <b style="color:#cfe6ff;">' + s.scenario_turn + '</b> · <span style="color:#8fa5b8;">Actor:</span> <b style="color:#cfe6ff;">' + esc(s.current_actor) + '</b></div>' +
            '<div data-ff-v2="scenario-outcome"><span style="color:#8fa5b8;">Last White outcome:</span> ' + esc(s.last_outcome || '—') + '</div>' +
            (s.last_auto_order_source ? '<div data-ff-v2="scenario-blue-src"><span style="color:#8fa5b8;">Blue auto order source:</span> <b style="color:#7bb8e8;">' + esc(s.last_auto_order_source) + '</b></div>' : '') +
            (s.last_red_maneuver ? '<div data-ff-v2="scenario-red"><span style="color:#8fa5b8;">Red last maneuver:</span> <b style="color:#f0707a;">' + esc(s.last_red_maneuver) + '</b></div>' : '') +
            '<div data-ff-v2="scenario-next"><span style="color:#8fa5b8;">Next required action:</span> <b style="color:#e0c060;">' + esc(_scenarioNextActionText()) + '</b></div>' +
            '<div style="margin-top:2px;font-size:9px;color:#7fd6a0;">Deterministic ticks · AI not called on normal ticks · /plan-coas only on explicit Replan.</div></div>' +
            _v2AutoToggleHtml();
        var hasRunnable = !!(_coaExec && _coaExec.active && _coaExec.phase_status !== 'complete');
        var hasNewPlan = !!(_coaPlan && _coaPlan.ok && arr(_coaPlan.coas).length);
        var actions = '', body = '';
        if (status === 'running') {
            actions = _v2Pri('v2-scenario-pause', '⏸ Pause Scenario', 'Pause the continuous fight') + _v2Sec('v2-scenario-stop', '⏹ Stop Scenario');
            body = _v2RunProgressHtml();
        } else if (status === 'complete') {
            actions = _v2ScenarioPri('v2-run-scenario', '🎬 Run Another Turn', 'Continue the fight from here') + _v2Sec('v2-generate', '⚡ New AI Plan') + _v2Sec('v2-clear', 'Clear / Exit Scenario');
            body = '<div data-ff-v2="scenario-complete" style="margin-top:8px;padding:6px 9px;border:1px solid #1a4030;border-radius:6px;background:#0c1f14;color:#9fd6b0;font-size:10px;">✅ Scenario complete — ' + esc(s.end_condition || 'ended') + (s.last_outcome ? ': ' + esc(s.last_outcome) : '') + '</div>';
        } else if (status === 'blocked') {   // serious blocked condition — needs a human decision (auto will not override)
            body += '<div data-ff-v2="scenario-blocked" style="margin-top:8px;padding:6px 9px;border:1px solid #7a3030;border-radius:6px;background:#241414;color:#f0b0b0;font-size:10px;">⛔ Scenario blocked — ' + esc(s.pending_replan_reason || 'operator decision needed.') + ' Auto Continue will not override a blocked state.</div>';
            if (hasRunnable) { actions = _v2ScenarioPri('v2-scenario-continue', '▶ Continue anyway', 'Resume the committed COA despite the trigger') + _v2Sec('v2-scenario-stop', '⏹ Stop Scenario'); }
            else if (hasNewPlan) {
                var coasB = arr(_coaPlan.coas), recIdxB = _pickRecommendedIdx(_coaPlan);
                actions = _v2Pri('v2-commit', '✅ Commit Next Order (' + esc(_v2CoaId(coasB, _coaSelectedIdx)) + ')', 'Lock the next COA, then Continue') + _v2Sec('v2-scenario-stop', '⏹ Stop Scenario');
                body += _v2CoaCardsHtml(coasB, recIdxB) + _v2SelectedSummaryHtml(coasB, recIdxB);
            } else {
                actions = _v2Sec('v2-staff-safe', '🛡 Staff-Safe Next Order') + _v2Sec('v2-scenario-stop', '⏹ Stop Scenario');
                body += '<div style="margin-top:6px;display:flex;align-items:center;gap:6px;"><span style="font-size:9.5px;color:#8fa5b8;">Advanced action:</span> ' + _v2Adv('v2-replan', '↻ Replan with AI (slow)', 'Call the AI for a fresh Blue plan') + '</div>';
            }
        } else {   // paused (manual) — the fight continues; Blue needs the next order
            body += '<div data-ff-v2="scenario-needs-orders" style="margin-top:8px;padding:6px 9px;border:1px solid #6a5520;border-radius:6px;background:#1c1708;color:#e8d68a;font-size:10px;">⚠ Scenario needs new Blue orders — ' + esc(s.pending_replan_reason || 'choose the next order to continue the fight.') + (auto ? '' : ' (or enable Auto Continue above)') + '</div>';
            if (_coaLoading) { actions = ''; body += _v2Note('Generating the next Blue order…', '#e0c060'); }
            else if (hasRunnable) { actions = _v2ScenarioPri('v2-scenario-continue', '▶ Continue Scenario', 'Run the next turn with the committed COA') + _v2Sec('v2-scenario-stop', '⏹ Stop Scenario'); }
            else if (hasNewPlan) {
                var coas = arr(_coaPlan.coas), recIdx = _pickRecommendedIdx(_coaPlan);
                actions = _v2Pri('v2-commit', '✅ Commit Next Order (' + esc(_v2CoaId(coas, _coaSelectedIdx)) + ')', 'Lock the next COA, then Continue Scenario') + _v2Sec('v2-scenario-stop', '⏹ Stop Scenario');
                body += _v2CoaCardsHtml(coas, recIdx) + _v2SelectedSummaryHtml(coas, recIdx);
            } else {
                actions = _v2Sec('v2-staff-safe', '🛡 Staff-Safe Next Order') + _v2Sec('v2-scenario-stop', '⏹ Stop Scenario');
                body += '<div style="margin-top:6px;display:flex;align-items:center;gap:6px;"><span style="font-size:9.5px;color:#8fa5b8;">Advanced action:</span> ' + _v2Adv('v2-replan', '↻ Replan with AI (slow)', 'Call the AI for a fresh Blue plan') + '</div>';
            }
        }
        return '<div data-ff-v2="window" data-ff-v2-mode="scenario" style="margin:6px 0;padding:11px 13px;border:1px solid #2e5d7d;border-radius:8px;background:#0a1726;">' +
            head + cons +
            '<div data-ff-v2="actions" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px;">' + actions + '</div>' +
            body + '</div>';
    }
    function renderFreeFightControlV2() {
        // RMOOZ-FREE-FIGHT-CONTINUOUS-SCENARIO-AA: when a continuous scenario is active, the cockpit body
        // is the scenario console (Plan status · Scenario status · Turn · Actor · Last outcome · Next action).
        if (_scenarioActive()) return _renderScenarioCockpitV2();
        var state = _freeFightControlStateV2();
        var coas = arr(_coaPlan && _coaPlan.coas);
        var recIdx = _pickRecommendedIdx(_coaPlan);
        var actions = '', body = '';
        if (state === 'empty') {
            actions = _v2Pri('v2-generate', '⚡ Generate AI Plan', 'Calls the local AI model — can be slow') + _v2Sec('v2-staff-safe', '🛡 Use Staff-Safe Plan', 'Instant deterministic plan — no AI');
            body = _v2Note('<b>Generate AI Plan</b> is slow because it calls the AI. <b>Staff-Safe</b> is an instant deterministic plan (no AI).') + _v2ModelReadinessHtml();
        } else if (state === 'planning') {
            actions = '';   // no fake cancel — the existing generator has no cancel
            body = '<div data-ff-v2="planning" style="margin-top:6px;display:flex;align-items:center;gap:8px;font-size:12px;color:#e0c060;font-weight:700;">' +
                '<span style="display:inline-block;width:12px;height:12px;border:2px solid #e0c060;border-top-color:transparent;border-radius:50%;"></span>' +
                'AI is building COAs… <span style="color:#7fd6a0;">' + _v2PlanningElapsed() + 's</span></div>' +
                _v2Note('The local model can take 30–90s. This window updates automatically when the plan is ready.', '#8fa5b8');
        } else if (state === 'ready') {
            var selId = _v2CoaId(coas, _coaSelectedIdx);
            actions = _v2Pri('v2-commit', '✅ Commit Selected Plan (' + esc(selId) + ')', 'Locks the selected COA for execution');
            body = _v2CoaCardsHtml(coas, recIdx) + _v2SelectedSummaryHtml(coas, recIdx) +
                '<div style="margin-top:8px;display:flex;align-items:center;gap:6px;"><span style="font-size:9.5px;color:#8fa5b8;">Advanced:</span> ' + _v2Adv('v2-regenerate', '↻ Regenerate Plan (AI · slow)', 'Calls the AI again') + '</div>';
        } else if (state === 'committed') {
            actions = _v2Pri('v2-run', '▶ Run Plan', 'Execute the committed COA ONCE — fast, no AI on normal ticks') +
                _v2ScenarioPri('v2-run-scenario', '🎬 Run Scenario', 'Continuously run the fight — Red reaction, White adjudication, Green updates — until an end condition') +
                _v2Sec('v2-clear', 'Clear Plan');
            body = _v2CommittedSummaryHtml() +
                _v2Note('<b>Run Plan</b> = execute the COA once (can end with "Plan complete"). <b>Run Scenario</b> = keep the fight going: White adjudicates, Green updates, Red reacts, until an end condition. Both are deterministic — no AI on normal ticks.', '#9fb8c8') +
                _v2AutoToggleHtml();   // RMOOZ-...-AB: choose Manual vs Auto Continue before Run Scenario
        } else if (state === 'running') {
            actions = _v2Pri('v2-pause', '⏸ Pause', 'Stop movement');
            body = _v2RunProgressHtml() + _v2Note('Running — <b>the AI is NOT called on normal ticks</b>.', '#7fd6a0');
        } else if (state === 'paused') {
            actions = _v2Pri('v2-resume', '▶ Resume', 'Continue deterministic execution') + _v2Sec('v2-clear', 'Clear Plan');
            body = _v2RunProgressHtml() + _v2Note('Paused. Resume continues deterministic execution; Clear discards the committed plan.', '#cdb86a');
        } else if (state === 'blocked') {
            actions = _v2Sec('v2-continue', '▶ Continue anyway', 'Resume the committed COA despite the trigger') + _v2Sec('v2-clear', 'Clear Plan');
            body = _v2Note('⚠ Blocked — ' + esc((_coaExec && _coaExec.replan_reason) || 'Replan required; execution paused.'), '#f0b0b0') +
                _v2CommittedSummaryHtml() +
                '<div style="margin-top:8px;display:flex;align-items:center;gap:6px;"><span style="font-size:9.5px;color:#8fa5b8;">Advanced action:</span> ' + _v2Adv('v2-replan', '↻ Replan with AI (slow)', 'Stop and call the AI for a fresh plan') + '</div>';
        } else if (state === 'complete') {
            actions = _v2ScenarioPri('v2-run-scenario', '🎬 Run Scenario', 'Continue the fight from here — Red reaction, White adjudication, Green updates, until an end condition') +
                _v2Sec('v2-generate', '⚡ New AI Plan') + _v2Sec('v2-clear', 'Clear Plan');
            body = _v2Note('✅ <b>Plan complete</b> — all phases executed with no AI calls. This is a single COA playback. <b>Run Scenario</b> to keep the fight going (White / Green / Red), or start a new plan.', '#7fd6a0') + _v2CommittedSummaryHtml();
        }
        var head = '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;">' +
            '<span style="font-size:12.5px;font-weight:700;color:#9ec2ec;">🎖 AI Commander — Free Fight</span>' +
            '<span data-ff-v2="state" data-ff-v2-state="' + state + '" style="font-size:9.5px;font-weight:700;color:' + _v2StateColor(state) + ';background:#0c1622;border:1px solid #24435f;border-radius:10px;padding:2px 9px;">' + _v2StateLabel(state) + '</span>' +
            '</div>';
        return '<div data-ff-v2="window" style="margin:6px 0;padding:11px 13px;border:1px solid #2e5d7d;border-radius:8px;background:#0a1726;">' +
            head +
            _v2StepperHtml(state) +
            '<div data-ff-v2="actions" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px;">' + actions + '</div>' +
            _v2MicrocopyHtml(state) +
            body + '</div>';
    }
    // The closed "Diagnostics / Legacy" drawer. Its body (the full old crowded UI — objective placement,
    // group-movement demo, model status, warmup/benchmark, scheduler decision log, raw JSON, manual
    // planner, commit-exec detail, unit-decision, Staff-Safe internals) is inserted into the DOM ONLY
    // when opened. Closed by default → none of those controls render, so there are no hidden duplicate
    // data-act buttons in the operator-facing path.
    function _freeFightLegacyDrawerHtml(legacyHtml) {
        var open = !!_ffLegacyOpen;
        var h = '<div data-ff-v2="legacy" style="margin-top:12px;border-top:1px solid #2a3f55;padding-top:7px;">';
        h += '<button data-act="v2-legacy-toggle" data-ff-v2-legacy-open="' + (open ? '1' : '0') + '" style="font:inherit;cursor:pointer;border:1px solid #3a4658;background:#0c141d;color:#8fa5b8;border-radius:5px;padding:5px 10px;font-size:10.5px;font-weight:600;">' + (open ? '▾' : '▸') + ' Diagnostics / Legacy</button>';
        h += '<div style="margin-top:3px;font-size:9px;color:#5a7a8a;line-height:1.5;">' +
            (open ? 'Technical &amp; legacy controls — model status, warmup, benchmark, scheduler decision log, raw JSON, manual planner, group-movement demo, Staff-Safe internals. Not part of the normal flow.'
                  : 'Hidden — model status · warmup · benchmark · scheduler decision log · raw JSON · manual planner · group-movement demo · Staff-Safe internals. Click to open.') + '</div>';
        if (open) h += '<div data-ff-v2="legacy-body" style="margin-top:8px;opacity:.97;">' + (legacyHtml || '') + '</div>';
        return h + '</div>';
    }
    // Bind the V2 control-window actions. All ids are unique to V2; when the legacy drawer is closed its
    // controls are absent from the DOM, so these binds never collide. Every handler updates visible state.
    function bindFreeFightControlV2() {
        // v2-generate / v2-clear leave any active scenario (start fresh); the in-scenario "next order"
        // paths (v2-staff-safe / v2-replan) keep the scenario alive on purpose.
        bind('v2-generate', function () { _resetScenario(); setPlanningMode('commander'); _generateCoaPlan(); });
        bind('v2-regenerate', function () { setPlanningMode('commander'); _generateCoaPlan(); });
        bind('v2-staff-safe', function () { setPlanningMode('staff_safe'); _generateCoaPlan(); });
        bind('v2-commit', function () { _commitCoa(_coaSelectedIdx); });
        bind('v2-run', _runCommittedCoa);
        bind('v2-resume', _runCommittedCoa);
        bind('v2-continue', _runCommittedCoa);
        bind('v2-pause', _pauseCommittedCoa);
        bind('v2-clear', function () { _resetScenario(); _resetCoaExec(); });
        bind('v2-replan', _replanCoa);
        // RMOOZ-FREE-FIGHT-CONTINUOUS-SCENARIO-AA: continuous-scenario controls (deterministic; no LLM on ticks).
        bind('v2-run-scenario', _runScenario);
        bind('v2-scenario-continue', _runScenario);
        bind('v2-scenario-pause', _pauseScenario);
        bind('v2-scenario-stop', _stopScenario);
        bind('v2-scenario-auto-toggle', _toggleScenarioAuto);   // RMOOZ-...-AB: Auto Continue toggle
        bind('v2-legacy-toggle', function () { _ffLegacyOpen = !_ffLegacyOpen; updatePanel(); });
        // COA card selection — clicking a card sets the selection and repaints immediately so the
        // highlight + selected summary + Commit label update on the spot. Bind a generous range (plans
        // carry 2–3 COAs); bind() no-ops on absent ids.
        for (var i = 0; i < 8; i++) {
            (function (idx) { bind('v2-coa-' + idx, function () { _coaSelectedIdx = idx; updatePanel(); }); })(i);
        }
    }
    function _operatorStripHtml() {
        function pri(act, label, dis) { return '<button data-ff-primary="1" data-act="' + act + '"' + (dis ? ' disabled' : '') + ' style="font:inherit;cursor:' + (dis ? 'not-allowed' : 'pointer') + ';border:1px solid #2e7d54;background:#15301f;color:#9fe8c0;border-radius:6px;padding:7px 14px;font-size:12px;font-weight:700;' + (dis ? 'opacity:.55;' : '') + '">' + label + '</button>'; }
        function note(txt, col) { return '<div style="margin-top:4px;font-size:10px;color:' + (col || '#9fb8c8') + ';">' + txt + '</div>'; }
        var coas = arr(_coaPlan && _coaPlan.coas);
        var hasPlan = !!(_coaPlan && _coaPlan.ok && coas.length);
        var ex = _coaExec;
        var execRunning = !!(ex && ex.active && !ex.paused && !ex.replan_required && ex.phase_status === 'running');
        var blocked = !!(ex && ex.replan_required);
        var complete = !!(ex && ex.phase_status === 'complete');
        var btns = '', body = '';
        if (complete) {                                   // F. plan finished → Generate again
            btns = pri('generate-ai-plan', '⚡ Generate AI Plan');
            body = note('✅ Plan complete — all phases executed with no AI calls. Generate a new plan to continue.', '#7fd6a0');
        } else if (blocked) {                             // E. blocked — Replan stays STRICTLY in Advanced
            btns = '';
            body = note('⚠ ' + esc(ex.replan_reason || 'Replan required — execution paused.'), '#f0b0b0') +
                   note('Open ⚙ Advanced controls below to Replan with AI (slow, calls AI), Continue anyway, or switch to Staff-Safe.', '#cdb86a');
        } else if (ex && ex.active) {                     // C committed / D running
            if (execRunning) { btns = pri('coa-pause', '⏸ Pause'); body = note('Running the plan. Fast — the AI is NOT called on normal ticks.', '#7fd6a0'); }
            else { btns = pri('coa-run', '▶ Run Plan'); body = note('Run executes the committed COA deterministically — fast, no AI call on normal ticks.', '#9fb8c8'); }
            body += _operatorStatusLine(ex);
        } else if (hasPlan) {                             // B. plan generated, not committed
            var recIdx = _pickRecommendedIdx(_coaPlan);
            if (_coaSelectedIdx === recIdx) {
                var recId = (coas[recIdx] && coas[recIdx].plan_id) || ('COA-' + (recIdx + 1));
                btns = pri('coa-use-recommended', '✅ Use Recommended Plan (' + esc(recId) + ')');
                body = note('AI produced ' + coas.length + ' COAs — the recommended one is pre-selected. Use it, or pick another from the cards below.', '#9fb8c8');
            } else {
                var selId = (coas[_coaSelectedIdx] && coas[_coaSelectedIdx].plan_id) || ('COA-' + (_coaSelectedIdx + 1));
                btns = pri('coa-use-selected', '▶ Use Selected Plan (' + esc(selId) + ')');
                body = note('Using your selected COA ' + esc(selId) + ' — pick a different one from the cards below if needed.', '#9fb8c8');
            }
        } else {                                          // A. no plan → Generate (slow, calls AI)
            btns = pri('generate-ai-plan', '⚡ Generate AI Plan');
            body = _coaLoading ? note('AI is building the plan. This may take 30–90 seconds depending on the model.', '#e0c060')
                               : note('Generate an AI plan — slow, calls the AI model. (Instant Staff-Safe planning lives under Advanced controls.)', '#9fb8c8');
        }
        return '<div data-ff-op="strip" style="margin:6px 0;padding:8px 10px;border:1px solid #2e5d7d;border-radius:6px;background:#0a1726;">' +
            '<div style="font-size:11px;font-weight:700;color:#9ec2ec;margin-bottom:5px;">AI Commander — Generate (slow) → Use a plan → Run (fast)</div>' +
            '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">' + btns + '</div>' + body + '</div>';
    }
    // ── RMOOZ-FREE-FIGHT-CONTROL-WINDOW-REBUILD-W: tabbed control-window shell (UI-only) ────────────────
    // A "System layers" summary so the operator understands what each AI lane does.
    function _systemLayersHtml() {
        return '<details data-ff-w="system-layers" style="margin-bottom:6px;"><summary style="cursor:pointer;font-size:10px;color:#8fa5b8;font-weight:600;">ℹ System layers — Blue / Red / Green / White</summary>' +
            '<div style="margin-top:4px;font-size:9.5px;color:#cdd8e4;line-height:1.6;padding:5px 7px;border:1px solid #24435f;border-radius:5px;background:#0a1726;">' +
            '<div><b style="color:#7bb8e8;">Blue AI</b> — creates friendly COAs / plans</div>' +
            '<div><b style="color:#f0707a;">Red AI</b> — enemy / counter planning</div>' +
            '<div><b style="color:#5bd6a0;">Green AI</b> — neutral-world risk (deterministic)</div>' +
            '<div><b style="color:#cdd8e4;">White AI</b> — referee / validation / advisory</div>' +
            '<div><b style="color:#9ec2ec;">Unit Controller</b> — executes the committed plan, no LLM on normal ticks</div>' +
            '</div></details>';
    }
    function _ffTabBarHtml() {
        var tabs = [['operator', 'Operator'], ['coa_plans', 'COA Plans'], ['green', 'Green'], ['white', 'White'], ['diagnostics', 'Diagnostics']];
        var cur = _ffTab || 'operator';
        var h = '<div data-ff-w="tabbar" style="display:flex;gap:4px;flex-wrap:wrap;border-bottom:1px solid #2a3f55;padding-bottom:4px;">';
        tabs.forEach(function (t) {
            var on = (t[0] === cur);
            h += '<button data-act="ff-tab-' + t[0] + '" style="font:inherit;cursor:pointer;border:1px solid ' + (on ? '#4a9ed6' : '#2a3f55') + ';background:' + (on ? '#0a1830' : '#0c141d') + ';color:' + (on ? '#cfe6ff' : '#8fa5b8') + ';border-radius:5px 5px 0 0;padding:4px 10px;font-size:10.5px;font-weight:' + (on ? '700' : '400') + ';">' + t[1] + '</button>';
        });
        h += '</div>';
        return h;
    }
    // Operator tab: a compact selected/recommended summary under the simple flow strip (detail in COA Plans).
    function _operatorSummaryHtml() {
        var coas = arr(_coaPlan && _coaPlan.coas);
        if (!_coaPlan || !_coaPlan.ok || !coas.length) return '';
        var recIdx = _pickRecommendedIdx(_coaPlan);
        var selId = (coas[_coaSelectedIdx] && coas[_coaSelectedIdx].plan_id) || ('COA-' + (_coaSelectedIdx + 1));
        var recId = (coas[recIdx] && coas[recIdx].plan_id) || ('COA-' + (recIdx + 1));
        var h = '<div data-ff-w="op-summary" style="margin-top:5px;font-size:10px;color:#cdd8e4;">' +
            '<span style="color:#8fa5b8;">Recommended:</span> <b style="color:#7fd6a0;">' + esc(recId) + '</b> · ' +
            '<span style="color:#8fa5b8;">Selected:</span> <b style="color:#cfe6ff;">' + esc(selId) + '</b>';
        if (_coaSelectedIdx !== recIdx) h += ' <span style="color:#e0a93a;">· operator override</span>';
        h += ' <span style="color:#5a7a8a;">(compare in COA Plans tab)</span></div>';
        return h;
    }
    // White tab: validation verdict (unchanged) + the Green-derived advisory + scoring + "advisory only".
    function _whiteTabHtml() {
        var h = '<div data-ff-w="white" style="border:1px solid #24435f;border-radius:6px;background:#0a1622;padding:8px 10px;">';
        h += '<div style="font-size:11px;font-weight:700;color:#cdd8e4;margin-bottom:5px;">⚖ White — referee / validation / advisory</div>';
        var val = _coaPlan && _coaPlan.validation;
        if (val) h += '<div style="font-size:10px;"><span style="color:#8fa5b8;">Validation (structure/physics):</span> <b style="color:' + (val.ok ? '#7fd6a0' : '#e0a93a') + ';">' + (val.ok ? 'OK' : 'rejected') + '</b>' + (!val.ok && val.reason ? ' — ' + esc(val.reason) : '') + '</div>';
        else h += '<div style="font-size:10px;color:#8fa5b8;">Validation: generate a plan to see the referee verdict.</div>';
        var adv = _whiteAdvisory(_greenWorld);
        if (adv) h += '<div style="margin-top:5px;font-size:10px;">⚖ <b style="color:' + _whiteAdvisoryColor(adv.advisory_level) + ';">White advisory: ' + esc(adv.advisory_level) + '</b> — ' + esc(adv.note) + '</div>';
        var ga = (_coaPlan && _coaPlan._green_advisory) || _greenAdvisoryScoring(_greenWorld);
        if (ga && ga.considered) {
            h += '<div style="margin-top:4px;font-size:10px;color:#cdd8e4;">Green/White advisory score Δ: <b style="color:#e0a93a;">' + ga.advisory_score_delta + '</b> · collateral ' + esc(ga.collateral_risk_band) + (ga.neutral_reaction_score != null ? ' · reaction ' + ga.neutral_reaction_score : '') + '</div>';
            if (arr(ga.warnings).length) h += '<div style="margin-top:3px;font-size:9.5px;color:#e0a93a;">⚠ ' + arr(ga.warnings).map(function (x) { return esc(x); }).join(' · ') + '</div>';
            if (arr(ga.recommendations).length) h += '<div style="margin-top:2px;font-size:9.5px;color:#9fd6b0;">↪ ' + arr(ga.recommendations).map(function (x) { return esc(x); }).join(' · ') + '</div>';
        } else {
            h += '<div style="margin-top:4px;font-size:10px;color:#8fa5b8;">No Green/White advisory yet — refresh Green or generate a plan.</div>';
        }
        h += '<div data-ff-w="white-disclaimer" style="margin-top:6px;font-size:9px;color:#5a7a8a;border-top:1px solid #1a3050;padding-top:4px;">Advisory only — not a block. The structure/physics validator is the only gate; Green/White risk never invalidates a COA or blocks Run.</div>';
        h += '</div>';
        return h;
    }
    function renderAiDecisionHtml() {
        var h = '<div style="margin-top:8px;border-top:1px solid #2a3f55;padding-top:8px;">';
        h += '<div style="margin-bottom:6px;padding:5px 8px;border:1px solid #1a4030;border-radius:4px;background:#091810;">' +
             '<div style="display:flex;align-items:center;gap:6px;">' +
             '<span style="font-size:10px;font-weight:700;color:#fff;background:#1a7040;border-radius:3px;padding:1px 6px;letter-spacing:.5px;">MAIN AI TEST</span>' +
             '<span style="font-size:11px;font-weight:700;color:#7fd6a0;">MAIN AI TEST — Attack Plan / COA Planner</span>' +
             '</div>' +
             '<div style="font-size:10px;color:#5a9a70;margin-top:2px;">Real unit-level AI decision — هذا هو الاختبار الفعلي للذكاء الاصطناعي على مستوى الوحدات</div>' +
             '</div>';
        // RMOOZ-FREE-FIGHT-CONTROL-WINDOW-REBUILD-W: tabbed control window. Each tab reuses the EXISTING
        // render functions — no AI/COA/Green/White/scheduling/execution change. The default Operator tab
        // shows only the simple flow (≤1 primary action per state); technical items live under Diagnostics.
        h += _systemLayersHtml();
        h += _ffTabBarHtml();
        var _tab = _ffTab || 'operator';
        // Standard tabbed UI: ALL panels are rendered into the DOM; only the active one is shown
        // (display:none on the rest). This keeps every feature one click away, preserves the full
        // inspectable card, and changes no logic — each panel just reuses an existing render function.
        function _ffPanel(name, body) { return '<div data-ff-tabpanel="' + name + '" style="margin-top:8px;' + (name === _tab ? '' : 'display:none;') + '">' + body + '</div>'; }
        h += _ffPanel('operator', _operatorStripHtml() + _operatorSummaryHtml());
        h += _ffPanel('coa_plans', renderCoaPlanHtml());
        h += _ffPanel('green', _greenWorldHtml());
        h += _ffPanel('white', _whiteTabHtml());
        // ── Diagnostics panel — all technical/advanced items (model status · warmup/benchmark · decision
        // log · manual planner · commit-exec detail · unit-decision · Staff-Safe). Built inline below. ──
        h += '<div data-ff-tabpanel="diagnostics" style="margin-top:8px;' + (_tab === 'diagnostics' ? '' : 'display:none;') + '">';
        // FREEFIGHT-AI-CONTINUOUS-COMMANDER-LOOP-A: continuous loop controls + model flow + Advanced diagnostics.
        h += renderCommanderLoopHtml();
        h += '<div style="font-size:10px;color:#5a7a60;margin:2px 0 6px;border-top:1px solid #2a3f55;padding-top:6px;">Manual COA planner (single turn) — تخطيط يدوي</div>';
        // COA Planner buttons
        // RMOOZ-FREE-FIGHT-AI-GATE-CARD-D: when the planner is AI Commander but Free Fight is blocked
        // (exec gate and/or remote provider), warn CLEARLY + point to the fix and to Staff-Safe (which
        // stays available — req #8/#9). Staff-Safe mode is deterministic and never blocked.
        var _cmdReady = _freeFightAiReady();
        var _cmdBlocked = (_planningMode !== 'staff_safe') && !_cmdReady.ok && _cmdReady.code !== 'fast';
        if (_cmdBlocked) {
            h += '<div data-ff-coa="generate-warning" style="margin-bottom:6px;padding:6px 9px;border:1px solid #6a5520;border-radius:5px;background:#1c1708;color:#f0c060;font-size:10px;line-height:1.45;">' +
                 '⚠ <b>AI Commander cannot run right now.</b> ' + esc(_cmdReady.msg || '') +
                 '<br><span style="color:#cdb86a;">Tip: switch the Planner to <b>Staff-Safe</b> for a guaranteed deterministic plan (no LLM).</span></div>';
        }
        h += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px;">';
        h += '<button data-act="generate-coa" title="' + (_cmdBlocked ? esc(_cmdReady.msg || '') : '') + '" style="font:inherit;cursor:pointer;border:1px solid ' + (_cmdBlocked ? '#8a6a20' : '#2a7a50') + ';background:' + (_cmdBlocked ? '#241f08' : '#131e18') + ';color:' + (_cmdBlocked ? '#e8d68a' : '#90d0a0') + ';border-radius:5px;padding:5px 10px;font-size:11px;">' +
             (_coaLoading ? '⏳ Loading…' : (_planningMode === 'staff_safe' ? '⚡ Generate Staff-Safe Plan (fast)' : (_cmdBlocked ? '⚠ Generate AI Attack Plan (blocked)' : '⚡ Generate AI Attack Plan'))) + '</button>';
        if (_coaPlan && _coaPlan.ok && !_coaApplied) {
            h += '<button data-act="apply-coa" style="font:inherit;cursor:pointer;border:1px solid #3a7a3a;background:#182818;color:#90d090;border-radius:5px;padding:5px 10px;font-size:11px;">✔ Apply Selected COA — تطبيق</button>';
        }
        if (_coaPlan) {
            h += '<button data-act="reset-coa" style="font:inherit;cursor:pointer;border:1px solid #5a6270;background:#2a2f37;color:#e8eaed;border-radius:5px;padding:5px 10px;font-size:11px;">⟲ Reset COA</button>';
        }
        h += '</div>';
        h += _coaExecHtml();   // RMOOZ-COA-COMMIT-EXECUTION-L: commit/run/pause/replan + status (advanced detail)
        h += '<div style="margin-top:10px;border-top:1px solid #2a3f55;padding-top:8px;">';
        h += '<div style="font-size:10px;color:#5a7a60;margin-bottom:5px;">Unit Decision LLM — single-unit step test</div>';
        // LLM toggle + test button
        h += '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:6px;font-size:11px;">';
        h += '<label style="display:flex;align-items:center;gap:5px;cursor:pointer;color:#9ec2ec;" title="Uses the local model only — requires RMOOZ_ALLOW_SIM_RUN=1 on the server">';
        h += '<input type="checkbox" data-act="toggle-llm"' + (_useLlm ? ' checked' : '') + ' style="accent-color:#4a9ed6;cursor:pointer;">';
        h += 'Use Local LLM — استخدام LLM المحلي</label>';
        h += '<button data-act="test-llm" title="Tests and warms the local Ollama model — run this before Preview Unit AI Decision for best results" style="font:inherit;cursor:pointer;border:1px solid #4a5f75;background:#101b27;color:#8fb8e0;border-radius:4px;padding:3px 8px;font-size:10px;">' +
             (_llmTestStatus && _llmTestStatus.testing ? '⏳ Warming LLM…' : '⚡ Test Local LLM') + '</button>';
        if (_llmTestStatus && !_llmTestStatus.testing) {
            var lts = _llmTestStatus;
            var ltColor = lts.ok ? '#90d090' : '#e0a93a';
            h += '<span style="color:' + ltColor + ';font-size:10px;">';
            if (lts.ok) {
                h += 'LLM: connected · <span style="color:#7fd6a0;">Local only</span> · ' + esc(lts.provider || 'ollama');
                if (lts.model) h += ' · ' + esc(lts.model);
                if (lts.latency_ms) h += ' · ' + lts.latency_ms + 'ms';
            } else {
                h += 'LLM: ' + esc(lts.reason || lts.error || 'unavailable');
                if (lts.local_only) h += ' · <span style="color:#7fd6a0;">Local only</span>';
            }
            h += '</span>';
        }
        h += '</div>';
        h += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px;">';
        var _previewLabel;
        if (_aiLoading) {
            _previewLabel = '⏳ Loading…';
        } else if (_aiDecision && !_aiApplied && _useLlm && _aiDecision.llm_status && /timeout|unavailable|error/i.test(_aiDecision.llm_status)) {
            _previewLabel = '🔄 Try LLM Again';
        } else {
            _previewLabel = '🔍 Preview Unit AI Decision';
        }
        h += '<button data-act="preview-ai" style="font:inherit;cursor:pointer;border:1px solid #2a7a50;background:#131e18;color:#90d0a0;border-radius:5px;padding:5px 10px;font-size:11px;">' + _previewLabel + '</button>';
        if (_aiDecision && _aiDecision.ok && !_aiApplied) {
            h += '<button data-act="apply-ai" style="font:inherit;cursor:pointer;border:1px solid #3a7a3a;background:#182818;color:#90d090;border-radius:5px;padding:5px 10px;font-size:11px;">✔ Apply Unit AI Action — تطبيق</button>';
        }
        if (_aiDecision) {
            h += '<button data-act="reset-ai" style="font:inherit;cursor:pointer;border:1px solid #5a6270;background:#2a2f37;color:#e8eaed;border-radius:5px;padding:5px 10px;font-size:11px;">⟲ Reset Unit Decision</button>';
        }
        h += '</div>';
        if (_aiLoading) {
            h += '<div style="color:#9ab0c0;font-size:11px;padding:6px;">Loading AI decision… جاري التحميل</div>';
        } else if (_aiDecision) {
            var aiAct = _aiDecision.action || {};
            var aiAr  = _aiDecision.apply_result || {};
            if (_aiDecision.ok && aiAct.action_type) {
                h += '<div style="background:#0c141d;border:1px solid #2a3f55;border-radius:5px;padding:8px;font-size:11px;">';
                h += '<div><span style="color:#8fa5b8;">Action:</span> <span style="color:#e0e8f0;">' + esc(aiAct.action_type) + '</span></div>';
                h += '<div><span style="color:#8fa5b8;">Unit:</span> <span style="color:#e0e8f0;">' + esc(aiAct.unit_uid) + '</span></div>';
                h += '<div><span style="color:#8fa5b8;">Side:</span> <span style="color:#e0e8f0;">' + esc(aiAct.side) + '</span></div>';
                h += '<div><span style="color:#8fa5b8;">Reason:</span> <span style="color:#d0e0d0;font-style:italic;">' + esc(aiAct.reason) + '</span></div>';
                h += '<div><span style="color:#8fa5b8;">Confidence:</span> <span style="color:#e0e8f0;">' + esc(aiAct.confidence) + '</span></div>';
                if (aiAct.risk) h += '<div><span style="color:#8fa5b8;">Risk:</span> <span style="color:#e0e8f0;">' + esc(aiAct.risk) + '</span></div>';
                if (aiAct.source) h += '<div><span style="color:#8fa5b8;">Source:</span> <span style="color:#e0e8f0;">' + esc(aiAct.source) + '</span></div>';
                if (_aiDecision.validation) h += '<div><span style="color:#8fa5b8;">Validator:</span> <span style="color:#' + (_aiDecision.validation.ok ? '90d090' : 'e0a93a') + ';">' + esc(_aiDecision.validation.ok ? 'OK' : (_aiDecision.validation.reason || 'rejected')) + '</span></div>';
                // FREEFIGHT-LOCAL-LLM-ONLY-A: local-only policy display
                if (_aiDecision.local_only) {
                    h += '<div><span style="color:#8fa5b8;">LLM mode:</span> <span style="color:#7fd6a0;">Local only</span></div>';
                }
                if (_aiDecision.provider_used || _aiDecision.local_only) {
                    h += '<div><span style="color:#8fa5b8;">Provider:</span> <span style="color:#9ec2ec;">' + esc(_aiDecision.provider_used || 'ollama') + '</span></div>';
                }
                if (_aiDecision.model_used) {
                    h += '<div><span style="color:#8fa5b8;">Model:</span> <span style="color:#9ec2ec;">' + esc(_aiDecision.model_used) + '</span></div>';
                }
                // FREEFIGHT-LLM-DECISION-BRIDGE-A: decision_source + fallback_reason
                var dsrc = _aiDecision.decision_source || aiAct.source || 'deterministic_demo_ai';
                var dsrcColor = dsrc === 'llm' ? '#90d090' : '#9ab0c0';
                h += '<div><span style="color:#8fa5b8;">Decision source:</span> <span style="color:' + dsrcColor + ';">' + esc(dsrc) + '</span></div>';
                if (_aiDecision.fallback_reason) {
                    var fr = _aiDecision.fallback_reason;
                    var isTimeout = /timeout|timed.out/i.test(fr);
                    h += '<div><span style="color:#8fa5b8;">Fallback reason:</span> <span style="color:#e0a93a;font-size:10px;">' + esc(fr) + '</span>';
                    if (isTimeout) h += ' <span style="color:#6a9ab8;font-size:10px;">(click Test Local LLM to warm model, then retry)</span>';
                    h += '</div>';
                }
                if (aiAr.ok && aiAr.new_pos) h += '<div><span style="color:#8fa5b8;">New Position:</span> <span style="color:#a0e0a0;">' + esc(aiAr.new_pos.lat) + ', ' + esc(aiAr.new_pos.lon) + '</span></div>';
                if (_aiDecision.event_log_entry) h += '<div style="margin-top:4px;padding:4px 6px;background:#0e1218;border-radius:3px;color:#9ab0c0;font-family:monospace;">' + esc(_aiDecision.event_log_entry) + '</div>';
                // FREEFIGHT-LLM-DECISION-TRACE-A: full decision trace block
                (function() {
                    var dec = _aiDecision;
                    var llmCalled = dec.llm_called === true;
                    var llmStatus = dec.llm_status || (llmCalled ? 'unknown' : 'not_called');
                    var llmStatusColor = llmStatus === 'success' ? '#90d090' : (llmStatus === 'timeout' || llmStatus === 'error' ? '#e0a93a' : '#8fa5b8');
                    var fds = dec.final_decision_source || dec.decision_source || (dec.action && dec.action.source) || 'deterministic_demo_ai';
                    var fdsIsLlm = fds === 'llm';
                    var fdsColor = fdsIsLlm ? '#90d090' : '#e0a93a';
                    h += '<div style="margin-top:6px;border:1px solid #1a3050;border-radius:4px;padding:6px 8px;background:#080e16;font-size:10px;">';
                    h += '<div style="color:#5a7a9a;font-weight:600;margin-bottom:4px;font-size:10.5px;">Decision Trace</div>';
                    h += '<div><span style="color:#7a9ab8;">LLM called:</span> <span style="color:#e0e8f0;">' + (llmCalled ? 'yes' : 'no') + '</span></div>';
                    if (llmCalled || dec.provider_used) {
                        h += '<div><span style="color:#7a9ab8;">LLM provider:</span> <span style="color:#9ec2ec;">' + esc(dec.provider_used || 'ollama') + '</span></div>';
                        h += '<div><span style="color:#7a9ab8;">LLM model:</span> <span style="color:#9ec2ec;">' + esc(dec.model_used || 'qwen2.5:7b') + '</span></div>';
                    }
                    h += '<div><span style="color:#7a9ab8;">LLM result:</span> <span style="color:' + llmStatusColor + ';">' + esc(llmStatus) + '</span></div>';
                    if (dec.llm_validation) {
                        var lv = dec.llm_validation;
                        h += '<div><span style="color:#7a9ab8;">RMOOZ validator:</span> <span style="color:' + (lv.ok ? '#90d090' : '#e0a93a') + ';">' + (lv.ok ? 'OK' : ('rejected: ' + esc(lv.reason || ''))) + '</span></div>';
                    }
                    h += '<div style="margin-top:3px;padding-top:3px;border-top:1px solid #1a3050;">' +
                         '<span style="color:#7a9ab8;">Final decision source:</span> ' +
                         '<span style="color:' + fdsColor + ';font-weight:700;font-size:11px;">' + esc(fds) + '</span>' +
                         (fdsIsLlm ? ' <span style="color:#6a8fa8;font-size:9px;">← LLM answer accepted ✓</span>' : ' <span style="color:#8a6a3a;font-size:9px;">← deterministic fallback</span>') +
                         '</div>';
                    if (dec.fallback_reason) {
                        h += '<div style="margin-top:2px;"><span style="color:#7a9ab8;">Fallback reason:</span> <span style="color:#e0a93a;">' + esc(dec.fallback_reason) + '</span></div>';
                        if (fds === 'deterministic_demo_ai') {
                            h += '<div style="color:#6a8fa8;margin-top:2px;">Fallback decision generated by RMOOZ deterministic safety brain.</div>';
                        }
                    }
                    h += '</div>';
                })();
                if (_aiApplied) {
                    if (_aiDecision.real_unit_moved) {
                        h += '<div style="color:#90d090;font-weight:600;margin-top:4px;">✔ Applied — real unit marker moved on map — تم تحريك الوحدة الحقيقية</div>';
                    } else {
                        h += '<div style="color:#e0a93a;font-weight:600;margin-top:4px;">⚠ AI action applied to preview marker only — real scenario unit not found.</div>';
                    }
                    // FREEFIGHT-AI-VISIBLE-MARKER-TRUTH-A: movement truth status panel
                    (function() {
                        var ruu  = _aiDecision.real_unit_updated;
                        var mrc  = _aiDecision.map_redraw_called;
                        var voc  = _aiDecision.visible_overlay_created;
                        var bridges = _aiDecision.map_redraw_bridges || [];
                        function flag(val) {
                            return val ? '<span style="color:#90d090;font-weight:700;">yes</span>'
                                       : '<span style="color:#e0a93a;font-weight:700;">no</span>';
                        }
                        h += '<div style="margin-top:5px;border:1px solid #1a4050;border-radius:4px;padding:6px 8px;background:#070e14;font-size:10px;" data-ff-truth="status">';
                        h += '<div style="color:#5a8aa8;font-weight:600;margin-bottom:3px;">Map Movement Truth</div>';
                        h += '<div>Real unit object updated: ' + flag(ruu) + '</div>';
                        h += '<div>Map redraw called: ' + flag(mrc);
                        if (mrc && bridges.length) h += ' <span style="color:#6a8fa8;">(' + esc(bridges.join(', ')) + ')</span>';
                        h += '</div>';
                        h += '<div>Visible movement layer: ' + flag(voc) + '</div>';
                        h += '</div>';
                    })();
                }
                h += '</div>';
            } else if (_aiDecision._error) {
                h += '<div style="color:#e0a93a;font-size:11px;padding:4px;">Error: ' + esc(_aiDecision._error) + '</div>';
            } else {
                h += '<div style="color:#e0a93a;font-size:11px;padding:4px;">No movable units found. Generate scenario or assign unit base/coordinates first.</div>';
                if (_aiDiagnostics) {
                    h += '<div style="color:#8fa5b8;font-size:10px;padding:2px 4px;">source: ' + esc(_aiDiagnostics.source_used) +
                         ' · total: ' + (_aiDiagnostics.units_total || 0) +
                         ' · with_id: ' + (_aiDiagnostics.units_with_id || 0) +
                         ' · with_coords: ' + (_aiDiagnostics.units_with_coords || 0) +
                         ' · movable: ' + (_aiDiagnostics.units_movable || 0) + '</div>';
                }
            }
        }
        h += '</div>';  // close unit decision inner section
        h += '</div>';  // close diagnostics tabpanel (RMOOZ-FREE-FIGHT-CONTROL-WINDOW-REBUILD-W)
        h += '</div>';  // close renderAiDecisionHtml outer
        return h;
    }
    // ── end FREEFIGHT-DEMO-AI-INTEGRATE-A ─────────────────────────────────────

    function clear() {
        pause();
        var w = W();
        if (_layer && mapReady()) { try { if (w.map.hasLayer(_layer)) w.map.removeLayer(_layer); } catch (_) {} }
        _layer = null;
        if (_viewportResizeHandler) { try { W().removeEventListener('resize', _viewportResizeHandler); } catch (_) {} _viewportResizeHandler = null; }
        if (_panel && _panel.parentNode) _panel.parentNode.removeChild(_panel); _panel = null;
        if (_aiPanel && _aiPanel.parentNode) _aiPanel.parentNode.removeChild(_aiPanel); _aiPanel = null;
        if (_cmdrPanel && _cmdrPanel.parentNode) _cmdrPanel.parentNode.removeChild(_cmdrPanel); _cmdrPanel = null;
        if (_card && _card.parentNode) _card.parentNode.removeChild(_card); _card = null;
        // FREEFIGHT-AI-CONTINUOUS-COMMANDER-LOOP-A: tear down loop timers + state
        _clearTimeoutSafe(_pendingTimer); _pendingTimer = null;
        if (_moveAnimTimer) { _clearIntervalSafe(_moveAnimTimer); _moveAnimTimer = null; }
        _loopRunning = false; _loopPaused = false; _turnNumber = 0; _activeSide = 'RED';
        _turnLog = []; _lastCommanderDecision = null; _loopAllUnitsForReset = []; _coaFamilyHistory = []; _lastIntel = null; _lastBrief = null; _briefExpanded = false; _lastCapability = null; _lastToolContract = null;
        _red = []; _blue = []; _allGroups = []; _objective = null; _objectiveSource = null; _plan = null; _terrain = { available: false };
        _planSource = 'deterministic';
        _llmStatus = { state: 'idle', message: '', validation_result: 'not_requested', fallback_reason: null };
        _progress = 0; _running = false; _paused = false;
        // NOTE: clear() closes the overlay but KEEPS the persisted Objective X
        // (window.__rmoozFreeFightObjective) so re-opening can reuse it; only
        // clearObjective() forgets it.
    }

    function mount(payload, opts) {
        // RMOOZ-DOC-REVIEW-PERSISTENCE-AND-DEMO-CLEANUP-A (Part A): the two preview
        // overlays must NOT stack — clear the legacy Demo Movement layer first.
        try { var ww = W(); if (ww && ww.RmoozDemoMovement && typeof ww.RmoozDemoMovement.clear === 'function') ww.RmoozDemoMovement.clear(); } catch (_) {}
        init(payload, opts);
        // FREE-FIGHT objective reuse: if the brief gave no objective but one was
        // placed earlier this session, reuse it (no duplicate markers — the demo
        // layer re-renders a single Objective X marker on syncMarkers).
        if (!finiteLL(_objective)) {
            try {
                var prev = W().__rmoozFreeFightObjective;
                if (finiteLL(prev)) { _objective = cloneLL(prev); _objectiveSource = 'reused_previous'; selectSample(); }
            } catch (_) {}
        }
        if (mapReady()) { syncMarkers(); buildPanel(); }
        renderAiPanel(); probeTerrain();
        // FREEFIGHT-COA-ROUTE-JSON-GUARD-A: probe the planner route once on open so the
        // operator sees OK/unavailable + provider/model before starting the loop.
        try { _probeRouteHealth(); } catch (_) {}
        // RMOOZ-LOCAL-MODEL-SELECTOR-A: populate the card's model dropdown on open.
        try { _fetchModels(); } catch (_) {}
        // RMOOZ-COA-COMMIT-PERSISTENCE-M: restore a committed COA from session (survives browser refresh).
        // Restored PAUSED — the operator presses Run to resume; no auto-run and no AI call on restore.
        try { _restoreCoaExec(); } catch (_) {}
        return getState();
    }

    // RMOOZ-LOCAL-MODEL-SELECTOR-A: re-sync the card when the model changes elsewhere (e.g. the global
    // header HUD). Skip our own echo. Registered once.
    // RMOOZ-AI-MODEL-READY-STATE-A: refresh READINESS too, not just the model list — _fetchModels()
    // now reconciles _routeHealth from the fresh payload (so the card flips to Ready immediately), and
    // _probeRouteHealth() re-confirms with the authoritative server health. Without this, selecting a
    // model in the header HUD updated the list but left the card stuck on "Needs model".
    function _onExternalModelChanged(e) {
        if (e && e.detail && e.detail.source === 'free_fight_card') return;  // skip our own echo
        try { _fetchModels(); } catch (_) {}        // refreshes _modelInfo + reconciles _routeHealth
        try { _probeRouteHealth(); } catch (_) {}    // authoritative re-confirm
    }
    try { document.addEventListener('rmooz:ai-model-changed', _onExternalModelChanged); } catch (_) {}

    var API = {
        mount: mount, init: init, setObjective: setObjective, clearObjective: clearObjective,
        start: start, pause: pause, reset: reset, step: step, replan: replan, clear: clear,
        setPlannerMode: setPlannerMode,
        getState: getState, getGroups: getGroups, getRed: getRed, getBlue: getBlue,
        getObjective: getObjective, getPlan: getPlan, getLlmStatus: function () { return Object.assign({}, _llmStatus); },
        getAiDecision: function () { return _aiDecision ? Object.assign({}, _aiDecision) : null; },
        _setAiDecisionForTest: function (d, applied) { _aiDecision = d || null; _aiApplied = !!applied; },
        _repaintForTest: function () { updatePanel(); },
        _setUseLlmForTest: function (v) { _useLlm = !!v; },
        getUseLlm: function () { return _useLlm; },
        // FREEFIGHT-AI-REAL-MAP-MOVE-A test seams
        _findRealUnitForTest:       function (uid) { return _findRealUnit(uid); },
        _applyMoveToScenarioForTest: function (uid, lat, lon) { return _applyMoveToScenario(uid, lat, lon); },
        _applyAiDecisionForTest:    function () { _applyAiDecision(); },
        _resetAiDecisionForTest:    function () { _resetAiDecision(); },
        _getMovedUnitForTest:       function () { return _aiMovedUnit; },
        _getMovedUnitOldPosForTest: function () { return _aiMovedUnitOldPos; },
        _getMovedUnitSourceForTest: function () { return _aiMovedUnitSource; },
        _triggerScenarioRedrawForTest: null, // set after init for spy injection
        _getWinStateForTest: function () { return _winState ? Object.assign({}, _winState) : null; },
        _winMinimizeForTest: function () { if (_panel) _winMinimize(); },
        _winMaximizeForTest: function () { if (_panel) _winMaximize(); },
        _resetWinStateForTest: function () { _winState = null; },
        // FREEFIGHT-AI-COA-PLANNER-A test seams
        _generateCoaPlanForTest:  function ()             { _generateCoaPlan(); },
        _applySelectedCoaForTest: function ()             { _applySelectedCoa(); },
        _resetCoaForTest:         function ()             { _resetCoa(); },
        _setCoaPlanForTest:       function (p, applied, idx) { _coaPlan = p || null; _coaApplied = !!applied; _coaSelectedIdx = idx || 0; },
        _getCoaMovedUnitsForTest: function ()             { return _coaMovedUnits.slice(); },
        _getCoaHeldCountForTest:  function ()             { return _coaHeldCount; },
        _resolveCoaMovesForTest:  function (coa)          { return _resolveCoaMoves(coa); },
        _getCoaAppliedForTest:    function ()             { return _coaApplied; },
        _getCoaSelectedIdxForTest: function ()            { return _coaSelectedIdx; },
        // FREEFIGHT-AI-CONTINUOUS-COMMANDER-LOOP-A test seams
        _startLoopForTest:        function ()             { startLoop(); },
        _pauseLoopForTest:        function ()             { pauseLoop(); },
        _stepOnceForTest:         function ()             { stepOnce(); },
        _resetLoopForTest:        function ()             { resetLoop(); },
        _runTurnCoreForTest:      function (plan, animMs) { return _runTurnCore(plan, animMs == null ? 0 : animMs); },
        _setSpeedForTest:         function (sp)           { setFreeFightSpeed(sp); },
        _getSpeedForTest:         function ()             { return _freeFightSpeed; },
        _getSpeedConfigForTest:   function (sp)           { return FF_SPEEDS[sp || _freeFightSpeed]; },
        _getLoopStateForTest:     function ()             { return { running: _loopRunning, paused: _loopPaused, turn: _turnNumber, side: _activeSide }; },
        _getTurnLogForTest:       function ()             { return _turnLog.slice(); },
        _getLastDecisionForTest:  function ()             { return _lastCommanderDecision; },
        _buildLoopRequestBodyForTest: function ()         { return _buildLoopRequestBody(); },
        _setActiveSideForTest:    function (s)            { _activeSide = s; },
        _pickRecommendedIdxForTest: function (plan)       { return _pickRecommendedIdx(plan); },
        // FREEFIGHT-COA-ROUTE-JSON-GUARD-A test seams
        _fetchJsonSafeForTest:     function (url, opts)   { return _fetchJsonSafe(url, opts); },
        _isRouteUnavailableForTest: function (resp)       { return _isRouteUnavailable(resp); },
        _routeUnavailableTextForTest: function (resp)     { return _routeUnavailableText(resp); },
        _probeRouteHealthForTest:  function ()            { return _probeRouteHealth(); },
        _getRouteHealthForTest:    function ()            { return _routeHealth; },
        // RMOOZ-LOCAL-MODEL-SELECTOR-A test seams
        _fetchModelsForTest:       function ()            { return _fetchModels(); },
        _selectModelForTest:       function (m, p)        { return _selectModel(m, p); },
        _resetModelSelectionForTest: function ()          { return _resetModelSelection(); },
        _modelAvailableEffectiveForTest: function (rh, info) { if (rh !== undefined) _routeHealth = rh; if (info !== undefined) _modelInfo = info; return _modelAvailableEffective(); },
        _onExternalModelChangedForTest: function (e)      { return _onExternalModelChanged(e); },
        _getModelInfoForTest:      function ()            { return _modelInfo; },
        _setModelInfoForTest:      function (m)           { _modelInfo = m; _pendingModel = (m && m.selected_model) || _pendingModel; updatePanel(); },
        _renderModelSelectorHtmlForTest: function ()      { return renderModelSelectorHtml(); },
        // RMOOZ-AI-USER-FRIENDLY-MODEL-FLOW-A test seams. Setting rh/info drives the simple flow.
        _modelFlowStatusForTest:   function (rh, info)    { if (rh !== undefined) _routeHealth = rh; if (info !== undefined) _modelInfo = info; return _modelFlowStatus(); },
        _modelFlowHtmlForTest:     function (rh, info, open) { if (rh !== undefined) _routeHealth = rh; if (info !== undefined) _modelInfo = info; if (open !== undefined) _modelPickerOpen = !!open; return _modelFlowHtml(); },
        _advancedDiagnosticsHtmlForTest: function (rh, info) { if (rh !== undefined) _routeHealth = rh; if (info !== undefined) _modelInfo = info; return _advancedDiagnosticsHtml(); },
        _benchHtmlForTest:         function (warmup, bench) { if (warmup !== undefined) _warmupResult = warmup; if (bench !== undefined) _benchResult = bench; return _benchHtml(); },   // RMOOZ-OFFLINE-AGENT-ARCHITECTURE-P
        // RMOOZ-GREEN-WORLD-UI-R test seams
        _greenWorldHtmlForTest:    function (a)             { if (a !== undefined) _greenWorld = a; return _greenWorldHtml(); },
        _refreshGreenWorldForTest: function (reason)        { return _refreshGreenWorld(reason); },
        _getGreenWorldForTest:     function ()              { return _greenWorld; },
        _setGreenWorldForTest:     function (a)             { _greenWorld = a; },
        _toggleGreenOverlayForTest: function ()             { _greenOverlayOn = !_greenOverlayOn; _greenOverlayApply(); return _greenOverlayOn; },
        _getGreenOverlayOnForTest: function ()              { return _greenOverlayOn; },
        _getGreenLayerForTest:     function ()              { return _greenLayer; },
        // RMOOZ-AI-SCHEDULER-DECISION-LOG-S test seams
        _recordDecisionForTest:    function (rec)          { return _recordDecision(rec); },
        _recordPlanDecisionForTest: function (plan, dur)   { return _recordPlanDecision(plan, dur); },
        _getDecisionLogForTest:    function ()              { return _decisionLog.slice(); },
        _clearDecisionLogForTest:  function ()              { return _clearDecisionLog(); },
        _decisionLogHtmlForTest:   function ()              { return _decisionLogHtml(); },
        // RMOOZ-WHITE-GREEN-ANNOTATION-T test seam
        _whiteAdvisoryForTest:     function (green)         { return _whiteAdvisory(green); },
        // RMOOZ-GREEN-WHITE-SCORING-T test seams
        _greenAdvisoryScoringForTest: function (green)      { return _greenAdvisoryScoring(green); },
        _applyGreenAdvisoryScoringForTest: function (reason) { return _applyGreenAdvisoryScoring(reason); },
        _whiteReviewForTest:       function ()              { return { validation: (_coaPlan && _coaPlan.validation) || null, green_advisory: (_coaPlan && _coaPlan._green_advisory) || null }; },
        // RMOOZ-COA-RANKING-WITH-ADVISORY-U test seams
        _rankCoasForTest:          function (plan, green)   { return _rankCoas(plan, green); },
        _applyCoaRankingForTest:   function ()              { return _applyCoaRanking(); },
        _pickRecommendedIdxForTest: function (plan)         { return _pickRecommendedIdx(plan || _coaPlan); },
        _getCoaSelectedIdxForTest: function ()              { return _coaSelectedIdx; },
        _setCoaSelectedIdxForTest: function (i)             { _coaSelectedIdx = i; updatePanel(); return _coaSelectedIdx; },
        // RMOOZ-ADVISORY-COMMIT-JOURNAL-V test seam
        _buildCommitAdvisoryContextForTest: function (idx)  { return _buildCommitAdvisoryContext(idx); },
        // RMOOZ-FREE-FIGHT-CONTROL-HARD-RESET-X test seams (the V2 cockpit)
        _renderFreeFightControlV2HtmlForTest: function ()   { return renderFreeFightControlV2(); },
        _freeFightControlStateV2ForTest: function ()        { return _freeFightControlStateV2(); },
        _freeFightLegacyDrawerHtmlForTest: function (legacy) { return _freeFightLegacyDrawerHtml(legacy != null ? legacy : renderAiDecisionHtml()); },
        _setFfLegacyOpenForTest:   function (v)             { _ffLegacyOpen = !!v; return _ffLegacyOpen; },
        _getFfLegacyOpenForTest:   function ()              { return _ffLegacyOpen; },
        _v2SelectCoaForTest:       function (i)             { _coaSelectedIdx = i; updatePanel(); return _coaSelectedIdx; },   // simulates a v2-coa-<i> card click
        // RMOOZ-FREE-FIGHT-V2-OPERATOR-WALKTHROUGH-Y test seams
        _v2StepperHtmlForTest:     function (state)         { return _v2StepperHtml(state || _freeFightControlStateV2()); },
        _v2StepStatusForTest:      function (state, n)      { return _v2StepStatus(state, n); },
        _v2MicrocopyHtmlForTest:   function (state)         { return _v2MicrocopyHtml(state || _freeFightControlStateV2()); },
        _v2SelectedSummaryHtmlForTest: function ()          { return _v2SelectedSummaryHtml(arr(_coaPlan && _coaPlan.coas), _pickRecommendedIdx(_coaPlan)); },
        // RMOOZ-FREE-FIGHT-V2-REAL-OPERATOR-ACCEPTANCE-Z test seam
        _v2MovementSummaryHtmlForTest: function ()          { return _v2MovementSummaryHtml(); },
        // RMOOZ-FREE-FIGHT-CONTINUOUS-SCENARIO-AA test seams
        _runScenarioForTest:       function ()              { return _runScenario(); },
        _scenarioTickForTest:      function ()              { return _scenarioTick(); },
        _scenarioTransitionForTest: function ()             { return _scenarioTransition(); },
        _getScenarioForTest:       function ()              { return _scenario ? Object.assign({}, _scenario) : null; },
        _whiteScenarioOutcomeForTest: function ()           { return _whiteScenarioOutcome(); },
        _redReactionForTest:       function (o)             { return _redReaction(o || _whiteScenarioOutcome()); },
        _scenarioEndConditionForTest: function (o)          { return _scenarioEndCondition(o || _whiteScenarioOutcome()); },
        _pauseScenarioForTest:     function ()              { return _pauseScenario(); },
        _stopScenarioForTest:      function ()              { return _stopScenario(); },
        _resetScenarioForTest:     function ()              { return _resetScenario(); },
        _renderScenarioCockpitV2ForTest: function ()        { return _scenarioActive() ? _renderScenarioCockpitV2() : ''; },
        // RMOOZ-FREE-FIGHT-AUTO-SCENARIO-DIRECTOR-AB test seams
        _setScenarioAutoContinueForTest: function (v)       { _scenarioAutoContinue = !!v; if (_scenario) _scenario.auto_continue = _scenarioAutoContinue; return _scenarioAutoContinue; },
        _toggleScenarioAutoForTest: function ()             { return _toggleScenarioAuto(); },
        _getScenarioAutoContinueForTest: function ()        { return _scenarioAutoContinue; },
        _autoDirectorNextBlueOrderForTest: function (o)     { return _autoDirectorNextBlueOrder(o || _whiteScenarioOutcome()); },
        _redManeuverOrderForTest:  function (o)             { return _redManeuverOrder(o || _whiteScenarioOutcome()); },
        _bodyHtmlForTest:          function ()              { updatePanel(); var b = _panel && _panel.querySelector('[data-ff="body"]'); return b ? b.innerHTML : ''; },
        // RMOOZ-FREE-FIGHT-CONTROL-WINDOW-REBUILD-W test seams
        _setFfTabForTest:          function (t)             { _ffTab = t; return _ffTab; },
        _getFfTabForTest:          function ()              { return _ffTab; },
        _ffTabBarHtmlForTest:      function ()              { return _ffTabBarHtml(); },
        _systemLayersHtmlForTest:  function ()              { return _systemLayersHtml(); },
        _whiteTabHtmlForTest:      function ()              { return _whiteTabHtml(); },
        _renderCommanderLoopHtmlForTest: function (rh, info) { if (rh !== undefined) _routeHealth = rh; if (info !== undefined) _modelInfo = info; return renderCommanderLoopHtml(); },
        _maybeAutoSelectModelForTest: function (info)     { if (info !== undefined) _modelInfo = info; return _maybeAutoSelectModel(); },
        _setModelPickerOpenForTest: function (v)          { _modelPickerOpen = !!v; },
        _resetAutoSelectForTest:   function ()            { _autoSelectedModel = null; },
        _getRouteUnavailableMsgForTest: function ()       { return _routeUnavailableMsg; },
        _getCoaPlanForTest:        function ()            { return _coaPlan; },
        _generateCoaPlanForTest2:  function ()            { return _generateCoaPlan(); },
        // FREEFIGHT-MANUAL-MAP-CAMERA-A test seams
        _getCameraModeForTest:     function ()            { return _freeFightCameraMode; },
        _setCameraModeForTest:     function (m)           { setCameraMode(m); },
        // RMOOZ-AI-COMMANDER-FREEDOM-A test seams
        _getCommanderModeForTest:  function ()            { return _commanderMode; },
        _setCommanderModeForTest:  function (m)           { setCommanderMode(m); },
        _buildLoopRequestBodyForTest: function ()         { return _buildLoopRequestBody(); },
        // RMOOZ-AI-COMMANDER-FREEDOM-B test seams
        _generate5CoasForTest:     function ()            { return generate5Coas(); },
        _renderGen5ForTest:        function (rows, el, t, s, d) { return _renderGen5(rows, el, t, s, d); },
        // RMOOZ-AI-COA-PERFORMANCE-A test seams
        _getAiDepthForTest:        function ()            { return _aiDepth; },
        _setAiDepthForTest:        function (d)           { return setAiDepth(d); },
        _buildAiRequestBodyForTest: function ()           { return _buildAiRequestBody(); },
        _fmtMsForTest:             function (ms)          { return _fmtMs(ms); },
        _coaTimingHtmlForTest:     function (t, plan)     { return _coaTimingHtml(t, plan); },
        // RMOOZ-AI-ATTACK-PLAN-AI-ONLY-A test seams
        _isRealLlmPlanForTest:     function (p)           { return _isRealLlmPlan(p); },
        _renderCoaPlanHtmlForTest: function (p)           { _coaPlan = p; _coaLoading = false; _coaApplied = false; return renderCoaPlanHtml(); },
        // RMOOZ-AI-COMMANDER-REPAIR-LOOP-A test seams
        _renderPlanningTraceHtmlForTest: function (p)     { return renderPlanningTraceHtml(p); },
        _setPlanningModeForTest:   function (m)           { return setPlanningMode(m); },
        _getPlanningModeForTest:   function ()            { return _planningMode; },
        _buildAiRequestBodyForTest2: function ()          { return _buildAiRequestBody(); },
        _generateCoaPlanForTest:   function ()            { return _generateCoaPlan(); },
        _getCoaPlanForTest:        function ()            { return _coaPlan; },
        _setCoaPlanForTest:        function (p)           { _coaPlan = p; },
        // RMOOZ-COA-COMMIT-EXECUTION-L test seams
        _commitCoaForTest:         function (idx)         { return _commitCoa(idx); },
        _getCoaExecForTest:        function ()            { return _coaExec; },
        _coaExecTickForTest:       function ()            { return _coaExecTick(); },
        _runCommittedCoaForTest:   function ()            { return _runCommittedCoa(); },
        _checkReplanTriggersForTest: function ()          { return _checkReplanTriggers(); },
        _pauseCommittedCoaForTest: function ()            { return _pauseCommittedCoa(); },
        _resetCoaExecForTest:      function ()            { return _resetCoaExec(); },
        _replanCoaForTest:         function ()            { return _replanCoa(); },
        _coaExecHtmlForTest:       function ()            { return _coaExecHtml(); },
        _operatorStripHtmlForTest: function ()            { return _operatorStripHtml(); },   // RMOOZ-FREE-FIGHT-SIMPLE-OPERATOR-UX-O
        // RMOOZ-COA-COMMIT-PERSISTENCE-M test seams
        _restoreCoaExecForTest:    function ()            { return _restoreCoaExec(); },
        _peekPersistedCoaExecForTest: function ()         { return _peekPersistedCoaExec(); },
        _forgetCoaExecInMemoryForTest: function ()        { _coaExec = null; if (_coaExecTimer) { _clearIntervalSafe(_coaExecTimer); _coaExecTimer = null; } },  // simulate a refresh (memory gone, sessionStorage kept)
        _setMcpPromptExpandedForTest: function (v)        { _mcpPromptExpanded = !!v; },
        _llmDisabledForTest:       function (p)           { return _llmDisabled(p); },
        _renderCommanderPanelForTest: function (rec)      { _lastCommanderDecision = rec; _loopRunning = true; try { renderCommanderPanel(); } catch (_) {} _loopRunning = false; return _cmdrPanel ? _cmdrPanel.innerHTML : ''; },
        // RMOOZ-AI-FREE-FIGHT-AI-ONLY-A test seams. _setAiOnlyGateForTest(false) is the sanctioned
        // "deterministic planner for tests" relaxation used by the loop-MECHANICS suites.
        _setAiOnlyGateForTest:     function (v)           { _aiOnlyGate = (v !== false); },
        _freeFightAiReadyForTest:  function ()            { return _freeFightAiReady(); },
        _getAiUnavailableMsgForTest: function ()          { return _aiUnavailableMsg; },
        _setRouteHealthForTest:    function (h)           { _routeHealth = h; },
        // RMOOZ-FREE-FIGHT-AI-GATE-CARD-D test seams
        _aiGateStatusHtmlForTest:  function (h)           { if (h !== undefined) _routeHealth = h; return _aiGateStatusHtml(); },
        _aiBlockReasonsForTest:    function (h)           { return _aiBlockReasons(h); },
        _renderAiDecisionHtmlForTest: function ()         { return renderAiDecisionHtml(); },
        // RMOOZ-AI-FREE-FIGHT-UX-PROOF-A test seams
        _aiReadinessHtmlForTest:   function (rh, plan)    { if (rh !== undefined) _routeHealth = rh; return _aiReadinessHtml(plan); },
        _aiCandidateFilterHtmlForTest: function (plan)    { return _aiCandidateFilterHtml(plan); },
        _aiNonSelectedUnitsHtmlForTest: function (plan)   { _coaSelectedIdx = 0; return _aiNonSelectedUnitsHtml(plan); },
        _aiUnitLabelForTest:       function (uid)         { return _aiUnitLabel(uid); },
        // RMOOZ-AI-FREE-FIGHT-REAL-AI-TEST-A real-LLM E2E seams
        _setCaptureRawLlmForTest:  function (v)           { _captureRawLlm = !!v; },
        _getCoaMovedUnitsForTest:  function ()            { return _coaMovedUnits.slice(); },
        _getTurnLogForTest:        function ()            { return _turnLog.slice(); },
        _getLastLoopPlanForTest:   function ()            { return _lastLoopPlan; },
        // RMOOZ-AI-MOVEMENT-EXECUTION-AUDIT-A test seams
        _planSourceNoteHtmlForTest: function (p)          { return _planSourceNoteHtml(p); },
        _coaDebugHtmlForTest:      function (p, applied, moved) { _coaPlan = p; if (applied != null) _coaApplied = applied; if (moved) _coaMovedUnits = moved; return _coaDebugHtml(); },
        _logExecutedMovesForTest:  function (moves)       { return _logExecutedMoves(moves); },
        // RMOZ-INTEL-CAPABILITY-TERRAIN-ZONE-A test seams
        _getLastIntelForTest:        function ()          { return _lastIntel; },
        _getCoaFamilyHistoryForTest: function ()          { return _coaFamilyHistory.slice(); },
        // RMOZ-COMMANDER-BRIEF-COALITION-A test seams
        _getLastBriefForTest:        function ()          { return _lastBrief; },
        _setBriefExpandedForTest:    function (v)         { _briefExpanded = !!v; },
        // FREEFIGHT-ACTION-REACTION-MAP-OVERLAY-A test seam
        _syncMarkersForTest:         function ()          { if (mapReady()) syncMarkers(); },
        // FREEFIGHT-LLM-CAPABILITY-ANALYST-A test seam
        _getLastCapabilityForTest:   function ()          { return _lastCapability; },
        // RMOZ-AI-TOOL-CONTRACT-A test seam
        _getLastToolContractForTest: function ()          { return _lastToolContract; },
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = API;
    if (typeof window !== 'undefined') window.RmoozFreeFightDemo = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
