import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck, ExternalLink, Loader2, Pencil, Truck, Wrench } from 'lucide-react';
import { toast } from 'sonner';

import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Skeleton } from '@/components/ui/skeleton';
import { TONE_CLASSES } from '@/components/finance/kit/tones';
import { maintenanceService } from '@/services/maintenanceService';
import { formatDate, formatMoney } from '@/lib/finance/format';
import { TYPE_TONE, daysIn, isOpen, stayTone } from '@/lib/maintenance/hub';
import { cn } from '@/lib/utils';

const STATUS_CHIP: Record<string, { tone: 'warning' | 'info' | 'positive' | 'neutral'; label: string }> = {
  In_Progress: { tone: 'warning', label: 'In workshop' },
  'In Progress': { tone: 'warning', label: 'In workshop' },
  Scheduled: { tone: 'info', label: 'Scheduled' },
  Completed: { tone: 'positive', label: 'Completed' },
  Cancelled: { tone: 'neutral', label: 'Cancelled' },
};
const KIND_LABEL = { part: 'Part', labour: 'Labour', other: 'Other' } as const;

/**
 * One service order at a glance: the truck, how long it's been off the road, the cost lines, and
 * the next step (take it in, return it to service, edit).
 */
export function OrderSheet({ id, onOpenChange }: { id: string | null; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: ['maintenance', 'detail', id], queryFn: () => maintenanceService.getById(id!), enabled: Boolean(id) });
  const [busy, setBusy] = useState(false);
  const r = q.data;

  const refresh = () => {
    ['maintenance', 'vehicles', 'expenses'].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
  };
  const act = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(done);
      refresh();
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'That didn’t work. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const open = r ? isOpen(r.status) : false;
  const days = r && (open || r.status === 'Completed') ? daysIn(r.start_date, open ? null : r.end_date) : 0;
  const expectedDays = r?.expected_end_date ? daysIn(r.start_date, r.expected_end_date) : null;
  const tone = r && open ? stayTone(days, r.expected_end_date) : 'neutral';
  const items = r?.items ?? [];
  const vat = Number(r?.vat_amount ?? 0);
  const net = Number(r?.cost ?? 0) - vat;
  const chip = r ? STATUS_CHIP[r.status] ?? { tone: 'neutral', label: r.status } : null;

  return (
    <Sheet open={id !== null} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        {!r ? (
          <div className="space-y-2 p-5">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-7 w-full" />)}</div>
        ) : (
          <>
            <div className="space-y-2 border-b p-5 pr-14">
              <div className="flex flex-wrap items-center gap-2">
                <SheetTitle className="text-base">{r.ref_id ?? 'Service order'}</SheetTitle>
                {chip && <Chip tone={chip.tone} size="sm">{chip.label}</Chip>}
                <Chip tone={TYPE_TONE[r.maintenance_type] ?? 'neutral'} size="sm">{r.maintenance_type}</Chip>
              </div>
              <SheetDescription className="flex flex-wrap items-center gap-1.5 text-xs">
                <Truck className="size-3.5" />
                <span className="font-medium text-foreground">{r.vehicle?.plate_number ?? '—'}</span>
                {r.vehicle?.asset_type && <span>· {r.vehicle.asset_type}</span>}
                <span>· {Math.round(r.odometer_reading || r.vehicle?.current_odometer || 0).toLocaleString('en-US')} km</span>
              </SheetDescription>
              <p className="fin-num text-2xl font-semibold">
                <span className="mr-1 text-sm font-medium text-muted-foreground">SAR</span>
                {formatMoney(r.cost)}
              </p>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5 text-xs">
              {/* Time off the road */}
              {(open || r.status === 'Completed') && (
                <div className="space-y-1">
                  <div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className={TONE_CLASSES[tone === 'neutral' ? 'info' : tone].dot} style={{ width: `${expectedDays ? Math.min(100, (days / expectedDays) * 100) : 100}%` }} />
                  </div>
                  <p className={cn('text-[11px]', tone === 'negative' ? TONE_CLASSES.negative.fg : 'text-muted-foreground')}>
                    {open ? `${days} ${days === 1 ? 'day' : 'days'} in the workshop` : `Off the road ${days} ${days === 1 ? 'day' : 'days'}`}
                    {expectedDays ? ` of ${expectedDays} expected` : ''}
                    {r.expected_end_date && open ? ` · back by ${formatDate(r.expected_end_date)}` : ''}
                  </p>
                </div>
              )}

              <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
                <div>
                  <dt className="text-[11px] text-muted-foreground">Workshop</dt>
                  <dd className="font-medium text-foreground">{r.workshop_name}</dd>
                  {r.workshop_contact && <dd className="text-muted-foreground">{r.workshop_contact}</dd>}
                </div>
                <div>
                  <dt className="text-[11px] text-muted-foreground">{r.status === 'Scheduled' ? 'Booked for' : 'In'}</dt>
                  <dd className="text-foreground">{formatDate(r.start_date)}</dd>
                  {r.end_date && !open && <dd className="text-muted-foreground">Out {formatDate(r.end_date)}</dd>}
                </div>
              </dl>

              {items.length > 0 ? (
                <div className="overflow-hidden rounded-lg border">
                  {items.map((it, i) => (
                    <div key={it.id ?? i} className="flex items-center gap-2 border-b border-border/60 px-3 py-1.5 last:border-0">
                      <span className="w-12 shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">{KIND_LABEL[it.kind] ?? it.kind}</span>
                      <span className="min-w-0 flex-1 truncate text-foreground" title={it.description}>
                        {it.description}
                        {Number(it.quantity) !== 1 && <span className="text-muted-foreground"> × {Number(it.quantity)}</span>}
                        {it.servicePlan && <span className={cn('ml-1.5 text-[10px]', TONE_CLASSES.info.fg)}>· {it.servicePlan.task}</span>}
                      </span>
                      <span className="fin-num shrink-0">{formatMoney(it.amount ?? 0)}</span>
                    </div>
                  ))}
                  <div className="space-y-0.5 bg-muted/30 px-3 py-2">
                    <div className="flex justify-between text-muted-foreground"><span>Before VAT</span><span className="fin-num">{formatMoney(net)}</span></div>
                    {vat > 0 && <div className="flex justify-between text-muted-foreground"><span>VAT (reclaimed)</span><span className="fin-num">{formatMoney(vat)}</span></div>}
                    <div className="flex justify-between font-semibold"><span>Total</span><span className="fin-num">{formatMoney(r.cost)}</span></div>
                  </div>
                </div>
              ) : (
                <p className="rounded-lg border border-dashed p-3 text-center text-muted-foreground">No cost lines yet.</p>
              )}

              <p className={cn('text-[11px]', r.payment_status === 'Pending' ? TONE_CLASSES.warning.fg : 'text-muted-foreground')}>
                {r.status !== 'Completed' ? 'Cost is owed to the workshop until the order is closed.' : r.payment_status === 'Pending' ? 'To pay the workshop.' : 'Paid.'}
                {r.invoice_number ? ` Invoice ${r.invoice_number}.` : ''}
              </p>
              {(r.work_done || r.remarks) && <p className="whitespace-pre-wrap text-muted-foreground">{r.work_done || r.remarks}</p>}

              <Link to={`/maintenance/${r.id}`} className="inline-flex items-center gap-1 font-medium text-foreground underline underline-offset-2">
                Full details and documents <ExternalLink className="size-3" />
              </Link>
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t p-4">
              <Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-full text-xs" onClick={() => navigate(`/maintenance/${r.id}/edit`)} disabled={busy}>
                <Pencil className="size-3.5" /> Edit
              </Button>
              {r.status === 'Scheduled' && (
                <Button
                  size="sm"
                  className="h-8 gap-1.5 rounded-full bg-brand text-xs text-white hover:bg-brand-hover"
                  disabled={busy}
                  onClick={() => act(() => maintenanceService.update(r.id, { status: 'In_Progress', start_date: new Date().toISOString() }), `${r.vehicle?.plate_number ?? 'Truck'} is in the workshop`)}
                >
                  {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Wrench className="size-3.5" />} Truck is in the workshop
                </Button>
              )}
              {open && (
                <Button
                  size="sm"
                  className="h-8 gap-1.5 rounded-full bg-brand text-xs text-white hover:bg-brand-hover"
                  disabled={busy}
                  onClick={() => act(() => maintenanceService.returnVehicleToService(r.vehicleId), `${r.vehicle?.plate_number ?? 'Truck'} is back on the road`)}
                >
                  {busy ? <Loader2 className="size-3.5 animate-spin" /> : <CalendarCheck className="size-3.5" />} Return to service
                </Button>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
