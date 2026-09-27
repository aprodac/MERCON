import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, CheckCircle2, X, ArrowLeft, Receipt } from 'lucide-react';
import { Trip, TripChargeInput, tripService } from '@/services/tripService';
import Btn from '@/components/ui/Btn';
import TripChargeLineEditor from '@/components/trips/TripChargeLineEditor';

interface PostTripSettlementModalProps {
  isOpen: boolean;
  onClose: () => void;
  trip: Trip | null;
  onSuccess: () => void;
}

const toChargeInput = (c: NonNullable<Trip['charges']>[number]): TripChargeInput => ({
  surchargeRuleId: c.surchargeRuleId,
  charge_type: c.charge_type,
  unit: c.unit,
  rate: c.rate,
  quantity: c.quantity,
  amount: c.amount,
});

export default function PostTripSettlementModal({
  isOpen,
  onClose,
  trip,
  onSuccess,
}: PostTripSettlementModalProps) {
  const queryClient = useQueryClient();
  const [hasExtraCharges, setHasExtraCharges] = useState<boolean | null>(null);
  const [charges, setCharges] = useState<TripChargeInput[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (trip) {
      setCharges((trip.charges || []).map(toChargeInput));
      setHasExtraCharges(null);
      setError(null);
    }
  }, [trip]);

  if (!isOpen || !trip) return null;

  const handleSubmitNoCharges = async () => {
    setLoading(true);
    setError(null);
    try {
      await tripService.updateFinancials(trip.id, {
        charges: [],
        is_post_trip_settled: true,
      });
      queryClient.invalidateQueries({ queryKey: ['surcharge-rules'] });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || 'Failed to complete financial settlement.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitWithCharges = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await tripService.updateFinancials(trip.id, {
        charges,
        is_post_trip_settled: true,
      });
      queryClient.invalidateQueries({ queryKey: ['surcharge-rules'] });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || 'Failed to update financial charges.');
    } finally {
      setLoading(false);
    }
  };

  const driverInfo = trip.is_third_party
    ? (trip.third_party_driver_name || trip.thirdPartyProvider?.name || '3PL Driver')
    : (trip.driver ? `${trip.driver.first_name} ${trip.driver.last_name || ''}`.trim() : 'Unassigned Driver');

  const vehicleInfo = trip.vehicle?.plate_number || trip.third_party_vehicle_plate || 'No Vehicle';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/50 backdrop-blur-xs p-4 animate-fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-black/[0.08] dark:border-slate-800 shadow-2xl max-w-lg w-full overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-black/[0.06] dark:border-slate-800 flex items-center justify-between bg-slate-50/60 dark:bg-slate-800/40 shrink-0">
          <div className="flex items-center gap-3">
            <Receipt className="w-4 h-4 text-brand shrink-0" />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Additional Charges & Settlement</h3>
                <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700">
                  #{trip.ref_id || trip.id.substring(0, 8)}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X size={15} />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 space-y-4 overflow-y-auto">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-400 text-xs rounded-xl font-medium">
              {error}
            </div>
          )}

          {/* Context Summary Card */}
          <div className="p-3.5 bg-slate-50/80 dark:bg-slate-800/40 rounded-xl border border-slate-200/70 dark:border-slate-800/80 space-y-2 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Customer</span>
              <span className="font-bold text-slate-900 dark:text-slate-100">{trip.customer?.name || '—'}</span>
            </div>
            <div className="flex justify-between items-center pt-1 border-t border-slate-200/50 dark:border-slate-800">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Driver & Vehicle</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {driverInfo} • {vehicleInfo}
              </span>
            </div>
          </div>

          {/* Choice Step */}
          {hasExtraCharges === null ? (
            <div className="space-y-4 py-1">
              <div className="text-center space-y-1">
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">Were there any Waiting, Labour, or Extra Charges?</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Select an option below to complete financial settlement for this trip.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleSubmitNoCharges}
                  disabled={loading}
                  className="p-4 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 hover:border-emerald-500/50 hover:bg-emerald-50/30 dark:hover:bg-emerald-950/20 text-slate-700 dark:text-slate-200 transition-all shadow-2xs flex flex-col items-center text-center gap-2 cursor-pointer group"
                >
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  <div>
                    <span className="block text-xs font-bold text-slate-900 dark:text-slate-100">No Extra Charges</span>
                    <span className="block text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Complete trip fully (SAR 0 extra)</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setHasExtraCharges(true)}
                  className="p-4 rounded-xl border border-brand/30 bg-orange-50/30 dark:bg-orange-950/20 hover:border-brand hover:bg-orange-50/70 dark:hover:bg-orange-950/40 transition-all shadow-2xs flex flex-col items-center text-center gap-2 cursor-pointer group"
                >
                  <Plus className="w-5 h-5 text-white shrink-0" />
                  <div>
                    <span className="block text-xs font-bold text-brand dark:text-orange-400">Yes, Add Charges</span>
                    <span className="block text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Add detention, waiting, or labour fees</span>
                  </div>
                </button>
              </div>
            </div>
          ) : (
            /* Input Form Step */
            <form onSubmit={handleSubmitWithCharges} className="space-y-4 pt-1">
              <div>
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-2">
                  Itemized Extra Charges
                </label>
                <TripChargeLineEditor
                  customerId={trip.customer?.id}
                  rateCardId={trip.rateCardId}
                  value={charges}
                  onChange={setCharges}
                />
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-200/80 dark:border-slate-800">
                <Btn
                  label="Back"
                  variant="ghost"
                  size="sm"
                  type="button"
                  icon={<ArrowLeft size={14} />}
                  onClick={() => setHasExtraCharges(null)}
                />
                <div className="flex gap-2">
                  <Btn label="Cancel" variant="secondary" onClick={onClose} size="sm" type="button" />
                  <Btn
                    label={loading ? 'Saving...' : 'Save & Complete Settlement'}
                    variant="primary"
                    size="sm"
                    type="submit"
                    disabled={loading}
                  />
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
