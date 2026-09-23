import React from 'react';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/finance';

export interface ActivityItem {
  id?: string;
  title: React.ReactNode;
  meta?: React.ReactNode;
  at?: string | Date | null;
  tone?: 'default' | 'brand' | 'positive' | 'negative';
}

export interface ActivityTimelineProps {
  items?: ActivityItem[] | any[];
  isLoading?: boolean;
  emptyMessage?: string;
  className?: string;
}

export function ActivityTimeline({
  items: rawItems,
  isLoading = false,
  emptyMessage = 'No activity recorded yet',
  className,
}: ActivityTimelineProps) {
  const items: ActivityItem[] = (rawItems || []).map((item, idx) => {
    if ('action' in item || 'entityType' in item) {
      // Audit log row from API
      const userStr = item.user?.username || 'System';
      const actionTitle = (item.action || 'Activity').replace(/_/g, ' ');
      const dateStr = item.createdAt ? formatDate(item.createdAt, 'MMM d, yyyy') : '';
      return {
        id: item.id || String(idx),
        title: actionTitle,
        meta: `By ${userStr} ${dateStr ? '· ' + dateStr : ''}`,
        tone: item.action?.includes('POSTED')
          ? 'positive'
          : item.action?.includes('VOIDED') || item.action?.includes('DELETED')
          ? 'negative'
          : 'brand',
      };
    }
    return item as ActivityItem;
  });

  if (isLoading) {
    return (
      <div className="space-y-3 py-2">
        <div className="h-4 bg-slate-100 rounded animate-pulse w-3/4" />
        <div className="h-4 bg-slate-100 rounded animate-pulse w-1/2" />
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="text-center py-6 text-xs text-[#6E6E80] dark:text-slate-400">
        {emptyMessage}
      </div>
    );
  }

  const toneDotClasses: Record<
    'default' | 'brand' | 'positive' | 'negative',
    string
  > = {
    default: 'bg-[#6E6E80] dark:bg-slate-400',
    brand: 'bg-[#FA634E]',
    positive: 'bg-[#15803D] dark:bg-emerald-400',
    negative: 'bg-[#C2410C] dark:bg-orange-400',
  };

  return (
    <div className={cn('relative pl-4 space-y-4 select-none', className)}>
      {/* Connecting Line */}
      <div className="absolute left-[7px] top-2 bottom-2 w-[2px] bg-black/[0.06] dark:bg-slate-800" />

      {items.map((item, idx) => {
        const tone = item.tone || 'default';
        return (
          <div key={item.id || idx} className="relative flex items-start gap-3">
            {/* Dot */}
            <span
              className={cn(
                'absolute -left-[13px] top-1.5 w-2.5 h-2.5 rounded-full ring-4 ring-white dark:ring-slate-900 z-10 shrink-0',
                toneDotClasses[tone]
              )}
            />
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-[#111111] dark:text-slate-100 leading-tight">
                {item.title}
              </div>
              {item.meta && (
                <div className="text-[11.5px] text-[#6E6E80] dark:text-slate-400 mt-0.5">
                  {item.meta}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
