import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Banknote,
  Receipt,
  CheckCircle2,
  AlertCircle,
  Hash,
  Sparkles,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  maintenanceService,
  MaintenanceRecord,
  MaintenanceStatus,
} from '@/services/maintenanceService';

interface AddMaintenanceCostModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: MaintenanceRecord | null;
  onSuccess?: () => void;
}

export default function AddMaintenanceCostModal({
  open,
  onOpenChange,
  record,
  onSuccess,
}: AddMaintenanceCostModalProps) {
  const queryClient = useQueryClient();

  const [cost, setCost] = useState<number | string>(0);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [isPaid, setIsPaid] = useState(true);
  const [status, setStatus] = useState<MaintenanceStatus>('Completed');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (record) {
      setCost(record.cost ?? 0);
      setInvoiceNumber(record.invoice_number ?? '');
      const paidState = (record.cost > 0) || (record.status === 'Completed');
      setIsPaid(paidState);
      setStatus(record.status ?? 'Completed');
      setErrorMsg('');
    }
  }, [record, open]);

  const updateMutation = useMutation({
    mutationFn: (payload: { cost: number; invoice_number?: string; status?: MaintenanceStatus }) => {
      if (!record?.id) throw new Error('No record selected');
      return maintenanceService.update(record.id, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance'] });
      if (record?.id) {
        queryClient.invalidateQueries({ queryKey: ['maintenance-detail', record.id] });
      }
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      if (record?.vehicleId) {
        queryClient.invalidateQueries({ queryKey: ['vehicle', record.vehicleId] });
        queryClient.invalidateQueries({ queryKey: ['vehicle-financials', record.vehicleId] });
      }
      onOpenChange(false);
      if (onSuccess) onSuccess();
    },
    onError: (err: any) => {
      setErrorMsg(err.response?.data?.error?.message || 'Failed to update maintenance cost.');
    },
  });

  const handlePaidToggle = (checked: boolean) => {
    setIsPaid(checked);
    if (checked && status !== 'Completed') {
      setStatus('Completed');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numericCost = typeof cost === 'number' ? cost : parseFloat(cost) || 0;
    if (numericCost < 0) {
      setErrorMsg('Cost cannot be negative.');
      return;
    }

    const payload: { cost: number; invoice_number?: string; status?: MaintenanceStatus } = {
      cost: numericCost,
      invoice_number: invoiceNumber.trim() || undefined,
      status: status,
    };

    updateMutation.mutate(payload);
  };

  if (!record) return null;

  const orderNo = record.ref_id || `MNT-${record.id.slice(0, 8)}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl p-0 overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800">
        {/* Header */}
        <DialogHeader className="px-6 py-4 bg-slate-50/80 dark:bg-slate-900/80 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5 text-brand">
            <Banknote className="w-4 h-4 text-slate-600 shrink-0" />
            <div>
              <DialogTitle className="text-base font-extrabold text-slate-900 dark:text-slate-100">
                Add / Update Maintenance Cost
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 mt-0.5 flex items-center gap-1 font-mono">
                <Hash className="w-3 h-3 text-slate-400" />
                Service Order {orderNo} · {record.workshop_name || 'Workshop'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50 text-xs font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Amount input */}
          <div className="space-y-1.5">
            <Label className="text-xs font-extrabold text-slate-700 dark:text-slate-300">
              Cost Amount (SAR) *
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono font-extrabold text-slate-400">
                SAR
              </span>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                className="pl-12 font-mono font-bold text-sm h-10 rounded-xl border-slate-200 dark:border-slate-800"
                required
              />
            </div>
          </div>

          {/* Invoice Number input */}
          <div className="space-y-1.5">
            <Label className="text-xs font-extrabold text-slate-700 dark:text-slate-300">
              Invoice / Bill Number
            </Label>
            <div className="relative">
              <Receipt className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                type="text"
                placeholder="e.g. INV-884920"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                className="pl-9 font-mono text-xs h-10 rounded-xl border-slate-200 dark:border-slate-800"
              />
            </div>
          </div>

          {/* Maintenance Status select */}
          <div className="space-y-1.5">
            <Label className="text-xs font-extrabold text-slate-700 dark:text-slate-300">
              Order Status
            </Label>
            <Select
              value={status}
              onValueChange={(v) => {
                const val = v as MaintenanceStatus;
                setStatus(val);
                if (val === 'Completed') {
                  setIsPaid(true);
                }
              }}
            >
              <SelectTrigger className="h-10 text-xs rounded-xl w-full border-slate-200 dark:border-slate-800">
                <SelectValue placeholder="Select Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Completed">Completed</SelectItem>
                <SelectItem value="In_Progress">In Progress</SelectItem>
                <SelectItem value="Scheduled">Scheduled</SelectItem>
                <SelectItem value="Cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Mark as Paid Card / Toggle */}
          <div
            className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
              isPaid
                ? 'bg-emerald-500/5 border-emerald-500/30 dark:bg-emerald-950/20'
                : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800'
            }`}
            onClick={() => handlePaidToggle(!isPaid)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Checkbox
                  id="mark-paid"
                  checked={isPaid}
                  onCheckedChange={(c) => handlePaidToggle(!!c)}
                  className="data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
                />
                <div>
                  <label
                    htmlFor="mark-paid"
                    className="text-xs font-extrabold cursor-pointer text-slate-900 dark:text-slate-100 block"
                  >
                    Mark as Paid &amp; Settled
                  </label>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Flag this workshop service expense as paid in full.
                  </p>
                </div>
              </div>

              {isPaid ? (
                <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px] font-extrabold uppercase shrink-0">
                  <CheckCircle2 className="w-3 h-3 mr-1" /> Paid
                </Badge>
              ) : (
                <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px] font-extrabold uppercase shrink-0">
                  Unpaid
                </Badge>
              )}
            </div>
          </div>

          {/* Footer actions */}
          <DialogFooter className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2 shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-xs h-9 rounded-xl font-bold"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={updateMutation.isPending}
              className="text-xs h-9 rounded-xl bg-brand hover:bg-[#d03c0b] text-white font-extrabold px-5 gap-1.5 shadow-sm"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {updateMutation.isPending ? 'Saving…' : 'Save Cost'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
