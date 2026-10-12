/**
 * Builds one PDF out of a driver's or a truck's chosen documents — PDFs and
 * photos alike — with an optional details page first, then sends it through
 * the phone's share sheet (WhatsApp, email…).
 *
 * Runs on the phone with pdf-lib (pure JS): PDF pages are copied in as they
 * are; photos are re-saved as JPEG (which also turns HEIC/WebP into something
 * a PDF can hold), shrunk to a sensible size and fitted onto an A4 page with
 * their name above.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { resolveMediaUrl } from '@mercon/mobile-shared/lib/media';

export interface PackFile {
  /** Unique per file — names the cached download. */
  id: string;
  url: string;
  /** Printed above the file's pages, e.g. "Iqama" or "Insurance (page 2)". */
  label: string;
}

export interface PackCover {
  title: string;
  subtitle?: string;
  rows: [string, string][];
}

export interface PackResult { uri: string; pages: number; skipped: string[] }

const A4 = { w: 595.28, h: 841.89 };
const MARGIN = 28;
const MAX_IMAGE_PX = 1800;

const isPdf = (url: string) => /\.pdf(?:\?|$)/i.test(url);

/**
 * The built-in PDF fonts only cover Latin text. Anything else (Arabic names,
 * emoji) is dropped rather than failing the whole pack.
 */
function printable(text: string): string {
  const out = text
    .replace(/→/g, '->').replace(/…/g, '...').replace(/[–—]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7E -ÿ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return out || '—';
}

async function download(f: PackFile): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const FileSystem = require('expo-file-system/legacy');
  const url = resolveMediaUrl(f.url);
  if (!url) throw new Error('No file');
  const ext = isPdf(url) ? 'pdf' : (/\.(jpe?g|png|webp|heic|heif)(?:\?|$)/i.exec(url)?.[1]?.toLowerCase() ?? 'jpg');
  const target = `${FileSystem.cacheDirectory}pack-${f.id.replace(/[^\w-]/g, '')}.${ext}`;
  const info = await FileSystem.getInfoAsync(target).catch(() => null);
  if (info?.exists) return target;
  const res = await FileSystem.downloadAsync(url, target);
  if (res?.status && res.status >= 400) throw new Error(`HTTP ${res.status}`);
  return res.uri;
}

/** The photo as JPEG base64, no wider/taller than MAX_IMAGE_PX. */
async function photoAsJpeg(uri: string): Promise<{ base64: string; width: number; height: number }> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const IM = require('expo-image-manipulator');
  const first = await IM.manipulateAsync(uri, [], { compress: 0.8, format: IM.SaveFormat.JPEG, base64: true });
  const longest = Math.max(first.width, first.height);
  if (longest <= MAX_IMAGE_PX) return { base64: first.base64, width: first.width, height: first.height };
  const resize = first.width >= first.height ? { width: MAX_IMAGE_PX } : { height: MAX_IMAGE_PX };
  const small = await IM.manipulateAsync(uri, [{ resize }], { compress: 0.8, format: IM.SaveFormat.JPEG, base64: true });
  return { base64: small.base64, width: small.width, height: small.height };
}

function header(page: PDFPage, font: PDFFont, text: string) {
  page.drawText(printable(text), { x: MARGIN, y: A4.h - MARGIN - 10, size: 11, font, color: rgb(0.24, 0.24, 0.26) });
}

function drawCover(pdf: PDFDocument, cover: PackCover, contents: string[], bold: PDFFont, regular: PDFFont) {
  const page = pdf.addPage([A4.w, A4.h]);
  let y = A4.h - 64;
  page.drawRectangle({ x: 0, y: A4.h - 10, width: A4.w, height: 10, color: rgb(0.98, 0.39, 0.31) });
  page.drawText(printable(cover.title), { x: 48, y, size: 22, font: bold, color: rgb(0.15, 0.15, 0.17) });
  y -= 24;
  if (cover.subtitle) {
    page.drawText(printable(cover.subtitle), { x: 48, y, size: 12, font: regular, color: rgb(0.42, 0.42, 0.46) });
    y -= 20;
  }
  y -= 16;
  for (const [label, value] of cover.rows) {
    page.drawText(printable(label), { x: 48, y, size: 11, font: regular, color: rgb(0.42, 0.42, 0.46) });
    page.drawText(printable(value), { x: 200, y, size: 12, font: bold, color: rgb(0.15, 0.15, 0.17), maxWidth: A4.w - 248 });
    y -= 22;
    if (y < 140) break;
  }
  if (contents.length) {
    y -= 14;
    page.drawText('Included in this file', { x: 48, y, size: 12, font: bold, color: rgb(0.15, 0.15, 0.17) });
    y -= 20;
    for (const c of contents) {
      if (y < 60) break;
      page.drawText(`•  ${printable(c)}`, { x: 56, y, size: 11, font: regular, color: rgb(0.24, 0.24, 0.26) });
      y -= 17;
    }
  }
  const stamp = new Date().toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
  page.drawText(`Prepared ${stamp} · MERCON`, { x: 48, y: 36, size: 9, font: regular, color: rgb(0.6, 0.6, 0.64) });
}

/**
 * One PDF: the details page (when given), then every file in order.
 * Files that can't be read (a broken or password-protected PDF, a missing
 * upload) are skipped and named in `skipped`, so the rest still go out.
 */
export async function buildDocumentPack(
  files: PackFile[],
  cover: PackCover | null,
  fileName: string,
  onProgress?: (done: number, total: number) => void,
): Promise<PackResult> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const FileSystem = require('expo-file-system/legacy');
  const pdf = await PDFDocument.create();
  pdf.setTitle(printable(cover?.title ?? fileName));
  pdf.setProducer('MERCON');
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);

  if (cover) drawCover(pdf, cover, files.map((f) => f.label), bold, regular);

  const skipped: string[] = [];
  for (let i = 0; i < files.length; i += 1) {
    const f = files[i];
    onProgress?.(i, files.length);
    try {
      const uri = await download(f);
      if (isPdf(uri)) {
        const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
        const src = await PDFDocument.load(b64, { ignoreEncryption: true });
        const pages = await pdf.copyPages(src, src.getPageIndices());
        pages.forEach((p) => pdf.addPage(p));
      } else {
        const photo = await photoAsJpeg(uri);
        const img = await pdf.embedJpg(photo.base64);
        const page = pdf.addPage([A4.w, A4.h]);
        header(page, bold, f.label);
        const boxW = A4.w - MARGIN * 2;
        const boxH = A4.h - MARGIN * 2 - 26;
        const scale = Math.min(boxW / photo.width, boxH / photo.height, 1.5);
        const w = photo.width * scale;
        const h = photo.height * scale;
        page.drawImage(img, { x: (A4.w - w) / 2, y: MARGIN + (boxH - h) / 2, width: w, height: h });
      }
    } catch {
      skipped.push(f.label);
    }
  }
  onProgress?.(files.length, files.length);

  if (pdf.getPageCount() === 0 || (cover && pdf.getPageCount() === 1 && files.length > 0 && skipped.length === files.length)) {
    throw new Error('None of the chosen files could be read.');
  }

  const safe = fileName.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'documents';
  const uri = `${FileSystem.cacheDirectory}${safe}.pdf`;
  await FileSystem.writeAsStringAsync(uri, await pdf.saveAsBase64(), { encoding: FileSystem.EncodingType.Base64 });
  return { uri, pages: pdf.getPageCount(), skipped };
}

/** Opens the share sheet with the finished PDF. */
export async function sharePdf(uri: string, title: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Sharing = require('expo-sharing');
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this phone.');
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: title });
}
