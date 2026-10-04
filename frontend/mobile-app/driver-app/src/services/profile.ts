/**
 * Driver profile — GET /mobile/profile.
 * current_vehicle is the current trip's truck, else the truck the office
 * assigned to the driver (same rule as GET /mobile/vehicle).
 */
import { api } from '@mercon/mobile-shared/lib/api';

/** Real trip numbers from the server (backend services/driverPerformance.ts). */
export interface DriverStats {
  completed_trips: number;
  /** Completed trips whose final drop-off has both a planned and an actual arrival. */
  on_time_measured_trips: number;
  on_time_trips: number;
  /** null when no completed trip has the times to judge — show "—", not a number. */
  on_time_percentage: number | null;
}

export interface DriverProfile {
  id: string;
  ref_id: string | null;
  name: string;
  first_name: string;
  last_name: string;
  phone_primary: string | null;
  status: string;
  license_number: string;
  license_expiry: string;
  avatar_url?: string | null;
  createdAt: string;
  stats?: DriverStats;

  current_vehicle: { id: string; plate_number: string; asset_type: string } | null;
}

export const profileService = {
  async get(): Promise<DriverProfile> {
    const { data } = await api.get('/mobile/profile');
    return data.data as DriverProfile;
  },
};

/** Up to two initials from a name, for the avatar. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
