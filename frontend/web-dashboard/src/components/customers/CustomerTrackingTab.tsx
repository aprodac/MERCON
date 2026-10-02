import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  CalendarClock, Copy, ExternalLink, Eye, Image as ImageIcon, Link2, MapPinned, MessageSquareText, Navigation, RefreshCw, TriangleAlert,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import ConfirmModal from '@/components/ui/ConfirmModal';
import { WhatsAppIcon } from '@/components/ui/whatsapp-icon';
import { customerService, type Customer, type CreateCustomerPayload } from '@/services/customerService';
import { trackingService } from '@/services/trackingService';
import { whatsAppLink } from '@/lib/share';
import { timeAgo } from '@/lib/fleetLive';
import { cn } from '@/lib/utils';
import { routeOf } from '@/components/details/DetailKit';
import { Badge, EmptyBlock, IconTile, Panel, TripStatusBadge, ui } from '@/components/customers/customerUi';

type TrackingField = 'tracking_enabled' | 'tracking_auto_link' | 'tracking_show_deadline' | 'tracking_show_delay_reason' | 'tracking_show_photos';

const FIELDS: { key: TrackingField; label: string; help: string; icon: typeof Link2; fallback: boolean }[] = [
  { key: 'tracking_auto_link', label: 'Add the link to status messages', help: 'Truck details, status update, ETA and delay messages end with "Track live: <link>".', icon: MessageSquareText, fallback: true },
  { key: 'tracking_show_deadline', label: 'Show planned arrival times', help: 'They see each stop\'s planned time and "On time" / "Late by…".', icon: CalendarClock, fallback: false },
  { key: 'tracking_show_delay_reason', label: 'Show the delay reason', help: 'The reason category ops log (e.g. "Delayed · Traffic"). The driver\'s own note is never shown.', icon: TriangleAlert, fallback: false },
  { key: 'tracking_show_photos', label: 'Show loading and delivery photos', help: 'POD and cargo photos on finished stops. Photos are deleted 60 days after the trip.', icon: ImageIcon, fallback: true },
];

async function copyText(text: string, done = 'Link copied') {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(done);
  } catch {
    toast.error("Couldn't copy — open the link and copy it from the address bar");
  }
}

/**
 * Customer → Live tracking: the switch, the all-trucks page link, the link for
 * every truck on the road right now, and what the customer gets to see.
 * Switches save as they're flipped.
 */
