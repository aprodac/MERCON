import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { tripService } from '@/services/tripService';

export interface ExtraStopPrompt {
  tripId: string;
  added: number;
  rate: number | null;
  unit: string | null;
  ruleId: string | null;
  chargeType: string;
  hasDriver: boolean;
}

/**
 * Shown after stops were added to an existing trip. Everything is optional and
 * skipped by default: bill the customer an extra-stop charge (a TripCharge line,
 * pre-filled from their "additional stop" rule) and/or raise the driver payout.
 * The quotation and the trip price are never changed.
 */
export function ExtraStopChargeDialog({ prompt, onClose }: { prompt: ExtraStopPrompt | null; onClose: () => void }) {
  const [addCharge, setAddCharge] = useState(false);
  const [rate, setRate] = useState('');
  const [payout, setPayout] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!prompt) return;
    setAddCharge(false);
    setRate(prompt.rate != null ? String(prompt.rate) : '');
    setPayout('');
  }, [prompt]);

  if (!prompt) return null;
  const rateNum = parseFloat(rate);
  const payoutNum = parseFloat(payout);
  const chargeValid = addCharge && rateNum > 0;
  const payoutValid = payoutNum > 0;
  const nothing = !chargeValid && !payoutValid;

  const save = async () => {
    setSaving(true);
    try {
      await tripService.addExtraStop(prompt.tripId, {
        ...(chargeValid ? { charge: { surchargeRuleId: prompt.ruleId, charge_type: prompt.chargeType, unit: prompt.unit ?? 'per stop', rate: rateNum, quantity: prompt.added } } : {}),
        ...(payoutValid ? { driver_payout_increase: payoutNum } : {}),
      });
      toast.success('Extra stop saved');
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Could not save the extra stop charge');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Extra stop added</DialogTitle>
          <DialogDescription>
            {prompt.added} stop{prompt.added > 1 ? 's' : ''} added. The quotation and the trip price are unchanged. Charge for it? (optional)
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <label className="flex items-center gap-2 font-semibold">
            <input type="checkbox" checked={addCharge} onChange={(e) => setAddCharge(e.target.checked)} />
            Add extra stop charge to the customer
          </label>
          {addCharge && (
            <div className="flex items-center gap-2 pl-6">
              <span className="text-slate-500">{prompt.chargeType} · SAR</span>
              <Input type="number" min="0" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} className="w-28" aria-label="Charge per stop" />
              <span className="text-slate-500">× {prompt.added}</span>
            </div>
          )}
          {prompt.hasDriver && (
            <div className="flex items-center gap-2">
              <span className="font-semibold">Raise driver payout by SAR</span>
              <Input type="number" min="0" inputMode="decimal" value={payout} onChange={(e) => setPayout(e.target.value)} placeholder="optional" className="w-28" aria-label="Driver payout raise" />
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Skip</Button>
          <Button onClick={save} disabled={saving || nothing}>Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
