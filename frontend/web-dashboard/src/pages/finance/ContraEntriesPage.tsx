import { useEffect, useMemo, useState, type ComponentType } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownToLine, ArrowLeftRight, ArrowRight, ArrowUpFromLine, ChevronLeft, ChevronRight, ExternalLink, Loader2, Plus, Search, Wallet, X } from 'lucide-react';
import { toast } from 'sonner';
import type { BankAccount } from '@mercon/shared-types';

import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollTableCard } from '@/components/finance/kit/ScrollTableCard';
import { PeriodControl } from '@/components/finance/kit/PeriodControl';
import { TONE_CLASSES } from '@/components/finance/kit/tones';
import { BankAvatar, TransferSheet } from '@/components/finance/banking/TransferSheet';
import { financeService, type ContraEntry, type ContraSide, type ContraType } from '@/services/financeService';
import { resolvePeriodPreset, type PeriodPreset } from '@/lib/finance/pnlPeriodHelpers';
import { CONTRA_FILTERS, CONTRA_META } from '@/lib/finance/contra';
import { formatDate, formatMoney } from '@/lib/finance/format';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { cn } from '@/lib/utils';

const TYPE_ICON: Record<ContraType, ComponentType<{ className?: string }>> = {
  deposit: ArrowDownToLine,
  withdrawal: ArrowUpFromLine,
  bank_to_bank: ArrowLeftRight,
  cash_to_cash: Wallet,
};
const PER_PAGE = 50;
const ALL = '__all';

function TypeChip({ type }: { type: ContraType | null }) {
  if (!type) return <span className="text-muted-foreground">—</span>;
  const Icon = TYPE_ICON[type];
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-medium', TONE_CLASSES[CONTRA_META[type].tone].fg)}>
      <Icon className="size-3.5" /> {CONTRA_META[type].short}
    </span>
  );
}

function Side({ side, banks }: { side: ContraSide | null; banks: Map<string, BankAccount> }) {
  if (!side) return <span className="text-muted-foreground">—</span>;
  const bank = side.bank_account_id ? banks.get(side.bank_account_id) : undefined;
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <BankAvatar bankName={bank?.bank_name ?? side.name} isCash={side.is_cash} className="size-5" />
      <span className="truncate">{side.name}</span>
    </span>
  );
}

/**
 * Contra entries: money moved between cash and bank or between banks (BankTransfer journal
 * entries). Tiles total each kind for the period; the register lists them; a row opens its detail
 * with the posting and Void.
 */
