import { useEffect, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ExternalLink, Search, TrendingDown, X } from 'lucide-react';

import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { ScrollTableCard } from '@/components/finance/kit/ScrollTableCard';
import { PeriodControl } from '@/components/finance/kit/PeriodControl';
import { SegmentedControl } from '@/components/finance/kit/SegmentedControl';
import { TONE_CLASSES } from '@/components/finance/kit/tones';
import { Figure, FigureStrip } from '@/components/finance/kit/FigureStrip';
import {
  financeService, type ProfitGroupBy, type ProfitGroupRow, type ProfitTotals, type ProfitTripRow, type TripProfitabilityParams,
} from '@/services/financeService';
import { resolvePeriodPreset, type PeriodPreset } from '@/lib/finance/pnlPeriodHelpers';
import { costShares, formatPct, marginTone } from '@/lib/finance/tripProfit';
import { formatDate, formatMoney } from '@/lib/finance/format';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { cn } from '@/lib/utils';

const PER_PAGE = 50;
type Sort = NonNullable<TripProfitabilityParams['sort']>;
const GROUP_LABEL: Record<ProfitGroupBy, string> = { trip: 'Trips', customer: 'Customers', lane: 'Lanes', vehicle: 'Trucks' };
// Cost parts: one colour each, the same in the header bar, the rows and the trip panel
const PART = {
  driverPay: { label: 'Driver pay', tone: 'violet' },
  subcontract: { label: 'Subcontract', tone: 'orange' },
  expenses: { label: 'Trip expenses', tone: 'warning' },
} as const;

