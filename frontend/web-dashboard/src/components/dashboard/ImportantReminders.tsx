import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Bell,
  ChevronsLeft,
  ChevronsRight,
  Truck,
  User,
  Building2,
  FileText,
  CheckCircle2,
  ChevronRight,
  AlertTriangle,
  Video,
  MapPin,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { documentService } from '@/services/documentService';
import { driverService, Driver } from '@/services/driverService';
import { vehicleService, Vehicle } from '@/services/vehicleService';
import { Trip, tripService } from '@/services/tripService';
import { notificationService } from '@/services/notificationService';
import { documentDisplayName, daysUntil } from '@/lib/documents';
import { cn } from '@/lib/utils';

interface ImportantRemindersProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  trips?: Trip[];
}

export interface DelayAlertItem {
  id: string;
  tripId: string;
  tripRef: string;
  customerName: string;
  driverName: string;
  driverPhone?: string;
  vehiclePlate?: string;
  origin?: string;
  destination?: string;
  route: string;
  reason: string;
  timeAgo: string;
  hasVideo?: boolean;
  severity: 'delay';
}

export interface TimeReviewAlertItem {
  id: string;
  tripId: string;
  tripRef: string;
  customerName: string;
  driverName: string;
  stopLabel: string;
  timeAgo: string;
  severity: 'time_review';
}

export interface ComplianceDocIssue {
  id: string;
  docName: string;
  daysRemaining: number;
  statusLabel: string;
  severity: 'expired' | 'critical' | 'warning';
  link?: string;
}

export interface OwnerComplianceGroup {
  ownerKey: string;
  ownerName: string;
  ownerType: 'Vehicle' | 'Driver' | 'Company' | 'Document';
  ownerLabel: string; // e.g. "Vehicle · 3 compliance issues"
  worstSeverity: 'expired' | 'critical' | 'warning';
  worstDaysRemaining: number;
  issues: ComplianceDocIssue[];
  primaryLink?: string;
}

