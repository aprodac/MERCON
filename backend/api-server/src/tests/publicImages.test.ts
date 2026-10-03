import test from 'node:test';
import assert from 'node:assert/strict';
import type { PrismaClient } from '@prisma/client';
import { publicImage } from '../services/tracking/publicImages';

// A database that fails the test if anything is written — links and empty values need no work.
const untouchable = new Proxy({}, { get: () => { throw new Error('database touched'); } }) as unknown as PrismaClient;

test('public tracking images', async (t) => {
  await t.test('a file link is passed through untouched', async () => {
    assert.equal(await publicImage(untouchable, { table: 'customer', field: 'logo_url' }, 'c1', '/uploads/imile.png'), '/uploads/imile.png');
    assert.equal(await publicImage(untouchable, { table: 'driver', field: 'avatar_url' }, 'd1', 'https://cdn.example.com/a.jpg'), 'https://cdn.example.com/a.jpg');
  });

  await t.test('no image is no image', async () => {
    assert.equal(await publicImage(untouchable, { table: 'vehicle', field: 'image_url' }, 'v1', null), null);
    assert.equal(await publicImage(untouchable, { table: 'vehicle', field: 'image_url' }, 'v1', ''), null);
  });
});
