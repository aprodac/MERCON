import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Settings2, Truck, UserRound } from 'lucide-react';
import { Bar, BarChart, Cell, ReferenceLine, XAxis } from 'recharts';

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Skeleton } from '@/components/ui/skeleton';
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import { TONE_CLASSES, toneDotVar } from '@/components/finance/kit/tones';
import { PnlStatement } from './PnlStatement';
import { CostMixBar, CostMixLegend } from './CostMixBar';
import { vehicleService, type FleetVehiclePnl } from '@/services/vehicleService';
import { formatDate } from '@/lib/finance/format';
import { compact, lastMonths, monthShort, sar0, signed0, truckIssues } from '@/lib/vehiclePnl';
import { cn } from '@/lib/utils';

const TREND_MONTHS = 6;
const chart: ChartConfig = { net_profit: { label: 'Net profit', color: toneDotVar('positive') } };

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border bg-muted/30 px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="fin-num truncate text-sm font-semibold">{value}</p>
    </div>
  );
}

/**
 * One truck's P&L without leaving the fleet page: the period's statement
 * (already in the fleet row), what data is missing, and a six-month trend.
 */
export function VehiclePnlSheet({
  row,
  from,
  to,
  onClose,
}: {
  row: FleetVehiclePnl | null;
  from: string;
  to: string;
  onClose: () => void;
}) {
  const trendRange = lastMonths(to, TREND_MONTHS);
  const trend = useQuery({
    queryKey: ['vehicle-financials', row?.vehicle_id, trendRange.from, trendRange.to],
    queryFn: () => vehicleService.getFinancials(row!.vehicle_id, trendRange),
    enabled: Boolean(row),
  });
  const issues = row ? truckIssues(row.flags) : [];
  const statementHref = row ? `/vehicles/${row.vehicle_id}/financials?from=${from}&to=${to}` : '#';

  return (
    <Sheet open={row !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-lg">
        {row && (
          <>
            <SheetHeader className="border-b p-5 pr-14">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-muted text-foreground">
                  <Truck className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <SheetTitle className="truncate text-base">{row.plate_number}</SheetTitle>
                  <SheetDescription asChild>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                      <Chip tone="neutral" size="sm">{row.asset_type}</Chip>
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <UserRound className="size-3" /> {row.driver?.name ?? 'No assigned driver'}
                      </span>
                      <span className="text-muted-foreground">{formatDate(from)} – {formatDate(to)}</span>
                    </div>
                  </SheetDescription>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" asChild className="h-7 gap-1.5 text-xs">
                  <Link to={statementHref}>
                    Open statement <ArrowRight className="size-3.5" />
                  </Link>
                </Button>
                <Button variant="outline" size="sm" asChild className="h-7 gap-1.5 text-xs">
                  <Link to={`/vehicles/financials/setup?truck=${row.vehicle_id}`}>
                    <Settings2 className="size-3.5" /> Cost setup
                  </Link>
                </Button>
              </div>
            </SheetHeader>

            <div className="space-y-4 p-5">
              <div className="grid grid-cols-3 gap-2">
                <Stat label="Trips" value={String(row.trips_count)} />
                <Stat label="Per trip" value={row.revenue_per_trip === null ? '—' : sar0(row.revenue_per_trip)} />
                <Stat label="Cost per km" value={row.cost_per_km === null ? '—' : row.cost_per_km.toFixed(2)} />
              </div>

              {issues.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {issues.map((i) => (
                    <Chip key={i.key} tone={i.tone} size="sm">{i.label}</Chip>
                  ))}
                </div>
              )}

              <div className="space-y-1.5">
                <CostMixBar b={row} className="h-2.5" />
                <CostMixLegend />
              </div>

              <PnlStatement totals={row} dense />

              <div>
                <p className="mb-1 text-xs font-semibold">Net profit, last {TREND_MONTHS} months</p>
                {trend.isLoading ? (
                  <Skeleton className="h-24 w-full" />
                ) : trend.data ? (
                  <ChartContainer config={chart} className="aspect-auto h-28 w-full">
                    <BarChart data={trend.data.monthly} margin={{ top: 6, right: 0, bottom: 0, left: 0 }}>
                      <XAxis dataKey="month" tickFormatter={monthShort} tickLine={false} axisLine={false} fontSize={10} />
                      <ReferenceLine y={0} stroke="var(--border)" />
                      <ChartTooltip
                        cursor={{ fill: 'var(--muted)' }}
                        content={({ active, payload }) => {
                          const p = active ? payload?.[0]?.payload : null;
                          if (!p) return null;
                          return (
                            <div className="rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-md">
                              <p className="font-medium">{monthShort(p.month)}</p>
                              <p className="text-muted-foreground">Revenue <span className="fin-num text-foreground">{sar0(p.revenue)}</span></p>
                              <p className="text-muted-foreground">Costs <span className="fin-num text-foreground">{sar0(p.direct_costs + p.overhead)}</span></p>
                              <p className={cn('fin-num font-semibold', p.net_profit < 0 ? TONE_CLASSES.negative.fg : TONE_CLASSES.positive.fg)}>{signed0(p.net_profit)}</p>
                            </div>
                          );
                        }}
                      />
                      <Bar dataKey="net_profit" radius={3} isAnimationActive={false}>
                        {trend.data.monthly.map((m) => (
                          <Cell key={m.month} fill={toneDotVar(m.net_profit < 0 ? 'negative' : 'positive')} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ChartContainer>
                ) : (
                  <p className="text-xs text-muted-foreground">The trend could not be loaded.</p>
                )}
                {trend.data && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {TREND_MONTHS}-month total <span className="fin-num font-medium text-foreground">{compact(trend.data.totals.net_profit)}</span> on{' '}
                    <span className="fin-num">{compact(trend.data.totals.revenue)}</span> revenue
                  </p>
                )}
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
