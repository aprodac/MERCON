import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import type { PeriodRow } from './types';

interface ReopenPeriodSheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  selectedPeriod: PeriodRow | null;
  reopenReason: string;
  setReopenReason: (reason: string) => void;
  onConfirmReopen: (params: { id: string; reason: string }) => void;
  isPending: boolean;
}

export function ReopenPeriodSheet({
  isOpen,
  onOpenChange,
  selectedPeriod,
  reopenReason,
  setReopenReason,
  onConfirmReopen,
  isPending,
}: ReopenPeriodSheetProps) {
  if (!selectedPeriod) return null;

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md p-6 overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Reopen {selectedPeriod.name}</SheetTitle>
          <SheetDescription>
            Reopening a closed period allows new journal entries to be posted.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 py-4">
          <div className="bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-950/40 border border-amber-200 p-3 rounded-xl text-xs text-amber-900 dark:text-amber-200 space-y-1">
            <div className="font-bold flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              Important Note
            </div>
            <p>
              The AccountClosingBalance snapshot for this period will be discarded and automatically rebuilt when the period is closed again.
            </p>
          </div>

          <div>
            <label className="text-xs font-bold text-foreground block mb-1">
              Reason for reopening * (10–500 characters)
            </label>
            <Textarea
              placeholder="Explain why this period needs to be reopened..."
              value={reopenReason}
              onChange={(e) => setReopenReason(e.target.value)}
              maxLength={500}
              className="text-xs h-24"
            />
            <div className="text-[10px] text-muted-foreground text-right mt-1 fin-num">
              {reopenReason.length} / 500
            </div>
          </div>
        </div>

        <SheetFooter className="pt-4 border-t border-border dark:border-border">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => onConfirmReopen({ id: selectedPeriod.id, reason: reopenReason })}
            disabled={reopenReason.trim().length < 10 || isPending}
            className="bg-[#FA634E] hover:bg-[#e0523d] text-white font-semibold"
          >
            Reopen Period
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
