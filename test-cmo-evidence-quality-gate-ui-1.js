const assert = require('assert');
const fs = require('fs');
const path = require('path');

const shellDir = path.join(__dirname, 'UI_MOdified', 'client', 'shell');
const offlineClientDir = path.join(__dirname, 'UI_MOdified', 'Offline_Deployment', 'offline_app', 'client');
const labelsPath = path.join(shellDir, 'cmo-evidence-labels.js');
const engagementPath = path.join(shellDir, 'engagement-evidence.js');
const contactPath = path.join(shellDir, 'contact-evidence.js');
const decisionPath = path.join(shellDir, 'decision-chain-evidence.js');
const matrixPath = path.join(shellDir, 'cmo-evidence-readiness-matrix.js');
const alertsPath = path.join(shellDir, 'cmo-evidence-alerts.js');
const feedPath = path.join(shellDir, 'cmo-force-evidence-feed.js');
const reportPath = path.join(shellDir, 'cmo-force-evidence-report.js');
const qualityPath = path.join(shellDir, 'cmo-evidence-quality-gate.js');

const source = fs.readFileSync(qualityPath, 'utf8');

const Labels = require(labelsPath);
require(engagementPath);
require(contactPath);
require(decisionPath);
const Matrix = require(matrixPath);
require(alertsPath);
const Feed = require(feedPath);
require(reportPath);
const Quality = require(qualityPath);

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

function mixedWorldState() {
  return {
    derived: {
      units_by_uid: {
        BLUE_READY: { uid: 'BLUE_READY', label: 'BLUE-TANK-01', side: 'blue' },
        BLUE_RANGE: { uid: 'BLUE_RANGE', label: 'BLUE-IFV-01', side: 'blue' },
        BLUE_UNKNOWN: { uid: 'BLUE_UNKNOWN', label: 'BLUE-IFV-02', side: 'blue' }
      },
      contacts_by_unit: {
        BLUE_READY: { by_unit: 'BLUE_READY', target_uid: 'RED_READY', detection_status: 'Detected', confidence: 'firm', range_nm: 10, max_range_nm: 80 },
        BLUE_RANGE: { by_unit: 'BLUE_RANGE', target_uid: 'RED_RANGE', detection_status: 'Detected', confidence: 'firm', range_nm: 42, max_range_nm: 80 }
      },
      engagement_outcomes: [{
        shooter: 'BLUE_READY', target: 'RED_READY', weapon: 'tank-gun', status: 'engaged', range_nm: 10, max_range_nm: 40
      }, {
        shooter: 'BLUE_RANGE', target: 'RED_RANGE', weapon: '30mm cannon', status: 'blocked', reason: 'out_of_range', range_nm: 42, max_range_nm: 30
      }]
    }
  };
}

function readyWorldState() {
  return {
    derived: {
      units_by_uid: {
        BLUE_READY: { uid: 'BLUE_READY', label: 'BLUE-TANK-01', side: 'blue' }
      },
      contacts_by_unit: {
        BLUE_READY: { by_unit: 'BLUE_READY', target_uid: 'RED_READY', detection_status: 'Detected', confidence: 'firm', range_nm: 10, max_range_nm: 80 }
      },
      engagement_outcomes: [{
        shooter: 'BLUE_READY', target: 'RED_READY', weapon: 'tank-gun', status: 'engaged', range_nm: 10, max_range_nm: 40
      }]
    }
  };
}

test('mixed evidence produces Needs Review with counts', () => {
  const quality = Quality.buildQualityGate(mixedWorldState(), { generated_at: '2026-07-01T10:00:00.000Z' });
  assert.strictEqual(quality.status, 'Needs Review');
  assert.deepStrictEqual(quality.counts, { Ready: 1, Blocked: 1, Unknown: 1 });
  assert.strictEqual(quality.no_contact_count, 1);
});

test('warnings include no-contact, top blockers, and report unknown', () => {
  const quality = Quality.buildQualityGate(mixedWorldState());
  assert.ok(quality.warnings.some((w) => w.code === 'no_contact_evidence' && w.count === 1));
  assert.ok(quality.warnings.some((w) => w.code === 'out_of_range' && w.count === 1));
  assert.ok(quality.warnings.some((w) => w.code === 'force_report_unknown'));
});

