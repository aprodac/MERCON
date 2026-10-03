import { memo, useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, ArrowRight, ExternalLink, TableProperties } from 'lucide-react';

import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { tripService, type MonthlyBoardCompany, type MonthlyBoardTrip } from '@/services/tripService';
import { formatDayHeading, formatMoney, formatTime, initialsOf } from './monthlyBoardUtils';
import {
  CELL_STYLES,
  daysOfMonth,
  dayCellState,
  driverDayKey,
  isDoubleBooked,
  isOverdue,
  otherBookings,
  totalsOf,
  tripCellState,
  vehicleDayKey,
  type Booking,
  type BookingIndex,
  type TemplateGroup,
  type TripTotals,
} from './monthlyGrid';
import { useAssignmentLookups } from './useAssignmentLookups';

/** Trip statuses an operator can set from the quick edit — the Prisma TripStatus enum. */
const STATUS_CHOICES = ['Draft', 'Scheduled', 'Loading', 'InTransit', 'Delayed', 'Completed', 'Invoiced', 'Cancelled'];

/** Friday and Saturday — the Saudi weekend, shaded so a gap there isn't mistaken for a missed trip. */
const isWeekend = (weekday: number) => weekday === 5 || weekday === 6;
const WEEKDAY_LETTER = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export interface GridCompany {
  company: MonthlyBoardCompany;
  groups: TemplateGroup[];
  totals: TripTotals;
}

interface MonthlyRouteGridProps {
  month: string;
  rows: GridCompany[];
  today: string;
  soonUntil: string;
  /** Driver/truck bookings across the whole month, for double-booking checks. */
  bookings: BookingIndex;
  selectedTripIds: string[];
  onToggleTrips: (ids: string[]) => void;
  /** Adds to the selection without toggling — used by shift-click ranges. */
  onSelectTrips: (ids: string[]) => void;
  onOpenLedger: (group: TemplateGroup, company: MonthlyBoardCompany) => void;
}

/** Where the last shift-click landed, so the next one selects the days between. */
interface RangeAnchor {
  groupKey: string;
  date: string;
}

/**
 * The month as a route × day grid: one row per contracted line, one cell per
 * day coloured by what needs attention. Click a day to fix that trip in
 * place; click a route to open its ledger for bulk work.
 */
