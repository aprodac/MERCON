import { memo, useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, ArrowRight, ChevronDown, ExternalLink } from 'lucide-react';

import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { tripService, type MonthlyBoardCompany, type MonthlyBoardTrip } from '@/services/tripService';
import { formatDayHeading, formatMoney, formatTime, initialsOf } from './monthlyBoardUtils';
import {
  CELL_STYLES,
  OVERDUE_CELL,
  OVERDUE_RING,
  daysOfMonth,
  dayCellState,
  displayPlace,
  driverDayKey,
  isDoubleBooked,
  isOverdue,
  otherBookings,
  slotOf,
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

const CHECKBOX = 'rounded border-slate-300 data-[state=checked]:bg-charcoal data-[state=checked]:border-charcoal';

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
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  const toggleCollapsed = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

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

  const columns = `minmax(220px, 260px) repeat(${days.length}, minmax(18px, 1fr)) 168px`;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
      <div className="min-w-[1000px]">
        {/* Day header */}
        <div className="grid border-b border-slate-200 dark:border-slate-800" style={{ gridTemplateColumns: columns }}>
          <div className="px-4 py-2 text-[11px] font-medium text-slate-400 self-end">Route</div>
          {days.map((d) => {
            const isToday = d.date === today;
            return (
              <div
                key={d.date}
                className={`py-1.5 text-center leading-tight ${isWeekend(d.weekday) ? 'bg-slate-50 dark:bg-slate-800/40' : ''}`}
              >
                <div className={`text-[9px] ${isToday ? 'text-slate-900 dark:text-white font-semibold' : 'text-slate-400'}`}>
                  {WEEKDAY_LETTER[d.weekday]}
                </div>
                <div
                  className={`mx-auto mt-0.5 h-5 w-5 grid place-items-center rounded-full text-[11px] tabular-nums ${
                    isToday ? 'bg-charcoal text-white font-semibold' : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {d.day}
                </div>
              </div>
            );
          })}
          <div className="px-4 py-2 text-[11px] font-medium text-slate-400 text-right self-end">Done · billed</div>
        </div>

        {rows.map(({ company, groups, totals }) => {
          const companyIds = groups.flatMap((g) => g.trips.map((t) => t.id));
          const allSelected = companyIds.length > 0 && companyIds.every((id) => selected.has(id));
          const someSelected = !allSelected && companyIds.some((id) => selected.has(id));
          const isCollapsed = collapsed.has(company.customer.id);
          return (
            <div key={company.customer.id}>
              {/* Company header */}
              <div className="flex items-center justify-between gap-3 px-4 py-2 bg-slate-50/80 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Checkbox
                    checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                    onCheckedChange={() => onToggleTrips(companyIds)}
                    aria-label={`Select all trips for ${company.customer.name}`}
                    className={`h-4 w-4 ${CHECKBOX}`}
                  />
                  <button
                    type="button"
                    onClick={() => toggleCollapsed(company.customer.id)}
                    className="flex items-center gap-2 min-w-0 text-left"
                    aria-expanded={!isCollapsed}
                  >
                    <ChevronDown className={`h-3.5 w-3.5 text-slate-400 shrink-0 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
                    {company.customer.logo_url ? (
                      <img src={company.customer.logo_url} alt="" className="h-5 w-5 rounded-md object-contain border border-slate-200 bg-white p-px" />
                    ) : (
                      <span className="h-5 w-5 rounded-md bg-slate-200/80 dark:bg-slate-700 text-slate-700 dark:text-slate-200 grid place-items-center text-[9px] font-semibold">
                        {initialsOf(company.customer.name)}
                      </span>
                    )}
                    <span className="text-[13px] font-semibold text-slate-900 dark:text-slate-100 truncate">{company.customer.name}</span>
                    <span className="text-xs text-slate-400 shrink-0">
                      {groups.length} {groups.length === 1 ? 'route' : 'routes'}
                    </span>
                  </button>
                  {totals.gaps > 0 && (
                    <span className="text-[11px] font-medium px-2 py-px rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 shrink-0">
                      {totals.gaps} no driver or truck
                    </span>
                  )}
                  {totals.overdue > 0 && (
                    <span className="text-[11px] font-medium px-2 py-px rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 shrink-0">
                      {totals.overdue} not closed
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-500 shrink-0 tabular-nums">
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {totals.done}/{totals.total}
                  </span>{' '}
                  done · {formatMoney(totals.earned)} <span className="text-slate-400">of {formatMoney(totals.expected)}</span>
                </div>
              </div>

              {!isCollapsed &&
                groups.map((group) => (
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

  // The route's normal number of trips a day; cells only print a count when a day differs from it.
  const usual = useMemo(() => {
    const freq = new Map<number, number>();
    byDate.forEach((list) => freq.set(list.length, (freq.get(list.length) ?? 0) + 1));
    let best = 1;
    let bestSeen = 0;
    freq.forEach((seen, n) => {
      if (seen > bestSeen || (seen === bestSeen && n < best)) {
        best = n;
        bestSeen = seen;
      }
    });
    return best;
  }, [byDate]);

  const totals = useMemo(() => totalsOf(group.trips, today, soonUntil), [group.trips, today, soonUntil]);
  const ids = group.trips.map((t) => t.id);
  const allSelected = ids.every((id) => selected.has(id));
  const someSelected = !allSelected && ids.some((id) => selected.has(id));
  const origin = displayPlace(group.origin);
  const destination = displayPlace(group.destination);
  const local = group.origin.toLowerCase() === group.destination.toLowerCase();

  return (
    <div
      className="grid items-center border-b border-slate-100 dark:border-slate-800/80 hover:bg-slate-50/70 dark:hover:bg-slate-800/30"
      style={{ gridTemplateColumns: columns }}
    >
      <div className="flex items-start gap-2.5 px-4 py-2 min-w-0">
        <Checkbox
          checked={allSelected ? true : someSelected ? 'indeterminate' : false}
          onCheckedChange={() => onToggleTrips(ids)}
          aria-label={`Select trips on ${origin} to ${destination}`}
          className={`mt-0.5 h-3.5 w-3.5 ${CHECKBOX}`}
        />
        <button
          type="button"
          onClick={() => onOpenLedger(group, company)}
          className="text-left min-w-0 flex-1 group/route"
          title="Open the ledger for this route"
        >
          <div className="flex items-center gap-1 text-[13px] font-medium text-slate-900 dark:text-slate-100 group-hover/route:underline underline-offset-2">
            <span className="truncate">{origin}</span>
            {local ? (
              <span className="text-[11px] font-normal text-slate-400 shrink-0">local</span>
            ) : (
              <>
                <ArrowRight className="h-3 w-3 text-slate-400 shrink-0" />
                <span className="truncate">{destination}</span>
              </>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500 min-w-0">
            <span className="shrink-0 rounded border border-slate-200 dark:border-slate-700 px-1 leading-[15px] text-[10px] font-medium text-slate-600 dark:text-slate-300">
              {group.vehicleClass}
            </span>
            <span className="truncate">
              {group.lineType} · {group.rate != null ? `${group.rateStr}/trip` : 'no rate'}
              {usual > 1 && <span className="font-medium text-slate-700 dark:text-slate-200"> · {usual} trips a day</span>}
            </span>
          </div>
        </button>
      </div>

      {days.map((d) => {
        const trips = byDate.get(d.date);
        const shade = isWeekend(d.weekday) ? 'bg-slate-50 dark:bg-slate-800/30' : '';
        if (!trips) {
          return (
            <div key={d.date} className={`h-full flex items-center justify-center px-px ${shade}`}>
              <span className="h-5 w-full max-w-[18px] rounded-[4px] bg-slate-100/70 dark:bg-slate-800/50" />
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
              isToday={d.date === today}
              usual={usual}
            />
          </div>
        );
      })}

      <div className="px-4 py-2 text-right tabular-nums">
        <div className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">
          {totals.gaps > 0 && <span className="mr-1.5 text-[11px] font-medium text-amber-700">{totals.gaps} gap{totals.gaps === 1 ? '' : 's'} ·</span>}
          {totals.overdue > 0 && <span className="mr-1.5 text-[11px] font-medium text-rose-600">{totals.overdue} open ·</span>}
          {totals.done}/{totals.total}
        </div>
        <div className="text-[11px] text-slate-500 whitespace-nowrap">
          {formatMoney(totals.earned, group.currency)}
          <span className="text-slate-400"> / {formatMoney(totals.expected, group.currency).replace(`${group.currency} `, '')}</span>
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
  isToday,
  usual,
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
  isToday: boolean;
  /** The route's normal trips per day. */
  usual: number;
}) {
  const state = dayCellState(trips);
  const style = CELL_STYLES[state];
  const overdue = trips.some((t) => isOverdue(t, today));
  const doubleBooked = trips.some((t) => isDoubleBooked(bookings, group.customerId, t));
  const notes = [
    trips.length > 1 ? `${trips.length} trips` : `${trips[0].ref_id ?? 'Trip'} · ${style.label}`,
    overdue && 'past, not closed',
    doubleBooked && 'driver or truck double-booked',
  ].filter(Boolean);

  // Fill + own ring come from the state; overdue swaps the planned outline for a red one.
  const look = overdue ? (state === 'planned' ? OVERDUE_CELL : `${style.cell} ${OVERDUE_RING}`) : style.cell;
  // Selection and focus use outline so they never fight the cell's ring.
  const focus = open || isAnchor
    ? 'outline outline-2 outline-offset-1 outline-slate-900 dark:outline-white'
    : selected
    ? 'outline outline-2 outline-offset-1 outline-purple-500'
    : isToday
    ? 'outline outline-1 outline-offset-1 outline-slate-400'
    : '';

  const cell = (
    <button
      type="button"
      title={`${formatDayHeading(trips[0].date)} · ${notes.join(' · ')}`}
      onClick={(e) => (e.shiftKey ? onShiftClick() : onOpenChange(!open))}
      className={`relative h-5 w-full max-w-[18px] rounded-[4px] transition-colors grid place-items-center text-[10px] font-semibold tabular-nums select-none ${look} ${focus}`}
    >
      {trips.length !== usual ? trips.length : null}
      {doubleBooked && (
        <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-rose-600 ring-2 ring-white dark:ring-slate-900" />
      )}
    </button>
  );

  // Only the open cell mounts a popover — a month of routes is hundreds of cells.
  if (!open) return cell;
  return (
    <Popover open onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{cell}</PopoverTrigger>
      <PopoverContent side="right" align="start" sideOffset={8} className="w-[320px] p-0 rounded-xl">
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
  const slot = slotOf(group.customerId, trip);
  const driverClash =
    driverId && driverId !== 'unassigned' ? otherBookings(bookings, driverDayKey(driverId, trip.date), slot) : [];
  const vehicleClash =
    vehicleId && vehicleId !== 'unassigned' ? otherBookings(bookings, vehicleDayKey(vehicleId, trip.date), slot) : [];
  const local = group.origin.toLowerCase() === group.destination.toLowerCase();

  return (
    <div className="flex flex-col">
      <div className="px-4 pt-3 pb-2.5 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{formatDayHeading(trip.date)}</span>
          <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-300">
            <span className={`h-2.5 w-2.5 rounded-[3px] ${CELL_STYLES[state].dot}`} />
            {CELL_STYLES[state].label}
          </span>
        </div>
        <div className="text-[11px] text-slate-500 truncate">
          <span className="font-mono">{trip.ref_id ?? 'Trip'}</span> · {formatTime(trip.planned_start)} · {displayPlace(group.origin)}
          {local ? ' local' : ` → ${displayPlace(group.destination)}`}
        </div>
        {trips.length > 1 && (
          <div className="inline-flex mt-2 flex-wrap gap-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5">
            {trips.map((t, i) => (
              <button
                key={t.id}
                type="button"
                onClick={() => pick(i)}
                className={`text-[11px] font-mono px-2 py-0.5 rounded-md ${
                  i === index
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
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
          <span className="text-[11px] font-medium text-slate-500">Driver</span>
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
          <span className="text-[11px] font-medium text-slate-500">Truck</span>
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
          <span className="text-[11px] font-medium text-slate-500">Status</span>
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
          className="text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white flex items-center gap-1"
        >
          Open trip <ExternalLink className="h-3 w-3" />
        </button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onDone}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs bg-charcoal hover:bg-charcoal-strong text-white"
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

/** Driver or truck can't also do another trip that day — a warning, not a block. */
function ClashNotice({ who, clashes }: { who: string; clashes: Booking[] }) {
  return (
    <Notice tone="amber">
      {who} is also on {clashes.map((c) => `${c.ref} (${c.customer}, ${c.route})`).join(', ')} that day.
    </Notice>
  );
}
