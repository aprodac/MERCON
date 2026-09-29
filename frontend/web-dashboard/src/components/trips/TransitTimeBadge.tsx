import React, { useState, useEffect, useRef } from 'react';
import { Clock, Navigation, MapPin, CheckCircle2, ArrowRight } from 'lucide-react';
import {
  estimateTravelTimeByName,
  calculateArrivalDropoffTime,
  calculateArrivalDropoffDateAndTime,
  TravelTimeEstimate,
} from '@/services/travelTimeService';
import { cn, isUuid } from '@/lib/utils';

interface TransitTimeBadgeProps {
  origin: string;
  destination: string;
  returnDestination?: string;
  isRoundTrip?: boolean;
  intermediateLocations?: string[];
  returnIntermediateLocations?: string[];
  originLat?: number | null;
  originLng?: number | null;
  destinationLat?: number | null;
  destinationLng?: number | null;
  pickupDate?: string;
  pickupTime?: string;
  dropoffTime?: string;
  onAutoSetDropoffTime?: (suggestedDropoffTime: string, isOvernight: boolean) => void;
  onAutoSetDropoffDateTime?: (dropoffDate: string, dropoffTime: string, isOvernight: boolean, estimate: TravelTimeEstimate) => void;
  className?: string;
  compact?: boolean;
}

