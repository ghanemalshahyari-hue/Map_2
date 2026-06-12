/* ============================================================
   WarGame 3D viewer — Cesium-based
   ------------------------------------------------------------
   Reads window.WARGAME_DATA (loaded by data/bootstrap.js) and
   renders the operation across all phases. Phase scrubber +
   right-side narrative panel + auto-play.

   No build step. Open viewer/index.html in any browser.
   ============================================================ */

(function () {
  const W = window.WARGAME_DATA;
  if (!W) {
    document.body.innerHTML = '<div style="padding:40px;color:red">No bootstrap data. '
      + 'Run <code>python3 viewer/build_bootstrap.py</code> first.</div>';
    return;
  }

  // ---------------------------------------------------------
  // Cesium setup — no Ion token needed; use OSM as fallback basemap
  // ---------------------------------------------------------
  // Avoid the "no Ion token" overlay
  Cesium.Ion.defaultAccessToken = '';

  const viewer = new Cesium.Viewer('cesiumContainer', {
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    selectionIndicator: false,
    infoBox: false,
    fullscreenButton: false,
    timeline: false,
    animation: false,
    imageryProvider: new Cesium.UrlTemplateImageryProvider({
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      credit: '© OpenStreetMap contributors',
      maximumLevel: 19,
    }),
    terrainProvider: new Cesium.EllipsoidTerrainProvider(),
    skyAtmosphere: false,
  });
  viewer.scene.globe.enableLighting = false;
  viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#04060a');
  viewer.scene.skyBox = undefined;

  // ---------------------------------------------------------
  // Camera — initial fly-to AO bbox
  // ---------------------------------------------------------
  const bbox = W.bbox || [19, 29, 20, 31];     // [lon_min, lat_min, lon_max, lat_max]
  const center_lon = (bbox[0] + bbox[2]) / 2;
  const center_lat = (bbox[1] + bbox[3]) / 2;

  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(center_lon, center_lat - 0.6, 200000),
    orientation: {
      heading: Cesium.Math.toRadians(0),
      pitch: Cesium.Math.toRadians(-50),
      roll: 0,
    },
    duration: 1.5,
  });

  // ---------------------------------------------------------
  // Static layer — units at spawn positions (always shown)
  // ---------------------------------------------------------
  const unitEntities = {};   // uid → Cesium.Entity

  const SIDE_COLOR = {
    RED:  Cesium.Color.fromCssColorString('#ef4444'),
    BLUE: Cesium.Color.fromCssColorString('#3b82f6'),
  };
  const SIDE_OUTLINE = {
    RED:  Cesium.Color.fromCssColorString('#7f1d1d'),
    BLUE: Cesium.Color.fromCssColorString('#1e3a8a'),
  };

  function pixelSizeForDomain(domain) {
    return ({
      ground:    8,
      naval:    11,
      air:      10,
      sof:       7,
      strategic: 13,
    })[domain] || 8;
  }

  (W.units || []).forEach(u => {
    const e = viewer.entities.add({
      id: 'unit:' + u.uid,
      position: Cesium.Cartesian3.fromDegrees(u.lon, u.lat),
      point: {
        pixelSize: pixelSizeForDomain(u.domain),
        color: SIDE_COLOR[u.side] || Cesium.Color.GRAY,
        outlineColor: SIDE_OUTLINE[u.side] || Cesium.Color.BLACK,
        outlineWidth: 1.5,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      },
      label: {
        text: u.uid,
        font: '11px "SF Mono", monospace',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -14),
        scale: 0.85,
        showBackground: true,
        backgroundColor: Cesium.Color.fromAlpha(Cesium.Color.BLACK, 0.6),
        backgroundPadding: new Cesium.Cartesian2(4, 2),
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 80000),
      },
      properties: {
        uid: u.uid, side: u.side, domain: u.domain, type: u.type,
        name_ar: u.name_ar,
      },
    });
    unitEntities[u.uid] = e;
  });

  // ---------------------------------------------------------
  // Objective marker — yellow diamond
  // ---------------------------------------------------------
  const obj = W.objective;
  if (obj && obj.lon != null && obj.lat != null) {
    viewer.entities.add({
      id: 'objective:' + (obj.id || 'OBJ'),
      position: Cesium.Cartesian3.fromDegrees(obj.lon, obj.lat),
      point: {
        pixelSize: 16,
        color: Cesium.Color.fromCssColorString('#facc15'),
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      },
      label: {
        text: (obj.id || 'OBJ') + ' — ' + (obj.name_en || obj.name_ar || ''),
        font: 'bold 13px sans-serif',
        fillColor: Cesium.Color.fromCssColorString('#facc15'),
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -20),
        showBackground: true,
        backgroundColor: Cesium.Color.fromAlpha(Cesium.Color.BLACK, 0.7),
      },
    });
  }

  // ---------------------------------------------------------
  // Off-map markers — dimmer, smaller, named
  // ---------------------------------------------------------
  (W.off_map_markers || []).forEach(m => {
    viewer.entities.add({
      id: 'marker:' + m.id,
      position: Cesium.Cartesian3.fromDegrees(m.lon, m.lat),
      point: {
        pixelSize: 6,
        color: SIDE_COLOR[m.side] ? SIDE_COLOR[m.side].withAlpha(0.6) : Cesium.Color.GRAY,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 1,
      },
      label: {
        text: m.id,
        font: '9px monospace',
        fillColor: Cesium.Color.fromAlpha(Cesium.Color.WHITE, 0.7),
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 1.5,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -10),
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 400000),
      },
    });
  });

  // ---------------------------------------------------------
  // Dynamic entities per phase — affected highlights + phase line
  // We tear these down on each phase change so they don't accumulate.
  // ---------------------------------------------------------
  let phaseEntities = [];

  function clearPhaseEntities() {
    phaseEntities.forEach(e => viewer.entities.remove(e));
    phaseEntities = [];
  }

  // Reset all units back to plain side color (clear status overlays)
  function resetUnitOverlays() {
    Object.values(unitEntities).forEach(e => {
      const side = e.properties.side.getValue();
      e.point.color = SIDE_COLOR[side] || Cesium.Color.GRAY;
      e.point.outlineColor = SIDE_OUTLINE[side] || Cesium.Color.BLACK;
      e.point.outlineWidth = 1.5;
      e.point.pixelSize = pixelSizeForDomain(e.properties.domain.getValue());
    });
  }

  // ---------------------------------------------------------
  // Status overlay coloring per outcome
  // ---------------------------------------------------------
  const STATUS_RING = {
    destroyed:        { color: '#b00020', size: 18 },
    damaged_partial:  { color: '#d97706', size: 16 },
    suppressed:       { color: '#ca8a04', size: 14 },
    delayed:          { color: '#7c3aed', size: 14 },
    expended:         { color: '#2563eb', size: 14 },
    unchanged:        { color: '#4b5563', size: 12 },
  };

  // Helper: degree-shift for coast-parallel phase line
  const DEG_PER_KM_LAT = 1 / 110.574;

  // ---------------------------------------------------------
  // Render one phase
  // ---------------------------------------------------------
  function renderPhase(idx) {
    if (idx < 0 || idx >= W.phases.length) return;
    const ph = W.phases[idx];
    clearPhaseEntities();
    resetUnitOverlays();

    // Phase line (if depth > 0)
    if (ph.phase_line_km > 0 && W.coast_lat_approx) {
      const lineLat = W.coast_lat_approx - ph.phase_line_km * DEG_PER_KM_LAT;
      const line = viewer.entities.add({
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArray([
            bbox[0], lineLat,
            bbox[2], lineLat,
          ]),
          width: 3,
          material: new Cesium.PolylineDashMaterialProperty({
            color: Cesium.Color.fromCssColorString('#fb923c'),
            dashLength: 16,
          }),
          clampToGround: true,
        },
        label: {
          text: 'PL — ' + ph.phase_line_km + ' km from coast',
          font: '11px monospace',
          fillColor: Cesium.Color.fromCssColorString('#fb923c'),
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 1.5,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        },
        position: Cesium.Cartesian3.fromDegrees(bbox[2] - 0.05, lineLat),
      });
      phaseEntities.push(line);
    }

    // Highlight units that are actors or affected this phase
    const actors = new Set();
    const affectedBy = {};  // uid → outcome record
    (ph.features || []).forEach(feat => {
      const k = feat.properties.kind;
      if (k === 'actor_unit') actors.add(feat.properties.uid);
      else if (k === 'affected_unit') {
        const uid = feat.properties.uid;
        affectedBy[uid] = {
          status_change: feat.properties.status_change,
          damage_pct: feat.properties.damage_pct,
          cause_actor: feat.properties.cause_actor,
          cause_what: feat.properties.cause_what,
        };
      }
    });

    // Apply highlights
    actors.forEach(uid => {
      const e = unitEntities[uid];
      if (!e) return;
      e.point.outlineColor = Cesium.Color.fromCssColorString('#34d399');
      e.point.outlineWidth = 2.5;
      e.point.pixelSize = pixelSizeForDomain(e.properties.domain.getValue()) + 4;
    });
    Object.entries(affectedBy).forEach(([uid, outcome]) => {
      const e = unitEntities[uid];
      if (!e) return;
      const overlay = STATUS_RING[outcome.status_change] || STATUS_RING.unchanged;
      e.point.outlineColor = Cesium.Color.fromCssColorString(overlay.color);
      e.point.outlineWidth = 3;
      e.point.pixelSize = overlay.size;
    });

    // Engagement arcs — line from cause_actor to affected unit (optional polish)
    (ph.unit_outcomes || []).forEach(o => {
      if (!o.cause_actor || !o.unit_uid) return;
      const src = unitEntities[o.cause_actor];
      const dst = unitEntities[o.unit_uid];
      if (!src || !dst) return;
      const arc = viewer.entities.add({
        polyline: {
          positions: new Cesium.CallbackProperty(() => {
            const a = src.position.getValue(viewer.clock.currentTime);
            const b = dst.position.getValue(viewer.clock.currentTime);
            return [a, b];
          }, false),
          width: 1.5,
          arcType: Cesium.ArcType.GEODESIC,
          material: new Cesium.PolylineDashMaterialProperty({
            color: SIDE_COLOR[ src.properties.side.getValue() ].withAlpha(0.55),
            dashLength: 8,
          }),
        },
      });
      phaseEntities.push(arc);
    });

    // Update right-side narrative
    document.getElementById('op-title').textContent = W.operation_name;
    document.getElementById('phase-title').textContent =
      'Phase ' + ph.step + ' — ' + ph.time_label + ' — ' + (ph.phase_name_ar || '');
    document.getElementById('scene-text').textContent = ph.scene || '—';
    document.getElementById('red-intent').textContent = ph.red_intent || '—';
    document.getElementById('blue-intent').textContent = ph.blue_intent || '—';
    document.getElementById('combined-effect').textContent = ph.combined_effect || '—';

    const m = ph.metrics || {};
    const sn = ph.snapshot_after || {};
    document.getElementById('metrics').textContent =
      `Force ratio (local)    : ${m.force_ratio_local ?? '—'} : 1\n`
      + `Force ratio (operational): ${m.force_ratio_operational ?? '—'} : 1\n`
      + `EW R / B    : ${(m.ew_strength_red ?? 0).toFixed(2)} / ${(m.ew_strength_blue ?? 0).toFixed(2)}\n`
      + `Mines remaining : ${m.blue_mines_remaining ?? '—'}\n`
      + `Cum losses Red / Blue : ${ph.cum_losses_red ?? 0} / ${ph.cum_losses_blue ?? 0}\n`
      + `Engine call : ${m.advantage_label ?? '—'}`;

    document.getElementById('advantage').textContent =
      (ph.step_advantage || '—') + ' — ' + (ph.advantage_reason || '—');

    // Top outcomes
    const outsEl = document.getElementById('outcomes');
    outsEl.innerHTML = '';
    (ph.unit_outcomes || []).slice(0, 8).forEach(o => {
      const div = document.createElement('div');
      div.className = 'outcome';
      const pct = ((o.damage_pct || 0) * 100).toFixed(0);
      div.innerHTML = `
        <span class="outcome-uid">${o.unit_uid}</span>
        <span class="outcome-status ${o.status_change}">${o.status_change} ${pct}%</span>
        <div class="outcome-cause">${o.cause_actor || '?'} — ${o.cause_what || ''}</div>
        <div class="outcome-doctrine">${o.cause_doctrine || ''}</div>
      `;
      outsEl.appendChild(div);
    });

    // Phase label below slider
    document.getElementById('phase-label').textContent =
      'Phase ' + ph.step + ' — ' + ph.time_label;
  }

  // ---------------------------------------------------------
  // Scrubber wiring
  // ---------------------------------------------------------
  const slider = document.getElementById('phase-slider');
  slider.max = String(Math.max(0, W.phases.length - 1));
  slider.value = '0';
  slider.addEventListener('input', e => {
    stopPlay();
    renderPhase(Number(e.target.value));
  });

  // Auto-play
  let playing = false;
  let playTimer = null;
  const playBtn = document.getElementById('play-btn');
  const speedSel = document.getElementById('speed-sel');

  function stepNext() {
    let v = Number(slider.value);
    v = (v + 1) % W.phases.length;
    slider.value = String(v);
    renderPhase(v);
  }
  function startPlay() {
    if (playing) return;
    playing = true;
    playBtn.textContent = '⏸';
    playBtn.classList.add('playing');
    const speed = Number(speedSel.value || 900);
    playTimer = setInterval(stepNext, speed);
  }
  function stopPlay() {
    if (!playing) return;
    playing = false;
    playBtn.textContent = '▶';
    playBtn.classList.remove('playing');
    if (playTimer) {
      clearInterval(playTimer);
      playTimer = null;
    }
  }
  playBtn.addEventListener('click', () => {
    if (playing) stopPlay();
    else startPlay();
  });
  speedSel.addEventListener('change', () => {
    if (playing) { stopPlay(); startPlay(); }
  });

  // Keyboard shortcuts: arrow keys, space
  document.addEventListener('keydown', e => {
    if (e.code === 'Space') {
      e.preventDefault();
      if (playing) stopPlay(); else startPlay();
    } else if (e.code === 'ArrowRight') {
      stopPlay();
      let v = Math.min(W.phases.length - 1, Number(slider.value) + 1);
      slider.value = String(v);
      renderPhase(v);
    } else if (e.code === 'ArrowLeft') {
      stopPlay();
      let v = Math.max(0, Number(slider.value) - 1);
      slider.value = String(v);
      renderPhase(v);
    }
  });

  // ---------------------------------------------------------
  // Initial render
  // ---------------------------------------------------------
  if (W.phases.length > 0) {
    renderPhase(0);
  } else {
    document.getElementById('op-title').textContent = 'No phase data';
  }

  // Expose for console debugging
  window.viewer = viewer;
  window.WG = { W, unitEntities, renderPhase };
  console.log('WarGame viewer ready. Phases:', W.phases.length, 'Units:', (W.units || []).length);
})();
