const assert = require('assert');
const fs = require('fs');
const path = require('path');

const shellDir = path.join(__dirname, 'UI_MOdified', 'client', 'shell');
const qualityPath = path.join(shellDir, 'cmo-evidence-quality-gate.js');
const source = fs.readFileSync(qualityPath, 'utf8');

const Labels = require(path.join(shellDir, 'cmo-evidence-labels.js'));
require(path.join(shellDir, 'engagement-evidence.js'));
require(path.join(shellDir, 'contact-evidence.js'));
require(path.join(shellDir, 'decision-chain-evidence.js'));
require(path.join(shellDir, 'cmo-evidence-readiness-matrix.js'));
require(path.join(shellDir, 'cmo-evidence-alerts.js'));
require(path.join(shellDir, 'cmo-force-evidence-feed.js'));
require(path.join(shellDir, 'cmo-force-evidence-report.js'));
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

function worldState() {
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

function fakeButton(code) {
  const listeners = {};
  return {
    listeners,
    addEventListener(type, cb) { listeners[type] = cb; },
    getAttribute(name) { return name === 'data-cmo-quality-warning' ? code : null; }
  };
}

function fakeContainer(buttons) {
  return {
    querySelectorAll(selector) {
      return selector === '[data-cmo-quality-warning]' ? buttons : [];
    }
  };
}

test('no-contact warning click applies Unknown plus no-contact matrix filter', () => {
  assert.deepStrictEqual(Quality.filterForWarning('no_contact_evidence'), {
    status: 'Unknown',
    reason_code: 'no_contact_evidence'
  });
});

test('top-blocker warning click applies reason-code filter', () => {
  assert.deepStrictEqual(Quality.filterForWarning('out_of_range'), {
    status: 'All',
    reason_code: 'out_of_range'
  });
});

test('unknown report warning click applies Unknown filter', () => {
  assert.deepStrictEqual(Quality.filterForWarning('force_report_unknown'), {
    status: 'Unknown',
    reason_code: null
  });
});

test('quality warning click dispatches existing matrix filter callback', () => {
  const quality = Quality.buildQualityGate(worldState());
  const noContact = fakeButton('no_contact_evidence');
  const range = fakeButton('out_of_range');
  const unknown = fakeButton('force_report_unknown');
  const received = [];
  Quality.bindQualityInteractions(fakeContainer([noContact, range, unknown]), quality, {
    onFilter: (filter) => { received.push(filter); }
  });
  noContact.listeners.click();
  range.listeners.click();
  unknown.listeners.click();
  assert.deepStrictEqual(received[0], { status: 'Unknown', reason_code: 'no_contact_evidence' });
  assert.deepStrictEqual(received[1], { status: 'All', reason_code: 'out_of_range' });
  assert.deepStrictEqual(received[2], { status: 'Unknown', reason_code: null });
});

test('missing matrix callback does not crash', () => {
  const btn = fakeButton('out_of_range');
  Quality.bindQualityInteractions(fakeContainer([btn]), Quality.buildQualityGate(worldState()), {});
  assert.doesNotThrow(() => btn.listeners.click());
});

test('Arabic labels render on clickable warnings', () => {
  const html = Quality.renderQualityGateHtml(Quality.buildQualityGate(worldState()));
  assert.ok(html.includes('data-cmo-quality-warning="no_contact_evidence"'));
  assert.ok(html.includes('data-cmo-quality-warning="out_of_range"'));
  assert.ok(html.includes(Labels.reasonLabel('no_contact_evidence', 'ar')));
  assert.ok(html.includes(Labels.reasonLabel('out_of_range', 'ar')));
  assert.ok(html.includes('usp-quality-warning-btn'));
});

test('quality gate remains read-only', () => {
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
  console.log('passed ' + passed + ' CMO evidence quality drilldown UI checks');
}
