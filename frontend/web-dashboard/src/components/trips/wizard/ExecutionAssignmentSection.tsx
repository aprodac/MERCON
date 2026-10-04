import React, { useState, useEffect } from 'react';
import { Truck, User, Users, Plus, TrendingUp, Tag, AlertCircle, X, Check } from 'lucide-react';
import { Combobox, ComboboxOption } from '@/components/ui/combobox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import DriverAvatar from '@/components/ui/DriverAvatar';
import { CoDriverPaySplit, type PaySplitValue } from './CoDriverPaySplit';
import { FactChip, StatusTag, type DriverFacts } from './DriverPickerRow';
import { DISPATCH_RULES, truckClassOfVehicle, compareTruckClass, normalizeSaudiPlate } from '@mercon/shared-types';
import { thirdPartyService, ProviderRateCard, Previous3PLDriver } from '@/services/thirdPartyService';
import { cn } from '@/lib/utils';

interface ExecutionAssignmentSectionProps {
  assignmentType: 'own' | 'third_party' | '3pl';
  setAssignmentType: (type: 'own' | 'third_party') => void;
  masterVehicle: string;
  masterDriver: string;
  handleVehicleChange: (vId: string) => void;
  handleDriverChange: (dId: string) => void;
  vehicleOptions: ComboboxOption[];
  driverOptions: ComboboxOption[];
  thirdPartyProviderId: string;
  setThirdPartyProviderId: (id: string) => void;
  thirdPartyProviders: any[];
  thirdPartyVehiclePlate: string;
  setThirdPartyVehiclePlate: (plate: string) => void;
  thirdPartyDriverName: string;
  setThirdPartyDriverName: (name: string) => void;
  thirdPartyDriverPhone?: string;
  setThirdPartyDriverPhone?: (phone: string) => void;
  thirdPartyCost?: string;
  setThirdPartyCost?: (cost: string) => void;
  contractSlots?: any[];
  contractVehicleType?: string;
  setContractVehicleType?: (vType: string) => void;
  contractBillingType?: string;
  fieldErrors?: Record<string, boolean>;
  vehicles?: any[];
  isAssignmentLocked?: boolean;
  /** No price yet: the Own fleet / 3PL switch works, the fields below wait. */
  waitingForPrice?: boolean;
  /** The driver / partner is the next thing to fill. */
  highlight?: boolean;
  masterCoDriver?: string;
  setMasterCoDriver?: (id: string) => void;
  coDriverSplit?: PaySplitValue;
  setCoDriverSplit?: (split: PaySplitValue) => void;
  /** Lane driver payout per trip — shared 50/50 with a co-driver by default. */
  basePayout?: number;
  status?: string;
  awbNumber?: string;
  setAwbNumber?: (val: string) => void;
  /** Drivers / route picks still loading — skeleton rows instead of "No free drivers". */
  loadingDrivers?: boolean;
  loadingVehicles?: boolean;
}

