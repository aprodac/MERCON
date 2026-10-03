import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Copy, ExternalLink, Eye, Link2, MoreHorizontal, RefreshCw, Truck } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import ConfirmModal from '@/components/ui/ConfirmModal';
import { WhatsAppIcon } from '@/components/ui/whatsapp-icon';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { customerService, type Customer, type CreateCustomerPayload } from '@/services/customerService';
import { trackingService, type TrackingOpen } from '@/services/trackingService';
import { whatsAppLink } from '@/lib/share';
import { formatInDeploymentTz, useDeploymentTimezone } from '@/lib/datetime';
import { cn } from '@/lib/utils';
import { Count, EmptyRow, Section, Segmented, SkeletonRows, ui } from '@/components/customers/customerUi';
import { copyText, opensLabel } from '@/components/customers/trackingLinks';
import { whatsAppGroupUrl } from '@mercon/shared-types';

type TrackingField = 'tracking_auto_link' | 'tracking_show_deadline' | 'tracking_show_delay_reason' | 'tracking_show_photos';

/** Short labels; the longer explanation is the hover text. */
const VISIBILITY: { key: TrackingField; label: string; hint: string; fallback: boolean }[] = [
  { key: 'tracking_auto_link', label: 'Link in WhatsApp messages', hint: 'Status, ETA and delay messages end with "Track live: <link>"', fallback: true },
  { key: 'tracking_show_deadline', label: 'Planned arrival times', hint: 'Each stop shows its planned time and "On time" / "Late by…"', fallback: false },
  { key: 'tracking_show_delay_reason', label: 'Delay reason', hint: 'The reason category (e.g. "Traffic") — never the driver\'s own note', fallback: false },
  { key: 'tracking_show_photos', label: 'Loading & delivery photos', hint: 'POD and cargo photos on finished stops (kept 60 days)', fallback: true },
];

const HISTORY_PAGE = 40;

type HistoryFilter = 'all' | 'all_trucks' | 'trip';

/**
 * Customer → Live tracking: the all-trucks link, every time the customer opened
 * a link, and what they get to see. Switches save as flipped. Each truck on the
 * road (with its own link) is on the Overview.
 */
