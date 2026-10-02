import fs from 'fs';
import path from 'path';
import { getUploadDir } from '../middlewares/upload';
import { compressUploadedImage } from './imageCompressor';

const DATA_URL = /^data:image\/([a-z0-9.+-]+);base64,/i;

const EXTENSIONS: Record<string, string> = {
  jpeg: '.jpg',
  jpg: '.jpg',
  png: '.png',
  webp: '.webp',
  gif: '.gif',
  heic: '.heic',
  heif: '.heif',
};

export function isInlineImage(value: unknown): value is string {
  return typeof value === 'string' && DATA_URL.test(value);
}

/**
 * Photos and logos must be stored as `/uploads/...` links, not as base64
 * `data:` URLs: the image columns are sent in every list that includes a
 * driver, vehicle or customer, so a 2 MB inline photo made the operator
 * app's live map and trip lists 5–10 MB each.
 *
 * Writes an inline image to the uploads folder (compressed like a normal
 * upload) and returns its link. Anything else is returned unchanged.
 */
export async function storeInlineImage<T>(value: T): Promise<T | string> {
  if (!isInlineImage(value)) return value;
  const match = DATA_URL.exec(value)!;
  const ext = EXTENSIONS[match[1].toLowerCase()] ?? '.jpg';
  const bytes = Buffer.from(value.slice(match[0].length), 'base64');
  const filename = `files-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
  const filePath = path.join(getUploadDir(), filename);
  await fs.promises.writeFile(filePath, bytes);
  await compressUploadedImage(filePath);
  return `/uploads/${filename}`;
}
