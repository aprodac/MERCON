import React from 'react';
import {
  AlertTriangle,
  Building2,
  Phone,
  User as UserIcon,
  Mail,
  Star,
  ChevronRight,
} from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface TripDetailsCardsGridProps {
  vehicle?: {
    plate_number?: string | null;
    asset_type?: string | null;
    model?: string | null;
    photo_url?: string | null;
  } | null;
  driver?: {
    first_name?: string | null;
    last_name?: string | null;
    phone_primary?: string | null;
    avatar_url?: string | null;
    rating?: number | null;
  } | null;
  customer?: {
    name?: string | null;
    company_name?: string | null;
    primary_contact_person?: string | null;
    contact_phone?: string | null;
    email?: string | null;
  } | null;
  delayAlerts?: Array<{
    id?: string;
    locationName: string;
    minutes: number;
    time: string;
    severity: 'critical' | 'warning' | 'info';
  }>;
  onViewAllDelays?: () => void;
}

export default function TripDetailsCardsGrid({
  vehicle,
  driver,
  customer,
  delayAlerts = [],
  onViewAllDelays,
}: TripDetailsCardsGridProps) {
  const vPlate = vehicle?.plate_number || 'TRK-1187';
  const vModel = vehicle?.model || vehicle?.asset_type || 'Volvo FH 500';
  const vCode = 'KSA 4821';

  const dName = driver
    ? `${driver.first_name || ''} ${driver.last_name || ''}`.trim()
    : 'Khalid Ahmed';
  const dPhone = driver?.phone_primary || '+966 54 321 9876';
  const dRating = driver?.rating || 4.8;
  const dAvatar = driver?.avatar_url || undefined;

  const cName = customer?.company_name || customer?.name || 'ABC Logistics Co.';
  const cContact = customer?.primary_contact_person || 'Mohammed Al-Qahtani';
  const cPhone = customer?.contact_phone || '+966 11 234 5678';
  const cEmail = customer?.email || 'm.alqahtani@abclogistics.sa';

  const alerts =
    delayAlerts.length > 0
      ? delayAlerts
      : [
          {
            id: '1',
            locationName: 'Delay at Al Wadi',
            minutes: 45,
            time: '1:15 PM',
            severity: 'critical' as const,
          },
          {
            id: '2',
            locationName: 'Estimated delay at Al Majmaah',
            minutes: 30,
            time: '3:20 PM',
            severity: 'critical' as const,
          },
          {
            id: '3',
            locationName: 'Possible delay at Al Abha',
            minutes: 20,
            time: '7:10 PM',
            severity: 'warning' as const,
          },
        ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      {/* 1. VEHICLE CARD */}
      <Card className="rounded-2xl border border-black/[0.08] dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm flex items-center gap-3">
        <div className="w-20 h-20 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden shrink-0 border border-slate-200 dark:border-slate-700">
          <img
            src="/truck_3d_orange_transparent.png"
            alt="Truck"
            className="w-full h-full object-contain p-1"
            onError={(e) => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="text-sm font-extrabold text-[#3E3C3D] dark:text-slate-100 tracking-tight">
            {vPlate}
          </h3>
          <p className="text-xs text-[#6E6E80] dark:text-slate-400 font-medium truncate">
            {vModel}
          </p>
          <div className="flex items-center gap-2 pt-0.5">
            <span className="inline-block px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-mono font-bold text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
              {vCode}
            </span>
            <span className="inline-block px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-[10px] font-extrabold">
              On Trip
            </span>
          </div>
        </div>
      </Card>

      {/* 2. DRIVER CARD */}
      <Card className="rounded-2xl border border-black/[0.08] dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm flex items-center gap-3">
        <Avatar className="w-14 h-14 shrink-0 border-2 border-violet-200 dark:border-violet-800">
          {dAvatar && <AvatarImage src={dAvatar} alt={dName} />}
          <AvatarFallback className="bg-violet-100 dark:bg-violet-900 text-violet-700 dark:text-violet-300 font-extrabold text-sm">
            {(dName || '?').substring(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="text-sm font-extrabold text-[#3E3C3D] dark:text-slate-100 tracking-tight truncate">
            {dName}
          </h3>
          <div className="flex items-center gap-1 text-amber-500 text-xs font-bold">
            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
            <span>{dRating}</span>
          </div>
          <div className="flex items-center gap-1.5 pt-0.5">
            <span className="text-xs text-[#6E6E80] dark:text-slate-400 font-mono font-medium truncate">
              {dPhone}
            </span>
            <a
              href={`tel:${dPhone}`}
              className="p-1 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950 rounded-full transition-colors shrink-0"
              title="Call Driver"
            >
              <Phone size={13} />
            </a>
          </div>
        </div>
      </Card>

      {/* 3. CUSTOMER CARD */}
      <Card className="rounded-2xl border border-black/[0.08] dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 border border-blue-100 dark:border-blue-900">
          <Building2 size={22} />
        </div>

        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex items-center gap-1.5">
            <h3 className="text-xs font-extrabold text-[#3E3C3D] dark:text-slate-100 tracking-tight truncate">
              {cName}
            </h3>
            <span className="inline-block px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-[9px] font-bold text-slate-600 dark:text-slate-300 shrink-0">
              Corporate Customer
            </span>
          </div>
          <p className="text-[11px] text-[#6E6E80] dark:text-slate-400 flex items-center gap-1 truncate font-medium">
            <UserIcon size={11} className="shrink-0 text-slate-400" />
            {cContact}
          </p>
          <p className="text-[10px] text-[#6E6E80] dark:text-slate-400 flex items-center gap-1 truncate font-mono">
            <Phone size={10} className="shrink-0 text-slate-400" />
            {cPhone}
          </p>
          <p className="text-[10px] text-blue-600 dark:text-blue-400 flex items-center gap-1 truncate font-mono">
            <Mail size={10} className="shrink-0" />
            {cEmail}
          </p>
        </div>
      </Card>

      {/* 4. DELAY ALERTS CARD */}
      <Card className="rounded-2xl border border-rose-200 dark:border-rose-900/50 bg-rose-50/50 dark:bg-rose-950/20 p-4 shadow-sm flex flex-col justify-between">
        <div className="flex items-center justify-between pb-2 border-b border-rose-100 dark:border-rose-900/40">
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-rose-900 dark:text-rose-200">
              Delay Alerts
            </h3>
            <span className="w-4 h-4 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center">
              {alerts.length}
            </span>
          </div>
          <button
            type="button"
            onClick={onViewAllDelays}
            className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5"
          >
            View All <ChevronRight size={12} />
          </button>
        </div>

        <div className="space-y-1.5 pt-2">
          {alerts.slice(0, 3).map((item, idx) => (
            <div
              key={item.id || idx}
              className="flex items-center justify-between text-xs gap-1"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className={cn(
                    'w-2 h-2 rounded-full shrink-0',
                    item.severity === 'warning' ? 'bg-amber-500' : 'bg-rose-600'
                  )}
                />
                <span className="text-[11px] font-medium text-slate-800 dark:text-slate-200 truncate">
                  {item.locationName}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0 font-mono">
                <span
                  className={cn(
                    'text-[11px] font-bold',
                    item.severity === 'warning'
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-rose-600 dark:text-rose-400'
                  )}
                >
                  +{item.minutes} min
                </span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400">
                  {item.time}
                </span>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
