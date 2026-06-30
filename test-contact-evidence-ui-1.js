const assert = require('assert');
const fs = require('fs');
const path = require('path');

const modPath = path.join(__dirname, 'UI_MOdified', 'client', 'shell', 'contact-evidence.js');
const source = fs.readFileSync(modPath, 'utf8');
const CE = require(modPath);

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

test('renders detected contact evidence from existing world-state contacts', () => {
  const ws = {
    meta: { step_index: 4 },
    derived: {
      contacts: [{
        target_uid: 'RED-1',
        detected_by_side: 'BLUE',
        by_unit: 'BLUE-1',
        by_sensor: 'radar-a',
        method: 'radar',
        confidence: 'firm',
        classification: 'air',
        range_nm: 18,
        max_range_nm: 80,
        source: 'contacts'
      }]
    }
  };
  const ev = CE.getUnitContactEvidence(ws, 'BLUE-1');
  const html = CE.renderContactEvidenceHtml(ev, { lang: 'ar' });
  assert.strictEqual(ev.detection_status, 'Detected');
  assert.strictEqual(ev.confidence, 'High');
  assert.ok(html.includes('Detected'));
  assert.ok(html.includes('RED-1'));
  assert.ok(html.includes('RADAR / radar-a'));
  assert.ok(html.includes('detected_by_sensor'));
});

test('stale contact reason renders Arabic label', () => {
  const ev = CE.getUnitContactEvidence({
    derived: {
      contacts_by_unit: {
        BLUE2: { target_uid: 'RED-2', by_unit: 'BLUE2', stale: true, by_sensor: 'eo-1' }
      }
    }
  }, 'BLUE2');
  const html = CE.renderContactEvidenceHtml(ev, { lang: 'ar' });
  assert.strictEqual(ev.detection_status, 'Stale');
  assert.strictEqual(ev.reason_code, 'stale_contact');
  assert.ok(html.includes('معلومة الرصد قديمة'));
});

test('missing evidence renders honest unknown state', () => {
  const ev = CE.getUnitContactEvidence({ derived: {} }, 'BLUE-3');
  const html = CE.renderContactEvidenceHtml(ev, { lang: 'ar' });
  assert.strictEqual(ev.detection_status, 'Unknown');
  assert.strictEqual(ev.reason_code, 'no_contact_evidence');
  assert.ok(html.includes('لا توجد أدلة رصد متاحة'));
  assert.ok(html.includes('Unknown'));
});

test('unknown reason falls back safely and keeps code visible', () => {
  const ev = CE.getUnitContactEvidence({
    derived: {
      contact_evidence_by_unit: {
        U1: { target_uid: 'T1', by_unit: 'U1', reason: 'mystery_contact_gate' }
      }
    }
  }, 'U1');
  const html = CE.renderContactEvidenceHtml(ev, { lang: 'ar' });
  assert.strictEqual(ev.reason_code, 'mystery_contact_gate');
  assert.ok(html.includes('سبب الرصد غير معروف'));
  assert.ok(html.includes('mystery_contact_gate'));
});

test('display module has no backend route dependency', () => {
  assert.ok(!/fetch\s*\(/.test(source));
  assert.ok(!/XMLHttpRequest/.test(source));
  assert.ok(!/\/api\//.test(source));
});

test('display module does not compute detection or mutate sensors', () => {
  assert.ok(!/computeContacts/.test(source));
  assert.ok(!/applyAction|commitAction|executeAction/.test(source));
  assert.ok(!source.includes('.push('));
  assert.ok(!source.includes('.splice('));
  assert.ok(!source.includes('.setAttribute('));
});

if (process.exitCode) {
  console.error('failed');
} else {
  console.log('passed ' + passed + ' contact evidence UI checks');
}