export default function MonthlyRouteGrid({
  month,
  rows,
  today,
  soonUntil,
  bookings,
  selectedTripIds,
  onToggleTrips,
  onSelectTrips,
  onOpenLedger,
}: MonthlyRouteGridProps) {
  const days = useMemo(() => daysOfMonth(month), [month]);
  const selected = useMemo(() => new Set(selectedTripIds), [selectedTripIds]);
  const [activeCell, setActiveCell] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<RangeAnchor | null>(null);

  // Shift-click a day to select it; shift-click another day on the same route
  // to select every trip in between, ready for the bulk bar.
  const handleShiftSelect = useCallback(
    (group: TemplateGroup, date: string) => {
      setActiveCell(null);
      if (anchor && anchor.groupKey === group.key && anchor.date !== date) {
        const [from, to] = anchor.date < date ? [anchor.date, date] : [date, anchor.date];
        onSelectTrips(group.trips.filter((t) => t.date >= from && t.date <= to).map((t) => t.id));
        setAnchor(null);
        return;
      }
      onToggleTrips(group.trips.filter((t) => t.date === date).map((t) => t.id));
      setAnchor({ groupKey: group.key, date });
    },
    [anchor, onSelectTrips, onToggleTrips],
  );

  const columns = `minmax(220px, 280px) repeat(${days.length}, minmax(18px, 1fr)) 132px`;

  return (
    <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs overflow-x-auto">
      <div className="min-w-[980px]">
        {/* Day header */}
        <div
          className="grid sticky top-0 z-10 bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200/80 dark:border-slate-800"
          style={{ gridTemplateColumns: columns }}
        >
          <div className="px-4 py-2 text-[11px] font-semibold text-slate-500">Route</div>
          {days.map((d) => (
            <div
              key={d.date}
              className={`py-1.5 text-center leading-tight ${isWeekend(d.weekday) ? 'bg-slate-100/80 dark:bg-slate-800/50' : ''} ${
                d.date === today ? 'bg-purple-100 dark:bg-purple-950/60' : ''
              }`}
            >
              <div className={`text-[9px] ${d.date === today ? 'text-purple-600' : 'text-slate-400'}`}>{WEEKDAY_LETTER[d.weekday]}</div>
              <div className={`text-[11px] font-semibold ${d.date === today ? 'text-purple-700 dark:text-purple-300' : 'text-slate-600 dark:text-slate-300'}`}>
                {d.day}
              </div>
            </div>
          ))}
          <div className="px-3 py-2 text-[11px] font-semibold text-slate-500 text-right">Done · amount</div>
        </div>

        {rows.map(({ company, groups, totals }) => {
          const companyIds = groups.flatMap((g) => g.trips.map((t) => t.id));
          const allSelected = companyIds.length > 0 && companyIds.every((id) => selected.has(id));
          const someSelected = !allSelected && companyIds.some((id) => selected.has(id));
          return (
            <div key={company.customer.id}>
              {/* Company header */}
              <div className="flex items-center justify-between gap-3 px-4 py-2 bg-slate-50 dark:bg-slate-800/40 border-b border-slate-200/80 dark:border-slate-800">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Checkbox
                    checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                    onCheckedChange={() => onToggleTrips(companyIds)}
                    aria-label={`Select all trips for ${company.customer.name}`}
                    className="h-4 w-4 rounded border-slate-300 data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600"
                  />
                  {company.customer.logo_url ? (
                    <img src={company.customer.logo_url} alt="" className="h-6 w-6 rounded-md object-contain border border-slate-200 bg-white p-0.5" />
                  ) : (
                    <span className="h-6 w-6 rounded-md bg-purple-50 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 grid place-items-center text-[10px] font-bold">
                      {initialsOf(company.customer.name)}
                    </span>
                  )}
                  <span className="text-sm font-semibold text-[#3E3C3D] dark:text-slate-100 truncate">{company.customer.name}</span>
                  <span className="text-xs text-slate-500 shrink-0">
                    {groups.length} {groups.length === 1 ? 'route' : 'routes'}
                  </span>
                  {totals.gaps > 0 && (
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800 shrink-0">
                      {totals.gaps} need driver or truck
                    </span>
                  )}
                  {totals.overdue > 0 && (
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800 shrink-0">
                      {totals.overdue} past, not closed
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-300 shrink-0">
                  <span className="font-semibold text-[#3E3C3D] dark:text-slate-100">
                    {totals.done}/{totals.total}
                  </span>{' '}
                  done · {formatMoney(totals.earned)} of {formatMoney(totals.expected)}
                </div>
              </div>

              {groups.map((group) => (
                <RouteRow
                  key={group.key}
                  group={group}
                  company={company}
                  days={days}
                  columns={columns}
                  today={today}
                  soonUntil={soonUntil}
                  bookings={bookings}
                  selected={selected}
                  activeCell={activeCell?.startsWith(group.key + '@') ? activeCell : null}
                  anchorDate={anchor?.groupKey === group.key ? anchor.date : null}
                  onActiveCell={setActiveCell}
                  onShiftSelect={handleShiftSelect}
                  onToggleTrips={onToggleTrips}
                  onOpenLedger={onOpenLedger}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const RouteRow = memo(function RouteRow({
  group,
  company,
  days,
  columns,
  today,
  soonUntil,
  bookings,
  selected,
  activeCell,
  anchorDate,
  onActiveCell,
  onShiftSelect,
  onToggleTrips,
  onOpenLedger,
}: {
  group: TemplateGroup;
  company: MonthlyBoardCompany;
  days: { date: string; day: number; weekday: number }[];
  columns: string;
  today: string;
  soonUntil: string;
  bookings: BookingIndex;
  selected: Set<string>;
  activeCell: string | null;
  anchorDate: string | null;
  onActiveCell: (key: string | null) => void;
  onShiftSelect: (group: TemplateGroup, date: string) => void;
  onToggleTrips: (ids: string[]) => void;
  onOpenLedger: (group: TemplateGroup, company: MonthlyBoardCompany) => void;
}) {
  const byDate = useMemo(() => {
    const map = new Map<string, MonthlyBoardTrip[]>();
    for (const t of group.trips) {
      const list = map.get(t.date);
      if (list) list.push(t);
      else map.set(t.date, [t]);
    }
    return map;
  }, [group.trips]);

  const totals = useMemo(() => totalsOf(group.trips, today, soonUntil), [group.trips, today, soonUntil]);
  const ids = group.trips.map((t) => t.id);
  const allSelected = ids.every((id) => selected.has(id));
  const someSelected = !allSelected && ids.some((id) => selected.has(id));
  const pct = totals.total ? Math.round((totals.done / totals.total) * 100) : 0;

  return (
    <div
      className="grid items-center border-b border-slate-100 dark:border-slate-800/80 hover:bg-slate-50/60 dark:hover:bg-slate-800/30"
      style={{ gridTemplateColumns: columns }}
    >
      <div className="flex items-start gap-2.5 px-4 py-2 min-w-0">
        <Checkbox
          checked={allSelected ? true : someSelected ? 'indeterminate' : false}
          onCheckedChange={() => onToggleTrips(ids)}
          aria-label={`Select trips on ${group.origin} to ${group.destination}`}
          className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600"
        />
        <button
          type="button"
          onClick={() => onOpenLedger(group, company)}
          className="text-left min-w-0 flex-1 group/route"
          title="Open the ledger for this route"
        >
          <div className="flex items-center gap-1 text-xs font-semibold text-[#3E3C3D] dark:text-slate-100 group-hover/route:text-purple-700">
            <span className="truncate">{group.origin}</span>
            <ArrowRight className="h-3 w-3 text-slate-400 shrink-0" />
            <span className="truncate">{group.destination}</span>
            <TableProperties className="h-3 w-3 text-slate-300 group-hover/route:text-purple-500 shrink-0 ml-0.5" />
          </div>
          <div className="text-[11px] text-slate-500 truncate">
            {group.vehicleClass} · {group.lineType} · {group.rate != null ? `${group.rateStr}/trip` : 'no rate'}
          </div>
          <div className="mt-1 h-1 w-full max-w-[200px] rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
          </div>
        </button>
      </div>

      {days.map((d) => {
        const trips = byDate.get(d.date);
        const shade = `${isWeekend(d.weekday) ? 'bg-slate-50 dark:bg-slate-800/30' : ''} ${d.date === today ? 'bg-purple-50/80 dark:bg-purple-950/30' : ''}`;
        if (!trips) {
          return (
            <div key={d.date} className={`h-full flex items-center justify-center px-px ${shade}`}>
              <span className="h-6 w-full max-w-[22px] rounded-[3px] border border-dashed border-slate-200 dark:border-slate-700" />
            </div>
          );
        }
        const cellKey = `${group.key}@${d.date}`;
        return (
          <div key={d.date} className={`h-full flex items-center justify-center px-px ${shade}`}>
            <DayCell
              trips={trips}
              group={group}
              today={today}
              bookings={bookings}
              open={activeCell === cellKey}
              onOpenChange={(open) => onActiveCell(open ? cellKey : null)}
              onShiftClick={() => onShiftSelect(group, d.date)}
              selected={trips.some((t) => selected.has(t.id))}
              isAnchor={anchorDate === d.date}
            />
          </div>
        );
      })}

      <div className="px-3 py-2 text-right">
        <div className="text-xs font-semibold text-[#3E3C3D] dark:text-slate-100">
          {totals.done}/{totals.total}
          {totals.gaps > 0 && <span className="ml-1.5 text-amber-600 font-semibold">· {totals.gaps} gap{totals.gaps === 1 ? '' : 's'}</span>}
          {totals.overdue > 0 && <span className="ml-1.5 text-rose-600 font-semibold">· {totals.overdue} open</span>}
        </div>
        <div className="text-[11px] text-slate-500 whitespace-nowrap">
          {formatMoney(totals.earned, group.currency)}
          <span className="text-slate-400"> / {formatMoney(totals.expected, group.currency)}</span>
        </div>
      </div>
    </div>
  );
});

function DayCell({
  trips,
  group,
  today,
  bookings,
  open,
  onOpenChange,
  onShiftClick,
  selected,
  isAnchor,
}: {
  trips: MonthlyBoardTrip[];
  group: TemplateGroup;
  today: string;
  bookings: BookingIndex;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onShiftClick: () => void;
  selected: boolean;
  isAnchor: boolean;
}) {
  const state = dayCellState(trips);
  const style = CELL_STYLES[state];
  const overdue = trips.some((t) => isOverdue(t, today));
  const doubleBooked = trips.some((t) => isDoubleBooked(bookings, t));
  const notes = [
    trips.length > 1 ? `${trips.length} trips` : `${trips[0].ref_id ?? 'Trip'} · ${style.label}`,
    overdue && 'past, not closed',
    doubleBooked && 'driver or truck double-booked',
  ].filter(Boolean);
  const cell = (
    <button
      type="button"
      title={`${formatDayHeading(trips[0].date)} · ${notes.join(' · ')}`}
      onClick={(e) => (e.shiftKey ? onShiftClick() : onOpenChange(!open))}
      className={`relative h-6 w-full max-w-[22px] rounded-[3px] transition-colors grid place-items-center text-[10px] font-bold text-white select-none ${style.cell} ${
        overdue ? 'shadow-[inset_0_0_0_2px_#e11d48]' : ''
      } ${selected ? 'ring-2 ring-purple-500 ring-offset-1 dark:ring-offset-slate-900' : ''} ${
        open || isAnchor ? 'ring-2 ring-[#3E3C3D] dark:ring-white ring-offset-1 dark:ring-offset-slate-900' : ''
      }`}
    >
      {trips.length > 1 ? trips.length : null}
      {doubleBooked && (
        <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-rose-600 ring-1 ring-white dark:ring-slate-900" />
      )}
    </button>
  );

  // Only the open cell mounts a popover — a month of routes is hundreds of cells.
  if (!open) return cell;
  return (
    <Popover open onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{cell}</PopoverTrigger>
      <PopoverContent align="center" className="w-[340px] p-0 rounded-xl">
        <QuickEdit trips={trips} group={group} today={today} bookings={bookings} onDone={() => onOpenChange(false)} />
      </PopoverContent>
    </Popover>
  );
}

function QuickEdit({
  trips,
  group,
  today,
  bookings,
  onDone,
}: {
  trips: MonthlyBoardTrip[];
  group: TemplateGroup;
  today: string;
  bookings: BookingIndex;
  onDone: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { driverOptions, vehicleOptions } = useAssignmentLookups(true);
  const [index, setIndex] = useState(0);
  const trip = trips[Math.min(index, trips.length - 1)];

  const [driverId, setDriverId] = useState(trip.driver?.id ?? '');
  const [vehicleId, setVehicleId] = useState(trip.vehicle?.id ?? '');
  const [status, setStatus] = useState<string>(trip.status);

  const pick = (i: number) => {
    const t = trips[i];
    setIndex(i);
    setDriverId(t.driver?.id ?? '');
    setVehicleId(t.vehicle?.id ?? '');
    setStatus(t.status);
  };

  const changes: { driver_id?: string; vehicle_id?: string; status?: string } = {};
  if (driverId && driverId !== (trip.driver?.id ?? 'unassigned')) changes.driver_id = driverId;
  if (vehicleId && vehicleId !== (trip.vehicle?.id ?? 'unassigned')) changes.vehicle_id = vehicleId;
  if (status !== trip.status) changes.status = status;
  const dirty = Object.keys(changes).length > 0;

  const save = useMutation({
    mutationFn: () => tripService.bulkAssign({ trip_ids: [trip.id], ...changes }),
    onSuccess: () => {
      toast.success(`${trip.ref_id ?? 'Trip'} updated`);
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      onDone();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error?.message || err.message || 'Couldn’t update the trip');
    },
  });

  const state = tripCellState(trip);
  const driverClash =
    driverId && driverId !== 'unassigned' ? otherBookings(bookings, driverDayKey(driverId, trip.date), trip.id) : [];
  const vehicleClash =
    vehicleId && vehicleId !== 'unassigned' ? otherBookings(bookings, vehicleDayKey(vehicleId, trip.date), trip.id) : [];

  return (
    <div className="flex flex-col">
      <div className="px-4 pt-3 pb-2 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-[#3E3C3D] dark:text-slate-100">{formatDayHeading(trip.date)}</span>
          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
            <span className={`h-2 w-2 rounded-full ${CELL_STYLES[state].dot}`} />
            {CELL_STYLES[state].label}
          </span>
        </div>
        <div className="text-[11px] text-slate-500 truncate">
          <span className="font-mono">{trip.ref_id ?? 'Trip'}</span> · {formatTime(trip.planned_start)} · {group.origin} → {group.destination}
        </div>
        {trips.length > 1 && (
          <div className="flex gap-1 mt-2 flex-wrap">
            {trips.map((t, i) => (
              <button
                key={t.id}
                type="button"
                onClick={() => pick(i)}
                className={`text-[11px] font-mono px-2 py-0.5 rounded-md border ${
                  i === index
                    ? 'bg-purple-50 border-purple-300 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300'
                    : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'
                }`}
              >
                {t.ref_id ?? `Trip ${i + 1}`}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="px-4 py-3 flex flex-col gap-2.5">
        {isOverdue(trip, today) && status === trip.status && (
          <Notice tone="rose">This day has passed and the trip is still {trip.status}. Mark it Completed or Cancelled.</Notice>
        )}
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold text-slate-500">Driver</span>
          <Combobox
            options={driverOptions}
            value={driverId}
            onChange={setDriverId}
            placeholder="No driver"
            searchPlaceholder="Search drivers"
            className="h-8 text-xs"
          />
          {driverClash.length > 0 && <ClashNotice who="This driver" clashes={driverClash} />}
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold text-slate-500">Truck</span>
          <Combobox
            options={vehicleOptions}
            value={vehicleId}
            onChange={setVehicleId}
            placeholder="No truck"
            searchPlaceholder="Search plates"
            className="h-8 text-xs"
          />
          {vehicleClash.length > 0 && <ClashNotice who="This truck" clashes={vehicleClash} />}
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold text-slate-500">Status</span>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_CHOICES.map((s) => (
                <SelectItem key={s} value={s} className="text-xs">
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      </div>

      <div className="px-4 py-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => navigate(`/trips/${trip.id}`)}
          className="text-xs font-semibold text-slate-600 hover:text-purple-700 dark:text-slate-300 flex items-center gap-1"
        >
          Open trip <ExternalLink className="h-3 w-3" />
        </button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onDone}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs bg-purple-600 hover:bg-purple-700 text-white"
            disabled={!dirty || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Notice({ tone, children }: { tone: 'rose' | 'amber'; children: React.ReactNode }) {
  const styles =
    tone === 'rose'
      ? 'bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-300'
      : 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-300';
  return (
    <div className={`flex items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] leading-snug ${styles}`}>
      <AlertTriangle className="h-3 w-3 mt-px shrink-0" />
      <span>{children}</span>
    </div>
  );
}

/** Same driver or truck already on another trip that day — a warning, not a block (two short runs can be fine). */
function ClashNotice({ who, clashes }: { who: string; clashes: Booking[] }) {
  return (
    <Notice tone="amber">
      {who} is also on {clashes.map((c) => `${c.ref} (${c.customer}, ${c.route})`).join(', ')} that day.
    </Notice>
  );
}
