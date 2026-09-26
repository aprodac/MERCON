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
              <label className="text-xs font-bold text-foreground block mb-1">
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
              <label className="text-xs font-bold text-foreground block mb-1">
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
            <div className="text-xs font-bold text-foreground">
              Generation Preview
            </div>
            <div className="max-h-48 overflow-y-auto border border-border dark:border-border rounded-xl p-2 space-y-1 bg-muted divide-y divide-border/60 dark:divide-border/60">
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
                    <span className="font-semibold text-foreground">{pName}</span>
                    {exists ? (
                      <span className="text-[10px] text-amber-700 font-semibold bg-amber-500/10 dark:text-amber-300 ring-1 ring-inset ring-amber-600/20 px-2 py-0.5 rounded">
                        Exists (skip)
                      </span>
                    ) : (
                      <span className="text-[10px] text-emerald-700 font-semibold bg-emerald-500/10 dark:text-emerald-300 ring-1 ring-inset ring-emerald-600/20 px-2 py-0.5 rounded">
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
              <div className="text-xs text-muted-foreground font-medium">Generating periods... {generateProgress}%</div>
              <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-[#FA634E] transition-all" style={{ width: `${generateProgress}%` }} />
              </div>
            </div>
          )}
        </div>

        <SheetFooter className="pt-4 border-t border-border dark:border-border">
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
