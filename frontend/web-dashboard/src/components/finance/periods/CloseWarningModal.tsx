import ConfirmModal from '@/components/ui/ConfirmModal';
import type { PeriodRow, PeriodChecklist } from './types';

interface CloseWarningModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedPeriod: PeriodRow | null;
  checklist: PeriodChecklist;
  onConfirmClose: (periodId?: string) => void;
  isPending: boolean;
}

export function CloseWarningModal({
  isOpen,
  onClose,
  selectedPeriod,
  checklist,
  onConfirmClose,
  isPending,
}: CloseWarningModalProps) {
  if (!selectedPeriod) return null;

  return (
    <ConfirmModal
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={() => onConfirmClose(selectedPeriod.id)}
      title={`Close ${selectedPeriod.name} with Warnings`}
      confirmLabel="Close Anyway"
      isLoading={isPending}
    >
      <div className="space-y-3 text-xs text-muted-foreground">
        <p className="text-amber-800 dark:text-amber-200 bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-950/40 p-2.5 rounded-xl border border-amber-200">
          Some non-blocking checks have warnings. Are you sure you want to close this period anyway?
        </p>
        <ul className="list-disc pl-4 space-y-1">
          {!checklist.check2_warning && <li>Draft invoices remain in this period</li>}
          {!checklist.check3_warning && <li>Draft bills remain in this period</li>}
          {!checklist.check4_warning && <li>Bank accounts are not reconciled through period end</li>}
          {!checklist.check6_warning && <li>Previous period is still open</li>}
        </ul>
      </div>
    </ConfirmModal>
  );
}
