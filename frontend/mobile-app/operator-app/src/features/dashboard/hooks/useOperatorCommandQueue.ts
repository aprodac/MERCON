import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { dashboardApi } from '../api/dashboardApi';
import { daysUntil } from '../services/dashboardService';
import type {
  CommandActionItem,
  CommandActionItemCategory,
  DocumentRef,
  DriverRef,
  PriorityLevel,
  Trip,
  VehicleRef,
} from '../types';

export function getInitials(name: string): string {
  if (!name) return 'MC';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2 && parts[0][0] && parts[1][0]) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export function documentDisplayName(doc: DocumentRef & { title?: string; name?: string }): string {
  if (doc.title) return doc.title;
  if (doc.name) return doc.name;
  switch (doc.doc_type) {
    case 'DriverLicense': return 'Driver License';
    case 'VehicleRegistration': return 'Istimara / Registration';
    case 'Insurance': return 'Insurance Policy';
    case 'POD': return 'Proof of Delivery (POD)';
    case 'CustomsClearance': return 'Customs Clearance';
    case 'Waybill': return 'Waybill / Load Sheet';
    case 'Contract': return 'Commercial Contract';
    case 'Invoice': return 'Commercial Invoice';
    case 'Emergency': return 'Safety / Emergency File';
    default: return String(doc.doc_type || 'Compliance Document');
  }
}

