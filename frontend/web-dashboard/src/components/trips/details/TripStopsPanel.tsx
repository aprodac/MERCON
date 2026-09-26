import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, CheckCheck, Clock3, Play, RefreshCw, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WhatsAppIcon } from '@/components/ui/whatsapp-icon';
import { cn } from '@/lib/utils';
import { resolveFileUrl } from '@/lib/documents';
import { EvidenceLightboxModal, type LightboxPhotoItem } from '@/components/trips/EvidenceLightboxModal';
import { ShareUpdateDialog } from '@/components/dashboard/inbox/ShareUpdateDialog';
import { shortAgo } from '@/components/dashboard/inbox/inboxText';
import { operatorInboxService, type DriverUpdate } from '@/services/operatorInboxService';
import type { TripPhase } from '@/services/fleetLiveService';
import type { Trip, TripStop } from '@/services/tripService';
import { STAGE_LABEL, minutesLate, timeReviewOf, toLightboxItems } from './stopEvidence';

/** Arrival within this many minutes of the plan counts as on time. */
const ON_TIME_GRACE_MIN = 5;

interface Props {
  trip: Trip;
  phase: TripPhase;
  documents: any[];
  formatTime: (iso: string) => string;
  formatDateTime: (iso: string) => string;
  onEvidenceUpdated: () => void;
  /** State-specific block above the stops (pre-trip checks, trip summary, …). */
  top?: React.ReactNode;
  /** Shown after the stops (the page puts the trip's paperwork here). */
  bottom?: React.ReactNode;
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
export default function TripStopsPanel({ trip, phase, documents, formatTime, formatDateTime, onEvidenceUpdated, top, bottom }: Props) {
  const [sharing, setSharing] = useState<DriverUpdate | null>(null);
  const [viewer, setViewer] = useState<{ items: LightboxPhotoItem[]; index: number } | null>(null);

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

  const updatesFor = (stopId: string | null) => updates.filter((u) => (u.stop?.id ?? null) === stopId);
  const unplaced = updatesFor(null);

  const openViewer = (u: DriverUpdate, index: number, stop: TripStop | undefined, name: string) =>
    setViewer({ items: toLightboxItems(u.items, docsById, stop, name, formatTime), index });

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-black/[0.06] bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
      <div className="flex shrink-0 items-center justify-between border-b border-black/[0.06] px-4 py-3 dark:border-white/10">
        <p className="text-sm font-semibold text-foreground">Stops</p>
        <p className="text-xs text-muted-foreground">{doneCount} of {stops.length} done</p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {top}
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
                  <p className={cn('truncate text-sm', isNext ? 'font-semibold text-foreground' : 'font-medium text-foreground')}>{name}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.stop_type}
                    {s.actual_arrival
                      ? ` · arrived ${formatDateTime(s.actual_arrival)}${s.actual_departure ? ` · left ${formatTime(s.actual_departure)}` : ''}`
                      : s.planned_arrival ? ` · due ${formatDateTime(s.planned_arrival)}` : ''}
                    {late != null && (
                      <span className={cn('ml-1 font-medium', late > ON_TIME_GRACE_MIN ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400')}>
                        · {late > ON_TIME_GRACE_MIN ? `${late} min late` : 'on time'}
                      </span>
                    )}
                  </p>
                  {(s.delay_note || s.delay_reason) && (
                    <p className="mt-1 flex items-start gap-1.5 rounded-lg bg-rose-500/8 px-2 py-1 text-xs text-rose-700 dark:text-rose-300">
                      <TriangleAlert className="mt-0.5 size-3 shrink-0" />
                      {s.delay_note || String(s.delay_reason).replace(/([a-z])([A-Z])/g, '$1 $2')}
                    </p>
                  )}
                  {needsTimeCheck && (
                    <p className="mt-1 inline-flex items-center gap-1 rounded-md bg-amber-500/12 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:text-amber-300">
                      <Clock3 className="size-3" /> Screenshot time needs checking — open the photo
                    </p>
                  )}
                  {stopUpdates.map((u) => (
                    <MediaRow key={u.key} update={u} onOpen={(idx) => openViewer(u, idx, s, name)} onSend={() => setSharing(u)} />
                  ))}
                </div>
              </li>
            );
          })}
        </ol>

        {unplaced.length > 0 && (
          <div className="border-t border-black/[0.06] px-4 py-3 dark:border-white/10">
            <p className="mb-1 text-xs font-medium text-muted-foreground">Other uploads from this trip</p>
            {unplaced.map((u) => (
              <MediaRow key={u.key} update={u} onOpen={(idx) => openViewer(u, idx, undefined, trip.ref_id)} onSend={() => setSharing(u)} />
            ))}
          </div>
        )}
        {bottom}
      </div>

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
function MediaRow({ update, onOpen, onSend }: { update: DriverUpdate; onOpen: (index: number) => void; onSend: () => void }) {
  const last = update.shares[0];
  const delivered = update.stage === 'delivered';
  return (
    <div className="mt-2 flex items-center gap-2">
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
              <img src={resolveFileUrl(m.url)} alt="" loading="lazy" className="size-full object-cover" />
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
  );
}
