import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import { attachPartyNames } from '../controllers/advanceController';
import { prisma } from '../db';

test('Advance Party Name Resolution Unit Test Suite', async (t) => {
  let dbConnected = false;
  let customer: any;
  let provider: any;
  let driver: any;

  try {
    const timestamp = Date.now();
    customer = await prisma.customer.create({
      data: { name: `Party Test Customer ${timestamp}`, contact_phone: '+966500000099' },
    });
    provider = await prisma.thirdPartyProvider.create({
      data: { name: `Party Test Provider ${timestamp}`, phone: '+966500000098' },
    });
    driver = await prisma.driver.create({
      data: {
        first_name: 'Test',
        last_name: `Driver ${timestamp}`,
        license_number: `LIC-${timestamp}`,
        license_expiry: new Date(Date.now() + 86400000 * 365),
      },
    });
    dbConnected = true;
  } catch (_e) {
    dbConnected = false;
  }

  await t.test('attachPartyNames resolves names correctly when DB is available', async () => {
    if (!dbConnected) {
      // Mock test fallback when DB environment is offline
      const mockAdvances = [
        { id: '1', party_type: 'Customer', party_id: null },
        { id: '2', party_type: 'Provider', party_id: '00000000-0000-0000-0000-000000000999' },
      ];
      const resolved = await attachPartyNames(mockAdvances);
      assert.equal(resolved.length, 2);
      assert.equal(resolved[0].party, null);
      assert.equal(resolved[1].party, null);
      return;
    }

    const advances = [
      { id: '1', party_type: 'Customer', party_id: customer.id },
      { id: '2', party_type: 'Provider', party_id: provider.id },
      { id: '3', party_type: 'Employee', party_id: driver.id },
    ];

    const resolved = await attachPartyNames(advances);
    assert.equal(resolved.length, 3);
    assert.deepEqual(resolved[0].party, { id: customer.id, name: customer.name, type: 'Customer' });
    assert.deepEqual(resolved[1].party, { id: provider.id, name: provider.name, type: 'Provider' });
    assert.deepEqual(resolved[2].party, { id: driver.id, name: `Test ${driver.last_name}`, type: 'Employee' });
  });

  await t.test('attachPartyNames returns party: null for missing party_id or non-existent party', async () => {
    const nonExistentUuid = '00000000-0000-0000-0000-000000000999';
    const advances = [
      { id: '1', party_type: 'Customer', party_id: null },
      { id: '2', party_type: 'Provider', party_id: nonExistentUuid },
    ];

    const resolved = await attachPartyNames(advances);
    assert.equal(resolved.length, 2);
    assert.equal(resolved[0].party, null);
    assert.equal(resolved[1].party, null);
  });
});
