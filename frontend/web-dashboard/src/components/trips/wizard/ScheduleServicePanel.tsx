import React from 'react';
import { Calendar, Clock, Moon } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { TimePicker } from '@/components/ui/time-picker';
import TransitTimeBadge from '@/components/trips/TransitTimeBadge';
import { getAllTaxonomyOptions, resolveTaxonomyOption } from '@/utils/taxonomyRegistry';
import { isDateTimeInPast } from '@/utils/pastDateTripUtils';
import { cn } from '@/lib/utils';

interface ScheduleServicePanelProps {
  slot: any;
  currentCategory: string;
  isRoundTrip: boolean;
  setContractRateCategory?: (cat: string) => void;
  triggerRateLookupForSlots?: (vType?: string, rCat?: string, custId?: string, bType?: string) => void;
  handleUpdateTripSlot: (slotId: string, patch: any) => void;
}

export const ScheduleServicePanel: React.FC<ScheduleServicePanelProps> = ({
  slot,
  currentCategory,
  isRoundTrip,
  setContractRateCategory,
  triggerRateLookupForSlots,
  handleUpdateTripSlot,
}) => {
  return (
    <div className="p-3 rounded-xl border border-[#FFDCD6] bg-white dark:bg-slate-900 shadow-2xs space-y-2.5">
      <div className="flex items-center justify-between pb-1.5 border-b border-[#FFDCD6]">
        <h4 className="text-xs font-extrabold text-[#FA634E] uppercase tracking-wider flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-[#FA634E] shrink-0" /> SCHEDULE & SERVICE
        </h4>
        <span className="text-[10px] font-bold text-[#FA634E] bg-[#FFF5F2] border border-[#FFDCD6] px-2 py-0.5 rounded-full">
          Service Config
        </span>
      </div>

      {/* 1. LINE TYPE DROPDOWN */}
      <div className="space-y-1">
        <label className="text-xs font-bold text-[#3E3C3D] dark:text-slate-300 uppercase tracking-wider flex items-center justify-between">
          <span>Line Type <span className="text-brand">*</span></span>
          <span className="text-[10px] text-slate-400 font-normal normal-case">Controls route structure</span>
        </label>
        {(() => {
          const lineTypeTaxonomyOptions = getAllTaxonomyOptions('LINE_TYPE');
          const selectedTaxonomyOption = resolveTaxonomyOption('LINE_TYPE', currentCategory);

          return (
            <Select
              value={currentCategory}
              onValueChange={(val) => {
                if (setContractRateCategory) {
                  setContractRateCategory(val);
                }
                if (triggerRateLookupForSlots) {
                  triggerRateLookupForSlots(undefined, val);
                }
              }}
            >
              <SelectTrigger className="h-9 w-full rounded-lg bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-xs font-bold text-[#3E3C3D] dark:text-slate-100 shadow-2xs focus:ring-2 focus:ring-brand">
                <div className="flex items-center gap-2 truncate">
                  {selectedTaxonomyOption ? (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-extrabold border shadow-2xs",
                        selectedTaxonomyOption.colorTheme.bg,
                        selectedTaxonomyOption.colorTheme.text,
                        selectedTaxonomyOption.colorTheme.border,
                        selectedTaxonomyOption.colorTheme.darkBg,
                        selectedTaxonomyOption.colorTheme.darkText
                      )}
                    >
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: selectedTaxonomyOption.colorTheme.hex }}
                      />
                      <span>{selectedTaxonomyOption.label}</span>
                    </span>
                  ) : (
                    <SelectValue placeholder="Select Line Type" />
                  )}
                </div>
              </SelectTrigger>
              <SelectContent className="z-[9999]">
                {lineTypeTaxonomyOptions.map((opt) => (
                  <SelectItem key={opt.id} value={opt.label} className="text-xs font-bold py-2 cursor-pointer">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-extrabold border shadow-2xs",
                          opt.colorTheme.bg,
                          opt.colorTheme.text,
                          opt.colorTheme.border,
                          opt.colorTheme.darkBg,
                          opt.colorTheme.darkText
                        )}
                      >
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: opt.colorTheme.hex }}
                        />
                        <span>{opt.label}</span>
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        })()}
      </div>

      <div className="border-t border-slate-100 dark:border-slate-800 pt-2 space-y-2">
        {/* 2. PICKUP SCHEDULE */}
        {(() => {
          const isPastSchedule = isDateTimeInPast(slot.date, slot.pickupTime);

          return (
            <div className="space-y-1">
              <label className="text-xs font-bold text-[#3E3C3D] dark:text-slate-300 uppercase tracking-wider flex items-center justify-between">
                <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5 text-emerald-600" /> PICKUP SCHEDULE</span>
                {isPastSchedule && (
                  <span className="text-[9px] font-extrabold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 px-1.5 py-0.5 rounded flex items-center gap-1">
                    <Clock className="w-2.5 h-2.5 text-amber-600" /> Past Time (Back-dated)
                  </span>
                )}
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                <DatePicker
                  value={slot.date || ''}
                  onChange={(_, dateStr) => handleUpdateTripSlot(slot.id, { date: dateStr })}
                  placeholder="Select date..."
                  buttonClassName="h-8.5 border-slate-200 bg-white shadow-2xs font-semibold text-xs text-slate-800 px-2.5"
                  minDate={new Date()}
                />
                <TimePicker
                  value={slot.pickupTime || ''}
                  onChange={(timeStr) => handleUpdateTripSlot(slot.id, { pickupTime: timeStr })}
                  placeholder="Select time..."
                  buttonClassName="h-8.5 border-slate-200 bg-white shadow-2xs font-semibold text-xs text-slate-800 px-2.5"
                />
              </div>
            </div>
          );
        })()}

        {/* 3. DROPOFF SCHEDULE */}
        <div className="space-y-1">
          <label className="text-xs font-bold text-[#3E3C3D] dark:text-slate-300 uppercase tracking-wider flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-brand" /> DROPOFF SCHEDULE
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            <DatePicker
              value={slot.dropoffDate || ''}
              onChange={(_, dateStr) => handleUpdateTripSlot(slot.id, { dropoffDate: dateStr })}
              placeholder="Select date..."
              buttonClassName="h-8.5 border-slate-200 bg-white shadow-2xs font-semibold text-xs text-slate-800 px-2.5"
              minDate={slot.date ? new Date(slot.date) : new Date()}
            />
            <TimePicker
              value={slot.dropoffTime}
              onChange={(timeStr) => handleUpdateTripSlot(slot.id, { dropoffTime: timeStr })}
              placeholder="Select time..."
              buttonClassName="h-8.5 border-slate-200 bg-white shadow-2xs font-semibold text-xs text-slate-800 px-2.5"
            />
          </div>
        </div>

        {/* 4. OVERNIGHT STATUS INDICATOR */}
        <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <span className="text-xs font-bold text-[#3E3C3D] dark:text-slate-200 flex items-center gap-1.5">
            <Moon className="w-3.5 h-3.5 text-indigo-500" /> Overnight Trip
          </span>
          {slot.isOvernight ? (
            <span className="px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-extrabold flex items-center gap-1 shadow-2xs">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-600" />
              ON (+1 Day)
            </span>
          ) : (
            <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200 text-[10px] font-bold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
              OFF (Same Day)
            </span>
          )}
        </div>

        {/* 5. TRANSIT ESTIMATE BADGE */}
        <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800">
          <TransitTimeBadge
            origin={slot.origin}
            destination={slot.destination}
            returnDestination={slot.returnDestination}
            isRoundTrip={isRoundTrip}
            intermediateLocations={slot.intermediateLocations}
            returnIntermediateLocations={slot.returnIntermediateLocations}
            originLat={slot.originLat}
            originLng={slot.originLng}
            destinationLat={slot.destinationLat}
            destinationLng={slot.destinationLng}
            pickupDate={slot.date || slot.pickupDate}
            pickupTime={slot.pickupTime}
            dropoffTime={slot.dropoffTime}
          />
        </div>
      </div>
    </div>
  );
};
