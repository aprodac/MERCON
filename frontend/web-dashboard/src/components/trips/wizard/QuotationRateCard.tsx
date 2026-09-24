import React from 'react';
import { cn } from '@/lib/utils';
import { normalizeRateCategory, normalizeVehicleClass, normalizeBillingType } from '@/utils/taxonomyRegistry';

export interface RateCardItem {
  id: string;
  name?: string;
  agreement_ref?: string;
  quotation_number?: string | number;
  rate?: number;
  base_price?: number;
  vehicle_class?: string;
  vehicle_type?: string;
  vehicleClass?: string;
  rate_category?: string;
  line_type?: string;
  lineType?: string;
  billing_type?: string;
  billingType?: string;
  operation_type?: string;
  quotation_operation_type?: string;
  pricing_basis?: string;
  quotation_billing_type?: string;
  driver_payout?: number | string;
  driver_name?: string;
  recent_driver?: string;
  vehicle_plate?: string;
  recent_vehicle?: string;
  usage_count?: number;
  stops?: any[];
  route_origin?: string;
  origin_name?: string;
  originLocation?: { id?: string; name?: string };
  origin_city?: string;
  origin?: string;
  from?: string;
  route_destination?: string;
  destination_name?: string;
  destinationLocation?: { id?: string; name?: string };
  destination_city?: string;
  destination?: string;
  to?: string;
}

export function getCardId(rc: any): string | null {
  if (!rc) return null;
  const rawId = rc.id || rc.quotation_id || rc.quotationId || rc.rateCardId || rc.rate_card_id || rc.agreement_ref || (rc.quotation_number != null ? `QT-${rc.quotation_number}` : null);
  if (rawId == null) return null;
  return String(rawId).trim();
}

export function extractEndpointName(stop: any, fallbackFields: (string | undefined)[]): string {
  if (stop) {
    const stopName = stop.source_label || stop.location?.name || stop.location_name;
    if (stopName && typeof stopName === 'string' && stopName.trim()) {
      return stopName.trim();
    }
  }
  for (const field of fallbackFields) {
    if (field && typeof field === 'string' && field.trim()) {
      return field.trim();
    }
  }
  return '';
}

interface QuotationRateCardProps {
  rc: RateCardItem;
  idx: number;
  isSelected: boolean;
  contractRateCategory?: string;
  contractVehicleType?: string;
  onApplyRateCard: (rc: RateCardItem, targetCategory: string, targetVehicleClass: string, origName: string, destName: string, rateVal: number, isCurrentlySelected: boolean) => void;
  className?: string;
}

