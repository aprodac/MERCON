import { useEffect, useState } from 'react';
import { Copy, FileDown, Mail } from 'lucide-react';
import { toast } from 'sonner';
import type { Invoice } from '@mercon/shared-types';

import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { WhatsAppIcon } from '@/components/ui/whatsapp-icon';
import { SegmentedControl } from '@/components/finance/kit/SegmentedControl';
import { financeService, type InvoiceShareChannel } from '@/services/financeService';
import { invoiceNotice } from '@/lib/finance/invoices';
import { formatMoney } from '@/lib/finance/format';
import { mailtoLink, whatsAppLink } from '@/lib/share';

export interface InvoiceContact {
  name: string;
  phone?: string | null;
}

/**
 * Send an invoice: a short message (English, or English + Arabic) to copy, WhatsApp or email,
 * plus the PDF to download and attach. Each send is recorded in the invoice's activity.
 */
export function SendInvoiceSheet({
  invoice,
  contact,
  companyName,
  onOpenChange,
  onDownloadPdf,
}: {
  invoice: Invoice | null;
  contact: InvoiceContact | null;
  companyName: string;
  onOpenChange: (open: boolean) => void;
  onDownloadPdf: (invoice: Invoice) => void;
}) {
  const [arabic, setArabic] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (invoice && contact) setMessage(invoiceNotice(invoice, contact.name, companyName, arabic));
  }, [invoice, contact, companyName, arabic]);

  const ref = invoice?.ref_id ?? invoice?.id.slice(0, 8);
  const log = (channel: InvoiceShareChannel) => {
    if (invoice) financeService.logInvoiceSent(invoice.id, channel).catch(() => undefined);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      log('copy');
      toast.success('Message copied');
    } catch {
      toast.error('Could not copy — select the text and copy it manually');
    }
  };

  return (
    <Sheet open={invoice !== null} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b p-5">
          <SheetTitle className="text-base">Send {ref}</SheetTitle>
          <SheetDescription className="text-xs">
            {contact?.name}
            {contact?.phone && ` · ${contact.phone}`} · SAR {formatMoney(invoice?.total_amount)}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/40 p-3 text-xs">
            <span>Download the PDF first, then attach it to the WhatsApp message or email.</span>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 gap-1.5"
              onClick={() => {
                if (!invoice) return;
                log('download');
                onDownloadPdf(invoice);
              }}
            >
              <FileDown className="size-3.5" /> PDF
            </Button>
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
          <div className="space-y-1.5">
            <Label htmlFor="invoice-message" className="text-xs">Message</Label>
            <Textarea id="invoice-message" dir="auto" value={message} onChange={(e) => setMessage(e.target.value)} className="min-h-64 text-xs leading-relaxed" />
          </div>
        </div>

        <SheetFooter className="flex-row flex-wrap justify-end gap-2 border-t p-4">
          <Button variant="outline" onClick={copy} className="gap-1.5">
            <Copy className="size-4" /> Copy
          </Button>
          <Button variant="outline" asChild className="gap-1.5">
            <a href={mailtoLink(`Invoice ${ref} — ${companyName}`, message)} onClick={() => log('email')}>
              <Mail className="size-4" /> Email
            </a>
          </Button>
          {contact?.phone ? (
            <Button asChild className="gap-1.5 bg-brand text-white hover:bg-brand-hover">
              <a href={whatsAppLink(contact.phone, message)} target="_blank" rel="noreferrer" onClick={() => log('whatsapp')}>
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
