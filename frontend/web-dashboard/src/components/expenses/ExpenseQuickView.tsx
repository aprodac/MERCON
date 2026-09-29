import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Copy, Pencil, Route, Trash2, Truck, User } from 'lucide-react';

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { TONE_CLASSES } from '@/components/finance/kit/tones';
import type { Expense } from '@/services/expenseService';
import { categoryTone, driverName, expenseRef } from '@/lib/expenses/expenseMeta';
import { formatDate, formatMoney } from '@/lib/finance/format';
import { cn } from '@/lib/utils';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm text-foreground">{children}</dd>
    </div>
  );
}

/** One expense at a glance, with its actions, without leaving the list. */
export function ExpenseQuickView({
  expense,
  onClose,
  onEdit,
  onDuplicate,
  onDelete,
  onMarkPaid,
  markingPaid,
}: {
  expense: Expense | null;
  onClose: () => void;
  onEdit: (e: Expense) => void;
  onDuplicate: (e: Expense) => void;
  onDelete: (e: Expense) => void;
  onMarkPaid: (e: Expense) => void;
  markingPaid: boolean;
}) {
  const e = expense;
  const tone = TONE_CLASSES[categoryTone(e?.category)];
  const pending = e?.status === 'Pending';
  const driver = e ? driverName(e) : null;

  return (
    <Sheet open={e !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        {e && (
          <>
            <SheetHeader className={cn('space-y-3 border-b p-5 pr-14', tone.bg)}>
              <div className="flex flex-wrap items-center gap-2">
                <Chip tone={categoryTone(e.category)} size="sm" dot>
                  {e.category}
                </Chip>
                <Chip tone={pending ? 'warning' : 'positive'} size="sm">
                  {pending ? 'To pay' : 'Paid'}
                </Chip>
                <span className="text-xs text-muted-foreground tabular-nums">{expenseRef(e)}</span>
              </div>
              <div>
                <SheetTitle className="fin-num text-2xl font-semibold">
                  <span className="mr-1 text-sm font-medium text-muted-foreground">{e.currency || 'SAR'}</span>
                  {formatMoney(e.amount)}
                </SheetTitle>
                <SheetDescription className="text-xs">
                  {e.payee ? `Paid to ${e.payee}` : 'No payee recorded'} · {formatDate(e.expense_date)}
                </SheetDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                {pending && (
                  <Button size="sm" className="h-8 gap-1.5 bg-brand text-xs text-white hover:bg-brand-hover" onClick={() => onMarkPaid(e)} disabled={markingPaid}>
                    <CheckCircle2 className="size-3.5" /> Mark as paid
                  </Button>
                )}
                <Button size="sm" variant="outline" className="h-8 gap-1.5 bg-background text-xs" onClick={() => onEdit(e)}>
                  <Pencil className="size-3.5" /> Edit
                </Button>
                <Button size="sm" variant="outline" className="h-8 gap-1.5 bg-background text-xs" onClick={() => onDuplicate(e)}>
                  <Copy className="size-3.5" /> Duplicate
                </Button>
                <Button size="sm" variant="outline" className="h-8 gap-1.5 bg-background text-xs" onClick={() => onDelete(e)}>
                  <Trash2 className="size-3.5" /> Delete
                </Button>
              </div>
            </SheetHeader>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                <Field label="Payment method">{e.payment_method || '—'}</Field>
                <Field label="Status">{pending ? 'Waiting to be paid' : 'Paid'}</Field>
                <Field label="Bill issued">{e.bill_issued_date ? formatDate(e.bill_issued_date) : '—'}</Field>
                <Field label="Bill paid">{e.bill_paid_date ? formatDate(e.bill_paid_date) : '—'}</Field>
                <Field label="Recorded">{formatDate(e.createdAt)}</Field>
                <Field label="Last changed">{formatDate(e.updatedAt)}</Field>
              </dl>

              <section className="space-y-2">
                <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Charged to</h3>
                {!e.trip && !e.vehicle && !driver && <p className="text-sm text-muted-foreground">Company overhead (no trip, truck or driver)</p>}
                {e.trip && (
                  <Link to={`/trips/${e.trip.id}`} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm hover:bg-muted/40">
                    <span className="flex items-center gap-2">
                      <Route className="size-4 text-muted-foreground" /> {e.trip.ref_id ?? 'Trip'}
                    </span>
                    <span className="text-[11px] text-muted-foreground">Comes off the trip&apos;s margin</span>
                  </Link>
                )}
                {e.vehicle && (
                  <Link to={`/vehicles/${e.vehicle.id}`} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm hover:bg-muted/40">
                    <span className="flex items-center gap-2">
                      <Truck className="size-4 text-muted-foreground" /> {e.vehicle.plate_number}
                      {e.vehicle.deletedAt && <Chip tone="neutral" size="sm">Deleted</Chip>}
                    </span>
                    <span className="text-[11px] text-muted-foreground">Counts in the truck&apos;s P&amp;L</span>
                  </Link>
                )}
                {e.driver && (
                  <Link to={`/drivers/${e.driver.id}`} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm hover:bg-muted/40">
                    <span className="flex items-center gap-2">
                      <User className="size-4 text-muted-foreground" /> {driver}
                      {e.driver.deletedAt && <Chip tone="neutral" size="sm">Deleted</Chip>}
                    </span>
                    <ArrowRight className="size-3.5 text-muted-foreground" />
                  </Link>
                )}
              </section>

              <section className="space-y-1">
                <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Description</h3>
                <p className="whitespace-pre-line text-sm text-foreground">{e.description || <span className="text-muted-foreground">None</span>}</p>
              </section>

              <Button variant="outline" size="sm" asChild className="h-8 w-full gap-1.5 text-xs">
                <Link to={`/expenses/${e.id}`}>
                  Open full page <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
