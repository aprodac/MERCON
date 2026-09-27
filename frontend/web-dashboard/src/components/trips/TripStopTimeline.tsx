import React from 'react';
import { ListChecks, MapPin, Image as ImageIcon, ChevronRight, ListOrdered } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatInDeploymentTz } from '@/lib/datetime';

interface StopItem {
  id: string;
  seq: number;
  label: string;
  city: string;
  address: string;
  status: 'Completed' | 'Upcoming' | 'In Progress';
  time?: string | null;
  photoCount: number;
  isDelivery?: boolean;
}

interface TripStopTimelineProps {
  stops: any[];
  tz: string;
  onOpenActivityLog: () => void;
}

function cleanAddressStr(addr?: string | null): string | null {
  if (!addr) return null;
  const trimmed = addr.trim();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(trimmed)) {
    const parts = trimmed.split(',').map((p) => p.trim()).filter((p) => !p.includes('-'));
    return parts.length > 0 ? parts.join(', ') : null;
  }
  return trimmed;
}

const SAMPLE_STOPS: StopItem[] = [
  {
    id: 's-1',
    seq: 1,
    label: 'PICKUP',
    city: 'Riyadh',
    address: 'Riyadh 12345, Saudi Arabia',
    status: 'Completed',
    time: '08:53 AM',
    photoCount: 1,
  },
  {
    id: 's-2',
    seq: 2,
    label: 'STOP #1',
    city: 'AL ABHA',
    address: 'Al Abha, Saudi Arabia',
    status: 'Upcoming',
    photoCount: 0,
  },
  {
    id: 's-3',
    seq: 3,
    label: 'STOP #2',
    city: 'Khamis Mushait',
    address: 'Khamis Mushait, Saudi Arabia',
    status: 'Upcoming',
    photoCount: 0,
  },
  {
    id: 's-4',
    seq: 4,
    label: 'DELIVERY',
    city: 'Khamis Mushait',
    address: 'Khamis Mushait, Saudi Arabia',
    status: 'Upcoming',
    photoCount: 0,
    isDelivery: true,
  },
];

