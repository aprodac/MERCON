import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Pencil, Plus, Trash2, Truck } from 'lucide-react';
import { toast } from 'sonner';

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { vehicleService, type CostFrequency, type CostSetupVehicle, type VehicleFixedCostPayload } from '@/services/vehicleService';
import { extractApiErrorMessage } from '@/lib/api';
import { formatDate } from '@/lib/finance/format';
import { sar0 } from '@/lib/vehiclePnl';
import { useCostInvalidation } from './useCostInvalidation';

/** Suggested recurring costs of owning a truck in KSA; free text is allowed too. */
const FIXED_COST_CATEGORIES = ['Insurance', 'Istimara', 'Operating card', 'Tracking / GPS', 'Parking permit', 'Other'];
const DEFAULT_LIFE_YEARS = 5;

const numOrNull = (s: string) => (s.trim() === '' ? null : Number(s));
const firstOfMonth = (today: string) => `${today.slice(0, 7)}-01`;

function monthsBetween(from: string, to: string) {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

function OwnershipForm({ vehicle, today }: { vehicle: CostSetupVehicle; today: string }) {
  const invalidate = useCostInvalidation();
  const [price, setPrice] = useState('');
  const [date, setDate] = useState('');
  const [life, setLife] = useState('');
  const [resale, setResale] = useState('');

  useEffect(() => {
    setPrice(vehicle.purchase_price?.toString() ?? '');
    setDate(vehicle.purchase_date ?? '');
    setLife(vehicle.useful_life_years?.toString() ?? String(DEFAULT_LIFE_YEARS));
    setResale(vehicle.residual_value?.toString() ?? '');
    // Only when a different truck opens — a background refetch mustn't wipe the form
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicle.id]);

  const p = numOrNull(price);
  const l = numOrNull(life) ?? DEFAULT_LIFE_YEARS;
  const r = numOrNull(resale) ?? 0;
  const monthly = p && p > 0 && l > 0 ? Math.max(0, p - r) / (l * 12) : null;
  const endYear = date ? Number(date.slice(0, 4)) + l : null;
  const doneAlready = date && endYear !== null && monthsBetween(date, today) >= l * 12;
  const error = p !== null && p < 0 ? 'Price can’t be negative.' : r > (p ?? 0) && p ? 'Resale value is more than the price.' : p && !date ? 'Add the purchase date.' : l < 1 || l > 40 ? 'Useful life is 1 to 40 years.' : null;

  const save = useMutation({
    mutationFn: () =>
      vehicleService.updateOwnership(vehicle.id, {
        purchase_price: p,
        purchase_date: date || null,
        useful_life_years: p ? l : numOrNull(life),
        residual_value: numOrNull(resale),
      }),
    onSuccess: () => {
      toast.success('Ownership costs saved');
      invalidate();
    },
    onError: (e) => toast.error(extractApiErrorMessage(e)),
  });

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">Depreciation</h3>
        <p className="text-xs text-muted-foreground">The truck is owned, so its cost is the price less resale value, spread evenly over its useful life.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="own-price" className="text-xs">Purchase price (SAR)</Label>
          <Input id="own-price" type="number" min={0} step="1" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="360000" className="h-8 text-xs" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="own-date" className="text-xs">Purchase date</Label>
          <Input id="own-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8 text-xs" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="own-life" className="text-xs">Useful life (years)</Label>
          <Input id="own-life" type="number" min={1} max={40} step="1" value={life} onChange={(e) => setLife(e.target.value)} className="h-8 text-xs" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="own-resale" className="text-xs">Resale value at the end (SAR)</Label>
          <Input id="own-resale" type="number" min={0} step="1" value={resale} onChange={(e) => setResale(e.target.value)} placeholder="60000" className="h-8 text-xs" />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-xs">
        {error ? (
          <span className="text-chip-negative-fg">{error}</span>
        ) : monthly !== null ? (
          <span>
            <span className="fin-num font-semibold">{sar0(monthly)}</span> per month
            {endYear && <span className="text-muted-foreground"> until {formatDate(`${endYear}${date.slice(4)}`)}</span>}
            {doneAlready && <span className="text-muted-foreground"> — fully depreciated, so nothing is charged now</span>}
          </span>
        ) : (
          <span className="text-muted-foreground">No purchase price — no depreciation is charged.</span>
        )}
        <Button size="sm" className="h-7 text-xs" disabled={Boolean(error) || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </section>
  );
}

const emptyDraft = (today: string): VehicleFixedCostPayload => ({ category: 'Insurance', label: '', amount: 0, frequency: 'Yearly', start_date: firstOfMonth(today), end_date: null, notes: null });

function FixedCosts({ vehicle, today }: { vehicle: CostSetupVehicle; today: string }) {
  const invalidate = useCostInvalidation();
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [draft, setDraft] = useState<VehicleFixedCostPayload>(emptyDraft(today));
  const [amount, setAmount] = useState('');

  useEffect(() => setEditing(null), [vehicle.id]);

  const open = (id: string | 'new') => {
    const c = id === 'new' ? null : vehicle.fixed_costs.find((x) => x.id === id);
    const next = c ? { category: c.category, label: c.label ?? '', amount: c.amount, frequency: c.frequency, start_date: c.start_date, end_date: c.end_date, notes: c.notes } : emptyDraft(today);
    setDraft(next);
    setAmount(c ? String(c.amount) : '');
    setEditing(id);
  };

  const amt = Number(amount);
  const error = !draft.category.trim() ? 'Pick a category.' : !(amt > 0) ? 'Enter the amount.' : draft.end_date && draft.end_date < draft.start_date ? 'End date is before the start date.' : null;

  const save = useMutation({
    mutationFn: () => {
      const payload = { ...draft, amount: amt, label: draft.label?.trim() || null, end_date: draft.end_date || null };
      return editing === 'new' ? vehicleService.addFixedCost(vehicle.id, payload) : vehicleService.updateFixedCost(vehicle.id, editing!, payload);
    },
    onSuccess: () => {
      toast.success(editing === 'new' ? 'Cost added' : 'Cost updated');
      setEditing(null);
      invalidate();
    },
    onError: (e) => toast.error(extractApiErrorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => vehicleService.deleteFixedCost(vehicle.id, id),
    onSuccess: () => {
      toast.success('Cost removed');
      invalidate();
    },
    onError: (e) => toast.error(extractApiErrorMessage(e)),
  });

  const form = (
    <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Category</Label>
          <Select value={FIXED_COST_CATEGORIES.includes(draft.category) ? draft.category : 'Other'} onValueChange={(v) => setDraft((d) => ({ ...d, category: v }))}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {FIXED_COST_CATEGORIES.map((c) => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="fc-label" className="text-xs">Name (optional)</Label>
          <Input id="fc-label" value={draft.label ?? ''} onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))} placeholder="Tawuniya comprehensive" className="h-8 text-xs" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="fc-amount" className="text-xs">Amount (SAR)</Label>
          <Input id="fc-amount" type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-8 text-xs" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Paid</Label>
          <Select value={draft.frequency} onValueChange={(v) => setDraft((d) => ({ ...d, frequency: v as CostFrequency }))}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Monthly" className="text-xs">Every month</SelectItem>
              <SelectItem value="Yearly" className="text-xs">Every year</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="fc-start" className="text-xs">From</Label>
          <Input id="fc-start" type="date" value={draft.start_date} onChange={(e) => setDraft((d) => ({ ...d, start_date: e.target.value }))} className="h-8 text-xs" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="fc-end" className="text-xs">Until (optional)</Label>
          <Input id="fc-end" type="date" value={draft.end_date ?? ''} onChange={(e) => setDraft((d) => ({ ...d, end_date: e.target.value || null }))} className="h-8 text-xs" />
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className={error ? 'text-chip-negative-fg' : 'text-muted-foreground'}>
          {error ?? (draft.frequency === 'Yearly' ? `Counts ${sar0(amt / 12)} per month.` : 'Counts in full every month.')}
        </span>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditing(null)}>Cancel</Button>
          <Button size="sm" className="h-7 text-xs" disabled={Boolean(error) || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? 'Saving…' : editing === 'new' ? 'Add cost' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <section className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Recurring costs</h3>
          <p className="text-xs text-muted-foreground">Insurance, Istimara, operating card and similar. One-off payments go in Expenses instead — don’t record the same cost in both.</p>
        </div>
        {editing === null && (
          <Button variant="outline" size="sm" className="h-7 shrink-0 gap-1 text-xs" onClick={() => open('new')}>
            <Plus className="size-3.5" /> Add cost
          </Button>
        )}
      </div>
      {editing === 'new' && form}
      {vehicle.fixed_costs.length === 0 && editing !== 'new' ? (
        <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">No recurring costs yet.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {vehicle.fixed_costs.map((c) =>
            editing === c.id ? (
              <li key={c.id} className="p-2">{form}</li>
            ) : (
              <li key={c.id} className="flex items-center gap-3 px-3 py-2 text-xs">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 font-medium">
                    {c.label || c.category}
                    {!c.active && <Chip tone="neutral" size="sm">{c.end_date && c.end_date < today ? 'Ended' : 'Not started'}</Chip>}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {c.label ? `${c.category} · ` : ''}from {formatDate(c.start_date)}
                    {c.end_date ? ` until ${formatDate(c.end_date)}` : ''}
                  </p>
                </div>
                <div className="text-right">
                  <p className="fin-num font-semibold">{sar0(c.amount)}</p>
                  <p className="text-[11px] text-muted-foreground">{c.frequency === 'Yearly' ? 'a year' : 'a month'}</p>
                </div>
                <Button variant="ghost" size="icon" className="size-7" aria-label="Edit cost" onClick={() => open(c.id)}>
                  <Pencil className="size-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-chip-negative-fg" aria-label="Remove cost" disabled={remove.isPending} onClick={() => remove.mutate(c.id)}>
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  );
}

/** Ownership and recurring costs for one truck — what Vehicle P&L charges below contribution. */
export function TruckCostSheet({ vehicle, today, onClose }: { vehicle: CostSetupVehicle | null; today: string; onClose: () => void }) {
  return (
    <Sheet open={vehicle !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-lg">
        {vehicle && (
          <>
            <SheetHeader className="border-b p-5 pr-14">
              <div className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-muted"><Truck className="size-5" /></span>
                <div className="min-w-0">
                  <SheetTitle className="truncate text-base">{vehicle.plate_number}</SheetTitle>
                  <SheetDescription>{vehicle.asset_type}{vehicle.driver ? ` · ${vehicle.driver.name}` : ''} · ownership costs</SheetDescription>
                </div>
              </div>
            </SheetHeader>
            <div className="space-y-6 p-5">
              <OwnershipForm vehicle={vehicle} today={today} />
              <FixedCosts vehicle={vehicle} today={today} />
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
