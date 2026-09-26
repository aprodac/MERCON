import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Truck,
  AlertTriangle,
  Calendar as CalendarIcon,
  MoreHorizontal,
  Edit2,
  Trash2,
} from 'lucide-react';
import { Driver, driverService } from '@/services/driverService';
import DriverAvatar from '@/components/ui/DriverAvatar';
import PhoneDisplay from '@/components/ui/PhoneDisplay';
import StatusBadge from '@/components/ui/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { WhatsAppIcon } from '@/components/ui/whatsapp-icon';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatInDeploymentTz } from '@/lib/datetime';
import { getUpcomingScheduledDates } from '@/utils/scheduleUtils';
import { cn } from '@/lib/utils';

/** GPS status cell shared by the "GPS" column — mirrors the Kanban card's location states. */
function GpsStatusCell({ driver }: { driver: Driver }) {
  const activeTrip = driver.trips?.[0];
  const vehicle = driver.assignedVehicle || activeTrip?.vehicle;
  const resolvedLoc = vehicle?.resolved_location;

  if (!vehicle || !activeTrip) {
    return <span className="text-[10px] text-slate-300 dark:text-slate-600">—</span>;
  }

  if (!resolvedLoc || resolvedLoc.display_state === 'UNAVAILABLE') {
    return (
      <div className="flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600 shrink-0" />
        <span className="text-[10.5px] font-semibold text-slate-400 dark:text-slate-500">Not Active</span>
      </div>
    );
  }

  const isCurrent = resolvedLoc.display_state === 'CURRENT';
  const timeAgo = resolvedLoc.formatted_time_ago;

  return (
    <div className="flex items-center gap-1.5" title={isCurrent ? 'Live GPS' : 'Last known GPS location'}>
      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', isCurrent ? 'bg-emerald-500' : 'bg-amber-500')} />
      <span className={cn('text-[10.5px] font-semibold', isCurrent ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400')}>
        {isCurrent ? 'Live' : 'Last seen'}{timeAgo ? ` · ${timeAgo}` : ''}
      </span>
    </div>
  );
}

export interface UseDriverTableColumnsOptions {
  tz: string;
  onPreviewDriver: (driver: Driver) => void;
  onWhatsappShare: (driver: Driver) => void;
  setConfirmModal: (modal: {
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void | Promise<void>;
    isDestructive?: boolean;
  }) => void;
}

export function useDriverTableColumns({
  tz,
  onPreviewDriver,
  onWhatsappShare,
  setConfirmModal,
}: UseDriverTableColumnsOptions) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return useMemo(
    () => [
      {
        header: 'Driver ID',
        accessor: (row: Driver) => (
          <div className="flex flex-col">
            <span className="font-mono text-xs font-bold text-brand">
              {row.ref_id || `DRV-${row.id.slice(0, 5).toUpperCase()}`}
            </span>
            <span className="text-[10px] text-slate-400 font-medium">
              Reg: {formatInDeploymentTz(row.createdAt, tz, 'MM/dd/yyyy')}
            </span>
          </div>
        ),
      },
      {
        header: 'Driver Name & Phone',
        accessor: (row: Driver) => (
          <div className="flex items-center gap-3">
            <DriverAvatar
              src={row.avatar_url}
              firstName={row.first_name}
              lastName={row.last_name}
              size="sm"
              status={row.status}
              showStatusDot
              previewable
              onPreview={() => onPreviewDriver(row)}
            />
            <div className="flex flex-col">
              <span
                className="font-bold text-slate-900 text-xs hover:text-brand transition-colors cursor-pointer"
                onClick={() => navigate(`/drivers/${row.id}`)}
              >
                {row.first_name} {row.last_name}
              </span>
              <PhoneDisplay phone={row.phone_primary} variant="compact" />
            </div>
          </div>
        ),
      },
      {
        header: 'Assigned Vehicle',
        accessor: (row: Driver) => {
          const activeTrip = row.trips?.[0];
          const vehicle = row.assignedVehicle || activeTrip?.vehicle;

          if (!vehicle) {
            return (
              <span className="text-xs text-slate-400 dark:text-slate-500 font-medium italic">
                Unassigned
              </span>
            );
          }

          return (
            <div className="flex items-center gap-2">
              <Truck className="w-4 h-4 text-slate-600 shrink-0" />
              <div className="flex flex-col">
                <span
                  className="font-bold text-xs text-slate-800 dark:text-slate-200 hover:text-brand transition-colors cursor-pointer"
                  onClick={() => navigate(`/vehicles/${vehicle.id}`)}
                >
                  {vehicle.plate_number}
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {vehicle.ref_id || vehicle.asset_type || 'Vehicle'}
                </span>
              </div>
            </div>
          );
        },
      },
      {
        header: 'GPS',
        accessor: (row: Driver) => <GpsStatusCell driver={row} />,
      },
      {
        header: 'Capacity',
        accessor: (row: Driver) => {
          const activeTrip = row.trips?.[0];
          const vehicle = row.assignedVehicle || activeTrip?.vehicle;

          if (!vehicle?.capacity_kg) {
            return <span className="text-xs text-slate-300 dark:text-slate-600">—</span>;
          }

          return (
            <Badge className="bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/30 dark:text-orange-400 dark:border-orange-900/50 text-xs font-extrabold font-mono py-1 px-2.5 gap-1">
              <Truck className="w-3 h-3" />
              {(vehicle.capacity_kg / 1000).toLocaleString()} Ton
            </Badge>
          );
        },
      },
      {
        header: 'License Details',
        accessor: (row: Driver) => {
          const isExpired = new Date(row.license_expiry) < new Date();
          return (
            <div className="flex flex-col gap-0.5">
              <span className="font-mono text-xs font-semibold text-slate-700">
                {row.license_number || 'N/A'}
              </span>
              <div className="flex items-center gap-1">
                {isExpired ? (
                  <Badge
                    variant="outline"
                    className="bg-rose-50 text-rose-600 border-rose-200 text-[10px] font-bold py-0 px-1.5 gap-1"
                  >
                    <AlertTriangle className="w-2.5 h-2.5 text-rose-500" />
                    Expired ({formatInDeploymentTz(row.license_expiry, tz, 'MM/dd/yyyy')})
                  </Badge>
                ) : (
                  <span className="text-[10px] text-slate-500">
                    Exp: {formatInDeploymentTz(row.license_expiry, tz, 'MM/dd/yyyy')}
                  </span>
                )}
              </div>
            </div>
          );
        },
      },
      {
        header: 'Duty Status',
        accessor: (row: Driver) => <StatusBadge status={row.status} />,
      },
      {
        header: 'Total Driver Charges',
        accessor: (row: Driver) => (
          <span
            className="font-mono text-xs font-bold text-slate-500 dark:text-slate-400"
            title="Lifetime driver payout across every trip on record — not what customers were billed"
          >
            {row.total_trip_charges
              ? `SAR ${Number(row.total_trip_charges).toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}`
              : '—'}
          </span>
        ),
      },
      {
        header: 'Scheduled Days',
        accessor: (row: Driver) => {
          const scheduledDates = getUpcomingScheduledDates(row.trips);
          if (scheduledDates.length === 0) {
            return <span className="text-xs text-slate-400 font-medium italic">None</span>;
          }
          return (
            <div className="flex items-center gap-1 flex-wrap max-w-[200px]">
              {scheduledDates.slice(0, 3).map((item, idx) => (
                <Badge
                  key={idx}
                  variant="outline"
                  className="bg-indigo-50/80 text-indigo-700 border-indigo-200/80 text-[10px] font-semibold py-0.5 px-1.5 gap-1 shrink-0"
                  title={`Trip ${item.tripRef || ''}`}
                >
                  <CalendarIcon className="w-2.5 h-2.5 text-indigo-500" />
                  {item.formattedDate}
                </Badge>
              ))}
              {scheduledDates.length > 3 && (
                <Badge
                  variant="outline"
                  className="bg-slate-100 text-slate-600 text-[10px] font-medium py-0.5 px-1"
                >
                  +{scheduledDates.length - 3}
                </Badge>
              )}
            </div>
          );
        },
      },
      {
        header: 'Actions',
        headerClassName: 'text-right',
        accessor: (row: Driver) => (
          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => onWhatsappShare(row)}
              title="Share to WhatsApp"
              className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors cursor-pointer"
            >
              <WhatsAppIcon className="w-3.5 h-3.5" />
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 dark:text-slate-400 transition-colors focus:outline-none cursor-pointer"
                  title="Driver Actions"
                  aria-label="Driver Actions"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-44 p-1.5 shadow-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl"
              >
                <DropdownMenuItem
                  onClick={() => navigate(`/drivers/${row.id}/edit`)}
                  className="cursor-pointer text-xs font-medium py-1.5 px-2 rounded-md"
                >
                  <Edit2 className="mr-2 h-3.5 w-3.5 text-amber-600" />
                  Edit Driver Profile
                </DropdownMenuItem>

                <DropdownMenuSeparator className="my-1 border-slate-100 dark:border-slate-800" />

                <DropdownMenuItem
                  onClick={async () => {
                    const driverName = `${row.first_name} ${row.last_name}`;
                    let message = `Are you sure you want to delete driver ${driverName}?`;
                    try {
                      const usage = await driverService.getUsage(row.id);
                      const parts: string[] = [];
                      if (usage.totalTrips > 0)
                        parts.push(
                          `${usage.totalTrips} trip${usage.totalTrips === 1 ? '' : 's'}${
                            usage.activeTrips > 0 ? ` (${usage.activeTrips} active)` : ''
                          }`
                        );
                      if (usage.expenses > 0)
                        parts.push(`${usage.expenses} expense${usage.expenses === 1 ? '' : 's'}`);
                      message =
                        parts.length > 0
                          ? `${driverName} has ${parts.join(
                              ' and '
                            )} linked to them. Deleting archives the record — history will keep showing them, marked as Deleted.`
                          : `${driverName} has no linked trips or records. This will archive the record.`;
                    } catch {
                      // Usage lookup failed — fall back to the generic prompt below rather than blocking the delete flow.
                    }
                    setConfirmModal({
                      isOpen: true,
                      title: 'Delete Driver Record',
                      message,
                      isDestructive: true,
                      onConfirm: async () => {
                        try {
                          await driverService.bulkDelete([row.id]);
                          toast.success(`Driver ${driverName} deleted successfully`);
                          queryClient.invalidateQueries({ queryKey: ['drivers'] });
                        } catch (err: any) {
                          toast.error(
                            err?.response?.data?.error?.message || 'Failed to delete driver'
                          );
                        }
                      },
                    });
                  }}
                  className="cursor-pointer text-xs font-medium py-1.5 px-2 rounded-md text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                >
                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                  Delete Driver
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      },
    ],
    [tz, navigate, queryClient, onPreviewDriver, onWhatsappShare, setConfirmModal]
  );
}
