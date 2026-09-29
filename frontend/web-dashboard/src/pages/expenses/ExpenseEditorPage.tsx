import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, AlertTriangle, CheckCircle2, CircleHelp, Loader2, Truck, User, Building2, X } from 'lucide-react';
import { toast } from 'sonner';
import { EXPENSE_CATEGORIES, EXPENSE_PAYMENT_METHODS, VEHICLE_REQUIRED_EXPENSE_CATEGORIES } from '@mercon/shared-types';

import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { TONE_CLASSES } from '@/components/finance/kit/tones';
import { expenseService, type CreateExpensePayload, type Expense } from '@/services/expenseService';
import { vehicleService } from '@/services/vehicleService';
import { driverService, type Driver } from '@/services/driverService';
import { categoryTone, DRIVER_CATEGORIES, expenseRef, todayIso } from '@/lib/expenses/expenseMeta';
import { emptyExpenseForm, expenseFormFrom, expenseFormProblems, likelyDuplicates, type ExpenseForm } from '@/lib/expenses/expenseForm';
import { formatDate, formatMoney } from '@/lib/finance/format';
import { cn } from '@/lib/utils';

const NONE = '__none';
const CUSTOM = '__custom';
const label = 'text-[11px] font-medium text-muted-foreground';

/**
 * Record, edit or duplicate an expense on a page of its own.
 * /expenses/new · /expenses/new?from=<id> (duplicate) · /expenses/:id/edit
 */
