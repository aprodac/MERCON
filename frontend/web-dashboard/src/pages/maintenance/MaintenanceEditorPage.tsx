import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, AlertTriangle, CalendarClock, CheckCircle2, Circle, Loader2, Plus, Truck, Wrench, X } from 'lucide-react';
import { toast } from 'sonner';

import DashboardLayout from '@/components/layout/DashboardLayout';
import WorkshopField from '@/components/fleet/WorkshopField';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SegmentedControl } from '@/components/finance/kit/SegmentedControl';
import { TONE_CLASSES } from '@/components/finance/kit/tones';
import { maintenanceService, type MaintenanceItemKind, type MaintenanceStatus, type MaintenanceType } from '@/services/maintenanceService';
import { vehicleService } from '@/services/vehicleService';
import { financeService } from '@/services/financeService';
import { payFromOptions } from '@/lib/expenses/expenseForm';
import { todayIso } from '@/lib/expenses/expenseMeta';
import { formatDate, formatMoney } from '@/lib/finance/format';
import { DUE_LABEL, DUE_TONE, TYPE_TONE, dueWording } from '@/lib/maintenance/hub';
import { VAT_RATE, draftFrom, draftTotals, lineAmount, newLine, orderProblems, type LineDraft, type OrderDraft } from '@/lib/maintenance/orderForm';
import { cn } from '@/lib/utils';

const TYPES: MaintenanceType[] = ['Routine', 'Repair', 'Inspection', 'Renewal', 'Emergency'];
const SYSTEMS: { value: string; label: string }[] = [
  { value: 'engine', label: 'Engine' },
  { value: 'brakes', label: 'Brakes' },
  { value: 'tires', label: 'Tyres' },
  { value: 'air_system', label: 'Air system' },
  { value: 'axles', label: 'Axles' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'others', label: 'Other' },
];
const KIND_LABEL: Record<MaintenanceItemKind, string> = { part: 'Part', labour: 'Labour', other: 'Other' };
const label = 'text-[11px] font-medium text-muted-foreground';

const blankDraft = (): OrderDraft => ({
  vehicle_id: '',
  odometer: '',
  maintenance_type: 'Routine',
  system: 'engine',
  workshop_name: '',
  workshop_contact: '',
  status: 'In_Progress',
  start_date: todayIso(),
  expected_end_date: '',
  end_date: '',
  lines: [],
  vat_on: false,
  vat_amount: '',
  vat_auto: true,
  payment_status: 'Paid',
  payment_account_id: '',
  invoice_number: '',
  notes: '',
});

