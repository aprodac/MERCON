import React, { useMemo, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { AlertTriangle, ChevronLeft, ChevronRight, Plus, RotateCcw, Trash2, Users, X } from 'lucide-react';
import { Combobox, ComboboxOption } from '@/components/ui/combobox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import DriverAvatar from '@/components/ui/DriverAvatar';
import { CoDriverPaySplit } from './CoDriverPaySplit';
import { shiftMonth, monthLabel } from '@/components/trips/monthly/monthlyBoardUtils';
import { tripService } from '@/services/tripService';
import { useDeploymentTimezone } from '@/lib/datetime';
import { cn } from '@/lib/utils';
import { dateInZone, summarizeTripRows, type DayAssignmentInput, type MonthlyCrewMember, type TripImportRow } from '@mercon/shared-types';

export interface MonthDateItem {
  dateStr: string;
  dayNumber: number;
  dayName: string;
  dayOfWeek: number; // 0=Sun, 1=Mon, etc.
}

export function getMonthDates(monthKey: string): MonthDateItem[] {
  if (!monthKey || !monthKey.includes('-')) return [];
  const [yearStr, monthStr] = monthKey.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10) - 1;
  if (isNaN(year) || isNaN(month)) return [];

  const date = new Date(year, month, 1);
  const result: MonthDateItem[] = [];
  while (date.getMonth() === month) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    result.push({
      dateStr: `${y}-${m}-${d}`,
      dayNumber: date.getDate(),
      dayName: date.toLocaleDateString('en-US', { weekday: 'short' }),
      dayOfWeek: date.getDay(),
    });
    date.setDate(date.getDate() + 1);
  }
  return result;
}

/** Each crew member's colour — the circle on the calendar and the dot in the crew panel. */
const CREW_COLOURS = [
  { dot: 'bg-teal-500', ring: 'ring-teal-500' },
  { dot: 'bg-violet-500', ring: 'ring-violet-500' },
  { dot: 'bg-orange-500', ring: 'ring-orange-500' },
  { dot: 'bg-sky-500', ring: 'ring-sky-500' },
];
const MAX_CREW = 4;
const ACTIVE_STATUSES = 'Scheduled,Loading,InTransit,Delayed';

type DayOverride = Partial<DayAssignmentInput>;

interface MonthlyDaysSelectorProps {
  selectedMonth: string;
  onChangeSelectedMonth: (monthKey: string) => void;
  selectedDates: string[];
  setSelectedDates: React.Dispatch<React.SetStateAction<string[]>>;
  contractSlotsCount?: number;
  crewMode: 'one' | 'rotate';
  setCrewMode: (mode: 'one' | 'rotate') => void;
  crew: MonthlyCrewMember[];
  setCrew: React.Dispatch<React.SetStateAction<MonthlyCrewMember[]>>;
  dayOverrides: Record<string, DayOverride>;
  setDayOverrides: React.Dispatch<React.SetStateAction<Record<string, DayOverride>>>;
  /** The roster that will be saved (built from crew + overrides). */
  dayAssignments: Record<string, DayAssignmentInput>;
  /** The rows that will be sent — the summary is computed from these. */
  rows?: TripImportRow[];
  /** Lane driver payout per trip — the default 50/50 split with a co-driver. */
  basePayout?: number;
  driverOptions?: ComboboxOption[];
  vehicleOptions?: ComboboxOption[];
  drivers?: any[];
  vehicles?: any[];
  assignmentType?: 'own' | 'third_party';
  thirdPartyProviderId?: string;
  setThirdPartyProviderId?: (id: string) => void;
  thirdPartyProviders?: any[];
  thirdPartyVehiclePlate?: string;
  setThirdPartyVehiclePlate?: (plate: string) => void;
  thirdPartyDriverName?: string;
  setThirdPartyDriverName?: (name: string) => void;
  thirdPartyDriverPhone?: string;
  setThirdPartyDriverPhone?: (phone: string) => void;
  thirdPartyCost?: string;
  setThirdPartyCost?: (cost: string) => void;
  contractVehicleType?: string;
}

const money = (n: number) => `SAR ${Math.round(n).toLocaleString()}`;

const PICKER_CLASS = 'h-8 rounded-lg border-slate-200 dark:border-slate-700 text-xs font-semibold shadow-2xs';

