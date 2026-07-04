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

    // RMOOZ-FF-EVIDENCE-BUILD-MARKER-A: a single source-of-truth build tag, surfaced in the SCC
    // Evidence/Debug panel so an operator screenshot proves whether the browser ran THIS build or a
    // stale cache. Bump this when shipping a Free Fight behavior/layer change (mirror the app.html ?v=).
    var _BUILD_MARKER = 'behavior-path-required-a';
    var RED_ATTACK = 2, BLUE_REACT = 3;     // sample sizes (nearest to Objective X)
    var STEP = 0.1, TICK_MS = 90;
    var BLUE_RING = 0.35;                    // BLUE intercept standoff (fraction of anchor→obj dist)

    var _payload = null, _objective = null;
    var _allGroups = [], _red = [], _blue = [], _anchors = [];
    var _progress = 0, _running = false, _paused = false, _timer = null;
    var _layer = null, _panel = null, _card = null, _aiPanel = null, _cmdrPanel = null;
    // RMOOZ-DUAL-MAP-LAYER-CONFLICT-A: AI-lite staged preview lives on its own Leaflet
    // layer group so it never bleeds onto the Free Fight / SCC execution layer.
    var _aiLiteLayer = null;
    var _aiLiteStagedVisible = true; // cleared permanently when SCC/COA mode activates
    // RMOOZ-FF-EVIDENCE-BUILD-MARKER-A: the live map-layer mode label. Flips to 'free_fight' the first
    // time a real COA operation clears the AI-lite overlay, so the SCC Evidence panel reports the TRUE
    // execution posture instead of a stuck default. Mirrored by window.RmoozMapLayerMode below.
    var _mapLayerMode = 'ai_lite_preview';
    var _winState = null, _viewportResizeHandler = null;
    var _plan = null, _terrain = { available: false }, _objectiveSource = null;
    var _aiDecision = null, _aiLoading = false, _aiApplied = false, _aiDiagnostics = null;
    var _aiMovedUnit = null, _aiMovedUnitOldPos = null, _aiMovedUnitSource = null;
    var _useLlm = false, _llmTestStatus = null;
    // FREEFIGHT-AI-COA-PLANNER-A: multi-unit COA state
    var _coaPlan = null, _coaLoading = false, _coaApplied = false, _coaSelectedIdx = 0;
    var _coaRepairAttempted = false;   // RMOOZ-REAL-COA-COMMANDER-QUALITY-AD: one LLM repair attempt per manual generate
    var _coaMovedUnits = [];  // [{unit, oldPos}, ...] — only units that VISIBLY moved
    var _movementValidationLog = [];   // RMOOZ-COA-REALISM-GATE-A: per-move territory/domain validation entries
    var _domainHeldUids = {};          // RMOOZ-COA-REALISM-GATE-A: log domain holds once per unit (prevents log spam)
    // RMOOZ-MOVEMENT-INTELLIGENCE-A: per-commit truth records (visible on map + debug panel)
    var _missingUnitRecords    = [];   // [{uid, reason}] — COA referenced unit not found on map
    var _heldMovementRecords   = [];   // [{uid, side, lat, lon, reason}] — step-1/domain held during execution
    var _domainBlockedRecords  = [];   // [{uid, side, lat, lon, domain, reason}] — domain-violation holds
    var _movedMovementRecords  = [];   // [{uid, side, moved_km, behavior, domain, from, to}] — what actually moved this tick
    var _placementValidation = [];     // RMOOZ-COA-REALISM-GATE-A: initial placement check results on scenario start
    // FREEFIGHT-BLUE-THREAT-AWARE-MOVEMENT-A: a unit whose move is below this is
    // "already in position" — not counted as moved (so zero/tiny moves aren't faked).
    var MIN_VISIBLE_MOVE_DEG = 0.003;
    var _coaHeldCount = 0;    // units already in position (move below epsilon)
    // RMOOZ-COA-COMMIT-EXECUTION-L: "COA Commitment Mode" — the operator commits ONE generated COA and
    // RMOOZ executes it phase-by-phase, deterministically, with NO LLM call on normal ticks. AI is
    // re-engaged ONLY when a replan trigger fires or the operator clicks Replan. This is an ADDITIONAL
    // mode alongside the AI-every-turn loop (which is unchanged).
    var _coaExec = null;        // active_coa_execution_state (see _commitCoa) | null
    var _committedPlanObj = null;   // RMOOZ-FREE-FIGHT-V2-COA-TO-SCENARIO-BUGFIX-AB1: the _coaPlan object _coaExec was committed from (identity check → a fresh plan / changed selection supersedes a stale commit)
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
    var _missionRoleContract = null;     // RMOOZ-MISSION-ROLE-CONTRACT-A: derived from scenario JSON
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
    var _netLog = [];                  // RMOOZ-SCENARIO-CONTROL-CENTER-REBUILD-AF: recent COA/AI network calls (Evidence panel)
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
    // RMOOZ-COA-REALISM-GATE-A: returns the territory/movement validation gate if loaded.
    function _getCoaRealismGate() { var w = W(); return (w && w.RmoozCoaRealismGate) || null; }
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
        // RMOOZ-OBJ-CANONICAL-A: sync to loaded scenario so all sc.obj readers see the same Objective X.
        try {
            var _sc = W() && W().RmoozScenario && W().RmoozScenario.scenario;
            if (_sc) {
                if (finiteLL(_objective)) {
                    var _newObj = { lat: _objective.lat, lon: _objective.lon, coord: [_objective.lon, _objective.lat],
                        name: 'Objective X', source_type: 'user_marked_demo_objective', needs_review: true };
                    _sc._previous_objective = _sc.obj || _sc.objective || null;
                    _sc.obj = _newObj; _sc.objective = _newObj;
                    if (Array.isArray(_sc.objectives) && _sc.objectives.length) { _sc.objectives[0] = _newObj; } else { _sc.objectives = [_newObj]; }
                } else if (_sc._previous_objective) {
                    _sc.obj = _sc._previous_objective; _sc.objective = _sc._previous_objective;
                    if (Array.isArray(_sc.objectives) && _sc.objectives.length) { _sc.objectives[0] = _sc._previous_objective; } else { _sc.objectives = [_sc._previous_objective]; }
                }
            }
        } catch (_scEx) {}
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
        // RMOOZ-OBJ-CANONICAL-A: restore sc.obj from _previous_objective so /plan-coas
        // does not fall back to the stale operator B that was written into sc.obj.
        // Only acts when setObjective() previously wrote to sc.obj (_previous_objective set).
        try {
            var _sc2 = W() && W().RmoozScenario && W().RmoozScenario.scenario;
            if (_sc2 && _sc2._previous_objective) {
                _sc2.obj = _sc2._previous_objective; _sc2.objective = _sc2._previous_objective;
                if (Array.isArray(_sc2.objectives) && _sc2.objectives.length) { _sc2.objectives[0] = _sc2._previous_objective; } else { _sc2.objectives = [_sc2._previous_objective]; }
                _sc2._previous_objective = null;
            }
            // No _previous_objective means setObjective() was never called — sc.obj is already the original scenario value; leave it alone.
        } catch (_scEx2) {}
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

    // RMOOZ-DUAL-MAP-LAYER-CONFLICT-A: clear AI-lite staged preview groups and hide the
    // overlay permanently for this session. Called before any real COA operation so the
    // "staged" label markers are never visible alongside execution-path map output.
    function _clearAiLiteStagedGroups() {
        _aiLiteStagedVisible = false;
        _mapLayerMode = 'free_fight';   // a real COA operation owns the map now (execution posture)
        _red = []; _blue = [];
        if (_aiLiteLayer) { try { _aiLiteLayer.clearLayers(); } catch (_) {} }
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

    // RMOOZ-MOVEMENT-TRUTH-A: Draw planned movement arrows when a COA plan exists but
    // has NOT yet been committed. Preview-only — does NOT mutate unit positions.
    function _planPreviewLayer(w) {
        if (!_coaPlan || !_coaPlan.ok || _coaExec) return;
        var L = w.L; if (!L) return;
        var coa = (_coaPlan.coas && _coaPlan.coas[_coaSelectedIdx]) || (_coaPlan.coas && _coaPlan.coas[0]);
        if (!coa) return;
        var ROLE_COL_R = { assault: '#e86040', recon: '#d0b060', support: '#f0a040', screen: '#f07060', reserve: '#808898' };
        var ROLE_COL_B = { intercept: '#40b8b0', defend: '#4090d0', screen: '#8888d0', reinforce: '#60a880', reserve: '#6090a0' };
        arr(coa.phases).forEach(function (ph) {
            arr(ph && ph.actions).forEach(function (act) {
                if (!act || act.action_type === 'HOLD_POSITION') return;
                if (!act.target || !Number.isFinite(+act.target.lat) || !Number.isFinite(+act.target.lon)) return;
                var found = _findRealUnit(act.unit_uid); if (!found || !found.unit) return;
                var u = found.unit;
                var sLat = u.lat != null ? +u.lat : (Array.isArray(u.coord) ? +u.coord[1] : null);
                var sLon = u.lon != null ? +u.lon : (Array.isArray(u.coord) ? +u.coord[0] : null);
                if (!Number.isFinite(sLat) || !Number.isFinite(sLon)) return;
                var tLat = +act.target.lat, tLon = +act.target.lon;
                var side = String((u.side) || '').toUpperCase();
                var role = act.role || 'unit';
                var roleColor = side === 'RED' ? (ROLE_COL_R[role] || '#e07050') : (ROLE_COL_B[role] || '#50a0d0');
                var roleLabel = (side === 'RED' ? 'RED ' : side === 'BLUE' ? 'BLUE ' : '') + role.toUpperCase();
                var taskable = _isUnitTaskable(act.unit_uid);
                var lineColor = taskable ? roleColor : '#505868';
                try {
                    _layer.addLayer(L.polyline([[sLat, sLon], [tLat, tLon]], {
                        color: lineColor, weight: 2, opacity: 0.6, dashArray: '8 5', interactive: false,
                    }));
                    var diamondHtml = '<div style="width:10px;height:10px;border:2px solid ' + lineColor + ';background:rgba(8,14,20,.8);transform:rotate(45deg);"></div>';
                    var tgtM = L.marker([tLat, tLon], {
                        icon: L.divIcon({ className: '', html: diamondHtml, iconSize: [10, 10], iconAnchor: [5, 5] }),
                        interactive: true, keyboard: false,
                    });
                    var distKm = _kmBetween({ lat: sLat, lon: sLon }, { lat: tLat, lon: tLon });
                    var objDist = _objective ? Math.round(_kmBetween({ lat: tLat, lon: tLon }, _objective) * 10) / 10 : null;
                    tgtM.bindPopup('<div style="font-size:11px;color:#e8eaed;min-width:175px;">' +
                        '<b style="color:' + roleColor + ';">' + esc(act.unit_uid || '') + '</b> — <b style="color:' + roleColor + ';">' + esc(roleLabel) + '</b>' +
                        (!taskable ? ' <b style="color:#f08060;">[HOLD REVIEW]</b>' : '') + '<br>' +
                        'from: ' + sLat.toFixed(4) + ', ' + sLon.toFixed(4) + '<br>' +
                        'target: ' + tLat.toFixed(4) + ', ' + tLon.toFixed(4) + '<br>' +
                        'move: ' + Math.round(distKm * 10) / 10 + ' km' +
                        (objDist != null ? ' · obj: ' + objDist + ' km' : '') + '</div>');
                    _layer.addLayer(tgtM);
                    var lbl = taskable
                        ? '<div data-ff-ovl="plan-preview" style="font-size:8px;font-weight:700;color:' + roleColor + ';background:rgba(8,14,20,.82);padding:0 3px;border-radius:2px;white-space:nowrap;border:1px solid rgba(255,255,255,.1);">' + esc(roleLabel) + '</div>'
                        : '<div data-ff-ovl="hold-review" style="font-size:8px;font-weight:700;color:#f0a060;background:rgba(20,12,4,.85);padding:0 3px;border-radius:2px;white-space:nowrap;border:1px solid rgba(240,160,96,.3);">HOLD REVIEW</div>';
                    _layer.addLayer(L.marker([tLat, tLon], {
                        icon: L.divIcon({ className: '', html: lbl, iconSize: [10, 10], iconAnchor: [-4, 5] }),
                        interactive: false, keyboard: false,
                    }));
                } catch (_pe) {}
            });
        });
    }
    // RMOOZ-MOVEMENT-TRUTH-A: Committed target overlay — solid ring markers at each COA
    // action target once a COA is committed but before the first Run tick executes.
    function _committedOverlayLayer(w) {
        if (!_coaExec || !_coaExec.active || _coaApplied) return;
        var L = w.L; if (!L) return;
        var coa = _coaExec.selected_coa; if (!coa) return;
        var ROLE_COL_R = { assault: '#e86040', recon: '#d0b060', support: '#f0a040', screen: '#f07060', reserve: '#808898' };
        var ROLE_COL_B = { intercept: '#40b8b0', defend: '#4090d0', screen: '#8888d0', reinforce: '#60a880', reserve: '#6090a0' };
        arr(coa.phases).forEach(function (ph) {
            arr(ph && ph.actions).forEach(function (act) {
                if (!act || act.action_type === 'HOLD_POSITION') return;
                if (!act.target || !Number.isFinite(+act.target.lat) || !Number.isFinite(+act.target.lon)) return;
                var found = _findRealUnit(act.unit_uid); if (!found || !found.unit) return;
                var u = found.unit;
                var side = String((u.side) || '').toUpperCase();
                var role = act.role || 'unit';
                var roleColor = side === 'RED' ? (ROLE_COL_R[role] || '#e07050') : (ROLE_COL_B[role] || '#50a0d0');
                var roleLabel = (side === 'RED' ? 'RED ' : side === 'BLUE' ? 'BLUE ' : '') + role.toUpperCase();
                var tLat = +act.target.lat, tLon = +act.target.lon;
                try {
                    if (typeof L.circleMarker === 'function') {
                        _layer.addLayer(L.circleMarker([tLat, tLon], {
                            radius: 7, color: roleColor, weight: 2.5, fillColor: '#080f18', fillOpacity: 0.75, interactive: false,
                        }));
                    }
                    _layer.addLayer(L.marker([tLat, tLon], {
                        icon: L.divIcon({ className: '', html: '<div data-ff-ovl="committed-target" style="font-size:8px;font-weight:700;color:' + esc(roleColor) + ';background:rgba(8,14,20,.88);padding:0 3px;border-radius:2px;white-space:nowrap;border:1px solid ' + esc(roleColor) + ';">⊙ ' + esc(roleLabel) + '</div>', iconSize: [10, 10], iconAnchor: [-4, 5] }),
                        interactive: false, keyboard: false,
                    }));
                } catch (_ce) {}
            });
        });
    }

    function syncMarkers() {
        var w = W();
        if (!mapReady()) return;
        if (!_layer) { _layer = w.L.layerGroup(); _layer.addTo(w.map); }
        _layer.clearLayers();
        // RMOOZ-DUAL-MAP-LAYER-CONFLICT-A: AI-lite staged preview layer (separate from execution layer)
        if (!_aiLiteLayer) { _aiLiteLayer = w.L.layerGroup(); _aiLiteLayer.addTo(w.map); }
        _aiLiteLayer.clearLayers();
        // RMOOZ-FREEFIGHT-MAP-TRUTH-A: Objective X — operator-placed marker.
        // Shows as "ACTIVE OBJECTIVE X" with lat/lon/source. If the scenario had a
        // previous objective at a different position, it is drawn as INACTIVE.
        if (finiteLL(_objective)) {
            // ── inactive previous objective (if present at a different position) ──
            try {
                var _mapSc = W() && W().RmoozScenario && W().RmoozScenario.scenario;
                var _prevObj = _mapSc && _mapSc._previous_objective;
                if (_prevObj && Number.isFinite(+_prevObj.lat) && Number.isFinite(+_prevObj.lon)) {
                    var _pdist = Math.sqrt(Math.pow(+_prevObj.lat - _objective.lat, 2) + Math.pow(+_prevObj.lon - _objective.lon, 2));
                    if (_pdist > 0.001) {
                        var _pIcon = w.L.divIcon({ className: '', html: '<div style="width:20px;height:20px;border-radius:50%;border:1px dashed #5a6a7a;background:rgba(50,60,70,.18);display:flex;align-items:center;justify-content:center;color:#5a6a7a;font-size:10px;opacity:.55;">◎</div>', iconSize: [22, 22], iconAnchor: [11, 11] });
                        var _pom = w.L.marker([+_prevObj.lat, +_prevObj.lon], { icon: _pIcon, interactive: false, keyboard: false });
                        _pom._rmoozReviewOnly = true;
                        _layer.addLayer(_pom);
                        var _pLbl = w.L.divIcon({ className: '', html: '<div style="font-size:8px;color:#5a6a7a;background:rgba(8,14,20,.7);padding:1px 3px;border-radius:2px;white-space:nowrap;opacity:.65;border:1px solid rgba(90,106,122,.3);">previous objective — INACTIVE</div>', iconSize: [150, 12], iconAnchor: [-4, 6] });
                        _layer.addLayer(w.L.marker([+_prevObj.lat, +_prevObj.lon], { icon: _pLbl, interactive: false, keyboard: false }));
                    }
                }
            } catch (_prevEx) {}
            // ── ACTIVE Objective X ──
            var objIcon = w.L.divIcon({ className: 'rmooz-ff-objective', html: '<div style="width:32px;height:32px;border-radius:50%;border:3px solid #f0c040;background:rgba(240,192,64,.22);display:flex;align-items:center;justify-content:center;color:#ffe060;font-size:16px;box-shadow:0 0 8px rgba(240,192,64,.45);">◉</div>', iconSize: [34, 34], iconAnchor: [17, 17] });
            var om = w.L.marker([_objective.lat, _objective.lon], { icon: objIcon, interactive: true, keyboard: false, title: 'ACTIVE OBJECTIVE X — ' + _objective.lat.toFixed(4) + ', ' + _objective.lon.toFixed(4) });
            om._rmoozReviewOnly = true; om._rmoozObjectiveX = true;
            om.bindPopup('<div style="font-size:12px;color:#e8eaed;background:#0e1620;min-width:200px;padding:6px;"><b style="color:#f0c040;font-size:13px;">ACTIVE OBJECTIVE X</b><br>' +
                '<span style="color:#a0b8c8;">' + _objective.lat.toFixed(5) + ', ' + _objective.lon.toFixed(5) + '</span><br>' +
                '<span style="color:#6a8a9a;font-size:10px;">source: ' + esc(_objectiveSource || 'user_marked_demo_objective') + '</span><br>' +
                '<span style="color:#5a7a6a;font-size:10px;">RED attacks this objective · BLUE defends it</span></div>');
            _layer.addLayer(om);
            // Label offset from the marker
            var _objLblIc = w.L.divIcon({ className: '', html: '<div style="font-size:9px;font-weight:700;color:#f0c040;background:rgba(8,14,20,.82);padding:1px 4px;border-radius:2px;white-space:nowrap;border:1px solid rgba(240,192,64,.35);">ACTIVE OBJECTIVE X</div>', iconSize: [130, 14], iconAnchor: [-8, 7] });
            _layer.addLayer(w.L.marker([_objective.lat, _objective.lon], { icon: _objLblIc, interactive: false, keyboard: false }));
        }
        // RMOOZ-DUAL-MAP-LAYER-CONFLICT-A: AI-lite staged preview groups render on _aiLiteLayer,
        // NOT on _layer. Gated: once any real COA operation fires, _aiLiteStagedVisible=false
        // and these "staged" labels never appear alongside execution-path markers.
        if (_aiLiteStagedVisible) {
            groups().forEach(function (g) {
                if (!finiteLL(g.current)) return;
                var color = colorFor(g);
                var icon = w.L.divIcon({
                    className: 'rmooz-ff-group rmooz-ff-' + g.role.toLowerCase(),
                    html: '<div title="' + esc(g.role + ' demo group') + '" style="display:flex;align-items:center;gap:3px;">' +
                        '<span style="width:15px;height:15px;border-radius:3px;background:' + color + ';border:2px solid ' + (g.role === 'RED' ? '#8f1f1f' : '#1f7a4d') + ';box-shadow:0 0 0 2px rgba(255,255,255,.3);display:flex;align-items:center;justify-content:center;color:#0c1118;font-size:10px;">' + groupGlyph(g) + '</span>' +
                        '<span style="background:#0e1620;color:#e8eaed;border:1px solid ' + color + ';border-radius:3px;padding:0 4px;font-size:10px;font-weight:700;white-space:nowrap;opacity:0.55;">' + esc(g.country || g.side) + ' · REVIEW PREVIEW</span></div>',
                    iconSize: [120, 18], iconAnchor: [7, 9],
                });
                var m = w.L.marker(markerLatLng(g), { icon: icon, interactive: true, keyboard: false, title: 'AI-lite review preview (not execution) — preview overlay only, not actual imported positions' });
                m._rmoozDemoOnly = true; m._rmoozReviewOnly = true; m._rmoozExactUnitPosition = false;
                m._rmoozAiLitePreview = true;
                m._rmoozSymbolCategory = dominant(g);
                m._rmoozUnitIntelSummary = g.unit_intel_summary || null;
                if (typeof m.on === 'function') m.on('click', function () { openDemoUnitCard(g); });
                _aiLiteLayer.addLayer(m);
            });
        }
        // RMOOZ-MOVEMENT-TRUTH-A: plan preview arrows (plan ready, not yet committed)
        // and committed target overlay (committed, not yet run). Visual-only, no position mutation.
        try { _planPreviewLayer(w); } catch (_pp) {}
        try { _committedOverlayLayer(w); } catch (_co) {}
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
                // RMOOZ-FREEFIGHT-MAP-TRUTH-A: side-aware trail colours and labels.
                // RED uses warm tones; BLUE uses cool tones.
                var unitSideT = String((mv.unit && mv.unit.side) || '').toUpperCase();
                var ROLE_COLORS_RED  = { assault: '#e86040', recon: '#d0b060', support: '#f0a040', screen: '#f07060', reserve: '#808898', hold: '#808898' };
                var ROLE_COLORS_BLUE = { intercept: '#40b8b0', defend: '#4090d0', screen: '#8888d0', reinforce: '#60a880', reserve: '#6090a0', hold: '#6090a0' };
                var trailColor = (unitSideT === 'RED' ? ROLE_COLORS_RED[role] : ROLE_COLORS_BLUE[role]) || (unitSideT === 'RED' ? '#e07050' : '#50a0d0');
                var sideRoleLabel = (unitSideT === 'RED' ? 'RED ' : unitSideT === 'BLUE' ? 'BLUE ' : '') + role.toUpperCase();
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
                        ' [' + esc(sideRoleLabel) + ']<br>' +
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
            label((+nr.lat + objLat) / 2, (+nr.lon + objLon) / 2, '<div data-ff-ovl="red-axis" style="font-size:9px;font-weight:700;color:#f07070;background:rgba(8,14,20,.72);padding:0 4px;border-radius:2px;white-space:nowrap;border:1px solid rgba(240,96,96,.3);">RED ATTACK AXIS</div>', [0, 0]);
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
            label(ipLat, ipLon, '<div data-ff-ovl="block-point" style="font-size:9px;font-weight:700;color:#60d8d0;background:rgba(8,14,20,.82);padding:0 4px;border-radius:2px;white-space:nowrap;border:1px solid rgba(64,192,192,.3);">BLUE INTERCEPT POINT · نقطة الاعتراض</div>', [0, -12]);
            // BLUE intercept line: from first moved BLUE unit's start position to the intercept point.
            // RMOOZ-FREEFIGHT-MAP-TRUTH-A: use first BLUE unit, not first unit overall.
            if (_coaMovedUnits.length && typeof L.polyline === 'function') {
                var _blueOrigins = _coaMovedUnits.filter(function (mv) { return mv && mv.unit && String(mv.unit.side || '').toUpperCase() === 'BLUE'; });
                var origin = (_blueOrigins.length ? _blueOrigins[0] : _coaMovedUnits[0]);
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

        // 6) Side-aware role badges on all moved units.
        // RMOOZ-FREEFIGHT-MAP-TRUTH-A: RED badges use "RED ASSAULT/RECON/…"; BLUE use "BLUE DEFEND/INTERCEPT/…"
        if (_coaApplied && _coaMovedUnits.length) {
            _coaMovedUnits.forEach(function (mv) {
                if (!mv || !mv.unit || !mv.role) return;
                var lat = mv.unit.lat, lon = mv.unit.lon;
                if (!Number.isFinite(+lat) || !Number.isFinite(+lon)) return;
                var unitSideB = String((mv.unit && mv.unit.side) || '').toUpperCase();
                var badgeLabel = (unitSideB === 'RED' ? 'RED ' : unitSideB === 'BLUE' ? 'BLUE ' : '') + mv.role.toUpperCase();
                var badgeColor = unitSideB === 'RED' ? '#f09080' : unitSideB === 'BLUE' ? '#80c0f0' : '#cfeaff';
                var bgColor = unitSideB === 'RED' ? 'rgba(30,12,8,.82)' : unitSideB === 'BLUE' ? 'rgba(8,20,36,.82)' : 'rgba(8,30,40,.8)';
                label(+lat, +lon, '<div data-ff-ovl="role" style="font-size:8px;font-weight:700;color:' + badgeColor + ';background:' + bgColor + ';padding:0 3px;border-radius:2px;white-space:nowrap;">' + esc(badgeLabel) + '</div>', [0, 14]);
            });
        }
        if (_coaHeldCount > 0) {
            label(objLat - (+th.warning || 0.2), objLon, '<div data-ff-ovl="held" style="font-size:9px;color:#9ab0c0;background:rgba(8,14,20,.75);padding:0 3px;border-radius:2px;white-space:nowrap;">' + _coaHeldCount + ' BLUE units already in position</div>', [0, 0]);
        }
        // RMOOZ-MOVEMENT-TRUTH-A: per-unit HOLD REVIEW labels for Step-1-held units.
        // Shown regardless of _coaApplied so operators can see which units are suppressed.
        var _heldKeys = Object.keys(_step1HeldUids);
        if (_heldKeys.length && typeof L.marker === 'function' && typeof L.divIcon === 'function') {
            _heldKeys.forEach(function (uid) {
                var f = _findRealUnit(uid); if (!f || !f.unit) return;
                var u = f.unit;
                var lat = u.lat != null ? +u.lat : (Array.isArray(u.coord) ? +u.coord[1] : null);
                var lon = u.lon != null ? +u.lon : (Array.isArray(u.coord) ? +u.coord[0] : null);
                if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
                try {
                    label(lat, lon, '<div data-ff-ovl="hold-unit" style="font-size:8px;font-weight:700;color:#f0a060;background:rgba(20,12,4,.88);padding:1px 4px;border-radius:2px;white-space:nowrap;border:1px solid rgba(240,160,96,.35);">⚠ HOLD REVIEW · ' + esc(uid) + '</div>', [-4, 5]);
                } catch (_) {}
            });
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
        // RMOOZ-SCENARIO-CONTROL-CENTER-REBUILD-AF/AG: the operator card is the NEW Scenario Control Center,
        // a HARD REPLACEMENT. The old Free Fight control window (its cockpit, diagnostics drawer, group-movement
        // demo, COA-card UI, and every old action id) has been physically deleted (AG) and is no longer
        // rendered or bound. The SCC owns the entire operator flow and drives the UNCHANGED engine through the
        // facade (window.RmoozFreeFightDemo.engine). No old action id exists in the operator DOM.
        var scc = W() && W().RmoozScenarioControlCenter;
        bodyDiv.innerHTML = scc ? scc.render()
            : '<div style="padding:12px;color:#f0707a;font-size:12px;">Scenario Control Center module failed to load (scenario-control-center.js).</div>';
        if (scc && typeof scc.bind === 'function') scc.bind(bind);
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
    // RMOOZ-SCENARIO-CONTROL-CENTER-REBUILD-AF/AG: the old right-side reasoning floating panel (_aiPanel)
    // was an old operator surface. Its HTML builder was deleted; this is a permanent no-op that guarantees
    // _aiPanel is never present in the operator DOM. The Scenario Control Center (_panel body) is the ONLY
    // operator window.
    function renderAiPanel() {
        if (_aiPanel && _aiPanel.parentNode) { try { _aiPanel.parentNode.removeChild(_aiPanel); } catch (_) {} }
        _aiPanel = null;
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

        var units = [], hadScenarioUnits = false;

        // Priority A: window.RmoozScenario.scenario units (real loaded scenario)
        var sc = w && w.RmoozScenario && w.RmoozScenario.scenario;
        if (sc) {
            var rawA = (Array.isArray(sc.red_units) ? sc.red_units : []).concat(
                       Array.isArray(sc.blue_units_initial) ? sc.blue_units_initial : []);
            if (rawA.length) {
                hadScenarioUnits = true;   // RMOOZ-AI-FREE-FIGHT-FORCE-POOL-PRESENT-A: a scenario IS loaded with units — never substitute brief/demo units
                tallyRaw(rawA);
                units = rawA.map(normUnit).filter(Boolean);
                dMovable = units.length;
                if (units.length) sourceUsed = 'scenario';
            }
        }

        // Priority B: operational_brief.proposed_units (ONLY when NO scenario is loaded — never substitute
        // brief units for a loaded scenario, else the COA tasks units absent from window.RmoozScenario)
        if (!units.length && !hadScenarioUnits) {
            var ob = (_payload && _payload.brief && _payload.brief.operational_brief) || (_payload && _payload.operational_brief) || {};
            var rawB = Array.isArray(ob.proposed_units) ? ob.proposed_units : [];
            if (rawB.length) {
                tallyRaw(rawB);
                units = rawB.map(normUnit).filter(Boolean);
                dMovable = units.length;
                if (units.length) sourceUsed = 'proposed_units';
            }
        }

        // Priority C: _allGroups anchor positions (ONLY when NO scenario is loaded)
        if (!units.length && !hadScenarioUnits) {
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

        // RMOOZ-OBJ-CANONICAL-A: operator Objective X is the canonical COA objective.
        // Priority: 1. explicit operator _objective (user_marked_demo_objective / reused_previous / opts)
        //           2. loaded scenario (sc.obj / sc.objective / sc.objectives[0]) — fallback only
        //           3. other _objective sources (e.g. 'brief') — auto-derived
        //           4. payload objectives / placement_candidates — last resort
        function scenObjToLL(o) {
            if (!o) return null;
            if (Array.isArray(o.coord) && o.coord.length >= 2 && Number.isFinite(+o.coord[0]) && Number.isFinite(+o.coord[1]))
                return { lat: +o.coord[1], lon: +o.coord[0], name: o.name || 'Objective X' };
            if (Number.isFinite(+o.lat) && Number.isFinite(+o.lon)) return { lat: +o.lat, lon: +o.lon, name: o.name || 'Objective X' };
            return null;
        }
        var objectives = [];
        var _srcIsOperator = finiteLL(_objective) && (_objectiveSource === 'user_marked_demo_objective' || _objectiveSource === 'reused_previous' || _objectiveSource === 'opts');
        if (_srcIsOperator) {
            objectives = [{ lat: _objective.lat, lon: _objective.lon, name: 'Objective X', source_type: _objectiveSource }];
        }
        if (!objectives.length && sc) {
            var scLL = scenObjToLL(sc.obj) || scenObjToLL(sc.objective);
            if (!scLL && Array.isArray(sc.objectives) && sc.objectives.length) scLL = scenObjToLL(sc.objectives[0]);
            if (scLL) objectives = [scLL];
        }
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
        // RMOOZ-SCENARIO-CONTROL-CENTER-REBUILD-AF: log every COA/AI network call for the Evidence panel.
        try { _netLog.push({ url: String(url), method: (options && options.method) || 'GET', t: _nowMs() }); if (_netLog.length > 25) _netLog.splice(0, _netLog.length - 25); } catch (_) {}
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
            .then(function (h) {
                _routeHealth = (h && h.ok === true) ? Object.assign({}, _routeHealth || {}, h) : h;
                updatePanel(); return _routeHealth;
            })
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
        // RMOOZ-AI-MODEL-WIRING-COHERENCE-A: a cloud slug with a local provider is incoherent.
        // Compute pair_coherent from the /api/ai/models payload so _freeFightAiReady() sees it
        // immediately — before the next /route-health probe fires.
        var cloudSlug = !!(m.selected_is_cloud_slug);
        var pairCoherent = cloudSlug ? cloud : true;  // cloud slug OK only when provider=openrouter
        _routeHealth = Object.assign({}, prev, {
            ok: true,
            allow_sim_run:    (m.allow_sim_run    != null) ? m.allow_sim_run    : prev.allow_sim_run,
            model_available:  (m.model_available  != null) ? m.model_available  : prev.model_available,
            provider_blocked: (m.provider_blocked != null) ? !!m.provider_blocked : prev.provider_blocked,
            configured_provider: m.configured_provider || (cloud ? 'openrouter' : 'ollama'),
            provider: (m.provider_blocked ? 'ollama' : (cloud ? 'openrouter' : 'ollama')),
            model:          m.selected_model || prev.model,
            selected_model: m.selected_model || prev.selected_model,
            pair_coherent: pairCoherent,
            selected_is_cloud_slug: cloudSlug,
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
    // ══ RMOOZ-REAL-COA-COMMANDER-QUALITY-AD: COA Quality Gate + Staff-Safe commander template ═════════
    // A deterministic tactical-credibility gate (NO LLM, NO fetch). A COA must look like a real commander
    // plan — role-separated positions, support/security/reserve, multi-phase, commander intent + Red
    // assumption + risk mitigation — before the cockpit presents it as an AI commander COA. A failing COA
    // is repaired (one LLM prompt) or replaced by a clearly-labelled deterministic Staff-Safe commander
    // template. Engine FROZEN (movement physics / teleport guard / Green / White scoring / ranking / V2
    // state machine / Run flow unchanged).
    var COA_QUALITY_PASS = 70;
    function _normRole(r) {
        r = String(r || '').toLowerCase();
        if (/assault|attack|direct|advance|main/.test(r)) return 'assault';
        if (/support|fire|sbf|overwatch/.test(r)) return 'support';
        if (/screen|security|flank|block/.test(r)) return 'screen';
        if (/recon|observe|scout|isr/.test(r)) return 'recon';
        if (/reserve|follow|consolidat|reinforc/.test(r)) return 'reserve';
        return r || 'unknown';
    }
    function _coaAllActions(coa) { var out = []; arr(coa && coa.phases).forEach(function (ph) { arr(ph.actions).forEach(function (a) { if (a) out.push(a); }); }); return out; }
    function _atObjCenter(t, obj) { return !!(obj && t && Number.isFinite(+t.lat) && _kmBetween({ lat: +t.lat, lon: +t.lon }, { lat: obj.lat, lon: obj.lon }) < 0.6); }
    function _coaQualityGate(coa) {
        var obj = getObjective();
        var acts = _coaAllActions(coa);
        var phases = arr(coa && coa.phases);
        var moves = acts.filter(function (a) { return a.action_type !== 'HOLD_POSITION' && a.target && Number.isFinite(+a.target.lat); });
        var nMove = moves.length, nUnits = acts.length;
        var reasons = [], score = 100;
        function pen(p, why) { score -= p; reasons.push(why); }
        // (1) all move actions share one target
        if (nMove >= 2) {
            var f = moves[0].target;
            if (moves.every(function (m) { return Math.abs(+m.target.lat - +f.lat) < 1e-4 && Math.abs(+m.target.lon - +f.lon) < 1e-4; })) pen(40, 'all move actions share one target');
        }
        // (2) too many move actions at the exact objective center
        if (obj && nMove) {
            var cc = moves.filter(function (m) { return _atObjCenter(m.target, obj); }).length;
            if (cc / nMove > 0.6) pen(30, Math.round(100 * cc / nMove) + '% of moves target the objective center');
        }
        // (3) support/recon/screen elements targeting the center
        if (moves.some(function (m) { return /support|recon|screen/.test(_normRole(m.role)) && _atObjCenter(m.target, obj); })) pen(20, 'support/recon/screen elements target the objective center');
        // (3b) RMOOZ-COA-QUALITY-HARD-ENFORCEMENT-AE: move targets CONVERGE on one point (no role separation),
        // even if not exactly the objective center — the real "all units to the objective" failure mode.
        if (nMove >= 3 && _coaMaxPairwiseKm(moves) < 1.2) pen(30, 'move targets converge on one point (no spatial role separation)');
        // (4) role diversity (scaled to force size)
        var roleSet = {}; acts.forEach(function (a) { roleSet[_normRole(a.role)] = 1; });
        var distinctRoles = Object.keys(roleSet).length;
        if (nUnits >= 3 && distinctRoles < 2) pen(15, 'no role diversity (all units the same role)');
        // (5) a support / security / reserve element exists
        var hasSec = acts.some(function (a) { return /support|screen|reserve|recon/.test(_normRole(a.role)); });
        if (nUnits >= 3 && !hasSec) pen(15, 'no support / security / reserve element');
        // (6) single-phase "all move to objective"
        if (phases.length <= 1 && nMove && moves.filter(function (m) { return _atObjCenter(m.target, obj); }).length === nMove) pen(25, 'single-phase "all move to objective"');
        // (7) commander structure
        if (!coa.commander_intent) pen(8, 'no commander intent');
        if (!coa.main_effort) pen(8, 'no main effort');
        if (!coa.supporting_effort) pen(6, 'no supporting effort');
        if (!coa.red_assumption && !(arr(coa.expected_enemy_reaction).length)) pen(6, 'no Red reaction assumption');
        if (!coa.risk_mitigation) pen(6, 'no risk mitigation');
        score = Math.max(0, score);
        return { score: score, pass: score >= COA_QUALITY_PASS, reasons: reasons, move_count: nMove, unit_count: nUnits, distinct_roles: distinctRoles };
    }
    function _coaMaxPairwiseKm(moves) {
        var mx = 0;
        for (var a = 0; a < moves.length; a++) for (var b = a + 1; b < moves.length; b++) {
            var d = _kmBetween({ lat: +moves[a].target.lat, lon: +moves[a].target.lon }, { lat: +moves[b].target.lat, lon: +moves[b].target.lon });
            if (d > mx) mx = d;
        }
        return mx;
    }
    // RMOOZ-COA-QUALITY-HARD-ENFORCEMENT-AE: a HARD, executable-path check (independent of the scored gate)
    // — returns a blocking reason if the COA's MOVE actions would send units onto one point / the objective
    // center / a single shared target with no role spread. Used to gate Commit and Run.
    function _coaHardBlockReason(coa) {
        var obj = getObjective();
        var moves = _coaAllActions(coa).filter(function (a) { return a.action_type !== 'HOLD_POSITION' && a.target && Number.isFinite(+a.target.lat); });
        if (moves.length < 2) return null;   // 0-1 mover can't "all converge"
        var f = moves[0].target;
        if (moves.every(function (m) { return Math.abs(+m.target.lat - +f.lat) < 1e-4 && Math.abs(+m.target.lon - +f.lon) < 1e-4; })) return 'all move actions share one target';
        if (obj) { var cc = moves.filter(function (m) { return _atObjCenter(m.target, obj); }).length; if (cc / moves.length > 0.5) return Math.round(100 * cc / moves.length) + '% of moves target the exact objective center'; }
        if (moves.length >= 3 && _coaMaxPairwiseKm(moves) < 1.0) return 'all move targets converge on one point (no role separation)';
        var roles = {}; _coaAllActions(coa).forEach(function (a) { roles[_normRole(a.role)] = 1; });
        if (_coaAllActions(coa).length >= 3 && Object.keys(roles).length < 2) return 'no role diversity (every unit the same role)';
        return null;
    }
    // A compact role→(km-from-objective) target summary — the movement-proof line (selected==committed==executed).
    function _coaTargetSummary(coa) {
        var obj = getObjective();
        return _coaAllActions(coa).map(function (a) {
            var r = _normRole(a.role);
            if (a.action_type === 'HOLD_POSITION' || !a.target || !Number.isFinite(+a.target.lat)) return r + ':hold';
            var km = obj ? _kmBetween({ lat: +a.target.lat, lon: +a.target.lon }, { lat: obj.lat, lon: obj.lon }) : 0;
            return r + ':' + (Math.round(km * 10) / 10) + 'km';
        }).join(' · ');
    }
    // ════════════════════════════════════════════════════════════════════════
    // RMOOZ-STEP1-COA-PREPARATION-GATE-AE — unit taskability + Step-1 COA preparation gate.
    // A Step-1 ORBAT (source_required / needs_review / exact_unit_position:false / null coords / doctrine /
    // commander-review pending) is REVIEW-ONLY: such units must NEVER receive a movement/combat task. The
    // canonical resolver lives in the pure module window.RmoozTaskability (reused by the Scenario Control
    // Center rebuild). A strict built-in fallback guarantees the gate still blocks if that module failed to
    // load — a placeholder unit must NEVER move. This stays inside the locked AI/sim boundary (classify-only;
    // movement suppression + commit/run refusal are enforced here, never a journal write).
    // ════════════════════════════════════════════════════════════════════════
    var _BUILTIN_TASKABILITY = (function () {
        function fin(n) { return n != null && isFinite(Number(n)); }
        function classifyUnit(u, ctx) {
            ctx = ctx || {};
            var lat = u && u.lat, lon = u && u.lon;
            if ((lat == null || lon == null) && u && Array.isArray(u.coord) && u.coord.length >= 2) { lon = u.coord[0]; lat = u.coord[1]; }
            var noCoords = !(fin(lat) && fin(lon));
            var src = !!(u && (u.source_required === true || u.exact_unit_position === false || u.needs_review === true || u.review_only === true));
            var doc = (!!(u && u.doctrine_upload_required === true) || ctx.doctrine_required === true) && ctx.doctrine_ok !== true;
            var cmd = (!!(u && (u.commander_review_required === true || u.requires_commander_approval === true)) || ctx.commander_review_required === true) && ctx.commander_approved !== true;
            var taskable = !noCoords && !src && !doc && !cmd;
            return { id: (u && (u.id || u.uid || u.unit_uid)) ? String(u.id || u.uid || u.unit_uid) : null,
                taskable: taskable, reason: taskable ? 'taskable' : 'review required',
                review_status: taskable ? 'OK' : ((noCoords || src) ? 'SOURCE_REQUIRED' : doc ? 'DOCTRINE_REQUIRED' : 'COMMANDER_REVIEW_REQUIRED'),
                allowed_actions: taskable ? ['HOLD_POSITION'] : ['HOLD_POSITION', 'REVIEW_REQUIRED'],
                blocked_actions: taskable ? [] : ['MOVE', 'ATTACK'],
                blockers: { coords: noCoords, source: src, doctrine: doc, commander_review: cmd } };
        }
        return { classifyUnit: classifyUnit };
    })();
    function _taskabilityLib() {
        var w = W();
        if (w && w.RmoozTaskability && typeof w.RmoozTaskability.classifyUnit === 'function') return w.RmoozTaskability;
        return _BUILTIN_TASKABILITY;
    }
    // Brief/scenario-level doctrine + commander-review posture (best-effort). If a Step-1 brief declares
    // doctrine/commander review required and it is not satisfied, those flags propagate to every unit.
    // RMOOZ-SCC-STEP1-TRAINING-APPROVAL-AK: operator "Approve Draft for Training Simulation" flag. When true,
    // review-only units (source/doctrine/commander pending — NOT coords) become taskable in SIMULATION ONLY.
    // The Step-1 gate logic is UNCHANGED; it just honors this explicit, Evidence-recorded operator override.
    var _trainingApproved = false;
    function _taskabilityCtx() {
        var ob = (_payload && _payload.brief && _payload.brief.operational_brief) || (_payload && _payload.operational_brief) || {};
        var ta = ob.task_assembly || {};
        var doctrineOk = ta.doctrine_upload_required === false || !!ta.doctrine_application_policy || (Array.isArray(ta.doctrine_sources) && ta.doctrine_sources.length > 0);
        var cmdrOk = ta.commander_review_required === false || ta.commander_approved === true || ta.commander_review_complete === true;
        return { doctrine_required: ta.doctrine_upload_required === true, doctrine_ok: doctrineOk,
            commander_review_required: ta.commander_review_required === true, commander_approved: cmdrOk,
            training_approved: _trainingApproved === true };
    }
    function _isSimulationOnly() { return _trainingApproved === true && _step1PreparationReport().simulation_taskable > 0; }
    // Operator approves the loaded review-only draft for TRAINING SIMULATION (not source verification). Loud +
    // recorded: decision log (white) + event log; unit source flags are NOT mutated (Evidence still shows them).
    function _approveTrainingSimulation() {
        if (_trainingApproved) return;
        var rep = _step1PreparationReport();
        if (!rep.training_eligible) {
            try { _appendToEventLog('Training approval not applicable — no review-only units are training-eligible (remaining blocks need coordinates).'); } catch (_) {}
            return;
        }
        _trainingApproved = true;
        var after = _step1PreparationReport();
        try { _recordDecision({ role: 'white', action: 'step1_training_approval', called_llm: false, source: 'operator-training-approval',
            reason: 'operator approved review-only draft for TRAINING SIMULATION (source/commander overridden, NOT source-verified)',
            result_summary: 'SIMULATION ONLY · ' + after.simulation_taskable + ' review-only unit(s) now taskable in simulation; source flags unchanged (Evidence retains them)' }); } catch (_) {}
        try { _appendToEventLog('⚠ SIMULATION ONLY: operator approved ' + after.simulation_taskable + ' review-only unit(s) for TRAINING — not source-verified; source/commander flags remain recorded in Evidence.'); } catch (_) {}
        updatePanel();
    }
    function _clearTrainingApproval() {
        if (!_trainingApproved) return;
        _trainingApproved = false;
        try { _recordDecision({ role: 'white', action: 'step1_training_approval_cleared', called_llm: false, source: 'operator-training-approval', reason: 'operator cleared training-simulation approval', result_summary: 'review-only units are blocked again (back to Step-1 review)' }); } catch (_) {}
        try { _appendToEventLog('Training-simulation approval cleared — review-only units are blocked again (Step-1 review).'); } catch (_) {}
        updatePanel();
    }
    function _classifyUnit(u) { return _taskabilityLib().classifyUnit(u, _taskabilityCtx()); }
    // ALL raw loaded units (red+blue), carrying their Step-1 flags — used for classification + the report.
    function _rawScenarioUnits() {
        var w = W(); var sc = w && w.RmoozScenario && w.RmoozScenario.scenario;
        if (!sc) return [];
        return (Array.isArray(sc.red_units) ? sc.red_units : []).concat(Array.isArray(sc.blue_units_initial) ? sc.blue_units_initial : []);
    }
    function _rawUnitByUid(uid) {
        if (!uid) return null; uid = String(uid);
        var hit = _rawScenarioUnits().filter(function (u) { return u && String(u.id || u.uid || u.unit_uid || '') === uid; })[0];
        if (hit) return hit;
        var f = _findRealUnit(uid); return f ? f.unit : null;
    }
    function _isUnitTaskable(uid) {
        var u = _rawUnitByUid(uid);
        if (!u) return true;   // unknown unit → don't over-block; the move resolver already drops missing units
        return !!_classifyUnit(u).taskable;
    }
    function _taskableSideUnits(side) {
        side = String(side || 'BLUE').toUpperCase();
        return _scenarioSideUnits(side).filter(function (u) { return _isUnitTaskable(u.id); });
    }
    // The Step-1 COA Preparation Report — built locally from the single-source _classifyUnit so it reflects
    // the exact taskability the rest of the gate enforces (matches RmoozTaskability.prepareReport in shape).
    function _step1PreparationReport() {
        var raw = _rawScenarioUnits();
        var taskable_units = [], blocked_units = [], cnt = { s: 0, c: 0, d: 0, m: 0 };
        // RMOOZ-SCC-STEP1-TRAINING-APPROVAL-AK: simCount = taskable units that are simulation-only (training
        // approved, not source-verified); training_eligible = blocked units that would become taskable in
        // simulation (blocked by source/doctrine/commander, NOT by missing coordinates).
        var simCount = 0, training_eligible = 0;
        raw.forEach(function (u) {
            var t = _classifyUnit(u);
            var id = (u && (u.id || u.uid || u.unit_uid)) || null, side = (u && u.side) || null;
            if (t.taskable) { taskable_units.push({ id: id, side: side, simulation_only: !!t.simulation_only }); if (t.simulation_only) simCount++; return; }
            if (!t.blockers.coords) training_eligible++;
            blocked_units.push({ id: id, side: side, reason: t.reason, review_status: t.review_status, allowed_actions: t.allowed_actions });
            if (t.blockers.source) cnt.s++;
            if (t.blockers.coords) cnt.c++;
            if (t.blockers.doctrine) cnt.d++;
            if (t.blockers.commander_review) cnt.m++;
        });
        var taskable = taskable_units.length, blocked = blocked_units.length, loaded = raw.length;
        var executable = taskable >= 1;
        var trainingApproved = _trainingApproved === true;
        var message = !loaded ? 'No units loaded.'
            : !executable ? (training_eligible > 0
                ? 'COA unavailable — Step 1 data is review-only. Approve for Training Simulation to task ' + training_eligible + ' review-only unit(s) (SIMULATION ONLY — not source-verified), or complete source/commander review.'
                : 'COA unavailable — Step 1 data requires source/doctrine/commander review.')
            : (simCount > 0 ? (taskable + ' taskable (' + simCount + ' SIMULATION-ONLY, not source-verified)' + (blocked ? ', ' + blocked + ' still blocked' : '') + '.')
                : (blocked > 0 ? (taskable + ' taskable, ' + blocked + ' blocked pending source/doctrine review.') : null));
        return { units_loaded: loaded, taskable: taskable, blocked: blocked,
            blocked_by_missing_source: cnt.s, blocked_by_missing_coordinates: cnt.c,
            blocked_by_missing_doctrine: cnt.d, blocked_by_commander_review: cnt.m,
            taskable_units: taskable_units, blocked_units: blocked_units, executable: executable, message: message,
            // AK training-simulation fields
            training_approved: trainingApproved, training_eligible: training_eligible,
            simulation_taskable: simCount, simulation_only: trainingApproved && simCount > 0 };
    }
    var _lastStep1Report = null;
    // Run the gate, cache the report, and record White + event-log entries (only when something is blocked —
    // a fully-taskable operational scenario stays silent). Called on Generate / Commit / Run entry, NOT per tick.
    function _step1Gate(phaseTag) {
        var r = _step1PreparationReport();
        _lastStep1Report = r;
        if (r.blocked > 0 || !r.executable) {
            try { _recordDecision({ role: 'white', action: 'step1_coa_preparation_gate', called_llm: false, source: 'step1-gate' + (phaseTag ? (':' + phaseTag) : ''),
                reason: r.executable ? 'partial taskability — some Step-1 units blocked' : 'no taskable units — Step-1 review required',
                result_summary: r.taskable + ' taskable, ' + r.blocked + ' blocked (source ' + r.blocked_by_missing_source + ' / coords ' + r.blocked_by_missing_coordinates + ' / doctrine ' + r.blocked_by_missing_doctrine + ' / commander ' + r.blocked_by_commander_review + ')' }); } catch (_) {}
            try { _appendToEventLog('Step 1 Gate: ' + r.taskable + ' taskable, ' + r.blocked + ' blocked pending source/doctrine review.'); } catch (_) {}
        }
        return r;
    }
    // A COA tasks a non-taskable (Step-1 review-only) unit with movement/combat → returns that uid, else null.
    function _coaTasksBlockedUnit(coa) {
        var hit = null;
        _coaAllActions(coa).forEach(function (a) {
            if (hit || !a || a.action_type === 'HOLD_POSITION') return;   // HOLD is allowed for blocked units
            if (a.unit_uid && !_isUnitTaskable(a.unit_uid)) hit = String(a.unit_uid);
        });
        return hit;
    }
    var _coaCommitBlockedReason = null;
    // HARD enforcement before commit: if the selected COA is not executable-quality, replace it with the
    // deterministic Staff-Safe commander template (clearly labelled) so the EXECUTED COA is role-separated.
    function _enforceExecutableCoaQuality(coa) {
        var reason = _coaHardBlockReason(coa);
        if (!reason) return { coa: coa, replaced: false };
        // The template must command the SAME units the rejected COA commanded — derive units (and side)
        // from the COA's OWN actions first (resolved to real positions), not a guessed active side. (The
        // earlier bug: _coaActiveSide returned RED for a BLUE COA, so the template moved the wrong unit.)
        var side = String(coa.side || _coaActiveSide(coa) || _activeSide || 'BLUE').toUpperCase();
        var seen = {}, units = [];
        _coaAllActions(coa).forEach(function (a) {
            if (!a.unit_uid || seen[a.unit_uid]) return;
            var ff = _findRealUnit(a.unit_uid);
            if (ff && ff.unit) { seen[a.unit_uid] = 1; units.push({ id: a.unit_uid, uid: a.unit_uid, lat: ff.unit.lat, lon: ff.unit.lon, side: String(ff.unit.side || side).toUpperCase() }); }
        });
        if (!units.length) units = _taskableSideUnits(side);   // fallback: the side's TASKABLE units (AE)
        var tmpl = _staffSafeCommanderCoa(side, units, getObjective(), 'SS-CMD-1');
        if (!tmpl) return { coa: coa, replaced: false, reason: reason, blocked: true };   // no template possible → caller blocks
        tmpl._quality = _coaQualityGate(tmpl);
        return { coa: tmpl, replaced: true, reason: reason };
    }
    // A deterministic, role-separated, multi-phase commander COA (no exact-center stacking). Used as the
    // quality-gate fallback AND as the auto-director's Blue order so scenario COAs are commander-quality.
    function _reconPoint(obj, i, baseDeg) { return _ringPos(obj, 7, i, (baseDeg || BLUE_BASE_DEG) - 90); }
    function _staffSafeCommanderCoa(side, units, obj, tag) {
        side = String(side || 'BLUE').toUpperCase();
        var u = arr(units).filter(function (x) { return x && (x.id || x.uid || x.unit_uid); });
        if (!u.length || !obj) return null;
        var isRed = (side === 'RED');
        // RMOOZ-SIDE-ROLE-A: role assignment and target positions are side-specific.
        // RED (attacker from NE): recon→probe NE, support→fire support ENE, screen→flank SE, assault→assault NE, reserve→rear SW.
        // BLUE (defender facing NE): recon→observe NE, screen→screen line NE, intercept→block axis NE, defend→perimeter NNE, reserve→rear SW.
        // COA_ACTION_BUDGET_AND_ROLE_GATE: task only a realistic subset; non-selected units hold.
        var _ssSel = _selectMovers(u, obj, { fraction: 0.15, min: 5, max: 12 });
        var _moverIds = {}; _ssSel.movers.forEach(function (mu) { _moverIds[String(mu.id)] = 1; });
        var _nMovers = _ssSel.movers.length, _mi = -1;
        var assigns = u.map(function (unit, i) {
            var uid = String(unit.id || unit.uid || unit.unit_uid);
            if (!_moverIds[uid]) return { uid: uid, role: 'hold', i: i };
            _mi++; var m = _mi;
            var role, n = _nMovers;
            if (isRed) {
                if (n >= 5) role = (m === 0 ? 'recon' : m === 1 ? 'support' : m === 2 ? 'screen' : (m === n - 1 ? 'reserve' : 'assault'));
                else if (n === 4) role = (m === 0 ? 'support' : m === 1 ? 'screen' : m === 2 ? 'assault' : 'reserve');
                else if (n === 3) role = (m === 0 ? 'support' : m === 1 ? 'screen' : 'assault');
                else if (n === 2) role = (m === 0 ? 'support' : 'assault');
                else role = 'assault';
            } else {
                if (n >= 5) role = (m === 0 ? 'recon' : m === 1 ? 'screen' : m === 2 ? 'intercept' : (m === n - 1 ? 'reserve' : 'defend'));
                else if (n === 4) role = (m === 0 ? 'screen' : m === 1 ? 'intercept' : m === 2 ? 'defend' : 'reserve');
                else if (n === 3) role = (m === 0 ? 'screen' : m === 1 ? 'defend' : 'reserve');
                else if (n === 2) role = (m === 0 ? 'screen' : 'defend');
                else role = 'defend';
            }
            return { uid: uid, role: role, i: i };
        });
        // RMOOZ-MOVEMENT-INTELLIGENCE-A: behavior-engine target positions (threat-axis aware).
        // Falls back to ring placement when engine not loaded (staff_safe_no_ai).
        var _ROLE_BEHAVIOR = {
            assault: 'approach', support: 'support', screen: 'screen', recon: 'observe', reserve: 'reserve',
            intercept: 'intercept', defend: 'defend', reinforce: 'support',
        };
        // Waypoint policy per role — matches the behavior intent.
        var _ROLE_WP = {
            assault: 'direct_step', support: 'support_position', screen: 'screen_line',
            recon: 'direct_step', reserve: 'hold_area',
            intercept: 'intercept_axis', defend: 'hold_area', reinforce: 'support_position',
        };
        // tgt() returns { lat, lon, _fallback_formation, reason } — _fallback_formation=true when the
        // movement engine was unavailable and a ring position was used instead (staff_safe_no_ai).
        function tgt(role, i) {
            var ME2 = W() && W().RmoozMovementEngine;
            if (ME2 && ME2.buildWaypointsForAssignment) {
                var enemySide2 = isRed ? 'BLUE' : 'RED';
                var enemyUnits2 = _scenarioSideUnits ? _scenarioSideUnits(enemySide2) : [];
                var unit2 = u[i] || u[0] || {};
                var wps2 = ME2.buildWaypointsForAssignment(unit2, { behavior: _ROLE_BEHAVIOR[role] || role }, obj, enemyUnits2, i);
                if (wps2 && wps2[0] && Number.isFinite(wps2[0].lat) && Number.isFinite(wps2[0].lon))
                    return { lat: wps2[0].lat, lon: wps2[0].lon, _fallback_formation: false };
            }
            // Ring fallback — movement engine unavailable or returned nothing.
            // Marked fallback_formation:true so callers can label the source honestly.
            var rp;
            if (isRed) {
                if (role === 'recon')        rp = _ringPos(obj, 7,               i, RED_BASE_DEG);
                else if (role === 'support') rp = _ringPos(obj, RING_KM.support, i, RED_BASE_DEG + 30);
                else if (role === 'screen')  rp = _ringPos(obj, RING_KM.screen,  i, RED_BASE_DEG + 90);
                else if (role === 'reserve') rp = _ringPos(obj, 10,              i, RED_BASE_DEG + 180);
                else                         rp = _ringPos(obj, RING_KM.assault, i, RED_BASE_DEG);
            } else {
                if (role === 'recon')            rp = _ringPos(obj, 6,               i, RED_BASE_DEG);
                else if (role === 'screen')      rp = _screenRing(obj, i);
                else if (role === 'intercept')   rp = _blockingRing(obj, i);
                else if (role === 'reserve')     rp = _reserveRing(obj, i);
                else if (role === 'reinforce')   rp = _supportRing(obj, i);
                else                             rp = _ringPos(obj, RING_KM.assault, i, RED_BASE_DEG - 15);
            }
            return { lat: rp.lat, lon: rp.lon, _fallback_formation: true, reason: 'movement engine unavailable' };
        }
        // phaseActs() — every MOVE action carries full behavior intent (behavior/domain/movement_mode/
        // waypoint_policy/_source) so _resolvePhaseMoves always takes the behavior path (Layer 2).
        function phaseActs(movers) {
            return assigns.map(function (a) {
                if (movers.indexOf(a.role) === -1) {
                    return { unit_uid: a.uid, action_type: 'HOLD_POSITION', role: a.role,
                             behavior: 'hold', domain: 'ground', movement_mode: 'static',
                             waypoint_policy: 'hold_area', _source: 'staff_safe_movement_engine' };
                }
                var beh = _ROLE_BEHAVIOR[a.role] || 'approach';
                var wp  = _ROLE_WP[a.role]       || 'direct_step';
                var ME3 = W() && W().RmoozMovementEngine;
                var unitR = u[a.i] || u[0] || {};
                var dom = ME3 && ME3.classifyUnitDomain ? ME3.classifyUnitDomain(unitR) : 'ground';
                var mm  = (dom === 'air' ? 'air' : dom === 'naval' ? 'naval' : 'ground');
                var t   = tgt(a.role, a.i);
                var src = (t && t._fallback_formation) ? 'staff_safe_no_ai' : 'staff_safe_movement_engine';
                return { unit_uid: a.uid, action_type: 'MOVE', role: a.role,
                         behavior: beh, domain: dom, movement_mode: mm, waypoint_policy: wp,
                         target: t, _source: src,
                         fallback_formation: !!(t && t._fallback_formation) };
            });
        }
        var ids = function (rx) { return assigns.filter(function (a) { return rx.test(a.role); }).map(function (a) { return a.uid; }); };
        if (isRed) {
            var assaultIds = ids(/assault/), supIds = ids(/support|screen|recon/), resIds = ids(/reserve/), scrIds = ids(/screen/);
            try { _appendToEventLog('RED ATTACK COA generated against Objective X (' + (tag || 'SS-ATK-1') + ').'); } catch (_) {}
            return {
                plan_id: tag || 'SS-ATK-1', title: 'Staff-Safe RED attack template', side: 'RED',
                recommended: true, risk: 'medium', confidence: 'medium', source_type: 'staff_safe_commander_template',
                commander_intent: 'Attack and seize Objective X: probe forward, support-by-fire suppresses, assault element seizes, flank screen covers the approach.',
                main_effort: 'Assault element (' + (assaultIds.join(', ') || '—') + ') advances to the assault position NE of Objective X.',
                supporting_effort: 'Support-by-fire / recon (' + (supIds.join(', ') || '—') + ') overwatches the assault.',
                reserve_or_follow_on: resIds.join(', ') || 'none (small force)',
                security_or_screen: scrIds.join(', ') || 'none',
                blue_assumption: 'BLUE defends Objective X and may counterattack from the SW.',
                risk_mitigation: 'Support-by-fire overwatch + screened NE flank; reserve covers BLUE counterattack.',
                control_measures: { assault_position: true, support_by_fire: true, screen_line: true, objective_radius_km: OBJ_CONTROL_KM },
                success_criteria: 'RED holds Objective X radius; BLUE is unable to contest.',
                expected_enemy_reaction: ['BLUE defends from the SW', 'BLUE counterattacks from the flank'],
                rationale: ['RED attack template — phased supported assault from NE; recon probes, support-by-fire overwatches, assault seizes.'],
                phases: [
                    { name: 'Phase 1 — Recon & establish fire support', actions: phaseActs(['recon', 'support', 'screen']) },
                    { name: 'Phase 2 — Assault toward Objective X',     actions: phaseActs(['assault']) },
                    { name: 'Phase 3 — Consolidate & hold',             actions: phaseActs(['reserve']) },
                ],
            };
        } else {
            var defendIds = ids(/defend/), interceptIds = ids(/intercept/), screenIds = ids(/screen/), reconIds = ids(/recon/), resIds2 = ids(/reserve/);
            try { _appendToEventLog('BLUE DEFENSE COA generated to defend Objective X (' + (tag || 'SS-DEF-1') + ').'); } catch (_) {}
            return {
                plan_id: tag || 'SS-DEF-1', title: 'Staff-Safe BLUE defense template', side: 'BLUE',
                recommended: true, risk: 'low', confidence: 'medium', source_type: 'staff_safe_commander_template',
                commander_intent: 'Defend Objective X: screen the RED approach axis, intercept RED before the objective, hold the defensive line, keep a reserve.',
                main_effort: 'Defend/intercept element (' + (defendIds.concat(interceptIds).join(', ') || '—') + ') holds Objective X perimeter.',
                supporting_effort: 'Screen / observe (' + (screenIds.concat(reconIds).join(', ') || '—') + ') delays RED on the approach axis.',
                reserve_or_follow_on: resIds2.join(', ') || 'none (small force)',
                security_or_screen: screenIds.concat(reconIds).join(', ') || 'none',
                red_assumption: 'RED attacks toward Objective X from the NE sector.',
                risk_mitigation: 'Layered screen + intercept delays RED; reserve covers RED breakthrough.',
                control_measures: { screen_line: true, intercept_axis: true, defensive_line: true, objective_radius_km: OBJ_CONTROL_KM },
                success_criteria: 'BLUE holds Objective X; RED is unable to seize.',
                expected_enemy_reaction: ['RED assaults from NE', 'RED flanks the screen line'],
                rationale: ['BLUE defense template — screen delays RED; intercept blocks axis; defend holds the perimeter.'],
                phases: [
                    { name: 'Phase 1 — Screen & observe the RED approach', actions: phaseActs(['recon', 'screen']) },
                    { name: 'Phase 2 — Intercept & defend Objective X',    actions: phaseActs(['intercept', 'defend']) },
                    { name: 'Phase 3 — Hold & reinforce',                  actions: phaseActs(['reserve', 'reinforce']) },
                ],
            };
        }
    }
    function _planFallbackUnits(plan) {
        var side = String((arr(plan && plan.coas)[0] && arr(plan.coas)[0].side) || _activeSide || 'BLUE').toUpperCase();
        var u = _taskableSideUnits(side);   // AE: template fills from taskable units only
        if (u.length) return u;
        // derive from the plan's own action uids (resolve real units)
        var seen = {}, out = [];
        _coaAllActions(arr(plan && plan.coas)[0]).forEach(function (a) {
            var f = a && a.unit_uid ? _findRealUnit(a.unit_uid) : null;
            if (f && f.unit && !seen[a.unit_uid]) { seen[a.unit_uid] = 1; out.push({ id: a.unit_uid, lat: f.unit.lat, lon: f.unit.lon, side: side }); }
        });
        return out;
    }
    function _recordQualityGate(verdict, score, reasons) {
        try { _recordDecision({ role: 'performance', action: 'coa_quality_gate', called_llm: false, source: 'coa-quality-gate',
            reason: verdict, result_summary: verdict + ' · score ' + score + (arr(reasons).length ? ' · ' + reasons.slice(0, 3).join('; ') : '') }); } catch (_) {}
        try { _appendToEventLog('COA quality gate: ' + esc(verdict) + ' (score ' + score + ')' + (verdict === 'fallback' ? ' — using Staff-Safe commander template' : '') + '.'); } catch (_) {}
    }
    // Evaluate a plan's COAs, attach _quality to each, set plan._coa_quality. Deterministic; no repair here.
    function _gradeCoaPlan(plan) {
        var coas = arr(plan && plan.coas);
        if (!coas.length) return { verdict: 'failed', score: 0, reasons: ['no COAs'] };
        coas.forEach(function (c) { c._quality = _coaQualityGate(c); });
        var best = coas[_pickRecommendedIdx(plan)] || coas[0];
        return best._quality;
    }
    // Replace a low-quality plan with the deterministic Staff-Safe commander template (clearly labelled).
    function _coaFallbackToTemplate(plan, q) {
        var units = _planFallbackUnits(plan);
        var side = String((arr(plan.coas)[0] && arr(plan.coas)[0].side) || _activeSide || 'BLUE').toUpperCase();
        var tmpl = _staffSafeCommanderCoa(side, units, getObjective(), 'SS-CMD-1');
        if (!tmpl) { plan._coa_quality = { verdict: 'failed', score: q.score, reasons: q.reasons }; _recordQualityGate('failed', q.score, q.reasons); return plan._coa_quality; }
        tmpl._quality = _coaQualityGate(tmpl);
        plan.coas = [tmpl];
        plan.plan_source = 'staff_safe_commander_template';
        plan.llm_status = 'llm_failed_quality_gate';
        plan._ranking_recommended_idx = 0; _coaSelectedIdx = 0;
        plan._coa_quality = { verdict: 'fallback', score: tmpl._quality.score, reasons: q.reasons };
        _recordQualityGate('fallback', tmpl._quality.score, q.reasons);
        return plan._coa_quality;
    }
    // Manual-generate gate flow: grade → pass | (one LLM repair) | deterministic fallback.
    function _runCoaQualityGateFlow(genT0) {
        if (!_coaPlan || !_coaPlan.ok || !arr(_coaPlan.coas).length) return;
        var q = _gradeCoaPlan(_coaPlan);
        if (q.pass) {
            _coaPlan._coa_quality = { verdict: _coaRepairAttempted ? 'repaired' : 'pass', score: q.score, reasons: q.reasons };
            _recordQualityGate(_coaPlan._coa_quality.verdict, q.score, q.reasons);
            updatePanel(); return;
        }
        var labelledStaffSafe = String(_coaPlan.planning_mode || '').toLowerCase() === 'staff_safe' || (_coaPlan.source && /staff_safe/.test(String(_coaPlan.source.type || '')));
        var canRepair = _isRealLlmPlan(_coaPlan) && !_coaRepairAttempted && !labelledStaffSafe;
        var ready = false; try { ready = _freeFightAiReady().ok; } catch (_) {}
        if (canRepair && ready) { _coaRepairAttempted = true; _repairCoaPlanOnce(q.reasons, genT0); }
        else {
            // RMOOZ-AI-COA-HONESTY-A: on the commander AI path, never silently replace a failed AI
            // plan with a Staff-Safe template — that would display a deterministic plan as if AI
            // generated it. Show the quality gate failure honestly; operator can still click Staff-Safe.
            if (_planningMode !== 'staff_safe' && _coaPlan && _coaPlan._requestedVia === 'manual_generate') {
                _coaPlan._quality_gate_failed = true;
                _coaPlan._quality_gate_reasons = q.reasons;
                _coaPlan._quality_gate_message = 'AI COA failed quality requirements — ' + arr(q.reasons).slice(0, 2).join('; ') + '. Retry or use Staff-Safe for a deterministic plan.';
                _coaPlan.ok = false;
                updatePanel();
            } else {
                _coaFallbackToTemplate(_coaPlan, q); updatePanel();
            }
        }
    }
    // One LLM repair attempt: re-request the planner with an explicit repair instruction, then re-grade.
    function _repairCoaPlanOnce(reasons, genT0) {
        var w = W(); if (!w || typeof w.fetch !== 'function') { _coaFallbackToTemplate(_coaPlan, _gradeCoaPlan(_coaPlan)); updatePanel(); return; }
        try { _recordDecision({ role: 'blue', action: 'coa_repair_prompt', called_llm: true, source: 'coa-quality-gate',
            provider: (_routeHealth && _routeHealth.provider) || 'ollama', model: (_routeHealth && _routeHealth.model) || null,
            reason: 'COA rejected by quality gate', result_summary: 'repair requested: ' + arr(reasons).slice(0, 3).join('; ') }); } catch (_) {}
        try { _appendToEventLog('COA repair prompt sent to the AI (rejected: ' + esc(arr(reasons).slice(0, 2).join('; ')) + ').'); } catch (_) {}
        var body = _buildAiRequestBody();
        body.opts.useLlm = true; if (body.opts.ai_depth === 'fast') body.opts.ai_depth = 'normal';
        body.opts.repair = true; body.opts.repair_reasons = arr(reasons);
        body.opts.repair_hint = 'Your COA was rejected because: ' + arr(reasons).join('; ') + '. Return a commander-quality COA with role-separated positions (assault / support-by-fire / screen / reserve / recon), a main and supporting effort, a Red reaction assumption, and risk mitigation. Do not send all units to the exact objective center.';
        _coaLoading = true; updatePanel();
        _fetchJsonSafe('/api/wargame-sim/free-fight/plan-coas', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ units: body.units, objectives: body.objectives, context: { commander_mode: body.opts.commander_mode, ai_depth: body.opts.ai_depth, repair: true }, opts: body.opts }),
        }).then(function (plan) {
            if (plan && plan.ok && arr(plan.coas).length && !_isRouteUnavailable(plan)) { _coaPlan = plan; _coaPlan._requestedVia = 'manual_generate'; try { _coaSelectedIdx = _pickRecommendedIdx(_coaPlan); } catch (_) {} }
            _coaLoading = false; updatePanel();
            try { _recordPlanDecision(_coaPlan, _nowMs() - genT0); } catch (_) {}
            _runCoaQualityGateFlow(genT0);   // _coaRepairAttempted is set → no second repair → pass or fallback
        }).catch(function (e) {
            _coaLoading = false;
            // RMOOZ-AI-COA-HONESTY-A: repair fetch failed — show honest AI failure on commander path.
            if (_planningMode !== 'staff_safe' && _coaPlan && _coaPlan._requestedVia === 'manual_generate') {
                _coaPlan._quality_gate_failed = true;
                _coaPlan._quality_gate_message = 'AI repair request failed: ' + ((e && e.message) || 'network error') + '. Use Staff-Safe for a deterministic plan.';
                _coaPlan.ok = false;
                updatePanel();
            } else {
                _coaFallbackToTemplate(_coaPlan, _gradeCoaPlan(_coaPlan)); updatePanel();
            }
        });
    }
    // RMOOZ-AI-COA-BEHAVIOR-PATH-REQUIRED-A: domain/movement_mode consistency fix for a single action.
    // Corrects movement_mode when it contradicts domain, and fixes aircraft that must never direct_step
    // to an objective (they patrol/orbit instead).
    function _validateAndFixDomain(act) {
        if (!act || !act.domain) return;
        if (act.domain === 'air') {
            if (act.movement_mode !== 'air') { act.movement_mode = 'air'; act._domain_validated = true; }
            if (act.waypoint_policy === 'direct_step' || act.waypoint_policy === 'intercept_axis') {
                act.waypoint_policy = (act.behavior === 'intercept') ? 'orbit' : 'patrol_loop';
                act._domain_validated = true;
            }
        } else if (act.domain === 'naval') {
            if (act.movement_mode === 'ground') { act.movement_mode = 'naval'; act._domain_validated = true; }
        } else if (act.domain === 'ground') {
            if (act.movement_mode === 'naval' || act.movement_mode === 'air') { act.movement_mode = 'ground'; act._domain_validated = true; }
        }
        if ((act.domain === 'static' || act.domain === 'sensor' || act.domain === 'air_defense') &&
            (act.behavior === 'approach' || act.behavior === 'intercept')) {
            act.behavior = (act.domain === 'air_defense') ? 'defend' : 'support';
            act.waypoint_policy = 'hold_area';
            act._domain_validated = true;
        }
    }

    // RMOOZ-AI-COA-BEHAVIOR-PATH-REQUIRED-A: post-plan normalizer for real AI COAs.
    // Runs after /plan-coas response, before quality gate. Ensures every MOVE action carries
    // behavior intent so _resolvePhaseMoves always takes the behavior path (Layer 2).
    // Repairs missing fields in-place; marks repaired actions _behavior_repaired + _source.
    function _normalizeBehaviorIntentForPlan(plan) {
        if (!plan || !plan.ok) return;
        var ME = W() && W().RmoozMovementEngine;
        var ROLE_BEH = {
            assault: 'approach', support: 'support', screen: 'screen', recon: 'observe',
            reserve: 'reserve', intercept: 'intercept', defend: 'defend', reinforce: 'support', hold: 'hold',
        };
        var ROLE_WP = {
            assault: 'direct_step', support: 'support_position', screen: 'screen_line',
            recon: 'direct_step', reserve: 'hold_area', intercept: 'intercept_axis',
            defend: 'hold_area', reinforce: 'support_position', hold: 'hold_area',
        };
        var BEH_WP = {
            approach: 'direct_step', support: 'support_position', screen: 'screen_line',
            observe: 'direct_step', reserve: 'hold_area', intercept: 'intercept_axis',
            defend: 'hold_area', patrol: 'patrol_loop', orbit: 'orbit', hold: 'hold_area',
        };
        var repairedCount = 0;
        arr(plan.coas).forEach(function (coa) {
            arr(coa && coa.phases).forEach(function (phase) {
                arr(phase && phase.actions).forEach(function (act) {
                    if (!act) return;
                    var isHold = (act.action_type === 'HOLD_POSITION' || act.behavior === 'hold');
                    if (isHold) {
                        if (!act.behavior)        act.behavior        = 'hold';
                        if (!act.domain)          act.domain          = 'ground';
                        if (!act.movement_mode)   act.movement_mode   = 'static';
                        if (!act.waypoint_policy) act.waypoint_policy = 'hold_area';
                        return;
                    }
                    var needsRepair = !act.behavior || !act.domain || !act.movement_mode || !act.waypoint_policy;
                    if (!needsRepair) { _validateAndFixDomain(act); return; }

                    // Infer domain from the real unit (movement engine) or fall back to ground
                    var found = _findRealUnit(act.unit_uid);
                    var unit = found ? found.unit : null;
                    var dom = (ME && unit) ? ME.classifyUnitDomain(unit) : 'ground';

                    // Infer behavior from role, then action_type
                    var roleKey = String(act.role || '').toLowerCase();
                    var beh = ROLE_BEH[roleKey] || null;
                    if (!beh) {
                        var at = String(act.action_type || '').toLowerCase();
                        if (at.indexOf('recon') >= 0)         beh = 'observe';
                        else if (at.indexOf('screen') >= 0)   beh = 'screen';
                        else if (at.indexOf('support') >= 0)  beh = 'support';
                        else if (at.indexOf('hold') >= 0)     beh = 'hold';
                        else                                   beh = 'approach';
                    }
                    if (dom === 'air' && beh === 'approach') beh = 'orbit';

                    // Infer waypoint_policy from behavior/role
                    var wp = BEH_WP[beh] || ROLE_WP[roleKey] || 'direct_step';
                    if (dom === 'air' && (wp === 'direct_step' || wp === 'intercept_axis'))
                        wp = (beh === 'intercept') ? 'orbit' : 'patrol_loop';

                    var mm = (dom === 'air') ? 'air' : (dom === 'naval') ? 'naval' : 'ground';

                    if (!act.behavior)        act.behavior        = beh;
                    if (!act.domain)          act.domain          = dom;
                    if (!act.movement_mode)   act.movement_mode   = mm;
                    if (!act.waypoint_policy) act.waypoint_policy = wp;

                    _validateAndFixDomain(act);
                    act._behavior_repaired = true;
                    act._source = 'degraded_behavior_repaired';
                    repairedCount++;
                });
            });
        });
        if (repairedCount > 0) {
            plan._behavior_repaired = true;
            plan._behavior_repaired_count = repairedCount;
            if (!plan.llm_status || plan.llm_status === 'ok') plan.llm_status = 'behavior_intent_repaired';
        }
        return { repaired: repairedCount };
    }

    function _generateCoaPlan() {
        var w = W();
        if (!w || typeof w.fetch !== 'function') return;
        _clearAiLiteStagedGroups(); // RMOOZ-DUAL-MAP-LAYER-CONFLICT-A: clear AI-lite staged overlay before any COA operation
        _coaRepairAttempted = false;   // AD: fresh generate → repair budget reset
        _coaLoading = true; _coaPlan = null; _coaApplied = false; _coaMovedUnits = []; _mcpPromptExpanded = false;
        _routeUnavailableMsg = null;
        _step1HeldUids = {};           // AE: fresh generate → re-log any suppressed Step-1 units
        // RMOOZ-STEP1-COA-PREPARATION-GATE-AE: classify units BEFORE any AI/deterministic COA generation. If
        // NO unit is taskable (all are Step-1 placeholders), produce NO movement COA — an honest "review
        // required" block, no /plan-coas call, no fake all-to-objective order.
        var _s1 = _step1Gate('generate');
        if (!_s1.executable) {
            _coaPlan = { ok: false, _step1_blocked: true, _step1_report: _s1, _error: _s1.message, _requestedVia: 'manual_generate' };
            _coaLoading = false; _stopCoaLoadingTicker(); updatePanel();
            return;
        }
        // RMOOZ-AI-COA-HONESTY-A: pre-flight AI readiness check for the commander (AI) path.
        // If AI is not ready (gate off, no model, provider blocked, fast depth), block NOW —
        // before any API call — so we never receive a deterministic plan dressed as AI output.
        // Staff-Safe explicitly skips this check (it is deterministic by design).
        if (_planningMode !== 'staff_safe') {
            // The AI Commander generate path below forces Normal when the visible depth is Fast,
            // because Fast is reserved for deterministic/no-LLM operation. Do that before the
            // readiness check so the preflight does not block the very upgrade it is about to make.
            if (_aiDepth === 'fast') {
                _aiDepth = 'normal';
                try { _appendToEventLog('AI DEPTH: Normal — AI Commander requires the LLM path; Fast is Staff-Safe only.'); } catch (_) {}
            }
            var _aiCheck = _freeFightAiReady();
            if (!_aiCheck.ok) {
                if (_aiCheck.code === 'health_pending') {
                    _coaLoading = false; _stopCoaLoadingTicker(); updatePanel();
                    return;
                }
                _coaPlan = { ok: false, _ai_precheck_blocked: true, _requestedVia: 'manual_generate',
                    _error: 'AI COA not generated — ' + (_aiCheck.reason || _aiCheck.code || 'AI not ready') +
                        '. ' + (_aiCheck.msg || 'Use Staff-Safe (deterministic) if you need a plan now.') };
                _coaLoading = false; _stopCoaLoadingTicker(); updatePanel();
                try { _recordPlanDecision(_coaPlan, 0); } catch (_x) {}
                return;
            }
        }
        _coaLoadingStart = (function () { try { return Date.now(); } catch (_) { return 0; } })();
        _startCoaLoadingTicker();   // RMOOZ-AI-COMMANDER-REPAIR-LOOP-A: live elapsed timer while the model thinks
        updatePanel();
        var body = _buildAiRequestBody();
        // RMOOZ-STEP1-COA-PREPARATION-GATE-AE: only TASKABLE units are sent to the planner — blocked Step-1
        // placeholders are held back so the AI/deterministic builder cannot task them with movement.
        body.units = arr(body.units).filter(function (u) { return _isUnitTaskable(u.id); });
        // RMOOZ-AI-FREE-FIGHT-FORCE-POOL-PRESENT-A: the planner may ONLY task units that EXIST in the active
        // loaded scenario (window.RmoozScenario.scenario) — _findRealUnit validates each COA action against
        // it, so an absent (brief-only / unplaced) unit blocks execution with "unit missing". Lock the force
        // pool to the present set and keep allowed_unit_ids in lockstep. force_pool_count then reports the
        // present taskable count, never brief-only units.
        (function () {
            var sc2 = w && w.RmoozScenario && w.RmoozScenario.scenario; if (!sc2) return;
            var present = {};
            (Array.isArray(sc2.red_units) ? sc2.red_units : []).concat(Array.isArray(sc2.blue_units_initial) ? sc2.blue_units_initial : [])
                .forEach(function (u) { var id = u && (u.id || u.uid || u.unit_uid); if (id) present[String(id)] = true; });
            var before = arr(body.units).length;
            body.units = arr(body.units).filter(function (u) { return present[String(u.id || u.uid)]; });
            if (body.opts) body.opts.allowed_unit_ids = body.units.map(function (u) { return u.id; });
            if (body.units.length !== before) { try { _appendToEventLog('Force pool locked to ' + body.units.length + ' present scenario unit(s) (dropped ' + (before - body.units.length) + ' absent/brief-only).'); } catch (_) {} }
        })();
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
            // RMOOZ-SCC-COA-COMMANDER-QUALITY-AI: capture the raw LLM output so the SCC Evidence panel can
            // show parse/schema/repair/fallback honesty (incl. the failing raw output on invalid_json).
            body.opts.capture_raw_llm = true;
        }
        // RMOOZ-MISSION-ROLE-CONTRACT-A: derive and cache the mission role contract before
        // sending the COA request so active_side + defending_side are data-driven, not guessed.
        _missionRoleContract = _buildMissionRoleContract();
        try {
            _recordDecision({ role: 'white', action: 'MISSION_ROLE_RESOLVED', called_llm: false,
                source: 'mission-role-contract',
                reason: 'derived from ' + _missionRoleContract.objective_source + ' (confidence: ' + _missionRoleContract.confidence + ')',
                result_summary: 'attacker=' + _missionRoleContract.attacker_side +
                    ' / defender=' + _missionRoleContract.defender_side +
                    ' / objective_owner=' + _missionRoleContract.objective_owner_side +
                    ' / initial_actor=' + _missionRoleContract.initial_actor +
                    ' / mission_type=' + _missionRoleContract.mission_type });
        } catch (_) {}
        try {
            _appendToEventLog('MISSION_ROLE_RESOLVED: attacker=' + _missionRoleContract.attacker_side +
                ' / defender=' + _missionRoleContract.defender_side +
                ' / objective_owner=' + _missionRoleContract.objective_owner_side +
                ' / initial_actor=' + _missionRoleContract.initial_actor +
                ' / mission_type=' + _missionRoleContract.mission_type +
                ' / source=' + _missionRoleContract.objective_source);
        } catch (_) {}
        var _genT0 = _nowMs();   // RMOOZ-AI-SCHEDULER-DECISION-LOG-S: measure the commander call duration
        _fetchJsonSafe('/api/wargame-sim/free-fight/plan-coas', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ units: body.units, objectives: body.objectives,
                context: {
                    commander_mode: body.opts.commander_mode,
                    ai_depth: body.opts.ai_depth,
                    active_side: _missionRoleContract.active_coa_side,
                    defending_side: _missionRoleContract.defender_side,
                    mission_role_contract: _missionRoleContract
                },
                opts: body.opts }),
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
                // RMOOZ-STEP1-...-AE: carry the prep report so the review panel can list units held for review.
                if (_coaPlan && typeof _coaPlan === 'object') _coaPlan._step1_report = _lastStep1Report;
                // RMOOZ-SCC-STEP1-TRAINING-APPROVAL-AK: mark a plan built on training-approved review-only units.
                if (_coaPlan && typeof _coaPlan === 'object') _coaPlan._simulation_only = _isSimulationOnly();
                // RMOOZ-AI-COA-HONESTY-A: defense-in-depth — if the commander AI path actually called
                // the LLM and then fell back, block it instead of dressing it as an AI plan. A deterministic
                // no-LLM planner response is still allowed through so the SCC can label it honestly.
                if (_planningMode !== 'staff_safe' && _coaPlan && _coaPlan.ok === true &&
                        _coaPlan.plan_source && _coaPlan.plan_source !== 'llm' &&
                        (_coaPlan.llm_called === true || _coaPlan.fallback_reason || /fallback/.test(String(_coaPlan.llm_status || '')))) {
                    _coaPlan = { ok: false, _ai_fallback_blocked: true, _requestedVia: 'manual_generate',
                        llm_called: _coaPlan.llm_called, llm_status: _coaPlan.llm_status,
                        fallback_reason: _coaPlan.fallback_reason,
                        _error: 'AI COA not generated — ' + (_coaPlan.fallback_message ||
                            'AI was called but a deterministic fallback was applied.') +
                            ' Use Staff-Safe (deterministic) if you need a plan now.' };
                }
            }
            // RMOOZ-FREE-FIGHT-SIMPLE-OPERATOR-UX-O: auto-select the recommended COA so the simple flow
            // can offer "Use Recommended Plan" by default.
            if (_coaPlan && _coaPlan.ok && arr(_coaPlan.coas).length) { try { _coaSelectedIdx = _pickRecommendedIdx(_coaPlan); } catch (_) {} }
            // RMOOZ-AI-COA-BEHAVIOR-PATH-REQUIRED-A: repair AI COAs that omit behavior intent fields so
            // _resolvePhaseMoves always takes Layer 2. Only runs on real LLM plans (plan_source=llm).
            if (_coaPlan && _coaPlan.ok && _coaPlan.plan_source === 'llm') { try { _normalizeBehaviorIntentForPlan(_coaPlan); } catch (_) {} }
            // RMOOZ-WARGAMINGGEN-MOVEMENT-ARCHITECTURE-A: AI COA uses behavior assignments — no ring normalization.
            // _normalizeActionTargets is staff-safe-only; do NOT apply to AI-generated plans.
            // RMOOZ-MISSION-ROLE-CONTRACT-A: log which side the initial COA was generated for.
            try {
                var _coaSide = (_missionRoleContract && _missionRoleContract.active_coa_side) ||
                    (plan && plan.active_side) || 'RED';
                _recordDecision({ role: 'white', action: 'COA_SIDE_SELECTED', called_llm: false,
                    source: 'mission-role-contract', result_summary: 'active_coa_side=' + _coaSide });
                _appendToEventLog('COA_SIDE_SELECTED: active_coa_side=' + _coaSide);
            } catch (_) {}
            _coaLoading = false; _coaApplied = false; _stopCoaLoadingTicker();
            updatePanel();
            // RMOOZ-GREEN-WORLD-UI-R + RMOOZ-GREEN-WHITE-SCORING-T: refresh Green, then score it onto the
            // White review (deterministic; no /plan-coas, no LLM; advisory-only — never invalidates the COA).
            if (_coaPlan && _coaPlan.ok) { _greenScoringKey = null; try { _refreshGreenWorld('after_deep_plan').then(function () { try { _applyGreenAdvisoryScoring('plan_review'); _applyCoaRanking(); } catch (_) {} }); } catch (_) {} }
            // RMOOZ-AI-SCHEDULER-DECISION-LOG-S: record commander/performance/validation decisions (record-only, no new calls).
            try { _recordPlanDecision(_coaPlan, _nowMs() - _genT0); } catch (_) {}
            // RMOOZ-REAL-COA-COMMANDER-QUALITY-AD: gate the COA — pass / one LLM repair / Staff-Safe fallback.
            try { _runCoaQualityGateFlow(_genT0); } catch (_) {}
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
        _clearAiLiteStagedGroups(); // RMOOZ-DUAL-MAP-LAYER-CONFLICT-A
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
    // ── RMOOZ-WARGAMINGGEN-MOVEMENT-ARCHITECTURE-A ────────────────────────────────
    // Layer 2 — Deterministic Movement Engine
    //
    // Resolve ONE phase's actions into movement records:
    //   • If act.behavior is set → route through RmoozMovementEngine (waypoint_policy-based step).
    //   • Otherwise → step toward act.target at domain speed (staff-safe / legacy fallback).
    //
    // Domain step sizes per tick (realistic regional scale):
    //   air 120 km · ground 25 km · naval 20 km · default 25 km
    //
    // Patrol/orbit cycle forever; all other behaviors advance toward final waypoint.
    // Returns reached=true only when unit arrives at its last (or only) waypoint.
    // ─────────────────────────────────────────────────────────────────────────────
    var MOVE_STEP_KM = { air: 120, ground: 25, naval: 20, air_defense: 0, sensor: 0, support: 15, static: 0 };
    var MOVE_CYCLE_POLICIES = { patrol_loop: true, orbit: true };

    function _stepKmForDomain(domain) {
        return MOVE_STEP_KM[domain] !== undefined ? MOVE_STEP_KM[domain] : 25;
    }

    function _resolvePhaseMoves(actions) {
        var moves = [];
        var obj = getObjective();
        var ME = W() && W().RmoozMovementEngine;
        var scenario = W() && W().RmoozScenario && W().RmoozScenario.scenario;

        arr(actions).forEach(function (act, slotIdx) {
            if (!act) return;

            // HOLD: no movement, order instantly complete
            if (act.action_type === 'HOLD_POSITION' || act.behavior === 'hold') {
                var heldUnit = (_findRealUnit(act.unit_uid) || {}).unit || null;
                moves.push({ uid: act.unit_uid, role: act.role || '', action_type: act.action_type || 'HOLD_POSITION',
                    held: true, hold: true, reached: true, unit: heldUnit,
                    behavior: act.behavior || 'hold', domain: act.domain || 'ground',
                    movement_mode: act.movement_mode || 'static',
                    waypoint_policy: act.waypoint_policy || 'hold_area',
                    moved_km: 0, remaining_km: 0, distance_to_waypoint_km: 0, source: act._source || 'staff_safe_fallback' });
                return;
            }

            var found = _findRealUnit(act.unit_uid);
            if (!found || !found.unit) return;
            var u = found.unit;
            var startLat = u.lat != null ? +u.lat : (Array.isArray(u.coord) ? +u.coord[1] : null);
            var startLon = u.lon != null ? +u.lon : (Array.isArray(u.coord) ? +u.coord[0] : null);
            if (!Number.isFinite(startLat) || !Number.isFinite(startLon)) return;

            var behavior = act.behavior || null;
            var domain = act.domain || (ME ? ME.classifyUnitDomain(u) : 'ground');
            var stepKm  = _stepKmForDomain(domain);
            var stepDeg = stepKm / 111.0;   // rough degrees per km

            // ── BEHAVIOR PATH (Layer 2) ──────────────────────────────────────────
            if (behavior && ME && obj && stepKm > 0) {
                // Compute waypoints once, cache in the action object for subsequent ticks
                if (!act._waypoints) {
                    var enemySide = String(u.side || '').toUpperCase() === 'RED' ? 'BLUE' : 'RED';
                    var enemyUnits = scenario
                        ? (enemySide === 'RED' ? arr(scenario.red_units) : arr(scenario.blue_units_initial || scenario.blue_units))
                        : [];
                    var wps = ME.buildWaypointsForAssignment(u, act, obj, enemyUnits, slotIdx);
                    act._waypoints = (wps && wps.length) ? wps : null;
                    act._wpIdx = 0;
                }
                var wps2 = act._waypoints;
                if (!wps2 || !wps2.length) {
                    // behavior=hold or engine returned nothing → hold in place
                    moves.push({ uid: act.unit_uid, role: act.role || '', action_type: act.action_type || '',
                        held: true, hold: false, reached: false, unit: u,
                        behavior: behavior, domain: domain, movement_mode: act.movement_mode || domain,
                        waypoint_policy: act.waypoint_policy || 'hold_area',
                        moved_km: 0, remaining_km: 0, distance_to_waypoint_km: 0, source: 'ai_behavior',
                        start: { lat: startLat, lon: startLon }, final: { lat: startLat, lon: startLon } });
                    return;
                }

                var wpIdx  = act._wpIdx || 0;
                var policy = act.waypoint_policy || '';
                var cyclic = !!MOVE_CYCLE_POLICIES[policy];
                var targetWp = wps2[wpIdx % wps2.length];

                var dLat = targetWp.lat - startLat, dLon = targetWp.lon - startLon;
                var distDeg = Math.sqrt(dLat * dLat + dLon * dLon);

                var finLat, finLon, reached;
                if (distDeg <= stepDeg) {
                    // Arrive at this waypoint this tick
                    finLat = round5(targetWp.lat);
                    finLon = round5(targetWp.lon);
                    reached = cyclic ? false : (wpIdx >= wps2.length - 1);   // cyclic never "reaches", others reach at last wp
                    if (cyclic) {
                        act._wpIdx = (wpIdx + 1) % wps2.length;
                    } else {
                        act._wpIdx = Math.min(wpIdx + 1, wps2.length - 1);
                    }
                } else {
                    // Step one domain-speed increment toward this waypoint
                    var frac = stepDeg / distDeg;
                    finLat = round5(startLat + dLat * frac);
                    finLon = round5(startLon + dLon * frac);
                    reached = false;
                }

                var movedKm  = _kmBetween({ lat: startLat, lon: startLon }, { lat: finLat, lon: finLon });
                var finalWp  = wps2[wps2.length - 1];
                var remKm    = _kmBetween({ lat: finLat, lon: finLon }, finalWp);
                var wpDistKm = _kmBetween({ lat: finLat, lon: finLon }, targetWp);
                moves.push({ unit: u, uid: act.unit_uid, role: act.role || '', action_type: act.action_type || '',
                    behavior: behavior, domain: domain,
                    movement_mode: act.movement_mode || (domain === 'air' ? 'air' : domain === 'naval' ? 'naval' : 'ground'),
                    waypoint_policy: policy || 'direct_step',
                    execution_mode: act.execution_mode || '',
                    held: movedKm < 0.5, hold: false, reached: reached,
                    start: { lat: startLat, lon: startLon },
                    final: { lat: finLat, lon: finLon },
                    target: targetWp,
                    waypoints: wps2, waypoint_idx: wpIdx,
                    moved_km: movedKm, remaining_km: remKm, distance_to_waypoint_km: wpDistKm,
                    source: act._source || 'ai_behavior' });
                return;
            }

            // RMOOZ-AI-COA-BEHAVIOR-PATH-REQUIRED-A: AI MOVE without behavior after normalization must NOT
            // silently fall to the legacy target-only path — log as blocked and skip execution.
            if (_coaPlan && _coaPlan.plan_source === 'llm' && !behavior) {
                if (!Array.isArray(_domainBlockedRecords)) _domainBlockedRecords = [];
                _domainBlockedRecords.push({ uid: act.unit_uid, role: act.role || '', tick: (_coaExec && _coaExec.ticks) || 0,
                    domain: act.domain || 'unknown', reason: 'AI_NO_BEHAVIOR_INTENT', source: 'llm_no_behavior' });
                return;
            }

            // ── LEGACY / STAFF-SAFE PATH ─────────────────────────────────────────
            // Step toward act.target at domain speed (no teleport).
            if (!act.target || !Number.isFinite(+act.target.lat) || !Number.isFinite(+act.target.lon)) return;
            var tgt = { lat: +act.target.lat, lon: +act.target.lon };
            var dLat2 = tgt.lat - startLat, dLon2 = tgt.lon - startLon;
            var dist2 = Math.sqrt(dLat2 * dLat2 + dLon2 * dLon2);

            var finLat2, finLon2, reached2;
            if (stepKm === 0) {
                // Static/sensor/air_defense domain — unit stays in place, never "reaches".
                finLat2 = round5(startLat); finLon2 = round5(startLon);
                reached2 = false;
            } else {
                // Step toward target at domain speed. Arrive (reached=true) only when within
                // one step's distance — never teleport the unit past that point in one tick.
                var frac2 = (dist2 > 0) ? Math.min(1, stepDeg / dist2) : 1;
                finLat2 = round5(startLat + dLat2 * frac2);
                finLon2 = round5(startLon + dLon2 * frac2);
                reached2 = (frac2 >= 1);
            }
            var movedKm2  = _kmBetween({ lat: startLat, lon: startLon }, { lat: finLat2, lon: finLon2 });
            var remKm2    = _kmBetween({ lat: finLat2, lon: finLon2 }, tgt);
            moves.push({ unit: u, uid: act.unit_uid, role: act.role || '', action_type: act.action_type || '',
                behavior: act.behavior || null, domain: domain,
                movement_mode: act.movement_mode || (domain === 'air' ? 'air' : domain === 'naval' ? 'naval' : 'ground'),
                waypoint_policy: act.waypoint_policy || 'direct_step',
                execution_mode: act.execution_mode || '',
                held: movedKm2 < 0.5, hold: false, reached: reached2,
                start: { lat: startLat, lon: startLon },
                final: { lat: finLat2, lon: finLon2 },
                target: tgt,
                moved_km: movedKm2, remaining_km: remKm2, distance_to_waypoint_km: remKm2,
                source: act._source || 'staff_safe_fallback' });
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
        _clearAiLiteStagedGroups(); // RMOOZ-DUAL-MAP-LAYER-CONFLICT-A
        if (!_coaPlan || !_coaPlan.ok || !Array.isArray(_coaPlan.coas) || !_coaPlan.coas.length) return null;
        var i = (idx == null) ? _coaSelectedIdx : idx;
        if (i < 0 || i >= _coaPlan.coas.length) i = 0;
        var t0 = _nowMs();
        var coa = _coaPlan.coas[i];
        // RMOOZ-COA-QUALITY-HARD-ENFORCEMENT-AE: the COMMITTED/EXECUTED COA must be role-separated. If the
        // selected COA is not executable-quality, replace it IN THE PLAN with the Staff-Safe commander
        // template (clearly labelled) so commit + run + map all use the repaired, role-separated actions.
        var enf = _enforceExecutableCoaQuality(coa);
        if (enf.replaced) {
            _coaPlan.coas[i] = enf.coa;
            _coaPlan.plan_source = 'staff_safe_commander_template';
            _coaPlan.llm_status = 'blocked_low_quality_selected_coa';
            _coaPlan._coa_quality = { verdict: 'fallback', score: (enf.coa._quality && enf.coa._quality.score) || 100, reasons: [enf.reason] };
            coa = enf.coa;
            try { _recordDecision({ role: 'performance', action: 'coa_quality_gate', called_llm: false, source: 'commit-enforcement', reason: 'blocked low-quality selected COA', result_summary: 'fallback (commit) · ' + enf.reason }); } catch (_) {}
            try { _appendToEventLog('Commit quality gate: selected COA was not commander-quality (' + esc(enf.reason) + ') — committing the Staff-Safe commander template instead.'); } catch (_) {}
        }
        // RMOOZ-STEP1-COA-PREPARATION-GATE-AE: refuse to commit a COA that tasks a non-taskable Step-1
        // (review-only) unit with movement/combat — it can only HOLD/REVIEW until source/doctrine/commander
        // review is complete. (Builders already exclude blocked units; this is the commit-time backstop.)
        var _blkUid = _coaTasksBlockedUnit(coa);
        if (_blkUid) {
            _coaCommitBlockedReason = 'Commit refused — COA tasks Step-1 review-only unit ' + _blkUid + ' with movement/combat. It can only HOLD/REVIEW until source/doctrine/commander review is complete.';
            try { _appendToEventLog('Commit refused: COA tasks non-taskable Step-1 unit ' + esc(_blkUid) + ' with movement — review required.'); } catch (_) {}
            try { _recordDecision({ role: 'white', action: 'step1_coa_preparation_gate', called_llm: false, source: 'commit-gate', reason: 'non-taskable unit tasked with movement', result_summary: 'commit refused · ' + _blkUid }); } catch (_) {}
            updatePanel(); return null;
        }
        // RMOOZ-MOVEMENT-INTELLIGENCE-A: block commit if COA references unit UIDs not on the map.
        _missingUnitRecords = []; _heldMovementRecords = []; _domainBlockedRecords = []; _movedMovementRecords = [];
        var _missingUid = null;
        _coaAllActions(coa).forEach(function (act) {
            if (!act || !act.unit_uid || _missingUid) return;
            if (act.action_type === 'HOLD_POSITION') return;
            if (!_findRealUnit(act.unit_uid) || !(_findRealUnit(act.unit_uid) || {}).unit) {
                _missingUid = act.unit_uid;
                _missingUnitRecords.push({ uid: act.unit_uid, reason: 'unit not found on map' });
            }
        });
        if (_missingUid) {
            _coaCommitBlockedReason = 'Commit refused — COA references unit ' + _missingUid + ' not found on the map. Remove it from the plan or load the unit first.';
            try { _appendToEventLog('Commit refused: unit ' + esc(_missingUid) + ' not found on map — COA cannot be executed.'); } catch (_) {}
            updatePanel(); return null;
        }
        _coaCommitBlockedReason = null;
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
        _committedPlanObj = _coaPlan;   // AB1: remember WHICH plan object this commit came from (identity)
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
        // RMOOZ-AI-FREE-FIGHT-EVENT-MILESTONES-A: named COA_COMMITTED milestone (structured ledger).
        try { _recordDecision({ role: 'white', action: 'COA_COMMITTED', called_llm: false, source: 'operator-commit',
            result_summary: _coaExec.selected_coa_id + ' · ' + arr(coa.phases).length + ' phase(s) · ' + ((_coaPlan && _coaPlan.plan_source) || 'unknown') + ' · side ' + side }); } catch (_) {}
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
    // SCC-REAL-STATE-A: route a committed run tick's REAL moves through World State (WS3) so the
    // operator's decision changes the single source of truth AND the live map. Boundary-safe:
    // reads AppAdjudicatorMap.getWorldState(), applies pure WS3 MOVE decisions, and reflects the
    // resulting unit deltas via AppAdjudicatorMap.applyWorldStateUnitDeltas (marker/unitRegistry
    // only — never window.units / scenario). Committed executor only; preview stays symbolic.
    function _applyRunMovesToWorldState(records) {
        if (!Array.isArray(records) || !records.length) return null;
        if (!_coaExec || !_coaExec.active) return null;   // committed operator run only
        var W = (typeof window !== 'undefined' && window) || (typeof global !== 'undefined' ? global : this);
        var WS3 = W && W.AppWorldStateTransition;
        var MAP = W && W.AppAdjudicatorMap;
        if (!WS3 || typeof WS3.applyDecisions !== 'function') return null;
        if (!MAP || typeof MAP.getWorldState !== 'function') return null;
        var ws = MAP.getWorldState();
        if (!ws || !Array.isArray(ws.units)) return null;
        var decisions = records.filter(function (r) {
            return r && r.uid && r.to && isFinite(+r.to.lon) && isFinite(+r.to.lat);
        }).map(function (r) { return { type: 'MOVE', actor: r.uid, to: [+r.to.lon, +r.to.lat] }; });
        if (!decisions.length) return null;
        var res = WS3.applyDecisions(ws, decisions);
        var newWs = res && res.worldState;
        if (!newWs || !Array.isArray(newWs.units)) return null;
        if (typeof MAP.applyWorldStateUnitDeltas === 'function') {
            var byUid = {}; newWs.units.forEach(function (u) { if (u && u.uid) byUid[u.uid] = u; });
            var deltas = decisions.map(function (d) {
                var u = byUid[d.actor];
                return u ? { uid: u.uid, position: u.position, status: u.status, strength: u.strength } : null;
            }).filter(Boolean);
            try { MAP.applyWorldStateUnitDeltas(deltas); } catch (_) {}
        }
        return { decisions: decisions.length, effects: (res && res.effects) || [] };
    }

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
        // RMOOZ-AI-FREE-FIGHT-EVENT-MILESTONES-A: named PHASE_STARTED milestone — once per phase (first tick).
        if (_coaExec._loggedPhaseStart !== _coaExec.current_phase_index) {
            _coaExec._loggedPhaseStart = _coaExec.current_phase_index;
            try { _recordDecision({ role: 'unit-controller', action: 'PHASE_STARTED', called_llm: false, source: 'coa_commitment',
                result_summary: 'phase ' + (_coaExec.current_phase_index + 1) + '/' + phases.length + ' (' + ((phase && (phase.title || phase.name)) || 'phase') + ') · ' + actions.length + ' action(s)' }); } catch (_) {}
        }
        var moves = _resolvePhaseMoves(actions);
        var realMoves = moves.filter(function (m) { return !m.hold; });
        _writeMoveFrame(realMoves, 1);
        var movedNow = _movedRecords(realMoves);
        _coaMovedUnits = movedNow; _coaApplied = true;
        // RMOOZ-WARGAMINGGEN-MOVEMENT-ARCHITECTURE-A: richer per-tick moved record
        _movedMovementRecords = realMoves.filter(function (m) { return !m.held && m.moved_km > 0; }).map(function (m) {
            return { uid: m.uid, side: m.unit ? (m.unit.side || '') : '', moved_km: m.moved_km || 0,
                behavior: m.behavior || null, domain: m.domain || 'ground',
                from: m.start, to: m.final, waypoint_policy: m.waypoint_policy || null };
        });
        // SCC-REAL-STATE-A: the committed run now changes the single source of truth. Route this
        // tick's real moves through World State (WS3) and reflect them on the live map (not just
        // the symbolic demo layer). Preview/uncommitted paths never reach here.
        try { _applyRunMovesToWorldState(_movedMovementRecords); } catch (_) {}
        // Held units (moved < 0.5km but not HOLD_POSITION) and domain-blocked units tracked
        // separately so movementDebug() and the map overlay can show WHY they didn't move.
        var holdActions = moves.filter(function (m) { return m.hold; });
        var heldInPlace = realMoves.filter(function (m) { return m.held; });
        _heldMovementRecords = holdActions.concat(heldInPlace).map(function (m) {
            var ulat = m.start ? m.start.lat : (m.unit ? (m.unit.lat != null ? m.unit.lat : (Array.isArray(m.unit.coord) ? m.unit.coord[1] : null)) : null);
            var ulon = m.start ? m.start.lon : (m.unit ? (m.unit.lon != null ? m.unit.lon : (Array.isArray(m.unit.coord) ? m.unit.coord[0] : null)) : null);
            return { uid: m.uid, side: m.unit ? (m.unit.side || '') : '',
                lat: ulat, lon: ulon,
                behavior: m.behavior || null, domain: m.domain || 'ground',
                reason: m.hold ? 'HOLD_POSITION' : 'held — already in position' };
        });
        _domainBlockedRecords = realMoves.filter(function (m) {
            return m.held && m.domain_validation && !m.domain_validation.ok;
        }).map(function (m) {
            return { uid: m.uid, side: m.unit ? (m.unit.side || '') : '',
                lat: m.start ? m.start.lat : null, lon: m.start ? m.start.lon : null,
                domain: m.domain || 'ground',
                reason: (m.domain_validation && m.domain_validation.reason) || 'domain/territory violation',
                violation_type: (m.domain_validation && m.domain_validation.violation_type) || '' };
        });
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
        // RMOOZ-STEP1-COA-PREPARATION-GATE-AE: refuse to run a committed COA that tasks a non-taskable Step-1
        // (review-only) unit with movement. (The movement chokepoint also suppresses it, but Run gives a
        // clear, actionable block rather than silently holding.)
        var _s1blk = _coaTasksBlockedUnit(_coaExec.selected_coa);
        if (_s1blk) {
            _coaExec.run_blocked_reason = 'Blocked: committed COA tasks Step-1 review-only unit ' + _s1blk + ' (not taskable). Complete source/doctrine/commander review, or recommit without it.';
            try { _appendToEventLog('Run blocked — committed COA tasks non-taskable Step-1 unit ' + esc(_s1blk) + '. Review required.'); } catch (_) {}
            try { _recordDecision({ role: 'white', action: 'step1_coa_preparation_gate', called_llm: false, source: 'run-gate', reason: 'non-taskable unit tasked', result_summary: 'run blocked · ' + _s1blk }); } catch (_) {}
            updatePanel(); return;
        }
        // RMOOZ-COA-QUALITY-HARD-ENFORCEMENT-AE: a low-quality committed COA (e.g. a stale restored one from
        // before the gate) must NOT execute. Block the run and require a repaired/template recommit.
        var _block = _coaHardBlockReason(_coaExec.selected_coa);
        if (_block) {
            _coaExec.run_blocked_reason = 'Blocked: selected COA is not commander-quality (' + _block + '). Recommit a repaired/template COA.';
            try { _appendToEventLog('Run blocked — committed COA is not commander-quality (' + esc(_block) + '). Recommit a repaired/template COA.'); } catch (_) {}
            try { _recordDecision({ role: 'performance', action: 'coa_quality_gate', called_llm: false, source: 'run-enforcement', reason: 'blocked low-quality committed COA', result_summary: 'run blocked · ' + _block }); } catch (_) {}
            updatePanel(); return;
        }
        _coaExec.run_blocked_reason = null;
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
        _step1HeldUids = {}; _coaCommitBlockedReason = null;   // AE: fresh start → re-log suppressed units, clear commit block
        _committedPlanObj = null;   // AB1: drop the committed-plan identity so a later plan starts clean
        _persistCoaExec();   // RMOOZ-COA-COMMIT-PERSISTENCE-M: !_coaExec → removes the persisted key (safe clear, req #8)
        updatePanel();
    }
    // The ONLY operator path that re-engages the AI: stop executing + run a fresh Deep Plan (LLM).
    function _replanCoa() {
        _clearAiLiteStagedGroups(); // RMOOZ-DUAL-MAP-LAYER-CONFLICT-A
        _clearIntervalSafe(_coaExecTimer); _coaExecTimer = null;
        try { _appendToEventLog('Replan requested — calling the AI Commander for a fresh plan.'); } catch (_) {}
        _coaExec = null;
        _generateCoaPlan();   // the single LLM call (Deep Plan)
    }
    // The COA Commitment Mode control block (Commit / Run / Pause / Replan + live status).

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

    // RMOOZ-MISSION-ROLE-CONTRACT-A: derive mission roles from the loaded scenario JSON.
    // Mirrors server/ai/mission-role-contract.js (client copy avoids a round-trip before
    // the initial COA call). Priority: generation.template → role analysis → default.
    function _deriveObjOwner(sc) {
        var obj = sc.obj;
        if (!obj || !obj.coord || !isFinite(+obj.coord[0]) || !isFinite(+obj.coord[1])) return 'uncontrolled';
        var oLon = +obj.coord[0], oLat = +obj.coord[1];
        function centroid(units) {
            var n = 0, sLat = 0, sLon = 0;
            (units || []).forEach(function (u) {
                var c = u.coord;
                if (c && c.length >= 2 && isFinite(+c[0]) && isFinite(+c[1])) { sLon += +c[0]; sLat += +c[1]; n++; }
            });
            return n ? { lat: sLat / n, lon: sLon / n } : null;
        }
        var rc = centroid(sc.red_units), bc = centroid(sc.blue_units_initial || sc.blue_units);
        if (!rc || !bc) return 'uncontrolled';
        var dR = (oLat - rc.lat) * (oLat - rc.lat) + (oLon - rc.lon) * (oLon - rc.lon);
        var dB = (oLat - bc.lat) * (oLat - bc.lat) + (oLon - bc.lon) * (oLon - bc.lon);
        return dB < dR ? 'BLUE' : 'RED';
    }
    function _buildMissionRoleContract() {
        var w = (typeof window !== 'undefined') ? window : null;
        var sc = w && w.RmoozScenario && w.RmoozScenario.scenario;
        if (!sc) {
            return { attacker_side: 'RED', defender_side: 'BLUE', objective_owner_side: 'uncontrolled',
                     initial_actor: 'RED', active_coa_side: 'RED', reaction_side: 'BLUE',
                     mission_type: 'attack', objective_source: 'provisional', confidence: 'low' };
        }
        var objOwner = _deriveObjOwner(sc);
        var tpl = String((sc.generation && sc.generation.template) || '').toLowerCase().trim();
        if (tpl === 'attack_objective' || tpl === 'attack') {
            return { attacker_side: 'RED', defender_side: 'BLUE', objective_owner_side: objOwner,
                     initial_actor: 'RED', active_coa_side: 'RED', reaction_side: 'BLUE',
                     mission_type: 'attack', objective_source: 'file_explicit', confidence: 'high' };
        }
        if (tpl === 'defend_objective' || tpl === 'defend') {
            return { attacker_side: 'BLUE', defender_side: 'RED', objective_owner_side: objOwner,
                     initial_actor: 'BLUE', active_coa_side: 'BLUE', reaction_side: 'RED',
                     mission_type: 'defend', objective_source: 'file_explicit', confidence: 'high' };
        }
        var offRoles = ['armor', 'mech_infantry', 'fires', 'assault', 'attack', 'armored', 'mechanized', 'artillery'];
        function countOff(units) {
            return (units || []).filter(function (u) {
                var r = String(u.role || u.type || '').toLowerCase();
                return offRoles.some(function (o) { return r.indexOf(o) !== -1; });
            }).length;
        }
        var redOff = countOff(sc.red_units), blueOff = countOff(sc.blue_units_initial || sc.blue_units);
        if (redOff > 0 || blueOff > 0) {
            var atk = redOff >= blueOff ? 'RED' : 'BLUE', def = atk === 'RED' ? 'BLUE' : 'RED';
            return { attacker_side: atk, defender_side: def, objective_owner_side: objOwner,
                     initial_actor: atk, active_coa_side: atk, reaction_side: def,
                     mission_type: 'attack', objective_source: 'role_inferred', confidence: 'medium' };
        }
        return { attacker_side: 'RED', defender_side: 'BLUE', objective_owner_side: objOwner,
                 initial_actor: 'RED', active_coa_side: 'RED', reaction_side: 'BLUE',
                 mission_type: 'attack', objective_source: 'provisional', confidence: 'low' };
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
                // RMOOZ-MISSION-ROLE-CONTRACT-A: use derived defender, not hardcoded BLUE.
                defending_side: (_missionRoleContract && _missionRoleContract.defender_side) || 'BLUE',
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
    var _step1HeldUids = {};   // RMOOZ-STEP1-...-AE: units suppressed by the taskability guard (logged once each)
    function _resolveCoaMoves(coa) {
        var moves = [];
        arr(coa && coa.phases).forEach(function (ph) {
            arr(ph.actions).forEach(function (act) {
                if (!act || act.action_type === 'HOLD_POSITION') return;
                if (!act.target || !Number.isFinite(+act.target.lat) || !Number.isFinite(+act.target.lon)) return;
                // RMOOZ-STEP1-COA-PREPARATION-GATE-AE: the single movement chokepoint — a non-taskable
                // (Step-1 review-only) unit must NEVER physically move, on ANY path (manual apply, committed
                // tick, scenario, Red maneuver, loop). Suppress the move and log it once per unit.
                if (act.unit_uid && !_isUnitTaskable(act.unit_uid)) {
                    var _hk = String(act.unit_uid);
                    if (!_step1HeldUids[_hk]) { _step1HeldUids[_hk] = 1; try { _appendToEventLog('HELD: ' + esc(_hk) + ' is Step-1 review-only (not taskable) — movement suppressed pending source/doctrine review.'); } catch (_) {} }
                    return;
                }
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
                // RMOOZ-COA-REALISM-GATE-A: territory/domain check — hold the step if unfeasible crossing.
                var _domainValidation = null;
                var _cgGate = _getCoaRealismGate();
                if (_cgGate && act.action_type !== 'HOLD_POSITION') {
                    var _cgResult = _cgGate.validateMovementStep(startLat, startLon, round5(fin.lat), round5(fin.lon), {
                        unit_id: act.unit_uid, side: act.side || (u && u.side) || '', movement_mode: act.movement_mode || '' });
                    _domainValidation = _cgResult;
                    if (_cgResult && _cgResult.held) {
                        held = true;
                        var _dk = String(act.unit_uid);
                        if (!_domainHeldUids[_dk]) { _domainHeldUids[_dk] = 1; try { _appendToEventLog('HELD_DOMAIN: ' + esc(_dk) + ' — ' + esc(_cgResult.reason || 'domain/territory violation')); } catch (_ig) {} }
                        _movementValidationLog.push({ uid: act.unit_uid, side: act.side || (u && u.side) || '', validated: false, violation_type: _cgResult.violation_type || 'domain_held' });
                    } else {
                        _movementValidationLog.push({ uid: act.unit_uid, side: act.side || (u && u.side) || '', validated: true });
                    }
                }
                // RMOOZ-AI-MOVEMENT-EXECUTION-AUDIT-A: carry the action_type + execution_mode + the
                // action-specific target so the EXECUTED event log / debug overlay can PROVE the
                // marker followed the COA's action target (recon standoff / flank off-axis / …).
                var _movDistKm = (held ? 0 : Math.round(_kmBetween({ lat: startLat, lon: startLon }, { lat: round5(fin.lat), lon: round5(fin.lon) }) * 10) / 10);
                moves.push({ unit: u, uid: act.unit_uid, role: act.role || '', action_type: act.action_type || '',
                    execution_mode: act.execution_mode || '', held: held,
                    start: { lat: startLat, lon: startLon }, final: { lat: round5(fin.lat), lon: round5(fin.lon) },
                    target: { lat: +act.target.lat, lon: +act.target.lon },
                    distance_km: _movDistKm, domain_validation: _domainValidation });
            });
        });
        return moves;
    }

    // RMOOZ-AI-MOVEMENT-EXECUTION-AUDIT-A: one ledger line per moved unit proving
    // raw action → applied movement → final marker position, e.g.
    //   "EXECUTED: B-3 recon from 24.10,54.20 to 24.14,54.24 via recon_standoff_target"
    function _ll2(o) { return (Number(o.lat)).toFixed(2) + ',' + (Number(o.lon)).toFixed(2); }
    function _logExecutedMoves(moves) {
        var _movedN = 0, _heldN = 0;
        arr(moves).forEach(function (m) {
            if (!m) return;
            var uid = String(m.uid || (m.unit && (m.unit.id || m.unit.uid || m.unit.unit_uid)) || '?');
            var at = String(m.action_type || '?');
            var mode = String(m.execution_mode || 'generic_target');
            var _dKmStr = (m.distance_km != null && Number.isFinite(m.distance_km) && m.distance_km > 0) ? (' ~' + m.distance_km.toFixed(1) + 'km') : '';
            var _valStr = (m.domain_validation && !m.domain_validation.ok) ? ' [DOMAIN_BLOCKED:' + esc(m.domain_validation.violation_type || '?') + ']' : '';
            if (m.held) {
                _heldN++;
                _appendToEventLog('EXECUTED: ' + esc(uid) + ' ' + esc(at) + ' HELD at ' + _ll2(m.start) + ' (already in position) via ' + esc(mode) + _valStr);
            } else {
                _movedN++;
                _appendToEventLog('EXECUTED: ' + esc(uid) + ' ' + esc(at) + ' from ' + _ll2(m.start) + ' to ' + _ll2(m.final) + _dKmStr + ' via ' + esc(mode) + _valStr);
            }
        });
        // RMOOZ-AI-FREE-FIGHT-EVENT-MILESTONES-A: named structured summary beside the per-unit ledger lines.
        if (_movedN || _heldN) { try { _recordDecision({ role: 'unit-controller', action: 'UNIT_TASK_EXECUTED', called_llm: false, source: 'coa_commitment', result_summary: _movedN + ' moved · ' + _heldN + ' held' }); } catch (_) {} }
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
        // RMOOZ-AI-MODEL-WIRING-COHERENCE-A: OpenRouter is a valid provider but requires cloud gates.
        if (provider === 'openrouter') {
            return 'Cloud model selected but cloud AI is disabled. Enable RMOOZ_ALLOW_CLOUD_AI=1 and add OPENROUTER_API_KEY, or choose a local Ollama model.';
        }
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
    // RMOOZ-AI-COA-HONESTY-A hardening: every gate condition must be positively confirmed (=== true),
    // never just "not false". A null/unknown value means we don't yet know — block with health_pending.
    function _freeFightAiReady() {
        // RMOOZ-PREPARE-COA-UX-UNBLOCK-A: 'fast' depth still calls the COA generation LLM (it only
        // skips the capability analyst pre-pass). Do NOT block Prepare AI COA for fast depth.
        var rh = _routeHealth;
        // Route health not yet loaded or returned an error — never claim "AI ready" when we
        // don't know allow_sim_run / model / provider status.
        if (!rh || rh.ok === false) {
            return { ok: false, code: 'health_pending',
                reason: 'AI route health not loaded yet',
                msg: 'Wait for route health / model readiness check.' };
        }
        // RMOOZ-AI-MODEL-WIRING-COHERENCE-A: check pair coherence before any gate checks.
        // pair_coherent===false means a cloud slug is paired with the local Ollama provider —
        // block immediately with a message that names the exact problem and fix.
        if (rh.pair_coherent === false) {
            return { ok: false, code: 'pair_incoherent',
                reason: rh.reason_if_blocked || 'provider/model pair is incoherent — cloud slug with local Ollama provider',
                msg: 'Cloud model selected but provider is Ollama. Choose local model or switch to OpenRouter.' };
        }
        // RMOOZ-FREE-FIGHT-AI-GATE-CARD-D: combine ALL active blocks (exec gate + remote provider),
        // not just the first one, so the operator sees every reason + fix at once (req #6).
        var reasons = _aiBlockReasons(rh);
        if (reasons.length) {
            return { ok: false, code: 'disabled',
                reason: reasons.map(function (r) { return r.code; }).join(' + '),
                msg: reasons.map(function (r) { return r.fix; }).join('  ') };
        }
        // Require allow_sim_run === true (not just not-false — null/undefined = pending).
        if (rh.allow_sim_run !== true) {
            return { ok: false, code: 'health_pending',
                reason: 'AI gate status not yet confirmed (allow_sim_run)',
                msg: 'Wait for route health check.' };
        }
        // RMOOZ-OPENROUTER-FREE-FIGHT-CONTROL-FIX-I: use the EFFECTIVE availability (route-health
        // for local; /api/ai/models for cloud, where route-health is null) so Start is correctly
        // disabled for an unavailable cloud slug and ENABLED when the cloud slug is in the catalog.
        var avail = _modelAvailableEffective();
        if (avail !== true) {
            // null = probe not yet returned; false = confirmed unavailable. Both block.
            return { ok: false, code: avail === false ? 'no_model' : 'health_pending',
                reason: avail === false ? (rh.reason_if_blocked || 'no model available') : 'Model availability not yet confirmed',
                msg: avail === false ? AI_NO_MODEL_MSG : 'Wait for model readiness check.' };
        }
        // RMOOZ-OPENROUTER-FREE-FIGHT-CONTROL-FIX-I: a present-but-malformed cloud key (not sk-or-…) will
        // 401 at generation — disable Start so the card's pre-flight warning and the button agree.
        if (_modelInfo && _modelInfo.key_format_ok === false) return { ok: false, code: 'bad_key', reason: 'openrouter key malformed', msg: AI_NO_MODEL_MSG };
        // A cloud slug (e.g. qwen/qwen3.5-397b-a17b) selected when OpenRouter was active persists in
        // the runtime file. If the running server is now ollama, block with a clear mismatch message
        // rather than silently failing at generation or showing "not loaded in local provider".
        var _serverIsLocal = rh.provider !== 'openrouter' && rh.configured_provider !== 'openrouter';
        if (_modelInfo && _modelInfo.selected_is_cloud_slug === true && _serverIsLocal) {
            return { ok: false, code: 'cloud_model_local_provider',
                reason: 'a cloud model is selected but the server is using local Ollama',
                msg: 'Cloud model selected but provider is Ollama. Choose local model or switch to OpenRouter.' };
        }
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

    // ── end FREEFIGHT-AI-COA-PLANNER-A ────────────────────────────────────────

    // FREEFIGHT-AI-CONTINUOUS-COMMANDER-LOOP-A: the continuous AI commander control block.

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
                try { _recordDecision({ role: 'green', action: 'GREEN_REFRESH', called_llm: false, duration_ms: _nowMs() - _gT0, reason: reason || 'manual', source: 'green-world', result_summary: 'collateral ' + _greenBand(a) + ' (' + (a.collateral_risk && a.collateral_risk.score) + ')' }); } catch (_) {}
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
    var DECISION_ROLE_COLORS = { blue: '#7bb8e8', red: '#f0707a', green: '#5bd6a0', white: '#cdd8e4', performance: '#e0a93a', 'unit-controller': '#9ec2ec', operator: '#c8a0e0' };
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
    // ── RMOOZ-AUTO-SCENARIO-FORMATION-REALISM-AC: deterministic tactical spacing around the objective ──
    var OBJ_CONTROL_KM = 5;                // a side "controls/holds" the objective with a unit inside this radius
    var OBJ_CONTEST_KM = 8;                // a side "contests" the objective with a unit inside this radius
    var RING_KM = { assault: 2, support: 5, screen: 3, blocking: 4, reserve: 8 };
    var BLUE_BASE_DEG = 210;               // Blue approaches/holds from the SW sector
    var RED_BASE_DEG = 30;                 // Red defends from the NE sector (opposite Blue → no stacking)
    // A deterministic ring position: radius (km) + a per-unit angular offset (idx * 25°) so units never
    // share a coordinate. Movement is still capped + teleport-guarded at execution time (_resolveCoaMoves).
    function _ringPos(obj, radiusKm, idx, baseDeg) {
        if (!obj) return null;
        var rDeg = radiusKm / 111;
        var ang = (baseDeg + (idx || 0) * 25) * Math.PI / 180;
        var cosLat = Math.cos((obj.lat || 0) * Math.PI / 180) || 1;
        return { lat: round5(obj.lat + rDeg * Math.cos(ang)), lon: round5(obj.lon + (rDeg * Math.sin(ang)) / cosLat) };
    }
    function _assaultRing(obj, i)  { return _ringPos(obj, RING_KM.assault, i, BLUE_BASE_DEG); }
    function _supportRing(obj, i)  { return _ringPos(obj, RING_KM.support, i, BLUE_BASE_DEG); }
    function _screenRing(obj, i)   { return _ringPos(obj, RING_KM.screen, i, RED_BASE_DEG); }
    function _blockingRing(obj, i) { return _ringPos(obj, RING_KM.blocking, i, RED_BASE_DEG); }
    function _reserveRing(obj, i)  { return _ringPos(obj, RING_KM.reserve, i, BLUE_BASE_DEG + 180); }
    // RMOOZ-MOVEMENT-TRUTH-A: normalize LLM-generated COA targets that are too far from
    // the objective. If a target is > 40 km from the objective it is almost certainly an
    // AI hallucination (staged positions, random coords) — replace with the correct ring.
    var MAX_PLAN_TARGET_OBJ_KM = 40;
    function _normalizeActionTargets(plan) {
        var obj = getObjective();
        if (!obj || !Number.isFinite(obj.lat) || !Number.isFinite(obj.lon)) return plan;
        if (!plan || !plan.ok || !Array.isArray(plan.coas)) return plan;
        plan.coas.forEach(function (coa) {
            var isRed = String((coa && coa.side) || '').toUpperCase() === 'RED';
            var roleCount = {};
            arr(coa && coa.phases).forEach(function (ph) {
                arr(ph && ph.actions).forEach(function (act) {
                    if (!act || act.action_type === 'HOLD_POSITION') return;
                    if (!act.target || !Number.isFinite(+act.target.lat) || !Number.isFinite(+act.target.lon)) return;
                    var d = _kmBetween({ lat: +act.target.lat, lon: +act.target.lon }, obj);
                    if (d <= MAX_PLAN_TARGET_OBJ_KM) return;
                    var role = act.role || '';
                    var idx = (roleCount[role] = ((roleCount[role] || 0) + 1));
                    // RMOOZ-MOVEMENT-INTELLIGENCE-A: use movement engine for normalization.
                    var normalized;
                    var _ME_n = W() && W().RmoozMovementEngine;
                    if (_ME_n && _ME_n.buildWaypointsForAssignment) {
                        var _nu = (_findRealUnit(act.unit_uid) || {}).unit || {};
                        var _ne = _scenarioSideUnits ? _scenarioSideUnits(isRed ? 'BLUE' : 'RED') : [];
                        var _nb = { assault:'approach', support:'support', screen:'screen', recon:'observe', reserve:'reserve', intercept:'intercept', defend:'defend', reinforce:'support' };
                        var _nwps = _ME_n.buildWaypointsForAssignment(_nu, { behavior: _nb[role] || role }, obj, _ne, idx);
                        normalized = _nwps && _nwps[0];
                    }
                    if (!normalized || !Number.isFinite(normalized.lat)) {
                        // Fallback: ring placement (fallback_formation:true)
                        if (isRed) {
                            if (role === 'recon')        normalized = _ringPos(obj, 7, idx, RED_BASE_DEG);
                            else if (role === 'support') normalized = _ringPos(obj, RING_KM.support, idx, RED_BASE_DEG + 30);
                            else if (role === 'screen')  normalized = _ringPos(obj, RING_KM.screen,  idx, RED_BASE_DEG + 90);
                            else if (role === 'reserve') normalized = _ringPos(obj, 10, idx, RED_BASE_DEG + 180);
                            else                         normalized = _ringPos(obj, RING_KM.assault, idx, RED_BASE_DEG);
                        } else {
                            if (role === 'recon')            normalized = _ringPos(obj, 6, idx, RED_BASE_DEG);
                            else if (role === 'screen')      normalized = _screenRing(obj, idx);
                            else if (role === 'intercept')   normalized = _blockingRing(obj, idx);
                            else if (role === 'reserve')     normalized = _reserveRing(obj, idx);
                            else if (role === 'reinforce')   normalized = _supportRing(obj, idx);
                            else                             normalized = _ringPos(obj, RING_KM.assault, idx, RED_BASE_DEG - 15);
                        }
                    }
                    if (normalized && Number.isFinite(normalized.lat) && Number.isFinite(normalized.lon)) {
                        act.target = normalized;
                        act._target_normalized = true;
                    }
                });
            });
        });
        return plan;
    }
    function _objFormation(obj) {
        return { objective_center: obj ? { lat: obj.lat, lon: obj.lon } : null,
            assault_ring: function (i) { return _assaultRing(obj, i); }, support_ring: function (i) { return _supportRing(obj, i); },
            screen_ring: function (i) { return _screenRing(obj, i); }, blocking_ring: function (i) { return _blockingRing(obj, i); },
            reserve_ring: function (i) { return _reserveRing(obj, i); } };
    }
    function _scenarioActive() { return !!(_scenario && _scenario.scenario_active); }
    // RMOOZ-COA-REALISM-GATE-A: validate initial placement of all Green units.
    // Flags BLUE units in RED territory without forward_deployed authorization.
    // Returns an array of { uid, side, lat, lon, result } records.
    function _validateAllPlacements() {
        var gate = _getCoaRealismGate();
        if (!gate) return [];
        var results = [];
        _greenUnits().forEach(function (u) {
            if (!u) return;
            var r = gate.validatePlacement(u);
            results.push({ uid: u.id, side: u.side, lat: u.lat, lon: u.lon, result: r });
            if (!r.ok) {
                try { _appendToEventLog('PLACEMENT_VIOLATION: ' + esc(String(u.id || '?')) + ' (' + esc(String(u.side || '?')) + ') — ' + esc(r.reason || r.violation_type || 'invalid placement')); } catch (_ig) {}
            }
        });
        return results;
    }
    function _newScenario() {
        // RMOOZ-COA-REALISM-GATE-A: run placement validation on every scenario start.
        _movementValidationLog = [];
        _domainHeldUids = {};
        _missingUnitRecords = []; _heldMovementRecords = []; _domainBlockedRecords = []; _movedMovementRecords = [];
        try { _placementValidation = _validateAllPlacements(); } catch (_ig) { _placementValidation = []; }
        var sc = { scenario_active: true, scenario_status: 'running', scenario_turn: 1, blue_cycle: 0, red_cycle: 0,
            current_actor: 'unit-controller', end_condition: null, last_outcome: null, pending_replan_reason: null,
            max_turns: SCENARIO_MAX_TURNS, started_at: _nowISO(), updated_at: _nowISO(),
            // RMOOZ-FREE-FIGHT-AUTO-SCENARIO-DIRECTOR-AB: auto-director settings
            auto_continue: _scenarioAutoContinue, auto_director_enabled: true, max_auto_turns: SCENARIO_MAX_AUTO_TURNS,
            last_auto_order_source: null, last_red_maneuver: null,
            // RMOOZ-AUTO-SCENARIO-FORMATION-REALISM-AC: objective-control + formation state
            objective_control: 'uncontrolled', blue_presence: 0, red_contest: 0, last_formation_order: null,
            // RMOOZ-COA-REALISM-GATE-A: placement violation count at scenario start
            placement_violations: _placementValidation.filter(function (r) { return r && r.result && !r.result.ok; }).length };
        return sc;
    }
    // Count units of a side within `km` of the objective (area-based presence/contest).
    function _scenarioSideWithin(side, obj, km) {
        if (!obj) return 0;
        var n = 0;
        _greenUnits().forEach(function (u) {
            if (String(u.side || '').toUpperCase() !== side) return;
            if (_kmBetween({ lat: u.lat, lon: u.lon }, { lat: obj.lat, lon: obj.lon }) <= km) n++;
        });
        return n;
    }
    function _scenarioSideNearObj(side, obj) { return _scenarioSideWithin(side, obj, SCENARIO_OBJ_NEAR_KM); }
    // White deterministic adjudication of the current battlefield (NO LLM, NO fetch).
    // RMOOZ-AUTO-SCENARIO-FORMATION-REALISM-AC: AREA-based objective control (radius, not exact center):
    // Blue controls if Blue is inside the objective radius and Red cannot contest; Red controls the mirror;
    // contested when both have units inside the radii; uncontrolled otherwise.
    function _whiteScenarioOutcome() {
        var obj = getObjective();
        var blueTotal = _sideUnitCount('BLUE'), redTotal = _sideUnitCount('RED');
        var bluePresence = _scenarioSideWithin('BLUE', obj, OBJ_CONTROL_KM);   // Blue inside the control radius
        var redControl = _scenarioSideWithin('RED', obj, OBJ_CONTROL_KM);       // Red inside the control radius
        var redContest = _scenarioSideWithin('RED', obj, OBJ_CONTEST_KM);       // Red inside the (wider) contest radius
        var blueContest = _scenarioSideWithin('BLUE', obj, OBJ_CONTEST_KM);
        var committed = (_coaExec && _coaExec.commit_unit_count) || 0;
        var activeSide = (_coaExec && _coaExec.side) || 'RED';
        var unitsMissing = committed > 0 ? Math.max(0, committed - _sideUnitCount(activeSide)) : 0;
        var redAbilityToContest = redTotal > 0;
        var blueAbilityToContinue = blueTotal > 0;
        var control, _captureGateReason = null;
        if (!obj) control = (redTotal > 0 && blueTotal > 0) ? 'contested' : (blueTotal > 0 ? 'blue' : (redTotal > 0 ? 'red' : 'uncontrolled'));
        else if (bluePresence > 0 && redContest === 0) control = 'blue';
        else if (redControl > 0 && blueContest === 0) {
            // RMOOZ-COA-REALISM-GATE-A: block RED capture when movement feasibility is not proven.
            var _capGate = _getCoaRealismGate();
            var _capGateResult = _capGate ? _capGate.gateObjectiveCapture('RED', null, _movementValidationLog) : null;
            if (_capGateResult && !_capGateResult.capture_valid) {
                control = 'contested';
                _captureGateReason = _capGateResult.reason;
                try { _appendToEventLog('GATE: RED objective capture blocked — ' + esc(_capGateResult.reason)); } catch (_ig) {}
                try { _recordDecision({ role: 'white', action: 'capture_gate_block', called_llm: false, source: 'coa-realism-gate', reason: _capGateResult.reason, result_summary: 'RED capture → contested (movement feasibility not proven)' }); } catch (_ig) {}
            } else {
                control = 'red';
            }
        }
        else if ((bluePresence > 0 || blueContest > 0) && (redControl > 0 || redContest > 0)) control = 'contested';
        else control = 'uncontrolled';
        // backward-compatible fields (AA/AB consumers + _redReaction + end conditions read these)
        var objectiveReached = obj ? (bluePresence > 0) : (blueTotal > 0);
        var objectiveContested = (control === 'contested');
        var blueSuccess = (control === 'blue') && blueTotal > 0;
        var redActive = redAbilityToContest;
        var blueUnable = blueTotal === 0;
        var redUnable = redTotal === 0;
        var shouldContinue = !(blueSuccess || blueUnable || redUnable);
        var replanRequired = shouldContinue && (control === 'contested' || !objectiveReached);
        var summary = control === 'blue' ? 'Objective controlled by Blue — Red cannot contest.'
            : control === 'red' ? 'Objective controlled by Red.'
            : control === 'contested' ? ('Objective contested — ' + bluePresence + ' Blue inside / ' + redContest + ' Red contesting.')
            : (obj ? 'Objective uncontrolled — no side inside the objective radius.' : 'No objective placed — adjudicating force status only.');
        return { objective: obj || null,
            // AC area-based control
            objective_control: control, blue_presence: bluePresence, red_contest: redContest, red_control: redControl, blue_contest: blueContest,
            red_ability_to_contest: redAbilityToContest, blue_ability_to_continue: blueAbilityToContinue,
            objective_radius_km: OBJ_CONTROL_KM, contest_radius_km: OBJ_CONTEST_KM,
            // backward-compatible
            objective_reached: objectiveReached, objective_contested: objectiveContested,
            blue_success: blueSuccess, red_active: redActive, blue_total: blueTotal, red_total: redTotal,
            blue_near_obj: bluePresence, red_near_obj: redContest, units_missing: unitsMissing,
            blue_unable: blueUnable, red_unable: redUnable, should_continue: shouldContinue,
            replan_required: replanRequired,
            replan_reason: replanRequired ? (control === 'contested' ? 'Objective contested by Red — Blue needs new orders.' : 'Objective not secured — Blue needs new orders.') : null,
            reason: summary, summary: summary, captureGateReason: _captureGateReason };
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
    // RMOOZ-AI-FREE-FIGHT-BLUE-REACTION-A: centroid (lon/lat avg) of a unit set, or null if none has coords.
    function _centroidLL(units) {
        var sx = 0, sy = 0, n = 0;
        arr(units).forEach(function (u) { var la = num(u.lat), lo = num(u.lon); if (isFinite(la) && isFinite(lo)) { sx += lo; sy += la; n++; } });
        return n ? { lat: round5(sy / n), lon: round5(sx / n) } : null;
    }
    // ── COA_ACTION_BUDGET_AND_ROLE_GATE ───────────────────────────────────────
    // A normal attack/reaction phase must MOVE only a realistic SUBSET of the present
    // force — never all of it. The per-turn deterministic maneuvers below previously
    // ordered EVERY present unit to move each turn (red.forEach / blue.map), which is
    // why a continuous run showed movedTasked ≈ 65/77. _selectMovers picks the budget.
    var COA_RED_MOVE_FRACTION = 0.13, COA_RED_MOVE_MIN = 3, COA_RED_MOVE_MAX = 12;   // 77 RED → ~10
    var COA_BLUE_MOVE_FRACTION = 0.12, COA_BLUE_MOVE_MIN = 2, COA_BLUE_MOVE_MAX = 6;  // reaction → 2–6
    // Hold-role gate: units that must NOT move as an assault/reaction element (air defense,
    // bases, logistics/support/admin, radar, C2/HQ) unless explicitly repositioning.
    function _moverHoldRole(u) {
        var r = String((u && (u.role || u.domain || u.class || u.type)) || '').toLowerCase();
        return /air[_ -]?def|\bsam\b|missile.?def|\bbase\b|logist|\bsupport\b|admin|depot|\bradar\b|\bc2\b|head.?quarter|\bhq\b/.test(r);
    }
    // Pick the realistic MOVE subset for one phase: drop hold-role units, then take the
    // NEAREST `budget` to the focal point (objective/intercept). budget = clamp(round(taskable
    // * fraction), min, max). The rest HOLD. → { movers, held, considered, taskable, maxAllowed }.
    function _selectMovers(units, focal, opts) {
        opts = opts || {};
        var all = arr(units).filter(function (u) { return u && u.id != null; });
        var eligible = all.filter(function (u) { return !_moverHoldRole(u); });
        var pool = eligible.length ? eligible : all;   // never freeze the fight if EVERY unit is hold-role
        var budget = Math.max(opts.min || 1, Math.min(opts.max || 12, Math.round(pool.length * (opts.fraction || 0.15))));
        var sorted = pool.slice();
        if (focal && Number.isFinite(+focal.lat) && Number.isFinite(+focal.lon)) {
            sorted.sort(function (a, b) {
                var da = (a.lat - focal.lat) * (a.lat - focal.lat) + (a.lon - focal.lon) * (a.lon - focal.lon);
                var db = (b.lat - focal.lat) * (b.lat - focal.lat) + (b.lon - focal.lon) * (b.lon - focal.lon);
                return da - db;
            });
        }
        var movers = sorted.slice(0, budget);
        var moverIds = {}; movers.forEach(function (u) { moverIds[String(u.id)] = 1; });
        var held = all.filter(function (u) { return !moverIds[String(u.id)]; });
        return { movers: movers, held: held, considered: all.length, taskable: pool.length, maxAllowed: budget };
    }
    function _autoDirectorBuildCoa(outcome) {
        var obj = getObjective();
        var blueAll = _taskableSideUnits('BLUE');   // AE: only taskable units receive movement orders
        if (!blueAll.length) return null;                       // nothing to order (all blocked / none present)
        var posture, title;
        if (!obj) { posture = 'consolidate'; title = 'Consolidate (no objective)'; }
        else if (outcome.blue_total > 0 && outcome.blue_total < outcome.units_missing) { posture = 'consolidate'; title = 'Consolidate / hold (Blue weak)'; }
        else if (outcome.objective_contested && outcome.objective_reached) { posture = 'hold_screen'; title = 'Hold & screen the objective'; }
        else if (outcome.objective_contested) { posture = 'secure'; title = 'Secure the objective'; }
        else if (!outcome.objective_reached) { posture = 'advance'; title = 'Continue the advance'; }
        else { posture = 'consolidate'; title = 'Consolidate on the objective'; }
        // RMOOZ-AI-FREE-FIGHT-BLUE-REACTION-A: in a fighting posture with RED present, center BLUE's
        // formation on an INTERCEPT point on RED's LIVE axis (between Objective X and RED's centroid —
        // RED already maneuvered this turn) so BLUE genuinely REACTS to RED instead of holding a generic
        // objective ring. Deterministic (no LLM); falls back to the objective ring when there is no RED /
        // no objective (behaviour unchanged). The single committed order IS the reaction — no double-move.
        var _redC = _centroidLL(_scenarioSideUnits('RED'));
        var _reactive = !!(obj && _redC && (posture === 'advance' || posture === 'secure' || posture === 'hold_screen'));
        var _intercept = _reactive ? interceptPoint(_redC, obj) : null;
        var _ringCenter = _intercept || obj;
        // RMOOZ-AUTO-SCENARIO-FORMATION-REALISM-AC: assign DETERMINISTIC ring positions (per unit index)
        // instead of the exact objective coordinate, so units never stack. Last unit holds back as support;
        // hold_screen spreads onto the support ring; consolidate/weak holds in place.
        // COA_ACTION_BUDGET_AND_ROLE_GATE: a reaction MOVES only the nearest suitable subset to the
        // intercept/objective — never all BLUE. The rest hold (omitted from the order = no move).
        var _blueSel = _selectMovers(blueAll, _ringCenter, { fraction: COA_BLUE_MOVE_FRACTION, min: COA_BLUE_MOVE_MIN, max: COA_BLUE_MOVE_MAX });
        var _movers = (posture === 'consolidate') ? [] : _blueSel.movers;
        var rings = [];
        var actions;
        if (!_movers.length) {
            // consolidate / weak: hold a single small element in place (no advance).
            actions = [{ unit_uid: (blueAll[0] && blueAll[0].id), action_type: 'HOLD_POSITION', role: 'reserve' }];
            rings.push('hold');
        } else {
            // BLUE is the defender: selected movers intercept/block the RED axis; the trailing mover reinforces.
            actions = _movers.map(function (u, i) {
                var isSupport = (_movers.length > 1 && i === _movers.length - 1);
                var tgt = isSupport ? _supportRing(_ringCenter, i) : _blockingRing(_ringCenter, i);
                rings.push(isSupport ? 'reinforce' : 'intercept');
                return { unit_uid: u.id, action_type: 'MOVE', role: (isSupport ? 'reinforce' : 'intercept'), target: tgt };   // capped + teleport-guarded at execution
            });
        }
        // RMOOZ-REAL-COA-COMMANDER-QUALITY-AD: carry the commander structure so the auto order is
        // commander-quality (passes the quality gate), not a shallow move-to-objective order.
        var assaultIds = _movers.filter(function (u, i) { return !(_movers.length > 1 && i === _movers.length - 1); }).map(function (u) { return u.id; });
        var supIds = (_movers.length > 1) ? [_movers[_movers.length - 1].id] : [];
        var _moveCount = actions.filter(function (a) { return a.action_type === 'MOVE'; }).length;
        return { plan_id: 'AUTO-T' + (_scenario ? _scenario.scenario_turn : 1), title: title + (_intercept ? ' — intercept RED axis' : ''), side: 'BLUE',
            recommended: true, risk: 'low', confidence: 'medium', source_type: 'staff_safe_auto_director', posture: posture,
            commander_intent: (_intercept
                ? 'React to RED: intercept the RED approach axis and defend Objective X against RED assault.'
                : (posture === 'advance' ? 'Advance to intercept the RED axis and defend Objective X.' : posture === 'secure' ? 'Secure Objective X; screen the RED approach; hold against RED assault.' : posture === 'hold_screen' ? 'Hold Objective X and screen the NE approaches against RED.' : 'Consolidate and preserve the defensive force.')),
            main_effort: 'Intercept element (' + (assaultIds.join(', ') || '—') + ') blocks the RED approach axis.',
            supporting_effort: supIds.length ? ('Reinforce / screen (' + supIds.join(', ') + ').') : 'Force consolidates (small element).',
            red_assumption: 'RED attacks toward Objective X from the NE sector.',
            risk_mitigation: 'Support-by-fire overwatch + screened flank; deterministic capped movement.',
            expected_enemy_reaction: ['Red counters toward the objective'],
            formation_rings: rings, phases: [{ name: title, actions: actions }],
            _budget: { considered: _blueSel.considered, taskable: _blueSel.taskable, selected: _moveCount, max_allowed: _blueSel.maxAllowed, held: _blueSel.considered - _moveCount },
            _reaction: _intercept ? { intercept: _intercept, red_centroid: _redC, move_count: _moveCount } : null };
    }
    function _autoDirectorNextBlueOrder(outcome) {
        // RMOOZ-FREE-FIGHT-CONTINUITY: specific, operator-visible failure codes (no silent stop).
        if (!_taskableSideUnits('BLUE').length) return { ok: false, code: 'no_taskable_blue_units', reason: 'No taskable BLUE units available for a reaction.' };
        if (!getObjective()) return { ok: false, code: 'invalid_objective', reason: 'No valid objective set — BLUE cannot orient a reaction.' };
        var coa = _autoDirectorBuildCoa(outcome);
        if (!coa || !arr(coa.phases[0].actions).length) return { ok: false, code: 'no_safe_blue_order', reason: 'No safe deterministic BLUE order available — operator decision needed.' };
        coa._quality = _coaQualityGate(coa);   // AD: grade the auto order (role-separated → passes)
        // a deterministic, honestly-labelled Staff-Safe plan (NOT an LLM plan, never hits /plan-coas)
        _coaPlan = { ok: true, plan_source: 'deterministic', planning_mode: 'staff_safe', recommended_plan_id: coa.plan_id,
            source: { type: 'staff_safe_auto_director' }, _requestedVia: 'auto_director', coas: [coa] };
        _coaPlan._coa_quality = { verdict: coa._quality.pass ? 'pass' : 'fallback', score: coa._quality.score, reasons: coa._quality.reasons };
        try { _recordQualityGate(_coaPlan._coa_quality.verdict, _coaPlan._coa_quality.score, _coaPlan._coa_quality.reasons); } catch (_) {}
        _coaSelectedIdx = 0;
        var ex = _commitCoa(0);   // builds _coaExec (pending) — deterministic, no LLM, no /plan-coas
        if (!ex) return { ok: false, code: 'blocked_replan', reason: 'Auto-director order could not be committed (replan blocked) — operator decision needed.' };
        var ringsLabel = (function () { var seen = {}, out = []; arr(coa.formation_rings).forEach(function (r) { if (!seen[r]) { seen[r] = 1; out.push(r); } }); return out.join('/') || coa.posture; })();
        if (_scenario) _scenario.last_formation_order = 'Blue ' + coa.posture + ' → ' + ringsLabel + (ringsLabel === 'hold' ? '' : ' ring');
        try { _recordDecision({ role: 'performance', action: 'formation_assignment', called_llm: false, source: 'staff_safe_auto_director',
            reason: 'Blue ' + coa.posture + ' formation', result_summary: 'Blue → ' + ringsLabel + ' positions (' + arr(coa.phases[0].actions).length + ' units)' }); } catch (_) {}
        try { _appendToEventLog('BLUE DEFENSE COA generated to defend Objective X — ' + esc(ringsLabel) + ' formation (turn ' + (_scenario ? _scenario.scenario_turn : '?') + ').'); } catch (_) {}
        return { ok: true, coa_id: coa.plan_id, posture: coa.posture, rings: ringsLabel, source: 'staff_safe_auto_director', reaction: coa._reaction || null, budget: coa._budget || null };
    }
    // Deterministic Red maneuver — actually MOVES Red units through the SAME safe/teleport-guarded path
    // as Blue (_resolveCoaMoves → _writeMoveFrame). NO LLM. Returns {posture, moved, summary}.
    function _redManeuverOrder(outcome) {
        var posture = _redReaction(outcome).posture;
        var obj = getObjective();
        var red = _scenarioSideUnits('RED');
        // RMOOZ-AUTO-SCENARIO-FORMATION-REALISM-AC: Red moves to a RING (blocking/screen), never the exact
        // objective center. counter/block → blocking ring; withdraw → away; hold/none → keep current posture.
        // COA_ACTION_BUDGET_AND_ROLE_GATE: only a realistic SUBSET maneuvers per turn (the nearest units to
        // the objective), role-gated — NOT the whole present force every turn (the old red.forEach moved all).
        var actions = [], ring = null, sel = null;
        if ((posture === 'counter' || posture === 'block') && obj) {
            ring = 'blocking';
            sel = _selectMovers(red, obj, { fraction: COA_RED_MOVE_FRACTION, min: COA_RED_MOVE_MIN, max: COA_RED_MOVE_MAX });
            sel.movers.forEach(function (u, i) { actions.push({ unit_uid: u.id, action_type: 'MOVE', role: posture, target: _blockingRing(obj, i) }); });
        } else if (posture === 'withdraw' && obj) {
            ring = 'reserve';
            sel = _selectMovers(red, obj, { fraction: COA_RED_MOVE_FRACTION, min: COA_RED_MOVE_MIN, max: COA_RED_MOVE_MAX });
            sel.movers.forEach(function (u) {
                var dLat = (u.lat - obj.lat), dLon = (u.lon - obj.lon);
                var mag = Math.sqrt(dLat * dLat + dLon * dLon) || 1;
                actions.push({ unit_uid: u.id, action_type: 'MOVE', role: 'withdraw', target: { lat: u.lat + (dLat / mag) * 0.2, lon: u.lon + (dLon / mag) * 0.2 } });
            });
        } // hold / none → keep current defensive posture (no move)
        var moved = 0, firstTarget = actions.length ? actions[0].target : null;
        if (actions.length) {
            var redCoa = { plan_id: 'RED-AUTO-T' + (_scenario ? _scenario.scenario_turn : 1), side: 'RED', phases: [{ name: posture, actions: actions }] };
            var moves = _resolveCoaMoves(redCoa).filter(function (m) { return !m.hold; });   // capped + teleport-guarded
            _writeMoveFrame(moves, 1);                                                        // apply the safe move
            moved = moves.length;
            if (moved && mapReady()) { try { _triggerScenarioRedraw(); syncMarkers(); } catch (_) {} }
        }
        var ringTxt = ring ? (' → ' + ring + ' ring') : '';
        var _considered = red.length, _selected = sel ? sel.movers.length : 0, _maxAllowed = sel ? sel.maxAllowed : 0, _held = sel ? sel.held.length : red.length;
        try { _appendToEventLog('RED ATTACK COA — ' + posture + ringTxt + (moved ? ', moved ' + moved + '/' + _considered + ' unit(s) toward Objective X' : ', held position') + ' (turn ' + (_scenario ? _scenario.scenario_turn : '?') + ').'); } catch (_) {}
        return { posture: posture, moved: moved, ring: ring, target: firstTarget,
            considered: _considered, selected: _selected, max_allowed: _maxAllowed, held: _held,
            summary: 'Red ' + posture + ringTxt + (moved ? ' — moved ' + moved + '/' + _considered + ' (budget ' + _maxAllowed + ', ' + _held + ' hold)' : ' — held') + ' (deterministic, no LLM)' };
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
    // RMOOZ-FREE-FIGHT-CONTINUITY: commit the deterministic auto-director BLUE order and continue. Shared by
    // the Auto-Continue turn loop AND the operator "Continue (BLUE Reaction)" button. On success → status
    // running + BLUE_REACTION + BLUE_REACTION_AUTO_COMMITTED; on failure → blocked + the exact code/reason.
    function _commitAutoBlueOrder(outcome) {
        var blue = _autoDirectorNextBlueOrder(outcome);
        if (blue.ok) {
            _scenario.last_auto_order_source = blue.source;
            _scenario.scenario_status = 'running'; _scenario.current_actor = 'unit-controller';
            _scenario.pending_replan_reason = null; _scenario.updated_at = _nowISO();
            try { _recordDecision({ role: 'performance', action: 'auto_director_next_blue_order', called_llm: false, source: 'staff_safe_auto_director', reason: 'deterministic next Blue order (' + blue.posture + ')', result_summary: blue.coa_id + ' · ' + blue.posture }); } catch (_) {}
            try { _appendToEventLog('BLUE_REACTION_AUTO_COMMITTED (turn ' + _scenario.scenario_turn + '): Staff-Safe Blue order (' + esc(blue.posture) + ') committed — scenario continues, no AI.'); } catch (_) {}
            if (blue.reaction && blue.reaction.intercept) {
                var _bb = blue.budget || {};
                try { _recordDecision({ role: 'blue', action: 'BLUE_REACTION', called_llm: false, source: 'staff_safe_auto_director',
                    reason: 'intercept RED axis (deterministic, no LLM) — nearest ' + blue.reaction.move_count + ' of ' + (_bb.considered != null ? _bb.considered : '?') + ' BLUE (budget ' + (_bb.max_allowed != null ? _bb.max_allowed : '?') + ')',
                    result_summary: blue.reaction.move_count + ' unit(s) -> intercept RED axis @ ' + Number(blue.reaction.intercept.lat).toFixed(2) + ',' + Number(blue.reaction.intercept.lon).toFixed(2) + (_bb.held != null ? ' · ' + _bb.held + ' hold' : '') }); } catch (_) {}
                try { _appendToEventLog('BLUE REACTION (turn ' + _scenario.scenario_turn + '): ' + blue.reaction.move_count + ' unit(s) (of ' + (_bb.considered != null ? _bb.considered : '?') + ' considered, budget ' + (_bb.max_allowed != null ? _bb.max_allowed : '?') + ', ' + (_bb.held != null ? _bb.held : '?') + ' hold) ordered to intercept the RED axis (commits + executes next tick).'); } catch (_) {}
            }
            if (!_scenarioTimer) _startScenarioTimer();   // keep the fight ticking
        } else {
            _scenario.scenario_status = 'blocked'; _scenario.pending_replan_reason = (blue.code ? '[' + blue.code + '] ' : '') + blue.reason;
            _scenario.current_actor = 'blue'; _scenario.updated_at = _nowISO();
            _stopScenarioTimer();
            try { _appendToEventLog('Auto Director could not continue (turn ' + _scenario.scenario_turn + '): ' + esc(blue.code || 'no_safe_blue_order') + ' — ' + esc(blue.reason)); } catch (_) {}
        }
        return blue;
    }
    // Operator "Continue (BLUE Reaction)" — force one deterministic BLUE reaction + continue from a manual
    // pause, WITHOUT permanently enabling Auto-Continue. Returns { ok, code?, reason? }.
    function _continueWithBlueReaction() {
        if (!_scenarioActive()) return { ok: false, code: 'no_active_scenario', reason: 'No active scenario.' };
        if (_scenario.scenario_status !== 'paused' && _scenario.scenario_status !== 'blocked') return { ok: false, code: 'not_paused', reason: 'Scenario is not paused.' };
        var blue = _commitAutoBlueOrder(_whiteScenarioOutcome());
        updatePanel();
        return blue.ok ? { ok: true, posture: blue.posture, reaction: blue.reaction || null } : { ok: false, code: blue.code || 'no_safe_blue_order', reason: blue.reason };
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
        // 1) White adjudication (deterministic) — AREA-based objective control (AC)
        _scenario.current_actor = 'white';
        var outcome = _whiteScenarioOutcome();
        _scenario.last_outcome = outcome.summary;
        _scenario.objective_control = outcome.objective_control;   // AC: Blue / Red / Contested / Uncontrolled
        _scenario.blue_presence = outcome.blue_presence;
        _scenario.red_contest = outcome.red_contest;
        // RMOOZ-AI-FREE-FIGHT-EVENT-MILESTONES-A: per-turn White adjudication, named milestone.
        try { _recordDecision({ role: 'white', action: 'scenario_outcome_check', called_llm: false, source: 'scenario',
            reason: outcome.reason, result_summary: 'turn ' + _scenario.scenario_turn + ' · ' + outcome.summary + ' · contested ' + outcome.objective_contested }); } catch (_) {}
        try { _recordDecision({ role: 'white', action: 'WHITE_ADJUDICATION', called_llm: false, source: 'scenario',
            reason: outcome.reason, result_summary: 'turn ' + _scenario.scenario_turn + ' · ' + outcome.summary + ' · contested ' + outcome.objective_contested }); } catch (_) {}
        try { _recordDecision({ role: 'white', action: 'objective_control_check', called_llm: false, source: 'scenario',
            reason: 'area-based control (obj ' + outcome.objective_radius_km + 'km / contest ' + outcome.contest_radius_km + 'km)',
            result_summary: 'control ' + outcome.objective_control + ' · blue ' + outcome.blue_presence + ' inside · red ' + outcome.red_contest + ' contesting' }); } catch (_) {}
        try { _appendToEventLog('White: objective ' + esc(outcome.objective_control) + (outcome.objective_control === 'contested' ? ' by ' + outcome.red_contest + ' Red unit(s)' : '') + ' (turn ' + _scenario.scenario_turn + ', deterministic, no AI).'); } catch (_) {}
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
        // AC: record the Red maneuver WITH its formation target (ring), not just a log line.
        try { _recordDecision({ role: 'red', action: 'red_maneuver_order', called_llm: false, source: 'scenario', reason: red.reason,
            result_summary: maneuver.summary + (maneuver.ring ? ' · target ' + maneuver.ring + ' ring' : '') }); } catch (_) {}
        try { _appendToEventLog('Red maneuver (turn ' + _scenario.scenario_turn + '): ' + (maneuver.ring ? esc(maneuver.ring) + ' ring around objective' : esc(maneuver.posture)) + ' — considered ' + maneuver.considered + ', selected ' + maneuver.selected + '/' + (maneuver.max_allowed || 0) + ' (budget), moved ' + maneuver.moved + ', held ' + maneuver.held + '.'); } catch (_) {}
        _scenario.blue_cycle++; _scenario.red_cycle++;
        _scenario.scenario_turn++;
        // 4) next Blue order
        if (auto) {
            // Auto-Continue: the director MUST generate + commit the next BLUE reaction and continue
            // (it only blocks on a specific failure — no_taskable_blue_units / invalid_objective /
            // no_safe_blue_order / blocked_replan — surfaced with its exact code).
            _commitAutoBlueOrder(outcome);
        } else {
            // Manual: pause for the operator. Named BLUE_ORDER_REQUIRED ledger event + a clear next action
            // ("Continue (BLUE Reaction)" button / enable Auto-Continue). NOT a dead-end, NOT a block.
            _scenario.scenario_status = 'paused';
            _scenario.pending_replan_reason = outcome.replan_reason || 'Scenario continues — Blue needs new orders for the next turn.';
            _scenario.current_actor = 'blue'; _scenario.updated_at = _nowISO();
            _stopScenarioTimer();
            try { _recordDecision({ role: 'blue', action: 'BLUE_ORDER_REQUIRED', called_llm: false, source: 'scenario',
                reason: _scenario.pending_replan_reason, result_summary: 'turn ' + _scenario.scenario_turn + ' · manual pause · operator: Continue (BLUE Reaction) or enable Auto-Continue' }); } catch (_) {}
            try { _appendToEventLog('BLUE_ORDER_REQUIRED (turn ' + _scenario.scenario_turn + '): ' + esc(_scenario.pending_replan_reason) + ' — press “Continue (BLUE Reaction)” or enable Auto-Continue.'); } catch (_) {}
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
        // RMOOZ-STEP1-COA-PREPARATION-GATE-AE: refuse to start a scenario whose committed COA tasks a
        // non-taskable Step-1 (review-only) unit with movement.
        if (_coaExec.phase_status !== 'complete') {
            var _s1b = _coaTasksBlockedUnit(_coaExec.selected_coa);
            if (_s1b) {
                _coaExec.run_blocked_reason = 'Blocked: committed COA tasks Step-1 review-only unit ' + _s1b + ' (not taskable). Complete source/doctrine/commander review, or recommit without it.';
                try { _appendToEventLog('Run Scenario blocked — committed COA tasks non-taskable Step-1 unit ' + esc(_s1b) + '. Review required.'); } catch (_) {}
                try { _recordDecision({ role: 'white', action: 'step1_coa_preparation_gate', called_llm: false, source: 'run-gate', reason: 'non-taskable unit tasked', result_summary: 'scenario run blocked · ' + _s1b }); } catch (_) {}
                updatePanel(); return _scenario || null;
            }
        }
        // RMOOZ-COA-QUALITY-HARD-ENFORCEMENT-AE: refuse to run a non-commander-quality committed COA
        // (e.g. a stale restored center-stacking exec) — require a repaired/template recommit first.
        if (_coaExec.phase_status !== 'complete') {
            var _b = _coaHardBlockReason(_coaExec.selected_coa);
            if (_b) {
                _coaExec.run_blocked_reason = 'Blocked: selected COA is not commander-quality (' + _b + '). Recommit a repaired/template COA.';
                try { _appendToEventLog('Run Scenario blocked — committed COA is not commander-quality (' + esc(_b) + '). Recommit a repaired/template COA.'); } catch (_) {}
                try { _recordDecision({ role: 'performance', action: 'coa_quality_gate', called_llm: false, source: 'run-enforcement', reason: 'blocked low-quality committed COA', result_summary: 'scenario run blocked · ' + _b }); } catch (_) {}
                updatePanel(); return _scenario || null;
            }
            _coaExec.run_blocked_reason = null;
        }
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
    function _resetScenario() { _stopScenarioTimer(); _scenario = null; _step1HeldUids = {}; _missionRoleContract = null; _coaLoading = false; _missingUnitRecords = []; _heldMovementRecords = []; _domainBlockedRecords = []; _movedMovementRecords = []; }
    // ── operator-card stale-commit guard (consumed by the Scenario Control Center engine facade) ────────
    // RMOOZ-FREE-FIGHT-V2-COA-TO-SCENARIO-BUGFIX-AB1: is the committed COA STALE relative to what the
    // operator is now looking at? True when (a) a DIFFERENT (newer) plan object is loaded than the one we
    // committed from — e.g. a fresh Generate or a leftover/restored commit — or (b) the selected COA has
    // moved off the committed one. A restored commit with NO current plan is NOT stale (operator resumes it).
    function _coaCommitIsStale() {
        if (!_coaExec || !_coaExec.active) return false;
        if (!(_coaPlan && _coaPlan.ok && Array.isArray(_coaPlan.coas) && _coaPlan.coas.length)) return false;
        if (_committedPlanObj !== _coaPlan) return true;                       // a newer plan supersedes the commit
        var coas = _coaPlan.coas;
        if (_coaSelectedIdx >= 0 && _coaSelectedIdx < coas.length) {
            var selId = (coas[_coaSelectedIdx] && coas[_coaSelectedIdx].plan_id) || ('COA-' + (_coaSelectedIdx + 1));
            if (_coaExec.selected_coa_id !== selId) return true;              // selection moved off the committed COA
        }
        return false;
    }
    // RMOOZ-SCENARIO-CONTROL-CENTER-REBUILD-AF/AG: the old Free Fight control window — its cockpit, state
    // machine, tab shell, COA-card / planning-trace / commit-exec / operator-strip / Green-tab / White-tab
    // renderers, and the right-side reasoning panel builder — was PHYSICALLY DELETED (AG). The operator card
    // is now client/shell/scenario-control-center.js (window.RmoozScenarioControlCenter). The engine helpers
    // (taskability, COA quality, commit/exec, continuous scenario, Green/White, decision log) are unchanged.

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

    // ════════════════════════════════════════════════════════════════════════════════════════════════
    // RMOOZ-SCENARIO-CONTROL-CENTER-REBUILD-AF — ENGINE FACADE.
    // The new operator UI (client/shell/scenario-control-center.js, window.RmoozScenarioControlCenter) is a
    // hard replacement for the old Free Fight control window. It owns ALL operator UI/flow and drives the
    // engine ONLY through this facade — it never reaches into the old renderers. The engine (taskability,
    // quality gate, /plan-coas generate, COA commit/exec, continuous scenario, Green/White, decision log)
    // is UNCHANGED; this object just exposes the seams the new UI reads/calls.
    // ════════════════════════════════════════════════════════════════════════════════════════════════
    function _sccActionTargets(coa) {
        var obj = getObjective();
        var coaSide = String((coa && coa.side) || '').toUpperCase();
        return _coaAllActions(coa).map(function (a) {
            var t = a && a.target;
            var hasT = !!(t && Number.isFinite(+t.lat) && Number.isFinite(+t.lon));
            var taskable = a && a.unit_uid ? _isUnitTaskable(a.unit_uid) : true;
            var kmFromObj = (hasT && obj) ? Math.round(_kmBetween({ lat: +t.lat, lon: +t.lon }, { lat: obj.lat, lon: obj.lon }) * 10) / 10 : null;
            var r = _normRole(a && a.role) || '';
            // RMOOZ-SIDE-ROLE-A: target_type is side-aware — RED gets attack/recon/support labels; BLUE gets defend/intercept/screen.
            var targetType = (function () {
                if (a && a.action_type === 'HOLD_POSITION') return 'hold';
                if (!hasT) return 'none';
                if (coaSide === 'RED') return /assault|attack/.test(r) ? 'attack' : /support/.test(r) ? 'support' : /recon/.test(r) ? 'recon' : /screen|flank/.test(r) ? 'screen' : 'attack';
                if (coaSide === 'BLUE') return /defend/.test(r) ? 'defend' : /intercept/.test(r) ? 'intercept' : /screen/.test(r) ? 'screen' : /recon|observe/.test(r) ? 'observe' : /reinforce/.test(r) ? 'reinforce' : 'defend';
                return (t && t.type) || 'point';
            })();
            return {
                unit_uid: (a && a.unit_uid) || '—',
                role: r || '—',
                action: (a && a.action_type) || '—',
                target_type: targetType,
                target_lat: hasT ? +(+t.lat).toFixed(4) : null,
                target_lon: hasT ? +(+t.lon).toFixed(4) : null,
                km_from_objective: kmFromObj,
                reason: (a && (a.reason || a.why_unit)) || '',
                roe_status: (a && a.action_type === 'HOLD_POSITION') ? 'hold-only' : (taskable ? 'permitted' : 'review-required'),
                taskable: !!taskable,
            };
        });
    }
    var _engine = {
        // ── state inputs (one source of truth — raw engine state) ──
        objective: function () { return getObjective(); },
        placeObjective: function () { try { armPlaceObjective(); } catch (_) {} },
        clearObjectiveX: function () { try { clearObjective(); } catch (_) {} },
        isLoading: function () { return !!_coaLoading; },
        coaPlan: function () { return _coaPlan; },
        selectedIdx: function () { return _coaSelectedIdx; },
        selectCoa: function (i) {
            var _prevSel = _coaSelectedIdx; _coaSelectedIdx = i;
            // RMOOZ-AI-FREE-FIGHT-EVENT-MILESTONES-A: named COA_SELECTED milestone (operator action; once per change).
            if (i !== _prevSel) { try { var _selCoa = arr(_coaPlan && _coaPlan.coas)[i]; _recordDecision({ role: 'operator', action: 'COA_SELECTED', called_llm: false, source: 'operator-ui', result_summary: 'COA index ' + i + (_selCoa ? (' · ' + (_selCoa.plan_id || _selCoa.title || '')) : '') }); } catch (_) {} }
            updatePanel(); return _coaSelectedIdx;
        },
        repaint: function () { updatePanel(); },
        recommendedIdx: function () { try { return _pickRecommendedIdx(_coaPlan); } catch (_) { return 0; } },
        committedExec: function () { return _coaExec; },
        committedIsStale: function () { try { return _coaCommitIsStale(); } catch (_) { return false; } },
        scenarioRuntime: function () { return _scenario; },
        scenarioActive: function () { try { return _scenarioActive(); } catch (_) { return false; } },
        commitBlockedReason: function () { return _coaCommitBlockedReason; },
        // ── readiness / Step-1 gate (Panel 1) ──
        readiness: function () {
            var rep = _step1PreparationReport();
            var w = W(); var sc = w && w.RmoozScenario && w.RmoozScenario.scenario;
            var ctx = _taskabilityCtx();
            return {
                scenario_name: (sc && (sc.name || sc.title || sc.id)) || 'No scenario loaded',
                objective_set: !!getObjective(),
                units_loaded: rep.units_loaded, taskable: rep.taskable, blocked: rep.blocked,
                blocked_by_missing_source: rep.blocked_by_missing_source,
                blocked_by_missing_coordinates: rep.blocked_by_missing_coordinates,
                blocked_by_missing_doctrine: rep.blocked_by_missing_doctrine,
                blocked_by_commander_review: rep.blocked_by_commander_review,
                blocked_units: rep.blocked_units, taskable_units: rep.taskable_units,
                executable: rep.executable, message: rep.message,
                source_status: rep.blocked_by_missing_source > 0 ? 'review required' : (rep.units_loaded ? 'sourced' : 'none'),
                doctrine_status: ctx.doctrine_required ? (ctx.doctrine_ok ? 'applied' : 'upload required') : 'not required',
                commander_review_status: ctx.commander_review_required ? (ctx.commander_approved ? 'approved' : 'pending') : 'not required',
                data_reliability: !rep.units_loaded ? 'none' : (rep.blocked > 0 ? (rep.executable ? 'partial' : 'review-only') : 'operational'),
                // RMOOZ-SCC-STEP1-TRAINING-APPROVAL-AK: training-simulation posture for Panel 1.
                training_approved: rep.training_approved === true,
                training_eligible: rep.training_eligible || 0,
                simulation_taskable: rep.simulation_taskable || 0,
                simulation_only: rep.simulation_only === true,
            };
        },
        // ── RMOOZ-SCC-STEP1-TRAINING-APPROVAL-AK: explicit operator training-simulation approval ──
        trainingApproved: function () { return _trainingApproved === true; },
        simulationOnly: function () { try { return _isSimulationOnly(); } catch (_) { return false; } },
        approveTrainingSimulation: function () { _approveTrainingSimulation(); },
        clearTrainingApproval: function () { _clearTrainingApproval(); },
        // ── COA preparation (Panel 2) — Step-1 + taskability + quality requirements then generate ──
        // Generate immediately when readiness is already confirmed. If health/model state is pending or
        // blocked, re-probe once before generating so the operator is not trapped behind stale readiness.
        prepareCoa: function () {
            setPlanningMode('commander'); _resetScenario();
            try {
                var _prep = _step1PreparationReport();
                if (_prep && !_prep.executable) { _generateCoaPlan(); return; }
            } catch (_) {}
            try { if (_freeFightAiReady().ok) { _generateCoaPlan(); return; } } catch (_) {}
            _probeRouteHealth().then(function () { _generateCoaPlan(); }).catch(function () { _generateCoaPlan(); });
        },
        // RMOOZ-PREPARE-COA-PRODUCT-FLOW-A: smart prepare — tries AI, falls back to Staff-Safe
        // immediately if AI is not ready. The result is badged honestly (plan_source=llm vs
        // staff_safe_commander_template) — no silent rebranding.
        prepareCoaSmart: function () {
            try {
                var _prep = _step1PreparationReport();
                if (_prep && !_prep.executable) { setPlanningMode('commander'); _resetScenario(); _generateCoaPlan(); return; }
            } catch (_) {}
            var _ar = null; try { _ar = _freeFightAiReady(); } catch (_) {}
            if (_ar && _ar.ok) {
                setPlanningMode('commander'); _resetScenario();
                _generateCoaPlan();
            } else {
                var why = (_ar && (_ar.reason || _ar.code)) || 'AI not ready';
                try { _appendToEventLog('AI COA unavailable (' + why + ') — generating Staff-Safe COA instead.'); } catch (_) {}
                setPlanningMode('staff_safe'); _resetScenario(); _generateCoaPlan();
            }
        },
        prepareStaffSafe: function () { setPlanningMode('staff_safe'); _resetScenario(); _generateCoaPlan(); },
        // RMOOZ-AI-COA-HONESTY-A: expose AI pre-flight readiness to the SCC (Panel 2 display)
        aiReadiness: function () { try { return _freeFightAiReady(); } catch (_) { return { ok: false, code: 'error', reason: 'readiness check failed' }; } },
        // RMOOZ-PREPARE-COA-UX-UNBLOCK-A: expose model info + provider-switch helpers to Panel 2
        aiModelInfo: function () { return _modelInfo || null; },
        switchToLocalModel: function () {
            var info = _modelInfo;
            if (!info) { _fetchModels(); return; }
            var avail = (Array.isArray(info.models) ? info.models : []).filter(function (m) { return m && m.available !== false && String(m.provider || '').toLowerCase() !== 'openrouter'; });
            if (avail.length === 1) { _selectModel(avail[0].name, 'ollama'); }
            else { _fetchModels(); }  // refresh list so operator can pick
        },
        switchToOpenRouter: function () {
            var model = _modelInfo && _modelInfo.selected_model;
            if (model) _selectModel(model, 'openrouter');
        },
        // ── run / observe auto-director ──
        toggleAutoScenario: function () { return _toggleScenarioAuto(); },
        // ── COA review (Panel 3) ──
        coaQuality: function (coa) { try { return _coaQualityGate(coa); } catch (_) { return null; } },
        hardBlockReason: function (coa) { try { return _coaHardBlockReason(coa); } catch (_) { return null; } },
        tasksBlockedUnit: function (coa) { try { return _coaTasksBlockedUnit(coa); } catch (_) { return null; } },
        targetSummary: function (coa) { try { return _coaTargetSummary(coa); } catch (_) { return ''; } },
        actionTargets: function (coa) { return _sccActionTargets(coa); },
        isExecutable: function (coa) { return !_coaHardBlockReason(coa) && !_coaTasksBlockedUnit(coa); },
        isRealLlm: function (p) { try { return _isRealLlmPlan(p); } catch (_) { return false; } },
        // ── commit (Panel 4) ──
        commit: function (i) { return _commitCoa(i == null ? _coaSelectedIdx : i); },
        // ── run / observe (Panel 5) ──
        runScenario: function () { return _runScenario(); },
        // RMOOZ-PREPARE-COA-UX-UNBLOCK-A: enable auto-continue + run — so "Run Scenario" (the primary
        // button) keeps the fight going instead of pausing after every turn for manual Blue orders.
        runScenarioContinuous: function () {
            _scenarioAutoContinue = true;
            if (_scenario) _scenario.auto_continue = true;
            return _runScenario();
        },
        // Enable auto-continue without toggling (idempotent) + resume if currently paused.
        enableAutoScenario: function () {
            _scenarioAutoContinue = true;
            if (_scenario) { _scenario.auto_continue = true; }
            if (_scenario && _scenario.scenario_status === 'paused') { _runScenario(); }
            else { updatePanel(); }
        },
        runCommittedOnce: function () { return _runCommittedCoa(); },
        pauseScenario: function () { return _pauseScenario(); },
        stopScenario: function () { return _stopScenario(); },
        // RMOOZ-FREE-FIGHT-CONTINUITY: operator-exposed continuity controls (no dead-end at a manual pause).
        continueWithBlueReaction: function () { return _continueWithBlueReaction(); },
        setAutoContinue: function (v) { _scenarioAutoContinue = !!v; if (_scenario) _scenario.auto_continue = _scenarioAutoContinue;
            try { _appendToEventLog('Auto-Continue ' + (_scenarioAutoContinue ? 'ENABLED — deterministic Staff-Safe BLUE reactions each turn, no AI on normal ticks.' : 'disabled — manual orders (operator continues each turn).')); } catch (_) {}
            if (_scenarioAutoContinue && _scenario && _scenario.scenario_status === 'paused') { _runScenario(); }
            try { updatePanel(); } catch (_) {} return _scenarioAutoContinue; },
        autoContinueEnabled: function () { return _scenarioAutoContinue; },
        replan: function () { return _replanCoa(); },
        clearAll: function () { _resetScenario(); _resetCoaExec(); },
        whiteOutcome: function () { try { return _scenario ? _whiteScenarioOutcome() : null; } catch (_) { return null; } },
        greenStatus: function () { return _greenWorld; },
        runBlockedReason: function () { return _coaExec && _coaExec.run_blocked_reason; },
        // ── evidence (Panel 6) ──
        decisionLog: function () { return _decisionLog.slice(-20); },
        networkCalls: function () { return _netLog.slice(-20); },
        executedTrace: function () { return _coaMovedUnits.map(function (m) { return { uid: m.uid, from: m.oldPos, to: m.finalPos, role: m.role, action: m.action_type }; }); },
        // RMOOZ-SCC-PREPARE-COA-LIVE-AH: km-from-objective summary of the ACTUALLY-executed final positions —
        // compared against selected/committed target summaries in the Evidence target-equality proof.
        executedTargetSummary: function () {
            var obj = getObjective();
            return _coaMovedUnits.map(function (m) {
                var p = m.finalPos || m.oldPos; if (!p || !Number.isFinite(+p.lat)) return _normRole(m.role) + ':?';
                var km = obj ? _kmBetween({ lat: +p.lat, lon: +p.lon }, { lat: obj.lat, lon: obj.lon }) : 0;
                return _normRole(m.role) + ':' + (Math.round(km * 10) / 10) + 'km';
            }).join(' · ');
        },
        rawJson: function (which) {
            if (which === 'committed') return _coaExec && _coaExec.selected_coa;
            if (which === 'selected') { var c = arr(_coaPlan && _coaPlan.coas); return c[_coaSelectedIdx] || null; }
            return _coaPlan;   // 'generated' / default
        },
        objectiveControlKm: function () { return { control: OBJ_CONTROL_KM, contest: OBJ_CONTEST_KM }; },
        // RMOOZ-SCC-COA-COMMANDER-QUALITY-AI: LLM honesty/evidence — the SCC Evidence panel reads these to
        // show parse/schema/repair/fallback status truthfully (a fallback is NEVER dressed as an AI plan).
        llmEvidence: function () {
            var p = _coaPlan || {};
            var st = String(p.llm_status || '');
            var isFallback = /_fallback$/.test(st) || (!!p.fallback_reason && p.plan_source !== 'llm');
            return {
                plan_source: p.plan_source || null,
                llm_called: !!p.llm_called,
                llm_status: p.llm_status || null,
                repair_attempted: !!(p.tool_contract && p.tool_contract.repaired) || /repair/.test(String(p.fallback_reason || '')),
                fallback_used: isFallback || /deterministic|staff_safe/.test(String(p.plan_source || '')) && !!p.llm_called,
                fallback_reason: p.fallback_reason || null,
                fallback_message: p.fallback_message || null,
                raw_llm_output: p.llm_raw_response || null,
                is_real_llm: (function () { try { return _isRealLlmPlan(p); } catch (_) { return false; } })(),
            };
        },
        // RMOOZ-MOVEMENT-TRUTH-A: per-unit movement status for the debug panel in Panel 6.
        // RMOOZ-WARGAMINGGEN-MOVEMENT-ARCHITECTURE-A: full WargamingGEN-style per-unit debug row.
        movementDebug: function () {
            var coa = _coaExec ? _coaExec.selected_coa
                : (_coaPlan && _coaPlan.ok && (_coaPlan.coas && (_coaPlan.coas[_coaSelectedIdx] || _coaPlan.coas[0])));
            if (!coa) return [];
            var obj = getObjective();
            var ME = W() && W().RmoozMovementEngine;
            var result = [];
            arr(coa.phases).forEach(function (ph) {
                arr(ph && ph.actions).forEach(function (act) {
                    if (!act) return;
                    var found = act.unit_uid ? _findRealUnit(act.unit_uid) : null;
                    var u = found && found.unit;
                    var unitFound = !!u;
                    var cLat = u ? (u.lat != null ? +u.lat : (Array.isArray(u.coord) ? +u.coord[1] : null)) : null;
                    var cLon = u ? (u.lon != null ? +u.lon : (Array.isArray(u.coord) ? +u.coord[0] : null)) : null;
                    // Waypoint target: use cached _waypoints if present, else fall back to act.target
                    var wpIdx   = act._wpIdx || 0;
                    var wps     = act._waypoints;
                    var curWp   = (wps && wps.length) ? wps[wpIdx % wps.length] : act.target;
                    var finalWp = (wps && wps.length) ? wps[wps.length - 1] : act.target;
                    var tLat = curWp ? +curWp.lat : null;
                    var tLon = curWp ? +curWp.lon : null;
                    var fLat = finalWp ? +finalWp.lat : tLat;
                    var fLon = finalWp ? +finalWp.lon : tLon;
                    var distToWpKm = (cLat != null && tLat != null)
                        ? Math.round(_kmBetween({ lat: cLat, lon: cLon }, { lat: tLat, lon: tLon }) * 10) / 10 : null;
                    var remainingKm = (cLat != null && fLat != null)
                        ? Math.round(_kmBetween({ lat: cLat, lon: cLon }, { lat: fLat, lon: fLon }) * 10) / 10 : null;
                    var objDistKm = (obj && fLat != null)
                        ? Math.round(_kmBetween({ lat: fLat, lon: fLon }, obj) * 10) / 10 : null;
                    var taskable = _isUnitTaskable(act.unit_uid);
                    var movedRec = _movedMovementRecords.filter(function (m) { return String(m.uid || '') === String(act.unit_uid || ''); });
                    var movedThisTick = movedRec.length > 0;
                    var movedKmThisTick = movedThisTick ? (movedRec[0].moved_km || 0) : 0;
                    var heldStep1  = !!_step1HeldUids[String(act.unit_uid || '')];
                    var heldDomain = !!_domainHeldUids[String(act.unit_uid || '')];
                    var domBlkRec  = _domainBlockedRecords.filter(function(r){ return r.uid === act.unit_uid; })[0];
                    var heldThisTick = _heldMovementRecords.some(function(r){ return r.uid === act.unit_uid && r.reason !== 'HOLD_POSITION'; });
                    var isMissing  = _missingUnitRecords.some(function (r) { return r.uid === act.unit_uid; });
                    var domain = act.domain || (ME && u ? ME.classifyUnitDomain(u) : 'unknown');
                    var movMode = act.movement_mode || (domain === 'air' ? 'air' : domain === 'naval' ? 'naval' : 'ground');
                    var src = act._source || (act.behavior ? 'ai_behavior' :
                        ((_coaPlan && (_coaPlan.plan_source === 'deterministic' || _coaPlan.plan_source === 'staff_safe')) ? 'staff_safe_fallback' : 'ai'));
                    // Unit not found: check both commit-time records AND runtime lookup
                    var unitMissing = isMissing || (!unitFound && act.action_type !== 'HOLD_POSITION' && act.behavior !== 'hold');
                    var blockedReason = unitMissing  ? 'UNIT NOT FOUND'
                        : heldStep1  ? 'HOLD REVIEW'
                        : (domBlkRec  ? ('DOMAIN BLOCKED: ' + (domBlkRec.reason || domBlkRec.violation_type || 'territory violation'))
                        : (heldDomain ? 'DOMAIN BLOCKED'
                        : (heldThisTick ? 'HELD IN PLACE'
                        : (!taskable ? 'NOT TASKABLE' : null))));
                    result.push({
                        uid: act.unit_uid, side: u ? (u.side || '') : '', role: act.role || '',
                        action_type: act.action_type || '',
                        domain: domain, movement_mode: movMode,
                        behavior: act.behavior || null, waypoint_policy: act.waypoint_policy || null,
                        cur_lat: cLat, cur_lon: cLon,
                        planned_wp_lat: tLat, planned_wp_lon: tLon,
                        distance_to_waypoint_km: distToWpKm,
                        distance_to_objective_km: objDistKm,
                        remaining_km: remainingKm,
                        moved_this_tick: movedThisTick, moved_km_this_tick: movedKmThisTick,
                        taskable: taskable, unit_found: unitFound,
                        blocked_reason: blockedReason,
                        source: src,
                    });
                });
            });
            // Append missing-unit sentinel rows
            _missingUnitRecords.forEach(function (r) {
                if (!result.some(function (row) { return row.uid === r.uid; })) {
                    result.push({ uid: r.uid, side: '', role: '', action_type: '', domain: 'unknown',
                        movement_mode: 'unknown', behavior: null, waypoint_policy: null,
                        cur_lat: null, cur_lon: null, planned_wp_lat: null, planned_wp_lon: null,
                        distance_to_waypoint_km: null, distance_to_objective_km: null, remaining_km: null,
                        moved_this_tick: false, moved_km_this_tick: 0,
                        taskable: false, unit_found: false, blocked_reason: 'UNIT NOT FOUND', source: 'unknown' });
                }
            });
            return result;
        },
        // RMOOZ-FF-EVIDENCE-BUILD-MARKER-A: one runtime diagnostics object for the SCC Evidence panel.
        // Lets an operator screenshot prove (a) which build the browser actually ran, (b) the map-layer
        // ownership state (AI-lite cleared during execution), and (c) where movement came from — split
        // by behavior source — without opening devtools. Pure read; mutates nothing.
        diagnostics: function () {
            var w = (typeof window !== 'undefined') ? window : {};
            var p = _coaPlan || {};
            var rows = (function () { try { return _engine.movementDebug(); } catch (_) { return []; } })();
            var srcSummary = { ai_behavior: 0, degraded_behavior_repaired: 0, staff_safe_movement_engine: 0, legacy_target: 0, other: 0 };
            var moved = 0, held = 0, blocked = 0, missing = 0;
            rows.forEach(function (r) {
                var s = String(r.source || '');
                if (s === 'ai_behavior') srcSummary.ai_behavior++;
                else if (s === 'degraded_behavior_repaired') srcSummary.degraded_behavior_repaired++;
                else if (/staff_safe/.test(s)) srcSummary.staff_safe_movement_engine++;
                else if (s === 'ai' || s === 'legacy' || s === 'legacy_target') srcSummary.legacy_target++;
                else srcSummary.other++;
                if (r.moved_this_tick) moved++;
                if (r.blocked_reason === 'UNIT NOT FOUND') missing++;
                else if (r.blocked_reason) { if (/HELD|HOLD/.test(r.blocked_reason)) held++; else blocked++; }
            });
            var selCoa = (function () { try { return _engine.rawJson('selected'); } catch (_) { return null; } })();
            var mlm = w.RmoozMapLayerMode || null;
            return {
                free_fight_demo_version: _BUILD_MARKER,
                movement_engine_loaded: !!w.RmoozMovementEngine,
                realism_gate_loaded: !!w.RmoozCoaRealismGate,
                map_layer_mode: (mlm && mlm.mode) ? mlm.mode() : null,
                ai_lite_layer_visible: (mlm && mlm.isAiLiteVisible) ? !!mlm.isAiLiteVisible() : null,
                plan_source: p.plan_source || null,
                llm_called: !!p.llm_called,
                llm_status: p.llm_status || null,
                selected_coa_id: (selCoa && (selCoa.id || selCoa.coa_id || selCoa.name)) || null,
                movement_source_summary: srcSummary,
                moved_count: moved,
                held_count: held,
                blocked_count: blocked,
                missing_unit_count: missing,
            };
        },
    };

    var API = {
        engine: _engine,   // RMOOZ-SCENARIO-CONTROL-CENTER-REBUILD-AF facade
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
        // COA_ACTION_BUDGET_AND_ROLE_GATE test seam: verify the move-subset selector directly.
        _selectMoversForTest: function (units, focal, opts) {
            var r = _selectMovers(units, focal, opts);
            return { considered: r.considered, taskable: r.taskable, maxAllowed: r.maxAllowed,
                selected: r.movers.length, held: r.held.length,
                moverIds: r.movers.map(function (u) { return u.id; }),
                heldHoldRoleExcluded: r.considered - r.taskable };
        },
        _autoDirectorBuildCoaForTest: function (o) { return _autoDirectorBuildCoa(o || _whiteScenarioOutcome()); },
        // RMOOZ-GREEN-WORLD-UI-R test seams
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
        // RMOOZ-SCENARIO-CONTROL-CENTER-REBUILD-AF: the old Free Fight control window (V2 cockpit) and its
        // render/walkthrough/movement-summary seams were DELETED. The seams below are engine-level only:
        // selecting a COA, reading the new SCC state, and a no-op legacy-open flag (no drawer exists now).
        _setFfLegacyOpenForTest:   function (v)             { _ffLegacyOpen = !!v; return _ffLegacyOpen; },   // no-op: old diagnostics drawer removed
        _getFfLegacyOpenForTest:   function ()              { return _ffLegacyOpen; },
        _selectCoaForTest:         function (i)             { _coaSelectedIdx = i; updatePanel(); return _coaSelectedIdx; },
        _v2SelectCoaForTest:       function (i)             { _coaSelectedIdx = i; updatePanel(); return _coaSelectedIdx; },   // alias kept for surviving tests
        _sccStateForTest:          function ()              { return (W() && W().RmoozScenarioControlCenter) ? W().RmoozScenarioControlCenter.state() : 'no_scenario'; },
        _sccRenderForTest:         function ()              { return (W() && W().RmoozScenarioControlCenter) ? W().RmoozScenarioControlCenter.render() : ''; },
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
        // RMOOZ-FREE-FIGHT-AUTO-SCENARIO-DIRECTOR-AB test seams
        _setScenarioAutoContinueForTest: function (v)       { _scenarioAutoContinue = !!v; if (_scenario) _scenario.auto_continue = _scenarioAutoContinue; return _scenarioAutoContinue; },
        _toggleScenarioAutoForTest: function ()             { return _toggleScenarioAuto(); },
        _getScenarioAutoContinueForTest: function ()        { return _scenarioAutoContinue; },
        _autoDirectorNextBlueOrderForTest: function (o)     { return _autoDirectorNextBlueOrder(o || _whiteScenarioOutcome()); },
        _redManeuverOrderForTest:  function (o)             { return _redManeuverOrder(o || _whiteScenarioOutcome()); },
        // RMOOZ-AUTO-SCENARIO-FORMATION-REALISM-AC test seams
        _objFormationForTest:      function (obj)           { return _objFormation(obj || getObjective()); },
        _ringPosForTest:           function (obj, ring, i)  { var o = obj || getObjective(); return { assault: _assaultRing(o, i), support: _supportRing(o, i), screen: _screenRing(o, i), blocking: _blockingRing(o, i), reserve: _reserveRing(o, i) }[ring]; },
        _autoDirectorBuildCoaForTest: function (o)          { return _autoDirectorBuildCoa(o || _whiteScenarioOutcome()); },
        // RMOOZ-REAL-COA-COMMANDER-QUALITY-AD test seams
        _coaQualityGateForTest:    function (coa)           { return _coaQualityGate(coa); },
        _staffSafeCommanderCoaForTest: function (side, units, obj, tag) { return _staffSafeCommanderCoa(side || 'BLUE', units, obj || getObjective(), tag || 'SS-CMD-1'); },
        // RMOOZ-SIDE-ROLE-A: expose _sccActionTargets for side-role acceptance tests
        _sccActionTargetsForTest: function (coa)            { return _sccActionTargets(coa); },
        _gradeCoaPlanQualityForTest: function ()            { if (!_coaPlan || !_coaPlan.ok || !arr(_coaPlan.coas).length) return null; var q = _gradeCoaPlan(_coaPlan); if (q.pass) { _coaPlan._coa_quality = { verdict: 'pass', score: q.score, reasons: q.reasons }; _recordQualityGate('pass', q.score, q.reasons); } else { _coaFallbackToTemplate(_coaPlan, q); } return _coaPlan._coa_quality; },
        // RMOOZ-AI-COA-HONESTY-A: test seam for the full quality gate flow (with commander-path guard)
        _runCoaQualityGateFlowForTest: function (t0)        { return _runCoaQualityGateFlow(t0 || 0); },
        _getCoaPlanQualityForTest: function ()              { return _coaPlan && _coaPlan._coa_quality; },
        // RMOOZ-COA-QUALITY-HARD-ENFORCEMENT-AE test seams
        _coaHardBlockReasonForTest: function (coa)          { return _coaHardBlockReason(coa); },
        _enforceExecutableCoaQualityForTest: function (coa) { return _enforceExecutableCoaQuality(coa); },
        _coaTargetSummaryForTest:  function (coa)           { return _coaTargetSummary(coa); },
        _getRunBlockedReasonForTest: function ()            { return _coaExec && _coaExec.run_blocked_reason; },
        // RMOOZ-STEP1-COA-PREPARATION-GATE-AE test seams
        _classifyUnitForTest:          function (u)         { return _classifyUnit(u); },
        _step1PreparationReportForTest: function ()         { return _step1PreparationReport(); },
        _step1GateForTest:             function (tag)       { return _step1Gate(tag || 'test'); },
        _isUnitTaskableForTest:        function (uid)       { return _isUnitTaskable(uid); },
        _taskableSideUnitsForTest:     function (side)      { return _taskableSideUnits(side); },
        _coaTasksBlockedUnitForTest:   function (coa)       { return _coaTasksBlockedUnit(coa); },
        _resolveCoaMovesForTest:       function (coa)       { return _resolveCoaMoves(coa); },
        _getCommitBlockedReasonForTest: function ()         { return _coaCommitBlockedReason; },
        _getLastStep1ReportForTest:    function ()          { return _lastStep1Report; },
        _getDecisionLogForTest:        function ()          { return _decisionLog.slice(); },
        // RMOOZ-FREE-FIGHT-V2-COA-TO-SCENARIO-BUGFIX-AB1 test seams
        _coaCommitIsStaleForTest:  function ()              { return _coaCommitIsStale(); },
        _getCommittedPlanObjMatchesForTest: function ()     { return _committedPlanObj === _coaPlan; },
        _bodyHtmlForTest:          function ()              { updatePanel(); var b = _panel && _panel.querySelector('[data-ff="body"]'); return b ? b.innerHTML : ''; },
        // RMOOZ-FREE-FIGHT-CONTROL-WINDOW-REBUILD-W test seams
        _setFfTabForTest:          function (t)             { _ffTab = t; return _ffTab; },
        _getFfTabForTest:          function ()              { return _ffTab; },
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
        // RMOOZ-AI-COMMANDER-REPAIR-LOOP-A test seams
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
        _getPlanningModeForTest:   function ()            { return _planningMode; }, // RMOOZ-PREPARE-COA-PRODUCT-FLOW-A
        _getAiUnavailableMsgForTest: function ()          { return _aiUnavailableMsg; },
        _setRouteHealthForTest:    function (h)           { _routeHealth = h; },
        _setModelInfoForTest:      function (m)           { _modelInfo = m; },   // RMOOZ-PREPARE-COA-UX-UNBLOCK-A
        // RMOOZ-FREE-FIGHT-AI-GATE-CARD-D test seams
        _aiGateStatusHtmlForTest:  function (h)           { if (h !== undefined) _routeHealth = h; return _aiGateStatusHtml(); },
        _aiBlockReasonsForTest:    function (h)           { return _aiBlockReasons(h); },
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
        // RMOOZ-COA-REALISM-GATE-A test seams
        _validateAllPlacementsForTest:       function ()  { return _validateAllPlacements(); },
        _getMovementValidationLogForTest:    function ()  { return _movementValidationLog.slice(); },
        _clearMovementValidationLogForTest:  function ()  { _movementValidationLog = []; _domainHeldUids = {}; },
        _getPlacementValidationForTest:      function ()  { return _placementValidation.slice(); },
        // RMOOZ-OBJ-CANONICAL-A test seams
        _getObjectiveSourceForTest:          function ()  { return _objectiveSource; },
        _getObjectiveForTest:                function ()  { return _objective ? { lat: _objective.lat, lon: _objective.lon } : null; },
        // RMOOZ-MOVEMENT-TRUTH-A test seam
        _normalizeActionTargetsForTest: function (plan) { return _normalizeActionTargets(plan); },
        // RMOOZ-MOVEMENT-INTELLIGENCE-A test seams
        _getMissingUnitRecordsForTest:   function () { return _missingUnitRecords.slice(); },
        _getHeldMovementRecordsForTest:  function () { return _heldMovementRecords.slice(); },
        _getDomainBlockedRecordsForTest: function () { return _domainBlockedRecords.slice(); },
        // RMOOZ-WARGAMINGGEN-MOVEMENT-ARCHITECTURE-A test seams
        _getMovedMovementRecordsForTest: function () { return _movedMovementRecords.slice(); },
        // RMOOZ-DUAL-MAP-LAYER-CONFLICT-A test seams
        _getAiLiteStagedVisibleForTest:  function ()  { return _aiLiteStagedVisible; },
        _clearAiLiteStagedGroupsForTest: function ()  { _clearAiLiteStagedGroups(); },
        _resetAiLiteStagedVisibleForTest: function () { _aiLiteStagedVisible = true; _mapLayerMode = 'ai_lite_preview'; _red = []; _blue = []; },
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = API;
    if (typeof window !== 'undefined') window.RmoozFreeFightDemo = API;

    // RMOOZ-DUAL-MAP-LAYER-CONFLICT-A: map layer mode controller.
    // mode: 'ai_lite_preview' (default) → AI-lite staged preview visible.
    //        'free_fight'               → SCC/COA execution active; AI-lite cleared.
    if (typeof window !== 'undefined') window.RmoozMapLayerMode = {
        mode: function () { return _mapLayerMode; },
        setMode: function (m) {
            _mapLayerMode = m;
            if (m === 'free_fight') { try { _clearAiLiteStagedGroups(); } catch (_) {} }
        },
        isAiLiteVisible: function () { return _aiLiteStagedVisible; },
    };
})(typeof globalThis !== 'undefined' ? globalThis : this);
