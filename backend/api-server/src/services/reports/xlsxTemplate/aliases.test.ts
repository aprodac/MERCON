import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestField } from './aliases';

// Regression coverage for a reported bug: a real customer template ("IMILE
// VEHICLE RENTAL DETAILS OF MAY 2026") had its title banner misread as 12
// duplicate headers (a separate merged-cell bug in inspect.ts), and because
// the banner text contains the word "vehicle", the old raw-substring fuzzy
// match in suggestField resolved every single one of them to vehicle_plate.
// These cases lock in the fix so it can't silently regress.

test('suggestField does not false-positive on short aliases appearing inside unrelated words', () => {
  // "to" (destination) must not match inside "ton" — old behavior matched.
  assert.equal(suggestField('10 TON'), null);
  assert.equal(suggestField('05Ton'), null);
  assert.equal(suggestField('03Ton'), null);

  // "no" (serial) must not match a header where it's one word among several
  // unrelated ones — old behavior matched via raw substring.
  assert.equal(suggestField('NO OF Vehicles'), null);
  assert.equal(suggestField('Not Active'), null);
});

test('suggestField prefers the more specific alias across fields, not the first field with any hit', () => {
  // "vehicle" alone (vehicle_plate) is a weaker match than the two-word
  // phrase "vehicle type" (vehicle_type) — old behavior always returned
  // vehicle_plate here since it's earlier in TRIP_FIELD_ALIASES declaration
  // order and "vehicle" is a substring of the header.
  assert.equal(suggestField('Type of vehicle'), 'vehicle_type');
});

test('suggestField rejects a match built entirely from a generic connector word', () => {
  // A real bug found after deploying the fixes above: "Vendor Name" shares
  // only the word "name" with driver_name's alias "driver name" (and with
  // carrier_name's/customer_name's own "___ name" aliases) — the header's
  // real content word "vendor" isn't in any alias list, so the "match" was
  // entirely the generic connector. Old behavior returned driver_name
  // (first field in declaration order with any hit), which put actual
  // driver names in a column meant for the vendor/carrier.
  // "vendor" has since become a carrier alias, so the header now resolves
  // to the right field instead of nothing. The gate itself still rejects a
  // header whose content word is unknown:
  assert.equal(suggestField('VENDOR NAME'), 'carrier_name');
  assert.equal(suggestField('OWNER NAME'), null);

  // Same mechanism via "number": these used to land on driver_phone (via
  // 'mobile number'/'contact number'). Their own spellings are aliases now,
  // so they resolve to the right field; an unknown "___ number" stays empty.
  assert.equal(suggestField('Vehcile Number'), 'vehicle_plate'); // template's own typo, "Vehicle" misspelled
  assert.equal(suggestField('UUID NUMBER'), 'ref_id');
  assert.equal(suggestField('ACCOUNT NUMBER'), null);

  // Regression guard: the generic-token gate must not swallow the
  // "Type of vehicle" fix above — "vehicle" is a non-generic overlapping
  // word, so the gate passes and vehicle_type still wins on ratio.
  assert.equal(suggestField('Type of vehicle'), 'vehicle_type');
});

test('suggestField still resolves clean, unambiguous headers correctly', () => {
  assert.equal(suggestField('Plate'), 'vehicle_plate');
  assert.equal(suggestField('DATE'), 'date');
  assert.equal(suggestField('DESTINATION'), 'destination');
  assert.equal(suggestField('CHARGES'), 'billing_amount');
  assert.equal(suggestField('Vehicle No'), 'vehicle_plate'); // exact alias match
});

test('iMile bilingual headers map to the right fields', () => {
  // Headers from an iMile/JDL trip sheet: Chinese label + English, the
  // Chinese is stripped by normaliseHeader. "Shipment No" used to fall to
  // the serial alias "no", "start" to the date alias "start date", and the
  // "Vechicle" typo matched nothing.
  assert.equal(suggestField('单号 Shipment No'), 'awb_number');
  assert.equal(suggestField('出发地 start'), 'origin');
  assert.equal(suggestField('目的地 destination'), 'destination');
  assert.equal(suggestField('车型Vechicle Type'), 'vehicle_type');
});

test('a banner sentence containing a generic word does not match at all (word-count too skewed)', () => {
  // The actual banner text that triggered the bug — even though it contains
  // the standalone word "vehicle", the overlap ratio against any single-word
  // or two-word alias is far below the acceptance threshold once the header
  // has 7 unrelated words.
  assert.equal(suggestField('IMILE VEHICLE RENTAL DETAILS OF MAY 2026'), null);
});
