import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle,
  FileText,
  UserX,
  CheckCircle2,
  ChevronRight,
  Video,
  Upload,
  Phone,
  ExternalLink,
  Check,
  User,
  Truck,
  MapPin,
  Camera,
  Building2,
  Loader2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { WhatsAppIcon } from '@/components/ui/whatsapp-icon';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { documentService } from '@/services/documentService';
import { driverService, Driver } from '@/services/driverService';
import { vehicleService, Vehicle } from '@/services/vehicleService';
import { tripService, Trip } from '@/services/tripService';
import { notificationService } from '@/services/notificationService';
import { documentDisplayName, daysUntil, resolveFileUrl } from '@/lib/documents';

export type ActionItemCategory = 'delay' | 'doc' | 'pod' | 'unassigned' | 'location';
export type PriorityLevel = 'critical' | 'attention' | 'other';
export type EntityType = 'company' | 'driver' | 'vehicle';

export interface UnifiedActionItem {
  id: string;
  category: ActionItemCategory;
  priority: PriorityLevel;
  badgeLabel: string;
  entityType: EntityType;
  entityName: string;
  avatarUrl?: string;
  initials: string;
  tripRef?: string;
  subtitle: string;
  trip?: Trip;
  doc?: any;
  driver?: Driver;
  vehicle?: Vehicle;
  delayReason?: string;
  delayTimeAgo?: string;
  hasVideo?: boolean;
  videoUrl?: string;
  daysRemaining?: number;
}

interface OperatorCommandCenterProps {
  trips?: Trip[];
  onOpenQuickAssign?: (trip: Trip) => void;
}

