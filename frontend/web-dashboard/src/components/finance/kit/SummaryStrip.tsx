import React from 'react';
import { MoneyText } from './MoneyText';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export interface SummaryBarSegment {
  value: number;
  color: string;
  label?: string;
}

export interface SummaryStripItem {
  label: string;
  value: number | string | null;
  currency?: string;
  sub?: React.ReactNode;
  tone?: 'default' | 'positive' | 'negative' | 'muted';
  bar?: {
    segments: SummaryBarSegment[];
  };
  flex?: string;
}

export interface SummaryStripProps {
  items: SummaryStripItem[];
  isLoading?: boolean;
  className?: string;
}

export function SummaryStrip({
  items,
  isLoading = false,
  className,
}: SummaryStripProps) {
  return (
    <div
      className={cn(
        'bg-card border border-border rounded-xl p-4 shadow-xs',
        className
      )}
    >
      <div className="flex flex-col md:flex-row items-stretch divide-y md:divide-y-0 md:divide-x divide-border/60">
        {items.map((item, idx) => {
          const flexStyle = item.flex
            ? { flex: `${item.flex} 1 0%` }
            : { flex: '1 1 0%' };

          const totalBarVal =
            item.bar?.segments.reduce(
              (acc, s) => acc + (s.value > 0 ? s.value : 0),
              0
            ) || 1;

          return (
            <div
              key={idx}
              style={flexStyle}
              className="py-3 md:py-0 px-4 md:first:pl-0 md:last:pr-0 flex flex-col justify-between min-w-0"
            >
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1">
                  {item.label}
                </p>

                {isLoading ? (
                  <Skeleton className="h-7 w-28 my-1" />
                ) : (
                  <MoneyText
                    value={item.value}
                    currency={item.currency}
                    tone={item.tone}
                    size="lg"
                  />
                )}

                {item.sub && !isLoading && (
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {item.sub}
                  </div>
                )}
              </div>

              {/* Optional Stacked Bar for main metric cell */}
              {item.bar && !isLoading && item.bar.segments.length > 0 && (
                <div className="mt-3">
                  <div className="h-1.5 w-full rounded-full bg-muted flex overflow-hidden gap-0.5 p-0.5">
                    {item.bar.segments.map((seg, sIdx) => {
                      const pct = Math.max(
                        0,
                        Math.min(100, (seg.value / totalBarVal) * 100)
                      );
                      if (pct <= 0) return null;
                      return (
                        <div
                          key={sIdx}
                          style={{ width: `${pct}%` }}
                          className={cn('h-full rounded-full transition-all', seg.color)}
                          title={`${seg.label || ''}: ${pct.toFixed(1)}%`}
                        />
                      );
                    })}
                  </div>

                  {/* Bar Legend */}
                  <div className="flex flex-wrap items-center gap-3 mt-2">
                    {item.bar.segments.map((seg, sIdx) => (
                      <div
                        key={sIdx}
                        className="flex items-center gap-1.5 text-[11.5px] text-[#757583] dark:text-muted-foreground"
                      >
                        <span
                          className={cn(
                            'w-2 h-2 rounded-full shrink-0',
                            seg.color
                          )}
                        />
                        <span>{seg.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {item.bar && isLoading && (
                <Skeleton className="h-2 w-full rounded-full mt-3" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
