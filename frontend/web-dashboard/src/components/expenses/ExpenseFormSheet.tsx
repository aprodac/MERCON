import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ChevronDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { EXPENSE_CATEGORIES, EXPENSE_PAYMENT_METHODS, VEHICLE_REQUIRED_EXPENSE_CATEGORIES } from '@mercon/shared-types';

import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SegmentedControl } from '@/components/finance/kit/SegmentedControl';
import { TONE_CLASSES } from '@/components/finance/kit/tones';
import { expenseService, type CreateExpensePayload, type Expense, type ExpenseStatus } from '@/services/expenseService';
import { vehicleService } from '@/services/vehicleService';
import { driverService, type Driver } from '@/services/driverService';
import { categoryTone, DRIVER_CATEGORIES, todayIso } from '@/lib/expenses/expenseMeta';
import { cn } from '@/lib/utils';

const NONE = '__none';
const CUSTOM = '__custom';

interface FormState {
  status: ExpenseStatus;
  category: string;
  customCategory: boolean;
  amount: string;
  expense_date: string;
  payee: string;
  payment_method: string;
  vehicle_id: string;
  driver_id: string;
  bill_issued_date: string;
  bill_paid_date: string;
  description: string;
}

const dateOnly = (iso?: string | null) => (iso ? iso.slice(0, 10) : '');

function initialState(from: Expense | null, duplicate: boolean): FormState {
  if (!from) {
    return {
      status: 'Paid',
      category: '',
      customCategory: false,
      amount: '',
      expense_date: todayIso(),
      payee: '',
      payment_method: 'Bank Transfer',
      vehicle_id: '',
      driver_id: '',
      bill_issued_date: '',
      bill_paid_date: '',
      description: '',
    };
  }
  const known = (EXPENSE_CATEGORIES as readonly string[]).includes(from.category);
  return {
    status: duplicate ? 'Paid' : from.status,
    category: from.category,
    customCategory: !known && Boolean(from.category),
    amount: String(from.amount ?? ''),
    // A duplicate is a new expense: today's date, no bill dates
    expense_date: duplicate ? todayIso() : dateOnly(from.expense_date) || todayIso(),
    payee: from.payee ?? '',
    payment_method: from.payment_method ?? '',
    vehicle_id: from.vehicleId ?? '',
    driver_id: from.driverId ?? '',
    bill_issued_date: duplicate ? '' : dateOnly(from.bill_issued_date),
    bill_paid_date: duplicate ? '' : dateOnly(from.bill_paid_date),
    description: from.description ?? '',
  };
}

const label = 'text-[11px] font-medium text-muted-foreground';

/**
 * Record, edit or duplicate an expense. A Pending expense only needs its category and amount;
 * once Paid, fuel / maintenance / tyre costs must name the truck (it counts in that truck's P&L).
 */
