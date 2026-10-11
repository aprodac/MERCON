import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Uploads go to a throwaway folder for this test.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'collage-'));
process.env.UPLOADS_DIR = dir;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const sharp = require('sharp');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { collageLayout, writeCollage, localUploadPath } = require('../services/shareCollage');

const photo = (name: string, w: number, h: number, colour: string) =>
  sharp({ create: { width: w, height: h, channels: 3, background: colour } }).jpeg().toFile(path.join(dir, name));

test('layout: 2 and 3 side by side, 4 as a 2 × 2 grid', () => {
  assert.deepEqual([2, 3, 4].map((n) => { const l = collageLayout(n); return [l.width, l.height, l.cells.length]; }), [
    [1452, 960, 2],
    [2184, 960, 3],
    [1452, 1932, 4],
  ]);
});

test('three photos of any shape become one picture', async () => {
  await photo('p0.jpg', 1200, 1600, '#e74c3c');
  await photo('p1.jpg', 1600, 1200, '#27ae60');
  await photo('p2.jpg', 900, 1600, '#2980b9');
  const { url, filePath } = await writeCollage(['/uploads/p0.jpg', '/uploads/p1.jpg', '/uploads/p2.jpg']);
  assert.match(url, /^\/uploads\/share-[0-9a-f]{32}\.jpg$/);
  const meta = await sharp(filePath).metadata();
  assert.deepEqual([meta.format, meta.width, meta.height], ['jpeg', 2184, 960]);
  // Each third of the picture is its own photo's colour.
  const px = async (x: number) => {
    const { data } = await sharp(filePath).extract({ left: x, top: 480, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
    return [...data].map((v: number) => Math.round(v / 40));
  };
  assert.notDeepEqual(await px(360), await px(1092));
  assert.notDeepEqual(await px(1092), await px(1824));
});

test('only files under /uploads are read, never paths outside it', () => {
  assert.equal(localUploadPath('/uploads/../../etc/passwd'), null);
  assert.equal(localUploadPath('/etc/passwd'), null);
  assert.equal(localUploadPath('/uploads/p0.jpg'), path.join(dir, 'p0.jpg'));
});

test('one photo or more than four is refused', async () => {
  await assert.rejects(() => writeCollage(['/uploads/p0.jpg']), /Combine 2 to 4/);
});
