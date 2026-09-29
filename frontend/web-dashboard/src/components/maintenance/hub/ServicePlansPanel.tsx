import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { SegmentedControl } from '@/components/finance/kit/SegmentedControl';
import { maintenanceService, type ServicePlan, type ServicePlanInput } from '@/services/maintenanceService';
import { vehicleService } from '@/services/vehicleService';
import { intervalWording } from '@/lib/maintenance/hub';

const ASSET_TYPES = ['Flatbed', 'Reefer', 'Box', 'Tanker'] as const;
const label = 'text-[11px] font-medium text-muted-foreground';
/** Common starting points; editable after. */
const PRESETS: Pick<ServicePlanInput, 'task' | 'interval_km' | 'interval_days'>[] = [
  { task: 'Oil change', interval_km: 10000, interval_days: 180 },
  { task: 'Tyre rotation', interval_km: 20000, interval_days: null },
  { task: 'Brake inspection', interval_km: 30000, interval_days: 180 },
  { task: 'Annual inspection (Fahas)', interval_km: null, interval_days: 365 },
];

type Scope = 'all' | 'type' | 'truck';
const blank = (): ServicePlanInput => ({ task: '', asset_type: null, vehicle_id: null, interval_km: 10000, interval_days: 180, warn_km: 1000, warn_days: 14, notes: null, is_active: true });

