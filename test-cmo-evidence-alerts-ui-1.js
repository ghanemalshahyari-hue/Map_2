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

const source = fs.readFileSync(alertsPath, 'utf8');

const Labels = require(labelsPath);
require(engagementPath);
require(contactPath);
require(decisionPath);
const Matrix = require(matrixPath);
const Alerts = require(alertsPath);

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
    derived: {
      units_by_uid: {
        BLUE_READY: { uid: 'BLUE_READY', label: 'BLUE-TANK-01' },
        BLUE_RANGE: { uid: 'BLUE_RANGE', label: 'BLUE-IFV-01' },
        BLUE_UNKNOWN: { uid: 'BLUE_UNKNOWN', label: 'BLUE-IFV-02' },
        BLUE_NOCONTACT: { uid: 'BLUE_NOCONTACT', label: 'BLUE-IFV-03' }
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

function fakeElement(attrs) {
  const listeners = {};
  return {
    listeners,
    addEventListener(type, cb) { listeners[type] = cb; },
    getAttribute(name) { return attrs[name]; }
  };
}

function fakeContainer(buttons) {
  return {
    querySelectorAll(selector) {
      return selector === '[data-cmo-alert-action]' ? buttons : [];
    }
  };
}

test('blocked, unknown, no-contact, and top-blocker counts render correctly', () => {
  const matrix = Matrix.buildMatrix(worldState());
  const alerts = Alerts.buildAlerts(matrix, { generated_at: '2026-07-01T00:00:00.000Z' });
  assert.strictEqual(alerts.blocked_count, 1);
  assert.strictEqual(alerts.unknown_count, 2);
  assert.strictEqual(alerts.no_contact_count, 2);
  assert.strictEqual(alerts.top_blocker.code, 'no_contact_evidence');
  assert.strictEqual(alerts.top_blocker.count, 2);
});

test('alert HTML includes counts and Arabic labels', () => {
  const alerts = Alerts.buildAlerts(Matrix.buildMatrix(worldState()));
  const html = Alerts.renderAlertsHtml(alerts, { lang: 'ar' });
  assert.ok(html.includes('Blocked'));
  assert.ok(html.includes('Unknown'));
  assert.ok(html.includes('No contact'));
  assert.ok(html.includes('Top blocker'));
  assert.ok(html.includes('no_contact_evidence x 2'));
  assert.ok(html.includes(Labels.reasonLabel('no_contact_evidence', 'ar')));
});

test('clicking Blocked applies blocked filter if callback exists', () => {
  const btn = fakeElement({ 'data-cmo-alert-action': 'blocked' });
  let filter = null;
  Alerts.bindAlertInteractions(fakeContainer([btn]), Alerts.buildAlerts(Matrix.buildMatrix(worldState())), {
    onFilter: (next) => { filter = next; }
  });
  btn.listeners.click();
  assert.deepStrictEqual(filter, { status: 'Blocked', reason_code: null });
});

test('clicking Unknown applies unknown filter if callback exists', () => {
  const btn = fakeElement({ 'data-cmo-alert-action': 'unknown' });
  let filter = null;
  Alerts.bindAlertInteractions(fakeContainer([btn]), Alerts.buildAlerts(Matrix.buildMatrix(worldState())), {
    onFilter: (next) => { filter = next; }
  });
  btn.listeners.click();
  assert.deepStrictEqual(filter, { status: 'Unknown', reason_code: null });
});

test('clicking top blocker applies reason filter if callback exists', () => {
  const btn = fakeElement({ 'data-cmo-alert-action': 'top_blocker', 'data-cmo-alert-reason': 'out_of_range' });
  let filter = null;
  Alerts.bindAlertInteractions(fakeContainer([btn]), Alerts.buildAlerts(Matrix.buildMatrix(worldState())), {
    onFilter: (next) => { filter = next; }
  });
  btn.listeners.click();
  assert.deepStrictEqual(filter, { status: 'All', reason_code: 'out_of_range' });
});

test('missing callback does not crash', () => {
  const btn = fakeElement({ 'data-cmo-alert-action': 'blocked' });
  Alerts.bindAlertInteractions(fakeContainer([btn]), Alerts.buildAlerts(Matrix.buildMatrix(worldState())), {});
  assert.doesNotThrow(() => btn.listeners.click());
});

test('filterForAction maps no-contact alert to reason filter', () => {
  assert.deepStrictEqual(Alerts.filterForAction('no_contact'), { status: 'All', reason_code: 'no_contact_evidence' });
});

test('alert module has no backend route dependency or mutation path', () => {
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
  console.log('passed ' + passed + ' CMO evidence alert badge UI checks');
}
