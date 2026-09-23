import React from 'react';
import { cn } from '@/lib/utils';

export interface StatusTabItem {
  key?: string;
  id?: string;
  label: string;
  count?: number;
  badgeClass?: string;
}

export interface StatusTabsProps {
  tabs: StatusTabItem[];
  value?: string;
  activeTab?: string;
  onChange?: (key: string) => void;
  onTabChange?: (key: string) => void;
  className?: string;
}

// Default semantic colors for common finance status keys
function getStatusBadgeClasses(tabKey: string, isActive: boolean, customClass?: string): string {
  if (customClass) return customClass;

  const keyLower = tabKey.toLowerCase();

  if (keyLower === 'draft' || keyLower === 'pending' || keyLower === 'overdue') {
    return isActive
      ? 'bg-amber-500 text-white font-extrabold shadow-2xs'
      : 'bg-amber-100/90 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/60';
  }

  if (keyLower === 'posted' || keyLower === 'paid' || keyLower === 'approved' || keyLower === 'active') {
    return isActive
      ? 'bg-emerald-600 text-white font-extrabold shadow-2xs'
      : 'bg-emerald-100/90 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/60';
  }

  if (keyLower === 'voided' || keyLower === 'rejected' || keyLower === 'cancelled') {
    return isActive
      ? 'bg-slate-700 text-white font-extrabold shadow-2xs'
      : 'bg-slate-200/90 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-300/80 dark:border-slate-700/80';
  }

  // All / Default
  return isActive
    ? 'bg-[#FA634E] text-white font-extrabold shadow-2xs'
    : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200/70 dark:border-slate-700';
}

export function StatusTabs({
  tabs,
  value,
  activeTab,
  onChange,
  onTabChange,
  className,
}: StatusTabsProps) {
  const selectedTab = activeTab !== undefined ? activeTab : value || '';
  const handleChange = onTabChange || onChange;

  return (
    <div
      role="tablist"
      aria-orientation="horizontal"
      className={cn(
        'flex items-center gap-1 border-b border-black/[0.06] dark:border-slate-800 overflow-x-auto scrollbar-none px-1 py-0.5',
        className
      )}
    >
      {tabs.map((tab) => {
        const tabKey = tab.key || tab.id || '';
        const isActive = tabKey === selectedTab;
        const badgeStyle = getStatusBadgeClasses(tabKey, isActive, tab.badgeClass);

        return (
          <button
            key={tabKey}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => handleChange?.(tabKey)}
            className={cn(
              'relative inline-flex items-center gap-2 px-3.5 py-2.5 text-[13px] font-semibold transition-all whitespace-nowrap outline-none cursor-pointer border-b-2 -mb-[1px]',
              isActive
                ? 'text-[#FA634E] dark:text-[#FA634E] font-bold border-[#FA634E]'
                : 'text-[#6E6E80] dark:text-slate-400 hover:text-[#111111] dark:hover:text-slate-200 border-transparent'
            )}
          >
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span
                className={cn(
                  'px-2 py-0.5 text-[11px] font-bold fin-num rounded-full transition-all shrink-0',
                  badgeStyle
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
