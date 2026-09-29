import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { Invoice } from '@mercon/shared-types';

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { InvoicePrintModal } from '@/components/finance/InvoicePrintModal';
import { SettlementSheet } from '@/components/finance/settlement/SettlementSheet';
import { ReminderSheet, type ReminderCustomer } from '@/components/finance/receivables/ReminderSheet';
import { asOfPresetDate } from '@/components/finance/kit/AsOfControl';
import { useAgeingDocuments } from '@/hooks/useAgeingWorkspace';
import { financeService } from '@/services/financeService';
import { settingsService } from '@/services/settingsService';
import { dueDateFor, duplicableLines } from '@/lib/finance/invoices';
import { formatMoney } from '@/lib/finance/format';
import { SendInvoiceSheet, type InvoiceContact } from './SendInvoiceSheet';
import { IssueInvoiceDialog } from './InvoiceLedgerSetup';

export type InvoiceCommand = 'issue' | 'record_payment' | 'remind' | 'send' | 'print' | 'edit' | 'duplicate' | 'void' | 'delete';

type Confirm = { kind: 'issue' | 'void' | 'delete'; invoice: Invoice };

const errorText = (err: any, fallback: string) => err?.response?.data?.error?.message || fallback;

/** Best phone for WhatsApp: the WhatsApp number, then the main contact numbers. */
export function contactOf(inv: Pick<Invoice, 'customer'>): InvoiceContact & { id?: string } {
  const c = inv.customer ?? {};
  return { id: c.id, name: c.name ?? 'Customer', phone: c.whatsapp_number || c.contact_phone || c.primary_contact_phone || null };
}

const CONFIRM_COPY: Record<Confirm['kind'], { title: string; body: (ref: string, amount: string) => string; action: string; danger?: boolean }> = {
  issue: {
    title: 'Issue this invoice?',
    body: (ref, amount) => `${ref} for SAR ${amount} will be posted to the ledger (receivable and revenue) and can no longer be edited. Its trips are marked invoiced.`,
    action: 'Issue invoice',
  },
  void: {
    title: 'Void this invoice?',
    body: (ref, amount) => `${ref} for SAR ${amount} will be cancelled: a reversing journal entry is posted and its trips go back to "ready to bill". This can't be undone.`,
    action: 'Void invoice',
    danger: true,
  },
  delete: {
    title: 'Delete this draft?',
    body: (ref) => `${ref} is removed completely. Its trips become available to bill again.`,
    action: 'Delete draft',
    danger: true,
  },
};

/**
 * Every invoice action in one place — issue, record payment, remind, send, print, edit, duplicate,
 * void, delete — with the confirm dialogs and sheets they open. The list, the side panel and the
 * invoice page all use it, so an action behaves the same wherever it's started.
 */
