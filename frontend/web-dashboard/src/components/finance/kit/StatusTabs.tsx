import React from 'react';
import { cn } from '@/lib/utils';

export interface StatusTabItem {
  key: string;
  label: string;
  count?: number;
}

export interface StatusTabsProps {
  tabs: StatusTabItem[];
  value: string;
  onChange: (key: string) => void;
  className?: string;
}

export function StatusTabs({
  tabs,
  value,
  onChange,
  className,
}: StatusTabsProps) {
  return (
    <div
      role="tablist"
      aria-orientation="horizontal"
      className={cn(
        'flex items-center gap-1 border-b border-black/[0.06] dark:border-slate-800 overflow-x-auto scrollbar-none px-1',
        className
      )}
    >
      {tabs.map((tab) => {
        const isActive = tab.key === value;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.key)}
            className={cn(
              'relative inline-flex items-center gap-2 px-3.5 py-3 text-[13px] font-semibold transition-all whitespace-nowrap outline-none cursor-pointer border-b-2 -mb-[1px]',
              isActive
                ? 'text-[#FA634E] dark:text-[#FA634E] font-bold border-[#FA634E]'
                : 'text-[#6E6E80] dark:text-slate-400 hover:text-[#111111] dark:hover:text-slate-200 border-transparent'
            )}
          >
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span
                className={cn(
                  'px-2 py-0.5 text-[11px] font-bold fin-num rounded-full transition-colors',
                  isActive
                    ? 'bg-[#FFF4F2] text-[#FA634E] dark:bg-[rgba(250,99,78,0.15)] dark:text-[#FA634E]'
                    : 'bg-[#F1F2F5] text-[#6E6E80] dark:bg-slate-800 dark:text-slate-400'
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
