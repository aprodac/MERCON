import ConfirmModal from '@/components/ui/ConfirmModal';
import { Input } from '@/components/ui/input';
import type { PeriodRow } from './types';

interface TypedLockPeriodModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedPeriod: PeriodRow | null;
  lockTypedConfirm: string;
  setLockTypedConfirm: (text: string) => void;
  onConfirmLock: (periodId: string) => void;
  isPending: boolean;
}

export function TypedLockPeriodModal({
  isOpen,
  onClose,
  selectedPeriod,
  lockTypedConfirm,
  setLockTypedConfirm,
  onConfirmLock,
  isPending,
}: TypedLockPeriodModalProps) {
  if (!selectedPeriod) return null;

  const isConfirmed = lockTypedConfirm.trim() === selectedPeriod.name.trim();

  return (
    <ConfirmModal
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={() => {
        if (isConfirmed) onConfirmLock(selectedPeriod.id);
      }}
      title={`Lock ${selectedPeriod.name} Permanently`}
      confirmLabel="Lock Period Permanently"
      variant="destructive"
      isLoading={isPending}
    >
      <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300">
        <p className="text-rose-600 font-bold bg-rose-50 dark:bg-rose-950/40 p-2.5 rounded-xl border border-rose-200">
          Locking is permanent and CANNOT be undone. The period will become permanently read-only.
        </p>
        <p>
          Type period name <strong className="font-mono text-slate-900 dark:text-white">{selectedPeriod.name}</strong> to confirm:
        </p>
        <Input
          placeholder={selectedPeriod.name}
          value={lockTypedConfirm}
          onChange={(e) => setLockTypedConfirm(e.target.value)}
          className="h-9 text-xs font-mono"
        />
      </div>
    </ConfirmModal>
  );
}
