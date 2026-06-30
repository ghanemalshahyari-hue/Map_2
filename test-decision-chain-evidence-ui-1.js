const assert = require('assert');
const fs = require('fs');
const path = require('path');

const modPath = path.join(__dirname, 'UI_MOdified', 'client', 'shell', 'decision-chain-evidence.js');
const source = fs.readFileSync(modPath, 'utf8');
const DC = require(modPath);

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

function step(ev, key) {
  return ev.steps.filter((s) => s.key === key)[0];
}

test('detected fresh contact plus engaged record renders ready chain', () => {
  const ws = {
    derived: {
      contacts_by_unit: {
        'BLUE-1': {
          by_unit: 'BLUE-1',
          target_uid: 'RED-1',
          by_sensor: 'radar-a',
          method: 'radar',
          confidence: 'firm',
          last_seen: 7
        }
      },
      engagement_outcomes: [{
        shooter: 'BLUE-1',
        target: 'RED-1',
        weapon: 'sam-1',
        status: 'engaged',
        range_nm: 20,
        max_range_nm: 45
      }]
    }
  };
  const ev = DC.getUnitDecisionChainEvidence(ws, 'BLUE-1');
  const html = DC.renderDecisionChainEvidenceHtml(ev, { lang: 'ar' });
  assert.strictEqual(ev.final_status, 'Ready');
  assert.strictEqual(step(ev, 'contact').status, 'Pass');
  assert.strictEqual(step(ev, 'range').status, 'Pass');
  assert.strictEqual(step(ev, 'ammo').status, 'Pass');
  assert.ok(html.includes('Ready'));
  assert.ok(html.includes('الرصد'));
  assert.ok(html.includes('النتيجة النهائية'));
});

test('detected contact plus out-of-range engagement blocks at range', () => {
  const ev = DC.getUnitDecisionChainEvidence({
    derived: {
      contacts: [{ by_unit: 'BLUE-2', target_uid: 'RED-2', last_seen: 3 }],
      engagement_outcomes: [{
        shooter: 'BLUE-2',
        target: 'RED-2',
        weapon: 'gun',
        status: 'blocked',
        reason: 'out_of_range',
        range_nm: 42,
        max_range_nm: 30
      }]
    }
  }, 'BLUE-2');
  const html = DC.renderDecisionChainEvidenceHtml(ev, { lang: 'en' });
  assert.strictEqual(ev.final_status, 'Blocked');
  assert.strictEqual(ev.blocking_reason_code, 'out_of_range');
  assert.strictEqual(step(ev, 'range').status, 'Blocked');
  assert.ok(html.includes('Target outside weapon range'));
  assert.ok(html.includes('out_of_range'));
});

test('no contact evidence stays unknown without crashing', () => {
  const ev = DC.getUnitDecisionChainEvidence({ derived: {} }, 'BLUE-3');
  const html = DC.renderDecisionChainEvidenceHtml(ev, { lang: 'ar' });
  assert.strictEqual(ev.final_status, 'Unknown');
  assert.strictEqual(step(ev, 'contact').status, 'Unknown');
  assert.ok(html.includes('no_contact_evidence'));
  assert.ok(html.includes('سبب المنع'));
});

test('unknown fields render safely', () => {
  const ev = DC.getUnitDecisionChainEvidence({
    derived: {
      contacts_by_unit: { U1: { by_unit: 'U1', reason: 'mystery_contact_gate' } },
      engagements_by_unit: { U1: { status: 'blocked', reason: 'mystery_engagement_gate' } }
    }
  }, 'U1');
  const html = DC.renderDecisionChainEvidenceHtml(ev, { lang: 'ar' });
  assert.ok(['Blocked', 'Unknown'].includes(ev.final_status));
  assert.ok(html.includes('mystery_contact_gate') || html.includes('mystery_engagement_gate'));
});

test('Arabic decision-chain labels render', () => {
  const html = DC.renderDecisionChainEvidenceHtml(DC.getUnitDecisionChainEvidence({ derived: {} }, 'U2'), { lang: 'ar' });
  assert.ok(html.includes('الرصد'));
  assert.ok(html.includes('حداثة التتبع'));
  assert.ok(html.includes('صلاحية الهدف'));
  assert.ok(html.includes('السلاح'));
  assert.ok(html.includes('المدى'));
  assert.ok(html.includes('التحكم النيراني'));
  assert.ok(html.includes('الذخيرة'));
  assert.ok(html.includes('قواعد الاشتباك'));
  assert.ok(html.includes('النتيجة النهائية'));
  assert.ok(html.includes('سبب المنع'));
});

test('display module has no backend route dependency', () => {
  assert.ok(!/fetch\s*\(/.test(source));
  assert.ok(!/XMLHttpRequest/.test(source));
  assert.ok(!/\/api\//.test(source));
});

test('display module does not mutate or introduce firing actions', () => {
  assert.ok(!/computeContacts/.test(source));
  assert.ok(!/computeEngagements/.test(source));
  assert.ok(!/approved-actions/.test(source));
  assert.ok(!/applyAction|commitAction|executeAction|autoFire|auto-fire/.test(source));
});

if (process.exitCode) {
  console.error('failed');
} else {
  console.log('passed ' + passed + ' decision-chain evidence UI checks');
}
