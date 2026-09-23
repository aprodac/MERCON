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

function getStatusBadgeClasses(tabKey: string, isActive: boolean, count: number = 0, customClass?: string): string {
  if (customClass) return customClass;

  const keyLower = tabKey.toLowerCase();
  const isZero = count === 0;

  if (isZero && !isActive) {
    return 'bg-slate-200/50 text-slate-400 dark:bg-slate-800 dark:text-slate-500 font-mono font-semibold';
  }

  if (keyLower === 'open' || keyLower === 'active' || keyLower === 'draft') {
    return isActive
      ? 'bg-emerald-600 text-white font-mono font-bold shadow-2xs'
      : 'bg-emerald-100/80 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 font-mono font-bold';
  }

  if (keyLower === 'partiallyapplied' || keyLower === 'partially_applied' || keyLower === 'pending' || keyLower === 'overdue') {
    return isActive
      ? 'bg-amber-500 text-white font-mono font-bold shadow-2xs'
      : 'bg-amber-100/80 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 font-mono font-bold';
  }

  if (keyLower === 'fullyapplied' || keyLower === 'fully_applied' || keyLower === 'paid' || keyLower === 'posted' || keyLower === 'approved') {
    return isActive
      ? 'bg-sky-600 text-white font-mono font-bold shadow-2xs'
      : 'bg-sky-100/80 text-sky-800 dark:bg-sky-950/70 dark:text-sky-300 font-mono font-bold';
  }

  if (keyLower === 'void' || keyLower === 'voided' || keyLower === 'rejected' || keyLower === 'cancelled') {
    return isActive
      ? 'bg-slate-700 text-white font-mono font-bold shadow-2xs'
      : 'bg-slate-200/80 text-slate-600 dark:bg-slate-800 dark:text-slate-400 font-mono font-bold';
  }

  // All / Default
  return isActive
    ? 'bg-[#FA634E] text-white font-mono font-bold shadow-2xs'
    : 'bg-slate-200/80 text-slate-700 dark:bg-slate-700 dark:text-slate-300 font-mono font-bold';
}

function getDotIndicator(tabKey: string, isActive: boolean) {
  const keyLower = tabKey.toLowerCase();
  if (keyLower === 'all') return null;

  let colorClass = 'bg-slate-400';
  if (keyLower === 'open' || keyLower === 'active' || keyLower === 'draft') {
    colorClass = 'bg-emerald-500';
  } else if (keyLower === 'partiallyapplied' || keyLower === 'partially_applied' || keyLower === 'pending' || keyLower === 'overdue') {
    colorClass = 'bg-amber-500';
  } else if (keyLower === 'fullyapplied' || keyLower === 'fully_applied' || keyLower === 'paid' || keyLower === 'posted') {
    colorClass = 'bg-sky-500';
  } else if (keyLower === 'void' || keyLower === 'voided' || keyLower === 'cancelled') {
    colorClass = 'bg-slate-400';
  }

  return <span className={cn('w-2 h-2 rounded-full shrink-0 transition-opacity', colorClass, isActive ? 'opacity-100' : 'opacity-70')} />;
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
        'bg-slate-100/90 dark:bg-slate-800/80 p-1.5 rounded-2xl border border-slate-200/70 dark:border-slate-700/70 inline-flex flex-wrap items-center gap-1 shadow-2xs',
        className
      )}
    >
      {tabs.map((tab) => {
        const tabKey = tab.key || tab.id || '';
        const isActive = tabKey === selectedTab;
        const count = tab.count ?? 0;
        const badgeStyle = getStatusBadgeClasses(tabKey, isActive, count, tab.badgeClass);
        const dot = getDotIndicator(tabKey, isActive);

        return (
          <button
            key={tabKey}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => handleChange?.(tabKey)}
            className={cn(
              'relative inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs transition-all outline-none cursor-pointer border select-none',
              isActive
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-bold shadow-xs border-slate-200/90 dark:border-slate-700'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 font-semibold border-transparent hover:bg-white/40 dark:hover:bg-slate-700/40'
            )}
          >
            {dot}
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span
                className={cn(
                  'px-2 py-0.5 text-[11px] rounded-full transition-all shrink-0 font-mono',
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
