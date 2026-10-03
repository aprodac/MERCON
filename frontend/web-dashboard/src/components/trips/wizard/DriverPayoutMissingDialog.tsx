import React from 'react';
import { AlertTriangle } from 'lucide-react';
import Btn from '@/components/ui/Btn';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface DriverPayoutMissingDialogProps {
  isOpen: boolean;
  /** e.g. "QT-83 · Riyadh → Jeddah · 5 TON"; empty for a route without a saved quotation. */
  quotationLabel?: string;
  /** Whether the trip uses a saved quotation (the "save on quotation" box only makes sense then). */
  hasQuotation: boolean;
  onClose: () => void;
  onSave: (payout: string, saveOnQuotation: boolean) => void;
}

/**
 * Shown on Create Trip when an own-fleet trip has no driver payout — as soon as a
 * quotation without one is picked, and again on Review / Create. A trip can't be
 * created without a payout; "Save it on the quotation too" also writes it back so
 * the next trip on that route fills it in.
 */
export default function DriverPayoutMissingDialog({ isOpen, quotationLabel, hasQuotation, onClose, onSave }: DriverPayoutMissingDialogProps) {
  const [value, setValue] = React.useState('');
  const [saveOnQuotation, setSaveOnQuotation] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!isOpen) return;
    setValue('');
    setSaveOnQuotation(true);
    setError(null);
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [isOpen]);

  const submit = () => {
    const n = Number(value);
    if (!value.trim() || !Number.isFinite(n) || n <= 0) {
      setError('Enter a payout above 0');
      return;
    }
    onSave(String(n), hasQuotation && saveOnQuotation);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="w-full max-w-sm rounded-[24px] p-6 border-black/[0.08] shadow-2xl [&>button]:right-4 [&>button]:top-4 [&>button]:text-gray-400">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400 flex items-center justify-center shrink-0">
            <AlertTriangle size={20} className="stroke-[2.2]" />
          </div>
          <DialogHeader className="p-0 m-0 text-left">
            <DialogTitle className="text-base font-bold text-[#1C1C2E] dark:text-white leading-tight">
              Driver payout not entered
            </DialogTitle>
            <DialogDescription className="text-xs text-[#6E6E80] dark:text-slate-400 mt-1 font-medium">
              {quotationLabel ? `${quotationLabel} has no driver payout.` : 'This trip has no driver payout.'} Enter it to create the trip.
            </DialogDescription>
          </DialogHeader>
        </div>

        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            submit();
          }}
        >
          <label className="block">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Driver payout for this trip (SAR)</span>
            <input
              ref={inputRef}
              type="number"
              min="0"
              step="1"
              inputMode="decimal"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setError(null);
              }}
              placeholder="160"
              className={`mt-1 w-full h-10 px-3 rounded-lg border text-sm font-mono font-bold bg-white dark:bg-slate-900 text-[#3E3C3D] dark:text-white focus:outline-none focus:border-[#FA634E] ${
                error ? 'border-red-400' : 'border-slate-200 dark:border-slate-700'
              }`}
            />
            {error && <span className="block mt-1 text-[11px] font-bold text-red-600">{error}</span>}
          </label>

          {hasQuotation && (
            <label className="flex items-start gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={saveOnQuotation}
                onChange={(e) => setSaveOnQuotation(e.target.checked)}
                className="mt-0.5 accent-[#FA634E]"
              />
              <span className="text-xs text-[#3E3C3D] dark:text-slate-200 font-medium">
                Save it on the quotation too
                <span className="block text-[11px] text-slate-400">Next trips on this route fill it in</span>
              </span>
            </label>
          )}

          <div className="flex gap-3 pt-2">
            <Btn label="Enter later" variant="secondary" type="button" onClick={onClose} className="flex-1" />
            <Btn label="Save payout" variant="primary" type="submit" className="flex-1" />
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
