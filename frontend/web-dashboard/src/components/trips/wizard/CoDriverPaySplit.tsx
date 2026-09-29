import React from 'react';
import { cn } from '@/lib/utils';

export interface PaySplitValue {
  driverPayoutOverride?: number;
  coDriverPayoutOverride?: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * How one trip's driver payout is shared with a co-driver. It shows the real
 * amounts — half each by default ("auto") — and changing one side moves the
 * other so the two always add up to the lane payout.
 */
export function CoDriverPaySplit({
  total,
  value,
  onChange,
  disabled = false,
}: {
  /** The lane's driver payout for one trip. */
  total: number;
  value: PaySplitValue;
  onChange: (next: PaySplitValue) => void;
  disabled?: boolean;
}) {
  const half = round2(total / 2);
  const isAuto = value.driverPayoutOverride === undefined && value.coDriverPayoutOverride === undefined;
  const driverPay = value.driverPayoutOverride ?? (value.coDriverPayoutOverride !== undefined ? round2(total - value.coDriverPayoutOverride) : half);
  const coPay = value.coDriverPayoutOverride ?? (value.driverPayoutOverride !== undefined ? round2(total - value.driverPayoutOverride) : half);
  const sum = round2(driverPay + coPay);

  const set = (side: 'driver' | 'co', raw: string) => {
    // An emptied box is 0 while you type the new amount.
    const v = Math.max(0, Number(raw) || 0);
    const other = total > 0 ? Math.max(0, round2(total - v)) : undefined;
    onChange(side === 'driver' ? { driverPayoutOverride: v, coDriverPayoutOverride: other } : { coDriverPayoutOverride: v, driverPayoutOverride: other });
  };

  const box = (label: string, amount: number, side: 'driver' | 'co') => (
    <label className="flex flex-col gap-0.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 focus-within:ring-2 focus-within:ring-[#FA634E]/30">
      <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{label}</span>
      <span className="flex items-baseline gap-1">
        <span className="text-[11px] text-slate-400">SAR</span>
        <input
          type="number"
          min="0"
          inputMode="decimal"
          disabled={disabled}
          value={amount}
          onChange={(e) => set(side, e.target.value)}
          className="min-w-0 flex-1 bg-transparent text-sm font-bold tabular-nums text-slate-900 dark:text-slate-100 outline-none"
        />
      </span>
    </label>
  );

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-2 gap-2">
        {box('Driver pay', driverPay, 'driver')}
        {box('Co-driver pay', coPay, 'co')}
      </div>
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="text-slate-500 dark:text-slate-400">
          Per trip · lane payout SAR {total.toLocaleString()}
          {total > 0 && Math.abs(sum - total) > 0.001 && (
            <span className="ml-1 font-semibold text-amber-700 dark:text-amber-300">(split adds up to SAR {sum.toLocaleString()})</span>
          )}
        </span>
        {isAuto ? (
          <span className="rounded-full bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 font-semibold text-emerald-700 dark:text-emerald-300">50/50 auto</span>
        ) : (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange({ driverPayoutOverride: undefined, coDriverPayoutOverride: undefined })}
            className={cn('font-semibold text-slate-500 hover:text-[#c2410c] cursor-pointer', disabled && 'opacity-50')}
          >
            Reset to 50/50
          </button>
        )}
      </div>
    </div>
  );
}

export default CoDriverPaySplit;
