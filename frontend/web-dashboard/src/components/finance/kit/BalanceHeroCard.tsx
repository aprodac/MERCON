import React from 'react';
import { MoneyText } from './MoneyText';
import { Progress } from '@/components/ui/progress';

export interface BalanceHeroCardProps {
  label: string;
  amount: number | string;
  currency?: string;
  appliedPct?: number;
  appliedAmount?: number | string;
  totalAmount?: number | string;
  footerLeft?: string;
  footerRight?: string;
}

export const BalanceHeroCard: React.FC<BalanceHeroCardProps> = ({
  label,
  amount,
  currency = 'SAR',
  appliedPct = 0,
  appliedAmount,
  totalAmount,
  footerLeft,
  footerRight,
}) => {
  return (
    <div className="p-4 rounded-xl border border-border bg-card text-foreground shadow-xs space-y-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-xs text-muted-foreground font-medium">{currency}</span>
        <MoneyText value={amount} className="text-2xl font-semibold fin-num text-foreground tracking-tight" />
      </div>

      <div className="space-y-1.5">
        <Progress value={appliedPct} className="h-1.5 bg-muted" />
        {appliedAmount !== undefined && totalAmount !== undefined && (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Applied <MoneyText value={appliedAmount} className="text-foreground font-medium" /></span>
            <span>of <MoneyText value={totalAmount} className="text-muted-foreground font-medium" /></span>
          </div>
        )}
      </div>

      {(footerLeft || footerRight) && (
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border/60 font-medium">
          <span>{footerLeft}</span>
          <span>{footerRight}</span>
        </div>
      )}
    </div>
  );
};

export default BalanceHeroCard;

