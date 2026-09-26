import React from 'react';
import { Phone, Star, Truck } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import SlowScrollingDriverName from '@/components/ui/SlowScrollingDriverName';

interface VehicleDriverCardProps {
  trip: any;
}

function resolveFileUrl(url?: string | null): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) return trimmed;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  if (!trimmed.startsWith('/') && trimmed.length > 30 && !trimmed.includes(' ')) {
    return `data:image/png;base64,${trimmed}`;
  }
  const base = import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace(/\/api\/?$/, '') : '';
  return `${base}${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
}

export default function VehicleDriverCard({ trip }: VehicleDriverCardProps) {
  // Vehicle details (matching Image 1 & 2)
  const plateNumber = trip.is_third_party
    ? trip.third_party_vehicle_plate || 'TRK-1187'
    : trip.vehicle?.plate_number || 'TRK-1187';

  const assetType = trip.vehicle?.asset_type || 'Volvo FH 500';
  const registrationCode = 'KSA 4821';

  const rawTon = trip.financials?.quotation_vehicle_class
    || trip.quotation_vehicle_class
    || (trip.vehicle?.capacity_kg ? `${Math.round(trip.vehicle.capacity_kg / 1000)} TON` : null)
    || trip.rateCard?.vehicle_type
    || trip.vehicle_type
    || '10 TON';
  const truckTon = rawTon.toUpperCase().includes('TON') ? rawTon : `${rawTon} TON`;

  // Driver details
  const driverName = trip.is_third_party
    ? trip.third_party_driver_name || 'Khalid Ahmed'
    : trip.driver
    ? `${trip.driver.first_name} ${trip.driver.last_name}`
    : 'Khalid Ahmed';

  const driverPhone = trip.driver?.phone_primary || '+966 54 321 9876';
  const driverAvatar = (trip.driver as any)?.avatar_url;
  const rating = 4.8;

  return (
    <div className="w-full h-full bg-white rounded-2xl border border-[#E5E7EB] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-4 py-2.5 flex items-center justify-between gap-3 overflow-hidden">
      {/* Left: Vehicle Section */}
      <div className="flex items-center justify-between gap-2.5 min-w-0 flex-1 pr-1">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Vehicle Thumbnail */}
          <div className="w-14 h-11 rounded-lg bg-slate-50 border border-slate-200/70 flex items-center justify-center p-1 shrink-0 overflow-hidden">
            <img
              src="/mercon_truck_3d.png"
              alt={plateNumber}
              className="w-full h-full object-contain"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          </div>

          {/* Vehicle Metadata */}
          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-1.5">
              <h3 className="font-bold text-[13px] text-[#1F2937] truncate font-mono">
                {plateNumber}
              </h3>
            </div>
            <p className="text-[11px] text-[#4B5563] truncate font-medium">{assetType}</p>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-[#6B7280] font-mono">{registrationCode}</span>
              <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                On Trip
              </span>
            </div>
          </div>
        </div>

        {/* TON Tag aligned to the right side of the truck box */}
        <div className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black bg-blue-50 text-blue-700 border border-blue-200/80 leading-none shrink-0 self-center">
          {truckTon}
        </div>
      </div>

      {/* Subtle Vertical Divider */}
      <div className="w-[1px] h-9 bg-[#E5E7EB] shrink-0" />

      {/* Right: Driver Section */}
      <div className="flex items-center gap-2.5 min-w-0 flex-1 pl-1">
        <Avatar className="w-10 h-10 rounded-full border border-[#E5E7EB] bg-slate-100 shrink-0">
          {driverAvatar && <AvatarImage src={resolveFileUrl(driverAvatar)} alt={driverName} />}
          <AvatarFallback className="text-xs font-bold bg-slate-200 text-slate-700">
            {driverName.substring(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1 space-y-0.5">
          <SlowScrollingDriverName
            name={driverName}
            className="font-bold text-[12.5px] text-[#1F2937] leading-tight"
          />
          <div className="flex items-center gap-1 text-[10.5px]">
            <Star size={11} className="text-amber-500 fill-amber-500" />
            <span className="font-bold text-slate-700">{rating}</span>
          </div>
          <p className="text-[10px] text-[#6B7280] font-mono truncate">{driverPhone}</p>
        </div>

        {/* Call Driver Button */}
        <a
          href={`tel:${driverPhone.replace(/[^0-9+]/g, '')}`}
          className="w-7 h-7 rounded-full border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-600 flex items-center justify-center shrink-0 transition-colors cursor-pointer"
          title="Call Driver"
        >
          <Phone size={12} />
        </a>
      </div>
    </div>
  );
}
