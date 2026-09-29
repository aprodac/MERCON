import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle, AlertTriangle, ArrowUpRight, Banknote, BookOpenCheck, Building2, CheckCircle2, Circle, CircleEllipsis, CircleHelp, Disc, Fuel, HandCoins, Landmark,
  Loader2, Paperclip, Plus, Route, ShieldCheck, SquareParking, Truck, User, Wrench, X, Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { EXPENSE_CATEGORIES, EXPENSE_PAYMENT_METHODS, expenseCategoryRule } from '@mercon/shared-types';

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
import { SegmentedControl } from '@/components/finance/kit/SegmentedControl';
import { expenseService, type CreateExpensePayload, type Expense } from '@/services/expenseService';
import { vehicleService } from '@/services/vehicleService';
import { driverService, type Driver } from '@/services/driverService';
import { categoryTone, expenseRef, todayIso } from '@/lib/expenses/expenseMeta';
import { allowedLinks, emptyExpenseForm, expenseFormFrom, expenseFormProblems, fitLinksToCategory, defaultFor, forOf, forOptions, linksFor, likelyDuplicates, suggestPayFrom, payFromOptions, lastPayFrom, rememberPayFrom, type ExpenseForm, type ExpenseFor } from '@/lib/expenses/expenseForm';
import { financeService } from '@/services/financeService';
import { TripPicker } from '@/components/expenses/TripPicker';
import { toPickedTrip, type PickedTrip } from '@/lib/expenses/pickedTrip';
import { tripService } from '@/services/tripService';
import { formatDate, formatMoney } from '@/lib/finance/format';
import { cn } from '@/lib/utils';

const NONE = '__none';
const label = 'text-[11px] font-medium text-muted-foreground';

