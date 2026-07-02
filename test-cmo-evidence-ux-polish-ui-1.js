const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const mainAppPath = path.join(root, 'UI_MOdified', 'client', 'app.html');
const offlineAppPath = path.join(root, 'UI_MOdified', 'Offline_Deployment', 'offline_app', 'client', 'app.html');
const panelPath = path.join(root, 'UI_MOdified', 'client', 'shell', 'unit-status-panel.js');
const offlinePanelPath = path.join(root, 'UI_MOdified', 'Offline_Deployment', 'offline_app', 'client', 'shell', 'unit-status-panel.js');
const shellDir = path.join(root, 'UI_MOdified', 'client', 'shell');

const mainHtml = fs.readFileSync(mainAppPath, 'utf8');
const offlineHtml = fs.readFileSync(offlineAppPath, 'utf8');
const panelSource = fs.readFileSync(panelPath, 'utf8');
const offlinePanelSource = fs.readFileSync(offlinePanelPath, 'utf8');

const Labels = require(path.join(shellDir, 'cmo-evidence-labels.js'));

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

const evidenceOrder = [
  'usp-evidence-quality-block',
  'usp-evidence-alerts-block',
  'usp-evidence-matrix-block',
  'usp-force-feed-block',
  'usp-contact-evidence-block',
  'usp-engagement-evidence-block',
  'usp-chain-evidence-block',
  'usp-evidence-timeline-block',
  'usp-evidence-export-block',
  'usp-force-report-block'
];

function assertOrder(text, ids) {
  let last = -1;
  ids.forEach((id) => {
    const idx = text.indexOf('id="' + id + '"');
    assert.ok(idx >= 0, 'missing id ' + id);
    assert.ok(idx > last, id + ' should render after previous evidence section');
    last = idx;
  });
}

function populateIndex(name) {
  const idx = panelSource.indexOf(name + '(unit)');
  assert.ok(idx >= 0, 'missing populate call ' + name);
  return idx;
}

test('major evidence sections render in expected order in main and offline apps', () => {
  assertOrder(mainHtml, evidenceOrder);
  assertOrder(offlineHtml, evidenceOrder);
});

test('populate order follows the same demo workflow', () => {
  const calls = [
    'populateEvidenceQualityGate',
    'populateEvidenceAlerts',
    'populateEvidenceReadinessMatrix',
    'populateForceEvidenceFeed',
    'populateContactEvidence',
    'populateEngagementEvidence',
    'populateDecisionChainEvidence',
    'populateEvidenceTimeline',
    'populateEvidenceExport',
    'populateForceEvidenceReport'
  ].map(populateIndex);
  calls.forEach((idx, i) => {
    if (i > 0) assert.ok(idx > calls[i - 1], 'populate order drift at index ' + i);
  });
});

test('empty state guides users to matrix row selection', () => {
  assert.ok(mainHtml.includes('No selected unit.'));
  assert.ok(mainHtml.includes('Select a row from the readiness matrix to inspect evidence.'));
  assert.ok(mainHtml.includes('&#1575;&#1582;&#1578;&#1585; &#1608;&#1581;&#1583;&#1577;'));
  assert.ok(offlineHtml.includes('No selected unit.'));
  assert.ok(panelSource.includes('function _showEmpty()'));
  assert.ok(panelSource.includes("e.removeAttribute('hidden')") || panelSource.includes('e.removeAttribute("hidden")'));
});

test('selected-unit sections appear before export and force report sections', () => {
  const contact = mainHtml.indexOf('id="usp-contact-evidence-block"');
  const engagement = mainHtml.indexOf('id="usp-engagement-evidence-block"');
  const chain = mainHtml.indexOf('id="usp-chain-evidence-block"');
  const timeline = mainHtml.indexOf('id="usp-evidence-timeline-block"');
  const snapshot = mainHtml.indexOf('id="usp-evidence-export-block"');
  const report = mainHtml.indexOf('id="usp-force-report-block"');
  assert.ok(contact < engagement);
  assert.ok(engagement < chain);
  assert.ok(chain < timeline);
  assert.ok(timeline < snapshot);
  assert.ok(snapshot < report);
});

