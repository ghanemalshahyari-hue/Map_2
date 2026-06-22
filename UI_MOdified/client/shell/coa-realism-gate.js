'use strict';
/* ============================================================================
 * coa-realism-gate.js — RMOOZ-COA-REALISM-GATE-A
 * ----------------------------------------------------------------------------
 * COA realism / sovereign-territory validation gate for the Free Fight demo.
 *
 * Provides heuristic theatre-bbox territory classification and per-step
 * movement / initial-placement / objective-capture / input-completeness
 * validation. Review-only — no classified data, no kill logic, no DOM,
 * no fetch, pure synchronous.
 *
 * Exports (window.RmoozCoaRealismGate + CommonJS module.exports):
 *   classifyPosition(lat, lon)
 *     → { region_id, name, side_association, domain, source }
 *
 *   validatePlacement(unit)
 *     → { ok, reason?, territory, violation_type?, warning? }
 *
 *   validateMovementStep(fromLat, fromLon, toLat, toLon, opts)
 *     opts: { unit_id?, side?, movement_mode? }
 *     → { ok, held, reason?, violation_type?, domain_crossing?, movement_mode_required? }
 *
 *   gateObjectiveCapture(side, outcome, movementLog)
 *     movementLog: [{ uid, side, validated, violation_type? }]
 *     → { capture_valid, gate_applied, violation_count?, reason? }
 *
 *   scoreInputCompleteness(brief)
 *     → { score, label, missing_fields[], checked, passed }
 *
 * Safety stamps: demo_only:true, review_only:true, source:'RMOOZ-COA-REALISM-GATE-A'
 * ========================================================================== */