export default function ContraEntriesPage() {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const set = (patch: Record<string, string | null>) =>
    setParams((p) => {
      const next = new URLSearchParams(p);
      Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
      if (!('page' in patch)) next.delete('page');
      return next;
    });

  const preset = (params.get('preset') as PeriodPreset) || 'this_month';
  const range = preset === 'custom' ? { from: params.get('from') || '', to: params.get('to') || '' } : resolvePeriodPreset(preset);
  const any = params.get('any') === '1';
  const type = (params.get('type') as ContraType | null) ?? null;
  const bankAccountId = params.get('account') || '';
  const status = (params.get('status') as 'posted' | 'voided' | 'all') || 'posted';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [searchDraft, setSearchDraft] = useState(params.get('q') || '');
  const search = useDebouncedValue(searchDraft, 300);
  useEffect(() => {
    if ((params.get('q') || '') !== search) set({ q: search || null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const [sheetOpen, setSheetOpen] = useState(params.get('new') === '1');
  useEffect(() => {
    if (params.get('new') === '1') {
      setSheetOpen(true);
      set({ new: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);
  const [viewing, setViewing] = useState<ContraEntry | null>(null);
  const [voiding, setVoiding] = useState<ContraEntry | null>(null);
  const [voidBusy, setVoidBusy] = useState(false);

  const query = {
    type: type ?? 'all',
    bank_account_id: bankAccountId || undefined,
    date_from: any ? undefined : range.from,
    date_to: any ? undefined : range.to,
    status,
    search: params.get('q') || undefined,
    page,
    per_page: PER_PAGE,
  } as const;
  const list = useQuery({ queryKey: ['contra', query], queryFn: () => financeService.getContraEntries(query), placeholderData: (prev) => prev });
  const { data: banksRes } = useQuery({ queryKey: ['bankAccounts'], queryFn: financeService.getBankAccounts });
  const bankList = useMemo(() => (banksRes?.data ?? []).filter((b) => !b.deletedAt), [banksRes]);
  const banks = useMemo(() => new Map(bankList.map((b) => [b.id, b])), [bankList]);
  const cashInHand = bankList.filter((b) => b.is_cash && b.isActive).reduce((t, b) => t + Number(b.book_balance ?? b.opening_balance ?? 0), 0);
  const hasCashTills = bankList.filter((b) => b.is_cash).length > 1;

  const rows = list.data?.data ?? [];
  const summary = list.data?.summary;
  const total = list.data?.meta.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const tiles: ContraType[] = hasCashTills ? [...CONTRA_FILTERS, 'cash_to_cash'] : CONTRA_FILTERS;

  const doVoid = async () => {
    if (!voiding) return;
    setVoidBusy(true);
    try {
      await financeService.voidJournalEntry(voiding.id, `Void of contra ${voiding.ref_id ?? ''}`.trim());
      toast.success(`${voiding.ref_id ?? 'Contra entry'} voided`);
      ['contra', 'bankAccounts', 'bank-accounts', 'journalEntries', 'finance-reports'].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
      setVoiding(null);
      setViewing(null);
    } catch (err: any) {
      const e = err?.response?.data?.error;
      toast.error((typeof e === 'string' ? e : e?.message) || 'Could not void the entry.');
    } finally {
      setVoidBusy(false);
    }
  };

  return (
    <DashboardLayout active="finance" title="Contra entries" fixedViewport>
      <div className="mx-auto flex h-full w-full max-w-7xl min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4 max-md:h-auto max-md:overflow-y-auto">
        {/* Totals per kind for the period; a tile filters the register */}
        <div className="flex shrink-0 flex-col gap-3 lg:flex-row lg:items-stretch">
          <div className={cn('grid flex-1 gap-2', tiles.length === 4 ? 'grid-cols-2 md:grid-cols-5' : 'grid-cols-2 md:grid-cols-4')}>
            {tiles.map((t) => {
              const Icon = TYPE_ICON[t];
              const tone = TONE_CLASSES[CONTRA_META[t].tone];
              const on = type === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => set({ type: on ? null : t })}
                  aria-pressed={on}
                  className={cn(
                    'min-w-0 rounded-xl border border-t-2 bg-card px-3 py-2 text-left shadow-xs outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring',
                    on && cn(tone.bg, tone.border),
                  )}
                  style={{ borderTopColor: `var(--chip-${CONTRA_META[t].tone}-dot)` }}
                >
                  <span className={cn('flex items-center gap-1.5 text-[11px] font-medium', tone.fg)}>
                    <Icon className="size-3.5" /> {CONTRA_META[t].label}
                    {summary && <span className="text-muted-foreground">· {summary[t].count}</span>}
                  </span>
                  <span className="fin-num block text-lg font-semibold leading-tight text-foreground">
                    {summary ? formatMoney(summary[t].amount) : <Skeleton className="mt-1 h-5 w-20" />}
                  </span>
                </button>
              );
            })}
            <div className="min-w-0 rounded-xl border bg-card px-3 py-2 shadow-xs">
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                <Wallet className="size-3.5" /> Cash in hand now
              </span>
              <span className={cn('fin-num block text-lg font-semibold leading-tight', cashInHand < -0.005 ? TONE_CLASSES.negative.fg : 'text-foreground')}>{formatMoney(cashInHand)}</span>
              {summary && summary.charges > 0.005 && <span className="fin-num block text-[11px] text-muted-foreground">Bank charges {formatMoney(summary.charges)}</span>}
            </div>
          </div>
          <Button onClick={() => setSheetOpen(true)} className="h-9 shrink-0 gap-1.5 self-start bg-brand text-white hover:bg-brand-hover">
            <Plus className="size-4" /> New contra
          </Button>
        </div>

        <ScrollTableCard
          toolbar={
            <>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input value={searchDraft} onChange={(e) => setSearchDraft(e.target.value)} placeholder="Entry, reference, note…" className="h-8 w-56 pl-8 text-xs" aria-label="Search contra entries" />
                </div>
                <Select value={bankAccountId || ALL} onValueChange={(v) => v && set({ account: v === ALL ? null : v })}>
                  <SelectTrigger className="h-8 w-48 text-xs" aria-label="Account">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL} className="text-xs">All accounts</SelectItem>
                    {bankList.map((b) => (
                      <SelectItem key={b.id} value={b.id} className="text-xs">
                        {b.is_cash ? b.bank_name || 'Cash' : b.bank_name || b.account?.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={status} onValueChange={(v) => v && set({ status: v === 'posted' ? null : v })}>
                  <SelectTrigger className="h-8 w-32 text-xs" aria-label="Status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="posted" className="text-xs">Posted</SelectItem>
                    <SelectItem value="voided" className="text-xs">Voided</SelectItem>
                    <SelectItem value="all" className="text-xs">All</SelectItem>
                  </SelectContent>
                </Select>
                {type && (
                  <button type="button" onClick={() => set({ type: null })} className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
                    {CONTRA_META[type].label} <X className="size-3" />
                  </button>
                )}
              </div>
              <PeriodControl
                preset={preset}
                from={any ? '' : range.from}
                to={any ? '' : range.to}
                allowAll
                onChange={({ preset: p, from, to }) =>
                  !from && !to ? set({ any: '1', preset: null, from: null, to: null }) : set({ any: null, preset: p === 'this_month' ? null : p, from: p === 'custom' ? from : null, to: p === 'custom' ? to : null })
                }
              />
            </>
          }
          footer={
            <>
              <span className="text-muted-foreground">
                {total} {total === 1 ? 'entry' : 'entries'}
                {list.data?.meta.truncated && ' · showing the latest 3,000; narrow the dates for older ones'}
              </span>
              {pages > 1 && (
                <span className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="size-7" disabled={page <= 1} onClick={() => set({ page: String(page - 1) })} aria-label="Previous page">
                    <ChevronLeft className="size-4" />
                  </Button>
                  <span className="text-muted-foreground">
                    {page} / {pages}
                  </span>
                  <Button variant="ghost" size="icon" className="size-7" disabled={page >= pages} onClick={() => set({ page: String(page + 1) })} aria-label="Next page">
                    <ChevronRight className="size-4" />
                  </Button>
                </span>
              )}
            </>
          }
        >
          <table className="w-full min-w-[760px] text-xs">
            <thead className="sticky top-0 z-10 bg-card text-[11px] text-muted-foreground">
              <tr className="border-b">
                <th className="px-3 py-2 text-left font-medium">Date</th>
                <th className="px-3 py-2 text-left font-medium">Entry</th>
                <th className="px-3 py-2 text-left font-medium">Type</th>
                <th className="px-3 py-2 text-left font-medium">From → to</th>
                <th className="px-3 py-2 text-left font-medium">Reference</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {list.isLoading &&
                Array.from({ length: 6 }, (_, i) => (
                  <tr key={i} className="border-b border-border/60">
                    <td colSpan={6} className="px-3 py-2">
                      <Skeleton className="h-5 w-full" />
                    </td>
                  </tr>
                ))}
              {!list.isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-12 text-center">
                    <p className="text-sm font-medium text-foreground">No contra entries {any ? 'yet' : 'in this period'}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Record cash taken to the bank, cash drawn out, or money moved between banks.</p>
                    <Button size="sm" variant="outline" className="mt-3 h-8 gap-1.5 text-xs" onClick={() => setSheetOpen(true)}>
                      <Plus className="size-3.5" /> New contra
                    </Button>
                  </td>
                </tr>
              )}
              {rows.map((r) => {
                const voided = r.status === 'Voided';
                return (
                  <tr key={r.id} onClick={() => setViewing(r)} className={cn('cursor-pointer border-b border-border/60 hover:bg-muted/40', viewing?.id === r.id && 'bg-muted/60')}>
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{formatDate(r.entry_date)}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-medium text-foreground">{r.ref_id ?? '—'}</td>
                    <td className="whitespace-nowrap px-3 py-2">{voided ? <Chip tone="neutral" size="sm">Voided</Chip> : <TypeChip type={r.type} />}</td>
                    <td className="max-w-[320px] px-3 py-2">
                      <span className={cn('flex min-w-0 items-center gap-1.5 text-foreground', voided && 'text-muted-foreground line-through')}>
                        <Side side={r.from} banks={banks} />
                        <ArrowRight className="size-3 shrink-0 text-muted-foreground" />
                        <Side side={r.to} banks={banks} />
                      </span>
                    </td>
                    <td className="max-w-[180px] truncate px-3 py-2 text-muted-foreground" title={r.memo ?? undefined}>
                      {r.reference || <span className="text-muted-foreground/60">—</span>}
                    </td>
                    <td className={cn('fin-num whitespace-nowrap px-3 py-2 text-right font-semibold', voided ? 'text-muted-foreground line-through' : 'text-foreground')}>
                      {formatMoney(r.amount)}
                      {r.charges > 0.005 && <span className="block text-[10px] font-normal text-muted-foreground">+ {formatMoney(r.charges)} fee</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ScrollTableCard>
      </div>

      <TransferSheet open={sheetOpen} onOpenChange={setSheetOpen} />

      {/* Detail */}
      <Sheet open={viewing !== null} onOpenChange={(o) => !o && setViewing(null)}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
          {viewing && (
            <>
              <div className="space-y-2 border-b p-5 pr-14">
                <div className="flex flex-wrap items-center gap-2">
                  <SheetTitle className="text-base">{viewing.ref_id ?? 'Contra entry'}</SheetTitle>
                  {viewing.status === 'Voided' ? (
                    <Chip tone="neutral" size="sm">Voided</Chip>
                  ) : viewing.type ? (
                    <Chip tone={CONTRA_META[viewing.type].tone} size="sm" dot>
                      {CONTRA_META[viewing.type].label}
                    </Chip>
                  ) : null}
                </div>
                <SheetDescription className="text-xs">{formatDate(viewing.entry_date)}{viewing.memo ? ` · ${viewing.memo}` : ''}</SheetDescription>
                <p className="fin-num text-2xl font-semibold text-foreground">
                  <span className="mr-1 text-sm font-medium text-muted-foreground">SAR</span>
                  {formatMoney(viewing.amount)}
                </p>
              </div>
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5 text-xs">
                <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                  <div className="rounded-lg border p-2.5">
                    <p className="text-[11px] text-muted-foreground">From</p>
                    <Side side={viewing.from} banks={banks} />
                  </div>
                  <ArrowRight className="size-4 text-muted-foreground" />
                  <div className="rounded-lg border p-2.5">
                    <p className="text-[11px] text-muted-foreground">To</p>
                    <Side side={viewing.to} banks={banks} />
                  </div>
                </div>
                <dl className="space-y-1.5">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Reference</dt>
                    <dd className="text-foreground">{viewing.reference || '—'}</dd>
                  </div>
                  {viewing.charges > 0.005 && (
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">Bank charges</dt>
                      <dd className="fin-num text-foreground">{formatMoney(viewing.charges)}</dd>
                    </div>
                  )}
                  {viewing.voided_by && (
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">Reversed by</dt>
                      <dd>
                        <Link to={`/finance/journal-entries/${viewing.voided_by.id}`} className="font-medium underline underline-offset-2">
                          {viewing.voided_by.ref_id}
                        </Link>{' '}
                        <span className="text-muted-foreground">{formatDate(viewing.voided_by.entry_date)}</span>
                      </dd>
                    </div>
                  )}
                </dl>
                <div className="space-y-1 rounded-lg border bg-muted/30 p-3">
                  <p className="text-[11px] font-medium text-muted-foreground">Posting</p>
                  <div className="flex justify-between gap-3">
                    <span className="truncate">{viewing.to?.code} {viewing.to?.name}</span>
                    <span className={cn('fin-num font-medium', TONE_CLASSES.positive.fg)}>Dr {formatMoney(viewing.amount)}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="truncate pl-3">{viewing.from?.code} {viewing.from?.name}</span>
                    <span className={cn('fin-num font-medium', TONE_CLASSES.negative.fg)}>Cr {formatMoney(viewing.amount)}</span>
                  </div>
                  {viewing.charges > 0.005 && <p className="text-[11px] text-muted-foreground">Plus the bank charges line; open the journal entry for every line.</p>}
                </div>
                <Link to={`/finance/journal-entries/${viewing.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-foreground underline underline-offset-2">
                  Open journal entry <ExternalLink className="size-3" />
                </Link>
              </div>
              {viewing.status === 'Posted' && (
                <div className="flex justify-end gap-2 border-t p-4">
                  <Button variant="outline" size="sm" className={cn('h-8 text-xs', TONE_CLASSES.negative.fg)} onClick={() => setVoiding(viewing)}>
                    Void entry
                  </Button>
                </div>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={voiding !== null} onOpenChange={(o) => !o && !voidBusy && setVoiding(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Void {voiding?.ref_id ?? 'this entry'}?</AlertDialogTitle>
            <AlertDialogDescription>
              A reversing entry dated today puts SAR {formatMoney(voiding?.amount ?? 0)} back in {voiding?.from?.name ?? 'the source account'}
              {voiding && voiding.charges > 0.005 ? ' and reverses the bank charges' : ''}. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={voidBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={voidBusy}
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                doVoid();
              }}
            >
              {voidBusy && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
              Void entry
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
