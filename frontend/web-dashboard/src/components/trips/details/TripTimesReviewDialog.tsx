import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Check, Loader2, ZoomIn, ZoomOut } from 'lucide-react';
import { formatClockTyping, isoToWall, resolveStopTimes, type StopTimeRow } from '@mercon/shared-types';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { resolveFileUrl } from '@/lib/documents';
import { tripService, type Trip, type TripStop } from '@/services/tripService';

/** A screenshot from the customer's app (EXTERNAL_APP trips). */
export const isAppScreenshot = (d: any) => d?.ai_extracted_json?.source === 'external_app_screenshot';
export const isPendingScreenshot = (d: any) => isAppScreenshot(d) && d?.status === 'PendingReview';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trip: Trip;
  documents: any[];
  tz: string;
  onSaved: () => void;
}

function stopTitle(s: TripStop, i: number): string {
  return s.location?.name || s.location_name || s.location_address || `Stop ${i + 1}`;
}

/**
 * Every stop's real arrive/left time, copied off the customer app's
 * screenshots in one pass. The customer app lists all stops on one screen, so
 * the rows follow the same order; the operator types "054426" and moves on.
 * Blank keeps the driver's tapped time.
 */
export default function TripTimesReviewDialog({ open, onOpenChange, trip, documents, tz, onSaved }: Props) {
  const stops = useMemo(() => [...(trip.stops ?? [])].sort((a, b) => a.stop_sequence - b.stop_sequence), [trip.stops]);
  const shots = useMemo(
    () => documents.filter(isAppScreenshot).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    [documents],
  );
  const pending = shots.filter(isPendingScreenshot).length;

  const [typed, setTyped] = useState<Record<string, { arrival: string; departure: string }>>({});
  const [shotId, setShotId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(false);
  const [saving, setSaving] = useState(false);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  const shot = shots.find((d) => d.id === shotId) ?? shots[0];
  const stopName = (d: any) => {
    const i = stops.findIndex((s) => s.id === d?.ai_extracted_json?.stop_id);
    return i >= 0 ? stopTitle(stops[i], i) : 'Trip';
  };

  const rows: StopTimeRow[] = stops.map((s) => ({
    stopId: s.id,
    recordedArrival: s.actual_arrival,
    recordedDeparture: s.actual_departure,
    arrival: typed[s.id]?.arrival ?? '',
    departure: typed[s.id]?.departure ?? '',
  }));
  const fallback = trip.actual_start || trip.planned_start || stops[0]?.planned_arrival || new Date().toISOString();
  const resolved = resolveStopTimes(rows, tz, fallback);
  const hasError = resolved.some((r) => r.arrival.error || r.departure.error);
  const changes = resolved.filter((r) => r.arrival.changed || r.departure.changed);

  const set = (stopId: string, field: 'arrival' | 'departure', value: string) =>
    setTyped((t) => ({ ...t, [stopId]: { ...(t[stopId] ?? { arrival: '', departure: '' }), [field]: formatClockTyping(value) } }));

  const close = (o: boolean) => {
    if (saving) return;
    if (!o) { setTyped({}); setShotId(null); setZoom(false); }
    onOpenChange(o);
  };

  const save = async () => {
    if (hasError) return;
    setSaving(true);
    try {
      const r = await tripService.confirmTripTimes(trip.id, changes.map((c) => ({
        stop_id: c.stopId,
        ...(c.arrival.changed && c.arrival.iso ? { actual_arrival: c.arrival.iso } : {}),
        ...(c.departure.changed && c.departure.iso ? { actual_departure: c.departure.iso } : {}),
      })));
      toast.success(r.stops_updated ? `Times saved for ${r.stops_updated} stop${r.stops_updated === 1 ? '' : 's'}` : 'Tapped times confirmed');
      onSaved();
      close(false);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Could not save the times');
    } finally {
      setSaving(false);
    }
  };

  const clock = (iso: string | null) => (iso ? isoToWall(iso, tz).clock : null);

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-5xl gap-0 p-0">
        <DialogHeader className="border-b border-black/[0.06] px-5 py-3 dark:border-white/10">
          <DialogTitle className="text-base">Check times · {trip.ref_id}</DialogTitle>
          <DialogDescription className="text-xs">
            Copy each stop's times from the customer app screenshot. Type 054426 for 05:44:26. Leave a box empty to keep the driver's tapped time.
          </DialogDescription>
        </DialogHeader>

        <div className="grid max-h-[75vh] grid-cols-1 md:grid-cols-[320px_minmax(0,1fr)]">
          <div className="flex min-h-0 flex-col gap-2 border-b border-black/[0.06] bg-slate-50 p-3 md:border-b-0 md:border-r dark:border-white/10 dark:bg-slate-900/60">
            {shot ? (
              <>
                <div className="relative min-h-0 flex-1 overflow-auto rounded-xl bg-white ring-1 ring-black/10 dark:bg-slate-950 dark:ring-white/10" style={{ maxHeight: '58vh' }}>
                  <img
                    src={resolveFileUrl(shot.file_url)}
                    alt={`Screenshot from ${stopName(shot)}`}
                    onClick={() => setZoom((z) => !z)}
                    className={cn('block cursor-zoom-in', zoom ? 'w-[220%] max-w-none cursor-zoom-out' : 'w-full')}
                  />
                  <button
                    type="button"
                    onClick={() => setZoom((z) => !z)}
                    className="absolute right-2 top-2 rounded-md bg-charcoal-strong/70 p-1 text-white"
                    aria-label={zoom ? 'Zoom out' : 'Zoom in'}
                  >
                    {zoom ? <ZoomOut className="size-4" /> : <ZoomIn className="size-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  From {stopName(shot)} · sent {shot.createdAt ? isoToWall(shot.createdAt, tz).clock.slice(0, 5) : ''}
                </p>
                {shots.length > 1 && (
                  <div className="flex gap-1.5 overflow-x-auto pb-1">
                    {shots.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => { setShotId(d.id); setZoom(false); }}
                        title={stopName(d)}
                        className={cn(
                          'relative h-16 w-10 shrink-0 overflow-hidden rounded-md ring-1 ring-black/10 dark:ring-white/10',
                          d.id === shot.id && 'ring-2 ring-blue-600',
                        )}
                      >
                        <img src={resolveFileUrl(d.file_url)} alt="" className="size-full object-cover" />
                        {isPendingScreenshot(d) && <span className="absolute right-0.5 top-0.5 size-2 rounded-full bg-amber-500" />}
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="p-4 text-sm text-muted-foreground">No screenshots on this trip yet.</p>
            )}
          </div>

          <div className="flex min-h-0 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-2">
              <div className="grid grid-cols-[minmax(0,1fr)_112px_112px] gap-x-3 border-b border-black/[0.08] pb-1.5 text-[11px] text-muted-foreground dark:border-white/10">
                <span>Stop · same order as the customer app</span><span>Arrived</span><span>Left</span>
              </div>
              {stops.map((s, i) => {
                const r = resolved[i];
                return (
                  <div key={s.id} className="grid grid-cols-[minmax(0,1fr)_112px_112px] items-start gap-x-3 border-b border-black/[0.05] py-2 last:border-b-0 dark:border-white/5">
                    <div className="min-w-0 pt-1">
                      <p className="truncate text-sm font-medium text-foreground">{stopTitle(s, i)}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {s.stop_type}
                        {s.actual_arrival ? ` · tapped ${clock(s.actual_arrival)?.slice(0, 5)}${s.actual_departure ? ` – ${clock(s.actual_departure)?.slice(0, 5)}` : ''}` : ' · not reached'}
                      </p>
                    </div>
                    {(['arrival', 'departure'] as const).map((field, f) => {
                      const t = r[field];
                      const recorded = field === 'arrival' ? s.actual_arrival : s.actual_departure;
                      const idx = i * 2 + f;
                      return (
                        <div key={field}>
                          <input
                            ref={(el) => { inputs.current[idx] = el; }}
                            value={typed[s.id]?.[field] ?? ''}
                            onChange={(e) => set(s.id, field, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') { e.preventDefault(); inputs.current[idx + 1]?.focus(); }
                            }}
                            placeholder={clock(recorded) ?? 'hh:mm:ss'}
                            inputMode="numeric"
                            aria-label={`${stopTitle(s, i)} ${field === 'arrival' ? 'arrived' : 'left'}`}
                            className={cn(
                              'h-8 w-full rounded-md border bg-white px-2 font-mono text-sm tabular-nums outline-none focus:ring-2 focus:ring-blue-600/30 dark:bg-slate-950',
                              t.error ? 'border-rose-400' : t.changed ? 'border-amber-400' : 'border-black/15 dark:border-white/15',
                            )}
                          />
                          <p className={cn('mt-0.5 h-4 text-[10.5px]', t.error ? 'text-rose-600 dark:text-rose-400' : 'text-amber-700 dark:text-amber-400')}>
                            {t.error ?? (t.changed ? [recorded ? `was ${clock(recorded)?.slice(0, 5)}` : 'new', t.dayOffset ? `+${t.dayOffset} day` : ''].filter(Boolean).join(' · ') : '')}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-black/[0.06] px-5 py-3 dark:border-white/10">
              <p className="text-xs text-muted-foreground">
                {pending > 0 ? `${pending} screenshot${pending === 1 ? '' : 's'} to check` : 'All screenshots checked'}
                {changes.length > 0 && ` · ${changes.length} stop${changes.length === 1 ? '' : 's'} changed`}
              </p>
              <Button onClick={save} disabled={saving || hasError} className="gap-1.5">
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                {changes.length ? `Save ${changes.length} stop${changes.length === 1 ? '' : 's'}` : 'Times are right'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