function PlanSheet({ plan, onOpenChange }: { plan: ServicePlan | 'new' | null; onOpenChange: (o: boolean) => void }) {
  const open = plan !== null;
  const queryClient = useQueryClient();
  const { data: vehiclesRes } = useQuery({ queryKey: ['vehicles', 'lookup'], queryFn: () => vehicleService.getAll({ per_page: 500, mode: 'lookup' } as any), enabled: open });
  const vehicles = (vehiclesRes?.data ?? []) as { id: string; plate_number: string; asset_type?: string }[];
  const [f, setF] = useState<ServicePlanInput>(blank());
  const [scope, setScope] = useState<Scope>('all');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (plan === 'new') {
      setF(blank());
      setScope('all');
    } else if (plan) {
      const { id: _id, vehicle_plate: _p, scope: s, ...rest } = plan;
      setF(rest);
      setScope(s);
    }
  }, [open, plan]);
  const set = <K extends keyof ServicePlanInput>(k: K, v: ServicePlanInput[K]) => setF((x) => ({ ...x, [k]: v }));
  const num = (v: string) => (v.trim() === '' ? null : Math.max(0, Math.round(Number(v))) || null);

  const save = async () => {
    if (!f.task.trim()) return toast.error('Name the service.');
    if (!f.interval_km && !f.interval_days) return toast.error('Give an interval in km, in days, or both.');
    if (scope === 'type' && !f.asset_type) return toast.error('Choose the truck type.');
    if (scope === 'truck' && !f.vehicle_id) return toast.error('Choose the truck.');
    setSaving(true);
    const body: ServicePlanInput = { ...f, task: f.task.trim(), asset_type: scope === 'type' ? f.asset_type : null, vehicle_id: scope === 'truck' ? f.vehicle_id : null };
    try {
      if (plan && plan !== 'new') await maintenanceService.updatePlan(plan.id, body);
      else await maintenanceService.createPlan(body);
      toast.success('Service plan saved');
      queryClient.invalidateQueries({ queryKey: ['maintenance'] });
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Could not save the plan.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b p-5 pr-14">
          <SheetTitle className="text-base">{plan === 'new' ? 'New service plan' : 'Edit service plan'}</SheetTitle>
          <SheetDescription className="text-xs">A service that repeats by km, by time, or both. A truck’s own plan replaces its type’s plan for the same service.</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5 text-xs">
          {plan === 'new' && (
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button key={p.task} type="button" onClick={() => setF((x) => ({ ...x, ...p }))} className="rounded-full border px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground">
                  {p.task}
                </button>
              ))}
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="plan-task" className={label}>Service</Label>
            <Input id="plan-task" value={f.task} onChange={(e) => set('task', e.target.value)} placeholder="Oil change" className="h-9 text-sm" />
          </div>
          <div className="space-y-1.5">
            <p className={label}>Applies to</p>
            <SegmentedControl aria-label="Applies to" value={scope} onChange={setScope} options={[{ value: 'all', label: 'All trucks' }, { value: 'type', label: 'A truck type' }, { value: 'truck', label: 'One truck' }]} />
            {scope === 'type' && (
              <Select value={f.asset_type ?? undefined} onValueChange={(v) => v && set('asset_type', v as ServicePlanInput['asset_type'])}>
                <SelectTrigger className="h-9 text-xs" aria-label="Truck type"><SelectValue placeholder="Truck type…" /></SelectTrigger>
                <SelectContent>{ASSET_TYPES.map((t) => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}</SelectContent>
              </Select>
            )}
            {scope === 'truck' && (
              <Select value={f.vehicle_id ?? undefined} onValueChange={(v) => v && set('vehicle_id', v)}>
                <SelectTrigger className="h-9 text-xs" aria-label="Truck"><SelectValue placeholder="Truck…" /></SelectTrigger>
                <SelectContent>
                  {vehicles.map((v) => <SelectItem key={v.id} value={v.id} className="text-xs">{v.plate_number}{v.asset_type ? <span className="text-muted-foreground"> · {v.asset_type}</span> : null}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="plan-km" className={label}>Every (km)</Label>
              <Input id="plan-km" type="number" min="0" step="500" value={f.interval_km ?? ''} onChange={(e) => set('interval_km', num(e.target.value))} placeholder="10000" className="fin-num h-9 text-sm" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="plan-days" className={label}>Or every (days)</Label>
              <Input id="plan-days" type="number" min="0" step="1" value={f.interval_days ?? ''} onChange={(e) => set('interval_days', num(e.target.value))} placeholder="180" className="fin-num h-9 text-sm" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="plan-wkm" className={label}>Warn this many km before</Label>
              <Input id="plan-wkm" type="number" min="0" step="100" value={f.warn_km} onChange={(e) => set('warn_km', num(e.target.value) ?? 0)} className="fin-num h-9 text-sm" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="plan-wdays" className={label}>Or days before</Label>
              <Input id="plan-wdays" type="number" min="0" step="1" value={f.warn_days} onChange={(e) => set('warn_days', num(e.target.value) ?? 0)} className="fin-num h-9 text-sm" />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="plan-notes" className={label}>Notes</Label>
            <Input id="plan-notes" value={f.notes ?? ''} onChange={(e) => set('notes', e.target.value || null)} placeholder="Oil grade, filter part numbers…" className="h-9 text-sm" />
          </div>
          <label className="flex items-center gap-2 text-xs text-foreground">
            <Switch checked={f.is_active} onCheckedChange={(v) => set('is_active', Boolean(v))} /> Active
          </label>
        </div>
        <SheetFooter className="flex-row justify-end gap-2 border-t p-4">
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button size="sm" className="h-8 gap-1.5 rounded-full bg-brand text-xs text-white hover:bg-brand-hover" onClick={save} disabled={saving}>
            {saving && <Loader2 className="size-3.5 animate-spin" />} Save plan
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/** The service plans: what repeats, for which trucks, how often. */
export function ServicePlansPanel() {
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: ['maintenance', 'plans'], queryFn: maintenanceService.getPlans });
  const [editing, setEditing] = useState<ServicePlan | 'new' | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const remove = async (p: ServicePlan) => {
    try {
      await maintenanceService.deletePlan(p.id);
      toast.success(`${p.task} plan deleted`);
      queryClient.invalidateQueries({ queryKey: ['maintenance'] });
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Could not delete the plan.');
    } finally {
      setConfirmId(null);
    }
  };

  const plans = q.data ?? [];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
        <span className="text-[11px] text-muted-foreground">A truck’s own plan replaces its type’s, and a type’s replaces the all-trucks plan, for the same service.</span>
        <Button size="sm" variant="outline" className="ml-auto h-8 gap-1 rounded-full text-xs" onClick={() => setEditing('new')}>
          <Plus className="size-3.5" /> Add plan
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[640px] text-xs">
          <thead className="sticky top-0 z-10 bg-card text-[11px] text-muted-foreground">
            <tr className="border-b text-left">
              <th className="px-3 py-2 font-medium">Service</th>
              <th className="px-3 py-2 font-medium">Applies to</th>
              <th className="px-3 py-2 font-medium">How often</th>
              <th className="px-3 py-2 font-medium">Warn</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {q.isLoading && (
              <tr><td colSpan={5} className="px-3 py-2"><Skeleton className="h-5 w-full" /></td></tr>
            )}
            {!q.isLoading && plans.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-10 text-center text-muted-foreground">No plans yet. Add the services your trucks need on a schedule.</td></tr>
            )}
            {plans.map((p) => (
              <tr key={p.id} className="border-b border-border/60 hover:bg-muted/40">
                <td className="px-3 py-2">
                  <span className="font-medium text-foreground">{p.task}</span>
                  {!p.is_active && <Chip tone="neutral" size="sm" className="ml-1.5">Paused</Chip>}
                  {p.notes && <span className="block text-[11px] text-muted-foreground">{p.notes}</span>}
                </td>
                <td className="px-3 py-2 text-muted-foreground">{p.scope === 'truck' ? p.vehicle_plate : p.scope === 'type' ? `${p.asset_type} trucks` : 'All trucks'}</td>
                <td className="px-3 py-2 text-foreground">{intervalWording(p)}</td>
                <td className="px-3 py-2 text-muted-foreground">{[p.interval_km ? `${p.warn_km.toLocaleString('en-US')} km` : null, p.interval_days ? `${p.warn_days} days` : null].filter(Boolean).join(' or ')} before</td>
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  <Button variant="ghost" size="icon" className="size-7" onClick={() => setEditing(p)} aria-label={`Edit ${p.task}`}><Pencil className="size-3.5" /></Button>
                  {confirmId === p.id ? (
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive" onClick={() => remove(p)}>Confirm delete</Button>
                  ) : (
                    <Button variant="ghost" size="icon" className="size-7" onClick={() => setConfirmId(p.id)} aria-label={`Delete ${p.task}`}><Trash2 className="size-3.5" /></Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <PlanSheet plan={editing} onOpenChange={(o) => !o && setEditing(null)} />
    </div>
  );
}