export default function ExpenseEditorPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { id: editId } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const copyId = params.get('from');
  const editing = Boolean(editId);
  const sourceId = editId ?? copyId;
  const back = params.get('back') || (editing ? `/expenses/${editId}` : '/expenses');

  const source = useQuery({ queryKey: ['expenses', 'detail', sourceId], queryFn: () => expenseService.getById(sourceId as string), enabled: Boolean(sourceId) });
  const [form, setForm] = useState<ExpenseForm>(emptyExpenseForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const loaded = useRef<string | null>(null);

  useEffect(() => {
    if (!source.data || loaded.current === source.data.id) return;
    loaded.current = source.data.id;
    setForm(expenseFormFrom(source.data, !editing));
  }, [source.data, editing]);

  const { data: vehiclesRes } = useQuery({ queryKey: ['vehicles', 'lookup'], queryFn: () => vehicleService.getAll({ per_page: 500, mode: 'lookup' } as any) });
  const { data: driversRes } = useQuery({ queryKey: ['drivers-select'], queryFn: () => driverService.getAll({ per_page: 500, mode: 'lookup' } as any) });
  // Recent expenses: payee suggestions, "last time" hints and the duplicate check
  const { data: recentRes } = useQuery({ queryKey: ['expenses', 'recent-for-editor'], queryFn: () => expenseService.getAll({ sort: 'date_desc', per_page: 300 }) });
  const vehicles = (vehiclesRes?.data ?? []) as { id: string; plate_number: string; asset_type?: string }[];
  const drivers = (driversRes?.data ?? []) as Driver[];
  const recent = useMemo(() => (recentRes?.data ?? []).filter((e) => e.id !== editId), [recentRes, editId]);

  const payees = useMemo(() => [...new Set(recent.map((e) => e.payee?.trim()).filter((p): p is string => Boolean(p)))].slice(0, 60), [recent]);
  const set = <K extends keyof ExpenseForm>(key: K, value: ExpenseForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
  };

  const paid = form.status === 'Paid';
  const amount = Number(form.amount);
  const vehicleRequired = paid && VEHICLE_REQUIRED_EXPENSE_CATEGORIES.includes(form.category);
  const problems = expenseFormProblems(form);
  const duplicates = useMemo(() => likelyDuplicates(form, recent), [form, recent]);
  const samePayee = useMemo(
    () => (form.payee.trim() ? recent.filter((e) => e.payee?.trim().toLowerCase() === form.payee.trim().toLowerCase()).slice(0, 3) : []),
    [form.payee, recent],
  );
  const vehicle = vehicles.find((v) => v.id === form.vehicle_id);
  const driver = drivers.find((d) => d.id === form.driver_id);

  const save = useCallback(
    async (again: boolean, e?: FormEvent) => {
      e?.preventDefault();
      if (saving) return;
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
        const saved = editing ? await expenseService.update(editId as string, payload) : await expenseService.create(payload);
        queryClient.invalidateQueries({ queryKey: ['expenses'] });
        setDirty(false);
        toast.success(`${saved?.ref_id ?? 'Expense'} ${editing ? 'saved' : 'recorded'}`);
        if (again) {
          // Keep the kind of expense for the next one
          setForm((f) => ({ ...emptyExpenseForm(), category: f.category, customCategory: f.customCategory, payment_method: f.payment_method, expense_date: f.expense_date, status: f.status }));
          document.getElementById('exp-amount')?.focus();
        } else navigate(editing ? back : saved?.id ? `/expenses?view=${saved.id}` : back);
      } catch (err: any) {
        setError(err?.response?.data?.error?.message || 'The expense could not be saved.');
      } finally {
        setSaving(false);
      }
    },
    [saving, problems, form, amount, paid, editing, editId, queryClient, navigate, back],
  );

  // Ctrl/⌘+S saves
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        save(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save]);

  // Warn before leaving with unsaved changes
  useEffect(() => {
    if (!dirty || saving) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty, saving]);

  const title = editing ? `Edit ${source.data ? expenseRef(source.data) : 'expense'}` : copyId ? 'Duplicate expense' : 'New expense';
  const where = vehicle ? `${vehicle.plate_number}'s P&L` : driver ? `${driver.first_name} ${driver.last_name}` : 'Company overhead';
  const WhereIcon = vehicle ? Truck : driver ? User : Building2;

  const categorySelect = form.customCategory ? (
    <div className="relative">
      <Input autoFocus value={form.category} onChange={(e) => set('category', e.target.value)} placeholder="New category name" aria-label="Category" className="h-9 pr-8 text-sm" />
      <button
        type="button"
        onClick={() => setForm((f) => ({ ...f, customCategory: false, category: '' }))}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Back to the category list"
        title="Back to the list"
      >
        <X className="size-3.5" />
      </button>
    </div>
  ) : (
    <Select
      value={form.category || undefined}
      onValueChange={(v) => {
        if (!v) return;
        if (v === CUSTOM) setForm((f) => ({ ...f, customCategory: true, category: '' }));
        else set('category', v);
        setDirty(true);
      }}
    >
      <SelectTrigger className="h-9 text-sm" aria-label="Category">
        <SelectValue placeholder="Choose…" />
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
          Other category…
        </SelectItem>
      </SelectContent>
    </Select>
  );

  const truckSelect = (
    <Select value={form.vehicle_id || NONE} onValueChange={(v) => v && set('vehicle_id', v === NONE ? '' : v)}>
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
  );
  const driverSelect = (
    <Select value={form.driver_id || NONE} onValueChange={(v) => v && set('driver_id', v === NONE ? '' : v)}>
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
  );
  const driverFirst = DRIVER_CATEGORIES.includes(form.category);

  return (
    <DashboardLayout active="Expenses" title={title}>
      <div className="mx-auto w-full max-w-[1200px] space-y-3 p-4">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 border-b pb-2.5">
          <Chip tone={editing ? 'info' : 'neutral'} size="sm">
            {editing ? 'Editing' : 'New'}
          </Chip>
          <span className="text-sm font-medium text-foreground">{title}</span>
          {dirty && <span className="text-[11px] text-muted-foreground">· Unsaved changes</span>}
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-muted-foreground" aria-label="Help">
                  <CircleHelp className="size-3.5" /> <span className="max-sm:hidden">Help</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 space-y-2.5 p-4 text-xs leading-relaxed">
                <p className="font-semibold text-foreground">Recording an expense</p>
                <p><span className="font-medium text-foreground">To pay</span> records a bill you haven&apos;t paid yet. Only the category and amount are needed; mark it as paid from the list later.</p>
                <p><span className="font-medium text-foreground">Truck</span>: fuel, maintenance and tyres must name the truck once paid, and count in that truck&apos;s P&amp;L. With no truck or driver the cost is company overhead.</p>
                <p><span className="font-medium text-foreground">Bill date / Bill paid</span> are the dates on the supplier&apos;s bill. Both optional.</p>
                <p><span className="font-medium text-foreground">Duplicate warning</span> appears when an expense with the same amount and the same category or payee was recorded within 3 days.</p>
                <p className="border-t pt-2 text-muted-foreground"><kbd className="rounded border bg-muted px-1">Ctrl</kbd> + <kbd className="rounded border bg-muted px-1">S</kbd> saves. &quot;Save and add another&quot; keeps the category, method, date and status.</p>
              </PopoverContent>
            </Popover>
            <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => navigate(back)} disabled={saving}>
              Cancel
            </Button>
            {!editing && (
              <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => save(true)} disabled={saving}>
                Save and add another
              </Button>
            )}
            <Button type="submit" form="expense-form" size="sm" className="h-8 gap-1.5 bg-brand text-xs text-white hover:bg-brand-hover" disabled={saving} title="Save (Ctrl+S)">
              {saving && <Loader2 className="size-3.5 animate-spin" />}
              {editing ? 'Save changes' : 'Save expense'}
            </Button>
          </div>
        </div>

        {sourceId && source.isLoading ? (
          <Card className="space-y-3 rounded-xl p-6 shadow-xs">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-9 w-full" />)}</Card>
        ) : sourceId && source.isError ? (
          <Card className="rounded-xl p-8 text-center text-sm shadow-xs">
            The expense could not be loaded. <Link to="/expenses" className="underline">Back to expenses</Link>
          </Card>
        ) : (
          <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
            <Card className="gap-0 rounded-xl p-4 shadow-xs">
              <form id="expense-form" onSubmit={(e) => save(false, e)} className="grid grid-cols-2 gap-x-3 gap-y-3 md:grid-cols-4">
                <div className="space-y-1">
                  <Label className={label}>Status</Label>
                  <Select value={form.status} onValueChange={(v) => v && set('status', v as ExpenseForm['status'])}>
                    <SelectTrigger className="h-9 text-sm" aria-label="Status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Paid" className="text-xs">Paid</SelectItem>
                      <SelectItem value="Pending" className="text-xs">To pay</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className={label}>Category</Label>
                  {categorySelect}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="exp-amount" className={label}>Amount (SAR)</Label>
                  <Input
                    id="exp-amount"
                    autoFocus={!sourceId}
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
                  <Label htmlFor="exp-date" className={label}>Date</Label>
                  <Input id="exp-date" type="date" value={form.expense_date} onChange={(e) => set('expense_date', e.target.value)} className="h-9 text-sm" />
                </div>

                <div className="col-span-2 space-y-1">
                  <Label htmlFor="exp-payee" className={label}>Paid to</Label>
                  <Input id="exp-payee" list="exp-payees" value={form.payee} onChange={(e) => set('payee', e.target.value)} placeholder="Supplier, landlord, station…" className="h-9 text-sm" />
                  <datalist id="exp-payees">
                    {payees.map((p) => (
                      <option key={p} value={p} />
                    ))}
                  </datalist>
                </div>
                <div className="space-y-1">
                  <Label className={label}>Method</Label>
                  <Select value={form.payment_method || NONE} onValueChange={(v) => v && set('payment_method', v === NONE ? '' : v)}>
                    <SelectTrigger className="h-9 text-sm" aria-label="Payment method">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EXPENSE_PAYMENT_METHODS.map((m) => (
                        <SelectItem key={m} value={m} className="text-xs">{m}</SelectItem>
                      ))}
                      <SelectItem value={NONE} className="text-xs text-muted-foreground">Not set</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className={label}>{driverFirst ? 'Driver' : 'Truck'}{!driverFirst && vehicleRequired && <span className={TONE_CLASSES.negative.fg}> *</span>}</Label>
                  {driverFirst ? driverSelect : truckSelect}
                </div>

                <div className="space-y-1">
                  <Label className={label}>{driverFirst ? 'Truck' : 'Driver'}{driverFirst && vehicleRequired && <span className={TONE_CLASSES.negative.fg}> *</span>}</Label>
                  {driverFirst ? truckSelect : driverSelect}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="exp-billed" className={label}>Bill date</Label>
                  <Input id="exp-billed" type="date" value={form.bill_issued_date} onChange={(e) => set('bill_issued_date', e.target.value)} className="h-9 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="exp-billpaid" className={label}>Bill paid</Label>
                  <Input id="exp-billpaid" type="date" value={form.bill_paid_date} onChange={(e) => set('bill_paid_date', e.target.value)} disabled={!paid} className="h-9 text-sm" />
                </div>
                <div className="hidden md:block" aria-hidden />

                <div className="col-span-2 space-y-1 md:col-span-4">
                  <Label htmlFor="exp-notes" className={label}>Notes</Label>
                  <Textarea id="exp-notes" rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Optional" className="min-h-0 resize-none text-sm" />
                </div>

                {error && (
                  <p className={cn('col-span-2 flex items-start gap-1.5 rounded-md border p-2 text-xs md:col-span-4', TONE_CLASSES.negative.bg, TONE_CLASSES.negative.fg, TONE_CLASSES.negative.border)}>
                    <AlertCircle className="mt-px size-3.5 shrink-0" /> {error}
                  </p>
                )}
              </form>
            </Card>

            {/* Live summary */}
            <Card className="gap-0 divide-y divide-border/60 overflow-hidden rounded-xl py-0 text-xs shadow-xs">
              <div className="space-y-1.5 p-4">
                <div className="flex flex-wrap items-center gap-1.5">
                  {form.category ? (
                    <Chip tone={categoryTone(form.category)} size="sm" dot>
                      {form.category}
                    </Chip>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">No category</span>
                  )}
                  <Chip tone={paid ? 'positive' : 'warning'} size="sm">
                    {paid ? 'Paid' : 'To pay'}
                  </Chip>
                </div>
                <p className="fin-num text-xl font-semibold leading-tight text-foreground">
                  <span className="mr-1 text-xs font-medium text-muted-foreground">SAR</span>
                  {formatMoney(amount > 0 ? amount : 0)}
                </p>
                <p className="flex items-center gap-1.5 text-muted-foreground" title="Where this cost counts">
                  <WhereIcon className="size-3.5" /> {where}
                </p>
              </div>
              <div className="space-y-1.5 p-4">
                {problems.length === 0 && duplicates.length === 0 && (
                  <p className={cn('flex items-center gap-1.5 font-medium', TONE_CLASSES.positive.fg)}>
                    <CheckCircle2 className="size-3.5" /> Ready to save
                  </p>
                )}
                {problems.map((p) => (
                  <p key={p} className={cn('flex items-start gap-1.5', TONE_CLASSES.negative.fg)}>
                    <AlertCircle className="mt-px size-3.5 shrink-0" /> {p}
                  </p>
                ))}
                {duplicates.map((d) => (
                  <p key={d.id} className={cn('flex items-start gap-1.5', TONE_CLASSES.warning.fg)}>
                    <AlertTriangle className="mt-px size-3.5 shrink-0" />
                    <span>
                      Same as{' '}
                      <Link to={`/expenses/${d.id}`} className="font-medium underline underline-offset-2">
                        {expenseRef(d)}
                      </Link>{' '}
                      ({formatDate(d.expense_date)})?
                    </span>
                  </p>
                ))}
              </div>
              {samePayee.length > 0 && (
                <div className="space-y-1 p-4">
                  <p className="text-[11px] text-muted-foreground">Last paid to {samePayee[0].payee}</p>
                  {samePayee.map((e: Expense) => (
                    <Link key={e.id} to={`/expenses/${e.id}`} className="-mx-1 flex items-center justify-between gap-2 rounded-md px-1 py-0.5 hover:bg-muted/50">
                      <span className="min-w-0 truncate text-foreground">
                        {formatDate(e.expense_date)} · {e.category}
                      </span>
                      <span className="fin-num shrink-0 font-medium">{formatMoney(e.amount)}</span>
                    </Link>
                  ))}
                </div>
              )}
            </Card>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
