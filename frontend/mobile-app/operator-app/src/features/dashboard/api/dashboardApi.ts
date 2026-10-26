/**
 * Dashboard API layer — raw HTTP calls only, no business logic and no shape
 * transformation beyond unwrapping the `{ success, data }` envelope. Talks to
 * the same backend the web dashboard uses (operators authenticate with role
 * Operator, which these routes allow):
 *   GET /reports/summary  → dashboard KPIs
 *   GET /trips            → trip list
 *   GET /vehicles         → vehicle list
 *   GET /drivers          → driver list
 *   GET /documents        → document list (for the Document Expiry section)
 *   GET /auth/me          → the signed-in user's profile
 */
import { api } from '@mercon/mobile-shared/lib/api';
import type { CurrentUser, DashboardSummary, DocumentRef, DriverRef, Trip, VehicleRef } from '../types';

export interface FleetTripCount {
  id: string;
  total_trips: number;
}

export const dashboardApi = {
  async getSummary(): Promise<DashboardSummary> {
    const { data } = await api.get('/reports/summary');
    return data.data as DashboardSummary;
  },

  async getTrips(params: { per_page?: number; status?: string } = {}): Promise<Trip[]> {
    const { data } = await api.get('/trips', { params: { per_page: 100, ...params } });
    return (data.data ?? []) as Trip[];
  },

  async getVehicles(params: { per_page?: number } = {}): Promise<VehicleRef[]> {
    const { data } = await api.get('/vehicles', { params: { per_page: 200, ...params } });
    return (data.data ?? []) as VehicleRef[];
  },

  /**
   * Per-truck count of trips that were on the road at some point in the window:
   * started before it ended, and not finished before it began. Built from /trips
   * rather than /reports/fleet — that one sits behind the Reports module (off on
   * production), so Today / Week / Month all fell back to "right now" (TestFlight 25 Oct).
   */
  async getFleetTripCounts(range: { startDate: string; endDate: string }): Promise<FleetTripCount[]> {
    const base = { lite: 'true', per_page: 500 };
    const [inWindow, endedInWindow] = await Promise.all([
      // Planned in the window, plus anything still open whatever its date.
      api.get('/trips', { params: { ...base, start_date: range.startDate, end_date: range.endDate, include_open: 'true' } }),
      // Planned earlier but finished inside the window.
      api.get('/trips', { params: { ...base, ended_since: range.startDate } }),
    ]);
    const start = new Date(range.startDate).getTime();
    const end = new Date(range.endDate).getTime();
    const seen = new Set<string>();
    const counts = new Map<string, number>();
    for (const t of [...(inWindow.data.data ?? []), ...(endedInWindow.data.data ?? [])] as Trip[]) {
      if (seen.has(t.id) || !t.vehicle?.id || !t.actual_start) continue;
      seen.add(t.id);
      const began = new Date(t.actual_start).getTime();
      const ended = t.actual_end ? new Date(t.actual_end).getTime() : Infinity;
      if (began > end || ended < start) continue;
      counts.set(t.vehicle.id, (counts.get(t.vehicle.id) ?? 0) + 1);
    }
    return [...counts].map(([id, total_trips]) => ({ id, total_trips }));
  },

  async getDrivers(params: { per_page?: number } = {}): Promise<DriverRef[]> {
    const { data } = await api.get('/drivers', { params: { per_page: 200, ...params } });
    return (data.data ?? []) as DriverRef[];
  },

  async getDocuments(params: { entity_type?: string; per_page?: number } = {}): Promise<DocumentRef[]> {
    const { data } = await api.get('/documents', { params: { per_page: 200, ...params } });
    return (data.data ?? []) as DocumentRef[];
  },

  async getCurrentUser(): Promise<CurrentUser> {
    const { data } = await api.get('/auth/me');
    return data.data as CurrentUser;
  },
};
