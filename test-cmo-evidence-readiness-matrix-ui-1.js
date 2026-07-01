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
        BLUE_READY: { uid: 'BLUE_READY', label: 'BLUE-TANK-01', side: 'Blue', domain: 'ground' },
        BLUE_RANGE: { uid: 'BLUE_RANGE', label: 'BLUE-IFV-01', side: 'Blue', domain: 'ground' },
        BLUE_STALE: { uid: 'BLUE_STALE', label: 'BLUE-UAV-01', side: 'Blue', domain: 'air' },
        BLUE_UNKNOWN: { uid: 'BLUE_UNKNOWN', label: 'BLUE-IFV-02', side: 'Blue', domain: 'ground' }
      },
      contacts_by_unit: {
        BLUE_READY: {
          by_unit: 'BLUE_READY',
          target_uid: 'RED_READY',
          confidence: 'firm',
          last_seen: 8,
          range_nm: 12,
          max_range_nm: 80
        },
        BLUE_RANGE: {
          by_unit: 'BLUE_RANGE',
          target_uid: 'RED_RANGE',
          confidence: 'firm',
          last_seen: 9,
          range_nm: 42,
          max_range_nm: 80
        },
        BLUE_STALE: {
          by_unit: 'BLUE_STALE',
          target_uid: 'RED_STALE',
          stale: true,
          reason: 'stale_contact',
          confidence: 'low',
          last_seen: 2
        }
      },
      engagement_outcomes: [{
        shooter: 'BLUE_READY',
        target: 'RED_READY',
        weapon: 'tank-gun',
        status: 'engaged',
        range_nm: 12,
        max_range_nm: 40
      }, {
        shooter: 'BLUE_RANGE',
        target: 'RED_RANGE',
        weapon: '30mm cannon',
        status: 'blocked',
        reason: 'out_of_range',
        range_nm: 42,
        max_range_nm: 30
      }, {
        shooter: 'BLUE_STALE',
        target: 'RED_STALE',
        weapon: 'missile',
        status: 'blocked',
        reason: 'stale_contact',
        range_nm: 18,
        max_range_nm: 60
      }]
    }
  };
}

test('builds force-level ready, blocked, and unknown counts', () => {
  const matrix = Matrix.buildMatrix(worldState(), { generated_at: '2026-07-01T00:00:00.000Z' });
  assert.strictEqual(matrix.total_units, 4);
  assert.strictEqual(matrix.counts.Ready, 1);
  assert.strictEqual(matrix.counts.Blocked, 2);
  assert.strictEqual(matrix.counts.Unknown, 1);
});

test('reports top blocking reasons from existing evidence', () => {
  const matrix = Matrix.buildMatrix(worldState());
  const blockers = Object.fromEntries(matrix.top_blockers.map((b) => [b.code, b.count]));
  assert.strictEqual(blockers.out_of_range, 1);
  assert.strictEqual(blockers.stale_contact, 1);
  assert.strictEqual(matrix.top_blockers.find((b) => b.code === 'out_of_range').label_ar, Labels.reasonLabel('out_of_range', 'ar'));
});

test('matrix rows expose unit contact, engagement, final, and reason states', () => {
  const rows = Matrix.buildMatrix(worldState()).rows;
  const byUid = Object.fromEntries(rows.map((row) => [row.uid, row]));
  assert.strictEqual(byUid.BLUE_READY.contact_status, 'Detected');
  assert.strictEqual(byUid.BLUE_READY.engagement_status, 'Can engage');
  assert.strictEqual(byUid.BLUE_READY.final_status, 'Ready');
  assert.strictEqual(byUid.BLUE_READY.reason_code, null);
  assert.strictEqual(byUid.BLUE_RANGE.contact_status, 'Detected');
  assert.strictEqual(byUid.BLUE_RANGE.engagement_status, 'Cannot engage');
  assert.strictEqual(byUid.BLUE_RANGE.final_status, 'Blocked');
  assert.strictEqual(byUid.BLUE_RANGE.reason_code, 'out_of_range');
  assert.strictEqual(byUid.BLUE_UNKNOWN.contact_status, 'Unknown');
  assert.strictEqual(byUid.BLUE_UNKNOWN.final_status, 'Unknown');
  assert.strictEqual(byUid.BLUE_UNKNOWN.reason_code, 'no_contact_evidence');
});

test('renders matrix counts, blocker labels, Arabic title text, and rows', () => {
  const matrix = Matrix.buildMatrix(worldState());
  const html = Matrix.renderMatrixHtml(matrix, { lang: 'ar' });
  assert.ok(html.includes('Ready'));
  assert.ok(html.includes('Blocked'));
  assert.ok(html.includes('Unknown'));
  assert.ok(html.includes('out_of_range'));
  assert.ok(html.includes(Labels.reasonLabel('out_of_range', 'ar')));
  assert.ok(html.includes('BLUE-TANK-01'));
  assert.ok(html.includes('BLUE-IFV-02'));
});

test('infers unit IDs from evidence when no unit list exists', () => {
  const matrix = Matrix.buildMatrix({
    derived: {
      contacts_by_unit: { BLUE_ONLY: { by_unit: 'BLUE_ONLY', target_uid: 'RED_ONLY' } },
      engagement_outcomes: [{ shooter: 'BLUE_ONLY', target: 'RED_ONLY', status: 'engaged' }]
    }
  });
  assert.strictEqual(matrix.total_units, 1);
  assert.strictEqual(matrix.rows[0].uid, 'BLUE_ONLY');
});

test('missing evidence and empty world state render safely', () => {
  const matrix = Matrix.buildMatrix({ derived: {} });
  assert.strictEqual(matrix.total_units, 0);
  assert.strictEqual(matrix.counts.Ready, 0);
  assert.strictEqual(matrix.counts.Blocked, 0);
  assert.strictEqual(matrix.counts.Unknown, 0);
  assert.doesNotThrow(() => Matrix.renderMatrixHtml(matrix));
});

test('readiness matrix module has no backend route dependency or mutation path', () => {
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
  console.log('passed ' + passed + ' CMO evidence readiness matrix UI checks');
}
