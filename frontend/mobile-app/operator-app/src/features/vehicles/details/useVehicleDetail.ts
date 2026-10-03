/** Everything the vehicle details screen shows, each part loading (and failing) on its own. */
import { useMemo } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { operatorService } from '../../../lib/operator';
import { vehicleDetailApi, type VehicleDocSlot, type VehicleDocument, type VehicleTrip } from './vehicleDetailApi';

export const vehicleDetailKey = (id: string) => ['vehicles', 'detail', id] as const;

const LIVE = ['Loading', 'InTransit', 'Delayed'];
const UPCOMING = ['Draft', 'Scheduled'];

export type DocState = 'expired' | 'expiring' | 'valid' | 'none';

/** Days until a document expires (negative once expired), in whole days. */
export function daysUntil(iso?: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - Date.now()) / 86_400_000);
}

export type SlotState = DocState | 'missing';
/** A slot's state — the web's getSlotStatusFromDoc: no document = missing, otherwise by expiry (≤30 days = expiring). */
export function slotState(x: VehicleDocSlot): SlotState {
  if (!x.document) return 'missing';
  const days = daysUntil(x.document.expiry_date);
  if (days === null) return 'none';
  if (days <= 0) return 'expired';
  return days <= 30 ? 'expiring' : 'valid';
}

export function docState(d: VehicleDocument): DocState {
  const days = daysUntil(d.expiry_date);
  if (days === null) return 'none';
  if (days < 0) return 'expired';
  if (days <= 30) return 'expiring';
  return 'valid';
}

/** `now` is passed in so the screen decides when time moves (on open and on refresh). */
export function useVehicleDetail(id: string, now: number) {
  const qc = useQueryClient();

  const vehicleQ = useQuery({ queryKey: vehicleDetailKey(id), queryFn: () => vehicleDetailApi.vehicle(id), enabled: Boolean(id) });
  const tzQ = useQuery({ queryKey: ['settings', 'tz'], queryFn: vehicleDetailApi.timezone, staleTime: Infinity });
  const monthQ = useQuery({
    queryKey: [...vehicleDetailKey(id), 'month', tzQ.data],
    queryFn: () => vehicleDetailApi.thisMonth(id, tzQ.data ?? 'Asia/Riyadh'),
    enabled: Boolean(id && tzQ.data),
  });
  const maintenanceQ = useQuery({ queryKey: [...vehicleDetailKey(id), 'maintenance'], queryFn: () => vehicleDetailApi.maintenance(id), enabled: Boolean(id) });

  const slotsQ = useQuery({ queryKey: [...vehicleDetailKey(id), 'doc-slots'], queryFn: () => vehicleDetailApi.docSlots(id), enabled: Boolean(id) });

  const driverId = vehicleQ.data?.assignedDriver?.id;
  // The vehicle payload carries the driver's name and phone only — the photo comes from the driver record.
  const driverQ = useQuery({ queryKey: ['drivers', 'detail', driverId, 'photo'], queryFn: () => operatorService.driverById(driverId!), enabled: Boolean(driverId) });

  const vehicle = vehicleQ.data ?? null;

  const trips = useMemo(() => {
    const all = vehicle?.trips ?? [];
    const current = all.find((t) => LIVE.includes(t.status)) ?? null;
    const byStart = (a: VehicleTrip, b: VehicleTrip) => new Date(a.planned_start ?? 0).getTime() - new Date(b.planned_start ?? 0).getTime();
    const next = current ? null : [...all].filter((t) => UPCOMING.includes(t.status) && new Date(t.planned_start ?? 0).getTime() >= now - 6 * 3600_000).sort(byStart)[0] ?? null;
    const recent = all.filter((t) => t.id !== current?.id && t.id !== next?.id).slice(0, 3);
    return { current, next, recent, total: all.length };
  }, [vehicle?.trips, now]);

  const documents = useMemo(() => {
    const order: Record<DocState, number> = { expired: 0, expiring: 1, valid: 2, none: 3 };
    return [...(vehicle?.documents ?? [])].sort((a, b) => order[docState(a)] - order[docState(b)] || (daysUntil(a.expiry_date) ?? 9e9) - (daysUntil(b.expiry_date) ?? 9e9));
  }, [vehicle?.documents]);
  // The Docs tab mirrors the web: one row per document type (the current document, or missing), not every file ever uploaded.
  const docSlots = useMemo(() => {
    const order: Record<SlotState, number> = { expired: 0, expiring: 1, missing: 2, valid: 3, none: 4 };
    return [...(slotsQ.data ?? [])].sort((a, b) => order[slotState(a)] - order[slotState(b)] || (a.documentType.displayOrder ?? 0) - (b.documentType.displayOrder ?? 0));
  }, [slotsQ.data]);
  // Same rule as the web's "N document(s) need attention": anything not valid / no-expiry, missing included.
  const docsNeedingAttention = slotsQ.data
    ? docSlots.filter((x) => ['expired', 'expiring', 'missing'].includes(slotState(x))).length
    : documents.filter((d) => docState(d) === 'expired' || docState(d) === 'expiring').length;

  const maintenance = useMemo(() => {
    const list = maintenanceQ.data ?? [];
    const open = list.filter((m) => m.status !== 'Completed' && m.status !== 'Cancelled').sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());
    const done = list.filter((m) => m.status === 'Completed').sort((a, b) => new Date(b.service_date || b.start_date).getTime() - new Date(a.service_date || a.start_date).getTime());
    return { open, done, all: [...open, ...done] };
  }, [maintenanceQ.data]);

  const reassign = useMutation({
    mutationFn: (toDriverId: string | null) => vehicleDetailApi.reassignDriver(id, vehicle?.assignedDriver?.id ?? null, toDriverId),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: vehicleDetailKey(id) });
      qc.invalidateQueries({ queryKey: ['drivers'] });
      qc.invalidateQueries({ queryKey: ['vehicles'] });
    },
  });

  return {
    vehicle,
    loading: vehicleQ.isLoading,
    error: vehicleQ.error as Error | null,
    notFound: (vehicleQ.error as any)?.response?.status === 404,
    driverPhoto: driverQ.data?.avatar_url || driverQ.data?.photo_url || null,
    trips,
    documents,
    docSlots,
    docSlotsLoading: slotsQ.isLoading,
    docSlotsError: Boolean(slotsQ.error),
    docsNeedingAttention,
    month: monthQ.data ?? null,
    monthLoading: monthQ.isLoading || tzQ.isLoading,
    monthError: Boolean(monthQ.error),
    maintenance,
    maintenanceLoading: maintenanceQ.isLoading,
    reassign,
    refresh: async () => {
      await Promise.all([vehicleQ.refetch(), monthQ.refetch(), maintenanceQ.refetch(), slotsQ.refetch(), driverId ? driverQ.refetch() : null]);
    },
  };
}