test('Arabic labels come from shared resolver', () => {
  const quality = Quality.buildQualityGate(mixedWorldState());
  const range = quality.warnings.find((w) => w.code === 'out_of_range');
  const contact = quality.warnings.find((w) => w.code === 'no_contact_evidence');
  assert.strictEqual(range.label_ar, Labels.reasonLabel('out_of_range', 'ar'));
  assert.strictEqual(contact.label_ar, Labels.reasonLabel('no_contact_evidence', 'ar'));
  assert.ok(Quality.renderQualityGateHtml(quality).includes(Labels.reasonLabel('out_of_range', 'ar')));
});

test('clean ready evidence produces Ready for Review without warnings', () => {
  const quality = Quality.buildQualityGate(readyWorldState());
  assert.strictEqual(quality.status, 'Ready for Review');
  assert.deepStrictEqual(quality.counts, { Ready: 1, Blocked: 0, Unknown: 0 });
  assert.strictEqual(quality.no_contact_count, 0);
  assert.deepStrictEqual(quality.warnings, []);
});

test('missing evidence is unknown and renders safely', () => {
  const quality = Quality.buildQualityGate({ derived: {} }, { generated_at: '2026-07-01T10:00:00.000Z' });
  assert.strictEqual(quality.status, 'Unknown');
  assert.deepStrictEqual(quality.counts, { Ready: 0, Blocked: 0, Unknown: 0 });
  assert.ok(quality.warnings.some((w) => w.code === 'no_force_evidence'));
  assert.doesNotThrow(() => Quality.renderQualityGateHtml(quality));
});

test('rendered UI includes status, counts, warnings, and source', () => {
  const html = Quality.renderQualityGateHtml(Quality.buildQualityGate(mixedWorldState()));
  assert.ok(html.includes('Evidence Quality') || html.includes('Status'));
  assert.ok(html.includes('Needs Review'));
  assert.ok(html.includes('Ready units'));
  assert.ok(html.includes('Blocked units'));
  assert.ok(html.includes('Unknown units'));
  assert.ok(html.includes('No-contact evidence'));
  assert.ok(html.includes('Warnings'));
  assert.ok(html.includes('Source: Readiness matrix + alerts + force report'));
});

test('quality gate consumes existing matrix, alerts, feed, and report inputs', () => {
  const ws = mixedWorldState();
  const matrix = Matrix.buildMatrix(ws);
  Feed.clear();
  Feed.observeMatrix(matrix, { force: true });
  const quality = Quality.buildQualityGate(ws, {
    matrix,
    feed_events: Feed.get(),
    generated_at: '2026-07-01T10:00:00.000Z'
  });
  assert.deepStrictEqual(quality.counts, matrix.counts);
  assert.strictEqual(quality.no_contact_count, 1);
  assert.ok(quality.top_blockers.length >= 2);
});

test('offline static path has quality gate script and panel block', () => {
  const html = fs.readFileSync(path.join(offlineClientDir, 'app.html'), 'utf8');
  assert.ok(fs.existsSync(path.join(offlineClientDir, 'shell', 'cmo-evidence-quality-gate.js')));
  assert.ok(html.includes('shell/cmo-evidence-quality-gate.js'));
  assert.ok(html.includes('id="usp-evidence-quality-block"'));
  assert.ok(html.includes('id="usp-evidence-quality-body"'));
});

test('quality gate module has no backend route dependency or mutation path', () => {
  assert.ok(!/fetch\s*\(/.test(source));
  assert.ok(!/XMLHttpRequest/.test(source));
  assert.ok(!/\/api\//.test(source));
  assert.ok(!/computeContacts/.test(source));
  assert.ok(!/computeEngagements/.test(source));
  assert.ok(!/approved-actions/.test(source));
  assert.ok(!/applyAction|commitAction|executeAction|autoFire/.test(source));
  assert.ok(!/doctrine.*=|weapons_hold\s*=/.test(source));
});

if (process.exitCode) {
  console.error('failed');
} else {
  console.log('passed ' + passed + ' CMO evidence quality gate UI checks');
}
