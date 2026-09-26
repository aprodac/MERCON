import { Lock, RefreshCw, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PeriodControlBarProps {
  selectedYear: number;
  availableYears: number[];
  booksLockedThroughLabel: string;
  isAdmin: boolean;
  onSelectYear: (year: number) => void;
  onOpenGenerateSheet: () => void;
  onOpenFySheet: () => void;
  onOpenNewSheet: () => void;
}

export function PeriodControlBar({
  selectedYear,
  availableYears,
  booksLockedThroughLabel,
  isAdmin,
  onSelectYear,
  onOpenGenerateSheet,
  onOpenFySheet,
  onOpenNewSheet,
}: PeriodControlBarProps) {
  const handlePrevYear = () => {
    const idx = availableYears.indexOf(selectedYear);
    if (idx < availableYears.length - 1) {
      onSelectYear(availableYears[idx + 1]);
    } else {
      onSelectYear(selectedYear - 1);
    }
  };

  const handleNextYear = () => {
    const idx = availableYears.indexOf(selectedYear);
    if (idx > 0) {
      onSelectYear(availableYears[idx - 1]);
    } else {
      onSelectYear(selectedYear + 1);
    }
  };

  return (
    <div className="bg-card border border-border dark:border-border rounded-xl px-5 py-3 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 shadow-xs">
      <div className="flex flex-wrap items-center gap-4">
        {/* FY Switcher */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-[#3E3C3D] uppercase tracking-wider">
            Fiscal Year
          </span>
          <div className="inline-flex items-center bg-muted p-1 rounded-xl">
            <button
              type="button"
              onClick={handlePrevYear}
              className="p-1 rounded-lg hover:bg-card dark:hover:bg-slate-700 text-muted-foreground transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <span className="px-3 text-xs font-bold fin-num text-foreground dark:text-white">
              FY {selectedYear}
            </span>

            <button
              type="button"
              onClick={handleNextYear}
              className="p-1 rounded-lg hover:bg-card dark:hover:bg-slate-700 text-muted-foreground transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Lock Line */}
        <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-muted border border-border dark:border-border text-xs font-medium text-foreground">
          <Lock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span>
            Books locked through <strong className="text-foreground dark:text-white fin-num">{booksLockedThroughLabel}</strong>
          </span>
        </div>
      </div>

      {/* Header Action Buttons */}
      {isAdmin && (
        <div className="flex items-center gap-2 shrink-0 self-end md:self-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenGenerateSheet}
            className="h-9 text-xs font-semibold rounded-xl"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
            Generate periods
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenFySheet}
            className="h-9 text-xs font-semibold rounded-xl border-border text-foreground hover:bg-muted"
          >
            <Lock className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
            Close fiscal year
          </Button>
          <Button
            onClick={onOpenNewSheet}
            className="bg-[#FA634E] hover:bg-[#e0523d] text-white h-9 text-xs font-semibold px-3.5 rounded-xl shadow-xs"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            New period
          </Button>
        </div>
      )}
    </div>
  );
}
