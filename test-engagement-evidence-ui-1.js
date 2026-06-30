const assert = require('assert');
const fs = require('fs');
const path = require('path');

const modPath = path.join(__dirname, 'UI_MOdified', 'client', 'shell', 'engagement-evidence.js');
const source = fs.readFileSync(modPath, 'utf8');
const EE = require(modPath);

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

test('renders existing blocked reason code and Arabic label', () => {
  const ws = {
    derived: {
      engagement_outcomes: [{
        shooter: 'BLUE-1',
        target: 'RED-1',
        weapon: 'sam-1',
        status: 'blocked',
        reason: 'out_of_range',
        range_nm: 42,
        max_range_nm: 30,
        source: 'engagement'
      }]
    }
  };
  const ev = EE.getUnitEngagementWhyNot(ws, 'BLUE-1');
  const html = EE.renderEngagementEvidenceHtml(ev, { lang: 'ar' });
  assert.strictEqual(ev.can_engage, false);
  assert.strictEqual(ev.reason_code, 'out_of_range');
  assert.ok(html.includes('out_of_range'));
  assert.ok(html.includes('الهدف خارج مدى السلاح'));
});

test('renders can-engage status from existing engaged record', () => {
  const ev = EE.getUnitEngagementWhyNot({
    derived: {
      engagement_outcomes: [{ shooter: 'BLUE-2', target: 'RED-2', status: 'engaged', weapon: 'gun' }]
    }
  }, 'BLUE-2');
  const html = EE.renderEngagementEvidenceHtml(ev, { lang: 'ar' });
  assert.strictEqual(ev.can_engage, true);
  assert.ok(html.includes('Can engage'));
  assert.ok(html.includes('يمكن الاشتباك'));
});

test('unknown reason falls back safely and keeps reason code visible', () => {
  const ev = EE.getUnitEngagementWhyNot({
    derived: {
      engagements_by_unit: {
        U1: { status: 'blocked', reason: 'mystery_gate' }
      }
    }
  }, 'U1');
  const html = EE.renderEngagementEvidenceHtml(ev, { lang: 'ar' });
  assert.strictEqual(ev.reason_code, 'mystery_gate');
  assert.ok(html.includes('سبب اشتباك غير معروف'));
  assert.ok(html.includes('mystery_gate'));
});

test('missing evidence renders neutral no-evidence state', () => {
  const ev = EE.getUnitEngagementWhyNot({ derived: {} }, 'U2');
  const html = EE.renderEngagementEvidenceHtml(ev, { lang: 'ar' });
  assert.strictEqual(ev.reason_code, 'no_engagement_evidence');
  assert.ok(html.includes('لا توجد أدلة اشتباك متاحة'));
});

test('display module has no backend route dependency', () => {
  assert.ok(!/fetch\s*\(/.test(source));
  assert.ok(!/XMLHttpRequest/.test(source));
  assert.ok(!/\/api\//.test(source));
});

test('display module does not introduce firing or action mutation path', () => {
  assert.ok(!/computeEngagements/.test(source));
  assert.ok(!/approved-actions/.test(source));
  assert.ok(!/applyAction|commitAction|executeAction|autoFire|auto-fire/.test(source));
});

if (process.exitCode) {
  console.error('failed');
} else {
  console.log('passed ' + passed + ' engagement evidence UI checks');
}
