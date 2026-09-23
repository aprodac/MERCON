import React, { useState } from 'react';
import { Search, Plus, ChevronDown, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface FilterChipOption {
  value: string;
  label: string;
  dotClass?: string;
}

export interface FilterChipProps {
  label: string;
  value?: string;
  isActive?: boolean;
  dotClass?: string;
  onClear?: () => void;
  onChange?: (val: string) => void;
  options?: FilterChipOption[];
  children?: React.ReactNode;
  className?: string;
}

export function FilterChip({
  label,
  value,
  isActive = false,
  dotClass,
  onClear,
  onChange,
  options,
  children,
  className,
}: FilterChipProps) {
  const [open, setOpen] = useState(false);

  const defaultDot = label.toLowerCase().includes('period')
    ? 'bg-sky-500'
    : label.toLowerCase().includes('source')
    ? 'bg-indigo-500'
    : label.toLowerCase().includes('account')
    ? 'bg-emerald-500'
    : 'bg-[#FA634E]';

  const effectiveDotClass = dotClass || defaultDot;
  const selectedOption = options?.find((o) => o.value === value);
  const displayVal = selectedOption ? selectedOption.label : value;
  const activeDotClass =
    selectedOption && selectedOption.value !== 'all' && selectedOption.value !== 'All' && selectedOption.dotClass
      ? selectedOption.dotClass
      : effectiveDotClass;

  const buttonContent = (
    <button
      type="button"
      className={cn(
        'inline-flex items-center gap-2 h-[34px] px-3.5 text-[12px] font-semibold rounded-full border transition-all cursor-pointer select-none',
        isActive || (value && value !== 'all' && value !== 'All')
          ? 'bg-sky-50/80 dark:bg-sky-950/30 border-sky-300/80 dark:border-sky-800 text-sky-900 dark:text-sky-200 shadow-2xs'
          : 'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/80 shadow-2xs',
        className
      )}
    >
      {activeDotClass && (
        <span className={cn('w-2 h-2 rounded-full shrink-0', activeDotClass)} />
      )}
      <span>
        {label}
        {displayVal && displayVal !== 'all' && displayVal !== 'All' ? `: ${displayVal}` : ''}
      </span>
      {(children || options) && <ChevronDown className="w-3.5 h-3.5 opacity-50 shrink-0 ml-0.5" />}
      {onClear && (value || isActive) && (
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            onClear();
          }}
          className="ml-0.5 hover:bg-black/10 dark:hover:bg-white/10 rounded-full p-0.5"
        >
          <X className="w-3 h-3" />
        </span>
      )}
    </button>
  );

  if (!children && !options) {
    return buttonContent;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{buttonContent}</PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-auto p-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl rounded-2xl max-h-60 overflow-y-auto"
      >
        {children ? (
          children
        ) : (
          <div className="flex flex-col gap-0.5 min-w-[150px]">
            {options?.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange?.(opt.value);
                  setOpen(false);
                }}
                className={cn(
                  'w-full text-left px-3 py-1.5 rounded-xl text-xs font-medium transition-colors flex items-center gap-2',
                  value === opt.value
                    ? 'bg-sky-50 dark:bg-sky-950/40 text-sky-900 dark:text-sky-200 font-semibold'
                    : 'hover:bg-slate-100 text-slate-700 dark:hover:bg-slate-800 dark:text-slate-300'
                )}
              >
                {(opt.dotClass || activeDotClass) && (
                  <span className={cn('w-2 h-2 rounded-full shrink-0', opt.dotClass || activeDotClass)} />
                )}
                <span>{opt.label}</span>
              </button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export interface FilterBarProps {
  search?: string;
  searchValue?: string;
  onSearchChange?: (val: string) => void;
  searchPlaceholder?: string;
  chips?: React.ReactNode;
  children?: React.ReactNode;
  onAddFilter?: () => void;
  onClearFilters?: () => void;
  hasActiveFilters?: boolean;
  rightSlot?: React.ReactNode;
  selectionBar?: React.ReactNode;
  className?: string;
}

export function FilterBar({
  search = '',
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search...',
  chips,
  children,
  onAddFilter,
  onClearFilters,
  hasActiveFilters,
  rightSlot,
  selectionBar,
  className,
}: FilterBarProps) {
  const currentSearch = searchValue !== undefined ? searchValue : search;

  if (selectionBar) {
    return (
      <div
        className={cn(
          'bg-[#FFF4F2] dark:bg-[rgba(250,99,78,0.10)] border border-[#FA634E]/20 rounded-xl px-4 py-2 flex items-center justify-between transition-all animate-fade-in',
          className
        )}
      >
        {selectionBar}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 p-3 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs',
        className
      )}
    >
      <div className="flex items-center gap-2 flex-1 flex-wrap min-w-0">
        {onSearchChange !== undefined && (
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#6E6E80] dark:text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={currentSearch}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full h-[34px] pl-9 pr-3 bg-[#F4F5F8] dark:bg-slate-800/80 border border-transparent focus:border-[#FA634E]/40 dark:focus:border-[#FA634E]/40 rounded-[10px] text-[13px] text-[#111111] dark:text-slate-100 placeholder-[#757583] dark:placeholder-slate-500 outline-none transition-all"
            />
          </div>
        )}

        {chips}
        {children}

        {onAddFilter && (
          <button
            type="button"
            onClick={onAddFilter}
            className="inline-flex items-center gap-1.5 h-[34px] px-3 text-[12px] font-semibold rounded-[10px] border border-dashed border-black/[0.15] dark:border-slate-700 text-[#6E6E80] dark:text-slate-400 hover:bg-[#F4F5F8] dark:hover:bg-slate-800 transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add filter</span>
          </button>
        )}

        {hasActiveFilters && onClearFilters && (
          <button
            type="button"
            onClick={onClearFilters}
            className="inline-flex items-center gap-1 h-[34px] px-2.5 text-[12px] font-semibold text-[#FA634E] hover:bg-rose-50 rounded-[10px] transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            Clear filters
          </button>
        )}
      </div>

      {rightSlot && (
        <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
          {rightSlot}
        </div>
      )}
    </div>
  );
}
