import { useEffect, useMemo, useState } from 'react';
import { Copy, Mail } from 'lucide-react';
import { toast } from 'sonner';
import type { BankAccount } from '@mercon/shared-types';

import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { WhatsAppIcon } from '@/components/ui/whatsapp-icon';
import { SegmentedControl } from '@/components/finance/kit/SegmentedControl';
import { BucketChip } from '@/lib/finance/chips';
import { dueOn, sumBalance, type AgeingDocument } from '@/lib/finance/ageing';
import { formatDate, formatMoney } from '@/lib/finance/format';
import { REMINDER_TONES, buildReminder, reminderSubject, suggestTone, type ReminderTone } from '@/lib/finance/reminders';
import { mailtoLink, whatsAppLink } from '@/lib/share';

export interface ReminderCustomer {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
}

const NO_BANK = 'none';

/** Payment reminder for one customer: pick invoices, tone and language, then copy, WhatsApp or email it. */
export function ReminderSheet({
  open,
  onOpenChange,
  customer,
  docs,
  asOf,
  companyName,
  bankAccounts,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: ReminderCustomer | null;
  /** The customer's open invoices. */
  docs: AgeingDocument[];
  asOf: string;
  companyName: string;
  bankAccounts: BankAccount[];
}) {
  const withIban = useMemo(() => bankAccounts.filter((b) => !b.is_cash && b.iban), [bankAccounts]);
  const sorted = useMemo(() => [...docs].sort((a, b) => dueOn(a).localeCompare(dueOn(b))), [docs]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tone, setTone] = useState<ReminderTone>('friendly');
  const [arabic, setArabic] = useState(false);
  const [bankId, setBankId] = useState(NO_BANK);
  const [message, setMessage] = useState('');

  // New customer → overdue invoices (or all when none are overdue) and the tone they call for
  useEffect(() => {
    if (!open) return;
    const overdue = sorted.filter((d) => d.days_overdue > 0);
    const initial = overdue.length > 0 ? overdue : sorted;
    setSelected(new Set(initial.map((d) => d.id)));
    setTone(suggestTone(initial));
    setBankId(withIban[0]?.id ?? NO_BANK);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, customer?.id]);

  const chosen = sorted.filter((d) => selected.has(d.id));
  const bank = withIban.find((b) => b.id === bankId);

  // Regenerate the draft whenever an input changes; edits in the box are kept until then
  useEffect(() => {
    if (!customer) return;
    const input = {
      customerName: customer.name,
      companyName,
      docs: chosen,
      tone,
      asOf,
      bank: bank ? { name: bank.bank_name || 'Bank', iban: bank.iban as string } : null,
    };
    const english = buildReminder(input, 'en');
    setMessage(arabic ? `${english}\n\n────────\n\n${buildReminder(input, 'ar')}` : english);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer, companyName, selected, tone, arabic, bankId, asOf]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      toast.success('Reminder copied');
    } catch {
      toast.error('Could not copy — select the text and copy it manually');
    }
  };

  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="border-b p-5">
          <SheetTitle className="text-base">Send reminder</SheetTitle>
          <SheetDescription className="text-xs">
            {customer?.name}
            {customer?.phone && ` · ${customer.phone}`}
            {customer?.email && ` · ${customer.email}`}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium">Invoices to include</span>
              <span className="text-muted-foreground">
                {chosen.length} of {sorted.length} · <span className="fin-num font-medium text-foreground">SAR {formatMoney(sumBalance(chosen))}</span>
              </span>
            </div>
            <div className="divide-y rounded-lg border">
              {sorted.map((d) => (
                <label key={d.id} className="flex cursor-pointer items-center gap-3 p-2.5 text-xs hover:bg-muted/40">
                  <Checkbox checked={selected.has(d.id)} onCheckedChange={(c) => toggle(d.id, c === true)} />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{d.ref_id ?? d.id.slice(0, 8)}</span>
                    <span className="text-muted-foreground"> · due {formatDate(dueOn(d))}</span>
                  </span>
                  <BucketChip bucket={d.bucket} />
                  <span className="fin-num w-24 text-right font-medium">{formatMoney(d.balance)}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Tone</Label>
              <SegmentedControl aria-label="Tone" value={tone} onChange={setTone} options={REMINDER_TONES.map((t) => ({ value: t.key, label: t.label }))} />
              <p className="text-[11px] text-muted-foreground">Suggested for {REMINDER_TONES.find((t) => t.key === suggestTone(chosen))?.hint.toLowerCase()}</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Language</Label>
              <SegmentedControl
                aria-label="Language"
                value={arabic ? 'both' : 'en'}
                onChange={(v) => setArabic(v === 'both')}
                options={[{ value: 'en', label: 'English' }, { value: 'both', label: 'English + العربية' }]}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Bank details</Label>
            <Select value={bankId} onValueChange={setBankId}>
              <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_BANK} className="text-xs">Don't include bank details</SelectItem>
                {withIban.map((b) => (
                  <SelectItem key={b.id} value={b.id} className="text-xs">{b.bank_name} · {b.iban}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {withIban.length === 0 && <p className="text-[11px] text-muted-foreground">Add an IBAN to a bank account to include transfer details.</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reminder-message" className="text-xs">Message</Label>
            <Textarea id="reminder-message" dir="auto" value={message} onChange={(e) => setMessage(e.target.value)} className="min-h-72 font-sans text-xs leading-relaxed" />
          </div>
        </div>

        <SheetFooter className="flex-row flex-wrap justify-end gap-2 border-t p-4">
          <Button variant="outline" onClick={copy} disabled={!message} className="gap-1.5">
            <Copy className="size-4" /> Copy
          </Button>
          <Button variant="outline" asChild className="gap-1.5">
            <a href={mailtoLink(reminderSubject(companyName, tone), message, customer?.email ?? '')}>
              <Mail className="size-4" /> Email
            </a>
          </Button>
          {customer?.phone ? (
            <Button asChild className="gap-1.5 bg-brand text-white hover:bg-brand-hover">
              <a href={whatsAppLink(customer.phone, message)} target="_blank" rel="noreferrer">
                <WhatsAppIcon className="size-4" /> WhatsApp
              </a>
            </Button>
          ) : (
            <Button disabled title="No phone number on this customer" className="gap-1.5 bg-brand text-white">
              <WhatsAppIcon className="size-4" /> WhatsApp
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
