const assert = require('assert');
const fs = require('fs');
const path = require('path');

const shellDir = path.join(__dirname, 'UI_MOdified', 'client', 'shell');
const labelsPath = path.join(shellDir, 'cmo-evidence-labels.js');
const engagementPath = path.join(shellDir, 'engagement-evidence.js');
const contactPath = path.join(shellDir, 'contact-evidence.js');
const decisionPath = path.join(shellDir, 'decision-chain-evidence.js');
const matrixPath = path.join(shellDir, 'cmo-evidence-readiness-matrix.js');
const alertsPath = path.join(shellDir, 'cmo-evidence-alerts.js');
const feedPath = path.join(shellDir, 'cmo-force-evidence-feed.js');
const reportPath = path.join(shellDir, 'cmo-force-evidence-report.js');

const source = fs.readFileSync(reportPath, 'utf8');

const Labels = require(labelsPath);
require(engagementPath);
require(contactPath);
require(decisionPath);
const Matrix = require(matrixPath);
require(alertsPath);
const Feed = require(feedPath);
const Report = require(reportPath);

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

function worldState() {
  return {
    scenario_id: 'SCN-CMO-11',
    derived: {
      units_by_uid: {
        BLUE_READY: { uid: 'BLUE_READY', label: 'BLUE-TANK-01', side: 'blue' },
        BLUE_RANGE: { uid: 'BLUE_RANGE', label: 'BLUE-IFV-01', side: 'blue' },
        BLUE_UNKNOWN: { uid: 'BLUE_UNKNOWN', label: 'BLUE-IFV-02', side: 'blue' }
      },
      contacts_by_unit: {
        BLUE_READY: { by_unit: 'BLUE_READY', target_uid: 'RED_READY', confidence: 'firm', range_nm: 10, max_range_nm: 80 },
        BLUE_RANGE: { by_unit: 'BLUE_RANGE', target_uid: 'RED_RANGE', confidence: 'firm', range_nm: 42, max_range_nm: 80 }
      },
      engagement_outcomes: [{
        shooter: 'BLUE_READY', target: 'RED_READY', weapon: 'tank-gun', status: 'engaged', range_nm: 10, max_range_nm: 40
      }, {
        shooter: 'BLUE_RANGE', target: 'RED_RANGE', weapon: '30mm cannon', status: 'blocked', reason: 'out_of_range', range_nm: 42, max_range_nm: 30
      }]
    }
  };
}

function fixedEvents() {
  return [{
    timestamp: '2026-07-01T08:00:00.000Z',
    type: 'unit_blocked',
    uid: 'BLUE_RANGE',
    unit_label: 'BLUE-IFV-01',
    status: 'Blocked',
    reason_code: 'out_of_range',
    reason_label_ar: Labels.reasonLabel('out_of_range', 'ar'),
    source: 'force-readiness-matrix'
  }, {
    timestamp: '2026-07-01T08:00:01.000Z',
    type: 'unit_ready',
    uid: 'BLUE_READY',
    unit_label: 'BLUE-TANK-01',
    status: 'Ready',
    source: 'force-readiness-matrix'
  }, {
    timestamp: '2026-07-01T08:00:02.000Z',
    type: 'unit_unknown',
    uid: 'BLUE_UNKNOWN',
    unit_label: 'BLUE-IFV-02',
    status: 'Unknown',
    reason_code: 'no_contact_evidence',
    reason_label_ar: Labels.reasonLabel('no_contact_evidence', 'ar'),
    source: 'force-readiness-matrix'
  }];
}

function buildFixedReport() {
  const ws = worldState();
  const matrix = Matrix.buildMatrix(ws, { generated_at: '2026-07-01T08:00:00.000Z' });
  return Report.buildReport(ws, {
    matrix,
    generated_at: '2026-07-01T08:00:03.000Z',
    scenario: { id: 'SCN-CMO-11', name: 'Objective X' },
    selected_unit: { uid: 'BLUE_RANGE', label: 'BLUE-IFV-01', side: 'blue' },
    feed_events: fixedEvents()
  });
}

