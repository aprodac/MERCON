import React from 'react';
import { cn } from '@/lib/utils';

export interface SidePanelTabItem {
  key: string;
  label: string;
  badge?: number | string;
}

export interface SidePanelTabsProps {
  tabs: SidePanelTabItem[];
  value: string;
  onChange: (key: string) => void;
  children: React.ReactNode;
  className?: string;
}

export function SidePanelTabs({
  tabs,
  value,
  onChange,
  children,
  className,
}: SidePanelTabsProps) {
  return (
    <div
      className={cn(
        'bg-card border border-border rounded-xl p-4 shadow-xs space-y-4',
        className
      )}
    >
      {/* Segmented Track */}
      <div className="bg-muted p-[3px] rounded-lg border border-border/60 grid grid-flow-col auto-cols-fr gap-1 select-none">
        {tabs.map((tab) => {
          const isActive = tab.key === value;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onChange(tab.key)}
              className={cn(
                'flex items-center justify-center gap-1.5 py-1 px-2.5 rounded-md text-xs font-medium transition-all cursor-pointer',
                isActive
                  ? 'bg-background text-foreground shadow-xs font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <span>{tab.label}</span>
              {tab.badge !== undefined && (
                <span className="text-[10px] fin-num font-medium px-1.5 py-0.2 rounded-full bg-muted-foreground/10 text-muted-foreground">
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Body */}
      <div>{children}</div>
    </div>
  );
}

