import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, Download, GitCompareArrows, Search, Settings2 } from 'lucide-react';

import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import ExportModal, { type ExportColumn } from '@/components/ui/ExportModal';
import { PeriodControl } from '@/components/finance/kit/PeriodControl';
import { ReportViewState } from '@/components/finance/kit/ReportViewState';
import { ScrollTableCard } from '@/components/finance/kit/ScrollTableCard';
import { StatusTabs } from '@/components/finance/kit/StatusTabs';
import { TONE_CLASSES, toneDotVar } from '@/components/finance/kit/tones';
import { ProfitBridge } from '@/components/fleet/pnl/ProfitBridge';
import { CostMixBar, CostMixLegend } from '@/components/fleet/pnl/CostMixBar';
import { VehiclePnlSheet } from '@/components/fleet/pnl/VehiclePnlSheet';
import { vehicleService, type FleetVehiclePnl } from '@/services/vehicleService';
import { resolvePeriodPreset, type PeriodPreset } from '@/lib/finance/pnlPeriodHelpers';
import { formatDate } from '@/lib/finance/format';
import { matchesSearch } from '@/lib/search';
import { hasIssues, monthShort, pctLabel, previousPeriod, sar0, signed0, truckIssues } from '@/lib/vehiclePnl';
import { cn } from '@/lib/utils';

type Tab = 'all' | 'profitable' | 'loss' | 'idle' | 'gaps';
type SortKey = 'plate_number' | 'revenue' | 'total_costs' | 'net_profit' | 'margin_percent' | 'trips_count';

const TAB_TEST: Record<Tab, (r: FleetVehiclePnl) => boolean> = {
  all: () => true,
  profitable: (r) => r.active && r.net_profit > 0,
  loss: (r) => r.active && r.net_profit < 0,
  idle: (r) => !r.active,
  gaps: (r) => hasIssues(r.flags),
};

const cell = 'px-3 py-2 align-middle';

/** Net profit per month as tiny bars: green above the middle line, red below. */
function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(1, ...values.map(Math.abs));
  const h = (v: number) => `${Math.max(v === 0 ? 0 : 8, (Math.abs(v) / max) * 100)}%`;
  return (
    <div className="flex h-7 w-20 gap-px" aria-hidden>
      {values.map((v, i) => (
        <div key={i} className="flex flex-1 flex-col">
          <div className="flex h-1/2 items-end border-b border-border/70">
            {v > 0 && <span className="block w-full rounded-t-[1px]" style={{ height: h(v), background: toneDotVar('positive') }} />}
          </div>
          <div className="flex h-1/2 items-start">
            {v < 0 && <span className="block w-full rounded-b-[1px]" style={{ height: h(v), background: toneDotVar('negative') }} />}
          </div>
        </div>
      ))}
    </div>
  );
}

function SortHead({ label, k, sort, onSort, className }: { label: string; k: SortKey; sort: { key: SortKey; dir: 'asc' | 'desc' }; onSort: (k: SortKey) => void; className?: string }) {
  const on = sort.key === k;
  const Icon = on ? (sort.dir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th className={cn(cell, 'py-2 font-semibold', className)}>
      <button type="button" onClick={() => onSort(k)} className={cn('inline-flex items-center gap-1 rounded outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring', on ? 'text-foreground' : 'text-muted-foreground')}>
        {label} <Icon className={cn('size-3', !on && 'opacity-40')} />
      </button>
    </th>
  );
}

