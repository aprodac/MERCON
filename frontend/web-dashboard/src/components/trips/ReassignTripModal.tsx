import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { User, Truck, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Combobox, ComboboxOption } from '@/components/ui/combobox';
import { driverService } from '@/services/driverService';
import { vehicleService } from '@/services/vehicleService';
import { tripService, Trip } from '@/services/tripService';
import { formatDriverDetails } from '@/utils/driverStatusUtils';

export type ReassignMode = 'driver' | 'truck' | 'both';

interface ReassignTripModalProps {
  isOpen: boolean;
  onClose: () => void;
  trip: Trip;
  initialMode?: ReassignMode;
}

export function ReassignTripModal({
  isOpen,
  onClose,
  trip,
  initialMode = 'driver',
}: ReassignTripModalProps) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<ReassignMode>(initialMode);
  const [selectedDriverId, setSelectedDriverId] = useState<string>('');
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');
  const [reassignmentReason, setReassignmentReason] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Sync mode and selections when modal opens or trip changes
  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setSelectedDriverId(trip?.driver?.id || '');
      setSelectedVehicleId(trip?.vehicle?.id || '');
      setReassignmentReason('');
      setErrorMsg(null);
    }
  }, [isOpen, initialMode, trip]);

  // Fetch drivers
  const { data: driversRes, isLoading: isLoadingDrivers } = useQuery({
    queryKey: ['drivers-reassign'],
    queryFn: () => driverService.getAll({ per_page: 500, mode: 'lookup' }),
    enabled: isOpen,
  });

  // Fetch vehicles
  const { data: vehiclesRes, isLoading: isLoadingVehicles } = useQuery({
    queryKey: ['vehicles-reassign'],
    queryFn: () => vehicleService.getAll({ per_page: 500, mode: 'lookup' }),
    enabled: isOpen,
  });

  const availableDrivers = driversRes?.data || [];
  const availableVehicles = vehiclesRes?.data || [];

  const driverOptions = useMemo<ComboboxOption[]>(() => {
    const list: ComboboxOption[] = [];

    // If current driver exists, include them in options list
    if (trip?.driver) {
      list.push({
        value: trip.driver.id,
        label: `${trip.driver.first_name} ${trip.driver.last_name} (Current Driver)`,
        keywords: `${trip.driver.first_name} ${trip.driver.last_name} current`,
      });
    }

    availableDrivers.forEach((d) => {
      if (d.id !== trip?.driver?.id) {
        const detailsStr = formatDriverDetails(d);

        list.push({
          value: d.id,
          label: `${d.first_name} ${d.last_name} (${detailsStr})`,
          keywords: `${d.first_name} ${d.last_name} ${d.phone_primary || ''} ${detailsStr} ${d.status || ''}`,
        });
      }
    });

    return list;
  }, [trip?.driver, availableDrivers]);

  const vehicleOptions = useMemo<ComboboxOption[]>(() => {
    const list: ComboboxOption[] = [];

    // If current vehicle exists, include it in options list
    if (trip?.vehicle) {
      list.push({
        value: trip.vehicle.id,
        label: `${trip.vehicle.plate_number} (${trip.vehicle.asset_type}) - (Current Truck)`,
        keywords: `${trip.vehicle.plate_number} ${trip.vehicle.asset_type} current`,
      });
    }

    availableVehicles.forEach((v) => {
      if (v.id !== trip?.vehicle?.id) {
        const capacityText = v.capacity_kg ? ` • ${(v.capacity_kg / 1000).toFixed(1)}t` : '';
        list.push({
          value: v.id,
          label: `${v.plate_number} (${v.asset_type}${capacityText})`,
          keywords: `${v.plate_number} ${v.asset_type}`,
        });
      }
    });

    return list;
  }, [trip?.vehicle, availableVehicles]);

  const reassignMutation = useMutation({
    mutationFn: async (payload: { driver_id?: string; vehicle_id?: string; reason?: string }) => {
      if (payload.driver_id && !payload.vehicle_id) {
        return tripService.replaceDriver(trip.id, payload.driver_id, payload.reason);
      }
      return tripService.dispatch(trip.id, payload);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['trip', trip.id] });
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      queryClient.invalidateQueries({ queryKey: ['drivers'] });
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });

      let successMessage = 'Trip asset reassigned successfully';
      if (variables.driver_id && variables.vehicle_id) {
        successMessage = 'Driver and Truck reassigned successfully';
      } else if (variables.driver_id) {
        successMessage = 'Driver reassigned successfully';
      } else if (variables.vehicle_id) {
        successMessage = 'Truck reassigned successfully';
      }

      toast.success(successMessage);
      onClose();
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error?.message || err.message || 'Failed to reassign trip asset';
      setErrorMsg(msg);
      toast.error(msg);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const payload: { driver_id?: string; vehicle_id?: string; reason?: string } = {
      reason: reassignmentReason.trim() || undefined,
    };

    if (mode === 'driver' || mode === 'both') {
      if (!selectedDriverId) {
        setErrorMsg('Please select a driver to reassign');
        return;
      }
      payload.driver_id = selectedDriverId;
    }

    if (mode === 'truck' || mode === 'both') {
      if (!selectedVehicleId) {
        setErrorMsg('Please select a truck to reassign');
        return;
      }
      payload.vehicle_id = selectedVehicleId;
    }

    if (!payload.driver_id && !payload.vehicle_id) {
      setErrorMsg('Please select at least one asset to reassign');
      return;
    }

    reassignMutation.mutate(payload);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg w-[95vw] p-0 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-2xl bg-white dark:bg-slate-900">
        <DialogHeader className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 flex flex-col gap-1">
          <DialogTitle className="text-base font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-brand" />
            Reassign Trip Assets
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">
            Trip #{trip?.ref_id || trip?.id?.slice(0, 8)} • Reassign driver, truck, or both
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Mode Selector Tabs */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Reassignment Target
            </label>
            <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
              <button
                type="button"
                onClick={() => setMode('driver')}
                className={`flex items-center justify-center gap-1.5 py-2 px-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  mode === 'driver'
                    ? 'bg-white dark:bg-slate-900 text-brand shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <User size={13} />
                Reassign Driver
              </button>
              <button
                type="button"
                onClick={() => setMode('truck')}
                className={`flex items-center justify-center gap-1.5 py-2 px-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  mode === 'truck'
                    ? 'bg-white dark:bg-slate-900 text-brand shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Truck size={13} />
                Reassign Truck
              </button>
              <button
                type="button"
                onClick={() => setMode('both')}
                className={`flex items-center justify-center gap-1.5 py-2 px-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  mode === 'both'
                    ? 'bg-white dark:bg-slate-900 text-brand shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <RefreshCw size={13} />
                Reassign Both
              </button>
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 text-xs font-semibold text-red-700 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl flex items-center gap-2">
              <AlertCircle size={15} className="shrink-0 text-red-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Driver Selection Field */}
          {(mode === 'driver' || mode === 'both') && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <User size={13} className="text-violet-600" />
                  Select New Driver
                </label>
                {trip?.driver && (
                  <span className="text-[11px] text-slate-500">
                    Current: <strong className="text-slate-800 dark:text-slate-200">{trip.driver.first_name} {trip.driver.last_name}</strong>
                  </span>
                )}
              </div>
              <Combobox
                options={driverOptions}
                value={selectedDriverId}
                onChange={(val) => {
                  setSelectedDriverId(val);
                  setErrorMsg(null);
                }}
                placeholder={isLoadingDrivers ? 'Loading available drivers...' : 'Select driver...'}
                searchPlaceholder="Search available drivers..."
                emptyText="No available drivers found."
              />
            </div>
          )}

          {/* Truck Selection Field */}
          {(mode === 'truck' || mode === 'both') && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Truck size={13} className="text-amber-600" />
                  Select New Truck / Vehicle
                </label>
                {trip?.vehicle && (
                  <span className="text-[11px] text-slate-500">
                    Current: <strong className="text-slate-800 dark:text-slate-200">{trip.vehicle.plate_number}</strong>
                  </span>
                )}
              </div>
              <Combobox
                options={vehicleOptions}
                value={selectedVehicleId}
                onChange={(val) => {
                  setSelectedVehicleId(val);
                  setErrorMsg(null);
                }}
                placeholder={isLoadingVehicles ? 'Loading available trucks...' : 'Select truck...'}
                searchPlaceholder="Search available trucks..."
                emptyText="No available trucks found."
              />
            </div>
          )}

          <DialogFooter className="pt-2 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              className="h-9 px-4 rounded-xl text-xs font-semibold"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={reassignMutation.isPending}
              className="h-9 px-4 rounded-xl bg-brand hover:bg-brand-hover text-white text-xs font-bold gap-1.5 cursor-pointer"
            >
              {reassignMutation.isPending ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Reassigning...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {mode === 'driver' ? 'Reassign Driver' : mode === 'truck' ? 'Reassign Truck' : 'Reassign Both'}
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
