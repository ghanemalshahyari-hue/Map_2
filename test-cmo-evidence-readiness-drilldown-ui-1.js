const assert = require('assert');
const fs = require('fs');
const path = require('path');

const shellDir = path.join(__dirname, 'UI_MOdified', 'client', 'shell');
const labelsPath = path.join(shellDir, 'cmo-evidence-labels.js');
const engagementPath = path.join(shellDir, 'engagement-evidence.js');
const contactPath = path.join(shellDir, 'contact-evidence.js');
const decisionPath = path.join(shellDir, 'decision-chain-evidence.js');
const matrixPath = path.join(shellDir, 'cmo-evidence-readiness-matrix.js');

const source = fs.readFileSync(matrixPath, 'utf8');

const Labels = require(labelsPath);
require(engagementPath);
require(contactPath);
require(decisionPath);
const Matrix = require(matrixPath);

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
        BLUE_READY: { uid: 'BLUE_READY', label: 'BLUE-TANK-01', side: 'Blue', lat: 30, lng: 35 },
        BLUE_RANGE: { uid: 'BLUE_RANGE', label: 'BLUE-IFV-01', side: 'Blue', lat: 30.1, lng: 35.1 },
        BLUE_STALE: { uid: 'BLUE_STALE', label: 'BLUE-UAV-01', side: 'Blue', lat: 30.2, lng: 35.2 },
        BLUE_UNKNOWN: { uid: 'BLUE_UNKNOWN', label: 'BLUE-IFV-02', side: 'Blue', lat: 30.3, lng: 35.3 }
      },
      contacts_by_unit: {
        BLUE_READY: { by_unit: 'BLUE_READY', target_uid: 'RED_READY', confidence: 'firm', last_seen: 8, range_nm: 10, max_range_nm: 80 },
        BLUE_RANGE: { by_unit: 'BLUE_RANGE', target_uid: 'RED_RANGE', confidence: 'firm', last_seen: 9, range_nm: 42, max_range_nm: 80 },
        BLUE_STALE: { by_unit: 'BLUE_STALE', target_uid: 'RED_STALE', stale: true, reason: 'stale_contact', confidence: 'low', last_seen: 2 }
      },
      engagement_outcomes: [{
        shooter: 'BLUE_READY', target: 'RED_READY', weapon: 'tank-gun', status: 'engaged', range_nm: 10, max_range_nm: 40
      }, {
        shooter: 'BLUE_RANGE', target: 'RED_RANGE', weapon: '30mm cannon', status: 'blocked', reason: 'out_of_range', range_nm: 42, max_range_nm: 30
      }, {
        shooter: 'BLUE_STALE', target: 'RED_STALE', weapon: 'missile', status: 'blocked', reason: 'stale_contact', range_nm: 20, max_range_nm: 50
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

function fakeContainer(groups) {
  return {
    innerHTML: '',
    querySelectorAll(selector) {
      return groups[selector] || [];
    }
  };
}

test('All filter shows all rows', () => {
  const matrix = Matrix.buildMatrix(worldState());
  const filtered = Matrix.filterMatrix(matrix, { status: 'All' });
  assert.strictEqual(filtered.rows.length, 4);
});

test('Ready filter shows only ready rows', () => {
  const rows = Matrix.filterMatrix(Matrix.buildMatrix(worldState()), { status: 'Ready' }).rows;
  assert.deepStrictEqual(rows.map((r) => r.uid), ['BLUE_READY']);
});

test('Blocked filter shows only blocked rows', () => {
  const rows = Matrix.filterMatrix(Matrix.buildMatrix(worldState()), { status: 'Blocked' }).rows;
  assert.deepStrictEqual(rows.map((r) => r.final_status), ['Blocked', 'Blocked']);
});

test('Unknown filter shows only unknown rows', () => {
  const rows = Matrix.filterMatrix(Matrix.buildMatrix(worldState()), { status: 'Unknown' }).rows;
  assert.deepStrictEqual(rows.map((r) => r.uid), ['BLUE_UNKNOWN']);
});

test('blocker chip filters by reason code', () => {
  const rows = Matrix.filterMatrix(Matrix.buildMatrix(worldState()), { reason_code: 'out_of_range' }).rows;
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].uid, 'BLUE_RANGE');
  assert.strictEqual(rows[0].reason_code, 'out_of_range');
});

test('rendered controls include status filters, blocker chips, Arabic labels, and row ids', () => {
  const html = Matrix.renderMatrixHtml(Matrix.buildMatrix(worldState()), { filter: { status: 'All' } });
  assert.ok(html.includes('data-cmo-matrix-status="All"'));
  assert.ok(html.includes('data-cmo-matrix-status="Blocked"'));
  assert.ok(html.includes('data-cmo-matrix-reason="out_of_range"'));
  assert.ok(html.includes('data-cmo-matrix-uid="BLUE_RANGE"'));
  assert.ok(html.includes(Labels.reasonLabel('out_of_range', 'ar')));
});

test('row click calls existing select/focus callback if available', () => {
  const matrix = Matrix.buildMatrix(worldState());
  const rowEl = fakeElement({ 'data-cmo-matrix-uid': 'BLUE_RANGE' });
  const container = fakeContainer({ '[data-cmo-matrix-uid]': [rowEl] });
  let selected = null;
  Matrix.bindMatrixInteractions(container, matrix, { onSelectUnit: (row) => { selected = row; } });
  rowEl.listeners.click();
  assert.strictEqual(selected.uid, 'BLUE_RANGE');
  assert.strictEqual(selected.unit.label, 'BLUE-IFV-01');
});

test('missing select/focus callback does not crash', () => {
  const matrix = Matrix.buildMatrix(worldState());
  const rowEl = fakeElement({ 'data-cmo-matrix-uid': 'BLUE_RANGE' });
  const container = fakeContainer({ '[data-cmo-matrix-uid]': [rowEl] });
  Matrix.bindMatrixInteractions(container, matrix, {});
  assert.doesNotThrow(() => rowEl.listeners.click());
});

test('status and blocker controls invoke local filter rerender callback', () => {
  const matrix = Matrix.buildMatrix(worldState());
  const blockedBtn = fakeElement({ 'data-cmo-matrix-status': 'Blocked' });
  const rangeBtn = fakeElement({ 'data-cmo-matrix-reason': 'out_of_range' });
  const container = fakeContainer({
    '[data-cmo-matrix-status]': [blockedBtn],
    '[data-cmo-matrix-reason]': [rangeBtn]
  });
  const filters = [];
  Matrix.bindMatrixInteractions(container, matrix, { onFilter: (filter) => filters.push(filter) });
  blockedBtn.listeners.click();
  assert.strictEqual(filters[0].status, 'Blocked');
  rangeBtn.listeners.click();
  assert.strictEqual(filters[1].reason_code, 'out_of_range');
});

test('readiness drilldown module has no backend route dependency or mutation path', () => {
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
  console.log('passed ' + passed + ' CMO evidence readiness drilldown UI checks');
}