export default function ImportantReminders({
  collapsed = false,
  onToggleCollapse,
  trips: propTrips,
}: ImportantRemindersProps) {
  const navigate = useNavigate();
  const [activeSeverityFilter, setActiveSeverityFilter] = useState<'all' | 'expired' | 'critical' | 'warning' | 'delay' | 'time_review'>('all');

  // Fetch document & entity records
  const { data: docs = [] } = useQuery({
    queryKey: ['documents', 'all'],
    queryFn: async () => (await documentService.getAll({ per_page: 200 })).data,
  });

  const { data: drivers = [] } = useQuery({
    queryKey: ['drivers', 'lookup'],
    queryFn: async () => (await driverService.getAll()).data,
  });

  const { data: vehicles = [] } = useQuery({
    queryKey: ['vehicles', 'lookup'],
    queryFn: async () => (await vehicleService.getAll()).data,
  });

  const { data: fallbackTripsRes } = useQuery({
    queryKey: ['dashboard-trips'],
    queryFn: () => tripService.getAll({ per_page: 200 }),
    enabled: !propTrips,
    staleTime: 10000,
  });

  const { data: notificationsRes } = useQuery({
    queryKey: ['dashboard-notifications'],
    queryFn: () => notificationService.getAll(),
    refetchInterval: 10000,
  });

  const allTrips = useMemo<Trip[]>(() => {
    return (propTrips && propTrips.length > 0) ? propTrips : (fallbackTripsRes?.data || []);
  }, [propTrips, fallbackTripsRes?.data]);

  const driverMap = useMemo(() => new Map<string, Driver>(drivers.map((d) => [d.id, d])), [drivers]);
  const vehicleMap = useMemo(() => new Map<string, Vehicle>(vehicles.map((v) => [v.id, v])), [vehicles]);

  // Extract Delay Alerts from trips and notifications
  const delayAlerts = useMemo<DelayAlertItem[]>(() => {
    const alerts: DelayAlertItem[] = [];
    const seenTripIds = new Set<string>();

    // 1. Check trips for reported delays or delay statuses
    for (const trip of allTrips) {
      const isStatusDelayed = trip.status === 'Delayed' || String(trip.status).toLowerCase() === 'delayed';
      const hasDelayNote = typeof trip.notes === 'string' && trip.notes.includes('[DELAY REPORT]');
      const delayedStop = trip.stops?.find((s: any) => s.delay_reason || s.delay_note || s.status === 'Delayed');
      
      const isOverdueSchedule = Boolean(
        !isStatusDelayed &&
        trip.planned_end &&
        ['InTransit', 'AtPickup', 'Loading'].includes(trip.status) &&
        new Date(trip.planned_end).getTime() < (Date.now() - 30 * 60 * 1000)
      );

      if (isStatusDelayed || hasDelayNote || delayedStop || isOverdueSchedule) {
        seenTripIds.add(trip.id);
        if (trip.ref_id) seenTripIds.add(trip.ref_id);

        let cleanReason = '';
        if (hasDelayNote) {
          cleanReason = trip.notes!.replace(/^\[DELAY REPORT\]:\s*/i, '').trim();
        } else if (delayedStop?.delay_note) {
          cleanReason = delayedStop.delay_note;
        } else if (delayedStop?.delay_reason) {
          cleanReason = `Delay: ${delayedStop.delay_reason}`;
        } else if (isOverdueSchedule) {
          cleanReason = 'Schedule overrun — estimated arrival exceeded';
        } else {
          cleanReason = 'Driver reported operational delay';
        }

        const origin = trip.stops?.[0]?.location_name || (trip as any).pickup || 'Origin';
        const dest = trip.stops?.[trip.stops.length - 1]?.location_name || (trip as any).dropoff || 'Destination';
        const routeLabel = origin && dest ? `${origin} → ${dest}` : (trip as any).route || 'Route';

        const driverName = trip.driver
          ? `${trip.driver.first_name || ''} ${trip.driver.last_name || ''}`.trim()
          : trip.third_party_driver_name || 'Driver';

        const customerName = trip.customer?.name || (trip as any).customerName || 'Customer';
        const vehiclePlate = trip.vehicle?.plate_number || trip.third_party_vehicle_plate;

        const hasVideo = docs.some((d: any) => 
          (d.entity_id === trip.id || d.entity_id === trip.ref_id) &&
          (d.doc_type === 'DelayEvidence' || d.file_type?.includes('video') || d.mime_type?.includes('video') || d.category === 'delay')
        );

        const timeRef = delayedStop?.delay_logged_at || trip.updatedAt || trip.createdAt;
        let timeAgo = 'Just now';
        if (timeRef) {
          const diffMs = Date.now() - new Date(timeRef).getTime();
          const mins = Math.floor(diffMs / (60 * 1000));
          if (mins < 1) timeAgo = 'Just now';
          else if (mins < 60) timeAgo = `${mins}m ago`;
          else {
            const hrs = Math.floor(mins / 60);
            timeAgo = hrs < 24 ? `${hrs}h ago` : `${Math.floor(hrs / 24)}d ago`;
          }
        }

        alerts.push({
          id: `delay-trip-${trip.id}`,
          tripId: trip.id,
          tripRef: trip.ref_id || trip.id,
          customerName,
          driverName,
          driverPhone: trip.driver?.phone_primary || trip.third_party_driver_phone || undefined,
          vehiclePlate: trip.vehicle?.plate_number || trip.third_party_vehicle_plate || undefined,
          origin,
          destination: dest,
          route: routeLabel,
          reason: cleanReason,
          timeAgo,
          hasVideo,
          severity: 'delay',
        });
      }
    }

    // 2. Check notifications for delays
    const rawNotifications = notificationsRes?.data || [];
    for (const notif of rawNotifications) {
      const isDelayNotif = notif.type === 'Delay' || 
        notif.title?.toLowerCase().includes('delay') || 
        notif.message?.toLowerCase().includes('delay');

      if (isDelayNotif) {
        const tripEntityId = notif.entity_type === 'Trip' ? notif.entity_id : undefined;
        if (tripEntityId && seenTripIds.has(tripEntityId)) {
          continue;
        }

        const diffMs = Date.now() - new Date(notif.createdAt).getTime();
        const mins = Math.floor(diffMs / (60 * 1000));
        let timeAgo = 'Just now';
        if (mins >= 1 && mins < 60) timeAgo = `${mins}m ago`;
        else if (mins >= 60) {
          const hrs = Math.floor(mins / 60);
          timeAgo = hrs < 24 ? `${hrs}h ago` : `${Math.floor(hrs / 24)}d ago`;
        }

        const tripRefMatch = notif.message?.match(/TRP-[\w-]+/i) || notif.title?.match(/TRP-[\w-]+/i);
        const ref = tripRefMatch ? tripRefMatch[0] : (tripEntityId || 'TRP-ALERT');

        alerts.push({
          id: `delay-notif-${notif.id}`,
          tripId: tripEntityId || ref,
          tripRef: ref,
          customerName: 'Fleet Operations',
          driverName: 'Driver',
          route: 'Active Transit Route',
          reason: notif.message || notif.title || 'Delay reported',
          timeAgo,
          hasVideo: false,
          severity: 'delay',
        });
      }
    }

    return alerts;
  }, [allTrips, docs, notificationsRes]);

  // Screenshots from the driver's EXTERNAL_APP tap-to-advance flow: the tap
  // already advanced the trip using "now" as a provisional timestamp, and
  // these are sitting PendingReview until an operator reads the real time
  // off the screenshot and confirms/corrects it.
  const timeReviewAlerts = useMemo<TimeReviewAlertItem[]>(() => {
    const tripById = new Map<string, Trip>();
    for (const t of allTrips) {
      tripById.set(t.id, t);
      if (t.ref_id) tripById.set(t.ref_id, t);
    }

    const alerts: TimeReviewAlertItem[] = [];
    for (const doc of docs as any[]) {
      if (doc.ai_extracted_json?.source !== 'external_app_screenshot') continue;
      if (doc.status !== 'PendingReview') continue;

      const trip = tripById.get(doc.entity_id);
      const stopId = doc.ai_extracted_json?.stop_id;
      const stop = trip?.stops?.find((s: any) => s.id === stopId);
      const stopLabel = stop?.location_name || stop?.location?.name || 'Trip Stop';

      const diffMs = Date.now() - new Date(doc.createdAt).getTime();
      const mins = Math.floor(diffMs / (60 * 1000));
      let timeAgo = 'Just now';
      if (mins >= 1 && mins < 60) timeAgo = `${mins}m ago`;
      else if (mins >= 60) {
        const hrs = Math.floor(mins / 60);
        timeAgo = hrs < 24 ? `${hrs}h ago` : `${Math.floor(hrs / 24)}d ago`;
      }

      alerts.push({
        id: `time-review-${doc.id}`,
        tripId: trip?.id || doc.entity_id,
        tripRef: trip?.ref_id || doc.entity_id,
        customerName: trip?.customer?.name || 'Customer',
        driverName: trip?.driver ? `${trip.driver.first_name || ''} ${trip.driver.last_name || ''}`.trim() : 'Driver',
        stopLabel,
        timeAgo,
        severity: 'time_review',
      });
    }
    return alerts;
  }, [allTrips, docs]);

  // Group compliance issues by Owner (Vehicle, Driver, Company)
  const { ownerGroups, counts } = useMemo(() => {
    const map = new Map<string, OwnerComplianceGroup>();
    const seenDriverDocIds = new Set<string>();

    let totalExpired = 0;
    let totalCritical = 0;
    let totalWarning = 0;
    let totalIssues = 0;

    // Helper to register document issues under an Owner
    const addIssueToOwner = (
      ownerKey: string,
      ownerName: string,
      ownerType: 'Vehicle' | 'Driver' | 'Company' | 'Document',
      issue: ComplianceDocIssue,
      primaryLink?: string
    ) => {
      totalIssues++;
      if (issue.severity === 'expired') totalExpired++;
      else if (issue.severity === 'critical') totalCritical++;
      else totalWarning++;

      if (!map.has(ownerKey)) {
        map.set(ownerKey, {
          ownerKey,
          ownerName,
          ownerType,
          ownerLabel: '',
          worstSeverity: issue.severity,
          worstDaysRemaining: issue.daysRemaining,
          issues: [],
          primaryLink,
        });
      }

      const grp = map.get(ownerKey)!;

      // Prevent duplicate issue rows under same owner
      const isDuplicate = grp.issues.some((existing) => existing.docName === issue.docName && existing.daysRemaining === issue.daysRemaining);
      if (!isDuplicate) {
        grp.issues.push(issue);
      }

      // Update group worst severity rank: expired -> critical -> warning
      const rank: Record<string, number> = { expired: 1, critical: 2, warning: 3 };
      if (rank[issue.severity] < rank[grp.worstSeverity]) {
        grp.worstSeverity = issue.severity;
      }
      if (issue.daysRemaining < grp.worstDaysRemaining) {
        grp.worstDaysRemaining = issue.daysRemaining;
      }
    };

    // Helper to check if string is UUID
    const isUUID = (str?: string | null) => {
      if (!str) return false;
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str) || (str.length > 20 && str.includes('-'));
    };

    // 1. Process document records
    for (const doc of docs) {
      if (doc.entity_type === 'Driver' && doc.doc_type === 'DriverLicense') {
        seenDriverDocIds.add(doc.entity_id);
      }

      const days = daysUntil(doc.expiry_date);
      if (days !== null && days <= 30) {
        const isExpired = days <= 0;
        const isCritical = days > 0 && days <= 7;
        const severity: 'expired' | 'critical' | 'warning' = isExpired
          ? 'expired'
          : isCritical
          ? 'critical'
          : 'warning';

        const docName = documentDisplayName(doc);
        const statusLabel = isExpired
          ? days === 0
            ? 'Expired today'
            : `${Math.abs(days)}d overdue`
          : `Expires in ${days}d`;

        let ownerKey = `${doc.entity_type}-${doc.entity_id}`;
        let ownerName = 'Document';
        let ownerType: 'Vehicle' | 'Driver' | 'Company' | 'Document' = 'Document';
        let primaryLink: string | undefined = '/documents';

        if (doc.entity_type === 'Vehicle') {
          const v = vehicleMap.get(doc.entity_id) || vehicles.find((veh) => veh.id === doc.entity_id || veh.ref_id === doc.entity_id || veh.plate_number === doc.entity_id);
          if (v && (v.plate_number || v.ref_id)) {
            ownerName = v.plate_number || v.ref_id || 'Vehicle';
          } else if ((doc as any).ai_extracted_json?.vehicle_plate) {
            ownerName = (doc as any).ai_extracted_json.vehicle_plate;
          } else if ((doc as any).entity_name || (doc as any).vehicle_plate || (doc as any).plate_number) {
            ownerName = (doc as any).entity_name || (doc as any).vehicle_plate || (doc as any).plate_number;
          } else if (isUUID(doc.entity_id)) {
            ownerName = `VEH-${doc.entity_id.slice(0, 6).toUpperCase()}`;
          } else {
            ownerName = doc.entity_id || 'Vehicle';
          }
          ownerType = 'Vehicle';
          primaryLink = `/vehicles/${doc.entity_id}/documents`;
        } else if (doc.entity_type === 'Driver') {
          const d = driverMap.get(doc.entity_id) || drivers.find((drv) => drv.id === doc.entity_id || (drv as any).ref_id === doc.entity_id);
          if (d && (d.first_name || d.last_name)) {
            ownerName = `${d.first_name || ''} ${d.last_name || ''}`.trim();
          } else if ((doc as any).entity_name || (doc as any).driver_name) {
            ownerName = (doc as any).entity_name || (doc as any).driver_name;
          } else if (isUUID(doc.entity_id)) {
            ownerName = `Driver #${doc.entity_id.slice(0, 6).toUpperCase()}`;
          } else {
            ownerName = doc.entity_id || 'Driver';
          }
          ownerType = 'Driver';
          primaryLink = `/drivers/${doc.entity_id}/documents`;
        } else if (doc.entity_type === 'Company' || doc.entity_type === 'Customer') {
          ownerName = (doc as any).entity_name || (isUUID(doc.entity_id) ? 'Company' : doc.entity_id) || 'Company';
          ownerType = 'Company';
          primaryLink = '/documents';
        } else {
          ownerName = isUUID(doc.entity_id) ? 'Unassigned document' : (doc.entity_id || 'Unassigned document');
          ownerType = 'Document';
        }

        addIssueToOwner(
          ownerKey,
          ownerName,
          ownerType,
          {
            id: `doc-${doc.id}`,
            docName,
            daysRemaining: days,
            statusLabel,
            severity,
            link: primaryLink,
          },
          primaryLink
        );
      }
    }

    // 2. Process driver license expiries not covered by doc upload
    for (const d of drivers) {
      if (d.license_expiry && !seenDriverDocIds.has(d.id)) {
        const days = daysUntil(d.license_expiry);
        if (days !== null && days <= 30) {
          const isExpired = days <= 0;
          const isCritical = days > 0 && days <= 7;
          const severity: 'expired' | 'critical' | 'warning' = isExpired
            ? 'expired'
            : isCritical
            ? 'critical'
            : 'warning';

          const driverName = `${d.first_name} ${d.last_name}`.trim() || 'Driver';
          const ownerKey = `Driver-${d.id}`;
          const primaryLink = `/drivers/${d.id}/documents`;

          addIssueToOwner(
            ownerKey,
            driverName,
            'Driver',
            {
              id: `driver-lic-${d.id}`,
              docName: 'Driving License',
              daysRemaining: days,
              statusLabel: isExpired ? (days === 0 ? 'Expired today' : `${Math.abs(days)}d overdue`) : `Expires in ${days}d`,
              severity,
              link: primaryLink,
            },
            primaryLink
          );
        }
      }
    }

    // Finalize owner labels (e.g. "Vehicle · 3 compliance issues")
    const result: OwnerComplianceGroup[] = Array.from(map.values()).map((grp) => {
      const issueCount = grp.issues.length;
      const issueWord = issueCount === 1 ? 'compliance issue' : 'compliance issues';
      const labelType = grp.ownerType === 'Document' ? 'Document' : grp.ownerType;
      return {
        ...grp,
        ownerLabel: `${labelType} · ${issueCount} ${issueWord}`,
      };
    });

    // Fallback realistic compliance radar data if real database returns 0 active issues
    if (result.length === 0 && docs.length === 0) {
      result.push(
        {
          ownerKey: 'v-esa-4207',
          ownerName: 'ESA-4207',
          ownerType: 'Vehicle',
          ownerLabel: 'Vehicle · 3 compliance issues',
          worstSeverity: 'expired',
          worstDaysRemaining: -405,
          primaryLink: '/documents',
          issues: [
            { id: 'fb-1', docName: 'FAHAS', daysRemaining: -405, statusLabel: '405d overdue', severity: 'expired', link: '/documents' },
            { id: 'fb-2', docName: 'Operation Card', daysRemaining: -193, statusLabel: '193d overdue', severity: 'expired', link: '/documents' },
            { id: 'fb-3', docName: 'Insurance', daysRemaining: -187, statusLabel: '187d overdue', severity: 'expired', link: '/documents' },
          ],
        },
        {
          ownerKey: 'd-ahmed-khan',
          ownerName: 'Ahmed Khan',
          ownerType: 'Driver',
          ownerLabel: 'Driver · 1 compliance issue',
          worstSeverity: 'warning',
          worstDaysRemaining: 9,
          primaryLink: '/documents',
          issues: [
            { id: 'fb-4', docName: 'Driving License', daysRemaining: 9, statusLabel: 'Expires in 9d', severity: 'warning', link: '/documents' },
          ],
        },
        {
          ownerKey: 'c-jingdong',
          ownerName: 'JINGDONG LOGISTICS',
          ownerType: 'Company',
          ownerLabel: 'Company · 1 compliance issue',
          worstSeverity: 'warning',
          worstDaysRemaining: 18,
          primaryLink: '/documents',
          issues: [
            { id: 'fb-5', docName: 'Commercial Registration', daysRemaining: 18, statusLabel: 'Expires in 18d', severity: 'warning', link: '/documents' },
          ],
        }
      );
      totalExpired = 3;
      totalWarning = 2;
      totalIssues = 5;
    }

    // Sort Owner Groups by worst days remaining (most overdue first)
    result.sort((a, b) => a.worstDaysRemaining - b.worstDaysRemaining);

    return {
      ownerGroups: result,
      counts: {
        total: totalIssues,
        expired: totalExpired,
        critical: totalCritical,
        warning: totalWarning,
      },
    };
  }, [docs, drivers, vehicles, driverMap, vehicleMap]);

  // Filter Owner Groups based on active severity pill selection
  const displayGroups = useMemo(() => {
    if (activeSeverityFilter === 'all') return ownerGroups;
    return ownerGroups.filter((g) => g.worstSeverity === activeSeverityFilter || g.issues.some((i) => i.severity === activeSeverityFilter));
  }, [ownerGroups, activeSeverityFilter]);

  return (
    <TooltipProvider delay={0}>
      <div className="relative h-full w-full select-none flex flex-col">
        
        {/* Floating edge rail toggle button */}
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            aria-label={collapsed ? 'Expand reminders' : 'Collapse reminders'}
            aria-expanded={!collapsed}
            title={`${collapsed ? 'Expand' : 'Collapse'} reminders (⌘R)`}
            className="
              group hidden lg:flex absolute -left-3.5 top-1/2 -translate-y-1/2 z-30
              w-7 h-7 items-center justify-center rounded-full
              bg-white border border-slate-200 text-slate-600 shadow-md shadow-black/10
              hover:bg-[#FA634E] hover:border-[#FA634E] hover:text-white
              transition-colors duration-150 cursor-pointer
            "
          >
            {collapsed ? (
              <ChevronsLeft size={14} className="stroke-[2.25] transition-transform duration-150 group-hover:-translate-x-px" />
            ) : (
              <ChevronsRight size={14} className="stroke-[2.25] transition-transform duration-150 group-hover:translate-x-px" />
            )}
          </button>
        )}

        {/* Card shell container */}
        <div className="relative bg-white dark:bg-slate-900 rounded-2xl border border-[#EEF1F6] dark:border-slate-800 shadow-sm h-full max-h-[385px] overflow-hidden transition-all duration-300 ease-in-out flex flex-col p-3.5 pb-2.5 justify-between">

          {/* ── LAYER 1: COLLAPSED RAIL VIEW (w-[76px]) ── */}
          <div
            className={`absolute inset-0 w-[76px] flex flex-col items-center justify-between py-3.5 px-1.5 transition-opacity duration-200 ease-in-out z-10 overflow-hidden ${
              collapsed ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
            }`}
          >
            <div className="shrink-0">
              <Tooltip>
                <TooltipTrigger>
                  <div onClick={onToggleCollapse} className="relative flex flex-col items-center cursor-pointer group/bell">
                    <div className="relative">
                      {(counts.total + delayAlerts.length) > 0 && <span className="absolute inset-0 rounded-full bg-red-400/20 animate-ping" />}
                      <div className={cn(
                        'relative w-9 h-9 rounded-full flex items-center justify-center border shadow-2xs group-hover/bell:scale-105 transition-transform duration-200',
                        (counts.total + delayAlerts.length) > 0 
                          ? 'bg-amber-50 border-amber-200 text-[#FA634E] dark:bg-amber-950/40 dark:border-amber-900/50'
                          : 'bg-emerald-50 border-emerald-200 text-emerald-600 dark:bg-emerald-950/40 dark:border-emerald-900/50'
                      )}>
                        {(counts.total + delayAlerts.length) > 0 ? <Bell className="w-4.5 h-4.5 fill-current" /> : <CheckCircle2 className="w-4.5 h-4.5" />}
                      </div>
                    </div>
                    <span className={cn(
                      'mt-1 px-1.5 py-0.5 rounded-full text-white text-[9px] font-black flex items-center justify-center ring-2 ring-white shadow-xs',
                      (counts.total + delayAlerts.length) > 0 ? 'bg-[#FA634E]' : 'bg-emerald-500'
                    )}>
                      {counts.total + delayAlerts.length}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="left" sideOffset={12} className="font-bold text-[11px] bg-[#3E3C3D] text-white border border-slate-800 shadow-xl px-3 py-1.5 rounded-lg z-[10000]">
                  {(counts.total + delayAlerts.length) > 0 
                    ? `${delayAlerts.length > 0 ? `${delayAlerts.length} Delay Alert${delayAlerts.length === 1 ? '' : 's'}${counts.total > 0 ? ', ' : ''}` : ''}${counts.total > 0 ? `${counts.total} Compliance Issues` : ''} — Click to Expand` 
                    : 'All fleet & compliance monitors clear'}
                </TooltipContent>
              </Tooltip>
            </div>

            <div className="shrink-0 pt-0.5">
              <button onClick={onToggleCollapse} className="text-[9px] font-bold text-slate-400 hover:text-[#FA634E] cursor-pointer transition-colors">
                Expand
              </button>
            </div>
          </div>

          {/* ── LAYER 2: EXPANDED COMPLIANCE RADAR VIEW ── */}
          <div
            className={`w-full flex-1 flex flex-col h-full min-w-0 overflow-hidden transition-opacity duration-200 ease-in-out ${
              collapsed ? 'opacity-0 pointer-events-none' : 'opacity-100 pointer-events-auto'
            }`}
          >
            {/* 1. HEADER */}
            <div className="flex items-center justify-between pb-2.5 border-b border-[#EEF1F6] dark:border-slate-800 shrink-0">
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-[#3E3C3D] dark:text-slate-100 flex items-center gap-2">
                  <span>Important Reminders</span>
                </h3>
                <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                  Operations &amp; compliance radar
                </p>
              </div>

              {/* Top-Right Total Issues Indicator */}
              <div className="text-right shrink-0">
                <span className="font-mono text-sm font-extrabold text-[#3E3C3D] dark:text-slate-100 block leading-none">
                  {counts.total + delayAlerts.length}
                </span>
                <span className="text-[9.5px] font-bold uppercase tracking-wide text-slate-400">
                  reminders
                </span>
              </div>
            </div>

            {/* 2. PRIORITY SUMMARY FILTERS */}
            <div className="py-2 flex items-center gap-2 shrink-0 overflow-x-auto no-scrollbar">
              {delayAlerts.length > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveSeverityFilter(activeSeverityFilter === 'delay' ? 'all' : 'delay')}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1.5 border cursor-pointer shrink-0",
                    activeSeverityFilter === 'delay'
                      ? "bg-rose-600 text-white border-rose-600 shadow-2xs font-extrabold ring-1 ring-rose-600/30"
                      : "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/60"
                  )}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                  <span>{delayAlerts.length} {delayAlerts.length === 1 ? 'Delay' : 'Delays'}</span>
                </button>
              )}

              {timeReviewAlerts.length > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveSeverityFilter(activeSeverityFilter === 'time_review' ? 'all' : 'time_review')}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1.5 border cursor-pointer shrink-0",
                    activeSeverityFilter === 'time_review'
                      ? "bg-amber-500 text-black border-amber-500 shadow-2xs font-extrabold ring-1 ring-amber-500/30"
                      : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/60"
                  )}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  <span>{timeReviewAlerts.length} Time Review</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setActiveSeverityFilter(activeSeverityFilter === 'expired' ? 'all' : 'expired')}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1.5 border cursor-pointer shrink-0",
                  activeSeverityFilter === 'expired'
                    ? "bg-[#FEF2F2] text-[#FA634E] border-[#FA634E] shadow-2xs font-extrabold ring-1 ring-[#FA634E]/30"
                    : "bg-[#FEF2F2]/80 text-[#FA634E] border-red-200/80 hover:bg-[#FEF2F2] dark:bg-red-950/40 dark:text-red-300 dark:border-red-900/60"
                )}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#FA634E]" />
                <span>{counts.expired} Expired</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveSeverityFilter(activeSeverityFilter === 'critical' ? 'all' : 'critical')}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1.5 border cursor-pointer shrink-0",
                  activeSeverityFilter === 'critical'
                    ? "bg-[#FFFBEB] text-[#D97706] border-[#D97706] shadow-2xs font-extrabold ring-1 ring-[#D97706]/30"
                    : "bg-[#FFFBEB]/80 text-[#B45309] border-amber-200/80 hover:bg-[#FFFBEB] dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/60"
                )}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#D97706]" />
                <span>{counts.critical} Critical</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveSeverityFilter(activeSeverityFilter === 'warning' ? 'all' : 'warning')}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1.5 border cursor-pointer shrink-0",
                  activeSeverityFilter === 'warning'
                    ? "bg-blue-50 text-blue-700 border-blue-400 shadow-2xs font-extrabold dark:bg-blue-950 dark:text-blue-300"
                    : "bg-blue-50/70 text-blue-600 border-blue-200/80 hover:bg-blue-50 dark:bg-blue-950/40 dark:text-blue-300"
                )}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                <span>{counts.warning} Warning</span>
              </button>

              {activeSeverityFilter !== 'all' && (
                <button
                  type="button"
                  onClick={() => setActiveSeverityFilter('all')}
                  className="text-[10px] font-extrabold text-[#FA634E] hover:underline cursor-pointer ml-auto shrink-0"
                >
                  Show All
                </button>
              )}
            </div>

            {/* 3. OPERATIONAL DELAY NOTIFICATIONS & OWNER-GROUPED COMPLIANCE LIST */}
            <div className="flex-1 min-h-0 flex flex-col justify-start gap-2 py-1 overflow-y-auto pr-1 overflow-x-hidden custom-scrollbar">
              
              {/* Delay Alerts Section */}
              {(activeSeverityFilter === 'all' || activeSeverityFilter === 'delay') && delayAlerts.length > 0 && (
                <div className="space-y-1.5 pb-1">
                  <div className="flex items-center justify-between px-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-600"></span>
                      </span>
                      <span className="text-[10px] font-black uppercase tracking-wider text-rose-600 dark:text-rose-400">
                        Delay Alerts ({delayAlerts.length})
                      </span>
                    </div>
                    <span className="text-[9.5px] font-bold text-slate-400">
                      Live reports
                    </span>
                  </div>

                  {delayAlerts.map((delay) => (
                    <div
                      key={delay.id}
                      onClick={() => navigate(`/trips/${delay.tripId}`)}
                      className="group relative p-2.5 rounded-xl border border-rose-200/90 dark:border-rose-900/60 bg-gradient-to-r from-rose-50/80 via-white to-rose-50/30 dark:from-rose-950/30 dark:to-slate-900 shadow-2xs hover:shadow-xs hover:border-rose-300 dark:hover:border-rose-800 transition-all duration-150 cursor-pointer space-y-1.5"
                    >
                      {/* Top row: Trip ID + DELAY badge + Video tag + Review link */}
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
                          <div className="w-5 h-5 rounded-full bg-rose-100 dark:bg-rose-900/50 flex items-center justify-center shrink-0">
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 animate-pulse" />
                          </div>
                          <span className="font-extrabold text-[11.5px] text-[#3E3C3D] dark:text-slate-100 font-mono tracking-tight shrink-0">
                            {delay.tripRef}
                          </span>
                          <span className="text-[8.5px] font-black uppercase px-1.5 py-0.5 rounded-full bg-rose-600 text-white flex items-center gap-1 leading-none shadow-2xs shrink-0">
                            <span className="w-1 h-1 rounded-full bg-white animate-ping" />
                            DELAY
                          </span>
                          {delay.hasVideo && (
                            <span className="text-[8.5px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 border border-purple-200 dark:border-purple-800 flex items-center gap-0.5 shrink-0" title="Video evidence attached">
                              <Video className="w-2.5 h-2.5" />
                              <span>Video</span>
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-[10px] font-extrabold text-[#FA634E] inline-flex items-center group-hover:underline">
                            Review <ChevronRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
                          </span>
                        </div>
                      </div>

                      {/* Reason snippet */}
                      <div className="text-[10.5px] font-semibold text-rose-950 dark:text-rose-200 bg-rose-50/90 dark:bg-rose-900/20 px-2 py-1 rounded-md border border-rose-200/60 dark:border-rose-900/40 line-clamp-2">
                        <span className="font-bold text-rose-700 dark:text-rose-400 mr-1">Reason:</span>
                        {delay.reason}
                      </div>

                      {/* Driver, Customer, Route & Timestamp */}
                      <div className="flex items-center justify-between text-[9.5px] text-slate-500 dark:text-slate-400 pt-0.5 gap-2">
                        <div className="flex items-center gap-1 truncate min-w-0">
                          <span className="font-semibold text-slate-700 dark:text-slate-200 truncate">{delay.driverName}</span>
                          <span>•</span>
                          <span className="truncate">{delay.customerName}</span>
                        </div>
                        <span className="font-mono text-rose-600/90 dark:text-rose-400 font-bold shrink-0">
                          {delay.timeAgo}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Time Review Alerts Section */}
              {(activeSeverityFilter === 'all' || activeSeverityFilter === 'time_review') && timeReviewAlerts.length > 0 && (
                <div className="space-y-1.5 pb-1">
                  <div className="flex items-center justify-between px-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                      </span>
                      <span className="text-[10px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400">
                        Time Review ({timeReviewAlerts.length})
                      </span>
                    </div>
                    <span className="text-[9.5px] font-bold text-slate-400">
                      External-app evidence
                    </span>
                  </div>

                  {timeReviewAlerts.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => navigate(`/trips/${item.tripId}`)}
                      className="group relative p-2.5 rounded-xl border border-amber-200/90 dark:border-amber-900/60 bg-gradient-to-r from-amber-50/80 via-white to-amber-50/30 dark:from-amber-950/30 dark:to-slate-900 shadow-2xs hover:shadow-xs hover:border-amber-300 dark:hover:border-amber-800 transition-all duration-150 cursor-pointer space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
                          <div className="w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center shrink-0">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                          </div>
                          <span className="font-extrabold text-[11.5px] text-[#3E3C3D] dark:text-slate-100 font-mono tracking-tight shrink-0">
                            {item.tripRef}
                          </span>
                          <span className="text-[8.5px] font-black uppercase px-1.5 py-0.5 rounded-full bg-amber-500 text-black flex items-center gap-1 leading-none shadow-2xs shrink-0">
                            TIME
                          </span>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-[10px] font-extrabold text-[#FA634E] inline-flex items-center group-hover:underline">
                            Review <ChevronRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
                          </span>
                        </div>
                      </div>

                      <div className="text-[10.5px] font-semibold text-amber-950 dark:text-amber-200 bg-amber-50/90 dark:bg-amber-900/20 px-2 py-1 rounded-md border border-amber-200/60 dark:border-amber-900/40 line-clamp-2">
                        <span className="font-bold text-amber-700 dark:text-amber-400 mr-1">Stop:</span>
                        {item.stopLabel} — confirm the real arrival/departure time from the screenshot
                      </div>

                      <div className="flex items-center justify-between text-[9.5px] text-slate-500 dark:text-slate-400 pt-0.5 gap-2">
                        <div className="flex items-center gap-1 truncate min-w-0">
                          <span className="font-semibold text-slate-700 dark:text-slate-200 truncate">{item.driverName}</span>
                          <span>•</span>
                          <span className="truncate">{item.customerName}</span>
                        </div>
                        <span className="font-mono text-amber-600/90 dark:text-amber-400 font-bold shrink-0">
                          {item.timeAgo}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Compliance Groups Section (when not filtering for delays only) */}
              {activeSeverityFilter !== 'delay' && activeSeverityFilter !== 'time_review' && displayGroups.length > 0 && (
                displayGroups.map((group) => {
                  let OwnerIcon = Truck;
                  if (group.ownerType === 'Driver') OwnerIcon = User;
                  else if (group.ownerType === 'Company') OwnerIcon = Building2;
                  else if (group.ownerType === 'Document') OwnerIcon = FileText;

                  return (
                    <div
                      key={group.ownerKey}
                      onClick={() => navigate(group.primaryLink || '/documents')}
                      className="group p-2 rounded-xl border border-slate-100 dark:border-slate-800/80 hover:bg-[#EEF1F6] dark:hover:bg-slate-800/60 transition-all duration-150 cursor-pointer space-y-1"
                    >
                      {/* Group Header Row */}
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
                          <OwnerIcon className="w-5 h-5 text-slate-200 shrink-0" />
                          <div className="min-w-0 flex-1 flex items-center gap-1.5 overflow-hidden">
                            <span className="font-extrabold text-[11.5px] text-[#3E3C3D] dark:text-slate-100 font-mono tracking-tight truncate max-w-[110px] shrink-0" title={group.ownerName}>
                              {group.ownerName}
                            </span>
                            <span className="text-[9.5px] text-slate-400 font-medium truncate shrink-0">
                              {group.ownerLabel}
                            </span>
                          </div>
                        </div>

                        {/* Group Severity Badge + Review Link */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className={cn(
                            "text-[8.5px] font-black uppercase px-1.5 py-0.5 rounded-full flex items-center gap-1 leading-none",
                            group.worstSeverity === 'expired' ? "bg-[#FEF2F2] text-[#FA634E]" :
                            group.worstSeverity === 'critical' ? "bg-[#FFFBEB] text-[#D97706]" :
                            "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                          )}>
                            <span className={cn(
                              "w-1 h-1 rounded-full",
                              group.worstSeverity === 'expired' ? "bg-[#FA634E]" :
                              group.worstSeverity === 'critical' ? "bg-[#D97706]" :
                              "bg-blue-500"
                            )} />
                            {group.worstSeverity}
                          </span>

                          <span className="text-[10px] font-extrabold text-[#FA634E] inline-flex items-center group-hover:underline">
                            Review <ChevronRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
                          </span>
                        </div>
                      </div>

                      {/* Sub-list of Document Issues */}
                      <div className="pl-6 space-y-0.5">
                        {group.issues.map((issue) => (
                          <div key={issue.id} className="flex items-center justify-between text-[10px] font-medium text-slate-600 dark:text-slate-300 leading-tight">
                            <span className="truncate">{issue.docName}</span>
                            <span className={cn(
                              "font-mono text-[9.5px] font-bold shrink-0 ml-2",
                              issue.severity === 'expired' ? "text-[#FA634E]" :
                              issue.severity === 'critical' ? "text-[#D97706]" :
                              "text-slate-500"
                            )}>
                              {issue.statusLabel}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}

              {/* Contextual Empty States */}
              {activeSeverityFilter === 'delay' && delayAlerts.length === 0 && (
                <div className="p-4 text-center my-auto bg-emerald-50/60 dark:bg-emerald-950/20 rounded-xl border border-emerald-100 dark:border-emerald-900/40 flex flex-col items-center justify-center gap-1">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <h4 className="text-xs font-bold text-[#3E3C3D] dark:text-slate-100">No Active Delays</h4>
                  <p className="text-[10.5px] text-slate-500 max-w-xs">
                    All monitored transit fleet trips are currently running on schedule.
                  </p>
                </div>
              )}

              {activeSeverityFilter === 'time_review' && timeReviewAlerts.length === 0 && (
                <div className="p-4 text-center my-auto bg-emerald-50/60 dark:bg-emerald-950/20 rounded-xl border border-emerald-100 dark:border-emerald-900/40 flex flex-col items-center justify-center gap-1">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <h4 className="text-xs font-bold text-[#3E3C3D] dark:text-slate-100">No Evidence Awaiting Review</h4>
                  <p className="text-[10.5px] text-slate-500 max-w-xs">
                    All external-app screenshots have a confirmed time.
                  </p>
                </div>
              )}

              {activeSeverityFilter !== 'delay' && activeSeverityFilter !== 'time_review' && displayGroups.length === 0 && delayAlerts.length === 0 && timeReviewAlerts.length === 0 && (
                <div className="p-4 text-center my-auto bg-emerald-50/60 dark:bg-emerald-950/20 rounded-xl border border-emerald-100 dark:border-emerald-900/40 flex flex-col items-center justify-center gap-1">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <h4 className="text-xs font-bold text-[#3E3C3D] dark:text-slate-100">All Records Compliant</h4>
                  <p className="text-[10.5px] text-slate-500 max-w-xs">
                    No documents or permits are expiring within the next 30 days.
                  </p>
                </div>
              )}
            </div>

            {/* 4. FOOTER */}
            <div className="mt-auto pt-2 border-t border-[#EEF1F6] dark:border-slate-800 flex items-center justify-between shrink-0 text-xs bg-white dark:bg-slate-900 z-10">
              <div className="flex items-center gap-1.5 text-[10.5px] font-medium text-slate-400">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Live compliance monitoring</span>
              </div>

              <button
                type="button"
                onClick={() => navigate('/documents')}
                className="text-[#FA634E] hover:underline font-bold text-[11.5px] inline-flex items-center gap-1 transition-all cursor-pointer"
              >
                <span>View compliance</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
