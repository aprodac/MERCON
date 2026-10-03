import { describe, it, expect } from 'vitest';
import { currentDocuments, docState, folderMatches, rowMatchesStatus, relativeExpiry } from '../documentLibrary';
import type { MerconDocument, OwnerFoldersSummaryRow, DocStatus } from '@/services/documentService';

const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

const doc = (over: Partial<MerconDocument>): MerconDocument => ({
  id: 'd', entity_type: 'Vehicle', entity_id: 'v1', doc_type: 'Insurance', status: 'PendingReview',
  file_url: '/uploads/x.pdf', mime_type: 'application/pdf', issue_date: null, expiry_date: null,
  is_confidential: false, isActive: true, createdAt: '2026-01-01T00:00:00Z', documentTypeId: 't1', ...over,
});

describe('currentDocuments', () => {
  it('keeps only the newest copy per owner and type', () => {
    const old = doc({ id: 'old', createdAt: '2025-01-01T00:00:00Z' });
    const renewed = doc({ id: 'new', createdAt: '2026-01-01T00:00:00Z' });
    const other = doc({ id: 'other', documentTypeId: 't2' });
    expect(currentDocuments([old, renewed, other]).map((d) => d.id).sort()).toEqual(['new', 'other']);
  });

  it('keeps every document that has no configured type', () => {
    expect(currentDocuments([doc({ id: 'a', documentTypeId: null }), doc({ id: 'b', documentTypeId: null })])).toHaveLength(2);
  });
});

describe('docState', () => {
  it('classifies by days to expiry', () => {
    expect(docState(doc({ expiry_date: day(-3) }))).toBe('expired');
    expect(docState(doc({ expiry_date: day(0) }))).toBe('expired');
    expect(docState(doc({ expiry_date: day(12) }))).toBe('expiring');
    expect(docState(doc({ expiry_date: day(90) }))).toBe('valid');
    expect(docState(doc({ expiry_date: null }))).toBe('none');
  });

  it('treats types that never expire as no expiry', () => {
    expect(docState(doc({ expiry_date: day(-3), documentType: { requiresExpiryDate: false } as any }))).toBe('none');
  });
});

describe('filters', () => {
  const row: OwnerFoldersSummaryRow = {
    ownerType: 'Vehicle', ownerId: 'v1', ownerName: 'ABC 1234', ownerRef: null, relatedName: null,
    mandatoryTotal: 2, mandatoryComplete: 1,
    slots: [
      { documentTypeId: 't1', code: 'INS', name: 'Insurance', expiry_date: day(-2), documentId: 'd1', status: 'EXPIRED' },
      { documentTypeId: 't2', code: 'REG', name: 'Istimara', expiry_date: day(200), documentId: 'd2', status: 'VALID' },
    ],
  } as any;
  const statuses = new Map<string, DocStatus>([['d1', 'PendingReview'], ['d2', 'Verified']]);

  it('matches a folder when any slot matches', () => {
    expect(folderMatches(row, 'expired', null, statuses)).toBe(true);
    expect(folderMatches(row, 'action', null, statuses)).toBe(true);
    expect(folderMatches(row, 'missing', null, statuses)).toBe(false);
  });

  it('needs every slot to be fine for compliant', () => {
    expect(folderMatches(row, 'compliant', null, statuses)).toBe(false);
    expect(folderMatches(row, 'compliant', 't2', statuses)).toBe(true);
  });

  it('narrows to one document type', () => {
    expect(folderMatches(row, 'expired', 't2', statuses)).toBe(false);
    expect(folderMatches(row, 'unverified', 't1', statuses)).toBe(true);
    expect(folderMatches(row, 'unverified', 't2', statuses)).toBe(false);
  });

  it('never counts a missing slot as unverified', () => {
    expect(rowMatchesStatus('missing', null, 'unverified')).toBe(false);
    expect(rowMatchesStatus('missing', null, 'action')).toBe(true);
  });
});

describe('relativeExpiry', () => {
  it('reads naturally', () => {
    expect(relativeExpiry(0)).toBe('Expires today');
    expect(relativeExpiry(1)).toBe('1 day left');
    expect(relativeExpiry(-4)).toBe('Expired 4 days ago');
    expect(relativeExpiry(null)).toBe('');
  });
});
