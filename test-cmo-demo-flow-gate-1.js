const assert = require('assert');
const fs = require('fs');
const path = require('path');

const shellDir = path.join(__dirname, 'UI_MOdified', 'client', 'shell');
const mainApp = path.join(__dirname, 'UI_MOdified', 'client', 'app.html');
const offlineApp = path.join(__dirname, 'UI_MOdified', 'Offline_Deployment', 'offline_app', 'client', 'app.html');
const offlineShellDir = path.join(__dirname, 'UI_MOdified', 'Offline_Deployment', 'offline_app', 'client', 'shell');

const moduleFiles = [
  'cmo-evidence-labels.js',
  'engagement-evidence.js',
  'contact-evidence.js',
  'decision-chain-evidence.js',
  'cmo-evidence-recommendations.js',
  'evidence-map-overlays.js',
  'cmo-evidence-timeline.js',
  'cmo-evidence-export.js',
  'cmo-evidence-readiness-matrix.js',
  'cmo-evidence-alerts.js',
  'cmo-evidence-quality-gate.js',
  'cmo-force-evidence-feed.js',
  'cmo-force-evidence-report.js'
];

const Labels = require(path.join(shellDir, 'cmo-evidence-labels.js'));
const Engagement = require(path.join(shellDir, 'engagement-evidence.js'));
const Contact = require(path.join(shellDir, 'contact-evidence.js'));
const Decision = require(path.join(shellDir, 'decision-chain-evidence.js'));
const Overlay = require(path.join(shellDir, 'evidence-map-overlays.js'));
const Timeline = require(path.join(shellDir, 'cmo-evidence-timeline.js'));
const UnitExport = require(path.join(shellDir, 'cmo-evidence-export.js'));
const Matrix = require(path.join(shellDir, 'cmo-evidence-readiness-matrix.js'));
const Alerts = require(path.join(shellDir, 'cmo-evidence-alerts.js'));
const Quality = require(path.join(shellDir, 'cmo-evidence-quality-gate.js'));
const Feed = require(path.join(shellDir, 'cmo-force-evidence-feed.js'));
const ForceReport = require(path.join(shellDir, 'cmo-force-evidence-report.js'));

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
    scenario_id: 'SCN-CMO-DEMO-GATE',
    derived: {
      units_by_uid: {
        BLUE_READY: { uid: 'BLUE_READY', label: 'BLUE-TANK-01', side: 'blue', lat: 25.2, lng: 55.2 },
        BLUE_RANGE: { uid: 'BLUE_RANGE', label: 'BLUE-IFV-01', side: 'blue', lat: 25.25, lng: 55.25 },
        BLUE_UNKNOWN: { uid: 'BLUE_UNKNOWN', label: 'BLUE-IFV-02', side: 'blue', lat: 25.3, lng: 55.3 },
        RED_READY: { uid: 'RED_READY', label: 'RED-TANK-01', side: 'red', lat: 25.21, lng: 55.21 },
        RED_RANGE: { uid: 'RED_RANGE', label: 'RED-ARMOR-01', side: 'red', lat: 25.62, lng: 55.62 }
      },
      contacts_by_unit: {
        BLUE_READY: {
          by_unit: 'BLUE_READY',
          target_uid: 'RED_READY',
          detection_status: 'Detected',
          confidence: 'firm',
          sensor_source: 'radar',
          range_nm: 10,
          max_range_nm: 80,
          last_seen: 120
        },
        BLUE_RANGE: {
          by_unit: 'BLUE_RANGE',
          target_uid: 'RED_RANGE',
          detection_status: 'Detected',
          confidence: 'firm',
          sensor_source: 'radar',
          range_nm: 42,
          max_range_nm: 80,
          last_seen: 121
        }
      },
      engagement_outcomes: [{
        shooter: 'BLUE_READY',
        target: 'RED_READY',
        weapon: 'tank-gun',
        status: 'engaged',
        range_nm: 10,
        max_range_nm: 40
      }, {
        shooter: 'BLUE_RANGE',
        target: 'RED_RANGE',
        weapon: '30mm cannon',
        status: 'blocked',
        reason: 'out_of_range',
        range_nm: 42,
        max_range_nm: 30
      }]
    }
  };
}

