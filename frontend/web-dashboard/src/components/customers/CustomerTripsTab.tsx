import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Truck, Plus, Search, Eye, ArrowRight, CheckCircle2, Clock, MapPin,
  Calendar, Layers, FileText, AlertTriangle, ExternalLink, X, RotateCw
} from 'lucide-react';
import { tripService, Trip } from '@/services/tripService';
import StatusBadge from '@/components/ui/StatusBadge';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import DataTable from '@/components/ui/DataTable';
import { formatInDeploymentTz, useDeploymentTimezone } from '@/lib/datetime';
import { isRoundTrip, parseTripRouteNodes, getLegEndpoints } from '@mercon/shared-types';

interface CustomerTripsTabProps {
  customerId: string;
  customerName: string;
}

export default function CustomerTripsTab({ customerId, customerName }: CustomerTripsTabProps) {
  const navigate = useNavigate();
  const tz = useDeploymentTimezone();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Fetch trips for this customer only
  const { data: tripsRes, isLoading } = useQuery({
    queryKey: ['trips', 'customer-tab', customerId],
    queryFn: () => tripService.getAll({ customer_id: customerId, per_page: 200 }),
    enabled: !!customerId,
  });

  const trips = useMemo(() => {
    const raw = Array.isArray(tripsRes) ? tripsRes : (tripsRes as any)?.data || [];
    return raw.filter((t: Trip) => t.customer_id === customerId || (t as any).customerId === customerId || t.customer?.id === customerId);
  }, [tripsRes, customerId]);

  // Status Groupings
  const activeTrips = useMemo(() => {
    return trips.filter((t: Trip) => ['Dispatched', 'AtPickup', 'InTransit', 'AtDelivery', 'Loading'].includes(t.status));
  }, [trips]);

  const upcomingTrips = useMemo(() => {
    return trips.filter((t: Trip) => ['Draft', 'Scheduled'].includes(t.status));
  }, [trips]);

  const completedTrips = useMemo(() => {
    return trips.filter((t: Trip) => ['Completed', 'Invoiced'].includes(t.status));
  }, [trips]);

  // Filtered Trips
  const filteredTrips = useMemo(() => {
    return trips.filter((t: Trip) => {
      // Status Filter
      if (statusFilter === 'ACTIVE') {
        if (!['Dispatched', 'AtPickup', 'InTransit', 'AtDelivery', 'Loading'].includes(t.status)) return false;
      } else if (statusFilter === 'UPCOMING') {
        if (!['Draft', 'Scheduled'].includes(t.status)) return false;
      } else if (statusFilter === 'COMPLETED') {
        if (!['Completed', 'Invoiced'].includes(t.status)) return false;
      } else if (statusFilter === 'CANCELLED') {
        if (t.status !== 'Cancelled') return false;
      }

      // Search Filter
      if (search.trim()) {
        const term = search.trim().toLowerCase();
        const refMatch = (t.ref_id || t.id).toLowerCase().includes(term);
        const driverMatch = (t.driver ? `${t.driver.first_name} ${t.driver.last_name}` : t.third_party_driver_name || '').toLowerCase().includes(term);
        const vehicleMatch = (t.vehicle?.plate_number || t.third_party_vehicle_plate || '').toLowerCase().includes(term);
        const stopsStr = (t.stops || []).map((s: any) => s.location_name || '').join(' ').toLowerCase();
        const routeMatch = stopsStr.includes(term) || ((t as any).origin_city || '').toLowerCase().includes(term) || ((t as any).destination_city || '').toLowerCase().includes(term);
        const quoteMatch = (t.quotationId || '').toLowerCase().includes(term);
        if (!refMatch && !driverMatch && !vehicleMatch && !routeMatch && !quoteMatch) return false;
      }

      return true;
    });
  }, [trips, statusFilter, search]);

  return (
    <div className="space-y-6">

      {/* Top Instrument-Panel Operational KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
            <span>In Progress</span>
            <Truck className="w-3.5 h-3.5 text-indigo-600" />
          </div>
          <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400">{activeTrips.length}</div>
          <div className="text-[10px] text-indigo-600 font-semibold flex items-center gap-1">
            <span>Active live dispatches</span>
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
            <span>Upcoming</span>
            <Clock className="w-3.5 h-3.5 text-amber-600" />
          </div>
          <div className="text-2xl font-black text-amber-600 dark:text-amber-400">{upcomingTrips.length}</div>
          <div className="text-[10px] text-amber-600 font-semibold">Planned & scheduled</div>
        </div>

        <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
            <span>Completed</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{completedTrips.length}</div>
          <div className="text-[10px] text-emerald-600 font-semibold">Delivered & invoiced</div>
        </div>

        <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
            <span>Total Freight Trips</span>
            <Layers className="w-3.5 h-3.5 text-slate-500" />
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-slate-100">{trips.length}</div>
          <div className="text-[10px] text-slate-500 font-semibold">All-time trip ledger</div>
        </div>
      </div>

      {/* Main Operational Trip Ledger Card */}
      <Card className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl shadow-2xs">
        <CardHeader className="border-b border-slate-100 dark:border-slate-800 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Truck className="w-4 h-4 text-indigo-600" /> Operational Freight Trips Ledger
            </CardTitle>
            <CardDescription className="text-[11px] mt-0.5">
              Live, planned, and historical trip executions for {customerName}.
            </CardDescription>
          </div>

        </CardHeader>

        <CardContent className="p-4 space-y-4">

          {/* Controls Bar: Search & Status Filter */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50 dark:bg-slate-800/40 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
            <div className="relative w-full sm:w-80">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <Input
                type="text"
                placeholder="Search trip ID, driver, plate, route..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-xs bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded-lg"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Select value={statusFilter} onValueChange={(v: string) => setStatusFilter(v)}>
                <SelectTrigger className="h-8 text-xs bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded-lg w-[160px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Trip Statuses</SelectItem>
                  <SelectItem value="ACTIVE">In Progress Only</SelectItem>
                  <SelectItem value="UPCOMING">Upcoming Only</SelectItem>
                  <SelectItem value="COMPLETED">Completed Only</SelectItem>
                  <SelectItem value="CANCELLED">Cancelled Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Trips Data Table */}
          {isLoading ? (
            <div className="p-8 text-center text-xs text-slate-500 animate-pulse">
              Loading customer freight trips...
            </div>
          ) : filteredTrips.length === 0 ? (
            <div className="p-8 text-center space-y-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800">
              <Truck className="w-7 h-7 text-indigo-600 shrink-0" />
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {trips.length === 0 ? 'No Trips Found' : 'No Active Trips'}
                </h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  {trips.length === 0
                    ? 'This customer has no trips recorded yet.'
                    : `No active or in-progress trips matched your filters. (Historical trips: ${completedTrips.length})`}
                </p>
              </div>
            </div>
          ) : (
            <DataTable
              columns={[
                {
                  header: 'Trip / Job ID',
                  accessor: (t: Trip) => (
                    <div className="space-y-0.5">
                      <span className="font-mono text-xs font-bold text-slate-900 dark:text-slate-100 block">
                        {t.ref_id || `TRIP-${t.id.substring(0, 8)}`}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono block">
                        {formatInDeploymentTz(t.createdAt, tz, 'MMM dd, yyyy')}
                      </span>
                    </div>
                  ),
                },
                {
                  header: 'Operational Route',
                  accessor: (t: Trip) => {
                    const isRound = isRoundTrip(t);
                    const nodes = (Array.isArray((t as any).route_timeline) && (t as any).route_timeline.length >= 2)
                      ? (t as any).route_timeline
                      : parseTripRouteNodes(t);

                    const origin = nodes[0]?.name || (t as any).origin_city || 'Origin';
                    const endpoints0 = getLegEndpoints(t, 0);
                    const dest = (endpoints0.delivery as any)?.name || endpoints0.delivery?.location_name || endpoints0.delivery?.location?.name || nodes[nodes.length - 1]?.name || (t as any).destination_city || 'Destination';

                    const intermediateNodes = endpoints0.intermediates;
                    const via = intermediateNodes.length > 0 ? intermediateNodes.map((n: any) => n.name).filter(Boolean).join(', ') : null;

                    return (
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900 dark:text-slate-100">
                          <span>{origin}</span>
                          <ArrowRight className="w-3 h-3 text-indigo-600 shrink-0" />
                          <span>{dest}</span>
                        </div>
                        {via && (
                          <div className="text-[10px] text-slate-500 font-medium flex items-center gap-1">
                            <span>Via:</span>
                            <span className="font-semibold text-slate-700 dark:text-slate-300">{via}</span>
                          </div>
                        )}
                      </div>
                    );
                  },
                },
                {
                  header: 'Vehicle & Driver',
                  accessor: (t: Trip) => {
                    const driverName = t.is_third_party
                      ? t.third_party_driver_name || t.thirdPartyProvider?.name || '3PL Driver'
                      : t.driver
                      ? `${t.driver.first_name} ${t.driver.last_name}`
                      : 'Unassigned';

                    const plateNo = t.is_third_party
                      ? t.third_party_vehicle_plate || '3PL Truck'
                      : t.vehicle?.plate_number || 'Unassigned';

                    return (
                      <div className="flex flex-col text-xs">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{plateNo}</span>
                        <span className="text-[11px] text-slate-500">{driverName}</span>
                      </div>
                    );
                  },
                },
                {
                  header: 'Commercial Snapshot',
                  accessor: (t: Trip) => {
                    const rate = Number(t.billing_amount || t.applied_rate || t.trip_charges || 0);
                    return (
                      <div className="space-y-0.5">
                        <div className="font-mono font-extrabold text-xs text-indigo-600 dark:text-indigo-400">
                          SAR {rate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        {t.quotationId ? (
                          <span className="text-[10px] text-indigo-600 font-semibold flex items-center gap-0.5">
                            <FileText className="w-2.5 h-2.5" /> Quote Linked
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400 font-medium">Manual Rate</span>
                        )}
                      </div>
                    );
                  },
                },
                {
                  header: 'Status',
                  accessor: (t: Trip) => <StatusBadge status={t.status} />,
                },
                {
                  header: 'Actions',
                  headerClassName: 'text-right',
                  className: 'text-right',
                  accessor: (t: Trip) => (
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(`/trips/${t.id}`)}
                        className="h-7 w-7 p-0 text-slate-500 hover:text-indigo-600"
                        title="View Trip"
                      >
                        <Eye size={14} />
                      </Button>
                      {t.quotationId && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/quotations/${t.quotationId}`)}
                          className="h-7 w-7 p-0 text-indigo-500 hover:text-indigo-700"
                          title="View Linked Quotation"
                        >
                          <ExternalLink size={13} />
                        </Button>
                      )}
                    </div>
                  ),
                },
              ]}
              data={filteredTrips}
              pageSize={10}
              pageSizeOptions={[10, 25, 50]}
              compact={true}
              enableSelection={false}
              emptyTitle="No Trips Match"
              emptyMessage="No trips matched your search filter."
              onRowClick={(t: Trip) => navigate(`/trips/${t.id}`)}
            />
          )}

        </CardContent>
      </Card>

    </div>
  );
}
