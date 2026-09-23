import React, { useState } from 'react';
import { Search, Plus, ChevronDown, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface FilterChipProps {
  label: string;
  value?: string;
  isActive?: boolean;
  onClear?: () => void;
  children?: React.ReactNode;
  className?: string;
}

export function FilterChip({
  label,
  value,
  isActive = false,
  onClear,
  children,
  className,
}: FilterChipProps) {
  const [open, setOpen] = useState(false);

  const buttonContent = (
    <button
      type="button"
      className={cn(
        'inline-flex items-center gap-1.5 h-[34px] px-3 text-[12px] font-semibold rounded-[10px] border transition-all cursor-pointer select-none',
        isActive || value
          ? 'bg-[#FFF4F2] dark:bg-[rgba(250,99,78,0.12)] border-[#FA634E]/30 text-[#FA634E] dark:text-[#FA634E]'
          : 'bg-[#F4F5F8] dark:bg-slate-800/80 border-transparent text-[#3E3C3D] dark:text-slate-300 hover:bg-[#EAECEF] dark:hover:bg-slate-700/80',
        className
      )}
    >
      <span>
        {label}
        {value ? `: ${value}` : ''}
      </span>
      {children && <ChevronDown className="w-3.5 h-3.5 opacity-60 shrink-0" />}
      {onClear && (value || isActive) && (
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            onClear();
          }}
          className="ml-0.5 hover:bg-black/10 dark:hover:bg-white/10 rounded p-0.5"
        >
          <X className="w-3 h-3" />
        </span>
      )}
    </button>
  );

  if (!children) {
    return buttonContent;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{buttonContent}</PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-auto p-3 bg-white dark:bg-slate-900 border border-black/[0.08] dark:border-slate-800 shadow-md rounded-xl"
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}

export interface FilterBarProps {
  search?: string;
  onSearchChange?: (val: string) => void;
  searchPlaceholder?: string;
  chips?: React.ReactNode;
  onAddFilter?: () => void;
  rightSlot?: React.ReactNode;
  selectionBar?: React.ReactNode;
  className?: string;
}

export function FilterBar({
  search = '',
  onSearchChange,
  searchPlaceholder = 'Search...',
  chips,
  onAddFilter,
  rightSlot,
  selectionBar,
  className,
}: FilterBarProps) {
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
        'flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 p-3 bg-white dark:bg-slate-900',
        className
      )}
    >
      <div className="flex items-center gap-2 flex-1 flex-wrap min-w-0">
        {onSearchChange !== undefined && (
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#6E6E80] dark:text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full h-[34px] pl-9 pr-3 bg-[#F4F5F8] dark:bg-slate-800/80 border border-transparent focus:border-[#FA634E]/40 dark:focus:border-[#FA634E]/40 rounded-[10px] text-[13px] text-[#111111] dark:text-slate-100 placeholder-[#757583] dark:placeholder-slate-500 outline-none transition-all"
            />
          </div>
        )}

        {chips}

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
      </div>

      {rightSlot && (
        <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
          {rightSlot}
        </div>
      )}
    </div>
  );
}
