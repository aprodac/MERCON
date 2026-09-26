import * as React from 'react';
import {
  format,
  parseISO,
  isValid,
  addHours,
  addDays,
  setHours,
  setMinutes,
  isBefore,
  isToday,
  isTomorrow,
  formatDistanceToNow,
  startOfDay,
  isSameDay,
} from 'date-fns';
import { Calendar as CalendarIcon, Clock, Check, X, Sparkles, ChevronRight, Zap } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

export interface DateTimePickerProps {
  value?: string | Date | null; // Supports "YYYY-MM-DDTHH:mm" format or Date object
  onChange?: (isoString: string, dateObj?: Date) => void;
  placeholder?: string;
  disabled?: boolean;
  minDate?: Date;
  maxDate?: Date;
  showPresets?: boolean;
  showRelativeBadge?: boolean;
  clearable?: boolean;
  className?: string;
  id?: string;
  error?: boolean;
  label?: string;
}

export function DateTimePicker({
  value,
  onChange,
  placeholder = 'Pick date & time...',
  disabled = false,
  minDate,
  maxDate,
  showPresets = true,
  showRelativeBadge = true,
  clearable = true,
  className,
  id,
  error = false,
  label,
}: DateTimePickerProps) {
  const [open, setOpen] = React.useState(false);

  // Convert input value to a valid Date object
  const parsedDate = React.useMemo<Date | undefined>(() => {
    if (!value) return undefined;
    if (value instanceof Date) {
      return isValid(value) ? value : undefined;
    }
    if (typeof value === 'string') {
      if (!value.trim()) return undefined;
      let str = value.trim();
      if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(str)) {
        const parts = str.split(':');
        const h = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        const d = new Date();
        d.setHours(h, m, 0, 0);
        return d;
      }
      const d = parseISO(str);
      return isValid(d) ? d : undefined;
    }
    return undefined;
  }, [value]);

  // Internal time states
  const hours24 = parsedDate ? parsedDate.getHours() : 9; // Default 09:00 AM
  const minutes = parsedDate ? parsedDate.getMinutes() : 0;
  const isPM = hours24 >= 12;
  const hours12 = hours24 === 0 ? 12 : hours24 > 12 ? hours24 - 12 : hours24;

  const emitDateTime = (d: Date) => {
    // Format to "YYYY-MM-DDTHH:mm" for seamless datetime-local API compatibility
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    const formatted = `${year}-${month}-${day}T${hours}:${mins}`;
    onChange?.(formatted, d);
  };

  const handleDateSelect = (newDate: Date | undefined) => {
    if (!newDate) return;
    const updated = setMinutes(setHours(newDate, hours24), minutes);
    emitDateTime(updated);
  };

  const handleTimeChange = (newHours24: number, newMinutes: number) => {
    const baseDate = parsedDate || new Date();
    const updated = setMinutes(setHours(baseDate, newHours24), newMinutes);
    emitDateTime(updated);
  };

  const handle12hTime = (h12: number, mins: number, pm: boolean) => {
    let h24 = h12;
    if (pm && h12 < 12) h24 = h12 + 12;
    if (!pm && h12 === 12) h24 = 0;
    handleTimeChange(h24, mins);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange?.('', undefined);
  };

  // Quick Preset Handlers
  const applyPreset = (presetType: 'now' | 'plus1h' | 'plus3h' | 'plus6h' | 'tomorrow08' | 'tomorrow14' | 'nextDayEod') => {
    const now = new Date();
    let target: Date;

    switch (presetType) {
      case 'now':
        target = now;
        break;
      case 'plus1h':
        target = addHours(now, 1);
        break;
      case 'plus3h':
        target = addHours(now, 3);
        break;
      case 'plus6h':
        target = addHours(now, 6);
        break;
      case 'tomorrow08':
        target = setMinutes(setHours(addDays(now, 1), 8), 0);
        break;
      case 'tomorrow14':
        target = setMinutes(setHours(addDays(now, 1), 14), 0);
        break;
      case 'nextDayEod':
        target = setMinutes(setHours(addDays(now, 1), 23), 59);
        break;
      default:
        target = now;
    }

    emitDateTime(target);
  };

  // Relative badge computation (e.g. "Today 2:30 PM", "Tomorrow 8:00 AM", "In 3 hours")
  const relativeText = React.useMemo(() => {
    if (!parsedDate) return null;
    const now = new Date();
    const isPast = isBefore(parsedDate, now);

    if (isToday(parsedDate)) {
      return `Today • ${format(parsedDate, 'h:mm a')}`;
    }
    if (isTomorrow(parsedDate)) {
      return `Tomorrow • ${format(parsedDate, 'h:mm a')}`;
    }
    try {
      const dist = formatDistanceToNow(parsedDate, { addSuffix: true });
      return `${dist}`;
    } catch {
      return format(parsedDate, 'MMM d, h:mm a');
    }
  }, [parsedDate]);

  // Available hour and minute chips
  const quickHours = [
    { label: '06:00 AM', h: 6, m: 0 },
    { label: '08:00 AM', h: 8, m: 0 },
    { label: '10:00 AM', h: 10, m: 0 },
    { label: '12:00 PM', h: 12, m: 0 },
    { label: '02:00 PM', h: 14, m: 0 },
    { label: '04:00 PM', h: 16, m: 0 },
    { label: '06:00 PM', h: 18, m: 0 },
    { label: '08:00 PM', h: 20, m: 0 },
    { label: '11:59 PM', h: 23, m: 59 },
  ];

  const minuteSteps = [0, 15, 30, 45];
  const hours12List = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  return (
    <div className={cn('relative inline-block w-full', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            id={id}
            type="button"
            disabled={disabled}
            className={cn(
              'group relative flex w-full items-center justify-between gap-1.5 rounded-xl border border-input bg-background px-2.5 py-1 text-left text-xs transition-all duration-200 hover:border-primary/50 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1',
              !parsedDate && 'text-muted-foreground',
              error && 'border-red-500 ring-2 ring-red-500/30 bg-red-50/20 text-red-900 dark:text-red-200',
              disabled && 'opacity-50 cursor-not-allowed pointer-events-none'
            )}
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <div className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                <CalendarIcon className="size-3" />
              </div>

              <div className="flex flex-col min-w-0">
                {label && (
                  <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                    {label}
                  </span>
                )}
                {parsedDate ? (
                  <div className="flex flex-col text-left leading-tight min-w-0">
                    <span className="font-extrabold text-slate-900 dark:text-white text-xs truncate">
                      {format(parsedDate, 'MMM d, yyyy')}
                    </span>
                    <span className="text-[10.5px] font-semibold text-slate-500 dark:text-slate-400 truncate">
                      {format(parsedDate, 'hh:mm a')}
                    </span>
                  </div>
                ) : (
                  <span className="text-xs font-semibold text-slate-400">
                    {placeholder}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {clearable && parsedDate && !disabled && (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={handleClear}
                  onKeyDown={(e) => e.key === 'Enter' && handleClear(e as any)}
                  className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  title="Clear schedule"
                >
                  <X className="size-3.5" />
                </div>
              )}
              <Clock className="size-3.5 text-muted-foreground/60 group-hover:text-primary transition-colors" />
            </div>
          </button>
        </PopoverTrigger>

        <PopoverContent
          className="w-auto p-0 rounded-2xl shadow-2xl border-border bg-popover z-[9999] overflow-hidden"
          align="start"
        >
          {/* Header Bar */}
          <div className="border-b bg-muted/30 p-3 flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Sparkles className="size-3 text-primary" />
                Logistics Dispatch Scheduler
              </span>
              {parsedDate && (
                <Badge variant="outline" className="text-[10px] font-mono font-semibold bg-background">
                  AST (UTC+3)
                </Badge>
              )}
            </div>

            <div className="flex items-center justify-between pt-0.5">
              <span className="text-sm font-bold text-foreground font-mono">
                {parsedDate ? format(parsedDate, 'EEE, MMM d, yyyy • hh:mm a') : 'No schedule chosen'}
              </span>
              {relativeText && (
                <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-md">
                  {relativeText}
                </span>
              )}
            </div>
          </div>

          {/* Quick Presets Bar */}
          {showPresets && (
            <div className="p-2 border-b bg-muted/10 flex flex-wrap items-center gap-1">
              <button
                type="button"
                onClick={() => applyPreset('now')}
                className="text-[11px] px-2 py-1 rounded-lg font-medium bg-background hover:bg-muted text-foreground border border-border/70 hover:border-primary/50 transition-all flex items-center gap-1"
              >
                <Zap className="w-3.5 h-3.5 text-amber-500 fill-amber-500 shrink-0" />
                <span>Now / ASAP</span>
              </button>
              <button
                type="button"
                onClick={() => applyPreset('plus1h')}
                className="text-[11px] px-2 py-1 rounded-lg font-medium bg-background hover:bg-muted text-foreground border border-border/70 hover:border-primary/50 transition-all"
              >
                +1 Hour
              </button>
              <button
                type="button"
                onClick={() => applyPreset('plus3h')}
                className="text-[11px] px-2 py-1 rounded-lg font-medium bg-background hover:bg-muted text-foreground border border-border/70 hover:border-primary/50 transition-all"
              >
                +3 Hours
              </button>
              <button
                type="button"
                onClick={() => applyPreset('tomorrow08')}
                className="text-[11px] px-2 py-1 rounded-lg font-medium bg-background hover:bg-muted text-foreground border border-border/70 hover:border-primary/50 transition-all"
              >
                Tomorrow 08:00 AM
              </button>
              <button
                type="button"
                onClick={() => applyPreset('tomorrow14')}
                className="text-[11px] px-2 py-1 rounded-lg font-medium bg-background hover:bg-muted text-foreground border border-border/70 hover:border-primary/50 transition-all"
              >
                Tomorrow 02:00 PM
              </button>
            </div>
          )}

          {/* Main Body: Calendar on Left, Precision Time on Right */}
          <div className="flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-border">
            {/* Calendar section */}
            <div className="p-2">
              <Calendar
                mode="single"
                selected={parsedDate}
                onSelect={handleDateSelect}
                disabled={(date) => {
                  if (minDate && isBefore(startOfDay(date), startOfDay(minDate))) return true;
                  if (maxDate && isBefore(startOfDay(maxDate), startOfDay(date))) return true;
                  return false;
                }}
                autoFocus
              />
            </div>

            {/* Time selection section */}
            <div className="p-3 w-full md:w-64 space-y-3 bg-muted/10 flex flex-col justify-between">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <Clock className="size-3.5 text-primary" /> Target Time
                  </span>
                  <span className="text-xs font-mono font-bold text-primary">
                    {parsedDate ? format(parsedDate, 'hh:mm a') : '--:--'}
                  </span>
                </div>

                {/* 12h Stepper Pill */}
                <div className="flex items-center gap-1.5 bg-background p-1.5 rounded-xl border border-border">
                  {/* Hours 1-12 */}
                  <div className="flex-1">
                    <label className="block text-[9px] uppercase font-bold text-muted-foreground text-center mb-0.5">
                      Hour
                    </label>
                    <select
                      value={hours12}
                      onChange={(e) => handle12hTime(parseInt(e.target.value, 10), minutes, isPM)}
                      className="w-full text-center font-mono font-bold text-xs bg-muted/40 hover:bg-muted py-1.5 rounded-lg border-0 focus:ring-1 focus:ring-primary outline-none cursor-pointer"
                    >
                      {hours12List.map((h) => {
                        const h24 = isPM ? (h < 12 ? h + 12 : 12) : (h === 12 ? 0 : h);
                        const isHourDisabled = Boolean(
                          minDate && parsedDate && isSameDay(parsedDate, minDate) && h24 < minDate.getHours()
                        );
                        return (
                          <option key={h} value={h} disabled={isHourDisabled}>
                            {String(h).padStart(2, '0')}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  <span className="font-bold text-muted-foreground pt-3">:</span>

                  {/* Minutes */}
                  <div className="flex-1">
                    <label className="block text-[9px] uppercase font-bold text-muted-foreground text-center mb-0.5">
                      Min
                    </label>
                    <select
                      value={minutes}
                      onChange={(e) => handle12hTime(hours12, parseInt(e.target.value, 10), isPM)}
                      className="w-full text-center font-mono font-bold text-xs bg-muted/40 hover:bg-muted py-1.5 rounded-lg border-0 focus:ring-1 focus:ring-primary outline-none cursor-pointer"
                    >
                      {Array.from({ length: 12 }, (_, i) => i * 5).map((m) => {
                        const isMinDisabled = Boolean(
                          minDate && parsedDate && isSameDay(parsedDate, minDate) && hours24 === minDate.getHours() && m <= minDate.getMinutes()
                        );
                        return (
                          <option key={m} value={m} disabled={isMinDisabled}>
                            {String(m).padStart(2, '0')}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  {/* AM / PM Toggle */}
                  <div className="flex flex-col gap-0.5 pt-3">
                    <button
                      type="button"
                      disabled={Boolean(minDate && parsedDate && isSameDay(parsedDate, minDate) && minDate.getHours() >= 12)}
                      onClick={() => handle12hTime(hours12, minutes, false)}
                      className={cn(
                        'text-[10px] font-bold px-2 py-0.5 rounded-md transition-all',
                        !isPM
                          ? 'bg-primary text-primary-foreground shadow-xs'
                          : 'bg-muted text-muted-foreground hover:text-foreground',
                        Boolean(minDate && parsedDate && isSameDay(parsedDate, minDate) && minDate.getHours() >= 12) && 'opacity-40 cursor-not-allowed'
                      )}
                    >
                      AM
                    </button>
                    <button
                      type="button"
                      onClick={() => handle12hTime(hours12, minutes, true)}
                      className={cn(
                        'text-[10px] font-bold px-2 py-0.5 rounded-md transition-all',
                        isPM
                          ? 'bg-primary text-primary-foreground shadow-xs'
                          : 'bg-muted text-muted-foreground hover:text-foreground'
                      )}
                    >
                      PM
                    </button>
                  </div>
                </div>

                {/* Quick Shift Time Chips */}
                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Common Dispatch Hours
                  </span>
                  <div className="grid grid-cols-3 gap-1">
                    {quickHours.map((qh) => {
                      const isSelected = parsedDate && hours24 === qh.h && minutes === qh.m;
                      const isChipDisabled = Boolean(
                        minDate &&
                        parsedDate &&
                        isSameDay(parsedDate, minDate) &&
                        (qh.h < minDate.getHours() || (qh.h === minDate.getHours() && qh.m <= minDate.getMinutes()))
                      );
                      return (
                        <button
                          key={qh.label}
                          type="button"
                          disabled={isChipDisabled}
                          onClick={() => handleTimeChange(qh.h, qh.m)}
                          className={cn(
                            'text-[10px] py-1 px-1 rounded-md font-mono transition-all text-center truncate',
                            isSelected
                              ? 'bg-primary text-primary-foreground font-bold shadow-xs'
                              : 'bg-background hover:bg-muted text-foreground border border-border/60',
                            isChipDisabled && 'opacity-40 cursor-not-allowed pointer-events-none'
                          )}
                        >
                          {qh.label.replace(' ', '')}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Bottom Apply Bar */}
              <div className="pt-2 border-t flex items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onChange?.('', undefined)}
                  className="h-7 text-xs text-destructive hover:bg-destructive/10 px-2"
                >
                  Clear
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setOpen(false)}
                  className="h-7 text-xs px-3 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold gap-1"
                >
                  <Check className="size-3" /> Apply
                </Button>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export default DateTimePicker;
