import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ChevronLeft, ChevronRight, Copy, Download, MoreHorizontal, Pencil, Plus, Search, Trash2, Truck, User, X } from 'lucide-react';
import { toast } from 'sonner';
import { EXPENSE_CATEGORIES, EXPENSE_PAYMENT_METHODS } from '@mercon/shared-types';

import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import ConfirmModal from '@/components/ui/ConfirmModal';
import ExportModal, { type ExportColumn } from '@/components/ui/ExportModal';
import { PeriodControl, PERIOD_LABEL } from '@/components/finance/kit/PeriodControl';
import { ScrollTableCard } from '@/components/finance/kit/ScrollTableCard';
import { SegmentedControl } from '@/components/finance/kit/SegmentedControl';
import { TONE_CLASSES } from '@/components/finance/kit/tones';
import { ExpenseInsights } from '@/components/expenses/ExpenseInsights';
import { ExpenseQuickView } from '@/components/expenses/ExpenseQuickView';
import { expenseService, type Expense, type ExpenseFilters, type ExpenseLink, type ExpenseSort } from '@/services/expenseService';
import { resolvePeriodPreset, type PeriodPreset } from '@/lib/finance/pnlPeriodHelpers';
import { formatDate, formatMoney } from '@/lib/finance/format';
import { categoryTone, driverName, expenseRef, LINK_LABEL, monthKey, monthLabel, todayIso } from '@/lib/expenses/expenseMeta';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { cn } from '@/lib/utils';

const ALL = 'all';
const PAGE_SIZES = [25, 50, 100];
const SORT_LABEL: Record<ExpenseSort, string> = { date_desc: 'Newest first', date_asc: 'Oldest first', amount_desc: 'Largest first', amount_asc: 'Smallest first' };

const EXPORT_COLUMNS: ExportColumn<Expense>[] = [
  { id: 'ref_id', label: 'Expense #', accessor: (e) => expenseRef(e) },
  { id: 'expense_date', label: 'Date', accessor: (e) => (e.expense_date ? formatDate(e.expense_date) : '') },
  { id: 'category', label: 'Category', accessor: (e) => e.category },
  { id: 'status', label: 'Status', accessor: (e) => e.status },
  { id: 'amount', label: 'Amount (SAR)', accessor: (e) => Number(e.amount) || 0 },
  { id: 'payee', label: 'Paid to', accessor: (e) => e.payee || '' },
  { id: 'vehicle', label: 'Truck', accessor: (e) => e.vehicle?.plate_number || '' },
  { id: 'driver', label: 'Driver', accessor: (e) => driverName(e) || '' },
  { id: 'payment_method', label: 'Payment method', accessor: (e) => e.payment_method || '' },
  { id: 'bill_issued_date', label: 'Bill issued', accessor: (e) => (e.bill_issued_date ? formatDate(e.bill_issued_date) : '') },
  { id: 'bill_paid_date', label: 'Bill paid', accessor: (e) => (e.bill_paid_date ? formatDate(e.bill_paid_date) : '') },
  { id: 'description', label: 'Description', accessor: (e) => e.description || '' },
];

const th = 'px-3 py-2 text-xs font-semibold text-foreground whitespace-nowrap';
const td = 'px-3 py-1.5 text-xs align-middle';

