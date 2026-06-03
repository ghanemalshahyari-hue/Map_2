/* ============================================================================
 * world-state-transition.js — RMOOZ PR-WS3: the State Transition Engine
 * ----------------------------------------------------------------------------
 * Direction (authoritative, [[project_rmooz_direction_reset]]): close the loop
 *   World State → AI recommendation → OPERATOR DECISION → STATE TRANSITION
 *   → New World State → new decisions
 * This is the literal embodiment of "my decision changed the battle."
 *
 * applyDecision(worldState, decision) → { worldState, effects }
 *   - Pure: clones the input, never mutates it.
 *   - Composes DET1 (detection.js) + ENG1 (engagement.js): an ENGAGE decision is
 *     gated by real detection and resolved by the engagement rules; outcomes are
 *     applied to the target's strength/status and the shooter's magazine.
 *   - After EVERY decision it RECOMPUTES contacts, so the new world state reflects
 *     new detection (e.g. turning EMCON active reveals new contacts → new options).
 *   - Returns `effects[]`: an explainable changelog (feeds DOC1 / AI "why").
 *
 * Decision types: MOVE · SET_EMCON · SET_READINESS · SET_WRA · RESUPPLY · ENGAGE · NOTE.
 * Data-driven, framework-free (browser + Node), no hardcoded scenario logic.
 * ========================================================================== */
