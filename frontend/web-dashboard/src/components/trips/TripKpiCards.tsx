import React from 'react';
import { cn } from '@/lib/utils';
import { DateFilterType } from '@/components/trips/TripDateFilterPicker';
import KpiCard from '@/components/ui/KpiCard';
import { Truck, MapPin, CheckCircle2, Calendar, AlertTriangle } from 'lucide-react';

export interface TripKpiCardsProps {
  kpiTitle: string;
  kpiPeriod: DateFilterType;
  setKpiPeriod: (period: DateFilterType) => void;
  setDateFilter: (filter: DateFilterType) => void;
  setCurrentPage: (page: number) => void;
  selectedStatus: string;
  setSelectedStatus: (status: string) => void;

  periodCount: number;
  periodCompletedCount: number;
  periodInTransitCount: number;
  periodQueueCount: number;

  inTransitCount: number;
  completedCount: number;
  scheduledCount: number;
  delayedCount: number;
}

/** 3D MERCON Route Line Truck Icon with Dynamic Theme Color Filter */
export const RouteLineTruck3D: React.FC<{ className?: string; color?: string }> = ({
  className = "h-7 w-auto",
  color = "#FA634E",
}) => {
  let filterStyle = "";

  const c = (color || "").toLowerCase();
  if (c.includes("emerald") || c.includes("green") || c === "#10b981" || c === "#16a34a" || c === "#22c55e") {
    filterStyle = "hue-rotate(115deg) saturate(1.3) brightness(0.95)";
  } else if (c.includes("blue") || c === "#2563eb" || c === "#3b82f6" || c === "#1e40af") {
    filterStyle = "hue-rotate(190deg) saturate(1.4) brightness(0.95)";
  } else if (c.includes("red") || c.includes("rose") || c === "#dc2626" || c === "#ef4444" || c === "#f43f5e") {
    filterStyle = "hue-rotate(-25deg) saturate(1.6) brightness(0.9)";
  } else if (c.includes("slate") || c.includes("gray") || c === "#64748b" || c === "#475569" || c === "#3e3c3d") {
    filterStyle = "grayscale(1) brightness(0.9)";
  } else if (c.includes("purple") || c === "#9333ea" || c === "#7c3aed") {
    filterStyle = "hue-rotate(240deg) saturate(1.4)";
  } else {
    filterStyle = "none";
  }

  return (
    <img
      src="/mercon_truck_3d.png"
      alt="MERCON Logistics Truck"
      className={cn("object-contain select-none pointer-events-none drop-shadow-2xs transition-all duration-200", className)}
      style={{ filter: filterStyle }}
    />
  );
};