export function ExpenseFormSheet({
  open,
  onOpenChange,
  expense = null,
  duplicate = false,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edit this expense, or copy it when `duplicate`. */
  expense?: Expense | null;
  duplicate?: boolean;
  onSaved?: (saved: Expense) => void;
}) {
  const queryClient = useQueryClient();
  const editing = Boolean(expense) && !duplicate;
  const [form, setForm] = useState<FormState>(() => initialState(expense, duplicate));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showBillDates, setShowBillDates] = useState(false);

  useEffect(() => {
    if (!open) return;
    const next = initialState(expense, duplicate);
    setForm(next);
    setError('');
    setShowBillDates(Boolean(next.bill_issued_date || next.bill_paid_date));
  }, [open, expense, duplicate]);

  const { data: vehiclesRes } = useQuery({ queryKey: ['vehicles', 'lookup'], queryFn: () => vehicleService.getAll({ per_page: 500, mode: 'lookup' } as any), enabled: open });
  const { data: driversRes } = useQuery({ queryKey: ['drivers-select'], queryFn: () => driverService.getAll({ per_page: 500, mode: 'lookup' } as any), enabled: open });
  const vehicles = (vehiclesRes?.data ?? []) as { id: string; plate_number: string; asset_type?: string }[];
  const drivers = (driversRes?.data ?? []) as Driver[];

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const paid = form.status === 'Paid';
  const vehicleRequired = paid && VEHICLE_REQUIRED_EXPENSE_CATEGORIES.includes(form.category);
  const amount = Number(form.amount);
  const driverFirst = DRIVER_CATEGORIES.includes(form.category);

  const problems = useMemo(() => {
    const p: string[] = [];
    if (!form.category.trim()) p.push('Choose a category.');
    if (!(amount > 0)) p.push('Enter an amount above zero.');
    if (vehicleRequired && !form.vehicle_id) p.push(`Choose the truck this ${form.category.toLowerCase()} cost is for; it counts in that truck's P&L.`);
    if (form.bill_paid_date && form.bill_issued_date && form.bill_paid_date < form.bill_issued_date) p.push('The paid date is before the bill date.');
    return p;
  }, [form, amount, vehicleRequired]);

  const save = async (e?: FormEvent, again = false) => {
    e?.preventDefault();
    if (problems.length > 0) {
      setError(problems[0]);
      return;
    }
    setSaving(true);
    setError('');
    const payload: CreateExpensePayload = {
      category: form.category.trim(),
      status: form.status,
      amount,
      currency: 'SAR',
      expense_date: form.expense_date || todayIso(),
      payee: form.payee.trim() || undefined,
      payment_method: form.payment_method || undefined,
      vehicle_id: form.vehicle_id || null,
      driver_id: form.driver_id || null,
      description: form.description.trim() || undefined,
      bill_issued_date: form.bill_issued_date || null,
      bill_paid_date: paid ? form.bill_paid_date || null : null,
    };
    try {
      const saved = editing && expense ? await expenseService.update(expense.id, payload) : await expenseService.create(payload);
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      toast.success(editing ? `${saved?.ref_id ?? 'Expense'} saved` : `${saved?.ref_id ?? 'Expense'} recorded`);
      onSaved?.(saved);
      if (again) {
        // Keep the category, method and date for the next one of the same kind
        setForm((f) => ({ ...initialState(null, false), category: f.category, customCategory: f.customCategory, payment_method: f.payment_method, expense_date: f.expense_date, status: f.status }));
      } else onOpenChange(false);
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || 'The expense could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b p-5 pr-14">
          <SheetTitle className="text-base">{editing ? `Edit ${expense?.ref_id ?? 'expense'}` : duplicate ? 'Duplicate expense' : 'New expense'}</SheetTitle>
          <SheetDescription className="text-xs">
            {duplicate ? `A copy of ${expense?.ref_id ?? 'the expense'}, dated today.` : 'Salaries, fuel, rent, maintenance and other running costs.'}
          </SheetDescription>
        </SheetHeader>

        <form id="expense-form" onSubmit={(e) => save(e)} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          <SegmentedControl
            aria-label="Payment status"
            value={form.status}
            onChange={(v) => set('status', v)}
            options={[
              { value: 'Paid', label: 'Paid' },
              { value: 'Pending', label: 'To pay (pending)' },
            ]}
            className="w-full [&>*]:flex-1"
          />

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
              <Label className={label}>Category</Label>
              {form.customCategory ? (
                <div className="flex gap-2">
                  <Input autoFocus value={form.category} onChange={(e) => set('category', e.target.value)} placeholder="New category name" className="h-9 text-sm" />
                  <Button type="button" variant="outline" size="sm" className="h-9 text-xs" onClick={() => setForm((f) => ({ ...f, customCategory: false, category: '' }))}>
                    List
                  </Button>
                </div>
              ) : (
                <Select
                  value={form.category || undefined}
                  onValueChange={(v) => (v === CUSTOM ? setForm((f) => ({ ...f, customCategory: true, category: '' })) : set('category', v))}
                >
                  <SelectTrigger className="h-9 text-sm" aria-label="Category">
                    <SelectValue placeholder="Choose a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPENSE_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c} className="text-xs">
                        <span className="flex items-center gap-2">
                          <span className={cn('size-2 rounded-full', TONE_CLASSES[categoryTone(c)].dot)} />
                          {c}
                        </span>
                      </SelectItem>
                    ))}
                    <SelectItem value={CUSTOM} className="text-xs text-muted-foreground">
                      Another category…
                    </SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="exp-amount" className={label}>Amount (SAR)</Label>
              <Input
                id="exp-amount"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={(e) => set('amount', e.target.value)}
                placeholder="0.00"
                className="fin-num h-9 text-right text-sm font-semibold"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="exp-date" className={label}>Expense date</Label>
              <Input id="exp-date" type="date" value={form.expense_date} onChange={(e) => set('expense_date', e.target.value)} className="h-9 text-sm" />
            </div>

            <div className="col-span-2 space-y-1">
              <Label htmlFor="exp-payee" className={label}>Paid to</Label>
              <Input id="exp-payee" value={form.payee} onChange={(e) => set('payee', e.target.value)} placeholder="Supplier, landlord, station…" className="h-9 text-sm" />
            </div>

            <div className="col-span-2 space-y-1">
              <Label className={label}>Payment method</Label>
              <SegmentedControl
                aria-label="Payment method"
                value={form.payment_method || 'none'}
                onChange={(v) => set('payment_method', v === 'none' ? '' : v)}
                options={[...EXPENSE_PAYMENT_METHODS.map((m) => ({ value: m, label: m === 'Bank Transfer' ? 'Transfer' : m })), { value: 'none', label: 'None' }]}
                className="w-full flex-wrap [&>*]:flex-1"
              />
            </div>

            {[
              {
                key: 'vehicle' as const,
                node: (
                  <div key="vehicle" className="col-span-2 space-y-1">
                    <Label className={label}>
                      Truck {vehicleRequired ? <span className={TONE_CLASSES.negative.fg}>· required</span> : <span className="font-normal">· optional</span>}
                    </Label>
                    <Select value={form.vehicle_id || NONE} onValueChange={(v) => set('vehicle_id', v === NONE ? '' : v)}>
                      <SelectTrigger className={cn('h-9 text-sm', vehicleRequired && !form.vehicle_id && 'border-chip-negative-border')} aria-label="Truck">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE} className="text-xs text-muted-foreground">No truck</SelectItem>
                        {vehicles.map((v) => (
                          <SelectItem key={v.id} value={v.id} className="text-xs">
                            {v.plate_number}
                            {v.asset_type ? <span className="text-muted-foreground"> · {v.asset_type}</span> : null}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ),
              },
              {
                key: 'driver' as const,
                node: (
                  <div key="driver" className="col-span-2 space-y-1">
                    <Label className={label}>
                      Driver <span className="font-normal">· optional</span>
                    </Label>
                    <Select value={form.driver_id || NONE} onValueChange={(v) => set('driver_id', v === NONE ? '' : v)}>
                      <SelectTrigger className="h-9 text-sm" aria-label="Driver">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE} className="text-xs text-muted-foreground">No driver</SelectItem>
                        {drivers.map((d) => (
                          <SelectItem key={d.id} value={d.id} className="text-xs">
                            {d.first_name} {d.last_name}
                            {d.ref_id ? <span className="text-muted-foreground"> · {d.ref_id}</span> : null}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ),
              },
            ]
              // Pay for people asks for the driver first
              .sort((a, b) => (driverFirst ? (a.key === 'driver' ? -1 : 1) - (b.key === 'driver' ? -1 : 1) : 0))
              .map((f) => f.node)}

            <div className="col-span-2 space-y-1">
              <Label htmlFor="exp-desc" className={label}>Description</Label>
              <Textarea id="exp-desc" rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="What it was for" className="resize-none text-sm" />
            </div>

            <div className="col-span-2">
              <button
                type="button"
                onClick={() => setShowBillDates((v) => !v)}
                className="flex items-center gap-1 text-xs font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                aria-expanded={showBillDates}
              >
                <ChevronDown className={cn('size-3.5 transition-transform', !showBillDates && '-rotate-90')} /> Supplier bill dates
              </button>
              {showBillDates && (
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="exp-billed" className={label}>Bill issued</Label>
                    <Input id="exp-billed" type="date" value={form.bill_issued_date} onChange={(e) => set('bill_issued_date', e.target.value)} className="h-9 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="exp-billpaid" className={label}>Bill paid</Label>
                    <Input id="exp-billpaid" type="date" value={form.bill_paid_date} onChange={(e) => set('bill_paid_date', e.target.value)} disabled={!paid} className="h-9 text-sm" />
                  </div>
                </div>
              )}
            </div>
          </div>

          {error && (
            <p className={cn('flex items-start gap-1.5 rounded-md border p-2 text-xs', TONE_CLASSES.negative.bg, TONE_CLASSES.negative.fg, TONE_CLASSES.negative.border)}>
              <AlertCircle className="mt-px size-3.5 shrink-0" /> {error}
            </p>
          )}
        </form>

        <SheetFooter className="flex-row items-center justify-end gap-2 border-t p-4 sm:justify-end">
          <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          {!editing && (
            <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => save(undefined, true)} disabled={saving}>
              Save and add another
            </Button>
          )}
          <Button type="submit" form="expense-form" size="sm" className="h-8 gap-1.5 bg-brand text-xs text-white hover:bg-brand-hover" disabled={saving}>
            {saving && <Loader2 className="size-3.5 animate-spin" />}
            {editing ? 'Save changes' : 'Save expense'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