function Step({ n, title, hint, children }: { n: number; title: string; hint?: ReactNode; children: ReactNode }) {
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

/**
 * New / edit service order in four steps: the truck (and what's due on it), what's being done,
 * where and when, and the cost lines with VAT and payment. /maintenance/new?vehicle=&plan=&log=1
 * · /maintenance/:id/edit
 */
export default function MaintenanceEditorPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { id: editId } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const editing = Boolean(editId);

  const [d, setD] = useState<OrderDraft>(blankDraft);
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof OrderDraft>(k: K, v: OrderDraft[K]) => setD((x) => ({ ...x, [k]: v }));

  const source = useQuery({ queryKey: ['maintenance', 'detail', editId], queryFn: () => maintenanceService.getById(editId!), enabled: editing });
  const loaded = useRef(false);
  useEffect(() => {
    if (!source.data || loaded.current) return;
    loaded.current = true;
    setD((x) => ({ ...x, ...draftFrom(source.data) }));
  }, [source.data]);

  const { data: vehiclesRes } = useQuery({ queryKey: ['vehicles', 'lookup'], queryFn: () => vehicleService.getAll({ per_page: 500, mode: 'lookup' } as any) });
  const vehicles = (vehiclesRes?.data ?? []) as { id: string; plate_number: string; asset_type?: string; current_odometer?: number; status?: string }[];
  const vehicle = vehicles.find((v) => v.id === d.vehicle_id);
  const due = useQuery({ queryKey: ['maintenance', 'due', d.vehicle_id], queryFn: () => maintenanceService.getDue(d.vehicle_id), enabled: Boolean(d.vehicle_id) });
  const { data: bankRes } = useQuery({ queryKey: ['bank-accounts'], queryFn: () => financeService.getBankAccounts() });
  const payFrom = useMemo(() => payFromOptions((bankRes?.data ?? []) as any[]), [bankRes]);

  // From the Due tab: /maintenance/new?vehicle=…&plan=…(&log=1 to log a past service)
  const prefilled = useRef(false);
  useEffect(() => {
    if (editing || prefilled.current || !vehicles.length) return;
    const v = params.get('vehicle') || params.get('vehicle_id');
    if (!v) return;
    prefilled.current = true;
    const veh = vehicles.find((x) => x.id === v);
    setD((x) => ({ ...x, vehicle_id: v, odometer: veh?.current_odometer ? String(Math.round(veh.current_odometer)) : x.odometer, ...(params.get('log') ? { status: 'Completed' as MaintenanceStatus } : {}) }));
  }, [editing, params, vehicles]);
  useEffect(() => {
    const planId = params.get('plan');
    if (editing || !planId || !due.data) return;
    const row = due.data.find((r) => r.planId === planId);
    if (row && !d.lines.some((l) => l.planId === planId)) addPlanned(row.planId, row.task);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [due.data]);

  // Paid-from default: first cash / bank account
  useEffect(() => {
    if (!d.payment_account_id && payFrom.length) set('payment_account_id', payFrom[0].accountId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payFrom]);

  const chooseVehicle = (id: string) => {
    const veh = vehicles.find((x) => x.id === id);
    setD((x) => ({ ...x, vehicle_id: id, odometer: veh?.current_odometer ? String(Math.round(veh.current_odometer)) : '', lines: x.lines.filter((l) => !l.planId) }));
  };
  function addPlanned(planId: string, task: string) {
    setD((x) => ({ ...x, lines: [...x.lines, newLine('other', { description: task, unit_price: '0', planId, planTask: task })] }));
  }
  const addLine = (kind: MaintenanceItemKind) => setD((x) => ({ ...x, lines: [...x.lines, newLine(kind, kind === 'labour' ? { description: 'Labour' } : {})] }));
  const changeLine = (key: string, patch: Partial<LineDraft>) => setD((x) => ({ ...x, lines: x.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) }));
  const removeLine = (key: string) => setD((x) => ({ ...x, lines: x.lines.filter((l) => l.key !== key) }));

  const t = draftTotals(d);
  const problems = orderProblems(d, todayIso());
  const done = d.status === 'Completed';
  const dueHere = (due.data ?? []).filter((r) => r.status !== 'ok');
  const planIdsOnOrder = new Set(d.lines.map((l) => l.planId).filter(Boolean));
  const daysOut = d.start_date ? Math.max(1, Math.ceil(((done && d.end_date ? new Date(d.end_date) : d.expected_end_date ? new Date(d.expected_end_date) : new Date(d.start_date)).getTime() - new Date(d.start_date).getTime()) / 86_400_000)) : null;

  const save = async () => {
    if (saving) return;
    if (problems.length) {
      setTried(true);
      return;
    }
    setSaving(true);
    const payload = {
      vehicle_id: d.vehicle_id,
      workshop_name: d.workshop_name.trim(),
      workshop_contact: d.workshop_contact.trim() || undefined,
      maintenance_type: d.maintenance_type,
      system: d.system,
      status: d.status,
      start_date: d.start_date || undefined,
      service_date: d.start_date || undefined,
      end_date: done ? d.end_date || d.start_date : undefined,
      expected_end_date: !done ? d.expected_end_date || null : null,
      odometer_reading: Number(d.odometer) || 0,
      items: d.lines.map((l) => ({ kind: l.kind, description: l.description.trim(), quantity: Number(l.quantity) || 0, unit_price: Number(l.unit_price) || 0, service_plan_id: l.planId })),
      vat_amount: t.vat,
      payment_status: d.payment_status,
      payment_account_id: done && d.payment_status === 'Paid' ? d.payment_account_id || null : null,
      invoice_number: d.invoice_number.trim() || undefined,
      work_done: d.notes.trim() || undefined,
    };
    try {
      const saved = editing ? await maintenanceService.update(editId!, payload) : await maintenanceService.create(payload);
      ['maintenance', 'vehicles', 'expenses', 'fleet-performance'].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
      toast.success(`${saved.ref_id ?? 'Service order'} ${editing ? 'saved' : 'created'}`);
      navigate(`/maintenance?view=${saved.id}${done ? '&tab=history' : d.status === 'Scheduled' ? '&tab=scheduled' : ''}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'The service order could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const title = editing ? `Edit ${source.data?.ref_id ?? 'service order'}` : 'New service order';
  return (
    <DashboardLayout active="Vehicles" title={title}>
      <div className="mx-auto w-full max-w-[1200px] space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2 border-b pb-2.5">
          <Chip tone={editing ? 'info' : 'neutral'} size="sm">{editing ? 'Editing' : 'New'}</Chip>
          <span className="text-sm font-medium text-foreground">{title}</span>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => navigate(-1)} disabled={saving}>Cancel</Button>
            <Button size="sm" className="h-8 gap-1.5 rounded-full bg-brand px-4 text-xs text-white hover:bg-brand-hover" onClick={save} disabled={saving}>
              {saving && <Loader2 className="size-3.5 animate-spin" />} {editing ? 'Save changes' : 'Save service order'}
            </Button>
          </div>
        </div>

        {editing && source.isLoading ? (
          <Card className="space-y-3 rounded-xl p-6">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-9 w-full" />)}</Card>
        ) : (
          <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_290px]">
            <Card className="gap-0 divide-y divide-border/60 rounded-xl py-0 shadow-xs">
              <Step n={1} title="Truck">
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                  <div className="space-y-1">
                    <Label className={label}>Truck</Label>
                    <Select value={d.vehicle_id || undefined} onValueChange={(v) => v && chooseVehicle(v)}>
                      <SelectTrigger className={cn('h-10 text-sm', tried && !d.vehicle_id && 'border-chip-negative-border')} aria-label="Truck">
                        <SelectValue placeholder="Choose a truck…" />
                      </SelectTrigger>
                      <SelectContent>
                        {vehicles.map((v) => (
                          <SelectItem key={v.id} value={v.id} className="text-xs">
                            {v.plate_number}
                            <span className="text-muted-foreground"> · {v.asset_type}{v.current_odometer ? ` · ${Math.round(v.current_odometer).toLocaleString('en-US')} km` : ''}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="mnt-odo" className={label}>Odometer at the service (km)</Label>
                    <Input id="mnt-odo" type="number" inputMode="numeric" min="0" value={d.odometer} onChange={(e) => set('odometer', e.target.value)} placeholder="212400" className="fin-num h-10 text-right text-sm" />
                  </div>
                </div>
                {d.vehicle_id && dueHere.length > 0 && (
                  <div className="space-y-1 rounded-lg border bg-muted/30 p-2.5">
                    <p className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground"><CalendarClock className="size-3.5" /> Due on this truck</p>
                    {dueHere.map((r) => (
                      <div key={r.planId} className="flex flex-wrap items-center gap-2 text-xs">
                        <Chip tone={DUE_TONE[r.status]} size="sm">{DUE_LABEL[r.status]}</Chip>
                        <span className="font-medium text-foreground">{r.task}</span>
                        <span className={cn('text-[11px]', r.status === 'overdue' ? TONE_CLASSES.negative.fg : 'text-muted-foreground')}>{dueWording(r)}</span>
                        {planIdsOnOrder.has(r.planId) ? (
                          <span className={cn('ml-auto flex items-center gap-1 text-[11px]', TONE_CLASSES.positive.fg)}><CheckCircle2 className="size-3" /> On this order</span>
                        ) : (
                          <button type="button" onClick={() => addPlanned(r.planId, r.task)} className="ml-auto flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium text-foreground hover:bg-muted">
                            <Plus className="size-3" /> Add to this order
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Step>

              <Step n={2} title="What">
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Type">
                  {TYPES.map((ty) => (
                    <button
                      key={ty}
                      type="button"
                      role="radio"
                      aria-checked={d.maintenance_type === ty}
                      onClick={() => set('maintenance_type', ty)}
                      className={cn(
                        'h-8 rounded-full border px-3 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        d.maintenance_type === ty ? cn(TONE_CLASSES[TYPE_TONE[ty]].bg, TONE_CLASSES[TYPE_TONE[ty]].fg, TONE_CLASSES[TYPE_TONE[ty]].border) : 'border-border text-foreground hover:bg-muted/60',
                      )}
                    >
                      {ty}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="System">
                  {SYSTEMS.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      role="radio"
                      aria-checked={d.system === s.value}
                      onClick={() => set('system', s.value)}
                      className={cn('rounded-md px-2 py-1 text-[11px] outline-none focus-visible:ring-2 focus-visible:ring-ring', d.system === s.value ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:text-foreground')}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </Step>

              <Step n={3} title="Where and when">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className={label}>Workshop</Label>
                    <WorkshopField
                      value={d.workshop_name}
                      onChange={(name) => set('workshop_name', name)}
                      onPick={(w) => setD((x) => ({ ...x, workshop_name: w.name, workshop_contact: w.contact ?? x.workshop_contact }))}
                      className={cn(tried && !d.workshop_name.trim() && 'rounded-md ring-1 ring-destructive')}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="mnt-contact" className={label}>Contact</Label>
                    <Input id="mnt-contact" value={d.workshop_contact} onChange={(e) => set('workshop_contact', e.target.value)} placeholder="Phone" className="h-9 text-sm" />
                  </div>
                </div>
                <SegmentedControl
                  aria-label="Status"
                  value={d.status === 'Cancelled' ? 'Completed' : d.status}
                  onChange={(v) => set('status', v as MaintenanceStatus)}
                  options={[
                    { value: 'Scheduled', label: 'Booked' },
                    { value: 'In_Progress', label: 'In the workshop' },
                    { value: 'Completed', label: 'Done' },
                  ]}
                />
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label htmlFor="mnt-in" className={label}>{d.status === 'Scheduled' ? 'Booked for' : 'In'}</Label>
                    <Input id="mnt-in" type="date" value={d.start_date} onChange={(e) => set('start_date', e.target.value)} className="h-9 text-sm" />
                  </div>
                  {done ? (
                    <div className="space-y-1">
                      <Label htmlFor="mnt-out" className={label}>Out</Label>
                      <Input id="mnt-out" type="date" value={d.end_date} onChange={(e) => set('end_date', e.target.value)} className="h-9 text-sm" />
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <Label htmlFor="mnt-back" className={label}>Back by</Label>
                      <Input id="mnt-back" type="date" value={d.expected_end_date} onChange={(e) => set('expected_end_date', e.target.value)} className="h-9 text-sm" />
                    </div>
                  )}
                  {d.status === 'In_Progress' && <p className="self-end pb-2 text-[11px] text-muted-foreground">The truck shows as in maintenance until this order is done.</p>}
                </div>
              </Step>

              <Step n={4} title="Cost" hint="before VAT">
                {d.lines.length > 0 && (
                  <div className="overflow-hidden rounded-lg border">
                    {d.lines.map((l) => (
                      <div key={l.key} className="grid grid-cols-[5.5rem_minmax(0,1fr)_4.5rem_6rem_5.5rem_auto] items-center gap-2 border-b border-border/60 px-2 py-1.5 last:border-0">
                        <Select value={l.kind} onValueChange={(v) => v && changeLine(l.key, { kind: v as MaintenanceItemKind })}>
                          <SelectTrigger className="h-8 text-[11px]" aria-label="Kind"><SelectValue /></SelectTrigger>
                          <SelectContent>{(['part', 'labour', 'other'] as MaintenanceItemKind[]).map((k) => <SelectItem key={k} value={k} className="text-xs">{KIND_LABEL[k]}</SelectItem>)}</SelectContent>
                        </Select>
                        <div className="min-w-0">
                          <Input value={l.description} onChange={(e) => changeLine(l.key, { description: e.target.value })} placeholder={l.kind === 'part' ? 'Brake pads' : 'What'} aria-label="Description" className="h-8 text-xs" />
                          {l.planTask && <span className={cn('text-[10px]', TONE_CLASSES.info.fg)}>Resets “{l.planTask}” when done</span>}
                        </div>
                        <Input type="number" min="0" step="1" value={l.quantity} onChange={(e) => changeLine(l.key, { quantity: e.target.value })} aria-label="Quantity" className="fin-num h-8 text-right text-xs" />
                        <Input type="number" min="0" step="0.01" value={l.unit_price} onChange={(e) => changeLine(l.key, { unit_price: e.target.value })} placeholder="0.00" aria-label="Unit price" className="fin-num h-8 text-right text-xs" />
                        <span className="fin-num text-right text-xs font-medium">{formatMoney(lineAmount(l))}</span>
                        <button type="button" onClick={() => removeLine(l.key)} className="text-muted-foreground hover:text-foreground" aria-label="Remove line"><X className="size-3.5" /></button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {(['part', 'labour', 'other'] as MaintenanceItemKind[]).map((k) => (
                    <button key={k} type="button" onClick={() => addLine(k)} className="flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-muted">
                      <Plus className="size-3" /> {KIND_LABEL[k]}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
                    <Checkbox checked={d.vat_on} onCheckedChange={(c) => setD((x) => ({ ...x, vat_on: Boolean(c), vat_auto: true, vat_amount: '' }))} aria-label="Tax invoice with VAT" />
                    Tax invoice with VAT
                  </label>
                  {d.vat_on && (
                    <>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={d.vat_auto ? String(t.vat) : d.vat_amount}
                        onChange={(e) => setD((x) => ({ ...x, vat_auto: false, vat_amount: e.target.value }))}
                        aria-label="VAT amount"
                        className="fin-num h-8 w-28 text-right text-xs"
                      />
                      {!d.vat_auto && <button type="button" onClick={() => set('vat_auto', true)} className="text-[11px] text-muted-foreground hover:text-foreground">Use {VAT_RATE}%</button>}
                    </>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label className={label}>Workshop paid?</Label>
                    <SegmentedControl aria-label="Payment" value={d.payment_status} onChange={(v) => set('payment_status', v)} options={[{ value: 'Paid', label: 'Paid' }, { value: 'Pending', label: 'To pay' }]} />
                  </div>
                  {d.payment_status === 'Paid' && (
                    <div className="space-y-1">
                      <Label className={label}>Paid from</Label>
                      <Select value={d.payment_account_id || undefined} onValueChange={(v) => v && set('payment_account_id', v)}>
                        <SelectTrigger className="h-9 text-xs" aria-label="Paid from"><SelectValue placeholder="Bank or cash…" /></SelectTrigger>
                        <SelectContent>
                          {payFrom.map((p) => <SelectItem key={p.accountId} value={p.accountId} className="text-xs">{p.name} <span className="text-muted-foreground">· {p.is_cash ? 'cash' : 'bank'}</span></SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="space-y-1">
                    <Label htmlFor="mnt-inv" className={label}>Workshop invoice no.</Label>
                    <Input id="mnt-inv" value={d.invoice_number} onChange={(e) => set('invoice_number', e.target.value)} placeholder="Optional" className="h-9 text-sm" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="mnt-notes" className={label}>Notes</Label>
                  <Textarea id="mnt-notes" rows={2} value={d.notes} onChange={(e) => set('notes', e.target.value)} placeholder="What was found, what was done…" className="resize-none text-sm" />
                </div>
              </Step>
            </Card>

            {/* Live summary */}
            <Card className="gap-0 divide-y divide-border/60 overflow-hidden rounded-xl py-0 text-xs shadow-xs lg:sticky lg:top-4">
              <div className="space-y-1.5 p-4">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Chip tone={TYPE_TONE[d.maintenance_type]} size="sm">{d.maintenance_type}</Chip>
                  <Chip tone={d.status === 'In_Progress' ? 'warning' : d.status === 'Scheduled' ? 'info' : 'positive'} size="sm">
                    {d.status === 'In_Progress' ? 'In workshop' : d.status === 'Scheduled' ? 'Booked' : 'Done'}
                  </Chip>
                </div>
                <p className="fin-num text-xl font-semibold leading-tight">
                  <span className="mr-1 text-xs font-medium text-muted-foreground">SAR</span>
                  {formatMoney(t.total)}
                </p>
                <p className="fin-num text-muted-foreground">
                  {[t.parts > 0 && `Parts ${formatMoney(t.parts)}`, t.labour > 0 && `Labour ${formatMoney(t.labour)}`, t.other > 0 && `Other ${formatMoney(t.other)}`, t.vat > 0 && `VAT ${formatMoney(t.vat)}`].filter(Boolean).join(' · ') || 'No cost yet'}
                </p>
                <p className="flex items-center gap-1.5 text-muted-foreground">
                  <Truck className="size-3.5" /> {vehicle ? `${vehicle.plate_number} · ${vehicle.asset_type}` : 'No truck yet'}
                </p>
                {daysOut && d.status !== 'Scheduled' && (
                  <p className="flex items-center gap-1.5 text-muted-foreground">
                    <Wrench className="size-3.5" /> {done ? `Off the road ${daysOut} ${daysOut === 1 ? 'day' : 'days'}` : d.expected_end_date ? `Out about ${daysOut} ${daysOut === 1 ? 'day' : 'days'}, back ${formatDate(d.expected_end_date)}` : 'Off the road from today'}
                  </p>
                )}
              </div>
              {d.lines.some((l) => l.planId) && (
                <div className="space-y-1 p-4">
                  <p className="text-[11px] text-muted-foreground">Planned services on this order</p>
                  {d.lines.filter((l) => l.planTask).map((l) => (
                    <p key={l.key} className="flex items-center gap-1.5 text-foreground">
                      <CheckCircle2 className={cn('size-3.5', done ? TONE_CLASSES.positive.fg : 'text-muted-foreground')} /> {l.planTask}
                      <span className="text-muted-foreground">{done ? '· resets its due date' : '· resets when done'}</span>
                    </p>
                  ))}
                </div>
              )}
              <div className="space-y-1.5 p-4">
                {d.payment_status === 'Pending' || !done ? (
                  <p className={cn('flex items-start gap-1.5', TONE_CLASSES.warning.fg)}><AlertTriangle className="mt-px size-3.5 shrink-0" /> {done ? 'Owed to the workshop (payables) until paid.' : 'Counts as owed to the workshop until the order is done.'}</p>
                ) : (
                  <p className="text-muted-foreground">Posts to the books as a Maintenance expense{t.vat > 0 ? ', VAT to VAT input' : ''}.</p>
                )}
                {problems.length === 0 ? (
                  <p className={cn('flex items-center gap-1.5 font-medium', TONE_CLASSES.positive.fg)}><CheckCircle2 className="size-3.5" /> Ready to save</p>
                ) : (
                  <>
                    {!tried && <p className="text-[11px] text-muted-foreground">Still needed</p>}
                    {problems.map((p) => (
                      <p key={p} className={cn('flex items-start gap-1.5', tried ? TONE_CLASSES.negative.fg : 'text-muted-foreground')}>
                        {tried ? <AlertCircle className="mt-px size-3.5 shrink-0" /> : <Circle className="mt-px size-3.5 shrink-0" />} {p}
                      </p>
                    ))}
                  </>
                )}
              </div>
            </Card>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
