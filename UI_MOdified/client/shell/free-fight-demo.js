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
    var _pendingModel = null;          // dropdown's current (uncommitted) value
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
        // RMOOZ-LOCAL-MODEL-SELECTOR-A: local model picker (same selection as the global header HUD).
        html += renderModelSelectorHtml();
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
        bodyDiv.innerHTML = html;
        bind('start', start); bind('replan', replan); bind('pause', pause); bind('reset', reset); bind('clear-obj', clearObjective);
        bind('place-obj', armPlaceObjective);
        bind('preview-ai', _fetchAiDecision); bind('apply-ai', _applyAiDecision); bind('reset-ai', _resetAiDecision);
        bind('test-llm', _testLlm);
        // FREEFIGHT-AI-COA-PLANNER-A: COA planner bindings
        bind('generate-coa', _generateCoaPlan);
        bind('apply-coa', _applySelectedCoa);
        bind('reset-coa', _resetCoa);
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
        // RMOOZ-LOCAL-MODEL-SELECTOR-A: model picker controls.
        bind('model-refresh', _fetchModels);
        bind('model-use', function () {
            var s = _panel && _panel.querySelector('[data-act="model-select"]');
            var v = s ? s.value : _pendingModel;
            if (v) _selectModel(v);
        });
        var modelSel = _panel.querySelector('[data-act="model-select"]');
        if (modelSel && modelSel.addEventListener) modelSel.addEventListener('change', function () { _pendingModel = modelSel.value; });
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
    function _probeRouteHealth() {
        var w = W();
        if (!w || typeof w.fetch !== 'function') return;
        _fetchJsonSafe('/api/wargame-sim/free-fight/plan-coas/health', { method: 'GET' })
            .then(function (h) { _routeHealth = h; updatePanel(); })
            .catch(function (e) { _routeHealth = { ok: false, reason: 'probe_failed', error: (e && e.message) || 'error' }; updatePanel(); });
    }
    // RMOOZ-LOCAL-MODEL-SELECTOR-A: list local models + current selection (mirrors the global header HUD).
    function _fetchModels() {
        var w = W();
        if (!w || typeof w.fetch !== 'function') return;
        _fetchJsonSafe('/api/ai/models', { method: 'GET' })
            .then(function (m) {
                _modelInfo = m;
                if (_pendingModel == null && m && m.selected_model) _pendingModel = m.selected_model;
                updatePanel();
            })
            .catch(function (e) { _modelInfo = { ok: false, error: (e && e.message) || 'error' }; updatePanel(); });
    }
    // RMOOZ-LOCAL-MODEL-SELECTOR-A: persist the operator's choice app-wide, then re-probe route health
    // (model_available may flip) and tell the rest of the app via rmooz:ai-model-changed.
    function _selectModel(model) {
        var w = W();
        if (!model || !w || typeof w.fetch !== 'function') return;
        _fetchJsonSafe('/api/ai/model/select', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: model }),
        }).then(function (m) {
            if (m && m.ok) {
                _modelInfo = m;
                _pendingModel = m.selected_model || model;
                try {
                    document.dispatchEvent(new CustomEvent('rmooz:ai-model-changed',
                        { detail: { model: _pendingModel, source: 'free_fight_card', model_available: !!m.model_available } }));
                } catch (_) {}
            } else {
                _modelInfo = Object.assign({}, _modelInfo || {}, { ok: false, error: (m && m.error) || 'select_failed' });
            }
            _probeRouteHealth();   // refresh model_available / reason_if_blocked
            updatePanel();
        }).catch(function (e) {
            _modelInfo = Object.assign({}, _modelInfo || {}, { ok: false, error: (e && e.message) || 'select_failed' });
            updatePanel();
        });
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
            _coaLoading = false; _coaApplied = false; _stopCoaLoadingTicker();
            updatePanel();
        }).catch(function (e) {
            _coaPlan = { ok: false, _error: (e && e.message) || 'fetch failed', _requestedVia: 'manual_generate' };
            _coaLoading = false; _stopCoaLoadingTicker(); updatePanel();
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
    // RMOOZ-AI-COA-PERFORMANCE-A: compact "Stage timings" block from plan.debug_timing
    // (AI total / LLM / capability / terrain / COA build). Returns '' when no timing present.
    function _coaTimingHtml(t) {
        if (!t || typeof t !== 'object') return '';
        function row(label, ms, color) {
            if (ms == null) return '';
            return '<span style="color:#7a9ab8;">' + esc(label) + ':</span> <span style="color:' + (color || '#cdd8e4') + ';">' + esc(_fmtMs(ms)) + '</span>';
        }
        var parts = [
            row('AI total', t.total_ms, '#cfe8ff'),
            (t.llm_ms ? row('LLM', t.llm_ms, '#90d0b0') : ''),
            row('capability', t.analyze_unit_capabilities_ms, '#d8ccff'),
            row('terrain', t.tactical_terrain_context_ms),
            row('COA build', t.build_diverse_coas_ms, '#bfe89a'),
        ].filter(Boolean);
        if (!parts.length) return '';
        return '<div data-ff-coa="timing" style="margin-bottom:6px;font-size:9.5px;color:#8fa5b8;line-height:1.5;border:1px solid #20364e;border-radius:4px;padding:4px 7px;background:#0a1420;">' +
            '<span style="color:#7a9ab8;font-weight:600;">⏱ Stage timings — </span>' + parts.join(' · ') + '</div>';
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
    var AI_NO_MODEL_MSG = 'AI execution is allowed, but no local LLM/model is available. Select/configure a local model.';
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
        h += sig('Provider (llm-runtime-config)', providerBlocked ? (cfgProvider + ' — REMOTE, blocked') : (cfgProvider + ' — local'), providerBlocked ? AMBER : GREEN);
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
            if (rh.allow_sim_run === true && rh.model_available === false) return { ok: false, code: 'no_model', reason: rh.reason_if_blocked || 'no local model available', msg: AI_NO_MODEL_MSG };
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
        // RMOOZ-AI-COMMANDER-REPAIR-LOOP-A: Staff-Safe (explicit OR auto-fallback) is a legitimate,
        // clearly-badged mode — SHOW its deterministic COAs (not dressed as AI). Only a true no-plan
        // failure (no coas at all) still hits the AI-only honesty gate. The planning-trace below carries
        // the honest "Staff-Safe / why the AI didn't run" labeling.
        if (_coaPlan._requestedVia === 'manual_generate' && !_isRealLlmPlan(_coaPlan) && !arr(_coaPlan.coas).length) {
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
        h += _coaTimingHtml(_coaPlan.debug_timing);
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
            if (coa.recommended) h += '<span style="background:#1a5030;color:#7fd6a0;border-radius:3px;padding:1px 5px;font-size:9px;">Recommended</span>';
            h += '</div>';
            h += '<div style="font-size:10px;margin-bottom:3px;">' +
                 '<span style="color:#8fa5b8;">Risk:</span> <span style="color:' + riskColor + ';">' + esc(coa.risk) + '</span> · ' +
                 '<span style="color:#8fa5b8;">Confidence:</span> <span style="color:#9ec2ec;">' + esc(coa.confidence) + '</span> · ' +
                 '<span style="color:#8fa5b8;">Units:</span> <span style="color:#e0e8f0;">' + (coa.units_selected_count || 0) + '/' + (coa.units_total_considered || 0) + '</span></div>';
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
        // FREEFIGHT-COA-ROUTE-JSON-GUARD-A: planner route health + local-only provider/model
        h += '<div data-ff-loop="route-health" style="font-size:10px;color:#cdd8e4;margin-top:4px;border-top:1px solid #1a3050;padding-top:4px;">';
        var rh = _routeHealth;
        var rhOk = rh && rh.ok === true;
        var rhColor = rhOk ? '#7fd6a0' : (rh ? '#e0a93a' : '#8fa5b8');
        var rhText = rhOk ? 'OK' : (rh ? 'unavailable' : 'unknown — click Check');
        h += '<span style="color:#8fa5b8;">Planner route:</span> <span style="color:' + rhColor + ';font-weight:700;">' + esc(rhText) + '</span>';
        h += ' <button data-act="loop-route-check" style="font:inherit;cursor:pointer;border:1px solid #4a5f75;background:#101b27;color:#8fb8e0;border-radius:4px;padding:1px 6px;font-size:9px;">Check route</button>';
        // RMOOZ-FREE-FIGHT-AI-GATE-CARD-D: the structured gate status (4 separate signals — execution
        // gate, raw provider, model availability, local-only policy — + the EXACT fix per active
        // block) replaces the old single-line gate/model/reason rendering.
        var gateStatus = _aiGateStatusHtml();
        if (gateStatus) {
            h += '<div style="margin-top:4px;">' + gateStatus + '</div>';
        } else {
            h += '<div><span style="color:#8fa5b8;">Provider policy:</span> <span style="color:#7fd6a0;">local only</span>';
            h += ' · <span style="color:#8fa5b8;">Provider:</span> <span style="color:#9ec2ec;">' + esc((rh && rh.provider) || 'ollama') + '</span>';
            h += ' · <span style="color:#8fa5b8;">Model:</span> <span style="color:#9ec2ec;">' + esc((rh && rh.model) || 'qwen2.5:7b') + '</span></div>';
        }
        h += '</div>';
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
            h += '<button data-act="loop-start" style="font:inherit;cursor:pointer;border:1px solid #2e7d54;background:#1f3a2b;color:#7fd6a0;border-radius:5px;padding:5px 9px;font-size:11px;">▶ Start AI Free Fight</button>';
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

    function renderAiDecisionHtml() {
        var h = '<div style="margin-top:8px;border-top:1px solid #2a3f55;padding-top:8px;">';
        h += '<div style="margin-bottom:6px;padding:5px 8px;border:1px solid #1a4030;border-radius:4px;background:#091810;">' +
             '<div style="display:flex;align-items:center;gap:6px;">' +
             '<span style="font-size:10px;font-weight:700;color:#fff;background:#1a7040;border-radius:3px;padding:1px 6px;letter-spacing:.5px;">MAIN AI TEST</span>' +
             '<span style="font-size:11px;font-weight:700;color:#7fd6a0;">MAIN AI TEST — Attack Plan / COA Planner</span>' +
             '</div>' +
             '<div style="font-size:10px;color:#5a9a70;margin-top:2px;">Real unit-level AI decision — هذا هو الاختبار الفعلي للذكاء الاصطناعي على مستوى الوحدات</div>' +
             '</div>';
        // FREEFIGHT-AI-CONTINUOUS-COMMANDER-LOOP-A: continuous loop controls on top
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
        h += renderCoaPlanHtml();
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
        return getState();
    }

    // RMOOZ-LOCAL-MODEL-SELECTOR-A: re-sync the card's picker when the model changes
    // elsewhere (e.g. the global header HUD). Skip our own echo. Registered once.
    try {
        document.addEventListener('rmooz:ai-model-changed', function (e) {
            if (e && e.detail && e.detail.source === 'free_fight_card') return;
            try { _fetchModels(); } catch (_) {}
        });
    } catch (_) {}

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
        _selectModelForTest:       function (m)           { return _selectModel(m); },
        _getModelInfoForTest:      function ()            { return _modelInfo; },
        _setModelInfoForTest:      function (m)           { _modelInfo = m; _pendingModel = (m && m.selected_model) || _pendingModel; updatePanel(); },
        _renderModelSelectorHtmlForTest: function ()      { return renderModelSelectorHtml(); },
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
        _coaTimingHtmlForTest:     function (t)           { return _coaTimingHtml(t); },
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
