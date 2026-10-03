import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Pencil, Plus, Trash2, UserRound } from 'lucide-react';
import { toast } from 'sonner';

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { vehicleService, type CostSetupDriver, type DriverSalary } from '@/services/vehicleService';
import { extractApiErrorMessage } from '@/lib/api';
import { formatDate } from '@/lib/finance/format';
import { sar0 } from '@/lib/vehiclePnl';
import { useCostInvalidation } from './useCostInvalidation';

interface Draft {
  base: string;
  allowances: string;
  employer: string;
  from: string;
  to: string;
}

const toDraft = (s: DriverSalary | null, from: string): Draft => ({
  base: s ? String(s.base_salary) : '',
  allowances: s ? String(s.allowances) : '',
  employer: s ? String(s.employer_costs) : '',
  from: s?.effective_from ?? from,
  to: s?.effective_to ?? '',
});

const n = (s: string) => (s.trim() === '' ? 0 : Number(s));

/**
 * A driver's monthly pay package history. Adding a package from a date closes
 * the one before it the day before (the API does this), so a raise is a
 * single step and past months keep the old salary.
 */
export function DriverSalarySheet({ driver, today, onClose }: { driver: CostSetupDriver | null; today: string; onClose: () => void }) {
  const invalidate = useCostInvalidation();
  const [mode, setMode] = useState<'new' | string | null>(null);
  const [draft, setDraft] = useState<Draft>(toDraft(null, `${today.slice(0, 7)}-01`));

  useEffect(() => {
    if (!driver) return;
    // A driver with no salary yet opens straight into the form
    setMode(driver.history.length === 0 ? 'new' : null);
    setDraft(toDraft(driver.current, `${today.slice(0, 7)}-01`));
    if (driver.current) setDraft((d) => ({ ...d, from: `${today.slice(0, 7)}-01`, to: '' }));
    // Only when a different driver opens — a background refetch mustn't wipe the form
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driver?.id, today]);

  const total = n(draft.base) + n(draft.allowances) + n(draft.employer);
  const error = !(n(draft.base) > 0) ? 'Enter the base salary.' : [draft.allowances, draft.employer].some((v) => n(v) < 0) ? 'Amounts can’t be negative.' : !draft.from ? 'Pick the start date.' : draft.to && draft.to < draft.from ? 'End date is before the start date.' : null;

  const save = useMutation({
    mutationFn: () => {
      const payload = { base_salary: n(draft.base), allowances: n(draft.allowances), employer_costs: n(draft.employer), effective_from: draft.from, effective_to: draft.to || null };
      return mode === 'new' ? vehicleService.addDriverSalary(driver!.id, payload) : vehicleService.updateDriverSalary(driver!.id, mode!, payload);
    },
    onSuccess: () => {
      toast.success('Salary saved');
      setMode(null);
      invalidate();
    },
    onError: (e) => toast.error(extractApiErrorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => vehicleService.deleteDriverSalary(driver!.id, id),
    onSuccess: () => {
      toast.success('Salary removed');
      invalidate();
    },
    onError: (e) => toast.error(extractApiErrorMessage(e)),
  });

  const edit = (s: DriverSalary) => {
    setDraft(toDraft(s, s.effective_from));
    setMode(s.id);
  };

  const field = (id: keyof Draft, label: string, hint?: string) => (
    <div className="space-y-1">
      <Label htmlFor={`sal-${id}`} className="text-xs">{label}</Label>
      <Input id={`sal-${id}`} type={id === 'from' || id === 'to' ? 'date' : 'number'} min={0} step="0.01" value={draft[id]} onChange={(e) => setDraft((d) => ({ ...d, [id]: e.target.value }))} className="h-8 text-xs" />
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );

  return (
    <Sheet open={driver !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-lg">
        {driver && (
          <>
            <SheetHeader className="border-b p-5 pr-14">
              <div className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-muted"><UserRound className="size-5" /></span>
                <div className="min-w-0">
                  <SheetTitle className="truncate text-base">
                    <Link to={`/drivers/${driver.id}`} className="hover:underline">{driver.name}</Link>
                  </SheetTitle>
                  <SheetDescription>{driver.vehicle ? `Assigned to ${driver.vehicle.plate_number}` : 'No assigned truck'} · monthly salary</SheetDescription>
                </div>
              </div>
            </SheetHeader>

            <div className="space-y-5 p-5">
              <p className="text-xs text-muted-foreground">
                Trip pay is already on each trip. This is the fixed monthly salary on top of it. Vehicle P&amp;L splits it across the trucks the driver drove each month, by number of trips.
              </p>

              {mode !== null ? (
                <section className="space-y-3 rounded-lg border bg-muted/20 p-3">
                  <h3 className="text-sm font-semibold">{mode === 'new' ? (driver.current ? 'New salary (raise or change)' : 'Salary') : 'Edit salary'}</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {field('base', 'Base salary (SAR / month)')}
                    {field('allowances', 'Allowances (SAR / month)', 'Housing, food, transport')}
                    {field('employer', 'Employer costs (SAR / month)', 'GOSI, iqama, medical — leave empty if not tracked')}
                    <div className="space-y-1">
                      <Label className="text-xs">Total per month</Label>
                      <p className="fin-num flex h-8 items-center text-sm font-semibold">{sar0(total)}</p>
                    </div>
                    {field('from', 'From')}
                    {field('to', 'Until (optional)', 'Only if they left or the salary stopped')}
                  </div>
                  {mode === 'new' && driver.current && (
                    <p className="text-[11px] text-muted-foreground">The current salary will end the day before {draft.from ? formatDate(draft.from) : 'this date'}.</p>
                  )}
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-chip-negative-fg">{error}</span>
                    <div className="flex gap-2">
                      {driver.history.length > 0 && <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setMode(null)}>Cancel</Button>}
                      <Button size="sm" className="h-7 text-xs" disabled={Boolean(error) || save.isPending} onClick={() => save.mutate()}>
                        {save.isPending ? 'Saving…' : 'Save salary'}
                      </Button>
                    </div>
                  </div>
                </section>
              ) : (
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => { setDraft({ ...toDraft(driver.current, `${today.slice(0, 7)}-01`), from: `${today.slice(0, 7)}-01`, to: '' }); setMode('new'); }}>
                  <Plus className="size-3.5" /> {driver.current ? 'Change salary from a date' : 'Add salary'}
                </Button>
              )}

              {driver.history.length > 0 && (
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold">History</h3>
                  <ul className="divide-y rounded-lg border">
                    {driver.history.map((s) => {
                      const current = driver.current?.id === s.id;
                      return (
                        <li key={s.id} className="flex items-center gap-3 px-3 py-2 text-xs">
                          <div className="min-w-0 flex-1">
                            <p className="flex items-center gap-1.5 font-medium">
                              {formatDate(s.effective_from)} – {s.effective_to ? formatDate(s.effective_to) : 'now'}
                              {current && <Chip tone="positive" size="sm">Current</Chip>}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              Base {sar0(s.base_salary)} · allowances {sar0(s.allowances)} · employer {sar0(s.employer_costs)}
                            </p>
                          </div>
                          <p className="fin-num font-semibold">{sar0(s.monthly_total)}</p>
                          <Button variant="ghost" size="icon" className="size-7" aria-label="Edit salary" onClick={() => edit(s)}>
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-chip-negative-fg" aria-label="Remove salary" disabled={remove.isPending} onClick={() => remove.mutate(s.id)}>
                            <Trash2 className="size-3.5" />
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
