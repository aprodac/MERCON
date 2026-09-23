import { Link } from 'react-router-dom';
import { Check, X } from 'lucide-react';
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
import { MoneyText, JournalLinesTable } from '@/components/finance/kit';
import type { PeriodRow } from './types';

interface GuidedFiscalYearCloseSheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  selectedYear: number;
  fyStep: 1 | 2 | 3 | 4;
  setFyStep: React.Dispatch<React.SetStateAction<1 | 2 | 3 | 4>>;
  fyClosingDate: string;
  setFyClosingDate: (date: string) => void;
  fyPreChecks: {
    openPeriodsBefore: PeriodRow[];
    retainedAccSet: boolean;
    canPass: boolean;
  };
  pnlRes: any;
  fyClosingPreviewLines: any[];
  fyTypedConfirm: string;
  setFyTypedConfirm: (text: string) => void;
  onSubmitFyClose: (dateStr: string) => void;
  isPending: boolean;
}

export function GuidedFiscalYearCloseSheet({
  isOpen,
  onOpenChange,
  selectedYear,
  fyStep,
  setFyStep,
  fyClosingDate,
  setFyClosingDate,
  fyPreChecks,
  pnlRes,
  fyClosingPreviewLines,
  fyTypedConfirm,
  setFyTypedConfirm,
  onSubmitFyClose,
  isPending,
}: GuidedFiscalYearCloseSheetProps) {
  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg p-6 overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Close Fiscal Year {selectedYear}</SheetTitle>
          <SheetDescription>
            Guided process to finalize year-end revenue and expense closing.
          </SheetDescription>
        </SheetHeader>

        <div className="flex items-center justify-between py-4 border-b border-slate-100 dark:border-slate-800 my-2">
          {[1, 2, 3, 4].map((stepNum) => (
            <div key={stepNum} className="flex items-center gap-1.5">
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  fyStep === stepNum
                    ? 'bg-[#FA634E] text-white'
                    : fyStep > stepNum
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                }`}
              >
                {fyStep > stepNum ? <Check className="w-3.5 h-3.5" /> : stepNum}
              </span>
              <span className={`text-xs font-semibold ${fyStep === stepNum ? 'text-slate-900 dark:text-white' : 'text-slate-400'}`}>
                {stepNum === 1 ? 'Date' : stepNum === 2 ? 'Checks' : stepNum === 3 ? 'Preview' : 'Confirm'}
              </span>
            </div>
          ))}
        </div>

        {fyStep === 1 && (
          <div className="space-y-4 py-4">
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Select the fiscal year closing date. All Revenue and Expense accounts up to this date will be zeroed out.
            </p>
            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Closing Date *
              </label>
              <Input
                type="date"
                value={fyClosingDate}
                onChange={(e) => setFyClosingDate(e.target.value)}
                className="h-9 text-xs"
              />
            </div>
          </div>
        )}

        {fyStep === 2 && (
          <div className="space-y-4 py-4">
            <div className="space-y-3">
              <div className="p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 flex items-start gap-2.5">
                {fyPreChecks.openPeriodsBefore.length === 0 ? (
                  <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <X className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                )}
                <div className="text-xs">
                  <div className="font-bold text-slate-900 dark:text-white">
                    All prior accounting periods closed/locked
                  </div>
                  {fyPreChecks.openPeriodsBefore.length > 0 ? (
                    <div className="text-rose-600 mt-0.5 font-medium">
                      The following periods are still Open:{' '}
                      {fyPreChecks.openPeriodsBefore.map((p) => p.name).join(', ')}
                    </div>
                  ) : (
                    <div className="text-slate-500 mt-0.5">All periods in range are closed or locked.</div>
                  )}
                </div>
              </div>

              <div className="p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 flex items-start gap-2.5">
                {fyPreChecks.retainedAccSet ? (
                  <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <X className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                )}
                <div className="text-xs">
                  <div className="font-bold text-slate-900 dark:text-white">
                    Default Retained Earnings account configured
                  </div>
                  {!fyPreChecks.retainedAccSet ? (
                    <div className="text-rose-600 mt-0.5 font-medium">
                      Retained earnings account is missing in settings.{' '}
                      <Link to="/settings" className="underline font-bold">
                        Configure in Settings →
                      </Link>
                    </div>
                  ) : (
                    <div className="text-slate-500 mt-0.5">Retained Earnings GL account is valid.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {fyStep === 3 && (
          <div className="space-y-4 py-4">
            <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200/60 dark:border-slate-700 text-xs flex justify-between items-center">
              <span className="font-bold text-slate-700 dark:text-slate-300">Estimated FY Net Income</span>
              <MoneyText
                value={pnlRes?.data?.net_profit || 0}
                currency="SAR"
                tone={(pnlRes?.data?.net_profit || 0) >= 0 ? 'positive' : 'negative'}
                className="font-bold text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Estimated Closing Journal Entry Preview
              </div>
              <div className="max-h-60 overflow-y-auto border border-slate-200/80 dark:border-slate-800 rounded-xl p-2">
                <JournalLinesTable lines={fyClosingPreviewLines} />
              </div>
            </div>
          </div>
        )}

        {fyStep === 4 && (
          <div className="space-y-4 py-4">
            <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 p-3 rounded-xl text-xs text-amber-900 dark:text-amber-200 space-y-1">
              <div className="font-bold">Irreversible Action</div>
              <p>
                Closing the fiscal year posts a permanent FiscalYearClosing journal entry and zeros out income accounts.
              </p>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Type &quot;CLOSE FY{selectedYear}&quot; to confirm:
              </label>
              <Input
                placeholder={`CLOSE FY${selectedYear}`}
                value={fyTypedConfirm}
                onChange={(e) => setFyTypedConfirm(e.target.value)}
                className="h-9 text-xs font-mono"
              />
            </div>
          </div>
        )}

        <SheetFooter className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center">
          {fyStep > 1 ? (
            <Button variant="outline" size="sm" onClick={() => setFyStep((s) => (s - 1) as any)}>
              Back
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          )}

          {fyStep < 4 ? (
            <Button
              size="sm"
              onClick={() => setFyStep((s) => (s + 1) as any)}
              disabled={fyStep === 2 && !fyPreChecks.canPass}
              className="bg-[#FA634E] hover:bg-[#e0523d] text-white font-semibold"
            >
              Next Step →
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => onSubmitFyClose(fyClosingDate)}
              disabled={fyTypedConfirm.trim() !== `CLOSE FY${selectedYear}` || isPending}
              className="bg-[#FA634E] hover:bg-[#e0523d] text-white font-semibold"
            >
              {isPending ? 'Closing FY...' : 'Confirm & Close FY'}
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