export default function VehicleFinancialsPage() {
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

  const preset = (params.get('period') as PeriodPreset) || 'this_month';
  const presetRange = preset === 'custom' ? { from: '', to: '' } : resolvePeriodPreset(preset);
  const from = params.has('from') ? params.get('from')! : presetRange.from;
  const to = params.has('to') ? params.get('to')! : presetRange.to;
  const allTime = !from && !to;
  const comparing = params.get('compare') === '1' && !allTime;
  const tab = (params.get('tab') as Tab) || 'all';
  const sort = { key: (params.get('sort') as SortKey) || 'net_profit', dir: (params.get('dir') as 'asc' | 'desc') || 'desc' };
  const search = params.get('q') ?? '';

  const [selected, setSelected] = useState<FleetVehiclePnl | null>(null);
  const [exportOpen, setExportOpen] = useState(false);

  const range = allTime ? {} : { from, to };
  const prev = !allTime ? previousPeriod(from, to) : null;
  const report = useQuery({
    queryKey: ['fleet-financials', from, to],
    queryFn: () => vehicleService.getFleetFinancials(range),
  });
  const prior = useQuery({
    queryKey: ['fleet-financials', prev?.from, prev?.to],
    queryFn: () => vehicleService.getFleetFinancials(prev!),
    enabled: comparing && prev !== null,
  });

  const data = report.data;
  const priorByTruck = useMemo(() => new Map((comparing ? prior.data?.vehicles ?? [] : []).map((v) => [v.vehicle_id, v])), [comparing, prior.data]);
  const compareLabel = prev ? `${formatDate(prev.from)} – ${formatDate(prev.to)}` : undefined;
  const months = data ? data.monthly.length : 0;

  const counts = useMemo(() => {
    const rows = data?.vehicles ?? [];
    return Object.fromEntries((Object.keys(TAB_TEST) as Tab[]).map((t) => [t, rows.filter(TAB_TEST[t]).length])) as Record<Tab, number>;
  }, [data]);

  const rows = useMemo(() => {
    const list = (data?.vehicles ?? []).filter(TAB_TEST[tab]).filter((r) => matchesSearch(search, [r.plate_number, r.ref_id, r.driver?.name, r.asset_type]));
    const dir = sort.dir === 'asc' ? 1 : -1;
    return list.sort((a, b) => {
      if (sort.key === 'plate_number') return a.plate_number.localeCompare(b.plate_number) * dir;
      // Idle trucks have no margin; keep them at the bottom either way
      const av = a[sort.key] ?? Number.NEGATIVE_INFINITY;
      const bv = b[sort.key] ?? Number.NEGATIVE_INFINITY;
      return ((av as number) - (bv as number)) * dir || a.plate_number.localeCompare(b.plate_number);
    });
  }, [data, tab, search, sort.key, sort.dir]);

  const onSort = (k: SortKey) => set({ sort: k, dir: sort.key === k && sort.dir === 'desc' ? 'asc' : k === 'plate_number' && sort.key !== k ? 'asc' : 'desc' });

  const f = data?.summary.flags;
  const gaps = f
    ? [
        f.missing_billing_trips > 0 && { key: 'billing', tone: 'negative' as const, label: `${f.missing_billing_trips} trips without billing`, onClick: () => set({ tab: 'gaps' }) },
        f.missing_driver_pay_trips > 0 && { key: 'pay', tone: 'warning' as const, label: `${f.missing_driver_pay_trips} trips without driver pay`, onClick: () => set({ tab: 'gaps' }) },
        f.trucks_without_fuel > 0 && { key: 'fuel', tone: 'warning' as const, label: `${f.trucks_without_fuel} working trucks with no fuel recorded`, onClick: () => set({ tab: 'gaps' }) },
        f.trucks_without_cost_profile > 0 && { key: 'own', tone: 'neutral' as const, label: `${f.trucks_without_cost_profile} trucks without ownership costs`, to: '/vehicles/financials/setup?tab=trucks&missing=1' },
        f.drivers_without_salary > 0 && { key: 'salary', tone: 'neutral' as const, label: `${f.drivers_without_salary} drivers without a salary`, to: '/vehicles/financials/setup?tab=drivers&missing=1' },
      ].filter(Boolean) as { key: string; tone: 'negative' | 'warning' | 'neutral'; label: string; onClick?: () => void; to?: string }[]
    : [];

  const exportColumns: ExportColumn<FleetVehiclePnl>[] = [
    { id: 'plate', label: 'Truck', accessor: (r) => r.plate_number },
    { id: 'type', label: 'Type', accessor: (r) => r.asset_type },
    { id: 'driver', label: 'Driver', accessor: (r) => r.driver?.name ?? '' },
    { id: 'trips', label: 'Trips', accessor: (r) => r.trips_count },
    { id: 'revenue', label: 'Revenue (SAR)', accessor: (r) => r.revenue },
    { id: 'driver_pay', label: 'Trip pay', accessor: (r) => r.driver_pay },
    { id: 'fuel', label: 'Fuel', accessor: (r) => r.fuel },
    { id: 'maintenance', label: 'Maintenance and tyres', accessor: (r) => r.maintenance },
    { id: 'tolls', label: 'Tolls and parking', accessor: (r) => r.tolls },
    { id: 'other', label: 'Other direct', accessor: (r) => r.other },
    { id: 'contribution', label: 'Contribution', accessor: (r) => r.contribution },
    { id: 'salary', label: 'Salary share', accessor: (r) => r.salary },
    { id: 'depreciation', label: 'Depreciation', accessor: (r) => r.depreciation },
    { id: 'fixed', label: 'Insurance and fees', accessor: (r) => r.fixed_costs },
    { id: 'net', label: 'Net profit', accessor: (r) => r.net_profit },
    { id: 'margin', label: 'Margin %', accessor: (r) => r.margin_percent ?? '' },
  ];

  const periodLabel = allTime ? 'All time' : `${formatDate(from)} – ${formatDate(to)}`;

  return (
    <DashboardLayout active="Vehicle P&L" title="Vehicle P&L" fixedViewport>
      <div className="mx-auto flex h-full w-full max-w-[1400px] min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4 max-md:h-auto max-md:overflow-y-auto">
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <PeriodControl
            preset={preset}
            from={from}
            to={to}
            allowAll
            // Presets are recomputed on load; only a custom range (or "Any date", an empty one) is stored
            onChange={(p) => set({ period: p.preset, from: p.preset === 'custom' ? p.from : null, to: p.preset === 'custom' ? p.to : null })}
          />
          <Button
            variant={comparing ? 'secondary' : 'outline'}
            size="sm"
            className="h-8 gap-1.5 text-xs"
            disabled={allTime}
            onClick={() => set({ compare: comparing ? null : '1' })}
            title={prev ? `Compare with ${compareLabel}` : 'Pick a period to compare'}
          >
            <GitCompareArrows className="size-3.5" /> {comparing ? `vs ${compareLabel}` : 'Compare'}
          </Button>
          <div className="relative w-56 max-sm:w-full">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => set({ q: e.target.value })} placeholder="Truck, driver or type" className="h-8 pl-8 text-xs" aria-label="Search trucks" />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" asChild className="h-8 gap-1.5 text-xs">
              <Link to="/vehicles/financials/setup">
                <Settings2 className="size-3.5" /> Cost setup
              </Link>
            </Button>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" disabled={!data} onClick={() => setExportOpen(true)}>
              <Download className="size-3.5" /> Export
            </Button>
          </div>
        </div>

        <ReportViewState isLoading={report.isLoading} isError={report.isError} onRetry={() => report.refetch()} isEmpty={Boolean(data && data.vehicles.length === 0)} emptyTitle="No trucks yet" emptyDescription="Add trucks under Vehicles to see their profit and loss here.">
          {data && (
            <>
              <ProfitBridge
                totals={data.summary}
                compare={comparing ? prior.data?.summary ?? null : null}
                compareLabel={compareLabel}
                aside={
                  <>
                    <span className="text-muted-foreground">
                      <span className="fin-num font-semibold text-foreground">{data.summary.active_count}</span> of {data.summary.vehicles_count} trucks worked ·{' '}
                      <span className="fin-num font-semibold text-foreground">{data.summary.trips_count}</span> trips
                    </span>
                    {data.summary.unallocated_salary > 0 && (
                      <Link
                        to="/vehicles/financials/setup?tab=drivers"
                        className={cn('underline-offset-2 hover:underline', TONE_CLASSES.warning.fg)}
                        title={data.unallocated_salary.map((u) => `${u.driver_name} · ${monthShort(u.month)} · ${sar0(u.amount)}`).join('\n')}
                      >
                        {sar0(data.summary.unallocated_salary)} salary not on any truck
                      </Link>
                    )}
                  </>
                }
              />

              {gaps.length > 0 && (
                <div className="flex shrink-0 flex-wrap items-center gap-1.5 text-xs">
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <AlertTriangle className="size-3.5" /> Missing data, so these figures are incomplete:
                  </span>
                  {gaps.map((g) =>
                    g.to ? (
                      <Link key={g.key} to={g.to} className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        <Chip tone={g.tone} size="sm" className="cursor-pointer hover:brightness-95">{g.label}</Chip>
                      </Link>
                    ) : (
                      <button key={g.key} type="button" onClick={g.onClick} className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        <Chip tone={g.tone} size="sm" className="cursor-pointer hover:brightness-95">{g.label}</Chip>
                      </button>
                    ),
                  )}
                </div>
              )}

              <ScrollTableCard
                toolbar={
                  <>
                    <StatusTabs
                      value={tab}
                      onChange={(k) => set({ tab: k === 'all' ? null : k })}
                      tabs={[
                        { key: 'all', label: 'All', count: counts.all },
                        { key: 'profitable', label: 'Profitable', count: counts.profitable, badgeClass: cn(TONE_CLASSES.positive.bg, TONE_CLASSES.positive.fg) },
                        { key: 'loss', label: 'Loss', count: counts.loss, badgeClass: counts.loss ? cn(TONE_CLASSES.negative.bg, TONE_CLASSES.negative.fg) : undefined },
                        { key: 'idle', label: 'Idle', count: counts.idle },
                        { key: 'gaps', label: 'Missing data', count: counts.gaps, badgeClass: counts.gaps ? cn(TONE_CLASSES.warning.bg, TONE_CLASSES.warning.fg) : undefined },
                      ]}
                    />
                    <CostMixLegend />
                  </>
                }
                footer={
                  <>
                    <span className="text-muted-foreground">
                      {rows.length === data.vehicles.length ? `${rows.length} trucks` : `${rows.length} of ${data.vehicles.length} trucks`} · {periodLabel}
                    </span>
                    <span className="text-muted-foreground">
                      Salary, depreciation and fees counted to {formatDate(data.range.accrued_to)} · click a truck for details
                    </span>
                  </>
                }
              >
                {rows.length === 0 ? (
                  <p className="p-10 text-center text-xs text-muted-foreground">No trucks match this view.</p>
                ) : (
                  <table className="w-full min-w-[980px] text-left text-xs">
                    <thead className="sticky top-0 z-10 border-b bg-background shadow-xs">
                      <tr>
                        <th className={cn(cell, 'w-10 py-2 font-semibold text-muted-foreground')}>#</th>
                        <SortHead label="Truck" k="plate_number" sort={sort} onSort={onSort} />
                        <th className={cn(cell, 'py-2 font-semibold text-muted-foreground')}>Where the money went</th>
                        <SortHead label="Revenue" k="revenue" sort={sort} onSort={onSort} className="text-right" />
                        <SortHead label="Costs" k="total_costs" sort={sort} onSort={onSort} className="text-right" />
                        <SortHead label="Net profit" k="net_profit" sort={sort} onSort={onSort} className="text-right" />
                        <SortHead label="Margin" k="margin_percent" sort={sort} onSort={onSort} className="text-right" />
                        <SortHead label="Trips" k="trips_count" sort={sort} onSort={onSort} className="text-right" />
                        {comparing && <th className={cn(cell, 'py-2 text-right font-semibold text-muted-foreground')}>vs before</th>}
                        {months >= 3 && <th className={cn(cell, 'py-2 font-semibold text-muted-foreground')}>By month</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => {
                        const issues = truckIssues(r.flags);
                        const before = priorByTruck.get(r.vehicle_id);
                        const delta = before ? r.net_profit - before.net_profit : null;
                        return (
                          <tr
                            key={r.vehicle_id}
                            onClick={() => setSelected(r)}
                            onKeyDown={(e) => e.key === 'Enter' && setSelected(r)}
                            tabIndex={0}
                            className={cn('cursor-pointer border-b border-border/60 outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted/60', !r.active && 'text-muted-foreground')}
                          >
                            <td className={cn(cell, 'fin-num text-muted-foreground')}>{i + 1}</td>
                            <td className={cell}>
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium text-foreground">{r.plate_number}</span>
                                {issues.length > 0 && (
                                  <span title={issues.map((x) => x.label).join('\n')} className={TONE_CLASSES[issues[0].tone === 'negative' ? 'negative' : 'warning'].fg}>
                                    <AlertTriangle className="size-3" aria-label={issues.map((x) => x.label).join(', ')} />
                                  </span>
                                )}
                              </div>
                              <p className="max-w-52 truncate text-[11px] text-muted-foreground">
                                {r.asset_type}
                                {r.driver ? ` · ${r.driver.name}` : ''}
                              </p>
                            </td>
                            <td className={cn(cell, 'w-[22%]')}>
                              <CostMixBar b={r} />
                            </td>
                            <td className={cn(cell, 'fin-num text-right text-foreground')}>{r.revenue ? sar0(r.revenue) : '—'}</td>
                            <td className={cn(cell, 'fin-num text-right')}>{r.total_costs ? sar0(r.total_costs) : '—'}</td>
                            <td className={cn(cell, 'fin-num text-right font-semibold', r.net_profit < -0.5 ? TONE_CLASSES.negative.fg : r.net_profit > 0.5 ? TONE_CLASSES.positive.fg : 'text-muted-foreground')}>
                              {r.active || r.total_costs ? signed0(r.net_profit) : '—'}
                            </td>
                            <td className={cn(cell, 'fin-num text-right', (r.margin_percent ?? 0) < 0 && TONE_CLASSES.negative.fg)}>{pctLabel(r.margin_percent)}</td>
                            <td className={cn(cell, 'fin-num text-right')}>{r.trips_count || '—'}</td>
                            {comparing && (
                              <td className={cn(cell, 'fin-num text-right', delta !== null && delta < -0.5 ? TONE_CLASSES.negative.fg : delta !== null && delta > 0.5 ? TONE_CLASSES.positive.fg : 'text-muted-foreground')}>
                                {delta === null || Math.abs(delta) < 0.5 ? '—' : `${delta > 0 ? '▲' : '▼'} ${sar0(Math.abs(delta))}`}
                              </td>
                            )}
                            {months >= 3 && (
                              <td className={cell}>
                                <Sparkline values={r.monthly} />
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </ScrollTableCard>
            </>
          )}
        </ReportViewState>
      </div>

      <VehiclePnlSheet row={selected} from={data?.range.from ?? from} to={data?.range.to ?? to} onClose={() => setSelected(null)} />

      <ExportModal
        isOpen={exportOpen}
        onClose={() => setExportOpen(false)}
        title="Export vehicle P&L"
        subtitle={`${periodLabel} · ${rows.length} trucks`}
        data={rows}
        columns={exportColumns}
        filename={`Vehicle_PnL_${data?.range.from ?? 'all'}_${data?.range.to ?? ''}`}
      />
    </DashboardLayout>
  );
}
