const assert = require('assert');
const fs = require('fs');
const path = require('path');

const shellDir = path.join(__dirname, 'UI_MOdified', 'client', 'shell');
const labelsPath = path.join(shellDir, 'cmo-evidence-labels.js');
const engagementPath = path.join(shellDir, 'engagement-evidence.js');
const contactPath = path.join(shellDir, 'contact-evidence.js');
const decisionPath = path.join(shellDir, 'decision-chain-evidence.js');
const matrixPath = path.join(shellDir, 'cmo-evidence-readiness-matrix.js');
const feedPath = path.join(shellDir, 'cmo-force-evidence-feed.js');

const source = fs.readFileSync(feedPath, 'utf8');

const Labels = require(labelsPath);
require(engagementPath);
require(contactPath);
require(decisionPath);
const Matrix = require(matrixPath);
const Feed = require(feedPath);

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
        BLUE_UNKNOWN: { uid: 'BLUE_UNKNOWN', label: 'BLUE-IFV-02' }
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

function fakeContainer(rows) {
  return {
    querySelectorAll(selector) {
      return selector === '[data-cmo-force-feed-uid]' ? rows : [];
    }
  };
}

test('records force-level blocked, ready, unknown, and no-contact events', () => {
  Feed.clear();
  const matrix = Matrix.buildMatrix(worldState());
  Feed.observeMatrix(matrix, { force: true });
  const events = Feed.get();
  assert.ok(events.some((e) => e.type === 'unit_blocked' && e.uid === 'BLUE_RANGE' && e.reason_code === 'out_of_range'));
  assert.ok(events.some((e) => e.type === 'unit_ready' && e.uid === 'BLUE_READY'));
  assert.ok(events.some((e) => e.type === 'unit_unknown' && e.uid === 'BLUE_UNKNOWN'));
  assert.ok(events.some((e) => e.type === 'no_contact_evidence' && e.uid === 'BLUE_UNKNOWN'));
});

test('records top blocker change event', () => {
  Feed.clear();
  Feed.observeMatrix(Matrix.buildMatrix(worldState()), { force: true });
  const top = Feed.get().find((e) => e.type === 'top_blocker_changed');
  assert.ok(top);
  assert.strictEqual(top.reason_code, 'no_contact_evidence');
  assert.strictEqual(top.count, 1);
});

test('duplicate render does not spam events', () => {
  Feed.clear();
  const matrix = Matrix.buildMatrix(worldState());
  Feed.observeMatrix(matrix);
  const count = Feed.get().length;
  Feed.observeMatrix(matrix);
  assert.strictEqual(Feed.get().length, count);
});

test('Arabic reason labels come from shared resolver', () => {
  Feed.clear();
  Feed.observeMatrix(Matrix.buildMatrix(worldState()), { force: true });
  const blocked = Feed.get().find((e) => e.type === 'unit_blocked');
  assert.strictEqual(blocked.reason_label_ar, Labels.reasonLabel('out_of_range', 'ar'));
  assert.ok(Feed.renderFeedHtml().includes(Labels.reasonLabel('out_of_range', 'ar')));
});

test('feed item click dispatches existing unit focus callback if available', () => {
  Feed.clear();
  Feed.observeMatrix(Matrix.buildMatrix(worldState()), { force: true });
  const rowEl = fakeElement({ 'data-cmo-force-feed-uid': 'BLUE_RANGE' });
  let selected = null;
  Feed.bindFeedInteractions(fakeContainer([rowEl]), {
    onSelectUnit: (event) => { selected = event; }
  });
  rowEl.listeners.click();
  assert.strictEqual(selected.uid, 'BLUE_RANGE');
});

test('missing click callback does not crash', () => {
  const rowEl = fakeElement({ 'data-cmo-force-feed-uid': 'BLUE_RANGE' });
  Feed.bindFeedInteractions(fakeContainer([rowEl]), {});
  assert.doesNotThrow(() => rowEl.listeners.click());
});

test('feed HTML renders commander-readable force changes', () => {
  Feed.clear();
  Feed.observeMatrix(Matrix.buildMatrix(worldState()), { force: true });
  const html = Feed.renderFeedHtml({ limit: 10 });
  assert.ok(html.includes('Latest force evidence changes'));
  assert.ok(html.includes('Blocked: BLUE-IFV-01'));
  assert.ok(html.includes('Ready: BLUE-TANK-01'));
  assert.ok(html.includes('Unknown: BLUE-IFV-02'));
});

test('force feed module has no backend route dependency or mutation path', () => {
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
  console.log('passed ' + passed + ' CMO force evidence feed UI checks');
}