export default function TransitTimeBadge({
  origin,
  destination,
  returnDestination,
  isRoundTrip,
  intermediateLocations = [],
  returnIntermediateLocations = [],
  originLat,
  originLng,
  destinationLat,
  destinationLng,
  pickupDate,
  pickupTime = '08:00',
  dropoffTime,
  onAutoSetDropoffTime,
  onAutoSetDropoffDateTime,
  className,
  compact = false,
}: TransitTimeBadgeProps) {
  const [estimate, setEstimate] = useState<TravelTimeEstimate | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;

    if (!origin?.trim() || !destination?.trim()) {
      setEstimate(null);
      return;
    }

    setLoading(true);
    estimateTravelTimeByName(origin, destination, originLat, originLng, destinationLat, destinationLng)
      .then((res) => {
        if (isMounted) {
          setEstimate(res);
          setLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setEstimate(null);
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [origin, destination, originLat, originLng, destinationLat, destinationLng]);

  // Callers pass inline callbacks (a new function every render). Keeping them in a ref
  // means the auto-fill below runs only when the estimate or the pickup actually
  // changes — not on every render, which looped and overwrote a hand-set drop-off.
  const autoSetRef = useRef({ onAutoSetDropoffDateTime, onAutoSetDropoffTime });
  autoSetRef.current = { onAutoSetDropoffDateTime, onAutoSetDropoffTime };

  // Auto-update dropoff date and time when estimate, pickupDate, or pickupTime changes
  const durationMinutes = estimate?.durationMinutes;
  useEffect(() => {
    if (!estimate || !pickupTime || !pickupTime.trim()) return;
    const { onAutoSetDropoffDateTime: setDateTime, onAutoSetDropoffTime: setTime } = autoSetRef.current;
    if (setDateTime) {
      const arrivalCalc = calculateArrivalDropoffDateAndTime(pickupDate, pickupTime, estimate.durationMinutes);
      if (arrivalCalc.dropoffTime) {
        setDateTime(arrivalCalc.dropoffDate, arrivalCalc.dropoffTime, arrivalCalc.isOvernight, estimate);
      }
    } else if (setTime) {
      const arrivalCalc = calculateArrivalDropoffTime(pickupTime, estimate.durationMinutes);
      if (arrivalCalc.dropoffTime) {
        setTime(arrivalCalc.dropoffTime, arrivalCalc.isOvernight);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [durationMinutes, pickupDate, pickupTime]);

  if (!origin.trim() || !destination.trim()) {
    return null;
  }

  if (compact) {
    if (loading) {
      return (
        <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-50 dark:bg-orange-950/40 text-brand text-[10px] font-bold border border-orange-200 dark:border-orange-900/60 animate-pulse shrink-0", className)}>
          <Clock className="w-3 h-3 text-brand animate-spin" />
          <span>Est. transit...</span>
        </span>
      );
    }
    if (!estimate) return null;
    return (
      <span className={cn("inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-orange-50 dark:bg-orange-950/40 text-brand text-[10px] font-black border border-orange-200/80 dark:border-orange-900/60 shadow-2xs shrink-0", className)}>
        <Clock className="w-3 h-3 text-brand shrink-0" />
        <span>Transit: {estimate.durationText}</span>
        <span className="text-orange-700/80 dark:text-orange-300/80 font-bold ml-0.5">({estimate.distanceKm} km)</span>
      </span>
    );
  }

  if (loading) {
    return (
      <div className={cn("flex items-center gap-2 p-3 rounded-2xl bg-orange-50/60 dark:bg-orange-950/20 border border-orange-200/60 dark:border-orange-900/40 text-xs font-bold text-brand animate-pulse", className)}>
        <Clock className="w-4 h-4 text-[#FA634E] shrink-0 animate-spin" />
        <span>Calculating transit estimate...</span>
      </div>
    );
  }

  if (!estimate) {
    return null;
  }

  return (
    <div className={cn('p-3.5 rounded-2xl bg-[#FFF5F2] border border-[#FFDCD6] space-y-2.5 text-[#3E3C3D] shadow-2xs', className)}>
      {/* Top Bar: Transit Time Pill + Distance + Source */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FA634E] text-white text-xs font-extrabold shadow-2xs">
            <Clock className="w-3.5 h-3.5 text-white" />
            <span>Transit: {estimate.durationText}</span>
          </span>

          <span className="text-xs font-extrabold text-[#FA634E]">
            ({estimate.distanceKm} km)
          </span>
        </div>

        <span className="text-[10px] font-semibold text-slate-500">
          via {estimate.source === 'google_maps' ? 'Google Maps' : 'Saudi Highway Network'}
        </span>
      </div>

      {/* Prominently Highlighted Selected Route Path (2-Column Side-by-Side Layout for Round Trips) */}
      <div className="pt-2 border-t border-[#FFDCD6] space-y-1">
        <span className="text-[10px] font-extrabold text-[#FA634E] uppercase tracking-wider block">
          EVALUATED ROUTE PATH:
        </span>

        {isRoundTrip ? (() => {
          // Resolve clean display names (strip raw UUIDs)
          const cleanOriginName = isUuid(origin) ? '' : origin;
          const cleanDestName = isUuid(destination) ? '' : destination;
          const cleanReturnDestName = !returnDestination || isUuid(returnDestination)
            ? (cleanOriginName || cleanDestName || 'Origin')
            : returnDestination;

          return (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 py-0.5">
              {/* COLUMN 1: LEG 1 OUTBOUND JOURNEY */}
              <div className="p-2 rounded-xl bg-white/80 border border-[#FFDCD6] space-y-1 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] uppercase font-extrabold tracking-wider">
                    Outbound Journey
                  </span>
                </div>
                <div className="flex items-center gap-1 flex-wrap text-[11px] font-extrabold">
                  <span className="px-2 py-0.5 rounded-lg bg-slate-50 border border-slate-200 text-[#3E3C3D] flex items-center gap-1 max-w-[130px] truncate">
                    <MapPin className="w-3 h-3 text-emerald-600 shrink-0" />
                    <span className="truncate">{cleanOriginName || 'Origin'}</span>
                  </span>

                  {intermediateLocations.map((stopName, idx) => (
                    <React.Fragment key={idx}>
                      <ArrowRight className="w-3 h-3 text-[#FA634E] shrink-0" />
                      <span className="px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-bold max-w-[100px] truncate">
                        Stop #{idx + 1}: {isUuid(stopName) ? `Stop ${idx + 1}` : stopName}
                      </span>
                    </React.Fragment>
                  ))}

                  <ArrowRight className="w-3.5 h-3.5 text-[#FA634E] shrink-0" />

                  <span className="px-2 py-0.5 rounded-lg bg-slate-50 border border-slate-200 text-[#3E3C3D] flex items-center gap-1 max-w-[130px] truncate">
                    <MapPin className="w-3 h-3 text-brand shrink-0" />
                    <span className="truncate">{cleanDestName || 'Destination'}</span>
                  </span>
                </div>
              </div>

              {/* COLUMN 2: LEG 2 RETURN JOURNEY LOOP */}
              <div className="p-2 rounded-xl bg-white/80 border border-purple-200 space-y-1 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-800 border border-purple-200 text-[10px] uppercase font-extrabold tracking-wider">
                    Return Loop
                  </span>
                </div>
                <div className="flex items-center gap-1 flex-wrap text-[11px] font-extrabold">
                  <span className="px-2 py-0.5 rounded-lg bg-slate-50 border border-slate-200 text-[#3E3C3D] flex items-center gap-1 max-w-[130px] truncate">
                    <MapPin className="w-3 h-3 text-brand shrink-0" />
                    <span className="truncate">{cleanDestName || 'Destination'}</span>
                  </span>

                  {returnIntermediateLocations.map((stopName, idx) => (
                    <React.Fragment key={idx}>
                      <ArrowRight className="w-3 h-3 text-purple-600 shrink-0" />
                      <span className="px-1.5 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-indigo-800 text-[10px] font-bold max-w-[100px] truncate">
                        Ret Stop #{idx + 1}: {isUuid(stopName) ? `Ret Stop ${idx + 1}` : stopName}
                      </span>
                    </React.Fragment>
                  ))}

                  <ArrowRight className="w-3.5 h-3.5 text-purple-600 shrink-0" />

                  <span className="px-2 py-0.5 rounded-lg bg-slate-50 border border-purple-200 text-[#3E3C3D] flex items-center gap-1 max-w-[130px] truncate">
                    <MapPin className="w-3 h-3 text-purple-600 shrink-0" />
                    <span className="truncate">{cleanReturnDestName}</span>
                  </span>
                </div>
              </div>
            </div>
          );
        })() : (
          /* SINGLE TRIP 1-ROW PATH */
          <div className="flex items-center gap-2 flex-wrap text-xs font-extrabold">
            <span className="px-2.5 py-1 rounded-xl bg-white border border-[#FFDCD6] text-[#3E3C3D] shadow-2xs flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>{origin}</span>
            </span>

            <ArrowRight className="w-4 h-4 text-[#FA634E] shrink-0" />

            <span className="px-2.5 py-1 rounded-xl bg-[#FFF5F2] border border-[#FFDCD6] text-[#3E3C3D] shadow-2xs flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-brand shrink-0" />
              <span>{destination}</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
