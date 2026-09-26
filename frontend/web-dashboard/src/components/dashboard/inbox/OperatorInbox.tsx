import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Building2, CheckCheck, Clock, FileWarning, MapPin, PackageCheck, PackageOpen, Play, RefreshCw, SignalLow,
  Split, Truck, UserRound, UserX, Video,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WhatsAppIcon } from '@/components/ui/whatsapp-icon';
import UploadDocumentModal from '@/components/ui/UploadDocumentModal';
import { cn } from '@/lib/utils';
import { resolveFileUrl } from '@/lib/documents';
import { whatsAppLink } from '@/lib/share';
import { MediaViewer } from '@/components/maps/live/TripMedia';
import { fleetLiveService, type LiveMediaItem, type LiveMediaStage, type LiveUnit } from '@/services/fleetLiveService';
import { operatorInboxService, type DriverUpdate, type ExpiryItem } from '@/services/operatorInboxService';
import type { Trip } from '@/services/tripService';
import type { DocType } from '@/services/documentService';
import { ShareUpdateDialog } from './ShareUpdateDialog';
import { expiryBucket, expiryPhrase, mediaCount, reminderText, shortAgo, updateTitle, type ExpiryBucket } from './inboxText';

type Tab = 'updates' | 'documents' | 'alerts';

interface Props {
  /** The dashboard's trip list — used for "no driver or truck" alerts. */
  trips: Trip[];
  /** Fly the live map to a trip's truck. */
  onFocusTrip: (tripId: string) => void;
}

const STAGE_STYLE: Record<LiveMediaStage, { icon: typeof Truck; tile: string }> = {
  loaded: { icon: PackageOpen, tile: 'bg-blue-600/10 text-blue-700 dark:text-blue-300' },
  arrived: { icon: MapPin, tile: 'bg-violet-600/10 text-violet-700 dark:text-violet-300' },
  stop: { icon: MapPin, tile: 'bg-slate-500/10 text-slate-600 dark:text-slate-300' },
  delivered: { icon: PackageCheck, tile: 'bg-emerald-600/10 text-emerald-700 dark:text-emerald-300' },
  delay: { icon: Video, tile: 'bg-rose-600/10 text-rose-700 dark:text-rose-300' },
  other: { icon: PackageOpen, tile: 'bg-slate-500/10 text-slate-600 dark:text-slate-300' },
};

/**
 * The operator's inbox beside the live map. Replaces the old Operator Command
 * box with the three things an operator actually works through:
 *  - Driver updates: photos / videos to forward on WhatsApp, with who sent what
 *  - Documents: what has expired or is about to, with renew and remind
 *  - Alerts: delays, trucks gone quiet on a trip, trips missing a driver/truck
 */
