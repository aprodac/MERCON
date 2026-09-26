import React from 'react';
import { Driver } from '@/services/driverService';
import KpiModal from '@/components/ui/KpiModal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatInDeploymentTz } from '@/lib/datetime';

export interface DriverKpiComplianceModalProps {
  isOpen: boolean;
  onClose: () => void;
  originRect: DOMRect | null;
  clearDriversCount: number;
  expiredLicenseCount: number;
  expiredDrivers: Driver[];
  tz: string;
  onFilterExpiredInTable: () => void;
  onRenewDocs: (driverId: string) => void;
}

export function DriverKpiComplianceModal({
  isOpen,
  onClose,
  originRect,
  clearDriversCount,
  expiredLicenseCount,
  expiredDrivers,
  tz,
  onFilterExpiredInTable,
  onRenewDocs,
}: DriverKpiComplianceModalProps) {
  return (
    <KpiModal
      isOpen={isOpen}
      onClose={onClose}
      originRect={originRect}
      title="Saudi MOT & MOMRAH Compliance Status"
      subtitle="Ministry of Transport commercial heavy driver license verification ledger."
      badge={
        <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] font-bold">
          {expiredLicenseCount} Requiring Action
        </Badge>
      }
    >
      <div className="space-y-4 text-xs">
        <div className="space-y-2">
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

        {expiredLicenseCount > 0 && (
          <div className="space-y-2">
            <div className="font-bold text-slate-800 dark:text-slate-200 text-xs">
              Expired License Drivers
            </div>
            <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1">
              {expiredDrivers.map((d) => (
                <div
                  key={d.id}
                  className="flex items-center justify-between p-2 bg-rose-50/50 dark:bg-rose-950/20 rounded-lg border border-rose-200/60 text-xs"
                >
                  <div>
                    <span className="font-bold text-rose-900 dark:text-rose-300">
                      {d.first_name} {d.last_name}
                    </span>
                    <span className="text-[10px] text-rose-700 dark:text-rose-400 font-mono block">
                      Lic: {d.license_number || 'KSA-DL'} • Expired:{' '}
                      {formatInDeploymentTz(d.license_expiry, tz, 'MM/dd/yyyy')}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-[10px] font-bold text-rose-700 border-rose-300 bg-white"
                    onClick={() => onRenewDocs(d.id)}
                  >
                    Renew Docs
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
          <Button
            variant="outline"
            size="sm"
            className="text-xs font-semibold text-amber-800 border-amber-200 bg-amber-50"
            onClick={onFilterExpiredInTable}
          >
            Filter Expired in Table
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-xs font-semibold text-slate-500"
            onClick={onClose}
          >
            Close Summary
          </Button>
        </div>
      </div>
    </KpiModal>
  );
}