export const ExecutionAssignmentSection: React.FC<ExecutionAssignmentSectionProps> = ({
  assignmentType,
  setAssignmentType,
  masterVehicle,
  masterDriver,
  handleVehicleChange,
  handleDriverChange,
  vehicleOptions,
  driverOptions,
  thirdPartyProviderId,
  setThirdPartyProviderId,
  thirdPartyProviders,
  thirdPartyVehiclePlate,
  setThirdPartyVehiclePlate,
  thirdPartyDriverName,
  setThirdPartyDriverName,
  thirdPartyDriverPhone = '',
  setThirdPartyDriverPhone,
  thirdPartyCost = '',
  setThirdPartyCost,
  contractSlots = [],
  contractVehicleType = '10 TON',
  setContractVehicleType,
  contractBillingType,
  fieldErrors = {},
  vehicles = [],
  isAssignmentLocked = false,
  waitingForPrice = false,
  highlight = false,
  masterCoDriver = '',
  setMasterCoDriver,
  coDriverSplit = {},
  setCoDriverSplit,
  basePayout = 0,
  status = '',
  awbNumber = '',
  setAwbNumber,
  loadingDrivers = false,
  loadingVehicles = false,
}) => {
  // The co-driver lives in the form (it was local here and never reached the saved trip).
  const [localCoDriver, setLocalCoDriver] = useState('');
  // The 3PL plate is checked once the operator leaves the field (or on submit), not on every key.
  const [plateTouched, setPlateTouched] = useState(false);
  const coDriver = setMasterCoDriver ? masterCoDriver : localCoDriver;
  const setCoDriver = (id: string) => (setMasterCoDriver ? setMasterCoDriver(id) : setLocalCoDriver(id));
  const [showCoDriverRaw, setShowCoDriver] = useState(false);
  const showCoDriver = showCoDriverRaw || Boolean(coDriver);
  const [matchedRate, setMatchedRate] = useState<ProviderRateCard | null>(null);

  const [previousDrivers, setPreviousDrivers] = useState<Previous3PLDriver[]>([]);
  const [isLoadingPreviousDrivers, setIsLoadingPreviousDrivers] = useState(false);
  const [driverInputMode, setDriverInputMode] = useState<'previous' | 'new'>('previous');
  const [selectedDriverIndex, setSelectedDriverIndex] = useState<string>('');

  useEffect(() => {
    if ((assignmentType === 'third_party' || assignmentType === '3pl') && thirdPartyProviderId) {
      setIsLoadingPreviousDrivers(true);
      thirdPartyService
        .getPreviousDrivers(thirdPartyProviderId)
        .then((drivers) => {
          setPreviousDrivers(drivers);
          if (drivers.length > 0) {
            setDriverInputMode('previous');
          } else {
            setDriverInputMode('new');
          }
        })
        .catch((err) => {
          console.warn('Failed to load previous 3PL drivers:', err);
          setPreviousDrivers([]);
          setDriverInputMode('new');
        })
        .finally(() => {
          setIsLoadingPreviousDrivers(false);
        });
    } else {
      setPreviousDrivers([]);
      setSelectedDriverIndex('');
    }
  }, [thirdPartyProviderId, assignmentType]);

  const handleSelectPreviousDriver = (indexStr: string) => {
    setSelectedDriverIndex(indexStr);
    const index = parseInt(indexStr, 10);
    if (!isNaN(index) && previousDrivers[index]) {
      const drv = previousDrivers[index];
      setThirdPartyDriverName(drv.driverName || '');
      setThirdPartyDriverPhone?.(drv.driverPhone || '');
      setThirdPartyVehiclePlate(drv.vehiclePlate || '');
    }
  };

  const handleSwitchToNewDriver = () => {
    setDriverInputMode('new');
    setSelectedDriverIndex('');
    setThirdPartyDriverName('');
    setThirdPartyDriverPhone?.('');
    setThirdPartyVehiclePlate('');
  };

  useEffect(() => {
    if (assignmentType !== 'third_party' && assignmentType !== '3pl') {
      setMatchedRate(null);
      return;
    }
    if (!thirdPartyProviderId) {
      setMatchedRate(null);
      return;
    }

    const primarySlot = contractSlots && contractSlots.length > 0 ? contractSlots[0] : null;
    const origin = primarySlot?.originLocationName || primarySlot?.origin || '';
    const destination = primarySlot?.destinationLocationName || primarySlot?.destination || '';
    const vehicleClass = contractVehicleType || '10 TON';
    const lineType = primarySlot?.contractRateCategory || 'Single Trip';
    const opType = primarySlot?.contractBillingType || '';
    const pricingBasis = opType?.toLowerCase().includes('month') ? 'Per Month' : 'Per Trip';

    thirdPartyService
      .matchRate({
        providerId: thirdPartyProviderId,
        origin,
        destination,
        vehicle_class: vehicleClass,
        line_type: lineType,
        operation_type: opType,
        pricing_basis: pricingBasis,
      })
      .then((matched) => {
        setMatchedRate(matched);
        if (matched && matched.cost !== undefined && matched.cost !== null) {
          if (!thirdPartyCost || thirdPartyCost === '0') {
            setThirdPartyCost?.(String(matched.cost));
          }
        }
      })
      .catch((err) => {
        console.warn('Provider rate matching error:', err);
        setMatchedRate(null);
      });
  }, [thirdPartyProviderId, contractSlots, contractVehicleType, assignmentType]);

  const isMonthly = contractBillingType?.toLowerCase() === 'monthly';
  const selectedDriverObj = driverOptions.find((d) => d.value === masterDriver);
  const selectedVehicleObj = vehicleOptions.find((v) => v.value === masterVehicle);

  return (
    <div
      id="section-driver"
      className={cn(
        'p-3.5 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs space-y-2.5 transition-shadow',
        highlight && 'ring-2 ring-amber-400/70 border-amber-300'
      )}
    >
      {highlight && (
        <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
          ↓ Next: {assignmentType === 'third_party' || assignmentType === '3pl' ? 'choose the 3PL partner and cost' : 'who drives?'}
        </p>
      )}
      <div className="flex items-center justify-between pb-1.5 border-b border-slate-100 dark:border-slate-800">
        <h4 className="text-xs font-black text-slate-800 dark:text-slate-100 uppercase tracking-wider flex items-center gap-1.5">
          <Truck className="w-3.5 h-3.5 text-[#FA634E] shrink-0" /> ASSIGNMENT
        </h4>
        {/* WHO RUNS THE TRIP: OWN FLEET OR A 3PL PARTNER */}
        {(() => {
          const is3pl = assignmentType === 'third_party' || assignmentType === '3pl';
          if (isAssignmentLocked) {
            return (
              <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                {is3pl ? '3PL partner' : 'Own fleet'}
              </span>
            );
          }
          return (
            <div role="radiogroup" aria-label="Run by" className="inline-flex rounded-full bg-slate-100 dark:bg-slate-800 p-0.5">
              {([['own', 'Own fleet'], ['third_party', '3PL']] as const).map(([val, text]) => {
                const on = val === 'third_party' ? is3pl : !is3pl;
                return (
                  <button
                    key={val}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => !on && setAssignmentType(val)}
                    className={cn(
                      'rounded-full px-3 py-0.5 text-[11px] font-semibold transition-colors cursor-pointer',
                      on
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs ring-1 ring-slate-200 dark:ring-slate-700'
                        : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                    )}
                  >
                    {text}
                  </button>
                );
              })}
            </div>
          );
        })()}
      </div>

      {waitingForPrice && (
        <p className="text-[11px] text-slate-500 dark:text-slate-400">Pick or define a quotation first to choose the driver and truck.</p>
      )}
      <div className={cn('transition-opacity duration-200', waitingForPrice && 'opacity-50 pointer-events-none select-none')} inert={waitingForPrice}>
      {isMonthly ? (
        <div className="space-y-2">
          {/* TRUCK CLASS — set by the quotation, shown here for reference */}
          {contractVehicleType && (
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              <span>Truck class</span>
              <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 font-semibold text-slate-700 dark:text-slate-200">{contractVehicleType}</span>
              <span>· from the price</span>
            </div>
          )}

          <div className="flex items-center gap-2.5 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 px-3 py-2.5">
            <Users className="w-4 h-4 text-slate-400 shrink-0" />
            <span className="text-xs text-slate-600 dark:text-slate-300">
              {assignmentType === 'third_party' || assignmentType === '3pl'
                ? 'Partner, plate and cost are set with the days on step 2.'
                : 'Drivers and trucks are set per day on step 2.'}
            </span>
          </div>
        </div>
      ) : assignmentType === 'own' ? (
        /* OWN FLEET — one column: top picks → pickers, or once chosen, the crew card */
        <div id="field-driver-vehicle" className="space-y-2.5">
          {fieldErrors?.['driverVehicle'] && (
            <div className="flex items-center gap-1.5 p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 dark:bg-rose-950/40 dark:border-rose-900 dark:text-rose-300 text-xs font-bold animate-fade-in">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>Choose a driver, or "Assign later".</span>
            </div>
          )}

          {(() => {
            const driverPicker = (
              <Combobox
                options={driverOptions}
                value={masterDriver}
                onChange={handleDriverChange}
                disabled={isAssignmentLocked}
                placeholder={loadingDrivers ? 'Loading drivers…' : 'Search all drivers'}
                searchPlaceholder="Name, phone or plate"
                popoverClassName="min-w-[380px]"
                triggerClassName={cn(
                  'h-9 rounded-lg border-slate-200 text-xs font-semibold text-slate-800 dark:text-slate-100 shadow-2xs',
                  isAssignmentLocked && 'bg-slate-100/90 dark:bg-slate-800/60 text-slate-400 cursor-not-allowed pointer-events-none'
                )}
              />
            );
            const truckPicker = (
              <Combobox
                options={vehicleOptions}
                value={masterVehicle}
                onChange={handleVehicleChange}
                disabled={isAssignmentLocked}
                placeholder={loadingVehicles ? 'Loading trucks…' : 'Choose a truck'}
                searchPlaceholder="Plate or asset code"
                popoverClassName="min-w-[340px]"
                triggerClassName={cn(
                  'h-9 rounded-lg border-slate-200 text-xs font-semibold text-slate-800 dark:text-slate-100 shadow-2xs',
                  isAssignmentLocked && 'bg-slate-100/90 dark:bg-slate-800/60 text-slate-400 cursor-not-allowed pointer-events-none'
                )}
              />
            );
            const truck: any = vehicles.find((v: any) => v.id === masterVehicle);
            const truckClass = truck ? truckClassOfVehicle({ capacity_kg: truck.capacity_kg, asset_type: truck.asset_type }) : '';
            const fit = truck && contractVehicleType ? compareTruckClass(truckClass, contractVehicleType) : null;
            const fitBadge =
              fit === 'exact' ? (
                <span className="shrink-0 rounded-full bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">Fits {contractVehicleType} ✓</span>
              ) : fit === 'bigger' ? (
                <span className="shrink-0 rounded-full bg-sky-50 dark:bg-sky-950/50 px-2 py-0.5 text-[11px] font-semibold text-sky-700 dark:text-sky-300">Bigger than {contractVehicleType}</span>
              ) : fit === 'smaller' ? (
                <span className="shrink-0 rounded-full bg-rose-50 dark:bg-rose-950/50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 dark:text-rose-300">Too small for {contractVehicleType}</span>
              ) : null;

            /* ── No driver yet: the best picks first, then search all ── */
            if (!masterDriver) {
              const picks = driverOptions
                .filter((d: any) => d.value !== 'unassigned' && !d.disabled && (d.groupKey ? ['best', 'other'].includes(d.groupKey) : true))
                .slice(0, 3) as any[];
              return (
                <>
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Top picks for this route</span>
                    {loadingDrivers ? (
                      <div className="space-y-1.5" aria-busy="true" aria-label="Finding the best drivers">
                        {[0, 1, 2].map((i) => (
                          <div key={i} className="flex items-center gap-2.5 rounded-xl border border-slate-200 dark:border-slate-700 px-2.5 py-2" style={{ opacity: 1 - i * 0.25 }}>
                            <div className="h-9 w-9 shrink-0 rounded-full bg-slate-200/80 dark:bg-slate-700/70 animate-pulse" />
                            <div className="min-w-0 flex-1 space-y-1.5">
                              <div className="h-3 w-2/5 rounded bg-slate-200/80 dark:bg-slate-700/70 animate-pulse" />
                              <div className="flex gap-1">
                                <div className="h-4 w-14 rounded-full bg-slate-100 dark:bg-slate-800 animate-pulse" />
                                <div className="h-4 w-24 rounded-full bg-slate-100 dark:bg-slate-800 animate-pulse" />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : picks.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 py-3 text-center text-xs text-slate-400">No free drivers for this trip — search below</div>
                    ) : (
                      picks.map((p) => {
                        const reasons = ((p.facts as DriverFacts | undefined)?.chips || [])
                          .slice()
                          .sort((a, b) => (a.tone === 'good' ? -1 : 0) - (b.tone === 'good' ? -1 : 0))
                          .slice(0, 3);
                        const name = `${p.first_name || ''} ${p.last_name || ''}`.trim();
                        return (
                          <button
                            key={p.value}
                            type="button"
                            disabled={isAssignmentLocked}
                            onClick={() => handleDriverChange(p.value)}
                            title={`Assign ${name}`}
                            className="group flex w-full items-center gap-2.5 rounded-xl border border-slate-200 dark:border-slate-700 px-2.5 py-2 text-left transition-colors hover:border-[#FA634E]/60 hover:bg-orange-50/40 dark:hover:bg-orange-950/20 cursor-pointer disabled:opacity-50"
                          >
                            <DriverAvatar src={p.avatar_url} firstName={p.first_name || ''} lastName={p.last_name || ''} size="md" className="shrink-0" />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[13px] font-semibold text-slate-900 dark:text-slate-100">{name}</div>
                              <div className="mt-0.5 flex flex-wrap gap-1">
                                {reasons.map((c) => <FactChip key={c.text} text={c.text} tone={c.tone} />)}
                              </div>
                            </div>
                            <span className="shrink-0 text-[11px] font-semibold text-slate-400 group-hover:text-[#FA634E]">Assign ›</span>
                          </button>
                        );
                      })
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <span className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400"><User className="w-3 h-3" /> Or any driver</span>
                      {driverPicker}
                    </div>
                    <div className="space-y-1">
                      <span className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400"><Truck className="w-3 h-3" /> Truck</span>
                      {truckPicker}
                    </div>
                  </div>
                </>
              );
            }

            /* ── Assign later ── */
            if (masterDriver === 'unassigned') {
              return (
                <div className="flex items-center justify-between gap-2 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 px-3 py-3">
                  <span className="text-xs text-slate-600 dark:text-slate-300">⏳ Assign later — the trip is saved without a driver.</span>
                  {!isAssignmentLocked && (
                    <button type="button" onClick={() => handleDriverChange('')} className="text-xs font-semibold text-[#FA634E] hover:text-[#d13d0d] cursor-pointer">
                      Choose a driver
                    </button>
                  )}
                </div>
              );
            }

            /* ── Driver chosen: the crew card, full width ── */
            const opt = driverOptions.find((d) => d.value === masterDriver) as any;
            const facts: DriverFacts | undefined = opt?.facts;
            const name = `${opt?.first_name || ''} ${opt?.last_name || ''}`.trim() || 'Driver';
            const phone = opt?.raw?.phone_primary as string | undefined;
            // The chosen truck has its own row, so the driver's usual-truck chip is left out.
            const whyChips = (facts?.chips || []).filter((c) => !/(TON|FEET)|^No truck$/.test(c.text));
            return (
              <div className="space-y-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40 p-3 animate-fade-in">
                <div className="flex items-start gap-3">
                  <DriverAvatar src={opt?.avatar_url} firstName={opt?.first_name || ''} lastName={opt?.last_name || ''} size="lg" className="shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold leading-snug text-slate-900 dark:text-slate-100">{name}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                      {phone && (
                        <a href={`tel:${phone}`} className="text-xs text-slate-500 hover:text-[#c2410c]">
                          {phone}
                        </a>
                      )}
                      {facts && <StatusTag label={facts.statusLabel} isFree={facts.isFree} />}
                    </div>
                  </div>
                  {!isAssignmentLocked && (
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <button type="button" onClick={() => handleDriverChange('')} className="text-xs font-semibold text-[#FA634E] hover:text-[#d13d0d] cursor-pointer">
                        Change
                      </button>
                      <button type="button" onClick={() => handleDriverChange('unassigned')} className="text-[11px] text-slate-400 hover:text-amber-600 cursor-pointer">
                        Assign later
                      </button>
                    </div>
                  )}
                </div>

                {whyChips.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {whyChips.map((c) => <FactChip key={c.text} text={c.text} tone={c.tone} />)}
                  </div>
                )}

                <div className="space-y-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      <Truck className="w-3.5 h-3.5" /> Truck
                      {truck && <span className="font-normal">· {[truckClass, truck.asset_type].filter(Boolean).join(' · ')}</span>}
                    </span>
                    {fitBadge}
                  </div>
                  {truckPicker}
                </div>

                {/* CO-DRIVER */}
                {!isAssignmentLocked && (
                  showCoDriver ? (
                    <div className="space-y-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Co-driver / reliever</span>
                        <button
                          type="button"
                          onClick={() => {
                            setCoDriver('');
                            setShowCoDriver(false);
                          }}
                          className="flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-rose-600 cursor-pointer"
                        >
                          <X className="w-3 h-3" /> Remove
                        </button>
                      </div>
                      <Combobox
                        options={driverOptions.filter((d) => d.value !== masterDriver && d.value !== 'unassigned')}
                        value={coDriver}
                        onChange={setCoDriver}
                        placeholder="Choose a co-driver"
                        searchPlaceholder="Name, phone or plate"
                        triggerClassName="h-9 rounded-lg border-slate-200 text-xs font-semibold shadow-2xs"
                        popoverClassName="min-w-[380px]"
                      />
                      {coDriver && setCoDriverSplit && (
                        <CoDriverPaySplit total={basePayout} value={coDriverSplit} onChange={(v) => setCoDriverSplit?.(v)} />
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowCoDriver(true)}
                      className="flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add co-driver / reliever
                    </button>
                  )
                )}

                <p className="text-[11px] leading-snug text-slate-400">
                  Checked: {DISPATCH_RULES.minRestHours} h rest before pickup · {DISPATCH_RULES.bufferHours} h between trips · licence · truck size
                </p>
              </div>
            );
          })()}

          {/* AWB / REFERENCE NUMBER */}
          <label className="block space-y-1">
            <span className="flex items-center justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              AWB / reference number <span className="font-normal text-slate-400">Optional</span>
            </span>
            <input
              type="text"
              disabled={isAssignmentLocked}
              value={awbNumber}
              onChange={(e) => setAwbNumber?.(e.target.value)}
              placeholder="Client waybill or reference"
              className={cn(
                'h-9 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 text-xs font-semibold w-full shadow-2xs bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-[#FA634E]/30',
                isAssignmentLocked && 'bg-slate-100/90 dark:bg-slate-800/60 text-slate-400 cursor-not-allowed pointer-events-none'
              )}
            />
          </label>
        </div>
      ) : (
        /* 3PL PARTNER ASSIGNMENT WORKSPACE WITH PROFITABILITY CARD */
        <div className="space-y-2.5">
          {/* 3PL PROVIDER */}
          <div id="field-3pl-partner" className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-extrabold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                3PL PROVIDER *
              </label>
              {!isAssignmentLocked && (
                thirdPartyProviderId === 'unassigned' ? (
                  <span className="text-[9px] font-bold text-amber-700 bg-amber-50 dark:bg-amber-950/60 px-1.5 py-0.2 rounded border border-amber-200 dark:border-amber-900">
                    Assign Later
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setThirdPartyProviderId('unassigned');
                      if (!thirdPartyDriverName) setThirdPartyDriverName('Assign Later');
                      if (!thirdPartyVehiclePlate) setThirdPartyVehiclePlate('Assign Later');
                    }}
                    className="text-[9px] font-bold text-slate-400 hover:text-amber-600 underline cursor-pointer"
                    title="Mark 3PL Provider as assign later"
                  >
                    Assign Later
                  </button>
                )
              )}
            </div>
            <Select disabled={isAssignmentLocked} value={thirdPartyProviderId} onValueChange={setThirdPartyProviderId}>
              <SelectTrigger className={cn(
                "h-8 rounded-lg border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-100 shadow-2xs",
                isAssignmentLocked && "bg-slate-100/90 dark:bg-slate-800/60 text-slate-400 cursor-not-allowed pointer-events-none border-slate-200 dark:border-slate-800"
              )}>
                <SelectValue placeholder="Select 3PL Partner or Assign Later..." />
              </SelectTrigger>
              <SelectContent className="z-[9999]">
                <SelectItem value="unassigned" className="text-xs font-bold cursor-pointer text-amber-700 dark:text-amber-400 font-extrabold">
                  Assign Later (TBD)
                </SelectItem>
                {thirdPartyProviders.map((p) => (
                  <SelectItem key={p.id} value={p.id} className="text-xs font-bold cursor-pointer">
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldErrors?.['thirdPartyProvider'] && (
              <div className="flex items-center gap-1.5 mt-1 text-[11px] font-bold text-rose-600 dark:text-rose-400">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>Please select 3PL logistics partner</span>
              </div>
            )}
          </div>

          {/* 3PL PREVIOUS DRIVER HISTORY (IF AVAILABLE FOR SELECTED PROVIDER) */}
          {previousDrivers.length > 0 && (
            <div className="space-y-1 bg-slate-50/70 dark:bg-slate-800/40 p-2 rounded-xl border border-slate-200/80 dark:border-slate-800">
              <label className="text-[10px] font-extrabold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <User className="w-3 h-3 text-indigo-600" /> SELECT PREVIOUS DRIVER
              </label>

              <Select disabled={isAssignmentLocked} value={selectedDriverIndex} onValueChange={handleSelectPreviousDriver}>
                <SelectTrigger className={cn(
                  "h-8 rounded-lg border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-100 shadow-2xs bg-white dark:bg-slate-900",
                  isAssignmentLocked && "bg-slate-100/90 dark:bg-slate-800/60 text-slate-400 cursor-not-allowed pointer-events-none border-slate-200 dark:border-slate-800"
                )}>
                  <SelectValue placeholder={isLoadingPreviousDrivers ? 'Loading history...' : 'Select Previous Driver...'} />
                </SelectTrigger>
                <SelectContent className="z-[9999]">
                  {previousDrivers.map((drv, idx) => {
                    const labelParts = [
                      drv.driverName,
                      drv.driverPhone,
                      drv.vehiclePlate,
                    ].filter(Boolean);
                    const label = labelParts.join(' — ');
                    return (
                      <SelectItem key={idx} value={String(idx)} className="text-xs font-bold cursor-pointer">
                        {label}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* DRIVER NAME, DRIVER PHONE, VEHICLE PLATE & 3PL COST IN A 2-COLUMN GRID */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
            <div className="space-y-1">
              <div className="flex items-center justify-between min-h-[16px] mb-1">
                <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                  3PL DRIVER NAME
                </label>
                {!isAssignmentLocked && (
                  thirdPartyDriverName === 'Assign Later' ? (
                    <span className="text-[9px] font-bold text-amber-700 bg-amber-50 dark:bg-amber-950/60 px-1.5 py-0.2 rounded border border-amber-200 dark:border-amber-900">
                      Assign Later
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setThirdPartyDriverName('Assign Later')}
                      className="text-[9px] font-bold text-slate-400 hover:text-amber-600 underline cursor-pointer"
                    >
                      Assign Later
                    </button>
                  )
                )}
              </div>
              <input
                type="text"
                disabled={isAssignmentLocked}
                value={thirdPartyDriverName}
                onChange={(e) => setThirdPartyDriverName(e.target.value)}
                placeholder="Driver name or Assign Later..."
                className={cn(
                  "h-8 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 text-xs font-semibold w-full shadow-2xs bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100",
                  isAssignmentLocked && "bg-slate-100/90 dark:bg-slate-800/60 text-slate-400 cursor-not-allowed pointer-events-none border-slate-200 dark:border-slate-800"
                )}
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between min-h-[16px] mb-1">
                <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                  3PL DRIVER PHONE
                </label>
              </div>
              <input
                type="text"
                disabled={isAssignmentLocked}
                value={thirdPartyDriverPhone}
                onChange={(e) => setThirdPartyDriverPhone?.(e.target.value)}
                placeholder="Driver phone..."
                className={cn(
                  "h-8 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 text-xs font-semibold w-full shadow-2xs bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100",
                  isAssignmentLocked && "bg-slate-100/90 dark:bg-slate-800/60 text-slate-400 cursor-not-allowed pointer-events-none border-slate-200 dark:border-slate-800"
                )}
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between min-h-[16px] mb-1">
                <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                  3PL VEHICLE PLATE
                </label>
                {!isAssignmentLocked && (
                  thirdPartyVehiclePlate === 'Assign Later' ? (
                    <span className="text-[9px] font-bold text-amber-700 bg-amber-50 dark:bg-amber-950/60 px-1.5 py-0.2 rounded border border-amber-200 dark:border-amber-900">
                      Assign Later
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setThirdPartyVehiclePlate('Assign Later')}
                      className="text-[9px] font-bold text-slate-400 hover:text-amber-600 underline cursor-pointer"
                    >
                      Assign Later
                    </button>
                  )
                )}
              </div>
              {(() => {
                const typed = thirdPartyVehiclePlate.trim();
                const checkable = typed !== '' && !/^assign later$/i.test(typed);
                const check = checkable ? normalizeSaudiPlate(typed) : null;
                const showError = Boolean(check && !check.ok && (plateTouched || fieldErrors?.['thirdPartyVehiclePlate']));
                return (
                  <>
                    <div className="relative">
                      <input
                        type="text"
                        id="third-party-vehicle-plate"
                        disabled={isAssignmentLocked}
                        value={thirdPartyVehiclePlate}
                        onChange={(e) => setThirdPartyVehiclePlate(e.target.value)}
                        onBlur={() => {
                          setPlateTouched(true);
                          // "dra 6484" → "DRA-6484", the way plates are kept everywhere else.
                          if (check?.ok && check.plate !== typed) setThirdPartyVehiclePlate(check.plate);
                        }}
                        placeholder="DRA-6484 or Assign Later"
                        aria-invalid={showError}
                        aria-describedby={showError ? 'third-party-vehicle-plate-error' : undefined}
                        className={cn(
                          "h-8 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 pr-7 text-xs font-semibold uppercase w-full shadow-2xs bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100",
                          showError && "border-rose-400 ring-2 ring-rose-400/20",
                          isAssignmentLocked && "bg-slate-100/90 dark:bg-slate-800/60 text-slate-400 cursor-not-allowed pointer-events-none border-slate-200 dark:border-slate-800"
                        )}
                      />
                      {check?.ok && <Check className="absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-emerald-600" aria-hidden />}
                    </div>
                    {showError && check && !check.ok && (
                      <p id="third-party-vehicle-plate-error" className="text-[11px] font-medium text-rose-600 dark:text-rose-400">{check.reason}</p>
                    )}
                  </>
                );
              })()}
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between min-h-[16px] mb-1 min-w-0">
                <label className="text-[10px] font-extrabold text-[#FA634E] uppercase tracking-wider truncate">
                  3PL COST PER TRIP (SAR) *
                </label>
                {!isAssignmentLocked && matchedRate && (
                  <button
                    type="button"
                    onClick={() => setThirdPartyCost?.(String(matchedRate.cost))}
                    className="text-[9px] font-extrabold text-purple-700 bg-purple-50 dark:bg-purple-950/60 dark:text-purple-300 px-1.5 py-0.2 rounded border border-purple-200 dark:border-purple-800 cursor-pointer hover:bg-purple-100 flex items-center gap-1 shrink-0"
                    title="Click to auto-fill suggested baseline rate card cost"
                  >
                    <Tag className="w-2.5 h-2.5 text-purple-600" /> Rate: SAR {Number(matchedRate.cost).toLocaleString()}
                  </button>
                )}
              </div>
              <div id="field-3pl-cost" className="relative">
                <input
                  type="number"
                  disabled={isAssignmentLocked}
                  min="0"
                  step="1"
                  value={thirdPartyCost}
                  onChange={(e) => setThirdPartyCost?.(e.target.value)}
                  placeholder="0"
                  className={cn(
                    "h-8 rounded-lg border pl-2.5 pr-8 text-xs font-mono font-black w-full shadow-2xs bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-[#FA634E]",
                    fieldErrors?.['thirdPartyCost']
                      ? "border-red-500 ring-2 ring-red-500/30 bg-red-50/20 dark:bg-red-950/20"
                      : "border-slate-200 dark:border-slate-700",
                    isAssignmentLocked && "bg-slate-100/90 dark:bg-slate-800/60 text-slate-400 cursor-not-allowed pointer-events-none border-slate-200 dark:border-slate-800"
                  )}
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">SAR</span>
              </div>
              {fieldErrors?.['thirdPartyCost'] && (
                <div className="flex items-center gap-1.5 mt-1 text-[11px] font-bold text-rose-600 dark:text-rose-400">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>Please enter 3PL cost</span>
                </div>
              )}
            </div>
          </div>


          {/* REAL-TIME 3PL PROFITABILITY TRACKER CARD */}
          {(() => {
            const billingAmountNum = contractSlots?.reduce((acc, s) => acc + (parseFloat(s.billingAmount) || 0), 0) || 0;
            const costNum = parseFloat(thirdPartyCost || '0') || 0;
            const marginNum = billingAmountNum - costNum;
            const marginPct = billingAmountNum > 0 ? (marginNum / billingAmountNum) * 100 : 0;

            const isPositive = marginNum >= 0;
            const isHigh = marginPct >= 20;
            const isMedium = marginPct >= 0 && marginPct < 20;

            return (
              <div className="p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-1.5 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1">
                    <TrendingUp className="w-3 h-3 text-[#FA634E]" /> 3PL REAL-TIME PROFITABILITY
                  </span>
                  <span
                    className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${
                      isHigh
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                        : isMedium
                        ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
                        : 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800'
                    }`}
                  >
                    {isPositive ? `+${marginPct.toFixed(1)}% Margin` : `${marginPct.toFixed(1)}% Loss`}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-200/60 dark:border-slate-700/60 text-center">
                  <div className="bg-white dark:bg-slate-900 p-1.5 rounded-lg border border-slate-200/60 dark:border-slate-800">
                    <span className="text-[9px] font-extrabold text-slate-400 uppercase block">Billing</span>
                    <span className="text-xs font-mono font-black text-slate-800 dark:text-slate-100">
                      SAR {billingAmountNum.toLocaleString()}
                    </span>
                  </div>

                  <div className="bg-white dark:bg-slate-900 p-1.5 rounded-lg border border-slate-200/60 dark:border-slate-800">
                    <span className="text-[9px] font-extrabold text-slate-400 uppercase block">3PL Cost</span>
                    <span className="text-xs font-mono font-black text-slate-800 dark:text-slate-100">
                      SAR {costNum.toLocaleString()}
                    </span>
                  </div>

                  <div className={`p-1.5 rounded-lg border ${
                    isHigh
                      ? 'bg-emerald-50/50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800'
                      : isMedium
                      ? 'bg-amber-50/50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800'
                      : 'bg-rose-50/50 border-rose-200 dark:bg-rose-950/30 dark:border-rose-800'
                  }`}>
                    <span className="text-[9px] font-extrabold text-slate-400 uppercase block">Net Margin</span>
                    <span className={`text-xs font-mono font-black ${
                      isPositive ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'
                    }`}>
                      {isPositive ? '+' : ''}SAR {marginNum.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}
      </div>
    </div>
  );
};