test('scenario-level evidence is rehomed outside Unit Status at runtime', () => {
  function rehomeList(source) {
    const match = source.match(/var SCENARIO_EVIDENCE_BLOCK_IDS = \[([\s\S]*?)\];/);
    assert.ok(match, 'missing SCENARIO_EVIDENCE_BLOCK_IDS declaration');
    return match[1];
  }
  const mainRehomeList = rehomeList(panelSource);
  const offlineRehomeList = rehomeList(offlinePanelSource);
  [
    panelSource,
    offlinePanelSource
  ].forEach((source, i) => {
    const label = i === 0 ? 'main' : 'offline';
    assert.ok(source.includes('SCENARIO_EVIDENCE_BLOCK_IDS'), label + ' missing rehome block list');
    assert.ok(source.includes("panel.id = 'scenario-evidence-panel'"), label + ' missing scenario panel creation');
    assert.ok(source.includes("panel.className = 'unit-status-panel scenario-evidence-panel'"), label + ' missing scenario panel class');
    // Batch 11: blocks are rehomed into collapsible group bodies inside the drawer
    // (groupBody.appendChild) rather than flat into the scenario body.
    assert.ok(source.includes('groupBody.appendChild(block)') || source.includes('body.appendChild(block)'), label + ' does not move blocks into the scenario evidence drawer');
    assert.ok(source.indexOf('ensureScenarioEvidencePanel();') < source.indexOf('populateCommanderBrief(unit)'), label + ' rehome must happen before scenario renderers populate');
  });
  [
    'usp-commander-brief-block',
    'usp-scenario-completeness-block',
    'usp-objective-health-block',
    'usp-review-queue-block',
    'usp-repair-plan-block',
    'usp-manual-fix-block',
    'usp-review-closeout-block',
    'usp-review-audit-block',
    'usp-handoff-package-block',
    'usp-evidence-quality-block',
    'usp-evidence-alerts-block',
    'usp-evidence-coverage-block',
    'usp-evidence-matrix-block',
    'usp-blocker-remediation-block',
    'usp-force-feed-block',
    'usp-force-report-block'
  ].forEach((id) => {
    assert.ok(mainRehomeList.includes("'" + id + "'"), 'main rehome list missing ' + id);
    assert.ok(offlineRehomeList.includes("'" + id + "'"), 'offline rehome list missing ' + id);
  });
  [
    'usp-contact-evidence-block',
    'usp-engagement-evidence-block',
    'usp-chain-evidence-block',
    'usp-evidence-recommendations-block',
    'usp-alternative-shooters-block',
    'usp-evidence-timeline-block',
    'usp-evidence-export-block'
  ].forEach((id) => {
    assert.ok(!mainRehomeList.includes("'" + id + "'"), 'selected-unit evidence should stay in Unit Status: ' + id);
    assert.ok(!offlineRehomeList.includes("'" + id + "'"), 'offline selected-unit evidence should stay in Unit Status: ' + id);
  });
});

test('shared status labels are available for polished scan states', () => {
  assert.strictEqual(Labels.statusLabel('Ready', 'ar'), 'جاهز');
  assert.ok(Labels.statusLabel('Blocked', 'ar'));
  assert.notStrictEqual(Labels.statusLabel('Blocked', 'ar'), 'Blocked');
  assert.strictEqual(Labels.statusLabel('Unknown', 'ar'), 'غير معروف');
  assert.ok(Labels.statusLabel('Ready', 'en').includes('Ready'));
});

test('export controls and force report remain accessible', () => {
  const exportSource = fs.readFileSync(path.join(shellDir, 'cmo-evidence-export.js'), 'utf8');
  const reportSource = fs.readFileSync(path.join(shellDir, 'cmo-force-evidence-report.js'), 'utf8');
  assert.ok(exportSource.includes('data-cmo-export-action="json"'));
  assert.ok(exportSource.includes('data-cmo-export-action="summary"'));
  assert.ok(exportSource.includes('data-cmo-export-action="download"'));
  assert.ok(reportSource.includes('data-cmo-force-report-action="summary"'));
  assert.ok(reportSource.includes('data-cmo-force-report-action="json"'));
  assert.ok(reportSource.includes('data-cmo-force-report-action="download"'));
});

test('polish pass keeps evidence data mounted and does not remove sections', () => {
  [
    'usp-evidence-quality-body',
    'usp-evidence-alerts-body',
    'usp-evidence-matrix-body',
    'usp-force-feed-body',
    'usp-contact-evidence-body',
    'usp-engagement-evidence-body',
    'usp-chain-evidence-body',
    'usp-evidence-timeline-body',
    'usp-evidence-export-body',
    'usp-force-report-body'
  ].forEach((id) => {
    assert.ok(mainHtml.includes('id="' + id + '"'), 'missing main body ' + id);
    assert.ok(offlineHtml.includes('id="' + id + '"'), 'missing offline body ' + id);
  });
});

test('UX polish has no backend call or mutation path', () => {
  const cmoSources = [
    'cmo-evidence-quality-gate.js',
    'cmo-evidence-readiness-matrix.js',
    'cmo-evidence-export.js',
    'cmo-force-evidence-report.js'
  ].map((file) => fs.readFileSync(path.join(shellDir, file), 'utf8')).join('\n');
  assert.ok(!/fetch\s*\(/.test(cmoSources));
  assert.ok(!/XMLHttpRequest/.test(cmoSources));
  assert.ok(!/\/api\//.test(cmoSources));
  assert.ok(!/computeContacts/.test(cmoSources));
  assert.ok(!/computeEngagements/.test(cmoSources));
  assert.ok(!/approved-actions/.test(cmoSources));
  assert.ok(!/applyAction|commitAction|executeAction|autoFire/.test(cmoSources));
  assert.ok(!/doctrine.*=|weapons_hold\s*=/.test(cmoSources));
});

if (process.exitCode) {
  console.error('failed');
} else {
  console.log('passed ' + passed + ' CMO evidence UX polish UI checks');
}
