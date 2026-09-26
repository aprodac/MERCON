import React, { useState, useMemo } from 'react';
import {
  Calendar,
  User,
  Truck,
  Search,
  X,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  SlidersHorizontal,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Combobox, ComboboxOption } from '@/components/ui/combobox';
import { cn } from '@/lib/utils';

interface MonthlyDayOverridesModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDates: string[];
  contractSlots: any[];
  masterDriver: string;
  masterVehicle: string;
  drivers: any[];
  vehicles: any[];
  driverOptions: ComboboxOption[];
  vehicleOptions: ComboboxOption[];
  dayAssignments: Record<string, { driverId: string; vehicleId: string }>;
  setDayAssignments: React.Dispatch<React.SetStateAction<Record<string, { driverId: string; vehicleId: string }>>>;
}

export const MonthlyDayOverridesModal: React.FC<MonthlyDayOverridesModalProps> = ({
  isOpen,
  onClose,
  selectedDates,
  contractSlots,
  masterDriver,
  masterVehicle,
  drivers,
  vehicles,
  driverOptions,
  vehicleOptions,
  dayAssignments,
  setDayAssignments,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  // Generated list of rows (date + slot combination)
  const rows = useMemo(() => {
    const list: Array<{
      key: string;
      dateStr: string;
      formattedDate: string;
      slotLabel: string;
    }> = [];

    selectedDates.forEach((dateStr) => {
      const [y, m, d] = dateStr.split('-').map(Number);
      const dateObj = new Date(y, m - 1, d);
      const formattedDate = dateObj.toLocaleDateString('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });

      contractSlots.forEach((slot, slotIdx) => {
        const key = contractSlots.length > 1 ? `${dateStr}::${slot.id}` : dateStr;
        const slotLabel = contractSlots.length > 1 ? `Slot #${slotIdx + 1}` : '';
        list.push({ key, dateStr, formattedDate, slotLabel });
      });
    });

    return list;
  }, [selectedDates, contractSlots]);

  const filteredRows = useMemo(() => {
    if (!searchQuery.trim()) return rows;
    const q = searchQuery.toLowerCase();
    return rows.filter((r) => r.formattedDate.toLowerCase().includes(q) || r.dateStr.includes(q) || r.slotLabel.toLowerCase().includes(q));
  }, [rows, searchQuery]);

  const handleUpdateAssignment = (rowKey: string, field: 'driverId' | 'vehicleId', value: string) => {
    setDayAssignments((prev) => ({
      ...prev,
      [rowKey]: {
        driverId: field === 'driverId' ? value : (prev[rowKey]?.driverId || ''),
        vehicleId: field === 'vehicleId' ? value : (prev[rowKey]?.vehicleId || ''),
      },
    }));
  };

  const handleResetRow = (rowKey: string) => {
    setDayAssignments((prev) => {
      const copy = { ...prev };
      delete copy[rowKey];
      return copy;
    });
  };

  const handleResetAll = () => {
    setDayAssignments({});
  };

  if (!isOpen) return null;

  const overriddenCount = Object.keys(dayAssignments).filter(
    (k) => (dayAssignments[k]?.driverId && dayAssignments[k]?.driverId !== masterDriver) || (dayAssignments[k]?.vehicleId && dayAssignments[k]?.vehicleId !== masterVehicle)
  ).length;

  return (
    <div className="fixed inset-0 z-50 bg-charcoal/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 animate-fade-in">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden text-[#3E3C3D]">
        
        {/* MODAL HEADER */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-800/40 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-orange-100 dark:bg-orange-950/60 text-brand grid place-items-center shrink-0 border border-orange-200">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-wider flex items-center gap-2">
                <span>DAY-BY-DAY DRIVER & TRUCK SCHEDULE</span>
                <span className="text-xs font-bold text-brand bg-orange-100 dark:bg-orange-950/40 px-2 py-0.5 rounded-full border border-orange-200">
                  {rows.length} Total Trips
                </span>
              </h3>
              <p className="text-[11px] font-medium text-slate-500">
                Override master default driver & truck assignments for specific dates in the monthly contract.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-slate-700 hover:border-slate-300 grid place-items-center transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* CONTROLS BAR: SEARCH & RESET */}
        <div className="p-3 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 flex-wrap shrink-0">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search date or slot..."
              className="w-full h-8 pl-9 pr-3 text-xs font-bold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>

          <div className="flex items-center gap-2">
            {overriddenCount > 0 && (
              <span className="text-[11px] font-extrabold text-amber-800 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200 flex items-center gap-1">
                <SlidersHorizontal className="w-3.5 h-3.5 text-amber-600" /> {overriddenCount} Custom Overrides
              </span>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleResetAll}
              disabled={overriddenCount === 0}
              className="h-8 text-xs font-bold gap-1 border-slate-300 text-slate-600 hover:bg-slate-100"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reset All to Master Defaults
            </Button>
          </div>
        </div>

        {/* SCHEDULE OVERRIDE TABLE */}
        <div className="flex-1 overflow-y-auto p-4 min-h-0 custom-scrollbar space-y-2">
          {filteredRows.length > 0 ? (
            <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-2xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 dark:bg-slate-800 text-slate-500 font-extrabold uppercase text-[10px] tracking-wider border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="py-2.5 px-3 w-[200px]">Date & Slot</th>
                    <th className="py-2.5 px-3">Assigned Driver</th>
                    <th className="py-2.5 px-3">Assigned Truck / Vehicle</th>
                    <th className="py-2.5 px-3 w-[70px] text-right">Reset</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                  {filteredRows.map((row) => {
                    const assignment = dayAssignments[row.key] || { driverId: '', vehicleId: '' };
                    const currentDriverId = assignment.driverId || masterDriver;
                    const currentVehicleId = assignment.vehicleId || masterVehicle;

                    const isDriverCustom = Boolean(assignment.driverId && assignment.driverId !== masterDriver);
                    const isVehicleCustom = Boolean(assignment.vehicleId && assignment.vehicleId !== masterVehicle);

                    return (
                      <tr key={row.key} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                        {/* DATE & SLOT */}
                        <td className="py-2.5 px-3 font-bold text-slate-800 dark:text-slate-100">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-brand shrink-0" />
                            <span>{row.formattedDate}</span>
                            {row.slotLabel && (
                              <span className="text-[10px] font-extrabold text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded">
                                {row.slotLabel}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* DRIVER DROPDOWN */}
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-1.5">
                            <Combobox
                              options={driverOptions}
                              value={currentDriverId}
                              onChange={(val) => handleUpdateAssignment(row.key, 'driverId', val)}
                              placeholder="Select Driver..."
                              triggerClassName="h-8 rounded-lg border-slate-300 text-xs font-bold w-full"
                            />
                            {isDriverCustom && (
                              <span className="text-[9px] font-black text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded shrink-0">
                                Custom
                              </span>
                            )}
                          </div>
                        </td>

                        {/* VEHICLE DROPDOWN */}
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-1.5">
                            <Combobox
                              options={vehicleOptions}
                              value={currentVehicleId}
                              onChange={(val) => handleUpdateAssignment(row.key, 'vehicleId', val)}
                              placeholder="Select Truck..."
                              triggerClassName="h-8 rounded-lg border-slate-300 text-xs font-bold w-full"
                            />
                            {isVehicleCustom && (
                              <span className="text-[9px] font-black text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded shrink-0">
                                Custom
                              </span>
                            )}
                          </div>
                        </td>

                        {/* RESET BUTTON */}
                        <td className="py-2.5 px-3 text-right">
                          {(isDriverCustom || isVehicleCustom) ? (
                            <button
                              type="button"
                              onClick={() => handleResetRow(row.key)}
                              className="text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-rose-50 transition-colors"
                              title="Reset Row to Master Defaults"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <span className="text-[10px] text-slate-300 font-bold">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200 text-slate-500 text-xs font-bold">
              No matching dates or slots found for "{searchQuery}".
            </div>
          )}
        </div>

        {/* MODAL FOOTER */}
        <div className="p-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center justify-between gap-3 shrink-0">
          <div className="text-xs font-bold text-slate-600 dark:text-slate-300">
            {rows.length} Total Trip Schedules ({overriddenCount} Customized)
          </div>

          <Button
            type="button"
            onClick={onClose}
            className="h-9 px-5 rounded-xl bg-brand hover:bg-brand/90 text-white font-bold text-xs shadow-xs"
          >
            Apply & Close Schedule
          </Button>
        </div>

      </div>
    </div>
  );
};
