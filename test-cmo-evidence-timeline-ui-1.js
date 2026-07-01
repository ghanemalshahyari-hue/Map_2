const assert = require('assert');
const fs = require('fs');
const path = require('path');

const shellDir = path.join(__dirname, 'UI_MOdified', 'client', 'shell');
const labelsPath = path.join(shellDir, 'cmo-evidence-labels.js');
const timelinePath = path.join(shellDir, 'cmo-evidence-timeline.js');

const Labels = require(labelsPath);
const TL = require(timelinePath);
const source = fs.readFileSync(timelinePath, 'utf8');

let passed = 0;
function test(name, fn) {
  try {
    TL.clear();
    fn();
    passed += 1;
    console.log('ok - ' + name);
  } catch (err) {
    console.error('not ok - ' + name);
    console.error(err && err.stack || err);
    process.exitCode = 1;
  }
}

test('records contact evidence event', () => {
  TL.observeContact('U1', {
    detection_status: 'Detected',
    reason_code: 'detected_by_sensor',
    target_uid: 'T1',
    sensor_source: 'RADAR / r1',
    confidence: 'High',
    last_seen: 3,
    records: [{}]
  });
  const rows = TL.get('U1');
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].type, 'contact_status_changed');
  assert.strictEqual(rows[0].status, 'Detected');
  assert.strictEqual(rows[0].confidence, 'High');
});

test('records engagement blocked reason event', () => {
  TL.observeEngagement('U2', {
    can_engage: false,
    reason_code: 'out_of_range',
    target_uid: 'T2',
    weapon: 'sam',
    records: [{}]
  });
  const rows = TL.get('U2');
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].type, 'engagement_status_changed');
  assert.strictEqual(rows[0].status, 'Blocked');
  assert.strictEqual(rows[0].reason_code, 'out_of_range');
});

test('records decision-chain final state and blocking reason events', () => {
  TL.observeDecision('U3', {
    final_status: 'Blocked',
    blocking_reason_code: 'out_of_range',
    engagement: { target_uid: 'T3', weapon: 'gun' },
    contact: { target_uid: 'T3' }
  });
  const rows = TL.get('U3');
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[0].type, 'decision_chain_evaluated');
  assert.strictEqual(rows[1].type, 'blocking_reason_changed');
  assert.strictEqual(rows[1].reason_label_ar, Labels.reasonLabel('out_of_range', 'ar'));
});

test('records overlay-rendered event', () => {
  TL.observeOverlay('U4', {
    uid: 'U4',
    status: 'Blocked',
    reason_code: 'out_of_range',
    reason_label_ar: Labels.reasonLabel('out_of_range', 'ar'),
    target_uid: 'T4',
    weapon_range_meters: 1000,
    sensor_range_meters: 2000,
    target_line: [{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }]
  });
  const rows = TL.get('U4');
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].type, 'overlay_rendered');
  assert.ok(rows[0].detail.includes('weapon range'));
  assert.ok(rows[0].detail.includes('target line'));
});

test('duplicate renders do not create duplicate events', () => {
  const ev = {
    final_status: 'Blocked',
    blocking_reason_code: 'out_of_range',
    engagement: { target_uid: 'T5', weapon: 'sam' }
  };
  TL.observeDecision('U5', ev);
  TL.observeDecision('U5', ev);
  TL.observeDecision('U5', ev);
  const rows = TL.get('U5');
  assert.strictEqual(rows.filter((r) => r.type === 'decision_chain_evaluated').length, 1);
  assert.strictEqual(rows.filter((r) => r.type === 'blocking_reason_changed').length, 1);
});

test('missing evidence records safe unknown/missing event', () => {
  TL.observeContact('U6', { detection_status: 'Unknown', reason_code: 'no_contact_evidence', records: [] });
  const rows = TL.get('U6');
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].type, 'evidence_missing');
  assert.strictEqual(rows[0].status, 'Unknown');
  assert.strictEqual(rows[0].reason_code, 'no_contact_evidence');
  assert.doesNotThrow(() => TL.renderTimelineHtml('U6', { lang: 'ar' }));
});

test('Arabic reason labels come from shared resolver', () => {
  TL.observeEngagement('U7', {
    can_engage: false,
    reason_code: 'weapons_hold',
    target_uid: 'T7',
    weapon: 'gun',
    records: [{}]
  });
  const html = TL.renderTimelineHtml('U7', { lang: 'ar' });
  assert.ok(html.includes(Labels.reasonLabel('weapons_hold', 'ar')));
});

test('timeline is bounded', () => {
  for (let i = 0; i < 75; i += 1) {
    TL.record('U8', {
      type: 'contact_status_changed',
      status: 'Detected',
      target: 'T' + i,
      source: 'test'
    });
  }
  const rows = TL.get('U8');
  assert.strictEqual(rows.length, 50);
  assert.strictEqual(rows[0].target, 'T25');
  assert.strictEqual(rows[49].target, 'T74');
});

test('empty timeline renders safe empty message', () => {
  const html = TL.renderTimelineHtml('NONE', { lang: 'ar' });
  assert.ok(html.includes('No evidence changes recorded yet.'));
  assert.ok(html.includes('لا توجد تغيّرات مسجلة بعد'));
});

test('timeline module has no backend route dependency', () => {
  assert.ok(!/fetch\s*\(/.test(source));
  assert.ok(!/XMLHttpRequest/.test(source));
  assert.ok(!/\/api\//.test(source));
});

test('timeline module does not introduce combat/action/doctrine mutation', () => {
  assert.ok(!/computeContacts/.test(source));
  assert.ok(!/computeEngagements/.test(source));
  assert.ok(!/approved-actions/.test(source));
  assert.ok(!/applyAction|commitAction|executeAction|autoFire|auto-fire/.test(source));
  assert.ok(!/doctrine.*=|weapons_hold\s*=/.test(source));
});

if (process.exitCode) {
  console.error('failed');
} else {
  console.log('passed ' + passed + ' CMO evidence timeline UI checks');
}