/** Optional co-driver with the per-trip pay split — used by crew rows and single days. */
function CoDriverEditor({
  value,
  onChange,
  driverOptions,
  basePayout,
}: {
  value: { driverId?: string; coDriverId?: string; driverPayoutOverride?: number; coDriverPayoutOverride?: number };
  onChange: (patch: DayOverride) => void;
  driverOptions: ComboboxOption[];
  basePayout: number;
}) {
  const has = Boolean(value.coDriverId);
  if (!has) {
    return (
      <button
        type="button"
        onClick={() => onChange({ coDriverId: 'unassigned' })}
        className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 cursor-pointer"
      >
        <Plus className="w-3 h-3" /> Co-driver
      </button>
    );
  }
  return (
    <div className="space-y-2 rounded-xl border border-slate-200/80 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 p-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Co-driver</span>
        <button
          type="button"
          onClick={() => onChange({ coDriverId: '', driverPayoutOverride: undefined, coDriverPayoutOverride: undefined })}
          className="flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-rose-600 cursor-pointer"
        >
          <X className="w-3 h-3" /> Remove
        </button>
      </div>
      <Combobox
        options={driverOptions.filter((o) => o.value !== value.driverId && o.value !== 'unassigned')}
        value={value.coDriverId === 'unassigned' ? '' : value.coDriverId || ''}
        onChange={(v) => onChange({ coDriverId: v })}
        placeholder="Choose a co-driver"
        searchPlaceholder="Name, phone or plate"
        triggerClassName={PICKER_CLASS}
        popoverClassName="min-w-[340px]"
      />
      <CoDriverPaySplit
        total={basePayout}
        value={{ driverPayoutOverride: value.driverPayoutOverride, coDriverPayoutOverride: value.coDriverPayoutOverride }}
        onChange={(split) => onChange(split)}
      />
    </div>
  );
}


