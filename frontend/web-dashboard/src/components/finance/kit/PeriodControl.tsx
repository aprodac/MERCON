import { useEffect, useState } from 'react';
import { CalendarIcon, ChevronDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { resolvePeriodPreset, type PeriodPreset } from '@/lib/finance/pnlPeriodHelpers';
import { formatDate } from '@/lib/finance/format';
import { cn } from '@/lib/utils';

export const PERIOD_LABEL: Record<PeriodPreset, string> = {
  this_month: 'This month',
  last_month: 'Last month',
  this_quarter: 'This quarter',
  last_quarter: 'Last quarter',
  ytd: 'Year to date',
  this_year: 'This year',
  last_year: 'Last year',
  custom: 'Custom range',
};

const PRESETS: PeriodPreset[] = ['this_month', 'last_month', 'this_quarter', 'last_quarter', 'ytd', 'this_year', 'last_year'];

/** Reporting period: presets on the left, a from–to range on the right. */
export function PeriodControl({
  preset,
  from,
  to,
  onChange,
  allowAll = false,
}: {
  preset: PeriodPreset;
  from: string;
  to: string;
  onChange: (next: { preset: PeriodPreset; from: string; to: string }) => void;
  /** Offer "Any date" (no range); shown when `from` and `to` are empty. */
  allowAll?: boolean;
}) {
  const any = allowAll && !from && !to;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ from, to });
  useEffect(() => {
    if (open) setDraft({ from, to });
  }, [open, from, to]);

  const valid = Boolean(draft.from && draft.to && draft.from <= draft.to);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-2 text-xs font-normal">
          <CalendarIcon className="size-3.5 text-muted-foreground" />
          <span className="font-medium">{any ? 'Any date' : PERIOD_LABEL[preset]}</span>
          {!any && (
            <span className="text-muted-foreground">
              {formatDate(from)} – {formatDate(to)}
            </span>
          )}
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-auto gap-0 p-0">
        <div className="flex w-36 flex-col gap-0.5 border-r p-1.5">
          {allowAll && (
            <button
              type="button"
              onClick={() => {
                onChange({ preset: 'custom', from: '', to: '' });
                setOpen(false);
              }}
              className={cn('rounded-md px-2 py-1.5 text-left text-xs outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring', any && 'bg-muted font-medium')}
            >
              Any date
            </button>
          )}
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => {
                onChange({ preset: p, ...resolvePeriodPreset(p) });
                setOpen(false);
              }}
              className={cn(
                'rounded-md px-2 py-1.5 text-left text-xs outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring',
                !any && preset === p && 'bg-muted font-medium',
              )}
            >
              {PERIOD_LABEL[p]}
            </button>
          ))}
        </div>
        <div className="w-56 space-y-2 p-3">
          <p className="text-xs font-medium">Custom range</p>
          <div className="space-y-1">
            <Label htmlFor="period-from" className="text-[11px] text-muted-foreground">From</Label>
            <Input id="period-from" type="date" value={draft.from} onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))} className="h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="period-to" className="text-[11px] text-muted-foreground">To</Label>
            <Input id="period-to" type="date" value={draft.to} onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))} className="h-8 text-xs" />
          </div>
          {!valid && draft.from && draft.to && <p className="text-[11px] text-chip-negative-fg">The start date is after the end date.</p>}
          <Button
            size="sm"
            className="h-8 w-full text-xs"
            disabled={!valid}
            onClick={() => {
              onChange({ preset: 'custom', from: draft.from, to: draft.to });
              setOpen(false);
            }}
          >
            Apply range
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
