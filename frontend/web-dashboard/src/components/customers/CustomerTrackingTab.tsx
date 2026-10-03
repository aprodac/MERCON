import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Copy, ExternalLink, Eye, Link2, MapPinned, MoreHorizontal, RefreshCw, Truck } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import ConfirmModal from '@/components/ui/ConfirmModal';
import { WhatsAppIcon } from '@/components/ui/whatsapp-icon';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { customerService, type Customer, type CreateCustomerPayload } from '@/services/customerService';
import { trackingService, type TrackingOpen } from '@/services/trackingService';
import { whatsAppLink } from '@/lib/share';
import { timeAgo } from '@/lib/fleetLive';
import { formatInDeploymentTz, useDeploymentTimezone } from '@/lib/datetime';
import { cn } from '@/lib/utils';
import { routeOf } from '@/components/details/DetailKit';
import { Badge, Panel, TripStatusBadge, ui } from '@/components/customers/customerUi';
import { whatsAppGroupUrl } from '@mercon/shared-types';

type TrackingField = 'tracking_auto_link' | 'tracking_show_deadline' | 'tracking_show_delay_reason' | 'tracking_show_photos';

/** Short labels; the longer explanation is the hover text. */
const VISIBILITY: { key: TrackingField; label: string; hint: string; fallback: boolean }[] = [
  { key: 'tracking_auto_link', label: 'Link in WhatsApp messages', hint: 'Status, ETA and delay messages end with "Track live: <link>"', fallback: true },
  { key: 'tracking_show_deadline', label: 'Planned arrival times', hint: 'Each stop shows its planned time and "On time" / "Late by…"', fallback: false },
  { key: 'tracking_show_delay_reason', label: 'Delay reason', hint: 'The reason category (e.g. "Traffic") — never the driver\'s own note', fallback: false },
  { key: 'tracking_show_photos', label: 'Loading & delivery photos', hint: 'POD and cargo photos on finished stops (kept 60 days)', fallback: true },
];

const HISTORY_PAGE = 25;

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success('Link copied');
  } catch {
    toast.error("Couldn't copy — open the link and copy it from the address bar");
  }
}

function opensLabel(count: number, last: string | null | undefined) {
  return count > 0 ? `Opened ${count}× · ${timeAgo(last)}` : 'Not opened yet';
}

/**
 * Customer → Live tracking: the all-trucks link, each live trip's link, every
 * time the customer opened one, and what they get to see. Switches save as flipped.
 */
