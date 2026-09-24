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
    <div className="p-5 rounded-2xl bg-[#3E3C3D] text-white shadow-lg space-y-3">
      <div className="text-[10px] font-bold uppercase tracking-wider text-white/60">
        {label}
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-xs font-mono text-white/60 font-semibold">{currency}</span>
        <MoneyText value={amount} className="text-3xl font-extrabold fin-num text-white tracking-tight" />
      </div>

      <div className="space-y-1">
        <Progress value={appliedPct} className="h-2 bg-white/12" />
        {appliedAmount !== undefined && totalAmount !== undefined && (
          <div className="flex items-center justify-between text-[11px] font-mono text-white/60">
            <span>Applied <MoneyText value={appliedAmount} className="text-white font-semibold" /></span>
            <span>of <MoneyText value={totalAmount} className="text-white/80" /></span>
          </div>
        )}
      </div>

      {(footerLeft || footerRight) && (
        <div className="flex items-center justify-between text-[11px] text-white/60 pt-1 border-t border-white/10 font-medium">
          <span>{footerLeft}</span>
          <span>{footerRight}</span>
        </div>
      )}
    </div>
  );
};

export default BalanceHeroCard;