function getInitials(name: string): string {
  if (!name) return 'MC';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function getTripVideoInfo(t: Trip, docs: any[] = []): { hasVideo: boolean; videoUrl?: string } {
  if (!t) return { hasVideo: false };

  const directUrl = (t as any)?.delay_video_url || (t as any)?.video_url || (t as any)?.videoUrl;
  if (directUrl) {
    return { hasVideo: true, videoUrl: resolveFileUrl(directUrl) };
  }

  if (Array.isArray(t.stops)) {
    for (const stop of t.stops) {
      const stopVideo = (stop as any)?.delay_video_url || (stop as any)?.video_url;
      if (stopVideo) {
        return { hasVideo: true, videoUrl: resolveFileUrl(stopVideo) };
      }
    }
  }

  const stopIds = new Set(Array.isArray(t.stops) ? t.stops.map((s: any) => s.id).filter(Boolean) : []);
  const localDocs = Array.isArray((t as any)?.documents) ? (t as any).documents : [];

  const relatedDocs = [
    ...localDocs,
    ...docs.filter((d: any) =>
      d.entity_id === t.id ||
      d.entity_id === t.ref_id ||
      (d.entity_id && stopIds.has(d.entity_id))
    ),
  ];

  for (const d of relatedDocs) {
    const fileUrl = String(d?.file_url || d?.file_path || d?.url || '').toLowerCase();
    const mime = String(d?.mime_type || d?.file_type || '').toLowerCase();
    const docType = String(d?.doc_type || d?.category || '').toLowerCase();

    const isVideo = mime.startsWith('video/') ||
      /\.(mp4|mov|webm|avi|mkv|3gp|ogv)$/i.test(fileUrl) ||
      docType === 'delayevidence';

    if (isVideo) {
      const rawUrl = d.file_url || d.file_path || d.url;
      if (rawUrl) {
        return { hasVideo: true, videoUrl: resolveFileUrl(rawUrl) };
      }
    }
  }

  return { hasVideo: false };
}

export default function OperatorCommandCenter({ trips: propTrips }: OperatorCommandCenterProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [activeCategoryFilter, setActiveCategoryFilter] = useState<'all' | ActionItemCategory>('all');
  const [selectedCompanyFilter, setSelectedCompanyFilter] = useState<string>('all');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  // Inspector form state
  const [newExpiryDate, setNewExpiryDate] = useState<string>('');
  const [podRefNo, setPodRefNo] = useState<string>('');
  const [assignDriverId, setAssignDriverId] = useState<string>('');
  const [assignVehicleId, setAssignVehicleId] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isSharingWhatsApp, setIsSharingWhatsApp] = useState<boolean>(false);
  const [confirmItem, setConfirmItem] = useState<UnifiedActionItem | null>(null);
  const [handledItemIds, setHandledItemIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('mercon_operator_handled_items');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  const markItemHandled = (itemId: string) => {
    if (!itemId) return;
    setHandledItemIds((prev) => {
      const next = new Set(prev);
      next.add(itemId);
      try {
        localStorage.setItem('mercon_operator_handled_items', JSON.stringify(Array.from(next)));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  };

  // 1. Fetch auxiliary records
  // Wrap in try/catch: if the documents module is disabled (403 MODULE_DISABLED),
  // the global axios interceptor would redirect to '/' — we swallow it here and
  // return an empty array so the dashboard stays functional.
  const { data: docs = [] } = useQuery({
    queryKey: ['documents', 'all'],
    queryFn: async () => {
      try {
        return (await documentService.getAll({ per_page: 200 })).data;
      } catch {
        return [];
      }
    },
    retry: false,
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

  // 2. Build Unified Queue Items with Precise Unassigned Check
  const actionItems = useMemo<UnifiedActionItem[]>(() => {
    const items: UnifiedActionItem[] = [];
    const nowMs = Date.now();
    const seenTripIds = new Set<string>();

    // A. Delays & Overdue Trips (Company Avatar)
    allTrips.forEach((t) => {
      const tripRef = t.ref_id || `TRP-${t.id.slice(0, 6).toUpperCase()}`;
      const customerName = t.customer?.name || (t as any).customerName || 'Customer';
      const stops = t.stops || [];
      const origin = (stops[0]?.location_name || (t as any).pickup || 'Origin').replace(/\]+$/, '').trim();
      const rawDest = (stops[stops.length - 1]?.location_name || (t as any).dropoff || 'Destination').replace(/\]+$/, '').trim();
      const dest = rawDest.includes('→') ? rawDest.split('→').pop()?.trim() || rawDest : rawDest.replace(/^RETURN:\s*/i, '').trim();
      const routeStr = `${origin} → ${dest}`;

      const isStatusDelayed = t.status === 'Delayed' || String(t.status).toLowerCase() === 'delayed';
      const hasDelayNote = typeof t.notes === 'string' && t.notes.includes('[DELAY REPORT]');
      const delayedStop = stops.find((s: any) => s.delay_reason || s.delay_note || s.status === 'Delayed');
      const isOverdueSchedule = Boolean(
        !isStatusDelayed &&
        t.planned_end != null &&
        ['InTransit', 'AtPickup', 'Loading', 'Dispatched'].includes(t.status) &&
        new Date(t.planned_end).getTime() < (nowMs - 15 * 60 * 1000)
      );

      if (isStatusDelayed || hasDelayNote || delayedStop || isOverdueSchedule) {
        seenTripIds.add(t.id);
        if (t.ref_id) seenTripIds.add(t.ref_id);

        let cleanReason = '';
        if (hasDelayNote) {
          cleanReason = t.notes!.replace(/^\[DELAY REPORT\]:\s*/i, '').trim();
        } else if (delayedStop?.delay_note) {
          cleanReason = delayedStop.delay_note;
        } else if (delayedStop?.delay_reason) {
          cleanReason = `Delay: ${delayedStop.delay_reason}`;
        } else if (isOverdueSchedule) {
          cleanReason = 'Schedule overrun — estimated arrival time exceeded';
        } else {
          cleanReason = 'Driver reported operational traffic / transit delay';
        }

        const { hasVideo, videoUrl } = getTripVideoInfo(t, docs);

        let timeAgo = 'Just now';
        const timeRef = delayedStop?.delay_logged_at || t.updatedAt || t.createdAt;
        if (timeRef) {
          const diffMs = nowMs - new Date(timeRef).getTime();
          const mins = Math.floor(diffMs / (60 * 1000));
          if (mins < 1) timeAgo = 'Just now';
          else if (mins < 60) timeAgo = `${mins}m ago`;
          else {
            const hrs = Math.floor(mins / 60);
            timeAgo = hrs < 24 ? `${hrs}h ago` : `${Math.floor(hrs / 24)}d ago`;
          }
        }

        items.push({
          id: `delay-${t.id}`,
          category: 'delay',
          priority: 'critical',
          badgeLabel: 'DELAY',
          entityType: 'company',
          entityName: customerName,
          initials: getInitials(customerName),
          avatarUrl: (t.customer as any)?.logo_url || (t.driver as any)?.avatar_url,
          tripRef,
          subtitle: `${tripRef} • ${routeStr}`,
          trip: t,
          delayReason: cleanReason,
          delayTimeAgo: timeAgo,
          hasVideo,
          videoUrl,
        });
      }

      // B. Unassigned Trips (ACCURATE CHECK: Only if ACTUALLY missing driver or vehicle!)
      const hasDriver = Boolean(
        t.driver ||
        (t as any).driver_id ||
        (t as any).driver_name ||
        (t as any).third_party_driver_name ||
        ((t as any).trip_drivers && (t as any).trip_drivers.length > 0)
      );

      const hasVehicle = Boolean(
        t.vehicle ||
        (t as any).vehicle_id ||
        (t as any).plate ||
        (t as any).third_party_vehicle_plate
      );

      const isUnassigned = (!hasDriver || !hasVehicle) && !['Cancelled', 'Completed', 'Invoiced'].includes(t.status);

      if (isUnassigned && !seenTripIds.has(t.id)) {
        const missingText = !hasDriver && !hasVehicle ? 'Driver & Vehicle missing' : !hasDriver ? 'Driver missing' : 'Vehicle missing';
        items.push({
          id: `unassigned-${t.id}`,
          category: 'unassigned',
          priority: 'critical',
          badgeLabel: 'UNASSIGNED',
          entityType: 'company',
          entityName: customerName,
          initials: getInitials(customerName),
          tripRef,
          subtitle: `${tripRef} • ${routeStr} (${missingText})`,
          trip: t,
        });
      }

      // C. POD Status for Trips (Only if driver ACTUALLY uploaded a POD via mobile app!)
      const tripRelatedDocs = [
        ...((t as any)?.documents || []),
        ...docs.filter((d: any) =>
          (t.id && d.entity_id === t.id) ||
          (t.ref_id && d.entity_id === t.ref_id)
        )
      ];

      const podDocsForTrip = tripRelatedDocs.filter((d: any) => {
        const docType = String(d?.doc_type || d?.category || '').toUpperCase();
        const title = String(d?.title || '').toUpperCase();
        return (
          docType.includes('POD') ||
          docType.includes('PROOF') ||
          docType.includes('DELIVERY') ||
          docType.includes('WAYBILL') ||
          title.includes('POD') ||
          title.includes('PROOF')
        );
      });

      const hasDriverUploadedPOD = podDocsForTrip.length > 0 || Boolean((t as any).pod_photo_url);

      if (hasDriverUploadedPOD) {
        items.push({
          id: `pod-${t.id}`,
          category: 'pod',
          priority: 'attention',
          badgeLabel: 'POD READY',
          entityType: 'company',
          entityName: customerName,
          initials: getInitials(customerName),
          tripRef,
          subtitle: `${tripRef} • ${podDocsForTrip.length || 1} Photo(s) Received from Mobile App`,
          trip: t,
        });
      }

      // D. Location Review
      const hasApproxLoc = stops.some((s: any) => s.location_coordinate_precision === 'APPROXIMATE' || s.location_coordinate_precision === 'UNKNOWN');
      if (hasApproxLoc && (t.status === 'Draft' || t.status === 'Dispatched')) {
        items.push({
          id: `loc-${t.id}`,
          category: 'location',
          priority: 'attention',
          badgeLabel: 'LOCATION',
          entityType: 'company',
          entityName: customerName,
          initials: getInitials(customerName),
          tripRef,
          subtitle: `${tripRef} • ${stops[0]?.location_name || 'Origin'} coordinates`,
          trip: t,
        });
      }
    });

    // E. Document Expiration Reminders
    docs.forEach((doc) => {
      const days = daysUntil(doc.expiry_date);
      if (days !== null && days <= 30) {
        const isExpired = days <= 0;
        const badgeLabel = isExpired ? 'EXPIRED' : 'EXPIRING';
        const docName = documentDisplayName(doc);
        const daysText = isExpired ? (days === 0 ? 'Expires today' : `${Math.abs(days)}d overdue`) : `${days}d left`;

        let entityType: EntityType = 'company';
        let entityName = 'Document';
        let avatarUrl: string | undefined = undefined;

        if (doc.entity_type === 'Vehicle') {
          entityType = 'vehicle';
          const v = vehicleMap.get(doc.entity_id) || vehicles.find((veh) => veh.id === doc.entity_id || veh.ref_id === doc.entity_id || veh.plate_number === doc.entity_id);
          entityName = v?.plate_number || v?.ref_id || doc.entity_id;
        } else if (doc.entity_type === 'Driver') {
          entityType = 'driver';
          const d = driverMap.get(doc.entity_id) || drivers.find((drv) => drv.id === doc.entity_id);
          entityName = d ? `${d.first_name || ''} ${d.last_name || ''}`.trim() : doc.entity_id;
          avatarUrl = d?.avatar_url || undefined;
        } else {
          entityType = 'company';
          entityName = (doc as any).entity_name || doc.entity_id || 'Company';
        }

        items.push({
          id: `doc-${doc.id}`,
          category: 'doc',
          priority: isExpired ? 'critical' : days <= 7 ? 'attention' : 'other',
          badgeLabel,
          entityType,
          entityName,
          initials: getInitials(entityName),
          avatarUrl,
          subtitle: `${docName} · ${daysText}`,
          doc,
          daysRemaining: days,
        });
      }
    });

    const activeItems = items.filter((item) => !handledItemIds.has(item.id));
    const priorityRank: Record<PriorityLevel, number> = { critical: 1, attention: 2, other: 3 };
    return activeItems.sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority]);
  }, [allTrips, docs, drivers, vehicles, driverMap, vehicleMap, handledItemIds]);

  // Unique list of companies present in the queue items
  const companyList = useMemo(() => {
    const list: string[] = [];
    actionItems.forEach((item) => {
      if (item.entityName && !list.includes(item.entityName)) {
        list.push(item.entityName);
      }
    });
    return list.sort();
  }, [actionItems]);

  // Filter items by category and selected company
  const filteredItems = useMemo(() => {
    let items = actionItems;
    if (activeCategoryFilter !== 'all') {
      items = items.filter((i) => i.category === activeCategoryFilter);
    }
    if (selectedCompanyFilter !== 'all') {
      items = items.filter((i) => i.entityName === selectedCompanyFilter);
    }
    return items;
  }, [actionItems, activeCategoryFilter, selectedCompanyFilter]);

  // Selected item
  const selectedItem = useMemo<UnifiedActionItem | null>(() => {
    if (filteredItems.length === 0) return null;
    const found = filteredItems.find((i) => i.id === selectedItemId);
    return found || filteredItems[0];
  }, [filteredItems, selectedItemId]);

  // Selected driver name for display in inspector header
  const selectedDriverName = useMemo(() => {
    if (!selectedItem) return '';
    if (selectedItem.driver) {
      const fn = selectedItem.driver.first_name || '';
      const ln = selectedItem.driver.last_name || '';
      const name = `${fn} ${ln}`.trim();
      if (name) return name;
    }
    const t = selectedItem.trip;
    if (t) {
      if (t.driver) {
        const fn = (t.driver as any).first_name || '';
        const ln = (t.driver as any).last_name || '';
        const name = `${fn} ${ln}`.trim() || (t.driver as any).name || (t.driver as any).full_name;
        if (name) return name;
      }
      const dName = (t as any).driver_name || (t as any).third_party_driver_name;
      if (dName) return dName;
      const dId = (t as any).driver_id;
      if (dId && driverMap.has(dId)) {
        const d = driverMap.get(dId)!;
        const name = `${d.first_name || ''} ${d.last_name || ''}`.trim();
        if (name) return name;
      }
      return 'Driver Unassigned';
    }
    return selectedItem.subtitle;
  }, [selectedItem, driverMap]);

  // Counts
  const counts = useMemo(() => {
    return {
      all: actionItems.length,
      delay: actionItems.filter((i) => i.category === 'delay').length,
      doc: actionItems.filter((i) => i.category === 'doc').length,
      pod: actionItems.filter((i) => i.category === 'pod').length,
      unassigned: actionItems.filter((i) => i.category === 'unassigned').length,
    };
  }, [actionItems]);

  // Handlers
  const handleUpdateDocument = async () => {
    if (!selectedItem?.doc) return;
    try {
      setIsSubmitting(true);
      if (newExpiryDate) {
        await api.patch(`/documents/${selectedItem.doc.id}`, { expiry_date: newExpiryDate });
      }
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      toast.success(`Updated document records for ${selectedItem.entityName}`);
      setNewExpiryDate('');
    } catch (e) {
      toast.error('Failed to update document expiry');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAssignTrip = async () => {
    if (!selectedItem?.trip) return;
    try {
      setIsSubmitting(true);
      if (assignDriverId || assignVehicleId) {
        await tripService.dispatch(selectedItem.trip.id, {
          driver_id: assignDriverId || undefined,
          vehicle_id: assignVehicleId || undefined,
        });
      }
      queryClient.invalidateQueries({ queryKey: ['dashboard-trips'] });
      toast.success(`Assigned & Dispatched ${selectedItem.tripRef || selectedItem.entityName}`);
      setAssignDriverId('');
      setAssignVehicleId('');
    } catch (e) {
      toast.error('Failed to assign resources to trip');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUploadPOD = async () => {
    if (!selectedItem?.trip) return;
    try {
      setIsSubmitting(true);
      toast.success(`POD uploaded for ${selectedItem.tripRef || selectedItem.entityName}`);
      setPodRefNo('');
    } catch (e) {
      toast.error('Failed to upload POD');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-[#EEF1F6] dark:border-slate-800 shadow-sm p-4 flex flex-col h-full max-h-[430px] overflow-hidden select-none font-sans">
      
      {/* ── 1. HEADER & CONTROLS BAR ────────────────────────────────── */}
      <div className="flex items-center justify-between pb-2.5 border-b border-[#EEF1F6] dark:border-slate-800 shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#FA634E] shrink-0" />
          <div className="min-w-0">
            <h3 className="text-xs font-black uppercase tracking-wider text-[#3E3C3D] dark:text-slate-100 leading-tight flex items-center gap-2">
              OPERATOR COMMAND
              <span className="px-2 py-0.5 rounded-full bg-rose-50 text-[#FA634E] border border-rose-200/60 text-[9px] font-black tracking-normal">
                {filteredItems.length} ALERTS
              </span>
            </h3>
          </div>
        </div>

        {/* Right Controls: Customer Dropdown + Category Tabs */}
        <div className="flex items-center gap-2">
          <Select value={selectedCompanyFilter} onValueChange={setSelectedCompanyFilter}>
            <SelectTrigger className="h-7 text-[10.5px] font-bold border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 max-w-[160px] px-2.5 cursor-pointer rounded-lg shadow-2xs">
              <SelectValue placeholder="All Customers" />
            </SelectTrigger>
            <SelectContent className="z-50 max-h-56">
              <SelectItem value="all" className="text-xs font-bold text-[#FA634E]">
                All Customers ({actionItems.length})
              </SelectItem>
              {companyList.map((name) => (
                <SelectItem key={name} value={name} className="text-xs font-semibold">
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="bg-[#EEF1F6] dark:bg-slate-800 p-0.5 rounded-lg flex items-center gap-0.5 border border-slate-200/60 dark:border-slate-700/60 text-[11px] font-semibold">
            <button
              type="button"
              onClick={() => setActiveCategoryFilter(activeCategoryFilter === 'delay' ? 'all' : 'delay')}
              className={cn(
                "px-2.5 py-1 rounded-md transition-all cursor-pointer text-[10.5px] flex items-center gap-1",
                activeCategoryFilter === 'delay'
                  ? "bg-white dark:bg-slate-900 text-[#FA634E] shadow-2xs font-bold"
                  : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
              )}
            >
              <span>Delays</span>
              <span className="font-bold text-[9.5px]">({counts.delay})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveCategoryFilter(activeCategoryFilter === 'doc' ? 'all' : 'doc')}
              className={cn(
                "px-2.5 py-1 rounded-md transition-all cursor-pointer text-[10.5px] flex items-center gap-1",
                activeCategoryFilter === 'doc'
                  ? "bg-white dark:bg-slate-900 text-purple-700 dark:text-purple-400 shadow-2xs font-bold"
                  : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
              )}
            >
              <span>Documents</span>
              <span className="font-bold text-[9.5px]">({counts.doc})</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── 2. DUAL-COLUMN LAYOUT ───────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 grid grid-cols-12 gap-3.5 pt-2.5 overflow-hidden">
        
        {/* ── COLUMN 1: QUEUE LIST & LIVE ONGOING TRIPS (5/12) ──── */}
        <div className="col-span-5 flex flex-col justify-between overflow-hidden min-h-0">
          
          {/* Top Priority Queue Items */}
          <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar min-h-0 space-y-1.5">
            {filteredItems.length === 0 ? (
              <div className="p-4 text-center my-auto bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200/60 dark:border-slate-800 flex flex-col items-center justify-center gap-1">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span className="text-xs font-bold text-[#3E3C3D] dark:text-slate-100">Queue Clear</span>
              </div>
            ) : (
              filteredItems.map((item) => {
                const isSelected = selectedItem?.id === item.id;
                const isDelay = item.category === 'delay';

                const avatarBgClass =
                  item.entityType === 'company'
                    ? "bg-orange-50 text-[#FA634E] border-orange-200/70 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-900/50"
                    : item.entityType === 'driver'
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200/70 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50"
                    : "bg-blue-50 text-blue-700 border-blue-200/70 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900/50";

                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedItemId(item.id)}
                    className={cn(
                      "p-2 rounded-xl transition-all duration-150 flex items-center gap-2 border cursor-pointer",
                      isSelected
                        ? "bg-[#EEF1F6]/90 dark:bg-slate-800 border-l-4 border-l-[#FA634E] border-slate-300 dark:border-slate-700 shadow-2xs"
                        : "bg-white hover:bg-slate-50/80 border-l-4 border-l-transparent border-slate-200/70 dark:bg-slate-800/40 dark:hover:bg-slate-800 dark:border-slate-800"
                    )}
                  >
                    <div className="shrink-0 relative">
                      {item.avatarUrl ? (
                        <img
                          src={item.avatarUrl}
                          alt={item.entityName}
                          className="w-7 h-7 rounded-full object-cover border border-slate-200 dark:border-slate-700 shadow-2xs"
                        />
                      ) : (
                        <div className={cn("w-7 h-7 rounded-full flex items-center justify-center font-extrabold text-[10px] tracking-tight border shadow-2xs", avatarBgClass)}>
                          {item.initials}
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-extrabold text-[11.5px] text-[#3E3C3D] dark:text-slate-100 truncate">
                          {item.entityName}
                        </span>
                      </div>

                      <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 truncate">
                        {item.subtitle}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-0.5 shrink-0">
                      <span className={cn(
                        "text-[8.5px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border shadow-3xs",
                        item.category === 'delay'
                          ? "bg-rose-100 text-[#FA634E] border-rose-200 dark:bg-rose-950 dark:text-rose-300"
                          : item.category === 'pod'
                          ? "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 font-extrabold"
                          : item.category === 'unassigned'
                          ? "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300"
                          : "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300"
                      )}>
                        {item.category === 'pod' ? 'POD READY' : item.badgeLabel}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Bottom Live Ongoing Trips Mini Bar */}
          {(() => {
            const activeTrips = allTrips.filter(t => ['InTransit', 'Dispatched', 'AtPickup'].includes(t.status));
            const liveTrip = allTrips.find(t => t.status === 'InTransit') || activeTrips[0];
            const vehiclePlate = liveTrip?.vehicle?.plate_number || (liveTrip as any)?.plate || (liveTrip as any)?.vehicle_plate;
            const liveDriver = liveTrip?.driver ? `${liveTrip.driver.first_name || ''} ${liveTrip.driver.last_name || ''}`.trim() : (liveTrip as any)?.driver_name;

            return (
              <div className="pt-2 mt-1 border-t border-slate-200/80 dark:border-slate-800 shrink-0">
                <div className="flex items-center justify-between text-[9.5px] font-extrabold text-slate-400 uppercase tracking-wider mb-1">
                  <span className="flex items-center gap-1 text-[#FA634E]">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> LIVE ONGOING TRIPS
                  </span>
                  <span>{activeTrips.length} ACTIVE</span>
                </div>
                {liveTrip ? (
                  <div className="p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-800 flex items-center justify-between text-[10.5px]">
                    <span className="font-bold text-[#3E3C3D] dark:text-slate-200 truncate max-w-[190px] flex items-center gap-1">
                      <Truck className="w-3 h-3 text-emerald-600 shrink-0" />
                      {vehiclePlate || liveTrip.ref_id || 'Active Trip'} {liveDriver ? `(${liveDriver})` : ''}
                    </span>
                    <span className="text-[9.5px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                      {liveTrip.status}
                    </span>
                  </div>
                ) : (
                  <div className="p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-800 text-[10.5px] font-semibold text-slate-400 text-center">
                    No active trips in transit
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {/* ── COLUMN 2: CLEAN INSPECTOR PANEL (7/12) ───────────────────────────── */}
        <div className="col-span-7 bg-white dark:bg-slate-900 rounded-xl border border-slate-200/90 dark:border-slate-800 p-3 flex flex-col justify-between h-full overflow-hidden shadow-2xs">
          
          {!selectedItem ? (
            <div className="my-auto text-center text-xs font-semibold text-slate-400">
              Select an item from queue
            </div>
          ) : (

            /* ── UNIFIED INSPECTOR PANEL FOR ALL ALERTS & CATEGORIES ───────── */
            <div className="flex flex-col h-full justify-between gap-2 overflow-hidden">
              
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2 shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-full bg-orange-50 dark:bg-orange-950/50 border border-orange-200/70 text-[#FA634E] flex items-center justify-center font-extrabold text-xs shrink-0">
                    {selectedItem.initials}
                  </div>
                  <div className="min-w-0">
                    <span className="font-extrabold text-xs text-[#3E3C3D] dark:text-slate-100 block truncate">
                      {selectedItem.entityName}
                    </span>
                    <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block truncate">
                      {selectedItem.category === 'doc' ? selectedDriverName : `Driver: ${selectedDriverName}`}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={cn(
                    "px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border",
                    selectedItem.badgeLabel === 'DELAY'
                      ? "bg-rose-100/80 text-[#FA634E] border-rose-200/80 dark:bg-rose-950 dark:border-rose-900"
                      : selectedItem.badgeLabel === 'MISSING POD'
                      ? "bg-blue-100/80 text-blue-700 border-blue-200/80 dark:bg-blue-950 dark:border-blue-900"
                      : "bg-amber-100/80 text-amber-800 border-amber-200/80 dark:bg-amber-950 dark:border-amber-900"
                  )}>
                    {selectedItem.badgeLabel}
                  </span>
                  {selectedItem.delayTimeAgo && (
                    <span className="text-[10px] font-semibold text-slate-400">
                      {selectedItem.delayTimeAgo}
                    </span>
                  )}
                </div>
              </div>

              {/* ── VISUAL MEDIA PREVIEW AREA (DYNAMIC DATA, NO HARDCODING!) ── */}
              <div className="flex-1 min-h-0 py-1 flex flex-col justify-center overflow-hidden">
                {selectedItem.category === 'delay' ? (

                  /* 🎥 DELAY VIDEO PLAYER PREVIEW */
                  <div className="relative rounded-xl overflow-hidden bg-slate-950 border border-slate-800 shadow-md group flex flex-col justify-between h-[165px]">
                    {selectedItem.videoUrl ? (
                      <video
                        src={selectedItem.videoUrl}
                        controls
                        className="w-full h-full object-cover rounded-xl"
                      />
                    ) : (
                      <div className="relative w-full h-full bg-slate-950 flex flex-col items-center justify-center p-3 text-center">
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-900/80 to-slate-950/60" />
                        
                        <div className="relative z-10 flex flex-col items-center gap-1.5">
                          <div 
                            onClick={() => {
                              const custName = selectedItem.entityName;
                              const tripRef = selectedItem.tripRef || selectedItem.entityName;
                              const reason = selectedItem.delayReason || selectedItem.subtitle;
                              const phone = selectedItem.trip?.driver?.phone_primary || selectedItem.driver?.phone_primary || '';
                              const msg = `🚨 *MERCON DELAY REPORT*\nTrip: *${tripRef}*\nCustomer: *${custName}*\nDriver: *${selectedDriverName}*\nReason: ${reason}`;
                              const target = phone ? `https://wa.me/${phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`;
                              window.open(target, '_blank');
                              setConfirmItem(selectedItem);
                            }}
                            className="w-11 h-11 rounded-full bg-[#FA634E] text-white flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform cursor-pointer"
                          >
                            <Video className="w-5 h-5 fill-current ml-0.5" />
                          </div>
                          <span className="text-[11px] font-black text-white tracking-wide">
                            DRIVER DELAY REPORT
                          </span>
                          <span className="text-[9.5px] font-semibold text-slate-300 bg-slate-800/80 px-2 py-0.5 rounded-full border border-slate-700 max-w-[240px] truncate">
                            {selectedItem.delayReason || selectedItem.subtitle}
                          </span>
                        </div>

                        <div className="absolute bottom-2 left-2.5 right-2.5 z-10 flex items-center justify-between text-[9px] font-extrabold text-slate-300">
                          <span className="flex items-center gap-1 text-rose-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" /> REPORTED BY DRIVER
                          </span>
                          <span>{selectedItem.delayTimeAgo || 'LIVE'}</span>
                        </div>
                      </div>
                    )}
                  </div>

                ) : selectedItem.category === 'pod' ? (

                  /* 📸 POD PHOTO IMAGES (Dynamic POD Document / Photo Thumbnails) */
                  (() => {
                    const tId = selectedItem.trip?.id;
                    const tRef = selectedItem.trip?.ref_id;
                    const tripDocs = [
                      ...((selectedItem.trip as any)?.documents || []),
                      ...docs.filter((d: any) => (tId && d.entity_id === tId) || (tRef && d.entity_id === tRef))
                    ];

                    const podDocs = tripDocs.filter((d: any) => {
                      const type = String(d?.doc_type || d?.category || '').toLowerCase();
                      const mime = String(d?.mime_type || d?.file_type || '').toLowerCase();
                      const fileUrl = String(d?.file_url || d?.file_path || d?.url || '').toLowerCase();
                      const title = String(d?.title || '').toLowerCase();
                      return (
                        type.includes('pod') ||
                        type.includes('proof') ||
                        type.includes('delivery') ||
                        type.includes('waybill') ||
                        title.includes('pod') ||
                        title.includes('proof') ||
                        mime.startsWith('image/') ||
                        /\.(jpg|jpeg|png|webp|gif|pdf)$/i.test(fileUrl)
                      );
                    });

                    const allPodUrls: string[] = [];
                    const tripDirectPod = (selectedItem.trip as any)?.pod_photo_url || (selectedItem.trip as any)?.pod_url || (selectedItem.trip as any)?.delivery_proof_url;
                    if (tripDirectPod) allPodUrls.push(resolveFileUrl(tripDirectPod));

                    podDocs.forEach((d: any) => {
                      const raw = d?.file_url || d?.file_path || d?.url;
                      if (raw) {
                        const resolved = resolveFileUrl(raw);
                        if (!allPodUrls.includes(resolved)) allPodUrls.push(resolved);
                      }
                    });

                    selectedItem.trip?.stops?.forEach((s: any) => {
                      if (s.documents && Array.isArray(s.documents)) {
                        s.documents.forEach((d: any) => {
                          const raw = d?.file_url || d?.file_path || d?.url;
                          if (raw) {
                            const resolved = resolveFileUrl(raw);
                            if (!allPodUrls.includes(resolved)) allPodUrls.push(resolved);
                          }
                        });
                      }
                    });

                    const photo1Url = allPodUrls[0] || null;
                    const photo2Url = allPodUrls[1] || null;
                    const phone = selectedItem.trip?.driver?.phone_primary || selectedItem.driver?.phone_primary || '';

                    return (
                      <div className="grid grid-cols-2 gap-2 h-[165px]">
                        {/* Photo 1 */}
                        <div 
                          onClick={() => {
                            if (photo1Url) {
                              window.open(photo1Url, '_blank');
                            } else {
                              const msg = `📸 *MERCON POD PHOTO #1*\nTrip: *${selectedItem.tripRef || selectedItem.entityName}*\nCustomer: *${selectedItem.entityName}*\nDriver: *${selectedDriverName}*`;
                              const target = phone ? `https://wa.me/${phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`;
                              window.open(target, '_blank');
                              setConfirmItem(selectedItem);
                            }
                          }}
                          className="relative rounded-xl overflow-hidden border border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-slate-900 hover:bg-blue-100/60 dark:hover:bg-slate-800 transition-all cursor-pointer shadow-2xs flex flex-col items-center justify-center p-2 text-center group"
                        >
                          {photo1Url ? (
                            <>
                              <img src={photo1Url} alt="POD Photo 1" className="w-full h-full object-cover rounded-lg" />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[10px] font-bold gap-1 rounded-lg">
                                <ExternalLink className="w-3.5 h-3.5" /> View Full Image
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-300 flex items-center justify-center mb-1">
                                <Camera className="w-4 h-4" />
                              </div>
                              <span className="text-[11px] font-black text-slate-900 dark:text-slate-100">
                                POD Photo #1
                              </span>
                              <span className="text-[9px] font-extrabold text-blue-600 dark:text-blue-400 mt-0.5">
                                {podDocs[0]?.title || 'Delivery Proof'}
                              </span>
                              <span className="text-[8px] font-semibold text-slate-400 mt-1 bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                                {allPodUrls.length > 0 ? 'Uploaded' : 'Pending Upload'}
                              </span>
                            </>
                          )}
                        </div>

                        {/* Photo 2 */}
                        <div 
                          onClick={() => {
                            if (photo2Url) {
                              window.open(photo2Url, '_blank');
                            } else {
                              const msg = `📸 *MERCON POD PHOTO #2*\nTrip: *${selectedItem.tripRef || selectedItem.entityName}*\nCustomer: *${selectedItem.entityName}*\nDriver: *${selectedDriverName}*`;
                              const target = phone ? `https://wa.me/${phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`;
                              window.open(target, '_blank');
                              setConfirmItem(selectedItem);
                            }
                          }}
                          className="relative rounded-xl overflow-hidden border border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-slate-900 hover:bg-emerald-100/60 dark:hover:bg-slate-800 transition-all cursor-pointer shadow-2xs flex flex-col items-center justify-center p-2 text-center group"
                        >
                          {photo2Url ? (
                            <>
                              <img src={photo2Url} alt="POD Photo 2" className="w-full h-full object-cover rounded-lg" />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[10px] font-bold gap-1 rounded-lg">
                                <ExternalLink className="w-3.5 h-3.5" /> View Full Image
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="w-9 h-9 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-300 flex items-center justify-center mb-1">
                                <FileText className="w-4 h-4" />
                              </div>
                              <span className="text-[11px] font-black text-slate-900 dark:text-slate-100">
                                POD Photo #2
                              </span>
                              <span className="text-[9px] font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5">
                                {podDocs[1]?.title || 'Weight Slip Proof'}
                              </span>
                              <span className="text-[8px] font-semibold text-slate-400 mt-1 bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                                {allPodUrls.length > 1 ? 'Uploaded' : 'Pending Upload'}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })()

                ) : (

                  /* 📄 OTHER ALERT PREVIEW */
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-3 h-[165px] flex flex-col items-center justify-center text-center gap-1.5">
                    <AlertTriangle className="w-6 h-6 text-amber-500" />
                    <span className="text-xs font-black text-slate-900 dark:text-slate-100">
                      {selectedItem.entityName} — {selectedItem.badgeLabel}
                    </span>
                    <span className="text-[10px] font-bold text-slate-400">
                      {selectedItem.subtitle}
                    </span>
                  </div>

                )}
              </div>

              {/* ── BOTTOM ACTION TOOLBAR (WhatsApp Icon + Mark Completed + Details) ── */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 shrink-0 flex items-center justify-between gap-2">
                <Button
                  size="sm"
                  disabled={isSharingWhatsApp}
                  onClick={async () => {
                    const tripId = selectedItem.trip?.id || (selectedItem.id.startsWith('delay-') || selectedItem.id.startsWith('pod-') ? selectedItem.id.replace(/^(delay|pod)-/, '') : null);
                    if (!tripId) {
                      toast.error('No valid trip associated with this operational item');
                      return;
                    }

                    setIsSharingWhatsApp(true);
                    try {
                      const category = selectedItem.category === 'pod' ? 'pod' : 'delay';
                      const res = await tripService.shareMediaWhatsApp(tripId, { category });
                      if (res.success && res.data) {
                        if (res.data.isCloudApi) {
                          toast.success(`WhatsApp Cloud API message dispatched.`);
                        } else if (res.data.whatsappWebUrl) {
                          window.open(res.data.whatsappWebUrl, '_blank');
                          toast.success('WhatsApp web message opened.');
                        }
                      }
                    } catch (err: any) {
                      const custName = selectedItem.entityName;
                      const tripRef = selectedItem.tripRef || selectedItem.entityName;
                      const driverName = selectedDriverName;
                      const phone = selectedItem.trip?.driver?.phone_primary || selectedItem.driver?.phone_primary || '';

                      const publicBase = (
                        import.meta.env.VITE_PUBLIC_BASE_URL ||
                        (typeof window !== 'undefined' ? window.location.origin : 'https://dev.mercon.tech')
                      ).replace(/\/api\/?$/, '').replace(/\/+$/, '');
                      const galleryUrl = `${publicBase}/trips/evidence-gallery?ref=${encodeURIComponent(tripRef)}`;
                      const rawFileUrl = selectedItem.videoUrl || '';
                      const directFileUrl = rawFileUrl ? (rawFileUrl.startsWith('http') ? rawFileUrl : `${publicBase}${rawFileUrl.startsWith('/') ? '' : '/'}${rawFileUrl}`) : '';

                      const reason = selectedItem.delayReason || selectedItem.subtitle;
                      const msg = selectedItem.category === 'delay'
                        ? `🚨 *MERCON DELAY REPORT*\nTrip: *${tripRef}*\nCustomer: *${custName}*\nDriver: *${driverName}*\nReason: ${reason}\n\n🔗 *Secured Evidence Gallery*:\n${galleryUrl}${directFileUrl ? `\n📹 *Direct Video*:\n${directFileUrl}` : ''}`
                        : `📸 *MERCON POD REPORT*\nTrip: *${tripRef}*\nCustomer: *${custName}*\nDriver: *${driverName}*\n\n🔗 *Secured Evidence Gallery*:\n${galleryUrl}${directFileUrl ? `\n🖼️ *Direct Image*:\n${directFileUrl}` : ''}`;

                      const target = phone
                        ? `https://wa.me/${phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(msg)}`
                        : `https://wa.me/?text=${encodeURIComponent(msg)}`;

                      window.open(target, '_blank');
                      toast.success('WhatsApp web message opened.');
                    } finally {
                      setIsSharingWhatsApp(false);
                      setConfirmItem(selectedItem);
                    }
                  }}
                  className="h-8 flex-1 text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center gap-1.5 shadow-sm cursor-pointer rounded-xl disabled:opacity-50"
                >
                  {isSharingWhatsApp ? (
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  ) : (
                    <WhatsAppIcon className="w-4 h-4 fill-current shrink-0" />
                  )}
                  <span>Share to WhatsApp</span>
                </Button>

                <Button
                  size="sm"
                  onClick={() => navigate(`/trips/${selectedItem.trip?.id || selectedItem.tripRef}`)}
                  className="h-8 px-3 text-xs font-extrabold bg-[#FA634E] hover:bg-[#FA634E]/90 text-white flex items-center justify-center gap-1 shadow-sm cursor-pointer rounded-xl shrink-0"
                >
                  <span>Details</span>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}

        </div>

      </div>

      {/* ── 3. WHATSAPP CONFIRMATION MODAL ────────────────────────────────────── */}
      <Dialog open={Boolean(confirmItem)} onOpenChange={(open) => { if (!open) setConfirmItem(null); }}>
        <DialogContent className="sm:max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-6">
          <DialogHeader className="flex flex-col items-center text-center space-y-2">
            <div className="w-13 h-13 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-200 dark:border-emerald-800 shadow-sm mb-1">
              <WhatsAppIcon className="w-7 h-7 fill-current" />
            </div>
            <DialogTitle className="text-base font-black text-[#3E3C3D] dark:text-slate-100">
              Did you complete sharing to WhatsApp?
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 dark:text-slate-400 max-w-xs leading-relaxed">
              {confirmItem && (
                <>
                  Confirm if the {confirmItem.category === 'pod' ? 'POD photo' : 'delay report'} for{' '}
                  <strong className="text-[#3E3C3D] dark:text-slate-200">{confirmItem.tripRef || confirmItem.entityName}</strong>{' '}
                  was successfully shared to WhatsApp.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800 mt-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmItem(null)}
              className="h-9 text-xs font-bold text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl px-4 cursor-pointer"
            >
              No, Keep in Queue
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (confirmItem) {
                  markItemHandled(confirmItem.id);
                  toast.success(`Alert ${confirmItem.tripRef || confirmItem.entityName} marked as completed & verified`);
                  setConfirmItem(null);
                }
              }}
              className="h-9 text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl px-4 shadow-sm flex items-center gap-1.5 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Yes, Mark as Completed</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
