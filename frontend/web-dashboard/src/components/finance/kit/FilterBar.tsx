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
    : 'bg-primary';

  const effectiveDotClass = dotClass || defaultDot;
  const selectedOption = options?.find((o) => o.value === value);
  const displayVal = selectedOption ? selectedOption.label : value;
  const activeDotClass =
    selectedOption && selectedOption.value !== 'all' && selectedOption.value !== 'All' && selectedOption.dotClass
      ? selectedOption.dotClass
      : effectiveDotClass;

  const isChipActive = isActive || (value && value !== 'all' && value !== 'All');

  const buttonContent = (
    <button
      type="button"
      className={cn(
        'inline-flex items-center gap-1.5 h-8 px-2.5 text-xs font-medium rounded-md border transition-all cursor-pointer select-none',
        isChipActive
          ? 'bg-muted text-foreground border-border ring-1 ring-border'
          : 'bg-card border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground',
        className
      )}
    >
      {activeDotClass && (
        <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', activeDotClass)} />
      )}
      <span>
        {label}
        {displayVal && displayVal !== 'all' && displayVal !== 'All' ? `: ${displayVal}` : ''}
      </span>
      {(children || options) && <ChevronDown className="w-3.5 h-3.5 opacity-50 shrink-0 ml-0.5" />}
      {onClear && isChipActive && (
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            onClear();
          }}
          className="ml-0.5 hover:bg-muted-foreground/20 rounded-md p-0.5"
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
        className="w-auto p-1.5 bg-popover text-popover-foreground border border-border shadow-md rounded-md max-h-60 overflow-y-auto"
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
                  'w-full text-left px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-2',
                  value === opt.value
                    ? 'bg-muted text-foreground font-semibold'
                    : 'hover:bg-muted/60 text-muted-foreground hover:text-foreground'
                )}
              >
                {(opt.dotClass || activeDotClass) && (
                  <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', opt.dotClass || activeDotClass)} />
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
          'bg-muted border border-border rounded-xl px-3.5 py-2 flex items-center justify-between transition-all',
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
        'flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 p-3 bg-card border border-border rounded-xl shadow-xs',
        className
      )}
    >
      <div className="flex items-center gap-2 flex-1 flex-wrap min-w-0">
        {onSearchChange !== undefined && (
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={currentSearch}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full h-8 pl-8 pr-3 bg-muted/40 border border-border/60 focus:border-ring rounded-md text-xs text-foreground placeholder:text-muted-foreground outline-none transition-all"
            />
          </div>
        )}

        {chips}
        {children}

        {onAddFilter && (
          <button
            type="button"
            onClick={onAddFilter}
            className="inline-flex items-center gap-1 h-8 px-2.5 text-xs font-medium rounded-md border border-dashed border-border text-muted-foreground hover:bg-muted transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add filter</span>
          </button>
        )}

        {hasActiveFilters && onClearFilters && (
          <button
            type="button"
            onClick={onClearFilters}
            className="inline-flex items-center gap-1 h-8 px-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
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