function unit(ws, uid) {
  return ws.derived.units_by_uid[uid];
}

function selectedUnitFromRow(row) {
  return row && (row.unit || { uid: row.uid, label: row.unit_label, side: row.side });
}

test('quality warning click filters matrix to affected rows', () => {
  const ws = worldState();
  const matrix = Matrix.buildMatrix(ws);
  const quality = Quality.buildQualityGate(ws, { matrix });
  const noContactFilter = Quality.filterForWarning('no_contact_evidence');
  const noContactRows = Matrix.filterRows(matrix.rows, noContactFilter);
  const rangeFilter = Quality.filterForWarning('out_of_range');
  const rangeRows = Matrix.filterRows(matrix.rows, rangeFilter);
  assert.strictEqual(quality.status, 'Needs Review');
  assert.ok(quality.warnings.some((warning) => warning.code === 'no_contact_evidence'));
  assert.deepStrictEqual(noContactFilter, { status: 'Unknown', reason_code: 'no_contact_evidence' });
  assert.ok(noContactRows.some((row) => row.uid === 'BLUE_UNKNOWN'));
  assert.ok(noContactRows.every((row) => row.reason_code === 'no_contact_evidence'));
  assert.deepStrictEqual(rangeFilter, { status: 'All', reason_code: 'out_of_range' });
  assert.deepStrictEqual(rangeRows.map((row) => row.uid), ['BLUE_RANGE']);
});

test('row click selection leads to selected-unit evidence matching matrix row', () => {
  const ws = worldState();
  const matrix = Matrix.buildMatrix(ws);
  const row = Matrix.filterRows(matrix.rows, Quality.filterForWarning('out_of_range'))[0];
  const selected = selectedUnitFromRow(row);
  const engagement = Engagement.getUnitEngagementWhyNot(ws, selected.uid);
  const contact = Contact.getUnitContactEvidence(ws, selected.uid);
  const decision = Decision.getUnitDecisionChainEvidence(ws, selected.uid);
  assert.strictEqual(selected.uid, 'BLUE_RANGE');
  assert.strictEqual(row.reason_code, engagement.reason_code);
  assert.strictEqual(row.reason_code, decision.blocking_reason_code);
  assert.strictEqual(row.target_uid, contact.target_uid);
  assert.strictEqual(row.final_status, decision.final_status);
});

test('map overlay reason matches selected-unit panel reason', () => {
  const ws = worldState();
  const decision = Decision.getUnitDecisionChainEvidence(ws, 'BLUE_RANGE');
  const engagement = Engagement.getUnitEngagementWhyNot(ws, 'BLUE_RANGE');
  const overlay = Overlay.buildOverlayState(ws, unit(ws, 'BLUE_RANGE'));
  assert.strictEqual(overlay.reason_code, decision.blocking_reason_code);
  assert.strictEqual(overlay.reason_code, engagement.reason_code);
  assert.strictEqual(overlay.reason_label_ar, Labels.reasonLabel('out_of_range', 'ar'));
  assert.ok(overlay.target_line);
});

test('timeline records the selected-unit demo path without duplicate spam', () => {
  const ws = worldState();
  const uid = 'BLUE_RANGE';
  Timeline.clear(uid);
  Timeline.observeContact(uid, Contact.getUnitContactEvidence(ws, uid));
  Timeline.observeEngagement(uid, Engagement.getUnitEngagementWhyNot(ws, uid));
  Timeline.observeDecision(uid, Decision.getUnitDecisionChainEvidence(ws, uid));
  Timeline.observeOverlay(uid, Overlay.buildOverlayState(ws, unit(ws, uid)));
  const first = Timeline.get(uid).length;
  Timeline.observeContact(uid, Contact.getUnitContactEvidence(ws, uid));
  Timeline.observeEngagement(uid, Engagement.getUnitEngagementWhyNot(ws, uid));
  Timeline.observeDecision(uid, Decision.getUnitDecisionChainEvidence(ws, uid));
  Timeline.observeOverlay(uid, Overlay.buildOverlayState(ws, unit(ws, uid)));
  assert.strictEqual(Timeline.get(uid).length, first);
  assert.ok(Timeline.get(uid).some((event) => event.reason_code === 'out_of_range'));
});

