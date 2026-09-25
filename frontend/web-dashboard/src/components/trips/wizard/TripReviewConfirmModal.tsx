import React from 'react';
import {
  X,
  CheckCircle2,
  Building2,
  MapPin,
  Truck,
  Calendar,
  ArrowRight,
  ShieldCheck,
  Tag,
  AlertCircle,
  Clock,
  Scale,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { KbdBadge } from '@/components/ui/KbdBadge';
import DriverAvatar from '@/components/ui/DriverAvatar';
import { cn } from '@/lib/utils';
import { computeTripFinancials } from '@/utils/financialCalculations';

interface TripReviewConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isPending: boolean;
  contractCustomer: string;
  customers: any[];
  contractSlots: any[];
  contractBillingType: string;
  contractVehicleType: string;
  contractRateCategory?: string;
  selectedMonth?: string;
  selectedDates?: string[];
  assignmentType?: 'own' | 'third_party';
  masterDriver?: string;
  masterVehicle?: string;
  drivers?: any[];
  vehicles?: any[];
  dayAssignments?: Record<string, any>;
  thirdPartyProviderId?: string;
  thirdPartyDriverName?: string;
  thirdPartyVehiclePlate?: string;
  thirdPartyCost?: number | string;
  thirdPartyProviders?: any[];
}

