import React, { useState, useEffect } from 'react';
import { DollarSign, Plus, Tag, Trash2, Loader2, Check } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { cn, isUuid } from '@/lib/utils';
import { surchargeRuleService, SurchargeRule } from '@/services/quotationService';
import { TripChargeInput } from '@/services/tripService';
import { Button } from '@/components/ui/button';
import { computeTripFinancials } from '@/utils/financialCalculations';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

interface TripEconomicsSectionProps {
  contractSlots: any[];
  masterDriver: string;
  assignmentType: 'own' | 'third_party' | '3pl' | 'fleet';
  thirdPartyCost?: string;
  marginMetrics?: any;
  contractCustomer?: string;
  customers?: any[];
  handleUpdateTripSlot?: (slotId: string, patch: any) => void;
  isBaseBillingLocked?: boolean;
  isFinancialsLocked?: boolean;
}

export const TripEconomicsSection: React.FC<TripEconomicsSectionProps> = ({
  contractSlots,
  masterDriver,
  assignmentType,
  thirdPartyCost,
  marginMetrics,
  contractCustomer,
  customers = [],
  handleUpdateTripSlot,
  isBaseBillingLocked = false,
  isFinancialsLocked = false,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const primarySlot = contractSlots[0] || {};
  const matchedRateCard = primarySlot.matchedRateCard;
  const rateCardId = primarySlot.rateCardId || matchedRateCard?.id || matchedRateCard?.quotation_id || matchedRateCard?.quotationId;

  // Resolve customer ID
  const selectedCustomerObj = customers.find(
    (c: any) => c.id === contractCustomer || c.name === contractCustomer
  );
  const customerId = selectedCustomerObj?.id || (contractCustomer && isUuid(contractCustomer) ? contractCustomer : undefined);

  // Fetch standing surcharge rules created from quotations or customer
  const { data: presetRules = [], isLoading: isLoadingPresets } = useQuery({
    queryKey: ['surcharge-rules', 'presets', customerId, rateCardId],
    queryFn: () => surchargeRuleService.list({
      customerId: customerId || undefined,
      rateCardId: rateCardId || undefined,
      active_only: true,
    }),
    enabled: !!customerId || !!rateCardId,
  });

  const [chargeLines, setChargeLines] = useState<TripChargeInput[]>(primarySlot.chargeLines || []);

  const totalAdditionalCharges = chargeLines.reduce((sum, line) => sum + (Number(line.amount) || 0), 0);
  const is3PL = assignmentType === 'third_party' || assignmentType === '3pl';
  const activeCardRate = matchedRateCard?.rate ?? matchedRateCard?.base_price;
  const rawBilling = activeCardRate !== undefined && activeCardRate !== null ? activeCardRate : primarySlot.billingAmount;
  const slotPayoutRaw = primarySlot.driverPayout !== undefined ? primarySlot.driverPayout : (matchedRateCard?.driver_payout ?? matchedRateCard?.default_trip_charge);

  const fin = computeTripFinancials({
    customerBilling: rawBilling,
    driverPayout: slotPayoutRaw,
    is3PL,
    subcontractCost: thirdPartyCost,
    additionalCharges: totalAdditionalCharges,
    pricingBasis: primarySlot.pricingBasis || matchedRateCard?.pricing_basis,
  });

  const billingAmountNum = fin.resolvedBilling;
  const driverPayoutNum = fin.resolvedDriverPayout;
  const balanceMarginNum = fin.balanceMargin;
  const marginPercent = `${fin.marginPercent.toFixed(1)}`;

  useEffect(() => {
    if (primarySlot?.chargeLines) {
      setChargeLines(primarySlot.chargeLines);
    } else {
      setChargeLines([]);
    }
  }, [primarySlot?.id]);

  // Sync calculated total additional charges & itemized sub-charges to primary slot only when values change
  useEffect(() => {
    if (!primarySlot?.id || !handleUpdateTripSlot) return;

    const currentChargesStr = (primarySlot.additionalCharges ?? '0').toString();
    const newChargesStr = totalAdditionalCharges.toString();
    const currentLinesJson = JSON.stringify(primarySlot.chargeLines || []);
    const newLinesJson = JSON.stringify(chargeLines || []);

    if (currentChargesStr !== newChargesStr || currentLinesJson !== newLinesJson) {
      handleUpdateTripSlot(primarySlot.id, {
        additionalCharges: newChargesStr,
        chargeLines: chargeLines,
      });
    }
  }, [totalAdditionalCharges, chargeLines, primarySlot?.id, primarySlot?.additionalCharges, primarySlot?.chargeLines]);

  const togglePresetRule = (rule: SurchargeRule) => {
    setChargeLines((prev) => {
      const existingIndex = prev.findIndex(
        (line) => line.surchargeRuleId === rule.id || (line.charge_type && line.charge_type.toLowerCase() === rule.charge_type.toLowerCase())
      );
      if (existingIndex >= 0) {
        return prev.filter((_, idx) => idx !== existingIndex);
      } else {
        const rate = rule.rate || 0;
        return [
          ...prev,
          {
            surchargeRuleId: rule.id,
            charge_type: rule.charge_type,
            unit: rule.unit || null,
            rate: rate,
            quantity: 1,
            amount: rate,
          },
        ];
      }
    });
  };

  const handleAddCustomSubCharge = () => {
    setChargeLines((prev) => [
      ...prev,
      {
        surchargeRuleId: null,
        charge_type: '',
        unit: null,
        rate: 0,
        quantity: 1,
        amount: 0,
      },
    ]);
  };

  const handleUpdateSubCharge = (index: number, patch: Partial<TripChargeInput>) => {
    setChargeLines((prev) =>
      prev.map((line, idx) => {
        if (idx !== index) return line;
        const updated = { ...line, ...patch };

        // Auto-match rate if preset charge selected
        if (patch.charge_type && !patch.rate) {
          const matched = presetRules.find(
            (r) => r.charge_type.toLowerCase() === patch.charge_type?.trim().toLowerCase()
          );
          if (matched) {
            updated.surchargeRuleId = matched.id;
            updated.rate = matched.rate;
            updated.unit = matched.unit || null;
            updated.amount = (updated.quantity || 1) * matched.rate;
          }
        }

        if (patch.quantity !== undefined || patch.rate !== undefined) {
          const qty = patch.quantity !== undefined ? patch.quantity : (line.quantity || 0);
          const rt = patch.rate !== undefined ? patch.rate : (line.rate || 0);
          updated.amount = qty * rt;
        }

        return updated;
      })
    );
  };

  const handleRemoveSubCharge = (index: number) => {
    setChargeLines((prev) => prev.filter((_, idx) => idx !== index));
  };

  return (
    <>
      <div className="p-2.5 rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs space-y-1.5 text-[#3E3C3D] dark:text-slate-100">
        {/* HEADER: FINANCIAL SUMMARY + PROMINENT ADD/MANAGE CHARGES BUTTON */}
        <div className="pb-1 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h4 className="text-[10px] font-extrabold text-[#FA634E] uppercase tracking-wider flex items-center gap-1.5">
            <DollarSign className="w-3.5 h-3.5 text-[#FA634E] shrink-0" /> FINANCIAL SUMMARY
          </h4>

          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-orange-50 hover:bg-orange-100 text-[#FA634E] dark:bg-orange-950/40 dark:hover:bg-orange-900/60 dark:text-orange-400 border border-orange-200/80 dark:border-orange-900/60 text-[10px] font-extrabold transition-all cursor-pointer shadow-2xs active:scale-95"
          >
            <Plus className="w-3 h-3 text-[#FA634E] dark:text-orange-400" />
            <span>{chargeLines.length > 0 ? `Manage Charges (${chargeLines.length})` : 'Add Charges'}</span>
          </button>
        </div>

        {/* METRICS ROWS */}
        <div className="space-y-1">
          {/* ROW 1: CUSTOMER BILLING */}
          <div className="flex items-center justify-between py-1 px-2.5 rounded-lg bg-slate-50/60 dark:bg-slate-800/40">
            <span className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Customer Billing
            </span>
            <span className="text-xs font-black font-mono text-[#3E3C3D] dark:text-white">
              SAR {billingAmountNum.toLocaleString()}
            </span>
          </div>

          {/* ROW 2: DRIVER PAYOUT / 3PL COST */}
          <div className="flex items-center justify-between py-1 px-2.5 rounded-lg bg-slate-50/60 dark:bg-slate-800/40 gap-2">
            <div className="flex flex-col">
              <span className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                {is3PL ? '3PL Cost' : 'Driver Payout'}
              </span>
              {!is3PL && primarySlot.driverPayoutModified && (
                <span className="text-[9px] font-bold text-amber-600 dark:text-amber-400">
                  Syncs to Quotation
                </span>
              )}
            </div>

            {is3PL ? (
              <span className="text-xs font-black font-mono text-[#3E3C3D] dark:text-white">
                SAR {driverPayoutNum.toLocaleString()}
              </span>
            ) : (
              <div className="flex items-center gap-1">
                <span className="text-xs font-bold text-slate-400">SAR</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  disabled={isFinancialsLocked}
                  value={primarySlot.driverPayout !== undefined ? primarySlot.driverPayout : (matchedRateCard?.driver_payout ?? '')}
                  onChange={(e) => {
                    const val = e.target.value;
                    const orig = matchedRateCard?.driver_payout != null ? String(matchedRateCard.driver_payout) : '';
                    const isModified = val !== orig;
                    handleUpdateTripSlot?.(primarySlot.id, {
                      driverPayout: val,
                      driverPayoutModified: isModified,
                      updateQuotationPayout: isModified,
                    });
                  }}
                  placeholder="0"
                  className={cn(
                    "w-20 h-6 px-1.5 text-right text-xs font-mono font-black rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:border-[#FA634E] text-[#3E3C3D] dark:text-white",
                    isFinancialsLocked && "bg-slate-100 dark:bg-slate-800 text-slate-500 cursor-not-allowed"
                  )}
                />
              </div>
            )}
          </div>

          {/* ROW 3: ADDITIONAL CHARGES */}
          <div className="flex items-center justify-between py-1 px-2.5 rounded-lg bg-slate-50/60 dark:bg-slate-800/40">
            <span className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Additional Charges
            </span>
            <span className="text-xs font-black font-mono text-[#3E3C3D] dark:text-white">
              SAR {totalAdditionalCharges.toFixed(2)}
            </span>
          </div>

          {/* ROW 4: BALANCE / MARGIN */}
          <div className="flex items-center justify-between py-1 px-2.5 rounded-lg bg-orange-50/30 dark:bg-orange-950/20 border border-orange-200/50 dark:border-orange-900/40 mt-1">
            <span className="text-[10px] font-extrabold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Balance / Margin
            </span>
            <div className="flex items-center gap-1.5 font-mono">
              <span className={cn(
                "text-xs font-black",
                balanceMarginNum >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
              )}>
                SAR {balanceMarginNum.toLocaleString()}
              </span>
              <span className={cn(
                "text-[10px] font-extrabold px-1.5 py-0.2 rounded-full border",
                balanceMarginNum >= 0
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
                  : "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800"
              )}>
                {marginPercent}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* PERFECTLY ALIGNED MERCON UI MODAL DIALOG */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-xl w-full p-6 gap-4 rounded-2xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl">
          {/* HEADER */}
          <DialogHeader className="space-y-0 text-left pb-2.5 border-b border-slate-100 dark:border-slate-800">
            <DialogTitle className="text-sm font-extrabold text-[#3E3C3D] dark:text-white flex items-center gap-2">
              <Tag className="w-4 h-4 text-[#FA634E]" /> Additional Charges
            </DialogTitle>
          </DialogHeader>

          {/* STANDING SURCHARGES PRESETS */}
          {isLoadingPresets ? (
            <div className="py-2 text-xs text-slate-400 flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#FA634E]" /> Loading surcharge rules...
            </div>
          ) : presetRules.length > 0 ? (
            <div className="space-y-2">
              <span className="text-[10px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                Standing Surcharges
              </span>
              <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1 custom-scrollbar">
                {presetRules.map((rule) => {
                  const isSelected = chargeLines.some(
                    (line) => line.surchargeRuleId === rule.id || (line.charge_type && line.charge_type.toLowerCase() === rule.charge_type.toLowerCase())
                  );
                  return (
                    <div
                      key={rule.id}
                      onClick={() => togglePresetRule(rule)}
                      className={cn(
                        "flex items-center justify-between p-2.5 rounded-xl border text-xs cursor-pointer transition-all",
                        isSelected
                          ? "bg-[#FA634E]/10 border-[#FA634E]/40 text-[#3E3C3D] dark:text-white font-semibold"
                          : "bg-slate-50 dark:bg-slate-800/40 border-slate-200/80 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-[#FA634E]/30"
                      )}
                    >
                      <span className="font-semibold text-xs text-[#3E3C3D] dark:text-slate-100 flex-1 pr-3 truncate">
                        {rule.charge_type}
                      </span>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="font-mono text-xs font-bold text-slate-600 dark:text-slate-300">
                          SAR {rule.rate}{rule.unit ? `/${rule.unit.toLowerCase().replace('per ', '')}` : ''}
                        </span>
                        <span
                          className={cn(
                            "px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 min-w-[70px] justify-center",
                            isSelected
                              ? "bg-[#FA634E] text-white shadow-2xs"
                              : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-[#FA634E] hover:text-[#FA634E]"
                          )}
                        >
                          {isSelected ? (
                            <>
                              <Check className="w-3 h-3" /> Added
                            </>
                          ) : (
                            <>
                              <Plus className="w-3 h-3" /> Add
                            </>
                          )}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* ACTIVE CHARGES SECTION */}
          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                Active Charges ({chargeLines.length})
              </span>
              <button
                type="button"
                onClick={handleAddCustomSubCharge}
                className="text-xs font-bold text-[#FA634E] hover:text-[#FA634E]/90 flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Add Charge Line
              </button>
            </div>

            {chargeLines.length > 0 ? (
              <div className="space-y-2">
                {/* TABLE COLUMN HEADERS */}
                <div className="grid grid-cols-[1fr_70px_95px_105px_32px] gap-2 px-1 text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">
                  <span>Charge Description</span>
                  <span className="text-center">Qty</span>
                  <span className="text-right">Rate (SAR)</span>
                  <span className="text-right">Amount</span>
                  <span></span>
                </div>

                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                  {chargeLines.map((line, index) => (
                    <div
                      key={index}
                      className="grid grid-cols-[1fr_70px_95px_105px_32px] gap-2 items-center p-1.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30"
                    >
                      <input
                        type="text"
                        placeholder="Charge description..."
                        value={line.charge_type}
                        onChange={(e) => handleUpdateSubCharge(index, { charge_type: e.target.value })}
                        className="h-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 text-xs font-semibold outline-none focus:border-[#FA634E] text-[#3E3C3D] dark:text-white"
                      />

                      <input
                        type="number"
                        min="1"
                        step="0.1"
                        title="Quantity"
                        value={line.quantity || 1}
                        onChange={(e) => handleUpdateSubCharge(index, { quantity: parseFloat(e.target.value) || 0 })}
                        className="h-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-1.5 text-xs font-mono font-bold text-center outline-none focus:border-[#FA634E] text-[#3E3C3D] dark:text-white"
                      />

                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        title="Rate (SAR)"
                        value={line.rate || 0}
                        onChange={(e) => handleUpdateSubCharge(index, { rate: parseFloat(e.target.value) || 0 })}
                        className="h-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 text-xs font-mono font-bold text-right outline-none focus:border-[#FA634E] text-[#3E3C3D] dark:text-white"
                      />

                      <div className="h-8 px-2.5 flex items-center justify-end bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg font-mono font-extrabold text-xs text-[#3E3C3D] dark:text-white truncate">
                        SAR {(line.amount || 0).toFixed(2)}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveSubCharge(index)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
                        title="Remove charge line"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="py-2.5 text-center text-xs text-slate-400 italic font-medium">
                No extra charges selected.
              </div>
            )}
          </div>

          {/* FOOTER */}
          <DialogFooter className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800 sm:justify-between">
            <div className="font-mono text-sm font-extrabold text-[#3E3C3D] dark:text-white">
              Total: SAR {totalAdditionalCharges.toFixed(2)}
            </div>
            <Button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="h-9 px-6 bg-[#FA634E] hover:bg-[#FA634E]/90 text-white font-bold text-xs rounded-xl shadow-2xs cursor-pointer"
            >
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
