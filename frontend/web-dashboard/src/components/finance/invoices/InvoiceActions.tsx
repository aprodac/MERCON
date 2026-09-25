import { BellRing, Copy, FileCheck2, HandCoins, MoreHorizontal, Pencil, Printer, Send, Trash2, XCircle } from 'lucide-react';
import type { Invoice } from '@mercon/shared-types';
import { Button } from '@/components/ui/button';
import { Chip, type ChipTone } from '@/components/ui/chip';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { canVoid, invoiceState, nextAction, type InvoiceState } from '@/lib/finance/invoices';
import { cn } from '@/lib/utils';
import type { InvoiceCommand } from './useInvoiceWorkflow';

const STATE_CHIP: Record<InvoiceState, { tone: ChipTone; label: string }> = {
  draft: { tone: 'neutral', label: 'Draft' },
  unpaid: { tone: 'info', label: 'Unpaid' },
  part_paid: { tone: 'warning', label: 'Part paid' },
  overdue: { tone: 'negative', label: 'Overdue' },
  paid: { tone: 'positive', label: 'Paid' },
  void: { tone: 'neutral', label: 'Void' },
};

export function InvoiceStateChip({ invoice, today, className }: { invoice: Invoice; today: string; className?: string }) {
  const c = STATE_CHIP[invoiceState(invoice, today)];
  return <Chip tone={c.tone} size="sm" className={className}>{c.label}</Chip>;
}

const PRIMARY = {
  issue: { label: 'Issue', icon: FileCheck2 },
  record_payment: { label: 'Record payment', icon: HandCoins },
  remind: { label: 'Remind', icon: BellRing },
  send: { label: 'Send', icon: Send },
} as const;

/**
 * The next thing to do with an invoice as one button, everything else in the ⋯ menu.
 * `compact` is the table-row size; the panel uses the full size with the brand colour.
 */
export function InvoiceActions({
  invoice,
  today,
  run,
  compact = false,
  busy = false,
}: {
  invoice: Invoice;
  today: string;
  run: (command: InvoiceCommand, invoice: Invoice) => void;
  compact?: boolean;
  busy?: boolean;
}) {
  const state = invoiceState(invoice, today);
  const primary = nextAction(state);
  const P = primary ? PRIMARY[primary] : null;
  const draft = state === 'draft';
  const open = state === 'unpaid' || state === 'part_paid' || state === 'overdue';
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div className="flex items-center justify-end gap-1" onClick={stop}>
      {P && primary && (
        <Button
          size="sm"
          variant={compact ? 'outline' : 'default'}
          disabled={busy}
          onClick={() => run(primary, invoice)}
          className={cn('gap-1.5 text-xs', compact ? 'h-7' : 'h-8 bg-brand text-white hover:bg-brand-hover')}
        >
          <P.icon className="size-3.5" /> {P.label}
        </Button>
      )}
      {!compact && !draft && state !== 'void' && (
        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" disabled={busy} onClick={() => run('send', invoice)}>
          <Send className="size-3.5" /> Send
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className={compact ? 'size-7' : 'size-8'} aria-label={`More actions for ${invoice.ref_id ?? 'invoice'}`}>
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {draft && (
            <DropdownMenuItem className="gap-2 text-xs" onClick={() => run('edit', invoice)}>
              <Pencil className="size-3.5" /> Edit draft
            </DropdownMenuItem>
          )}
          {open && primary !== 'record_payment' && (
            <DropdownMenuItem className="gap-2 text-xs" onClick={() => run('record_payment', invoice)}>
              <HandCoins className="size-3.5" /> Record payment
            </DropdownMenuItem>
          )}
          {open && primary !== 'remind' && (
            <DropdownMenuItem className="gap-2 text-xs" onClick={() => run('remind', invoice)}>
              <BellRing className="size-3.5" /> Send reminder
            </DropdownMenuItem>
          )}
          {compact && !draft && state !== 'void' && (
            <DropdownMenuItem className="gap-2 text-xs" onClick={() => run('send', invoice)}>
              <Send className="size-3.5" /> Send invoice
            </DropdownMenuItem>
          )}
          <DropdownMenuItem className="gap-2 text-xs" onClick={() => run('print', invoice)}>
            <Printer className="size-3.5" /> Print or PDF
          </DropdownMenuItem>
          <DropdownMenuItem className="gap-2 text-xs" onClick={() => run('duplicate', invoice)}>
            <Copy className="size-3.5" /> Duplicate
          </DropdownMenuItem>
          {(canVoid(invoice) || draft) && <DropdownMenuSeparator />}
          {canVoid(invoice) && (
            <DropdownMenuItem className="gap-2 text-xs text-destructive focus:text-destructive" onClick={() => run('void', invoice)}>
              <XCircle className="size-3.5" /> Void invoice
            </DropdownMenuItem>
          )}
          {draft && (
            <DropdownMenuItem className="gap-2 text-xs text-destructive focus:text-destructive" onClick={() => run('delete', invoice)}>
              <Trash2 className="size-3.5" /> Delete draft
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