export function useOperatorCommandQueue() {
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<CommandActionItemCategory>('all');

  const tripsQuery = useQuery({
    queryKey: ['dashboard', 'command-trips'],
    queryFn: () => dashboardApi.getTrips({ per_page: 150 }),
    staleTime: 15_000,
  });

  const docsQuery = useQuery({
    queryKey: ['dashboard', 'command-docs'],
    queryFn: async () => {
      try {
        return await dashboardApi.getDocuments({ per_page: 150 });
      } catch {
        return [];
      }
    },
    staleTime: 60_000,
  });

  const driversQuery = useQuery({
    queryKey: ['dashboard', 'command-drivers'],
    queryFn: () => dashboardApi.getDrivers({ per_page: 200 }),
    staleTime: 60_000,
  });

  const vehiclesQuery = useQuery({
    queryKey: ['dashboard', 'command-vehicles'],
    queryFn: () => dashboardApi.getVehicles({ per_page: 200 }),
    staleTime: 60_000,
  });

  const isLoading = tripsQuery.isLoading || docsQuery.isLoading || driversQuery.isLoading || vehiclesQuery.isLoading;
  const isError = tripsQuery.isError;

  const actionItems = useMemo<CommandActionItem[]>(() => {
    const trips = tripsQuery.data ?? [];
    const docs = docsQuery.data ?? [];
    const drivers = driversQuery.data ?? [];
    const vehicles = vehiclesQuery.data ?? [];

    const driverMap = new Map<string, DriverRef>(drivers.map((d) => [d.id, d]));
    const vehicleMap = new Map<string, VehicleRef>(vehicles.map((v) => [v.id, v]));

    const items: CommandActionItem[] = [];
    const nowMs = Date.now();
    const seenTripIds = new Set<string>();

    // A. Delays & Overdue Trips
    trips.forEach((t) => {
      const tripRef = t.ref_id || `TRP-${t.id.slice(0, 6).toUpperCase()}`;
      const customerName = t.customer?.name || (t as any).customerName || 'Customer';
      const stops = t.stops || [];
      const origin = (stops[0]?.location_name || (t as any).pickup || 'Origin').replace(/\]+$/, '').trim();
      const rawDest = (stops[stops.length - 1]?.location_name || (t as any).dropoff || 'Destination').replace(/\]+$/, '').trim();
      const dest = rawDest.includes('→') ? rawDest.split('→').pop()?.trim() || rawDest : rawDest.replace(/^RETURN:\s*/i, '').trim();
      const routeStr = `${origin} → ${dest}`;

      const isStatusDelayed = t.status === 'Delayed' || String(t.status).toLowerCase() === 'delayed';
      const hasDelayNote = typeof (t as any).notes === 'string' && (t as any).notes.includes('[DELAY REPORT]');
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
          cleanReason = (t as any).notes.replace(/^\[DELAY REPORT\]:\s*/i, '').trim();
        } else if (delayedStop?.delay_note) {
          cleanReason = delayedStop.delay_note;
        } else if (delayedStop?.delay_reason) {
          cleanReason = `Delay: ${delayedStop.delay_reason}`;
        } else if (isOverdueSchedule) {
          cleanReason = 'Schedule overrun — estimated arrival time exceeded';
        } else {
          cleanReason = 'Driver reported operational traffic / transit delay';
        }

        let timeAgo = 'Just now';
        const timeRef = delayedStop?.delay_logged_at || (t as any).updatedAt || t.createdAt;
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
        });
      }

      // B. Unassigned Trips
      const hasDriver = Boolean(
        t.driver ||
        (t as any).driver_id ||
        (t as any).driver_name ||
        (t as any).third_party_driver_name
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

      // C. POD Ready for Review
      const tripRelatedDocs = [
        ...((t as any)?.documents || []),
        ...docs.filter((d: any) => (t.id && d.entity_id === t.id) || (t.ref_id && d.entity_id === t.ref_id))
      ];

      const podDocsForTrip = tripRelatedDocs.filter((d: any) => {
        const docType = String(d?.doc_type || d?.category || '').toUpperCase();
        const title = String(d?.title || '').toUpperCase();
        return (
          docType.includes('POD') ||
          docType.includes('PROOF') ||
          docType.includes('DELIVERY') ||
          docType.includes('WAYBILL') ||
          title.includes('POD')
        );
      });

      const hasDriverUploadedPOD = podDocsForTrip.length > 0 || Boolean((t as any).pod_photo_url);

      if (hasDriverUploadedPOD && (t.status === 'Completed' || t.status === 'AtDelivery' || t.status === 'InTransit')) {
        items.push({
          id: `pod-${t.id}`,
          category: 'pod',
          priority: 'attention',
          badgeLabel: 'POD READY',
          entityType: 'company',
          entityName: customerName,
          initials: getInitials(customerName),
          tripRef,
          subtitle: `${tripRef} • ${podDocsForTrip.length || 1} Photo(s) Received`,
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
          subtitle: `${tripRef} • Check ${stops[0]?.location_name || 'Origin'} coordinates`,
          trip: t,
        });
      }
    });

    // E. Document Expiration Reminders
    docs.forEach((doc: any) => {
      if (!doc.expiry_date) return;
      const days = daysUntil(doc.expiry_date);
      if (days !== null && days <= 30) {
        const isExpired = days <= 0;
        const badgeLabel = isExpired ? 'EXPIRED' : 'EXPIRING';
        const docName = documentDisplayName(doc);
        const daysText = isExpired ? (days === 0 ? 'Expires today' : `${Math.abs(days)}d overdue`) : `${days}d left`;

        let entityType: 'company' | 'driver' | 'vehicle' = 'company';
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
          subtitle: `${docName} • ${daysText}`,
          doc,
          daysRemaining: days,
        });
      }
    });

    const priorityRank: Record<PriorityLevel, number> = { critical: 1, attention: 2, other: 3 };
    return items.sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority]);
  }, [tripsQuery.data, docsQuery.data, driversQuery.data, vehiclesQuery.data]);

  const counts = useMemo(() => {
    return {
      all: actionItems.length,
      delay: actionItems.filter((i) => i.category === 'delay').length,
      unassigned: actionItems.filter((i) => i.category === 'unassigned').length,
      pod: actionItems.filter((i) => i.category === 'pod').length,
      doc: actionItems.filter((i) => i.category === 'doc').length,
      location: actionItems.filter((i) => i.category === 'location').length,
    };
  }, [actionItems]);

  const filteredItems = useMemo(() => {
    if (activeCategoryFilter === 'all') return actionItems;
    return actionItems.filter((item) => item.category === activeCategoryFilter);
  }, [actionItems, activeCategoryFilter]);

  const refetchAll = () => {
    tripsQuery.refetch();
    docsQuery.refetch();
    driversQuery.refetch();
    vehiclesQuery.refetch();
  };

  return {
    actionItems,
    filteredItems,
    counts,
    isLoading,
    isError,
    activeCategoryFilter,
    setActiveCategoryFilter,
    drivers: driversQuery.data ?? [],
    vehicles: vehiclesQuery.data ?? [],
    refetchAll,
  };
}
