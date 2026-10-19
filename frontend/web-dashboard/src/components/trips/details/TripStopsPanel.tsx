import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowRightLeft, Check, CheckCheck, Clock3, Crosshair, Play, RefreshCw, TriangleAlert, Undo2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { WhatsAppIcon } from '@/components/ui/whatsapp-icon';
import { cn } from '@/lib/utils';
import { resolveFileUrl } from '@/lib/documents';
import { EvidenceLightboxModal, type LightboxPhotoItem } from '@/components/trips/EvidenceLightboxModal';
import { ShareUpdateDialog } from '@/components/dashboard/inbox/ShareUpdateDialog';
import { shortAgo } from '@/components/dashboard/inbox/inboxText';
import { operatorInboxService, type DriverUpdate } from '@/services/operatorInboxService';
import type { TripPhase } from '@/services/fleetLiveService';
import { tripService, type Trip, type TripStop } from '@/services/tripService';
import PinChip, { isExactPin } from '@/components/locations/PinChip';
import SetPinDialog from '@/components/locations/SetPinDialog';
import { FileThumb } from './TripDetailsBits';
import { STAGE_LABEL, minutesLate, timeReviewOf, toLightboxItems } from './stopEvidence';
import TripTimesReviewDialog, { isAppScreenshot, isPendingScreenshot } from './TripTimesReviewDialog';

/** Arrival within this many minutes of the plan counts as on time. */
const ON_TIME_GRACE_MIN = 5;

interface Props {
  trip: Trip;
  phase: TripPhase;
  documents: any[];
  /** Deployment timezone — typed screenshot times are read in it. */
  tz: string;
  formatTime: (iso: string) => string;
  formatDateTime: (iso: string) => string;
  onEvidenceUpdated: () => void;
  /** A stop was pinned — the page reloads the trip (ETA and map read the pin). */
  onPinned?: () => void;
  /** State-specific block above the stops (pre-trip checks, trip summary, …). */
  top?: React.ReactNode;
  /** Shown after the stops (the page puts the trip's paperwork here). */
  bottom?: React.ReactNode;
}

/**
 * Whether pinning this stop also pins its customer location — when the stop is
 * that place, not a yard inside a lane endpoint (mirrors the API's isSamePlace).
 * The API additionally keeps an already-exact location unless this stop still
 * held its pin; the footnote only promises the common case.
 */
function sharesCustomerPin(s: TripStop): boolean {
  if (!s.location) return false;
  const slug = (v: string) => v.trim().toLowerCase().replace(/\s+/g, ' ');
  return !s.location_name?.trim() || slug(s.location_name) === slug(s.location.name);
}

function stopTitle(s: TripStop, i: number): string {
  return s.location?.name || s.location_name || s.location_address || `Stop ${i + 1}`;
}

/**
 * The trip's stops, in order, each with what happened there: planned vs actual
 * time, the delay the driver reported, and the photos / video they sent —
 * grouped by step (Loaded, Arrived, Delivered · POD, Delay) with a Send button
 * that forwards them on WhatsApp and remembers who already did.
 */
