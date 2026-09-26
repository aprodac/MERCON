import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

export interface DriverMotComplianceModalProps {
  isOpen: boolean;
  onClose: () => void;
  clearDriversCount: number;
  expiredLicenseCount: number;
}

export function DriverMotComplianceModal({
  isOpen,
  onClose,
  clearDriversCount,
  expiredLicenseCount,
}: DriverMotComplianceModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6">
        <DialogHeader>
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <DialogTitle className="text-lg font-extrabold text-slate-900 dark:text-slate-100">
            Saudi MOT & MOMRAH Compliance Status
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Ministry of Transport commercial heavy driver license verification ledger.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 my-4 text-xs">
          <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/60">
            <div>
              <div className="font-bold text-emerald-900 dark:text-emerald-300">
                Verified MOT Licenses
              </div>
              <div className="text-[10px] text-emerald-700 dark:text-emerald-400">
                Active commercial heavy transport
              </div>
            </div>
            <Badge className="bg-emerald-600 text-white font-mono font-bold text-xs">
              {clearDriversCount}
            </Badge>
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/60">
            <div>
              <div className="font-bold text-amber-900 dark:text-amber-300">
                Pending Renewal / Expired
              </div>
              <div className="text-[10px] text-amber-700 dark:text-amber-400">
                Action required with Ministry portal
              </div>
            </div>
            <Badge className="bg-amber-600 text-white font-mono font-bold text-xs">
              {expiredLicenseCount}
            </Badge>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs font-bold border-slate-200"
            onClick={onClose}
          >
            Close Verification Summary
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
