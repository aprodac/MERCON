import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, AlertTriangle, CheckCircle2, Loader2, Truck, User, Building2 } from 'lucide-react';
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
import { SegmentedControl } from '@/components/finance/kit/SegmentedControl';
import { TONE_CLASSES } from '@/components/finance/kit/tones';
import { expenseService, type CreateExpensePayload, type Expense } from '@/services/expenseService';
import { vehicleService } from '@/services/vehicleService';
import { driverService, type Driver } from '@/services/driverService';
import { categoryTone, DRIVER_CATEGORIES, expenseRef, todayIso } from '@/lib/expenses/expenseMeta';
import { emptyExpenseForm, expenseFormFrom, expenseFormProblems, likelyDuplicates, type ExpenseForm } from '@/lib/expenses/expenseForm';
import { formatDate, formatMoney } from '@/lib/finance/format';
import { cn } from '@/lib/utils';

const NONE = '__none';
const label = 'text-[11px] font-medium text-muted-foreground';

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="grid gap-3 px-5 py-4 md:grid-cols-[180px_minmax(0,1fr)] md:gap-6">
      <div>
        <h2 className="text-sm font-medium text-foreground">{title}</h2>
        {hint && <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{hint}</p>}
      </div>
      <div className="min-w-0 space-y-3">{children}</div>
    </section>
  );
}

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
          window.scrollTo({ top: 0 });
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
  const tone = TONE_CLASSES[categoryTone(form.category)];

  const truckField = (
    <div key="truck" className="space-y-1">
      <Label className={label}>
        Truck {vehicleRequired ? <span className={TONE_CLASSES.negative.fg}>· required once paid</span> : <span className="font-normal">· optional</span>}
      </Label>
      <Select value={form.vehicle_id || NONE} onValueChange={(v) => v && set('vehicle_id', v === NONE ? '' : v)}>
        <SelectTrigger className={cn('h-10 text-sm', vehicleRequired && !form.vehicle_id && 'border-chip-negative-border')} aria-label="Truck">
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
  );
  const driverField = (
    <div key="driver" className="space-y-1">
      <Label className={label}>
        Driver <span className="font-normal">· optional</span>
      </Label>
      <Select value={form.driver_id || NONE} onValueChange={(v) => v && set('driver_id', v === NONE ? '' : v)}>
        <SelectTrigger className="h-10 text-sm" aria-label="Driver">
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
  );

  return (
    <DashboardLayout active="Expenses" title={title}>
      <div className="mx-auto w-full max-w-[1200px] space-y-3 p-4 pb-10">
        {/* Toolbar */}
        <div className="sticky top-0 z-20 -mx-4 flex flex-wrap items-center gap-2 border-b bg-background/95 px-4 py-2.5 backdrop-blur">
          <Chip tone={editing ? 'info' : 'neutral'} size="sm">
            {editing ? 'Editing' : 'New'}
          </Chip>
          <span className="text-sm font-medium text-foreground">{title}</span>
          {dirty && <span className="text-[11px] text-muted-foreground">· Unsaved changes</span>}
          <div className="ml-auto flex items-center gap-2">
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
          <Card className="space-y-3 rounded-xl p-6 shadow-xs">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-9 w-full" />)}</Card>
        ) : sourceId && source.isError ? (
          <Card className="rounded-xl p-8 text-center text-sm shadow-xs">
            The expense could not be loaded. <Link to="/expenses" className="underline">Back to expenses</Link>
          </Card>
        ) : (
          <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
            {/* The form: one card, sections divided */}
            <Card className="gap-0 rounded-xl py-0 shadow-xs">
              <form id="expense-form" onSubmit={(e) => save(false, e)} className="divide-y divide-border/60">
                <Section title="What it was" hint="Pick the category; a pending expense only needs this and the amount.">
                  <SegmentedControl
                    aria-label="Payment status"
                    value={form.status}
                    onChange={(v) => set('status', v)}
                    options={[
                      { value: 'Paid', label: 'Paid' },
                      { value: 'Pending', label: 'To pay (pending)' },
                    ]}
                  />
                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 xl:grid-cols-4" role="radiogroup" aria-label="Category">
                    {EXPENSE_CATEGORIES.map((c) => {
                      const on = !form.customCategory && form.category === c;
                      const t = TONE_CLASSES[categoryTone(c)];
                      return (
                        <button
                          key={c}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          onClick={() => {
                            setForm((f) => ({ ...f, category: c, customCategory: false }));
                            setDirty(true);
                          }}
                          className={cn(
                            'flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                            on ? cn(t.bg, t.border, t.fg, 'font-medium') : 'border-border hover:bg-muted/50',
                          )}
                        >
                          <span className={cn('size-2 shrink-0 rounded-full', t.dot)} />
                          <span className="truncate">{c}</span>
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      role="radio"
                      aria-checked={form.customCategory}
                      onClick={() => {
                        setForm((f) => ({ ...f, customCategory: true, category: f.customCategory ? f.category : '' }));
                        setDirty(true);
                      }}
                      className={cn(
                        'rounded-lg border border-dashed px-2.5 py-2 text-left text-xs text-muted-foreground outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring',
                        form.customCategory && 'border-ring bg-muted/50 text-foreground',
                      )}
                    >
                      Another category…
                    </button>
                  </div>
                  {form.customCategory && (
                    <Input autoFocus value={form.category} onChange={(e) => set('category', e.target.value)} placeholder="Name the category" aria-label="Category name" className="h-10 max-w-sm text-sm" />
                  )}
                </Section>

                <Section title="Amount and date">
                  <div className="grid gap-3 sm:grid-cols-2">
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
                        className="fin-num h-11 text-right text-lg font-semibold"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="exp-date" className={label}>Expense date</Label>
                      <Input id="exp-date" type="date" value={form.expense_date} onChange={(e) => set('expense_date', e.target.value)} className="h-11 text-sm" />
                    </div>
                  </div>
                </Section>

                <Section title="Payment" hint="Who it was paid to and how.">
                  <div className="space-y-1">
                    <Label htmlFor="exp-payee" className={label}>Paid to</Label>
                    <Input id="exp-payee" list="exp-payees" value={form.payee} onChange={(e) => set('payee', e.target.value)} placeholder="Supplier, landlord, station…" className="h-10 text-sm" />
                    <datalist id="exp-payees">
                      {payees.map((p) => (
                        <option key={p} value={p} />
                      ))}
                    </datalist>
                  </div>
                  <div className="space-y-1">
                    <Label className={label}>Payment method</Label>
                    <SegmentedControl
                      aria-label="Payment method"
                      value={form.payment_method || 'none'}
                      onChange={(v) => set('payment_method', v === 'none' ? '' : v)}
                      options={[...EXPENSE_PAYMENT_METHODS.map((m) => ({ value: m, label: m })), { value: 'none', label: 'Not set' }]}
                      className="flex-wrap"
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor="exp-billed" className={label}>Supplier bill date <span className="font-normal">· optional</span></Label>
                      <Input id="exp-billed" type="date" value={form.bill_issued_date} onChange={(e) => set('bill_issued_date', e.target.value)} className="h-10 text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="exp-billpaid" className={label}>Bill paid on <span className="font-normal">· optional</span></Label>
                      <Input id="exp-billpaid" type="date" value={form.bill_paid_date} onChange={(e) => set('bill_paid_date', e.target.value)} disabled={!paid} className="h-10 text-sm" />
                    </div>
                  </div>
                </Section>

                <Section title="Charged to" hint="A truck's costs count in its P&L. Leave both empty for company overhead.">
                  <div className="grid gap-3 sm:grid-cols-2">{DRIVER_CATEGORIES.includes(form.category) ? [driverField, truckField] : [truckField, driverField]}</div>
                </Section>

                <Section title="Notes">
                  <Textarea rows={3} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="What it was for, invoice number, anything useful later" aria-label="Description" className="resize-none text-sm" />
                </Section>

                {error && (
                  <div className="px-5 py-3">
                    <p className={cn('flex items-start gap-1.5 rounded-md border p-2 text-xs', TONE_CLASSES.negative.bg, TONE_CLASSES.negative.fg, TONE_CLASSES.negative.border)}>
                      <AlertCircle className="mt-px size-3.5 shrink-0" /> {error}
                    </p>
                  </div>
                )}
              </form>
            </Card>

            {/* Live summary */}
            <div className="space-y-3 lg:sticky lg:top-16">
              <Card className="gap-0 divide-y divide-border/60 overflow-hidden rounded-xl py-0 shadow-xs">
                <div className={cn('space-y-2 p-4', form.category && tone.bg)}>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {form.category ? (
                      <Chip tone={categoryTone(form.category)} size="sm" dot>
                        {form.category}
                      </Chip>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">No category yet</span>
                    )}
                    <Chip tone={paid ? 'positive' : 'warning'} size="sm">
                      {paid ? 'Paid' : 'To pay'}
                    </Chip>
                  </div>
                  <p className="fin-num text-2xl font-semibold leading-tight text-foreground">
                    <span className="mr-1 text-sm font-medium text-muted-foreground">SAR</span>
                    {formatMoney(amount > 0 ? amount : 0)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {form.payee.trim() ? `To ${form.payee.trim()}` : 'No payee'} · {form.expense_date ? formatDate(form.expense_date) : 'no date'}
                    {form.payment_method ? ` · ${form.payment_method}` : ''}
                  </p>
                </div>
                <div className="space-y-1.5 p-4 text-xs">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Where it counts</p>
                  {vehicle && (
                    <p className="flex items-center gap-1.5 text-foreground">
                      <Truck className="size-3.5 text-muted-foreground" /> {vehicle.plate_number}&apos;s P&amp;L
                    </p>
                  )}
                  {driver && (
                    <p className="flex items-center gap-1.5 text-foreground">
                      <User className="size-3.5 text-muted-foreground" /> {driver.first_name} {driver.last_name}
                    </p>
                  )}
                  {!vehicle && !driver && (
                    <p className="flex items-center gap-1.5 text-foreground">
                      <Building2 className="size-3.5 text-muted-foreground" /> Company overhead
                    </p>
                  )}
                </div>
                <div className="space-y-1.5 p-4">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Checks</p>
                  {problems.length === 0 && duplicates.length === 0 && (
                    <p className={cn('flex items-center gap-1.5 text-xs font-medium', TONE_CLASSES.positive.fg)}>
                      <CheckCircle2 className="size-3.5" /> Ready to save
                    </p>
                  )}
                  {problems.map((p) => (
                    <p key={p} className={cn('flex items-start gap-1.5 text-xs', TONE_CLASSES.negative.fg)}>
                      <AlertCircle className="mt-px size-3.5 shrink-0" /> {p}
                    </p>
                  ))}
                  {duplicates.map((d) => (
                    <p key={d.id} className={cn('flex items-start gap-1.5 text-xs', TONE_CLASSES.warning.fg)}>
                      <AlertTriangle className="mt-px size-3.5 shrink-0" />
                      <span>
                        Looks like{' '}
                        <Link to={`/expenses/${d.id}`} className="font-medium underline underline-offset-2">
                          {expenseRef(d)}
                        </Link>{' '}
                        ({formatDate(d.expense_date)}, SAR {formatMoney(d.amount)}). Already recorded?
                      </span>
                    </p>
                  ))}
                </div>
              </Card>

              {samePayee.length > 0 && (
                <Card className="gap-0 rounded-xl py-0 shadow-xs">
                  <div className="space-y-1.5 p-4">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Last paid to {samePayee[0].payee}</p>
                    {samePayee.map((e: Expense) => (
                      <Link key={e.id} to={`/expenses/${e.id}`} className="flex items-center justify-between gap-2 rounded-md px-1 py-0.5 text-xs hover:bg-muted/50">
                        <span className="min-w-0 truncate text-foreground">
                          {formatDate(e.expense_date)} · {e.category}
                        </span>
                        <span className="fin-num shrink-0 font-medium">{formatMoney(e.amount)}</span>
                      </Link>
                    ))}
                  </div>
                </Card>
              )}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
