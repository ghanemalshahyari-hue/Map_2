/**
 * War-Game turn engine (Chunks 05 + 06 MVP slice).
 *
 * Discovers the hostile formation (arrow + slot markers, sharing a
 * formationId stamped at import time), projects each enemy unit onto the
 * arrow's straight axis to capture its (s, lateral-offset) "slot," then
 * advances every unit's s by stepKm per turn while preserving its offset.
 * After each step the engine scans for contact: any enemy unit within
 * CONTACT_KM of a friendly marker freezes the sim and flashes the HUD.
 *
 * Depends on globals exposed by app.js:
 *   - window.AppFormation     listFormations / getMembers / centroid
 *   - window.AppWarGame       captureSnapshot (per-turn freeze)
 *   - window.map              Leaflet map (for friendly-marker scan)
 *
 * Public surface: window.AppTurnEngine = { init, nextTurn, reset, state }
 */
(function () {
    'use strict';

    const STEP_KM_DEFAULT = 5;
    const CONTACT_KM      = 5;
    const ANIMATION_MS    = 800;
    const KM_PER_DEG_LAT  = 110.574;
    const kmPerDegLng = (lat) => 111.32 * Math.cos(lat * Math.PI / 180);

    function distKm(a, b) {
        const refLat = (a.lat + b.lat) / 2;
        const kmN = (b.lat - a.lat) * KM_PER_DEG_LAT;
        const kmE = (b.lng - a.lng) * kmPerDegLng(refLat);
        return Math.hypot(kmE, kmN);
    }
    function latLngToKm(ll, origin) {
        return {
            kmE: (ll.lng - origin.lng) * kmPerDegLng(origin.lat),
            kmN: (ll.lat - origin.lat) * KM_PER_DEG_LAT
        };
    }
    function kmToLatLng(kmE, kmN, origin) {
        return L.latLng(
            origin.lat + kmN / KM_PER_DEG_LAT,
            origin.lng + kmE / kmPerDegLng(origin.lat)
        );
    }
    function latLngAtBearingKm(origin, distanceKm, bearingDeg) {
        const th = bearingDeg * Math.PI / 180;
        return kmToLatLng(distanceKm * Math.sin(th), distanceKm * Math.cos(th), origin);
    }
    const affiliationDigit = (sidc) =>
        (sidc && typeof sidc === 'string' && sidc.length >= 4) ? sidc[3] : '';

    let state    = null;
    let hud      = null;
    let animState = null;   // { startTime, duration, targets, arrowMoveKm, arrowApplied, pendingTurn }

    // ── Discovery ──────────────────────────────────────────────────────
    function findEnemyFormation() {
        if (!window.AppFormation) return null;
        const formations = window.AppFormation.listFormations();
        for (const f of formations) {
            const members = window.AppFormation.getMembers(f.id);
            const arrow = members.find(m =>
                m instanceof L.LayerGroup && m._tmgData && m._tmgData.isCatkMultiPoint);
            if (!arrow) continue;
            const markers = members.filter(m => m instanceof L.Marker);
            const anyHostile = markers.some(m => affiliationDigit(m._sidc) === '6');
            if (anyHostile && markers.length) return { id: f.id, arrow, markers };
        }
        return null;
    }

    function findFriendlyMarkers() {
        const out = [];
        if (!window.map || typeof window.map.eachLayer !== 'function') return out;
        window.map.eachLayer(layer => {
            if (layer instanceof L.Marker && affiliationDigit(layer._sidc) === '3') {
                out.push(layer);
            }
        });
        return out;
    }

    // ── Axis extraction ────────────────────────────────────────────────
    function extractAxisFromArrow(arrow) {
        const data = arrow && arrow._tmgData;
        if (!data) return null;
        const params = data.arrowParams;
        if (params && params.tip
            && Number.isFinite(params.tailLengthKm)
            && Number.isFinite(params.neckOffsetKm)
            && Number.isFinite(params.directionDeg)) {
            const tip = L.latLng(params.tip.lat, params.tip.lng);
            const totalKm = params.tailLengthKm + params.neckOffsetKm;
            const tail = latLngAtBearingKm(tip, totalKm, (params.directionDeg + 180) % 360);
            return { tail, tip, lengthKm: totalKm, directionDeg: params.directionDeg };
        }
        // Legacy fallback: use centerline points [tip, ..., tail]
        if (Array.isArray(data.points) && data.points.length >= 2) {
            const tip  = L.latLng(data.points[0].lat, data.points[0].lng);
            const last = data.points[data.points.length - 1];
            const tail = L.latLng(last.lat, last.lng);
            const lengthKm = distKm(tail, tip);
            const refLat = (tip.lat + tail.lat) / 2;
            const dE = (tip.lng - tail.lng) * kmPerDegLng(refLat);
            const dN = (tip.lat - tail.lat) * KM_PER_DEG_LAT;
            const directionDeg = (Math.atan2(dE, dN) * 180 / Math.PI + 360) % 360;
            return { tail, tip, lengthKm, directionDeg };
        }
        return null;
    }

    // ── Slot projection / reconstruction ───────────────────────────────
    // Axis unit (east, north) = (sinθ, cosθ); perp unit (90° CCW) = (-cosθ, sinθ).
    function projectToAxis(ll, axis) {
        const th = axis.directionDeg * Math.PI / 180;
        const sinTh = Math.sin(th), cosTh = Math.cos(th);
        const loc = latLngToKm(ll, axis.tail);
        return {
            s:      loc.kmE * sinTh  + loc.kmN * cosTh,
            offset: loc.kmE * -cosTh + loc.kmN * sinTh,
        };
    }
    function positionAtAxis(s, offset, axis) {
        const th = axis.directionDeg * Math.PI / 180;
        const sinTh = Math.sin(th), cosTh = Math.cos(th);
        const kmE = s * sinTh - offset * cosTh;
        const kmN = s * cosTh + offset * sinTh;
        return kmToLatLng(kmE, kmN, axis.tail);
    }

    function shiftLatLng(ll, dLat, dLng) {
        if (!ll || typeof ll.lat !== 'number' || typeof ll.lng !== 'number') return ll;
        return L.latLng(ll.lat + dLat, ll.lng + dLng);
    }

    function shiftLatLngs(latlngs, dLat, dLng) {
        if (!Array.isArray(latlngs)) return latlngs;
        return latlngs.map(item => Array.isArray(item)
            ? shiftLatLngs(item, dLat, dLng)
            : shiftLatLng(item, dLat, dLng));
    }

    function shiftArrowParams(params, dLat, dLng) {
        if (!params || !params.tip) return params;
        return { ...params, tip: shiftLatLng(params.tip, dLat, dLng) };
    }

    function translateArrowLayer(arrow, dLat, dLng) {
        if (!arrow || !Number.isFinite(dLat) || !Number.isFinite(dLng)) return false;
        if (Math.abs(dLat) < 1e-14 && Math.abs(dLng) < 1e-14) return false;

        const shifted = new Set();
        const shiftMarker = (marker) => {
            if (!marker || shifted.has(marker) || typeof marker.getLatLng !== 'function') return;
            marker.setLatLng(shiftLatLng(marker.getLatLng(), dLat, dLng));
            const md = marker._tmgData;
            if (md) {
                md.latlng1 = shiftLatLng(md.latlng1, dLat, dLng);
                md.latlng2 = shiftLatLng(md.latlng2, dLat, dLng);
                md.arrowParams = shiftArrowParams(md.arrowParams, dLat, dLng);
            }
            shifted.add(marker);
        };
        const shiftPath = (path) => {
            if (!path || shifted.has(path) || typeof path.getLatLngs !== 'function') return;
            path.setLatLngs(shiftLatLngs(path.getLatLngs(), dLat, dLng));
            shifted.add(path);
        };

        const data = arrow._tmgData;
        if (data) {
            if (Array.isArray(data.points)) data.points = shiftLatLngs(data.points, dLat, dLng);
            data.arrowParams = shiftArrowParams(data.arrowParams, dLat, dLng);
            data.lockedArrowParams = shiftArrowParams(data.lockedArrowParams, dLat, dLng);
            data.latlng1 = shiftLatLng(data.latlng1, dLat, dLng);
            data.latlng2 = shiftLatLng(data.latlng2, dLat, dLng);
            shiftPath(data.tailPolyline);
            shiftMarker(data.headMarker);
        }

        if (typeof arrow.eachLayer === 'function') {
            arrow.eachLayer(layer => {
                if (layer instanceof L.Marker) shiftMarker(layer);
                else if (layer instanceof L.Polyline) shiftPath(layer);
            });
        }
        return true;
    }

    function moveArrowAlongAxis(deltaKm) {
        if (!state || !state.arrow || !state.axis || !Number.isFinite(deltaKm) || deltaKm === 0) return false;
        const from = state.axis.tail;
        const to = positionAtAxis(deltaKm, 0, state.axis);
        return translateArrowLayer(state.arrow, to.lat - from.lat, to.lng - from.lng);
    }

// Combat configuration
const COMBAT_CONFIG = {
    // Base combat values (can be modified by unit type, experience, etc.)
    BASE_ATTACK: 10,
    BASE_DEFENSE: 8,
    // Combat resolution parameters
    COMBAT_DICE_SIDES: 6,
    // Terrain modifiers (simplified)
    TERRAIN_MODIFIERS: {
        open: 1.0,
        rough: 0.8,
        urban: 0.6,
        forest: 0.7
    }
};

// Track ongoing combats
let activeCombats = [];

// ── Public API ─────────────────────────────────────────────────────
function init() {
        const formation = findEnemyFormation();
        if (!formation) {
            showToast('No hostile formation found — import enemy.geojson first.', 'warn');
            return { error: 'no-formation' };
        }
        const axis = extractAxisFromArrow(formation.arrow);
        if (!axis) {
            showToast('Arrow has no usable axis.', 'warn');
            return { error: 'no-axis' };
        }
        const unitPaths = formation.markers.map(m => {
            const ll   = m.getLatLng();
            const proj = projectToAxis(ll, axis);
            return {
                marker:        m,
                unitCode:      m._slotUnitCode || (m._tmgData?.textModifiers?.uniqueDesignation) || '?',
                initialLatLng: L.latLng(ll.lat, ll.lng),
                initialS:      proj.s,
                s:             proj.s,
                offset:        proj.offset,
            };
        });
        const friendlyMarkers = findFriendlyMarkers();
        state = {
            formationId: formation.id,
            arrow:       formation.arrow,
            axis,
            unitPaths,
            friendlyMarkers,
            turn:        0,
            advancedKm:  0,
            stopped:     false,
            contact:     null,
            snapshots:   [],
            arrowOffsetKm: 0,
        };
        renderHud();
        return {
            ok:         true,
            units:      unitPaths.length,
            friendlies: friendlyMarkers.length,
            lengthKm:   +axis.lengthKm.toFixed(1),
        };
    }

    function nextTurn(stepKm) {
        if (animState) return { error: 'animating' };
        if (!state) {
            const r = init();
            if (r.error) return r;
        }
        if (state.stopped) {
            // If the prior contact was resolved by a kill (one side destroyed),
            // let the player resume. Stalemates keep the sim halted so we don't
            // refight the same neighbours on every click.
            const last = activeCombats[activeCombats.length - 1];
            const conflictResolved = last && (last.attackerDestroyed || last.defenderDestroyed);
            const sidesAlive = state.unitPaths.length > 0 && state.friendlyMarkers.length > 0;
            if (conflictResolved && sidesAlive) {
                state.stopped = false;
                state.contact = null;
            } else {
                return { error: 'stopped', reason: state.contact ? 'contact' : 'end-of-arrow' };
            }
        }
        const step = Number.isFinite(stepKm) ? stepKm : STEP_KM_DEFAULT;

        // Precompute targets; defer state.turn++ until finalize so a mid-animation
        // reset doesn't leave the counter ahead of the actual finalized state.
        const targets = state.unitPaths.map(up => ({
            up,
            oldS: up.s,
            newS: Math.min(up.s + step, state.axis.lengthKm),
        }));
        const anyMoved    = targets.some(t => t.newS > t.oldS);
        const arrowMoveKm = targets.reduce((m, t) => Math.max(m, t.newS - t.oldS), 0);
        const pendingTurn = state.turn + 1;

        if (!anyMoved) {
            // Zero advance — nothing to animate. Finalize immediately so the
            // end-of-arrow stop still trips.
            return finalizeTurn(arrowMoveKm, targets, pendingTurn);
        }

        animState = {
            startTime:    performance.now(),
            duration:     ANIMATION_MS,
            targets,
            arrowMoveKm,
            arrowApplied: 0,
            pendingTurn,
        };
        setNextButtonDisabled(true);
        renderHud();
        requestAnimationFrame(stepAnimation);
        return { turn: pendingTurn, animating: true };
    }

    function stepAnimation(now) {
        if (!animState) return;
        const elapsed = now - animState.startTime;
        const p = Math.min(1, Math.max(0, elapsed / animState.duration));
        const eased = 1 - (1 - p) * (1 - p); // ease-out quad

        // Slide every unit along its slot
        for (const t of animState.targets) {
            const s = t.oldS + (t.newS - t.oldS) * eased;
            t.up.marker.setLatLng(positionAtAxis(s, t.up.offset, state.axis));
        }
        // Drag the arrow incrementally so the cumulative shift matches eased progress
        const targetArrowKm = animState.arrowMoveKm * eased;
        const frameDeltaKm  = targetArrowKm - animState.arrowApplied;
        if (Math.abs(frameDeltaKm) > 1e-9) {
            moveArrowAlongAxis(frameDeltaKm);
            animState.arrowApplied = targetArrowKm;
        }

        if (p < 1) {
            requestAnimationFrame(stepAnimation);
            return;
        }
        // Snap to exact targets to absorb floating-point drift, then hand off
        for (const t of animState.targets) {
            t.up.marker.setLatLng(positionAtAxis(t.newS, t.up.offset, state.axis));
        }
        const targets     = animState.targets;
        const arrowMoveKm = animState.arrowMoveKm;
        const pendingTurn = animState.pendingTurn;
        animState = null;
        setNextButtonDisabled(false);
        finalizeTurn(arrowMoveKm, targets, pendingTurn);
    }

    function finalizeTurn(arrowMoveKm, targets, pendingTurn) {
        // Commit unit s-values + bookkeeping
        for (const t of targets) t.up.s = t.newS;
        state.turn        = pendingTurn;
        state.arrowOffsetKm += arrowMoveKm;
        state.advancedKm    += arrowMoveKm;

        // Contact: any enemy within CONTACT_KM of any friendly
        let contact = null;
        outer: for (const up of state.unitPaths) {
            const eLL = up.marker.getLatLng();
            for (const fm of state.friendlyMarkers) {
                const d = distKm(eLL, fm.getLatLng());
                if (d <= CONTACT_KM) {
                    contact = {
                        enemy:    up.unitCode,
                        friendly: fm._slotUnitCode
                                  || (fm._tmgData?.textModifiers?.uniqueDesignation)
                                  || '?',
                        km: +d.toFixed(2),
                    };
                    break outer;
                }
            }
        }

        // Snapshot (best-effort)
        try {
            if (window.AppWarGame && typeof window.AppWarGame.captureSnapshot === 'function') {
                state.snapshots.push({
                    turn:     state.turn,
                    snapshot: window.AppWarGame.captureSnapshot(),
                });
            }
        } catch (_) { /* ignore */ }

        const atEnd    = state.unitPaths.every(up => up.s >= state.axis.lengthKm);
        const anyMoved = arrowMoveKm > 0;
        if (contact) {
            // Inbound: enemy fires on the friendly.
            const inbound = resolveCombat(
                { unitCode: contact.enemy },
                { unitCode: contact.friendly },
                contact.km
            );
            inbound.kind = 'inbound';
            activeCombats.push(inbound);
            applyCombatResult(inbound, { attackerIsEnemy: true });

            // Return fire: every friendly still alive and within CONTACT_KM of
            // the engaging enemy gets one shot (in order). Loop ends early
            // if the enemy is destroyed.
            const engaging = state.unitPaths.find(up => up.unitCode === contact.enemy);
            if (engaging) {
                const responders = state.friendlyMarkers.slice().filter(fm =>
                    distKm(engaging.marker.getLatLng(), fm.getLatLng()) <= CONTACT_KM
                );
                for (const fm of responders) {
                    if (!state.unitPaths.includes(engaging)) break; // enemy down, no target left
                    if (!state.friendlyMarkers.includes(fm))   continue; // friendly already gone
                    const friendlyCode = fm._slotUnitCode
                                      || (fm._tmgData?.textModifiers?.uniqueDesignation)
                                      || '?';
                    const d = distKm(engaging.marker.getLatLng(), fm.getLatLng());
                    const ret = resolveCombat(
                        { unitCode: friendlyCode },
                        { unitCode: engaging.unitCode },
                        d
                    );
                    ret.kind = 'return';
                    activeCombats.push(ret);
                    applyCombatResult(ret, { attackerIsEnemy: false });
                }
            }

            state.contact = contact;
            state.stopped = true;
            flashContact(contact);
        } else if (atEnd || !anyMoved) {
            state.stopped = true;
        }
        renderHud();
        return { turn: state.turn, stopped: state.stopped, contact, advancedKm: state.advancedKm };
    }

    function cancelAnimation() {
        if (!animState) return;
        // Roll back the partial arrow shift so callers (reset/init) see a clean
        // pre-animation arrow position. Unit markers are also snapped back.
        if (animState.arrowApplied) {
            moveArrowAlongAxis(-animState.arrowApplied);
        }
        for (const t of animState.targets) {
            t.up.marker.setLatLng(positionAtAxis(t.oldS, t.up.offset, state.axis));
        }
        animState = null;
        setNextButtonDisabled(false);
    }

    function setNextButtonDisabled(disabled) {
        const btn = hud && hud.querySelector && hud.querySelector('#wg-next');
        if (!btn) return;
        btn.disabled = !!disabled;
        btn.style.opacity = disabled ? '0.5' : '1';
        btn.style.cursor  = disabled ? 'not-allowed' : 'pointer';
    }

    function reset() {
        cancelAnimation();
        if (!state) return;
        if (state.arrowOffsetKm) {
            moveArrowAlongAxis(-state.arrowOffsetKm);
            state.arrowOffsetKm = 0;
        }
        for (const up of state.unitPaths) {
            up.marker.setLatLng(up.initialLatLng);
            up.s = up.initialS;
        }
        state.turn       = 0;
        state.advancedKm = 0;
        state.stopped    = false;
        state.contact    = null;
        state.snapshots  = [];
        activeCombats = [];
        renderHud();
    }

    // ── HUD ────────────────────────────────────────────────────────────
    function ensureHud() {
        if (hud && document.body.contains(hud)) return hud;
        hud = document.createElement('div');
        hud.id = 'wargame-hud';
        hud.style.cssText = [
            'position:fixed', 'top:120px', 'left:50%', 'transform:translateX(-50%)', 'z-index:99999',
            'background:rgba(15,23,42,0.92)', 'color:#e2e8f0',
            'border:1px solid rgba(148,163,184,0.4)', 'border-radius:8px',
            'padding:10px 12px', 'font:13px/1.4 system-ui,sans-serif',
            'box-shadow:0 4px 12px rgba(0,0,0,0.3)', 'min-width:240px', 'max-width:calc(100vw - 32px)',
            'direction:ltr', 'text-align:left',
        ].join(';');
        hud.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                <span style="font-weight:700;color:#f87171;">War Game</span>
                <span id="wg-min" style="cursor:pointer;color:#94a3b8;font-size:11px;user-select:none;">[ – ]</span>
            </div>
            <div id="wg-body">
                <div id="wg-status" style="font-size:12px;margin-bottom:8px;color:#cbd5e1;">Not started</div>
                <div style="display:flex;gap:6px;flex-wrap:wrap;">
                    <button id="wg-init"  style="flex:1;padding:6px 8px;background:#3b82f6;border:none;border-radius:4px;color:white;cursor:pointer;font-size:12px;">Start</button>
                    <button id="wg-next"  style="flex:1;padding:6px 8px;background:#10b981;border:none;border-radius:4px;color:white;cursor:pointer;font-size:12px;">Next Turn</button>
                    <button id="wg-reset" style="flex:1;padding:6px 8px;background:#64748b;border:none;border-radius:4px;color:white;cursor:pointer;font-size:12px;">Reset</button>
                </div>
                <div style="margin-top:6px;font-size:11px;color:#94a3b8;">Step ${STEP_KM_DEFAULT} km · slide ${ANIMATION_MS} ms · contact ≤ ${CONTACT_KM} km</div>
            </div>
        `;
        document.body.appendChild(hud);

        hud.querySelector('#wg-init').addEventListener('click', () => {
            cancelAnimation();
            state = null;
            const r = init();
            if (r && r.ok) {
                showToast(`Initialized: ${r.units} enemy, ${r.friendlies} friendly, arrow ${r.lengthKm} km`, 'info');
            }
        });
        hud.querySelector('#wg-next').addEventListener('click', () => nextTurn());
        hud.querySelector('#wg-reset').addEventListener('click', () => reset());

        const minBtn = hud.querySelector('#wg-min');
        const body   = hud.querySelector('#wg-body');
        minBtn.addEventListener('click', () => {
            const hidden = body.style.display === 'none';
            body.style.display = hidden ? 'block' : 'none';
            minBtn.textContent = hidden ? '[ – ]' : '[ + ]';
        });

        return hud;
    }

    function showHud() {
        const el = ensureHud();
        el.style.display = 'block';
        el.style.visibility = 'visible';
        return el;
    }

    function renderHud() {
        const el = ensureHud();
        const status = el.querySelector('#wg-status');
        if (!state) { status.textContent = 'Not started'; return; }
        const lines = [
            `Turn: <b>${state.turn}</b> · Advanced: <b>${state.advancedKm.toFixed(1)} km</b>`,
            `Arrow: ${state.axis.lengthKm.toFixed(1)} km · ${state.unitPaths.length} units · ${state.friendlyMarkers.length} friendly`,
        ];
        if (animState) {
            lines.push(`<span style="color:#60a5fa;">Animating turn ${animState.pendingTurn}…</span>`);
        } else if (state.contact) {
            lines.push(`<span style="color:#f87171;font-weight:700;">⚠ Contact: ${state.contact.enemy} → ${state.contact.friendly} (${state.contact.km} km)</span>`);
        } else if (state.stopped) {
            lines.push(`<span style="color:#fbbf24;">Stopped — reached tip</span>`);
        } else {
            lines.push(`<span style="color:#10b981;">Ready</span>`);
        }
        
        // Show recent combat results — the inbound shot first, then a return-fire summary
        const inboundIdx = (() => {
            for (let i = activeCombats.length - 1; i >= 0; i--) {
                if (activeCombats[i].kind === 'inbound') return i;
            }
            return -1;
        })();
        if (inboundIdx !== -1) {
            const inbound = activeCombats[inboundIdx];
            const returns = activeCombats.slice(inboundIdx + 1).filter(c => c.kind === 'return');
            let combatText = '';
            if (inbound.outcome === 'attacker_win') {
                combatText = `⚔️ ${inbound.attacker} defeats ${inbound.defender}`;
            } else if (inbound.outcome === 'defender_win') {
                combatText = `⚔️ ${inbound.defender} repels ${inbound.attacker}`;
            } else if (inbound.outcome === 'stalemate') {
                combatText = `⚔️ ${inbound.attacker} and ${inbound.defender} stalemate`;
            }
            
            if (inbound.defenderDestroyed) combatText += ` (${inbound.defender} destroyed)`;
            if (inbound.attackerDestroyed) combatText += ` (${inbound.attacker} destroyed)`;
            lines.push(`<span style="color:#fbbf24;">${combatText}</span>`);

            if (returns.length > 0) {
                const kills = returns.filter(r => r.defenderDestroyed).length;
                const tail  = kills ? `, ${kills} kill${kills > 1 ? 's' : ''}` : '';
                lines.push(`<span style="color:#a78bfa;">↩ return fire: ${returns.length} shot${returns.length > 1 ? 's' : ''}${tail}</span>`);
            }
        }
        
        status.innerHTML = lines.join('<br>');
    }

    function showToast(msg, level) {
        const t = document.createElement('div');
        const color = level === 'warn' ? '#dc2626'
                    : level === 'info' ? '#0ea5e9'
                    : '#475569';
        t.style.cssText = [
            'position:fixed', 'top:24px', 'left:50%', 'transform:translateX(-50%)',
            'z-index:2000', `background:${color}`, 'color:white',
            'padding:10px 16px', 'border-radius:6px',
            'font:13px system-ui,sans-serif',
            'box-shadow:0 4px 12px rgba(0,0,0,0.4)', 'max-width:80%', 'direction:ltr',
        ].join(';');
        t.textContent = msg;
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 4000);
    }

    function flashContact(c) {
        showToast(`⚠ Contact: enemy ${c.enemy} is ${c.km} km from friendly ${c.friendly}`, 'warn');
        const el = ensureHud();
        el.style.transition = 'box-shadow 0.3s';
        el.style.boxShadow  = '0 0 24px rgba(239,68,68,0.95)';
        setTimeout(() => { el.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)'; }, 1500);
    }

    // ── COMBAT RESOLUTION ─────────────────────────────────────────────────────
    function resolveCombat(enemyUnit, friendlyUnit, distanceKm) {
        // Simple combat model based on distance and unit types
        // In a real implementation, this would consider unit strength, experience, terrain, etc.
        
        // Base combat values
        const attackerStrength = COMBAT_CONFIG.BASE_ATTACK;
        const defenderStrength = COMBAT_CONFIG.BASE_DEFENSE;
        
        // Distance modifier (closer = better chance to hit)
        const distanceModifier = Math.max(0.1, 1 - (distanceKm / CONTACT_KM));
        
        // Simple dice roll combat
        const attackerRoll = Math.floor(Math.random() * COMBAT_CONFIG.COMBAT_DICE_SIDES) + 1;
        const defenderRoll = Math.floor(Math.random() * COMBAT_CONFIG.COMBAT_DICE_SIDES) + 1;
        
        const attackerTotal = attackerStrength * distanceModifier + attackerRoll;
        const defenderTotal = defenderStrength + defenderRoll;
        
        // Determine outcome
        let result = {
            attacker: enemyUnit.unitCode,
            defender: friendlyUnit.unitCode,
            distance: distanceKm,
            attackerRoll: attackerRoll,
            defenderRoll: defenderRoll,
            attackerTotal: attackerTotal,
            defenderTotal: defenderTotal,
            outcome: 'undecided'
        };
        
        if (attackerTotal > defenderTotal) {
            // Attacker wins - defender may be damaged/destroyed
            const damage = Math.min(100, ((attackerTotal - defenderTotal) / defenderTotal) * 100);
            result.outcome = 'attacker_win';
            result.damageToDefender = damage;
            
            // 30% chance of destruction if damage > 50%
            if (damage > 50 && Math.random() < 0.3) {
                result.defenderDestroyed = true;
            }
        } else if (defenderTotal > attackerTotal) {
            // Defender wins - attacker may be damaged/destroyed
            const damage = Math.min(100, ((defenderTotal - attackerTotal) / attackerTotal) * 100);
            result.outcome = 'defender_win';
            result.damageToAttacker = damage;
            
            // 30% chance of destruction if damage > 50%
            if (damage > 50 && Math.random() < 0.3) {
                result.attackerDestroyed = true;
            }
        } else {
            // Stalemate
            result.outcome = 'stalemate';
        }
        
        return result;
    }

    function removeEnemyByCode(code) {
        const idx = state.unitPaths.findIndex(up => up.unitCode === code);
        if (idx === -1) return false;
        state.unitPaths[idx].marker.remove();
        state.unitPaths.splice(idx, 1);
        return true;
    }
    function removeFriendlyByCode(code) {
        const idx = state.friendlyMarkers.findIndex(fm =>
            (fm._slotUnitCode || (fm._tmgData?.textModifiers?.uniqueDesignation) || '?') === code);
        if (idx === -1) return false;
        state.friendlyMarkers[idx].remove();
        state.friendlyMarkers.splice(idx, 1);
        return true;
    }

    // combatResult.attacker / .defender are roles, NOT affiliations — the caller
    // has to tell us who's who. Inbound enemy contact ⇒ attackerIsEnemy=true;
    // friendly return fire ⇒ attackerIsEnemy=false.
    function applyCombatResult(combatResult, opts) {
        const attackerIsEnemy = !opts || opts.attackerIsEnemy !== false;
        const isReturnFire    = !attackerIsEnemy;
        const tag = isReturnFire ? '↩' : '⚔️';

        if (combatResult.defenderDestroyed) {
            if (attackerIsEnemy) removeFriendlyByCode(combatResult.defender);
            else                 removeEnemyByCode(combatResult.defender);
            showToast(`${tag} ${combatResult.defender} destroyed!`, 'warn');
        }
        if (combatResult.attackerDestroyed) {
            if (attackerIsEnemy) removeEnemyByCode(combatResult.attacker);
            else                 removeFriendlyByCode(combatResult.attacker);
            showToast(`${tag} ${combatResult.attacker} destroyed!`, 'warn');
        }

        if (combatResult.outcome === 'attacker_win') {
            showToast(`${tag} ${combatResult.attacker} defeats ${combatResult.defender}`, 'info');
        } else if (combatResult.outcome === 'defender_win') {
            showToast(`${tag} ${combatResult.defender} repels ${combatResult.attacker}`, 'info');
        } else {
            showToast(`${tag} ${combatResult.attacker} and ${combatResult.defender} stalemate`, 'info');
        }
    }

    // Mount HUD when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', ensureHud);
    } else {
        ensureHud();
    }

    window.AppTurnEngine = {
        showHud,
        init,
        nextTurn,
        reset,
        state: () => state ? {
            turn:        state.turn,
            advancedKm:  state.advancedKm,
            stopped:     state.stopped,
            contact:     state.contact,
            unitCount:   state.unitPaths.length,
            friendlies:  state.friendlyMarkers.length,
            lengthKm:    state.axis.lengthKm,
            arrowOffsetKm: state.arrowOffsetKm || 0,
            snapshots:   state.snapshots.length,
        } : null,
    };

    function bindWarGameButton() {
        const btn = document.querySelector('.tool-rail-btn[data-tool="wargame"]');
        if (!btn || btn._warGameHudBound) return;
        btn.addEventListener('click', () => {
            showHud();
        }, true);
        btn._warGameHudBound = true;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindWarGameButton);
    } else {
        bindWarGameButton();
    }
})();