test('unit export matches selected evidence and force report matches counts and warnings', () => {
  const ws = worldState();
  const matrix = Matrix.buildMatrix(ws, { generated_at: '2026-07-01T11:00:00.000Z' });
  const alerts = Alerts.buildAlerts(matrix, { generated_at: '2026-07-01T11:00:00.000Z' });
  Feed.clear();
  Feed.observeMatrix(matrix, { force: true });
  const snapshot = UnitExport.buildSnapshot(ws, unit(ws, 'BLUE_RANGE'), { generated_at: '2026-07-01T11:00:01.000Z' });
  const report = ForceReport.buildReport(ws, {
    matrix,
    alerts,
    selected_unit: unit(ws, 'BLUE_RANGE'),
    generated_at: '2026-07-01T11:00:02.000Z'
  });
  const quality = Quality.buildQualityGate(ws, {
    matrix,
    alerts,
    report,
    selected_unit: unit(ws, 'BLUE_RANGE'),
    generated_at: '2026-07-01T11:00:03.000Z'
  });
  assert.strictEqual(snapshot.selected_unit.uid, 'BLUE_RANGE');
  assert.strictEqual(snapshot.blocking_reason.code, 'out_of_range');
  assert.strictEqual(snapshot.blocking_reason.label_ar, Labels.reasonLabel('out_of_range', 'ar'));
  assert.deepStrictEqual(report.counts, matrix.counts);
  assert.strictEqual(report.no_contact_count, alerts.no_contact_count);
  assert.ok(report.force_events.some((event) => event.uid === 'BLUE_RANGE' && event.reason_code === 'out_of_range'));
  assert.ok(quality.warnings.some((warning) => warning.code === 'out_of_range'));
  assert.ok(quality.warnings.some((warning) => warning.code === 'no_contact_evidence'));
});

test('main and offline script parity covers every CMO evidence module', () => {
  const mainHtml = fs.readFileSync(mainApp, 'utf8');
  const offlineHtml = fs.readFileSync(offlineApp, 'utf8');
  moduleFiles.forEach((file) => {
    assert.ok(fs.existsSync(path.join(shellDir, file)), 'missing main shell file ' + file);
    assert.ok(fs.existsSync(path.join(offlineShellDir, file)), 'missing offline shell file ' + file);
    assert.ok(mainHtml.includes('shell/' + file), 'missing main script include ' + file);
    assert.ok(offlineHtml.includes('shell/' + file), 'missing offline script include ' + file);
  });
  ['usp-evidence-quality-block', 'usp-evidence-matrix-block', 'usp-force-report-block'].forEach((id) => {
    assert.ok(mainHtml.includes('id="' + id + '"'));
    assert.ok(offlineHtml.includes('id="' + id + '"'));
  });
});

test('demo-flow modules preserve read-only boundaries', () => {
  const combined = moduleFiles
    .filter((file) => file !== 'cmo-evidence-labels.js')
    .map((file) => fs.readFileSync(path.join(shellDir, file), 'utf8'))
    .join('\n');
  assert.ok(!/fetch\s*\(/.test(combined));
  assert.ok(!/XMLHttpRequest/.test(combined));
  assert.ok(!/\/api\//.test(combined));
  assert.ok(!/computeContacts/.test(combined));
  assert.ok(!/computeEngagements/.test(combined));
  assert.ok(!/approved-actions/.test(combined));
  assert.ok(!/applyAction|commitAction|executeAction|autoFire/.test(combined));
  assert.ok(!/doctrine.*=|weapons_hold\s*=/.test(combined));
});

if (process.exitCode) {
  console.error('failed');
} else {
  console.log('passed ' + passed + ' CMO evidence demo flow gate checks');
}
