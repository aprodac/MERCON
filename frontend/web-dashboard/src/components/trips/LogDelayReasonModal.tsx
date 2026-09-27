import { useState, useEffect } from 'react';
import { Clock, X } from 'lucide-react';
import { tripService, DELAY_REASONS, DELAY_REASON_LABELS, DelayReason } from '@/services/tripService';
import type { DelayLogRow } from '@/services/reportsService';
import Btn from '@/components/ui/Btn';

interface LogDelayReasonModalProps {
  isOpen: boolean;
  onClose: () => void;
  stop: DelayLogRow | null;
  onSuccess: () => void;
}

export default function LogDelayReasonModal({ isOpen, onClose, stop, onSuccess }: LogDelayReasonModalProps) {
  const [reason, setReason] = useState<DelayReason | ''>('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (stop) {
      setReason('');
      setNote('');
      setError(null);
    }
  }, [stop]);

  if (!isOpen || !stop) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason) {
      setError('Choose a delay reason.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await tripService.logStopDelay(stop.trip_id, stop.stop_id, {
        delay_reason: reason,
        delay_note: note || undefined,
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || 'Failed to log the delay reason.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal-strong/50 backdrop-blur-xs p-4 animate-fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-black/10 dark:border-white/10 shadow-2xl max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-black/[0.06] dark:border-white/10 flex items-center justify-between bg-gray-50 dark:bg-slate-800/60">
          <div className="flex items-center gap-2.5">
            <Clock className="w-5 h-5 text-rose-600 shrink-0" />
            <div>
              <h3 className="text-base font-bold text-[#111] dark:text-slate-100">Log Delay Reason</h3>
              <p className="text-xs text-[#6E6E80] dark:text-slate-400 font-mono">Trip #{stop.trip_ref || stop.trip_id.substring(0, 8)}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-200/50 dark:hover:bg-slate-700/50 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl font-medium">
              {error}
            </div>
          )}

          {/* Stop Summary */}
          <div className="p-3.5 bg-gray-50 dark:bg-slate-800/60 rounded-xl border border-black/[0.05] dark:border-white/10 space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-slate-400 font-medium">Route:</span>
              <span className="font-semibold text-gray-900 dark:text-slate-100">{stop.route}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-slate-400 font-medium">Driver &amp; Vehicle:</span>
              <span className="font-semibold text-gray-900 dark:text-slate-100">{stop.driver} • {stop.vehicle}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-slate-400 font-medium">Delay:</span>
              <span className="font-semibold text-rose-600 dark:text-rose-400">{stop.delay_hours.toFixed(1)}h late</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1">Delay Reason</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as DelayReason)}
              className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-900 dark:text-slate-100 rounded-lg px-3 py-2 text-sm font-semibold outline-none focus:border-brand"
              required
            >
              <option value="" disabled>Select a reason…</option>
              {DELAY_REASONS.map((r) => (
                <option key={r} value={r}>{DELAY_REASON_LABELS[r]}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1">Note (optional)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-900 dark:text-slate-100 rounded-lg px-3 py-2 text-sm outline-none focus:border-brand resize-none"
              placeholder="Any extra context for this delay…"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100 dark:border-slate-800">
            <Btn label="Cancel" variant="secondary" onClick={onClose} size="sm" type="button" />
            <Btn label={loading ? 'Saving...' : 'Save Reason'} variant="primary" size="sm" type="submit" disabled={loading} />
          </div>
        </form>
      </div>
    </div>
  );
}
