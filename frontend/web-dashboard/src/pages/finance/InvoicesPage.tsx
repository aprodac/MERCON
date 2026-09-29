import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, BellRing, BookOpenCheck, ChevronLeft, ChevronRight, Download, FileCheck2, Plus, Search, Truck, X } from 'lucide-react';
import { toast } from 'sonner';
import type { Invoice } from '@mercon/shared-types';

import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import ExportModal, { type ExportColumn } from '@/components/ui/ExportModal';
import { ScrollTableCard } from '@/components/finance/kit/ScrollTableCard';
import { PeriodControl } from '@/components/finance/kit/PeriodControl';
import { asOfPresetDate } from '@/components/finance/kit/AsOfControl';
import { TONE_CLASSES } from '@/components/finance/kit/tones';
import { PartyAvatar } from '@/components/finance/ageing/PartyAvatar';
import { InvoiceActions, InvoiceStateChip } from '@/components/finance/invoices/InvoiceActions';
import { InvoiceRecord } from '@/components/finance/invoices/InvoiceRecord';
import { ReadyToBillSheet } from '@/components/finance/invoices/ReadyToBillSheet';
import { useInvoiceWorkflow } from '@/components/finance/invoices/useInvoiceWorkflow';
import { InvoiceLedgerSetupSheet, IssueInvoiceDialog } from '@/components/finance/invoices/InvoiceLedgerSetup';
import { authStore } from '@/store/authStore';
import { customerService } from '@/services/customerService';
import { financeService, type InvoiceListStatus, type InvoiceSort } from '@/services/financeService';
import type { PeriodPreset } from '@/lib/finance/pnlPeriodHelpers';
import { dueText, invoiceState, paidShare } from '@/lib/finance/invoices';
import { formatDate, formatMoney } from '@/lib/finance/format';
import { cn } from '@/lib/utils';

const PER_PAGE = 25;

const TABS: { value: InvoiceListStatus; label: string; count: 'all' | 'Draft' | 'unpaid' | 'overdue' | 'Paid' | 'Void' }[] = [
  { value: 'all', label: 'All', count: 'all' },
  { value: 'Draft', label: 'Drafts', count: 'Draft' },
  { value: 'unpaid', label: 'Unpaid', count: 'unpaid' },
  { value: 'overdue', label: 'Overdue', count: 'overdue' },
  { value: 'Paid', label: 'Paid', count: 'Paid' },
  { value: 'Void', label: 'Void', count: 'Void' },
];

const SORTS: { value: InvoiceSort; label: string }[] = [
  { value: 'date_desc', label: 'Newest first' },
  { value: 'date_asc', label: 'Oldest first' },
  { value: 'due_asc', label: 'Due soonest' },
  { value: 'balance_desc', label: 'Largest balance' },
  { value: 'total_desc', label: 'Largest total' },
];

const exportColumns: ExportColumn<Invoice>[] = [
  { id: 'ref_id', label: 'Invoice', accessor: (i) => i.ref_id ?? i.id },
  { id: 'customer', label: 'Customer', accessor: (i) => i.customer?.name ?? '' },
  { id: 'invoice_date', label: 'Invoice date', accessor: (i) => formatDate(i.invoice_date) },
  { id: 'due_date', label: 'Due date', accessor: (i) => (i.due_date ? formatDate(i.due_date) : '') },
  { id: 'status', label: 'Status', accessor: (i) => i.status },
  { id: 'subtotal', label: 'Subtotal (SAR)', accessor: (i) => Number(i.subtotal) },
  { id: 'tax', label: 'VAT (SAR)', accessor: (i) => Number(i.tax_amount) },
  { id: 'total', label: 'Total (SAR)', accessor: (i) => Number(i.total_amount) },
  { id: 'paid', label: 'Paid (SAR)', accessor: (i) => Number(i.paid_amount) },
  { id: 'balance', label: 'Balance due (SAR)', accessor: (i) => Number(i.balance_due) },
];

const DISMISS_KEY = 'mercon_ready_to_bill_dismissed';
const th = 'h-9 px-3 text-xs font-semibold text-foreground whitespace-nowrap';
const td = 'px-3 py-2 text-xs align-middle';