export default function TripStopsPanel({ trip, phase, documents, tz, formatTime, formatDateTime, onEvidenceUpdated, onPinned, top, bottom }: Props) {
  const [sharing, setSharing] = useState<DriverUpdate | null>(null);
  const [pinning, setPinning] = useState<TripStop | null>(null);
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [viewer, setViewer] = useState<{ items: LightboxPhotoItem[]; index: number } | null>(null);
  const [checkingTimes, setCheckingTimes] = useState(false);

  const { data } = useQuery({
    queryKey: ['operator-inbox', 'trip-driver-updates', trip.id],
    queryFn: () => operatorInboxService.getTripDriverUpdates(trip.id),
    refetchInterval: phase === 'active' ? 30_000 : false,
  });
  const updates = data?.updates ?? [];
  const docsById = useMemo(() => new Map(documents.map((d: any) => [d.id, d])), [documents]);
  const stops = useMemo(() => [...(trip.stops ?? [])].sort((a, b) => a.stop_sequence - b.stop_sequence), [trip.stops]);
  const nextIndex = phase === 'active' ? stops.findIndex((s) => !s.actual_arrival) : -1;
  const doneCount = stops.filter((s) => s.actual_arrival).length;
  // A finished trip is a record — its stops can't be re-pinned (the API refuses too).
  const canPin = phase === 'planned' || phase === 'active';
  // Customer-app trips: the driver's taps are provisional, the screenshots hold the real times.
  const appShots = documents.filter(isAppScreenshot);
  const pendingShots = appShots.filter(isPendingScreenshot).length;

  // The dashboard's "Time review" alert links here with ?times=1.
  const timesParam = searchParams.get('times');
  useEffect(() => {
    if (!timesParam) return;
    if (appShots.length) setCheckingTimes(true);
    const next = new URLSearchParams(searchParams);
    next.delete('times');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timesParam, appShots.length]);

  // The dashboard's "Pin needed" alert links here with ?pin=<stopId>.
  const pinParam = searchParams.get('pin');
  useEffect(() => {
    if (!pinParam || !canPin) return;
    const target = stops.find((s) => s.id === pinParam) ?? stops.find((s) => !s.actual_arrival && !isExactPin(s.location_coordinate_precision, s.location_lat, s.location_lng));
    if (target) setPinning(target);
    const next = new URLSearchParams(searchParams);
    next.delete('pin');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinParam, canPin, stops]);

  const savePin = async (stop: TripStop, pin: { lat: number; lng: number; address?: string | null }) => {
    const r = await tripService.pinStop(trip.id, stop.id, pin);
    const others = r.other_trip_count;
    toast.success(
      r.location_pinned
        ? `Pin saved for ${stop.location?.name || stop.location_name || 'this location'}${others > 0 ? ` and ${others} other open trip${others === 1 ? '' : 's'}` : ''}`
        : 'Pin saved'
    );
    onPinned?.();
  };

  const updatesFor = (stopId: string | null) => updates.filter((u) => (u.stop?.id ?? null) === stopId);
  // The driver's geotagged photos at a stop — offered as its pin.
  const photoPinsFor = (stopId: string) =>
    updatesFor(stopId).flatMap((u) => u.items.filter((m) => m.gps && m.kind !== 'video').map((m) => ({ id: m.id, lat: m.gps!.lat, lng: m.gps!.lng, label: `${STAGE_LABEL[u.stage]} ${formatTime(m.captured_at)}` })));

  const restorePhotos = async (removedAt: string) => {
    try {
      const n = await tripService.restoreStepBackPhotos(trip.id, removedAt);
      toast.success(`${n} photo${n === 1 ? '' : 's'} restored`);
      queryClient.invalidateQueries({ queryKey: ['operator-inbox', 'trip-driver-updates', trip.id] });
      onEvidenceUpdated();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Could not restore the photos');
    }
  };
  const unplaced = updatesFor(null);

  const openViewer = (u: DriverUpdate, index: number, stop: TripStop | undefined, name: string) =>
    setViewer({ items: toLightboxItems(u.items, docsById, stop, name, formatTime), index });

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-black/[0.06] bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
      <div className="flex shrink-0 items-center justify-between border-b border-black/[0.06] px-4 py-3 dark:border-white/10">
        <p className="text-sm font-semibold text-foreground">Stops</p>
        <div className="flex items-center gap-2">
          {appShots.length > 0 && (
            <button
              type="button"
              onClick={() => setCheckingTimes(true)}
              className={cn(
                'inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold',
                pendingShots > 0
                  ? 'bg-amber-500/15 text-amber-800 hover:bg-amber-500/25 dark:text-amber-300'
                  : 'text-muted-foreground hover:bg-muted',
              )}
            >
              <Clock3 className="size-3.5" />
              {pendingShots > 0 ? `Check times · ${pendingShots}` : 'Times checked'}
            </button>
          )}
          <p className="text-xs text-muted-foreground">{doneCount} of {stops.length} done</p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {top}
        {(trip.step_backs ?? []).slice(0, 3).map((b, k) => (
          <div key={`${b.at}-${k}`} className="mx-4 mt-3 flex items-start gap-2 rounded-lg bg-violet-50 px-3 py-2 text-xs dark:bg-violet-950/30">
            <Undo2 className="mt-0.5 size-3.5 shrink-0 text-violet-700 dark:text-violet-300" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-violet-900 dark:text-violet-200">Taken back by {b.by ?? 'the office'} · {formatDateTime(b.at)}</p>
              <p className="text-slate-700 dark:text-slate-300">
                {b.from ? `${b.from} → ` : ''}{b.to ?? 'an earlier step'}
                {b.photos && b.photos.count > 0
                  ? ` · ${b.photos.count} photo${b.photos.count === 1 ? '' : 's'} ${b.photos.choice === 'move' ? `moved to ${b.photos.moved_to ?? 'the redone step'}` : b.photos.choice === 'remove' ? 'removed' : 'left as they were'}`
                  : ''}
              </p>
            </div>
            {b.photos?.removed_at && (b.photos.restorable ?? 0) > 0 && (
              <Button size="sm" variant="outline" className="h-6 shrink-0 px-2 text-[11px]" onClick={() => restorePhotos(b.photos!.removed_at!)}>
                Restore {b.photos.restorable}
              </Button>
            )}
          </div>
        ))}
        <ol>
          {stops.map((s, i) => {
            const name = stopTitle(s, i);
            const done = !!s.actual_arrival;
            const isNext = i === nextIndex;
            const late = minutesLate(s.planned_arrival, s.actual_arrival);
            const stopUpdates = updatesFor(s.id);
            const needsTimeCheck = stopUpdates.some((u) => u.items.some((m) => timeReviewOf(docsById.get(m.id), s)));
            const bubble =
              phase === 'done' ? 'bg-emerald-600 text-white'
              : phase === 'cancelled' ? 'bg-stone-300 text-white dark:bg-stone-600'
              : phase === 'planned' ? 'border border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-700 dark:bg-violet-950 dark:text-violet-300'
              : done ? 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
              : isNext ? 'bg-blue-600 text-white ring-4 ring-blue-600/15'
              : 'border border-slate-300 bg-white text-slate-500 dark:border-slate-600 dark:bg-slate-900';

            return (
              <li key={s.id} className={cn('relative flex gap-3 border-t border-black/[0.05] px-4 py-3 first:border-t-0 dark:border-white/5', isNext && 'bg-blue-600/[0.04]')}>
                <span className={cn('mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold', bubble)}>
                  {done || phase === 'done' ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className={cn('min-w-0 truncate text-sm', isNext ? 'font-semibold text-foreground' : 'font-medium text-foreground')}>{name}</p>
                    {canPin && (!done || (!isExactPin(s.location_coordinate_precision, s.location_lat, s.location_lng) && photoPinsFor(s.id).length > 0)) && (
                      <PinChip exact={isExactPin(s.location_coordinate_precision, s.location_lat, s.location_lng)} onClick={() => setPinning(s)} />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {s.stop_type}
                    {!s.actual_arrival && s.planned_arrival ? ` · due ${formatDateTime(s.planned_arrival)}` : ''}
                  </p>
                  {s.actual_arrival && (() => {
                    const dwell = s.actual_departure ? Math.max(0, Math.round((new Date(s.actual_departure).getTime() - new Date(s.actual_arrival).getTime()) / 60000)) : null;
                    const mins = (m: number) => (Math.abs(m) < 60 ? `${Math.abs(m)} min` : `${Math.floor(Math.abs(m) / 60)} h ${String(Math.abs(m) % 60).padStart(2, '0')} min`);
                    const cell = 'rounded-md bg-slate-50 px-2 py-1 dark:bg-slate-800/60';
                    return (
                      <>
                        {/* Planned vs real, side by side */}
                        <div className="mt-1.5 grid grid-cols-3 gap-1.5 text-xs">
                          <div className={cell}><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Planned</p><p className="font-medium tabular-nums">{s.planned_arrival ? formatDateTime(s.planned_arrival) : '—'}</p></div>
                          <div className={cell}><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Arrived</p><p className={cn('font-medium tabular-nums', late != null && (late > ON_TIME_GRACE_MIN ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'))}>{formatDateTime(s.actual_arrival)}</p></div>
                          <div className={cell}><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Left</p><p className="font-medium tabular-nums">{s.actual_departure ? formatTime(s.actual_departure) : phase === 'active' ? 'Still there' : '—'}</p></div>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {late == null ? 'No planned time' : late > ON_TIME_GRACE_MIN ? `${mins(late)} late` : late < -ON_TIME_GRACE_MIN ? `${mins(late)} early` : 'On time'}
                          {dwell != null ? ` · ${mins(dwell)} at the stop` : ''}
                        </p>
                      </>
                    );
                  })()}
                  {canPin && done && !isExactPin(s.location_coordinate_precision, s.location_lat, s.location_lng) && photoPinsFor(s.id).length > 0 && (
                    <button type="button" onClick={() => setPinning(s)} className="mt-1 inline-flex items-center gap-1 rounded-md bg-amber-500/12 px-2 py-0.5 text-[11px] font-medium text-amber-800 hover:bg-amber-500/20 dark:text-amber-300">
                      <Crosshair className="size-3" /> Pin is approximate · {photoPinsFor(s.id).length} photo{photoPinsFor(s.id).length === 1 ? ' has' : 's have'} GPS — check & use
                    </button>
                  )}
                  {(s.delay_note || s.delay_reason) && (
                    <p className="mt-1 flex items-start gap-1.5 rounded-lg bg-rose-500/8 px-2 py-1 text-xs text-rose-700 dark:text-rose-300">
                      <TriangleAlert className="mt-0.5 size-3 shrink-0" />
                      {s.delay_note || String(s.delay_reason).replace(/([a-z])([A-Z])/g, '$1 $2')}
                    </p>
                  )}
                  {needsTimeCheck && (
                    <button
                      type="button"
                      onClick={() => setCheckingTimes(true)}
                      className="mt-1 inline-flex items-center gap-1 rounded-md bg-amber-500/12 px-2 py-0.5 text-[11px] font-medium text-amber-800 hover:bg-amber-500/20 dark:text-amber-300"
                    >
                      <Clock3 className="size-3" /> Screenshot time needs checking — check times
                    </button>
                  )}
                  {stopUpdates.map((u) => (
                    <MediaRow key={u.key} update={u} formatTime={formatTime} onOpen={(idx) => openViewer(u, idx, s, name)} onSend={() => setSharing(u)} />
                  ))}
                </div>
              </li>
            );
          })}
        </ol>

        {unplaced.length > 0 && (
          <div className="border-t border-black/[0.06] px-4 py-3 dark:border-white/10">
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              {unplaced.some((u) => u.stage === 'log')
                ? "Driver's log: screenshots sent without a stop (make them stops in the operator app)"
                : 'Other uploads from this trip'}
            </p>
            {unplaced.map((u) => (
              <MediaRow key={u.key} update={u} formatTime={formatTime} onOpen={(idx) => openViewer(u, idx, undefined, trip.ref_id)} onSend={() => setSharing(u)} />
            ))}
          </div>
        )}
        {bottom}
      </div>

      <SetPinDialog
        open={!!pinning}
        onOpenChange={(o) => !o && setPinning(null)}
        placeName={pinning ? stopTitle(pinning, stops.indexOf(pinning)) : ''}
        lat={pinning && (pinning.location_lat || pinning.location_lng) ? pinning.location_lat : null}
        lng={pinning && (pinning.location_lat || pinning.location_lng) ? pinning.location_lng : null}
        footnote={pinning && sharesCustomerPin(pinning) ? `Also saved to ${pinning.location!.name}, so other open and future trips use it.` : undefined}
        onSave={(pin) => savePin(pinning!, pin)}
        photoPins={pinning ? photoPinsFor(pinning.id) : []}
      />
      <TripTimesReviewDialog
        open={checkingTimes}
        onOpenChange={setCheckingTimes}
        trip={trip}
        documents={documents}
        tz={tz}
        onSaved={onEvidenceUpdated}
      />
      {sharing && <ShareUpdateDialog update={sharing} apiAvailable={!!data?.whatsapp_api_available} onClose={() => setSharing(null)} />}
      <EvidenceLightboxModal
        isOpen={!!viewer}
        onClose={() => setViewer(null)}
        photos={viewer?.items ?? []}
        initialIndex={viewer?.index ?? 0}
        tripId={trip.id}
        onEvidenceUpdated={onEvidenceUpdated}
        tripRef={trip.ref_id}
        customerName={trip.customer?.name}
        customerPhone={trip.customer?.whatsapp_number || trip.customer?.contact_phone}
      />
    </div>
  );
}

/** One step's uploads at a stop: label, thumbnails, and Send / Sent. */
function MediaRow({ update, formatTime, onOpen, onSend }: { update: DriverUpdate; formatTime: (iso: string) => string; onOpen: (index: number) => void; onSend: () => void }) {
  const last = update.shares[0];
  const delivered = update.stage === 'delivered';
  // When they were taken and reached us (a big gap = the phone was offline), how many carry GPS, and office moves.
  const taken = update.items.map((m) => m.captured_at).sort();
  const uploaded = update.items.map((m) => m.uploaded_at).filter((x): x is string => !!x).sort();
  const gps = update.items.filter((m) => m.gps).length;
  const moved = update.items.filter((m) => m.moved_at).length;
  return (
    <div className="mt-2">
    <p className="mb-1 flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground">
      <span>Taken {formatTime(taken[0])}{taken.length > 1 && formatTime(taken[taken.length - 1]) !== formatTime(taken[0]) ? `–${formatTime(taken[taken.length - 1])}` : ''}</span>
      {uploaded.length > 0 && <span>· uploaded {formatTime(uploaded[uploaded.length - 1])}</span>}
      <span>· {gps === update.items.length ? 'all geotagged' : gps > 0 ? `${gps} geotagged` : 'no GPS'}</span>
      {moved > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-1.5 font-medium text-violet-800 dark:bg-violet-950/40 dark:text-violet-300">
          <ArrowRightLeft className="size-3" /> {moved === update.items.length ? 'moved here by the office' : `${moved} moved here by the office`}
        </span>
      )}
    </p>
    <div className="flex items-center gap-2">
      <span className={cn('w-[70px] shrink-0 text-[11px] font-semibold', delivered ? 'text-emerald-700 dark:text-emerald-300' : 'text-muted-foreground')}>
        {STAGE_LABEL[update.stage]}{delivered && ' · POD'}
      </span>
      <div className="flex min-w-0 flex-1 gap-1">
        {update.items.slice(0, 4).map((m, i) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onOpen(i)}
            aria-label="View"
            className="relative size-9 shrink-0 overflow-hidden rounded-lg ring-1 ring-black/10 transition hover:ring-2 hover:ring-blue-500 dark:ring-white/10"
          >
            {m.kind === 'video' ? (
              <span className="flex size-full items-center justify-center bg-charcoal-strong text-white"><Play className="size-3.5 fill-current" /></span>
            ) : (
              <FileThumb url={resolveFileUrl(m.url)} mime={m.mime ?? 'image/jpeg'} />
            )}
            {i === 3 && update.items.length > 4 && (
              <span className="absolute inset-0 flex items-center justify-center bg-charcoal-strong/60 text-[11px] font-semibold text-white">+{update.items.length - 3}</span>
            )}
          </button>
        ))}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        {update.unsent_count > 0 ? (
          <Button size="sm" onClick={onSend} className="h-7 rounded-lg bg-[#25D366] px-2 text-xs font-semibold text-white hover:bg-[#1ebe5b]">
            <WhatsAppIcon className="size-3.5" />
            {update.unsent_count < update.items.length ? `Send ${update.unsent_count} new` : 'Send'}
          </Button>
        ) : (
          <button type="button" onClick={onSend} className="rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted" title="Send again">
            <RefreshCw className="inline size-3" /> Again
          </button>
        )}
        {last && (
          <span className="flex items-center gap-1 text-[10px] text-emerald-700 dark:text-emerald-400">
            <CheckCheck className="size-3" /> {last.shared_by ?? 'Sent'} · {shortAgo(last.shared_at)}
          </span>
        )}
      </div>
    </div>
    </div>
  );
}
