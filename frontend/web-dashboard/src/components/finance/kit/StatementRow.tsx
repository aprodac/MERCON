import React from 'react';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/finance/format';

export interface StatementRowAmountObj {
  key?: string;
  value?: number | null;
  formatted?: string;
  className?: string;
  isNegative?: boolean;
}

export type StatementRowAmount = number | null | undefined | StatementRowAmountObj;

export interface StatementRowProps {
  /** Indentation level: 0 = section header (0px), 1 = sub-group / subtotal (16px), 2 = account row (32px) */
  level?: 0 | 1 | 2;
  /** Account code (optional) - rendered in fixed 3rem (w-12) span */
  code?: string;
  /** Label text or node */
  label: React.ReactNode;
  /** Category indicator dot color (e.g. 'bg-sky-500', 'bg-emerald-500', 'bg-orange-500', 'bg-violet-500', 'bg-amber-500') */
  dotColor?: string;
  /** Prefix element preceding label (e.g. chevron button/icon) */
  prefix?: React.ReactNode;
  /** Amount(s) for the row (single amount or array for comparison columns) */
  amounts?: StatementRowAmount | StatementRowAmount[];
  /** Row variant for typography & border styling */
  variant?: 'section' | 'subgroup' | 'account' | 'subtotal' | 'grandtotal';
  /** Click handler */
  onClick?: () => void;
  /** Additional row container classes */
  className?: string;
  /** Additional label cell classes */
  labelClassName?: string;
  /** Additional amount cell classes */
  amountClassName?: string;
  /** ID for scroll targeting */
  id?: string;
}

export function StatementRow({
  level = 2,
  code,
  label,
  dotColor,
  prefix,
  amounts,
  variant = 'account',
  onClick,
  className,
  labelClassName,
  amountClassName,
  id,
}: StatementRowProps) {
  // Normalize amounts to array
  const rawAmounts = Array.isArray(amounts) ? amounts : [amounts];
  const numAmountCols = Math.max(1, rawAmounts.length);

  // Indentation padding-left inside label cell
  const indentPaddingPx = level === 0 ? 0 : level === 1 ? 16 : 32;

  // Variant classes according to Prompt 16b specifications
  const variantStyles = {
    section: 'h-10 text-sm font-semibold text-foreground border-b border-border',
    subgroup: 'h-8 text-[13px] font-medium text-foreground/80',
    account: 'h-9 text-[13.5px] font-normal text-foreground',
    subtotal: 'h-9 text-[13.5px] font-medium text-foreground border-t border-border',
    grandtotal: 'h-11 text-[15px] font-semibold text-foreground border-t border-foreground/70 border-b-[3px] border-double border-foreground/70',
  };

  const isClickable = Boolean(onClick);

  return (
    <div
      id={id}
      onClick={onClick}
      className={cn(
        'grid items-center px-4 w-full select-none transition-colors',
        variantStyles[variant],
        isClickable && variant === 'account' && 'hover:bg-muted/50 cursor-pointer',
        isClickable && variant !== 'account' && 'cursor-pointer',
        className
      )}
      style={{
        gridTemplateColumns: `minmax(0, 1fr) repeat(${numAmountCols}, 9.5rem)`,
      }}
    >
      {/* Label Cell */}
      <div
        className={cn('flex items-center gap-1.5 min-w-0 pr-2 overflow-hidden text-ellipsis whitespace-nowrap', labelClassName)}
        style={{ paddingLeft: `${indentPaddingPx}px` }}
        data-level={level}
      >
        {prefix}
        {dotColor && <span className={cn('w-1.5 h-1.5 rounded-full shrink-0 inline-block', dotColor)} />}
        {code && (
          <span className="fin-num text-muted-foreground w-12 shrink-0 inline-block text-xs font-normal" data-code>
            {code}
          </span>
        )}
        <span className="truncate">{label}</span>
      </div>

      {/* Amount Cells */}
      {rawAmounts.map((amt, idx) => {
        let displayVal: string = '—';
        let customClass: string | undefined;

        if (typeof amt === 'number') {
          displayVal = formatMoney(amt);
        } else if (amt && typeof amt === 'object') {
          if (amt.formatted !== undefined) {
            displayVal = amt.formatted;
          } else if (typeof amt.value === 'number') {
            displayVal = formatMoney(amt.value);
          }
          customClass = amt.className;
        }

        return (
          <div
            key={idx}
            data-amount
            className={cn(
              'text-right fin-num whitespace-nowrap text-xs',
              variant === 'grandtotal' && 'font-semibold',
              variant === 'subtotal' && 'font-medium',
              variant === 'subgroup' && 'text-muted-foreground font-medium',
              variant === 'section' && 'font-semibold',
              customClass,
              amountClassName
            )}
          >
            {displayVal}
          </div>
        );
      })}
    </div>
  );
}