export default function InvoicesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const set = (updates: Record<string, string | null>, resetPage = true) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        Object.entries(updates).forEach(([k, v]) => (v === null || v === '' ? next.delete(k) : next.set(k, v)));
        if (resetPage) next.delete('page');
        return next;
      },
      { replace: true },
    );

  const today = asOfPresetDate('today');
  const tab = (params.get('tab') as InvoiceListStatus) || 'all';
  const search = params.get('q') || '';
  const customerId = params.get('customer') || '';
  const dateFrom = params.get('from') || '';
  const dateTo = params.get('to') || '';
  const preset = (params.get('preset') as PeriodPreset) || 'custom';
  const sort = (params.get('sort') as InvoiceSort) || '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const panelId = params.get('invoice');

  // Search box is local so typing stays smooth; the URL follows after a short pause
  const [searchDraft, setSearchDraft] = useState(search);
  useEffect(() => setSearchDraft(search), [search]);
  useEffect(() => {
    const t = window.setTimeout(() => searchDraft !== search && set({ q: searchDraft.trim() || null }), 300);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchDraft]);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const filters = { customer_id: customerId || undefined, date_from: dateFrom || undefined, date_to: dateTo || undefined, search: search || undefined };
  const list = useQuery({
    queryKey: ['invoices', 'list', tab, filters, sort, page],
    queryFn: () => financeService.getInvoices({ ...filters, status: tab, sort: sort || undefined, page, per_page: PER_PAGE }),
    placeholderData: (prev) => prev,
  });
  const summary = useQuery({ queryKey: ['invoices', 'summary', filters], queryFn: () => financeService.getInvoiceSummary(filters) });
  const unbilled = useQuery({ queryKey: ['invoices', 'unbilled'], queryFn: () => financeService.getUnbilledTrips() });
  const { data: customersRes } = useQuery({ queryKey: ['customers', 'all'], queryFn: () => customerService.getAll({ per_page: 500 } as any) });

  const invoices: Invoice[] = list.data?.data ?? [];
  const pagination = list.data?.pagination ?? { page: 1, per_page: PER_PAGE, total: 0, total_pages: 1 };
  const counts = summary.data?.data?.counts;
  const s = summary.data?.data;

  const { run, sheets, busy } = useInvoiceWorkflow({ onDeleted: (id) => id === panelId && set({ invoice: null }, false) });

  // Selection (current page) and bulk actions
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => setSelected(new Set()), [tab, search, customerId, dateFrom, dateTo, page]);
  const selectedRows = invoices.filter((i) => selected.has(i.id));
  const selectedDrafts = selectedRows.filter((i) => i.status === 'Draft');
  const selectedCustomers = new Set(selectedRows.map((i) => i.customerId));
  const selectedOpen = selectedRows.filter((i) => ['unpaid', 'part_paid', 'overdue'].includes(invoiceState(i, today)));
  const [bulkIssue, setBulkIssue] = useState(false);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [bulkRunning, setBulkRunning] = useState(false);

  const issueSelected = async () => {
    setBulkRunning(true);
    let ok = 0;
    const failed: string[] = [];
    for (const inv of selectedDrafts) {
      try {
        await financeService.issueInvoice(inv.id);
        ok++;
      } catch (err: any) {
        failed.push(`${inv.ref_id}: ${err?.response?.data?.error?.message || 'failed'}`);
      }
    }
    setBulkRunning(false);
    setBulkIssue(false);
    setSelected(new Set());
    queryClient.invalidateQueries({ queryKey: ['invoices'] });
    queryClient.invalidateQueries({ queryKey: ['finance-reports'] });
    if (ok) toast.success(`${ok} invoice${ok === 1 ? '' : 's'} issued`);
    if (failed.length) toast.error(failed.join('\n'));
  };

  // Export: the selected rows, or everything that matches the filters (not just this page)
  const [exportRows, setExportRows] = useState<Invoice[] | null>(null);
  const openExport = async () => {
    if (selectedRows.length) return setExportRows(selectedRows);
    try {
      const all: Invoice[] = [];
      for (let p = 1; p <= 10; p++) {
        const res = await financeService.getInvoices({ ...filters, status: tab, sort: sort || undefined, page: p, per_page: 200 });
        all.push(...(res.data ?? []));
        if (p >= (res.pagination?.total_pages ?? 1)) break;
      }
      setExportRows(all);
    } catch {
      toast.error('Could not load the invoices to export');
    }
  };

  const [readyOpen, setReadyOpen] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === today;
    } catch {
      return false;
    }
  });
  const ub = unbilled.data?.data;
  const showReady = !dismissed && (ub?.trip_count ?? 0) > 0;
  const billableCustomers = ub?.customers.filter((c) => c.trip_ids.length > 0).length ?? 0;

  const allChecked = invoices.length > 0 && invoices.every((i) => selected.has(i.id));
  const figure = (label: string, value: string, count: number | undefined, tone: string | null, onClick: () => void) => (
    <button type="button" onClick={onClick} className="min-w-0 rounded-md px-2 py-1 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">
      <span className="block text-[11px] text-muted-foreground">
        {label}
        {count !== undefined && ` · ${count}`}
      </span>
      <span className={cn('fin-num block text-base font-semibold leading-tight', tone ?? 'text-foreground')}>{value}</span>
    </button>
  );

  const role = authStore.getUser()?.role as string | undefined;
  const isAdmin = role === 'Admin' || role === 'SuperAdmin';

  return (
    <DashboardLayout active="finance" title="Invoices" fixedViewport>
      <InvoiceLedgerSetupSheet open={ledgerOpen} onOpenChange={setLedgerOpen} />
      <div className="mx-auto flex h-full w-full max-w-7xl min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4 max-md:h-auto max-md:overflow-y-auto">
        <div className="flex shrink-0 flex-col gap-3 lg:flex-row lg:items-center">
          <Card className="flex flex-1 flex-row flex-wrap items-center gap-2 rounded-xl p-2 shadow-xs">
            {figure('Unpaid', formatMoney(s?.unpaid_balance ?? 0), counts?.unpaid, null, () => set({ tab: 'unpaid' }))}
            {figure('Overdue', formatMoney(s?.overdue_balance ?? 0), counts?.overdue, (s?.overdue_balance ?? 0) > 0 ? TONE_CLASSES.negative.fg : null, () => set({ tab: 'overdue' }))}
            {figure('Received this month', formatMoney(s?.paid_this_month ?? 0), s?.payments_this_month, TONE_CLASSES.positive.fg, () => set({ tab: 'Paid' }))}
            {figure('Drafts', String(counts?.Draft ?? 0), undefined, null, () => set({ tab: 'Draft' }))}
          </Card>
          {isAdmin && (
            <Button variant="ghost" size="sm" className="h-9 shrink-0 gap-1.5 text-xs text-muted-foreground" onClick={() => setLedgerOpen(true)} title="Which accounts invoices post to">
              <BookOpenCheck className="size-3.5" /> Ledger setup
            </Button>
          )}
          <Button onClick={() => navigate('/finance/invoices/new')} className="h-9 shrink-0 gap-1.5 bg-brand text-white hover:bg-brand-hover">
            <Plus className="size-4" /> New invoice
          </Button>
        </div>

        {showReady && ub && (
          <div className={cn('flex shrink-0 flex-wrap items-center gap-3 rounded-xl border px-3 py-2 text-xs', TONE_CLASSES.info.bg, TONE_CLASSES.info.border, TONE_CLASSES.info.fg)}>
            <Truck className="size-4 shrink-0" />
            <span>
              <span className="font-semibold">
                {ub.trip_count} completed trip{ub.trip_count === 1 ? '' : 's'} not invoiced
              </span>{' '}
              · SAR {formatMoney(ub.amount)} · {billableCustomers} customer{billableCustomers === 1 ? '' : 's'}
            </span>
            <span className="flex-1" />
            <Button size="sm" variant="outline" className="h-7 bg-background text-xs text-foreground" onClick={() => setReadyOpen(true)}>
              Create invoices
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="size-7"
              aria-label="Hide until tomorrow"
              title="Hide until tomorrow"
              onClick={() => {
                setDismissed(true);
                try {
                  localStorage.setItem(DISMISS_KEY, today);
                } catch {
                  /* per-browser convenience only */
                }
              }}
            >
              <X className="size-4" />
            </Button>
          </div>
        )}

        <ScrollTableCard
          className="max-h-full flex-initial max-md:max-h-[80vh]"
          toolbar={
            <div className="flex w-full flex-col gap-2">
              <div className="flex flex-wrap items-center gap-1">
                {TABS.map((t) => {
                  const active = tab === t.value;
                  const count = counts?.[t.count];
                  return (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => set({ tab: t.value === 'all' ? null : t.value })}
                      aria-pressed={active}
                      className={cn(
                        'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                        active ? 'bg-muted font-semibold text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                      )}
                    >
                      {t.label}
                      {count !== undefined && (
                        <span className={cn('tabular-nums', t.value === 'overdue' && count > 0 ? TONE_CLASSES.negative.fg : 'text-muted-foreground')}>{count}</span>
                      )}
                    </button>
                  );
                })}
              </div>
              {selectedRows.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted px-2.5 py-1.5">
                  <span className="text-xs text-muted-foreground">
                    {selectedRows.length} selected ·{' '}
                    <span className="fin-num font-medium text-foreground">SAR {formatMoney(selectedRows.reduce((t, i) => t + Number(i.balance_due), 0))}</span> due
                  </span>
                  <span className="flex-1" />
                  {selectedDrafts.length > 0 && (
                    <Button size="sm" className="h-7 gap-1.5 bg-brand text-xs text-white hover:bg-brand-hover" onClick={() => setBulkIssue(true)}>
                      <FileCheck2 className="size-3.5" /> Issue {selectedDrafts.length}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1.5 text-xs"
                    disabled={selectedOpen.length === 0 || selectedCustomers.size !== 1}
                    title={selectedCustomers.size > 1 ? 'Select invoices of one customer to send a reminder' : undefined}
                    onClick={() => run('remind', selectedOpen[0])}
                  >
                    <BellRing className="size-3.5" /> Remind
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={openExport}>
                    <Download className="size-3.5" /> Export
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelected(new Set())}>Clear</Button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative w-72 max-w-full">
                    <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      ref={searchRef}
                      value={searchDraft}
                      onChange={(e) => setSearchDraft(e.target.value)}
                      placeholder="Invoice, customer, trip or AWB"
                      aria-label="Search invoices"
                      className="h-8 pl-8 pr-8 text-xs"
                    />
                    <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border px-1 text-[10px] text-muted-foreground">/</kbd>
                  </div>
                  <Select value={customerId || 'all'} onValueChange={(v) => set({ customer: v === 'all' ? null : v })}>
                    <SelectTrigger className="h-8 w-48 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" className="text-xs">All customers</SelectItem>
                      {(customersRes?.data ?? []).map((c: any) => (
                        <SelectItem key={c.id} value={c.id} className="text-xs">{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <PeriodControl
                    allowAll
                    preset={preset}
                    from={dateFrom}
                    to={dateTo}
                    onChange={(p) => set({ preset: p.from ? p.preset : null, from: p.from || null, to: p.to || null })}
                  />
                  <Select value={sort || 'default'} onValueChange={(v) => set({ sort: v === 'default' ? null : v }, false)}>
                    <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default" className="text-xs">{tab === 'unpaid' || tab === 'overdue' ? 'Due soonest' : 'Newest first'}</SelectItem>
                      {SORTS.map((o) => (
                        <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="flex-1" />
                  <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={openExport}>
                    <Download className="size-3.5" /> Export
                  </Button>
                </div>
              )}
            </div>
          }
          footer={
            <>
              <span className="text-muted-foreground">
                {pagination.total === 0 ? 'No invoices' : `${(pagination.page - 1) * pagination.per_page + 1}–${Math.min(pagination.page * pagination.per_page, pagination.total)} of ${pagination.total}`}
              </span>
              <span className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="size-7" aria-label="Previous page" disabled={page <= 1} onClick={() => set({ page: String(page - 1) }, false)}>
                  <ChevronLeft className="size-4" />
                </Button>
                <span className="tabular-nums text-muted-foreground">
                  {pagination.page} / {Math.max(1, pagination.total_pages)}
                </span>
                <Button variant="ghost" size="icon" className="size-7" aria-label="Next page" disabled={page >= pagination.total_pages} onClick={() => set({ page: String(page + 1) }, false)}>
                  <ChevronRight className="size-4" />
                </Button>
              </span>
            </>
          }
        >
          <table className="w-full min-w-[980px] text-left">
            <thead className="sticky top-0 z-10 border-b bg-background shadow-xs">
              <tr>
                <th className={cn(th, 'w-10')}>
                  <Checkbox aria-label="Select all on this page" checked={allChecked} onCheckedChange={(c) => setSelected(c ? new Set(invoices.map((i) => i.id)) : new Set())} />
                </th>
                <th className={th}>Invoice</th>
                <th className={th}>Customer</th>
                <th className={th}>Date</th>
                <th className={th}>Due</th>
                <th className={cn(th, 'text-right')}>Total</th>
                <th className={cn(th, 'text-right')}>Balance</th>
                <th className={th}>Status</th>
                <th className={cn(th, 'w-44')} />
              </tr>
            </thead>
            <tbody>
              {list.isLoading &&
                Array.from({ length: 8 }, (_, i) => (
                  <tr key={i} className="border-b">
                    <td colSpan={9} className="px-3 py-3"><div className="h-4 w-full animate-pulse rounded bg-muted" /></td>
                  </tr>
                ))}
              {!list.isLoading && invoices.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-14 text-center text-xs text-muted-foreground">
                    {search || customerId || dateFrom ? 'No invoices match these filters.' : tab === 'overdue' ? 'Nothing overdue. Nice.' : 'No invoices here yet.'}
                  </td>
                </tr>
              )}
              {invoices.map((inv) => {
                const state = invoiceState(inv, today);
                const paid = paidShare(inv);
                const trips = (inv as any)._count?.trips || 0;
                return (
                  <tr
                    key={inv.id}
                    onClick={() => set({ invoice: inv.id }, false)}
                    className={cn('cursor-pointer border-b border-border/60 transition-colors hover:bg-muted/40', panelId === inv.id && 'bg-muted/60', state === 'void' && 'text-muted-foreground')}
                  >
                    <td className={td} onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        aria-label={`Select ${inv.ref_id}`}
                        checked={selected.has(inv.id)}
                        onCheckedChange={(c) =>
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (c) next.add(inv.id);
                            else next.delete(inv.id);
                            return next;
                          })
                        }
                      />
                    </td>
                    <td className={td}>
                      <span className="fin-num font-semibold text-foreground">{inv.ref_id ?? inv.id.slice(0, 8)}</span>
                      {trips > 0 && <span className="ml-1.5 text-[11px] text-muted-foreground">{trips} trip{trips === 1 ? '' : 's'}</span>}
                    </td>
                    <td className={td}>
                      <span className="flex items-center gap-2">
                        <PartyAvatar name={inv.customer?.name ?? '?'} />
                        <span className="truncate font-medium text-foreground">{inv.customer?.name}</span>
                      </span>
                    </td>
                    <td className={cn(td, 'whitespace-nowrap text-muted-foreground')}>{formatDate(inv.invoice_date)}</td>
                    <td className={cn(td, 'whitespace-nowrap', state === 'overdue' ? cn('font-medium', TONE_CLASSES.negative.fg) : 'text-muted-foreground')}>{dueText(inv, today)}</td>
                    <td className={cn(td, 'fin-num text-right')}>{formatMoney(inv.total_amount)}</td>
                    <td className={cn(td, 'text-right')}>
                      <span className={cn('fin-num font-medium', state === 'paid' || state === 'void' ? 'text-muted-foreground' : 'text-foreground')}>{formatMoney(inv.balance_due)}</span>
                      {(state === 'part_paid' || (state === 'overdue' && paid > 0)) && (
                        <span className="mt-1 ml-auto block h-1 w-20 overflow-hidden rounded-full bg-muted" title={`${paid.toFixed(0)}% paid`}>
                          <span className={cn('block h-full', TONE_CLASSES.positive.dot)} style={{ width: `${paid}%` }} />
                        </span>
                      )}
                    </td>
                    <td className={td}><InvoiceStateChip invoice={inv} today={today} /></td>
                    <td className={td}><InvoiceActions invoice={inv} today={today} run={run} busy={busy} compact /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ScrollTableCard>
      </div>

      <Sheet open={panelId !== null} onOpenChange={(o) => !o && set({ invoice: null }, false)}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl">
          <SheetTitle className="sr-only">Invoice</SheetTitle>
          <SheetDescription className="sr-only">Invoice details, payments, activity and accounting</SheetDescription>
          {panelId && (
            <InvoiceRecord
              id={panelId}
              today={today}
              run={run}
              busy={busy}
              headerExtra={
                <Link to={`/finance/invoices/${panelId}`} className="mr-8 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                  Full page <ArrowUpRight className="size-3.5" />
                </Link>
              }
            />
          )}
        </SheetContent>
      </Sheet>

      <IssueInvoiceDialog
        open={bulkIssue}
        onOpenChange={setBulkIssue}
        title={`Issue ${selectedDrafts.length} draft${selectedDrafts.length === 1 ? '' : 's'}?`}
        description={`They're posted to the ledger for SAR ${formatMoney(selectedDrafts.reduce((t, i) => t + Number(i.total_amount), 0))} in total and can no longer be edited. Their trips are marked invoiced.`}
        hasVat={selectedDrafts.some((i) => Number(i.tax_amount) > 0.005)}
        pending={bulkRunning}
        onConfirm={issueSelected}
        confirmLabel="Issue invoices"
      />

      <ReadyToBillSheet open={readyOpen} onOpenChange={setReadyOpen} unbilled={ub} today={today} onDone={() => set({ tab: 'Draft' })} />

      {exportRows && (
        <ExportModal
          isOpen
          onClose={() => setExportRows(null)}
          title="Export invoices"
          fileNamePrefix={`Invoices_${today}`}
          sheetName="Invoices"
          data={exportRows}
          columns={exportColumns}
          formats={['xlsx', 'csv']}
        />
      )}

      {sheets}
    </DashboardLayout>
  );
}
