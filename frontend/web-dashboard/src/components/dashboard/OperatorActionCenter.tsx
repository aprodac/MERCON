import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Clock,
  FileText,
  ShieldAlert,
  CheckCircle2,
  ChevronRight,
  UserX,
  MapPin,
  FileCheck,
} from 'lucide-react';
import QuickAssignModal from '@/components/trips/QuickAssignModal';
import { cn } from '@/lib/utils';
import { Trip } from '@/services/tripService';

interface OperatorActionCenterProps {
  trips: Trip[];
  onOpenQuickAssign?: (trip: Trip) => void;
}

export type PriorityLevel = 'critical' | 'attention' | 'other';

export interface PriorityActionItem {
  id: string;
  trip: Trip;
  priority: PriorityLevel;
  typeLabel: string; // e.g. 'MISSING POD', 'DELAYED TRIP', 'UNASSIGNED TRIP'
  entityId: string; // e.g. 'TRP-0368', 'FAHAS · ESA-4207'
  context: string; // e.g. 'IMILE DELIVERY SAUDI LOGISTICS • Khamis → Dammam'
  actionLabel: string; // e.g. 'Upload POD', 'Open Trip', 'Assign'
  actionType: 'assign' | 'view' | 'location' | 'pod' | 'review';
  icon: typeof AlertTriangle;
}

