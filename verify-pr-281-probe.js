/**
 * Quick probe — find where forbidden buttons actually live in the app.
 */
const { chromium } = require('playwright');

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:8000/app.html', { waitUntil: 'networkidle', timeout: 15000 });

  // Login
  const isLogin = await page.$('input[type="password"]');
  if (isLogin) {
    const usernameInput = await page.$('input[type="text"]');
    if (usernameInput) await usernameInput.fill('admin');
    await page.fill('input[type="password"]', 'OFbtNeiz0ToBgnrLXVbRXA');
    const btn = await page.$('button');
    if (btn) await btn.click();
    await page.waitForTimeout(1500);
  }

  // Open Scenario Workspace
  const sw = await page.$('[data-tool="scenario-workspace"]');
  if (sw) { await sw.click(); await page.waitForTimeout(600); }

  // Where are the forbidden buttons?
  const allForbidden = await page.evaluate(function() {
    var PATTERNS = [/^import$/i, /^apply$/i, /^run$/i, /^execute$/i, /^commit$/i, /^confirm$/i, /^approve$/i, /^go live$/i];
    var results = [];
    var all = Array.from(document.querySelectorAll('button, [role="button"]'));
    all.forEach(function(btn) {
      var txt = (btn.textContent || '').trim();
      PATTERNS.forEach(function(p) {
        if (p.test(txt)) {
          var closest = btn.closest('[id]');
          results.push({
            text: txt,
            containerId: closest ? closest.id : 'no-id-ancestor',
            visible: btn.offsetParent !== null
          });
        }
      });
    });
    return results;
  });
  console.log('All forbidden buttons in page:');
  allForbidden.forEach(function(b) {
    console.log('  "' + b.text + '" | container: ' + b.containerId + ' | visible: ' + b.visible);
  });

  // Specifically inside #sw-ext-preview-section
  const inSection = await page.evaluate(function() {
    var sec = document.getElementById('sw-ext-preview-section');
    if (!sec) return ['(section not found)'];
    var PATTERNS = [/^import$/i, /^apply$/i, /^run$/i, /^execute$/i, /^commit$/i, /^confirm$/i, /^approve$/i, /^go live$/i];
    var results = [];
    var all = Array.from(sec.querySelectorAll('button, [role="button"]'));
    all.forEach(function(btn) {
      var txt = (btn.textContent || '').trim();
      PATTERNS.forEach(function(p) { if (p.test(txt)) results.push(txt); });
    });
    return results.length ? results : ['none'];
  });
  console.log('In #sw-ext-preview-section:', JSON.stringify(inSection));

  // Specifically inside #scenario-workspace-panel
  const inPanel = await page.evaluate(function() {
    var panel = document.getElementById('scenario-workspace-panel');
    if (!panel) return ['(panel not found)'];
    var PATTERNS = [/^import$/i, /^apply$/i, /^run$/i, /^execute$/i, /^commit$/i, /^confirm$/i, /^approve$/i, /^go live$/i];
    var results = [];
    var all = Array.from(panel.querySelectorAll('button, [role="button"]'));
    all.forEach(function(btn) {
      var txt = (btn.textContent || '').trim();
      PATTERNS.forEach(function(p) {
        if (p.test(txt)) {
          results.push({ text: txt, id: btn.id || '(no id)', visible: btn.offsetParent !== null });
        }
      });
    });
    return results.length ? results : ['none'];
  });
  console.log('In #scenario-workspace-panel:');
  inPanel.forEach(function(x) { console.log(' ', JSON.stringify(x)); });

  await browser.close();
}

run().catch(function(e) { console.error(e.message); process.exit(1); });
