import * as React from 'react';
import { format, parseISO, isValid, addDays, isBefore, isToday, isTomorrow, isYesterday, startOfDay, isSameDay } from 'date-fns';
import { Calendar as CalendarIcon, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export interface DateTimePickerProps {
  value?: string | Date | null; // Supports "YYYY-MM-DDTHH:mm" format or Date object
  onChange?: (isoString: string, dateObj?: Date) => void;
  placeholder?: string;
  disabled?: boolean;
  minDate?: Date;
  maxDate?: Date;
  /** Kept for API compatibility — the day shortcuts are always shown. */
  showPresets?: boolean;
  /** Kept for API compatibility. */
  showRelativeBadge?: boolean;
  clearable?: boolean;
  className?: string;
  id?: string;
  error?: boolean;
  label?: string;
}

const QUICK_TIMES = ['06:00', '08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00', '22:00'];

/** "8", "800", "0800", "8:0", "08:00" → "08:00"; anything else → null. */
function normalizeTyped(raw: string): string | null {
  const s = raw.trim().replace(/[.\s]/g, ':');
  let h: number;
  let m: number;
  if (s.includes(':')) {
    const [hs, ms = '0'] = s.split(':');
    h = Number(hs);
    m = Number(ms);
  } else if (/^\d{1,4}$/.test(s)) {
    if (s.length <= 2) {
      h = Number(s);
      m = 0;
    } else {
      h = Number(s.slice(0, s.length - 2));
      m = Number(s.slice(-2));
    }
  } else {
    return null;
  }
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const dayWord = (d: Date) =>
  isToday(d) ? 'Today' : isTomorrow(d) ? 'Tomorrow' : isYesterday(d) ? 'Yesterday' : null;

export function DateTimePicker({
  value,
  onChange,
  placeholder = 'Pick date and time',
  disabled = false,
  minDate,
  maxDate,
  clearable = true,
  className,
  id,
  error = false,
  label,
}: DateTimePickerProps) {
  const [open, setOpen] = React.useState(false);
  // What the user has chosen since opening: the popup closes once both are set.
  const pickedRef = React.useRef({ day: false, time: false });
  const [typed, setTyped] = React.useState('');
  const [typedError, setTypedError] = React.useState(false);

  const parsedDate = React.useMemo<Date | undefined>(() => {
    if (!value) return undefined;
    if (value instanceof Date) return isValid(value) ? value : undefined;
    const str = String(value).trim();
    if (!str) return undefined;
    const d = parseISO(str);
    return isValid(d) ? d : undefined;
  }, [value]);

  const currentTime = parsedDate ? format(parsedDate, 'HH:mm') : '';

  React.useEffect(() => {
    if (open) {
      pickedRef.current = { day: false, time: false };
      setTyped(currentTime);
      setTypedError(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const emit = (day: Date, time: string) => {
    const iso = `${format(day, 'yyyy-MM-dd')}T${time}`;
    const [h, m] = time.split(':').map(Number);
    const d = new Date(day);
    d.setHours(h, m, 0, 0);
    onChange?.(iso, d);
  };

  const isDayDisabled = (date: Date) => {
    if (minDate && isBefore(startOfDay(date), startOfDay(minDate))) return true;
    if (maxDate && isBefore(startOfDay(maxDate), startOfDay(date))) return true;
    return false;
  };

  const isTimeDisabled = (time: string) => {
    if (!minDate) return false;
    const day = parsedDate || minDate;
    if (!isSameDay(day, minDate)) return false;
    return time <= format(minDate, 'HH:mm');
  };

  const pickDay = (day: Date | undefined) => {
    if (!day || isDayDisabled(day)) return;
    pickedRef.current.day = true;
    // Until a time is chosen, keep the current one (or the earliest allowed on that day).
    const time = currentTime || (minDate && isSameDay(day, minDate) ? format(minDate, 'HH:mm') : '08:00');
    emit(day, time);
    if (pickedRef.current.time) setOpen(false);
  };

  const pickTime = (time: string) => {
    if (isTimeDisabled(time)) return;
    pickedRef.current.time = true;
    setTyped(time);
    setTypedError(false);
    emit(parsedDate || (minDate && isBefore(new Date(), minDate) ? minDate : new Date()), time);
    // A time is the last thing people pick — close unless the day still needs choosing.
    if (pickedRef.current.day || parsedDate) setOpen(false);
  };

  const commitTyped = () => {
    if (!typed.trim() || typed === currentTime) return;
    const norm = normalizeTyped(typed);
    if (!norm || isTimeDisabled(norm)) {
      setTypedError(true);
      return;
    }
    pickTime(norm);
  };

  const quickDays = [0, 1, 2].map((n) => {
    const d = addDays(new Date(), n);
    return { label: n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : format(d, 'EEE d'), date: d };
  });

  const summary = parsedDate ? `${format(parsedDate, 'EEE d MMM')} · ${format(parsedDate, 'HH:mm')}` : null;
  const relative = parsedDate ? dayWord(parsedDate) : null;

  return (
    <div className={cn('relative inline-block w-full', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            id={id}
            type="button"
            disabled={disabled}
            className={cn(
              'group flex h-9 w-full items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 text-left text-xs shadow-2xs transition-colors hover:border-slate-300 dark:hover:border-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FA634E]/40',
              open && 'border-[#FA634E]/60',
              error && 'border-red-500 ring-2 ring-red-500/30 bg-red-50/20 dark:bg-red-950/20',
              disabled && 'opacity-50 cursor-not-allowed pointer-events-none'
            )}
          >
            <CalendarIcon className="size-3.5 shrink-0 text-slate-400 group-hover:text-[#FA634E]" />
            {label && <span className="text-[11px] text-slate-500 shrink-0">{label}</span>}
            {summary ? (
              <span className="min-w-0 flex-1 truncate font-bold text-slate-900 dark:text-slate-100">
                {summary}
                {relative && <span className="ml-1.5 font-medium text-slate-400">{relative}</span>}
              </span>
            ) : (
              <span className="min-w-0 flex-1 truncate text-slate-400">{placeholder}</span>
            )}
            {clearable && parsedDate && !disabled && (
              <span
                role="button"
                tabIndex={0}
                aria-label="Clear date and time"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange?.('', undefined);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.stopPropagation();
                    onChange?.('', undefined);
                  }
                }}
                className="rounded-md p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
              >
                <X className="size-3.5" />
              </span>
            )}
          </button>
        </PopoverTrigger>

        <PopoverContent className="w-auto p-0 rounded-2xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl z-[9999] overflow-hidden" align="start">
          <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 border-b border-slate-100 dark:border-slate-800">
            <span className="text-sm font-bold text-slate-900 dark:text-slate-100">{summary ?? 'Choose a day, then a time'}</span>
            {relative && <span className="text-xs font-semibold text-[#FA634E]">{relative}</span>}
          </div>

          <div className="flex flex-col sm:flex-row">
            <div className="p-2.5 border-b sm:border-b-0 sm:border-r border-slate-100 dark:border-slate-800">
              <div className="flex gap-1.5 px-1 pb-1.5">
                {quickDays.map((q) => {
                  const active = parsedDate && isSameDay(parsedDate, q.date);
                  const off = isDayDisabled(q.date);
                  return (
                    <button
                      key={q.label}
                      type="button"
                      disabled={off}
                      onClick={() => pickDay(q.date)}
                      className={cn(
                        'rounded-full px-2.5 py-1 text-xs font-semibold border transition-colors',
                        active
                          ? 'bg-orange-50 dark:bg-orange-950/40 border-[#FA634E]/50 text-[#c2410c] dark:text-orange-300'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800',
                        off && 'opacity-40 cursor-not-allowed'
                      )}
                    >
                      {q.label}
                    </button>
                  );
                })}
              </div>
              <Calendar mode="single" selected={parsedDate} onSelect={pickDay} disabled={isDayDisabled} defaultMonth={parsedDate || minDate} />
            </div>

            <div className="p-3 w-full sm:w-56 space-y-2.5">
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400" htmlFor={id ? `${id}-time` : undefined}>
                Time (24h) — type or pick
              </label>
              <input
                id={id ? `${id}-time` : undefined}
                inputMode="numeric"
                value={typed}
                placeholder="08:00"
                onChange={(e) => {
                  setTyped(e.target.value);
                  setTypedError(false);
                }}
                onBlur={commitTyped}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitTyped();
                  }
                }}
                className={cn(
                  'h-10 w-full rounded-xl border bg-white dark:bg-slate-950 text-center text-lg font-bold tracking-wider text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-[#FA634E]/40',
                  typedError ? 'border-red-400' : 'border-slate-200 dark:border-slate-700'
                )}
              />
              {typedError && <p className="text-xs font-medium text-red-600">Enter a time like 08:30 or 1430.</p>}
              <div className="grid grid-cols-3 gap-1.5">
                {QUICK_TIMES.map((t) => {
                  const active = currentTime === t;
                  const off = isTimeDisabled(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      disabled={off}
                      onClick={() => pickTime(t)}
                      className={cn(
                        'rounded-lg border py-1.5 text-xs font-semibold tabular-nums transition-colors',
                        active
                          ? 'bg-orange-50 dark:bg-orange-950/40 border-[#FA634E]/50 text-[#c2410c] dark:text-orange-300'
                          : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800',
                        off && 'opacity-40 cursor-not-allowed'
                      )}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-slate-400">Picking a day and a time closes this.</p>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export default DateTimePicker;
