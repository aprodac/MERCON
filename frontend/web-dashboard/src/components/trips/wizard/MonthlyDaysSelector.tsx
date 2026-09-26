import React, { useState, useMemo, useEffect } from 'react';
import { Calendar, Check, X, User, Truck, Repeat, RotateCcw, Building2, ChevronDown, Plus, Trash2, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Combobox, ComboboxOption } from '@/components/ui/combobox';
import { shiftMonth, monthOptions } from '@/components/trips/monthly/monthlyBoardUtils';
import { normalizeVehicleClass } from '@/utils/taxonomyRegistry';
import DriverAvatar from '@/components/ui/DriverAvatar';

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
  const month = parseInt(monthStr, 10) - 1; // 0-indexed

  if (isNaN(year) || isNaN(month)) return [];

  const date = new Date(year, month, 1);
  const result: MonthDateItem[] = [];

  while (date.getMonth() === month) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;

    const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
    const dayNumber = date.getDate();
    const dayOfWeek = date.getDay();

    result.push({ dateStr, dayNumber, dayName, dayOfWeek });
    date.setDate(date.getDate() + 1);
  }

  return result;
}

interface MonthlyDaysSelectorProps {
  selectedMonth: string;
  onChangeSelectedMonth: (monthKey: string) => void;
  selectedDates: string[];
  setSelectedDates: React.Dispatch<React.SetStateAction<string[]>>;
  contractSlotsCount?: number;
  masterDriver?: string;
  masterCoDriver?: string;
  setMasterCoDriver?: (val: string) => void;
  masterVehicle?: string;
  handleDriverChange?: (val: string) => string | null | void;
  handleVehicleChange?: (val: string) => void;
  driverOptions?: ComboboxOption[];
  vehicleOptions?: ComboboxOption[];
  drivers?: any[];
  vehicles?: any[];
  dayAssignments?: Record<string, { driverId: string; vehicleId: string; coDriverId?: string; driverPayoutOverride?: number; coDriverPayoutOverride?: number }>;
  setDayAssignments?: React.Dispatch<React.SetStateAction<Record<string, { driverId: string; vehicleId: string; coDriverId?: string; driverPayoutOverride?: number; coDriverPayoutOverride?: number }>>>;
  assignmentType?: 'own' | 'third_party';
  setAssignmentType?: (type: 'own' | 'third_party') => void;
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
  setContractVehicleType?: (vType: string) => void;
}

