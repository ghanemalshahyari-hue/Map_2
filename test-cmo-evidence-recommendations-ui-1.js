const assert = require('assert');
const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const shellDir = path.join(rootDir, 'UI_MOdified', 'client', 'shell');
const offlineShellDir = path.join(rootDir, 'UI_MOdified', 'Offline_Deployment', 'offline_app', 'client', 'shell');
const mainAppPath = path.join(rootDir, 'UI_MOdified', 'client', 'app.html');
const offlineAppPath = path.join(rootDir, 'UI_MOdified', 'Offline_Deployment', 'offline_app', 'client', 'app.html');
const recPath = path.join(shellDir, 'cmo-evidence-recommendations.js');
const panelPath = path.join(shellDir, 'unit-status-panel.js');

require(path.join(shellDir, 'cmo-evidence-labels.js'));
require(path.join(shellDir, 'engagement-evidence.js'));
require(path.join(shellDir, 'contact-evidence.js'));
require(path.join(shellDir, 'decision-chain-evidence.js'));
const Recommendations = require(recPath);

const source = [
  fs.readFileSync(recPath, 'utf8'),
  fs.readFileSync(panelPath, 'utf8')
].join('\n');
const mainApp = fs.readFileSync(mainAppPath, 'utf8');
const offlineApp = fs.readFileSync(offlineAppPath, 'utf8');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log('ok - ' + name);
  } catch (err) {
    console.error('not ok - ' + name);
    console.error(err && err.stack || err);
    process.exitCode = 1;
  }
}

function recFor(reason, status = 'Blocked') {
  return Recommendations.buildRecommendations({
    final_status: status,
    blocking_reason_code: reason,
    contact: { reason_code: reason },
    engagement: { reason_code: reason }
  });
}

test('out_of_range recommendations guide range and contact checks', () => {
  const rec = recFor('out_of_range');
  assert.strictEqual(rec.reason_code, 'out_of_range');
  assert.ok(rec.recommendations.includes('Move the shooter closer to the target.'));
  assert.ok(rec.recommendations.includes('Check whether another weapon has sufficient range.'));
  assert.ok(rec.recommendations.includes('Confirm the target contact is current.'));
});

test('contact, doctrine, ammo, and fire-control blockers map to deterministic checks', () => {
  assert.ok(recFor('no_contact_evidence').recommendations.includes('Check sensor coverage.'));
  assert.ok(recFor('stale_contact').recommendations.includes('Refresh contact information.'));
  assert.ok(recFor('weapons_hold').recommendations.includes('Review doctrine or ROE settings.'));
  assert.ok(recFor('winchester').recommendations.includes('Check ammunition status.'));
  assert.ok(recFor('no_fire_control_channel').recommendations.includes('Check fire-control capability.'));
});

test('unknown blockers fall back safely and ready state renders empty state', () => {
  const unknown = recFor('unexpected_blocker');
  assert.strictEqual(unknown.reason_code, 'unknown');
  assert.ok(unknown.recommendations.includes('Review missing evidence.'));
  const ready = Recommendations.buildRecommendations({ final_status: 'Ready', blocking_reason_code: null });
  assert.strictEqual(ready.reason_code, null);
  assert.deepStrictEqual(ready.recommendations, []);
  const html = Recommendations.renderRecommendationsHtml(ready);
  assert.ok(html.includes('No recommendations available'));
  assert.ok(html.includes('لا توجد توصيات') || html.includes('&#1604;&#1575;'));
});

test('rendered recommendations include status, reason, Arabic label, source, and ordered list', () => {
  const html = Recommendations.renderRecommendationsHtml(recFor('out_of_range'));
  assert.ok(html.includes('usp-rec-summary'));
  assert.ok(html.includes('Blocked'));
  assert.ok(html.includes('out_of_range'));
  assert.ok(html.includes('usp-rec-list'));
  assert.ok(html.includes('Source /'));
});

test('main and offline app shells include recommendations panel and script', () => {
  [mainApp, offlineApp].forEach((html) => {
    assert.ok(html.includes('usp-evidence-recommendations-block'));
    assert.ok(html.includes('usp-evidence-recommendations-body'));
    assert.ok(html.includes('Recommended Checks'));
    assert.ok(html.includes('shell/cmo-evidence-recommendations.js'));
  });
  assert.ok(fs.existsSync(path.join(offlineShellDir, 'cmo-evidence-recommendations.js')));
});

test('unit panel populates recommendations after decision chain and before timeline', () => {
  const decisionIdx = source.indexOf('populateDecisionChainEvidence(unit)');
  const recIdx = source.indexOf('populateEvidenceRecommendations(unit)');
  const timelineIdx = source.indexOf('populateEvidenceTimeline(unit)');
  assert.ok(decisionIdx >= 0);
  assert.ok(recIdx > decisionIdx);
  assert.ok(timelineIdx > recIdx);
  assert.ok(source.includes('RmoozCmoEvidenceRecommendations'));
});

test('recommendations remain read-only with no backend route or mutation path', () => {
  assert.ok(!/fetch\s*\(/.test(source));
  assert.ok(!/XMLHttpRequest/.test(source));
  assert.ok(!/\/api\//.test(source));
  assert.ok(!/computeContacts/.test(source));
  assert.ok(!/computeEngagements/.test(source));
  assert.ok(!/approved-actions/.test(source));
  assert.ok(!/applyAction|commitAction|executeAction|autoFire|auto-fire/.test(source));
  assert.ok(!/doctrine.*=|weapons_hold\s*=/.test(source));
});

if (process.exitCode) {
  console.error('failed');
} else {
  console.log('passed ' + passed + ' CMO evidence recommendations UI checks');
}
