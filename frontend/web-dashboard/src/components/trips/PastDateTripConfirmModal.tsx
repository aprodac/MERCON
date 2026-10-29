import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import { PastDateAnalysis } from '@/utils/pastDateTripUtils';
import { TripStatus } from '@/services/tripService';

interface PastDateTripConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (selectedStatus: TripStatus | 'Incompleted') => void;
  analysis?: PastDateAnalysis | null;
  isSubmitting?: boolean;
}

export default function PastDateTripConfirmModal({
  open,
  onClose,
  onConfirm,
  analysis,
  isSubmitting = false,
}: PastDateTripConfirmModalProps) {
  const isPastDate = Boolean(analysis?.hasPastTrips);
  const [selectedOption, setSelectedOption] = useState<'Completed' | 'Incompleted' | null>(
    isPastDate ? null : 'Incompleted'
  );

  React.useEffect(() => {
    if (open) {
      setSelectedOption(isPastDate ? null : 'Incompleted');
    }
  }, [open, isPastDate]);

  if (!open) return null;

  const pastTripsCount = analysis?.pastTripsCount || 0;
  const totalTripsCount = analysis?.totalTripsCount || 1;
  const samplePastDate = analysis?.samplePastDate;

  const handleConfirm = () => {
    if (selectedOption) onConfirm(selectedOption as any);
  };

  return (
    <Dialog open={open} onOpenChange={(val) => { if (!val && !isSubmitting) onClose(); }}>
      <DialogContent className="sm:max-w-[540px] p-0 overflow-hidden border-slate-200 dark:border-slate-800 shadow-2xl rounded-2xl bg-white dark:bg-slate-900">
        {/* Header Banner */}
        <div className="bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200/80 dark:border-amber-900/50 p-6">
          <div className="flex items-start gap-4">
            <AlertCircle className="w-7 h-7 text-amber-600 shrink-0" />
            <div>
              <div className="flex items-center gap-2 mb-1">
                <DialogTitle className="text-lg font-bold text-amber-900 dark:text-amber-200">
                  Trip Creation Status Confirmation
                </DialogTitle>
                <Badge className="bg-amber-100 text-amber-800 border-amber-300 font-semibold text-[11px]">
                  Action Required
                </Badge>
              </div>
              <DialogDescription className="text-xs text-amber-800/90 dark:text-amber-300/80 leading-relaxed">
                {isPastDate ? (
                  <>
                    Warning: {pastTripsCount === 1 ? "this trip's start time has passed" : `${pastTripsCount} trips have already started`} ({samplePastDate}). Did it happen? Choose one — nothing is selected for you.
                  </>
                ) : (
                  <>
                    Please select the initial execution status for the {totalTripsCount === 1 ? 'trip' : `${totalTripsCount} trips`} being created.
                  </>
                )}
              </DialogDescription>
            </div>
          </div>
        </div>

        {/* Form Content: 2 Options Only */}
        <div className="p-6 space-y-5">
          <div className="space-y-2.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 tracking-wide uppercase">
              Select Initial Trip Status
            </label>

            <div className="grid gap-3">
              {/* Option 1: Completed */}
              <div
                onClick={() => setSelectedOption('Completed')}
                className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex items-start gap-3.5 ${
                  selectedOption === 'Completed'
                    ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 shadow-sm'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                  selectedOption === 'Completed' ? 'border-emerald-600 bg-emerald-600' : 'border-slate-300 dark:border-slate-600'
                }`}>
                  {selectedOption === 'Completed' && <div className="w-2 h-2 rounded-full bg-white" />}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-sm font-bold text-slate-900 dark:text-slate-100">Completed</span>
                    {isPastDate ? (
                      null
                    ) : (
                      <Badge variant="outline" className="text-slate-500 border-slate-300 text-[10px] py-0 font-normal">Already Executed</Badge>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    The trip was already executed on that date and is finished. Saved with status <strong>Completed</strong>.
                  </p>
                </div>
              </div>

              {/* Option 2: Incompleted */}
              <div
                onClick={() => setSelectedOption('Incompleted')}
                className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex items-start gap-3.5 ${
                  selectedOption === 'Incompleted'
                    ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20 shadow-sm'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                  selectedOption === 'Incompleted' ? 'border-indigo-600 bg-indigo-600' : 'border-slate-300 dark:border-slate-600'
                }`}>
                  {selectedOption === 'Incompleted' && <div className="w-2 h-2 rounded-full bg-white" />}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    <span className="text-sm font-bold text-slate-900 dark:text-slate-100">Incompleted</span>
                    {!isPastDate ? (
                      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px] py-0 font-bold">Recommended</Badge>
                    ) : (
                      <Badge className="bg-indigo-100 text-indigo-700 border-indigo-200 text-[10px] py-0">Auto Status by Date</Badge>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Trip is in progress or planned. Status will be automatically set based on date (<strong>Scheduled</strong> for future dates, <strong>In Transit</strong> for past dates).
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 dark:bg-slate-900/80 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-xl border-slate-300 dark:border-slate-700 text-xs font-semibold"
          >
            Cancel Creation
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={isSubmitting || !selectedOption}
            className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-500/20 px-4"
          >
            {isSubmitting ? 'Creating Trips...' : !selectedOption ? 'Choose one above' : selectedOption === 'Completed' ? 'Create as completed (driver not notified)' : 'Confirm Status & Create Trips'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
