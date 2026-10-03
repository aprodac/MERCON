import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Search } from 'lucide-react';

import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ReportViewState } from '@/components/finance/kit/ReportViewState';
import { ScrollTableCard } from '@/components/finance/kit/ScrollTableCard';
import { SegmentedControl } from '@/components/finance/kit/SegmentedControl';
import { TONE_CLASSES, toneDotVar } from '@/components/finance/kit/tones';
import { TruckCostSheet } from '@/components/fleet/pnl/TruckCostSheet';
import { DriverSalarySheet } from '@/components/fleet/pnl/DriverSalarySheet';
import { vehicleService, type CostSetupVehicle } from '@/services/vehicleService';
import { formatDate } from '@/lib/finance/format';
import { matchesSearch } from '@/lib/search';
import { sar0 } from '@/lib/vehiclePnl';
import { cn } from '@/lib/utils';

type Tab = 'trucks' | 'drivers';
const cell = 'px-3 py-2 align-middle';
const th = 'px-3 py-2 font-semibold text-muted-foreground';

/** Depreciation per month as of `today` — 0 before purchase or once fully depreciated. */
function depreciationNow(v: CostSetupVehicle, today: string) {
  if (!v.purchase_price || !v.purchase_date) return 0;
  const life = v.useful_life_years ?? 5;
  const end = `${Number(v.purchase_date.slice(0, 4)) + life}${v.purchase_date.slice(4)}`;
  if (today < v.purchase_date || today >= end) return 0;
  return Math.max(0, v.purchase_price - (v.residual_value ?? 0)) / (life * 12);
}

const hasOwnership = (v: CostSetupVehicle) => Boolean(v.purchase_price) || v.fixed_costs.length > 0;

function Progress({ label, done, total, onClick, active }: { label: string; done: number; total: number; onClick: () => void; active: boolean }) {
  const pct = total > 0 ? (done / total) * 100 : 0;
  const tone = pct >= 100 ? 'positive' : pct >= 50 ? 'warning' : 'negative';
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('min-w-0 flex-1 rounded-lg border px-3 py-2 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring', active ? 'border-foreground/30 bg-muted/40' : 'bg-card')}
    >
      <p className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium">{label}</span>
        <span className="fin-num text-muted-foreground">
          <span className={cn('font-semibold', TONE_CLASSES[tone].fg)}>{done}</span> of {total} set up
        </span>
      </p>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: toneDotVar(tone) }} />
      </div>
    </button>
  );
}

/**
 * Where the costs Vehicle P&L can't find anywhere else are entered: each
 * truck's purchase details and recurring fees, and each driver's monthly
 * salary. Built for filling in a whole fleet: one table per kind, a
 * "missing only" switch, and a side sheet per row.
 */
