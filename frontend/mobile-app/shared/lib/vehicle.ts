/** Driver's assigned vehicle (from the current active trip) — GET /mobile/vehicle. */
import { useCallback, useEffect, useState } from 'react';
import { api, getApiErrorMessage } from './api';

export interface ActiveMaintenance {
  id: string;
  status: string;
  maintenance_type: string;
  workshop_name: string;
  start_date: string;
  end_date: string | null;
}

export interface AssignedVehicle {
  id: string;
  ref_id: string | null;
  plate_number: string;
  asset_type: string;
  status: string;
  capacity_kg: number;
  current_odometer: number;
  trailer_number: string | null;
  trailer_type: string | null;
  trip_ref_id: string | null;
  /** Active or upcoming maintenance window for this vehicle, if any. */
  active_maintenance?: ActiveMaintenance | null;
}

export function useAssignedVehicle() {
  const [vehicle, setVehicle] = useState<AssignedVehicle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/mobile/vehicle');
      setVehicle((data.data ?? null) as AssignedVehicle | null);
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  return { vehicle, loading, error, refetch };
}
