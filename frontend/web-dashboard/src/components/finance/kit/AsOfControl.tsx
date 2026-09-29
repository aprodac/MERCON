import { useState } from 'react';
import { CalendarIcon } from 'lucide-react';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/finance/format';

export type AsOfPreset = 'today' | 'month' | 'quarter' | 'year';

const PRESET_LABEL: Record<AsOfPreset, string> = {
  today: 'Today',
  month: 'End of last month',
  quarter: 'End of last quarter',
  year: 'End of last year',
};

const dateOnly = (y: number, m: number, d: number) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  const dt = new Date(y, m, d);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
};

/** Preset → date-only string, built from local calendar parts so it never shifts a day across time zones. */
export function asOfPresetDate(preset: AsOfPreset, now = new Date()): string {
  const y = now.getFullYear();
  const m = now.getMonth();
  if (preset === 'month') return dateOnly(y, m, 0);
  if (preset === 'quarter') return dateOnly(y, Math.floor(m / 3) * 3, 0);
  if (preset === 'year') return dateOnly(y, 0, 0);
  return dateOnly(y, m, now.getDate());
}

/** "As of" date button: presets on top, a calendar below. */
export function AsOfControl({
  value,
  onChange,
  presets = ['today', 'month', 'quarter'],
  label = 'As of',
}: {
  value: string;
  onChange: (date: string) => void;
  presets?: AsOfPreset[];
  /** Word before the date: "As of", or "vs" for a comparison date. */
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const pick = (date: string) => {
    onChange(date);
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-2 text-xs font-normal">
          <CalendarIcon className="size-3.5 text-muted-foreground" />
          {label} <span className="font-medium">{formatDate(value)}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <div className="flex flex-wrap gap-1 border-b p-2">
          {presets.map((p) => (
            <Button key={p} variant="ghost" size="sm" className="h-7 text-xs" onClick={() => pick(asOfPresetDate(p))}>
              {PRESET_LABEL[p]}
            </Button>
          ))}
        </div>
        <Calendar
          mode="single"
          selected={new Date(`${value}T12:00:00`)}
          onSelect={(d) => d && pick(dateOnly(d.getFullYear(), d.getMonth(), d.getDate()))}
        />
      </PopoverContent>
    </Popover>
  );
}
