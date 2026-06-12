'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUT = path.join(process.cwd(), 'docs', 'frontline-verification-artifacts');
fs.mkdirSync(OUT, { recursive: true });

async function loginFresh(page) {
  await page.goto('http://127.0.0.1:8000/app.html', { waitUntil: 'load', timeout: 60000 });
  if ((await page.title()).includes('Sign in')) {
    const user = 'verify' + Date.now();
    const inputs = await page.locator('input').count();
    for (let i = 0; i < inputs; i++) {
      const input = page.locator('input').nth(i);
      const type = await input.getAttribute('type');
      if (type === 'password') await input.fill('verify1234');
      else if (i === 0) await input.fill(user);
    }
    await page.getByText(/register/i).first().click();
    await page.waitForTimeout(2500);
    await page.goto('http://127.0.0.1:8000/app.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  }
  await page.waitForFunction(
    () => window.AppIO && window.RMOOZFrontLineDebug && window.getAllLayerElements &&
      window.createLayer && window.selectTmgType && window.placeFreeDrawSignatureTmg &&
      window.autoDrawCircleXFlankLines,
    null,
    { timeout: 60000 }
  );
  await page.waitForTimeout(1500);
}

async function prepareProofView(page) {
  await page.getByText('Got it').click({ timeout: 1000 }).catch(() => {});
  await page.evaluate(() => {
    const activeMap = window.map || (typeof map !== 'undefined' ? map : null);
    if (activeMap && typeof activeMap.setView === 'function') activeMap.setView([24.72, 54.98], 10);
  }).catch(() => {});
  await page.waitForTimeout(500);
}

function collectState() {
  const segs = window.getAllLayerElements().flatMap(el => {
    if (el && el._tmgData && el._tmgData.typeId === 'scalloped' && Array.isArray(el._tmgData.segments)) return el._tmgData.segments;
    if (el && el._tmgData && el._tmgData.typeId === 'scalloped') return [el];
    return [];
  });
  const circles = window.getAllLayerElements().filter(el => el && el._tmgData && el._tmgData.typeId === 'circle-x');
  const flanks = window.getAllLayerElements().filter(el => el && el._autoFlankLine);

  function flattenLatLngs(raw, out = []) {
    if (!raw) return out;
    if (raw.lat != null && raw.lng != null) {
      out.push(raw);
      return out;
    }
    if (Array.isArray(raw)) raw.forEach(item => flattenLatLngs(item, out));
    return out;
  }

  function sideClassifier() {
    const seg = segs[0];
    if (!seg || !seg._tmgData || !seg._tmgData.latlng1 || !seg._tmgData.latlng2) return null;
    const activeMap = window.map || (typeof map !== 'undefined' ? map : null);
    if (!activeMap) return null;
    const a = window.L.latLng(seg._tmgData.latlng1.lat, seg._tmgData.latlng1.lng);
    const b = window.L.latLng(seg._tmgData.latlng2.lat, seg._tmgData.latlng2.lng);
    const p1 = activeMap.latLngToLayerPoint(a);
    const p2 = activeMap.latLngToLayerPoint(b);
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);
    if (!len) return null;
    const ux = dx / len;
    const uy = dy / len;
    const leftNormal = { x: uy, y: -ux };
    return (ll, raw = false) => {
      if (!ll || ll.lat == null || ll.lng == null) return 0;
      const p = activeMap.latLngToLayerPoint(ll);
      const t = ((p.x - p1.x) * ux) + ((p.y - p1.y) * uy);
      const proj = { x: p1.x + ux * t, y: p1.y + uy * t };
      const score = ((p.x - proj.x) * leftNormal.x) + ((p.y - proj.y) * leftNormal.y);
      if (raw) return score;
      return Math.abs(score) < 1 ? 0 : (score > 0 ? 1 : -1);
    };
  }

  const classifySide = sideClassifier();
  const autoFlankSummary = flanks.map((el, idx) => {
    let pts = [];
    if (el.getLatLng) {
      const ll = el.getLatLng();
      if (ll) pts = [ll];
    } else if (el.getLatLngs) {
      pts = flattenLatLngs(el.getLatLngs());
    }
    let centroid = null;
    if (pts.length) {
      centroid = window.L.latLng(
        pts.reduce((sum, p) => sum + p.lat, 0) / pts.length,
        pts.reduce((sum, p) => sum + p.lng, 0) / pts.length
      );
    }
    const centroidSide = classifySide && centroid ? classifySide(centroid) : 0;
    const pointSideScores = classifySide ? pts.map(p => classifySide(p, true)).filter(v => Number.isFinite(v)) : [];
    const aggregateSideScore = pointSideScores.reduce((sum, v) => sum + v, 0);
    return {
      idx,
      typeId: el._tmgData?.typeId || null,
      tag: el._tmgData?.tag || null,
      lengthKm: el._tmgData?.lengthKm || null,
      areaRole: el._tmgData?.areaRole || null,
      color: el.options?.color || null,
      fillColor: el.options?.fillColor || null,
      className: el.options?.className || null,
      pointCount: pts.length,
      centroid: centroid ? { lat: centroid.lat, lng: centroid.lng } : null,
      centroidSide,
      aggregateSideScore: Number(aggregateSideScore.toFixed(2))
    };
  });
  const autoFlankTypeCounts = autoFlankSummary.reduce((acc, item) => {
    const key = item.typeId || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const structuralAutoFlanks = autoFlankSummary.filter(item => item.typeId !== 'auto-flank-echelon');
  const structuralSideScores = structuralAutoFlanks.map(item => item.centroidSide).filter(Boolean);
  const structuralDepthScore = structuralAutoFlanks.reduce((sum, item) => sum + (Number(item.aggregateSideScore) || 0), 0);
  const expectedDepthSide = segs[0] ? -(segs[0]._tmgData.scallopSide === -1 ? -1 : 1) : null;

  return {
    segmentCount: segs.length,
    circleCount: circles.length,
    flankCount: flanks.length,
    autoFlankTypeCounts,
    autoFlankSummary,
    expectedDepthSide,
    structuralDepthScore: Number(structuralDepthScore.toFixed(2)),
    structuralDepthSide: Math.abs(structuralDepthScore) < 1 ? 0 : (structuralDepthScore > 0 ? 1 : -1),
    oppositeDepthSideCount: expectedDepthSide == null ? 0 : structuralSideScores.filter(v => v !== expectedDepthSide).length,
    scallopSides: segs.map(s => s._tmgData.scallopSide === -1 ? -1 : 1),
    firstSegment: segs[0] ? {
      latlng1: { lat: segs[0]._tmgData.latlng1.lat, lng: segs[0]._tmgData.latlng1.lng },
      latlng2: { lat: segs[0]._tmgData.latlng2.lat, lng: segs[0]._tmgData.latlng2.lng },
      sessionId: segs[0]._tmgData.sessionId || null,
      scallopSide: segs[0]._tmgData.scallopSide === -1 ? -1 : 1
    } : null,
    scenarioTitle: document.body.innerText.match(/Wargame 3[^\n]*/)?.[0] || null
  };
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: EDGE });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await loginFresh(page);

  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => pageErrors.push(err.message));

  const setup = await page.evaluate(() => {
    window.createLayer('frontline-persistence-verification');
    window.freeDrawSignatureSessionId = 'verify-frontline-' + Date.now();
    window.freeDrawSignatureAffiliation = 'friendly';
    [L.latLng(24.7000, 54.9400), L.latLng(24.7350, 54.9800), L.latLng(24.7100, 55.0300)]
      .forEach(p => window.placeFreeDrawSignatureTmg(p, 'circle-x', 'friendly'));
    window.selectTmgType('scalloped', '#3b82f6');
    const rect = document.querySelector('.leaflet-container').getBoundingClientRect();
    return { sessionId: window.freeDrawSignatureSessionId, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } };
  });

  const clickPts = [
    [setup.rect.x + 470, setup.rect.y + 500],
    [setup.rect.x + 650, setup.rect.y + 440],
    [setup.rect.x + 830, setup.rect.y + 500]
  ];
  await page.mouse.click(clickPts[0][0], clickPts[0][1]);
  await page.waitForTimeout(350);
  await page.mouse.click(clickPts[1][0], clickPts[1][1]);
  await page.waitForTimeout(350);
  await page.mouse.dblclick(clickPts[2][0], clickPts[2][1]);
  await page.waitForTimeout(1000);

  let before = await page.evaluate(collectState);
  if (!before.segmentCount) {
    await page.evaluate((sessionId) => {
      const payload = JSON.stringify({
        version: 2,
        layers: [{
          id: 'frontline-persistence-verification-fallback',
          name: 'frontline-persistence-verification-fallback',
          visible: true,
          active: true,
          elements: [{
            type: 'tmg-group',
            typeId: 'scalloped',
            color: '#3b82f6',
            strokeWidth: 2,
            scallopSide: -1,
            sessionId,
            points: [[24.7000, 54.9400], [24.7350, 54.9800], [24.7100, 55.0300]]
          }]
        }]
      });
      window.AppIO.importLayersData(payload, true, true);
    }, setup.sessionId);
    await page.waitForTimeout(500);
    before = await page.evaluate(collectState);
  }

  const debugBefore = await page.evaluate(() => window.RMOOZFrontLineDebug.show());
  await page.evaluate(() => window.showAutoFlankControls && window.showAutoFlankControls());
  await page.evaluate(() => window.autoDrawCircleXFlankLines({ mode: '8', tag: 'battalion', dist1: 8, dist2: 20 }));
  await page.waitForTimeout(1200);
  const generatedBeforeFlip = await page.evaluate(collectState);
  await prepareProofView(page);
  await page.screenshot({ path: path.join(OUT, 'frontline-before-flip.png'), fullPage: true });

  await page.evaluate(() => window.RMOOZFrontLineDebug.flip());
  await page.waitForTimeout(1200);
  const debugAfter = await page.evaluate(() => window.RMOOZFrontLineDebug.show());
  const after = await page.evaluate(collectState);
  await prepareProofView(page);
  await page.screenshot({ path: path.join(OUT, 'frontline-after-flip.png'), fullPage: true });

  const exported = await page.evaluate(() => window.AppIO.exportLayersData());
  fs.writeFileSync(path.join(OUT, 'frontline-export.geojson'), exported, 'utf8');
  const exportedJson = JSON.parse(exported);
  const scallopFeature = exportedJson.features.find(f => f.properties && f.properties.app && f.properties.app.typeId === 'scalloped');
  const exportedScallopSide = scallopFeature && scallopFeature.properties.app.scallopSide;

  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.AppIO && window.RMOOZFrontLineDebug && window.getAllLayerElements, null, { timeout: 60000 });
  await page.evaluate((json) => window.AppIO.importLayersData(json, true, false), exported);
  await page.waitForTimeout(1000);
  const reload = await page.evaluate(collectState);
  await page.evaluate(() => window.RMOOZFrontLineDebug.show());
  await prepareProofView(page);
  await page.screenshot({ path: path.join(OUT, 'frontline-after-reload.png'), fullPage: true });

  const result = {
    url: page.url(),
    sessionId: setup.sessionId,
    scenarioTitle: before.scenarioTitle || reload.scenarioTitle,
    before,
    debugBefore: { rows: debugBefore.length, first: debugBefore[0] || null },
    generatedBeforeFlip,
    after,
    debugAfter: { rows: debugAfter.length, first: debugAfter[0] || null },
    exportedScallopSide,
    exportedScallopApp: scallopFeature ? scallopFeature.properties.app : null,
    reload,
    consoleErrors,
    pageErrors,
    screenshots: {
      before: path.join(OUT, 'frontline-before-flip.png'),
      after: path.join(OUT, 'frontline-after-flip.png'),
      reload: path.join(OUT, 'frontline-after-reload.png'),
      export: path.join(OUT, 'frontline-export.geojson')
    }
  };
  fs.writeFileSync(path.join(OUT, 'frontline-verification-result.json'), JSON.stringify(result, null, 2), 'utf8');
  console.log(JSON.stringify(result, null, 2));
  await browser.close();

  if (!before.segmentCount) throw new Error('no front-line segments created');
  if (before.firstSegment.scallopSide !== -1) throw new Error('expected side before flip = -1');
  if (after.firstSegment.scallopSide !== 1) throw new Error('expected side after flip = 1');
  if (!generatedBeforeFlip.flankCount) throw new Error('auto-flank geometry was not generated before flip');
  if (generatedBeforeFlip.structuralDepthSide !== generatedBeforeFlip.expectedDepthSide) {
    throw new Error('default auto-flank depth/control geometry is not opposite the selected scallop side');
  }
  if (!after.flankCount) throw new Error('auto-flank geometry missing after flip');
  if (after.structuralDepthSide !== after.expectedDepthSide) {
    throw new Error('flipped auto-flank depth/control geometry did not stay opposite the selected scallop side');
  }
  if (generatedBeforeFlip.structuralDepthSide === after.structuralDepthSide) {
    throw new Error('auto-flank depth/control geometry did not flip sides');
  }
  if (exportedScallopSide !== 1) throw new Error('export did not preserve flipped scallopSide');
  if (!reload.segmentCount || reload.firstSegment.scallopSide !== 1) throw new Error('reload/import did not preserve scallopSide');
  if (reload.flankCount !== after.flankCount) throw new Error('reload/import changed generated geometry count');
  if (JSON.stringify(reload.autoFlankTypeCounts) !== JSON.stringify(after.autoFlankTypeCounts)) {
    throw new Error('reload/import changed generated geometry type counts');
  }
  if (reload.structuralDepthSide !== after.structuralDepthSide) {
    throw new Error('reload/import did not preserve generated geometry side');
  }
  if (consoleErrors.length || pageErrors.length) throw new Error('console/page errors during workflow');
})().catch(err => {
  console.error(err.stack || err);
  process.exit(1);
});