export default function OperatorInbox({ trips, onFocusTrip }: Props) {
  const [tab, setTab] = useState<Tab>('updates');

  const updatesQ = useQuery({
    queryKey: ['operator-inbox', 'driver-updates'],
    queryFn: operatorInboxService.getDriverUpdates,
    refetchInterval: 30_000,
  });
  const expiriesQ = useQuery({
    queryKey: ['operator-inbox', 'document-expiries'],
    queryFn: operatorInboxService.getDocumentExpiries,
    refetchInterval: 5 * 60_000,
  });
  // Same query the live map runs — shared cache, no second request.
  const liveQ = useQuery({ queryKey: ['fleet-live-map'], queryFn: fleetLiveService.getLiveMap, refetchInterval: 15_000 });

  const updates = updatesQ.data?.updates ?? [];
  const toSend = updates.filter((u) => u.unsent_count > 0).length;
  const expiries = expiriesQ.data ?? [];
  const urgentDocs = expiries.filter((e) => e.days <= 7).length;
  const alerts = useMemo(() => buildAlerts(liveQ.data?.units ?? [], trips), [liveQ.data, trips]);

  const tabs: { id: Tab; label: string; count: number; tone: string }[] = [
    { id: 'updates', label: 'Driver updates', count: toSend, tone: 'bg-emerald-600' },
    { id: 'documents', label: 'Documents', count: urgentDocs, tone: 'bg-rose-600' },
    { id: 'alerts', label: 'Alerts', count: alerts.length, tone: 'bg-amber-500' },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[18px] border border-black/[0.06] bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
      <div className="flex shrink-0 items-center gap-1 border-b border-black/[0.06] p-2 dark:border-white/10">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors',
              tab === t.id ? 'bg-charcoal text-white dark:bg-white dark:text-slate-900' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <span className="truncate">{t.label}</span>
            {t.count > 0 && (
              <span className={cn('min-w-4 rounded-full px-1 text-[10px] leading-4 font-semibold text-white tabular-nums', t.tone)}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'updates' && (
          <DriverUpdatesList
            updates={updates}
            loading={updatesQ.isLoading}
            apiAvailable={!!updatesQ.data?.whatsapp_api_available}
            onFocusTrip={onFocusTrip}
          />
        )}
        {tab === 'documents' && <DocumentsList items={expiries} loading={expiriesQ.isLoading} />}
        {tab === 'alerts' && <AlertsList alerts={alerts} onFocusTrip={onFocusTrip} />}
      </div>
    </div>
  );
}

// ── Driver updates ──────────────────────────────────────────────────────────

function DriverUpdatesList({
  updates, loading, apiAvailable, onFocusTrip,
}: { updates: DriverUpdate[]; loading: boolean; apiAvailable: boolean; onFocusTrip: (id: string) => void }) {
  const [showSent, setShowSent] = useState(false);
  const [sharing, setSharing] = useState<DriverUpdate | null>(null);
  const [viewer, setViewer] = useState<{ items: LiveMediaItem[]; index: number; title: string } | null>(null);

  const pending = updates.filter((u) => u.unsent_count > 0);
  const sent = updates.filter((u) => u.unsent_count === 0);
  const list = showSent ? updates : pending;

  if (loading) return <ListNote>Loading driver updates…</ListNote>;

  return (
    <>
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5 text-[11px] text-muted-foreground">
        <span>{pending.length ? `${pending.length} to forward` : 'Everything is forwarded'} · last 3 days</span>
        {sent.length > 0 && (
          <button type="button" onClick={() => setShowSent((v) => !v)} className="font-medium text-blue-600 hover:underline dark:text-blue-400">
            {showSent ? 'Hide sent' : `Show sent (${sent.length})`}
          </button>
        )}
      </div>
      {list.length === 0 ? (
        <ListNote>
          {updates.length === 0 ? 'No photos or videos from drivers in the last 3 days.' : 'All driver updates have been forwarded.'}
        </ListNote>
      ) : (
        <ul>
          {list.map((u) => {
            const style = STAGE_STYLE[u.stage];
            const partlySent = u.unsent_count > 0 && u.unsent_count < u.items.length;
            const last = u.shares[0];
            return (
              <li
                key={`${u.trip.id}-${u.key}`}
                className="group flex cursor-pointer gap-2.5 border-t border-black/[0.05] px-3 py-2.5 first:border-t-0 hover:bg-muted/50 dark:border-white/5"
                onClick={() => onFocusTrip(u.trip.id)}
              >
                <span className={cn('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg', style.tile)}>
                  <style.icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-foreground">{updateTitle(u)}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {[u.customer?.name, u.vehicle_plate, mediaCount(u), shortAgo(u.latest_at)].filter(Boolean).join(' · ')}
                  </p>
                  {u.delay_note && <p className="mt-0.5 truncate text-[11px] text-rose-700 dark:text-rose-300">{u.delay_note}</p>}
                  <div className="mt-1.5 flex gap-1">
                    {u.items.slice(0, 5).map((m, i) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setViewer({ items: u.items, index: i, title: updateTitle(u) }); }}
                        className="relative size-7 overflow-hidden rounded-md ring-1 ring-black/10 hover:ring-2 hover:ring-blue-500 dark:ring-white/10"
                        aria-label="View"
                      >
                        {m.kind === 'video' ? (
                          <span className="flex size-full items-center justify-center bg-charcoal text-white"><Play className="size-3 fill-current" /></span>
                        ) : (
                          <img src={resolveFileUrl(m.url)} alt="" loading="lazy" className="size-full object-cover" />
                        )}
                        {i === 4 && u.items.length > 5 && (
                          <span className="absolute inset-0 flex items-center justify-center bg-charcoal-strong/55 text-[10px] font-semibold text-white">+{u.items.length - 4}</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1" onClick={(e) => e.stopPropagation()}>
                  {u.unsent_count > 0 ? (
                    <Button size="sm" onClick={() => setSharing(u)} className="h-8 rounded-lg bg-[#25D366] px-2.5 font-semibold text-white hover:bg-[#1ebe5b]">
                      <WhatsAppIcon className="size-3.5" /> {partlySent ? `Send ${u.unsent_count} new` : 'Send'}
                    </Button>
                  ) : (
                    <button type="button" onClick={() => setSharing(u)} className="rounded-md px-1.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted" title="Send again">
                      <RefreshCw className="inline size-3" /> Again
                    </button>
                  )}
                  {last && (
                    <span className="flex items-center gap-1 text-[10px] text-emerald-700 dark:text-emerald-400" title={`${u.shares.length} forward(s)`}>
                      <CheckCheck className="size-3" />
                      {last.shared_by ?? 'Sent'} · {shortAgo(last.shared_at)}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {sharing && <ShareUpdateDialog update={sharing} apiAvailable={apiAvailable} onClose={() => setSharing(null)} />}
      {viewer && (
        <MediaViewer
          items={viewer.items}
          index={viewer.index}
          title={viewer.title}
          onClose={() => setViewer(null)}
          onIndex={(index) => setViewer((v) => (v ? { ...v, index } : v))}
        />
      )}
    </>
  );
}

// ── Documents ───────────────────────────────────────────────────────────────

const BUCKETS: { id: ExpiryBucket; label: string; tone: string }[] = [
  { id: 'expired', label: 'Expired', tone: 'text-rose-700 dark:text-rose-400' },
  { id: 'week', label: 'Next 7 days', tone: 'text-amber-700 dark:text-amber-400' },
  { id: 'month', label: 'Next 30 days', tone: 'text-muted-foreground' },
];

const ENTITY_ICON: Record<ExpiryItem['entity_type'], typeof Truck> = {
  Vehicle: Truck, Driver: UserRound, Customer: Building2, Company: Building2, Other: FileWarning,
};

function DocumentsList({ items, loading }: { items: ExpiryItem[]; loading: boolean }) {
  const queryClient = useQueryClient();
  const [renewing, setRenewing] = useState<ExpiryItem | null>(null);

  if (loading) return <ListNote>Checking documents…</ListNote>;
  if (items.length === 0) return <ListNote>Nothing expires in the next 30 days.</ListNote>;

  return (
    <>
      {BUCKETS.map((b) => {
        const rows = items.filter((e) => expiryBucket(e) === b.id);
        if (rows.length === 0) return null;
        return (
          <section key={b.id}>
            <p className={cn('px-3 pt-2.5 pb-1 text-[11px] font-semibold', b.tone)}>{b.label} · {rows.length}</p>
            <ul>
              {rows.map((e) => {
                const Icon = ENTITY_ICON[e.entity_type] ?? FileWarning;
                return (
                  <li key={e.key} className="flex items-center gap-2.5 border-t border-black/[0.05] px-3 py-2 first:border-t-0 dark:border-white/5">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-foreground">
                        <span className={e.entity_type === 'Vehicle' ? 'font-mono' : ''}>{e.entity_name}</span> · {e.label}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        <span className={e.days < 0 ? 'text-rose-700 dark:text-rose-400' : e.days <= 7 ? 'text-amber-700 dark:text-amber-400' : ''}>
                          {expiryPhrase(e.days)}
                        </span>
                        {e.on_trip_ref && ` · on ${e.on_trip_ref} now`}
                      </p>
                    </div>
                    {e.contact && (
                      <Button variant="outline" size="sm" className="h-8 rounded-lg px-2" asChild title={`Remind ${e.contact.name} on WhatsApp`}>
                        <a href={whatsAppLink(e.contact.phone, reminderText(e))} target="_blank" rel="noreferrer">
                          <WhatsAppIcon className="size-3.5" /> Remind
                        </a>
                      </Button>
                    )}
                    <Button variant="outline" size="sm" className="h-8 rounded-lg px-2.5" onClick={() => setRenewing(e)}>
                      Renew
                    </Button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      {renewing && (
        <UploadDocumentModal
          isOpen
          onClose={() => setRenewing(null)}
          entityType={renewing.entity_type}
          entityId={renewing.entity_id}
          docType={(renewing.doc_type as DocType | null) ?? undefined}
          documentTypeId={renewing.document_type_id ?? undefined}
          documentTypeName={renewing.label}
          onUploadSuccess={() => {
            setRenewing(null);
            queryClient.invalidateQueries({ queryKey: ['operator-inbox', 'document-expiries'] });
          }}
        />
      )}
    </>
  );
}

// ── Alerts ──────────────────────────────────────────────────────────────────

interface Alert {
  key: string;
  icon: typeof Truck;
  tone: string;
  title: string;
  detail: string;
  tripId: string | null;
}

/** GPS silence on a running trip worth flagging. */
const QUIET_MINUTES = 30;

function buildAlerts(units: LiveUnit[], trips: Trip[]): Alert[] {
  const out: Alert[] = [];
  const now = Date.now();
  for (const u of units) {
    const t = u.trip;
    if (!t) continue;
    const name = u.vehicle?.plate_number ?? u.driver?.name ?? '';
    const next = t.next_stop_index != null ? t.stops[t.next_stop_index] : null;
    if (t.phase === 'delayed') {
      out.push({
        key: `delay-${t.id}`, icon: Clock, tone: 'bg-rose-600/10 text-rose-700 dark:text-rose-300',
        title: `${t.ref_id ?? 'Trip'} is delayed`,
        detail: [name, next ? `heading to ${next.name ?? 'next stop'}` : null].filter(Boolean).join(' · '),
        tripId: t.id,
      });
    }
    const quietMin = u.position ? (now - new Date(u.position.recorded_at).getTime()) / 60000 : Infinity;
    if (t.phase !== 'upcoming' && quietMin > QUIET_MINUTES) {
      out.push({
        key: `quiet-${t.id}`, icon: SignalLow, tone: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
        title: `${name || t.ref_id} has no GPS ${Number.isFinite(quietMin) ? `for ${quietMin < 120 ? `${Math.round(quietMin)} min` : `${Math.round(quietMin / 60)} h`}` : 'at all'}`,
        detail: `On trip ${t.ref_id ?? ''}${u.driver?.name ? ` · call ${u.driver.name}` : ''}`,
        tripId: t.id,
      });
    }
    if (u.feeds_gap_m != null && u.feeds_gap_m > 1000) {
      out.push({
        key: `gap-${t.id}`, icon: Split, tone: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
        title: `${name}: tracker and phone disagree`,
        detail: `${(u.feeds_gap_m / 1000).toFixed(1)} km apart · ${t.ref_id ?? ''}`,
        tripId: t.id,
      });
    }
  }
  const soon = now + 48 * 3600_000;
  for (const t of trips) {
    if (t.is_third_party || ['Completed', 'Cancelled', 'Invoiced'].includes(t.status)) continue;
    const missing = [!t.driver ? 'driver' : null, !t.vehicle ? 'truck' : null].filter(Boolean);
    if (missing.length === 0) continue;
    const start = t.planned_start ? new Date(t.planned_start).getTime() : null;
    if (start != null && start > soon) continue;
    out.push({
      key: `unassigned-${t.id}`, icon: UserX, tone: 'bg-rose-600/10 text-rose-700 dark:text-rose-300',
      title: `${t.ref_id} has no ${missing.join(' or ')}`,
      detail: [t.customer?.name, start ? (start < now ? 'should have started' : `starts ${new Date(start).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}`) : 'no start time'].filter(Boolean).join(' · '),
      tripId: null,
    });
  }
  return out;
}

function AlertsList({ alerts, onFocusTrip }: { alerts: Alert[]; onFocusTrip: (id: string) => void }) {
  const navigate = useNavigate();
  if (alerts.length === 0) return <ListNote>No delays, silent trucks or unassigned trips right now.</ListNote>;
  return (
    <ul>
      {alerts.map((a) => (
        <li key={a.key}>
          <button
            type="button"
            onClick={() => (a.tripId ? onFocusTrip(a.tripId) : navigate(`/trips/${a.key.replace('unassigned-', '')}`))}
            className="flex w-full items-center gap-2.5 border-t border-black/[0.05] px-3 py-2.5 text-left hover:bg-muted/50 dark:border-white/5"
          >
            <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', a.tone)}>
              <a.icon className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-foreground">{a.title}</span>
              <span className="block truncate text-[11px] text-muted-foreground">{a.detail}</span>
            </span>
            <span className="shrink-0 text-[11px] font-medium text-blue-600 dark:text-blue-400">
              {a.tripId ? 'Show on map' : 'Assign'}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function ListNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-6 py-10 text-center text-xs text-muted-foreground">{children}</p>
  );
}
