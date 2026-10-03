import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Download, GitCompareArrows, Settings2, Truck, UserRound } from 'lucide-react';
import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, XAxis, YAxis } from 'recharts';

import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import ExportModal, { type ExportColumn } from '@/components/ui/ExportModal';
import { PeriodControl } from '@/components/finance/kit/PeriodControl';
import { ReportViewState } from '@/components/finance/kit/ReportViewState';
import { ScrollTableCard } from '@/components/finance/kit/ScrollTableCard';
import { StatusTabs } from '@/components/finance/kit/StatusTabs';
import { TONE_CLASSES, toneDotVar } from '@/components/finance/kit/tones';
import { PnlStatement } from '@/components/fleet/pnl/PnlStatement';
import { PNL_API_OUTDATED, vehicleService, type PnlCostLine, type VehiclePnl } from '@/services/vehicleService';
import { resolvePeriodPreset, type PeriodPreset } from '@/lib/finance/pnlPeriodHelpers';
import { formatDate } from '@/lib/finance/format';
import { COST_LINE_LABEL, COST_LINE_TONE, compact, monthShort, previousPeriod, sar0, signed0, truckIssues, type StatementKey } from '@/lib/vehiclePnl';
import { cn } from '@/lib/utils';

type LedgerTab = 'trips' | 'costs' | 'salary' | 'ownership';

/** Which ledger a statement line's detail lives in (and, for costs, which line). */
const ROW_TARGET: Partial<Record<StatementKey, { tab: LedgerTab; line?: PnlCostLine }>> = {
  revenue: { tab: 'trips' },
  driver_pay: { tab: 'trips' },
  fuel: { tab: 'costs', line: 'fuel' },
  maintenance: { tab: 'costs', line: 'maintenance' },
  tolls: { tab: 'costs', line: 'tolls' },
  other: { tab: 'costs', line: 'other' },
  salary: { tab: 'salary' },
  depreciation: { tab: 'ownership' },
  fixed_costs: { tab: 'ownership' },
};

const SOURCE_LABEL = { expense: 'Expense', maintenance: 'Maintenance', bill: 'Bill' } as const;
const cell = 'px-3 py-2 align-top';
const th = 'px-3 py-2 font-semibold text-muted-foreground';

const chart: ChartConfig = {
  revenue: { label: 'Revenue', color: toneDotVar('teal') },
  direct_costs: { label: 'Direct costs', color: toneDotVar('orange') },
  overhead: { label: 'Salary and ownership', color: toneDotVar('neutral') },
  net_profit: { label: 'Net profit', color: toneDotVar('positive') },
};

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0 rounded-lg border bg-card px-3 py-2" title={hint}>
      <p className="truncate text-[11px] text-muted-foreground">{label}</p>
      <p className="fin-num truncate text-base font-semibold leading-tight">{value}</p>
    </div>
  );
}

