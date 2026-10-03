/**
 * Shared rules for the Documents Center lists: which copy of a document is the
 * current one, what state it is in, and how the status filters match.
 */
import type { DocStatus, MerconDocument, OwnerFoldersSummaryRow } from '@/services/documentService';
import { daysUntil } from '@/lib/documents';

export type LibraryTab = 'Vehicles' | 'Drivers' | 'Company' | 'Deleted';

/** expired → renew now · expiring → within 30 days · none → no expiry date. */
export type RowState = 'expired' | 'expiring' | 'valid' | 'none' | 'missing';

export type StatusFilter = 'all' | 'action' | 'expired' | 'expiring' | 'missing' | 'compliant' | 'unverified';

export const STATUS_FILTER_LABEL: Record<StatusFilter, string> = {
  all: 'All',
  action: 'Needs action',
  expired: 'Expired',
  expiring: 'Expiring',
  missing: 'Missing',
  compliant: 'Compliant',
  unverified: 'Not verified',
};

export const ROW_STATE_STYLE: Record<RowState, { label: string; text: string; dot: string }> = {
  expired:  { label: 'Expired',   text: 'text-rose-600 dark:text-rose-400',       dot: 'bg-rose-500' },
  expiring: { label: 'Expiring',  text: 'text-amber-600 dark:text-amber-400',     dot: 'bg-amber-500' },
  valid:    { label: 'Valid',     text: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500' },
  none:     { label: 'No expiry', text: 'text-slate-500 dark:text-slate-400',     dot: 'bg-slate-400' },
  missing:  { label: 'Missing',   text: 'text-slate-400 dark:text-slate-500',     dot: 'bg-slate-300 dark:bg-slate-600' },
};

export const VERIFICATION_STYLE: Record<DocStatus, { label: string; className: string }> = {
  Verified:      { label: 'Verified',     className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' },
  Rejected:      { label: 'Rejected',     className: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400' },
  PendingReview: { label: 'Not verified', className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' },
  Expired:       { label: 'Not verified', className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' },
};

export function isVerified(status: DocStatus | undefined | null): boolean {
  return status === 'Verified';
}

/** Expiry state of a document that exists. Types that never expire are 'none'. */
export function docState(doc: Pick<MerconDocument, 'expiry_date' | 'documentType'>): RowState {
  if (doc.documentType && doc.documentType.requiresExpiryDate === false) return 'none';
  const days = daysUntil(doc.expiry_date);
  if (days === null) return 'none';
  if (days <= 0) return 'expired';
  if (days <= 30) return 'expiring';
  return 'valid';
}

/** Owner-folder slot status → row state. */
export function slotState(status: string): RowState {
  if (status === 'EXPIRED') return 'expired';
  if (status === 'EXPIRING_SOON') return 'expiring';
  if (status === 'MISSING') return 'missing';
  return 'valid';
}

/**
 * Keeps only the newest document per owner and type — older ones were renewed
 * and live on as version history. Documents without a configured type are
 * all kept.
 */
export function currentDocuments<T extends MerconDocument>(docs: T[]): T[] {
  const sorted = [...docs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const seen = new Set<string>();
  const out: T[] = [];
  for (const d of sorted) {
    if (d.documentTypeId) {
      const key = `${d.entity_type}:${d.entity_id}:${d.documentTypeId}`;
      if (seen.has(key)) continue;
      seen.add(key);
    }
    out.push(d);
  }
  return out;
}

/** Does a single row (document or missing slot) match the status filter? */
export function rowMatchesStatus(state: RowState, verification: DocStatus | null, filter: StatusFilter): boolean {
  switch (filter) {
    case 'all': return true;
    case 'action': return state === 'expired' || state === 'expiring' || state === 'missing';
    case 'expired': return state === 'expired';
    case 'expiring': return state === 'expiring';
    case 'missing': return state === 'missing';
    case 'compliant': return state === 'valid' || state === 'none';
    case 'unverified': return state !== 'missing' && !isVerified(verification);
  }
}

/**
 * Does an owner folder match? A folder matches when any of its mandatory slots
 * (only the chosen type's slot, when a type is picked) matches — except
 * "Compliant", which needs every considered slot to be fine.
 */
export function folderMatches(
  row: OwnerFoldersSummaryRow,
  filter: StatusFilter,
  typeId: string | null,
  statusByDocId: Map<string, DocStatus>,
): boolean {
  const slots = typeId ? row.slots.filter((s) => s.documentTypeId === typeId) : row.slots;
  if (typeId && slots.length === 0) return false;
  if (filter === 'all') return true;
  const states = slots.map((s) => ({ state: slotState(s.status), verification: s.documentId ? statusByDocId.get(s.documentId) ?? null : null }));
  if (filter === 'compliant') return states.every((s) => s.state === 'valid' || s.state === 'none');
  return states.some((s) => rowMatchesStatus(s.state, s.verification, filter));
}

/** "12 days left" / "Expired 4 days ago" / "Expires today". */
export function relativeExpiry(days: number | null): string {
  if (days === null) return '';
  if (days === 0) return 'Expires today';
  if (days < 0) return `Expired ${Math.abs(days)} day${days === -1 ? '' : 's'} ago`;
  return `${days} day${days === 1 ? '' : 's'} left`;
}

export const DELETED_RETENTION_DAYS = 30;

/** Days before a deleted document is removed for good. */
export function daysUntilPurge(deletedAt: string): number {
  const left = DELETED_RETENTION_DAYS - Math.floor((Date.now() - new Date(deletedAt).getTime()) / 86_400_000);
  return Math.max(0, left);
}