export const TripKpiCards: React.FC<TripKpiCardsProps> = ({
  kpiTitle,
  kpiPeriod,
  setKpiPeriod,
  setDateFilter,
  setCurrentPage,
  selectedStatus,
  setSelectedStatus,
  periodCount,
  periodCompletedCount,
  periodInTransitCount,
  periodQueueCount,
  inTransitCount,
  completedCount,
  scheduledCount,
  delayedCount,
}) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5 shrink-0 items-stretch">
      
      {/* ── CARD 1: TODAY'S TRIPS (Total Period) ────────────────────────── */}
      <KpiCard
        title={kpiTitle}
        className="rounded-2xl border-orange-300/80 hover:border-[#FA634E] dark:border-orange-500/40 cursor-pointer h-full transition-all duration-200"
        value={
          <span>
            {periodCount}
            <span className="text-[16px] font-semibold ml-1.5 opacity-85">Trips</span>
          </span>
        }
        variant="slate"
        trend="up"
        trendValue={`${periodInTransitCount} Active`}
        description={`Done: ${periodCompletedCount} | Pending: ${periodQueueCount}`}
        icon={<Truck className="w-5.5 h-5.5 text-[#FA634E]" />}
        standaloneIcon={true}
        isActive={selectedStatus === 'All'}
        onClick={() => {
          setSelectedStatus('All');
          setCurrentPage(1);
        }}
        headerAction={
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200/80 dark:border-slate-700 shadow-2xs">
            {(
              [
                { label: '1D', value: 'Today', title: 'Today (1D)' },
                { label: '1W', value: 'ThisWeek', title: 'This Week (1W)' },
                { label: '1M', value: 'ThisMonth', title: 'This Month (1M)' },
              ] as const
            ).map((period) => {
              const active = kpiPeriod === period.value;
              return (
                <button
                  key={period.value}
                  type="button"
                  title={period.title}
                  onClick={(e) => {
                    e.stopPropagation();
                    setKpiPeriod(period.value);
                    setDateFilter(period.value);
                    setCurrentPage(1);
                  }}
                  className={cn(
                    "text-[9px] font-extrabold h-4.5 px-1.5 rounded-md transition-all cursor-pointer",
                    active
                      ? "bg-[#FA634E] text-white shadow-xs font-black"
                      : "text-slate-500 hover:text-slate-900"
                  )}
                >
                  {period.label}
                </button>
              );
            })}
          </div>
        }
        customFooter={
          <div className="relative h-9 mt-4 -mx-5 overflow-hidden rounded-b-2xl bg-orange-50/40 dark:bg-orange-950/20 border-t border-orange-200/60 dark:border-orange-900/40">
            <style>{`
              @keyframes routeDashOrange {
                to { stroke-dashoffset: -12; }
              }
            `}</style>
            <svg className="absolute inset-0 h-full w-full opacity-[0.06]" stroke="currentColor" fill="none">
              <pattern id="card-map-grid-orange" width="12" height="12" patternUnits="userSpaceOnUse">
                <path d="M 12 0 L 0 0 0 12" strokeWidth="0.5" />
              </pattern>
              <rect width="100%" height="100%" fill="url(#card-map-grid-orange)" />
            </svg>

            {/* Contour Lines */}
            <svg className="absolute inset-0 h-full w-full opacity-[0.25]" viewBox="0 0 280 48" preserveAspectRatio="none">
              <path d="M 60 -5 C 65 15, 55 35, 60 55" fill="none" stroke="#FDBA74" strokeWidth="1.5" />
              <path d="M 140 -5 C 135 15, 145 35, 138 55" fill="none" stroke="#FDBA74" strokeWidth="1.5" />
              <path d="M 210 -5 C 220 15, 205 35, 215 55" fill="none" stroke="#FDBA74" strokeWidth="1.5" />
            </svg>

            {/* Dashed Route Path */}
            <svg className="absolute inset-0 h-full w-full" viewBox="0 0 280 48" preserveAspectRatio="none">
              <path d="M -10 24 C 70 10, 150 38, 290 24" fill="none" stroke="#E2E8F0" strokeWidth="3.5" strokeLinecap="round" />
              <path
                d="M -10 24 C 70 10, 150 38, 290 24"
                fill="none"
                stroke="#FA634E"
                strokeWidth="3"
                strokeDasharray="6,6"
                strokeLinecap="round"
                style={{ animation: 'routeDashOrange 4s linear infinite' }}
              />
            </svg>

            {/* Origin Node */}
            <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center justify-center">
              <div className="h-2 w-2 rounded-full bg-[#FA634E] ring-4 ring-[#FA634E]/20" />
            </div>

            {/* 3D Visual Route Line Orange Truck */}
            <div
              className="absolute"
              style={{
                left: '45%',
                top: '45%',
                transform: 'translate(-50%, -50%)',
                zIndex: 10
              }}
            >
              <RouteLineTruck3D className="h-7 w-auto" color="#FA634E" />
            </div>
          </div>
        }
      />

      {/* ── CARD 2: IN TRANSIT ────────────────────────────────────────── */}
      <KpiCard
        title="IN TRANSIT"
        className="rounded-2xl border-emerald-300/80 hover:border-emerald-500 dark:border-emerald-500/40 cursor-pointer h-full transition-all duration-200"
        value={
          <span>
            {inTransitCount}
            <span className="text-[16px] font-semibold ml-1.5 opacity-85">On Road</span>
          </span>
        }
        variant="emerald"
        trend="up"
        trendValue={`${inTransitCount} Active`}
        description="Trucks on the road now"
        icon={<MapPin className="w-5.5 h-5.5 text-[#10B981]" />}
        standaloneIcon={true}
        isActive={selectedStatus === 'InTransit'}
        onClick={() => {
          setSelectedStatus('InTransit');
          setCurrentPage(1);
        }}
        customFooter={
          <div className="relative h-9 mt-4 -mx-5 overflow-hidden rounded-b-2xl bg-[#E8F5E9] dark:bg-[#1B5E20]/15 border-t border-emerald-500/10">
            <style>{`
              @keyframes routeDashGreen {
                to { stroke-dashoffset: -12; }
              }
            `}</style>
            <svg className="absolute inset-0 h-full w-full opacity-[0.08]" stroke="currentColor" fill="none">
              <pattern id="card-map-grid-green" width="12" height="12" patternUnits="userSpaceOnUse">
                <path d="M 12 0 L 0 0 0 12" strokeWidth="0.5" />
              </pattern>
              <rect width="100%" height="100%" fill="url(#card-map-grid-green)" />
            </svg>

            {/* Contour Lines */}
            <svg className="absolute inset-0 h-full w-full opacity-[0.4]" viewBox="0 0 280 48" preserveAspectRatio="none">
              <path d="M 60 -5 C 65 15, 55 35, 60 55" fill="none" stroke="#A7F3D0" strokeWidth="1.5" />
              <path d="M 140 -5 C 135 15, 145 35, 138 55" fill="none" stroke="#A7F3D0" strokeWidth="1.5" />
              <path d="M 210 -5 C 220 15, 205 35, 215 55" fill="none" stroke="#A7F3D0" strokeWidth="1.5" />
            </svg>

            {/* Animated Dashed Route */}
            <svg className="absolute inset-0 h-full w-full" viewBox="0 0 280 48" preserveAspectRatio="none">
              <path d="M -10 24 C 70 10, 150 38, 290 24" fill="none" stroke="#D1D5DB" strokeWidth="3.5" strokeLinecap="round" />
              <path
                d="M -10 24 C 70 10, 150 38, 290 24"
                fill="none"
                stroke="#10B981"
                strokeWidth="3"
                strokeDasharray="6,6"
                strokeLinecap="round"
                style={{ animation: 'routeDashGreen 4s linear infinite' }}
              />
            </svg>

            {/* Origin Node */}
            <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center justify-center">
              <div className="h-2 w-2 rounded-full bg-emerald-500 ring-4 ring-emerald-500/20" />
            </div>

            {/* 3D Visual Route Line Green Truck */}
            <div
              className="absolute"
              style={{
                left: '50%',
                top: '45%',
                transform: 'translate(-50%, -50%)',
                zIndex: 10
              }}
            >
              <RouteLineTruck3D className="h-7 w-auto" color="#10B981" />
            </div>
          </div>
        }
      />

      {/* ── CARD 3: DELIVERED & COMPLETED ─────────────────────────────── */}
      <KpiCard
        title="DELIVERED & COMPLETED"
        className="rounded-2xl border-blue-300/80 hover:border-blue-500 dark:border-blue-500/40 cursor-pointer h-full transition-all duration-200"
        value={
          <span>
            {completedCount}
            <span className="text-[16px] font-semibold ml-1.5 opacity-85">Trips</span>
          </span>
        }
        variant="blue"
        trend="up"
        trendValue={`${completedCount} Delivered`}
        description="Successfully finished deliveries"
        icon={<CheckCircle2 className="w-5.5 h-5.5 text-[#2563EB]" />}
        standaloneIcon={true}
        isActive={selectedStatus === 'Completed,Invoiced' || selectedStatus === 'Completed' || selectedStatus === 'Invoiced'}
        onClick={() => {
          setSelectedStatus('Completed,Invoiced');
          setCurrentPage(1);
        }}
        customFooter={
          <div className="relative h-9 mt-4 -mx-5 overflow-hidden rounded-b-2xl bg-[#EFF6FF] dark:bg-[#1E40AF]/15 border-t border-blue-500/10">
            <style>{`
              @keyframes routeDashBlue {
                to { stroke-dashoffset: -12; }
              }
            `}</style>
            <svg className="absolute inset-0 h-full w-full opacity-[0.06]" stroke="currentColor" fill="none">
              <pattern id="card-map-grid-blue" width="12" height="12" patternUnits="userSpaceOnUse">
                <path d="M 12 0 L 0 0 0 12" strokeWidth="0.5" />
              </pattern>
              <rect width="100%" height="100%" fill="url(#card-map-grid-blue)" />
            </svg>

            {/* Contour Lines */}
            <svg className="absolute inset-0 h-full w-full opacity-[0.3]" viewBox="0 0 280 48" preserveAspectRatio="none">
              <path d="M 45 -5 C 50 15, 40 35, 45 55" fill="none" stroke="#BFDBFE" strokeWidth="1.5" />
              <path d="M 115 -5 C 110 15, 120 35, 113 55" fill="none" stroke="#BFDBFE" strokeWidth="1.5" />
              <path d="M 180 -5 C 190 15, 175 35, 185 55" fill="none" stroke="#BFDBFE" strokeWidth="1.5" />
            </svg>

            {/* Route Line */}
            <svg className="absolute inset-0 h-full w-full" viewBox="0 0 280 48" preserveAspectRatio="none">
              <path d="M -10 24 C 70 10, 150 38, 290 24" fill="none" stroke="#D1D5DB" strokeWidth="3.5" strokeLinecap="round" />
              <path
                d="M -10 24 C 70 10, 150 38, 290 24"
                fill="none"
                stroke="#2563EB"
                strokeWidth="3"
                strokeDasharray="6,6"
                strokeLinecap="round"
                style={{ animation: 'routeDashBlue 4s linear infinite' }}
              />
            </svg>

            {/* Origin Node */}
            <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center justify-center">
              <div className="h-2 w-2 rounded-full bg-blue-500 ring-4 ring-blue-500/20" />
            </div>

            {/* 3D Visual Route Line Blue Truck at Finish Line */}
            <div
              className="absolute"
              style={{
                left: '78%',
                top: '45%',
                transform: 'translate(-50%, -50%)',
                zIndex: 10
              }}
            >
              <RouteLineTruck3D className="h-7 w-auto" color="#2563EB" />
            </div>

            {/* Checkered Flag at End */}
            <div className="absolute right-3 top-1/2 -translate-y-1/2 z-10">
              <div className="h-4 w-4 rounded-full bg-blue-600 text-white flex items-center justify-center text-[9px] font-black shadow-xs">
                🏁
              </div>
            </div>
          </div>
        }
      />

      {/* ── CARD 4: SCHEDULED TRIPS ───────────────────────────────────── */}
      <KpiCard
        title="SCHEDULED TRIPS"
        className="rounded-2xl border-slate-300/80 hover:border-slate-500 dark:border-slate-600/40 cursor-pointer h-full transition-all duration-200"
        value={
          <span>
            {scheduledCount}
            <span className="text-[16px] font-semibold ml-1.5 opacity-85">Scheduled</span>
          </span>
        }
        variant="slate"
        trend="neutral"
        trendValue={`${scheduledCount} Queued`}
        description="Planned and queued dispatch"
        icon={<Calendar className="w-5.5 h-5.5 text-[#64748B]" />}
        standaloneIcon={true}
        isActive={selectedStatus === 'Draft'}
        onClick={() => {
          setSelectedStatus('Draft');
          setCurrentPage(1);
        }}
        customFooter={
          <div className="relative h-9 mt-4 -mx-5 overflow-hidden rounded-b-2xl bg-slate-100/70 dark:bg-slate-800/40 border-t border-slate-200">
            <style>{`
              @keyframes routeDashSlate {
                to { stroke-dashoffset: -12; }
              }
            `}</style>
            <svg className="absolute inset-0 h-full w-full opacity-[0.06]" stroke="currentColor" fill="none">
              <pattern id="card-map-grid-slate" width="12" height="12" patternUnits="userSpaceOnUse">
                <path d="M 12 0 L 0 0 0 12" strokeWidth="0.5" />
              </pattern>
              <rect width="100%" height="100%" fill="url(#card-map-grid-slate)" />
            </svg>

            {/* Route Line */}
            <svg className="absolute inset-0 h-full w-full" viewBox="0 0 280 48" preserveAspectRatio="none">
              <path d="M -10 24 C 70 10, 150 38, 290 24" fill="none" stroke="#CBD5E1" strokeWidth="3.5" strokeLinecap="round" />
              <path
                d="M -10 24 C 70 10, 150 38, 290 24"
                fill="none"
                stroke="#64748B"
                strokeWidth="3"
                strokeDasharray="6,6"
                strokeLinecap="round"
                style={{ animation: 'routeDashSlate 4s linear infinite' }}
              />
            </svg>

            {/* Origin Node */}
            <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center justify-center">
              <div className="h-2 w-2 rounded-full bg-slate-500 ring-4 ring-slate-400/20" />
            </div>

            {/* 3D Visual Route Line Slate Truck */}
            <div
              className="absolute"
              style={{
                left: '30%',
                top: '45%',
                transform: 'translate(-50%, -50%)',
                zIndex: 10
              }}
            >
              <RouteLineTruck3D className="h-7 w-auto" color="#64748B" />
            </div>
          </div>
        }
      />

      {/* ── CARD 5: DELAYED TRIPS ─────────────────────────────────────── */}
      <KpiCard
        title="DELAYED TRIPS"
        className="rounded-2xl border-rose-300/80 hover:border-rose-500 dark:border-rose-500/40 cursor-pointer h-full transition-all duration-200"
        value={
          <span>
            {delayedCount}
            <span className="text-[16px] font-semibold ml-1.5 opacity-85 text-rose-600 dark:text-rose-400">Overdue</span>
          </span>
        }
        variant="rose"
        trend={delayedCount > 0 ? 'down' : 'neutral'}
        trendValue={delayedCount > 0 ? `${delayedCount} Overdue` : 'All Clear'}
        description="Active trips past scheduled timing"
        icon={<AlertTriangle className="w-5.5 h-5.5 text-[#DC2626]" />}
        standaloneIcon={true}
        isActive={selectedStatus === 'Issues'}
        onClick={() => {
          setSelectedStatus('Issues');
          setCurrentPage(1);
        }}
        customFooter={
          <div className="relative h-9 mt-4 -mx-5 overflow-hidden rounded-b-2xl bg-[#FFF5F5] dark:bg-[#DC2626]/10 border-t border-red-500/10">
            <style>{`
              @keyframes routeDashRed {
                to { stroke-dashoffset: -12; }
              }
            `}</style>
            <svg className="absolute inset-0 h-full w-full opacity-[0.06]" stroke="currentColor" fill="none">
              <pattern id="card-map-grid-red" width="12" height="12" patternUnits="userSpaceOnUse">
                <path d="M 12 0 L 0 0 0 12" strokeWidth="0.5" />
              </pattern>
              <rect width="100%" height="100%" fill="url(#card-map-grid-red)" />
            </svg>

            {/* Contour Lines */}
            <svg className="absolute inset-0 h-full w-full opacity-[0.3]" viewBox="0 0 280 48" preserveAspectRatio="none">
              <path d="M 45 -5 C 50 15, 40 35, 45 55" fill="none" stroke="#FECACA" strokeWidth="1.5" />
              <path d="M 115 -5 C 110 15, 120 35, 113 55" fill="none" stroke="#FECACA" strokeWidth="1.5" />
              <path d="M 180 -5 C 190 15, 175 35, 185 55" fill="none" stroke="#FECACA" strokeWidth="1.5" />
            </svg>

            {/* Route Line */}
            <svg className="absolute inset-0 h-full w-full" viewBox="0 0 280 48" preserveAspectRatio="none">
              <path d="M -10 24 C 70 10, 150 38, 290 24" fill="none" stroke="#D1D5DB" strokeWidth="3.5" strokeLinecap="round" />
              <path
                d="M -10 24 C 70 10, 150 38, 290 24"
                fill="none"
                stroke="#DC2626"
                strokeWidth="3"
                strokeDasharray="6,6"
                strokeLinecap="round"
                style={{ animation: 'routeDashRed 4s linear infinite' }}
              />
            </svg>

            {/* Origin Node */}
            <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center justify-center">
              <div className="h-2 w-2 rounded-full bg-red-500 ring-4 ring-red-500/20" />
            </div>

            {/* 3D Visual Route Line Red Truck */}
            <div
              className="absolute"
              style={{
                left: '52%',
                top: '45%',
                transform: 'translate(-50%, -50%)',
                zIndex: 10
              }}
            >
              <RouteLineTruck3D className="h-7 w-auto" color="#DC2626" />
            </div>
          </div>
        }
      />

    </div>
  );
};

export default TripKpiCards;
