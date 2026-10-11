/**
 * Several driver photos as ONE picture (a grid), so WhatsApp shows them
 * together with the message under them: one picture + one caption.
 * WhatsApp has no album message (each photo is its own message, and the
 * phone's share menu puts the text on the first photo or sends it apart),
 * so combining is the only way to always get "the photos, then the text".
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { getUploadDir } from '../middlewares/upload';

/** Photos a combined picture holds (more get too small to read). */
export const MAX_COLLAGE_PHOTOS = 4;

const TILE_W = 720;
const TILE_H = 960; // 3:4 — trucks and paperwork are mostly shot upright
const GAP = 12;

/** Where each photo goes: 2 and 3 side by side, 4 as a 2 × 2 grid. */
export function collageLayout(n: number): { width: number; height: number; cells: { left: number; top: number }[] } {
  const cols = n === 4 ? 2 : n;
  const rows = Math.ceil(n / cols);
  const cells = Array.from({ length: n }, (_, i) => ({
    left: (i % cols) * (TILE_W + GAP),
    top: Math.floor(i / cols) * (TILE_H + GAP),
  }));
  return { width: cols * TILE_W + (cols - 1) * GAP, height: rows * TILE_H + (rows - 1) * GAP, cells };
}

/** "/uploads/abc.jpg" → the file on disk (same places the server serves /uploads from). */
export function localUploadPath(url: string): string | null {
  const rel = url.replace(/^https?:\/\/[^/]+/i, '').split('?')[0];
  if (!rel.startsWith('/uploads/')) return null;
  const name = decodeURIComponent(rel.slice('/uploads/'.length));
  if (!name || name.includes('..')) return null;
  for (const dir of [getUploadDir(), path.resolve(process.cwd(), 'uploads'), '/tmp/uploads']) {
    const p = path.join(dir, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

async function readPhoto(url: string): Promise<Buffer> {
  const local = localUploadPath(url);
  if (local) return fs.promises.readFile(local);
  if (/^https?:\/\//i.test(url)) {
    const res = await axios.get<ArrayBuffer>(url, { responseType: 'arraybuffer', timeout: 20_000 });
    return Buffer.from(res.data);
  }
  throw new Error('A photo file is missing on the server');
}

function loadSharp(): any {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('sharp');
  } catch {
    throw new Error('Combining photos is not available on this server');
  }
}

/** The photos as one JPEG grid. */
export async function buildCollage(urls: string[]): Promise<Buffer> {
  if (urls.length < 2 || urls.length > MAX_COLLAGE_PHOTOS) throw new Error(`Combine 2 to ${MAX_COLLAGE_PHOTOS} photos`);
  const sharp = loadSharp();
  const { width, height, cells } = collageLayout(urls.length);
  const tiles = await Promise.all(
    urls.map(async (u) => sharp(await readPhoto(u)).rotate().resize(TILE_W, TILE_H, { fit: 'cover', position: 'attention' }).jpeg({ quality: 85 }).toBuffer()),
  );
  return sharp({ create: { width, height, channels: 3, background: '#ffffff' } })
    .composite(tiles.map((input: Buffer, i: number) => ({ input, ...cells[i] })))
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
}

/** Builds the grid and saves it under /uploads with an unguessable name; returns its URL and path. */
export async function writeCollage(urls: string[]): Promise<{ url: string; filePath: string }> {
  const buf = await buildCollage(urls);
  const name = `share-${crypto.randomBytes(16).toString('hex')}.jpg`;
  const filePath = path.join(getUploadDir(), name);
  await fs.promises.writeFile(filePath, buf);
  return { url: `/uploads/${name}`, filePath };
}