export default function CustomerTrackingTab({ customer, liveTrips = [] }: { customer: Customer; liveTrips?: any[] }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const enabled = customer.tracking_enabled ?? true;
  const [renewOpen, setRenewOpen] = useState(false);

  const save = useMutation({
    mutationFn: (patch: Partial<CreateCustomerPayload>) => customerService.update(customer.id, patch),
    onSuccess: (updated) => {
      qc.setQueryData(['customer', customer.id], (old: Customer | undefined) => (old ? { ...old, ...updated } : updated));
      qc.invalidateQueries({ queryKey: ['customer-tracking-link', customer.id] });
      qc.invalidateQueries({ queryKey: ['customer-trip-links', customer.id] });
      toast.success('Saved');
    },
    onError: () => toast.error("Couldn't save. Try again."),
  });

  const linkKey = ['customer-tracking-link', customer.id];
  const { data: link, isLoading: linkLoading } = useQuery({
    queryKey: linkKey,
    queryFn: () => trackingService.getCustomerLink(customer.id),
    enabled,
    staleTime: 30_000,
  });
  const renew = useMutation({
    mutationFn: () => trackingService.getCustomerLink(customer.id, true),
    onSuccess: (l) => {
      qc.setQueryData(linkKey, l);
      setRenewOpen(false);
      toast.success('New link ready — the old one no longer works');
    },
    onError: () => toast.error("Couldn't make a new link. Try again."),
  });

  // The same per-trip links the trip list shares (created on first ask).
  const liveIds = liveTrips.map((t) => t.id);
  const { data: tripLinks, isLoading: tripLinksLoading } = useQuery({
    queryKey: ['customer-trip-links', customer.id, liveIds],
    queryFn: () => trackingService.getTripLinks(liveIds),
    enabled: enabled && liveIds.length > 0,
    staleTime: 30_000,
  });

  const sendAll = () => {
    if (!link?.url) return;
    const text = `*${customer.name} · live trucks*\nAll your trucks on the road, live: ${link.url}`;
    window.open(whatsAppLink(customer.whatsapp_number ?? null, text), '_blank', 'noopener');
  };
  const sendTrip = (trip: any, url: string) => {
    const route = routeOf(trip);
    const text = `*${customer.name} · ${trip.ref_id || 'Trip'}*\n${route.origin} → ${route.destination}\nTrack live: ${url}`;
    window.open(whatsAppLink(customer.whatsapp_number ?? null, text), '_blank', 'noopener');
  };

  return (
    <div className="flex flex-col gap-6">
      {/* ── Master switch ── */}
      <section className={cn(ui.card, 'flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between')}>
        <div className="flex items-start gap-3">
          <IconTile icon={MapPinned} tone={enabled ? 'emerald' : 'slate'} />
          <div>
            <div className="flex items-center gap-2">
              <h2 className={ui.h2}>Live tracking for {customer.name}</h2>
              <Badge tone={enabled ? 'emerald' : 'slate'} dot>{enabled ? 'On' : 'Off'}</Badge>
            </div>
            <p className={cn(ui.muted, 'mt-0.5 max-w-2xl')}>
              {enabled
                ? 'Every trip gets a link they open from WhatsApp to see the truck live, the arrival time and the stops — no need to ask you for updates.'
                : 'Tracking is off. Links already sent show "Tracking isn\'t available" and messages go without a link.'}
            </p>
          </div>
        </div>
        <label className="flex shrink-0 items-center gap-3 text-sm font-medium text-slate-700 dark:text-slate-200">
          {enabled ? 'Turn off' : 'Turn on'}
          <Switch checked={enabled} disabled={save.isPending} onCheckedChange={(v) => save.mutate({ tracking_enabled: v })} aria-label="Tracking links on" />
        </label>
      </section>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-6 xl:col-span-7">
          {/* ── All-trucks page ── */}
          <Panel
            title="All-trucks page"
            description={`One link showing every ${customer.name} truck on the road, about to load, or delivered in the last 12 hours. Good for monthly contracts — they bookmark it once.`}
            icon={Link2}
            tone="blue"
          >
            {!enabled ? (
              <p className={ui.muted}>Turn tracking on to get this link.</p>
            ) : linkLoading || !link?.url ? (
              <div className="h-10 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 py-1 pl-3 pr-1 dark:border-slate-700 dark:bg-slate-800/60">
                  <span className="min-w-0 flex-1 truncate text-[13px] text-slate-700 dark:text-slate-200">{link.url}</span>
                  <button type="button" onClick={() => copyText(link.url!)} className={cn(ui.btn, ui.btnOutline, 'h-8 bg-white')}>
                    <Copy className="size-4" /> Copy
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={sendAll} className={cn(ui.btn, 'bg-[#25D366] text-white hover:bg-[#1EBE5B]')}>
                    <WhatsAppIcon className="size-4" /> Send on WhatsApp
                  </button>
                  <button type="button" onClick={() => window.open(link.url!, '_blank', 'noopener')} className={cn(ui.btn, ui.btnOutline)}>
                    <ExternalLink className="size-4" /> Open
                  </button>
                  <button type="button" onClick={() => setRenewOpen(true)} className={cn(ui.btn, ui.btnGhost)}>
                    <RefreshCw className="size-4" /> New link
                  </button>
                  <span className="ml-auto inline-flex items-center gap-1.5 text-[13px] text-slate-500">
                    <Eye className="size-4" />
                    {link.open_count > 0 ? `Opened ${link.open_count}× · last ${timeAgo(link.last_opened_at)}` : 'Not opened yet'}
                  </span>
                </div>
              </div>
            )}
          </Panel>

          {/* ── Per-trip links for trucks on the road ── */}
          <Panel
            title="Trucks on the road"
            description="Each trip's own tracking link — send it when they ask where a truck is"
            icon={Navigation}
            tone="emerald"
            action={liveTrips.length > 0 ? <Badge tone="emerald" dot pulse>{liveTrips.length} live</Badge> : undefined}
            flush={enabled && liveTrips.length > 0}
          >
            {!enabled ? (
              <p className={ui.muted}>Turn tracking on to share trip links.</p>
            ) : liveTrips.length === 0 ? (
              <EmptyBlock icon={Navigation} title="No trucks on the road" text="Trips that are loading, moving or delayed show here with their link." />
            ) : (
              <ul className="divide-y divide-slate-100 border-t border-slate-100 dark:divide-slate-800 dark:border-slate-800">
                {liveTrips.map((trip) => {
                  const route = routeOf(trip);
                  const tl = tripLinks?.[trip.id];
                  return (
                    <li key={trip.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                      <button type="button" onClick={() => navigate(`/trips/${trip.id}`)} className="group min-w-0 flex-1 text-left cursor-pointer">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-slate-900 tabular-nums group-hover:text-[#E5533F] dark:text-white">{trip.ref_id || trip.id.slice(0, 8).toUpperCase()}</span>
                          <TripStatusBadge status={trip.status} />
                        </div>
                        <p className="mt-1 truncate text-sm text-slate-800 dark:text-slate-200">{route.origin} <span className="text-slate-400">→</span> {route.destination}</p>
                        <p className="mt-0.5 text-[13px] text-slate-500">
                          {tripLinksLoading ? 'Getting link…' : !tl?.url ? 'No link' : tl.open_count > 0 ? `Opened ${tl.open_count}× · last ${timeAgo(tl.last_opened_at)}` : 'Link not opened yet'}
                        </p>
                      </button>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button type="button" disabled={!tl?.url} onClick={() => tl?.url && sendTrip(trip, tl.url)} className={cn(ui.btn, ui.btnOutline, 'h-8')} title="Send on WhatsApp">
                          <WhatsAppIcon className="size-4 text-emerald-600" /> Send
                        </button>
                        <button type="button" disabled={!tl?.url} onClick={() => tl?.url && copyText(tl.url)} className={cn(ui.btn, ui.btnOutline, 'h-8 w-8 px-0')} title="Copy link" aria-label="Copy link">
                          <Copy className="size-4" />
                        </button>
                        <button type="button" onClick={() => navigate(`/trips/${trip.id}/track`)} className={cn(ui.btn, ui.btnGhost, 'h-8')}>
                          <MapPinned className="size-4" /> Track
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>

        {/* ── What the customer sees ── */}
        <Panel title="What they see" description="Applies to every tracking link for this customer" className="xl:col-span-5" flush>
          <ul className={cn('divide-y divide-slate-100 border-t border-slate-100 dark:divide-slate-800 dark:border-slate-800', !enabled && 'pointer-events-none opacity-50')}>
            {FIELDS.map((f) => {
              const Icon = f.icon;
              const value = customer[f.key] ?? f.fallback;
              return (
                <li key={f.key}>
                  <label className="flex cursor-pointer items-start gap-3 px-5 py-4">
                    <Icon className="mt-0.5 size-4 shrink-0 text-slate-400" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-slate-900 dark:text-white">{f.label}</span>
                      <span className="mt-0.5 block text-[13px] text-slate-500 dark:text-slate-400">{f.help}</span>
                    </span>
                    <Switch checked={value} disabled={save.isPending || !enabled} onCheckedChange={(v) => save.mutate({ [f.key]: v })} aria-label={f.label} />
                  </label>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>

      <ConfirmModal
        isOpen={renewOpen}
        onClose={() => setRenewOpen(false)}
        title="Make a new all-trucks link?"
        message="The current link stops working for everyone who has it. Use this if it was sent to the wrong person."
        confirmLabel="Make new link"
        isLoading={renew.isPending}
        onConfirm={() => renew.mutate()}
      />
    </div>
  );
}
