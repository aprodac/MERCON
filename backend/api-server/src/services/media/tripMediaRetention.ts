/**
 * tripMediaRetention — deletes trip photos and videos from disk once the trip
 * has been over for MEDIA_RETENTION_DAYS (default 60), so uploads don't fill
 * the server.
 *
 * Covers every image/video Document on a trip or one of its stops: cargo and
 * POD photos, delay videos, emergency photos. PDFs and other files are left
 * alone. A trip counts as over when it is Completed / Invoiced / Cancelled or
 * deleted; the clock starts at actual_end (else planned_end, else last update).
 *
 * The file goes; the Document row stays, soft-deleted with file_purged_at set,
 * so its GPS / stop / timestamps remain in the history while every screen
 * (all filter deletedAt: null) simply stops listing it.
 *
 * Runs once a day inside the API process. Idempotent, works in batches, and a
 * file another live Document still points at is never removed.
 *
 *   MEDIA_RETENTION_DAYS     days after the trip ends (default 60; 0 disables)
 *   MEDIA_RETENTION_DRY_RUN  "true" → only log what would be deleted
 */
import fs from 'fs';
import path from 'path';
import { Prisma } from '@prisma/client';
import { prisma } from '../../db';
import { logger } from '../../utils/logger';
import { getUploadDir } from '../../middlewares/upload';

const DAY = 24 * 3600_000;
const BATCH = 500;
const MAX_BATCHES_PER_RUN = 40;

let timer: NodeJS.Timeout | null = null;
let running = false;

function retentionDays(): number {
  const raw = process.env.MEDIA_RETENTION_DAYS;
  const n = raw === undefined || raw === '' ? 60 : Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 60;
}

/** Every folder `/uploads` is served from (see index.ts). */
function uploadDirs(): string[] {
  return Array.from(new Set([getUploadDir(), path.resolve(process.cwd(), 'uploads'), path.resolve('/tmp/uploads')]));
}

/** Deletes `/uploads/<name>` wherever it lives. Returns bytes freed. */
function deleteUpload(fileUrl: string): number {
  if (!fileUrl.startsWith('/uploads/')) return 0;
  const name = path.basename(fileUrl);
  if (!name || name === '.' || name === '..') return 0;
  let freed = 0;
  for (const dir of uploadDirs()) {
    const p = path.join(dir, name);
    try {
      const size = fs.statSync(p).size;
      fs.unlinkSync(p);
      freed += size;
    } catch (err: any) {
      if (err?.code !== 'ENOENT') logger.warn({ err, file: p }, '[MediaRetention] Could not delete file');
    }
  }
  return freed;
}

interface Candidate {
  id: string;
  file_url: string;
}

async function findCandidates(cutoff: Date): Promise<Candidate[]> {
  return prisma.$queryRaw<Candidate[]>(Prisma.sql`
    SELECT d.id, d.file_url
    FROM "Document" d
    LEFT JOIN "TripStop" s ON d.entity_type = 'TripStop' AND s.id = d.entity_id
    JOIN "Trip" t ON t.id = CASE WHEN d.entity_type = 'Trip' THEN d.entity_id ELSE s."tripId" END
    WHERE d.entity_type IN ('Trip', 'TripStop')
      AND d.file_purged_at IS NULL
      AND (d.mime_type LIKE 'image/%' OR d.mime_type LIKE 'video/%'
           OR d.file_url ~* '\\.(jpe?g|png|webp|heic|heif|gif|bmp|tiff|mp4|mov|webm|3gp|mkv|avi)$')
      AND (t."deletedAt" IS NOT NULL OR t.status IN ('Completed', 'Invoiced', 'Cancelled'))
      AND COALESCE(t.actual_end, t.planned_end, t."updatedAt") < ${cutoff}
    ORDER BY d."createdAt"
    LIMIT ${BATCH}
  `);
}

/** True if a Document/DocumentFile outside `purging` still uses this file. */
async function stillReferenced(fileUrl: string, purging: string[]): Promise<boolean> {
  const [doc, file] = await Promise.all([
    prisma.document.count({ where: { file_url: fileUrl, file_purged_at: null, id: { notIn: purging } } }),
    prisma.documentFile.count({
      where: { file_url: fileUrl, documentId: { notIn: purging }, document: { file_purged_at: null } },
    }),
  ]);
  return doc + file > 0;
}

export async function runTripMediaRetention(now = new Date()): Promise<{ documents: number; files: number; mb: number }> {
  const days = retentionDays();
  const totals = { documents: 0, files: 0, mb: 0 };
  if (days === 0 || running) return totals;
  running = true;
  const dryRun = process.env.MEDIA_RETENTION_DRY_RUN === 'true';
  const cutoff = new Date(now.getTime() - days * DAY);
  let bytes = 0;

  try {
    for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch++) {
      const docs = await findCandidates(cutoff);
      if (!docs.length) break;
      const ids = docs.map((d) => d.id);
      const extraFiles = await prisma.documentFile.findMany({
        where: { documentId: { in: ids } },
        select: { file_url: true },
      });
      const urls = Array.from(new Set([...docs.map((d) => d.file_url), ...extraFiles.map((f) => f.file_url)]));

      if (dryRun) {
        totals.documents += docs.length;
        totals.files += urls.length;
        logger.info({ cutoff, documents: docs.length, sample: urls.slice(0, 5) }, '[MediaRetention] DRY RUN — would delete');
        break; // the same rows would come back on the next query
      }

      for (const url of urls) {
        if (await stillReferenced(url, ids)) continue;
        bytes += deleteUpload(url);
        totals.files++;
      }

      await prisma.$transaction([
        prisma.document.updateMany({ where: { id: { in: ids }, deletedAt: null }, data: { deletedAt: now } }),
        prisma.document.updateMany({ where: { id: { in: ids } }, data: { file_purged_at: now } }),
        prisma.documentFile.updateMany({ where: { documentId: { in: ids }, deletedAt: null }, data: { deletedAt: now } }),
      ]);
      totals.documents += docs.length;
      if (docs.length < BATCH) break;
    }
  } finally {
    running = false;
  }

  totals.mb = +(bytes / 1e6).toFixed(1);
  if (totals.documents > 0) {
    logger.info({ ...totals, retentionDays: days, dryRun }, '[MediaRetention] Old trip media removed');
  }
  return totals;
}

export function initTripMediaRetention(): void {
  if (timer || retentionDays() === 0) return;
  logger.info(`[MediaRetention] Trip photos/videos are deleted ${retentionDays()} days after the trip ends (daily check)`);
  const run = () => void runTripMediaRetention().catch((err) => logger.error({ err }, '[MediaRetention] Run failed'));
  // First pass a few minutes after boot so startup isn't slowed down.
  setTimeout(run, 5 * 60_000);
  timer = setInterval(run, DAY);
}
