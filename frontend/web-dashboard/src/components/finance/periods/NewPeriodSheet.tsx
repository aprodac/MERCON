import { useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import { FULL_MONTH_NAMES, PeriodRow } from './types';

interface NewPeriodSheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  periods: PeriodRow[];
  currentYear: number;
  currentMonthIdx: number;
  newPeriodForm: { name: string; start_date: string; end_date: string };
  setNewPeriodForm: React.Dispatch<React.SetStateAction<{ name: string; start_date: string; end_date: string }>>;
  onSubmit: (form: { name: string; start_date: string; end_date: string }) => void;
  isPending: boolean;
}

export function NewPeriodSheet({
  isOpen,
  onOpenChange,
  periods,
  currentYear,
  currentMonthIdx,
  newPeriodForm,
  setNewPeriodForm,
  onSubmit,
  isPending,
}: NewPeriodSheetProps) {
  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md p-6 overflow-y-auto">
        <SheetHeader>
          <SheetTitle>New Accounting Period</SheetTitle>
          <SheetDescription>
            Define a new period for journal entries and financial postings.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 py-4">
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1.5">
              Quick Presets
            </label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const nextMIdx = (currentMonthIdx + 1) % 12;
                  const nextYear = nextMIdx === 0 ? currentYear + 1 : currentYear;
                  const mName = FULL_MONTH_NAMES[nextMIdx];
                  const startDate = `${nextYear}-${String(nextMIdx + 1).padStart(2, '0')}-01`;
                  const lastDay = new Date(nextYear, nextMIdx + 1, 0).getDate();
                  const endDate = `${nextYear}-${String(nextMIdx + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}T23:59:59.999Z`;

                  setNewPeriodForm({
                    name: `${mName} ${nextYear}`,
                    start_date: startDate,
                    end_date: endDate,
                  });
                }}
                className="h-7 text-xs font-semibold rounded-lg"
              >
                Next Month
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const currQ = Math.floor(currentMonthIdx / 3) + 1;
                  const nextQ = currQ === 4 ? 1 : currQ + 1;
                  const qYear = nextQ === 1 ? currentYear + 1 : currentYear;
                  const startMonth = (nextQ - 1) * 3 + 1;
                  const endMonth = nextQ * 3;
                  const startDate = `${qYear}-${String(startMonth).padStart(2, '0')}-01`;
                  const lastDay = new Date(qYear, endMonth, 0).getDate();
                  const endDate = `${qYear}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}T23:59:59.999Z`;

                  setNewPeriodForm({
                    name: `FY${qYear}-Q${nextQ}`,
                    start_date: startDate,
                    end_date: endDate,
                  });
                }}
                className="h-7 text-xs font-semibold rounded-lg"
              >
                Next Quarter
              </Button>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
              Period Name *
            </label>
            <Input
              placeholder="e.g. September 2026 or FY2026-Q4"
              value={newPeriodForm.name}
              onChange={(e) => setNewPeriodForm({ ...newPeriodForm, name: e.target.value })}
              className="h-9 text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Start Date *
              </label>
              <Input
                type="date"
                value={newPeriodForm.start_date.split('T')[0]}
                onChange={(e) => setNewPeriodForm({ ...newPeriodForm, start_date: e.target.value })}
                className="h-9 text-xs"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                End Date *
              </label>
              <Input
                type="date"
                value={newPeriodForm.end_date.split('T')[0]}
                onChange={(e) => {
                  const dateVal = e.target.value;
                  setNewPeriodForm({
                    ...newPeriodForm,
                    end_date: dateVal ? `${dateVal}T23:59:59.999Z` : '',
                  });
                }}
                className="h-9 text-xs"
              />
            </div>
          </div>

          {newPeriodForm.start_date && newPeriodForm.end_date && (() => {
            const sTime = new Date(newPeriodForm.start_date).getTime();
            const eTime = new Date(newPeriodForm.end_date).getTime();
            const isOverlapping = periods.some((p) => {
              const pStart = new Date(p.start_date).getTime();
              const pEnd = new Date(p.end_date).getTime();
              return sTime <= pEnd && eTime >= pStart;
            });

            if (isOverlapping) {
              return (
                <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 text-xs text-amber-800 dark:text-amber-200 p-2.5 rounded-xl flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Warning: Selected date range overlaps with an existing period.</span>
                </div>
              );
            }
            return null;
          })()}
        </div>

        <SheetFooter className="pt-4 border-t border-slate-100 dark:border-slate-800">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => {
              if (!newPeriodForm.name || !newPeriodForm.start_date || !newPeriodForm.end_date) {
                toast.error('All fields are required');
                return;
              }
              onSubmit(newPeriodForm);
            }}
            disabled={isPending}
            className="bg-[#FA634E] hover:bg-[#e0523d] text-white font-semibold"
          >
            Create Period
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