export function useInvoiceWorkflow(opts: { onDeleted?: (id: string) => void } = {}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const today = asOfPresetDate('today');

  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [collectFor, setCollectFor] = useState<string | null>(null);
  const [remindFor, setRemindFor] = useState<ReminderCustomer | null>(null);
  const [sendInvoice, setSendInvoice] = useState<Invoice | null>(null);
  const [printInvoice, setPrintInvoice] = useState<Invoice | null>(null);
  const [busy, setBusy] = useState(false);

  // Open receivables feed the payment and reminder sheets
  const needsDocs = collectFor !== null || remindFor !== null;
  const { docs } = useAgeingDocuments('receivables', today, 'due', needsDocs);
  const { data: banks } = useQuery({ queryKey: ['bank-accounts'], queryFn: () => financeService.getBankAccounts(), enabled: needsDocs });
  const { data: company } = useQuery({ queryKey: ['settings', 'public'], queryFn: () => settingsService.getPublic() });
  const companyName = company?.companyLegalName || company?.appName || '';

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['invoices'] });
    queryClient.invalidateQueries({ queryKey: ['finance-reports'] });
    queryClient.invalidateQueries({ queryKey: ['trips'] });
  };

  // Rows in the list don't carry lines; printing and sending need the whole invoice
  const loadFull = async (inv: Invoice) => {
    if (inv.lines && inv.customer) return inv;
    const res = await financeService.getInvoiceById(inv.id);
    return res.data as Invoice;
  };

  const confirmMutation = useMutation({
    mutationFn: async ({ kind, invoice }: Confirm) => {
      if (kind === 'issue') return financeService.issueInvoice(invoice.id);
      if (kind === 'void') return financeService.voidInvoice(invoice.id);
      return financeService.deleteDraftInvoice(invoice.id);
    },
    onSuccess: (_d, { kind, invoice }) => {
      const ref = invoice.ref_id ?? 'Invoice';
      toast.success(kind === 'issue' ? `${ref} issued` : kind === 'void' ? `${ref} voided` : `${ref} deleted`);
      setConfirm(null);
      refresh();
      if (kind === 'delete') opts.onDeleted?.(invoice.id);
    },
    onError: (err, { kind }) => toast.error(errorText(err, `Could not ${kind} the invoice`)),
  });

  const run = async (command: InvoiceCommand, inv: Invoice) => {
    try {
      switch (command) {
        case 'issue':
        case 'void':
        case 'delete':
          setConfirm({ kind: command, invoice: inv });
          return;
        case 'record_payment':
          setCollectFor(inv.customerId);
          return;
        case 'remind': {
          const c = contactOf(inv);
          setRemindFor({ id: inv.customerId, name: c.name, phone: c.phone });
          return;
        }
        case 'edit':
          navigate(`/finance/invoices/${inv.id}/edit`);
          return;
        case 'send':
        case 'print': {
          setBusy(true);
          const full = await loadFull(inv);
          if (command === 'send') setSendInvoice(full);
          else setPrintInvoice(full);
          return;
        }
        case 'duplicate': {
          setBusy(true);
          const full = await loadFull(inv);
          const lines = duplicableLines(full.lines);
          if (lines.length === 0) {
            toast.error('Nothing to copy — this invoice only has trip lines, and a trip can be billed once. Start a new invoice instead.');
            return;
          }
          const invoiceDate = today;
          const res = await financeService.createDraftInvoice({
            customerId: full.customerId,
            invoice_date: invoiceDate,
            due_date: dueDateFor(invoiceDate, full.customer?.payment_terms),
            tax_rate: Number(full.tax_rate) || 0,
            lines,
          });
          refresh();
          toast.success(`Draft ${res.data?.ref_id ?? ''} created from ${full.ref_id ?? 'the invoice'}`);
          navigate(`/finance/invoices/${res.data.id}/edit`);
          return;
        }
      }
    } catch (err) {
      toast.error(errorText(err, 'Something went wrong'));
    } finally {
      setBusy(false);
    }
  };

  const copy = confirm ? CONFIRM_COPY[confirm.kind] : null;

  const sheets = (
    <>
      <IssueInvoiceDialog
        open={confirm?.kind === 'issue'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={CONFIRM_COPY.issue.title}
        description={confirm ? CONFIRM_COPY.issue.body(confirm.invoice.ref_id ?? 'This invoice', formatMoney(confirm.invoice.total_amount)) : ''}
        hasVat={Number(confirm?.invoice.tax_amount) > 0.005}
        pending={confirmMutation.isPending}
        onConfirm={() => confirm && confirmMutation.mutate(confirm)}
        confirmLabel={CONFIRM_COPY.issue.action}
      />

      <AlertDialog open={confirm !== null && confirm.kind !== 'issue'} onOpenChange={(o) => !o && !confirmMutation.isPending && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{copy?.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm && copy?.body(confirm.invoice.ref_id ?? 'This invoice', formatMoney(confirm.invoice.total_amount))}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={confirmMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={confirmMutation.isPending}
              className={copy?.danger ? 'bg-destructive text-white hover:bg-destructive/90' : undefined}
              onClick={(e) => {
                e.preventDefault();
                if (confirm) confirmMutation.mutate(confirm);
              }}
            >
              {confirmMutation.isPending ? 'Working…' : copy?.action}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SettlementSheet
        mode="collect"
        open={collectFor !== null}
        onOpenChange={(o) => !o && setCollectFor(null)}
        documents={docs}
        initialPartyId={collectFor ?? undefined}
        onSuccess={refresh}
      />

      <ReminderSheet
        open={remindFor !== null}
        onOpenChange={(o) => !o && setRemindFor(null)}
        customer={remindFor}
        docs={remindFor ? docs.filter((d) => d.party_id === remindFor.id) : []}
        asOf={today}
        companyName={companyName}
        bankAccounts={(banks?.data ?? []).filter((b) => b.isActive !== false)}
      />

      <SendInvoiceSheet
        invoice={sendInvoice}
        contact={sendInvoice ? contactOf(sendInvoice) : null}
        companyName={companyName}
        onOpenChange={(o) => {
          if (!o) {
            setSendInvoice(null);
            queryClient.invalidateQueries({ queryKey: ['invoices', 'activity'] });
          }
        }}
        onDownloadPdf={(inv) => setPrintInvoice(inv)}
      />

      <InvoicePrintModal isOpen={printInvoice !== null} onClose={() => setPrintInvoice(null)} invoice={printInvoice} />
    </>
  );

  return { run, sheets, busy };
}