/** Revenue as one bar: driver pay, subcontract, expenses, then what's left (margin) or the overrun. */
function CostBar({ p, className }: { p: { revenue: number; driverPay: number; subcontract: number; expenses: number }; className?: string }) {
  const s = costShares(p);
  return (
    <div className={cn('flex h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}>
      <div className={TONE_CLASSES[PART.driverPay.tone].dot} style={{ width: `${s.driverPay}%` }} />
      <div className={TONE_CLASSES[PART.subcontract.tone].dot} style={{ width: `${s.subcontract}%` }} />
      <div className={TONE_CLASSES[PART.expenses.tone].dot} style={{ width: `${s.expenses}%` }} />
      <div className={TONE_CLASSES.positive.dot} style={{ width: `${s.margin}%` }} />
    </div>
  );
}

function MarginCell({ margin, pct }: { margin: number; pct: number | null }) {
  const tone = TONE_CLASSES[marginTone(margin, pct)];
  return (
    <>
      <td className={cn('fin-num whitespace-nowrap px-3 py-2 text-right font-semibold', pct === null ? 'text-muted-foreground' : tone.fg)}>{formatMoney(margin)}</td>
      <td className="whitespace-nowrap px-3 py-2 text-right">
        {pct === null ? (
          <span className="text-[11px] text-muted-foreground">No price</span>
        ) : (
          <span className={cn('fin-num inline-block min-w-14 rounded px-1.5 py-0.5 text-[11px] font-semibold', tone.bg, tone.fg)}>{formatPct(pct)}</span>
        )}
      </td>
    </>
  );
}

/**
 * Trip profitability: what each earned trip, customer, lane or truck made after driver pay,
 * subcontract and the trip's own expenses. Worst margin % first; a group drills into its trips.
 */
export default function TripProfitabilityPage() {
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
  const group = (params.get('group') as ProfitGroupBy) || 'trip';
  const only = (params.get('only') as 'loss' | 'unpriced' | null) ?? undefined;
  const sort = (params.get('sort') as Sort) || 'margin_pct';
  const dir = (params.get('dir') as 'asc' | 'desc') || 'asc';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const customerId = params.get('customer') || undefined;
  const vehicleId = params.get('vehicle') || undefined;
  const drillLabel = params.get('drill');
  const [searchDraft, setSearchDraft] = useState(params.get('q') || '');
  const search = useDebouncedValue(searchDraft, 300);
  useEffect(() => {
    if ((params.get('q') || '') !== search) set({ q: search || null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);
  const [viewing, setViewing] = useState<ProfitTripRow | null>(null);

  const query: TripProfitabilityParams = {
    from: range.from,
    to: range.to,
    group,
    only,
    sort,
    dir,
    page,
    per_page: PER_PAGE,
    customer_id: customerId,
    vehicle_id: vehicleId,
    search: params.get('q') || undefined,
  };
  const res = useQuery({ queryKey: ['finance-reports', 'trip-profitability', query], queryFn: () => financeService.getTripProfitability(query), placeholderData: (prev) => prev });
  const d = res.data;
  const s: ProfitTotals | undefined = d?.summary;
  const pages = Math.max(1, Math.ceil((d?.meta.total ?? 0) / PER_PAGE));

  const sortBy = (key: Sort) => set({ sort: key === 'margin_pct' ? null : key, dir: sort === key ? (dir === 'asc' ? 'desc' : null) : key === 'margin_pct' ? null : 'desc' });
  const SortHead = ({ k, children, className }: { k: Sort; children: ReactNode; className?: string }) => (
    <th className={cn('px-3 py-2 font-medium', className)}>
      <button type="button" onClick={() => sortBy(k)} className="inline-flex items-center gap-0.5 hover:text-foreground">
        {children}
        {sort === k && (dir === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
      </button>
    </th>
  );
  const drill = (g: ProfitGroupRow) => {
    if (group === 'customer') set({ group: null, customer: g.key, drill: g.label, q: null });
    // Subcontracted / no-truck groups have no truck to filter on
    else if (group === 'vehicle' && g.key !== '3pl' && g.key !== 'none') set({ group: null, vehicle: g.key, drill: g.label, q: null });
    else if (group === 'lane') {
      setSearchDraft(g.label);
      set({ group: null, q: g.label, drill: null });
    }
  };

  const tripRows = group === 'trip' ? ((d?.rows ?? []) as ProfitTripRow[]) : [];
  const groupRows = group !== 'trip' ? ((d?.rows ?? []) as ProfitGroupRow[]) : [];
  const cols = group === 'trip' ? 9 : 8;

  return (
    <DashboardLayout active="finance" title="Trip profitability" fixedViewport>
      <div className="mx-auto flex h-full w-full max-w-7xl min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4 max-md:h-auto max-md:overflow-y-auto">
        {/* The period at a glance */}
        <FigureStrip className="shrink-0 flex-none">
          <Figure label="Revenue" count={s?.trips} value={formatMoney(s?.revenue ?? 0)} loading={!s} />
          <Figure
            label="Cost"
            value={formatMoney(s?.cost ?? 0)}
            loading={!s}
            sub={
              s && (
                <span className="flex flex-wrap gap-x-2">
                  {(Object.keys(PART) as (keyof typeof PART)[]).filter((k) => s[k] > 0.005).map((k) => (
                    <span key={k} className="flex items-center gap-1">
                      <span className={cn('size-1.5 rounded-full', TONE_CLASSES[PART[k].tone].dot)} />
                      {PART[k].label} <span className="fin-num">{formatMoney(s[k])}</span>
                    </span>
                  ))}
                </span>
              )
            }
          />
          <Figure
            label="Margin"
            value={s ? `${formatMoney(s.margin)} · ${formatPct(s.marginPct)}` : ''}
            tone={s ? TONE_CLASSES[marginTone(s.margin, s.marginPct)].fg : null}
            loading={!s}
            sub={s && <CostBar p={s} className="w-40" />}
          />
          <Figure
            label="Losing trips"
            value={s?.lossTrips ?? 0}
            tone={s && s.lossTrips > 0 ? TONE_CLASSES.negative.fg : null}
            loading={!s}
            onClick={() => set({ only: only === 'loss' ? null : 'loss', group: null })}
            active={only === 'loss'}
          />
          <Figure
            label="No price"
            value={s?.unpricedTrips ?? 0}
            tone={s && s.unpricedTrips > 0 ? TONE_CLASSES.warning.fg : null}
            loading={!s}
            onClick={() => set({ only: only === 'unpriced' ? null : 'unpriced', group: null })}
            active={only === 'unpriced'}
          />
        </FigureStrip>

        <ScrollTableCard
          toolbar={
            <>
              <div className="flex flex-wrap items-center gap-2">
                <SegmentedControl aria-label="Group by" value={group} onChange={(g) => set({ group: g === 'trip' ? null : g, customer: null, vehicle: null, drill: null })} options={(Object.keys(GROUP_LABEL) as ProfitGroupBy[]).map((g) => ({ value: g, label: GROUP_LABEL[g] }))} />
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input value={searchDraft} onChange={(e) => setSearchDraft(e.target.value)} placeholder="Trip, customer, lane, truck…" className="h-8 w-56 pl-8 text-xs" aria-label="Search" />
                </div>
                {(drillLabel || only) && (
                  <span className="flex flex-wrap items-center gap-1">
                    {drillLabel && (
                      <button type="button" onClick={() => set({ customer: null, vehicle: null, drill: null })} className="flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs text-foreground hover:bg-muted/70">
                        {drillLabel} <X className="size-3" />
                      </button>
                    )}
                    {only && (
                      <button type="button" onClick={() => set({ only: null })} className="flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs text-foreground hover:bg-muted/70">
                        {only === 'loss' ? 'Losing trips' : 'No price'} <X className="size-3" />
                      </button>
                    )}
                  </span>
                )}
              </div>
              <PeriodControl preset={preset} from={range.from} to={range.to} onChange={({ preset: p, from, to }) => set({ preset: p === 'this_month' ? null : p, from: p === 'custom' ? from : null, to: p === 'custom' ? to : null })} />
            </>
          }
          footer={
            <>
              <span className="text-muted-foreground">
                {d?.meta.total ?? 0} {group === 'trip' ? 'trips' : GROUP_LABEL[group].toLowerCase()}
                {d && (only || drillLabel || params.get('q')) && ` · margin ${formatMoney(d.filtered.margin)} (${formatPct(d.filtered.marginPct)})`}
                {d?.meta.truncated && ' · showing the latest 5,000 trips; narrow the dates'}
                {' · '}Completed and invoiced trips, dated when they finished. Salaries and truck running costs are in Vehicle P&amp;L.
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
          <table className="w-full min-w-[860px] text-xs">
            <thead className="sticky top-0 z-10 bg-card text-[11px] text-muted-foreground">
              <tr className="border-b text-left">
                {group === 'trip' ? (
                  <>
                    <SortHead k="date">Date</SortHead>
                    <th className="px-3 py-2 font-medium">Trip</th>
                    <th className="px-3 py-2 font-medium">Customer</th>
                    <th className="px-3 py-2 font-medium">Lane</th>
                    <th className="px-3 py-2 font-medium">Truck</th>
                  </>
                ) : (
                  <>
                    <th className="px-3 py-2 font-medium">{GROUP_LABEL[group].slice(0, -1)}</th>
                    <th className="px-3 py-2 text-right font-medium">Trips</th>
                    <th className="px-3 py-2 text-right font-medium">Losing</th>
                  </>
                )}
                <SortHead k="revenue" className="text-right">Revenue</SortHead>
                <th className="px-3 py-2 text-right font-medium">Cost</th>
                <SortHead k="margin" className="text-right">Margin</SortHead>
                <SortHead k="margin_pct" className="text-right">Margin %</SortHead>
              </tr>
            </thead>
            <tbody>
              {res.isLoading &&
                Array.from({ length: 8 }, (_, i) => (
                  <tr key={i} className="border-b border-border/60">
                    <td colSpan={cols} className="px-3 py-2">
                      <Skeleton className="h-5 w-full" />
                    </td>
                  </tr>
                ))}
              {!res.isLoading && (d?.rows.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={cols} className="px-3 py-12 text-center">
                    <TrendingDown className="mx-auto mb-2 size-5 text-muted-foreground" />
                    <p className="text-sm font-medium text-foreground">No earned trips here</p>
                    <p className="mt-1 text-xs text-muted-foreground">Trips count once they're completed or invoiced. Try another period or clear the filters.</p>
                  </td>
                </tr>
              )}
              {tripRows.map((t) => (
                <tr key={t.id} onClick={() => setViewing(t)} className={cn('cursor-pointer border-b border-border/60 hover:bg-muted/40', viewing?.id === t.id && 'bg-muted/60')}>
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{formatDate(t.day)}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-medium text-foreground">
                    {t.refId ?? '—'}
                    {t.thirdParty && <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">3PL</span>}
                  </td>
                  <td className="max-w-[180px] truncate px-3 py-2">{t.customer}</td>
                  <td className="max-w-[220px] truncate px-3 py-2 text-muted-foreground" title={t.lane}>{t.lane}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{t.vehicle ?? '—'}</td>
                  <td className="fin-num whitespace-nowrap px-3 py-2 text-right">{formatMoney(t.revenue)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <span className="fin-num">{formatMoney(t.cost)}</span>
                    <CostBar p={t} className="mt-1 ml-auto w-20" />
                  </td>
                  <MarginCell margin={t.margin} pct={t.marginPct} />
                </tr>
              ))}
              {groupRows.map((g) => (
                <tr key={g.key} onClick={() => drill(g)} className="cursor-pointer border-b border-border/60 hover:bg-muted/40" title="Show its trips">
                  <td className="max-w-[320px] truncate px-3 py-2 font-medium text-foreground">{g.label}</td>
                  <td className="fin-num px-3 py-2 text-right">{g.trips}</td>
                  <td className={cn('fin-num px-3 py-2 text-right', g.lossTrips > 0 ? TONE_CLASSES.negative.fg : 'text-muted-foreground')}>{g.lossTrips || '—'}</td>
                  <td className="fin-num whitespace-nowrap px-3 py-2 text-right">{formatMoney(g.revenue)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <span className="fin-num">{formatMoney(g.cost)}</span>
                    <CostBar p={g} className="mt-1 ml-auto w-20" />
                  </td>
                  <MarginCell margin={g.margin} pct={g.marginPct} />
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollTableCard>
      </div>

      {/* One trip's breakdown */}
      <Sheet open={viewing !== null} onOpenChange={(o) => !o && setViewing(null)}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
          {viewing && (
            <>
              <div className="space-y-2 border-b p-5 pr-14">
                <div className="flex flex-wrap items-center gap-2">
                  <SheetTitle className="text-base">{viewing.refId ?? 'Trip'}</SheetTitle>
                  <Chip tone={marginTone(viewing.margin, viewing.marginPct)} size="sm">
                    {viewing.marginPct === null ? 'No price' : `${formatPct(viewing.marginPct)} margin`}
                  </Chip>
                </div>
                <SheetDescription className="text-xs">
                  {formatDate(viewing.day)} · {viewing.customer} · {viewing.lane}
                </SheetDescription>
              </div>
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5 text-xs">
                <CostBar p={viewing} className="h-2.5" />
                <dl className="space-y-1.5">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Billing</dt>
                    <dd className="fin-num font-medium text-foreground">{formatMoney(viewing.revenue)}</dd>
                  </div>
                  {(Object.keys(PART) as (keyof typeof PART)[]).map((k) => (
                    <div key={k} className="flex justify-between gap-3">
                      <dt className="flex items-center gap-1.5 text-muted-foreground">
                        <span className={cn('size-1.5 rounded-full', TONE_CLASSES[PART[k].tone].dot)} />
                        {PART[k].label}
                        {k === 'driverPay' && viewing.driver ? ` · ${viewing.driver}` : ''}
                      </dt>
                      <dd className="fin-num text-foreground">{viewing[k] > 0.005 ? `−${formatMoney(viewing[k])}` : '—'}</dd>
                    </div>
                  ))}
                  <div className="flex justify-between gap-3 border-t pt-1.5">
                    <dt className="font-semibold text-foreground">Margin</dt>
                    <dd className={cn('fin-num font-semibold', TONE_CLASSES[marginTone(viewing.margin, viewing.marginPct)].fg)}>{formatMoney(viewing.margin)}</dd>
                  </div>
                </dl>
                {viewing.revenue <= 0.005 && <p className={cn('text-xs', TONE_CLASSES.warning.fg)}>This trip has no billing amount. Set its price on the trip so it's counted properly.</p>}
                <p className="text-[11px] text-muted-foreground">Driver salaries and truck running costs (insurance, maintenance, depreciation) aren't per trip; they're in Vehicle P&amp;L.</p>
                <Link to={`/trips/${viewing.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-foreground underline underline-offset-2">
                  Open trip <ExternalLink className="size-3" />
                </Link>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </DashboardLayout>
  );
}
