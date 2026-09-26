import React from 'react';
import { Info, AlertCircle } from 'lucide-react';
import { Vehicle } from '@/services/vehicleService';
import { VehicleCompatibilityRule } from '@/utils/vehicleCompatibilityRegistry';

interface VehicleCompatibilityBadgeProps {
  contractVehicleType: string;
  masterVehicle: string;
  vehicles: Vehicle[];
  activeCompatibilityRule: VehicleCompatibilityRule | null;
  getVehicleTypeFromCapacity: (capacityKg: number) => string;
}

export const VehicleCompatibilityBadge: React.FC<VehicleCompatibilityBadgeProps> = ({
  contractVehicleType,
  masterVehicle,
  vehicles,
  activeCompatibilityRule,
  getVehicleTypeFromCapacity,
}) => {
  if (!masterVehicle || masterVehicle === 'unassigned' || !contractVehicleType) {
    return null;
  }

  const selVeh = vehicles.find((v) => v.id === masterVehicle);
  if (!selVeh) return null;

  const actualClass = selVeh.asset_type || getVehicleTypeFromCapacity(selVeh.capacity_kg ?? 0);
  if (!actualClass) return null;

  const normContract = contractVehicleType.trim().toLowerCase();
  const normActual = actualClass.trim().toLowerCase();

  // If exact match, no mismatch pill needed
  if (normContract === normActual) {
    return null;
  }

  const rule = activeCompatibilityRule;
  const isPreferred = rule?.preferredVehicleClassCodes?.some(
    (c) => c.toLowerCase() === normActual
  );
  const isAllowed = rule?.allowedVehicleClassCodes?.some(
    (c) => c.toLowerCase() === normActual
  );

  if (isAllowed && !isPreferred) {
    return (
      <div className="text-[11px] font-semibold text-sky-800 bg-sky-50 dark:bg-sky-950/40 px-2.5 py-1 rounded-lg border border-sky-200 dark:border-sky-900 flex items-center gap-1.5 mt-1">
        <Info className="w-3.5 h-3.5 text-sky-600 shrink-0" />
        <span>⚠️ {actualClass} assigned for {contractVehicleType} Quotation (Allowed alternative)</span>
      </div>
    );
  }

  return (
    <div className="text-[11px] font-bold text-amber-800 bg-amber-50 dark:bg-amber-950/40 px-2.5 py-1 rounded-lg border border-amber-300 dark:border-amber-900 flex items-center gap-1.5 mt-1">
      <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
      <span>⚠️ {actualClass} assigned for {contractVehicleType} Quotation (Capacity Mismatch)</span>
    </div>
  );
};

export default VehicleCompatibilityBadge;
