import React from 'react';
import { StopRoleDot, StopRoleBadge, stopRoleStyle } from '@/components/trips/StopRole';
import { Plus, Trash2, Calendar, Clock, RotateCcw, AlertCircle, Lock, ArrowDown, Route as RouteIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import LocationCombobox from '@/components/quotations/LocationCombobox';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { TimePicker } from '@/components/ui/time-picker';
import TransitTimeBadge from '@/components/trips/TransitTimeBadge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getAllTaxonomyOptions, resolveTaxonomyOption } from '@/utils/taxonomyRegistry';
import { isDateTimeInPast } from '@/utils/pastDateTripUtils';
import { useDeploymentTimezone } from '@/lib/datetime';
import { dutyShiftMinutes } from '@/services/travelTimeService';
import { cn, isUuid } from '@/lib/utils';
import { daysBetween, dropoffDayOffset, formatQuotationRef, returnLegDayOffsets, STOP_ROLE_COLORS } from '@mercon/shared-types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { locationService, type Location } from '@/services/locationService';
import PinChip, { isExactPin } from '@/components/locations/PinChip';
import SetPinDialog from '@/components/locations/SetPinDialog';
import { pinCustomerLocation } from '@/components/locations/pinCustomerLocation';
import ConfirmModal from '@/components/ui/ConfirmModal';

interface RouteWorkspaceProps {
  slot: any;
  contractCustomer: string;
  isRoundTrip: boolean;
  canRemoveSlot: boolean;
  contractRateCategory?: string;
  contractBillingType?: string;
  setContractRateCategory?: (cat: string) => void;
  triggerRateLookupForSlots?: (vType?: string, rCat?: string, custId?: string, bType?: string) => void;
  handleAddSlotIntermediate: (slotId: string) => void;
  handleRemoveTripSlot: (slotId: string) => void;
  handleSlotLocationChange: (slotId: string, field: 'origin' | 'destination', locName: string, locObj: any) => void;
  handleUpdateTripSlot: (slotId: string, patch: any) => void;
  handleRemoveSlotIntermediate: (slotId: string, idx: number) => void;
  handleUpdateSlotIntermediate: (slotId: string, idx: number, val: string) => void;
  handleAddSlotReturnIntermediate?: (slotId: string) => void;
  handleRemoveSlotReturnIntermediate?: (slotId: string, idx: number) => void;
  handleUpdateSlotReturnIntermediate?: (slotId: string, idx: number, val: string) => void;
  fieldErrors?: Record<string, boolean>;
  isRouteLocked?: boolean;
  /** Fill the arrival from the travel-time estimate (create only — never over a saved trip). */
  autoFillArrival?: boolean;
  handleUpdateSlotIntermediateFee?: (slotId: string, idx: number, val: string) => void;
  handleUpdateSlotReturnIntermediateFee?: (slotId: string, idx: number, val: string) => void;
  /** Which part to render: the route (locations, stops, return leg), the schedule ("When"), or both. */
  part?: 'all' | 'route' | 'schedule';
  /** Draw attention to the schedule — it's the next thing to fill. */
  highlightSchedule?: boolean;
  /** The pickup time used last time on this lane, offered as a one-click fill. */
  lastLaneTime?: { date: string; time: string; label: string } | null;
}

/** Any fixed date: a monthly trip's return is timed from it to count whole days. */
const DAY_ANCHOR = '2000-01-01';
const DAY_CHOICES = 5;

/** "Day 1 / Day 2 …" — which day of each monthly run an event falls on (0 = the pickup day). */
function DaySelect({ value, onChange, label }: { value: number; onChange: (day: number) => void; label: string }) {
  const count = Math.max(DAY_CHOICES, value + 1);
  return (
    <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger aria-label={label} className="h-9 w-[84px] shrink-0 rounded-xl border-slate-200 bg-white shadow-2xs text-xs font-semibold">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Array.from({ length: count }, (_, d) => (
          <SelectItem key={d} value={String(d)} className="text-xs">
            Day {d + 1}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export const RouteWorkspace: React.FC<RouteWorkspaceProps> = ({
  slot,
  contractCustomer,
  isRoundTrip,
  canRemoveSlot,
  contractRateCategory = 'Single Trip',
  contractBillingType,
  setContractRateCategory,
  triggerRateLookupForSlots,
  handleAddSlotIntermediate,
  handleRemoveTripSlot,
  handleSlotLocationChange,
  handleUpdateTripSlot,
  handleRemoveSlotIntermediate,
  handleUpdateSlotIntermediate,
  handleAddSlotReturnIntermediate,
  handleRemoveSlotReturnIntermediate,
  handleUpdateSlotReturnIntermediate,
  fieldErrors = {},
  isRouteLocked = false,
  autoFillArrival = true,
  handleUpdateSlotIntermediateFee,
  handleUpdateSlotReturnIntermediateFee,
  part = 'all',
  highlightSchedule = false,
  lastLaneTime = null,
}) => {
  const showRoute = part !== 'schedule';
  const showSchedule = part !== 'route';
  const tz = useDeploymentTimezone();
  // A route filled by a quotation folds into one line; "Edit route" opens it.
  const [routeOpen, setRouteOpen] = React.useState(false);
  const matchedId = slot.matchedRateCard?.id;
  React.useEffect(() => {
    setRouteOpen(false);
  }, [matchedId]);
  const hasRouteError = Boolean(
    fieldErrors?.[`origin-${slot.id}`] || fieldErrors?.['origin'] || fieldErrors?.[`destination-${slot.id}`] || fieldErrors?.['destination']
  );
  const routeCollapsed = !routeOpen && !hasRouteError && Boolean(slot.rateMatched && slot.matchedRateCard && slot.origin && slot.destination);
  const outStops = (slot.intermediateLocations || []).filter(Boolean);
  const retStops = (slot.returnIntermediateLocations || []).filter(Boolean);
  const stopCount = outStops.length + (isRoundTrip ? retStops.length : 0);
  const hhmm = (t?: string) => (t ? t.slice(0, 5) : '');
  const retLoad = (slot.returnOrigin || '').trim();
  const retEnd = (!slot.returnDestination || isUuid(slot.returnDestination) ? slot.origin : slot.returnDestination) || '';
  // Location ids of the named stops, lined up with outStops / retStops.
  const idsOfNamed = (names: string[] | undefined, ids: Array<string | null> | undefined) =>
    (names || []).flatMap((n, i) => (n ? [ids?.[i] ?? null] : []));
  const outStopIds = idsOfNamed(slot.intermediateLocations, slot.intermediateLocationIds);
  const retStopIds = idsOfNamed(slot.returnIntermediateLocations, slot.returnIntermediateLocationIds);
  const routePoints: Array<{ name: string; role: 'origin' | 'stop' | 'destination'; label: string; time?: string; returning?: boolean; locationId?: string | null }> = [
    { name: slot.origin, role: 'origin', label: 'Pickup', time: hhmm(slot.pickupTime), locationId: slot.originLocationId },
    ...outStops.map((n: string, i: number) => ({ name: n, role: 'stop' as const, label: 'Stop', locationId: outStopIds[i] })),
    { name: slot.destination, role: 'destination', label: isRoundTrip ? 'Drop' : 'Delivery', time: hhmm(slot.dropoffTime), locationId: slot.destinationLocationId },
    ...(isRoundTrip
      ? [
          ...(retLoad && retLoad.toLowerCase() !== String(slot.destination || '').toLowerCase()
            ? [{ name: retLoad, role: 'origin' as const, label: 'Return loading', time: hhmm(slot.returnPickupTime), returning: true, locationId: slot.returnOriginLocationId }]
            : []),
          ...retStops.map((n: string, i: number) => ({ name: n, role: 'stop' as const, label: 'Stop', returning: true, locationId: retStopIds[i] })),
          {
            name: retEnd,
            role: 'destination' as const,
            label: 'Back',
            time: hhmm(slot.returnDropoffTime),
            returning: true,
            locationId: !slot.returnDestination || isUuid(slot.returnDestination) ? slot.originLocationId : slot.returnDestinationLocationId,
          },
        ]
      : []),
  ].filter((p) => p.name);

  // Pin status on the folded route, from the same location list the pickers load (shared cache).
  const queryClient = useQueryClient();
  const { data: locationsRes } = useQuery({
    queryKey: ['locations', contractCustomer],
    queryFn: () => locationService.getAll({ customerId: contractCustomer, active_only: true }),
    enabled: showRoute && Boolean(contractCustomer),
  });
  const locationById = React.useMemo(() => {
    const m = new Map<string, Location>();
    for (const l of locationsRes?.data || []) m.set(l.id, l);
    return m;
  }, [locationsRes]);
  const [pinning, setPinning] = React.useState<Location | null>(null);

  // A pinned location goes onto this trip's pickup / delivery in place. It is
  // the same place, so the quotation stays (picking another location drops it).
  const applyPin = (loc: Location) => {
    const patch: Record<string, unknown> = {};
    if (slot.originLocationId === loc.id) {
      Object.assign(patch, { originLat: loc.lat ?? null, originLng: loc.lng ?? null, originPrecision: 'EXACT', ...(loc.address ? { originAddress: loc.address } : {}) });
    }
    if (slot.destinationLocationId === loc.id) {
      Object.assign(patch, { destinationLat: loc.lat ?? null, destinationLng: loc.lng ?? null, destinationPrecision: 'EXACT', ...(loc.address ? { destinationAddress: loc.address } : {}) });
    }
    if (Object.keys(patch).length > 0) handleUpdateTripSlot(slot.id, patch);
  };

  // Another pickup / delivery while a quotation is applied drops that quotation
  // (its price is for its own route) — ask first.
  const [pendingChange, setPendingChange] = React.useState<{ field: 'origin' | 'destination'; locName: string; locObj: any } | null>(null);
  const changeLocation = (field: 'origin' | 'destination', locName: string, locObj: any) => {
    const currentId = field === 'origin' ? slot.originLocationId : slot.destinationLocationId;
    const nextId = locObj?.id ?? (isUuid(locName) ? locName : null);
    if (slot.rateMatched && slot.matchedRateCard && nextId !== currentId) {
      setPendingChange({ field, locName, locObj });
      return;
    }
    handleSlotLocationChange(slot.id, field, locName, locObj);
  };
  const quotationLabel = formatQuotationRef(slot.matchedRateCard?.quotation_number) ?? 'The selected quotation';
  const pendingFrom = pendingChange ? (pendingChange.field === 'origin' ? slot.origin : slot.destination) : '';
  const pendingTo = pendingChange ? pendingChange.locObj?.name || pendingChange.locName : '';
  const lineTypeTaxonomyOptions = getAllTaxonomyOptions('LINE_TYPE');
  const selectedTaxonomyOption = resolveTaxonomyOption('LINE_TYPE', contractRateCategory);
  const isMonthly = contractBillingType?.toLowerCase() === 'monthly';

  const pickupIsoValue = React.useMemo(() => {
    if (!slot.date || !slot.pickupTime) return null;
    const time = slot.pickupTime;
    const cleanTime = time.includes(':') ? time.split(' ')[0] : '';
    if (!cleanTime) return null;
    return `${slot.date}T${cleanTime.length === 4 ? '0' + cleanTime : cleanTime}`;
  }, [slot.date, slot.pickupTime]);

  const dropoffIsoValue = React.useMemo(() => {
    if (!slot.dropoffDate || !slot.dropoffTime) return null;
    const time = slot.dropoffTime;
    const cleanTime = time.includes(':') ? time.split(' ')[0] : '';
    if (!cleanTime) return null;
    return `${slot.dropoffDate}T${cleanTime.length === 4 ? '0' + cleanTime : cleanTime}`;
  }, [slot.dropoffDate, slot.dropoffTime]);

  const toIso = (d?: string, t?: string) => (d && t ? `${d}T${t.length === 4 ? '0' + t : t}` : null);
  const returnPickupIso = toIso(slot.returnPickupDate, slot.returnPickupTime);
  const returnDropoffIso = toIso(slot.returnDropoffDate, slot.returnDropoffTime);
  const dropoffDateObj = dropoffIsoValue ? new Date(dropoffIsoValue) : undefined;
  const returnPickupDateObj = returnPickupIso ? new Date(returnPickupIso) : undefined;
  // Monthly round trip: which day of each run the return loading and arrival home are on (dates don't apply).
  const returnDays = returnLegDayOffsets(
    isMonthly ? { ...slot, returnPickupDate: '', returnDropoffDate: '' } : { ...slot, dropoffDay: undefined, returnPickupDay: undefined, returnDropoffDay: undefined },
  );
  const returnFrom = (slot.returnOrigin || slot.destination || '').trim();
  const returnTo = ((!slot.returnDestination || isUuid(slot.returnDestination)) ? slot.origin : slot.returnDestination || '').trim();

  const pickupDateObj = React.useMemo(() => {
    if (!pickupIsoValue) return undefined;
    const d = new Date(pickupIsoValue);
    return isNaN(d.getTime()) ? undefined : d;
  }, [pickupIsoValue]);

  const isPastSchedule = React.useMemo(() => {
    if (isMonthly || !slot.date) return false;
    return isDateTimeInPast(slot.date, slot.pickupTime, tz);
  }, [isMonthly, slot.date, slot.pickupTime, tz]);

  const scheduleError = React.useMemo(() => {
    if (isMonthly) return null;
    if (!slot.date) return null;
    // Only check sequence errors if pickup time and dropoff time are both entered
    if (!slot.pickupTime || !slot.dropoffTime) {
      return null;
    }

    const dropoffDate = slot.dropoffDate || slot.date;
    if (!dropoffDate) return null;

    const pTime = (slot.pickupTime || '').split(' ')[0];
    const dTime = (slot.dropoffTime || '').split(' ')[0];

    // 1. Date comparison
    if (dropoffDate < slot.date) {
      return 'Drop-off date cannot be before start date.';
    }

    // 2. Same date time comparison
    if (dropoffDate === slot.date && dTime <= pTime) {
      return 'Drop-off time must be after the start time.';
    }

    // 3. Exact ISO timestamp comparison
    if (pickupIsoValue && dropoffIsoValue) {
      const pTs = new Date(pickupIsoValue).getTime();
      const dTs = new Date(dropoffIsoValue).getTime();
      if (!isNaN(pTs) && !isNaN(dTs) && dTs <= pTs) {
        return 'Drop-off date and time must be strictly later than start date and time.';
      }
    }

    return null;
  }, [isMonthly, slot.date, slot.dropoffDate, slot.pickupTime, slot.dropoffTime, pickupIsoValue, dropoffIsoValue]);

  // "auto" while the arrival follows the travel-time estimate; "set by you" once edited.
  const arrivalBadge = autoFillArrival && slot.dropoffTime ? (
    <span
      className={cn(
        'ml-1.5 normal-case tracking-normal rounded-full px-1.5 py-px text-[10px] font-semibold',
        slot.dropoffManual
          ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
          : 'bg-orange-50 text-[#c2410c] dark:bg-orange-950/40 dark:text-orange-300'
      )}
      title={slot.dropoffManual ? 'Clear it to use the travel-time estimate again' : 'From the travel-time estimate — edit to change'}
    >
      {slot.dropoffManual ? 'set by you' : 'auto'}
    </span>
  ) : null;

  return (
    <div
      id={part === 'schedule' ? 'section-when' : part === 'route' ? 'section-route' : undefined}
      className={cn(
        'space-y-3 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-3.5 rounded-2xl shadow-2xs transition-shadow',
        highlightSchedule && showSchedule && 'ring-2 ring-amber-400/70 border-amber-300'
      )}
    >
      {showRoute && (
        routeCollapsed ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <RouteIcon className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="text-sm font-bold text-slate-900 dark:text-slate-100">Route</span>
                {selectedTaxonomyOption ? (
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold',
                      selectedTaxonomyOption.colorTheme.bg,
                      selectedTaxonomyOption.colorTheme.text,
                      selectedTaxonomyOption.colorTheme.border
                    )}
                  >
                    {isRoundTrip && <RotateCcw className="w-3 h-3" />}
                    {selectedTaxonomyOption.label}
                  </span>
                ) : (
                  <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{contractRateCategory}</span>
                )}
                {slot.matchedRateCard?.quotation_number != null && (
                  <span className="rounded-full bg-orange-50 dark:bg-orange-950/40 px-2 py-0.5 text-[11px] font-semibold text-[#c2410c] dark:text-orange-300">
                    {formatQuotationRef(slot.matchedRateCard.quotation_number)}
                  </span>
                )}
                {stopCount > 0 && (
                  <span className="text-[11px] text-slate-500">{stopCount} {stopCount === 1 ? 'stop' : 'stops'} on the way</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setRouteOpen(true)}
                className="shrink-0 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:border-[#FA634E]/60 hover:text-[#c2410c] cursor-pointer"
              >
                Edit route
              </button>
            </div>

            {/* Timeline: every stop in order, with its planned time. The way back is dashed. */}
            <ol className="flex items-start" aria-label="Route">
              {routePoints.map((pt, i) => (
                <li key={`${pt.name}-${i}`} className="flex min-w-0 flex-1 items-start last:flex-none">
                  <div className="flex min-w-0 flex-col items-center text-center" style={{ maxWidth: 140 }}>
                    <span
                      className="flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-white dark:ring-slate-900"
                      style={{ backgroundColor: STOP_ROLE_COLORS[pt.role].soft }}
                    >
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: STOP_ROLE_COLORS[pt.role].main }} />
                    </span>
                    <span className="mt-1 w-full truncate text-xs font-bold capitalize text-slate-900 dark:text-slate-100" title={pt.name}>
                      {pt.name}
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      {pt.label}
                      {pt.time && <span className="font-semibold text-slate-700 dark:text-slate-200"> · {pt.time}</span>}
                    </span>
                    {pt.locationId && locationById.get(pt.locationId) && (
                      <PinChip
                        className="mt-1"
                        exact={isExactPin(locationById.get(pt.locationId)!.coordinate_precision, locationById.get(pt.locationId)!.lat, locationById.get(pt.locationId)!.lng)}
                        onClick={() => setPinning(locationById.get(pt.locationId!)!)}
                      />
                    )}
                  </div>
                  {i < routePoints.length - 1 && (
                    <span
                      aria-hidden="true"
                      className={cn(
                        'mt-3 h-0 flex-1 border-t-2 mx-1 min-w-[16px]',
                        routePoints[i + 1].returning ? 'border-dashed border-amber-400' : 'border-slate-300 dark:border-slate-600'
                      )}
                    />
                  )}
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <>
      {/* COMPACT INLINE SLOT HEADER: LINE TYPE + OVERNIGHT */}
      <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider shrink-0">
            LINE TYPE:
          </span>
          <Select
            disabled={isRouteLocked}
            value={contractRateCategory}
            onValueChange={(val) => {
              if (setContractRateCategory) setContractRateCategory(val);
              handleUpdateTripSlot(slot.id, { rateCategory: val, matchedRateCard: null });
              if (triggerRateLookupForSlots) triggerRateLookupForSlots(undefined, val);
            }}
          >
            <SelectTrigger className={cn(
              "h-7.5 rounded-lg border-slate-200/90 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-800 dark:text-slate-200 shadow-2xs w-auto min-w-[140px] max-w-[240px] px-2.5",
              isRouteLocked && "bg-slate-100/90 dark:bg-slate-800/60 text-slate-400 cursor-not-allowed pointer-events-none border-slate-200 dark:border-slate-800"
            )}>
              <div className="flex items-center gap-1.5 min-w-0">
                {selectedTaxonomyOption ? (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-extrabold border shrink-0 whitespace-nowrap",
                      selectedTaxonomyOption.colorTheme.bg,
                      selectedTaxonomyOption.colorTheme.text,
                      selectedTaxonomyOption.colorTheme.border
                    )}
                  >
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: selectedTaxonomyOption.colorTheme.hex }} />
                    <span className="whitespace-nowrap truncate">{selectedTaxonomyOption.label}</span>
                  </span>
                ) : (
                  <SelectValue placeholder="Select Line Type" />
                )}
              </div>
            </SelectTrigger>
            <SelectContent className="z-[9999]">
              {lineTypeTaxonomyOptions.map((opt) => (
                <SelectItem key={opt.id} value={opt.label} className="text-xs font-bold py-1.5 cursor-pointer">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

        </div>

        {/* RIGHT: REMOVE SLOT (IF MULTI-SLOT) */}
        {!isRouteLocked && canRemoveSlot && (
          <button
            type="button"
            onClick={() => handleRemoveTripSlot(slot.id)}
            className="text-slate-400 hover:text-rose-600 transition-colors p-1 cursor-pointer"
            title="Remove trip slot"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* ROUTE: ORIGIN → STOPS → DESTINATION, THEN ONE SCHEDULE ROW */}
      <div className="w-full space-y-2.5">
            {/* ORIGIN LOCATION (BALANCED 8 COLS) */}
            <div id={`field-origin-${slot.id}`} className="space-y-1">
              <label className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center justify-between h-4">
                <span className="flex items-center gap-1.5">
                  <StopRoleDot role="origin" /> ORIGIN LOCATION <span className="text-[#FA634E]">*</span>
                </span>
                {(fieldErrors?.[`origin-${slot.id}`] || fieldErrors?.['origin']) && (
                  <span className="text-[9px] font-bold text-red-500 animate-pulse">Required</span>
                )}
              </label>
              <LocationCombobox
                id="step2-first-field"
                customerId={contractCustomer}
                value={slot.origin}
                disabled={isRouteLocked}
                hasError={Boolean(fieldErrors?.[`origin-${slot.id}`] || fieldErrors?.['origin'])}
                onChange={(locName, locObj) => changeLocation('origin', locName, locObj)}
                onPinned={applyPin}
                placeholder="Search starting origin (e.g. Riyadh Distribution Centre)..."
                triggerClassName={cn(
                  "h-9 border-slate-200 bg-white text-xs font-bold text-[#3E3C3D] dark:text-slate-100 shadow-2xs w-full",
                  isRouteLocked && "bg-slate-100/90 dark:bg-slate-800/60 text-slate-400 cursor-not-allowed pointer-events-none border-slate-200 dark:border-slate-800"
                )}
                precision={slot.originPrecision}
              />
              {(fieldErrors?.[`origin-${slot.id}`] || fieldErrors?.['origin']) && (
                <div className="flex items-center gap-1.5 mt-1 text-[11px] font-bold text-rose-600 dark:text-rose-400">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>Please select origin location</span>
                </div>
              )}
            </div>

          {/* INTERMEDIATE STOPS (IF ANY) */}
          {slot.intermediateLocations?.length > 0 && (
            <div className="pl-3 border-l-2 border-dashed space-y-1.5 py-0.5" style={{ borderColor: stopRoleStyle('stop').soft }}>
              {slot.intermediateLocations.map((stopVal: string, idx: number) => (
                <div key={idx} className="flex items-center gap-2">
                  <StopRoleBadge role="stop">
                    Stop #{idx + 1}
                  </StopRoleBadge>
                  <div className="flex-1">
                    <LocationCombobox
                      customerId={contractCustomer}
                      value={stopVal}
                      disabled={isRouteLocked}
                      onChange={(locId, locObj) => {
                        const val = locObj?.name || locObj?.address || (isUuid(locId) ? '' : locId);
                        handleUpdateSlotIntermediate(slot.id, idx, val);
                      }}
                      placeholder={`Search intermediate stop #${idx + 1}...`}
                      triggerClassName={cn(
                        "h-8 text-xs font-semibold",
                        isRouteLocked && "bg-slate-100/90 dark:bg-slate-800/60 text-slate-400 cursor-not-allowed pointer-events-none border-slate-200 dark:border-slate-800"
                      )}
                    />
                  </div>
                  <label className="flex items-center gap-1 h-8 w-[92px] shrink-0 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2" title="Fee billed for this stop">
                    <span className="text-[10px] font-semibold text-slate-400">SAR</span>
                    <input
                      type="number"
                      min="0"
                      inputMode="decimal"
                      aria-label="Stop fee"
                      disabled={isRouteLocked || !handleUpdateSlotIntermediateFee}
                      value={slot.intermediateStopFees?.[idx] ?? ''}
                      onChange={(e) => handleUpdateSlotIntermediateFee?.(slot.id, idx, e.target.value)}
                      placeholder="Fee"
                      className="min-w-0 flex-1 bg-transparent text-right text-xs font-semibold tabular-nums outline-none"
                    />
                  </label>
                  {!isRouteLocked && (
                    <button
                      type="button"
                      aria-label="Remove stop"
                      onClick={() => handleRemoveSlotIntermediate(slot.id, idx)}
                      className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {!isRouteLocked && (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleAddSlotIntermediate(slot.id)}
                className="h-6.5 text-[11px] font-bold border-dashed border-slate-300 hover:border-brand hover:bg-orange-50 text-slate-600 hover:text-brand gap-1 cursor-pointer"
              >
                <Plus className="w-3 h-3" /> Add Intermediate Stop
              </Button>
            </div>
          )}

            {/* DESTINATION LOCATION (BALANCED 8 COLS) */}
            <div id={`field-destination-${slot.id}`} className="space-y-1">
              <label className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center justify-between h-4">
                <span className="flex items-center gap-1.5">
                  <StopRoleDot role="destination" /> {isRoundTrip ? 'OUTBOUND DESTINATION *' : 'DESTINATION LOCATION *'}
                </span>
                {(fieldErrors?.[`destination-${slot.id}`] || fieldErrors?.['destination']) && (
                  <span className="text-[9px] font-bold text-red-500 animate-pulse">Required</span>
                )}
              </label>
              <LocationCombobox
                customerId={contractCustomer}
                value={slot.destination}
                disabled={isRouteLocked}
                hasError={Boolean(fieldErrors?.[`destination-${slot.id}`] || fieldErrors?.['destination'])}
                onChange={(locName, locObj) => changeLocation('destination', locName, locObj)}
                onPinned={applyPin}
                placeholder="Search delivery destination (e.g. Al Baha Station)..."
                triggerClassName={cn(
                  "h-9 border-slate-200 bg-white text-xs font-bold text-[#3E3C3D] dark:text-slate-100 shadow-2xs w-full",
                  isRouteLocked && "bg-slate-100/90 dark:bg-slate-800/60 text-slate-400 cursor-not-allowed pointer-events-none border-slate-200 dark:border-slate-800"
                )}
                precision={slot.destinationPrecision}
              />
              {(fieldErrors?.[`destination-${slot.id}`] || fieldErrors?.['destination']) && (
                <div className="flex items-center gap-1.5 mt-1 text-[11px] font-bold text-rose-600 dark:text-rose-400">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>Please select destination location</span>
                </div>
              )}
            </div>


      </div>

        {/* ROUND TRIP LEG 2: RETURN JOURNEY (ONLY VISIBLE WHEN LINE TYPE IS ROUND TRIP) */}
        {isRoundTrip && (
          <div className="p-3 rounded-xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 space-y-2 pt-2.5 animate-fade-in">
            <div className="flex items-center justify-between pb-1 border-b border-amber-200/80 dark:border-amber-900/80">
              <span className="text-[11px] font-extrabold text-amber-900 dark:text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                <RotateCcw className="w-3.5 h-3.5 text-amber-600 shrink-0" /> LEG 2: RETURN JOURNEY ({slot.returnOrigin || slot.destination || 'Destination'} → {(!slot.returnDestination || isUuid(slot.returnDestination)) ? (slot.origin || 'Origin') : slot.returnDestination})
              </span>
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-100 flex items-center gap-1">
                <RotateCcw className="w-3 h-3" /> Round Trip Active
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
              {/* RETURN LOADING LOCATION */}
              <div className="md:col-span-6 space-y-1">
                <label className="text-[10px] font-extrabold text-amber-800 dark:text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                  <StopRoleDot role="origin" /> RETURN LOADING LOCATION *
                </label>
                <LocationCombobox
                  customerId={contractCustomer}
                  value={slot.returnOrigin || slot.destination}
                  disabled={isRouteLocked}
                  onChange={(locId, locObj) => {
                    const val = locObj?.name || locObj?.address || (isUuid(locId) ? '' : locId);
                    handleUpdateTripSlot(slot.id, { returnOrigin: val, returnOriginLocationId: locObj?.id || (isUuid(locId) ? locId : null) });
                  }}
                  placeholder="Return loading (defaults to Outbound Destination)..."
                  triggerClassName={cn(
                    "h-9 border-slate-200 bg-[#FFFFFF] text-xs font-bold text-[#3E3C3D] dark:text-slate-100 shadow-2xs w-full",
                    isRouteLocked && "bg-slate-100/90 dark:bg-slate-800/60 text-slate-400 cursor-not-allowed pointer-events-none border-slate-200 dark:border-slate-800"
                  )}
                />
              </div>

              {/* RETURN DESTINATION LOCATION */}
              <div className="md:col-span-6 space-y-1">
                <label className="text-[10px] font-extrabold text-amber-800 dark:text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                  <StopRoleDot role="destination" /> RETURN DESTINATION LOCATION *
                </label>
                <LocationCombobox
                  customerId={contractCustomer}
                  value={slot.returnDestination || slot.origin}
                  disabled={isRouteLocked}
                  onChange={(locId, locObj) => {
                    const val = locObj?.name || locObj?.address || (isUuid(locId) ? '' : locId);
                    handleUpdateTripSlot(slot.id, { returnDestination: val, returnDestinationLocationId: locObj?.id || (isUuid(locId) ? locId : null) });
                  }}
                  placeholder="Return destination (defaults to Origin)..."
                  triggerClassName={cn(
                    "h-9 border-slate-200 bg-[#FFFFFF] text-xs font-bold text-[#3E3C3D] dark:text-slate-100 shadow-2xs w-full",
                    isRouteLocked && "bg-slate-100/90 dark:bg-slate-800/60 text-slate-400 cursor-not-allowed pointer-events-none border-slate-200 dark:border-slate-800"
                  )}
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              {handleAddSlotReturnIntermediate && !isRouteLocked && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleAddSlotReturnIntermediate(slot.id)}
                  className="h-7 text-[11px] font-bold border-dashed border-amber-300 hover:border-amber-500 bg-white text-amber-800 gap-1 cursor-pointer"
                >
                  <Plus className="w-3 h-3" /> Add Return Intermediate Stop
                </Button>
              )}
            </div>

            {/* RETURN INTERMEDIATE STOPS */}
            {slot.returnIntermediateLocations?.length > 0 && (
              <div className="pl-3 border-l-2 border-dashed space-y-1.5 py-1" style={{ borderColor: stopRoleStyle('stop').soft }}>
                {slot.returnIntermediateLocations.map((rStop: string, rIdx: number) => (
                  <div key={rIdx} className="flex items-center gap-2">
                    <StopRoleBadge role="stop">
                      Return Stop #{rIdx + 1}
                    </StopRoleBadge>
                    <div className="flex-1">
                      <LocationCombobox
                        customerId={contractCustomer}
                        value={rStop}
                        disabled={isRouteLocked}
                        onChange={(locId, locObj) => {
                          const val = locObj?.name || locObj?.address || (isUuid(locId) ? '' : locId);
                          handleUpdateSlotReturnIntermediate && handleUpdateSlotReturnIntermediate(slot.id, rIdx, val);
                        }}
                        placeholder={`Search return stop #${rIdx + 1}...`}
                        triggerClassName={cn(
                          "h-8 text-xs font-semibold",
                          isRouteLocked && "bg-slate-100/90 dark:bg-slate-800/60 text-slate-400 cursor-not-allowed pointer-events-none border-slate-200 dark:border-slate-800"
                        )}
                      />
                    </div>
                  <label className="flex items-center gap-1 h-8 w-[92px] shrink-0 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2" title="Fee billed for this stop">
                    <span className="text-[10px] font-semibold text-slate-400">SAR</span>
                    <input
                      type="number"
                      min="0"
                      inputMode="decimal"
                      aria-label="Stop fee"
                      disabled={isRouteLocked || !handleUpdateSlotReturnIntermediateFee}
                      value={slot.returnIntermediateStopFees?.[rIdx] ?? ''}
                      onChange={(e) => handleUpdateSlotReturnIntermediateFee?.(slot.id, rIdx, e.target.value)}
                      placeholder="Fee"
                      className="min-w-0 flex-1 bg-transparent text-right text-xs font-semibold tabular-nums outline-none"
                    />
                  </label>
                    {handleRemoveSlotReturnIntermediate && !isRouteLocked && (
                      <button
                        type="button"
                        aria-label="Remove return stop"
                        onClick={() => handleRemoveSlotReturnIntermediate(slot.id, rIdx)}
                        className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
          </>
        )
      )}

      {showSchedule && (
        <div className="space-y-2">
          {highlightSchedule && (
            <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
              <ArrowDown className="w-3.5 h-3.5" /> Next: when does it pick up?
            </p>
          )}
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-sm font-bold text-slate-800 dark:text-slate-100">
              <Clock className="w-4 h-4 text-slate-400" /> When
            </span>
          </div>
          {/* SCHEDULE ROW: PICKUP → TRAVEL TIME → ARRIVAL */}
          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-2.5 items-end">
            {/* PICKUP */}
            <div id={`field-pickup-${slot.id}`} className="space-y-1 min-w-0">
              <label className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center justify-between h-4">
                <span className="flex items-center gap-1 truncate">
                  {isMonthly ? (
                    <>
                      <Clock className="w-3 h-3 text-emerald-600 shrink-0" /> PICKUP
                    </>
                  ) : (
                    <>
                      <Calendar className="w-3 h-3 text-emerald-600 shrink-0" /> PICKUP
                    </>
                  )}
                </span>
                {(fieldErrors?.[`pickup-${slot.id}`] || fieldErrors?.[`schedule-${slot.id}`]) && (
                  <span className="text-[9px] font-bold text-red-500 animate-pulse">Required</span>
                )}
                {!isMonthly && isPastSchedule && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 text-[9px] font-black border border-amber-200 dark:border-amber-900 shrink-0 animate-fade-in">
                    <Clock className="w-2.5 h-2.5 text-amber-600 dark:text-amber-400" /> Past Time
                  </span>
                )}
              </label>
              {isMonthly ? (
                <TimePicker
                  value={slot.pickupTime || ''}
                  onChange={(timeStr) => {
                    handleUpdateTripSlot(slot.id, {
                      pickupTime: timeStr,
                      ...(!timeStr ? { dropoffTime: '' } : {}),
                    });
                  }}
                  placeholder="Select pickup time..."
                  buttonClassName={cn(
                    "h-9 rounded-xl border-slate-200 bg-white shadow-2xs font-semibold text-xs text-slate-800 px-3 w-full",
                    (fieldErrors?.[`pickup-${slot.id}`] || fieldErrors?.[`schedule-${slot.id}`]) && "border-red-500 ring-2 ring-red-500/30 bg-red-50/20 text-red-900"
                  )}
                />
              ) : (
                <DateTimePicker
                  value={pickupIsoValue}
                  error={Boolean(fieldErrors?.[`pickup-${slot.id}`] || fieldErrors?.[`schedule-${slot.id}`])}
                  onChange={(isoStr) => {
                    if (!isoStr) {
                      handleUpdateTripSlot(slot.id, {
                        pickupTime: '',
                        dropoffTime: '',
                      });
                      return;
                    }
                    const [dPart, tPart] = isoStr.split('T');
                    const cleanTime = tPart ? tPart.substring(0, 5) : '';
                    handleUpdateTripSlot(slot.id, {
                      date: dPart,
                      pickupTime: cleanTime,
                      ...(!cleanTime ? { dropoffTime: '' } : {}),
                    });
                  }}
                  placeholder="Pick date & time..."
                  showPresets={false}
                  showRelativeBadge={false}
                  className="h-9 rounded-xl border-slate-200 bg-white shadow-2xs text-xs font-semibold"
                />
              )}
              {(fieldErrors?.[`pickup-${slot.id}`] || fieldErrors?.[`schedule-${slot.id}`]) && (
                <div className="flex items-center gap-1.5 mt-1 text-[11px] font-bold text-rose-600 dark:text-rose-400">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>Please select pickup time</span>
                </div>
              )}
            </div>
            <div className="hidden md:flex items-center justify-center pb-2">
              {slot.origin && slot.destination ? (
                <TransitTimeBadge
                  origin={slot.origin}
                  destination={slot.destination}
                  originLat={slot.originLat}
                  originLng={slot.originLng}
                  destinationLat={slot.destinationLat}
                  destinationLng={slot.destinationLng}
                  pickupDate={slot.date || slot.pickupDate}
                  pickupTime={slot.pickupTime || ''}
                  intermediateStops={(slot.intermediateLocations || []).map((name: string) => ({ name }))}
                  fixedDurationMinutes={dutyShiftMinutes(contractRateCategory)}
                  onAutoSetDropoffDateTime={(dDate, dTime, isOvernight, _estimate, stopOffsetsMinutes) => {
                    // Never overwrite an arrival the user set by hand, nor a saved trip's.
                    if (!autoFillArrival || slot.dropoffManual || isRouteLocked) return;
                    if (slot.pickupTime && slot.pickupTime.trim()) {
                      const fromDay = slot.date || slot.pickupDate || new Date().toISOString().slice(0, 10);
                      handleUpdateTripSlot(slot.id, {
                        dropoffDate: dDate,
                        dropoffTime: dTime,
                        isOvernight,
                        ...(isMonthly && isRoundTrip ? { dropoffDay: Math.max(0, daysBetween(fromDay, dDate)) } : {}),
                        // Planned time at each intermediate stop (see buildTripRows).
                        intermediateArrivalOffsets: stopOffsetsMinutes,
                      });
                    }
                  }}
                  compact
                />
              ) : (
                <span className="text-slate-300 dark:text-slate-600">→</span>
              )}
            </div>
            {/* ARRIVAL — filled from the travel time, editable */}
            <div id={`field-dropoff-${slot.id}`} className="space-y-1 min-w-0">
              <label className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center justify-between h-4">
                <span className="flex items-center gap-1 truncate">
                  {isMonthly ? (
                    <>
                      <Clock className="w-3 h-3 text-[#FA634E] shrink-0" /> {isRoundTrip ? 'OUTBOUND ARRIVAL' : 'ARRIVAL'}{arrivalBadge}
                    </>
                  ) : (
                    <>
                      <Calendar className="w-3 h-3 text-[#FA634E] shrink-0" /> {isRoundTrip ? 'OUTBOUND ARRIVAL' : 'ARRIVAL'}{arrivalBadge}
                    </>
                  )}
                </span>
                {(scheduleError || fieldErrors?.[`dropoff-${slot.id}`] || fieldErrors?.[`schedule-${slot.id}`]) && (
                  <span className="text-[9px] font-bold text-red-500 animate-pulse">Required</span>
                )}
              </label>
              {isMonthly ? (
                <div className="flex gap-1.5">
                  {isRoundTrip && (
                    <DaySelect
                      label="Outbound arrival day"
                      value={dropoffDayOffset(slot)}
                      onChange={(d) => handleUpdateTripSlot(slot.id, { dropoffDay: d, dropoffManual: true })}
                    />
                  )}
                  <TimePicker
                    value={slot.dropoffTime || ''}
                    onChange={(timeStr) => {
                      handleUpdateTripSlot(slot.id, {
                        dropoffTime: timeStr,
                        dropoffManual: Boolean(timeStr),
                      });
                    }}
                    placeholder="Select dropoff time..."
                    buttonClassName={cn(
                      "h-9 rounded-xl border-slate-200 bg-white shadow-2xs font-semibold text-xs text-slate-800 px-3 w-full",
                      (scheduleError || fieldErrors?.[`dropoff-${slot.id}`] || fieldErrors?.[`schedule-${slot.id}`]) && "border-red-500 ring-1 ring-red-500"
                    )}
                  />
                </div>
              ) : (
                <DateTimePicker
                  value={dropoffIsoValue}
                  minDate={pickupDateObj}
                  error={Boolean(scheduleError || fieldErrors?.[`dropoff-${slot.id}`] || fieldErrors?.[`schedule-${slot.id}`])}
                  onChange={(isoStr) => {
                    if (!isoStr) {
                      handleUpdateTripSlot(slot.id, { dropoffDate: '', dropoffTime: '', dropoffManual: false });
                      return;
                    }
                    const [dPart, tPart] = isoStr.split('T');
                    const cleanTime = tPart ? tPart.substring(0, 5) : '';
                    handleUpdateTripSlot(slot.id, { dropoffDate: dPart, dropoffTime: cleanTime, dropoffManual: true });
                  }}
                  placeholder="Pick date & time..."
                  showPresets={false}
                  showRelativeBadge={false}
                  className="h-9 rounded-xl border-slate-200 bg-white shadow-2xs text-xs font-semibold"
                />
              )}
              {(scheduleError || fieldErrors?.[`dropoff-${slot.id}`] || fieldErrors?.[`schedule-${slot.id}`]) && (
                <div className="flex items-center gap-1.5 mt-1 text-[11px] font-bold text-rose-600 dark:text-rose-400">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{scheduleError || (slot.dropoffTime ? 'Arrival must be after pickup.' : 'Choose an arrival time.')}</span>
                </div>
              )}
            </div>
          </div>
          {/* ROUND TRIP: RETURN LOADING → TRAVEL TIME → ARRIVAL HOME */}
          {isRoundTrip && (
            <div className="space-y-1.5 border-t border-dashed border-slate-200 dark:border-slate-700 pt-2.5">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-800 dark:text-amber-300">
                <RotateCcw className="w-3.5 h-3.5" /> Return · {returnFrom || 'destination'} → {returnTo || 'origin'}
              </span>
              <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-2.5 items-end">
                <div className="space-y-1 min-w-0">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">Return loading</span>
                  {isMonthly ? (
                    <div className="flex gap-1.5">
                      <DaySelect
                        label="Return loading day"
                        value={returnDays.pickup ?? dropoffDayOffset(slot)}
                        onChange={(d) => handleUpdateTripSlot(slot.id, { returnPickupDay: d })}
                      />
                      <TimePicker
                        value={slot.returnPickupTime || ''}
                        onChange={(t) =>
                          handleUpdateTripSlot(slot.id, {
                            returnPickupTime: t,
                            returnPickupDate: '',
                            ...(!t ? { returnPickupDay: undefined, returnDropoffTime: '', returnDropoffDay: undefined, returnDropoffManual: false } : {}),
                          })
                        }
                        placeholder="Loading time"
                        buttonClassName={cn(
                          "h-9 rounded-xl border-slate-200 bg-white shadow-2xs font-semibold text-xs text-slate-800 px-3 w-full",
                          fieldErrors?.[`returnPickup-${slot.id}`] && "border-red-500 ring-1 ring-red-500"
                        )}
                      />
                    </div>
                  ) : (
                    <DateTimePicker
                      value={returnPickupIso}
                      minDate={dropoffDateObj}
                      onChange={(iso) => {
                        if (!iso) {
                          handleUpdateTripSlot(slot.id, { returnPickupDate: '', returnPickupTime: '', returnDropoffDate: '', returnDropoffTime: '', returnDropoffManual: false });
                          return;
                        }
                        const [d, t] = iso.split('T');
                        handleUpdateTripSlot(slot.id, { returnPickupDate: d, returnPickupTime: (t || '').slice(0, 5) });
                      }}
                      placeholder="Loading date and time"
                      showPresets={false}
                      showRelativeBadge={false}
                      className="h-9 rounded-xl border-slate-200 bg-white shadow-2xs text-xs font-semibold"
                    />
                  )}
                </div>
                <div className="hidden md:flex items-center justify-center pb-2">
                  {returnFrom && returnTo ? (
                    <TransitTimeBadge
                      origin={returnFrom}
                      destination={returnTo}
                      // Monthly: no dates — time the drive from a fixed day and keep the day count.
                      pickupDate={isMonthly ? DAY_ANCHOR : slot.returnPickupDate || slot.dropoffDate || slot.date}
                      pickupTime={slot.returnPickupTime || ''}
                      onAutoSetDropoffDateTime={(dDate, dTime) => {
                        if (!autoFillArrival || slot.returnDropoffManual || isRouteLocked || !slot.returnPickupTime) return;
                        if (isMonthly) {
                          const loadDay = returnDays.pickup ?? dropoffDayOffset(slot);
                          handleUpdateTripSlot(slot.id, { returnDropoffDate: '', returnDropoffTime: dTime, returnDropoffDay: loadDay + Math.max(0, daysBetween(DAY_ANCHOR, dDate)) });
                          return;
                        }
                        handleUpdateTripSlot(slot.id, { returnDropoffDate: dDate, returnDropoffTime: dTime });
                      }}
                      compact
                    />
                  ) : (
                    <span className="text-slate-300 dark:text-slate-600">→</span>
                  )}
                </div>
                <div className="space-y-1 min-w-0">
                  <span className="flex items-center text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Arrival home
                    {autoFillArrival && slot.returnDropoffTime && (
                      <span
                        className={cn(
                          'ml-1.5 normal-case tracking-normal rounded-full px-1.5 py-px text-[10px] font-semibold',
                          slot.returnDropoffManual ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' : 'bg-orange-50 text-[#c2410c] dark:bg-orange-950/40 dark:text-orange-300'
                        )}
                      >
                        {slot.returnDropoffManual ? 'set by you' : 'auto'}
                      </span>
                    )}
                  </span>
                  {isMonthly ? (
                    <div className="flex gap-1.5">
                      <DaySelect
                        label="Arrival home day"
                        value={returnDays.arrival ?? returnDays.pickup ?? dropoffDayOffset(slot)}
                        onChange={(d) => handleUpdateTripSlot(slot.id, { returnDropoffDay: d, returnDropoffManual: true })}
                      />
                      <TimePicker
                        value={slot.returnDropoffTime || ''}
                        onChange={(t) => handleUpdateTripSlot(slot.id, { returnDropoffTime: t, returnDropoffDate: '', returnDropoffManual: Boolean(t) })}
                        placeholder="Arrival time"
                        buttonClassName={cn(
                          "h-9 rounded-xl border-slate-200 bg-white shadow-2xs font-semibold text-xs text-slate-800 px-3 w-full",
                          fieldErrors?.[`returnDropoff-${slot.id}`] && "border-red-500 ring-1 ring-red-500"
                        )}
                      />
                    </div>
                  ) : (
                    <DateTimePicker
                      value={returnDropoffIso}
                      minDate={returnPickupDateObj}
                      onChange={(iso) => {
                        if (!iso) {
                          handleUpdateTripSlot(slot.id, { returnDropoffDate: '', returnDropoffTime: '', returnDropoffManual: false });
                          return;
                        }
                        const [d, t] = iso.split('T');
                        handleUpdateTripSlot(slot.id, { returnDropoffDate: d, returnDropoffTime: (t || '').slice(0, 5), returnDropoffManual: true });
                      }}
                      placeholder="Arrival date and time"
                      showPresets={false}
                      showRelativeBadge={false}
                      className="h-9 rounded-xl border-slate-200 bg-white shadow-2xs text-xs font-semibold"
                    />
                  )}
                </div>
              </div>
              {(fieldErrors?.[`returnPickup-${slot.id}`] || fieldErrors?.[`returnDropoff-${slot.id}`]) && (
                <p className="flex items-center gap-1.5 text-[11px] font-bold text-rose-600 dark:text-rose-400">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {fieldErrors?.[`returnPickup-${slot.id}`] ? 'Return loading must be after the outbound arrival.' : 'Arrival home must be after return loading.'}
                </p>
              )}
              {!slot.returnPickupTime && (
                <p className="text-[11px] text-slate-400">Optional — set it to plan the way back and when the truck is free again.</p>
              )}
              {isMonthly && (
                <p className="text-[11px] text-slate-400">Day 1 is each operating day; Day 2 is the next day.</p>
              )}
            </div>
          )}

          {lastLaneTime && !slot.pickupTime && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Last time for this lane:{' '}
              <button
                type="button"
                onClick={() => handleUpdateTripSlot(slot.id, { date: lastLaneTime.date, pickupTime: lastLaneTime.time })}
                className="font-semibold text-[#c2410c] hover:underline cursor-pointer"
              >
                {lastLaneTime.label} — use
              </button>
            </p>
          )}
        </div>
      )}

      {showRoute && (
        <>
          <SetPinDialog
            open={!!pinning}
            onOpenChange={(o) => !o && setPinning(null)}
            placeName={pinning?.name || ''}
            lat={pinning?.lat ?? null}
            lng={pinning?.lng ?? null}
            footnote={pinning ? `Saved to ${pinning.name}, so every trip and quotation going there uses it.` : undefined}
            onSave={async (pin) => {
              applyPin(await pinCustomerLocation(queryClient, pinning!, pin));
            }}
          />
          <ConfirmModal
            isOpen={!!pendingChange}
            onClose={() => setPendingChange(null)}
            onConfirm={() => {
              if (pendingChange) handleSlotLocationChange(slot.id, pendingChange.field, pendingChange.locName, pendingChange.locObj);
              setPendingChange(null);
            }}
            title={`Change ${pendingChange?.field === 'origin' ? 'pickup' : 'delivery'} to ${pendingTo}?`}
            message={`${quotationLabel} is priced for ${pendingFrom}. Changing it removes ${quotationLabel} from this trip and you will set a new price. Only marking the exact gate of ${pendingFrom}? Keep it and use its "Pin needed" button instead.`}
            confirmLabel="Change and drop quotation"
            cancelLabel={`Keep ${quotationLabel}`}
          />
        </>
      )}
      </div>
    );
  };
