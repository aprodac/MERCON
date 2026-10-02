import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CalendarClock, Copy, ExternalLink, Eye, Image as ImageIcon, Link2, MapPinned, MessageSquareText, RefreshCw, TriangleAlert } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import ConfirmModal from '@/components/ui/ConfirmModal';
import { WhatsAppIcon } from '@/components/ui/whatsapp-icon';
import { customerService, type Customer, type CreateCustomerPayload } from '@/services/customerService';
import { trackingService } from '@/services/trackingService';
import { whatsAppLink } from '@/lib/share';
import { timeAgo } from '@/lib/fleetLive';
import { cn } from '@/lib/utils';

type TrackingField = 'tracking_enabled' | 'tracking_auto_link' | 'tracking_show_deadline' | 'tracking_show_delay_reason' | 'tracking_show_photos';

const FIELDS: { key: TrackingField; label: string; help: string; icon: typeof Link2; fallback: boolean }[] = [
  { key: 'tracking_auto_link', label: 'Add the link to status messages', help: 'Truck details, Vehicle Status Update, ETA and delay messages end with "Track live: <link>".', icon: MessageSquareText, fallback: true },
  { key: 'tracking_show_deadline', label: 'Show planned arrival times', help: 'The customer sees each stop\'s planned time and "On time" / "Late by…". Leave off if you don\'t want them to see deadlines.', icon: CalendarClock, fallback: false },
  { key: 'tracking_show_delay_reason', label: 'Show the delay reason', help: 'Shows the reason category ops log (e.g. "Delayed · Traffic"). The driver\'s typed note is never shown.', icon: TriangleAlert, fallback: false },
  { key: 'tracking_show_photos', label: 'Show loading and delivery photos', help: 'Finished stops show the driver\'s POD and cargo photos (not delay videos). Photos are deleted 60 days after the trip.', icon: ImageIcon, fallback: true },
];

/**
 * Customer → Tracking: what this customer sees on their tracking links, and
 * their customer-wide page (all their trucks on the road, one bookmarkable link).
 * Switches save as they're flipped.
 */
export default function CustomerTrackingTab({ customer }: { customer: Customer }) {
  const qc = useQueryClient();
  const enabled = customer.tracking_enabled ?? true;
  const [renewOpen, setRenewOpen] = useState(false);

  const save = useMutation({
    mutationFn: (patch: Partial<CreateCustomerPayload>) => customerService.update(customer.id, patch),
    onSuccess: (updated) => {
      qc.setQueryData(['customer', customer.id], (old: Customer | undefined) => (old ? { ...old, ...updated } : updated));
      qc.invalidateQueries({ queryKey: ['customer-tracking-link', customer.id] });
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

  const copy = async () => {
    if (!link?.url) return;
    try {
      await navigator.clipboard.writeText(link.url);
      toast.success('Link copied');
    } catch {
      toast.error("Couldn't copy — open the page and copy it from the address bar");
    }
  };
  const send = () => {
    if (!link?.url) return;
    const text = `*${customer.name} · live trucks*\nAll your trucks on the road, live: ${link.url}`;
    window.open(whatsAppLink(customer.whatsapp_number ?? null, text), '_blank', 'noopener');
  };

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">Customer tracking</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Each trip gets a link the customer opens from WhatsApp to see the truck live, the arrival time and the stops — without asking you for updates.
            </p>
          </div>
          <Switch
            checked={enabled}
            disabled={save.isPending}
            onCheckedChange={(v) => save.mutate({ tracking_enabled: v })}
            aria-label="Tracking links on"
          />
        </div>
        {!enabled && (
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
            Tracking is off for this customer. Links already sent show "Tracking isn't available" and messages go without a link.
          </p>
        )}
        <ul className={cn('mt-4 divide-y divide-slate-100 dark:divide-slate-800', !enabled && 'pointer-events-none opacity-50')}>
          {FIELDS.map((f) => {
            const Icon = f.icon;
            const value = customer[f.key] ?? f.fallback;
            return (
              <li key={f.key} className="flex items-start gap-3 py-3">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{f.label}</p>
                  <p className="text-xs text-muted-foreground">{f.help}</p>
                </div>
                <Switch checked={value} disabled={save.isPending || !enabled} onCheckedChange={(v) => save.mutate({ [f.key]: v })} aria-label={f.label} />
              </li>
            );
          })}
        </ul>
      </section>

      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <MapPinned className="size-4 text-blue-600" />
          <h2 className="text-base font-semibold text-foreground">All-trucks page</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          One link that shows every {customer.name} truck on the road, about to load, or delivered in the last 12 hours. Good for monthly contracts — the customer bookmarks it once.
        </p>

        {!enabled ? (
          <p className="mt-4 text-sm text-muted-foreground">Turn tracking on to get this link.</p>
        ) : linkLoading || !link?.url ? (
          <p className="mt-4 text-sm text-muted-foreground">Getting the link…</p>
        ) : (
          <>
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/60">
              <Link2 className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">{link.url}</span>
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Eye className="size-3.5" />
              {link.open_count > 0
                ? `Opened ${link.open_count} ${link.open_count === 1 ? 'time' : 'times'} · last ${timeAgo(link.last_opened_at)}`
                : 'Not opened yet'}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" onClick={send} className="gap-1.5 rounded-xl bg-[#25D366] text-white hover:bg-[#1ebe5b]">
                <WhatsAppIcon className="size-4" /> Send on WhatsApp
              </Button>
              <Button size="sm" variant="outline" onClick={copy} className="gap-1.5 rounded-xl"><Copy className="size-4" /> Copy</Button>
              <Button size="sm" variant="outline" onClick={() => window.open(link.url!, '_blank', 'noopener')} className="gap-1.5 rounded-xl">
                <ExternalLink className="size-4" /> Open
              </Button>
              <Button size="sm" variant="outline" onClick={() => setRenewOpen(true)} className="gap-1.5 rounded-xl"><RefreshCw className="size-4" /> New link…</Button>
            </div>
          </>
        )}
      </section>

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
