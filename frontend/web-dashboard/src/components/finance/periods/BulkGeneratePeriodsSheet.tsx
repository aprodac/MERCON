import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import { FULL_MONTH_NAMES, PeriodRow } from './types';

interface BulkGeneratePeriodsSheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  periods: PeriodRow[];
  generateYear: number;
  setGenerateYear: (year: number) => void;
  generateFreq: 'monthly' | 'quarterly';
  setGenerateFreq: (freq: 'monthly' | 'quarterly') => void;
  isGenerating: boolean;
  generateProgress: number;
  onBulkGenerate: () => void;
}

export function BulkGeneratePeriodsSheet({
  isOpen,
  onOpenChange,
  periods,
  generateYear,
  setGenerateYear,
  generateFreq,
  setGenerateFreq,
  isGenerating,
  generateProgress,
  onBulkGenerate,
}: BulkGeneratePeriodsSheetProps) {
  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md p-6 overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Generate Accounting Periods</SheetTitle>
          <SheetDescription>
            Bulk generate monthly or quarterly periods for a full fiscal year.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Fiscal Year
              </label>
              <Input
                type="number"
                value={generateYear}
                onChange={(e) => setGenerateYear(Number(e.target.value))}
                className="h-9 text-xs"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Frequency
              </label>
              <Select value={generateFreq} onValueChange={(val) => setGenerateFreq(val as any)}>
                <SelectTrigger className="w-full h-9 text-xs font-medium">
                  <SelectValue placeholder="Frequency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly (12 periods)</SelectItem>
                  <SelectItem value="quarterly">Quarterly (4 periods)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5 pt-2">
            <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Generation Preview
            </div>
            <div className="max-h-48 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-xl p-2 space-y-1 bg-slate-50 dark:bg-slate-900/50 divide-y divide-slate-100 dark:divide-slate-800">
              {Array.from({ length: generateFreq === 'monthly' ? 12 : 4 }).map((_, idx) => {
                let pName = '';
                if (generateFreq === 'monthly') {
                  pName = `${FULL_MONTH_NAMES[idx]} ${generateYear}`;
                } else {
                  pName = `FY${generateYear}-Q${idx + 1}`;
                }

                const exists = periods.some((p) => p.name.toLowerCase() === pName.toLowerCase());

                return (
                  <div key={idx} className="py-1 flex items-center justify-between text-xs px-2">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{pName}</span>
                    {exists ? (
                      <span className="text-[10px] text-amber-700 font-semibold bg-amber-50 px-2 py-0.5 rounded">
                        Exists (skip)
                      </span>
                    ) : (
                      <span className="text-[10px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded">
                        Will create
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {isGenerating && (
            <div className="space-y-1">
              <div className="text-xs text-slate-500 font-medium">Generating periods... {generateProgress}%</div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-[#FA634E] transition-all" style={{ width: `${generateProgress}%` }} />
              </div>
            </div>
          )}
        </div>

        <SheetFooter className="pt-4 border-t border-slate-100 dark:border-slate-800">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={onBulkGenerate}
            disabled={isGenerating}
            className="bg-[#FA634E] hover:bg-[#e0523d] text-white font-semibold"
          >
            Generate Periods
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
