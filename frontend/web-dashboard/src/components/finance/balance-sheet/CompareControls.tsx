import { ArrowUpDown, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SegmentedControl } from '@/components/finance/kit/SegmentedControl';
import { AsOfControl } from '@/components/finance/kit/AsOfControl';
import { TONE_CLASSES } from '@/components/finance/kit/tones';
import { changeTone, type BsChange, type BsCompareMode } from '@/lib/finance/bsStructure';
import { formatMoney } from '@/lib/finance/format';
import { cn } from '@/lib/utils';

const MODES: { value: BsCompareMode; label: string }[] = [
  { value: 'none', label: 'No comparison' },
  { value: 'prev_month', label: 'Last month end' },
  { value: 'prev_year', label: 'Same month last year' },
  { value: 'custom', label: 'Pick a date' },
];

/** Comparison mode buttons, plus the date picker when "Pick a date" is on. */
export function CompareModePicker({
  mode,
  customDate,
  onMode,
  onCustomDate,
}: {
  mode: BsCompareMode;
  customDate: string;
  onMode: (mode: BsCompareMode) => void;
  onCustomDate: (date: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <SegmentedControl aria-label="Compare with" value={mode} onChange={onMode} options={MODES} />
      {mode === 'custom' && <AsOfControl label="vs" value={customDate} onChange={onCustomDate} presets={['month', 'quarter', 'year']} />}
    </div>
  );
}

/** "Only changed" filter toggle. */
export function OnlyChangedToggle({ pressed, onPressedChange }: { pressed: boolean; onPressedChange: (v: boolean) => void }) {
  return (
    <Button
      variant="outline"
      size="sm"
      aria-pressed={pressed}
      onClick={() => onPressedChange(!pressed)}
      className={cn('h-8 gap-1.5 text-xs', pressed && 'border-foreground/30 bg-muted')}
    >
      <Filter className="size-3.5" /> Only changed
    </Button>
  );
}

/** The accounts that moved most; picking one opens its ledger. */
export function BiggestChanges({ changes, onPick }: { changes: BsChange[]; onPick: (change: BsChange) => void }) {
  if (changes.length === 0) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
          <ArrowUpDown className="size-3.5" /> Biggest changes
          <span className="rounded-full bg-muted px-1.5 text-[10px] font-semibold tabular-nums">{changes.length}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-1.5">
        <ul>
          {changes.map((c) => {
            const tone = changeTone(c.section, c.delta);
            return (
              <li key={c.row.key}>
                <button
                  type="button"
                  onClick={() => onPick(c)}
                  className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-xs outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-foreground">{c.row.item.name}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">{c.group}</span>
                  </span>
                  <span className={cn('fin-num shrink-0 font-medium', tone ? TONE_CLASSES[tone].fg : 'text-muted-foreground')}>
                    {c.delta > 0 ? '+' : '−'}
                    {formatMoney(Math.abs(c.delta))}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