function MonthlyChart({ data }: { data: VehiclePnl['monthly'] }) {
  return (
    <ChartContainer config={chart} className="aspect-auto h-full min-h-40 w-full">
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.6} />
        <XAxis dataKey="month" tickFormatter={monthShort} tickLine={false} axisLine={false} fontSize={11} />
        <YAxis tickFormatter={compact} tickLine={false} axisLine={false} fontSize={11} width={44} />
        <ReferenceLine y={0} stroke="var(--border)" />
        <ChartTooltip
          cursor={{ fill: 'var(--muted)', opacity: 0.5 }}
          content={({ active, payload }) => {
            const p = active ? payload?.[0]?.payload : null;
            if (!p) return null;
            return (
              <div className="min-w-44 rounded-lg border bg-background px-3 py-2 text-xs shadow-md">
                <p className="mb-1 font-medium">{monthShort(p.month)}</p>
                {(['revenue', 'direct_costs', 'overhead'] as const).map((k) => (
                  <p key={k} className="flex justify-between gap-3 text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: `var(--color-${k})` }} />{chart[k].label}</span>
                    <span className="fin-num text-foreground">{sar0(p[k])}</span>
                  </p>
                ))}
                <p className={cn('mt-1 flex justify-between border-t pt-1 font-semibold', p.net_profit < 0 ? TONE_CLASSES.negative.fg : TONE_CLASSES.positive.fg)}>
                  <span>Net profit</span>
                  <span className="fin-num">{signed0(p.net_profit)}</span>
                </p>
              </div>
            );
          }}
        />
        <Bar dataKey="revenue" fill="var(--color-revenue)" radius={[3, 3, 0, 0]} maxBarSize={28} isAnimationActive={false} />
        <Bar dataKey="direct_costs" stackId="cost" fill="var(--color-direct_costs)" maxBarSize={28} isAnimationActive={false} />
        <Bar dataKey="overhead" stackId="cost" fill="var(--color-overhead)" radius={[3, 3, 0, 0]} maxBarSize={28} isAnimationActive={false} />
        <Line dataKey="net_profit" stroke="var(--color-net_profit)" strokeWidth={2} dot={{ r: 2.5 }} isAnimationActive={false} />
      </ComposedChart>
    </ChartContainer>
  );
}

