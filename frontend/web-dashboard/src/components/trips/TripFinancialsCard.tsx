import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Plus, ReceiptText, ChevronDown } from 'lucide-react';

interface TripFinancialsCardProps {
  baseRate?: number;
  additionalCharges?: number;
  totalAmount?: number;
  paidAmount?: number;
  balanceDue?: number;
  onAddCharge?: () => void;
  onViewBreakdown?: () => void;
}

export default function TripFinancialsCard({
  baseRate = 2200,
  additionalCharges = 300,
  totalAmount = 2500,
  paidAmount = 0,
  balanceDue = 2500,
  onAddCharge,
  onViewBreakdown,
}: TripFinancialsCardProps) {
  const [currency, setCurrency] = React.useState<'SAR' | 'USD'>('SAR');

  const fmt = (amt: number) =>
    amt.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });

  return (
    <Card className="rounded-2xl border border-black/[0.08] dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-4">
      {/* Header & Currency Switcher */}
      <div className="flex items-center justify-between">
        <h3 className="text-base font-extrabold text-[#3E3C3D] dark:text-slate-100 tracking-tight">
          Financials
        </h3>
        <div className="relative">
          <button
            type="button"
            onClick={() => setCurrency(currency === 'SAR' ? 'USD' : 'SAR')}
            className="flex items-center gap-1 text-xs font-bold text-[#3E3C3D] dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 transition-colors"
          >
            {currency} <ChevronDown size={12} />
          </button>
        </div>
      </div>

      {/* Total Amount Big Text */}
      <div className="space-y-1">
        <span className="text-xs text-[#6E6E80] dark:text-slate-400 font-medium block">
          Total Amount
        </span>
        <h2 className="text-2xl sm:text-3xl font-black text-[#3E3C3D] dark:text-slate-100 font-mono tracking-tight">
          {currency} {fmt(totalAmount)}
        </h2>

        {/* Paid vs Balance Due Badges */}
        <div className="flex items-center gap-4 pt-2">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#9898A4] block">
              Paid
            </span>
            <span className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400 font-mono">
              {currency} {fmt(paidAmount)}
            </span>
          </div>

          <div className="h-6 w-px bg-slate-200 dark:bg-slate-800" />

          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-500 block">
              Balance Due
            </span>
            <span className="text-sm font-extrabold text-rose-600 dark:text-rose-400 font-mono">
              {currency} {fmt(balanceDue)}
            </span>
          </div>
        </div>
      </div>

      {/* Breakdown List */}
      <div className="space-y-2 text-xs pt-1">
        <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
          <span className="font-medium">Base Rate</span>
          <span className="font-mono font-bold">
            {currency} {fmt(baseRate)}
          </span>
        </div>

        <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
          <span className="font-medium">Additional Charges</span>
          <span className="font-mono font-bold">
            {currency} {fmt(additionalCharges)}
          </span>
        </div>

        <Separator className="my-2" />

        <div className="flex items-center justify-between text-[#3E3C3D] dark:text-slate-100 font-bold text-sm">
          <span>Total</span>
          <span className="font-mono">
            {currency} {fmt(totalAmount)}
          </span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-2 pt-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onAddCharge}
          className="h-9 text-xs font-bold text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-950/50 gap-1.5 cursor-pointer"
        >
          <Plus size={14} /> Add Charge
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={onViewBreakdown}
          className="h-9 text-xs font-bold text-[#3E3C3D] dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 gap-1.5 cursor-pointer"
        >
          <ReceiptText size={14} /> View Breakdown
        </Button>
      </div>
    </Card>
  );
}
