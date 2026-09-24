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
        'bg-white dark:bg-slate-900 border border-black/[0.06] dark:border-slate-800 rounded-[20px] p-4 shadow-xs space-y-4',
        className
      )}
    >
      {/* Segmented Track */}
      <div className="bg-[#F1F2F5] dark:bg-slate-800 p-1 rounded-xl grid grid-flow-col auto-cols-fr gap-1 select-none">
        {tabs.map((tab) => {
          const isActive = tab.key === value;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onChange(tab.key)}
              className={cn(
                'flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-[9px] text-[12.5px] font-semibold transition-all cursor-pointer',
                isActive
                  ? 'bg-white dark:bg-slate-900 text-[#111111] dark:text-slate-100 shadow-xs font-bold'
                  : 'text-[#6E6E80] dark:text-slate-400 hover:text-[#111111] dark:hover:text-slate-200'
              )}
            >
              <span>{tab.label}</span>
              {tab.badge !== undefined && (
                <span className="text-[10px] fin-num font-bold px-1.5 py-0.2 rounded-full bg-black/5 dark:bg-white/10">
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
