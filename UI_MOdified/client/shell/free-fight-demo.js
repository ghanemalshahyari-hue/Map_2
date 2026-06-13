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
    var _plan = null, _terrain = { available: false }, _objectiveSource = null;
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
        setLlmStatus('fallback', 'LLM unavailable or invalid response - using RMOOZ deterministic planner', 'rejected', reason || 'llm_unavailable');
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

    // ── Control panel (Start / Pause / Reset / Clear Objective X + labels) ──
    function buildPanel() {
        var w = W();
        if (!w || !w.document || !w.document.body) return;
        if (_panel && _panel.parentNode) _panel.parentNode.removeChild(_panel);
        _panel = w.document.createElement('div');
        _panel.id = 'rmooz-free-fight-panel';
        _panel.style.cssText = ['position:fixed', 'top:128px', 'left:18px', 'z-index:9955', 'background:#0e1620', 'border:1px solid #7a3030', 'border-radius:8px', 'padding:12px 14px', 'min-width:320px', 'box-shadow:0 4px 20px rgba(0,0,0,.65)', 'color:#e8eaed', 'font-family:inherit', 'direction:ltr'].join(';');
        w.document.body.appendChild(_panel);
        updatePanel();
    }
    function updatePanel() {
        if (!_panel) return;
        var st = getState();
        var objLine = st.objective_set
            ? ('Objective X set · RED attack ' + st.red_groups + ' / BLUE react ' + st.blue_groups + ' · progress ' + Math.round(st.progress * 100) + '%' + (st.running ? ' · running' : (st.paused ? ' · paused' : '')))
            : 'No Objective X — place it on the map to begin.';
        var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
            '<div style="font-weight:700;color:#f0a0a0;font-size:13px;">Free Fight Demo — قتال تجريبي</div>' +
            '<button data-act="close" style="background:transparent;border:none;color:#8fa5b8;cursor:pointer;font-size:16px;">✕</button></div>';
        if (!st.objective_set) {
            html += '<button data-act="place-obj" style="font:inherit;cursor:pointer;border:1px solid #b8860b;background:#2a2412;color:#e0c060;border-radius:5px;padding:6px 10px;margin-bottom:8px;">＋ Place Objective X — ضع الهدف X</button>';
        } else {
            if (st.objective_source === 'reused_previous') html += '<div style="margin-bottom:4px;font-size:11px;color:#7fd6a0;">↻ Reusing previous Objective X — إعادة استخدام الهدف السابق</div>';
            html += '<button data-act="place-obj" style="font:inherit;cursor:pointer;border:1px solid #5a6270;background:#22303f;color:#cfe6ff;border-radius:5px;padding:6px 10px;margin-bottom:8px;">↻ Place new Objective X — ضع هدفاً جديداً</button>';
        }
        html += '<div style="margin:2px 0 8px;padding:7px 8px;border:1px solid #2a3f55;border-radius:5px;background:#0c141d;">' +
            '<label for="rmooz-ff-planner-mode" style="display:block;font-size:11px;color:#9ec2ec;margin-bottom:4px;">Mode:</label>' +
            '<select id="rmooz-ff-planner-mode" data-act="planner-mode" style="width:100%;font:inherit;font-size:12px;background:#101b27;color:#e8eaed;border:1px solid #4a5f75;border-radius:4px;padding:5px;">' +
            '<option value="deterministic"' + (_plannerMode === 'deterministic' ? ' selected' : '') + '>Deterministic Planner - RMOOZ planner, works offline</option>' +
            '<option value="llm"' + (_plannerMode === 'llm' ? ' selected' : '') + '>LLM Assisted - Qwen/LiteLLM advisory, needs model</option>' +
            '</select></div>';
        // FREE-FIGHT-CARD-VISIBILITY: the panel always opens; Start is gated on
        // Objective X (+ groups + anchors). No anchors → disabled + note; no
        // objective → disabled + "Place Objective X to start" note.
        var startBtn, startNote = '';
        if (!st.has_anchors) {
            startBtn = '<button data-act="start" disabled style="font:inherit;cursor:not-allowed;border:1px solid #3a5040;background:#162018;color:#5f8f74;border-radius:5px;padding:5px 10px;opacity:.55;">▶ Start AI Free Fight</button>';
            startNote = '<div style="margin:2px 0 6px;font-size:11px;color:#e0a93a;">No map anchors available — لا توجد مراسٍ على الخريطة</div>';
        } else if (!st.can_start) {
            startBtn = '<button data-act="start" disabled title="Place Objective X first" style="font:inherit;cursor:not-allowed;border:1px solid #3a5040;background:#162018;color:#5f8f74;border-radius:5px;padding:5px 10px;opacity:.6;">▶ Start AI Free Fight</button>';
            startNote = '<div style="margin:2px 0 6px;font-size:11px;color:#e0c060;">Place Objective X to start AI Free Fight<br>ضع الهدف X لبدء القتال التجريبي بالذكاء الاصطناعي</div>';
        } else {
            startBtn = '<button data-act="start" style="font:inherit;cursor:pointer;border:1px solid #2e7d54;background:#1f3a2b;color:#7fd6a0;border-radius:5px;padding:5px 10px;">▶ Start AI Free Fight</button>';
        }
        html += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">' +
            startBtn +
            '<button data-act="replan" style="font:inherit;cursor:pointer;border:1px solid #4a7bb8;background:#172436;color:#9ec2ec;border-radius:5px;padding:5px 10px;">Re-plan</button>' +
            '<button data-act="pause" style="font:inherit;cursor:pointer;border:1px solid #8a6a20;background:#2a2412;color:#e0c060;border-radius:5px;padding:5px 10px;">⏸ Pause</button>' +
            '<button data-act="reset" style="font:inherit;cursor:pointer;border:1px solid #5a6270;background:#2a2f37;color:#e8eaed;border-radius:5px;padding:5px 10px;">⟲ Reset</button>' +
            '<button data-act="clear-obj" style="font:inherit;cursor:pointer;border:1px solid #7a3030;background:#241414;color:#f0a0a0;border-radius:5px;padding:5px 10px;">✕ Clear Objective X</button></div>';
        html += startNote;
        if (_llmStatus && _llmStatus.message) {
            var statusColor = _llmStatus.state === 'received' ? '#7fd6a0' : (_llmStatus.state === 'loading' ? '#e0c060' : '#e0a93a');
            html += '<div style="margin:2px 0 6px;font-size:11px;color:' + statusColor + ';">' + esc(_llmStatus.message) + '</div>';
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
        _panel.innerHTML = html;
        bind('start', start); bind('replan', replan); bind('pause', pause); bind('reset', reset); bind('clear-obj', clearObjective); bind('close', clear);
        bind('place-obj', armPlaceObjective);
        var modeSel = _panel.querySelector('[data-act="planner-mode"]');
        if (modeSel && modeSel.addEventListener) modeSel.addEventListener('change', function () { setPlannerMode(modeSel.value); });
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
        var h = '<div style="font-weight:700;color:#9ec2ec;font-size:13px;margin-bottom:4px;">AI Free Fight Reasoning — تفسير قرار الذكاء الاصطناعي</div>' +
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

    function clear() {
        pause();
        var w = W();
        if (_layer && mapReady()) { try { if (w.map.hasLayer(_layer)) w.map.removeLayer(_layer); } catch (_) {} }
        _layer = null;
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
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = API;
    if (typeof window !== 'undefined') window.RmoozFreeFightDemo = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
