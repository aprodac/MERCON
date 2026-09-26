import { useState, useMemo, useEffect, useRef } from 'react';
import { Check, ChevronDown, Plus, Search } from 'lucide-react';

import { cn } from '@/lib/utils';
import { matchesSearch } from '@/lib/search';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export interface ComboboxOption {
  value: string;
  label: string | React.ReactNode;
  selectedLabel?: string | React.ReactNode;
  keywords?: string;
  disabled?: boolean;
  group?: string;
  icon?: React.ReactNode;
}

interface ComboboxProps {
  id?: string;
  options: ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  triggerClassName?: string;
  popoverClassName?: string;
  disabled?: boolean;
  onAddNew?: () => void;
  addNewLabel?: string;
  side?: 'top' | 'bottom';
  hasError?: boolean;
}

export function Combobox({
  id,
  options,
  value,
  onChange,
  placeholder = 'Select...',
  searchPlaceholder = 'Search...',
  emptyText = 'No results found.',
  className,
  triggerClassName,
  popoverClassName,
  disabled,
  onAddNew,
  addNewLabel,
  side = 'top',
  hasError = false,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const focusNextField = () => {
    setTimeout(() => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const focusable = Array.from(
        document.querySelectorAll<HTMLElement>(
          'input:not([disabled]):not([type="hidden"]):not([tabindex="-1"]), select:not([disabled]):not([tabindex="-1"]), textarea:not([disabled]):not([tabindex="-1"]), button:not([disabled]):not([tabindex="-1"])'
        )
      ).filter((el) => {
        const s = window.getComputedStyle(el);
        return s.display !== 'none' && s.visibility !== 'hidden' && (el.offsetWidth > 0 || el.offsetHeight > 0);
      });
      const idx = focusable.indexOf(trigger);
      if (idx > -1 && idx < focusable.length - 1) {
        focusable[idx + 1].focus();
      }
    }, 60);
  };

  const selected = options.find((o) => o.value === value);

  const matchingOptions = useMemo(() => {
    return options.filter((o) => {
      const labelStr = typeof o.label === 'string' ? o.label : '';
      return searchValue.trim()
        ? matchesSearch(searchValue.trim(), [labelStr, o.keywords, o.group, o.value])
        : true;
    });
  }, [options, searchValue]);

  useEffect(() => {
    setActiveIndex(0);
  }, [searchValue, open]);

  // Auto-focus input on open
  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 30);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Scroll active item into view
  useEffect(() => {
    if (open && listRef.current) {
      const activeEl = listRef.current.querySelector(`[data-combobox-index="${activeIndex}"]`) as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [activeIndex, open]);

  // Auto-close popover when parent container or window scrolls (preventing detached floating menus)
  useEffect(() => {
    if (!open) return;

    const handleScroll = (e: Event) => {
      if (listRef.current && listRef.current.contains(e.target as Node)) {
        return;
      }
      setOpen(false);
    };

    window.addEventListener('scroll', handleScroll, true);
    return () => {
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [open]);

  const handleTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (!open) {
      if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
        e.preventDefault();
        setOpen(true);
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setSearchValue(e.key);
        setOpen(true);
      }
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (matchingOptions.length > 0 ? Math.min(prev + 1, matchingOptions.length - 1) : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      const item = matchingOptions[activeIndex];
      if (item && !item.disabled) {
        onChange(item.value);
        setOpen(false);
        focusNextField();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      setSearchValue('');
      setActiveIndex(0);
    }
  };

  const groupedMap = useMemo(() => {
    const map = new Map<string, { option: ComboboxOption; globalIndex: number }[]>();
    matchingOptions.forEach((option, idx) => {
      const g = option.group || '';
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push({ option, globalIndex: idx });
    });
    return map;
  }, [matchingOptions]);

  return (
    <Popover open={disabled ? false : open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          ref={triggerRef}
          onKeyDown={handleTriggerKeyDown}
          className={cn(
            'h-10 w-full justify-between text-xs font-medium border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl px-3.5 shadow-2xs hover:bg-slate-50 dark:hover:bg-slate-800/60 focus-visible:ring-2 focus-visible:ring-[#FA634E] focus-visible:outline-none focus-visible:border-[#FA634E]',
            hasError && 'border-red-500 ring-2 ring-red-500/30 bg-red-50/20 dark:bg-red-950/20 text-red-900 dark:text-red-200',
            !selected && 'text-slate-400 dark:text-slate-500 font-normal',
            triggerClassName || className
          )}
        >
          <span className="truncate flex items-center gap-2">
            {selected?.icon}
            <span>{selected ? (selected.selectedLabel ?? selected.label) : placeholder}</span>
          </span>
          <ChevronDown className="ml-1.5 h-4 w-4 shrink-0 opacity-50 text-slate-400" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side={side}
        sideOffset={4}
        avoidCollisions={true}
        collisionPadding={8}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          inputRef.current?.focus();
        }}
        onKeyDownCapture={handleInputKeyDown}
        className={cn(
          'w-[var(--radix-popover-trigger-width)] min-w-[var(--radix-popover-trigger-width)] p-0 rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 z-[9999] overflow-hidden',
          popoverClassName
        )}
      >
        <div className="flex items-center border-b border-slate-100 dark:border-slate-800 px-3 bg-white dark:bg-slate-900">
          <Search className="mr-2 h-3.5 w-3.5 shrink-0 opacity-50 text-slate-400" />
          <input
            ref={inputRef}
            type="text"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            placeholder={searchPlaceholder}
            className="flex h-10 w-full rounded-md bg-transparent py-2.5 text-xs outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
        <div ref={listRef} className="max-h-[min(256px,var(--radix-popover-content-available-height,256px))] p-1 overflow-y-auto overscroll-contain">
          {matchingOptions.length === 0 ? (
            <div className="py-6 px-4 text-center text-xs text-slate-500 space-y-3">
              <p className="text-slate-500 dark:text-slate-400 font-medium">{emptyText}</p>
              {onAddNew && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs font-semibold border-indigo-200 text-indigo-600 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-400 dark:hover:bg-indigo-950/50 shadow-2xs"
                  onClick={() => {
                    setOpen(false);
                    onAddNew();
                  }}
                >
                  <Plus className="w-3.5 h-3.5 mr-1 text-indigo-600 dark:text-indigo-400" />
                  {addNewLabel || 'Add New'}
                </Button>
              )}
            </div>
          ) : (
            Array.from(groupedMap.entries()).map(([groupName, groupOptions]) => (
              <div key={groupName || 'ungrouped'} className="py-0.5">
                {groupName && (
                  <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {groupName}
                  </div>
                )}
                {groupOptions.map(({ option, globalIndex }) => {
                  const isSelected = value === option.value;
                  const isHighlighted = activeIndex === globalIndex;
                  const doSelect = () => {
                    if (option.disabled) return;
                    onChange(option.value);
                    setOpen(false);
                  };

                  return (
                    <div
                      key={option.value}
                      data-combobox-index={globalIndex}
                      className={cn(
                        'flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-colors text-xs my-0.5 select-none',
                        isHighlighted
                          ? 'bg-orange-50 dark:bg-orange-950/40 text-brand font-bold ring-1 ring-brand/30'
                          : isSelected
                          ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold'
                          : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300',
                        option.disabled && 'opacity-50 cursor-not-allowed pointer-events-none'
                      )}
                      onMouseEnter={() => setActiveIndex(globalIndex)}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        doSelect();
                      }}
                      onClick={doSelect}
                    >
                      <span className="truncate flex-1 flex items-center gap-2">
                        {option.icon}
                        <span>{option.label}</span>
                      </span>
                      <Check
                        className={cn(
                          'h-4 w-4 text-brand shrink-0 ml-2',
                          isSelected ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
        {onAddNew && (
          <div className="p-1.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 rounded-b-xl">
            <button
              type="button"
              className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-indigo-600 hover:bg-indigo-100/60 dark:text-indigo-400 dark:hover:bg-indigo-950/60 transition-colors"
              onClick={() => {
                setOpen(false);
                onAddNew();
              }}
            >
              <Plus className="w-3.5 h-3.5" />
              {addNewLabel || 'Add New'}
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