export default function CustomerTrackingTab({ customer, liveTrips = [] }: { customer: Customer; liveTrips?: any[] }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const tz = useDeploymentTimezone();
  const enabled = customer.tracking_enabled ?? true;
  const [renewOpen, setRenewOpen] = useState(false);
  const [shown, setShown] = useState(HISTORY_PAGE);
  const [historyFilter, setHistoryFilter] = useState<'all' | 'all_trucks' | 'trip'>('all');

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

  const liveIds = liveTrips.map((t) => t.id);
  const { data: tripLinks, isLoading: tripLinksLoading } = useQuery({
    queryKey: ['customer-trip-links', customer.id, liveIds],
    queryFn: () => trackingService.getTripLinks(liveIds),
    enabled: enabled && liveIds.length > 0,
    staleTime: 30_000,
  });

  const { data: history, isLoading: historyLoading } = useQuery({
    queryKey: ['customer-tracking-opens', customer.id],
    queryFn: () => trackingService.getCustomerOpens(customer.id, 500),
    refetchInterval: 60_000,
  });

  const opens = useMemo(
    () => (history?.opens ?? []).filter((o) => historyFilter === 'all' || o.link.kind === historyFilter),
    [history, historyFilter],
  );
  // Newest first, grouped by day: "Today", "Yesterday", "30 Sep 2026".
  const days = useMemo(() => {
    const todayKey = formatInDeploymentTz(new Date(), tz, 'yyyy-MM-dd');
    const yesterdayKey = formatInDeploymentTz(new Date(Date.now() - 86_400_000), tz, 'yyyy-MM-dd');
    const groups: { key: string; label: string; items: TrackingOpen[] }[] = [];
    for (const o of opens.slice(0, shown)) {
      const key = formatInDeploymentTz(o.opened_at, tz, 'yyyy-MM-dd');
      let g = groups[groups.length - 1];
      if (!g || g.key !== key) {
        g = { key, label: key === todayKey ? 'Today' : key === yesterdayKey ? 'Yesterday' : formatInDeploymentTz(o.opened_at, tz, 'EEE, d MMM yyyy'), items: [] };
        groups.push(g);
      }
      g.items.push(o);
    }
    return groups;
  }, [opens, shown, tz]);

  const sendAll = () => {
    if (!link?.url) return;
    window.open(whatsAppLink(customer.whatsapp_number ?? null, `*${customer.name} · live trucks*\nAll your trucks on the road, live: ${link.url}`), '_blank', 'noopener');
  };
  const sendTrip = (trip: any, url: string) => {
    const route = routeOf(trip);
    window.open(whatsAppLink(customer.whatsapp_number ?? null, `*${customer.name} · ${trip.ref_id || 'Trip'}*\n${route.origin} → ${route.destination}\nTrack live: ${url}`), '_blank', 'noopener');
  };

  const tripOpenCount = (history?.opens ?? []).filter((o) => o.link.kind === 'trip').length;
  const fleetOpenCount = (history?.opens ?? []).filter((o) => o.link.kind === 'all_trucks').length;

  return (
    <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-12">
      <div className="flex min-w-0 flex-col gap-6 xl:col-span-8">
        {!enabled && (
          <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
            Tracking is off for {customer.name}. Turn it on to share links.
          </div>
        )}

        {enabled && (<>
        {/* ── All-trucks link ── */}
        <Panel
          title="All-trucks link"
          icon={Link2}
          tone="blue"
          action={link?.url ? <span className="text-[13px] text-slate-500">{opensLabel(link.open_count, link.last_opened_at)}</span> : undefined}
        >
          {linkLoading || !link?.url ? (
            <div className="h-9 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={() => copyText(link.url!)}
                title="Copy link"
                className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-left text-[13px] text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200 cursor-pointer"
              >
                <span className="min-w-0 flex-1 truncate">{link.url}</span>
                <Copy className="size-4 shrink-0 text-slate-400" />
              </button>
              <div className="flex items-center gap-2">
                <button type="button" onClick={sendAll} className={cn(ui.btn, 'bg-[#25D366] text-white hover:bg-[#1EBE5B]')}>
                  <WhatsAppIcon className="size-4" /> Send
                </button>
                <button type="button" onClick={() => window.open(link.url!, '_blank', 'noopener')} className={cn(ui.btn, ui.btnOutline, 'w-9 px-0')} title="Open" aria-label="Open link">
                  <ExternalLink className="size-4" />
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" className={cn(ui.btn, ui.btnOutline, 'w-9 px-0')} aria-label="More">
                      <MoreHorizontal className="size-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem onClick={() => setRenewOpen(true)} className="text-[13px]">
                      <RefreshCw className="mr-2 size-4 text-slate-500" /> Replace with a new link
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          )}
        </Panel>

        {/* ── Each live trip's own link ── */}
        <Panel
          title="On the road"
          icon={Truck}
          tone="emerald"
          action={liveTrips.length > 0 ? <Badge tone="emerald" dot pulse>{liveTrips.length} live</Badge> : undefined}
          flush={liveTrips.length > 0}
        >
          {liveTrips.length === 0 ? (
            <p className={ui.muted}>No trucks on the road right now.</p>
          ) : (
            <ul className="divide-y divide-slate-100 border-t border-slate-100 dark:divide-slate-800 dark:border-slate-800">
              {liveTrips.map((trip) => {
                const route = routeOf(trip);
                const tl = tripLinks?.[trip.id];
                return (
                  <li key={trip.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:gap-4">
                    <button type="button" onClick={() => navigate(`/trips/${trip.id}`)} className="group min-w-0 flex-1 text-left cursor-pointer">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900 tabular-nums group-hover:text-[#E5533F] dark:text-white">{trip.ref_id || trip.id.slice(0, 8).toUpperCase()}</span>
                        <TripStatusBadge status={trip.status} />
                      </span>
                      <span className="mt-0.5 block truncate text-[13px] text-slate-600 dark:text-slate-300">{route.origin} → {route.destination}</span>
                    </button>
                    <span className="flex items-center gap-1.5 text-[13px] text-slate-500 sm:w-40">
                      <Eye className="size-4 shrink-0" />
                      {tripLinksLoading ? '…' : tl ? opensLabel(tl.open_count, tl.last_opened_at) : '—'}
                    </span>
                    <div className="flex shrink-0 items-center gap-1">
                      <button type="button" disabled={!tl?.url} onClick={() => tl?.url && sendTrip(trip, tl.url)} className={cn(ui.btn, ui.btnOutline, 'h-8 w-8 px-0')} title="Send on WhatsApp" aria-label="Send on WhatsApp">
                        <WhatsAppIcon className="size-4 text-emerald-600" />
                      </button>
                      <button type="button" disabled={!tl?.url} onClick={() => tl?.url && copyText(tl.url)} className={cn(ui.btn, ui.btnOutline, 'h-8 w-8 px-0')} title="Copy link" aria-label="Copy link">
                        <Copy className="size-4" />
                      </button>
                      <button type="button" onClick={() => navigate(`/trips/${trip.id}/track`)} className={cn(ui.btn, ui.btnOutline, 'h-8 w-8 px-0')} title="Track on the map" aria-label="Track on the map">
                        <MapPinned className="size-4" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
        </>)}

        {/* ── Every open, newest first ── */}
        <Panel
          title="Opened"
          icon={Eye}
          tone="indigo"
          flush
          action={
            history && history.total > 0 ? (
              <div className="flex items-center gap-1" role="tablist" aria-label="Which links">
                {([['all', 'All', history.opens.length], ['all_trucks', 'All-trucks', fleetOpenCount], ['trip', 'Trips', tripOpenCount]] as const).map(([id, label, n]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={historyFilter === id}
                    onClick={() => { setHistoryFilter(id); setShown(HISTORY_PAGE); }}
                    className={cn(
                      'inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-xs font-medium transition-colors cursor-pointer',
                      historyFilter === id ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
                    )}
                  >
                    {label} <span className={cn('tabular-nums', historyFilter === id ? 'text-white/70' : 'text-slate-400')}>{n}</span>
                  </button>
                ))}
              </div>
            ) : undefined
          }
        >
          {historyLoading ? (
            <div className="space-y-2 border-t border-slate-100 p-5 dark:border-slate-800">
              {[0, 1, 2].map((i) => <div key={i} className="h-6 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />)}
            </div>
          ) : days.length === 0 ? (
            <p className={cn(ui.muted, 'border-t border-slate-100 px-5 py-4 dark:border-slate-800')}>
              {history && history.earlier_opens > 0 ? 'No opens since the history started.' : 'Nobody has opened a link yet.'}
            </p>
          ) : (
            <div className="border-t border-slate-100 dark:border-slate-800">
              {days.map((day) => (
                <div key={day.key}>
                  <p className="bg-slate-50/80 px-5 py-1.5 text-xs font-medium text-slate-500 dark:bg-slate-800/40">{day.label}</p>
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                    {day.items.map((o) => (
                      <li key={o.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                        {o.link.kind === 'all_trucks' ? <Link2 className="size-4 shrink-0 text-blue-500" /> : <Truck className="size-4 shrink-0 text-[#E5533F]" />}
                        <span className="min-w-0 flex-1 truncate">
                          {o.link.kind === 'all_trucks' ? (
                            <span className="text-slate-900 dark:text-white">All-trucks page</span>
                          ) : o.link.trip_id ? (
                            <button type="button" onClick={() => navigate(`/trips/${(o.link as { trip_id: string }).trip_id}`)} className="font-medium text-slate-900 tabular-nums hover:text-[#E5533F] hover:underline dark:text-white cursor-pointer">
                              {o.link.ref_id || 'Trip'}
                            </button>
                          ) : (
                            <span className="text-slate-900 dark:text-white">Trip link</span>
                          )}
                          {o.device && <span className="ml-2 text-[13px] text-slate-500">{o.device}</span>}
                        </span>
                        <span className="shrink-0 text-[13px] text-slate-500 tabular-nums" title={formatInDeploymentTz(o.opened_at, tz, 'd MMM yyyy, HH:mm:ss')}>
                          {formatInDeploymentTz(o.opened_at, tz, 'HH:mm')}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
          {(opens.length > shown || (history && history.earlier_opens > 0)) && (
            <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 text-[13px] text-slate-500 dark:border-slate-800">
              <span>{history && history.earlier_opens > 0 ? `+${history.earlier_opens} earlier open${history.earlier_opens === 1 ? '' : 's'} (before times were recorded)` : ''}</span>
              {opens.length > shown && (
                <button type="button" onClick={() => setShown((n) => n + HISTORY_PAGE * 2)} className="font-medium text-[#E5533F] hover:underline cursor-pointer">
                  Show more
                </button>
              )}
            </div>
          )}
        </Panel>
      </div>

      {/* ── Settings ── */}
      <section className={cn(ui.card, 'order-first xl:order-none xl:col-span-4 xl:sticky xl:top-4')}>
        <label className="flex cursor-pointer items-center justify-between gap-3 px-5 py-4">
          <span>
            <span className={cn(ui.h2, 'block')}>Live tracking</span>
            <span className={cn('text-[13px]', enabled ? 'text-emerald-600' : 'text-slate-500')}>{enabled ? 'On' : 'Off'}</span>
          </span>
          <Switch checked={enabled} disabled={save.isPending} onCheckedChange={(v) => save.mutate({ tracking_enabled: v })} aria-label="Live tracking on" />
        </label>
        <div className={cn('border-t border-slate-100 px-5 pb-2 pt-4 dark:border-slate-800', !enabled && 'pointer-events-none opacity-50')}>
          <p className={ui.label}>Customer can see</p>
          <ul className="mt-1">
            {VISIBILITY.map((f) => {
              const value = customer[f.key] ?? f.fallback;
              return (
                <li key={f.key}>
                  <label title={f.hint} className="flex cursor-pointer items-center justify-between gap-3 py-2.5 text-sm text-slate-800 dark:text-slate-100">
                    {f.label}
                    <Switch checked={value} disabled={save.isPending || !enabled} onCheckedChange={(v) => save.mutate({ [f.key]: v })} aria-label={f.label} />
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
        {/* Where the page's "Ask" button sends the customer */}
        <div className={cn('border-t border-slate-100 px-5 py-4 dark:border-slate-800', !enabled && 'pointer-events-none opacity-50')}>
          <p className={ui.label}>"Ask" button on the page</p>
          {whatsAppGroupUrl(customer.whatsapp_group_link) ? (
            <p className="mt-1.5 flex items-start gap-2 text-sm text-slate-800 dark:text-slate-100">
              <WhatsAppIcon className="mt-0.5 size-4 shrink-0 text-[#25D366]" />
              <span>Opens {customer.whatsapp_group_name ? <b className="font-semibold">{customer.whatsapp_group_name}</b> : 'the customer’s WhatsApp group'}. The message is copied for them to paste.</span>
            </p>
          ) : (
            <div className="mt-1.5 rounded-xl bg-amber-50 px-3 py-2.5 text-[13px] text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              <p className="font-semibold">No WhatsApp group link yet</p>
              <p className="mt-0.5 text-amber-900/80 dark:text-amber-200/80">
                Until then, "Ask" messages the team member who created the trip (the phone on their user profile), or the company support number.
              </p>
              <p className="mt-1.5 text-amber-900/80 dark:text-amber-200/80">
                To add the group: in WhatsApp open the group, tap its name, then <b>Invite to group via link → Copy link</b> (group admins only), and paste it in the customer's details.
              </p>
              <button type="button" onClick={() => navigate(`/customers/${customer.id}/edit`)} className="mt-2 rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-amber-900 ring-1 ring-amber-200 hover:bg-amber-100 dark:bg-amber-900/40 dark:text-amber-100 dark:ring-amber-800">
                Add group link
              </button>
            </div>
          )}
        </div>
      </section>

      <ConfirmModal
        isOpen={renewOpen}
        onClose={() => setRenewOpen(false)}
        title="Replace the all-trucks link?"
        message="The current link stops working for everyone who has it."
        confirmLabel="Replace link"
        isLoading={renew.isPending}
        onConfirm={() => renew.mutate()}
      />
    </div>
  );
}
