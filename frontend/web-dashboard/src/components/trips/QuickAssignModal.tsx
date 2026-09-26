import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Truck, User, AlertCircle, CheckCircle2, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { driverService } from '@/services/driverService';
import { vehicleService } from '@/services/vehicleService';
import { tripService, Trip } from '@/services/tripService';
import { toast } from 'sonner';
import { formatDriverDetails } from '@/utils/driverStatusUtils';

interface QuickAssignModalProps {
  isOpen: boolean;
  onClose: () => void;
  trip: Trip | any | null;
  onSaved?: () => void;
}

export default function QuickAssignModal({ isOpen, onClose, trip, onSaved }: QuickAssignModalProps) {
  const queryClient = useQueryClient();

  const [selectedDriverId, setSelectedDriverId] = useState<string>('');
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');

  useEffect(() => {
    if (trip) {
      setSelectedDriverId(trip.driver?.id || trip.driverId || '');
      setSelectedVehicleId(trip.vehicle?.id || trip.vehicleId || '');
    } else {
      setSelectedDriverId('');
      setSelectedVehicleId('');
    }
  }, [trip, isOpen]);

  // Fetch drivers list
  const { data: driversRes, isLoading: isLoadingDrivers } = useQuery({
    queryKey: ['drivers-quick-assign'],
    queryFn: () => driverService.getAll({ per_page: 500, mode: 'lookup' }),
    enabled: isOpen,
  });

  // Fetch vehicles list
  const { data: vehiclesRes, isLoading: isLoadingVehicles } = useQuery({
    queryKey: ['vehicles-quick-assign'],
    queryFn: () => vehicleService.getAll({ per_page: 500, mode: 'lookup' }),
    enabled: isOpen,
  });

  const driverOptions = (driversRes?.data || []).map((d) => {
    const details = formatDriverDetails(d);
    const phoneStr = (d as any).phone || d.phone_primary || '';

    return {
      value: d.id,
      label: `${d.first_name} ${d.last_name} (${details})`,
      keywords: `${d.first_name} ${d.last_name} ${phoneStr} ${details} ${d.status || ''}`,
    };
  });

  const vehicleOptions = (vehiclesRes?.data || []).map((v) => ({
    value: v.id,
    label: `${v.plate_number} • ${(v as any).type || v.asset_type || 'Truck'} (${(v.capacity_kg ? v.capacity_kg / 1000 : 0).toFixed(0)}T)`,
    keywords: `${v.plate_number} ${(v as any).type || ''} ${v.asset_type || ''}`,
  }));

  const assignMutation = useMutation({
    mutationFn: async () => {
      if (!trip?.id && !trip?.rawId) throw new Error('No trip selected');
      const tripId = trip.id || trip.rawId;
      return tripService.dispatch(tripId, {
        driver_id: selectedDriverId || undefined,
        vehicle_id: selectedVehicleId || undefined,
      });
    },
    onSuccess: () => {
      toast.success(`Successfully assigned resources to ${trip?.ref_id || 'Trip'}`);
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-trips'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      onSaved?.();
      onClose();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message || 'Failed to assign resources to trip');
    },
  });

  if (!trip) return null;

  const isUuidVal = (str?: string | null) =>
    str ? /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str.trim()) : false;

  const getStopLoc = (stop: any, fallback: string) => {
    if (!stop) return fallback;
    const code = stop.location?.codes?.[0] || stop.location?.code;
    const locName = !isUuidVal(stop.location?.name) ? stop.location?.name : null;
    const locCity = !isUuidVal(stop.location?.city) ? stop.location?.city : null;
    const rawLocName = !isUuidVal(stop.location_name) ? stop.location_name : null;
    return code || locName || locCity || rawLocName || fallback;
  };

  const tripRef = trip.ref_id || trip.id || 'TRIP';
  const customerName = trip.customer?.name || trip.customerName || 'Customer';
  const origin = getStopLoc(trip.stops?.[0], !isUuidVal(trip.pickup) ? trip.pickup! : !isUuidVal(trip.origin_city) ? trip.origin_city! : 'Origin');
  const dest = getStopLoc(trip.stops?.[trip.stops?.length - 1], !isUuidVal(trip.dropoff) ? trip.dropoff! : !isUuidVal(trip.destination_city) ? trip.destination_city! : 'Destination');

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 p-5 rounded-2xl space-y-4">
        <DialogHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
          <DialogTitle className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Truck className="w-4 h-4 text-indigo-600" /> Quick Dispatch Assignment
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500 mt-1">
            Assign available fleet driver and vehicle to trip <span className="font-mono font-bold text-indigo-600">{tripRef}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200/80 dark:border-slate-800 text-xs space-y-1">
          <div className="flex justify-between font-bold text-slate-900 dark:text-slate-100">
            <span>{customerName}</span>
            <span className="font-mono text-indigo-600">{tripRef}</span>
          </div>
          <div className="text-slate-500 font-medium">{origin} → {dest}</div>
        </div>

        <div className="space-y-4 text-xs">
          {/* Driver Selection */}
          <div className="space-y-1.5">
            <label className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-indigo-600" /> Assign Driver (Available Fleet)
            </label>
            <Combobox
              value={selectedDriverId}
              onChange={setSelectedDriverId}
              options={driverOptions}
              placeholder={isLoadingDrivers ? "Loading drivers..." : "Select available driver..."}
              searchPlaceholder="Search driver name or phone..."
              emptyText="No available drivers found in fleet."
            />
          </div>

          {/* Vehicle Selection */}
          <div className="space-y-1.5">
            <label className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Truck className="w-3.5 h-3.5 text-indigo-600" /> Assign Vehicle (Available Fleet)
            </label>
            <Combobox
              value={selectedVehicleId}
              onChange={setSelectedVehicleId}
              options={vehicleOptions}
              placeholder={isLoadingVehicles ? "Loading vehicles..." : "Select available vehicle..."}
              searchPlaceholder="Search vehicle plate number..."
              emptyText="No available vehicles found in fleet."
            />
          </div>
        </div>

        <DialogFooter className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            className="text-xs font-bold"
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={(!selectedDriverId && !selectedVehicleId) || assignMutation.isPending}
            onClick={() => assignMutation.mutate()}
            className="text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs"
          >
            {assignMutation.isPending ? 'Confirming...' : 'Confirm Assignment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
