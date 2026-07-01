const assert = require('assert');
const fs = require('fs');
const path = require('path');

const shellDir = path.join(__dirname, 'UI_MOdified', 'client', 'shell');
const labelsPath = path.join(shellDir, 'cmo-evidence-labels.js');
const engagementPath = path.join(shellDir, 'engagement-evidence.js');
const contactPath = path.join(shellDir, 'contact-evidence.js');
const decisionPath = path.join(shellDir, 'decision-chain-evidence.js');
const overlayPath = path.join(shellDir, 'evidence-map-overlays.js');
const timelinePath = path.join(shellDir, 'cmo-evidence-timeline.js');
const exportPath = path.join(shellDir, 'cmo-evidence-export.js');

const source = [
  exportPath,
].map((p) => fs.readFileSync(p, 'utf8')).join('\n');

const Labels = require(labelsPath);
require(engagementPath);
require(contactPath);
require(decisionPath);
require(overlayPath);
const Timeline = require(timelinePath);
const Exporter = require(exportPath);

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

function evidenceWorldState() {
  return {
    derived: {
      contacts_by_unit: {
        BLUE_EXPORT: {
          by_unit: 'BLUE_EXPORT',
          target_uid: 'RED_EXPORT',
          by_sensor: 'radar-1',
          method: 'radar',
          confidence: 'firm',
          classification: 'armor',
          last_seen: 12,
          range_nm: 42,
          max_range_nm: 120
        }
      },
      engagement_outcomes: [{
        shooter: 'BLUE_EXPORT',
        target: 'RED_EXPORT',
        weapon: '30mm cannon',
        status: 'blocked',
        reason: 'out_of_range',
        range_nm: 42,
        max_range_nm: 30
      }],
      units_by_uid: {
        RED_EXPORT: { uid: 'RED_EXPORT', lat: 30.4, lng: 35.4 }
      }
    }
  };
}

function buildFixedSnapshot() {
  Timeline.clear();
  Timeline.record('BLUE_EXPORT', {
    type: 'blocking_reason_changed',
    status: 'Blocked',
    reason_code: 'out_of_range',
    source: 'decision-chain',
    target: 'RED_EXPORT',
    weapon: '30mm cannon',
    timestamp: '2026-07-01T00:00:01.000Z'
  }, { force: true });
  return Exporter.buildSnapshot(evidenceWorldState(), {
    uid: 'BLUE_EXPORT',
    label: 'BLUE-IFV-03',
    side: 'Blue',
    domain: 'ground',
    role: 'ifv',
    lat: 30,
    lng: 35
  }, { generated_at: '2026-07-01T00:00:00.000Z' });
}

test('export includes engagement, contact, decision, overlay, and timeline evidence', () => {
  const snapshot = buildFixedSnapshot();
  assert.strictEqual(snapshot.selected_unit.uid, 'BLUE_EXPORT');
  assert.strictEqual(snapshot.selected_unit.label, 'BLUE-IFV-03');
  assert.strictEqual(snapshot.engagement.reason_code, 'out_of_range');
  assert.strictEqual(snapshot.engagement.weapon, '30mm cannon');
  assert.strictEqual(snapshot.contact.detection_status, 'Detected');
  assert.strictEqual(snapshot.contact.sensor_source, 'RADAR / radar-1');
  assert.strictEqual(snapshot.decision_chain.final_status, 'Blocked');
  assert.strictEqual(snapshot.overlay.status, 'Blocked');
  assert.strictEqual(snapshot.overlay.reason_code, 'out_of_range');
  assert.strictEqual(snapshot.timeline.length, 1);
  assert.ok(snapshot.sources.includes('Adjudicator evidence'));
  assert.ok(snapshot.sources.includes('World-state derived evidence'));
});

test('export includes blocking reason and shared Arabic label', () => {
  const snapshot = buildFixedSnapshot();
  const expectedAr = Labels.reasonLabel('out_of_range', 'ar');
  assert.strictEqual(snapshot.blocking_reason.code, 'out_of_range');
  assert.strictEqual(snapshot.blocking_reason.label_ar, expectedAr);
  assert.strictEqual(snapshot.engagement.reason_label_ar, expectedAr);
  assert.strictEqual(snapshot.decision_chain.blocking_reason_label_ar, expectedAr);
  assert.strictEqual(snapshot.overlay.reason_label_ar, expectedAr);
});

test('summary and JSON are deterministic with fixed inputs', () => {
  const snapshotA = buildFixedSnapshot();
  const snapshotB = buildFixedSnapshot();
  assert.strictEqual(Exporter.toJson(snapshotA), Exporter.toJson(snapshotB));
  const summary = Exporter.buildSummary(snapshotA);
  assert.ok(summary.includes('Unit: BLUE-IFV-03'));
  assert.ok(summary.includes('Final status: Blocked'));
  assert.ok(summary.includes('Blocking reason: out_of_range'));
  assert.ok(summary.includes('Arabic reason: ' + Labels.reasonLabel('out_of_range', 'ar')));
  assert.ok(summary.includes('Timeline: 1 evidence events recorded'));
});

test('rendered export UI exposes local copy and download controls', () => {
  const html = Exporter.renderExportHtml(buildFixedSnapshot());
  assert.ok(html.includes('Evidence Snapshot'));
  assert.ok(html.includes('Copy JSON'));
  assert.ok(html.includes('Copy Summary'));
  assert.ok(html.includes('Download JSON'));
  assert.ok(html.includes('data-cmo-export-action="json"'));
  assert.ok(html.includes('out_of_range'));
});

test('missing evidence exports safely as unknown', () => {
  Timeline.clear();
  const snapshot = Exporter.buildSnapshot({ derived: {} }, {
    uid: 'BLUE_MISSING',
    label: 'BLUE-MISSING'
  }, { generated_at: '2026-07-01T00:00:00.000Z' });
  assert.strictEqual(snapshot.selected_unit.uid, 'BLUE_MISSING');
  assert.strictEqual(snapshot.contact.detection_status, 'Unknown');
  assert.strictEqual(snapshot.engagement.reason_code, 'no_engagement_evidence');
  assert.strictEqual(snapshot.decision_chain.final_status, 'Unknown');
  assert.strictEqual(snapshot.overlay.status, 'Unknown');
  assert.doesNotThrow(() => Exporter.toJson(snapshot));
  assert.doesNotThrow(() => Exporter.buildSummary(snapshot));
});

test('export module makes no backend call and does not mutate combat, actions, or doctrine', () => {
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
  console.log('passed ' + passed + ' CMO evidence export UI checks');
}