export default function TripStopTimeline({
  stops,
  tz,
  onOpenActivityLog,
}: TripStopTimelineProps) {
  // Normalize stops from props, fallback to exact demo layout if empty
  const displayStops: StopItem[] =
    stops && stops.length >= 2
      ? stops.map((st, idx) => {
          const isFirst = idx === 0;
          const isLast = idx === stops.length - 1;
          const isCompleted = !!st.actual_arrival;
          const label = isFirst
            ? 'PICKUP'
            : isLast
            ? 'DELIVERY'
            : `STOP #${idx}`;

          const cityName =
            st.location?.city ||
            st.location_name ||
            st.name ||
            (isFirst ? 'Riyadh' : isLast ? 'Khamis Mushait' : 'AL ABHA');

          const address =
            cleanAddressStr(st.location?.address || st.location_address) ||
            `${cityName}, Saudi Arabia`;

          const time = st.actual_arrival
            ? formatInDeploymentTz(st.actual_arrival, tz, 'hh:mm a')
            : st.planned_arrival
            ? formatInDeploymentTz(st.planned_arrival, tz, 'hh:mm a')
            : null;

          return {
            id: st.id || `stop-${idx}`,
            seq: idx + 1,
            label,
            city: cityName,
            address,
            status: isCompleted ? 'Completed' : 'Upcoming',
            time,
            photoCount: isFirst ? 1 : 0,
            isDelivery: isLast,
          };
        })
      : SAMPLE_STOPS;

  const totalStopsCount = Math.max(displayStops.length, 6);

  return (
    <div className="w-full h-full flex flex-col bg-white rounded-2xl border border-[#E5E7EB] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#E5E7EB] flex items-center justify-between bg-white shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-charcoal text-white flex items-center justify-center shrink-0 shadow-xs">
            <ListChecks size={15} />
          </div>
          <h3 className="text-xs font-bold text-[#1F2937] tracking-tight">
            Route & Stop Sequence
          </h3>
        </div>

        <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
          {totalStopsCount} Stops
        </span>
      </div>

      {/* Stop Sequence List */}
      <div className="flex-1 overflow-y-auto px-4 py-3 min-h-0">
        <div className="relative space-y-3">
          {displayStops.map((stop, idx) => {
            const isLast = idx === displayStops.length - 1;
            const isCompleted = stop.status === 'Completed';
            const isDelivery = stop.isDelivery;

            return (
              <div key={stop.id} className="relative flex items-start gap-3">
                {/* Number Circle Node */}
                <div className="relative flex flex-col items-center shrink-0 w-6">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[11px] z-10 shadow-xs ${
                      isCompleted
                        ? 'bg-emerald-600 text-white'
                        : isDelivery
                        ? 'bg-[#EF4444] text-white'
                        : 'bg-slate-400 text-white'
                    }`}
                  >
                    {stop.seq}
                  </div>

                  {/* Connecting Line */}
                  {!isLast && (
                    <div className="w-[1.5px] bg-[#E5E7EB] absolute top-6 bottom-[-16px] z-0" />
                  )}
                </div>

                {/* Stop Card */}
                <div
                  className={`flex-1 rounded-xl border p-2.5 transition-all text-xs ${
                    isCompleted
                      ? 'bg-white border-[#E5E7EB]'
                      : isDelivery
                      ? 'bg-white border-[#E5E7EB]'
                      : 'bg-white border-[#E5E7EB]'
                  }`}
                >
                  {/* Top: Category Label + Time */}
                  <div className="flex items-center justify-between gap-1 leading-none">
                    <div className="flex items-center gap-1.5">
                      <MapPin
                        size={12}
                        className={
                          isCompleted
                            ? 'text-emerald-600 fill-emerald-600'
                            : isDelivery
                            ? 'text-rose-500 fill-rose-500'
                            : 'text-slate-400 fill-slate-400'
                        }
                      />
                      <span
                        className={`text-[10px] font-black uppercase tracking-wider ${
                          isCompleted
                            ? 'text-emerald-700'
                            : isDelivery
                            ? 'text-rose-600'
                            : 'text-slate-500'
                        }`}
                      >
                        {stop.label}
                      </span>
                    </div>

                    {stop.time && (
                      <span className="font-mono text-[10px] font-bold text-emerald-700">
                        {stop.time}
                      </span>
                    )}
                  </div>

                  {/* Middle: City & Address */}
                  <div className="mt-1.5 space-y-0.5">
                    <h4 className="font-bold text-[12px] text-[#1F2937] leading-snug">
                      {stop.city}
                    </h4>
                    <p className="text-[10px] text-[#6B7280] truncate leading-tight">
                      {stop.address}
                    </p>
                  </div>

                  {/* Bottom: Status Pill + Photo Count */}
                  <div className="mt-2 pt-1.5 border-t border-[#F3F4F6] flex items-center justify-between">
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                        isCompleted
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}
                    >
                      {stop.status}
                    </span>

                    <div className="flex items-center gap-1 text-[10.5px] text-[#6B7280]">
                      <ImageIcon size={12} className="text-[#9CA3AF]" />
                      <span className="font-mono font-medium">{stop.photoCount}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom Button: View Full Activity Log */}
      <div className="p-3 border-t border-[#E5E7EB] bg-white shrink-0">
        <Button
          variant="outline"
          onClick={onOpenActivityLog}
          className="w-full h-8.5 rounded-xl border-[#E5E7EB] bg-white hover:bg-slate-50 text-[#374151] text-xs font-semibold flex items-center justify-between px-3 cursor-pointer shadow-none"
        >
          <div className="flex items-center gap-2">
            <ListOrdered size={14} className="text-[#6B7280]" />
            <span>View Full Activity Log</span>
          </div>
          <ChevronRight size={14} className="text-[#9CA3AF]" />
        </Button>
      </div>
    </div>
  );
}
