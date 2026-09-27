import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, ExternalLink, Loader2, Play, Send, Users, UserRound, Building2, Phone } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { WhatsAppIcon } from '@/components/ui/whatsapp-icon';
import { cn } from '@/lib/utils';
import { resolveFileUrl } from '@/lib/documents';
import { operatorInboxService, type DriverUpdate, type ShareRecipient } from '@/services/operatorInboxService';
import { updateTitle } from './inboxText';

interface Props {
  update: DriverUpdate;
  apiAvailable: boolean;
  onClose: () => void;
}

interface RecipientOption {
  id: ShareRecipient;
  label: string;
  detail: string;
  icon: typeof Users;
  phone: string | null;
}

/**
 * Forward one driver update. Pick the photos, pick who it goes to, and either
 * open WhatsApp with the message ready (works for any chat, including groups)
 * or — when the Business API is set up and it's a single number — send the
 * photos as real images. Either way the forward is logged for every operator.
 */
export function ShareUpdateDialog({ update, apiAvailable, onClose }: Props) {
  const queryClient = useQueryClient();
  const sentIds = useMemo(() => new Set(update.sent_ids), [update.sent_ids]);
  // Default to what hasn't been forwarded yet, or everything if all of it has.
  const [chosen, setChosen] = useState<Set<string>>(() => {
    const unsent = update.items.filter((i) => !sentIds.has(i.id)).map((i) => i.id);
    return new Set(unsent.length ? unsent : update.items.map((i) => i.id));
  });

  const customerPhone = update.customer?.whatsapp_number || update.customer?.contact_phone || null;
  const options: RecipientOption[] = [
    {
      id: 'customer_group',
      label: update.customer?.group_name || 'Customer group',
      detail: 'Opens WhatsApp with the message — pick the group there',
      icon: Users,
      phone: null,
    },
    {
      id: 'customer_contact',
      label: update.customer?.contact_person || `${update.customer?.name ?? 'Customer'} contact`,
      detail: customerPhone ?? 'No number on the customer — type one below',
      icon: UserRound,
      phone: customerPhone,
    },
    { id: 'internal', label: 'Our team group', detail: 'Opens WhatsApp — pick the group there', icon: Building2, phone: null },
    { id: 'other', label: 'Another number', detail: 'Type the number below', icon: Phone, phone: null },
  ];
  const [recipient, setRecipient] = useState<ShareRecipient>(update.customer?.group_name || !customerPhone ? 'customer_group' : 'customer_contact');
  const [phoneInput, setPhoneInput] = useState('');
  const [asImages, setAsImages] = useState(false);
  const [result, setResult] = useState<{ text: string; url: string } | null>(null);

  const current = options.find((o) => o.id === recipient)!;
  const needsNumber = recipient === 'other' || (recipient === 'customer_contact' && !customerPhone);
  const phone = needsNumber ? phoneInput.trim() : current.phone;
  const canSendImages = apiAvailable && !!phone;

  const share = useMutation({
    mutationFn: () =>
      operatorInboxService.share({
        trip_id: update.trip.id,
        update_key: update.key,
        media_ids: [...chosen],
        recipient,
        recipient_phone: phone,
        channel: asImages && canSendImages ? 'whatsapp_api' : 'link',
      }),
  });

  const submit = async () => {
    if (chosen.size === 0) return toast.error('Pick at least one photo');
    if (needsNumber && !phoneInput.replace(/[^0-9]/g, '')) return toast.error('Enter the WhatsApp number');
    // Open the tab now, while the click still counts as a user action — browsers block pop-ups opened after an await.
    const tab = asImages && canSendImages ? null : window.open('', '_blank');
    try {
      const r = await share.mutateAsync();
      queryClient.invalidateQueries({ queryKey: ['operator-inbox', 'driver-updates'] });
      if (r.sent_via_api) {
        toast.success(`Sent ${chosen.size} ${chosen.size === 1 ? 'item' : 'items'} to ${phone}`);
        onClose();
        return;
      }
      try { await navigator.clipboard.writeText(r.text); } catch { /* clipboard blocked — the text is shown below */ }
      if (tab) tab.location.href = r.whatsapp_url;
      setResult({ text: r.text, url: r.whatsapp_url });
      toast.success('Marked as sent — message copied');
    } catch (e: any) {
      tab?.close();
      toast.error(e?.response?.data?.error?.message || 'Could not share this update');
    }
  };

  const toggle = (id: string) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg gap-4 rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-base">{updateTitle(update)}</DialogTitle>
          <DialogDescription>
            {[update.customer?.name, update.vehicle_plate, update.driver?.name].filter(Boolean).join(' · ')}
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
              <Check className="size-4" /> Marked as sent for everyone
            </p>
            <pre className="max-h-48 overflow-auto rounded-xl bg-muted p-3 text-xs whitespace-pre-wrap">{result.text}</pre>
            {(recipient === 'customer_group' || recipient === 'internal') && (
              <p className="text-xs text-muted-foreground">
                WhatsApp opened with the message ready — choose the group there. The message is also on your clipboard.
                {recipient === 'customer_group' && update.customer?.group_link && (
                  <>
                    {' '}
                    <a href={update.customer.group_link} target="_blank" rel="noreferrer" className="text-blue-600 underline">
                      Open {update.customer.group_name || 'the group'}
                    </a>
                  </>
                )}
              </p>
            )}
            <DialogFooter className="gap-2 sm:gap-2">
              <Button variant="outline" onClick={() => navigator.clipboard?.writeText(result.text).then(() => toast.success('Copied'))}>
                <Copy /> Copy message
              </Button>
              <Button variant="outline" asChild>
                <a href={result.url} target="_blank" rel="noreferrer"><ExternalLink /> Open WhatsApp again</a>
              </Button>
              <Button onClick={onClose}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                What to send · {chosen.size} of {update.items.length}
              </p>
              <div className="flex flex-wrap gap-2">
                {update.items.map((m) => {
                  const on = chosen.has(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => toggle(m.id)}
                      aria-pressed={on}
                      className={cn('relative size-16 overflow-hidden rounded-xl ring-2 transition', on ? 'ring-blue-600' : 'opacity-45 ring-transparent')}
                    >
                      {m.kind === 'video' ? (
                        <span className="flex size-full items-center justify-center bg-charcoal text-white"><Play className="size-5 fill-current" /></span>
                      ) : (
                        <img src={resolveFileUrl(m.url)} alt="" loading="lazy" className="size-full object-cover" />
                      )}
                      {sentIds.has(m.id) && (
                        <span className="absolute inset-x-0 bottom-0 bg-charcoal-strong/55 py-px text-center text-[9px] font-semibold text-white">Sent</span>
                      )}
                      {on && (
                        <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-blue-600 text-white">
                          <Check className="size-3" strokeWidth={3} />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">Send to</p>
              <div className="grid grid-cols-2 gap-2">
                {options.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setRecipient(o.id)}
                    className={cn(
                      'flex items-start gap-2 rounded-xl border p-2.5 text-left transition',
                      recipient === o.id ? 'border-blue-600 bg-blue-600/5' : 'border-border hover:bg-muted/60',
                    )}
                  >
                    <o.icon className={cn('mt-0.5 size-4 shrink-0', recipient === o.id ? 'text-blue-600' : 'text-muted-foreground')} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{o.label}</span>
                      <span className="block text-[11px] leading-snug text-muted-foreground">{o.detail}</span>
                    </span>
                  </button>
                ))}
              </div>
              {needsNumber && (
                <Input className="mt-2" inputMode="tel" placeholder="+966 5x xxx xxxx" value={phoneInput} onChange={(e) => setPhoneInput(e.target.value)} />
              )}
            </div>

            {canSendImages && (
              <label className="flex cursor-pointer items-start gap-2 rounded-xl border p-2.5 text-sm">
                <input type="checkbox" className="mt-1" checked={asImages} onChange={(e) => setAsImages(e.target.checked)} />
                <span>
                  <span className="font-medium">Send as real images</span>
                  <span className="block text-[11px] text-muted-foreground">
                    Through the WhatsApp Business API, straight to {phone}. Otherwise the message carries a link to the photos.
                  </span>
                </span>
              </label>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={submit} disabled={share.isPending} className="bg-[#25D366] font-semibold text-white hover:bg-[#1ebe5b]">
                {share.isPending ? <Loader2 className="animate-spin" /> : asImages && canSendImages ? <Send /> : <WhatsAppIcon className="size-4" />}
                {asImages && canSendImages ? 'Send images' : 'Open WhatsApp'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
