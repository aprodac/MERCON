/**
 * documentTrash — the Documents Center's "Recently deleted" bin.
 *
 * Deleting a document from the dashboard no longer removes the row: it is
 * soft-deleted (deletedAt set) and an audit entry DOCUMENT_TRASHED is written.
 * For TRASH_RETENTION_DAYS it can be restored; after that this job removes the
 * row for good, like the old hard delete did.
 *
 * Only documents that went to the bin through that flow are ever purged
 * (they must carry a DOCUMENT_TRASHED audit entry). Other soft-deleted rows —
 * trip media the retention job cleared, older documents an import replaced
 * before the bin existed — are left exactly as they are.
 *
 * Trip and stop media is never part of the bin: it lives on the trip.
 */
import { prisma } from '../db';
import { logger } from '../utils/logger';

export const TRASH_RETENTION_DAYS = 30;
export const TRASHED_ACTION = 'DOCUMENT_TRASHED';

/** Owner types whose documents belong to trips, not to the Documents library. */
export const TRIP_MEDIA_ENTITY_TYPES = ['Trip', 'TripStop'];

const DAY = 24 * 3600_000;

let timer: NodeJS.Timeout | null = null;

/** Hard-deletes the given trashed documents. Ignores ids that are not in the bin. */
export async function purgeTrashedDocuments(ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  const trashed = await prisma.document.findMany({
    where: { id: { in: ids }, deletedAt: { not: null }, file_purged_at: null, entity_type: { notIn: TRIP_MEDIA_ENTITY_TYPES } },
    select: { id: true },
  });
  const trashedIds = trashed.map((d) => d.id);
  if (!trashedIds.length) return 0;
  await prisma.$transaction([
    prisma.documentFile.deleteMany({ where: { documentId: { in: trashedIds } } }),
    prisma.document.deleteMany({ where: { id: { in: trashedIds } } }),
  ]);
  return trashedIds.length;
}

export async function runDocumentTrashPurge(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - TRASH_RETENTION_DAYS * DAY);
  const expired = await prisma.document.findMany({
    where: { deletedAt: { lt: cutoff }, file_purged_at: null, entity_type: { notIn: TRIP_MEDIA_ENTITY_TYPES } },
    select: { id: true },
    take: 1000,
  });
  if (!expired.length) return 0;

  const viaBin = await prisma.auditLog.findMany({
    where: { action: TRASHED_ACTION, entityType: 'Document', entityId: { in: expired.map((d) => d.id) } },
    select: { entityId: true },
  });
  const ids = Array.from(new Set(viaBin.map((a) => a.entityId).filter((id): id is string => !!id)));
  const purged = await purgeTrashedDocuments(ids);
  if (purged) logger.info({ purged }, '[DocumentTrash] Purged documents deleted more than 30 days ago');
  return purged;
}

/** Runs the purge shortly after boot, then once a day. */
export function initDocumentTrashPurge(): void {
  if (timer) return;
  const run = () => runDocumentTrashPurge().catch((err) => logger.error({ err }, '[DocumentTrash] Purge failed'));
  setTimeout(run, 5 * 60_000).unref?.();
  timer = setInterval(run, DAY);
  timer.unref?.();
}
