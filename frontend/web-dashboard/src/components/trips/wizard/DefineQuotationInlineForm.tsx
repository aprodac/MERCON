import React from 'react';
import { Sparkles, DollarSign, Truck, Zap, AlertCircle } from 'lucide-react';
import { getAllTaxonomyOptions, normalizeCode } from '@/utils/taxonomyRegistry';
import { normalizeRateCategory } from '@/hooks/useCreateTripForm';
import { LaneRateHistoryPopover } from './LaneRateHistoryPopover';

interface DefineQuotationInlineFormProps {
  primarySlot: any;
  selectedCustName?: string;
  contractCustomer?: string;
  contractVehicleType?: string;
  contractRateCategory?: string;
  contractBillingType?: string;
  inlinePricingBasis: 'Per Trip' | 'Per Month';
  setInlinePricingBasis: (basis: 'Per Trip' | 'Per Month') => void;
  setContractBillingType?: (bType: string) => void;
  setContractVehicleType?: (vType: string) => void;
  setContractRateCategory?: (rCat: string) => void;
  handleUpdateTripSlot: (slotId: string, patch: any) => void;
  fieldErrors?: Record<string, boolean>;
  assignmentType?: string;
}

export const DefineQuotationInlineForm: React.FC<DefineQuotationInlineFormProps> = ({
  primarySlot,
  selectedCustName,
  contractCustomer,
  contractVehicleType,
  contractRateCategory,
  contractBillingType,
  inlinePricingBasis,
  setInlinePricingBasis,
  setContractBillingType,
  setContractVehicleType,
  setContractRateCategory,
  handleUpdateTripSlot,
  fieldErrors = {},
  assignmentType = 'own',
}) => {
  const vehicleClassOptions = React.useMemo(() => getAllTaxonomyOptions('VEHICLE_CLASS'), []);
  const lineTypeOptions = React.useMemo(() => getAllTaxonomyOptions('LINE_TYPE'), []);
  const is3PL = assignmentType === 'third_party' || assignmentType === '3pl';

  return (
    <div className="p-3.5 rounded-xl bg-orange-50/40 dark:bg-slate-800/60 border border-orange-200/80 dark:border-slate-700 space-y-3">
      {/* HEADER BADGE & LANE DETAILS */}
      <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-orange-200/60 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-black text-[#FA634E] bg-orange-100 dark:bg-orange-950/60 px-2.5 py-0.5 rounded-full border border-orange-200/80 flex items-center gap-1 shadow-2xs">
            {primarySlot.rateMatched || primarySlot.matchedRateCard ? '✏️ Edit Selected Quotation' : '✨ Define Quotation'}
          </span>
          <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
            for {selectedCustName || 'Customer'}
          </span>
        </div>

        {/* LANE SUMMARY BADGE & RATE HISTORY TRIGGER BUTTON */}
        <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-600 dark:text-slate-300 flex-wrap">
          <span className="px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-extrabold text-slate-900 dark:text-white">
            {primarySlot.origin || 'Origin'} → {primarySlot.destination || 'Destination'}
          </span>
          <span className="px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
            {contractVehicleType || '10 TON'}
          </span>
          <span className="px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
            {contractRateCategory || 'Single Trip'}
          </span>

          <LaneRateHistoryPopover
            origin={primarySlot.origin}
            destination={primarySlot.destination}
            vehicleClass={contractVehicleType}
            customerId={contractCustomer}
            onApplyRate={(bRate, dPayout) => {
              handleUpdateTripSlot(primarySlot.id, {
                billingAmount: bRate,
                ...(!is3PL && dPayout != null ? { driverPayout: dPayout, driverPayoutModified: true } : {}),
                saveAsQuotation: true,
                saveAsRateCard: true,
              });
            }}
          />
        </div>
      </div>

      {/* SPECIFICATION SELECTORS: BILLING TYPE + VEHICLE CLASS + LINE TYPE */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pb-1">
        {/* BILLING TYPE */}
        <div className="space-y-1">
          <label className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
            Billing Type
          </label>
          <select
            value={contractBillingType?.toLowerCase() === 'extra' ? 'Extra' : 'Monthly'}
            onChange={(e) => {
              const val = e.target.value;
              setContractBillingType?.(val);
              handleUpdateTripSlot(primarySlot.id, { matchedRateCard: null });
            }}
            className="h-8.5 w-full px-2.5 text-xs font-bold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#FA634E] shadow-2xs cursor-pointer"
          >
            <option value="Monthly">Monthly (Contract Duty)</option>
            <option value="Extra">Extra (Spot / Per Trip)</option>
          </select>
        </div>

        {/* VEHICLE CLASS */}
        <div className="space-y-1">
          <label className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
            Vehicle Class
          </label>
          <select
            value={contractVehicleType || '10 TON'}
            onChange={(e) => {
              const val = e.target.value;
              setContractVehicleType?.(val);
              handleUpdateTripSlot(primarySlot.id, { vehicleType: val, matchedRateCard: null });
            }}
            className="h-8.5 w-full px-2.5 text-xs font-bold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#FA634E] shadow-2xs cursor-pointer"
          >
            {vehicleClassOptions.map((opt) => (
              <option key={opt.code} value={opt.code}>
                {opt.label || opt.code}
              </option>
            ))}
          </select>
        </div>

        {/* LINE TYPE */}
        <div className="space-y-1">
          <label className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
            Line Type
          </label>
          <select
            value={
              lineTypeOptions.find(
                (opt) => opt.code === contractRateCategory || opt.label === contractRateCategory || normalizeCode(opt.code) === normalizeCode(contractRateCategory)
              )?.code || contractRateCategory || 'SINGLE_TRIP'
            }
            onChange={(e) => {
              const rawVal = e.target.value;
              const optObj = lineTypeOptions.find((opt) => opt.code === rawVal || opt.label === rawVal);
              const normVal = optObj?.label || normalizeRateCategory(rawVal);
              setContractRateCategory?.(normVal);
              handleUpdateTripSlot(primarySlot.id, { rateCategory: normVal, matchedRateCard: null });
            }}
            className="h-8.5 w-full px-2.5 text-xs font-bold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#FA634E] shadow-2xs cursor-pointer"
          >
            {lineTypeOptions.map((opt) => (
              <option key={opt.code} value={opt.code}>
                {opt.label || opt.code}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* INPUT FIELDS: BILLING AMOUNT + DRIVER PAYOUT (OWN FLEET ONLY) + PRICING BASIS DROPDOWN */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
        {/* CUSTOMER BILLING AMOUNT */}
        <div id={`field-billing-amount-${primarySlot?.id}`} className={`${is3PL ? 'sm:col-span-9' : 'sm:col-span-5'} space-y-1`}>
          <label className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center justify-between">
            <span className="flex items-center gap-1.5"><DollarSign className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> Customer Billing Rate (SAR) <span className="text-[#FA634E]">*</span></span>
            {(fieldErrors?.[`billingAmount-${primarySlot?.id}`] || fieldErrors?.['billingAmount']) && (
              <span className="text-[9px] font-bold text-red-500 animate-pulse">Required</span>
            )}
          </label>
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">SAR</span>
            <input
              type="number"
              min="0"
              step="1"
              placeholder="e.g. 1500"
              value={primarySlot.billingAmount || ''}
              onChange={(e) => {
                const val = e.target.value;
                handleUpdateTripSlot(primarySlot.id, {
                  billingAmount: val,
                  saveAsQuotation: true,
                  saveAsRateCard: true,
                  pricingBasis: inlinePricingBasis,
                });
              }}
              className={`h-8.5 w-full pl-11 pr-3 text-xs font-mono font-black rounded-xl border bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#FA634E] shadow-2xs ${
                (fieldErrors?.[`billingAmount-${primarySlot?.id}`] || fieldErrors?.['billingAmount'])
                  ? 'border-red-500 ring-2 ring-red-500/30 bg-red-50/20 dark:bg-red-950/20'
                  : 'border-slate-300 dark:border-slate-700'
              }`}
            />
          </div>
          {(fieldErrors?.[`billingAmount-${primarySlot?.id}`] || fieldErrors?.['billingAmount']) && (
            <div className="flex items-center gap-1.5 mt-1 text-[11px] font-bold text-rose-600 dark:text-rose-400">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>Please enter billing rate</span>
            </div>
          )}
        </div>

        {/* DRIVER PAYOUT — OWN FLEET ONLY */}
        {!is3PL && (
          <div id={`field-driver-payout-${primarySlot?.id}`} className="sm:col-span-4 space-y-1">
            <label className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center justify-between">
              <span className="flex items-center gap-1.5"><Truck className="w-3.5 h-3.5 text-blue-600 shrink-0" /> Driver Payout (SAR) <span className="text-[#FA634E]">*</span></span>
              {(fieldErrors?.[`driverPayout-${primarySlot?.id}`] || fieldErrors?.['driverPayout']) && (
                <span className="text-[9px] font-bold text-red-500 animate-pulse">Required</span>
              )}
            </label>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">SAR</span>
              <input
                type="number"
                min="0"
                step="1"
                placeholder="e.g. 400"
                value={primarySlot.driverPayout !== undefined ? primarySlot.driverPayout : ''}
                onChange={(e) => {
                  const val = e.target.value;
                  handleUpdateTripSlot(primarySlot.id, {
                    driverPayout: val,
                    driverPayoutModified: true,
                    saveAsQuotation: true,
                    saveAsRateCard: true,
                    pricingBasis: inlinePricingBasis,
                  });
                }}
                className={`h-8.5 w-full pl-11 pr-3 text-xs font-mono font-black rounded-xl border bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#FA634E] shadow-2xs ${
                  (fieldErrors?.[`driverPayout-${primarySlot?.id}`] || fieldErrors?.['driverPayout'])
                    ? 'border-red-500 ring-2 ring-red-500/30 bg-red-50/20 dark:bg-red-950/20'
                    : 'border-slate-300 dark:border-slate-700'
                }`}
              />
            </div>
            {(fieldErrors?.[`driverPayout-${primarySlot?.id}`] || fieldErrors?.['driverPayout']) && (
              <div className="flex items-center gap-1.5 mt-1 text-[11px] font-bold text-rose-600 dark:text-rose-400">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>Please enter driver payout</span>
              </div>
            )}
          </div>
        )}

        {/* PRICING BASIS SELECT DROPDOWN */}
        <div className="sm:col-span-3 space-y-1">
          <label className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
            Rate Basis
          </label>
          <select
            value={inlinePricingBasis}
            onChange={(e) => {
              const val = e.target.value as 'Per Trip' | 'Per Month';
              setInlinePricingBasis(val);
              handleUpdateTripSlot(primarySlot.id, { pricingBasis: val });
            }}
            className="h-8.5 w-full px-2.5 text-xs font-bold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#FA634E] shadow-2xs cursor-pointer"
          >
            <option value="Per Trip">Per Trip</option>
            <option value="Per Month">Per Month</option>
          </select>
        </div>
      </div>

      {/* PER-MONTH DUAL-RATE BREAKDOWN HELPER */}
      {inlinePricingBasis === 'Per Month' && Number(primarySlot.billingAmount) > 0 && (
        <div className="flex items-center justify-between flex-wrap gap-1 text-[11px] font-extrabold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/40 px-3 py-1.5 rounded-lg border border-purple-200 dark:border-purple-900">
          <span className="flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-purple-600 shrink-0" /> Per-Trip Breakdown: <strong className="font-mono">SAR {(Math.round(((Number(primarySlot.billingAmount) || 0) / 30) * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })} / trip</strong> (30-day contract duty)
          </span>
          {!is3PL && Number(primarySlot.driverPayout) > 0 && (
            <span className="text-[10px] font-mono text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 px-2 py-0.5 rounded border border-purple-200 dark:border-purple-800">
              Driver Payout: <strong>SAR {Number(primarySlot.driverPayout).toLocaleString()} / trip</strong>
            </span>
          )}
        </div>
      )}
    </div>
  );
};
