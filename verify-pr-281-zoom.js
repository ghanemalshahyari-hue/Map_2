/**
 * Focused screenshot of the PR-281 External Scenario Preview section.
 */
const { chromium } = require('playwright');

const MANIFEST = {
  manifestType: 'external_scenario_source_manifest',
  sourceKind: 'command_modern_operations_pack',
  sourceName: 'CommunityScenarioPack51',
  totalScenarios: 1,
  scenarios: [{
    scenarioId: 'scenario_0001',
    title: '119 Squadron Makes a Little Noise, 2021',
    year: 2021,
    author: 'MARK GELLIS',
    packageVersion: '42',
    xlsxNotes: null,
    path: '119 Squadron Makes a Little Noise, 2021.scen',
    fileName: '119 Squadron Makes a Little Noise, 2021.scen',
    sizeBytes: 463142,
    campaignSeries: 'Standalone Scenario',
    folderGroup: 'root',
    hasIniWeaponPatch: true,
    iniWeaponPatchPath: '119 Squadron Makes a Little Noise, 2021.ini',
    hasHtmlBriefing: false,
    htmlBriefingPaths: [],
    hasDocumentBriefing: false,
    documentBriefingPaths: [],
    hasLua: false,
    luaScriptPaths: [],
    luaExecutionBlocked: true,
    scenBinaryParsed: false,
    importStatus: 'manifest_only',
    conversionReady: false,
    requiresHumanReview: true,
    confidence: 'high',
    sourceTrace: {
      titleFrom: 'xlsx', yearFrom: 'xlsx', authorFrom: 'xlsx',
      notesFrom: 'none', relationshipFrom: 'filename_match'
    }
  }]
};

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  await page.goto('http://localhost:8000/app.html', { waitUntil: 'networkidle', timeout: 15000 });

  // Login
  const pwInput = await page.$('input[type="password"]');
  if (pwInput) {
    const usrInput = await page.$('input[type="text"]');
    if (usrInput) await usrInput.fill('admin');
    await pwInput.fill('OFbtNeiz0ToBgnrLXVbRXA');
    // Click the LOGIN button specifically (not the REGISTER button)
    const loginBtn = await page.$('button[type="submit"], button:has-text("Login"), button:has-text("LOGIN"), button:has-text("Sign in"), button:has-text("SIGN IN")');
    if (loginBtn) {
      await loginBtn.click();
    } else {
      await page.keyboard.press('Enter');
    }
    await page.waitForTimeout(3000);
  }
  console.log('URL after login:', page.url());
  console.log('AppShellScenarioWorkspace defined:', await page.evaluate(function() { return !!window.AppShellScenarioWorkspace; }));

  // Open Scenario Workspace
  const sw = await page.$('[data-tool="scenario-workspace"]');
  console.log('SW button found:', !!sw);
  if (sw) { await sw.click(); await page.waitForTimeout(1000); }

  // Build entry and set it
  await page.evaluate(function(m) {
    var r = window.AppShellScenarioWorkspace.buildSingleExternalScenarioCatalogEntry(m, { selId: 'scenario_0001' });
    if (r.passed) window.AppShellScenarioWorkspace.setExternalScenarioPreviewEntry(r.entry);
  }, MANIFEST);
  await page.waitForTimeout(500);

  // Scroll the preview section into view
  await page.evaluate(function() {
    var sec = document.getElementById('sw-ext-preview-section');
    if (sec) sec.scrollIntoView({ behavior: 'auto', block: 'center' });
  });
  await page.waitForTimeout(500);

  // Highlight the section with a red outline
  await page.evaluate(function() {
    var sec = document.getElementById('sw-ext-preview-section');
    if (sec) {
      sec.style.outline = '3px solid #ff4400';
      sec.style.outlineOffset = '2px';
    }
  });

  // Full page with highlight
  await page.screenshot({ path: 'docs/pr-281-verify/09-section-highlighted.png' });
  console.log('Saved: 09-section-highlighted.png');

  // Get section bounds and take a clip
  var box = await page.evaluate(function() {
    var sec = document.getElementById('sw-ext-preview-section');
    if (!sec) return null;
    var r = sec.getBoundingClientRect();
    return { x: Math.floor(r.left - 5), y: Math.floor(r.top - 5), width: Math.ceil(r.width + 10), height: Math.ceil(r.height + 10) };
  });
  console.log('Section bounding box:', JSON.stringify(box));

  if (box && box.width > 10 && box.height > 10) {
    await page.screenshot({
      path: 'docs/pr-281-verify/10-section-zoom.png',
      clip: box
    });
    console.log('Saved: 10-section-zoom.png');
  }

  // Also take a wider clip showing the panel context
  var panelBox = await page.evaluate(function() {
    var panel = document.getElementById('scenario-workspace-panel');
    if (!panel) return null;
    var r = panel.getBoundingClientRect();
    return { x: Math.floor(r.left), y: Math.floor(r.top), width: Math.ceil(r.width), height: Math.ceil(r.height) };
  });
  console.log('Panel bounding box:', JSON.stringify(panelBox));
  if (panelBox && panelBox.width > 10) {
    await page.screenshot({
      path: 'docs/pr-281-verify/11-panel-full.png',
      clip: panelBox
    });
    console.log('Saved: 11-panel-full.png');
  }

  await browser.close();
}

run().catch(function(e) { console.error('Error:', e.message); process.exit(1); });
