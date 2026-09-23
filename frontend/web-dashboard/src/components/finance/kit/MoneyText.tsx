import React from 'react';
import { formatMoney } from '@/lib/finance';
import { cn } from '@/lib/utils';

export interface MoneyTextProps {
  value: number | string | null | undefined;
  currency?: string;
  tone?: 'default' | 'positive' | 'negative' | 'muted';
  size?: 'sm' | 'md' | 'lg' | 'hero';
  signed?: boolean;
  className?: string;
}

export function MoneyText({
  value,
  currency,
  tone = 'default',
  size = 'md',
  signed = false,
  className,
}: MoneyTextProps) {
  const formatted = formatMoney(value, { signed });

  const toneClasses: Record<'default' | 'positive' | 'negative' | 'muted', string> = {
    default: 'text-[#111111] dark:text-slate-100',
    positive: 'text-[#15803D] dark:text-emerald-400',
    negative: 'text-[#C2410C] dark:text-orange-400',
    muted: 'text-[#6E6E80] dark:text-slate-400',
  };

  const sizeClasses: Record<'sm' | 'md' | 'lg' | 'hero', string> = {
    sm: 'text-xs',
    md: 'text-[13px]',
    lg: 'text-[15px] font-bold',
    hero: 'text-[28px] lg:text-[30px] font-semibold tracking-[-0.02em]',
  };

  return (
    <span
      className={cn(
        'fin-num inline-flex items-baseline',
        toneClasses[tone],
        sizeClasses[size],
        className
      )}
    >
      {currency && (
        <span className="text-[0.75em] font-sans font-medium text-[#6E6E80] dark:text-slate-400 mr-1 select-none">
          {currency}
        </span>
      )}
      <span>{formatted}</span>
    </span>
  );
}

export default MoneyText;