export default function OperatorActionCenter({ trips, onOpenQuickAssign }: OperatorActionCenterProps) {
  const navigate = useNavigate();

  const [assignTargetTrip, setAssignTargetTrip] = useState<Trip | null>(null);
  const [activePriorityFilter, setActivePriorityFilter] = useState<'all' | PriorityLevel>('all');

  // Derive Action Items from real trip records with intelligent prioritization
  const { actionItems, counts } = useMemo(() => {
    const items: PriorityActionItem[] = [];
    const nowMs = Date.now();

    trips.forEach((t) => {
      const tripRef = t.ref_id || `TRP-${t.id.slice(0, 6).toUpperCase()}`;
      const customerName = t.customer?.name || (t as any).customerName || 'Customer';
      const stops = t.stops || [];
      const origin = (stops[0]?.location_name || (t as any).pickup || 'Origin').replace(/\]+$/, '').trim();
      const rawDest = (stops[stops.length - 1]?.location_name || (t as any).dropoff || 'Destination').replace(/\]+$/, '').trim();
      const dest = rawDest.includes('→') ? rawDest.split('→').pop()?.trim() || rawDest : rawDest.replace(/^RETURN:\s*/i, '').trim();
      const routeStr = `${origin} → ${dest}`;

      // 1. Delayed Active Trips (CRITICAL)
      const isDelayed =
        ['Dispatched', 'AtPickup', 'InTransit', 'AtDelivery', 'Loading'].includes(t.status) &&
        t.planned_end != null &&
        new Date(t.planned_end).getTime() < nowMs;

      if (isDelayed) {
        const hasVideo = (t as any).documents?.some(
          (d: any) =>
            d.mime_type?.startsWith('video/') ||
            /\.(mp4|mov|webm|3gp)$/i.test(d.file_url || '')
        );
        items.push({
          id: `delayed-${t.id}`,
          trip: t,
          priority: 'critical',
          typeLabel: hasVideo ? 'DELAYED TRIP 📹' : 'DELAYED TRIP',
          entityId: tripRef,
          context: `${customerName} • ${routeStr}${hasVideo ? ' (Video Proof Attached)' : ''}`,
          actionLabel: 'Open Trip',
          actionType: 'view',
          icon: Clock,
        });
      }

      // 2. Unassigned Trips needing resources (CRITICAL)
      const isUnassigned = t.status === 'Draft' || !t.driver || !t.vehicle;
      if (isUnassigned && t.status !== 'Cancelled' && t.status !== 'Completed' && t.status !== 'Invoiced') {
        const missingText = !t.driver && !t.vehicle ? 'Driver & Vehicle missing' : !t.driver ? 'Driver missing' : 'Vehicle missing';
        items.push({
          id: `unassigned-${t.id}`,
          trip: t,
          priority: 'critical',
          typeLabel: 'UNASSIGNED TRIP',
          entityId: tripRef,
          context: `${customerName} • ${routeStr} (${missingText})`,
          actionLabel: 'Assign',
          actionType: 'assign',
          icon: UserX,
        });
      }

      // 3. Missing POD for Completed Trips (ATTENTION)
      const isCompletedWithoutPOD = t.status === 'Completed' && (!(t as any).documents || (t as any).documents.length === 0);
      if (isCompletedWithoutPOD) {
        items.push({
          id: `pod-${t.id}`,
          trip: t,
          priority: 'attention',
          typeLabel: 'MISSING POD',
          entityId: tripRef,
          context: `${customerName} • ${routeStr}`,
          actionLabel: 'Upload POD',
          actionType: 'pod',
          icon: FileText,
        });
      }

      // 4. Location Precision Review Needed (ATTENTION)
      const hasApproxLocation = stops.some((s: any) => s.location_coordinate_precision === 'APPROXIMATE' || s.location_coordinate_precision === 'UNKNOWN');
      if (hasApproxLocation && (t.status === 'Draft' || t.status === 'Dispatched')) {
        items.push({
          id: `location-${t.id}`,
          trip: t,
          priority: 'attention',
          typeLabel: 'LOCATION REVIEW',
          entityId: tripRef,
          context: `${customerName} • ${routeStr}`,
          actionLabel: 'Review',
          actionType: 'location',
          icon: MapPin,
        });
      }
    });



    // Sort by Priority Rank: Critical -> Attention -> Other
    const priorityRank: Record<PriorityLevel, number> = { critical: 1, attention: 2, other: 3 };
    items.sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority]);

    const criticalCount = items.filter((i) => i.priority === 'critical').length;
    const attentionCount = items.filter((i) => i.priority === 'attention').length;
    const otherCount = items.filter((i) => i.priority === 'other').length;

    return {
      actionItems: items,
      counts: {
        total: items.length,
        critical: criticalCount,
        attention: attentionCount,
        other: otherCount,
      },
    };
  }, [trips]);

  // Filter items based on active priority summary pill selection
  const filteredItems = useMemo(() => {
    if (activePriorityFilter === 'all') return actionItems;
    return actionItems.filter((item) => item.priority === activePriorityFilter);
  }, [actionItems, activePriorityFilter]);

  // Restrict to top 4 highest-priority items to fit card height cleanly without overflow
  const displayItems = useMemo(() => {
    return filteredItems.slice(0, 4);
  }, [filteredItems]);

  const handleActionClick = (item: PriorityActionItem) => {
    if (item.actionType === 'assign') {
      if (onOpenQuickAssign) {
        onOpenQuickAssign(item.trip);
      } else {
        setAssignTargetTrip(item.trip);
      }
    } else if (item.actionType === 'review') {
      navigate('/documents');
    } else {
      navigate(`/trips/${item.trip.id}`);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-[#EEF1F6] dark:border-slate-800 shadow-sm p-4 flex flex-col justify-between h-full overflow-hidden select-none">
      
      {/* ── 1. HEADER ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between pb-2.5 border-b border-[#EEF1F6] dark:border-slate-800 shrink-0">
        <div>
          <h3 className="text-xs font-black uppercase tracking-wider text-[#3E3C3D] dark:text-slate-100 flex items-center gap-2">
            <span>OPERATOR ACTION CENTER</span>
          </h3>
          <p className="text-[11px] text-slate-400 font-medium mt-0.5">
            Priority tasks that need your attention
          </p>
        </div>

        {/* Secondary Total Actions Indicator */}
        <div className="text-right shrink-0">
          <span className="font-mono text-sm font-extrabold text-[#3E3C3D] dark:text-slate-100 block leading-none">
            {counts.total}
          </span>
          <span className="text-[9.5px] font-bold uppercase tracking-wide text-slate-400">
            Total Actions
          </span>
        </div>
      </div>

      {/* ── 2. PRIORITY SUMMARY FILTERS ─────────────────────────────────────── */}
      <div className="py-2 flex items-center gap-2 shrink-0 overflow-x-auto no-scrollbar">
        <button
          type="button"
          onClick={() => setActivePriorityFilter(activePriorityFilter === 'critical' ? 'all' : 'critical')}
          className={cn(
            "px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1.5 border cursor-pointer shrink-0",
            activePriorityFilter === 'critical'
              ? "bg-[#FEF2F2] text-[#FA634E] border-[#FA634E] shadow-2xs font-extrabold ring-1 ring-[#FA634E]/30"
              : "bg-[#FEF2F2]/80 text-[#DC2626] border-red-200/80 hover:bg-[#FEF2F2] dark:bg-red-950/40 dark:text-red-300 dark:border-red-900/60"
          )}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-[#FA634E]" />
          <span>{counts.critical} Critical</span>
        </button>

        <button
          type="button"
          onClick={() => setActivePriorityFilter(activePriorityFilter === 'attention' ? 'all' : 'attention')}
          className={cn(
            "px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1.5 border cursor-pointer shrink-0",
            activePriorityFilter === 'attention'
              ? "bg-[#FFFBEB] text-[#D97706] border-[#D97706] shadow-2xs font-extrabold ring-1 ring-[#D97706]/30"
              : "bg-[#FFFBEB]/80 text-[#B45309] border-amber-200/80 hover:bg-[#FFFBEB] dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/60"
          )}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-[#D97706]" />
          <span>{counts.attention} Attention</span>
        </button>

        <button
          type="button"
          onClick={() => setActivePriorityFilter(activePriorityFilter === 'other' ? 'all' : 'other')}
          className={cn(
            "px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1.5 border cursor-pointer shrink-0",
            activePriorityFilter === 'other'
              ? "bg-[#EEF1F6] text-[#3E3C3D] border-[#3E3C3D] shadow-2xs font-extrabold dark:bg-slate-800 dark:text-white"
              : "bg-[#EEF1F6]/70 text-[#3E3C3D] border-slate-200/80 hover:bg-[#EEF1F6] dark:bg-slate-800/60 dark:text-slate-300 dark:border-slate-700"
          )}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
          <span>{counts.other} Other</span>
        </button>

        {activePriorityFilter !== 'all' && (
          <button
            type="button"
            onClick={() => setActivePriorityFilter('all')}
            className="text-[10px] font-extrabold text-[#FA634E] hover:underline cursor-pointer ml-auto shrink-0"
          >
            Show All
          </button>
        )}
      </div>

      {/* ── 3. COMPACT PRIORITY ACTION QUEUE (NO SCROLLBAR) ─────────────────── */}
      <div className="flex-1 min-h-0 flex flex-col justify-[#start] gap-1.5 py-1 overflow-hidden">
        {displayItems.length === 0 ? (
          <div className="p-4 text-center my-auto bg-emerald-50/60 dark:bg-emerald-950/20 rounded-xl border border-emerald-100 dark:border-emerald-900/40 flex flex-col items-center justify-center gap-1">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <h4 className="text-xs font-bold text-[#3E3C3D] dark:text-slate-100">No Priority Actions Needed</h4>
            <p className="text-[10.5px] text-slate-500 max-w-xs">
              All dispatches and compliance tasks are running smoothly.
            </p>
          </div>
        ) : (
          displayItems.map((item) => {
            const Icon = item.icon;
            const isCritical = item.priority === 'critical';
            const isAttention = item.priority === 'attention';

            return (
              <div
                key={item.id}
                onClick={() => handleActionClick(item)}
                className="group px-3 py-1.5 rounded-xl border border-slate-100 dark:border-slate-800/80 hover:bg-[#EEF1F6] dark:hover:bg-slate-800/80 hover:border-slate-200 transition-all duration-150 flex items-center justify-between gap-3 text-xs cursor-pointer"
              >
                {/* LEFT: Issue Icon */}
                <div className={cn(
                  "w-6.5 h-6.5 rounded-lg flex items-center justify-center shrink-0 border transition-transform group-hover:scale-105",
                  isCritical
                    ? "bg-[#FEF2F2] text-[#FA634E] border-red-200/60 dark:bg-red-950/50 dark:border-red-900/50"
                    : isAttention
                    ? "bg-[#FFFBEB] text-[#D97706] border-amber-200/60 dark:bg-amber-950/50 dark:border-amber-900/50"
                    : "bg-[#EEF1F6] text-[#3E3C3D] border-slate-200/60 dark:bg-slate-800 dark:text-slate-300"
                )}>
                  <Icon className="w-3.5 h-3.5" />
                </div>

                {/* CENTER: Action Metadata */}
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-center gap-2 leading-none">
                    <span className={cn(
                      "text-[9px] font-black uppercase tracking-wider",
                      isCritical ? "text-[#FA634E]" : isAttention ? "text-[#D97706]" : "text-[#3E3C3D] dark:text-slate-300"
                    )}>
                      {item.typeLabel}
                    </span>
                    <span className="font-mono text-[10px] font-bold text-[#3E3C3D] dark:text-slate-100">
                      {item.entityId}
                    </span>
                  </div>
                  <div className="text-[10px] font-medium text-slate-500 dark:text-slate-400 truncate leading-tight">
                    {item.context}
                  </div>
                </div>

                {/* RIGHT: Contextual Action Button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleActionClick(item);
                  }}
                  className="px-2.5 py-0.5 rounded-lg text-[10.5px] font-bold text-[#FA634E] bg-white dark:bg-slate-900 border border-[#FA634E]/30 hover:bg-[#FA634E] hover:text-white transition-all duration-150 shrink-0 shadow-2xs flex items-center gap-1 group-hover:border-[#FA634E] group-hover:shadow-xs cursor-pointer"
                >
                  <span>{item.actionLabel}</span>
                  <ChevronRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* ── 4. FOOTER ────────────────────────────────────────────────────────── */}
      <div className="mt-auto pt-2 border-t border-[#EEF1F6] dark:border-slate-800 flex items-center justify-between shrink-0 text-xs bg-white dark:bg-slate-900 z-10">
        <button
          type="button"
          onClick={() => navigate('/trips')}
          className="text-[#FA634E] hover:underline font-bold text-[11.5px] inline-flex items-center gap-1 transition-all cursor-pointer"
        >
          <span>View all {counts.total} actions</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Quick Assign Modal fallback */}
      <QuickAssignModal
        isOpen={!!assignTargetTrip}
        onClose={() => setAssignTargetTrip(null)}
        trip={assignTargetTrip}
      />
    </div>
  );
}

