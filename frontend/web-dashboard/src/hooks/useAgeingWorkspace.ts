import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { BankAccount } from '@mercon/shared-types';

import { financeService, type AgeingBucketCounts, type AgeingRow } from '@/services/financeService';
import {
  addDays,
  filterDocuments,
  filterPartyRows,
  flattenAgeingDocuments,
  type AgeingDocument,
  type AgeingFilters,
  type PartySort,
} from '@/lib/finance/ageing';

export type AgeingSide = 'payables' | 'receivables';

const SIDE = {
  payables: { key: 'ap-ageing', docs: 'bills' as const, fetch: financeService.getAPAgeing },
  receivables: { key: 'ar-ageing', docs: 'invoices' as const, fetch: financeService.getARAgeing },
};

const EMPTY_TOTAL: AgeingRow = {
  party_id: 'TOTAL', party_name: 'Total', current: 0, days_1_30: 0, days_31_60: 0, days_61_90: 0, days_90_plus: 0, total: 0,
};
const EMPTY_COUNTS: AgeingBucketCounts = { current: 0, days_1_30: 0, days_31_60: 0, days_61_90: 0, days_90_plus: 0, total: 0 };

/** The ageing report with its open documents; AP and AR workspaces share this cache entry. */
const reportQuery = (side: AgeingSide, asOf: string, basis: 'due' | 'bill') => ({
  queryKey: ['finance-reports', SIDE[side].key, asOf, basis, 'documents'],
  queryFn: () => SIDE[side].fetch({ as_of: asOf, basis, [side === 'payables' ? 'include_bills' : 'include_invoices']: true }),
});

/** Open documents for one side of the ledger at a date — used for the opposite side of the cash forecast. */
export function useAgeingDocuments(side: AgeingSide, asOf: string, basis: 'due' | 'bill', enabled = true) {
  const query = useQuery({ ...reportQuery(side, asOf, basis), enabled });
  const docs = useMemo(() => flattenAgeingDocuments(query.data?.data?.rows ?? [], SIDE[side].docs), [query.data, side]);
  return { docs, isLoading: query.isLoading };
}

/**
 * Everything an ageing workspace needs: the report at `asOf` (with documents), the report 30 days
 * earlier for change figures, bank + cash on hand, and the filtered party / document lists.
 */
export function useAgeingWorkspace(side: AgeingSide, opts: { asOf: string; basis: 'due' | 'bill'; filters: AgeingFilters; sort: PartySort }) {
  const cfg = SIDE[side];
  const { asOf, basis, filters, sort } = opts;
  const priorAsOf = addDays(asOf, -30);

  const report = useQuery(reportQuery(side, asOf, basis));
  const prior = useQuery({
    queryKey: ['finance-reports', cfg.key, priorAsOf, basis],
    queryFn: () => cfg.fetch({ as_of: priorAsOf, basis }),
  });
  const banks = useQuery({ queryKey: ['bank-accounts'], queryFn: () => financeService.getBankAccounts() });

  const data = report.data?.data;
  const rows = useMemo(() => data?.rows ?? [], [data]);
  const docs = useMemo(() => flattenAgeingDocuments(rows, cfg.docs), [rows, cfg.docs]);

  const docsByParty = useMemo(() => {
    const map = new Map<string, AgeingDocument[]>();
    for (const d of docs) map.set(d.party_id, [...(map.get(d.party_id) ?? []), d]);
    return map;
  }, [docs]);

  const priorRows = useMemo(() => prior.data?.data?.rows ?? [], [prior.data]);
  const priorTotals = useMemo(() => new Map(priorRows.map((r) => [r.party_id, r.total])), [priorRows]);

  const bankAccounts: BankAccount[] = useMemo(() => (banks.data?.data ?? []).filter((b) => b.isActive !== false), [banks.data]);
  const cashOnHand = bankAccounts.reduce((s, b) => s + Number(b.book_balance ?? 0), 0);

  return {
    rows,
    docs,
    docsByParty,
    grandTotal: data?.grand_total ?? EMPTY_TOTAL,
    counts: data?.bucket_counts ?? EMPTY_COUNTS,
    priorTotal: prior.data?.data?.grand_total?.total ?? null,
    priorAsOf,
    priorRows,
    priorTotals,
    bankAccounts,
    cashOnHand,
    filteredRows: useMemo(() => filterPartyRows(rows, { ...filters, sort }), [rows, filters, sort]),
    filteredDocs: useMemo(() => filterDocuments(docs, filters), [docs, filters]),
    isLoading: report.isLoading,
    isError: report.isError,
    refetch: report.refetch,
  };
}