export default function VehicleSingleFinancialsPage() {
  const { id } = useParams<{ id: string }>();
  const [params, setParams] = useSearchParams();
  const set = (patch: Record<string, string | null>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v === null || v === '') next.delete(k);
          else next.set(k, v);
        }
        return next;
      },
      { replace: true },
    );

  // Opened from the fleet page with an explicit range; otherwise this year, so the trend has months
  const explicit = params.has('from') || params.has('to');
  const preset = (params.get('period') as PeriodPreset) || (explicit ? 'custom' : 'this_year');
  const presetRange = preset === 'custom' ? { from: '', to: '' } : resolvePeriodPreset(preset);
  const from = params.has('from') ? params.get('from')! : presetRange.from;
  const to = params.has('to') ? params.get('to')! : presetRange.to;
  const allTime = !from && !to;
  const comparing = params.get('compare') === '1' && !allTime;
  const tab = (params.get('ledger') as LedgerTab) || 'trips';
  const line = (params.get('line') as PnlCostLine | null) ?? null;
  const [activeRow, setActiveRow] = useState<StatementKey | null>(null);
  const [exportOpen, setExportOpen] = useState(false);

  const prev = !allTime ? previousPeriod(from, to) : null;
  const compareLabel = prev ? `${formatDate(prev.from)} – ${formatDate(prev.to)}` : undefined;
  const report = useQuery({
    queryKey: ['vehicle-financials', id, from, to],
    queryFn: () => vehicleService.getFinancials(id!, allTime ? {} : { from, to }),
    enabled: Boolean(id),
  });
  const prior = useQuery({
    queryKey: ['vehicle-financials', id, prev?.from, prev?.to],
    queryFn: () => vehicleService.getFinancials(id!, prev!),
    enabled: Boolean(id) && comparing && prev !== null,
  });
  const data = report.data;

  const onRow = (key: StatementKey) => {
    const target = ROW_TARGET[key];
    if (!target) return;
    setActiveRow(key);
    set({ ledger: target.tab === 'trips' ? null : target.tab, line: target.line ?? null });
  };

  const costs = useMemo(() => (data?.ledger.costs ?? []).filter((c) => !line || c.line === line), [data, line]);
  const issues = data ? truckIssues(data.flags) : [];
  const ownershipRows = data ? data.ledger.fixed_costs.length + (data.vehicle.purchase_price ? 1 : 0) : 0;

  const tripExport: ExportColumn<VehiclePnl['ledger']['trips'][number]>[] = [
    { id: 'day', label: 'Date', accessor: (r) => r.day },
    { id: 'ref', label: 'Trip', accessor: (r) => r.ref_id ?? '' },
    { id: 'customer', label: 'Customer', accessor: (r) => r.customer },
    { id: 'drivers', label: 'Drivers', accessor: (r) => r.drivers.join(', ') },
    { id: 'revenue', label: 'Revenue (SAR)', accessor: (r) => r.revenue },
    { id: 'pay', label: 'Trip pay (SAR)', accessor: (r) => r.driver_pay },
  ];
  const costExport: ExportColumn<VehiclePnl['ledger']['costs'][number]>[] = [
    { id: 'day', label: 'Date', accessor: (r) => r.day },
    { id: 'source', label: 'Source', accessor: (r) => SOURCE_LABEL[r.source] },
    { id: 'ref', label: 'Reference', accessor: (r) => r.ref_id ?? '' },
    { id: 'line', label: 'P&L line', accessor: (r) => COST_LINE_LABEL[r.line] },
    { id: 'category', label: 'Category', accessor: (r) => r.category },
    { id: 'description', label: 'Description', accessor: (r) => r.description ?? '' },
    { id: 'amount', label: 'Amount (SAR)', accessor: (r) => r.amount },
  ];

  const periodLabel = data ? `${formatDate(data.range.from)} – ${formatDate(data.range.to)}` : '';

  return (
    <DashboardLayout active="Vehicle P&L" title={data ? `${data.vehicle.plate_number} · P&L` : 'Truck P&L'} fixedViewport>
      <div className="mx-auto flex h-full w-full max-w-[1400px] min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4 max-lg:h-auto max-lg:overflow-y-auto">
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" asChild className="h-8 gap-1.5 px-2 text-xs text-muted-foreground">
            <Link to="/vehicles/financials">
              <ArrowLeft className="size-3.5" /> Vehicle P&L
            </Link>
          </Button>
          <PeriodControl
            preset={preset}
            from={from}
            to={to}
            allowAll
            onChange={(p) => set({ period: p.preset, from: p.preset === 'custom' ? p.from : null, to: p.preset === 'custom' ? p.to : null })}
          />
          <Button variant={comparing ? 'secondary' : 'outline'} size="sm" className="h-8 gap-1.5 text-xs" disabled={allTime} onClick={() => set({ compare: comparing ? null : '1' })}>
            <GitCompareArrows className="size-3.5" /> {comparing ? `vs ${compareLabel}` : 'Compare'}
          </Button>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" asChild className="h-8 gap-1.5 text-xs">
              <Link to={`/vehicles/financials/setup?truck=${id}`}>
                <Settings2 className="size-3.5" /> Cost setup
              </Link>
            </Button>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" disabled={!data || (tab !== 'trips' && tab !== 'costs')} onClick={() => setExportOpen(true)} title="Export the trips or costs list">
              <Download className="size-3.5" /> Export
            </Button>
          </div>
        </div>

        <ReportViewState isLoading={report.isLoading} isError={report.isError} errorMessage={report.error?.message === PNL_API_OUTDATED ? PNL_API_OUTDATED : undefined} onRetry={() => report.refetch()} isEmpty={false} emptyTitle="" emptyDescription="">
          {data && (
            <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(320px,380px)_minmax(0,1fr)]">
              {/* Left: the truck and its statement */}
              <Card className="flex min-h-0 flex-col gap-3 overflow-y-auto rounded-xl p-4 shadow-xs">
                <div className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-muted">
                    <Truck className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <h1 className="truncate text-lg font-semibold leading-tight">{data.vehicle.plate_number}</h1>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <Chip tone="neutral" size="sm">{data.vehicle.asset_type}</Chip>
                      <span className="inline-flex items-center gap-1">
                        <UserRound className="size-3" />
                        {data.vehicle.driver ? <Link to={`/drivers/${data.vehicle.driver.id}`} className="hover:underline">{data.vehicle.driver.name}</Link> : 'No assigned driver'}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">{periodLabel}</p>
                  </div>
                </div>

                <PnlStatement totals={data.totals} compare={comparing ? prior.data?.totals ?? null : null} compareLabel={compareLabel} active={activeRow} onRow={onRow} />
                <p className="-mt-1 text-[11px] text-muted-foreground">Click a line to see the entries behind it.</p>

                {issues.length > 0 && (
                  <div className="space-y-1.5 border-t pt-3">
                    <p className="flex items-center gap-1 text-xs font-medium">
                      <AlertTriangle className={cn('size-3.5', TONE_CLASSES.warning.fg)} /> Missing data
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {issues.map((i) => {
                        const to = i.key === 'cost_profile' ? `/vehicles/financials/setup?truck=${data.vehicle.id}` : i.key === 'salary' ? '/vehicles/financials/setup?tab=drivers&missing=1' : null;
                        const chip = <Chip tone={i.tone} size="sm">{i.label}</Chip>;
                        return to ? <Link key={i.key} to={to} className="hover:brightness-95">{chip}</Link> : <span key={i.key}>{chip}</span>;
                      })}
                    </div>
                  </div>
                )}
              </Card>

              {/* Right: numbers, trend, ledger */}
              <div className="flex min-h-0 flex-col gap-3">
                <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-4">
                  <Kpi label="Trips" value={String(data.trips_count)} />
                  <Kpi label="Revenue per trip" value={data.revenue_per_trip === null ? '—' : sar0(data.revenue_per_trip)} />
                  <Kpi label="Cost per km" value={data.cost_per_km === null ? '—' : data.cost_per_km.toFixed(2)} hint={data.distance_km ? undefined : 'Trips have no distance recorded yet'} />
                  <Kpi label="Contribution margin" value={data.totals.contribution_percent === null ? '—' : `${data.totals.contribution_percent.toFixed(1)}%`} />
                </div>

                <Card className="h-56 shrink-0 gap-1 rounded-xl p-3 shadow-xs">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold">By month</p>
                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                      {(['revenue', 'direct_costs', 'overhead', 'net_profit'] as const).map((k) => (
                        <span key={k} className="inline-flex items-center gap-1.5">
                          <span className={cn('size-2', k === 'net_profit' ? 'h-0.5 w-3' : 'rounded-full')} style={{ background: chart[k].color }} />
                          {chart[k].label}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="min-h-0 flex-1">
                    <MonthlyChart data={data.monthly} />
                  </div>
                </Card>

                <ScrollTableCard
                  className="min-h-72"
                  toolbar={
                    <>
                      <StatusTabs
                        value={tab}
                        onChange={(k) => {
                          setActiveRow(null);
                          set({ ledger: k === 'trips' ? null : k, line: null });
                        }}
                        tabs={[
                          { key: 'trips', label: 'Trips', count: data.ledger.trips.length },
                          { key: 'costs', label: 'Costs', count: data.ledger.costs.length },
                          { key: 'salary', label: 'Salary', count: data.ledger.salary.length },
                          { key: 'ownership', label: 'Ownership', count: ownershipRows },
                        ]}
                      />
                      {tab === 'costs' && line && (
                        <button type="button" onClick={() => { setActiveRow(null); set({ line: null }); }} className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
                          <Chip tone={COST_LINE_TONE[line]} size="sm">{COST_LINE_LABEL[line]} only ✕</Chip>
                        </button>
                      )}
                    </>
                  }
                >
                  {tab === 'trips' && (
                    data.ledger.trips.length === 0 ? (
                      <p className="p-8 text-center text-xs text-muted-foreground">No completed trips in this period.</p>
                    ) : (
                      <table className="w-full min-w-[640px] text-left text-xs">
                        <thead className="sticky top-0 z-10 border-b bg-background shadow-xs">
                          <tr>
                            <th className={th}>Date</th>
                            <th className={th}>Trip</th>
                            <th className={th}>Drivers</th>
                            <th className={cn(th, 'text-right')}>Revenue</th>
                            <th className={cn(th, 'text-right')}>Trip pay</th>
                            <th className={cn(th, 'text-right')}>After trip pay</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.ledger.trips.map((t) => (
                            <tr key={t.id} className="border-b border-border/60 hover:bg-muted/40">
                              <td className={cn(cell, 'whitespace-nowrap text-muted-foreground')}>{formatDate(t.day)}</td>
                              <td className={cell}>
                                <Link to={`/trips/${t.id}`} className="font-medium hover:underline">{t.ref_id ?? 'Trip'}</Link>
                                <p className="max-w-56 truncate text-[11px] text-muted-foreground">{t.customer}</p>
                              </td>
                              <td className={cn(cell, 'max-w-44 truncate text-muted-foreground')}>{t.drivers.join(', ') || '—'}</td>
                              <td className={cn(cell, 'fin-num text-right')}>{t.revenue > 0 ? sar0(t.revenue) : <Chip tone="negative" size="sm">No billing</Chip>}</td>
                              <td className={cn(cell, 'fin-num text-right')}>{t.driver_pay > 0 ? sar0(t.driver_pay) : <Chip tone="warning" size="sm">No pay</Chip>}</td>
                              <td className={cn(cell, 'fin-num text-right font-medium', t.revenue - t.driver_pay < 0 ? TONE_CLASSES.negative.fg : 'text-foreground')}>{signed0(t.revenue - t.driver_pay)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )
                  )}

                  {tab === 'costs' && (
                    costs.length === 0 ? (
                      <div className="space-y-2 p-8 text-center text-xs text-muted-foreground">
                        <p>{line ? `No ${COST_LINE_LABEL[line].toLowerCase()} costs recorded for this truck in this period.` : 'No costs recorded for this truck in this period.'}</p>
                        <p>Add them under <Link to="/expenses" className="text-foreground underline">Expenses</Link> or <Link to="/maintenance/new" className="text-foreground underline">Maintenance</Link>, with this truck selected.</p>
                      </div>
                    ) : (
                      <table className="w-full min-w-[640px] text-left text-xs">
                        <thead className="sticky top-0 z-10 border-b bg-background shadow-xs">
                          <tr>
                            <th className={th}>Date</th>
                            <th className={th}>Entry</th>
                            <th className={th}>Line</th>
                            <th className={th}>Description</th>
                            <th className={cn(th, 'text-right')}>Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {costs.map((c) => {
                            const href = c.source === 'expense' ? `/expenses/${c.id}` : c.source === 'maintenance' ? `/maintenance/${c.id}` : '/finance/bills';
                            return (
                              <tr key={`${c.source}-${c.id}-${c.description}`} className="border-b border-border/60 hover:bg-muted/40">
                                <td className={cn(cell, 'whitespace-nowrap text-muted-foreground')}>{formatDate(c.day)}</td>
                                <td className={cell}>
                                  <Link to={href} className="font-medium hover:underline">{c.ref_id ?? SOURCE_LABEL[c.source]}</Link>
                                  <p className="text-[11px] text-muted-foreground">{SOURCE_LABEL[c.source]} · {c.category}</p>
                                </td>
                                <td className={cell}><Chip tone={COST_LINE_TONE[c.line]} size="sm">{COST_LINE_LABEL[c.line]}</Chip></td>
                                <td className={cn(cell, 'max-w-64 truncate text-muted-foreground')}>{c.description || '—'}</td>
                                <td className={cn(cell, 'fin-num text-right font-medium')}>{sar0(c.amount)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )
                  )}

                  {tab === 'salary' && (
                    data.ledger.salary.length === 0 ? (
                      <div className="space-y-2 p-8 text-center text-xs text-muted-foreground">
                        <p>No driver salary charged to this truck in this period.</p>
                        <p>Salaries come from <Link to="/vehicles/financials/setup?tab=drivers" className="text-foreground underline">Cost setup</Link> and are split across the trucks each driver drove, by trips.</p>
                      </div>
                    ) : (
                      <table className="w-full min-w-[560px] text-left text-xs">
                        <thead className="sticky top-0 z-10 border-b bg-background shadow-xs">
                          <tr>
                            <th className={th}>Month</th>
                            <th className={th}>Driver</th>
                            <th className={th}>Why this truck</th>
                            <th className={cn(th, 'text-right')}>Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.ledger.salary.map((s) => (
                            <tr key={`${s.driverId}-${s.month}`} className="border-b border-border/60 hover:bg-muted/40">
                              <td className={cn(cell, 'whitespace-nowrap text-muted-foreground')}>{monthShort(s.month)}</td>
                              <td className={cell}><Link to={`/drivers/${s.driverId}`} className="font-medium hover:underline">{s.driver_name}</Link></td>
                              <td className={cn(cell, 'text-muted-foreground')}>
                                {s.basis === 'trips' ? `${s.vehicleTrips} of their ${s.driverTrips} trips that month` : 'Assigned truck, no trips that month'}
                              </td>
                              <td className={cn(cell, 'fin-num text-right font-medium')}>{sar0(s.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )
                  )}

                  {tab === 'ownership' && (
                    ownershipRows === 0 ? (
                      <div className="space-y-3 p-8 text-center text-xs text-muted-foreground">
                        <p>No ownership costs set up for this truck, so its net profit leaves out depreciation, insurance and fees.</p>
                        <Button size="sm" asChild className="h-8 text-xs">
                          <Link to={`/vehicles/financials/setup?truck=${data.vehicle.id}`}>Set up costs</Link>
                        </Button>
                      </div>
                    ) : (
                      <table className="w-full min-w-[560px] text-left text-xs">
                        <thead className="sticky top-0 z-10 border-b bg-background shadow-xs">
                          <tr>
                            <th className={th}>Cost</th>
                            <th className={th}>Basis</th>
                            <th className={cn(th, 'text-right')}>Per month</th>
                            <th className={cn(th, 'text-right')}>This period</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.vehicle.purchase_price ? (
                            <tr className="border-b border-border/60">
                              <td className={cn(cell, 'font-medium')}>Depreciation</td>
                              <td className={cn(cell, 'text-muted-foreground')}>
                                {sar0(data.vehicle.purchase_price)} bought {data.vehicle.purchase_date ? formatDate(data.vehicle.purchase_date) : '—'}, over {data.vehicle.useful_life_years ?? 5} years
                                {data.vehicle.residual_value ? `, resale ${sar0(data.vehicle.residual_value)}` : ''}
                              </td>
                              <td className={cn(cell, 'fin-num text-right')}>{sar0(data.ledger.depreciation.monthly)}</td>
                              <td className={cn(cell, 'fin-num text-right font-medium')}>{sar0(data.ledger.depreciation.amount)}</td>
                            </tr>
                          ) : null}
                          {data.ledger.fixed_costs.map((f) => (
                            <tr key={f.id} className="border-b border-border/60">
                              <td className={cn(cell, 'font-medium')}>{f.label || f.category}</td>
                              <td className={cn(cell, 'text-muted-foreground')}>{f.label ? f.category : 'Recurring cost'}</td>
                              <td className={cn(cell, 'fin-num text-right')}>{sar0(f.monthly)}</td>
                              <td className={cn(cell, 'fin-num text-right font-medium')}>{sar0(f.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )
                  )}
                </ScrollTableCard>
              </div>
            </div>
          )}
        </ReportViewState>
      </div>

      {data && (tab === 'trips' || tab === 'costs') && (
        tab === 'trips' ? (
          <ExportModal isOpen={exportOpen} onClose={() => setExportOpen(false)} title={`Export ${data.vehicle.plate_number} trips`} subtitle={periodLabel} data={data.ledger.trips} columns={tripExport} filename={`${data.vehicle.plate_number}_trips_${data.range.from}_${data.range.to}`} />
        ) : (
          <ExportModal isOpen={exportOpen} onClose={() => setExportOpen(false)} title={`Export ${data.vehicle.plate_number} costs`} subtitle={periodLabel} data={costs} columns={costExport} filename={`${data.vehicle.plate_number}_costs_${data.range.from}_${data.range.to}`} />
        )
      )}
    </DashboardLayout>
  );
}
