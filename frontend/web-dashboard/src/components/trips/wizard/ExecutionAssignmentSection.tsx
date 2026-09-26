import React, { useState, useEffect } from 'react';
import { Truck, User, Users, ShieldAlert, Plus, Trash2, TrendingUp, Tag, AlertCircle } from 'lucide-react';
import { Combobox, ComboboxOption } from '@/components/ui/combobox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import DriverAvatar from '@/components/ui/DriverAvatar';
import { thirdPartyService, ProviderRateCard, Previous3PLDriver } from '@/services/thirdPartyService';
import VehicleCompatibilityBadge from '@/components/trips/shared/VehicleCompatibilityBadge';
import { getCompatibilityRuleForClass } from '@/utils/vehicleCompatibilityRegistry';
import { getVehicleTypeFromCapacity } from '@/hooks/useCreateTripForm';
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
  status?: string;
  awbNumber?: string;
  setAwbNumber?: (val: string) => void;
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
  status = '',
  awbNumber = '',
  setAwbNumber,
}) => {
  const [coDriver, setCoDriver] = useState('');
  const [showCoDriver, setShowCoDriver] = useState(false);
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
    <div className="p-3.5 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs space-y-2.5">
      <div className="flex items-center justify-between pb-1.5 border-b border-slate-100 dark:border-slate-800">
        <h4 className="text-xs font-black text-slate-800 dark:text-slate-100 uppercase tracking-wider flex items-center gap-1.5">
          <Truck className="w-3.5 h-3.5 text-[#FA634E] shrink-0" /> ASSIGNMENT
        </h4>
        {/* ASSIGNMENT CONTEXT BADGE */}
        <span
          className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
            assignmentType === 'third_party' || assignmentType === '3pl'
              ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800'
              : 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
          }`}
        >
          {assignmentType === 'third_party' || assignmentType === '3pl' ? '3PL Partner' : 'Own Fleet'}
        </span>
      </div>

      {isMonthly ? (
        <div className="space-y-2">
          {/* VEHICLE CLASS */}
          {setContractVehicleType && (
            <div className="space-y-1">
              <label className="text-[10px] font-extrabold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                VEHICLE CLASS
              </label>
              <Select value={contractVehicleType} onValueChange={setContractVehicleType}>
                <SelectTrigger className="h-8 rounded-lg border-slate-200 text-xs font-bold text-slate-800 dark:text-slate-100 shadow-2xs">
                  <SelectValue placeholder="Select Vehicle Class..." />
                </SelectTrigger>
                <SelectContent className="z-[9999]">
                  {['10 TON', '20 TON', '40 FEET', '3-4 TON', '5 TON'].map((vClass) => (
                    <SelectItem key={vClass} value={vClass} className="text-xs font-bold py-1.5 cursor-pointer">
                      {vClass}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="p-3 rounded-xl bg-purple-50/80 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-900/60 flex items-start gap-2.5">
            <div className="p-1.5 rounded-lg bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 shrink-0">
              <Users className="w-4 h-4" />
            </div>
            <div className="space-y-0.5">
              <span className="text-xs font-bold text-purple-950 dark:text-purple-200 block">
                Driver & Fleet Roster Assigned in Step 2
              </span>
              <span className="text-[11px] text-purple-700 dark:text-purple-300 font-medium block leading-snug">
                For monthly contract duty, driver rotation models, truck pairs, and operating calendar dates are configured in <strong>Step 2 (Operating Month & Days)</strong> after clicking Next.
              </span>
            </div>
          </div>
        </div>
      ) : assignmentType === 'own' ? (
        /* 2-COLUMN ASSIGNMENT WORKSPACE */
        <div id="field-driver-vehicle" className="grid grid-cols-1 md:grid-cols-12 gap-3 items-start">
          {/* LEFT COLUMN: SELECTION DROPDOWNS */}
          <div className="md:col-span-7 space-y-2 border-r-0 md:border-r border-slate-100 dark:border-slate-800 pr-0 md:pr-2.5">
            {fieldErrors?.['driverVehicle'] && (
              <div className="flex items-center gap-1.5 p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 dark:bg-rose-950/40 dark:border-rose-900 dark:text-rose-300 text-xs font-bold animate-fade-in">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>Please select an assignment choice: Driver & Vehicle or Assign Later.</span>
              </div>
            )}
            {/* AWB / REFERENCE NUMBER */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-extrabold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  AWB / REFERENCE NUMBER
                </label>
                <span className="text-[9px] font-bold text-slate-400">Optional</span>
              </div>
              <input
                type="text"
                disabled={isAssignmentLocked}
                value={awbNumber}
                onChange={(e) => setAwbNumber?.(e.target.value)}
                placeholder="Vehicle no. or client waybill no."
                className={cn(
                  "h-8 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 text-xs font-semibold w-full shadow-2xs bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100",
                  isAssignmentLocked && "bg-slate-100/90 dark:bg-slate-800/60 text-slate-400 cursor-not-allowed pointer-events-none border-slate-200 dark:border-slate-800"
                )}
              />
            </div>

            {/* VEHICLE CLASS */}
            {setContractVehicleType && (
              <div className="space-y-1">
                <label className="text-[10px] font-extrabold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  VEHICLE CLASS
                </label>
                <Select disabled={isAssignmentLocked} value={contractVehicleType} onValueChange={setContractVehicleType}>
                  <SelectTrigger className={cn(
                    "h-8 rounded-lg border-slate-200 text-xs font-bold text-slate-800 dark:text-slate-100 shadow-2xs",
                    isAssignmentLocked && "bg-slate-100/90 dark:bg-slate-800/60 text-slate-400 cursor-not-allowed pointer-events-none border-slate-200 dark:border-slate-800"
                  )}>
                    <SelectValue placeholder="Select Vehicle Class..." />
                  </SelectTrigger>
                  <SelectContent className="z-[9999]">
                    {['10 TON', '20 TON', '40 FEET', '3-4 TON', '5 TON'].map((vClass) => (
                      <SelectItem key={vClass} value={vClass} className="text-xs font-bold py-1.5 cursor-pointer">
                        {vClass}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* PRIMARY DRIVER SELECTION */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-extrabold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1">
                  <User className="w-3 h-3 text-emerald-600" /> PRIMARY DRIVER
                </label>
                {!isAssignmentLocked && (
                  (!masterDriver || masterDriver === 'unassigned') ? (
                    <span className="text-[9px] font-bold text-amber-700 bg-amber-50 dark:bg-amber-950/60 px-1.5 py-0.2 rounded border border-amber-200 dark:border-amber-900">
                      Assign Later
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleDriverChange('unassigned')}
                      className="text-[9px] font-bold text-slate-400 hover:text-amber-600 underline cursor-pointer"
                      title="Mark driver as assign later"
                    >
                      Assign Later
                    </button>
                  )
                )}
              </div>
              <Combobox
                options={driverOptions}
                value={masterDriver}
                onChange={handleDriverChange}
                disabled={isAssignmentLocked}
                placeholder="Select primary driver or assign later..."
                searchPlaceholder="Search driver name, phone..."
                triggerClassName={cn(
                  "h-8 rounded-lg border-slate-200 text-xs font-bold text-slate-800 dark:text-slate-100 shadow-2xs",
                  isAssignmentLocked && "bg-slate-100/90 dark:bg-slate-800/60 text-slate-400 cursor-not-allowed pointer-events-none border-slate-200 dark:border-slate-800"
                )}
              />
            </div>

            {/* VEHICLE */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-extrabold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1">
                  <Truck className="w-3 h-3 text-indigo-600" /> PRIMARY VEHICLE
                </label>
                {!isAssignmentLocked && (
                  (!masterVehicle || masterVehicle === 'unassigned') ? (
                    <span className="text-[9px] font-bold text-amber-700 bg-amber-50 dark:bg-amber-950/60 px-1.5 py-0.2 rounded border border-amber-200 dark:border-amber-900">
                      Assign Later
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleVehicleChange('unassigned')}
                      className="text-[9px] font-bold text-slate-400 hover:text-amber-600 underline cursor-pointer"
                      title="Mark vehicle as assign later"
                    >
                      Assign Later
                    </button>
                  )
                )}
              </div>
              <Combobox
                options={vehicleOptions}
                value={masterVehicle}
                onChange={handleVehicleChange}
                disabled={isAssignmentLocked}
                placeholder="Select primary vehicle or assign later..."
                searchPlaceholder="Search plate, asset code..."
                triggerClassName={cn(
                  "h-8 rounded-lg border-slate-200 text-xs font-bold text-slate-800 dark:text-slate-100 shadow-2xs",
                  isAssignmentLocked && "bg-slate-100/90 dark:bg-slate-800/60 text-slate-400 cursor-not-allowed pointer-events-none border-slate-200 dark:border-slate-800"
                )}
              />
              <VehicleCompatibilityBadge
                contractVehicleType={contractVehicleType}
                masterVehicle={masterVehicle}
                vehicles={vehicles}
                activeCompatibilityRule={getCompatibilityRuleForClass(contractVehicleType)}
                getVehicleTypeFromCapacity={getVehicleTypeFromCapacity}
              />
            </div>

            {/* OPTIONAL CO-DRIVER / RELIEVER */}
            {!isAssignmentLocked && (
              showCoDriver ? (
                <div className="space-y-1 p-2 rounded-lg bg-slate-50 border border-slate-200 dark:bg-slate-800 dark:border-slate-700">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-extrabold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                      CO-DRIVER / RELIEVER
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setCoDriver('');
                        setShowCoDriver(false);
                      }}
                      className="text-slate-400 hover:text-rose-600 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                  <Combobox
                    options={driverOptions.filter((d) => d.value !== masterDriver)}
                    value={coDriver}
                    onChange={setCoDriver}
                    placeholder="Select co-driver..."
                    searchPlaceholder="Search co-driver name..."
                    triggerClassName="h-8 rounded-lg border-slate-200 text-xs font-semibold shadow-2xs"
                  />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowCoDriver(true)}
                  className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 flex items-center gap-1 cursor-pointer pt-0.5"
                >
                  <Plus className="w-3 h-3" /> Add Co-Driver / Reliever
                </button>
              )
            )}
          </div>

          {/* RIGHT COLUMN: DYNAMIC DRIVER PROFILE SELECTION CARD */}
          <div className="md:col-span-5 flex flex-col justify-between pl-0 md:pl-0.5 transition-all duration-300 ease-in-out">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                {masterDriver ? (masterDriver === 'unassigned' ? 'ASSIGN LATER' : 'ASSIGNED DRIVER') : 'RECOMMENDED DRIVERS'}
              </span>
              {masterDriver && (
                <button
                  type="button"
                  onClick={() => handleDriverChange('')}
                  className="text-[9px] font-bold text-[#FA634E] hover:text-[#d13d0d] underline cursor-pointer transition-colors"
                >
                  Change Driver
                </button>
              )}
            </div>

            <div className="flex-1 flex flex-col justify-center items-center transition-all duration-300">
              {masterDriver ? (() => {
                // REFINED COMPACT DRIVER VIEW
                const selectedOpt = driverOptions.find((d) => d.value === masterDriver);
                const firstName = (selectedOpt as any)?.first_name || (selectedOpt as any)?.raw?.first_name || 'Assigned Driver';
                const lastName = (selectedOpt as any)?.last_name || (selectedOpt as any)?.raw?.last_name || '';
                const optDetailsStr = (selectedOpt as any)?.detailsStr || (selectedOpt as any)?.raw?.detailsStr || '';
                const avatarUrl = selectedOpt ? (
                  (selectedOpt as any).avatar_url ||
                  (selectedOpt as any).photo_url ||
                  (selectedOpt as any).profile_picture ||
                  (selectedOpt as any).avatarUrl ||
                  (selectedOpt as any).photoUrl ||
                  (selectedOpt as any).image_url ||
                  (selectedOpt as any).raw?.avatar_url ||
                  (selectedOpt as any).raw?.photo_url ||
                  (selectedOpt as any).raw?.profile_picture ||
                  (selectedOpt as any).raw?.avatarUrl ||
                  (selectedOpt as any).raw?.photoUrl ||
                  (selectedOpt as any).raw?.image_url ||
                  null
                ) : null;

                return (
                  <div className="w-full h-full min-h-[135px] py-3.5 px-3 rounded-xl bg-slate-50/90 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center text-center gap-2 shadow-2xs animate-fade-in transition-all">
                    <DriverAvatar
                      src={avatarUrl}
                      firstName={firstName}
                      lastName={lastName}
                      size="lg"
                      className="border-2 border-white dark:border-slate-800 shadow-xs mx-auto shrink-0"
                    />
                    <div className="w-full px-1 min-w-0">
                      <div className="text-sm font-black text-slate-900 dark:text-slate-100 truncate" title={`${firstName} ${lastName}`}>
                        {firstName} {lastName}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 font-semibold pt-0.5 leading-tight px-2">
                        {optDetailsStr || 'Truck: Unassigned'}
                      </div>
                    </div>
                  </div>
                );
              })() : (
                /* UNSELECTED STATE: TODAY MORNING FIRST PUSH DESIGN (CENTERED AVATAR, 2-LINE NAMES, DIVIDER LINE) */
                <div className="w-full flex-1 flex flex-col justify-between transition-all duration-300 animate-fade-in">
                  {(() => {
                    const listToDisplay = driverOptions.filter((d) => d.value !== 'unassigned').slice(0, 2);

                    if (listToDisplay.length === 0) {
                      return (
                        <div className="py-4 px-2 text-center text-xs text-slate-400 font-medium">
                          No drivers available
                        </div>
                      );
                    }

                    return listToDisplay.map((dOpt, idx) => {
                      const optLabelStr = typeof dOpt.label === 'string' ? dOpt.label : String(dOpt.label || '');
                      const rawName = (dOpt as any).first_name
                        ? `${(dOpt as any).first_name} ${(dOpt as any).last_name || ''}`.trim()
                        : optLabelStr.split('(')[0].trim() || 'Driver';
                      const nameParts = rawName.split(' ');
                      const firstName = (dOpt as any).first_name || nameParts[0] || rawName;
                      const lastName = (dOpt as any).last_name || nameParts.slice(1).join(' ') || '';

                      const optDetailsStr = (dOpt as any).detailsStr || (optLabelStr.includes('(') ? optLabelStr.split('(')[1].replace(')', '').trim() : '');
                      const avatarUrl =
                        (dOpt as any).avatar_url ||
                        (dOpt as any).photo_url ||
                        (dOpt as any).profile_picture ||
                        (dOpt as any).avatarUrl ||
                        (dOpt as any).photoUrl ||
                        (dOpt as any).image_url ||
                        (dOpt as any).raw?.avatar_url ||
                        (dOpt as any).raw?.photo_url ||
                        (dOpt as any).raw?.profile_picture ||
                        (dOpt as any).raw?.avatarUrl ||
                        (dOpt as any).raw?.photoUrl ||
                        (dOpt as any).raw?.image_url ||
                        null;
                      const isFirst = idx === 0;

                      return (
                        <button
                          key={dOpt.value || idx}
                          type="button"
                          onClick={() => handleDriverChange(dOpt.value)}
                          className={`w-full py-2 px-3 text-center transition-all duration-200 flex flex-col items-center justify-center cursor-pointer space-y-1 relative rounded-xl hover:bg-slate-50/70 dark:hover:bg-slate-800/40 text-slate-700 dark:text-slate-300 ${
                            isFirst ? 'border-b border-slate-200/80 dark:border-slate-800/80 pb-2 mb-1' : 'pt-1'
                          }`}
                        >
                          <DriverAvatar
                            src={avatarUrl}
                            firstName={firstName}
                            lastName={lastName}
                            size="md"
                            className="border border-slate-200 dark:border-slate-700 shadow-2xs mx-auto"
                          />

                          {/* FIRST NAME AND LAST NAME IN 2 SEPARATE LINES */}
                          <div className="text-xs font-black text-center leading-tight text-slate-900 dark:text-slate-100">
                            <div className="truncate max-w-full">{firstName}</div>
                            {lastName && <div className="truncate max-w-full font-medium text-[11px] text-slate-600 dark:text-slate-300">{lastName}</div>}
                          </div>

                          <div className="text-[10px] text-slate-500 font-medium leading-tight px-1 max-w-full">
                            {optDetailsStr || 'Truck: Unassigned'}
                          </div>
                        </button>
                      );
                    });
                  })()}
                </div>
              )}
            </div>
          </div>
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
              <input
                type="text"
                disabled={isAssignmentLocked}
                value={thirdPartyVehiclePlate}
                onChange={(e) => setThirdPartyVehiclePlate(e.target.value)}
                placeholder="Plate number or Assign Later..."
                className={cn(
                  "h-8 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 text-xs font-semibold w-full shadow-2xs bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100",
                  isAssignmentLocked && "bg-slate-100/90 dark:bg-slate-800/60 text-slate-400 cursor-not-allowed pointer-events-none border-slate-200 dark:border-slate-800"
                )}
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between min-h-[16px] mb-1 min-w-0">
                <label className="text-[10px] font-extrabold text-[#FA634E] uppercase tracking-wider truncate">
                  3PL COST (SAR) *
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
  );
};
