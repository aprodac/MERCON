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
  const isZero = count === 0;

  if (isZero && !isActive) {
    return 'bg-muted/50 text-muted-foreground/60 ring-1 ring-inset ring-border/40';
  }

  return isActive
    ? 'bg-primary/10 text-primary ring-1 ring-inset ring-primary/20 font-medium'
    : 'bg-muted text-muted-foreground ring-1 ring-inset ring-border font-medium';
}

function getDotIndicator(tabKey: string, isActive: boolean) {
  const keyLower = tabKey.toLowerCase();
  if (keyLower === 'all') return null;

  let colorClass = 'bg-muted-foreground';
  if (keyLower === 'open' || keyLower === 'active' || keyLower === 'draft') {
    colorClass = 'bg-emerald-500';
  } else if (keyLower === 'partiallyapplied' || keyLower === 'partially_applied' || keyLower === 'pending' || keyLower === 'overdue') {
    colorClass = 'bg-amber-500';
  } else if (keyLower === 'fullyapplied' || keyLower === 'fully_applied' || keyLower === 'paid' || keyLower === 'posted' || keyLower === 'approved') {
    colorClass = 'bg-sky-500';
  } else if (keyLower === 'void' || keyLower === 'voided' || keyLower === 'cancelled') {
    colorClass = 'bg-muted-foreground';
  }

  return <span className={cn('w-1.5 h-1.5 rounded-full shrink-0 transition-opacity', colorClass, isActive ? 'opacity-100' : 'opacity-60')} />;
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
        'bg-muted p-[3px] rounded-lg border border-border/60 inline-flex flex-wrap items-center gap-0.5',
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
              'relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all outline-none cursor-pointer select-none',
              isActive
                ? 'bg-background text-foreground shadow-xs font-semibold'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
            )}
          >
            {dot}
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span
                className={cn(
                  'inline-flex items-center rounded-md px-1.5 py-0.2 text-[11px] fin-num shrink-0',
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