const isUuidString = (str: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

const getPayloadCapacityDisplay = (vType: string) => {
  if (!vType) return '10 TON';
  const clean = vType.toUpperCase();
  if (clean.includes('3-4 TON') || clean.includes('3 TON') || clean.includes('4 TON')) return '3.5 TON';
  if (clean.includes('5 TON')) return '5 TON';
  if (clean.includes('10 TON')) return '10 TON';
  if (clean.includes('20 TON')) return '20 TON';
  if (clean.includes('25 TON')) return '25 TON';
  if (clean.includes('40 FEET') || clean.includes('CONTAINER')) return '30 TON';
  const match = clean.match(/(\d+(?:\.\d+)?\s*TON)/);
  if (match) return match[1];
  return vType;
};

export const TripReviewConfirmModal: React.FC<TripReviewConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  isPending,
  contractCustomer,
  customers = [],
  contractSlots = [],
  contractBillingType,
  contractVehicleType,
  contractRateCategory = '',
  selectedMonth,
  selectedDates = [],
  assignmentType = 'own',
  masterDriver = '',
  masterVehicle = '',
  drivers = [],
  vehicles = [],
  dayAssignments = {},
  thirdPartyProviderId = '',
  thirdPartyDriverName = '',
  thirdPartyVehiclePlate = '',
  thirdPartyCost = 0,
  thirdPartyProviders = [],
}) => {
  if (!isOpen) return null;

  // Resolve Customer Name & Object
  const customerObj = customers.find((c) => c.id === contractCustomer || c.name === contractCustomer);
  const customerName = customerObj?.name || contractCustomer || 'Unspecified Customer';

  // Resolve Primary Route Slot
  const primarySlot = contractSlots[0] || {};
  const originName = primarySlot.originName || primarySlot.origin || 'Origin';
  const destName = primarySlot.destinationName || primarySlot.destination || 'Destination';
  const intermediates: string[] = primarySlot.intermediates || [];
  const rateCategory = contractRateCategory || primarySlot.rateCategory || 'Single Trip';

  // Calculate Totals
  const totalOperatingDays = selectedDates.length || 1;
  const totalLanesCount = contractSlots.length || 1;
  const totalTripsCount = totalOperatingDays * totalLanesCount;
  const slotBillingTotal = contractSlots.reduce((sum, s) => sum + (Number(s.billingAmount) || 0), 0);
  const grandTotalBilling = slotBillingTotal * (contractBillingType === 'Monthly' ? 1 : totalOperatingDays);

  // Helper to safely resolve Driver Name & Avatar
  const resolveDriverDisplay = (dId: string) => {
    if (!dId || dId === 'unassigned')
      return { name: 'Assign Later', avatar: null, firstName: 'Assign', lastName: 'Later', phone: '', status: '' };
    const dObj = drivers.find((d) => d.id === dId || d.ref_id === dId || d.uuid === dId);
    if (dObj) {
      const fullName = `${dObj.first_name || ''} ${dObj.last_name || ''}`.trim() || dObj.name;
      if (fullName && !isUuidString(fullName)) {
        return {
          name: fullName,
          avatar: dObj.avatar_url || dObj.photo_url || dObj.avatarUrl || null,
          firstName: dObj.first_name || fullName.split(' ')[0],
          lastName: dObj.last_name || fullName.split(' ')[1] || '',
          phone: dObj.phone_primary || dObj.phone || '',
          status: dObj.status || 'Available',
        };
      }
    }
    if (!isUuidString(dId)) {
      return { name: dId, avatar: null, firstName: dId.split(' ')[0], lastName: dId.split(' ')[1] || '', phone: '', status: '' };
    }
    return { name: 'Assign Later', avatar: null, firstName: 'Assign', lastName: 'Later', phone: '', status: '' };
  };

  // Helper to safely resolve Vehicle Plate
  const resolveVehicleDisplay = (vId: string) => {
    if (!vId || vId === 'unassigned') return 'Vehicle: Assign Later';
    const vObj = vehicles.find((v) => v.id === vId || v.plate_number === vId || v.plateNumber === vId);
    if (vObj) {
      const plate = vObj.plate_number || vObj.plateNumber;
      if (plate && !isUuidString(plate)) return plate;
    }
    if (!isUuidString(vId)) return vId;
    return 'Vehicle: Assign Later';
  };

  // Resolve Primary Fleet Assignment
  const primaryDriverInfo = resolveDriverDisplay(masterDriver);
  const primaryVehiclePlate = resolveVehicleDisplay(masterVehicle);
  const thirdPartyProviderObj = thirdPartyProviders.find((p) => p.id === thirdPartyProviderId);

  // Resolve Roster / Rotation Pairs & Operating Days per Driver
  const rosterMap = new Map<string, { driverId: string; vehicleId: string; daysCount: number }>();
  const datesList = selectedDates && selectedDates.length > 0
    ? selectedDates
    : (Object.keys(dayAssignments).length > 0 ? Object.keys(dayAssignments) : ['default']);

  datesList.forEach((dStr) => {
    const asgn = dayAssignments[dStr];
    const dId = asgn?.driverId || masterDriver;
    const vId = asgn?.vehicleId || masterVehicle;
    if (dId || vId) {
      const key = `${dId || ''}_${vId || ''}`;
      const existing = rosterMap.get(key);
      if (existing) {
        existing.daysCount += 1;
      } else {
        rosterMap.set(key, { driverId: dId, vehicleId: vId, daysCount: 1 });
      }
    }
  });

  const rosterPairs = Array.from(rosterMap.values());

  // Resolve Exact Dispatch Date Display
  const dispatchDateDisplay = React.useMemo(() => {
    if (selectedDates && selectedDates.length > 0) {
      if (selectedDates.length === 1) {
        return selectedDates[0];
      }
      const sorted = [...selectedDates].sort();
      return `${sorted[0]} — ${sorted[sorted.length - 1]}`;
    }

    if (primarySlot?.date && primarySlot.date.length >= 10) {
      return primarySlot.date;
    }

    const dayKeys = Object.keys(dayAssignments).filter((k) => k !== 'default' && k.length >= 10);
    if (dayKeys.length === 1) {
      return dayKeys[0];
    } else if (dayKeys.length > 1) {
      const sorted = [...dayKeys].sort();
      return `${sorted[0]} — ${sorted[sorted.length - 1]}`;
    }

    if (selectedMonth && /^\d{4}-\d{2}$/.test(selectedMonth)) {
      const today = new Date().toISOString().slice(0, 10);
      if (today.startsWith(selectedMonth)) {
        return today;
      }
      return `${selectedMonth}-01`;
    }

    return new Date().toISOString().slice(0, 10);
  }, [selectedDates, primarySlot?.date, dayAssignments, selectedMonth]);

  // Validate schedule errors
  const scheduleErrors = React.useMemo(() => {
    const errors: string[] = [];
    contractSlots.forEach((slot, idx) => {
      const pDate = slot.date;
      const dDate = slot.dropoffDate || slot.date;
      if (!pDate || !dDate) {
        errors.push(`Slot #${idx + 1}: Missing start or drop-off date.`);
        return;
      }
      if (dDate < pDate) {
        errors.push(`Slot #${idx + 1}: Drop-off date (${dDate}) cannot be before start date (${pDate}).`);
        return;
      }
      const pTime = (slot.pickupTime || '08:00').split(' ')[0];
      const dTime = (slot.dropoffTime || '14:00').split(' ')[0];
      if (dDate === pDate && dTime <= pTime) {
        errors.push(`Slot #${idx + 1}: Drop-off time (${dTime}) must be after start time (${pTime}).`);
        return;
      }
      const pClean = pTime.length === 4 ? '0' + pTime : pTime;
      const dClean = dTime.length === 4 ? '0' + dTime : dTime;
      const pTs = new Date(`${pDate}T${pClean}`).getTime();
      const dTs = new Date(`${dDate}T${dClean}`).getTime();
      if (isNaN(pTs) || isNaN(dTs) || dTs <= pTs) {
        errors.push(`Slot #${idx + 1}: Drop-off date and time must be strictly later than start date and time.`);
      }
    });
    return errors;
  }, [contractSlots]);

  return (
    <div className="fixed inset-0 z-[999] bg-charcoal-strong/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 border-t-4 border-t-[#FA634E] rounded-2xl max-w-4xl w-full shadow-2xl overflow-hidden text-[#3E3C3D] dark:text-slate-200 animate-scale-in flex flex-col max-h-[90vh]">
        
        {/* MODAL HEADER */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-orange-50 dark:bg-orange-950/50 text-[#FA634E] flex items-center justify-center font-bold shrink-0 border border-orange-100 dark:border-orange-900/60">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-slate-900 dark:text-white leading-tight">
                  Confirm Trip Dispatch
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800">
                  Ready to Dispatch
                </span>
              </div>
              <p className="text-xs font-semibold text-slate-500 mt-0.5 flex items-center gap-1.5">
                <span>{totalTripsCount} Trip{totalTripsCount > 1 ? 's' : ''} Ready</span>
                <span>•</span>
                <span className="text-[#FA634E] font-bold">{contractBillingType} Contract</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            title="Close (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* MODAL BODY */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">

          {/* SCHEDULE ERROR BANNER */}
          {scheduleErrors.length > 0 && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-bold text-rose-700 dark:text-rose-400">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>Invalid Trip Schedule</span>
              </div>
              <ul className="list-disc list-inside text-[11px] text-rose-600 dark:text-rose-300">
                {scheduleErrors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {/* HERO ROUTE BANNER */}
          <div className="p-4.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2.5 py-0.5 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-mono text-[10px] font-extrabold">
                  {rateCategory}
                </span>
                <span className="px-2.5 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-extrabold text-[10px]">
                  {customerName}
                </span>
              </div>
              <span className="font-mono font-bold text-slate-500 text-[11px]">
                DISPATCH DATE: {dispatchDateDisplay}
              </span>
            </div>

            <div className="flex items-center justify-between gap-4 pt-1">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-3 h-3 rounded-full bg-emerald-500 shrink-0 ring-4 ring-emerald-100 dark:ring-emerald-950/40" />
                <span className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight truncate">
                  {originName}
                </span>
              </div>

              <div className="flex-1 flex items-center justify-center px-4">
                <div className="w-full flex items-center gap-2">
                  <div className="h-0.5 flex-1 bg-slate-300 dark:bg-slate-700" />
                  <ArrowRight className="w-5 h-5 text-[#FA634E] shrink-0" />
                  <div className="h-0.5 flex-1 bg-slate-300 dark:bg-slate-700" />
                </div>
              </div>

              <div className="flex items-center gap-2.5 min-w-0">
                <span className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight truncate">
                  {destName}
                </span>
                <span className="w-3 h-3 rounded-full bg-[#FA634E] shrink-0 ring-4 ring-orange-100 dark:ring-orange-950/40" />
              </div>
            </div>

            {intermediates.length > 0 && (
              <div className="flex items-center gap-1.5 pt-1 text-[11px] text-slate-500 border-t border-slate-200/60 dark:border-slate-700/60 mt-2">
                <span className="font-bold text-slate-400">Via Stops:</span>
                <div className="flex items-center gap-1 overflow-x-auto">
                  {intermediates.map((stop, idx) => (
                    <span key={idx} className="px-2 py-0.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-semibold text-slate-700 dark:text-slate-300 text-[10px]">
                      {stop}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 3-COLUMN DATA GRID */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-stretch">
            
            {/* COLUMN 1: ASSIGNED DRIVER & FLEET */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-2.5">
                  Assigned Driver & Fleet
                </span>

                {assignmentType === 'third_party' ? (
                  <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700 space-y-1">
                    <span className="font-bold text-xs text-slate-900 dark:text-white block">
                      {thirdPartyProviderObj?.name || '3PL Partner'}
                    </span>
                    <span className="font-mono text-[11px] text-slate-500 block">
                      {thirdPartyDriverName || 'Driver: TBD'} • {thirdPartyVehiclePlate || 'Plate: TBD'}
                    </span>
                  </div>
                ) : rosterPairs.length > 1 ? (
                  <div className="space-y-2 max-h-[140px] overflow-y-auto pr-1">
                    {rosterPairs.map((pair, idx) => {
                      const dInfo = resolveDriverDisplay(pair.driverId);
                      const vPlate = resolveVehicleDisplay(pair.vehicleId);
                      const singleDriverRate = parseFloat(String(primarySlot.driverPayout || primarySlot.driverTripCharge || primarySlot.tripCharges || 0)) || 0;
                      const driverPayoutTotal = singleDriverRate * pair.daysCount;

                      return (
                        <div key={idx} className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700">
                          <DriverAvatar
                            src={dInfo.avatar}
                            firstName={dInfo.firstName}
                            lastName={dInfo.lastName}
                            size="sm"
                          />
                          <div className="min-w-0 flex-1">
                            <span className="font-black text-xs text-slate-900 dark:text-white truncate block">
                              {dInfo.name}
                            </span>
                            <div className="flex items-center justify-between text-[10px] font-semibold text-slate-500 mt-0.5">
                              <span className="font-mono text-slate-700 dark:text-slate-300">{vPlate}</span>
                              <span className="text-[#FA634E] font-mono font-bold">
                                {pair.daysCount}d {singleDriverRate > 0 ? `(SAR ${driverPayoutTotal.toLocaleString()})` : ''}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (!masterDriver || masterDriver === 'unassigned') && (!masterVehicle || masterVehicle === 'unassigned') ? (
                  <div className="p-3 rounded-xl bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900 space-y-1">
                    <span className="font-bold text-amber-900 dark:text-amber-200 text-xs block">
                      Assign Later
                    </span>
                    <span className="text-[10px] text-amber-700 dark:text-amber-400 block">
                      Pending fleet assignment prior to dispatch.
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700">
                    <DriverAvatar
                      src={primaryDriverInfo.avatar}
                      firstName={primaryDriverInfo.firstName}
                      lastName={primaryDriverInfo.lastName}
                      size="md"
                    />
                    <div className="min-w-0 flex-1">
                      <span className="font-black text-xs text-slate-900 dark:text-white truncate block" title={primaryDriverInfo.name}>
                        {primaryDriverInfo.name}
                      </span>
                      <div className="flex items-center justify-between gap-1 text-[11px] font-semibold text-slate-500 mt-0.5">
                        <span className="font-mono text-slate-700 dark:text-slate-300 truncate">{primaryVehiclePlate}</span>
                        {rosterPairs.length > 0 && rosterPairs[0]?.daysCount && (
                          <span className="text-[#FA634E] font-mono font-bold shrink-0">
                            {rosterPairs[0].daysCount}d {primarySlot.driverPayout ? `(SAR ${(parseFloat(String(primarySlot.driverPayout)) * rosterPairs[0].daysCount).toLocaleString()})` : ''}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* COLUMN 2: CONTRACT & CAPACITY */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-2.5">
                  Contract & Capacity
                </span>

                <div className="space-y-3 text-xs">
                  <div>
                    <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">CONTRACT TYPE</span>
                    <span className="font-bold text-slate-900 dark:text-white block mt-0.5">
                      {contractBillingType ? `${contractBillingType} Contract` : 'Contract'}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">PAYLOAD CAPACITY</span>
                    <span className="font-bold text-slate-900 dark:text-white block mt-0.5 flex items-center gap-1.5">
                      <Scale className="w-3.5 h-3.5 text-[#FA634E]" />
                      {getPayloadCapacityDisplay(contractVehicleType || primarySlot.vehicleType || '')}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">DISPATCH SCHEDULE</span>
                    <span className="font-bold text-slate-900 dark:text-white block mt-0.5">
                      {dispatchDateDisplay} ({totalOperatingDays} Day{totalOperatingDays > 1 ? 's' : ''})
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* COLUMN 3: FINANCIAL SUMMARY */}
            {(() => {
              const fin = computeTripFinancials({
                customerBilling: grandTotalBilling,
                driverPayout: assignmentType === 'third_party' ? thirdPartyCost : primarySlot.driverPayout,
                is3PL: assignmentType === 'third_party',
                subcontractCost: thirdPartyCost,
                pricingBasis: contractBillingType === 'Monthly' ? 'Per Month' : 'Per Trip',
                selectedOperatingDays: totalOperatingDays,
              });

              const costValue = fin.perDriverPayout;
              const totalCost = fin.resolvedDriverPayout;
              const netMargin = fin.balanceMargin;
              const marginPct = fin.marginPercent;

              return (
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2.5">
                      <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                        Financial Summary
                      </span>
                      {costValue > 0 && (
                        <span
                          className={cn(
                            "text-[10px] font-extrabold px-2 py-0.5 rounded-full border flex items-center gap-1",
                            netMargin >= 0
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
                              : "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800"
                          )}
                          title="Net Margin Percentage"
                        >
                          <span className="font-sans text-[9px] uppercase tracking-wider opacity-80">Margin</span>
                          <span className="font-mono">{netMargin >= 0 ? `+${marginPct.toFixed(1)}%` : `${marginPct.toFixed(1)}%`}</span>
                        </span>
                      )}
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 font-medium">Customer Billing</span>
                        <span className="font-mono font-black text-slate-900 dark:text-white">
                          SAR {fin.resolvedBilling.toLocaleString()}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 font-medium">
                          {assignmentType === 'third_party' ? '3PL Cost' : 'Driver Payout'}
                        </span>
                        <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                          {costValue > 0 ? `SAR ${totalCost.toLocaleString()}` : '—'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2.5 border-t border-slate-200/80 dark:border-slate-700 flex items-center justify-between mt-3">
                    <span className="font-extrabold text-slate-900 dark:text-white text-xs">Net Margin</span>
                    <span
                      className={cn(
                        "font-mono font-black text-sm",
                        netMargin >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                      )}
                    >
                      {netMargin >= 0 ? '+' : ''}SAR {netMargin.toLocaleString()}
                    </span>
                  </div>
                </div>
              );
            })()}

          </div>

        </div>

        {/* FOOTER ACTIONS */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 bg-slate-50/80 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-800 shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="h-9 px-4 rounded-xl border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 cursor-pointer gap-1.5"
          >
            <span>Back to Edit</span>
            <KbdBadge keys="Esc" />
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={isPending || scheduleErrors.length > 0}
            className="h-9 px-5 rounded-xl bg-[#FA634E] hover:bg-[#d13d0d] text-white font-extrabold text-xs cursor-pointer shadow-2xs gap-1.5"
          >
            {isPending ? (
              <>Dispatching...</>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Confirm & Dispatch</span>
                <KbdBadge keys="Ctrl+Enter" />
              </>
            )}
          </Button>
        </div>

      </div>
    </div>
  );
};

export default TripReviewConfirmModal;