(function (root) {
    'use strict';

    var WS3_VERSION = '1.0.0-ws3';
    var DESTROY_AT = 0.1;                      // strength ≤ this → DESTROYED

    var DET = root.AppDetection || (typeof require === 'function' ? safeReq('./detection.js') : null);
    var ENG = root.AppEngagement || (typeof require === 'function' ? safeReq('./engagement.js') : null);
    function safeReq(p) { try { return require(p); } catch (_) { return null; } }
    function det() { return root.AppDetection || DET; }
    function eng() { return root.AppEngagement || ENG; }

    function clone(o) { try { return JSON.parse(JSON.stringify(o)); } catch (_) { return o; } }
    function num(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }
    function findUnit(ws, uid) {
        var u = (ws.units || []); for (var i = 0; i < u.length; i++) if (u[i].uid === uid) return u[i];
        return null;
    }
    function bearing(a, b) {
        if (root.AppWorldState && typeof root.AppWorldState._bearing === 'function') return root.AppWorldState._bearing(a, b);
        return null;
    }
    function recomputeContacts(ws, opts) {
        // PR-WS-DET1-A: contacts now owned by World State (DERIVATIONS).
        // Call applyDerivations to recompute all derived fields (contacts, balance, BLS, etc.)
        // after unit positions or state have changed via a decision.
        var ws1 = root.AppWorldState || (typeof require === 'function' ? safeReq('./world-state.js') : null);
        if (ws1 && typeof ws1.applyDerivations === 'function') {
            try { ws1.applyDerivations(ws); } catch (_) {}
        }
        // Fallback: if WS1 not available, call DET1 directly to maintain backward compat
        // (e.g., in server tests that don't have full WS1 loaded).
        if (!ws.derived || !ws.derived.contacts) {
            var d = det();
            if (d && typeof d.computeContacts === 'function') {
                try { ws.contacts = d.computeContacts(ws, (opts && opts.det) || {}); } catch (_) {}
            }
        }
        return ws;
    }

    /* ---- the transition --------------------------------------------------- */
    function applyDecision(worldState, decision, opts) {
        opts = opts || {};
        var ws = clone(worldState || {});
        ws.units = ws.units || [];
        var d = decision || {};
        var effects = [];
        var actor = findUnit(ws, d.actor || d.unit_uid || d.shooter);

        switch (d.type) {
            case 'MOVE':
                if (actor && Array.isArray(d.to) && d.to.length >= 2) {
                    var from = actor.position;
                    actor.kinematics = actor.kinematics || {};
                    actor.kinematics.prev = from;
                    actor.position = [d.to[0], d.to[1]];
                    actor.kinematics.heading = bearing(from, actor.position);
                    effects.push({ type: 'move', unit: actor.uid, from: from, to: actor.position });
                } else effects.push({ type: 'noop', reason: 'bad_move', unit: d.actor || null });
                break;

            case 'SET_EMCON':
                if (actor) {
                    var v = d.value || 'active';
                    (actor.sensors || []).forEach(function (s) {
                        if (d.sensor_id && s.id !== d.sensor_id) return;
                        if ((s.type || 'radar') === 'radar') s.emcon = v;
                    });
                    effects.push({ type: 'emcon', unit: actor.uid, value: v });
                }
                break;

            case 'SET_READINESS':
                if (actor) { actor.readiness = d.value || actor.readiness; effects.push({ type: 'readiness', unit: actor.uid, value: actor.readiness }); }
                break;

            case 'SET_WRA':
                if (actor) {
                    (actor.weapons || []).forEach(function (w) {
                        if (d.weapon_id && w.id !== d.weapon_id) return;
                        w.wra = Object.assign({}, w.wra, d.wra || {});
                    });
                    effects.push({ type: 'wra', unit: actor.uid, wra: d.wra || {} });
                }
                break;

            case 'RESUPPLY':
                if (actor) {
                    var add = num(d.value) != null ? d.value : 0.5;
                    actor.supply = Math.max(0, Math.min(1, (num(actor.supply) != null ? actor.supply : 0.5) + add));
                    if (d.refill_magazines && Array.isArray(actor.magazines)) {
                        actor.magazines.forEach(function (m) {
                            Object.keys(m.stock || {}).forEach(function (k) { if (d.refill_to) m.stock[k] = d.refill_to; });
                        });
                    }
                    effects.push({ type: 'resupply', unit: actor.uid, supply: actor.supply });
                }
                break;

            case 'ENGAGE':
                effects.push(resolveEngagement(ws, d, opts));
                break;

            default:
                effects.push({ type: 'note', note: d.note || null });
        }

        // The world changed → re-derive who can now be seen (new options emerge).
        recomputeContacts(ws, opts);

        ws.decisions = (ws.decisions || []).concat([{
            type: d.type || 'NOTE', actor: d.actor || d.unit_uid || d.shooter || null,
            target: d.target || null, effects: effects
        }]);
        return { worldState: ws, effects: effects };
    }

    // ENGAGE: detection-gated, resolved by ENG1, outcome applied to state.
    function resolveEngagement(ws, d, opts) {
        var e = eng(), shooter = findUnit(ws, d.shooter || d.actor), target = findUnit(ws, d.target);
        if (!shooter || !target) return { type: 'engagement', status: 'blocked', reason: 'unknown_unit' };
        if (!e || typeof e.computeEngagements !== 'function') return { type: 'engagement', status: 'blocked', reason: 'no_engine' };

        // detection gate: shooter's side must hold a contact on target (unless forced)
        // PR-WS-DET1-A: read contacts from World State (DERIVATIONS), with fallback to authored/computed.
        var contacts = (ws.derived && ws.derived.contacts) || (ws.contacts && ws.contacts.length ? ws.contacts : []);
        if (!contacts || !contacts.length) {
            // Last-resort fallback: compute contacts via DET1 (shouldn't happen in normal flow)
            var d_tmp = det();
            if (d_tmp && typeof d_tmp.computeContacts === 'function') {
                try { contacts = d_tmp.computeContacts(ws, (opts && opts.det) || {}) || []; } catch (_) { contacts = []; }
            }
        }
        var detected = contacts.some(function (c) { return c.detected_by_side === shooter.side && c.target_uid === target.uid; });
        if (!detected && !d.force) return { type: 'engagement', status: 'blocked', reason: 'no_detection', shooter: shooter.uid, target: target.uid };

        // resolve via ENG1 against just this pair (use a synthetic firm contact)
        var pairWs = { units: [shooter, target] };
        var synthetic = [{ target_uid: target.uid, detected_by_side: shooter.side, confidence: 'firm' }];
        var recs = e.computeEngagements(pairWs, synthetic, (opts && opts.eng) || {});
        var rec = recs.filter(function (r) { return r.status === 'engaged' && r.target === target.uid; })
                      .sort(function (a, b) { return b.pk_kill - a.pk_kill; })[0];
        if (!rec) {
            var blocked = recs.filter(function (r) { return r.target === target.uid; })[0];
            return { type: 'engagement', status: 'blocked', reason: (blocked && blocked.reason) || 'no_valid_weapon', shooter: shooter.uid, target: target.uid };
        }

        // apply outcome: expected attrition (deterministic, explainable — no fake RNG)
        var before = num(target.strength) != null ? target.strength : 1;
        var after = Math.max(0, before - rec.pk_kill);
        target.strength = after;
        if (after <= DESTROY_AT) { target.strength = 0; target.status = 'DESTROYED'; }
        else target.status = target.status === 'DESTROYED' ? 'DEGRADED' : (target.status || 'DEGRADED');

        // decrement the firing weapon's magazine by the salvo
        var w = (shooter.weapons || []).filter(function (x) { return (x.id || x.class) === rec.weapon; })[0];
        if (w) {
            var mag = (shooter.magazines || []).filter(function (m) { return m.mount === w.mount; })[0];
            var key = w.type || w.class || 'rounds';
            if (mag && mag.stock && mag.stock[key] != null) mag.stock[key] = Math.max(0, mag.stock[key] - rec.salvo);
        }

        return {
            type: 'engagement', status: 'engaged', shooter: shooter.uid, target: target.uid,
            weapon: rec.weapon, salvo: rec.salvo, pk_kill: rec.pk_kill,
            strength_before: +before.toFixed(3), strength_after: +target.strength.toFixed(3),
            target_status: target.status, range_nm: rec.range_nm
        };
    }

    // Apply several decisions in one tick (fold), recomputing contacts each time.
    function applyDecisions(worldState, decisions, opts) {
        var ws = worldState, all = [];
        (decisions || []).forEach(function (d) {
            var res = applyDecision(ws, d, opts);
            ws = res.worldState; all = all.concat(res.effects);
        });
        return { worldState: ws, effects: all };
    }

    var api = {
        WS3_VERSION: WS3_VERSION, DESTROY_AT: DESTROY_AT,
        applyDecision: applyDecision, applyDecisions: applyDecisions
    };
    root.AppWorldStateTransition = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
