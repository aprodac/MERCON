import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSaudiPlate, isSaudiPlateOrLater } from '@mercon/shared-types';

const plate = (v: string) => {
  const r = normalizeSaudiPlate(v);
  return r.ok ? r.plate : null;
};

test('real plates in any common spelling become "ABC-1234"', () => {
  assert.equal(plate('DRA-6484'), 'DRA-6484');
  assert.equal(plate('dra 6484'), 'DRA-6484');
  assert.equal(plate('6484 DRA'), 'DRA-6484');
  assert.equal(plate('KSA6102'), 'KSA-6102');
  assert.equal(plate('AXA-7'), 'AXA-7');
});

test('Arabic letters and digits are read as their Latin twins', () => {
  assert.equal(plate('د ر ا ٦٤٨٤'), 'DRA-6484');
});

test('letters not used on Saudi plates, wrong shapes and all-zero numbers are refused with a reason', () => {
  const c = normalizeSaudiPlate('ABC 1234');
  assert.equal(c.ok, false);
  assert.match((c as { reason: string }).reason, /"C"/);
  assert.equal(plate('ZZQA 0099'), null);
  assert.equal(plate('12345 DRA'), null);
  assert.equal(plate('DRA 0000'), null);
  assert.equal(plate(''), null);
});

test('the optional 3PL plate also accepts empty and "Assign Later"', () => {
  assert.equal(isSaudiPlateOrLater(''), true);
  assert.equal(isSaudiPlateOrLater('Assign Later'), true);
  assert.equal(isSaudiPlateOrLater('random text'), false);
});
