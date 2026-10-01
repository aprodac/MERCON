import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { TONE_CLASSES } from '@/components/finance/kit/tones';
import { financeService, type DriverPayoutMonth } from '@/services/financeService';
import { addMonths, monthName, monthOf, paidPct } from '@/lib/finance/payoutMonths';
import { formatDate, formatMoney } from '@/lib/finance/format';
import { cn } from '@/lib/utils';

const WINDOW = 12;

/**
 * Driver payouts by month: 12 months of trip pay earned vs marked paid, then the chosen month's
 * drivers (earned, paid, still owed). A driver opens their trips that month and which settlement
 * paid each one.
 */
export function MonthlyPayouts({ onPay }: { onPay: (driver: { id: string; name: string }) => void }) {
  const [end, setEnd] = useState(monthOf());
  const start = addMonths(end, -(WINDOW - 1));
  const [picked, setPicked] = useState<string | null>(null);
  const [open, setOpen] = useState<DriverPayoutMonth | null>(null);

  const q = useQuery({ queryKey: ['driver-pay', 'monthly', start, end], queryFn: () => financeService.getMonthlyPayouts(start, end), placeholderData: (prev) => prev });
  const months = q.data?.months ?? [];
  // Default to the latest month with pay in it
  const month = picked && months.some((m) => m.month === picked) ? picked : [...months].reverse().find((m) => m.earned > 0)?.month ?? end;
  const current = months.find((m) => m.month === month);
  const drivers = useMemo(() => (q.data?.drivers ?? []).filter((d) => d.month === month), [q.data, month]);
  const peak = Math.max(1, ...months.map((m) => m.earned));

  const trips = useQuery({ queryKey: ['driver-pay', 'monthly-trips', month, open?.driverId], queryFn: () => financeService.getMonthlyPayoutTrips(month, open!.driverId), enabled: Boolean(open) });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 12 months: earned bar, the paid part green, the owed part amber */}
      <div className="shrink-0 border-b px-3 py-3">
        <div className="mb-2 flex items-center gap-2 text-[11px] text-muted-foreground">
          <Button variant="ghost" size="icon" className="size-6" onClick={() => setEnd(addMonths(end, -WINDOW))} aria-label="Earlier months">
            <ChevronLeft className="size-3.5" />
          </Button>
          <span>{monthName(start)} – {monthName(end)}</span>
          <Button variant="ghost" size="icon" className="size-6" onClick={() => setEnd(addMonths(end, WINDOW))} disabled={end >= monthOf()} aria-label="Later months">
            <ChevronRight className="size-3.5" />
          </Button>
          <span className="ml-auto flex items-center gap-3">
            <span className="flex items-center gap-1"><span className={cn('size-2 rounded-sm', TONE_CLASSES.positive.dot)} /> Paid</span>
            <span className="flex items-center gap-1"><span className={cn('size-2 rounded-sm', TONE_CLASSES.warning.dot)} /> Still owed</span>
          </span>
        </div>
        {q.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <div className="grid h-24 grid-cols-12 items-end gap-1.5">
            {months.map((m) => {
              const h = (m.earned / peak) * 100;
              const on = m.month === month;
              return (
                <button
                  key={m.month}
                  type="button"
                  onClick={() => setPicked(m.month)}
                  title={`${monthName(m.month)}: earned ${formatMoney(m.earned)}, paid ${formatMoney(m.paid)}, owed ${formatMoney(m.owed)}`}
                  className={cn('group flex h-full flex-col items-stretch justify-end gap-1 rounded-md px-0.5 pt-1 outline-none focus-visible:ring-2 focus-visible:ring-ring', on && 'bg-muted')}
                >
                  <span className="flex w-full flex-col-reverse overflow-hidden rounded-sm" style={{ height: `${Math.max(h, m.earned > 0 ? 4 : 0)}%` }}>
                    <span className={TONE_CLASSES.positive.dot} style={{ height: `${paidPct(m.paid, m.earned)}%` }} />
                    <span className={cn('flex-1', TONE_CLASSES.warning.dot)} />
                  </span>
                  <span className={cn('text-center text-[10px]', on ? 'font-semibold text-foreground' : 'text-muted-foreground')}>{monthName(m.month, true)}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* The chosen month */}
      <div className="grid shrink-0 grid-cols-2 gap-2 border-b px-3 py-2.5 text-xs sm:grid-cols-4">
        <div>
          <span className="block text-[11px] text-muted-foreground">{monthName(month)} · earned</span>
          <span className="fin-num text-base font-semibold">{formatMoney(current?.earned ?? 0)}</span>
        </div>
        <div>
          <span className="block text-[11px] text-muted-foreground">Marked paid</span>
          <span className={cn('fin-num text-base font-semibold', TONE_CLASSES.positive.fg)}>{formatMoney(current?.paid ?? 0)}</span>
        </div>
        <div>
          <span className="block text-[11px] text-muted-foreground">Still owed</span>
          <span className={cn('fin-num text-base font-semibold', (current?.owed ?? 0) > 0.005 ? TONE_CLASSES.warning.fg : 'text-foreground')}>{formatMoney(current?.owed ?? 0)}</span>
        </div>
        <div>
          <span className="block text-[11px] text-muted-foreground">Drivers · trips</span>
          <span className="fin-num text-base font-semibold">{current?.drivers ?? 0} · {current?.trips ?? 0}</span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[680px] text-xs">
          <thead className="sticky top-0 z-10 bg-card text-[11px] text-muted-foreground">
            <tr className="border-b text-left">
              <th className="px-3 py-2 font-medium">Driver</th>
              <th className="px-3 py-2 text-right font-medium">Trips</th>
              <th className="px-3 py-2 text-right font-medium">Earned</th>
              <th className="px-3 py-2 text-right font-medium">Paid</th>
              <th className="px-3 py-2 text-right font-medium">Still owed</th>
              <th className="w-32 px-3 py-2 font-medium">Paid so far</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {!q.isLoading && drivers.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">No trip pay earned in {monthName(month)}.</td>
              </tr>
            )}
            {drivers.map((d) => {
              const pct = paidPct(d.paid, d.earned);
              return (
                <tr key={d.driverId} onClick={() => setOpen(d)} className="cursor-pointer border-b border-border/60 hover:bg-muted/40">
                  <td className="px-3 py-2">
                    <span className="font-medium text-foreground">{d.driver_name}</span>
                    {d.driver_ref && <span className="ml-1.5 text-muted-foreground">{d.driver_ref}</span>}
                  </td>
                  <td className="fin-num px-3 py-2 text-right">{d.trips}</td>
                  <td className="fin-num px-3 py-2 text-right">{formatMoney(d.earned)}</td>
                  <td className={cn('fin-num px-3 py-2 text-right', d.paid > 0 ? TONE_CLASSES.positive.fg : 'text-muted-foreground')}>{d.paid > 0 ? formatMoney(d.paid) : '—'}</td>
                  <td className={cn('fin-num px-3 py-2 text-right font-semibold', d.owed > 0.005 ? TONE_CLASSES.warning.fg : 'text-muted-foreground')}>{d.owed > 0.005 ? formatMoney(d.owed) : '—'}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className={cn('h-full', pct >= 99.9 ? TONE_CLASSES.positive.dot : TONE_CLASSES.warning.dot)} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="fin-num w-9 text-right text-[11px] text-muted-foreground">{pct.toFixed(0)}%</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                    {d.owed > 0.005 ? (
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onPay({ id: d.driverId, name: d.driver_name })}>
                        Pay
                      </Button>
                    ) : (
                      <Chip tone="positive" size="sm">Paid</Chip>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Sheet open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
          {open && (
            <>
              <div className="space-y-1 border-b p-5 pr-14">
                <SheetTitle className="text-base">{open.driver_name} · {monthName(month)}</SheetTitle>
                <SheetDescription className="fin-num text-xs">
                  Earned {formatMoney(open.earned)} · paid {formatMoney(open.paid)} · still owed {formatMoney(open.owed)}
                </SheetDescription>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-5 text-xs">
                {trips.isLoading ? (
                  <div className="space-y-2">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-7 w-full" />)}</div>
                ) : (
                  <div className="divide-y divide-border/60 rounded-lg border">
                    {(trips.data ?? []).map((t) => (
                      <div key={`${t.tripId}:${t.role}`} className="flex items-center gap-2 px-3 py-2">
                        <span className="w-16 shrink-0 text-muted-foreground">{formatDate(t.day)}</span>
                        <Link to={`/trips/${t.tripId}`} className="w-20 shrink-0 font-medium text-foreground hover:underline">{t.tripRef}</Link>
                        <span className="min-w-0 flex-1 truncate text-muted-foreground" title={`${t.customer} · ${t.lane}`}>
                          {t.customer}
                          {t.role === 'co_driver' && <span className={cn('ml-1', TONE_CLASSES.info.fg)}>co-driver</span>}
                        </span>
                        <span className="fin-num w-20 shrink-0 text-right font-medium">{formatMoney(t.amount)}</span>
                        <span className="w-28 shrink-0 text-right">
                          {t.settlement ? (
                            <span className={cn('text-[11px]', TONE_CLASSES.positive.fg)} title={`Paid ${formatDate(t.settlement.paidDate)}`}>
                              {t.settlement.ref} · {formatDate(t.settlement.paidDate)}
                            </span>
                          ) : (
                            <Chip tone="warning" size="sm">Unpaid</Chip>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {open.owed > 0.005 && (
                <div className="flex justify-end border-t p-4">
                  <Button
                    size="sm"
                    className="h-8 bg-brand text-xs text-white hover:bg-brand-hover"
                    onClick={() => {
                      onPay({ id: open.driverId, name: open.driver_name });
                      setOpen(null);
                    }}
                  >
                    Pay {open.driver_name.split(' ')[0]}
                  </Button>
                </div>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
