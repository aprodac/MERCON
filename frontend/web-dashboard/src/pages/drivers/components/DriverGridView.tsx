import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  X,
  Truck,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import { Driver } from '@/services/driverService';
import DriverAvatar from '@/components/ui/DriverAvatar';
import StatusBadge from '@/components/ui/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatInDeploymentTz } from '@/lib/datetime';
import { cn } from '@/lib/utils';
import { DriverFilterToolbar } from './DriverFilterToolbar';

/** GPS status row — mirrors the states shown on the Kanban card and driver table's GPS column. */
function DriverGpsStatus({ driver }: { driver: Driver }) {
  const activeTrip = driver.trips?.[0];
  const vehicle = driver.assignedVehicle || activeTrip?.vehicle;
  const resolvedLoc = vehicle?.resolved_location;

  if (!vehicle || !activeTrip) return null;

  if (!resolvedLoc || resolvedLoc.display_state === 'UNAVAILABLE') {
    return (
      <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
        <span className="font-medium text-slate-400 dark:text-slate-500">GPS:</span>
        <span className="flex items-center gap-1.5 font-semibold text-slate-400 dark:text-slate-500">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600" />
          Not Active
        </span>
      </div>
    );
  }

  const isCurrent = resolvedLoc.display_state === 'CURRENT';

  return (
    <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
      <span className="font-medium text-slate-400 dark:text-slate-500">GPS:</span>
      <span className={cn('flex items-center gap-1.5 font-semibold', isCurrent ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400')}>
        <span className={cn('w-1.5 h-1.5 rounded-full', isCurrent ? 'bg-emerald-500' : 'bg-amber-500')} />
        {isCurrent ? 'Live' : 'Last seen'}{resolvedLoc.formatted_time_ago ? ` · ${resolvedLoc.formatted_time_ago}` : ''}
      </span>
    </div>
  );
}

export interface DriverGridViewProps {
  drivers: Driver[];
  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: string;
  totalCount: number;
  currentPage: number;
  totalPages: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  tz: string;
  onPreviewDriver: (driver: Driver) => void;
  search: string;
  onSearchChange: (val: string) => void;
  filterToolbar: React.ReactNode;
  headerActions?: React.ReactNode;
}

export function DriverGridView({
  drivers,
  isLoading = false,
  isError = false,
  errorMessage = 'Failed to load drivers.',
  totalCount,
  currentPage,
  totalPages,
  pageSize,
  onPageChange,
  onPageSizeChange,
  tz,
  onPreviewDriver,
  search,
  onSearchChange,
  filterToolbar,
  headerActions,
}: DriverGridViewProps) {
  const navigate = useNavigate();

  const gridPageSizeOptions = [10, 25, 50, 100];
  const gridFromIndex = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const gridToIndex = totalCount === 0 ? 0 : gridFromIndex + drivers.length - 1;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden flex flex-col w-full animate-fade-in">
      {/* Toolbar: matches the list view's search bar & filters, placed above the grid */}
      <div className="shrink-0 p-3 sm:p-4 border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 flex flex-col gap-3">
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3 w-full">
          <div className="flex items-center gap-2.5 sm:gap-3 flex-1 flex-wrap min-w-0">
            <div className="flex items-center gap-2 shrink-0">
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-500" />
                <span>Driver Ledger</span>
              </h3>
              <Badge
                variant="outline"
                className="bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 text-[11px] font-mono font-bold px-2 py-0.5"
              >
                {totalCount} {totalCount === 1 ? 'record' : 'records'}
              </Badge>
            </div>

            <DriverFilterToolbar
              search={search}
              onSearchChange={onSearchChange}
              showSearchOnly
              selectedStatus="All"
              onStatusChange={() => {}}
              licenseFilter="All"
              onLicenseFilterChange={() => {}}
              sortOrder="latest"
              onSortOrderChange={() => {}}
            />
          </div>

          <div className="flex w-full xl:w-auto items-center flex-wrap gap-2 sm:shrink-0 xl:ml-auto rounded-lg border border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-950/30 p-1.5">
            {filterToolbar}
            {headerActions}
          </div>
        </div>
      </div>

      {/* Grid Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 p-4 sm:p-5">
        {isLoading ? (
          Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-100 p-4 h-[120px] skeleton"></div>
          ))
        ) : isError ? (
          <div className="col-span-full py-16 flex flex-col items-center justify-center">
            <div className="w-14 h-14 rounded-2xl bg-rose-50 flex items-center justify-center text-rose-500 mb-2">
              <X size={28} />
            </div>
            <p className="text-sm font-bold text-slate-900">Data Unavailable</p>
            <p className="text-xs text-slate-500 mt-1">{errorMessage}</p>
          </div>
        ) : drivers.length === 0 ? (
          <div className="col-span-full py-16 flex flex-col items-center justify-center">
            <p className="text-sm font-bold text-slate-900">No Records Found</p>
            <p className="text-xs text-slate-500 mt-1">There are no drivers matching your current filters.</p>
          </div>
        ) : (
          drivers.map((d) => {
            const isExpired = new Date(d.license_expiry) < new Date();
            return (
              <div
                key={d.id}
                className="bg-white dark:bg-slate-900 rounded-xl border border-black/[0.08] dark:border-slate-800 p-4 shadow-2xs flex flex-col justify-between gap-3 hover:border-brand/40 hover:-translate-y-0.5 hover:shadow-xs transition-all duration-150 ease-in-out cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
                tabIndex={0}
                role="button"
                aria-label={`Driver: ${d.first_name} ${d.last_name}, status: ${d.status}`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    navigate(`/drivers/${d.id}`);
                  }
                }}
                onClick={() => navigate(`/drivers/${d.id}`)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <DriverAvatar
                      src={d.avatar_url}
                      firstName={d.first_name}
                      lastName={d.last_name}
                      size="md"
                      previewable
                      onPreview={() => onPreviewDriver(d)}
                    />
                    <div className="flex flex-col">
                      <span className="font-bold text-slate-950 dark:text-slate-50 text-sm">
                        {d.first_name} {d.last_name}
                      </span>
                      <span className="font-mono text-[11px] text-brand font-bold">
                        {d.ref_id || `DRV-${d.id.slice(0, 5).toUpperCase()}`}
                      </span>
                    </div>
                  </div>
                  <StatusBadge status={d.status} />
                </div>

                <div className="space-y-1.5 py-2 border-y border-slate-100 dark:border-slate-800 text-xs">
                  <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
                    <span className="font-medium text-slate-400 dark:text-slate-500">Phone:</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{d.phone_primary}</span>
                  </div>
                  <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
                    <span className="font-medium text-slate-400 dark:text-slate-500">Vehicle:</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {(d.assignedVehicle || d.trips?.[0]?.vehicle)?.plate_number || 'Unassigned'}
                    </span>
                  </div>
                  <DriverGpsStatus driver={d} />
                  {(() => {
                    const vehicle = d.assignedVehicle || d.trips?.[0]?.vehicle;
                    if (!vehicle?.capacity_kg) return null;
                    return (
                      <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
                        <span className="font-medium text-slate-400 dark:text-slate-500">Capacity:</span>
                        <Badge className="bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/30 dark:text-orange-400 dark:border-orange-900/50 text-[10px] font-extrabold font-mono py-0.5 px-2 gap-1">
                          <Truck className="w-2.5 h-2.5" />
                          {(vehicle.capacity_kg / 1000).toLocaleString()} Ton
                        </Badge>
                      </div>
                    );
                  })()}
                  <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
                    <span className="font-medium text-slate-400 dark:text-slate-500">License:</span>
                    <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                      {d.license_number || 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
                    <span className="font-medium text-slate-400 dark:text-slate-500">Expiry:</span>
                    <span
                      className={`font-medium ${
                        isExpired ? 'text-rose-600 font-bold' : 'text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {formatInDeploymentTz(d.license_expiry, tz, 'MM/dd/yyyy')}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-end pt-1">
                  <Button variant="outline" size="sm" className="h-7 text-xs font-semibold">
                    View Profile
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination Footer */}
      <div className="shrink-0 p-3 sm:p-4 sm:px-5 border-t border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-50/60 dark:bg-slate-900/60 text-xs font-semibold text-slate-600 dark:text-slate-400">
        <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-slate-500 dark:text-slate-400 font-medium">
              <span className="hidden sm:inline">Rows per page:</span>
              <span className="sm:hidden">Rows:</span>
            </span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="h-8 px-2.5 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand/20 cursor-pointer shadow-xs"
              aria-label="Rows per page"
            >
              {gridPageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          <span className="text-slate-500 dark:text-slate-400 font-medium border-l border-slate-200 dark:border-slate-700 pl-4 hidden sm:inline">
            Showing <span className="font-extrabold text-slate-900 dark:text-slate-100">{gridFromIndex}</span> to{' '}
            <span className="font-extrabold text-slate-900 dark:text-slate-100">{gridToIndex}</span> of{' '}
            <span className="font-extrabold text-slate-900 dark:text-slate-100">{totalCount}</span> entries
          </span>
        </div>

        <div className="flex items-center gap-1.5 ml-auto" role="navigation" aria-label="Pagination Navigation">
          <button
            onClick={() => onPageChange(1)}
            disabled={currentPage === 1 || isLoading}
            aria-label="First page"
            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            <ChevronsLeft size={14} />
          </button>

          <button
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1 || isLoading}
            aria-label="Previous page"
            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            <ChevronLeft size={14} />
          </button>

          <div className="flex items-center gap-1 px-2" aria-live="polite">
            <span className="px-2.5 py-1 text-xs font-extrabold text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-800 rounded-md border border-slate-200 dark:border-slate-700 shadow-2xs">
              {currentPage}
            </span>
            <span className="text-slate-400 text-xs font-medium">/</span>
            <span className="text-slate-600 dark:text-slate-400 text-xs font-bold">{totalPages}</span>
          </div>

          <button
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage >= totalPages || isLoading}
            aria-label="Next page"
            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            <ChevronRight size={14} />
          </button>

          <button
            onClick={() => onPageChange(totalPages)}
            disabled={currentPage >= totalPages || isLoading}
            aria-label="Last page"
            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            <ChevronsRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