test('report includes Ready, Blocked, Unknown, and no-contact counts', () => {
  const report = buildFixedReport();
  assert.strictEqual(report.counts.Ready, 1);
  assert.strictEqual(report.counts.Blocked, 1);
  assert.strictEqual(report.counts.Unknown, 1);
  assert.strictEqual(report.no_contact_count, 1);
});

test('report includes top blockers, readiness rows, force events, and selected unit', () => {
  const report = buildFixedReport();
  assert.ok(report.top_blockers.some((b) => b.code === 'out_of_range' && b.label_ar === Labels.reasonLabel('out_of_range', 'ar')));
  assert.ok(report.top_blockers.some((b) => b.code === 'no_contact_evidence' && b.label_ar === Labels.reasonLabel('no_contact_evidence', 'ar')));
  assert.strictEqual(report.readiness_rows.length, 3);
  assert.ok(report.readiness_rows.some((row) => row.uid === 'BLUE_RANGE' && row.reason_code === 'out_of_range'));
  assert.ok(report.force_events.some((event) => event.type === 'unit_blocked' && event.uid === 'BLUE_RANGE'));
  assert.strictEqual(report.selected_unit.uid, 'BLUE_RANGE');
});

test('Arabic labels come from shared resolver', () => {
  const report = buildFixedReport();
  const row = report.readiness_rows.find((r) => r.uid === 'BLUE_RANGE');
  const event = report.force_events.find((e) => e.uid === 'BLUE_RANGE');
  assert.strictEqual(row.reason_label_ar, Labels.reasonLabel('out_of_range', 'ar'));
  assert.strictEqual(event.reason_label_ar, Labels.reasonLabel('out_of_range', 'ar'));
  assert.ok(Report.buildSummary(report).includes(Labels.reasonLabel('out_of_range', 'ar')));
});

test('JSON export is deterministic when inputs are fixed', () => {
  const first = Report.toJson(buildFixedReport());
  const second = Report.toJson(buildFixedReport());
  assert.strictEqual(first, second);
  assert.ok(first.includes('"readiness_rows"'));
  assert.ok(first.includes('"force_events"'));
});

test('missing evidence exports safely as Unknown-ready empty report', () => {
  const report = Report.buildReport({ derived: {} }, {
    generated_at: '2026-07-01T08:00:00.000Z',
    feed_events: []
  });
  assert.deepStrictEqual(report.counts, { Ready: 0, Blocked: 0, Unknown: 0 });
  assert.strictEqual(report.no_contact_count, 0);
  assert.deepStrictEqual(report.readiness_rows, []);
  assert.deepStrictEqual(report.force_events, []);
  assert.doesNotThrow(() => Report.renderReportHtml(report));
});

test('copy summary, copy JSON, and download controls render', () => {
  const html = Report.renderReportHtml(buildFixedReport());
  assert.ok(html.includes('Force Evidence Report'));
  assert.ok(html.includes('Copy Summary'));
  assert.ok(html.includes('Copy JSON'));
  assert.ok(html.includes('Download JSON'));
  assert.ok(html.includes('data-cmo-force-report-action="summary"'));
  assert.ok(html.includes('data-cmo-force-report-action="json"'));
  assert.ok(html.includes('data-cmo-force-report-action="download"'));
});

test('report can consume live matrix aggregation and force feed events', () => {
  Feed.clear();
  const matrix = Matrix.buildMatrix(worldState(), { generated_at: '2026-07-01T08:00:00.000Z' });
  Feed.observeMatrix(matrix, { force: true });
  const report = Report.buildReport(worldState(), {
    matrix,
    generated_at: '2026-07-01T08:00:03.000Z'
  });
  assert.strictEqual(report.counts.Blocked, 1);
  assert.ok(report.force_events.some((event) => event.type === 'unit_blocked' && event.reason_code === 'out_of_range'));
});

test('force report module has no backend route dependency or mutation path', () => {
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
  console.log('passed ' + passed + ' CMO force evidence report UI checks');
}
