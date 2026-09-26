import * as React from 'react';
import { Clock, Check, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

export interface TimePickerProps {
  value?: string; // Standard "HH:mm" (24-hour, e.g. "14:30")
  onChange?: (time: string) => void;
  placeholder?: string;
  disabled?: boolean;
  stepMinutes?: number; // default 5 or 15
  showPresets?: boolean;
  clearable?: boolean;
  format12h?: boolean;
  className?: string;
  buttonClassName?: string;
  id?: string;
  error?: boolean;
}

const COMMON_DISPATCH_PRESETS = [
  { label: '08:00 AM', time: '08:00' },
  { label: '02:00 PM', time: '14:00' },
  { label: '08:00 PM', time: '20:00' },
  { label: '11:00 PM', time: '23:00' },
];

export function TimePicker({
  value = '',
  onChange,
  placeholder = 'Select time...',
  disabled = false,
  stepMinutes = 15,
  showPresets = true,
  clearable = true,
  format12h = true,
  className,
  buttonClassName,
  id,
  error = false,
}: TimePickerProps) {
  const [open, setOpen] = React.useState(false);

  // Refs for auto-scrolling
  const selectedHourRef = React.useRef<HTMLButtonElement | null>(null);
  const selectedMinRef = React.useRef<HTMLButtonElement | null>(null);

  // Parse "HH:mm" into hours and minutes
  const parsed = React.useMemo(() => {
    if (!value || !value.includes(':')) {
      return { hours24: 8, minutes: 0, period: 'AM' as 'AM' | 'PM', hours12: 8, raw: '' };
    }
    const [hStr, mStr] = value.split(':');
    const h = parseInt(hStr, 10) || 0;
    const m = parseInt(mStr, 10) || 0;
    const period = h >= 12 ? ('PM' as const) : ('AM' as const);
    const hours12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return {
      hours24: h,
      minutes: m,
      period,
      hours12,
      raw: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
    };
  }, [value]);

  const formatDisplayTime = (val: string) => {
    if (!val) return placeholder;
    if (!format12h) return val;
    const [hStr, mStr] = val.split(':');
    const h = parseInt(hStr, 10) || 0;
    const m = parseInt(mStr, 10) || 0;
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${period}`;
  };

  const handleTimeChange = (newHours24: number, newMinutes: number) => {
    const h = Math.max(0, Math.min(23, newHours24));
    const m = Math.max(0, Math.min(59, newMinutes));
    const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    onChange?.(timeStr);
  };

  const handle12hChange = (h12: number, m: number, period: 'AM' | 'PM') => {
    let h24 = h12;
    if (period === 'PM' && h12 < 12) h24 = h12 + 12;
    if (period === 'AM' && h12 === 12) h24 = 0;
    handleTimeChange(h24, m);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange?.('');
  };

  // Auto-scroll selected items into view when opened
  React.useEffect(() => {
    if (open) {
      setTimeout(() => {
        selectedHourRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        selectedMinRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }, 50);
    }
  }, [open]);

  // Generate hour options
  const hours12List = Array.from({ length: 12 }, (_, i) => i + 1);
  const minutesList = Array.from(
    { length: Math.ceil(60 / (stepMinutes || 5)) },
    (_, i) => i * (stepMinutes || 5)
  );

  return (
    <div className={cn('relative inline-block w-full', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn(
              'w-full justify-between text-left font-normal h-9 px-3 rounded-xl border-input bg-background transition-all hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-[#FA634E] focus-visible:outline-none focus-visible:border-[#FA634E]',
              !value && 'text-muted-foreground',
              error && 'border-red-500 ring-2 ring-red-500/30 bg-red-50/20 text-red-900 dark:text-red-200',
              disabled && 'opacity-50 cursor-not-allowed',
              buttonClassName
            )}
          >
            <div className="flex items-center gap-2 truncate">
              <Clock className="w-4 h-4 text-emerald-600 shrink-0 opacity-90" />
              <span className="truncate text-xs font-mono font-bold">
                {formatDisplayTime(value)}
              </span>
            </div>

            {clearable && value && !disabled && (
              <div
                role="button"
                tabIndex={-1}
                onClick={handleClear}
                className="p-1 hover:bg-muted rounded-md text-muted-foreground hover:text-foreground transition-colors shrink-0"
                title="Clear time"
              >
                <X className="w-3.5 h-3.5" />
              </div>
            )}
          </Button>
        </PopoverTrigger>

        <PopoverContent
          className="w-72 p-0 rounded-2xl shadow-xl border-border bg-popover z-[9999]"
          align="start"
          side="bottom"
          sideOffset={4}
          onWheel={(e) => e.stopPropagation()}
        >
          {/* Header Display + Direct Dropdown Selectors */}
          <div className="p-3 space-y-2 border-b bg-muted/20">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3 text-[#FA634E]" />
                Select Time
              </span>
              <span className="text-xs font-bold font-mono text-[#FA634E] bg-orange-50 dark:bg-orange-950/40 px-2 py-0.5 rounded border border-orange-200 dark:border-orange-900">
                {value ? formatDisplayTime(value) : '08:00 AM'}
              </span>
            </div>

            {/* Direct Select Dropdowns */}
            <div className="grid grid-cols-3 gap-1.5 pt-1">
              <div>
                <label className="block text-[9px] uppercase font-extrabold text-muted-foreground text-center mb-0.5">
                  Hour
                </label>
                <select
                  value={parsed.hours12}
                  onChange={(e) => handle12hChange(parseInt(e.target.value, 10), parsed.minutes, parsed.period)}
                  className="w-full text-center font-mono font-bold text-xs bg-background border border-input py-1 rounded-lg focus:ring-1 focus:ring-[#FA634E] outline-none cursor-pointer"
                >
                  {hours12List.map((h) => (
                    <option key={h} value={h}>
                      {String(h).padStart(2, '0')}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[9px] uppercase font-extrabold text-muted-foreground text-center mb-0.5">
                  Min
                </label>
                <select
                  value={parsed.minutes}
                  onChange={(e) => handle12hChange(parsed.hours12, parseInt(e.target.value, 10), parsed.period)}
                  className="w-full text-center font-mono font-bold text-xs bg-background border border-input py-1 rounded-lg focus:ring-1 focus:ring-[#FA634E] outline-none cursor-pointer"
                >
                  {minutesList.map((m) => (
                    <option key={m} value={m}>
                      {String(m).padStart(2, '0')}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[9px] uppercase font-extrabold text-muted-foreground text-center mb-0.5">
                  Shift
                </label>
                <select
                  value={parsed.period}
                  onChange={(e) => handle12hChange(parsed.hours12, parsed.minutes, e.target.value as 'AM' | 'PM')}
                  className="w-full text-center font-mono font-bold text-xs bg-background border border-input py-1 rounded-lg focus:ring-1 focus:ring-[#FA634E] outline-none cursor-pointer"
                >
                  <option value="AM">AM</option>
                  <option value="PM">PM</option>
                </select>
              </div>
            </div>
          </div>

          {/* Interactive Scrollable Lists with Mouse Wheel & Auto-Scroll Support */}
          <div className="p-3 space-y-2">
            <div className="grid grid-cols-3 gap-1.5">
              {/* Hours 12 column */}
              <div className="space-y-1 text-center">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Hour</span>
                <div
                  onWheel={(e) => e.stopPropagation()}
                  className="h-36 overflow-y-auto rounded-lg border bg-background p-1 space-y-1 scrollbar-thin shadow-inner"
                >
                  {hours12List.map((h) => {
                    const isSelected = parsed.raw && parsed.hours12 === h;
                    return (
                      <button
                        key={h}
                        ref={isSelected ? selectedHourRef : null}
                        type="button"
                        onClick={() => handle12hChange(h, parsed.minutes, parsed.period)}
                        className={cn(
                          'w-full py-1 rounded-md text-xs font-mono font-bold transition-all cursor-pointer',
                          isSelected
                            ? 'bg-[#FA634E] text-white shadow-2xs'
                            : 'hover:bg-muted text-foreground'
                        )}
                      >
                        {String(h).padStart(2, '0')}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Minutes column */}
              <div className="space-y-1 text-center">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Min</span>
                <div
                  onWheel={(e) => e.stopPropagation()}
                  className="h-36 overflow-y-auto rounded-lg border bg-background p-1 space-y-1 scrollbar-thin shadow-inner"
                >
                  {minutesList.map((m) => {
                    const isSelected = parsed.raw && parsed.minutes === m;
                    return (
                      <button
                        key={m}
                        ref={isSelected ? selectedMinRef : null}
                        type="button"
                        onClick={() => handle12hChange(parsed.hours12, m, parsed.period)}
                        className={cn(
                          'w-full py-1 rounded-md text-xs font-mono font-bold transition-all cursor-pointer',
                          isSelected
                            ? 'bg-[#FA634E] text-white shadow-2xs'
                            : 'hover:bg-muted text-foreground'
                        )}
                      >
                        {String(m).padStart(2, '0')}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Shift AM / PM column */}
              <div className="space-y-1 text-center">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Shift</span>
                <div className="flex flex-col gap-1.5 pt-1">
                  {(['AM', 'PM'] as const).map((p) => {
                    const isSelected = parsed.raw && parsed.period === p;
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => handle12hChange(parsed.hours12, parsed.minutes, p)}
                        className={cn(
                          'py-2 rounded-lg text-xs font-black transition-all cursor-pointer',
                          isSelected
                            ? 'bg-[#FA634E] text-white shadow-2xs'
                            : 'border border-border hover:bg-muted text-foreground'
                        )}
                      >
                        {p}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Quick Common Presets Bar */}
          <div className="px-3 py-2 border-t bg-muted/20 flex flex-wrap items-center justify-between gap-1">
            <div className="flex flex-wrap items-center gap-1">
              {COMMON_DISPATCH_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => onChange?.(preset.time)}
                  className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-background hover:bg-orange-50 hover:text-[#FA634E] border border-border text-foreground transition-colors cursor-pointer"
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <Button
              type="button"
              size="sm"
              onClick={() => setOpen(false)}
              className="text-xs h-7 px-3 rounded-lg bg-[#FA634E] hover:bg-[#e0533e] text-white font-bold cursor-pointer"
            >
              Done
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export default TimePicker;