(function (root) {
    'use strict';

    // ── Theatre bounding boxes ────────────────────────────────────────────────
    // Evaluated in PRIORITY ORDER. Arabian Gulf (water) is checked FIRST so it
    // overrides the Arabian Peninsula overlap. All review-only heuristic data.
    var THEATRES = [
        {
            region_id: 'arabian_gulf', name: 'Arabian Gulf', side_association: 'neutral', domain: 'water',
            minLat: 23.5, maxLat: 29.5, minLon: 47.5, maxLon: 57.0, priority: 1
        },
        {
            region_id: 'iran', name: 'Iran', side_association: 'RED', domain: 'land',
            minLat: 25.0, maxLat: 39.8, minLon: 44.0, maxLon: 63.5, priority: 2
        },
        {
            region_id: 'arabian_peninsula', name: 'Arabian Peninsula / GCC', side_association: 'BLUE', domain: 'land',
            minLat: 12.0, maxLat: 30.5, minLon: 35.0, maxLon: 60.0, priority: 3
        },
    ];

    var VALID_CROSSING_MODES = ['naval', 'amphibious', 'sea', 'maritime', 'airlift', 'air', 'airborne', 'airdrop'];

    var TEMPLATE_PLACEHOLDERS = ['tbd', 'todo', 'placeholder', 'n/a', 'unknown', 'example', 'fill in', 'to be determined'];

    // ── Territory classification ──────────────────────────────────────────────
    function _classifyRaw(lat, lon) {
        var sorted = THEATRES.slice().sort(function (a, b) { return a.priority - b.priority; });
        for (var i = 0; i < sorted.length; i++) {
            var t = sorted[i];
            if (lat >= t.minLat && lat <= t.maxLat && lon >= t.minLon && lon <= t.maxLon) {
                return { region_id: t.region_id, name: t.name, side_association: t.side_association, domain: t.domain, source: 'theatre_bbox_heuristic' };
            }
        }
        return { region_id: 'unknown', name: 'Outside modeled theatre', side_association: 'neutral', domain: 'unknown', source: 'theatre_bbox_heuristic' };
    }

    /**
     * classifyPosition(lat, lon) → { region_id, name, side_association, domain, source }
     * Heuristic theatre-bbox classification. Review-only.
     */
    function classifyPosition(lat, lon) {
        return _classifyRaw(Number(lat), Number(lon));
    }

    // ── Placement validation ──────────────────────────────────────────────────
    /**
     * validatePlacement(unit)
     * unit: { id?, side, lat, lon, forward_deployed?, movement_mode? }
     * → { ok, reason?, territory, violation_type?, warning? }
     *
     * Rules:
     *  • BLUE unit in RED/Iran territory → blocked unless forward_deployed:true
     *  • RED unit in BLUE territory → advisory warning (not blocked)
     *  • Land unit placed in water zone without naval/amphibious → blocked
     */
    function validatePlacement(unit) {
        if (!unit) return { ok: false, reason: 'unit is null', territory: null, violation_type: 'null_unit' };
        var lat = Number(unit.lat), lon = Number(unit.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            return { ok: false, reason: 'Unit has no valid coordinate.', territory: null, violation_type: 'no_coordinate' };
        }
        var side = String(unit.side || '').toUpperCase();
        var territory = _classifyRaw(lat, lon);

        if (side === 'BLUE' && territory.side_association === 'RED') {
            if (unit.forward_deployed === true) {
                return { ok: true, territory: territory, warning: 'BLUE unit in RED/Iran territory — forward_deployed flag accepted. Verify operator intent.' };
            }
            return { ok: false, territory: territory, violation_type: 'blue_in_red_territory',
                reason: 'BLUE unit ' + (unit.id || '?') + ' placed inside RED/Iran territory without forward_deployed authorization — invalid initial placement.' };
        }

        if (side === 'RED' && territory.side_association === 'BLUE') {
            return { ok: true, territory: territory, warning: 'RED unit ' + (unit.id || '?') + ' placed inside BLUE/GCC territory — verify scenario intent (assault start position?).' };
        }

        // NOTE: water-zone placement is not flagged here — coastal GCC units (UAE, Qatar) fall
        // within the Gulf bbox and would produce false positives. Domain/water checks apply only
        // to movement steps (validateMovementStep), not to initial placement.

        return { ok: true, territory: territory };
    }

    // ── Movement step validation ──────────────────────────────────────────────
    /**
     * validateMovementStep(fromLat, fromLon, toLat, toLon, opts)
     * opts: { unit_id?, side?, movement_mode? }
     * → { ok, held, reason?, violation_type?, domain_crossing?, movement_mode_required? }
     *
     * Called for each single-tick move step (one capped step, ≈5-6 km).
     * DOES NOT block movement between two RED-territory points for RED units.
     */
    function validateMovementStep(fromLat, fromLon, toLat, toLon, opts) {
        opts = opts || {};
        var side = String(opts.side || '').toUpperCase();
        var mode = String(opts.movement_mode || '').toLowerCase();
        var modeValid = VALID_CROSSING_MODES.indexOf(mode) !== -1;
        var toT = _classifyRaw(Number(toLat), Number(toLon));

        // BLUE unit attempting to move INTO RED/Iran territory
        if (side === 'BLUE' && toT.side_association === 'RED') {
            return { ok: false, held: true, violation_type: 'blue_through_red_territory',
                reason: 'BLUE unit ' + (opts.unit_id || '?') + ' movement enters RED/Iran territory — held.',
                domain_crossing: true };
        }

        // Any unit moving INTO the water zone without a valid naval/air mode
        if (toT.domain === 'water' && !modeValid) {
            return { ok: false, held: true, violation_type: 'water_crossing_without_transport',
                reason: 'Unit ' + (opts.unit_id || '?') + ' path enters ' + toT.name + ' without naval/airlift transport — movement held.',
                domain_crossing: true, movement_mode_required: 'naval or airlift' };
        }

        // Unit exiting water (amphibious landing) without amphibious mode
        var fromT = _classifyRaw(Number(fromLat), Number(fromLon));
        if (fromT.domain === 'water' && toT.domain === 'land' && mode !== 'amphibious' && mode !== 'naval') {
            return { ok: false, held: true, violation_type: 'amphibious_landing_without_mode',
                reason: 'Unit ' + (opts.unit_id || '?') + ' amphibious landing without amphibious/naval mode — movement held.',
                domain_crossing: true, movement_mode_required: 'amphibious' };
        }

        return { ok: true, held: false, domain_crossing: fromT.domain !== toT.domain };
    }

    // ── Objective capture gate ────────────────────────────────────────────────
    /**
     * gateObjectiveCapture(side, outcome, movementLog)
     * outcome: ignored (gate reads movementLog)
     * movementLog: [{ uid, side, validated, violation_type? }]
     * → { capture_valid, gate_applied, violation_count, reason? }
     *
     * Blocks objective_control=red when the capturing side has unresolved
     * movement violations (e.g. water crossings without transport).
     */
    function gateObjectiveCapture(side, outcome, movementLog) {
        var sideUp = String(side || '').toUpperCase();
        var log = Array.isArray(movementLog) ? movementLog : [];
        var sideLog = log.filter(function (e) { return e && String(e.side || '').toUpperCase() === sideUp; });
        var violations = sideLog.filter(function (e) { return e.validated === false || (e.violation_type && e.violation_type !== ''); });

        if (violations.length > 0) {
            var vtypes = violations.map(function (e) { return e.violation_type || 'unknown'; })
                .filter(function (v, i, a) { return a.indexOf(v) === i; }).join(', ');
            return {
                capture_valid: false, gate_applied: true, violation_count: violations.length,
                reason: 'Objective capture blocked — ' + violations.length + ' unresolved movement violation(s) for ' + sideUp + ' (' + vtypes + '). Feasibility not proven.',
            };
        }

        return { capture_valid: true, gate_applied: true, violation_count: 0 };
    }

    // ── Input completeness scoring ────────────────────────────────────────────
    /**
     * scoreInputCompleteness(brief)
     * → { score (0-100), label ('complete'|'partial'|'template'), missing_fields[], checked, passed }
     *
     * Detects template/placeholder input. Used to label COAs as assumption-based
     * when the Step-1 input is too sparse to support realistic planning.
     */
    var SCORED_FIELDS = [
        { key: 'mission',          path: ['operational_brief', 'mission'] },
        { key: 'commander_intent', path: ['operational_brief', 'commander_intent'] },
        { key: 'proposed_units',   path: ['operational_brief', 'proposed_units'] },
        { key: 'objectives',       path: ['operational_brief', 'objectives'] },
        { key: 'theatre',          path: ['operational_brief', 'theatre'] },
        { key: 'red_forces',       path: ['operational_brief', 'red_forces'] },
        { key: 'timeline',         path: ['operational_brief', 'timeline'] },
        { key: 'constraints',      path: ['operational_brief', 'constraints'] },
    ];

    function _getPath(obj, path) {
        var cur = obj;
        for (var i = 0; i < path.length; i++) { if (!cur || typeof cur !== 'object') return undefined; cur = cur[path[i]]; }
        return cur;
    }

    function _isTemplateValue(v) {
        if (v == null || v === undefined) return true;
        if (typeof v === 'string') {
            var low = v.trim().toLowerCase();
            if (!low || low.length < 2) return true;
            for (var i = 0; i < TEMPLATE_PLACEHOLDERS.length; i++) { if (low.indexOf(TEMPLATE_PLACEHOLDERS[i]) !== -1) return true; }
        }
        if (Array.isArray(v)) return v.length === 0;
        return false;
    }

    function scoreInputCompleteness(brief) {
        var b = brief || {};
        var missing = [], passed = 0;
        var total = SCORED_FIELDS.length;
        SCORED_FIELDS.forEach(function (f) {
            var v = _getPath(b, f.path);
            if (_isTemplateValue(v)) { missing.push(f.key); } else { passed++; }
        });
        var score = Math.round((passed / total) * 100);
        var label = (passed === 0) ? 'template' : (score >= 80 ? 'complete' : (score >= 40 ? 'partial' : 'template'));
        return { score: score, label: label, missing_fields: missing, checked: total, passed: passed };
    }

    // ── Module export ─────────────────────────────────────────────────────────
    var API = {
        classifyPosition:        classifyPosition,
        validatePlacement:       validatePlacement,
        validateMovementStep:    validateMovementStep,
        gateObjectiveCapture:    gateObjectiveCapture,
        scoreInputCompleteness:  scoreInputCompleteness,
        THEATRES:                THEATRES,
        demo_only:               true,
        review_only:             true,
        source:                  'RMOOZ-COA-REALISM-GATE-A',
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = API;
    // Browser and test-harness (global.window) assignment
    if (typeof window !== 'undefined') window.RmoozCoaRealismGate = API;
    if (root && root !== (typeof window !== 'undefined' ? window : undefined)) root.RmoozCoaRealismGate = API;

}(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this)));
