/* eslint-disable @typescript-eslint/no-explicit-any */
/** The trip fields the expense editor needs. */
export interface PickedTrip {
  id: string;
  ref_id: string | null;
  is_third_party: boolean;
  vehicleId: string | null;
  driverId: string | null;
  plate: string | null;
  driver: string | null;
  customer: string | null;
  day: string | null;
}

export function toPickedTrip(t: any): PickedTrip {
  return {
    id: t.id,
    ref_id: t.ref_id ?? null,
    is_third_party: Boolean(t.is_third_party),
    vehicleId: t.vehicleId ?? t.vehicle?.id ?? null,
    driverId: t.driverId ?? t.driver?.id ?? null,
    plate: t.vehicle?.plate_number ?? null,
    driver: t.driver ? `${t.driver.first_name ?? ''} ${t.driver.last_name ?? ''}`.trim() || null : null,
    customer: t.customer?.name ?? null,
    day: t.actual_start || t.planned_start || t.createdAt || null,
  };
}