export const QuotationRateCard: React.FC<QuotationRateCardProps> = ({
  rc,
  idx,
  isSelected,
  contractRateCategory = '',
  contractVehicleType = '',
  onApplyRateCard,
  className,
}) => {
  const rateVal = rc.rate ?? rc.base_price ?? 0;
  const rawVClass = rc.vehicle_class || rc.vehicle_type || rc.vehicleClass || contractVehicleType;
  const vClass = normalizeVehicleClass(rawVClass);

  const rawCat = rc.rate_category || rc.line_type || rc.lineType || contractRateCategory;
  const rCat = normalizeRateCategory(rawCat);

  const rawBType = rc.operation_type || rc.quotation_operation_type || rc.billing_type || rc.billingType || rc.pricing_basis || rc.quotation_billing_type;
  const cardBType = normalizeBillingType(rawBType);
  const isMonthlyCard = cardBType === 'Monthly';

  const firstStop = rc.stops && rc.stops.length > 0 ? rc.stops[0] : null;
  const lastStop = rc.stops && rc.stops.length > 1 ? rc.stops[rc.stops.length - 1] : firstStop;

  let origName = extractEndpointName(firstStop, [
    rc.route_origin,
    rc.origin_name,
    rc.originLocation?.name,
    rc.origin_city,
    rc.origin,
    rc.from,
  ]);

  let destName = extractEndpointName(lastStop, [
    rc.route_destination,
    rc.destination_name,
    rc.destinationLocation?.name,
    rc.destination_city,
    rc.destination,
    rc.to,
  ]);

  const isValidEndpoint = (s: string) => s && s.trim() !== '' && s.trim() !== '—' && s.trim() !== '--' && s.trim() !== '---';

  if (!isValidEndpoint(origName) || !isValidEndpoint(destName)) {
    if (rc.name && typeof rc.name === 'string') {
      const cleanName = rc.name.replace(/\s*\[.*?\]/g, '').trim();
      const parts = cleanName.split(/\s*(?:→|->|-->|–|-)\s*/).map((s) => s.trim()).filter((s) => isValidEndpoint(s));
      if (parts.length >= 2) {
        if (!isValidEndpoint(origName)) origName = parts[0];
        if (!isValidEndpoint(destName)) destName = parts[parts.length - 1];
      } else if (parts.length === 1 && isValidEndpoint(parts[0])) {
        if (!isValidEndpoint(origName)) origName = parts[0];
        if (!isValidEndpoint(destName)) destName = parts[0];
      }
    }
  }

  const finalOrigName = isValidEndpoint(origName) ? origName.trim() : 'Origin';
  const finalDestName = isValidEndpoint(destName) ? destName.trim() : 'Destination';

  const qNum = (rc as any).quotation_number != null && !isNaN(Number((rc as any).quotation_number)) ? `QT-${(rc as any).quotation_number}` : null;
  const quotationDisplayCode =
    qNum ||
    (rc as any).agreement_ref ||
    rc.quotation_number ||
    ((rc as any).name && (rc as any).name.startsWith('QT-') ? (rc as any).name : null) ||
    (rc.id ? `QT-${rc.id.substring(0, 6).toUpperCase()}` : `QT-${idx + 1}`);

  return (
    <button
      key={rc.id || idx}
      type="button"
      onClick={() => onApplyRateCard(rc, rCat, vClass, finalOrigName, finalDestName, rateVal, isSelected)}
      className={cn(
        "p-2.5 rounded-xl transition-all duration-200 text-left flex flex-col justify-between space-y-1.5 cursor-pointer select-none min-h-[110px]",
        isSelected
          ? isMonthlyCard
            ? "border-2 border-purple-600 ring-2 ring-purple-600/20 bg-purple-50/70 dark:bg-purple-950/40 shadow-xs"
            : "border-2 border-[#FA634E] ring-2 ring-[#FA634E]/20 bg-orange-50/70 dark:bg-amber-950/40 shadow-xs"
          : "border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-[#FA634E]/60 hover:bg-slate-50 dark:hover:bg-slate-700/80",
        className
      )}
    >
      {/* TOP ROW: QUOTATION ID + PRICE BADGE (ZERO COLLISION) */}
      <div className="flex items-center justify-between gap-1">
        <span className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-200/80 dark:border-slate-600 shrink-0">
          {quotationDisplayCode}
        </span>

        {/* PRICE BADGE */}
        <div className="flex flex-col items-end shrink-0">
          <span className="text-xs font-black font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-200/80 dark:border-emerald-900/60">
            SAR {Number(rateVal).toLocaleString()}{' '}
            <span className="text-[9px] font-bold font-sans text-slate-500">
              {isMonthlyCard ? '/mo' : '/trip'}
            </span>
          </span>
          {isMonthlyCard && rateVal > 0 && (
            <span className="text-[9px] font-bold text-purple-600 dark:text-purple-400 mt-0.5">
              ≈ SAR {(rateVal / 30).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/day
            </span>
          )}
        </div>
      </div>

      {/* HERO CENTER: PROMINENT LOCATION ROUTE LANE */}
      <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between gap-1.5 my-0.5">
        <span className="text-xs font-black text-slate-900 dark:text-white truncate max-w-[45%]" title={finalOrigName}>
          {finalOrigName}
        </span>
        <span className="text-[#FA634E] font-bold text-xs shrink-0">→</span>
        <span className="text-xs font-black text-[#FA634E] truncate max-w-[45%]" title={finalDestName}>
          {finalDestName}
        </span>
      </div>

      {/* BOTTOM ROW: LINE TYPE & VEHICLE CLASS + ACTION */}
      <div className="flex items-center justify-between text-[10px] text-slate-500 font-bold pt-0.5">
        <span className="truncate">
          {rCat} • <span className="text-slate-800 dark:text-slate-200">{vClass}</span>
        </span>
        <span
          className={cn(
            "font-black shrink-0",
            isSelected
              ? isMonthlyCard
                ? "text-purple-600"
                : "text-brand"
              : "text-slate-400 hover:text-slate-600"
          )}
        >
          {isSelected ? 'Selected' : 'Apply →'}
        </span>
      </div>
    </button>
  );
};

export default QuotationRateCard;
