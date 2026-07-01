const assert = require('assert');
const fs = require('fs');
const path = require('path');

const shellDir = path.join(__dirname, 'UI_MOdified', 'client', 'shell');
const offlineClientDir = path.join(__dirname, 'UI_MOdified', 'Offline_Deployment', 'offline_app', 'client');

const moduleFiles = [
  'cmo-evidence-labels.js',
  'engagement-evidence.js',
  'contact-evidence.js',
  'decision-chain-evidence.js',
  'evidence-map-overlays.js',
  'cmo-evidence-timeline.js',
  'cmo-evidence-export.js',
  'cmo-evidence-readiness-matrix.js',
  'cmo-evidence-alerts.js',
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
    scenario_id: 'SCN-WORKFLOW-GATE',
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

function blueUnit(ws, uid) {
  return ws.derived.units_by_uid[uid];
}

function sortedJson(value) {
  return JSON.stringify(value, Object.keys(value).sort());
}

test('alert counts equal matrix aggregation', () => {
  const ws = worldState();
  const matrix = Matrix.buildMatrix(ws, { generated_at: '2026-07-01T09:00:00.000Z' });
  const alerts = Alerts.buildAlerts(matrix, { generated_at: '2026-07-01T09:00:00.000Z' });
  assert.strictEqual(alerts.blocked_count, matrix.counts.Blocked);
  assert.strictEqual(alerts.unknown_count, matrix.counts.Unknown);
  assert.strictEqual(alerts.no_contact_count, matrix.rows.filter((row) => row.reason_code === 'no_contact_evidence').length);
  assert.ok(alerts.top_blocker);
  assert.strictEqual(alerts.top_blocker.count, matrix.top_blockers[0].count);
});

test('matrix selected row equals selected-unit panel evidence accessors', () => {
  const ws = worldState();
  const row = Matrix.buildMatrix(ws).rows.find((r) => r.uid === 'BLUE_RANGE');
  const engagement = Engagement.getUnitEngagementWhyNot(ws, 'BLUE_RANGE');
  const contact = Contact.getUnitContactEvidence(ws, 'BLUE_RANGE');
  const decision = Decision.getUnitDecisionChainEvidence(ws, 'BLUE_RANGE');
  assert.strictEqual(row.reason_code, 'out_of_range');
  assert.strictEqual(row.reason_code, decision.blocking_reason_code);
  assert.strictEqual(row.target_uid, engagement.target_uid);
  assert.strictEqual(row.target_uid, contact.target_uid);
  assert.strictEqual(row.weapon, engagement.weapon);
  assert.strictEqual(row.final_status, decision.final_status);
});

test('overlay reason equals decision-chain reason', () => {
  const ws = worldState();
  const unit = blueUnit(ws, 'BLUE_RANGE');
  const decision = Decision.getUnitDecisionChainEvidence(ws, 'BLUE_RANGE');
  const overlay = Overlay.buildOverlayState(ws, unit);
  assert.strictEqual(overlay.status, decision.final_status);
  assert.strictEqual(overlay.reason_code, decision.blocking_reason_code);
  assert.strictEqual(overlay.reason_label_ar, Labels.reasonLabel('out_of_range', 'ar'));
  assert.ok(overlay.target_line);
});

test('force feed matches matrix and stays bounded/deduped', () => {
  const ws = worldState();
  const matrix = Matrix.buildMatrix(ws);
  Feed.clear();
  Feed.observeMatrix(matrix);
  const firstCount = Feed.get().length;
  Feed.observeMatrix(matrix);
  assert.strictEqual(Feed.get().length, firstCount);
  assert.ok(Feed.get().some((event) => event.type === 'unit_blocked' && event.uid === 'BLUE_RANGE'));

  Feed.clear();
  for (let i = 0; i < 70; i += 1) {
    Feed.record({ type: 'unit_unknown', uid: 'BLUE_' + i, status: 'Unknown', reason_code: 'no_contact_evidence' }, { force: true });
  }
  assert.ok(Feed.get().length <= 60);
});

test('timeline records evidence without duplicate spam', () => {
  const ws = worldState();
  const uid = 'BLUE_RANGE';
  const contact = Contact.getUnitContactEvidence(ws, uid);
  const engagement = Engagement.getUnitEngagementWhyNot(ws, uid);
  const decision = Decision.getUnitDecisionChainEvidence(ws, uid);
  const overlay = Overlay.buildOverlayState(ws, blueUnit(ws, uid));
  Timeline.clear(uid);
  Timeline.observeContact(uid, contact);
  Timeline.observeEngagement(uid, engagement);
  Timeline.observeDecision(uid, decision);
  Timeline.observeOverlay(uid, overlay);
  const first = Timeline.get(uid).length;
  Timeline.observeContact(uid, contact);
  Timeline.observeEngagement(uid, engagement);
  Timeline.observeDecision(uid, decision);
  Timeline.observeOverlay(uid, overlay);
  assert.strictEqual(Timeline.get(uid).length, first);
});

test('unit export and force report use shared Arabic labels', () => {
  const ws = worldState();
  const uid = 'BLUE_RANGE';
  const unit = blueUnit(ws, uid);
  const matrix = Matrix.buildMatrix(ws, { generated_at: '2026-07-01T09:00:00.000Z' });
  Feed.clear();
  Feed.observeMatrix(matrix, { force: true });
  Timeline.clear(uid);
  Timeline.observeDecision(uid, Decision.getUnitDecisionChainEvidence(ws, uid));
  const snapshot = UnitExport.buildSnapshot(ws, unit, { generated_at: '2026-07-01T09:00:01.000Z' });
  const report = ForceReport.buildReport(ws, {
    matrix,
    selected_unit: unit,
    generated_at: '2026-07-01T09:00:02.000Z'
  });
  const label = Labels.reasonLabel('out_of_range', 'ar');
  assert.strictEqual(snapshot.blocking_reason.label_ar, label);
  assert.ok(report.readiness_rows.some((row) => row.uid === uid && row.reason_label_ar === label));
  assert.ok(report.force_events.some((event) => event.uid === uid && event.reason_label_ar === label));
  assert.ok(ForceReport.buildSummary(report).includes(report.top_blockers[0].label_ar));
});

test('force report counts equal matrix counts and feed events', () => {
  const ws = worldState();
  const matrix = Matrix.buildMatrix(ws, { generated_at: '2026-07-01T09:00:00.000Z' });
  Feed.clear();
  Feed.observeMatrix(matrix, { force: true });
  const report = ForceReport.buildReport(ws, {
    matrix,
    generated_at: '2026-07-01T09:00:02.000Z'
  });
  assert.deepStrictEqual(report.counts, matrix.counts);
  assert.strictEqual(report.no_contact_count, Alerts.buildAlerts(matrix).no_contact_count);
  assert.strictEqual(report.force_events.length, Feed.get().length);
  assert.ok(report.force_events.some((event) => event.uid === 'BLUE_RANGE' && event.reason_code === 'out_of_range'));
});

test('clearing and reselecting does not create stale selected-unit evidence', () => {
  const ws = worldState();
  const blocked = UnitExport.buildSnapshot(ws, blueUnit(ws, 'BLUE_RANGE'), { generated_at: '2026-07-01T09:00:01.000Z' });
  Timeline.clear('BLUE_RANGE');
  Timeline.clear('BLUE_READY');
  const ready = UnitExport.buildSnapshot(ws, blueUnit(ws, 'BLUE_READY'), { generated_at: '2026-07-01T09:00:02.000Z' });
  assert.strictEqual(blocked.selected_unit.uid, 'BLUE_RANGE');
  assert.strictEqual(blocked.blocking_reason.code, 'out_of_range');
  assert.strictEqual(ready.selected_unit.uid, 'BLUE_READY');
  assert.strictEqual(ready.final_status, 'Ready');
  assert.notStrictEqual(sortedJson(blocked.selected_unit), sortedJson(ready.selected_unit));
});

test('offline static path has all CMO evidence scripts and files', () => {
  const html = fs.readFileSync(path.join(offlineClientDir, 'app.html'), 'utf8');
  moduleFiles.forEach((file) => {
    assert.ok(fs.existsSync(path.join(offlineClientDir, 'shell', file)), 'missing offline shell file ' + file);
    assert.ok(html.includes('shell/' + file), 'missing offline script include ' + file);
  });
  assert.ok(html.includes('id="usp-force-report-block"'));
  assert.ok(html.includes('id="usp-force-report-body"'));
});

test('CMO evidence modules have no backend route dependency or mutation path', () => {
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
  console.log('passed ' + passed + ' CMO evidence workflow gate checks');
}