export const MonthlyDaysSelector: React.FC<MonthlyDaysSelectorProps> = ({
  selectedMonth,
  onChangeSelectedMonth,
  selectedDates,
  setSelectedDates,
  contractSlotsCount = 1,
  crewMode,
  setCrewMode,
  crew,
  setCrew,
  dayOverrides,
  setDayOverrides,
  dayAssignments,
  rows = [],
  basePayout = 0,
  driverOptions = [],
  vehicleOptions = [],
  drivers = [],
  vehicles = [],
  assignmentType = 'own',
  thirdPartyProviderId = '',
  setThirdPartyProviderId,
  thirdPartyProviders = [],
  thirdPartyVehiclePlate = '',
  setThirdPartyVehiclePlate,
  thirdPartyDriverName = '',
  setThirdPartyDriverName,
  thirdPartyDriverPhone = '',
  setThirdPartyDriverPhone,
  thirdPartyCost = '',
  setThirdPartyCost,
  contractVehicleType = '',
}) => {
  const tz = useDeploymentTimezone();
  const is3pl = assignmentType === 'third_party';
  const monthDates = useMemo(() => getMonthDates(selectedMonth), [selectedMonth]);
  const selectedSet = useMemo(() => new Set(selectedDates), [selectedDates]);
  const activeCrew = crewMode === 'one' ? crew.slice(0, 1) : crew;
  const sortedDates = useMemo(() => [...selectedDates].sort(), [selectedDates]);

  /* ── Lookups ── */
  const driverById = useMemo(() => new Map(drivers.map((d: any) => [d.id, d])), [drivers]);
  const vehicleById = useMemo(() => new Map(vehicles.map((v: any) => [v.id, v])), [vehicles]);
  const driverName = (id?: string) => {
    if (!id || id === 'unassigned') return '';
    const d: any = driverById.get(id);
    return d ? `${d.first_name || ''} ${d.last_name || ''}`.trim() : '';
  };
  const shortName = (id?: string) => driverName(id).split(/\s+/).slice(0, 2).join(' ');
  const plateOf = (id?: string) => (id && id !== 'unassigned' ? (vehicleById.get(id) as any)?.plate_number || '' : '');
  /** A driver's usual truck — picked automatically with the driver. */
  const truckOfDriver = (driverId: string): string => {
    const d: any = driverById.get(driverId);
    const id = d?.assignedVehicleId || d?.assignedVehicle?.id || d?.assigned_vehicle_id;
    if (id) return id;
    const v: any = vehicles.find((x: any) => x.assignedDriverId === driverId || x.assigned_driver_id === driverId || x.assignedDriver?.id === driverId);
    return v?.id || '';
  };
  const crewIndexOf = (driverId?: string) => activeCrew.findIndex((c) => c.driverId && c.driverId === driverId);

  /* ── Days already taken by the crew's drivers (busy warning) ── */
  const monthStart = `${selectedMonth}-01`;
  const monthEnd = monthDates.length ? monthDates[monthDates.length - 1].dateStr : monthStart;
  const rosterDriverIds = useMemo(() => {
    const ids = new Set<string>();
    Object.values(dayAssignments).forEach((a) => {
      if (a.driverId && a.driverId !== 'unassigned') ids.add(a.driverId);
      if (a.coDriverId && a.coDriverId !== 'unassigned') ids.add(a.coDriverId);
    });
    return [...ids];
  }, [dayAssignments]);
  const busyQueries = useQueries({
    queries: is3pl
      ? []
      : rosterDriverIds.map((id) => ({
          queryKey: ['driver-busy-days', id, selectedMonth],
          queryFn: () => tripService.getAll({ driver_id: id, start_date: monthStart, end_date: monthEnd, status: ACTIVE_STATUSES, per_page: 200 }),
          staleTime: 60_000,
        })),
  });
  const busyDays = useMemo(() => {
    const map = new Map<string, Set<string>>();
    busyQueries.forEach((q, i) => {
      const trips: any[] = Array.isArray((q.data as any)?.data) ? (q.data as any).data : [];
      const days = new Set<string>();
      trips.forEach((t) => {
        const ms = t.planned_start ? new Date(t.planned_start).getTime() : NaN;
        if (!isNaN(ms)) days.add(dateInZone(ms, tz));
      });
      map.set(rosterDriverIds[i], days);
    });
    return map;
  }, [busyQueries, rosterDriverIds, tz]);
  const isBusy = (driverId: string | undefined, date: string) => Boolean(driverId && busyDays.get(driverId)?.has(date));

  /* ── Days ── */
  const toggleDay = (dateStr: string) => {
    setSelectedDates((prev) => (prev.includes(dateStr) ? prev.filter((d) => d !== dateStr) : [...prev, dateStr].sort()));
    // A removed day forgets its hand-made changes.
    if (selectedSet.has(dateStr)) {
      setDayOverrides((prev) => {
        if (!prev[dateStr]) return prev;
        const next = { ...prev };
        delete next[dateStr];
        return next;
      });
    }
  };
  const applyPreset = (preset: 'sunThu' | 'every' | 'monWedFri' | 'clear') => {
    const dates =
      preset === 'clear'
        ? []
        : monthDates
            .filter((d) => preset === 'every' || (preset === 'sunThu' ? d.dayOfWeek <= 4 : [1, 3, 5].includes(d.dayOfWeek)))
            .map((d) => d.dateStr);
    setSelectedDates(dates);
    setDayOverrides({});
  };
  const changeMonth = (monthKey: string) => {
    onChangeSelectedMonth(monthKey);
    // Days belong to one month — drop the old month's picks.
    setSelectedDates((prev) => prev.filter((d) => d.startsWith(monthKey)));
    setDayOverrides({});
  };

  /* ── Crew ── */
  const updateCrew = (idx: number, patch: Partial<MonthlyCrewMember>) =>
    setCrew((prev) => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  const pickCrewDriver = (idx: number, driverId: string) => {
    const truck = driverId && driverId !== 'unassigned' ? truckOfDriver(driverId) : '';
    updateCrew(idx, { driverId, ...(truck ? { vehicleId: truck } : driverId === 'unassigned' ? { vehicleId: 'unassigned' } : {}) });
  };
  const switchMode = (mode: 'one' | 'rotate') => {
    if (mode === crewMode) return;
    if (mode === 'rotate' && crew.length < 2) setCrew((prev) => [...prev, { driverId: '', vehicleId: '' }]);
    setCrewMode(mode);
  };
  const removeCrew = (idx: number) => {
    setCrew((prev) => prev.filter((_, i) => i !== idx));
    if (crew.length <= 2) setCrewMode('one');
  };

  /* ── One day ── */
  const setDay = (date: string, patch: DayOverride) =>
    setDayOverrides((prev) => ({ ...prev, [date]: { ...(prev[date] || {}), ...patch } }));
  const resetDay = (date: string) =>
    setDayOverrides((prev) => {
      const next = { ...prev };
      delete next[date];
      return next;
    });
  const applyDayToAll = (date: string) => {
    const a = dayAssignments[date];
    if (!a) return;
    const copy: DayOverride = {
      driverId: a.driverId,
      vehicleId: a.vehicleId,
      coDriverId: a.coDriverId || '',
      ...(a.driverPayoutOverride !== undefined ? { driverPayoutOverride: a.driverPayoutOverride } : {}),
      ...(a.coDriverPayoutOverride !== undefined ? { coDriverPayoutOverride: a.coDriverPayoutOverride } : {}),
    };
    setDayOverrides(Object.fromEntries(selectedDates.map((d) => [d, { ...copy }])));
  };

  /* ── Summary ── */
  const totals = summarizeTripRows(rows);
  const overrideCount = Object.keys(dayOverrides).filter((d) => selectedSet.has(d)).length;
  const noDriverDays = is3pl ? [] : sortedDates.filter((d) => !dayAssignments[d]?.driverId || dayAssignments[d]?.driverId === 'unassigned');
  const busyList = is3pl
    ? []
    : sortedDates.filter((d) => isBusy(dayAssignments[d]?.driverId, d) || isBusy(dayAssignments[d]?.coDriverId, d));
  const daysPerCrew = activeCrew.map((c) => sortedDates.filter((d) => dayAssignments[d]?.driverId && dayAssignments[d]?.driverId === c.driverId).length);
  const dayNum = (d: string) => Number(d.slice(8, 10));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start text-slate-800 dark:text-slate-200">
      {/* ── CALENDAR: the days, and who works each one ── */}
      <section className="lg:col-span-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-1">
            <button type="button" aria-label="Previous month" onClick={() => changeMonth(shiftMonth(selectedMonth, -1))} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-bold min-w-[130px] text-center">{monthLabel(selectedMonth)}</span>
            <button type="button" aria-label="Next month" onClick={() => changeMonth(shiftMonth(selectedMonth, 1))} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <span className="text-sm">
            <span className="font-bold">{selectedDates.length}</span> <span className="text-slate-500">working days</span>
            {contractSlotsCount > 1 && <span className="text-slate-500"> · {selectedDates.length * contractSlotsCount} trips</span>}
          </span>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {([
            ['sunThu', 'Sun–Thu'],
            ['every', 'Every day'],
            ['monWedFri', 'Mon, Wed, Fri'],
            ['clear', 'Clear'],
          ] as const).map(([p, label]) => (
            <button
              key={p}
              type="button"
              onClick={() => applyPreset(p)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-semibold transition-colors cursor-pointer',
                p === 'clear'
                  ? 'border-slate-200 dark:border-slate-700 text-slate-500 hover:text-rose-600 hover:border-rose-200'
                  : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-[#FA634E]/60 hover:text-[#c2410c]'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-semibold text-slate-400">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: monthDates[0]?.dayOfWeek || 0 }).map((_, i) => (
            <span key={`pad-${i}`} />
          ))}
          {monthDates.map((item) => {
            const on = selectedSet.has(item.dateStr);
            const a = dayAssignments[item.dateStr];
            const idx = crewIndexOf(a?.driverId);
            const noDriver = !is3pl && on && (!a?.driverId || a.driverId === 'unassigned');
            const changed = on && Boolean(dayOverrides[item.dateStr]);
            const busy = on && !is3pl && (isBusy(a?.driverId, item.dateStr) || isBusy(a?.coDriverId, item.dateStr));
            const colour = idx >= 0 ? CREW_COLOURS[idx % CREW_COLOURS.length] : null;
            const d: any = a?.driverId ? driverById.get(a.driverId) : null;

            return (
              <div
                key={item.dateStr}
                role="button"
                tabIndex={0}
                aria-pressed={on}
                aria-label={`${item.dayName} ${item.dayNumber}${on ? ', working day' : ''}`}
                onClick={() => toggleDay(item.dateStr)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleDay(item.dateStr);
                  }
                }}
                className={cn(
                  'relative h-14 rounded-xl border p-1.5 flex flex-col justify-between cursor-pointer select-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FA634E]/40',
                  on
                    ? 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-slate-300'
                    : 'border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 text-slate-400 hover:border-slate-300'
                )}
              >
                <div className="flex items-center justify-between">
                  <span className={cn('text-xs font-bold', on ? 'text-slate-800 dark:text-slate-100' : '')}>{item.dayNumber}</span>
                  {busy && <AlertTriangle className="w-3.5 h-3.5 text-amber-500" aria-label="Driver already has a trip this day" />}
                </div>
                {on && (
                  <div className="flex items-center justify-end gap-0.5">
                    {a?.coDriverId && a.coDriverId !== 'unassigned' && (
                      <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-1 text-[10px] font-bold text-slate-500">+1</span>
                    )}
                    {is3pl ? (
                      <span className="rounded-full bg-indigo-50 dark:bg-indigo-950/60 px-1.5 text-[10px] font-bold text-indigo-700 dark:text-indigo-300">3PL</span>
                    ) : (
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            onClick={(e) => e.stopPropagation()}
                            aria-label={`Change who works ${item.dayName} ${item.dayNumber}`}
                            title={noDriver ? 'No driver yet' : driverName(a?.driverId)}
                            className={cn(
                              'rounded-full ring-2 cursor-pointer',
                              changed ? 'outline outline-[1.5px] outline-dashed outline-amber-500 outline-offset-1' : '',
                              noDriver ? 'ring-slate-200 dark:ring-slate-700' : colour ? colour.ring : 'ring-slate-300 dark:ring-slate-600'
                            )}
                          >
                            {noDriver ? (
                              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-[11px] font-bold text-slate-400">?</span>
                            ) : (
                              <DriverAvatar src={d?.avatar_url} firstName={d?.first_name || ''} lastName={d?.last_name || ''} size="xs" />
                            )}
                          </button>
                        </PopoverTrigger>
                        <PopoverContent align="end" side="bottom" avoidCollisions={false} className="w-[320px] rounded-2xl p-3 space-y-2.5" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-bold">{new Date(`${item.dateStr}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}</span>
                            {changed && <span className="rounded-full bg-amber-50 dark:bg-amber-950/50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">Changed</span>}
                          </div>
                          <div className="space-y-1">
                            <span className="text-[11px] font-semibold text-slate-500">Driver</span>
                            <Combobox
                              options={driverOptions}
                              value={a?.driverId || ''}
                              onChange={(v) => {
                                const truck = v && v !== 'unassigned' ? truckOfDriver(v) : '';
                                setDay(item.dateStr, { driverId: v, ...(truck ? { vehicleId: truck } : {}) });
                              }}
                              placeholder="Choose a driver"
                              searchPlaceholder="Name, phone or plate"
                              triggerClassName={PICKER_CLASS}
                              popoverClassName="min-w-[340px]"
                            />
                          </div>
                          <div className="space-y-1">
                            <span className="text-[11px] font-semibold text-slate-500">Truck</span>
                            <Combobox
                              options={vehicleOptions}
                              value={a?.vehicleId || ''}
                              onChange={(v) => setDay(item.dateStr, { vehicleId: v })}
                              placeholder="Choose a truck"
                              searchPlaceholder="Plate or asset code"
                              triggerClassName={PICKER_CLASS}
                              popoverClassName="min-w-[300px]"
                            />
                          </div>
                          <CoDriverEditor value={a || {}} onChange={(patch) => setDay(item.dateStr, patch)} driverOptions={driverOptions} basePayout={basePayout} />
                          {busy && (
                            <p className="flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-300">
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Already on another trip this day.
                            </p>
                          )}
                          <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800">
                            <button type="button" onClick={() => applyDayToAll(item.dateStr)} className="text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-[#c2410c] cursor-pointer">
                              Apply to all days
                            </button>
                            <div className="flex items-center gap-3">
                              {changed && (
                                <button type="button" onClick={() => resetDay(item.dateStr)} className="text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer">
                                  Reset
                                </button>
                              )}
                              <button type="button" onClick={() => toggleDay(item.dateStr)} className="text-xs font-semibold text-rose-600 hover:text-rose-700 cursor-pointer">
                                Remove day
                              </button>
                            </div>
                          </div>
                        </PopoverContent>
                      </Popover>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-slate-400">
          Click a day to add or remove it{is3pl ? '.' : ". Click a driver's photo to change that one day."}
        </p>
      </section>

      {/* ── CREW / PARTNER + SUMMARY ── */}
      <div className="lg:col-span-5 space-y-3">
        {is3pl ? (
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold">3PL partner</span>
              <span className="text-[11px] text-slate-400">Same for every day</span>
            </div>
            <Select value={thirdPartyProviderId} onValueChange={(v) => setThirdPartyProviderId?.(v)}>
              <SelectTrigger className="h-9 rounded-lg text-xs font-semibold">
                <SelectValue placeholder="Choose a partner" />
              </SelectTrigger>
              <SelectContent className="z-[9999]">
                <SelectItem value="unassigned" className="text-xs">Assign later</SelectItem>
                {thirdPartyProviders.map((p: any) => (
                  <SelectItem key={p.id} value={p.id} className="text-xs">{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="grid grid-cols-2 gap-2">
              {([
                ['Truck plate', thirdPartyVehiclePlate, setThirdPartyVehiclePlate, 'ABC-1234'],
                ['Driver name', thirdPartyDriverName, setThirdPartyDriverName, 'Driver name'],
                ['Driver phone', thirdPartyDriverPhone, setThirdPartyDriverPhone, '05x xxx xxxx'],
              ] as const).map(([label, val, set, ph]) => (
                <label key={label} className="space-y-1">
                  <span className="text-[11px] font-semibold text-slate-500">{label}</span>
                  <input
                    value={val}
                    onChange={(e) => set?.(e.target.value)}
                    placeholder={ph}
                    className="h-9 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#FA634E]/40"
                  />
                </label>
              ))}
              <label id="field-3pl-cost" className="space-y-1">
                <span className="text-[11px] font-semibold text-slate-500">Cost per trip (SAR)</span>
                <input
                  type="number"
                  min="0"
                  value={thirdPartyCost}
                  onChange={(e) => setThirdPartyCost?.(e.target.value)}
                  placeholder="0"
                  className="h-9 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 text-xs font-bold tabular-nums outline-none focus:ring-2 focus:ring-[#FA634E]/40"
                />
              </label>
            </div>
            {Number(thirdPartyCost) > 0 && selectedDates.length > 0 && (
              <p className="text-[11px] text-slate-500">
                {money(Number(thirdPartyCost))} × {rows.length || selectedDates.length} trips = <span className="font-semibold text-slate-800 dark:text-slate-100">{money(Number(thirdPartyCost) * (rows.length || selectedDates.length))}</span>
              </p>
            )}
          </section>
        ) : (
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold flex items-center gap-1.5">
                <Users className="w-4 h-4 text-slate-400" /> Crew
              </span>
              <div role="radiogroup" aria-label="Crew" className="inline-flex rounded-full bg-slate-100 dark:bg-slate-800 p-0.5">
                {([
                  ['one', 'One driver'],
                  ['rotate', 'Rotate'],
                ] as const).map(([m, label]) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={crewMode === m}
                    onClick={() => switchMode(m)}
                    className={cn(
                      'rounded-full px-3 py-0.5 text-[11px] font-semibold transition-colors cursor-pointer',
                      crewMode === m
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs ring-1 ring-slate-200 dark:ring-slate-700'
                        : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {crewMode === 'rotate' && <p className="text-[11px] text-slate-400">Drivers take turns day by day, in date order.</p>}

            {activeCrew.map((c, idx) => {
              const colour = CREW_COLOURS[idx % CREW_COLOURS.length];
              return (
                <div key={idx} className="rounded-xl border border-slate-200 dark:border-slate-700 p-2.5 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className={cn('h-2.5 w-2.5 rounded-full shrink-0', colour.dot)} aria-hidden="true" />
                    <span className="text-xs font-semibold text-slate-500">{crewMode === 'one' ? 'Driver' : `Driver ${idx + 1}`}</span>
                    <span className="ml-auto text-[11px] text-slate-400">{daysPerCrew[idx] ?? 0} days</span>
                    {crewMode === 'rotate' && (
                      <button type="button" aria-label="Remove from rotation" onClick={() => removeCrew(idx)} className="p-0.5 text-slate-400 hover:text-rose-600 cursor-pointer">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Combobox
                      options={driverOptions}
                      value={c.driverId}
                      onChange={(v) => pickCrewDriver(idx, v)}
                      placeholder="Choose a driver"
                      searchPlaceholder="Name, phone or plate"
                      triggerClassName={PICKER_CLASS}
                      popoverClassName="min-w-[360px]"
                    />
                    <Combobox
                      options={vehicleOptions}
                      value={c.vehicleId}
                      onChange={(v) => updateCrew(idx, { vehicleId: v })}
                      placeholder="Choose a truck"
                      searchPlaceholder="Plate or asset code"
                      triggerClassName={PICKER_CLASS}
                      popoverClassName="min-w-[320px]"
                    />
                  </div>
                  <CoDriverEditor
                    driverOptions={driverOptions}
                    basePayout={basePayout}
                    value={c}
                    onChange={(patch) =>
                      updateCrew(idx, {
                        ...patch,
                        coDriverId: patch.coDriverId === '' ? undefined : patch.coDriverId ?? c.coDriverId,
                      } as Partial<MonthlyCrewMember>)
                    }
                  />
                </div>
              );
            })}

            {crewMode === 'rotate' && crew.length < MAX_CREW && (
              <button
                type="button"
                onClick={() => setCrew((prev) => [...prev, { driverId: '', vehicleId: '' }])}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:border-[#FA634E]/60 hover:text-[#c2410c] cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Add driver to rotation
              </button>
            )}

            {(overrideCount > 0 || noDriverDays.length > 0 || busyList.length > 0) && (
              <div className="space-y-1 border-t border-slate-100 dark:border-slate-800 pt-2 text-[11px]">
                {overrideCount > 0 && (
                  <p className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                    <span>{overrideCount} {overrideCount === 1 ? 'day' : 'days'} changed by hand (dashed ring)</span>
                    <button type="button" onClick={() => setDayOverrides({})} className="flex items-center gap-1 font-semibold text-slate-500 hover:text-slate-800 cursor-pointer">
                      <RotateCcw className="w-3 h-3" /> Reset
                    </button>
                  </p>
                )}
                {noDriverDays.length > 0 && selectedDates.length > 0 && (
                  <p className="text-amber-700 dark:text-amber-300">
                    {noDriverDays.length === selectedDates.length ? 'No driver chosen yet' : `No driver on ${noDriverDays.map(dayNum).join(', ')}`}
                  </p>
                )}
                {busyList.length > 0 && (
                  <p className="flex items-start gap-1 text-amber-700 dark:text-amber-300">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Already on another trip: {busyList.map(dayNum).join(', ')}
                  </p>
                )}
              </div>
            )}
          </section>
        )}

        {/* SUMMARY — the same numbers the review screen shows and the server receives */}
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-1.5 text-xs">
          <span className="text-sm font-bold block mb-1">This contract</span>
          <div className="flex justify-between"><span className="text-slate-500">Trips</span><span className="font-semibold tabular-nums">{totals.trips}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Customer billing</span><span className="font-semibold tabular-nums">{money(totals.billing + totals.charges)}</span></div>
          <div className="flex justify-between">
            <span className="text-slate-500">{is3pl ? '3PL cost' : 'Driver payout'}</span>
            <span className="font-semibold tabular-nums">{money(is3pl ? totals.thirdPartyCost : totals.payout)}</span>
          </div>
          {contractVehicleType && <div className="flex justify-between"><span className="text-slate-500">Truck class</span><span className="font-semibold">{contractVehicleType}</span></div>}
          {(() => {
            const billing = totals.billing + totals.charges;
            const margin = billing - (is3pl ? totals.thirdPartyCost : totals.payout);
            if (!totals.trips) return null;
            return (
              <div className="flex justify-between border-t border-slate-100 dark:border-slate-800 pt-1.5">
                <span className="font-semibold">Margin</span>
                <span className={cn('font-bold tabular-nums', margin >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600')}>
                  {money(margin)}{billing > 0 ? ` · ${((margin / billing) * 100).toFixed(1)}%` : ''}
                </span>
              </div>
            );
          })()}
        </section>
      </div>
    </div>
  );
};
