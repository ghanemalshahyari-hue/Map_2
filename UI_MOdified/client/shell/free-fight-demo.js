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
    var _layer = null, _panel = null, _card = null, _aiPanel = null;
    var _winState = null, _viewportResizeHandler = null;
    var _plan = null, _terrain = { available: false }, _objectiveSource = null;
    var _aiDecision = null, _aiLoading = false, _aiApplied = false, _aiDiagnostics = null;
    var _aiMovedUnit = null, _aiMovedUnitOldPos = null, _aiMovedUnitSource = null;
    var _useLlm = false, _llmTestStatus = null;
    // FREEFIGHT-AI-COA-PLANNER-A: multi-unit COA state
    var _coaPlan = null, _coaLoading = false, _coaApplied = false, _coaSelectedIdx = 0;
    var _coaMovedUnits = [];  // [{unit, oldPos}, ...]
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
                var trailColor = role === 'assault' ? '#ff9060' : (role === 'support' ? '#60b0ff' : (role === 'recon' ? '#b0b0b0' : '#90d090'));
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
        var modeSel = _panel.querySelector('[data-act="planner-mode"]');
        if (modeSel && modeSel.addEventListener) modeSel.addEventListener('change', function () { setPlannerMode(modeSel.value); });
        var llmCb = _panel.querySelector('[data-act="toggle-llm"]');
        if (llmCb && llmCb.addEventListener) llmCb.addEventListener('change', function () { _useLlm = !!(llmCb && llmCb.checked); });
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
            return { id: String(id), uid: String(id), lat: +lat, lon: +lon,
                     side: String(u.side || 'RED').toUpperCase(),
                     platform: u.platform || u.role || u.label || null };
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

        var ob2 = (_payload && _payload.brief && _payload.brief.operational_brief) || (_payload && _payload.operational_brief) || {};
        var objectives = Array.isArray(ob2.placement_candidates)
            ? ob2.placement_candidates.filter(function(c) { return c && String(c.type || '').toLowerCase() === 'objective'; })
            : [];
        if (!objectives.length && Array.isArray(ob2.objectives)) objectives = ob2.objectives;
        if (!objectives.length && finiteLL(_objective)) objectives = [{ lat: _objective.lat, lon: _objective.lon, name: 'Objective X' }];

        var allowedUnitIds = units.map(function(u) { return u.id; });
        return { units: units, objectives: objectives, opts: { preferSide: 'RED', useLlm: _useLlm, allowed_unit_ids: allowedUnitIds } };
    }
    function _fetchAiDecision() {
        var w = W();
        if (!w || typeof w.fetch !== 'function') return;
        _aiLoading = true; _aiDecision = null; _aiApplied = false;
        updatePanel();
        w.fetch('/api/wargame-sim/free-fight/demo-ai-step', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(_buildAiRequestBody()),
        }).then(function (r) { return r.json(); }).then(function (dec) {
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
            // Pan to new position so move is immediately visible
            var w = W();
            try { w.map.panTo([+ap.lat, +ap.lon]); } catch (_) {}
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
        w.fetch('/api/wargame-sim/free-fight/test-llm', { method: 'POST' })
            .then(function (r) { return r.json(); })
            .then(function (result) { _llmTestStatus = result; updatePanel(); })
            .catch(function (e) { _llmTestStatus = { ok: false, error: e && e.message || 'fetch failed' }; updatePanel(); });
    }
    // FREEFIGHT-AI-COA-PLANNER-A ───────────────────────────────────────────────
    function _generateCoaPlan() {
        var w = W();
        if (!w || typeof w.fetch !== 'function') return;
        _coaLoading = true; _coaPlan = null; _coaApplied = false; _coaMovedUnits = [];
        updatePanel();
        var body = _buildAiRequestBody();
        w.fetch('/api/wargame-sim/free-fight/plan-coas', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ units: body.units, objectives: body.objectives, context: {}, opts: body.opts }),
        }).then(function (r) { return r.json(); }).then(function (plan) {
            _coaPlan = plan; _coaLoading = false; _coaApplied = false;
            updatePanel();
        }).catch(function (e) {
            _coaPlan = { ok: false, _error: (e && e.message) || 'fetch failed' };
            _coaLoading = false; updatePanel();
        });
    }
    function _applySelectedCoa() {
        if (!_coaPlan || !_coaPlan.ok || !Array.isArray(_coaPlan.coas) || !_coaPlan.coas.length) return;
        var idx = _coaSelectedIdx;
        if (idx < 0 || idx >= _coaPlan.coas.length) idx = 0;
        var coa = _coaPlan.coas[idx];
        _coaMovedUnits = [];
        // Apply each action in all phases
        (coa.phases || []).forEach(function (ph) {
            (ph.actions || []).forEach(function (act) {
                if (act.action_type === 'HOLD_POSITION') return;
                if (!act.target || !Number.isFinite(Number(act.target.lat)) || !Number.isFinite(Number(act.target.lon))) return;
                var mv = _applyMoveToScenario(act.unit_uid, act.target.lat, act.target.lon);
                if (mv.found) {
                    _coaMovedUnits.push({ unit: mv.unit, oldPos: mv.oldPos, role: act.role || '' });
                }
            });
        });
        _coaApplied = true;
        // Trigger scenario redraw once after all units updated
        if (mapReady()) {
            _triggerScenarioRedraw();
            syncMarkers();
            // Pan to centroid of moved units
            var w = W();
            if (_coaMovedUnits.length) {
                var latSum = 0, lonSum = 0;
                _coaMovedUnits.forEach(function (mv) { if (mv.unit) { latSum += mv.unit.lat; lonSum += mv.unit.lon; } });
                var n = _coaMovedUnits.length;
                try { w.map.panTo([latSum / n, lonSum / n]); } catch (_) {}
            }
        }
        _buildCoaEventLogEntries().forEach(function (entry) { _appendToEventLog(entry); });
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
        return [
            'AI COA Applied: ' + esc(coa.plan_id || 'COA-?') + ' ' + esc(coa.title || '') +
            ' — ' + moved.length + ' units moved' + (roleStr ? ', ' + roleStr : '') +
            ' [' + srcTag + ']'
        ];
    }
    function renderCoaPlanHtml() {
        var h = '';
        if (_coaLoading) {
            h += '<div style="color:#9ab0c0;font-size:11px;padding:6px;">Loading AI Attack Plan… جاري التحميل</div>';
            return h;
        }
        if (!_coaPlan) {
            // COA cards shown after generation — typical COAs: Direct Assault, Flank / Fix, Probe / Recon
            h += '<div style="color:#7a9ab8;font-size:11px;padding:4px 0;">Click "Generate AI Attack Plan" to generate COAs for all RED units.<br>' +
                 '<span style="color:#5a7a60;font-size:10px;">Typical plans: Direct Assault · Flank / Fix · Probe / Recon</span></div>';
            return h;
        }
        if (_coaPlan._error || !_coaPlan.ok) {
            h += '<div style="color:#e0a93a;font-size:11px;padding:4px;">Error: ' + esc(_coaPlan._error || _coaPlan.reason || 'unknown error') + '</div>';
            return h;
        }
        var coas = _coaPlan.coas || [];
        // Plan source banner
        var srcColor = _coaPlan.plan_source === 'llm' ? '#90d090' : '#9ab0c0';
        h += '<div style="margin-bottom:5px;font-size:10px;">' +
             '<span style="color:#7a9ab8;">Plan source:</span> <span style="color:' + srcColor + ';">' + esc(_coaPlan.plan_source || 'deterministic_coa_fallback') + '</span>';
        if (_coaPlan.fallback_reason) h += ' <span style="color:#e0a93a;font-size:9px;">(' + esc(_coaPlan.fallback_reason) + ')</span>';
        h += '</div>';
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

    function renderAiDecisionHtml() {
        var h = '<div style="margin-top:8px;border-top:1px solid #2a3f55;padding-top:8px;">';
        h += '<div style="margin-bottom:6px;padding:5px 8px;border:1px solid #1a4030;border-radius:4px;background:#091810;">' +
             '<div style="display:flex;align-items:center;gap:6px;">' +
             '<span style="font-size:10px;font-weight:700;color:#fff;background:#1a7040;border-radius:3px;padding:1px 6px;letter-spacing:.5px;">MAIN AI TEST</span>' +
             '<span style="font-size:11px;font-weight:700;color:#7fd6a0;">MAIN AI TEST — Attack Plan / COA Planner</span>' +
             '</div>' +
             '<div style="font-size:10px;color:#5a9a70;margin-top:2px;">Real unit-level AI decision — هذا هو الاختبار الفعلي للذكاء الاصطناعي على مستوى الوحدات</div>' +
             '</div>';
        // COA Planner buttons
        h += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px;">';
        h += '<button data-act="generate-coa" style="font:inherit;cursor:pointer;border:1px solid #2a7a50;background:#131e18;color:#90d0a0;border-radius:5px;padding:5px 10px;font-size:11px;">' +
             (_coaLoading ? '⏳ Loading…' : '⚡ Generate AI Attack Plan') + '</button>';
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
        h += '<label style="display:flex;align-items:center;gap:5px;cursor:pointer;color:#9ec2ec;" title="Uses local Ollama only — requires RMOOZ_FREE_FIGHT_LLM=1 on the server">';
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
                        h += '<div><span style="color:#7a9ab8;">LLM model:</span> <span style="color:#9ec2ec;">' + esc(dec.model_used || 'qwen3-coder:latest') + '</span></div>';
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
        if (_card && _card.parentNode) _card.parentNode.removeChild(_card); _card = null;
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
        return getState();
    }

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
        _getCoaAppliedForTest:    function ()             { return _coaApplied; },
        _getCoaSelectedIdxForTest: function ()            { return _coaSelectedIdx; },
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = API;
    if (typeof window !== 'undefined') window.RmoozFreeFightDemo = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
