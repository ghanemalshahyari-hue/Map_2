const assert = require('assert');
const fs = require('fs');
const path = require('path');

const modPath = path.join(__dirname, 'UI_MOdified', 'client', 'shell', 'evidence-map-overlays.js');
const source = fs.readFileSync(modPath, 'utf8');
const EMO = require(modPath);

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

test('selected unit with target creates read-only overlay state', () => {
  const ws = {
    derived: {
      contacts_by_unit: {
        BLUE1: {
          by_unit: 'BLUE1',
          target_uid: 'RED1',
          confidence: 'firm',
          last_seen: 5,
          range_nm: 42,
          max_range_nm: 120
        }
      },
      engagement_outcomes: [{
        shooter: 'BLUE1',
        target: 'RED1',
        weapon: 'sam-1',
        status: 'engaged',
        range_nm: 20,
        max_range_nm: 45
      }],
      units_by_uid: {
        RED1: { uid: 'RED1', lat: 30.2, lng: 35.2 }
      }
    }
  };
  const state = EMO.buildOverlayState(ws, { uid: 'BLUE1', lat: 30, lng: 35 });
  assert.strictEqual(state.status, 'Ready');
  assert.strictEqual(state.target_uid, 'RED1');
  assert.deepStrictEqual(state.shooter_latlng, { lat: 30, lng: 35 });
  assert.deepStrictEqual(state.target_latlng, { lat: 30.2, lng: 35.2 });
  assert.strictEqual(Math.round(state.weapon_range_meters), 45 * 1852);
  assert.strictEqual(Math.round(state.sensor_range_meters), 120 * 1852);
  assert.ok(state.target_line);
});

test('out_of_range produces blocked overlay reason and Arabic label', () => {
  const state = EMO.buildOverlayState({
    derived: {
      contacts: [{ by_unit: 'BLUE2', target_uid: 'RED2', max_range_nm: 80 }],
      engagement_outcomes: [{
        shooter: 'BLUE2',
        target: 'RED2',
        weapon: 'gun',
        status: 'blocked',
        reason: 'out_of_range',
        range_nm: 55,
        max_range_nm: 30
      }],
      units_by_uid: {
        RED2: { uid: 'RED2', coord: [35.4, 30.4] }
      }
    }
  }, { uid: 'BLUE2', position: [35.0, 30.0] });
  assert.strictEqual(state.status, 'Blocked');
  assert.strictEqual(state.reason_code, 'out_of_range');
  assert.ok(state.reason_label_ar.includes('الهدف خارج مدى السلاح'));
  assert.ok(state.tooltip_html.includes('out_of_range'));
});

test('missing range/contact data does not crash', () => {
  const state = EMO.buildOverlayState({ derived: {} }, { uid: 'BLUE3', lat: 31, lng: 36 });
  assert.strictEqual(state.status, 'Unknown');
  assert.strictEqual(state.weapon_range_meters, null);
  assert.strictEqual(state.sensor_range_meters, null);
  assert.strictEqual(state.target_line, null);
  assert.ok(state.tooltip_html.includes('no_contact_evidence') || state.tooltip_html.includes('no_engagement_evidence'));
});

test('coordinate resolver accepts common unit coordinate shapes', () => {
  assert.deepStrictEqual(EMO.toLatLng({ lat: '30.1', lng: '35.1' }), { lat: 30.1, lng: 35.1 });
  assert.deepStrictEqual(EMO.toLatLng({ coord: [35.2, 30.2] }), { lat: 30.2, lng: 35.2 });
  assert.deepStrictEqual(EMO.toLatLng({ position: [35.3, 30.3] }), { lat: 30.3, lng: 35.3 });
});

test('renderOverlay is safe without Leaflet or a map', () => {
  const state = EMO.buildOverlayState({ derived: {} }, { uid: 'BLUE4' });
  assert.doesNotThrow(() => EMO.renderOverlay(state, null));
});

test('display module has no backend route dependency', () => {
  assert.ok(!/fetch\s*\(/.test(source));
  assert.ok(!/XMLHttpRequest/.test(source));
  assert.ok(!/\/api\//.test(source));
});

test('display module does not introduce action, engagement, or doctrine mutation', () => {
  assert.ok(!/computeContacts/.test(source));
  assert.ok(!/computeEngagements/.test(source));
  assert.ok(!/approved-actions/.test(source));
  assert.ok(!/applyAction|commitAction|executeAction|autoFire|auto-fire/.test(source));
  assert.ok(!/doctrine.*=|weapons_hold\\s*=/.test(source));
});

if (process.exitCode) {
  console.error('failed');
} else {
  console.log('passed ' + passed + ' evidence map overlay UI checks');
}