export default function VehicleCostSetupPage() {
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

  const truckId = params.get('truck');
  const driverId = params.get('driver');
  const tab: Tab = (params.get('tab') as Tab) || (driverId ? 'drivers' : 'trucks');
  const missingOnly = params.get('missing') === '1';
  const search = params.get('q') ?? '';

  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['cost-setup'], queryFn: () => vehicleService.getCostSetup() });
  const today = data?.today ?? new Date().toISOString().slice(0, 10);

  const vehicles = useMemo(
    () => (data?.vehicles ?? []).filter((v) => (!missingOnly || !hasOwnership(v)) && matchesSearch(search, [v.plate_number, v.ref_id, v.asset_type, v.driver?.name])),
    [data, missingOnly, search],
  );
  const drivers = useMemo(
    () => (data?.drivers ?? []).filter((d) => (!missingOnly || !d.current) && matchesSearch(search, [d.name, d.ref_id, d.vehicle?.plate_number])),
    [data, missingOnly, search],
  );

  // The sheets read the live row, so a save shows up without reopening
  const openTruck = data?.vehicles.find((v) => v.id === truckId) ?? null;
  const openDriver = data?.drivers.find((d) => d.id === driverId) ?? null;

  const trucksDone = (data?.vehicles ?? []).filter(hasOwnership).length;
  const driversDone = (data?.drivers ?? []).filter((d) => d.current).length;
  const monthlySalaries = (data?.drivers ?? []).reduce((s, d) => s + (d.current?.monthly_total ?? 0), 0);
  const monthlyOwnership = (data?.vehicles ?? []).reduce((s, v) => s + depreciationNow(v, today) + v.fixed_monthly, 0);

  return (
    <DashboardLayout active="Vehicle P&L" title="Vehicle cost setup" fixedViewport>
      <div className="mx-auto flex h-full w-full max-w-[1400px] min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4 max-md:h-auto max-md:overflow-y-auto">
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" asChild className="h-8 gap-1.5 px-2 text-xs text-muted-foreground">
            <Link to="/vehicles/financials">
              <ArrowLeft className="size-3.5" /> Vehicle P&L
            </Link>
          </Button>
          <h1 className="text-sm font-semibold">Cost setup</h1>
          <p className="text-xs text-muted-foreground max-lg:hidden">Costs that aren’t on any trip or expense: what each truck cost to buy and keep, and each driver’s monthly salary.</p>
        </div>

        <ReportViewState isLoading={isLoading} isError={isError} onRetry={() => refetch()} isEmpty={false} emptyTitle="" emptyDescription="">
          {data && (
            <>
              <Card className="flex shrink-0 flex-col gap-2 rounded-xl p-2.5 shadow-xs md:flex-row md:items-stretch">
                <Progress label="Trucks with ownership costs" done={trucksDone} total={data.vehicles.length} active={tab === 'trucks'} onClick={() => set({ tab: 'trucks' })} />
                <Progress label="Drivers with a salary" done={driversDone} total={data.drivers.length} active={tab === 'drivers'} onClick={() => set({ tab: 'drivers' })} />
                <div className="flex shrink-0 gap-4 px-2 text-xs md:border-l md:pl-4">
                  <div>
                    <p className="text-muted-foreground">Ownership per month</p>
                    <p className="fin-num text-base font-semibold">{sar0(monthlyOwnership)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Salaries per month</p>
                    <p className="fin-num text-base font-semibold">{sar0(monthlySalaries)}</p>
                  </div>
                </div>
              </Card>

              <ScrollTableCard
                toolbar={
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <SegmentedControl
                        aria-label="What to set up"
                        value={tab}
                        onChange={(v) => set({ tab: v === 'trucks' ? null : v })}
                        options={[
                          { value: 'trucks', label: `Trucks (${data.vehicles.length})` },
                          { value: 'drivers', label: `Drivers (${data.drivers.length})` },
                        ]}
                      />
                      <div className="relative w-56 max-sm:w-full">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input value={search} onChange={(e) => set({ q: e.target.value })} placeholder={tab === 'trucks' ? 'Plate, type or driver' : 'Name or truck'} className="h-8 pl-8 text-xs" aria-label="Search" />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch id="missing-only" checked={missingOnly} onCheckedChange={(v) => set({ missing: v ? '1' : null })} />
                      <Label htmlFor="missing-only" className="text-xs">Not set up only</Label>
                    </div>
                  </>
                }
                footer={
                  <span className="text-muted-foreground">
                    {tab === 'trucks'
                      ? `${vehicles.length} trucks · a truck without a purchase price carries no depreciation`
                      : `${drivers.length} drivers · salary is charged to the trucks each driver drove, split by trips`}
                  </span>
                }
              >
                {tab === 'trucks' ? (
                  vehicles.length === 0 ? (
                    <p className="p-10 text-center text-xs text-muted-foreground">{missingOnly ? 'Every truck is set up.' : 'No trucks match.'}</p>
                  ) : (
                    <table className="w-full min-w-[900px] text-left text-xs">
                      <thead className="sticky top-0 z-10 border-b bg-background shadow-xs">
                        <tr>
                          <th className={th}>Truck</th>
                          <th className={cn(th, 'text-right')}>Purchase price</th>
                          <th className={th}>Bought</th>
                          <th className={cn(th, 'text-right')}>Life</th>
                          <th className={cn(th, 'text-right')}>Resale</th>
                          <th className={cn(th, 'text-right')}>Depreciation / mo</th>
                          <th className={cn(th, 'text-right')}>Recurring / mo</th>
                          <th className={cn(th, 'text-right')}>Total / mo</th>
                          <th className={th} />
                        </tr>
                      </thead>
                      <tbody>
                        {vehicles.map((v) => {
                          const dep = depreciationNow(v, today);
                          const done = hasOwnership(v);
                          return (
                            <tr key={v.id} tabIndex={0} onClick={() => set({ truck: v.id, driver: null })} onKeyDown={(e) => e.key === 'Enter' && set({ truck: v.id, driver: null })} className="cursor-pointer border-b border-border/60 outline-none hover:bg-muted/40 focus-visible:bg-muted/60">
                              <td className={cell}>
                                <p className="font-medium">{v.plate_number}</p>
                                <p className="text-[11px] text-muted-foreground">{v.asset_type}{v.driver ? ` · ${v.driver.name}` : ''}</p>
                              </td>
                              <td className={cn(cell, 'fin-num text-right')}>{v.purchase_price ? sar0(v.purchase_price) : '—'}</td>
                              <td className={cn(cell, 'text-muted-foreground')}>{v.purchase_date ? formatDate(v.purchase_date) : '—'}</td>
                              <td className={cn(cell, 'fin-num text-right text-muted-foreground')}>{v.purchase_price ? `${v.useful_life_years ?? 5} yr` : '—'}</td>
                              <td className={cn(cell, 'fin-num text-right text-muted-foreground')}>{v.residual_value ? sar0(v.residual_value) : '—'}</td>
                              <td className={cn(cell, 'fin-num text-right')}>{dep ? sar0(dep) : '—'}</td>
                              <td className={cn(cell, 'fin-num text-right')} title={v.fixed_costs.filter((c) => c.active).map((c) => `${c.label || c.category}: ${sar0(c.amount)} ${c.frequency === 'Yearly' ? 'a year' : 'a month'}`).join('\n')}>
                                {v.fixed_monthly ? sar0(v.fixed_monthly) : '—'}
                              </td>
                              <td className={cn(cell, 'fin-num text-right font-semibold')}>{dep + v.fixed_monthly ? sar0(dep + v.fixed_monthly) : '—'}</td>
                              <td className={cn(cell, 'text-right')}>
                                {done ? <Chip tone="positive" size="sm">Set up</Chip> : <Chip tone="warning" size="sm">Missing</Chip>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )
                ) : drivers.length === 0 ? (
                  <p className="p-10 text-center text-xs text-muted-foreground">{missingOnly ? 'Every driver has a salary.' : 'No drivers match.'}</p>
                ) : (
                  <table className="w-full min-w-[860px] text-left text-xs">
                    <thead className="sticky top-0 z-10 border-b bg-background shadow-xs">
                      <tr>
                        <th className={th}>Driver</th>
                        <th className={th}>Truck</th>
                        <th className={cn(th, 'text-right')}>Base</th>
                        <th className={cn(th, 'text-right')}>Allowances</th>
                        <th className={cn(th, 'text-right')}>Employer costs</th>
                        <th className={cn(th, 'text-right')}>Total / mo</th>
                        <th className={th}>Since</th>
                        <th className={th} />
                      </tr>
                    </thead>
                    <tbody>
                      {drivers.map((d) => (
                        <tr key={d.id} tabIndex={0} onClick={() => set({ driver: d.id, truck: null, tab: 'drivers' })} onKeyDown={(e) => e.key === 'Enter' && set({ driver: d.id, truck: null, tab: 'drivers' })} className="cursor-pointer border-b border-border/60 outline-none hover:bg-muted/40 focus-visible:bg-muted/60">
                          <td className={cell}>
                            <p className="font-medium">{d.name}</p>
                            {d.ref_id && <p className="text-[11px] text-muted-foreground">{d.ref_id}</p>}
                          </td>
                          <td className={cn(cell, 'text-muted-foreground')}>{d.vehicle?.plate_number ?? '—'}</td>
                          <td className={cn(cell, 'fin-num text-right')}>{d.current ? sar0(d.current.base_salary) : '—'}</td>
                          <td className={cn(cell, 'fin-num text-right text-muted-foreground')}>{d.current ? sar0(d.current.allowances) : '—'}</td>
                          <td className={cn(cell, 'fin-num text-right text-muted-foreground')}>{d.current ? sar0(d.current.employer_costs) : '—'}</td>
                          <td className={cn(cell, 'fin-num text-right font-semibold')}>{d.current ? sar0(d.current.monthly_total) : '—'}</td>
                          <td className={cn(cell, 'text-muted-foreground')}>{d.current ? formatDate(d.current.effective_from) : '—'}</td>
                          <td className={cn(cell, 'text-right')}>
                            {d.current ? <Chip tone="positive" size="sm">Set up</Chip> : d.history.length ? <Chip tone="neutral" size="sm">Ended</Chip> : <Chip tone="warning" size="sm">Missing</Chip>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </ScrollTableCard>
            </>
          )}
        </ReportViewState>
      </div>

      <TruckCostSheet vehicle={openTruck} today={today} onClose={() => set({ truck: null })} />
      <DriverSalarySheet driver={openDriver} today={today} onClose={() => set({ driver: null })} />
    </DashboardLayout>
  );
}