const CATEGORY_ICON: Record<string, ComponentType<{ className?: string }>> = {
  Salary: Banknote,
  Fuel,
  'Toll & Parking': SquareParking,
  Rent: Building2,
  Utilities: Zap,
  'Office Supplies': Paperclip,
  Insurance: ShieldCheck,
  'Vehicle Maintenance': Wrench,
  Tyres: Disc,
  'Government Fees': Landmark,
  Other: CircleEllipsis,
};
const FOR_LABEL: Record<ExpenseFor, string> = { trip: 'A trip', vehicle: 'A truck', driver: 'A driver', company: 'Company overhead' };

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
  // From a trip's page: /expenses/new?trip=<id>
  const tripParam = params.get('trip');
  const editing = Boolean(editId);
  const sourceId = editId ?? copyId;
  const back = params.get('back') || (editing ? `/expenses/${editId}` : '/expenses');

  const source = useQuery({ queryKey: ['expenses', 'detail', sourceId], queryFn: () => expenseService.getById(sourceId as string), enabled: Boolean(sourceId) });
  const [form, setForm] = useState<ExpenseForm>(emptyExpenseForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  // Problems show in red only after a save attempt; before that they're a quiet checklist
  const [tried, setTried] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const [showBillDate, setShowBillDate] = useState(false);
  // "What it's for" before its trip, truck or driver is picked
  const [forPick, setForPick] = useState<ExpenseFor | null>(null);
  const loaded = useRef<string | null>(null);

  useEffect(() => {
    if (!source.data || loaded.current === source.data.id) return;
    loaded.current = source.data.id;
    setForm(expenseFormFrom(source.data, !editing));
  }, [source.data, editing]);

  // The chosen trip (its truck and driver are the expense's); loaded for a saved expense or ?trip=
  const [trip, setTrip] = useState<PickedTrip | null>(null);
  useEffect(() => {
    if (!editing && !copyId && tripParam) setForm((f) => ({ ...f, trip_id: tripParam }));
  }, [editing, copyId, tripParam]);
  const tripLookup = useQuery({
    queryKey: ['trips', 'detail', form.trip_id],
    queryFn: () => tripService.getById(form.trip_id),
    enabled: Boolean(form.trip_id) && trip?.id !== form.trip_id,
  });
  useEffect(() => {
    if (tripLookup.data && (tripLookup.data as any).id === form.trip_id) setTrip(toPickedTrip(tripLookup.data));
  }, [tripLookup.data, form.trip_id]);
  const chosenTrip = trip && trip.id === form.trip_id ? trip : null;

  const { data: vehiclesRes } = useQuery({ queryKey: ['vehicles', 'lookup'], queryFn: () => vehicleService.getAll({ per_page: 500, mode: 'lookup' } as any) });
  const { data: driversRes } = useQuery({ queryKey: ['drivers-select'], queryFn: () => driverService.getAll({ per_page: 500, mode: 'lookup' } as any) });
  // Recent expenses: payee suggestions, "last time" hints and the duplicate check
  const { data: recentRes } = useQuery({ queryKey: ['expenses', 'recent-for-editor'], queryFn: () => expenseService.getAll({ sort: 'date_desc', per_page: 300 }) });
  const { data: bankRes } = useQuery({ queryKey: ['bank-accounts'], queryFn: () => financeService.getBankAccounts() });
  const payFrom = useMemo(
    () => payFromOptions((bankRes?.data ?? []) as any[]),
    [bankRes],
  );
  const ledgerSetup = useQuery({ queryKey: ['expenses', 'ledger-setup'], queryFn: expenseService.getLedgerSetup, staleTime: 60_000 });
  const vehicles = (vehiclesRes?.data ?? []) as { id: string; plate_number: string; asset_type?: string }[];
  const drivers = (driversRes?.data ?? []) as Driver[];
  const recent = useMemo(() => (recentRes?.data ?? []).filter((e) => e.id !== editId), [recentRes, editId]);

  const payees = useMemo(() => [...new Set(recent.map((e) => e.payee?.trim()).filter((p): p is string => Boolean(p)))].slice(0, 60), [recent]);
  const set = <K extends keyof ExpenseForm>(key: K, value: ExpenseForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
  };

  const paid = form.status === 'Paid';
  // Suggest where a paid expense came out of; the choice is remembered per payment method
  useEffect(() => {
    if (!paid || form.payment_account_id || payFrom.length === 0) return;
    const pick = suggestPayFrom(form.payment_method, payFrom, lastPayFrom());
    if (pick) setForm((f) => ({ ...f, payment_account_id: pick }));
  }, [paid, form.payment_account_id, form.payment_method, payFrom]);
  const amount = Number(form.amount);
  const rule = expenseCategoryRule(form.category);
  const links = allowedLinks(form.category);
  const vehicleRequired = paid && Boolean(rule.needsTruckWhenPaid) && !form.trip_id;
  const problems = expenseFormProblems(form, chosenTrip);
  const duplicates = useMemo(() => likelyDuplicates(form, recent), [form, recent]);
  const samePayee = useMemo(
    () => (form.payee.trim() ? recent.filter((e) => e.payee?.trim().toLowerCase() === form.payee.trim().toLowerCase()).slice(0, 3) : []),
    [form.payee, recent],
  );
  // A trip's truck and driver are the expense's
  const vehicleId = form.trip_id ? chosenTrip?.vehicleId ?? '' : form.vehicle_id;
  const driverId = form.trip_id ? chosenTrip?.driverId ?? '' : form.driver_id;
  const vehicle = vehicles.find((v) => v.id === vehicleId);
  const driver = drivers.find((d) => d.id === driverId);
  const forChoices = forOptions(form.category);
  const picked = forOf(form) ?? forPick;
  const forNow: ExpenseFor = picked && forChoices.includes(picked) ? picked : defaultFor(form.category);
  const chooseFor = (kind: ExpenseFor) => {
    setForPick(kind);
    setForm((f) => ({ ...f, ...linksFor(f, kind) }));
    setDirty(true);
  };
  const chooseCategory = (category: string, custom = false) => {
    setForPick(forOf(fitLinksToCategory(form, category)) ?? defaultFor(category));
    setForm((f) => ({ ...f, category, customCategory: custom, ...fitLinksToCategory(f, category) }));
    setDirty(true);
  };

  const save = useCallback(
    async (again: boolean, e?: FormEvent) => {
      e?.preventDefault();
      if (saving) return;
      if (problems.length > 0) {
        setTried(true);
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
        trip_id: form.trip_id || null,
        payment_account_id: paid ? form.payment_account_id || null : null,
        vehicle_id: form.trip_id ? null : form.vehicle_id || null,
        driver_id: form.trip_id ? null : form.driver_id || null,
        description: form.description.trim() || undefined,
        bill_issued_date: form.bill_issued_date || null,
        bill_paid_date: paid ? form.bill_paid_date || null : null,
      };
      try {
        const saved = editing ? await expenseService.update(editId as string, payload) : await expenseService.create(payload);
        queryClient.invalidateQueries({ queryKey: ['expenses'] });
        setDirty(false);
        setTried(false);
        if (paid && form.payment_account_id && form.payment_method) rememberPayFrom(form.payment_method, form.payment_account_id);
        if (saved?.ledger?.problem) toast.warning(`${saved.ref_id ?? 'Expense'} saved, but not in the ledger: ${saved.ledger.problem}`);
        else toast.success(`${saved?.ref_id ?? 'Expense'} ${editing ? 'saved' : 'recorded'}${saved?.ledger?.entries?.length ? ' and posted' : ''}`);
        if (again) {
          // Keep the kind of expense for the next one
          // Same trip too: several costs of one trip are usually entered together
          setForm((f) => ({ ...emptyExpenseForm(), category: f.category, customCategory: f.customCategory, payment_method: f.payment_method, expense_date: f.expense_date, status: f.status, trip_id: f.trip_id }));
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
  const where = form.trip_id
    ? `${chosenTrip?.ref_id ?? 'The trip'}'s margin${vehicle ? ` and ${vehicle.plate_number}'s P&L` : ''}`
    : vehicle
      ? `${vehicle.plate_number}'s P&L`
      : driver
        ? `${driver.first_name} ${driver.last_name}`
        : 'Company overhead';
  const WhereIcon = form.trip_id ? Route : vehicle ? Truck : driver ? User : Building2;
  const payFromName = payFrom.find((a) => a.accountId === form.payment_account_id)?.name;

  const categoryChoice = form.customCategory ? (
    <div className="relative max-w-sm">
      <Input autoFocus value={form.category} onChange={(e) => chooseCategory(e.target.value, true)} placeholder="New category name" aria-label="Category" className="h-9 pr-8 text-sm" />
      <button
        type="button"
        onClick={() => chooseCategory('', false)}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Back to the category list"
        title="Back to the list"
      >
        <X className="size-3.5" />
      </button>
    </div>
  ) : (
    <div role="radiogroup" aria-label="Category" className="flex flex-wrap gap-1.5">
      {EXPENSE_CATEGORIES.map((c) => {
        const Icon = CATEGORY_ICON[c] ?? CircleEllipsis;
        const tone = TONE_CLASSES[categoryTone(c)];
        const on = form.category === c;
        return (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => {
              chooseCategory(c);
              document.getElementById('exp-amount')?.focus();
            }}
            className={cn(
              'flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
              on ? cn(tone.bg, tone.fg, tone.border) : 'border-border bg-background text-foreground hover:bg-muted/60',
            )}
          >
            <Icon className={cn('size-3.5', !on && tone.fg)} />
            {c}
          </button>
        );
      })}
      {form.category === 'Salary Advance' && (
        <span className={cn('flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium', TONE_CLASSES.violet.bg, TONE_CLASSES.violet.fg, TONE_CLASSES.violet.border)}>
          <HandCoins className="size-3.5" /> Salary Advance
        </span>
      )}
      <button type="button" onClick={() => chooseCategory('', true)} className="h-8 rounded-lg px-2 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
        New category…
      </button>
      <Link
        to={`/finance/advances/new?type=employee${form.driver_id ? `&party_id=${form.driver_id}` : ''}`}
        className="flex h-8 items-center gap-1 rounded-lg px-2 text-xs text-muted-foreground hover:text-foreground"
        title="A salary advance is money the driver owes back: it is recorded in Advances"
      >
        Salary advance <ArrowUpRight className="size-3" />
      </Link>
    </div>
  );

  const truckSelect = (
    <Select value={form.vehicle_id || NONE} onValueChange={(v) => v && set('vehicle_id', v === NONE ? '' : v)}>
      <SelectTrigger className={cn('h-9 text-sm', tried && vehicleRequired && !form.vehicle_id && 'border-chip-negative-border')} aria-label="Truck">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE} className="text-xs text-muted-foreground">Choose a truck…</SelectItem>
        {vehicles.map((v) => (
          <SelectItem key={v.id} value={v.id} className="text-xs">
            {v.plate_number}
            {v.asset_type ? <span className="text-muted-foreground"> · {v.asset_type}</span> : null}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
  const driverSelect = (placeholder: string) => (
    <Select value={form.driver_id || NONE} onValueChange={(v) => v && set('driver_id', v === NONE ? '' : v)}>
      <SelectTrigger className={cn('h-9 text-sm', tried && forNow === 'driver' && !form.driver_id && 'border-chip-negative-border')} aria-label="Driver">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE} className="text-xs text-muted-foreground">{placeholder}</SelectItem>
        {drivers.map((d) => (
          <SelectItem key={d.id} value={d.id} className="text-xs">
            {d.first_name} {d.last_name}
            {d.ref_id ? <span className="text-muted-foreground"> · {d.ref_id}</span> : null}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const methodSelect = (
    <Select value={form.payment_method || NONE} onValueChange={(v) => v && setForm((f) => ({ ...f, payment_method: v === NONE ? '' : v, payment_account_id: '' }))}>
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
  );
  const showBillDateField = paid && (showBillDate || Boolean(form.bill_issued_date));
  const showNoteField = showNote || Boolean(form.description);

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
                <p>Pick what it was, enter the amount, say what it&apos;s for, then how it was paid. Each step only offers what fits the category.</p>
                <p><span className="font-medium text-foreground">A trip</span>: fuel and tolls for one trip. The trip&apos;s truck and driver fill in, the cost comes off the trip&apos;s margin and counts in the truck&apos;s P&amp;L. Subcontracted trips can&apos;t take expenses.</p>
                <p><span className="font-medium text-foreground">A truck</span>: maintenance and tyres go on the truck; fuel needs a trip or a truck once paid. Rent, utilities and office costs are company overhead.</p>
                <p><span className="font-medium text-foreground">To pay later</span> records a bill you haven&apos;t paid yet; mark it as paid from the list later.</p>
                <p><span className="font-medium text-foreground">Salary advance</span> is money the driver owes back, so it is recorded in Finance → Advances, not here.</p>
                <p><span className="font-medium text-foreground">Duplicate warning</span> appears when an expense with the same amount and the same category or payee was recorded within 3 days.</p>
                <p className="border-t pt-2 text-muted-foreground"><kbd className="rounded border bg-muted px-1">Ctrl</kbd> + <kbd className="rounded border bg-muted px-1">S</kbd> saves. &quot;Save and add another&quot; keeps the category, trip, method, date and status.</p>
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
            <Card className="gap-0 rounded-xl py-0 shadow-xs">
              <form id="expense-form" onSubmit={(e) => save(false, e)} className="divide-y divide-border/60">
                <Step n={1} title="What was it">
                  {categoryChoice}
                </Step>

                <Step n={2} title="How much and when">
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,1.5fr)]">
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
                        className={cn('fin-num h-11 text-right text-lg font-semibold', tried && !(amount > 0) && 'border-chip-negative-border')}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="exp-date" className={label}>Date</Label>
                      <Input id="exp-date" type="date" value={form.expense_date} onChange={(e) => set('expense_date', e.target.value)} className="h-11 text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="exp-payee" className={label}>Paid to</Label>
                      <Input id="exp-payee" list="exp-payees" value={form.payee} onChange={(e) => set('payee', e.target.value)} placeholder="Supplier, landlord, station…" className="h-11 text-sm" />
                      <datalist id="exp-payees">
                        {payees.map((p) => (
                          <option key={p} value={p} />
                        ))}
                      </datalist>
                    </div>
                  </div>
                </Step>

                <Step n={3} title="What it's for" hint={form.category.trim() && forChoices.length > 1 ? `what ${form.category.toLowerCase()} can be charged to` : undefined}>
                  {!form.category.trim() ? (
                    <p className="text-xs text-muted-foreground">Choose what it was first; the options depend on it.</p>
                  ) : (
                    <div className="space-y-2.5">
                      {forChoices.length > 1 ? (
                        <SegmentedControl aria-label="What it's for" value={forNow} onChange={chooseFor} options={forChoices.map((k) => ({ value: k, label: FOR_LABEL[k] }))} />
                      ) : (
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Building2 className="size-3.5" /> Company overhead: {form.category.toLowerCase()} isn&apos;t charged to a trip, truck or driver.
                        </p>
                      )}
                      {forNow === 'trip' && (
                        <div className="max-w-md space-y-1">
                          <TripPicker
                            value={chosenTrip ?? (form.trip_id && tripLookup.isLoading ? { id: form.trip_id, ref_id: 'Loading…', is_third_party: false, vehicleId: null, driverId: null, plate: null, driver: null, customer: null, day: null } : null)}
                            onChange={(t) => {
                              setTrip(t);
                              setForm((f) => ({ ...f, trip_id: t?.id ?? '', vehicle_id: '', driver_id: '' }));
                              setDirty(true);
                            }}
                          />
                          {chosenTrip && (
                            <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                              <span className="flex items-center gap-1"><Truck className="size-3" /> {chosenTrip.plate ?? 'No truck'}</span>
                              <span className="flex items-center gap-1"><User className="size-3" /> {chosenTrip.driver ?? 'No driver'}</span>
                              <span>from the trip</span>
                            </p>
                          )}
                        </div>
                      )}
                      {forNow === 'vehicle' && (
                        <div className="grid max-w-xl gap-3 sm:grid-cols-2">
                          <div className="space-y-1">
                            <Label className={label}>Truck{vehicleRequired && <span className={TONE_CLASSES.negative.fg}> *</span>}</Label>
                            {truckSelect}
                          </div>
                          {links.driver && (
                            <div className="space-y-1">
                              <Label className={label}>Driver (optional)</Label>
                              {driverSelect('No driver')}
                            </div>
                          )}
                        </div>
                      )}
                      {forNow === 'driver' && <div className="max-w-xs">{driverSelect('Choose a driver…')}</div>}
                    </div>
                  )}
                </Step>

                <Step n={4} title="Payment">
                  <div className="space-y-2.5">
                    <SegmentedControl
                      aria-label="Payment status"
                      value={paid ? 'Paid' : 'Pending'}
                      onChange={(v) => set('status', v as ExpenseForm['status'])}
                      options={[
                        { value: 'Paid', label: 'Paid already' },
                        { value: 'Pending', label: 'To pay later' },
                      ]}
                    />
                    {paid ? (
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="space-y-1">
                          <Label className={label}>Method</Label>
                          {methodSelect}
                        </div>
                        <div className="space-y-1">
                          <Label className={label}>Paid from</Label>
                          <Select value={form.payment_account_id || NONE} onValueChange={(v) => v && set('payment_account_id', v === NONE ? '' : v)}>
                            <SelectTrigger className="h-9 text-sm" aria-label="Paid from">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NONE} className="text-xs text-muted-foreground">{payFrom.length ? 'Not set' : 'No bank or cash accounts yet'}</SelectItem>
                              {payFrom.map((a) => (
                                <SelectItem key={a.accountId} value={a.accountId} className="text-xs">
                                  {a.name}
                                  <span className="text-muted-foreground"> · {a.is_cash ? 'cash' : 'bank'}</span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="exp-billpaid" className={label}>Paid on</Label>
                          <Input id="exp-billpaid" type="date" value={form.bill_paid_date} onChange={(e) => set('bill_paid_date', e.target.value)} className="h-9 text-sm" title="Leave empty when it was paid on the expense date" />
                        </div>
                      </div>
                    ) : (
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="space-y-1">
                          <Label htmlFor="exp-billed" className={label}>Bill date</Label>
                          <Input id="exp-billed" type="date" value={form.bill_issued_date} onChange={(e) => set('bill_issued_date', e.target.value)} className="h-9 text-sm" />
                        </div>
                        <div className="space-y-1">
                          <Label className={label}>Will pay by</Label>
                          {methodSelect}
                        </div>
                      </div>
                    )}
                    {(showBillDateField || showNoteField) && (
                      <div className="grid gap-3 sm:grid-cols-3">
                        {showBillDateField && (
                          <div className="space-y-1">
                            <Label htmlFor="exp-billed" className={label}>Supplier bill date</Label>
                            <Input id="exp-billed" type="date" value={form.bill_issued_date} onChange={(e) => set('bill_issued_date', e.target.value)} className="h-9 text-sm" />
                          </div>
                        )}
                        {showNoteField && (
                          <div className={cn('space-y-1 sm:col-span-2', !showBillDateField && 'sm:col-span-3')}>
                            <Label htmlFor="exp-notes" className={label}>Note</Label>
                            <Textarea id="exp-notes" autoFocus={showNote && !form.description} rows={1} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="What it was for, invoice number…" className="min-h-9 resize-none text-sm" />
                          </div>
                        )}
                      </div>
                    )}
                    {((paid && !showBillDateField) || !showNoteField) && (
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                        {paid && !showBillDateField && (
                          <button type="button" onClick={() => setShowBillDate(true)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                            <Plus className="size-3" /> Supplier bill date
                          </button>
                        )}
                        {!showNoteField && (
                          <button type="button" onClick={() => setShowNote(true)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                            <Plus className="size-3" /> Note
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </Step>

                {error && (
                  <div className="px-4 py-3">
                    <p className={cn('flex items-start gap-1.5 rounded-md border p-2 text-xs', TONE_CLASSES.negative.bg, TONE_CLASSES.negative.fg, TONE_CLASSES.negative.border)}>
                      <AlertCircle className="mt-px size-3.5 shrink-0" /> {error}
                    </p>
                  </div>
                )}
              </form>
            </Card>

            {/* Live summary: what will be saved */}
            <Card className="gap-0 divide-y divide-border/60 overflow-hidden rounded-xl py-0 text-xs shadow-xs lg:sticky lg:top-4">
              <div className="space-y-1.5 p-4">
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
                <p className="fin-num text-xl font-semibold leading-tight text-foreground">
                  <span className="mr-1 text-xs font-medium text-muted-foreground">SAR</span>
                  {formatMoney(amount > 0 ? amount : 0)}
                </p>
                {form.payee.trim() && <p className="truncate text-muted-foreground">to {form.payee.trim()}</p>}
                <p className="flex items-center gap-1.5 text-muted-foreground" title="Where this cost counts">
                  <WhereIcon className="size-3.5 shrink-0" /> {where}
                </p>
              </div>
              {ledgerSetup.data && (
                <div className="space-y-1 p-4">
                  <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <BookOpenCheck className="size-3.5" /> Ledger
                  </p>
                  {!ledgerSetup.data.enabled ? (
                    <p className="text-muted-foreground">Posting is off</p>
                  ) : paid && !form.payment_account_id ? (
                    <p className={TONE_CLASSES.warning.fg}>Choose Paid from to post it</p>
                  ) : (
                    <>
                      <p className="text-foreground">Dr {form.category || 'expense'}</p>
                      <p className="text-foreground">Cr {paid ? payFromName ?? 'the chosen account' : 'payables, until paid'}</p>
                    </>
                  )}
                </div>
              )}
              <div className="space-y-1.5 p-4">
                {form.category === 'Salary Advance' && (
                  <p className={cn('flex items-start gap-1.5', TONE_CLASSES.warning.fg)}>
                    <AlertTriangle className="mt-px size-3.5 shrink-0" />
                    <span>
                      New salary advances go in{' '}
                      <Link to={`/finance/advances/new?type=employee${driverId ? `&party_id=${driverId}` : ''}`} className="font-medium underline underline-offset-2">
                        Advances
                      </Link>
                      ; this older record can still be edited here.
                    </span>
                  </p>
                )}
                {problems.length === 0 && duplicates.length === 0 && (
                  <p className={cn('flex items-center gap-1.5 font-medium', TONE_CLASSES.positive.fg)}>
                    <CheckCircle2 className="size-3.5" /> Ready to save
                  </p>
                )}
                {problems.length > 0 && !tried && <p className="text-[11px] text-muted-foreground">Still needed</p>}
                {problems.map((p) => (
                  <p key={p} className={cn('flex items-start gap-1.5', tried ? TONE_CLASSES.negative.fg : 'text-muted-foreground')}>
                    {tried ? <AlertCircle className="mt-px size-3.5 shrink-0" /> : <Circle className="mt-px size-3.5 shrink-0" />} {p}
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

/** One numbered step of the form. */
function Step({ n, title, hint, children }: { n: number; title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-2.5 px-4 py-3.5">
      <h3 className="flex items-center gap-2 text-xs font-semibold text-foreground">
        <span className="flex size-4 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">{n}</span>
        {title}
        {hint && <span className="text-[11px] font-normal text-muted-foreground">· {hint}</span>}
      </h3>
      {children}
    </section>
  );
}
