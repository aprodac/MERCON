/** Everything the customer details screen shows, each part loading (and failing) on its own. */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { operatorService } from '../../../lib/operator';
import { customerDetailApi, type StatementInvoice } from './customerDetailApi';

export const customerDetailKey = (id: string) => ['customers', 'detail', id] as const;

// InvoiceStatus in the schema: Draft, Issued, PartiallyPaid, Paid, Void — overdue is worked out from the due date.
const OPEN_INVOICE = ['Issued', 'PartiallyPaid'];

/** Whole days an invoice is past due (negative = days left). Null when it has no due date. */
export function daysOverdue(inv: StatementInvoice, now: number): number | null {
  if (!inv.due_date) return null;
  const t = new Date(inv.due_date).getTime();
  return Number.isNaN(t) ? null : Math.floor((now - t) / 86_400_000);
}

export function useCustomerDetail(id: string, now: number) {
  const enabled = Boolean(id);
  const customerQ = useQuery({ queryKey: customerDetailKey(id), queryFn: () => customerDetailApi.customer(id), enabled });
  const statementQ = useQuery({ queryKey: [...customerDetailKey(id), 'statement'], queryFn: () => customerDetailApi.statement(id), enabled });
  const openQ = useQuery({ queryKey: [...customerDetailKey(id), 'open-trips'], queryFn: () => customerDetailApi.openTrips(id), enabled });
  const tzQ = useQuery({ queryKey: ['settings', 'tz'], queryFn: customerDetailApi.timezone, staleTime: Infinity });
  const monthQ = useQuery({
    queryKey: [...customerDetailKey(id), 'month', tzQ.data],
    queryFn: () => customerDetailApi.monthTrips(id, tzQ.data ?? 'Asia/Riyadh'),
    enabled: enabled && Boolean(tzQ.data),
  });
  const quotesQ = useQuery({ queryKey: [...customerDetailKey(id), 'quotations'], queryFn: () => operatorService.customerQuotations(id), enabled });
  const placesQ = useQuery({ queryKey: [...customerDetailKey(id), 'places'], queryFn: () => operatorService.locations(id), enabled });

  const money = useMemo(() => {
    const s = statementQ.data;
    if (!s) return null;
    const open = s.invoices
      .filter((i) => OPEN_INVOICE.includes(i.status) && i.balance_due > 0)
      .sort((a, b) => (daysOverdue(b, now) ?? -9e9) - (daysOverdue(a, now) ?? -9e9));
    const overdue = open.filter((i) => (daysOverdue(i, now) ?? -1) > 0);
    return {
      outstanding: s.total_outstanding,
      overdue: overdue.reduce((a, i) => a + i.balance_due, 0),
      overdueCount: overdue.length,
      paid: s.total_paid,
      open,
      currency: open[0]?.currency || s.invoices[0]?.currency || 'SAR',
    };
  }, [statementQ.data, now]);

  const trips = useMemo(() => {
    const open = openQ.data?.trips ?? [];
    const live = open.filter((t) => ['Loading', 'InTransit', 'Delayed'].includes(t.status));
    const planned = open.filter((t) => !live.includes(t)).sort((a, b) => new Date(a.planned_start ?? 0).getTime() - new Date(b.planned_start ?? 0).getTime());
    const month = (monthQ.data?.trips ?? []).filter((t) => t.status !== 'Cancelled');
    return {
      live,
      shown: [...live, ...planned].slice(0, 4),
      openCount: open.length,
      monthCount: month.length,
      monthValue: month.reduce((a, t) => a + (Number(t.billing_amount) || 0), 0),
    };
  }, [openQ.data, monthQ.data]);

  return {
    customer: customerQ.data ?? null,
    loading: customerQ.isLoading,
    notFound: (customerQ.error as any)?.response?.status === 404,
    failed: Boolean(customerQ.error),
    money,
    moneyLoading: statementQ.isLoading,
    moneyFailed: Boolean(statementQ.error),
    trips,
    tripsLoading: openQ.isLoading || monthQ.isLoading || tzQ.isLoading,
    quotations: quotesQ.data ?? [],
    quotationsLoading: quotesQ.isLoading,
    places: placesQ.data ?? [],
    placesLoading: placesQ.isLoading,
    refresh: async () => {
      await Promise.all([customerQ.refetch(), statementQ.refetch(), openQ.refetch(), monthQ.refetch(), quotesQ.refetch(), placesQ.refetch()]);
    },
  };
}