export const MonthlyDaysSelector: React.FC<MonthlyDaysSelectorProps> = ({
  selectedMonth,
  onChangeSelectedMonth,
  selectedDates,
  setSelectedDates,
  contractSlotsCount = 1,
  masterDriver = '',
  masterCoDriver = '',
  setMasterCoDriver,
  masterVehicle = '',
  handleDriverChange,
  handleVehicleChange,
  driverOptions = [],
  vehicleOptions = [],
  drivers = [],
  vehicles = [],
  dayAssignments = {},
  setDayAssignments,
  assignmentType = 'own',
  setAssignmentType,
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
  contractVehicleType = '10 TON',
  setContractVehicleType,
}) => {
  const [showCoDriver, setShowCoDriver] = useState(false);
  const monthDates = useMemo(() => getMonthDates(selectedMonth), [selectedMonth]);

  // Strategy Mode: 'single' vs 'rotation'
  const [strategyMode, setStrategyMode] = useState<'single' | 'rotation'>('single');
  const [rotationCount, setRotationCount] = useState<2 | 3 | 4>(2);
  const [isRosterExpanded, setIsRosterExpanded] = useState(true);

  const [rotationDrivers, setRotationDrivers] = useState<string[]>([
    masterDriver || (driverOptions[0]?.value as string) || '',
    (driverOptions[1]?.value as string) || (driverOptions[0]?.value as string) || '',
    (driverOptions[2]?.value as string) || (driverOptions[0]?.value as string) || '',
    (driverOptions[3]?.value as string) || (driverOptions[0]?.value as string) || '',
  ]);
  const [rotationVehicles, setRotationVehicles] = useState<string[]>([
    masterVehicle || (vehicleOptions[0]?.value as string) || '',
    (vehicleOptions[1]?.value as string) || masterVehicle || '',
    (vehicleOptions[2]?.value as string) || masterVehicle || '',
    (vehicleOptions[3]?.value as string) || masterVehicle || '',
  ]);

  // Sync primary driver/vehicle when master values change
  useEffect(() => {
    if (masterDriver && rotationDrivers[0] !== masterDriver) {
      setRotationDrivers((prev) => [masterDriver, prev[1], prev[2], prev[3]]);
    }
    if (masterVehicle && rotationVehicles[0] !== masterVehicle) {
      setRotationVehicles((prev) => {
        const nextV = [masterVehicle, prev[1], prev[2], prev[3]];
        applyAssignmentStrategy(strategyMode, rotationCount, rotationDrivers, nextV);
        return nextV;
      });
    }

  }, [masterDriver, masterVehicle, rotationVehicles, vehicles]);

  // Helper to fetch full driver object
  const getDriverObject = (dId: string) => {
    if (!dId) return null;
    const obj = drivers.find((d) => d.id === dId || d.uuid === dId);
    const opt = driverOptions.find((o) => o.value === dId);
    const labelStr = typeof opt?.label === 'string' ? opt.label : String(opt?.label || '');
    const cleanName = labelStr.split('(')[0].trim() || 'Driver';

    return {
      id: dId,
      name: obj ? `${obj.first_name || ''} ${obj.last_name || ''}`.trim() || cleanName : cleanName,
      phone: obj?.phone || obj?.mobile || obj?.phone_number || 'N/A',
      avatar: obj?.avatar_url || obj?.photo_url || obj?.profile_photo || obj?.image_url,
      firstName: obj?.first_name || cleanName.split(' ')[0],
      lastName: obj?.last_name || cleanName.split(' ')[1] || '',
    };
  };

  // Helper to apply current rotation / single strategy across all operating dates
  const applyAssignmentStrategy = (
    mode: 'single' | 'rotation',
    count: 2 | 3 | 4,
    dList: string[],
    vList: string[]
  ) => {
    if (!setDayAssignments || selectedDates.length === 0) return;
    const newAssignments: Record<string, { driverId: string; vehicleId: string }> = {};

    if (mode === 'single') {
      const pDriver = dList[0] || masterDriver;
      const pVehicle = vList[0] || masterVehicle;
      selectedDates.forEach((dateStr) => {
        newAssignments[dateStr] = {
          driverId: pDriver,
          vehicleId: pVehicle,
        };
      });
    } else {
      const activeDrivers = dList.slice(0, count);
      const activeVehicles = vList.slice(0, count);
      selectedDates.forEach((dateStr, idx) => {
        const assignedD = activeDrivers[idx % count] || masterDriver;
        const assignedV = activeVehicles[idx % count] || masterVehicle;
        newAssignments[dateStr] = {
          driverId: assignedD,
          vehicleId: assignedV,
        };
      });
    }

    setDayAssignments(newAssignments);
  };

  // Switch Strategy
  const handleStrategyChange = (mode: 'single' | 'rotation', count?: 2 | 3 | 4) => {
    setStrategyMode(mode);
    const nextCount = count || rotationCount;
    if (count) setRotationCount(count);
    applyAssignmentStrategy(mode, nextCount, rotationDrivers, rotationVehicles);
  };

  const getVehicleClassFromVeh = (v: any): string => {
    if (!v) return '10 TON';
    if (v.capacity_kg && v.capacity_kg > 0) {
      const tons = v.capacity_kg / 1000;
      if (tons <= 4) return '3-4 TON';
      if (tons <= 5) return '5 TON';
      if (tons <= 10) return '10 TON';
      if (tons <= 20) return '20 TON';
      return '40 FEET';
    }
    return normalizeVehicleClass(v.asset_type || v.vehicle_class || v.class || v.type);
  };

  // Update specific driver in rotation array
  const handleUpdateRotationDriver = (index: number, newDriverId: string) => {
    const nextDrivers = [...rotationDrivers];
    nextDrivers[index] = newDriverId;
    setRotationDrivers(nextDrivers);

    const nextVehicles = [...rotationVehicles];

    if (index === 0 && handleDriverChange) {
      const autoVehId = handleDriverChange(newDriverId);
      if (autoVehId && autoVehId !== 'unassigned') {
        nextVehicles[0] = autoVehId;
        setRotationVehicles(nextVehicles);
      }
    } else if (newDriverId && newDriverId !== 'unassigned') {
      const selD = drivers.find((d) => d.id === newDriverId);
      let vId = selD?.assignedVehicleId || (selD?.assignedVehicle as any)?.id || (selD as any)?.assigned_vehicle_id;
      if (!vId) {
        const vAssigned = vehicles.find((v: any) => v.assignedDriverId === newDriverId || v.assigned_driver_id === newDriverId || (v.assignedDriver && v.assignedDriver.id === newDriverId));
        if (vAssigned) vId = vAssigned.id;
      }
      if (vId) {
        nextVehicles[index] = vId;
        setRotationVehicles(nextVehicles);
      }
    }

    applyAssignmentStrategy(strategyMode, rotationCount, nextDrivers, nextVehicles);
  };

  // Update specific vehicle in rotation array
  const handleUpdateRotationVehicle = (index: number, newVehicleId: string) => {
    const nextVehicles = [...rotationVehicles];
    nextVehicles[index] = newVehicleId;
    setRotationVehicles(nextVehicles);

    if (index === 0 && handleVehicleChange) {
      handleVehicleChange(newVehicleId);
    }

    const nextDrivers = [...rotationDrivers];
    if (newVehicleId && newVehicleId !== 'unassigned') {
      const selVeh = vehicles.find((v: any) => v.id === newVehicleId);
      if (selVeh) {
        // If no driver assigned for this slot yet, auto-select vehicle's default driver
        if (!nextDrivers[index] || nextDrivers[index] === 'unassigned') {
          const defaultDriverId = selVeh.assignedDriverId || selVeh.assigned_driver_id || (selVeh.assignedDriver && selVeh.assignedDriver.id);
          if (defaultDriverId) {
            nextDrivers[index] = defaultDriverId;
            setRotationDrivers(nextDrivers);
            if (index === 0 && handleDriverChange) {
              handleDriverChange(defaultDriverId);
            }
          }
        }
      }
    }

    applyAssignmentStrategy(strategyMode, rotationCount, nextDrivers, nextVehicles);
  };

  // Toggle date selection
  const handleToggleDate = (dateStr: string) => {
    setSelectedDates((prev) => {
      if (prev.includes(dateStr)) {
        return prev.filter((d) => d !== dateStr);
      } else {
        return [...prev, dateStr].sort();
      }
    });
  };

  // Select quick presets
  const handleSelectPreset = (preset: 'weekdays' | 'mwf' | 'daily' | 'clear') => {
    if (preset === 'clear') {
      setSelectedDates([]);
      return;
    }
    if (preset === 'daily') {
      setSelectedDates(monthDates.map((d) => d.dateStr));
      return;
    }

    const filtered = monthDates
      .filter((d) => {
        const day = d.dayOfWeek;
        if (preset === 'weekdays') {
          return day >= 0 && day <= 4;
        }
        if (preset === 'mwf') {
          return day === 1 || day === 3 || day === 5;
        }
        return false;
      })
      .map((d) => d.dateStr);

    setSelectedDates(filtered);
  };

  // Calculate override count
  const overrideCount = useMemo(() => {
    let count = 0;
    selectedDates.forEach((dStr) => {
      const assign = dayAssignments[dStr];
      if (assign) {
        if ((assign.driverId && assign.driverId !== masterDriver) || (assign.vehicleId && assign.vehicleId !== masterVehicle)) {
          count++;
        }
      }
    });
    return count;
  }, [selectedDates, dayAssignments, masterDriver, masterVehicle]);

  // Reset all overrides to active strategy defaults
  const handleResetAllOverrides = () => {
    applyAssignmentStrategy(strategyMode, rotationCount, rotationDrivers, rotationVehicles);
  };

  return (
    <div className="w-full space-y-4 text-[#3E3C3D]">
      {/* TWO-COLUMN SPLIT LAYOUT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* LEFT COLUMN: DATE SELECTION CALENDAR (5/12) */}
        <div className="lg:col-span-5 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-3">
          {/* Header & Month Switcher */}
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800 gap-2">
            <h4 className="text-xs font-black text-slate-900 dark:text-slate-100 uppercase tracking-wider flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-[#FA634E]" />
              <span>Operating Days</span>
              <span className="text-[#FA634E] font-extrabold">({selectedDates.length})</span>
            </h4>

            {/* Month Switcher */}
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onChangeSelectedMonth(shiftMonth(selectedMonth, -1))}
                className="h-7 w-7 p-0 rounded-lg text-xs font-bold hover:bg-orange-50 hover:text-[#FA634E]"
                title="Previous Month"
              >
                ‹
              </Button>
              <select
                value={selectedMonth}
                onChange={(e) => onChangeSelectedMonth(e.target.value)}
                className="text-xs font-bold text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-1 rounded-lg text-center cursor-pointer hover:border-[#FA634E] focus:outline-none"
              >
                {monthOptions(selectedMonth, 12, 6).map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onChangeSelectedMonth(shiftMonth(selectedMonth, 1))}
                className="h-7 w-7 p-0 rounded-lg text-xs font-bold hover:bg-orange-50 hover:text-[#FA634E]"
                title="Next Month"
              >
                ›
              </Button>
            </div>
          </div>

          {/* Quick Presets Row */}
          <div className="flex items-center gap-1 flex-wrap bg-slate-50 dark:bg-slate-800/60 p-1.5 rounded-xl border border-slate-200/80 dark:border-slate-700">
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider pr-1">Presets:</span>
            <button
              type="button"
              onClick={() => handleSelectPreset('weekdays')}
              className="px-2 py-0.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-[#FA634E] text-[10px] font-bold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
            >
              Sun–Thu (KSA)
            </button>
            <button
              type="button"
              onClick={() => handleSelectPreset('mwf')}
              className="px-2 py-0.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-[#FA634E] text-[10px] font-bold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
            >
              Mon, Wed, Fri
            </button>
            <button
              type="button"
              onClick={() => handleSelectPreset('daily')}
              className="px-2 py-0.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-[#FA634E] text-[10px] font-bold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
            >
              All Days
            </button>
            <button
              type="button"
              onClick={() => handleSelectPreset('clear')}
              className="px-2 py-0.5 rounded-lg bg-white dark:bg-slate-800 border border-rose-200 text-[10px] font-bold text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
            >
              Clear
            </button>
          </div>

          {/* Clean 7-Column Calendar Grid */}
          <div className="space-y-1">
            <div className="grid grid-cols-7 gap-1 text-center">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                <div key={d} className="text-[10px] font-extrabold text-slate-400 uppercase py-0.5">
                  {d}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: monthDates[0]?.dayOfWeek || 0 }).map((_, i) => (
                <div key={`pad-${i}`} className="h-9 rounded-lg opacity-0 pointer-events-none" />
              ))}

              {monthDates.map((item) => {
                const isSelected = selectedDates.includes(item.dateStr);
                const assign = dayAssignments[item.dateStr];
                const hasOverride = !!assign && (
                  (assign.driverId && assign.driverId !== masterDriver) ||
                  (assign.vehicleId && assign.vehicleId !== masterVehicle)
                );

                return (
                  <button
                    key={item.dateStr}
                    type="button"
                    onClick={() => handleToggleDate(item.dateStr)}
                    className={`h-9 rounded-lg border px-1 py-0.5 text-center flex flex-col items-center justify-between transition-all cursor-pointer relative ${
                      isSelected
                        ? 'border-[#FA634E] bg-orange-50/80 dark:bg-orange-950/40 text-[#FA634E] font-bold shadow-2xs ring-1 ring-[#FA634E]/40'
                        : 'border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full text-[10px] px-0.5 leading-none">
                      <span className="font-black">{item.dayNumber}</span>
                      {isSelected && <Check className="w-2.5 h-2.5 text-[#FA634E]" />}
                    </div>
                    <div className="flex items-center justify-between w-full px-0.5 text-[8px] text-slate-400 leading-none">
                      <span>{item.dayName}</span>
                      {hasOverride && isSelected && (
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" title="Custom override" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Calendar Summary Footer */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
            <span className="text-slate-500 font-medium">Selected Calculation:</span>
            <span className="font-black text-slate-900 dark:text-slate-100">
              {selectedDates.length} days × {contractSlotsCount} slot = <strong className="text-[#FA634E] font-black">{selectedDates.length * contractSlotsCount} Trips</strong>
            </span>
          </div>
        </div>

        {/* RIGHT COLUMN: UNIFIED FLEET ASSIGNMENT & MULTI-DRIVER WORKSPACE (7/12) */}
        <div className="lg:col-span-7 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-3">
          
          {/* TOP TOOLBAR: FLEET MODE & STRATEGY SELECTOR */}
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800 gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-black text-slate-900 dark:text-slate-100 uppercase tracking-wider flex items-center gap-1.5">
                <Truck className="w-4 h-4 text-[#FA634E]" />
                <span>Fleet Assignment & Driver Roster</span>
              </h4>
            </div>

            {/* ASSIGNMENT CONTEXT BADGE */}
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                assignmentType === 'third_party'
                  ? 'bg-purple-100 text-purple-700 border border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800'
                  : 'bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
              }`}
            >
              {assignmentType === 'third_party' ? '3PL Partner' : 'Own Fleet'}
            </span>
          </div>

          {/* ROTATION MODEL TOOLBAR */}
          {assignmentType === 'own' && (
            <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700 flex items-center justify-between gap-2 flex-wrap">
              <div className="flex-1"></div>

              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                  ROTATION MODEL:
                </span>
                <div className="flex items-center gap-1 flex-wrap">
                  <button
                    type="button"
                    onClick={() => handleStrategyChange('single')}
                    className={`px-2 py-0.5 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                      strategyMode === 'single'
                        ? 'border-[#FA634E] bg-white dark:bg-slate-900 text-[#FA634E] shadow-2xs font-extrabold'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:border-slate-300'
                    }`}
                  >
                    Single Pair
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStrategyChange('rotation', 2)}
                    className={`px-2 py-0.5 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                      strategyMode === 'rotation' && rotationCount === 2
                        ? 'border-[#FA634E] bg-white dark:bg-slate-900 text-[#FA634E] shadow-2xs font-extrabold'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:border-slate-300'
                    }`}
                  >
                    2-Driver Rotation
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStrategyChange('rotation', 3)}
                    className={`px-2 py-0.5 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                      strategyMode === 'rotation' && rotationCount === 3
                        ? 'border-[#FA634E] bg-white dark:bg-slate-900 text-[#FA634E] shadow-2xs font-extrabold'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:border-slate-300'
                    }`}
                  >
                    3-Driver Rotation
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStrategyChange('rotation', 4)}
                    className={`px-2 py-0.5 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                      strategyMode === 'rotation' && rotationCount === 4
                        ? 'border-[#FA634E] bg-white dark:bg-slate-900 text-[#FA634E] shadow-2xs font-extrabold'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:border-slate-300'
                    }`}
                  >
                    4-Driver Rotation
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ULTRA-SLEEK COMPACT PAIR CARDS GRID (1, 2, 3, or 4 CARDS SIDE-BY-SIDE) */}
          {assignmentType === 'own' && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                  {strategyMode === 'single'
                    ? 'ASSIGNED DRIVER & TRUCK PAIR'
                    : `ROTATING DRIVER & TRUCK PAIRS (${rotationCount} CARDS)`}
                </span>
                {overrideCount > 0 && (
                  <button
                    type="button"
                    onClick={handleResetAllOverrides}
                    className="text-[10px] font-bold text-rose-600 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" /> Reset Overrides
                  </button>
                )}
              </div>

              {/* PAIR CARDS GRID */}
              <div
                className={`grid gap-2.5 ${
                  strategyMode === 'single'
                    ? 'grid-cols-1'
                    : rotationCount === 2
                    ? 'grid-cols-1 sm:grid-cols-2'
                    : rotationCount === 3
                    ? 'grid-cols-1 sm:grid-cols-3'
                    : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
                }`}
              >
                {(strategyMode === 'single' ? [rotationDrivers[0] || masterDriver] : rotationDrivers.slice(0, rotationCount)).map(
                  (dId, idx) => {
                    const profile = getDriverObject(dId);
                    const vId = rotationVehicles[idx] || masterVehicle;
                    const dutyDaysCount = selectedDates.filter((_, dIdx) =>
                      strategyMode === 'single' ? true : dIdx % rotationCount === idx
                    ).length;

                    return (
                      <div
                        key={idx}
                        className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs space-y-2"
                      >
                        {/* Slot Badge & Duty Days */}
                        <div className="flex items-center justify-between gap-2 text-[10px]">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-black uppercase px-2 py-0.5 rounded-md bg-orange-100 text-[#FA634E] dark:bg-orange-950/60 dark:text-orange-300 shrink-0 tracking-wider">
                              {strategyMode === 'single' ? 'Primary Pair' : `Pair ${idx + 1}`}
                            </span>
                            {idx === 0 && (
                              <div
                                className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shrink-0 select-none"
                                title="Vehicle class is automatically locked to the selected Rate Card / Quotation"
                              >
                                <span className="text-[9px] font-extrabold text-slate-500 uppercase tracking-wider">CLASS:</span>
                                <span className="text-[10px] font-black text-[#FA634E] dark:text-orange-400">
                                  {contractVehicleType || '10 TON'}
                                </span>
                              </div>
                            )}
                          </div>
                          <span className="font-black text-slate-500 shrink-0">{dutyDaysCount} Days</span>
                        </div>

                        {/* Compact Inline Avatar + Selects */}
                        <div className="flex items-center gap-2">
                          {profile && profile.id ? (
                            <DriverAvatar
                              src={profile.avatar}
                              firstName={profile.firstName}
                              lastName={profile.lastName}
                              size="sm"
                            />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 text-xs font-bold shrink-0">
                              ?
                            </div>
                          )}

                          <div className="flex-1 space-y-1 min-w-0">
                            <Combobox
                              options={driverOptions}
                              value={dId}
                              onChange={(val) => handleUpdateRotationDriver(idx, val)}
                              placeholder={`Driver ${idx + 1}...`}
                              className="h-7 text-xs font-bold"
                            />
                            <Combobox
                              options={vehicleOptions}
                              value={vId}
                              onChange={(val) => handleUpdateRotationVehicle(idx, val)}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  }
                )}
              </div>
            </div>
          )}

          {/* 3PL PROVIDER SELECTION WORKSPACE */}
          {assignmentType === 'third_party' && (
            <div className="p-3.5 rounded-xl bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900 space-y-3">
              <h5 className="text-xs font-black text-purple-950 dark:text-purple-200 uppercase tracking-wider flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-purple-600" />
                <span>3PL Provider Configuration</span>
              </h5>
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 items-start">
                <div>
                  <div className="flex items-center justify-between min-h-[16px] mb-1">
                    <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">
                      3PL Partner
                    </label>
                    {thirdPartyProviderId === 'unassigned' ? (
                      <span className="text-[9px] font-bold text-amber-700 bg-amber-50 dark:bg-amber-950/60 px-1 py-0.2 rounded border border-amber-200 dark:border-amber-900">
                        Assign Later
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setThirdPartyProviderId?.('unassigned');
                          if (!thirdPartyDriverName) setThirdPartyDriverName?.('Assign Later');
                          if (!thirdPartyVehiclePlate) setThirdPartyVehiclePlate?.('Assign Later');
                        }}
                        className="text-[9px] font-bold text-slate-400 hover:text-amber-600 underline cursor-pointer"
                      >
                        Assign Later
                      </button>
                    )}
                  </div>
                  <select
                    value={thirdPartyProviderId}
                    onChange={(e) => setThirdPartyProviderId?.(e.target.value)}
                    className="w-full h-8 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 cursor-pointer"
                  >
                    <option value="">Select Provider...</option>
                    <option value="unassigned" className="font-bold text-amber-600">Assign Later (TBD)</option>
                    {thirdPartyProviders.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between min-h-[16px] mb-1">
                    <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">
                      Provider Driver Name
                    </label>
                    {thirdPartyDriverName === 'Assign Later' ? (
                      <span className="text-[9px] font-bold text-amber-700 bg-amber-50 dark:bg-amber-950/60 px-1 py-0.2 rounded border border-amber-200 dark:border-amber-900">
                        Assign Later
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setThirdPartyDriverName?.('Assign Later')}
                        className="text-[9px] font-bold text-slate-400 hover:text-amber-600 underline cursor-pointer"
                      >
                        Assign Later
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={thirdPartyDriverName}
                    onChange={(e) => setThirdPartyDriverName?.(e.target.value)}
                    placeholder="Driver Name or Assign Later..."
                    className="w-full h-8 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between min-h-[16px] mb-1">
                    <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">
                      Provider Driver Phone
                    </label>
                  </div>
                  <input
                    type="text"
                    value={thirdPartyDriverPhone}
                    onChange={(e) => setThirdPartyDriverPhone?.(e.target.value)}
                    placeholder="Driver Phone..."
                    className="w-full h-8 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between min-h-[16px] mb-1">
                    <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">
                      Provider Truck Plate
                    </label>
                    {thirdPartyVehiclePlate === 'Assign Later' ? (
                      <span className="text-[9px] font-bold text-amber-700 bg-amber-50 dark:bg-amber-950/60 px-1 py-0.2 rounded border border-amber-200 dark:border-amber-900">
                        Assign Later
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setThirdPartyVehiclePlate?.('Assign Later')}
                        className="text-[9px] font-bold text-slate-400 hover:text-amber-600 underline cursor-pointer"
                      >
                        Assign Later
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={thirdPartyVehiclePlate}
                    onChange={(e) => setThirdPartyVehiclePlate?.(e.target.value)}
                    placeholder="Vehicle Plate or Assign Later..."
                    className="w-full h-8 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-extrabold text-[#FA634E] uppercase tracking-wider block mb-1">
                    3PL Cost (SAR)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={thirdPartyCost}
                      onChange={(e) => setThirdPartyCost?.(e.target.value)}
                      placeholder="0"
                      className="w-full h-8 text-xs font-mono font-black rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 pl-2 pr-8 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-[#FA634E]"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">SAR</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* COLLAPSIBLE REAL-TIME DAILY ROSTER ACCORDION */}
          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setIsRosterExpanded(!isRosterExpanded)}
                className="flex items-center gap-2 text-[10px] font-extrabold text-slate-600 dark:text-slate-300 uppercase tracking-wider hover:text-[#FA634E] transition-colors cursor-pointer"
              >
                <ChevronDown className={`w-3.5 h-3.5 text-[#FA634E] transition-transform duration-200 ${isRosterExpanded ? 'rotate-180' : ''}`} />
                <span>DAILY OPERATING ROSTER ({selectedDates.length} DAYS)</span>
                {overrideCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[9px] font-black">
                    {overrideCount} Overrides
                  </span>
                )}
              </button>

              <div className="flex items-center gap-2">
                {selectedDates.length > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!setDayAssignments || selectedDates.length === 0) return;
                      const firstDate = selectedDates[0];
                      const firstAssign = dayAssignments[firstDate] || { driverId: rotationDrivers[0] || masterDriver, vehicleId: rotationVehicles[0] || masterVehicle };
                      const activeStratDriver = strategyMode === 'single' ? rotationDrivers[0] || masterDriver : rotationDrivers[0] || masterDriver;
                      const activeStratVehicle = strategyMode === 'single' ? rotationVehicles[0] || masterVehicle : rotationVehicles[0] || masterVehicle;
                      const copyPayload = {
                        driverId: firstAssign.driverId || activeStratDriver,
                        vehicleId: firstAssign.vehicleId || activeStratVehicle,
                        ...(firstAssign.coDriverId !== undefined ? { coDriverId: firstAssign.coDriverId } : {}),
                        ...(firstAssign.driverPayoutOverride !== undefined ? { driverPayoutOverride: firstAssign.driverPayoutOverride } : {}),
                        ...(firstAssign.coDriverPayoutOverride !== undefined ? { coDriverPayoutOverride: firstAssign.coDriverPayoutOverride } : {}),
                      };
                      setDayAssignments((prev) => {
                        const updated = { ...prev };
                        selectedDates.forEach((dStr) => {
                          updated[dStr] = { ...copyPayload };
                        });
                        return updated;
                      });
                    }}
                    className="text-[10px] font-extrabold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-900 px-2 py-0.5 rounded-md flex items-center gap-1 cursor-pointer transition-colors"
                    title="Duplicate Day 1 driver, co-driver & vehicle across all days"
                  >
                    <Copy className="w-3 h-3" /> Duplicate Day 1 to All
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsRosterExpanded(!isRosterExpanded)}
                  className="text-[10px] font-bold text-[#FA634E] hover:underline cursor-pointer"
                >
                  {isRosterExpanded ? 'Collapse Schedule' : 'View Schedule Roster'}
                </button>
              </div>
            </div>

            {/* EXPANDED ROSTER TABLE */}
            {isRosterExpanded && (
              <div className="space-y-1.5 pt-1 animate-fade-in">
                {/* Table Header */}
                {selectedDates.length > 0 && (
                  <div className="grid grid-cols-12 gap-2 px-2.5 text-[10px] font-extrabold text-slate-400 uppercase">
                    <div className="col-span-2">Operating Date</div>
                    <div className="col-span-4">Assigned Driver</div>
                    <div className="col-span-3">Assigned Vehicle</div>
                    <div className="col-span-3 text-right">Actions</div>
                  </div>
                )}

                {/* Ultra-Compact Scrollable Date Rows */}
                <div className="overflow-y-auto max-h-[220px] pr-1 space-y-1.5 custom-scrollbar">
                  {selectedDates.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-6 text-center text-slate-400">
                      <Calendar className="w-8 h-8 mb-1.5 opacity-30 text-[#FA634E]" />
                      <p className="text-xs font-bold text-slate-600 dark:text-slate-300">No Operating Days Selected</p>
                      <p className="text-[11px] text-slate-500">Select operating days on the left calendar to generate your daily roster.</p>
                    </div>
                  ) : (
                    selectedDates.map((dateStr, idx) => {
                      const dateObj = new Date(dateStr + 'T00:00:00');
                      const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
                      const formattedDate = dateObj.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });

                      const slotIndex = idx % rotationCount;
                      const activeStrategyDriver =
                        strategyMode === 'single'
                          ? rotationDrivers[0] || masterDriver
                          : rotationDrivers[slotIndex] || masterDriver;
                      const activeStrategyVehicle =
                        strategyMode === 'single'
                          ? rotationVehicles[0] || masterVehicle
                          : rotationVehicles[slotIndex] || masterVehicle;

                      const assignment = dayAssignments[dateStr] || { driverId: activeStrategyDriver, vehicleId: activeStrategyVehicle };
                      const activeDriver = assignment.driverId || activeStrategyDriver;
                      const activeVehicle = assignment.vehicleId || activeStrategyVehicle;

                      const isCustomDriver = activeDriver !== activeStrategyDriver;
                      const isCustomVehicle = activeVehicle !== activeStrategyVehicle;
                      const isCustom = isCustomDriver || isCustomVehicle || assignment.coDriverId !== undefined;

                      const handleUpdateDateDriver = (newDriverId: string) => {
                        if (!setDayAssignments) return;
                        const dObj = drivers.find((d: any) => d.id === newDriverId || d.ref_id === newDriverId);
                        const embeddedVeh = dObj?.assignedVehicle && typeof dObj.assignedVehicle === 'object' ? (dObj.assignedVehicle as any) : null;
                        let autoVehId = dObj?.assignedVehicleId || (dObj as any)?.assigned_vehicle_id || embeddedVeh?.id;
                        if (!autoVehId && newDriverId && newDriverId !== 'unassigned') {
                          const matchedVeh = vehicles.find((v: any) => v.assigned_driver_id === newDriverId || v.driverId === newDriverId || v.assignedDriverId === newDriverId || (v.assignedDriver && v.assignedDriver.id === newDriverId));
                          if (matchedVeh) autoVehId = matchedVeh.id;
                        }

                        setDayAssignments((prev) => {
                          const existingAssign = prev[dateStr] || { driverId: activeStrategyDriver, vehicleId: activeStrategyVehicle };
                          const currentCoDriver = existingAssign.coDriverId;
                          const nextCoDriver = currentCoDriver === newDriverId ? 'unassigned' : currentCoDriver;
                          return {
                            ...prev,
                            [dateStr]: {
                              ...existingAssign,
                              driverId: newDriverId,
                              vehicleId: autoVehId || existingAssign.vehicleId || activeStrategyVehicle,
                              ...(nextCoDriver !== undefined ? { coDriverId: nextCoDriver } : {}),
                            },
                          };
                        });
                      };

                      const handleUpdateDateVehicle = (newVehicleId: string) => {
                        if (!setDayAssignments) return;
                        setDayAssignments((prev) => ({
                          ...prev,
                          [dateStr]: {
                            driverId: prev[dateStr]?.driverId || activeStrategyDriver,
                            vehicleId: newVehicleId,
                          },
                        }));
                      };

                      const handleDuplicateThisRowToAll = () => {
                        if (!setDayAssignments) return;
                        const copyPayload = {
                          driverId: activeDriver,
                          vehicleId: activeVehicle,
                          ...(assignment.coDriverId !== undefined ? { coDriverId: assignment.coDriverId } : {}),
                          ...(assignment.driverPayoutOverride !== undefined ? { driverPayoutOverride: assignment.driverPayoutOverride } : {}),
                          ...(assignment.coDriverPayoutOverride !== undefined ? { coDriverPayoutOverride: assignment.coDriverPayoutOverride } : {}),
                        };

                        setDayAssignments((prev) => {
                          const updated = { ...prev };
                          selectedDates.forEach((dStr) => {
                            updated[dStr] = { ...copyPayload };
                          });
                          return updated;
                        });
                      };

                      return (
                        <div
                          key={dateStr}
                          className={`px-2.5 py-2 rounded-xl border grid grid-cols-12 gap-2 items-start transition-all text-xs ${
                            isCustom
                              ? 'border-amber-300 bg-amber-50/40 dark:bg-amber-950/20'
                              : 'border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300'
                          }`}
                        >
                          {/* Date Column (col-span-2) */}
                          <div className="col-span-2 flex items-center gap-1.5 min-w-0 pt-1">
                            <span className="w-4 h-4 rounded-md bg-slate-100 dark:bg-slate-800 text-[9px] font-black text-slate-600 dark:text-slate-300 flex items-center justify-center shrink-0">
                              {idx + 1}
                            </span>
                            <span className="font-bold text-slate-800 dark:text-slate-200 text-[11px] truncate">
                              {dayName}, {formattedDate}
                            </span>
                          </div>

                          {/* Driver & Co-Driver Comboboxes (col-span-4) */}
                          <div className="col-span-4 min-w-0 flex flex-col gap-1.5">
                            <Combobox
                              options={driverOptions}
                              value={activeDriver}
                              onChange={handleUpdateDateDriver}
                              placeholder="Select Driver"
                              className="h-7.5 text-xs font-medium"
                              popoverClassName="w-[320px] max-w-sm"
                            />
                            {assignment.coDriverId !== undefined && (
                              <div className="flex items-center gap-1.5 mt-1 animate-fade-in w-full">
                                <span className="text-[9px] font-black text-[#FA634E] bg-orange-100 dark:bg-orange-950/80 px-1.5 py-0.5 rounded shrink-0">
                                  CO
                                </span>
                                <div className="flex-1 min-w-0">
                                  <Combobox
                                    options={driverOptions.filter((d) => d.value !== activeDriver)}
                                    value={assignment.coDriverId}
                                    onChange={(val) => {
                                      if (!setDayAssignments) return;
                                      if (val === 'unassigned' || !val) {
                                        setDayAssignments((prev) => {
                                          const next = { ...prev };
                                          if (next[dateStr]) {
                                            next[dateStr] = { ...next[dateStr] };
                                            delete next[dateStr].coDriverId;
                                            delete next[dateStr].driverPayoutOverride;
                                            delete next[dateStr].coDriverPayoutOverride;
                                          }
                                          return next;
                                        });
                                      } else {
                                        setDayAssignments((prev) => ({
                                          ...prev,
                                          [dateStr]: {
                                            ...(prev[dateStr] || { driverId: activeStrategyDriver, vehicleId: activeStrategyVehicle }),
                                            coDriverId: val,
                                          },
                                        }));
                                      }
                                    }}
                                    placeholder="Select Co-Driver"
                                    className="h-7 text-[11px] font-medium w-full"
                                    popoverClassName="w-[320px] max-w-sm"
                                  />
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!setDayAssignments) return;
                                    setDayAssignments((prev) => {
                                      const next = { ...prev };
                                      if (next[dateStr]) {
                                        next[dateStr] = { ...next[dateStr] };
                                        delete next[dateStr].coDriverId;
                                        delete next[dateStr].driverPayoutOverride;
                                        delete next[dateStr].coDriverPayoutOverride;
                                      }
                                      return next;
                                    });
                                  }}
                                  className="text-slate-400 hover:text-rose-500 transition-colors p-1 shrink-0 cursor-pointer"
                                  title="Remove co-driver"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Vehicle Combobox (col-span-3) */}
                          <div className="col-span-3 min-w-0">
                            <Combobox
                              options={vehicleOptions}
                              value={activeVehicle}
                              onChange={handleUpdateDateVehicle}
                              placeholder="Select Vehicle"
                              className="h-7.5 text-xs font-medium"
                            />
                          </div>

                          {/* Action / Override State (col-span-3) */}
                          <div className="col-span-3 flex items-center justify-end gap-1.5 shrink-0 pr-0.5 pt-0.5">
                            {assignment.coDriverId === undefined && (
                              <button
                                type="button"
                                className="text-[10px] font-extrabold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 dark:bg-emerald-950/70 dark:text-emerald-300 dark:border-emerald-700 px-2 py-1 rounded-md flex items-center gap-1 cursor-pointer transition-all shadow-2xs shrink-0 active:scale-95"
                                title="Add co-driver for this day"
                                onClick={() => {
                                  if (!setDayAssignments) return;
                                  setDayAssignments((prev) => ({
                                    ...prev,
                                    [dateStr]: {
                                      ...(prev[dateStr] || { driverId: activeStrategyDriver, vehicleId: activeStrategyVehicle }),
                                      coDriverId: 'unassigned',
                                    },
                                  }));
                                }}
                              >
                                <Plus className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                <span>Co-Driver</span>
                              </button>
                            )}
                            <button
                              type="button"
                              className="p-1 rounded-md text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                              title="Duplicate driver, co-driver & vehicle to all operating days"
                              onClick={handleDuplicateThisRowToAll}
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            {isCustom ? (
                              <button
                                type="button"
                                onClick={() => {
                                  if (!setDayAssignments) return;
                                  setDayAssignments((prev) => {
                                    const next = { ...prev };
                                    delete next[dateStr];
                                    return next;
                                  });
                                }}
                                className="p-1 rounded-md text-amber-600 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950 transition-colors cursor-pointer"
                                title="Reset date to strategy default"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            ) : (
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700 mx-0.5" title="Inherits strategy default" />
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
};