/** A filter select inside the table card; highlighted while it narrows the list. */
function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className={cn('h-8 w-auto min-w-[120px] gap-1.5 text-xs', value !== ALL && 'border-ring bg-muted/40')}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL} className="text-xs">
          All {label.toLowerCase()}
        </SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} className="text-xs">
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default function ExpenseListPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const set = (updates: Record<string, string | null>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        Object.entries(updates).forEach(([k, v]) => (v === null || v === '' || v === ALL ? next.delete(k) : next.set(k, v)));
        if (!('page' in updates)) next.delete('page');
        return next;
      },
      { replace: true },
    );

  // ── URL state ───────────────────────────────────────────────────────────
  const preset = (params.get('preset') as PeriodPreset) || (params.get('from') || params.get('to') ? 'custom' : 'ytd');
  const anyDate = params.get('preset') === 'any';
  const defaults = resolvePeriodPreset(preset === 'custom' ? 'ytd' : preset);
  const dateFrom = anyDate ? '' : params.get('from') || defaults.from;
  const dateTo = anyDate ? '' : params.get('to') || defaults.to;
  const status = params.get('status') || ALL;
  const category = params.get('category') || ALL;
  const linked = (params.get('linked') as ExpenseLink | null) || null;
  const method = params.get('method') || ALL;
  const sort = (params.get('sort') as ExpenseSort) || 'date_desc';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const perPage = PAGE_SIZES.includes(Number(params.get('per'))) ? Number(params.get('per')) : 50;
  const [search, setSearch] = useState(params.get('q') || '');
  const q = useDebouncedValue(search, 300);
  useEffect(() => {
    if ((params.get('q') || '') !== q) set({ q: q || null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const filters: ExpenseFilters = {
    search: q || undefined,
    status: status !== ALL ? status : undefined,
    category: category !== ALL ? category : undefined,
    linked: linked ?? undefined,
    payment_method: method !== ALL ? method : undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
  };
  const filtered = Boolean(q || status !== ALL || category !== ALL || linked || method !== ALL);

  // ── Data ────────────────────────────────────────────────────────────────
  const list = useQuery({
    queryKey: ['expenses', 'list', filters, sort, page, perPage],
    queryFn: () => expenseService.getAll({ ...filters, sort, page, per_page: perPage }),
    placeholderData: keepPreviousData,
  });
  // Tabs count every status, so their summary leaves the status filter out
  const summary = useQuery({ queryKey: ['expenses', 'summary', { ...filters, status: undefined }], queryFn: () => expenseService.getSummary({ ...filters, status: undefined }) });
  const statusSummary = useQuery({
    queryKey: ['expenses', 'summary', filters],
    queryFn: () => expenseService.getSummary(filters),
    enabled: status !== ALL,
  });
  const shownSummary = status !== ALL ? statusSummary.data : summary.data;

  const rows: Expense[] = useMemo(() => list.data?.data ?? [], [list.data]);
  const total = list.data?.meta?.total ?? 0;
  const pages = Math.max(1, list.data?.meta?.total_pages ?? 1);
  const monthTotals = useMemo(() => new Map((shownSummary?.by_month ?? []).map((m) => [m.month, m])), [shownSummary]);
  const categories = useMemo(() => {
    const extra = (summary.data?.by_category ?? []).map((c) => c.category).filter((c) => !(EXPENSE_CATEGORIES as readonly string[]).includes(c));
    return [...EXPENSE_CATEGORIES, ...extra];
  }, [summary.data]);

  // ── Selection and dialogs ───────────────────────────────────────────────
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => setSelected(new Set()), [q, status, category, linked, method, dateFrom, dateTo, page, perPage, sort]);
  const selectedRows = rows.filter((r) => selected.has(r.id));
  const selectedAmount = selectedRows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const allOnPage = rows.length > 0 && rows.every((r) => selected.has(r.id));

  const [viewing, setViewing] = useState<Expense | null>(null);
  // New, edit and duplicate open the expense page; it comes back here
  const openNew = () => navigate('/expenses/new');
  const openEdit = (e: Expense) => navigate(`/expenses/${e.id}/edit?back=${encodeURIComponent('/expenses')}`);
  const openDuplicate = (e: Expense) => navigate(`/expenses/new?from=${e.id}`);
  // After saving a new expense the page returns with ?view=<id>: show it
  const viewId = params.get('view');
  useEffect(() => {
    if (!viewId) return;
    expenseService
      .getById(viewId)
      .then(setViewing)
      .catch(() => undefined)
      .finally(() => set({ view: null }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewId]);
  const [toDelete, setToDelete] = useState<Expense[] | null>(null);
  const [exportOpen, setExportOpen] = useState(false);

  const allFiltered = useQuery({
    queryKey: ['expenses', 'export', filters, sort],
    queryFn: () => expenseService.getAll({ ...filters, sort, page: 1, per_page: 5000 }),
    enabled: exportOpen,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['expenses'] });

  const markPaid = useMutation({
    mutationFn: async (items: Expense[]) => {
      const results = await Promise.allSettled(items.map((e) => expenseService.update(e.id, { status: 'Paid', bill_paid_date: e.bill_paid_date?.slice(0, 10) || todayIso() })));
      const failed = results
        .map((r, i) => (r.status === 'rejected' ? { e: items[i], msg: (r.reason as any)?.response?.data?.error?.message as string | undefined } : null))
        .filter((x): x is { e: Expense; msg: string | undefined } => x !== null);
      return { done: items.length - failed.length, failed };
    },
    onSuccess: ({ done, failed }) => {
      refresh();
      setSelected(new Set());
      if (done > 0) toast.success(`${done} ${done === 1 ? 'expense' : 'expenses'} marked as paid`);
      if (failed.length > 0) {
        const first = failed[0];
        toast.error(`${expenseRef(first.e)}: ${first.msg ?? 'could not be marked as paid'}${failed.length > 1 ? ` (and ${failed.length - 1} more)` : ''}`, {
          action: { label: 'Edit', onClick: () => openEdit(first.e) },
        });
      }
      setViewing((v) => (v && !failed.some((f) => f.e.id === v.id) ? null : v));
    },
  });

  const remove = useMutation({
    mutationFn: async (items: Expense[]) => Promise.all(items.map((e) => expenseService.delete(e.id))),
    onSuccess: (_r, items) => {
      refresh();
      setSelected(new Set());
      setToDelete(null);
      setViewing(null);
      toast.success(`${items.length} ${items.length === 1 ? 'expense' : 'expenses'} deleted`);
    },
    onError: () => toast.error('Some expenses could not be deleted.'),
  });

  // "/" focuses the search box
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)))) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const tabCount = (s: 'all' | 'Pending' | 'Paid') => {
    const d = summary.data;
    if (!d) return '';
    return s === 'all' ? `${d.count}` : s === 'Pending' ? `${d.pending_count}` : `${d.count - d.pending_count}`;
  };
  const periodText = anyDate ? 'any date' : preset !== 'custom' ? PERIOD_LABEL[preset].toLowerCase() : `${formatDate(dateFrom)} – ${formatDate(dateTo)}`;

  // Month header rows only make sense in date order
  const groupByMonth = sort === 'date_desc' || sort === 'date_asc';

  return (
    <DashboardLayout active="Expenses" title="Expenses" fixedViewport>
      <div className="mx-auto flex h-full w-full max-w-[1400px] min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4 max-md:h-auto max-md:overflow-y-auto">
        {/* Toolbar */}
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b pb-2.5">
          <SegmentedControl
            aria-label="Payment status"
            value={status === 'Pending' || status === 'Paid' ? status : 'all'}
            onChange={(v) => set({ status: v === 'all' ? null : v })}
            options={[
              { value: 'all', label: `All ${tabCount('all')}`.trim() },
              { value: 'Pending', label: `To pay ${tabCount('Pending')}`.trim() },
              { value: 'Paid', label: `Paid ${tabCount('Paid')}`.trim() },
            ]}
          />
          <PeriodControl
            preset={preset}
            from={dateFrom}
            to={dateTo}
            allowAll
            onChange={({ preset: p, from, to }) =>
              !from && !to ? set({ preset: 'any', from: null, to: null }) : set({ preset: p, from: p === 'custom' ? from : null, to: p === 'custom' ? to : null })
            }
          />
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setExportOpen(true)}>
              <Download className="size-3.5" /> Export
            </Button>
            <Button size="sm" className="h-8 gap-1.5 bg-brand text-xs text-white hover:bg-brand-hover" onClick={() => openNew()}>
              <Plus className="size-3.5" /> New expense
            </Button>
          </div>
        </div>

        <ExpenseInsights
          summary={shownSummary}
          isLoading={summary.isLoading}
          comparedWith={anyDate ? '' : 'the period before'}
          status={status !== ALL ? status : null}
          linked={linked}
          category={category !== ALL ? category : null}
          onStatus={(s) => set({ status: s })}
          onLinked={(l) => set({ linked: l })}
          onCategory={(c) => set({ category: c })}
          onMonth={(m) => {
            const [y, mo] = m.split('-').map(Number);
            const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
            set({ preset: 'custom', from: `${m}-01`, to: `${m}-${String(last).padStart(2, '0')}` });
          }}
        />

        <ScrollTableCard
          className="max-md:min-h-[480px]"
          toolbar={
            selected.size > 0 ? (
              <div className="flex w-full flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-foreground">
                  {selected.size} selected · <span className="fin-num">SAR {formatMoney(selectedAmount)}</span>
                </span>
                <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setSelected(new Set())}>
                  <X className="size-3.5" /> Clear
                </Button>
                <div className="ml-auto flex gap-2">
                  {selectedRows.some((r) => r.status === 'Pending') && (
                    <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" disabled={markPaid.isPending} onClick={() => markPaid.mutate(selectedRows.filter((r) => r.status === 'Pending'))}>
                      <CheckCircle2 className="size-3.5" /> Mark as paid
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => setExportOpen(true)}>
                    <Download className="size-3.5" /> Export
                  </Button>
                  <Button size="sm" variant="outline" className={cn('h-8 gap-1.5 text-xs', TONE_CLASSES.negative.fg)} onClick={() => setToDelete(selectedRows)}>
                    <Trash2 className="size-3.5" /> Delete
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex w-full flex-wrap items-center gap-2">
                <div className="relative w-60 max-sm:w-full">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    ref={searchRef}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => e.key === 'Escape' && setSearch('')}
                    placeholder="Search payee, truck, driver, #"
                    aria-label="Search expenses"
                    className="h-8 pl-8 pr-7 text-xs"
                  />
                  {!search && <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border bg-muted px-1 text-[10px] text-muted-foreground">/</kbd>}
                </div>
                <FilterSelect label="Categories" value={category} onChange={(v) => set({ category: v })} options={categories.map((c) => ({ value: c, label: c }))} />
                <FilterSelect
                  label="Charged to"
                  value={linked ?? ALL}
                  onChange={(v) => set({ linked: v })}
                  options={(['vehicle', 'driver', 'overhead'] as const).map((k) => ({ value: k, label: LINK_LABEL[k] }))}
                />
                <FilterSelect label="Methods" value={method} onChange={(v) => set({ method: v })} options={EXPENSE_PAYMENT_METHODS.map((m) => ({ value: m, label: m }))} />
                {filtered && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1 text-xs"
                    onClick={() => {
                      setSearch('');
                      set({ q: null, status: null, category: null, linked: null, method: null });
                    }}
                  >
                    <X className="size-3.5" /> Clear filters
                  </Button>
                )}
                <Select value={sort} onValueChange={(v) => set({ sort: v === 'date_desc' ? null : v })}>
                  <SelectTrigger aria-label="Sort" className="ml-auto h-8 w-[140px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(SORT_LABEL) as ExpenseSort[]).map((k) => (
                      <SelectItem key={k} value={k} className="text-xs">
                        {SORT_LABEL[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )
          }
          footer={
            <>
              <span className="text-muted-foreground">
                {total === 0 ? 'No expenses' : `${(page - 1) * perPage + 1}–${Math.min(page * perPage, total)} of ${total}`}
                {shownSummary && total > 0 && (
                  <>
                    {' '}
                    · total <span className="fin-num font-medium text-foreground">SAR {formatMoney(shownSummary.total)}</span>
                  </>
                )}
              </span>
              <div className="flex items-center gap-2">
                <Select value={String(perPage)} onValueChange={(v) => set({ per: v === '50' ? null : v })}>
                  <SelectTrigger aria-label="Rows per page" className="h-7 w-[112px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZES.map((n) => (
                      <SelectItem key={n} value={String(n)} className="text-xs">
                        {n} / page
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="icon" className="size-7" aria-label="Previous page" disabled={page <= 1} onClick={() => set({ page: String(page - 1) })}>
                  <ChevronLeft className="size-3.5" />
                </Button>
                <span className="tabular-nums text-muted-foreground">
                  {page} / {pages}
                </span>
                <Button variant="outline" size="icon" className="size-7" aria-label="Next page" disabled={page >= pages} onClick={() => set({ page: String(page + 1) })}>
                  <ChevronRight className="size-3.5" />
                </Button>
              </div>
            </>
          }
        >
          <table className="w-full min-w-[860px] border-separate border-spacing-0 text-left">
            <thead className="sticky top-0 z-10 bg-background shadow-xs">
              <tr>
                <th className={cn(th, 'w-10')}>
                  <Checkbox
                    checked={allOnPage}
                    onCheckedChange={() => setSelected(allOnPage ? new Set() : new Set(rows.map((r) => r.id)))}
                    aria-label="Select all on this page"
                    disabled={rows.length === 0}
                  />
                </th>
                <th className={cn(th, 'w-24')}>Date</th>
                <th className={th}>Expense</th>
                <th className={th}>Paid to</th>
                <th className={th}>Charged to</th>
                <th className={cn(th, 'w-28')}>Method</th>
                <th className={cn(th, 'w-24')}>Status</th>
                <th className={cn(th, 'w-32 text-right')}>Amount</th>
                <th className="w-10" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {list.isLoading &&
                Array.from({ length: 8 }, (_, i) => (
                  <tr key={i}>
                    <td colSpan={9} className="px-3 py-2">
                      <Skeleton className="h-6 w-full" />
                    </td>
                  </tr>
                ))}
              {list.isError && (
                <tr>
                  <td colSpan={9} className={cn('p-8 text-center text-xs', TONE_CLASSES.negative.fg)}>
                    The expenses could not be loaded.{' '}
                    <button type="button" className="underline" onClick={() => list.refetch()}>
                      Retry
                    </button>
                  </td>
                </tr>
              )}
              {!list.isLoading && !list.isError && rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-14 text-center text-xs text-muted-foreground">
                    <p className="text-sm font-medium text-foreground">{filtered ? 'No expenses match' : `No expenses for ${periodText}`}</p>
                    <p className="mt-1">{filtered ? 'Try another search or clear the filters.' : 'Record one, or pick another period.'}</p>
                    <Button size="sm" className="mt-3 h-8 gap-1.5 bg-brand text-xs text-white hover:bg-brand-hover" onClick={() => openNew()}>
                      <Plus className="size-3.5" /> New expense
                    </Button>
                  </td>
                </tr>
              )}
              {rows.map((r, i) => {
                const month = monthKey(r.expense_date);
                const newMonth = groupByMonth && (i === 0 || monthKey(rows[i - 1].expense_date) !== month);
                const m = monthTotals.get(month);
                const on = selected.has(r.id);
                const pending = r.status === 'Pending';
                const driver = driverName(r);
                return (
                  <Fragment key={r.id}>
                    {newMonth && (
                      <tr className="bg-muted/40">
                        <td colSpan={7} className="px-3 py-1.5 text-[11px] font-semibold text-foreground [&]:border-b [&]:border-border/60">
                          {monthLabel(month)}
                          {m && <span className="ml-2 font-normal text-muted-foreground">{m.count} {m.count === 1 ? 'expense' : 'expenses'}</span>}
                        </td>
                        <td className="fin-num border-b border-border/60 px-3 py-1.5 text-right text-[11px] font-semibold text-foreground">{m ? formatMoney(m.amount) : ''}</td>
                        <td className="border-b border-border/60" />
                      </tr>
                    )}
                    <tr
                      tabIndex={0}
                      onClick={() => setViewing(r)}
                      onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && setViewing(r)}
                      className={cn('group cursor-pointer outline-none transition-colors [&>td]:border-b [&>td]:border-border/60 hover:bg-muted/40 focus-visible:bg-muted/60', on && 'bg-muted/60')}
                    >
                      <td className={td} onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={on}
                          onCheckedChange={() =>
                            setSelected((prev) => {
                              const next = new Set(prev);
                              if (next.has(r.id)) next.delete(r.id);
                              else next.add(r.id);
                              return next;
                            })
                          }
                          aria-label={`Select ${expenseRef(r)}`}
                        />
                      </td>
                      <td className={cn(td, 'whitespace-nowrap text-muted-foreground')}>{formatDate(r.expense_date)}</td>
                      <td className={td}>
                        <div className="flex items-center gap-2">
                          <Chip tone={categoryTone(r.category)} size="sm" dot className="max-w-[170px]">
                            <span className="truncate">{r.category}</span>
                          </Chip>
                          <span className="text-[11px] text-muted-foreground tabular-nums">{expenseRef(r)}</span>
                        </div>
                        {r.description && <p className="mt-0.5 max-w-[320px] truncate text-[11px] text-muted-foreground">{r.description}</p>}
                      </td>
                      <td className={cn(td, 'max-w-[180px] truncate text-foreground')}>{r.payee || <span className="text-muted-foreground">—</span>}</td>
                      <td className={td}>
                        <div className="flex max-w-[200px] flex-col gap-0.5">
                          {r.vehicle && (
                            <span className="flex items-center gap-1 truncate text-foreground">
                              <Truck className="size-3 shrink-0 text-muted-foreground" /> {r.vehicle.plate_number}
                            </span>
                          )}
                          {driver && (
                            <span className="flex items-center gap-1 truncate text-foreground">
                              <User className="size-3 shrink-0 text-muted-foreground" /> {driver}
                            </span>
                          )}
                          {!r.vehicle && !driver && <span className="text-muted-foreground">Overhead</span>}
                        </div>
                      </td>
                      <td className={cn(td, 'text-muted-foreground')}>{r.payment_method || '—'}</td>
                      <td className={td}>
                        <Chip tone={pending ? 'warning' : 'positive'} size="sm">
                          {pending ? 'To pay' : 'Paid'}
                        </Chip>
                      </td>
                      <td className={cn(td, 'fin-num whitespace-nowrap text-right font-semibold text-foreground')}>{formatMoney(r.amount)}</td>
                      <td className={cn(td, 'pr-2')} onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="size-7 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 max-md:opacity-100" aria-label={`Actions for ${expenseRef(r)}`}>
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            {pending && (
                              <DropdownMenuItem className="gap-2 text-xs" onSelect={() => markPaid.mutate([r])}>
                                <CheckCircle2 className="size-3.5" /> Mark as paid
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem className="gap-2 text-xs" onSelect={() => openEdit(r)}>
                              <Pencil className="size-3.5" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem className="gap-2 text-xs" onSelect={() => openDuplicate(r)}>
                              <Copy className="size-3.5" /> Duplicate
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className={cn('gap-2 text-xs', TONE_CLASSES.negative.fg)} onSelect={() => setToDelete([r])}>
                              <Trash2 className="size-3.5" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </ScrollTableCard>
      </div>

      <ExpenseQuickView
        expense={viewing}
        onClose={() => setViewing(null)}
        onEdit={openEdit}
        onDuplicate={openDuplicate}
        onDelete={(e) => setToDelete([e])}
        onMarkPaid={(e) => markPaid.mutate([e])}
        markingPaid={markPaid.isPending}
      />


      <ConfirmModal
        isOpen={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={() => toDelete && remove.mutate(toDelete)}
        title={toDelete && toDelete.length > 1 ? `Delete ${toDelete.length} expenses?` : `Delete ${toDelete?.[0] ? expenseRef(toDelete[0]) : 'this expense'}?`}
        description={`SAR ${formatMoney((toDelete ?? []).reduce((s, e) => s + (Number(e.amount) || 0), 0))} will be removed from the expenses and from any truck's P&L.`}
        confirmLabel="Delete"
        variant="destructive"
        isLoading={remove.isPending}
      />

      <ExportModal
        isOpen={exportOpen}
        onClose={() => setExportOpen(false)}
        title="Export expenses"
        subtitle={`${periodText} · ${shownSummary?.count ?? total} expenses · SAR ${formatMoney(shownSummary?.total ?? 0)}`}
        filename={`Expenses_${dateFrom || 'all'}_${dateTo || 'dates'}`}
        sheetName="Expenses"
        filteredData={allFiltered.data?.data ?? rows}
        selectedData={selectedRows}
        totalCount={shownSummary?.count ?? total}
        columns={EXPORT_COLUMNS}
        formats={['xlsx', 'csv', 'pdf']}
      />
    </DashboardLayout>
  );
}
