import { describe, expect, it } from 'vitest';
import type { AgeingRow } from '@/services/financeService';
import {
  type AgeingBucket, addDays, allocateOldestFirst, buildScheduleWeeks, collectionHealth, daysSalesOutstanding, dueSoon, filterDocuments,
  filterPartyRows, flattenAgeingDocuments, projectCash,
} from './ageing';

// Receivables from the local demo data, as of 25 Sep 2026.
const inv = (id: string, due: string, days: number, balance: number, bucket: AgeingBucket) => ({
  id, ref_id: id, bill_date: '2026-07-01T08:00:00.000Z', due_date: `${due}T08:00:00.000Z`, days_overdue: days, balance, bucket,
});
const row = (party: string, invoices: ReturnType<typeof inv>[]): AgeingRow => {
  const by = (b: string) => invoices.filter((i) => i.bucket === b).reduce((s, i) => s + i.balance, 0);
  return {
    party_id: party, party_name: party, current: by('current'), days_1_30: by('1-30'), days_31_60: by('31-60'), days_61_90: by('61-90'),
    days_90_plus: by('90+'), total: invoices.reduce((s, i) => s + i.balance, 0), invoices,
  };
};
const rows: AgeingRow[] = [
  row('Red Sea Logistics', [inv('INV-0003', '2026-08-19', 37, 13800, '31-60'), inv('INV-0010', '2026-10-16', 0, 20700, 'current')]),
  row('Al Noor Trading Co.', [inv('INV-0006', '2026-09-13', 12, 18630, '1-30')]),
  row('Eastern Petro Services', [inv('INV-0009', '2026-10-10', 0, 13800, 'current')]),
  row('Najd Steel Works', [inv('INV-0004', '2026-08-27', 29, 6650, '1-30'), inv('INV-0011', '2026-10-19', 0, 5060, 'current')]),
  row('Gulf Cement Supply', [inv('INV-0008', '2026-10-02', 0, 3280, 'current')]),
];
const docs = flattenAgeingDocuments(rows, 'invoices');
const asOf = '2026-09-25';

describe('ageing logic', () => {
  it('flattens party rows into documents with their party', () => {
    expect(docs).toHaveLength(7);
    expect(docs.find((d) => d.id === 'INV-0006')?.party_name).toBe('Al Noor Trading Co.');
  });

  it('computes collection health', () => {
    const h = collectionHealth(rows, docs);
    expect(h.total).toBe(81920);
    expect(h.overdue).toBe(39080);
    expect(h.overduePct.toFixed(1)).toBe('47.7');
    expect(h.weightedDaysOverdue?.toFixed(1)).toBe('23.7');
    expect(h.topParty?.name).toBe('Red Sea Logistics');
    expect(h.topParty?.share.toFixed(1)).toBe('42.1');
  });

  it('computes DSO from receivables and 90-day revenue', () => {
    expect(daysSalesOutstanding(81920, 125005)).toBe(59);
    expect(daysSalesOutstanding(1000, 0)).toBeNull();
  });

  it('filters and sorts parties and documents', () => {
    expect(filterPartyRows(rows, { bucket: 'all', overdueOnly: true, search: '', sort: 'total_desc' }).map((r) => r.party_name)).toEqual([
      'Red Sea Logistics', 'Al Noor Trading Co.', 'Najd Steel Works',
    ]);
    expect(filterPartyRows(rows, { bucket: '31-60', overdueOnly: false, search: '', sort: 'total_desc' })).toHaveLength(1);
    expect(filterDocuments(docs, { bucket: 'all', overdueOnly: false, search: 'gulf' }).map((d) => d.id)).toEqual(['INV-0008']);
  });

  it('finds documents falling due this week', () => {
    expect(dueSoon(docs, asOf, 7).map((d) => d.id)).toEqual(['INV-0008']);
  });

  it('builds a weekly schedule that accounts for every document', () => {
    const weeks = buildScheduleWeeks(docs, asOf, 6);
    expect(weeks[0].key).toBe('overdue');
    expect(weeks[0].total).toBe(39080);
    expect(weeks[1].start).toBe(asOf);
    expect(weeks.reduce((s, w) => s + w.total, 0)).toBe(81920);
  });

  it('projects cash cumulatively with inflows and outflows', () => {
    const w = (totals: number[]) => totals.map((total, i) => ({ key: `${i}`, label: '', start: null, end: null, docs: [], total }));
    expect(projectCash(100, w([10, 20]), w([5, 50]))).toEqual([105, 75]);
    expect(projectCash(100, w([10, 20]), null)).toEqual([110, 130]);
  });

  it('allocates a receipt oldest-due first without exceeding balances', () => {
    const redSea = docs.filter((d) => d.party_id === 'Red Sea Logistics');
    const { allocations, unallocated } = allocateOldestFirst(redSea, 10000);
    expect(allocations.get('INV-0003')).toBe(10000);
    expect(allocations.get('INV-0010')).toBe(0);
    expect(unallocated).toBe(0);
    const over = allocateOldestFirst(redSea, 40000);
    expect(over.allocations.get('INV-0003')).toBe(13800);
    expect(over.allocations.get('INV-0010')).toBe(20700);
    expect(over.unallocated).toBe(5500);
  });

  it('adds days across month ends', () => {
    expect(addDays('2026-09-28', 7)).toBe('2026-10-05');
  });
});