export default function CustomerTrackingTab({ customer }: { customer: Customer }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const tz = useDeploymentTimezone();
  const enabled = customer.tracking_enabled ?? true;
  const [renewOpen, setRenewOpen] = useState(false);
  const [shown, setShown] = useState(HISTORY_PAGE);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all');

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

  const { data: history, isLoading: historyLoading } = useQuery({
    queryKey: ['customer-tracking-opens', customer.id],
    queryFn: () => trackingService.getCustomerOpens(customer.id, 500),
    refetchInterval: 60_000,
  });

  const opens = useMemo(
    () => (history?.opens ?? []).filter((o) => historyFilter === 'all' || o.link.kind === historyFilter),
    [history, historyFilter],
  );
  // Newest first, grouped by day: "Today", "Yesterday", "Wed, 30 Sep 2026".
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

  const all = history?.opens ?? [];
  const tripOpenCount = all.filter((o) => o.link.kind === 'trip').length;
  const fleetOpenCount = all.filter((o) => o.link.kind === 'all_trucks').length;

  return (
    <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-4">
        {!enabled && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-[13px] text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
            Tracking is off for {customer.name}. Turn it on (right) to share links — links already sent stop working while it's off.
          </div>
        )}

        {/* ── All-trucks link ── */}
        {enabled && (
          <Section
            title="All-trucks link"
            meta={link?.url ? <span className="text-xs font-normal text-slate-500">{opensLabel(link.open_count, link.last_opened_at)}</span> : undefined}
          >
            <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
              {linkLoading || !link?.url ? (
                <div className="h-8 flex-1 animate-pulse rounded-md bg-slate-100 dark:bg-slate-800" />
              ) : (
                <button
                  type="button"
                  onClick={() => copyText(link.url!)}
                  title="Copy link"
                  className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 text-left text-[13px] text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200 cursor-pointer"
                >
                  <Link2 className="size-3.5 shrink-0 text-slate-400" />
                  <span className="min-w-0 flex-1 truncate">{link.url}</span>
                  <Copy className="size-3.5 shrink-0 text-slate-400" />
                </button>
              )}
              <div className="flex items-center gap-1.5">
                <Button size="sm" onClick={sendAll} disabled={!link?.url} className={cn(ui.btnSm, 'flex-1 bg-[#25D366] text-white hover:bg-[#1EBE5B] sm:flex-none')}>
                  <WhatsAppIcon className="size-4" /> Send
                </Button>
                <Button variant="outline" size="icon" disabled={!link?.url} onClick={() => link?.url && window.open(link.url, '_blank', 'noopener')} className={ui.iconSm} title="Open the page" aria-label="Open the page">
                  <ExternalLink />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" className={ui.iconSm} aria-label="More">
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem onClick={() => setRenewOpen(true)} className="text-[13px]">
                      <RefreshCw className="mr-2 size-4 text-slate-500" /> Replace with a new link
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </Section>
        )}

        {/* ── Every open, newest first ── */}
        <Section
          title="Link opens"
          meta={history && history.total > 0 ? <Count>{history.total}</Count> : undefined}
          action={
            history && history.total > 0 ? (
              <Segmented
                label="Which links"
                value={historyFilter}
                onChange={(id) => { setHistoryFilter(id); setShown(HISTORY_PAGE); }}
                options={[
                  { id: 'all', label: 'All', count: all.length },
                  { id: 'all_trucks', label: 'All-trucks', count: fleetOpenCount },
                  { id: 'trip', label: 'Trips', count: tripOpenCount },
                ]}
              />
            ) : undefined
          }
        >
          {historyLoading ? (
            <SkeletonRows rows={4} />
          ) : days.length === 0 ? (
            <EmptyRow icon={Eye}>{history && history.earlier_opens > 0 ? 'No opens since the history started.' : 'Nobody has opened a link yet.'}</EmptyRow>
          ) : (
            <div className="max-h-[520px] overflow-y-auto">
              {days.map((day) => (
                <div key={day.key}>
                  <p className="sticky top-0 z-[1] flex items-center justify-between border-b border-slate-100 bg-slate-50/95 px-4 py-1 text-xs font-medium text-slate-500 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
                    <span>{day.label}</span>
                    <span className="tabular-nums text-slate-400">{day.items.length} open{day.items.length === 1 ? '' : 's'}</span>
                  </p>
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                    {day.items.map((o) => (
                      <li key={o.id} className="flex items-center gap-3 px-4 py-2 text-[13px]">
                        {o.link.kind === 'all_trucks' ? <Link2 className="size-3.5 shrink-0 text-blue-500" /> : <Truck className="size-3.5 shrink-0 text-[#E5533F]" />}
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
                          {o.device && <span className="ml-2 text-xs text-slate-500">{o.device}</span>}
                        </span>
                        <span className="shrink-0 text-xs text-slate-500 tabular-nums" title={formatInDeploymentTz(o.opened_at, tz, 'd MMM yyyy, HH:mm:ss')}>
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
            <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-2 text-xs text-slate-500 dark:border-slate-800">
              <span>{history && history.earlier_opens > 0 ? `+${history.earlier_opens} earlier open${history.earlier_opens === 1 ? '' : 's'} (before times were recorded)` : ''}</span>
              {opens.length > shown && (
                <button type="button" onClick={() => setShown((n) => n + HISTORY_PAGE * 2)} className="font-medium text-[#E5533F] hover:underline cursor-pointer">
                  Show more
                </button>
              )}
            </div>
          )}
        </Section>
      </div>

      {/* ── Settings ── */}
      <section className={cn(ui.card, 'order-first overflow-hidden xl:order-none xl:sticky xl:top-2')}>
        <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 border-b border-slate-100 px-4 py-2 dark:border-slate-800">
          <span className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-900 dark:text-white">Live tracking</span>
            <span className={cn('text-xs font-medium', enabled ? 'text-emerald-600' : 'text-slate-500')}>{enabled ? 'On' : 'Off'}</span>
          </span>
          <Switch checked={enabled} disabled={save.isPending} onCheckedChange={(v) => save.mutate({ tracking_enabled: v })} aria-label="Live tracking on" />
        </label>
        <div className={cn('px-4 pb-1 pt-3', !enabled && 'pointer-events-none opacity-50')}>
          <p className={ui.label}>Customer can see</p>
          <ul className="mt-0.5">
            {VISIBILITY.map((f) => {
              const value = customer[f.key] ?? f.fallback;
              return (
                <li key={f.key}>
                  <label title={f.hint} className="flex cursor-pointer items-center justify-between gap-3 py-2 text-[13px] text-slate-800 dark:text-slate-100">
                    {f.label}
                    <Switch checked={value} disabled={save.isPending || !enabled} onCheckedChange={(v) => save.mutate({ [f.key]: v })} aria-label={f.label} />
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
        {/* Where the page's "Ask" button sends the customer */}
        <div className={cn('border-t border-slate-100 px-4 py-3 dark:border-slate-800', !enabled && 'pointer-events-none opacity-50')}>
          <p className={ui.label}>"Ask" button on the page</p>
          {whatsAppGroupUrl(customer.whatsapp_group_link) ? (
            <p className="mt-1.5 flex items-start gap-2 text-[13px] text-slate-800 dark:text-slate-100">
              <WhatsAppIcon className="mt-0.5 size-4 shrink-0 text-[#25D366]" />
              <span>Opens {customer.whatsapp_group_name ? <b className="font-semibold">{customer.whatsapp_group_name}</b> : 'the customer’s WhatsApp group'}. The message is copied for them to paste.</span>
            </p>
          ) : (
            <div className="mt-1.5 rounded-lg bg-amber-50 px-3 py-2.5 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              <p className="font-semibold">No WhatsApp group link yet</p>
              <p className="mt-0.5 text-amber-900/80 dark:text-amber-200/80">
                Until then, "Ask" messages the team member who created the trip (the phone on their user profile), or the company support number.
              </p>
              <p className="mt-1.5 text-amber-900/80 dark:text-amber-200/80">
                To add the group: in WhatsApp open the group, tap its name, then <b>Invite to group via link → Copy link</b> (group admins only), and paste it in the customer's details.
              </p>
              <button type="button" onClick={() => navigate(`/customers/${customer.id}/edit`)} className="mt-2 rounded-md bg-white px-2.5 py-1 text-xs font-semibold text-amber-900 ring-1 ring-amber-200 hover:bg-amber-100 dark:bg-amber-900/40 dark:text-amber-100 dark:ring-amber-800 cursor-pointer">
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
